// Void Raiders: a hostile faction that grows stronger over time, guards its
// havens and periodically raids the weakest nearby colonies.

import { STATION_MAP } from "./data/structures";
import { fleetPower } from "./combat";
import { findRoute } from "./fleets";
import { makeFleet, makeShip } from "./galaxy";
import { bodyPosition } from "./orbits";
import type { Rng } from "./rng";
import { log } from "./util";
import type { Empire, GameState } from "./types";

const PIRATE_TECH_ORDER = [
  "composite_armor",
  "lasers_2",
  "railguns",
  "frigates",
  "guided_missiles",
  "deflector_shields",
  "destroyers",
  "point_defense_2",
  "hardened_shields",
  "mass_drivers_2",
  "cruisers",
  "torpedoes",
  "plasma_weapons",
  "neutronium_armor",
];

export const MAX_PIRATE_SHIPS = 45;

export function pirateEmpire(state: GameState): Empire | null {
  return Object.values(state.empires).find((e) => e.isPirate) ?? null;
}

function pirateHull(state: GameState, rng: Rng, empire: Empire): string {
  const done = empire.research.completed;
  const options = ["corvette"];
  if (done.includes("frigates")) options.push("frigate", "frigate");
  if (done.includes("destroyers")) options.push("destroyer", "destroyer");
  if (done.includes("cruisers") && state.day > 1200) options.push("cruiser");
  return rng.pick(options);
}

export function pirateDay(state: GameState, rng: Rng): void {
  const pirates = pirateEmpire(state);
  if (!pirates) return;
  // Tech creep: one new tech every ~220 days.
  const techIndex = Math.min(PIRATE_TECH_ORDER.length, Math.floor(state.day / 220));
  for (let i = 0; i < techIndex; i++) {
    const t = PIRATE_TECH_ORDER[i];
    if (!pirates.research.completed.includes(t)) pirates.research.completed.push(t);
  }
  const havens = Object.values(state.stations).filter((s) => s.empireId === pirates.id && s.type === "pirate_haven");
  if (!havens.length) return;
  let totalShips = 0;
  for (const f of Object.values(state.fleets)) if (f.empireId === pirates.id) totalShips += f.ships.length;

  // Reinforce haven guards every 45 days.
  if (Math.floor(state.day) % 45 === 0) {
    for (const h of havens) {
      if (totalShips >= MAX_PIRATE_SHIPS) break;
      let guard = Object.values(state.fleets).find((f) => f.empireId === pirates.id && f.systemId === h.systemId && !f.order && f.name === "Haven Guard");
      if (!guard) {
        guard = makeFleet(state, pirates, h.systemId, bodyPosition(state, state.bodies[h.bodyId]), "Haven Guard");
        guard.orbitBodyId = h.bodyId;
        guard.stance = "defensive";
      }
      const cap = 3 + Math.floor(state.day / 300);
      if (guard.ships.length < cap) {
        guard.ships.push(makeShip(state, pirates, pirateHull(state, rng, pirates)));
        totalShips++;
      }
      // Havens also repair slowly.
      const max = STATION_MAP.pirate_haven.hp;
      h.hp = Math.min(max, h.hp + max * 0.02);
    }
  }

  // Raids.
  if (state.day < state.nextRaid || totalShips >= MAX_PIRATE_SHIPS) return;
  const diff = state.settings.difficulty === "easy" ? 1.4 : state.settings.difficulty === "hard" ? 0.75 : 1;
  state.nextRaid = state.day + rng.range(150, 230) * diff;
  const haven = rng.pick(havens);
  let target: { systemId: string; bodyId: string; score: number } | null = null;
  for (const c of Object.values(state.colonies)) {
    const r = findRoute(state, haven.systemId, c.systemId);
    if (!r || r.length > 5 || r.length === 0) continue;
    const score = 1 / (1 + r.length) / (1 + c.defense / 400) + rng.range(0, 0.05);
    if (!target || score > target.score) target = { systemId: c.systemId, bodyId: c.bodyId, score };
  }
  if (!target) return;
  const size = Math.min(12, 2 + Math.floor(state.day / 280));
  const raid = makeFleet(state, pirates, haven.systemId, bodyPosition(state, state.bodies[haven.bodyId]), "Raider Warband");
  for (let i = 0; i < size; i++) raid.ships.push(makeShip(state, pirates, pirateHull(state, rng, pirates)));
  raid.stance = "aggressive";
  const route = findRoute(state, haven.systemId, target.systemId)!;
  raid.order = { kind: "move", systemId: target.systemId, bodyId: target.bodyId, route };
  const victim = Object.values(state.colonies).find((c) => c.bodyId === target!.bodyId);
  const victimEmpire = victim ? state.empires[victim.empireId] : null;
  log(
    state,
    "danger",
    `Void Raiders launched a ${size}-ship warband towards ${state.systems[target.systemId].name}! (strength ${Math.round(fleetPower(state, raid))})`,
    victimEmpire?.id ?? null,
    target.systemId,
    // Where the warband was spotted: its haven.
    { kind: "fleet", id: raid.id, systemId: haven.systemId, pos: { ...raid.pos } },
  );
}
