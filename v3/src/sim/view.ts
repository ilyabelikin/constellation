// Per-player views of the authoritative game state for multiplayer.
// The server sends each player the static galaxy once, then frequent
// fog-of-war-filtered snapshots of everything that changes: a player never
// receives data about things they could not know.

import { hasMet, sensorSystems } from "./knowledge";
import { canSeeLog } from "./util";
import type {
  Battle,
  Body,
  Colony,
  Empire,
  Fleet,
  GameLogEntry,
  GameSettings,
  GameState,
  SimEvent,
  Station,
  StarSystem,
  Tunnel,
} from "./types";

export interface StaticView {
  version: number;
  settings: GameSettings;
  systems: Record<string, StarSystem>;
  bodies: Record<string, Body>;
  tunnels: Record<string, Tunnel>;
}

export interface PlayerView {
  day: number;
  playerId: string;
  empires: Record<string, Empire>;
  colonies: Record<string, Colony>;
  stations: Record<string, Station>;
  fleets: Record<string, Fleet>;
  battles: Record<string, Battle>;
  log: GameLogEntry[];
  winner: string | null;
  victoryType: string | null;
}

export function staticView(state: GameState): StaticView {
  return { version: state.version, settings: state.settings, systems: state.systems, bodies: state.bodies, tunnels: state.tunnels };
}

/** What `rival` looks like to `viewer`: public identity only, plus a little intel once met. */
function publicEmpire(state: GameState, rival: Empire, viewerId: string): Empire {
  const met = hasMet(state, viewerId, rival.id);
  return {
    id: rival.id,
    name: met ? rival.name : "Unknown civilization",
    color: rival.color,
    speciesId: met ? rival.speciesId : "",
    isPlayer: rival.isPlayer,
    isPirate: rival.isPirate,
    resources: { credits: 0, metals: 0, energy: 0, exotics: 0 },
    research: {
      // Only a galaxy-wide wonder like the Ascension Project is common knowledge.
      current: met && rival.research.current === "ascension" ? "ascension" : null,
      progress: {},
      completed: met ? [...rival.research.completed] : [],
      queue: [],
    },
    explored: {},
    relations: { [viewerId]: rival.relations[viewerId] ?? "peace" },
    ai: null,
    alive: rival.alive,
    income: { credits: 0, metals: 0, energy: 0, exotics: 0, research: 0 },
    stats: { shipsBuilt: 0, shipsLost: 0, kills: 0, coloniesFounded: 0 },
    fleetCounter: 0,
    contacts: rival.contacts?.[viewerId] ? { [viewerId]: true } : {},
  };
}

function ownEmpire(e: Empire): Empire {
  // Strip AI internals (a human's seat may once have been an AI).
  return { ...e, ai: null };
}

export function playerView(state: GameState, viewerId: string, logLimit = 150): PlayerView {
  const me = state.empires[viewerId];
  const sensors = sensorSystems(state, viewerId);
  const knows = (systemId: string) => !!me?.explored[systemId];
  const empires: Record<string, Empire> = {};
  for (const e of Object.values(state.empires)) empires[e.id] = e.id === viewerId ? ownEmpire(e) : publicEmpire(state, e, viewerId);

  const colonies: Record<string, Colony> = {};
  for (const c of Object.values(state.colonies)) {
    if (c.empireId === viewerId) colonies[c.id] = c;
    else if (knows(c.systemId)) colonies[c.id] = { ...c, queue: [] }; // foreign build queues are secret
  }
  const stations: Record<string, Station> = {};
  for (const s of Object.values(state.stations)) if (s.empireId === viewerId || knows(s.systemId)) stations[s.id] = s;

  const fleets: Record<string, Fleet> = {};
  for (const f of Object.values(state.fleets)) {
    if (!f.ships.length) continue;
    if (f.empireId === viewerId) {
      fleets[f.id] = f;
      continue;
    }
    const visible = f.transit ? sensors.has(f.transit.from) || sensors.has(f.transit.to) : !!f.systemId && sensors.has(f.systemId);
    if (visible) fleets[f.id] = { ...f, order: null }; // we see ships, not intentions
  }
  const battles: Record<string, Battle> = {};
  for (const b of Object.values(state.battles)) if (sensors.has(b.systemId)) battles[b.id] = b;

  const log: GameLogEntry[] = [];
  for (let i = state.log.length - 1; i >= 0 && log.length < logLimit; i--) {
    const entry = state.log[i];
    if (canSeeLog(entry, viewerId)) log.unshift({ ...entry, audience: undefined, empireId: viewerId });
  }
  return { day: state.day, playerId: viewerId, empires, colonies, stations, fleets, battles, log, winner: state.winner, victoryType: state.victoryType };
}

/** Only the effects a player can witness. */
export function filterEvents(state: GameState, viewerId: string, events: SimEvent[]): SimEvent[] {
  if (!events.length) return events;
  const sensors = sensorSystems(state, viewerId);
  return events.filter((e) => {
    if (e.type === "contact") return e.a === viewerId || e.b === viewerId;
    if (e.type === "shipBuilt") return state.fleets[e.fleetId]?.empireId === viewerId;
    return sensors.has(e.systemId);
  });
}

/** Build a client-side GameState from the static galaxy and a player view. */
export function stateFromView(stat: StaticView, view: PlayerView): GameState {
  return {
    version: stat.version,
    settings: stat.settings,
    day: view.day,
    rngState: 0,
    idCounter: 0,
    systems: stat.systems,
    bodies: stat.bodies,
    tunnels: stat.tunnels,
    empires: view.empires,
    colonies: view.colonies,
    stations: view.stations,
    fleets: view.fleets,
    battles: view.battles,
    log: view.log,
    playerId: view.playerId,
    winner: view.winner,
    victoryType: view.victoryType,
    nextRaid: 0,
  };
}
