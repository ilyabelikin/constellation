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
        companionStars: system.companionStars, // Save companion stars for binary/trinary systems
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
      companionStars: data.companionStars, // Load companion stars
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
        companionStars: data.companionStars, // Load companion stars
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

  updatePlayerName(playerId: string, name: string): void {
    const stmt = this.db.prepare(
      "UPDATE players SET name = ? WHERE id = ?"
    );
    stmt.run(name, playerId);
  }

  getPlayersByGalaxy(galaxyId: string): Player[] {
    const stmt = this.db.prepare("SELECT * FROM players WHERE galaxy_id = ?");
    const rows = stmt.all(galaxyId) as any[];
    return rows.map((row) => {
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
    });
  }

  getExploredSystemsByPlayer(playerId: string): Set<string> {
    // Get all systems explored by a player
    // A system is "explored" if the player has explored at least one gate in that system
    const exploredGates = this.getExploredGates(playerId);
    const systemIds = new Set<string>();
    
    for (const gateId of exploredGates) {
      const gate = this.getGateById(gateId);
      if (gate) {
        systemIds.add(gate.systemId);
        // Also add destination system if it's not a placeholder
        if (!gate.destinationSystemId.startsWith("PLACEHOLDER_")) {
          systemIds.add(gate.destinationSystemId);
        }
      }
    }
    
    return systemIds;
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

  // System discovery operations
  recordSystemDiscovery(systemId: string, playerId: string): void {
    const stmt = this.db.prepare(
      "INSERT OR IGNORE INTO system_discoveries (system_id, player_id, discovered_at) VALUES (?, ?, ?)"
    );
    stmt.run(systemId, playerId, Date.now());
  }

  getSystemDiscoverers(systemId: string): Player[] {
    const stmt = this.db.prepare(`
      SELECT p.* FROM players p
      INNER JOIN system_discoveries sd ON p.id = sd.player_id
      WHERE sd.system_id = ?
      ORDER BY sd.discovered_at ASC
    `);
    const rows = stmt.all(systemId) as any[];
    return rows.map((row) => {
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
    });
  }

  getMetPlayers(playerId: string): Player[] {
    // Get all players that this player has "met" (visited each other's discovered systems)
    const stmt = this.db.prepare(`
      SELECT DISTINCT p.* FROM players p
      INNER JOIN system_discoveries sd1 ON p.id = sd1.player_id
      INNER JOIN system_discoveries sd2 ON sd1.system_id = sd2.system_id
      WHERE sd2.player_id = ? AND p.id != ?
    `);
    const rows = stmt.all(playerId, playerId) as any[];
    return rows.map((row) => ({
      id: row.id,
      uuid: row.uuid,
      name: row.name,
      galaxyId: row.galaxy_id,
      homeSystemId: row.home_system_id,
      homePlanetId: row.home_planet_id,
      currentSystemId: row.current_system_id,
      shipId: "",
      exploredGateIds: [],
    }));
  }

  getPlayerStarsDiscoveredCount(playerId: string): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM system_discoveries
      WHERE player_id = ?
    `);
    const row = stmt.get(playerId) as any;
    return row?.count || 0;
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
   * Check if two line segments intersect in 2D (X-Y plane)
   * Used to avoid crossing constellation paths
   */
  private doLinesIntersect(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    p4: { x: number; y: number }
  ): boolean {
    const det = (p2.x - p1.x) * (p4.y - p3.y) - (p4.x - p3.x) * (p2.y - p1.y);
    if (Math.abs(det) < 0.0001) return false; // Parallel lines

    const t =
      ((p3.x - p1.x) * (p4.y - p3.y) - (p4.x - p3.x) * (p3.y - p1.y)) / det;
    const u =
      ((p3.x - p1.x) * (p2.y - p1.y) - (p2.x - p1.x) * (p3.y - p1.y)) / det;

    // Check if intersection is within both line segments
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  /**
   * Calculate distance from a point to a line segment in 2D
   */
  private distanceToLineSegment(
    point: { x: number; y: number },
    lineStart: { x: number; y: number },
    lineEnd: { x: number; y: number }
  ): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      // Line segment is a point
      const pdx = point.x - lineStart.x;
      const pdy = point.y - lineStart.y;
      return Math.sqrt(pdx * pdx + pdy * pdy);
    }

    // Calculate projection parameter
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) /
          lengthSquared
      )
    );

    // Calculate closest point on segment
    const closestX = lineStart.x + t * dx;
    const closestY = lineStart.y + t * dy;

    // Calculate distance
    const pdx = point.x - closestX;
    const pdy = point.y - closestY;
    return Math.sqrt(pdx * pdx + pdy * pdy);
  }

  /**
   * Calculate angular density of stars in a direction (how crowded is this direction?)
   */
  private calculateAngularDensity(
    fromPos: { x: number; y: number; z: number },
    targetAngle: number,
    existingPositions: Array<{ x: number; y: number; z: number }>,
    angularWindow: number = Math.PI / 6 // 30 degree window
  ): number {
    let density = 0;

    for (const pos of existingPositions) {
      if (pos.x === fromPos.x && pos.y === fromPos.y && pos.z === fromPos.z)
        continue;

      const dx = pos.x - fromPos.x;
      const dy = pos.y - fromPos.y;
      const angle = Math.atan2(dy, dx);

      // Calculate angular difference (handling wraparound)
      let angleDiff = Math.abs(angle - targetAngle);
      if (angleDiff > Math.PI) {
        angleDiff = 2 * Math.PI - angleDiff;
      }

      // If star is within the angular window, add to density
      if (angleDiff < angularWindow) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        // Closer stars contribute more to density
        density += 1 / Math.max(distance, 1);
      }
    }

    return density;
  }

  /**
   * Calculate how many stars are in the general direction (cluster detection)
   */
  private countStarsInDirection(
    fromPos: { x: number; y: number; z: number },
    targetPos: { x: number; y: number; z: number },
    existingPositions: Array<{ x: number; y: number; z: number }>,
    maxDistance: number = 15
  ): number {
    const targetDx = targetPos.x - fromPos.x;
    const targetDy = targetPos.y - fromPos.y;
    const targetAngle = Math.atan2(targetDy, targetDx);

    let count = 0;
    for (const pos of existingPositions) {
      if (pos.x === fromPos.x && pos.y === fromPos.y && pos.z === fromPos.z)
        continue;

      const dx = pos.x - fromPos.x;
      const dy = pos.y - fromPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > maxDistance) continue;

      const angle = Math.atan2(dy, dx);
      let angleDiff = Math.abs(angle - targetAngle);
      if (angleDiff > Math.PI) {
        angleDiff = 2 * Math.PI - angleDiff;
      }

      // Count stars within 45 degrees of the target direction
      if (angleDiff < Math.PI / 4) {
        count++;
      }
    }

    return count;
  }

  /**
   * Score a position based on multiple criteria (lower is better)
   * Heavily emphasizes free space and avoiding visual crossings
   */
  private scorePosition(
    candidate: { x: number; y: number; z: number },
    fromPos: { x: number; y: number; z: number },
    existingPositions: Array<{ x: number; y: number; z: number }>,
    existingConnections: Array<{
      from: { x: number; y: number; z: number };
      to: { x: number; y: number; z: number };
    }>
  ): number {
    let score = 0;

    // 1. Prefer moderate distances (not too far, not too close)
    const dx = candidate.x - fromPos.x;
    const dy = candidate.y - fromPos.y;
    const dz = candidate.z - fromPos.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const idealDistance = 4.5;
    score += Math.abs(distance - idealDistance) * 3;

    // 2. HEAVILY penalize visual line crossings in 2D (XY plane - camera view)
    let crossingCount = 0;
    for (const connection of existingConnections) {
      if (
        this.doLinesIntersect(
          { x: fromPos.x, y: fromPos.y },
          { x: candidate.x, y: candidate.y },
          { x: connection.from.x, y: connection.from.y },
          { x: connection.to.x, y: connection.to.y }
        )
      ) {
        crossingCount++;
      }
    }
    score += crossingCount * 200; // VERY heavy penalty for visual crossings

    // 3. Penalize proximity to existing lines (avoid near-misses in 2D view)
    let minLineDistance = Infinity;
    for (const connection of existingConnections) {
      const dist = this.distanceToLineSegment(
        { x: candidate.x, y: candidate.y },
        { x: connection.from.x, y: connection.from.y },
        { x: connection.to.x, y: connection.to.y }
      );
      minLineDistance = Math.min(minLineDistance, dist);
    }
    if (minLineDistance < 4) {
      score += (4 - minLineDistance) * 15;
    }

    // 4. HEAVILY penalize directions towards star clusters
    const starsInDirection = this.countStarsInDirection(
      fromPos,
      candidate,
      existingPositions,
      15
    );
    score += starsInDirection * 50; // Heavy penalty for each star in this direction

    // 5. Penalize angular density (prefer empty directions)
    const candidateAngle = Math.atan2(
      candidate.y - fromPos.y,
      candidate.x - fromPos.x
    );
    const angularDensity = this.calculateAngularDensity(
      fromPos,
      candidateAngle,
      existingPositions,
      Math.PI / 4 // 45 degree window
    );
    score += angularDensity * 30; // Penalty for crowded directions

    // 6. Penalize proximity to any existing star
    let minStarDistance = Infinity;
    for (const pos of existingPositions) {
      if (pos.x === fromPos.x && pos.y === fromPos.y && pos.z === fromPos.z)
        continue;
      const starDist = Math.sqrt(
        (candidate.x - pos.x) ** 2 +
          (candidate.y - pos.y) ** 2 +
          (candidate.z - pos.z) ** 2
      );
      minStarDistance = Math.min(minStarDistance, starDist);
    }
    if (minStarDistance < 8) {
      score += (8 - minStarDistance) * 8;
    }

    return score;
  }

  /**
   * Calculate position for an unexplored gate's future system
   * Uses intelligent algorithm that considers existing connections and avoids crossings
   */
  calculateUnexploredGatePosition(
    gateId: string,
    currentSystemPos: { x: number; y: number; z: number },
    existingPositions: Array<{ x: number; y: number; z: number }>,
    existingConnections?: Array<{
      from: { x: number; y: number; z: number };
      to: { x: number; y: number; z: number };
    }>
  ): { x: number; y: number; z: number } {
    const MIN_DISTANCE_LY = 6;
    const PREFERRED_MIN_DISTANCE = 3.5; // Try to place closer if possible
    const PREFERRED_MAX_DISTANCE = 6; // Don't go too far

    // Calculate the average Z position of all existing stars to stay in the same plane
    let avgZ = currentSystemPos.z;
    if (existingPositions.length > 0) {
      const sumZ = existingPositions.reduce((sum, pos) => sum + pos.z, 0);
      avgZ = sumZ / existingPositions.length;
    }

    // Use gate ID as seed for consistency
    const seed =
      gateId.charCodeAt(0) + gateId.charCodeAt(1) + gateId.charCodeAt(2);

    const connections = existingConnections || [];

    // Try multiple candidate positions and pick the best one
    const candidates: Array<{
      x: number;
      y: number;
      z: number;
      score: number;
    }> = [];

    // Generate candidates with MORE angles and distances for better coverage
    const angleSteps = 32; // Try 32 different angles (every 11.25 degrees)
    const distanceSteps = 4; // Try 4 different distances

    for (let angleIdx = 0; angleIdx < angleSteps; angleIdx++) {
      for (let distIdx = 0; distIdx < distanceSteps; distIdx++) {
        // Use deterministic angle based on seed and index
        // Start with seed-based angle, then sample around the circle
        const baseAngle =
          ((seed * 137.508 + angleIdx * (360 / angleSteps)) % 360) *
          (Math.PI / 180);
        const distance =
          PREFERRED_MIN_DISTANCE +
          (distIdx * (PREFERRED_MAX_DISTANCE - PREFERRED_MIN_DISTANCE)) /
            Math.max(distanceSteps - 1, 1);

        // Small Z variation
        const zVariation =
          (((seed * 0.382 + angleIdx * 7 + distIdx * 3) % 100) / 100 - 0.5) *
          1.0;

        const candidate = {
          x: currentSystemPos.x + Math.cos(baseAngle) * distance,
          y: currentSystemPos.y + Math.sin(baseAngle) * distance,
          z: avgZ + zVariation,
          score: 0,
        };

        // Check for collisions with existing positions
        let hasCollision = false;
        for (const existingPos of existingPositions) {
          const dx = candidate.x - existingPos.x;
          const dy = candidate.y - existingPos.y;
          const dz = candidate.z - existingPos.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (dist < MIN_DISTANCE_LY) {
            hasCollision = true;
            break;
          }
        }

        if (!hasCollision) {
          // Score this position
          candidate.score = this.scorePosition(
            candidate,
            currentSystemPos,
            existingPositions,
            connections
          );
          candidates.push(candidate);
        }
      }
    }

    // If we found good candidates, return the best one
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.score - b.score);
      const best = candidates[0];

      // Log scoring info for debugging
      console.log(
        `Gate ${gateId.substring(0, 8)}: Best score ${best.score.toFixed(
          2
        )} at angle ${
          Math.atan2(best.y - currentSystemPos.y, best.x - currentSystemPos.x) *
          (180 / Math.PI)
        }°, distance ${Math.sqrt(
          (best.x - currentSystemPos.x) ** 2 +
            (best.y - currentSystemPos.y) ** 2
        ).toFixed(2)} LY`
      );

      return { x: best.x, y: best.y, z: best.z };
    }

    // Fallback: If no good candidates found, use spiral pattern (old algorithm)
    let position = {
      x:
        currentSystemPos.x +
        Math.cos(((seed * 137.508) % 360) * (Math.PI / 180)) *
          PREFERRED_MAX_DISTANCE,
      y:
        currentSystemPos.y +
        Math.sin(((seed * 137.508) % 360) * (Math.PI / 180)) *
          PREFERRED_MAX_DISTANCE,
      z: avgZ,
    };

    let attempts = 0;
    const maxAttempts = 50;

    while (attempts < maxAttempts) {
      let hasCollision = false;

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
        break;
      }

      // Adjust position using spiral pattern
      const angle = attempts * 0.618 * Math.PI * 2;
      const radius = MIN_DISTANCE_LY * (1 + attempts * 0.3);
      const zJitter = (((attempts * 17) % 100) / 100 - 0.5) * 0.5;
      position = {
        x: currentSystemPos.x + Math.cos(angle) * radius,
        y: currentSystemPos.y + Math.sin(angle) * radius,
        z: avgZ + zJitter,
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

        // Only add destination system if this gate is explored
        // Unexplored gates will show mystery spheres at calculated positions, not the actual system
        if (isExplored) {
          systemIds.add(gate.destinationSystemId);
        }
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
    const systemPositionMap = new Map<
      string,
      { x: number; y: number; z: number }
    >();
    for (const system of systems) {
      existingPositions.push(system.position);
      systemPositionMap.set(system.id, system.position);
    }

    // Build connection position data for smart positioning
    const connectionPositions: Array<{
      from: { x: number; y: number; z: number };
      to: { x: number; y: number; z: number };
    }> = [];

    for (const connection of connections) {
      const fromPos = systemPositionMap.get(connection.fromSystemId);
      const toPos = systemPositionMap.get(connection.toSystemId);
      if (fromPos && toPos) {
        connectionPositions.push({
          from: fromPos,
          to: toPos,
        });
      }
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
          // Calculate position using shared helper function with connection awareness
          const allPositions = [
            ...existingPositions,
            ...unexploredGates.map((g) => g.position),
          ];

          // Build connections including already-placed unexplored gates
          const allConnections = [
            ...connectionPositions,
            ...unexploredGates.map((g) => ({
              from: systemPositionMap.get(g.systemId)!,
              to: g.position,
            })),
          ];

          const position = this.calculateUnexploredGatePosition(
            gate.id,
            system.position,
            allPositions,
            allConnections
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
