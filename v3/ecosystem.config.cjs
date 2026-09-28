// pm2 process for the v3 game server (multiplayer, cloud saves, LLM rivals).
// Secrets such as OPENROUTER_API_KEY go in v3/.env on the server (never in git).
module.exports = {
  apps: [
    {
      name: "constellation-v3",
      cwd: __dirname,
      script: "server/main.ts",
      interpreter: "node",
      interpreter_args: "--env-file=.env --import tsx",
      instances: 1,
      autorestart: true,
      max_memory_restart: "1G",
      kill_timeout: 10000,
      env: {
        NODE_ENV: "production",
        PORT: "8787",
        DB_PATH: "./data/constellation.db",
      },
      time: true,
    },
  ],
};
