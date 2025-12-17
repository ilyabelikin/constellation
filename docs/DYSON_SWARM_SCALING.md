# Dyson Swarm Scaling System

## Overview

Dyson swarms scale dynamically with star size using a **logarithmic scaling system** that balances playability with realism. All stars support between **12 and 320 swarms**, with the exact capacity determined by the star's physical radius.

## Key Constants

| Constant                          | Value            | Description                                       |
| --------------------------------- | ---------------- | ------------------------------------------------- |
| `DYSON_PANEL_SIZE`                | 0.02 solar radii | Physical size of each solar panel (constant)      |
| `DYSON_ORBIT_DISTANCE_MULTIPLIER` | 1.08             | How far panels orbit from star surface (8% above) |
| `PANELS_PER_SWARM`                | 3                | Number of panels deployed per swarm launch        |
| `DYSON_SWARM_ENERGY_PER_DAY`      | 1                | Energy generated per swarm per day                |
| `MIN_DYSON_SWARMS_PER_STAR`       | 12               | Minimum swarms (smallest stars)                   |
| `MAX_DYSON_SWARMS_PER_STAR`       | 320              | Maximum swarms (largest stars)                    |

## Cost & Yield

- **Cost per swarm**: 10 alloy (defined in `GAME_COSTS.DYSON_SWARM`)
- **Energy per swarm**: 1 energy/day base (applies to the whole swarm, not per panel)
- **With Nano Arrays tech**: +10% energy (1.1 energy/day per swarm)

## Calculation Formula

The system uses **logarithmic scaling** to distribute capacity more evenly across different star types:

```typescript
function calculateMaxDysonSwarms(starRadiusInSolarRadii: number): number {
  const MIN_STAR_RADIUS = 0.008; // White Dwarf (smallest)
  const MAX_STAR_RADIUS = 80; // Red Supergiant (largest)

  // Logarithmic scaling
  const minLog = Math.log(MIN_STAR_RADIUS);
  const maxLog = Math.log(MAX_STAR_RADIUS);
  const radiusLog = Math.log(Math.max(MIN_STAR_RADIUS, starRadiusInSolarRadii));

  // Normalize to 0-1 range
  const normalized = (radiusLog - minLog) / (maxLog - minLog);

  // Scale to 12-320 range
  const maxSwarms = Math.floor(
    MIN_DYSON_SWARMS_PER_STAR +
      (MAX_DYSON_SWARMS_PER_STAR - MIN_DYSON_SWARMS_PER_STAR) * normalized
  );

  return Math.max(
    MIN_DYSON_SWARMS_PER_STAR,
    Math.min(MAX_DYSON_SWARMS_PER_STAR, maxSwarms)
  );
}
```

## Example Star Capacities

| Star Type        | Radius (solar radii) | Max Swarms | Total Energy/Day |
| ---------------- | -------------------- | ---------- | ---------------- |
| White Dwarf      | 0.01                 | 19         | 19               |
| Red Dwarf (M)    | 0.4                  | 142        | 142              |
| Yellow Dwarf (G) | 1.0                  | 173        | 173              |
| Blue Giant (O)   | 10.0                 | 250        | 250              |
| Red Supergiant   | 50.0                 | 304        | 304              |

### Why Logarithmic Scaling?

Star radii vary over an **extreme range** (0.008 to 80 solar radii = 10,000x difference!). Linear scaling would create:

- Tiny stars: Almost no capacity (unusable)
- Giant stars: Millions of swarms (game-breaking)

Logarithmic scaling compresses this range to create **meaningful progression** while keeping all stars playable:

- Small stars (red/white dwarfs): Still viable with 12-150 swarms
- Medium stars (sun-like): Good capacity with ~170 swarms
- Large stars (giants): Excellent capacity with 250-320 swarms

## Visual Representation

- All panels orbit at the same distance from their star (8% above surface)
- Panels are constant physical size across all stars
- Panels use **Fibonacci sphere distribution** to prevent overlap
- Distribution is based on `MAX_DYSON_SWARMS_PER_STAR * PANELS_PER_SWARM = 960` total panel slots
- Each swarm claims 3 sequential slots, ensuring no overlap even at max capacity
- All panels rotate as a single rigid shell with a 50-hour orbital period

## Game Balance

This system creates interesting strategic decisions:

1. **Small stars** (red/white dwarfs): Limited but viable energy sources, common in the galaxy
2. **Medium stars** (sun-like): Solid energy production, good balance of capacity and availability
3. **Large stars** (giants/supergiants): Premium energy targets, rare but valuable

The 12-320 range ensures:

- Every star is useful (minimum 12 swarms = 12 energy/day)
- No star breaks the economy (maximum 320 swarms = 320 energy/day)
- Meaningful progression as players expand to larger star systems
- Resource costs scale proportionally (320 swarms = 3,200 alloy investment)

## Technology Bonuses

- **Nano Arrays**: +10% energy from all dyson swarm panels (applies when deployed)
- Future techs could increase efficiency, reduce costs, or expand the capacity range
