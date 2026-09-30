// Connection hub: players, sessions in memory, cloud saves and message
// routing. Transport-agnostic (the WebSocket layer lives in index.ts), which
// keeps it easy to test.

import { randomUUID } from "node:crypto";
import type { ClientMessage, ServerMessage } from "../src/net/protocol";
import { PROTOCOL_VERSION } from "../src/net/protocol";
import { EMPIRE_COLORS } from "../src/sim/galaxy";
import { SPECIES_MAP } from "../src/sim/data/structures";
import type { DiploAction, GameSettings } from "../src/sim/types";
import type { Db } from "./db";
import { Session, type Conn } from "./session";
import { hasMet } from "../src/sim/knowledge";
import { chatId } from "../src/llm/director";

export const MAX_CLOUD_SAVES = 12;
export const MAX_SAVE_BYTES = 6 * 1024 * 1024;
/**
 * A hosted game nobody has been connected to for this long is deleted: games
 * live only while someone plays them (the grace period covers dropped
 * connections and a tablet going to sleep).
 */
export const EMPTY_SESSION_TTL_MS = 10 * 60_000;
const UUID_RE = /^[0-9a-f-]{36}$/i;

export interface HubOptions {
  /** Called when a session is created or loaded (the LLM layer attaches here). */
  onSessionLoaded?: (session: Session) => void;
  /** A human ruler wrote to an AI-controlled empire (answered by the LLM layer). */
  aiChat?: (session: Session, fromEmpireId: string, toEmpireId: string, text: string, extra?: { auto?: boolean; action?: DiploAction }) => void;
  /** A single-player browser asks for a ruler decision or reply. */
  onLlmRequest?: (conn: Conn, msg: Extract<ClientMessage, { t: "llm" }>) => void;
  llmEnabled?: boolean;
}

/** Minimum milliseconds between chat messages from one connection. */
const CHAT_INTERVAL_MS = 1200;
/** Minimum milliseconds between automatic announcements of diplomatic acts. */
const AUTO_CHAT_INTERVAL_MS = 300;

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
    readonly opts: HubOptions = {},
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
      if (s.clients.size === 0 && now - s.lastActivity > EMPTY_SESSION_TTL_MS) {
        this.sessions.delete(s.id);
        this.db.deleteSession(s.id);
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
        const now = Date.now();
        const list = this.db.sessionsForPlayer(conn.uuid).flatMap((row) => {
          const live = this.sessions.get(row.id);
          if (live) return [live.summaryFor(conn.uuid)];
          // Not running and nobody in it: it was abandoned (e.g. before the server restarted).
          if (now - row.updated_at > EMPTY_SESSION_TTL_MS) {
            this.db.deleteSession(row.id);
            return [];
          }
          return [{ id: row.id, code: row.code, name: row.name, status: row.status, day: row.day, empireName: null, humans: 0, online: 0, updatedAt: row.updated_at }];
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
        return this.chat(conn, msg, current);
      case "llm":
        if (!this.opts.onLlmRequest) return conn.send({ t: "llmResult", id: Number(msg.id) || 0, ok: false, error: "AI diplomats are not available on this server" });
        return this.opts.onLlmRequest(conn, msg);
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

  /** Diplomatic messages: relayed between humans, answered by the LLM layer for AI rulers. */
  private chat(conn: Conn, msg: Extract<ClientMessage, { t: "chat" }>, session: Session | null): void {
    if (!session) return conn.send({ t: "error", message: "Join a game first" });
    const from = session.seatOf(conn.uuid);
    if (!from) return conn.send({ t: "error", message: "Take a seat to talk to other rulers" });
    const now = Date.now();
    const auto = msg.auto === true;
    // Announcements of acts follow the command that caused them, so they get their own (looser) limit.
    const last = auto ? conn.lastAutoChatAt : conn.lastChatAt;
    if (now - (last ?? 0) < (auto ? AUTO_CHAT_INTERVAL_MS : CHAT_INTERVAL_MS)) return conn.send({ t: "error", message: "Slow down — envoys need time to travel" });
    const state = session.game.state;
    const to = typeof msg.to === "string" ? msg.to : "";
    const target = state.empires[to];
    const text = typeof msg.text === "string" ? msg.text.replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, 500) : "";
    if (!target || target.isPirate || !target.alive || to === from) return conn.send({ t: "error", message: "No such ruler" });
    if (!text) return;
    if (!hasMet(state, from, to)) return conn.send({ t: "error", message: "We have not met them yet" });
    if (auto) conn.lastAutoChatAt = now;
    else conn.lastChatAt = now;
    const action = cleanAction(msg.action);
    const extra = auto ? { auto: true, ...(action ? { action } : {}) } : {};
    if (session.seats.has(to)) {
      session.addChat({ id: chatId(), from, to, text, day: state.day, at: now, ...extra });
      return;
    }
    if (!this.opts.aiChat) {
      if (auto) return; // nobody to tell
      return conn.send({ t: "error", message: "Their ruler does not answer (AI diplomats are offline)" });
    }
    this.opts.aiChat(session, from, to, text, extra);
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

const ACTION_KINDS = new Set<DiploAction["kind"]>([
  "accept_peace",
  "propose_peace",
  "declare_war",
  "offer_tribute",
  "cede_colony",
  "demand_tribute",
  "demand_colony",
  "propose_trade",
  "accept_trade",
  "cancel_trade",
]);
const RESOURCE_KEYS = new Set(["credits", "metals", "energy", "exotics"]);

/** The act a client says its announcement describes (display only; the act itself went through a command). */
function cleanAction(raw: unknown): DiploAction | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (!ACTION_KINDS.has(a.kind as DiploAction["kind"])) return null;
  const out: DiploAction = { kind: a.kind as DiploAction["kind"] };
  if (typeof a.resource === "string" && RESOURCE_KEYS.has(a.resource)) out.resource = a.resource as DiploAction["resource"];
  if (typeof a.amount === "number" && Number.isFinite(a.amount)) out.amount = Math.max(0, Math.min(1e6, Math.round(a.amount)));
  if (typeof a.colonyId === "string") out.colonyId = a.colonyId.slice(0, 64);
  return out;
}
