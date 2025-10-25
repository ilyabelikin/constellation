# Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         BROWSER                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    CLIENT                              │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │  │
│  │  │   Three.js   │  │   Network    │  │    HUD     │  │  │
│  │  │    Scene     │  │    Client    │  │  Manager   │  │  │
│  │  │              │  │              │  │            │  │  │
│  │  │ - Rendering  │  │ - WebSocket  │  │ - UI       │  │  │
│  │  │ - Camera     │  │ - Messages   │  │ - Details  │  │  │
│  │  │ - Selection  │  │ - Reconnect  │  │ - Time     │  │  │
│  │  └──────────────┘  └──────────────┘  └────────────┘  │  │
│  │         │                  │                  │        │  │
│  │         └──────────────────┴──────────────────┘        │  │
│  │                       main.ts                          │  │
│  └───────────────────────────────────────────────────────┘  │
│                            │                                 │
└────────────────────────────┼─────────────────────────────────┘
                             │ WebSocket
                             │ (JSON messages)
┌────────────────────────────┼─────────────────────────────────┐
│                         SERVER                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              WebSocket Server                          │  │
│  │  - Connection handling                                 │  │
│  │  - Authentication (UUID)                               │  │
│  │  - Message routing                                     │  │
│  │  - State broadcasting (5 Hz)                           │  │
│  └──────────┬─────────────────┬─────────────┬────────────┘  │
│             │                 │             │                │
│  ┌──────────▼──────┐  ┌──────▼─────────┐  ┌▼────────────┐  │
│  │  Game State     │  │   Database     │  │ Generation  │  │
│  │   Manager       │  │    Queries     │  │   Engine    │  │
│  │                 │  │                │  │             │  │
│  │ - Time sim      │  │ - CRUD ops     │  │ - Galaxies  │  │
│  │ - Position calc │  │ - Persistence  │  │ - Systems   │  │
│  │ - Tick (10 Hz)  │  │ - SQLite       │  │ - Planets   │  │
│  └─────────────────┘  └────────────────┘  └─────────────┘  │
│             │                                      │         │
│  ┌──────────▼──────────────────────────────────────▼──────┐ │
│  │           Orbital Mechanics Engine                     │ │
│  │  - Kepler equation solver                              │ │
│  │  - State vector calculation                            │ │
│  │  - Perturbations                                       │ │
│  │  - Lagrange points                                     │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  constellation  │
                    │     .db         │
                    │   (SQLite)      │
                    └─────────────────┘
```

## Data Flow

### Initial Connection Flow

```
Client                  Server
  │                       │
  ├──WebSocket Connect──>│
  │                       │
  ├──authenticate──────>  │
  │   (UUID)              │
  │                       ├─Check DB
  │                       │
  │<──authenticated─────┤
  │   (UUID, playerId)    │
  │                       │
  ├──joinGalaxy────────>  │
  │   (name)              │
  │                       ├─Load/Create Galaxy
  │                       ├─Create Player
  │                       ├─Generate System
  │                       ├─Create Ship
  │                       │
  │<──playerData────────┤
  │<──systemData────────┤
  │<──shipData──────────┤
  │                       │
  │<──stateUpdate───────┤ (every 200ms)
  │<──stateUpdate───────┤
  │<──stateUpdate───────┤
  │       ...             │
```

### Game Loop Flow

```
Server Side (every 100ms):
┌─────────────────────────────┐
│  Game State Manager Update  │
│                             │
│  1. Update game time        │
│  2. For each loaded system: │
│     - Calculate planet pos  │
│     - Calculate ship pos    │
│     - Apply perturbations   │
│  3. Cache state             │
└─────────────────────────────┘

Server Side (every 200ms):
┌─────────────────────────────┐
│   Broadcast State Update    │
│                             │
│  1. Get all active systems  │
│  2. Serialize state         │
│  3. Send to all clients     │
│     watching that system    │
└─────────────────────────────┘

Client Side (every ~16ms):
┌─────────────────────────────┐
│      Render Loop            │
│                             │
│  1. Update camera position  │
│  2. Render Three.js scene   │
│  3. Update HUD if needed    │
└─────────────────────────────┘
```

## Module Dependencies

### Server Dependencies

```
index.ts
  ├─> database/schema.ts
  ├─> database/queries.ts
  ├─> game/state-manager.ts
  │     └─> physics/orbital.ts
  └─> network/websocket-server.ts
        ├─> database/queries.ts
        ├─> game/state-manager.ts
        └─> generation/galaxy-generator.ts
              └─> generation/system-generator.ts
                    └─> generation/random.ts
```

### Client Dependencies

```
main.ts
  ├─> network/client.ts
  │     └─> @constellation/shared (protocol)
  ├─> rendering/scene.ts
  │     ├─> three
  │     └─> @constellation/shared (types)
  └─> ui/hud.ts
        └─> @constellation/shared (types)
```

## Database Schema

```sql
┌─────────────────┐
│    galaxies     │
├─────────────────┤
│ id (PK)         │
│ name (UNIQUE)   │
│ seed            │
│ created_at      │
└────────┬────────┘
         │
         │ 1:N
         │
┌────────▼────────────┐
│   star_systems      │
├─────────────────────┤
│ id (PK)             │
│ galaxy_id (FK)      │
│ position (x,y,z)    │
│ seed                │
│ generated_data (JSON)│
└────────┬────────────┘
         │
         │ 1:N
         │
┌────────▼────────────┐
│      players        │
├─────────────────────┤
│ id (PK)             │
│ uuid (UNIQUE)       │
│ name                │
│ galaxy_id (FK)      │
│ home_system_id (FK) │
│ current_system_id   │
└────────┬────────────┘
         │
         │ 1:N
         │
┌────────▼────────────┐
│       ships         │
├─────────────────────┤
│ id (PK)             │
│ player_id (FK)      │
│ system_id (FK)      │
│ parent_body_id      │
│ orbital_elements    │
│ delta_v             │
└─────────────────────┘
```

## Message Protocol

### Client → Server

```typescript
type ClientMessage =
  | { type: "authenticate"; uuid: string | null }
  | { type: "setName"; name: string }
  | { type: "joinGalaxy"; galaxyName: string }
  | { type: "createGalaxy"; galaxyName: string }
  | { type: "requestSystemState"; systemId: string }
  | { type: "setTimeScale"; scale: number }
  | { type: "pauseTime" }
  | { type: "resumeTime" }
  | { type: "shipManeuver"; maneuver: ShipManeuverCommand };
```

### Server → Client

```typescript
type ServerMessage =
  | { type: "authenticated"; uuid: string; playerId: string | null }
  | { type: "error"; message: string }
  | { type: "playerData"; player: Player }
  | { type: "systemData"; system: StarSystem }
  | { type: "stateUpdate"; state: SystemState }
  | {
      type: "timeUpdate";
      currentTime: number;
      isPaused: boolean;
      timeScale: number;
    }
  | { type: "shipData"; ship: Ship }
  | { type: "galaxyCreated"; galaxyId: string }
  | { type: "galaxyJoined"; galaxyId: string };
```

## Orbital Mechanics Flow

```
Orbital Elements (stored)
  ├─ semiMajorAxis
  ├─ eccentricity
  ├─ inclination
  ├─ longitudeOfAscendingNode
  ├─ argumentOfPeriapsis
  ├─ meanAnomalyAtEpoch
  └─ epoch
       │
       ▼
┌──────────────────────┐
│ Calculate Mean       │
│ Anomaly at time t    │
│ M = M₀ + n(t - t₀)   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Solve Kepler Eq      │
│ M = E - e·sin(E)     │
│ (Newton-Raphson)     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Calculate True       │
│ Anomaly ν from E     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Calculate r, v       │
│ in orbital plane     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Rotate to 3D space   │
│ using Ω, i, ω        │
└──────────┬───────────┘
           │
           ▼
    Position & Velocity
    (3D vectors)
```

## Scaling and Performance

### Server

- **Memory**: ~50MB base + ~1MB per loaded system
- **CPU**: Low (analytical orbits, no numerical integration)
- **Disk**: SQLite database grows with players/galaxies
- **Network**: ~1-5 KB/s per client (state updates)

### Client

- **Memory**: ~100MB (Three.js + scene)
- **CPU**: GPU-bound (Three.js rendering)
- **Network**: Receive-only, ~1-5 KB/s
- **Storage**: localStorage (UUID only, <1KB)

### Bottlenecks

- Client rendering (many objects)
- Server state serialization (many clients)
- Database writes (ship maneuvers)

### Scalability

- Current: 10-100 concurrent players per server
- Limit: Single system view
- Future: Sharded by galaxy/system

## Security Considerations

### Implemented

- ✅ Authoritative server (no client trust)
- ✅ Input validation (galaxy names, etc.)
- ✅ SQL injection prevention (prepared statements)
- ✅ WebSocket origin checking (implicit)

### Not Implemented

- ❌ Authentication (UUID is not secure)
- ❌ Rate limiting
- ❌ DDoS protection
- ❌ Encryption (wss://)

### Recommendations for Production

1. Add proper authentication (JWT, OAuth)
2. Use HTTPS/WSS
3. Implement rate limiting
4. Add input sanitization
5. Use environment variables for config
6. Add logging and monitoring

## Deployment Architecture

### Development

```
localhost:3030 (Vite dev server)
     │
     └─> ws://localhost:8080 (Node.js server)
              │
              └─> constellation.db
```

### Production

```
nginx (HTTPS)
  ├─> /app/* → Static files (client)
  └─> /ws → WebSocket proxy → Node.js server
                                    │
                                    └─> constellation.db
```

## Testing Strategy

### Unit Tests (TODO)

- Orbital mechanics functions
- Random number generator
- Database queries
- Message serialization

### Integration Tests (TODO)

- Server startup
- Client connection flow
- Galaxy creation
- State updates

### Manual Tests

- Multi-browser testing
- Reconnection testing
- Long-running simulation
- Performance profiling

## Configuration

### Server Config

- `shared/src/constants.ts`:
  - WEBSOCKET_PORT
  - SERVER_TICK_RATE
  - STATE_UPDATE_RATE
  - TIME_SCALE_DEFAULT

### Client Config

- `client/vite.config.ts`:
  - Dev server port
  - Build options

### Database Config

- `server/src/index.ts`:
  - Database path

## Monitoring and Debugging

### Server Logs

- Connection events
- Player join/create
- System generation
- Errors

### Client Logs

- Network messages
- Selected objects
- Errors

### Debug Tools

- Browser DevTools (F12)
- Three.js Inspector
- SQLite browser
- WebSocket inspector

## Future Architecture Changes

### Planned

1. **Redis cache**: For hot system data
2. **Message queue**: For background tasks
3. **Microservices**: Split physics from networking
4. **CDN**: For client assets
5. **Load balancer**: Multiple server instances

### Considerations

- Keep simple architecture as long as possible
- Optimize before scaling
- Profile before refactoring
- Maintain modularity
