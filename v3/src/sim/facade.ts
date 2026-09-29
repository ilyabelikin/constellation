// What the UI needs from "a game": the (possibly partial, fog-of-war) state
// seen by one player, plus player commands. Implemented by the local Game and
// by the multiplayer NetGame, so the HUD and renderer work with either.

import type { CommandResult } from "./api";
import type { Colony, Empire, GameState, SimEvent, Stance, Vec3 } from "./types";

export abstract class PlayerFacade {
  abstract state: GameState;
  /** Execute a named command for this player (see api.ts). */
  abstract exec(name: string, ...args: unknown[]): CommandResult;
  /** Events produced since the last call (renderer/UI effects). */
  abstract drainEvents(): SimEvent[];

  get player(): Empire {
    return this.state.empires[this.state.playerId];
  }

  get playerId(): string {
    return this.state.playerId;
  }

  playerColonies(): Colony[] {
    return Object.values(this.state.colonies).filter((c) => c.empireId === this.state.playerId);
  }

  queueBuilding(colonyId: string, type: string) {
    return this.exec("queueBuilding", colonyId, type);
  }
  queueShip(colonyId: string, hull: string) {
    return this.exec("queueShip", colonyId, hull);
  }
  /** Queue a colony ship (at `colonyId`, or the best shipyard) that will settle `bodyId` on launch. */
  buildColonyShipFor(bodyId: string, colonyId?: string) {
    return this.exec("buildColonyShipFor", bodyId, colonyId ?? null);
  }
  /** Queue enough troop transports (at `shipyardId`, or the best shipyard) to take `colonyId`; they launch as one force. */
  buildInvasionFor(colonyId: string, shipyardId?: string) {
    return this.exec("buildInvasionFor", colonyId, shipyardId ?? null);
  }
  cancelQueueItem(colonyId: string, index: number, expectType?: string) {
    return this.exec("cancelQueueItem", colonyId, index, expectType ?? null);
  }
  demolishBuilding(colonyId: string, index: number) {
    return this.exec("demolishBuilding", colonyId, index);
  }
  setResearch(techId: string) {
    return this.exec("setResearch", techId);
  }
  /** Fleet orders take `queued` to run after the fleet's current order (Shift). */
  moveFleet(fleetId: string, systemId: string, target: { bodyId?: string; pos?: Vec3 } = {}, queued = false) {
    return this.exec("moveFleet", fleetId, systemId, target, queued);
  }
  colonize(fleetId: string, bodyId: string, queued = false) {
    return this.exec("colonize", fleetId, bodyId, queued);
  }
  buildStation(fleetId: string, bodyId: string, type: string, queued = false) {
    return this.exec("buildStation", fleetId, bodyId, type, queued);
  }
  invade(fleetId: string, colonyId: string, queued = false) {
    return this.exec("invade", fleetId, colonyId, queued);
  }
  attackFleet(fleetId: string, targetId: string) {
    return this.exec("attackFleet", fleetId, targetId);
  }
  stopFleet(fleetId: string) {
    return this.exec("stopFleet", fleetId);
  }
  /** Cancel the current order (index -1) or one queued order. */
  cancelFleetOrder(fleetId: string, index: number, expectKind?: string) {
    return this.exec("cancelFleetOrder", fleetId, index, expectKind ?? null);
  }
  setStance(fleetId: string, stance: Stance) {
    return this.exec("setStance", fleetId, stance);
  }
  renameFleet(fleetId: string, name: string) {
    return this.exec("renameFleet", fleetId, name);
  }
  mergeFleets(intoId: string, fromId: string) {
    return this.exec("mergeFleets", intoId, fromId);
  }
  splitFleet(fleetId: string, shipIds: string[]) {
    return this.exec("splitFleet", fleetId, shipIds);
  }
  declareWar(targetId: string) {
    return this.exec("declareWar", targetId);
  }
  proposePeace(targetId: string) {
    return this.exec("proposePeace", targetId);
  }
  acceptPeace(fromId: string) {
    return this.exec("acceptPeace", fromId);
  }
  rejectPeace(fromId: string) {
    return this.exec("rejectPeace", fromId);
  }
  sendTribute(toId: string, resource: string, amount: number) {
    return this.exec("sendTribute", toId, resource, amount);
  }
  cedeColony(colonyId: string, toId: string) {
    return this.exec("cedeColony", colonyId, toId);
  }
  acceptDemand(fromId: string) {
    return this.exec("acceptDemand", fromId);
  }
  proposeTrade(toId: string) {
    return this.exec("proposeTrade", toId);
  }
  acceptTrade(fromId: string) {
    return this.exec("acceptTrade", fromId);
  }
  rejectTrade(fromId: string) {
    return this.exec("rejectTrade", fromId);
  }
  cancelTrade(otherId: string) {
    return this.exec("cancelTrade", otherId);
  }
  rejectDemand(fromId: string) {
    return this.exec("rejectDemand", fromId);
  }
}
