// Real-time combat. Hostile fleets, armed stations and defended colonies that
// come within ENGAGE_RANGE of each other form a battle. Every tick each weapon
// fires according to its rate of fire; damage flows shields → armour → hull.

import { HULL_MAP, SLOT_MULT, WEAPONS, type SlotSize, type WeaponFamily, type WeaponMount } from "./data/ships";
import { PIRATE_HAVEN_BOUNTY, STATION_MAP } from "./data/structures";
import { maxDefense, systemOwner } from "./economy";
import { modifiers, shipStats, weaponDamage } from "./modifiers";
import { bodyPosition, copyVec, dist } from "./orbits";
import { Rng } from "./rng";
import { log } from "./util";
import type { Battle, Colony, Empire, Fleet, GameState, Ship, SimEvent, Station, Vec3 } from "./types";

export const ENGAGE_RANGE = 1.2;
export const PURSUIT_RANGE = 4;
const MAX_SHOT_EVENTS = 40;

type Combatant =
  | { kind: "ship"; empireId: string; pos: Vec3; fleet: Fleet; ship: Ship; weight: number; evasion: number }
  | { kind: "colony"; empireId: string; pos: Vec3; colony: Colony; weight: number; evasion: number }
  | { kind: "station"; empireId: string; pos: Vec3; station: Station; weight: number; evasion: number };

interface Entity {
  kind: "fleet" | "colony" | "station";
  id: string;
  empireId: string;
  pos: Vec3;
  armed: boolean;
  passive: boolean;
}

export function isHostile(state: GameState, a: string, b: string): boolean {
  if (a === b) return false;
  return state.empires[a]?.relations[b] === "war";
}

export function fleetArmed(fleet: Fleet): boolean {
  return fleet.ships.some((s) => HULL_MAP[s.hull].weapons.length > 0);
}

export function mountsOf(c: Combatant): WeaponMount[] {
  if (c.kind === "ship") return HULL_MAP[c.ship.hull].weapons;
  if (c.kind === "station") return (STATION_MAP[c.station.type]?.weapons ?? []) as WeaponMount[];
  // Colonies: planetary batteries scale with remaining defense.
  if (c.colony.defense <= 0) return [];
  const n = Math.max(1, Math.ceil(c.colony.defense / 160));
  const mounts: WeaponMount[] = [];
  for (let i = 0; i < n; i++) mounts.push({ family: i % 3 === 2 ? "missile" : "railgun", size: "M" });
  mounts.push({ family: "pd", size: "S" });
  return mounts;
}

/** Rough military strength used by the AI and UI. */
export function shipPower(empire: Empire, ship: Ship): number {
  const hull = HULL_MAP[ship.hull];
  if (!hull.weapons.length) return 0;
  const st = shipStats(empire, hull);
  let dps = 0;
  for (const w of hull.weapons) {
    if (w.family === "pd") continue;
    dps += (weaponDamage(empire, w.family) * SLOT_MULT[w.size] * WEAPONS[w.family].accuracy) / WEAPONS[w.family].cooldown;
  }
  const ehp = st.hull + st.armor + st.shields;
  return Math.sqrt(dps * ehp) * (1 + st.evasion);
}

export function fleetPower(state: GameState, fleet: Fleet): number {
  const e = state.empires[fleet.empireId];
  let p = 0;
  for (const s of fleet.ships) p += shipPower(e, s) * healthFraction(e, s);
  return p;
}

export function healthFraction(empire: Empire, ship: Ship): number {
  const st = shipStats(empire, HULL_MAP[ship.hull]);
  const max = st.hull + st.armor + st.shields;
  return max > 0 ? (ship.hull_hp + ship.armor + ship.shields) / max : 1;
}

export function colonyPower(state: GameState, colony: Colony): number {
  const e = state.empires[colony.empireId];
  const perMount = shipPower(e, { id: "", hull: "destroyer", name: "", hull_hp: 0, armor: 0, shields: 0, xp: 0 }) * 0.35;
  return (colony.defense / 160) * perMount;
}

interface SystemIndex {
  fleets: Fleet[];
  colonies: Colony[];
  stations: Station[];
}

function indexBySystem(state: GameState): Map<string, SystemIndex> {
  const idx = new Map<string, SystemIndex>();
  const get = (id: string) => {
    let v = idx.get(id);
    if (!v) idx.set(id, (v = { fleets: [], colonies: [], stations: [] }));
    return v;
  };
  for (const f of Object.values(state.fleets)) if (f.systemId && !f.transit && f.ships.length) get(f.systemId).fleets.push(f);
  for (const c of Object.values(state.colonies)) if (idx.has(c.systemId)) get(c.systemId).colonies.push(c);
  for (const s of Object.values(state.stations)) if (idx.has(s.systemId)) get(s.systemId).stations.push(s);
  return idx;
}

function entitiesInSystem(state: GameState, ix: SystemIndex): Entity[] {
  const out: Entity[] = [];
  for (const f of ix.fleets) {
    out.push({ kind: "fleet", id: f.id, empireId: f.empireId, pos: f.pos, armed: fleetArmed(f), passive: f.stance === "passive" });
  }
  for (const c of ix.colonies) {
    // Colonies whose defenses are down are besieged (see applySiege), not fought.
    if (c.defense <= 0) continue;
    out.push({ kind: "colony", id: c.id, empireId: c.empireId, pos: bodyPosition(state, state.bodies[c.bodyId]), armed: true, passive: false });
  }
  for (const s of ix.stations) {
    const armed = !!STATION_MAP[s.type]?.weapons?.length;
    out.push({ kind: "station", id: s.id, empireId: s.empireId, pos: bodyPosition(state, state.bodies[s.bodyId]), armed, passive: !armed });
  }
  return out;
}

function anyHostilePair(state: GameState, empireIds: string[]): boolean {
  for (let i = 0; i < empireIds.length; i++)
    for (let j = i + 1; j < empireIds.length; j++) if (isHostile(state, empireIds[i], empireIds[j])) return true;
  return false;
}

function engages(a: Entity, b: Entity): boolean {
  // At least one side must be willing and able to shoot.
  const aShoots = a.armed && !(a.kind === "fleet" && a.passive);
  const bShoots = b.armed && !(b.kind === "fleet" && b.passive);
  if (a.kind !== "fleet" && b.kind !== "fleet") return false; // planets don't duel planets
  return aShoots || bShoots;
}

/** Aggressive, idle fleets chase nearby hostile fleets. */
export function autoPursue(state: GameState): void {
  for (const f of Object.values(state.fleets)) {
    if (f.stance !== "aggressive" || f.order || f.transit || !f.systemId || !fleetArmed(f)) continue;
    let best: Fleet | null = null;
    let bestD = PURSUIT_RANGE;
    for (const g of Object.values(state.fleets)) {
      if (g.systemId !== f.systemId || g.transit || !g.ships.length || !isHostile(state, f.empireId, g.empireId)) continue;
      const d = dist(f.pos, g.pos);
      if (d < bestD && d > ENGAGE_RANGE * 0.5) {
        best = g;
        bestD = d;
      }
    }
    if (best) {
      f.order = { kind: "attack", systemId: f.systemId, fleetId: best.id, route: [] };
      f.orbitBodyId = null;
    }
  }
}

export function stepCombat(state: GameState, dt: number, rng: Rng, events: SimEvent[]): void {
  const active = new Set<string>();
  for (const f of Object.values(state.fleets)) f.battleId = null;
  const index = indexBySystem(state);

  for (const [systemId, ix] of index) {
    const present = new Set<string>();
    for (const f of ix.fleets) present.add(f.empireId);
    for (const c of ix.colonies) present.add(c.empireId);
    for (const st of ix.stations) present.add(st.empireId);
    if (present.size < 2 || !anyHostilePair(state, [...present])) continue;
    const ents = entitiesInSystem(state, ix);
    // Union-find over hostile engagements and friendly proximity.
    const parent = ents.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const hostileLink = new Array(ents.length).fill(false);
    for (let i = 0; i < ents.length; i++) {
      for (let j = i + 1; j < ents.length; j++) {
        const a = ents[i];
        const b = ents[j];
        if (dist(a.pos, b.pos) > ENGAGE_RANGE) continue;
        if (isHostile(state, a.empireId, b.empireId)) {
          if (!engages(a, b)) continue;
          hostileLink[i] = hostileLink[j] = true;
          parent[find(i)] = find(j);
        } else if (a.empireId === b.empireId) {
          parent[find(i)] = find(j);
        }
      }
    }
    const groups = new Map<number, number[]>();
    ents.forEach((_e, i) => {
      const r = find(i);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r)!.push(i);
    });
    let gi = 0;
    for (const members of groups.values()) {
      if (!members.some((i) => hostileLink[i])) continue;
      const group = members.map((i) => ents[i]);
      const battleId = `b_${systemId}_${gi++}`;
      active.add(battleId);
      const center = centroid(group.map((g) => g.pos));
      let battle = state.battles[battleId];
      const empireIds = [...new Set(group.map((g) => g.empireId))];
      if (!battle) {
        battle = { id: battleId, systemId, pos: center, started: state.day, empireIds, rounds: 0 };
        state.battles[battleId] = battle;
        announceBattle(state, battle);
      }
      battle.pos = center;
      battle.empireIds = empireIds;
      battle.rounds++;
      resolveRound(state, group, battle, dt, rng, events);
    }
  }
  // Close finished battles.
  for (const id of Object.keys(state.battles)) {
    if (!active.has(id)) {
      concludeBattle(state, state.battles[id]);
      delete state.battles[id];
    }
  }
}

function centroid(ps: Vec3[]): Vec3 {
  const c = { x: 0, y: 0, z: 0 };
  for (const p of ps) {
    c.x += p.x;
    c.y += p.y;
    c.z += p.z;
  }
  const n = Math.max(1, ps.length);
  return { x: c.x / n, y: c.y / n, z: c.z / n };
}

function announceBattle(state: GameState, battle: Battle): void {
  const player = state.empires[state.playerId];
  if (!battle.empireIds.includes(player.id)) return;
  const foes = battle.empireIds.filter((e) => e !== player.id).map((e) => state.empires[e].name);
  log(state, "combat", `Battle erupted in ${state.systems[battle.systemId].name} against ${foes.join(", ")}!`, player.id, battle.systemId);
}

function concludeBattle(state: GameState, battle: Battle): void {
  const player = state.empires[state.playerId];
  if (!battle.empireIds.includes(player.id)) return;
  const stillHere = Object.values(state.fleets).some((f) => f.empireId === player.id && f.systemId === battle.systemId && f.ships.length);
  log(
    state,
    "combat",
    stillHere
      ? `The battle in ${state.systems[battle.systemId].name} is over — our forces hold the field.`
      : `The battle in ${state.systems[battle.systemId].name} is over.`,
    player.id,
    battle.systemId,
  );
}

function buildCombatants(state: GameState, group: Entity[], battle: Battle): Combatant[] {
  const out: Combatant[] = [];
  for (const e of group) {
    if (e.kind === "fleet") {
      const f = state.fleets[e.id];
      f.battleId = battle.id;
      for (const ship of f.ships) {
        const hull = HULL_MAP[ship.hull];
        out.push({ kind: "ship", empireId: f.empireId, pos: f.pos, fleet: f, ship, weight: Math.sqrt(hull.hull), evasion: hull.evasion });
      }
    } else if (e.kind === "colony") {
      out.push({ kind: "colony", empireId: e.empireId, pos: e.pos, colony: state.colonies[e.id], weight: 6, evasion: 0 });
    } else {
      out.push({ kind: "station", empireId: e.empireId, pos: e.pos, station: state.stations[e.id], weight: 4, evasion: 0 });
    }
  }
  return out;
}

function resolveRound(state: GameState, group: Entity[], battle: Battle, dt: number, rng: Rng, events: SimEvent[]): void {
  const combatants = buildCombatants(state, group, battle);
  // Point defense strength per empire (missile interception).
  const pd: Record<string, number> = {};
  for (const c of combatants) {
    for (const m of mountsOf(c)) {
      if (m.family !== "pd") continue;
      const e = state.empires[c.empireId];
      pd[c.empireId] = (pd[c.empireId] ?? 0) + (1 + 0.3 * modifiers(e).weaponTier.pd);
    }
  }
  let shotEvents = 0;
  const dead = new Set<Combatant>();
  for (const shooter of combatants) {
    if (dead.has(shooter)) continue;
    const empire = state.empires[shooter.empireId];
    const mounts = mountsOf(shooter);
    if (!mounts.length) continue;
    const targets = combatants.filter((c) => !dead.has(c) && isHostile(state, shooter.empireId, c.empireId) && targetable(c));
    if (!targets.length) continue;
    const xpMult = shooter.kind === "ship" ? 1 + Math.min(0.25, shooter.ship.xp * 0.02) : 1;
    for (const mount of mounts) {
      const wd = WEAPONS[mount.family];
      const expected = dt / wd.cooldown;
      const shots = Math.floor(expected) + (rng.next() < expected - Math.floor(expected) ? 1 : 0);
      for (let s = 0; s < shots; s++) {
        const target = rng.weighted(targets, (t) => (dead.has(t) ? 0 : t.weight));
        if (dead.has(target)) continue;
        const intercepted = wd.interceptable && rng.next() < Math.min(0.7, (pd[target.empireId] ?? 0) * 0.04);
        const hit = !intercepted && rng.next() < wd.accuracy * (1 - target.evasion);
        if (shotEvents < MAX_SHOT_EVENTS) {
          shotEvents++;
          events.push({
            type: "shot",
            systemId: battle.systemId,
            from: copyVec(shooter.pos),
            to: copyVec(target.pos),
            weapon: mount.family,
            hit,
            intercepted,
            fromEmpire: shooter.empireId,
            fromRef: refOf(shooter),
            toRef: refOf(target),
          });
        }
        if (!hit) continue;
        const dmg = weaponDamage(empire, mount.family) * SLOT_MULT[mount.size as SlotSize] * xpMult;
        const killed = applyDamage(state, target, dmg, mount.family);
        if (killed) {
          dead.add(target);
          onKilled(state, target, shooter, battle, events);
        }
      }
    }
  }
  // Shields trickle back even under fire.
  for (const c of combatants) {
    if (c.kind !== "ship" || dead.has(c)) continue;
    const e = state.empires[c.empireId];
    const max = shipStats(e, HULL_MAP[c.ship.hull]).shields;
    c.ship.shields = Math.min(max, c.ship.shields + max * 0.05 * dt);
  }
  // Remove dead ships from fleets.
  for (const f of new Set(combatants.filter((c) => c.kind === "ship").map((c) => (c as { fleet: Fleet }).fleet))) {
    f.ships = f.ships.filter((s) => s.hull_hp > 0);
    if (!f.ships.length) delete state.fleets[f.id];
  }
}

/** Armed hostile fleets orbiting a colony with no defenses left keep it besieged. */
export function applySiege(state: GameState): void {
  for (const c of Object.values(state.colonies)) {
    if (c.defense > 0) continue;
    const at = bodyPosition(state, state.bodies[c.bodyId]);
    for (const f of Object.values(state.fleets)) {
      if (f.systemId !== c.systemId || f.transit || f.stance === "passive") continue;
      if (!isHostile(state, f.empireId, c.empireId) || !fleetArmed(f)) continue;
      if (dist(f.pos, at) <= ENGAGE_RANGE) {
        c.lastAttacked = state.day;
        break;
      }
    }
  }
}

function refOf(c: Combatant): string {
  if (c.kind === "ship") return `fleet:${c.fleet.id}`;
  if (c.kind === "colony") return `body:${c.colony.bodyId}`;
  return `body:${c.station.bodyId}`;
}

function targetable(c: Combatant): boolean {
  if (c.kind === "colony") return c.colony.defense > 0;
  return true;
}

function applyDamage(state: GameState, target: Combatant, dmg: number, family: WeaponFamily): boolean {
  const wd = WEAPONS[family];
  if (target.kind === "ship") {
    const ship = target.ship;
    let remaining = dmg;
    if (ship.shields > 0) {
      const absorbed = Math.min(ship.shields, remaining * wd.vsShields);
      ship.shields -= absorbed;
      remaining -= absorbed / wd.vsShields;
    }
    if (remaining > 0 && ship.armor > 0) {
      const absorbed = Math.min(ship.armor, remaining * wd.vsArmor);
      ship.armor -= absorbed;
      remaining -= absorbed / wd.vsArmor;
    }
    ship.hull_hp -= remaining;
    return ship.hull_hp <= 0;
  }
  if (target.kind === "colony") {
    const c = target.colony;
    c.defense = Math.max(0, c.defense - dmg);
    c.lastAttacked = state.day;
    return false;
  }
  target.station.hp -= dmg;
  return target.station.hp <= 0;
}

function onKilled(state: GameState, target: Combatant, killer: Combatant, battle: Battle, events: SimEvent[]): void {
  const killerEmpire = state.empires[killer.empireId];
  killerEmpire.stats.kills++;
  if (killer.kind === "ship") killer.ship.xp += 1;
  if (target.kind === "ship") {
    const hull = HULL_MAP[target.ship.hull];
    state.empires[target.empireId].stats.shipsLost++;
    events.push({ type: "explosion", systemId: battle.systemId, pos: copyVec(target.pos), size: Math.log10(hull.length), ref: refOf(target) });
    return;
  }
  if (target.kind === "station") {
    const st = target.station;
    delete state.stations[st.id];
    events.push({ type: "explosion", systemId: battle.systemId, pos: copyVec(target.pos), size: 3, ref: refOf(target) });
    const name = STATION_MAP[st.type]?.name ?? "Station";
    if (st.type === "pirate_haven") {
      for (const [k, v] of Object.entries(PIRATE_HAVEN_BOUNTY)) (killerEmpire.resources as Record<string, number>)[k] += v;
      log(
        state,
        "combat",
        `${killerEmpire.name} destroyed a Raider Haven in ${state.systems[st.systemId].name} and seized its hoard!`,
        null,
        st.systemId,
      );
    } else if (state.empires[st.empireId].isPlayer || killerEmpire.isPlayer) {
      log(state, "combat", `${state.empires[st.empireId].name}'s ${name} in ${state.systems[st.systemId].name} was destroyed.`, null, st.systemId);
    }
  }
}

/** Daily repair & shield recharge for fleets not in combat. */
export function repairFleetsDay(state: GameState): void {
  for (const f of Object.values(state.fleets)) {
    if (f.battleId || f.transit || !f.systemId) continue;
    const e = state.empires[f.empireId];
    const m = modifiers(e);
    const owner = systemOwner(state, f.systemId);
    let rate = owner === e.id ? 0.04 : 0.01;
    if (f.orbitBodyId) {
      const col = Object.values(state.colonies).find((c) => c.bodyId === f.orbitBodyId && c.empireId === e.id);
      if (col?.buildings.some((b) => b.type === "shipyard")) rate = 0.2;
    }
    if (e.isPirate) rate = 0.05;
    rate *= 1 + m.repair;
    for (const ship of f.ships) {
      const st = shipStats(e, HULL_MAP[ship.hull]);
      ship.shields = Math.min(st.shields, ship.shields + st.shields * 0.5);
      ship.armor = Math.min(st.armor, ship.armor + st.armor * rate);
      ship.hull_hp = Math.min(st.hull, ship.hull_hp + st.hull * rate);
    }
  }
}

export function colonyUnderSiege(state: GameState, colony: Colony): boolean {
  return colony.defense < maxDefense(state, colony) * 0.999 && state.day - colony.lastAttacked < 2;
}
