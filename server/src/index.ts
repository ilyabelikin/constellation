import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { initializeDatabase } from "./database/schema.js";
import { DatabaseQueries } from "./database/queries.js";
import { GameStateManager } from "./game/state-manager.js";
import { ConstellationWebSocketServer } from "./network/websocket-server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function main() {
  console.log("Starting Constellation Server...");

  // Initialize database
  const dbPath = path.join(__dirname, "..", "data", "constellation.db");
  const db = initializeDatabase(dbPath);
  const queries = new DatabaseQueries(db);

  // Initialize game state manager
  const gameState = new GameStateManager();

  // Start WebSocket server
  new ConstellationWebSocketServer(queries, gameState);

  console.log("Server initialized successfully");
}

main();
