import { defineConfig } from "@playwright/test";

const SERVER_PORT = 8797;

export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    viewport: { width: 1400, height: 860 },
    launchOptions: {
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    },
  },
  webServer: [
    {
      // Game server with a throwaway in-memory database and a mock LLM.
      command: `npx tsx server/index.ts`,
      url: `http://127.0.0.1:${SERVER_PORT}/health`,
      env: { PORT: String(SERVER_PORT), DB_PATH: ":memory:", LLM_MOCK: "1" },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npx vite --port 5173 --strictPort",
      url: "http://localhost:5173",
      env: { GAME_SERVER: `http://127.0.0.1:${SERVER_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
