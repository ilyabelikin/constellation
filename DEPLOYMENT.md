# Deployment Guide

constell.space serves **v3**, a static browser game (no game server; saves live in the player's `localStorage`).

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

Caddy serves `v3/dist/` directly, so nothing needs restarting.

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
	root * /opt/constellation/v3/dist
	try_files {path} /index.html
	file_server
}
```

---

## Useful commands

Check that the site responds:

```bash
curl -sI https://constell.space
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

---

## v2 (retired)

The v2 multiplayer game (`client/`, `server/`, `shared/`) is no longer served. Its code and last database (`/opt/constellation/server/data/constellation.db`) remain on the server. Running it again would need the pm2 process (`ecosystem.config.js`) and a Caddy block that proxies WebSocket upgrades to port 8080. The v2 server's `better-sqlite3` compiles from source on Node 22, so the server needs `build-essential`, which is already installed.
