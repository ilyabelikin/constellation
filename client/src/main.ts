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
    metPlayers: { id: string; name: string; speciesId: string; speciesName: string }[];
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
    
    // CRITICAL: Ensure notification widgets are hidden on startup
    const mineableWidget = document.getElementById("mineable-objects-widget");
    const helium3Widget = document.getElementById("helium3-objects-widget");
    if (mineableWidget && !mineableWidget.classList.contains("hidden")) {
      mineableWidget.classList.add("hidden");
    }
    if (helium3Widget && !helium3Widget.classList.contains("hidden")) {
      helium3Widget.classList.add("hidden");
    }

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
      // Reload settings for this user
      this.lobby.reloadSettings();
      // Now that we're authenticated, request initial lobby data
      this.lobby.requestInitialData();
    };

    // Ignore game data while in lobby (player/system data sent during reconnection)
    this.network.onPlayerData = null;
    this.network.onPlayerIncomeUpdate = null;
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

      // Ensure HUD system is cleared so widgets hide properly
      if (this.game) {
        this.game.hud.clearSystem();
      }

      // Show lobby after connection
      this.lobby.show();
    } catch (error) {
      console.error("Failed to connect to server:", error);
      
      // Ensure HUD system is cleared so widgets hide properly
      if (this.game) {
        this.game.hud.clearSystem();
      }
      
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
      // Reload camera settings for this user
      this.scene.reloadCameraSettings();
    };

    this.network.onPlayerData = (player) => {
      console.log("Player data received:", player);
      this.player = player;
      this.hud.setPlayer(player);

      if (player.exploredGateIds) {
        this.scene.setExploredGates(player.exploredGateIds);
        
        // Refresh the outline to update gate names when new gates are explored
        // This is important when another civilization connects to our gates
        if (this.system) {
          this.hud.setSystem(this.system, true); // true = isRefresh, keeps selection
        }
      }

      this.scene.setCurrentPlayerId(player.id);

      // If player can't afford a day of research, show paused indicator immediately
      // (Server will officially pause on the next day tick, but we reflect it in the UI now)
      if (
        this.currentResearchData &&
        this.currentResearchData.status === "in_progress"
      ) {
        const sciencePerDay =
          this.currentResearchData.scienceNeeded /
          this.currentResearchData.daysNeeded;
        if (player.science < sciencePerDay) {
          this.showTechProgressIndicatorPaused(
            this.currentResearchData.technologyId
          );
        }
      }

      // Request tech tree data once on initial load to initialize research progress
      if (!this.hasInitializedTechState) {
        this.hasInitializedTechState = true;
        this.network.requestTechTree();
      }

      // Request resource breakdown to populate the tooltip data
      this.network.requestResourceBreakdown();

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

    this.network.onPlayerIncomeUpdate = (energyPerDay, alloyPerDay, sciencePerDay) => {
      if (this.player) {
        // Update player's income rates with net values (accounting for blockades)
        this.player.energyPerDay = energyPerDay;
        this.player.alloyPerDay = alloyPerDay;
        this.player.sciencePerDay = sciencePerDay;
        // Refresh HUD to show updated rates
        this.hud.setPlayer(this.player);
      }
    };

    this.network.onSystemData = (
      system,
      gateOwnership,
      tunnelOwnership,
      isConnectedToCapital
    ) => {
      console.log(
        "[SystemData] System data received at timestamp:",
        Date.now(),
        system,
        "connected to capital:",
        isConnectedToCapital
      );
      const isSystemRefresh = !!(this.system && this.system.id === system.id);

      // Store current selection before updating
      const previousSelection = isSystemRefresh
        ? (this.hud as any).selectedObjectId
        : null;

      this.system = system;

      // Update HUD with connectivity info
      this.hud.setConnectedToCapital(!!isConnectedToCapital);

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

        // Request resource breakdown when entering a new system
        this.network.requestResourceBreakdown();

        // Show the outline when entering a new system
        this.hud.showOutline();
      } else {
        this.scene.updateSystemData(system);
      }

      this.hud.setSystem(system, isSystemRefresh);

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
      // Clear all loading states on error
      this.hud.clearBodyActionLoadingState("mine");
      this.hud.clearBodyActionLoadingState("helium3");
      this.hud.clearBodyActionLoadingState("dyson");
      this.hud.clearBodyActionLoadingState("elevator");
      this.hud.clearBodyActionLoadingState("colonize");
      this.hud.clearBodyActionLoadingState("invade");
      this.hud.clearGateActionLoadingStates();
      
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
      destinationSystem: StarSystem,
      exploredGateIds: string[],
      exitGateId: string,
      gateOwnership: any,
      tunnelOwnership: any,
      isExitGateBlocked?: boolean,
      isConnectedToCapital?: boolean
    ) => {
      // Clear loading state on gate travel button
      this.hud.clearGateActionLoadingStates();
      
      console.log(
        "Gate travel to system:",
        destinationSystem.id,
        "connected to capital:",
        isConnectedToCapital
      );
      if (isExitGateBlocked) {
        console.log("⚠️ Exit gate is blocked by enemy defenses!");
      }

      // Update HUD with connectivity info
      this.hud.setConnectedToCapital(!!isConnectedToCapital);

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
          this.hud.setSystem(destinationSystem, false);
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
        preserveSelection,
        this.player?.homePlanetId || null,
        this.player?.homeSystemId || null
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
      currentRelationship
    ) => {
      this.hud.updatePlayerProfileStats(
        playerId,
        playerName,
        starsDiscovered,
        currentRelationship
      );
    };

    this.network.onRelationshipChanged = (otherPlayerId, otherPlayerName, relationship) => {
      console.log("Relationship changed with player", otherPlayerName, "to", relationship);
      this.hud.showNotification(
        `Relationship with ${otherPlayerName} is now: ${relationship === "at_war" ? "At War ⚔" : relationship === "friendly" ? "Friendly ✓" : "Neutral"}`
      );
      // Update the profile if it's currently open - clear any proposals since relationship changed
      this.hud.updatePlayerRelationshipStatus(otherPlayerId, relationship, null, null);
      // Refresh constellation view to update gate colors
      this.network.requestConstellation();
    };

    this.network.onRelationshipProposalReceived = (proposal) => {
      console.log("Received relationship proposal from", proposal.fromPlayerName);
      this.hud.showNotification(
        `📨 ${proposal.fromPlayerName} proposes a friendly relationship!`
      );
      // Update the profile if it's currently open for this player
      this.hud.updatePlayerRelationshipStatus(
        proposal.fromPlayerId,
        "neutral",
        proposal,
        undefined
      );
    };

    this.network.onRelationshipProposalSent = (proposal) => {
      console.log("Sent relationship proposal to", proposal.toPlayerName);
      this.hud.showNotification(
        `Friendly relationship proposal sent to ${proposal.toPlayerName}`
      );
      // Update the profile if it's currently open for this player
      this.hud.updatePlayerRelationshipStatus(
        proposal.toPlayerId,
        "neutral",
        undefined,
        proposal
      );
    };

    this.network.onProposalAccepted = (playerId, playerName) => {
      console.log("Proposal accepted by", playerName);
      this.hud.showNotification(
        `✓ ${playerName} accepted your friendly relationship proposal!`
      );
    };

    this.network.onProposalRejected = (playerId, playerName) => {
      console.log("Proposal rejected by", playerName);
      this.hud.showNotification(
        `✗ ${playerName} rejected your friendly relationship proposal`
      );
    };

    this.network.onRelationshipStatus = (relationships, incomingProposals, outgoingProposals) => {
      console.log("Relationship status received", relationships, incomingProposals, outgoingProposals);
      // This can be used to update a diplomacy screen if we add one later
    };

    this.network.onMiningEstablished = (
      miningOperationId,
      celestialBodyId,
      alloyPerDay
    ) => {
      console.log(`[Mining] Operation established on ${celestialBodyId}, rate: ${alloyPerDay}/day`);
      
      // Clear loading state on mining button
      this.hud.clearBodyActionLoadingState("mine");
      
      // Request updated resource breakdown to show the new mining operation
      this.network.requestResourceBreakdown();

      // Re-select the body to refresh its details with the new mining operation
      setTimeout(() => {
        console.log(`[Mining] Re-selecting body ${celestialBodyId}`);
        if (this.hud.onSelectObject) {
          this.hud.onSelectObject(celestialBodyId);
        }
      }, 100); // Small delay to ensure system data is processed
    };

    this.network.onResearchEstablished = (
      researchOperationId,
      celestialBodyId,
      sciencePerDay
    ) => {
      console.log(`[Research] Station established on ${celestialBodyId}, rate: ${sciencePerDay}/day`);

      this.hud.clearBodyActionLoadingState("research");
      this.network.requestResourceBreakdown();

      setTimeout(() => {
        if (this.hud.onSelectObject) {
          this.hud.onSelectObject(celestialBodyId);
        }
      }, 100);
    };

    this.network.onDysonSwarmLaunched = (
      megastructureId,
      starId,
      energyPerDay,
      count,
      maxSwarms
    ) => {
      // Clear loading state on dyson button
      this.hud.clearBodyActionLoadingState("dyson");
      
      this.scene.launchDysonSwarm(megastructureId, starId);
      setTimeout(() => {
        if (this.hud.onSelectObject) {
          this.hud.onSelectObject(starId);
        }
      }, 0);
    };

    this.network.onColonyEstablished = (colony) => {
      // Clear loading state on colonize button
      this.hud.clearBodyActionLoadingState("colonize");
      
      // Trigger colony establishment animation
      this.scene.triggerColonyEstablishment(colony.planetId);

      setTimeout(() => {
        if (this.hud.onSelectObject) {
          this.hud.onSelectObject(colony.planetId);
        }
      }, 0);
    };

    this.network.onColonyInvaded = (colony, previousOwnerId) => {
      // Clear loading state on invade button
      this.hud.clearBodyActionLoadingState("invade");
      
      // Trigger colony invasion animation
      this.scene.triggerColonyInvasion(colony.planetId);

      // Show notification
      this.hud.showNotification(`Successfully invaded colony on ${colony.planetName}!`, 5000);

      // Update the colony in the current system state
      if (this.system && this.system.colonies) {
        const colonyIndex = this.system.colonies.findIndex(
          (c) => c.planetId === colony.planetId
        );
        if (colonyIndex !== -1) {
          this.system.colonies[colonyIndex] = colony;
        } else {
          this.system.colonies.push(colony);
        }
      }

      // Update the HUD's system reference immediately to update detail views
      if (this.system) {
        this.hud.setSystem(this.system, true);
      }

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
        this.hud.setSystem(this.system, true);
      }

      // Refresh the body detail view if this planet is currently selected
      const selectedId = this.scene.getSelectedObjectId();
      if (selectedId === colony.planetId) {
        this.hud.updateObjectDetails(colony.planetId);
      }
    };

    this.network.onColonyRemoved = (planetId) => {
      // Find colony name before removing it for notification
      const colony = this.system?.colonies?.find(c => c.planetId === planetId);
      const colonyName = colony ? colony.planetName : "a planet";

      // Remove the colony from the current system state
      if (this.system && this.system.colonies) {
        this.system.colonies = this.system.colonies.filter(
          (c) => c.planetId !== planetId
        );
      }

      // Update HUD and scene if needed
      if (this.system) {
        this.hud.setSystem(this.system, true);
      }

      // Refresh object details if this planet was selected
      const selectedId = this.scene.getSelectedObjectId();
      if (selectedId === planetId) {
        this.hud.updateObjectDetails(planetId);
      }
    };

    this.network.onColonyStarving = (planetId, planetName, starvationSeverity, scienceDeficit, alloyDeficit) => {
      // Show notification to player about starvation
      let deficitMsg = "";
      if (scienceDeficit > 0.1 && alloyDeficit > 0.1) {
        deficitMsg = `Missing ${(scienceDeficit * 100).toFixed(0)}% science and ${(alloyDeficit * 100).toFixed(0)}% alloy`;
      } else if (scienceDeficit > 0.1) {
        deficitMsg = `Missing ${(scienceDeficit * 100).toFixed(0)}% science`;
      } else if (alloyDeficit > 0.1) {
        deficitMsg = `Missing ${(alloyDeficit * 100).toFixed(0)}% alloy`;
      }
      
      this.hud.showNotification(
        `🚨 Colony Starving: ${planetName} - ${deficitMsg}. Population is declining rapidly! Check blockades or resource production.`,
        8000
      );
    };

    this.network.onColonyAbandoned = (planetId, planetName) => {
      // Show notification to player
      this.hud.showNotification(
        `⚠️ Colony Abandoned: ${planetName} - The colony has died out (0 population). Energy refunded, but alloy and science are lost.`,
        5000
      );

      // Remove the colony from the current system state
      if (this.system && this.system.colonies) {
        this.system.colonies = this.system.colonies.filter(
          (c) => c.planetId !== planetId
        );
      }

      // Refresh the UI if this planet is currently selected
      const selectedId = this.scene.getSelectedObjectId();
      if (selectedId === planetId) {
        this.hud.updateObjectDetails(planetId);
      }
    };

    this.network.onGateDefenseBuilt = (defense) => {
      // Clear loading state on fortify button
      this.hud.clearGateActionLoadingStates();
      
      // Add defense platform to the scene (if gate is in current system)
      this.scene.addGateDefense(defense);

      // Refresh gate details if this gate is currently selected
      const selectedId = this.scene.getSelectedObjectId();
      if (selectedId === defense.gateId) {
        // Refresh to show updated defense count
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
      // Clear loading state on attack button
      this.hud.clearGateActionLoadingStates();
      
      // Update attack with combat results
      this.scene.updateGateAttack(attack);

      console.log(`Gate attack ${attack.id} updated: status=${attack.status}`);

      // If attack is complete, refresh the HUD immediately so player can see Capture/Overtake options
      if (attack.status !== "in_progress") {
        // Refresh the details panel immediately if the attacked gate is selected
        const selectedId = this.scene.getSelectedObjectId();

        if (selectedId === attack.gateId) {
          // Refresh to show updated gate status
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
      // Clear loading state on capture/overtake buttons
      this.hud.clearGateActionLoadingStates();
      
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
        // Refresh to show updated ownership
        this.hud.updateObjectDetails(gateId);
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
        // Refresh to show updated resource flow
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
      } else if (currentResearch && currentResearch.status === "paused") {
        this.showTechProgressIndicatorPaused(currentResearch.technologyId);
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
      // Show the progress indicator in paused state (don't hide it)
      this.showTechProgressIndicatorPaused(technologyId);
      // Refresh tech tree if it's already open
      if (this.techTreeView.isVisible()) {
        this.shouldShowTechTreeModal = true;
        this.network.requestTechTree();
      }
    };

    this.network.onResearchResumed = (technologyId) => {
      console.log(`Research resumed: ${technologyId}`);
      // Update research status to in_progress and reset interpolation anchor
      if (
        this.currentResearchData &&
        this.currentResearchData.technologyId === technologyId
      ) {
        this.currentResearchData.status = "in_progress";
        this.currentResearchData.lastUpdateTime = this.scene.getGameTime();
      }
      // Show the progress indicator again (removes paused class via normal update cycle)
      this.showTechProgressIndicator();
      // Refresh tech tree if it's already open
      if (this.techTreeView.isVisible()) {
        this.shouldShowTechTreeModal = true;
        this.network.requestTechTree();
      }
    };

    this.network.onResearchCompleted = (technologyId, technologyName) => {
      console.log(`[Research] ✅ onResearchCompleted callback triggered!`);
      console.log(`[Research] Technology: ${technologyName} (${technologyId})`);
      // Clear the stored research data
      this.currentResearchData = null;
      // Hide the progress indicator
      this.hideTechProgressIndicator();
      // Show the tech complete alert with full details
      console.log(`[Research] About to call showTechCompleteAlert...`);
      this.showTechCompleteAlert(technologyId, technologyName);
      console.log(`[Research] showTechCompleteAlert called`);
      // Refresh tech tree if it's open
      if (this.techTreeView.isVisible()) {
        this.shouldShowTechTreeModal = true;
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

    this.network.onGameOver = (reason) => {
      this.hud.showGameOver(reason, () => {
        // Bring user back to main menu/lobby
        window.location.reload();
      });
    };

    this.hud.onProposeRelationship = (targetPlayerId, relationshipType) => {
      this.network.proposeRelationship(targetPlayerId, relationshipType);
    };

    this.hud.onRespondToProposal = (proposalId, accept) => {
      this.network.respondToProposal(proposalId, accept);
    };

    this.hud.onDeclareWar = (targetPlayerId) => {
      this.network.declareWar(targetPlayerId);
    };

    this.hud.onEstablishMining = (celestialBodyId) => {
      this.network.establishMining(celestialBodyId);
    };

    this.hud.onEstablishHelium3 = (celestialBodyId) => {
      this.network.establishHelium3Extraction(celestialBodyId);
    };

    this.hud.onEstablishResearch = (celestialBodyId) => {
      this.network.establishResearch(celestialBodyId);
    };

    this.hud.onLaunchDysonSwarm = (starId) => {
      this.network.launchDysonSwarm(starId);
    };

    this.hud.onBuildSpaceElevator = (planetId) => {
      this.network.buildSpaceElevator(planetId);
    };

    this.hud.onEstablishColony = (planetId, specialization) => {
      this.network.establishColony(planetId, specialization);
    };

    this.hud.onInvadeColony = (planetId) => {
      this.network.invadeColony(planetId);
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
            this.hud.setSystem(this.system, true, true); // true = isRefresh, true = fromConstellationView
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
            this.hud.setSystem(this.system, true, true); // true = isRefresh, true = fromConstellationView
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
          this.hud.setSystem(this.system, true, true); // true = isRefresh, true = fromConstellationView
          // Show the outline when returning to system view
          this.hud.showOutline();

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              this.scene.centerOnObject(this.system!.star.id);
              this.hud.updateObjectDetails(this.system!.star.id);
            });
          });
        } else {
          // Request the new system - the star will be auto-selected when it loads
          // (see lines 406-411 in onSystemData callback)
          // The outline will be shown automatically when the new system loads
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
        this.hud.setSystem(this.system, true, true); // true = isRefresh, true = fromConstellationView

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
          this.hud.setSystem(this.system, true, true); // true = isRefresh, true = fromConstellationView
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

    // Update tech progress indicator every frame based on research status
    if (this.currentResearchData) {
      if (this.currentResearchData.status === "in_progress") {
        // Don't interpolate progress if the player can't afford a day of research
        // The server will officially pause on the next day tick, but we show it immediately
        const playerScience = this.player?.science ?? 0;
        const sciencePerDay =
          this.currentResearchData.scienceNeeded /
          this.currentResearchData.daysNeeded;
        if (playerScience < sciencePerDay) {
          // No science available - show as paused on the client (server will confirm)
          if (
            this.techProgressBar &&
            !this.techProgressBar.classList.contains("paused")
          ) {
            this.showTechProgressIndicatorPaused(
              this.currentResearchData.technologyId
            );
          }
        } else {
          // Calculate interpolated progress based on elapsed time
          const elapsedSeconds =
            currentGameTime - this.currentResearchData.lastUpdateTime;
          const elapsedDays = elapsedSeconds / 86400; // 86400 seconds per day
          const currentProgressDays =
            this.currentResearchData.progressDays + elapsedDays;

          // Check if research has reached 100%
          if (currentProgressDays >= this.currentResearchData.daysNeeded) {
            // Hide the progress indicator when complete (but keep data until server confirms)
            this.hideTechProgressIndicator();
          } else {
            // Update the indicator with current progress
            this.updateTechProgressIndicator(
              this.currentResearchData.technologyId,
              currentProgressDays,
              this.currentResearchData.scienceInvested
            );

            // Also update the tech tree modal if it's visible
            if (this.techTreeView.isVisible()) {
              this.techTreeView.updateProgressDisplay(
                currentProgressDays,
                this.currentResearchData.scienceInvested
              );
            }
          }
        }
      } else if (this.currentResearchData.status === "paused") {
        // Research is paused - ensure indicator stays visible in paused state
        // Only update if not already showing paused (avoid re-setting every frame)
        if (
          this.techProgressBar &&
          !this.techProgressBar.classList.contains("paused")
        ) {
          this.showTechProgressIndicatorPaused(
            this.currentResearchData.technologyId
          );
        }
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
    // Remove paused style if present
    if (this.techProgressBar) {
      this.techProgressBar.classList.remove("paused");
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

    // Ensure bar shows active color
    if (this.techProgressBar) {
      this.techProgressBar.classList.remove("paused");
    }
  }

  private showTechProgressIndicatorPaused(technologyId: string): void {
    const tech = TECHNOLOGIES[technologyId];
    if (!tech || !this.techProgressBar) return;

    // Show the indicator
    this.showTechProgressIndicator();

    // Calculate current progress percentage from stored data
    const progressDays = this.currentResearchData?.progressDays ?? 0;
    const progressPercent = Math.min(
      99.9,
      (progressDays / tech.researchDays) * 100
    );

    // Update the SVG circle to show current progress
    const circumference = 28.27;
    const offset = circumference - (progressPercent / 100) * circumference;
    this.techProgressBar.style.strokeDashoffset = offset.toString();

    // Add paused visual style
    this.techProgressBar.classList.add("paused");

    // Update tooltip to show paused state
    if (this.techButton) {
      this.techButton.title = `${tech.name}: ${progressPercent.toFixed(1)}% (PAUSED)`;
    }
  }

  private showTechCompleteAlert(
    technologyId: string,
    technologyName: string
  ): void {
    console.log(
      `[TechAlert] Showing tech complete alert for: ${technologyName} (${technologyId})`
    );
    const tech = TECHNOLOGIES[technologyId];

    if (!tech) {
      console.error(`[TechAlert] Technology not found: ${technologyId}`);
      return;
    }

    if (
      !this.techCompleteModal ||
      !this.techCompleteName ||
      !this.techCompleteDescription ||
      !this.techCompleteEffectsList
    ) {
      console.error("[TechAlert] Modal elements not initialized:", {
        modal: !!this.techCompleteModal,
        name: !!this.techCompleteName,
        description: !!this.techCompleteDescription,
        effectsList: !!this.techCompleteEffectsList,
      });
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
    console.log("[TechAlert] Displaying modal");
    this.techCompleteModal.classList.remove("hidden");
    this.techCompleteModal.style.display = "flex";
    console.log(
      "[TechAlert] Modal display set to:",
      this.techCompleteModal.style.display
    );
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
