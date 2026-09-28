# Deployment Guide

constell.space serves **v3**: a browser game (static files) plus a small game server for online multiplayer, cloud saves and LLM-voiced rival rulers. Single-player games run entirely in the browser and still work if the game server is down.

## Deploy your changes

```bash
# 1. Push your changes to GitHub
git push origin main

# 2. Deploy to the server
./deploy.sh
```

The game is live at https://constell.space as soon as the script finishes.

---

## What the deploy script does

`deploy.sh` connects to the server over SSH and:

- Pulls the latest `main` from GitHub (fast-forward only)
- Runs `npm ci` in `v3/`
- Builds `v3/` into `v3/dist/`
- Starts or reloads the game server with pm2 (`v3/ecosystem.config.cjs`, process `constellation-v3`, port 8790, SQLite database in `v3/data/`)

Caddy serves `v3/dist/` and proxies the WebSocket (`/ws`) and health check (`/api/health`) to the game server. Running games are saved on shutdown and every 30 seconds, so a reload doesn't lose them.

---

## Server

| | |
| --- | --- |
| Host | `root@5.223.89.26` |
| Project | `/opt/constellation/` (clone of github.com/ilyabelikin/constellation, public, pulled over HTTPS) |
| Website files | `/opt/constellation/v3/dist/` |
| Web server | Caddy; config in `/etc/caddy/Caddyfile` (other sites share this server) |
| TLS | Issued and renewed automatically by Caddy for `constell.space` and `www.constell.space` |
| Node | 22, installed with nvm at `/root/.nvm` |

The Caddy site block:

```
constell.space, www.constell.space {
	encode gzip zstd
	handle /ws {
		reverse_proxy 127.0.0.1:8790
	}
	handle /api/* {
		reverse_proxy 127.0.0.1:8790
	}
	handle {
		root * /opt/constellation/v3/dist
		try_files {path} /index.html
		file_server
	}
}
```

## LLM rivals (OpenRouter key)

Rival rulers talk and plan with a language model through OpenRouter (default model `z-ai/glm-5.3-flash`). The key stays on the server: browsers never see it, and single-player games send their (knowledge-limited) questions through the game server, which rate-limits them per player.

Put the key in `/opt/constellation/v3/.env` (created empty by `deploy.sh`, mode 600, never committed):

```bash
ssh root@5.223.89.26
cd /opt/constellation/v3
nano .env            # OPENROUTER_API_KEY=sk-or-...   (see .env.example for other options)
pm2 reload constellation-v3 --update-env
curl -s localhost:8790/health   # "llm": true
```

Without a key the game works as before, with rule-based rivals and no AI diplomacy chat. Optional settings: `LLM_MODEL`, `LLM_BASE_URL`, `LLM_MAX_CALLS_PER_HOUR` (global safety cap, default 2000).

---

## Useful commands

Check that the site and the game server respond:

```bash
curl -sI https://constell.space
curl -s https://constell.space/api/health
```

Game server logs and status:

```bash
ssh root@5.223.89.26 "pm2 logs constellation-v3 --lines 100"
ssh root@5.223.89.26 "pm2 status"
```

Validate and reload Caddy after editing its config:

```bash
ssh root@5.223.89.26 "caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy"
```

View Caddy logs:

```bash
ssh root@5.223.89.26 "journalctl -u caddy -f"
```

---

## First-time setup on a new server

1. Install Node 22 (nvm) and Caddy, and point DNS for `constell.space` and `www.constell.space` at the server.
2. Clone the repo: `git clone https://github.com/ilyabelikin/constellation.git /opt/constellation`
3. Add the Caddy site block above and reload Caddy.
4. Update `SERVER` in `deploy.sh`, then run `./deploy.sh`.
5. Add the OpenRouter key to `v3/.env` (see above) and run `pm2 startup` once so the game server survives reboots.

---

## v2 (retired)

The v2 multiplayer game (`client/`, `server/`, `shared/`) is no longer served. Its code and last database (`/opt/constellation/server/data/constellation.db`) remain on the server. Running it again would need the pm2 process (`ecosystem.config.js`) and a Caddy block that proxies WebSocket upgrades to port 8080. The v2 server's `better-sqlite3` compiles from source on Node 22, so the server needs `build-essential`, which is already installed.
