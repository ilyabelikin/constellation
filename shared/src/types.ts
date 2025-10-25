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
  type: "star" | "planet" | "moon";
  mass: number; // kg
  radius: number; // meters
  parentId: string | null; // null for stars
  orbitalElements: OrbitalElements | null; // null for stars
  color?: string; // hex color for rendering
  hasAtmosphere?: boolean; // whether planet has atmosphere
  planetType?: string; // planet type like "Super-Earth", "Gas Giant", etc.
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
}

export interface StarSystem {
  id: string;
  galaxyId: string;
  position: Vector3; // position in galaxy (light years)
  seed: number;
  star: CelestialBodyType;
  planets: CelestialBodyType[];
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
