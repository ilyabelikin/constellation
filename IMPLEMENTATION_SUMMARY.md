# Unit Costs Implementation Summary

## What Was Implemented

✅ **Attack Ships Cost**: 1 energy + 25 alloy per ship
✅ **Defense Platforms Cost**: 1 energy + 10 alloy per platform
✅ **Platform Maintenance**: 0.1 alloy per day (deducted automatically)
✅ **Energy Refunds**: Energy refunded when ships/platforms are destroyed
✅ **Maintenance Refunds**: Accumulated maintenance refunded when platforms are destroyed
✅ **Resource Income Display**: Maintenance costs now show in player's alloyPerDay
✅ **Centralized Configuration**: All costs/stats in one file for easy editing
✅ **Tech Modifier Ready**: Helper functions prepared for future tech bonuses

## New Files Created

1. **`shared/src/game-config.ts`** - Centralized unit configuration
   - `ATTACK_SHIP_CONFIG` - Ship costs, stats, refund rules
   - `DEFENSE_PLATFORM_CONFIG` - Platform costs, stats, maintenance, refund rules
   - `COMBAT_CONFIG` - Combat parameters
   - Helper functions for applying tech modifiers

2. **`docs/UNIT_COSTS_AND_TECH.md`** - Complete documentation
   - How the system works
   - How to edit costs
   - How to add tech modifiers in the future
   - Examples and testing guide

## Files Modified

### Database Schema (`server/src/database/schema.ts`)
- Added cost tracking columns to `gate_defenses` table:
  - `energy_cost`, `alloy_cost`, `maintenance_alloy_per_day`, `last_maintenance_at`
- Added cost tracking columns to `gate_attacks` table:
  - `energy_cost_per_ship`, `alloy_cost_per_ship`
- Migrations handle existing databases automatically

### Database Queries (`server/src/database/queries.ts`)
- Updated `createGateDefense()` to track costs
- Updated `createGateAttack()` to track costs
- Added `getGateDefenseById()` for refund calculations
- Added `getGateDefensesByPlayer()` for maintenance calculations
- Added `processDefenseMaintenance()` to deduct daily costs
- Updated `getPlayerById()` to include maintenance in `alloyPerDay`

### WebSocket Server (`server/src/network/websocket-server.ts`)
- Imports game config constants
- Uses `ATTACK_SHIP_CONFIG.cost` for attack costs
- Uses `DEFENSE_PLATFORM_CONFIG.cost` for defense costs
- Calls `processDefenseMaintenance()` every 10 seconds
- Refunds energy when ships are destroyed
- Refunds energy + maintenance when platforms are destroyed

### Shared Types (`shared/src/types.ts`)
- Updated `GateDefense` interface with cost tracking fields

### Shared Exports (`shared/src/index.ts`)
- Exports game config module

## How It Works

### Building a Defense Platform
1. Player clicks "Fortify Gate"
2. Server checks: `player.energy >= 1` and `player.alloy >= 10`
3. Deducts 1 energy + 10 alloy
4. Creates platform in database with costs tracked
5. Platform requires 0.1 alloy/day maintenance

### Maintenance Processing
Every 10 seconds:
1. Server gets all active defense platforms
2. For each platform, calculates days since last payment
3. Deducts `0.1 * days` alloy from owner
4. Updates `last_maintenance_at` timestamp

### Platform Destruction
1. Attack ship destroys platform in combat
2. Server gets platform info (costs paid)
3. Refunds 1 energy to owner
4. Calculates accumulated maintenance (days * 0.1)
5. Refunds maintenance alloy to owner
6. Deletes platform from database

### Attack Ship Destruction
1. Defense platform destroys attack ship
2. Refunds 1 energy to attacker
3. Alloy (25) is NOT refunded (ship destroyed)

## Changing Costs in the Future

Edit `shared/src/game-config.ts`:

```typescript
export const ATTACK_SHIP_CONFIG: UnitConfig = {
  cost: {
    energy: 2,    // Change this
    alloy: 30,    // Change this
    science: 0,
  },
  stats: {
    health: 150,  // Change this
    attack: 20,   // Change this
    hitChance: 0.7, // Change this
  },
  // ...
};
```

All code automatically uses new values!

## Adding Tech Modifiers Later

```typescript
// When player researches "Advanced Shipbuilding"
import { calculateUnitCost, ATTACK_SHIP_CONFIG } from "@constellation/shared";

const modifiedCost = calculateUnitCost(
  ATTACK_SHIP_CONFIG.cost,
  { alloy: -5 } // 5 less alloy cost
);

// Now modifiedCost.alloy = 20 (was 25)
```

See `docs/UNIT_COSTS_AND_TECH.md` for complete examples.

## Database Migrations

Migrations run automatically on server start:
- Existing platforms get default values (backward compatible)
- New columns added to both `gate_defenses` and `gate_attacks`
- No manual intervention needed

## Testing Checklist

✅ Defense platforms cost 1 energy + 10 alloy
✅ Attack ships cost 1 energy + 25 alloy  
✅ Maintenance deducts 0.1 alloy per day per platform
✅ Player's alloyPerDay shows negative from maintenance
✅ Energy refunded when units destroyed
✅ Maintenance refunded when platforms destroyed
✅ Combat still works with new system
✅ No linter errors

## Ready for Production

All changes are:
- ✅ Backward compatible (migrations handle existing data)
- ✅ Type-safe (full TypeScript)
- ✅ Documented (extensive documentation added)
- ✅ Future-proof (ready for tech modifiers)
- ✅ Centralized (easy to modify)

The system is production-ready and can be deployed immediately!

