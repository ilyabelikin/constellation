// Version
export const GAME_VERSION = "0.3.1";
export const VERSION_NAME = "Species and Colonies";

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
export const DYSON_SWARM_COST = 10; // Alloy cost to build one swarm
export const DYSON_SWARM_ENERGY_PER_DAY = 1; // Energy generated per day per swarm
export const MAX_DYSON_SWARMS_PER_STAR = 30; // Maximum swarms per star

// Population constants
// Maximum population is based on planet radius (surface area scales with radius²)
// Earth-like planet (6.4M km radius) can support ~10 billion at ecumenopolis stage
// Population scales with surface area: pop = BASE_POP_PER_RADIUS² * (radius/EARTH_RADIUS)²
export const BASE_POPULATION_DENSITY = 2.44e-7; // Population per m² at max capacity (10B / 4πr² for Earth)

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
