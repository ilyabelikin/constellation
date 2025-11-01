# Deployment Guide

This guide explains how to deploy your Constellation game to your server.

## First Time Setup

### 1. Update GitHub Repository URL

Edit `deploy.sh` and replace this line with your actual GitHub repository:
```bash
GITHUB_REPO="git@github.com:yourusername/constellation-v2.git"
```

### 2. Make Sure Your Code is on GitHub

```bash
# Add all your changes
git add .

# Commit your changes
git commit -m "Ready for deployment"

# Push to GitHub
git push origin main
```

### 3. Run Initial Setup

This only needs to be done **once**:

```bash
./initial-setup.sh
```

This will:
- Install PM2 for process management
- Build all packages (shared, server, client)
- Start the server with PM2
- Configure PM2 to auto-start on server reboot
- Reload Caddy to serve production files

## Regular Deployments

After you've made changes and want to deploy:

### 1. Commit and Push Your Changes to GitHub

```bash
git add .
git commit -m "Description of your changes"
git push origin main
```

### 2. Deploy to Server

Simply run:

```bash
./deploy.sh
```

That's it! The script will:
- SSH into your server
- Pull the latest code from GitHub
- Install any new dependencies
- Build everything
- Restart the server
- Your changes are live!

## What's Running on the Server

### Services

1. **PM2** - Manages the Node.js game server
   - Auto-restarts if it crashes
   - Starts automatically on server reboot
   - Logs all server activity

2. **Caddy** - Web server and reverse proxy
   - Serves your game client files
   - Proxies WebSocket connections to the game server
   - Could enable HTTPS automatically (currently using HTTP)

### Useful Commands

Connect to your server:
```bash
ssh root@ilyabelikin.tplinkdns.com
```

Once connected, you can:

```bash
# Check server status
pm2 status

# View server logs
pm2 logs constellation-server

# Restart server manually
pm2 restart constellation-server

# Stop server
pm2 stop constellation-server

# Check Caddy status
systemctl status caddy

# View Caddy logs
journalctl -u caddy -f
```

## Troubleshooting

### Server won't start after deployment

```bash
ssh root@ilyabelikin.tplinkdns.com
pm2 logs constellation-server
```

Look for error messages in the logs.

### Website not loading

1. Check if Caddy is running:
   ```bash
   ssh root@ilyabelikin.tplinkdns.com
   systemctl status caddy
   ```

2. Check if files were built:
   ```bash
   ssh root@ilyabelikin.tplinkdns.com
   ls -la /root/constellation/client/dist/
   ```

### WebSocket connection failing

1. Check if the server is running:
   ```bash
   ssh root@ilyabelikin.tplinkdns.com
   pm2 status
   ```

2. Check server logs:
   ```bash
   ssh root@ilyabelikin.tplinkdns.com
   pm2 logs constellation-server
   ```

## File Locations on Server

- **Project:** `/root/constellation/`
- **Client build:** `/root/constellation/client/dist/`
- **Server build:** `/root/constellation/server/dist/`
- **Logs:** `/root/constellation/logs/`
- **Caddy config:** `/etc/caddy/Caddyfile`
- **Database:** `/root/constellation/server/data/constellation.db`

## Backup Your Database

Before major updates, backup your game database:

```bash
ssh root@ilyabelikin.tplinkdns.com
cp /root/constellation/server/data/constellation.db /root/constellation/server/data/constellation.db.backup-$(date +%Y%m%d)
```

## Development vs Production

- **Development (local):** Run `npm run dev` - hot reload, fast development
- **Production (server):** Built files served by Caddy, PM2 manages the server

When you run `./deploy.sh`, it automatically builds for production and deploys.

