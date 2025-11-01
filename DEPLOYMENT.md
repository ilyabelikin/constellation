# Deployment Guide

## Quick Start - Deploy Your Changes

Every time you want to deploy updates:

```bash
# 1. Commit your changes to git
git add .
git commit -m "Description of your changes"
git push origin main

# 2. Deploy to server
./deploy.sh
```

**That's it!** Your game will be live at http://ilyabelikin.tplinkdns.com in 1-2 minutes.

---

## What the Deploy Script Does

The `deploy.sh` script automatically:

- ✅ Pulls latest code from GitHub
- ✅ Installs any new dependencies
- ✅ Builds all packages (shared, server, client)
- ✅ Restarts the game server
- ✅ Fixes file permissions

No manual steps needed!

---

## First Time Setup (Already Done!)

The initial setup has been completed. You can skip this section unless you're setting up a new server.

If needed, run once:

```bash
./initial-setup.sh
```

---

## Useful Commands

### Check Server Status

```bash
ssh root@ilyabelikin.tplinkdns.com "pm2 status"
```

### View Server Logs

```bash
ssh root@ilyabelikin.tplinkdns.com "pm2 logs constellation-server"
```

### Restart Server Manually

```bash
ssh root@ilyabelikin.tplinkdns.com "pm2 restart constellation-server"
```

### View Caddy Logs (Web Server)

```bash
ssh root@ilyabelikin.tplinkdns.com "journalctl -u caddy -f"
```

---

## What's Running on Your Server

### Services

1. **PM2** - Process Manager

   - Keeps the game server running
   - Auto-restarts if it crashes
   - Starts automatically on server reboot
   - Logs all activity

2. **Caddy** - Web Server
   - Serves your game's website
   - Proxies WebSocket connections to the game server
   - Runs on port 80

### File Locations

- **Project:** `/root/constellation/`
- **Website Files:** `/root/constellation/client/dist/`
- **Server Code:** `/root/constellation/server/dist/`
- **Logs:** `/root/constellation/logs/`
- **Database:** `/root/constellation/server/data/constellation.db`
- **Caddy Config:** `/etc/caddy/Caddyfile`

---

## Troubleshooting

### Problem: "Failed to connect to server"

**Check if server is running:**

```bash
ssh root@ilyabelikin.tplinkdns.com "pm2 status"
```

If status shows "errored" or "stopped":

```bash
ssh root@ilyabelikin.tplinkdns.com "pm2 logs constellation-server"
```

Look for error messages and fix the code issue.

**Restart the server:**

```bash
ssh root@ilyabelikin.tplinkdns.com "pm2 restart constellation-server"
```

### Problem: Website not loading

**Check if Caddy is running:**

```bash
ssh root@ilyabelikin.tplinkdns.com "systemctl status caddy"
```

**Check if files were built:**

```bash
ssh root@ilyabelikin.tplinkdns.com "ls -la /root/constellation/client/dist/"
```

### Problem: Deploy script fails

1. Make sure your changes are pushed to GitHub
2. Check that you have SSH access to the server
3. Look at the error message - it will tell you what went wrong

---

## Backup Your Database

Before major updates, backup your game data:

```bash
ssh root@ilyabelikin.tplinkdns.com \
  "cp /root/constellation/server/data/constellation.db \
   /root/constellation/server/data/constellation.db.backup-\$(date +%Y%m%d-%H%M)"
```

---

## Development vs Production

- **Local Development:** Run `npm run dev` in separate terminals for client and server
  - Hot reload for fast development
  - Changes appear instantly
- **Production (Server):** Optimized builds served by Caddy and PM2
  - Faster, more stable
  - No dev tools
  - Must deploy to see changes

---

## Need Help?

- Server logs: `ssh root@ilyabelikin.tplinkdns.com "pm2 logs"`
- Web server logs: `ssh root@ilyabelikin.tplinkdns.com "journalctl -u caddy"`
- Check if ports are open: `ssh root@ilyabelikin.tplinkdns.com "netstat -tuln | grep -E '80|8080'"`

Your game URL: **http://ilyabelikin.tplinkdns.com**
