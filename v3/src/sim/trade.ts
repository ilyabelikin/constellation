// Merchant trade. Each colony with a Trade Hub keeps a few civilian freighters
// in service, plying back and forth between it and other trade-hub colonies:
// our own, and those of empires we have a trade agreement with. Every leg
// loads goods at one end and sells them at the other, paying the freighter's
// owner (and a share to a foreign partner); bigger markets and longer hauls are
// worth more, foreign trade most of all. Freighters are unarmed and can be
// caught by raiders or enemies.

import { aiAcceptsTrade } from "./ai";
import { findRoute, issueOrder } from "./fleets";
import { makeFleet, makeShip } from "./galaxy";
import { hasMet } from "./knowledge";
import { modifiers } from "./modifiers";
import { bodyPosition } from "./orbits";
import type { CommandResult } from "./api";
import type { Colony, Empire, Fleet, GameState } from "./types";
import { acquaintances, logTo } from "./util";

/** Days between departures from one trade hub (while it has fewer freighters than it can keep busy). */
export const TRADE_INTERVAL = 25;
/** Freighters one trade hub keeps in service (more with trade technology). */
export const FREIGHTERS_PER_HUB = 4;
/** Longest haul a merchant will undertake (tunnel jumps). */
const MAX_HOPS = 6;
/** Share of a foreign delivery's value that the receiving empire also earns. */
export const RECEIVER_SHARE = 0.5;
/** Days in port at each end: unloading, trading and loading the return cargo. */
export const TRADE_UNLOAD_DAYS = 6;

const hasHub = (c: Colony) => c.buildings.some((b) => b.type === "trade_hub");

export function isTradePartner(state: GameState, a: string, b: string): boolean {
  return state.empires[a]?.tradePartners?.[b] !== undefined;
}

/** Credits a run between two trade hubs is worth. */
export function tradeValue(from: Colony, to: Colony, hops: number, foreign: boolean): number {
  return (1.5 + 0.5 * Math.sqrt(Math.max(0, from.pop) * Math.max(0, to.pop))) * (1 + 0.3 * hops) * (foreign ? 1.6 : 1);
}

function destinations(state: GameState, from: Colony): { colony: Colony; value: number }[] {
  const owner = state.empires[from.empireId];
  const m = modifiers(owner);
  const maxHops = MAX_HOPS + m.tradeRange;
  const out: { colony: Colony; value: number }[] = [];
  for (const c of Object.values(state.colonies)) {
    if (c.id === from.id || !hasHub(c)) continue;
    const foreign = c.empireId !== owner.id;
    if (foreign && (!isTradePartner(state, owner.id, c.empireId) || !owner.explored[c.systemId])) continue;
    if (Object.values(state.battles).some((b) => b.systemId === c.systemId)) continue;
    const route = c.systemId === from.systemId ? [] : findRoute(state, from.systemId, c.systemId, owner);
    if (!route || route.length > maxHops) continue;
    out.push({ colony: c, value: tradeValue(from, c, route.length, foreign) * (1 + m.trade) });
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
    for (const id of Object.keys(e.tradePartners ?? {})) {
      e.tradeWith ??= {};
      e.tradeWith[id] = (e.tradeWith[id] ?? 0) * 0.965 + (e.tradeWithToday?.[id] ?? 0) * 0.035;
    }
    e.tradeWithToday = {};
  }
  const inService = new Map<string, number>();
  for (const f of Object.values(state.fleets)) if (f.tradeHome) inService.set(f.tradeHome, (inService.get(f.tradeHome) ?? 0) + 1);
  for (const c of Object.values(state.colonies)) {
    if (!hasHub(c) || (c.nextTrade ?? 0) > state.day) continue;
    const owner = state.empires[c.empireId];
    if (!owner?.alive || owner.isPirate) continue;
    c.nextTrade = state.day + TRADE_INTERVAL / (1 + modifiers(owner).tradeFrequency);
    if ((inService.get(c.id) ?? 0) >= hubCapacity(owner)) continue;
    if (Object.values(state.battles).some((b) => b.systemId === c.systemId)) continue;
    const best = bestDestination(state, c);
    if (!best) continue;
    const f = makeFleet(state, owner, c.systemId, bodyPosition(state, state.bodies[c.bodyId]), `${c.name} Merchants`);
    f.ships.push(makeShip(state, owner, "freighter", `Freighter ${c.name}`));
    f.civilian = true;
    f.stance = "passive";
    f.orbitBodyId = c.bodyId;
    f.tradeHome = c.id;
    if (!sail(state, f, best.colony, best.value)) {
      delete state.fleets[f.id];
      continue;
    }
    inService.set(c.id, (inService.get(c.id) ?? 0) + 1);
    launched.push(f);
  }
  return launched;
}

/** Freighters one hub of this empire keeps busy. */
export function hubCapacity(e: Empire): number {
  return Math.round(FREIGHTERS_PER_HUB * (1 + modifiers(e).tradeFrequency));
}

function bestDestination(state: GameState, from: Colony): { colony: Colony; value: number } | null {
  const options = destinations(state, from);
  return options.length ? options.reduce((a, b) => (b.value > a.value ? b : a)) : null;
}

/** Load goods worth `value` and set course for `to`; false if it can't get there. */
function sail(state: GameState, f: Fleet, to: Colony, value: number): boolean {
  const owner = state.empires[f.empireId];
  f.cargo = Math.round(value * 10) / 10;
  if (to.empireId !== owner.id) f.tradePartner = to.empireId;
  else if (to.id !== f.tradeHome) delete f.tradePartner;
  return !issueOrder(state, f, { kind: "trade", systemId: to.systemId, bodyId: to.bodyId, colonyId: to.id });
}

/** Can a freighter of `owner` still trade at colony `c`? */
function openMarket(state: GameState, owner: Empire, c: Colony | undefined): c is Colony {
  if (!c || !hasHub(c)) return false;
  return c.empireId === owner.id || isTradePartner(state, owner.id, c.empireId);
}

/**
 * On arrival: unload and get paid, then load goods for the next leg — back
 * home from a far market, or out again from home to the best market. A
 * freighter with nowhere left to trade (hub gone, agreement ended, home lost)
 * retires.
 */
export function deliverTrade(state: GameState, fleet: Fleet): void {
  const o = fleet.order!;
  const dest = o.colonyId ? state.colonies[o.colonyId] : undefined;
  const owner = state.empires[fleet.empireId];
  const value = fleet.cargo ?? 0;
  const partner = fleet.tradePartner && isTradePartner(state, owner.id, fleet.tradePartner) ? fleet.tradePartner : null;
  if (dest && owner?.alive && (dest.empireId === owner.id || isTradePartner(state, owner.id, dest.empireId))) {
    pay(owner, value, partner);
    if (partner) pay(state.empires[partner], value * RECEIVER_SHARE, owner.id);
  }
  fleet.order = null;
  fleet.cargo = 0;
  const home = fleet.tradeHome ? state.colonies[fleet.tradeHome] : undefined;
  if (!owner?.alive || !home || home.empireId !== owner.id || !hasHub(home)) return retire(state, fleet);
  if (dest && dest.id !== home.id) {
    // Load local goods for the journey home.
    const route = dest.systemId === home.systemId ? [] : findRoute(state, dest.systemId, home.systemId, owner);
    if (!route || !openMarket(state, owner, dest) || !sail(state, fleet, home, tradeValue(dest, home, route.length, dest.empireId !== owner.id) * (1 + modifiers(owner).trade)))
      sailHomeEmpty(state, fleet, home);
    return;
  }
  // Home again: back out to the best market, unless the hub already has enough freighters.
  const busy = Object.values(state.fleets).filter((f) => f.tradeHome === home.id && f.id !== fleet.id).length;
  const best = busy < hubCapacity(owner) ? bestDestination(state, home) : null;
  if (!best || !sail(state, fleet, best.colony, best.value)) retire(state, fleet);
}

function sailHomeEmpty(state: GameState, fleet: Fleet, home: Colony): void {
  delete fleet.tradePartner;
  if (!sail(state, fleet, home, 0)) retire(state, fleet);
}

function retire(state: GameState, fleet: Fleet): void {
  delete state.fleets[fleet.id];
}

function pay(e: Empire, credits: number, partnerId: string | null): void {
  e.resources.credits += credits;
  e.tradeToday = (e.tradeToday ?? 0) + credits;
  if (partnerId) (e.tradeWithToday ??= {})[partnerId] = (e.tradeWithToday[partnerId] ?? 0) + credits;
}

/**
 * What trade with `otherId` is worth to `e` in credits per day: what it earns
 * now (`current`) or what the lapsed agreement used to earn (`lost`), and that
 * value as a share of e's credit income (so AI rulers can weigh it).
 */
export function tradeStake(e: Empire, otherId: string): { current: number; lost: number; share: number } {
  const current = e.tradePartners?.[otherId] !== undefined ? (e.tradeWith?.[otherId] ?? 0) : 0;
  const lost = current ? 0 : (e.tradeLost?.[otherId] ?? 0);
  const income = Math.max(3, Math.max(0, e.income?.credits ?? 0) + (e.tradeRate ?? 0));
  return { current, lost, share: (current || lost) / income };
}

// ---------------------------------------------------------------------------
// Trade agreements

const OK: CommandResult = { ok: true };
const fail = (error: string): CommandResult => ({ ok: false, error });

function establish(state: GameState, a: string, b: string): void {
  (state.empires[a].tradePartners ??= {})[b] = state.day;
  (state.empires[b].tradePartners ??= {})[a] = state.day;
  for (const [x, y] of [[a, b], [b, a]]) {
    const e = state.empires[x];
    // Merchants take time to find their routes again: start from what the old agreement earned.
    if (e.tradeLost?.[y] !== undefined) (e.tradeWith ??= {})[y] = e.tradeLost[y] * 0.5;
    delete e.tradeLost?.[y];
  }
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
  for (const [x, y] of [[a, b], [b, a]]) {
    const e = state.empires[x];
    const was = e.tradeWith?.[y] ?? 0;
    if (was > 0.05) (e.tradeLost ??= {})[y] = was;
    delete e.tradeWith?.[y];
  }
  // Merchants bound for the other side's ports turn back home with their goods unsold.
  for (const f of Object.values(state.fleets)) {
    const dest = f.order?.kind === "trade" && f.order.colonyId ? state.colonies[f.order.colonyId] : null;
    if (!dest) continue;
    if ((f.empireId === a && dest.empireId === b) || (f.empireId === b && dest.empireId === a)) {
      const home = f.tradeHome ? state.colonies[f.tradeHome] : undefined;
      f.order = null;
      if (home && home.empireId === f.empireId) sailHomeEmpty(state, f, home);
      else retire(state, f);
    } else if (f.tradePartner === (f.empireId === a ? b : f.empireId === b ? a : null)) delete f.tradePartner;
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
