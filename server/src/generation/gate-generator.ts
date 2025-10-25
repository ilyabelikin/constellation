import { v4 as uuidv4 } from "uuid";
import {
  StarGate,
  OrbitalElements,
  SOLAR_MASS,
  ASTRONOMICAL_UNIT,
} from "@constellation/shared";
import { SeededRandom } from "./random.js";
import { generatePlanetName } from "./name-generator.js";

const GREEK_LETTERS = [
  "Alpha",
  "Beta",
  "Gamma",
  "Delta",
  "Epsilon",
  "Zeta",
  "Eta",
  "Theta",
  "Iota",
  "Kappa",
  "Lambda",
  "Mu",
  "Nu",
  "Xi",
  "Omicron",
  "Pi",
  "Rho",
  "Sigma",
  "Tau",
  "Upsilon",
  "Phi",
  "Chi",
  "Psi",
  "Omega",
];

const GATE_SUFFIXES_FRONTIER = ["Frontier", "Outpost", "Portal", "Passage"];
const GATE_SUFFIXES_HUB = ["Nexus", "Hub", "Junction", "Crossroads"];
const GATE_SUFFIXES_NORMAL = ["Gate", "Portal", "Passage", "Transit"];

/**
 * Calculate the goldilocks (habitable) zone for a star
 * Based on stellar luminosity and temperature
 */
export function calculateGoldilocksZone(starMass: number): {
  innerRadius: number;
  outerRadius: number;
} {
  // Approximate luminosity using mass-luminosity relation: L ~ M^3.5
  const massSolar = starMass / SOLAR_MASS;
  const luminosity = Math.pow(massSolar, 3.5);

  // Habitable zone scales with sqrt of luminosity
  // For Sun: 0.95 AU to 1.37 AU
  const innerRadius = Math.sqrt(luminosity / 1.1) * ASTRONOMICAL_UNIT;
  const outerRadius = Math.sqrt(luminosity / 0.53) * ASTRONOMICAL_UNIT;

  return { innerRadius, outerRadius };
}

/**
 * Determine how many gates a system should have
 * Distribution: 1-3 gates are most common, 4-5 are rare
 */
export function determineGateCount(rng: SeededRandom): number {
  const roll = rng.next();
  if (roll < 0.3) return 1; // 30%
  if (roll < 0.6) return 2; // 30%
  if (roll < 0.85) return 3; // 25%
  if (roll < 0.95) return 4; // 10%
  return 5; // 5%
}

/**
 * Generate a simple gate designation
 * Gates will be named after their destination star once explored
 */
export function generateGateName(gateIndex: number): string {
  const greekLetter = GREEK_LETTERS[gateIndex % GREEK_LETTERS.length];
  return `${greekLetter} Gate`;
}

/**
 * Generate gate orbital position at the outskirts of the star system
 */
export function generateGatePosition(
  rng: SeededRandom,
  starMass: number,
  gateIndex: number,
  totalGates: number
): OrbitalElements {
  const goldilocksZone = calculateGoldilocksZone(starMass);

  // Place gates far out at the edge of the system
  // Distribute them in a belt from 8x to 12x the goldilocks outer radius
  // This puts them well beyond all planets (typically 10-20+ AU for Sun-like stars)
  const innerGateBelt = goldilocksZone.outerRadius * 8;
  const outerGateBelt = goldilocksZone.outerRadius * 12;
  const beltWidth = outerGateBelt - innerGateBelt;

  const relativePosition = (gateIndex + 0.5) / totalGates; // 0.5 to center in slot
  const semiMajorAxis = innerGateBelt + relativePosition * beltWidth;

  // Add some random variation
  const variation = rng.nextFloat(0.95, 1.05);
  const finalSemiMajorAxis = semiMajorAxis * variation;

  // Gates have nearly circular orbits
  const eccentricity = rng.nextFloat(0.0, 0.05);

  // Slight inclinations for visual interest
  const inclination = rng.nextGaussian(0, 0.03);

  // Random orbital angles
  const longitudeOfAscendingNode = rng.nextFloat(0, 2 * Math.PI);
  const argumentOfPeriapsis = rng.nextFloat(0, 2 * Math.PI);
  const meanAnomalyAtEpoch = rng.nextFloat(0, 2 * Math.PI);

  return {
    semiMajorAxis: finalSemiMajorAxis,
    eccentricity: Math.abs(eccentricity),
    inclination: Math.abs(inclination),
    longitudeOfAscendingNode,
    argumentOfPeriapsis,
    meanAnomalyAtEpoch,
    epoch: 0,
  };
}

/**
 * Generate gates for a star system
 */
export function generateGates(
  rng: SeededRandom,
  systemId: string,
  starMass: number,
  destinationSystemIds: string[]
): StarGate[] {
  const gates: StarGate[] = [];

  for (let i = 0; i < destinationSystemIds.length; i++) {
    const orbitalElements = generateGatePosition(
      rng,
      starMass,
      i,
      destinationSystemIds.length
    );

    // Placeholder name - will be updated when gate is explored
    const name = generateGateName(i);

    gates.push({
      id: uuidv4(),
      name,
      systemId,
      destinationSystemId: destinationSystemIds[i],
      orbitalElements,
    });
  }

  return gates;
}

/**
 * Generate gates for a starter system with placeholder destinations
 * The destination systems will be generated on-demand when player travels through gates
 */
export function generateStarterGates(
  rng: SeededRandom,
  systemId: string,
  starMass: number
): StarGate[] {
  const gateCount = determineGateCount(rng);
  const gates: StarGate[] = [];

  for (let i = 0; i < gateCount; i++) {
    const orbitalElements = generateGatePosition(rng, starMass, i, gateCount);

    // Placeholder name - will be updated when gate is explored
    const name = generateGateName(i);

    // Destination will be a placeholder - actual system generated on first travel
    gates.push({
      id: uuidv4(),
      name,
      systemId,
      destinationSystemId: `PLACEHOLDER_${i}`, // Will be replaced when gate is first used
      orbitalElements,
    });
  }

  return gates;
}
