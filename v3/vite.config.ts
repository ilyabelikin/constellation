import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  server: { port: 5173 },
  build: { target: "es2022", chunkSizeWarningLimit: 1200 },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
