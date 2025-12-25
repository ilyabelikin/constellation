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
  private startRealTime: number = performance.now() / 1000; // Track when time started

  // Store previous and target positions for smooth interpolation
  private bodyPreviousPositions: Map<string, THREE.Vector3> = new Map();
  private bodyTargetPositions: Map<string, THREE.Vector3> = new Map();
  private bodyCurrentPositions: Map<string, THREE.Vector3> = new Map();
  // Store velocities for dead reckoning (extrapolation beyond target)
  private bodyVelocities: Map<string, THREE.Vector3> = new Map();

  /**
   * Sets the pause state and time scale
   */
  setTimeState(isPaused: boolean, timeScale: number): void {
    this.isPaused = isPaused;
    this.timeScale = timeScale;
  }

  /**
   * Updates the server time (called when receiving state updates)
   * This synchronizes our time with the server but doesn't cause jumps
   */
  setServerTime(time: number): void {
    const currentRealTime = performance.now() / 1000;
    // Instead of jumping to server time, we adjust our base time smoothly
    // This prevents visual discontinuities in rotation and animation
    if (this.lastUpdateRealTime === 0) {
      // First update - initialize everything
      this.lastServerTime = time;
      this.gameTime = time;
      this.startRealTime = currentRealTime;
    } else {
      // Subsequent updates - use server time as ground truth but interpolate smoothly
      this.lastServerTime = time;
    }
    this.lastUpdateRealTime = currentRealTime;
  }

  /**
   * Updates game time based on real time elapsed
   * This is called every frame to provide smooth, continuous time
   */
  update(): void {
    const currentRealTime = performance.now() / 1000;
    if (!this.isPaused) {
      // Calculate time elapsed since last server update
      const realTimeDelta = currentRealTime - this.lastUpdateRealTime;
      // Smoothly advance game time based on time scale
      this.gameTime = this.lastServerTime + realTimeDelta * this.timeScale;
    } else {
      this.gameTime = this.lastServerTime;
      // Update lastUpdateRealTime even when paused to prevent time jumps when unpausing
      this.lastUpdateRealTime = currentRealTime;
    }
  }

  /**
   * Stores a new target position for a body
   */
  setBodyTargetPosition(bodyId: string, position: THREE.Vector3): void {
    if (!this.bodyTargetPositions.has(bodyId)) {
      // First time seeing this body, set all positions to the same
      this.bodyPreviousPositions.set(bodyId, position.clone());
      this.bodyTargetPositions.set(bodyId, position.clone());
      this.bodyCurrentPositions.set(bodyId, position.clone());
      this.bodyVelocities.set(bodyId, new THREE.Vector3(0, 0, 0));
    } else {
      // Use the CURRENT interpolated position as PREVIOUS for the next segment
      // This ensures a smooth transition even if the previous interpolation
      // hadn't finished or had already overshot (dead reckoning)
      const currentPos =
        this.bodyCurrentPositions.get(bodyId) ||
        this.bodyTargetPositions.get(bodyId)!;
      this.bodyPreviousPositions.set(bodyId, currentPos.clone());

      const oldTarget = this.bodyTargetPositions.get(bodyId)!;
      // Calculate velocity for dead reckoning (extrapolation)
      // This allows smooth motion even when lerp factor exceeds 1.0
      const velocity = new THREE.Vector3().subVectors(position, oldTarget);
      this.bodyVelocities.set(bodyId, velocity);

      this.bodyTargetPositions.set(bodyId, position);
    }
  }

  /**
   * Gets the interpolated position for a body
   * @param bodyId - ID of the body
   * @param lerpFactor - Interpolation factor (0-1, or slightly above for dead reckoning)
   * @returns The interpolated position, or null if body not found
   */
  getInterpolatedPosition(
    bodyId: string,
    lerpFactor: number
  ): THREE.Vector3 | null {
    const prevPos = this.bodyPreviousPositions.get(bodyId);
    const targetPos = this.bodyTargetPositions.get(bodyId);
    const velocity = this.bodyVelocities.get(bodyId);

    if (prevPos && targetPos) {
      const result = new THREE.Vector3();

      if (lerpFactor <= 1.0) {
        // Normal interpolation between previous and target
        result.lerpVectors(prevPos, targetPos, lerpFactor);
      } else if (velocity) {
        // Dead reckoning: extrapolate beyond target using velocity
        // Allow up to 50% extrapolation to handle jitter
        const extrapolationFactor = Math.min(lerpFactor - 1.0, 0.5);
        result
          .copy(targetPos)
          .add(velocity.clone().multiplyScalar(extrapolationFactor));
      } else {
        // Fallback: stick at target
        result.copy(targetPos);
      }

      // Store the current interpolated position
      this.bodyCurrentPositions.set(bodyId, result.clone());
      return result;
    }

    return null;
  }

  /**
   * Gets the interpolation factor based on time since last update
   * @param interpolationDuration - Duration to interpolate over (in seconds)
   */
  getLerpFactor(interpolationDuration: number = 0.4): number {
    const currentRealTime = performance.now() / 1000;
    const timeSinceUpdate = currentRealTime - this.lastUpdateRealTime;
    const lerpFactor = timeSinceUpdate / interpolationDuration;

    // Allow more extrapolation (up to 1.5) for dead reckoning
    // This handles longer server pauses without "sticking" too soon
    return Math.min(lerpFactor, 1.5);
  }

  /**
   * Removes a body from all position maps
   */
  removeBody(bodyId: string): void {
    this.bodyPreviousPositions.delete(bodyId);
    this.bodyTargetPositions.delete(bodyId);
    this.bodyCurrentPositions.delete(bodyId);
    this.bodyVelocities.delete(bodyId);
  }

  /**
   * Clears all stored positions (call when loading new system)
   */
  clearPositions(): void {
    this.bodyPreviousPositions.clear();
    this.bodyTargetPositions.clear();
    this.bodyCurrentPositions.clear();
    this.bodyVelocities.clear();
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
