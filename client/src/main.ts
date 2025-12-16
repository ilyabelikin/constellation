import { NetworkClient } from "./network/client";
import { SceneManager } from "./rendering/scene";
import { HUDManager } from "./ui/hud";
import { LobbyManager } from "./ui/lobby";
import { TechTreeView } from "./ui/TechTreeView";
import {
  Player,
  StarSystem,
  Ship,
  ConstellationNode,
  TECHNOLOGIES,
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
  private bufferedGalaxyPlayers: {
    metPlayers: { id: string; name: string }[];
    totalPlayers: number;
  } | null = null;

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
    this.lobby.onContinue = (galaxyId: string, currentSystemId?: string) => {
      // Continue existing game - just connect and the server will load the player
      this.startGame(null, null, false, galaxyId, null, false, currentSystemId);
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

    // CRITICAL: Set up onGalaxyPlayers callback EARLY
    // This callback must be registered before authentication
    // because the server sends galaxyPlayers immediately after authentication
    this.network.onGalaxyPlayers = (metPlayers, totalPlayers) => {
      // If game is not yet created, buffer the data
      if (!this.game) {
        console.log(
          "[DEBUG] Buffering galaxy players data (game not created yet):",
          metPlayers
        );
        this.bufferedGalaxyPlayers = { metPlayers, totalPlayers };
      } else {
        console.log(
          "[DEBUG] Game exists, updating players display directly:",
          metPlayers
        );
        this.game.hud.updatePlayersDisplay(metPlayers, totalPlayers);
      }
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
      // Determine the correct WebSocket URL based on the current protocol and host
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

      // Connect to server
      await this.network.connect(wsUrl);
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
    isCreateNew?: boolean,
    currentSystemId?: string
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
      isCreateNew,
      currentSystemId
    );
    this.state = AppState.GAME;

    // Apply buffered galaxy players data if any
    if (this.bufferedGalaxyPlayers) {
      console.log(
        "[DEBUG] Game created, applying buffered galaxy players data:",
        this.bufferedGalaxyPlayers
      );
      this.game.hud.updatePlayersDisplay(
        this.bufferedGalaxyPlayers.metPlayers,
        this.bufferedGalaxyPlayers.totalPlayers
      );
      this.bufferedGalaxyPlayers = null;
    }
  }
}

/**
 * Game class - only created when user starts playing
 */
class ConstellationGame {
  private network: NetworkClient;
  private scene: SceneManager;
  public hud: HUDManager; // Made public so ConstellationApp can access it for buffered data
  private techTreeView: TechTreeView;

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
  private speciesCache: Map<string, any> = new Map(); // Cache for species data
  private techProgressIndicator: HTMLElement | null = null;
  private techProgressBar: SVGCircleElement | null = null;
  private techCompleteModal: HTMLElement | null = null;
  private techCompleteName: HTMLElement | null = null;
  private techCompleteDescription: HTMLElement | null = null;
  private techCompleteEffectsList: HTMLElement | null = null;
  private techCompleteOkButton: HTMLElement | null = null;
  private currentResearchData: {
    technologyId: string;
    status: "in_progress" | "paused";
    progressDays: number;
    scienceInvested: number;
    scienceNeeded: number;
    daysNeeded: number;
    lastUpdateTime: number; // Game time when this data was last updated
  } | null = null;
  private techButton: HTMLElement | null = null;
  private hasInitializedTechState: boolean = false;
  private shouldShowTechTreeModal: boolean = false;

  constructor(
    scene: SceneManager,
    network: NetworkClient,
    galaxyName: string | null,
    playerName: string | null,
    isReset: boolean,
    galaxyId?: string | null,
    speciesId?: string | null,
    isCreateNew?: boolean,
    currentSystemId?: string
  ) {
    this.lastGalaxyName = galaxyName || "";
    this.scene = scene;
    this.network = network;

    this.hud = new HUDManager();
    this.hud.setNetworkClient(this.network);
    // Set up species cache getter
    this.hud.setSpeciesGetter((speciesId: string) =>
      this.speciesCache.get(speciesId)
    );
    // Set up interpolated game time getter for countdown timers
    this.hud.setGameTimeGetter(() => this.scene.getGameTime());

    // Initialize tech tree view
    this.techTreeView = new TechTreeView();
    this.setupTechTreeHandlers();

    // Initialize tech progress indicator elements
    this.techProgressIndicator = document.getElementById(
      "tech-progress-indicator"
    );
    this.techProgressBar = document.getElementById(
      "tech-progress-bar"
    ) as unknown as SVGCircleElement;
    this.techCompleteModal = document.getElementById("tech-complete-modal");
    this.techCompleteName = document.getElementById("tech-complete-name");
    this.techCompleteDescription = document.getElementById(
      "tech-complete-description"
    );
    this.techCompleteEffectsList = document.getElementById(
      "tech-complete-effects-list"
    );
    this.techCompleteOkButton = document.getElementById(
      "tech-complete-ok-button"
    );
    this.techButton = document.getElementById("nav-tech");

    // Setup tech complete modal handler
    if (this.techCompleteOkButton) {
      this.techCompleteOkButton.addEventListener("click", () => {
        this.hideTechCompleteAlert();
      });
    }

    // Close modal on background click
    if (this.techCompleteModal) {
      this.techCompleteModal.addEventListener("click", (e) => {
        if (e.target === this.techCompleteModal) {
          this.hideTechCompleteAlert();
        }
      });
    }

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
      isCreateNew,
      currentSystemId
    );
  }

  private async initializeGame(
    galaxyName: string | null,
    playerName: string | null,
    isReset: boolean,
    galaxyId?: string | null,
    speciesId?: string | null,
    isCreateNew?: boolean,
    currentSystemId?: string
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
    } else if (galaxyId && currentSystemId) {
      // Continue existing game - request system state immediately
      // No need to wait for player data since we already have the currentSystemId
      console.log(
        "Continuing game, requesting system immediately:",
        currentSystemId
      );
      this.network.requestSystemState(currentSystemId);
      this.isContinuingExistingGame = true;
    } else if (galaxyId) {
      // Continue existing game without currentSystemId (fallback)
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

      // Request tech tree data once on initial load to initialize research progress
      if (!this.hasInitializedTechState) {
        this.hasInitializedTechState = true;
        this.network.requestTechTree();
      }

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

    this.network.onSystemData = (system, gateOwnership, tunnelOwnership) => {
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
      console.log("[SystemData] Gate ownership data:", gateOwnership);
      if (gateOwnership && gateOwnership.length > 0) {
        this.scene.clearGateOwnership();
        this.hud.clearGateOwnership();
        for (const ownership of gateOwnership) {
          console.log(
            `[SystemData] Setting gate ${ownership.gateId} ownership: status=${ownership.status}, owner=${ownership.ownerName}`
          );
          this.scene.setGateOwnership(
            ownership.gateId,
            ownership.ownerId,
            ownership.ownerName,
            ownership.status,
            ownership.lastOvertakenAt
          );
          this.hud.setGateOwnership(
            ownership.gateId,
            ownership.ownerId,
            ownership.ownerName,
            ownership.status,
            ownership.lastOvertakenAt
          );
        }
      } else {
        console.log("[SystemData] No gate ownership data provided");
      }

      // Update tunnel ownership information if provided
      if (tunnelOwnership && tunnelOwnership.length > 0) {
        console.log("[SystemData] Tunnel ownership data:", tunnelOwnership);
        this.hud.updateTunnelOwnership(tunnelOwnership);
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
      // NOTE: Use updateObjectDetails instead of onSelectObject to avoid
      // triggering centerOnObject again (which would be seen as a "second click" by
      // the camera controller and trigger unwanted gate travel)
      if (isSystemRefresh && previousSelection) {
        setTimeout(() => {
          // Just refresh the HUD panel, don't re-center camera
          this.hud.updateObjectDetails(previousSelection);
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
      exitGateId,
      gateOwnership,
      tunnelOwnership,
      isExitGateBlocked
    ) => {
      console.log("Gate travel to system:", destinationSystem.id);
      if (isExitGateBlocked) {
        console.log("⚠️ Exit gate is blocked by enemy defenses!");
      }

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

      // Store gate ownership and tunnel ownership for destination system
      if (gateOwnership && gateOwnership.length > 0) {
        for (const ownership of gateOwnership) {
          this.scene.setGateOwnership(
            ownership.gateId,
            ownership.ownerId,
            ownership.ownerName,
            ownership.status,
            ownership.lastOvertakenAt
          );
          this.hud.setGateOwnership(
            ownership.gateId,
            ownership.ownerId,
            ownership.ownerName,
            ownership.status,
            ownership.lastOvertakenAt
          );
        }
      }

      if (tunnelOwnership && tunnelOwnership.length > 0) {
        this.hud.updateTunnelOwnership(tunnelOwnership);
      }

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
        wasEntryGateExplored,
        isExitGateBlocked
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

    // Note: onGalaxyPlayers callback is now set earlier in setupLobbyNetworkHandlers()
    // to ensure it's registered before authentication

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
    };

    this.network.onGateDefenseBuilt = (defense) => {
      // Add defense platform to the scene (if gate is in current system)
      this.scene.addGateDefense(defense);

      // Refresh gate details if this gate is currently selected
      const selectedId = this.scene.getSelectedObjectId();
      if (selectedId === defense.gateId) {
        // Force refresh to show updated defense count
        (this.hud as any).selectedObjectId = null;
        this.hud.updateObjectDetails(defense.gateId);
      }
    };

    this.network.onGateAttackStarted = (attack) => {
      // Start attack animation
      this.scene.startGateAttack(attack);

      console.log(
        `Gate attack started: ${attack.attackShipCount} ships attacking gate ${attack.gateId}`
      );
    };

    this.network.onGateAttackUpdate = (attack) => {
      // Update attack with combat results
      this.scene.updateGateAttack(attack);

      console.log(`Gate attack ${attack.id} updated: status=${attack.status}`);

      // If attack is complete, refresh the HUD immediately so player can see Capture/Overtake options
      if (attack.status !== "in_progress") {
        // Refresh the details panel immediately if the attacked gate is selected
        const selectedId = this.scene.getSelectedObjectId();

        if (selectedId === attack.gateId) {
          // Force refresh by clearing selection first
          (this.hud as any).selectedObjectId = null;
          this.hud.updateObjectDetails(attack.gateId);
        }

        // Also request fresh system state to ensure defense counts are updated
        if (this.player?.currentSystemId) {
          this.network.requestSystemState(this.player.currentSystemId);
        }
      }
    };

    this.network.onGateOvertaken = (
      gateId,
      gateName,
      systemName,
      newOwnerId,
      newOwnerName,
      previousOwnerId,
      overtakeTime
    ) => {
      console.log(`Gate ${gateName} was overtaken by ${newOwnerName}`);

      // Determine the correct status based on ownership
      let status: string;
      if (this.player && newOwnerId === this.player.id) {
        status = "owned_by_self";
      } else {
        // TODO: Get actual diplomatic stance from player data
        // For now, default to neutral
        status = "neutral";
      }

      // Update gate ownership visually without reloading the system
      this.scene.setGateOwnership(
        gateId,
        newOwnerId,
        newOwnerName,
        status,
        overtakeTime
      );
      this.hud.setGateOwnership(
        gateId,
        newOwnerId,
        newOwnerName,
        status,
        overtakeTime
      );

      // Refresh gate details if this gate is currently selected
      const selectedId = this.scene.getSelectedObjectId();
      if (selectedId === gateId) {
        // Force refresh by clearing selection first, then re-selecting
        // This is needed because updateObjectDetails has an early return for same object
        setTimeout(() => {
          (this.hud as any).selectedObjectId = null; // Clear the cached selection
          this.hud.updateObjectDetails(gateId);
        }, 100);
      }

      // Show notification if YOUR gate was overtaken
      if (this.player && previousOwnerId === this.player.id) {
        this.hud.showGateOvertakeNotification(
          newOwnerName,
          gateName,
          systemName
        );
      }
    };

    this.network.onGateResourceFlow = (
      gateId,
      energyFlow,
      alloyFlow,
      scienceFlow,
      isBlockaded,
      blockadeOwnerName
    ) => {
      // Store gate resource flow data
      this.scene.setGateResourceFlow(
        gateId,
        energyFlow,
        alloyFlow,
        scienceFlow,
        isBlockaded,
        blockadeOwnerName
      );

      // Refresh gate details if this gate is currently selected
      const selectedId = this.scene.getSelectedObjectId();
      if (selectedId === gateId) {
        (this.hud as any).selectedObjectId = null;
        this.hud.updateObjectDetails(gateId);
      }
    };

    this.network.onSpeciesInfo = (species) => {
      // Cache the species data
      this.speciesCache.set(species.id, species);
      // Forward to HUD for modal display
      this.hud.displaySpeciesInfo(species);
      // Refresh body detail view if it's showing a planet with this species
      const selectedId = this.scene.getSelectedObjectId();
      if (selectedId) {
        this.hud.updateObjectDetails(selectedId);
      }
    };

    this.network.onResourceBreakdown = (breakdown) => {
      this.hud.updateResourceBreakdown(breakdown);
    };

    // Tech tree network handlers
    this.network.onTechTreeData = (completedTechs, currentResearch) => {
      // Only show the modal if the user actually clicked the Tech button
      if (this.shouldShowTechTreeModal) {
        this.techTreeView.show(completedTechs, currentResearch);
        this.shouldShowTechTreeModal = false; // Reset flag
      }
      
      // Store current research data for real-time updates
      if (currentResearch) {
        this.currentResearchData = {
          ...currentResearch,
          lastUpdateTime: this.scene.getGameTime(),
        };
      } else {
        this.currentResearchData = null;
      }
      // Update tech progress indicator based on current research
      if (currentResearch && currentResearch.status === "in_progress") {
        this.updateTechProgressIndicator(
          currentResearch.technologyId,
          currentResearch.progressDays,
          currentResearch.scienceInvested
        );
      } else {
        this.hideTechProgressIndicator();
      }
    };

    this.network.onResearchStarted = (technologyId) => {
      console.log(`Research started: ${technologyId}`);
      // Initialize research data for the new research
      const tech = TECHNOLOGIES[technologyId];
      if (tech) {
        this.currentResearchData = {
          technologyId,
          status: "in_progress",
          progressDays: 0,
          scienceInvested: 0,
          scienceNeeded: tech.scienceCost,
          daysNeeded: tech.researchDays,
          lastUpdateTime: this.scene.getGameTime(),
        };
      }
      // Show the progress indicator
      this.showTechProgressIndicator();
      // Refresh tech tree if it's already open
      if (this.techTreeView.isVisible()) {
        this.shouldShowTechTreeModal = true;
        this.network.requestTechTree();
      }
    };

    this.network.onResearchPaused = (technologyId) => {
      console.log(`Research paused: ${technologyId}`);
      // Update research status to paused
      if (
        this.currentResearchData &&
        this.currentResearchData.technologyId === technologyId
      ) {
        this.currentResearchData.status = "paused";
      }
      // Hide the progress indicator when paused
      this.hideTechProgressIndicator();
      // Refresh tech tree if it's already open
      if (this.techTreeView.isVisible()) {
        this.shouldShowTechTreeModal = true;
        this.network.requestTechTree();
      }
    };

    this.network.onResearchResumed = (technologyId) => {
      console.log(`Research resumed: ${technologyId}`);
      // Update research status to in_progress
      if (
        this.currentResearchData &&
        this.currentResearchData.technologyId === technologyId
      ) {
        this.currentResearchData.status = "in_progress";
      }
      // Show the progress indicator again
      this.showTechProgressIndicator();
      // Refresh tech tree if it's already open
      if (this.techTreeView.isVisible()) {
        this.shouldShowTechTreeModal = true;
        this.network.requestTechTree();
      }
    };

    this.network.onResearchCompleted = (technologyId, technologyName) => {
      console.log(`Research completed: ${technologyName}`);
      // Clear the stored research data
      this.currentResearchData = null;
      // Hide the progress indicator
      this.hideTechProgressIndicator();
      // Show the tech complete alert with full details
      this.showTechCompleteAlert(technologyId, technologyName);
      // Refresh tech tree if it's open
      if (this.techTreeView.isVisible()) {
        this.network.requestTechTree();
      }
    };

    this.network.onResearchProgressUpdate = (
      technologyId,
      progressDays,
      scienceInvested
    ) => {
      // Get the technology info to update research data
      const tech = TECHNOLOGIES[technologyId];
      if (tech) {
        // Update or create the stored research data
        if (
          this.currentResearchData &&
          this.currentResearchData.technologyId === technologyId
        ) {
          this.currentResearchData.progressDays = progressDays;
          this.currentResearchData.scienceInvested = scienceInvested;
          this.currentResearchData.lastUpdateTime = this.scene.getGameTime();
        } else {
          // Create research data if it doesn't exist (happens on game load with ongoing research)
          this.currentResearchData = {
            technologyId,
            status: "in_progress",
            progressDays,
            scienceInvested,
            scienceNeeded: tech.scienceCost,
            daysNeeded: tech.researchDays,
            lastUpdateTime: this.scene.getGameTime(),
          };
        }
      }
      // Update the tech progress indicator
      this.updateTechProgressIndicator(
        technologyId,
        progressDays,
        scienceInvested
      );
      // Optionally refresh tech tree if it's open
      if (this.techTreeView.isVisible()) {
        this.network.requestTechTree();
      }
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

    this.hud.onGateFortify = (gateId) => {
      this.network.fortifyGate(gateId);
    };

    this.hud.onGateAttack = (gateId) => {
      this.network.attackGate(gateId);
    };

    this.hud.onGateCapture = (gateId) => {
      this.network.captureGate(gateId);
    };

    this.hud.onGateOvertake = (gateId) => {
      this.network.overtakeGate(gateId);
    };

    this.hud.onTunnelPowerOff = (tunnelId) => {
      this.network.powerOffTunnel(tunnelId);
    };

    this.hud.onTunnelPowerOn = (tunnelId) => {
      this.network.powerOnTunnel(tunnelId);
    };

    this.hud.onTunnelOvertake = (tunnelId) => {
      this.network.overtakeTunnel(tunnelId);
    };

    this.hud.onTunnelOvercharge = (tunnelId) => {
      // Show confirmation modal
      const confirmed = confirm(
        "⚠️ OVERCHARGE TUNNEL ⚠️\n\n" +
          "This will:\n" +
          "• Cost 10 energy + 10 science\n" +
          "• DESTROY all defenses on both gates\n" +
          "• DESTROY all ongoing attacks\n" +
          "• Power off the tunnel\n" +
          "• Block tunnel power for 1 YEAR\n\n" +
          "This is irreversible! Continue?"
      );

      if (confirmed) {
        this.network.overchargeTunnel(tunnelId);
      }
    };

    this.hud.onGateDebugConnect = (gateId) => {
      this.network.debugConnectGate(gateId);
    };

    this.hud.onGetGateDefenseCount = (gateId) => {
      return this.scene.getGateDefenseCount(gateId);
    };

    this.hud.onGetGateResourceFlow = (gateId) => {
      return this.scene.getGateResourceFlow(gateId);
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

    // Add tech tree navigation handler
    const navTechButton = document.getElementById("nav-tech");
    if (navTechButton) {
      navTechButton.addEventListener("click", () => {
        this.shouldShowTechTreeModal = true; // Set flag to show modal
        this.network.requestTechTree();
      });
    }

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
          // Request the new system - the star will be auto-selected when it loads
          // (see lines 406-411 in onSystemData callback)
          this.network.requestSystemState(systemId);
        }
      }
    };

    this.scene.onConstellationGateSelected = (gateId) => {
      this.constellationSelectedSystemId =
        this.scene.getConstellationSelectedSystemId();
      this.isExploringFromConstellation = true;
      this.network.useGate(gateId);
    };

    this.scene.onConstellationPlanetSelected = (
      systemId,
      planetId,
      planetName
    ) => {
      console.log(
        `Main: Planet selected from constellation: ${planetName} (${planetId}) in system ${systemId}`
      );

      // Hide constellation view
      this.scene.hideConstellationView();
      this.hud.setConstellationViewState(false);

      // If it's the current system, just center on the planet
      if (this.system && this.system.id === systemId) {
        this.hud.setSystem(this.system);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.scene.centerOnObject(planetId);
            this.hud.updateObjectDetails(planetId);
          });
        });
      } else {
        // Request the system state and then center on the planet
        this.network.requestSystemState(systemId);
        if (this.system) {
          this.hud.setSystem(this.system);
        }

        // Store the planet ID to center on after system loads
        // We'll use a timeout to allow the system to load first
        setTimeout(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              this.scene.centerOnObject(planetId);
              this.hud.updateObjectDetails(planetId);
            });
          });
        }, 500);
      }
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

  private setupTechTreeHandlers(): void {
    // Set up tech tree callbacks
    this.techTreeView.onStartResearch = (technologyId: string) => {
      this.network.startResearch(technologyId);
    };

    this.techTreeView.onPauseResearch = (technologyId: string) => {
      this.network.pauseResearch(technologyId);
    };

    this.techTreeView.onResumeResearch = (technologyId: string) => {
      this.network.resumeResearch(technologyId);
    };

    this.techTreeView.onClose = () => {
      // Optional: any cleanup when tech tree is closed
    };
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
    const currentGameTime = this.scene.getGameTime();
    this.hud.updateTime(
      currentGameTime,
      this.scene.getIsPaused(),
      this.scene.getTimeScale()
    );

    // Update tech progress indicator every frame if research is in progress
    if (
      this.currentResearchData &&
      this.currentResearchData.status === "in_progress"
    ) {
      // Calculate interpolated progress based on elapsed time
      const elapsedSeconds = currentGameTime - this.currentResearchData.lastUpdateTime;
      const elapsedDays = elapsedSeconds / 86400; // 86400 seconds per day
      const currentProgressDays = this.currentResearchData.progressDays + elapsedDays;
      
      // Check if research has reached 100%
      if (currentProgressDays >= this.currentResearchData.daysNeeded) {
        // Hide the progress indicator when complete
        this.hideTechProgressIndicator();
        // Clear research data to prevent further updates
        this.currentResearchData = null;
      } else {
        // Update the indicator with current progress
        this.updateTechProgressIndicator(
          this.currentResearchData.technologyId,
          currentProgressDays,
          this.currentResearchData.scienceInvested
        );
      }
    }
  }

  private showTechProgressIndicator(): void {
    if (this.techProgressIndicator) {
      this.techProgressIndicator.style.display = "inline-block";
    }
  }

  private hideTechProgressIndicator(): void {
    if (this.techProgressIndicator) {
      this.techProgressIndicator.style.display = "none";
    }
    // Clear the tooltip when hiding
    if (this.techButton) {
      this.techButton.title = "Tech";
    }
  }

  private updateTechProgressIndicator(
    technologyId: string,
    progressDays: number,
    scienceInvested: number
  ): void {
    const tech = TECHNOLOGIES[technologyId];

    if (!tech || !this.techProgressBar) return;

    // Show the indicator if hidden
    this.showTechProgressIndicator();

    // Calculate progress percentage based on days (cap at 99.9% to avoid showing 100% before completion)
    const progressPercent = Math.min(
      99.9,
      (progressDays / tech.researchDays) * 100
    );

    // SVG circle has circumference = 2 * PI * r = 2 * 3.14159 * 4.5 = 28.27
    const circumference = 28.27;
    const offset = circumference - (progressPercent / 100) * circumference;

    // Update the stroke-dashoffset to show progress
    this.techProgressBar.style.strokeDashoffset = offset.toString();

    // Update hover tooltip with tech name and progress
    if (this.techButton) {
      this.techButton.title = `${tech.name}: ${progressPercent.toFixed(1)}%`;
    }
  }

  private showTechCompleteAlert(
    technologyId: string,
    technologyName: string
  ): void {
    const tech = TECHNOLOGIES[technologyId];

    if (
      !tech ||
      !this.techCompleteModal ||
      !this.techCompleteName ||
      !this.techCompleteDescription ||
      !this.techCompleteEffectsList
    ) {
      return;
    }

    // Set the technology name
    this.techCompleteName.textContent = tech.name;

    // Set the description
    this.techCompleteDescription.textContent = tech.description;

    // Build the effects list
    this.techCompleteEffectsList.innerHTML = "";

    if (tech.effects.dysonSwarmEnergyBonus) {
      const effect = document.createElement("div");
      effect.className = "tech-complete-effect";
      effect.textContent = `New Dyson Swarms produce +${(
        tech.effects.dysonSwarmEnergyBonus * 100
      ).toFixed(0)}% energy`;
      this.techCompleteEffectsList.appendChild(effect);
    }

    if (tech.effects.colonyAlloyBonus) {
      const effect = document.createElement("div");
      effect.className = "tech-complete-effect";
      effect.textContent = `All planet colonies produce +${(
        tech.effects.colonyAlloyBonus * 100
      ).toFixed(0)}% alloy`;
      this.techCompleteEffectsList.appendChild(effect);
    }

    if (tech.effects.miningInstallationBonus) {
      const effect = document.createElement("div");
      effect.className = "tech-complete-effect";
      effect.textContent = `All mining installations produce +${(
        tech.effects.miningInstallationBonus * 100
      ).toFixed(0)}% alloy`;
      this.techCompleteEffectsList.appendChild(effect);
    }

    if (tech.effects.shipDefenseBonus) {
      const effect = document.createElement("div");
      effect.className = "tech-complete-effect";
      effect.textContent = `New ships have +${(
        tech.effects.shipDefenseBonus * 100
      ).toFixed(0)}% defense`;
      this.techCompleteEffectsList.appendChild(effect);
    }

    if (tech.effects.defenseplatformDefenseBonus) {
      const effect = document.createElement("div");
      effect.className = "tech-complete-effect";
      effect.textContent = `New defense platforms have +${(
        tech.effects.defenseplatformDefenseBonus * 100
      ).toFixed(0)}% defense`;
      this.techCompleteEffectsList.appendChild(effect);
    }

    // Show the modal
    this.techCompleteModal.classList.remove("hidden");
    this.techCompleteModal.style.display = "flex";
  }

  private hideTechCompleteAlert(): void {
    if (this.techCompleteModal) {
      this.techCompleteModal.classList.add("hidden");
      this.techCompleteModal.style.display = "none";
    }
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
