import {
  SystemState,
  Player,
  StarSystem,
  Ship,
  ConstellationNode,
  ConstellationConnection,
  UnexploredGate,
  MiningOperation,
  Species,
  Colony,
  NativeCivilization,
  GateDefense,
  GateAttack,
} from "./types.js";

// Client -> Server messages
export type ClientMessage =
  | { type: "authenticate"; uuid: string | null }
  | { type: "setName"; name: string }
  | { type: "queryGalaxy"; galaxyName: string }
  | { type: "getGalaxyList" }
  | { type: "getPlayerGameInfo" }
  | { type: "getPregeneratedSpecies" }
  | { type: "getGalaxySpecies"; galaxyId: string }
  | { type: "createEmptyGalaxy" }
  | {
      type: "joinGalaxy";
      galaxyId: string;
      playerName: string;
      speciesId: string;
    }
  | { type: "createGalaxy"; playerName: string; speciesId: string }
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
      type: "proposeRelationship";
      targetPlayerId: string;
      relationshipType: "friendly";
    }
  | {
      type: "respondToProposal";
      proposalId: string;
      accept: boolean;
    }
  | {
      type: "declareWar";
      targetPlayerId: string;
    }
  | {
      type: "requestRelationshipStatus";
    }
  | {
      type: "establishMining";
      celestialBodyId: string;
    }
  | {
      type: "establishHelium3Extraction";
      celestialBodyId: string;
    }
  | {
      type: "launchDysonSwarm";
      starId: string;
    }
  | {
      type: "buildSpaceElevator";
      planetId: string;
    }
  | {
      type: "debugAddResource";
      resourceType: "energy" | "alloy" | "science";
      amount: number;
    }
  | {
      type: "debugConnectGate";
      gateId: string;
    }
  | {
      type: "establishColony";
      planetId: string;
      specialization: "balanced" | "research" | "industrial";
    }
  | {
      type: "invadeColony";
      planetId: string;
    }
  | {
      type: "removeColony";
      planetId: string;
    }
  | {
      type: "updateColonySpecialization";
      colonyId: string;
      specialization: "balanced" | "research" | "industrial";
    }
  | {
      type: "requestSpeciesInfo";
      speciesId: string;
    }
  | {
      type: "fortifyGate";
      gateId: string;
    }
  | {
      type: "attackGate";
      gateId: string;
    }
  | {
      type: "overtakeGate";
      gateId: string;
    }
  | {
      type: "captureGate";
      gateId: string;
    }
  | {
      type: "overtakeTunnel";
      tunnelId: string;
    }
  | {
      type: "powerOffTunnel";
      tunnelId: string;
    }
  | {
      type: "powerOnTunnel";
      tunnelId: string;
    }
  | {
      type: "overchargeTunnel";
      tunnelId: string;
    }
  | { type: "requestResourceBreakdown" }
  | { type: "requestTechTree" }
  | {
      type: "startResearch";
      technologyId: string;
    }
  | {
      type: "pauseResearch";
      technologyId: string;
    }
  | {
      type: "resumeResearch";
      technologyId: string;
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
  | {
      type: "systemData";
      system: StarSystem;
      isConnectedToCapital?: boolean;
      gateOwnership?: Array<{
        gateId: string;
        ownerId: string;
        ownerName: string;
        status: "owned_by_self" | "neutral" | "friendly" | "aggressive";
        lastOvertakenAt: number;
      }>;
      tunnelOwnership?: Array<{
        gateId: string;
        tunnelId: string;
        thisGateOwnerId?: string;
        thisGateOwnerName?: string;
        thisGateStatus?:
          | "owned_by_self"
          | "neutral"
          | "friendly"
          | "aggressive";
        thisGateDefenseCount?: number;
        otherGateOwnerId?: string;
        otherGateOwnerName?: string;
        otherGateStatus?:
          | "owned_by_self"
          | "neutral"
          | "friendly"
          | "aggressive";
        otherGateDefenseCount?: number;
        tunnelPoweredBy?: string | null;
      }>;
    }
  | { type: "stateUpdate"; state: SystemState }
  | {
      type: "timeUpdate";
      currentTime: number;
      isPaused: boolean;
      timeScale: number;
    }
  | { type: "shipData"; ship: Ship }
  | { type: "galaxyCreated"; galaxyId: string; galaxyName: string }
  | { type: "emptyGalaxyCreated"; galaxyId: string; galaxyName: string }
  | { type: "galaxyJoined"; galaxyId: string }
  | { type: "galaxyReset"; galaxyId: string }
  | {
      type: "galaxyInfo";
      galaxyName: string;
      exists: boolean;
      currentTime: number;
    }
  | {
      type: "galaxyList";
      galaxies: Array<{
        id: string;
        name: string;
        createdAt: number;
        currentTime: number;
        starCount: number;
        habitablePlanets: number;
        activePlayers: number;
        lastActivity: number;
      }>;
    }
  | {
      type: "playerGameInfo";
      hasGame: boolean;
      playerName?: string;
      galaxyId?: string;
      galaxyName?: string;
      speciesName?: string;
      currentSystemId?: string;
    }
  | {
      type: "pregeneratedSpecies";
      species: Species[];
    }
  | {
      type: "galaxySpecies";
      speciesIds: string[];
    }
  | {
      type: "gateTravel";
      destinationSystem: StarSystem;
      exploredGateIds: string[];
      exitGateId: string;
      isExitGateBlocked?: boolean;
      isConnectedToCapital?: boolean;
      gateOwnership?: Array<{
        gateId: string;
        ownerId: string;
        ownerName: string;
        status: "owned_by_self" | "neutral" | "friendly" | "aggressive";
        lastOvertakenAt: number;
      }>;
      tunnelOwnership?: Array<{
        gateId: string;
        tunnelId: string;
        thisGateOwnerId?: string;
        thisGateOwnerName?: string;
        thisGateStatus?:
          | "owned_by_self"
          | "neutral"
          | "friendly"
          | "aggressive";
        thisGateDefenseCount?: number;
        otherGateOwnerId?: string;
        otherGateOwnerName?: string;
        otherGateStatus?:
          | "owned_by_self"
          | "neutral"
          | "friendly"
          | "aggressive";
        otherGateDefenseCount?: number;
        tunnelPoweredByPlayerId?: string | null;
        tunnelPoweredByPlayerName?: string | null;
        overchargedAt?: number | null;
      }>;
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
      metPlayers: { id: string; name: string; speciesId: string; speciesName: string }[];
      totalPlayers: number;
    }
  | {
      type: "playerStats";
      playerId: string;
      playerName: string;
      starsDiscovered: number;
      currentRelationship?: "neutral" | "friendly" | "at_war";
    }
  | {
      type: "relationshipChanged";
      otherPlayerId: string;
      otherPlayerName: string;
      relationship: "neutral" | "friendly" | "at_war";
    }
  | {
      type: "relationshipProposalReceived";
      proposal: {
        id: string;
        fromPlayerId: string;
        fromPlayerName: string;
        proposalType: "friendly";
        createdAt: number;
      };
    }
  | {
      type: "relationshipProposalSent";
      proposal: {
        id: string;
        toPlayerId: string;
        toPlayerName: string;
        proposalType: "friendly";
        createdAt: number;
      };
    }
  | {
      type: "proposalAccepted";
      playerId: string;
      playerName: string;
    }
  | {
      type: "proposalRejected";
      playerId: string;
      playerName: string;
    }
  | {
      type: "relationshipStatus";
      relationships: Array<{
        playerId: string;
        playerName: string;
        relationship: "neutral" | "friendly" | "at_war";
      }>;
      incomingProposals: Array<{
        id: string;
        fromPlayerId: string;
        fromPlayerName: string;
        proposalType: "friendly";
        createdAt: number;
      }>;
      outgoingProposals: Array<{
        id: string;
        toPlayerId: string;
        toPlayerName: string;
        proposalType: "friendly";
        createdAt: number;
      }>;
    }
  | {
      type: "miningEstablished";
      miningOperationId: string;
      celestialBodyId: string;
      alloyPerDay: number;
    }
  | {
      type: "helium3Established";
      helium3OperationId: string;
      celestialBodyId: string;
      energyPerDay: number;
    }
  | {
      type: "dysonSwarmLaunched";
      megastructureId: string;
      starId: string;
      energyPerDay: number;
      count: number;
      maxSwarms: number;
    }
  | {
      type: "colonyEstablished";
      colony: Colony;
    }
  | {
      type: "colonyInvaded";
      colony: Colony;
      previousOwnerId: string;
    }
  | {
      type: "colonyUpdated";
      colony: Colony;
    }
  | {
      type: "colonyRemoved";
      planetId: string;
    }
  | {
      type: "colonyAbandoned";
      planetId: string;
      planetName: string;
    }
  | {
      type: "colonyStarving";
      planetId: string;
      planetName: string;
      starvationSeverity: number;
      scienceDeficit: number;
      alloyDeficit: number;
    }
  | {
      type: "speciesInfo";
      species: Species;
    }
  | {
      type: "nativeCivilizationDiscovered";
      civilization: NativeCivilization;
      species: Species;
    }
  | {
      type: "gateDefenseBuilt";
      defense: GateDefense;
    }
  | {
      type: "gateAttackStarted";
      attack: GateAttack;
    }
  | {
      type: "gateAttackUpdate";
      attack: GateAttack;
    }
  | {
      type: "gateOvertaken";
      gateId: string;
      gateName: string;
      systemName: string;
      newOwnerId: string;
      newOwnerName: string;
      previousOwnerId: string | null;
      overtakeTime: number;
    }
  | {
      type: "gateResourceFlow";
      gateId: string;
      energyFlow: number;
      alloyFlow: number;
      scienceFlow: number;
      isBlockaded: boolean;
      blockadeOwnerName?: string;
    }
  | {
      type: "resourceBreakdown";
      breakdown: {
        systemId: string;
        systemName: string;
        starName: string;
        alloyPerDay: number;
      }[];
    }
  | {
      type: "playerIncomeUpdate";
      energyPerDay: number;
      alloyPerDay: number;
      sciencePerDay: number;
    }
  | {
      type: "techTreeData";
      completedTechs: string[]; // IDs of completed technologies
      currentResearch: {
        technologyId: string;
        status: "in_progress" | "paused";
        progressDays: number;
        scienceInvested: number;
        scienceNeeded: number;
        daysNeeded: number;
      } | null;
    }
  | {
      type: "researchStarted";
      technologyId: string;
    }
  | {
      type: "researchPaused";
      technologyId: string;
    }
  | {
      type: "researchResumed";
      technologyId: string;
    }
  | {
      type: "researchCompleted";
      technologyId: string;
      technologyName: string;
    }
  | {
      type: "researchProgressUpdate";
      technologyId: string;
      progressDays: number;
      scienceInvested: number;
    }
  | { type: "gameOver"; reason: string };

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
