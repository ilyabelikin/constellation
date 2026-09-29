// Evasive ships (scouts, constructors, colony ships and transports by default)
// never pick fights. When hostile warships show up in their system they break
// off, fall back towards home (a friendly colony whose system looks safe),
// and pick up the job they dropped afterwards.

import { fleetArmed, isHostile } from "./combat";
import { findRoute, issueOrder } from "./fleets";
import type { Fleet, GameState, QueuedOrder } from "./types";
import { fleetRef, log } from "./util";

export function threatsIn(state: GameState, empireId: string, systemId: string): Fleet[] {
  return Object.values(state.fleets).filter(
    (o) => o.systemId === systemId && o.ships.length > 0 && isHostile(state, empireId, o.empireId) && fleetArmed(o),
  );
}

/** Where to fall back to: under our own guns here, else the nearest safe colony. */
function refuge(state: GameState, fleet: Fleet): { systemId: string; bodyId: string } | null {
  const empire = state.empires[fleet.empireId];
  const here = fleet.systemId!;
  const own = Object.values(state.colonies).filter((c) => c.empireId === fleet.empireId);
  const guarded = own.find((c) => c.systemId === here && c.defense > 0);
  if (guarded) return { systemId: here, bodyId: guarded.bodyId };
  let best: { systemId: string; bodyId: string; hops: number } | null = null;
  for (const c of own) {
    if (c.systemId === here) continue;
    if (threatsIn(state, fleet.empireId, c.systemId).length) continue;
    const route = findRoute(state, here, c.systemId, empire);
    if (!route) continue;
    const hops = route.length - (c.capital ? 0.5 : 0);
    if (!best || hops < best.hops) best = { systemId: c.systemId, bodyId: c.bodyId, hops };
  }
  return best;
}

/** Each step: evasive fleets facing hostile warships fall back to safety. */
export function stepEvasion(state: GameState): void {
  for (const fleet of Object.values(state.fleets)) {
    if (fleet.stance !== "evasive" || fleet.civilian || !fleet.systemId || fleet.transit || !fleet.ships.length) continue;
    if (fleet.evading) {
      // Still on the retreat? Otherwise it reached safety (the queue resumes the dropped job).
      if (fleet.order?.kind === "move" && fleet.order.bodyId === fleet.evading) continue;
      fleet.evading = undefined;
    }
    if (!threatsIn(state, fleet.empireId, fleet.systemId).length) continue;
    const to = refuge(state, fleet);
    if (!to) continue;
    const o = fleet.order;
    if (o && o.kind === "move" && o.systemId === to.systemId && o.bodyId === to.bodyId) continue;
    if (!o && fleet.orbitBodyId === to.bodyId && fleet.systemId === to.systemId) continue; // already sheltering
    // Put the interrupted job back at the front of the queue.
    if (o) {
      const { route: _r, work: _w, ...rest } = o;
      void _r;
      void _w;
      (fleet.queue ??= []).unshift(rest as QueuedOrder);
    }
    if (issueOrder(state, fleet, { kind: "move", systemId: to.systemId, bodyId: to.bodyId })) continue;
    fleet.evading = to.bodyId;
    const empire = state.empires[fleet.empireId];
    if (empire.isPlayer)
      log(state, "danger", `${fleet.name} is falling back to ${state.systems[to.systemId].name} to evade hostile warships.`, empire.id, fleet.systemId, fleetRef(fleet));
  }
}
