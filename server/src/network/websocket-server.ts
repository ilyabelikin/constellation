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
  MAX_DYSON_SWARMS_PER_STAR,
  BASE_POPULATION_DENSITY,
} from "@constellation/shared";
import { DatabaseQueries } from "../database/queries.js";
import { GameStateManager } from "../game/state-manager.js";
import { calculatePlayerResourceFlow } from "../game/resource-flow.js";
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
        case "setPlayerStance":
          this.handleSetPlayerStance(
            client,
            message.targetPlayerId,
            message.stance
          );
          break;
        case "establishMining":
          this.handleEstablishMining(client, message.celestialBodyId);
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
        case "debugConnectGate":
          this.handleDebugConnectGate(client, message.gateId);
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
        `[Server] Player switching galaxies: ${existingPlayer.galaxyId} -> ${galaxyId}. Creating new player.`
      );
      // Delete old player and create new one in the new galaxy
      this.db.deletePlayer(existingPlayer.id);

      // Clear client state and existingPlayer reference
      client.playerId = null;
      client.currentSystemId = null;
      existingPlayer = null;
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
        `[Server] Deleting existing player ${existingPlayer.name} to start fresh`
      );
      this.db.deletePlayer(existingPlayer.id);

      // Clear client state
      client.playerId = null;
      client.currentSystemId = null;
      client.galaxyId = null;
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
    const speciesIds = players
      .map((p) => p.speciesId)
      .filter((id): id is string => !!id);

    this.send(client.ws, {
      type: "galaxySpecies",
      speciesIds,
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
        // Create a copy with player-specific IDs
        speciesId = `species_player_${playerId}`;
        species = {
          ...pregeneratedSpecies,
          id: speciesId,
          playerId: playerId,
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
      energy: 10, // Initial energy
      alloy: 10, // Initial alloy
      science: 0, // Initial science
      speciesId: speciesId,
    };

    this.db.createPlayer(player);

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

      const colony: import("@constellation/shared").Colony = {
        id: uuidv4(),
        playerId: player.id,
        speciesId: species.id,
        systemId: starterSystem.id,
        planetId: homePlanet.id,
        planetName: homePlanet.name,
        stage: "settlement", // Start as settlement, not just outpost
        specialization: "balanced",
        population: initialPopulation,
        sciencePerDay: 0.015 * habitabilityBonus * 2, // 2x multiplier for settlement stage
        alloyPerDay: 0.008 * habitabilityBonus * 2,
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

    // Energy is required ONLY if you're the first person to open the gate
    // If another player already opened it, it's maintained by their energy
    const needsEnergyForGate = isGateUnexplored && !gateHasOwner;
    const needsEnergyForExitGate = isExitGateUnexplored && !exitGateHasOwner;
    const needsEnergy = needsEnergyForGate || needsEnergyForExitGate;

    // Check energy requirement for opening a new gate
    if (needsEnergy) {
      const ENERGY_COST = 1;
      const resources = this.db.getPlayerResources(player.id);

      if (!resources || resources.energy < ENERGY_COST) {
        this.sendError(
          client.ws,
          `Not enough energy to open the gate (requires ${ENERGY_COST} energy)`
        );
        return;
      }

      // Deduct energy
      const success = this.db.deductPlayerEnergy(player.id, ENERGY_COST);
      if (!success) {
        this.sendError(client.ws, "Failed to deduct energy");
        return;
      }

      if (needsEnergyForGate && needsEnergyForExitGate) {
        console.log(
          `Player ${player.name} spent ${ENERGY_COST} energy to open both gates for the first time`
        );
      } else if (needsEnergyForGate) {
        console.log(
          `Player ${player.name} spent ${ENERGY_COST} energy to open the entry gate (exit gate maintained by another player)`
        );
      } else {
        console.log(
          `Player ${player.name} spent ${ENERGY_COST} energy to open the exit gate (entry gate maintained by another player)`
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

    // After setting ownership on both gates, ensure tunnel power is updated
    // This is needed because the first setGateOwnership might run before the second one
    if (gate.tunnelId) {
      this.db.updateTunnelPower(gateId);
      console.log(`Updated tunnel power for tunnel ${gate.tunnelId}`);
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

    // Send travel response to client
    this.send(client.ws, {
      type: "gateTravel",
      destinationSystem,
      exploredGateIds,
      exitGateId: exitGate.id,
    });

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
      const habitablePlanets = system.planets.filter(
        (planet) => planet.habitability && planet.habitability >= 0.5
      );
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

    // Get current player's stance towards this player
    const currentStance = this.db.getPlayerStance(client.playerId, playerId);

    this.send(client.ws, {
      type: "playerStats",
      playerId: targetPlayer.id,
      playerName: targetPlayer.name,
      starsDiscovered,
      currentStance,
    });

    console.log(
      `Sent player stats for ${targetPlayer.name}: ${starsDiscovered} stars discovered, stance: ${currentStance}`
    );
  }

  private handleSetPlayerStance(
    client: ClientConnection,
    targetPlayerId: string,
    stance: "neutral" | "friendly" | "aggressive"
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

    // Don't allow setting stance towards yourself
    if (client.playerId === targetPlayerId) {
      this.sendError(client.ws, "Cannot set stance towards yourself");
      return;
    }

    // Set the stance
    this.db.setPlayerStance(client.playerId, targetPlayerId, stance);

    console.log(
      `Player ${player.name} set stance towards ${targetPlayer.name} to ${stance}`
    );

    // Send confirmation back to client
    this.send(client.ws, {
      type: "stanceUpdated",
      targetPlayerId,
      stance,
    });

    // Request constellation data to be refreshed (gates will show new colors)
    this.handleRequestConstellation(client);
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

    // Check if player has enough energy
    const MINING_COST = 1;
    if (player.energy < MINING_COST) {
      this.sendError(
        client.ws,
        `Not enough energy to establish mining operation (requires ${MINING_COST} energy)`
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

    // Deduct energy
    const success = this.db.deductPlayerEnergy(client.playerId, MINING_COST);
    if (!success) {
      this.sendError(client.ws, "Failed to deduct energy");
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
    const DYSON_SWARM_COST = 10;
    if (player.alloy < DYSON_SWARM_COST) {
      this.sendError(
        client.ws,
        "Not enough alloy to launch Dyson Swarm (requires 10 alloy)"
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
    const isValidStar =
      system.star.id === starId ||
      (system.companionStars &&
        system.companionStars.some((cs) => cs.id === starId));

    if (!isValidStar) {
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

    // Check how many Dyson Swarms are already on this star
    const existingSwarms = this.db.countDysonSwarmsByStar(starId);
    const MAX_SWARMS = MAX_DYSON_SWARMS_PER_STAR;

    if (existingSwarms >= MAX_SWARMS) {
      this.sendError(
        client.ws,
        `Maximum Dyson Swarms (${MAX_SWARMS}) already deployed on this star`
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
    deductStmt.run(DYSON_SWARM_COST, client.playerId);

    // Add energy immediately (Dyson Swarms provide instant permanent energy boost)
    const ENERGY_PER_SWARM = 1;
    this.db.addPlayerEnergy(client.playerId, ENERGY_PER_SWARM);

    // Create Dyson Swarm megastructure
    const megastructureId = uuidv4();

    this.db.createMegastructure(
      megastructureId,
      client.playerId,
      system.id,
      "dyson_swarm",
      starId,
      "energy",
      ENERGY_PER_SWARM,
      currentTime,
      null
    );

    // Get the star name (primary or companion)
    let starName = system.star.name;
    if (starId !== system.star.id && system.companionStars) {
      const companionStar = system.companionStars.find(
        (cs) => cs.id === starId
      );
      if (companionStar) {
        starName = companionStar.name;
      }
    }

    console.log(
      `Player ${player.name} launched Dyson Swarm #${
        existingSwarms + 1
      } on ${starName} in system ${system.id} (+${ENERGY_PER_SWARM} energy)`
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
      energyPerDay: ENERGY_PER_SWARM,
      count: existingSwarms + 1,
    });
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
    this.clients.delete(ws);
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

  private startTimeSaveInterval(): void {
    // Save galaxy time state to database every 10 seconds
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

          // Process mining yields based on current time
          this.db.processMiningYields(timeState.currentTime);

          // Process megastructure yields based on current time
          this.db.processMegastructureYields(timeState.currentTime);

          // Process colony yields based on current time
          this.db.processColonyYields(timeState.currentTime);
        }
      }

      // Send updated player data to all connected clients (for resource updates)
      for (const client of this.clients.values()) {
        if (client.playerId) {
          const player = this.db.getPlayerById(client.playerId);
          if (player) {
            this.send(client.ws, { type: "playerData", player });
          }
        }
      }
    }, 10000); // Save every 10 seconds
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
    setTimeout(() => {
      const deletedCount = this.db.cleanupOldGalaxies();
      if (deletedCount > 0) {
        console.log(`Initial cleanup: removed ${deletedCount} old galaxies`);
      }
    }, 60 * 1000);
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

    // Get total players in galaxy
    const allPlayers = this.db.getPlayersByGalaxy(player.galaxyId);

    this.send(client.ws, {
      type: "galaxyPlayers",
      metPlayers: metPlayers.map((p) => ({ id: p.id, name: p.name })),
      totalPlayers: allPlayers.length,
    });
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
    const COLONY_ENERGY_COST = 5;
    const COLONY_ALLOY_COST = 5;
    const COLONY_SCIENCE_COST = 5;

    if (player.energy < COLONY_ENERGY_COST) {
      this.sendError(
        client.ws,
        `Not enough energy to establish colony (requires ${COLONY_ENERGY_COST} energy, have ${
          Math.floor(player.energy * 100) / 100
        })`
      );
      return;
    }

    if (player.alloy < COLONY_ALLOY_COST) {
      this.sendError(
        client.ws,
        `Not enough alloy to establish colony (requires ${COLONY_ALLOY_COST} alloy, have ${
          Math.floor(player.alloy * 100) / 100
        })`
      );
      return;
    }

    if (player.science < COLONY_SCIENCE_COST) {
      this.sendError(
        client.ws,
        `Not enough science to establish colony (requires ${COLONY_SCIENCE_COST} science, have ${
          Math.floor(player.science * 100) / 100
        })`
      );
      return;
    }

    // Deduct resources
    this.db.updatePlayerResources(
      player.id,
      player.energy - COLONY_ENERGY_COST,
      player.alloy - COLONY_ALLOY_COST,
      player.science - COLONY_SCIENCE_COST
    );

    // Calculate initial population based on habitability
    const basePopulation = 1000;
    const populationMultiplier = 0.5 + planet.habitability * 0.5; // 0.5x to 1.0x based on habitability
    const initialPopulation = Math.floor(basePopulation * populationMultiplier);

    // Calculate resource yields based on specialization and habitability
    // Note: Colonies do not produce energy - only Dyson Swarms do that
    // Colonies consume resources until they reach 1M population, then produce at smaller rates
    const habitabilityBonus = planet.habitability || 0.5;
    let sciencePerDay = 0.01;
    let alloyPerDay = 0.005;

    // Colonies start by consuming resources (negative rates)
    // Once they reach 1M population, they switch to producing at smaller rates
    switch (specialization) {
      case "research":
        sciencePerDay = -0.45 * habitabilityBonus; // Consume science (15x cost)
        alloyPerDay = -0.03 * habitabilityBonus; // Consume minerals (15x cost)
        break;
      case "industrial":
        sciencePerDay = -0.075 * habitabilityBonus; // Consume science (15x cost)
        alloyPerDay = -0.3 * habitabilityBonus; // Consume minerals (15x cost)
        break;
      default: // balanced
        sciencePerDay = -0.225 * habitabilityBonus; // Consume science (15x cost)
        alloyPerDay = -0.12 * habitabilityBonus; // Consume minerals (15x cost)
        break;
    }

    // Get current game time
    const timeState = this.gameState.getGalaxyState(player.galaxyId);
    const currentTime = timeState ? timeState.currentTime : 0;

    // Create colony
    const colonyId = uuidv4();
    const colony: import("@constellation/shared").Colony = {
      id: colonyId,
      playerId: player.id,
      speciesId: player.speciesId,
      systemId: system.id,
      planetId: planet.id,
      planetName: planet.name,
      stage: "outpost",
      specialization,
      population: initialPopulation,
      sciencePerDay,
      alloyPerDay,
      establishedAt: currentTime,
      lastYieldAt: currentTime,
    };

    this.db.createColony(colony);

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

    // Update yields based on new specialization
    // Note: Colonies do not produce energy - only Dyson Swarms do that
    // Colonies consume resources until they reach 1M population, then produce at smaller rates
    let sciencePerDay = 0.01;
    let alloyPerDay = 0.005;

    // Check if colony has reached 1M population
    const isProducing = colony.population >= 1000000;

    if (isProducing) {
      // Colony produces at smaller rates after reaching 1M population
      switch (specialization) {
        case "research":
          sciencePerDay = 0.01 * habitabilityBonus; // Reduced from 0.03
          alloyPerDay = 0.001 * habitabilityBonus; // Reduced from 0.002
          break;
        case "industrial":
          sciencePerDay = 0.002 * habitabilityBonus; // Reduced from 0.005
          alloyPerDay = 0.008 * habitabilityBonus; // Reduced from 0.02
          break;
        default: // balanced
          sciencePerDay = 0.006 * habitabilityBonus; // Reduced from 0.015
          alloyPerDay = 0.003 * habitabilityBonus; // Reduced from 0.008
          break;
      }
    } else {
      // Colony consumes resources (negative rates)
      switch (specialization) {
        case "research":
          sciencePerDay = -0.45 * habitabilityBonus; // 15x cost
          alloyPerDay = -0.03 * habitabilityBonus; // 15x cost
          break;
        case "industrial":
          sciencePerDay = -0.075 * habitabilityBonus; // 15x cost
          alloyPerDay = -0.3 * habitabilityBonus; // 15x cost
          break;
        default: // balanced
          sciencePerDay = -0.225 * habitabilityBonus; // 15x cost
          alloyPerDay = -0.12 * habitabilityBonus; // 15x cost
          break;
      }
    }

    // Scale yields based on colony stage
    const stageMultipliers: Record<string, number> = {
      outpost: 1.0,
      settlement: 2.0,
      colony: 4.0,
      developed: 8.0,
      metropolis: 16.0,
      ecumenopolis: 32.0,
    };
    const multiplier = stageMultipliers[colony.stage] || 1.0;

    colony.specialization = specialization;
    colony.sciencePerDay = sciencePerDay * multiplier;
    colony.alloyPerDay = alloyPerDay * multiplier;

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

    // Check resource costs
    const ENERGY_COST = 1;
    const MINERAL_COST = 0.1;

    if (player.energy < ENERGY_COST) {
      this.sendError(
        client.ws,
        `Not enough energy to fortify gate (requires ${ENERGY_COST} energy)`
      );
      return;
    }

    if (player.alloy < MINERAL_COST) {
      this.sendError(
        client.ws,
        `Not enough minerals to fortify gate (requires ${MINERAL_COST} minerals)`
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
      MINERAL_COST
    );

    if (!energySuccess || !alloySuccess) {
      this.sendError(client.ws, "Failed to deduct resources");
      return;
    }

    // Create defense platform
    const defenseId = uuidv4();
    this.db.createGateDefense(
      defenseId,
      gateId,
      client.playerId,
      gate.systemId
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
    this.send(client.ws, {
      type: "gateDefenseBuilt",
      defense: {
        id: defenseId,
        gateId,
        playerId: client.playerId,
        systemId: gate.systemId,
        health: 200,
        maxHealth: 200,
        createdAt: Date.now(),
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
            health: 200,
            maxHealth: 200,
            createdAt: Date.now(),
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

    // Check stance towards gate owner
    const stance = this.db.getPlayerStance(client.playerId, gateOwnerId);
    if (stance !== "aggressive") {
      this.sendError(
        client.ws,
        "You must have an aggressive stance towards the gate owner to attack"
      );
      return;
    }

    // Check if there's already an active attack on this gate
    const existingAttack = this.db.getActiveGateAttack(gateId);
    if (existingAttack) {
      this.sendError(
        client.ws,
        "There is already an active attack on this gate"
      );
      return;
    }

    // Check resource costs
    const ENERGY_COST = 1;
    const MINERAL_COST = 0.1;

    if (player.energy < ENERGY_COST) {
      this.sendError(
        client.ws,
        `Not enough energy to attack gate (requires ${ENERGY_COST} energy)`
      );
      return;
    }

    if (player.alloy < MINERAL_COST) {
      this.sendError(
        client.ws,
        `Not enough minerals to attack gate (requires ${MINERAL_COST} minerals)`
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
      MINERAL_COST
    );

    if (!energySuccess || !alloySuccess) {
      this.sendError(client.ws, "Failed to deduct resources");
      return;
    }

    // Get defenses
    const defenses = this.db.getGateDefenses(gateId);
    const attackShipCount = 1; // One ship per attack

    // Create attack
    const attackId = uuidv4();
    this.db.createGateAttack(
      attackId,
      gateId,
      client.playerId,
      gateOwnerId,
      gate.systemId,
      attackShipCount
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

    // Simulate combat after a delay (allow animations to start)
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
    const shipHealth: number[] = [];
    for (let i = 0; i < attackShipsRemaining; i++) {
      shipHealth.push(300);
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
            this.db.deleteGateDefense(target.id);
            combatEvents.push({
              time: currentTime,
              type: "defenseDestroyed",
              targetId: target.id,
            });
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

    // No ownership change on attack victory - attacker must use Overtake
    // System state doesn't need refresh since only defenses were destroyed (already handled)
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

    // Check resource costs
    const ENERGY_COST = 3;
    const SCIENCE_COST = 10;

    if (player.energy < ENERGY_COST) {
      this.sendError(
        client.ws,
        `Not enough energy to overtake gate (requires ${ENERGY_COST} energy)`
      );
      return;
    }

    if (player.science < SCIENCE_COST) {
      this.sendError(
        client.ws,
        `Not enough science to overtake gate (requires ${SCIENCE_COST} science)`
      );
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

    // Store previous owner before transferring
    const previousOwnerId = currentOwner;

    // Transfer ownership with overtake timestamp
    this.db.setGateOwnershipWithOvertake(gateId, client.playerId, currentTime);

    console.log(
      `Player ${player.name} overtook gate ${gate.name} (undefended)`
    );

    // Send updated player data
    const updatedPlayer = this.db.getPlayerById(client.playerId);
    if (updatedPlayer) {
      this.send(client.ws, { type: "playerData", player: updatedPlayer });
    }

    // Broadcast gate overtaken to all players in the galaxy
    const playerName = player.name;
    for (const otherClient of this.clients.values()) {
      if (otherClient.galaxyId === player.galaxyId && otherClient.playerId) {
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

        // Refresh system data for ALL players viewing this system
        // This ensures tunnel ownership information is updated correctly
        if (otherClient.currentSystemId === gate.systemId) {
          this.handleRequestSystemState(
            otherClient,
            otherClient.currentSystemId
          );
        }
      }
    }
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

    // Try to find another player's unexplored gate
    let targetGate = null;
    let targetPlayer = null;

    for (const otherPlayer of otherPlayers) {
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
      poweredBySpeciesId: null,
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

    // Update tunnel power based on current gate ownership
    this.db.updateTunnelPower(gateId);

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

      this.send(client.ws, {
        type: "systemData",
        system,
        gateOwnership: gateOwnership.length > 0 ? gateOwnership : undefined,
        tunnelOwnership:
          tunnelOwnership.length > 0 ? tunnelOwnership : undefined,
      });
    }

    // Also notify the target player if they're online and in the connected system
    const targetClient = Array.from(this.clients.values()).find(
      (c) => c.playerId === targetPlayer.id
    );
    if (targetClient && targetPlayer.currentSystemId === targetGate.systemId) {
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

        this.send(targetClient.ws, {
          type: "error",
          message: `${player.name}'s civilization has connected to your gate!`,
        });
      }
    }
  }
}
