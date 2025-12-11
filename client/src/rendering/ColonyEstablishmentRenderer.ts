import * as THREE from "three";

/**
 * Manages rendering of colony establishment animations
 * Shows a green colony ship arriving and deploying pods to the planet surface
 */
export class ColonyEstablishmentRenderer {
  private scene: THREE.Scene;
  private activeEstablishments: Map<string, ColonyEstablishmentAnimation> = new Map();
  private bodyMeshes: Map<string, THREE.Mesh | THREE.Group>;
  
  constructor(scene: THREE.Scene, bodyMeshes: Map<string, THREE.Mesh | THREE.Group>) {
    this.scene = scene;
    this.bodyMeshes = bodyMeshes;
  }

  /**
   * Start a colony establishment animation on a planet
   */
  startEstablishment(planetId: string): void {
    const bodyMesh = this.bodyMeshes.get(planetId);
    if (!bodyMesh) {
      console.warn(`Cannot start colony establishment: planet ${planetId} not found`);
      console.log(`Available bodies:`, Array.from(this.bodyMeshes.keys()));
      return;
    }

    // Bodies can be Mesh or Group, we need a Mesh for planets
    const planetMesh = bodyMesh instanceof THREE.Mesh ? bodyMesh : null;
    if (!planetMesh) {
      console.warn(`Body ${planetId} is not a mesh (probably a multi-star system)`);
      return;
    }

    // Don't start if already establishing
    if (this.activeEstablishments.has(planetId)) {
      console.log(`Colony establishment already in progress for planet ${planetId}`);
      return;
    }

    console.log(`Starting colony establishment animation on planet ${planetId} at position:`, planetMesh.position);
    const animation = new ColonyEstablishmentAnimation(
      this.scene,
      planetMesh
    );
    this.activeEstablishments.set(planetId, animation);
  }

  /**
   * Update all active establishment animations
   */
  update(deltaTime: number): void {
    const toRemove: string[] = [];

    for (const [planetId, animation] of this.activeEstablishments.entries()) {
      animation.animate(deltaTime);

      // Remove completed animations
      if (animation.isComplete()) {
        animation.dispose();
        toRemove.push(planetId);
      }
    }

    // Clean up completed animations
    for (const planetId of toRemove) {
      this.activeEstablishments.delete(planetId);
    }
  }

  /**
   * Set visibility of all establishment animations
   */
  setVisible(visible: boolean): void {
    for (const animation of this.activeEstablishments.values()) {
      animation.setVisible(visible);
    }
  }

  /**
   * Clean up all animations
   */
  dispose(): void {
    for (const animation of this.activeEstablishments.values()) {
      animation.dispose();
    }
    this.activeEstablishments.clear();
  }
}

/**
 * Represents a single colony establishment animation
 * A green ship arrives from off-screen and deploys multiple pods to the planet
 */
class ColonyEstablishmentAnimation {
  private scene: THREE.Scene;
  private planetMesh: THREE.Mesh;
  private group: THREE.Group;
  private ship: ColonyShip | null = null;
  private pods: ColonyPod[] = [];
  private complete: boolean = false;
  
  private readonly NUM_PODS = 8; // Number of pods to deploy
  private readonly SHIP_DURATION = 3; // seconds for ship arrival
  private readonly POD_DEPLOY_START = 1.5; // Start deploying pods after 1.5 seconds
  private readonly POD_DEPLOY_INTERVAL = 0.3; // Deploy a new pod every 0.3 seconds
  
  private elapsed: number = 0;
  private nextPodTime: number = this.POD_DEPLOY_START;
  private podsDeployed: number = 0;
  
  constructor(scene: THREE.Scene, planetMesh: THREE.Mesh) {
    this.scene = scene;
    this.planetMesh = planetMesh;
    this.group = new THREE.Group();
    
    // Position group at planet location
    this.group.position.copy(planetMesh.position);
    this.scene.add(this.group);
    
    this.createShip();
  }

  /**
   * Create the colony ship arriving from off-screen
   */
  private createShip(): void {
    const planetRadius = (this.planetMesh.geometry as THREE.SphereGeometry)
      .parameters?.radius || 1;
    
    this.ship = new ColonyShip(
      this.group,
      planetRadius,
      this.SHIP_DURATION
    );
  }

  /**
   * Deploy a pod from the ship to the planet
   */
  private deployPod(): void {
    if (!this.ship) return;
    
    const planetRadius = (this.planetMesh.geometry as THREE.SphereGeometry)
      .parameters?.radius || 1;
    
    const pod = new ColonyPod(
      this.group,
      this.ship.getCurrentPosition(),
      planetRadius
    );
    this.pods.push(pod);
  }

  /**
   * Animate the establishment process
   */
  animate(deltaTime: number): void {
    this.elapsed += deltaTime;
    
    // Update group position to follow planet
    this.group.position.copy(this.planetMesh.position);
    
    // Animate ship
    if (this.ship) {
      this.ship.animate(deltaTime);
    }
    
    // Deploy pods at intervals
    if (this.podsDeployed < this.NUM_PODS && this.elapsed >= this.nextPodTime) {
      this.deployPod();
      this.podsDeployed++;
      this.nextPodTime += this.POD_DEPLOY_INTERVAL;
    }
    
    // Animate all pods
    for (const pod of this.pods) {
      pod.animate(deltaTime);
    }
    
    // Check if all pods have landed (not necessarily faded)
    const allPodsLanded = this.pods.every(pod => pod.hasLanded());
    
    // Once all pods have landed, start fading the ship
    if (this.ship && allPodsLanded && this.podsDeployed >= this.NUM_PODS) {
      this.ship.startFade();
    }
    
    // Check if complete (all pods faded and ship faded)
    const allPodsComplete = this.pods.every(pod => pod.isComplete());
    if (this.podsDeployed >= this.NUM_PODS && allPodsComplete && this.ship && this.ship.isComplete()) {
      this.complete = true;
    }
  }

  /**
   * Check if the animation is complete
   */
  isComplete(): boolean {
    return this.complete;
  }

  /**
   * Set visibility
   */
  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.ship) {
      this.ship.dispose();
      this.ship = null;
    }
    
    for (const pod of this.pods) {
      pod.dispose();
    }
    this.pods = [];
    
    // Remove all objects from group
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    }
    
    this.scene.remove(this.group);
  }
}

/**
 * The colony ship that arrives from off-screen
 */
class ColonyShip {
  private group: THREE.Group;
  private mesh: THREE.Mesh;
  private pointLight: THREE.PointLight;
  private progress: number = 0;
  private duration: number;
  private startPos: THREE.Vector3;
  private endPos: THREE.Vector3;
  private complete: boolean = false;
  private shouldFade: boolean = false;
  private fadeProgress: number = 0;
  private readonly FADE_DURATION = 0.6; // Fade over 0.6 seconds
  
  constructor(
    parent: THREE.Group,
    planetRadius: number,
    duration: number
  ) {
    this.duration = duration;
    this.group = new THREE.Group();
    
    // Ship arrives from a random off-screen direction
    const angle = Math.random() * Math.PI * 2;
    const distance = planetRadius * 5; // Start far away
    const orbitDistance = planetRadius * 2.5; // End at orbit distance
    
    this.startPos = new THREE.Vector3(
      Math.cos(angle) * distance,
      (Math.random() - 0.5) * distance * 0.5,
      Math.sin(angle) * distance
    );
    
    this.endPos = new THREE.Vector3(
      Math.cos(angle) * orbitDistance,
      (Math.random() - 0.5) * orbitDistance * 0.3,
      Math.sin(angle) * orbitDistance
    );
    
    // Create ship mesh (green elongated shape)
    const geometry = new THREE.ConeGeometry(planetRadius * 0.15, planetRadius * 0.4, 4);
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.9
    });
    this.mesh = new THREE.Mesh(geometry, material);
    
    console.log(`Colony ship created: radius=${planetRadius}, shipSize=${planetRadius * 0.4}, startPos=`, this.startPos);
    
    // Orient ship toward destination
    const direction = new THREE.Vector3().subVectors(this.endPos, this.startPos).normalize();
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    
    this.group.add(this.mesh);
    
    // Add green point light
    this.pointLight = new THREE.PointLight(0x00ff00, 1, planetRadius * 3);
    this.group.add(this.pointLight);
    
    // Set initial position
    this.group.position.copy(this.startPos);
    parent.add(this.group);
  }

  /**
   * Animate the ship's arrival
   */
  animate(deltaTime: number): void {
    if (this.complete) return;
    
    // Arrival phase
    if (this.progress < 1) {
      this.progress += deltaTime / this.duration;
      
      if (this.progress >= 1) {
        this.progress = 1;
      }
      
      // Smooth easing (ease-in-out)
      const t = this.progress < 0.5
        ? 2 * this.progress * this.progress
        : 1 - Math.pow(-2 * this.progress + 2, 2) / 2;
      
      // Interpolate position
      this.group.position.lerpVectors(this.startPos, this.endPos, t);
    }
    
    // Fade phase (only when told to by parent animation)
    if (this.shouldFade) {
      this.fadeProgress += deltaTime / this.FADE_DURATION;
      const opacity = 1 - Math.min(this.fadeProgress, 1);
      (this.mesh.material as THREE.MeshBasicMaterial).opacity = opacity * 0.9;
      this.pointLight.intensity = opacity;
      
      if (this.fadeProgress >= 1) {
        this.complete = true;
      }
    }
  }

  /**
   * Tell the ship to start fading out
   */
  startFade(): void {
    this.shouldFade = true;
  }

  /**
   * Get current ship position for pod deployment
   */
  getCurrentPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  /**
   * Check if ship animation is complete
   */
  isComplete(): boolean {
    return this.complete;
  }

  /**
   * Clean up
   */
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/**
 * A colony pod that deploys from the ship to the planet surface
 */
class ColonyPod {
  private mesh: THREE.Mesh;
  private startPos: THREE.Vector3;
  private endPos: THREE.Vector3;
  private progress: number = 0;
  private duration: number;
  private complete: boolean = false;
  private landed: boolean = false;
  
  constructor(
    parent: THREE.Group,
    shipPosition: THREE.Vector3,
    planetRadius: number
  ) {
    this.startPos = shipPosition.clone();
    
    // Random point on planet surface
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    
    this.endPos = new THREE.Vector3(
      planetRadius * Math.sin(phi) * Math.cos(theta),
      planetRadius * Math.sin(phi) * Math.sin(theta),
      planetRadius * Math.cos(phi)
    );
    
    // Random duration (1-2 seconds)
    this.duration = 1 + Math.random();
    
    // Create small green sphere (3x smaller than before)
    const geometry = new THREE.SphereGeometry(planetRadius * 0.05 / 3, 4, 4);
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.9
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(this.startPos);
    parent.add(this.mesh);
  }

  /**
   * Animate pod descent
   */
  animate(deltaTime: number): void {
    if (this.complete) return;
    
    if (!this.landed) {
      // Descending phase
      this.progress += deltaTime / this.duration;
      
      if (this.progress >= 1) {
        this.progress = 1;
        this.landed = true;
      }
      
      // Interpolate position with slight curve (parabolic trajectory)
      const t = this.progress;
      this.mesh.position.lerpVectors(this.startPos, this.endPos, t);
      
      // Add slight outward curve during descent
      const curveAmount = Math.sin(t * Math.PI) * 0.5;
      const direction = new THREE.Vector3().subVectors(this.endPos, this.startPos).normalize();
      const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
      this.mesh.position.add(perpendicular.multiplyScalar(curveAmount));
    } else {
      // Fading phase after landing (twice as slow as before)
      this.progress += deltaTime / 0.6; // Fade over 0.6 seconds
      const fadeProgress = Math.min(this.progress - 1, 1);
      (this.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - fadeProgress) * 0.9;
      
      if (fadeProgress >= 1) {
        this.complete = true;
      }
    }
  }

  /**
   * Check if pod has landed (not necessarily faded)
   */
  hasLanded(): boolean {
    return this.landed;
  }

  /**
   * Check if pod animation is complete
   */
  isComplete(): boolean {
    return this.complete;
  }

  /**
   * Clean up
   */
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    if (this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
  }
}

