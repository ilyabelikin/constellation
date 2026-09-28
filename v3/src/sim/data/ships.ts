// Ship hulls & weapons. Hulls have fixed, sensible loadouts; the empire's
// technology upgrades weapon tiers, armour and shields automatically, so the
// player manages fleets rather than spreadsheets.

import type { Resources } from "../types";

export type WeaponFamily = "laser" | "railgun" | "missile" | "pd" | "lance";
export type SlotSize = "S" | "M" | "L" | "XL";

export interface WeaponMount {
  family: WeaponFamily;
  size: SlotSize;
}

export interface WeaponFamilyDef {
  id: WeaponFamily;
  name: string;
  /** Base damage per shot for an S mount. */
  damage: number;
  /** Days between shots. */
  cooldown: number;
  accuracy: number;
  vsShields: number;
  vsArmor: number;
  /** Tech ids that each add +1 tier (+30% damage). */
  tiers: string[];
  interceptable: boolean;
  color: string;
}

export const SLOT_MULT: Record<SlotSize, number> = { S: 1, M: 2.4, L: 5.5, XL: 13 };

export const WEAPONS: Record<WeaponFamily, WeaponFamilyDef> = {
  laser: {
    id: "laser",
    name: "Laser",
    damage: 5,
    cooldown: 0.25,
    accuracy: 0.9,
    vsShields: 1.4,
    vsArmor: 0.75,
    tiers: ["lasers_2", "plasma_weapons"],
    interceptable: false,
    color: "#ff4b5c",
  },
  railgun: {
    id: "railgun",
    name: "Railgun",
    damage: 8,
    cooldown: 0.4,
    accuracy: 0.75,
    vsShields: 0.6,
    vsArmor: 1.5,
    tiers: ["railguns", "mass_drivers_2"],
    interceptable: false,
    color: "#ffd166",
  },
  missile: {
    id: "missile",
    name: "Missile",
    damage: 15,
    cooldown: 0.8,
    accuracy: 0.95,
    vsShields: 0.5,
    vsArmor: 1.1,
    tiers: ["guided_missiles", "torpedoes"],
    interceptable: true,
    color: "#9ef0ff",
  },
  pd: {
    id: "pd",
    name: "Point Defense",
    damage: 1,
    cooldown: 0.2,
    accuracy: 0.6,
    vsShields: 1,
    vsArmor: 0.5,
    tiers: ["point_defense_2"],
    interceptable: false,
    color: "#b0ffb0",
  },
  lance: {
    id: "lance",
    name: "Particle Lance",
    damage: 8,
    cooldown: 0.6,
    accuracy: 0.85,
    vsShields: 1.2,
    vsArmor: 1.2,
    tiers: ["plasma_weapons"],
    interceptable: false,
    color: "#c38bff",
  },
};

export type HullRole = "military" | "scout" | "constructor" | "colony" | "transport" | "civilian";

export interface HullDef {
  id: string;
  name: string;
  role: HullRole;
  cost: Partial<Resources>;
  buildDays: number;
  /** Daily running cost: crews are paid in credits, reactors burn energy. */
  upkeep: Partial<Resources>;
  hull: number;
  armor: number;
  shields: number;
  /** Cruise speed in AU per day (ships accelerate up to it and brake from it). */
  speed: number;
  evasion: number;
  weapons: WeaponMount[];
  requires: string | null;
  troops?: number;
  /** Command points used toward the empire's fleet capacity. */
  command: number;
  /** Visual length in metres (for flavour + rendering scale). */
  length: number;
  description: string;
}

/** Tech id nobody can research: hulls that require it are never built in shipyards. */
export const NOT_BUILDABLE = "__never__";

export const HULLS: HullDef[] = [
  {
    id: "liner",
    command: 0,
    name: "Migrant Liner",
    role: "civilian",
    cost: {},
    buildDays: 0,
    upkeep: {},
    hull: 40,
    armor: 0,
    shields: 0,
    speed: 0.5,
    evasion: 0.1,
    weapons: [],
    requires: NOT_BUILDABLE,
    length: 110,
    description: "A privately chartered liner carrying settlers from crowded worlds to young colonies.",
  },
  {
    id: "scout",
    command: 0,
    name: "Scout",
    role: "scout",
    cost: { credits: 25, metals: 20 },
    buildDays: 10,
    upkeep: { credits: 0.2, energy: 0.1 },
    hull: 30,
    armor: 0,
    shields: 0,
    speed: 1.3,
    evasion: 0.5,
    weapons: [],
    requires: null,
    length: 40,
    description: "Fast, unarmed survey vessel for exploring unknown systems.",
  },
  {
    id: "constructor",
    command: 0,
    name: "Constructor",
    role: "constructor",
    cost: { credits: 50, metals: 60 },
    buildDays: 18,
    upkeep: { credits: 0.3, energy: 0.2 },
    hull: 60,
    armor: 10,
    shields: 0,
    speed: 0.65,
    evasion: 0.1,
    weapons: [],
    requires: null,
    length: 90,
    description: "Builds orbital stations: mines, gas harvesters, solar arrays and more.",
  },
  {
    id: "colony",
    command: 0,
    name: "Colony Ship",
    role: "colony",
    cost: { credits: 140, metals: 90 },
    buildDays: 35,
    upkeep: { credits: 0.5, energy: 0.3 },
    hull: 80,
    armor: 10,
    shields: 0,
    speed: 0.55,
    evasion: 0.05,
    weapons: [],
    requires: null,
    length: 150,
    description: "Carries colonists and a prefabricated settlement to a new world.",
  },
  {
    id: "transport",
    command: 1,
    name: "Troop Transport",
    role: "transport",
    cost: { credits: 50, metals: 50 },
    buildDays: 15,
    upkeep: { credits: 0.3, energy: 0.15 },
    hull: 90,
    armor: 20,
    shields: 0,
    speed: 0.7,
    evasion: 0.1,
    weapons: [],
    troops: 3,
    requires: "ground_forces",
    length: 110,
    description: "Lands armies to invade enemy worlds once their defenses are down.",
  },
  {
    id: "corvette",
    command: 1,
    name: "Corvette",
    role: "military",
    cost: { credits: 20, metals: 45 },
    buildDays: 14,
    upkeep: { credits: 0.45, energy: 0.3 },
    hull: 60,
    armor: 20,
    shields: 0,
    speed: 1.0,
    evasion: 0.35,
    weapons: [{ family: "laser", size: "S" }, { family: "missile", size: "S" }],
    requires: null,
    length: 60,
    description: "Nimble picket ship. Cheap, fast and hard to hit.",
  },
  {
    id: "frigate",
    command: 2,
    name: "Frigate",
    role: "military",
    cost: { credits: 35, metals: 90 },
    buildDays: 24,
    upkeep: { credits: 0.75, energy: 0.45 },
    hull: 130,
    armor: 50,
    shields: 20,
    speed: 0.9,
    evasion: 0.25,
    weapons: [
      { family: "railgun", size: "S" },
      { family: "missile", size: "S" },
      { family: "pd", size: "S" },
    ],
    requires: "frigates",
    length: 110,
    description: "Escort ship with point defense that shields the fleet from missiles.",
  },
  {
    id: "destroyer",
    command: 3,
    name: "Destroyer",
    role: "military",
    cost: { credits: 60, metals: 160 },
    buildDays: 38,
    upkeep: { credits: 1.2, energy: 0.7 },
    hull: 260,
    armor: 110,
    shields: 60,
    speed: 0.8,
    evasion: 0.16,
    weapons: [
      { family: "railgun", size: "M" },
      { family: "railgun", size: "M" },
      { family: "pd", size: "S" },
    ],
    requires: "destroyers",
    length: 220,
    description: "Spinal railgun platform that shreds armoured targets.",
  },
  {
    id: "cruiser",
    command: 5,
    name: "Cruiser",
    role: "military",
    cost: { credits: 110, metals: 290 },
    buildDays: 58,
    upkeep: { credits: 2, energy: 1.2 },
    hull: 520,
    armor: 220,
    shields: 170,
    speed: 0.7,
    evasion: 0.1,
    weapons: [
      { family: "laser", size: "M" },
      { family: "laser", size: "M" },
      { family: "missile", size: "M" },
      { family: "pd", size: "S" },
    ],
    requires: "cruisers",
    length: 420,
    description: "Balanced line ship with heavy lasers, missiles and deflector shields.",
  },
  {
    id: "battleship",
    command: 8,
    name: "Battleship",
    role: "military",
    cost: { credits: 220, metals: 600, exotics: 15 },
    buildDays: 90,
    upkeep: { credits: 3.4, energy: 2 },
    hull: 1250,
    armor: 520,
    shields: 420,
    speed: 0.575,
    evasion: 0.05,
    weapons: [
      { family: "railgun", size: "L" },
      { family: "railgun", size: "L" },
      { family: "laser", size: "M" },
      { family: "laser", size: "M" },
      { family: "pd", size: "S" },
      { family: "pd", size: "S" },
    ],
    requires: "battleships",
    length: 900,
    description: "A kilometre of armour and guns. The backbone of any serious navy.",
  },
  {
    id: "titan",
    command: 16,
    name: "Titan",
    role: "military",
    cost: { credits: 500, metals: 1400, exotics: 80 },
    buildDays: 150,
    upkeep: { credits: 7, energy: 4 },
    hull: 3600,
    armor: 1300,
    shields: 1300,
    speed: 0.475,
    evasion: 0.02,
    weapons: [
      { family: "lance", size: "XL" },
      { family: "laser", size: "L" },
      { family: "laser", size: "L" },
      { family: "missile", size: "L" },
      { family: "pd", size: "S" },
      { family: "pd", size: "S" },
    ],
    requires: "titans",
    length: 2400,
    description: "A flagship with a spinal particle lance capable of gutting fleets.",
  },
];

export const HULL_MAP: Record<string, HullDef> = Object.fromEntries(HULLS.map((h) => [h.id, h]));

export function hullDef(id: string): HullDef {
  const h = HULL_MAP[id];
  if (!h) throw new Error(`Unknown hull ${id}`);
  return h;
}
