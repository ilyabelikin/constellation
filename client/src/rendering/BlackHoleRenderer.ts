import * as THREE from "three";

/**
 * Black hole data configuration
 */
export interface BlackHoleData {
  accretionDiskColor: string;
  accretionDiskInnerRadius: number;
  accretionDiskOuterRadius: number;
  eventHorizonRadius: number;
  hawkingRadiation: boolean;
}

/**
 * Renders a realistic black hole with accretion disk, gravitational lensing,
 * and visual effects using vanilla Three.js
 */
export class BlackHoleRenderer {
  private group: THREE.Group;
  private eventHorizonRef: THREE.Mesh | null = null;
  private accretionDiskRef: THREE.Mesh | null = null;
  private outerDiskRef: THREE.Mesh | null = null;
  private topArcRef: THREE.Mesh | null = null;
  private bottomArcRef: THREE.Mesh | null = null;
  private camera: THREE.Camera | null = null;
  private timeScale: number;

  constructor(
    blackHoleData: BlackHoleData,
    size: number,
    timeScale: number = 1.0,
    scene: THREE.Scene
  ) {
    this.group = new THREE.Group();
    this.timeScale = timeScale;

    this.buildBlackHole(blackHoleData, size, scene);
  }

  private buildBlackHole(
    blackHoleData: BlackHoleData,
    size: number,
    scene: THREE.Scene
  ): void {
    // Event Horizon - pure black sphere
    const eventHorizonGeometry = new THREE.SphereGeometry(
      blackHoleData.eventHorizonRadius,
      64,
      64
    );
    const eventHorizonMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
    });
    this.eventHorizonRef = new THREE.Mesh(
      eventHorizonGeometry,
      eventHorizonMaterial
    );
    this.group.add(this.eventHorizonRef);

    // Photon ring - bright ring at event horizon
    const photonRingGeometry = new THREE.RingGeometry(
      blackHoleData.eventHorizonRadius * 0.98,
      blackHoleData.eventHorizonRadius * 1.15,
      64
    );
    const photonRingMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const photonRing = new THREE.Mesh(photonRingGeometry, photonRingMaterial);
    photonRing.rotation.x = Math.PI / 2;
    this.group.add(photonRing);

    // Gravitational lensing - bright rim
    const lensingRimGeometry = new THREE.RingGeometry(
      blackHoleData.eventHorizonRadius * 1.15,
      blackHoleData.eventHorizonRadius * 1.4,
      64
    );
    const lensingRimMaterial = new THREE.MeshBasicMaterial({
      color: 0xff9944,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const lensingRim = new THREE.Mesh(lensingRimGeometry, lensingRimMaterial);
    lensingRim.rotation.x = Math.PI / 2;
    this.group.add(lensingRim);

    // Shadow region
    const shadowGeometry = new THREE.SphereGeometry(
      blackHoleData.eventHorizonRadius * 1.5,
      64,
      64
    );
    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.7,
      side: THREE.BackSide,
    });
    const shadowSphere = new THREE.Mesh(shadowGeometry, shadowMaterial);
    this.group.add(shadowSphere);

    // Very bright inner accretion disk - very compact
    const innerDiskGeometry = new THREE.RingGeometry(
      blackHoleData.accretionDiskInnerRadius,
      blackHoleData.accretionDiskInnerRadius * 1.14, // Further reduced (1.2 * 0.95)
      64
    );
    const innerDiskMaterial = new THREE.MeshBasicMaterial({
      color: 0xffdd44,
      transparent: true,
      opacity: 1.0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.accretionDiskRef = new THREE.Mesh(
      innerDiskGeometry,
      innerDiskMaterial
    );
    this.accretionDiskRef.rotation.x = Math.PI / 2;
    this.group.add(this.accretionDiskRef);

    // Bright inner glow layer - very compact
    const innerGlowGeometry = new THREE.RingGeometry(
      blackHoleData.accretionDiskInnerRadius * 0.95,
      blackHoleData.accretionDiskInnerRadius * 1.18, // Further reduced (1.25 * 0.94)
      64
    );
    const innerGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0xffaa22,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const innerGlow = new THREE.Mesh(innerGlowGeometry, innerGlowMaterial);
    innerGlow.rotation.x = Math.PI / 2;
    innerGlow.position.y = 0.01;
    this.group.add(innerGlow);

    // Middle accretion disk - warm, very compact
    const middleDiskGeometry = new THREE.RingGeometry(
      blackHoleData.accretionDiskInnerRadius * 1.14, // Further reduced (1.2 * 0.95)
      blackHoleData.accretionDiskInnerRadius * 1.45, // Further reduced (1.7 * 0.85)
      64
    );
    const middleDiskMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(blackHoleData.accretionDiskColor),
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const middleDisk = new THREE.Mesh(middleDiskGeometry, middleDiskMaterial);
    middleDisk.rotation.x = Math.PI / 2;
    middleDisk.position.y = 0.02;
    this.group.add(middleDisk);

    // Outer accretion disk - dimmer red/orange, very compact
    const outerDiskGeometry = new THREE.RingGeometry(
      blackHoleData.accretionDiskInnerRadius * 1.45, // Further reduced (1.7 * 0.85)
      blackHoleData.accretionDiskOuterRadius,
      64
    );
    const outerDiskMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(blackHoleData.accretionDiskColor).multiplyScalar(
        0.5
      ),
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.outerDiskRef = new THREE.Mesh(outerDiskGeometry, outerDiskMaterial);
    this.outerDiskRef.rotation.x = Math.PI / 2;
    this.outerDiskRef.position.y = 0.05;
    this.group.add(this.outerDiskRef);

    // Far outer disk - very dim, very compact
    const farOuterDiskGeometry = new THREE.RingGeometry(
      blackHoleData.accretionDiskOuterRadius,
      blackHoleData.accretionDiskOuterRadius * 1.1, // Further reduced (1.15 * 0.96)
      64
    );
    const farOuterDiskMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(blackHoleData.accretionDiskColor).multiplyScalar(
        0.3
      ),
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const farOuterDisk = new THREE.Mesh(
      farOuterDiskGeometry,
      farOuterDiskMaterial
    );
    farOuterDisk.rotation.x = Math.PI / 2;
    farOuterDisk.position.y = 0.08;
    this.group.add(farOuterDisk);

    // Gravitational lensing arcs - camera-relative, very compact
    // Top arc
    const topArcGeometry = new THREE.RingGeometry(
      blackHoleData.accretionDiskInnerRadius * 1.07, // Further reduced (1.1 * 0.97)
      blackHoleData.accretionDiskInnerRadius * 1.35, // Further reduced (1.5 * 0.9)
      128,
      8,
      0,
      Math.PI
    );
    const topArcMaterial = new THREE.MeshBasicMaterial({
      color: 0xff8833,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.topArcRef = new THREE.Mesh(topArcGeometry, topArcMaterial);
    this.group.add(this.topArcRef);

    // Bottom arc
    const bottomArcGeometry = new THREE.RingGeometry(
      blackHoleData.accretionDiskInnerRadius * 1.07, // Further reduced (1.1 * 0.97)
      blackHoleData.accretionDiskInnerRadius * 1.35, // Further reduced (1.5 * 0.9)
      128,
      8,
      0,
      Math.PI
    );
    const bottomArcMaterial = new THREE.MeshBasicMaterial({
      color: 0xff8833,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.bottomArcRef = new THREE.Mesh(bottomArcGeometry, bottomArcMaterial);
    this.group.add(this.bottomArcRef);

    // Hawking radiation glow (if enabled)
    if (blackHoleData.hawkingRadiation) {
      const hawkingGlow1Geometry = new THREE.SphereGeometry(
        blackHoleData.eventHorizonRadius * 1.1,
        32,
        32
      );
      const hawkingGlow1Material = new THREE.MeshBasicMaterial({
        color: 0x4a5fff,
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending,
      });
      const hawkingGlow1 = new THREE.Mesh(
        hawkingGlow1Geometry,
        hawkingGlow1Material
      );
      this.group.add(hawkingGlow1);

      const hawkingGlow2Geometry = new THREE.SphereGeometry(
        blackHoleData.eventHorizonRadius * 1.2,
        32,
        32
      );
      const hawkingGlow2Material = new THREE.MeshBasicMaterial({
        color: 0x8a9fff,
        transparent: true,
        opacity: 0.08,
        blending: THREE.AdditiveBlending,
      });
      const hawkingGlow2 = new THREE.Mesh(
        hawkingGlow2Geometry,
        hawkingGlow2Material
      );
      this.group.add(hawkingGlow2);
    }

    // Bright light from accretion disk - further reduced intensity
    const mainLight = new THREE.PointLight(0xff8833, 4.5, 18, 1.5); // Further reduced (6 * 0.75, 25 * 0.7)
    mainLight.position.set(0, 0, 0);
    this.group.add(mainLight);
    scene.add(mainLight);

    // Additional glow for dramatic effect - further reduced
    const glowLight1 = new THREE.PointLight(0xffaa44, 2.2, 11, 2); // Further reduced (3 * 0.73, 15 * 0.73)
    glowLight1.position.set(0, 0.5, 0);
    this.group.add(glowLight1);
    scene.add(glowLight1);

    const glowLight2 = new THREE.PointLight(0xff6622, 1.5, 11, 2); // Further reduced (2 * 0.75, 15 * 0.73)
    glowLight2.position.set(0, -0.5, 0);
    this.group.add(glowLight2);
    scene.add(glowLight2);

    // Particle jets (simplified representation) - very compact and subtle
    const topJetGeometry = new THREE.CylinderGeometry(
      0.02, // Further reduced (0.03 * 0.7)
      0.01, // Further reduced (0.015 * 0.7)
      blackHoleData.accretionDiskOuterRadius * 1.05, // Further reduced (1.5 * 0.7)
      8
    );
    const jetMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(blackHoleData.accretionDiskColor),
      transparent: true,
      opacity: 0.25, // Further reduced (0.3 * 0.85)
      blending: THREE.AdditiveBlending,
    });
    const topJet = new THREE.Mesh(topJetGeometry, jetMaterial);
    topJet.position.y = blackHoleData.accretionDiskOuterRadius * 0.85; // Further reduced (1.2 * 0.7)
    this.group.add(topJet);

    const bottomJetGeometry = new THREE.CylinderGeometry(
      0.01, // Further reduced (0.015 * 0.7)
      0.02, // Further reduced (0.03 * 0.7)
      blackHoleData.accretionDiskOuterRadius * 1.05, // Further reduced (1.5 * 0.7)
      8
    );
    const bottomJet = new THREE.Mesh(bottomJetGeometry, jetMaterial.clone());
    bottomJet.position.y = -blackHoleData.accretionDiskOuterRadius * 0.85; // Further reduced (1.2 * 0.7)
    this.group.add(bottomJet);
  }

  /**
   * Set the camera for lensing arc billboarding
   */
  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  /**
   * Update animation frame
   */
  update(delta: number): void {
    if (!this.camera) return;

    // Rotate accretion disks
    if (this.accretionDiskRef) {
      this.accretionDiskRef.rotation.z += delta * 0.5 * this.timeScale;
    }
    if (this.outerDiskRef) {
      this.outerDiskRef.rotation.z += delta * 0.3 * this.timeScale;
    }

    // Pulse event horizon slightly
    if (this.eventHorizonRef) {
      const scale = 1.0 + Math.sin(Date.now() * 0.001) * 0.05;
      this.eventHorizonRef.scale.setScalar(scale);
    }

    // Position lensing arcs based on camera angle - smooth billboarding
    if (this.topArcRef && this.bottomArcRef) {
      // Check if camera is looking up or down at the disk
      const cameraPos = this.camera.position.clone();
      const cameraIsAbove = cameraPos.y > this.group.position.y;
      const arcOffset = 0.21; // Further reduced (0.3 * 0.7)

      if (cameraIsAbove) {
        // Camera above: arcs in normal positions
        this.topArcRef.position.set(0, arcOffset, 0);
        this.bottomArcRef.position.set(0, -arcOffset, 0);

        // Calculate rotation to face camera from above
        const up = new THREE.Vector3(0, 1, 0);
        const direction = cameraPos.clone().normalize();
        const right = new THREE.Vector3()
          .crossVectors(up, direction)
          .normalize();
        const forward = new THREE.Vector3().crossVectors(right, up).normalize();

        const matrix = new THREE.Matrix4();
        matrix.makeBasis(right, up, forward);
        const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix);

        this.topArcRef.quaternion.copy(quaternion);
        this.bottomArcRef.quaternion.copy(quaternion);
      } else {
        // Camera below: flip the positions
        this.topArcRef.position.set(0, -arcOffset, 0);
        this.bottomArcRef.position.set(0, arcOffset, 0);

        // Calculate rotation to face camera from below (inverted up vector)
        const up = new THREE.Vector3(0, -1, 0);
        const direction = cameraPos.clone().normalize();
        const right = new THREE.Vector3()
          .crossVectors(up, direction)
          .normalize();
        const forward = new THREE.Vector3().crossVectors(right, up).normalize();

        const matrix = new THREE.Matrix4();
        matrix.makeBasis(right, up, forward);
        const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix);

        this.topArcRef.quaternion.copy(quaternion);
        this.bottomArcRef.quaternion.copy(quaternion);
      }
    }
  }

  /**
   * Get the Three.js group containing all black hole meshes
   */
  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (object.geometry) {
          object.geometry.dispose();
        }
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach((mat) => mat.dispose());
          } else {
            object.material.dispose();
          }
        }
      } else if (object instanceof THREE.Light) {
        object.dispose();
      }
    });
  }
}
