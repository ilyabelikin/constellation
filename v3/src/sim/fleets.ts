// Fleet movement: sublight travel inside systems, tunnel transits between
// systems, route finding, and on-arrival actions (colonise, build, invade).

import { HULL_MAP } from "./data/ships";
import { STATION_MAP, stationDef } from "./data/structures";
import {
  canColonize,
  garrison,
  habitability,
  maxDefense,
  stationBuildError,
  systemOwner,
} from "./economy";
import { modifiers } from "./modifiers";
import { bodyPosition, copyVec, dist } from "./orbits";
import { log, nextId, withRng } from "./util";
import type { Colony, Empire, Fleet, GameState, Order, SimEvent, Station, Vec3 } from "./types";

export const ARRIVE_EPS = 0.02;
export const COLONIZE_DAYS = 4;

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

// Tunnels never change after generation, so routes can be cached per network.
const routeCache = new WeakMap<object, Map<string, string[] | null>>();

/** Dijkstra over the tunnel network; returns tunnel ids to traverse (a fresh array). */
export function findRoute(state: GameState, from: string, to: string): string[] | null {
  if (from === to) return [];
  let cache = routeCache.get(state.tunnels);
  if (!cache) {
    cache = new Map();
    routeCache.set(state.tunnels, cache);
  }
  const key = `${from}|${to}`;
  if (!cache.has(key)) cache.set(key, computeRoute(state, from, to));
  const r = cache.get(key)!;
  return r ? [...r] : null;
}

function computeRoute(state: GameState, from: string, to: string): string[] | null {
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

export function hopCount(state: GameState, from: string, to: string): number {
  const r = findRoute(state, from, to);
  return r ? r.length : Infinity;
}

/** Where a fleet should currently head, or null if it should hold position. */
function currentTarget(state: GameState, fleet: Fleet): Vec3 | null {
  const o = fleet.order;
  if (!o || !fleet.systemId) return null;
  if (o.route.length) return gateFor(state, fleet.systemId, o.route[0]).pos;
  if (o.kind === "attack" && o.fleetId) {
    const target = state.fleets[o.fleetId];
    if (!target || target.systemId !== fleet.systemId) return null;
    return target.pos;
  }
  if (o.bodyId) return bodyPosition(state, state.bodies[o.bodyId]);
  if (o.pos) return o.pos;
  if (o.gateTunnelId) return gateFor(state, fleet.systemId, o.gateTunnelId).pos;
  return null;
}

export function issueOrder(state: GameState, fleet: Fleet, order: Omit<Order, "route">): string | null {
  const from = fleet.transit ? fleet.transit.to : fleet.systemId;
  if (!from) return "Fleet location unknown";
  const route = findRoute(state, from, order.systemId);
  if (!route) return "No tunnel route to destination";
  fleet.order = { ...order, route, work: 0 };
  fleet.orbitBodyId = null;
  return null;
}

export function stepFleets(state: GameState, dt: number, events: SimEvent[]): void {
  for (const fleet of Object.values(state.fleets)) {
    fleet.prevPos = copyVec(fleet.pos);
    if (fleet.ships.length === 0) continue;
    if (fleet.transit) {
      stepTransit(state, fleet, dt, events);
      continue;
    }
    if (!fleet.systemId) continue;
    const target = currentTarget(state, fleet);
    if (!target) {
      if (fleet.order && fleet.order.kind === "attack") fleet.order = null;
      followOrbit(state, fleet);
      continue;
    }
    const speed = fleetSpeed(state, fleet) * (fleet.battleId ? 0.5 : 1);
    const d = dist(fleet.pos, target);
    const step = speed * dt;
    if (d <= Math.max(step, ARRIVE_EPS)) {
      fleet.pos = copyVec(target);
      arrive(state, fleet, dt, events);
    } else {
      const k = step / d;
      fleet.pos = {
        x: fleet.pos.x + (target.x - fleet.pos.x) * k,
        y: fleet.pos.y + (target.y - fleet.pos.y) * k,
        z: fleet.pos.z + (target.z - fleet.pos.z) * k,
      };
    }
  }
}

function followOrbit(state: GameState, fleet: Fleet): void {
  if (fleet.orbitBodyId) {
    const body = state.bodies[fleet.orbitBodyId];
    if (body && body.systemId === fleet.systemId) fleet.pos = bodyPosition(state, body);
  }
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
  const empire = state.empires[fleet.empireId];
  if (!empire.explored[tr.to]) {
    empire.explored[tr.to] = true;
    if (empire.isPlayer) log(state, "info", `${fleet.name} surveyed the ${state.systems[tr.to].name} system.`, empire.id, tr.to);
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
  }
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
    if (empire.isPlayer) log(state, "colony", msg, empire.id, body.systemId);
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
  log(
    state,
    "colony",
    `${empire.name} founded a colony on ${body.name} (habitability ${Math.round(habitability(empire, body) * 100)}%).`,
    empire.isPlayer ? empire.id : null,
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
    if (empire.isPlayer) log(state, "construction", msg, empire.id, body.systemId);
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
  if (empire.isPlayer) log(state, "construction", `${def.name} completed at ${body.name}.`, empire.id, body.systemId);
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
    if (empire.isPlayer) log(state, kind, msg, empire.id, fleet.systemId ?? undefined);
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
    log(state, "combat", `${empire.name} invaded and captured ${colony.name} from ${victim.name}!`, null, colony.systemId);
    // Stations of the old owner in this system are lost too if nothing else holds the system.
    void oldOwner;
  } else {
    colony.pop = Math.max(0.5, colony.pop * 0.95);
    log(state, "combat", `${empire.name}'s invasion of ${colony.name} was repulsed.`, empire.isPlayer || victim.isPlayer ? null : empire.id, colony.systemId);
  }
  fleet.order = null;
}

export function mergeFleets(state: GameState, into: Fleet, from: Fleet): void {
  into.ships.push(...from.ships);
  from.ships = [];
  delete state.fleets[from.id];
}

export function fleetEmpire(state: GameState, fleet: Fleet): Empire {
  return state.empires[fleet.empireId];
}
