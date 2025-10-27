# Life and Habitability System

## Overview

The planet generation system now includes life detection and habitability scoring for potential terraforming or life seeding operations.

## Core Concepts

### Life Levels

Planets can have five different levels of life development:

1. **None** - No life detected
2. **Microbial** - Single-celled organisms, bacteria
3. **Simple** - Multicellular life, plants, simple animals
4. **Complex** - Advanced ecosystems, diverse fauna
5. **Intelligent** - Sentient civilizations

### Habitability Score (0-1)

A measure of how suitable a planet is for supporting life, considering:
- Distance from star (habitable zone)
- Planet type characteristics
- Atmospheric presence
- Star luminosity

This score is useful for:
- Identifying terraforming candidates
- Prioritizing life seeding operations
- Understanding why certain planets developed life

## Calculation Details

### Habitability Calculation

Habitability is calculated from three main factors:

**1. Distance from Star (60% weight)**
```
Game-friendly Habitable Zone:
- Inner edge: 0.5 AU × √(star_luminosity)
- Outer edge: 3.0 AU × √(star_luminosity)
- Optimal: midpoint between edges

Score inside zone: 0.6 - 1.0 (best at optimal distance)
Score outside zone: 0.0 - 0.6 (decreases with distance)
```

**2. Planet Type Base Habitability (40% weight)**
- Terrestrial: 0.9 (ideal for life)
- Ocean: 0.8 (water worlds)
- Mega-Terrestrial: 0.75 (heavy gravity)
- Desert: 0.35 (harsh but possible)
- Ice: 0.2 (cold extremophiles)
- Rocky: 0.15 (minimal life)
- Lava: 0.1 (too hot)
- Barren: 0.05 (nearly impossible)
- Gas/Ice Giants: 0.0 (no solid surface)

**3. Atmospheric Modifiers**
- With atmosphere: +20% bonus (capped at 1.0)
- Without atmosphere: -50% penalty

### Life Generation

Life generation uses two-stage probability:

**Stage 1: Does life exist?**
```
final_life_chance = planet_life_chance × habitability
```

Each planet type has a base life chance (e.g., Terrestrial: 85%, Ocean: 65%, Desert: 25%)

**Stage 2: What level did it develop to?**

Development probabilities scale with habitability:

| Habitability | Typical Outcome |
|--------------|----------------|
| < 0.3 | 90% Microbial, 10% Simple |
| 0.3 - 0.5 | 70% Microbial, 25% Simple, 5% Complex |
| 0.5 - 0.7 | 40% Microbial, 35% Simple, 23% Complex, 2% Intelligent |
| > 0.7 | 20% Microbial, 30% Simple, 45% Complex, 5% Intelligent |

## Planet Type Life Characteristics

### High Life Potential
- **Terrestrial** (85% chance): Most Earth-like, optimal for all life levels
- **Mega-Terrestrial** (70% chance): Heavy gravity limits but doesn't prevent life
- **Ocean** (65% chance): Water abundant, but some too deep/cold for complex life

### Moderate Life Potential
- **Desert** (25% chance): Mars-like extremophiles, mostly microbial
- **Ice** (8% chance): Frozen subsurface oceans might harbor simple life
- **Rocky** (5% chance): Rare extremophiles in protected niches

### Minimal Life Potential
- **Lava** (2% chance): Too hot, only heat-loving bacteria possible
- **Barren** (0% chance): No atmosphere, no protection
- **Giants** (0% chance): No solid surface for life

## Star Type Impact

Different star types have different habitable zones:

| Star Type | Luminosity Factor | Habitable Zone |
|-----------|------------------|----------------|
| Brown Dwarf (T) | 0.000001 | 0.0005 - 0.003 AU |
| Red Dwarf (M) | 0.001 | 0.016 - 0.095 AU |
| Orange Dwarf (K) | 0.1 | 0.16 - 0.95 AU |
| Yellow Dwarf (G) | 0.6 | 0.39 - 2.3 AU |
| White (F) | 2.5 | 0.79 - 4.7 AU |
| Blue Giant (O) | 30000 | 86 - 520 AU |

*Note: These zones are game-friendly and wider than astronomical reality to work with the Titius-Bode planet spacing*

## Design Philosophy

### Game-Friendly vs Realistic

The system prioritizes visual gameplay over strict astronomical accuracy:

1. **Wider Habitable Zones**: Makes more planets potentially habitable
2. **Distance Tolerance**: Planets slightly outside zones can still have life
3. **Atmospheric Importance**: Strong emphasis on atmospheres (visible in-game)
4. **Variety**: Ensures interesting mix of lifeless and living worlds

### Balancing Factors

- **Terrestrial Bias**: Earth-like planets strongly favor life (but not 100%)
- **Ocean Uncertainty**: Water worlds have good chance but not guaranteed
- **Distance Matters**: A desert planet in habitable zone > terrestrial far from star
- **Star Type Scaling**: Habitable zones scale with star luminosity

## Technical Implementation

### Types (shared/src/types.ts)
```typescript
lifeLevel?: LifeLevelType;  // Current life development
habitability?: number;       // 0-1 suitability score
luminosity?: number;         // Star luminosity (for CelestialBodyType stars)
```

### Configuration (server/src/generation/planet-types.json)
Each planet type has:
- `baseHabitability`: Intrinsic suitability (0-1)
- `lifeChance`: Probability of life generation (0-1)

### Generation (server/src/generation/system-generator.ts)
- `calculateHabitabilityFromDistance()`: Distance-based scoring
- `determineLifeLevel()`: Two-stage life determination
- Planet generation integrates both calculations

## Future Expansion Ideas

1. **Moons**: Apply life generation to large moons in habitable zones
2. **Life Events**: Track when life emerged (age of biosphere)
3. **Terraforming**: Track habitability improvements over time
4. **Life Signatures**: Different biosignatures for different life levels
5. **Climate**: Add temperature, pressure for more detailed habitability
6. **Tidal Locking**: Red dwarf planets might be tidally locked (affects habitability)

## Viewing Life Data

The life and habitability information is now part of each planet's data:

```typescript
planet.lifeLevel      // "none" | "microbial" | "simple" | "complex" | "intelligent"
planet.habitability   // 0.0 to 1.0
```

You can display this in the UI when showing planet details. For example:
- Show a "biosphere" indicator for planets with life
- Display habitability bar for terraforming planning
- Color-code planets by life level in the system view

