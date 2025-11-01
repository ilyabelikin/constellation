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
} from "@constellation/shared";
import { DatabaseQueries } from "../database/queries.js";
import { GameStateManager } from "../game/state-manager.js";
import {
  generateGalaxy,
  generateStarterSystem,
  generateNewSystem,
  StarterSystemResult,
} from "../generation/galaxy-generator.js";

interface ClientConnection {
  ws: WebSocket;
  playerId: string | null;
  uuid: string | null;
  currentSystemId: string | null;
  playerName: string | null;
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

    // Start with game paused (no players yet)
    this.gameState.pause();

    console.log(`WebSocket server started on port ${WEBSOCKET_PORT}`);
  }

  private handleConnection(ws: WebSocket): void {
    const client: ClientConnection = {
      ws,
      playerId: null,
      uuid: null,
      currentSystemId: null,
      playerName: null,
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
        case "joinGalaxy":
          this.handleJoinGalaxy(client, message.galaxyName, message.playerName);
          break;
        case "createGalaxy":
          this.handleCreateGalaxy(client, message.galaxyName, message.playerName);
          break;
        case "resetGalaxy":
          this.handleResetGalaxy(client, message.galaxyName, message.playerName);
          break;
        case "requestSystemState":
          this.handleRequestSystemState(client, message.systemId);
          break;
        case "setTimeScale":
          this.gameState.setTimeScale(message.scale);
          this.broadcastTimeUpdate();
          break;
        case "pauseTime":
          this.gameState.pause();
          this.broadcastTimeUpdate();
          break;
        case "resumeTime":
          this.gameState.resume();
          this.broadcastTimeUpdate();
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
      }
    } catch (error) {
      console.error("Error handling message:", error);
      console.error("Raw message data:", data);
      try {
        const parsedMessage = JSON.parse(data);
        console.error("Parsed message:", parsedMessage);
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
      client.playerId = player.id;
      client.currentSystemId = player.currentSystemId;

      // Just authenticate, don't auto-load game state
      // Player needs to explicitly join/explore to load their game
      this.send(client.ws, {
        type: "authenticated",
        uuid,
        playerId: player.id,
      });
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

    // Galaxy exists, return current game time
    this.send(client.ws, {
      type: "galaxyInfo",
      galaxyName,
      exists: true,
      currentTime: this.gameState.getCurrentTime(),
    });
  }

  private handleJoinGalaxy(client: ClientConnection, galaxyName: string, playerName?: string): void {
    if (!client.uuid) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    const galaxy = this.db.getGalaxyByName(galaxyName);
    if (!galaxy) {
      this.sendError(client.ws, "Galaxy not found");
      return;
    }

    // Check if player already exists
    const existingPlayer = this.db.getPlayerByUuid(client.uuid);
    if (existingPlayer) {
      // Player exists, update their name if provided
      if (playerName && playerName.trim()) {
        this.db.updatePlayerName(existingPlayer.id, playerName.trim());
        existingPlayer.name = playerName.trim(); // Update in memory
        console.log(`Updated player name to: ${playerName.trim()}`);
      }
      
      // Load their data
      client.playerId = existingPlayer.id;
      client.currentSystemId = existingPlayer.currentSystemId;

      // Load system into game state
      const system = this.db.getStarSystem(existingPlayer.currentSystemId);
      if (system) {
        this.gameState.loadSystem(system);
        const ships = this.db.getShipsBySystem(system.id);
        this.gameState.loadShips(system.id, ships);
      }

      // Send data to client
      this.send(client.ws, { type: "playerData", player: existingPlayer });
      if (system) {
        this.send(client.ws, { type: "systemData", system });
      }
      const ship = this.db.getShipByPlayerId(existingPlayer.id);
      if (ship) {
        this.send(client.ws, { type: "shipData", ship });
      }
      
      // Broadcast updated galaxy players info if name was changed
      if (playerName && playerName.trim()) {
        this.broadcastGalaxyPlayersInfo(galaxy.id);
      }
    } else {
      // New player, create them
      // Generate a unique starting system for this player, separate from other players
      console.log(`Generating unique starting system for new player in galaxy: ${galaxyName}`);
      
      const starterResult = generateStarterSystem(galaxy.id, galaxy.seed + Date.now());
      this.db.createStarSystem(starterResult.system);
      
      // Save gates for the starter system
      for (const gate of starterResult.system.gates) {
        this.db.createGate(gate);
      }
      
      this.createPlayerInGalaxy(
        client,
        galaxy.id,
        galaxyName,
        starterResult.homePlanetId,
        playerName
      );
    }

    // Send initial time state to the joining player
    this.send(client.ws, {
      type: "timeUpdate",
      currentTime: this.gameState.getCurrentTime(),
      isPaused: this.gameState.isPausedState(),
      timeScale: this.gameState.getTimeScale(),
    });

    console.log(
      `Player joined galaxy: ${galaxyName} (active players: ${this.getActivePlayerCount()})`
    );
    this.send(client.ws, { type: "galaxyJoined", galaxyId: galaxy.id });
  }

  private handleCreateGalaxy(
    client: ClientConnection,
    galaxyName: string,
    playerName?: string
  ): void {
    if (!client.uuid) {
      this.sendError(client.ws, "Not authenticated");
      return;
    }

    // Check if galaxy already exists
    const existingGalaxy = this.db.getGalaxyByName(galaxyName);
    if (existingGalaxy) {
      this.sendError(client.ws, "Galaxy already exists");
      return;
    }

    // Create new galaxy
    const galaxy = generateGalaxy(galaxyName);
    this.db.createGalaxy(galaxy);

    // Generate starter system
    const starterResult = generateStarterSystem(galaxy.id, galaxy.seed);
    this.db.createStarSystem(starterResult.system);

    // Save gates for the starter system
    for (const gate of starterResult.system.gates) {
      this.db.createGate(gate);
    }

    // Reset game time to 0 for new galaxy
    this.gameState.resetTime();

    // Create player
    this.createPlayerInGalaxy(
      client,
      galaxy.id,
      galaxyName,
      starterResult.homePlanetId,
      playerName
    );

    // Send initial time state to the joining player
    this.send(client.ws, {
      type: "timeUpdate",
      currentTime: this.gameState.getCurrentTime(),
      isPaused: this.gameState.isPausedState(),
      timeScale: this.gameState.getTimeScale(),
    });

    this.send(client.ws, { type: "galaxyCreated", galaxyId: galaxy.id });
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

    // Save gates for the starter system
    for (const gate of starterResult.system.gates) {
      this.db.createGate(gate);
    }

    // Reset game time to 0
    this.gameState.resetTime();

    console.log(`Galaxy reset complete: ${galaxyName} (new ID: ${galaxy.id})`);
    this.send(client.ws, { type: "galaxyReset", galaxyId: galaxy.id });
  }

  private createPlayerInGalaxy(
    client: ClientConnection,
    galaxyId: string,
    galaxyName: string,
    homePlanetId: string,
    playerName?: string
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
      console.warn("Could not find system with home planet, using first system");
      starterSystem = systems[0];
    }

    // Find the home planet to orbit around it
    const homePlanet = starterSystem.planets.find((p) => p.id === homePlanetId);
    const parentBodyId = homePlanet ? homePlanet.id : starterSystem.star.id;
    const parentMass = homePlanet ? homePlanet.mass : starterSystem.star.mass;

    // Create player with the name they provided (from message or stored), or a default based on UUID
    const finalPlayerName = playerName || client.playerName || `Player-${client.uuid.substring(0, 8)}`;
    
    const player: Player = {
      id: uuidv4(),
      uuid: client.uuid,
      name: finalPlayerName,
      galaxyId,
      homeSystemId: starterSystem.id,
      homePlanetId: homePlanetId,
      currentSystemId: starterSystem.id,
      shipId: "",
      exploredGateIds: [], // New player has not explored any gates yet
    };

    this.db.createPlayer(player);

    // Create ship orbiting the home planet (or star if no planet found)
    // Calculate a reasonable orbital distance based on parent body
    // Need larger orbit to account for visual scaling (BODY_SIZE_MULTIPLIER = 40)
    const orbitDistance = homePlanet
      ? homePlanet.radius * 200 // Orbit 200x the planet's radius for visibility
      : 1.5 * ASTRONOMICAL_UNIT; // Default to 1.5 AU from star

    const ship: Ship = {
      id: uuidv4(),
      playerId: player.id,
      systemId: starterSystem.id,
      parentBodyId: parentBodyId,
      orbitalElements: {
        semiMajorAxis: orbitDistance,
        eccentricity: 0.05,
        inclination: 0.01,
        longitudeOfAscendingNode: 0,
        argumentOfPeriapsis: 0,
        meanAnomalyAtEpoch: 0,
        epoch: this.gameState.getCurrentTime(),
      },
      deltaV: 10000, // 10 km/s of delta-v
    };

    this.db.createShip(ship);
    player.shipId = ship.id;

    // Update client
    client.playerId = player.id;
    client.currentSystemId = starterSystem.id;

    // Record initial system discovery (player's home system)
    this.db.recordSystemDiscovery(starterSystem.id, player.id);

    // Load into game state
    this.gameState.loadSystem(starterSystem);
    this.gameState.addShip(ship);

    console.log(
      `Player created: ${player.name}, Home Planet: ${
        homePlanet?.name || "N/A"
      } (${homePlanetId})`
    );

    // Send data to client
    this.send(client.ws, { type: "playerData", player });
    this.send(client.ws, { type: "systemData", system: starterSystem });
    this.send(client.ws, { type: "shipData", ship });
    
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

    // Send system data
    this.send(client.ws, { type: "systemData", system });

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
      const MAX_CHANCE = 0.50;
      const connectionProbability = Math.min(
        BASE_CHANCE + (constellationSize * CHANCE_PER_SYSTEM),
        MAX_CHANCE
      );
      
      console.log(
        `Multiplayer connection check: ${constellationSize} systems explored, ` +
        `${(connectionProbability * 100).toFixed(1)}% chance to connect to another player`
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
            const otherExploredSystems = this.db.getExploredSystemsByPlayer(otherPlayer.id);
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
            const targetSystem = candidateSystems[Math.floor(Math.random() * candidateSystems.length)];
            console.log(
              `🌟 MULTIPLAYER CONNECTION! Connecting to another player's system: ${targetSystem.star.name}`
            );
            
            // Update the gate to point to this existing system
            this.db.updateGateDestination(gateId, targetSystem.id);
            destinationSystem = targetSystem;
            
            // Create a return gate in the target system pointing back
            // Find which player explored this system to determine gate placement
            const returnGate: StarGate = {
              id: uuidv4(),
              systemId: targetSystem.id,
              destinationSystemId: currentSystem.id,
              name: `Gate to ${currentSystem.star.name}`,
              orbitalElements: {
                semiMajorAxis: targetSystem.star.radius * 100, // Place it far from star
                eccentricity: 0.1,
                inclination: 0.05,
                longitudeOfAscendingNode: Math.random() * Math.PI * 2,
                argumentOfPeriapsis: Math.random() * Math.PI * 2,
                meanAnomalyAtEpoch: Math.random() * Math.PI * 2,
                epoch: this.gameState.getCurrentTime(),
              },
            };
            
            this.db.createGate(returnGate);
            
            // Reload the system with the new gate
            destinationSystem = this.db.getStarSystem(targetSystem.id);
            
            // Transfer mystery sphere position to the target system's position
            this.db.transferMysteryPositionToSystem(
              player.id,
              gateId,
              targetSystem.id
            );
          } else {
            console.log("No suitable systems from other players found (all already explored)");
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
        destinationSystem = generateNewSystem(
          galaxy.id,
          galaxy.seed + Date.now(), // Use time as additional seed entropy
          [currentSystem.id], // First gate connects back to current system
          newSystemPosition, // Use calculated position
          !hasUnexploredGateInNetwork // Force at least one exit if no unexplored gates in entire network
        );

        // Save the new system
        this.db.createStarSystem(destinationSystem);

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
          } gate(s) (1 return, ${destinationSystem.gates.length - 1} unexplored)`
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

    // Mark BOTH gates as explored for this player
    this.db.markGateExploredSingle(player.id, gateId);
    this.db.markGateExploredSingle(player.id, exitGate.id);

    // Record system discovery and check if we discovered other players
    // IMPORTANT: Check for previous discoverers BEFORE recording this player's discovery
    const previousDiscoverers = this.db.getSystemDiscoverers(destinationSystem.id);
    const discoveredPlayers = previousDiscoverers.filter((p) => p.id !== player.id);
    
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

    // Update player data with new exploredGateIds and currentSystemId
    player.exploredGateIds = exploredGateIds;
    player.currentSystemId = destinationSystem.id;
    this.send(client.ws, { type: "playerData", player });

    // Send discovery notification if we discovered other players' system
    if (discoveredPlayers.length > 0) {
      console.log(
        `🌟 Player ${player.name} discovered system previously explored by: ${discoveredPlayers.map((p) => p.name).join(", ")}`
      );
      
      // Notify the discovering player (they discovered others)
      this.send(client.ws, {
        type: "playerDiscovery",
        discoveryType: "discovered",
        playerNames: discoveredPlayers.map((p) => p.name),
        systemName: destinationSystem.star.name,
      });

      // Also notify the discovered players (they were discovered)
      for (const discoveredPlayer of discoveredPlayers) {
        const discoveredClient = this.findClientByPlayerId(discoveredPlayer.id);
        if (discoveredClient) {
          this.send(discoveredClient.ws, {
            type: "playerDiscovery",
            discoveryType: "wasDiscovered",
            playerNames: [player.name],
            systemName: destinationSystem.star.name,
          });
          console.log(`Notified ${discoveredPlayer.name} that ${player.name} discovered their system`);
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

      return {
        systemId: system.id,
        systemName: system.star.name,
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
              color: cs.color || "#ffffff",
              type: cs.starType || "Unknown",
            }))
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

  private handleRequestPlayerStats(client: ClientConnection, playerId: string): void {
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

    this.send(client.ws, {
      type: "playerStats",
      playerId: targetPlayer.id,
      playerName: targetPlayer.name,
      starsDiscovered,
    });

    console.log(`Sent player stats for ${targetPlayer.name}: ${starsDiscovered} stars discovered`);
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
    }

    console.log(
      `Search for "${query}" returned ${results.length} results across ${exploredSystemIds.size} explored systems`
    );

    this.send(client.ws, { type: "searchResults", results });
  }

  private handleDisconnect(ws: WebSocket): void {
    this.clients.delete(ws);
    console.log("Client disconnected");
    this.checkPlayerCountAndPause();
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

    if (activePlayerCount === 0 && !this.gameState.isPausedState()) {
      console.log("No active players, pausing game");
      this.gameState.pause();
      this.broadcastTimeUpdate();
    }
  }

  private startStateUpdates(): void {
    setInterval(() => {
      this.broadcastStateUpdates();
    }, 1000 / STATE_UPDATE_RATE);
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
    const timeUpdate: ServerMessage = {
      type: "timeUpdate",
      currentTime: this.gameState.getCurrentTime(),
      isPaused: this.gameState.isPausedState(),
      timeScale: this.gameState.getTimeScale(),
    };

    for (const client of this.clients.values()) {
      this.send(client.ws, timeUpdate);
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(serializeMessage(message));
    }
  }

  private sendGalaxyPlayersInfo(client: ClientConnection, player: Player): void {
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
}
