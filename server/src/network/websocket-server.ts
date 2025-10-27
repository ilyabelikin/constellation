import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import {
  ClientMessage,
  ServerMessage,
  serializeMessage,
  deserializeMessage,
  Player,
  Ship,
  WEBSOCKET_PORT,
  STATE_UPDATE_RATE,
  ASTRONOMICAL_UNIT,
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
          this.handleJoinGalaxy(client, message.galaxyName);
          break;
        case "createGalaxy":
          this.handleCreateGalaxy(client, message.galaxyName);
          break;
        case "resetGalaxy":
          this.handleResetGalaxy(client, message.galaxyName);
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

    // Name will be used when joining/creating galaxy
    // For now, just acknowledge
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

  private handleJoinGalaxy(client: ClientConnection, galaxyName: string): void {
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
      // Player exists, load their data
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
    } else {
      // New player, create them
      // Get the starter system to find the home planet
      const systems = this.db.getSystemsByGalaxy(galaxy.id);
      if (systems.length > 0) {
        const starterSystem = systems[0];
        // Find the civilized planet (should have been set during generation)
        const civilizedPlanet = starterSystem.planets.find(
          (p) =>
            p.civilizationLevel === "interstellar" ||
            p.lifeLevel === "intelligent"
        );
        const homePlanetId = civilizedPlanet
          ? civilizedPlanet.id
          : starterSystem.planets.length > 0
          ? starterSystem.planets[0].id
          : "";
        this.createPlayerInGalaxy(client, galaxy.id, galaxyName, homePlanetId);
      } else {
        this.sendError(client.ws, "No systems found in galaxy");
      }
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
    galaxyName: string
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
      starterResult.homePlanetId
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
    galaxyName: string
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
    homePlanetId: string
  ): void {
    if (!client.uuid) return;

    // Get starter system
    const systems = this.db.getSystemsByGalaxy(galaxyId);
    if (systems.length === 0) {
      this.sendError(client.ws, "No systems in galaxy");
      return;
    }

    const starterSystem = systems[0];

    // Find the home planet to orbit around it
    const homePlanet = starterSystem.planets.find((p) => p.id === homePlanetId);
    const parentBodyId = homePlanet ? homePlanet.id : starterSystem.star.id;
    const parentMass = homePlanet ? homePlanet.mass : starterSystem.star.mass;

    // Create player
    const player: Player = {
      id: uuidv4(),
      uuid: client.uuid,
      name: `Player-${client.uuid.substring(0, 8)}`,
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

      console.log(
        `Generated new system ${destinationSystem.id} with ${
          destinationSystem.gates.length
        } gate(s) (1 return, ${destinationSystem.gates.length - 1} unexplored)`
      );
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

    console.log(
      `Player ${player.name} traveled through gate to system ${destinationSystem.id}`
    );
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

    // Transform systems into constellation nodes
    const nodes = constellationData.systems.map((system) => ({
      systemId: system.id,
      systemName: system.star.name,
      starColor: system.star.color || "#ffffff",
      position: system.position,
    }));

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

  private sendError(ws: WebSocket, message: string): void {
    this.send(ws, { type: "error", message });
  }
}
