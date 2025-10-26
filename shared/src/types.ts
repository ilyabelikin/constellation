// Core game types

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
  surfaceType?: "cratered" | "smooth" | "volcanic" | "banded"; // surface appearance type
  planetType?: string; // planet type like "Super-Earth", "Gas Giant", etc.
  // Asteroid-specific properties
  asteroidBeltId?: string; // if this is an asteroid, the belt it belongs to
  composition?: "water" | "metal" | "silica"; // asteroid composition
  shape?: "spherical" | "elliptical" | "rugged"; // asteroid shape
  rotationRate?: number; // radians per second for spinning asteroids
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
