import { describe, expect, it } from "vitest";
import { Rng } from "../src/sim/rng";
import { Game } from "../src/sim/game";
import { createGame, isConnected, makeFleet, makeShip } from "../src/sim/galaxy";
import { findRoute, foundColony } from "../src/sim/fleets";
import { orbitPosition, solveKepler } from "../src/sim/orbits";
import {
  buildingOutput,
  buildingSlots,
  canColonize,
  commandCapacity,
  habitability,
  hullCost,
  incomeReport,
  growPopulation,
  maxDefense,
  popCapacity,
  stationBuildError,
  systemHolders,
  systemOwner,
  systemOwnerMap,
} from "../src/sim/economy";
import { STAR_TYPES } from "../src/sim/data/stars";
import { PLANET_TYPES } from "../src/sim/data/planets";
import { TECHS, TECH_MAP } from "../src/sim/data/techs";
import { HULLS } from "../src/sim/data/ships";
import { BUILDING_MAP, STATION_MAP, STATIONS } from "../src/sim/data/structures";
import { fleetPower } from "../src/sim/combat";
import { declareWar } from "../src/sim/commands";
import { proposeTrade, TRADE_INTERVAL, tradeValue } from "../src/sim/trade";
import { shipStores, supplyLevel } from "../src/sim/supplies";
import { cedeColony } from "../src/sim/diplomacy";
import { canSeeLog } from "../src/sim/util";
import type { Colony, Fleet, GameState } from "../src/sim/types";

function home(g: Game): Colony {
  return g.playerColonies()[0];
}

function playerFleet(g: Game, name: string): Fleet {
  return Object.values(g.state.fleets).find((f) => f.empireId === g.playerId && f.name === name)!;
}

/** Establish diplomatic contact between the player and another empire. */
function meet(g: Game, otherId: string): void {
  (g.player.contacts ??= {})[otherId] = true;
  (g.state.empires[otherId].contacts ??= {})[g.playerId] = true;
}

function runUntil(g: Game, pred: () => boolean, maxDays: number): boolean {
  for (let d = 0; d < maxDays * 10; d++) {
    if (pred()) return true;
    g.step();
  }
  return pred();
}

describe("rng", () => {
  it("is deterministic and well distributed", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const xs = Array.from({ length: 1000 }, () => a.next());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b.next()));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it("int() covers its inclusive range", () => {
    const r = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(1, 4));
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("orbits", () => {
  it("solves Kepler's equation", () => {
    for (const e of [0, 0.1, 0.5, 0.9]) {
      for (const M of [0.1, 1, 2.5, 5]) {
        const E = solveKepler(M, e);
        expect(E - e * Math.sin(E)).toBeCloseTo(M, 8);
      }
    }
  });

  it("keeps circular orbits at constant radius and returns after one period", () => {
    const o = { a: 2, e: 0, period: 100, phase: 0.3, inclination: 0.1, node: 1, argPeri: 0.5 };
    for (let d = 0; d < 100; d += 7) {
      const p = orbitPosition(o, d);
      expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(2, 6);
    }
    const p0 = orbitPosition(o, 0);
    const p1 = orbitPosition(o, 100);
    expect(p1.x).toBeCloseTo(p0.x, 6);
    expect(p1.z).toBeCloseTo(p0.z, 6);
  });
});

describe("galaxy generation", () => {
  const state = createGame({ seed: "test-galaxy", systemCount: 30, aiCount: 3 });

  it("is deterministic for a seed", () => {
    const again = createGame({ seed: "test-galaxy", systemCount: 30, aiCount: 3 });
    expect(JSON.stringify(again)).toEqual(JSON.stringify(state));
    const other = createGame({ seed: "another", systemCount: 30, aiCount: 3 });
    expect(JSON.stringify(other)).not.toEqual(JSON.stringify(state));
  });

  it("builds a connected tunnel network with matching gates", () => {
    const ids = Object.keys(state.systems);
    expect(ids).toHaveLength(30);
    const index = new Map(ids.map((id, i) => [id, i]));
    const edges = Object.values(state.tunnels).map((t) => [index.get(t.a)!, index.get(t.b)!] as [number, number]);
    expect(isConnected(ids.length, edges)).toBe(true);
    for (const t of Object.values(state.tunnels)) {
      expect(state.systems[t.a].gates.some((g) => g.tunnelId === t.id && g.otherSystemId === t.b)).toBe(true);
      expect(state.systems[t.b].gates.some((g) => g.tunnelId === t.id && g.otherSystemId === t.a)).toBe(true);
      expect(t.travelDays).toBeGreaterThan(0);
    }
    for (const sys of Object.values(state.systems)) {
      expect(sys.gates.length).toBeGreaterThan(0);
      for (const g of sys.gates) expect(Math.hypot(g.pos.x, g.pos.z)).toBeGreaterThan(0);
    }
  });

  it("gives every empire a habitable homeworld with starting assets", () => {
    const majors = Object.values(state.empires).filter((e) => !e.isPirate);
    expect(majors).toHaveLength(4);
    const homeSystems = new Set<string>();
    for (const e of majors) {
      const cols = Object.values(state.colonies).filter((c) => c.empireId === e.id);
      expect(cols).toHaveLength(1);
      const body = state.bodies[cols[0].bodyId];
      expect(habitability(e, body)).toBeGreaterThanOrEqual(0.9);
      homeSystems.add(cols[0].systemId);
      const fleets = Object.values(state.fleets).filter((f) => f.empireId === e.id);
      expect(fleets.length).toBe(3);
    }
    expect(homeSystems.size).toBe(4);
    // Homes are spread apart.
    const homes = [...homeSystems];
    for (let i = 0; i < homes.length; i++)
      for (let j = i + 1; j < homes.length; j++) expect(findRoute(state, homes[i], homes[j])!.length).toBeGreaterThanOrEqual(2);
  });

  it("places raider havens away from homes", () => {
    const havens = Object.values(state.stations).filter((s) => s.type === "pirate_haven");
    expect(havens.length).toBeGreaterThan(0);
    const homes = Object.values(state.colonies).map((c) => c.systemId);
    for (const h of havens) expect(homes).not.toContain(h.systemId);
  });

  it("produces a wide variety of stars, planets, moons, belts and comets", () => {
    const stars = new Set<string>();
    const planets = new Set<string>();
    const kinds: Record<string, number> = {};
    let rings = 0;
    let binaries = 0;
    for (let i = 0; i < 6; i++) {
      const s = createGame({ seed: `variety-${i}`, systemCount: 48, aiCount: 1 });
      for (const b of Object.values(s.bodies)) {
        kinds[b.kind] = (kinds[b.kind] ?? 0) + 1;
        if (b.kind === "star" && !b.parentId) stars.add(b.type);
        if (b.kind === "planet" || b.kind === "moon") planets.add(b.type);
        if (b.ring) rings++;
      }
      binaries += Object.values(s.systems).filter((x) => x.starIds.length > 1).length;
    }
    expect(stars.size).toBeGreaterThanOrEqual(STAR_TYPES.length - 2);
    expect(planets.size).toBeGreaterThanOrEqual(PLANET_TYPES.length - 1);
    expect(kinds.moon).toBeGreaterThan(100);
    expect(kinds.belt).toBeGreaterThan(50);
    expect(kinds.comet).toBeGreaterThan(20);
    expect(rings).toBeGreaterThan(20);
    expect(binaries).toBeGreaterThan(10);
  });

  it("keeps planets ordered by orbit and inside the system extent", () => {
    for (const sys of Object.values(state.systems)) {
      const planets = sys.bodyIds.map((id) => state.bodies[id]).filter((b) => b.kind === "planet");
      for (const p of planets) expect(p.orbit!.a).toBeLessThan(sys.extent);
      const as = planets.map((p) => p.orbit!.a);
      expect([...as].sort((a, b) => a - b)).toEqual(as);
    }
  });
});

describe("data tables", () => {
  it("has consistent tech prerequisites", () => {
    for (const t of TECHS) for (const r of t.requires) {
      expect(TECH_MAP[r]).toBeDefined();
      expect(TECH_MAP[r].tier).toBeLessThanOrEqual(t.tier);
    }
  });
  it("only requires existing techs for hulls and stations", () => {
    for (const h of HULLS) if (h.requires && h.requires !== "__never__") expect(TECH_MAP[h.requires]).toBeDefined();
    for (const s of STATIONS) if (s.requires && s.requires !== "__never__") expect(TECH_MAP[s.requires]).toBeDefined();
  });
});

describe("economy", () => {
  it("starts with positive income in every resource that matters", () => {
    const g = Game.create({ seed: "eco" });
    const r = incomeReport(g.state, g.player);
    expect(r.net.credits).toBeGreaterThan(0);
    expect(r.net.metals).toBeGreaterThan(0);
    expect(r.net.energy).toBeGreaterThan(0);
    expect(r.net.research).toBeGreaterThan(0);
  });

  it("builds buildings through the queue and pays up front", () => {
    const g = Game.create({ seed: "eco2" });
    const c = home(g);
    const before = { ...g.player.resources };
    expect(g.queueBuilding(c.id, "trade_hub").ok).toBe(true);
    expect(g.player.resources.credits).toBe(before.credits - BUILDING_MAP.trade_hub.cost.credits!);
    expect(runUntil(g, () => c.buildings.some((b) => b.type === "trade_hub"), BUILDING_MAP.trade_hub.days + 4)).toBe(true);
    expect(g.queueBuilding(c.id, "shipyard").ok).toBe(false); // unique
    expect(g.queueBuilding(c.id, "quantum_lab").ok).toBe(false); // needs research
  });

  it("refunds cancelled queue items", () => {
    const g = Game.create({ seed: "eco3" });
    const c = home(g);
    const before = { ...g.player.resources };
    g.queueShip(c.id, "scout");
    g.cancelQueueItem(c.id, 0);
    expect(g.player.resources).toEqual(before);
  });

  it("limits buildings by slots", () => {
    const g = Game.create({ seed: "eco4" });
    const c = home(g);
    g.player.resources.credits = g.player.resources.metals = 10000;
    let ok = 0;
    for (let i = 0; i < 20; i++) if (g.queueBuilding(c.id, "mine").ok) ok++;
    expect(c.buildings.length + ok).toBe(buildingSlots(g.state, c));
  });

  it("grows population towards capacity", () => {
    const g = Game.create({ seed: "eco5" });
    const c = home(g);
    const p0 = c.pop;
    g.advance(200);
    expect(c.pop).toBeGreaterThan(p0);
  });

  it("makes colony ships pricier as the empire grows", () => {
    const g = Game.create({ seed: "eco6" });
    const base = hullCost(g.state, g.player, "colony").credits!;
    const body = Object.values(g.state.bodies).find((b) => b.kind === "planet" && b.id !== home(g).bodyId)!;
    g.state.colonies.extra = { ...home(g), id: "extra", bodyId: body.id, capital: false };
    expect(hullCost(g.state, g.player, "colony").credits!).toBeGreaterThan(base);
  });

  it("caps fleets by command capacity", () => {
    const g = Game.create({ seed: "eco7" });
    const c = home(g);
    g.player.resources = { credits: 1e5, metals: 1e5, energy: 1e5, exotics: 1e5 };
    let queued = 0;
    for (let i = 0; i < 40; i++) {
      c.queue = [];
      if (g.queueShip(c.id, "corvette").ok) queued++;
      else break;
      g.advance(HULLS.find((h) => h.id === "corvette")!.buildDays + 1);
    }
    expect(queued).toBeLessThanOrEqual(commandCapacity(g.state, g.player));
  });
});

describe("research", () => {
  it("completes techs and queues prerequisites", () => {
    const g = Game.create({ seed: "res" });
    expect(g.setResearch("destroyers").ok).toBe(true);
    expect(g.player.research.current).toBe("frigates");
    expect(g.player.research.queue).toEqual(["destroyers"]);
    g.player.research.progress.frigates = 1e9;
    g.advance(1.1);
    expect(g.player.research.completed).toContain("frigates");
  });
});

describe("fleets", () => {
  it("routes only through explored systems and explores new ones on arrival", () => {
    const g = Game.create({ seed: "fleet" });
    const scout = playerFleet(g, "Pathfinder");
    const start = scout.systemId!;
    const s = g.state;
    const neighbour = s.systems[start].gates[0].otherSystemId;
    const beyond = s.systems[neighbour].gates.map((gt) => gt.otherSystemId).find((id) => id !== start && !s.systems[start].gates.some((x) => x.otherSystemId === id))!;
    expect(g.player.explored[neighbour]).toBeUndefined();
    // Two jumps away through an unexplored system: we don't know that route yet.
    expect(g.moveFleet(scout.id, beyond).ok).toBe(false);
    expect(findRoute(s, start, beyond, g.player)).toBeNull();
    expect(findRoute(s, start, beyond)).not.toBeNull(); // the omniscient network does have a path
    // The adjacent system is reachable through the gate we can see.
    expect(g.moveFleet(scout.id, neighbour, { bodyId: s.systems[neighbour].starIds[0] }).ok).toBe(true);
    expect(runUntil(g, () => scout.systemId === neighbour && !scout.order, 400)).toBe(true);
    expect(g.player.explored[neighbour]).toBe(true);
    // Now its gates are known, so the system beyond becomes routable.
    expect(g.moveFleet(scout.id, beyond).ok).toBe(true);
  });

  it("colonises a habitable world", () => {
    let g = Game.create({ seed: "colonize" });
    const findTarget = (gm: Game) =>
      Object.values(gm.state.bodies).find((b) => b.systemId === home(gm).systemId && b.id !== home(gm).bodyId && canColonize(gm.player, b));
    for (let i = 0; !findTarget(g); i++) g = Game.create({ seed: `colonize-${i}` });
    const c = home(g);
    const target = findTarget(g)!;
    g.player.resources.credits = g.player.resources.metals = 5000;
    expect(g.queueShip(c.id, "colony").ok).toBe(true);
    expect(runUntil(g, () => Object.values(g.state.fleets).some((f) => f.ships.some((s) => s.hull === "colony")), 60)).toBe(true);
    const f = Object.values(g.state.fleets).find((x) => x.ships.some((s) => s.hull === "colony"))!;
    expect(g.colonize(f.id, target.id).ok).toBe(true);
    expect(runUntil(g, () => Object.values(g.state.colonies).some((x) => x.bodyId === target.id), 120)).toBe(true);
    expect(g.playerColonies()).toHaveLength(2);
  });

  it("builds stations with a constructor and they produce resources", () => {
    const g = Game.create({ seed: "station" });
    const cons = playerFleet(g, "Builders");
    const sys = g.state.systems[home(g).systemId];
    const star = g.state.bodies[sys.starIds[0]];
    expect(stationBuildError(g.state, g.player, "solar_array", star)).toBeNull();
    const energyBefore = incomeReport(g.state, g.player).net.energy;
    expect(g.buildStation(cons.id, star.id, "solar_array").ok).toBe(true);
    expect(runUntil(g, () => Object.values(g.state.stations).some((s) => s.bodyId === star.id), 200)).toBe(true);
    expect(incomeReport(g.state, g.player).net.energy).toBeGreaterThan(energyBefore);
    expect(stationBuildError(g.state, g.player, "solar_array", star)).toBe("Already built here");
  });

  it("splits and merges fleets", () => {
    const g = Game.create({ seed: "split" });
    const guard = playerFleet(g, "Home Guard");
    const r = g.splitFleet(guard.id, [guard.ships[0].id]);
    expect(r.ok).toBe(true);
    const nf = g.state.fleets[(r as { fleetId: string }).fleetId];
    expect(nf.ships).toHaveLength(1);
    expect(guard.ships).toHaveLength(2);
    expect(g.mergeFleets(guard.id, nf.id).ok).toBe(true);
    expect(guard.ships).toHaveLength(3);
    expect(g.state.fleets[nf.id]).toBeUndefined();
  });
});

function stageBattle(g: Game, attackerShips: string[], pirateShips: string[]) {
  const s = g.state;
  const pirates = s.empires.pirates;
  const sys = home(g).systemId;
  const a = makeFleet(s, g.player, sys, { x: 3, y: 0, z: 3 }, "Strike");
  for (const h of attackerShips) a.ships.push(makeShip(s, g.player, h));
  const p = makeFleet(s, pirates, sys, { x: 3.5, y: 0, z: 3 }, "Raiders");
  for (const h of pirateShips) p.ships.push(makeShip(s, pirates, h));
  return { a, p };
}

describe("combat", () => {
  it("resolves battles: the stronger fleet wins and takes damage", () => {
    const g = Game.create({ seed: "combat" });
    const { a, p } = stageBattle(g, ["corvette", "corvette", "corvette", "corvette", "corvette"], ["corvette"]);
    const powerBefore = fleetPower(g.state, a);
    g.advance(0.2);
    expect(Object.keys(g.state.battles).length).toBe(1);
    expect(a.battleId).not.toBeNull();
    runUntil(g, () => !g.state.fleets[p.id], 30);
    expect(g.state.fleets[p.id]).toBeUndefined();
    expect(g.state.fleets[a.id]).toBeDefined();
    expect(fleetPower(g.state, a)).toBeLessThanOrEqual(powerBefore);
    expect(g.player.stats.kills).toBeGreaterThanOrEqual(1);
    g.advance(0.2);
    expect(Object.keys(g.state.battles).length).toBe(0);
    const events = g.drainEvents();
    expect(events.some((e) => e.type === "shot")).toBe(true);
    expect(events.some((e) => e.type === "explosion")).toBe(true);
  });

  it("does not fight empires at peace", () => {
    const g = Game.create({ seed: "peace" });
    const s = g.state;
    const other = Object.values(s.empires).find((e) => !e.isPlayer && !e.isPirate)!;
    const sys = home(g).systemId;
    const f = makeFleet(s, other, sys, { x: 5, y: 0, z: 5 }, "Visitors");
    f.ships.push(makeShip(s, other, "corvette"));
    const mine = makeFleet(s, g.player, sys, { x: 5.2, y: 0, z: 5 }, "Hosts");
    mine.ships.push(makeShip(s, g.player, "corvette"));
    g.advance(2);
    expect(Object.keys(s.battles)).toHaveLength(0);
    expect(g.declareWar(other.id).ok).toBe(true);
    g.advance(0.3);
    expect(Object.keys(s.battles).length).toBeGreaterThan(0);
  });

  it("pays a bounty for destroying a raider haven", () => {
    const g = Game.create({ seed: "haven" });
    const s = g.state;
    const haven = Object.values(s.stations).find((x) => x.type === "pirate_haven")!;
    for (const f of Object.values(s.fleets)) if (f.empireId === "pirates") delete s.fleets[f.id];
    const strike = makeFleet(s, g.player, haven.systemId, { x: 0, y: 0, z: 0 }, "Strike");
    for (let i = 0; i < 12; i++) strike.ships.push(makeShip(s, g.player, "corvette"));
    strike.orbitBodyId = haven.bodyId;
    const credits = g.player.resources.credits;
    let before = credits;
    const done = runUntil(g, () => {
      if (s.stations[haven.id]) before = g.player.resources.credits;
      return !s.stations[haven.id];
    }, 200);
    expect(done).toBe(true);
    // The hoard is paid the moment the haven falls (crew upkeep during the siege aside).
    expect(g.player.resources.credits).toBeGreaterThan(before + 150);
    expect(s.log.some((l) => l.text.includes("seized its hoard"))).toBe(true);
  });

  it("sieges planetary defenses and captures colonies by invasion", () => {
    const g = Game.create({ seed: "invade" });
    const s = g.state;
    const enemy = Object.values(s.empires).find((e) => !e.isPlayer && !e.isPirate)!;
    enemy.ai = null; // keep the defender passive for the test
    const target = Object.values(s.colonies).find((c) => c.empireId === enemy.id)!;
    for (const f of Object.values(s.fleets)) if (f.empireId === enemy.id) delete s.fleets[f.id];
    meet(g, enemy.id);
    expect(g.declareWar(enemy.id).ok).toBe(true);
    g.player.research.completed.push("ground_forces", "battleships", "cruisers", "destroyers", "frigates");
    const fleet = makeFleet(s, g.player, target.systemId, { x: 0, y: 0, z: 0 }, "Armada");
    for (let i = 0; i < 6; i++) fleet.ships.push(makeShip(s, g.player, "cruiser"));
    for (let i = 0; i < 8; i++) fleet.ships.push(makeShip(s, g.player, "transport"));
    expect(maxDefense(s, target)).toBeGreaterThan(0);
    expect(g.moveFleet(fleet.id, target.systemId, { bodyId: target.bodyId }).ok).toBe(true);
    expect(runUntil(g, () => target.defense <= 0, 200)).toBe(true);
    expect(g.invade(fleet.id, target.id).ok).toBe(true);
    expect(runUntil(g, () => target.empireId === g.playerId, 60)).toBe(true);
    expect(systemOwner(s, target.systemId)).toBe(g.playerId);
    // Losing the only colony eliminates the empire → with others left, not yet a win.
    g.advance(1.1);
    expect(s.empires[enemy.id].alive).toBe(false);
  });
});

describe("persistence", () => {
  it("round-trips through save/load and continues deterministically", () => {
    const g = Game.create({ seed: "save" });
    g.advance(120);
    const json = g.serialize();
    const a = Game.deserialize(json);
    const b = Game.deserialize(json);
    a.advance(150);
    b.advance(150);
    expect(a.serialize()).toEqual(b.serialize());
    expect(() => Game.deserialize(JSON.stringify({ ...JSON.parse(json), version: 999 }))).toThrow();
  });
});

describe("victory", () => {
  it("awards conquest when all rivals are gone", () => {
    const g = Game.create({ seed: "win", aiCount: 1 });
    const s = g.state;
    for (const c of Object.values(s.colonies)) if (c.empireId !== g.playerId) delete s.colonies[c.id];
    for (const f of Object.values(s.fleets)) if (f.empireId !== g.playerId && f.empireId !== "pirates") delete s.fleets[f.id];
    g.advance(1.1);
    expect(s.winner).toBe(g.playerId);
    expect(s.victoryType).toBe("conquest");
  });

  it("reports defeat when the player loses everything", () => {
    const g = Game.create({ seed: "lose" });
    const s = g.state;
    for (const c of Object.values(s.colonies)) if (c.empireId === g.playerId) delete s.colonies[c.id];
    g.advance(1.1);
    expect(s.empires[g.playerId].alive).toBe(false);
    expect(s.victoryType).toBe("defeat");
  });
});

function checkInvariants(state: GameState) {
  for (const e of Object.values(state.empires)) {
    for (const v of Object.values(e.resources)) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  }
  for (const f of Object.values(state.fleets)) {
    expect(Number.isFinite(f.pos.x + f.pos.y + f.pos.z)).toBe(true);
    expect(f.systemId !== null || f.transit !== null).toBe(true);
    for (const sh of f.ships) expect(sh.hull_hp).toBeGreaterThan(0);
  }
  for (const c of Object.values(state.colonies)) {
    expect(c.pop).toBeGreaterThan(0);
    expect(Number.isFinite(c.defense)).toBe(true);
  }
}

describe("long-running AI game", () => {
  it("runs 1500 days with 5 rivals without breaking invariants, and the AI expands", () => {
    const g = Game.create({ seed: "marathon", aiCount: 5, systemCount: 40, difficulty: "hard" });
    for (let i = 0; i < 15; i++) {
      g.advance(100);
      checkInvariants(g.state);
    }
    const ais = Object.values(g.state.empires).filter((e) => e.ai);
    const colonies = ais.map((e) => Object.values(g.state.colonies).filter((c) => c.empireId === e.id).length);
    expect(Math.max(...colonies)).toBeGreaterThanOrEqual(4);
    expect(ais.every((e) => e.research.completed.length >= 8)).toBe(true);
    expect(ais.some((e) => e.stats.shipsBuilt > 5)).toBe(true);
    expect(Object.values(g.state.stations).filter((s) => s.empireId !== "pirates").length).toBeGreaterThan(10);
  }, 180000);
});

describe("regressions from code review", () => {
  it("refunds a paid, unfinished station when the constructor is re-tasked", () => {
    const g = Game.create({ seed: "refund" });
    const cons = playerFleet(g, "Builders");
    const star = g.state.bodies[g.state.systems[home(g).systemId].starIds[0]];
    g.buildStation(cons.id, star.id, "solar_array");
    expect(runUntil(g, () => (cons.order?.work ?? 0) > 0, 100)).toBe(true);
    const paid = { ...g.player.resources };
    expect(g.stopFleet(cons.id).ok).toBe(true);
    expect(g.player.resources.credits).toBeCloseTo(paid.credits + STATION_MAP.solar_array.cost.credits!, 5);
    expect(g.player.resources.metals).toBeCloseTo(paid.metals + STATION_MAP.solar_array.cost.metals!, 5);
  });

  it("clears a move order that targets the fleet's own system", () => {
    const g = Game.create({ seed: "selfmove" });
    const guard = playerFleet(g, "Home Guard");
    expect(g.moveFleet(guard.id, guard.systemId!).ok).toBe(true);
    g.advance(0.3);
    expect(guard.order).toBeNull();
  });

  it("does not teleport a fleet back to its orbit after pursuit", () => {
    const g = Game.create({ seed: "pursuit" });
    const s = g.state;
    const guard = playerFleet(g, "Home Guard");
    guard.stance = "aggressive"; // pursuit is what this test is about
    const pir = makeFleet(s, s.empires.pirates, guard.systemId!, { x: guard.pos.x + 3, y: 0, z: guard.pos.z }, "Bait");
    pir.ships.push(makeShip(s, s.empires.pirates, "scout"));
    g.step();
    expect(guard.order?.kind).toBe("attack");
    expect(guard.orbitBodyId).toBeNull();
    g.advance(1);
    delete s.fleets[pir.id];
    guard.orbitBodyId = home(g).bodyId; // as if ordered back to orbit
    for (let i = 0; i < 20; i++) {
      const before = { ...guard.pos };
      g.step();
      const moved = Math.hypot(guard.pos.x - before.x, guard.pos.y - before.y, guard.pos.z - before.z);
      expect(moved).toBeLessThan(1.5);
    }
  });

  it("clears attack orders when peace is signed", () => {
    const g = Game.create({ seed: "peacechase" });
    const s = g.state;
    const other = Object.values(s.empires).find((e) => !e.isPlayer && !e.isPirate)!;
    meet(g, other.id);
    g.declareWar(other.id);
    const guard = playerFleet(g, "Home Guard");
    const t = makeFleet(s, other, guard.systemId!, { x: guard.pos.x + 3, y: 0, z: guard.pos.z }, "Target");
    t.ships.push(makeShip(s, other, "scout"));
    t.stance = "passive";
    expect(g.attackFleet(guard.id, t.id).ok).toBe(true);
    g.state.empires[other.id].ai!.warStarted = { [g.playerId]: -1000 };
    const peace = (): void => {
      // Force the treaty directly to avoid RNG.
      g.state.empires[g.playerId].relations[other.id] = "peace";
      g.state.empires[other.id].relations[g.playerId] = "peace";
    };
    peace();
    g.step();
    expect(guard.order).toBeNull();
  });

  it("refuses repeated peace proposals for a while", () => {
    const g = Game.create({ seed: "peacespam" });
    const other = Object.values(g.state.empires).find((e) => !e.isPlayer && !e.isPirate)!;
    meet(g, other.id);
    g.declareWar(other.id);
    // Make them strong so they refuse.
    for (const f of Object.values(g.state.fleets)) if (f.empireId === other.id) for (let i = 0; i < 20; i++) f.ships.push(makeShip(g.state, other, "corvette"));
    const first = g.proposePeace(other.id);
    expect(first.ok).toBe(false);
    const second = g.proposePeace(other.id);
    expect(second.ok).toBe(false);
    expect((second as { error: string }).error).toMatch(/will not hear/);
  });

  it("relocates the capital when it is captured", () => {
    const g = Game.create({ seed: "capital" });
    const s = g.state;
    const cap = home(g);
    const other = Object.values(s.bodies).find((b) => b.kind === "planet" && b.id !== cap.bodyId)!;
    s.colonies.second = { ...cap, id: "second", bodyId: other.id, systemId: other.systemId, capital: false, pop: 3, buildings: [], queue: [] };
    cap.empireId = Object.values(s.empires).find((e) => !e.isPlayer && !e.isPirate)!.id;
    cap.capital = false;
    g.advance(1.1);
    expect(s.colonies.second.capital).toBe(true);
  });

  it("eliminates a homeless empire after the grace period so conquest can finish", () => {
    const g = Game.create({ seed: "homeless", aiCount: 1 });
    const s = g.state;
    const ai = Object.values(s.empires).find((e) => e.ai)!;
    for (const c of Object.values(s.colonies)) if (c.empireId === ai.id) delete s.colonies[c.id];
    for (const f of Object.values(s.fleets)) if (f.empireId === ai.id) delete s.fleets[f.id];
    // Park a lone colony ship in a system with nothing habitable.
    const barren = Object.values(s.systems).find((sys) => sys.bodyIds.every((b) => !canColonize(ai, s.bodies[b])))!;
    const f = makeFleet(s, ai, barren.id, { x: 0, y: 0, z: 0 }, "Ark");
    f.ships.push(makeShip(s, ai, "colony"));
    ai.ai = null; // disable resettling for this check
    g.advance(60);
    expect(ai.alive).toBe(true);
    g.advance(80);
    expect(ai.alive).toBe(false);
    expect(s.winner).toBe(g.playerId);
  });

  it("guards the queue against stale cancels and shipyard demolition", () => {
    const g = Game.create({ seed: "queue" });
    const c = home(g);
    g.queueShip(c.id, "scout");
    expect(g.cancelQueueItem(c.id, 0, "corvette").ok).toBe(false);
    const yard = c.buildings.findIndex((b) => b.type === "shipyard");
    expect(g.demolishBuilding(c.id, yard).ok).toBe(false);
    expect(g.cancelQueueItem(c.id, 0, "scout").ok).toBe(true);
    expect(g.demolishBuilding(c.id, yard).ok).toBe(true);
  });
});

describe("realistic flight", () => {
  it("accelerates, never exceeds cruise speed, brakes and arrives matching the planet's motion", async () => {
    const { fleetSpeed, bodyVelocity } = await import("../src/sim/fleets");
    const g = Game.create({ seed: "flight" });
    const s = g.state;
    const f = playerFleet(g, "Home Guard");
    const sys = s.systems[home(g).systemId];
    const target = sys.bodyIds.map((id) => s.bodies[id]).filter((b) => b.kind === "planet").sort((a, b) => b.orbit!.a - a.orbit!.a)[0];
    g.moveFleet(f.id, sys.id, { bodyId: target.id });
    const vmax = fleetSpeed(s, f);
    const speeds: number[] = [];
    let braking = false;
    for (let i = 0; i < 3000 && f.order; i++) {
      g.step();
      const v = Math.hypot(f.vel.x, f.vel.y, f.vel.z);
      speeds.push(v);
      expect(v).toBeLessThanOrEqual(vmax * 1.001 + Math.hypot(...Object.values(bodyVelocity(s, target.id))));
      // A braking burn points against our velocity.
      if (f.thrust.x * f.vel.x + f.thrust.y * f.vel.y + f.thrust.z * f.vel.z < -0.01) braking = true;
    }
    expect(f.order).toBeNull();
    expect(f.orbitBodyId).toBe(target.id);
    expect(braking).toBe(true);
    // Gradual acceleration: the first step is well below cruise speed.
    expect(speeds[0]).toBeLessThan(vmax * 0.2);
    expect(Math.max(...speeds)).toBeGreaterThan(vmax * 0.6);
  });

  it("is roughly half as fast as the original constant-speed model", () => {
    const g = Game.create({ seed: "flight2" });
    const s = g.state;
    const f = playerFleet(g, "Home Guard");
    const sys = s.systems[home(g).systemId];
    const gate = sys.gates[0];
    const startDist = Math.hypot(gate.pos.x - f.pos.x, gate.pos.y - f.pos.y, gate.pos.z - f.pos.z);
    g.moveFleet(f.id, sys.id, { pos: { ...gate.pos } });
    let days = 0;
    while (f.order && days < 400) {
      g.step();
      days += 0.1;
    }
    const oldDays = startDist / 2; // corvettes used to cruise at 2 AU/day with no acceleration
    expect(days).toBeGreaterThan(oldDays * 1.8);
    expect(days).toBeLessThan(oldDays * 3.5);
  });
});

describe("moon sizes", () => {
  it("makes most moons small, with large moons rare", () => {
    const ratios: number[] = [];
    const giantMoons: number[] = [];
    for (let i = 0; i < 4; i++) {
      const s = createGame({ seed: `moons-${i}`, systemCount: 40, aiCount: 1 });
      for (const b of Object.values(s.bodies)) {
        if (b.kind !== "moon") continue;
        const parent = s.bodies[b.parentId!];
        if (PLANET_TYPES.find((t) => t.id === parent.type)!.giant) giantMoons.push(b.radius);
        else ratios.push(b.radius / parent.radius);
      }
    }
    ratios.sort((a, b) => a - b);
    giantMoons.sort((a, b) => a - b);
    const median = (xs: number[]) => xs[Math.floor(xs.length / 2)];
    expect(median(ratios)).toBeLessThan(0.12);
    expect(ratios.filter((r) => r > 0.3).length / ratios.length).toBeLessThan(0.08);
    expect(median(giantMoons)).toBeLessThan(0.15); // Earth radii
    expect(giantMoons.filter((r) => r > 0.4).length / giantMoons.length).toBeLessThan(0.1);
    // Still a few big ones to discover.
    expect(giantMoons.some((r) => r > 0.4)).toBe(true);
  });
});


describe("fog of war", () => {
  it("keeps other empires' private news out of the player's log", () => {
    const g = Game.create({ seed: "fog", aiCount: 3 });
    g.advance(600);
    const s = g.state;
    const visible = s.log.filter((l) => canSeeLog(l, g.playerId));
    const others = Object.values(s.empires).filter((e) => !e.isPlayer && !e.isPirate);
    // Rival research completions are never announced to us.
    expect(visible.some((l) => l.kind === "research" && others.some((o) => l.text.startsWith(o.name)))).toBe(false);
    // Colonisation news only reaches empires that could see it.
    for (const l of s.log.filter((x) => x.text.includes("founded a colony"))) {
      expect(l.audience).toBeDefined();
    }
  });

  it("requires contact before declaring war, and announces first contact", () => {
    const g = Game.create({ seed: "contact" });
    const s = g.state;
    const other = Object.values(s.empires).find((e) => !e.isPlayer && !e.isPirate)!;
    expect(g.declareWar(other.id).ok).toBe(false);
    // Park one of their scouts in our home system: we meet the next day.
    const f = makeFleet(s, other, home(g).systemId, { x: 5, y: 0, z: 5 }, "Visitor");
    f.ships.push(makeShip(s, other, "scout"));
    f.stance = "passive";
    g.advance(1.1);
    expect(g.player.contacts?.[other.id]).toBe(true);
    expect(s.log.some((l) => canSeeLog(l, g.playerId) && l.text.startsWith("First contact"))).toBe(true);
    expect(g.declareWar(other.id).ok).toBe(true);
  });

  it("does not tell uninvolved empires about wars between strangers", () => {
    const g = Game.create({ seed: "news", aiCount: 3 });
    const [a, b] = Object.values(g.state.empires).filter((e) => !e.isPlayer && !e.isPirate);
    (a.contacts ??= {})[b.id] = true;
    (b.contacts ??= {})[a.id] = true;
    declareWar(g.state, a.id, b.id);
    const entry = g.state.log.find((l) => l.text.includes("declared war"))!;
    expect(canSeeLog(entry, a.id)).toBe(true);
    expect(canSeeLog(entry, g.playerId)).toBe(false);
  });
});

describe("colony ship planning", () => {
  it("ranks shipyards and auto-colonises the chosen world when the ship launches", async () => {
    const { colonyShipOptions } = await import("../src/sim/planning");
    let g = Game.create({ seed: "plan" });
    const findTarget = (gm: Game) =>
      Object.values(gm.state.bodies).find((b) => b.systemId === home(gm).systemId && b.id !== home(gm).bodyId && canColonize(gm.player, b));
    for (let i = 0; !findTarget(g); i++) g = Game.create({ seed: `plan-${i}` });
    const target = findTarget(g)!;
    g.player.resources.credits = g.player.resources.metals = 5000;
    const opts = colonyShipOptions(g.state, g.playerId, target.id);
    expect(opts.length).toBe(1);
    expect(opts[0].colonyId).toBe(home(g).id);
    expect(opts[0].etaDays).toBeGreaterThan(opts[0].buildDays);
    expect(g.buildColonyShipFor(target.id).ok).toBe(true);
    expect(home(g).queue.at(-1)).toMatchObject({ type: "colony", then: { kind: "colonize", bodyId: target.id } });
    expect(runUntil(g, () => Object.values(g.state.colonies).some((c) => c.bodyId === target.id), 200)).toBe(true);
  });
});

describe("population and migration", () => {
  it("grows slowly from a handful of settlers, then faster, then levels off (S-curve)", () => {
    const g = Game.create({ seed: "pop-s", aiCount: 1 });
    const c = home(g);
    c.pop = 1;
    c.nextMigration = 1e9;
    const cap = popCapacity(g.state, c);
    const samples: number[] = [];
    for (let d = 0; d < 1200; d++) {
      growPopulation(g.state, c, 1);
      if (d % 100 === 0) samples.push(c.pop);
    }
    const gains = samples.slice(1).map((p, i) => p - samples[i]);
    // Early gains are small, the middle is the fastest, the end slows down.
    const peak = gains.indexOf(Math.max(...gains));
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThan(gains.length - 1);
    expect(gains[0]).toBeLessThan(Math.max(...gains) * 0.5);
    expect(gains[gains.length - 1]).toBeLessThan(Math.max(...gains) * 0.5);
    expect(c.pop).toBeLessThanOrEqual(cap + 1e-9);
    // A new colony needs years, not weeks, to become a city.
    const fresh = { ...c, pop: 1 };
    for (let d = 0; d < 100; d++) growPopulation(g.state, fresh, 1);
    expect(fresh.pop).toBeLessThan(2.6); // even on an ideal homeworld
  });

  it("sends private liners from crowded worlds to colonies with room", () => {
    const g = Game.create({ seed: "migrate", aiCount: 1, pirates: false });
    const capital = home(g);
    const target = Object.values(g.state.bodies).find(
      (b) => b.systemId === capital.systemId && b.id !== capital.bodyId && canColonize(g.player, b) && !Object.values(g.state.colonies).some((c) => c.bodyId === b.id),
    );
    expect(target).toBeDefined();
    const young = foundColony(g.state, g.player, target!.id, 1);
    young.nextMigration = 1e9;
    capital.pop = popCapacity(g.state, capital);
    const before = capital.pop + young.pop;
    let liner: Fleet | undefined;
    for (let i = 0; i < 20 && !liner; i++) {
      g.step();
      liner = Object.values(g.state.fleets).find((f) => f.civilian);
    }
    expect(liner).toBeDefined();
    expect(liner!.order?.kind).toBe("migrate");
    expect(liner!.order?.colonyId).toBe(young.id);
    expect(liner!.migrants).toBeGreaterThan(0);
    // The player cannot commandeer a private liner.
    expect(g.moveFleet(liner!.id, capital.systemId).ok).toBe(false);
    expect(g.stopFleet(liner!.id).ok).toBe(false);
    const aboard = liner!.migrants!;
    const id = liner!.id;
    for (let i = 0; i < 3000 && g.state.fleets[id]; i++) g.step();
    expect(g.state.fleets[id]).toBeUndefined(); // released after unloading
    expect(young.pop).toBeGreaterThan(1 + aboard * 0.9);
    // Settlers are moved, not created (growth over the trip is small).
    expect(capital.pop + young.pop).toBeLessThan(before + 1.5);
  });

  it("liners never appear in shipyards and do not use command points", () => {
    const g = Game.create({ seed: "liner-yard" });
    expect(g.queueShip(home(g).id, "liner").ok).toBe(false);
    expect(HULLS.find((h) => h.id === "liner")!.command).toBe(0);
  });
});

describe("queued fleet orders", () => {
  it("runs shift-queued orders one after another and skips ones that became impossible", () => {
    const g = Game.create({ seed: "queue", pirates: false });
    const builder = playerFleet(g, "Construction Crew 3") ?? Object.values(g.state.fleets).find((f) => f.empireId === g.playerId && f.ships.some((s) => s.hull === "constructor"))!;
    g.player.resources.credits = 9000;
    g.player.resources.metals = 9000;
    g.player.resources.energy = 9000;
    const sys = g.state.systems[home(g).systemId];
    const sites: [string, string][] = [];
    for (const id of sys.bodyIds)
      for (const st of STATIONS)
        if (sites.length < 3 && !sites.some(([b]) => b === id) && !stationBuildError(g.state, g.player, st.id, g.state.bodies[id])) sites.push([id, st.id]);
    expect(sites.length).toBeGreaterThanOrEqual(2);
    expect(g.buildStation(builder.id, sites[0][0], sites[0][1]).ok).toBe(true);
    // Without Shift a new order replaces the current one; with Shift it waits in line.
    expect(g.buildStation(builder.id, sites[1][0], sites[1][1], true).ok).toBe(true);
    expect(builder.queue).toHaveLength(1);
    expect(g.buildStation(builder.id, sites[1][0], sites[1][1], true).ok).toBe(false); // no duplicates
    const home2 = home(g);
    expect(g.moveFleet(builder.id, home2.systemId, { bodyId: home2.bodyId }, true).ok).toBe(true);
    expect(builder.order?.kind).toBe("buildStation");
    const built = () => Object.values(g.state.stations).filter((s) => s.empireId === g.playerId).length;
    const before = built();
    for (let i = 0; i < 4000 && (builder.order || builder.queue?.length); i++) g.step();
    expect(built()).toBe(before + 2);
    expect(builder.order).toBeNull();
    expect(builder.orbitBodyId).toBe(home2.bodyId); // last queued order: return home
    // Single orders can be cancelled without dropping the rest of the plan.
    expect(g.moveFleet(builder.id, home2.systemId, { bodyId: sites[0][0] }).ok).toBe(true);
    g.moveFleet(builder.id, home2.systemId, { bodyId: home2.bodyId }, true);
    g.moveFleet(builder.id, home2.systemId, { bodyId: sites[1][0] }, true);
    expect(g.cancelFleetOrder(builder.id, 0, "buildStation").ok).toBe(false); // guard: that slot is a move
    expect(g.cancelFleetOrder(builder.id, 0, "move").ok).toBe(true);
    expect(builder.queue).toHaveLength(1);
    expect(g.cancelFleetOrder(builder.id, -1, "move").ok).toBe(true);
    expect(builder.order).toBeNull();
    g.step();
    expect(builder.order?.kind).toBe("move"); // the next queued order took over
    // A direct order clears the plan.
    g.moveFleet(builder.id, home2.systemId, { bodyId: sites[0][0] });
    g.moveFleet(builder.id, home2.systemId, { bodyId: home2.bodyId }, true);
    g.stopFleet(builder.id);
    expect(builder.queue).toEqual([]);
  });
});

describe("slow, deliberate early economy", () => {
  it("homeworlds start with modest income and ships cost upkeep", () => {
    const g = Game.create({ seed: "upkeep" });
    const r = incomeReport(g.state, g.player);
    expect(r.net.credits).toBeGreaterThan(0);
    expect(r.net.credits).toBeLessThan(3); // a colony ship (140 credits) takes months to save for
    const before = r.upkeep.credits;
    const guard = Object.values(g.state.fleets).find((f) => f.empireId === g.playerId && f.ships.some((s) => s.hull === "corvette"))!;
    guard.ships.push(makeShip(g.state, g.player, "cruiser"));
    expect(incomeReport(g.state, g.player).upkeep.credits).toBeCloseTo(before + HULLS.find((h) => h.id === "cruiser")!.upkeep.credits!, 5);
  });

  it("an empty treasury halves construction and stops repairs", () => {
    const g = Game.create({ seed: "bankrupt", pirates: false });
    const c = home(g);
    g.player.resources.credits = 5000;
    g.player.resources.metals = 5000;
    expect(g.queueBuilding(c.id, "mine").ok).toBe(true);
    const guard = Object.values(g.state.fleets).find((f) => f.empireId === g.playerId && f.ships.some((s) => s.hull === "corvette"))!;
    // Bankrupt: huge fleet upkeep, no money left.
    for (let i = 0; i < 12; i++) guard.ships.push(makeShip(g.state, g.player, "battleship"));
    g.player.resources.credits = 0;
    g.refreshIncome();
    guard.ships[0].hull_hp = 1;
    const item = c.queue[0];
    const p0 = item.progress;
    g.advance(4);
    expect(g.player.resources.credits).toBe(0);
    expect(item.progress - p0).toBeLessThanOrEqual(2.1); // half speed
    expect(guard.ships[0].hull_hp).toBe(1); // no repairs
    expect(g.state.log.some((l) => l.text.includes("treasury is empty"))).toBe(true);
  });
});

describe("pacing", () => {
  it("expansion and construction take months, not weeks", () => {
    const g = Game.create({ seed: "pacing", systemCount: 32, aiCount: 3 });
    const s = g.state;
    const firstExtra: Record<string, number> = {};
    for (let d = 0; d < 500; d++) {
      g.advance(1);
      for (const e of Object.values(s.empires)) {
        if (!e.ai || e.isPirate) continue;
        const n = Object.values(s.colonies).filter((c) => c.empireId === e.id).length;
        if (n >= 2) firstExtra[e.id] ??= d;
        expect(n).toBeLessThanOrEqual(4); // no snowball in the first ~14 minutes of 1× play
      }
    }
    // Rivals do expand, but only after saving up for a colony ship.
    const days = Object.values(firstExtra);
    expect(days.length).toBeGreaterThan(0);
    expect(Math.min(...days)).toBeGreaterThan(100);
    // Nothing is instant: the cheapest building takes weeks.
    expect(Math.min(...Object.values(BUILDING_MAP).map((b) => b.days))).toBeGreaterThanOrEqual(30);
  }, 120_000);
});

describe("where to build", () => {
  it("workforce buildings scale with population, deposit buildings with richness", () => {
    const g = Game.create({ seed: "scaling" });
    const body = g.state.bodies[home(g).bodyId];
    const out = (id: string, pop: number, b = body) => buildingOutput(BUILDING_MAP[id], b, pop);
    // Trade and research: a core world with many people beats a young colony.
    for (const [id, k] of [["trade_hub", "credits"], ["research_lab", "research"], ["quantum_lab", "research"]] as const) {
      expect(out(id, 16)[k]).toBeGreaterThan(out(id, 2)[k] * 2.5);
    }
    // Mines, foundries and power plants: the planet's deposits matter, not its people.
    for (const [id, key, k] of [["mine", "metals", "metals"], ["foundry", "metals", "metals"], ["power_plant", "energy", "energy"]] as const) {
      const poor = { ...body, richness: { ...body.richness, [key]: 0 } };
      const rich = { ...body, richness: { ...body.richness, [key]: 2 } };
      expect(out(id, 2, rich)[k]).toBeGreaterThan(out(id, 16, poor)[k] * 2.5);
      expect(out(id, 2, rich)[k]).toBeCloseTo(out(id, 16, rich)[k], 6);
    }
  });
});

describe("locatable log entries", () => {
  it("raid warnings point at the warband, completions at the world", () => {
    let raid;
    for (let i = 0; i < 6 && !raid; i++) {
      const g = Game.create({ seed: `raid-ref-${i}` });
      g.state.nextRaid = 0;
      g.advance(3);
      raid = g.state.log.find((l) => l.text.includes("warband"));
      if (raid) {
        expect(raid.ref?.kind).toBe("fleet");
        expect(g.state.fleets[raid.ref!.id]?.empireId).toBe("pirates");
        expect(raid.ref!.pos).toBeDefined();
      }
    }
    expect(raid).toBeDefined();
    const g = Game.create({ seed: "build-ref" });
    const c = home(g);
    g.player.resources.credits = 5000;
    g.player.resources.metals = 5000;
    g.queueBuilding(c.id, "mine");
    g.advance(BUILDING_MAP.mine.days + 2);
    const done = g.state.log.find((l) => l.text.includes("completed on"));
    expect(done?.ref).toMatchObject({ kind: "body", id: c.bodyId });
  });
});

describe("evasive stance", () => {
  it("civilian ships fall back home from hostile warships and resume their job; warships default to defensive", () => {
    const g = Game.create({ seed: "evade", pirates: true });
    const s = g.state;
    const scout = playerFleet(g, "Pathfinder");
    expect(scout.stance).toBe("evasive");
    expect(playerFleet(g, "Home Guard").stance).toBe("defensive");
    // Send the scout to a neighbouring system and let it arrive.
    const home2 = home(g);
    const next = s.systems[home2.systemId].gates[0].otherSystemId;
    expect(g.moveFleet(scout.id, next).ok).toBe(true);
    for (let i = 0; i < 3000 && (scout.order || scout.transit); i++) g.step();
    expect(scout.systemId).toBe(next);
    // Give it a job there, then raiders show up.
    const job = s.systems[next].bodyIds[0];
    expect(g.moveFleet(scout.id, next, { bodyId: job }).ok).toBe(true);
    const raiders = makeFleet(s, s.empires.pirates, next, { ...scout.pos }, "Raiders");
    raiders.ships.push(makeShip(s, s.empires.pirates, "corvette"));
    g.step();
    expect(scout.evading).toBe(home2.bodyId);
    expect(scout.order?.systemId).toBe(home2.systemId); // running for home
    expect(scout.queue?.[0]).toMatchObject({ kind: "move", systemId: next, bodyId: job }); // job kept for later
    expect(s.log.some((l) => l.text.includes("falling back"))).toBe(true);
    // It does not shoot or get dragged into the fight.
    delete s.fleets[raiders.id];
    for (let i = 0; i < 4000 && scout.evading; i++) g.step();
    expect(scout.evading).toBeUndefined();
    expect(scout.order?.kind).toBe("move"); // resumed the dropped job
    expect(scout.order?.bodyId).toBe(job);
    // Newly built warships come out defensive, civilian ships evasive.
    g.player.resources = { credits: 1e5, metals: 1e5, energy: 1e5, exotics: 0 };
    playerFleet(g, "Home Guard").orbitBodyId = null; // so the corvette forms its own fleet
    g.queueShip(home2.id, "corvette");
    g.queueShip(home2.id, "constructor");
    g.advance(60);
    const built = Object.values(s.fleets).filter((f) => f.empireId === g.playerId && f.name !== "Home Guard" && f.name !== "Pathfinder" && f.name !== "Builders");
    for (const f of built) expect(f.stance).toBe(f.ships.some((sh) => sh.hull === "corvette") ? "defensive" : "evasive");
    expect(built.length).toBeGreaterThanOrEqual(2);
  });
});

describe("evasive stance while sheltering", () => {
  it("waits under the colony's guns until the raiders leave, without flip-flopping", () => {
    const g = Game.create({ seed: "shelter" });
    const s = g.state;
    const builder = playerFleet(g, "Builders");
    const target = s.systems[home(g).systemId].bodyIds.find((id) => id !== home(g).bodyId)!;
    expect(g.moveFleet(builder.id, home(g).systemId, { bodyId: target }).ok).toBe(true);
    const raiders = makeFleet(s, s.empires.pirates, home(g).systemId, { x: 30, y: 0, z: 30 }, "Lurkers");
    raiders.ships.push(makeShip(s, s.empires.pirates, "corvette"));
    raiders.stance = "passive"; // they just sit there
    for (let i = 0; i < 300; i++) g.step();
    expect(builder.order).toBeNull(); // sheltering at the capital, job on hold
    expect(builder.queue?.[0]?.bodyId).toBe(target);
    expect(s.log.filter((l) => l.text.includes("falling back")).length).toBe(1); // no spam
    delete s.fleets[raiders.id];
    g.step();
    g.step();
    expect(builder.order?.bodyId).toBe(target); // raiders gone: back to work
  });
});

describe("merchant trade", () => {
  function tradeGame() {
    const g = Game.create({ seed: "trade", aiCount: 1, pirates: false });
    const s = g.state;
    const cap = home(g);
    const other = Object.values(s.bodies).find((b) => b.systemId === cap.systemId && b.id !== cap.bodyId && canColonize(g.player, b))!;
    const second = foundColony(s, g.player, other.id, 6);
    for (const c of [cap, second]) c.buildings.push({ type: "trade_hub" });
    return { g, s, cap, second };
  }

  it("trade hubs send freighters that pay credits on delivery", () => {
    const { g, s, cap } = tradeGame();
    let freighter: Fleet | undefined;
    for (let i = 0; i < 40 && !freighter; i++) {
      g.step();
      freighter = Object.values(s.fleets).find((f) => f.ships.some((sh) => sh.hull === "freighter"));
    }
    expect(freighter).toBeDefined();
    expect(freighter!.civilian).toBe(true);
    expect(freighter!.order?.kind).toBe("trade");
    expect(freighter!.cargo).toBeGreaterThan(3);
    // Freighters take no orders.
    expect(g.moveFleet(freighter!.id, cap.systemId).ok).toBe(false);
    const id = freighter!.id;
    const cargo = freighter!.cargo!;
    g.player.resources.credits = 0;
    g.refreshIncome();
    const expectedBase = g.player.income.credits;
    for (let i = 0; i < 3000 && s.fleets[id]; i++) g.step();
    expect(s.fleets[id]).toBeUndefined();
    expect(g.player.resources.credits).toBeGreaterThan(cargo * 0.99); // delivery paid (plus normal income)
    expect(expectedBase).toBeDefined();
    g.advance(30);
    expect(g.player.tradeRate).toBeGreaterThan(0);
  });

  it("agreements open foreign routes, pay both sides, and war ends them", () => {
    const { g, s } = tradeGame();
    const ai = Object.values(s.empires).find((e) => e.ai && !e.isPirate)!;
    const aiCap = Object.values(s.colonies).find((c) => c.empireId === ai.id)!;
    aiCap.buildings.push({ type: "trade_hub" });
    aiCap.pop = 14;
    expect(g.proposeTrade(ai.id).ok).toBe(false); // not met
    (g.player.contacts ??= {})[ai.id] = true;
    (ai.contacts ??= {})[g.playerId] = true;
    ai.ai!.personality = "trader";
    // Traders say yes (almost always); retry a few days if not.
    let r = g.proposeTrade(ai.id);
    for (let i = 0; i < 5 && !r.ok; i++) {
      delete ai.ai!.tradeRefusedUntil;
      s.day += 1;
      r = g.proposeTrade(ai.id);
    }
    expect(r.ok).toBe(true);
    expect(g.player.tradePartners?.[ai.id]).toBeDefined();
    expect(ai.tradePartners?.[g.playerId]).toBeDefined();
    g.player.explored[aiCap.systemId] = true;
    // A foreign run is worth more than a domestic one of the same size.
    expect(tradeValue(home(g), aiCap, 2, true)).toBeGreaterThan(tradeValue(home(g), aiCap, 2, false) * 1.5);
    // War cancels the agreement and recalls merchants.
    declareWar(s, g.playerId, ai.id);
    expect(g.player.tradePartners?.[ai.id]).toBeUndefined();
    expect(Object.values(s.fleets).some((f) => f.order?.kind === "trade" && s.colonies[f.order.colonyId!]?.empireId === ai.id && f.empireId === g.playerId)).toBe(false);
  });

  it("Galactic Market makes merchant trade richer, not credits in general", () => {
    const { g, s, cap } = tradeGame();
    const cargo = () => {
      for (const f of Object.values(s.fleets)) if (f.cargo) delete s.fleets[f.id];
      cap.nextTrade = 0;
      g.advance(1.05);
      return Object.values(s.fleets).find((f) => f.cargo && f.name.startsWith(cap.name))?.cargo ?? 0;
    };
    const plain = cargo();
    const before = incomeReport(s, g.player).gross.credits;
    g.player.research.completed.push("galactic_market");
    expect(incomeReport(s, g.player).gross.credits).toBeCloseTo(before, 5); // no flat credit bonus
    const market = cargo();
    expect(market).toBeCloseTo(plain * 1.5, 0);
    expect(cap.nextTrade! - s.day).toBeLessThan(TRADE_INTERVAL * 0.8); // departs more often
  });

  it("human rulers get a trade offer to accept or decline", () => {
    const { g, s } = tradeGame();
    const ai = Object.values(s.empires).find((e) => e.ai && !e.isPirate)!;
    (g.player.contacts ??= {})[ai.id] = true;
    (ai.contacts ??= {})[g.playerId] = true;
    expect(proposeTrade(s, ai.id, g.playerId).ok).toBe(true);
    expect(g.player.tradeOffers?.[ai.id]).toBeDefined();
    expect(g.acceptTrade(ai.id).ok).toBe(true);
    expect(g.player.tradePartners?.[ai.id]).toBeDefined();
    expect(g.cancelTrade(ai.id).ok).toBe(true);
    expect(ai.tradePartners?.[g.playerId]).toBeUndefined();
  });
});

describe("empty fleets", () => {
  it("a fleet with no ships left disbands on the next tick", () => {
    const g = Game.create({ seed: "empty" });
    const s = g.state;
    const guard = playerFleet(g, "Home Guard");
    const extra = makeFleet(s, g.player, guard.systemId!, { ...guard.pos }, "Extra");
    extra.ships.push(makeShip(s, g.player, "corvette"));
    expect(g.mergeFleets(guard.id, extra.id).ok).toBe(true);
    expect(s.fleets[extra.id]).toBeUndefined();
    // However a fleet ends up empty, it goes away.
    guard.ships = [];
    g.step();
    expect(s.fleets[guard.id]).toBeUndefined();
  });
});

describe("logistics", () => {
  const empty = (f: Fleet) => f.ships.forEach((sh) => (sh.stores = { metals: 0, energy: 0 }));

  it("ships fire from their stores and a dry fleet cannot fight", () => {
    const g = Game.create({ seed: "ammo", pirates: true });
    const s = g.state;
    const sys = Object.keys(s.systems).find((id) => !Object.values(s.colonies).some((c) => c.systemId === id))!;
    const ours = makeFleet(s, g.player, sys, { x: 20, y: 0, z: 20 }, "Ours");
    for (let i = 0; i < 3; i++) ours.ships.push(makeShip(s, g.player, "corvette"));
    const full = { ...shipStores(ours.ships[0]) };
    expect(full.metals + full.energy).toBeGreaterThan(0);
    const foe = makeFleet(s, s.empires.pirates, sys, { x: 20.3, y: 0, z: 20 }, "Foe");
    foe.ships.push(makeShip(s, s.empires.pirates, "frigate"));
    for (let i = 0; i < 60; i++) g.step();
    const after = shipStores(ours.ships[0]);
    expect(after.metals + after.energy).toBeLessThan(full.metals + full.energy); // munitions spent
    // Dry ships don't fire.
    empty(ours);
    const hp = foe.ships.map((x) => x.hull_hp + x.armor + x.shields).reduce((a, b) => a + b, 0);
    for (let i = 0; i < 30 && s.fleets[foe.id]; i++) g.step();
    const hp2 = (s.fleets[foe.id]?.ships ?? []).map((x) => x.hull_hp + x.armor + x.shields).reduce((a, b) => a + b, 0);
    expect(hp2).toBeGreaterThanOrEqual(hp - 1e-6);
    expect(s.log.some((l) => l.text.includes("out of munitions"))).toBe(true);
  });

  it("fleets at home restock from the stockpile", () => {
    const g = Game.create({ seed: "restock" });
    const guard = playerFleet(g, "Home Guard");
    empty(guard);
    g.player.resources.metals = 500;
    g.player.resources.energy = 500;
    g.refreshIncome();
    const stock = g.player.resources.metals + g.player.resources.energy;
    g.advance(1.05);
    expect(supplyLevel(guard.ships).overall).toBeGreaterThan(0.2);
    expect(g.player.resources.metals + g.player.resources.energy).toBeLessThan(stock); // paid for
    g.advance(4);
    expect(supplyLevel(guard.ships).overall).toBeGreaterThan(0.99);
  });

  it("fleets in the field get a supply tender from the nearest colony", () => {
    const g = Game.create({ seed: "tender", pirates: false });
    const s = g.state;
    const guard = playerFleet(g, "Home Guard");
    const next = s.systems[guard.systemId!].gates[0].otherSystemId;
    expect(g.moveFleet(guard.id, next).ok).toBe(true);
    for (let i = 0; i < 3000 && (guard.order || guard.transit); i++) g.step();
    expect(guard.systemId).toBe(next);
    empty(guard);
    g.player.resources.metals = 800;
    g.player.resources.energy = 800;
    g.player.resources.credits = 500;
    g.advance(1.05);
    const tender = Object.values(s.fleets).find((f) => f.order?.kind === "resupply" && f.order.fleetId === guard.id);
    expect(tender).toBeDefined();
    expect(tender!.civilian).toBe(true);
    expect(tender!.supplies!.metals + tender!.supplies!.energy).toBeGreaterThan(5);
    expect(g.player.resources.metals).toBeLessThan(800); // loaded from the stockpile
    for (let i = 0; i < 4000 && s.fleets[tender!.id]; i++) g.step();
    expect(s.fleets[tender!.id]).toBeUndefined();
    expect(supplyLevel(guard.ships).overall).toBeGreaterThan(0.5);
  });

  it("a tender whose fleet is lost brings its cargo back", () => {
    const g = Game.create({ seed: "tender-lost", pirates: false });
    const s = g.state;
    const guard = playerFleet(g, "Home Guard");
    const next = s.systems[guard.systemId!].gates[0].otherSystemId;
    g.moveFleet(guard.id, next);
    for (let i = 0; i < 3000 && (guard.order || guard.transit); i++) g.step();
    empty(guard);
    g.player.resources = { credits: 500, metals: 800, energy: 800, exotics: 0 };
    g.advance(1.05);
    const tender = Object.values(s.fleets).find((f) => f.order?.kind === "resupply")!;
    const carried = tender.supplies!.metals;
    const before = g.player.resources.metals;
    delete s.fleets[guard.id];
    g.advance(1.05);
    expect(s.fleets[tender.id]).toBeUndefined();
    expect(g.player.resources.metals).toBeGreaterThan(before + carried * 0.99 - 20);
  });
});

describe("systems changing hands", () => {
  function setup() {
    const g = Game.create({ seed: "hands", aiCount: 1, pirates: false });
    const s = g.state;
    const enemy = Object.values(s.empires).find((e) => e.ai && !e.isPirate)!;
    const cap = Object.values(s.colonies).find((c) => c.empireId === enemy.id)!;
    return { g, s, enemy, cap };
  }
  const capture = (s: GameState, colonyId: string, to: string) => {
    s.colonies[colonyId].empireId = to;
    s.colonies[colonyId].capital = false;
  };

  it("taking a system's only colony hands the system over", () => {
    const { g, s, enemy, cap } = setup();
    expect(systemOwner(s, cap.systemId)).toBe(enemy.id);
    capture(s, cap.id, g.playerId);
    expect(systemOwner(s, cap.systemId)).toBe(g.playerId);
    expect(systemOwnerMap(s)[cap.systemId]).toBe(g.playerId);
    expect(systemHolders(s, cap.systemId).map((h) => h.empireId)).toEqual([g.playerId]);
  });

  it("taking one of two colonies leaves the system contested, held by the larger side", () => {
    const { g, s, enemy, cap } = setup();
    const moon = s.systems[cap.systemId].bodyIds.map((id) => s.bodies[id]).find((b) => b.id !== cap.bodyId && (b.kind === "planet" || b.kind === "moon"))!;
    const second = foundColony(s, enemy, moon.id, 2);
    capture(s, second.id, g.playerId);
    const holders = systemHolders(s, cap.systemId);
    expect(holders.map((h) => h.empireId)).toEqual([enemy.id, g.playerId]); // contested, enemy still stronger
    expect(systemOwner(s, cap.systemId)).toBe(enemy.id);
    capture(s, cap.id, g.playerId);
    expect(systemOwner(s, cap.systemId)).toBe(g.playerId);
    expect(systemHolders(s, cap.systemId)).toHaveLength(1);
  });

  it("stations alone never outweigh a colony, and a fallen empire's stations vanish", () => {
    const { g, s, enemy, cap } = setup();
    for (let i = 0; i < 20; i++) s.stations[`st${i}`] = { id: `st${i}`, empireId: enemy.id, systemId: cap.systemId, bodyId: cap.bodyId, type: "mining_station", hp: 100 } as never;
    capture(s, cap.id, g.playerId);
    expect(systemOwner(s, cap.systemId)).toBe(g.playerId);
    g.advance(1.1); // the enemy has no colonies left: it collapses
    expect(s.empires[enemy.id].alive).toBe(false);
    expect(Object.values(s.stations).some((x) => x.empireId === enemy.id)).toBe(false);
  });

  it("ceding a colony by treaty moves the system too", () => {
    const { g, s, enemy, cap } = setup();
    meet(g, enemy.id);
    const moon = s.systems[cap.systemId].bodyIds.map((id) => s.bodies[id]).find((b) => b.id !== cap.bodyId && (b.kind === "planet" || b.kind === "moon"))!;
    const outpost = foundColony(s, enemy, moon.id, 1);
    delete s.colonies[cap.id]; // the enemy's only colony there is the outpost
    foundColony(s, enemy, Object.values(s.bodies).find((b) => b.systemId !== cap.systemId && canColonize(enemy, b) && !Object.values(s.colonies).some((c) => c.bodyId === b.id))!.id, 5).capital = true;
    expect(cedeColony(s, enemy.id, outpost.id, g.playerId).ok).toBe(true);
    expect(systemOwner(s, cap.systemId)).toBe(g.playerId);
    expect(g.player.explored[cap.systemId]).toBe(true);
  });
});
