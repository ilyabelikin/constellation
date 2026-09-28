// Fleet movement: sublight travel inside systems, tunnel transits between
// systems, route finding, and on-arrival actions (colonise, build, invade).

import { HULL_MAP } from "./data/ships";
import { STATION_MAP, stationDef } from "./data/structures";
import {
  canColonize,
  garrison,
  habitability,
  maxDefense,
  popCapacity,
  stationBuildError,
  systemOwner,
} from "./economy";
import { modifiers } from "./modifiers";
import { deliverTrade, TRADE_UNLOAD_DAYS } from "./trade";
import { deliverSupplies } from "./logistics";
import { bodyPosition, copyVec } from "./orbits";
import { bodyRef, fleetRef, log, logTo, nextId, witnesses, withRng } from "./util";
import type { Colony, Empire, Fleet, GameState, Order, QueuedOrder, SimEvent, Station, Vec3 } from "./types";

export const ARRIVE_EPS = 0.02;
export const COLONIZE_DAYS = 4;
/** Days a migrant liner's shuttles need to ferry its settlers down. */
export const UNLOAD_DAYS = 3;

export function fleetSpeed(state: GameState, fleet: Fleet): number {
  const empire = state.empires[fleet.empireId];
  let s = Infinity;
  for (const ship of fleet.ships) s = Math.min(s, HULL_MAP[ship.hull].speed);
  if (!isFinite(s)) s = 1;
  return s * (1 + modifiers(empire).speed);
}

export function tunnelDays(state: GameState, fleet: Fleet, tunnelId: string): number {
  const t = state.tunnels[tunnelId];
  const empire = state.empires[fleet.empireId];
  return t.travelDays / (1 + modifiers(empire).tunnelSpeed);
}

export function gateFor(state: GameState, systemId: string, tunnelId: string) {
  return state.systems[systemId].gates.find((g) => g.tunnelId === tunnelId)!;
}

// Routes depend only on the tunnel network and on what an empire has explored
// (which only ever grows), so they are cached per empire and exploration count.
const routeCache = new WeakMap<object, { n: number; routes: Map<string, string[] | null> }>();
const omniscientCache = new WeakMap<object, Map<string, string[] | null>>();

/**
 * Dijkstra over the tunnel network; returns tunnel ids to traverse (a fresh array).
 * With `empire`, only knowledge that empire has is used: it can see the gates of
 * systems it has explored, and so may route *into* an unexplored system, but
 * never *through* one (its other gates are unknown).
 */
export function findRoute(state: GameState, from: string, to: string, empire?: Empire | null): string[] | null {
  if (from === to) return [];
  let cache: Map<string, string[] | null>;
  if (empire && !empire.isPirate) {
    const n = Object.keys(empire.explored).length;
    let entry = routeCache.get(empire);
    if (!entry || entry.n !== n) {
      entry = { n, routes: new Map() };
      routeCache.set(empire, entry);
    }
    cache = entry.routes;
  } else {
    cache = omniscientCache.get(state.tunnels) ?? new Map();
    omniscientCache.set(state.tunnels, cache);
    empire = null;
  }
  const key = `${from}|${to}`;
  if (!cache.has(key)) cache.set(key, computeRoute(state, from, to, empire ?? null));
  const r = cache.get(key)!;
  return r ? [...r] : null;
}

function computeRoute(state: GameState, from: string, to: string, empire: Empire | null): string[] | null {
  const distTo: Record<string, number> = { [from]: 0 };
  const prev: Record<string, { sys: string; tunnel: string }> = {};
  const open = new Set<string>([from]);
  const done = new Set<string>();
  while (open.size) {
    let cur = "";
    let best = Infinity;
    for (const s of open) if (distTo[s] < best) {
      best = distTo[s];
      cur = s;
    }
    open.delete(cur);
    if (cur === to) break;
    done.add(cur);
    // Unknown systems are dead ends: we don't know where their other gates lead.
    if (empire && cur !== from && !empire.explored[cur]) continue;
    for (const g of state.systems[cur].gates) {
      const nxt = g.otherSystemId;
      if (done.has(nxt)) continue;
      const d = best + state.tunnels[g.tunnelId].travelDays + 4;
      if (d < (distTo[nxt] ?? Infinity)) {
        distTo[nxt] = d;
        prev[nxt] = { sys: cur, tunnel: g.tunnelId };
        open.add(nxt);
      }
    }
  }
  if (!(to in prev)) return null;
  const route: string[] = [];
  let at = to;
  while (at !== from) {
    route.unshift(prev[at].tunnel);
    at = prev[at].sys;
  }
  return route;
}

export function hopCount(state: GameState, from: string, to: string, empire?: Empire | null): number {
  const r = findRoute(state, from, to, empire);
  return r ? r.length : Infinity;
}

/** Where a fleet should currently head, or null if it should hold position. */
function currentTarget(state: GameState, fleet: Fleet): Vec3 | null {
  const o = fleet.order;
  if (!o || !fleet.systemId) return null;
  if (o.route.length) return gateFor(state, fleet.systemId, o.route[0]).pos;
  if (o.kind === "resupply" && o.fleetId) {
    const target = state.fleets[o.fleetId];
    return target && target.systemId === fleet.systemId ? target.pos : null;
  }
  if (o.kind === "attack" && o.fleetId) {
    const target = state.fleets[o.fleetId];
    if (!target || target.systemId !== fleet.systemId) return null;
    // Peace signed mid-chase: stand down.
    if (state.empires[fleet.empireId].relations[target.empireId] !== "war") return null;
    return target.pos;
  }
  if (o.bodyId) return bodyPosition(state, state.bodies[o.bodyId]);
  if (o.pos) return o.pos;
  if (o.gateTunnelId) return gateFor(state, fleet.systemId, o.gateTunnelId).pos;
  return null;
}

/**
 * Drop a fleet's current order. A station already paid for but not finished
 * is refunded, so re-tasking a constructor never loses resources.
 */
export function clearOrder(state: GameState, fleet: Fleet): void {
  const o = fleet.order;
  if (o && o.kind === "buildStation" && (o.work ?? 0) > 0 && o.stationType) {
    const def = STATION_MAP[o.stationType];
    const res = state.empires[fleet.empireId].resources as Record<string, number>;
    for (const [k, v] of Object.entries(def.cost)) res[k] += v ?? 0;
  }
  fleet.order = null;
}

export function issueOrder(state: GameState, fleet: Fleet, order: Omit<Order, "route">): string | null {
  const from = fleet.transit ? fleet.transit.to : fleet.systemId;
  if (!from) return "Fleet location unknown";
  const route = findRoute(state, from, order.systemId, state.empires[fleet.empireId]);
  if (!route) return "No known route — explore the systems in between first";
  clearOrder(state, fleet);
  fleet.order = { ...order, route, work: 0 };
  fleet.orbitBodyId = null;
  return null;
}

/** Days a fleet needs to reach cruise speed from rest (sets its acceleration). */
export const ACCEL_DAYS = 1.5;

export function fleetAccel(state: GameState, fleet: Fleet): number {
  return fleetSpeed(state, fleet) / ACCEL_DAYS;
}

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

/** Velocity of whatever the fleet is heading for, so it can match it on arrival. */
function targetVelocity(state: GameState, fleet: Fleet): Vec3 {
  const o = fleet.order;
  if (!o || !fleet.systemId || o.route.length) return ZERO;
  if ((o.kind === "attack" || o.kind === "resupply") && o.fleetId) return state.fleets[o.fleetId]?.vel ?? ZERO;
  if (o.bodyId) return bodyVelocity(state, o.bodyId);
  return ZERO;
}

export function bodyVelocity(state: GameState, bodyId: string): Vec3 {
  const body = state.bodies[bodyId];
  if (!body?.orbit) return ZERO;
  const h = 0.05;
  const a = bodyPosition(state, body, state.day);
  const b = bodyPosition(state, body, state.day + h);
  return { x: (b.x - a.x) / h, y: (b.y - a.y) / h, z: (b.z - a.z) / h };
}

/**
 * Thrust-limited steering. The fleet accelerates towards the target up to
 * cruise speed, coasts, then flips and burns to arrive matching the target's
 * velocity (braking curve v = sqrt(2·a·d)). Moving targets are led.
 * Returns true once the fleet has arrived (position and velocity matched).
 */
function steer(fleet: Fleet, target: Vec3, targetVel: Vec3, vmax: number, accel: number, dt: number): boolean {
  const rx = target.x - fleet.pos.x;
  const ry = target.y - fleet.pos.y;
  const rz = target.z - fleet.pos.z;
  const d = Math.hypot(rx, ry, rz);
  const rvx = fleet.vel.x - targetVel.x;
  const rvy = fleet.vel.y - targetVel.y;
  const rvz = fleet.vel.z - targetVel.z;
  const relSpeed = Math.hypot(rvx, rvy, rvz);
  if (d <= Math.max(ARRIVE_EPS, relSpeed * dt * 1.05) && relSpeed <= accel * dt * 2.5) {
    fleet.pos = copyVec(target);
    fleet.vel = copyVec(targetVel);
    fleet.thrust = { x: 0, y: 0, z: 0 };
    return true;
  }
  // Lead a moving target: aim at where it will be when we get there.
  const eta = Math.min(40, d / Math.max(vmax * 0.6, 1e-3));
  const ax = rx + targetVel.x * eta * 0.5;
  const ay = ry + targetVel.y * eta * 0.5;
  const az = rz + targetVel.z * eta * 0.5;
  const ad = Math.hypot(ax, ay, az) || 1;
  const want = Math.min(vmax, Math.sqrt(2 * accel * Math.max(0, d - ARRIVE_EPS * 0.5)) * 0.95);
  const dvx = targetVel.x + (ax / ad) * want - fleet.vel.x;
  const dvy = targetVel.y + (ay / ad) * want - fleet.vel.y;
  const dvz = targetVel.z + (az / ad) * want - fleet.vel.z;
  const dv = Math.hypot(dvx, dvy, dvz);
  const maxDv = accel * dt;
  const k = dv > maxDv ? maxDv / dv : 1;
  fleet.vel = { x: fleet.vel.x + dvx * k, y: fleet.vel.y + dvy * k, z: fleet.vel.z + dvz * k };
  // Burn fraction (0 when coasting at cruise, 1 at full thrust); tiny corrections read as coasting.
  const burn = (dv * k) / maxDv;
  fleet.thrust = burn > 0.08 && dv > 1e-9 ? { x: (dvx / dv) * burn, y: (dvy / dv) * burn, z: (dvz / dv) * burn } : { x: 0, y: 0, z: 0 };
  fleet.pos = { x: fleet.pos.x + fleet.vel.x * dt, y: fleet.pos.y + fleet.vel.y * dt, z: fleet.pos.z + fleet.vel.z * dt };
  return false;
}

export function stepFleets(state: GameState, dt: number, events: SimEvent[]): void {
  for (const fleet of Object.values(state.fleets)) {
    fleet.prevPos = copyVec(fleet.pos);
    fleet.vel ??= { x: 0, y: 0, z: 0 };
    fleet.thrust ??= { x: 0, y: 0, z: 0 };
    if (fleet.ships.length === 0) {
      // A fleet with no ships left (merged, colonised, lost) simply disbands.
      clearOrder(state, fleet);
      delete state.fleets[fleet.id];
      continue;
    }
    if (fleet.transit) {
      stepTransit(state, fleet, dt, events);
      continue;
    }
    if (!fleet.systemId) continue;
    const target = currentTarget(state, fleet);
    if (!target) {
      // Nothing left to head for (target gone, already here, peace): the order is complete.
      // (A tender whose fleet is elsewhere waits; the daily logistics pass re-routes it.)
      if (fleet.order && fleet.order.kind !== "resupply") clearOrder(state, fleet);
      followOrbit(state, fleet, dt);
      continue;
    }
    const vmax = fleetSpeed(state, fleet) * (fleet.battleId ? 0.5 : 1);
    if (steer(fleet, target, targetVelocity(state, fleet), vmax, fleetAccel(state, fleet), dt)) arrive(state, fleet, dt, events);
  }
  for (const fleet of Object.values(state.fleets)) if (!fleet.order && !fleet.transit && fleet.systemId && fleet.queue?.length) startQueuedOrder(state, fleet);
}

/** Why a queued order can no longer be carried out (checked when it comes up). */
function queuedOrderError(state: GameState, fleet: Fleet, o: QueuedOrder): string | null {
  const empire = state.empires[fleet.empireId];
  const has = (role: string) => fleet.ships.some((s) => HULL_MAP[s.hull].role === role);
  const body = o.bodyId ? state.bodies[o.bodyId] : null;
  switch (o.kind) {
    case "colonize":
      if (!has("colony") || !body) return "no colony ship";
      if (Object.values(state.colonies).some((c) => c.bodyId === body.id)) return `${body.name} is already colonised`;
      return canColonize(empire, body) ? null : `${body.name} is uninhabitable`;
    case "buildStation":
      if (!has("constructor") || !body || !o.stationType) return "no constructor";
      return stationBuildError(state, empire, o.stationType, body);
    case "invade": {
      const c = o.colonyId ? state.colonies[o.colonyId] : null;
      if (!c || c.empireId === empire.id) return "target colony is gone";
      return empire.relations[c.empireId] === "war" ? null : "we are no longer at war";
    }
    case "attack":
      return o.fleetId && state.fleets[o.fleetId] ? null : "target is gone";
    default:
      return state.systems[o.systemId] ? null : "unknown destination";
  }
}

/** Start the next still-valid order from the fleet's queue. */
export function startQueuedOrder(state: GameState, fleet: Fleet): void {
  const empire = state.empires[fleet.empireId];
  // Evasive ships wait out hostile warships before resuming their jobs.
  if (fleet.stance === "evasive" && fleet.systemId) {
    const danger = Object.values(state.fleets).some(
      (o) => o.systemId === fleet.systemId && empire.relations[o.empireId] === "war" && o.ships.some((sh) => HULL_MAP[sh.hull].weapons.length > 0),
    );
    if (danger) return;
  }
  while (fleet.queue?.length && !fleet.order) {
    const next = fleet.queue.shift()!;
    const err = queuedOrderError(state, fleet, next) ?? issueOrder(state, fleet, next);
    if (err && empire.isPlayer) log(state, "info", `${fleet.name} skipped a queued order: ${err}.`, empire.id, fleet.systemId ?? undefined, fleetRef(fleet));
  }
}

/** Idle fleets hold station on their anchor body (or drift to a stop in open space). */
function followOrbit(state: GameState, fleet: Fleet, dt: number): void {
  const body = fleet.orbitBodyId ? state.bodies[fleet.orbitBodyId] : null;
  if (!body || body.systemId !== fleet.systemId) {
    steer(fleet, fleet.pos, ZERO, fleetSpeed(state, fleet), fleetAccel(state, fleet), dt);
    return;
  }
  steer(fleet, bodyPosition(state, body), bodyVelocity(state, body.id), fleetSpeed(state, fleet), fleetAccel(state, fleet), dt);
}

function stepTransit(state: GameState, fleet: Fleet, dt: number, events: SimEvent[]): void {
  const tr = fleet.transit!;
  tr.progress += dt;
  if (tr.progress < tr.total) return;
  const gate = gateFor(state, tr.to, tr.tunnelId);
  fleet.transit = null;
  fleet.systemId = tr.to;
  fleet.pos = copyVec(gate.pos);
  fleet.prevPos = copyVec(gate.pos);
  fleet.vel = { x: 0, y: 0, z: 0 };
  fleet.thrust = { x: 0, y: 0, z: 0 };
  const empire = state.empires[fleet.empireId];
  if (!empire.explored[tr.to]) {
    empire.explored[tr.to] = true;
    if (empire.isPlayer) log(state, "info", `${fleet.name} surveyed the ${state.systems[tr.to].name} system.`, empire.id, tr.to, fleetRef(fleet));
  }
  events.push({ type: "jump", systemId: tr.to, pos: copyVec(gate.pos), fleetId: fleet.id, entering: false });
  if (fleet.order && fleet.order.route.length === 0 && !fleet.order.bodyId && !fleet.order.pos && fleet.order.kind === "move") {
    // Destination was just "the system": park near the gate.
    fleet.order = null;
  }
}

function arrive(state: GameState, fleet: Fleet, dt: number, events: SimEvent[]): void {
  const o = fleet.order!;
  if (o.route.length) {
    const tunnelId = o.route.shift()!;
    const t = state.tunnels[tunnelId];
    const to = t.a === fleet.systemId ? t.b : t.a;
    events.push({ type: "jump", systemId: fleet.systemId!, pos: copyVec(fleet.pos), fleetId: fleet.id, entering: true });
    fleet.transit = { tunnelId, from: fleet.systemId!, to, progress: 0, total: tunnelDays(state, fleet, tunnelId) };
    fleet.systemId = null;
    fleet.battleId = null;
    return;
  }
  switch (o.kind) {
    case "move":
      fleet.orbitBodyId = o.bodyId ?? null;
      fleet.order = null;
      break;
    case "attack":
      // Keep chasing; combat will resolve when in range.
      break;
    case "colonize":
      fleet.orbitBodyId = o.bodyId ?? null;
      doColonize(state, fleet, dt, events);
      break;
    case "buildStation":
      fleet.orbitBodyId = o.bodyId ?? null;
      doBuildStation(state, fleet, dt, events);
      break;
    case "invade":
      fleet.orbitBodyId = o.bodyId ?? null;
      doInvade(state, fleet);
      break;
    case "migrate":
      fleet.orbitBodyId = o.bodyId ?? null;
      doMigrate(state, fleet, dt);
      break;
    case "resupply":
      deliverSupplies(state, fleet);
      break;
    case "trade":
      fleet.orbitBodyId = o.bodyId ?? null;
      o.work = (o.work ?? 0) + dt;
      if (o.work >= TRADE_UNLOAD_DAYS && !fleet.battleId) deliverTrade(state, fleet);
      break;
  }
}

/** Shuttles ferry the liner's settlers down; then the chartered liner is released (leaves play). */
function doMigrate(state: GameState, fleet: Fleet, dt: number): void {
  const o = fleet.order!;
  o.work = (o.work ?? 0) + dt;
  if (o.work < UNLOAD_DAYS || fleet.battleId) return;
  let colony: Colony | undefined = o.colonyId ? state.colonies[o.colonyId] : undefined;
  if (!colony || colony.empireId !== fleet.empireId)
    colony = Object.values(state.colonies).find((c) => c.empireId === fleet.empireId && c.systemId === fleet.systemId);
  if (colony) colony.pop = Math.min(popCapacity(state, colony), colony.pop + (fleet.migrants ?? 0));
  delete state.fleets[fleet.id];
}

function removeShipOfRole(fleet: Fleet, role: string): boolean {
  const idx = fleet.ships.findIndex((s) => HULL_MAP[s.hull].role === role);
  if (idx < 0) return false;
  fleet.ships.splice(idx, 1);
  return true;
}

function doColonize(state: GameState, fleet: Fleet, dt: number, events: SimEvent[]): void {
  const o = fleet.order!;
  const body = state.bodies[o.bodyId!];
  const empire = state.empires[fleet.empireId];
  const fail = (msg: string) => {
    if (empire.isPlayer) log(state, "colony", msg, empire.id, body.systemId, bodyRef(state, body.id));
    fleet.order = null;
  };
  if (!fleet.ships.some((s) => HULL_MAP[s.hull].role === "colony")) return fail(`${fleet.name} has no colony ship.`);
  if (Object.values(state.colonies).some((c) => c.bodyId === body.id)) return fail(`${body.name} is already colonised.`);
  if (!canColonize(empire, body)) return fail(`${body.name} is not habitable for our species.`);
  const owner = systemOwner(state, body.systemId);
  if (owner && owner !== empire.id && !state.empires[owner].isPirate) return fail(`${state.systems[body.systemId].name} is claimed by another empire.`);
  if (Object.values(state.stations).some((s) => s.bodyId === body.id && s.empireId !== empire.id))
    return fail(`Another empire has a station at ${body.name}.`);
  o.work = (o.work ?? 0) + dt;
  if (o.work < COLONIZE_DAYS) return;
  removeShipOfRole(fleet, "colony");
  const colony = foundColony(state, empire, body.id, 1);
  events.push({ type: "colonized", systemId: body.systemId, bodyId: body.id, empireId: empire.id });
  logTo(
    state,
    "colony",
    `${empire.name} founded a colony on ${body.name} (habitability ${Math.round(habitability(empire, body) * 100)}%).`,
    witnesses(state, colony.systemId),
    colony.systemId,
  );
  fleet.order = null;
}

export function foundColony(state: GameState, empire: Empire, bodyId: string, pop: number): Colony {
  const body = state.bodies[bodyId];
  const colony: Colony = {
    id: nextId(state, "c"),
    empireId: empire.id,
    bodyId,
    systemId: body.systemId,
    name: body.name,
    pop,
    buildings: [],
    queue: [],
    defense: 0,
    founded: state.day,
    lastAttacked: -999,
    capital: false,
  };
  colony.defense = maxDefense(state, colony);
  state.colonies[colony.id] = colony;
  empire.stats.coloniesFounded++;
  // Stations of ours on the colonised body stay; that's fine.
  return colony;
}

function doBuildStation(state: GameState, fleet: Fleet, dt: number, events: SimEvent[]): void {
  const o = fleet.order!;
  const body = state.bodies[o.bodyId!];
  const empire = state.empires[fleet.empireId];
  const def = stationDef(o.stationType!);
  const fail = (msg: string) => {
    if (empire.isPlayer) log(state, "construction", msg, empire.id, body.systemId, bodyRef(state, body.id));
    fleet.order = null;
  };
  if (!fleet.ships.some((s) => HULL_MAP[s.hull].role === "constructor")) return fail(`${fleet.name} has no constructor.`);
  if ((o.work ?? 0) === 0) {
    const err = stationBuildError(state, empire, def.id, body);
    if (err) return fail(`Cannot build ${def.name} at ${body.name}: ${err}.`);
    // Pay on arrival.
    for (const [k, v] of Object.entries(def.cost)) {
      if ((empire.resources as Record<string, number>)[k] + 1e-9 < (v ?? 0)) return fail(`Not enough resources for ${def.name}.`);
    }
    for (const [k, v] of Object.entries(def.cost)) (empire.resources as Record<string, number>)[k] -= v ?? 0;
    o.work = 1e-6;
  }
  o.work = (o.work ?? 0) + dt;
  if (o.work < def.days) return;
  const err = stationBuildError(state, empire, def.id, body);
  if (err) {
    // Refund if the site became invalid while building.
    for (const [k, v] of Object.entries(def.cost)) (empire.resources as Record<string, number>)[k] += v ?? 0;
    return fail(`Construction of ${def.name} aborted: ${err}.`);
  }
  if (def.upgradeOf) {
    const old = Object.values(state.stations).find((s) => s.bodyId === body.id && s.type === def.upgradeOf && s.empireId === empire.id);
    if (old) delete state.stations[old.id];
  }
  const st: Station = {
    id: nextId(state, "st"),
    empireId: empire.id,
    type: def.id,
    bodyId: body.id,
    systemId: body.systemId,
    level: 1,
    hp: def.hp,
    founded: state.day,
  };
  state.stations[st.id] = st;
  empire.explored[body.systemId] = true;
  events.push({ type: "stationBuilt", systemId: body.systemId, bodyId: body.id, empireId: empire.id, stationType: def.id });
  if (empire.isPlayer) log(state, "construction", `${def.name} completed at ${body.name}.`, empire.id, body.systemId, bodyRef(state, body.id));
  fleet.order = null;
}

export function stationMaxHp(station: Station): number {
  return STATION_MAP[station.type]?.hp ?? 100;
}

function doInvade(state: GameState, fleet: Fleet): void {
  const o = fleet.order!;
  const colony = o.colonyId ? state.colonies[o.colonyId] : undefined;
  const empire = state.empires[fleet.empireId];
  const done = (msg: string, kind: "combat" | "danger" = "combat") => {
    if (empire.isPlayer) log(state, kind, msg, empire.id, fleet.systemId ?? undefined, colony ? bodyRef(state, colony.bodyId) : fleetRef(fleet));
    fleet.order = null;
  };
  if (!colony || colony.empireId === empire.id) return done("Invasion target no longer valid.");
  if (empire.relations[colony.empireId] !== "war") return done("We are not at war with that empire.");
  const troopsShips = fleet.ships.filter((s) => HULL_MAP[s.hull].role === "transport");
  if (!troopsShips.length) return done(`${fleet.name} carries no troops.`);
  if (colony.defense > 1) {
    // Wait in orbit until warships knock the planetary defenses down.
    return;
  }
  const troops = troopsShips.reduce((s, sh) => s + (HULL_MAP[sh.hull].troops ?? 0), 0) * (1 + modifiers(empire).damage);
  const defenders = garrison(state, colony);
  const roll = withRng(state, (rng) => rng.range(0.75, 1.25));
  fleet.ships = fleet.ships.filter((s) => HULL_MAP[s.hull].role !== "transport");
  const victim = state.empires[colony.empireId];
  if (troops * roll > defenders) {
    const oldOwner = colony.empireId;
    colony.empireId = empire.id;
    colony.pop = Math.max(1, colony.pop * 0.75);
    colony.queue = [];
    colony.capital = false;
    colony.defense = 0;
    colony.lastAttacked = state.day;
    logTo(state, "combat", `${empire.name} invaded and captured ${colony.name} from ${victim.name}!`, [oldOwner, ...witnesses(state, colony.systemId)], colony.systemId, bodyRef(state, colony.bodyId));
    ensureCapital(state, oldOwner);
  } else {
    colony.pop = Math.max(0.5, colony.pop * 0.95);
    logTo(state, "combat", `${empire.name}'s invasion of ${colony.name} was repulsed.`, [empire.id, ...witnesses(state, colony.systemId)], colony.systemId, bodyRef(state, colony.bodyId));
  }
  fleet.order = null;
}

/** Promote the most populous colony to capital if an empire has lost its capital. */
export function ensureCapital(state: GameState, empireId: string): void {
  const cols = Object.values(state.colonies).filter((c) => c.empireId === empireId);
  if (!cols.length || cols.some((c) => c.capital)) return;
  cols.sort((a, b) => b.pop - a.pop);
  cols[0].capital = true;
  const e = state.empires[empireId];
  log(state, "colony", `${e.name} relocated its capital to ${cols[0].name}.`, e.id, cols[0].systemId, bodyRef(state, cols[0].bodyId));
}

export function mergeFleets(state: GameState, into: Fleet, from: Fleet): void {
  clearOrder(state, from);
  into.ships.push(...from.ships);
  from.ships = [];
  delete state.fleets[from.id];
}

export function fleetEmpire(state: GameState, fleet: Fleet): Empire {
  return state.empires[fleet.empireId];
}
