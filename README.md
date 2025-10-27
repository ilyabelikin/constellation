# Constellation v2

A multiplayer space exploration game with realistic orbital mechanics, procedural galaxy generation, and real-time physics simulation.

## Features

- **Realistic Orbital Mechanics**: Keplerian orbits with perturbations and Lagrange points
- **Procedural Generation**: Unique star systems with realistic stellar and planetary parameters
- **Dynamic UI Theming**: UI colors adapt to match the current star system's star color for enhanced visual feedback
- **Multiplayer**: Authoritative server architecture with WebSocket communication
- **Real-time Simulation**: Pauseable time with adjustable speed
- **3D Visualization**: Beautiful Three.js/WebGL rendering
- **Player Ships**: Control ships with realistic orbital mechanics

## Architecture

### Server (`/server`)

- **Node.js + TypeScript**: Authoritative game server
- **SQLite**: Persistent storage for galaxies, systems, players, and ships
- **WebSocket**: Real-time multiplayer communication
- **Physics Engine**: Kepler orbital mechanics with N-body perturbations

### Client (`/client`)

- **Three.js/WebGL**: 3D visualization of star systems
- **TypeScript**: Type-safe client code
- **Vite**: Fast development and optimized builds
- **HUD**: Navigation, time controls, and object details

### Shared (`/shared`)

- **Common Types**: Shared TypeScript interfaces and types
- **Constants**: Physical and game constants
- **Protocol**: WebSocket message definitions

## Installation

```bash
# Install dependencies
npm install

# Build shared package
cd shared && npm run build && cd ..
```

## Running

### Development Mode

```bash
# Start both server and client (in separate terminals)
npm run dev:server  # Terminal 1: Starts server on port 8080
npm run dev:client  # Terminal 2: Starts client on port 3030

# Or use concurrently (if installed)
npm run dev
```

### Production Build

```bash
# Build all packages
npm run build

# Start server
cd server && npm start

# Serve client (use any static file server)
cd client && npx serve dist
```

## Usage

1. Open the client in your browser (http://localhost:3030)
2. Enter a galaxy name (or leave empty to use "the Milky Way")
3. Click "Explore" (automatically joins existing galaxies or creates new ones)
4. Explore the star system!

### Controls

- **Click**: Select objects (stars, planets, ships)
- **Mouse Wheel**: Zoom in/out
- **HUD Navigation**:
  - Home: Jump to your home system
  - System: Current system view
  - Constellation: (Future feature)
- **Time Controls**: Play/Pause and view current game time

## Technical Details

### Orbital Mechanics

- Uses Keplerian orbital elements (semi-major axis, eccentricity, inclination, etc.)
- Solves Kepler's equation using Newton-Raphson method
- Calculates N-body perturbations
- Computes Lagrange points (L1-L5)

### Physics Constants

- Gravitational constant: 6.67430e-11 m³/(kg·s²)
- All calculations in SI units (meters, kilograms, seconds)
- Display units converted to AU, Earth masses, etc. for readability

### Procedural Generation

- Seeded random number generator for reproducibility
- Realistic stellar classifications (M, K, G, F, A) with authentic colors:
  - M-type (Red dwarfs): Red tinted UI
  - K-type (Orange dwarfs): Orange tinted UI
  - G-type (Yellow dwarfs like our Sun): Yellow tinted UI
  - F-type (Yellow-white): Bright yellowish-white UI
  - A-type (White-blue): Cool blue-white UI
- Planetary types (rocky, super-earth, gas giant, ice giant)
- Stable orbital spacing using modified Titius-Bode law

### UI Theming

The user interface dynamically adapts to the color of the current star system:
- HUD panels, borders, and text colors shift to match the star's color
- Smooth CSS transitions create an immersive experience
- The initial galaxy selection screen maintains the classic green theme
- Provides immediate visual feedback about which star system you're currently in

### Multiplayer

- UUID-based authentication (stored in localStorage)
- Authoritative server prevents cheating
- State updates broadcast at 5 Hz
- Server simulation at 10 Hz

## Project Structure

```
constellation-v2/
├── shared/              # Shared types and constants
│   └── src/
│       ├── types.ts
│       ├── constants.ts
│       └── protocol.ts
├── server/              # Game server
│   └── src/
│       ├── database/    # SQLite schema and queries
│       ├── generation/  # Procedural generation
│       ├── physics/     # Orbital mechanics
│       ├── network/     # WebSocket server
│       ├── game/        # Game state manager
│       └── index.ts
└── client/              # Web client
    └── src/
        ├── network/     # WebSocket client
        ├── rendering/   # Three.js scene
        ├── ui/          # HUD manager
        └── main.ts
```

## Future Development

See [TODO.md](TODO.md) for detailed task list.

Planned features:

- Constellation view with multiple star systems
- Inter-system travel
- Advanced ship controls with maneuver planning
- Enhanced graphics and effects
- Performance optimizations
- More realistic physics (full N-body integration)

## License

MIT License - See LICENSE file for details

## Contributing

This is a long-term project designed with modularity in mind. Contributions are welcome!

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Credits

Built with:

- [Node.js](https://nodejs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [Three.js](https://threejs.org/)
- [SQLite](https://www.sqlite.org/)
- [WebSocket (ws)](https://github.com/websockets/ws)
