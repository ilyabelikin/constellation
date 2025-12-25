/**
 * Centralized game configuration for units, structures, and costs
 * This file makes it easy to balance the game and apply tech modifiers
 */

export interface UnitCost {
  energy: number;
  alloy: number;
  science: number;
}

export interface UnitStats {
  health: number;
  attack: number;
  defense: number;
  hitChance: number;
}

export interface MaintenanceCost {
  energy: number;
  alloy: number;
  science: number;
}

export interface UnitConfig {
  cost: UnitCost;
  stats: UnitStats;
  maintenance?: MaintenanceCost; // Per day cost (optional)
  refundOnDestruction: {
    energy: boolean; // Refund energy cost?
    alloy: boolean; // Refund alloy cost?
    science: boolean; // Refund science cost?
    maintenance: boolean; // Refund accumulated maintenance?
  };
}

/**
 * Attack Ship Configuration
 * Fast attack ships used to assault enemy gates
 */
export const ATTACK_SHIP_CONFIG: UnitConfig = {
  cost: {
    energy: 1,
    alloy: 15,
    science: 0,
  },
  stats: {
    health: 100,
    attack: 15, // Base damage (will be randomized 10-30 in combat)
    defense: 0,
    hitChance: 0.6, // 60% chance to hit
  },
  refundOnDestruction: {
    energy: true, // Energy is refunded
    alloy: false, // Alloy is not refunded (ship is destroyed)
    science: false,
    maintenance: false,
  },
};

/**
 * Defense Platform Configuration
 * Stationary defense platforms that protect gates
 */
export const DEFENSE_PLATFORM_CONFIG: UnitConfig = {
  cost: {
    energy: 1,
    alloy: 10,
    science: 0,
  },
  stats: {
    health: 150,
    attack: 10, // Base damage (will be randomized 10-30 in combat)
    defense: 5,
    hitChance: 0.7, // 70% chance to hit
  },
  maintenance: {
    energy: 0,
    alloy: 0.02, // 0.02 alloy per day
    science: 0,
  },
  refundOnDestruction: {
    energy: true, // Energy is refunded
    alloy: false, // Initial alloy cost is not refunded
    science: false,
    maintenance: true, // Daily maintenance cost is refunded
  },
};

/**
 * Mining Installation Configuration
 * Automated mining operations on asteroids and moons
 */
export const MINING_INSTALLATION_CONFIG: UnitConfig = {
  cost: {
    energy: 1,
    alloy: 1,
    science: 0,
  },
  stats: {
    health: 0, // Not applicable for mining installations
    attack: 0,
    defense: 0,
    hitChance: 0,
  },
  refundOnDestruction: {
    energy: true, // Energy is refunded
    alloy: true, // Alloy can be recovered from dismantling
    science: false, // Research knowledge is not refunded
    maintenance: false, // No maintenance for mining installations
  },
};

/**
 * Helium-3 Extraction Configuration
 * Rare energy-producing installations on gas giants, moons, and airless bodies
 * Produces 1 energy per day, requires 5 alloy to build
 */
export const HELIUM3_EXTRACTION_CONFIG: UnitConfig = {
  cost: {
    energy: 0,
    alloy: 6,
    science: 0,
  },
  stats: {
    health: 0, // Not applicable for Helium-3 extraction
    attack: 0,
    defense: 0,
    hitChance: 0,
  },
  refundOnDestruction: {
    energy: false, // No energy cost
    alloy: false, // Alloy can be recovered from dismantling
    science: false, // No science cost
    maintenance: false, // No maintenance for Helium-3 extraction
  },
};

/**
 * Starting resources for new players
 */
export const STARTING_RESOURCES = {
  energy: 6,
  alloy: 18,
  science: 6,
} as const;

/**
 * Other game costs
 */
export const GAME_COSTS = {
  COLONY_ESTABLISHMENT: {
    energy: 3,
    alloy: 15,
    science: 5,
  },
  GATE_CAPTURE: {
    energy: 0,
    alloy: 10,
    science: 0,
  },
  TUNNEL_POWER_ON: {
    energy: 1,
    alloy: 0,
    science: 0,
  },
  TUNNEL_OVERTAKE: {
    energy: 3,
    alloy: 0,
    science: 10,
  },
  TUNNEL_OVERCHARGE: {
    energy: 10,
    alloy: 0,
    science: 10,
  },
  DYSON_SWARM: {
    energy: 0,
    alloy: 8,
    science: 0,
  },
} as const;

/**
 * Combat configuration
 */
export const COMBAT_CONFIG = {
  COMBAT_INTERVAL: 500, // ms between combat rounds
  DAMAGE_MIN: 10,
  DAMAGE_MAX: 30,
} as const;

/**
 * Format a cost object as a string with emoji symbols, hiding zero values
 * @param cost - The cost object with energy, alloy, and science
 * @param options - Formatting options
 * @returns Formatted cost string (e.g., "1 ⚡, 15 ⛏" or "10 ⛏, 5 🔬")
 */
export function formatCost(
  cost: UnitCost | { energy: number; alloy: number; science: number },
  options?: {
    showParentheses?: boolean; // Wrap in parentheses (default: true)
    separator?: string; // Separator between items (default: ", ")
  }
): string {
  const showParentheses = options?.showParentheses ?? true;
  const separator = options?.separator ?? ", ";

  const parts: string[] = [];

  if (cost.energy > 0) {
    parts.push(`${cost.energy} ⚡`);
  }
  if (cost.alloy > 0) {
    parts.push(`${cost.alloy} ⛏`);
  }
  if (cost.science > 0) {
    parts.push(`${cost.science} 🔬`);
  }

  const formatted = parts.join(separator);
  return showParentheses && formatted ? `(${formatted})` : formatted;
}

/**
 * Helper function to calculate unit cost with tech modifiers
 * In the future, you can pass in a player's tech bonuses to modify costs
 */
export function calculateUnitCost(
  baseCost: UnitCost,
  modifiers?: Partial<UnitCost>
): UnitCost {
  return {
    energy: Math.max(0, baseCost.energy - (modifiers?.energy ?? 0)),
    alloy: Math.max(0, baseCost.alloy - (modifiers?.alloy ?? 0)),
    science: Math.max(0, baseCost.science - (modifiers?.science ?? 0)),
  };
}

/**
 * Helper function to calculate unit stats with tech modifiers
 * In the future, you can pass in a player's tech bonuses to modify stats
 */
export function calculateUnitStats(
  baseStats: UnitStats,
  modifiers?: {
    healthMultiplier?: number;
    attackMultiplier?: number;
    defenseBonus?: number;
    hitChanceBonus?: number;
  }
): UnitStats {
  return {
    health: baseStats.health * (modifiers?.healthMultiplier ?? 1),
    attack: baseStats.attack * (modifiers?.attackMultiplier ?? 1),
    defense: baseStats.defense + (modifiers?.defenseBonus ?? 0),
    hitChance: Math.min(
      1,
      baseStats.hitChance + (modifiers?.hitChanceBonus ?? 0)
    ),
  };
}

/**
 * Helper function to calculate maintenance cost with tech modifiers
 */
export function calculateMaintenanceCost(
  baseMaintenance: MaintenanceCost,
  modifiers?: Partial<MaintenanceCost>
): MaintenanceCost {
  return {
    energy: Math.max(0, baseMaintenance.energy - (modifiers?.energy ?? 0)),
    alloy: Math.max(0, baseMaintenance.alloy - (modifiers?.alloy ?? 0)),
    science: Math.max(0, baseMaintenance.science - (modifiers?.science ?? 0)),
  };
}

/**
 * Determine colony stage based on population
 * Centralized logic for consistent stage classification across all systems
 */
export function getColonyStage(
  population: number
):
  | "outpost"
  | "settlement"
  | "colony"
  | "developed"
  | "metropolis"
  | "ecumenopolis" {
  if (population >= 15000000000) {
    // 15B
    return "ecumenopolis";
  } else if (population >= 5000000000) {
    // 5B
    return "metropolis";
  } else if (population >= 2000000000) {
    // 2B
    return "developed";
  } else if (population >= 500000000) {
    // 500M
    return "colony";
  } else if (population >= 50000000) {
    // 50M
    return "settlement";
  } else {
    return "outpost";
  }
}

/**
 * Calculate colony resource yields based on population, specialization, and habitability
 * Uses a tiered system:
 * - Outpost (0-50M): Heavy resource consumption from the start, making colonies expensive to establish
 *   Starts at 70% of peak consumption immediately, peaks around 10M pop (balanced: -1.0 science, -0.8 alloy)
 * - Settlement (50M-100M): Transitioning to self-sufficiency, gradually becomes positive
 * - Colony+ (100M+): Produces resources, grows logarithmically with population
 */
export function calculateColonyYields(
  population: number,
  specialization: "balanced" | "research" | "industrial",
  habitabilityBonus: number
): { sciencePerDay: number; alloyPerDay: number } {
  const OUTPOST_THRESHOLD = 50000000; // 50M - Outposts drain resources below this
  const PRODUCTION_THRESHOLD = 100000000; // 100M - Significant production starts here

  if (population >= PRODUCTION_THRESHOLD) {
    // PRODUCTION PHASE: Colony produces resources after reaching 100M population
    // Production grows with population above 100M
    // Using logarithmic growth for smooth scaling
    const populationAboveThreshold = population - PRODUCTION_THRESHOLD;
    const productionMultiplier = Math.log10(populationAboveThreshold + 1) / 1.5;

    switch (specialization) {
      case "research":
        return {
          sciencePerDay:
            (0.05 + productionMultiplier * 0.15) * habitabilityBonus,
          alloyPerDay:
            (0.005 + productionMultiplier * 0.015) * habitabilityBonus,
        };
      case "industrial":
        return {
          sciencePerDay:
            (0.01 + productionMultiplier * 0.03) * habitabilityBonus,
          alloyPerDay: (0.04 + productionMultiplier * 0.12) * habitabilityBonus,
        };
      default: // balanced
        return {
          sciencePerDay:
            (0.03 + productionMultiplier * 0.09) * habitabilityBonus,
          alloyPerDay:
            (0.015 + productionMultiplier * 0.045) * habitabilityBonus,
        };
    }
  } else if (population >= OUTPOST_THRESHOLD) {
    // TRANSITION PHASE: Settlement (50M-100M) gradually becomes productive
    // Starts at 0 (sustainability at 50M), grows to small positive at 100M
    const normalizedPop =
      (population - OUTPOST_THRESHOLD) /
      (PRODUCTION_THRESHOLD - OUTPOST_THRESHOLD); // 0 to 1
    const transitionMultiplier = normalizedPop * 0.3; // Gentle growth to 30% of base production

    switch (specialization) {
      case "research":
        return {
          sciencePerDay: 0.015 * transitionMultiplier * habitabilityBonus,
          alloyPerDay: 0.002 * transitionMultiplier * habitabilityBonus,
        };
      case "industrial":
        return {
          sciencePerDay: 0.003 * transitionMultiplier * habitabilityBonus,
          alloyPerDay: 0.012 * transitionMultiplier * habitabilityBonus,
        };
      default: // balanced
        return {
          sciencePerDay: 0.009 * transitionMultiplier * habitabilityBonus,
          alloyPerDay: 0.005 * transitionMultiplier * habitabilityBonus,
        };
    }
  } else {
    // CONSUMPTION PHASE: Outpost (0-50M) drains resources from home world
    // Aggressive consumption model: starts high immediately and sustains throughout establishment
    // Consumption is most intense during early establishment, then gradually tapers as self-sufficiency grows
    const normalizedPop = population / OUTPOST_THRESHOLD; // 0 to 1

    // Use a curve that starts high (70% of peak at pop=0) and peaks at 20% progress (10M pop)
    // Then gradually decreases toward 0 at 50M as the colony becomes self-sufficient
    // Formula: baseConsumption + curveComponent
    const baseConsumptionFactor = 0.7; // 70% consumption from the start
    const curveComponent = 0.3 * Math.sin(normalizedPop * Math.PI); // Additional 30% that peaks mid-phase
    const consumptionCurve = baseConsumptionFactor + curveComponent;

    // Increased peak consumption rates - colonies are expensive to establish and maintain
    const peakConsumption = {
      research: { science: -1.2, alloy: -0.6 }, // Research outposts consume significantly more science
      industrial: { science: -0.6, alloy: -1.0 }, // Industrial outposts consume significantly more alloy
      balanced: { science: -1.0, alloy: -0.8 }, // Balanced consumes both heavily
    };

    const rates = peakConsumption[specialization] || peakConsumption.balanced;
    return {
      sciencePerDay: rates.science * consumptionCurve * habitabilityBonus,
      alloyPerDay: rates.alloy * consumptionCurve * habitabilityBonus,
    };
  }
}

/**
 * Technology configuration
 */
export interface TechnologyDefinition {
  id: string;
  name: string;
  description: string;
  scienceCost: number;
  researchDays: number; // Days required to complete research
  effects: {
    dysonSwarmEnergyBonus?: number; // Percentage bonus to energy from NEW dyson swarms
    colonyAlloyBonus?: number; // Percentage bonus to alloy from planet colonies (retroactive)
    miningInstallationBonus?: number; // Percentage bonus to alloy from mining installations on asteroids/moons (retroactive)
    shipDefenseBonus?: number; // Percentage bonus to defense of NEW ships
    defenseplatformDefenseBonus?: number; // Percentage bonus to defense of NEW defense platforms
  };
}

export const TECHNOLOGIES: Record<string, TechnologyDefinition> = {
  nano_arrays: {
    id: "nano_arrays",
    name: "Nano Arrays",
    description:
      "Advanced nanostructure arrays increase energy collection efficiency of new Dyson Swarms",
    scienceCost: 60,
    researchDays: 30,
    effects: {
      dysonSwarmEnergyBonus: 0.2, // +20%
    },
  },
  deep_mining: {
    id: "deep_mining",
    name: "Deep Mining",
    description:
      "Enhanced mining techniques increase alloy output from planet colonies by +50%.",
    scienceCost: 60,
    researchDays: 30,
    effects: {
      colonyAlloyBonus: 0.5, // +50%
    },
  },
  shields: {
    id: "shields",
    name: "Shields",
    description:
      "Advanced shielding technology increases defense of new ships and defense platforms by +30%.",
    scienceCost: 60,
    researchDays: 30,
    effects: {
      shipDefenseBonus: 0.3, // +30%
      defenseplatformDefenseBonus: 0.3, // +30%
    },
  },
  gyro_traction_beam: {
    id: "gyro_traction_beam",
    name: "Gyro Traction Beam",
    description:
      "Advanced traction beam technology increases alloy output from mining installations on asteroids and moons by +10%.",
    scienceCost: 60,
    researchDays: 30,
    effects: {
      miningInstallationBonus: 0.1, // +10%
    },
  },
};
