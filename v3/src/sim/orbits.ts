// Keplerian orbits. Periods are compressed (ORBIT_TIME_SCALE) so inner worlds
// visibly move at normal game speed while outer giants crawl.

import type { Body, GameState, Orbit, Vec3 } from "./types";

export const ORBIT_TIME_SCALE = 0.15;

export function orbitalPeriodDays(aAU: number, starMass: number): number {
  return 365.25 * Math.sqrt((aAU * aAU * aAU) / Math.max(0.05, starMass)) * ORBIT_TIME_SCALE;
}

/** Solve Kepler's equation M = E - e sin E with Newton-Raphson. */
export function solveKepler(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 12; i++) {
    const f = E - e * Math.sin(E) - M;
    const d = 1 - e * Math.cos(E);
    const step = f / d;
    E -= step;
    if (Math.abs(step) < 1e-10) break;
  }
  return E;
}

/** Position on an orbit relative to its parent (units of `orbit.a`). Y is "up". */
export function orbitPosition(orbit: Orbit, day: number, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  const n = (2 * Math.PI) / orbit.period;
  const M = orbit.phase + n * day;
  const E = solveKepler(((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), orbit.e);
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  // Position in the orbital plane.
  const xp = orbit.a * (cosE - orbit.e);
  const yp = orbit.a * Math.sqrt(1 - orbit.e * orbit.e) * sinE;
  // Rotate: argument of periapsis, inclination, ascending node.
  const cw = Math.cos(orbit.argPeri);
  const sw = Math.sin(orbit.argPeri);
  const ci = Math.cos(orbit.inclination);
  const si = Math.sin(orbit.inclination);
  const cn = Math.cos(orbit.node);
  const sn = Math.sin(orbit.node);
  const x1 = xp * cw - yp * sw;
  const y1 = xp * sw + yp * cw;
  const x2 = x1;
  const y2 = y1 * ci;
  const z2 = y1 * si;
  out.x = x2 * cn - y2 * sn;
  out.z = x2 * sn + y2 * cn;
  out.y = z2;
  return out;
}

/**
 * Game-logic position of a body in AU within its system. Moons share their
 * planet's position for logistics (their visual offset is a renderer concern).
 */
export function bodyPosition(state: GameState, body: Body, day = state.day): Vec3 {
  if (!body.orbit) return { x: 0, y: 0, z: 0 };
  if (body.kind === "moon" && body.parentId) {
    const parent = state.bodies[body.parentId];
    return bodyPosition(state, parent, day);
  }
  return orbitPosition(body.orbit, day);
}

export function dist(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function vec(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function copyVec(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

export function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}
