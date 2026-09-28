// Fleet logistics. Warships spend their stores in battle and on field
// repairs. At a friendly colony they restock from the empire's stockpile;
// away from home the nearest colony dispatches a supply tender loaded from
// the stockpile, which chases the fleet and hands over its cargo. Tenders are
// unarmed: cutting an enemy's supply lines starves their fleets.

import { fleetArmed } from "./combat";
import { findRoute, issueOrder } from "./fleets";
import { makeFleet, makeShip } from "./galaxy";
import { bodyPosition } from "./orbits";
import { shipStores, storeCapacity, supplyLevel, type Stores } from "./supplies";
import type { Empire, Fleet, GameState } from "./types";

/** Share of a ship's capacity restocked per day at a friendly colony. */
export const DOCK_REFILL_RATE = 0.3;
/** Fleets below this share of their stores call for a tender. */
export const RESUPPLY_THRESHOLD = 0.6;
/** Crew wages for a tender run (credits). */
export const TENDER_COST = 10;

const isTender = (f: Fleet) => f.order?.kind === "resupply" && !!f.supplies;

function docked(state: GameState, fleet: Fleet): boolean {
  return !!fleet.systemId && !fleet.transit && Object.values(state.colonies).some((c) => c.empireId === fleet.empireId && c.systemId === fleet.systemId);
}

function needs(fleet: Fleet): Stores {
  const n: Stores = { metals: 0, energy: 0 };
  for (const s of fleet.ships) {
    const cap = storeCapacity(s.hull);
    const st = shipStores(s);
    n.metals += Math.max(0, cap.metals - st.metals);
    n.energy += Math.max(0, cap.energy - st.energy);
  }
  return n;
}

/** Move up to `budget` of each resource into the fleet's ships (fullest-first fairness: emptiest first). */
function loadInto(fleet: Fleet, budget: Stores, perShipCap = 1): Stores {
  const used: Stores = { metals: 0, energy: 0 };
  for (const k of ["metals", "energy"] as const) {
    const ships = [...fleet.ships].sort((a, b) => shipStores(a)[k] / (storeCapacity(a.hull)[k] || 1) - shipStores(b)[k] / (storeCapacity(b.hull)[k] || 1));
    for (const s of ships) {
      const cap = storeCapacity(s.hull)[k];
      const st = shipStores(s);
      const want = Math.min(cap - st[k], cap * perShipCap, budget[k] - used[k]);
      if (want <= 0) continue;
      st[k] += want;
      used[k] += want;
    }
  }
  return used;
}

function dispatchTender(state: GameState, empire: Empire, fleet: Fleet): Fleet | null {
  const at = fleet.transit ? fleet.transit.to : fleet.systemId;
  if (!at || empire.resources.credits < TENDER_COST) return null;
  const need = needs(fleet);
  // Nearest colony (by known route) sends it.
  let best: { colonyId: string; hops: number } | null = null;
  for (const c of Object.values(state.colonies)) {
    if (c.empireId !== empire.id) continue;
    const route = c.systemId === at ? [] : findRoute(state, c.systemId, at, empire);
    if (!route) continue;
    if (!best || route.length < best.hops) best = { colonyId: c.id, hops: route.length };
  }
  if (!best) return null;
  const cargo: Stores = {
    metals: Math.floor(Math.min(need.metals, empire.resources.metals * 0.6)),
    energy: Math.floor(Math.min(need.energy, empire.resources.energy * 0.6)),
  };
  if (cargo.metals + cargo.energy < 5) return null;
  const colony = state.colonies[best.colonyId];
  const t = makeFleet(state, empire, colony.systemId, bodyPosition(state, state.bodies[colony.bodyId]), `Supply Tender ${empire.fleetCounter + 1}`);
  t.ships.push(makeShip(state, empire, "tender"));
  t.civilian = true;
  t.stance = "passive";
  t.supplies = cargo;
  if (issueOrder(state, t, { kind: "resupply", systemId: at, fleetId: fleet.id })) {
    delete state.fleets[t.id];
    return null;
  }
  empire.resources.metals -= cargo.metals;
  empire.resources.energy -= cargo.energy;
  empire.resources.credits -= TENDER_COST;
  return t;
}

/** Daily: restock docked fleets, send tenders to hungry ones, keep tenders on target. */
export function logisticsDay(state: GameState): void {
  const tenderFor = new Map<string, Fleet>();
  for (const f of Object.values(state.fleets)) if (isTender(f) && f.order!.fleetId) tenderFor.set(f.order!.fleetId, f);

  // Tenders: chase their fleet; if it is gone, the cargo returns to the stockpile.
  for (const t of tenderFor.values()) {
    const target = state.fleets[t.order!.fleetId!];
    const e = state.empires[t.empireId];
    if (!target || !target.ships.length) {
      e.resources.metals += t.supplies!.metals;
      e.resources.energy += t.supplies!.energy;
      delete state.fleets[t.id];
      continue;
    }
    const where = target.transit ? target.transit.to : target.systemId;
    if (where && where !== t.order!.systemId && !t.transit) issueOrder(state, t, { kind: "resupply", systemId: where, fleetId: target.id });
  }

  for (const empire of Object.values(state.empires)) {
    if (!empire.alive || empire.isPirate) continue;
    for (const f of Object.values(state.fleets)) {
      if (f.empireId !== empire.id || f.civilian || !f.ships.length || !fleetArmed(f)) continue;
      if (docked(state, f)) {
        if (f.battleId) continue;
        // Restock from the stockpile, a share of capacity per day.
        const budget: Stores = { metals: Math.max(0, empire.resources.metals), energy: Math.max(0, empire.resources.energy) };
        const used = loadInto(f, budget, DOCK_REFILL_RATE);
        empire.resources.metals -= used.metals;
        empire.resources.energy -= used.energy;
        if (supplyLevel(f.ships).overall > 0.5) f.dryWarned = undefined;
        continue;
      }
      if (supplyLevel(f.ships).overall >= RESUPPLY_THRESHOLD || tenderFor.has(f.id)) continue;
      const t = dispatchTender(state, empire, f);
      if (t) tenderFor.set(f.id, t);
    }
  }
}

/** A tender reached its fleet: hand over the cargo; whatever doesn't fit goes home. */
export function deliverSupplies(state: GameState, tender: Fleet): void {
  const target = tender.order?.fleetId ? state.fleets[tender.order.fleetId] : undefined;
  const cargo = tender.supplies ?? { metals: 0, energy: 0 };
  const e = state.empires[tender.empireId];
  const used = target ? loadInto(target, cargo) : { metals: 0, energy: 0 };
  e.resources.metals += cargo.metals - used.metals;
  e.resources.energy += cargo.energy - used.energy;
  if (target && supplyLevel(target.ships).overall > 0.5) target.dryWarned = undefined;
  delete state.fleets[tender.id];
}
