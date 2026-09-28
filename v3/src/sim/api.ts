// The command registry: every action a player (local, remote or AI-assisted)
// can take, with argument validation. The local Game, the multiplayer server
// and tests all execute commands through `execCommand`, so the rules are
// enforced in exactly one place and untrusted input can't reach the sim raw.

import { aiAcceptsPeace } from "./ai";
import * as cmd from "./commands";
import { colonyShipOptions } from "./planning";
import { acceptDemand, cedeColony, isResource, rejectDemand, sendTribute } from "./diplomacy";
import { acceptTrade, cancelTrade, proposeTrade, rejectTrade } from "./trade";
import { Rng } from "./rng";
import { log, logTo } from "./util";
import type { GameState, Stance, Vec3 } from "./types";

export type CommandResult = cmd.CommandResult & { fleetId?: string };

export const PEACE_PROPOSAL_COOLDOWN = 30;

type ArgKind = "id" | "optId" | "int" | "text" | "ids" | "target" | "stance" | "bool" | "amount" | "order";

interface CommandSpec {
  args: ArgKind[];
  run: (state: GameState, empireId: string, ...args: never[]) => CommandResult;
}

const MAX_ID = 64;

function validArg(kind: ArgKind, v: unknown): boolean {
  switch (kind) {
    case "id":
      return typeof v === "string" && v.length > 0 && v.length <= MAX_ID;
    case "optId":
      return v === undefined || v === null || (typeof v === "string" && v.length <= MAX_ID);
    case "int":
      return typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1000;
    case "text":
      return typeof v === "string" && v.length <= 200;
    case "ids":
      return Array.isArray(v) && v.length <= 500 && v.every((x) => typeof x === "string" && x.length <= MAX_ID);
    case "stance":
      return v === "aggressive" || v === "defensive" || v === "passive" || v === "evasive";
    case "bool":
      return v === undefined || v === null || typeof v === "boolean";
    case "order":
      return typeof v === "number" && Number.isInteger(v) && v >= -1 && v < 100;
    case "amount":
      return typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 1_000_000;
    case "target": {
      if (v === undefined || v === null) return true;
      if (typeof v !== "object") return false;
      const t = v as { bodyId?: unknown; pos?: unknown };
      if (t.bodyId !== undefined && !(typeof t.bodyId === "string" && t.bodyId.length <= MAX_ID)) return false;
      if (t.pos !== undefined) {
        const p = t.pos as Partial<Vec3>;
        if (typeof p !== "object" || !p) return false;
        for (const k of ["x", "y", "z"] as const) if (typeof p[k] !== "number" || !Number.isFinite(p[k]) || Math.abs(p[k]!) > 1e4) return false;
      }
      return true;
    }
  }
}

function proposePeace(state: GameState, fromId: string, targetId: string): CommandResult {
  const from = state.empires[fromId];
  const target = state.empires[targetId];
  if (!from || !target || target.isPirate) return { ok: false, error: "They will not negotiate" };
  if (from.relations[targetId] !== "war") return { ok: false, error: "Not at war" };
  if (!target.ai) {
    // A human rival decides for themselves.
    (target.peaceOffers ??= {})[fromId] = state.day;
    log(state, "diplomacy", `The ${from.name} proposes peace. Accept it in the Empires screen.`, targetId);
    log(state, "diplomacy", `Peace proposal sent to the ${target.name}.`, fromId);
    return { ok: true };
  }
  const until = target.ai.peaceRefusedUntil?.[fromId] ?? -1;
  if (state.day < until) return { ok: false, error: `${target.name} will not hear new proposals for ${Math.ceil(until - state.day)} days` };
  const rng = new Rng(state.rngState);
  const accepted = aiAcceptsPeace(state, target, fromId, rng);
  state.rngState = rng.state;
  if (!accepted) {
    (target.ai.peaceRefusedUntil ??= {})[fromId] = state.day + PEACE_PROPOSAL_COOLDOWN;
    log(state, "diplomacy", `${target.name} rejected our peace proposal.`, fromId);
    return { ok: false, error: `${target.name} rejected peace` };
  }
  return cmd.makePeace(state, fromId, targetId);
}

function acceptPeace(state: GameState, empireId: string, fromId: string): CommandResult {
  const me = state.empires[empireId];
  if (me?.peaceOffers?.[fromId] === undefined) return { ok: false, error: "No peace offer from them" };
  delete me.peaceOffers[fromId];
  return cmd.makePeace(state, empireId, fromId);
}

function rejectPeace(state: GameState, empireId: string, fromId: string): CommandResult {
  const me = state.empires[empireId];
  if (me?.peaceOffers?.[fromId] === undefined) return { ok: false, error: "No peace offer from them" };
  delete me.peaceOffers[fromId];
  logTo(state, "diplomacy", `The ${me.name} rejected the peace offer of the ${state.empires[fromId].name}.`, [empireId, fromId]);
  return { ok: true };
}

function buildColonyShipFor(state: GameState, empireId: string, bodyId: string, colonyId?: string | null): CommandResult {
  const options = colonyShipOptions(state, empireId, bodyId);
  const pick = colonyId ? options.find((o) => o.colonyId === colonyId) : options[0];
  if (!pick) return { ok: false, error: "No shipyard can reach that world" };
  return cmd.queueShip(state, empireId, pick.colonyId, "colony", { kind: "colonize", bodyId });
}

export const COMMANDS: Record<string, CommandSpec> = {
  queueBuilding: { args: ["id", "id"], run: (s, e, c: string, t: string) => cmd.queueBuilding(s, e, c, t) },
  queueShip: { args: ["id", "id"], run: (s, e, c: string, h: string) => cmd.queueShip(s, e, c, h) },
  buildColonyShipFor: { args: ["id", "optId"], run: (s, e, b: string, c?: string | null) => buildColonyShipFor(s, e, b, c) },
  cancelQueueItem: { args: ["id", "int", "optId"], run: (s, e, c: string, i: number, t?: string) => cmd.cancelQueueItem(s, e, c, i, t ?? undefined) },
  demolishBuilding: { args: ["id", "int"], run: (s, e, c: string, i: number) => cmd.demolishBuilding(s, e, c, i) },
  setResearch: { args: ["id"], run: (s, e, t: string) => cmd.setResearch(s, e, t) },
  moveFleet: {
    args: ["id", "id", "target", "bool"],
    run: (s, e, f: string, sys: string, t?: { bodyId?: string; pos?: Vec3 } | null, q?: boolean) => cmd.moveFleet(s, e, f, sys, t ?? {}, !!q),
  },
  colonize: { args: ["id", "id", "bool"], run: (s, e, f: string, b: string, q?: boolean) => cmd.colonizeOrder(s, e, f, b, !!q) },
  buildStation: { args: ["id", "id", "id", "bool"], run: (s, e, f: string, b: string, t: string, q?: boolean) => cmd.buildStationOrder(s, e, f, b, t, !!q) },
  invade: { args: ["id", "id", "bool"], run: (s, e, f: string, c: string, q?: boolean) => cmd.invadeOrder(s, e, f, c, !!q) },
  attackFleet: { args: ["id", "id"], run: (s, e, f: string, t: string) => cmd.attackFleetOrder(s, e, f, t) },
  stopFleet: { args: ["id"], run: (s, e, f: string) => cmd.stopFleet(s, e, f) },
  cancelFleetOrder: { args: ["id", "order", "optId"], run: (s, e, f: string, i: number, k?: string | null) => cmd.cancelFleetOrder(s, e, f, i, k) },
  setStance: { args: ["id", "stance"], run: (s, e, f: string, st: Stance) => cmd.setStance(s, e, f, st) },
  renameFleet: { args: ["id", "text"], run: (s, e, f: string, n: string) => cmd.renameFleet(s, e, f, n) },
  mergeFleets: { args: ["id", "id"], run: (s, e, a: string, b: string) => cmd.mergeFleetsCmd(s, e, a, b) },
  splitFleet: { args: ["id", "ids"], run: (s, e, f: string, ids: string[]) => cmd.splitFleet(s, e, f, ids) },
  declareWar: { args: ["id"], run: (s, e, t: string) => cmd.declareWar(s, e, t) },
  proposePeace: { args: ["id"], run: (s, e, t: string) => proposePeace(s, e, t) },
  acceptPeace: { args: ["id"], run: (s, e, t: string) => acceptPeace(s, e, t) },
  rejectPeace: { args: ["id"], run: (s, e, t: string) => rejectPeace(s, e, t) },
  sendTribute: { args: ["id", "id", "amount"], run: (s, e, to: string, res: string, n: number) => (isResource(res) ? sendTribute(s, e, to, res, n) : { ok: false, error: "Unknown resource" }) },
  cedeColony: { args: ["id", "id"], run: (s, e, c: string, to: string) => cedeColony(s, e, c, to) },
  acceptDemand: { args: ["id"], run: (s, e, from: string) => acceptDemand(s, e, from) },
  proposeTrade: { args: ["id"], run: (s, e, to: string) => proposeTrade(s, e, to) },
  acceptTrade: { args: ["id"], run: (s, e, from: string) => acceptTrade(s, e, from) },
  rejectTrade: { args: ["id"], run: (s, e, from: string) => rejectTrade(s, e, from) },
  cancelTrade: { args: ["id"], run: (s, e, other: string) => cancelTrade(s, e, other) },
  rejectDemand: { args: ["id"], run: (s, e, from: string) => rejectDemand(s, e, from) },
};

export type CommandName = keyof typeof COMMANDS;

/** Commands whose first argument is a fleet (civilian liners refuse them). */
const FLEET_COMMANDS = new Set(["moveFleet", "colonize", "buildStation", "invade", "attackFleet", "stopFleet", "cancelFleetOrder", "setStance", "renameFleet", "mergeFleets", "splitFleet"]);

/** Validate and execute a command on behalf of `empireId`. Never throws for bad input. */
export function execCommand(state: GameState, empireId: string, name: string, args: unknown[]): CommandResult {
  const spec = Object.prototype.hasOwnProperty.call(COMMANDS, name) ? COMMANDS[name] : undefined;
  if (!spec) return { ok: false, error: `Unknown command ${String(name).slice(0, 40)}` };
  if (!Array.isArray(args) || args.length > spec.args.length) return { ok: false, error: "Bad arguments" };
  for (let i = 0; i < spec.args.length; i++) if (!validArg(spec.args[i], args[i])) return { ok: false, error: "Bad arguments" };
  const empire = state.empires[empireId];
  if (!empire || !empire.alive) return { ok: false, error: "Your empire has fallen" };
  if (FLEET_COMMANDS.has(name)) {
    const fleetIds = name === "mergeFleets" ? [args[0], args[1]] : [args[0]];
    if (fleetIds.some((id) => state.fleets[id as string]?.civilian)) return { ok: false, error: "Private liners follow their own course" };
  }
  try {
    return (spec.run as (s: GameState, e: string, ...a: unknown[]) => CommandResult)(state, empireId, ...args);
  } catch (err) {
    return { ok: false, error: `Command failed: ${(err as Error).message}` };
  }
}
