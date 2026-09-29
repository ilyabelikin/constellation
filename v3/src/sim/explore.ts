// Auto-explore: a fleet with the flag set surveys the nearest unexplored
// system it knows a route to, then the next, until nothing is left in reach.
// Systems it had to flee from are left alone for a while.

import { threatsIn } from "./evasion";
import { findRoute, issueOrder } from "./fleets";
import type { Fleet, GameState } from "./types";
import { fleetRef, log } from "./util";

/** Days an explorer keeps away from a system it was chased out of. */
export const EXPLORE_AVOID_DAYS = 150;

export function stepExplore(state: GameState): void {
  for (const f of Object.values(state.fleets)) {
    if (!f.autoExplore || !f.ships.length) continue;
    const empire = state.empires[f.empireId];
    if (!empire?.alive) continue;
    if (f.evading) {
      // Chased off: give up on that system for now (and drop the resumed trip there).
      if (f.exploreTarget) {
        (f.exploreAvoid ??= {})[f.exploreTarget] = state.day + EXPLORE_AVOID_DAYS;
        f.queue = (f.queue ?? []).filter((q) => q.systemId !== f.exploreTarget);
        f.exploreTarget = undefined;
      }
      continue;
    }
    if (f.order || f.transit || f.battleId || f.queue?.length || !f.systemId) continue;
    // Evasive explorers stay sheltered while hostile warships are about.
    if (f.stance === "evasive" && threatsIn(state, f.empireId, f.systemId).length) continue;
    const target = nextTarget(state, f);
    if (!target) {
      f.autoExplore = false;
      f.exploreTarget = undefined;
      if (empire.isPlayer) log(state, "info", `${f.name} has surveyed every system it can reach; auto-explore is off.`, empire.id, f.systemId, fleetRef(f));
      continue;
    }
    if (issueOrder(state, f, { kind: "move", systemId: target, bodyId: state.systems[target].starIds[0] })) {
      (f.exploreAvoid ??= {})[target] = state.day + EXPLORE_AVOID_DAYS;
      continue;
    }
    f.exploreTarget = target;
  }
}

/** The nearest unexplored system (fewest jumps, then shortest trip) no other explorer of ours is bound for. */
function nextTarget(state: GameState, f: Fleet): string | null {
  const empire = state.empires[f.empireId];
  const claimed = new Set(
    Object.values(state.fleets)
      .filter((o) => o !== f && o.empireId === f.empireId)
      .map((o) => (o.autoExplore ? o.exploreTarget : o.order?.systemId))
      .filter((x): x is string => !!x),
  );
  let best: string | null = null;
  let bestScore = Infinity;
  for (const id of Object.keys(state.systems)) {
    if (empire.explored[id] || claimed.has(id) || (f.exploreAvoid?.[id] ?? -1) > state.day) continue;
    const route = findRoute(state, f.systemId!, id, empire);
    if (!route) continue;
    const days = route.reduce((a, t) => a + state.tunnels[t].travelDays, 0);
    const score = route.length * 1000 + days;
    if (score < bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}
