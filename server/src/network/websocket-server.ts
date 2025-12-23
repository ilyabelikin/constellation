import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import {
  ClientMessage,
  ServerMessage,
  serializeMessage,
  deserializeMessage,
  Player,
  Ship,
  StarSystem,
  StarGate,
  WEBSOCKET_PORT,
  STATE_UPDATE_RATE,
  ASTRONOMICAL_UNIT,
  SearchResult,
  TIME_SCALE_DEFAULT,
  BASE_POPULATION_DENSITY,
  ATTACK_SHIP_CONFIG,
  DEFENSE_PLATFORM_CONFIG,
  MINING_INSTALLATION_CONFIG,
  HELIUM3_EXTRACTION_CONFIG,
  COMBAT_CONFIG,
  GAME_COSTS,
  STARTING_RESOURCES,
  calculateColonyYields,
  getColonyStage,
  TECHNOLOGIES,
  SOLAR_RADIUS,
  DYSON_SWARM_ENERGY,
  HELIUM3_ENERGY,
  calculateMaxDysonSwarms,
  calculateIceCapCoverage,
} from "@constellation/shared";
import { DatabaseQueries } from "../database/queries.js";
import { GameStateManager } from "../game/state-manager.js";
import { calculatePlayerResourceFlow, findGatePath } from "../game/resource-flow.js";
import {
  generateGalaxy,
  generateStarterSystem,
  generateNewSystem,
  StarterSystemResult,
} from "../generation/galaxy-generator.js";
import { generatePlayerSpecies } from "../generation/species-generator.js";
import {
  getAllPregeneratedSpecies,
  getPregeneratedSpecies,
} from "../generation/pregenerated-species.js";
import { generateGalaxyName } from "../generation/name-generator.js";

interface ClientConnection {
  ws: WebSocket;
  playerId: string | null;
  uuid: string | null;
  currentSystemId: string | null;
  playerName: string | null;
  galaxyId: string | null;
}

export class ConstellationWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<WebSocket, ClientConnection> = new Map();
  private db: DatabaseQueries;
  private gameState: GameStateManager;

  constructor(db: DatabaseQueries, gameState: GameStateManager) {
    this.db = db;
    this.gameState = gameState;
    this.wss = new WebSocketServer({ port: WEBSOCKET_PORT });

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ee94a6f1-42d6-44ad-8459-4ef2edbb6497',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'websocket-server.ts:constructor',message:'WebSocket server created',data:{port:WEBSOCKET_PORT,clientsCount:0},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion

    // Register callback for when in-game days elapse (integrated with game state updates)
    this.gameState.setDayElapsedCallback((galaxyId, currentTime, daysElapsed) => {
      this.handleDayElapsed(galaxyId, currentTime, daysElapsed);
    });

    this.wss.on("connection", (ws) => this.handleConnection(ws));
    this.startStateUpdates();
    this.startTimeSaveInterval();
    this.startGalaxyCleanupInterval();

    console.log(`WebSocket server started on port ${WEBSOCKET_PORT}`);
  }

  private handleConnection(ws: WebSocket): void {
    const client: ClientConnection = {
      ws,
      playerId: null,
      uuid: null,
      currentSystemId: null,
      playerName: null,
      galaxyId: null,
    };

    this.clients.set(ws, client);
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ee94a6f1-42d6-44ad-8459-4ef2edbb6497',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'websocket-server.ts:handleConnection',message:'New client connected',data:{clientsCount:this.clients.size,clientMapSize:this.clients.size},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
    
    console.log("New client connected");

    ws.on("message", (data) => this.handleMessage(ws, data.toString()));
    ws.on("close", () => this.handleDisconnect(ws));
    ws.on("error", (error) => console.error("WebSocket error:", error));
  }

  private handleMessage(ws: WebSocket, data: string): void {
    try {
      const message = deserializeMessage(data) as ClientMessage;
      const client = this.clients.get(ws);
      if (!client) return;

      console.log(`[Server] Received message type: ${message.type}`);
      if (
        message.type === "debugAddResource" ||
        message.type === "createGalaxy" ||
        message.type === "debugConnectGate"
      ) {
        console.log("[Server] Message details:", message);
      }

      switch (message.type) {
        case "authenticate":
          this.handleAuthenticate(client, message.uuid);
          break;
        case "setName":
          this.handleSetName(client, message.name);
          break;
        case "queryGalaxy":
          this.handleQueryGalaxy(client, message.galaxyName);
          break;
        case "getGalaxyList":
          this.handleGetGalaxyList(client);
          break;
        case "getPlayerGameInfo":
          this.handleGetPlayerGameInfo(client);
          break;
        case "getPregeneratedSpecies":
          this.handleGetPregeneratedSpecies(client);
          break;
        case "getGalaxySpecies":
          this.handleGetGalaxySpecies(client, message.galaxyId);
          break;
        case "createEmptyGalaxy":
          this.handleCreateEmptyGalaxy(client);
          break;
        case "joinGalaxy":
          this.handleJoinGalaxy(
            client,
            message.galaxyId,
            message.playerName,
            message.speciesId
          );
          break;
        case "createGalaxy":
          this.handleCreateGalaxy(
            client,
            message.playerName,
            message.speciesId
          );
          break;
        case "resetGalaxy":
          this.handleResetGalaxy(
            client,
            message.galaxyName,
            message.playerName
          );
          break;
        case "requestSystemState":
          this.handleRequestSystemState(client, message.systemId);
          break;
        case "setTimeScale":
          if (client.galaxyId) {
            this.gameState.setTimeScale(client.galaxyId, message.scale);
            this.broadcastTimeUpdate();
          }
          break;
        case "pauseTime":
          if (client.galaxyId) {
            this.gameState.pause(client.galaxyId);
            this.broadcastTimeUpdate();
          }
          break;
        case "resumeTime":
          if (client.galaxyId) {
            this.gameState.resume(client.galaxyId);
            this.broadcastTimeUpdate();
          }
          break;
        case "shipManeuver":
          this.handleShipManeuver(client, message.maneuver);
          break;
        case "useGate":
          this.handleUseGate(client, message.gateId);
          break;
        case "requestConstellation":
          this.handleRequestConstellation(client);
          break;
        case "saveConstellationPositions":
          this.handleSaveConstellationPositions(client, message.positions);
          break;
        case "searchObjects":
          this.handleSearchObjects(client, message.query);
          break;
        case "requestPlayerStats":
          this.handleRequestPlayerStats(client, message.playerId);
          break;
        case "proposeRelationship":
          this.handleProposeRelationship(
            client,
            message.targetPlayerId,
            message.relationshipType
          );
          break;
        case "respondToProposal":
          this.handleRespondToProposal(client, message.proposalId, message.accept);
          break;
        case "declareWar":
          this.handleDeclareWar(client, message.targetPlayerId);
          break;
        case "requestRelationshipStatus":
          this.handleRequestRelationshipStatus(client);
          break;
        case "establishMining":
          this.handleEstablishMining(client, message.celestialBodyId);
          break;
        case "establishHelium3Extraction":
          this.handleEstablishHelium3Extraction(client, message.celestialBodyId);
          break;
        case "launchDysonSwarm":
          this.handleLaunchDysonSwarm(client, message.starId);
          break;
        case "debugAddResource":
          this.handleDebugAddResource(
            client,
            message.resourceType,
            message.amount
          );
          break;
        case "establishColony":
          this.handleEstablishColony(
            client,
            message.planetId,
            message.specialization
          );
          break;
        case "removeColony":
          this.handleRemoveColony(client, message.planetId);
          break;
        case "updateColonySpecialization":
          this.handleUpdateColonySpecialization(
            client,
            message.colonyId,
            message.specialization
          );
          break;
        case "requestSpeciesInfo":
          this.handleRequestSpeciesInfo(client, message.speciesId);
          break;
        case "fortifyGate":
          this.handleFortifyGate(client, message.gateId);
          break;
        case "attackGate":
          this.handleAttackGate(client, message.gateId);
          break;
        case "overtakeGate":
          this.handleOvertakeGate(client, message.gateId);
          break;
        case "captureGate":
          this.handleCaptureGate(client, message.gateId);
          break;
        case "overtakeTunnel":
          this.handleOvertakeTunnel(client, message.tunnelId);
          break;
        case "powerOffTunnel":
          console.log(`[Server] Received powerOffTunnel for tunnel: ${message.tunnelId}`);
          this.handlePowerOffTunnel(client, message.tunnelId);
          break;
        case "powerOnTunnel":
          this.handlePowerOnTunnel(client, message.tunnelId);
          break;
        case "overchargeTunnel":
          this.handleOverchargeTunnel(client, message.tunnelId);
          break;
        case "debugConnectGate":
          this.handleDebugConnectGate(client, message.gateId);
          break;
        case "requestResourceBreakdown":
          this.handleRequestResourceBreakdown(client);
          break;
        case "requestTechTree":
          this.handleRequestTechTree(client);
          break;
        case "startResearch":
          this.handleStartResearch(client, message.technologyId);
          break;
        case "pauseResearch":
          this.handlePauseResearch(client, message.technologyId);
          break;
        case "resumeResearch":
          this.handleResumeResearch(client, message.technologyId);
          break;
      }
    } catch (error) {
      console.error("Error handling message:", error);
      if (error instanceof Error) {
        console.error("Error stack:", error.stack);
      }
      console.error("Raw message data:", data);
      try {
        const parsedMessage = JSON.parse(data);
        console.error("Parsed message:", parsedMessage);
        console.error("Message type:", parsedMessage.type);
      } catch (e) {
        console.error("Could not parse message as JSON");
      }
      this.sendError(ws, "Invalid message format");
    }
  }

  private handleAuthenticate(
    client: ClientConnection,
    uuid: string | null
  ): void {
    if (!uuid) {
      // Generate new UUID
      uuid = uuidv4();
      this.send(client.ws, { type: "authenticated", uuid, playerId: null });
      client.uuid = uuid;
      return;
    }

    // Check if player exists
    const player = this.db.getPlayerByUuid(uuid);
    if (player) {
      client.uuid = uuid;
      // Restore full session state for reconnection
      client.playerId = player.id;
      client.currentSystemId = player.currentSystemId;
      client.galaxyId = player.galaxyId;

      // Load galaxy time state into game state manager
      // Always start paused when player reconnects/continues to prevent time advancing during load
      const galaxy = this.db.getGalaxyById(player.galaxyId);
      if (galaxy) {
        this.gameState.loadGalaxy(
          galaxy.id,
          galaxy.currentTime || 0,
          true, // Always start paused when continuing
          galaxy.timeScale || TIME_SCALE_DEFAULT
        );
      }

      // Load current system into game state
      const system = this.db.getStarSystem(player.currentSystemId);
      if (system) {
        this.gameState.loadSystem(system);
        const ships = this.db.getShipsBySystem(system.id);
        this.gameState.loadShips(system.id, ships);
      }

      // Send authentication confirmation
      this.send(client.ws, {
        type: "authenticated",
        uuid,
        playerId: player.id,
      });

      // Send player data to restore client state
      this.send(client.ws, { type: "playerData", player });

      // Send system data
      if (system) {
        const gateOwnership = this.db.getGateOwnershipForSystem(
          player.id,
          system.id
        );
        this.send(client.ws, {
          type: "systemData",
          system,
          gateOwnership: gateOwnership.length > 0 ? gateOwnership : undefined,
        });
      }

      // Send ship data
      const ship = this.db.getShipByPlayerId(player.id);
      if (ship) {
        this.send(client.ws, { type: "shipData", ship });
      }

      // Send current time state
      if (galaxy) {
        const galaxyState = this.gameState.getGalaxyState(galaxy.id);
        if (galaxyState) {
          this.send(client.ws, {
            type: "timeUpdate",
            currentTime: galaxyState.currentTime,
            isPaused: galaxyState.isPaused,
            timeScale: galaxyState.timeScale,
          });
        }
      }

      console.log(`Player ${player.name} session restored after reconnection`);
      
      // Send galaxy players info to the reconnecting player
      console.log(`[DEBUG] Sending galaxy players info to reconnecting player in handleAuthenticate: ${player.name}`);
      this.sendGalaxyPlayersInfo(client, player);

      // Check for and send any pending relationship proposals
      const incomingProposals = this.db.getIncomingProposals(player.id);
      if (incomingProposals.length > 0) {
        console.log(`Player ${player.name} has ${incomingProposals.length} pending proposal(s)`);
        for (const proposal of incomingProposals) {
          this.send(client.ws, {
            type: "relationshipProposalReceived",
            proposal: {
              id: proposal.id,
              fromPlayerId: proposal.fromPlayerId,
              fromPlayerName: proposal.fromPlayerName,
              proposalType: proposal.proposalType,
              createdAt: proposal.createdAt,
            },
          });
        }
      }
    } else {
      this.send(client.ws, { type: "authenticated", uuid, playerId: null });
      client.uuid = uuid;
    }
  }

  private handleSetName(client: ClientConnection, name: string): void {
    if (!client.uuid) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    // Store the player's chosen name
    client.playerName = name.trim() || null;
    console.log(`Client ${client.uuid} set name to: ${client.playerName}`);
  }

  private handleQueryGalaxy(
    client: ClientConnection,
    galaxyName: string
  ): void {
    const galaxy = this.db.getGalaxyByName(galaxyName);

    if (!galaxy) {
      // Galaxy doesn't exist, return 0 time
      this.send(client.ws, {
        type: "galaxyInfo",
        galaxyName,
        exists: false,
        currentTime: 0,
      });
      return;
    }

    // Galaxy exists, return its current game time
    // Try to get in-memory time first (more up-to-date), fall back to database value
    const galaxyState = this.gameState.getGalaxyState(galaxy.id);
    const currentTime = galaxyState
      ? galaxyState.currentTime
      : galaxy.currentTime || 0;

    this.send(client.ws, {
      type: "galaxyInfo",
      galaxyName,
      exists: true,
      currentTime,
    });
  }

  private handleJoinGalaxy(
    client: ClientConnection,
    galaxyId: string,
    playerName: string,
    speciesId: string
  ): void {
    if (!client.uuid) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const galaxy = this.db.getGalaxyById(galaxyId);
    if (!galaxy) {
      this.sendError(client.ws, "Galaxy not found");
      return;
    }

    // Load galaxy time state into game state manager
    this.gameState.loadGalaxy(
      galaxy.id,
      galaxy.currentTime || 0,
      galaxy.isPaused !== false, // Default to paused if not specified
      galaxy.timeScale || TIME_SCALE_DEFAULT
    );

    // Set client's galaxy ID
    client.galaxyId = galaxy.id;

    // Check if player already exists
    let existingPlayer = this.db.getPlayerByUuid(client.uuid);

    // If player exists in a different galaxy, delete and recreate
    if (existingPlayer && existingPlayer.galaxyId !== galaxyId) {
      console.log(
        `[Server] Player switching galaxies: ${existingPlayer.galaxyId} -> ${galaxyId}. Old resources: energy=${existingPlayer.energy}, alloy=${existingPlayer.alloy}, science=${existingPlayer.science}`
      );
      // Delete old player and create new one in the new galaxy
      this.db.deletePlayer(existingPlayer.id);

      // Clear client state and existingPlayer reference
      client.playerId = null;
      client.currentSystemId = null;
      existingPlayer = null;
      
      console.log(`[Server] Player deleted and will be recreated with starting resources`);
    }

    if (existingPlayer) {
      // Player exists in the same galaxy, update their name if provided
      if (playerName && playerName.trim()) {
        this.db.updatePlayerName(existingPlayer.id, playerName.trim());
        existingPlayer.name = playerName.trim(); // Update in memory
        console.log(`Updated player name to: ${playerName.trim()}`);
      }

      // Update player activity
      this.db.updatePlayerActivity(existingPlayer.id);

      // Load their data
      client.playerId = existingPlayer.id;
      client.currentSystemId = existingPlayer.currentSystemId;

      // Load system into game state (with mining operations and megastructures)
      const system = this.db.getStarSystem(existingPlayer.currentSystemId);
      if (system) {
        this.gameState.loadSystem(system);
        const ships = this.db.getShipsBySystem(system.id);
        this.gameState.loadShips(system.id, ships);
      }

      // Send data to client
      this.send(client.ws, { type: "playerData", player: existingPlayer });
      if (system) {
        const gateOwnership = this.db.getGateOwnershipForSystem(
          existingPlayer.id,
          system.id
        );
        this.send(client.ws, {
          type: "systemData",
          system,
          gateOwnership: gateOwnership.length > 0 ? gateOwnership : undefined,
        });
      }
      const ship = this.db.getShipByPlayerId(existingPlayer.id);
      if (ship) {
        this.send(client.ws, { type: "shipData", ship });
      }

      // Send galaxy players info to the reconnecting player
      console.log(`[DEBUG] Sending galaxy players info to reconnecting player: ${existingPlayer.name}`);
      this.sendGalaxyPlayersInfo(client, existingPlayer);

      // Broadcast updated galaxy players info if name was changed
      if (playerName && playerName.trim()) {
        this.broadcastGalaxyPlayersInfo(galaxy.id);
      }
    }

    // Check again if player needs to be created (either new or deleted above)
    if (!client.playerId) {
      // New player, create them
      // Generate a unique starting system for this player, separate from other players
      console.log(
        `Generating unique starting system for new player in galaxy: ${galaxy.name}`
      );

      const starterResult = generateStarterSystem(
        galaxy.id,
        galaxy.seed + Date.now()
      );
      this.db.createStarSystem(starterResult.system);

      // Save tunnels for the starter system (only for non-placeholder systems)
      for (const tunnel of starterResult.tunnels) {
        // Only create tunnel if both systems exist (not placeholders)
        if (
          !tunnel.systemAId.startsWith("PLACEHOLDER_") &&
          !tunnel.systemBId.startsWith("PLACEHOLDER_")
        ) {
          this.db.createTunnel(tunnel);
        }
      }

      // Save gates for the starter system
      for (const gate of starterResult.system.gates) {
        this.db.createGate(gate);
      }

      this.createPlayerInGalaxy(
        client,
        galaxy.id,
        galaxy.name,
        starterResult.homePlanetId,
        playerName,
        speciesId
      );

      // Update player activity
      if (client.playerId) {
        this.db.updatePlayerActivity(client.playerId);
      }
    }

    // Send initial time state to the joining player
    const galaxyState = this.gameState.getGalaxyState(galaxy.id);
    if (galaxyState) {
      this.send(client.ws, {
        type: "timeUpdate",
        currentTime: galaxyState.currentTime,
        isPaused: galaxyState.isPaused,
        timeScale: galaxyState.timeScale,
      });
    }

    console.log(
      `Player joined galaxy: ${
        galaxy.name
      } (active players: ${this.getActivePlayerCount()})`
    );
    this.send(client.ws, { type: "galaxyJoined", galaxyId: galaxy.id });
  }

  private handleCreateGalaxy(
    client: ClientConnection,
    playerName: string,
    speciesId: string
  ): void {
    if (!client.uuid) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    console.log(
      `[Server] Creating new galaxy for player: ${playerName}, species: ${speciesId}`
    );

    // Check if player already exists - if so, delete them first
    // This allows players to start fresh in a new galaxy
    const existingPlayer = this.db.getPlayerByUuid(client.uuid);
    if (existingPlayer) {
      console.log(
        `[Server] Deleting existing player ${existingPlayer.name} (ID: ${existingPlayer.id}) to start fresh. Old resources: energy=${existingPlayer.energy}, alloy=${existingPlayer.alloy}, science=${existingPlayer.science}`
      );
      this.db.deletePlayer(existingPlayer.id);

      // Clear client state
      client.playerId = null;
      client.currentSystemId = null;
      client.galaxyId = null;
      
      console.log(`[Server] Player deleted and client state cleared`);
    }

    // Generate a unique galaxy name
    const galaxyName = generateGalaxyName();

    // Create new galaxy
    const galaxy = generateGalaxy(galaxyName);
    this.db.createGalaxy(galaxy);

    // Generate starter system
    const starterResult = generateStarterSystem(galaxy.id, galaxy.seed);
    this.db.createStarSystem(starterResult.system);

    // Save tunnels for the starter system
    for (const tunnel of starterResult.tunnels) {
      this.db.createTunnel(tunnel);
    }

    // Save gates for the starter system
    for (const gate of starterResult.system.gates) {
      this.db.createGate(gate);
    }

    // Load galaxy time state (new galaxy starts at 0, paused)
    this.gameState.loadGalaxy(galaxy.id, 0, true, TIME_SCALE_DEFAULT);
    this.gameState.resetTime();

    // Set client's galaxy ID
    client.galaxyId = galaxy.id;

    // Create player
    this.createPlayerInGalaxy(
      client,
      galaxy.id,
      galaxyName,
      starterResult.homePlanetId,
      playerName,
      speciesId
    );

    // Send initial time state to the joining player
    const galaxyState = this.gameState.getGalaxyState(galaxy.id);
    if (galaxyState) {
      this.send(client.ws, {
        type: "timeUpdate",
        currentTime: galaxyState.currentTime,
        isPaused: galaxyState.isPaused,
        timeScale: galaxyState.timeScale,
      });
    }

    this.send(client.ws, {
      type: "galaxyCreated",
      galaxyId: galaxy.id,
      galaxyName: galaxyName,
    });
  }

  private handleGetGalaxyList(client: ClientConnection): void {
    if (!client.uuid) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const galaxies = this.db.getAllGalaxiesWithStats();

    this.send(client.ws, {
      type: "galaxyList",
      galaxies,
    });
  }

  private handleGetPlayerGameInfo(client: ClientConnection): void {
    if (!client.uuid) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const player = this.db.getPlayerByUuid(client.uuid);
    if (!player) {
      this.send(client.ws, {
        type: "playerGameInfo",
        hasGame: false,
      });
      return;
    }

    // Get galaxy name
    const galaxy = this.db.getGalaxyById(player.galaxyId);
    if (!galaxy) {
      this.send(client.ws, {
        type: "playerGameInfo",
        hasGame: false,
      });
      return;
    }

    // Get species name
    let speciesName = "Unknown Species";
    if (player.speciesId) {
      const species = this.db.getSpeciesById(player.speciesId);
      if (species) {
        speciesName = species.name;
      }
    }

    this.send(client.ws, {
      type: "playerGameInfo",
      hasGame: true,
      playerName: player.name,
      galaxyId: galaxy.id,
      galaxyName: galaxy.name,
      speciesName: speciesName,
      currentSystemId: player.currentSystemId,
    });
  }

  private handleGetPregeneratedSpecies(client: ClientConnection): void {
    if (!client.uuid) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const species = getAllPregeneratedSpecies();

    this.send(client.ws, {
      type: "pregeneratedSpecies",
      species,
    });
  }

  private handleGetGalaxySpecies(
    client: ClientConnection,
    galaxyId: string
  ): void {
    if (!client.uuid) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    // Get all players in the galaxy and their species IDs
    const players = this.db.getPlayersByGalaxy(galaxyId);
    const playerSpeciesIds = players
      .map((p) => p.speciesId)
      .filter((id): id is string => !!id);

    // Get the pregenerated species IDs (not the player-specific species IDs)
    const pregeneratedSpeciesIds = playerSpeciesIds
      .map((speciesId) => {
        const species = this.db.getSpeciesById(speciesId);
        if (species?.pregeneratedSpeciesId) {
          return species.pregeneratedSpeciesId;
        }
        // Fallback for species created before the pregeneratedSpeciesId field was added
        // Try to match by name to a pregenerated species
        if (species) {
          const allPregenerated = getAllPregeneratedSpecies();
          const match = allPregenerated.find(
            (ps) => ps.name === species.name
          );
          return match?.id;
        }
        return undefined;
      })
      .filter((id): id is string => !!id);

    this.send(client.ws, {
      type: "galaxySpecies",
      speciesIds: pregeneratedSpeciesIds,
    });
  }

  private handleCreateEmptyGalaxy(client: ClientConnection): void {
    if (!client.uuid) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    console.log(`[Server] Creating empty galaxy`);

    // Generate a unique galaxy name
    const galaxyName = generateGalaxyName();

    // Create new galaxy (without any star systems yet)
    const galaxy = generateGalaxy(galaxyName);
    this.db.createGalaxy(galaxy);

    // Load galaxy time state (new galaxy starts at 0, paused)
    this.gameState.loadGalaxy(galaxy.id, 0, true, TIME_SCALE_DEFAULT);
    this.gameState.resetTime();

    console.log(`[Server] Created empty galaxy: ${galaxyName} (${galaxy.id})`);
    console.log(`[Server] Star systems will be generated when players join`);

    this.send(client.ws, {
      type: "emptyGalaxyCreated",
      galaxyId: galaxy.id,
      galaxyName: galaxyName,
    });
  }

  private handleResetGalaxy(
    client: ClientConnection,
    galaxyName: string,
    playerName?: string
  ): void {
    if (!client.uuid) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    // Check if galaxy exists
    const existingGalaxy = this.db.getGalaxyByName(galaxyName);
    if (!existingGalaxy) {
      this.sendError(client.ws, "Galaxy not found");
      return;
    }

    console.log(`Resetting galaxy: ${galaxyName}`);

    // Delete old galaxy data (systems, players, ships, etc.)
    this.db.deleteGalaxy(existingGalaxy.id);

    // Create new galaxy with same name but new seed
    const galaxy = generateGalaxy(galaxyName);
    this.db.createGalaxy(galaxy);

    // Generate new starter system
    const starterResult = generateStarterSystem(galaxy.id, galaxy.seed);
    this.db.createStarSystem(starterResult.system);

    // Save tunnels for the starter system (only for non-placeholder systems)
    for (const tunnel of starterResult.tunnels) {
      // Only create tunnel if both systems exist (not placeholders)
      if (
        !tunnel.systemAId.startsWith("PLACEHOLDER_") &&
        !tunnel.systemBId.startsWith("PLACEHOLDER_")
      ) {
        this.db.createTunnel(tunnel);
      }
    }

    // Save gates for the starter system
    for (const gate of starterResult.system.gates) {
      this.db.createGate(gate);
    }

    // Load galaxy time state (reset galaxy starts at 0, paused)
    this.gameState.loadGalaxy(galaxy.id, 0, true, TIME_SCALE_DEFAULT);
    this.gameState.resetTime();

    console.log(`Galaxy reset complete: ${galaxyName} (new ID: ${galaxy.id})`);
    this.send(client.ws, { type: "galaxyReset", galaxyId: galaxy.id });
  }

  private createPlayerInGalaxy(
    client: ClientConnection,
    galaxyId: string,
    galaxyName: string,
    homePlanetId: string,
    playerName?: string,
    pregeneratedSpeciesId?: string
  ): void {
    if (!client.uuid) return;

    // Get all systems in galaxy
    const systems = this.db.getSystemsByGalaxy(galaxyId);
    if (systems.length === 0) {
      this.sendError(client.ws, "No systems in galaxy");
      return;
    }

    // Find the system that contains the home planet
    let starterSystem = systems.find((system) =>
      system.planets.some((p) => p.id === homePlanetId)
    );

    // Fallback to first system if not found (shouldn't happen)
    if (!starterSystem) {
      console.warn(
        "Could not find system with home planet, using first system"
      );
      starterSystem = systems[0];
    }

    // Find the home planet to orbit around it
    const homePlanet = starterSystem.planets.find((p) => p.id === homePlanetId);
    const parentBodyId = homePlanet ? homePlanet.id : starterSystem.star.id;
    const parentMass = homePlanet ? homePlanet.mass : starterSystem.star.mass;

    // Create player with the name they provided (from message or stored), or a default based on UUID
    const finalPlayerName =
      playerName ||
      client.playerName ||
      `Player-${client.uuid.substring(0, 8)}`;

    const playerId = uuidv4();
    let speciesId = `species_player_${playerId}`;
    let species;

    // Use pregenerated species if provided, otherwise generate one
    if (pregeneratedSpeciesId) {
      const pregeneratedSpecies = getPregeneratedSpecies(pregeneratedSpeciesId);
      if (pregeneratedSpecies) {
        // Create a copy with player-specific IDs but store the original pregenerated species ID
        speciesId = `species_player_${playerId}`;
        species = {
          ...pregeneratedSpecies,
          id: speciesId,
          playerId: playerId,
          pregeneratedSpeciesId: pregeneratedSpeciesId, // Store the original pregenerated species ID
          homeworldId: homePlanetId,
          homeworld: homePlanet?.name || pregeneratedSpecies.homeworld,
          createdAt: Date.now(),
        };
      } else {
        // Fallback to generated species if pregenerated not found
        species = generatePlayerSpecies(
          playerId,
          finalPlayerName,
          homePlanet?.name || "Homeworld",
          homePlanetId,
          homePlanet?.surfaceType
        );
      }
    } else {
      // Generate a new species
      species = generatePlayerSpecies(
        playerId,
        finalPlayerName,
        homePlanet?.name || "Homeworld",
        homePlanetId,
        homePlanet?.surfaceType
      );
    }

    // Create player first (required for foreign key in species table)
    const player: Player = {
      id: playerId,
      uuid: client.uuid,
      name: finalPlayerName,
      galaxyId,
      homeSystemId: starterSystem.id,
      homePlanetId: homePlanetId,
      currentSystemId: starterSystem.id,
      shipId: "",
      exploredGateIds: [], // New player has not explored any gates yet
      energy: STARTING_RESOURCES.energy,
      alloy: STARTING_RESOURCES.alloy,
      science: STARTING_RESOURCES.science,
      speciesId: speciesId,
    };

    this.db.createPlayer(player);

    console.log(
      `[Server] Created new player ${player.name} (ID: ${player.id}) with starting resources: energy=${player.energy}, alloy=${player.alloy}, science=${player.science}`
    );

    // Create the species
    this.db.createSpecies(species);

    console.log(
      `Created species for player: ${species.name} (${species.appearance.bodyType})`
    );

    // Update client
    client.playerId = player.id;
    client.currentSystemId = starterSystem.id;

    // Record initial system discovery (player's home system)
    this.db.recordSystemDiscovery(starterSystem.id, player.id);

    // Create initial colony on home world
    if (homePlanet) {
      const habitabilityBonus = homePlanet.habitability || 0.7;

      // Calculate maximum population based on planet surface area and habitability
      // Surface area = 4π * radius²
      const surfaceArea = 4 * Math.PI * homePlanet.radius * homePlanet.radius;
      const maxPopulation = Math.floor(
        surfaceArea * BASE_POPULATION_DENSITY * habitabilityBonus
      );

      // Start with 80% of maximum population (established world)
      const initialPopulation = Math.floor(maxPopulation * 0.8);

      // Determine appropriate stage based on population
      const stage = getColonyStage(initialPopulation);

      // Calculate yields based on population
      const yields = calculateColonyYields(
        initialPopulation,
        "balanced",
        habitabilityBonus
      );

      const colony: import("@constellation/shared").Colony = {
        id: uuidv4(),
        playerId: player.id,
        speciesId: species.id,
        systemId: starterSystem.id,
        planetId: homePlanet.id,
        planetName: homePlanet.name,
        stage: stage,
        specialization: "balanced",
        population: initialPopulation,
        sciencePerDay: yields.sciencePerDay,
        alloyPerDay: yields.alloyPerDay,
        establishedAt: this.gameState.getCurrentTime(),
        lastYieldAt: this.gameState.getCurrentTime(),
      };

      this.db.createColony(colony);
      console.log(
        `Initial colony established on ${homePlanet.name}: ${colony.stage} (pop: ${colony.population})`
      );
    }

    // Load into game state
    this.gameState.loadSystem(starterSystem);

    console.log(
      `Player created: ${player.name}, Home Planet: ${
        homePlanet?.name || "N/A"
      } (${homePlanetId})`
    );

    // Send data to client (get fresh system data with mining operations and megastructures)
    const systemWithOperations = this.db.getStarSystem(starterSystem.id);
    console.log(
      `[Server] Sending playerData to client with resources: energy=${player.energy}, alloy=${player.alloy}, science=${player.science}`
    );
    this.send(client.ws, { type: "playerData", player });
    if (systemWithOperations) {
      const gateOwnership = this.db.getGateOwnershipForSystem(
        player.id,
        systemWithOperations.id
      );
      this.send(client.ws, {
        type: "systemData",
        system: systemWithOperations,
        gateOwnership: gateOwnership.length > 0 ? gateOwnership : undefined,
      });
    }

    // Broadcast updated galaxy players info to ALL players in this galaxy
    this.broadcastGalaxyPlayersInfo(galaxyId);
  }

  private handleRequestSystemState(
    client: ClientConnection,
    systemId: string
  ): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    // Log the current galaxy time when this request is made
    if (client.galaxyId) {
      const galaxyState = this.gameState.getGalaxyState(client.galaxyId);
      if (galaxyState) {
        console.log(
          `[RequestSystemState] Galaxy time: ${galaxyState.currentTime}, paused: ${galaxyState.isPaused}`
        );
      }
    }

    const system = this.db.getStarSystem(systemId);
    if (!system) {
      this.sendError(client.ws, "System not found");
      return;
    }

    // Update player's current system in the database
    this.db.updatePlayerCurrentSystem(client.playerId, systemId);

    // Update client connection tracking
    client.currentSystemId = systemId;

    // Load system into game state manager (so positions are calculated)
    this.gameState.loadSystem(system);

    // Load ships for this system
    const ships = this.db.getShipsBySystem(system.id);
    this.gameState.loadShips(system.id, ships);

    // Auto-explore gates that have owners (so players can see controlled gates)
    const gates = system.gates || [];
    for (const gate of gates) {
      const owner = this.db.getGateOwner(gate.id);
      if (owner) {
        // This gate is controlled by someone - make it visible to all players
        this.db.markGateExploredSingle(client.playerId, gate.id);
      }
    }

    // Get gate ownership information for this system
    const gateOwnership = this.db.getGateOwnershipForSystem(
      client.playerId,
      systemId
    );

    // Get tunnel ownership information (includes other gate ownership)
    const tunnelOwnership = this.db.getTunnelOwnershipForSystem(
      client.playerId,
      systemId
    );

    // Send current time state BEFORE system data to ensure proper synchronization
    if (client.galaxyId) {
      const galaxyState = this.gameState.getGalaxyState(client.galaxyId);
      if (galaxyState) {
        this.send(client.ws, {
          type: "timeUpdate",
          currentTime: galaxyState.currentTime,
          isPaused: galaxyState.isPaused,
          timeScale: galaxyState.timeScale,
        });
      }
    }

    // Send system data with gate and tunnel ownership information
    this.send(client.ws, {
      type: "systemData",
      system,
      gateOwnership: gateOwnership.length > 0 ? gateOwnership : undefined,
      tunnelOwnership: tunnelOwnership.length > 0 ? tunnelOwnership : undefined,
    });

    // Send all gate defenses in this system
    for (const gate of gates) {
      const defenses = this.db.getGateDefenses(gate.id);
      for (const defense of defenses) {
        this.send(client.ws, {
          type: "gateDefenseBuilt",
          defense,
        });
      }
    }

    // Send resource flow information for gates (for blockade display)
    try {
      const flow = calculatePlayerResourceFlow(this.db, client.playerId);

      // Send flow for gates in current system
      for (const gate of gates) {
        const gateFlow = flow.gateFlows.get(gate.id);
        if (gateFlow) {
          this.send(client.ws, {
            type: "gateResourceFlow",
            gateId: gate.id,
            energyFlow: gateFlow.energy,
            alloyFlow: gateFlow.alloy,
            scienceFlow: gateFlow.science,
            isBlockaded: gateFlow.isBlockaded,
            blockadeOwnerName: gateFlow.blockadeOwnerName,
          });
        }
      }

      // Also send flow for OTHER gates in tunnels (the gates in connected systems)
      // This ensures we can see resource flow on both ends of each tunnel
      for (const tunnelOwn of tunnelOwnership) {
        // Get all gates in this tunnel
        const gatesInTunnel = this.db.getGatesByTunnel(tunnelOwn.tunnelId);
        
        // Find the other gate (not in current system)
        const otherGate = gatesInTunnel.find(
          (g) => g.systemId !== systemId
        );
        
        if (otherGate) {
          const otherGateFlow = flow.gateFlows.get(otherGate.id);
          if (otherGateFlow) {
            this.send(client.ws, {
              type: "gateResourceFlow",
              gateId: otherGate.id,
              energyFlow: otherGateFlow.energy,
              alloyFlow: otherGateFlow.alloy,
              scienceFlow: otherGateFlow.science,
              isBlockaded: otherGateFlow.isBlockaded,
              blockadeOwnerName: otherGateFlow.blockadeOwnerName,
            });
          }
        }
      }
    } catch (err) {
      console.error("Failed to calculate resource flow:", err);
    }

    // Send ship data if player has one in this system
    const ship = this.db.getShipByPlayerId(client.playerId);
    if (ship && ship.systemId === systemId) {
      this.send(client.ws, { type: "shipData", ship });
    }

    // Send updated player data with new currentSystemId
    const player = this.db.getPlayerById(client.playerId);
    if (player) {
      player.currentSystemId = systemId;
      this.send(client.ws, { type: "playerData", player });
    }
  }

  private handleShipManeuver(client: ClientConnection, maneuver: any): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    // TODO: Implement ship maneuver logic
    // This would involve calculating new orbital elements based on delta-v
    // For now, just acknowledge
  }

  private handleUseGate(client: ClientConnection, gateId: string): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    // Get player data
    const player = this.db.getPlayerById(client.playerId);
    if (!player) {
      this.sendError(client.ws, "Player not found");
      return;
    }

    // Get the gate
    const gate = this.db.getGateById(gateId);
    if (!gate) {
      this.sendError(client.ws, "Gate not found");
      return;
    }

    // Check if gate is in player's current system
    if (gate.systemId !== player.currentSystemId) {
      // Gate is in a different system - this might be from constellation view
      // Check if the player has explored this system (can use gates from any explored system)
      const exploredGates = this.db.getExploredGates(player.id);
      const gateSystem = this.db.getStarSystem(gate.systemId);

      if (!gateSystem) {
        this.sendError(client.ws, "Gate system not found");
        return;
      }

      // Check if player has discovered any gate in the gate's system (meaning they've been there)
      const hasExploredGateSystem = this.db
        .getGatesBySystem(gate.systemId)
        .some((g) => exploredGates.includes(g.id));

      if (!hasExploredGateSystem) {
        this.sendError(client.ws, "Cannot use gates from unexplored systems");
        return;
      }

      // Allow constellation view exploration: teleport player to gate's system first
      console.log(
        `Constellation exploration: moving player from ${player.currentSystemId} to ${gate.systemId}`
      );
      this.db.updatePlayerCurrentSystem(player.id, gate.systemId);
      player.currentSystemId = gate.systemId;
      client.currentSystemId = gate.systemId;
    }

    // Get current system (which might have been updated above)
    const currentSystem = this.db.getStarSystem(gate.systemId);
    if (!currentSystem) {
      this.sendError(client.ws, "Current system not found");
      return;
    }

    // Check if destination system exists, or if it's a placeholder
    let destinationSystem = this.db.getStarSystem(gate.destinationSystemId);

    // Generate destination system on-demand if it's a placeholder
    if (
      !destinationSystem &&
      gate.destinationSystemId.startsWith("PLACEHOLDER_")
    ) {
      console.log(`Generating new system for placeholder gate ${gateId}`);

      // Get galaxy to use seed
      const galaxy = this.db.getGalaxyById(player.galaxyId);
      if (!galaxy) {
        this.sendError(client.ws, "Galaxy not found");
        return;
      }

      // Calculate position for the new system (same algorithm as constellation view)
      // Get all existing systems in the galaxy to avoid collisions
      const existingSystems = this.db.getSystemsByGalaxy(galaxy.id);
      const existingPositions = existingSystems.map((s) => s.position);

      // MULTIPLAYER FEATURE: Check if we should connect to another player's explored system
      const myExploredSystems = this.db.getExploredSystemsByPlayer(player.id);
      const constellationSize = myExploredSystems.size;

      // Calculate probability: base 5% chance, increasing by 2% per explored system, capped at 50%
      const BASE_CHANCE = 0.05;
      const CHANCE_PER_SYSTEM = 0.02;
      const MAX_CHANCE = 0.5;
      const connectionProbability = Math.min(
        BASE_CHANCE + constellationSize * CHANCE_PER_SYSTEM,
        MAX_CHANCE
      );

      console.log(
        `Multiplayer connection check: ${constellationSize} systems explored, ` +
          `${(connectionProbability * 100).toFixed(
            1
          )}% chance to connect to another player`
      );

      // Check if we should attempt to connect to another player
      if (Math.random() < connectionProbability) {
        // Find other players in the same galaxy
        const allPlayers = this.db.getPlayersByGalaxy(galaxy.id);
        const otherPlayers = allPlayers.filter((p) => p.id !== player.id);

        if (otherPlayers.length > 0) {
          console.log(`Found ${otherPlayers.length} other player(s) in galaxy`);

          // Collect all systems explored by other players that we haven't explored yet
          const candidateSystems: StarSystem[] = [];
          for (const otherPlayer of otherPlayers) {
            const otherExploredSystems = this.db.getExploredSystemsByPlayer(
              otherPlayer.id
            );
            for (const otherSystemId of otherExploredSystems) {
              // Only consider systems we haven't explored yet
              if (!myExploredSystems.has(otherSystemId)) {
                const system = this.db.getStarSystem(otherSystemId);
                if (system) {
                  candidateSystems.push(system);
                }
              }
            }
          }

          if (candidateSystems.length > 0) {
            // Pick a random system from the candidates
            const targetSystem =
              candidateSystems[
                Math.floor(Math.random() * candidateSystems.length)
              ];
            console.log(
              `🌟 MULTIPLAYER CONNECTION! Connecting to another player's system: ${targetSystem.star.name}`
            );

            // Find an unexplored gate in the target system to use as the return gate
            const targetSystemGates = this.db.getGatesBySystem(targetSystem.id);
            const unexploredGate = targetSystemGates.find((g) =>
              g.destinationSystemId.startsWith("PLACEHOLDER_")
            );

            if (unexploredGate) {
              console.log(
                `Using existing unexplored gate ${unexploredGate.id} in ${targetSystem.star.name} for return connection`
              );

              // Update the gate in our current system to point to the target system
              this.db.updateGateDestination(gateId, targetSystem.id);
              destinationSystem = targetSystem;

              // Update the unexplored gate in the target system to point back to our current system
              this.db.updateGateDestination(
                unexploredGate.id,
                currentSystem.id
              );

              // Reload the system with the updated gate
              destinationSystem = this.db.getStarSystem(targetSystem.id);

              // Transfer mystery sphere position to the target system's position
              this.db.transferMysteryPositionToSystem(
                player.id,
                gateId,
                targetSystem.id
              );
            } else {
              console.log(
                `No unexplored gates available in ${targetSystem.star.name}, cannot connect`
              );
              // Don't connect to this system since there's no available gate
              // Fall through to generate a new system instead
            }
          } else {
            console.log(
              "No suitable systems from other players found (all already explored)"
            );
          }
        }
      }

      // If we didn't connect to another player's system, generate a new one
      if (!destinationSystem) {
        const newSystemPosition = this.db.calculateUnexploredGatePosition(
          gateId,
          currentSystem.position,
          existingPositions
        );

        // Check if there are ANY unexplored gates in the ENTIRE explored network
        // This prevents total lockout where all explored systems are dead-ends
        const exploredGates = this.db.getExploredGates(player.id);

        // Get all systems in the explored network (systems with at least one explored gate)
        const exploredSystemIds = new Set<string>();
        for (const exploredGateId of exploredGates) {
          const exploredGate = this.db.getGateById(exploredGateId);
          if (exploredGate) {
            exploredSystemIds.add(exploredGate.systemId);
          }
        }

        // Get all gates in all explored systems
        let hasUnexploredGateInNetwork = false;
        for (const systemId of exploredSystemIds) {
          const systemGates = this.db.getGatesBySystem(systemId);
          // Check if any gate in this system is unexplored (excluding the gate we're using now)
          if (
            systemGates.some(
              (g) => g.id !== gateId && !exploredGates.includes(g.id)
            )
          ) {
            hasUnexploredGateInNetwork = true;
            break;
          }
        }

        console.log(
          `Network analysis: ${exploredSystemIds.size} explored systems, ` +
            `${exploredGates.length} explored gates, ` +
            `has unexplored gates in network: ${hasUnexploredGateInNetwork}`
        );

        // Generate new system with connection back to current system at calculated position
        const { system: newSystem, tunnels: newTunnels } = generateNewSystem(
          galaxy.id,
          galaxy.seed + Date.now(), // Use time as additional seed entropy
          [currentSystem.id], // First gate connects back to current system
          newSystemPosition, // Use calculated position
          !hasUnexploredGateInNetwork // Force at least one exit if no unexplored gates in entire network
        );
        destinationSystem = newSystem;

        // Save the new system
        this.db.createStarSystem(destinationSystem);

        // Save all tunnels (only for non-placeholder systems)
        for (const tunnel of newTunnels) {
          // Only create tunnel if both systems exist (not placeholders)
          if (
            !tunnel.systemAId.startsWith("PLACEHOLDER_") &&
            !tunnel.systemBId.startsWith("PLACEHOLDER_")
          ) {
            this.db.createTunnel(tunnel);
          }
        }

        // Save all gates
        for (const newGate of destinationSystem.gates) {
          this.db.createGate(newGate);
        }

        // Update the current gate to point to the new system
        this.db.updateGateDestination(gateId, destinationSystem.id);

        // Transfer mystery sphere position to the new system's position
        this.db.transferMysteryPositionToSystem(
          player.id,
          gateId,
          destinationSystem.id
        );

        console.log(
          `Generated new system ${destinationSystem.id} with ${
            destinationSystem.gates.length
          } gate(s) (1 return, ${
            destinationSystem.gates.length - 1
          } unexplored)`
        );
      }
    } else if (!destinationSystem) {
      this.sendError(client.ws, "Destination system not found");
      return;
    }

    // Find the exit gate (the one that connects back to current system)
    const exitGate = destinationSystem.gates.find(
      (g) => g.destinationSystemId === currentSystem.id
    );
    if (!exitGate) {
      console.error(
        `No exit gate found in destination system ${destinationSystem.id} pointing back to ${currentSystem.id}`
      );
      this.sendError(client.ws, "Invalid gate configuration");
      return;
    }

    // Check if either gate is unexplored by this player
    const exploredGates = this.db.getExploredGates(player.id);
    const isGateUnexplored = !exploredGates.includes(gateId);
    const isExitGateUnexplored = !exploredGates.includes(exitGate.id);

    // Check if gates have been explored by ANYONE (have ownership)
    const gateHasOwner = this.db.getGateOwner(gateId) !== null;
    const exitGateHasOwner = this.db.getGateOwner(exitGate.id) !== null;

    // Check if tunnel is powered
    const entryGate = this.db.getGateById(gateId);
    const tunnel = entryGate?.tunnelId ? this.db.getTunnelById(entryGate.tunnelId) : null;
    const isTunnelPowered = tunnel && tunnel.poweredByPlayerId !== null;

    // Energy is required if:
    // 1. You're the first person to open the tunnel (gates are unowned), OR
    // 2. The tunnel was opened before but is now powered off (gates have owners but tunnel is unpowered)
    // Opening a tunnel costs 1 energy total (tunnel has gates at both ends)
    const needsEnergyForGate = isGateUnexplored && !gateHasOwner;
    const needsEnergyForExitGate = isExitGateUnexplored && !exitGateHasOwner;
    const needsEnergyForReactivation = !isTunnelPowered && gateHasOwner && exitGateHasOwner;
    const needsEnergy = needsEnergyForGate || needsEnergyForExitGate || needsEnergyForReactivation;

    // Check energy requirement for opening a new tunnel
    if (needsEnergy) {
      const OPENING_TUNNEL_COST = GAME_COSTS.TUNNEL_POWER_ON.energy;
      const resources = this.db.getPlayerResources(player.id);

      if (!resources || resources.energy < OPENING_TUNNEL_COST) {
        this.sendError(
          client.ws,
          `Not enough energy to open the tunnel (requires ${OPENING_TUNNEL_COST} energy)`
        );
        return;
      }

      // Deduct energy (single cost for opening the tunnel, which has gates at both ends)
      const success = this.db.deductPlayerEnergy(player.id, OPENING_TUNNEL_COST);
      if (!success) {
        this.sendError(client.ws, "Failed to deduct energy");
        return;
      }

      if (needsEnergyForReactivation) {
        console.log(
          `Player ${player.name} spent ${OPENING_TUNNEL_COST} energy to reactivate tunnel (was powered off)`
        );
      } else if (needsEnergyForGate && needsEnergyForExitGate) {
        console.log(
          `Player ${player.name} spent ${OPENING_TUNNEL_COST} energy to open tunnel (both gates)`
        );
      } else if (needsEnergyForGate) {
        console.log(
          `Player ${player.name} spent ${OPENING_TUNNEL_COST} energy to open tunnel (entry gate, exit gate maintained by another player)`
        );
      } else {
        console.log(
          `Player ${player.name} spent ${OPENING_TUNNEL_COST} energy to open tunnel (exit gate, entry gate maintained by another player)`
        );
      }
    } else if (gateHasOwner || exitGateHasOwner) {
      console.log(
        `Player ${player.name} used gate ${gateId} for free (maintained by another civilization)`
      );
    }

    // Mark BOTH gates as explored for this player
    this.db.markGateExploredSingle(player.id, gateId);
    this.db.markGateExploredSingle(player.id, exitGate.id);

    // Assign ownership to the player who first explored these gates
    // IMPORTANT: Always check and set ownership if gate has no owner,
    // regardless of whether current player has explored it before
    const existingGateOwner = this.db.getGateOwner(gateId);
    if (!existingGateOwner) {
      this.db.setGateOwnership(gateId, player.id);
      console.log(`Player ${player.name} claimed ownership of gate ${gateId}`);
    } else if (existingGateOwner !== player.id) {
      console.log(
        `Gate ${gateId} already owned by player ${existingGateOwner}`
      );
    }

    const existingExitOwner = this.db.getGateOwner(exitGate.id);
    if (!existingExitOwner) {
      this.db.setGateOwnership(exitGate.id, player.id);
      console.log(
        `Player ${player.name} claimed ownership of exit gate ${exitGate.id}`
      );
    } else if (existingExitOwner !== player.id) {
      console.log(
        `Exit gate ${exitGate.id} already owned by player ${existingExitOwner}`
      );
    }

    // Auto-power tunnel if player is opening it for the first time
    // This only happens when the tunnel is not yet powered
    // Tunnel is powered automatically when opened (no extra charge - already paid OPENING_TUNNEL cost)
    // Re-fetch the gate to get the updated tunnelId (it was just created/updated above)
    const updatedGate = this.db.getGateById(gateId);
    console.log(`[DEBUG] Checking auto-power: gate.tunnelId=${updatedGate?.tunnelId}`);
    if (updatedGate?.tunnelId) {
      const tunnel = this.db.getTunnelById(updatedGate.tunnelId);
      console.log(`[DEBUG] Tunnel: ${tunnel ? `id=${tunnel.id}, poweredBy=${tunnel.poweredByPlayerId}, cost=${tunnel.powerCostEnergy}` : 'null'}`);
      if (tunnel && !tunnel.poweredByPlayerId && needsEnergy) {
        // Auto-power tunnel when opening it (no extra charge - opening cost already covers this)
        // Use the TUNNEL_POWER_ON cost as the power cost since that's what was paid
        const powerCostEnergy = GAME_COSTS.TUNNEL_POWER_ON.energy;
        this.db.setTunnelPower(updatedGate.tunnelId, player.id, powerCostEnergy);
        console.log(
          `Player ${player.name} auto-powered tunnel ${updatedGate.tunnelId} (included in opening cost)`
        );
      } else {
        console.log(`[DEBUG] Skip auto-power: tunnel=${tunnel ? 'exists' : 'null'}, poweredBy=${tunnel?.poweredByPlayerId}, needsEnergy=${needsEnergy}`);
      }
    }

    // Record system discovery and check if we discovered other players
    // IMPORTANT: Check for previous discoverers BEFORE recording this player's discovery
    const previousDiscoverers = this.db.getSystemDiscoverers(
      destinationSystem.id
    );
    const discoveredPlayers = previousDiscoverers.filter(
      (p) => p.id !== player.id
    );

    // Filter to only players we haven't met before
    const newlyMetPlayers = discoveredPlayers.filter(
      (p) => !this.db.havePlayersMet(player.id, p.id)
    );

    // Record that this player has now discovered this system
    this.db.recordSystemDiscovery(destinationSystem.id, player.id);

    // Also record discovery of current system (in case it wasn't recorded before)
    this.db.recordSystemDiscovery(currentSystem.id, player.id);

    // Update gate names to reflect their destinations
    const destinationStarName = `Gate to ${destinationSystem.star.name}`;
    this.db.updateGateName(gateId, destinationStarName);
    gate.name = destinationStarName; // Update in memory

    const currentStarName = `Gate to ${currentSystem.star.name}`;
    this.db.updateGateName(exitGate.id, currentStarName);
    exitGate.name = currentStarName; // Update in memory

    // Update player's current system
    this.db.updatePlayerCurrentSystem(player.id, destinationSystem.id);
    client.currentSystemId = destinationSystem.id;

    // Load destination system into game state
    this.gameState.loadSystem(destinationSystem);
    const ships = this.db.getShipsBySystem(destinationSystem.id);
    this.gameState.loadShips(destinationSystem.id, ships);

    // Get updated explored gates
    const exploredGateIds = this.db.getExploredGates(player.id);

    console.log(
      `Player ${player.name} explored gates:`,
      exploredGateIds,
      `Exit gate ID: ${exitGate.id}`
    );

    // Get gate ownership information for destination system
    const gateOwnership = this.db.getGateOwnershipForSystem(
      client.playerId,
      destinationSystem.id
    );

    // Get tunnel ownership information for destination system
    const tunnelOwnership = this.db.getTunnelOwnershipForSystem(
      client.playerId,
      destinationSystem.id
    );

    // Check if exit gate is blocked by enemy defenses
    const exitGateOwner = this.db.getGateOwner(exitGate.id);
    const exitGateDefenseCount = this.db.getGateDefenseCount(exitGate.id);
    let isExitGateBlocked = false;
    
    if (exitGateOwner && exitGateOwner !== player.id && exitGateDefenseCount > 0) {
      // Exit gate is owned by another player and has defenses (blocked unless friendly)
      const relationship = this.db.getPlayerRelationship(player.id, exitGateOwner);
      if (relationship !== "friendly") {
        isExitGateBlocked = true;
        console.log(
          `Exit gate ${exitGate.id} is blocked by defenses (${exitGateDefenseCount} platforms) - not friendly`
        );
      }
    }

    // Send travel response to client with ownership information
    this.send(client.ws, {
      type: "gateTravel",
      destinationSystem,
      exploredGateIds,
      exitGateId: exitGate.id,
      gateOwnership: gateOwnership.length > 0 ? gateOwnership : undefined,
      tunnelOwnership: tunnelOwnership.length > 0 ? tunnelOwnership : undefined,
      isExitGateBlocked, // New flag to indicate if exit gate is blocked
    });

    // Send all gate defenses in the destination system (so client can render them)
    const destGates = destinationSystem.gates || [];
    let totalDefensesSent = 0;
    for (const gate of destGates) {
      const defenses = this.db.getGateDefenses(gate.id);
      for (const defense of defenses) {
        this.send(client.ws, {
          type: "gateDefenseBuilt",
          defense,
        });
        totalDefensesSent++;
      }
    }
    
    if (totalDefensesSent > 0) {
      console.log(`Sent ${totalDefensesSent} defense platforms for destination system ${destinationSystem.star.name}`);
    }

    // Send resource flow information for gates in destination system (for blockade display)
    try {
      const flow = calculatePlayerResourceFlow(this.db, client.playerId);

      // Send flow for gates in destination system
      for (const gate of destGates) {
        const gateFlow = flow.gateFlows.get(gate.id);
        if (gateFlow) {
          this.send(client.ws, {
            type: "gateResourceFlow",
            gateId: gate.id,
            energyFlow: gateFlow.energy,
            alloyFlow: gateFlow.alloy,
            scienceFlow: gateFlow.science,
            isBlockaded: gateFlow.isBlockaded,
            blockadeOwnerName: gateFlow.blockadeOwnerName,
          });
        }
      }

      // Also send flow for OTHER gates in tunnels (the gates in connected systems)
      // This ensures we can see resource flow on both ends of each tunnel
      for (const tunnelOwn of tunnelOwnership) {
        // Get all gates in this tunnel
        const gatesInTunnel = this.db.getGatesByTunnel(tunnelOwn.tunnelId);
        
        // Find the other gate (not in destination system)
        const otherGate = gatesInTunnel.find(
          (g) => g.systemId !== destinationSystem.id
        );
        
        if (otherGate) {
          const otherGateFlow = flow.gateFlows.get(otherGate.id);
          if (otherGateFlow) {
            this.send(client.ws, {
              type: "gateResourceFlow",
              gateId: otherGate.id,
              energyFlow: otherGateFlow.energy,
              alloyFlow: otherGateFlow.alloy,
              scienceFlow: otherGateFlow.science,
              isBlockaded: otherGateFlow.isBlockaded,
              blockadeOwnerName: otherGateFlow.blockadeOwnerName,
            });
          }
        }
      }
    } catch (err) {
      console.error("Failed to calculate resource flow for gate travel:", err);
    }

    // Update player data with new exploredGateIds, currentSystemId, and resources
    player.exploredGateIds = exploredGateIds;
    player.currentSystemId = destinationSystem.id;
    // Fetch updated resources
    const updatedResources = this.db.getPlayerResources(player.id);
    if (updatedResources) {
      player.energy = updatedResources.energy;
      player.alloy = updatedResources.alloy;
    }
    this.send(client.ws, { type: "playerData", player });

    // Send discovery notification ONLY for newly met players
    if (newlyMetPlayers.length > 0) {
      console.log(
        `🌟 Player ${player.name} discovered NEW players: ${newlyMetPlayers
          .map((p) => p.name)
          .join(", ")} in system ${destinationSystem.star.name}`
      );

      // Record meetings with all newly discovered players
      for (const newPlayer of newlyMetPlayers) {
        this.db.recordPlayerMeeting(player.id, newPlayer.id);
      }

      // Notify the discovering player (they discovered others)
      this.send(client.ws, {
        type: "playerDiscovery",
        discoveryType: "discovered",
        playerNames: newlyMetPlayers.map((p) => p.name),
        systemName: destinationSystem.star.name,
      });

      // Also notify the discovered players (they were discovered)
      for (const discoveredPlayer of newlyMetPlayers) {
        const discoveredClient = this.findClientByPlayerId(discoveredPlayer.id);
        if (discoveredClient) {
          this.send(discoveredClient.ws, {
            type: "playerDiscovery",
            discoveryType: "wasDiscovered",
            playerNames: [player.name],
            systemName: destinationSystem.star.name,
          });
          console.log(
            `Notified ${discoveredPlayer.name} that ${player.name} discovered them for the first time`
          );
        }
      }
    }

    // Broadcast updated galaxy players info to ALL players in this galaxy
    // (in case this discovery changed who has met whom)
    this.broadcastGalaxyPlayersInfo(player.galaxyId);

    console.log(
      `Player ${player.name} traveled through gate to system ${destinationSystem.id}`
    );
  }

  /**
   * Calculate jumps from home system to all other systems using BFS
   */
  private calculateJumpsFromHome(
    homeSystemId: string,
    exploredConnections: Array<{
      fromSystemId: string;
      toSystemId: string;
      isExplored: boolean;
    }>
  ): Map<string, number> {
    const jumps = new Map<string, number>();
    const queue: Array<{ systemId: string; distance: number }> = [];
    const visited = new Set<string>();

    // Start from home
    queue.push({ systemId: homeSystemId, distance: 0 });
    visited.add(homeSystemId);
    jumps.set(homeSystemId, 0);

    // Build adjacency list from explored connections
    const adjacency = new Map<string, string[]>();
    for (const conn of exploredConnections) {
      if (!adjacency.has(conn.fromSystemId)) {
        adjacency.set(conn.fromSystemId, []);
      }
      if (!adjacency.has(conn.toSystemId)) {
        adjacency.set(conn.toSystemId, []);
      }
      adjacency.get(conn.fromSystemId)!.push(conn.toSystemId);
      adjacency.get(conn.toSystemId)!.push(conn.fromSystemId);
    }

    // BFS
    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = adjacency.get(current.systemId) || [];

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          const newDistance = current.distance + 1;
          jumps.set(neighbor, newDistance);
          queue.push({ systemId: neighbor, distance: newDistance });
        }
      }
    }

    return jumps;
  }

  /**
   * Calculate gate jumps between two systems using BFS
   */
  private calculateGateJumps(
    fromSystemId: string,
    toSystemId: string
  ): number | null {
    if (fromSystemId === toSystemId) {
      return 0;
    }

    const queue: Array<{ systemId: string; distance: number }> = [];
    const visited = new Set<string>();

    queue.push({ systemId: fromSystemId, distance: 0 });
    visited.add(fromSystemId);

    while (queue.length > 0) {
      const current = queue.shift()!;

      // Get all gates in current system
      const gates = this.db.getGatesBySystem(current.systemId);

      for (const gate of gates) {
        // Only use explored gates (gates with owners)
        const owner = this.db.getGateOwner(gate.id);
        if (!owner) continue;

        const destinationSystemId = gate.destinationSystemId;
        if (!destinationSystemId) continue;

        // Check if we reached the destination
        if (destinationSystemId === toSystemId) {
          return current.distance + 1;
        }

        // Continue BFS
        if (!visited.has(destinationSystemId)) {
          visited.add(destinationSystemId);
          queue.push({
            systemId: destinationSystemId,
            distance: current.distance + 1,
          });
        }
      }
    }

    return null; // No path found
  }

  private handleRequestConstellation(client: ClientConnection): void {
    if (!client.playerId || !client.currentSystemId) {
      this.sendError(client.ws, "Not authenticated or no current system");
      return;
    }

    const constellationData = this.db.getConstellationData(
      client.playerId,
      client.currentSystemId
    );

    // Get player's explored gates for counting
    const exploredGateIds = new Set(this.db.getExploredGates(client.playerId));

    // Get player's home system
    const player = this.db.getPlayerById(client.playerId);
    const homeSystemId = player?.homeSystemId || client.currentSystemId;

    // Calculate jumps from home using BFS on explored connections
    const jumpsFromHome = this.calculateJumpsFromHome(
      homeSystemId,
      constellationData.connections.filter((c) => c.isExplored)
    );

    // Transform systems into constellation nodes
    const nodes = constellationData.systems.map((system) => {
      // Count explored and total gates for this system
      const systemGates = system.gates || [];
      const exploredGates = systemGates.filter((gate) =>
        exploredGateIds.has(gate.id)
      ).length;
      const totalGates = systemGates.length;

      // Count Dyson swarms per star
      const dysonSwarmsByStarId = new Map<string, number>();
      if (system.megastructures) {
        for (const megastructure of system.megastructures) {
          if (
            megastructure.type === "dyson_swarm" &&
            megastructure.celestialBodyId
          ) {
            const currentCount =
              dysonSwarmsByStarId.get(megastructure.celestialBodyId) || 0;
            dysonSwarmsByStarId.set(
              megastructure.celestialBodyId,
              currentCount + 1
            );
          }
        }
      }

      // Convert to array format for transmission
      const dysonSwarms = Array.from(dysonSwarmsByStarId.entries()).map(
        ([starId, count]) => ({
          starId,
          count,
        })
      );

      // Count habitable planets and colonized habitable planets
      const habitablePlanets = system.planets
        .filter((planet) => planet.habitability && planet.habitability >= 0.6)
        .sort((a, b) => {
          // Sort by distance from star (semi-major axis) to match planet ordering
          const aAxis = a.orbitalElements?.semiMajorAxis || 0;
          const bAxis = b.orbitalElements?.semiMajorAxis || 0;
          return aAxis - bAxis;
        });
      const habitablePlanetCount = habitablePlanets.length;

      // Count colonized habitable planets (check if planet has a colony)
      const colonizedHabitablePlanetIds = new Set(
        (system.colonies || []).map((colony) => colony.planetId)
      );
      const colonizedHabitablePlanetCount = habitablePlanets.filter((planet) =>
        colonizedHabitablePlanetIds.has(planet.id)
      ).length;

      // Create habitable planet details array
      const habitablePlanetDetails = habitablePlanets.map((planet) => ({
        planetId: planet.id,
        planetName: planet.name,
        isColonized: colonizedHabitablePlanetIds.has(planet.id),
      }));

      return {
        systemId: system.id,
        systemName: system.star.name,
        starId: system.star.id, // Primary star ID
        starColor: system.star.color || "#ffffff",
        position: system.position,
        starType: system.star.starType || "Unknown",
        starMass: system.star.mass,
        planetCount: system.planets.length,
        exploredGates,
        totalGates,
        jumpsFromHome: jumpsFromHome.get(system.id) ?? -1, // -1 if unreachable
        companionStars: system.companionStars
          ? system.companionStars.map((cs) => ({
              id: cs.id,
              color: cs.color || "#ffffff",
              type: cs.starType || "Unknown",
            }))
          : undefined,
        dysonSwarms: dysonSwarms.length > 0 ? dysonSwarms : undefined,
        habitablePlanetCount,
        colonizedHabitablePlanetCount,
        habitablePlanets:
          habitablePlanetDetails.length > 0
            ? habitablePlanetDetails
            : undefined,
      };
    });

    // Debug logging
    const exploredConnections = constellationData.connections.filter(
      (c) => c.isExplored
    );
    const unexploredConnections = constellationData.connections.filter(
      (c) => !c.isExplored
    );
    console.log(
      `Sending constellation data: ${nodes.length} nodes, ${constellationData.connections.length} connections (${exploredConnections.length} explored, ${unexploredConnections.length} unexplored), ${constellationData.unexploredGates.length} mystery gates`
    );

    // Send constellation data with custom positions
    this.send(client.ws, {
      type: "constellationData",
      nodes,
      connections: constellationData.connections,
      unexploredGates: constellationData.unexploredGates,
      currentSystemId: client.currentSystemId,
      customPositions: constellationData.customPositions,
    });

    console.log(
      `Sent constellation data to player ${client.playerId}: ${nodes.length} nodes, ${constellationData.connections.length} connections`
    );
  }

  private handleSaveConstellationPositions(
    client: ClientConnection,
    positions: Record<string, { x: number; y: number; z: number }>
  ): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    this.db.saveConstellationPositions(client.playerId, positions);
    console.log(`Saved constellation positions for player ${client.playerId}`);
  }

  private handleRequestPlayerStats(
    client: ClientConnection,
    playerId: string
  ): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const targetPlayer = this.db.getPlayerById(playerId);
    if (!targetPlayer) {
      this.sendError(client.ws, "Player not found");
      return;
    }

    const starsDiscovered = this.db.getPlayerStarsDiscoveredCount(playerId);

    // Get current relationship with this player
    const currentRelationship = this.db.getPlayerRelationship(client.playerId, playerId);

    this.send(client.ws, {
      type: "playerStats",
      playerId: targetPlayer.id,
      playerName: targetPlayer.name,
      starsDiscovered,
      currentRelationship,
    });

    // Check for pending proposals between these two players
    const incomingProposal = this.db.getRelationshipProposal(playerId, client.playerId);
    const outgoingProposal = this.db.getRelationshipProposal(client.playerId, playerId);

    // Send incoming proposal if exists
    if (incomingProposal) {
      this.send(client.ws, {
        type: "relationshipProposalReceived",
        proposal: {
          id: incomingProposal.id,
          fromPlayerId: playerId,
          fromPlayerName: targetPlayer.name,
          proposalType: incomingProposal.proposalType,
          createdAt: incomingProposal.createdAt,
        },
      });
    }

    // Send outgoing proposal if exists
    if (outgoingProposal) {
      this.send(client.ws, {
        type: "relationshipProposalSent",
        proposal: {
          id: outgoingProposal.id,
          toPlayerId: playerId,
          toPlayerName: targetPlayer.name,
          proposalType: outgoingProposal.proposalType,
          createdAt: outgoingProposal.createdAt,
        },
      });
    }

    console.log(
      `Sent player stats for ${targetPlayer.name}: ${starsDiscovered} stars discovered, relationship: ${currentRelationship}, incoming: ${!!incomingProposal}, outgoing: ${!!outgoingProposal}`
    );
  }

  private handleProposeRelationship(
    client: ClientConnection,
    targetPlayerId: string,
    relationshipType: "friendly"
  ): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const player = this.db.getPlayerById(client.playerId);
    if (!player) {
      this.sendError(client.ws, "Player not found");
      return;
    }

    const targetPlayer = this.db.getPlayerById(targetPlayerId);
    if (!targetPlayer) {
      this.sendError(client.ws, "Target player not found");
      return;
    }

    // Don't allow proposing to yourself
    if (client.playerId === targetPlayerId) {
      this.sendError(client.ws, "Cannot propose relationship to yourself");
      return;
    }

    // Check current relationship status
    const currentRelationship = this.db.getPlayerRelationship(
      client.playerId,
      targetPlayerId
    );
    if (currentRelationship === "at_war") {
      this.sendError(client.ws, "Cannot propose friendly relationship while at war");
      return;
    }
    if (currentRelationship === "friendly") {
      this.sendError(client.ws, "Already in a friendly relationship");
      return;
    }

    // Check if there's already a pending proposal
    const existingProposal = this.db.getRelationshipProposal(
      client.playerId,
      targetPlayerId
    );
    if (existingProposal) {
      this.sendError(client.ws, "You already have a pending proposal to this player");
      return;
    }

    // Check if target player has proposed to us (mutual proposal = instant accept)
    const reverseProposal = this.db.getRelationshipProposal(
      targetPlayerId,
      client.playerId
    );
    if (reverseProposal) {
      // Auto-accept mutual proposals
      this.db.deleteRelationshipProposal(reverseProposal.id);
      this.db.setPlayerRelationship(client.playerId, targetPlayerId, "friendly");

      console.log(
        `Players ${player.name} and ${targetPlayer.name} established mutual friendly relationship`
      );

      // Notify both players
      this.send(client.ws, {
        type: "relationshipChanged",
        otherPlayerId: targetPlayerId,
        otherPlayerName: targetPlayer.name,
        relationship: "friendly",
      });

      const targetClient = this.getClientByPlayerId(targetPlayerId);
      if (targetClient) {
        this.send(targetClient.ws, {
          type: "relationshipChanged",
          otherPlayerId: client.playerId,
          otherPlayerName: player.name,
          relationship: "friendly",
        });
      }

      this.handleRequestConstellation(client);
      if (targetClient) {
        this.handleRequestConstellation(targetClient);
      }
      return;
    }

    // Check if player has enough science
    const cost = 50;
    if (player.science < cost) {
      this.sendError(
        client.ws,
        `Not enough science to propose friendly relationship (requires ${cost} science)`
      );
      return;
    }

    // Deduct science cost
    this.db.updatePlayerResources(
      client.playerId,
      player.energy,
      player.alloy,
      player.science - cost
    );

    // Create proposal
    const proposalId = this.db.createRelationshipProposal(
      client.playerId,
      targetPlayerId,
      relationshipType
    );

    console.log(
      `Player ${player.name} proposed ${relationshipType} relationship to ${targetPlayer.name}`
    );

    // Send confirmation to proposer
    this.send(client.ws, {
      type: "relationshipProposalSent",
      proposal: {
        id: proposalId,
        toPlayerId: targetPlayerId,
        toPlayerName: targetPlayer.name,
        proposalType: relationshipType,
        createdAt: Date.now(),
      },
    });

    // Notify target player
    const targetClient = this.getClientByPlayerId(targetPlayerId);
    if (targetClient) {
      this.send(targetClient.ws, {
        type: "relationshipProposalReceived",
        proposal: {
          id: proposalId,
          fromPlayerId: client.playerId,
          fromPlayerName: player.name,
          proposalType: relationshipType,
          createdAt: Date.now(),
        },
      });
    }

    // Update player data to reflect science change
    this.send(client.ws, {
      type: "playerData",
      player: this.db.getPlayerById(client.playerId)!,
    });
  }

  private handleRespondToProposal(
    client: ClientConnection,
    proposalId: string,
    accept: boolean
  ): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const player = this.db.getPlayerById(client.playerId);
    if (!player) {
      this.sendError(client.ws, "Player not found");
      return;
    }

    // Get all incoming proposals and find this one
    const incomingProposals = this.db.getIncomingProposals(client.playerId);
    const proposal = incomingProposals.find((p) => p.id === proposalId);

    if (!proposal) {
      this.sendError(client.ws, "Proposal not found or not addressed to you");
      return;
    }

    const proposer = this.db.getPlayerById(proposal.fromPlayerId);
    if (!proposer) {
      this.sendError(client.ws, "Proposer player not found");
      return;
    }

    // Delete the proposal
    this.db.deleteRelationshipProposal(proposalId);

    if (accept) {
      // Establish friendly relationship
      this.db.setPlayerRelationship(client.playerId, proposal.fromPlayerId, "friendly");

      console.log(
        `Player ${player.name} accepted ${proposal.proposalType} proposal from ${proposer.name}`
      );

      // Notify both players
      this.send(client.ws, {
        type: "relationshipChanged",
        otherPlayerId: proposal.fromPlayerId,
        otherPlayerName: proposer.name,
        relationship: "friendly",
      });

      const proposerClient = this.getClientByPlayerId(proposal.fromPlayerId);
      if (proposerClient) {
        this.send(proposerClient.ws, {
          type: "proposalAccepted",
          playerId: client.playerId,
          playerName: player.name,
        });
        this.send(proposerClient.ws, {
          type: "relationshipChanged",
          otherPlayerId: client.playerId,
          otherPlayerName: player.name,
          relationship: "friendly",
        });
      }

      // Update constellation view for both
      this.handleRequestConstellation(client);
      if (proposerClient) {
        this.handleRequestConstellation(proposerClient);
      }
    } else {
      // Rejected
      console.log(
        `Player ${player.name} rejected ${proposal.proposalType} proposal from ${proposer.name}`
      );

      // Notify proposer of rejection
      const proposerClient = this.getClientByPlayerId(proposal.fromPlayerId);
      if (proposerClient) {
        this.send(proposerClient.ws, {
          type: "proposalRejected",
          playerId: client.playerId,
          playerName: player.name,
        });
      }
    }
  }

  private handleDeclareWar(
    client: ClientConnection,
    targetPlayerId: string
  ): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const player = this.db.getPlayerById(client.playerId);
    if (!player) {
      this.sendError(client.ws, "Player not found");
      return;
    }

    const targetPlayer = this.db.getPlayerById(targetPlayerId);
    if (!targetPlayer) {
      this.sendError(client.ws, "Target player not found");
      return;
    }

    // Don't allow declaring war on yourself
    if (client.playerId === targetPlayerId) {
      this.sendError(client.ws, "Cannot declare war on yourself");
      return;
    }

    // Check current relationship status
    const currentRelationship = this.db.getPlayerRelationship(
      client.playerId,
      targetPlayerId
    );
    if (currentRelationship === "at_war") {
      this.sendError(client.ws, "Already at war with this player");
      return;
    }

    // Check if player has enough science
    const cost = 25;
    if (player.science < cost) {
      this.sendError(
        client.ws,
        `Not enough science to declare war (requires ${cost} science)`
      );
      return;
    }

    // Deduct science cost
    this.db.updatePlayerResources(
      client.playerId,
      player.energy,
      player.alloy,
      player.science - cost
    );

    // Delete any pending proposals between these players
    this.db.deleteProposalsBetweenPlayers(client.playerId, targetPlayerId);

    // Set relationship to at_war
    this.db.setPlayerRelationship(client.playerId, targetPlayerId, "at_war");

    console.log(`Player ${player.name} declared war on ${targetPlayer.name}`);

    // Notify both players
    this.send(client.ws, {
      type: "relationshipChanged",
      otherPlayerId: targetPlayerId,
      otherPlayerName: targetPlayer.name,
      relationship: "at_war",
    });

    const targetClient = this.getClientByPlayerId(targetPlayerId);
    if (targetClient) {
      this.send(targetClient.ws, {
        type: "relationshipChanged",
        otherPlayerId: client.playerId,
        otherPlayerName: player.name,
        relationship: "at_war",
      });
    }

    // Update constellation view for both
    this.handleRequestConstellation(client);
    if (targetClient) {
      this.handleRequestConstellation(targetClient);
    }

    // Update player data to reflect science change
    this.send(client.ws, {
      type: "playerData",
      player: this.db.getPlayerById(client.playerId)!,
    });
  }

  private handleRequestRelationshipStatus(client: ClientConnection): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const allRelationships = this.db.getAllPlayerRelationships(client.playerId);
    const incomingProposals = this.db.getIncomingProposals(client.playerId);
    const outgoingProposals = this.db.getOutgoingProposals(client.playerId);

    // Convert relationships map to array with player names
    const relationshipsArray: Array<{
      playerId: string;
      playerName: string;
      relationship: "neutral" | "friendly" | "at_war";
    }> = [];

    for (const [playerId, relationship] of allRelationships) {
      const otherPlayer = this.db.getPlayerById(playerId);
      if (otherPlayer) {
        relationshipsArray.push({
          playerId,
          playerName: otherPlayer.name,
          relationship,
        });
      }
    }

    this.send(client.ws, {
      type: "relationshipStatus",
      relationships: relationshipsArray,
      incomingProposals,
      outgoingProposals,
    });
  }

  private getClientByPlayerId(playerId: string): ClientConnection | undefined {
    for (const [ws, client] of this.clients.entries()) {
      if (client.playerId === playerId) {
        return client;
      }
    }
    return undefined;
  }

  private handleEstablishMining(
    client: ClientConnection,
    celestialBodyId: string
  ): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const player = this.db.getPlayerById(client.playerId);
    if (!player) {
      this.sendError(client.ws, "Player not found");
      return;
    }

    // Check if player has enough resources
    const cost = MINING_INSTALLATION_CONFIG.cost;
    if (player.energy < cost.energy) {
      this.sendError(
        client.ws,
        `Not enough energy to establish mining operation (requires ${cost.energy} energy)`
      );
      return;
    }
    if (player.alloy < cost.alloy) {
      this.sendError(
        client.ws,
        `Not enough alloy to establish mining operation (requires ${cost.alloy} alloy)`
      );
      return;
    }
    if (player.science < cost.science) {
      this.sendError(
        client.ws,
        `Not enough science to establish mining operation (requires ${cost.science} science)`
      );
      return;
    }

    // Get the system the player is currently in
    const system = this.db.getStarSystem(player.currentSystemId);
    if (!system) {
      this.sendError(client.ws, "Current system not found");
      return;
    }

    // Find the celestial body in the system
    let celestialBody = null;

    // Check in moons
    for (const moon of system.moons) {
      if (moon.id === celestialBodyId) {
        celestialBody = moon;
        break;
      }
    }

    // Check in asteroids
    if (!celestialBody) {
      for (const belt of system.asteroidBelts) {
        for (const asteroid of belt.asteroids) {
          if (asteroid.id === celestialBodyId) {
            celestialBody = asteroid;
            break;
          }
        }
        if (celestialBody) break;
      }
    }

    if (!celestialBody) {
      this.sendError(client.ws, "Celestial body not found");
      return;
    }

    // Check if it's mineable (metallic composition)
    if (celestialBody.composition !== "metal") {
      this.sendError(
        client.ws,
        "This celestial body cannot be mined (not metallic)"
      );
      return;
    }

    // Check if there's already a mining operation on this body
    const existingOperation =
      this.db.getMiningOperationByCelestialBody(celestialBodyId);
    if (existingOperation) {
      this.sendError(client.ws, "Mining operation already exists on this body");
      return;
    }

    // Get current galaxy time for timestamp
    const galaxy = this.db.getGalaxyById(player.galaxyId);
    if (!galaxy) {
      this.sendError(client.ws, "Galaxy not found");
      return;
    }
    const currentTime = galaxy.currentTime || 0;

    // Deduct resources
    const energySuccess = this.db.deductPlayerEnergy(client.playerId, cost.energy);
    if (!energySuccess) {
      this.sendError(client.ws, "Failed to deduct energy");
      return;
    }
    const alloySuccess = this.db.deductPlayerAlloy(client.playerId, cost.alloy);
    if (!alloySuccess) {
      // Refund energy if alloy deduction fails
      this.db.addPlayerEnergy(client.playerId, cost.energy);
      this.sendError(client.ws, "Failed to deduct alloy");
      return;
    }
    const scienceSuccess = this.db.deductPlayerScience(client.playerId, cost.science);
    if (!scienceSuccess) {
      // Refund energy and alloy if science deduction fails
      this.db.addPlayerEnergy(client.playerId, cost.energy);
      this.db.addPlayerAlloy(client.playerId, cost.alloy);
      this.sendError(client.ws, "Failed to deduct science");
      return;
    }

    // Create mining operation
    const miningOperationId = uuidv4();
    // Randomize alloy per day between 0.05 and 0.1
    const ALLOY_PER_DAY = 0.05 + Math.random() * 0.05;
    // Randomize total alloy limit between 15 and 100
    const TOTAL_ALLOY_LIMIT = 15 + Math.random() * 85;

    this.db.createMiningOperation(
      miningOperationId,
      client.playerId,
      system.id,
      celestialBodyId,
      ALLOY_PER_DAY,
      currentTime,
      TOTAL_ALLOY_LIMIT,
      0 // initial alloy mined
    );

    console.log(
      `Player ${player.name} established mining operation on ${celestialBody.name} in system ${system.id}`
    );

    // Send updated player data with new energy amount FIRST
    const updatedPlayer = this.db.getPlayerById(client.playerId);
    if (updatedPlayer) {
      this.send(client.ws, { type: "playerData", player: updatedPlayer });
    }

    // Reload the system in game state with updated mining operations
    const updatedSystem = this.db.getStarSystem(system.id);
    if (updatedSystem) {
      // Update the system in the game state manager so future state updates include the new mining operation
      this.gameState.loadSystem(updatedSystem);

      // Send updated system data to the client who established mining
      const gateOwnership = this.db.getGateOwnershipForSystem(
        client.playerId,
        updatedSystem.id
      );
      this.send(client.ws, {
        type: "systemData",
        system: updatedSystem,
        gateOwnership: gateOwnership.length > 0 ? gateOwnership : undefined,
      });

      // Also broadcast updated system data to all other clients viewing this system
      for (const otherClient of this.clients.values()) {
        if (
          otherClient.currentSystemId === system.id &&
          otherClient.playerId !== client.playerId
        ) {
          const otherGateOwnership = otherClient.playerId
            ? this.db.getGateOwnershipForSystem(
                otherClient.playerId,
                updatedSystem.id
              )
            : [];
          this.send(otherClient.ws, {
            type: "systemData",
            system: updatedSystem,
            gateOwnership:
              otherGateOwnership.length > 0 ? otherGateOwnership : undefined,
          });
        }
      }
    }

    // Send success message LAST so client can re-select the body after updates
    this.send(client.ws, {
      type: "miningEstablished",
      miningOperationId,
      celestialBodyId,
      alloyPerDay: ALLOY_PER_DAY,
    });

    // Update resource flow for this player (mining operation affects flow)
    this.sendResourceFlowUpdate(client);
  }

  private handleEstablishHelium3Extraction(
    client: ClientConnection,
    celestialBodyId: string
  ): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const player = this.db.getPlayerById(client.playerId);
    if (!player) {
      this.sendError(client.ws, "Player not found");
      return;
    }

    // Check if player has enough resources
    const cost = HELIUM3_EXTRACTION_CONFIG.cost;
    if (player.energy < cost.energy) {
      this.sendError(
        client.ws,
        `Not enough energy to establish Helium-3 extraction (requires ${cost.energy} energy)`
      );
      return;
    }
    if (player.alloy < cost.alloy) {
      this.sendError(
        client.ws,
        `Not enough alloy to establish Helium-3 extraction (requires ${cost.alloy} alloy)`
      );
      return;
    }
    if (player.science < cost.science) {
      this.sendError(
        client.ws,
        `Not enough science to establish Helium-3 extraction (requires ${cost.science} science)`
      );
      return;
    }

    // Get the system the player is currently in
    const system = this.db.getStarSystem(player.currentSystemId);
    if (!system) {
      this.sendError(client.ws, "Current system not found");
      return;
    }

    // Find the celestial body in the system
    let celestialBody = null;

    // Check in planets
    for (const planet of system.planets) {
      if (planet.id === celestialBodyId) {
        celestialBody = planet;
        break;
      }
    }

    // Check in moons
    if (!celestialBody) {
      for (const moon of system.moons) {
        if (moon.id === celestialBodyId) {
          celestialBody = moon;
          break;
        }
      }
    }

    if (!celestialBody) {
      this.sendError(client.ws, "Celestial body not found");
      return;
    }

    // Check if it has Helium-3
    if (!celestialBody.hasHelium3) {
      this.sendError(
        client.ws,
        "This celestial body does not have Helium-3 deposits"
      );
      return;
    }

    // Check if there's already a Helium-3 operation on this body
    const existingOperation =
      this.db.getHelium3OperationByCelestialBody(celestialBodyId);
    if (existingOperation) {
      this.sendError(
        client.ws,
        "Helium-3 extraction already exists on this body"
      );
      return;
    }

    // Get current galaxy time for timestamp
    const galaxy = this.db.getGalaxyById(player.galaxyId);
    if (!galaxy) {
      this.sendError(client.ws, "Galaxy not found");
      return;
    }
    const currentTime = galaxy.currentTime || 0;

    // Deduct resources
    const energySuccess = this.db.deductPlayerEnergy(
      client.playerId,
      cost.energy
    );
    if (!energySuccess) {
      this.sendError(client.ws, "Failed to deduct energy");
      return;
    }
    const alloySuccess = this.db.deductPlayerAlloy(client.playerId, cost.alloy);
    if (!alloySuccess) {
      // Refund energy if alloy deduction fails
      this.db.addPlayerEnergy(client.playerId, cost.energy);
      this.sendError(client.ws, "Failed to deduct alloy");
      return;
    }
    const scienceSuccess = this.db.deductPlayerScience(
      client.playerId,
      cost.science
    );
    if (!scienceSuccess) {
      // Refund energy and alloy if science deduction fails
      this.db.addPlayerEnergy(client.playerId, cost.energy);
      this.db.addPlayerAlloy(client.playerId, cost.alloy);
      this.sendError(client.ws, "Failed to deduct science");
      return;
    }

    // Add energy immediately (Helium-3 extractors provide instant permanent energy boost)
    const energyAmount = HELIUM3_ENERGY;
    this.db.addPlayerEnergy(client.playerId, energyAmount);

    // Create Helium-3 extraction operation
    const helium3OperationId = uuidv4();

    this.db.createHelium3Operation(
      helium3OperationId,
      client.playerId,
      system.id,
      celestialBodyId,
      energyAmount,
      currentTime
    );

    console.log(
      `Player ${player.name} established Helium-3 extraction on ${celestialBody.name} in system ${system.id} (+${energyAmount} energy)`
    );

    // Send updated player data with new alloy amount FIRST
    const updatedPlayer = this.db.getPlayerById(client.playerId);
    if (updatedPlayer) {
      this.send(client.ws, { type: "playerData", player: updatedPlayer });
    }

    // Reload the system in game state with updated Helium-3 operations
    const updatedSystem = this.db.getStarSystem(system.id);
    if (updatedSystem) {
      // Update the system in the game state manager so future state updates include the new operation
      this.gameState.loadSystem(updatedSystem);

      // Send updated system data to the client who established extraction
      const gateOwnership = this.db.getGateOwnershipForSystem(
        client.playerId,
        updatedSystem.id
      );
      this.send(client.ws, {
        type: "systemData",
        system: updatedSystem,
        gateOwnership: gateOwnership.length > 0 ? gateOwnership : undefined,
      });

      // Also broadcast updated system data to all other clients viewing this system
      for (const otherClient of this.clients.values()) {
        if (
          otherClient.currentSystemId === system.id &&
          otherClient.playerId !== client.playerId
        ) {
          const otherGateOwnership = otherClient.playerId
            ? this.db.getGateOwnershipForSystem(
                otherClient.playerId,
                updatedSystem.id
              )
            : [];
          this.send(otherClient.ws, {
            type: "systemData",
            system: updatedSystem,
            gateOwnership:
              otherGateOwnership.length > 0 ? otherGateOwnership : undefined,
          });
        }
      }
    }

    // Send success message LAST so client can re-select the body after updates
    this.send(client.ws, {
      type: "helium3Established",
      helium3OperationId,
      celestialBodyId,
      energyPerDay: energyAmount, // Keep field name for compatibility
    });

    // Update resource flow for this player (Helium-3 operation affects flow)
    this.sendResourceFlowUpdate(client);
  }

  private handleLaunchDysonSwarm(
    client: ClientConnection,
    starId: string
  ): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const player = this.db.getPlayerById(client.playerId);
    if (!player) {
      this.sendError(client.ws, "Player not found");
      return;
    }

    // Check if player has enough alloy
    const dysonSwarmCost = GAME_COSTS.DYSON_SWARM.alloy;
    if (player.alloy < dysonSwarmCost) {
      this.sendError(
        client.ws,
        `Not enough alloy to launch Dyson Swarm (requires ${dysonSwarmCost} alloy)`
      );
      return;
    }

    // Get the system the player is currently in
    const system = this.db.getStarSystem(player.currentSystemId);
    if (!system) {
      this.sendError(client.ws, "Current system not found");
      return;
    }

    // Check if the star is in this system (primary or companion)
    let targetStar = null;
    if (system.star.id === starId) {
      targetStar = system.star;
    } else if (system.companionStars) {
      targetStar = system.companionStars.find((cs) => cs.id === starId);
    }

    if (!targetStar) {
      this.sendError(client.ws, "Star not found in current system");
      return;
    }

    // Check if player controls this system (has explored at least one gate)
    const systemGates = this.db.getGatesBySystem(system.id);
    const hasExploredGate = systemGates.some((gate) =>
      player.exploredGateIds.includes(gate.id)
    );

    if (!hasExploredGate && system.id !== player.homeSystemId) {
      this.sendError(
        client.ws,
        "You must control this system to build megastructures (explore at least one gate)"
      );
      return;
    }

    // Calculate maximum swarms based on star's physical size (12-320 range)
    const starRadiusInSolarRadii = targetStar.radius / SOLAR_RADIUS;
    const maxSwarms = calculateMaxDysonSwarms(starRadiusInSolarRadii);

    // Check how many Dyson Swarms are already on this star
    const existingSwarms = this.db.countDysonSwarmsByStar(starId);

    if (existingSwarms >= maxSwarms) {
      this.sendError(
        client.ws,
        `Maximum Dyson Swarms (${maxSwarms}) already deployed on this star. Star size limits capacity.`
      );
      return;
    }

    // Get current galaxy time for timestamp
    const galaxy = this.db.getGalaxyById(player.galaxyId);
    if (!galaxy) {
      this.sendError(client.ws, "Galaxy not found");
      return;
    }
    const currentTime = galaxy.currentTime || 0;

    // Deduct alloy (no cap needed for deduction)
    const deductStmt = this.db
      .rawDb()
      .prepare("UPDATE players SET alloy = alloy - ? WHERE id = ?");
    deductStmt.run(dysonSwarmCost, client.playerId);

    // Add energy immediately (Dyson Swarms provide instant permanent energy boost)
    // Each swarm adds DYSON_SWARM_ENERGY to the player's energy pool
    let energyPerSwarm = DYSON_SWARM_ENERGY;

    // Apply Nano Arrays technology bonus (+10% energy)
    const completedTechs = this.db.getCompletedTechnologies(client.playerId);
    if (completedTechs.includes("nano_arrays")) {
      energyPerSwarm = energyPerSwarm * 1.1; // +10% bonus
      console.log(
        `Nano Arrays tech applied: ${energyPerSwarm} energy (was ${DYSON_SWARM_ENERGY})`
      );
    }

    this.db.addPlayerEnergy(client.playerId, energyPerSwarm);

    // Create Dyson Swarm megastructure
    const megastructureId = uuidv4();

    this.db.createMegastructure(
      megastructureId,
      client.playerId,
      system.id,
      "dyson_swarm",
      starId,
      "energy",
      energyPerSwarm,
      currentTime,
      null
    );

    console.log(
      `Player ${player.name} launched Dyson Swarm #${
        existingSwarms + 1
      }/${maxSwarms} on ${targetStar.name} in system ${system.id} (+${energyPerSwarm} energy)`
    );

    // Send updated player data with new alloy amount FIRST
    const updatedPlayer = this.db.getPlayerById(client.playerId);
    if (updatedPlayer) {
      this.send(client.ws, { type: "playerData", player: updatedPlayer });
    }

    // Reload the system in game state with updated megastructures
    const updatedSystem = this.db.getStarSystem(system.id);
    if (updatedSystem) {
      // Update the system in the game state manager so future state updates include the new megastructure
      this.gameState.loadSystem(updatedSystem);

      // Send updated system data to the client who built it
      const gateOwnership = this.db.getGateOwnershipForSystem(
        client.playerId,
        updatedSystem.id
      );
      this.send(client.ws, {
        type: "systemData",
        system: updatedSystem,
        gateOwnership: gateOwnership.length > 0 ? gateOwnership : undefined,
      });

      // Also broadcast updated system data to all other clients viewing this system
      for (const otherClient of this.clients.values()) {
        if (
          otherClient.currentSystemId === system.id &&
          otherClient.playerId !== client.playerId
        ) {
          const otherGateOwnership = otherClient.playerId
            ? this.db.getGateOwnershipForSystem(
                otherClient.playerId,
                updatedSystem.id
              )
            : [];
          this.send(otherClient.ws, {
            type: "systemData",
            system: updatedSystem,
            gateOwnership:
              otherGateOwnership.length > 0 ? otherGateOwnership : undefined,
          });
        }
      }
    }

    // Send success message LAST
    this.send(client.ws, {
      type: "dysonSwarmLaunched",
      megastructureId,
      starId,
      energyPerDay: energyPerSwarm,
      count: existingSwarms + 1,
      maxSwarms: maxSwarms,
    });

    // Update resource flow for this player (Dyson swarm affects flow)
    this.sendResourceFlowUpdate(client);
  }

  private handleDebugAddResource(
    client: ClientConnection,
    resourceType: "energy" | "alloy" | "science",
    amount: number
  ): void {
    console.log(
      `[DEBUG] handleDebugAddResource called: ${resourceType} +${amount}, playerId: ${client.playerId}`
    );

    if (!client.playerId) {
      console.error("[DEBUG] Not authenticated");
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const player = this.db.getPlayerById(client.playerId);
    if (!player) {
      console.error("[DEBUG] Player not found");
      this.sendError(client.ws, "Player not found");
      return;
    }

    console.log(
      `[DEBUG] Current player resources - energy: ${player.energy}, alloy: ${player.alloy}, science: ${player.science}`
    );

    // Update the resource based on type
    if (resourceType === "energy") {
      this.db.addPlayerEnergy(client.playerId, amount);
      console.log(
        `[DEBUG] Added ${amount} energy to player ${player.name} (new total: ${
          player.energy + amount
        })`
      );
    } else if (resourceType === "alloy") {
      // Add alloy directly (without cap)
      const addStmt = this.db
        .rawDb()
        .prepare("UPDATE players SET alloy = alloy + ? WHERE id = ?");
      addStmt.run(amount, client.playerId);
      console.log(
        `[DEBUG] Added ${amount} alloy to player ${player.name} (new total: ${
          player.alloy + amount
        })`
      );
    } else if (resourceType === "science") {
      this.db.addPlayerScience(client.playerId, amount);
      console.log(
        `[DEBUG] Added ${amount} science to player ${player.name} (new total: ${
          player.science + amount
        })`
      );
    }

    // Send updated player data
    const updatedPlayer = this.db.getPlayerById(client.playerId);
    if (updatedPlayer) {
      console.log(
        `[DEBUG] Sending updated player data - energy: ${updatedPlayer.energy}, alloy: ${updatedPlayer.alloy}`
      );
      this.send(client.ws, { type: "playerData", player: updatedPlayer });
    }
  }

  private handleSearchObjects(client: ClientConnection, query: string): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const player = this.db.getPlayerById(client.playerId);
    if (!player) {
      this.sendError(client.ws, "Player not found");
      return;
    }

    const results: SearchResult[] = [];
    const searchTerm = query.toLowerCase().trim();

    if (!searchTerm) {
      this.send(client.ws, { type: "searchResults", results: [] });
      return;
    }

    // Get all explored systems for this player
    const exploredSystemIds = new Set<string>();
    exploredSystemIds.add(player.homeSystemId); // Always include home system

    // Get systems connected through explored gates
    const exploredGateIds = new Set(player.exploredGateIds);

    // Get all systems in the galaxy and check their gates
    const allSystems = this.db.getSystemsByGalaxy(player.galaxyId);
    for (const system of allSystems) {
      const systemGates = this.db.getGatesBySystem(system.id);
      for (const gate of systemGates) {
        if (exploredGateIds.has(gate.id)) {
          exploredSystemIds.add(gate.systemId);
          exploredSystemIds.add(gate.destinationSystemId);
        }
      }
    }

    // Search through all explored systems
    for (const systemId of exploredSystemIds) {
      const system = this.db.getStarSystem(systemId);
      if (!system) continue;

      // Search star
      if (system.star.name.toLowerCase().includes(searchTerm)) {
        results.push({
          objectId: system.star.id,
          objectName: system.star.name,
          objectType: system.star.starType || "Star",
          systemId: system.id,
          systemName: system.star.name,
          starName: system.star.name,
        });
      }

      // Search planets
      for (const planet of system.planets) {
        if (
          planet.name.toLowerCase().includes(searchTerm) ||
          planet.planetType?.toLowerCase().includes(searchTerm)
        ) {
          results.push({
            objectId: planet.id,
            objectName: planet.name,
            objectType: planet.planetType || "Planet",
            systemId: system.id,
            systemName: system.star.name,
            starName: system.star.name,
          });
        }
      }

      // Search moons
      for (const moon of system.moons) {
        if (moon.name.toLowerCase().includes(searchTerm)) {
          results.push({
            objectId: moon.id,
            objectName: moon.name,
            objectType: "Moon",
            systemId: system.id,
            systemName: system.star.name,
            starName: system.star.name,
          });
        }
      }

      // Search asteroids
      for (const belt of system.asteroidBelts) {
        for (const asteroid of belt.asteroids) {
          if (asteroid.name.toLowerCase().includes(searchTerm)) {
            results.push({
              objectId: asteroid.id,
              objectName: asteroid.name,
              objectType: "Asteroid",
              systemId: system.id,
              systemName: system.star.name,
              starName: system.star.name,
            });
          }
        }
      }

      // Search mining operations (search by keyword "mining" or body name)
      const miningOperations = this.db.getMiningOperationsBySystem(system.id);
      for (const operation of miningOperations) {
        // Only show player's own mining operations
        if (operation.playerId !== player.id) continue;

        // Find the celestial body name
        let bodyName = "Unknown";
        const body = [
          ...system.moons,
          ...system.asteroidBelts.flatMap((b) => b.asteroids),
        ].find((b) => b.id === operation.celestialBodyId);
        if (body) {
          bodyName = body.name;
        }

        const operationSearchText = `mining ${bodyName}`.toLowerCase();
        if (
          operationSearchText.includes(searchTerm) ||
          searchTerm.includes("mining")
        ) {
          results.push({
            objectId: operation.celestialBodyId,
            objectName: `${bodyName} (Mining)`,
            objectType: "Mining Operation",
            systemId: system.id,
            systemName: system.star.name,
            starName: system.star.name,
          });
        }
      }

      // Search Dyson Swarms
      const megastructures = this.db.getMegastructuresBySystem(system.id);
      for (const megastructure of megastructures) {
        // Only show player's own megastructures
        if (megastructure.playerId !== player.id) continue;

        if (
          megastructure.type === "dyson_swarm" &&
          megastructure.celestialBodyId
        ) {
          const swarmSearchText =
            `dyson swarm ${system.star.name}`.toLowerCase();
          if (
            swarmSearchText.includes(searchTerm) ||
            searchTerm.includes("dyson") ||
            searchTerm.includes("swarm")
          ) {
            results.push({
              objectId: megastructure.celestialBodyId,
              objectName: `${system.star.name} (Dyson Swarm)`,
              objectType: "Dyson Swarm",
              systemId: system.id,
              systemName: system.star.name,
              starName: system.star.name,
            });
            // Only add one entry per star (even if multiple swarms)
            break;
          }
        }
      }
    }

    console.log(
      `Search for "${query}" returned ${results.length} results across ${exploredSystemIds.size} explored systems`
    );

    this.send(client.ws, { type: "searchResults", results });
  }

  private handleDisconnect(ws: WebSocket): void {
    const client = this.clients.get(ws);
    const wasDeleted = this.clients.delete(ws);
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ee94a6f1-42d6-44ad-8459-4ef2edbb6497',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'websocket-server.ts:handleDisconnect',message:'Client disconnected',data:{wasDeleted,clientsCount:this.clients.size,clientId:client?.playerId,galaxyId:client?.galaxyId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
    
    console.log("Client disconnected");
    this.checkPlayerCountAndPause();

    // Save galaxy time state when player disconnects
    // Save all active galaxies to ensure we don't lose any state
    const activeGalaxyIds = new Set<string>();
    for (const c of this.clients.values()) {
      if (c.galaxyId) {
        activeGalaxyIds.add(c.galaxyId);
      }
    }
    // Also include the disconnecting client's galaxy
    if (client?.galaxyId) {
      activeGalaxyIds.add(client.galaxyId);
    }

    for (const galaxyId of activeGalaxyIds) {
      const timeState = this.gameState.getGalaxyTimeState(galaxyId);
      if (timeState) {
        this.db.updateGalaxyTimeState(
          galaxyId,
          timeState.currentTime,
          timeState.isPaused,
          timeState.timeScale
        );
      }
    }
  }

  private getActivePlayerCount(): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.playerId !== null) {
        count++;
      }
    }
    return count;
  }

  private checkPlayerCountAndPause(): void {
    const activePlayerCount = this.getActivePlayerCount();
    console.log(`Active players: ${activePlayerCount}`);

    // Pause galaxies that have no active players
    const galaxyPlayerCounts = new Map<string, number>();
    for (const client of this.clients.values()) {
      if (client.galaxyId) {
        galaxyPlayerCounts.set(
          client.galaxyId,
          (galaxyPlayerCounts.get(client.galaxyId) || 0) + 1
        );
      }
    }

    // Pause galaxies with no players
    // Note: We only check galaxies that have connected clients
    // Galaxies without any clients remain in their current state
  }

  private startStateUpdates(): void {
    setInterval(() => {
      this.broadcastStateUpdates();
    }, 1000 / STATE_UPDATE_RATE);
  }

  /**
   * Handle when in-game days elapse - process all yields and updates
   * This is called by GameStateManager when game time advances
   * Integrated with the existing game state update loop
   */
  private handleDayElapsed(galaxyId: string, currentTime: number, daysElapsed: number): void {
    // Process all yields for this galaxy
    // Process mining yields based on current time
    this.db.processMiningYields(currentTime);

    // Process megastructure yields based on current time
    // Note: Dyson Swarms and Helium-3 extractors provide instant energy (not processed here)
    this.db.processMegastructureYields(currentTime);

    // Process colony yields based on current time (population growth, resource generation)
    const updatedColonies = this.db.processColonyYields(currentTime);

    // Process population migration between colonies
    const migratedColonies = this.db.processPopulationMigration(currentTime);
    
    // Combine all updated colonies
    const allUpdatedColonies = [...updatedColonies, ...migratedColonies];
    
    // Notify clients about colony updates in real-time
    for (const colony of allUpdatedColonies) {
      // Find all clients viewing this system
      for (const client of this.clients.values()) {
        if (client.currentSystemId === colony.systemId && client.galaxyId === galaxyId) {
          this.send(client.ws, {
            type: "colonyUpdated",
            colony,
          });
        }
      }
    }

    // Process defense platform maintenance costs
    this.db.processDefenseMaintenance(currentTime);

    // Process technology research (consumes science proportionally)
    const completedResearch = this.db.processTechnologyResearch(currentTime);

    // Notify players of completed, resumed, and paused research
    for (const completion of completedResearch) {
      const client = this.findClientByPlayerId(completion.playerId);
      if (client && client.galaxyId === galaxyId) {
        if (completion.paused) {
          // Notify about auto-paused research
          this.send(client.ws, {
            type: "researchPaused",
            technologyId: completion.technologyId,
          });
        } else if (completion.resumed) {
          // Notify about auto-resumed research
          this.send(client.ws, {
            type: "researchResumed",
            technologyId: completion.technologyId,
          });
        } else if (completion.completed) {
          // Notify about completed research
          const tech = TECHNOLOGIES[completion.technologyId];
          this.send(client.ws, {
            type: "researchCompleted",
            technologyId: completion.technologyId,
            technologyName: tech?.name || completion.technologyId,
          });
        }
      }
    }
    
    // Send updated player data to clients in this galaxy (for resource updates)
    for (const client of this.clients.values()) {
      if (client.playerId && client.galaxyId === galaxyId) {
        const player = this.db.getPlayerById(client.playerId);
        if (player) {
          this.send(client.ws, { type: "playerData", player });
        }
      }
    }

    // Broadcast resource flow updates to all clients in this galaxy
    // (production sources may have changed)
    this.broadcastResourceFlowUpdates(galaxyId);
  }

  private startTimeSaveInterval(): void {
    // Periodically save galaxy time state to database for crash recovery
    // Yield processing now happens in handleDayElapsed() when game time advances
    setInterval(() => {
      // Get unique galaxy IDs from all connected clients
      const activeGalaxyIds = new Set<string>();
      for (const client of this.clients.values()) {
        if (client.galaxyId) {
          activeGalaxyIds.add(client.galaxyId);
        }
      }

      // Save time state for each active galaxy
      for (const galaxyId of activeGalaxyIds) {
        const timeState = this.gameState.getGalaxyTimeState(galaxyId);
        if (timeState) {
          this.db.updateGalaxyTimeState(
            galaxyId,
            timeState.currentTime,
            timeState.isPaused,
            timeState.timeScale
          );
        }
      }
    }, 10000); // Save every 10 seconds for crash recovery
  }

  private startGalaxyCleanupInterval(): void {
    // Clean up old galaxies every hour
    setInterval(() => {
      const deletedCount = this.db.cleanupOldGalaxies();
      if (deletedCount > 0) {
        console.log(`Cleaned up ${deletedCount} old galaxies`);
      }
    }, 60 * 60 * 1000); // Run every hour

    // Also run once on startup (after 1 minute to let server settle)
    // Temporarily disabled for testing
    // setTimeout(() => {
    //   const deletedCount = this.db.cleanupOldGalaxies();
    //   if (deletedCount > 0) {
    //     console.log(`Initial cleanup: removed ${deletedCount} old galaxies`);
    //   }
    // }, 60 * 1000);
  }

  private broadcastStateUpdates(): void {
    const systemStates = new Map<string, any>();

    // Get unique system IDs from all connected clients
    const systemIds = new Set<string>();
    for (const client of this.clients.values()) {
      if (client.currentSystemId) {
        systemIds.add(client.currentSystemId);
      }
    }

    // Calculate state for each system
    for (const systemId of systemIds) {
      const state = this.gameState.getSystemState(systemId);
      if (state) {
        systemStates.set(systemId, state);
      }
    }

    // Send state updates to clients
    for (const client of this.clients.values()) {
      if (client.currentSystemId) {
        const state = systemStates.get(client.currentSystemId);
        if (state) {
          this.send(client.ws, { type: "stateUpdate", state });
        }
      }
    }

    // Broadcast resource flow updates to all clients
    this.broadcastResourceFlowUpdates();
  }

  private broadcastTimeUpdate(): void {
    // Send galaxy-specific time to each client
    for (const client of this.clients.values()) {
      if (client.galaxyId) {
        const galaxyState = this.gameState.getGalaxyState(client.galaxyId);
        if (galaxyState) {
          const timeUpdate: ServerMessage = {
            type: "timeUpdate",
            currentTime: galaxyState.currentTime,
            isPaused: galaxyState.isPaused,
            timeScale: galaxyState.timeScale,
          };
          this.send(client.ws, timeUpdate);
        }
      }
    }
  }

  /**
   * Send resource flow updates for a specific client
   * Used when production sources change (mining, swarm, colony)
   */
  private sendResourceFlowUpdate(client: ClientConnection): void {
    if (!client.playerId || !client.currentSystemId) {
      return;
    }

    try {
      const flow = calculatePlayerResourceFlow(this.db, client.playerId);
      const systemId = client.currentSystemId;
      const system = this.db.getStarSystem(systemId);
      if (!system) return;

      const gates = system.gates || [];
      
      // Send flow for gates in current system
      for (const gate of gates) {
        const gateFlow = flow.gateFlows.get(gate.id);
        if (gateFlow) {
          this.send(client.ws, {
            type: "gateResourceFlow",
            gateId: gate.id,
            energyFlow: gateFlow.energy,
            alloyFlow: gateFlow.alloy,
            scienceFlow: gateFlow.science,
            isBlockaded: gateFlow.isBlockaded,
            blockadeOwnerName: gateFlow.blockadeOwnerName,
          });
        }
      }

      // Also send flow for OTHER gates in tunnels (the gates in connected systems)
      const tunnelOwnership = this.db.getTunnelOwnershipForSystem(client.playerId, systemId);
      for (const tunnelOwn of tunnelOwnership) {
        const gatesInTunnel = this.db.getGatesByTunnel(tunnelOwn.tunnelId);
        const otherGate = gatesInTunnel.find((g) => g.systemId !== systemId);
        
        if (otherGate) {
          const otherGateFlow = flow.gateFlows.get(otherGate.id);
          if (otherGateFlow) {
            this.send(client.ws, {
              type: "gateResourceFlow",
              gateId: otherGate.id,
              energyFlow: otherGateFlow.energy,
              alloyFlow: otherGateFlow.alloy,
              scienceFlow: otherGateFlow.science,
              isBlockaded: otherGateFlow.isBlockaded,
              blockadeOwnerName: otherGateFlow.blockadeOwnerName,
            });
          }
        }
      }
    } catch (err) {
      console.error(`Failed to send resource flow update for player ${client.playerId}:`, err);
    }
  }

  /**
   * Broadcast resource flow updates to all clients (or clients in a specific galaxy)
   * This ensures resource flow UI is updated when production sources change
   */
  private broadcastResourceFlowUpdates(galaxyId?: string): void {
    // Group clients by player ID to avoid duplicate calculations
    const playerIds = new Set<string>();
    for (const client of this.clients.values()) {
      if (client.playerId && (!galaxyId || client.galaxyId === galaxyId)) {
        playerIds.add(client.playerId);
      }
    }

    // Calculate and send resource flow for each player
    for (const playerId of playerIds) {
      try {
        const flow = calculatePlayerResourceFlow(this.db, playerId);
        
        // Get all systems this player might be viewing
        const systemsToUpdate = new Set<string>();
        for (const client of this.clients.values()) {
          if (client.playerId === playerId && client.currentSystemId && (!galaxyId || client.galaxyId === galaxyId)) {
            systemsToUpdate.add(client.currentSystemId);
          }
        }

        // Send resource flow for all gates in systems the player is viewing
        for (const systemId of systemsToUpdate) {
          const system = this.db.getStarSystem(systemId);
          if (!system) continue;

          const gates = this.db.getGatesBySystem(systemId);
          for (const gate of gates) {
            const gateFlow = flow.gateFlows.get(gate.id);
            
            // Always send gate flow info, even if there's no resource flowing
            // This ensures blockade status is updated even when resources are completely blocked
            let isBlockaded = false;
            let blockadeOwnerName: string | undefined = undefined;
            let energyFlow = 0;
            let alloyFlow = 0;
            let scienceFlow = 0;
            
            if (gateFlow) {
              // Gate has resource flow data
              energyFlow = gateFlow.energy;
              alloyFlow = gateFlow.alloy;
              scienceFlow = gateFlow.science;
              isBlockaded = gateFlow.isBlockaded;
              blockadeOwnerName = gateFlow.blockadeOwnerName;
            } else if (gate.tunnelId) {
              // No flow data, but check if tunnel is blockaded
              const tunnelFlow = flow.tunnelFlows.get(gate.tunnelId);
              if (tunnelFlow && tunnelFlow.isBlockaded) {
                isBlockaded = true;
                // Get the tunnel to check power status
                const tunnel = this.db.getTunnelById(gate.tunnelId);
                if (tunnel && !tunnel.poweredByPlayerId) {
                  blockadeOwnerName = "Unpowered Tunnel";
                }
              }
            }
            
            // Send to all clients for this player viewing this system
            for (const client of this.clients.values()) {
              if (client.playerId === playerId && client.currentSystemId === systemId) {
                this.send(client.ws, {
                  type: "gateResourceFlow",
                  gateId: gate.id,
                  energyFlow,
                  alloyFlow,
                  scienceFlow,
                  isBlockaded,
                  blockadeOwnerName,
                });
              }
            }
          }

          // Also send flow for gates in connected systems (other end of tunnels)
          const tunnelOwnership = this.db.getTunnelOwnershipForSystem(playerId, systemId);
          for (const tunnelOwn of tunnelOwnership) {
            const gatesInTunnel = this.db.getGatesByTunnel(tunnelOwn.tunnelId);
            const otherGate = gatesInTunnel.find((g) => g.systemId !== systemId);
            
            if (otherGate) {
              const otherGateFlow = flow.gateFlows.get(otherGate.id);
              if (otherGateFlow) {
                // Send to all clients for this player viewing this system
                for (const client of this.clients.values()) {
                  if (client.playerId === playerId && client.currentSystemId === systemId) {
                    this.send(client.ws, {
                      type: "gateResourceFlow",
                      gateId: otherGate.id,
                      energyFlow: otherGateFlow.energy,
                      alloyFlow: otherGateFlow.alloy,
                      scienceFlow: otherGateFlow.science,
                      isBlockaded: otherGateFlow.isBlockaded,
                      blockadeOwnerName: otherGateFlow.blockadeOwnerName,
                    });
                  }
                }
              }
            }
          }
        }

        // Send updated player income rates (net of blockades) to all clients for this player
        const player = this.db.getPlayerById(playerId);
        if (player) {
          const netEnergyPerDay = flow.totalEnergy - flow.blockedEnergy;
          const netAlloyPerDay = (player.alloyPerDay || 0) - flow.blockedAlloy;
          const netSciencePerDay = (player.sciencePerDay || 0) - flow.blockedScience;

          for (const client of this.clients.values()) {
            if (client.playerId === playerId && (!galaxyId || client.galaxyId === galaxyId)) {
              this.send(client.ws, {
                type: "playerIncomeUpdate",
                energyPerDay: netEnergyPerDay,
                alloyPerDay: netAlloyPerDay,
                sciencePerDay: netSciencePerDay,
              });
            }
          }
        }
      } catch (err) {
        console.error(`Failed to calculate resource flow for player ${playerId}:`, err);
      }
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(serializeMessage(message));
    }
  }

  private sendGalaxyPlayersInfo(
    client: ClientConnection,
    player: Player
  ): void {
    // Get all met players
    const metPlayers = this.db.getMetPlayers(player.id);
    console.log(`[DEBUG] getMetPlayers for ${player.name} returned:`, metPlayers.map(p => p.name));

    // Get total players in galaxy
    const allPlayers = this.db.getPlayersByGalaxy(player.galaxyId);
    console.log(`[DEBUG] Total players in galaxy: ${allPlayers.length}`);

    const message = {
      type: "galaxyPlayers" as const,
      metPlayers: metPlayers.map((p) => ({ id: p.id, name: p.name })),
      totalPlayers: allPlayers.length,
    };
    console.log(`[DEBUG] Sending galaxyPlayers message to ${player.name}:`, message);
    this.send(client.ws, message);
  }

  private broadcastGalaxyPlayersInfo(galaxyId: string): void {
    // Broadcast updated player info to all players in this galaxy
    for (const client of this.clients.values()) {
      if (client.playerId) {
        const player = this.db.getPlayerById(client.playerId);
        if (player && player.galaxyId === galaxyId) {
          this.sendGalaxyPlayersInfo(client, player);
        }
      }
    }
  }

  private findClientByPlayerId(playerId: string): ClientConnection | null {
    for (const client of this.clients.values()) {
      if (client.playerId === playerId) {
        return client;
      }
    }
    return null;
  }

  private sendError(ws: WebSocket, message: string): void {
    this.send(ws, { type: "error", message });
  }

  private handleEstablishColony(
    client: ClientConnection,
    planetId: string,
    specialization: "balanced" | "research" | "industrial"
  ): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const player = this.db.getPlayerById(client.playerId);
    if (!player) {
      this.sendError(client.ws, "Player not found");
      return;
    }

    // Check if player has a species
    if (!player.speciesId) {
      this.sendError(client.ws, "No species found for player");
      return;
    }

    // Get the system the player is currently in
    const system = this.db.getStarSystem(player.currentSystemId);
    if (!system) {
      this.sendError(client.ws, "Current system not found");
      return;
    }

    // Find the planet in the system
    const planet = system.planets.find((p) => p.id === planetId);
    if (!planet) {
      this.sendError(client.ws, "Planet not found in current system");
      return;
    }

    // Check if planet is already colonized
    const existingColony = this.db.getColonyByPlanetId(planetId);
    if (existingColony) {
      this.sendError(client.ws, "Planet is already colonized");
      return;
    }

    // Check if planet has native civilization
    const nativeCiv = this.db.getNativeCivilizationByPlanetId(planetId);
    if (nativeCiv) {
      this.sendError(
        client.ws,
        "Cannot colonize planet with native civilization"
      );
      return;
    }

    // Check habitability - require at least 0.3 habitability
    if (!planet.habitability || planet.habitability < 0.3) {
      this.sendError(
        client.ws,
        "Planet is not habitable enough for colonization (requires at least 30% habitability)"
      );
      return;
    }

    // Check if player has enough resources to establish colony
    const COLONY_COST = GAME_COSTS.COLONY_ESTABLISHMENT;

    if (player.energy < COLONY_COST.energy) {
      this.sendError(
        client.ws,
        `Not enough energy to establish colony (requires ${COLONY_COST.energy} energy, have ${
          Math.floor(player.energy * 100) / 100
        })`
      );
      return;
    }

    if (player.alloy < COLONY_COST.alloy) {
      this.sendError(
        client.ws,
        `Not enough alloy to establish colony (requires ${COLONY_COST.alloy} alloy, have ${
          Math.floor(player.alloy * 100) / 100
        })`
      );
      return;
    }

    if (player.science < COLONY_COST.science) {
      this.sendError(
        client.ws,
        `Not enough science to establish colony (requires ${COLONY_COST.science} science, have ${
          Math.floor(player.science * 100) / 100
        })`
      );
      return;
    }

    // Deduct resources
    this.db.updatePlayerResources(
      player.id,
      player.energy - COLONY_COST.energy,
      player.alloy - COLONY_COST.alloy,
      player.science - COLONY_COST.science
    );

    // Calculate maximum population for this planet first
    const surfaceArea = 4 * Math.PI * planet.radius * planet.radius;
    
    // Calculate ice cap coverage to reduce habitable surface area
    const semiMajorAxis = planet.orbitalElements?.semiMajorAxis || 0;
    const iceCapCoverage = calculateIceCapCoverage(
      semiMajorAxis,
      planet.habitability,
      planet.id,
      planet.surfaceType,
      planet.hasAtmosphere
    );
    
    // Ice caps reduce available habitable surface area proportionally
    const habitableSurfaceFactor = 1 - iceCapCoverage;
    const maxPopulation = Math.floor(
      surfaceArea * BASE_POPULATION_DENSITY * planet.habitability * habitableSurfaceFactor
    );

    // Initial population should be 5-10% of max, with minimum of 5K
    const basePopulation = 10000;
    const populationMultiplier = 0.5 + planet.habitability * 0.5; // 0.5x to 1.0x based on habitability
    const targetInitialPopulation = Math.floor(basePopulation * populationMultiplier);
    
    // Ensure we don't start too close to max capacity (start at max 10% of capacity)
    const initialPopulation = Math.max(
      5000, // Minimum 5K population
      Math.min(targetInitialPopulation, Math.floor(maxPopulation * 0.1))
    );

    // Calculate resource yields based on population, specialization and habitability
    const habitabilityBonus = planet.habitability || 0.5;
    const yields = calculateColonyYields(
      initialPopulation,
      specialization,
      habitabilityBonus
    );

    // Get current game time
    const timeState = this.gameState.getGalaxyState(player.galaxyId);
    const currentTime = timeState ? timeState.currentTime : 0;

    // Determine appropriate stage based on initial population
    const colonyStage = getColonyStage(initialPopulation);

    // Create colony
    const colonyId = uuidv4();
    const colony: import("@constellation/shared").Colony = {
      id: colonyId,
      playerId: player.id,
      speciesId: player.speciesId,
      systemId: system.id,
      planetId: planet.id,
      planetName: planet.name,
      stage: colonyStage,
      specialization,
      population: initialPopulation,
      sciencePerDay: yields.sciencePerDay,
      alloyPerDay: yields.alloyPerDay,
      establishedAt: currentTime,
      lastYieldAt: currentTime,
    };

    this.db.createColony(colony);

    // Deduct 10,000 population from the most populated nearby colony
    // This represents colonists leaving from an existing world to establish the new colony
    const existingColonies = this.db.getColoniesByPlayerId(player.id);
    if (existingColonies.length > 1) { // More than just the newly created colony
      // Calculate distance in gate jumps from new colony to each existing colony
      interface ColonyDistance {
        colony: any;
        distance: number;
      }
      
      const coloniesWithDistance: ColonyDistance[] = [];
      
      for (const existingColony of existingColonies) {
        // Skip the newly created colony
        if (existingColony.id === colony.id) continue;
        
        // Calculate path length (number of gate jumps)
        const distance = this.calculateGateJumps(system.id, existingColony.systemId);
        
        if (distance !== null) {
          coloniesWithDistance.push({
            colony: existingColony,
            distance: distance,
          });
        }
      }
      
      if (coloniesWithDistance.length > 0) {
        // Sort by distance (closest first), then by population (most populated first)
        coloniesWithDistance.sort((a, b) => {
          if (a.distance !== b.distance) {
            return a.distance - b.distance;
          }
          return b.colony.population - a.colony.population;
        });
        
        // Deduct from the most populated among the closest
        const sourceColony = coloniesWithDistance[0].colony;
        const populationToDeduct = Math.min(10000, sourceColony.population);
        
        if (populationToDeduct > 0) {
          const newPopulation = sourceColony.population - populationToDeduct;
          
          // Get planet data for recalculating yields
          const sourceSystem = this.db.getStarSystem(sourceColony.systemId);
          if (sourceSystem) {
            const sourcePlanet = sourceSystem.planets.find(
              (p: any) => p.id === sourceColony.planetId
            );
            
            if (sourcePlanet && sourcePlanet.habitability) {
              // Recalculate yields
              const yields = calculateColonyYields(
                newPopulation,
                sourceColony.specialization,
                sourcePlanet.habitability
              );
              
              // Update the source colony with new population and yields
              const updatedSourceColony = {
                ...sourceColony,
                population: newPopulation,
                sciencePerDay: yields.sciencePerDay,
                alloyPerDay: yields.alloyPerDay,
              };
              
              this.db.updateColony(updatedSourceColony);
              
              console.log(
                `Colony ${sourceColony.planetName} sent ${populationToDeduct} colonists to ${planet.name} (${coloniesWithDistance[0].distance} jumps away)`
              );
            }
          }
        }
      }
    }

    // Send success message
    this.send(client.ws, {
      type: "colonyEstablished",
      colony,
    });

    // Reload system to include the new colony
    const updatedSystem = this.db.getStarSystem(system.id);
    if (updatedSystem) {
      updatedSystem.colonies = this.db.getColoniesBySystemId(system.id);
      this.send(client.ws, {
        type: "systemData",
        system: updatedSystem,
      });
    }

    // Send updated player data
    const updatedPlayer = this.db.getPlayerById(player.id);
    if (updatedPlayer) {
      this.send(client.ws, {
        type: "playerData",
        player: updatedPlayer,
      });
    }

    // Update resource flow for this player (colony affects flow)
    this.sendResourceFlowUpdate(client);
  }

  private handleRemoveColony(client: ClientConnection, planetId: string): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const player = this.db.getPlayerById(client.playerId);
    if (!player) {
      this.sendError(client.ws, "Player not found");
      return;
    }

    // Find the colony on this planet
    const colony = this.db
      .getColoniesByPlayerId(player.id)
      .find((c) => c.planetId === planetId);

    if (!colony) {
      this.sendError(client.ws, "No colony found on this planet");
      return;
    }

    // Delete the colony
    this.db.deleteColony(colony.id);

    console.log(
      `Colony removed from planet ${planetId} by player ${player.name}`
    );

    // Notify the client
    this.send(client.ws, {
      type: "colonyRemoved",
      planetId,
    });

    // Send updated player data (resources may have changed)
    const updatedPlayer = this.db.getPlayerById(player.id);
    if (updatedPlayer) {
      this.send(client.ws, {
        type: "playerData",
        player: updatedPlayer,
      });
    }
  }

  private handleUpdateColonySpecialization(
    client: ClientConnection,
    colonyId: string,
    specialization: "balanced" | "research" | "industrial"
  ): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const colony = this.db.getColonyById(colonyId);
    if (!colony) {
      this.sendError(client.ws, "Colony not found");
      return;
    }

    if (colony.playerId !== client.playerId) {
      this.sendError(client.ws, "You do not own this colony");
      return;
    }

    // Get planet for habitability bonus
    const system = this.db.getStarSystem(colony.systemId);
    if (!system) {
      this.sendError(client.ws, "System not found");
      return;
    }

    const planet = system.planets.find((p) => p.id === colony.planetId);
    if (!planet) {
      this.sendError(client.ws, "Planet not found");
      return;
    }

    const habitabilityBonus = planet.habitability || 0.5;

    // Calculate yields using the new population-based formula
    const yields = calculateColonyYields(
      colony.population,
      specialization,
      habitabilityBonus
    );

    colony.specialization = specialization;
    colony.sciencePerDay = yields.sciencePerDay;
    colony.alloyPerDay = yields.alloyPerDay;

    this.db.updateColony(colony);

    this.send(client.ws, {
      type: "colonyUpdated",
      colony,
    });

    // Send updated player data with new income rates
    const updatedPlayer = this.db.getPlayerById(client.playerId);
    if (updatedPlayer) {
      this.send(client.ws, {
        type: "playerData",
        player: updatedPlayer,
      });
    }
  }

  private handleRequestSpeciesInfo(
    client: ClientConnection,
    speciesId: string
  ): void {
    const species = this.db.getSpeciesById(speciesId);
    if (!species) {
      this.sendError(client.ws, "Species not found");
      return;
    }

    this.send(client.ws, {
      type: "speciesInfo",
      species,
    });
  }

  private handleFortifyGate(client: ClientConnection, gateId: string): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const player = this.db.getPlayerById(client.playerId);
    if (!player) {
      this.sendError(client.ws, "Player not found");
      return;
    }

    // Check if player owns the gate
    const gateOwner = this.db.getGateOwner(gateId);
    if (!gateOwner || gateOwner !== client.playerId) {
      this.sendError(client.ws, "You don't own this gate");
      return;
    }

    // Check resource costs (from game config)
    const ENERGY_COST = DEFENSE_PLATFORM_CONFIG.cost.energy;
    const ALLOY_COST = DEFENSE_PLATFORM_CONFIG.cost.alloy;
    const MAINTENANCE_PER_DAY = DEFENSE_PLATFORM_CONFIG.maintenance?.alloy ?? 0;

    if (player.energy < ENERGY_COST) {
      this.sendError(
        client.ws,
        `Not enough energy to fortify gate (requires ${ENERGY_COST} energy)`
      );
      return;
    }

    if (player.alloy < ALLOY_COST) {
      this.sendError(
        client.ws,
        `Not enough alloy to fortify gate (requires ${ALLOY_COST} alloy)`
      );
      return;
    }

    // Get the gate to find its system
    const gate = this.db.getGateById(gateId);
    if (!gate) {
      this.sendError(client.ws, "Gate not found");
      return;
    }

    // Deduct resources
    const energySuccess = this.db.deductPlayerEnergy(
      client.playerId,
      ENERGY_COST
    );
    const alloySuccess = this.db.deductPlayerAlloy(
      client.playerId,
      ALLOY_COST
    );

    if (!energySuccess || !alloySuccess) {
      this.sendError(client.ws, "Failed to deduct resources");
      return;
    }

    // Create defense platform with cost tracking
    const defenseId = uuidv4();
    
    // Apply "Shields" tech bonus if researched
    let platformHealth = DEFENSE_PLATFORM_CONFIG.stats.health;
    const techBonuses = this.db.getPlayerTechBonuses(client.playerId);
    if (techBonuses.defenseplatformDefenseBonus) {
      platformHealth = platformHealth * (1 + techBonuses.defenseplatformDefenseBonus);
      console.log(
        `Shields tech applied to defense platform: ${platformHealth} health (was ${DEFENSE_PLATFORM_CONFIG.stats.health})`
      );
    }
    
    this.db.createGateDefense(
      defenseId,
      gateId,
      client.playerId,
      gate.systemId,
      ENERGY_COST,
      ALLOY_COST,
      MAINTENANCE_PER_DAY,
      platformHealth
    );

    console.log(
      `Player ${player.name} fortified gate ${gate.name} with defense platform ${defenseId}`
    );

    // Send updated player data
    const updatedPlayer = this.db.getPlayerById(client.playerId);
    if (updatedPlayer) {
      this.send(client.ws, { type: "playerData", player: updatedPlayer });
    }

    // Send defense built message
    const now = Date.now();
    this.send(client.ws, {
      type: "gateDefenseBuilt",
      defense: {
        id: defenseId,
        gateId,
        playerId: client.playerId,
        systemId: gate.systemId,
        health: platformHealth,
        maxHealth: platformHealth,
        createdAt: now,
        energyCost: ENERGY_COST,
        alloyCost: ALLOY_COST,
        maintenanceAlloyPerDay: MAINTENANCE_PER_DAY,
        lastMaintenanceAt: now,
      },
    });

    // Broadcast to other players in the same system
    for (const otherClient of this.clients.values()) {
      if (
        otherClient.currentSystemId === gate.systemId &&
        otherClient.playerId !== client.playerId
      ) {
        this.send(otherClient.ws, {
          type: "gateDefenseBuilt",
          defense: {
            id: defenseId,
            gateId,
            playerId: client.playerId,
            systemId: gate.systemId,
            health: platformHealth,
            maxHealth: platformHealth,
            createdAt: now,
            energyCost: ENERGY_COST,
            alloyCost: ALLOY_COST,
            maintenanceAlloyPerDay: MAINTENANCE_PER_DAY,
            lastMaintenanceAt: now,
          },
        });
      }
    }
  }

  private handleAttackGate(client: ClientConnection, gateId: string): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const player = this.db.getPlayerById(client.playerId);
    if (!player) {
      this.sendError(client.ws, "Player not found");
      return;
    }

    // Get gate owner
    const gateOwnerId = this.db.getGateOwner(gateId);
    if (!gateOwnerId) {
      this.sendError(client.ws, "This gate has no owner");
      return;
    }

    if (gateOwnerId === client.playerId) {
      this.sendError(client.ws, "You cannot attack your own gate");
      return;
    }

    // Check relationship with gate owner - cannot attack friendly players
    const relationship = this.db.getPlayerRelationship(client.playerId, gateOwnerId);
    if (relationship === "friendly") {
      this.sendError(
        client.ws,
        "You cannot attack gates owned by friendly civilizations. Declare war first."
      );
      return;
    }

    // Allow multiple simultaneous attacks - removed blocking check
    // Players can spam attack button to send multiple waves

    // Check resource costs (from game config)
    const ENERGY_COST = ATTACK_SHIP_CONFIG.cost.energy;
    const ALLOY_COST = ATTACK_SHIP_CONFIG.cost.alloy;

    if (player.energy < ENERGY_COST) {
      this.sendError(
        client.ws,
        `Not enough energy to attack gate (requires ${ENERGY_COST} energy)`
      );
      return;
    }

    if (player.alloy < ALLOY_COST) {
      this.sendError(
        client.ws,
        `Not enough alloy to attack gate (requires ${ALLOY_COST} alloy)`
      );
      return;
    }

    // Get the gate to find its system
    const gate = this.db.getGateById(gateId);
    if (!gate) {
      this.sendError(client.ws, "Gate not found");
      return;
    }

    // Deduct resources
    const energySuccess = this.db.deductPlayerEnergy(
      client.playerId,
      ENERGY_COST
    );
    const alloySuccess = this.db.deductPlayerAlloy(
      client.playerId,
      ALLOY_COST
    );

    if (!energySuccess || !alloySuccess) {
      this.sendError(client.ws, "Failed to deduct resources");
      return;
    }

    // Get defenses
    const defenses = this.db.getGateDefenses(gateId);
    const attackShipCount = 1; // One ship per attack

    // Create attack with cost tracking
    const attackId = uuidv4();
    this.db.createGateAttack(
      attackId,
      gateId,
      client.playerId,
      gateOwnerId,
      gate.systemId,
      attackShipCount,
      ENERGY_COST,
      ALLOY_COST
    );

    console.log(
      `Player ${player.name} started attack on gate ${gate.name} with ${attackShipCount} ships against ${defenses.length} defense platforms`
    );

    // Send updated player data
    const updatedPlayer = this.db.getPlayerById(client.playerId);
    if (updatedPlayer) {
      this.send(client.ws, { type: "playerData", player: updatedPlayer });
    }

    // Send attack started message to all players in the system
    const attackData = {
      id: attackId,
      gateId,
      attackerId: client.playerId,
      defenderId: gateOwnerId,
      systemId: gate.systemId,
      attackShipCount,
      attackShipsRemaining: attackShipCount,
      status: "in_progress" as const,
      startedAt: Date.now(),
    };

    // Send to attacker
    this.send(client.ws, {
      type: "gateAttackStarted",
      attack: attackData,
    });

    // Broadcast to all players in the system
    for (const otherClient of this.clients.values()) {
      if (otherClient.currentSystemId === gate.systemId) {
        this.send(otherClient.ws, {
          type: "gateAttackStarted",
          attack: attackData,
        });
      }
    }

    // Simulate combat immediately and send results to client
    // Client will schedule visual effects based on approach time
    setTimeout(() => {
      this.simulateCombat(attackId, gateId, gate.systemId);
    }, 100);
  }

  private simulateCombat(
    attackId: string,
    gateId: string,
    systemId: string
  ): void {
    const attack = this.db.getGateAttack(attackId);
    if (!attack || attack.status !== "in_progress") {
      return;
    }

    const defenses = this.db.getGateDefenses(gateId);
    let attackShipsRemaining = attack.attackShipsRemaining;

    // Track ship health (300 HP each, tripled from base 100)
    let baseShipHealth = 300;
    
    // Apply "Shields" tech bonus if attacker has researched it
    const attackerTechBonuses = this.db.getPlayerTechBonuses(attack.attackerId);
    if (attackerTechBonuses.shipDefenseBonus) {
      baseShipHealth = baseShipHealth * (1 + attackerTechBonuses.shipDefenseBonus);
      console.log(
        `Shields tech applied to attack ships: ${baseShipHealth} health (was 300)`
      );
    }
    
    const shipHealth: number[] = [];
    for (let i = 0; i < attackShipsRemaining; i++) {
      shipHealth.push(baseShipHealth);
    }

    const combatEvents: Array<{
      time: number;
      type: string;
      targetId?: string;
      shipIndex?: number;
      damage?: number;
    }> = [];

    let currentTime = 0;
    const COMBAT_INTERVAL = 500; // 500ms between combat rounds

    // Combat simulation: ships vs defenses
    const aliveShips = () => shipHealth.filter((h) => h > 0).length;

    while (aliveShips() > 0 && defenses.some((d) => d.health > 0)) {
      currentTime += COMBAT_INTERVAL;

      // Each alive ship attacks a random defense platform
      for (let i = 0; i < shipHealth.length; i++) {
        if (shipHealth[i] <= 0) continue; // Skip destroyed ships

        const aliveDefenses = defenses.filter((d) => d.health > 0);
        if (aliveDefenses.length === 0) break;

        const target =
          aliveDefenses[Math.floor(Math.random() * aliveDefenses.length)];
        const hitChance = 0.6; // 60% chance to hit (can be modified by tech later)

        if (Math.random() < hitChance) {
          const damage = 10 + Math.random() * 20; // 10-30 damage
          target.health = Math.max(0, target.health - damage);

          combatEvents.push({
            time: currentTime,
            type: "shipHit",
            targetId: target.id,
            shipIndex: i,
            damage,
          });

          // Update defense health in database
          if (target.health <= 0) {
            // Get defense info before deleting for refund calculation
            const defenseInfo = this.db.getGateDefenseById(target.id);
            
            this.db.deleteGateDefense(target.id);
            combatEvents.push({
              time: currentTime,
              type: "defenseDestroyed",
              targetId: target.id,
            });

            // Refund resources to defender according to config
            if (defenseInfo && DEFENSE_PLATFORM_CONFIG.refundOnDestruction.energy) {
              this.db.addPlayerEnergy(defenseInfo.playerId, defenseInfo.energyCost);
              console.log(
                `Refunded ${defenseInfo.energyCost} energy to player ${defenseInfo.playerId} for destroyed defense platform`
              );
            }

            // Refund maintenance costs if configured
            if (defenseInfo && DEFENSE_PLATFORM_CONFIG.refundOnDestruction.maintenance) {
              const currentTime = Date.now();
              const timeSinceCreation = currentTime - defenseInfo.lastMaintenanceAt;
              const daysElapsed = timeSinceCreation / (24 * 60 * 60 * 1000);
              const totalMaintenancePaid = Math.floor(daysElapsed) * defenseInfo.maintenanceAlloyPerDay;
              
              if (totalMaintenancePaid > 0) {
                this.db.addPlayerAlloy(defenseInfo.playerId, totalMaintenancePaid);
                console.log(
                  `Refunded ${totalMaintenancePaid.toFixed(2)} alloy maintenance to player ${defenseInfo.playerId} for destroyed defense platform`
                );
              }
            }
          } else {
            this.db.updateGateDefenseHealth(target.id, target.health);
          }
        } else {
          combatEvents.push({
            time: currentTime,
            type: "shipMiss",
            shipIndex: i,
          });
        }
      }

      // Each defense platform returns fire at a random alive ship
      const aliveDefenses = defenses.filter((d) => d.health > 0);
      for (const defense of aliveDefenses) {
        if (aliveShips() <= 0) break;

        // Find alive ships
        const aliveShipIndices = shipHealth
          .map((h, i) => (h > 0 ? i : -1))
          .filter((i) => i >= 0);

        if (aliveShipIndices.length === 0) break;

        const targetShipIndex =
          aliveShipIndices[Math.floor(Math.random() * aliveShipIndices.length)];

        const hitChance = 0.5; // 50% chance to hit (can be modified by tech later)

        if (Math.random() < hitChance) {
          const damage = 10 + Math.random() * 20; // 10-30 damage
          shipHealth[targetShipIndex] = Math.max(
            0,
            shipHealth[targetShipIndex] - damage
          );

          combatEvents.push({
            time: currentTime,
            type: "defenseHit",
            targetId: defense.id,
            shipIndex: targetShipIndex,
            damage,
          });

          if (shipHealth[targetShipIndex] <= 0) {
            combatEvents.push({
              time: currentTime,
              type: "shipDestroyed",
              shipIndex: targetShipIndex,
            });
          }
        } else {
          combatEvents.push({
            time: currentTime,
            type: "defenseMiss",
            targetId: defense.id,
          });
        }
      }
    }

    // Update attackShipsRemaining based on ships still alive
    attackShipsRemaining = aliveShips();

    // Refund energy for destroyed attack ships (according to config)
    const shipsDestroyed = attack.attackShipCount - attackShipsRemaining;
    if (shipsDestroyed > 0 && ATTACK_SHIP_CONFIG.refundOnDestruction.energy) {
      // Get attack info from database for cost tracking
      const attackInfo = this.db.getGateAttack(attackId);
      if (attackInfo) {
        const energyCostPerShip = (attackInfo as any).energyCostPerShip ?? ATTACK_SHIP_CONFIG.cost.energy;
        const totalEnergyRefund = energyCostPerShip * shipsDestroyed;
        this.db.addPlayerEnergy(attack.attackerId, totalEnergyRefund);
        console.log(
          `Refunded ${totalEnergyRefund} energy to player ${attack.attackerId} for ${shipsDestroyed} destroyed attack ships`
        );
      }
    }

    // Refund alloy for surviving attack ships (they return home)
    if (attackShipsRemaining > 0) {
      const attackInfo = this.db.getGateAttack(attackId);
      if (attackInfo) {
        const alloyCostPerShip = (attackInfo as any).alloyCostPerShip ?? ATTACK_SHIP_CONFIG.cost.alloy;
        const totalAlloyRefund = alloyCostPerShip * attackShipsRemaining;
        this.db.addPlayerAlloy(attack.attackerId, totalAlloyRefund);
        console.log(
          `Refunded ${totalAlloyRefund} alloy to player ${attack.attackerId} for ${attackShipsRemaining} surviving attack ships`
        );
      }
    }

    // Determine outcome
    const status =
      attackShipsRemaining > 0 ? "attacker_victory" : "defender_victory";
    const completedAt = Date.now();

    // Log outcome - ownership does NOT change automatically
    // Attacker must use "Overtake" to claim the now-undefended gate
    if (status === "attacker_victory") {
      console.log(
        `Attacker won! Gate ${gateId} defenses destroyed. Attacker must use Overtake to claim ownership.`
      );
    } else {
      console.log(
        `Defender won! Gate ${gateId} remains defended by ${attack.defenderId}`
      );
    }

    // Update attack in database
    this.db.updateGateAttack(
      attackId,
      attackShipsRemaining,
      status,
      JSON.stringify(combatEvents),
      completedAt
    );

    // Send combat update to all players in the system
    const finalAttackData = this.db.getGateAttack(attackId);
    if (finalAttackData) {
      for (const client of this.clients.values()) {
        if (client.currentSystemId === systemId) {
          this.send(client.ws, {
            type: "gateAttackUpdate",
            attack: finalAttackData as any, // Type assertion for status field
          });
        }
      }
    }

    // Refresh system state for all players viewing this system
    // This ensures defense counts and tunnel ownership are updated
    for (const client of this.clients.values()) {
      if (client.currentSystemId === systemId && client.playerId) {
        this.handleRequestSystemState(client, systemId);
      }
    }

    // No ownership change on attack victory - attacker must use Overtake/Capture to claim gate
  }

  private handleCaptureGate(client: ClientConnection, gateId: string): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const player = this.db.getPlayerById(client.playerId);
    if (!player) {
      this.sendError(client.ws, "Player not found");
      return;
    }

    // Get the gate
    const gate = this.db.getGateById(gateId);
    if (!gate) {
      this.sendError(client.ws, "Gate not found");
      return;
    }

    // Check if THIS gate has defenses (only this gate matters for capture)
    const defenseCount = this.db.getGateDefenseCount(gateId);
    if (defenseCount > 0) {
      this.sendError(
        client.ws,
        "This gate is defended and cannot be captured peacefully"
      );
      return;
    }

    // Check if player already owns this gate
    const currentOwner = this.db.getGateOwner(gateId);
    if (currentOwner === client.playerId) {
      this.sendError(client.ws, "You already own this gate");
      return;
    }

    // Get current galaxy time
    const galaxy = this.db.getGalaxyById(player.galaxyId);
    if (!galaxy) {
      this.sendError(client.ws, "Galaxy not found");
      return;
    }
    const currentTime = galaxy.currentTime || 0;

    // Check cooldown (10 days = 10 * 86400 seconds)
    const COOLDOWN_PERIOD = 10 * 86400;
    const lastOvertakenAt = this.db.getGateLastOvertakenAt(gateId);
    const timeSinceLastOvertake = currentTime - lastOvertakenAt;

    if (lastOvertakenAt > 0 && timeSinceLastOvertake < COOLDOWN_PERIOD) {
      const remainingTime = COOLDOWN_PERIOD - timeSinceLastOvertake;
      const remainingDays = (remainingTime / 86400).toFixed(1);
      this.sendError(
        client.ws,
        `This gate was recently overtaken and is protected for ${remainingDays} more days`
      );
      return;
    }

    // Check resource costs for CAPTURE (only alloy required)
    const ALLOY_COST = 10;

    if (player.alloy < ALLOY_COST) {
      this.sendError(
        client.ws,
        `Not enough alloy to capture gate (requires ${ALLOY_COST} alloy)`
      );
      return;
    }

    // Deduct resources
    const alloySuccess = this.db.deductPlayerAlloy(client.playerId, ALLOY_COST);

    if (!alloySuccess) {
      this.sendError(client.ws, "Failed to deduct resources");
      return;
    }

    // Get system info for notification
    const system = this.db.getStarSystem(gate.systemId);
    const systemName = system?.star.name || "Unknown System";

    // Store previous owner before transferring
    const previousOwnerId = currentOwner;

    // Transfer ownership of ONLY this gate (not the destination gate)
    this.db.setGateOwnershipWithOvertake(gateId, client.playerId, currentTime);

    // Note: Tunnel power is now managed separately via tunnel overtake/power actions

    console.log(
      `Player ${player.name} captured gate ${gate.name} (single gate only)`
    );

    // Send updated player data
    const updatedPlayer = this.db.getPlayerById(client.playerId);
    if (updatedPlayer) {
      this.send(client.ws, { type: "playerData", player: updatedPlayer });
    }

    // Broadcast gate captured to all players in the galaxy
    const playerName = player.name;
    for (const otherClient of this.clients.values()) {
      if (otherClient.galaxyId === player.galaxyId && otherClient.playerId) {
        this.send(otherClient.ws, {
          type: "gateOvertaken", // Reuse same message type since UI handling is the same
          gateId,
          gateName: gate.name,
          systemName: systemName,
          newOwnerId: client.playerId,
          newOwnerName: playerName,
          previousOwnerId: previousOwnerId,
          overtakeTime: currentTime,
        });

        // Refresh system data for ALL players viewing this system
        // This ensures tunnel ownership information is updated correctly
        if (otherClient.currentSystemId === gate.systemId) {
          this.handleRequestSystemState(
            otherClient,
            otherClient.currentSystemId
          );
        }

        // Also refresh for players in the CONNECTED system (destination)
        if (gate.tunnelId) {
          const gatesInTunnel = this.db.getGatesByTunnel(gate.tunnelId);
          const destinationGate = gatesInTunnel.find((g) => g.id !== gate.id);
          if (
            destinationGate &&
            otherClient.currentSystemId === destinationGate.systemId
          ) {
            this.handleRequestSystemState(
              otherClient,
              otherClient.currentSystemId
            );
          }
        }
      }
    }
  }

  private handleOvertakeGate(client: ClientConnection, gateId: string): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const player = this.db.getPlayerById(client.playerId);
    if (!player) {
      this.sendError(client.ws, "Player not found");
      return;
    }

    // Get the gate
    const gate = this.db.getGateById(gateId);
    if (!gate) {
      this.sendError(client.ws, "Gate not found");
      return;
    }

    // Check if gate has defenses
    const defenseCount = this.db.getGateDefenseCount(gateId);
    if (defenseCount > 0) {
      this.sendError(
        client.ws,
        "This gate is defended and cannot be overtaken peacefully"
      );
      return;
    }

    // Check if destination gate has defenses (both ends must be undefended)
    // Find the other gate in the tunnel
    if (gate.tunnelId) {
      const gatesInTunnel = this.db.getGatesByTunnel(gate.tunnelId);
      const destinationGate = gatesInTunnel.find((g) => g.id !== gate.id);
      if (destinationGate) {
        const destinationDefenseCount = this.db.getGateDefenseCount(
          destinationGate.id
        );
        if (destinationDefenseCount > 0) {
          this.sendError(
            client.ws,
            `Cannot overtake: destination gate has ${destinationDefenseCount} defense platform(s). Both ends of the wormhole must be undefended.`
          );
          return;
        }
      }
    }

    // Check if player already owns this gate
    const currentOwner = this.db.getGateOwner(gateId);
    if (currentOwner === client.playerId) {
      this.sendError(client.ws, "You already own this gate");
      return;
    }

    // Get current galaxy time
    const galaxy = this.db.getGalaxyById(player.galaxyId);
    if (!galaxy) {
      this.sendError(client.ws, "Galaxy not found");
      return;
    }
    const currentTime = galaxy.currentTime || 0;

    // Check cooldown (10 days = 10 * 86400 seconds)
    const COOLDOWN_PERIOD = 10 * 86400;
    const lastOvertakenAt = this.db.getGateLastOvertakenAt(gateId);
    const timeSinceLastOvertake = currentTime - lastOvertakenAt;

    if (lastOvertakenAt > 0 && timeSinceLastOvertake < COOLDOWN_PERIOD) {
      const remainingTime = COOLDOWN_PERIOD - timeSinceLastOvertake;
      const remainingDays = (remainingTime / 86400).toFixed(1);
      this.sendError(
        client.ws,
        `This gate was recently overtaken and is protected for ${remainingDays} more days`
      );
      return;
    }

    // Check resource costs for OVERTAKE (higher than capture)
    const ENERGY_COST = GAME_COSTS.TUNNEL_OVERTAKE.energy;
    const SCIENCE_COST = GAME_COSTS.TUNNEL_OVERTAKE.science;

    if (player.energy < ENERGY_COST) {
      this.sendError(
        client.ws,
        `Not enough energy to overtake tunnel (requires ${ENERGY_COST} energy)`
      );
      return;
    }

    if (player.science < SCIENCE_COST) {
      this.sendError(
        client.ws,
        `Not enough science to overtake tunnel (requires ${SCIENCE_COST} science)`
      );
      return;
    }

    // Get the destination gate (we need both gates for overtake)
    if (!gate.tunnelId) {
      this.sendError(client.ws, "Gate is not connected to a tunnel");
      return;
    }

    const gatesInTunnel = this.db.getGatesByTunnel(gate.tunnelId);
    const destinationGate = gatesInTunnel.find((g) => g.id !== gate.id);
    if (!destinationGate) {
      this.sendError(client.ws, "Could not find destination gate in tunnel");
      return;
    }

    // Deduct resources
    const energySuccess = this.db.deductPlayerEnergy(
      client.playerId,
      ENERGY_COST
    );
    const scienceSuccess = this.db.deductPlayerScience(
      client.playerId,
      SCIENCE_COST
    );

    if (!energySuccess || !scienceSuccess) {
      this.sendError(client.ws, "Failed to deduct resources");
      return;
    }

    // Get system info for notification
    const system = this.db.getStarSystem(gate.systemId);
    const systemName = system?.star.name || "Unknown System";
    const destinationSystem = this.db.getStarSystem(destinationGate.systemId);
    const destinationSystemName =
      destinationSystem?.star.name || "Unknown System";

    // Store previous owners before transferring
    const previousOwnerId = currentOwner;
    const previousDestinationOwnerId = this.db.getGateOwner(destinationGate.id);

    // Transfer ownership of BOTH gates with overtake timestamp
    this.db.setGateOwnershipWithOvertake(gateId, client.playerId, currentTime);
    this.db.setGateOwnershipWithOvertake(
      destinationGate.id,
      client.playerId,
      currentTime
    );

    // Transfer tunnel power to the overtaker
    // If tunnel is currently powered by someone else, refund them
    const tunnel = this.db.getTunnelById(gate.tunnelId);
    if (tunnel && tunnel.poweredByPlayerId && tunnel.poweredByPlayerId !== client.playerId) {
      // Refund the previous power provider
      if (tunnel.powerCostEnergy > 0) {
        this.db.addPlayerEnergy(tunnel.poweredByPlayerId, tunnel.powerCostEnergy);
        const previousPowerOwner = this.db.getPlayerById(tunnel.poweredByPlayerId);
        if (previousPowerOwner) {
          console.log(
            `Refunded ${tunnel.powerCostEnergy} energy to ${previousPowerOwner.name} (tunnel overtaken)`
          );
          // Send updated player data to previous power owner
          const prevOwnerClient = Array.from(this.clients.values()).find(
            (c) => c.playerId === tunnel.poweredByPlayerId
          );
          if (prevOwnerClient) {
            const updatedPrevOwner = this.db.getPlayerById(tunnel.poweredByPlayerId);
            if (updatedPrevOwner) {
              this.send(prevOwnerClient.ws, { type: "playerData", player: updatedPrevOwner });
            }
          }
        }
      }
    }

    // Set tunnel power to the overtaker (costs ENERGY_COST to maintain)
    this.db.setTunnelPower(gate.tunnelId, client.playerId, ENERGY_COST);

    console.log(
      `Player ${player.name} overtook ENTIRE TUNNEL: ${gate.name} <-> ${destinationGate.name} (both gates + tunnel power)`
    );

    // Send updated player data
    const updatedPlayer = this.db.getPlayerById(client.playerId);
    if (updatedPlayer) {
      this.send(client.ws, { type: "playerData", player: updatedPlayer });
    }

    // Broadcast gate overtaken to all players in the galaxy for BOTH gates
    const playerName = player.name;
    for (const otherClient of this.clients.values()) {
      if (otherClient.galaxyId === player.galaxyId && otherClient.playerId) {
        // Send notification for the origin gate
        this.send(otherClient.ws, {
          type: "gateOvertaken",
          gateId,
          gateName: gate.name,
          systemName: systemName,
          newOwnerId: client.playerId,
          newOwnerName: playerName,
          previousOwnerId: previousOwnerId,
          overtakeTime: currentTime,
        });

        // Send notification for the destination gate
        this.send(otherClient.ws, {
          type: "gateOvertaken",
          gateId: destinationGate.id,
          gateName: destinationGate.name,
          systemName: destinationSystemName,
          newOwnerId: client.playerId,
          newOwnerName: playerName,
          previousOwnerId: previousDestinationOwnerId,
          overtakeTime: currentTime,
        });

        // Refresh system data for ALL players viewing EITHER system
        if (
          otherClient.currentSystemId === gate.systemId ||
          otherClient.currentSystemId === destinationGate.systemId
        ) {
          this.handleRequestSystemState(
            otherClient,
            otherClient.currentSystemId
          );
        }
      }
    }
  }

  private handleOvertakeTunnel(client: ClientConnection, tunnelId: string): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const player = this.db.getPlayerById(client.playerId);
    if (!player) {
      this.sendError(client.ws, "Player not found");
      return;
    }

    // Get the tunnel
    const tunnel = this.db.getTunnelById(tunnelId);
    if (!tunnel) {
      this.sendError(client.ws, "Tunnel not found");
      return;
    }

    // Check if tunnel is already powered by this player
    if (tunnel.poweredByPlayerId === client.playerId) {
      this.sendError(client.ws, "You are already powering this tunnel");
      return;
    }

    // Check resource costs (same as GAME_COSTS.TUNNEL_OVERTAKE)
    const ENERGY_COST = 3;
    const SCIENCE_COST = 10;

    if (player.energy < ENERGY_COST) {
      this.sendError(
        client.ws,
        `Not enough energy to overtake tunnel power (requires ${ENERGY_COST} energy)`
      );
      return;
    }

    if (player.science < SCIENCE_COST) {
      this.sendError(
        client.ws,
        `Not enough science to overtake tunnel power (requires ${SCIENCE_COST} science)`
      );
      return;
    }

    // If tunnel is currently powered, refund the previous owner
    if (tunnel.poweredByPlayerId && tunnel.powerCostEnergy > 0) {
      this.db.addPlayerEnergy(tunnel.poweredByPlayerId, tunnel.powerCostEnergy);
      const previousOwner = this.db.getPlayerById(tunnel.poweredByPlayerId);
      if (previousOwner) {
        console.log(
          `Refunded ${tunnel.powerCostEnergy} energy to ${previousOwner.name} (tunnel power taken over)`
        );
        // Send updated player data to previous owner
        const prevOwnerClient = Array.from(this.clients.values()).find(
          (c) => c.playerId === tunnel.poweredByPlayerId
        );
        if (prevOwnerClient) {
          const updatedPrevOwner = this.db.getPlayerById(tunnel.poweredByPlayerId);
          if (updatedPrevOwner) {
            this.send(prevOwnerClient.ws, { type: "playerData", player: updatedPrevOwner });
          }
        }
      }
    }

    // Deduct resources from new owner
    const energySuccess = this.db.deductPlayerEnergy(client.playerId, ENERGY_COST);
    const scienceSuccess = this.db.deductPlayerScience(client.playerId, SCIENCE_COST);

    if (!energySuccess || !scienceSuccess) {
      this.sendError(client.ws, "Failed to deduct resources");
      return;
    }

    // Set tunnel power to this player
    this.db.setTunnelPower(tunnelId, client.playerId, ENERGY_COST);

    console.log(
      `Player ${player.name} took over power supply for tunnel ${tunnelId}`
    );

    // Send updated player data
    const updatedPlayer = this.db.getPlayerById(client.playerId);
    if (updatedPlayer) {
      this.send(client.ws, { type: "playerData", player: updatedPlayer });
    }

    // Refresh system data for all players viewing systems connected by this tunnel
    const gatesInTunnel = this.db.getGatesByTunnel(tunnelId);
    for (const gate of gatesInTunnel) {
      for (const otherClient of this.clients.values()) {
        if (otherClient.galaxyId === player.galaxyId && 
            otherClient.currentSystemId === gate.systemId) {
          this.handleRequestSystemState(otherClient, otherClient.currentSystemId);
        }
      }
    }

    // Explicitly broadcast resource flow updates to ensure flow changes are reflected
    // Taking over tunnel power may change whether resources flow or are blockaded
    this.broadcastResourceFlowUpdates(player.galaxyId);
  }

  private handlePowerOffTunnel(client: ClientConnection, tunnelId: string): void {
    console.log(`[handlePowerOffTunnel] START for tunnel ${tunnelId}, player ${client.playerId}`);
    
    if (!client.playerId) {
      console.log(`[handlePowerOffTunnel] ERROR: Not authenticated`);
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const player = this.db.getPlayerById(client.playerId);
    if (!player) {
      console.log(`[handlePowerOffTunnel] ERROR: Player not found`);
      this.sendError(client.ws, "Player not found");
      return;
    }

    // Get the tunnel
    const tunnel = this.db.getTunnelById(tunnelId);
    if (!tunnel) {
      console.log(`[handlePowerOffTunnel] ERROR: Tunnel not found: ${tunnelId}`);
      this.sendError(client.ws, "Tunnel not found");
      return;
    }

    console.log(`[handlePowerOffTunnel] Tunnel found, powered by: ${tunnel.poweredByPlayerId}, current player: ${client.playerId}`);

    // Check if player is currently powering this tunnel
    if (tunnel.poweredByPlayerId !== client.playerId) {
      console.log(`[handlePowerOffTunnel] ERROR: Player is not powering this tunnel`);
      this.sendError(client.ws, "You are not currently powering this tunnel");
      return;
    }

    // Refund the energy cost
    if (tunnel.powerCostEnergy > 0) {
      this.db.addPlayerEnergy(client.playerId, tunnel.powerCostEnergy);
      console.log(
        `Refunded ${tunnel.powerCostEnergy} energy to ${player.name} (powered off tunnel)`
      );
    }

    // Remove tunnel power but keep the cost (will be charged again when powering on)
    this.db.setTunnelPower(tunnelId, null, tunnel.powerCostEnergy);

    console.log(
      `Player ${player.name} powered off tunnel ${tunnelId}`
    );

    // Send updated player data
    const updatedPlayer = this.db.getPlayerById(client.playerId);
    if (updatedPlayer) {
      this.send(client.ws, { type: "playerData", player: updatedPlayer });
    }

    // Refresh system data for all players viewing systems connected by this tunnel
    const gatesInTunnel = this.db.getGatesByTunnel(tunnelId);
    for (const gate of gatesInTunnel) {
      for (const otherClient of this.clients.values()) {
        if (otherClient.galaxyId === player.galaxyId && 
            otherClient.currentSystemId === gate.systemId) {
          this.handleRequestSystemState(otherClient, otherClient.currentSystemId);
        }
      }
    }

    // Explicitly broadcast resource flow updates to ensure blockade status is updated
    // This ensures the UI immediately reflects that resources are now blocked
    this.broadcastResourceFlowUpdates(player.galaxyId);
  }

  private handlePowerOnTunnel(client: ClientConnection, tunnelId: string): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const player = this.db.getPlayerById(client.playerId);
    if (!player) {
      this.sendError(client.ws, "Player not found");
      return;
    }

    // Get the tunnel
    const tunnel = this.db.getTunnelById(tunnelId);
    if (!tunnel) {
      this.sendError(client.ws, "Tunnel not found");
      return;
    }

    // Check if tunnel is already powered
    if (tunnel.poweredByPlayerId) {
      this.sendError(client.ws, "Tunnel is already powered by another player");
      return;
    }

    // Check if player owns at least one gate in the tunnel
    const gatesInTunnel = this.db.getGatesByTunnel(tunnelId);
    const playerOwnsGate = gatesInTunnel.some(gate => {
      const gateOwnerId = this.db.getGateOwner(gate.id);
      return gateOwnerId === client.playerId;
    });

    if (!playerOwnsGate) {
      this.sendError(client.ws, "You must own at least one gate in this tunnel to power it");
      return;
    }

    // Check if player has enough energy to power on the tunnel
    const powerCost = tunnel.powerCostEnergy || 0;
    if (player.energy < powerCost) {
      this.sendError(
        client.ws,
        `Not enough energy to power on tunnel (requires ${powerCost} energy)`
      );
      return;
    }

    // Deduct energy cost if any
    if (powerCost > 0) {
      this.db.deductPlayerEnergy(client.playerId, powerCost);
      console.log(
        `Player ${player.name} paid ${powerCost} energy to power on tunnel ${tunnelId}`
      );
    }

    // Power on the tunnel
    this.db.setTunnelPower(tunnelId, client.playerId, powerCost);

    console.log(
      `Player ${player.name} powered on tunnel ${tunnelId}`
    );

    // Send updated player data
    const updatedPlayer = this.db.getPlayerById(client.playerId);
    if (updatedPlayer) {
      this.send(client.ws, { type: "playerData", player: updatedPlayer });
    }

    // Refresh system data for all players viewing systems connected by this tunnel
    for (const gate of gatesInTunnel) {
      for (const otherClient of this.clients.values()) {
        if (otherClient.galaxyId === player.galaxyId && 
            otherClient.currentSystemId === gate.systemId) {
          this.handleRequestSystemState(otherClient, otherClient.currentSystemId);
        }
      }
    }

    // Explicitly broadcast resource flow updates to ensure flow is restored
    // This ensures the UI immediately reflects that resources are now flowing
    this.broadcastResourceFlowUpdates(player.galaxyId);
  }

  private handleOverchargeTunnel(client: ClientConnection, tunnelId: string): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const player = this.db.getPlayerById(client.playerId);
    if (!player) {
      this.sendError(client.ws, "Player not found");
      return;
    }

    // Get the tunnel
    const tunnel = this.db.getTunnelById(tunnelId);
    if (!tunnel) {
      this.sendError(client.ws, "Tunnel not found");
      return;
    }

    // Check if player is currently powering this tunnel
    if (tunnel.poweredByPlayerId !== client.playerId) {
      this.sendError(client.ws, "You are not currently powering this tunnel");
      return;
    }

    // Check resource costs
    const ENERGY_COST = GAME_COSTS.TUNNEL_OVERCHARGE.energy;
    const SCIENCE_COST = GAME_COSTS.TUNNEL_OVERCHARGE.science;

    if (player.energy < ENERGY_COST) {
      this.sendError(
        client.ws,
        `Not enough energy to overcharge tunnel (requires ${ENERGY_COST} energy)`
      );
      return;
    }

    if (player.science < SCIENCE_COST) {
      this.sendError(
        client.ws,
        `Not enough science to overcharge tunnel (requires ${SCIENCE_COST} science)`
      );
      return;
    }

    // Get current game time
    const galaxy = this.db.getGalaxyById(player.galaxyId);
    if (!galaxy) {
      this.sendError(client.ws, "Galaxy not found");
      return;
    }
    const currentTime = galaxy.currentTime || 0;

    // Deduct resources
    const energySuccess = this.db.deductPlayerEnergy(client.playerId, ENERGY_COST);
    const scienceSuccess = this.db.deductPlayerScience(client.playerId, SCIENCE_COST);

    if (!energySuccess || !scienceSuccess) {
      this.sendError(client.ws, "Failed to deduct resources");
      return;
    }

    // Get both gates in the tunnel
    const gatesInTunnel = this.db.getGatesByTunnel(tunnelId);
    if (gatesInTunnel.length !== 2) {
      this.sendError(client.ws, "Invalid tunnel structure");
      return;
    }

    const gateA = gatesInTunnel[0];
    const gateB = gatesInTunnel[1];

    // Destroy all defense platforms on both gates
    const defenseCountA = this.db.getGateDefenseCount(gateA.id);
    const defenseCountB = this.db.getGateDefenseCount(gateB.id);
    const totalDefensesDestroyed = defenseCountA + defenseCountB;

    if (defenseCountA > 0) {
      const defensesA = this.db.getGateDefenses(gateA.id);
      for (const defense of defensesA) {
        this.db.deleteGateDefense(defense.id);
      }
    }

    if (defenseCountB > 0) {
      const defensesB = this.db.getGateDefenses(gateB.id);
      for (const defense of defensesB) {
        this.db.deleteGateDefense(defense.id);
      }
    }

    // Destroy any ongoing attacks at both gates
    const attackA = this.db.getActiveGateAttack(gateA.id);
    const attackB = this.db.getActiveGateAttack(gateB.id);
    let totalAttacksDestroyed = 0;

    if (attackA) {
      // Mark attack as defender victory (overcharge destroyed all attacking ships)
      this.db.updateGateAttack(
        attackA.id,
        0, // No ships remaining
        "defender_victory",
        JSON.stringify({ result: "Tunnel overcharged - all attacking ships destroyed" }),
        currentTime
      );
      totalAttacksDestroyed++;
    }

    if (attackB) {
      this.db.updateGateAttack(
        attackB.id,
        0,
        "defender_victory",
        JSON.stringify({ result: "Tunnel overcharged - all attacking ships destroyed" }),
        currentTime
      );
      totalAttacksDestroyed++;
    }

    // Set tunnel as overcharged and power it off
    this.db.setTunnelOvercharged(tunnelId, currentTime);

    console.log(
      `Player ${player.name} OVERCHARGED tunnel ${tunnelId} - Destroyed ${totalDefensesDestroyed} defenses and ${totalAttacksDestroyed} attacks. 1-year cooldown activated.`
    );

    // Send updated player data
    const updatedPlayer = this.db.getPlayerById(client.playerId);
    if (updatedPlayer) {
      this.send(client.ws, { type: "playerData", player: updatedPlayer });
    }

    // Broadcast to all players in the galaxy
    for (const otherClient of this.clients.values()) {
      if (otherClient.galaxyId === player.galaxyId) {
        // Refresh system data for players viewing either system
        if (
          otherClient.currentSystemId === gateA.systemId ||
          otherClient.currentSystemId === gateB.systemId
        ) {
          this.handleRequestSystemState(otherClient, otherClient.currentSystemId);
        }
      }
    }

    // Explicitly broadcast resource flow updates to ensure blockade status is updated
    // Overcharge powers off the tunnel, so resources should now be blocked
    this.broadcastResourceFlowUpdates(player.galaxyId);
  }

  private handleDebugConnectGate(
    client: ClientConnection,
    gateId: string
  ): void {
    console.log(`[Server] handleDebugConnectGate called for gate: ${gateId}`);
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const player = this.db.getPlayerById(client.playerId);
    if (!player) {
      this.sendError(client.ws, "Player not found");
      return;
    }

    // Get the gate
    const gate = this.db.getGateById(gateId);
    if (!gate) {
      this.sendError(client.ws, "Gate not found");
      return;
    }

    // Check if gate is already explored by current player
    const isExplored = player.exploredGateIds?.includes(gateId) ?? false;
    if (isExplored) {
      this.sendError(client.ws, "Cannot connect an already explored gate");
      return;
    }

    // Find all other players in this galaxy
    const allPlayers = this.db.getPlayersByGalaxyId(player.galaxyId);
    const otherPlayers = allPlayers.filter((p) => p.id !== client.playerId);

    if (otherPlayers.length === 0) {
      this.sendError(client.ws, "No other players found in this galaxy");
      return;
    }

    // Get all tunnels connected to the current player's home system
    const existingTunnels = this.db.getTunnelsBySystem(player.homeSystemId);
    
    // Find all system IDs already connected to the current player
    const connectedSystemIds = new Set<string>();
    for (const tunnel of existingTunnels) {
      // Add the other system in each tunnel
      if (tunnel.systemAId === player.homeSystemId) {
        connectedSystemIds.add(tunnel.systemBId);
      } else {
        connectedSystemIds.add(tunnel.systemAId);
      }
    }

    // Filter out players whose home systems are already connected
    const availablePlayers = otherPlayers.filter(
      (p) => !connectedSystemIds.has(p.homeSystemId)
    );

    if (availablePlayers.length === 0) {
      this.sendError(
        client.ws,
        "All other civilizations are already connected to your civilization"
      );
      return;
    }

    // Try to find another player's unexplored gate
    let targetGate = null;
    let targetPlayer = null;

    for (const otherPlayer of availablePlayers) {
      // Get all gates in the galaxy
      const allGates = this.db.getGatesByGalaxyId(player.galaxyId);

      // Filter to gates that:
      // 1. Are in the other player's current system
      // 2. Are NOT explored by the other player (so we can link them)
      // 3. Are NOT the same gate we're trying to connect
      const unexploredGates = allGates.filter(
        (g) =>
          g.systemId === otherPlayer.currentSystemId &&
          !(otherPlayer.exploredGateIds?.includes(g.id) ?? false) &&
          g.id !== gateId
      );

      if (unexploredGates.length > 0) {
        targetGate = unexploredGates[0];
        targetPlayer = otherPlayer;
        break;
      }
    }

    if (!targetGate || !targetPlayer) {
      this.sendError(
        client.ws,
        "Could not find a suitable unexplored gate from another civilization"
      );
      return;
    }

    // Create a tunnel between the two gates
    const systemA =
      gate.systemId < targetGate.systemId ? gate.systemId : targetGate.systemId;
    const systemB =
      gate.systemId < targetGate.systemId ? targetGate.systemId : gate.systemId;
    const tunnelId = `tunnel_${systemA}_${systemB}`;

    // Create tunnel if it doesn't exist
    this.db.createTunnel({
      id: tunnelId,
      systemAId: systemA,
      systemBId: systemB,
      poweredByPlayerId: null,
      powerCostEnergy: 0,
      overchargedAt: 0,
      createdAt: Date.now(),
    });

    // Update both gates with their new destinations and tunnel ID
    const updateStmt = this.db
      .rawDb()
      .prepare(
        "UPDATE star_gates SET destination_system_id = ?, tunnel_id = ? WHERE id = ?"
      );
    updateStmt.run(targetGate.systemId, tunnelId, gateId);
    updateStmt.run(gate.systemId, tunnelId, targetGate.id);

    // Mark both gates as explored for BOTH players (they can now see each other)
    this.db.markGateExploredSingle(player.id, gateId);
    this.db.markGateExploredSingle(player.id, targetGate.id);
    this.db.markGateExploredSingle(targetPlayer.id, gateId);
    this.db.markGateExploredSingle(targetPlayer.id, targetGate.id);

    // Set gate ownership: each player owns their respective gate
    // This ensures gates show as "Controlled" instead of "Uncontrolled"
    this.db.setGateOwnership(gateId, player.id);
    this.db.setGateOwnership(targetGate.id, targetPlayer.id);

    // Auto-power tunnel when first connecting civilizations
    // The initiating player powers the tunnel automatically
    const tunnel = this.db.getTunnelById(tunnelId);
    if (tunnel && !tunnel.poweredByPlayerId) {
      // Check if player has enough energy to power tunnel
      const OPEN_ENERGY_COST = GAME_COSTS.TUNNEL_POWER_ON.energy;
      if (player.energy >= OPEN_ENERGY_COST) {
        this.db.deductPlayerEnergy(player.id, OPEN_ENERGY_COST);
        this.db.setTunnelPower(tunnelId, player.id, OPEN_ENERGY_COST);
        console.log(
          `[Debug] Player ${player.name} auto-powered tunnel ${tunnelId} (${OPEN_ENERGY_COST} energy)`
        );
      } else {
        console.log(
          `[Debug] Player ${player.name} cannot auto-power tunnel - insufficient energy`
        );
      }
    }

    console.log(
      `[Debug] Connected gate ${gate.name} (${gate.systemId}) to ${targetGate.name} (${targetGate.systemId}), linking civilizations: ${player.name} <-> ${targetPlayer.name}`
    );

    // Send success message
    this.send(client.ws, {
      type: "error", // We'll use error channel for info messages
      message: `Connected to ${targetPlayer.name}'s civilization! Gate now leads to their system.`,
    });

    // Reload the current system to reflect the updated gate for the initiating player
    const system = this.db.getStarSystem(player.currentSystemId);
    if (system) {
      this.gameState.loadSystem(system);

      const gateOwnership = this.db.getGateOwnershipForSystem(
        client.playerId,
        system.id
      );

      const tunnelOwnership = this.db.getTunnelOwnershipForSystem(
        client.playerId,
        system.id
      );

      // Get updated player data with new explored gates
      const updatedPlayer = this.db.getPlayerById(player.id);

      this.send(client.ws, {
        type: "systemData",
        system,
        gateOwnership: gateOwnership.length > 0 ? gateOwnership : undefined,
        tunnelOwnership:
          tunnelOwnership.length > 0 ? tunnelOwnership : undefined,
      });

      // Send updated player data so client knows about newly explored gates
      if (updatedPlayer) {
        this.send(client.ws, {
          type: "playerData",
          player: updatedPlayer,
        });
      }
    }

    // Also notify the target player if they're online
    // Send update regardless of where they are (system view or constellation view)
    const targetClient = Array.from(this.clients.values()).find(
      (c) => c.playerId === targetPlayer.id
    );
    if (targetClient) {
      // Send notification message
      this.send(targetClient.ws, {
        type: "error",
        message: `${player.name}'s civilization has connected to your gate!`,
      });

      // If they're in the connected system, send full system update
      if (targetPlayer.currentSystemId === targetGate.systemId) {
        const targetSystem = this.db.getStarSystem(targetPlayer.currentSystemId);
        if (targetSystem) {
          this.gameState.loadSystem(targetSystem);

          const targetGateOwnership = this.db.getGateOwnershipForSystem(
            targetPlayer.id,
            targetSystem.id
          );

          const targetTunnelOwnership = this.db.getTunnelOwnershipForSystem(
            targetPlayer.id,
            targetSystem.id
          );

          // Get updated player data with new explored gates
          const updatedTargetPlayer = this.db.getPlayerById(targetPlayer.id);

          this.send(targetClient.ws, {
            type: "systemData",
            system: targetSystem,
            gateOwnership:
              targetGateOwnership.length > 0 ? targetGateOwnership : undefined,
            tunnelOwnership:
              targetTunnelOwnership.length > 0
                ? targetTunnelOwnership
                : undefined,
          });

          // Send updated player data so client knows about newly explored gates
          if (updatedTargetPlayer) {
            this.send(targetClient.ws, {
              type: "playerData",
              player: updatedTargetPlayer,
            });
          }
        }
      }
    }
  }

  private handleRequestResourceBreakdown(client: ClientConnection): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const player = this.db.getPlayerById(client.playerId);
    if (!player) {
      this.sendError(client.ws, "Player not found");
      return;
    }

    // Calculate resource flow to get blockade information
    const flow = calculatePlayerResourceFlow(this.db, client.playerId);

    // Get all mining operations for this player
    const miningOps = this.db.getMiningOperationsByPlayer(client.playerId);
    
    // Get all colonies for this player
    const colonies = this.db.getColoniesByPlayerId(client.playerId);

    // Group by system
    const systemMap = new Map<string, {
      systemId: string;
      systemName: string;
      starName: string;
      alloyPerDay: number;
    }>();

    // Helper function to check if a system is blockaded
    const isSystemBlockaded = (systemId: string): boolean => {
      if (systemId === player.homeSystemId) return false; // Home system is never blockaded
      
      const path = findGatePath(this.db, systemId, player.homeSystemId);
      if (!path) return true; // No path = blockaded
      
      // Check if any tunnel in the path is blockaded
      for (const gateId of path) {
        const gate = this.db.getGateById(gateId);
        if (!gate || !gate.tunnelId) continue;
        const tunnelFlow = flow.tunnelFlows.get(gate.tunnelId);
        if (tunnelFlow && tunnelFlow.isBlockaded) {
          return true;
        }
      }
      return false;
    };

    // Process mining operations
    for (const op of miningOps) {
      // Skip blockaded systems
      if (isSystemBlockaded(op.systemId)) continue;
      
      if (!systemMap.has(op.systemId)) {
        const system = this.db.getStarSystem(op.systemId);
        if (!system) continue;
        
        systemMap.set(op.systemId, {
          systemId: op.systemId,
          systemName: system.star.name,
          starName: system.star.name,
          alloyPerDay: 0,
        });
      }

      const systemData = systemMap.get(op.systemId)!;
      systemData.alloyPerDay += op.alloyPerDay;
    }

    // Process colonies
    for (const colony of colonies) {
      // Skip blockaded systems (only for positive production)
      if (colony.alloyPerDay > 0 && isSystemBlockaded(colony.systemId)) continue;
      
      if (!systemMap.has(colony.systemId)) {
        const system = this.db.getStarSystem(colony.systemId);
        if (!system) continue;
        
        systemMap.set(colony.systemId, {
          systemId: colony.systemId,
          systemName: system.star.name,
          starName: system.star.name,
          alloyPerDay: 0,
        });
      }

      const systemData = systemMap.get(colony.systemId)!;
      systemData.alloyPerDay += colony.alloyPerDay;
    }

    // Convert map to array and send
    const breakdown = Array.from(systemMap.values());
    
    this.send(client.ws, {
      type: "resourceBreakdown",
      breakdown,
    });
  }

  private async handleRequestTechTree(client: ClientConnection): Promise<void> {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const player = this.db.getPlayerById(client.playerId);
    if (!player) {
      this.sendError(client.ws, "Player not found");
      return;
    }

    // Get completed technologies
    const completedTechs = this.db.getCompletedTechnologies(client.playerId);

    // Get current research
    const currentResearch = this.db.getCurrentResearch(client.playerId);

    // Build response
    let currentResearchData: {
      technologyId: string;
      status: "in_progress" | "paused";
      progressDays: number;
      scienceInvested: number;
      scienceNeeded: number;
      daysNeeded: number;
    } | null = null;
    if (currentResearch) {
      const tech = TECHNOLOGIES[currentResearch.technologyId];
      if (tech) {
        currentResearchData = {
          technologyId: currentResearch.technologyId,
          status: currentResearch.status as "in_progress" | "paused",
          progressDays: currentResearch.progressDays,
          scienceInvested: currentResearch.scienceInvested,
          scienceNeeded: tech.scienceCost,
          daysNeeded: tech.researchDays,
        };
      }
    }

    this.send(client.ws, {
      type: "techTreeData",
      completedTechs,
      currentResearch: currentResearchData,
    });
  }

  private handleStartResearch(
    client: ClientConnection,
    technologyId: string
  ): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const player = this.db.getPlayerById(client.playerId);
    if (!player) {
      this.sendError(client.ws, "Player not found");
      return;
    }

    // Check if player already completed this tech
    const completedTechs = this.db.getCompletedTechnologies(client.playerId);
    if (completedTechs.includes(technologyId)) {
      this.sendError(client.ws, "Technology already researched");
      return;
    }

    // Check if there's already research in progress
    const currentResearch = this.db.getCurrentResearch(client.playerId);
    if (currentResearch) {
      // Pause current research first
      const timeState = this.gameState.getGalaxyTimeState(player.galaxyId);
      if (timeState) {
        this.db.pauseTechnologyResearch(
          client.playerId,
          currentResearch.technologyId,
          timeState.currentTime
        );
      }
    }

    // Start new research
    const timeState = this.gameState.getGalaxyTimeState(player.galaxyId);
    if (timeState) {
      this.db.startTechnologyResearch(
        client.playerId,
        technologyId,
        timeState.currentTime
      );
      this.send(client.ws, {
        type: "researchStarted",
        technologyId,
      });

      // Send updated tech tree
      this.handleRequestTechTree(client);
    }
  }

  private handlePauseResearch(
    client: ClientConnection,
    technologyId: string
  ): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const player = this.db.getPlayerById(client.playerId);
    if (!player) {
      this.sendError(client.ws, "Player not found");
      return;
    }

    const timeState = this.gameState.getGalaxyTimeState(player.galaxyId);
    if (timeState) {
      this.db.pauseTechnologyResearch(
        client.playerId,
        technologyId,
        timeState.currentTime
      );
      this.send(client.ws, {
        type: "researchPaused",
        technologyId,
      });

      // Send updated tech tree
      this.handleRequestTechTree(client);
    }
  }

  private handleResumeResearch(
    client: ClientConnection,
    technologyId: string
  ): void {
    if (!client.playerId) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const player = this.db.getPlayerById(client.playerId);
    if (!player) {
      this.sendError(client.ws, "Player not found");
      return;
    }

    this.db.resumeTechnologyResearch(client.playerId, technologyId);
    this.send(client.ws, {
      type: "researchResumed",
      technologyId,
    });

    // Send updated tech tree
    this.handleRequestTechTree(client);
  }

  /**
   * Get metrics for memory monitoring
   */
  getMetrics(): { clientsCount: number; activePlayersCount: number } {
    return {
      clientsCount: this.clients.size,
      activePlayersCount: this.getActivePlayerCount(),
    };
  }
}
