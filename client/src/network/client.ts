import {
  ClientMessage,
  ServerMessage,
  serializeMessage,
  deserializeMessage,
  Player,
  StarSystem,
  SystemState,
  Ship,
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

  joinGalaxy(galaxyName: string): void {
    this.send({ type: "joinGalaxy", galaxyName });
  }

  createGalaxy(galaxyName: string): void {
    this.send({ type: "createGalaxy", galaxyName });
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
}

