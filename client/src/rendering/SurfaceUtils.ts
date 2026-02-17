import * as THREE from "three";

/**
 * Find the approximate surface distance from the center of a body mesh
 * along a given local-space direction by averaging nearby geometry vertices
 * within a small cone. Works for all body shapes: spherical, elliptical,
 * rugged, faceted, and contact binary.
 *
 * @param geometry - The body's buffer geometry (may be deformed)
 * @param direction - Unit direction vector in the body's local space
 * @param embedFactor - Multiplier (0-1) to push result slightly inward.
 *                      1.0 = exact surface, 0.98 = slightly embedded. Default 0.98.
 * @returns Distance from center to the surface in the given direction
 */
export function findSurfaceRadius(
  geometry: THREE.BufferGeometry,
  direction: THREE.Vector3,
  embedFactor: number = 0.98
): number {
  // Fallback: bounding sphere or sphere parameters
  geometry.computeBoundingSphere();
  const fallback =
    (geometry as THREE.SphereGeometry).parameters?.radius ||
    geometry.boundingSphere?.radius ||
    1;

  const positions = geometry.attributes.position;
  if (!positions) return fallback * embedFactor;

  // Collect vertices within ~15° cone of the target direction (dot > 0.96)
  const CONE_THRESHOLD = 0.96;
  let totalDistance = 0;
  let count = 0;

  const vertex = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    vertex.set(positions.getX(i), positions.getY(i), positions.getZ(i));
    const dist = vertex.length();
    if (dist < 0.001) continue;

    const dot = vertex.clone().normalize().dot(direction);
    if (dot > CONE_THRESHOLD) {
      totalDistance += dist;
      count++;
    }
  }

  const surfaceDistance = count > 0 ? totalDistance / count : fallback;
  return surfaceDistance * embedFactor;
}
