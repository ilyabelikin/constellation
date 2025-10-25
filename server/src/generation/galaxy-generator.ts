import { v4 as uuidv4 } from "uuid";
import { Galaxy, StarSystem, Vector3 } from "@constellation/shared";
import { SeededRandom } from "./random.js";
import { generateStarSystem } from "./system-generator.js";

export function generateGalaxy(name: string): Galaxy {
  return {
    id: uuidv4(),
    name,
    seed: Math.floor(Math.random() * 1000000000),
    createdAt: Date.now(),
  };
}

export function generateStarterSystem(
  galaxyId: string,
  galaxySeed: number
): StarSystem {
  const rng = new SeededRandom(galaxySeed);

  // Generate a starter system near the origin
  const position: Vector3 = {
    x: rng.nextFloat(-10, 10),
    y: rng.nextFloat(-10, 10),
    z: rng.nextFloat(-2, 2),
  };

  const systemSeed = rng.nextInt(0, 1000000000);
  const { star, planets } = generateStarSystem(systemSeed);

  return {
    id: uuidv4(),
    galaxyId,
    position,
    seed: systemSeed,
    star,
    planets,
  };
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
    });
  }

  return systems;
}
