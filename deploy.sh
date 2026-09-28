#!/bin/bash

# Constellation Deployment Script
# Deploys the latest v3 from GitHub to the server.
# v3 is a static browser game: Caddy serves $REMOTE_DIR/v3/dist directly.
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

echo "✅ Deployment complete!"
ENDSSH

echo ""
echo "✨ Deployment finished successfully!"
echo "🌐 Visit: https://constell.space"
