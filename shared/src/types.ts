// Core game types

// Surface type definitions (shared between server generation and client rendering)
export const SurfaceType = {
  TERRESTRIAL: "terrestrial", // Earth-like with continents, oceans, ice caps
  DESERT: "desert", // Arid desert worlds with sand dunes
  BARREN: "barren", // Ancient, smooth, dust-covered worlds
  ROCKY: "rocky", // Rocky, heavily cratered surfaces
  GAS_GIANT: "gas_giant", // Gas giants with bands (Jupiter, Saturn)
  ICE_GIANT: "ice_giant", // Ice giants with soft clouds (Neptune, Uranus)
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
  [SurfaceType.BARREN]: 2.0,
  [SurfaceType.ROCKY]: 3.0,
  [SurfaceType.GAS_GIANT]: 4.0,
  [SurfaceType.ICE_GIANT]: 8.0,
  [SurfaceType.ICY]: 5.0,
  [SurfaceType.VOLCANIC]: 6.0,
  [SurfaceType.OCEANIC]: 7.0,
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

// Civilization development levels (for intelligent life)
export const CivilizationLevel = {
  PRIMITIVE: "primitive", // Stone age, tribal societies
  AGRICULTURAL: "agricultural", // Farming, early cities, writing
  INDUSTRIAL: "industrial", // Steam power, factories, railroads
  ATOMIC: "atomic", // Nuclear power, early space age
  INFORMATION: "information", // Computers, satellites, internet
  SPACEFARING: "spacefaring", // Interplanetary, colonies
  INTERSTELLAR: "interstellar", // FTL travel, star gates
} as const;

export type CivilizationLevelType =
  (typeof CivilizationLevel)[keyof typeof CivilizationLevel];

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
  civilizationLevel?: CivilizationLevelType; // Development level of intelligent civilizations
  speciesId?: string; // Species ID if planet has native intelligent life or is colonized
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
  // Helium-3 mining properties
  hasHelium3?: boolean; // whether body has mineable Helium-3 deposits
}

export interface PlanetaryRing {
  innerRadius: number; // meters (actual radius, not scaled)
  outerRadius: number; // meters (actual radius, not scaled)
  color: string; // hex color
  opacity: number; // 0-1, overall opacity
  inclination: number; // radians, tilt relative to planet's orbital plane
}

export interface Tunnel {
  id: string;
  systemAId: string;
  systemBId: string;
  poweredByPlayerId: string | null; // Player who is currently powering the tunnel
  powerCostEnergy: number; // Energy cost paid to power the tunnel
  overchargedAt: number; // Timestamp when tunnel was last overcharged (0 if never)
  createdAt: number;
}

export interface StarGate {
  id: string;
  tunnelId: string | null; // Null if destination system hasn't been generated yet
  name: string;
  systemId: string;
  destinationSystemId: string;
  orbitalElements: OrbitalElements;
  ownerId?: string; // Player who controls this gate
  tunnelPoweredBy?: string | null; // Species ID that powers the tunnel
}

// Gate relationship status (for gates owned by other players)
export const GateStatus = {
  UNEXPLORED: "unexplored", // Not yet explored by anyone
  OWNED_BY_SELF: "owned_by_self", // Explored by current player
  NEUTRAL: "neutral", // Explored by other civilization, neutral stance
  AGGRESSIVE: "aggressive", // Explored by aggressive civilization
  FRIENDLY: "friendly", // Explored by friendly civilization
} as const;

export type GateStatusType = (typeof GateStatus)[keyof typeof GateStatus];

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
  homePlanetId: string; // The civilized planet where player starts
  currentSystemId: string;
  shipId: string;
  exploredGateIds: string[];
  energy: number; // Resource for gate exploration and maintenance
  alloy: number; // Resource for construction
  science: number; // Resource for research and advancement
  energyPerDay?: number; // Total energy income rate from all dyson swarms
  alloyPerDay?: number; // Total alloy income rate from all mining operations
  sciencePerDay?: number; // Total science income rate from all colonies
  speciesId?: string; // Player's species ID
}

export interface MiningOperation {
  id: string;
  playerId: string;
  systemId: string;
  celestialBodyId: string; // asteroid or moon being mined
  alloyPerDay: number; // resource generation rate
  establishedAt: number; // timestamp when mining started
  lastYieldAt: number; // timestamp of last resource generation
  totalAlloyLimit: number; // total amount of alloy that can be mined (15-100)
  alloyMined: number; // amount of alloy already mined
}

export interface Helium3Operation {
  id: string;
  playerId: string;
  systemId: string;
  celestialBodyId: string; // planet or moon with Helium-3
  energyPerDay: number; // amount of energy added to pool (field name kept for compatibility)
  establishedAt: number; // timestamp when extraction was established
  lastYieldAt: number; // timestamp (unused, kept for compatibility)
}

// Species trait types
export const SpeciesTrait = {
  // Biological traits
  PHOTOSYNTHETIC: "photosynthetic", // Can produce energy from stars
  AQUATIC: "aquatic", // Prefers oceanic worlds
  SILICON_BASED: "silicon_based", // Silicon-based lifeform
  EXTREMOPHILE: "extremophile", // Can live in harsh conditions
  LONG_LIVED: "long_lived", // Extended lifespan
  RAPID_REPRODUCTION: "rapid_reproduction", // Fast population growth

  // Mental traits
  SCIENTIFIC: "scientific", // Bonus to science production
  INDUSTRIOUS: "industrious", // Bonus to alloy production
  EFFICIENT: "efficient", // Bonus to energy production
  ADAPTIVE: "adaptive", // Can colonize more planet types
  CURIOUS: "curious", // Faster exploration

  // Social traits
  COOPERATIVE: "cooperative", // Better diplomacy
  AGGRESSIVE: "aggressive", // Military advantages
  PACIFIST: "pacifist", // Cannot attack but gets bonuses
  XENOPHOBIC: "xenophobic", // Dislikes other species
  XENOPHILIC: "xenophilic", // Likes other species
} as const;

export type SpeciesTraitType = (typeof SpeciesTrait)[keyof typeof SpeciesTrait];

// Species appearance features
export interface SpeciesAppearance {
  bodyType:
    | "humanoid"
    | "insectoid"
    | "reptilian"
    | "avian"
    | "aquatic"
    | "crystalline"
    | "gaseous"
    | "mechanical";
  skinColor: string; // description of skin/surface color variety
  eyeColor: string; // description of eye color variety
  height: "short" | "medium" | "tall" | "variable";
  build: "slender" | "average" | "stocky" | "massive";
}

// Alien species definition
export interface Species {
  id: string;
  name: string;
  homeworld: string; // Name of homeworld
  homeworldId: string; // Planet ID
  appearance: SpeciesAppearance;
  traits: SpeciesTraitType[];
  description: string;
  createdAt: number;
  playerId?: string; // If this is a player-controlled species
  pregeneratedSpeciesId?: string; // Original pregenerated species template ID (e.g., "species_humans")
}

// Colony development stages
export const ColonyStage = {
  OUTPOST: "outpost", // Initial settlement (100-1000 population)
  SETTLEMENT: "settlement", // Growing colony (50M-500M)
  COLONY: "colony", // Established colony (500M-2B)
  DEVELOPED: "developed", // Developed world (2B-5B)
  METROPOLIS: "metropolis", // Major population center (5B-15B)
  ECUMENOPOLIS: "ecumenopolis", // Planet-wide city (15B+)
} as const;

export type ColonyStageType = (typeof ColonyStage)[keyof typeof ColonyStage];

// Colony specialization types
export const ColonySpecialization = {
  BALANCED: "balanced", // Balanced production
  RESEARCH: "research", // Science focus
  INDUSTRIAL: "industrial", // Alloy focus
} as const;

export type ColonySpecializationType =
  (typeof ColonySpecialization)[keyof typeof ColonySpecialization];

// Colony on a planet
export interface Colony {
  id: string;
  playerId: string;
  speciesId: string;
  systemId: string;
  planetId: string;
  planetName: string;
  stage: ColonyStageType;
  specialization: ColonySpecializationType;
  population: number;
  sciencePerDay: number;
  alloyPerDay: number;
  establishedAt: number;
  lastYieldAt: number;
}

// Native civilization (for intelligent life planets)
export interface NativeCivilization {
  id: string;
  speciesId: string;
  planetId: string;
  systemId: string;
  civilizationLevel: CivilizationLevelType;
  population: number;
  attitude: "friendly" | "neutral" | "hostile" | "unknown";
  discoveredAt?: number; // When player discovered them
  discoveredBy?: string; // Player ID who discovered them
}

export const MegastructureType = {
  DYSON_SWARM: "dyson_swarm",
} as const;

export type MegastructureTypeName =
  (typeof MegastructureType)[keyof typeof MegastructureType];

export interface Megastructure {
  id: string;
  playerId: string;
  systemId: string;
  type: MegastructureTypeName;
  celestialBodyId?: string; // star, planet, or null for system-level
  resourceType?: string; // "energy", "alloy", etc.
  resourcePerDay?: number; // resource generation rate
  establishedAt: number; // timestamp when built
  lastYieldAt: number; // timestamp of last resource generation
  metadata?: string; // JSON string for type-specific data
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
  companionStars?: CelestialBodyType[]; // For binary/trinary systems
  miningOperations?: MiningOperation[]; // Active mining operations in this system
  helium3Operations?: Helium3Operation[]; // Active Helium-3 mining operations in this system
  megastructures?: Megastructure[]; // Megastructures in this system
  colonies?: Colony[]; // Player colonies in this system
  nativeCivilizations?: NativeCivilization[]; // Native alien civilizations
}

export interface Galaxy {
  id: string;
  name: string;
  seed: number;
  createdAt: number;
  currentTime?: number;
  isPaused?: boolean;
  timeScale?: number;
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
  megastructures: Megastructure[]; // megastructures in this system
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

// Constellation view data
export interface ConstellationNode {
  systemId: string;
  systemName: string;
  starId: string; // Primary star ID
  starColor: string;
  position: Vector3; // Position in galaxy (light years)
  starType: string; // e.g., "G-type Main Sequence"
  starMass: number; // In solar masses
  planetCount: number; // Number of planets in the system
  exploredGates: number; // Number of explored gates
  totalGates: number; // Total number of gates
  jumpsFromHome: number; // Number of gate jumps from home system
  companionStars?: Array<{ id: string; color: string; type: string }>; // For binary/trinary systems
  dysonSwarms?: Array<{ starId: string; count: number }>; // Dyson swarms by star (primary + companions)
  habitablePlanetCount: number; // Number of habitable planets in the system
  colonizedHabitablePlanetCount: number; // Number of colonized habitable planets
  habitablePlanets?: Array<{
    planetId: string;
    planetName: string;
    isColonized: boolean;
  }>; // Habitable planet details
}

export interface ConstellationConnection {
  fromSystemId: string;
  toSystemId: string;
  isExplored: boolean; // Whether the gate has been discovered
  gateId?: string; // Optional gate ID for explored connections (gate at fromSystemId)
  ownerId?: string; // Player who owns the gate at fromSystemId
  ownerName?: string; // Name of the player who owns the gate at fromSystemId
  status?: GateStatusType; // Status relative to current player (gate at fromSystemId)

  // Tunnel information (both sides)
  tunnelId?: string; // The tunnel ID connecting both systems
  gateAId?: string; // Gate in system A
  gateBId?: string; // Gate in system B
  gateAOwnerId?: string; // Player who owns gate A
  gateBOwnerId?: string; // Player who owns gate B
  gateAStatus?: GateStatusType; // Status of gate A relative to current player
  gateBStatus?: GateStatusType; // Status of gate B relative to current player
  tunnelPoweredByPlayerId?: string | null; // Player ID that powers the tunnel
}

export interface UnexploredGate {
  gateId: string;
  systemId: string; // The system this gate is in
  position: Vector3; // Position where the star will appear when explored
}

// Gate defense platform
export interface GateDefense {
  id: string;
  gateId: string;
  playerId: string;
  systemId: string;
  health: number; // Current health (0-100)
  maxHealth: number; // Maximum health (default 100)
  createdAt: number; // timestamp when built
  energyCost: number; // Energy cost to build (for refund)
  alloyCost: number; // Alloy cost to build
  maintenanceAlloyPerDay: number; // Daily maintenance cost in alloy
  lastMaintenanceAt: number; // timestamp of last maintenance payment
}

// Gate attack status
export const AttackStatus = {
  IN_PROGRESS: "in_progress",
  ATTACKER_VICTORY: "attacker_victory",
  DEFENDER_VICTORY: "defender_victory",
} as const;

export type AttackStatusType = (typeof AttackStatus)[keyof typeof AttackStatus];

// Gate attack
export interface GateAttack {
  id: string;
  gateId: string;
  attackerId: string;
  defenderId: string;
  systemId: string;
  attackShipCount: number; // Number of attacking ships
  attackShipsRemaining: number; // Number of ships still alive
  status: AttackStatusType;
  startedAt: number; // timestamp when attack started
  completedAt?: number; // timestamp when attack completed
  combatLog?: string; // JSON string of combat events
}

// Technology types
export const TechnologyId = {
  NANO_ARRAYS: "nano_arrays",
  DEEP_MINING: "deep_mining",
  SHIELDS: "shields",
} as const;

export type TechnologyIdType =
  (typeof TechnologyId)[keyof typeof TechnologyId];

// Technology research status
export const ResearchStatus = {
  NOT_STARTED: "not_started",
  IN_PROGRESS: "in_progress",
  PAUSED: "paused",
  COMPLETED: "completed",
} as const;

export type ResearchStatusType =
  (typeof ResearchStatus)[keyof typeof ResearchStatus];

// Technology research progress
export interface TechnologyResearch {
  playerId: string;
  technologyId: TechnologyIdType;
  status: ResearchStatusType;
  progressDays: number; // Days of research completed (0-30)
  scienceInvested: number; // Total science invested
  startedAt: number; // Timestamp when research started
  completedAt?: number; // Timestamp when research completed
  pausedAt?: number; // Timestamp when research was paused
}
