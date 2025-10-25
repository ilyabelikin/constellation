import { v4 as uuidv4 } from "uuid";
import { Galaxy, StarSystem, Vector3, StarGate } from "@constellation/shared";
import { SeededRandom } from "./random.js";
import { generateStarSystem } from "./system-generator.js";
import {
  determineGateCount,
  generateGates,
  generateStarterGates,
} from "./gate-generator.js";

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
 */
export function generateNewSystem(
  galaxyId: string,
  galaxySeed: number,
  connectedToSystemIds: string[] = []
): StarSystem {
  const rng = new SeededRandom(galaxySeed);

  // Generate position (near origin for now, can be improved later)
  const position: Vector3 = {
    x: rng.nextFloat(-10, 10),
    y: rng.nextFloat(-10, 10),
    z: rng.nextFloat(-2, 2),
  };

  const systemSeed = rng.nextInt(0, 1000000000);
  const { star, planets } = generateStarSystem(systemSeed);

  const systemId = uuidv4();

  // Generate gates
  const gateRng = new SeededRandom(systemSeed + 999);
  const gateCount = determineGateCount(gateRng);

  // Create destination list
  const destinations: string[] = [...connectedToSystemIds];

  // Fill remaining slots with placeholders
  const remainingSlots = Math.max(0, gateCount - connectedToSystemIds.length);
  for (let i = 0; i < remainingSlots; i++) {
    destinations.push(`PLACEHOLDER_${i}`);
  }

  const gates = generateGates(gateRng, systemId, star.mass, destinations);

  return {
    id: systemId,
    galaxyId,
    position,
    seed: systemSeed,
    star,
    planets,
    gates,
  };
}

/**
 * Generate a starter system for a new galaxy (convenience wrapper)
 */
export function generateStarterSystem(
  galaxyId: string,
  galaxySeed: number
): StarSystem {
  // Starter system has no connected systems, so all gates are placeholders
  return generateNewSystem(galaxyId, galaxySeed, []);
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
    const { star, planets } = generateStarSystem(systemSeed);

    systems.push({
      id: uuidv4(),
      galaxyId,
      position,
      seed: systemSeed,
      star,
      planets,
      gates: [], // Gates will be populated by generateSystemConnections
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

    system.gates = generateGates(
      systemRng,
      system.id,
      system.star.mass,
      connections
    );
  }
}
