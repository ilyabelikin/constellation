import { defineConfig } from "vite";
import { copyFileSync } from "fs";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  server: {
    port: 3030,
    host: "0.0.0.0",
    allowedHosts: [
      "ilyabelikin.tplinkdns.com",
      ".tplinkdns.com",
    ],
  },
  resolve: {
    alias: {
      lucide: fileURLToPath(
        new URL(
          "../node_modules/lucide/dist/esm/lucide/src/lucide.js",
          import.meta.url
        )
      ),
    },
  },
  build: {
    target: "es2022",
  },
  plugins: [
    {
      name: "copy-changelog",
      closeBundle() {
        copyFileSync("./CHANGELOG.md", "dist/CHANGELOG.md");
      },
    },
  ],
});
