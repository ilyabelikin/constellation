// Validated commands. The UI and the AI both go through these, so every rule
// (costs, tech requirements, ownership) is enforced in exactly one place.

import { HULL_MAP } from "./data/ships";
import { BUILDING_MAP, STATION_MAP } from "./data/structures";
import { TECH_MAP } from "./data/techs";
import { buildingSlots, canColonize, commandCapacity, commandUsed, hullCost, stationBuildError } from "./economy";
import { clearOrder, issueOrder, mergeFleets } from "./fleets";
import { makeFleet } from "./galaxy";
import { cancelTrade } from "./trade";
import { buildingUnlocked, hullUnlocked } from "./modifiers";
import { acquaintances, canAfford, logTo, pay, refund } from "./util";
import type { Empire, Fleet, GameState, QueuedOrder, ShipStandingOrder, Stance, Vec3 } from "./types";

export type CommandResult = { ok: true } | { ok: false; error: string };

const OK: CommandResult = { ok: true };
const fail = (error: string): CommandResult => ({ ok: false, error });

function ownFleet(state: GameState, empireId: string, fleetId: string): Fleet | null {
  const f = state.fleets[fleetId];
  return f && f.empireId === empireId ? f : null;
}

/** Queue a building; `deferred` (Shift) accepts it unpaid, to be paid when its turn comes. */
export function queueBuilding(state: GameState, empireId: string, colonyId: string, type: string, deferred = false): CommandResult {
  const colony = state.colonies[colonyId];
  const empire = state.empires[empireId];
  if (!colony || colony.empireId !== empireId) return fail("Not your colony");
  const def = BUILDING_MAP[type];
  if (!def) return fail("Unknown building");
  if (!buildingUnlocked(empire, type)) return fail("Requires research");
  const queued = colony.queue.filter((q) => q.kind === "building").length;
  if (colony.buildings.length + queued >= buildingSlots(state, colony)) return fail("No free building slots (grow population)");
  if (def.unique && (colony.buildings.some((b) => b.type === type) || colony.queue.some((q) => q.type === type)))
    return fail("Only one per colony");
  if (!canAfford(empire.resources, def.cost)) {
    if (!deferred) return fail("Not enough resources (Shift+click to queue it until they are)");
    colony.queue.push({ kind: "building", type, progress: 0, total: def.days, unpaid: true });
    return OK;
  }
  pay(empire.resources, def.cost);
  colony.queue.push({ kind: "building", type, progress: 0, total: def.days });
  return OK;
}

export function queueShip(
  state: GameState,
  empireId: string,
  colonyId: string,
  hullId: string,
  then?: ShipStandingOrder,
  deferred = false,
): CommandResult {
  const colony = state.colonies[colonyId];
  const empire = state.empires[empireId];
  if (!colony || colony.empireId !== empireId) return fail("Not your colony");
  if (!colony.buildings.some((b) => b.type === "shipyard")) return fail("Requires an Orbital Shipyard");
  const hull = HULL_MAP[hullId];
  if (!hull) return fail("Unknown hull");
  if (!hullUnlocked(empire, hullId)) return fail("Requires research");
  if (colony.queue.length >= 8) return fail("Queue is full");
  if (hull.command > 0 && commandUsed(state, empire) + hull.command > commandCapacity(state, empire))
    return fail("Fleet command capacity reached (found more colonies or research new hulls)");
  const cost = hullCost(state, empire, hullId);
  if (!canAfford(empire.resources, cost)) {
    if (!deferred) return fail("Not enough resources (Shift+click to queue it until they are)");
    colony.queue.push({ kind: "ship", type: hullId, progress: 0, total: hull.buildDays, unpaid: true, ...(then ? { then } : {}) });
    return OK;
  }
  pay(empire.resources, cost);
  colony.queue.push({ kind: "ship", type: hullId, progress: 0, total: hull.buildDays, paid: cost, ...(then ? { then } : {}) });
  return OK;
}

export function cancelQueueItem(state: GameState, empireId: string, colonyId: string, index: number, expectType?: string): CommandResult {
  const colony = state.colonies[colonyId];
  const empire = state.empires[empireId];
  if (!colony || colony.empireId !== empireId) return fail("Not your colony");
  const item = colony.queue[index];
  if (!item) return fail("No such item");
  if (expectType && item.type !== expectType) return fail("Queue changed — try again");
  colony.queue.splice(index, 1);
  if (!item.unpaid) refund(empire.resources, item.kind === "ship" ? (item.paid ?? HULL_MAP[item.type].cost) : BUILDING_MAP[item.type].cost);
  // The last pending transport of an invasion cancelled: the transports already built are free for orders.
  if (item.kind === "ship" && item.then?.kind === "invade") {
    const group = item.then.group;
    const pending = Object.values(state.colonies).some((c) => c.queue.some((q) => q.kind === "ship" && q.then?.kind === "invade" && q.then.group === group));
    if (!pending) for (const f of Object.values(state.fleets)) if (f.staging === group) delete f.staging;
  }
  return OK;
}

export function demolishBuilding(state: GameState, empireId: string, colonyId: string, index: number): CommandResult {
  const colony = state.colonies[colonyId];
  if (!colony || colony.empireId !== empireId) return fail("Not your colony");
  if (!colony.buildings[index]) return fail("No such building");
  if (colony.buildings[index].type === "shipyard" && colony.queue.some((q) => q.kind === "ship"))
    return fail("Cancel queued ships before demolishing the shipyard");
  colony.buildings.splice(index, 1);
  return OK;
}

export function setResearch(state: GameState, empireId: string, techId: string): CommandResult {
  const empire = state.empires[empireId];
  const t = TECH_MAP[techId];
  if (!t) return fail("Unknown technology");
  if (empire.research.completed.includes(techId)) return fail("Already researched");
  const missing = t.requires.filter((r) => !empire.research.completed.includes(r));
  if (missing.length) {
    // Queue prerequisites automatically, cheapest path first.
    const plan = researchPlan(empire, techId);
    empire.research.current = plan[0];
    empire.research.queue = plan.slice(1);
    return OK;
  }
  empire.research.current = techId;
  empire.research.queue = empire.research.queue.filter((q) => q !== techId);
  return OK;
}

/**
 * Shift-queue research: add a tech (and any missing prerequisites) to the end
 * of the plan; a tech already queued is taken out instead, with anything
 * queued that depended on it.
 */
export function queueResearch(state: GameState, empireId: string, techId: string): CommandResult {
  const empire = state.empires[empireId];
  const t = TECH_MAP[techId];
  if (!t) return fail("Unknown technology");
  const r = empire.research;
  if (r.completed.includes(techId)) return fail("Already researched");
  if (r.queue.includes(techId)) {
    const drop = new Set([techId]);
    for (const id of r.queue) if (researchPlan(empire, id).some((x) => drop.has(x))) drop.add(id);
    r.queue = r.queue.filter((id) => !drop.has(id));
    return OK;
  }
  if (r.current === techId) return fail("Already being researched");
  const plan = researchPlan(empire, techId).filter((id) => id !== r.current && !r.queue.includes(id));
  if (r.queue.length + plan.length > MAX_RESEARCH_QUEUE) return fail("The research queue is full");
  if (!r.current) r.current = plan.shift() ?? null;
  r.queue.push(...plan);
  return OK;
}

export const MAX_RESEARCH_QUEUE = 20;

/** Topologically ordered list of unresearched techs needed for `techId` (inclusive). */
export function researchPlan(empire: Empire, techId: string): string[] {
  const out: string[] = [];
  const visit = (id: string) => {
    if (empire.research.completed.includes(id) || out.includes(id)) return;
    for (const r of TECH_MAP[id].requires) visit(r);
    out.push(id);
  };
  visit(techId);
  return out;
}

export function moveFleet(
  state: GameState,
  empireId: string,
  fleetId: string,
  systemId: string,
  target: { bodyId?: string; pos?: Vec3 } = {},
  queued = false,
): CommandResult {
  const f = ownFleet(state, empireId, fleetId);
  if (!f) return fail("Not your fleet");
  if (!state.systems[systemId]) return fail("Unknown system");
  if (target.bodyId && state.bodies[target.bodyId]?.systemId !== systemId) return fail("Body not in that system");
  const err = orderFleet(state, f, { kind: "move", systemId, bodyId: target.bodyId, pos: target.pos }, queued);
  return err ? fail(err) : OK;
}

/**
 * Give a fleet an order now, or (when `queued` and the fleet is busy) append
 * it to the fleet's plan to start once the current order is done. A direct
 * order replaces the whole plan.
 */
export function orderFleet(state: GameState, f: Fleet, order: QueuedOrder, queued: boolean): string | null {
  if (queued && (f.order || f.transit || f.queue?.length)) {
    if ((f.queue?.length ?? 0) >= MAX_QUEUED_ORDERS) return "That fleet's order queue is full";
    (f.queue ??= []).push(order);
    return null;
  }
  const err = issueOrder(state, f, order);
  if (!err) f.queue = [];
  return err;
}

export const MAX_QUEUED_ORDERS = 12;

export function colonizeOrder(state: GameState, empireId: string, fleetId: string, bodyId: string, queued = false): CommandResult {
  const f = ownFleet(state, empireId, fleetId);
  if (!f) return fail("Not your fleet");
  const body = state.bodies[bodyId];
  if (!body) return fail("Unknown body");
  if (!f.ships.some((s) => HULL_MAP[s.hull].role === "colony")) return fail("Fleet has no colony ship");
  if (!canColonize(state.empires[empireId], body)) return fail("World is not habitable for our species");
  if (Object.values(state.colonies).some((c) => c.bodyId === bodyId)) return fail("Already colonised");
  const err = orderFleet(state, f, { kind: "colonize", systemId: body.systemId, bodyId }, queued);
  return err ? fail(err) : OK;
}

export function buildStationOrder(
  state: GameState,
  empireId: string,
  fleetId: string,
  bodyId: string,
  stationType: string,
  queued = false,
): CommandResult {
  const f = ownFleet(state, empireId, fleetId);
  if (!f) return fail("Not your fleet");
  const body = state.bodies[bodyId];
  if (!body) return fail("Unknown body");
  if (!STATION_MAP[stationType]) return fail("Unknown station");
  if (!f.ships.some((s) => HULL_MAP[s.hull].role === "constructor")) return fail("Fleet has no constructor");
  const err0 = stationBuildError(state, state.empires[empireId], stationType, body);
  if (err0) return fail(err0);
  if (queued && f.queue?.some((q) => q.kind === "buildStation" && q.bodyId === bodyId && q.stationType === stationType)) return fail("Already queued");
  const err = orderFleet(state, f, { kind: "buildStation", systemId: body.systemId, bodyId, stationType }, queued);
  return err ? fail(err) : OK;
}

export function invadeOrder(state: GameState, empireId: string, fleetId: string, colonyId: string, queued = false): CommandResult {
  const f = ownFleet(state, empireId, fleetId);
  if (!f) return fail("Not your fleet");
  const c = state.colonies[colonyId];
  if (!c) return fail("Unknown colony");
  if (c.empireId === empireId) return fail("That is our colony");
  if (state.empires[empireId].relations[c.empireId] !== "war") return fail("We must be at war to invade");
  if (!f.ships.some((s) => HULL_MAP[s.hull].role === "transport")) return fail("Fleet has no troop transports");
  const err = orderFleet(state, f, { kind: "invade", systemId: c.systemId, bodyId: c.bodyId, colonyId }, queued);
  return err ? fail(err) : OK;
}

export function attackFleetOrder(state: GameState, empireId: string, fleetId: string, targetFleetId: string): CommandResult {
  const f = ownFleet(state, empireId, fleetId);
  const t = state.fleets[targetFleetId];
  if (!f || !t) return fail("Unknown fleet");
  if (!t.systemId) return fail("Target is in a tunnel");
  if (state.empires[empireId].relations[t.empireId] !== "war") return fail("We are not at war with them");
  const err = issueOrder(state, f, { kind: "attack", systemId: t.systemId, fleetId: t.id });
  return err ? fail(err) : OK;
}

export function stopFleet(state: GameState, empireId: string, fleetId: string): CommandResult {
  const f = ownFleet(state, empireId, fleetId);
  if (!f) return fail("Not your fleet");
  if (f.transit) return fail("Cannot stop inside a tunnel");
  clearOrder(state, f);
  f.queue = [];
  return OK;
}

/**
 * Cancel one of a fleet's orders: index -1 is the current order (a paid,
 * unfinished station is refunded and the next queued order starts), otherwise
 * an entry of its queue. `expectKind` guards against the list having shifted.
 */
export function cancelFleetOrder(state: GameState, empireId: string, fleetId: string, index: number, expectKind?: string | null): CommandResult {
  const f = ownFleet(state, empireId, fleetId);
  if (!f) return fail("Not your fleet");
  if (index < 0) {
    if (!f.order) return fail("No current order");
    if (expectKind && f.order.kind !== expectKind) return fail("Orders changed");
    if (f.transit) return fail("Cannot stop inside a tunnel");
    clearOrder(state, f);
    return OK;
  }
  const q = f.queue?.[index];
  if (!q) return fail("No such queued order");
  if (expectKind && q.kind !== expectKind) return fail("Orders changed");
  f.queue!.splice(index, 1);
  return OK;
}

export function setStance(state: GameState, empireId: string, fleetId: string, stance: Stance): CommandResult {
  const f = ownFleet(state, empireId, fleetId);
  if (!f) return fail("Not your fleet");
  f.stance = stance;
  return OK;
}

export function setAutoExplore(state: GameState, empireId: string, fleetId: string, on: boolean): CommandResult {
  const f = ownFleet(state, empireId, fleetId);
  if (!f) return fail("Not your fleet");
  f.autoExplore = on;
  if (!on) f.exploreTarget = undefined;
  else f.exploreAvoid = undefined;
  return OK;
}

export function renameFleet(state: GameState, empireId: string, fleetId: string, name: string): CommandResult {
  const f = ownFleet(state, empireId, fleetId);
  if (!f) return fail("Not your fleet");
  f.name = name.trim().slice(0, 32) || f.name;
  return OK;
}

export function mergeFleetsCmd(state: GameState, empireId: string, intoId: string, fromId: string): CommandResult {
  const a = ownFleet(state, empireId, intoId);
  const b = ownFleet(state, empireId, fromId);
  if (!a || !b || a === b) return fail("Invalid fleets");
  if (a.transit || b.transit || a.systemId !== b.systemId) return fail("Fleets must be in the same system");
  const d = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z);
  if (d > 1.5) return fail("Fleets must be close together to merge");
  mergeFleets(state, a, b);
  return OK;
}

export function splitFleet(state: GameState, empireId: string, fleetId: string, shipIds: string[]): CommandResult & { fleetId?: string } {
  const f = ownFleet(state, empireId, fleetId);
  if (!f) return fail("Not your fleet");
  if (f.transit || !f.systemId) return fail("Cannot split inside a tunnel");
  const moving = f.ships.filter((s) => shipIds.includes(s.id));
  if (!moving.length || moving.length === f.ships.length) return fail("Select some, but not all, ships");
  const empire = state.empires[empireId];
  const nf = makeFleet(state, empire, f.systemId, f.pos);
  nf.orbitBodyId = f.orbitBodyId;
  nf.stance = f.stance;
  nf.vel = { ...f.vel };
  nf.ships = moving;
  f.ships = f.ships.filter((s) => !shipIds.includes(s.id));
  return { ok: true, fleetId: nf.id };
}

export function declareWar(state: GameState, empireId: string, targetId: string): CommandResult {
  const a = state.empires[empireId];
  const b = state.empires[targetId];
  if (!a || !b || a === b) return fail("Invalid empire");
  if (a.relations[targetId] === "war") return fail("Already at war");
  if (!a.contacts?.[targetId] && !b.isPirate) return fail("We have not met them yet");
  a.relations[targetId] = "war";
  b.relations[empireId] = "war";
  // War ends trade: agreements lapse and merchants in flight turn back.
  if (a.tradePartners?.[targetId] !== undefined) cancelTrade(state, empireId, targetId, true);
  delete a.tradeOffers?.[targetId];
  delete b.tradeOffers?.[empireId];
  if (b.ai) {
    b.ai.warCooldown = 0;
    (b.ai.warStarted ??= {})[empireId] = state.day;
  }
  if (a.ai) (a.ai.warStarted ??= {})[targetId] = state.day;
  logTo(state, "diplomacy", `${a.name} declared war on ${b.name}!`, [...acquaintances(state, a.id), ...acquaintances(state, b.id)]);
  return OK;
}

/** Peace needs the other side to agree (AI evaluates; player always accepts via UI prompt → here auto). */
export function makePeace(state: GameState, empireId: string, targetId: string): CommandResult {
  const a = state.empires[empireId];
  const b = state.empires[targetId];
  if (!a || !b || a === b) return fail("Invalid empire");
  if (a.isPirate || b.isPirate) return fail("Raiders do not negotiate");
  if (a.relations[targetId] !== "war") return fail("Not at war");
  a.relations[targetId] = "peace";
  b.relations[empireId] = "peace";
  if (a.ai) a.ai.warCooldown = 200;
  if (b.ai) b.ai.warCooldown = 200;
  logTo(state, "diplomacy", `${a.name} and ${b.name} signed a peace treaty.`, [...acquaintances(state, a.id), ...acquaintances(state, b.id)]);
  return OK;
}
