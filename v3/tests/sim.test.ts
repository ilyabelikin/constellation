import { describe, expect, it } from "vitest";
import { Rng } from "../src/sim/rng";
import { Game } from "../src/sim/game";
import { createGame, isConnected, makeFleet, makeShip } from "../src/sim/galaxy";
import { findRoute } from "../src/sim/fleets";
import { orbitPosition, solveKepler } from "../src/sim/orbits";
import {
  buildingSlots,
  canColonize,
  commandCapacity,
  habitability,
  hullCost,
  incomeReport,
  maxDefense,
  stationBuildError,
  systemOwner,
} from "../src/sim/economy";
import { STAR_TYPES } from "../src/sim/data/stars";
import { PLANET_TYPES } from "../src/sim/data/planets";
import { TECHS, TECH_MAP } from "../src/sim/data/techs";
import { HULLS } from "../src/sim/data/ships";
import { STATIONS } from "../src/sim/data/structures";
import { fleetPower } from "../src/sim/combat";
import type { Colony, Fleet, GameState } from "../src/sim/types";

function home(g: Game): Colony {
  return g.playerColonies()[0];
}

function playerFleet(g: Game, name: string): Fleet {
  return Object.values(g.state.fleets).find((f) => f.empireId === g.playerId && f.name === name)!;
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
    for (const h of HULLS) if (h.requires) expect(TECH_MAP[h.requires]).toBeDefined();
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
    expect(g.player.resources.credits).toBe(before.credits - 60);
    expect(runUntil(g, () => c.buildings.some((b) => b.type === "trade_hub"), 20)).toBe(true);
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
      g.advance(15);
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
  it("routes through tunnels and explores new systems", () => {
    const g = Game.create({ seed: "fleet" });
    const scout = playerFleet(g, "Pathfinder");
    const start = scout.systemId!;
    const target = Object.keys(g.state.systems).find((id) => (findRoute(g.state, start, id)?.length ?? 0) === 2)!;
    expect(g.player.explored[target]).toBeUndefined();
    expect(g.moveFleet(scout.id, target, { bodyId: g.state.systems[target].starIds[0] }).ok).toBe(true);
    expect(runUntil(g, () => scout.systemId === target && !scout.order, 400)).toBe(true);
    expect(g.player.explored[target]).toBe(true);
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
    expect(runUntil(g, () => !s.stations[haven.id], 100)).toBe(true);
    expect(g.player.resources.credits).toBeGreaterThan(credits + 200);
  });

  it("sieges planetary defenses and captures colonies by invasion", () => {
    const g = Game.create({ seed: "invade" });
    const s = g.state;
    const enemy = Object.values(s.empires).find((e) => !e.isPlayer && !e.isPirate)!;
    enemy.ai = null; // keep the defender passive for the test
    const target = Object.values(s.colonies).find((c) => c.empireId === enemy.id)!;
    for (const f of Object.values(s.fleets)) if (f.empireId === enemy.id) delete s.fleets[f.id];
    g.declareWar(enemy.id);
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
    expect(g.player.resources.credits).toBeCloseTo(paid.credits + 40, 5);
    expect(g.player.resources.metals).toBeCloseTo(paid.metals + 70, 5);
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
