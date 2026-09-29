// Planning helpers used by the UI (and usable by AI): where to build a colony
// ship for a given target world, and roughly when it would arrive.

import { HULL_MAP } from "./data/ships";
import { canColonize, commandCapacity, commandUsed, garrison, hullCost } from "./economy";
import { findRoute } from "./fleets";
import { modifiers } from "./modifiers";
import { canAfford } from "./util";
import type { Empire, GameState, Resources } from "./types";

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

/** Invasions bring enough troops to win even on a poor landing (the roll is 0.75–1.25). */
const INVASION_MARGIN = 1.35;

/** Troop transports needed to take `colonyId` against its current garrison. */
export function transportsNeeded(state: GameState, empire: Empire, colonyId: string): number {
  const colony = state.colonies[colonyId];
  if (!colony) return 0;
  const perShip = (HULL_MAP.transport.troops ?? 1) * (1 + modifiers(empire).damage);
  return Math.max(1, Math.ceil((garrison(state, colony) * INVASION_MARGIN) / perShip));
}

export interface InvasionOption extends ShipyardOption {
  count: number;
  /** Why this shipyard cannot take the job (queue room, fleet command), if it can't. */
  blocked?: string;
}

/** Shipyards that could build and send an invasion force against `colonyId`, best first. */
export function invasionOptions(state: GameState, empireId: string, colonyId: string): InvasionOption[] {
  const empire = state.empires[empireId];
  const target = state.colonies[colonyId];
  if (!empire || !target) return [];
  const hull = HULL_MAP.transport;
  const count = transportsNeeded(state, empire, colonyId);
  const speedMult = 1 + modifiers(empire).shipBuildSpeed;
  const one = hullCost(state, empire, "transport");
  const cost: Partial<Resources> = {};
  for (const [k, v] of Object.entries(one)) cost[k as keyof Resources] = (v ?? 0) * count;
  const commandLeft = commandCapacity(state, empire) - commandUsed(state, empire);
  const out: InvasionOption[] = [];
  for (const c of Object.values(state.colonies)) {
    if (c.empireId !== empireId || !c.buildings.some((b) => b.type === "shipyard")) continue;
    const route = findRoute(state, c.systemId, target.systemId, empire);
    if (!route) continue;
    const queueDays = c.queue.reduce((sum, q) => sum + Math.max(0, q.total - q.progress) / (q.kind === "ship" ? speedMult : 1), 0);
    const buildDays = (hull.buildDays * count) / speedMult;
    const tunnelDays = route.reduce((sum, t) => sum + state.tunnels[t].travelDays, 0);
    const travelDays = tunnelDays + SYSTEM_CROSSING_DAYS * (route.length + 1);
    const blocked =
      c.queue.length + count > 8 ? "Not enough room in its build queue" : hull.command * count > commandLeft ? "Not enough fleet command capacity" : undefined;
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
      count,
      ...(blocked ? { blocked } : {}),
    });
  }
  const usable = (o: InvasionOption) => o.affordable && !o.blocked;
  out.sort((a, b) => Number(usable(b)) - Number(usable(a)) || a.etaDays - b.etaDays);
  return out;
}
