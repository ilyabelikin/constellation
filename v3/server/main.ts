// Entry point: `npm run server` (development) or pm2 (production, see
// ecosystem.config.cjs). Configuration comes from the environment / .env.

import { startServer } from "./index";

const srv = startServer();
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    console.log("Saving sessions and shutting down…");
    srv.shutdown();
    process.exit(0);
  });
