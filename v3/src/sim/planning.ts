// Planning helpers used by the UI (and usable by AI): where to build a colony
// ship for a given target world, and roughly when it would arrive.

import { HULL_MAP } from "./data/ships";
import { canColonize, hullCost } from "./economy";
import { findRoute } from "./fleets";
import { modifiers } from "./modifiers";
import { canAfford } from "./util";
import type { GameState, Resources } from "./types";

export interface ShipyardOption {
  colonyId: string;
  colonyName: string;
  systemId: string;
  cost: Partial<Resources>;
  affordable: boolean;
  queueDays: number;
  buildDays: number;
  travelDays: number;
  etaDays: number;
  jumps: number;
}

/** Rough in-system crossing time used for ETA estimates (days). */
const SYSTEM_CROSSING_DAYS = 8;

/**
 * Shipyards that could build a colony ship for `bodyId`, best (earliest
 * arrival among affordable ones) first. Only routes the empire knows count.
 */
export function colonyShipOptions(state: GameState, empireId: string, bodyId: string): ShipyardOption[] {
  const empire = state.empires[empireId];
  const body = state.bodies[bodyId];
  if (!empire || !body || !canColonize(empire, body)) return [];
  const hull = HULL_MAP.colony;
  const speedMult = 1 + modifiers(empire).shipBuildSpeed;
  const cost = hullCost(state, empire, "colony");
  const out: ShipyardOption[] = [];
  for (const c of Object.values(state.colonies)) {
    if (c.empireId !== empireId || !c.buildings.some((b) => b.type === "shipyard")) continue;
    const route = findRoute(state, c.systemId, body.systemId, empire);
    if (!route) continue;
    const queueDays = c.queue.reduce((sum, q) => sum + Math.max(0, q.total - q.progress) / (q.kind === "ship" ? speedMult : 1), 0);
    const buildDays = hull.buildDays / speedMult;
    const tunnelDays = route.reduce((sum, t) => sum + state.tunnels[t].travelDays, 0);
    const travelDays = tunnelDays + SYSTEM_CROSSING_DAYS * (route.length + 1);
    out.push({
      colonyId: c.id,
      colonyName: c.name,
      systemId: c.systemId,
      cost,
      affordable: canAfford(empire.resources, cost),
      queueDays,
      buildDays,
      travelDays,
      etaDays: queueDays + buildDays + travelDays,
      jumps: route.length,
    });
  }
  out.sort((a, b) => Number(b.affordable) - Number(a.affordable) || a.etaDays - b.etaDays);
  return out;
}
