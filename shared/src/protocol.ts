import { SystemState, Player, StarSystem, Ship } from "./types";

// Client -> Server messages
export type ClientMessage =
  | { type: "authenticate"; uuid: string | null }
  | { type: "setName"; name: string }
  | { type: "queryGalaxy"; galaxyName: string }
  | { type: "joinGalaxy"; galaxyName: string }
  | { type: "createGalaxy"; galaxyName: string }
  | { type: "resetGalaxy"; galaxyName: string }
  | { type: "requestSystemState"; systemId: string }
  | { type: "setTimeScale"; scale: number }
  | { type: "pauseTime" }
  | { type: "resumeTime" }
  | { type: "shipManeuver"; maneuver: ShipManeuverCommand }
  | { type: "useGate"; gateId: string };

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
    };

// Helper to serialize/deserialize messages
export function serializeMessage(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}

export function deserializeMessage(
  data: string
): ClientMessage | ServerMessage {
  return JSON.parse(data);
}
