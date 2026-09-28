// Utility-style AI for rival empires. Runs every few days per empire and
// issues the same validated commands the player uses.

import { HULL_MAP, HULLS } from "./data/ships";
import { BUILDING_MAP, STATIONS } from "./data/structures";
import type { Branch } from "./data/techs";
import {
  availableTechs,
  buildingSlots,
  garrison,
  habitability,
  hullCost,
  storageCap,
  stationBuildError,
  systemOwnerMap,
} from "./economy";
import {
  buildStationOrder,
  colonizeOrder,
  declareWar,
  invadeOrder,
  makePeace,
  moveFleet,
  queueBuilding,
  queueShip,
} from "./commands";
import { colonyPower, fleetArmed, fleetPower, isHostile } from "./combat";
import { findRoute, mergeFleets } from "./fleets";
import { buildingUnlocked, hullUnlocked } from "./modifiers";
import { bodyPosition, dist } from "./orbits";
import type { Rng } from "./rng";
import { canAfford } from "./util";
import type { AiState, Colony, Empire, Fleet, GameState } from "./types";

const THINK_INTERVAL = 5;

const BRANCH_WEIGHTS: Record<AiState["personality"], Record<Branch, number>> = {
  expansionist: { industry: 1.3, energy: 1.1, society: 1.6, physics: 0.8, propulsion: 1.3, weapons: 0.8, defense: 0.8 },
  militarist: { industry: 1.1, energy: 0.9, society: 0.7, physics: 0.6, propulsion: 1, weapons: 1.8, defense: 1.4 },
  scholar: { industry: 0.9, energy: 1.2, society: 1, physics: 1.8, propulsion: 0.8, weapons: 0.9, defense: 1 },
  trader: { industry: 1.2, energy: 1.2, society: 1.4, physics: 1, propulsion: 1, weapons: 0.9, defense: 1 },
};

export function empirePower(state: GameState, empireId: string): number {
  let p = 0;
  for (const f of Object.values(state.fleets)) if (f.empireId === empireId) p += fleetPower(state, f);
  return p;
}

export function coloniesOf(state: GameState, empireId: string): Colony[] {
  return Object.values(state.colonies).filter((c) => c.empireId === empireId);
}

function fleetsOf(state: GameState, empireId: string): Fleet[] {
  return Object.values(state.fleets).filter((f) => f.empireId === empireId && f.ships.length > 0);
}

function roleOf(f: Fleet): string {
  if (fleetArmed(f)) return "military";
  return HULL_MAP[f.ships[0].hull].role;
}

function queuedCount(state: GameState, empireId: string, hullRole: string): number {
  let n = 0;
  for (const c of coloniesOf(state, empireId))
    for (const q of c.queue) if (q.kind === "ship" && HULL_MAP[q.type].role === hullRole) n++;
  return n;
}

function ownedSystemIds(state: GameState, empireId: string, owners = systemOwnerMap(state)): string[] {
  return Object.keys(owners).filter((id) => owners[id] === empireId);
}

export function aiThink(state: GameState, empire: Empire, rng: Rng): void {
  const ai = empire.ai!;
  if (state.day < ai.nextThink) return;
  ai.nextThink = state.day + THINK_INTERVAL + rng.range(0, 2);
  ai.warCooldown = Math.max(0, ai.warCooldown - THINK_INTERVAL);
  const colonies = coloniesOf(state, empire.id);
  if (!colonies.length) return;
  const owners = systemOwnerMap(state);
  chooseResearch(state, empire, rng);
  planBuildings(state, empire, colonies, rng);
  planShips(state, empire, colonies, owners, rng);
  directCivilians(state, empire, owners, rng);
  directMilitary(state, empire, owners);
  diplomacy(state, empire, owners, rng);
}

function chooseResearch(state: GameState, empire: Empire, rng: Rng): void {
  if (empire.research.current) return;
  const avail = availableTechs(empire);
  if (!avail.length) return;
  const w = BRANCH_WEIGHTS[empire.ai!.personality];
  const pick = rng.weighted(avail, (t) => {
    if (t.id === "ascension") return empire.research.completed.length > 30 ? 50 : 0;
    return (w[t.branch] * 1000) / t.cost;
  });
  empire.research.current = pick.id;
  void state;
}

function planBuildings(state: GameState, empire: Empire, colonies: Colony[], rng: Rng): void {
  const pers = empire.ai!.personality;
  const atWar = Object.entries(empire.relations).some(([id, r]) => r === "war" && !state.empires[id].isPirate);
  for (const c of colonies) {
    if (c.queue.some((q) => q.kind === "building")) continue;
    if (c.buildings.length >= buildingSlots(state, c)) continue;
    const workers = c.buildings.reduce((s, b) => s + (BUILDING_MAP[b.type]?.workers ?? 0), 0);
    const has = (t: string) => c.buildings.some((b) => b.type === t);
    const count = (t: string) => c.buildings.filter((b) => b.type === t).length;
    let choice: string | null = null;
    if (empire.income.energy < 1.5 && empire.resources.energy < 150) choice = "power_plant";
    else if (!has("shipyard") && (c.capital || c.pop >= 4)) choice = "shipyard";
    else if ((atWar || state.day > 400) && !has("defense_grid") && c.pop >= 3) choice = "defense_grid";
    else if (workers >= c.pop + 0.5 && buildingUnlocked(empire, "habitat")) choice = "habitat";
    else if (workers >= c.pop + 0.5) choice = count("defense_grid") < 2 && c.pop > 6 ? "defense_grid" : null;
    else {
      const options: [string, number][] = [
        ["mine", pers === "expansionist" ? 1.3 : 1],
        ["research_lab", pers === "scholar" ? 1.8 : 1],
        ["trade_hub", pers === "trader" ? 1.8 : 1],
        ["power_plant", empire.income.energy < 4 ? 1.2 : 0.4],
        ["foundry", 0.9],
        ["quantum_lab", pers === "scholar" ? 1.6 : 1],
        ["exotic_refinery", empire.resources.exotics < 60 && state.day > 500 ? 0.8 : 0.2],
        ["fortress", atWar ? 0.6 : 0.1],
      ];
      const valid = options.filter(([id]) => buildingUnlocked(empire, id) && !(BUILDING_MAP[id].unique && has(id)));
      if (valid.length) choice = rng.weighted(valid, ([, w]) => w)[0];
    }
    if (choice && canAfford(empire.resources, BUILDING_MAP[choice].cost)) queueBuilding(state, empire.id, c.id, choice);
  }
}

function bestWarship(empire: Empire, rng: Rng): string {
  const unlocked = HULLS.filter((h) => h.role === "military" && hullUnlocked(empire, h.id));
  unlocked.sort((a, b) => b.hull - a.hull);
  if (unlocked.length > 1 && rng.chance(0.35)) return unlocked[1].id;
  return unlocked[0].id;
}

function desiredMilitaryPower(state: GameState, empire: Empire, owners: Record<string, string | null>): number {
  const pers = empire.ai!.personality;
  const base = 60 + state.day * (pers === "militarist" ? 0.9 : 0.55);
  let threat = 0;
  for (const [id, r] of Object.entries(empire.relations)) {
    if (r !== "war") continue;
    const other = state.empires[id];
    if (!other.alive) continue;
    threat = Math.max(threat, other.isPirate ? 60 : empirePower(state, id) * 1.1);
  }
  void owners;
  const diff = state.settings.difficulty === "hard" ? 1.2 : state.settings.difficulty === "easy" ? 0.75 : 1;
  return Math.max(base, threat) * diff;
}

function planShips(state: GameState, empire: Empire, colonies: Colony[], owners: Record<string, string | null>, rng: Rng): void {
  const yards = colonies.filter((c) => c.buildings.some((b) => b.type === "shipyard"));
  if (!yards.length) return;
  const fleets = fleetsOf(state, empire.id);
  const countRole = (role: string) =>
    fleets.reduce((s, f) => s + f.ships.filter((sh) => HULL_MAP[sh.hull].role === role).length, 0) + queuedCount(state, empire.id, role);
  const yard = () => yards.reduce((a, b) => (a.queue.length <= b.queue.length ? a : b));
  const tryQueue = (hull: string, reserve = 40) => {
    const cost = hullCost(state, empire, hull);
    const res = empire.resources;
    if ((cost.credits ?? 0) + reserve > res.credits || (cost.metals ?? 0) + reserve > res.metals) return false;
    if ((cost.exotics ?? 0) > res.exotics) return false;
    return queueShip(state, empire.id, yard().id, hull).ok;
  };
  const unexplored = Object.keys(state.systems).filter((id) => !empire.explored[id]);
  if (countRole("scout") < (state.day < 400 && unexplored.length ? 1 : 0)) tryQueue("scout", 0);
  const wantConstructors = Math.min(3, 1 + Math.floor(colonies.length / 3));
  if (countRole("constructor") < wantConstructors && bestStationSite(state, empire, owners)) tryQueue("constructor", 20);
  const colonyCap = empire.ai!.personality === "expansionist" ? 2 : 1;
  if (countRole("colony") < colonyCap && empire.income.credits > 3 && bestColonySite(state, empire, owners)) tryQueue("colony", 30);
  const atWarWithMajor = Object.entries(empire.relations).some(([id, r]) => r === "war" && !state.empires[id].isPirate && state.empires[id].alive);
  if (atWarWithMajor && hullUnlocked(empire, "transport")) {
    const target = invasionTarget(state, empire);
    const needed = target ? Math.ceil((garrison(state, target) * 1.35) / (HULL_MAP.transport.troops ?? 3)) : 2;
    if (countRole("transport") < Math.min(10, needed)) tryQueue("transport", 60);
  }
  const power = empirePower(state, empire.id);
  const queuedMil = queuedCount(state, empire.id, "military");
  if (power < desiredMilitaryPower(state, empire, owners) && queuedMil < yards.length * 2) tryQueue(bestWarship(empire, rng), 80);
  else if (
    empire.resources.metals > storageCap(state, empire) * 0.4 &&
    empire.resources.credits > storageCap(state, empire) * 0.25 &&
    queuedMil < yards.length * 2
  )
    tryQueue(bestWarship(empire, rng), 200);
}

function bestColonySite(state: GameState, empire: Empire, owners: Record<string, string | null>): { bodyId: string; score: number } | null {
  const homes = ownedSystemIds(state, empire.id, owners);
  if (!homes.length) return null;
  const taken = new Set(Object.values(state.colonies).map((c) => c.bodyId));
  const targeted = new Set(
    Object.values(state.fleets)
      .filter((f) => f.empireId === empire.id && f.order?.kind === "colonize")
      .map((f) => f.order!.bodyId),
  );
  let best: { bodyId: string; score: number } | null = null;
  for (const sysId of Object.keys(empire.explored)) {
    const owner = owners[sysId];
    if (owner && owner !== empire.id && !state.empires[owner].isPirate) continue;
    if (Object.values(state.stations).some((s) => s.systemId === sysId && state.empires[s.empireId].isPirate)) continue;
    const hops = Math.min(...homes.map((h) => findRoute(state, h, sysId)?.length ?? 99));
    if (hops > 4) continue;
    for (const bid of state.systems[sysId].bodyIds) {
      const b = state.bodies[bid];
      if (taken.has(bid) || targeted.has(bid)) continue;
      if (Object.values(state.stations).some((s) => s.bodyId === bid && s.empireId !== empire.id)) continue;
      const h = habitability(empire, b);
      if (h < 0.35) continue;
      const score = (h * b.size) / (1 + hops * 0.6);
      if (!best || score > best.score) best = { bodyId: bid, score };
    }
  }
  return best;
}

function stationValue(empire: Empire, type: string): number {
  const inc = empire.income;
  switch (type) {
    case "mining_station":
      return inc.metals < 6 ? 1.4 : 1;
    case "gas_harvester":
    case "solar_array":
      return inc.energy < 3 ? 1.6 : 0.9;
    case "research_station":
      return 1.1;
    case "exotic_extractor":
      return empire.resources.exotics < 100 ? 1.5 : 0.8;
    case "dyson_swarm":
      return 2;
    case "defense_platform":
      return 0.15;
    default:
      return 0.5;
  }
}

function bestStationSite(
  state: GameState,
  empire: Empire,
  owners: Record<string, string | null>,
): { bodyId: string; type: string; score: number } | null {
  const homes = ownedSystemIds(state, empire.id, owners);
  if (!homes.length) return null;
  const targeted = new Set(
    Object.values(state.fleets)
      .filter((f) => f.empireId === empire.id && f.order?.kind === "buildStation")
      .map((f) => `${f.order!.bodyId}|${f.order!.stationType}`),
  );
  let best: { bodyId: string; type: string; score: number } | null = null;
  for (const sysId of Object.keys(empire.explored)) {
    const owner = owners[sysId];
    if (owner && owner !== empire.id) continue;
    if (Object.values(state.stations).some((s) => s.systemId === sysId && state.empires[s.empireId].isPirate)) continue;
    const hops = Math.min(...homes.map((h) => findRoute(state, h, sysId)?.length ?? 99));
    if (hops > 2) continue;
    const sys = state.systems[sysId];
    for (const bid of [...sys.starIds, ...sys.bodyIds]) {
      const body = state.bodies[bid];
      for (const def of STATIONS) {
        if (def.requires === "__never__") continue;
        if (targeted.has(`${bid}|${def.id}`)) continue;
        if (stationBuildError(state, empire, def.id, body)) continue;
        const rich = def.richness ? body.richness[def.richness] : 1;
        const score = (stationValue(empire, def.id) * (0.4 + 0.6 * rich)) / (1 + hops * 0.7);
        if (!best || score > best.score) best = { bodyId: bid, type: def.id, score };
      }
    }
  }
  return best;
}

/** The most promising enemy colony to invade: weakest defended, smallest garrison. */
function invasionTarget(state: GameState, empire: Empire): Colony | null {
  let best: Colony | null = null;
  let bestScore = -Infinity;
  for (const c of Object.values(state.colonies)) {
    if (!isHostile(state, empire.id, c.empireId) || state.empires[c.empireId].isPirate) continue;
    const score = -c.defense / 50 - garrison(state, c) + c.pop * 0.3;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

function isIdle(f: Fleet): boolean {
  return !f.order && !f.transit;
}

function directCivilians(state: GameState, empire: Empire, owners: Record<string, string | null>, rng: Rng): void {
  for (const f of fleetsOf(state, empire.id)) {
    if (!isIdle(f)) continue;
    const role = roleOf(f);
    if (role === "scout") {
      const from = f.systemId!;
      const scouting = new Set(fleetsOf(state, empire.id).filter((o) => o !== f && o.order).map((o) => o.order!.systemId));
      const candidates = Object.keys(state.systems).filter((id) => !empire.explored[id] && !scouting.has(id));
      let best: string | null = null;
      let bestD = Infinity;
      for (const id of candidates) {
        const r = findRoute(state, from, id);
        if (r && r.length < bestD && r.length > 0) {
          bestD = r.length + rng.range(0, 0.9);
          best = id;
        }
      }
      if (best) moveFleet(state, empire.id, f.id, best, { bodyId: state.systems[best].starIds[0] });
    } else if (role === "constructor") {
      const site = bestStationSite(state, empire, owners);
      if (site) buildStationOrder(state, empire.id, f.id, site.bodyId, site.type);
    } else if (role === "colony") {
      const site = bestColonySite(state, empire, owners);
      if (site) colonizeOrder(state, empire.id, f.id, site.bodyId);
    }
  }
}

function directMilitary(state: GameState, empire: Empire, owners: Record<string, string | null>): void {
  const mil = fleetsOf(state, empire.id).filter((f) => fleetArmed(f));
  const capital = coloniesOf(state, empire.id).find((c) => c.capital) ?? coloniesOf(state, empire.id)[0];
  // Merge idle fleets sharing a location.
  for (let i = 0; i < mil.length; i++) {
    for (let j = i + 1; j < mil.length; j++) {
      const a = mil[i];
      const b = mil[j];
      if (!state.fleets[a.id] || !state.fleets[b.id]) continue;
      if (isIdle(a) && isIdle(b) && a.systemId === b.systemId && dist(a.pos, b.pos) < 1.5) mergeFleets(state, a, b);
    }
  }
  const fleets = fleetsOf(state, empire.id).filter((f) => fleetArmed(f));
  if (!fleets.length) return;
  fleets.sort((a, b) => fleetPower(state, b) - fleetPower(state, a));
  const main = fleets[0];
  const mainPower = fleetPower(state, main);

  // 1) Defend: hostile fleets inside our systems.
  for (const f of Object.values(state.fleets)) {
    if (!f.systemId || !f.ships.length || !isHostile(state, empire.id, f.empireId)) continue;
    if (owners[f.systemId] !== empire.id || !fleetArmed(f)) continue;
    const enemyPower = fleetPower(state, f);
    const defender = fleets.find((d) => fleetPower(state, d) > enemyPower * 0.9 && (isIdle(d) || d.order?.kind === "move"));
    if (defender) {
      defender.stance = "aggressive";
      moveFleet(state, empire.id, defender.id, f.systemId, { pos: { ...f.pos } });
      return;
    }
  }

  // 2) Gather transports into one assault group, then invade once it can win.
  const transports = fleetsOf(state, empire.id).filter((f) => isIdle(f) && f.ships.every((s) => HULL_MAP[s.hull].role === "transport"));
  for (let i = 1; i < transports.length; i++) {
    if (transports[i].systemId === transports[0].systemId && dist(transports[i].pos, transports[0].pos) < 1.5) mergeFleets(state, transports[0], transports[i]);
    else if (transports[0].systemId) moveFleet(state, empire.id, transports[i].id, transports[0].systemId, { pos: { ...transports[0].pos } });
  }
  const assault = transports[0];
  if (assault && state.fleets[assault.id]) {
    const target = invasionTarget(state, empire);
    const troops = assault.ships.reduce((s, sh) => s + (HULL_MAP[sh.hull].troops ?? 0), 0);
    if (target && target.defense <= 0 && troops >= garrison(state, target) * 1.25) invadeOrder(state, empire.id, assault.id, target.id);
  }

  if (!isIdle(main)) return;
  // 3) Offensive against enemies at war.
  const enemies = Object.entries(empire.relations)
    .filter(([id, r]) => r === "war" && state.empires[id].alive)
    .map(([id]) => state.empires[id]);
  let bestTarget: { systemId: string; bodyId: string; score: number } | null = null;
  const from = main.systemId!;
  for (const enemy of enemies) {
    if (enemy.isPirate) {
      for (const s of Object.values(state.stations)) {
        if (s.empireId !== enemy.id) continue;
        const r = findRoute(state, from, s.systemId);
        if (!r || r.length > 4) continue;
        const guard = Object.values(state.fleets).filter((g) => g.empireId === enemy.id && g.systemId === s.systemId).reduce((p, g) => p + fleetPower(state, g), 0);
        const needed = guard + 450;
        if (mainPower < needed * 1.4) continue;
        const score = 1 / (1 + r.length);
        if (!bestTarget || score > bestTarget.score) bestTarget = { systemId: s.systemId, bodyId: s.bodyId, score };
      }
      continue;
    }
    for (const c of coloniesOf(state, enemy.id)) {
      const r = findRoute(state, from, c.systemId);
      if (!r || r.length > 6) continue;
      const garrisonFleets = Object.values(state.fleets).filter((g) => g.empireId === enemy.id && g.systemId === c.systemId).reduce((p, g) => p + fleetPower(state, g), 0);
      const needed = garrisonFleets + colonyPower(state, c);
      if (mainPower < needed * 1.3) continue;
      const score = (c.pop + 2) / (1 + r.length) / (1 + needed / 500);
      if (!bestTarget || score > bestTarget.score) bestTarget = { systemId: c.systemId, bodyId: c.bodyId, score };
    }
  }
  if (bestTarget) {
    main.stance = "aggressive";
    moveFleet(state, empire.id, main.id, bestTarget.systemId, { bodyId: bestTarget.bodyId });
    return;
  }
  // 4) Otherwise return to guard the capital.
  if (capital && (main.systemId !== capital.systemId || main.orbitBodyId !== capital.bodyId)) {
    const capPos = bodyPosition(state, state.bodies[capital.bodyId]);
    if (main.systemId !== capital.systemId || dist(main.pos, capPos) > 2) moveFleet(state, empire.id, main.id, capital.systemId, { bodyId: capital.bodyId });
  }
}

function diplomacy(state: GameState, empire: Empire, owners: Record<string, string | null>, rng: Rng): void {
  const ai = empire.ai!;
  const myPower = empirePower(state, empire.id) + 1;
  const mine = new Set(ownedSystemIds(state, empire.id, owners));
  for (const other of Object.values(state.empires)) {
    if (other.id === empire.id || other.isPirate || !other.alive) continue;
    const rel = empire.relations[other.id];
    const theirPower = empirePower(state, other.id) + 1;
    const ratio = myPower / theirPower;
    if (rel === "peace") {
      if (ai.warCooldown > 0 || state.day < 250) continue;
      // Only neighbours (sharing a tunnel between owned systems) consider war.
      const neighbour = [...mine].some((sid) =>
        state.systems[sid].gates.some((g) => owners[g.otherSystemId] === other.id),
      );
      if (!neighbour) continue;
      const aggression = ai.personality === "militarist" ? 1.0 : ai.personality === "expansionist" ? 1.3 : 1.8;
      if (ratio > aggression && rng.chance(0.12)) {
        declareWar(state, empire.id, other.id);
        ai.warCooldown = 150;
        (ai.warStarted ??= {})[other.id] = state.day;
      }
    } else if (rel === "war" && !other.isPlayer) {
      const since = ai.warStarted?.[other.id] ?? state.day;
      const weary = state.day - since > 350 && rng.chance(0.08);
      if (((ratio < 0.7 && ai.warCooldown <= 0 && rng.chance(0.3)) || weary) && other.ai && aiAcceptsPeace(state, other, empire.id, rng)) {
        makePeace(state, empire.id, other.id);
      }
    }
  }
}

/** Does the AI accept a peace proposal from `fromId`? */
export function aiAcceptsPeace(state: GameState, empire: Empire, fromId: string, rng: Rng): boolean {
  if (!empire.ai) return true;
  const ratio = (empirePower(state, empire.id) + 1) / (empirePower(state, fromId) + 1);
  if (ratio < 0.8) return true;
  const since = empire.ai.warStarted?.[fromId];
  if (since !== undefined && state.day - since > 300 && ratio < 1.3) return true;
  if (empire.ai.warCooldown <= 0 && ratio < 1.5) return rng.chance(0.5);
  return false;
}
