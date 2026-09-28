// Persistence for players, multiplayer sessions and cloud saves, using Node's
// built-in SQLite (no native build step on the server). Game states are
// stored gzip-compressed.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

export interface SessionRow {
  id: string;
  code: string;
  name: string;
  host_uuid: string;
  status: "lobby" | "running" | "finished";
  day: number;
  speed_index: number;
  updated_at: number;
}

export interface SeatRow {
  session_id: string;
  empire_id: string;
  uuid: string;
}

export class Db {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS players (
        uuid TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        seen_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        host_uuid TEXT NOT NULL,
        status TEXT NOT NULL,
        day REAL NOT NULL DEFAULT 0,
        speed_index INTEGER NOT NULL DEFAULT 1,
        state BLOB,
        chats BLOB,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS seats (
        session_id TEXT NOT NULL,
        empire_id TEXT NOT NULL,
        uuid TEXT NOT NULL,
        PRIMARY KEY (session_id, empire_id)
      );
      CREATE INDEX IF NOT EXISTS seats_by_uuid ON seats(uuid);
      CREATE TABLE IF NOT EXISTS saves (
        id TEXT PRIMARY KEY,
        uuid TEXT NOT NULL,
        name TEXT NOT NULL,
        day REAL NOT NULL,
        data BLOB NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS saves_by_uuid ON saves(uuid);
    `);
  }

  close(): void {
    this.db.close();
  }

  // ---- players ------------------------------------------------------------
  upsertPlayer(uuid: string, name: string): void {
    const now = Date.now();
    this.db
      .prepare("INSERT INTO players (uuid, name, created_at, seen_at) VALUES (?, ?, ?, ?) ON CONFLICT(uuid) DO UPDATE SET name = excluded.name, seen_at = excluded.seen_at")
      .run(uuid, name, now, now);
  }

  playerName(uuid: string): string | null {
    const row = this.db.prepare("SELECT name FROM players WHERE uuid = ?").get(uuid) as { name: string } | undefined;
    return row?.name ?? null;
  }

  // ---- sessions -----------------------------------------------------------
  createSession(row: Omit<SessionRow, "updated_at">, state: string): void {
    const now = Date.now();
    this.db
      .prepare("INSERT INTO sessions (id, code, name, host_uuid, status, day, speed_index, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(row.id, row.code, row.name, row.host_uuid, row.status, row.day, row.speed_index, gzipSync(state), now, now);
  }

  saveSession(id: string, status: string, day: number, speedIndex: number, state: string, chats: string): void {
    this.db
      .prepare("UPDATE sessions SET status = ?, day = ?, speed_index = ?, state = ?, chats = ?, updated_at = ? WHERE id = ?")
      .run(status, day, speedIndex, gzipSync(state), gzipSync(chats), Date.now(), id);
  }

  sessionByCode(code: string): SessionRow | null {
    return (this.db.prepare("SELECT id, code, name, host_uuid, status, day, speed_index, updated_at FROM sessions WHERE code = ?").get(code) as SessionRow | undefined) ?? null;
  }

  sessionById(id: string): SessionRow | null {
    return (this.db.prepare("SELECT id, code, name, host_uuid, status, day, speed_index, updated_at FROM sessions WHERE id = ?").get(id) as SessionRow | undefined) ?? null;
  }

  sessionState(id: string): { state: string; chats: string } | null {
    const row = this.db.prepare("SELECT state, chats FROM sessions WHERE id = ?").get(id) as { state: Uint8Array | null; chats: Uint8Array | null } | undefined;
    if (!row?.state) return null;
    return { state: gunzipSync(row.state).toString("utf8"), chats: row.chats ? gunzipSync(row.chats).toString("utf8") : "[]" };
  }

  setSeat(sessionId: string, empireId: string, uuid: string): void {
    this.db.prepare("INSERT OR REPLACE INTO seats (session_id, empire_id, uuid) VALUES (?, ?, ?)").run(sessionId, empireId, uuid);
  }

  seats(sessionId: string): SeatRow[] {
    return this.db.prepare("SELECT session_id, empire_id, uuid FROM seats WHERE session_id = ?").all(sessionId) as unknown as SeatRow[];
  }

  sessionsForPlayer(uuid: string): (SessionRow & { empire_id: string })[] {
    return this.db
      .prepare(
        "SELECT s.id, s.code, s.name, s.host_uuid, s.status, s.day, s.speed_index, s.updated_at, seats.empire_id FROM sessions s JOIN seats ON seats.session_id = s.id WHERE seats.uuid = ? ORDER BY s.updated_at DESC LIMIT 30",
      )
      .all(uuid) as unknown as (SessionRow & { empire_id: string })[];
  }

  // ---- cloud saves --------------------------------------------------------
  putSave(id: string, uuid: string, name: string, day: number, data: string): void {
    this.db
      .prepare("INSERT OR REPLACE INTO saves (id, uuid, name, day, data, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, uuid, name, day, gzipSync(data), Date.now());
  }

  listSaves(uuid: string): { id: string; name: string; day: number; updated_at: number }[] {
    return this.db.prepare("SELECT id, name, day, updated_at FROM saves WHERE uuid = ? ORDER BY updated_at DESC").all(uuid) as unknown as {
      id: string;
      name: string;
      day: number;
      updated_at: number;
    }[];
  }

  getSave(id: string, uuid: string): string | null {
    const row = this.db.prepare("SELECT data FROM saves WHERE id = ? AND uuid = ?").get(id, uuid) as { data: Uint8Array } | undefined;
    return row ? gunzipSync(row.data).toString("utf8") : null;
  }

  deleteSave(id: string, uuid: string): void {
    this.db.prepare("DELETE FROM saves WHERE id = ? AND uuid = ?").run(id, uuid);
  }

  countSaves(uuid: string): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM saves WHERE uuid = ?").get(uuid) as { n: number }).n;
  }
}
