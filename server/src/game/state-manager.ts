import {
  SystemState,
  CelestialBodyState,
  ShipState,
  StarSystem,
  Ship,
  Vector3,
  SERVER_TICK_RATE,
  TIME_SCALE_DEFAULT,
  CelestialBodyType,
} from "@constellation/shared";
import {
  calculateStateVectors,
  calculatePerturbations,
} from "../physics/orbital.js";

export class GameStateManager {
  private systems: Map<string, StarSystem> = new Map();
  private ships: Map<string, Ship[]> = new Map(); // systemId -> ships
  private currentGalaxyId: string | null = null;
  private galaxyTimeState: Map<string, {
    currentTime: number;
    isPaused: boolean;
    timeScale: number;
    lastUpdateTime: number;
    lastProcessedDay: number; // Track which day we last processed yields for
  }> = new Map();
  private onDayElapsed: ((galaxyId: string, currentTime: number, daysElapsed: number) => void) | null = null;

  constructor() {
    this.startSimulation();
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ee94a6f1-42d6-44ad-8459-4ef2edbb6497',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'state-manager.ts:constructor',message:'GameStateManager created',data:{systemsCount:0,shipsCount:0,galaxiesCount:0},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
  }
  
  /**
   * Register a callback to be notified when in-game days elapse
   * This is how the websocket server will be notified to process yields
   */
  setDayElapsedCallback(callback: (galaxyId: string, currentTime: number, daysElapsed: number) => void): void {
    this.onDayElapsed = callback;
  }

  private startSimulation(): void {
    setInterval(() => {
      this.update();
    }, 1000 / SERVER_TICK_RATE);
  }

  private update(): void {
    const now = Date.now();
    const SECONDS_PER_DAY = 24 * 60 * 60;
    
    // Update time for all active galaxies, not just the "current" one
    for (const [galaxyId, timeState] of this.galaxyTimeState.entries()) {
      if (timeState.isPaused) {
        timeState.lastUpdateTime = now;
        continue;
      }

      const deltaRealTime = (now - timeState.lastUpdateTime) / 1000; // seconds
      const deltaGameTime = deltaRealTime * timeState.timeScale;

      timeState.currentTime += deltaGameTime;
      timeState.lastUpdateTime = now;
      
      // Check if we've crossed into a new in-game day
      const currentDay = Math.floor(timeState.currentTime / SECONDS_PER_DAY);
      if (currentDay > timeState.lastProcessedDay) {
        const daysElapsed = currentDay - timeState.lastProcessedDay;
        // Notify the websocket server that days have passed so it can process yields
        if (this.onDayElapsed) {
          this.onDayElapsed(galaxyId, timeState.currentTime, daysElapsed);
        }
        timeState.lastProcessedDay = currentDay;
      }
    }
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

  loadGalaxy(galaxyId: string, currentTime: number = 0, isPaused: boolean = true, timeScale: number = TIME_SCALE_DEFAULT): void {
    this.currentGalaxyId = galaxyId;
    if (!this.galaxyTimeState.has(galaxyId)) {
      const SECONDS_PER_DAY = 24 * 60 * 60;
      this.galaxyTimeState.set(galaxyId, {
        currentTime,
        isPaused,
        timeScale,
        lastUpdateTime: Date.now(),
        lastProcessedDay: Math.floor(currentTime / SECONDS_PER_DAY), // Initialize based on current time
      });
    }
  }

  getSystemState(systemId: string): SystemState | null {
    const system = this.systems.get(systemId);
    if (!system) return null;

    // Get time for this system's specific galaxy, not just the "current" galaxy
    const timeState = this.galaxyTimeState.get(system.galaxyId);
    const currentTime = timeState ? timeState.currentTime : 0;
    const bodies: CelestialBodyState[] = [];

    // Star is at the center
    bodies.push({
      id: system.star.id,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    });

    // Create a map of companion stars by ID for quick lookup
    const companionStarsMap = new Map<string, CelestialBodyType>();
    if (system.companionStars) {
      system.companionStars.forEach((cs) => {
        companionStarsMap.set(cs.id, cs);
      });
    }

    // Calculate positions of companion stars (for binary/trinary systems)
    // Store states for use in planet position calculations
    const companionStarStates: Array<{
      id: string;
      mass: number;
      position: Vector3;
      velocity: Vector3;
    }> = [];
    if (system.companionStars && system.companionStars.length > 0) {
      for (const companionStar of system.companionStars) {
        if (companionStar.orbitalElements) {
          const state = calculateStateVectors(
            companionStar.orbitalElements,
            currentTime,
            system.star.mass
          );

          bodies.push({
            id: companionStar.id,
            position: state.position,
            velocity: state.velocity,
          });

          companionStarStates.push({
            id: companionStar.id,
            mass: companionStar.mass,
            position: state.position,
            velocity: state.velocity,
          });
        }
      }
    }

    // Calculate positions of planets
    const planetStates: Array<{
      id: string;
      mass: number;
      position: Vector3;
      velocity: Vector3;
    }> = [];

    for (const planet of system.planets) {
      if (planet.orbitalElements) {
        // Determine parent mass and if planet orbits a companion star
        let parentMass = system.star.mass;
        let parentPosition: Vector3 = { x: 0, y: 0, z: 0 };
        let parentVelocity: Vector3 = { x: 0, y: 0, z: 0 };
        const isOrbitingCompanion = planet.parentId && planet.parentId !== system.star.id && companionStarsMap.has(planet.parentId);

        if (isOrbitingCompanion && planet.parentId) {
          // Planet orbits a companion star
          const companionStar = companionStarsMap.get(planet.parentId);
          if (companionStar) {
            parentMass = companionStar.mass;
            const companionState = companionStarStates.find((cs) => cs.id === planet.parentId);
            if (companionState) {
              parentPosition = companionState.position;
              parentVelocity = companionState.velocity;
            }
          }
        }

        // Calculate planet position relative to its parent
        const state = calculateStateVectors(
          planet.orbitalElements,
          currentTime,
          parentMass
        );

        // If orbiting a companion star, add companion star's position
        const absolutePosition: Vector3 = {
          x: state.position.x + parentPosition.x,
          y: state.position.y + parentPosition.y,
          z: state.position.z + parentPosition.z,
        };
        const absoluteVelocity: Vector3 = {
          x: state.velocity.x + parentVelocity.x,
          y: state.velocity.y + parentVelocity.y,
          z: state.velocity.z + parentVelocity.z,
        };

        bodies.push({
          id: planet.id,
          position: absolutePosition,
          velocity: absoluteVelocity,
        });

        planetStates.push({
          id: planet.id,
          mass: planet.mass,
          position: absolutePosition,
          velocity: absoluteVelocity,
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
          const acceleratedTime = currentTime * moonTimeAcceleration;

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
        currentTime,
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
        currentTime,
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
            currentTime,
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
      currentTime,
      bodies,
      ships: shipStates,
      gates: gateStates,
      asteroids: asteroidStates,
      moons: moonStates,
      megastructures: system.megastructures || [],
    };
  }

  setTimeScale(galaxyId: string, scale: number): void {
    const timeState = this.galaxyTimeState.get(galaxyId);
    if (timeState) {
      timeState.timeScale = Math.max(0, scale);
    }
  }

  pause(galaxyId: string): void {
    const timeState = this.galaxyTimeState.get(galaxyId);
    if (timeState) {
      timeState.isPaused = true;
    }
  }

  resume(galaxyId: string): void {
    const timeState = this.galaxyTimeState.get(galaxyId);
    if (timeState) {
      timeState.isPaused = false;
      timeState.lastUpdateTime = Date.now();
    }
  }

  isPausedState(galaxyId?: string): boolean {
    const targetGalaxyId = galaxyId || this.currentGalaxyId;
    if (!targetGalaxyId) return true;
    const timeState = this.galaxyTimeState.get(targetGalaxyId);
    return timeState ? timeState.isPaused : true;
  }

  getTimeScale(galaxyId?: string): number {
    const targetGalaxyId = galaxyId || this.currentGalaxyId;
    if (!targetGalaxyId) return TIME_SCALE_DEFAULT;
    const timeState = this.galaxyTimeState.get(targetGalaxyId);
    return timeState ? timeState.timeScale : TIME_SCALE_DEFAULT;
  }

  getCurrentTime(): number {
    if (!this.currentGalaxyId) return 0;
    const timeState = this.galaxyTimeState.get(this.currentGalaxyId);
    return timeState ? timeState.currentTime : 0;
  }

  getGalaxyTime(galaxyId: string): number {
    const timeState = this.galaxyTimeState.get(galaxyId);
    return timeState ? timeState.currentTime : 0;
  }

  getGalaxyState(galaxyId: string): { currentTime: number; isPaused: boolean; timeScale: number } | null {
    const timeState = this.galaxyTimeState.get(galaxyId);
    if (!timeState) return null;
    return {
      currentTime: timeState.currentTime,
      isPaused: timeState.isPaused,
      timeScale: timeState.timeScale,
    };
  }

  resetTime(): void {
    if (!this.currentGalaxyId) return;
    const timeState = this.galaxyTimeState.get(this.currentGalaxyId);
    if (timeState) {
      timeState.currentTime = 0;
      timeState.lastUpdateTime = Date.now();
    }
  }

  getCurrentGalaxyId(): string | null {
    return this.currentGalaxyId;
  }

  getGalaxyTimeState(galaxyId: string): { currentTime: number; isPaused: boolean; timeScale: number } | null {
    const timeState = this.galaxyTimeState.get(galaxyId);
    if (!timeState) return null;
    return {
      currentTime: timeState.currentTime,
      isPaused: timeState.isPaused,
      timeScale: timeState.timeScale,
    };
  }

  updateShipOrbit(shipId: string, systemId: string, ship: Ship): void {
    const ships = this.ships.get(systemId) || [];
    const index = ships.findIndex((s) => s.id === shipId);
    if (index !== -1) {
      ships[index] = ship;
    }
  }

  /**
   * Get metrics for memory monitoring
   */
  getMetrics(): { systemsCount: number; shipsCount: number; galaxiesCount: number; totalShips: number } {
    let totalShips = 0;
    for (const ships of this.ships.values()) {
      totalShips += ships.length;
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ee94a6f1-42d6-44ad-8459-4ef2edbb6497',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'state-manager.ts:getMetrics',message:'GameStateManager metrics',data:{systemsCount:this.systems.size,shipsMapSize:this.ships.size,galaxiesCount:this.galaxyTimeState.size,totalShips},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion

    return {
      systemsCount: this.systems.size,
      shipsCount: this.ships.size,
      galaxiesCount: this.galaxyTimeState.size,
      totalShips,
    };
  }
}
