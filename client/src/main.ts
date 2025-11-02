import { NetworkClient } from "./network/client";
import { SceneManager } from "./rendering/scene";
import { HUDManager } from "./ui/hud";
import {
  Player,
  StarSystem,
  Ship,
  ConstellationNode,
} from "@constellation/shared";

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
  private constellationNodes: ConstellationNode[] = []; // Store constellation data for system details
  private constellationSelectedSystemId: string | null = null; // Remember selected system when exploring

  constructor() {
    const container = document.getElementById("canvas-container")!;

    this.network = new NetworkClient();
    this.scene = new SceneManager(container);
    this.hud = new HUDManager();
    this.hud.setNetworkClient(this.network);

    this.setupNetworkHandlers();
    this.setupHUDHandlers();
    this.setupSceneHandlers();
    this.setupKeyboardHandlers();
    this.setupDebugHandlers();

    // Set up keyboard blocking for modals
    this.scene.shouldBlockKeyboardInput = () => this.hud.isSearchModalOpen();

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
      // Set current player ID for gate ownership checks
      this.scene.setCurrentPlayerId(player.id);
    };

    this.network.onSystemData = (system, gateOwnership) => {
      console.log("System data received:", system);
      const isSystemRefresh = this.system && this.system.id === system.id;

      // Store current selection before updating
      const previousSelection = isSystemRefresh
        ? (this.hud as any).selectedObjectId
        : null;

      this.system = system;

      // Update gate ownership information if provided
      if (gateOwnership && gateOwnership.length > 0) {
        this.scene.clearGateOwnership();
        this.hud.clearGateOwnership();
        for (const ownership of gateOwnership) {
          this.scene.setGateOwnership(
            ownership.gateId,
            ownership.ownerId,
            ownership.ownerName,
            ownership.status
          );
          this.hud.setGateOwnership(
            ownership.gateId,
            ownership.ownerId,
            ownership.ownerName,
            ownership.status
          );
        }
      }

      // Only reload the scene when switching to a different system
      // For same-system refreshes (like after mining), just update the data
      if (!isSystemRefresh) {
        this.scene.loadSystem(system);
        this.hud.hideDetailPanels();
        // Always show system view first to ensure scene is properly initialized
        this.scene.showSystemView();
      } else {
        // For same-system refreshes, update system data (megastructures, mining operations, etc.)
        // This ensures the scene has the latest data for state updates to work correctly
        this.scene.updateSystemData(system);
      }

      // Always update HUD with new system data (including mining operations)
      this.hud.setSystem(system);

      // Restore selection after system refresh
      if (isSystemRefresh && previousSelection && this.hud.onSelectObject) {
        setTimeout(() => {
          if (this.hud.onSelectObject) {
            this.hud.onSelectObject(previousSelection);
          }
        }, 0);
      }

      // Only auto-select for new systems (not refreshes)
      if (!isSystemRefresh) {
        // If there's a pending focus object (e.g., home planet), focus on it after scene is ready
        if (this.pendingFocusObjectId) {
          const objectId = this.pendingFocusObjectId;
          this.pendingFocusObjectId = null;
          console.log(`Focusing on pending object: ${objectId}`);
          // Wait for the next animation frame to ensure scene is fully rendered
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              this.scene.centerOnObject(objectId);
              this.hud.updateObjectDetails(objectId);
            });
          });
        } else {
          // No pending focus object, auto-select the main star
          console.log(`Auto-selecting main star: ${system.star.id}`);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              this.scene.centerOnObject(system.star.id);
              this.hud.updateObjectDetails(system.star.id);
            });
          });
        }
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
      // Show user-friendly notifications for resource errors
      if (
        message.includes("Not enough energy") ||
        message.includes("Not enough alloy")
      ) {
        this.hud.showNotification(message, 3000);
      } else {
        // Log other errors to console
        console.error("Network error:", message);
      }

      // If galaxy not found, automatically create it
      if (message === "Galaxy not found" && this.lastGalaxyName) {
        console.log("Galaxy not found, creating:", this.lastGalaxyName);
        const playerName = this.hud.getPlayerName();
        this.network.createGalaxy(this.lastGalaxyName, playerName);
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
      const playerName = this.hud.getPlayerName();
      this.network.joinGalaxy(this.lastGalaxyName, playerName);
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
      // BUT: Check if entry gate was explored BEFORE updating, so we can show correct color in animation
      // player.exploredGateIds is an array, so convert to Set for easier checking
      const oldExploredGateIds = this.player?.exploredGateIds || [];
      const oldExploredGateIdsSet = new Set(oldExploredGateIds);
      const entryGateId = this.scene.getEntryGateId(); // Get entry gate ID before updating
      const wasEntryGateExplored = entryGateId
        ? oldExploredGateIdsSet.has(entryGateId)
        : true;

      console.log(
        "Entry gate exploration check - entryGateId:",
        entryGateId,
        "wasExplored:",
        wasEntryGateExplored,
        "oldExploredGates:",
        oldExploredGateIds
      );

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
        console.log("Reloading constellation view after exploration");

        // Small delay to let the server process everything
        setTimeout(() => {
          this.network.requestConstellation();
        }, 100);
        return;
      }

      // Normal gate travel: animate FIRST, then load system during animation
      // Hide HUD outline during travel
      this.hud.hideOutline();

      // Start the gate travel animation with the current system's entry gate
      // The new system will be loaded during the animation (in the flash phase)
      // The animation will end with the camera positioned at the exit gate
      // Pass wasEntryGateExplored so animation shows correct color (purple for unexplored)
      this.scene.animateGateTravel(
        destinationSystem,
        exitGateId,
        () => {
          // Animation complete - camera is now at the exit gate (zoomed in)
          // Exit animation will automatically move outward from gate
          this.hud.setSystem(destinationSystem);

          // Exit animation will smoothly transition to star automatically
          // No need for separate transition - it's handled in the exit animation
        },
        wasEntryGateExplored
      );
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
      this.constellationNodes = nodes; // Store for system details

      // Update gate ownership from connections (both scene and HUD)
      this.scene.clearGateOwnership();
      this.hud.clearGateOwnership();
      for (const conn of connections) {
        if (conn.gateId && conn.ownerId && conn.ownerName && conn.status) {
          this.scene.setGateOwnership(
            conn.gateId,
            conn.ownerId,
            conn.ownerName,
            conn.status
          );
          this.hud.setGateOwnership(
            conn.gateId,
            conn.ownerId,
            conn.ownerName,
            conn.status
          );
        }
      }

      // Preserve selection if we're reloading after gate exploration
      const preserveSelection = this.isExploringFromConstellation
        ? this.constellationSelectedSystemId
        : null;

      const selectedSystemId = this.scene.showConstellationView(
        nodes,
        connections,
        unexploredGates,
        currentSystemId,
        customPositions,
        preserveSelection
      );
      this.hud.hideOutline();

      // Show details for selected system
      if (selectedSystemId) {
        const selectedNode = nodes.find((n) => n.systemId === selectedSystemId);
        if (selectedNode) {
          this.hud.showConstellationSystemDetails(selectedNode);
          // Don't auto-center camera - let user control their view
        }
      }

      // Clear the preserved selection and flag after using it
      if (this.isExploringFromConstellation) {
        this.constellationSelectedSystemId = null;
        this.isExploringFromConstellation = false;
      }
    };

    this.network.onSearchResults = (results) => {
      console.log("Search results received:", results.length, "results");
      this.hud.displaySearchResults(results);
    };

    this.network.onPlayerDiscovery = (
      discoveryType,
      playerNames,
      systemName
    ) => {
      console.log(
        "Player discovery:",
        discoveryType,
        playerNames,
        "at",
        systemName
      );
      this.hud.showPlayerDiscovery(discoveryType, playerNames, systemName);
    };

    this.network.onGalaxyPlayers = (metPlayers, totalPlayers) => {
      console.log("Galaxy players:", metPlayers, "total:", totalPlayers);
      this.hud.updatePlayersDisplay(metPlayers, totalPlayers);
    };

    this.network.onPlayerStats = (
      playerId,
      playerName,
      starsDiscovered,
      currentStance
    ) => {
      console.log(
        "Player stats:",
        playerName,
        "stars:",
        starsDiscovered,
        "stance:",
        currentStance
      );
      this.hud.updatePlayerProfileStats(
        playerId,
        playerName,
        starsDiscovered,
        currentStance
      );
    };

    this.network.onStanceUpdated = (targetPlayerId, stance) => {
      console.log("Stance updated for player", targetPlayerId, "to", stance);
      // The server will automatically send updated constellation data
    };

    this.network.onMiningEstablished = (
      miningOperationId,
      celestialBodyId,
      alloyPerDay
    ) => {
      console.log(
        `Mining established on ${celestialBodyId}: ${alloyPerDay} alloy/day`
      );
      // Re-select the celestial body to show updated mining status
      // Use setTimeout to ensure it happens after all other updates are processed
      setTimeout(() => {
        if (this.hud.onSelectObject) {
          this.hud.onSelectObject(celestialBodyId);
        }
      }, 0);
    };

    this.network.onDysonSwarmLaunched = (
      megastructureId,
      starId,
      energyPerDay,
      count
    ) => {
      // Launch satellites with animation
      this.scene.launchDysonSwarm(megastructureId, starId);
      
      // Re-select the star to show updated swarm status
      setTimeout(() => {
        if (this.hud.onSelectObject) {
          this.hud.onSelectObject(starId);
        }
      }, 0);
    };

    // HUD callbacks
    this.hud.onSetPlayerStance = (targetPlayerId, stance) => {
      this.network.setPlayerStance(targetPlayerId, stance);
    };

    this.hud.onEstablishMining = (celestialBodyId) => {
      this.network.establishMining(celestialBodyId);
    };

    this.hud.onLaunchDysonSwarm = (starId) => {
      this.network.launchDysonSwarm(starId);
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
      // Get player name and join galaxy
      const playerName = this.hud.getPlayerName();

      // Store the name and try to join first
      // If it doesn't exist, it will be created automatically
      this.lastGalaxyName = name;
      this.network.joinGalaxy(name, playerName);
    };

    this.hud.onResetGalaxy = async (name) => {
      // Connect if not already connected
      if (!this.isConnected) {
        await this.connect();
      }
      // Get player name and reset (delete and recreate) the galaxy
      const playerName = this.hud.getPlayerName();
      this.lastGalaxyName = name;
      this.network.resetGalaxy(name, playerName);
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

        // If in constellation view, exit it first
        if (this.scene.isInConstellationView()) {
          console.log(`Exiting constellation view to go home`);
          this.scene.hideConstellationView();
          // Restore HUD to show current system
          if (this.system) {
            this.hud.setSystem(this.system);
          }
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
      // If in constellation view, check if a different system is selected
      if (this.scene.isInConstellationView()) {
        const selectedSystemId = this.scene.getConstellationSelectedSystemId();

        // If a different system is selected in constellation view, navigate to it
        if (
          selectedSystemId &&
          this.player &&
          selectedSystemId !== this.player.currentSystemId
        ) {
          console.log(
            "Navigating to selected constellation system:",
            selectedSystemId
          );
          this.scene.hideConstellationView();

          // Request the selected system's state
          this.network.requestSystemState(selectedSystemId);
          return;
        }

        // Otherwise, just return to current system view
        this.scene.hideConstellationView();
        if (this.system) {
          this.hud.setSystem(this.system);
        }
      }

      // Show nice system overview
      this.scene.showSystemView();

      // Auto-select the main star
      if (this.system) {
        this.scene.centerOnObject(this.system.star.id);
        this.hud.updateObjectDetails(this.system.star.id);
      }
    };

    this.hud.onNavigateConstellation = () => {
      // Request constellation data from server
      this.network.requestConstellation();
    };

    this.hud.onTimeToggle = () => {
      // Show loading spinner
      this.hud.setTimeToggleLoading(true);

      if (this.isPaused) {
        this.network.resumeTime();
        // Optimistically update local state (server will confirm)
        this.isPaused = false;
      } else {
        this.network.pauseTime();
        // Optimistically update local state (server will confirm)
        this.isPaused = true;
      }
    };

    this.hud.onSelectObject = (objectId) => {
      console.log("Selecting object from outline:", objectId);
      this.scene.centerOnObject(objectId);
      this.hud.updateObjectDetails(objectId);
    };

    this.hud.onSearch = (query: string) => {
      this.network.searchObjects(query);
    };

    this.hud.onSearchResultClick = (systemId: string, objectId: string) => {
      // Check if we need to switch systems
      if (this.player && systemId !== this.player.currentSystemId) {
        // Store object to focus on after system loads
        this.pendingFocusObjectId = objectId;

        // Exit constellation view if active
        if (this.scene.isInConstellationView()) {
          this.scene.hideConstellationView();
          if (this.system) {
            this.hud.setSystem(this.system);
          }
        }

        // Request the new system
        this.network.requestSystemState(systemId);
      } else {
        // Same system, just focus on the object
        this.scene.centerOnObject(objectId);
        this.hud.updateObjectDetails(objectId);
      }
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

    this.scene.onConstellationSystemSelected = (systemId, action) => {
      if (action === "select") {
        console.log("Constellation system selected (first click):", systemId);
        // Find the node and show system details in HUD
        const node = this.constellationNodes.find(
          (n) => n.systemId === systemId
        );
        if (node) {
          this.hud.showConstellationSystemDetails(node);
          // Center camera on selected system
          this.scene.centerOnConstellationNode(systemId);
        }
      } else if (action === "travel") {
        console.log("Constellation system travel (second click):", systemId);
        // Exit constellation view
        this.scene.hideConstellationView();

        // If it's the current system, just show the system view
        // Otherwise, request the new system's state
        if (this.system && this.system.id === systemId) {
          console.log("Exiting to current system view");
          this.hud.setSystem(this.system);

          // Auto-select the main star when exiting to current system
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              this.scene.centerOnObject(this.system!.star.id);
              this.hud.updateObjectDetails(this.system!.star.id);
            });
          });
        } else {
          console.log("Traveling to new system:", systemId);
          // Request the selected system's state
          // (Star will be auto-selected in onSystemData handler)
          this.network.requestSystemState(systemId);
          if (this.system) {
            this.hud.setSystem(this.system);
          }
        }
      }
    };

    this.scene.onConstellationGateSelected = (gateId) => {
      console.log("Constellation gate selected (exploring):", gateId);
      // Save current selection to preserve it after exploration
      this.constellationSelectedSystemId =
        this.scene.getConstellationSelectedSystemId();
      // Use gate to explore new system, but stay in constellation view
      this.isExploringFromConstellation = true;
      this.network.useGate(gateId);
    };
  }

  private setupKeyboardHandlers(): void {
    this.keyboardHandler = (event: KeyboardEvent) => {
      // Don't handle keyboard shortcuts if typing in an input field
      const target = event.target as HTMLElement;
      const isInputField =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA";

      // 'F' key to open search modal
      if (event.key === "f" && !isInputField) {
        event.preventDefault();
        this.hud.openSearchModal();
        return;
      }

      // Spacebar to toggle pause/play
      if (event.code === "Space" && !isInputField) {
        event.preventDefault(); // Prevent page scroll

        // Show loading spinner
        this.hud.setTimeToggleLoading(true);

        if (this.isPaused) {
          this.network.resumeTime();
          // Optimistically update local state (server will confirm)
          this.isPaused = false;
        } else {
          this.network.pauseTime();
          // Optimistically update local state (server will confirm)
          this.isPaused = true;
        }
      }
    };
    window.addEventListener("keydown", this.keyboardHandler);
  }

  private setupDebugHandlers(): void {
    // Set up debug mode seed changing for planets
    this.hud.setupDebugSeedCallback((planetId: string, newSeed: number) => {
      this.scene.updatePlanetSeed(planetId, newSeed);
    });
  }

  private async connect(): Promise<void> {
    try {
      // Determine WebSocket URL based on current location
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

      // In development mode (localhost:3030), connect to server on port 8080
      // In production, use the same host (proxied by Caddy)
      let host = window.location.host;
      if (
        window.location.hostname === "localhost" &&
        window.location.port === "3030"
      ) {
        host = "localhost:8080";
      }

      const wsUrl = `${protocol}//${host}`;

      console.log(`Connecting to WebSocket at: ${wsUrl}`);
      await this.network.connect(wsUrl);
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
