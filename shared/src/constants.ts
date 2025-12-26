// Version
export const GAME_VERSION = "0.4.3";
export const VERSION_NAME = "Supremacy";

// Physical constants (SI units: meters, kilograms, seconds)
export const GRAVITATIONAL_CONSTANT = 6.6743e-11; // m³/(kg·s²)
export const ASTRONOMICAL_UNIT = 1.496e11; // meters
export const SOLAR_MASS = 1.989e30; // kg
export const SOLAR_RADIUS = 6.96e8; // meters
export const EARTH_MASS = 5.972e24; // kg
export const EARTH_RADIUS = 6.371e6; // meters

// Time constants
export const SECONDS_PER_DAY = 86400;
export const DAYS_PER_YEAR = 365.25;

// Game constants
export const SERVER_TICK_RATE = 10; // Hz
export const TIME_SCALE_DEFAULT = 10000; // 1 second real time = 10000 seconds game time
export const MAX_PLANETS = 8;
export const MIN_PLANETS = 3;

// Network constants
export const WEBSOCKET_PORT = 8080;
export const STATE_UPDATE_RATE = 5; // Hz (send state updates to clients)

// Resource constants
export const MAX_ALLOY_STOCKPILE = 500; // Maximum alloy that can be stored
export const MAX_SCIENCE_STOCKPILE = 500; // Maximum science that can be stored

// Megastructure and energy production constants
export const DYSON_SWARM_ENERGY = 1; // Energy added to pool per swarm (not per panel!)
export const HELIUM3_ENERGY = 2; // Energy added to pool per Helium-3 extractor
export const DYSON_PANEL_SIZE = 0.02; // Panel size in solar radii (constant across all stars)
export const DYSON_ORBIT_DISTANCE_MULTIPLIER = 1.08; // Orbit radius as multiplier of star radius
export const PANELS_PER_SWARM = 3; // Number of panels launched per swarm deployment

// Game balance constants for dyson swarms
export const MIN_DYSON_SWARMS_PER_STAR = 12; // Minimum swarms even on smallest stars
export const MAX_DYSON_SWARMS_PER_STAR = 320; // Maximum swarms even on largest stars

/**
 * Calculate maximum dyson swarm deployments for a star
 * Scales logarithmically between MIN and MAX based on star size
 * @param starRadiusInSolarRadii - Star radius in solar radii
 * @returns Maximum number of swarms that can be deployed
 */
export function calculateMaxDysonSwarms(
  starRadiusInSolarRadii: number
): number {
  // Reference star radii for scaling (based on star-types.json)
  const MIN_STAR_RADIUS = 0.008; // White Dwarf (smallest)
  const MAX_STAR_RADIUS = 80; // Red Supergiant (largest)

  // Use logarithmic scaling for better distribution across star sizes
  // log(radius) scales more naturally with star variety
  const minLog = Math.log(MIN_STAR_RADIUS);
  const maxLog = Math.log(MAX_STAR_RADIUS);
  const radiusLog = Math.log(Math.max(MIN_STAR_RADIUS, starRadiusInSolarRadii));

  // Normalize to 0-1 range
  const normalized = (radiusLog - minLog) / (maxLog - minLog);

  // Scale to MIN_DYSON_SWARMS_PER_STAR to MAX_DYSON_SWARMS_PER_STAR
  const maxSwarms = Math.floor(
    MIN_DYSON_SWARMS_PER_STAR +
      (MAX_DYSON_SWARMS_PER_STAR - MIN_DYSON_SWARMS_PER_STAR) * normalized
  );

  return Math.max(
    MIN_DYSON_SWARMS_PER_STAR,
    Math.min(MAX_DYSON_SWARMS_PER_STAR, maxSwarms)
  );
}

// Population constants
// Maximum population is based on planet radius (surface area scales with radius²)
// Earth-like planet (6.371 Mm radius) can support ~10 billion at ecumenopolis stage
// Population scales with surface area: pop = BASE_POPULATION_DENSITY × surface_area × habitability × (1 - iceCapCoverage)
// For Earth: 10B / (4π × (6.371e6)²) ≈ 1.96e-5 people per m²
export const BASE_POPULATION_DENSITY = 1.96e-5; // Population per m² at max capacity

/**
 * Calculate ice cap coverage percentage (0-1) for a planet
 * Based on the same logic used in shader materials for visual rendering
 * Ice caps reduce habitable surface area, affecting max population
 * 
 * @param semiMajorAxis - Orbital distance from star in meters
 * @param habitability - Planet habitability (0-1)
 * @param planetId - Planet ID for deterministic seed-based variation (optional)
 * @param surfaceType - Planet surface type (only affects terrestrial/desert planets with atmosphere)
 * @param hasAtmosphere - Whether planet has atmosphere
 * @returns Ice cap coverage as a fraction (0.0 = no ice caps, 1.0 = fully covered)
 */
export function calculateIceCapCoverage(
  semiMajorAxis: number,
  habitability: number,
  planetId?: string,
  surfaceType?: string,
  hasAtmosphere?: boolean
): number {
  // Only terrestrial and desert planets with atmosphere have ice caps
  // Ice planets are fully covered by ice, but they're not habitable anyway
  if (!hasAtmosphere || (surfaceType !== "terrestrial" && surfaceType !== "desert")) {
    return 0;
  }

  // Normalize orbital distance (same as shader)
  // Map to 0.0 (close) to 1.0+ (far) for easier calculation
  const normalizedDistance = Math.max(0, (semiMajorAxis - 1.0e11) / 2.0e11);
  const temperatureFactor = Math.max(0, Math.min(2.0, normalizedDistance));

  // Determine ice cap threshold ranges based on temperature (same logic as shader)
  let minIceThreshold: number;
  let maxIceThreshold: number;

  if (temperatureFactor < 0.5) {
    // Hot planets (close to star) - tiny ice caps
    minIceThreshold = 0.85;
    maxIceThreshold = 0.92;
  } else if (temperatureFactor < 1.0) {
    // Temperate planets (habitable zone) - moderate ice caps
    minIceThreshold = 0.70;
    maxIceThreshold = 0.85;
  } else if (temperatureFactor < 1.5) {
    // Cool planets - large ice caps
    minIceThreshold = 0.30;
    maxIceThreshold = 0.70;
  } else {
    // Frozen planets (far from star) - massive ice caps up to 90%
    minIceThreshold = 0.10;
    maxIceThreshold = 0.30;
  }

  // Adjust ice caps based on habitability (same logic as shader)
  if (habitability < 0.6) {
    // Uninhabitable/marginal: expand ice caps significantly
    const coldnessFactor = (0.6 - habitability) / 0.6; // 0.0 at hab=0.6, 1.0 at hab=0.0
    const iceExpansion = coldnessFactor * 0.6; // Up to 60% reduction in threshold
    minIceThreshold = Math.max(0.05, minIceThreshold - iceExpansion);
    maxIceThreshold = Math.max(0.10, maxIceThreshold - iceExpansion);
  } else if (habitability > 0.7) {
    // Highly habitable: shrink ice caps slightly
    const warmthFactor = (habitability - 0.7) / 0.3; // 0.0 at hab=0.7, 1.0 at hab=1.0
    const iceShrinkage = warmthFactor * 0.15; // Up to 15% increase in threshold
    minIceThreshold = Math.min(0.92, minIceThreshold + iceShrinkage);
    maxIceThreshold = Math.min(0.95, maxIceThreshold + iceShrinkage);
  }

  // Use midpoint of threshold range for deterministic calculation
  // (Shader uses random seed, but for game logic we use average)
  const baseIceThreshold = (minIceThreshold + maxIceThreshold) / 2;

  // Account for noise variation (shader uses ±0.12, so we subtract average noise effect)
  // This gives us a slightly more conservative estimate (slightly more ice coverage)
  const averageNoiseEffect = 0.06; // Half of 0.12
  const iceThreshold = baseIceThreshold - averageNoiseEffect;
  const clampedThreshold = Math.max(0.05, Math.min(0.95, iceThreshold));

  // Calculate ice cap coverage from threshold
  // On a sphere, if ice extends from threshold T to pole (distanceFromPole from T to 1.0),
  // the distanceFromPole maps to colatitude: distanceFromPole = 0 at equator, 1 at pole
  // For a more accurate calculation accounting for spherical geometry:
  // Coverage = 1 - cos((1 - T) × π/2)
  // For simplicity and reasonable approximation, we use a linear formula: 1 - T
  // This gives slightly higher coverage estimates (more conservative)
  const iceCapCoverage = 1 - clampedThreshold;

  return Math.max(0, Math.min(1, iceCapCoverage));
}

/**
 * Format a large number with appropriate suffix (K, M, B, T)
 */
export function formatLargeNumber(value: number, decimals: number = 1): string {
  if (value >= 1e12) {
    return `${(value / 1e12).toFixed(decimals)}T`;
  } else if (value >= 1e9) {
    return `${(value / 1e9).toFixed(decimals)}B`;
  } else if (value >= 1e6) {
    return `${(value / 1e6).toFixed(decimals)}M`;
  } else if (value >= 1e3) {
    return `${(value / 1e3).toFixed(decimals)}K`;
  } else {
    return value.toString();
  }
}
