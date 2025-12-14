# Unit Costs and Tech Modifiers System

This document explains the new centralized unit cost system and how to modify or extend it with technology upgrades in the future.

## Overview

All unit and structure costs, stats, and maintenance are now centralized in `shared/src/game-config.ts`. This makes it easy to:

1. **Balance the game** - Change costs in one place
2. **Add tech modifiers** - Apply bonuses from research
3. **Track costs for refunds** - Refund resources when units are destroyed
4. **Per-day maintenance** - Track ongoing costs for structures

## Current Unit Costs

### Attack Ships

**Cost:**
- Energy: 1
- Alloy: 25

**Stats:**
- Health: 100 HP
- Attack: 15 base damage (randomized 10-30 in combat)
- Hit Chance: 60%

**Refund on Destruction:**
- ✅ Energy is refunded
- ❌ Alloy is NOT refunded (ship is destroyed)

### Defense Platforms

**Cost:**
- Energy: 1
- Alloy: 10

**Maintenance:**
- 0.1 alloy per day

**Stats:**
- Health: 100 HP
- Attack: 15 base damage (randomized 10-30 in combat)
- Hit Chance: 60%

**Refund on Destruction:**
- ✅ Energy is refunded
- ❌ Initial alloy cost is NOT refunded
- ✅ Accumulated maintenance costs are refunded

## How It Works

### 1. Database Schema

The database tracks costs for each unit:

**gate_defenses table:**
- `energy_cost` - Energy paid to build
- `alloy_cost` - Alloy paid to build
- `maintenance_alloy_per_day` - Daily alloy cost
- `last_maintenance_at` - Last time maintenance was paid

**gate_attacks table:**
- `energy_cost_per_ship` - Energy paid per ship
- `alloy_cost_per_ship` - Alloy paid per ship

### 2. Building Units

When building a defense platform:

```typescript
import { DEFENSE_PLATFORM_CONFIG } from "@constellation/shared";

const ENERGY_COST = DEFENSE_PLATFORM_CONFIG.cost.energy;
const ALLOY_COST = DEFENSE_PLATFORM_CONFIG.cost.alloy;
const MAINTENANCE_PER_DAY = DEFENSE_PLATFORM_CONFIG.maintenance?.alloy ?? 0;

// Deduct resources
db.deductPlayerEnergy(playerId, ENERGY_COST);
db.deductPlayerAlloy(playerId, ALLOY_COST);

// Create platform with cost tracking
db.createGateDefense(
  defenseId,
  gateId,
  playerId,
  systemId,
  ENERGY_COST,
  ALLOY_COST,
  MAINTENANCE_PER_DAY,
  DEFENSE_PLATFORM_CONFIG.stats.health
);
```

### 3. Maintenance Processing

Every 10 seconds, the server processes maintenance costs:

```typescript
// In websocket-server.ts, startTimeSaveInterval()
this.db.processDefenseMaintenance(timeState.currentTime);
```

The `processDefenseMaintenance` function:
- Checks each defense platform
- Calculates days elapsed since last payment
- Deducts alloy per day from owner
- Updates `last_maintenance_at` timestamp

### 4. Destruction and Refunds

When a unit is destroyed:

```typescript
// Get defense info before deleting
const defenseInfo = db.getGateDefenseById(defenseId);

// Delete the platform
db.deleteGateDefense(defenseId);

// Refund energy (if configured)
if (DEFENSE_PLATFORM_CONFIG.refundOnDestruction.energy) {
  db.addPlayerEnergy(defenseInfo.playerId, defenseInfo.energyCost);
}

// Refund maintenance (if configured)
if (DEFENSE_PLATFORM_CONFIG.refundOnDestruction.maintenance) {
  const daysElapsed = (Date.now() - defenseInfo.lastMaintenanceAt) / (24 * 60 * 60 * 1000);
  const totalMaintenancePaid = Math.floor(daysElapsed) * defenseInfo.maintenanceAlloyPerDay;
  db.addPlayerAlloy(defenseInfo.playerId, totalMaintenancePaid);
}
```

### 5. Resource Income Display

Player's `alloyPerDay` now includes maintenance costs:

```typescript
// In getPlayerById()
const defenses = this.getGateDefensesByPlayer(playerId);
const alloyCostFromDefenses = defenses.reduce(
  (sum, def) => sum + def.maintenanceAlloyPerDay,
  0
);

const alloyPerDay = alloyFromMining + alloyFromColonies - alloyCostFromDefenses;
```

## Adding Technology Modifiers

To add technology upgrades in the future:

### 1. Store Player Tech Bonuses

Add to `Player` interface:

```typescript
export interface Player {
  // ... existing fields
  techBonuses?: {
    shipCostReduction?: { energy: number; alloy: number; science: number };
    shipStatBonus?: { healthMultiplier: number; attackMultiplier: number };
    defenseCostReduction?: { energy: number; alloy: number };
    maintenanceReduction?: { alloy: number };
  };
}
```

### 2. Apply Tech Bonuses When Building

```typescript
import { 
  ATTACK_SHIP_CONFIG, 
  calculateUnitCost,
  calculateUnitStats 
} from "@constellation/shared";

// Get player's tech bonuses
const player = db.getPlayerById(playerId);
const techBonuses = player.techBonuses;

// Calculate modified cost
const actualCost = calculateUnitCost(
  ATTACK_SHIP_CONFIG.cost,
  techBonuses?.shipCostReduction
);

// Calculate modified stats
const actualStats = calculateUnitStats(
  ATTACK_SHIP_CONFIG.stats,
  techBonuses?.shipStatBonus
);

// Now use actualCost and actualStats...
```

### 3. Example: Advanced Shipbuilding Tech

```typescript
// When player researches "Advanced Shipbuilding"
const player = db.getPlayerById(playerId);
player.techBonuses = {
  shipCostReduction: { energy: 0, alloy: 5, science: 0 }, // 5 less alloy
  shipStatBonus: { 
    healthMultiplier: 1.2,  // 20% more HP
    attackMultiplier: 1.1    // 10% more attack
  }
};
db.updatePlayer(player);

// Now attack ships cost:
// - Energy: 1 (unchanged)
// - Alloy: 20 (was 25, now 25 - 5 = 20)
// 
// And have stats:
// - Health: 120 HP (was 100, now 100 * 1.2 = 120)
// - Attack: 16.5 (was 15, now 15 * 1.1 = 16.5)
```

## Editing Game Balance

To change unit costs, edit `shared/src/game-config.ts`:

```typescript
export const ATTACK_SHIP_CONFIG: UnitConfig = {
  cost: {
    energy: 2,    // Changed from 1 to 2
    alloy: 30,    // Changed from 25 to 30
    science: 0,
  },
  stats: {
    health: 150,  // Changed from 100 to 150
    attack: 20,   // Changed from 15 to 20
    defense: 0,
    hitChance: 0.7, // Changed from 0.6 to 0.7
  },
  // ... rest stays the same
};
```

All references throughout the codebase will automatically use the new values.

## Files Modified

**Shared:**
- `shared/src/game-config.ts` - New centralized config file
- `shared/src/index.ts` - Export game config
- `shared/src/types.ts` - Updated `GateDefense` interface with cost tracking

**Server:**
- `server/src/database/schema.ts` - Added cost tracking columns
- `server/src/database/queries.ts` - Added cost tracking, maintenance processing, refunds
- `server/src/network/websocket-server.ts` - Uses config for costs, handles refunds

## Future Enhancements

### 1. Technology Research System
- Add `technologies` table to database
- Track player's researched techs
- Apply cumulative bonuses from multiple techs

### 2. Species Traits
- Add racial bonuses to unit costs/stats
- Store in `species` table
- Apply when building units

### 3. Special Buildings
- Add "Shipyard" that reduces ship costs
- Add "Defense Grid" that boosts platform stats
- Store building bonuses in system/planet data

### 4. Dynamic Pricing
- Make costs vary based on resource scarcity
- Add supply/demand mechanics
- Track market prices in database

## Testing

After making changes:

1. **Start the server:** Check logs for migration success
2. **Build defense platforms:** Verify costs are correct
3. **Wait for maintenance:** Check alloy deduction after 1+ day
4. **Destroy platforms:** Verify refunds are correct
5. **Build attack ships:** Verify costs and refunds on destruction
6. **Check player income:** Verify maintenance costs show in alloyPerDay

## Migration Notes

The schema migrations will automatically run when the server starts:
- Adds `energy_cost`, `alloy_cost` columns to `gate_defenses`
- Adds `maintenance_alloy_per_day`, `last_maintenance_at` columns
- Adds `energy_cost_per_ship`, `alloy_cost_per_ship` to `gate_attacks`
- Defaults are set for existing records (backward compatible)

No manual database changes required!

