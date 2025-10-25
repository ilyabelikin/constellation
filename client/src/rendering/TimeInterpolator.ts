import * as THREE from "three";

/**
 * Manages game time interpolation and smooth position/rotation animations
 */
export class TimeInterpolator {
  private gameTime: number = 0;
  private lastServerTime: number = 0;
  private lastUpdateRealTime: number = 0;
  private isPaused: boolean = true;
  private timeScale: number = 1;

  // Store previous and target positions for smooth interpolation
  private bodyPreviousPositions: Map<string, THREE.Vector3> = new Map();
  private bodyTargetPositions: Map<string, THREE.Vector3> = new Map();

  /**
   * Sets the pause state and time scale
   */
  setTimeState(isPaused: boolean, timeScale: number): void {
    this.isPaused = isPaused;
    this.timeScale = timeScale;
  }

  /**
   * Updates the server time (called when receiving state updates)
   */
  setServerTime(time: number): void {
    this.lastServerTime = time;
    this.lastUpdateRealTime = performance.now() / 1000;
  }

  /**
   * Updates game time based on real time elapsed
   */
  update(): void {
    if (!this.isPaused) {
      const currentRealTime = performance.now() / 1000;
      const realTimeDelta = currentRealTime - this.lastUpdateRealTime;
      this.gameTime = this.lastServerTime + realTimeDelta * this.timeScale;
    } else {
      this.gameTime = this.lastServerTime;
    }
  }

  /**
   * Stores a new target position for a body
   */
  setBodyTargetPosition(bodyId: string, position: THREE.Vector3): void {
    if (!this.bodyTargetPositions.has(bodyId)) {
      // First time seeing this body, set both previous and target to the same
      this.bodyPreviousPositions.set(bodyId, position.clone());
      this.bodyTargetPositions.set(bodyId, position.clone());
    } else {
      // Store current target as previous, and new position as target
      const currentTarget = this.bodyTargetPositions.get(bodyId)!;
      this.bodyPreviousPositions.set(bodyId, currentTarget.clone());
      this.bodyTargetPositions.set(bodyId, position);
    }
  }

  /**
   * Gets the interpolated position for a body
   * @param bodyId - ID of the body
   * @param lerpFactor - Interpolation factor (0-1)
   * @returns The interpolated position, or null if body not found
   */
  getInterpolatedPosition(
    bodyId: string,
    lerpFactor: number
  ): THREE.Vector3 | null {
    const prevPos = this.bodyPreviousPositions.get(bodyId);
    const targetPos = this.bodyTargetPositions.get(bodyId);

    if (prevPos && targetPos) {
      const result = new THREE.Vector3();
      result.lerpVectors(prevPos, targetPos, lerpFactor);
      return result;
    }

    return null;
  }

  /**
   * Gets the interpolation factor based on time since last update
   * @param interpolationDuration - Duration to interpolate over (in seconds)
   */
  getLerpFactor(interpolationDuration: number = 0.2): number {
    const currentRealTime = performance.now() / 1000;
    const timeSinceUpdate = currentRealTime - this.lastUpdateRealTime;
    return Math.min(timeSinceUpdate / interpolationDuration, 1.0);
  }

  /**
   * Clears all stored positions (call when loading new system)
   */
  clearPositions(): void {
    this.bodyPreviousPositions.clear();
    this.bodyTargetPositions.clear();
  }

  /**
   * Gets the current interpolated game time
   */
  getGameTime(): number {
    return this.gameTime;
  }

  /**
   * Gets the pause state
   */
  getIsPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Gets the time scale
   */
  getTimeScale(): number {
    return this.timeScale;
  }

  /**
   * Gets the last server time
   */
  getLastServerTime(): number {
    return this.lastServerTime;
  }
}
