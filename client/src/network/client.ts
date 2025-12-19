import {
  ClientMessage,
  ServerMessage,
  serializeMessage,
  deserializeMessage,
  Player,
  StarSystem,
  SystemState,
  Ship,
  ConstellationNode,
  ConstellationConnection,
  UnexploredGate,
  SearchResult,
} from "@constellation/shared";

export class NetworkClient {
  private ws: WebSocket | null = null;
  private uuid: string | null = null;
  private reconnectAttempts = 0;
  bufferedGalaxyPlayers: {
    metPlayers: { id: string; name: string }[];
    totalPlayers: number;
  } | null = null;

  // Callbacks
  public onAuthenticated:
    | ((uuid: string, playerId: string | null) => void)
    | null = null;
  public onPlayerData: ((player: Player) => void) | null = null;
  public onSystemData:
    | ((
        system: StarSystem,
        gateOwnership?: Array<{
          gateId: string;
          ownerId: string;
          ownerName: string;
          status: "owned_by_self" | "neutral" | "friendly" | "aggressive";
          lastOvertakenAt: number;
        }>,
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
        }>
      ) => void)
    | null = null;
  public onStateUpdate: ((state: SystemState) => void) | null = null;
  public onTimeUpdate:
    | ((currentTime: number, isPaused: boolean, timeScale: number) => void)
    | null = null;
  public onShipData: ((ship: Ship) => void) | null = null;
  public onError: ((message: string) => void) | null = null;
  public onGalaxyCreated:
    | ((galaxyId: string, galaxyName: string) => void)
    | null = null;
  public onEmptyGalaxyCreated:
    | ((galaxyId: string, galaxyName: string) => void)
    | null = null;
  public onGalaxyJoined: ((galaxyId: string) => void) | null = null;
  public onGalaxyReset: ((galaxyId: string) => void) | null = null;
  public onGalaxyInfo:
    | ((galaxyName: string, exists: boolean, currentTime: number) => void)
    | null = null;
  public onGalaxyList: ((galaxies: any[]) => void) | null = null;
  public onPlayerGameInfo: ((info: any) => void) | null = null;
  public onPregeneratedSpecies: ((species: any[]) => void) | null = null;
  public onGalaxySpecies: ((speciesIds: string[]) => void) | null = null;
  public onGateTravel:
    | ((
        destinationSystem: StarSystem,
        exploredGateIds: string[],
        exitGateId: string,
        gateOwnership?: Array<{
          gateId: string;
          ownerId: string;
          ownerName: string;
          status: "owned_by_self" | "neutral" | "friendly" | "aggressive";
          lastOvertakenAt: number;
        }>,
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
        }>,
        isExitGateBlocked?: boolean
      ) => void)
    | null = null;
  public onConstellationData:
    | ((
        nodes: ConstellationNode[],
        connections: ConstellationConnection[],
        unexploredGates: UnexploredGate[],
        currentSystemId: string,
        customPositions: Record<string, { x: number; y: number; z: number }>
      ) => void)
    | null = null;
  public onSearchResults: ((results: SearchResult[]) => void) | null = null;
  public onPlayerDiscovery:
    | ((
        discoveryType: "discovered" | "wasDiscovered",
        playerNames: string[],
        systemName: string
      ) => void)
    | null = null;
  public onGalaxyPlayers:
    | ((
        metPlayers: { id: string; name: string }[],
        totalPlayers: number
      ) => void)
    | null = null;
  public onPlayerStats:
    | ((
        playerId: string,
        playerName: string,
        starsDiscovered: number,
        currentStance?: "neutral" | "friendly" | "aggressive"
      ) => void)
    | null = null;
  public onStanceUpdated:
    | ((
        targetPlayerId: string,
        stance: "neutral" | "friendly" | "aggressive"
      ) => void)
    | null = null;
  public onMiningEstablished:
    | ((
        miningOperationId: string,
        celestialBodyId: string,
        alloyPerDay: number
      ) => void)
    | null = null;
  public onDysonSwarmLaunched:
    | ((
        megastructureId: string,
        starId: string,
        energyPerDay: number,
        count: number,
        maxSwarms: number
      ) => void)
    | null = null;
  public onColonyEstablished: ((colony: any) => void) | null = null;
  public onColonyUpdated: ((colony: any) => void) | null = null;
  public onColonyRemoved: ((planetId: string) => void) | null = null;
  public onSpeciesInfo: ((species: any) => void) | null = null;
  public onGateDefenseBuilt: ((defense: any) => void) | null = null;
  public onGateAttackStarted: ((attack: any) => void) | null = null;
  public onGateAttackUpdate: ((attack: any) => void) | null = null;
  public onGateOvertaken:
    | ((
        gateId: string,
        gateName: string,
        systemName: string,
        newOwnerId: string,
        newOwnerName: string,
        previousOwnerId: string | null,
        overtakeTime: number
      ) => void)
    | null = null;
  public onGateResourceFlow:
    | ((
        gateId: string,
        energyFlow: number,
        alloyFlow: number,
        scienceFlow: number,
        isBlockaded: boolean,
        blockadeOwnerName?: string
      ) => void)
    | null = null;
  public onResourceBreakdown:
    | ((
        breakdown: Array<{
          systemId: string;
          systemName: string;
          starName: string;
          alloyPerDay: number;
        }>
      ) => void)
    | null = null;
  public onTechTreeData:
    | ((
        completedTechs: string[],
        currentResearch: {
          technologyId: string;
          status: "in_progress" | "paused";
          progressDays: number;
          scienceInvested: number;
          scienceNeeded: number;
          daysNeeded: number;
        } | null
      ) => void)
    | null = null;
  public onResearchStarted: ((technologyId: string) => void) | null = null;
  public onResearchPaused: ((technologyId: string) => void) | null = null;
  public onResearchResumed: ((technologyId: string) => void) | null = null;
  public onResearchCompleted:
    | ((technologyId: string, technologyName: string) => void)
    | null = null;
  public onResearchProgressUpdate:
    | ((
        technologyId: string,
        progressDays: number,
        scienceInvested: number
      ) => void)
    | null = null;
  public onDisconnected: (() => void) | null = null;
  public onReconnected: (() => void) | null = null;

  constructor() {
    // Load UUID from localStorage
    this.uuid = localStorage.getItem("constellation-uuid");
  }

  connect(url: string = "ws://localhost:8080"): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log("Connected to server");
        const wasReconnecting = this.reconnectAttempts > 0;
        this.reconnectAttempts = 0;
        this.authenticate();

        // Notify reconnection if this was a reconnect
        if (wasReconnecting && this.onReconnected) {
          this.onReconnected();
        }

        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log("Disconnected from server");

        // Notify disconnection
        if (this.onDisconnected) {
          this.onDisconnected();
        }

        this.attemptReconnect(url);
      };
    });
  }

  private attemptReconnect(url: string): void {
    this.reconnectAttempts++;
    console.log(`Reconnecting... (attempt ${this.reconnectAttempts})`);

    // Cap the delay at 12 seconds (6 attempts * 2000ms)
    const delay = Math.min(2000 * this.reconnectAttempts, 12000);

    setTimeout(() => {
      this.connect(url).catch(console.error);
    }, delay);
  }

  private handleMessage(data: string): void {
    try {
      const message = deserializeMessage(data) as ServerMessage;

      switch (message.type) {
        case "authenticated":
          this.uuid = message.uuid;
          localStorage.setItem("constellation-uuid", message.uuid);
          if (this.onAuthenticated) {
            this.onAuthenticated(message.uuid, message.playerId);
          }
          break;

        case "error":
          console.error("Server error:", message.message);
          if (this.onError) {
            this.onError(message.message);
          }
          break;

        case "playerData":
          if (this.onPlayerData) {
            this.onPlayerData(message.player);
          }
          break;

        case "systemData":
          if (this.onSystemData) {
            this.onSystemData(
              message.system,
              message.gateOwnership,
              message.tunnelOwnership
            );
          }
          break;

        case "stateUpdate":
          if (this.onStateUpdate) {
            this.onStateUpdate(message.state);
          }
          break;

        case "timeUpdate":
          if (this.onTimeUpdate) {
            this.onTimeUpdate(
              message.currentTime,
              message.isPaused,
              message.timeScale
            );
          }
          break;

        case "shipData":
          if (this.onShipData) {
            this.onShipData(message.ship);
          }
          break;

        case "galaxyCreated":
          if (this.onGalaxyCreated) {
            this.onGalaxyCreated(message.galaxyId, message.galaxyName);
          }
          break;

        case "emptyGalaxyCreated":
          if (this.onEmptyGalaxyCreated) {
            this.onEmptyGalaxyCreated(message.galaxyId, message.galaxyName);
          }
          break;

        case "galaxyJoined":
          if (this.onGalaxyJoined) {
            this.onGalaxyJoined(message.galaxyId);
          }
          break;

        case "galaxyReset":
          if (this.onGalaxyReset) {
            this.onGalaxyReset(message.galaxyId);
          }
          break;

        case "galaxyInfo":
          if (this.onGalaxyInfo) {
            this.onGalaxyInfo(
              message.galaxyName,
              message.exists,
              message.currentTime
            );
          }
          break;

        case "galaxyList":
          if (this.onGalaxyList) {
            this.onGalaxyList(message.galaxies);
          }
          break;

        case "playerGameInfo":
          if (this.onPlayerGameInfo) {
            this.onPlayerGameInfo(message);
          }
          break;

        case "pregeneratedSpecies":
          if (this.onPregeneratedSpecies) {
            this.onPregeneratedSpecies(message.species);
          }
          break;

        case "galaxySpecies":
          if (this.onGalaxySpecies) {
            this.onGalaxySpecies(message.speciesIds);
          }
          break;

        case "gateTravel":
          if (this.onGateTravel) {
            this.onGateTravel(
              message.destinationSystem,
              message.exploredGateIds,
              message.exitGateId,
              message.gateOwnership,
              message.tunnelOwnership,
              message.isExitGateBlocked
            );
          }
          break;

        case "constellationData":
          if (this.onConstellationData) {
            this.onConstellationData(
              message.nodes,
              message.connections,
              message.unexploredGates,
              message.currentSystemId,
              message.customPositions
            );
          }
          break;

        case "searchResults":
          if (this.onSearchResults) {
            this.onSearchResults(message.results);
          }
          break;

        case "playerDiscovery":
          if (this.onPlayerDiscovery) {
            this.onPlayerDiscovery(
              message.discoveryType,
              message.playerNames,
              message.systemName
            );
          }
          break;

        case "galaxyPlayers":
          console.log(
            "[DEBUG CLIENT] Received galaxyPlayers message:",
            message
          );
          if (this.onGalaxyPlayers) {
            console.log(
              "[DEBUG CLIENT] Calling onGalaxyPlayers callback with:",
              message.metPlayers,
              message.totalPlayers
            );
            this.onGalaxyPlayers(message.metPlayers, message.totalPlayers);
          } else {
            console.log(
              "[DEBUG CLIENT] No onGalaxyPlayers callback set! Buffering data."
            );
            this.bufferedGalaxyPlayers = {
              metPlayers: message.metPlayers,
              totalPlayers: message.totalPlayers,
            };
          }
          break;

        case "playerStats":
          if (this.onPlayerStats) {
            this.onPlayerStats(
              message.playerId,
              message.playerName,
              message.starsDiscovered,
              message.currentStance
            );
          }
          break;
        case "stanceUpdated":
          if (this.onStanceUpdated) {
            this.onStanceUpdated(message.targetPlayerId, message.stance);
          }
          break;
        case "miningEstablished":
          if (this.onMiningEstablished) {
            this.onMiningEstablished(
              message.miningOperationId,
              message.celestialBodyId,
              message.alloyPerDay
            );
          }
          break;
        case "dysonSwarmLaunched":
          if (this.onDysonSwarmLaunched) {
            this.onDysonSwarmLaunched(
              message.megastructureId,
              message.starId,
              message.energyPerDay,
              message.count,
              message.maxSwarms
            );
          }
          break;
        case "colonyEstablished":
          if (this.onColonyEstablished) {
            this.onColonyEstablished(message.colony);
          }
          break;
        case "colonyUpdated":
          if (this.onColonyUpdated) {
            this.onColonyUpdated(message.colony);
          }
          break;
        case "colonyRemoved":
          if (this.onColonyRemoved) {
            this.onColonyRemoved(message.planetId);
          }
          break;
        case "speciesInfo":
          if (this.onSpeciesInfo) {
            this.onSpeciesInfo(message.species);
          }
          break;
        case "gateDefenseBuilt":
          if (this.onGateDefenseBuilt) {
            this.onGateDefenseBuilt(message.defense);
          }
          break;
        case "gateAttackStarted":
          if (this.onGateAttackStarted) {
            this.onGateAttackStarted(message.attack);
          }
          break;
        case "gateAttackUpdate":
          if (this.onGateAttackUpdate) {
            this.onGateAttackUpdate(message.attack);
          }
          break;
        case "gateOvertaken":
          if (this.onGateOvertaken) {
            this.onGateOvertaken(
              message.gateId,
              message.gateName,
              message.systemName,
              message.newOwnerId,
              message.newOwnerName,
              message.previousOwnerId,
              message.overtakeTime
            );
          }
          break;
        case "gateResourceFlow":
          if (this.onGateResourceFlow) {
            this.onGateResourceFlow(
              message.gateId,
              message.energyFlow,
              message.alloyFlow,
              message.scienceFlow,
              message.isBlockaded,
              message.blockadeOwnerName
            );
          }
          break;
        case "resourceBreakdown":
          if (this.onResourceBreakdown) {
            this.onResourceBreakdown(message.breakdown);
          }
          break;
        case "techTreeData":
          if (this.onTechTreeData) {
            this.onTechTreeData(
              message.completedTechs,
              message.currentResearch
            );
          }
          break;
        case "researchStarted":
          if (this.onResearchStarted) {
            this.onResearchStarted(message.technologyId);
          }
          break;
        case "researchPaused":
          if (this.onResearchPaused) {
            this.onResearchPaused(message.technologyId);
          }
          break;
        case "researchResumed":
          if (this.onResearchResumed) {
            this.onResearchResumed(message.technologyId);
          }
          break;
        case "researchCompleted":
          console.log(
            `[Network] 📡 Received researchCompleted message:`,
            message
          );
          if (this.onResearchCompleted) {
            console.log(`[Network] Calling onResearchCompleted callback...`);
            this.onResearchCompleted(
              message.technologyId,
              message.technologyName
            );
          } else {
            console.warn(`[Network] ⚠️ onResearchCompleted callback not set!`);
          }
          break;
        case "researchProgressUpdate":
          if (this.onResearchProgressUpdate) {
            this.onResearchProgressUpdate(
              message.technologyId,
              message.progressDays,
              message.scienceInvested
            );
          }
          break;
      }
    } catch (error) {
      console.error("Error handling message:", error);
    }
  }

  private send(message: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(serializeMessage(message));
    }
  }

  authenticate(): void {
    this.send({ type: "authenticate", uuid: this.uuid });
  }

  setName(name: string): void {
    this.send({ type: "setName", name });
  }

  getGalaxyList(): void {
    this.send({ type: "getGalaxyList" });
  }

  getPlayerGameInfo(): void {
    this.send({ type: "getPlayerGameInfo" });
  }

  getPregeneratedSpecies(): void {
    this.send({ type: "getPregeneratedSpecies" });
  }

  getGalaxySpecies(galaxyId: string): void {
    this.send({ type: "getGalaxySpecies", galaxyId });
  }

  createEmptyGalaxy(): void {
    this.send({ type: "createEmptyGalaxy" });
  }

  joinGalaxy(galaxyId: string, playerName: string, speciesId: string): void {
    this.send({ type: "joinGalaxy", galaxyId, playerName, speciesId });
  }

  createGalaxy(playerName: string, speciesId: string): void {
    this.send({ type: "createGalaxy", playerName, speciesId });
  }

  resetGalaxy(galaxyName: string, playerName: string): void {
    this.send({ type: "resetGalaxy", galaxyName, playerName });
  }

  queryGalaxy(galaxyName: string): void {
    this.send({ type: "queryGalaxy", galaxyName });
  }

  requestSystemState(systemId: string): void {
    this.send({ type: "requestSystemState", systemId });
  }

  setTimeScale(scale: number): void {
    this.send({ type: "setTimeScale", scale });
  }

  pauseTime(): void {
    this.send({ type: "pauseTime" });
  }

  resumeTime(): void {
    this.send({ type: "resumeTime" });
  }

  useGate(gateId: string): void {
    this.send({ type: "useGate", gateId });
  }

  requestConstellation(): void {
    this.send({ type: "requestConstellation" });
  }

  saveConstellationPositions(
    positions: Record<string, { x: number; y: number; z: number }>
  ): void {
    this.send({ type: "saveConstellationPositions", positions });
  }

  searchObjects(query: string): void {
    this.send({ type: "searchObjects", query });
  }

  requestPlayerStats(playerId: string): void {
    this.send({ type: "requestPlayerStats", playerId });
  }

  setPlayerStance(
    targetPlayerId: string,
    stance: "neutral" | "friendly" | "aggressive"
  ): void {
    this.send({ type: "setPlayerStance", targetPlayerId, stance });
  }

  establishMining(celestialBodyId: string): void {
    this.send({ type: "establishMining", celestialBodyId });
  }

  establishHelium3Extraction(celestialBodyId: string): void {
    this.send({ type: "establishHelium3Extraction", celestialBodyId });
  }

  launchDysonSwarm(starId: string): void {
    this.send({ type: "launchDysonSwarm", starId });
  }

  establishColony(
    planetId: string,
    specialization: "balanced" | "research" | "industrial"
  ): void {
    this.send({ type: "establishColony", planetId, specialization });
  }

  removeColony(planetId: string): void {
    this.send({ type: "removeColony", planetId });
  }

  updateColonySpecialization(
    colonyId: string,
    specialization: "balanced" | "research" | "industrial"
  ): void {
    this.send({ type: "updateColonySpecialization", colonyId, specialization });
  }

  requestSpeciesInfo(speciesId: string): void {
    this.send({ type: "requestSpeciesInfo", speciesId });
  }

  fortifyGate(gateId: string): void {
    this.send({ type: "fortifyGate", gateId });
  }

  attackGate(gateId: string): void {
    this.send({ type: "attackGate", gateId });
  }

  overtakeGate(gateId: string): void {
    this.send({ type: "overtakeGate", gateId });
  }

  captureGate(gateId: string): void {
    this.send({ type: "captureGate", gateId });
  }

  overtakeTunnel(tunnelId: string): void {
    this.send({ type: "overtakeTunnel", tunnelId });
  }

  powerOffTunnel(tunnelId: string): void {
    this.send({ type: "powerOffTunnel", tunnelId });
  }

  powerOnTunnel(tunnelId: string): void {
    this.send({ type: "powerOnTunnel", tunnelId });
  }

  overchargeTunnel(tunnelId: string): void {
    this.send({ type: "overchargeTunnel", tunnelId });
  }

  debugAddResource(
    resourceType: "energy" | "alloy" | "science",
    amount: number
  ): void {
    console.log(
      `[NetworkClient] Sending debugAddResource: ${resourceType} +${amount}`
    );
    this.send({ type: "debugAddResource", resourceType, amount });
  }

  debugConnectGate(gateId: string): void {
    console.log(`[NetworkClient] Sending debugConnectGate for gate: ${gateId}`);
    this.send({ type: "debugConnectGate", gateId });
  }

  requestResourceBreakdown(): void {
    this.send({ type: "requestResourceBreakdown" });
  }

  /**
   * Request tech tree data
   */
  requestTechTree(): void {
    this.send({ type: "requestTechTree" });
  }

  /**
   * Start researching a technology
   */
  startResearch(technologyId: string): void {
    this.send({ type: "startResearch", technologyId });
  }

  /**
   * Pause current research
   */
  pauseResearch(technologyId: string): void {
    this.send({ type: "pauseResearch", technologyId });
  }

  /**
   * Resume paused research
   */
  resumeResearch(technologyId: string): void {
    this.send({ type: "resumeResearch", technologyId });
  }

  /**
   * Disconnect from the server and cleanup
   */
  disconnect(): void {
    if (this.ws) {
      // Remove event listeners before closing
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;

      // Close connection
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }

      this.ws = null;
    }

    // Clear all callbacks
    this.onAuthenticated = null;
    this.onPlayerData = null;
    this.onSystemData = null;
    this.onStateUpdate = null;
    this.onTimeUpdate = null;
    this.onShipData = null;
    this.onError = null;
    this.onGalaxyCreated = null;
    this.onGalaxyJoined = null;
    this.onGalaxyReset = null;
    this.onGalaxyInfo = null;
    this.onGateTravel = null;

    console.log("NetworkClient disconnected and cleaned up");
  }
}
