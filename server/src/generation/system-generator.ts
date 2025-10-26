import { v4 as uuidv4 } from "uuid";
import { SeededRandom } from "./random.js";
import { generatePlanetName, generateStarName } from "./name-generator.js";
import {
  CelestialBodyType,
  OrbitalElements,
  AsteroidBelt,
  SOLAR_MASS,
  SOLAR_RADIUS,
  EARTH_MASS,
  EARTH_RADIUS,
  ASTRONOMICAL_UNIT,
  MIN_PLANETS,
  MAX_PLANETS,
  GRAVITATIONAL_CONSTANT,
  SurfaceType,
  SurfaceTypeName,
} from "@constellation/shared";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Load planet types configuration
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const planetTypesConfig = JSON.parse(
  readFileSync(join(__dirname, "planet-types.json"), "utf-8")
);

interface StarClass {
  type: string;
  massRange: [number, number]; // in solar masses
  radiusRange: [number, number]; // in solar radii
  color: string;
}

const STAR_CLASSES: StarClass[] = [
  {
    type: "M",
    massRange: [0.08, 0.45],
    radiusRange: [0.1, 0.7],
    color: "#ff6b6b",
  },
  {
    type: "K",
    massRange: [0.45, 0.8],
    radiusRange: [0.7, 0.96],
    color: "#ffa94d",
  },
  {
    type: "G",
    massRange: [0.8, 1.04],
    radiusRange: [0.96, 1.15],
    color: "#ffe066",
  },
  {
    type: "F",
    massRange: [1.04, 1.4],
    radiusRange: [1.15, 1.4],
    color: "#fff3bf",
  },
  {
    type: "A",
    massRange: [1.4, 2.1],
    radiusRange: [1.4, 1.8],
    color: "#e3fafc",
  },
];

export function generateStar(rng: SeededRandom): CelestialBodyType {
  // Most stars are M-class, fewer are larger classes
  const weights = [0.76, 0.12, 0.08, 0.03, 0.01];
  const cumulative = weights.reduce(
    (acc: number[], w, i) => [...acc, (acc[i - 1] || 0) + w],
    []
  );
  const rand = rng.next();
  const classIndex = cumulative.findIndex((c) => rand <= c);
  const starClass = STAR_CLASSES[classIndex];

  const massMultiplier = rng.nextFloat(
    starClass.massRange[0],
    starClass.massRange[1]
  );
  const radiusMultiplier = rng.nextFloat(
    starClass.radiusRange[0],
    starClass.radiusRange[1]
  );

  return {
    id: uuidv4(),
    name: generateStarName(rng, starClass.type),
    type: "star",
    mass: massMultiplier * SOLAR_MASS,
    radius: radiusMultiplier * SOLAR_RADIUS,
    parentId: null,
    orbitalElements: null,
    color: starClass.color,
  };
}

export function generatePlanet(
  rng: SeededRandom,
  starMass: number,
  index: number,
  totalPlanets: number
): CelestialBodyType {
  // Load planet types from configuration
  const types = planetTypesConfig.planetTypes;

  // Select planet type based on position (inner vs outer system) and weights
  let planetType;
  const position = index / totalPlanets; // 0 = innermost, 1 = outermost

  // Filter types by size/mass for different system zones
  let candidateTypes;
  if (position < 0.3) {
    // Inner system: small terrestrial planets (mass < 3 Earth masses)
    candidateTypes = types.filter((t: any) => t.massRange[1] <= 3);
  } else if (position < 0.6) {
    // Middle system: medium planets (mass 2-20 Earth masses)
    candidateTypes = types.filter(
      (t: any) => t.massRange[0] >= 1 && t.massRange[1] <= 25
    );
  } else if (position < 0.8) {
    // Outer system: ice giants and mini-neptunes (mass 5-60 Earth masses)
    candidateTypes = types.filter(
      (t: any) => t.massRange[0] >= 5 && t.massRange[1] <= 60
    );
  } else {
    // Far outer system: gas giants (mass > 50 Earth masses)
    candidateTypes = types.filter((t: any) => t.massRange[0] >= 50);
  }

  // Use weighted random selection based on the 'weight' property
  const totalWeight = candidateTypes.reduce(
    (sum: number, t: any) => sum + t.weight,
    0
  );
  let randomValue = rng.next() * totalWeight;

  planetType = candidateTypes[0]; // fallback
  for (const candidate of candidateTypes) {
    randomValue -= candidate.weight;
    if (randomValue <= 0) {
      planetType = candidate;
      break;
    }
  }

  // Debug logging
  console.log(
    `Generating planet type: ${planetType.name}, surfaceType: ${planetType.surfaceType}, atmosphereChance: ${planetType.atmosphereChance}`
  );

  const mass =
    rng.nextFloat(planetType.massRange[0], planetType.massRange[1]) *
    EARTH_MASS;
  const radius =
    rng.nextFloat(planetType.radiusRange[0], planetType.radiusRange[1]) *
    EARTH_RADIUS;

  // Orbital elements with some randomness
  // Use Titius-Bode-like law with randomness for orbital distances
  const baseDistance = 0.4 * Math.pow(1.6, index) * ASTRONOMICAL_UNIT;
  const semiMajorAxis = baseDistance * rng.nextFloat(0.8, 1.2);

  // Calculate orbital period for debugging (Kepler's Third Law: T = 2π√(a³/GM))
  const orbitalPeriod =
    2 *
    Math.PI *
    Math.sqrt(Math.pow(semiMajorAxis, 3) / (GRAVITATIONAL_CONSTANT * starMass));
  const orbitalPeriodDays = orbitalPeriod / 86400;
  console.log(
    `Planet ${index}: Distance ${(semiMajorAxis / ASTRONOMICAL_UNIT).toFixed(
      2
    )} AU, Period ${orbitalPeriodDays.toFixed(1)} days`
  );

  const eccentricity = rng.nextFloat(0.0, 0.2); // Most orbits are nearly circular
  const inclination = rng.nextGaussian(0, 0.05); // Small inclinations (in radians)
  const longitudeOfAscendingNode = rng.nextFloat(0, 2 * Math.PI);
  const argumentOfPeriapsis = rng.nextFloat(0, 2 * Math.PI);
  const meanAnomalyAtEpoch = rng.nextFloat(0, 2 * Math.PI);

  const orbitalElements: OrbitalElements = {
    semiMajorAxis,
    eccentricity: Math.abs(eccentricity),
    inclination: Math.abs(inclination),
    longitudeOfAscendingNode,
    argumentOfPeriapsis,
    meanAnomalyAtEpoch,
    epoch: 0,
  };

  // Determine if planet has atmosphere
  const hasAtmosphere = rng.next() < planetType.atmosphereChance;

  // Generate cloud coverage for planets with atmosphere (0.3 to 0.9)
  const cloudCoverage = hasAtmosphere ? rng.nextFloat(0.3, 0.9) : undefined;

  // Generate procedural name
  const planetName = generatePlanetName(rng);

  return {
    id: uuidv4(),
    name: planetName,
    type: "planet",
    mass,
    radius,
    parentId: "", // Will be set to star ID
    orbitalElements,
    color: planetType.color,
    hasAtmosphere,
    cloudCoverage,
    surfaceType: planetType.surfaceType,
    planetType: planetType.name,
  };
}

function generateAsteroid(
  rng: SeededRandom,
  starId: string,
  beltId: string,
  beltInnerRadius: number,
  beltOuterRadius: number,
  beltInclination: number,
  index: number
): CelestialBodyType {
  // Generate orbital position within belt
  const semiMajorAxis = rng.nextFloat(beltInnerRadius, beltOuterRadius);

  // Low eccentricity but some variation (0 to 0.3)
  const eccentricity = rng.nextFloat(0.0, 0.3);

  // Small inclination variation around belt plane (±5 degrees)
  const inclinationVariation = rng.nextGaussian(0, 0.087); // ~5 degrees in radians
  const inclination = beltInclination + inclinationVariation;

  const longitudeOfAscendingNode = rng.nextFloat(0, 2 * Math.PI);
  const argumentOfPeriapsis = rng.nextFloat(0, 2 * Math.PI);
  const meanAnomalyAtEpoch = rng.nextFloat(0, 2 * Math.PI);

  const orbitalElements: OrbitalElements = {
    semiMajorAxis,
    eccentricity: Math.abs(eccentricity),
    inclination: Math.abs(inclination),
    longitudeOfAscendingNode,
    argumentOfPeriapsis,
    meanAnomalyAtEpoch,
    epoch: 0,
  };

  // Asteroid properties
  const shapes = ["spherical", "elliptical", "rugged"] as const;
  const shape = shapes[rng.nextInt(0, shapes.length - 1)];

  const compositions = ["water", "metal", "silica"] as const;
  const composition = compositions[rng.nextInt(0, compositions.length - 1)];

  // Asteroid size: 10m to 500m radius
  const radius = rng.nextFloat(10, 500);

  // Mass depends on composition
  // Assume density: water ~1000 kg/m³, silica ~2500 kg/m³, metal ~7000 kg/m³
  const densities = { water: 1000, metal: 7000, silica: 2500 };
  const density = densities[composition];
  const volume = (4 / 3) * Math.PI * Math.pow(radius, 3);
  const mass = volume * density;

  // All asteroids rotate extremely slowly for visual interest (very calm, subtle)
  // Rotation rate between 0.00005 and 0.0005 radians/second (almost imperceptible tumbling)
  const rotationRate = rng.nextFloat(0.00005, 0.0005);

  // Color based on composition
  const colors = {
    water: "#c8e6f5", // light blue
    metal: "#b0b0b0", // metallic gray
    silica: "#8b7355", // brownish
  };

  return {
    id: uuidv4(),
    name: `Asteroid ${index + 1}`,
    type: "asteroid",
    mass,
    radius,
    parentId: starId,
    orbitalElements,
    asteroidBeltId: beltId,
    composition,
    shape,
    rotationRate,
    color: colors[composition],
  };
}

function generateAsteroidBelt(
  rng: SeededRandom,
  starId: string,
  beltIndex: number,
  innerRadius: number,
  outerRadius: number
): AsteroidBelt {
  const beltId = uuidv4();

  // Generate belt name based on position
  const beltNames = [
    "Inner Asteroid Belt",
    "Main Asteroid Belt",
    "Outer Asteroid Belt",
    "Far Asteroid Belt",
  ];
  const name = beltNames[Math.min(beltIndex, beltNames.length - 1)];

  // Belt inclination (typically small)
  const inclination = rng.nextGaussian(0, 0.05); // ~3 degrees

  // Number of asteroids in belt (50 to 200)
  const asteroidCount = rng.nextInt(50, 200);

  // Generate asteroids
  const asteroids: CelestialBodyType[] = [];
  for (let i = 0; i < asteroidCount; i++) {
    const asteroid = generateAsteroid(
      rng,
      starId,
      beltId,
      innerRadius,
      outerRadius,
      Math.abs(inclination),
      i
    );
    asteroids.push(asteroid);
  }

  return {
    id: beltId,
    name,
    parentId: starId,
    innerRadius,
    outerRadius,
    inclination: Math.abs(inclination),
    asteroidCount,
    asteroids,
  };
}

export function generateStarSystem(seed: number): {
  star: CelestialBodyType;
  planets: CelestialBodyType[];
  asteroidBelts: AsteroidBelt[];
} {
  const rng = new SeededRandom(seed);

  const star = generateStar(rng);
  const numPlanets = rng.nextInt(MIN_PLANETS, MAX_PLANETS);

  const planets: CelestialBodyType[] = [];
  for (let i = 0; i < numPlanets; i++) {
    const planet = generatePlanet(rng, star.mass, i, numPlanets);
    planet.parentId = star.id;
    planets.push(planet);
  }

  // Sort planets by semi-major axis
  planets.sort((a, b) => {
    const aAxis = a.orbitalElements?.semiMajorAxis || 0;
    const bAxis = b.orbitalElements?.semiMajorAxis || 0;
    return aAxis - bAxis;
  });

  // Generate asteroid belts (0 to 2 belts)
  const asteroidBelts: AsteroidBelt[] = [];
  const numBelts = rng.nextInt(0, 2);

  for (let i = 0; i < numBelts; i++) {
    // Find a gap between planets or after the last planet
    let innerRadius: number;
    let outerRadius: number;

    if (planets.length === 0) {
      // No planets, place belt in middle zone
      innerRadius = 1.5 * ASTRONOMICAL_UNIT;
      outerRadius = 3.0 * ASTRONOMICAL_UNIT;
    } else if (i === 0 && planets.length > 2) {
      // First belt: between inner and middle planets (Mars-Jupiter equivalent)
      const innerPlanetAxis =
        planets[Math.floor(planets.length * 0.3)].orbitalElements!
          .semiMajorAxis;
      const outerPlanetAxis =
        planets[Math.floor(planets.length * 0.5)].orbitalElements!
          .semiMajorAxis;

      const midpoint = (innerPlanetAxis + outerPlanetAxis) / 2;
      const width = (outerPlanetAxis - innerPlanetAxis) * 0.4;

      innerRadius = midpoint - width / 2;
      outerRadius = midpoint + width / 2;
    } else {
      // Outer belt: beyond outer planets (Kuiper belt equivalent)
      const lastPlanetAxis =
        planets[planets.length - 1].orbitalElements!.semiMajorAxis;
      innerRadius = lastPlanetAxis * 1.5;
      outerRadius = lastPlanetAxis * 2.5;
    }

    const belt = generateAsteroidBelt(
      rng,
      star.id,
      i,
      innerRadius,
      outerRadius
    );
    asteroidBelts.push(belt);
  }

  return { star, planets, asteroidBelts };
}
