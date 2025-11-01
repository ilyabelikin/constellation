#!/bin/bash

# Initial Setup Script for Constellation Server
# Run this ONCE to set up the production environment

set -e

SERVER="root@ilyabelikin.tplinkdns.com"

echo "🔧 Setting up production environment on $SERVER..."

ssh $SERVER << 'ENDSSH'
set -e

echo "📦 Installing PM2 globally (if not installed)..."
npm install -g pm2 || true

echo "📁 Creating logs directory..."
mkdir -p /root/constellation/logs

echo "🔨 Building everything for the first time..."
cd /root/constellation

# Build shared
cd shared
npm install
npm run build

# Build server
cd ../server
npm install
npm run build

# Build client
cd ../client
npm install
npm run build

echo "🔐 Fixing permissions for Caddy..."
chmod -R 755 /root/constellation/client/dist
chmod 755 /root/constellation/client
chmod 755 /root/constellation
chmod 755 /root

echo "🚀 Starting server with PM2..."
cd /root/constellation
pm2 start ecosystem.config.js
pm2 save
pm2 startup

echo "🔄 Reloading Caddy..."
systemctl reload caddy

echo "✅ Initial setup complete!"
echo "🌐 Your game should be live at: http://ilyabelikin.tplinkdns.com"

ENDSSH

echo ""
echo "✨ Setup complete! Now you can use ./deploy.sh for future deployments."

