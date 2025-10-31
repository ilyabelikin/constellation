import * as THREE from "three";
import {
  createEnergyBallMaterial,
  createBannerMaterial,
  createGlowMaterial,
} from "./materials/GateMaterials.js";

/**
 * Factory for creating star gate meshes
 */
export class GateFactory {
  /**
   * Creates a star gate mesh as a pulsating energy ball with banner effects
   */
  createGate(gate: any, isExplored: boolean): THREE.Group {
    const gateGroup = new THREE.Group();
    gateGroup.userData = { id: gate.id, type: "gate", gate };

    // Gate color based on exploration status
    const gateColor = isExplored ? 0xfbbf24 : 0xa855f7; // Yellow vs Purple

    // Main energy ball
    const ballRadius = 4;
    const ballGeometry = new THREE.SphereGeometry(ballRadius, 32, 32);
    const ballMaterial = createEnergyBallMaterial(gateColor, isExplored);
    const energyBall = new THREE.Mesh(ballGeometry, ballMaterial);
    energyBall.userData.energyBall = true; // Mark for animation
    gateGroup.add(energyBall);

    // Outer glow layer
    const glowGeometry = new THREE.SphereGeometry(ballRadius * 1.4, 32, 32);
    const glowMaterial = createGlowMaterial(gateColor, 0.3);
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    gateGroup.add(glow);

    // Create flowing banner ribbons around the energy ball
    const numBanners = 3;
    const bannerRadius = ballRadius * 1.8;

    for (let i = 0; i < numBanners; i++) {
      const angle = (i / numBanners) * Math.PI * 2;

      // Create ribbon geometry - a curved plane
      const ribbonPoints: THREE.Vector3[] = [];
      const segments = 40;
      const ribbonLength = Math.PI * 2; // Full circle

      for (let j = 0; j <= segments; j++) {
        const t = (j / segments) * ribbonLength;
        const spiralAngle = angle + t;
        const heightOscillation = Math.sin(t * 2) * 2;

        // Create a flowing spiral pattern
        const x = Math.cos(spiralAngle) * bannerRadius;
        const y = heightOscillation;
        const z = Math.sin(spiralAngle) * bannerRadius;

        ribbonPoints.push(new THREE.Vector3(x, y, z));
      }

      // Create ribbon geometry with width
      const ribbonWidth = 1.5;
      const ribbonGeometry = new THREE.BufferGeometry();
      const positions: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];

      for (let j = 0; j < ribbonPoints.length; j++) {
        const point = ribbonPoints[j];
        const nextPoint =
          ribbonPoints[Math.min(j + 1, ribbonPoints.length - 1)];

        // Calculate perpendicular direction for ribbon width
        const direction = new THREE.Vector3()
          .subVectors(nextPoint, point)
          .normalize();
        const perpendicular = new THREE.Vector3(
          -direction.z,
          0,
          direction.x
        ).normalize();

        // Add vertices for both sides of the ribbon
        const offset = perpendicular.multiplyScalar(ribbonWidth / 2);
        positions.push(
          point.x + offset.x,
          point.y + offset.y,
          point.z + offset.z,
          point.x - offset.x,
          point.y - offset.y,
          point.z - offset.z
        );

        uvs.push(j / segments, 0);
        uvs.push(j / segments, 1);

        if (j < ribbonPoints.length - 1) {
          const baseIndex = j * 2;
          indices.push(
            baseIndex,
            baseIndex + 1,
            baseIndex + 2,
            baseIndex + 1,
            baseIndex + 3,
            baseIndex + 2
          );
        }
      }

      ribbonGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
      );
      ribbonGeometry.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(uvs, 2)
      );
      ribbonGeometry.setIndex(indices);
      ribbonGeometry.computeVertexNormals();

      const ribbonMaterial = createBannerMaterial(gateColor, isExplored);
      const ribbon = new THREE.Mesh(ribbonGeometry, ribbonMaterial);
      ribbon.userData.banner = true;
      ribbon.userData.bannerIndex = i;
      gateGroup.add(ribbon);
    }

    // Add energy particles/sparks
    const particleCount = 20;
    const particleGeometry = new THREE.BufferGeometry();
    const particlePositions: number[] = [];

    for (let i = 0; i < particleCount; i++) {
      // Random position around the ball
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const r = ballRadius * (1.1 + Math.random() * 0.3);

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      particlePositions.push(x, y, z);
    }

    particleGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(particlePositions, 3)
    );

    const particleMaterial = new THREE.PointsMaterial({
      color: gateColor,
      size: 0.3,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(particleGeometry, particleMaterial);
    particles.userData.particles = true;
    gateGroup.add(particles);

    // Add a stronger point light for the energy ball
    const gateLight = new THREE.PointLight(gateColor, 8, 150);
    gateLight.position.set(0, 0, 0);
    gateGroup.add(gateLight);

    return gateGroup;
  }
}

