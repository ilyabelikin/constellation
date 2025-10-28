import * as THREE from "three";

/**
 * Shared utility for calculating seed-based random values
 * Matches the GLSL seededRandom function
 */
export function seededRandom(seed: number): number {
  return Math.abs(Math.sin(seed) * 43758.5453123) % 1.0;
}

/**
 * Ocean color types for terrestrial planets
 */
export enum OceanColorType {
  DEEP_BLUE = 0, // Earth-like, dark rich blue
  LIGHT_BLUE = 1, // Tropical, bright Caribbean blue
  TURQUOISE = 2, // Exotic, cyan-green
}

/**
 * Get ocean color type based on planet seed
 */
export function getOceanColorType(planetSeed: number): OceanColorType {
  const oceanColorSeed = seededRandom(planetSeed * 2.7);

  if (oceanColorSeed < 0.33) {
    return OceanColorType.DEEP_BLUE;
  } else if (oceanColorSeed < 0.66) {
    return OceanColorType.LIGHT_BLUE;
  } else {
    return OceanColorType.TURQUOISE;
  }
}

/**
 * Get ocean base color as GLSL vec3 string for shaders
 */
export function getOceanColorGLSL(oceanType: OceanColorType): string {
  switch (oceanType) {
    case OceanColorType.DEEP_BLUE:
      return "vec3(0.05, 0.15, 0.35)";
    case OceanColorType.LIGHT_BLUE:
      return "vec3(0.15, 0.25, 0.40)";
    case OceanColorType.TURQUOISE:
      return "vec3(0.10, 0.30, 0.35)";
  }
}

/**
 * Get atmosphere color based on ocean type
 * Atmosphere is lighter and more saturated than ocean
 */
export function getAtmosphereColor(oceanType: OceanColorType): THREE.Color {
  switch (oceanType) {
    case OceanColorType.DEEP_BLUE:
      // Deep blue ocean - lighter blue atmosphere
      return new THREE.Color(0.4, 0.6, 0.85);
    case OceanColorType.LIGHT_BLUE:
      // Light blue ocean - bright cyan atmosphere
      return new THREE.Color(0.5, 0.7, 0.9);
    case OceanColorType.TURQUOISE:
      // Turquoise ocean - cyan-green atmosphere
      return new THREE.Color(0.45, 0.75, 0.85);
  }
}
