// Aggregates technology + species bonuses into one modifier bag per empire.

import { HULL_MAP, WEAPONS, type HullDef, type WeaponFamily } from "./data/ships";
import { PIRATE_SPECIES, SPECIES_MAP, BUILDING_MAP, STATION_MAP } from "./data/structures";
import { TECH_MAP, type TechEffects } from "./data/techs";
import type { Empire } from "./types";

export interface Modifiers extends Required<TechEffects> {
  damage: number;
  weaponTier: Record<WeaponFamily, number>;
  techs: Set<string>;
}

// Completed techs only ever grow, so (empire object, tech count) identifies a modifier set.
const cache = new WeakMap<Empire, { n: number; species: string; mods: Modifiers }>();

function blank(): Modifiers {
  return {
    metals: 0,
    energy: 0,
    credits: 0,
    research: 0,
    exotics: 0,
    popGrowth: 0,
    habitability: 0,
    popCapacity: 0,
    speed: 0,
    tunnelSpeed: 0,
    armor: 0,
    shields: 0,
    hull: 0,
    shipBuildSpeed: 0,
    shipCost: 0,
    stationOutput: 0,
    solar: 0,
    defense: 0,
    repair: 0,
    artifacts: 0,
    garrison: 0,
    damage: 0,
    weaponTier: { laser: 0, railgun: 0, missile: 0, pd: 0, lance: 0 },
    techs: new Set(),
  };
}

export function modifiers(empire: Empire): Modifiers {
  const hit = cache.get(empire);
  if (hit && hit.n === empire.research.completed.length && hit.species === empire.speciesId) return hit.mods;
  const m = blank();
  const species = empire.isPirate ? PIRATE_SPECIES : SPECIES_MAP[empire.speciesId];
  if (species) {
    const b = species.bonuses;
    m.credits += b.credits ?? 0;
    m.metals += b.metals ?? 0;
    m.energy += b.energy ?? 0;
    m.research += b.research ?? 0;
    m.damage += b.damage ?? 0;
    m.popGrowth += b.popGrowth ?? 0;
  }
  for (const id of empire.research.completed) {
    const t = TECH_MAP[id];
    if (!t) continue;
    m.techs.add(id);
    for (const [k, v] of Object.entries(t.effects) as [keyof TechEffects, number][]) {
      (m[k] as number) += v;
    }
  }
  for (const fam of Object.keys(WEAPONS) as WeaponFamily[]) {
    m.weaponTier[fam] = WEAPONS[fam].tiers.filter((tid) => m.techs.has(tid)).length;
  }
  if (empire.isPirate) {
    // Raiders scale with time via their own "tech"; see pirates.ts.
  }
  cache.set(empire, { n: empire.research.completed.length, species: empire.speciesId, mods: m });
  return m;
}

export function hasTech(empire: Empire, techId: string | null): boolean {
  if (!techId) return true;
  return empire.research.completed.includes(techId);
}

export function hullUnlocked(empire: Empire, hullId: string): boolean {
  const h = HULL_MAP[hullId];
  return !!h && hasTech(empire, h.requires);
}

export function buildingUnlocked(empire: Empire, id: string): boolean {
  const b = BUILDING_MAP[id];
  return !!b && hasTech(empire, b.requires);
}

export function stationUnlocked(empire: Empire, id: string): boolean {
  const s = STATION_MAP[id];
  return !!s && s.requires !== "__never__" && hasTech(empire, s.requires);
}

export interface ShipStats {
  hull: number;
  armor: number;
  shields: number;
  speed: number;
  evasion: number;
}

export function shipStats(empire: Empire, hull: HullDef): ShipStats {
  const m = modifiers(empire);
  return {
    hull: hull.hull * (1 + m.hull),
    armor: hull.armor * (1 + m.armor),
    shields: hull.shields * (1 + m.shields),
    speed: hull.speed * (1 + m.speed),
    evasion: hull.evasion,
  };
}

export function weaponDamage(empire: Empire, family: WeaponFamily): number {
  const m = modifiers(empire);
  return WEAPONS[family].damage * (1 + 0.3 * m.weaponTier[family]) * (1 + m.damage);
}

export function clearModifierCache(empire?: Empire): void {
  if (empire) cache.delete(empire);
}
