import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { initializeDatabase } from "./database/schema.js";
import { DatabaseQueries } from "./database/queries.js";
import { GameStateManager } from "./game/state-manager.js";
import { ConstellationWebSocketServer } from "./network/websocket-server.js";
import { memoryMonitor } from "./utils/memory-monitor.js";

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
  const wsServer = new ConstellationWebSocketServer(queries, gameState);

  // Start memory monitoring (every 10 seconds)
  console.log("\n=== Starting Memory Monitor ===");
  console.log("Memory snapshots will be taken every 10 seconds");
  console.log("Run memory analysis every 60 seconds\n");
  
  // Start basic monitoring
  memoryMonitor.start(10000);

  // Enhanced monitoring with application metrics
  setInterval(() => {
    const wsMetrics = wsServer.getMetrics();
    const gameMetrics = gameState.getMetrics();
    
    memoryMonitor.takeSnapshot({
      clientsCount: wsMetrics.clientsCount,
      systemsCount: gameMetrics.systemsCount,
      galaxiesCount: gameMetrics.galaxiesCount,
      intervalsCount: 3, // We have 3 intervals: state updates, time save, galaxy cleanup
      customMetrics: {
        activePlayersCount: wsMetrics.activePlayersCount,
        totalShips: gameMetrics.totalShips,
        shipsMapSize: gameMetrics.shipsCount,
      },
    });
  }, 10000);

  // Periodic memory analysis
  setInterval(() => {
    memoryMonitor.analyzeGrowth();
  }, 60000);

  console.log("Server initialized successfully");
  console.log("Memory monitoring active - check logs for memory snapshots\n");
}

main();
