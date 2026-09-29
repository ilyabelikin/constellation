// Economy: habitability, population growth, production, upkeep, construction
// queues and research. Everything here runs once per game day.

import { PLANET_TYPE_MAP } from "./data/planets";
import { STAR_TYPE_MAP } from "./data/stars";
import { HULL_MAP } from "./data/ships";
import { BUILDING_MAP, STATION_MAP, SPECIES_MAP, type BuildingDef, type StationDef } from "./data/structures";
import { TECHS, TECH_MAP, type TechDef } from "./data/techs";
import { modifiers, hasTech } from "./modifiers";
import { canAfford, clamp, log, pay } from "./util";
import type { Body, Colony, Empire, GameState, QueueItem, ResourceKey, Resources, Station, Yields } from "./types";

/** A homeworld's own output is modest: growth has to come from buildings, stations and colonies. */
export const CAPITAL_YIELDS: Required<Yields> = { credits: 3, metals: 2, energy: 2, research: 1.5, exotics: 0 };
/** What each unit of population consumes per day: services (credits), consumer goods (metals) and life support (energy). */
export const POP_UPKEEP: Required<Yields> = { credits: 0, metals: 0.06, energy: 0.1, research: 0, exotics: 0 };
export const CAPITAL_DEFENSE = 350;
export const POP_CREDITS = 0.15;
export const POP_RESEARCH = 0.06;

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

/** Below this a world is too hostile to settle; Xeno-Adaptation and Terraforming bring more worlds over the line. */
export const MIN_COLONY_HABITABILITY = 0.4;

/** Unsettled worlds in systems we have explored that we could colonise now. */
function settleableWorlds(state: GameState, empire: Empire): Set<string> {
  const taken = new Set(Object.values(state.colonies).map((c) => c.bodyId));
  const out = new Set<string>();
  for (const b of Object.values(state.bodies)) if (empire.explored[b.systemId] && !taken.has(b.id) && canColonize(empire, b)) out.add(b.id);
  return out;
}

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

/** Intrinsic population growth rate per day (per pop, before habitability and techs). */
export const POP_GROWTH_RATE = 0.0065;

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
  // Logistic growth: slow while a colony is tiny, fastest around half of
  // capacity, levelling off as the world fills up. A trickle of births keeps
  // even a handful of settlers growing.
  const r = POP_GROWTH_RATE * (0.5 + hab) * Math.max(0.1, 1 + m.popGrowth);
  const rate = r * Math.max(colony.pop, 0.25) * (1 - colony.pop / cap);
  colony.pop = Math.min(cap, colony.pop + rate * days);
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
  /** Where the upkeep goes: population, buildings, stations, fleet, new colonies settling in, administration. */
  upkeepBy: Record<string, Required<Yields>>;
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
    add(out, buildingOutput(def, body, colony.pop, def.workers > 0 ? employment : 1));
  }
  return out;
}

/**
 * What one building yields on a world: deposit buildings scale with the
 * planet's richness, workforce buildings (trade, research) with population.
 */
export function buildingOutput(def: BuildingDef, body: Body, pop: number, staff = 1): Required<Yields> {
  const out = zero();
  const rich = def.richness ? richnessFactor(body.richness[def.richness]) : 1;
  add(out, def.yields, staff * rich);
  if (def.perPop) add(out, def.perPop, staff * pop);
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

/** Days a new colony leans on the empire before it supports itself. */
export const SETTLEMENT_DAYS = 240;
/** What a brand-new colony draws from the treasury each day (fading to nothing over SETTLEMENT_DAYS). */
export const SETTLEMENT_UPKEEP: Required<Yields> = { credits: 1.2, metals: 0.6, energy: 0.5, exotics: 0, research: 0 };

/** Supplies a young colony still needs shipped in (zero once it is established). */
export function settlementUpkeep(state: GameState, colony: Colony): Required<Yields> {
  const out = zero();
  if (colony.capital) return out;
  const f = 1 - (state.day - colony.founded) / SETTLEMENT_DAYS;
  if (f > 0) add(out, SETTLEMENT_UPKEEP, f);
  return out;
}

/** Total credits/day of administrative overhead for `n` colonies. */
export function adminUpkeep(n: number): number {
  if (n <= 1) return 0;
  return (n - 1) * (0.8 + 0.16 * (n - 1));
}

/** Full per-day income report for an empire. */
export function incomeReport(state: GameState, empire: Empire): IncomeReport {
  const gross = zero();
  const upkeep = zero();
  const lines: IncomeLine[] = [];
  const m = modifiers(empire);
  const upkeepBy: Record<string, Required<Yields>> = {};
  const spend = (what: string, y: Yields, mult = 1) => {
    add(upkeep, y, mult);
    add((upkeepBy[what] ??= zero()), y, mult);
  };
  let colonyCount = 0;
  for (const c of Object.values(state.colonies)) {
    if (c.empireId !== empire.id) continue;
    colonyCount++;
    const p = colonyProduction(state, c);
    add(gross, p);
    lines.push({ source: c.name, yields: p });
    for (const b of c.buildings) spend("Buildings", BUILDING_MAP[b.type]?.upkeep ?? {});
    spend("New colonies settling in", settlementUpkeep(state, c));
    spend("Population", POP_UPKEEP, c.pop);
  }
  // Administration: every colony costs upkeep that grows with empire size, curbing sprawl.
  spend("Administration", { credits: adminUpkeep(colonyCount) });
  for (const s of Object.values(state.stations)) {
    if (s.empireId !== empire.id) continue;
    const p = stationProduction(state, s);
    add(gross, p);
    spend("Stations", stationUpkeep(s));
  }
  for (const f of Object.values(state.fleets)) {
    if (f.empireId !== empire.id) continue;
    for (const ship of f.ships) spend("Fleet", HULL_MAP[ship.hull]?.upkeep ?? {});
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
  return { gross, upkeep, net, lines, upkeepBy };
}

export function isBlackout(empire: Empire): boolean {
  return empire.resources.energy <= 0 && empire.income.energy < 0;
}

/** Out of credits and still spending: crews go unpaid (slower construction, no ship repairs). */
export function isBankrupt(empire: Empire): boolean {
  return empire.resources.credits <= 0 && empire.income.credits < 0;
}

/** Final cost of a hull for an empire: tech discounts, and colony ships get pricier per colony. */
export function hullCost(state: GameState, empire: Empire, hullId: string): Partial<Resources> {
  const hull = HULL_MAP[hullId];
  let mult = 1 - modifiers(empire).shipCost;
  if (hull.role === "colony") {
    let colonies = 0;
    for (const c of Object.values(state.colonies)) if (c.empireId === empire.id) colonies++;
    mult *= Math.min(6, 1 + 0.4 * Math.max(0, colonies - 1));
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
    const before = empire.isPlayer && tech.effects.habitability ? settleableWorlds(state, empire) : null;
    r.completed.push(tech.id);
    r.current = null;
    if (empire.isPlayer) log(state, "research", `${empire.name} completed ${tech.name}.`, empire.id);
    if (before) {
      // Better adapted colonists: worlds that were too hostile may now be settled.
      const opened = [...settleableWorlds(state, empire)].filter((id) => !before.has(id)).map((id) => state.bodies[id]);
      if (opened.length) {
        const names = opened.slice(0, 4).map((b) => b.name).join(", ") + (opened.length > 4 ? ` and ${opened.length - 4} more` : "");
        log(state, "colony", `${tech.name} makes ${opened.length === 1 ? "a new world" : `${opened.length} new worlds`} habitable for us: ${names}. Find them under the Colonize badge.`, empire.id, opened[0].systemId, { kind: "body", id: opened[0].id, systemId: opened[0].systemId });
      }
    }
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
/** Who holds colonies in a system (strongest first); more than one means it is contested. */
export function systemHolders(state: GameState, systemId: string): { empireId: string; colonies: Colony[]; weight: number }[] {
  const by = new Map<string, { empireId: string; colonies: Colony[]; weight: number }>();
  for (const c of Object.values(state.colonies)) {
    if (c.systemId !== systemId) continue;
    const h = by.get(c.empireId) ?? { empireId: c.empireId, colonies: [], weight: 0 };
    h.colonies.push(c);
    h.weight += 100 + c.pop;
    by.set(c.empireId, h);
  }
  return [...by.values()].sort((a, b) => b.weight - a.weight);
}

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

/** Optional precomputed lookups so hot callers (the AI) avoid rescanning all stations/colonies. */
export interface SiteContext {
  owners: Record<string, string | null>;
  stationsByBody: Map<string, Station[]>;
  colonyByBody: Map<string, Colony>;
}

export function siteContext(state: GameState): SiteContext {
  const stationsByBody = new Map<string, Station[]>();
  for (const st of Object.values(state.stations)) {
    const list = stationsByBody.get(st.bodyId);
    if (list) list.push(st);
    else stationsByBody.set(st.bodyId, [st]);
  }
  const colonyByBody = new Map<string, Colony>();
  for (const c of Object.values(state.colonies)) colonyByBody.set(c.bodyId, c);
  return { owners: systemOwnerMap(state), stationsByBody, colonyByBody };
}

/** Can `empire` build station `type` on `body`? Returns an error string or null. */
export function stationBuildError(state: GameState, empire: Empire, type: string, body: Body, ctx?: SiteContext): string | null {
  const def = STATION_MAP[type];
  if (!def) return "Unknown station";
  if (!hasTech(empire, def.requires) || def.requires === "__never__") return "Technology required";
  if (!stationAllowedOn(def, body)) return `A ${def.name} cannot be built on ${body.name}`;
  const owner = ctx ? ctx.owners[body.systemId] : systemOwner(state, body.systemId);
  if (owner && owner !== empire.id && !state.empires[owner]?.isPirate) return "System is claimed by another empire";
  const existing = ctx ? (ctx.stationsByBody.get(body.id) ?? []) : stationsOnBody(state, body.id);
  if (def.upgradeOf) {
    if (!existing.some((s) => s.type === def.upgradeOf && s.empireId === empire.id)) return `Requires a ${STATION_MAP[def.upgradeOf].name} here first`;
  } else if (existing.some((s) => s.type === type)) return "Already built here";
  else if (existing.some((s) => s.empireId !== empire.id)) return "Another empire has a station here";
  const colony = ctx ? ctx.colonyByBody.get(body.id) : Object.values(state.colonies).find((c) => c.bodyId === body.id);
  if (colony && colony.empireId !== empire.id) return "Colonised by another empire";
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
  // Deficits: clamp stockpiles; running out has consequences (blackout, bankruptcy).
  for (const k of ["credits", "metals", "energy", "exotics"] as ResourceKey[]) {
    if (res[k] < 0) res[k] = 0;
  }
  if (isBankrupt(empire) && empire.isPlayer && state.day - (empire.bankruptWarnedAt ?? -999) >= 30) {
    empire.bankruptWarnedAt = state.day;
    log(state, "danger", "The treasury is empty! Unpaid crews: construction runs at half speed and ships are not repaired. Cut fleet upkeep or raise income.", empire.id);
  }
  // Soft storage cap to keep hoarding in check.
  const cap = storageCap(state, empire);
  for (const k of ["credits", "metals", "energy"] as ResourceKey[]) res[k] = Math.min(res[k], cap);
  applyResearch(state, empire, Math.max(0, report.net.research));
}

export function storageCap(state: GameState, empire: Empire): number {
  let colonies = 0;
  for (const c of Object.values(state.colonies)) if (c.empireId === empire.id) colonies++;
  return 1000 + colonies * 400;
}

export function processColonyDay(
  state: GameState,
  colony: Colony,
  onShipBuilt: (c: Colony, item: Extract<QueueItem, { kind: "ship" }>) => void,
): void {
  const empire = state.empires[colony.empireId];
  growPopulation(state, colony);
  // Defense regeneration after 3 quiet days.
  const maxD = maxDefense(state, colony);
  if (state.day - colony.lastAttacked > 3) colony.defense = Math.min(maxD, colony.defense + maxD * 0.08);
  colony.defense = Math.min(colony.defense, maxD);
  // Construction queue: one item at a time. Items queued before they were
  // affordable are paid when their turn comes; while one waits for resources,
  // the next item that can go ahead does.
  let item: QueueItem | undefined;
  for (const q of colony.queue) {
    if (q.unpaid) {
      const cost = q.kind === "ship" ? hullCost(state, empire, q.type) : BUILDING_MAP[q.type].cost;
      if (!canAfford(empire.resources, cost)) {
        if (!q.waiting && empire.isPlayer)
          log(state, "construction", `${colony.name}: ${q.kind === "ship" ? HULL_MAP[q.type].name : BUILDING_MAP[q.type].name} is waiting for resources.`, empire.id, colony.systemId, { kind: "body", id: colony.bodyId, systemId: colony.systemId });
        q.waiting = true;
        continue;
      }
      pay(empire.resources, cost);
      if (q.kind === "ship") q.paid = cost;
      delete q.unpaid;
      delete q.waiting;
    }
    item = q;
    break;
  }
  if (!item) return;
  const speed = (item.kind === "ship" ? 1 + modifiers(empire).shipBuildSpeed : 1) * (isBankrupt(empire) ? 0.5 : 1);
  const besieged = colony.defense <= 0 && state.day - colony.lastAttacked < 2;
  if (besieged) return;
  item.progress += speed;
  if (item.progress + 1e-9 >= item.total) {
    colony.queue.splice(colony.queue.indexOf(item), 1);
    if (item.kind === "building") {
      colony.buildings.push({ type: item.type });
      if (empire.isPlayer)
        log(state, "construction", `${BUILDING_MAP[item.type].name} completed on ${colony.name}.`, empire.id, colony.systemId, { kind: "body", id: colony.bodyId, systemId: colony.systemId });
      if (BUILDING_MAP[item.type].defense) colony.defense = Math.min(maxDefense(state, colony), colony.defense + BUILDING_MAP[item.type].defense!);
    } else {
      onShipBuilt(colony, item);
    }
  }
}
