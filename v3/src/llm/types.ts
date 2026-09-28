// Data exchanged with the LLM layer. Rivals only ever see a *briefing*: what
// their empire could plausibly know (see briefing.ts), never the full state.

import type { Branch } from "../sim/data/techs";

import type { DiploAction, Posture } from "../sim/types";
export type { Posture };
export const POSTURES: Posture[] = ["expand", "consolidate", "militarize", "attack", "defend"];

/**
 * What a ruler knows, as sent to the model: a compact text dump plus the ids
 * the model may refer to (so its answers can be validated).
 */
export interface Briefing {
  day: number;
  empireId: string;
  empireName: string;
  speciesId: string;
  personaId: string;
  /** Compact, knowledge-limited situation report (see briefing.ts). */
  dump: string;
  rivals: { id: string; name: string; human: boolean; relation: "peace" | "war"; trade?: boolean }[];
  ownColonies: { id: string; name: string; capital: boolean }[];
  knownColonies: { id: string; name: string; ownerId: string }[];
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
  /** In-character messages to human rulers (at key moments), optionally with a demand or offer. */
  messages: { to: string; text: string; action: DiploAction }[];
}

export interface TalkRequest {
  briefing: Briefing;
  partnerId: string;
  /** Previous exchange with this partner, oldest first. */
  history: { from: "us" | "them"; text: string }[];
  text: string;
}

export interface TalkReply {
  reply: string;
  action: DiploAction;
}
