import { Rng } from "./rng";
import type { GameEventKind, GameState, Resources } from "./types";

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
): void {
  state.log.push({ day: state.day, kind, text, empireId, systemId });
  if (state.log.length > 400) state.log.splice(0, state.log.length - 400);
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
