// Private migration: settlers leave crowded worlds on chartered liners for
// young colonies of the same empire with room to grow. Liners are civilian
// ships the player does not command; they can be caught in wars.

import { habitability, popCapacity } from "./economy";
import { findRoute, issueOrder, UNLOAD_DAYS } from "./fleets";
import { makeFleet, makeShip } from "./galaxy";
import { bodyPosition } from "./orbits";
import type { Colony, Fleet, GameState } from "./types";

/** Share of capacity above which a world is crowded enough to send settlers. */
export const CROWDED = 0.85;
/** Destinations must be below this share of their capacity. */
export const ROOMY = 0.6;
/** Colonists per liner (at most). */
export const LINER_CAPACITY = 1;
/** Days between departures from one colony. */
export const MIGRATION_INTERVAL = 30;
export { UNLOAD_DAYS };
/** Longest trip (in tunnel hops) settlers will undertake. */
const MAX_HOPS = 4;

interface Destination {
  colony: Colony;
  score: number;
}

function bestDestination(state: GameState, from: Colony): Destination | null {
  const empire = state.empires[from.empireId];
  // Settlers already en route count against a destination's free room.
  const inbound: Record<string, number> = {};
  for (const f of Object.values(state.fleets))
    if (f.civilian && f.order?.kind === "migrate" && f.order.colonyId) inbound[f.order.colonyId] = (inbound[f.order.colonyId] ?? 0) + (f.migrants ?? 0);
  let best: Destination | null = null;
  for (const c of Object.values(state.colonies)) {
    if (c.empireId !== from.empireId || c.id === from.id) continue;
    const cap = popCapacity(state, c);
    const expected = c.pop + (inbound[c.id] ?? 0);
    if (expected >= cap * ROOMY) continue;
    const route = c.systemId === from.systemId ? [] : findRoute(state, from.systemId, c.systemId, empire);
    if (!route || route.length > MAX_HOPS) continue;
    // Avoid systems where a war is being fought.
    if (Object.values(state.battles).some((b) => b.systemId === c.systemId)) continue;
    const room = cap - expected;
    const score = (room * (0.4 + habitability(empire, state.bodies[c.bodyId]))) / (1 + route.length);
    if (!best || score > best.score) best = { colony: c, score };
  }
  return best;
}

/** Daily: crowded colonies may charter a liner to a colony with room. */
export function migrationDay(state: GameState): Fleet[] {
  const launched: Fleet[] = [];
  for (const c of Object.values(state.colonies)) {
    if ((c.nextMigration ?? 0) > state.day) continue;
    const cap = popCapacity(state, c);
    if (c.pop < 3 || c.pop < cap * CROWDED) continue;
    const empire = state.empires[c.empireId];
    if (!empire || empire.isPirate || !empire.alive) continue;
    c.nextMigration = state.day + MIGRATION_INTERVAL;
    if (Object.values(state.battles).some((b) => b.systemId === c.systemId)) continue;
    const dest = bestDestination(state, c);
    if (!dest) continue;
    const settlers = Math.min(LINER_CAPACITY, c.pop - cap * 0.75);
    if (settlers < 0.2) continue;
    const fleet = makeFleet(state, empire, c.systemId, bodyPosition(state, state.bodies[c.bodyId]), `${c.name} Settlers`);
    fleet.ships.push(makeShip(state, empire, "liner", `Liner ${c.name}–${dest.colony.name}`));
    fleet.civilian = true;
    fleet.stance = "passive";
    fleet.migrants = settlers;
    fleet.orbitBodyId = c.bodyId;
    const err = issueOrder(state, fleet, { kind: "migrate", systemId: dest.colony.systemId, bodyId: dest.colony.bodyId, colonyId: dest.colony.id });
    if (err) {
      delete state.fleets[fleet.id];
      continue;
    }
    c.pop -= settlers;
    launched.push(fleet);
  }
  return launched;
}
