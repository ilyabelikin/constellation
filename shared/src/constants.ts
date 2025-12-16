// Version
export const GAME_VERSION = "0.4.0";
export const VERSION_NAME = "Logistics and War";

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

// Megastructure constants
export const DYSON_SWARM_ENERGY_PER_DAY = 1; // Energy generated per day per swarm (not per panel!)
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
// Population scales with surface area: pop = BASE_POPULATION_DENSITY × surface_area × habitability
// For Earth: 10B / (4π × (6.371e6)²) ≈ 1.96e-5 people per m²
export const BASE_POPULATION_DENSITY = 1.96e-5; // Population per m² at max capacity

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
