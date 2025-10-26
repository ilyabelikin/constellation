import { v4 as uuidv4 } from "uuid";
import { SeededRandom } from "./random.js";
import { generatePlanetName, generateStarName } from "./name-generator.js";
import {
  CelestialBodyType,
  OrbitalElements,
  SOLAR_MASS,
  SOLAR_RADIUS,
  EARTH_MASS,
  EARTH_RADIUS,
  ASTRONOMICAL_UNIT,
  MIN_PLANETS,
  MAX_PLANETS,
  GRAVITATIONAL_CONSTANT,
} from "@constellation/shared";

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
  // Planetary types with varied sizes
  const types = [
    // Small terrestrial planets
    {
      name: "Barren",
      massRange: [0.05, 0.5],
      radiusRange: [0.3, 0.7],
      color: "#7a6a5a",
      atmosphereChance: 0.0,
      surfaceType: "cratered" as const,
    },
    {
      name: "Rocky",
      massRange: [0.3, 2],
      radiusRange: [0.6, 1.2],
      color: "#8b7355",
      atmosphereChance: 0.2,
      surfaceType: "cratered" as const,
    },
    {
      name: "Desert",
      massRange: [0.5, 3],
      radiusRange: [0.7, 1.3],
      color: "#d4a574",
      atmosphereChance: 0.3,
      surfaceType: "smooth" as const,
    },
    {
      name: "Ocean",
      massRange: [0.8, 4],
      radiusRange: [0.9, 1.4],
      color: "#4a90c8",
      atmosphereChance: 0.9,
      surfaceType: "smooth" as const,
    },
    {
      name: "Terrestrial",
      massRange: [0.5, 3],
      radiusRange: [0.7, 1.3],
      color: "#6b8e4e",
      atmosphereChance: 0.8,
      surfaceType: "smooth" as const,
    },
    // Medium planets
    {
      name: "Super-Earth",
      massRange: [3, 10],
      radiusRange: [1.4, 2.2],
      color: "#a0937d",
      atmosphereChance: 0.7,
      surfaceType: "smooth" as const,
    },
    {
      name: "Ice",
      massRange: [2, 8],
      radiusRange: [1.2, 2.0],
      color: "#c8e6f5",
      atmosphereChance: 0.5,
      surfaceType: "smooth" as const,
    },
    {
      name: "Lava",
      massRange: [1, 5],
      radiusRange: [0.8, 1.6],
      color: "#ff6347",
      atmosphereChance: 0.2,
      surfaceType: "volcanic" as const,
    },
    // Large ice/gas planets
    {
      name: "Mini-Neptune",
      massRange: [5, 20],
      radiusRange: [2.0, 3.5],
      color: "#7cb3d9",
      atmosphereChance: 1.0,
      surfaceType: "banded" as const,
    },
    {
      name: "Ice Giant",
      massRange: [15, 50],
      radiusRange: [3.5, 5.5],
      color: "#74b9d8",
      atmosphereChance: 1.0,
      surfaceType: "banded" as const,
    },
    // Giant planets
    {
      name: "Gas Giant",
      massRange: [80, 200],
      radiusRange: [8, 12],
      color: "#d4a373",
      atmosphereChance: 1.0,
      surfaceType: "banded" as const,
    },
    {
      name: "Jupiter-like",
      massRange: [200, 400],
      radiusRange: [10, 14],
      color: "#c9a96e",
      atmosphereChance: 1.0,
      surfaceType: "banded" as const,
    },
    {
      name: "Hot Jupiter",
      massRange: [100, 300],
      radiusRange: [9, 13],
      color: "#f5deb3",
      atmosphereChance: 1.0,
      surfaceType: "banded" as const,
    },
  ];

  // Select planet type based on position (inner vs outer system)
  let planetType;
  const position = index / totalPlanets; // 0 = innermost, 1 = outermost

  if (position < 0.3) {
    // Inner system: small terrestrial planets (0-4)
    const innerTypes = types.slice(0, 5);
    planetType = innerTypes[rng.nextInt(0, innerTypes.length - 1)];
  } else if (position < 0.6) {
    // Middle system: medium planets (5-7)
    const middleTypes = types.slice(5, 8);
    planetType = middleTypes[rng.nextInt(0, middleTypes.length - 1)];
  } else if (position < 0.8) {
    // Outer system: ice giants and mini-neptunes (8-9)
    const outerTypes = types.slice(8, 10);
    planetType = outerTypes[rng.nextInt(0, outerTypes.length - 1)];
  } else {
    // Far outer system: gas giants (10-12)
    const giantTypes = types.slice(10, 13);
    planetType = giantTypes[rng.nextInt(0, giantTypes.length - 1)];
  }

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

export function generateStarSystem(seed: number): {
  star: CelestialBodyType;
  planets: CelestialBodyType[];
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

  return { star, planets };
}
