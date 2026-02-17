import * as THREE from "three";
import { Helium3Operation } from "@constellation/shared";
import { findSurfaceRadius } from "./SurfaceUtils.js";

/**
 * Manages rendering of Helium-3 extraction facilities on planets and moons
 * Shows blue energy domes on the surface
 */
export class Helium3ExtractorRenderer {
  private scene: THREE.Scene;
  private extractors: Map<string, Helium3Extractor> = new Map();
  private celestialBodyMeshes: Map<string, THREE.Mesh | THREE.Group>;
  private camera: THREE.Camera;

  constructor(
    scene: THREE.Scene,
    celestialBodyMeshes: Map<string, THREE.Mesh | THREE.Group>,
    camera: THREE.Camera
  ) {
    this.scene = scene;
    this.celestialBodyMeshes = celestialBodyMeshes;
    this.camera = camera;
  }

  /**
   * Update Helium-3 extractors based on current operations
   */
  update(helium3Operations: Helium3Operation[], deltaTime: number): void {
    // Create a set of active extraction celestial body IDs
    const activeExtractionBodies = new Set(
      helium3Operations.map((op) => op.celestialBodyId)
    );

    // Remove extractors that no longer have active operations
    for (const [bodyId, extractor] of this.extractors.entries()) {
      if (!activeExtractionBodies.has(bodyId)) {
        this.removeExtractor(bodyId);
      }
    }

    // Add or update extractors for active operations
    for (const operation of helium3Operations) {
      const bodyObject = this.celestialBodyMeshes.get(operation.celestialBodyId);
      if (!bodyObject) continue;

      // Only work with THREE.Mesh objects (planets/moons), not Groups (gates)
      if (!(bodyObject instanceof THREE.Mesh)) continue;

      if (!this.extractors.has(operation.celestialBodyId)) {
        this.addExtractor(operation.celestialBodyId, bodyObject);
      }

      // Update animation
      const extractor = this.extractors.get(operation.celestialBodyId);
      if (extractor) {
        extractor.animate(deltaTime);
      }
    }
  }

  /**
   * Create a Helium-3 extractor on a celestial body
   */
  private addExtractor(bodyId: string, bodyMesh: THREE.Mesh): void {
    const extractor = new Helium3Extractor(this.scene, bodyMesh, this.camera);
    this.extractors.set(bodyId, extractor);
  }

  /**
   * Remove a Helium-3 extractor from a celestial body
   */
  private removeExtractor(bodyId: string): void {
    const extractor = this.extractors.get(bodyId);
    if (extractor) {
      extractor.dispose();
      this.extractors.delete(bodyId);
    }
  }

  /**
   * Dispose all extractors and clean up
   */
  dispose(): void {
    for (const extractor of this.extractors.values()) {
      extractor.dispose();
    }
    this.extractors.clear();
  }

  /**
   * Set visibility of all extractors
   */
  setVisible(visible: boolean): void {
    for (const extractor of this.extractors.values()) {
      extractor.setVisible(visible);
    }
  }
}

/**
 * Represents a single Helium-3 extraction facility with animated blue dome
 */
class Helium3Extractor {
  private scene: THREE.Scene;
  private bodyMesh: THREE.Mesh;
  private camera: THREE.Camera;
  private group: THREE.Group;
  private dome!: THREE.Mesh;
  private energyParticles!: THREE.Points;
  private pulseLight!: THREE.PointLight;
  private animationTime: number = 0;

  // Dome parameters
  private readonly DOME_RADIUS_RATIO = 0.12; // Dome sphere radius relative to body radius
  private readonly DOME_EMBED_RATIO = 0.4; // How much of sphere is embedded (0.5 = half buried)
  private readonly PULSE_SPEED = 0.5; // Pulsing animation speed

  constructor(scene: THREE.Scene, bodyMesh: THREE.Mesh, camera: THREE.Camera) {
    this.scene = scene;
    this.bodyMesh = bodyMesh;
    this.camera = camera;
    this.group = new THREE.Group();

    // Position group at body location
    this.group.position.copy(bodyMesh.position);
    this.group.quaternion.copy(bodyMesh.quaternion);
    this.scene.add(this.group);

    const bodyRadius = this.getBodyRadius();
    this.createDome(bodyRadius);
    this.createEnergyParticles(bodyRadius);
    this.createPulseLight(bodyRadius);
  }

  /**
   * Calculate the actual surface distance in a given local direction,
   * using geometry vertex sampling for accuracy on all shapes.
   */
  private getSurfaceDistance(localDir: THREE.Vector3): number {
    return findSurfaceRadius(this.bodyMesh.geometry, localDir);
  }

  /**
   * Get the radius of the celestial body
   */
  private getBodyRadius(): number {
    const geometry = this.bodyMesh.geometry;
    geometry.computeBoundingSphere();
    return geometry.boundingSphere?.radius || 1;
  }

  /**
   * Create the blue energy dome structure (embedded sphere)
   */
  private createDome(bodyRadius: number): void {
    const domeRadius = bodyRadius * this.DOME_RADIUS_RATIO;

    // Create full sphere geometry
    const domeGeometry = new THREE.SphereGeometry(
      domeRadius,
      32,
      32
    );

    // Blue glowing material with transparency
    const domeMaterial = new THREE.MeshBasicMaterial({
      color: 0x00aaff, // Bright cyan-blue
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.dome = new THREE.Mesh(domeGeometry, domeMaterial);

    // Position dome on the surface facing the camera
    // Get direction from body to camera
    const bodyWorldPos = new THREE.Vector3();
    this.bodyMesh.getWorldPosition(bodyWorldPos);

    const cameraWorldPos = new THREE.Vector3();
    this.camera.getWorldPosition(cameraWorldPos);

    // Direction from body center to camera in world space
    const toCameraWorld = new THREE.Vector3()
      .subVectors(cameraWorldPos, bodyWorldPos)
      .normalize();

    // Transform world direction to local space of the body to account for rotation and shape
    const localDir = toCameraWorld
      .clone()
      .applyQuaternion(this.bodyMesh.quaternion.clone().invert());

    // Get actual surface distance in this direction, accounting for shape/ruggedness
    const surfaceDistance = this.getSurfaceDistance(localDir);

    // Embed sphere partially into surface
    // Move sphere center inward by embed amount
    const embedDepth = domeRadius * this.DOME_EMBED_RATIO;
    const finalDistance = surfaceDistance - embedDepth;

    // Position dome on the side facing the camera (in local space)
    this.dome.position.set(
      localDir.x * finalDistance,
      localDir.y * finalDistance,
      localDir.z * finalDistance
    );

    this.group.add(this.dome);
  }

  /**
   * Create animated energy particles rising from the dome
   */
  private createEnergyParticles(bodyRadius: number): void {
    const particleCount = 30;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    const domeRadius = bodyRadius * this.DOME_RADIUS_RATIO;
    const domePos = this.dome.position;

    // Initialize particle positions and properties
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      
      // Start particles on random positions on visible dome surface
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.5; // Upper hemisphere
      
      const offsetX = domeRadius * Math.sin(phi) * Math.cos(theta);
      const offsetY = domeRadius * Math.sin(phi) * Math.sin(theta);
      const offsetZ = domeRadius * Math.cos(phi);
      
      // Direction from center to dome
      const domeDir = new THREE.Vector3(domePos.x, domePos.y, domePos.z).normalize();
      
      // Rotate offset to align with dome direction
      const up = new THREE.Vector3(0, 0, 1);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(up, domeDir);
      const offset = new THREE.Vector3(offsetX, offsetY, offsetZ).applyQuaternion(quaternion);
      
      positions[i3] = domePos.x + offset.x;
      positions[i3 + 1] = domePos.y + offset.y;
      positions[i3 + 2] = domePos.z + offset.z;

      // Cyan-blue particle colors with variation
      colors[i3] = 0.0 + Math.random() * 0.3; // R
      colors[i3 + 1] = 0.6 + Math.random() * 0.4; // G
      colors[i3 + 2] = 1.0; // B

      // Random sizes
      sizes[i] = Math.random() * 0.5 + 0.3;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
    particleGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(colors, 3)
    );
    particleGeometry.setAttribute(
      "size",
      new THREE.BufferAttribute(sizes, 1)
    );

    const particleMaterial = new THREE.PointsMaterial({
      size: bodyRadius * 0.02,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.energyParticles = new THREE.Points(particleGeometry, particleMaterial);
    this.group.add(this.energyParticles);
  }

  /**
   * Create pulsing light at the dome location
   */
  private createPulseLight(bodyRadius: number): void {
    const domeRadius = bodyRadius * this.DOME_RADIUS_RATIO;
    
    this.pulseLight = new THREE.PointLight(
      0x00aaff,
      2.5,
      domeRadius * 4,
      2
    );
    this.pulseLight.position.copy(this.dome.position);
    this.group.add(this.pulseLight);
  }

  /**
   * Animate the extractor (pulsing dome, rising particles)
   */
  animate(deltaTime: number): void {
    this.animationTime += deltaTime;

    // Sync group position and rotation with body so dome stays on surface
    this.group.position.copy(this.bodyMesh.position);
    this.group.quaternion.copy(this.bodyMesh.quaternion);

    // Pulse the dome opacity
    const pulseValue = Math.sin(this.animationTime * this.PULSE_SPEED * Math.PI * 2);
    const domeMaterial = this.dome.material as THREE.MeshBasicMaterial;
    domeMaterial.opacity = 0.3 + pulseValue * 0.15;

    // Pulse the light intensity
    this.pulseLight.intensity = 1.5 + pulseValue * 0.8;

    // Animate energy particles rising from the dome
    const positions = this.energyParticles.geometry.attributes.position
      .array as Float32Array;
    const domePos = this.dome.position;
    const bodyRadius = this.getBodyRadius();
    const domeRadius = bodyRadius * this.DOME_RADIUS_RATIO;
    const particleCount = positions.length / 3;

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      
      // Get direction from center (0,0,0) to particle
      const dir = new THREE.Vector3(
        positions[i3],
        positions[i3 + 1],
        positions[i3 + 2]
      ).normalize();

      // Move particle outward from body center
      const speed = 0.5 + Math.random() * 0.3;
      positions[i3] += dir.x * deltaTime * speed;
      positions[i3 + 1] += dir.y * deltaTime * speed;
      positions[i3 + 2] += dir.z * deltaTime * speed;

      // Reset particle if it gets too far from dome
      const distanceFromCenter = new THREE.Vector3(
        positions[i3],
        positions[i3 + 1],
        positions[i3 + 2]
      ).length();

      if (distanceFromCenter > bodyRadius * 1.3) {
        // Reset to random position on visible dome surface (upper hemisphere relative to surface)
        const resetTheta = Math.random() * Math.PI * 2;
        const resetPhi = Math.random() * Math.PI * 0.5; // Upper hemisphere only
        
        const offsetX = domeRadius * Math.sin(resetPhi) * Math.cos(resetTheta);
        const offsetY = domeRadius * Math.sin(resetPhi) * Math.sin(resetTheta);
        const offsetZ = domeRadius * Math.cos(resetPhi);
        
        // Direction from center to dome
        const domeDir = new THREE.Vector3(domePos.x, domePos.y, domePos.z).normalize();
        
        // Rotate offset to align with dome direction
        const up = new THREE.Vector3(0, 0, 1);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(up, domeDir);
        const offset = new THREE.Vector3(offsetX, offsetY, offsetZ).applyQuaternion(quaternion);
        
        positions[i3] = domePos.x + offset.x;
        positions[i3 + 1] = domePos.y + offset.y;
        positions[i3 + 2] = domePos.z + offset.z;
      }
    }

    this.energyParticles.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * Set visibility of the extractor
   */
  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  /**
   * Dispose and clean up resources
   */
  dispose(): void {
    // Dispose geometries
    this.dome.geometry.dispose();
    this.energyParticles.geometry.dispose();

    // Dispose materials
    if (this.dome.material instanceof THREE.Material) {
      this.dome.material.dispose();
    }
    if (this.energyParticles.material instanceof THREE.Material) {
      this.energyParticles.material.dispose();
    }

    // Remove from scene
    this.scene.remove(this.group);
  }
}

