// Colony buildings (need workers) and orbital stations (automated, built by
// Constructor ships on any body in systems you don't lose to rivals).

import type { Resources, Yields } from "../types";

export interface BuildingDef {
  id: string;
  name: string;
  cost: Partial<Resources>;
  days: number;
  workers: number;
  yields: Yields;
  /** Extra output per pop in the colony (workforce buildings: trade, research). */
  perPop?: Yields;
  upkeep: Partial<Resources>;
  /** Richness key used to scale output by the planet's deposits. */
  richness?: "metals" | "energy" | "research" | "exotics";
  defense?: number;
  garrison?: number;
  capacity?: number;
  unique?: boolean;
  requires: string | null;
  description: string;
  icon: string;
}

export const BUILDINGS: BuildingDef[] = [
  {
    id: "mine",
    name: "Deep Mine",
    cost: { credits: 95, metals: 30, energy: 25 },
    days: 32,
    workers: 1,
    yields: { metals: 0.9 },
    upkeep: { energy: 0.4 },
    richness: "metals",
    requires: null,
    description: "Extracts ore from the crust. Output scales with the planet's metal deposits.",
    icon: "⛏",
  },
  {
    id: "power_plant",
    name: "Fusion Plant",
    cost: { credits: 80, metals: 65, energy: 10 },
    days: 32,
    workers: 1,
    yields: { energy: 2.2 },
    richness: "energy",
    upkeep: { metals: 0.15 },
    requires: null,
    description: "Geothermal and fusion power. Output scales with the planet's energy potential (hot, active worlds).",
    icon: "⚡",
  },
  {
    id: "research_lab",
    name: "Research Lab",
    cost: { credits: 130, metals: 65, energy: 50 },
    days: 40,
    workers: 1,
    yields: { research: 0.8 },
    perPop: { research: 0.15 },
    upkeep: { energy: 0.7, credits: 0.2, metals: 0.1 },
    requires: null,
    description: "Universities and institutes. Output grows with population: best on large, populous worlds.",
    icon: "⚗",
  },
  {
    id: "trade_hub",
    name: "Trade Hub",
    cost: { credits: 95, metals: 65, energy: 50 },
    days: 32,
    workers: 1,
    yields: { credits: 0.8 },
    perPop: { credits: 0.22 },
    upkeep: { energy: 0.4, metals: 0.1 },
    requires: null,
    description: "Markets and logistics. Output grows with population: modest on a young colony, a fortune on a core world.",
    icon: "₵",
  },
  {
    id: "shipyard",
    name: "Orbital Shipyard",
    cost: { credits: 100, metals: 100, energy: 80 },
    days: 50,
    workers: 1,
    yields: {},
    upkeep: { credits: 0.6, energy: 0.3, metals: 0.1 },
    unique: true,
    requires: null,
    description: "Required to build ships at this colony. Also repairs friendly fleets in orbit.",
    icon: "⚓",
  },
  {
    id: "defense_grid",
    name: "Defense Grid",
    cost: { credits: 80, metals: 175, energy: 140 },
    days: 40,
    workers: 0,
    yields: {},
    upkeep: { energy: 0.6, metals: 0.1 },
    defense: 400,
    garrison: 2,
    requires: null,
    description: "Orbital batteries and a planetary shield. Fights any hostile fleet in orbit.",
    icon: "🛡",
  },
  {
    id: "foundry",
    name: "Foundry",
    cost: { credits: 145, metals: 95, energy: 75 },
    days: 44,
    workers: 1,
    yields: { metals: 1.5 },
    richness: "metals",
    upkeep: { energy: 1.8 },
    requires: "automated_foundries",
    description: "Energy-hungry automated smelters. Output scales with the planet's metal deposits.",
    icon: "🏭",
  },
  {
    id: "quantum_lab",
    name: "Quantum Lab",
    cost: { credits: 255, metals: 130, energy: 105 },
    days: 60,
    workers: 1,
    yields: { research: 1.5 },
    perPop: { research: 0.3 },
    upkeep: { energy: 2, credits: 0.4, metals: 0.1 },
    requires: "quantum_computing",
    description: "Massively parallel quantum research, staffed by the colony's best minds. Scales with population.",
    icon: "⚛",
  },
  {
    id: "exotic_refinery",
    name: "Exotic Refinery",
    cost: { credits: 240, metals: 240, energy: 190 },
    days: 60,
    workers: 1,
    yields: { exotics: 0.25 },
    upkeep: { energy: 2.5, credits: 0.3, metals: 0.1 },
    requires: "exotic_matter",
    description: "Synthesises trace exotic matter in particle colliders.",
    icon: "✦",
  },
  {
    id: "habitat",
    name: "Habitat Dome",
    cost: { credits: 160, metals: 130, energy: 105 },
    days: 48,
    workers: 0,
    yields: {},
    upkeep: { energy: 0.6, credits: 0.3, metals: 0.1 },
    capacity: 4,
    requires: "arcologies",
    description: "Sealed living space. +4 population capacity.",
    icon: "⌂",
  },
  {
    id: "fortress",
    name: "Planetary Fortress",
    cost: { credits: 190, metals: 400, energy: 320 },
    days: 70,
    workers: 0,
    yields: {},
    upkeep: { energy: 1.2, metals: 0.3 },
    defense: 1200,
    garrison: 6,
    unique: true,
    requires: "planetary_fortifications",
    description: "Heavy planetary guns and deep bunkers.",
    icon: "🏰",
  },
];

export const BUILDING_MAP: Record<string, BuildingDef> = Object.fromEntries(
  BUILDINGS.map((b) => [b.id, b]),
);

export function buildingDef(id: string): BuildingDef {
  const b = BUILDING_MAP[id];
  if (!b) throw new Error(`Unknown building ${id}`);
  return b;
}

export type StationTarget = "star" | "gas" | "rocky" | "belt" | "any" | "exotic";

export interface StationDef {
  id: string;
  name: string;
  cost: Partial<Resources>;
  days: number;
  yields: Yields;
  upkeep: Partial<Resources>;
  richness?: "metals" | "energy" | "research" | "exotics";
  /** Which bodies accept this station. */
  targets: StationTarget[];
  requires: string | null;
  hp: number;
  /** Combat stations fire at hostile fleets. */
  weapons?: { family: "laser" | "railgun" | "missile" | "pd"; size: "S" | "M" | "L" }[];
  /** Replaces this station type when built (upgrade). */
  upgradeOf?: string;
  description: string;
  icon: string;
}

export const STATIONS: StationDef[] = [
  {
    id: "mining_station",
    name: "Mining Station",
    cost: { credits: 80, metals: 80, energy: 65 },
    days: 25,
    yields: { metals: 0.7 },
    upkeep: { energy: 0.35, metals: 0.1 },
    richness: "metals",
    targets: ["rocky", "belt"],
    requires: null,
    hp: 150,
    description: "Automated drones strip-mine asteroids and airless worlds.",
    icon: "⛏",
  },
  {
    id: "gas_harvester",
    name: "Gas Harvester",
    cost: { credits: 95, metals: 80, energy: 65 },
    days: 29,
    yields: { energy: 1.5 },
    upkeep: { metals: 0.1 },
    richness: "energy",
    targets: ["gas"],
    requires: null,
    hp: 150,
    description: "Skims helium-3 and deuterium from giant planet atmospheres.",
    icon: "☁",
  },
  {
    id: "solar_array",
    name: "Solar Array",
    cost: { credits: 65, metals: 110, energy: 90 },
    days: 25,
    yields: { energy: 1.2 },
    upkeep: { metals: 0.1 },
    targets: ["star"],
    requires: null,
    hp: 120,
    description: "Collector panels in close stellar orbit. Output depends on the star's type.",
    icon: "☀",
  },
  {
    id: "research_station",
    name: "Research Outpost",
    cost: { credits: 110, metals: 80, energy: 65 },
    days: 32,
    yields: { research: 1.4 },
    upkeep: { energy: 0.6, credits: 0.2, metals: 0.1 },
    richness: "research",
    targets: ["any"],
    requires: null,
    hp: 120,
    description: "Studies anomalies, precursor artifacts and exotic stellar phenomena.",
    icon: "🔭",
  },
  {
    id: "exotic_extractor",
    name: "Exotic Extractor",
    cost: { credits: 160, metals: 190, energy: 150 },
    days: 43,
    yields: { exotics: 0.3 },
    upkeep: { energy: 1.4, credits: 0.2, metals: 0.1 },
    richness: "exotics",
    targets: ["exotic"],
    requires: "exotic_matter",
    hp: 180,
    description: "Harvests exotic matter from crystalline deposits, neutron stars and black holes.",
    icon: "✦",
  },
  {
    id: "defense_platform",
    name: "Defense Platform",
    cost: { credits: 95, metals: 175, energy: 140 },
    days: 32,
    yields: {},
    upkeep: { energy: 0.6, metals: 0.1 },
    targets: ["any"],
    requires: null,
    hp: 450,
    weapons: [
      { family: "railgun", size: "M" },
      { family: "laser", size: "M" },
      { family: "pd", size: "S" },
    ],
    description: "An armed orbital fortress guarding a planet or star.",
    icon: "✚",
  },
  {
    id: "dyson_swarm",
    name: "Dyson Swarm",
    cost: { credits: 300, metals: 500, energy: 400, exotics: 25 },
    days: 108,
    yields: { energy: 10 },
    upkeep: { metals: 0.8 },
    targets: ["star"],
    requires: "dyson_swarm",
    hp: 600,
    upgradeOf: "solar_array",
    description: "Millions of collectors enclosing the star. Replaces a Solar Array.",
    icon: "◎",
  },
  {
    id: "pirate_haven",
    name: "Raider Haven",
    cost: {},
    days: 0,
    yields: {},
    upkeep: {},
    targets: [],
    requires: "__never__",
    hp: 1800,
    weapons: [
      { family: "railgun", size: "M" },
      { family: "railgun", size: "M" },
      { family: "laser", size: "M" },
      { family: "missile", size: "M" },
      { family: "pd", size: "S" },
    ],
    description: "A fortified asteroid base of the Void Raiders. Destroy it for a rich bounty.",
    icon: "☠",
  },
];

export const PIRATE_HAVEN_BOUNTY = { credits: 250, metals: 200, exotics: 25 };

export const STATION_MAP: Record<string, StationDef> = Object.fromEntries(
  STATIONS.map((s) => [s.id, s]),
);

export function stationDef(id: string): StationDef {
  const s = STATION_MAP[id];
  if (!s) throw new Error(`Unknown station ${id}`);
  return s;
}

export interface SpeciesDef {
  id: string;
  name: string;
  adjective: string;
  description: string;
  preferred: string[]; // planet types with +0.2 habitability
  lithoid?: boolean; // can live on barren/volcanic/crystal worlds
  machine?: boolean; // every solid world has at least 60% habitability, never more than 80%
  bonuses: { credits?: number; metals?: number; energy?: number; research?: number; damage?: number; popGrowth?: number };
  color: string;
}

export const SPECIES: SpeciesDef[] = [
  {
    id: "terrans",
    name: "Terran Union",
    adjective: "Terran",
    description: "Adaptable humans. Traders at heart. +15% credits.",
    preferred: ["terran", "ocean", "savanna"],
    bonuses: { credits: 0.15 },
    color: "#4aa3ff",
  },
  {
    id: "vashari",
    name: "Vashari Dominion",
    adjective: "Vashari",
    description: "Reptilian industrialists from a desert world. +20% metals.",
    preferred: ["arid", "savanna", "martian"],
    bonuses: { metals: 0.2 },
    color: "#ff9d3c",
  },
  {
    id: "lumenari",
    name: "Lumenari Concord",
    adjective: "Lumenari",
    description: "Crystalline lithoids who think in light. +20% research; can settle barren and lava worlds.",
    preferred: ["crystal", "barren", "volcanic"],
    lithoid: true,
    bonuses: { research: 0.2, popGrowth: -0.25 },
    color: "#b58cff",
  },
  {
    id: "kraal",
    name: "Kraal Hive",
    adjective: "Kraal",
    description: "Insectoid swarm. Breeds fast, fights harder. +15% weapon damage, +30% growth.",
    preferred: ["jungle", "tundra", "toxic"],
    bonuses: { damage: 0.15, popGrowth: 0.3 },
    color: "#e84a5f",
  },
  {
    id: "thalassi",
    name: "Thalassi Tide",
    adjective: "Thalassi",
    description: "Aquatic philosophers. +15% energy and research on ocean worlds' tides of thought.",
    preferred: ["ocean", "jungle", "arctic"],
    bonuses: { energy: 0.15, research: 0.1 },
    color: "#2ee6c5",
  },
  {
    id: "aurelian",
    name: "Aurelian Synod",
    adjective: "Aurelian",
    description: "Machine intelligences. Any solid world is 60% habitable; +10% to everything, slow assembly.",
    preferred: ["barren", "martian"],
    machine: true,
    bonuses: { credits: 0.1, metals: 0.1, energy: 0.1, research: 0.1, popGrowth: -0.4 },
    color: "#ffd84a",
  },
];

export const SPECIES_MAP: Record<string, SpeciesDef> = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

export function speciesDef(id: string): SpeciesDef {
  const s = SPECIES_MAP[id];
  if (!s) throw new Error(`Unknown species ${id}`);
  return s;
}

export const PIRATE_SPECIES: SpeciesDef = {
  id: "pirates",
  name: "Void Raiders",
  adjective: "Raider",
  description: "Lawless marauders preying on the weak.",
  preferred: [],
  bonuses: {},
  color: "#9a9a9a",
};
