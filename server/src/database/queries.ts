import Database from "better-sqlite3";
import {
  Galaxy,
  StarSystem,
  Player,
  Ship,
  StarGate,
  Vector3,
  OrbitalElements,
} from "@constellation/shared";

export class DatabaseQueries {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  // Galaxy operations
  createGalaxy(galaxy: Galaxy): void {
    const stmt = this.db.prepare(
      "INSERT INTO galaxies (id, name, seed, created_at) VALUES (?, ?, ?, ?)"
    );
    stmt.run(galaxy.id, galaxy.name, galaxy.seed, galaxy.createdAt);
  }

  deleteGalaxy(galaxyId: string): void {
    // Delete in reverse order of dependencies
    this.db
      .prepare(
        "DELETE FROM ships WHERE system_id IN (SELECT id FROM star_systems WHERE galaxy_id = ?)"
      )
      .run(galaxyId);
    this.db.prepare("DELETE FROM players WHERE galaxy_id = ?").run(galaxyId);
    this.db
      .prepare("DELETE FROM star_systems WHERE galaxy_id = ?")
      .run(galaxyId);
    this.db.prepare("DELETE FROM galaxies WHERE id = ?").run(galaxyId);
  }

  getGalaxyByName(name: string): Galaxy | null {
    const stmt = this.db.prepare("SELECT * FROM galaxies WHERE name = ?");
    const row = stmt.get(name) as any;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      seed: row.seed,
      createdAt: row.created_at,
    };
  }

  getGalaxyById(id: string): Galaxy | null {
    const stmt = this.db.prepare("SELECT * FROM galaxies WHERE id = ?");
    const row = stmt.get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      seed: row.seed,
      createdAt: row.created_at,
    };
  }

  // Star system operations
  createStarSystem(system: StarSystem): void {
    const stmt = this.db.prepare(
      "INSERT INTO star_systems (id, galaxy_id, position_x, position_y, position_z, seed, generated_data) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    stmt.run(
      system.id,
      system.galaxyId,
      system.position.x,
      system.position.y,
      system.position.z,
      system.seed,
      JSON.stringify({
        star: system.star,
        planets: system.planets,
        moons: system.moons,
        asteroidBelts: system.asteroidBelts,
      })
    );
  }

  getStarSystem(id: string): StarSystem | null {
    const stmt = this.db.prepare("SELECT * FROM star_systems WHERE id = ?");
    const row = stmt.get(id) as any;
    if (!row) return null;
    const data = JSON.parse(row.generated_data);
    const gates = this.getGatesBySystem(row.id);
    return {
      id: row.id,
      galaxyId: row.galaxy_id,
      position: { x: row.position_x, y: row.position_y, z: row.position_z },
      seed: row.seed,
      star: data.star,
      planets: data.planets,
      moons: data.moons || [],
      asteroidBelts: data.asteroidBelts || [],
      gates,
    };
  }

  getSystemsByGalaxy(galaxyId: string): StarSystem[] {
    const stmt = this.db.prepare(
      "SELECT * FROM star_systems WHERE galaxy_id = ?"
    );
    const rows = stmt.all(galaxyId) as any[];
    return rows.map((row) => {
      const data = JSON.parse(row.generated_data);
      const gates = this.getGatesBySystem(row.id);
      return {
        id: row.id,
        galaxyId: row.galaxy_id,
        position: { x: row.position_x, y: row.position_y, z: row.position_z },
        seed: row.seed,
        star: data.star,
        planets: data.planets,
        moons: data.moons || [],
        asteroidBelts: data.asteroidBelts || [],
        gates,
      };
    });
  }

  // Player operations
  createPlayer(player: Player): void {
    const stmt = this.db.prepare(
      "INSERT INTO players (id, uuid, name, galaxy_id, home_system_id, home_planet_id, current_system_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    stmt.run(
      player.id,
      player.uuid,
      player.name,
      player.galaxyId,
      player.homeSystemId,
      player.homePlanetId,
      player.currentSystemId
    );
  }

  getPlayerByUuid(uuid: string): Player | null {
    const stmt = this.db.prepare("SELECT * FROM players WHERE uuid = ?");
    const row = stmt.get(uuid) as any;
    if (!row) return null;
    const exploredGateIds = this.getExploredGates(row.id);
    return {
      id: row.id,
      uuid: row.uuid,
      name: row.name,
      galaxyId: row.galaxy_id,
      homeSystemId: row.home_system_id,
      homePlanetId: row.home_planet_id,
      currentSystemId: row.current_system_id,
      shipId: "", // Will be loaded separately
      exploredGateIds,
    };
  }

  getPlayerById(id: string): Player | null {
    const stmt = this.db.prepare("SELECT * FROM players WHERE id = ?");
    const row = stmt.get(id) as any;
    if (!row) return null;
    const exploredGateIds = this.getExploredGates(row.id);
    return {
      id: row.id,
      uuid: row.uuid,
      name: row.name,
      galaxyId: row.galaxy_id,
      homeSystemId: row.home_system_id,
      homePlanetId: row.home_planet_id,
      currentSystemId: row.current_system_id,
      shipId: "",
      exploredGateIds,
    };
  }

  updatePlayerCurrentSystem(playerId: string, systemId: string): void {
    const stmt = this.db.prepare(
      "UPDATE players SET current_system_id = ? WHERE id = ?"
    );
    stmt.run(systemId, playerId);
  }

  // Ship operations
  createShip(ship: Ship): void {
    const stmt = this.db.prepare(
      "INSERT INTO ships (id, player_id, system_id, parent_body_id, orbital_elements, delta_v) VALUES (?, ?, ?, ?, ?, ?)"
    );
    stmt.run(
      ship.id,
      ship.playerId,
      ship.systemId,
      ship.parentBodyId,
      JSON.stringify(ship.orbitalElements),
      ship.deltaV
    );
  }

  getShipByPlayerId(playerId: string): Ship | null {
    const stmt = this.db.prepare("SELECT * FROM ships WHERE player_id = ?");
    const row = stmt.get(playerId) as any;
    if (!row) return null;
    return {
      id: row.id,
      playerId: row.player_id,
      systemId: row.system_id,
      parentBodyId: row.parent_body_id,
      orbitalElements: JSON.parse(row.orbital_elements),
      deltaV: row.delta_v,
    };
  }

  updateShipOrbit(
    shipId: string,
    orbitalElements: OrbitalElements,
    deltaV: number
  ): void {
    const stmt = this.db.prepare(
      "UPDATE ships SET orbital_elements = ?, delta_v = ? WHERE id = ?"
    );
    stmt.run(JSON.stringify(orbitalElements), deltaV, shipId);
  }

  getShipsBySystem(systemId: string): Ship[] {
    const stmt = this.db.prepare("SELECT * FROM ships WHERE system_id = ?");
    const rows = stmt.all(systemId) as any[];
    return rows.map((row) => ({
      id: row.id,
      playerId: row.player_id,
      systemId: row.system_id,
      parentBodyId: row.parent_body_id,
      orbitalElements: JSON.parse(row.orbital_elements),
      deltaV: row.delta_v,
    }));
  }

  // Star Gate operations
  createGate(gate: StarGate): void {
    const stmt = this.db.prepare(
      "INSERT INTO star_gates (id, system_id, destination_system_id, orbital_elements, name) VALUES (?, ?, ?, ?, ?)"
    );
    stmt.run(
      gate.id,
      gate.systemId,
      gate.destinationSystemId,
      JSON.stringify(gate.orbitalElements),
      gate.name
    );
  }

  getGatesBySystem(systemId: string): StarGate[] {
    const stmt = this.db.prepare(
      "SELECT * FROM star_gates WHERE system_id = ?"
    );
    const rows = stmt.all(systemId) as any[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      systemId: row.system_id,
      destinationSystemId: row.destination_system_id,
      orbitalElements: JSON.parse(row.orbital_elements),
    }));
  }

  getGateById(gateId: string): StarGate | null {
    const stmt = this.db.prepare("SELECT * FROM star_gates WHERE id = ?");
    const row = stmt.get(gateId) as any;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      systemId: row.system_id,
      destinationSystemId: row.destination_system_id,
      orbitalElements: JSON.parse(row.orbital_elements),
    };
  }

  getExploredGates(playerId: string): string[] {
    const stmt = this.db.prepare(
      "SELECT gate_id FROM explored_gates WHERE player_id = ?"
    );
    const rows = stmt.all(playerId) as any[];
    return rows.map((row) => row.gate_id);
  }

  markGateExploredSingle(playerId: string, gateId: string): void {
    // Mark a single gate as explored (no symmetric marking)
    const stmt = this.db.prepare(
      "INSERT OR IGNORE INTO explored_gates (player_id, gate_id) VALUES (?, ?)"
    );
    stmt.run(playerId, gateId);
  }

  markGateExplored(playerId: string, gateId: string): void {
    // Mark the gate as explored
    this.markGateExploredSingle(playerId, gateId);

    // Also mark the reverse gate (symmetric exploration)
    const gate = this.getGateById(gateId);
    if (gate) {
      // Find the reverse gate
      const reverseGates = this.getGatesBySystem(gate.destinationSystemId);
      const reverseGate = reverseGates.find(
        (g) => g.destinationSystemId === gate.systemId
      );
      if (reverseGate) {
        this.markGateExploredSingle(playerId, reverseGate.id);
      }
    }
  }

  updateGateDestination(gateId: string, newDestinationSystemId: string): void {
    const stmt = this.db.prepare(
      "UPDATE star_gates SET destination_system_id = ? WHERE id = ?"
    );
    stmt.run(newDestinationSystemId, gateId);
  }

  updateGateName(gateId: string, newName: string): void {
    const stmt = this.db.prepare("UPDATE star_gates SET name = ? WHERE id = ?");
    stmt.run(newName, gateId);
  }

  getConnectedSystems(playerId: string): string[] {
    const exploredGates = this.getExploredGates(playerId);
    const systemIds = new Set<string>();

    for (const gateId of exploredGates) {
      const gate = this.getGateById(gateId);
      if (gate) {
        systemIds.add(gate.systemId);
        systemIds.add(gate.destinationSystemId);
      }
    }

    return Array.from(systemIds);
  }

  /**
   * Calculate position for an unexplored gate's future system
   * Uses deterministic algorithm based on gate ID and existing positions
   */
  calculateUnexploredGatePosition(
    gateId: string,
    currentSystemPos: { x: number; y: number; z: number },
    existingPositions: Array<{ x: number; y: number; z: number }>
  ): { x: number; y: number; z: number } {
    const MIN_DISTANCE_LY = 6;

    // Calculate the average Z position of all existing stars to stay in the same plane
    // (Z becomes Y in scene space, which is the vertical axis for the constellation view drag plane)
    let avgZ = currentSystemPos.z;
    if (existingPositions.length > 0) {
      const sumZ = existingPositions.reduce((sum, pos) => sum + pos.z, 0);
      avgZ = sumZ / existingPositions.length;
    }

    // Use gate ID as seed for consistency
    const seed =
      gateId.charCodeAt(0) + gateId.charCodeAt(1) + gateId.charCodeAt(2);

    // Start with a position based on the gate's seed
    // Use golden angle for even distribution in the X-Y plane
    const theta = ((seed * 137.508) % 360) * (Math.PI / 180); // Golden angle
    const distance = 4 + ((seed % 100) / 100) * 4; // 4-8 light years from current

    // Keep Z variation minimal (stay in the plane)
    const zVariation = (((seed * 0.382) % 100) / 100 - 0.5) * 1.5; // ±0.75 light years max

    let position = {
      x: currentSystemPos.x + Math.cos(theta) * distance,
      y: currentSystemPos.y + Math.sin(theta) * distance,
      z: avgZ + zVariation, // Stay close to the average plane
    };

    // Apply collision detection
    let attempts = 0;
    const maxAttempts = 50;

    while (attempts < maxAttempts) {
      let hasCollision = false;

      // Check distance to all existing positions
      for (const existingPos of existingPositions) {
        const dx = position.x - existingPos.x;
        const dy = position.y - existingPos.y;
        const dz = position.z - existingPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < MIN_DISTANCE_LY) {
          hasCollision = true;
          break;
        }
      }

      if (!hasCollision) {
        break; // Found a good position
      }

      // Adjust position using spiral pattern in the X-Y plane
      const angle = attempts * 0.618 * Math.PI * 2; // Golden angle
      const radius = MIN_DISTANCE_LY * (1 + attempts * 0.3);
      const zJitter = (((attempts * 17) % 100) / 100 - 0.5) * 0.5; // Small vertical jitter ±0.25 LY
      position = {
        x: currentSystemPos.x + Math.cos(angle) * radius,
        y: currentSystemPos.y + Math.sin(angle) * radius,
        z: avgZ + zJitter, // Keep near the plane even during collision resolution
      };

      attempts++;
    }

    return position;
  }

  /**
   * Get constellation data for a player
   * Returns all explored systems and their gate connections
   */
  getConstellationData(
    playerId: string,
    currentSystemId: string
  ): {
    systems: StarSystem[];
    connections: Array<{
      fromSystemId: string;
      toSystemId: string;
      isExplored: boolean;
      gateId?: string;
    }>;
    unexploredGates: Array<{
      gateId: string;
      systemId: string;
      position: { x: number; y: number; z: number };
    }>;
    customPositions: Record<string, { x: number; y: number; z: number }>;
  } {
    const player = this.getPlayerById(playerId);
    if (!player) {
      return {
        systems: [],
        connections: [],
        unexploredGates: [],
        customPositions: {},
      };
    }

    const exploredGateIds = new Set(this.getExploredGates(playerId));
    const systemIds = new Set<string>();
    const connections: Array<{
      fromSystemId: string;
      toSystemId: string;
      isExplored: boolean;
      gateId?: string;
    }> = [];

    // Build full constellation from all explored gates
    // Start with current system
    systemIds.add(currentSystemId);

    // Get all explored gate objects
    const exploredGates: StarGate[] = [];
    for (const gateId of Array.from(exploredGateIds)) {
      const gate = this.getGateById(gateId);
      if (gate) {
        exploredGates.push(gate);
        // Add both systems connected by this explored gate
        systemIds.add(gate.systemId);
        systemIds.add(gate.destinationSystemId);
      }
    }

    // Process all systems in the constellation
    const processedSystems = new Set<string>();
    const systemsToProcess = Array.from(systemIds);

    for (const systemId of systemsToProcess) {
      if (processedSystems.has(systemId)) continue;
      processedSystems.add(systemId);

      // Get all gates from this system
      const systemGates = this.getGatesBySystem(systemId);

      for (const gate of systemGates) {
        const isExplored = exploredGateIds.has(gate.id);

        // Skip placeholder gates (not yet generated systems)
        if (gate.destinationSystemId.startsWith("PLACEHOLDER_")) {
          continue;
        }

        // Add connection
        connections.push({
          fromSystemId: gate.systemId,
          toSystemId: gate.destinationSystemId,
          isExplored,
          gateId: isExplored ? gate.id : undefined,
        });

        // Add destination system to constellation (for both explored and unexplored gates)
        // This allows us to show unexplored tunnels with purple spheres at their destinations
        systemIds.add(gate.destinationSystemId);
      }
    }

    // Fetch all system data
    const systems: StarSystem[] = [];
    for (const systemId of Array.from(systemIds)) {
      const system = this.getStarSystem(systemId);
      if (system) {
        systems.push(system);
      }
    }

    // Get custom constellation positions for this player (need this early for return statements)
    const customPositions = this.getConstellationPositions(playerId);

    // Get unexplored gates from ALL explored systems (for mystery positions)
    const unexploredGates: Array<{
      gateId: string;
      systemId: string;
      position: { x: number; y: number; z: number };
    }> = [];

    // Collect all existing star positions (in galaxy coordinates)
    const existingPositions: Array<{ x: number; y: number; z: number }> = [];
    for (const system of systems) {
      existingPositions.push(system.position);
    }

    // Process unexplored gates from all explored systems in the constellation
    for (const system of systems) {
      const systemGates = this.getGatesBySystem(system.id);

      for (const gate of systemGates) {
        // Only include unexplored placeholder gates
        if (
          !exploredGateIds.has(gate.id) &&
          gate.destinationSystemId.startsWith("PLACEHOLDER_")
        ) {
          // Calculate position using shared helper function
          const allPositions = [
            ...existingPositions,
            ...unexploredGates.map((g) => g.position),
          ];
          const position = this.calculateUnexploredGatePosition(
            gate.id,
            system.position,
            allPositions
          );

          unexploredGates.push({
            gateId: gate.id,
            systemId: gate.systemId,
            position,
          });
        }
      }
    }

    return { systems, connections, unexploredGates, customPositions };
  }

  /**
   * Get custom constellation positions for a player
   */
  getConstellationPositions(
    playerId: string
  ): Record<string, { x: number; y: number; z: number }> {
    const stmt = this.db.prepare(
      "SELECT constellation_positions FROM players WHERE id = ?"
    );
    const row = stmt.get(playerId) as any;
    if (!row || !row.constellation_positions) {
      return {};
    }
    try {
      return JSON.parse(row.constellation_positions);
    } catch (e) {
      console.error("Error parsing constellation positions:", e);
      return {};
    }
  }

  /**
   * Save custom constellation positions for a player
   */
  saveConstellationPositions(
    playerId: string,
    positions: Record<string, { x: number; y: number; z: number }>
  ): void {
    const stmt = this.db.prepare(
      "UPDATE players SET constellation_positions = ? WHERE id = ?"
    );
    stmt.run(JSON.stringify(positions), playerId);
  }

  /**
   * When a gate is explored, transfer the mystery sphere position to the new system
   */
  transferMysteryPositionToSystem(
    playerId: string,
    gateId: string,
    newSystemId: string
  ): void {
    const positions = this.getConstellationPositions(playerId);
    const mysteryKey = `mystery_${gateId}`;

    if (positions[mysteryKey]) {
      // Transfer mystery position to the new system
      positions[newSystemId] = positions[mysteryKey];
      // Remove the mystery position
      delete positions[mysteryKey];
      // Save updated positions
      this.saveConstellationPositions(playerId, positions);
      console.log(
        `Transferred mystery position for gate ${gateId} to system ${newSystemId}`
      );
    }
  }
}
