// Procedural galaxy generation: spiral-armed star field, a planar tunnel
// network (Gabriel graph), rich star systems, empires and raider havens.

import { BELT_TYPES, PLANET_TYPES, planetType, type Zone } from "./data/planets";
import { STAR_TYPES, starType, type StarType } from "./data/stars";
import { HULL_MAP } from "./data/ships";
import { SPECIES, SPECIES_MAP, stationDef } from "./data/structures";
import { starName, planetName, moonName } from "./names";
import { orbitalPeriodDays, dist } from "./orbits";
import { Rng, hashString } from "./rng";
import { shipStats } from "./modifiers";
import type {
  Body,
  Colony,
  Empire,
  Fleet,
  GameSettings,
  GameState,
  Richness,
  Ship,
  StarSystem,
  Tunnel,
  Vec3,
} from "./types";

export const SAVE_VERSION = 1;

export const EMPIRE_COLORS = ["#4aa3ff", "#ff9d3c", "#b58cff", "#e84a5f", "#2ee6c5", "#ffd84a", "#7bff6b", "#ff6bd6"];

const AI_EMPIRE_NAMES: Record<string, string[]> = {
  terrans: ["Terran Union", "Sol Federation", "United Colonies"],
  vashari: ["Vashari Dominion", "Vashari Forge-Clans"],
  lumenari: ["Lumenari Concord", "Prism Collective"],
  kraal: ["Kraal Hive", "Kraal Swarm-Mind"],
  thalassi: ["Thalassi Tide", "Deepwater Accord"],
  aurelian: ["Aurelian Synod", "Aurelian Directive"],
};

export const DEFAULT_SETTINGS: GameSettings = {
  seed: "constellation",
  systemCount: 32,
  aiCount: 3,
  playerName: "Terran Union",
  playerSpecies: "terrans",
  playerColor: EMPIRE_COLORS[0],
  difficulty: "normal",
  pirates: true,
};

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function zoneFor(aAU: number, luminosity: number): Zone {
  const hz = Math.sqrt(Math.max(luminosity, 0.0004));
  const r = aAU / hz;
  if (r < 0.72) return "hot";
  if (r < 1.55) return "temperate";
  if (r < 4.2) return "cold";
  return "outer";
}

function richness(rng: Rng, base: Richness): Richness {
  return {
    metals: round1(base.metals * rng.range(0.6, 1.5)),
    energy: round1(base.energy * rng.range(0.6, 1.5)),
    research: round1(base.research * rng.range(0.6, 1.5)),
    exotics: round1(base.exotics * rng.range(0.6, 1.5)),
  };
}

function eqTemperature(aAU: number, luminosity: number): number {
  return Math.round(278 * Math.pow(Math.max(luminosity, 1e-6), 0.25) / Math.sqrt(Math.max(aAU, 0.01)));
}

export interface SystemOptions {
  starType?: string;
  homeSpecies?: string;
  forbidBinary?: boolean;
}

export interface GeneratedSystem {
  system: StarSystem;
  bodies: Body[];
}

export function generateSystem(
  rng: Rng,
  id: string,
  name: string,
  pos: Vec3,
  opts: SystemOptions = {},
): GeneratedSystem {
  const st: StarType = opts.starType
    ? starType(opts.starType)
    : rng.weighted(STAR_TYPES, (s) => s.weight);
  const bodies: Body[] = [];
  const luminosity = rng.range(st.luminosity[0], st.luminosity[1]);
  const mass = rng.range(st.mass[0], st.mass[1]);
  const star: Body = {
    id: `${id}-s0`,
    systemId: id,
    name,
    kind: "star",
    type: st.id,
    parentId: null,
    orbit: null,
    radius: rng.range(st.radius[0], st.radius[1]),
    size: 0,
    richness: { metals: 0, energy: st.solar, research: st.research, exotics: st.exotics },
    features: [],
    seed: rng.int(0, 1e9),
    axialTilt: rng.range(0, 0.3),
    rotation: rng.range(8, 30),
    luminosity,
    mass,
  };
  bodies.push(star);

  // Planets --------------------------------------------------------------
  const starRadiusAU = star.radius * 0.00465;
  const hz = Math.sqrt(Math.max(luminosity, 0.0004));
  let a = Math.max(0.2, 0.35 * hz, starRadiusAU * 12);
  a = Math.min(a, 3) * rng.range(1, 1.3);
  let count = rng.int(st.planets[0], st.planets[1]);
  if (opts.homeSpecies) count = Math.max(count, 5);
  const orbits: number[] = [];
  for (let i = 0; i < count; i++) {
    orbits.push(a);
    a *= rng.range(1.45, 1.85);
    if (a > 60) break;
  }

  const planets: Body[] = [];
  orbits.forEach((orbitA, i) => {
    const zone = zoneFor(orbitA, luminosity);
    const type = rng.weighted(PLANET_TYPES, (p) => p.zones[zone] ?? 0);
    const radius = rng.range(type.radius[0], type.radius[1]);
    const planet: Body = {
      id: `${id}-p${i}`,
      systemId: id,
      name: planetName(name, i),
      kind: "planet",
      type: type.id,
      parentId: star.id,
      orbit: {
        a: orbitA,
        e: rng.range(0, 0.08),
        period: orbitalPeriodDays(orbitA, mass),
        phase: rng.range(0, Math.PI * 2),
        inclination: rng.range(-0.04, 0.04),
        node: rng.range(0, Math.PI * 2),
        argPeri: rng.range(0, Math.PI * 2),
      },
      radius,
      size: rng.int(type.size[0], type.size[1]),
      richness: richness(rng, type.richness),
      features: [],
      seed: rng.int(0, 1e9),
      axialTilt: rng.range(-0.5, 0.5),
      rotation: type.giant ? rng.range(0.4, 0.8) : rng.range(0.8, 3) * (rng.chance(0.1) ? -1 : 1),
      temperatureK: eqTemperature(orbitA, luminosity),
    };
    if (rng.chance(type.ringChance)) {
      planet.features.push("rings");
      const inner = rng.range(1.25, 1.6);
      planet.ring = {
        inner,
        outer: inner + rng.range(0.6, 1.4),
        tilt: rng.range(-0.5, 0.5),
        color: rng.pick(type.visual.palette.slice(1, 4)),
        opacity: rng.range(0.45, 0.85),
      };
    }
    decorateFeatures(rng, planet);
    planets.push(planet);
  });

  // Homeworld: rewrite the best temperate-ish planet into a garden world.
  if (opts.homeSpecies) {
    const species = SPECIES_MAP[opts.homeSpecies];
    let best = planets[0];
    let bestScore = Infinity;
    for (const p of planets) {
      const score = Math.abs(Math.log((p.orbit!.a) / hz));
      if (score < bestScore && !planetType(p.type).giant) {
        best = p;
        bestScore = score;
      }
    }
    if (!best || planetType(best.type).giant) best = planets[Math.min(1, planets.length - 1)];
    const homeType = species?.preferred.find((t) => PLANET_TYPES.some((p) => p.id === t && p.habitability >= 0.5)) ?? "terran";
    best.type = species?.lithoid && species.id === "lumenari" ? "crystal" : homeType;
    const ht = planetType(best.type);
    best.radius = rng.range(0.95, 1.2);
    best.size = 4;
    best.features = ["homeworld"];
    best.ring = undefined;
    best.richness = {
      metals: Math.max(1, ht.richness.metals),
      energy: Math.max(0.8, ht.richness.energy),
      research: Math.max(0.8, ht.richness.research),
      exotics: ht.richness.exotics,
    };
    // Guarantee a gas giant and a belt for early stations.
    if (!planets.some((p) => planetType(p.type).giant)) {
      const outer = planets[planets.length - 1];
      if (outer !== best) {
        outer.type = "gas_giant";
        outer.radius = rng.range(8, 11);
        outer.size = 0;
        outer.richness = richness(rng, planetType("gas_giant").richness);
      }
    }
  }

  // Moons ----------------------------------------------------------------
  for (const p of planets) {
    const pt = planetType(p.type);
    const zone = zoneFor(p.orbit!.a, luminosity);
    let moonCount = 0;
    if (pt.giant) moonCount = rng.int(1, 5);
    else if (p.radius > 0.8) moonCount = rng.chance(0.6) ? rng.int(1, 2) : 0;
    else moonCount = rng.chance(0.25) ? 1 : 0;
    let moonA = p.radius * (p.ring ? p.ring.outer + 0.8 : 2.4);
    for (let m = 0; m < moonCount; m++) {
      const mr = moonRadius(rng, p.radius, pt.giant);
      const mt = rng.weighted(PLANET_TYPES, (t) => {
        if (t.moonWeight <= 0) return 0;
        if (zone === "hot" && (t.id === "arctic" || t.id === "ice_dwarf")) return 0;
        const earthlike = ["terran", "ocean", "jungle", "savanna", "arid", "tundra", "toxic"].includes(t.id);
        if ((zone === "outer" || zone === "cold") && earthlike && t.id !== "tundra") return 0;
        // Only large moons can hold an atmosphere, oceans or a biosphere.
        if (earthlike && mr < 0.3) return 0;
        if (t.id === "volcanic") return pt.giant ? 0.8 : zone === "hot" ? 0.6 : 0.05; // tidal heating
        return t.moonWeight;
      });
      moonA += Math.max(mr * 3, p.radius * 0.5) + rng.range(0.2, 0.8) * p.radius;
      const moon: Body = {
        id: `${p.id}m${m}`,
        systemId: id,
        name: moonName(p.name, m),
        kind: "moon",
        type: mt.id,
        parentId: p.id,
        orbit: {
          a: moonA,
          e: rng.range(0, 0.04),
          period: rng.range(2.5, 5) * (1 + m * 0.9),
          phase: rng.range(0, Math.PI * 2),
          inclination: rng.range(-0.15, 0.15) + (p.ring ? p.ring.tilt : 0),
          node: rng.range(0, Math.PI * 2),
          argPeri: 0,
        },
        radius: mr,
        size: mt.size[1] > 0 ? (mr >= 0.4 ? 2 : mr >= 0.2 ? 1 : 0) : 0,
        richness: richness(rng, mt.richness),
        features: ["tidallyLocked"],
        seed: rng.int(0, 1e9),
        axialTilt: rng.range(-0.2, 0.2),
        rotation: 0,
        temperatureK: p.temperatureK,
      };
      decorateFeatures(rng, moon);
      bodies.push(moon);
    }
  }

  // Asteroid belts -------------------------------------------------------
  const beltOrbits: number[] = [];
  const beltCount = (st.special === "protostar" ? 2 : 0) + (rng.chance(0.6) ? 1 : 0) + (rng.chance(0.25) ? 1 : 0) +
    (opts.homeSpecies ? 1 : 0);
  for (let b = 0; b < Math.min(beltCount, 3); b++) {
    let r: number;
    if (orbits.length >= 2 && rng.chance(0.65)) {
      const i = rng.int(0, orbits.length - 2);
      r = Math.sqrt(orbits[i] * orbits[i + 1]);
    } else {
      r = (orbits[orbits.length - 1] ?? 1) * rng.range(1.3, 1.7);
    }
    if (beltOrbits.some((o) => Math.abs(o - r) / r < 0.2)) continue;
    if (orbits.some((o) => Math.abs(o - r) / r < 0.14)) continue; // keep belts clear of planet orbits
    beltOrbits.push(r);
    const zone = zoneFor(r, luminosity);
    const bt = rng.weighted(BELT_TYPES, (t) => t.zones[zone] ?? 0);
    bodies.push({
      id: `${id}-b${b}`,
      systemId: id,
      name: `${name} ${bt.name}`,
      kind: "belt",
      type: bt.id,
      parentId: star.id,
      orbit: {
        a: r,
        e: 0,
        period: orbitalPeriodDays(r, mass),
        phase: rng.range(0, Math.PI * 2),
        inclination: rng.range(-0.03, 0.03),
        node: rng.range(0, Math.PI * 2),
        argPeri: 0,
      },
      radius: r * rng.range(0.05, 0.09),
      size: 0,
      richness: richness(rng, bt.richness),
      features: rng.chance(0.08) ? ["anomaly"] : [],
      seed: rng.int(0, 1e9),
      axialTilt: 0,
      rotation: 0,
    });
  }

  // Companion star ---------------------------------------------------------
  const outermost = Math.max(orbits[orbits.length - 1] ?? 2, ...beltOrbits, 2);
  if (!opts.forbidBinary && !opts.homeSpecies && rng.chance(0.18)) {
    const ct = rng.weighted(STAR_TYPES, (s) => (s.canBeCompanion ? s.weight : 0));
    const ca = outermost * rng.range(1.35, 1.7);
    bodies.push({
      id: `${id}-s1`,
      systemId: id,
      name: `${name} B`,
      kind: "star",
      type: ct.id,
      parentId: star.id,
      orbit: {
        a: ca,
        e: rng.range(0, 0.2),
        period: orbitalPeriodDays(ca, mass) * 1.5,
        phase: rng.range(0, Math.PI * 2),
        inclination: rng.range(-0.1, 0.1),
        node: rng.range(0, Math.PI * 2),
        argPeri: rng.range(0, Math.PI * 2),
      },
      radius: rng.range(ct.radius[0], ct.radius[1]),
      size: 0,
      richness: { metals: 0, energy: ct.solar * 0.8, research: ct.research, exotics: ct.exotics },
      features: [],
      seed: rng.int(0, 1e9),
      axialTilt: 0,
      rotation: rng.range(8, 30),
      luminosity: rng.range(ct.luminosity[0], ct.luminosity[1]),
      mass: rng.range(ct.mass[0], ct.mass[1]),
    });
  }

  // Comet ---------------------------------------------------------------------
  if (rng.chance(0.35)) {
    const ca = outermost * rng.range(0.7, 1.1);
    bodies.push({
      id: `${id}-c0`,
      systemId: id,
      name: `Comet ${name.split(" ")[0]}-${rng.int(1, 99)}`,
      kind: "comet",
      type: "comet",
      parentId: star.id,
      orbit: {
        a: ca,
        e: rng.range(0.7, 0.88),
        period: orbitalPeriodDays(ca, mass),
        phase: rng.range(0, Math.PI * 2),
        inclination: rng.range(-0.5, 0.5),
        node: rng.range(0, Math.PI * 2),
        argPeri: rng.range(0, Math.PI * 2),
      },
      radius: 0.05,
      size: 0,
      richness: { metals: 0.3, energy: 1.2, research: 0.8, exotics: 0.05 },
      features: rng.chance(0.2) ? ["anomaly"] : [],
      seed: rng.int(0, 1e9),
      axialTilt: 0,
      rotation: 1,
    });
  }

  bodies.push(...planets);
  const extentBase = Math.max(outermost, ...bodies.filter((b) => b.kind === "star" && b.orbit).map((b) => b.orbit!.a));
  const system: StarSystem = {
    id,
    name,
    pos,
    starIds: bodies.filter((b) => b.kind === "star").map((b) => b.id),
    bodyIds: bodies.filter((b) => b.kind !== "star").map((b) => b.id),
    gates: [],
    extent: extentBase * 1.25 + 1,
    nebula:
      st.special === "protostar"
        ? "#ff7a5a"
        : rng.chance(0.18)
          ? rng.pick(["#3a5dff", "#b04aff", "#ff4a8a", "#2ec4b6", "#ff8a3a"])
          : undefined,
  };
  return { system, bodies };
}

/**
 * Moon radius in Earth radii. Most moons are small next to their planet
 * (Luna is 0.27 R⊕, Ganymede 4% of Jupiter); large moons are rare.
 */
export function moonRadius(rng: Rng, parentRadius: number, parentGiant: boolean): number {
  const skew = Math.pow(rng.next(), 2.6); // heavily biased towards small
  if (parentGiant) {
    if (rng.chance(0.05)) return rng.range(0.4, 0.65); // a rare Titan/Ganymede-class moon
    return 0.03 + skew * 0.3;
  }
  if (rng.chance(0.04)) return parentRadius * rng.range(0.3, 0.5); // rare near-double planet
  return Math.max(0.02, parentRadius * (0.03 + skew * 0.22));
}

function decorateFeatures(rng: Rng, body: Body): void {
  const pt = planetType(body.type);
  if (pt.giant) {
    if (rng.chance(0.04)) body.features.push("anomaly");
    return;
  }
  if (pt.habitability < 0.3 && rng.chance(0.08)) {
    body.features.push("artifact");
    body.richness.research = round1(body.richness.research + 1.5);
  } else if (rng.chance(0.04)) {
    body.features.push("anomaly");
    body.richness.research = round1(body.richness.research + 1);
  }
}

// --------------------------------------------------------------------------
// Galaxy layout

export function layoutStars(rng: Rng, count: number): Vec3[] {
  const radius = 8.5 * Math.sqrt(count);
  const minDist = 6.5;
  const arms = rng.int(2, 4);
  const twist = rng.range(2.2, 3.2);
  const points: Vec3[] = [];
  let attempts = 0;
  while (points.length < count && attempts < count * 400) {
    attempts++;
    const r = radius * Math.sqrt(rng.range(0.02, 1));
    const arm = rng.int(0, arms - 1);
    const theta = (arm / arms) * Math.PI * 2 + (r / radius) * twist + rng.gaussian(0, 0.35);
    const p = { x: Math.cos(theta) * r, y: rng.gaussian(0, 1.2), z: Math.sin(theta) * r };
    if (points.every((q) => dist(p, q) >= minDist)) points.push(p);
  }
  // Relax the constraint if the spiral is too crowded.
  while (points.length < count) {
    const p = { x: rng.range(-radius, radius), y: 0, z: rng.range(-radius, radius) };
    if (points.every((q) => dist(p, q) >= minDist * 0.7)) points.push(p);
  }
  return points;
}

/** Gabriel graph over XZ positions, then prune some redundant long edges. */
export function buildTunnelGraph(rng: Rng, points: Vec3[]): [number, number][] {
  const edges: [number, number][] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const mx = (points[i].x + points[j].x) / 2;
      const mz = (points[i].z + points[j].z) / 2;
      const r2 = ((points[i].x - points[j].x) ** 2 + (points[i].z - points[j].z) ** 2) / 4;
      let ok = true;
      for (let k = 0; k < n && ok; k++) {
        if (k === i || k === j) continue;
        const d2 = (points[k].x - mx) ** 2 + (points[k].z - mz) ** 2;
        if (d2 < r2) ok = false;
      }
      if (ok) edges.push([i, j]);
    }
  }
  // Prune: remove ~22% of edges (longest first bias) while keeping connectivity and degree >= 2.
  const degree = new Array(n).fill(0);
  for (const [a, b] of edges) {
    degree[a]++;
    degree[b]++;
  }
  const sorted = [...edges].sort((e1, e2) => dist(points[e2[0]], points[e2[1]]) - dist(points[e1[0]], points[e1[1]]));
  let kept = new Set(edges.map((e) => `${e[0]}-${e[1]}`));
  for (const e of sorted) {
    if (!rng.chance(0.3)) continue;
    if (degree[e[0]] <= 2 || degree[e[1]] <= 2) continue;
    const key = `${e[0]}-${e[1]}`;
    kept.delete(key);
    if (!isConnected(n, [...kept].map((k) => k.split("-").map(Number) as [number, number]))) {
      kept.add(key);
      continue;
    }
    degree[e[0]]--;
    degree[e[1]]--;
  }
  kept = new Set(kept);
  return edges.filter((e) => kept.has(`${e[0]}-${e[1]}`));
}

export function isConnected(n: number, edges: [number, number][]): boolean {
  if (n === 0) return true;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  const seen = new Set<number>([0]);
  const stack = [0];
  while (stack.length) {
    const v = stack.pop()!;
    for (const w of adj[v]) if (!seen.has(w)) {
      seen.add(w);
      stack.push(w);
    }
  }
  return seen.size === n;
}

function hopDistances(n: number, edges: [number, number][], from: number): number[] {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  const d = new Array(n).fill(Infinity);
  d[from] = 0;
  const q = [from];
  while (q.length) {
    const v = q.shift()!;
    for (const w of adj[v]) if (d[w] === Infinity) {
      d[w] = d[v] + 1;
      q.push(w);
    }
  }
  return d;
}

/** Farthest-point selection of `k` systems by hop distance. */
export function pickSpreadSystems(rng: Rng, n: number, edges: [number, number][], k: number, exclude: number[] = []): number[] {
  const chosen: number[] = [];
  const all = hopDistances(n, edges, 0);
  // Start from a random peripheral node.
  const maxD = Math.max(...all.filter((x) => x < Infinity));
  const periphery = all.map((d, i) => [d, i]).filter(([d]) => d >= maxD - 1).map(([, i]) => i);
  let first = rng.pick(periphery);
  if (exclude.length) {
    const ds = exclude.map((e) => hopDistances(n, edges, e));
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (exclude.includes(i)) continue;
      const m = Math.min(...ds.map((d) => d[i]));
      if (m > best) {
        best = m;
        first = i;
      }
    }
  }
  chosen.push(first);
  const dists = [hopDistances(n, edges, first), ...exclude.map((e) => hopDistances(n, edges, e))];
  while (chosen.length < k) {
    let best = -1;
    let bestI = -1;
    for (let i = 0; i < n; i++) {
      if (chosen.includes(i) || exclude.includes(i)) continue;
      const m = Math.min(...dists.map((d) => d[i])) + rng.range(0, 0.5);
      if (m > best) {
        best = m;
        bestI = i;
      }
    }
    if (bestI < 0) break;
    chosen.push(bestI);
    dists.push(hopDistances(n, edges, bestI));
  }
  return chosen;
}

// --------------------------------------------------------------------------
// Whole game

export function makeShip(state: GameState, empire: Empire, hullId: string, name?: string): Ship {
  const hull = HULL_MAP[hullId];
  const stats = shipStats(empire, hull);
  state.idCounter += 1;
  return {
    id: `sh${state.idCounter.toString(36)}`,
    hull: hullId,
    name: name ?? `${hull.name} ${state.idCounter.toString(36).toUpperCase()}`,
    hull_hp: stats.hull,
    armor: stats.armor,
    shields: stats.shields,
    xp: 0,
  };
}

export function makeFleet(state: GameState, empire: Empire, systemId: string, pos: Vec3, name?: string): Fleet {
  state.idCounter += 1;
  empire.fleetCounter += 1;
  const fleet: Fleet = {
    id: `f${state.idCounter.toString(36)}`,
    empireId: empire.id,
    name: name ?? `${empire.isPirate ? "Raider Band" : "Fleet"} ${empire.fleetCounter}`,
    ships: [],
    systemId,
    pos: { ...pos },
    prevPos: { ...pos },
    vel: { x: 0, y: 0, z: 0 },
    thrust: { x: 0, y: 0, z: 0 },
    orbitBodyId: null,
    order: null,
    transit: null,
    stance: "aggressive",
    battleId: null,
  };
  state.fleets[fleet.id] = fleet;
  return fleet;
}

function makeEmpire(
  id: string,
  name: string,
  color: string,
  speciesId: string,
  isPlayer: boolean,
  isPirate: boolean,
  personality: NonNullable<Empire["ai"]>["personality"] | null,
): Empire {
  return {
    id,
    name,
    color,
    speciesId,
    isPlayer,
    isPirate,
    resources: isPirate
      ? { credits: 0, metals: 0, energy: 0, exotics: 0 }
      : { credits: 250, metals: 200, energy: 100, exotics: 0 },
    research: { current: null, progress: {}, completed: [], queue: [] },
    explored: {},
    relations: {},
    ai: personality ? { personality, nextThink: 1, targetSystemId: null, warCooldown: 120 } : null,
    alive: true,
    income: { credits: 0, metals: 0, energy: 0, exotics: 0, research: 0 },
    stats: { shipsBuilt: 0, shipsLost: 0, kills: 0, coloniesFounded: 0 },
    fleetCounter: 0,
  };
}

export function createGame(partial: Partial<GameSettings> = {}): GameState {
  const settings: GameSettings = { ...DEFAULT_SETTINGS, ...partial };
  const rng = new Rng(hashString(settings.seed));
  const state: GameState = {
    version: SAVE_VERSION,
    settings,
    day: 0,
    rngState: 0,
    idCounter: 0,
    systems: {},
    bodies: {},
    tunnels: {},
    empires: {},
    colonies: {},
    stations: {},
    fleets: {},
    battles: {},
    log: [],
    playerId: "e0",
    winner: null,
    victoryType: null,
    nextRaid: 160,
  };

  const n = Math.max(8, settings.systemCount);
  const points = layoutStars(rng, n);
  const edges = buildTunnelGraph(rng, points);
  const empireCount = 1 + Math.max(0, settings.aiCount);
  const homes = pickSpreadSystems(rng, n, edges, empireCount);
  const havens = settings.pirates ? pickSpreadSystems(rng, n, edges, Math.max(1, Math.round(n / 14)), homes) : [];

  // Empires ------------------------------------------------------------------
  const player = makeEmpire("e0", settings.playerName, settings.playerColor, settings.playerSpecies, true, false, null);
  state.empires[player.id] = player;
  const otherSpecies = rng.shuffle(SPECIES.filter((s) => s.id !== settings.playerSpecies).map((s) => s.id));
  const otherColors = EMPIRE_COLORS.filter((c) => c !== settings.playerColor);
  const personalities = rng.shuffle(["expansionist", "militarist", "scholar", "trader", "militarist", "expansionist"] as const);
  for (let i = 0; i < settings.aiCount; i++) {
    const sp = otherSpecies[i % otherSpecies.length];
    const names = AI_EMPIRE_NAMES[sp] ?? [SPECIES_MAP[sp].name];
    const e = makeEmpire(`e${i + 1}`, rng.pick(names), otherColors[i % otherColors.length], sp, false, false, personalities[i % personalities.length]);
    state.empires[e.id] = e;
  }
  let pirate: Empire | null = null;
  if (settings.pirates) {
    pirate = makeEmpire("pirates", "Void Raiders", "#8c8c8c", "pirates", false, true, null);
    state.empires[pirate.id] = pirate;
  }
  const empires = Object.values(state.empires);
  for (const a of empires) for (const b of empires) {
    if (a.id !== b.id) a.relations[b.id] = a.isPirate || b.isPirate ? "war" : "peace";
  }

  // Systems ------------------------------------------------------------------
  const used = new Set<string>();
  const majorEmpires = empires.filter((e) => !e.isPirate);
  const systemIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = `sys${i}`;
    systemIds.push(id);
    const homeIdx = homes.indexOf(i);
    const sysRng = rng.fork(i + 1);
    const name = starName(sysRng, used);
    const opts: SystemOptions = {};
    if (homeIdx >= 0) {
      const emp = majorEmpires[homeIdx];
      opts.homeSpecies = emp.speciesId;
      opts.starType = sysRng.pick(["yellow_dwarf", "orange_dwarf", "yellow_white", "yellow_dwarf"]);
    }
    const gen = generateSystem(sysRng, id, name, points[i], opts);
    state.systems[id] = gen.system;
    for (const b of gen.bodies) state.bodies[b.id] = b;
  }

  // Tunnels + gates ------------------------------------------------------------
  for (const [ia, ib] of edges) {
    const a = systemIds[ia];
    const b = systemIds[ib];
    const length = dist(points[ia], points[ib]);
    const tunnel: Tunnel = {
      id: `t${ia}_${ib}`,
      a,
      b,
      length,
      travelDays: Math.round((10 + length * 1.8) * 10) / 10,
    };
    state.tunnels[tunnel.id] = tunnel;
    addGate(state, tunnel, a, b);
    addGate(state, tunnel, b, a);
  }

  // Place empires ---------------------------------------------------------------
  majorEmpires.forEach((emp, idx) => {
    const sysId = systemIds[homes[idx]];
    const sys = state.systems[sysId];
    const home = sys.bodyIds.map((id) => state.bodies[id]).find((b) => b.features.includes("homeworld"))!;
    const colony: Colony = {
      id: `c_${emp.id}`,
      empireId: emp.id,
      bodyId: home.id,
      systemId: sysId,
      name: home.name,
      pop: 8,
      buildings: [{ type: "shipyard" }, { type: "mine" }, { type: "power_plant" }, { type: "research_lab" }],
      queue: [],
      defense: 0,
      founded: 0,
      lastAttacked: -999,
      capital: true,
    };
    state.colonies[colony.id] = colony;
    emp.explored[sysId] = true;
    const at = { x: 0, y: 0, z: 0 };
    const guard = makeFleet(state, emp, sysId, at, "Home Guard");
    guard.orbitBodyId = home.id;
    guard.ships.push(makeShip(state, emp, "corvette"), makeShip(state, emp, "corvette"), makeShip(state, emp, "corvette"));
    const scout = makeFleet(state, emp, sysId, at, "Pathfinder");
    scout.orbitBodyId = home.id;
    scout.stance = "passive";
    scout.ships.push(makeShip(state, emp, "scout"));
    const builder = makeFleet(state, emp, sysId, at, "Builders");
    builder.orbitBodyId = home.id;
    builder.stance = "passive";
    builder.ships.push(makeShip(state, emp, "constructor"));
  });

  // Raider havens -----------------------------------------------------------------
  if (pirate) {
    for (const idx of havens) {
      const sysId = systemIds[idx];
      const sys = state.systems[sysId];
      const anchor =
        sys.bodyIds.map((id) => state.bodies[id]).find((b) => b.kind === "belt") ??
        state.bodies[sys.starIds[0]];
      state.idCounter += 1;
      const st = stationDef("pirate_haven");
      state.stations[`st${state.idCounter.toString(36)}`] = {
        id: `st${state.idCounter.toString(36)}`,
        empireId: pirate.id,
        type: st.id,
        bodyId: anchor.id,
        systemId: sysId,
        level: 1,
        hp: st.hp,
        founded: 0,
      };
      const guard = makeFleet(state, pirate, sysId, { x: 0, y: 0, z: 0 }, "Haven Guard");
      guard.orbitBodyId = anchor.id;
      guard.stance = "defensive";
      guard.ships.push(makeShip(state, pirate, "corvette"), makeShip(state, pirate, "corvette"), makeShip(state, pirate, "corvette"));
      pirate.explored[sysId] = true;
    }
    for (const id of systemIds) pirate.explored[id] = true;
  }

  state.rngState = rng.state;
  return state;
}

function addGate(state: GameState, tunnel: Tunnel, systemId: string, otherId: string): void {
  const sys = state.systems[systemId];
  const other = state.systems[otherId];
  const dx = other.pos.x - sys.pos.x;
  const dz = other.pos.z - sys.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  const r = sys.extent;
  sys.gates.push({
    tunnelId: tunnel.id,
    systemId,
    otherSystemId: otherId,
    pos: { x: (dx / len) * r, y: ((other.pos.y - sys.pos.y) / len) * r * 0.3, z: (dz / len) * r },
  });
}
