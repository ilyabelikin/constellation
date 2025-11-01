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
  private maxReconnectAttempts = 5;

  // Callbacks
  public onAuthenticated:
    | ((uuid: string, playerId: string | null) => void)
    | null = null;
  public onPlayerData: ((player: Player) => void) | null = null;
  public onSystemData: ((system: StarSystem) => void) | null = null;
  public onStateUpdate: ((state: SystemState) => void) | null = null;
  public onTimeUpdate:
    | ((currentTime: number, isPaused: boolean, timeScale: number) => void)
    | null = null;
  public onShipData: ((ship: Ship) => void) | null = null;
  public onError: ((message: string) => void) | null = null;
  public onGalaxyCreated: ((galaxyId: string) => void) | null = null;
  public onGalaxyJoined: ((galaxyId: string) => void) | null = null;
  public onGalaxyReset: ((galaxyId: string) => void) | null = null;
  public onGalaxyInfo:
    | ((galaxyName: string, exists: boolean, currentTime: number) => void)
    | null = null;
  public onGateTravel:
    | ((
        destinationSystem: StarSystem,
        exploredGateIds: string[],
        exitGateId: string
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
    | ((discoveryType: "discovered" | "wasDiscovered", playerNames: string[], systemName: string) => void)
    | null = null;
  public onGalaxyPlayers:
    | ((metPlayers: { id: string; name: string }[], totalPlayers: number) => void)
    | null = null;
  public onPlayerStats:
    | ((playerId: string, playerName: string, starsDiscovered: number) => void)
    | null = null;

  constructor() {
    // Load UUID from localStorage
    this.uuid = localStorage.getItem("constellation-uuid");
  }

  connect(url: string = "ws://localhost:8080"): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log("Connected to server");
        this.reconnectAttempts = 0;
        this.authenticate();
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
        this.attemptReconnect(url);
      };
    });
  }

  private attemptReconnect(url: string): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
      );
      setTimeout(() => {
        this.connect(url).catch(console.error);
      }, 2000 * this.reconnectAttempts);
    }
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
            this.onSystemData(message.system);
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
            this.onGalaxyCreated(message.galaxyId);
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

        case "gateTravel":
          if (this.onGateTravel) {
            this.onGateTravel(
              message.destinationSystem,
              message.exploredGateIds,
              message.exitGateId
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
            this.onPlayerDiscovery(message.discoveryType, message.playerNames, message.systemName);
          }
          break;

        case "galaxyPlayers":
          if (this.onGalaxyPlayers) {
            this.onGalaxyPlayers(message.metPlayers, message.totalPlayers);
          }
          break;

        case "playerStats":
          if (this.onPlayerStats) {
            this.onPlayerStats(message.playerId, message.playerName, message.starsDiscovered);
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

  joinGalaxy(galaxyName: string, playerName: string): void {
    this.send({ type: "joinGalaxy", galaxyName, playerName });
  }

  createGalaxy(galaxyName: string, playerName: string): void {
    this.send({ type: "createGalaxy", galaxyName, playerName });
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
