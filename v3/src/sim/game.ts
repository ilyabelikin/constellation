// The Game ties everything together: fixed-step simulation, daily economy,
// AI, raiders, victory conditions and save/load. It has no DOM or WebGL
// dependencies, so it runs identically in the browser, in Node and in tests.

import { HULL_MAP } from "./data/ships";
import { aiAcceptsPeace, aiThink, coloniesOf } from "./ai";
import { applySiege, autoPursue, repairFleetsDay, stepCombat } from "./combat";
import * as cmd from "./commands";
import { incomeReport, maxDefense, processColonyDay, processEconomyDay, systemOwnerMap } from "./economy";
import { ensureCapital, stepFleets } from "./fleets";
import { updateContacts } from "./knowledge";
import { createGame, makeFleet, makeShip, SAVE_VERSION } from "./galaxy";
import { clearModifierCache } from "./modifiers";
import { bodyPosition, dist } from "./orbits";
import { pirateDay } from "./pirates";
import { colonyShipOptions } from "./planning";
import { Rng } from "./rng";
import { acquaintances, log, logTo } from "./util";
import type { Colony, GameSettings, GameState, QueueItem, SimEvent } from "./types";

export const STEP_DAYS = 0.1;
export const DOMINATION_SHARE = 0.6;
export const HOMELESS_GRACE_DAYS = 120;
export const PEACE_PROPOSAL_COOLDOWN = 30;

export class Game {
  state: GameState;
  private events: SimEvent[] = [];

  constructor(state: GameState) {
    this.state = state;
    clearModifierCache();
    // Fresh games: fill planetary defenses.
    for (const c of Object.values(state.colonies)) if (state.day === 0) c.defense = maxDefense(state, c);
    if (state.day === 0) this.refreshIncome();
  }

  static create(settings: Partial<GameSettings> = {}): Game {
    const g = new Game(createGame(settings));
    const player = g.player;
    log(g.state, "info", `The ${player.name} takes its first steps among the stars. Build, expand and prevail!`, player.id);
    const tips = [
      "Tip: select your star or gas giant — the Builders can raise a Solar Array or Gas Harvester there for energy.",
      "Tip: send the Pathfinder scout through a tunnel gate (select it, right-click a gate) to survey neighbouring systems.",
      "Tip: queue a Colony Ship at your capital, then right-click a habitable world (green habitability) to settle it.",
      "Tip: press R to pick research. Void Raiders will raid within a few months — keep some warships at home.",
    ];
    for (const t of tips) log(g.state, "info", t, player.id);
    return g;
  }

  get player() {
    return this.state.empires[this.state.playerId];
  }

  get playerId() {
    return this.state.playerId;
  }

  /** Advance the simulation by `days` (split into fixed steps). */
  advance(days: number): void {
    const steps = Math.round(days / STEP_DAYS);
    for (let i = 0; i < steps; i++) this.step();
  }

  step(): void {
    const s = this.state;
    const prevDay = Math.floor(s.day + 1e-9);
    s.day = Math.round((s.day + STEP_DAYS) * 1000) / 1000;
    const rng = new Rng(s.rngState);
    stepFleets(s, STEP_DAYS, this.events);
    autoPursue(s);
    stepCombat(s, STEP_DAYS, rng, this.events);
    applySiege(s);
    s.rngState = rng.state;
    if (Math.floor(s.day + 1e-9) > prevDay) this.dailyTick();
  }

  private dailyTick(): void {
    const s = this.state;
    const rng = new Rng(s.rngState);
    for (const c of Object.values(s.colonies)) processColonyDay(s, c, (col, item) => this.onShipBuilt(col, item));
    for (const e of Object.values(s.empires)) processEconomyDay(s, e);
    repairFleetsDay(s);
    for (const [a, b] of updateContacts(s)) this.events.push({ type: "contact", a, b });
    for (const e of Object.values(s.empires)) if (e.ai && e.alive) aiThink(s, e, rng);
    for (const e of Object.values(s.empires)) if (e.alive && !e.isPirate) ensureCapital(s, e.id);
    pirateDay(s, rng);
    s.rngState = rng.state;
    this.checkEliminations();
    this.checkVictory();
  }

  /** Recompute the displayed per-day income without applying it. */
  refreshIncome(): void {
    for (const e of Object.values(this.state.empires)) {
      if (!e.isPirate) e.income = incomeReport(this.state, e).net;
    }
  }

  private onShipBuilt(colony: Colony, item: Extract<QueueItem, { kind: "ship" }>): void {
    const hullId = item.type;
    const s = this.state;
    const empire = s.empires[colony.empireId];
    const hull = HULL_MAP[hullId];
    const pos = bodyPosition(s, s.bodies[colony.bodyId]);
    const ship = makeShip(s, empire, hullId);
    empire.stats.shipsBuilt++;
    let fleet = null;
    if (hull.role === "military" && !item.then) {
      fleet = Object.values(s.fleets).find(
        (f) =>
          f.empireId === empire.id &&
          !f.order &&
          !f.transit &&
          f.systemId === colony.systemId &&
          f.orbitBodyId === colony.bodyId &&
          f.ships.length > 0 &&
          f.ships.every((sh) => HULL_MAP[sh.hull].role === "military"),
      );
    }
    if (!fleet) {
      const name =
        hull.role === "military"
          ? undefined
          : hull.role === "colony"
            ? `Colony Expedition ${empire.fleetCounter + 1}`
            : hull.role === "constructor"
              ? `Construction Crew ${empire.fleetCounter + 1}`
              : hull.role === "scout"
                ? `Survey Team ${empire.fleetCounter + 1}`
                : `Assault Group ${empire.fleetCounter + 1}`;
      fleet = makeFleet(s, empire, colony.systemId, pos, name);
      fleet.orbitBodyId = colony.bodyId;
      if (hull.role !== "military") fleet.stance = "passive";
    }
    fleet.ships.push(ship);
    this.events.push({ type: "shipBuilt", systemId: colony.systemId, fleetId: fleet.id, hull: hullId });
    if (empire.isPlayer) log(s, "construction", `${hull.name} ${ship.name.split(" ").pop()} launched at ${colony.name}.`, empire.id, colony.systemId);
    if (item.then?.kind === "colonize") {
      const target = s.bodies[item.then.bodyId];
      const r = cmd.colonizeOrder(s, empire.id, fleet.id, item.then.bodyId);
      if (empire.isPlayer)
        log(
          s,
          "colony",
          r.ok ? `${fleet.name} set course to colonise ${target.name}.` : `${fleet.name} can no longer colonise ${target.name}: ${r.error}.`,
          empire.id,
          target.systemId,
        );
    }
  }

  private checkEliminations(): void {
    const s = this.state;
    for (const e of Object.values(s.empires)) {
      if (!e.alive || e.isPirate) continue;
      const hasColony = Object.values(s.colonies).some((c) => c.empireId === e.id);
      const hasColonyShip = Object.values(s.fleets).some(
        (f) => f.empireId === e.id && f.ships.some((sh) => HULL_MAP[sh.hull].role === "colony"),
      );
      if (hasColony) {
        delete e.homelessSince;
        continue;
      }
      // A lone colony ship buys time to resettle, but not forever.
      e.homelessSince ??= s.day;
      if (hasColonyShip && s.day - e.homelessSince < HOMELESS_GRACE_DAYS) continue;
      e.alive = false;
      for (const other of Object.values(s.empires)) {
        if (other.id === e.id || other.isPirate) continue;
        other.relations[e.id] = "peace";
        e.relations[other.id] = "peace";
      }
      for (const f of Object.values(s.fleets)) if (f.empireId === e.id) delete s.fleets[f.id];
      for (const st of Object.values(s.stations)) if (st.empireId === e.id) delete s.stations[st.id];
      logTo(s, e.isPlayer ? "defeat" : "victory", `The ${e.name} has collapsed.`, acquaintances(s, e.id));
    }
  }

  private checkVictory(): void {
    const s = this.state;
    if (s.winner) return;
    const player = this.player;
    if (!player.alive) {
      s.winner = Object.values(s.empires).find((e) => e.alive && !e.isPirate)?.id ?? "none";
      s.victoryType = "defeat";
      return;
    }
    const majors = Object.values(s.empires).filter((e) => !e.isPirate);
    const alive = majors.filter((e) => e.alive);
    if (alive.length === 1 && majors.length > 1) {
      s.winner = alive[0].id;
      s.victoryType = "conquest";
      log(s, "victory", `${alive[0].name} stands alone — total conquest!`, null);
      return;
    }
    if (Math.floor(s.day) % 10 === 0) {
      const owners = systemOwnerMap(s);
      const total = Object.keys(s.systems).length;
      for (const e of alive) {
        const n = Object.values(owners).filter((o) => o === e.id).length;
        if (n / total >= DOMINATION_SHARE) {
          s.winner = e.id;
          s.victoryType = "domination";
          log(s, "victory", `${e.name} controls ${Math.round((n / total) * 100)}% of the galaxy — galactic hegemony!`, null);
          return;
        }
      }
    }
  }

  /** Drain events produced since the last call (renderer/UI effects). */
  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  // ---- player commands --------------------------------------------------
  queueBuilding(colonyId: string, type: string) {
    return this.after(cmd.queueBuilding(this.state, this.playerId, colonyId, type));
  }
  queueShip(colonyId: string, hull: string) {
    return this.after(cmd.queueShip(this.state, this.playerId, colonyId, hull));
  }
  /** Queue a colony ship (at `colonyId`, or the best shipyard) that will settle `bodyId` on launch. */
  buildColonyShipFor(bodyId: string, colonyId?: string): cmd.CommandResult {
    const options = colonyShipOptions(this.state, this.playerId, bodyId);
    const pick = colonyId ? options.find((o) => o.colonyId === colonyId) : options[0];
    if (!pick) return { ok: false, error: "No shipyard can reach that world" };
    return this.after(cmd.queueShip(this.state, this.playerId, pick.colonyId, "colony", { kind: "colonize", bodyId }));
  }
  cancelQueueItem(colonyId: string, index: number, expectType?: string) {
    return this.after(cmd.cancelQueueItem(this.state, this.playerId, colonyId, index, expectType));
  }
  demolishBuilding(colonyId: string, index: number) {
    return this.after(cmd.demolishBuilding(this.state, this.playerId, colonyId, index));
  }
  setResearch(techId: string) {
    return cmd.setResearch(this.state, this.playerId, techId);
  }
  moveFleet(fleetId: string, systemId: string, target: { bodyId?: string; pos?: { x: number; y: number; z: number } } = {}) {
    return cmd.moveFleet(this.state, this.playerId, fleetId, systemId, target);
  }
  colonize(fleetId: string, bodyId: string) {
    return cmd.colonizeOrder(this.state, this.playerId, fleetId, bodyId);
  }
  buildStation(fleetId: string, bodyId: string, type: string) {
    return cmd.buildStationOrder(this.state, this.playerId, fleetId, bodyId, type);
  }
  invade(fleetId: string, colonyId: string) {
    return cmd.invadeOrder(this.state, this.playerId, fleetId, colonyId);
  }
  attackFleet(fleetId: string, targetId: string) {
    return cmd.attackFleetOrder(this.state, this.playerId, fleetId, targetId);
  }
  stopFleet(fleetId: string) {
    return cmd.stopFleet(this.state, this.playerId, fleetId);
  }
  setStance(fleetId: string, stance: "aggressive" | "defensive" | "passive") {
    return cmd.setStance(this.state, this.playerId, fleetId, stance);
  }
  renameFleet(fleetId: string, name: string) {
    return cmd.renameFleet(this.state, this.playerId, fleetId, name);
  }
  mergeFleets(intoId: string, fromId: string) {
    return cmd.mergeFleetsCmd(this.state, this.playerId, intoId, fromId);
  }
  splitFleet(fleetId: string, shipIds: string[]) {
    return cmd.splitFleet(this.state, this.playerId, fleetId, shipIds);
  }
  declareWar(targetId: string) {
    return cmd.declareWar(this.state, this.playerId, targetId);
  }
  proposePeace(targetId: string): cmd.CommandResult {
    const target = this.state.empires[targetId];
    if (!target || target.isPirate) return { ok: false, error: "They will not negotiate" };
    if (this.player.relations[targetId] !== "war") return { ok: false, error: "Not at war" };
    const until = target.ai?.peaceRefusedUntil?.[this.playerId] ?? -1;
    if (this.state.day < until)
      return { ok: false, error: `${target.name} will not hear new proposals for ${Math.ceil(until - this.state.day)} days` };
    const rng = new Rng(this.state.rngState);
    const accepted = aiAcceptsPeace(this.state, target, this.playerId, rng);
    this.state.rngState = rng.state;
    if (!accepted) {
      if (target.ai) (target.ai.peaceRefusedUntil ??= {})[this.playerId] = this.state.day + PEACE_PROPOSAL_COOLDOWN;
      log(this.state, "diplomacy", `${target.name} rejected our peace proposal.`, this.playerId);
      return { ok: false, error: `${target.name} rejected peace` };
    }
    return cmd.makePeace(this.state, this.playerId, targetId);
  }

  private after<T extends cmd.CommandResult>(r: T): T {
    if (r.ok) this.refreshIncome();
    return r;
  }

  // ---- queries used by the UI -----------------------------------------------
  playerColonies() {
    return coloniesOf(this.state, this.playerId);
  }

  fleetsNear(systemId: string, pos: { x: number; y: number; z: number }, radius: number) {
    return Object.values(this.state.fleets).filter((f) => f.systemId === systemId && dist(f.pos, pos) <= radius);
  }

  // ---- persistence ---------------------------------------------------------------
  serialize(): string {
    return JSON.stringify(this.state);
  }

  static deserialize(json: string): Game {
    const state = JSON.parse(json) as GameState;
    if (state.version !== SAVE_VERSION) throw new Error(`Incompatible save version ${state.version}`);
    return new Game(state);
  }
}
