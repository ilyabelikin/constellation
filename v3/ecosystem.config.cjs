// pm2 process for the v3 game server (multiplayer, cloud saves, LLM rivals).
// Secrets such as OPENROUTER_API_KEY go in v3/.env on the server (never in git).
module.exports = {
  apps: [
    {
      name: "constellation-v3",
      cwd: __dirname,
      script: "server/main.ts",
      interpreter: "node",
      // --experimental-sqlite: node:sqlite is behind a flag before Node 22.13 (the
      // server runs 22.12); newer Node accepts the flag as a no-op.
      // The .env path is absolute because Node resolves it before pm2's cwd applies.
      interpreter_args: `--experimental-sqlite --env-file=${__dirname}/.env --import tsx`,
      // Fork mode: cluster mode drops the interpreter flags above and crash-loops.
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "1G",
      kill_timeout: 10000,
      env: {
        NODE_ENV: "production",
        PORT: "8790", // 8787 is taken by another service on the server
        DB_PATH: "./data/constellation.db",
      },
      time: true,
    },
  ],
};
