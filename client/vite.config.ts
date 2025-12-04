import { defineConfig } from "vite";
import { copyFileSync } from "fs";

export default defineConfig({
  server: {
    port: 3030,
    host: "0.0.0.0",
    allowedHosts: [
      "ilyabelikin.tplinkdns.com",
      ".tplinkdns.com",
    ],
  },
  build: {
    target: "es2022",
  },
  plugins: [
    {
      name: "copy-changelog",
      closeBundle() {
        copyFileSync("CHANGELOG.md", "dist/CHANGELOG.md");
      },
    },
  ],
});
