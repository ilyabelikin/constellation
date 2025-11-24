import Database from "better-sqlite3";
import { TIME_SCALE_DEFAULT } from "@constellation/shared";

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
      created_at INTEGER NOT NULL,
      current_time REAL DEFAULT 0,
      is_paused INTEGER DEFAULT 1,
      time_scale REAL DEFAULT ${TIME_SCALE_DEFAULT}
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
      constellation_positions TEXT DEFAULT '{}',
      energy INTEGER DEFAULT 10,
      alloy INTEGER DEFAULT 10,
      science INTEGER DEFAULT 0,
      species_id TEXT,
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

    CREATE TABLE IF NOT EXISTS gate_ownership (
      gate_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      explored_at INTEGER NOT NULL,
      FOREIGN KEY (gate_id) REFERENCES star_gates(id) ON DELETE CASCADE,
      FOREIGN KEY (owner_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS system_discoveries (
      system_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      discovered_at INTEGER NOT NULL,
      PRIMARY KEY (system_id, player_id),
      FOREIGN KEY (system_id) REFERENCES star_systems(id) ON DELETE CASCADE,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS player_meetings (
      player1_id TEXT NOT NULL,
      player2_id TEXT NOT NULL,
      met_at INTEGER NOT NULL,
      PRIMARY KEY (player1_id, player2_id),
      FOREIGN KEY (player1_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY (player2_id) REFERENCES players(id) ON DELETE CASCADE,
      CHECK (player1_id < player2_id)
    );

    CREATE TABLE IF NOT EXISTS player_stances (
      from_player_id TEXT NOT NULL,
      to_player_id TEXT NOT NULL,
      stance TEXT NOT NULL CHECK (stance IN ('neutral', 'friendly', 'aggressive')),
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (from_player_id, to_player_id),
      FOREIGN KEY (from_player_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY (to_player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mining_operations (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      system_id TEXT NOT NULL,
      celestial_body_id TEXT NOT NULL,
      alloy_per_day REAL NOT NULL,
      established_at INTEGER NOT NULL,
      last_yield_at INTEGER NOT NULL,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY (system_id) REFERENCES star_systems(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS megastructures (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      system_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('dyson_swarm')),
      celestial_body_id TEXT,
      resource_type TEXT,
      resource_per_day REAL,
      established_at INTEGER NOT NULL,
      last_yield_at INTEGER NOT NULL,
      metadata TEXT,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY (system_id) REFERENCES star_systems(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS species (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      homeworld TEXT NOT NULL,
      homeworld_id TEXT NOT NULL,
      appearance TEXT NOT NULL,
      traits TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      player_id TEXT,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS colonies (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      species_id TEXT NOT NULL,
      system_id TEXT NOT NULL,
      planet_id TEXT NOT NULL,
      planet_name TEXT NOT NULL,
      stage TEXT NOT NULL CHECK (stage IN ('outpost', 'settlement', 'colony', 'developed', 'metropolis', 'ecumenopolis')),
      specialization TEXT NOT NULL CHECK (specialization IN ('balanced', 'research', 'industrial')),
      population INTEGER NOT NULL,
      science_per_day REAL NOT NULL,
      energy_per_day REAL NOT NULL,
      alloy_per_day REAL NOT NULL,
      established_at INTEGER NOT NULL,
      last_yield_at INTEGER NOT NULL,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY (species_id) REFERENCES species(id) ON DELETE CASCADE,
      FOREIGN KEY (system_id) REFERENCES star_systems(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS native_civilizations (
      id TEXT PRIMARY KEY,
      species_id TEXT NOT NULL,
      planet_id TEXT NOT NULL,
      system_id TEXT NOT NULL,
      civilization_level TEXT NOT NULL,
      population INTEGER NOT NULL,
      attitude TEXT NOT NULL CHECK (attitude IN ('friendly', 'neutral', 'hostile', 'unknown')),
      discovered_at INTEGER,
      discovered_by TEXT,
      FOREIGN KEY (species_id) REFERENCES species(id) ON DELETE CASCADE,
      FOREIGN KEY (system_id) REFERENCES star_systems(id) ON DELETE CASCADE,
      FOREIGN KEY (discovered_by) REFERENCES players(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_players_uuid ON players(uuid);
    CREATE INDEX IF NOT EXISTS idx_players_galaxy ON players(galaxy_id);
    CREATE INDEX IF NOT EXISTS idx_systems_galaxy ON star_systems(galaxy_id);
    CREATE INDEX IF NOT EXISTS idx_ships_player ON ships(player_id);
    CREATE INDEX IF NOT EXISTS idx_gates_system ON star_gates(system_id);
    CREATE INDEX IF NOT EXISTS idx_explored_gates_player ON explored_gates(player_id);
    CREATE INDEX IF NOT EXISTS idx_system_discoveries_system ON system_discoveries(system_id);
    CREATE INDEX IF NOT EXISTS idx_system_discoveries_player ON system_discoveries(player_id);
    CREATE INDEX IF NOT EXISTS idx_gate_ownership_owner ON gate_ownership(owner_id);
    CREATE INDEX IF NOT EXISTS idx_player_stances_from ON player_stances(from_player_id);
    CREATE INDEX IF NOT EXISTS idx_player_stances_to ON player_stances(to_player_id);
    CREATE INDEX IF NOT EXISTS idx_mining_operations_player ON mining_operations(player_id);
    CREATE INDEX IF NOT EXISTS idx_mining_operations_system ON mining_operations(system_id);
    CREATE INDEX IF NOT EXISTS idx_megastructures_player ON megastructures(player_id);
    CREATE INDEX IF NOT EXISTS idx_megastructures_system ON megastructures(system_id);
    CREATE INDEX IF NOT EXISTS idx_megastructures_type ON megastructures(type);
    CREATE INDEX IF NOT EXISTS idx_species_player ON species(player_id);
    CREATE INDEX IF NOT EXISTS idx_species_homeworld ON species(homeworld_id);
    CREATE INDEX IF NOT EXISTS idx_colonies_player ON colonies(player_id);
    CREATE INDEX IF NOT EXISTS idx_colonies_system ON colonies(system_id);
    CREATE INDEX IF NOT EXISTS idx_colonies_planet ON colonies(planet_id);
    CREATE INDEX IF NOT EXISTS idx_colonies_species ON colonies(species_id);
    CREATE INDEX IF NOT EXISTS idx_native_civilizations_system ON native_civilizations(system_id);
    CREATE INDEX IF NOT EXISTS idx_native_civilizations_planet ON native_civilizations(planet_id);
    CREATE INDEX IF NOT EXISTS idx_native_civilizations_species ON native_civilizations(species_id);
  `);

  // Migration: Add constellation_positions column if it doesn't exist
  try {
    const columns = db.prepare("PRAGMA table_info(players)").all() as Array<{
      name: string;
    }>;
    const hasConstellationPositions = columns.some(
      (col) => col.name === "constellation_positions"
    );

    if (!hasConstellationPositions) {
      console.log("Migrating database: Adding constellation_positions column");
      db.exec(
        "ALTER TABLE players ADD COLUMN constellation_positions TEXT DEFAULT '{}'"
      );
      console.log("Migration complete");
    }
  } catch (error) {
    console.error("Error during migration:", error);
  }

  // Migration: Add time state columns to galaxies table if they don't exist
  try {
    const galaxyColumns = db
      .prepare("PRAGMA table_info(galaxies)")
      .all() as Array<{
      name: string;
    }>;

    const hasCurrentTime = galaxyColumns.some(
      (col) => col.name === "current_time"
    );
    const hasIsPaused = galaxyColumns.some((col) => col.name === "is_paused");
    const hasTimeScale = galaxyColumns.some((col) => col.name === "time_scale");

    if (!hasCurrentTime) {
      console.log("Migrating database: Adding current_time column to galaxies");
      db.exec("ALTER TABLE galaxies ADD COLUMN current_time REAL DEFAULT 0");
    }

    if (!hasIsPaused) {
      console.log("Migrating database: Adding is_paused column to galaxies");
      db.exec("ALTER TABLE galaxies ADD COLUMN is_paused INTEGER DEFAULT 1");
    }

    if (!hasTimeScale) {
      console.log("Migrating database: Adding time_scale column to galaxies");
      db.exec(
        `ALTER TABLE galaxies ADD COLUMN time_scale REAL DEFAULT ${TIME_SCALE_DEFAULT}`
      );
    }

    if (!hasCurrentTime || !hasIsPaused || !hasTimeScale) {
      console.log("Galaxy time state migration complete");
    }

    // Migration: Update existing galaxies that have time_scale = 1 to use TIME_SCALE_DEFAULT
    // This fixes galaxies created before the default was changed
    const galaxiesWithOldScale = db
      .prepare("SELECT id FROM galaxies WHERE time_scale = 1")
      .all() as Array<{ id: string }>;

    if (galaxiesWithOldScale.length > 0) {
      console.log(
        `Migrating ${galaxiesWithOldScale.length} galaxies from time_scale=1 to time_scale=${TIME_SCALE_DEFAULT}`
      );
      const updateStmt = db.prepare(
        "UPDATE galaxies SET time_scale = ? WHERE time_scale = 1"
      );
      updateStmt.run(TIME_SCALE_DEFAULT);
      console.log("Galaxy time scale migration complete");
    }
  } catch (error) {
    console.error("Error during galaxy time state migration:", error);
  }

  // Migration: Add resource columns to players table if they don't exist
  try {
    const playerColumns = db
      .prepare("PRAGMA table_info(players)")
      .all() as Array<{
      name: string;
    }>;

    const hasEnergy = playerColumns.some((col) => col.name === "energy");
    const hasAlloy = playerColumns.some((col) => col.name === "alloy");

    if (!hasEnergy) {
      console.log("Migrating database: Adding energy column to players");
      db.exec("ALTER TABLE players ADD COLUMN energy INTEGER DEFAULT 10");
    }

    if (!hasAlloy) {
      console.log("Migrating database: Adding alloy column to players");
      db.exec("ALTER TABLE players ADD COLUMN alloy INTEGER DEFAULT 10");
    }

    if (!hasEnergy || !hasAlloy) {
      console.log("Player resources migration complete");
    }
  } catch (error) {
    console.error("Error during player resources migration:", error);
  }

  // Migration: Create gate_ownership table if it doesn't exist
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='gate_ownership'"
      )
      .all() as Array<{ name: string }>;

    if (tables.length === 0) {
      console.log("Migrating database: Creating gate_ownership table");
      db.exec(`
        CREATE TABLE gate_ownership (
          gate_id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          explored_at INTEGER NOT NULL,
          FOREIGN KEY (gate_id) REFERENCES star_gates(id) ON DELETE CASCADE,
          FOREIGN KEY (owner_id) REFERENCES players(id) ON DELETE CASCADE
        );
        CREATE INDEX idx_gate_ownership_owner ON gate_ownership(owner_id);
      `);
      console.log("Gate ownership table migration complete");
    }
  } catch (error) {
    console.error("Error during gate ownership table migration:", error);
  }

  // Migration: Create player_meetings table if it doesn't exist
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='player_meetings'"
      )
      .all() as Array<{ name: string }>;

    if (tables.length === 0) {
      console.log("Migrating database: Creating player_meetings table");
      db.exec(`
        CREATE TABLE player_meetings (
          player1_id TEXT NOT NULL,
          player2_id TEXT NOT NULL,
          met_at INTEGER NOT NULL,
          PRIMARY KEY (player1_id, player2_id),
          FOREIGN KEY (player1_id) REFERENCES players(id) ON DELETE CASCADE,
          FOREIGN KEY (player2_id) REFERENCES players(id) ON DELETE CASCADE,
          CHECK (player1_id < player2_id)
        );
      `);
      console.log("Player meetings table migration complete");
    }
  } catch (error) {
    console.error("Error during player meetings table migration:", error);
  }

  // Migration: Create player_stances table if it doesn't exist
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='player_stances'"
      )
      .all() as Array<{ name: string }>;

    if (tables.length === 0) {
      console.log("Migrating database: Creating player_stances table");
      db.exec(`
        CREATE TABLE player_stances (
          from_player_id TEXT NOT NULL,
          to_player_id TEXT NOT NULL,
          stance TEXT NOT NULL CHECK (stance IN ('neutral', 'friendly', 'aggressive')),
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (from_player_id, to_player_id),
          FOREIGN KEY (from_player_id) REFERENCES players(id) ON DELETE CASCADE,
          FOREIGN KEY (to_player_id) REFERENCES players(id) ON DELETE CASCADE
        );
        CREATE INDEX idx_player_stances_from ON player_stances(from_player_id);
        CREATE INDEX idx_player_stances_to ON player_stances(to_player_id);
      `);
      console.log("Player stances table migration complete");
    }
  } catch (error) {
    console.error("Error during player stances table migration:", error);
  }

  // Migration: Create mining_operations table if it doesn't exist
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='mining_operations'"
      )
      .all() as Array<{ name: string }>;

    if (tables.length === 0) {
      console.log("Migrating database: Creating mining_operations table");
      db.exec(`
        CREATE TABLE mining_operations (
          id TEXT PRIMARY KEY,
          player_id TEXT NOT NULL,
          system_id TEXT NOT NULL,
          celestial_body_id TEXT NOT NULL,
          alloy_per_day REAL NOT NULL,
          established_at INTEGER NOT NULL,
          last_yield_at INTEGER NOT NULL,
          FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
          FOREIGN KEY (system_id) REFERENCES star_systems(id) ON DELETE CASCADE
        );
        CREATE INDEX idx_mining_operations_player ON mining_operations(player_id);
        CREATE INDEX idx_mining_operations_system ON mining_operations(system_id);
      `);
      console.log("Mining operations table migration complete");
    }
  } catch (error) {
    console.error("Error during mining operations table migration:", error);
  }

  // Migration: Create megastructures table if it doesn't exist
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='megastructures'"
      )
      .all() as Array<{ name: string }>;

    if (tables.length === 0) {
      console.log("Migrating database: Creating megastructures table");
      db.exec(`
        CREATE TABLE megastructures (
          id TEXT PRIMARY KEY,
          player_id TEXT NOT NULL,
          system_id TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('dyson_swarm')),
          celestial_body_id TEXT,
          resource_type TEXT,
          resource_per_day REAL,
          established_at INTEGER NOT NULL,
          last_yield_at INTEGER NOT NULL,
          metadata TEXT,
          FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
          FOREIGN KEY (system_id) REFERENCES star_systems(id) ON DELETE CASCADE
        );
        CREATE INDEX idx_megastructures_player ON megastructures(player_id);
        CREATE INDEX idx_megastructures_system ON megastructures(system_id);
        CREATE INDEX idx_megastructures_type ON megastructures(type);
      `);
      console.log("Megastructures table migration complete");
    }
  } catch (error) {
    console.error("Error during megastructures table migration:", error);
  }

  // Migration: Add science and species_id columns to players table if they don't exist
  try {
    const playerColumns = db
      .prepare("PRAGMA table_info(players)")
      .all() as Array<{ name: string }>;

    const hasScience = playerColumns.some((col) => col.name === "science");
    const hasSpeciesId = playerColumns.some((col) => col.name === "species_id");

    if (!hasScience) {
      console.log("Migrating database: Adding science column to players");
      db.exec("ALTER TABLE players ADD COLUMN science INTEGER DEFAULT 0");
    }

    if (!hasSpeciesId) {
      console.log("Migrating database: Adding species_id column to players");
      db.exec("ALTER TABLE players ADD COLUMN species_id TEXT");
    }

    if (!hasScience || !hasSpeciesId) {
      console.log("Player species migration complete");
    }
  } catch (error) {
    console.error("Error during player species migration:", error);
  }

  // Migration: Create species table if it doesn't exist
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='species'"
      )
      .all() as Array<{ name: string }>;

    if (tables.length === 0) {
      console.log("Migrating database: Creating species table");
      db.exec(`
        CREATE TABLE species (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          homeworld TEXT NOT NULL,
          homeworld_id TEXT NOT NULL,
          appearance TEXT NOT NULL,
          traits TEXT NOT NULL,
          description TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          player_id TEXT,
          FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE SET NULL
        );
        CREATE INDEX idx_species_player ON species(player_id);
        CREATE INDEX idx_species_homeworld ON species(homeworld_id);
      `);
      console.log("Species table migration complete");
    }
  } catch (error) {
    console.error("Error during species table migration:", error);
  }

  // Migration: Create colonies table if it doesn't exist
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='colonies'"
      )
      .all() as Array<{ name: string }>;

    if (tables.length === 0) {
      console.log("Migrating database: Creating colonies table");
      db.exec(`
        CREATE TABLE colonies (
          id TEXT PRIMARY KEY,
          player_id TEXT NOT NULL,
          species_id TEXT NOT NULL,
          system_id TEXT NOT NULL,
          planet_id TEXT NOT NULL,
          planet_name TEXT NOT NULL,
          stage TEXT NOT NULL CHECK (stage IN ('outpost', 'settlement', 'colony', 'developed', 'metropolis', 'ecumenopolis')),
          specialization TEXT NOT NULL CHECK (specialization IN ('balanced', 'research', 'industrial')),
          population INTEGER NOT NULL,
          science_per_day REAL NOT NULL,
          energy_per_day REAL NOT NULL,
          alloy_per_day REAL NOT NULL,
          established_at INTEGER NOT NULL,
          last_yield_at INTEGER NOT NULL,
          FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
          FOREIGN KEY (species_id) REFERENCES species(id) ON DELETE CASCADE,
          FOREIGN KEY (system_id) REFERENCES star_systems(id) ON DELETE CASCADE
        );
        CREATE INDEX idx_colonies_player ON colonies(player_id);
        CREATE INDEX idx_colonies_system ON colonies(system_id);
        CREATE INDEX idx_colonies_planet ON colonies(planet_id);
        CREATE INDEX idx_colonies_species ON colonies(species_id);
      `);
      console.log("Colonies table migration complete");
    }
  } catch (error) {
    console.error("Error during colonies table migration:", error);
  }

  // Migration: Create native_civilizations table if it doesn't exist
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='native_civilizations'"
      )
      .all() as Array<{ name: string }>;

    if (tables.length === 0) {
      console.log("Migrating database: Creating native_civilizations table");
      db.exec(`
        CREATE TABLE native_civilizations (
          id TEXT PRIMARY KEY,
          species_id TEXT NOT NULL,
          planet_id TEXT NOT NULL,
          system_id TEXT NOT NULL,
          civilization_level TEXT NOT NULL,
          population INTEGER NOT NULL,
          attitude TEXT NOT NULL CHECK (attitude IN ('friendly', 'neutral', 'hostile', 'unknown')),
          discovered_at INTEGER,
          discovered_by TEXT,
          FOREIGN KEY (species_id) REFERENCES species(id) ON DELETE CASCADE,
          FOREIGN KEY (system_id) REFERENCES star_systems(id) ON DELETE CASCADE,
          FOREIGN KEY (discovered_by) REFERENCES players(id) ON DELETE SET NULL
        );
        CREATE INDEX idx_native_civilizations_system ON native_civilizations(system_id);
        CREATE INDEX idx_native_civilizations_planet ON native_civilizations(planet_id);
        CREATE INDEX idx_native_civilizations_species ON native_civilizations(species_id);
      `);
      console.log("Native civilizations table migration complete");
    }
  } catch (error) {
    console.error("Error during native civilizations table migration:", error);
  }

  return db;
}
