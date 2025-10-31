import * as THREE from "three";
import { CameraController } from "./CameraController.js";

/**
 * Manages gate travel animation - quick movement through gate and starfield
 */
export class GateTravelAnimator {
  private camera: THREE.Camera;
  private cameraController: CameraController;
  private scene: THREE.Scene | null = null;

  // Animation state
  private isTraveling = false;
  private isExitingGate = false; // New phase: exiting from exit gate
  private travelStartTime = 0;
  private exitStartTime = 0;
  private travelDuration = 1500; // 1.5 seconds for gate travel
  private exitDuration = 1500; // 1.5 seconds for exit animation
  private travelCompleteCallback: (() => void) | null = null;

  // Animation parameters
  private entryGateStartDistance = 0;
  private entryGateTargetDistance = 5; // Close but not too close to see the gate structure
  private exitGateStartDistance = 10;
  private systemViewDistance = 10;
  
  // Camera movement direction and gate positions
  private travelDirection: THREE.Vector3 = new THREE.Vector3();
  private travelStartPosition: THREE.Vector3 = new THREE.Vector3();
  private entryGatePosition: THREE.Vector3 = new THREE.Vector3();
  private entryGateStartTarget: THREE.Vector3 = new THREE.Vector3(); // Camera target at start
  private exitGatePosition: THREE.Vector3 = new THREE.Vector3();
  private exitGateExitDirection: THREE.Vector3 = new THREE.Vector3(); // Direction to exit from gate
  private starPosition: THREE.Vector3 = new THREE.Vector3();
  private starTargetDistance: number = 0; // Target distance for viewing star
  private starId: string | null = null; // Star ID for selection

  // Removed hyperspace effects - simple fast movement instead
  private exitGateId: string | null = null;
  private sceneManager: any = null; // Reference to SceneManager for accessing gates
  private gateColor: THREE.Color = new THREE.Color(0xfbbf24); // Default to yellow (explored)
  private isExploredGate: boolean = true;

  // Callbacks
  public onAnimationPhaseChange: ((phase: string) => void) | null = null;

  constructor(camera: THREE.Camera, cameraController: CameraController) {
    this.camera = camera;
    this.cameraController = cameraController;
  }

  /**
   * Set the scene reference for adding/removing effects
   */
  setScene(scene: THREE.Scene): void {
    this.scene = scene;
  }

  /**
   * Set the scene manager reference for accessing exit gate
   */
  setSceneManager(sceneManager: any): void {
    this.sceneManager = sceneManager;
  }

  /**
   * Start gate travel animation - quick movement through gate and starfield
   */
  startTravel(
    systemViewDistance: number,
    exitGateId: string,
    onComplete?: () => void,
    isExploredGate: boolean = true,
    entryGateMesh?: THREE.Group
  ): void {
    this.entryGateStartDistance = this.cameraController.getCameraDistance();
    this.systemViewDistance = systemViewDistance;
    this.exitGateId = exitGateId;
    this.travelCompleteCallback = onComplete || null;
    this.isExploredGate = isExploredGate;

    this.isTraveling = true;
    this.travelStartTime = performance.now();

    // Store entry gate position
    if (entryGateMesh) {
      // Get world position of the gate
      entryGateMesh.getWorldPosition(this.entryGatePosition);
      
      // Store current camera target (for zoom-in)
      this.entryGateStartTarget.copy(this.cameraController.getCameraTarget());
      
      // Calculate travel direction: from camera through gate and beyond
      // Direction is from camera to gate, which we'll continue through
      const cameraToGate = new THREE.Vector3()
        .subVectors(this.entryGatePosition, this.camera.position)
        .normalize();
      
      // Use the direction from camera to gate as travel direction
      // This ensures we go through the gate in the correct direction
      this.travelDirection.copy(cameraToGate);
      
      // Store start position (current camera position)
      this.travelStartPosition.copy(this.camera.position);
    } else {
      // Fallback: use camera forward direction
      this.camera.getWorldDirection(this.travelDirection);
      this.travelStartPosition.copy(this.camera.position);
      this.entryGatePosition.copy(this.camera.position);
      this.entryGateStartTarget.copy(this.cameraController.getCameraTarget());
    }
  }

  /**
   * Update animation state (call every frame)
   * @returns Object with current phase and completion status
   */
  update(): { phase: string; progress: number; isComplete: boolean } {
    // Handle exit gate animation first (if active)
    if (this.isExitingGate) {
      return this.updateExitAnimation();
    }
    
    if (!this.isTraveling) {
      return { phase: "idle", progress: 0, isComplete: false };
    }

    const elapsed = performance.now() - this.travelStartTime;
    const progress = Math.min(elapsed / this.travelDuration, 1);

    // Phase 1 (0-30%): Quickly zoom into gate
    if (progress < 0.3) {
      const zoomInProgress = progress / 0.3;
      const easedZoomIn = this.easeInOutCubic(zoomInProgress);

      // Zoom into the entry gate by reducing distance
      const currentDistance =
        this.entryGateStartDistance +
        (this.entryGateTargetDistance - this.entryGateStartDistance) *
          easedZoomIn;

      // Use the pre-calculated travel direction (camera to gate)
      // Position camera along this direction, at the specified distance from gate
      const gatePosition = this.entryGatePosition.clone();
      const cameraOffset = this.travelDirection.clone().multiplyScalar(-currentDistance);
      const newCameraPosition = gatePosition.clone().add(cameraOffset);
      
      // Update camera position and look at gate
      this.camera.position.copy(newCameraPosition);
      this.camera.lookAt(this.entryGatePosition);
      
      // Update camera controller to match
      this.cameraController.setCameraTarget(this.entryGatePosition);
      this.cameraController.setCameraDistance(currentDistance);

      return { phase: "zoom-in", progress: zoomInProgress, isComplete: false };
    }

    // Phase 2 (30-100%): Move forward through gate and starfield
    const travelProgress = (progress - 0.3) / 0.7;
    const easedTravel = travelProgress; // Linear for consistent speed

    // Start from gate position (where we ended zoom-in)
    const gatePosition = this.entryGatePosition.clone();
    
    // Move camera forward through the gate in the travel direction
    // Travel further during this phase - move through the gate and into starfield
    const travelDistance = 10000; // Move forward 10000 units through starfield
    const forwardOffset = this.travelDirection.clone().multiplyScalar(
      travelDistance * easedTravel
    );
    
    // Update camera position - move forward from gate position
    const newPosition = gatePosition.clone().add(forwardOffset);
    
    // Update camera target to move forward as well (so camera continues looking forward)
    const newTarget = gatePosition.clone().add(forwardOffset.clone().multiplyScalar(1.1));
    
    // Update camera controller's target position
    this.cameraController.setCameraTarget(newTarget);
    
    // Set camera position directly (no lerp) for immediate movement
    this.camera.position.copy(newPosition);
    
    // Make camera look forward in travel direction
    const lookTarget = newPosition.clone().add(this.travelDirection.clone().multiplyScalar(100));
    this.camera.lookAt(lookTarget);

    if (progress < 1) {
      return { phase: "travel", progress: travelProgress, isComplete: false };
    }

    // Animation complete - position at exit gate and start exit animation
    this.isTraveling = false;

    // Position camera at the exit gate (where we're emerging from) - already zoomed in
    if (this.exitGateId && this.sceneManager) {
      const exitGateMesh = this.sceneManager.getGateMesh(this.exitGateId);
      if (exitGateMesh) {
        // Get exit gate position
        exitGateMesh.getWorldPosition(this.exitGatePosition);
        
        // Calculate exit direction: from gate outward (opposite of travel direction)
        // We want to exit in the same direction we came from, but now looking outward
        this.exitGateExitDirection.copy(this.travelDirection);
        
        // Position camera very close to exit gate, looking outward
        const exitCameraOffset = this.exitGateExitDirection.clone().multiplyScalar(-5);
        const exitCameraPosition = this.exitGatePosition.clone().add(exitCameraOffset);
        
        this.camera.position.copy(exitCameraPosition);
        this.camera.lookAt(this.exitGatePosition);
        
        // Update camera controller
        this.cameraController.setCameraTarget(this.exitGatePosition);
        this.cameraController.setCameraDistance(5);
        
        // Get star position for smooth transition
        if (this.sceneManager) {
          const system = this.sceneManager.getSystem ? this.sceneManager.getSystem() : null;
          if (system && system.star) {
            // Store star ID for selection
            this.starId = system.star.id;
            
            // Try to get star mesh - bodies is private, but we can access it via any type
            const starMesh = (this.sceneManager as any).bodies?.get(system.star.id);
            if (starMesh) {
              starMesh.getWorldPosition(this.starPosition);
              // Calculate target distance for star (same as centerOnObject does)
              const starRadius = starMesh instanceof THREE.Mesh && starMesh.geometry.boundingSphere
                ? starMesh.geometry.boundingSphere.radius
                : 10;
              this.starTargetDistance = starRadius * 5;
            } else {
              // Fallback: star is at origin (0,0,0) in system view
              this.starPosition.set(0, 0, 0);
              // Estimate star size based on star type
              const starRadius = system.star.radius || 10;
              this.starTargetDistance = starRadius * 5;
            }
          }
        }
        
        // Start exit animation
        this.isExitingGate = true;
        this.exitStartTime = performance.now();
        
        // Call completion callback now (system is loaded)
        if (this.travelCompleteCallback) {
          this.travelCompleteCallback();
          this.travelCompleteCallback = null;
        }
        
        return { phase: "exit-gate", progress: 0, isComplete: false };
      } else {
        // Fallback to system view if gate not found
        this.cameraController.setSystemView(this.systemViewDistance);
      }
    } else {
      // Fallback to system view if no exit gate specified
      this.cameraController.setSystemView(this.systemViewDistance);
    }

    // Call completion callback
    if (this.travelCompleteCallback) {
      this.travelCompleteCallback();
      this.travelCompleteCallback = null;
    }

    return { phase: "complete", progress: 1, isComplete: true };
  }

  /**
   * Update exit gate animation (moving outward from exit gate and transitioning to star)
   */
  updateExitAnimation(): { phase: string; progress: number; isComplete: boolean } {
    if (!this.isExitingGate) {
      return { phase: "idle", progress: 0, isComplete: false };
    }

    const elapsed = performance.now() - this.exitStartTime;
    const progress = Math.min(elapsed / this.exitDuration, 1);
    
    if (progress < 1) {
      // First half: move outward from gate
      // Second half: transition to star
      const exitProgress = progress;
      const easedExit = this.easeInOutCubic(exitProgress);
      
      // Transition from gate to star
      // 0-0.5: Move outward from gate
      // 0.5-1: Transition to star
      const gateToStarTransition = Math.max(0, (progress - 0.5) * 2); // 0 to 1 from 0.5 to 1.0
      const easedTransition = this.easeInOutCubic(gateToStarTransition);
      
      // Start close to gate (distance 5)
      const startDistance = 5;
      // End at star viewing distance
      const endDistance = this.starTargetDistance > 0 ? this.starTargetDistance : 100;
      
      // First half: move outward from gate
      if (progress < 0.5) {
        const outwardProgress = progress * 2; // 0 to 1
        const easedOutward = this.easeInOutCubic(outwardProgress);
        const currentDistance = startDistance + (100 - startDistance) * easedOutward;
        
        // Position camera moving outward from gate
        const gatePosition = this.exitGatePosition.clone();
        const cameraOffset = this.exitGateExitDirection.clone().multiplyScalar(-currentDistance);
        const newCameraPosition = gatePosition.clone().add(cameraOffset);
        
        this.camera.position.copy(newCameraPosition);
        this.camera.lookAt(this.exitGatePosition);
        
        // Update camera controller
        this.cameraController.setCameraTarget(this.exitGatePosition);
        this.cameraController.setCameraDistance(currentDistance);
      } else {
        // Second half: transition to star
        // Interpolate camera position from gate area to star area
        const gateCameraPosition = this.exitGatePosition.clone()
          .add(this.exitGateExitDirection.clone().multiplyScalar(-100));
        
        // Calculate star camera position (at star viewing distance)
        const starDirection = new THREE.Vector3()
          .subVectors(this.starPosition, gateCameraPosition)
          .normalize();
        const starCameraPosition = this.starPosition.clone()
          .add(starDirection.clone().multiplyScalar(-endDistance));
        
        // Interpolate position
        const currentPosition = new THREE.Vector3().lerpVectors(
          gateCameraPosition,
          starCameraPosition,
          easedTransition
        );
        
        // Interpolate target from gate to star
        const currentTarget = new THREE.Vector3().lerpVectors(
          this.exitGatePosition,
          this.starPosition,
          easedTransition
        );
        
        // Interpolate distance
        const currentDistance = 100 + (endDistance - 100) * easedTransition;
        
        this.camera.position.copy(currentPosition);
        this.camera.lookAt(currentTarget);
        
        // Update camera controller
        this.cameraController.setCameraTarget(currentTarget);
        this.cameraController.setCameraDistance(currentDistance);
      }
      
      return { phase: "exit-gate", progress: exitProgress, isComplete: false };
    }
    
    // Exit animation complete - camera should now be at star
    this.isExitingGate = false;
    
    // Ensure camera is positioned at star
    if (this.starTargetDistance > 0) {
      this.cameraController.setCameraTarget(this.starPosition);
      this.cameraController.setCameraDistance(this.starTargetDistance);
    }
    
    // Select the star (this will trigger selection callbacks and update HUD)
    if (this.starId && this.sceneManager && this.sceneManager.centerOnObject) {
      this.sceneManager.centerOnObject(this.starId);
    }
    
    return { phase: "exit-complete", progress: 1, isComplete: true };
  }

  /**
   * Position camera near exit gate
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
    return this.isTraveling || this.isExitingGate;
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
   * Get current camera shake offset (now always zero - no shake)
   */
  getCameraShakeOffset(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, 0);
  }

  /**
   * Get current animation state (for external monitoring)
   */
  getAnimationState(): {
    phase: string;
    progress: number;
    isComplete: boolean;
  } {
    if (!this.isTraveling) {
      return { phase: "idle", progress: 0, isComplete: false };
    }

    const elapsed = performance.now() - this.travelStartTime;
    const progress = Math.min(elapsed / this.travelDuration, 1);

    // Determine current phase based on progress
    if (progress < 0.3) {
      return { phase: "zoom-in", progress: progress / 0.3, isComplete: false };
    } else if (progress < 1) {
      return {
        phase: "travel",
        progress: (progress - 0.3) / 0.7,
        isComplete: false,
      };
    }

    return { phase: "complete", progress: 1, isComplete: true };
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
    this.travelCompleteCallback = null;
    this.onAnimationPhaseChange = null;
    this.scene = null;
  }
}
