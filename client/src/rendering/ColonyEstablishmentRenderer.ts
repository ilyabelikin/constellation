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
    this.startAnimation(planetId, false);
  }

  /**
   * Start a colony invasion animation on a planet
   */
  startInvasion(planetId: string): void {
    this.startAnimation(planetId, true);
  }

  /**
   * Internal helper to start either establishment or invasion
   */
  private startAnimation(planetId: string, isInvasion: boolean): void {
    const bodyMesh = this.bodyMeshes.get(planetId);
    if (!bodyMesh) {
      console.warn(`Cannot start colony animation: planet ${planetId} not found`);
      return;
    }

    // Bodies can be Mesh or Group, we need a Mesh for planets
    const planetMesh = bodyMesh instanceof THREE.Mesh ? bodyMesh : null;
    if (!planetMesh) {
      console.warn(`Body ${planetId} is not a mesh`);
      return;
    }

    // Don't start if already active
    if (this.activeEstablishments.has(planetId)) {
      return;
    }

    const animation = new ColonyEstablishmentAnimation(
      this.scene,
      planetMesh,
      isInvasion
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
  private defensiveBeams: DefensiveBeam[] = [];
  private shipFiringBeams: ShipFiringBeam[] = [];
  private complete: boolean = false;
  private isInvasion: boolean;
  
  private readonly NUM_PODS = 8;
  private readonly INVASION_POD_MULTIPLIER = 3;
  private readonly SHIP_DURATION = 3;
  private readonly POD_DEPLOY_START = 1.5;
  private readonly POD_DEPLOY_INTERVAL = 0.3;
  
  private elapsed: number = 0;
  private nextPodTime: number = this.POD_DEPLOY_START;
  private nextShipFireTime: number = 0;
  private nextResistanceFireTime: number = 0;
  private podsDeployed: number = 0;
  private fadeDelayTimer: number = 0;
  
  constructor(scene: THREE.Scene, planetMesh: THREE.Mesh, isInvasion: boolean = false) {
    this.scene = scene;
    this.planetMesh = planetMesh;
    this.isInvasion = isInvasion;
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
      this.SHIP_DURATION,
      this.isInvasion
    );
  }

  /**
   * Deploy a pod from the ship to the planet
   */
  private deployPod(): void {
    if (!this.ship) return;
    
    const planetRadius = (this.planetMesh.geometry as THREE.SphereGeometry)
      .parameters?.radius || 1;
    
    // In invasion, some pods are targeted by surface defenses
    const isTargeted = this.isInvasion && Math.random() < 0.4;
    
    const pod = new ColonyPod(
      this.group,
      this.ship.getCurrentPosition(),
      planetRadius,
      this.isInvasion,
      isTargeted
    );
    this.pods.push(pod);

    // If targeted, create a defensive beam from the surface (BLUE resistance)
    if (isTargeted) {
        this.createDefensiveBeam(pod);
    }
  }

  private createDefensiveBeam(target: ColonyPod | ColonyShip): void {
      const beam = new DefensiveBeam(this.group, target);
      this.defensiveBeams.push(beam);
  }

  private createShipFire(): void {
      if (!this.ship) return;
      const planetRadius = (this.planetMesh.geometry as THREE.SphereGeometry)
        .parameters?.radius || 1;
      const beam = new ShipFiringBeam(this.group, this.ship, planetRadius);
      this.shipFiringBeams.push(beam);
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

      // Invasion ship fires at the planet
      if (this.isInvasion && !this.ship.isComplete() && !this.ship.isFading() && this.elapsed >= this.nextShipFireTime) {
          this.createShipFire();
          this.nextShipFireTime = this.elapsed + 0.1 + Math.random() * 0.3;
      }

      // Planet occasionally fires back at the ship (resistance)
      if (this.isInvasion && !this.ship.isComplete() && !this.ship.isFading() && this.elapsed >= this.nextResistanceFireTime) {
          this.createDefensiveBeam(this.ship);
          this.nextResistanceFireTime = this.elapsed + 0.2 + Math.random() * 0.8;
      }
    }
    
    // Deploy pods at intervals
    const maxPods = this.isInvasion ? this.NUM_PODS * this.INVASION_POD_MULTIPLIER : this.NUM_PODS;
    const interval = this.isInvasion ? this.POD_DEPLOY_INTERVAL / 2 : this.POD_DEPLOY_INTERVAL;

    if (this.podsDeployed < maxPods && this.elapsed >= this.nextPodTime) {
      this.deployPod();
      this.podsDeployed++;
      this.nextPodTime += interval;
    }
    
    // Animate all pods
    for (const pod of this.pods) {
      pod.animate(deltaTime);
    }

    // Animate defensive beams (BLUE)
    for (let i = this.defensiveBeams.length - 1; i >= 0; i--) {
        const beam = this.defensiveBeams[i];
        beam.animate(deltaTime);
        if (beam.isComplete()) {
            beam.dispose();
            this.defensiveBeams.splice(i, 1);
        }
    }

    // Animate ship fire beams (RED)
    for (let i = this.shipFiringBeams.length - 1; i >= 0; i--) {
        const beam = this.shipFiringBeams[i];
        beam.animate(deltaTime);
        if (beam.isComplete()) {
            beam.dispose();
            this.shipFiringBeams.splice(i, 1);
        }
    }
    
    // Check if all pods have landed (or been destroyed)
    const allPodsHandled = this.pods.every(pod => pod.hasLanded() || pod.isDestroyed());
    const allBeamsDone = this.defensiveBeams.length === 0 && this.shipFiringBeams.length === 0;
    
    // Once all pods are handled and beams are done, start a delay then fade the ship
    if (this.ship && !this.ship.isFading() && allPodsHandled && this.podsDeployed >= maxPods && allBeamsDone) {
      this.fadeDelayTimer += deltaTime;
      if (this.fadeDelayTimer >= 1.0) { // 1 second of "victory lap"
        this.ship.startFade();
      }
    }
    
    // Check if complete
    const allPodsComplete = this.pods.every(pod => pod.isComplete());
    if (this.podsDeployed >= maxPods && allPodsComplete && this.defensiveBeams.length === 0 && this.shipFiringBeams.length === 0 && this.ship && this.ship.isComplete()) {
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

    for (const beam of this.defensiveBeams) {
        beam.dispose();
    }
    this.defensiveBeams = [];
    
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
 * A beam from the planet surface hitting an invading pod
 */
class DefensiveBeam {
    private line: THREE.Line;
    private target: ColonyPod | ColonyShip;
    private targetPosition: THREE.Vector3 = new THREE.Vector3();
    private surfacePosition: THREE.Vector3 = new THREE.Vector3();
    private elapsed: number = 0;
    private readonly DURATION = 0.5;
    private complete: boolean = false;
    private parent: THREE.Group;

    constructor(parent: THREE.Group, target: ColonyPod | ColonyShip) {
        this.parent = parent;
        this.target = target;

        // Determine surface position (from where the beam originates)
        if (target instanceof ColonyPod) {
            this.surfacePosition.copy(target.getLandingPosition());
        } else {
            // For the ship, pick a random spot on the "front" half of the planet
            const shipPos = target.getCurrentPosition();
            this.surfacePosition.copy(shipPos).normalize();
            // Add some randomness
            this.surfacePosition.x += (Math.random() - 0.5) * 0.5;
            this.surfacePosition.y += (Math.random() - 0.5) * 0.5;
            this.surfacePosition.z += (Math.random() - 0.5) * 0.5;
            this.surfacePosition.normalize().multiplyScalar(target.getPlanetRadius());
        }

        const geometry = new THREE.BufferGeometry().setFromPoints([
            this.surfacePosition,
            target.getCurrentPosition()
        ]);

        const material = new THREE.LineBasicMaterial({
            color: 0x3366ff, // BLUE for resistance
            transparent: true,
            opacity: 0.8,
            linewidth: 2
        });

        this.line = new THREE.Line(geometry, material);
        parent.add(this.line);
    }

    animate(deltaTime: number): void {
        this.elapsed += deltaTime;
        if (this.elapsed >= this.DURATION) {
            this.complete = true;
            return;
        }

        // Update beam to follow target
        const points = [
            this.surfacePosition,
            this.target.getCurrentPosition()
        ];
        this.line.geometry.setFromPoints(points);

        // Flicker/fade
        (this.line.material as THREE.LineBasicMaterial).opacity = (1 - this.elapsed / this.DURATION) * (Math.random() > 0.5 ? 0.8 : 0.4);
    }

    isComplete(): boolean {
        return this.complete;
    }

    dispose(): void {
        this.line.geometry.dispose();
        (this.line.material as THREE.Material).dispose();
        this.parent.remove(this.line);
    }
}

/**
 * Visual beam for the ship firing at the planet
 */
class ShipFiringBeam {
    private line: THREE.Line;
    private ship: ColonyShip;
    private targetPos: THREE.Vector3;
    private elapsed: number = 0;
    private readonly DURATION = 0.2;
    private complete: boolean = false;
    private parent: THREE.Group;

    constructor(parent: THREE.Group, ship: ColonyShip, planetRadius: number) {
        this.parent = parent;
        this.ship = ship;

        // Target a random spot on the planet surface
        const shipPos = ship.getCurrentPosition();
        this.targetPos = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
        ).normalize().multiplyScalar(planetRadius);

        const geometry = new THREE.BufferGeometry().setFromPoints([
            shipPos,
            this.targetPos
        ]);

        const material = new THREE.LineBasicMaterial({
            color: 0xff3300, // RED for aggression
            transparent: true,
            opacity: 0.9,
            linewidth: 1
        });

        this.line = new THREE.Line(geometry, material);
        parent.add(this.line);
    }

    animate(deltaTime: number): void {
        this.elapsed += deltaTime;
        if (this.elapsed >= this.DURATION) {
            this.complete = true;
            return;
        }

        // Update beam to follow ship
        const points = [
            this.ship.getCurrentPosition(),
            this.targetPos
        ];
        this.line.geometry.setFromPoints(points);

        // Flicker/fade
        (this.line.material as THREE.LineBasicMaterial).opacity = (1 - this.elapsed / this.DURATION);
    }

    isComplete(): boolean {
        return this.complete;
    }

    dispose(): void {
        this.line.geometry.dispose();
        (this.line.material as THREE.Material).dispose();
        this.parent.remove(this.line);
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
  private isInvasion: boolean;
  private planetRadius: number;
  private readonly FADE_DURATION = 0.6; // Fade over 0.6 seconds
  
  constructor(
    parent: THREE.Group,
    planetRadius: number,
    duration: number,
    isInvasion: boolean = false
  ) {
    this.duration = duration;
    this.isInvasion = isInvasion;
    this.planetRadius = planetRadius;
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
    
    // Create ship mesh (green elongated shape, red for invasion)
    const geometry = new THREE.ConeGeometry(planetRadius * 0.15, planetRadius * 0.4, 4);
    const material = new THREE.MeshBasicMaterial({
      color: isInvasion ? 0xff0000 : 0x00ff00,
      transparent: true,
      opacity: 0.9
    });
    this.mesh = new THREE.Mesh(geometry, material);
    
    // Orient ship toward destination
    const direction = new THREE.Vector3().subVectors(this.endPos, this.startPos).normalize();
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    
    this.group.add(this.mesh);
    
    // Add point light
    this.pointLight = new THREE.PointLight(isInvasion ? 0xff0000 : 0x00ff00, 1, planetRadius * 3);
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
   * Check if the ship is currently in the fading phase
   */
  isFading(): boolean {
    return this.shouldFade;
  }

  /**
   * Get current ship position for pod deployment
   */
  getCurrentPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  getPlanetRadius(): number {
    return this.planetRadius;
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
  private _isDestroyed: boolean = false;
  private isTargeted: boolean;
  private parent: THREE.Group;
  
  constructor(
    parent: THREE.Group,
    shipPosition: THREE.Vector3,
    planetRadius: number,
    isInvasion: boolean = false,
    isTargeted: boolean = false
  ) {
    this.parent = parent;
    this.startPos = shipPosition.clone();
    this.isTargeted = isTargeted;
    
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
    
    // Create small sphere (green for establishment, red for invasion)
    const geometry = new THREE.SphereGeometry(planetRadius * 0.05 / 3, 4, 4);
    const material = new THREE.MeshBasicMaterial({
      color: isInvasion ? 0xff0000 : 0x00ff00,
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
    
    if (!this.landed && !this._isDestroyed) {
      // Descending phase
      this.progress += deltaTime / this.duration;
      
      // If targeted, destroy pod at 70% progress
      if (this.isTargeted && this.progress >= 0.7) {
          this._isDestroyed = true;
          this.progress = 0; // Reset for fading out the "explosion"
          return;
      }

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
    } else if (this._isDestroyed) {
        // Exploding phase (just fade out quickly)
        this.progress += deltaTime / 0.3;
        const fadeProgress = Math.min(this.progress, 1);
        (this.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - fadeProgress) * 0.9;
        this.mesh.scale.setScalar(1 + fadeProgress * 2);

        if (fadeProgress >= 1) {
            this.complete = true;
        }
    } else {
      // Fading phase after landing
      this.progress += deltaTime / 0.6; // Fade over 0.6 seconds
      const fadeProgress = Math.min(this.progress - 1, 1);
      (this.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - fadeProgress) * 0.9;
      
      if (fadeProgress >= 1) {
        this.complete = true;
      }
    }
  }

  /**
   * Check if pod has landed
   */
  hasLanded(): boolean {
    return this.landed;
  }

  /**
   * Check if pod was destroyed
   */
  isDestroyed(): boolean {
      return this._isDestroyed;
  }

  /**
   * Check if pod animation is complete
   */
  isComplete(): boolean {
    return this.complete;
  }

  getCurrentPosition(): THREE.Vector3 {
      return this.mesh.position;
  }

  getLandingPosition(): THREE.Vector3 {
      return this.endPos;
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

