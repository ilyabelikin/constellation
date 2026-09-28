import { Rng } from "./rng";
import type { Fleet, GameEventKind, GameLogEntry, GameState, LogRef, Resources } from "./types";

export function nextId(state: GameState, prefix: string): string {
  state.idCounter += 1;
  return `${prefix}${state.idCounter.toString(36)}`;
}

/** Run `fn` with an Rng bound to the state's RNG and write the state back. */
export function withRng<T>(state: GameState, fn: (rng: Rng) => T): T {
  const rng = new Rng(state.rngState);
  const out = fn(rng);
  state.rngState = rng.state;
  return out;
}

export function log(
  state: GameState,
  kind: GameEventKind,
  text: string,
  empireId: string | null,
  systemId?: string,
  ref?: LogRef,
): void {
  state.log.push({ day: state.day, kind, text, empireId, systemId, ...(ref ? { ref } : {}) });
  if (state.log.length > 600) state.log.splice(0, state.log.length - 600);
}

/** Log an event only for the given empires (duplicates and unknown ids are ignored). */
export function logTo(
  state: GameState,
  kind: GameEventKind,
  text: string,
  audience: Iterable<string>,
  systemId?: string,
  ref?: LogRef,
): void {
  const ids = [...new Set(audience)].filter((id) => state.empires[id]);
  if (!ids.length) return;
  state.log.push({ day: state.day, kind, text, empireId: null, audience: ids, systemId, ...(ref ? { ref } : {}) });
  if (state.log.length > 600) state.log.splice(0, state.log.length - 600);
}

/** Log reference to a fleet where it is now. */
export function fleetRef(fleet: Fleet): LogRef | undefined {
  return fleet.systemId ? { kind: "fleet", id: fleet.id, systemId: fleet.systemId, pos: { ...fleet.pos } } : undefined;
}

/** Log reference to a planet, moon, belt or star. */
export function bodyRef(state: GameState, bodyId: string): LogRef | undefined {
  const b = state.bodies[bodyId];
  return b ? { kind: "body", id: b.id, systemId: b.systemId } : undefined;
}

/** Whether `empireId` may see a log entry. */
export function canSeeLog(entry: GameLogEntry, empireId: string): boolean {
  if (entry.audience) return entry.audience.includes(empireId);
  return entry.empireId === null || entry.empireId === empireId;
}

/** Empires with eyes in a system: a fleet, colony or station there. */
export function witnesses(state: GameState, systemId: string): string[] {
  const out = new Set<string>();
  for (const f of Object.values(state.fleets)) if (f.systemId === systemId && f.ships.length) out.add(f.empireId);
  for (const c of Object.values(state.colonies)) if (c.systemId === systemId) out.add(c.empireId);
  for (const st of Object.values(state.stations)) if (st.systemId === systemId) out.add(st.empireId);
  return [...out];
}

/** Empires that have met `empireId` (plus the empire itself). */
export function acquaintances(state: GameState, empireId: string): string[] {
  const out = [empireId];
  for (const e of Object.values(state.empires)) if (e.contacts?.[empireId]) out.push(e.id);
  return out;
}

export function emptyResources(): Resources {
  return { credits: 0, metals: 0, energy: 0, exotics: 0 };
}

export function canAfford(have: Resources, cost: Partial<Resources>, mult = 1): boolean {
  for (const k of Object.keys(cost) as (keyof Resources)[]) {
    if ((have[k] ?? 0) + 1e-9 < (cost[k] ?? 0) * mult) return false;
  }
  return true;
}

export function pay(have: Resources, cost: Partial<Resources>, mult = 1): void {
  for (const k of Object.keys(cost) as (keyof Resources)[]) have[k] -= (cost[k] ?? 0) * mult;
}

export function refund(have: Resources, cost: Partial<Resources>, mult = 1): void {
  for (const k of Object.keys(cost) as (keyof Resources)[]) have[k] += (cost[k] ?? 0) * mult;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function formatCost(cost: Partial<Resources>, mult = 1): string {
  const parts: string[] = [];
  const sym: Record<string, string> = { credits: "₵", metals: "⛭", energy: "⚡", exotics: "✦" };
  for (const k of Object.keys(cost) as (keyof Resources)[]) {
    const v = (cost[k] ?? 0) * mult;
    if (v) parts.push(`${Math.round(v)}${sym[k]}`);
  }
  return parts.join(" ");
}
