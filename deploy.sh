#!/bin/bash

# Constellation Deployment Script
# Deploys the latest v3 from GitHub to the server.
# Caddy serves $REMOTE_DIR/v3/dist and proxies /ws and /api to the v3 game
# server (pm2 process "constellation-v3" on 127.0.0.1:8790).
#
# Usage:
#   ./deploy.sh

set -e  # Exit on error

# Configuration
SERVER="root@5.223.89.26"
REMOTE_DIR="/opt/constellation"

echo "🚀 Starting deployment to $SERVER..."

ssh $SERVER "bash -s" << ENDSSH
set -e
export NVM_DIR=/root/.nvm
. \$NVM_DIR/nvm.sh

cd $REMOTE_DIR

echo "⬇️  Pulling latest code from GitHub..."
git pull --ff-only origin main

echo "📦 Installing dependencies..."
cd $REMOTE_DIR/v3
npm ci --no-audit --no-fund

echo "🔨 Building v3..."
npm run build

echo "🛰  (Re)starting the game server..."
mkdir -p data
# Secrets (OPENROUTER_API_KEY) live in v3/.env on the server only.
[ -f .env ] || { touch .env; chmod 600 .env; }
command -v pm2 >/dev/null || npm install -g pm2
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

echo "✅ Deployment complete!"
ENDSSH

echo ""
echo "✨ Deployment finished successfully!"
echo "🌐 Visit: https://constell.space"
