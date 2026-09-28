// Galaxy-map and ship scales. System-view distances and body sizes live in
// layout.ts (built per system so orbits never crowd or collide).

import type { Vec3 } from "../sim/types";

export const GALAXY_SCALE = 6; // scene units per light year

export function shipVisualLength(meters: number): number {
  return 0.38 * Math.pow(meters / 60, 0.4);
}

export function galaxyPos(p: Vec3) {
  return { x: p.x * GALAXY_SCALE, y: p.y * GALAXY_SCALE * 0.5, z: p.z * GALAXY_SCALE };
}
