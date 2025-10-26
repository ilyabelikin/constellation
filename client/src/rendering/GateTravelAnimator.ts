import * as THREE from "three";
import { CameraController } from "./CameraController.js";

/**
 * Manages gate travel animation effects
 */
export class GateTravelAnimator {
  private camera: THREE.Camera;
  private cameraController: CameraController;

  // Animation state
  private isTraveling = false;
  private travelStartTime = 0;
  private travelDuration = 2500; // 2.5 seconds
  private flashPlane: THREE.Mesh | null = null;
  private travelCompleteCallback: (() => void) | null = null;

  // Animation parameters
  private entryGateStartDistance = 0;
  private entryGateTargetDistance = 2; // Very close to the gate
  private exitGateStartDistance = 10;
  private systemViewDistance = 10;

  // Callbacks
  public onAnimationPhaseChange: ((phase: string) => void) | null = null;

  constructor(camera: THREE.Camera, cameraController: CameraController) {
    this.camera = camera;
    this.cameraController = cameraController;
  }

  /**
   * Start gate travel animation
   */
  startTravel(systemViewDistance: number, onComplete?: () => void): void {
    this.entryGateStartDistance = this.cameraController.getCameraDistance();
    this.systemViewDistance = systemViewDistance;
    this.travelCompleteCallback = onComplete || null;

    this.isTraveling = true;
    this.travelStartTime = performance.now();

    this.createFlash();
  }

  /**
   * Update animation state (call every frame)
   * @returns Object with current phase and completion status
   */
  update(): { phase: string; progress: number; isComplete: boolean } {
    if (!this.isTraveling) {
      return { phase: "idle", progress: 0, isComplete: false };
    }

    const elapsed = performance.now() - this.travelStartTime;
    const progress = Math.min(elapsed / this.travelDuration, 1);

    // Phase 1 (0-40%): Zoom into entry gate + flash fades in
    if (progress < 0.4) {
      const zoomInProgress = progress / 0.4;
      const easedZoomIn = this.easeInOutCubic(zoomInProgress);

      // Smoothly zoom into the entry gate
      const currentDistance =
        this.entryGateStartDistance +
        (this.entryGateTargetDistance - this.entryGateStartDistance) *
          easedZoomIn;

      this.cameraController.setCameraDistance(currentDistance);

      // Fade in flash
      this.updateFlashOpacity(zoomInProgress);

      return { phase: "zoom-in", progress: zoomInProgress, isComplete: false };
    }

    // Phase 2 (40-50%): Full white flash
    if (progress < 0.5) {
      this.updateFlashOpacity(1);
      return {
        phase: "flash",
        progress: (progress - 0.4) / 0.1,
        isComplete: false,
      };
    }

    // Phase 3 (50-100%): Zoom out to system view
    if (progress < 1) {
      const zoomOutProgress = (progress - 0.5) / 0.5;
      const easedZoomOut = this.easeInOutCubic(zoomOutProgress);

      // Smoothly interpolate camera distance
      const currentDistance =
        this.exitGateStartDistance +
        (this.systemViewDistance - this.exitGateStartDistance) * easedZoomOut;

      // Smoothly transition to system view
      this.cameraController.transitionToSystemView(
        currentDistance,
        easedZoomOut
      );

      // Fade out flash
      this.updateFlashOpacity((1 - progress) / 0.5);

      return { phase: "zoom-out", progress: easedZoomOut, isComplete: false };
    }

    // Animation complete
    this.isTraveling = false;
    this.removeFlash();

    // Ensure we're at the final system view
    this.cameraController.setSystemView(this.systemViewDistance);

    // Call completion callback
    if (this.travelCompleteCallback) {
      this.travelCompleteCallback();
      this.travelCompleteCallback = null;
    }

    return { phase: "complete", progress: 1, isComplete: true };
  }

  /**
   * Position camera near exit gate (called during flash phase)
   */
  positionAtExitGate(exitGateGroup: THREE.Group): void {
    this.cameraController.setPositionNearObject(
      exitGateGroup,
      this.exitGateStartDistance
    );
  }

  /**
   * Check if animation is in progress
   */
  isAnimating(): boolean {
    return this.isTraveling;
  }

  /**
   * Get current animation progress (0-1)
   */
  getProgress(): number {
    if (!this.isTraveling) return 0;
    const elapsed = performance.now() - this.travelStartTime;
    return Math.min(elapsed / this.travelDuration, 1);
  }

  /**
   * Create white flash plane
   */
  private createFlash(): void {
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
    });

    this.flashPlane = new THREE.Mesh(geometry, material);
    this.flashPlane.position.set(0, 0, -0.1);
    this.camera.add(this.flashPlane);
  }

  /**
   * Remove flash effect
   */
  private removeFlash(): void {
    if (this.flashPlane && this.camera) {
      this.camera.remove(this.flashPlane);
      if (this.flashPlane.geometry) {
        this.flashPlane.geometry.dispose();
      }
      if (this.flashPlane.material instanceof THREE.Material) {
        this.flashPlane.material.dispose();
      }
      this.flashPlane = null;
    }
  }

  /**
   * Update flash opacity
   */
  private updateFlashOpacity(opacity: number): void {
    if (this.flashPlane) {
      const material = this.flashPlane.material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, Math.min(1, opacity));
    }
  }

  /**
   * Ease-in-out cubic function for smooth animation
   */
  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.removeFlash();
    this.travelCompleteCallback = null;
    this.onAnimationPhaseChange = null;
  }
}
