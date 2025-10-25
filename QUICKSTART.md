# Quick Start Guide

Get up and running in 5 minutes!

## Installation

```bash
# 1. Install all dependencies
npm install

# 2. Build the shared package
cd shared && npm run build && cd ..

# 3. Create database directory
mkdir -p server/data
```

## Run the Game

**Terminal 1 - Start Server:**

```bash
cd server
npm run dev
```

**Terminal 2 - Start Client:**

```bash
cd client
npm run dev
```

## Play

1. Open http://localhost:3030 in your browser
2. Enter a galaxy name (or leave empty for "the Milky Way")
3. Click "Explore"
4. The game will join the galaxy if it exists, or create it if it doesn't!
5. Explore your procedurally generated star system!

## Controls

- **Click** objects to select them
- **Mouse wheel** to zoom
- **Play/Pause** to control time
- **Home** button returns to your home system

## What You'll See

- A central star (color depends on stellar class)
- 3-8 orbiting planets with realistic orbital paths
- Your ship (small cyan cone) in orbit
- Details panel (bottom-left) showing object properties
- Time display (top-right) showing game time

## Troubleshooting

**Can't connect to server?**

- Make sure both terminals are running
- Check that server shows "WebSocket server started on port 8080"

**Blank screen?**

- Open browser console (F12) and check for errors
- Try refreshing the page

**Still having issues?**

- See [SETUP.md](SETUP.md) for detailed troubleshooting

---

That's it! You're now running your own multiplayer space exploration game with realistic orbital mechanics. Check out [README.md](README.md) and [TODO.md](TODO.md) for more information about features and future development.
