// Visual layout of one star system. Real distances would put every planet a
// pixel from its star, so orbits are compressed (AU^0.55), but compression
// alone let big planets, their moon systems and belts crowd or overlap. Here
// the radial mapping is built per system as a monotonic piecewise-linear
// curve whose knots guarantee clear space between neighbouring orbits
// (including eccentricity, rings and moon systems), and moons get orbits
// spaced by their sizes so nothing ever touches.

import { STAR_TYPE_MAP } from "../sim/data/stars";
import type { Body, GameState, Vec3 } from "../sim/types";

/** Base compression, before clearances are enforced. */
const BASE_SCALE = 44;
const BASE_POWER = 0.55;
/** Empty space kept between neighbouring orbits' outer edges (scene units). */
const ORBIT_GAP = 7;

export function baseAuToScene(au: number): number {
  return BASE_SCALE * Math.pow(Math.max(au, 0), BASE_POWER);
}

/** Planets are drawn much smaller than their star (Jupiter ≈ a third of the Sun). */
export function planetVisualRadius(earthRadii: number): number {
  return 0.3 + 0.5 * Math.sqrt(earthRadii);
}

/** Moons follow the same curve without its offset, so small moons stay small. */
export function moonVisualRadius(earthRadii: number): number {
  return Math.max(0.1, 0.5 * Math.sqrt(earthRadii));
}

export function starVisualRadius(type: string, solarRadii: number): number {
  const st = STAR_TYPE_MAP[type];
  if (st?.special === "neutron") return 0.9;
  if (st?.special === "blackhole") return 2.6;
  if (st?.special === "whitedwarf") return 1.3;
  return Math.max(1.6, 4 + 3.4 * Math.log10(1 + solarRadii * 3));
}

export function bodyVisualRadius(body: Body): number {
  if (body.kind === "star") return starVisualRadius(body.type, body.radius);
  if (body.kind === "moon") return moonVisualRadius(body.radius);
  return planetVisualRadius(body.radius);
}

interface Knot {
  au: number;
  scene: number;
}

export class SystemLayout {
  private knots: Knot[] = [{ au: 0, scene: 0 }];
  /** Scene distance of each moon from its planet. */
  private moonDist = new Map<string, number>();
  /** Scene radius of each planet's "neighbourhood" (rings and moons included). */
  private reach = new Map<string, number>();
  readonly starRadius: number;

  constructor(state: GameState, systemId: string) {
    const sys = state.systems[systemId];
    const bodies = [...sys.starIds, ...sys.bodyIds].map((id) => state.bodies[id]).filter(Boolean);
    const primary = state.bodies[sys.starIds[0]];
    this.starRadius = primary ? starVisualRadius(primary.type, primary.radius) : 3;

    // Moons: spaced outward from the planet (or its rings) by their own sizes.
    for (const p of bodies.filter((b) => b.kind === "planet")) {
      const pr = planetVisualRadius(p.radius);
      const gap = Math.max(0.3, pr * 0.3);
      let edge = pr * (p.ring ? p.ring.outer : 1) + gap;
      const moons = bodies.filter((b) => b.kind === "moon" && b.parentId === p.id).sort((a, b) => a.orbit!.a - b.orbit!.a);
      for (const m of moons) {
        const mr = moonVisualRadius(m.radius);
        this.moonDist.set(m.id, edge + mr);
        edge += mr * 2 + gap;
      }
      this.reach.set(p.id, Math.max(pr * (p.ring ? p.ring.outer : 1), moons.length ? edge - gap : pr));
    }

    // Orbits around the primary, inside out, each pushed out until clear of the last.
    const orbiting = bodies.filter((b) => b.orbit && b.kind !== "moon" && b.kind !== "comet").sort((a, b) => a.orbit!.a - b.orbit!.a);
    let prevScene = 0;
    let prevReach = this.starRadius * 2.5; // corona and glow
    let prevAu = 0;
    let prevE = 0;
    for (const b of orbiting) {
      const a = b.orbit!.a;
      const e = b.orbit!.e ?? 0;
      if (a <= prevAu) continue; // shared orbit (e.g. a belt on a planet's path): keep the first
      // Half-width of what sweeps around this orbit, in scene units.
      const reach =
        b.kind === "belt"
          ? Math.max(2.5, (baseAuToScene(a + b.radius) - baseAuToScene(Math.max(0, a - b.radius))) * 0.5)
          : b.kind === "star"
            ? starVisualRadius(b.type, b.radius) * 2.5
            : (this.reach.get(b.id) ?? 1);
      // Eccentric orbits swing into the segment between the two knots: only the
      // part between the previous apoapsis and this periapsis is really free.
      const free = Math.max(0.25, (a * (1 - e) - prevAu * (1 + prevE)) / (a - prevAu));
      const scene = Math.max(baseAuToScene(a), prevScene + (prevReach + reach + ORBIT_GAP) / free);
      this.knots.push({ au: a, scene });
      if (b.kind === "belt") this.reach.set(b.id, reach);
      prevScene = scene;
      prevReach = reach;
      prevAu = a;
      prevE = e;
    }
  }

  /** Scene distance from the centre for a distance in AU (monotonic). */
  radius(au: number): number {
    const k = this.knots;
    if (au <= 0) return 0;
    for (let i = 1; i < k.length; i++) {
      if (au <= k[i].au) {
        const t = (au - k[i - 1].au) / (k[i].au - k[i - 1].au);
        return k[i - 1].scene + t * (k[i].scene - k[i - 1].scene);
      }
    }
    const last = k[k.length - 1];
    if (last.au === 0) return baseAuToScene(au);
    return last.scene * Math.pow(au / last.au, BASE_POWER);
  }

  /** Inverse of radius(). */
  auAt(scene: number): number {
    const k = this.knots;
    if (scene <= 0) return 0;
    for (let i = 1; i < k.length; i++) {
      if (scene <= k[i].scene) {
        const t = (scene - k[i - 1].scene) / (k[i].scene - k[i - 1].scene);
        return k[i - 1].au + t * (k[i].au - k[i - 1].au);
      }
    }
    const last = k[k.length - 1];
    if (last.au === 0) return Math.pow(scene / BASE_SCALE, 1 / BASE_POWER);
    return last.au * Math.pow(scene / last.scene, 1 / BASE_POWER);
  }

  /** Map a system position (AU) to the scene, compressing only radially. */
  map(p: Vec3, out: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }) {
    const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    if (r < 1e-9) {
      out.x = out.y = out.z = 0;
      return out;
    }
    const k = this.radius(r) / r;
    out.x = p.x * k;
    out.y = p.y * k;
    out.z = p.z * k;
    return out;
  }

  moonDistance(moonId: string): number | undefined {
    return this.moonDist.get(moonId);
  }

  /** Half-width of a belt's band (scene units). */
  beltHalfWidth(beltId: string): number {
    return this.reach.get(beltId) ?? 2.5;
  }

  /** Radius of a planet's rings-and-moons neighbourhood. */
  planetReach(planetId: string): number | undefined {
    return this.reach.get(planetId);
  }
}
