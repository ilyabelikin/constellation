# Constellation v3

A real-time 3D grand strategy game of stars, tunnels, fleets and empires, running entirely in the browser.

Pick a species, grow your homeworld into an interstellar power, and chart a galaxy of procedurally generated star systems linked by ancient tunnels. You win by **Conquest**, by **Hegemony** (control 60% of all systems), or by completing the **Ascension Project**. Rival AI empires and the Void Raiders pirates are chasing the same goals.

![Home system](docs/screenshots/home.png)

| Fleet battle | Galaxy map | Black hole |
| --- | --- | --- |
| ![Battle](docs/screenshots/battle.png) | ![Galaxy](docs/screenshots/galaxy.png) | ![Black hole](docs/screenshots/black-hole.png) |

## Quick start

```bash
cd v3
npm install
npm run dev          # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server (proxies `/ws` to the game server) |
| `npm run server` | Start the game server on :8787 (online play, cloud saves, LLM rivals); reads `.env` |
| `npm run build` | Typecheck and build a static bundle into `dist/` (host it anywhere) |
| `npm test` | Run the simulation unit tests (Vitest) |
| `npm run test:e2e` | Run the browser end-to-end tests (Playwright + Chromium) |
| `npm run typecheck` | Run a strict TypeScript check |

## What's new compared to v2

| | v2 | v3 |
| --- | --- | --- |
| Graphics | Flat shading, no post-processing | HDR bloom and ACES tone mapping. Per-pixel procedural planets with clouds, atmospheres, city lights, lava cracks and gas bands. Animated star photospheres and coronas. Environment-lit metal hulls. |
| Stars | M–O main sequence, giants | 13 types: red/orange/yellow dwarfs, F and A stars, blue giants and supergiants, red giants, white and brown dwarfs, **pulsars** with sweeping beams, **black holes** with accretion disks, **T Tauri protostars** in dusty nebulae. Also binaries. |
| Planets | 13 types | 16 types (terran, ocean, jungle, savanna, desert, tundra, arctic, toxic, lava, barren, rust, crystalline, ice dwarf, gas giant, hot Jupiter, ice giant). Also moons (including habitable ones), ring systems, comets with tails, and 5 asteroid belt types. |
| Ships | A single unused ship record; combat was a dice roll | 10 procedural hard-sci-fi hulls with radiators, trusses, tanks and engine bells. You build them at shipyards, group them into fleets, and order them around a system or through tunnels. |
| Combat | Instant server-side roll | Real-time battles when hostile fleets meet. Lasers, railguns, missiles, point defence and particle lances each have strengths against shields and armour. Also planetary sieges and troop invasions. |
| Economy | Energy "pool" with no real income, and a colony-output cliff at 100M pop | Four stockpiles plus research, all as real per-day flows with upkeep. Buildings need workers. Automated orbital stations. Administration costs curb sprawl. Fleet command capacity. 42-tech research tree. Megastructures. |
| Opponents | Other human players only | Utility AI empires with personalities that expand, research, go to war and make peace. Void Raiders get stronger over time and raid weak colonies. |

## How to play

The in-game **How to play** screen (`?`) is the reference. Controls:

| Input | Action |
| --- | --- |
| Left-click | Select a planet, star, fleet, gate or system |
| Right-click | Order the active fleet: move, colonize, invade, attack, jump through a gate or travel to a system |
| `Shift` + right-click / button | Queue the order after the fleet's current ones (e.g. a busy constructor's next stations) |
| Left-drag / right-drag / WASD | Rotate / pan the camera |
| Wheel | Zoom |
| Double-click | Focus the object / enter a surveyed system / fly through a gate into the (surveyed) system beyond |
| `Space`, `1`–`4` | Pause, game speed |
| `G` / `H` | Galaxy map / home system |
| `R` / `E` | Research tree / empires and diplomacy |
| `F` / `Esc` | Focus the selection / deselect or open the menu |

The left panel's **System** tab outlines everything in the current system: stars, planets with their moons, belts, comets, gates and fleets. It shows habitability, rich deposits, artifacts, colonies and stations at a glance. The **badges** under the top bar flag recommended actions: worlds to colonize, mining, energy, research and exotic sites, idle ships, free building slots and idle research. Click a badge to cycle through its targets.

Ships fly with Newtonian thrust: they accelerate to cruise speed, coast, then flip and burn to brake, and they match orbits with moving planets.

The game autosaves to `localStorage` every 90 seconds, and you can save manually from the menu or to the cloud.

Population grows along an S-curve: slowly from a handful of settlers, fastest at mid capacity, levelling off when full. Crowded worlds send private migrant liners (which you don't command) to young colonies with room. Arriving ships park in orbit and send shuttles down to the surface.

## Playing with friends

Enter your name on the title screen and click **Host online game**. You get an invite code and link. Friends open the link (or enter the code), take over any AI empire, and the host starts the game. The server runs the shared clock: anyone may pause, only the host changes speed, and the game pauses by itself when nobody is online. Games are saved on the server; resume them from the title screen. Each player only receives what their empire can know: no foreign colonies in unexplored systems, no fleets outside sensor range, no news they didn't witness. Pathfinding never uses tunnels your empire hasn't discovered.

## Rival rulers with a voice

When the game server has an OpenRouter key (`OPENROUTER_API_KEY`, see `.env.example` and `../DEPLOYMENT.md`), each rival empire is ruled by a character dealt at random from 14 personas (the Iron Chancellor, the Merchant Prince, the Young Heir, the Ancient Mind…), independent of species; the species lore shapes how they speak. Every few months, and at key moments (first contact, a declaration of war, a lost colony, an answered demand) the ruler reviews a compact, knowledge-limited situation report and sets a grand strategy (posture, research focus, war target, peace wishes) that steers the AI. Open **Empires → Talk** to write to them: they answer in character and may act, e.g. accept peace, send tribute, cede a colony, demand one of yours or declare war. Hard rules decide what a ruler can actually be talked into. A single-player game pauses while you write. Human players in an online game can talk to each other the same way.

## Architecture

```
v3/src
├── sim/        Pure, deterministic simulation (no DOM, no WebGL)
│   ├── data/   Star, planet, belt, ship, weapon, building, station, tech and species tables
│   ├── galaxy.ts     Spiral galaxy layout, Gabriel-graph tunnel network, system generation
│   ├── economy.ts    Habitability, population, production, upkeep, queues, research
│   ├── fleets.ts     Movement, Dijkstra routing, colonize/build/invade actions
│   ├── combat.ts     Engagement detection, weapon fire, damage model, sieges, repair
│   ├── ai.ts         Rival empire AI;  pirates.ts: Void Raiders
│   ├── commands.ts   Validated commands (shared by player UI and AI)
│   └── game.ts       Fixed-step loop (0.1 day), victory, save/load
├── llm/        Ruler briefings, prompts and parsing, the RivalDirector
├── net/        WebSocket protocol, client, fog-of-war NetGame
├── render/     Three.js views, procedural shaders, ship/station models, effects
└── ui/         HUD, lobby, labels (plain DOM + CSS)
v3/server       Game server: sessions, per-player views, SQLite persistence, OpenRouter
```

The whole game state is plain JSON with a seeded RNG, so saves are trivial and replays are deterministic. The simulation has no browser dependencies. It runs unchanged in Node, which is how the tests and the authoritative multiplayer server use it.

## Testing

- **Unit tests** (`tests/sim.test.ts`) cover:
  - Generation: determinism, a connected tunnel network, homeworld fairness, and stellar/planetary variety.
  - Orbital mechanics.
  - The economy.
  - Research.
  - Fleet routing, colonisation, station building, and split/merge.
  - Combat, pirate bounties, sieges and invasions.
  - Save/load determinism.
  - Victory and defeat.
  - A 1,500-day, 6-empire AI marathon that checks state invariants.
- **End-to-end tests** (`e2e/game.spec.ts`) drive the real UI in Chromium:
  - The title screen and the 3D render.
  - Building from the colony panel.
  - Right-click fleet orders and galaxy travel.
  - The research tree.
  - A live battle with weapon effects.
  - Save, reload and continue.
  - Diplomacy.

  Every test also fails on any console error.
