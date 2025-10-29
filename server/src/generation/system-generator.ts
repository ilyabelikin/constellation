import { v4 as uuidv4 } from "uuid";
import { SeededRandom } from "./random.js";
import {
  generatePlanetName,
  generateStarName,
  generateMoonName,
  generateAsteroidName,
} from "./name-generator.js";
import {
  CelestialBodyType,
  OrbitalElements,
  AsteroidBelt,
  PlanetaryRing,
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
  LifeLevel,
  LifeLevelType,
  CivilizationLevel,
  CivilizationLevelType,
} from "@constellation/shared";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Load planet types and star types configuration
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const planetTypesConfig = JSON.parse(
  readFileSync(join(__dirname, "planet-types.json"), "utf-8")
);
const starTypesConfig = JSON.parse(
  readFileSync(join(__dirname, "star-types.json"), "utf-8")
);

export function generateStar(rng: SeededRandom): CelestialBodyType {
  // Load star types from configuration
  const types = starTypesConfig.starTypes;

  // Use weighted random selection based on the 'weight' property
  const totalWeight = types.reduce((sum: number, t: any) => sum + t.weight, 0);
  let randomValue = rng.next() * totalWeight;

  let starType = types[0]; // fallback
  for (const candidate of types) {
    randomValue -= candidate.weight;
    if (randomValue <= 0) {
      starType = candidate;
      break;
    }
  }

  // Generate mass and radius within the star type's ranges
  const massMultiplier = rng.nextFloat(
    starType.massRange[0],
    starType.massRange[1]
  );
  const radiusMultiplier = rng.nextFloat(
    starType.radiusRange[0],
    starType.radiusRange[1]
  );

  console.log(`Generating star: ${starType.name} (${starType.spectralClass})`);

  return {
    id: uuidv4(),
    name: generateStarName(rng, starType.spectralClass),
    type: "star",
    mass: massMultiplier * SOLAR_MASS,
    radius: radiusMultiplier * SOLAR_RADIUS,
    parentId: null,
    orbitalElements: null,
    color: starType.color,
    starType: starType.name,
    luminosity: starType.luminosityFactor,
  };
}

/**
 * Generates a ring system for a gas giant
 * Creates multiple ring bands with varying colors and opacity
 */
function generateRings(
  rng: SeededRandom,
  planetRadius: number,
  planetColor: string
): PlanetaryRing[] {
  const rings: PlanetaryRing[] = [];

  // Decide on ring complexity: 2-7 ring bands (including thin rings)
  const numBands = Math.floor(rng.nextFloat(2, 7.5));

  // Ring starts at 1.5-2.5x planet radius
  const ringStartMultiplier = rng.nextFloat(1.5, 2.5);
  const innerRadius = planetRadius * ringStartMultiplier;

  // Ring extends to 2.5-4.5x planet radius
  const ringEndMultiplier = rng.nextFloat(2.5, 4.5);
  const outerRadius = planetRadius * ringEndMultiplier;

  // Ring inclination (tilt relative to orbital plane)
  // 70% chance: nearly aligned (0-10 degrees)
  // 30% chance: tilted (10-30 degrees)
  const inclinationChance = rng.next();
  const inclination =
    inclinationChance < 0.7
      ? rng.nextFloat(0, 0.175) // 0-10 degrees
      : rng.nextFloat(0.175, 0.524); // 10-30 degrees

  // Parse planet color to create ring variations
  const baseColor = parseInt(planetColor.replace("#", ""), 16);
  const r = (baseColor >> 16) & 0xff;
  const g = (baseColor >> 8) & 0xff;
  const b = baseColor & 0xff;

  // Create ring bands with varying shades and widths
  const bandWidth = (outerRadius - innerRadius) / numBands;

  for (let i = 0; i < numBands; i++) {
    const bandInnerRadius = innerRadius + i * bandWidth;
    let bandOuterRadius = innerRadius + (i + 1) * bandWidth;

    // 30% chance for this to be a very thin ring
    const isThinRing = rng.next() < 0.3;
    if (isThinRing) {
      // Make it very thin (5-15% of normal width)
      const thinFactor = rng.nextFloat(0.05, 0.15);
      bandOuterRadius = bandInnerRadius + bandWidth * thinFactor;
    }

    // Add gaps between bands (larger gaps for regular rings, smaller for thin rings)
    const gapSize = isThinRing ? bandWidth * 0.05 : bandWidth * 0.1;
    const adjustedInnerRadius =
      i > 0 ? bandInnerRadius + gapSize / 2 : bandInnerRadius;
    const adjustedOuterRadius =
      i < numBands - 1 ? bandOuterRadius - gapSize / 2 : bandOuterRadius;

    // Vary shade for each band (darker to lighter or vice versa)
    const shadeFactor = rng.nextFloat(0.6, 1.2);
    const bandR = Math.min(255, Math.floor(r * shadeFactor));
    const bandG = Math.min(255, Math.floor(g * shadeFactor));
    const bandB = Math.min(255, Math.floor(b * shadeFactor));

    const bandColor = `#${((1 << 24) + (bandR << 16) + (bandG << 8) + bandB)
      .toString(16)
      .slice(1)}`;

    // Vary opacity: thin rings are more translucent (0.2-0.4), regular rings (0.3-0.7)
    const opacity = isThinRing
      ? rng.nextFloat(0.2, 0.4)
      : rng.nextFloat(0.3, 0.7);

    rings.push({
      innerRadius: adjustedInnerRadius,
      outerRadius: adjustedOuterRadius,
      color: bandColor,
      opacity,
      inclination, // All bands share same inclination
    });
  }

  return rings;
}

/**
 * Calculate habitability score (0-1) based on distance from star and star properties
 * This is a game-friendly calculation that works with the current Titius-Bode-like distances
 * Rather than using strict astronomical habitable zones, we create zones that work well visually
 */
function calculateHabitabilityFromDistance(
  distanceAU: number,
  starMass: number,
  starLuminosity: number
): number {
  // Star luminosity affects habitable zone
  // Higher luminosity = wider and farther habitable zone
  // For reference: Sun luminosity = 1.0
  const luminosityFactor = Math.sqrt(starLuminosity);

  // Game-friendly habitable zone (adjusted for visual gameplay)
  // Inner edge: 0.5 AU for sun-like star (closer than realistic for gameplay)
  // Outer edge: 3.0 AU for sun-like star (farther than realistic for gameplay)
  const innerEdge = 0.5 * luminosityFactor;
  const outerEdge = 3.0 * luminosityFactor;
  const optimalDistance = (innerEdge + outerEdge) / 2;

  // Calculate how far from optimal distance (normalized)
  const distanceFromOptimal = Math.abs(distanceAU - optimalDistance);
  const zoneWidth = (outerEdge - innerEdge) / 2;

  // Score based on distance from optimal
  // Inside zone: high score (0.6-1.0)
  // Outside zone: decreasing score (0.0-0.6)
  let distanceScore: number;

  if (distanceAU >= innerEdge && distanceAU <= outerEdge) {
    // Inside habitable zone - score from 0.6 to 1.0
    // Best at optimal distance (1.0), drops to 0.6 at edges
    distanceScore = 1.0 - (distanceFromOptimal / zoneWidth) * 0.4;
  } else if (distanceAU < innerEdge) {
    // Too close - score drops rapidly
    const distanceInside = innerEdge - distanceAU;
    distanceScore = Math.max(0, 0.6 - (distanceInside / innerEdge) * 0.6);
  } else {
    // Too far - score drops gradually
    const distanceOutside = distanceAU - outerEdge;
    distanceScore = Math.max(0, 0.6 - (distanceOutside / outerEdge) * 0.4);
  }

  return Math.max(0, Math.min(1, distanceScore));
}

/**
 * Determine life level based on habitability and random chance
 */
function determineLifeLevel(
  rng: SeededRandom,
  habitability: number,
  lifeChance: number
): LifeLevelType {
  // First check if life exists at all
  // habitability acts as a multiplier on base life chance
  const finalLifeChance = lifeChance * habitability;

  if (rng.next() >= finalLifeChance) {
    return LifeLevel.NONE;
  }

  // Life exists! Now determine its development level
  // Higher habitability = higher chance of advanced life
  const developmentRoll = rng.next();

  // Weighted probabilities based on habitability
  if (habitability < 0.3) {
    // Low habitability: mostly microbial
    if (developmentRoll < 0.9) return LifeLevel.MICROBIAL;
    return LifeLevel.SIMPLE;
  } else if (habitability < 0.5) {
    // Medium-low habitability: microbial to simple
    if (developmentRoll < 0.7) return LifeLevel.MICROBIAL;
    if (developmentRoll < 0.95) return LifeLevel.SIMPLE;
    return LifeLevel.COMPLEX;
  } else if (habitability < 0.7) {
    // Medium-high habitability: simple to complex
    if (developmentRoll < 0.4) return LifeLevel.MICROBIAL;
    if (developmentRoll < 0.75) return LifeLevel.SIMPLE;
    if (developmentRoll < 0.98) return LifeLevel.COMPLEX;
    return LifeLevel.INTELLIGENT;
  } else {
    // High habitability: complex life possible, rare intelligence
    if (developmentRoll < 0.2) return LifeLevel.MICROBIAL;
    if (developmentRoll < 0.5) return LifeLevel.SIMPLE;
    if (developmentRoll < 0.95) return LifeLevel.COMPLEX;
    return LifeLevel.INTELLIGENT;
  }
}

/**
 * Determine civilization level for intelligent life
 * Higher habitability = better chance of advanced civilization
 */
function determineCivilizationLevel(
  rng: SeededRandom,
  habitability: number
): CivilizationLevelType {
  const civilizationRoll = rng.next();

  // Habitability affects civilization development
  // Better conditions = more likely to advance
  if (habitability < 0.5) {
    // Harsh conditions: mostly primitive
    if (civilizationRoll < 0.7) return CivilizationLevel.PRIMITIVE;
    if (civilizationRoll < 0.9) return CivilizationLevel.AGRICULTURAL;
    if (civilizationRoll < 0.97) return CivilizationLevel.INDUSTRIAL;
    return CivilizationLevel.ATOMIC;
  } else if (habitability < 0.7) {
    // Moderate conditions: agricultural to atomic
    if (civilizationRoll < 0.3) return CivilizationLevel.PRIMITIVE;
    if (civilizationRoll < 0.6) return CivilizationLevel.AGRICULTURAL;
    if (civilizationRoll < 0.8) return CivilizationLevel.INDUSTRIAL;
    if (civilizationRoll < 0.95) return CivilizationLevel.ATOMIC;
    return CivilizationLevel.INFORMATION;
  } else if (habitability < 0.85) {
    // Good conditions: industrial to spacefaring
    if (civilizationRoll < 0.15) return CivilizationLevel.PRIMITIVE;
    if (civilizationRoll < 0.35) return CivilizationLevel.AGRICULTURAL;
    if (civilizationRoll < 0.55) return CivilizationLevel.INDUSTRIAL;
    if (civilizationRoll < 0.75) return CivilizationLevel.ATOMIC;
    if (civilizationRoll < 0.92) return CivilizationLevel.INFORMATION;
    return CivilizationLevel.SPACEFARING;
  } else {
    // Excellent conditions: full range, higher chance of advanced
    if (civilizationRoll < 0.1) return CivilizationLevel.PRIMITIVE;
    if (civilizationRoll < 0.2) return CivilizationLevel.AGRICULTURAL;
    if (civilizationRoll < 0.35) return CivilizationLevel.INDUSTRIAL;
    if (civilizationRoll < 0.55) return CivilizationLevel.ATOMIC;
    if (civilizationRoll < 0.75) return CivilizationLevel.INFORMATION;
    if (civilizationRoll < 0.95) return CivilizationLevel.SPACEFARING;
    return CivilizationLevel.INTERSTELLAR;
  }
}

export function generatePlanet(
  rng: SeededRandom,
  starMass: number,
  starLuminosity: number,
  index: number,
  totalPlanets: number,
  galaxyId: string
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

  // Generate procedural name (galaxyId will be passed from caller)
  const planetName = generatePlanetName(rng, galaxyId);

  // Calculate habitability based on distance from star, planet type, and atmosphere
  const distanceAU = semiMajorAxis / ASTRONOMICAL_UNIT;
  const distanceHabitability = calculateHabitabilityFromDistance(
    distanceAU,
    starMass,
    starLuminosity
  );

  // Combine distance habitability with planet type's base habitability
  // For very dim stars (brown dwarfs), distance matters much more
  // For bright stars, planet type matters more
  let distanceWeight = 0.6;
  let planetTypeWeight = 0.4;

  // Adjust weights based on star luminosity
  // Very dim stars (< 0.01 luminosity): distance is critical (90% weight)
  // Dim stars (0.01 - 0.1): distance is very important (75% weight)
  // Normal stars (> 0.1): balanced (60% weight)
  if (starLuminosity < 0.01) {
    distanceWeight = 0.9;
    planetTypeWeight = 0.1;
  } else if (starLuminosity < 0.1) {
    distanceWeight = 0.75;
    planetTypeWeight = 0.25;
  }

  let finalHabitability =
    distanceHabitability * distanceWeight +
    planetType.baseHabitability * planetTypeWeight;

  // Atmosphere bonus: planets with atmosphere get +20% habitability (up to max 1.0)
  if (hasAtmosphere) {
    finalHabitability = Math.min(1.0, finalHabitability * 1.2);
  } else {
    // No atmosphere penalty: reduce by 50%
    finalHabitability *= 0.5;
  }

  // Clamp to 0-1 range
  finalHabitability = Math.max(0, Math.min(1, finalHabitability));

  // Determine life level
  const lifeLevel = determineLifeLevel(
    rng,
    finalHabitability,
    planetType.lifeChance
  );

  // Determine civilization level if intelligent life exists
  let civilizationLevel: CivilizationLevelType | undefined = undefined;
  if (lifeLevel === LifeLevel.INTELLIGENT) {
    civilizationLevel = determineCivilizationLevel(rng, finalHabitability);
  }

  console.log(
    `Planet ${planetName}: Distance ${distanceAU.toFixed(
      2
    )} AU, Habitability ${finalHabitability.toFixed(2)}, Life: ${lifeLevel}${
      civilizationLevel ? `, Civilization: ${civilizationLevel}` : ""
    }`
  );

  const planet: CelestialBodyType = {
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
    habitability: finalHabitability,
    lifeLevel: lifeLevel,
    civilizationLevel: civilizationLevel,
    moons: [], // Will be populated later
  };

  // Generate rings for some gas giants
  // Gas giants: mass > 15 Earth masses
  const massInEarthMasses = mass / EARTH_MASS;
  if (massInEarthMasses > 15) {
    const ringChance = rng.next();
    // 40% chance for rings
    if (ringChance < 0.4) {
      planet.rings = generateRings(rng, radius, planetType.color);
    }
  }

  return planet;
}

function generateMoon(
  rng: SeededRandom,
  planetId: string,
  planetMass: number,
  planetRadius: number,
  index: number,
  totalMoons: number,
  galaxyId: string,
  isSuperMoon: boolean = false,
  planetRings?: PlanetaryRing[]
): CelestialBodyType {
  // Generate unique moon name
  const name = generateMoonName(rng, galaxyId);

  const massRatio = planetMass / EARTH_MASS;

  let radius: number;

  if (isSuperMoon) {
    // Super moon: like Earth's Moon (about 27% of Earth's radius)
    // Now that moons are farther away, we can make super moons more impressive
    radius = planetRadius * rng.nextFloat(0.15, 0.28);
  } else {
    // Regular moons: size depends on planet type and moon count
    let minRadius: number;
    let maxRadius: number;

    if (massRatio > 50) {
      // Gas giants: larger, more substantial moons (like Ganymede, Titan, Io, Europa)
      // With many moons, create size variety
      if (totalMoons > 3) {
        minRadius = 400_000; // 400 km
        maxRadius = 2_600_000; // 2600 km (Ganymede-sized)
      } else {
        // Few moons on gas giant: make them medium-large
        minRadius = 800_000; // 800 km
        maxRadius = 2_200_000; // 2200 km
      }
    } else if (massRatio > 10) {
      // Ice giants: medium moons (like Triton, Titania)
      if (totalMoons > 2) {
        minRadius = 300_000; // 300 km
        maxRadius = 1_400_000; // 1400 km
      } else {
        minRadius = 500_000; // 500 km
        maxRadius = 1_200_000; // 1200 km
      }
    } else if (massRatio > 2) {
      // Large terrestrial: small to medium moons
      if (totalMoons > 2) {
        minRadius = 200_000; // 200 km
        maxRadius = 800_000; // 800 km
      } else {
        minRadius = 300_000; // 300 km
        maxRadius = 600_000; // 600 km
      }
    } else {
      // Earth-sized: small moons (unless it's the super moon)
      if (totalMoons > 1) {
        minRadius = 150_000; // 150 km
        maxRadius = 500_000; // 500 km
      } else {
        // Single small moon
        minRadius = 200_000; // 200 km
        maxRadius = 400_000; // 400 km
      }
    }

    radius = rng.nextFloat(minRadius, maxRadius);
  }

  // Moon mass based on rocky composition (density ~3000 kg/m³)
  const density = 3000;
  const volume = (4 / 3) * Math.PI * Math.pow(radius, 3);
  const mass = volume * density;

  // Orbital distance: Account for visual scaling in rendering
  // Planets are rendered 50x larger for visibility, so moons need to orbit farther out
  const visualScaleFactor = 40; // BODY_SIZE_MULTIPLIER from client

  // Calculate the visual radius of the planet (real radius * visual scale)
  const visualPlanetRadius = planetRadius * visualScaleFactor;

  // Ensure moon never orbits inside the visual planet radius
  // Add safety margin of 20% beyond visual radius
  const safeMinDistance = visualPlanetRadius * 1.2;

  // Orbital ranges - moons need good clearance from visually scaled planets
  // Inner moons orbit faster (like Phobos at 2.76 Mars radii = 7.65 hours)
  // Outer moons still visible but slower (like our Moon at 60 Earth radii = 27 days)
  const standardMinDistance = planetRadius * 120; // Doubled for more clearance
  const standardMaxDistance = planetRadius * 400; // Doubled for more spread

  // Use whichever is larger to guarantee safety
  const minDistance = Math.max(safeMinDistance, standardMinDistance);
  const maxDistance = Math.max(minDistance * 1.5, standardMaxDistance); // Ensure max > min

  // Calculate spacing to prevent moon collisions
  // Each moon needs its own "slot" in the orbital range
  // Add buffer zones between moons (at least 30% of the range between slots)
  const totalSlots = Math.max(totalMoons, 1);
  const distanceRange = maxDistance - minDistance;
  const slotSize = distanceRange / totalSlots;
  const bufferSize = slotSize * 0.3; // 30% buffer between moons
  const usableSlotSize = slotSize - bufferSize;

  // Assign this moon to its slot with small random variation within the slot
  const slotStart = minDistance + index * slotSize + bufferSize / 2;
  const semiMajorAxis = slotStart + rng.nextFloat(0, usableSlotSize);

  // Final safety check: ensure semiMajorAxis is never less than safe minimum
  const finalSemiMajorAxis = Math.max(semiMajorAxis, safeMinDistance);

  // Eccentricity: mostly circular orbits but some variation
  const eccentricity = rng.nextFloat(0.0, 0.15);

  // Inclination: varied orbital planes for visual interest
  // Special case: if planet has rings, some moons may align with ring plane
  let inclination: number;

  if (planetRings && planetRings.length > 0 && rng.next() < 0.4) {
    // 40% chance for moons to orbit in ring plane if planet has rings
    const ringInclination = planetRings[0].inclination;
    inclination = ringInclination + rng.nextGaussian(0, 0.035); // Near ring plane ±2 degrees
    console.log(
      `Moon ${name} aligned with ring plane (inclination: ${(
        (inclination * 180) /
        Math.PI
      ).toFixed(1)}°)`
    );
  } else {
    // Normal moon inclination distribution
    // 60% low inclination, 25% moderate inclination, 15% extreme/polar inclination
    const inclinationRoll = rng.next();

    if (inclinationRoll < 0.6) {
      // Most moons: low inclination (within 10 degrees of planet's orbital plane)
      inclination = rng.nextGaussian(0, 0.087); // ~5 degrees std dev
    } else if (inclinationRoll < 0.85) {
      // Some moons: moderate inclination (10-45 degrees) - like Earth's Moon
      inclination = rng.nextFloat(0.175, 0.785); // 10-45 degrees in radians
    } else {
      // Rare moons: extreme/polar inclination (45-85 degrees) - dramatic angles
      // These orbit at steep angles to the system plane
      inclination = rng.nextFloat(0.785, 1.484); // 45-85 degrees in radians
    }
  }

  const longitudeOfAscendingNode = rng.nextFloat(0, 2 * Math.PI);
  const argumentOfPeriapsis = rng.nextFloat(0, 2 * Math.PI);
  const meanAnomalyAtEpoch = rng.nextFloat(0, 2 * Math.PI);

  const orbitalElements: OrbitalElements = {
    semiMajorAxis: finalSemiMajorAxis,
    eccentricity: Math.abs(eccentricity),
    inclination: Math.abs(inclination),
    longitudeOfAscendingNode,
    argumentOfPeriapsis,
    meanAnomalyAtEpoch,
    epoch: 0,
  };

  // Moon shape variety (similar to asteroids but less extreme)
  // Larger moons are more spherical, smaller ones more irregular
  const shapes = ["spherical", "elliptical", "rugged"] as const;
  let shape: (typeof shapes)[number];

  if (radius > 1_000_000) {
    // Large moons (>1000km) are mostly spherical
    shape = rng.next() < 0.8 ? "spherical" : "elliptical";
  } else if (radius > 500_000) {
    // Medium moons: mix of shapes
    const rand = rng.next();
    if (rand < 0.4) shape = "spherical";
    else if (rand < 0.7) shape = "elliptical";
    else shape = "rugged";
  } else {
    // Small moons: more irregular
    const rand = rng.next();
    if (rand < 0.2) shape = "spherical";
    else if (rand < 0.5) shape = "elliptical";
    else shape = "rugged";
  }

  // Composition
  const compositions = ["water", "silica", "metal"] as const;
  const compositionWeights = [0.3, 0.6, 0.1]; // Most are rocky (silica)
  let totalWeight = rng.next();
  let composition: (typeof compositions)[number] = "silica";

  for (let i = 0; i < compositions.length; i++) {
    totalWeight -= compositionWeights[i];
    if (totalWeight <= 0) {
      composition = compositions[i];
      break;
    }
  }

  // Rotation: Most moons rotate stably on a single axis
  // Only small, irregular moons have chaotic tumbling
  const rotationRate = rng.nextFloat(0.0001, 0.001);

  // Determine rotation stability (95% stable, 5% tumbling)
  const isStableRotation = rng.next() > 0.05;

  // Small irregular moons are more likely to tumble
  const isTumbling =
    !isStableRotation ||
    (radius < 300_000 && shape === "rugged" && rng.next() < 0.15);

  // Color based on composition
  const colors = {
    water: "#d4e8f0", // icy white-blue
    metal: "#a0a0a0", // gray
    silica: "#8b7355", // rocky brown
  };

  return {
    id: uuidv4(),
    name,
    type: "moon",
    mass,
    radius,
    parentId: planetId,
    orbitalElements,
    composition,
    shape,
    rotationRate,
    isTumbling, // New property to indicate chaotic rotation
    color: colors[composition],
  };
}

function generateAsteroid(
  rng: SeededRandom,
  starId: string,
  beltId: string,
  beltName: string,
  beltInnerRadius: number,
  beltOuterRadius: number,
  beltInclination: number,
  index: number,
  galaxyId: string
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
    name: generateAsteroidName(rng, galaxyId, beltName, index),
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
  outerRadius: number,
  galaxyId: string
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
      name,
      innerRadius,
      outerRadius,
      Math.abs(inclination),
      i,
      galaxyId
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

export function generateStarSystem(
  seed: number,
  galaxyId: string
): {
  star: CelestialBodyType;
  planets: CelestialBodyType[];
  moons: CelestialBodyType[];
  asteroidBelts: AsteroidBelt[];
} {
  const rng = new SeededRandom(seed);

  const star = generateStar(rng);
  const numPlanets = rng.nextInt(MIN_PLANETS, MAX_PLANETS);

  const planets: CelestialBodyType[] = [];
  for (let i = 0; i < numPlanets; i++) {
    const planet = generatePlanet(
      rng,
      star.mass,
      star.luminosity || 1.0,
      i,
      numPlanets,
      galaxyId
    );
    planet.parentId = star.id;
    planets.push(planet);
  }

  // Sort planets by semi-major axis
  planets.sort((a, b) => {
    const aAxis = a.orbitalElements?.semiMajorAxis || 0;
    const bAxis = b.orbitalElements?.semiMajorAxis || 0;
    return aAxis - bAxis;
  });

  // Generate moons for some planets
  // Larger planets are more likely to have moons
  // About 50% of planets get moons
  const allMoons: CelestialBodyType[] = [];
  for (const planet of planets) {
    const planetMassRatio = planet.mass / EARTH_MASS;

    // Probability of having moons increases with planet mass
    let moonChance = 0.3; // Base 30% chance
    if (planetMassRatio > 10)
      moonChance = 0.9; // Gas giants almost always have moons
    else if (planetMassRatio > 2)
      moonChance = 0.7; // Large planets often have moons
    else if (planetMassRatio > 0.5) moonChance = 0.5; // Earth-like planets sometimes have moons

    if (rng.next() < moonChance) {
      // Determine number of moons (1-5, with larger planets having more)
      let numMoons: number;
      if (planetMassRatio > 50) {
        numMoons = rng.nextInt(3, 6); // Jupiter-sized: 3-6 moons
      } else if (planetMassRatio > 10) {
        numMoons = rng.nextInt(2, 4); // Neptune-sized: 2-4 moons
      } else if (planetMassRatio > 2) {
        numMoons = rng.nextInt(1, 3); // Large terrestrial: 1-3 moons
      } else {
        numMoons = rng.nextInt(1, 2); // Earth-sized: 1-2 moons
      }

      // Chance for a "super moon" (like Earth's Moon) - only for smaller planets with few moons
      const canHaveSuperMoon = planetMassRatio < 5 && numMoons <= 2;
      const hasSuperMoon = canHaveSuperMoon && rng.next() < 0.3; // 30% chance
      const superMoonIndex = hasSuperMoon ? rng.nextInt(0, numMoons - 1) : -1;

      // Generate moons for this planet
      for (let i = 0; i < numMoons; i++) {
        const isSuperMoon = i === superMoonIndex;
        const moon = generateMoon(
          rng,
          planet.id,
          planet.mass,
          planet.radius,
          i,
          numMoons,
          galaxyId,
          isSuperMoon,
          planet.rings // Pass ring information for potential alignment
        );
        planet.moons!.push(moon);
        allMoons.push(moon);
      }

      console.log(`Planet ${planet.name}: Generated ${numMoons} moon(s)`);
    }
  }

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
      outerRadius,
      galaxyId
    );
    asteroidBelts.push(belt);
  }

  return { star, planets, moons: allMoons, asteroidBelts };
}
