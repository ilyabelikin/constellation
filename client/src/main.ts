import { NetworkClient } from "./network/client";
import { SceneManager } from "./rendering/scene";
import { HUDManager } from "./ui/hud";
import { LobbyManager } from "./ui/lobby";
import {
  Player,
  StarSystem,
  Ship,
  ConstellationNode,
} from "@constellation/shared";

/**
 * Application states
 */
enum AppState {
  LOBBY, // Showing lobby screen, game not initialized
  GAME, // Game is initialized and running
}

/**
 * Main application class that manages the lobby and game states
 */
class ConstellationApp {
  private state: AppState = AppState.LOBBY;
  private lobby: LobbyManager;
  private scene: SceneManager;
  private network: NetworkClient;
  private game: ConstellationGame | null = null;
  private animationFrameId: number | null = null;

  constructor() {
    // Initialize scene for starfield background (needed for both lobby and game)
    const container = document.getElementById("canvas-container")!;
    this.scene = new SceneManager(container);
    this.startRenderLoop();

    // Create network client early
    this.network = new NetworkClient();

    // Start with lobby
    this.lobby = new LobbyManager();

    // Setup lobby network callbacks
    this.setupLobbyNetworkHandlers();

    // Setup lobby handlers
    this.lobby.onContinue = (galaxyId: string) => {
      // Continue existing game - just connect and the server will load the player
      this.startGame(null, null, false, galaxyId);
    };

    this.lobby.onJoinGalaxy = (
      galaxyId: string,
      playerName: string,
      speciesId: string
    ) => {
      // Join an existing galaxy with selected species
      this.startGame(null, playerName, false, galaxyId, speciesId);
    };

    this.lobby.onCreateGalaxy = (playerName: string, speciesId: string) => {
      // Create a new galaxy with selected species
      this.startGame(null, playerName, false, null, speciesId, true);
    };

    this.lobby.onReset = (galaxyName: string, playerName: string) => {
      // Clear UUID for fresh start
      localStorage.removeItem("constellation-uuid");
      this.startGame(galaxyName, playerName, true);
    };

    // Connect to server and show lobby
    this.initializeLobby();
  }

  private setupLobbyNetworkHandlers(): void {
    // Setup lobby network request callbacks
    this.lobby.requestGalaxyList = () => {
      this.network.getGalaxyList();
    };

    this.lobby.requestPlayerGameInfo = () => {
      this.network.getPlayerGameInfo();
    };

    this.lobby.requestPregeneratedSpecies = () => {
      this.network.getPregeneratedSpecies();
    };

    this.lobby.requestGalaxySpecies = (galaxyId: string) => {
      this.network.getGalaxySpecies(galaxyId);
    };

    this.lobby.createEmptyGalaxy = () => {
      this.network.createEmptyGalaxy();
    };

    // Handle lobby data callbacks
    this.network.onGalaxyList = (galaxies) => {
      this.lobby.setGalaxyList(galaxies);
    };

    this.network.onPlayerGameInfo = (info) => {
      this.lobby.setPlayerGameInfo(info);
    };

    this.network.onPregeneratedSpecies = (species) => {
      this.lobby.setPregeneratedSpecies(species);
    };

    this.network.onGalaxySpecies = (speciesIds) => {
      this.lobby.setTakenSpecies(speciesIds);
    };

    this.network.onEmptyGalaxyCreated = (galaxyId, galaxyName) => {
      console.log(`Empty galaxy created: ${galaxyName} (${galaxyId})`);
      this.lobby.onEmptyGalaxyCreated();
    };

    // Handle authentication - request initial data after auth
    this.network.onAuthenticated = (uuid, playerId) => {
      console.log("Authenticated in lobby:", uuid, playerId);
      // Now that we're authenticated, request initial lobby data
      this.lobby.requestInitialData();
    };

    // Ignore game data while in lobby (player/system data sent during reconnection)
    this.network.onPlayerData = null;
    this.network.onSystemData = null;
    this.network.onShipData = null;
  }

  private async initializeLobby(): Promise<void> {
    try {
      // Connect to server
      await this.network.connect();
      console.log("Connected to server from lobby");

      // Show lobby after connection
      this.lobby.show();
    } catch (error) {
      console.error("Failed to connect to server:", error);
      this.lobby.showError(
        "Failed to connect to server. Please refresh the page."
      );
      this.lobby.show();
    }
  }

  private startRenderLoop(): void {
    const animate = () => {
      this.animationFrameId = requestAnimationFrame(animate);
      this.scene.update();
      this.scene.render();

      // Update HUD time if game is active
      if (this.game) {
        this.game.updateHUDTime();
      }
    };
    animate();
  }

  private async startGame(
    galaxyName: string | null,
    playerName: string | null,
    isReset: boolean,
    galaxyId?: string | null,
    speciesId?: string | null,
    isCreateNew?: boolean
  ): Promise<void> {
    // Hide lobby
    this.lobby.hide();

    // Create and initialize game (passing the existing scene and network)
    this.game = new ConstellationGame(
      this.scene,
      this.network,
      galaxyName,
      playerName,
      isReset,
      galaxyId,
      speciesId,
      isCreateNew
    );
    this.state = AppState.GAME;
  }
}

/**
 * Game class - only created when user starts playing
 */
class ConstellationGame {
  private network: NetworkClient;
  private scene: SceneManager;
  private hud: HUDManager;

  private player: Player | null = null;
  private system: StarSystem | null = null;
  private ship: Ship | null = null;
  private isPaused = false;
  private lastGalaxyName: string = "";
  private isConnected = false;
  private connectingPromise: Promise<void> | null = null;
  private pendingFocusObjectId: string | null = null;
  private keyboardHandler: ((e: KeyboardEvent) => void) | null = null;
  private isExploringFromConstellation = false;
  private constellationNodes: ConstellationNode[] = [];
  private constellationSelectedSystemId: string | null = null;
  private isContinuingExistingGame: boolean = false;

  constructor(
    scene: SceneManager,
    network: NetworkClient,
    galaxyName: string | null,
    playerName: string | null,
    isReset: boolean,
    galaxyId?: string | null,
    speciesId?: string | null,
    isCreateNew?: boolean
  ) {
    this.lastGalaxyName = galaxyName || "";
    this.scene = scene;
    this.network = network;

    this.hud = new HUDManager();
    this.hud.setNetworkClient(this.network);

    this.setupNetworkHandlers();
    this.setupHUDHandlers();
    this.setupSceneHandlers();
    this.setupKeyboardHandlers();
    this.setupDebugHandlers();

    // Set up keyboard blocking for modals
    this.scene.shouldBlockKeyboardInput = () => this.hud.isSearchModalOpen();

    // Show game HUD
    this.hud.showGameHUD();

    // Start game
    this.initializeGame(
      galaxyName,
      playerName,
      isReset,
      galaxyId,
      speciesId,
      isCreateNew
    );
  }

  private async initializeGame(
    galaxyName: string | null,
    playerName: string | null,
    isReset: boolean,
    galaxyId?: string | null,
    speciesId?: string | null,
    isCreateNew?: boolean
  ): Promise<void> {
    // Network is already connected from lobby, just send the appropriate message

    // Handle different lobby flows
    if (isReset && galaxyName && playerName) {
      // Old reset flow (still supported for debug mode)
      this.network.resetGalaxy(galaxyName, playerName);
    } else if (isCreateNew && playerName && speciesId) {
      // Create new galaxy
      this.network.createGalaxy(playerName, speciesId);
    } else if (galaxyId && playerName && speciesId) {
      // Join existing galaxy
      this.network.joinGalaxy(galaxyId, playerName, speciesId);
    } else if (galaxyId) {
      // Continue existing game
      // Player data was already sent during authentication but system data was ignored
      // Set flag so we request system state after player data is received
      this.isContinuingExistingGame = true;
    }
  }

  private setupNetworkHandlers(): void {
    this.network.onAuthenticated = (uuid, playerId) => {
      console.log("Authenticated:", uuid, playerId);
    };

    this.network.onPlayerData = (player) => {
      console.log("Player data received:", player);
      this.player = player;
      this.hud.setPlayer(player);

      if (player.exploredGateIds) {
        this.scene.setExploredGates(player.exploredGateIds);
      }

      this.scene.setCurrentPlayerId(player.id);

      // If continuing an existing game, request the current system state
      if (this.isContinuingExistingGame && player.currentSystemId) {
        console.log(
          "Continuing game, requesting system:",
          player.currentSystemId
        );
        this.network.requestSystemState(player.currentSystemId);
        this.isContinuingExistingGame = false; // Reset flag
      }
    };

    this.network.onSystemData = (system, gateOwnership) => {
      console.log(
        "[SystemData] System data received at timestamp:",
        Date.now(),
        system
      );
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
      if (!isSystemRefresh) {
        this.scene.loadSystem(system);
        this.hud.hideDetailPanels();
        this.scene.showSystemView();
      } else {
        this.scene.updateSystemData(system);
      }

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
        if (this.pendingFocusObjectId) {
          const objectId = this.pendingFocusObjectId;
          this.pendingFocusObjectId = null;
          console.log(`Focusing on pending object: ${objectId}`);
          // Single RAF is enough - no need to wait 2 frames
          requestAnimationFrame(() => {
            this.scene.centerOnObject(objectId);
            this.hud.updateObjectDetails(objectId);
          });
        } else {
          console.log(`Auto-selecting main star: ${system.star.id}`);
          // Single RAF is enough - no need to wait 2 frames
          requestAnimationFrame(() => {
            this.scene.centerOnObject(system.star.id);
            this.hud.updateObjectDetails(system.star.id);
          });
        }
      }
    };

    this.network.onStateUpdate = (state) => {
      this.scene.updateState(state);
      this.hud.updateState(state);

      const selectedId = this.scene.getSelectedObjectId();
      if (selectedId) {
        this.hud.updateObjectDetails(selectedId);
      }
    };

    this.network.onTimeUpdate = (currentTime, isPaused, timeScale) => {
      console.log(
        `Time update received: time=${currentTime}, paused=${isPaused}, scale=${timeScale}`
      );
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
      if (
        message.includes("Not enough energy") ||
        message.includes("Not enough alloy")
      ) {
        this.hud.showNotification(message, 3000);
      } else {
        console.error("Network error:", message);
      }

      // Just show error - galaxy creation is now done through lobby
      this.hud.showError(message);
    };

    this.network.onGalaxyCreated = (galaxyId, galaxyName) => {
      console.log("Galaxy created:", galaxyId, galaxyName);
      this.lastGalaxyName = galaxyName;
      this.hud.clearError();
    };

    this.network.onGalaxyJoined = (galaxyId) => {
      console.log("Galaxy joined:", galaxyId);
      this.hud.clearError();
    };

    this.network.onGalaxyReset = (galaxyId) => {
      console.log("Galaxy reset:", galaxyId);
      this.hud.clearError();
      // After reset, the galaxy is new, so we don't need to do anything
      // The player will be created automatically by the reset handler
    };

    this.network.onGalaxyInfo = (galaxyName, exists, currentTime) => {
      console.log("Galaxy info:", galaxyName, exists, currentTime);
    };

    this.network.onGateTravel = (
      destinationSystem,
      exploredGateIds,
      exitGateId
    ) => {
      console.log("Gate travel to system:", destinationSystem.id);

      const oldExploredGateIds = this.player?.exploredGateIds || [];
      const oldExploredGateIdsSet = new Set(oldExploredGateIds);
      const entryGateId = this.scene.getEntryGateId();
      const wasEntryGateExplored = entryGateId
        ? oldExploredGateIdsSet.has(entryGateId)
        : true;

      if (this.player) {
        this.player.currentSystemId = destinationSystem.id;
        this.player.exploredGateIds = exploredGateIds;
        this.scene.setExploredGates(exploredGateIds);
      }

      this.system = destinationSystem;

      if (this.isExploringFromConstellation) {
        setTimeout(() => {
          this.network.requestConstellation();
        }, 100);
        return;
      }

      this.hud.hideOutline();

      this.scene.animateGateTravel(
        destinationSystem,
        exitGateId,
        () => {
          this.hud.setSystem(destinationSystem);
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
      console.log("Constellation data received:", nodes.length, "nodes");

      this.constellationNodes = nodes;

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
      // Notify HUD that we're in constellation view (to hide mineable widget)
      this.hud.setConstellationViewState(true);

      if (selectedSystemId) {
        const selectedNode = nodes.find((n) => n.systemId === selectedSystemId);
        if (selectedNode) {
          this.hud.showConstellationSystemDetails(selectedNode);
        }
      }

      if (this.isExploringFromConstellation) {
        this.constellationSelectedSystemId = null;
        this.isExploringFromConstellation = false;
      }
    };

    this.network.onSearchResults = (results) => {
      this.hud.displaySearchResults(results);
    };

    this.network.onPlayerDiscovery = (
      discoveryType,
      playerNames,
      systemName
    ) => {
      this.hud.showPlayerDiscovery(discoveryType, playerNames, systemName);
    };

    this.network.onGalaxyPlayers = (metPlayers, totalPlayers) => {
      this.hud.updatePlayersDisplay(metPlayers, totalPlayers);
    };

    this.network.onPlayerStats = (
      playerId,
      playerName,
      starsDiscovered,
      currentStance
    ) => {
      this.hud.updatePlayerProfileStats(
        playerId,
        playerName,
        starsDiscovered,
        currentStance
      );
    };

    this.network.onStanceUpdated = (targetPlayerId, stance) => {
      console.log("Stance updated for player", targetPlayerId, "to", stance);
    };

    this.network.onMiningEstablished = (
      miningOperationId,
      celestialBodyId,
      alloyPerDay
    ) => {
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
      this.scene.launchDysonSwarm(megastructureId, starId);
      setTimeout(() => {
        if (this.hud.onSelectObject) {
          this.hud.onSelectObject(starId);
        }
      }, 0);
    };

    this.network.onColonyEstablished = (colony) => {
      // Trigger colony establishment animation
      this.scene.triggerColonyEstablishment(colony.planetId);

      setTimeout(() => {
        if (this.hud.onSelectObject) {
          this.hud.onSelectObject(colony.planetId);
        }
      }, 0);
    };

    this.network.onColonyUpdated = (colony) => {
      // Update the colony in the current system state
      if (this.system && this.system.colonies) {
        const colonyIndex = this.system.colonies.findIndex(
          (c) => c.id === colony.id
        );
        if (colonyIndex !== -1) {
          this.system.colonies[colonyIndex] = colony;
        }
      }

      // Update the HUD's system reference
      if (this.system) {
        this.hud.setSystem(this.system);
      }

      // Refresh the body detail view if this planet is currently selected
      const selectedId = this.scene.getSelectedObjectId();
      if (selectedId === colony.planetId) {
        this.hud.updateObjectDetails(colony.planetId);
      }
    };

    this.network.onColonyRemoved = (planetId) => {
      // Remove the colony from the current system state
      if (this.system && this.system.colonies) {
        this.system.colonies = this.system.colonies.filter(
          (c) => c.planetId !== planetId
        );
      }

      // Update the HUD's system reference
      if (this.system) {
        this.hud.setSystem(this.system);
      }

      // Refresh the body detail view if this planet is currently selected
      const selectedId = this.scene.getSelectedObjectId();
      if (selectedId === planetId) {
        this.hud.updateObjectDetails(planetId);
      }
    };

    this.network.onSpeciesInfo = (species) => {
      this.hud.displaySpeciesInfo(species);
    };

    this.hud.onSetPlayerStance = (targetPlayerId, stance) => {
      this.network.setPlayerStance(targetPlayerId, stance);
    };

    this.hud.onEstablishMining = (celestialBodyId) => {
      this.network.establishMining(celestialBodyId);
    };

    this.hud.onLaunchDysonSwarm = (starId) => {
      this.network.launchDysonSwarm(starId);
    };

    this.hud.onEstablishColony = (planetId, specialization) => {
      this.network.establishColony(planetId, specialization);
    };

    this.hud.onRemoveColony = (planetId) => {
      this.network.removeColony(planetId);
    };

    this.hud.onUpdateColonySpecialization = (colonyId, specialization) => {
      this.network.updateColonySpecialization(colonyId, specialization);
    };

    this.hud.onGateTravel = (gateId) => {
      this.scene.setEntryGate(gateId);
      this.network.useGate(gateId);
    };

    this.network.onDisconnected = () => {
      this.isConnected = false;
    };

    this.network.onReconnected = () => {
      this.isConnected = true;
    };
  }

  private setupHUDHandlers(): void {
    this.hud.onNavigateHome = () => {
      if (this.player) {
        if (!this.player.homePlanetId) {
          this.network.requestSystemState(this.player.homeSystemId);
          return;
        }

        if (this.scene.isInConstellationView()) {
          this.scene.hideConstellationView();
          this.hud.setConstellationViewState(false);
          if (this.system) {
            this.hud.setSystem(this.system);
          }
        }

        if (
          this.player.currentSystemId === this.player.homeSystemId &&
          this.system
        ) {
          this.scene.centerOnObject(this.player.homePlanetId);
          this.hud.updateObjectDetails(this.player.homePlanetId);
        } else {
          this.pendingFocusObjectId = this.player.homePlanetId;
          this.network.requestSystemState(this.player.homeSystemId);
        }
      }
    };

    this.hud.onNavigateSystem = () => {
      if (this.scene.isInConstellationView()) {
        const selectedSystemId = this.scene.getConstellationSelectedSystemId();

        if (
          selectedSystemId &&
          this.player &&
          selectedSystemId !== this.player.currentSystemId
        ) {
          this.scene.hideConstellationView();
          this.hud.setConstellationViewState(false);
          this.network.requestSystemState(selectedSystemId);
          return;
        }

        this.scene.hideConstellationView();
        this.hud.setConstellationViewState(false);
        if (this.system) {
          this.hud.setSystem(this.system);
        }
      }

      this.scene.showSystemView();

      if (this.system) {
        this.scene.centerOnObject(this.system.star.id);
        this.hud.updateObjectDetails(this.system.star.id);
      }
    };

    this.hud.onNavigateConstellation = () => {
      this.network.requestConstellation();
    };

    this.hud.onTimeToggle = () => {
      this.hud.setTimeToggleLoading(true);

      if (this.isPaused) {
        this.network.resumeTime();
        this.isPaused = false;
      } else {
        this.network.pauseTime();
        this.isPaused = true;
      }
    };

    this.hud.onSelectObject = (objectId) => {
      this.scene.centerOnObject(objectId);
      this.hud.updateObjectDetails(objectId);
    };

    this.hud.onSearch = (query: string) => {
      this.network.searchObjects(query);
    };

    this.hud.onSearchResultClick = (systemId: string, objectId: string) => {
      if (this.player && systemId !== this.player.currentSystemId) {
        this.pendingFocusObjectId = objectId;

        if (this.scene.isInConstellationView()) {
          this.scene.hideConstellationView();
          this.hud.setConstellationViewState(false);
          if (this.system) {
            this.hud.setSystem(this.system);
          }
        }

        this.network.requestSystemState(systemId);
      } else {
        this.scene.centerOnObject(objectId);
        this.hud.updateObjectDetails(objectId);
      }
    };
  }

  private setupSceneHandlers(): void {
    this.scene.onObjectSelected = (objectId) => {
      this.hud.updateObjectDetails(objectId);
    };

    this.scene.onGateUse = (gateId) => {
      this.scene.setEntryGate(gateId);
      this.network.useGate(gateId);
    };

    this.scene.onConstellationPositionsChanged = (positions) => {
      this.network.saveConstellationPositions(positions);
    };

    this.scene.onConstellationSystemSelected = (systemId, action) => {
      if (action === "select") {
        const node = this.constellationNodes.find(
          (n) => n.systemId === systemId
        );
        if (node) {
          this.hud.showConstellationSystemDetails(node);
          this.scene.centerOnConstellationNode(systemId);
        }
      } else if (action === "travel") {
        this.scene.hideConstellationView();
        this.hud.setConstellationViewState(false);

        if (this.system && this.system.id === systemId) {
          this.hud.setSystem(this.system);

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              this.scene.centerOnObject(this.system!.star.id);
              this.hud.updateObjectDetails(this.system!.star.id);
            });
          });
        } else {
          this.network.requestSystemState(systemId);
          if (this.system) {
            this.hud.setSystem(this.system);
          }
        }
      }
    };

    this.scene.onConstellationGateSelected = (gateId) => {
      this.constellationSelectedSystemId =
        this.scene.getConstellationSelectedSystemId();
      this.isExploringFromConstellation = true;
      this.network.useGate(gateId);
    };
  }

  private setupKeyboardHandlers(): void {
    this.keyboardHandler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isInputField =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA";

      if (event.key === "f" && !isInputField) {
        event.preventDefault();
        this.hud.openSearchModal();
        return;
      }

      if (event.code === "Space" && !isInputField) {
        event.preventDefault();

        this.hud.setTimeToggleLoading(true);

        if (this.isPaused) {
          this.network.resumeTime();
          this.isPaused = false;
        } else {
          this.network.pauseTime();
          this.isPaused = true;
        }
      }
    };
    window.addEventListener("keydown", this.keyboardHandler);
  }

  private setupDebugHandlers(): void {
    this.hud.setupDebugSeedCallback((planetId: string, newSeed: number) => {
      this.scene.updatePlanetSeed(planetId, newSeed);
    });
  }

  private async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    if (this.connectingPromise) {
      return this.connectingPromise;
    }

    this.connectingPromise = (async () => {
      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

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
      } finally {
        this.connectingPromise = null;
      }
    })();

    return this.connectingPromise;
  }

  updateHUDTime(): void {
    this.hud.updateTime(
      this.scene.getGameTime(),
      this.scene.getIsPaused(),
      this.scene.getTimeScale()
    );
  }

  dispose(): void {
    if (this.keyboardHandler) {
      window.removeEventListener("keydown", this.keyboardHandler);
      this.keyboardHandler = null;
    }

    // Don't dispose scene - it's owned by ConstellationApp
    this.hud.dispose();
    this.network.disconnect();

    this.player = null;
    this.system = null;
    this.ship = null;

    console.log("ConstellationGame disposed");
  }
}

// Start the application with lobby
new ConstellationApp();
