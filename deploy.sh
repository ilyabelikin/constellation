#!/bin/bash

# Constellation Deployment Script
# This script deploys the latest version from GitHub to your server

set -e  # Exit on error

# Configuration
SERVER="root@ilyabelikin.tplinkdns.com"
REMOTE_DIR="/root/constellation"
GITHUB_REPO="git@github.com:yourusername/constellation-v2.git"  # Update with your repo URL

echo "🚀 Starting deployment to $SERVER..."

# Deploy to remote server
ssh $SERVER << 'ENDSSH'
set -e

echo "📦 Navigating to project directory..."
cd /root/constellation

echo "⬇️  Pulling latest code from GitHub..."
git pull origin main

echo "📦 Installing dependencies..."
cd /root/constellation/shared
npm install

cd /root/constellation/server
npm install

cd /root/constellation/client
npm install

echo "🔨 Building shared package..."
cd /root/constellation/shared
npm run build

echo "🔨 Building server..."
cd /root/constellation/server
npm run build

echo "🔨 Building client..."
cd /root/constellation/client
npm run build

echo "🔄 Restarting services with PM2..."
pm2 restart constellation-server || pm2 start /root/constellation/server/dist/index.js --name constellation-server
pm2 save

echo "✅ Deployment complete!"
echo "🌐 Your game is live at: http://ilyabelikin.tplinkdns.com"

ENDSSH

echo ""
echo "✨ Deployment finished successfully!"
echo "🌐 Visit: http://ilyabelikin.tplinkdns.com"

