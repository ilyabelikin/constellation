import { v4 as uuidv4 } from "uuid";
import {
  Galaxy,
  StarSystem,
  Vector3,
  StarGate,
  LifeLevel,
  CivilizationLevel,
} from "@constellation/shared";
import { SeededRandom } from "./random.js";
import { generateStarSystem } from "./system-generator.js";
import {
  determineGateCount,
  generateGates,
  generateStarterGates,
} from "./gate-generator.js";
import { addConnectivitySuffix } from "./name-generator.js";

export function generateGalaxy(name: string): Galaxy {
  return {
    id: uuidv4(),
    name,
    seed: Math.floor(Math.random() * 1000000000),
    createdAt: Date.now(),
  };
}

/**
 * Generate a new star system with gates
 * @param galaxyId - Galaxy this system belongs to
 * @param galaxySeed - Seed for galaxy-level randomness
 * @param connectedToSystemIds - Optional array of system IDs this system should have gates to
 * @param fixedPosition - Optional fixed position for the system (used for unexplored gates)
 * @param forceExit - If true, ensure at least one exit gate (prevents total lockout)
 * @param isHomeWorld - If true, skip connectivity suffix for this special system
 */
export function generateNewSystem(
  galaxyId: string,
  galaxySeed: number,
  connectedToSystemIds: string[] = [],
  fixedPosition?: Vector3,
  forceExit: boolean = false,
  isHomeWorld: boolean = false
): StarSystem {
  const rng = new SeededRandom(galaxySeed);

  // Use provided position or generate random one
  const position: Vector3 = fixedPosition || {
    x: rng.nextFloat(-10, 10),
    y: rng.nextFloat(-10, 10),
    z: rng.nextFloat(-2, 2),
  };

  const systemSeed = rng.nextInt(0, 1000000000);
  const { star, planets, moons, asteroidBelts, companionStars } =
    generateStarSystem(systemSeed, galaxyId);

  const systemId = uuidv4();

  // Generate gates
  const gateRng = new SeededRandom(systemSeed + 999);
  let gateCount = determineGateCount(gateRng);

  // IMPORTANT: If forceExit is true, ensure at least 2 gates (one back, one forward)
  // This prevents the player from getting completely stuck with no unexplored gates
  // Dead-end systems are allowed when forceExit is false
  if (forceExit && connectedToSystemIds.length > 0) {
    gateCount = Math.max(2, gateCount);
  }

  // Create destination list
  const destinations: string[] = [...connectedToSystemIds];

  // Fill remaining slots with placeholders
  const remainingSlots = Math.max(0, gateCount - connectedToSystemIds.length);
  for (let i = 0; i < remainingSlots; i++) {
    destinations.push(`PLACEHOLDER_${i}`);
  }

  // Extract planet orbital distances for gate placement
  const planetOrbits = planets
    .map((p) => p.orbitalElements?.semiMajorAxis || 0)
    .filter((orbit) => orbit > 0)
    .sort((a, b) => a - b);

  const gates = generateGates(
    gateRng,
    systemId,
    star.mass,
    destinations,
    planetOrbits
  );

  // Add connectivity suffix to star name based on gate count
  // Skip for home worlds - they deserve their distinguished name
  if (!isHomeWorld) {
    const nameRng = new SeededRandom(systemSeed + 777);
    star.name = addConnectivitySuffix(star.name, gateCount, nameRng);
  }

  return {
    id: systemId,
    galaxyId,
    position,
    seed: systemSeed,
    star,
    planets,
    moons,
    asteroidBelts,
    gates,
    companionStars,
  };
}

/**
 * Result of generating a starter system
 */
export interface StarterSystemResult {
  system: StarSystem;
  homePlanetId: string;
}

/**
 * Generate a starter system for a new galaxy (convenience wrapper)
 * Ensures the system has at least one habitable planet with max civilization
 */
export function generateStarterSystem(
  galaxyId: string,
  galaxySeed: number
): StarterSystemResult {
  const MAX_ATTEMPTS = 1000;
  const MIN_HABITABILITY = 0.5; // Minimum habitability score for starter planet

  let attempt = 0;
  let starterSystem: StarSystem | null = null;
  let bestHabitablePlanet: any = null;

  // Try to generate a system with a habitable planet
  while (attempt < MAX_ATTEMPTS) {
    const systemSeed = galaxySeed + attempt;
    const tempSystem = generateNewSystem(
      galaxyId,
      systemSeed,
      [],
      undefined,
      false,
      true
    );

    // Find the most habitable planet in this system
    const habitablePlanets = tempSystem.planets
      .filter(
        (planet) =>
          planet.habitability && planet.habitability >= MIN_HABITABILITY
      )
      .sort((a, b) => (b.habitability || 0) - (a.habitability || 0));

    if (habitablePlanets.length > 0) {
      starterSystem = tempSystem;
      bestHabitablePlanet = habitablePlanets[0];
      console.log(
        `Found starter system with habitable planet after ${
          attempt + 1
        } attempts`
      );
      console.log(
        `Planet: ${
          bestHabitablePlanet.name
        }, Habitability: ${bestHabitablePlanet.habitability?.toFixed(2)}`
      );
      break;
    }

    attempt++;
  }

  // If we couldn't find a system with a habitable planet, use the last generated one
  // and upgrade the most habitable planet anyway
  if (!starterSystem) {
    console.warn(
      `Could not find ideal starter system after ${MAX_ATTEMPTS} attempts, using best available`
    );
    starterSystem = generateNewSystem(
      galaxyId,
      galaxySeed,
      [],
      undefined,
      false,
      true
    );
    // Find best planet even if below threshold
    const sortedPlanets = starterSystem.planets
      .filter((planet) => planet.habitability !== undefined)
      .sort((a, b) => (b.habitability || 0) - (a.habitability || 0));

    if (sortedPlanets.length > 0) {
      bestHabitablePlanet = sortedPlanets[0];
    }
  }

  // Upgrade the best habitable planet to have intelligent life and max civilization
  let homePlanetId = "";
  if (bestHabitablePlanet) {
    bestHabitablePlanet.lifeLevel = LifeLevel.INTELLIGENT;
    bestHabitablePlanet.civilizationLevel = CivilizationLevel.INTERSTELLAR;
    homePlanetId = bestHabitablePlanet.id;

    // Ensure it has a proper atmosphere if it doesn't already
    if (!bestHabitablePlanet.hasAtmosphere) {
      bestHabitablePlanet.hasAtmosphere = true;
      bestHabitablePlanet.cloudCoverage = 0.4;
    }

    console.log(
      `Upgraded ${bestHabitablePlanet.name} to have ${bestHabitablePlanet.lifeLevel} life with ${bestHabitablePlanet.civilizationLevel} civilization`
    );
  } else {
    console.warn(
      "Warning: No suitable planet found for civilization in starter system"
    );
    // Fallback: use first planet if available
    if (starterSystem.planets.length > 0) {
      homePlanetId = starterSystem.planets[0].id;
    }
  }

  return { system: starterSystem, homePlanetId };
}

/**
 * Generate additional star systems for constellation view (future use)
 */
export function generateAdditionalSystems(
  galaxyId: string,
  galaxySeed: number,
  count: number
): StarSystem[] {
  const rng = new SeededRandom(galaxySeed + 1);
  const systems: StarSystem[] = [];

  for (let i = 0; i < count; i++) {
    const position: Vector3 = {
      x: rng.nextFloat(-100, 100),
      y: rng.nextFloat(-100, 100),
      z: rng.nextFloat(-20, 20),
    };

    const systemSeed = rng.nextInt(0, 1000000000);
    const { star, planets, moons, asteroidBelts, companionStars } =
      generateStarSystem(systemSeed, galaxyId);

    systems.push({
      id: uuidv4(),
      galaxyId,
      position,
      seed: systemSeed,
      star,
      planets,
      moons,
      asteroidBelts,
      gates: [], // Gates will be populated by generateSystemConnections
      companionStars,
    });
  }

  return systems;
}

/**
 * Generate gate connections between star systems
 * Creates a connected network graph with 1-5 gates per system
 */
export function generateSystemConnections(
  systems: StarSystem[],
  galaxySeed: number
): void {
  const rng = new SeededRandom(galaxySeed + 999);

  // Determine gate count for each system
  const systemGateCounts = new Map<string, number>();
  const systemConnections = new Map<string, Set<string>>();

  for (const system of systems) {
    const gateCount = determineGateCount(rng);
    systemGateCounts.set(system.id, gateCount);
    systemConnections.set(system.id, new Set());
  }

  // Create connections ensuring network connectivity
  // Start with minimum spanning tree approach
  const connected = new Set<string>([systems[0].id]);
  const unconnected = new Set(systems.slice(1).map((s) => s.id));

  // Connect all systems first (ensure no isolated systems)
  while (unconnected.size > 0) {
    const connectedArray = Array.from(connected);
    const unconnectedArray = Array.from(unconnected);

    const fromSystem =
      connectedArray[rng.nextInt(0, connectedArray.length - 1)];
    const toSystem =
      unconnectedArray[rng.nextInt(0, unconnectedArray.length - 1)];

    // Add bidirectional connection
    systemConnections.get(fromSystem)!.add(toSystem);
    systemConnections.get(toSystem)!.add(fromSystem);

    connected.add(toSystem);
    unconnected.delete(toSystem);
  }

  // Add additional connections up to gate count limits
  for (const system of systems) {
    const systemId = system.id;
    const maxGates = systemGateCounts.get(systemId)!;
    const currentConnections = systemConnections.get(systemId)!;

    // Try to add more connections if under limit
    while (currentConnections.size < maxGates) {
      // Find available systems to connect to
      const availableSystems = systems.filter(
        (s) =>
          s.id !== systemId && // Not self
          !currentConnections.has(s.id) && // Not already connected
          systemConnections.get(s.id)!.size < systemGateCounts.get(s.id)! // Target has space
      );

      if (availableSystems.length === 0) break;

      // Pick random available system
      const targetSystem =
        availableSystems[rng.nextInt(0, availableSystems.length - 1)];

      // Add bidirectional connection
      currentConnections.add(targetSystem.id);
      systemConnections.get(targetSystem.id)!.add(systemId);
    }
  }

  // Generate gates for each system based on connections
  for (const system of systems) {
    const connections = Array.from(systemConnections.get(system.id)!);
    const systemRng = new SeededRandom(system.seed + 12345);

    // Extract planet orbital distances for gate placement
    const planetOrbits = system.planets
      .map((p) => p.orbitalElements?.semiMajorAxis || 0)
      .filter((orbit) => orbit > 0)
      .sort((a, b) => a - b);

    system.gates = generateGates(
      systemRng,
      system.id,
      system.star.mass,
      connections,
      planetOrbits
    );

    // Add connectivity suffix to star name based on gate count
    const nameRng = new SeededRandom(system.seed + 777);
    system.star.name = addConnectivitySuffix(
      system.star.name,
      connections.length,
      nameRng
    );
  }
}
