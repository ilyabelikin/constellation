// Planet, moon, asteroid-belt catalogue: gameplay values plus the visual
// parameters the renderer's procedural shaders use.

export type Zone = "hot" | "temperate" | "cold" | "outer";

export type PlanetStyle = "terrestrial" | "gas" | "lava" | "rocky" | "crystal" | "shrouded";

export interface PlanetVisual {
  style: PlanetStyle;
  /** Palette: [deep, shallow, low land, high land, peaks/ice]. */
  palette: [string, string, string, string, string];
  seaLevel: number; // 0..1 portion covered by liquid (terrestrial style)
  iceCaps: number; // 0..1 latitude where caps begin (1 = none)
  clouds: number; // 0..1 coverage
  cloudColor: string;
  atmosphere: string | null; // rim glow colour
  atmosphereStrength: number;
  emissive?: string; // lava / hot jupiter glow / crystal shimmer
  bumpiness: number;
}

export interface PlanetType {
  id: string;
  name: string;
  giant: boolean;
  zones: Partial<Record<Zone, number>>; // spawn weight by zone
  moonWeight: number; // weight as a moon (0 = never)
  radius: [number, number]; // Earth radii
  habitability: number; // base 0..1 for a generic carbon-based species
  size: [number, number]; // colony size class range (0 = not colonisable)
  richness: { metals: number; energy: number; research: number; exotics: number };
  ringChance: number;
  description: string;
  visual: PlanetVisual;
}

export const PLANET_TYPES: PlanetType[] = [
  {
    id: "terran",
    name: "Terran World",
    giant: false,
    zones: { temperate: 10 },
    moonWeight: 0.4,
    radius: [0.8, 1.5],
    habitability: 1,
    size: [3, 5],
    richness: { metals: 1, energy: 0.5, research: 0.5, exotics: 0 },
    ringChance: 0.03,
    description: "Continents, oceans and a breathable sky. A rare jewel.",
    visual: {
      style: "terrestrial",
      palette: ["#0b2a5c", "#1f6fa8", "#3f7a3a", "#8a7b52", "#f4f7fb"],
      seaLevel: 0.55,
      iceCaps: 0.8,
      clouds: 0.5,
      cloudColor: "#ffffff",
      atmosphere: "#6fb4ff",
      atmosphereStrength: 1,
      bumpiness: 0.5,
    },
  },
  {
    id: "ocean",
    name: "Ocean World",
    giant: false,
    zones: { temperate: 7, cold: 1 },
    moonWeight: 0.3,
    radius: [0.9, 1.8],
    habitability: 0.85,
    size: [3, 5],
    richness: { metals: 0.4, energy: 1, research: 0.8, exotics: 0 },
    ringChance: 0.03,
    description: "A planet-spanning ocean dotted with volcanic archipelagos.",
    visual: {
      style: "terrestrial",
      palette: ["#041d45", "#0f5e9c", "#2f8f6a", "#c9c39a", "#e8f4ff"],
      seaLevel: 0.86,
      iceCaps: 0.85,
      clouds: 0.6,
      cloudColor: "#ffffff",
      atmosphere: "#5fc8ff",
      atmosphereStrength: 1.1,
      bumpiness: 0.3,
    },
  },
  {
    id: "jungle",
    name: "Jungle World",
    giant: false,
    zones: { temperate: 6, hot: 1 },
    moonWeight: 0.35,
    radius: [0.8, 1.4],
    habitability: 0.8,
    size: [3, 4],
    richness: { metals: 0.8, energy: 0.6, research: 1, exotics: 0 },
    ringChance: 0.03,
    description: "Humid and overgrown, with an explosion of alien biodiversity.",
    visual: {
      style: "terrestrial",
      palette: ["#0c3040", "#1e6a64", "#1f5a1c", "#5b7d2a", "#d9e6c4"],
      seaLevel: 0.35,
      iceCaps: 0.95,
      clouds: 0.7,
      cloudColor: "#f2fff4",
      atmosphere: "#8fffb8",
      atmosphereStrength: 1,
      bumpiness: 0.4,
    },
  },
  {
    id: "savanna",
    name: "Savanna World",
    giant: false,
    zones: { temperate: 6, hot: 2 },
    moonWeight: 0.3,
    radius: [0.7, 1.3],
    habitability: 0.7,
    size: [2, 4],
    richness: { metals: 1, energy: 0.8, research: 0.4, exotics: 0 },
    ringChance: 0.03,
    description: "Endless golden grasslands under a warm sky, with shallow inland seas.",
    visual: {
      style: "terrestrial",
      palette: ["#15335a", "#2c7aa0", "#9b9a3a", "#b3813f", "#efe6c8"],
      seaLevel: 0.28,
      iceCaps: 0.92,
      clouds: 0.3,
      cloudColor: "#fffaf0",
      atmosphere: "#ffd49a",
      atmosphereStrength: 0.8,
      bumpiness: 0.45,
    },
  },
  {
    id: "arid",
    name: "Desert World",
    giant: false,
    zones: { hot: 5, temperate: 4 },
    moonWeight: 0.4,
    radius: [0.6, 1.3],
    habitability: 0.5,
    size: [2, 4],
    richness: { metals: 1.3, energy: 1.2, research: 0.3, exotics: 0 },
    ringChance: 0.04,
    description: "Wind-carved dunes and dry canyons. Harsh, but livable.",
    visual: {
      style: "terrestrial",
      palette: ["#5a3418", "#8a5a2a", "#c98b4a", "#e3b273", "#f7e3c0"],
      seaLevel: 0.06,
      iceCaps: 0.93,
      clouds: 0.12,
      cloudColor: "#fff1dc",
      atmosphere: "#ffb070",
      atmosphereStrength: 0.7,
      bumpiness: 0.7,
    },
  },
  {
    id: "tundra",
    name: "Tundra World",
    giant: false,
    zones: { cold: 6, temperate: 2 },
    moonWeight: 0.4,
    radius: [0.6, 1.3],
    habitability: 0.55,
    size: [2, 4],
    richness: { metals: 1.1, energy: 0.6, research: 0.5, exotics: 0 },
    ringChance: 0.04,
    description: "Frozen steppe, hardy lichens and grey, wind-whipped seas.",
    visual: {
      style: "terrestrial",
      palette: ["#1a2f45", "#3d6682", "#6c7a5c", "#8e8a7a", "#f1f5f8"],
      seaLevel: 0.35,
      iceCaps: 0.55,
      clouds: 0.45,
      cloudColor: "#f4f8ff",
      atmosphere: "#a8d0ff",
      atmosphereStrength: 0.8,
      bumpiness: 0.5,
    },
  },
  {
    id: "arctic",
    name: "Arctic World",
    giant: false,
    zones: { cold: 6, outer: 3 },
    moonWeight: 1.2,
    radius: [0.4, 1.2],
    habitability: 0.25,
    size: [1, 3],
    richness: { metals: 0.7, energy: 0.4, research: 0.8, exotics: 0.05 },
    ringChance: 0.05,
    description: "Glaciers kilometres thick hide a liquid ocean beneath.",
    visual: {
      style: "terrestrial",
      palette: ["#284866", "#5a8fb4", "#b9d3e6", "#dbe9f3", "#ffffff"],
      seaLevel: 0.2,
      iceCaps: 0.1,
      clouds: 0.25,
      cloudColor: "#ffffff",
      atmosphere: "#cfe8ff",
      atmosphereStrength: 0.5,
      bumpiness: 0.35,
    },
  },
  {
    id: "toxic",
    name: "Toxic World",
    giant: false,
    zones: { hot: 4, temperate: 2 },
    moonWeight: 0.3,
    radius: [0.7, 1.3],
    habitability: 0.05,
    size: [1, 3],
    richness: { metals: 1, energy: 1.2, research: 1.2, exotics: 0.05 },
    ringChance: 0.03,
    description: "Crushing acid clouds over a scorched surface. A runaway greenhouse.",
    visual: {
      style: "shrouded",
      palette: ["#5c4a14", "#8a7a2a", "#c9b35a", "#e3d38a", "#f5eec2"],
      seaLevel: 0,
      iceCaps: 1,
      clouds: 1,
      cloudColor: "#e8d27a",
      atmosphere: "#f0d060",
      atmosphereStrength: 1.2,
      bumpiness: 0.2,
    },
  },
  {
    id: "volcanic",
    name: "Lava World",
    giant: false,
    zones: { hot: 5 },
    moonWeight: 0.6,
    radius: [0.4, 1.2],
    habitability: 0.02,
    size: [1, 2],
    richness: { metals: 2.2, energy: 1.5, research: 0.6, exotics: 0.1 },
    ringChance: 0.02,
    description: "A molten hellscape — but its crust is rich with heavy metals.",
    visual: {
      style: "lava",
      palette: ["#120806", "#241210", "#3a1c14", "#55301f", "#ff6a1a"],
      seaLevel: 0.4,
      iceCaps: 1,
      clouds: 0.08,
      cloudColor: "#402a20",
      atmosphere: "#ff5a20",
      atmosphereStrength: 0.6,
      emissive: "#ff5a14",
      bumpiness: 0.8,
    },
  },
  {
    id: "barren",
    name: "Barren World",
    giant: false,
    zones: { hot: 3, temperate: 2, cold: 3, outer: 1 },
    moonWeight: 4,
    radius: [0.2, 0.9],
    habitability: 0.03,
    size: [1, 2],
    richness: { metals: 1.6, energy: 0.3, research: 0.3, exotics: 0.02 },
    ringChance: 0.02,
    description: "An airless, crater-scarred rock. Ideal for mining.",
    visual: {
      style: "rocky",
      palette: ["#2a2826", "#4a4642", "#6e6a64", "#8f8a82", "#b4afa6"],
      seaLevel: 0,
      iceCaps: 1,
      clouds: 0,
      cloudColor: "#ffffff",
      atmosphere: null,
      atmosphereStrength: 0,
      bumpiness: 1,
    },
  },
  {
    id: "martian",
    name: "Rust World",
    giant: false,
    zones: { hot: 1, temperate: 2, cold: 4 },
    moonWeight: 1,
    radius: [0.3, 0.9],
    habitability: 0.15,
    size: [1, 3],
    richness: { metals: 1.5, energy: 0.5, research: 0.6, exotics: 0.02 },
    ringChance: 0.03,
    description: "Iron-oxide deserts beneath a thin, dusty atmosphere.",
    visual: {
      style: "rocky",
      palette: ["#3b1a10", "#6b2e1a", "#a4502c", "#c77a4a", "#efd9c7"],
      seaLevel: 0,
      iceCaps: 0.85,
      clouds: 0.05,
      cloudColor: "#f3d9c4",
      atmosphere: "#e0906a",
      atmosphereStrength: 0.45,
      bumpiness: 0.8,
    },
  },
  {
    id: "crystal",
    name: "Crystalline World",
    giant: false,
    zones: { cold: 0.6, outer: 0.6, hot: 0.3 },
    moonWeight: 0.15,
    radius: [0.4, 1.0],
    habitability: 0,
    size: [1, 2],
    richness: { metals: 0.8, energy: 0.8, research: 1.5, exotics: 1.5 },
    ringChance: 0.1,
    description: "Vast lattices of self-organising crystal. Rich in exotic matter.",
    visual: {
      style: "crystal",
      palette: ["#1b1030", "#3a2366", "#6a4bb3", "#9d8cf0", "#e6f4ff"],
      seaLevel: 0,
      iceCaps: 1,
      clouds: 0,
      cloudColor: "#ffffff",
      atmosphere: "#b49cff",
      atmosphereStrength: 0.5,
      emissive: "#8fe8ff",
      bumpiness: 0.9,
    },
  },
  {
    id: "ice_dwarf",
    name: "Ice Dwarf",
    giant: false,
    zones: { outer: 4, cold: 1 },
    moonWeight: 2.5,
    radius: [0.15, 0.4],
    habitability: 0,
    size: [0, 0],
    richness: { metals: 0.5, energy: 0.8, research: 0.5, exotics: 0.05 },
    ringChance: 0,
    description: "A small world of frozen nitrogen, methane and water ice.",
    visual: {
      style: "rocky",
      palette: ["#5a4a3e", "#8a7664", "#c2ae96", "#e2d6c6", "#fbf7f2"],
      seaLevel: 0,
      iceCaps: 0.6,
      clouds: 0,
      cloudColor: "#ffffff",
      atmosphere: null,
      atmosphereStrength: 0,
      bumpiness: 0.6,
    },
  },
  {
    id: "gas_giant",
    name: "Gas Giant",
    giant: true,
    zones: { cold: 5, outer: 5, temperate: 0.6 },
    moonWeight: 0,
    radius: [7, 12],
    habitability: 0,
    size: [0, 0],
    richness: { metals: 0, energy: 2, research: 0.5, exotics: 0.05 },
    ringChance: 0.45,
    description: "A banded giant of hydrogen and helium. Its upper atmosphere holds helium-3.",
    visual: {
      style: "gas",
      palette: ["#6b4a30", "#a67c52", "#d9b98c", "#efe0c4", "#b0603a"],
      seaLevel: 0,
      iceCaps: 1,
      clouds: 0,
      cloudColor: "#ffffff",
      atmosphere: "#f2d6b0",
      atmosphereStrength: 0.6,
      bumpiness: 0,
    },
  },
  {
    id: "hot_jupiter",
    name: "Hot Jupiter",
    giant: true,
    zones: { hot: 1.6 },
    moonWeight: 0,
    radius: [9, 14],
    habitability: 0,
    size: [0, 0],
    richness: { metals: 0, energy: 3, research: 0.8, exotics: 0.1 },
    ringChance: 0.05,
    description: "A gas giant roasting close to its star, its night side glowing with heat.",
    visual: {
      style: "gas",
      palette: ["#2a0f0a", "#5a1e10", "#8a3a1a", "#c46a2a", "#ff9a3a"],
      seaLevel: 0,
      iceCaps: 1,
      clouds: 0,
      cloudColor: "#ffffff",
      atmosphere: "#ff7a3a",
      atmosphereStrength: 0.9,
      emissive: "#ff5a1a",
      bumpiness: 0,
    },
  },
  {
    id: "ice_giant",
    name: "Ice Giant",
    giant: true,
    zones: { outer: 5, cold: 1.5 },
    moonWeight: 0,
    radius: [3.5, 5],
    habitability: 0,
    size: [0, 0],
    richness: { metals: 0.2, energy: 1.6, research: 0.6, exotics: 0.05 },
    ringChance: 0.3,
    description: "A cold world of water, ammonia and methane ices under a serene blue haze.",
    visual: {
      style: "gas",
      palette: ["#0e3050", "#1f5f8a", "#3f8fb8", "#7cc6dc", "#c8f0f5"],
      seaLevel: 0,
      iceCaps: 1,
      clouds: 0,
      cloudColor: "#ffffff",
      atmosphere: "#7fe0ff",
      atmosphereStrength: 0.9,
      bumpiness: 0,
    },
  },
];

export const PLANET_TYPE_MAP: Record<string, PlanetType> = Object.fromEntries(
  PLANET_TYPES.map((p) => [p.id, p]),
);

export function planetType(id: string): PlanetType {
  const t = PLANET_TYPE_MAP[id];
  if (!t) throw new Error(`Unknown planet type ${id}`);
  return t;
}

export interface BeltType {
  id: string;
  name: string;
  zones: Partial<Record<Zone, number>>;
  colors: [string, string];
  metalness: number;
  richness: { metals: number; energy: number; research: number; exotics: number };
  description: string;
}

export const BELT_TYPES: BeltType[] = [
  {
    id: "silicate",
    name: "Silicate Belt",
    zones: { hot: 2, temperate: 3, cold: 3 },
    colors: ["#6f655a", "#a09280"],
    metalness: 0.05,
    richness: { metals: 1.2, energy: 0, research: 0.2, exotics: 0 },
    description: "Stony S-type asteroids of silicate rock.",
  },
  {
    id: "carbonaceous",
    name: "Carbonaceous Belt",
    zones: { temperate: 2, cold: 3, outer: 1 },
    colors: ["#2e2b29", "#4a4541"],
    metalness: 0.02,
    richness: { metals: 0.9, energy: 0.4, research: 0.4, exotics: 0 },
    description: "Dark C-type asteroids rich in carbon, water and organics.",
  },
  {
    id: "metallic",
    name: "Metallic Belt",
    zones: { hot: 2, temperate: 2, cold: 1 },
    colors: ["#7c7a78", "#b8b2a8"],
    metalness: 0.85,
    richness: { metals: 2.2, energy: 0, research: 0.2, exotics: 0.05 },
    description: "Dense M-type asteroids — shattered iron-nickel cores of ancient protoplanets.",
  },
  {
    id: "icy",
    name: "Icy Belt",
    zones: { outer: 5, cold: 2 },
    colors: ["#b8cbd8", "#eef6fb"],
    metalness: 0,
    richness: { metals: 0.5, energy: 1, research: 0.3, exotics: 0 },
    description: "A Kuiper-like belt of frozen volatiles and dirty ice.",
  },
  {
    id: "crystalline",
    name: "Crystalline Belt",
    zones: { cold: 0.4, outer: 0.4 },
    colors: ["#6b54c8", "#aee9ff"],
    metalness: 0.4,
    richness: { metals: 0.8, energy: 0.3, research: 1, exotics: 1.4 },
    description: "Rare, shimmering fragments of crystalline exotic matter.",
  },
];

export const BELT_TYPE_MAP: Record<string, BeltType> = Object.fromEntries(
  BELT_TYPES.map((b) => [b.id, b]),
);

export function beltType(id: string): BeltType {
  const t = BELT_TYPE_MAP[id];
  if (!t) throw new Error(`Unknown belt type ${id}`);
  return t;
}
