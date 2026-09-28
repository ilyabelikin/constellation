import { describe, expect, it } from "vitest";
import { Game } from "../src/sim/game";
import { orbitPosition } from "../src/sim/orbits";
import { bodyVisualRadius, moonVisualRadius, planetVisualRadius, starVisualRadius, SystemLayout } from "../src/render/layout";
import type { Body, GameState } from "../src/sim/types";
import { STAR_TYPE_MAP } from "../src/sim/data/stars";

/** Closest and farthest scene distance from the centre over a whole orbit. */
function sceneRange(layout: SystemLayout, b: Body): [number, number] {
  let lo = Infinity;
  let hi = 0;
  for (let i = 0; i < 90; i++) {
    const p = orbitPosition({ ...b.orbit!, phase: (i / 90) * Math.PI * 2 }, 0);
    const m = layout.map(p);
    const r = Math.hypot(m.x, m.y, m.z);
    lo = Math.min(lo, r);
    hi = Math.max(hi, r);
  }
  return [lo, hi];
}

function systems(seeds: string[]): { state: GameState; id: string }[] {
  const out: { state: GameState; id: string }[] = [];
  for (const seed of seeds) {
    const g = Game.create({ seed, systemCount: 40 });
    for (const id of Object.keys(g.state.systems)) out.push({ state: g.state, id });
  }
  return out;
}

describe("system layout", () => {
  const all = systems(["lay-1", "lay-2", "lay-3"]);

  it("never lets orbits, moon systems, rings or belts touch", () => {
    let pairs = 0;
    for (const { state, id } of all) {
      const layout = new SystemLayout(state, id);
      const sys = state.systems[id];
      const ring = [...sys.starIds, ...sys.bodyIds]
        .map((b) => state.bodies[b])
        .filter((b) => b.orbit && (b.kind === "planet" || b.kind === "belt" || b.kind === "star"))
        .sort((a, b) => a.orbit!.a - b.orbit!.a);
      const reach = (b: Body) => (b.kind === "planet" ? layout.planetReach(b.id)! : b.kind === "star" ? starVisualRadius(b.type, b.radius) * 2.5 : 2.5);
      for (let i = 1; i < ring.length; i++) {
        const [, prevHi] = sceneRange(layout, ring[i - 1]);
        const [lo] = sceneRange(layout, ring[i]);
        if (ring[i].kind === "belt" && ring[i - 1].kind === "belt") continue;
        expect(lo - reach(ring[i]) - (prevHi + reach(ring[i - 1]))).toBeGreaterThan(0);
        pairs++;
      }
      // The innermost orbit stays clear of the star's glow.
      if (ring[0]) expect(sceneRange(layout, ring[0])[0] - reach(ring[0])).toBeGreaterThan(layout.starRadius * 2);
      // Moons: spaced by their sizes, never overlapping each other or the planet.
      for (const p of ring.filter((b) => b.kind === "planet")) {
        const pr = planetVisualRadius(p.radius);
        const moons = sys.bodyIds.map((b) => state.bodies[b]).filter((m) => m.parentId === p.id).sort((a, b) => a.orbit!.a - b.orbit!.a);
        let edge = pr * (p.ring ? p.ring.outer : 1);
        for (const m of moons) {
          const d = layout.moonDistance(m.id)!;
          const mr = moonVisualRadius(m.radius);
          expect(d - mr).toBeGreaterThan(edge);
          edge = d + mr;
        }
      }
    }
    expect(pairs).toBeGreaterThan(200);
  });

  it("draws planets much smaller than their stars, and moons smaller than planets", () => {
    for (const { state, id } of all) {
      const sys = state.systems[id];
      const star = state.bodies[sys.starIds[0]];
      const special = !!STAR_TYPE_MAP[star.type].special; // compact remnants are tiny by nature
      for (const bid of sys.bodyIds) {
        const b = state.bodies[bid];
        if (b.kind === "planet" && !special) expect(bodyVisualRadius(b)).toBeLessThan(bodyVisualRadius(star) * 0.6);
        if (b.kind === "moon") expect(bodyVisualRadius(b)).toBeLessThan(bodyVisualRadius(state.bodies[b.parentId!]));
      }
    }
  });

  it("maps distances monotonically and invertibly", () => {
    const { state, id } = all[0];
    const layout = new SystemLayout(state, id);
    let prev = -1;
    for (let au = 0; au < 200; au += 0.37) {
      const r = layout.radius(au);
      expect(r).toBeGreaterThan(prev);
      expect(layout.auAt(r)).toBeCloseTo(au, 6);
      prev = r;
    }
  });
});
