import * as THREE from "three";
import { MaterialFactory } from "./MaterialFactory.js";

/**
 * Factory for creating Three.js meshes for celestial bodies and ships
 */
export class CelestialBodyFactory {
  private materialFactory: MaterialFactory;
  private scale: number;
  private bodySizeMultiplier: number;

  constructor(scale: number, bodySizeMultiplier: number) {
    this.materialFactory = new MaterialFactory();
    this.scale = scale;
    this.bodySizeMultiplier = bodySizeMultiplier;
  }

  /**
   * Creates a star mesh with glow layers and lighting
   */
  createStar(star: any, scene: THREE.Scene): THREE.Mesh {
    const radius = star.radius * this.scale * this.bodySizeMultiplier;
    const geometry = new THREE.SphereGeometry(radius, 64, 64);

    const material = this.materialFactory.createStarMaterial(
      star.color || 0xffff00
    );

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { id: star.id, type: "star", body: star };

    // Add bright point light from the star (no distance limit, minimal decay for visibility)
    const light = new THREE.PointLight(star.color || 0xffff00, 30, 0, 0.5);
    light.position.set(0, 0, 0);

    // Enable shadows from the star with high quality settings
    light.castShadow = true;
    light.shadow.mapSize.width = 4096; // Higher resolution for better moon shadows
    light.shadow.mapSize.height = 4096;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 1000000;
    light.shadow.bias = -0.00001; // Fine-tuned to prevent shadow acne
    light.shadow.radius = 2; // Soft shadow edges

    scene.add(light);

    // Add multiple layers of glow around the star for enhanced radiance
    // Attach them to the star mesh so they're automatically cleaned up
    const glowLayers = [
      { size: 1.1, opacity: 0.8 },
      { size: 1.2, opacity: 0.6 },
      { size: 1.35, opacity: 0.4 },
    ];

    glowLayers.forEach((layer) => {
      const glowGeometry = new THREE.SphereGeometry(
        radius * layer.size,
        32,
        32
      );
      const glowMaterial = this.materialFactory.createGlowMaterial(
        star.color || 0xffff00,
        layer.opacity
      );
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      mesh.add(glow); // Attach to star mesh instead of scene
    });

    // Add ambient light for the system (so planets are always somewhat visible)
    const ambient = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambient);

    return mesh;
  }

  /**
   * Creates a planet mesh with optional atmosphere
   */
  createPlanet(planet: any): THREE.Mesh {
    const radius = planet.radius * this.scale * this.bodySizeMultiplier;
    const geometry = new THREE.SphereGeometry(radius, 64, 64);

    // Calculate orbital distance for temperature-based features
    const orbitalDistance = planet.orbitalElements?.semiMajorAxis || 0;

    const material = this.materialFactory.createPlanetMaterial(
      planet.color || 0x888888,
      planet.surfaceType || "smooth",
      planet.id, // Pass planet ID as seed for unique textures
      orbitalDistance // Pass orbital distance for environmental effects
    );

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { id: planet.id, type: "planet", body: planet };

    // Enable shadows for planets
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Add atmosphere if planet has one
    // Skip for gas giants - their surface texture IS the atmosphere
    const isGasGiant = planet.surfaceType === "banded";
    if (planet.hasAtmosphere && !isGasGiant) {
      const atmosphereRadius = radius * 1.08; // 8% larger than planet for more visible glow
      const atmosphereGeometry = new THREE.SphereGeometry(
        atmosphereRadius,
        32,
        32
      );

      const atmosphereMaterial = this.materialFactory.createAtmosphereMaterial(
        planet.color || 0x88ccff
      );

      const atmosphereMesh = new THREE.Mesh(
        atmosphereGeometry,
        atmosphereMaterial
      );
      mesh.add(atmosphereMesh); // Attach to planet so it rotates together

      // Add weather/cloud layers (for terrestrial planets only)
      const cloudCoverage = planet.cloudCoverage || 0.5;
      const cloudColor1 = 0xffffff; // White clouds for terrestrial planets
      const cloudColor2 = 0xffffff; // White clouds for terrestrial planets

      // Layer 1: Lower clouds (faster rotation)
      const cloudRadius1 = radius * 1.02; // Just above surface
      const cloudGeometry1 = new THREE.SphereGeometry(cloudRadius1, 48, 48);
      const cloudMaterial1 = this.materialFactory.createCloudMaterial(
        cloudColor1,
        cloudCoverage
      );
      const cloudMesh1 = new THREE.Mesh(cloudGeometry1, cloudMaterial1);
      cloudMesh1.userData.cloudLayer = 1;
      cloudMesh1.userData.rotationSpeed = 0.3; // Faster rotation
      mesh.add(cloudMesh1);

      // Layer 2: Upper clouds (slower rotation, less dense)
      const cloudRadius2 = radius * 1.035; // Between surface and atmosphere
      const cloudGeometry2 = new THREE.SphereGeometry(cloudRadius2, 48, 48);
      const cloudMaterial2 = this.materialFactory.createCloudMaterial(
        cloudColor2,
        cloudCoverage * 0.6 // Upper layer has 60% of base coverage
      );
      const cloudMesh2 = new THREE.Mesh(cloudGeometry2, cloudMaterial2);
      cloudMesh2.userData.cloudLayer = 2;
      cloudMesh2.userData.rotationSpeed = 0.15; // Slower rotation
      mesh.add(cloudMesh2);
    }

    return mesh;
  }

  /**
   * Creates an orbit line for a planet
   */
  createOrbitLine(planet: any): THREE.Line {
    if (!planet.orbitalElements) {
      throw new Error("Planet must have orbital elements to create orbit line");
    }

    const oe = planet.orbitalElements;
    const a = oe.semiMajorAxis * this.scale;
    const e = oe.eccentricity;
    const segments = 128;

    // Create ellipse points in orbital plane
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const trueAnomaly = (i / segments) * Math.PI * 2;
      const r = (a * (1 - e * e)) / (1 + e * Math.cos(trueAnomaly));

      // Position in orbital plane
      const x_orb = r * Math.cos(trueAnomaly);
      const y_orb = r * Math.sin(trueAnomaly);

      // Apply 3D rotations: argument of periapsis, inclination, longitude of ascending node
      const cosΩ = Math.cos(oe.longitudeOfAscendingNode);
      const sinΩ = Math.sin(oe.longitudeOfAscendingNode);
      const cosω = Math.cos(oe.argumentOfPeriapsis);
      const sinω = Math.sin(oe.argumentOfPeriapsis);
      const cosi = Math.cos(oe.inclination);
      const sini = Math.sin(oe.inclination);

      // Transform from orbital plane to 3D space using proper rotation matrices
      const x =
        x_orb * (cosΩ * cosω - sinΩ * sinω * cosi) -
        y_orb * (cosΩ * sinω + sinΩ * cosω * cosi);
      const y = x_orb * sinω * sini + y_orb * cosω * sini;
      const z =
        x_orb * (sinΩ * cosω + cosΩ * sinω * cosi) -
        y_orb * (sinΩ * sinω - cosΩ * cosω * cosi);

      points.push(new THREE.Vector3(x, y, z));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0x888888, // Gray color for better visibility
      opacity: 0.5,
      transparent: true,
    });
    const line = new THREE.Line(geometry, material);

    return line;
  }

  /**
   * Creates a ship mesh
   */
  createShipMesh(): THREE.Mesh {
    const geometry = new THREE.ConeGeometry(2, 6, 4);
    const material = this.materialFactory.createShipMaterial();
    return new THREE.Mesh(geometry, material);
  }

  /**
   * Creates a star gate mesh with futuristic design
   */
  createGate(gate: any, isExplored: boolean): THREE.Group {
    const gateGroup = new THREE.Group();
    gateGroup.userData = { id: gate.id, type: "gate", gate };

    // Gate color based on exploration status
    const gateColor = isExplored ? 0xfbbf24 : 0xa855f7; // Yellow vs Purple

    // Main outer ring (torus) - 3x smaller than before
    const ringRadius = 5;
    const tubeRadius = 0.7;
    const ringGeometry = new THREE.TorusGeometry(
      ringRadius,
      tubeRadius,
      16,
      32
    );
    const ringMaterial = this.materialFactory.createGateMaterial(
      gateColor,
      isExplored
    );
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    gateGroup.add(ring);

    // Inner rotating cylinder (the "portal" core)
    const coreRadius = ringRadius * 0.7;
    const coreHeight = 1.3;
    const coreGeometry = new THREE.CylinderGeometry(
      coreRadius,
      coreRadius,
      coreHeight,
      32
    );
    const coreMaterial = this.materialFactory.createGateMaterial(
      gateColor,
      isExplored
    );
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    core.rotation.x = Math.PI / 2; // Rotate to align with ring
    core.userData.rotatingCore = true; // Mark for animation
    gateGroup.add(core);

    // Decorative spheres at cardinal points
    const spherePositions = [
      { x: ringRadius + tubeRadius + 0.7, y: 0, z: 0 },
      { x: -(ringRadius + tubeRadius + 0.7), y: 0, z: 0 },
      { x: 0, y: ringRadius + tubeRadius + 0.7, z: 0 },
      { x: 0, y: -(ringRadius + tubeRadius + 0.7), z: 0 },
    ];

    for (const pos of spherePositions) {
      const sphereGeometry = new THREE.SphereGeometry(0.4, 16, 16);
      const sphereMaterial = new THREE.MeshStandardMaterial({
        color: gateColor,
        emissive: gateColor,
        emissiveIntensity: 1.5,
        metalness: 0.8,
        roughness: 0.2,
      });
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      sphere.position.set(pos.x, pos.y, pos.z);
      gateGroup.add(sphere);

      // Add glow around spheres
      const glowGeometry = new THREE.SphereGeometry(0.6, 16, 16);
      const glowMaterial = this.materialFactory.createGlowMaterial(
        gateColor,
        0.4
      );
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      glow.position.set(pos.x, pos.y, pos.z);
      gateGroup.add(glow);
    }

    // Add a point light for the gate
    const gateLight = new THREE.PointLight(gateColor, 5, 100);
    gateLight.position.set(0, 0, 0);
    gateGroup.add(gateLight);

    return gateGroup;
  }

  /**
   * Creates an asteroid mesh with shape and composition variation
   */
  createAsteroid(asteroid: any): THREE.Mesh {
    // Use a larger multiplier for asteroids so they're visible
    // (asteroids are 10-500m vs planets are thousands of km)
    const asteroidSizeMultiplier = this.bodySizeMultiplier * 3;
    let radius = asteroid.radius * this.scale * asteroidSizeMultiplier;

    // Ensure minimum visible size (asteroids are tiny in real scale)
    const minVisibleRadius = 0.5; // Minimum 0.5 units in scene
    radius = Math.max(radius, minVisibleRadius);

    let geometry: THREE.BufferGeometry;

    // Create geometry based on shape
    if (asteroid.shape === "spherical") {
      // More spherical asteroids
      geometry = new THREE.SphereGeometry(radius, 16, 16);
    } else if (asteroid.shape === "elliptical") {
      // Elongated/elliptical asteroids
      geometry = new THREE.SphereGeometry(radius, 16, 16);
      // Scale along one axis to make it elliptical
      geometry.scale(1.5, 0.8, 1.0);
    } else {
      // Rugged/irregular asteroids
      geometry = this.createRuggedAsteroidGeometry(radius);
    }

    const composition = asteroid.composition || "silica";
    const shape = asteroid.shape || "rugged";
    const material = this.materialFactory.createAsteroidMaterial(
      composition,
      asteroid.color || 0x888888,
      shape
    );

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = {
      id: asteroid.id,
      type: "asteroid",
      body: asteroid,
      rotationRate: asteroid.rotationRate || 0,
    };

    // Enable shadows for asteroids
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  /**
   * Creates a rugged/irregular asteroid geometry using noise
   */
  private createRuggedAsteroidGeometry(radius: number): THREE.BufferGeometry {
    const geometry = new THREE.SphereGeometry(radius, 16, 16);
    const positions = geometry.attributes.position;

    // Apply random displacement to vertices for rugged appearance
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      // Normalize to get direction
      const length = Math.sqrt(x * x + y * y + z * z);
      const nx = x / length;
      const ny = y / length;
      const nz = z / length;

      // Apply noise-based displacement (pseudo-random based on position)
      const noise =
        Math.sin(nx * 5.3 + ny * 3.7) *
        Math.cos(ny * 4.1 + nz * 6.2) *
        Math.sin(nz * 3.9 + nx * 5.1);

      const displacement = radius * (0.7 + noise * 0.3); // 70-100% of radius

      positions.setXYZ(
        i,
        nx * displacement,
        ny * displacement,
        nz * displacement
      );
    }

    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Creates a moon mesh with shape and composition variation
   * Similar to asteroids but with less extreme ruggedness
   */
  createMoon(moon: any): THREE.Mesh {
    // Moons use similar size multiplier to asteroids but scaled for visibility
    const moonSizeMultiplier = this.bodySizeMultiplier * 2.5;
    let radius = moon.radius * this.scale * moonSizeMultiplier;

    // Ensure minimum visible size
    const minVisibleRadius = 0.3;
    radius = Math.max(radius, minVisibleRadius);

    let geometry: THREE.BufferGeometry;

    // Create geometry based on shape
    if (moon.shape === "spherical") {
      // Spherical moons (like Earth's moon)
      geometry = new THREE.SphereGeometry(radius, 24, 24);
    } else if (moon.shape === "elliptical") {
      // Elliptical moons (slightly elongated)
      geometry = new THREE.SphereGeometry(radius, 24, 24);
      geometry.scale(1.3, 0.9, 1.0);
    } else {
      // Rugged/irregular moons (like Phobos/Deimos)
      // Less extreme than asteroids - angular but not spiky
      geometry = this.createRuggedMoonGeometry(radius);
    }

    const composition = moon.composition || "silica";
    const shape = moon.shape || "rugged";
    const material = this.materialFactory.createAsteroidMaterial(
      composition,
      moon.color || 0x888888,
      shape
    );

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = {
      id: moon.id,
      type: "moon",
      body: moon,
      rotationRate: moon.rotationRate || 0,
    };

    // Enable shadows for moons
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  /**
   * Creates a rugged moon geometry with moderate irregularity
   * Less extreme than asteroids - angular but not spiky
   */
  private createRuggedMoonGeometry(radius: number): THREE.BufferGeometry {
    const geometry = new THREE.SphereGeometry(radius, 20, 20);
    const positions = geometry.attributes.position;

    // Apply moderate displacement for angular appearance
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      // Normalize to get direction
      const length = Math.sqrt(x * x + y * y + z * z);
      const nx = x / length;
      const ny = y / length;
      const nz = z / length;

      // Apply noise-based displacement (less extreme than asteroids)
      const noise =
        Math.sin(nx * 4.0 + ny * 2.5) *
        Math.cos(ny * 3.2 + nz * 4.8) *
        Math.sin(nz * 3.0 + nx * 3.8);

      // More moderate displacement: 80-100% of radius (vs 70-100% for asteroids)
      const displacement = radius * (0.8 + noise * 0.2);

      positions.setXYZ(
        i,
        nx * displacement,
        ny * displacement,
        nz * displacement
      );
    }

    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Creates planetary rings for a gas giant
   * Returns a Group containing all ring bands with proper inclination
   */
  createRings(planet: any): THREE.Group | null {
    if (!planet.rings || planet.rings.length === 0) {
      return null;
    }

    const ringGroup = new THREE.Group();
    ringGroup.userData = {
      id: `${planet.id}-rings`,
      type: "rings",
      parentId: planet.id,
    };

    // Create each ring band as a separate mesh
    for (const ring of planet.rings) {
      // Apply same scaling as the planet itself (scale + bodySizeMultiplier)
      const innerRadius =
        ring.innerRadius * this.scale * this.bodySizeMultiplier;
      const outerRadius =
        ring.outerRadius * this.scale * this.bodySizeMultiplier;

      // Create ring geometry
      const geometry = new THREE.RingGeometry(
        innerRadius,
        outerRadius,
        128, // segments (high for smooth rings)
        8 // phi segments (radial detail)
      );

      // Rotate UV coordinates to make the ring texture radial
      const uvs = geometry.attributes.uv.array;
      for (let i = 0; i < uvs.length; i += 2) {
        const u = uvs[i];
        const v = uvs[i + 1];
        // Keep radial UVs for potential texture mapping
        uvs[i] = u;
        uvs[i + 1] = v;
      }

      // Create semi-transparent material with the ring's color
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(ring.color),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: ring.opacity,
        depthWrite: false, // Important for proper transparency blending
      });

      const ringMesh = new THREE.Mesh(geometry, material);
      ringMesh.renderOrder = 1; // Render after opaque objects but in order

      // Apply inclination (tilt) to the ring
      ringMesh.rotation.x = Math.PI / 2 + ring.inclination; // Rotate from vertical to horizontal + tilt

      ringGroup.add(ringMesh);
    }

    return ringGroup;
  }

  /**
   * Gets the material factory (for updating shader uniforms)
   */
  getMaterialFactory(): MaterialFactory {
    return this.materialFactory;
  }
}
