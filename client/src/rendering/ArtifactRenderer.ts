import * as THREE from "three";
import { ResearchOperation, ArtifactType, CelestialBodyType } from "@constellation/shared";
import { findSurfaceRadius } from "./SurfaceUtils.js";

/**
 * Manages rendering of ancient artifacts and research stations on celestial bodies.
 * - Unresearched artifacts: glowing structure on the surface
 * - Active research: scanning drones with science-colored beams
 */
export class ArtifactRenderer {
  private scene: THREE.Scene;
  private artifacts: Map<string, ArtifactVisual> = new Map();
  private bodyMeshes: Map<string, THREE.Mesh | THREE.Group>;
  private moonMeshes: Map<string, THREE.Mesh>;

  constructor(
    scene: THREE.Scene,
    bodyMeshes: Map<string, THREE.Mesh | THREE.Group>,
    moonMeshes: Map<string, THREE.Mesh>
  ) {
    this.scene = scene;
    this.bodyMeshes = bodyMeshes;
    this.moonMeshes = moonMeshes;
  }

  /**
   * Update artifact visuals based on current state
   */
  update(
    bodies: CelestialBodyType[],
    researchOperations: ResearchOperation[],
    deltaTime: number
  ): void {
    const activeResearchBodies = new Set(
      researchOperations.map((op) => op.celestialBodyId)
    );

    // Build set of all bodies that should have artifact visuals
    const artifactBodies = new Set<string>();
    for (const body of bodies) {
      if (body.hasArtifact) {
        artifactBodies.add(body.id);
      }
    }

    // Remove visuals for bodies that no longer have artifacts
    for (const [bodyId] of this.artifacts.entries()) {
      if (!artifactBodies.has(bodyId)) {
        this.removeArtifact(bodyId);
      }
    }

    // Add or update artifact visuals
    for (const body of bodies) {
      if (!body.hasArtifact) continue;

      const rawMesh =
        this.bodyMeshes.get(body.id) || this.moonMeshes.get(body.id);
      if (!rawMesh) continue;
      // Get the actual mesh from groups (planets may be wrapped in Groups)
      const bodyMesh = rawMesh instanceof THREE.Mesh
        ? rawMesh
        : (rawMesh.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh | undefined);
      if (!bodyMesh) continue;

      const isBeingResearched = activeResearchBodies.has(body.id);

      if (!this.artifacts.has(body.id)) {
        this.addArtifact(body.id, bodyMesh, body.artifactType, isBeingResearched);
      } else {
        const artifact = this.artifacts.get(body.id)!;
        artifact.setResearching(isBeingResearched);
      }

      const artifact = this.artifacts.get(body.id);
      if (artifact) {
        artifact.animate(deltaTime);
      }
    }
  }

  private addArtifact(
    bodyId: string,
    bodyMesh: THREE.Mesh,
    artifactType: string | undefined,
    isBeingResearched: boolean
  ): void {
    const artifact = new ArtifactVisual(
      this.scene,
      bodyMesh,
      artifactType || ArtifactType.RUINS,
      isBeingResearched,
      bodyId
    );
    this.artifacts.set(bodyId, artifact);
  }

  private removeArtifact(bodyId: string): void {
    const artifact = this.artifacts.get(bodyId);
    if (artifact) {
      artifact.dispose();
      this.artifacts.delete(bodyId);
    }
  }

  dispose(): void {
    for (const artifact of this.artifacts.values()) {
      artifact.dispose();
    }
    this.artifacts.clear();
  }

  setVisible(visible: boolean): void {
    for (const artifact of this.artifacts.values()) {
      artifact.setVisible(visible);
    }
  }
}

/**
 * A single artifact visual with structures ON the surface and optional research drones.
 * Artifacts are built as a group of small meshes placed directly on the body surface.
 */
class ArtifactVisual {
  private scene: THREE.Scene;
  private bodyMesh: THREE.Mesh;
  private artifactGroup: THREE.Group; // structures (pillars etc), scene-level
  private droneGroup: THREE.Group; // drone, scene-level
  private artifactType: string;
  private isResearching: boolean;

  // Positioning: local offset from body center (before rotation)
  private localNormal: THREE.Vector3; // unit direction from body center to artifact in body-local space
  private bodyRadius: number;

  // Artifact glow
  private glowLight: THREE.PointLight;
  private artifactMeshes: THREE.Mesh[] = [];
  private pulsePhase: number = Math.random();

  // Research drone (only when active)
  private researchDrone: ResearchDrone | null = null;

  constructor(
    scene: THREE.Scene,
    bodyMesh: THREE.Mesh,
    artifactType: string,
    isResearching: boolean,
    bodyId: string
  ) {
    this.scene = scene;
    this.bodyMesh = bodyMesh;
    this.artifactType = artifactType;
    this.isResearching = isResearching;

    // Use bounding sphere for the base radius — works for all geometry types
    // (spherical, elliptical, rugged, binary/peanut, faceted)
    bodyMesh.geometry.computeBoundingSphere();
    const baseSphereRadius =
      (bodyMesh.geometry as THREE.SphereGeometry).parameters?.radius ||
      bodyMesh.geometry.boundingSphere?.radius ||
      1;
    this.bodyRadius = baseSphereRadius;

    const artifactColor = this.getArtifactColor();

    // Derive a deterministic random surface point from the body ID
    let hash = 0;
    for (let i = 0; i < bodyId.length; i++) {
      hash = ((hash << 5) - hash + bodyId.charCodeAt(i)) | 0;
    }
    const seededRand = (offset: number) => {
      const x = Math.sin((hash + offset) * 9301 + 49297) * 49297;
      return x - Math.floor(x);
    };

    // Random point on sphere — avoid poles
    const theta = 0.3 + seededRand(1) * 2.5;
    const phi = seededRand(2) * Math.PI * 2;

    // This is the artifact direction in the body's LOCAL space (before any mesh rotation)
    this.localNormal = new THREE.Vector3(
      Math.sin(theta) * Math.cos(phi),
      Math.cos(theta),
      Math.sin(theta) * Math.sin(phi)
    );

    // Find actual surface distance along this direction by sampling geometry vertices.
    // Handles all irregular shapes (binary, rugged, faceted, elliptical).
    this.bodyRadius = findSurfaceRadius(bodyMesh.geometry, this.localNormal);

    // Build the artifact structure group (positioned in animate())
    this.artifactGroup = new THREE.Group();
    this.scene.add(this.artifactGroup);

    this.buildArtifactStructure(this.bodyRadius, artifactColor);

    // Glow light
    this.glowLight = new THREE.PointLight(artifactColor, 2.0, this.bodyRadius * 4);
    this.artifactGroup.add(this.glowLight);

    // Drone group
    this.droneGroup = new THREE.Group();
    this.scene.add(this.droneGroup);

    // Position everything for the first frame
    this.updateWorldTransform();

    if (isResearching) {
      this.createResearchDrone();
    }
  }

  /**
   * Get the current body rotation. Handles both:
   * - Moons: mesh.rotation.y is set directly by the scene
   * - Planets: shader uniform `rotation` (mesh.rotation stays 0)
   */
  private getBodyRotationY(): number {
    // First check mesh rotation (works for moons, stars)
    const meshRot = this.bodyMesh.rotation.y;
    if (Math.abs(meshRot) > 0.0001) {
      return meshRot;
    }

    // Fall back to shader rotation uniform (planets)
    const mat = this.bodyMesh.material;
    if (
      mat instanceof THREE.ShaderMaterial &&
      mat.uniforms &&
      mat.uniforms.rotation
    ) {
      return mat.uniforms.rotation.value || 0;
    }

    return 0;
  }

  /**
   * Compute the artifact's current world position and orientation,
   * accounting for body position and rotation.
   */
  private updateWorldTransform(): void {
    const bodyPos = this.bodyMesh.position;
    const rotY = this.getBodyRotationY();

    // Rotate the local normal by the body's Y rotation to get world-space normal
    const worldNormal = this.localNormal.clone().applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      rotY
    );

    const surfaceWorldPos = bodyPos.clone().add(
      worldNormal.clone().multiplyScalar(this.bodyRadius)
    );

    // Position the artifact group at the surface point
    this.artifactGroup.position.copy(surfaceWorldPos);

    // Orient so local Y-up aligns with the rotated surface normal
    const up = new THREE.Vector3(0, 1, 0);
    this.artifactGroup.quaternion.setFromUnitVectors(up, worldNormal);
  }

  private getArtifactColor(): number {
    switch (this.artifactType) {
      case ArtifactType.RUINS:
        return 0xc084fc; // Purple
      case ArtifactType.MONOLITH:
        return 0x60a5fa; // Blue
      case ArtifactType.SIGNAL_SOURCE:
        return 0x34d399; // Green
      case ArtifactType.CRYSTALLINE_MATRIX:
        return 0xf472b6; // Pink
      default:
        return 0xc084fc;
    }
  }

  private makeMaterial(color: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  /**
   * Build the artifact structures as children of artifactGroup.
   * The group is positioned at the surface; children use local Y=0 as the ground.
   */
  private buildArtifactStructure(bodyRadius: number, color: number): void {
    const s = bodyRadius * 0.06; // base unit scale

    switch (this.artifactType) {
      case ArtifactType.RUINS:
        this.buildRuins(s, color);
        break;
      case ArtifactType.MONOLITH:
        this.buildMonolith(s, color);
        break;
      case ArtifactType.SIGNAL_SOURCE:
        this.buildSignalSource(s, color);
        break;
      case ArtifactType.CRYSTALLINE_MATRIX:
        this.buildCrystallineMatrix(s, color);
        break;
      default:
        this.buildRuins(s, color);
        break;
    }
  }

  /**
   * Ruins: cluster of broken pillars/walls of varying heights arranged in a rough circle.
   * Looks like crumbling alien architecture.
   */
  private buildRuins(s: number, color: number): void {
    const pillarCount = 6 + Math.floor(Math.random() * 4); // 6-9 pillars
    const ringRadius = s * 1.2;

    for (let i = 0; i < pillarCount; i++) {
      const angle = (i / pillarCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const dist = ringRadius * (0.6 + Math.random() * 0.5);

      // Varying pillar height: some tall, some broken short
      const height = s * (0.3 + Math.random() * 1.2);
      const width = s * (0.15 + Math.random() * 0.15);
      const depth = s * (0.15 + Math.random() * 0.1);

      const geo = new THREE.BoxGeometry(width, height, depth);
      const mat = this.makeMaterial(color);
      const pillar = new THREE.Mesh(geo, mat);

      // Position: base sits on surface (Y=0), so center is at height/2
      pillar.position.set(
        Math.cos(angle) * dist,
        height / 2,
        Math.sin(angle) * dist
      );

      // Slight random tilt to look weathered/collapsed
      pillar.rotation.x = (Math.random() - 0.5) * 0.15;
      pillar.rotation.z = (Math.random() - 0.5) * 0.15;
      pillar.rotation.y = Math.random() * Math.PI;

      this.artifactGroup.add(pillar);
      this.artifactMeshes.push(pillar);
    }

    // Add a broken floor slab in the center
    const floorGeo = new THREE.BoxGeometry(s * 1.4, s * 0.06, s * 1.4);
    const floorMat = this.makeMaterial(color);
    floorMat.opacity = 0.5;
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(0, s * 0.03, 0);
    floor.rotation.y = Math.random() * Math.PI * 0.25;
    this.artifactGroup.add(floor);
    this.artifactMeshes.push(floor);
  }

  /**
   * Monolith: a single tall, thin slab standing upright on the surface.
   */
  private buildMonolith(s: number, color: number): void {
    const height = s * 2.5;
    const width = s * 0.8;
    const depth = s * 0.15;

    const geo = new THREE.BoxGeometry(width, height, depth);
    const mat = this.makeMaterial(color);
    const slab = new THREE.Mesh(geo, mat);
    slab.position.set(0, height / 2, 0); // base on surface
    this.artifactGroup.add(slab);
    this.artifactMeshes.push(slab);

    // Small base plinth
    const baseGeo = new THREE.BoxGeometry(width * 1.3, s * 0.1, depth * 2.5);
    const baseMat = this.makeMaterial(color);
    baseMat.opacity = 0.5;
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.set(0, s * 0.05, 0);
    this.artifactGroup.add(base);
    this.artifactMeshes.push(base);
  }

  /**
   * Signal Source: a half-buried dome/dish with a small antenna spike.
   */
  private buildSignalSource(s: number, color: number): void {
    // Half-buried dome — position a sphere so only top half is visible
    const domeGeo = new THREE.SphereGeometry(s * 0.6, 10, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMat = this.makeMaterial(color);
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.set(0, 0, 0); // hemisphere sits on surface
    this.artifactGroup.add(dome);
    this.artifactMeshes.push(dome);

    // Small antenna spike on top
    const spikeGeo = new THREE.CylinderGeometry(s * 0.03, s * 0.03, s * 1.0, 4);
    const spikeMat = this.makeMaterial(color);
    const spike = new THREE.Mesh(spikeGeo, spikeMat);
    spike.position.set(0, s * 0.6 + s * 0.5, 0); // on top of dome
    this.artifactGroup.add(spike);
    this.artifactMeshes.push(spike);

    // Small concentric ring around the base
    const ringGeo = new THREE.TorusGeometry(s * 0.8, s * 0.03, 6, 16);
    const ringMat = this.makeMaterial(color);
    ringMat.opacity = 0.4;
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2; // lie flat
    ring.position.set(0, s * 0.02, 0);
    this.artifactGroup.add(ring);
    this.artifactMeshes.push(ring);
  }

  /**
   * Crystalline Matrix: a cluster of angled crystal shards protruding from the ground.
   */
  private buildCrystallineMatrix(s: number, color: number): void {
    const shardCount = 4 + Math.floor(Math.random() * 3); // 4-6 crystals

    for (let i = 0; i < shardCount; i++) {
      const angle = (i / shardCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const dist = s * (0.2 + Math.random() * 0.5);
      const height = s * (0.6 + Math.random() * 1.4);
      const radius = s * (0.08 + Math.random() * 0.1);

      // Use octahedron for crystal shape
      const geo = new THREE.OctahedronGeometry(radius, 0);
      // Scale Y to make elongated crystals
      geo.scale(1, height / (radius * 2), 1);
      const mat = this.makeMaterial(color);
      const crystal = new THREE.Mesh(geo, mat);

      crystal.position.set(
        Math.cos(angle) * dist,
        height * 0.4, // partially embedded in surface
        Math.sin(angle) * dist
      );

      // Tilt outward from center for a natural crystal cluster look
      crystal.rotation.x = (Math.random() - 0.3) * 0.4;
      crystal.rotation.z = (Math.random() - 0.3) * 0.4;

      this.artifactGroup.add(crystal);
      this.artifactMeshes.push(crystal);
    }
  }

  private createResearchDrone(): void {
    this.researchDrone = new ResearchDrone(
      this.droneGroup,
      this.bodyRadius,
      this.artifactGroup.position.clone(),
      this.bodyMesh.position.clone(),
      this.getArtifactColor()
    );
  }

  setResearching(isResearching: boolean): void {
    if (isResearching === this.isResearching) return;
    this.isResearching = isResearching;

    if (isResearching && !this.researchDrone) {
      this.createResearchDrone();
    } else if (!isResearching && this.researchDrone) {
      this.researchDrone.dispose();
      this.researchDrone = null;
    }
  }

  animate(deltaTime: number): void {
    // Recompute artifact world transform (handles body movement + rotation)
    this.updateWorldTransform();

    // Pulse the artifact glow
    this.pulsePhase = (this.pulsePhase + deltaTime * 0.3) % 1.0;
    const pulse = Math.sin(this.pulsePhase * Math.PI * 2) * 0.5 + 0.5;

    this.glowLight.intensity = 1.5 + pulse * 2.0;

    for (const mesh of this.artifactMeshes) {
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.min(mat.opacity, 0.6 + pulse * 0.35);
    }

    if (this.researchDrone) {
      // Feed the drone the artifact's current world position and the body center
      this.researchDrone.updateArtifactPosition(
        this.artifactGroup.position,
        this.bodyMesh.position
      );
      this.researchDrone.animate(deltaTime);
    }
  }

  setVisible(visible: boolean): void {
    this.artifactGroup.visible = visible;
    this.glowLight.visible = visible;
    this.droneGroup.visible = visible;
  }

  dispose(): void {
    if (this.researchDrone) {
      this.researchDrone.dispose();
      this.researchDrone = null;
    }

    for (const mesh of this.artifactMeshes) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.artifactMeshes = [];

    this.glowLight.dispose();
    this.scene.remove(this.artifactGroup);
    this.scene.remove(this.droneGroup);
  }
}

/**
 * A research drone that orbits and scans the artifact with a narrow laser beam.
 * Visually distinct from mining: uses a tight cylinder beam (not a wide cone)
 * that extends all the way to the surface, with orbiting scan-ring particles
 * that spiral around the beam axis instead of flowing through it.
 */
class ResearchDrone {
  private group: THREE.Group;
  private droneDot: THREE.Mesh;
  private beamMesh: THREE.Mesh; // Narrow cylinder, not a cone
  private pointLight: THREE.PointLight;
  private artifactPos: THREE.Vector3;
  private phase: number = 0;
  private speed: number;
  private bodyRadius: number;
  private color: number;

  // Surface-relative coordinate frame for orbit
  private surfaceNormal: THREE.Vector3; // outward normal at artifact site
  private tangent1: THREE.Vector3; // first tangent on surface
  private tangent2: THREE.Vector3; // second tangent on surface
  private orbitRadius: number; // radius of circular orbit in tangent plane
  private orbitAltitude: number; // height above artifact along normal
  private angle: number = 0;

  // Arrival animation
  private isArriving: boolean = true;
  private arrivalProgress: number = 0;
  private arrivalDuration: number;
  private startPosition: THREE.Vector3;
  private targetPosition: THREE.Vector3;

  // Scan-ring particles: orbit AROUND the beam axis at different heights
  private particleSystem: THREE.Points | null = null;
  private particleCount: number = 24;
  private particlePositions: Float32Array;
  private particleHeights: Float32Array; // 0-1 progress along beam
  private particleSpeeds: Float32Array; // orbital angular speed
  private particleOrbitAngles: Float32Array; // current orbit angle around beam axis

  constructor(
    parent: THREE.Group,
    bodyRadius: number,
    artifactPosition: THREE.Vector3,
    bodyCenter: THREE.Vector3,
    color: number
  ) {
    this.artifactPos = artifactPosition.clone();
    this.bodyRadius = bodyRadius;
    this.color = color;
    this.orbitRadius = bodyRadius * 0.8;
    this.orbitAltitude = bodyRadius * 1.8;
    this.speed = 0.2 + Math.random() * 0.1;
    this.arrivalDuration = 2.0 + Math.random() * 1.0;
    this.angle = Math.random() * Math.PI * 2;

    // Surface normal = direction from body center to artifact (NOT from scene origin!)
    this.surfaceNormal = artifactPosition.clone().sub(bodyCenter).normalize();
    this.tangent1 = new THREE.Vector3();
    this.tangent2 = new THREE.Vector3();
    this.rebuildTangents();

    this.group = new THREE.Group();
    parent.add(this.group);

    // Target orbit position: above the artifact along the surface normal
    this.targetPosition = this.computeOrbitPosition(this.angle);

    // Approach from further out along the surface normal direction
    const approachDistance = bodyRadius * 6;
    const approachAngleOffset = (Math.random() - 0.5) * Math.PI * 0.5;
    this.startPosition = this.artifactPos.clone()
      .add(this.surfaceNormal.clone().multiplyScalar(approachDistance))
      .add(this.tangent1.clone().multiplyScalar(Math.cos(this.angle + approachAngleOffset) * approachDistance * 0.3))
      .add(this.tangent2.clone().multiplyScalar(Math.sin(this.angle + approachAngleOffset) * approachDistance * 0.3));

    // Narrow cylinder beam (laser-like, NOT a cone)
    // Use a placeholder length; it gets repositioned every frame
    const beamGeometry = new THREE.CylinderGeometry(
      bodyRadius * 0.015, // top radius — very narrow
      bodyRadius * 0.015, // bottom radius — same (cylinder, not cone)
      1.0, // height placeholder, scaled each frame
      6, // radial segments
      1, // height segments
      true // open-ended
    );
    const beamMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.0, // fades in during arrival
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.beamMesh = new THREE.Mesh(beamGeometry, beamMaterial);
    this.group.add(this.beamMesh);

    // Drone dot — white sphere
    const dotGeometry = new THREE.SphereGeometry(bodyRadius * 0.1, 6, 6);
    const dotMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1.0,
    });
    this.droneDot = new THREE.Mesh(dotGeometry, dotMaterial);
    this.droneDot.position.copy(this.startPosition);
    this.group.add(this.droneDot);

    // Point light on drone
    this.pointLight = new THREE.PointLight(color, 1.5, this.orbitAltitude * 2.0);
    this.pointLight.position.copy(this.startPosition);
    this.group.add(this.pointLight);

    // Initialize scan-ring particles
    this.particlePositions = new Float32Array(this.particleCount * 3);
    this.particleHeights = new Float32Array(this.particleCount);
    this.particleSpeeds = new Float32Array(this.particleCount);
    this.particleOrbitAngles = new Float32Array(this.particleCount);

    for (let i = 0; i < this.particleCount; i++) {
      // Evenly distribute along beam height with some jitter
      this.particleHeights[i] = (i / this.particleCount) + Math.random() * (1 / this.particleCount);
      this.particleSpeeds[i] = 1.5 + Math.random() * 1.5; // radians per second
      this.particleOrbitAngles[i] = Math.random() * Math.PI * 2;
    }

    this.createParticleSystem(color, bodyRadius);
  }

  private rebuildTangents(): void {
    const ref = Math.abs(this.surfaceNormal.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
    this.tangent1.crossVectors(this.surfaceNormal, ref).normalize();
    this.tangent2.crossVectors(this.surfaceNormal, this.tangent1).normalize();
  }

  /**
   * Update the artifact's world position (called each frame as the body rotates).
   * Surface normal = direction from body center to artifact position.
   */
  updateArtifactPosition(worldPos: THREE.Vector3, bodyCenter: THREE.Vector3): void {
    this.artifactPos.copy(worldPos);
    this.surfaceNormal.copy(worldPos).sub(bodyCenter).normalize();
    this.rebuildTangents();
  }

  /**
   * Compute drone orbit position relative to the artifact's surface normal.
   * The drone circles in a plane perpendicular to the normal, offset outward.
   */
  private computeOrbitPosition(angle: number): THREE.Vector3 {
    return this.artifactPos.clone()
      .add(this.surfaceNormal.clone().multiplyScalar(this.orbitAltitude))
      .add(this.tangent1.clone().multiplyScalar(Math.cos(angle) * this.orbitRadius))
      .add(this.tangent2.clone().multiplyScalar(Math.sin(angle) * this.orbitRadius));
  }

  private createParticleSystem(color: number, bodyRadius: number): void {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.particlePositions, 3)
    );

    const material = new THREE.PointsMaterial({
      color,
      size: bodyRadius * 0.02,
      transparent: true,
      opacity: 0.0, // fades in during arrival
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.particleSystem = new THREE.Points(geometry, material);
    this.group.add(this.particleSystem);
  }

  /**
   * Update scan-ring particles: they orbit AROUND the beam axis at various heights,
   * slowly drifting upward from surface to drone like rising data rings.
   */
  private updateParticles(deltaTime: number, dronePos: THREE.Vector3): void {
    if (!this.particleSystem) return;

    const beamDir = dronePos.clone().sub(this.artifactPos).normalize();
    const beamLength = dronePos.distanceTo(this.artifactPos);

    // Build perpendicular basis for the orbit plane
    const perp1 = new THREE.Vector3();
    const perp2 = new THREE.Vector3();
    const tempVec = Math.abs(beamDir.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
    perp1.crossVectors(beamDir, tempVec).normalize();
    perp2.crossVectors(beamDir, perp1).normalize();

    // Orbit radius around the beam
    const ringRadius = this.bodyRadius * 0.06;

    for (let i = 0; i < this.particleCount; i++) {
      // Spin around the beam axis
      this.particleOrbitAngles[i] += deltaTime * this.particleSpeeds[i];

      // Slowly drift upward (from artifact → drone)
      this.particleHeights[i] += deltaTime * 0.06;
      if (this.particleHeights[i] >= 1.0) {
        this.particleHeights[i] -= 1.0;
      }

      const h = this.particleHeights[i];
      const ang = this.particleOrbitAngles[i];

      // Position along beam axis
      const onBeam = this.artifactPos.clone().add(
        beamDir.clone().multiplyScalar(beamLength * h)
      );

      // Offset perpendicular to beam axis (orbit circle)
      const ox = Math.cos(ang) * ringRadius;
      const oz = Math.sin(ang) * ringRadius;
      onBeam.add(perp1.clone().multiplyScalar(ox));
      onBeam.add(perp2.clone().multiplyScalar(oz));

      this.particlePositions[i * 3] = onBeam.x;
      this.particlePositions[i * 3 + 1] = onBeam.y;
      this.particlePositions[i * 3 + 2] = onBeam.z;
    }

    const attr = this.particleSystem.geometry.getAttribute("position");
    (attr as THREE.BufferAttribute).needsUpdate = true;
  }

  /**
   * Position and orient the narrow beam cylinder to stretch from dronePos
   * all the way down to the artifact on the surface.
   */
  private updateBeam(dronePos: THREE.Vector3): void {
    const beamLength = dronePos.distanceTo(this.artifactPos);
    const dir = this.artifactPos.clone().sub(dronePos).normalize();
    const mid = dronePos.clone().add(dir.clone().multiplyScalar(beamLength / 2));

    this.beamMesh.position.copy(mid);
    this.beamMesh.scale.set(1, beamLength, 1); // stretch cylinder to full length
    this.beamMesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), // cylinder default axis
      dir.clone().negate() // point from drone toward surface
    );
  }

  animate(deltaTime: number): void {
    if (this.isArriving) {
      this.arrivalProgress += deltaTime / this.arrivalDuration;
      if (this.arrivalProgress >= 1.0) {
        this.isArriving = false;
        this.arrivalProgress = 1.0;
      }

      const t = this.arrivalProgress;
      const eased = 1 - Math.pow(1 - t, 3);

      const dronePos = new THREE.Vector3().lerpVectors(
        this.startPosition,
        this.targetPosition,
        eased
      );

      this.droneDot.position.copy(dronePos);
      this.pointLight.position.copy(dronePos);

      // Fade in beam and particles towards end of arrival
      if (this.arrivalProgress > 0.7) {
        const fade = (this.arrivalProgress - 0.7) / 0.3;
        (this.beamMesh.material as THREE.MeshBasicMaterial).opacity = fade * 0.35;

        if (this.particleSystem) {
          (this.particleSystem.material as THREE.PointsMaterial).opacity =
            fade * 0.7;
        }

        this.updateBeam(dronePos);
        this.updateParticles(deltaTime, dronePos);
      }
    } else {
      // Normal scanning animation
      this.phase = (this.phase + this.speed * deltaTime) % 1.0;
      this.angle += deltaTime * 0.08; // slow orbit around body

      const basePulse = Math.sin(this.phase * Math.PI * 2) * 0.5 + 0.5;

      // Beam pulses subtly — narrow laser shimmer
      (this.beamMesh.material as THREE.MeshBasicMaterial).opacity =
        0.25 + basePulse * 0.2;

      // Particles pulse gently
      if (this.particleSystem) {
        (this.particleSystem.material as THREE.PointsMaterial).opacity =
          0.5 + basePulse * 0.3;
      }

      const dronePos = this.computeOrbitPosition(this.angle);

      this.droneDot.position.copy(dronePos);
      this.pointLight.position.copy(dronePos);

      this.updateBeam(dronePos);
      this.updateParticles(deltaTime, dronePos);
    }
  }

  dispose(): void {
    this.droneDot.geometry.dispose();
    (this.droneDot.material as THREE.Material).dispose();
    this.beamMesh.geometry.dispose();
    (this.beamMesh.material as THREE.Material).dispose();
    this.pointLight.dispose();

    if (this.particleSystem) {
      this.particleSystem.geometry.dispose();
      (this.particleSystem.material as THREE.Material).dispose();
    }

    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}
