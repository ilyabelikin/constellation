import * as THREE from "three";
import { MiningOperation } from "@constellation/shared";

/**
 * Manages rendering of mining installations on asteroids
 * Shows abstract mining structures with animated ship traffic
 */
export class MiningInstallationRenderer {
  private scene: THREE.Scene;
  private installations: Map<string, MiningInstallation> = new Map();
  private asteroidMeshes: Map<string, THREE.Mesh>;
  
  constructor(scene: THREE.Scene, asteroidMeshes: Map<string, THREE.Mesh>) {
    this.scene = scene;
    this.asteroidMeshes = asteroidMeshes;
  }

  /**
   * Update mining installations based on current operations
   */
  update(miningOperations: MiningOperation[], deltaTime: number): void {
    // Create a set of active mining celestial body IDs
    const activeMiningBodies = new Set(
      miningOperations.map((op) => op.celestialBodyId)
    );

    // Remove installations that no longer have active operations
    for (const [bodyId, installation] of this.installations.entries()) {
      if (!activeMiningBodies.has(bodyId)) {
        this.removeInstallation(bodyId);
      }
    }

    // Add or update installations for active operations
    for (const operation of miningOperations) {
      const asteroidMesh = this.asteroidMeshes.get(operation.celestialBodyId);
      if (!asteroidMesh) continue;

      if (!this.installations.has(operation.celestialBodyId)) {
        this.addInstallation(operation.celestialBodyId, asteroidMesh);
      }

      // Update animation
      const installation = this.installations.get(operation.celestialBodyId);
      if (installation) {
        installation.animate(deltaTime);
      }
    }
  }

  /**
   * Create a mining installation on an asteroid
   */
  private addInstallation(bodyId: string, asteroidMesh: THREE.Mesh): void {
    const installation = new MiningInstallation(
      this.scene,
      asteroidMesh
    );
    this.installations.set(bodyId, installation);
  }

  /**
   * Remove a mining installation
   */
  private removeInstallation(bodyId: string): void {
    const installation = this.installations.get(bodyId);
    if (installation) {
      installation.dispose();
      this.installations.delete(bodyId);
    }
  }

  /**
   * Clean up all installations
   */
  dispose(): void {
    for (const installation of this.installations.values()) {
      installation.dispose();
    }
    this.installations.clear();
  }

  /**
   * Set visibility of all mining installations
   */
  setVisible(visible: boolean): void {
    for (const installation of this.installations.values()) {
      installation.setVisible(visible);
    }
  }
}

/**
 * Represents a single mining installation with animated ship traffic
 */
class MiningInstallation {
  private scene: THREE.Scene;
  private asteroidMesh: THREE.Mesh;
  private group: THREE.Group;
  private ships: MiningShip[] = [];
  private stationLights: THREE.PointLight[] = [];
  
  // Parameters
  private readonly NUM_SHIPS: number; // Number of ships beaming onto asteroid (1-3, randomized)
  private readonly ORBIT_DISTANCE_MULTIPLIER = 2.5; // How far from asteroid the ships orbit (closer for visibility)
  
  constructor(scene: THREE.Scene, asteroidMesh: THREE.Mesh) {
    this.scene = scene;
    this.asteroidMesh = asteroidMesh;
    this.group = new THREE.Group();
    
    // Randomize number of ships (1-3)
    this.NUM_SHIPS = Math.floor(Math.random() * 3) + 1;
    
    // Position group at asteroid location
    this.group.position.copy(asteroidMesh.position);
    this.scene.add(this.group);
    
    this.createStationLights();
    this.createShips();
  }

  /**
   * Create static lights on the asteroid surface to represent the mining station
   */
  private createStationLights(): void {
    // No station lights - removed per user request
  }

  /**
   * Create animated ships traveling to/from the mining site
   */
  private createShips(): void {
    const asteroidRadius = (this.asteroidMesh.geometry as THREE.SphereGeometry)
      .parameters?.radius || 1;
    const orbitRadius = asteroidRadius * this.ORBIT_DISTANCE_MULTIPLIER;
    
    for (let i = 0; i < this.NUM_SHIPS; i++) {
      // Calculate base angle for even distribution
      const basePhase = i / this.NUM_SHIPS;
      
      // Add random variation (±0.15 or ±15% of the circle) while maintaining general distribution
      // This gives variety while preventing ships from clustering too much
      const randomVariation = (Math.random() - 0.5) * 0.3; // ±15% variation
      const finalPhase = basePhase + randomVariation;
      
      const ship = new MiningShip(
        this.group,
        asteroidRadius,
        orbitRadius,
        finalPhase
      );
      this.ships.push(ship);
    }
  }

  /**
   * Animate the installation (pulsing lights and ship movement)
   */
  animate(deltaTime: number): void {
    // Update group position to follow asteroid
    this.group.position.copy(this.asteroidMesh.position);
    
    // Station lights removed - no animation needed
    
    // Animate ships
    this.ships.forEach(ship => ship.animate(deltaTime));
  }

  /**
   * Set visibility of the installation
   */
  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.ships.forEach(ship => ship.dispose());
    this.ships = [];
    
    // Remove all objects from group
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      
      // Dispose geometries and materials
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      } else if (child instanceof THREE.Light) {
        // Lights don't need disposal
      }
    }
    
    this.scene.remove(this.group);
  }
}

/**
 * Represents a single mining ship beaming onto the asteroid with a spotlight
 */
class MiningShip {
  private group: THREE.Group;
  private spotlight: THREE.SpotLight;
  private beamCone: THREE.Mesh; // Visible cone mesh for the beam
  private shipDot: THREE.Mesh;
  private asteroidRadius: number;
  private orbitRadius: number;
  private phase: number; // 0-1 animation phase
  private speed: number; // Phase change per second
  private angle: number; // Fixed angle position around asteroid
  private orbitHeight: number; // Height above asteroid
  private pointLight: THREE.PointLight;
  
  // Arrival animation
  private isArriving: boolean = true;
  private arrivalProgress: number = 0;
  private arrivalDuration: number; // seconds to complete arrival
  private startPosition: THREE.Vector3;
  private targetPosition: THREE.Vector3;
  
  // Rotation animation
  private rotationOffset: number = 0; // Accumulated rotation offset for smooth orbital motion
  
  // Particle system for material extraction effect
  private particleSystem: THREE.Points | null = null;
  private particleCount: number = 40; // Number of particles in the beam
  private particlePositions: Float32Array;
  private particleProgress: Float32Array; // 0-1 progress along beam for each particle
  private particleSpeeds: Float32Array; // Individual speed multipliers
  private particleSizes: Float32Array; // Individual particle sizes for variety
  private particleAngles: Float32Array; // Random angles for cone distribution
  private particleRadii: Float32Array; // Random radii for cone distribution
  
  constructor(
    parent: THREE.Group,
    asteroidRadius: number,
    orbitRadius: number,
    initialPhase: number
  ) {
    this.asteroidRadius = asteroidRadius;
    this.orbitRadius = orbitRadius;
    this.phase = initialPhase;
    this.speed = 0.2 + Math.random() * 0.15; // Speed of beam pulsing
    // Evenly distribute ships around asteroid using initialPhase
    this.angle = initialPhase * Math.PI * 2; // Evenly spaced positions
    this.orbitHeight = orbitRadius * (0.8 + Math.random() * 0.4); // Vary height
    
    // Setup arrival animation
    this.arrivalDuration = 2.0 + Math.random() * 1.5; // 2-3.5 seconds arrival time
    
    this.group = new THREE.Group();
    parent.add(this.group);
    
    // Calculate target position (final orbit position)
    this.targetPosition = new THREE.Vector3(
      Math.cos(this.angle) * this.orbitHeight,
      Math.sin(this.angle * 0.5) * this.orbitHeight * 0.4,
      Math.sin(this.angle) * this.orbitHeight
    );
    
    // Calculate start position (off-screen, coming from a distance)
    const approachDistance = orbitRadius * 8; // Start 8x orbit radius away
    const approachAngle = this.angle + (Math.random() - 0.5) * Math.PI * 0.5; // Vary approach angle
    this.startPosition = new THREE.Vector3(
      Math.cos(approachAngle) * approachDistance,
      (Math.random() - 0.5) * approachDistance * 0.5, // Random height
      Math.sin(approachAngle) * approachDistance
    );
    
    // Create orange spotlight pointing at asteroid (mining beam)
    this.spotlight = new THREE.SpotLight(
      0xff6600, // Orange color for mining/scanning beam
      0.0, // Start with beam off during arrival
      orbitRadius * 4, // Distance
      Math.PI / 16, // Angle (11.25 degrees) - very narrow beam
      0.2, // Penumbra (soft edge)
      0.8 // Decay (less decay = more visible)
    );
    this.spotlight.castShadow = false; // Disable shadows for performance
    
    this.spotlight.position.copy(this.startPosition);
    // Point spotlight at asteroid center
    this.spotlight.target.position.set(0, 0, 0);
    this.group.add(this.spotlight);
    this.group.add(this.spotlight.target);
    
    // Create visible cone mesh for the scanning beam (stops inside asteroid)
    const beamLength = this.targetPosition.length() - asteroidRadius * 0.3;
    const beamRadius = beamLength * Math.tan(Math.PI / 16);
    const beamGeometry = new THREE.ConeGeometry(beamRadius, beamLength, 16, 1, true);
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.0, // Start invisible during arrival
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false, // Don't write to depth buffer to avoid occluding particles
    });
    this.beamCone = new THREE.Mesh(beamGeometry, beamMaterial);
    this.group.add(this.beamCone);
    
    // Create small glowing blue/cyan dot to represent the ship
    const dotGeometry = new THREE.SphereGeometry(asteroidRadius * 0.15, 8, 8);
    const dotMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x4499ff, // Blue ship
      transparent: true,
      opacity: 1.0
    });
    this.shipDot = new THREE.Mesh(dotGeometry, dotMaterial);
    this.shipDot.position.copy(this.startPosition);
    this.group.add(this.shipDot);
    
    // Add bright blue point light at ship position for ship glow
    this.pointLight = new THREE.PointLight(0x4499ff, 2.0, orbitRadius * 1.5);
    this.pointLight.position.copy(this.startPosition);
    this.group.add(this.pointLight);
    
    // Initialize particle system arrays
    this.particlePositions = new Float32Array(this.particleCount * 3);
    this.particleProgress = new Float32Array(this.particleCount);
    this.particleSpeeds = new Float32Array(this.particleCount);
    this.particleSizes = new Float32Array(this.particleCount);
    this.particleAngles = new Float32Array(this.particleCount);
    this.particleRadii = new Float32Array(this.particleCount);
    
    // Initialize particles with random progress, speeds, sizes, and cone distribution
    for (let i = 0; i < this.particleCount; i++) {
      this.particleProgress[i] = Math.random(); // Random start position along beam
      this.particleSpeeds[i] = 0.8 + Math.random() * 0.4; // Vary speed (0.8-1.2x)
      this.particleSizes[i] = 0.5 + Math.random() * 1.0; // Vary size (0.5-1.5x)
      this.particleAngles[i] = Math.random() * Math.PI * 2; // Random angle around beam axis
      this.particleRadii[i] = Math.random(); // Random distance from beam center (0-1)
    }
    
    this.createParticleSystem();
  }

  /**
   * Create the particle system for material extraction visualization
   */
  private createParticleSystem(): void {
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.particlePositions, 3)
    );
    
    // Add size attribute for per-particle size variation
    particleGeometry.setAttribute(
      'size',
      new THREE.BufferAttribute(this.particleSizes, 1)
    );
    
    // Create particle material with orange glow
    const particleMaterial = new THREE.PointsMaterial({
      color: 0xffaa44, // Bright orange/yellow for mined materials
      size: this.asteroidRadius * 0.04, // Half the original size (0.08 -> 0.04)
      transparent: true,
      opacity: 0.0, // Start invisible during arrival
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    
    this.particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    this.group.add(this.particleSystem);
  }
  
  /**
   * Update particle positions to flow from asteroid to ship
   */
  private updateParticles(deltaTime: number, shipPos: THREE.Vector3): void {
    if (!this.particleSystem) return;
    
    const beamLength = shipPos.length() - this.asteroidRadius * 0.3;
    const direction = new THREE.Vector3(0, 0, 0).sub(shipPos).normalize();
    
    // Calculate impact point on asteroid surface
    const impactPoint = direction.clone().multiplyScalar(-this.asteroidRadius);
    
    // Create perpendicular vectors for cone distribution
    const perpendicular1 = new THREE.Vector3();
    const perpendicular2 = new THREE.Vector3();
    const tempVec = new THREE.Vector3();
    
    // Find a vector not parallel to direction to create orthogonal basis
    if (Math.abs(direction.y) < 0.9) {
      tempVec.set(0, 1, 0); // Use Y axis if direction isn't too aligned with it
    } else {
      tempVec.set(1, 0, 0); // Otherwise use X axis
    }
    
    // Create orthogonal basis using cross products
    perpendicular1.crossVectors(direction, tempVec).normalize();
    perpendicular2.crossVectors(direction, perpendicular1).normalize();
    
    // Update each particle
    for (let i = 0; i < this.particleCount; i++) {
      // Move particle along beam
      this.particleProgress[i] += deltaTime * 0.15 * this.particleSpeeds[i]; // Slow movement
      
      // Reset particle when it reaches the ship
      if (this.particleProgress[i] >= 1.0) {
        this.particleProgress[i] = 0.0;
        // Randomize cone distribution for new cycle
        this.particleAngles[i] = Math.random() * Math.PI * 2;
        this.particleRadii[i] = Math.random();
      }
      
      const progress = this.particleProgress[i];
      
      // Interpolate position from asteroid surface to ship
      const particlePos = impactPoint.clone().lerp(shipPos, progress);
      
      // Cone effect: particles start spread out and condense toward the ship
      // Cone radius is largest at the asteroid (progress=0) and smallest at ship (progress=1)
      const coneRadius = beamLength * 0.15 * (1.0 - progress * 0.85); // Reduces to 15% at ship
      const radialOffset = coneRadius * this.particleRadii[i];
      
      // Apply radial offset using the perpendicular vectors
      const offsetX = Math.cos(this.particleAngles[i]) * radialOffset;
      const offsetZ = Math.sin(this.particleAngles[i]) * radialOffset;
      
      particlePos.add(perpendicular1.clone().multiplyScalar(offsetX));
      particlePos.add(perpendicular2.clone().multiplyScalar(offsetZ));
      
      // Store in positions array
      this.particlePositions[i * 3] = particlePos.x;
      this.particlePositions[i * 3 + 1] = particlePos.y;
      this.particlePositions[i * 3 + 2] = particlePos.z;
    }
    
    // Update the geometry
    const positionAttribute = this.particleSystem.geometry.getAttribute('position');
    (positionAttribute as THREE.BufferAttribute).needsUpdate = true;
  }

  /**
   * Animate the ship arrival and beaming effect
   */
  animate(deltaTime: number): void {
    if (this.isArriving) {
      // Arrival animation
      this.arrivalProgress += deltaTime / this.arrivalDuration;
      
      if (this.arrivalProgress >= 1.0) {
        // Arrival complete
        this.isArriving = false;
        this.arrivalProgress = 1.0;
      }
      
      // Smooth easing (ease-out cubic)
      const t = this.arrivalProgress;
      const easedProgress = 1 - Math.pow(1 - t, 3);
      
      // Interpolate position from start to target
      const shipPos = new THREE.Vector3().lerpVectors(
        this.startPosition,
        this.targetPosition,
        easedProgress
      );
      
      this.shipDot.position.copy(shipPos);
      this.spotlight.position.copy(shipPos);
      this.pointLight.position.copy(shipPos);
      
      // Fade in beam towards the end of arrival
      const beamMaterial = this.beamCone.material as THREE.MeshBasicMaterial;
      if (this.arrivalProgress > 0.7) {
        const beamFade = (this.arrivalProgress - 0.7) / 0.3; // Fade in over last 30%
        beamMaterial.opacity = beamFade * 0.25;
        this.spotlight.intensity = beamFade * 8.0;
        
        // Fade in particles with beam
        if (this.particleSystem) {
          const particleMaterial = this.particleSystem.material as THREE.PointsMaterial;
          particleMaterial.opacity = beamFade * 0.8;
        }
        
        // Update beam cone position
        const direction = new THREE.Vector3(0, 0, 0).sub(shipPos).normalize();
        const beamLength = shipPos.length() - this.asteroidRadius * 0.3;
        const midpoint = shipPos.clone().add(direction.clone().multiplyScalar(beamLength / 2));
        this.beamCone.position.copy(midpoint);
        this.beamCone.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, -1, 0),
          direction
        );
        
        // Update particles during arrival
        this.updateParticles(deltaTime, shipPos);
      }
      
    } else {
      // Normal mining animation
      this.phase = (this.phase + this.speed * deltaTime) % 1.0;
      
      // Pulse spotlight intensity for scanning/mining effect
      const basePulse = Math.sin(this.phase * Math.PI * 2) * 0.5 + 0.5;
      // Add secondary faster pulse for scanning effect
      const secondaryPulse = Math.sin(this.phase * Math.PI * 6) * 0.2 + 0.8;
      this.spotlight.intensity = 6.0 + basePulse * 6.0 * secondaryPulse;
      
      // Pulse ship dot opacity
      const dotMaterial = this.shipDot.material as THREE.MeshBasicMaterial;
      dotMaterial.opacity = 0.6 + basePulse * 0.3;
      
      // Pulse beam cone opacity and brightness
      const beamMaterial = this.beamCone.material as THREE.MeshBasicMaterial;
      beamMaterial.opacity = 0.2 + basePulse * 0.2;
      
      // Pulse particle opacity with beam
      if (this.particleSystem) {
        const particleMaterial = this.particleSystem.material as THREE.PointsMaterial;
        particleMaterial.opacity = 0.6 + basePulse * 0.3;
      }
      
      // Slight rotation of ship position around asteroid for variety
      // Use accumulated rotation offset instead of Date.now() to avoid jumps
      this.rotationOffset += deltaTime * 0.05; // Slow rotation speed
      const newAngle = this.angle + this.rotationOffset;
      
      const shipPos = new THREE.Vector3(
        Math.cos(newAngle) * this.orbitHeight,
        Math.sin(newAngle * 0.5) * this.orbitHeight * 0.4,
        Math.sin(newAngle) * this.orbitHeight
      );
      
      this.spotlight.position.copy(shipPos);
      this.shipDot.position.copy(shipPos);
      this.pointLight.position.copy(shipPos);
      
      // Update beam cone position and orientation
      const direction = new THREE.Vector3(0, 0, 0).sub(shipPos).normalize();
      const beamLength = shipPos.length() - this.asteroidRadius * 0.3; // Stop inside asteroid, don't exit other side
      const midpoint = shipPos.clone().add(direction.clone().multiplyScalar(beamLength / 2));
      this.beamCone.position.copy(midpoint);
      this.beamCone.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, -1, 0), // Cone tip points down by default, so use negative Y
        direction
      );
      
      // Update particles during normal mining
      this.updateParticles(deltaTime, shipPos);
    }
  }

  /**
   * Clean up ship resources
   */
  dispose(): void {
    this.shipDot.geometry.dispose();
    (this.shipDot.material as THREE.Material).dispose();
    this.beamCone.geometry.dispose();
    (this.beamCone.material as THREE.Material).dispose();
    this.spotlight.dispose();
    
    // Clean up particle system
    if (this.particleSystem) {
      this.particleSystem.geometry.dispose();
      (this.particleSystem.material as THREE.Material).dispose();
      this.particleSystem = null;
    }
    
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}

