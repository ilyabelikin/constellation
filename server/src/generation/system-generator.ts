import { v4 as uuidv4 } from "uuid";
import { SeededRandom } from "./random.js";
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
    name: `${starClass.type}-class Star`,
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
  // Planetary types
  const types = [
    {
      name: "Rocky",
      massRange: [0.1, 3],
      radiusRange: [0.5, 1.5],
      color: "#8b7355",
    },
    {
      name: "Super-Earth",
      massRange: [2, 10],
      radiusRange: [1.3, 2.5],
      color: "#a0937d",
    },
    {
      name: "Gas Giant",
      massRange: [50, 400],
      radiusRange: [3, 12],
      color: "#d4a373",
    },
    {
      name: "Ice Giant",
      massRange: [10, 50],
      radiusRange: [2.5, 5],
      color: "#74b9d8",
    },
  ];

  // Inner planets tend to be rocky, outer planets tend to be gas giants
  let planetType;
  if (index < totalPlanets / 2) {
    planetType = rng.next() < 0.7 ? types[0] : types[1]; // Rocky or Super-Earth
  } else {
    planetType = rng.next() < 0.5 ? types[2] : types[3]; // Gas Giant or Ice Giant
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

  return {
    id: uuidv4(),
    name: `${planetType.name} Planet ${index + 1}`,
    type: "planet",
    mass,
    radius,
    parentId: "", // Will be set to star ID
    orbitalElements,
    color: planetType.color,
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
