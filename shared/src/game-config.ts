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
 * Other game costs
 */
export const GAME_COSTS = {
  GATE_EXPLORATION: {
    energy: 1,
    alloy: 0,
    science: 0,
  },
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
  TUNNEL_OVERTAKE: {
    energy: 3,
    alloy: 0,
    science: 10,
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
