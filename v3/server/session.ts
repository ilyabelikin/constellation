// A hosted multiplayer game: the authoritative Game, who sits in which empire,
// the shared clock, and per-player fog-of-war snapshots.

import { randomUUID } from "node:crypto";
import { Game, STEP_DAYS } from "../src/sim/game";
import type { GameSettings, SimEvent } from "../src/sim/types";
import { filterEvents, playerView, staticView } from "../src/sim/view";
import { SPEEDS, type ChatMessage, type ServerMessage, type SessionInfo, type SessionSummary } from "../src/net/protocol";
import type { Db } from "./db";

export interface Conn {
  uuid: string;
  name: string;
  sessionId: string | null;
  staticSentFor: string | null;
  lastChatAt?: number;
  lastAutoChatAt?: number;
  send(msg: ServerMessage): void;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const VIEW_INTERVAL_MS = 250;
const SAVE_INTERVAL_MS = 30_000;
const MAX_STEPS_PER_TICK = 40;

export function makeCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

export class Session {
  readonly clients = new Set<Conn>();
  /** empireId → player uuid for human-controlled empires. */
  readonly seats = new Map<string, string>();
  chats: ChatMessage[] = [];
  private acc = 0;
  private sinceView = 0;
  private sinceSave = 0;
  private pendingEvents: SimEvent[] = [];
  lastActivity = Date.now();
  /** Hook for LLM rivals and other observers of each simulated batch. */
  onEvents: ((events: SimEvent[]) => void) | null = null;
  /** Called after every clock tick (LLM rulers schedule their work here). */
  afterTick: (() => void) | null = null;

  constructor(
    private db: Db,
    readonly id: string,
    readonly code: string,
    readonly name: string,
    readonly hostUuid: string,
    public status: "lobby" | "running" | "finished",
    public speedIndex: number,
    readonly game: Game,
  ) {}

  static create(db: Db, hostUuid: string, settings: Partial<GameSettings>, name: string): Session {
    const game = Game.create(settings);
    // Every major empire starts AI-controlled except the host's.
    for (const e of Object.values(game.state.empires)) e.isPlayer = e.id === game.state.playerId;
    let code = makeCode();
    while (db.sessionByCode(code)) code = makeCode();
    const s = new Session(db, randomUUID(), code, name, hostUuid, "lobby", 1, game);
    s.seats.set(game.state.playerId, hostUuid);
    db.createSession({ id: s.id, code, name, host_uuid: hostUuid, status: "lobby", day: 0, speed_index: 1 }, game.serialize());
    db.setSeat(s.id, game.state.playerId, hostUuid);
    return s;
  }

  static load(db: Db, id: string): Session | null {
    const row = db.sessionById(id);
    const data = db.sessionState(id);
    if (!row || !data) return null;
    const game = Game.deserialize(data.state);
    const s = new Session(db, row.id, row.code, row.name, row.host_uuid, row.status, row.speed_index, game);
    for (const seat of db.seats(id)) s.seats.set(seat.empire_id, seat.uuid);
    try {
      s.chats = JSON.parse(data.chats) as ChatMessage[];
    } catch {
      s.chats = [];
    }
    return s;
  }

  seatOf(uuid: string): string | null {
    for (const [empireId, owner] of this.seats) if (owner === uuid) return empireId;
    return null;
  }

  onlineSeated(): number {
    let n = 0;
    for (const c of this.clients) if (this.seatOf(c.uuid)) n++;
    return n;
  }

  /** The clock runs only when the game has started, isn't paused, and a seated human is online. */
  get running(): boolean {
    return this.status === "running" && this.speedIndex > 0 && this.onlineSeated() > 0 && !this.game.state.winner;
  }

  addClient(conn: Conn): void {
    this.clients.add(conn);
    conn.sessionId = this.id;
    conn.staticSentFor = null;
    this.lastActivity = Date.now();
    this.broadcastInfo();
    this.sendViewTo(conn, []);
  }

  removeClient(conn: Conn): void {
    this.clients.delete(conn);
    if (conn.sessionId === this.id) conn.sessionId = null;
    this.lastActivity = Date.now();
    this.broadcastInfo();
    if (this.onlineSeated() === 0) this.save();
  }

  takeSeat(uuid: string, empireId: string): string | null {
    if (this.seatOf(uuid)) return "You already control an empire in this game";
    const e = this.game.state.empires[empireId];
    if (!e || e.isPirate || !e.alive) return "That empire is not available";
    if (this.seats.has(empireId)) return "Another player controls that empire";
    e.isPlayer = true;
    e.ai = null;
    // Like in a single-player start, a new ruler's scout sets out exploring on its own.
    if (this.game.state.day < 1)
      for (const f of Object.values(this.game.state.fleets)) if (f.empireId === empireId && f.ships.some((sh) => sh.hull === "scout")) f.autoExplore = true;
    this.seats.set(empireId, uuid);
    this.db.setSeat(this.id, empireId, uuid);
    this.lastActivity = Date.now();
    this.broadcastInfo();
    for (const c of this.clients) if (c.uuid === uuid) this.sendViewTo(c, []);
    return null;
  }

  start(uuid: string): string | null {
    if (uuid !== this.hostUuid) return "Only the host can start the game";
    if (this.status !== "lobby") return "The game has already started";
    this.status = "running";
    this.broadcastInfo();
    this.save();
    return null;
  }

  setSpeed(uuid: string, index: number): string | null {
    if (!Number.isInteger(index) || index < 0 || index >= SPEEDS.length) return "Bad speed";
    // Anyone seated may pause; only the host may resume or change speed.
    if (index !== 0 && uuid !== this.hostUuid) return "Only the host can change the game speed";
    if (!this.seatOf(uuid) && uuid !== this.hostUuid) return "Spectators cannot control time";
    this.speedIndex = index;
    this.broadcastInfo();
    return null;
  }

  command(uuid: string, name: string, args: unknown[]): { ok: boolean; error?: string } {
    const empireId = this.seatOf(uuid);
    if (!empireId) return { ok: false, error: "You are not controlling an empire" };
    if (this.status !== "running") return { ok: false, error: "The game hasn't started yet" };
    const r = this.game.execFor(empireId, name, args);
    this.lastActivity = Date.now();
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }

  /** Advance the clock by `dtMs` of real time; broadcast views when due. */
  tick(dtMs: number): void {
    if (this.running) {
      this.acc += (dtMs / 1000) * SPEEDS[this.speedIndex];
      let steps = 0;
      while (this.acc >= STEP_DAYS && steps < MAX_STEPS_PER_TICK) {
        this.game.step();
        this.acc -= STEP_DAYS;
        steps++;
      }
      if (steps >= MAX_STEPS_PER_TICK) this.acc = 0;
      const events = this.game.drainEvents();
      if (events.length) {
        this.pendingEvents.push(...events);
        this.onEvents?.(events);
      }
      if (this.game.state.winner && this.status === "running") {
        this.status = "finished";
        this.broadcastInfo();
        this.save();
      }
    }
    this.afterTick?.();
    this.sinceView += dtMs;
    if (this.sinceView >= VIEW_INTERVAL_MS) {
      this.sinceView = 0;
      const events = this.pendingEvents;
      this.pendingEvents = [];
      for (const c of this.clients) this.sendViewTo(c, events);
    }
    this.sinceSave += dtMs;
    if (this.sinceSave >= SAVE_INTERVAL_MS && this.running) this.save();
  }

  sendViewTo(conn: Conn, events: SimEvent[]): void {
    const empireId = this.seatOf(conn.uuid);
    if (!empireId) return; // spectators in the lobby only see session info
    if (conn.staticSentFor !== this.id) {
      conn.send({ t: "static", data: staticView(this.game.state) });
      conn.send({ t: "chatHistory", messages: this.chats.filter((m) => m.from === empireId || m.to === empireId) });
      conn.staticSentFor = this.id;
    }
    const state = this.game.state;
    conn.send({ t: "view", data: playerView(state, empireId), events: filterEvents(state, empireId, events) });
  }

  info(forUuid: string): SessionInfo {
    const state = this.game.state;
    const online = new Set([...this.clients].map((c) => c.uuid));
    const seats = Object.values(state.empires)
      .filter((e) => !e.isPirate)
      .map((e) => {
        const owner = this.seats.get(e.id) ?? null;
        return {
          empireId: e.id,
          empireName: e.name,
          color: e.color,
          speciesId: e.speciesId,
          playerName: owner ? (this.db.playerName(owner) ?? "Player") : null,
          online: !!owner && online.has(owner),
          isHost: owner === this.hostUuid,
          alive: e.alive,
        };
      });
    return {
      id: this.id,
      code: this.code,
      name: this.name,
      status: this.status,
      hostName: this.db.playerName(this.hostUuid) ?? "Host",
      youAreHost: forUuid === this.hostUuid,
      yourEmpireId: this.seatOf(forUuid),
      seats,
      speedIndex: this.speedIndex,
      paused: !this.running,
      day: state.day,
    };
  }

  broadcastInfo(): void {
    for (const c of this.clients) c.send({ t: "session", info: this.info(c.uuid) });
  }

  summaryFor(uuid: string): SessionSummary {
    const empireId = this.seatOf(uuid);
    return {
      id: this.id,
      code: this.code,
      name: this.name,
      status: this.status,
      day: this.game.state.day,
      empireName: empireId ? this.game.state.empires[empireId].name : null,
      humans: this.seats.size,
      online: this.onlineSeated(),
      updatedAt: Date.now(),
    };
  }

  addChat(message: ChatMessage): void {
    this.chats.push(message);
    if (this.chats.length > 500) this.chats.splice(0, this.chats.length - 500);
    for (const c of this.clients) {
      const seat = this.seatOf(c.uuid);
      if (seat && (seat === message.to || seat === message.from)) c.send({ t: "chat", message });
    }
  }

  save(): void {
    this.sinceSave = 0;
    this.db.saveSession(this.id, this.status, this.game.state.day, this.speedIndex, this.game.serialize(), JSON.stringify(this.chats));
  }
}
