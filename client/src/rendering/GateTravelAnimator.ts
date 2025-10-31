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

  // Hyperspace effects
  private hyperspaceSquares: THREE.Mesh[] = []; // Fast-moving spheres rushing towards camera
  private hyperspacePlanes: THREE.Mesh[] = []; // Fast-moving squares (planes) with color variation
  private hyperspaceStreaks: THREE.Line[] = []; // Streak lines from dots moving through hyperspace
  private entryGateMesh: THREE.Group | null = null; // Reference to entry gate for expansion effect
  private entryGateOriginalScale: THREE.Vector3 = new THREE.Vector3(1, 1, 1);
  private cameraShakeOffset: THREE.Vector3 = new THREE.Vector3(); // Camera shake for hyperspace
  private originalBackgroundColor: THREE.Color | null = null; // Store original scene background color
  
  private exitGateId: string | null = null;
  private sceneManager: any = null; // Reference to SceneManager for accessing gates
  private gateColor: THREE.Color = new THREE.Color(0xfbbf24); // Default to yellow (explored)
  private isExploredGate: boolean = true;
  private startColor: THREE.Color = new THREE.Color(0xa855f7); // Purple for unexplored gates
  private endColor: THREE.Color = new THREE.Color(0xff8c00); // Orange by the end

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

    // Set start color: purple for unexplored, yellow for explored
    this.startColor = new THREE.Color(isExploredGate ? 0xfbbf24 : 0xa855f7);
    // End color: orange/yellow (always transitions to orange)
    this.endColor = new THREE.Color(0xff8c00);
    this.gateColor = this.startColor.clone(); // Initialize with start color
    
    // Store original background color for later restoration
    if (this.scene) {
      if (this.scene.background instanceof THREE.Color) {
        this.originalBackgroundColor = this.scene.background.clone();
      } else {
        this.originalBackgroundColor = new THREE.Color(0x000000);
      }
    }
    
    console.log("Gate travel colors - explored:", isExploredGate, "startColor:", this.startColor.getHexString(), "endColor:", this.endColor.getHexString());

    this.isTraveling = true;
    this.travelStartTime = performance.now();

    // Store entry gate position
    if (entryGateMesh) {
      // Store gate mesh reference for expansion effect
      this.entryGateMesh = entryGateMesh;
      this.entryGateOriginalScale.copy(entryGateMesh.scale);
      
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

    // Phase 2 (30-100%): Move forward through gate and starfield with hyperspace effects
    const travelProgress = (progress - 0.3) / 0.7;
    const easedTravel = travelProgress; // Linear for consistent speed

    // Create hyperspace effects when entering travel phase (only once)
    if (travelProgress >= 0 && this.hyperspaceSquares.length === 0) {
      console.log("Creating hyperspace effects");
      this.createHyperspaceEffects();
      this.createHyperspacePlanes();
      this.createHyperspaceStreaks();
      
      // Set scene background to gate color after we've moved inside the gate
      if (this.scene && this.originalBackgroundColor) {
        // Set background to gate color (darker/more saturated version)
        const bgColor = this.startColor.clone();
        const hsl = { h: 0, s: 0, l: 0 };
        bgColor.getHSL(hsl);
        // Make background darker and more saturated for "inside gate" feeling
        const bgColorDark = new THREE.Color().setHSL(
          hsl.h,
          Math.min(1.0, hsl.s * 1.2), // More saturated
          hsl.l * 0.15 // Much darker (15% of original lightness)
        );
        this.scene.background = bgColorDark;
        console.log("Set scene background to gate color (inside gate):", bgColorDark.getHexString());
      }
    }

    // Expand gate as we approach (peaks at 50% through travel)
    if (this.entryGateMesh) {
      const expansionProgress = Math.min(travelProgress * 2, 1); // 0 to 1 during first half
      const easedExpansion = this.easeInOutCubic(expansionProgress);
      const maxScale = 4.0; // Gate expands to 4x size for more dramatic effect
      const currentScale = 1 + (maxScale - 1) * easedExpansion;
      
      // Fade out gate expansion after peak
      const fadeProgress = Math.max(0, (travelProgress - 0.5) * 2); // 0 to 1 in second half
      const finalScale = maxScale * (1 - fadeProgress * 0.7); // Shrink back but stay large
      
      const scale = travelProgress < 0.5 ? currentScale : finalScale;
      this.entryGateMesh.scale.setScalar(scale);
      
      // Debug log first expansion
      if (travelProgress < 0.05) {
        console.log(`Gate expanding, scale: ${scale.toFixed(2)}, progress: ${travelProgress.toFixed(2)}`);
      }
    }

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
    
    // Apply camera shake during travel - more intense as speed increases
    const shakeIntensity = 0.5 + travelProgress * 2.0; // Increases from 0.5 to 2.5
    this.applyCameraShake(shakeIntensity);
    
    // Apply shake offset to camera position
    this.camera.position.add(this.cameraShakeOffset);
    
    // Make camera look forward in travel direction (use position with shake for more dynamic look)
    const lookTarget = this.camera.position.clone().add(this.travelDirection.clone().multiplyScalar(100));
    this.camera.lookAt(lookTarget);

    // Update hyperspace effects
    if (this.hyperspaceSquares.length > 0) {
      this.updateHyperspaceEffects(travelProgress);
    }
    if (this.hyperspacePlanes.length > 0) {
      this.updateHyperspacePlanes(travelProgress);
    }
    if (this.hyperspaceStreaks.length > 0) {
      this.updateHyperspaceStreaks(travelProgress);
    }
    
    // Debug: log shake and streak count periodically
    if (Math.floor(travelProgress * 10) % 2 === 0 && travelProgress < 0.2) {
      console.log(`Travel progress: ${travelProgress.toFixed(2)}, Shake intensity: ${shakeIntensity.toFixed(2)}, Shake offset:`, this.cameraShakeOffset, `Streaks: ${this.hyperspaceStreaks.length}`);
    }

    if (progress < 1) {
      return { phase: "travel", progress: travelProgress, isComplete: false };
    }

    // Animation complete - position at exit gate and start exit animation
    this.isTraveling = false;

    // Clear camera shake
    this.cameraShakeOffset.set(0, 0, 0);

    // Reset scene background to original color
    if (this.scene && this.originalBackgroundColor) {
      this.scene.background = this.originalBackgroundColor.clone();
      console.log("Reset scene background to original color");
    }

    // Clean up hyperspace effects
    this.removeHyperspaceEffects();
    
    // Reset gate scale
    if (this.entryGateMesh) {
      this.entryGateMesh.scale.copy(this.entryGateOriginalScale);
      this.entryGateMesh = null;
    }

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
        
        // Apply light camera shake during exit (fading out)
        const exitShakeIntensity = (1 - progress) * 0.3; // Fades from 0.3 to 0
        this.applyCameraShake(exitShakeIntensity);
        this.camera.position.add(this.cameraShakeOffset);
        
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
        
        // Apply light camera shake during exit (fading out)
        const exitShakeIntensity = (1 - progress) * 0.3; // Fades from 0.3 to 0
        this.applyCameraShake(exitShakeIntensity);
        this.camera.position.add(this.cameraShakeOffset);
        
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
   * Get current camera shake offset (for hyperspace animation)
   */
  getCameraShakeOffset(): THREE.Vector3 {
    return this.cameraShakeOffset;
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
   * Create hyperspace effect with fast-moving PULSING SPHERES rushing towards camera
   */
  private createHyperspaceEffects(): void {
    if (!this.camera || !this.scene) {
      console.error("Cannot create hyperspace effects: missing camera or scene");
      return;
    }

    console.log("Creating hyperspace spheres, gate color:", this.gateColor.getHexString(), "explored:", this.isExploredGate);

    // Get current camera world position for initial placement
    const cameraWorldPos = this.camera.position.clone();
    const cameraForward = new THREE.Vector3();
    this.camera.getWorldDirection(cameraForward);

    // Create 200 fast-moving PULSING SPHERES in gate color
    for (let i = 0; i < 200; i++) {
      // More random distribution - scattered in 3D space ahead of camera
      // Random angle in full sphere
      const theta = Math.random() * Math.PI * 2; // Azimuthal angle
      const phi = Math.acos(2 * Math.random() - 1); // Polar angle (for sphere distribution)
      
      // Random distance ahead of camera (more spread out)
      const aheadDistance = 50 + Math.random() * 500;
      
      // Random radius from center (more scattered)
      const radius = Math.random() * 60; // More spread out
      
      // Calculate position in spherical coordinates then convert
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = aheadDistance + (Math.random() - 0.5) * 200; // Some variation in forward distance
      
      // Apply to camera's coordinate system
      const right = new THREE.Vector3().crossVectors(cameraForward, new THREE.Vector3(0, 1, 0));
      if (right.length() < 0.1) {
        // Fallback if camera is pointing straight up/down
        right.set(1, 0, 0);
      }
      right.normalize();
      const up = new THREE.Vector3().crossVectors(right, cameraForward).normalize();
      
      // Position square in world space
      const aheadOffset = cameraForward.clone().multiplyScalar(z);
      const radialOffset = right.clone().multiplyScalar(x)
        .add(up.clone().multiplyScalar(y));
      
      const spherePosition = cameraWorldPos.clone()
        .add(aheadOffset)
        .add(radialOffset);

      // Random sphere size - make them much smaller
      const baseSize = 0.2 + Math.random() * 0.5; // Much smaller spheres (0.2 to 0.7)
      const geometry = new THREE.SphereGeometry(baseSize, 8, 8);

      // Use start color (purple for unexplored, yellow for explored) - will transition to orange
      const material = new THREE.MeshBasicMaterial({
        color: this.startColor.clone(), // Clone color to ensure it's set correctly
        transparent: true,
        opacity: 0.8 + Math.random() * 0.2, // Slight opacity variation
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      
      if (i === 0) {
        console.log(`First sphere material color:`, material.color.getHexString(), "startColor:", this.startColor.getHexString(), "unexplored:", !this.isExploredGate);
      }

      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.copy(spherePosition);

      // Store random rotation speed and pulse properties for each sphere
      sphere.userData.rotationSpeed = (Math.random() - 0.5) * 0.4;
      sphere.userData.speedMultiplier = 0.5 + Math.random() * 1.0; // More variation
      sphere.userData.initialTheta = theta;
      sphere.userData.initialPhi = phi;
      sphere.userData.baseSize = baseSize;
      sphere.userData.pulseSpeed = 2 + Math.random() * 3; // Pulse speed variation
      sphere.userData.pulsePhase = Math.random() * Math.PI * 2; // Random phase offset

      // Add to scene (world space) so they rush toward camera
      this.scene.add(sphere);
      this.hyperspaceSquares.push(sphere);
    }
    
    console.log(`Created ${this.hyperspaceSquares.length} hyperspace spheres in scene`);
  }

  /**
   * Update hyperspace effects - PULSING SPHERES MOVING FAST!
   */
  private updateHyperspaceEffects(travelProgress: number): void {
    const time = (performance.now() - this.travelStartTime) * 0.001;
    const cameraWorldPos = this.camera.position.clone();
    const cameraForward = new THREE.Vector3();
    this.camera.getWorldDirection(cameraForward);

    // Interpolate color from start (purple/unexplored or yellow/explored) to orange
    // Transition starts earlier for better visibility - start transitioning at 30% instead of 50%
    let colorProgress = 0;
    if (travelProgress > 0.3) {
      // Transition happens from 30% to 100% (70% of the journey)
      // Map 0.3-1 to 0-1
      colorProgress = (travelProgress - 0.3) / 0.7;
    }
    const currentColor = new THREE.Color().lerpColors(this.startColor, this.endColor, colorProgress);
    
    // Debug: log color transition at key points
    if (Math.floor(travelProgress * 20) % 4 === 0) {
      console.log(`[Spheres] Travel progress: ${travelProgress.toFixed(2)}, Color progress: ${colorProgress.toFixed(2)}, Start: ${this.startColor.getHexString()}, End: ${this.endColor.getHexString()}, Current: ${currentColor.getHexString()}`);
    }

    // Update SPHERES - fast moving towards camera with pulsing!
    this.hyperspaceSquares.forEach((sphere, index) => {
      const material = sphere.material as THREE.MeshBasicMaterial;
      
      // Update color based on travel progress
      material.color.copy(currentColor);
      // Ensure material updates (needed for some Three.js versions)
      material.needsUpdate = true;
      
      // Pulsing effect - size and opacity pulse
      const pulse = Math.sin(time * sphere.userData.pulseSpeed + sphere.userData.pulsePhase);
      const pulseScale = 0.7 + pulse * 0.3; // Pulse between 70% and 100% size
      const pulseOpacity = 0.6 + (pulse * 0.5 + 0.5) * 0.4; // Pulse opacity between 0.6 and 1.0
      
      // Update sphere scale for pulsing
      sphere.scale.setScalar(pulseScale);
      
      // Update opacity with pulsing
      material.opacity = pulseOpacity;

      // VERY FAST movement toward camera
      // Speed increases with travel progress - starts fast, gets faster!
      const baseSpeed = 300.0; // Fast movement
      const speedMultiplier = 1 + travelProgress * 5; // Gets faster as we travel
      const speed = baseSpeed * speedMultiplier * sphere.userData.speedMultiplier;
      
      // Move spheres toward camera (opposite of camera forward direction)
      // Camera moves forward, spheres move backward relative to camera direction
      const moveDirection = cameraForward.clone().negate();
      sphere.position.add(moveDirection.multiplyScalar(speed * 0.016)); // Frame time estimate

      // Slow rotation for spheres
      sphere.rotation.x += sphere.userData.rotationSpeed * 0.5;
      sphere.rotation.y += sphere.userData.rotationSpeed * 0.5;
      sphere.rotation.z += sphere.userData.rotationSpeed * 0.5;

      // Wrap around when they pass the camera - reset ahead of camera
      const distanceToCamera = sphere.position.distanceTo(cameraWorldPos);
      const aheadOfCamera = sphere.position.clone().sub(cameraWorldPos).dot(cameraForward);
      
      if (aheadOfCamera < -100 || distanceToCamera > 1000) {
        // Reset sphere ahead of camera with random distribution
        const theta = sphere.userData.initialTheta + (Math.random() - 0.5) * 1.0;
        const phi = sphere.userData.initialPhi + (Math.random() - 0.5) * 0.5;
        const aheadDistance = 200 + Math.random() * 500;
        const radius = Math.random() * 60;
        
        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi) * Math.sin(theta);
        const z = aheadDistance + (Math.random() - 0.5) * 200;
        
        const right = new THREE.Vector3().crossVectors(cameraForward, new THREE.Vector3(0, 1, 0));
        if (right.length() < 0.1) {
          right.set(1, 0, 0);
        }
        right.normalize();
        const up = new THREE.Vector3().crossVectors(right, cameraForward).normalize();
        
        const aheadOffset = cameraForward.clone().multiplyScalar(z);
        const radialOffset = right.clone().multiplyScalar(x)
          .add(up.clone().multiplyScalar(y));
        sphere.position.copy(cameraWorldPos).add(aheadOffset).add(radialOffset);
        
        // Reset pulse phase for variety
        sphere.userData.pulsePhase = Math.random() * Math.PI * 2;
      }
    });
  }

  /**
   * Create hyperspace squares (planes) with color variation
   */
  private createHyperspacePlanes(): void {
    if (!this.camera || !this.scene) {
      console.error("Cannot create hyperspace planes: missing camera or scene");
      return;
    }

    console.log("Creating hyperspace planes with color variation");

    // Get current camera world position for initial placement
    const cameraWorldPos = this.camera.position.clone();
    const cameraForward = new THREE.Vector3();
    this.camera.getWorldDirection(cameraForward);

    // Create 100 squares (planes) with varying colors
    for (let i = 0; i < 100; i++) {
      // Random distribution in 3D space ahead of camera
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const aheadDistance = 50 + Math.random() * 500;
      const radius = Math.random() * 60;

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = aheadDistance + (Math.random() - 0.5) * 200;

      // Apply to camera's coordinate system
      const right = new THREE.Vector3().crossVectors(cameraForward, new THREE.Vector3(0, 1, 0));
      if (right.length() < 0.1) {
        right.set(1, 0, 0);
      }
      right.normalize();
      const up = new THREE.Vector3().crossVectors(right, cameraForward).normalize();

      const aheadOffset = cameraForward.clone().multiplyScalar(z);
      const radialOffset = right.clone().multiplyScalar(x)
        .add(up.clone().multiplyScalar(y));

      const planePosition = cameraWorldPos.clone()
        .add(aheadOffset)
        .add(radialOffset);

      // Random square size
      const size = 0.5 + Math.random() * 1.5; // 0.5 to 2.0
      const geometry = new THREE.PlaneGeometry(size, size);

      // Create color variation - slightly shift hue from base color
      const baseColor = this.startColor.clone();
      const hsl = { h: 0, s: 0, l: 0 };
      baseColor.getHSL(hsl);
      
      // Vary hue by ±20 degrees and saturation/brightness slightly
      const hueVariation = (Math.random() - 0.5) * 0.11; // ±20 degrees in HSL (0.11 ≈ 20/360)
      const satVariation = (Math.random() - 0.5) * 0.2; // ±20% saturation
      const lightnessVariation = (Math.random() - 0.5) * 0.15; // ±15% lightness
      
      const variedColor = new THREE.Color().setHSL(
        hsl.h + hueVariation,
        Math.max(0.3, Math.min(1.0, hsl.s + satVariation)),
        Math.max(0.4, Math.min(1.0, hsl.l + lightnessVariation))
      );

      const material = new THREE.MeshBasicMaterial({
        color: variedColor,
        transparent: true,
        opacity: 0.7 + Math.random() * 0.3,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const plane = new THREE.Mesh(geometry, material);
      plane.position.copy(planePosition);
      
      // Make plane face camera initially
      plane.lookAt(cameraWorldPos);

      // Store properties
      plane.userData.speedMultiplier = 0.5 + Math.random() * 1.0;
      plane.userData.initialTheta = theta;
      plane.userData.initialPhi = phi;
      plane.userData.baseColor = variedColor.clone(); // Store original color for color transition
      plane.userData.rotationSpeed = (Math.random() - 0.5) * 2.0; // Random rotation speed

      this.scene.add(plane);
      this.hyperspacePlanes.push(plane);
    }
    
    console.log(`Created ${this.hyperspacePlanes.length} hyperspace planes`);
  }

  /**
   * Update hyperspace planes - squares rushing towards camera with color variation
   */
  private updateHyperspacePlanes(travelProgress: number): void {
    const cameraWorldPos = this.camera.position.clone();
    const cameraForward = new THREE.Vector3();
    this.camera.getWorldDirection(cameraForward);

    // Interpolate color from start to end (same as spheres/streaks)
    let colorProgress = 0;
    if (travelProgress > 0.3) {
      // Transition happens from 30% to 100% (70% of the journey)
      // Map 0.3-1 to 0-1
      colorProgress = (travelProgress - 0.3) / 0.7;
    }
    const currentColor = new THREE.Color().lerpColors(this.startColor, this.endColor, colorProgress);

    this.hyperspacePlanes.forEach((plane) => {
      const material = plane.material as THREE.MeshBasicMaterial;
      
      // Blend base varied color with current transition color
      // This preserves the color variation while transitioning
      const baseColor = plane.userData.baseColor as THREE.Color;
      const blendedColor = new THREE.Color().lerpColors(baseColor, currentColor, colorProgress * 0.7);
      material.color.copy(blendedColor);

      // Fast movement toward camera
      const baseSpeed = 300.0;
      const speedMultiplier = 1 + travelProgress * 5;
      const speed = baseSpeed * speedMultiplier * plane.userData.speedMultiplier;

      const moveDirection = cameraForward.clone().negate();
      plane.position.add(moveDirection.multiplyScalar(speed * 0.016));

      // Rotate plane as it moves
      plane.rotation.x += plane.userData.rotationSpeed * 0.016;
      plane.rotation.y += plane.userData.rotationSpeed * 0.016;
      plane.rotation.z += plane.userData.rotationSpeed * 0.016;

      // Keep plane facing camera
      plane.lookAt(cameraWorldPos);

      // Wrap around when they pass the camera
      const distanceToCamera = plane.position.distanceTo(cameraWorldPos);
      const aheadOfCamera = plane.position.clone().sub(cameraWorldPos).dot(cameraForward);

      if (aheadOfCamera < -100 || distanceToCamera > 1000) {
        // Reset plane ahead of camera
        const theta = plane.userData.initialTheta + (Math.random() - 0.5) * 1.0;
        const phi = plane.userData.initialPhi + (Math.random() - 0.5) * 0.5;
        const aheadDistance = 200 + Math.random() * 500;
        const radius = Math.random() * 60;

        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi) * Math.sin(theta);
        const z = aheadDistance + (Math.random() - 0.5) * 200;

        const right = new THREE.Vector3().crossVectors(cameraForward, new THREE.Vector3(0, 1, 0));
        if (right.length() < 0.1) {
          right.set(1, 0, 0);
        }
        right.normalize();
        const up = new THREE.Vector3().crossVectors(right, cameraForward).normalize();

        const aheadOffset = cameraForward.clone().multiplyScalar(z);
        const radialOffset = right.clone().multiplyScalar(x)
          .add(up.clone().multiplyScalar(y));
        plane.position.copy(cameraWorldPos).add(aheadOffset).add(radialOffset);
        plane.lookAt(cameraWorldPos);
      }
    });
  }

  /**
   * Create hyperspace streak lines - dots becoming lines as you move through hyperspace
   */
  private createHyperspaceStreaks(): void {
    if (!this.camera || !this.scene) return;

    console.log("Creating hyperspace streaks");

    // Create 150 streak lines
    for (let i = 0; i < 150; i++) {
      // Random position ahead of camera
      const cameraWorldPos = this.camera.position.clone();
      const cameraForward = new THREE.Vector3();
      this.camera.getWorldDirection(cameraForward);
      
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = Math.random() * 50;
      const aheadDistance = 100 + Math.random() * 400;
      
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = aheadDistance;
      
      const right = new THREE.Vector3().crossVectors(cameraForward, new THREE.Vector3(0, 1, 0));
      if (right.length() < 0.1) {
        right.set(1, 0, 0);
      }
      right.normalize();
      const up = new THREE.Vector3().crossVectors(right, cameraForward).normalize();
      
      const aheadOffset = cameraForward.clone().multiplyScalar(z);
      const radialOffset = right.clone().multiplyScalar(x)
        .add(up.clone().multiplyScalar(y));
      
      const startPosition = cameraWorldPos.clone()
        .add(aheadOffset)
        .add(radialOffset);
      
      // Start as small dots (short lines) that will extend as they move
      // Make initial length longer so they're more visible
      const initialLength = 15 + Math.random() * 20; // Increased from 5-10 to 15-35
      const endPosition = startPosition.clone()
        .add(cameraForward.clone().negate().multiplyScalar(initialLength));
      
      const geometry = new THREE.BufferGeometry().setFromPoints([
        startPosition,
        endPosition
      ]);
      
      const material = new THREE.LineBasicMaterial({
        color: this.startColor.clone(), // Clone color to ensure it's set correctly
        transparent: true,
        opacity: 0.9 + Math.random() * 0.1, // Increased opacity for visibility (0.9-1.0)
        // Note: linewidth doesn't work in WebGL, but we'll make them thicker via geometry
      });
      
      if (i === 0) {
        console.log(`Streak ${i} material color:`, material.color.getHexString(), "startColor:", this.startColor.getHexString());
      }
      
      const line = new THREE.Line(geometry, material);
      line.renderOrder = 1000; // Render on top
      
      // Store properties
      line.userData.speedMultiplier = 0.5 + Math.random() * 1.0;
      line.userData.initialTheta = theta;
      line.userData.initialPhi = phi;
      line.userData.streakLength = initialLength;
      
      this.scene.add(line);
      this.hyperspaceStreaks.push(line);
    }
    
    console.log(`Created ${this.hyperspaceStreaks.length} hyperspace streaks`);
  }

  /**
   * Update hyperspace streak lines - streaks extend as they move, creating "dots becoming lines" effect
   */
  private updateHyperspaceStreaks(travelProgress: number): void {
    // Get camera position AFTER shake is applied (shake is applied in update() before this is called)
    const cameraWorldPos = this.camera.position.clone();
    const cameraForward = new THREE.Vector3();
    this.camera.getWorldDirection(cameraForward);

    // Interpolate color from start (purple/unexplored or yellow/explored) to orange
    // Transition starts earlier for better visibility - start transitioning at 30% instead of 50%
    let colorProgress = 0;
    if (travelProgress > 0.3) {
      // Transition happens from 30% to 100% (70% of the journey)
      // Map 0.3-1 to 0-1
      colorProgress = (travelProgress - 0.3) / 0.7;
    }
    const currentColor = new THREE.Color().lerpColors(this.startColor, this.endColor, colorProgress);
    
    // Debug: log color transition at key points
    if (Math.floor(travelProgress * 20) % 4 === 0) {
      console.log(`[Streaks] Travel progress: ${travelProgress.toFixed(2)}, Color progress: ${colorProgress.toFixed(2)}, Start: ${this.startColor.getHexString()}, End: ${this.endColor.getHexString()}, Current: ${currentColor.getHexString()}`);
    }

    this.hyperspaceStreaks.forEach((line) => {
      const geometry = line.geometry as THREE.BufferGeometry;
      const positions = geometry.attributes.position.array as Float32Array;
      const material = line.material as THREE.LineBasicMaterial;
      
      // Update color based on travel progress
      material.color.copy(currentColor);
      // Ensure material updates (needed for some Three.js versions)
      material.needsUpdate = true;
      
      // Get current start and end positions
      const startPos = new THREE.Vector3(positions[0], positions[1], positions[2]);
      const endPos = new THREE.Vector3(positions[3], positions[4], positions[5]);
      
      // Move streak toward camera
      const baseSpeed = 300.0;
      const speedMultiplier = 1 + travelProgress * 5;
      const speed = baseSpeed * speedMultiplier * line.userData.speedMultiplier;
      
      const moveDirection = cameraForward.clone().negate();
      
      // Store old start position before moving
      const oldStartPos = startPos.clone();
      
      // Move start position (the dot/leading point)
      startPos.add(moveDirection.clone().multiplyScalar(speed * 0.016));
      
      // Extend the line backward - the faster we move, the longer the streak
      // As speed increases, the line extends more, creating the "dot becoming line" effect
      const extensionFactor = 1 + (speed * 0.016 * 0.5); // Line extends based on speed
      const directionToEnd = endPos.clone().sub(oldStartPos).normalize();
      const newEndPos = startPos.clone().add(
        directionToEnd.multiplyScalar(line.userData.streakLength * extensionFactor)
      );
      
      // Update line positions
      positions[0] = startPos.x;
      positions[1] = startPos.y;
      positions[2] = startPos.z;
      positions[3] = newEndPos.x;
      positions[4] = newEndPos.y;
      positions[5] = newEndPos.z;
      
      geometry.attributes.position.needsUpdate = true;
      
      // Update opacity - brighter when closer, fade as they get farther
      const distanceToCamera = startPos.distanceTo(cameraWorldPos);
      // Fade in as they approach, fade out as they pass - make brighter overall
      if (distanceToCamera < 200) {
        material.opacity = Math.max(0.5, distanceToCamera / 200); // Minimum 0.5 opacity
      } else {
        material.opacity = Math.min(1.0, 1.0 - (distanceToCamera - 200) / 800);
      }
      
      // Extend streak length over time (dots become longer lines)
      line.userData.streakLength = Math.min(
        line.userData.streakLength + speed * 0.016 * 0.3,
        200 // Max length
      );
      
      // Wrap around when they pass the camera
      const aheadOfCamera = startPos.clone().sub(cameraWorldPos).dot(cameraForward);
      
      if (aheadOfCamera < -150 || distanceToCamera > 1000) {
        // Reset streak ahead of camera (start as small dot again)
        const theta = line.userData.initialTheta + (Math.random() - 0.5) * 1.0;
        const phi = line.userData.initialPhi + (Math.random() - 0.5) * 0.5;
        const radius = Math.random() * 50;
        const aheadDistance = 200 + Math.random() * 500;
        
        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi) * Math.sin(theta);
        const z = aheadDistance;
        
        const right = new THREE.Vector3().crossVectors(cameraForward, new THREE.Vector3(0, 1, 0));
        if (right.length() < 0.1) {
          right.set(1, 0, 0);
        }
        right.normalize();
        const up = new THREE.Vector3().crossVectors(right, cameraForward).normalize();
        
        const aheadOffset = cameraForward.clone().multiplyScalar(z);
        const radialOffset = right.clone().multiplyScalar(x)
          .add(up.clone().multiplyScalar(y));
        
        const newStartPos = cameraWorldPos.clone()
          .add(aheadOffset)
          .add(radialOffset);
        // Start as a small dot (short line, but longer than before for visibility)
        const initialLength = 15 + Math.random() * 20; // Increased for visibility
        const newEndPos = newStartPos.clone()
          .add(cameraForward.clone().negate().multiplyScalar(initialLength));
        
        positions[0] = newStartPos.x;
        positions[1] = newStartPos.y;
        positions[2] = newStartPos.z;
        positions[3] = newEndPos.x;
        positions[4] = newEndPos.y;
        positions[5] = newEndPos.z;
        
        // Reset streak length
        line.userData.streakLength = initialLength;
        
        geometry.attributes.position.needsUpdate = true;
      }
    });
  }

  /**
   * Remove all hyperspace effects
   */
  private removeHyperspaceEffects(): void {
    this.hyperspaceSquares.forEach((square) => {
      if (this.scene) {
        this.scene.remove(square);
      }
      square.geometry.dispose();
      (square.material as THREE.Material).dispose();
    });
    this.hyperspaceSquares = [];
    
    this.hyperspacePlanes.forEach((plane) => {
      if (this.scene) {
        this.scene.remove(plane);
      }
      plane.geometry.dispose();
      (plane.material as THREE.Material).dispose();
    });
    this.hyperspacePlanes = [];
    
    this.hyperspaceStreaks.forEach((streak) => {
      if (this.scene) {
        this.scene.remove(streak);
      }
      streak.geometry.dispose();
      (streak.material as THREE.Material).dispose();
    });
    this.hyperspaceStreaks = [];
    
    console.log("Removed hyperspace effects");
  }

  /**
   * Apply camera shake effect during hyperspace travel
   */
  private applyCameraShake(intensity: number): void {
    if (intensity <= 0) {
      this.cameraShakeOffset.set(0, 0, 0);
      return;
    }

    // Random shake offset with multiple frequencies for more chaotic feel
    const time = performance.now() * 0.01;
    const fastShake = Math.sin(time * 20) * 0.2; // High frequency shake
    const mediumShake = Math.sin(time * 8) * 0.3; // Medium frequency
    
    // Increase shake magnitude significantly - make it more noticeable
    const shakeMagnitude = intensity * 2.0; // Doubled for more visible shake
    
    this.cameraShakeOffset.set(
      (Math.sin(time * 3.1) + fastShake + mediumShake) * shakeMagnitude,
      (Math.cos(time * 2.7) + Math.sin(time * 11) + fastShake) * shakeMagnitude,
      (Math.sin(time * 1.9) + Math.cos(time * 7)) * shakeMagnitude * 0.8
    );
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
    this.removeHyperspaceEffects();
    this.travelCompleteCallback = null;
    this.onAnimationPhaseChange = null;
    this.scene = null;
  }
}
