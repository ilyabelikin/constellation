// Data exchanged with the LLM layer. Rivals only ever see a *briefing*: what
// their empire could plausibly know (see briefing.ts), never the full state.

import type { Branch } from "../sim/data/techs";

import type { Posture } from "../sim/types";
export type { Posture };
export const POSTURES: Posture[] = ["expand", "consolidate", "militarize", "attack", "defend"];

export interface RivalBrief {
  id: string;
  name: string;
  species: string;
  relation: "peace" | "war";
  /** Human-controlled (a real person reads our messages). */
  human: boolean;
  /** Military strength estimate, same scale as ours. */
  strength: number;
  /** Their colonies we know of (in systems we have explored). */
  knownColonies: number;
  sharesBorder: boolean;
  /** Days since the current war began (if at war). */
  warDays?: number;
  /** They have offered us peace and are waiting for an answer. */
  offeredPeace?: boolean;
}

export interface Briefing {
  day: number;
  empire: {
    id: string;
    name: string;
    species: string;
    personality: string;
    colonies: number;
    population: number;
    systemsOwned: number;
    totalSystems: number;
    exploredSystems: number;
    strength: number;
    resources: Record<string, number>;
    income: Record<string, number>;
    techs: number;
    researching: string | null;
  };
  rivals: RivalBrief[];
  /** Recent events this empire witnessed or was told about. */
  recent: string[];
  /** The strategy currently in force, if any. */
  current?: { posture: Posture; research: Branch | null; warTarget: string | null; summary: string };
}

export interface DecideRequest {
  briefing: Briefing;
  /** Why the ruler is being consulted now ("routine review", "first contact with …"). */
  trigger: string;
}

export interface DirectiveReply {
  posture: Posture;
  research: Branch | null;
  warTarget: string | null;
  seekPeace: string[];
  summary: string;
  /** In-character messages to human rulers (only sent at key moments). */
  messages: { to: string; text: string }[];
}

export type TalkAction = "none" | "accept_peace" | "propose_peace" | "declare_war";

export interface TalkRequest {
  briefing: Briefing;
  partnerId: string;
  /** Previous exchange with this partner, oldest first. */
  history: { from: "us" | "them"; text: string }[];
  text: string;
}

export interface TalkReply {
  reply: string;
  action: TalkAction;
}
