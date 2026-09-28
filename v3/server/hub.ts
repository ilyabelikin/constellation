// Connection hub: players, sessions in memory, cloud saves and message
// routing. Transport-agnostic (the WebSocket layer lives in index.ts), which
// keeps it easy to test.

import { randomUUID } from "node:crypto";
import type { ClientMessage, ServerMessage } from "../src/net/protocol";
import { PROTOCOL_VERSION } from "../src/net/protocol";
import { EMPIRE_COLORS } from "../src/sim/galaxy";
import { SPECIES_MAP } from "../src/sim/data/structures";
import type { GameSettings } from "../src/sim/types";
import type { Db } from "./db";
import { Session, type Conn } from "./session";

export const MAX_CLOUD_SAVES = 12;
export const MAX_SAVE_BYTES = 6 * 1024 * 1024;
const SESSION_IDLE_UNLOAD_MS = 10 * 60_000;
const UUID_RE = /^[0-9a-f-]{36}$/i;

export interface HubOptions {
  /** Called when a session is created or loaded (the LLM layer attaches here). */
  onSessionLoaded?: (session: Session) => void;
  /** Handles chat messages (LLM replies, human relay). */
  onChat?: (conn: Conn, msg: Extract<ClientMessage, { t: "chat" }>, session: Session | null) => void;
  llmEnabled?: boolean;
}

function cleanName(name: unknown, fallback: string): string {
  if (typeof name !== "string") return fallback;
  const n = name.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 32);
  return n || fallback;
}

/** Only accept known settings, clamped to sane ranges. */
export function sanitizeSettings(raw: unknown): Partial<GameSettings> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Partial<GameSettings> = {};
  if (typeof r.seed === "string") out.seed = r.seed.slice(0, 40);
  if (typeof r.systemCount === "number") out.systemCount = Math.max(12, Math.min(64, Math.round(r.systemCount)));
  if (typeof r.aiCount === "number") out.aiCount = Math.max(1, Math.min(7, Math.round(r.aiCount)));
  if (typeof r.playerName === "string") out.playerName = cleanName(r.playerName, "Empire");
  if (typeof r.playerSpecies === "string" && SPECIES_MAP[r.playerSpecies]) out.playerSpecies = r.playerSpecies;
  if (typeof r.playerColor === "string" && EMPIRE_COLORS.includes(r.playerColor)) out.playerColor = r.playerColor;
  if (r.difficulty === "easy" || r.difficulty === "normal" || r.difficulty === "hard") out.difficulty = r.difficulty;
  if (typeof r.pirates === "boolean") out.pirates = r.pirates;
  return out;
}

export class Hub {
  readonly sessions = new Map<string, Session>();
  readonly conns = new Set<Conn>();
  /** Set during shutdown: late socket events must not touch the closed database. */
  stopped = false;

  constructor(
    readonly db: Db,
    private opts: HubOptions = {},
  ) {}

  connect(send: (msg: ServerMessage) => void): Conn {
    const conn: Conn = { uuid: "", name: "", sessionId: null, staticSentFor: null, send };
    this.conns.add(conn);
    return conn;
  }

  disconnect(conn: Conn): void {
    this.conns.delete(conn);
    if (this.stopped) return;
    const s = conn.sessionId ? this.sessions.get(conn.sessionId) : null;
    s?.removeClient(conn);
  }

  /** Load a session into memory (or return the live one). */
  session(id: string): Session | null {
    let s = this.sessions.get(id) ?? null;
    if (!s) {
      s = Session.load(this.db, id);
      if (s) {
        this.sessions.set(id, s);
        this.opts.onSessionLoaded?.(s);
      }
    }
    return s;
  }

  tick(dtMs: number): void {
    const now = Date.now();
    for (const s of this.sessions.values()) {
      s.tick(dtMs);
      if (s.clients.size === 0 && now - s.lastActivity > SESSION_IDLE_UNLOAD_MS) {
        s.save();
        this.sessions.delete(s.id);
      }
    }
  }

  saveAll(): void {
    for (const s of this.sessions.values()) s.save();
  }

  handle(conn: Conn, raw: unknown): void {
    const msg = raw as ClientMessage;
    if (!msg || typeof msg !== "object" || typeof (msg as { t?: unknown }).t !== "string") return conn.send({ t: "error", message: "Malformed message" });
    if (msg.t === "hello") return this.hello(conn, msg);
    if (!conn.uuid) return conn.send({ t: "error", message: "Say hello first" });
    const current = conn.sessionId ? this.sessions.get(conn.sessionId) ?? null : null;
    switch (msg.t) {
      case "ping":
        return conn.send({ t: "pong" });
      case "setName":
        conn.name = cleanName(msg.name, conn.name);
        this.db.upsertPlayer(conn.uuid, conn.name);
        current?.broadcastInfo();
        return;
      case "create": {
        this.leave(conn);
        const settings = sanitizeSettings(msg.settings);
        const name = cleanName(msg.sessionName, `${conn.name}'s galaxy`);
        const s = Session.create(this.db, conn.uuid, settings, name);
        this.sessions.set(s.id, s);
        this.opts.onSessionLoaded?.(s);
        s.addClient(conn);
        return;
      }
      case "join": {
        const code = typeof msg.code === "string" ? msg.code.trim().toUpperCase().slice(0, 12) : "";
        const row = this.db.sessionByCode(code);
        const s = row ? this.session(row.id) : null;
        if (!s) return conn.send({ t: "error", message: "No game with that invite code" });
        if (current !== s) this.leave(conn);
        s.addClient(conn);
        return;
      }
      case "takeSeat": {
        if (!current) return conn.send({ t: "error", message: "Join a game first" });
        const err = current.takeSeat(conn.uuid, String(msg.empireId));
        if (err) conn.send({ t: "error", message: err });
        return;
      }
      case "start": {
        if (!current) return;
        const err = current.start(conn.uuid);
        if (err) conn.send({ t: "error", message: err });
        return;
      }
      case "leave":
        this.leave(conn);
        conn.send({ t: "left" });
        return;
      case "cmd": {
        if (!current) return conn.send({ t: "cmdResult", id: Number(msg.id) || 0, ok: false, error: "Not in a game" });
        const r = current.command(conn.uuid, String(msg.name), Array.isArray(msg.args) ? msg.args : []);
        conn.send({ t: "cmdResult", id: Number(msg.id) || 0, ok: r.ok, error: r.error });
        return;
      }
      case "speed": {
        if (!current) return;
        const err = current.setSpeed(conn.uuid, Number(msg.index));
        if (err) conn.send({ t: "error", message: err });
        return;
      }
      case "mySessions": {
        const list = this.db.sessionsForPlayer(conn.uuid).map((row) => {
          const live = this.sessions.get(row.id);
          if (live) return live.summaryFor(conn.uuid);
          return { id: row.id, code: row.code, name: row.name, status: row.status, day: row.day, empireName: null, humans: 0, online: 0, updatedAt: row.updated_at };
        });
        return conn.send({ t: "sessions", list });
      }
      case "cloudSave": {
        if (typeof msg.data !== "string" || msg.data.length > MAX_SAVE_BYTES) return conn.send({ t: "error", message: "Save is too large" });
        let day = 0;
        try {
          const parsed = JSON.parse(msg.data) as { day?: number; version?: number };
          day = Number(parsed.day) || 0;
        } catch {
          return conn.send({ t: "error", message: "Save data is corrupt" });
        }
        const existing = this.db.listSaves(conn.uuid);
        const name = cleanName(msg.name, "Cloud save");
        const same = existing.find((x) => x.name === name);
        if (!same && existing.length >= MAX_CLOUD_SAVES) this.db.deleteSave(existing[existing.length - 1].id, conn.uuid);
        const id = same?.id ?? randomUUID();
        this.db.putSave(id, conn.uuid, name, day, msg.data);
        conn.send({ t: "cloudSaved", id });
        return this.sendSaves(conn);
      }
      case "cloudList":
        return this.sendSaves(conn);
      case "cloudLoad": {
        const data = this.db.getSave(String(msg.id), conn.uuid);
        if (!data) return conn.send({ t: "error", message: "Save not found" });
        return conn.send({ t: "cloudData", id: String(msg.id), data });
      }
      case "cloudDelete":
        this.db.deleteSave(String(msg.id), conn.uuid);
        return this.sendSaves(conn);
      case "chat":
        return this.opts.onChat?.(conn, msg, current);
      default:
        return conn.send({ t: "error", message: "Unknown message" });
    }
  }

  private hello(conn: Conn, msg: Extract<ClientMessage, { t: "hello" }>): void {
    if (msg.protocol !== PROTOCOL_VERSION) return conn.send({ t: "error", message: "Please reload: the game has been updated" });
    const uuid = typeof msg.uuid === "string" && UUID_RE.test(msg.uuid) ? msg.uuid.toLowerCase() : randomUUID();
    conn.uuid = uuid;
    conn.name = cleanName(msg.name, this.db.playerName(uuid) ?? "Commander");
    this.db.upsertPlayer(uuid, conn.name);
    conn.send({ t: "welcome", uuid, name: conn.name, llm: !!this.opts.llmEnabled });
  }

  private leave(conn: Conn): void {
    const s = conn.sessionId ? this.sessions.get(conn.sessionId) : null;
    s?.removeClient(conn);
    conn.sessionId = null;
    conn.staticSentFor = null;
  }

  private sendSaves(conn: Conn): void {
    conn.send({ t: "cloudSaves", list: this.db.listSaves(conn.uuid).map((r) => ({ id: r.id, name: r.name, day: r.day, updatedAt: r.updated_at })) });
  }
}
