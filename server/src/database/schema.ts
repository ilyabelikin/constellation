import Database from "better-sqlite3";

export function initializeDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);

  // Enable foreign keys
  db.pragma("foreign_keys = ON");

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS galaxies (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      seed INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS star_systems (
      id TEXT PRIMARY KEY,
      galaxy_id TEXT NOT NULL,
      position_x REAL NOT NULL,
      position_y REAL NOT NULL,
      position_z REAL NOT NULL,
      seed INTEGER NOT NULL,
      generated_data TEXT NOT NULL,
      FOREIGN KEY (galaxy_id) REFERENCES galaxies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      uuid TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      galaxy_id TEXT NOT NULL,
      home_system_id TEXT NOT NULL,
      home_planet_id TEXT NOT NULL,
      current_system_id TEXT NOT NULL,
      FOREIGN KEY (galaxy_id) REFERENCES galaxies(id) ON DELETE CASCADE,
      FOREIGN KEY (home_system_id) REFERENCES star_systems(id),
      FOREIGN KEY (current_system_id) REFERENCES star_systems(id)
    );

    CREATE TABLE IF NOT EXISTS ships (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      system_id TEXT NOT NULL,
      parent_body_id TEXT NOT NULL,
      orbital_elements TEXT NOT NULL,
      delta_v REAL NOT NULL,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY (system_id) REFERENCES star_systems(id)
    );

    CREATE TABLE IF NOT EXISTS star_gates (
      id TEXT PRIMARY KEY,
      system_id TEXT NOT NULL,
      destination_system_id TEXT NOT NULL,
      orbital_elements TEXT NOT NULL,
      name TEXT NOT NULL,
      FOREIGN KEY (system_id) REFERENCES star_systems(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS explored_gates (
      player_id TEXT NOT NULL,
      gate_id TEXT NOT NULL,
      PRIMARY KEY (player_id, gate_id),
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY (gate_id) REFERENCES star_gates(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_players_uuid ON players(uuid);
    CREATE INDEX IF NOT EXISTS idx_players_galaxy ON players(galaxy_id);
    CREATE INDEX IF NOT EXISTS idx_systems_galaxy ON star_systems(galaxy_id);
    CREATE INDEX IF NOT EXISTS idx_ships_player ON ships(player_id);
    CREATE INDEX IF NOT EXISTS idx_gates_system ON star_gates(system_id);
    CREATE INDEX IF NOT EXISTS idx_explored_gates_player ON explored_gates(player_id);
  `);

  return db;
}
