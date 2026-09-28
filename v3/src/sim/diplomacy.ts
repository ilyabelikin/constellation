// Diplomacy beyond war and peace: tribute, ceding colonies and formal
// demands. Used by human players (commands) and by LLM-voiced rulers.

import { ensureCapital } from "./fleets";
import { empirePower } from "./ai";
import { makePeace, declareWar } from "./commands";
import { hasMet } from "./knowledge";
import { acquaintances, logTo } from "./util";
import { agreeTrade, cancelTrade } from "./trade";
import type { CommandResult } from "./api";
import type { Demand, DiploAction, GameState, ResourceKey } from "./types";
import { RESOURCE_KEYS } from "./types";

const OK: CommandResult = { ok: true };
const fail = (error: string): CommandResult => ({ ok: false, error });

export const RESOURCE_LABEL: Record<ResourceKey, string> = { credits: "credits", metals: "metals", energy: "energy", exotics: "exotics" };

export function isResource(v: unknown): v is ResourceKey {
  return typeof v === "string" && (RESOURCE_KEYS as readonly string[]).includes(v);
}

/** Send resources to another empire. */
export function sendTribute(state: GameState, fromId: string, toId: string, resource: ResourceKey, amount: number): CommandResult {
  const from = state.empires[fromId];
  const to = state.empires[toId];
  if (!from || !to || from === to || to.isPirate || !to.alive) return fail("Invalid recipient");
  if (!hasMet(state, fromId, toId)) return fail("We have not met them yet");
  if (!isResource(resource)) return fail("Unknown resource");
  amount = Math.floor(amount);
  if (!(amount > 0)) return fail("Nothing to send");
  if (from.resources[resource] < amount) return fail(`Not enough ${RESOURCE_LABEL[resource]}`);
  from.resources[resource] -= amount;
  to.resources[resource] += amount;
  logTo(state, "diplomacy", `The ${from.name} sent ${amount} ${RESOURCE_LABEL[resource]} to the ${to.name}.`, [fromId, toId]);
  return OK;
}

/** Hand a colony (not the capital) over to another empire. */
export function cedeColony(state: GameState, fromId: string, colonyId: string, toId: string): CommandResult {
  const from = state.empires[fromId];
  const to = state.empires[toId];
  const c = state.colonies[colonyId];
  if (!from || !to || from === to || to.isPirate || !to.alive) return fail("Invalid recipient");
  if (!c || c.empireId !== fromId) return fail("Not our colony");
  if (c.capital) return fail("We will never give up our capital");
  if (!hasMet(state, fromId, toId)) return fail("We have not met them yet");
  c.empireId = toId;
  c.queue = [];
  c.capital = false;
  to.explored[c.systemId] = true;
  ensureCapital(state, fromId);
  ensureCapital(state, toId);
  logTo(state, "diplomacy", `The ${from.name} ceded ${c.name} to the ${to.name}.`, [...acquaintances(state, fromId), ...acquaintances(state, toId), fromId, toId]);
  return OK;
}

function describeDemand(state: GameState, d: Demand): string {
  return d.kind === "colony" ? `the colony of ${state.colonies[d.colonyId]?.name ?? "?"}` : `${d.amount} ${RESOURCE_LABEL[d.resource]}`;
}

/** Formally demand a colony or tribute; the target answers with accept/reject. */
export function makeDemand(state: GameState, fromId: string, toId: string, demand: Demand): CommandResult {
  const from = state.empires[fromId];
  const to = state.empires[toId];
  if (!from || !to || from === to || to.isPirate || !to.alive) return fail("Invalid target");
  if (!hasMet(state, fromId, toId)) return fail("We have not met them yet");
  if (demand.kind === "colony") {
    const c = state.colonies[demand.colonyId];
    if (!c || c.empireId !== toId) return fail("That colony is not theirs");
    if (c.capital) return fail("They will never give up their capital");
  } else if (!isResource(demand.resource) || !(demand.amount > 0)) return fail("Invalid tribute");
  (to.demands ??= {})[fromId] = { ...demand, day: state.day };
  logTo(state, "diplomacy", `The ${from.name} demands ${describeDemand(state, demand)} from the ${to.name}.`, [fromId, toId]);
  return OK;
}

export function acceptDemand(state: GameState, empireId: string, fromId: string): CommandResult {
  const me = state.empires[empireId];
  const d = me?.demands?.[fromId];
  if (!d) return fail("No demand from them");
  const r = d.kind === "colony" ? cedeColony(state, empireId, d.colonyId, fromId) : sendTribute(state, empireId, fromId, d.resource, d.amount);
  if (r.ok) delete me.demands![fromId];
  return r;
}

export function rejectDemand(state: GameState, empireId: string, fromId: string): CommandResult {
  const me = state.empires[empireId];
  const d = me?.demands?.[fromId];
  if (!d) return fail("No demand from them");
  delete me.demands![fromId];
  logTo(state, "diplomacy", `The ${me.name} refused to give ${describeDemand(state, d)} to the ${state.empires[fromId].name}.`, [empireId, fromId]);
  return OK;
}

/** Days a war must last before an AI ruler may simply agree to end it in conversation. */
export const MIN_WAR_DAYS_FOR_TALKED_PEACE = 15;

/**
 * Carry out a diplomatic act chosen by an AI ruler (LLM) towards `partnerId`,
 * within guard rails: a clever message cannot talk a ruler into giving away
 * more than its situation justifies.
 */
export function aiDiplomaticAction(state: GameState, aiId: string, partnerId: string, action: DiploAction): CommandResult {
  const me = state.empires[aiId];
  const other = state.empires[partnerId];
  if (!me?.ai || !other || other.isPirate || !hasMet(state, aiId, partnerId)) return fail("Invalid partner");
  const ratio = (empirePower(state, partnerId) + 1) / (empirePower(state, aiId) + 1); // their strength vs ours
  const atWar = me.relations[partnerId] === "war";
  const warDays = state.day - (me.ai.warStarted?.[partnerId] ?? state.day - 999);
  switch (action.kind) {
    case "none":
      return OK;
    case "accept_peace":
      if (!atWar) return fail("Not at war");
      if (warDays < MIN_WAR_DAYS_FOR_TALKED_PEACE && ratio < 2) return fail("Too soon");
      delete me.peaceOffers?.[partnerId];
      return makePeace(state, aiId, partnerId);
    case "propose_peace": {
      if (!atWar) return fail("Not at war");
      if (!other.ai) {
        (other.peaceOffers ??= {})[aiId] = state.day;
        (me.ai.peaceProposedAt ??= {})[partnerId] = state.day;
        logTo(state, "diplomacy", `The ${me.name} proposes peace. Accept it in the Empires screen.`, [partnerId, aiId]);
        return OK;
      }
      return makePeace(state, aiId, partnerId);
    }
    case "declare_war": {
      if (atWar) return fail("Already at war");
      const r = declareWar(state, aiId, partnerId);
      if (r.ok) me.ai.warCooldown = 150;
      return r;
    }
    case "offer_tribute": {
      if (!isResource(action.resource)) return fail("Unknown resource");
      const cap = Math.min(500, Math.floor(me.resources[action.resource] * (ratio > 1.5 ? 0.35 : 0.2)));
      const amount = Math.min(cap, Math.floor(action.amount ?? 0));
      if (amount <= 0) return fail("Cannot spare that");
      return sendTribute(state, aiId, partnerId, action.resource, amount);
    }
    case "cede_colony": {
      const c = action.colonyId ? state.colonies[action.colonyId] : null;
      if (!c || c.empireId !== aiId || c.capital) return fail("Not a colony we can give");
      // Only under real pressure: facing a much stronger rival, or losing a war.
      if (!(ratio >= 1.5 || (atWar && ratio >= 1.1 && warDays >= 20))) return fail("We are not that desperate");
      return cedeColony(state, aiId, c.id, partnerId);
    }
    case "demand_tribute":
      if (!isResource(action.resource)) return fail("Unknown resource");
      return makeDemand(state, aiId, partnerId, { kind: "tribute", resource: action.resource, amount: Math.max(1, Math.min(2000, Math.floor(action.amount ?? 100))), day: state.day });
    case "propose_trade":
      if (atWar || other.tradePartners?.[aiId] !== undefined) return fail("Not now");
      if (!other.ai) {
        (other.tradeOffers ??= {})[aiId] = state.day;
        logTo(state, "diplomacy", `The ${me.name} proposes a trade agreement. Accept it in the Empires screen.`, [partnerId, aiId]);
        return OK;
      }
      return agreeTrade(state, aiId, partnerId);
    case "accept_trade":
      // Agreed in conversation (or answering a formal offer).
      delete me.tradeOffers?.[partnerId];
      return agreeTrade(state, aiId, partnerId);
    case "cancel_trade":
      return cancelTrade(state, aiId, partnerId);
    case "demand_colony": {
      const c = action.colonyId ? state.colonies[action.colonyId] : null;
      if (!c || !me.explored[c.systemId]) return fail("Unknown colony");
      return makeDemand(state, aiId, partnerId, { kind: "colony", colonyId: c.id, day: state.day });
    }
  }
  return fail("Unknown action");
}
