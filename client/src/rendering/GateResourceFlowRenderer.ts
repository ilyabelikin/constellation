import * as THREE from "three";

/**
 * Renders animated cargo ships jumping in/out of gates to show resource flow
 */
export class GateResourceFlowRenderer {
  private scene: THREE.Scene;
  private gateFlows: Map<string, GateFlowAnimator> = new Map();
  private time: number = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Update or create resource flow visualization for a gate
   */
  setGateResourceFlow(
    gateId: string,
    gateGroup: THREE.Group,
    energyFlow: number,
    alloyFlow: number,
    scienceFlow: number,
    isBlockaded: boolean
  ): void {
    // Remove existing animations if flow stopped or gate is blockaded
    if (
      (energyFlow === 0 && alloyFlow === 0 && scienceFlow === 0) ||
      isBlockaded
    ) {
      this.removeFlowAnimation(gateId);
      return;
    }

    // Calculate total flow for spawn rate
    const totalFlow = energyFlow + alloyFlow + scienceFlow;

    // Create or update flow animator
    let flowAnimator = this.gateFlows.get(gateId);
    if (!flowAnimator) {
      flowAnimator = new GateFlowAnimator(
        this.scene,
        gateGroup,
        totalFlow
      );
      this.gateFlows.set(gateId, flowAnimator);
    } else {
      flowAnimator.updateFlow(totalFlow);
    }
  }

  /**
   * Remove resource flow visualization for a gate
   */
  removeFlowAnimation(gateId: string): void {
    const flowAnimator = this.gateFlows.get(gateId);
    if (flowAnimator) {
      flowAnimator.dispose();
      this.gateFlows.delete(gateId);
    }
  }

  /**
   * Clear all resource flow visualizations
   */
  clear(): void {
    for (const [gateId, flowAnimator] of this.gateFlows.entries()) {
      flowAnimator.dispose();
    }
    this.gateFlows.clear();
  }

  /**
   * Update all resource flow animations
   */
  update(deltaTime: number): void {
    this.time += deltaTime;
    
    for (const [gateId, flowAnimator] of this.gateFlows.entries()) {
      flowAnimator.update(this.time, deltaTime);
    }
  }
}

/**
 * Animates cargo ships jumping in/out of a single gate
 */
class GateFlowAnimator {
  private scene: THREE.Scene;
  private gateGroup: THREE.Group;
  private totalFlow: number;
  private activeShips: CargoShip[] = [];
  private nextSpawnTime: number = 0;
  private readonly SPAWN_INTERVAL_BASE = 3000; // Base spawn interval in ms
  private readonly ANIMATION_DURATION = 2000; // Ship animation duration in ms

  constructor(scene: THREE.Scene, gateGroup: THREE.Group, totalFlow: number) {
    this.scene = scene;
    this.gateGroup = gateGroup;
    this.totalFlow = totalFlow;
    this.nextSpawnTime = 0; // Spawn first ship immediately
  }

  updateFlow(totalFlow: number): void {
    this.totalFlow = totalFlow;
  }

  update(time: number, deltaTime: number): void {
    // Spawn new ships based on flow rate
    if (time >= this.nextSpawnTime) {
      this.spawnCargoShip(time);
      
      // Calculate next spawn time based on flow (higher flow = more frequent spawns)
      // Flow of 1.0 = spawn every 3 seconds, flow of 10.0 = spawn every 0.5 seconds
      const spawnInterval = Math.max(
        500,
        this.SPAWN_INTERVAL_BASE / Math.max(0.5, this.totalFlow)
      );
      this.nextSpawnTime = time + spawnInterval;
    }

    // Update all active ships
    for (let i = this.activeShips.length - 1; i >= 0; i--) {
      const ship = this.activeShips[i];
      ship.update(time, deltaTime);

      // Remove completed animations
      if (ship.isComplete()) {
        ship.dispose(this.scene);
        this.activeShips.splice(i, 1);
      }
    }
  }

  private spawnCargoShip(time: number): void {
    // Resources flow FROM remote systems TO home, so ships jump OUT of the gate
    const direction: "in" | "out" = "out";
    
    const ship = new CargoShip(
      this.scene,
      this.gateGroup,
      direction,
      time,
      this.ANIMATION_DURATION
    );
    this.activeShips.push(ship);
  }

  dispose(): void {
    for (const ship of this.activeShips) {
      ship.dispose(this.scene);
    }
    this.activeShips = [];
  }
}

/**
 * Single cargo ship animation (jumping in or out of gate)
 */
class CargoShip {
  private mesh: THREE.Group;
  private startTime: number;
  private duration: number;
  private direction: "in" | "out";
  private gateGroup: THREE.Group;
  private startPosition: THREE.Vector3;
  private endPosition: THREE.Vector3;
  private trailParticles: THREE.Points;

  constructor(
    scene: THREE.Scene,
    gateGroup: THREE.Group,
    direction: "in" | "out",
    startTime: number,
    duration: number
  ) {
    this.gateGroup = gateGroup;
    this.direction = direction;
    this.startTime = startTime;
    this.duration = duration;

    // Create cargo ship mesh (simple geometric shape)
    this.mesh = this.createCargoShipMesh();

    // Position ship based on direction
    const gateRadius = 4;
    const spawnDistance = gateRadius * 8;
    
    // Random angle around the gate
    const angle = Math.random() * Math.PI * 2;
    const spawnOffset = new THREE.Vector3(
      Math.cos(angle) * spawnDistance,
      Math.sin(angle) * spawnDistance,
      (Math.random() - 0.5) * 4
    );

    if (direction === "out") {
      // Ship starts at gate and moves away
      this.startPosition = gateGroup.position.clone();
      this.endPosition = gateGroup.position.clone().add(spawnOffset);
    } else {
      // Ship starts away from gate and moves toward it
      this.startPosition = gateGroup.position.clone().add(spawnOffset);
      this.endPosition = gateGroup.position.clone();
    }

    this.mesh.position.copy(this.startPosition);
    
    // Orient ship toward movement direction
    const direction3D = this.endPosition.clone().sub(this.startPosition).normalize();
    this.mesh.lookAt(this.mesh.position.clone().add(direction3D));

    scene.add(this.mesh);

    // Create engine trail
    this.trailParticles = this.createTrailParticles();
    this.mesh.add(this.trailParticles);
  }

  private createCargoShipMesh(): THREE.Group {
    const shipGroup = new THREE.Group();

    // Main hull (elongated box)
    const hullGeometry = new THREE.BoxGeometry(1, 0.5, 2);
    const hullMaterial = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.8,
      roughness: 0.3,
    });
    const hull = new THREE.Mesh(hullGeometry, hullMaterial);
    shipGroup.add(hull);

    // Cargo containers (colored boxes on top)
    const containerGeometry = new THREE.BoxGeometry(0.6, 0.4, 0.6);
    const containerColors = [0x60a5fa, 0x94a3b8, 0xa78bfa]; // Energy, alloy, science colors
    
    for (let i = 0; i < 2; i++) {
      const containerMaterial = new THREE.MeshStandardMaterial({
        color: containerColors[Math.floor(Math.random() * containerColors.length)],
        metalness: 0.5,
        roughness: 0.5,
      });
      const container = new THREE.Mesh(containerGeometry, containerMaterial);
      container.position.set(0, 0.4, -0.5 + i * 0.8);
      shipGroup.add(container);
    }

    // Engine glow (point light)
    const engineLight = new THREE.PointLight(0x00ccff, 2, 10);
    engineLight.position.set(0, 0, 1);
    shipGroup.add(engineLight);

    shipGroup.scale.set(1.5, 1.5, 1.5);
    return shipGroup;
  }

  private createTrailParticles(): THREE.Points {
    const particleCount = 20;
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];

    for (let i = 0; i < particleCount; i++) {
      positions.push(0, 0, i * 0.3); // Trail behind ship
    }

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );

    const material = new THREE.PointsMaterial({
      color: 0x00ccff,
      size: 0.3,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });

    return new THREE.Points(geometry, material);
  }

  update(time: number, deltaTime: number): void {
    const elapsed = time - this.startTime;
    let progress = Math.min(elapsed / this.duration, 1.0);

    // Ease in-out
    progress = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    // Update position
    this.mesh.position.lerpVectors(this.startPosition, this.endPosition, progress);

    // Fade in at start, fade out at end
    let opacity = 1.0;
    if (progress < 0.2) {
      opacity = progress / 0.2; // Fade in first 20%
    } else if (progress > 0.8) {
      opacity = (1.0 - progress) / 0.2; // Fade out last 20%
    }

    // Apply opacity to all meshes
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const material = child.material as THREE.MeshStandardMaterial;
        material.opacity = opacity;
        material.transparent = true;
      }
    });

    // Update trail opacity
    const trailMaterial = this.trailParticles.material as THREE.PointsMaterial;
    trailMaterial.opacity = opacity * 0.6;

    // Pulse engine light
    this.mesh.traverse((child) => {
      if (child instanceof THREE.PointLight) {
        child.intensity = 2 + Math.sin(time * 0.01) * 0.5;
      }
    });
  }

  isComplete(): boolean {
    const elapsed = performance.now() - this.startTime;
    return elapsed >= this.duration;
  }

  dispose(scene: THREE.Scene): void {
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      } else if (child instanceof THREE.Points) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          (child.material as THREE.Material).dispose();
        }
      } else if (child instanceof THREE.Light) {
        child.dispose();
      }
    });
    scene.remove(this.mesh);
  }
}

