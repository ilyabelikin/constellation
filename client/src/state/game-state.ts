import { Player, StarSystem, Ship, SystemState } from "@constellation/shared";

/**
 * Client-side game state cache
 */
export class GameState {
  private player: Player | null = null;
  private system: StarSystem | null = null;
  private ship: Ship | null = null;
  private currentState: SystemState | null = null;
  private isPaused = false;
  private timeScale = 1000;
  private currentTime = 0;

  setPlayer(player: Player): void {
    this.player = player;
  }

  getPlayer(): Player | null {
    return this.player;
  }

  setSystem(system: StarSystem): void {
    this.system = system;
  }

  getSystem(): StarSystem | null {
    return this.system;
  }

  setShip(ship: Ship): void {
    this.ship = ship;
  }

  getShip(): Ship | null {
    return this.ship;
  }

  updateState(state: SystemState): void {
    this.currentState = state;
    this.currentTime = state.currentTime;
  }

  getCurrentState(): SystemState | null {
    return this.currentState;
  }

  setTimeState(
    currentTime: number,
    isPaused: boolean,
    timeScale: number
  ): void {
    this.currentTime = currentTime;
    this.isPaused = isPaused;
    this.timeScale = timeScale;
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
}

