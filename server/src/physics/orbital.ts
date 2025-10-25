import {
  Vector3,
  OrbitalElements,
  GRAVITATIONAL_CONSTANT,
} from "@constellation/shared";

/**
 * Solves Kepler's equation using Newton-Raphson method
 * M = E - e * sin(E)
 * Where M is mean anomaly, E is eccentric anomaly, e is eccentricity
 */
export function solveKeplerEquation(
  meanAnomaly: number,
  eccentricity: number,
  tolerance = 1e-8
): number {
  let E = meanAnomaly; // Initial guess
  let delta = 1;
  let iterations = 0;
  const maxIterations = 100;

  while (Math.abs(delta) > tolerance && iterations < maxIterations) {
    delta =
      (E - eccentricity * Math.sin(E) - meanAnomaly) /
      (1 - eccentricity * Math.cos(E));
    E -= delta;
    iterations++;
  }

  return E;
}

/**
 * Calculate mean anomaly at given time from orbital elements
 */
export function calculateMeanAnomaly(
  elements: OrbitalElements,
  currentTime: number,
  parentMass: number
): number {
  const n = calculateMeanMotion(elements.semiMajorAxis, parentMass);
  const timeSinceEpoch = currentTime - elements.epoch;
  return elements.meanAnomalyAtEpoch + n * timeSinceEpoch;
}

/**
 * Calculate mean motion (average angular velocity)
 */
export function calculateMeanMotion(
  semiMajorAxis: number,
  parentMass: number
): number {
  return Math.sqrt(
    (GRAVITATIONAL_CONSTANT * parentMass) / Math.pow(semiMajorAxis, 3)
  );
}

/**
 * Calculate position and velocity from orbital elements
 */
export function calculateStateVectors(
  elements: OrbitalElements,
  currentTime: number,
  parentMass: number
): { position: Vector3; velocity: Vector3 } {
  const {
    semiMajorAxis: a,
    eccentricity: e,
    inclination: i,
    longitudeOfAscendingNode: Ω,
    argumentOfPeriapsis: ω,
  } = elements;

  // Calculate mean anomaly
  const M = calculateMeanAnomaly(elements, currentTime, parentMass);

  // Solve for eccentric anomaly
  const E = solveKeplerEquation(M, e);

  // Calculate true anomaly
  const ν =
    2 *
    Math.atan2(
      Math.sqrt(1 + e) * Math.sin(E / 2),
      Math.sqrt(1 - e) * Math.cos(E / 2)
    );

  // Calculate distance
  const r = a * (1 - e * Math.cos(E));

  // Position in orbital plane
  const x_orb = r * Math.cos(ν);
  const y_orb = r * Math.sin(ν);

  // Velocity in orbital plane
  const μ = GRAVITATIONAL_CONSTANT * parentMass;
  const h = Math.sqrt(μ * a * (1 - e * e)); // Specific angular momentum
  const vx_orb = -(μ / h) * Math.sin(ν);
  const vy_orb = (μ / h) * (e + Math.cos(ν));

  // Rotation matrices to convert from orbital plane to 3D space
  const cosΩ = Math.cos(Ω);
  const sinΩ = Math.sin(Ω);
  const cosω = Math.cos(ω);
  const sinω = Math.sin(ω);
  const cosi = Math.cos(i);
  const sini = Math.sin(i);

  // Apply rotations (3-1-3 Euler angles: Ω, i, ω)
  const position: Vector3 = {
    x:
      x_orb * (cosΩ * cosω - sinΩ * sinω * cosi) -
      y_orb * (cosΩ * sinω + sinΩ * cosω * cosi),
    y:
      x_orb * (sinΩ * cosω + cosΩ * sinω * cosi) -
      y_orb * (sinΩ * sinω - cosΩ * cosω * cosi),
    z: x_orb * sinω * sini + y_orb * cosω * sini,
  };

  const velocity: Vector3 = {
    x:
      vx_orb * (cosΩ * cosω - sinΩ * sinω * cosi) -
      vy_orb * (cosΩ * sinω + sinΩ * cosω * cosi),
    y:
      vx_orb * (sinΩ * cosω + cosΩ * sinω * cosi) -
      vy_orb * (sinΩ * sinω - cosΩ * cosω * cosi),
    z: vx_orb * sinω * sini + vy_orb * cosω * sini,
  };

  return { position, velocity };
}

/**
 * Calculate Lagrange points for a two-body system
 */
export function calculateLagrangePoints(
  primaryMass: number,
  secondaryMass: number,
  secondaryPosition: Vector3
): { L1: Vector3; L2: Vector3; L3: Vector3; L4: Vector3; L5: Vector3 } {
  const μ = secondaryMass / (primaryMass + secondaryMass);
  const r = Math.sqrt(
    secondaryPosition.x ** 2 +
      secondaryPosition.y ** 2 +
      secondaryPosition.z ** 2
  );

  // Normalized direction vector
  const dx = secondaryPosition.x / r;
  const dy = secondaryPosition.y / r;
  const dz = secondaryPosition.z / r;

  // L1 point (between primary and secondary)
  const r1 = r * (1 - Math.cbrt(μ / 3));
  const L1: Vector3 = { x: dx * r1, y: dy * r1, z: dz * r1 };

  // L2 point (beyond secondary)
  const r2 = r * (1 + Math.cbrt(μ / 3));
  const L2: Vector3 = { x: dx * r2, y: dy * r2, z: dz * r2 };

  // L3 point (beyond primary, opposite side)
  const r3 = -r * (1 + (5 * μ) / 12);
  const L3: Vector3 = { x: dx * r3, y: dy * r3, z: dz * r3 };

  // L4 and L5 points (equilateral triangle with primary and secondary)
  // Rotate secondary position by ±60 degrees
  const angle4 = Math.PI / 3; // 60 degrees
  const angle5 = -Math.PI / 3; // -60 degrees

  const L4: Vector3 = {
    x:
      secondaryPosition.x * Math.cos(angle4) -
      secondaryPosition.y * Math.sin(angle4),
    y:
      secondaryPosition.x * Math.sin(angle4) +
      secondaryPosition.y * Math.cos(angle4),
    z: secondaryPosition.z,
  };

  const L5: Vector3 = {
    x:
      secondaryPosition.x * Math.cos(angle5) -
      secondaryPosition.y * Math.sin(angle5),
    y:
      secondaryPosition.x * Math.sin(angle5) +
      secondaryPosition.y * Math.cos(angle5),
    z: secondaryPosition.z,
  };

  return { L1, L2, L3, L4, L5 };
}

/**
 * Calculate gravitational acceleration from multiple bodies (for perturbations)
 */
export function calculatePerturbations(
  position: Vector3,
  bodies: Array<{ mass: number; position: Vector3 }>
): Vector3 {
  const acceleration: Vector3 = { x: 0, y: 0, z: 0 };

  for (const body of bodies) {
    const dx = body.position.x - position.x;
    const dy = body.position.y - position.y;
    const dz = body.position.z - position.z;
    const r2 = dx * dx + dy * dy + dz * dz;
    const r = Math.sqrt(r2);

    if (r > 0) {
      const a = (GRAVITATIONAL_CONSTANT * body.mass) / (r2 * r);
      acceleration.x += a * dx;
      acceleration.y += a * dy;
      acceleration.z += a * dz;
    }
  }

  return acceleration;
}

/**
 * Calculate orbital elements from state vectors (position and velocity)
 */
export function calculateOrbitalElements(
  position: Vector3,
  velocity: Vector3,
  parentMass: number,
  epoch: number
): OrbitalElements {
  const μ = GRAVITATIONAL_CONSTANT * parentMass;

  // Position and velocity magnitudes
  const r = Math.sqrt(position.x ** 2 + position.y ** 2 + position.z ** 2);
  const v = Math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2);

  // Specific angular momentum vector
  const h: Vector3 = {
    x: position.y * velocity.z - position.z * velocity.y,
    y: position.z * velocity.x - position.x * velocity.z,
    z: position.x * velocity.y - position.y * velocity.x,
  };
  const hMag = Math.sqrt(h.x ** 2 + h.y ** 2 + h.z ** 2);

  // Node vector
  const n: Vector3 = {
    x: -h.y,
    y: h.x,
    z: 0,
  };
  const nMag = Math.sqrt(n.x ** 2 + n.y ** 2);

  // Eccentricity vector
  const e_vec: Vector3 = {
    x:
      ((v ** 2 - μ / r) * position.x -
        (position.x * velocity.x +
          position.y * velocity.y +
          position.z * velocity.z) *
          velocity.x) /
      μ,
    y:
      ((v ** 2 - μ / r) * position.y -
        (position.x * velocity.x +
          position.y * velocity.y +
          position.z * velocity.z) *
          velocity.y) /
      μ,
    z:
      ((v ** 2 - μ / r) * position.z -
        (position.x * velocity.x +
          position.y * velocity.y +
          position.z * velocity.z) *
          velocity.z) /
      μ,
  };
  const eccentricity = Math.sqrt(e_vec.x ** 2 + e_vec.y ** 2 + e_vec.z ** 2);

  // Semi-major axis
  const energy = v ** 2 / 2 - μ / r;
  const semiMajorAxis = -μ / (2 * energy);

  // Inclination
  const inclination = Math.acos(h.z / hMag);

  // Longitude of ascending node
  let longitudeOfAscendingNode = 0;
  if (nMag > 0) {
    longitudeOfAscendingNode = Math.acos(n.x / nMag);
    if (n.y < 0) {
      longitudeOfAscendingNode = 2 * Math.PI - longitudeOfAscendingNode;
    }
  }

  // Argument of periapsis
  let argumentOfPeriapsis = 0;
  if (nMag > 0 && eccentricity > 0) {
    argumentOfPeriapsis = Math.acos(
      (n.x * e_vec.x + n.y * e_vec.y + n.z * e_vec.z) / (nMag * eccentricity)
    );
    if (e_vec.z < 0) {
      argumentOfPeriapsis = 2 * Math.PI - argumentOfPeriapsis;
    }
  }

  // True anomaly
  let trueAnomaly = 0;
  if (eccentricity > 0) {
    const dotProduct =
      (e_vec.x * position.x + e_vec.y * position.y + e_vec.z * position.z) /
      (eccentricity * r);
    trueAnomaly = Math.acos(Math.max(-1, Math.min(1, dotProduct)));
    const radialVelocity =
      (position.x * velocity.x +
        position.y * velocity.y +
        position.z * velocity.z) /
      r;
    if (radialVelocity < 0) {
      trueAnomaly = 2 * Math.PI - trueAnomaly;
    }
  }

  // Eccentric anomaly
  const E =
    2 *
    Math.atan2(
      Math.sqrt(1 - eccentricity) * Math.sin(trueAnomaly / 2),
      Math.sqrt(1 + eccentricity) * Math.cos(trueAnomaly / 2)
    );

  // Mean anomaly
  const meanAnomalyAtEpoch = E - eccentricity * Math.sin(E);

  return {
    semiMajorAxis,
    eccentricity,
    inclination,
    longitudeOfAscendingNode,
    argumentOfPeriapsis,
    meanAnomalyAtEpoch,
    epoch,
  };
}

