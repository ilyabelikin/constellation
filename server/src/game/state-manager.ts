import {
  SystemState,
  CelestialBodyState,
  ShipState,
  StarSystem,
  Ship,
  Vector3,
  SERVER_TICK_RATE,
  TIME_SCALE_DEFAULT,
} from "@constellation/shared";
import {
  calculateStateVectors,
  calculatePerturbations,
} from "../physics/orbital.js";

export class GameStateManager {
  private systems: Map<string, StarSystem> = new Map();
  private ships: Map<string, Ship[]> = new Map(); // systemId -> ships
  private currentTime: number = 0; // Game time in seconds
  private isPaused: boolean = false;
  private timeScale: number = TIME_SCALE_DEFAULT;
  private lastUpdateTime: number = Date.now();

  constructor() {
    this.startSimulation();
  }

  private startSimulation(): void {
    setInterval(() => {
      this.update();
    }, 1000 / SERVER_TICK_RATE);
  }

  private update(): void {
    if (this.isPaused) {
      this.lastUpdateTime = Date.now();
      return;
    }

    const now = Date.now();
    const deltaRealTime = (now - this.lastUpdateTime) / 1000; // seconds
    const deltaGameTime = deltaRealTime * this.timeScale;

    this.currentTime += deltaGameTime;
    this.lastUpdateTime = now;
  }

  loadSystem(system: StarSystem): void {
    this.systems.set(system.id, system);
    if (!this.ships.has(system.id)) {
      this.ships.set(system.id, []);
    }
  }

  loadShips(systemId: string, ships: Ship[]): void {
    this.ships.set(systemId, ships);
  }

  addShip(ship: Ship): void {
    const ships = this.ships.get(ship.systemId) || [];
    ships.push(ship);
    this.ships.set(ship.systemId, ships);
  }

  getSystemState(systemId: string): SystemState | null {
    const system = this.systems.get(systemId);
    if (!system) return null;

    const bodies: CelestialBodyState[] = [];

    // Star is at the center
    bodies.push({
      id: system.star.id,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    });

    // Calculate positions of planets
    const planetStates: Array<{
      id: string;
      mass: number;
      position: Vector3;
      velocity: Vector3;
    }> = [];

    for (const planet of system.planets) {
      if (planet.orbitalElements) {
        const state = calculateStateVectors(
          planet.orbitalElements,
          this.currentTime,
          system.star.mass
        );

        bodies.push({
          id: planet.id,
          position: state.position,
          velocity: state.velocity,
        });

        planetStates.push({
          id: planet.id,
          mass: planet.mass,
          position: state.position,
          velocity: state.velocity,
        });
      }
    }

    // Calculate moon positions (moons orbit their parent planet)
    const moonStates: CelestialBodyState[] = [];
    for (const moon of system.moons) {
      if (moon.orbitalElements && moon.parentId) {
        // Find the parent planet
        const parentPlanet = planetStates.find((p) => p.id === moon.parentId);
        if (parentPlanet) {
          // Speed up moon orbits for visual effect (3x faster than realistic)
          // This compensates for visual scaling adjustments
          const moonTimeAcceleration = 40.0;
          const acceleratedTime = this.currentTime * moonTimeAcceleration;

          // Calculate moon's position relative to its parent planet
          const state = calculateStateVectors(
            moon.orbitalElements,
            acceleratedTime,
            parentPlanet.mass
          );

          // Add parent planet's position to get moon's absolute position
          moonStates.push({
            id: moon.id,
            position: {
              x: state.position.x + parentPlanet.position.x,
              y: state.position.y + parentPlanet.position.y,
              z: state.position.z + parentPlanet.position.z,
            },
            velocity: {
              x: state.velocity.x + parentPlanet.velocity.x,
              y: state.velocity.y + parentPlanet.velocity.y,
              z: state.velocity.z + parentPlanet.velocity.z,
            },
          });
        }
      }
    }

    // Calculate ship positions
    const ships = this.ships.get(systemId) || [];
    const shipStates: ShipState[] = ships.map((ship) => {
      // Find parent body mass
      let parentMass = system.star.mass;
      if (ship.parentBodyId !== system.star.id) {
        const parentPlanet = system.planets.find(
          (p) => p.id === ship.parentBodyId
        );
        if (parentPlanet) {
          parentMass = parentPlanet.mass;
        }
      }

      const state = calculateStateVectors(
        ship.orbitalElements,
        this.currentTime,
        parentMass
      );

      // If orbiting a planet, add the planet's position
      if (ship.parentBodyId !== system.star.id) {
        const parentState = planetStates.find(
          (p) => p.id === ship.parentBodyId
        );
        if (parentState) {
          state.position.x += parentState.position.x;
          state.position.y += parentState.position.y;
          state.position.z += parentState.position.z;
          state.velocity.x += parentState.velocity.x;
          state.velocity.y += parentState.velocity.y;
          state.velocity.z += parentState.velocity.z;
        }
      }

      // Apply perturbations from other bodies (simplified)
      const perturbingBodies = planetStates
        .filter((p) => p.id !== ship.parentBodyId)
        .map((p) => ({ mass: p.mass, position: p.position }));

      if (perturbingBodies.length > 0) {
        const perturbation = calculatePerturbations(
          state.position,
          perturbingBodies
        );
        // Apply small correction (this is simplified; full n-body would require integration)
        const dt = 1 / SERVER_TICK_RATE;
        state.velocity.x += perturbation.x * dt;
        state.velocity.y += perturbation.y * dt;
        state.velocity.z += perturbation.z * dt;
      }

      return {
        id: ship.id,
        playerId: ship.playerId,
        position: state.position,
        velocity: state.velocity,
      };
    });

    // Calculate gate positions (gates orbit like planets)
    const gateStates: CelestialBodyState[] = [];
    for (const gate of system.gates) {
      const state = calculateStateVectors(
        gate.orbitalElements,
        this.currentTime,
        system.star.mass
      );

      gateStates.push({
        id: gate.id,
        position: state.position,
        velocity: state.velocity,
      });
    }

    // Calculate asteroid positions
    const asteroidStates: CelestialBodyState[] = [];
    for (const belt of system.asteroidBelts) {
      for (const asteroid of belt.asteroids) {
        if (asteroid.orbitalElements) {
          const state = calculateStateVectors(
            asteroid.orbitalElements,
            this.currentTime,
            system.star.mass
          );

          asteroidStates.push({
            id: asteroid.id,
            position: state.position,
            velocity: state.velocity,
          });
        }
      }
    }

    return {
      systemId,
      currentTime: this.currentTime,
      bodies,
      ships: shipStates,
      gates: gateStates,
      asteroids: asteroidStates,
      moons: moonStates,
    };
  }

  setTimeScale(scale: number): void {
    this.timeScale = Math.max(0, scale);
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
    this.lastUpdateTime = Date.now();
  }

  isPausedState(): boolean {
    return this.isPaused;
  }

  getTimeScale(): number {
    return this.timeScale;
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  resetTime(): void {
    this.currentTime = 0;
    this.lastUpdateTime = Date.now();
  }

  updateShipOrbit(shipId: string, systemId: string, ship: Ship): void {
    const ships = this.ships.get(systemId) || [];
    const index = ships.findIndex((s) => s.id === shipId);
    if (index !== -1) {
      ships[index] = ship;
    }
  }
}
