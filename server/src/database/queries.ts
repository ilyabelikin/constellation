import Database from "better-sqlite3";
import {
  Galaxy,
  StarSystem,
  Player,
  Ship,
  StarGate,
  Tunnel,
  Vector3,
  OrbitalElements,
  TIME_SCALE_DEFAULT,
  MiningOperation,
  MAX_ALLOY_STOCKPILE,
  MAX_SCIENCE_STOCKPILE,
  Megastructure,
  Species,
  Colony,
  NativeCivilization,
  BASE_POPULATION_DENSITY,
  calculateColonyYields,
} from "@constellation/shared";

export class DatabaseQueries {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  // Expose raw database for custom queries
  public rawDb(): Database.Database {
    return this.db;
  }

  // Galaxy operations
  createGalaxy(galaxy: Galaxy): void {
    const stmt = this.db.prepare(
      "INSERT INTO galaxies (id, name, seed, created_at, current_time, is_paused, time_scale) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    stmt.run(
      galaxy.id,
      galaxy.name,
      galaxy.seed,
      galaxy.createdAt,
      0,
      1,
      TIME_SCALE_DEFAULT
    );
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
      currentTime: row.current_time || 0,
      isPaused: row.is_paused === 1,
      timeScale: row.time_scale || TIME_SCALE_DEFAULT,
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
      currentTime: row.current_time || 0,
      isPaused: row.is_paused === 1,
      timeScale: row.time_scale || TIME_SCALE_DEFAULT,
    };
  }

  updateGalaxyTimeState(
    galaxyId: string,
    currentTime: number,
    isPaused: boolean,
    timeScale: number
  ): void {
    const stmt = this.db.prepare(
      "UPDATE galaxies SET current_time = ?, is_paused = ?, time_scale = ? WHERE id = ?"
    );
    stmt.run(currentTime, isPaused ? 1 : 0, timeScale, galaxyId);
  }

  // Get all galaxies with statistics
  getAllGalaxiesWithStats(): Array<{
    id: string;
    name: string;
    createdAt: number;
    currentTime: number;
    starCount: number;
    habitablePlanets: number;
    activePlayers: number;
    lastActivity: number;
  }> {
    const galaxies = this.db
      .prepare("SELECT * FROM galaxies ORDER BY created_at DESC")
      .all() as any[];

    return galaxies.map((galaxy) => {
      // Count stars in galaxy
      const starCount = (
        this.db
          .prepare(
            "SELECT COUNT(*) as count FROM star_systems WHERE galaxy_id = ?"
          )
          .get(galaxy.id) as any
      ).count;

      // Count habitable planets (this is an approximation - we parse JSON to count)
      const systems = this.db
        .prepare("SELECT generated_data FROM star_systems WHERE galaxy_id = ?")
        .all(galaxy.id) as any[];

      let habitablePlanets = 0;
      systems.forEach((system) => {
        const data = JSON.parse(system.generated_data);
        if (data.planets) {
          habitablePlanets += data.planets.filter(
            (p: any) => p.habitability && p.habitability > 0.5
          ).length;
        }
      });

      // Count active players (last active in last 24 hours)
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const activePlayers = (
        this.db
          .prepare(
            "SELECT COUNT(*) as count FROM players WHERE galaxy_id = ? AND last_active_at > ?"
          )
          .get(galaxy.id, oneDayAgo) as any
      ).count;

      // Get last activity timestamp
      const lastActivityRow = this.db
        .prepare(
          "SELECT MAX(last_active_at) as last_activity FROM players WHERE galaxy_id = ?"
        )
        .get(galaxy.id) as any;
      const lastActivity = lastActivityRow?.last_activity || galaxy.created_at;

      return {
        id: galaxy.id,
        name: galaxy.name,
        createdAt: galaxy.created_at,
        currentTime: galaxy.current_time || 0,
        starCount,
        habitablePlanets,
        activePlayers,
        lastActivity,
      };
    });
  }

  // Clean up old galaxies (no activity in more than 1 week)
  cleanupOldGalaxies(): number {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    // Find galaxies with no recent activity
    const oldGalaxies = this.db
      .prepare(
        `
        SELECT g.id, g.name 
        FROM galaxies g
        LEFT JOIN players p ON g.id = p.galaxy_id
        GROUP BY g.id
        HAVING MAX(COALESCE(p.last_active_at, 0)) < ?
      `
      )
      .all(oneWeekAgo) as any[];

    // Delete each old galaxy
    oldGalaxies.forEach((galaxy) => {
      console.log(`Cleaning up old galaxy: ${galaxy.name} (${galaxy.id})`);
      this.deleteGalaxy(galaxy.id);
    });

    return oldGalaxies.length;
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

    // Load mining operations for this system
    const miningOperations = this.getMiningOperationsBySystem(row.id);

    // Load megastructures for this system
    const megastructures = this.getMegastructuresBySystem(row.id);

    // Load colonies for this system
    const colonies = this.getColoniesBySystemId(row.id);

    // Load native civilizations for this system
    const nativeCivilizations = this.getNativeCivilizationsBySystemId(row.id);

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
      miningOperations,
      megastructures,
      colonies,
      nativeCivilizations,
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
      "INSERT INTO players (id, uuid, name, galaxy_id, home_system_id, home_planet_id, current_system_id, energy, alloy, science, species_id, last_active_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    stmt.run(
      player.id,
      player.uuid,
      player.name,
      player.galaxyId,
      player.homeSystemId,
      player.homePlanetId,
      player.currentSystemId,
      player.energy || 0,
      player.alloy || 0,
      player.science || 0,
      player.speciesId || null,
      Date.now()
    );
  }

  updatePlayerActivity(playerId: string): void {
    const stmt = this.db.prepare(
      "UPDATE players SET last_active_at = ? WHERE id = ?"
    );
    stmt.run(Date.now(), playerId);
  }

  deletePlayer(playerId: string): void {
    const stmt = this.db.prepare("DELETE FROM players WHERE id = ?");
    stmt.run(playerId);
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
      energy: row.energy ?? 0,
      alloy: row.alloy ?? 0,
      science: row.science ?? 0,
      speciesId: row.species_id || undefined,
    };
  }

  getPlayersByGalaxyId(galaxyId: string): Player[] {
    const stmt = this.db.prepare("SELECT * FROM players WHERE galaxy_id = ?");
    const rows = stmt.all(galaxyId) as any[];
    return rows.map((row) => {
      const exploredGateIds = this.getExploredGates(row.id);
      const miningOperations = this.getMiningOperationsByPlayer(row.id);
      const alloyFromMining = miningOperations.reduce(
        (sum, op) => sum + op.alloyPerDay,
        0
      );
      const megastructures = this.getMegastructuresByPlayer(row.id);
      const energyFromMegastructures = megastructures
        .filter((m) => m.resourceType === "energy")
        .reduce((sum, m) => sum + (m.resourcePerDay || 0), 0);
      const colonies = this.getColoniesByPlayerId(row.id);
      const scienceFromColonies = colonies.reduce(
        (sum, c) => sum + c.sciencePerDay,
        0
      );

      return {
        id: row.id,
        uuid: row.uuid,
        name: row.name,
        galaxyId: row.galaxy_id,
        homeSystemId: row.home_system_id,
        homePlanetId: row.home_planet_id,
        currentSystemId: row.current_system_id,
        shipId: row.ship_id || "",
        exploredGateIds,
        energy: row.energy,
        alloy: row.alloy,
        science: row.science || 0,
        energyPerDay: energyFromMegastructures,
        alloyPerDay: alloyFromMining,
        sciencePerDay: scienceFromColonies,
        speciesId: row.species_id,
      };
    });
  }

  getPlayerById(id: string): Player | null {
    const stmt = this.db.prepare("SELECT * FROM players WHERE id = ?");
    const row = stmt.get(id) as any;
    if (!row) return null;
    const exploredGateIds = this.getExploredGates(row.id);

    // Calculate total income rates
    const miningOperations = this.getMiningOperationsByPlayer(row.id);
    const alloyFromMining = miningOperations.reduce(
      (sum, op) => sum + op.alloyPerDay,
      0
    );

    const megastructures = this.getMegastructuresByPlayer(row.id);
    const energyFromMegastructures = megastructures
      .filter((m) => m.resourceType === "energy")
      .reduce((sum, m) => sum + (m.resourcePerDay || 0), 0);

    const colonies = this.getColoniesByPlayerId(row.id);
    const scienceFromColonies = colonies.reduce(
      (sum, col) => sum + col.sciencePerDay,
      0
    );
    const alloyFromColonies = colonies.reduce(
      (sum, col) => sum + col.alloyPerDay,
      0
    );

    // Calculate defense platform maintenance costs
    const defenses = this.getGateDefensesByPlayer(row.id);
    const alloyCostFromDefenses = defenses.reduce(
      (sum, def) => sum + def.maintenanceAlloyPerDay,
      0
    );

    // Calculate resource flow and blockades
    // Note: Resource flow calculation has been moved to a separate method to avoid circular dependencies
    // For now, we don't calculate blockades in this method
    let blockedEnergy = 0;
    let blockedAlloy = 0;
    let blockedScience = 0;

    // Total income minus blockades and maintenance costs
    const energyPerDay = energyFromMegastructures - blockedEnergy;
    const alloyPerDay = alloyFromMining + alloyFromColonies - blockedAlloy - alloyCostFromDefenses;
    const sciencePerDay = scienceFromColonies - blockedScience;

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
      energy: row.energy ?? 0,
      alloy: row.alloy ?? 0,
      science: row.science ?? 0,
      energyPerDay,
      alloyPerDay,
      sciencePerDay,
      speciesId: row.species_id || undefined,
    };
  }

  updatePlayerCurrentSystem(playerId: string, systemId: string): void {
    const stmt = this.db.prepare(
      "UPDATE players SET current_system_id = ? WHERE id = ?"
    );
    stmt.run(systemId, playerId);
  }

  updatePlayerName(playerId: string, name: string): void {
    const stmt = this.db.prepare("UPDATE players SET name = ? WHERE id = ?");
    stmt.run(name, playerId);
  }

  // Resource management
  updatePlayerResources(
    playerId: string,
    energy: number,
    alloy: number,
    science: number
  ): void {
    const stmt = this.db.prepare(
      "UPDATE players SET energy = ?, alloy = ?, science = ? WHERE id = ?"
    );
    stmt.run(energy, alloy, science, playerId);
  }

  getPlayerResources(
    playerId: string
  ): { energy: number; alloy: number; science: number } | null {
    const stmt = this.db.prepare(
      "SELECT energy, alloy, science FROM players WHERE id = ?"
    );
    const row = stmt.get(playerId) as any;
    if (!row) return null;
    return {
      energy: row.energy ?? 0,
      alloy: row.alloy ?? 0,
      science: row.science ?? 0,
    };
  }

  deductPlayerEnergy(playerId: string, amount: number): boolean {
    const resources = this.getPlayerResources(playerId);
    if (!resources || resources.energy < amount) {
      return false; // Not enough energy
    }
    const stmt = this.db.prepare(
      "UPDATE players SET energy = energy - ? WHERE id = ?"
    );
    stmt.run(amount, playerId);
    return true;
  }

  deductPlayerAlloy(playerId: string, amount: number): boolean {
    const resources = this.getPlayerResources(playerId);
    if (!resources || resources.alloy < amount) {
      return false; // Not enough alloy
    }
    const stmt = this.db.prepare(
      "UPDATE players SET alloy = alloy - ? WHERE id = ?"
    );
    stmt.run(amount, playerId);
    return true;
  }

  deductPlayerScience(playerId: string, amount: number): boolean {
    const resources = this.getPlayerResources(playerId);
    if (!resources || resources.science < amount) {
      return false; // Not enough science
    }
    const stmt = this.db.prepare(
      "UPDATE players SET science = science - ? WHERE id = ?"
    );
    stmt.run(amount, playerId);
    return true;
  }

  addPlayerEnergy(playerId: string, amount: number): void {
    const stmt = this.db.prepare(
      "UPDATE players SET energy = energy + ? WHERE id = ?"
    );
    stmt.run(amount, playerId);
  }

  addPlayerAlloy(playerId: string, amount: number): void {
    // Cap alloy at maximum stockpile
    const stmt = this.db.prepare(
      `UPDATE players SET alloy = MIN(alloy + ?, ${MAX_ALLOY_STOCKPILE}) WHERE id = ?`
    );
    stmt.run(amount, playerId);
  }

  addPlayerScience(playerId: string, amount: number): void {
    // Cap science at maximum stockpile
    const stmt = this.db.prepare(
      `UPDATE players SET science = MIN(science + ?, ${MAX_SCIENCE_STOCKPILE}) WHERE id = ?`
    );
    stmt.run(amount, playerId);
  }

  // Mining operations
  createMiningOperation(
    id: string,
    playerId: string,
    systemId: string,
    celestialBodyId: string,
    alloyPerDay: number,
    establishedAt: number,
    totalAlloyLimit: number,
    alloyMined: number = 0
  ): void {
    const stmt = this.db.prepare(
      "INSERT INTO mining_operations (id, player_id, system_id, celestial_body_id, alloy_per_day, established_at, last_yield_at, total_alloy_limit, alloy_mined) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    stmt.run(
      id,
      playerId,
      systemId,
      celestialBodyId,
      alloyPerDay,
      establishedAt,
      establishedAt,
      totalAlloyLimit,
      alloyMined
    );
  }

  getMiningOperationsByPlayer(playerId: string): any[] {
    const stmt = this.db.prepare(
      "SELECT * FROM mining_operations WHERE player_id = ?"
    );
    const rows = stmt.all(playerId) as any[];
    return rows.map((row) => ({
      id: row.id,
      playerId: row.player_id,
      systemId: row.system_id,
      celestialBodyId: row.celestial_body_id,
      alloyPerDay: row.alloy_per_day,
      establishedAt: row.established_at,
      lastYieldAt: row.last_yield_at,
      totalAlloyLimit: row.total_alloy_limit || 50.0,
      alloyMined: row.alloy_mined || 0.0,
    }));
  }

  getMiningOperationsBySystem(systemId: string): any[] {
    const stmt = this.db.prepare(
      "SELECT * FROM mining_operations WHERE system_id = ?"
    );
    const rows = stmt.all(systemId) as any[];
    return rows.map((row) => ({
      id: row.id,
      playerId: row.player_id,
      systemId: row.system_id,
      celestialBodyId: row.celestial_body_id,
      alloyPerDay: row.alloy_per_day,
      establishedAt: row.established_at,
      lastYieldAt: row.last_yield_at,
      totalAlloyLimit: row.total_alloy_limit || 50.0,
      alloyMined: row.alloy_mined || 0.0,
    }));
  }

  getMiningOperationByCelestialBody(celestialBodyId: string): any | null {
    const stmt = this.db.prepare(
      "SELECT * FROM mining_operations WHERE celestial_body_id = ?"
    );
    const row = stmt.get(celestialBodyId) as any;
    if (!row) return null;
    return {
      id: row.id,
      playerId: row.player_id,
      systemId: row.system_id,
      celestialBodyId: row.celestial_body_id,
      alloyPerDay: row.alloy_per_day,
      establishedAt: row.established_at,
      lastYieldAt: row.last_yield_at,
      totalAlloyLimit: row.total_alloy_limit || 50.0,
      alloyMined: row.alloy_mined || 0.0,
    };
  }

  updateMiningOperationYield(
    miningOperationId: string,
    lastYieldAt: number,
    alloyMined: number
  ): void {
    const stmt = this.db.prepare(
      "UPDATE mining_operations SET last_yield_at = ?, alloy_mined = ? WHERE id = ?"
    );
    stmt.run(lastYieldAt, alloyMined, miningOperationId);
  }

  deleteMiningOperation(miningOperationId: string): void {
    const stmt = this.db.prepare("DELETE FROM mining_operations WHERE id = ?");
    stmt.run(miningOperationId);
  }

  processMiningYields(currentTime: number): void {
    // Get all mining operations
    const stmt = this.db.prepare("SELECT * FROM mining_operations");
    const rows = stmt.all() as any[];
    const operationsToDelete: Array<{ id: string; playerId: string }> = [];
    const MAX_ALLOY_STOCKPILE = 500; // Maximum alloy storage capacity

    for (const row of rows) {
      const timeSinceLastYield = currentTime - row.last_yield_at;
      const daysElapsed = timeSinceLastYield / (24 * 60 * 60);

      if (daysElapsed >= 1) {
        // Get player's current alloy
        const player = this.getPlayerById(row.player_id);
        if (!player) continue;

        const currentAlloy = player.alloy || 0;
        const storageAvailable = MAX_ALLOY_STOCKPILE - currentAlloy;

        // If storage is full, skip this operation (it will automatically resume when space is available)
        if (storageAvailable <= 0) {
          console.log(
            `Mining operation ${row.id} paused: storage full (${currentAlloy}/${MAX_ALLOY_STOCKPILE})`
          );
          continue;
        }

        // Award resources for full days
        const fullDays = Math.floor(daysElapsed);
        let alloyToAdd = row.alloy_per_day * fullDays;

        // Get current mined amount and limit
        const currentlyMined = row.alloy_mined || 0;
        const totalLimit = row.total_alloy_limit || 50.0;
        const remainingAlloy = totalLimit - currentlyMined;

        // Cap the alloy to add if it would exceed the asteroid limit
        if (alloyToAdd > remainingAlloy) {
          alloyToAdd = remainingAlloy;
        }

        // Cap the alloy to add if it would exceed storage capacity
        if (alloyToAdd > storageAvailable) {
          alloyToAdd = storageAvailable;
        }

        // Only add if there's still alloy to mine
        if (alloyToAdd > 0) {
          // Add alloy to player
          this.addPlayerAlloy(row.player_id, alloyToAdd);

          // Update last yield time and total mined
          const newLastYieldAt = row.last_yield_at + fullDays * 24 * 60 * 60;
          const newAlloyMined = currentlyMined + alloyToAdd;
          this.updateMiningOperationYield(
            row.id,
            newLastYieldAt,
            newAlloyMined
          );

          // Check if mining is complete
          if (newAlloyMined >= totalLimit) {
            operationsToDelete.push({ id: row.id, playerId: row.player_id });
            console.log(
              `Mining operation ${row.id} on body ${row.celestial_body_id} has been depleted (mined ${newAlloyMined}/${totalLimit} alloy)`
            );
          }
        } else if (remainingAlloy > 0) {
          // Mining paused due to storage, don't delete
          console.log(
            `Mining operation ${row.id} paused: no storage space available`
          );
        } else {
          // Mining operation is depleted
          operationsToDelete.push({ id: row.id, playerId: row.player_id });
          console.log(
            `Mining operation ${row.id} on body ${row.celestial_body_id} was already depleted`
          );
        }
      }
    }

    // Delete depleted mining operations and refund energy
    for (const op of operationsToDelete) {
      this.deleteMiningOperation(op.id);
      // Refund 1 energy to the player when mining is exhausted
      this.addPlayerEnergy(op.playerId, 1);
      console.log(
        `Refunded 1 energy to player ${op.playerId} for exhausted mining operation ${op.id}`
      );
    }
  }

  /**
   * Process defense platform maintenance costs
   * Deducts alloy per day for each platform
   */
  processDefenseMaintenance(currentTime: number): void {
    // Get all defense platforms
    const stmt = this.db.prepare("SELECT * FROM gate_defenses WHERE health > 0");
    const rows = stmt.all() as any[];

    for (const row of rows) {
      const maintenancePerDay = row.maintenance_alloy_per_day ?? 0.1;
      const lastMaintenanceAt = row.last_maintenance_at ?? row.created_at;
      const timeSinceMaintenance = currentTime - lastMaintenanceAt;
      const daysElapsed = timeSinceMaintenance / (24 * 60 * 60);

      if (daysElapsed >= 1) {
        const player = this.getPlayerById(row.player_id);
        if (!player) continue;

        const fullDays = Math.floor(daysElapsed);
        const maintenanceCost = maintenancePerDay * fullDays;

        // Check if player has enough alloy for maintenance
        if (player.alloy >= maintenanceCost) {
          // Deduct maintenance cost
          this.deductPlayerAlloy(row.player_id, maintenanceCost);

          // Update last maintenance time
          const newLastMaintenanceAt = lastMaintenanceAt + fullDays * 24 * 60 * 60;
          const updateStmt = this.db.prepare(
            "UPDATE gate_defenses SET last_maintenance_at = ? WHERE id = ?"
          );
          updateStmt.run(newLastMaintenanceAt, row.id);

          console.log(
            `Deducted ${maintenanceCost.toFixed(2)} alloy maintenance from player ${row.player_id} for defense ${row.id}`
          );
        } else {
          // Player can't afford maintenance - platform is disabled but not destroyed
          console.log(
            `Player ${row.player_id} cannot afford maintenance for defense ${row.id} (needs ${maintenanceCost.toFixed(2)}, has ${player.alloy.toFixed(2)})`
          );
          // TODO: In the future, you could add a "disabled" status for platforms
        }
      }
    }
  }

  // Megastructures
  createMegastructure(
    id: string,
    playerId: string,
    systemId: string,
    type: string,
    celestialBodyId: string | null,
    resourceType: string | null,
    resourcePerDay: number | null,
    establishedAt: number,
    metadata: string | null
  ): void {
    const stmt = this.db.prepare(
      "INSERT INTO megastructures (id, player_id, system_id, type, celestial_body_id, resource_type, resource_per_day, established_at, last_yield_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    stmt.run(
      id,
      playerId,
      systemId,
      type,
      celestialBodyId,
      resourceType,
      resourcePerDay,
      establishedAt,
      establishedAt,
      metadata
    );
  }

  getMegastructuresBySystem(systemId: string): Megastructure[] {
    const stmt = this.db.prepare(
      "SELECT * FROM megastructures WHERE system_id = ?"
    );
    const rows = stmt.all(systemId) as any[];
    return rows.map((row) => ({
      id: row.id,
      playerId: row.player_id,
      systemId: row.system_id,
      type: row.type,
      celestialBodyId: row.celestial_body_id,
      resourceType: row.resource_type,
      resourcePerDay: row.resource_per_day,
      establishedAt: row.established_at,
      lastYieldAt: row.last_yield_at,
      metadata: row.metadata,
    }));
  }

  getMegastructuresByPlayer(playerId: string): Megastructure[] {
    const stmt = this.db.prepare(
      "SELECT * FROM megastructures WHERE player_id = ?"
    );
    const rows = stmt.all(playerId) as any[];
    return rows.map((row) => ({
      id: row.id,
      playerId: row.player_id,
      systemId: row.system_id,
      type: row.type,
      celestialBodyId: row.celestial_body_id,
      resourceType: row.resource_type,
      resourcePerDay: row.resource_per_day,
      establishedAt: row.established_at,
      lastYieldAt: row.last_yield_at,
      metadata: row.metadata,
    }));
  }

  countDysonSwarmsByStar(starId: string): number {
    const stmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM megastructures WHERE type = 'dyson_swarm' AND celestial_body_id = ?"
    );
    const row = stmt.get(starId) as any;
    return row.count;
  }

  updateMegastructureYield(megastructureId: string, lastYieldAt: number): void {
    const stmt = this.db.prepare(
      "UPDATE megastructures SET last_yield_at = ? WHERE id = ?"
    );
    stmt.run(lastYieldAt, megastructureId);
  }

  processMegastructureYields(currentTime: number): void {
    // Get all megastructures (excluding Dyson Swarms which provide instant energy)
    const stmt = this.db.prepare(
      "SELECT * FROM megastructures WHERE type != 'dyson_swarm'"
    );
    const rows = stmt.all() as any[];

    for (const row of rows) {
      const timeSinceLastYield = currentTime - row.last_yield_at;
      const daysElapsed = timeSinceLastYield / (24 * 60 * 60);

      if (daysElapsed >= 1) {
        // Award resources for full days
        const fullDays = Math.floor(daysElapsed);
        const resourceToAdd = (row.resource_per_day || 0) * fullDays;

        // Add resources based on type
        if (row.resource_type === "energy" && resourceToAdd > 0) {
          this.addPlayerEnergy(row.player_id, resourceToAdd);
        } else if (row.resource_type === "alloy" && resourceToAdd > 0) {
          this.addPlayerAlloy(row.player_id, resourceToAdd);
        }

        // Update last yield time
        const newLastYieldAt = row.last_yield_at + fullDays * 24 * 60 * 60;
        this.updateMegastructureYield(row.id, newLastYieldAt);
      }
    }
  }

  /**
   * Process colony resource yields and population growth based on current game time
   */
  processColonyYields(currentTime: number): void {
    // Get all colonies
    const stmt = this.db.prepare("SELECT * FROM colonies");
    const rows = stmt.all() as any[];

    for (const row of rows) {
      const timeSinceLastYield = currentTime - row.last_yield_at;
      const daysElapsed = timeSinceLastYield / (24 * 60 * 60);

      if (daysElapsed >= 1) {
        // Award or consume resources for full days
        const fullDays = Math.floor(daysElapsed);

        const scienceToAdd = row.science_per_day * fullDays;
        const alloyToAdd = row.alloy_per_day * fullDays;

        // Add or subtract resources from player (no energy from colonies)
        // Get current player resources to prevent going negative
        const player = this.getPlayerById(row.player_id);
        if (player) {
          if (scienceToAdd > 0) {
            this.addPlayerScience(row.player_id, scienceToAdd);
          } else if (scienceToAdd < 0) {
            // Consuming science - don't let it go below 0
            const scienceToConsume = Math.min(
              Math.abs(scienceToAdd),
              player.science
            );
            this.addPlayerScience(row.player_id, -scienceToConsume);
          }
          if (alloyToAdd > 0) {
            this.addPlayerAlloy(row.player_id, alloyToAdd);
          } else if (alloyToAdd < 0) {
            // Consuming alloy - don't let it go below 0
            const alloyToConsume = Math.min(Math.abs(alloyToAdd), player.alloy);
            this.addPlayerAlloy(row.player_id, -alloyToConsume);
          }
        }

        // Process population growth
        let newPopulation = row.population;
        let currentStage = row.stage;
        let sciencePerDay = row.science_per_day;
        let alloyPerDay = row.alloy_per_day;
        let stageChanged = false;
        let crossedThreshold = false;

        // Get planet data for habitability
        const system = this.getStarSystem(row.system_id);
        if (system) {
          const planet = system.planets.find(
            (p: any) => p.id === row.planet_id
          );
          if (planet && planet.habitability) {
            // Calculate maximum population based on planet surface area
            // Surface area = 4π * radius²
            const surfaceArea = 4 * Math.PI * planet.radius * planet.radius;
            const maxPopulation = Math.floor(
              surfaceArea * BASE_POPULATION_DENSITY * planet.habitability
            );

            // Calculate population growth for each day
            for (let day = 0; day < fullDays; day++) {
              // Stop growing if we've reached the planet's maximum capacity
              if (newPopulation >= maxPopulation) {
                break;
              }

              // Base growth rate depends on population size (logarithmic decay)
              // Small colonies grow faster (percentage-wise), large ones slower
              let baseGrowthRate = 0;

              if (newPopulation < 10000) {
                baseGrowthRate = 0.015; // 1.5% per day for small colonies
              } else if (newPopulation < 100000) {
                baseGrowthRate = 0.01; // 1% per day for medium colonies
              } else if (newPopulation < 1000000) {
                baseGrowthRate = 0.005; // 0.5% per day for large colonies
              } else if (newPopulation < 100000000) {
                baseGrowthRate = 0.002; // 0.2% per day for developed worlds
              } else {
                baseGrowthRate = 0.0005; // 0.05% per day for massive populations
              }

              // Habitability modifier (0.3 to 1.0 habitability affects growth)
              const habitabilityModifier = 0.5 + planet.habitability * 0.5;

              // Specialization modifier (balanced gets a small growth bonus)
              const specializationModifier =
                row.specialization === "balanced" ? 1.2 : 1.0;

              // Carrying capacity modifier - slow down growth as we approach max population
              const populationRatio = newPopulation / maxPopulation;
              const carryingCapacityModifier = Math.max(
                0,
                1 - populationRatio * populationRatio
              ); // Logistic growth

              // Calculate growth
              const growthRate =
                baseGrowthRate *
                habitabilityModifier *
                specializationModifier *
                carryingCapacityModifier;
              newPopulation = Math.floor(newPopulation * (1 + growthRate));

              // Ensure we don't exceed maximum population
              newPopulation = Math.min(newPopulation, maxPopulation);
            }

            // Check if colony should advance to next stage
            const oldStage = currentStage;
            if (currentStage === "outpost" && newPopulation >= 1000) {
              currentStage = "settlement";
              stageChanged = true;
            } else if (
              currentStage === "settlement" &&
              newPopulation >= 10000
            ) {
              currentStage = "colony";
              stageChanged = true;
            } else if (currentStage === "colony" && newPopulation >= 100000) {
              currentStage = "developed";
              stageChanged = true;
            } else if (
              currentStage === "developed" &&
              newPopulation >= 1000000
            ) {
              currentStage = "metropolis";
              stageChanged = true;
            } else if (
              currentStage === "metropolis" &&
              newPopulation >= 10000000000
            ) {
              currentStage = "ecumenopolis";
              stageChanged = true;
            }

            // Check if colony crossed the 1M threshold (from consuming to producing)
            const wasConsuming = row.population < 1000000;
            const isProducing = newPopulation >= 1000000;
            crossedThreshold = wasConsuming && isProducing;

            // If population changed significantly, recalculate resource yields using the smooth curve
            // We recalculate on stage changes or threshold crossing to ensure yields stay accurate
            if (stageChanged || crossedThreshold || newPopulation !== row.population) {
              const habitabilityBonus = planet.habitability || 0.5;
              const yields = calculateColonyYields(
                newPopulation,
                row.specialization,
                habitabilityBonus
              );
              sciencePerDay = yields.sciencePerDay;
              alloyPerDay = yields.alloyPerDay;

              if (crossedThreshold) {
                console.log(
                  `Colony ${row.planet_name} reached 1M population - switched from consumption to production (pop: ${newPopulation})`
                );
              } else if (stageChanged) {
                console.log(
                  `Colony ${row.planet_name} advanced from ${oldStage} to ${currentStage} (pop: ${newPopulation})`
                );
              }
            }
          }
        }

        // Update colony with new population, stage, and yields
        if (
          newPopulation !== row.population ||
          stageChanged ||
          crossedThreshold
        ) {
          const updateStmt = this.db.prepare(
            `UPDATE colonies SET population = ?, stage = ?, science_per_day = ?, alloy_per_day = ?, last_yield_at = ? WHERE id = ?`
          );
          updateStmt.run(
            newPopulation,
            currentStage,
            sciencePerDay,
            alloyPerDay,
            row.last_yield_at + fullDays * 24 * 60 * 60,
            row.id
          );
        } else {
          // Just update last yield time
          const newLastYieldAt = row.last_yield_at + fullDays * 24 * 60 * 60;
          this.updateColonyYield(row.id, newLastYieldAt);
        }
      }
    }
  }

  // Calculate total energy bonus from Dyson Swarms for a player
  getTotalDysonSwarmEnergy(playerId: string): number {
    const stmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM megastructures WHERE player_id = ? AND type = 'dyson_swarm'"
    );
    const row = stmt.get(playerId) as any;
    return row.count || 0; // 1 energy per swarm
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
        energy: row.energy ?? 10,
        alloy: row.alloy ?? 10,
        science: row.science ?? 0,
        speciesId: row.species_id || undefined,
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

  // Tunnel operations
  createTunnel(tunnel: Tunnel): void {
    const stmt = this.db.prepare(
      "INSERT OR IGNORE INTO tunnels (id, system_a_id, system_b_id, powered_by_player_id, power_cost_energy, overcharged_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    stmt.run(
      tunnel.id,
      tunnel.systemAId,
      tunnel.systemBId,
      tunnel.poweredByPlayerId,
      tunnel.powerCostEnergy,
      tunnel.overchargedAt,
      tunnel.createdAt
    );
  }

  getTunnelById(tunnelId: string): Tunnel | null {
    const stmt = this.db.prepare("SELECT * FROM tunnels WHERE id = ?");
    const row = stmt.get(tunnelId) as any;
    if (!row) return null;
    return {
      id: row.id,
      systemAId: row.system_a_id,
      systemBId: row.system_b_id,
      poweredByPlayerId: row.powered_by_player_id,
      powerCostEnergy: row.power_cost_energy || 0,
      overchargedAt: row.overcharged_at || 0,
      createdAt: row.created_at,
    };
  }

  setTunnelPower(tunnelId: string, playerId: string | null, energyCost: number): void {
    const stmt = this.db.prepare(
      "UPDATE tunnels SET powered_by_player_id = ?, power_cost_energy = ? WHERE id = ?"
    );
    stmt.run(playerId, energyCost, tunnelId);
  }

  setTunnelOvercharged(tunnelId: string, overchargedAt: number): void {
    const stmt = this.db.prepare(
      "UPDATE tunnels SET overcharged_at = ?, powered_by_player_id = NULL, power_cost_energy = 0 WHERE id = ?"
    );
    stmt.run(overchargedAt, tunnelId);
  }

  getTunnelsBySystem(systemId: string): Tunnel[] {
    const stmt = this.db.prepare(
      "SELECT * FROM tunnels WHERE system_a_id = ? OR system_b_id = ?"
    );
    const rows = stmt.all(systemId, systemId) as any[];
    return rows.map((row) => ({
      id: row.id,
      systemAId: row.system_a_id,
      systemBId: row.system_b_id,
      poweredByPlayerId: row.powered_by_player_id,
      powerCostEnergy: row.power_cost_energy || 0,
      overchargedAt: row.overcharged_at || 0,
      createdAt: row.created_at,
    }));
  }

  // Star Gate operations
  createGate(gate: StarGate): void {
    const stmt = this.db.prepare(
      "INSERT INTO star_gates (id, tunnel_id, system_id, destination_system_id, orbital_elements, name) VALUES (?, ?, ?, ?, ?, ?)"
    );
    stmt.run(
      gate.id,
      gate.tunnelId || null, // Allow null for gates with placeholder destinations
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
      tunnelId: row.tunnel_id || null,
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
      tunnelId: row.tunnel_id || null,
      name: row.name,
      systemId: row.system_id,
      destinationSystemId: row.destination_system_id,
      orbitalElements: JSON.parse(row.orbital_elements),
    };
  }

  getGatesByGalaxyId(galaxyId: string): StarGate[] {
    const stmt = this.db.prepare(`
      SELECT sg.* FROM star_gates sg
      JOIN star_systems ss ON sg.system_id = ss.id
      WHERE ss.galaxy_id = ?
    `);
    const rows = stmt.all(galaxyId) as any[];
    return rows.map((row) => ({
      id: row.id,
      tunnelId: row.tunnel_id || null,
      name: row.name,
      systemId: row.system_id,
      destinationSystemId: row.destination_system_id,
      orbitalElements: JSON.parse(row.orbital_elements),
    }));
  }

  getGatesByTunnel(tunnelId: string): StarGate[] {
    const stmt = this.db.prepare(
      "SELECT * FROM star_gates WHERE tunnel_id = ?"
    );
    const rows = stmt.all(tunnelId) as any[];
    return rows.map((row) => ({
      id: row.id,
      tunnelId: row.tunnel_id || null,
      name: row.name,
      systemId: row.system_id,
      destinationSystemId: row.destination_system_id,
      orbitalElements: JSON.parse(row.orbital_elements),
    }));
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
        energy: row.energy ?? 10,
        alloy: row.alloy ?? 10,
        science: row.science ?? 0,
        speciesId: row.species_id || undefined,
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
      energy: row.energy ?? 0,
      alloy: row.alloy ?? 0,
      science: row.science ?? 0,
      speciesId: row.species_id || undefined,
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

  // Player meeting operations
  /**
   * Check if two players have already met
   */
  havePlayersMet(playerId1: string, playerId2: string): boolean {
    // Ensure consistent ordering (player1_id < player2_id)
    const [p1, p2] =
      playerId1 < playerId2 ? [playerId1, playerId2] : [playerId2, playerId1];

    const stmt = this.db.prepare(
      "SELECT 1 FROM player_meetings WHERE player1_id = ? AND player2_id = ?"
    );
    const row = stmt.get(p1, p2);
    return row !== undefined;
  }

  /**
   * Record that two players have met
   */
  recordPlayerMeeting(playerId1: string, playerId2: string): void {
    // Ensure consistent ordering (player1_id < player2_id)
    const [p1, p2] =
      playerId1 < playerId2 ? [playerId1, playerId2] : [playerId2, playerId1];

    const stmt = this.db.prepare(
      "INSERT OR IGNORE INTO player_meetings (player1_id, player2_id, met_at) VALUES (?, ?, ?)"
    );
    stmt.run(p1, p2, Date.now());
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
    const gate = this.getGateById(gateId);
    if (!gate) return;

    // If updating from PLACEHOLDER to a real system, create the tunnel
    if (
      gate.destinationSystemId.startsWith("PLACEHOLDER_") &&
      !newDestinationSystemId.startsWith("PLACEHOLDER_")
    ) {
      // Generate tunnel ID
      const systemA =
        gate.systemId < newDestinationSystemId
          ? gate.systemId
          : newDestinationSystemId;
      const systemB =
        gate.systemId < newDestinationSystemId
          ? newDestinationSystemId
          : gate.systemId;
      const tunnelId = `tunnel_${systemA}_${systemB}`;

      // Create tunnel if it doesn't exist
      this.createTunnel({
        id: tunnelId,
        systemAId: systemA,
        systemBId: systemB,
        poweredByPlayerId: null,
        powerCostEnergy: 0,
        overchargedAt: 0,
        createdAt: Date.now(),
      });

      // Update gate with tunnel_id
      const updateStmt = this.db.prepare(
        "UPDATE star_gates SET destination_system_id = ?, tunnel_id = ? WHERE id = ?"
      );
      updateStmt.run(newDestinationSystemId, tunnelId, gateId);
    } else {
      // Normal update
      const stmt = this.db.prepare(
        "UPDATE star_gates SET destination_system_id = ? WHERE id = ?"
      );
      stmt.run(newDestinationSystemId, gateId);
    }
  }

  updateGateName(gateId: string, newName: string): void {
    const stmt = this.db.prepare("UPDATE star_gates SET name = ? WHERE id = ?");
    stmt.run(newName, gateId);
  }

  // Gate ownership operations
  setGateOwnership(gateId: string, ownerId: string): void {
    const stmt = this.db.prepare(
      "INSERT OR REPLACE INTO gate_ownership (gate_id, owner_id, explored_at, last_overtaken_at) VALUES (?, ?, ?, ?)"
    );
    stmt.run(gateId, ownerId, Date.now(), 0);
    // Note: Tunnel power is now managed separately via tunnel overtake/power actions
  }

  setGateOwnershipWithOvertake(
    gateId: string,
    ownerId: string,
    overtakeTime: number
  ): void {
    const stmt = this.db.prepare(
      "INSERT OR REPLACE INTO gate_ownership (gate_id, owner_id, explored_at, last_overtaken_at) VALUES (?, ?, ?, ?)"
    );
    stmt.run(gateId, ownerId, Date.now(), overtakeTime);
    // Note: Tunnel power is now managed separately via tunnel overtake/power actions
  }

  getGateLastOvertakenAt(gateId: string): number {
    const stmt = this.db.prepare(
      "SELECT last_overtaken_at FROM gate_ownership WHERE gate_id = ?"
    );
    const row = stmt.get(gateId) as any;
    return row?.last_overtaken_at || 0;
  }

  getGateOwner(gateId: string): string | null {
    const stmt = this.db.prepare(
      "SELECT owner_id FROM gate_ownership WHERE gate_id = ?"
    );
    const row = stmt.get(gateId) as any;
    return row ? row.owner_id : null;
  }

  getGateOwnerWithName(
    gateId: string
  ): { ownerId: string; ownerName: string } | null {
    const stmt = this.db.prepare(`
      SELECT go.owner_id, p.name as owner_name
      FROM gate_ownership go
      INNER JOIN players p ON go.owner_id = p.id
      WHERE go.gate_id = ?
    `);
    const row = stmt.get(gateId) as any;
    if (!row) return null;
    return {
      ownerId: row.owner_id,
      ownerName: row.owner_name,
    };
  }

  getGatesOwnedByPlayer(playerId: string): string[] {
    const stmt = this.db.prepare(
      "SELECT gate_id FROM gate_ownership WHERE owner_id = ?"
    );
    const rows = stmt.all(playerId) as any[];
    return rows.map((row) => row.gate_id);
  }

  // Player stance operations
  setPlayerStance(
    fromPlayerId: string,
    toPlayerId: string,
    stance: "neutral" | "friendly" | "aggressive"
  ): void {
    const stmt = this.db.prepare(
      "INSERT OR REPLACE INTO player_stances (from_player_id, to_player_id, stance, updated_at) VALUES (?, ?, ?, ?)"
    );
    stmt.run(fromPlayerId, toPlayerId, stance, Date.now());
  }

  getPlayerStance(
    fromPlayerId: string,
    toPlayerId: string
  ): "neutral" | "friendly" | "aggressive" {
    const stmt = this.db.prepare(
      "SELECT stance FROM player_stances WHERE from_player_id = ? AND to_player_id = ?"
    );
    const row = stmt.get(fromPlayerId, toPlayerId) as any;
    return row ? row.stance : "neutral"; // Default to neutral if no stance set
  }

  getAllPlayerStances(
    playerId: string
  ): Map<string, "neutral" | "friendly" | "aggressive"> {
    const stmt = this.db.prepare(
      "SELECT to_player_id, stance FROM player_stances WHERE from_player_id = ?"
    );
    const rows = stmt.all(playerId) as any[];
    const stances = new Map<string, "neutral" | "friendly" | "aggressive">();
    for (const row of rows) {
      stances.set(row.to_player_id, row.stance);
    }
    return stances;
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
  /**
   * Get gate ownership information for gates in a system
   */
  getGateOwnershipForSystem(
    playerId: string,
    systemId: string
  ): Array<{
    gateId: string;
    ownerId: string;
    ownerName: string;
    status: "owned_by_self" | "neutral" | "friendly" | "aggressive";
    lastOvertakenAt: number;
  }> {
    const gates = this.getGatesBySystem(systemId);
    const result: Array<{
      gateId: string;
      ownerId: string;
      ownerName: string;
      status: "owned_by_self" | "neutral" | "friendly" | "aggressive";
      lastOvertakenAt: number;
    }> = [];

    for (const gate of gates) {
      // Check if this gate has an owner (has been explored by ANYONE)
      const ownerInfo = this.getGateOwnerWithName(gate.id);
      if (ownerInfo) {
        let status: "owned_by_self" | "neutral" | "friendly" | "aggressive";

        if (ownerInfo.ownerId === playerId) {
          status = "owned_by_self";
        } else {
          // Get the player's stance towards the gate owner
          const stance = this.getPlayerStance(playerId, ownerInfo.ownerId);
          status = stance as "neutral" | "friendly" | "aggressive";
        }

        // Get last overtaken timestamp
        const lastOvertakenAt = this.getGateLastOvertakenAt(gate.id);

        result.push({
          gateId: gate.id,
          ownerId: ownerInfo.ownerId,
          ownerName: ownerInfo.ownerName,
          status,
          lastOvertakenAt,
        });
      }
    }

    return result;
  }

  /**
   * Get tunnel ownership information for gates in a system
   */
  getTunnelOwnershipForSystem(
    playerId: string,
    systemId: string
  ): Array<{
    gateId: string;
    tunnelId: string;
    thisGateOwnerId?: string;
    thisGateOwnerName?: string;
    thisGateStatus?: "owned_by_self" | "neutral" | "friendly" | "aggressive";
    thisGateDefenseCount?: number;
    otherGateOwnerId?: string;
    otherGateOwnerName?: string;
    otherGateStatus?: "owned_by_self" | "neutral" | "friendly" | "aggressive";
      otherGateDefenseCount?: number;
      tunnelPoweredByPlayerId?: string | null;
      tunnelPoweredByPlayerName?: string | null;
      overchargedAt?: number | null;
    }> {
    const gates = this.getGatesBySystem(systemId);
    const result: Array<{
      gateId: string;
      tunnelId: string;
      thisGateOwnerId?: string;
      thisGateOwnerName?: string;
      thisGateStatus?: "owned_by_self" | "neutral" | "friendly" | "aggressive";
      thisGateDefenseCount?: number;
      otherGateOwnerId?: string;
      otherGateOwnerName?: string;
      otherGateStatus?: "owned_by_self" | "neutral" | "friendly" | "aggressive";
      otherGateDefenseCount?: number;
      tunnelPoweredByPlayerId?: string | null;
      tunnelPoweredByPlayerName?: string | null;
      overchargedAt?: number | null;
    }> = [];

    for (const gate of gates) {
      // Skip gates without tunnels (placeholder destinations)
      if (!gate.tunnelId) {
        continue;
      }

      const tunnel = this.getTunnelById(gate.tunnelId);
      if (!tunnel) continue;

      const gatesInTunnel = this.getGatesByTunnel(gate.tunnelId);

      // Find the other gate in the tunnel
      const otherGate = gatesInTunnel.find((g) => g.id !== gate.id);
      if (!otherGate) continue;

      // Get ownership info for this gate (the one in the current system)
      const thisGateOwnerInfo = this.getGateOwnerWithName(gate.id);
      let thisGateOwnerId: string | undefined;
      let thisGateOwnerName: string | undefined;
      let thisGateStatus:
        | "owned_by_self"
        | "neutral"
        | "friendly"
        | "aggressive"
        | undefined;

      if (thisGateOwnerInfo) {
        thisGateOwnerId = thisGateOwnerInfo.ownerId;
        thisGateOwnerName = thisGateOwnerInfo.ownerName;

        if (thisGateOwnerId === playerId) {
          thisGateStatus = "owned_by_self";
        } else {
          const stance = this.getPlayerStance(playerId, thisGateOwnerId);
          thisGateStatus = stance as "neutral" | "friendly" | "aggressive";
        }
      }

      // Get ownership info for the other gate (in the connected system)
      const otherGateOwnerInfo = this.getGateOwnerWithName(otherGate.id);
      let otherGateOwnerId: string | undefined;
      let otherGateOwnerName: string | undefined;
      let otherGateStatus:
        | "owned_by_self"
        | "neutral"
        | "friendly"
        | "aggressive"
        | undefined;

      if (otherGateOwnerInfo) {
        otherGateOwnerId = otherGateOwnerInfo.ownerId;
        otherGateOwnerName = otherGateOwnerInfo.ownerName;

        if (otherGateOwnerId === playerId) {
          otherGateStatus = "owned_by_self";
        } else {
          const stance = this.getPlayerStance(playerId, otherGateOwnerId);
          otherGateStatus = stance as "neutral" | "friendly" | "aggressive";
        }
      }

      // Get defense counts for both gates
      const thisGateDefenseCount = this.getGateDefenseCount(gate.id);
      const otherGateDefenseCount = this.getGateDefenseCount(otherGate.id);

      // Get tunnel power owner info
      let tunnelPoweredByPlayerName: string | null = null;
      if (tunnel.poweredByPlayerId) {
        const powerOwner = this.getPlayerById(tunnel.poweredByPlayerId);
        tunnelPoweredByPlayerName = powerOwner?.name || null;
      }

      result.push({
        gateId: gate.id,
        tunnelId: gate.tunnelId,
        thisGateOwnerId,
        thisGateOwnerName,
        thisGateStatus,
        thisGateDefenseCount,
        otherGateOwnerId,
        otherGateOwnerName,
        otherGateStatus,
        otherGateDefenseCount,
        tunnelPoweredByPlayerId: tunnel.poweredByPlayerId,
        tunnelPoweredByPlayerName,
        overchargedAt: tunnel.overchargedAt || null,
      });
    }

    return result;
  }

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
      ownerId?: string;
      ownerName?: string;
      status?:
        | "unexplored"
        | "owned_by_self"
        | "neutral"
        | "aggressive"
        | "friendly";
      // Tunnel information
      tunnelId?: string;
      gateAId?: string;
      gateBId?: string;
      gateAOwnerId?: string;
      gateBOwnerId?: string;
      gateAStatus?:
        | "unexplored"
        | "owned_by_self"
        | "neutral"
        | "aggressive"
        | "friendly";
      gateBStatus?:
        | "unexplored"
        | "owned_by_self"
        | "neutral"
        | "aggressive"
        | "friendly";
      tunnelPoweredBy?: string | null;
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
      ownerId?: string;
      ownerName?: string;
      status?:
        | "unexplored"
        | "owned_by_self"
        | "neutral"
        | "aggressive"
        | "friendly";
      tunnelId?: string;
      gateAId?: string;
      gateBId?: string;
      gateAOwnerId?: string;
      gateBOwnerId?: string;
      gateAStatus?:
        | "unexplored"
        | "owned_by_self"
        | "neutral"
        | "aggressive"
        | "friendly";
      gateBStatus?:
        | "unexplored"
        | "owned_by_self"
        | "neutral"
        | "aggressive"
        | "friendly";
      tunnelPoweredByPlayerId?: string | null;
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

        // Get gate ownership information
        let ownerId: string | undefined;
        let ownerName: string | undefined;
        let status:
          | "unexplored"
          | "owned_by_self"
          | "neutral"
          | "aggressive"
          | "friendly"
          | undefined;

        if (isExplored) {
          const ownerInfo = this.getGateOwnerWithName(gate.id);
          if (ownerInfo) {
            ownerId = ownerInfo.ownerId;
            ownerName = ownerInfo.ownerName;

            // Determine status relative to current player
            if (ownerId === playerId) {
              status = "owned_by_self";
            } else {
              // Get the player's stance towards the gate owner
              const stance = this.getPlayerStance(playerId, ownerId);
              status = stance; // neutral, friendly, or aggressive
            }
          }
        }

        // Get tunnel information (both gates) - skip if gate has no tunnel (placeholder)
        if (!gate.tunnelId) {
          // Add connection without tunnel info for placeholder gates
          connections.push({
            fromSystemId: gate.systemId,
            toSystemId: gate.destinationSystemId,
            isExplored,
            gateId: isExplored ? gate.id : undefined,
            ownerId,
            ownerName,
            status,
          });

          // Only add destination system if this gate is explored
          if (isExplored) {
            systemIds.add(gate.destinationSystemId);
          }
          continue; // Skip tunnel processing
        }

        const tunnel = this.getTunnelById(gate.tunnelId);
        const gatesInTunnel = this.getGatesByTunnel(gate.tunnelId);

        // Find gate A and gate B
        const gateA = gatesInTunnel.find(
          (g) => g.systemId === tunnel?.systemAId
        );
        const gateB = gatesInTunnel.find(
          (g) => g.systemId === tunnel?.systemBId
        );

        // Get ownership and status for both gates
        let gateAOwnerId: string | undefined;
        let gateBOwnerId: string | undefined;
        let gateAStatus:
          | "unexplored"
          | "owned_by_self"
          | "neutral"
          | "aggressive"
          | "friendly"
          | undefined;
        let gateBStatus:
          | "unexplored"
          | "owned_by_self"
          | "neutral"
          | "aggressive"
          | "friendly"
          | undefined;

        if (gateA) {
          const gateAOwnerInfo = this.getGateOwnerWithName(gateA.id);
          if (gateAOwnerInfo) {
            gateAOwnerId = gateAOwnerInfo.ownerId;
            if (gateAOwnerId === playerId) {
              gateAStatus = "owned_by_self";
            } else {
              gateAStatus = this.getPlayerStance(playerId, gateAOwnerId);
            }
          } else if (exploredGateIds.has(gateA.id)) {
            gateAStatus = "unexplored";
          }
        }

        if (gateB) {
          const gateBOwnerInfo = this.getGateOwnerWithName(gateB.id);
          if (gateBOwnerInfo) {
            gateBOwnerId = gateBOwnerInfo.ownerId;
            if (gateBOwnerId === playerId) {
              gateBStatus = "owned_by_self";
            } else {
              gateBStatus = this.getPlayerStance(playerId, gateBOwnerId);
            }
          } else if (exploredGateIds.has(gateB.id)) {
            gateBStatus = "unexplored";
          }
        }

        // Add connection
        connections.push({
          fromSystemId: gate.systemId,
          toSystemId: gate.destinationSystemId,
          isExplored,
          gateId: isExplored ? gate.id : undefined,
          ownerId,
          ownerName,
          status,
          // Tunnel information
          tunnelId: gate.tunnelId,
          gateAId: gateA?.id,
          gateBId: gateB?.id,
          gateAOwnerId,
          gateBOwnerId,
          gateAStatus,
          gateBStatus,
          tunnelPoweredByPlayerId: tunnel?.poweredByPlayerId || null,
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

  // ==================== Species Operations ====================

  /**
   * Create a new species
   */
  createSpecies(species: Species): void {
    const stmt = this.db.prepare(
      "INSERT INTO species (id, name, homeworld, homeworld_id, appearance, traits, description, created_at, player_id, pregenerated_species_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    stmt.run(
      species.id,
      species.name,
      species.homeworld,
      species.homeworldId,
      JSON.stringify(species.appearance),
      JSON.stringify(species.traits),
      species.description,
      species.createdAt,
      species.playerId || null,
      species.pregeneratedSpeciesId || null
    );
  }

  /**
   * Get a species by ID
   */
  getSpeciesById(speciesId: string): Species | null {
    const stmt = this.db.prepare("SELECT * FROM species WHERE id = ?");
    const row = stmt.get(speciesId) as any;
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      homeworld: row.homeworld,
      homeworldId: row.homeworld_id,
      appearance: JSON.parse(row.appearance),
      traits: JSON.parse(row.traits),
      description: row.description,
      createdAt: row.created_at,
      playerId: row.player_id || undefined,
      pregeneratedSpeciesId: row.pregenerated_species_id || undefined,
    };
  }

  /**
   * Get all species for a player
   */
  getSpeciesByPlayerId(playerId: string): Species | null {
    const stmt = this.db.prepare("SELECT * FROM species WHERE player_id = ?");
    const row = stmt.get(playerId) as any;
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      homeworld: row.homeworld,
      homeworldId: row.homeworld_id,
      appearance: JSON.parse(row.appearance),
      traits: JSON.parse(row.traits),
      description: row.description,
      createdAt: row.created_at,
      playerId: row.player_id || undefined,
    };
  }

  /**
   * Get species by homeworld ID
   */
  getSpeciesByHomeworldId(homeworldId: string): Species | null {
    const stmt = this.db.prepare(
      "SELECT * FROM species WHERE homeworld_id = ?"
    );
    const row = stmt.get(homeworldId) as any;
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      homeworld: row.homeworld,
      homeworldId: row.homeworld_id,
      appearance: JSON.parse(row.appearance),
      traits: JSON.parse(row.traits),
      description: row.description,
      createdAt: row.created_at,
      playerId: row.player_id || undefined,
    };
  }

  // ==================== Colony Operations ====================

  /**
   * Create a new colony
   */
  createColony(colony: Colony): void {
    const stmt = this.db.prepare(
      `INSERT INTO colonies (id, player_id, species_id, system_id, planet_id, planet_name, 
       stage, specialization, population, science_per_day, energy_per_day, alloy_per_day, 
       established_at, last_yield_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
      colony.id,
      colony.playerId,
      colony.speciesId,
      colony.systemId,
      colony.planetId,
      colony.planetName,
      colony.stage,
      colony.specialization,
      colony.population,
      colony.sciencePerDay,
      0, // energy_per_day is deprecated (colonies don't produce energy)
      colony.alloyPerDay,
      colony.establishedAt,
      colony.lastYieldAt
    );
  }

  /**
   * Get colony by ID
   */
  getColonyById(colonyId: string): Colony | null {
    const stmt = this.db.prepare("SELECT * FROM colonies WHERE id = ?");
    const row = stmt.get(colonyId) as any;
    if (!row) return null;

    return {
      id: row.id,
      playerId: row.player_id,
      speciesId: row.species_id,
      systemId: row.system_id,
      planetId: row.planet_id,
      planetName: row.planet_name,
      stage: row.stage,
      specialization: row.specialization,
      population: row.population,
      sciencePerDay: row.science_per_day,
      alloyPerDay: row.alloy_per_day,
      establishedAt: row.established_at,
      lastYieldAt: row.last_yield_at,
    };
  }

  /**
   * Get all colonies for a player
   */
  getColoniesByPlayerId(playerId: string): Colony[] {
    const stmt = this.db.prepare("SELECT * FROM colonies WHERE player_id = ?");
    const rows = stmt.all(playerId) as any[];

    return rows.map((row) => ({
      id: row.id,
      playerId: row.player_id,
      speciesId: row.species_id,
      systemId: row.system_id,
      planetId: row.planet_id,
      planetName: row.planet_name,
      stage: row.stage,
      specialization: row.specialization,
      population: row.population,
      sciencePerDay: row.science_per_day,
      alloyPerDay: row.alloy_per_day,
      establishedAt: row.established_at,
      lastYieldAt: row.last_yield_at,
    }));
  }

  /**
   * Get all colonies in a system
   */
  getColoniesBySystemId(systemId: string): Colony[] {
    const stmt = this.db.prepare("SELECT * FROM colonies WHERE system_id = ?");
    const rows = stmt.all(systemId) as any[];

    return rows.map((row) => ({
      id: row.id,
      playerId: row.player_id,
      speciesId: row.species_id,
      systemId: row.system_id,
      planetId: row.planet_id,
      planetName: row.planet_name,
      stage: row.stage,
      specialization: row.specialization,
      population: row.population,
      sciencePerDay: row.science_per_day,
      alloyPerDay: row.alloy_per_day,
      establishedAt: row.established_at,
      lastYieldAt: row.last_yield_at,
    }));
  }

  /**
   * Get colony on a specific planet
   */
  getColonyByPlanetId(planetId: string): Colony | null {
    const stmt = this.db.prepare("SELECT * FROM colonies WHERE planet_id = ?");
    const row = stmt.get(planetId) as any;
    if (!row) return null;

    return {
      id: row.id,
      playerId: row.player_id,
      speciesId: row.species_id,
      systemId: row.system_id,
      planetId: row.planet_id,
      planetName: row.planet_name,
      stage: row.stage,
      specialization: row.specialization,
      population: row.population,
      sciencePerDay: row.science_per_day,
      alloyPerDay: row.alloy_per_day,
      establishedAt: row.established_at,
      lastYieldAt: row.last_yield_at,
    };
  }

  /**
   * Delete a colony
   */
  deleteColony(colonyId: string): void {
    const stmt = this.db.prepare("DELETE FROM colonies WHERE id = ?");
    stmt.run(colonyId);
  }

  /**
   * Update colony resource yields
   */
  updateColonyYield(colonyId: string, lastYieldAt: number): void {
    const stmt = this.db.prepare(
      "UPDATE colonies SET last_yield_at = ? WHERE id = ?"
    );
    stmt.run(lastYieldAt, colonyId);
  }

  /**
   * Update colony development (stage, population, yields)
   */
  updateColony(colony: Colony): void {
    const stmt = this.db.prepare(
      `UPDATE colonies SET stage = ?, specialization = ?, population = ?, 
       science_per_day = ?, energy_per_day = ?, alloy_per_day = ?, 
       last_yield_at = ? WHERE id = ?`
    );
    stmt.run(
      colony.stage,
      colony.specialization,
      colony.population,
      colony.sciencePerDay,
      0, // energy_per_day is deprecated (colonies don't produce energy)
      colony.alloyPerDay,
      colony.lastYieldAt,
      colony.id
    );
  }

  // ==================== Native Civilization Operations ====================

  /**
   * Create a native civilization
   */
  createNativeCivilization(civilization: NativeCivilization): void {
    const stmt = this.db.prepare(
      `INSERT INTO native_civilizations (id, species_id, planet_id, system_id, 
       civilization_level, population, attitude, discovered_at, discovered_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
      civilization.id,
      civilization.speciesId,
      civilization.planetId,
      civilization.systemId,
      civilization.civilizationLevel,
      civilization.population,
      civilization.attitude,
      civilization.discoveredAt || null,
      civilization.discoveredBy || null
    );
  }

  /**
   * Get native civilization by ID
   */
  getNativeCivilizationById(civId: string): NativeCivilization | null {
    const stmt = this.db.prepare(
      "SELECT * FROM native_civilizations WHERE id = ?"
    );
    const row = stmt.get(civId) as any;
    if (!row) return null;

    return {
      id: row.id,
      speciesId: row.species_id,
      planetId: row.planet_id,
      systemId: row.system_id,
      civilizationLevel: row.civilization_level,
      population: row.population,
      attitude: row.attitude,
      discoveredAt: row.discovered_at || undefined,
      discoveredBy: row.discovered_by || undefined,
    };
  }

  /**
   * Get native civilizations in a system
   */
  getNativeCivilizationsBySystemId(systemId: string): NativeCivilization[] {
    const stmt = this.db.prepare(
      "SELECT * FROM native_civilizations WHERE system_id = ?"
    );
    const rows = stmt.all(systemId) as any[];

    return rows.map((row) => ({
      id: row.id,
      speciesId: row.species_id,
      planetId: row.planet_id,
      systemId: row.system_id,
      civilizationLevel: row.civilization_level,
      population: row.population,
      attitude: row.attitude,
      discoveredAt: row.discovered_at || undefined,
      discoveredBy: row.discovered_by || undefined,
    }));
  }

  /**
   * Get native civilization on a specific planet
   */
  getNativeCivilizationByPlanetId(planetId: string): NativeCivilization | null {
    const stmt = this.db.prepare(
      "SELECT * FROM native_civilizations WHERE planet_id = ?"
    );
    const row = stmt.get(planetId) as any;
    if (!row) return null;

    return {
      id: row.id,
      speciesId: row.species_id,
      planetId: row.planet_id,
      systemId: row.system_id,
      civilizationLevel: row.civilization_level,
      population: row.population,
      attitude: row.attitude,
      discoveredAt: row.discovered_at || undefined,
      discoveredBy: row.discovered_by || undefined,
    };
  }

  /**
   * Update native civilization discovery info
   */
  updateNativeCivilizationDiscovery(
    civId: string,
    discoveredAt: number,
    discoveredBy: string
  ): void {
    const stmt = this.db.prepare(
      "UPDATE native_civilizations SET discovered_at = ?, discovered_by = ? WHERE id = ?"
    );
    stmt.run(discoveredAt, discoveredBy, civId);
  }

  /**
   * Update native civilization attitude
   */
  updateNativeCivilizationAttitude(
    civId: string,
    attitude: "friendly" | "neutral" | "hostile" | "unknown"
  ): void {
    const stmt = this.db.prepare(
      "UPDATE native_civilizations SET attitude = ? WHERE id = ?"
    );
    stmt.run(attitude, civId);
  }

  // Gate defense operations

  /**
   * Create a new defense platform for a gate
   */
  createGateDefense(
    id: string,
    gateId: string,
    playerId: string,
    systemId: string,
    energyCost: number,
    alloyCost: number,
    maintenancePerDay: number,
    health: number = 100.0
  ): void {
    const now = Date.now();
    const stmt = this.db.prepare(
      "INSERT INTO gate_defenses (id, gate_id, player_id, system_id, health, max_health, created_at, energy_cost, alloy_cost, maintenance_alloy_per_day, last_maintenance_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    stmt.run(id, gateId, playerId, systemId, health, health, now, energyCost, alloyCost, maintenancePerDay, now);
  }

  /**
   * Get all defenses for a gate
   */
  getGateDefenses(gateId: string): Array<{
    id: string;
    gateId: string;
    playerId: string;
    systemId: string;
    health: number;
    maxHealth: number;
    createdAt: number;
    energyCost: number;
    alloyCost: number;
    maintenanceAlloyPerDay: number;
    lastMaintenanceAt: number;
  }> {
    const stmt = this.db.prepare(
      "SELECT * FROM gate_defenses WHERE gate_id = ? AND health > 0"
    );
    const rows = stmt.all(gateId) as any[];
    return rows.map((row) => ({
      id: row.id,
      gateId: row.gate_id,
      playerId: row.player_id,
      systemId: row.system_id,
      health: row.health,
      maxHealth: row.max_health,
      createdAt: row.created_at,
      energyCost: row.energy_cost ?? 1.0,
      alloyCost: row.alloy_cost ?? 10.0,
      maintenanceAlloyPerDay: row.maintenance_alloy_per_day ?? 0.1,
      lastMaintenanceAt: row.last_maintenance_at ?? row.created_at,
    }));
  }

  /**
   * Update defense platform health
   */
  updateGateDefenseHealth(defenseId: string, health: number): void {
    const stmt = this.db.prepare(
      "UPDATE gate_defenses SET health = ? WHERE id = ?"
    );
    stmt.run(health, defenseId);
  }

  /**
   * Get a single defense platform by ID (for refunds)
   */
  getGateDefenseById(defenseId: string): {
    id: string;
    gateId: string;
    playerId: string;
    systemId: string;
    health: number;
    maxHealth: number;
    createdAt: number;
    energyCost: number;
    alloyCost: number;
    maintenanceAlloyPerDay: number;
    lastMaintenanceAt: number;
  } | null {
    const stmt = this.db.prepare("SELECT * FROM gate_defenses WHERE id = ?");
    const row = stmt.get(defenseId) as any;
    if (!row) return null;
    return {
      id: row.id,
      gateId: row.gate_id,
      playerId: row.player_id,
      systemId: row.system_id,
      health: row.health,
      maxHealth: row.max_health,
      createdAt: row.created_at,
      energyCost: row.energy_cost ?? 1.0,
      alloyCost: row.alloy_cost ?? 10.0,
      maintenanceAlloyPerDay: row.maintenance_alloy_per_day ?? 0.1,
      lastMaintenanceAt: row.last_maintenance_at ?? row.created_at,
    };
  }

  /**
   * Delete a defense platform
   */
  deleteGateDefense(defenseId: string): void {
    const stmt = this.db.prepare("DELETE FROM gate_defenses WHERE id = ?");
    stmt.run(defenseId);
  }

  /**
   * Get count of active defenses for a gate
   */
  getGateDefenseCount(gateId: string): number {
    const stmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM gate_defenses WHERE gate_id = ? AND health > 0"
    );
    const row = stmt.get(gateId) as any;
    return row.count;
  }

  /**
   * Get all defenses for a player (for calculating maintenance costs)
   */
  getGateDefensesByPlayer(playerId: string): Array<{
    id: string;
    gateId: string;
    playerId: string;
    systemId: string;
    health: number;
    maxHealth: number;
    createdAt: number;
    energyCost: number;
    alloyCost: number;
    maintenanceAlloyPerDay: number;
    lastMaintenanceAt: number;
  }> {
    const stmt = this.db.prepare(
      "SELECT * FROM gate_defenses WHERE player_id = ? AND health > 0"
    );
    const rows = stmt.all(playerId) as any[];
    return rows.map((row) => ({
      id: row.id,
      gateId: row.gate_id,
      playerId: row.player_id,
      systemId: row.system_id,
      health: row.health,
      maxHealth: row.max_health,
      createdAt: row.created_at,
      energyCost: row.energy_cost ?? 1.0,
      alloyCost: row.alloy_cost ?? 10.0,
      maintenanceAlloyPerDay: row.maintenance_alloy_per_day ?? 0.1,
      lastMaintenanceAt: row.last_maintenance_at ?? row.created_at,
    }));
  }

  // Gate attack operations

  /**
   * Create a new gate attack
   */
  createGateAttack(
    id: string,
    gateId: string,
    attackerId: string,
    defenderId: string,
    systemId: string,
    attackShipCount: number,
    energyCostPerShip: number,
    alloyCostPerShip: number
  ): void {
    const stmt = this.db.prepare(
      "INSERT INTO gate_attacks (id, gate_id, attacker_id, defender_id, system_id, attack_ship_count, attack_ships_remaining, status, started_at, energy_cost_per_ship, alloy_cost_per_ship) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    stmt.run(
      id,
      gateId,
      attackerId,
      defenderId,
      systemId,
      attackShipCount,
      attackShipCount,
      "in_progress",
      Date.now(),
      energyCostPerShip,
      alloyCostPerShip
    );
  }

  /**
   * Get an attack by ID
   */
  getGateAttack(attackId: string): {
    id: string;
    gateId: string;
    attackerId: string;
    defenderId: string;
    systemId: string;
    attackShipCount: number;
    attackShipsRemaining: number;
    status: string;
    startedAt: number;
    completedAt?: number;
    combatLog?: string;
  } | null {
    const stmt = this.db.prepare("SELECT * FROM gate_attacks WHERE id = ?");
    const row = stmt.get(attackId) as any;
    if (!row) return null;

    return {
      id: row.id,
      gateId: row.gate_id,
      attackerId: row.attacker_id,
      defenderId: row.defender_id,
      systemId: row.system_id,
      attackShipCount: row.attack_ship_count,
      attackShipsRemaining: row.attack_ships_remaining,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at || undefined,
      combatLog: row.combat_log || undefined,
    };
  }

  /**
   * Get active attack on a gate
   */
  getActiveGateAttack(gateId: string): {
    id: string;
    gateId: string;
    attackerId: string;
    defenderId: string;
    systemId: string;
    attackShipCount: number;
    attackShipsRemaining: number;
    status: string;
    startedAt: number;
    completedAt?: number;
    combatLog?: string;
  } | null {
    const stmt = this.db.prepare(
      "SELECT * FROM gate_attacks WHERE gate_id = ? AND status = 'in_progress'"
    );
    const row = stmt.get(gateId) as any;
    if (!row) return null;

    return {
      id: row.id,
      gateId: row.gate_id,
      attackerId: row.attacker_id,
      defenderId: row.defender_id,
      systemId: row.system_id,
      attackShipCount: row.attack_ship_count,
      attackShipsRemaining: row.attack_ships_remaining,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at || undefined,
      combatLog: row.combat_log || undefined,
    };
  }

  /**
   * Update attack status
   */
  updateGateAttack(
    attackId: string,
    attackShipsRemaining: number,
    status: string,
    combatLog: string,
    completedAt?: number
  ): void {
    const stmt = this.db.prepare(
      "UPDATE gate_attacks SET attack_ships_remaining = ?, status = ?, combat_log = ?, completed_at = ? WHERE id = ?"
    );
    stmt.run(
      attackShipsRemaining,
      status,
      combatLog,
      completedAt || null,
      attackId
    );
  }
}
