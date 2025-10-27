import { NetworkClient } from "./network/client";
import { SceneManager } from "./rendering/scene";
import { HUDManager } from "./ui/hud";
import { Player, StarSystem, Ship } from "@constellation/shared";

class ConstellationClient {
  private network: NetworkClient;
  private scene: SceneManager;
  private hud: HUDManager;

  private player: Player | null = null;
  private system: StarSystem | null = null;
  private ship: Ship | null = null;
  private isPaused = false;
  private lastGalaxyName: string = "";
  private isConnected = false;
  private pendingFocusObjectId: string | null = null; // Object to focus on after system loads
  private animationFrameId: number | null = null;
  private keyboardHandler: ((e: KeyboardEvent) => void) | null = null;
  private isExploringFromConstellation = false; // Flag to stay in constellation view after gate travel

  constructor() {
    const container = document.getElementById("canvas-container")!;

    this.network = new NetworkClient();
    this.scene = new SceneManager(container);
    this.hud = new HUDManager();

    this.setupNetworkHandlers();
    this.setupHUDHandlers();
    this.setupSceneHandlers();
    this.setupKeyboardHandlers();

    // Connect on load
    this.connect();

    this.startRenderLoop();
  }

  private setupNetworkHandlers(): void {
    this.network.onAuthenticated = (uuid, playerId) => {
      console.log("Authenticated:", uuid, playerId);
      if (!playerId) {
        // New player, show galaxy selection
        // Auth modal is already visible
      }
    };

    this.network.onPlayerData = (player) => {
      console.log("Player data received:", player);
      this.player = player;
      this.hud.setPlayer(player);
      // Update explored gates in the scene
      if (player.exploredGateIds) {
        this.scene.setExploredGates(player.exploredGateIds);
      }
    };

    this.network.onSystemData = (system) => {
      console.log("System data received:", system);
      this.system = system;
      this.scene.loadSystem(system);

      // Hide any detail panels from previous system before loading new system
      this.hud.hideDetailPanels();
      this.hud.setSystem(system);

      // If there's a pending focus object (e.g., home planet), focus on it
      if (this.pendingFocusObjectId) {
        const objectId = this.pendingFocusObjectId;
        this.pendingFocusObjectId = null;
        console.log(`Focusing on pending object: ${objectId}`);
        // Wait a bit for the scene to be fully loaded
        setTimeout(() => {
          this.scene.centerOnObject(objectId);
          this.hud.updateObjectDetails(objectId);
        }, 100);
      } else {
        // Show nice system overview when first arriving
        this.scene.showSystemView();
      }
    };

    this.network.onStateUpdate = (state) => {
      this.scene.updateState(state);
      this.hud.updateState(state);

      // Update selected object details if any
      const selectedId = this.scene.getSelectedObjectId();
      if (selectedId) {
        this.hud.updateObjectDetails(selectedId);
      }
    };

    this.network.onTimeUpdate = (currentTime, isPaused, timeScale) => {
      this.isPaused = isPaused;
      this.scene.setTimeState(isPaused, timeScale);
      this.hud.updateTime(currentTime, isPaused, timeScale);
    };

    this.network.onShipData = (ship) => {
      console.log("Ship data received:", ship);
      this.ship = ship;
      this.hud.setShip(ship);
    };

    this.network.onError = (message) => {
      console.error("Network error:", message);

      // If galaxy not found, automatically create it
      if (message === "Galaxy not found" && this.lastGalaxyName) {
        console.log("Galaxy not found, creating:", this.lastGalaxyName);
        this.network.createGalaxy(this.lastGalaxyName);
      } else {
        this.hud.showError(message);
      }
    };

    this.network.onGalaxyCreated = (galaxyId) => {
      console.log("Galaxy created:", galaxyId);
      this.hud.clearError();
    };

    this.network.onGalaxyJoined = (galaxyId) => {
      console.log("Galaxy joined:", galaxyId);
      this.hud.clearError();
      this.hud.hideAuthModal();
    };

    this.network.onGalaxyReset = (galaxyId) => {
      console.log("Galaxy reset:", galaxyId);
      this.hud.clearError();
      // After reset, automatically join the galaxy
      this.network.joinGalaxy(this.lastGalaxyName);
    };

    this.network.onGalaxyInfo = (galaxyName, exists, currentTime) => {
      console.log("Galaxy info:", galaxyName, exists, currentTime);
      this.hud.updateGalaxyTime(galaxyName, exists, currentTime);
    };

    this.network.onGateTravel = (
      destinationSystem,
      exploredGateIds,
      exitGateId
    ) => {
      console.log("Gate travel to system:", destinationSystem.id);
      console.log("Exit gate ID:", exitGateId);
      console.log("Explored gate IDs:", exploredGateIds);
      console.log(
        "System gates:",
        destinationSystem.gates.map((g) => ({ id: g.id, name: g.name }))
      );

      // Update player's current system ID and explored gates FIRST (before rendering UI)
      if (this.player) {
        this.player.currentSystemId = destinationSystem.id;
        this.player.exploredGateIds = exploredGateIds;
        this.scene.setExploredGates(exploredGateIds);
        console.log(
          `Player currentSystemId updated to: ${destinationSystem.id}`
        );
      }

      // Update system data in memory
      this.system = destinationSystem;

      // If we were exploring from constellation view, stay in constellation view
      if (this.isExploringFromConstellation) {
        this.isExploringFromConstellation = false;
        console.log("Reloading constellation view after exploration");

        // Small delay to let the server process everything
        setTimeout(() => {
          this.network.requestConstellation();
        }, 100);
        return;
      }

      // Normal gate travel: load system and animate
      this.scene.loadSystem(destinationSystem);

      // Hide HUD outline during travel
      this.hud.hideOutline();

      // Animate from exit gate to normal view, passing a callback for when done
      this.scene.animateExitGate(exitGateId, () => {
        // Animation complete - show HUD and select exit gate
        this.hud.setSystem(destinationSystem);
        this.scene.centerOnObject(exitGateId);
      });
    };

    this.network.onConstellationData = (
      nodes,
      connections,
      unexploredGates,
      currentSystemId,
      customPositions
    ) => {
      console.log(
        "Constellation data received:",
        nodes.length,
        "nodes,",
        connections.length,
        "connections,",
        unexploredGates.length,
        "mystery gates"
      );
      this.scene.showConstellationView(
        nodes,
        connections,
        unexploredGates,
        currentSystemId,
        customPositions
      );
      this.hud.hideOutline();
    };
  }

  private setupHUDHandlers(): void {
    // Query galaxy info when input changes (with debounce)
    let queryTimeout: number | null = null;
    const galaxyNameInput = document.getElementById(
      "galaxy-name"
    ) as HTMLInputElement;
    galaxyNameInput.addEventListener("input", async () => {
      if (queryTimeout) {
        clearTimeout(queryTimeout);
      }
      queryTimeout = window.setTimeout(async () => {
        const name = galaxyNameInput.value.trim() || "the Milky Way";
        // Connect if not already connected
        if (!this.isConnected) {
          await this.connect();
        }
        this.network.queryGalaxy(name);
      }, 500);
    });

    // Also query on initial load
    (async () => {
      const name = galaxyNameInput.value.trim() || "the Milky Way";
      if (!this.isConnected) {
        await this.connect();
      }
      this.network.queryGalaxy(name);
    })();

    this.hud.onExploreGalaxy = async (name) => {
      // Connect if not already connected
      if (!this.isConnected) {
        await this.connect();
      }
      // Store the name and try to join first
      // If it doesn't exist, it will be created automatically
      this.lastGalaxyName = name;
      this.network.joinGalaxy(name);
    };

    this.hud.onResetGalaxy = async (name) => {
      // Connect if not already connected
      if (!this.isConnected) {
        await this.connect();
      }
      // Reset (delete and recreate) the galaxy
      this.lastGalaxyName = name;
      this.network.resetGalaxy(name);
    };

    this.hud.onNavigateHome = () => {
      if (this.player) {
        console.log(
          `Home button clicked. Current system: ${this.player.currentSystemId}, Home system: ${this.player.homeSystemId}, Home planet: ${this.player.homePlanetId}`
        );

        // Check if home planet ID is valid
        if (!this.player.homePlanetId) {
          console.warn("No home planet ID set for player!");
          // Fallback: just go to home system
          this.network.requestSystemState(this.player.homeSystemId);
          return;
        }

        // If already in home system, just focus on the home planet
        if (
          this.player.currentSystemId === this.player.homeSystemId &&
          this.system
        ) {
          console.log(
            `Already in home system, focusing on planet ${this.player.homePlanetId}`
          );
          this.scene.centerOnObject(this.player.homePlanetId);
          this.hud.updateObjectDetails(this.player.homePlanetId);
        } else {
          // Need to travel to home system first
          console.log(
            `Traveling to home system, will focus on planet ${this.player.homePlanetId}`
          );
          this.pendingFocusObjectId = this.player.homePlanetId;
          this.network.requestSystemState(this.player.homeSystemId);
        }
      }
    };

    this.hud.onNavigateSystem = () => {
      // If in constellation view, return to system view first
      if (this.scene.isInConstellationView()) {
        this.scene.hideConstellationView();
        if (this.system) {
          this.hud.setSystem(this.system);
        }
      }
      // Show nice system overview
      this.scene.showSystemView();
    };

    this.hud.onNavigateConstellation = () => {
      // Request constellation data from server
      this.network.requestConstellation();
    };

    this.hud.onTimeToggle = () => {
      if (this.isPaused) {
        this.network.resumeTime();
      } else {
        this.network.pauseTime();
      }
    };

    this.hud.onSelectObject = (objectId) => {
      console.log("Selecting object from outline:", objectId);
      this.scene.centerOnObject(objectId);
      this.hud.updateObjectDetails(objectId);
    };
  }

  private setupSceneHandlers(): void {
    this.scene.onObjectSelected = (objectId) => {
      console.log("Object selected:", objectId);
      this.hud.updateObjectDetails(objectId);
    };

    this.scene.onGateUse = (gateId) => {
      console.log("Using gate:", gateId);
      // Store entry gate ID for animation
      this.scene.setEntryGate(gateId);
      this.network.useGate(gateId);
    };

    this.scene.onConstellationPositionsChanged = (positions) => {
      console.log("Constellation positions changed, saving...");
      this.network.saveConstellationPositions(positions);
    };

    this.scene.onConstellationSystemSelected = (systemId) => {
      console.log("Constellation system selected:", systemId);
      // Exit constellation view and travel to the selected system
      this.scene.hideConstellationView();
      if (this.system) {
        this.hud.setSystem(this.system);
      }
      // Request the selected system's state
      this.network.requestSystemState(systemId);
    };

    this.scene.onConstellationGateSelected = (gateId) => {
      console.log("Constellation gate selected (exploring):", gateId);
      // Use gate to explore new system, but stay in constellation view
      this.isExploringFromConstellation = true;
      this.network.useGate(gateId);
    };
  }

  private setupKeyboardHandlers(): void {
    this.keyboardHandler = (event: KeyboardEvent) => {
      // Spacebar to toggle pause/play
      if (event.code === "Space") {
        event.preventDefault(); // Prevent page scroll
        if (this.isPaused) {
          this.network.resumeTime();
        } else {
          this.network.pauseTime();
        }
      }
    };
    window.addEventListener("keydown", this.keyboardHandler);
  }

  private async connect(): Promise<void> {
    try {
      await this.network.connect();
      this.isConnected = true;
      console.log("Connected to server");
    } catch (error) {
      console.error("Failed to connect to server:", error);
      this.hud.showError("Failed to connect to server. Please try again.");
    }
  }

  private startRenderLoop(): void {
    const animate = () => {
      this.animationFrameId = requestAnimationFrame(animate);
      this.scene.update();
      this.scene.render();

      // Update HUD with current interpolated game time
      this.hud.updateTime(
        this.scene.getGameTime(),
        this.scene.getIsPaused(),
        this.scene.getTimeScale()
      );
    };
    animate();
  }

  /**
   * Cleanup method to prevent memory leaks
   * Call this when shutting down the application
   */
  dispose(): void {
    // Cancel animation frame
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Remove keyboard listener
    if (this.keyboardHandler) {
      window.removeEventListener("keydown", this.keyboardHandler);
      this.keyboardHandler = null;
    }

    // Dispose components
    this.scene.dispose();
    this.hud.dispose();
    this.network.disconnect();

    // Clear references
    this.player = null;
    this.system = null;
    this.ship = null;

    console.log("ConstellationClient disposed - all resources cleaned up");
  }
}

// Start the application
new ConstellationClient();
