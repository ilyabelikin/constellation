import * as THREE from "three";
import { MaterialFactory } from "./MaterialFactory.js";
import { BlackHoleRenderer, BlackHoleData } from "./BlackHoleRenderer.js";
import { PlanetaryRing } from "@constellation/shared";
import { seededRandom } from "./materials/planetColorUtils.js";

/**
 * Factory for creating Three.js meshes for celestial bodies and ships
 */
export class CelestialBodyFactory {
  private materialFactory: MaterialFactory;
  private scale: number;
  private bodySizeMultiplier: number;
  private blackHoleRenderers: Map<string, BlackHoleRenderer> = new Map();

  constructor(scale: number, bodySizeMultiplier: number) {
    this.materialFactory = new MaterialFactory();
    this.scale = scale;
    this.bodySizeMultiplier = bodySizeMultiplier;
  }

  /**
   * Creates a star mesh with glow layers and lighting
   */
  createStar(star: any, scene: THREE.Scene): THREE.Mesh | THREE.Group {
    const radius = star.radius * this.scale * this.bodySizeMultiplier;
    const isBlackHole =
      star.starType?.includes("Black Hole") || star.luminosity === 0;

    // Use new black hole renderer for black holes
    if (isBlackHole) {
      // Configure black hole data - very compact decorations
      const blackHoleData: BlackHoleData = {
        accretionDiskColor: "#ff6600", // Orange/red accretion disk
        accretionDiskInnerRadius: radius * 1.15, // Further reduced (1.2 * 0.7 ≈ 0.84, but keeping visible)
        accretionDiskOuterRadius: radius * 1.75, // Further reduced (2.5 * 0.7 = 1.75)
        eventHorizonRadius: radius,
        hawkingRadiation: true, // Enable Hawking radiation glow
      };

      // Create black hole renderer
      const blackHoleRenderer = new BlackHoleRenderer(
        blackHoleData,
        1.0,
        1.0,
        scene
      );

      // Store renderer for updates
      this.blackHoleRenderers.set(star.id, blackHoleRenderer);

      const group = blackHoleRenderer.getGroup();
      group.userData = {
        id: star.id,
        type: "star",
        body: star,
        isBlackHole: true,
      };

      // Add ambient light for the system (so planets are always somewhat visible)
      const ambient = new THREE.AmbientLight(0x404040, 0.5);
      scene.add(ambient);

      return group;
    }

    // Regular star rendering
    const geometry = new THREE.SphereGeometry(radius, 64, 64);
    const material = this.materialFactory.createStarMaterial(
      star.color || 0xffff00
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { id: star.id, type: "star", body: star };

    // Regular stars emit light
    const light = new THREE.PointLight(star.color || 0xffff00, 30, 0, 0.5);
    light.position.set(0, 0, 0);

    // Enable shadows from the star with high quality settings
    light.castShadow = true;
    light.shadow.mapSize.width = 4096;
    light.shadow.mapSize.height = 4096;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 1000000;
    light.shadow.bias = -0.00001;
    light.shadow.radius = 2;

    scene.add(light);

    // For very large stars (like blue giants), skip glow layers entirely to prevent aliasing
    // The star surface shader itself provides enough visual interest
    // Only add glow for smaller stars
    const starSizeThreshold = 50; // Adjust based on your scale

    if (radius < starSizeThreshold) {
      // Smaller stars: use glow layers with high polygon count
      const glowLayers = [
        { size: 1.05, opacity: 0.5 },
        { size: 1.15, opacity: 0.3 },
        { size: 1.3, opacity: 0.15 },
      ];

      glowLayers.forEach((layer) => {
        const glowGeometry = new THREE.SphereGeometry(
          radius * layer.size,
          256,
          256
        );
        const glowMaterial = new THREE.MeshBasicMaterial({
          color: star.color || 0xffff00,
          transparent: true,
          opacity: layer.opacity,
          blending: THREE.AdditiveBlending,
          side: THREE.FrontSide,
          depthWrite: false,
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        mesh.add(glow);
      });
    }
    // Large stars (blue giants, etc.) have no glow layers to prevent noise artifacts

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

    // Use higher geometry detail for cratered planets to show vertex displacement
    const isCratered = planet.surfaceType === "cratered";
    const segments = isCratered ? 256 : 64; // 4x detail for rocky worlds with displacement
    const geometry = new THREE.SphereGeometry(radius, segments, segments);

    // Calculate orbital distance for temperature-based features
    const orbitalDistance = planet.orbitalElements?.semiMajorAxis || 0;

    const material = this.materialFactory.createPlanetMaterial(
      planet.color || 0x888888,
      planet.surfaceType || "smooth",
      planet.id, // Pass planet ID as seed for unique textures
      orbitalDistance, // Pass orbital distance for environmental effects
      planet.habitability, // Pass habitability for ice cap sizing
      planet.civilizationLevel // Pass civilization level for city lights
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

      // Calculate planet seed for atmosphere sync
      const planetSeed = planet.id
        .split("")
        .reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
      const isTerrestrial = planet.surfaceType === "terrestrial";

      const atmosphereMaterial = this.materialFactory.createAtmosphereMaterial(
        planet.color || 0x88ccff,
        planetSeed,
        isTerrestrial
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
        cloudCoverage,
        planetSeed
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
        cloudCoverage * 0.6, // Upper layer has 60% of base coverage
        planetSeed + 1000 // Slightly different seed for upper layer
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

    // Adaptive segment count based on orbit size
    // Calculate circumference approximation (for ellipse with eccentricity)
    const circumference = 2 * Math.PI * a * Math.sqrt((1 + e * e) / 2);
    // Target: ~5 units per segment for smooth curves
    const segments = Math.max(128, Math.ceil(circumference / 5));

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
   * Creates a ship mesh - a pulsing sphere of light
   */
  createShipMesh(): THREE.Group {
    const shipGroup = new THREE.Group();

    // Create a glowing sphere for the ship (small but visible)
    const shipScale = this.bodySizeMultiplier * 0.0135; // 6x smaller than original
    const radius = shipScale;

    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const material = this.materialFactory.createShipMaterial();
    const mesh = new THREE.Mesh(geometry, material);

    // Enable shadows for the ship core
    mesh.castShadow = true;
    mesh.receiveShadow = false; // Glowing ships don't receive shadows

    // Mark for pulsing animation
    mesh.userData.isPulsing = true;

    shipGroup.add(mesh);

    // Add outer glow layers for enhanced pulsing effect
    const glowLayers = [
      { size: 1.3, opacity: 0.6 },
      { size: 1.6, opacity: 0.4 },
      { size: 2.0, opacity: 0.2 },
    ];

    glowLayers.forEach((layer) => {
      const glowGeometry = new THREE.SphereGeometry(
        radius * layer.size,
        16,
        16
      );
      const glowMaterial = this.materialFactory.createGlowMaterial(
        0x00ffff,
        layer.opacity
      );
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      glow.userData.isPulsing = true;
      glow.userData.glowLayer = layer.size;
      shipGroup.add(glow);
    });

    // Add a point light to the ship for illumination
    const shipLight = new THREE.PointLight(0x00ffff, 3, 50);
    shipLight.userData.isPulsing = true;
    shipGroup.add(shipLight);

    return shipGroup;
  }

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
    const ballMaterial = this.materialFactory.createEnergyBallMaterial(
      gateColor,
      isExplored
    );
    const energyBall = new THREE.Mesh(ballGeometry, ballMaterial);
    energyBall.userData.energyBall = true; // Mark for animation
    gateGroup.add(energyBall);

    // Outer glow layer
    const glowGeometry = new THREE.SphereGeometry(ballRadius * 1.4, 32, 32);
    const glowMaterial = this.materialFactory.createGlowMaterial(
      gateColor,
      0.3
    );
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

      const ribbonMaterial = this.materialFactory.createBannerMaterial(
        gateColor,
        isExplored
      );
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
   * Generates planetary rings for a gas giant using a seed
   * This allows client-side regeneration with different seeds (e.g., debug slider)
   */
  generateRingsFromSeed(
    seed: number,
    planetRadius: number,
    planetColor: string
  ): PlanetaryRing[] {
    const rings: PlanetaryRing[] = [];

    // Simple RNG using seededRandom function
    let rngCounter = 0;
    const next = () => {
      rngCounter++;
      return seededRandom(seed + rngCounter * 1000);
    };
    const nextFloat = (min: number, max: number) => {
      return min + next() * (max - min);
    };

    // Decide on ring complexity: 2-7 ring bands (including thin rings)
    const numBands = Math.floor(nextFloat(2, 7.5));

    // Ring starts at 1.5-2.5x planet radius
    const ringStartMultiplier = nextFloat(1.5, 2.5);
    const innerRadius = planetRadius * ringStartMultiplier;

    // Ring extends to 2.5-4.5x planet radius
    const ringEndMultiplier = nextFloat(2.5, 4.5);
    const outerRadius = planetRadius * ringEndMultiplier;

    // Ring inclination (tilt relative to orbital plane)
    // 70% chance: nearly aligned (0-10 degrees)
    // 30% chance: tilted (10-30 degrees)
    const inclinationChance = next();
    const inclination =
      inclinationChance < 0.7
        ? nextFloat(0, 0.175) // 0-10 degrees
        : nextFloat(0.175, 0.524); // 10-30 degrees

    // Parse planet color to create ring variations
    const baseColor = parseInt(planetColor.replace("#", ""), 16);
    const r = (baseColor >> 16) & 0xff;
    const g = (baseColor >> 8) & 0xff;
    const b = baseColor & 0xff;

    // Create ring bands with varying shades and widths
    const bandWidth = (outerRadius - innerRadius) / numBands;

    for (let i = 0; i < numBands; i++) {
      const bandInnerRadius = innerRadius + i * bandWidth;
      let bandOuterRadius = innerRadius + (i + 1) * bandWidth;

      // 30% chance for this to be a very thin ring
      const isThinRing = next() < 0.3;
      if (isThinRing) {
        // Make it very thin (5-15% of normal width)
        const thinFactor = nextFloat(0.05, 0.15);
        bandOuterRadius = bandInnerRadius + bandWidth * thinFactor;
      }

      // Add gaps between bands (larger gaps for regular rings, smaller for thin rings)
      const gapSize = isThinRing ? bandWidth * 0.05 : bandWidth * 0.1;
      const adjustedInnerRadius =
        i > 0 ? bandInnerRadius + gapSize / 2 : bandInnerRadius;
      const adjustedOuterRadius =
        i < numBands - 1 ? bandOuterRadius - gapSize / 2 : bandOuterRadius;

      // Vary shade for each band (darker to lighter or vice versa)
      const shadeFactor = nextFloat(0.6, 1.2);
      const bandR = Math.min(255, Math.floor(r * shadeFactor));
      const bandG = Math.min(255, Math.floor(g * shadeFactor));
      const bandB = Math.min(255, Math.floor(b * shadeFactor));

      const bandColor = `#${((1 << 24) + (bandR << 16) + (bandG << 8) + bandB)
        .toString(16)
        .slice(1)}`;

      // Vary opacity: thin rings are more translucent (0.2-0.4), regular rings (0.3-0.7)
      const opacity = isThinRing ? nextFloat(0.2, 0.4) : nextFloat(0.3, 0.7);

      rings.push({
        innerRadius: adjustedInnerRadius,
        outerRadius: adjustedOuterRadius,
        color: bandColor,
        opacity,
        inclination, // All bands share same inclination
      });
    }

    return rings;
  }

  /**
   * Creates ring visual group from rings array
   */
  createRingsGroup(rings: PlanetaryRing[], planetId: string): THREE.Group {
    const ringGroup = new THREE.Group();
    ringGroup.userData = {
      id: `${planetId}-rings`,
      type: "rings",
      parentId: planetId,
    };

    // Create each ring band as a separate mesh
    for (const ring of rings) {
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
   * Creates planetary rings for a gas giant from planet data
   * Returns a Group containing all ring bands with proper inclination
   */
  createRings(planet: any): THREE.Group | null {
    if (!planet.rings || planet.rings.length === 0) {
      return null;
    }
    return this.createRingsGroup(planet.rings, planet.id);
  }

  /**
   * Gets the material factory (for updating shader uniforms)
   */
  getMaterialFactory(): MaterialFactory {
    return this.materialFactory;
  }

  /**
   * Update black hole animations
   */
  updateBlackHoles(camera: THREE.Camera, delta: number): void {
    for (const renderer of this.blackHoleRenderers.values()) {
      renderer.setCamera(camera);
      renderer.update(delta);
    }
  }

  /**
   * Dispose of black hole renderers
   */
  disposeBlackHoles(): void {
    for (const renderer of this.blackHoleRenderers.values()) {
      renderer.dispose();
    }
    this.blackHoleRenderers.clear();
  }
}
