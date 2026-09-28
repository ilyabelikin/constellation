// Wire protocol between the browser client and the game server (JSON over
// a single WebSocket at /ws). Shared by both sides.

import type { GameSettings, SimEvent } from "../sim/types";
import type { PlayerView, StaticView } from "../sim/view";

export const PROTOCOL_VERSION = 1;
/** Real-time speed multipliers: game days per real second (index 0 = paused). */
export const SPEEDS = [0, 1, 2, 4, 8];

export interface SeatInfo {
  empireId: string;
  empireName: string;
  color: string;
  speciesId: string;
  playerName: string | null; // null = AI-controlled
  online: boolean;
  isHost: boolean;
  alive: boolean;
}

export interface SessionInfo {
  id: string;
  code: string;
  name: string;
  status: "lobby" | "running" | "finished";
  hostName: string;
  youAreHost: boolean;
  yourEmpireId: string | null;
  seats: SeatInfo[];
  speedIndex: number;
  paused: boolean;
  day: number;
}

export interface SessionSummary {
  id: string;
  code: string;
  name: string;
  status: SessionInfo["status"];
  day: number;
  empireName: string | null;
  humans: number;
  online: number;
  updatedAt: number;
}

export interface CloudSaveSummary {
  id: string;
  name: string;
  day: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  sessionId: string | null;
  from: string; // empire id
  to: string; // empire id
  text: string;
  day: number;
  at: number;
  /** A concrete diplomatic action attached to the message (LLM or human). */
  action?: DiplomaticAction | null;
}

export type DiplomaticAction =
  | { kind: "propose_peace" }
  | { kind: "accept_peace" }
  | { kind: "declare_war" }
  | { kind: "none" };

export type ClientMessage =
  | { t: "hello"; uuid?: string | null; name?: string; protocol: number }
  | { t: "setName"; name: string }
  | { t: "create"; settings: Partial<GameSettings>; sessionName?: string }
  | { t: "join"; code: string }
  | { t: "takeSeat"; empireId: string }
  | { t: "start" }
  | { t: "leave" }
  | { t: "cmd"; id: number; name: string; args: unknown[] }
  | { t: "speed"; index: number }
  | { t: "mySessions" }
  | { t: "cloudSave"; name: string; data: string }
  | { t: "cloudList" }
  | { t: "cloudLoad"; id: string }
  | { t: "cloudDelete"; id: string }
  | { t: "chat"; to: string; text: string; sessionId?: string | null; state?: string | null }
  | { t: "ping" };

export type ServerMessage =
  | { t: "welcome"; uuid: string; name: string; llm: boolean }
  | { t: "error"; message: string }
  | { t: "session"; info: SessionInfo }
  | { t: "left" }
  | { t: "static"; data: StaticView }
  | { t: "view"; data: PlayerView; events: SimEvent[] }
  | { t: "cmdResult"; id: number; ok: boolean; error?: string }
  | { t: "sessions"; list: SessionSummary[] }
  | { t: "cloudSaves"; list: CloudSaveSummary[] }
  | { t: "cloudData"; id: string; data: string }
  | { t: "cloudSaved"; id: string }
  | { t: "chat"; message: ChatMessage }
  | { t: "chatHistory"; messages: ChatMessage[] }
  | { t: "pong" };
