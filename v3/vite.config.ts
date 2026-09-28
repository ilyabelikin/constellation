import { defineConfig } from "vitest/config";

const GAME_SERVER = process.env.GAME_SERVER ?? "http://127.0.0.1:8787";

export default defineConfig({
  base: "./",
  server: {
    port: 5173,
    // In development the game server (npm run server) runs separately.
    proxy: { "/ws": { target: GAME_SERVER, ws: true }, "/api": { target: GAME_SERVER } },
  },
  build: { target: "es2022", chunkSizeWarningLimit: 1200 },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
