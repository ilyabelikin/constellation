import {
  SystemState,
  Player,
  StarSystem,
  Ship,
  ConstellationNode,
  ConstellationConnection,
  UnexploredGate,
  MiningOperation,
} from "./types.js";

// Client -> Server messages
export type ClientMessage =
  | { type: "authenticate"; uuid: string | null }
  | { type: "setName"; name: string }
  | { type: "queryGalaxy"; galaxyName: string }
  | { type: "joinGalaxy"; galaxyName: string; playerName: string }
  | { type: "createGalaxy"; galaxyName: string; playerName: string }
  | { type: "resetGalaxy"; galaxyName: string; playerName: string }
  | { type: "requestSystemState"; systemId: string }
  | { type: "setTimeScale"; scale: number }
  | { type: "pauseTime" }
  | { type: "resumeTime" }
  | { type: "shipManeuver"; maneuver: ShipManeuverCommand }
  | { type: "useGate"; gateId: string }
  | { type: "requestConstellation" }
  | {
      type: "saveConstellationPositions";
      positions: Record<string, { x: number; y: number; z: number }>;
    }
  | { type: "searchObjects"; query: string }
  | { type: "requestPlayerStats"; playerId: string }
  | {
      type: "setPlayerStance";
      targetPlayerId: string;
      stance: "neutral" | "friendly" | "aggressive";
    }
  | {
      type: "establishMining";
      celestialBodyId: string;
    }
  | {
      type: "launchDysonSwarm";
      starId: string;
    };

export interface ShipManeuverCommand {
  shipId: string;
  deltaV: { x: number; y: number; z: number };
  timestamp: number;
}

// Server -> Client messages
export type ServerMessage =
  | { type: "authenticated"; uuid: string; playerId: string | null }
  | { type: "error"; message: string }
  | { type: "playerData"; player: Player }
  | { type: "systemData"; system: StarSystem }
  | { type: "stateUpdate"; state: SystemState }
  | {
      type: "timeUpdate";
      currentTime: number;
      isPaused: boolean;
      timeScale: number;
    }
  | { type: "shipData"; ship: Ship }
  | { type: "galaxyCreated"; galaxyId: string }
  | { type: "galaxyJoined"; galaxyId: string }
  | { type: "galaxyReset"; galaxyId: string }
  | {
      type: "galaxyInfo";
      galaxyName: string;
      exists: boolean;
      currentTime: number;
    }
  | {
      type: "gateTravel";
      destinationSystem: StarSystem;
      exploredGateIds: string[];
      exitGateId: string;
    }
  | {
      type: "constellationData";
      nodes: ConstellationNode[];
      connections: ConstellationConnection[];
      unexploredGates: UnexploredGate[];
      currentSystemId: string;
      customPositions: Record<string, { x: number; y: number; z: number }>;
    }
  | {
      type: "searchResults";
      results: SearchResult[];
    }
  | {
      type: "playerDiscovery";
      discoveryType: "discovered" | "wasDiscovered";
      playerNames: string[];
      systemName: string;
    }
  | {
      type: "galaxyPlayers";
      metPlayers: { id: string; name: string }[];
      totalPlayers: number;
    }
  | {
      type: "playerStats";
      playerId: string;
      playerName: string;
      starsDiscovered: number;
      currentStance?: "neutral" | "friendly" | "aggressive";
    }
  | {
      type: "stanceUpdated";
      targetPlayerId: string;
      stance: "neutral" | "friendly" | "aggressive";
    }
  | {
      type: "miningEstablished";
      miningOperationId: string;
      celestialBodyId: string;
      alloyPerDay: number;
    }
  | {
      type: "dysonSwarmLaunched";
      megastructureId: string;
      starId: string;
      energyPerDay: number;
      count: number;
    };

export interface SearchResult {
  objectId: string;
  objectName: string;
  objectType: string;
  systemId: string;
  systemName: string;
  starName: string;
}

// Helper to serialize/deserialize messages
export function serializeMessage(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}

export function deserializeMessage(
  data: string
): ClientMessage | ServerMessage {
  return JSON.parse(data);
}
