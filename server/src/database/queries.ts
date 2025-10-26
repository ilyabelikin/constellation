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
      "INSERT INTO players (id, uuid, name, galaxy_id, home_system_id, current_system_id) VALUES (?, ?, ?, ?, ?, ?)"
    );
    stmt.run(
      player.id,
      player.uuid,
      player.name,
      player.galaxyId,
      player.homeSystemId,
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
}
