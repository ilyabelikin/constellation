// Technology tree. Effects are additive modifiers aggregated per empire in
// modifiers.ts. Costs scale steeply by tier to give a long progression curve.

export type Branch = "industry" | "energy" | "society" | "physics" | "propulsion" | "weapons" | "defense";

export interface TechEffects {
  metals?: number;
  energy?: number;
  credits?: number;
  research?: number;
  exotics?: number;
  popGrowth?: number;
  habitability?: number;
  popCapacity?: number;
  speed?: number;
  tunnelSpeed?: number;
  armor?: number;
  shields?: number;
  hull?: number;
  shipBuildSpeed?: number;
  shipCost?: number;
  stationOutput?: number;
  solar?: number;
  defense?: number;
  repair?: number;
  artifacts?: number;
  garrison?: number;
}

export interface TechDef {
  id: string;
  name: string;
  branch: Branch;
  tier: number;
  cost: number;
  requires: string[];
  effects: TechEffects;
  unlocks?: string[]; // hull / building / station ids (for display)
  description: string;
  exoticsCost?: number;
}

export const BRANCH_INFO: Record<Branch, { name: string; color: string }> = {
  industry: { name: "Industry", color: "#f0a35a" },
  energy: { name: "Energy", color: "#ffd84a" },
  society: { name: "Society", color: "#6ee08c" },
  physics: { name: "Physics", color: "#7ab8ff" },
  propulsion: { name: "Propulsion", color: "#54e0e0" },
  weapons: { name: "Weapons", color: "#ff6b6b" },
  defense: { name: "Defense", color: "#b48cff" },
};

export const TIER_COST = [0, 900, 3000, 7000, 15000, 35000, 250000];

function t(
  id: string,
  name: string,
  branch: Branch,
  tier: number,
  requires: string[],
  effects: TechEffects,
  description: string,
  unlocks?: string[],
  extra: Partial<TechDef> = {},
): TechDef {
  return { id, name, branch, tier, cost: TIER_COST[tier], requires, effects, description, unlocks, ...extra };
}

export const TECHS: TechDef[] = [
  // Industry
  t("deep_core_mining", "Deep Core Mining", "industry", 1, [], { metals: 0.2 }, "Bore into planetary mantles for richer ore. +20% metals."),
  t("orbital_refineries", "Orbital Refineries", "industry", 2, ["deep_core_mining"], { stationOutput: 0.25 }, "Process ore in orbit. +25% output from all stations."),
  t("automated_foundries", "Automated Foundries", "industry", 2, ["deep_core_mining"], {}, "Unlocks the Foundry: turns energy into metals.", ["foundry"]),
  t("nanofabrication", "Nanofabrication", "industry", 3, ["automated_foundries"], { shipBuildSpeed: 0.3, shipCost: 0.1 }, "Molecular assemblers. Ships build 30% faster and cost 10% less."),
  t("stellar_forges", "Stellar Forges", "industry", 4, ["nanofabrication", "orbital_refineries"], { metals: 0.3, stationOutput: 0.25 }, "Harness stellar plasma for smelting. +30% metals, +25% station output."),
  // Energy
  t("fusion_power", "Fusion Power", "energy", 1, [], { energy: 0.2 }, "Compact fusion reactors. +20% energy."),
  t("solar_swarms", "Solar Swarms", "energy", 2, ["fusion_power"], { solar: 0.5 }, "Mass-produced collector satellites. +50% solar array output."),
  t("exotic_matter", "Exotic Matter Physics", "energy", 2, ["fusion_power"], { exotics: 0.25 }, "Contain negative-mass matter. Unlocks Exotic Extractors.", ["exotic_extractor", "exotic_refinery"]),
  t("dyson_swarm", "Dyson Swarm", "energy", 3, ["solar_swarms"], { solar: 0.5 }, "Enclose a star in collectors. Unlocks the Dyson Swarm station.", ["dyson_swarm"]),
  t("zero_point", "Zero-Point Energy", "energy", 4, ["dyson_swarm", "quantum_computing"], { energy: 0.4, research: 0.1 }, "Tap the quantum vacuum. +40% energy, +10% research."),
  // Society
  t("hydroponics", "Hydroponic Farms", "society", 1, [], { popGrowth: 0.4, popCapacity: 0.1 }, "Vertical farming. +40% population growth, +10% capacity."),
  t("ground_forces", "Ground Forces", "society", 1, [], { garrison: 2 }, "Orbital drop troops. Unlocks Troop Transports.", ["transport"]),
  t("xeno_adaptation", "Xeno-Adaptation", "society", 2, ["hydroponics"], { habitability: 0.15 }, "Gene-tailored colonists. +15% habitability on all worlds."),
  t("galactic_market", "Galactic Market", "society", 2, ["hydroponics"], { credits: 0.25 }, "Interstellar commerce. +25% credits."),
  t("arcologies", "Arcologies", "society", 3, ["xeno_adaptation"], { popCapacity: 0.2 }, "Self-contained city towers. +20% capacity, unlocks Habitat Domes.", ["habitat"]),
  t("terraforming", "Terraforming", "society", 4, ["arcologies"], { habitability: 0.25 }, "Reshape entire worlds. +25% habitability."),
  // Physics
  t("quantum_computing", "Quantum Computing", "physics", 2, [], { research: 0.15 }, "Qubit arrays. +15% research, unlocks Quantum Labs.", ["quantum_lab"]),
  t("xenoarchaeology", "Xenoarchaeology", "physics", 2, [], { artifacts: 2 }, "Decode precursor ruins. Artifact research stations produce triple output."),
  t("subspace_sensors", "Subspace Sensors", "physics", 1, [], { research: 0.1 }, "Probe the fabric of space. +10% research."),
  t(
    "ascension",
    "Ascension Project",
    "physics",
    6,
    ["zero_point", "terraforming", "xenoarchaeology"],
    {},
    "Transcend physical form. Completing this project wins the game.",
    undefined,
    { exoticsCost: 600 },
  ),
  // Propulsion
  t("ion_drives", "Ion Drives", "propulsion", 1, [], { speed: 0.2 }, "Efficient electric propulsion. +20% sublight speed."),
  t("tunnel_stabilization", "Tunnel Stabilization", "propulsion", 2, ["ion_drives"], { tunnelSpeed: 0.4 }, "Calm tunnel turbulence. Tunnel transits 40% faster."),
  t("fusion_torch", "Fusion Torch Drives", "propulsion", 3, ["ion_drives"], { speed: 0.25 }, "High-thrust fusion torches. +25% sublight speed."),
  t("warp_bubbles", "Warp Bubbles", "propulsion", 4, ["fusion_torch", "tunnel_stabilization"], { speed: 0.2, tunnelSpeed: 0.5 }, "Bend space-time. +20% speed and +50% tunnel speed."),
  // Weapons
  t("lasers_2", "Focused Lasers", "weapons", 1, [], {}, "Shorter wavelengths. Laser damage +30%."),
  t("railguns", "Improved Railguns", "weapons", 1, [], {}, "Superconducting rails. Railgun damage +30%."),
  t("guided_missiles", "Guided Missiles", "weapons", 1, [], {}, "Smarter seekers. Missile damage +30%."),
  t("frigates", "Frigate Hulls", "weapons", 1, [], {}, "Unlocks the Frigate.", ["frigate"]),
  t("destroyers", "Destroyer Hulls", "weapons", 2, ["frigates"], {}, "Unlocks the Destroyer.", ["destroyer"]),
  t("point_defense_2", "Flak Batteries", "weapons", 2, ["guided_missiles"], {}, "Point defense damage and interception +30%."),
  t("mass_drivers_2", "Mass Drivers", "weapons", 3, ["railguns"], {}, "Railgun damage +30%."),
  t("torpedoes", "Antimatter Torpedoes", "weapons", 3, ["guided_missiles"], {}, "Missile damage +30%."),
  t("cruisers", "Cruiser Hulls", "weapons", 3, ["destroyers"], {}, "Unlocks the Cruiser.", ["cruiser"]),
  t("plasma_weapons", "Plasma Weapons", "weapons", 4, ["lasers_2"], {}, "Magnetically bottled plasma. Laser and lance damage +30%."),
  t("battleships", "Battleship Hulls", "weapons", 4, ["cruisers"], {}, "Unlocks the Battleship.", ["battleship"]),
  t("titans", "Titan Hulls", "weapons", 5, ["battleships", "plasma_weapons"], {}, "Unlocks the Titan.", ["titan"]),
  // Defense
  t("composite_armor", "Composite Armor", "defense", 1, [], { armor: 0.25 }, "Layered ceramic-metal plating. +25% armor."),
  t("deflector_shields", "Deflector Shields", "defense", 2, ["composite_armor"], { shields: 0.3, defense: 0.2 }, "Electromagnetic deflectors. +30% shields, +20% planetary defense."),
  t("planetary_fortifications", "Planetary Fortifications", "defense", 2, [], { defense: 0.5, garrison: 2 }, "Hardened bunkers. +50% planetary defense, unlocks Fortress.", ["fortress"]),
  t("damage_control", "Damage Control", "defense", 2, ["composite_armor"], { repair: 1 }, "Automated repair drones. Ships repair twice as fast."),
  t("hardened_shields", "Hardened Shields", "defense", 3, ["deflector_shields"], { shields: 0.35 }, "Multi-phase shielding. +35% shields."),
  t("neutronium_armor", "Neutronium Armor", "defense", 4, ["hardened_shields"], { armor: 0.4, hull: 0.15 }, "Degenerate-matter plating. +40% armor, +15% hull."),
];

export const TECH_MAP: Record<string, TechDef> = Object.fromEntries(TECHS.map((x) => [x.id, x]));

export function techDef(id: string): TechDef {
  const d = TECH_MAP[id];
  if (!d) throw new Error(`Unknown tech ${id}`);
  return d;
}
