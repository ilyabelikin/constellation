// Wire protocol between the browser client and the game server (JSON over
// a single WebSocket at /ws). Shared by both sides.

import type { GameSettings, SimEvent } from "../sim/types";
import type { PlayerView, StaticView } from "../sim/view";
import type { DecideRequest, DirectiveReply, TalkReply, TalkRequest } from "../llm/types";

export const PROTOCOL_VERSION = 1;
/** Game days per real second for the 1×/2×/4×/8× buttons (index 0 = paused). 1× is a calm 0.6 days/s. */
export const SPEEDS = [0, 0.6, 1.2, 2.4, 4.8];

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

export type { ChatMessage } from "../sim/types";
import type { ChatMessage } from "../sim/types";

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
  | { t: "chat"; to: string; text: string }
  /** Single-player games run locally; their LLM rivals are served through the server (which holds the API key). */
  | { t: "llm"; id: number; kind: "decide"; req: DecideRequest }
  | { t: "llm"; id: number; kind: "talk"; req: TalkRequest }
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
  | { t: "llmResult"; id: number; ok: boolean; decide?: DirectiveReply; talk?: TalkReply; error?: string }
  | { t: "pong" };
