import * as THREE from "three";

/**
 * Factory for creating Dyson Swarm visuals
 * Each swarm consists of 3 satellites orbiting the star
 */
export class DysonSwarmFactory {
  /**
   * Create satellites for a Dyson Swarm around a star
   * @param swarmIndex - Index of this swarm (0-9)
   * @param starRadius - Radius of the star in meters
   * @param currentTime - Current game time for orbital positions
   * @returns Array of THREE.Mesh objects representing satellites
   */
  createSwarmSatellites(
    swarmIndex: number,
    starRadius: number,
    currentTime: number
  ): THREE.Mesh[] {
    const satellites: THREE.Mesh[] = [];

    // Each swarm has 3 satellites
    const satellitesPerSwarm = 3;

    // Orbital distance: spread swarms across different orbital shells
    const baseOrbitRadius = starRadius * 3;
    const orbitSpacing = starRadius * 0.5;
    const orbitRadius = baseOrbitRadius + swarmIndex * orbitSpacing;

    // Create satellite geometry (small octahedron for a technical look)
    const satelliteGeometry = new THREE.OctahedronGeometry(
      starRadius * 0.05,
      0
    );

    // Material: bright blue for solar panels
    const satelliteMaterial = new THREE.MeshBasicMaterial({
      color: 0x4a90e2,
    });

    // Create 3 satellites evenly spaced around the orbit
    for (let i = 0; i < satellitesPerSwarm; i++) {
      const satellite = new THREE.Mesh(satelliteGeometry, satelliteMaterial);

      // Position satellites evenly around the orbit
      const angleOffset = (i / satellitesPerSwarm) * Math.PI * 2;

      // Base angle for this swarm (so different swarms don't overlap)
      const swarmBaseAngle = (swarmIndex / 10) * Math.PI * 2;

      // Add time-based rotation for orbital motion
      // Different speeds for different orbital shells
      const orbitalPeriod = 100 + swarmIndex * 10; // seconds
      const timeAngle = (currentTime / orbitalPeriod) * Math.PI * 2;

      const totalAngle = swarmBaseAngle + angleOffset + timeAngle;

      // Position satellite
      satellite.position.x = Math.cos(totalAngle) * orbitRadius;
      satellite.position.z = Math.sin(totalAngle) * orbitRadius;
      satellite.position.y = 0;

      // Store orbital data for animation updates
      (satellite.userData as any).orbitRadius = orbitRadius;
      (satellite.userData as any).angleOffset = angleOffset;
      (satellite.userData as any).swarmBaseAngle = swarmBaseAngle;
      (satellite.userData as any).orbitalPeriod = orbitalPeriod;
      (satellite.userData as any).swarmIndex = swarmIndex;
      (satellite.userData as any).satelliteIndex = i;

      satellites.push(satellite);
    }

    return satellites;
  }

  /**
   * Update satellite positions based on current time
   * @param satellites - Array of satellite meshes
   * @param currentTime - Current game time
   */
  updateSatellitePositions(
    satellites: THREE.Mesh[],
    currentTime: number
  ): void {
    for (const satellite of satellites) {
      const userData = satellite.userData as any;
      const timeAngle = (currentTime / userData.orbitalPeriod) * Math.PI * 2;
      const totalAngle =
        userData.swarmBaseAngle + userData.angleOffset + timeAngle;

      satellite.position.x = Math.cos(totalAngle) * userData.orbitRadius;
      satellite.position.z = Math.sin(totalAngle) * userData.orbitRadius;
    }
  }

  /**
   * Create orbital path visualization for a swarm
   * @param swarmIndex - Index of this swarm
   * @param starRadius - Radius of the star
   * @returns THREE.Line representing the orbital path
   */
  createOrbitalPath(swarmIndex: number, starRadius: number): THREE.Line {
    const baseOrbitRadius = starRadius * 3;
    const orbitSpacing = starRadius * 0.5;
    const orbitRadius = baseOrbitRadius + swarmIndex * orbitSpacing;

    const points: THREE.Vector3[] = [];
    const segments = 64;

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push(
        new THREE.Vector3(
          Math.cos(angle) * orbitRadius,
          0,
          Math.sin(angle) * orbitRadius
        )
      );
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0x4a90e2,
      opacity: 0.2,
      transparent: true,
    });

    return new THREE.Line(geometry, material);
  }
}
