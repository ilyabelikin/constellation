// Economy: habitability, population growth, production, upkeep, construction
// queues and research. Everything here runs once per game day.

import { PLANET_TYPE_MAP } from "./data/planets";
import { STAR_TYPE_MAP } from "./data/stars";
import { HULL_MAP } from "./data/ships";
import { BUILDING_MAP, STATION_MAP, SPECIES_MAP, type StationDef } from "./data/structures";
import { TECHS, TECH_MAP, type TechDef } from "./data/techs";
import { modifiers, hasTech } from "./modifiers";
import { clamp, log } from "./util";
import type { Body, Colony, Empire, GameState, ResourceKey, Resources, Station, Yields } from "./types";

export const CAPITAL_YIELDS: Required<Yields> = { credits: 4, metals: 3, energy: 5, research: 3, exotics: 0 };
export const CAPITAL_DEFENSE = 350;
export const POP_CREDITS = 0.25;
export const POP_RESEARCH = 0.05;

// --------------------------------------------------------------------------
// Habitability & population

export function habitability(empire: Empire, body: Body): number {
  if (body.kind !== "planet" && body.kind !== "moon") return 0;
  const pt = PLANET_TYPE_MAP[body.type];
  if (!pt || pt.size[1] === 0 || body.size === 0) return 0;
  const species = SPECIES_MAP[empire.speciesId];
  let h = pt.habitability;
  if (species) {
    if (species.lithoid && ["barren", "volcanic", "crystal", "martian"].includes(pt.id)) h = Math.max(h, 0.5);
    if (species.preferred.includes(pt.id)) h += 0.2;
    if (species.machine) h = clamp(Math.max(h, 0.6), 0, 0.8);
  }
  if (body.features.includes("homeworld")) h = Math.max(h, 1);
  h += modifiers(empire).habitability;
  return clamp(h, 0, 1);
}

export const MIN_COLONY_HABITABILITY = 0.2;

export function canColonize(empire: Empire, body: Body): boolean {
  return habitability(empire, body) >= MIN_COLONY_HABITABILITY;
}

export function popCapacity(state: GameState, colony: Colony): number {
  const body = state.bodies[colony.bodyId];
  const empire = state.empires[colony.empireId];
  const hab = habitability(empire, body);
  const m = modifiers(empire);
  let cap = body.size * 3.5 * hab * (1 + m.popCapacity);
  for (const b of colony.buildings) cap += BUILDING_MAP[b.type]?.capacity ?? 0;
  if (colony.capital) cap += 2;
  return Math.max(1, cap);
}

export function buildingSlots(state: GameState, colony: Colony): number {
  const body = state.bodies[colony.bodyId];
  const bySize = body.size * 2 + 2;
  const byPop = 2 + Math.floor(colony.pop / 2);
  return Math.min(bySize, byPop);
}

export function maxDefense(state: GameState, colony: Colony): number {
  const empire = state.empires[colony.empireId];
  let d = colony.capital ? CAPITAL_DEFENSE : 60;
  for (const b of colony.buildings) d += BUILDING_MAP[b.type]?.defense ?? 0;
  return d * (1 + modifiers(empire).defense);
}

export function garrison(state: GameState, colony: Colony): number {
  const empire = state.empires[colony.empireId];
  let g = 2 + colony.pop * 0.35 + modifiers(empire).garrison + (colony.capital ? 4 : 0);
  for (const b of colony.buildings) g += BUILDING_MAP[b.type]?.garrison ?? 0;
  return g;
}

export function growPopulation(state: GameState, colony: Colony, days = 1): void {
  const empire = state.empires[colony.empireId];
  const body = state.bodies[colony.bodyId];
  const hab = habitability(empire, body);
  const cap = popCapacity(state, colony);
  const m = modifiers(empire);
  if (colony.pop > cap) {
    colony.pop = Math.max(cap, colony.pop - colony.pop * 0.01 * days);
    return;
  }
  const rate = (0.025 + 0.01 * colony.pop) * (0.5 + hab) * Math.max(0.1, 1 + m.popGrowth);
  colony.pop = Math.min(cap, colony.pop + rate * (1 - colony.pop / cap) * days);
}

// --------------------------------------------------------------------------
// Production

export interface IncomeLine {
  source: string;
  yields: Yields;
}

export interface IncomeReport {
  gross: Required<Yields>;
  upkeep: Required<Yields>;
  net: Required<Yields>;
  lines: IncomeLine[];
}

function zero(): Required<Yields> {
  return { credits: 0, metals: 0, energy: 0, exotics: 0, research: 0 };
}

function add(target: Required<Yields>, y: Yields, mult = 1): void {
  for (const k of Object.keys(y) as (keyof Yields)[]) target[k] += (y[k] ?? 0) * mult;
}

function richnessFactor(r: number): number {
  return 0.4 + 0.6 * r;
}

/** Production of a single colony before empire-wide multipliers. */
export function colonyProduction(state: GameState, colony: Colony): Required<Yields> {
  const body = state.bodies[colony.bodyId];
  const out = zero();
  out.credits += colony.pop * POP_CREDITS;
  out.research += colony.pop * POP_RESEARCH;
  if (colony.capital) add(out, CAPITAL_YIELDS);
  const workersNeeded = colony.buildings.reduce((s, b) => s + (BUILDING_MAP[b.type]?.workers ?? 0), 0);
  const employment = workersNeeded > 0 ? Math.min(1, colony.pop / workersNeeded) : 1;
  for (const b of colony.buildings) {
    const def = BUILDING_MAP[b.type];
    if (!def) continue;
    const staff = def.workers > 0 ? employment : 1;
    const rich = def.richness ? richnessFactor(body.richness[def.richness]) : 1;
    add(out, def.yields, staff * rich);
    if (def.perPop) add(out, def.perPop, staff * colony.pop);
  }
  return out;
}

export function stationProduction(state: GameState, station: Station): Required<Yields> {
  const def = STATION_MAP[station.type];
  const out = zero();
  if (!def) return out;
  const empire = state.empires[station.empireId];
  const m = modifiers(empire);
  const body = state.bodies[station.bodyId];
  let mult = 1 + m.stationOutput;
  if (def.targets.includes("star")) {
    const st = STAR_TYPE_MAP[body.type];
    mult *= (st?.solar ?? 0) * (body.parentId ? 0.8 : 1) * (1 + m.solar);
  } else if (def.richness) {
    mult *= richnessFactor(body.richness[def.richness]);
  }
  if (def.id === "research_station" && body.features.includes("artifact")) mult *= 1 + m.artifacts;
  add(out, def.yields, mult);
  return out;
}

export function stationUpkeep(station: Station): Yields {
  return STATION_MAP[station.type]?.upkeep ?? {};
}

/** Total credits/day of administrative overhead for `n` colonies. */
export function adminUpkeep(n: number): number {
  if (n <= 1) return 0;
  return (n - 1) * (0.6 + 0.09 * (n - 1));
}

/** Full per-day income report for an empire. */
export function incomeReport(state: GameState, empire: Empire): IncomeReport {
  const gross = zero();
  const upkeep = zero();
  const lines: IncomeLine[] = [];
  const m = modifiers(empire);
  let colonyCount = 0;
  for (const c of Object.values(state.colonies)) {
    if (c.empireId !== empire.id) continue;
    colonyCount++;
    const p = colonyProduction(state, c);
    add(gross, p);
    lines.push({ source: c.name, yields: p });
    for (const b of c.buildings) add(upkeep, BUILDING_MAP[b.type]?.upkeep ?? {});
  }
  // Administration: every colony costs upkeep that grows with empire size, curbing sprawl.
  upkeep.credits += adminUpkeep(colonyCount);
  for (const s of Object.values(state.stations)) {
    if (s.empireId !== empire.id) continue;
    const p = stationProduction(state, s);
    add(gross, p);
    add(upkeep, stationUpkeep(s));
  }
  for (const f of Object.values(state.fleets)) {
    if (f.empireId !== empire.id) continue;
    for (const ship of f.ships) add(upkeep, HULL_MAP[ship.hull]?.upkeep ?? {});
  }
  // Empire-wide multipliers apply to gross production.
  gross.credits *= 1 + m.credits;
  gross.metals *= 1 + m.metals;
  gross.energy *= 1 + m.energy;
  gross.research *= 1 + m.research;
  gross.exotics *= 1 + m.exotics;
  // Energy blackout: when the grid is dry, industry and science suffer.
  if (empire.resources.energy <= 0 && gross.energy < upkeep.energy) {
    gross.metals *= 0.6;
    gross.research *= 0.6;
    gross.credits *= 0.8;
  }
  const net = zero();
  for (const k of Object.keys(net) as (keyof Yields)[]) net[k] = gross[k] - upkeep[k];
  return { gross, upkeep, net, lines };
}

export function isBlackout(empire: Empire): boolean {
  return empire.resources.energy <= 0 && empire.income.energy < 0;
}

/** Final cost of a hull for an empire: tech discounts, and colony ships get pricier per colony. */
export function hullCost(state: GameState, empire: Empire, hullId: string): Partial<Resources> {
  const hull = HULL_MAP[hullId];
  let mult = 1 - modifiers(empire).shipCost;
  if (hull.role === "colony") {
    let colonies = 0;
    for (const c of Object.values(state.colonies)) if (c.empireId === empire.id) colonies++;
    mult *= Math.min(6, 1 + 0.3 * Math.max(0, colonies - 1));
  }
  const out: Partial<Resources> = {};
  for (const [k, v] of Object.entries(hull.cost) as [keyof Resources, number][]) out[k] = Math.round(v * mult);
  return out;
}

/** Fleet command capacity: grows with colonies and a few techs. */
export function commandCapacity(state: GameState, empire: Empire): number {
  let colonies = 0;
  for (const c of Object.values(state.colonies)) if (c.empireId === empire.id) colonies++;
  const t = empire.research.completed;
  const bonus = (t.includes("destroyers") ? 6 : 0) + (t.includes("cruisers") ? 8 : 0) + (t.includes("battleships") ? 10 : 0) + (t.includes("titans") ? 16 : 0);
  return 12 + colonies * 3 + bonus;
}

export function commandUsed(state: GameState, empire: Empire): number {
  let used = 0;
  for (const f of Object.values(state.fleets)) {
    if (f.empireId !== empire.id) continue;
    for (const s of f.ships) used += HULL_MAP[s.hull].command;
  }
  for (const c of Object.values(state.colonies)) {
    if (c.empireId !== empire.id) continue;
    for (const q of c.queue) if (q.kind === "ship") used += HULL_MAP[q.type].command;
  }
  return used;
}

// --------------------------------------------------------------------------
// Research

export function availableTechs(empire: Empire): TechDef[] {
  return TECHS.filter(
    (t) => !empire.research.completed.includes(t.id) && t.requires.every((r) => empire.research.completed.includes(r)),
  );
}

/** Wider empires pay more for research (+7% per colony beyond the first). */
export function techCost(state: GameState, empire: Empire, tech: TechDef): number {
  let colonies = 0;
  for (const c of Object.values(state.colonies)) if (c.empireId === empire.id) colonies++;
  return Math.round(tech.cost * (1 + 0.07 * Math.max(0, colonies - 1)));
}

export function applyResearch(state: GameState, empire: Empire, points: number): void {
  const r = empire.research;
  let remaining = points;
  let guard = 0;
  while (remaining > 0 && guard++ < 5) {
    if (!r.current || r.completed.includes(r.current)) {
      r.current = null;
      while (r.queue.length && !r.current) {
        const next = r.queue.shift()!;
        const td = TECH_MAP[next];
        if (td && !r.completed.includes(next) && td.requires.every((q) => r.completed.includes(q))) r.current = next;
      }
      if (!r.current) {
        // Idle labs automatically pick the cheapest available project so science is never wasted.
        const avail = availableTechs(empire).filter((t) => t.id !== "ascension");
        if (!avail.length) return;
        avail.sort((a, b) => a.cost - b.cost);
        r.current = avail[0].id;
        if (empire.isPlayer) log(state, "research", `Research idle — scientists began ${avail[0].name}.`, empire.id);
      }
    }
    const tech = TECH_MAP[r.current!];
    const cost = techCost(state, empire, tech);
    const have = r.progress[tech.id] ?? 0;
    const need = cost - have;
    if (remaining < need) {
      r.progress[tech.id] = have + remaining;
      return;
    }
    // Ascension also consumes exotics when it completes.
    if (tech.exoticsCost && empire.resources.exotics < tech.exoticsCost) {
      r.progress[tech.id] = cost;
      return;
    }
    if (tech.exoticsCost) empire.resources.exotics -= tech.exoticsCost;
    remaining -= need;
    r.progress[tech.id] = cost;
    r.completed.push(tech.id);
    r.current = null;
    log(state, "research", `${empire.name} completed ${tech.name}.`, empire.isPlayer ? empire.id : null);
    if (tech.id === "ascension") {
      state.winner = empire.id;
      state.victoryType = "ascension";
      log(state, empire.isPlayer ? "victory" : "defeat", `${empire.name} has ascended beyond the physical realm!`, null);
    }
  }
}

// --------------------------------------------------------------------------
// Construction

export function stationAllowedOn(def: StationDef, body: Body): boolean {
  if (def.requires === "__never__") return false;
  const pt = PLANET_TYPE_MAP[body.type];
  for (const t of def.targets) {
    if (t === "any") return true;
    if (t === "star" && body.kind === "star") return true;
    if (t === "belt" && body.kind === "belt") return true;
    if (t === "gas" && pt?.giant) return true;
    if (t === "rocky" && (body.kind === "planet" || body.kind === "moon" || body.kind === "comet") && !pt?.giant) return true;
    if (t === "exotic") {
      if (body.kind === "star" && (STAR_TYPE_MAP[body.type]?.exotics ?? 0) > 0) return true;
      if (body.kind === "belt" && body.type === "crystalline") return true;
      if (body.richness.exotics >= 0.5) return true;
    }
  }
  return false;
}

export function stationsOnBody(state: GameState, bodyId: string): Station[] {
  return Object.values(state.stations).filter((s) => s.bodyId === bodyId);
}

/** Who owns a system: the empire with the most population there, else most stations. */
export function systemOwner(state: GameState, systemId: string): string | null {
  const score: Record<string, number> = {};
  for (const c of Object.values(state.colonies)) {
    if (c.systemId === systemId) score[c.empireId] = (score[c.empireId] ?? 0) + 100 + c.pop;
  }
  for (const s of Object.values(state.stations)) {
    if (s.systemId === systemId) score[s.empireId] = (score[s.empireId] ?? 0) + 1;
  }
  let best: string | null = null;
  let bestV = 0;
  for (const [id, v] of Object.entries(score)) {
    if (v > bestV) {
      best = id;
      bestV = v;
    }
  }
  return best;
}

/** Owner of every system. Computed in one pass over colonies & stations. */
export function systemOwnerMap(state: GameState): Record<string, string | null> {
  const score: Record<string, Record<string, number>> = {};
  const bump = (sys: string, emp: string, v: number) => {
    const s = (score[sys] ??= {});
    s[emp] = (s[emp] ?? 0) + v;
  };
  for (const c of Object.values(state.colonies)) bump(c.systemId, c.empireId, 100 + c.pop);
  for (const s of Object.values(state.stations)) bump(s.systemId, s.empireId, 1);
  const out: Record<string, string | null> = {};
  for (const id of Object.keys(state.systems)) {
    let best: string | null = null;
    let bestV = 0;
    for (const [emp, v] of Object.entries(score[id] ?? {})) {
      if (v > bestV) {
        best = emp;
        bestV = v;
      }
    }
    out[id] = best;
  }
  return out;
}

/** Can `empire` build station `type` on `body`? Returns an error string or null. */
export function stationBuildError(state: GameState, empire: Empire, type: string, body: Body): string | null {
  const def = STATION_MAP[type];
  if (!def) return "Unknown station";
  if (!hasTech(empire, def.requires) || def.requires === "__never__") return "Technology required";
  if (!stationAllowedOn(def, body)) return `A ${def.name} cannot be built on ${body.name}`;
  const owner = systemOwner(state, body.systemId);
  if (owner && owner !== empire.id && !state.empires[owner]?.isPirate) return "System is claimed by another empire";
  const existing = stationsOnBody(state, body.id);
  if (def.upgradeOf) {
    if (!existing.some((s) => s.type === def.upgradeOf && s.empireId === empire.id)) return `Requires a ${STATION_MAP[def.upgradeOf].name} here first`;
  } else if (existing.some((s) => s.type === type)) return "Already built here";
  else if (existing.some((s) => s.empireId !== empire.id)) return "Another empire has a station here";
  if (Object.values(state.colonies).some((c) => c.bodyId === body.id && c.empireId !== empire.id)) return "Colonised by another empire";
  return null;
}

// --------------------------------------------------------------------------
// Daily processing

export function processEconomyDay(state: GameState, empire: Empire): void {
  if (!empire.alive || empire.isPirate) return;
  const report = incomeReport(state, empire);
  empire.income = report.net;
  const res = empire.resources;
  for (const k of ["credits", "metals", "energy", "exotics"] as ResourceKey[]) {
    res[k] += report.net[k];
  }
  // Deficits: clamp stockpiles, energy can't go below zero (blackout handles penalty).
  for (const k of ["credits", "metals", "energy", "exotics"] as ResourceKey[]) {
    if (res[k] < 0) res[k] = 0;
  }
  // Soft storage cap to keep hoarding in check.
  const cap = storageCap(state, empire);
  for (const k of ["credits", "metals", "energy"] as ResourceKey[]) res[k] = Math.min(res[k], cap);
  applyResearch(state, empire, Math.max(0, report.net.research));
}

export function storageCap(state: GameState, empire: Empire): number {
  let colonies = 0;
  for (const c of Object.values(state.colonies)) if (c.empireId === empire.id) colonies++;
  return 2000 + colonies * 750;
}

export function processColonyDay(state: GameState, colony: Colony, onShipBuilt: (c: Colony, hull: string) => void): void {
  const empire = state.empires[colony.empireId];
  growPopulation(state, colony);
  // Defense regeneration after 3 quiet days.
  const maxD = maxDefense(state, colony);
  if (state.day - colony.lastAttacked > 3) colony.defense = Math.min(maxD, colony.defense + maxD * 0.08);
  colony.defense = Math.min(colony.defense, maxD);
  // Construction queue: one item at a time.
  const item = colony.queue[0];
  if (!item) return;
  const speed = item.kind === "ship" ? 1 + modifiers(empire).shipBuildSpeed : 1;
  const besieged = colony.defense <= 0 && state.day - colony.lastAttacked < 2;
  if (besieged) return;
  item.progress += speed;
  if (item.progress + 1e-9 >= item.total) {
    colony.queue.shift();
    if (item.kind === "building") {
      colony.buildings.push({ type: item.type });
      if (empire.isPlayer)
        log(state, "construction", `${BUILDING_MAP[item.type].name} completed on ${colony.name}.`, empire.id, colony.systemId);
      if (BUILDING_MAP[item.type].defense) colony.defense = Math.min(maxDefense(state, colony), colony.defense + BUILDING_MAP[item.type].defense!);
    } else {
      onShipBuilt(colony, item.type);
    }
  }
}
