#!/bin/bash

# Constellation Deployment Script
# This script deploys the latest version from GitHub to your server
#
# Usage:
#   ./deploy.sh          - Normal deployment
#   ./deploy.sh --reset  - Deploy and reset database (creates backup first)

set -e  # Exit on error

# Configuration
SERVER="root@ilyabelikin.tplinkdns.com"
REMOTE_DIR="/root/constellation"
GITHUB_REPO="git@github.com:yourusername/constellation-v2.git"  # Update with your repo URL

# Parse command line arguments
RESET_DB=false
if [[ "$1" == "--reset" ]]; then
  RESET_DB=true
  echo "⚠️  WARNING: Database will be reset (backed up first)"
  echo "Press Ctrl+C within 3 seconds to cancel..."
  sleep 3
fi

echo "🚀 Starting deployment to $SERVER..."

# Deploy to remote server
ssh $SERVER "bash -s" << ENDSSH
set -e
export RESET_DB="$RESET_DB"

echo "📦 Navigating to project directory..."
cd /root/constellation

echo "⬇️  Pulling latest code from GitHub..."
git pull origin main

echo "🧹 Cleaning up old dependencies..."
cd /root/constellation
rm -rf node_modules shared/node_modules server/node_modules client/node_modules
rm -f package-lock.json shared/package-lock.json server/package-lock.json client/package-lock.json

echo "📦 Installing dependencies..."
npm install

echo "🔨 Building all packages..."
cd /root/constellation
npm run build

echo "🔐 Fixing permissions for Caddy..."
chmod -R 755 /root/constellation/client/dist
chmod 755 /root/constellation/client
chmod 755 /root/constellation
chmod 755 /root

# Reset database if flag was set
if [[ "$RESET_DB" == "true" ]]; then
  echo "💾 Creating database backup..."
  BACKUP_FILE="/root/constellation/server/data/constellation.db.backup-\$(date +%Y%m%d-%H%M%S)"
  if [ -f "/root/constellation/server/data/constellation.db" ]; then
    cp /root/constellation/server/data/constellation.db "\$BACKUP_FILE"
    echo "✅ Backup created: \$BACKUP_FILE"
    
    echo "🗑️  Deleting database..."
    rm -f /root/constellation/server/data/constellation.db
    echo "✅ Database deleted - will be regenerated on server start"
  else
    echo "ℹ️  No existing database found, skipping backup"
  fi
fi

echo "🔄 Restarting services with PM2..."
pm2 restart constellation-server || pm2 start /root/constellation/server/dist/index.js --name constellation-server
pm2 save

echo "✅ Deployment complete!"
if [[ "\$RESET_DB" == "true" ]]; then
  echo "🔄 Database was reset - new galaxy will be generated on first connect"
fi
echo "🌐 Your game is live at: https://constell.space"

ENDSSH

echo ""
echo "✨ Deployment finished successfully!"
if [[ "$RESET_DB" == "true" ]]; then
  echo "🔄 Database was reset - new galaxy will be generated"
fi
echo "🌐 Visit: https://constell.space"

