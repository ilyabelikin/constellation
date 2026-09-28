// Merchant trade. Colonies with a Trade Hub send civilian freighters to other
// trade-hub colonies: our own, and those of empires we have a trade agreement
// with. A delivery pays credits to the sender (and a share to a foreign
// receiver); bigger markets and longer hauls are worth more, foreign trade
// most of all. Freighters are unarmed and can be caught by raiders or enemies.

import { aiAcceptsTrade } from "./ai";
import { findRoute, issueOrder } from "./fleets";
import { makeFleet, makeShip } from "./galaxy";
import { hasMet } from "./knowledge";
import { bodyPosition } from "./orbits";
import type { CommandResult } from "./api";
import type { Colony, Empire, Fleet, GameState } from "./types";
import { acquaintances, logTo } from "./util";

/** Days between departures from one trade hub. */
export const TRADE_INTERVAL = 25;
/** Longest haul a merchant will undertake (tunnel jumps). */
const MAX_HOPS = 6;
/** Share of a foreign delivery's value that the receiving empire also earns. */
export const RECEIVER_SHARE = 0.5;
/** Days to unload at the destination. */
export const TRADE_UNLOAD_DAYS = 2;

const hasHub = (c: Colony) => c.buildings.some((b) => b.type === "trade_hub");

export function isTradePartner(state: GameState, a: string, b: string): boolean {
  return state.empires[a]?.tradePartners?.[b] !== undefined;
}

/** Credits a run between two trade hubs is worth. */
export function tradeValue(from: Colony, to: Colony, hops: number, foreign: boolean): number {
  return (3 + 0.5 * Math.sqrt(Math.max(0, from.pop) * Math.max(0, to.pop))) * (1 + 0.3 * hops) * (foreign ? 1.6 : 1);
}

function destinations(state: GameState, from: Colony): { colony: Colony; value: number }[] {
  const owner = state.empires[from.empireId];
  const out: { colony: Colony; value: number }[] = [];
  for (const c of Object.values(state.colonies)) {
    if (c.id === from.id || !hasHub(c)) continue;
    const foreign = c.empireId !== owner.id;
    if (foreign && (!isTradePartner(state, owner.id, c.empireId) || !owner.explored[c.systemId])) continue;
    if (Object.values(state.battles).some((b) => b.systemId === c.systemId)) continue;
    const route = c.systemId === from.systemId ? [] : findRoute(state, from.systemId, c.systemId, owner);
    if (!route || route.length > MAX_HOPS) continue;
    out.push({ colony: c, value: tradeValue(from, c, route.length, foreign) });
  }
  return out;
}

/** Daily: trade hubs dispatch freighters. */
export function tradeDay(state: GameState): Fleet[] {
  const launched: Fleet[] = [];
  for (const e of Object.values(state.empires)) {
    // Average merchant income per day (smoothed over about a month).
    e.tradeRate = (e.tradeRate ?? 0) * 0.965 + (e.tradeToday ?? 0) * 0.035;
    e.tradeToday = 0;
  }
  for (const c of Object.values(state.colonies)) {
    if (!hasHub(c) || (c.nextTrade ?? 0) > state.day) continue;
    const owner = state.empires[c.empireId];
    if (!owner?.alive || owner.isPirate) continue;
    c.nextTrade = state.day + TRADE_INTERVAL;
    if (Object.values(state.battles).some((b) => b.systemId === c.systemId)) continue;
    const options = destinations(state, c);
    if (!options.length) continue;
    const best = options.reduce((a, b) => (b.value > a.value ? b : a));
    const f = makeFleet(state, owner, c.systemId, bodyPosition(state, state.bodies[c.bodyId]), `${c.name} Merchants`);
    f.ships.push(makeShip(state, owner, "freighter", `Freighter ${c.name}–${best.colony.name}`));
    f.civilian = true;
    f.stance = "passive";
    f.cargo = Math.round(best.value * 10) / 10;
    f.orbitBodyId = c.bodyId;
    if (issueOrder(state, f, { kind: "trade", systemId: best.colony.systemId, bodyId: best.colony.bodyId, colonyId: best.colony.id })) {
      delete state.fleets[f.id];
      continue;
    }
    launched.push(f);
  }
  return launched;
}

/** On arrival: unload, get paid, and the chartered freighter leaves play. */
export function deliverTrade(state: GameState, fleet: Fleet): void {
  const o = fleet.order!;
  const dest = o.colonyId ? state.colonies[o.colonyId] : undefined;
  const owner = state.empires[fleet.empireId];
  const value = fleet.cargo ?? 0;
  if (dest && owner?.alive) {
    pay(owner, value);
    if (dest.empireId !== owner.id && isTradePartner(state, owner.id, dest.empireId)) pay(state.empires[dest.empireId], value * RECEIVER_SHARE);
  }
  delete state.fleets[fleet.id];
}

function pay(e: Empire, credits: number): void {
  e.resources.credits += credits;
  e.tradeToday = (e.tradeToday ?? 0) + credits;
}

// ---------------------------------------------------------------------------
// Trade agreements

const OK: CommandResult = { ok: true };
const fail = (error: string): CommandResult => ({ ok: false, error });

function establish(state: GameState, a: string, b: string): void {
  (state.empires[a].tradePartners ??= {})[b] = state.day;
  (state.empires[b].tradePartners ??= {})[a] = state.day;
  delete state.empires[a].tradeOffers?.[b];
  delete state.empires[b].tradeOffers?.[a];
  logTo(state, "diplomacy", `The ${state.empires[a].name} and the ${state.empires[b].name} signed a trade agreement: merchants may now fly between their trade hubs.`, [...acquaintances(state, a), ...acquaintances(state, b), a, b]);
}

export function proposeTrade(state: GameState, fromId: string, toId: string): CommandResult {
  const from = state.empires[fromId];
  const to = state.empires[toId];
  if (!from || !to || from === to || to.isPirate || !to.alive) return fail("They will not trade");
  if (!hasMet(state, fromId, toId)) return fail("We have not met them yet");
  if (from.relations[toId] === "war") return fail("Make peace first");
  if (isTradePartner(state, fromId, toId)) return fail("We already trade with them");
  if (!to.ai) {
    (to.tradeOffers ??= {})[fromId] = state.day;
    logTo(state, "diplomacy", `The ${from.name} proposes a trade agreement. Accept it in the Empires screen.`, [toId, fromId]);
    return OK;
  }
  if (!aiAcceptsTrade(state, to, fromId)) return fail(`The ${to.name} declined to open their markets to us`);
  establish(state, fromId, toId);
  return OK;
}

export function acceptTrade(state: GameState, empireId: string, fromId: string): CommandResult {
  const me = state.empires[empireId];
  if (me?.tradeOffers?.[fromId] === undefined) return fail("No trade offer from them");
  if (me.relations[fromId] === "war") return fail("We are at war");
  establish(state, empireId, fromId);
  return OK;
}

export function rejectTrade(state: GameState, empireId: string, fromId: string): CommandResult {
  const me = state.empires[empireId];
  if (me?.tradeOffers?.[fromId] === undefined) return fail("No trade offer from them");
  delete me.tradeOffers[fromId];
  logTo(state, "diplomacy", `The ${me.name} declined a trade agreement with the ${state.empires[fromId].name}.`, [empireId, fromId]);
  return OK;
}

/** End a trade agreement (also happens automatically on war). Merchants in flight are recalled. */
export function cancelTrade(state: GameState, a: string, b: string, quiet = false): CommandResult {
  if (!isTradePartner(state, a, b)) return fail("No trade agreement with them");
  delete state.empires[a].tradePartners![b];
  delete state.empires[b].tradePartners?.[a];
  for (const f of Object.values(state.fleets)) {
    const dest = f.order?.kind === "trade" && f.order.colonyId ? state.colonies[f.order.colonyId] : null;
    if (!dest) continue;
    if ((f.empireId === a && dest.empireId === b) || (f.empireId === b && dest.empireId === a)) delete state.fleets[f.id];
  }
  if (!quiet) logTo(state, "diplomacy", `The ${state.empires[a].name} ended its trade agreement with the ${state.empires[b].name}.`, [...acquaintances(state, a), ...acquaintances(state, b), a, b]);
  return OK;
}

/** Trade partners' establishment directly (LLM ruler agreeing in conversation). */
export function agreeTrade(state: GameState, a: string, b: string): CommandResult {
  if (state.empires[a]?.relations[b] === "war") return fail("At war");
  if (isTradePartner(state, a, b)) return fail("Already trading");
  if (!hasMet(state, a, b)) return fail("Not met");
  establish(state, a, b);
  return OK;
}
