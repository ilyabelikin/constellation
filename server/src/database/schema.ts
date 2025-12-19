import Database from "better-sqlite3";
import { TIME_SCALE_DEFAULT, STARTING_RESOURCES } from "@constellation/shared";

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
      energy INTEGER DEFAULT ${STARTING_RESOURCES.energy},
      alloy INTEGER DEFAULT ${STARTING_RESOURCES.alloy},
      science INTEGER DEFAULT ${STARTING_RESOURCES.science},
      species_id TEXT,
      last_active_at INTEGER DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS tunnels (
      id TEXT PRIMARY KEY,
      system_a_id TEXT NOT NULL,
      system_b_id TEXT NOT NULL,
      powered_by_species_id TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (system_a_id) REFERENCES star_systems(id) ON DELETE CASCADE,
      FOREIGN KEY (system_b_id) REFERENCES star_systems(id) ON DELETE CASCADE,
      FOREIGN KEY (powered_by_species_id) REFERENCES species(id) ON DELETE SET NULL,
      CHECK (system_a_id < system_b_id)
    );

    CREATE TABLE IF NOT EXISTS star_gates (
      id TEXT PRIMARY KEY,
      tunnel_id TEXT,
      system_id TEXT NOT NULL,
      destination_system_id TEXT NOT NULL,
      orbital_elements TEXT NOT NULL,
      name TEXT NOT NULL,
      FOREIGN KEY (tunnel_id) REFERENCES tunnels(id) ON DELETE CASCADE,
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
      last_overtaken_at INTEGER DEFAULT 0,
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
      total_alloy_limit REAL DEFAULT 50.0,
      alloy_mined REAL DEFAULT 0.0,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY (system_id) REFERENCES star_systems(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS helium3_operations (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      system_id TEXT NOT NULL,
      celestial_body_id TEXT NOT NULL,
      energy_per_day REAL NOT NULL,
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
    CREATE INDEX IF NOT EXISTS idx_tunnels_system_a ON tunnels(system_a_id);
    CREATE INDEX IF NOT EXISTS idx_tunnels_system_b ON tunnels(system_b_id);
    CREATE INDEX IF NOT EXISTS idx_tunnels_powered_by ON tunnels(powered_by_species_id);
    CREATE INDEX IF NOT EXISTS idx_gates_system ON star_gates(system_id);
    CREATE INDEX IF NOT EXISTS idx_gates_tunnel ON star_gates(tunnel_id);
    CREATE INDEX IF NOT EXISTS idx_explored_gates_player ON explored_gates(player_id);
    CREATE INDEX IF NOT EXISTS idx_system_discoveries_system ON system_discoveries(system_id);
    CREATE INDEX IF NOT EXISTS idx_system_discoveries_player ON system_discoveries(player_id);
    CREATE INDEX IF NOT EXISTS idx_gate_ownership_owner ON gate_ownership(owner_id);
    CREATE INDEX IF NOT EXISTS idx_player_stances_from ON player_stances(from_player_id);
    CREATE INDEX IF NOT EXISTS idx_player_stances_to ON player_stances(to_player_id);
    CREATE INDEX IF NOT EXISTS idx_mining_operations_player ON mining_operations(player_id);
    CREATE INDEX IF NOT EXISTS idx_mining_operations_system ON mining_operations(system_id);
    CREATE INDEX IF NOT EXISTS idx_helium3_operations_player ON helium3_operations(player_id);
    CREATE INDEX IF NOT EXISTS idx_helium3_operations_system ON helium3_operations(system_id);
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
      db.exec(
        `ALTER TABLE players ADD COLUMN energy INTEGER DEFAULT ${STARTING_RESOURCES.energy}`
      );
    }

    if (!hasAlloy) {
      console.log("Migrating database: Adding alloy column to players");
      db.exec(
        `ALTER TABLE players ADD COLUMN alloy INTEGER DEFAULT ${STARTING_RESOURCES.alloy}`
      );
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
          total_alloy_limit REAL DEFAULT 50.0,
          alloy_mined REAL DEFAULT 0.0,
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

  // Migration: Add total_alloy_limit and alloy_mined to mining_operations table
  try {
    const columns = db
      .prepare("PRAGMA table_info(mining_operations)")
      .all() as Array<{ name: string }>;

    const hasLimitColumn = columns.some(
      (col) => col.name === "total_alloy_limit"
    );
    const hasMinedColumn = columns.some((col) => col.name === "alloy_mined");

    if (!hasLimitColumn) {
      console.log(
        "Migrating database: Adding total_alloy_limit to mining_operations"
      );
      db.exec(
        `ALTER TABLE mining_operations ADD COLUMN total_alloy_limit REAL DEFAULT 50.0;`
      );
    }

    if (!hasMinedColumn) {
      console.log(
        "Migrating database: Adding alloy_mined to mining_operations"
      );
      db.exec(
        `ALTER TABLE mining_operations ADD COLUMN alloy_mined REAL DEFAULT 0.0;`
      );
    }
  } catch (error) {
    console.error("Error during mining operations limit migration:", error);
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

  // Migration: Add last_active_at column to players table if it doesn't exist
  try {
    const playerColumns = db
      .prepare("PRAGMA table_info(players)")
      .all() as Array<{ name: string }>;

    const hasLastActiveAt = playerColumns.some(
      (col) => col.name === "last_active_at"
    );

    if (!hasLastActiveAt) {
      console.log(
        "Migrating database: Adding last_active_at column to players"
      );
      db.exec(
        "ALTER TABLE players ADD COLUMN last_active_at INTEGER DEFAULT 0"
      );
      // Set current timestamp for existing players
      db.exec(`UPDATE players SET last_active_at = ${Date.now()}`);
      console.log("Player activity tracking migration complete");
    }
  } catch (error) {
    console.error("Error during player activity tracking migration:", error);
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
          pregenerated_species_id TEXT,
          FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE SET NULL
        );
        CREATE INDEX idx_species_player ON species(player_id);
        CREATE INDEX idx_species_homeworld ON species(homeworld_id);
        CREATE INDEX idx_species_pregenerated ON species(pregenerated_species_id);
      `);
      console.log("Species table migration complete");
    }
  } catch (error) {
    console.error("Error during species table migration:", error);
  }

  // Migration: Add pregenerated_species_id column to species table if it doesn't exist
  try {
    const speciesColumns = db
      .prepare("PRAGMA table_info(species)")
      .all() as Array<{ name: string }>;

    const hasPregeneratedSpeciesId = speciesColumns.some(
      (col) => col.name === "pregenerated_species_id"
    );

    if (!hasPregeneratedSpeciesId) {
      console.log(
        "Migrating database: Adding pregenerated_species_id column to species"
      );
      db.exec("ALTER TABLE species ADD COLUMN pregenerated_species_id TEXT");
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_species_pregenerated ON species(pregenerated_species_id)"
      );
      console.log("Species pregenerated ID migration complete");
    }
  } catch (error) {
    console.error("Error during species pregenerated ID migration:", error);
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

  // Migration: Create gate_defenses table if it doesn't exist
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='gate_defenses'"
      )
      .all() as Array<{ name: string }>;

    if (tables.length === 0) {
      console.log("Migrating database: Creating gate_defenses table");
      db.exec(`
        CREATE TABLE gate_defenses (
          id TEXT PRIMARY KEY,
          gate_id TEXT NOT NULL,
          player_id TEXT NOT NULL,
          system_id TEXT NOT NULL,
          health REAL NOT NULL DEFAULT 100.0,
          max_health REAL NOT NULL DEFAULT 100.0,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (gate_id) REFERENCES star_gates(id) ON DELETE CASCADE,
          FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
          FOREIGN KEY (system_id) REFERENCES star_systems(id) ON DELETE CASCADE
        );
        CREATE INDEX idx_gate_defenses_gate ON gate_defenses(gate_id);
        CREATE INDEX idx_gate_defenses_player ON gate_defenses(player_id);
        CREATE INDEX idx_gate_defenses_system ON gate_defenses(system_id);
      `);
      console.log("Gate defenses table migration complete");
    }
  } catch (error) {
    console.error("Error during gate defenses table migration:", error);
  }

  // Migration: Create gate_attacks table if it doesn't exist
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='gate_attacks'"
      )
      .all() as Array<{ name: string }>;

    if (tables.length === 0) {
      console.log("Migrating database: Creating gate_attacks table");
      db.exec(`
        CREATE TABLE gate_attacks (
          id TEXT PRIMARY KEY,
          gate_id TEXT NOT NULL,
          attacker_id TEXT NOT NULL,
          defender_id TEXT NOT NULL,
          system_id TEXT NOT NULL,
          attack_ship_count INTEGER NOT NULL,
          attack_ships_remaining INTEGER NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('in_progress', 'attacker_victory', 'defender_victory')),
          started_at INTEGER NOT NULL,
          completed_at INTEGER,
          combat_log TEXT,
          FOREIGN KEY (gate_id) REFERENCES star_gates(id) ON DELETE CASCADE,
          FOREIGN KEY (attacker_id) REFERENCES players(id) ON DELETE CASCADE,
          FOREIGN KEY (defender_id) REFERENCES players(id) ON DELETE CASCADE,
          FOREIGN KEY (system_id) REFERENCES star_systems(id) ON DELETE CASCADE
        );
        CREATE INDEX idx_gate_attacks_gate ON gate_attacks(gate_id);
        CREATE INDEX idx_gate_attacks_attacker ON gate_attacks(attacker_id);
        CREATE INDEX idx_gate_attacks_defender ON gate_attacks(defender_id);
        CREATE INDEX idx_gate_attacks_system ON gate_attacks(system_id);
        CREATE INDEX idx_gate_attacks_status ON gate_attacks(status);
      `);
      console.log("Gate attacks table migration complete");
    }
  } catch (error) {
    console.error("Error during gate attacks table migration:", error);
  }

  // Migration: Add last_overtaken_at column to gate_ownership if it doesn't exist
  try {
    const columns = db
      .prepare("PRAGMA table_info(gate_ownership)")
      .all() as Array<{ name: string }>;

    const hasLastOvertakenAt = columns.some(
      (col) => col.name === "last_overtaken_at"
    );

    if (!hasLastOvertakenAt) {
      console.log(
        "Migrating database: Adding last_overtaken_at to gate_ownership"
      );
      db.exec(
        `ALTER TABLE gate_ownership ADD COLUMN last_overtaken_at INTEGER DEFAULT 0;`
      );
      console.log("Gate ownership last_overtaken_at column migration complete");
    }
  } catch (error) {
    console.error("Error during gate ownership migration:", error);
  }

  // Migration: Add powered_by_player_id and power_cost_energy to tunnels
  try {
    const columns = db.prepare("PRAGMA table_info(tunnels)").all() as Array<{
      name: string;
    }>;

    const hasPoweredByPlayerId = columns.some(
      (col) => col.name === "powered_by_player_id"
    );
    const hasPowerCostEnergy = columns.some(
      (col) => col.name === "power_cost_energy"
    );
    const hasOverchargedAt = columns.some(
      (col) => col.name === "overcharged_at"
    );

    if (!hasPoweredByPlayerId) {
      console.log("Migrating database: Adding powered_by_player_id to tunnels");
      db.exec(`ALTER TABLE tunnels ADD COLUMN powered_by_player_id TEXT;`);
    }

    if (!hasPowerCostEnergy) {
      console.log("Migrating database: Adding power_cost_energy to tunnels");
      db.exec(
        `ALTER TABLE tunnels ADD COLUMN power_cost_energy INTEGER DEFAULT 0;`
      );
    }

    if (!hasOverchargedAt) {
      console.log("Migrating database: Adding overcharged_at to tunnels");
      db.exec(
        `ALTER TABLE tunnels ADD COLUMN overcharged_at INTEGER DEFAULT 0;`
      );
    }

    if (!hasPoweredByPlayerId || !hasPowerCostEnergy || !hasOverchargedAt) {
      console.log("Tunnel power tracking migration complete");
    }
  } catch (error) {
    console.error("Error during tunnel power tracking migration:", error);
  }

  // Migration: Add cost tracking columns to gate_defenses for refunds
  try {
    const columns = db
      .prepare("PRAGMA table_info(gate_defenses)")
      .all() as Array<{ name: string }>;

    const hasEnergyCost = columns.some((col) => col.name === "energy_cost");
    const hasAlloyCost = columns.some((col) => col.name === "alloy_cost");
    const hasMaintenancePerDay = columns.some(
      (col) => col.name === "maintenance_alloy_per_day"
    );
    const hasLastMaintenanceAt = columns.some(
      (col) => col.name === "last_maintenance_at"
    );

    if (!hasEnergyCost) {
      console.log("Migrating database: Adding energy_cost to gate_defenses");
      db.exec(
        `ALTER TABLE gate_defenses ADD COLUMN energy_cost REAL DEFAULT 1.0;`
      );
    }

    if (!hasAlloyCost) {
      console.log("Migrating database: Adding alloy_cost to gate_defenses");
      db.exec(
        `ALTER TABLE gate_defenses ADD COLUMN alloy_cost REAL DEFAULT 10.0;`
      );
    }

    if (!hasMaintenancePerDay) {
      console.log(
        "Migrating database: Adding maintenance_alloy_per_day to gate_defenses"
      );
      db.exec(
        `ALTER TABLE gate_defenses ADD COLUMN maintenance_alloy_per_day REAL DEFAULT 0.1;`
      );
    }

    if (!hasLastMaintenanceAt) {
      console.log(
        "Migrating database: Adding last_maintenance_at to gate_defenses"
      );
      db.exec(
        `ALTER TABLE gate_defenses ADD COLUMN last_maintenance_at INTEGER DEFAULT 0;`
      );
    }

    if (
      !hasEnergyCost ||
      !hasAlloyCost ||
      !hasMaintenancePerDay ||
      !hasLastMaintenanceAt
    ) {
      console.log("Gate defenses cost tracking migration complete");
    }
  } catch (error) {
    console.error("Error during gate defenses cost tracking migration:", error);
  }

  // Migration: Add cost tracking columns to gate_attacks for refunds
  try {
    const columns = db
      .prepare("PRAGMA table_info(gate_attacks)")
      .all() as Array<{ name: string }>;

    const hasEnergyCost = columns.some(
      (col) => col.name === "energy_cost_per_ship"
    );
    const hasAlloyCost = columns.some(
      (col) => col.name === "alloy_cost_per_ship"
    );

    if (!hasEnergyCost) {
      console.log(
        "Migrating database: Adding energy_cost_per_ship to gate_attacks"
      );
      db.exec(
        `ALTER TABLE gate_attacks ADD COLUMN energy_cost_per_ship REAL DEFAULT 1.0;`
      );
    }

    if (!hasAlloyCost) {
      console.log(
        "Migrating database: Adding alloy_cost_per_ship to gate_attacks"
      );
      db.exec(
        `ALTER TABLE gate_attacks ADD COLUMN alloy_cost_per_ship REAL DEFAULT 25.0;`
      );
    }

    if (!hasEnergyCost || !hasAlloyCost) {
      console.log("Gate attacks cost tracking migration complete");
    }
  } catch (error) {
    console.error("Error during gate attacks cost tracking migration:", error);
  }

  // Migration: Create technology_research table if it doesn't exist
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='technology_research'"
      )
      .all() as Array<{ name: string }>;

    if (tables.length === 0) {
      console.log("Migrating database: Creating technology_research table");
      db.exec(`
        CREATE TABLE technology_research (
          player_id TEXT NOT NULL,
          technology_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('not_started', 'in_progress', 'paused', 'completed')),
          progress_days REAL NOT NULL DEFAULT 0,
          science_invested REAL NOT NULL DEFAULT 0,
          started_at INTEGER DEFAULT 0,
          completed_at INTEGER,
          paused_at INTEGER,
          PRIMARY KEY (player_id, technology_id),
          FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
        );
        CREATE INDEX idx_technology_research_player ON technology_research(player_id);
        CREATE INDEX idx_technology_research_status ON technology_research(status);
      `);
      console.log("Technology research table migration complete");
    }
  } catch (error) {
    console.error("Error during technology research table migration:", error);
  }

  // Migration: Create tunnels table and migrate existing gates
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='tunnels'"
      )
      .all() as Array<{ name: string }>;

    if (tables.length === 0) {
      console.log(
        "Migrating database: Creating tunnels table and migrating gates"
      );

      // Create tunnels table
      db.exec(`
        CREATE TABLE tunnels (
          id TEXT PRIMARY KEY,
          system_a_id TEXT NOT NULL,
          system_b_id TEXT NOT NULL,
          powered_by_species_id TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (system_a_id) REFERENCES star_systems(id) ON DELETE CASCADE,
          FOREIGN KEY (system_b_id) REFERENCES star_systems(id) ON DELETE CASCADE,
          FOREIGN KEY (powered_by_species_id) REFERENCES species(id) ON DELETE SET NULL,
          CHECK (system_a_id < system_b_id)
        );
        CREATE INDEX idx_tunnels_system_a ON tunnels(system_a_id);
        CREATE INDEX idx_tunnels_system_b ON tunnels(system_b_id);
        CREATE INDEX idx_tunnels_powered_by ON tunnels(powered_by_species_id);
      `);

      // Check if star_gates has tunnel_id column
      const gateColumns = db
        .prepare("PRAGMA table_info(star_gates)")
        .all() as Array<{ name: string }>;
      const hasTunnelId = gateColumns.some((col) => col.name === "tunnel_id");

      if (!hasTunnelId) {
        // Create new star_gates table with tunnel_id
        db.exec(`
          CREATE TABLE star_gates_new (
            id TEXT PRIMARY KEY,
            tunnel_id TEXT NOT NULL,
            system_id TEXT NOT NULL,
            destination_system_id TEXT NOT NULL,
            orbital_elements TEXT NOT NULL,
            name TEXT NOT NULL,
            FOREIGN KEY (tunnel_id) REFERENCES tunnels(id) ON DELETE CASCADE,
            FOREIGN KEY (system_id) REFERENCES star_systems(id) ON DELETE CASCADE
          );
        `);

        // Migrate existing gates to new structure
        const existingGates = db
          .prepare("SELECT * FROM star_gates")
          .all() as Array<{
          id: string;
          system_id: string;
          destination_system_id: string;
          orbital_elements: string;
          name: string;
        }>;

        // Group gates by system pairs to create tunnels
        const tunnelMap = new Map<
          string,
          { gateA: any; gateB?: any; tunnelId: string }
        >();

        for (const gate of existingGates) {
          const systemA =
            gate.system_id < gate.destination_system_id
              ? gate.system_id
              : gate.destination_system_id;
          const systemB =
            gate.system_id < gate.destination_system_id
              ? gate.destination_system_id
              : gate.system_id;
          const pairKey = `${systemA}:${systemB}`;

          if (!tunnelMap.has(pairKey)) {
            const tunnelId = `tunnel_${systemA}_${systemB}`;
            tunnelMap.set(pairKey, {
              gateA: gate,
              tunnelId,
            });
          } else {
            const tunnel = tunnelMap.get(pairKey)!;
            tunnel.gateB = gate;
          }
        }

        // Insert tunnels and gates
        const insertTunnel = db.prepare(
          "INSERT INTO tunnels (id, system_a_id, system_b_id, powered_by_species_id, created_at) VALUES (?, ?, ?, ?, ?)"
        );
        const insertGate = db.prepare(
          "INSERT INTO star_gates_new (id, tunnel_id, system_id, destination_system_id, orbital_elements, name) VALUES (?, ?, ?, ?, ?, ?)"
        );

        for (const [pairKey, tunnel] of tunnelMap.entries()) {
          const [systemA, systemB] = pairKey.split(":");

          // Create tunnel
          insertTunnel.run(tunnel.tunnelId, systemA, systemB, null, Date.now());

          // Insert gate A
          insertGate.run(
            tunnel.gateA.id,
            tunnel.tunnelId,
            tunnel.gateA.system_id,
            tunnel.gateA.destination_system_id,
            tunnel.gateA.orbital_elements,
            tunnel.gateA.name
          );

          // Insert gate B if it exists
          if (tunnel.gateB) {
            insertGate.run(
              tunnel.gateB.id,
              tunnel.tunnelId,
              tunnel.gateB.system_id,
              tunnel.gateB.destination_system_id,
              tunnel.gateB.orbital_elements,
              tunnel.gateB.name
            );
          }
        }

        // Drop old table and rename new one
        db.exec(`
          DROP TABLE star_gates;
          ALTER TABLE star_gates_new RENAME TO star_gates;
          CREATE INDEX idx_gates_system ON star_gates(system_id);
          CREATE INDEX idx_gates_tunnel ON star_gates(tunnel_id);
        `);
      }

      console.log("Tunnels table and gate migration complete");
    }
  } catch (error) {
    console.error("Error during tunnels migration:", error);
  }

  return db;
}
