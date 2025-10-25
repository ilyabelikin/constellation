# Setup Instructions

## Prerequisites

- Node.js 18+ and npm
- A modern web browser (Chrome, Firefox, Safari, Edge)

## Initial Setup

### 1. Install Dependencies

From the root directory:

```bash
npm install
```

This will install dependencies for all packages (root, shared, server, client).

### 2. Build Shared Package

The shared package must be built first as both server and client depend on it:

```bash
cd shared
npm run build
cd ..
```

### 3. Create Data Directory

Create a directory for the server database:

```bash
mkdir -p server/data
```

## Running in Development Mode

### Option 1: Run Server and Client Separately (Recommended)

**Terminal 1 - Server:**

```bash
cd server
npm run dev
```

The server will start on `ws://localhost:8080`

**Terminal 2 - Client:**

```bash
cd client
npm run dev
```

The client will be available at `http://localhost:3030`

### Option 2: Run Both with Concurrently

From the root directory:

```bash
npm run dev
```

This runs both server and client simultaneously.

## First Time Usage

1. Open your browser to `http://localhost:3030`
2. You'll see a galaxy selection screen
3. Enter a galaxy name (e.g., "Andromeda") or leave empty for "the Milky Way"
4. Click "Explore" - the game will automatically join if it exists or create if it doesn't
5. The game will generate a procedural star system for you
6. You'll start with a ship in orbit around the star

## Troubleshooting

### "Cannot find module '@constellation/shared'"

Make sure you've built the shared package:

```bash
cd shared && npm run build && cd ..
```

### "Database is locked" or similar errors

Stop the server (Ctrl+C) and delete the database file:

```bash
rm server/data/constellation.db
```

Then restart the server. This will create a fresh database.

### WebSocket connection fails

Make sure the server is running on port 8080:

```bash
cd server
npm run dev
```

Check the server console for any error messages.

### Client shows blank screen

1. Check the browser console (F12) for errors
2. Make sure the client can connect to `ws://localhost:8080`
3. Try refreshing the page
4. Clear localStorage: Open browser console and run `localStorage.clear()`

## Production Build

### Build All Packages

```bash
npm run build
```

This builds:

- `shared/dist` - Compiled shared types
- `server/dist` - Compiled server code
- `client/dist` - Production client bundle

### Run Production Server

```bash
cd server
node dist/index.js
```

### Serve Production Client

Use any static file server:

```bash
cd client/dist
npx serve
```

Or use nginx, Apache, etc.

## Development Tips

### Hot Reload

- **Server**: Changes are automatically reloaded with `tsx watch`
- **Client**: Changes trigger hot module replacement with Vite

### Debugging

**Server:**

- Use `console.log()` statements
- Check terminal output
- Database is in `server/data/constellation.db` - use any SQLite viewer

**Client:**

- Use browser DevTools (F12)
- Check console for errors
- Use Three.js Inspector browser extension
- Network tab to see WebSocket messages

### Resetting the Game

To start fresh:

```bash
rm server/data/constellation.db
```

Then restart the server. All galaxies and players will be reset.

## Common Issues

### Port Already in Use

If port 8080 or 3030 is already in use, you can change them:

**Server port** - Edit `shared/src/constants.ts`:

```typescript
export const WEBSOCKET_PORT = 8081; // Change this
```

**Client port** - Edit `client/vite.config.ts`:

```typescript
server: {
  port: 3031, // Change this
}
```

Don't forget to update the WebSocket URL in the client if you change the server port.

### Performance Issues

If the visualization is slow:

1. Reduce the number of stars in the starfield (`client/src/rendering/scene.ts`, line 62)
2. Reduce orbit line segments (`client/src/rendering/scene.ts`, line 126)
3. Lower the state update rate in `shared/src/constants.ts`

## Next Steps

Once everything is running:

1. Read the [README.md](README.md) for feature overview
2. Check [TODO.md](TODO.md) for upcoming features
3. Explore the codebase - it's well-organized and documented
4. Start experimenting with ship controls (coming soon!)

Have fun exploring the cosmos! 🚀
