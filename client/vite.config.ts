import { defineConfig } from "vite";

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
});
