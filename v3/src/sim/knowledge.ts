// What each empire can know: contacts with other empires and the systems it
// can currently observe. Used for fog of war in the UI, fair AI decisions,
// the per-player network snapshots, and the LLM briefings.

import { systemOwnerMap } from "./economy";
import { logTo } from "./util";
import type { GameState } from "./types";

/** Systems where an empire has eyes right now: a fleet, colony or station. */
export function sensorSystems(state: GameState, empireId: string): Set<string> {
  const out = new Set<string>();
  for (const f of Object.values(state.fleets)) if (f.empireId === empireId && f.systemId && f.ships.length) out.add(f.systemId);
  for (const c of Object.values(state.colonies)) if (c.empireId === empireId) out.add(c.systemId);
  for (const st of Object.values(state.stations)) if (st.empireId === empireId) out.add(st.systemId);
  return out;
}

export function hasMet(state: GameState, a: string, b: string): boolean {
  if (a === b) return true;
  const ea = state.empires[a];
  const eb = state.empires[b];
  if (!ea || !eb) return false;
  if (ea.isPirate || eb.isPirate) return true; // everyone knows the raiders exist
  return !!ea.contacts?.[b];
}

/**
 * Establish contact between empires that share a system, or when one has
 * surveyed a system the other owns. Emits a first-contact log entry.
 */
export function updateContacts(state: GameState): string[][] {
  const newContacts: string[][] = [];
  const present = new Map<string, Set<string>>();
  const note = (sys: string, emp: string) => {
    let set = present.get(sys);
    if (!set) present.set(sys, (set = new Set()));
    set.add(emp);
  };
  for (const f of Object.values(state.fleets)) if (f.systemId && f.ships.length) note(f.systemId, f.empireId);
  for (const c of Object.values(state.colonies)) note(c.systemId, c.empireId);
  for (const st of Object.values(state.stations)) note(st.systemId, st.empireId);
  const owners = systemOwnerMap(state);
  const meet = (a: string, b: string) => {
    const ea = state.empires[a];
    const eb = state.empires[b];
    if (!ea || !eb || a === b || ea.isPirate || eb.isPirate || !ea.alive || !eb.alive) return;
    if (ea.contacts?.[b]) return;
    (ea.contacts ??= {})[b] = true;
    (eb.contacts ??= {})[a] = true;
    newContacts.push([a, b]);
    logTo(state, "diplomacy", `First contact: the ${ea.name} and the ${eb.name} have met.`, [a, b]);
  };
  for (const set of present.values()) {
    const ids = [...set];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) meet(ids[i], ids[j]);
  }
  for (const e of Object.values(state.empires)) {
    if (e.isPirate) continue;
    for (const sys of Object.keys(e.explored)) {
      const o = owners[sys];
      if (o && o !== e.id) meet(e.id, o);
    }
  }
  return newContacts;
}
