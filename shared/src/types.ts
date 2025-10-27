// Core game types

// Surface type definitions (shared between server generation and client rendering)
export const SurfaceType = {
  TERRESTRIAL: "terrestrial", // Earth-like with continents, oceans, ice caps
  DESERT: "desert", // Arid desert worlds
  CRATERED: "cratered", // Rocky, cratered surfaces
  BANDED: "banded", // Gas giants with bands
  ICY: "icy", // Frozen ice worlds
  VOLCANIC: "volcanic", // Lava worlds
  OCEANIC: "oceanic", // Water worlds
} as const;

export type SurfaceTypeName = (typeof SurfaceType)[keyof typeof SurfaceType];

// Shader uniform values for each surface type
// These map surface type strings to shader float constants
export const SurfaceTypeShaderValue: Record<SurfaceTypeName, number> = {
  [SurfaceType.TERRESTRIAL]: 0.0,
  [SurfaceType.DESERT]: 1.0,
  [SurfaceType.CRATERED]: 2.0,
  [SurfaceType.BANDED]: 3.0,
  [SurfaceType.ICY]: 4.0,
  [SurfaceType.VOLCANIC]: 5.0,
  [SurfaceType.OCEANIC]: 6.0,
};

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface OrbitalElements {
  semiMajorAxis: number; // meters
  eccentricity: number; // 0-1
  inclination: number; // radians
  longitudeOfAscendingNode: number; // radians
  argumentOfPeriapsis: number; // radians
  meanAnomalyAtEpoch: number; // radians
  epoch: number; // game time in seconds
}

// Life development levels
export const LifeLevel = {
  NONE: "none", // No life detected
  MICROBIAL: "microbial", // Single-celled organisms, bacteria
  SIMPLE: "simple", // Multicellular life, plants, simple animals
  COMPLEX: "complex", // Advanced ecosystems, diverse fauna
  INTELLIGENT: "intelligent", // Sentient civilizations
} as const;

export type LifeLevelType = (typeof LifeLevel)[keyof typeof LifeLevel];

export interface CelestialBodyType {
  id: string;
  name: string;
  type: "star" | "planet" | "moon" | "gate" | "asteroid";
  mass: number; // kg
  radius: number; // meters
  parentId: string | null; // null for stars
  orbitalElements: OrbitalElements | null; // null for stars
  color?: string; // hex color for rendering
  hasAtmosphere?: boolean; // whether planet has atmosphere
  cloudCoverage?: number; // 0-1, how much cloud coverage for planets with atmosphere
  surfaceType?: SurfaceTypeName; // surface appearance type
  planetType?: string; // planet type like "Super-Earth", "Gas Giant", etc.
  starType?: string; // star type like "Red Dwarf (M-class)", "Blue Giant (O-class)", etc.
  luminosity?: number; // star luminosity factor (relative to Sun, where Sun = 1.0)
  // Life and habitability properties (for planets)
  lifeLevel?: LifeLevelType; // Current level of life on planet
  habitability?: number; // 0-1, suitability for life (for terraforming/seeding)
  // Asteroid-specific properties
  asteroidBeltId?: string; // if this is an asteroid, the belt it belongs to
  composition?: "water" | "metal" | "silica"; // asteroid/moon composition
  shape?: "spherical" | "elliptical" | "rugged"; // asteroid/moon shape
  rotationRate?: number; // radians per second for spinning asteroids/moons
  isTumbling?: boolean; // whether moon/asteroid has chaotic tumbling rotation (vs stable single-axis)
  // Moon-specific properties
  moons?: CelestialBodyType[]; // moons orbiting this planet
  // Ring system properties (for gas giants)
  rings?: PlanetaryRing[];
}

export interface PlanetaryRing {
  innerRadius: number; // meters (actual radius, not scaled)
  outerRadius: number; // meters (actual radius, not scaled)
  color: string; // hex color
  opacity: number; // 0-1, overall opacity
  inclination: number; // radians, tilt relative to planet's orbital plane
}

export interface StarGate {
  id: string;
  name: string;
  systemId: string;
  destinationSystemId: string;
  orbitalElements: OrbitalElements;
}

export interface AsteroidBelt {
  id: string;
  name: string;
  parentId: string; // star ID
  innerRadius: number; // meters
  outerRadius: number; // meters
  inclination: number; // radians
  asteroidCount: number; // total number of asteroids
  asteroids: CelestialBodyType[]; // individual asteroids
}

export interface Ship {
  id: string;
  playerId: string;
  systemId: string;
  parentBodyId: string; // body being orbited
  orbitalElements: OrbitalElements;
  deltaV: number; // remaining delta-v in m/s
}

export interface Player {
  id: string;
  uuid: string;
  name: string;
  galaxyId: string;
  homeSystemId: string;
  currentSystemId: string;
  shipId: string;
  exploredGateIds: string[];
}

export interface StarSystem {
  id: string;
  galaxyId: string;
  position: Vector3; // position in galaxy (light years)
  seed: number;
  star: CelestialBodyType;
  planets: CelestialBodyType[];
  moons: CelestialBodyType[]; // all moons in the system (flattened)
  asteroidBelts: AsteroidBelt[];
  gates: StarGate[];
}

export interface Galaxy {
  id: string;
  name: string;
  seed: number;
  createdAt: number;
}

// Runtime state (not persisted, calculated on the fly)
export interface CelestialBodyState {
  id: string;
  position: Vector3; // meters relative to parent (or system center for star)
  velocity: Vector3; // m/s
}

export interface SystemState {
  systemId: string;
  currentTime: number; // game time in seconds since epoch
  bodies: CelestialBodyState[];
  ships: ShipState[];
  gates: CelestialBodyState[];
  asteroids: CelestialBodyState[]; // asteroid positions
  moons: CelestialBodyState[]; // moon positions
}

export interface ShipState {
  id: string;
  playerId: string;
  position: Vector3;
  velocity: Vector3;
}

// Lagrange points
export interface LagrangePoint {
  type: "L1" | "L2" | "L3" | "L4" | "L5";
  position: Vector3;
  primaryBodyId: string;
  secondaryBodyId: string;
}
