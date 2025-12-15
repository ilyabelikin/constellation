import { v4 as uuidv4 } from "uuid";
import {
  StarGate,
  Tunnel,
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
 * Generate gate orbital position within gaps between planets
 * @param planetOrbits - Array of planet orbital distances (sorted)
 */
export function generateGatePosition(
  rng: SeededRandom,
  starMass: number,
  gateIndex: number,
  totalGates: number,
  planetOrbits: number[]
): OrbitalElements {
  // Find gaps between planets to place gates
  const gaps: { start: number; end: number; midpoint: number }[] = [];

  if (planetOrbits.length === 0) {
    // No planets - place gates in a reasonable range
    gaps.push({
      start: 1.0 * ASTRONOMICAL_UNIT,
      end: 5.0 * ASTRONOMICAL_UNIT,
      midpoint: 3.0 * ASTRONOMICAL_UNIT,
    });
  } else {
    // Find gaps between planets
    for (let i = 0; i < planetOrbits.length - 1; i++) {
      const gap = planetOrbits[i + 1] - planetOrbits[i];
      // Only consider gaps larger than 0.5 AU
      if (gap > 0.5 * ASTRONOMICAL_UNIT) {
        gaps.push({
          start: planetOrbits[i],
          end: planetOrbits[i + 1],
          midpoint: (planetOrbits[i] + planetOrbits[i + 1]) / 2,
        });
      }
    }

    // Also consider placing gates beyond the outermost planet
    const lastPlanet = planetOrbits[planetOrbits.length - 1];
    gaps.push({
      start: lastPlanet * 1.2,
      end: lastPlanet * 2.0,
      midpoint: lastPlanet * 1.5,
    });
  }

  // Select a gap for this gate (cycle through gaps if more gates than gaps)
  const selectedGap = gaps[gateIndex % gaps.length];

  // Place gate in the gap with some randomness
  const gapWidth = selectedGap.end - selectedGap.start;
  const semiMajorAxis =
    selectedGap.midpoint + rng.nextFloat(-gapWidth * 0.3, gapWidth * 0.3);

  // Gates have nearly circular orbits
  const eccentricity = rng.nextFloat(0.0, 0.05);

  // Slight inclinations for visual interest
  const inclination = rng.nextGaussian(0, 0.03);

  // Random orbital angles
  const longitudeOfAscendingNode = rng.nextFloat(0, 2 * Math.PI);
  const argumentOfPeriapsis = rng.nextFloat(0, 2 * Math.PI);
  const meanAnomalyAtEpoch = rng.nextFloat(0, 2 * Math.PI);

  return {
    semiMajorAxis,
    eccentricity: Math.abs(eccentricity),
    inclination: Math.abs(inclination),
    longitudeOfAscendingNode,
    argumentOfPeriapsis,
    meanAnomalyAtEpoch,
    epoch: 0,
  };
}

/**
 * Generate a tunnel ID from two system IDs (ordered)
 */
export function generateTunnelId(systemIdA: string, systemIdB: string): string {
  const [sysA, sysB] =
    systemIdA < systemIdB ? [systemIdA, systemIdB] : [systemIdB, systemIdA];
  return `tunnel_${sysA}_${sysB}`;
}

/**
 * Generate gates for a star system with tunnels
 * Returns both the tunnel definitions and the gates
 * @param planetOrbits - Array of planet orbital distances (semi-major axes)
 */
export function generateGates(
  rng: SeededRandom,
  systemId: string,
  starMass: number,
  destinationSystemIds: string[],
  planetOrbits: number[]
): { gates: StarGate[]; tunnels: Tunnel[] } {
  const gates: StarGate[] = [];
  const tunnels: Tunnel[] = [];

  for (let i = 0; i < destinationSystemIds.length; i++) {
    const destinationSystemId = destinationSystemIds[i];
    const tunnelId = generateTunnelId(systemId, destinationSystemId);

    // Create tunnel if it doesn't exist yet (will be handled by database)
    const tunnel: Tunnel = {
      id: tunnelId,
      systemAId:
        systemId < destinationSystemId ? systemId : destinationSystemId,
      systemBId:
        systemId < destinationSystemId ? destinationSystemId : systemId,
      poweredByPlayerId: null,
      powerCostEnergy: 0,
      overchargedAt: 0,
      createdAt: Date.now(),
    };
    tunnels.push(tunnel);

    const orbitalElements = generateGatePosition(
      rng,
      starMass,
      i,
      destinationSystemIds.length,
      planetOrbits
    );

    // Placeholder name - will be updated when gate is explored
    const name = generateGateName(i);

    gates.push({
      id: uuidv4(),
      tunnelId: destinationSystemId.startsWith("PLACEHOLDER_")
        ? null
        : tunnelId,
      name,
      systemId,
      destinationSystemId,
      orbitalElements,
    });
  }

  return { gates, tunnels };
}

/**
 * Generate gates for a starter system with placeholder destinations
 * The destination systems will be generated on-demand when player travels through gates
 * @param planetOrbits - Array of planet orbital distances (semi-major axes)
 */
export function generateStarterGates(
  rng: SeededRandom,
  systemId: string,
  starMass: number,
  planetOrbits: number[]
): { gates: StarGate[]; tunnels: Tunnel[] } {
  const gateCount = determineGateCount(rng);
  const gates: StarGate[] = [];
  const tunnels: Tunnel[] = [];

  for (let i = 0; i < gateCount; i++) {
    const orbitalElements = generateGatePosition(
      rng,
      starMass,
      i,
      gateCount,
      planetOrbits
    );

    // Placeholder name - will be updated when gate is explored
    const name = generateGateName(i);

    // Destination will be a placeholder - actual system generated on first travel
    const destinationSystemId = `PLACEHOLDER_${i}`;
    const tunnelId = generateTunnelId(systemId, destinationSystemId);

    // Create placeholder tunnel
    const tunnel: Tunnel = {
      id: tunnelId,
      systemAId:
        systemId < destinationSystemId ? systemId : destinationSystemId,
      systemBId:
        systemId < destinationSystemId ? destinationSystemId : systemId,
      poweredByPlayerId: null,
      powerCostEnergy: 0,
      overchargedAt: 0,
      createdAt: Date.now(),
    };
    tunnels.push(tunnel);

    gates.push({
      id: uuidv4(),
      tunnelId: destinationSystemId.startsWith("PLACEHOLDER_")
        ? null
        : tunnelId,
      name,
      systemId,
      destinationSystemId,
      orbitalElements,
    });
  }

  return { gates, tunnels };
}
