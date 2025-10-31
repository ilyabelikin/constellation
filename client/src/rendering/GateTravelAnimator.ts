import * as THREE from "three";
import { CameraController } from "./CameraController.js";

/**
 * Manages gate travel animation effects with hyperspace visuals
 */
export class GateTravelAnimator {
  private camera: THREE.Camera;
  private cameraController: CameraController;
  private scene: THREE.Scene | null = null;

  // Animation state
  private isTraveling = false;
  private travelStartTime = 0;
  private travelDuration = 3500; // 3.5 seconds for more dramatic effect
  private flashPlane: THREE.Mesh | null = null;
  private travelCompleteCallback: (() => void) | null = null;

  // Animation parameters
  private entryGateStartDistance = 0;
  private entryGateTargetDistance = 5; // Close but not too close to see the gate structure
  private exitGateStartDistance = 10;
  private systemViewDistance = 10;

  // Hyperspace effects
  private hyperspaceParticles: THREE.Points | null = null;
  private tunnelMesh: THREE.Mesh | null = null;
  private starStreaks: THREE.Mesh[] = []; // Changed to Mesh for better visibility
  private glowRings: THREE.Mesh[] = [];
  private hyperspaceSquares: THREE.Mesh[] = []; // Fast-moving squares
  private cameraShakeOffset: THREE.Vector3 = new THREE.Vector3();
  private originalCameraPosition: THREE.Vector3 = new THREE.Vector3();
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
   * Start gate travel animation with hyperspace effects
   */
  startTravel(
    systemViewDistance: number,
    exitGateId: string,
    onComplete?: () => void,
    isExploredGate: boolean = true
  ): void {
    this.entryGateStartDistance = this.cameraController.getCameraDistance();
    this.systemViewDistance = systemViewDistance;
    this.exitGateId = exitGateId;
    this.travelCompleteCallback = onComplete || null;
    this.isExploredGate = isExploredGate;

    // Set gate color based on exploration status
    this.gateColor = new THREE.Color(isExploredGate ? 0xfbbf24 : 0xa855f7);

    this.isTraveling = true;
    this.travelStartTime = performance.now();

    // Store original camera position for shake effect
    this.originalCameraPosition.copy(this.camera.position);

    this.createFlash();
    this.createHyperspaceEffects();
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

    // Phase 1 (0-25%): Zoom into entry gate with camera shake
    if (progress < 0.25) {
      const zoomInProgress = progress / 0.25;
      const easedZoomIn = this.easeInOutCubic(zoomInProgress);

      // Smoothly zoom into the entry gate
      const currentDistance =
        this.entryGateStartDistance +
        (this.entryGateTargetDistance - this.entryGateStartDistance) *
          easedZoomIn;

      this.cameraController.setCameraDistance(currentDistance);

      // Fade in flash and start color shift
      this.updateFlashOpacity(zoomInProgress * 0.3);
      this.updateFlashColor(zoomInProgress);

      // Gentle camera shake as we approach
      this.applyCameraShake(zoomInProgress * 0.5);

      // Update hyperspace effects
      this.updateHyperspaceEffects(progress, "approach");

      return { phase: "zoom-in", progress: zoomInProgress, isComplete: false };
    }

    // Phase 2 (25-35%): Enter hyperspace tunnel - acceleration phase
    if (progress < 0.35) {
      const hyperspaceProgress = (progress - 0.25) / 0.1;

      // Intense flash and color shift to blue/purple
      this.updateFlashOpacity(0.3 + hyperspaceProgress * 0.4);
      this.updateFlashColor(1.0 + hyperspaceProgress);

      // Increase camera shake during acceleration
      this.applyCameraShake(0.5 + hyperspaceProgress * 1.5);

      // Hyperspace tunnel effect intensifies
      this.updateHyperspaceEffects(progress, "acceleration");

      return {
        phase: "hyperspace-enter",
        progress: hyperspaceProgress,
        isComplete: false,
      };
    }

    // Phase 3 (35-65%): Full hyperspace travel - peak speed
    if (progress < 0.65) {
      const travelProgress = (progress - 0.35) / 0.3;

      // Peak flash intensity with color cycling
      this.updateFlashOpacity(
        0.7 + Math.sin(travelProgress * Math.PI * 4) * 0.2
      );
      this.updateFlashColor(2.0 + travelProgress * 2);

      // Maximum camera shake and motion blur
      this.applyCameraShake(2.0 + Math.sin(travelProgress * Math.PI * 8) * 0.5);

      // Full hyperspace tunnel effect
      this.updateHyperspaceEffects(progress, "travel");

      return {
        phase: "hyperspace-travel",
        progress: travelProgress,
        isComplete: false,
      };
    }

    // Phase 4 (65-80%): Exit hyperspace - deceleration
    if (progress < 0.8) {
      const exitProgress = (progress - 0.65) / 0.15;
      const easedExit = this.easeInOutCubic(exitProgress);

      // Flash fades with white burst
      this.updateFlashOpacity(
        0.7 - easedExit * 0.7 + (exitProgress < 0.3 ? 0.3 : 0)
      );
      this.updateFlashColor(4.0 - easedExit * 2);

      // Reduce camera shake
      this.applyCameraShake(2.0 - easedExit * 2.0);

      // Hyperspace effects fade out
      this.updateHyperspaceEffects(progress, "deceleration");

      return {
        phase: "hyperspace-exit",
        progress: exitProgress,
        isComplete: false,
      };
    }

    // Phase 5 (80-100%): Zoom out to system view
    if (progress < 1) {
      const zoomOutProgress = (progress - 0.8) / 0.2;
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

      // Fade out flash completely
      this.updateFlashOpacity(Math.max(0, (1 - zoomOutProgress) * 0.5));

      // Clear camera shake
      this.applyCameraShake(0);

      // Remove hyperspace effects
      this.updateHyperspaceEffects(progress, "complete");

      return { phase: "zoom-out", progress: easedZoomOut, isComplete: false };
    }

    // Animation complete
    this.isTraveling = false;
    this.removeFlash();
    this.removeHyperspaceEffects();

    // Position camera at the exit gate (where we're emerging from)
    // This gives a smooth starting point for the next camera transition
    if (this.exitGateId && this.sceneManager) {
      const exitGateMesh = this.sceneManager.getGateMesh(this.exitGateId);
      if (exitGateMesh) {
        // Position camera at the exit gate with appropriate distance
        this.cameraController.positionAtObject(
          this.exitGateId,
          exitGateMesh,
          25 // Same distance as gate zoom in CameraController
        );
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
   * Get current camera shake offset
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
    if (progress < 0.25) {
      return { phase: "zoom-in", progress: progress / 0.25, isComplete: false };
    } else if (progress < 0.35) {
      return {
        phase: "hyperspace-enter",
        progress: (progress - 0.25) / 0.1,
        isComplete: false,
      };
    } else if (progress < 0.65) {
      return {
        phase: "hyperspace-travel",
        progress: (progress - 0.35) / 0.3,
        isComplete: false,
      };
    } else if (progress < 0.8) {
      return {
        phase: "hyperspace-exit",
        progress: (progress - 0.65) / 0.15,
        isComplete: false,
      };
    } else if (progress < 1) {
      return {
        phase: "zoom-out",
        progress: (progress - 0.8) / 0.2,
        isComplete: false,
      };
    }

    return { phase: "complete", progress: 1, isComplete: true };
  }

  /**
   * Create flash plane with color cycling capability
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
   * Update flash color for hyperspace effect - using gate color
   */
  private updateFlashColor(colorProgress: number): void {
    if (!this.flashPlane) return;

    const material = this.flashPlane.material as THREE.MeshBasicMaterial;

    // Blend from white to gate color and back
    if (colorProgress < 1) {
      // White to gate color
      const t = colorProgress;
      material.color.lerpColors(new THREE.Color(0xffffff), this.gateColor, t);
    } else if (colorProgress < 2) {
      // Stay at gate color with slight brightness pulsing
      const t = (colorProgress - 1) * Math.PI * 2;
      const brightness = 1.0 + Math.sin(t) * 0.3;
      material.color.copy(this.gateColor).multiplyScalar(brightness);
    } else if (colorProgress < 3) {
      // Gate color to brighter version
      const t = colorProgress - 2;
      const brightColor = this.gateColor.clone().multiplyScalar(1.5);
      material.color.lerpColors(this.gateColor, brightColor, t);
    } else {
      // Back to white
      const t = Math.min(1, colorProgress - 3);
      material.color.lerpColors(
        this.gateColor.clone().multiplyScalar(1.5),
        new THREE.Color(0xffffff),
        t
      );
    }
  }

  /**
   * Apply camera shake effect - more intense!
   */
  private applyCameraShake(intensity: number): void {
    if (intensity <= 0) {
      this.cameraShakeOffset.set(0, 0, 0);
      return;
    }

    // Random shake offset with multiple frequencies for more chaotic feel
    const time = performance.now() * 0.01;
    const fastShake = Math.sin(time * 15) * 0.3; // High frequency shake
    this.cameraShakeOffset.set(
      (Math.sin(time * 2.3) + fastShake) * intensity * 1.2,
      (Math.cos(time * 3.1) + Math.sin(time * 8)) * intensity * 1.2,
      Math.sin(time * 1.7) * intensity * 0.8
    );
  }

  /**
   * Create hyperspace effect with fast-moving SQUARES in gate color!
   */
  private createHyperspaceEffects(): void {
    if (!this.scene) return;

    // Create 150 fast-moving SQUARES (not rectangles) in gate color
    for (let i = 0; i < 150; i++) {
      // Random position in a circle around the camera
      const angle = Math.random() * Math.PI * 2;
      const radius = 5 + Math.random() * 30;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const startZ = -20 - Math.random() * 60;

      // Random square size (but always square!)
      const size = 0.8 + Math.random() * 2.5;
      const geometry = new THREE.PlaneGeometry(size, size);

      const material = new THREE.MeshBasicMaterial({
        color: this.gateColor,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });

      const square = new THREE.Mesh(geometry, material);
      square.position.set(x, y, startZ);

      // Face the camera
      square.lookAt(0, 0, 0);

      // Store random rotation speed for each square
      square.userData.rotationSpeed = (Math.random() - 0.5) * 0.1;
      square.userData.speedMultiplier = 0.7 + Math.random() * 0.6;

      this.camera.add(square);
      this.hyperspaceSquares.push(square);
    }

    // Create simple radial blur effect with gate color
    this.createRadialBlur();

    // Create 5 expanding rings with gate color
    this.createGlowRings();
  }

  /**
   * Create a simple radial blur/vortex effect using gate color
   */
  private createRadialBlur(): void {
    if (!this.camera) return;

    const geometry = new THREE.PlaneGeometry(120, 120);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        time: { value: 0 },
        intensity: { value: 0 },
        gateColor: { value: this.gateColor },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float intensity;
        uniform vec3 gateColor;
        varying vec2 vUv;
        
        void main() {
          vec2 center = vec2(0.5, 0.5);
          vec2 pos = vUv - center;
          float dist = length(pos);
          float angle = atan(pos.y, pos.x);
          
          // Radial streaks emanating from center
          float streaks = sin(angle * 12.0 + time * 4.0) * 0.5 + 0.5;
          streaks = smoothstep(0.45, 0.55, streaks);
          
          // Radial fade - bright in center
          float radial = 1.0 - smoothstep(0.0, 0.7, dist);
          radial = pow(radial, 3.0);
          
          // Use gate color
          vec3 color = gateColor;
          
          float alpha = streaks * radial * intensity * 0.6;
          
          gl_FragColor = vec4(color * 2.5, alpha);
        }
      `,
    });

    this.tunnelMesh = new THREE.Mesh(geometry, material);
    this.camera.add(this.tunnelMesh);
    this.tunnelMesh.position.set(0, 0, -15);
  }

  /**
   * Create 5 MASSIVE glowing rings in gate color
   */
  private createGlowRings(): void {
    if (!this.camera) return;

    // 5 rings with gate color (varying brightness)
    for (let i = 0; i < 5; i++) {
      const geometry = new THREE.RingGeometry(8, 14, 64); // Thick rings: 8-14 radius

      // Vary brightness of gate color
      const ringColor = this.gateColor.clone().multiplyScalar(0.8 + i * 0.1);

      const material = new THREE.MeshBasicMaterial({
        color: ringColor,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const ring = new THREE.Mesh(geometry, material);
      this.camera.add(ring);
      ring.position.set(0, 0, -12 - i * 12); // Closer together
      this.glowRings.push(ring);
    }
  }

  /**
   * Update hyperspace effects - SQUARES MOVING FAST!
   */
  private updateHyperspaceEffects(progress: number, phase: string): void {
    const time = (performance.now() - this.travelStartTime) * 0.001;

    // Update SQUARES - fast moving towards camera!
    this.hyperspaceSquares.forEach((square, index) => {
      const material = square.material as THREE.MeshBasicMaterial;
      const stagger = index * 0.005;

      if (phase === "approach") {
        // Fade in gradually - squares start appearing from the gate
        const fadeProgress = Math.max(0, (progress - stagger) * 4);
        material.opacity = Math.min(0.8, fadeProgress);

        // Slowly start moving
        square.position.z += 0.5 * square.userData.speedMultiplier;

        // Subtle rotation
        square.rotation.z += square.userData.rotationSpeed * 0.5;
      } else if (phase === "acceleration") {
        // MORE squares appear, moving faster
        material.opacity = 0.9;

        // Speed up!
        const speed = 3.0 + (progress - 0.25) * 20;
        square.position.z += speed * square.userData.speedMultiplier;

        // Rotate faster
        square.rotation.z += square.userData.rotationSpeed * 2;

        // Wrap around when they pass the camera
        if (square.position.z > 50) {
          square.position.z = -80;
        }
      } else if (phase === "travel") {
        // MAXIMUM speed and brightness - RUSHING past!
        material.opacity = 1.0;

        // VERY FAST movement
        const speed = 8.0;
        square.position.z += speed * square.userData.speedMultiplier;

        // Fast rotation
        square.rotation.z += square.userData.rotationSpeed * 3;

        // Wrap around when they pass the camera
        if (square.position.z > 50) {
          square.position.z = -80;
        }
      } else if (phase === "deceleration") {
        // Slow down and fade
        const slowProgress = (progress - 0.65) / 0.15;
        material.opacity = Math.max(0, 1.0 - slowProgress);

        // Decelerate
        const speed = 8.0 * (1 - slowProgress * 0.7);
        square.position.z += speed * square.userData.speedMultiplier;

        square.rotation.z +=
          square.userData.rotationSpeed * (3 - slowProgress * 2);

        if (square.position.z > 50) {
          square.position.z = -80;
        }
      } else if (phase === "complete") {
        // Fade out
        material.opacity = Math.max(0, material.opacity - 0.08);
      }
    });

    // Update radial blur with gate color
    if (this.tunnelMesh) {
      const material = this.tunnelMesh.material as THREE.ShaderMaterial;
      material.uniforms.time.value = time;

      if (phase === "approach") {
        material.uniforms.intensity.value = progress * 1.5;
      } else if (phase === "acceleration") {
        material.uniforms.intensity.value = 1.5 + (progress - 0.25) * 4;
      } else if (phase === "travel") {
        material.uniforms.intensity.value = 5.5;
      } else if (phase === "deceleration") {
        material.uniforms.intensity.value = Math.max(
          0,
          5.5 - (progress - 0.65) * 15
        );
      } else {
        material.uniforms.intensity.value = 0;
      }
    }

    // Update rings - expand dramatically with gate color
    this.glowRings.forEach((ring, index) => {
      const material = ring.material as THREE.MeshBasicMaterial;
      const cycleTime = (time * 1.2 + index * 0.4) % 1;

      if (phase === "travel" || phase === "acceleration") {
        // Rings continuously expand from small to HUGE
        ring.scale.setScalar(1 + cycleTime * 20); // Expand 20x!
        // Keep them MORE visible as they expand
        material.opacity = Math.max(0.3, (1 - cycleTime) * 1.0);
      } else if (phase === "approach") {
        material.opacity = progress * 0.8;
        ring.scale.setScalar(1 + progress * 2);
      } else {
        material.opacity = Math.max(0, material.opacity - 0.05);
      }
    });
  }

  /**
   * Remove all hyperspace effects
   */
  private removeHyperspaceEffects(): void {
    if (this.tunnelMesh) {
      this.camera.remove(this.tunnelMesh);
      this.tunnelMesh.geometry.dispose();
      (this.tunnelMesh.material as THREE.Material).dispose();
      this.tunnelMesh = null;
    }

    this.glowRings.forEach((ring) => {
      this.camera.remove(ring);
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
    });
    this.glowRings = [];

    this.starStreaks.forEach((streak) => {
      this.camera.remove(streak);
      streak.geometry.dispose();
      (streak.material as THREE.Material).dispose();
    });
    this.starStreaks = [];

    this.hyperspaceSquares.forEach((square) => {
      this.camera.remove(square);
      square.geometry.dispose();
      (square.material as THREE.Material).dispose();
    });
    this.hyperspaceSquares = [];
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
    this.removeHyperspaceEffects();
    this.travelCompleteCallback = null;
    this.onAnimationPhaseChange = null;
    this.scene = null;
  }
}
