// Mapping from simulation units (AU, Earth/Solar radii, light years) to
// scene units. Distances are compressed sub-linearly so a whole system fits
// on screen while inner planets remain distinguishable.

import type { Vec3 } from "../sim/types";
import { STAR_TYPE_MAP } from "../sim/data/stars";

export const GALAXY_SCALE = 6; // scene units per light year

export function auToScene(au: number): number {
  return 34 * Math.pow(Math.max(au, 0), 0.55);
}

export function mapSystemPos(p: Vec3, out: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }) {
  const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
  if (r < 1e-9) {
    out.x = out.y = out.z = 0;
    return out;
  }
  const k = auToScene(r) / r;
  out.x = p.x * k;
  out.y = p.y * k;
  out.z = p.z * k;
  return out;
}

export function planetVisualRadius(earthRadii: number): number {
  return 0.45 + 0.95 * Math.sqrt(earthRadii);
}

/** Moons skip the planet curve's minimum size so small moons stay small. */
export function moonVisualRadius(earthRadii: number): number {
  return Math.max(0.14, 0.85 * Math.sqrt(earthRadii));
}

export function starVisualRadius(type: string, solarRadii: number): number {
  const st = STAR_TYPE_MAP[type];
  if (st?.special === "neutron") return 0.7;
  if (st?.special === "blackhole") return 2.2;
  if (st?.special === "whitedwarf") return 1.1;
  return Math.max(1.2, 3 + 2.6 * Math.log10(1 + solarRadii * 3));
}

export function shipVisualLength(meters: number): number {
  return 0.9 * Math.pow(meters / 60, 0.4);
}

export function galaxyPos(p: Vec3) {
  return { x: p.x * GALAXY_SCALE, y: p.y * GALAXY_SCALE * 0.5, z: p.z * GALAXY_SCALE };
}
