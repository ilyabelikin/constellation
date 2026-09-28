// Ship stores: what munitions and spares each hull carries, and what firing
// and repairs cost. Kinetic weapons (railguns, missiles, point defence) and
// repairs use metals; beam weapons (lasers, lances) burn energy cells.

import { HULL_MAP, SLOT_MULT, type WeaponFamily, type WeaponMount } from "./data/ships";
import type { Ship } from "./types";

export type StoreKind = "metals" | "energy";
export interface Stores {
  metals: number;
  energy: number;
}

/** Resource and amount one shot of an S-size mount uses (scaled by mount size). */
export const SHOT_COST: Record<WeaponFamily, { res: StoreKind; amount: number }> = {
  laser: { res: "energy", amount: 0.6 },
  lance: { res: "energy", amount: 3 },
  railgun: { res: "metals", amount: 0.8 },
  missile: { res: "metals", amount: 2.5 },
  pd: { res: "metals", amount: 0.15 },
};
/** Shots per mount a full magazine holds. */
export const SHOTS_CARRIED = 40;
/** Metals of spare parts per point of hull or armour repaired away from a shipyard. */
export const REPAIR_METALS_PER_HP = 0.05;

export function shotCost(m: WeaponMount): { res: StoreKind; amount: number } {
  const c = SHOT_COST[m.family];
  return { res: c.res, amount: c.amount * (SLOT_MULT[m.size] ?? 1) };
}

/** Full stores for a hull (unarmed hulls carry none). */
export function storeCapacity(hullId: string): Stores {
  const hull = HULL_MAP[hullId];
  const cap: Stores = { metals: 0, energy: 0 };
  if (!hull || !hull.weapons.length) return cap;
  for (const w of hull.weapons) {
    const c = shotCost(w);
    cap[c.res] += c.amount * SHOTS_CARRIED;
  }
  cap.metals += hull.hull * 0.15; // spare parts for field repairs
  return cap;
}

/** A ship's stores (older saves start full). */
export function shipStores(ship: Ship): Stores {
  return (ship.stores ??= { ...storeCapacity(ship.hull) });
}

/** Share of capacity left across a set of ships (1 = full; unarmed fleets count as full). */
export function supplyLevel(ships: Ship[]): { metals: number; energy: number; overall: number } {
  let cm = 0, ce = 0, sm = 0, se = 0;
  for (const s of ships) {
    const cap = storeCapacity(s.hull);
    const st = shipStores(s);
    cm += cap.metals;
    ce += cap.energy;
    sm += Math.min(st.metals, cap.metals);
    se += Math.min(st.energy, cap.energy);
  }
  const metals = cm > 0 ? sm / cm : 1;
  const energy = ce > 0 ? se / ce : 1;
  return { metals, energy, overall: cm + ce > 0 ? (sm + se) / (cm + ce) : 1 };
}
