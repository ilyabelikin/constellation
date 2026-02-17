import * as THREE from "three";
import { MaterialFactory } from "./MaterialFactory.js";
import { BlackHoleRenderer, BlackHoleData } from "./BlackHoleRenderer.js";
import { PlanetaryRing } from "@constellation/shared";
import { seededRandom } from "./materials/planetColorUtils.js";
import { ShipFactory } from "./ShipFactory.js";

/**
 * Factory for creating Three.js meshes for celestial bodies and ships
 */
export class CelestialBodyFactory {
  private materialFactory: MaterialFactory;
  private shipFactory: ShipFactory;
  private scale: number;
  private bodySizeMultiplier: number;
  private blackHoleRenderers: Map<string, BlackHoleRenderer> = new Map();

  constructor(scale: number, bodySizeMultiplier: number) {
    this.materialFactory = new MaterialFactory();
    this.shipFactory = new ShipFactory(bodySizeMultiplier);
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
    
    // Store userData including light reference for dimming
    mesh.userData = { id: star.id, type: "star", body: star, light: light };

    // For very large stars (like blue giants), skip glow layers entirely to prevent aliasing
    // The star surface shader itself provides enough visual interest
    // Only add glow for smaller stars
    const starSizeThreshold = 50; // Adjust based on your scale

    // Add ambient light for the system (so planets are always somewhat visible)
    const ambient = new THREE.AmbientLight(0x404040, 0.3);
    scene.add(ambient);

    return mesh;
  }

  /**
   * Creates a planet mesh with optional atmosphere
   */
  createPlanet(planet: any): THREE.Mesh {
    const radius = planet.radius * this.scale * this.bodySizeMultiplier;

    // Use higher geometry detail for planets with vertex displacement
    const hasDisplacement = planet.surfaceType === "cratered" || 
                           planet.surfaceType === "rocky" || 
                           planet.surfaceType === "barren";
    const segments = hasDisplacement ? 256 : 64; // 4x detail for worlds with displacement
    const geometry = new THREE.SphereGeometry(radius, segments, segments);

    // Calculate orbital distance for temperature-based features
    const orbitalDistance = planet.orbitalElements?.semiMajorAxis || 0;

    const material = this.materialFactory.createPlanetMaterial(
      planet.color || 0x888888,
      planet.surfaceType || "smooth",
      planet.id, // Pass planet ID as seed for unique textures
      orbitalDistance, // Pass orbital distance for environmental effects
      planet.habitability, // Pass habitability for ice cap sizing
      planet.civilizationLevel, // Pass civilization level for city lights
      planet.hasAtmosphere // Pass atmosphere flag for desert craters/sandstorms
    );

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { id: planet.id, type: "planet", body: planet };

    // Enable shadows for planets
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Add atmosphere if planet has one
    // Skip for gas giants - their surface texture IS the atmosphere
    const isGasGiant = planet.surfaceType === "gas_giant";
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
      const isDesert = planet.surfaceType === "desert";
      const isIcy = planet.surfaceType === "icy";

      // Use specific atmosphere material based on planet type
      const atmosphereMaterial = isTerrestrial
        ? this.materialFactory.createTerrestrialAtmosphereGlowMaterial(
            planetSeed
          )
        : isDesert
        ? this.materialFactory.createDesertAtmosphereGlowMaterial(planetSeed)
        : isIcy
        ? this.materialFactory.createGenericAtmosphereMaterial(
            planet.color || 0xd0e8ff,
            0.5 // Thin ice world atmosphere (50% opacity)
          )
        : this.materialFactory.createGenericAtmosphereMaterial(
            planet.color || 0x88ccff
          );

      const atmosphereMesh = new THREE.Mesh(
        atmosphereGeometry,
        atmosphereMaterial
      );
      mesh.add(atmosphereMesh); // Attach to planet so it rotates together

      // Add weather/cloud layers (for terrestrial, desert, and ice planets)
      if (isTerrestrial || isDesert || isIcy) {
        const cloudCoverage = planet.cloudCoverage || 0.5;

        if (isDesert) {
          // Desert planets: Use new sand storm material with multi-directional wind
          const stormColor1 = 0xd4a373; // Sandy/golden base
          const stormColor2 = 0xc89060; // Darker tan

          // Layer 1: Lower sand storms (thicker, more opaque)
          const cloudRadius1 = radius * 1.02; // Just above surface
          const cloudGeometry1 = new THREE.SphereGeometry(cloudRadius1, 48, 48);
          const cloudMaterial1 = this.materialFactory.createDesertCloudMaterial(
            stormColor1,
            cloudCoverage * 0.5, // Moderate storm coverage
            planetSeed
          );
          const cloudMesh1 = new THREE.Mesh(cloudGeometry1, cloudMaterial1);
          cloudMesh1.userData.cloudLayer = 1;
          cloudMesh1.userData.isDesertStorm = true; // Mark as desert storm layer
          cloudMesh1.userData.rotationSpeed = 0.4; // Still sync with planet somewhat
          mesh.add(cloudMesh1);

          // Layer 2: Upper dust layer (thinner, wispy)
          const cloudRadius2 = radius * 1.035; // Between surface and atmosphere
          const cloudGeometry2 = new THREE.SphereGeometry(cloudRadius2, 48, 48);
          const cloudMaterial2 = this.materialFactory.createDesertCloudMaterial(
            stormColor2,
            cloudCoverage * 0.3, // Thinner high-altitude dust
            planetSeed + 1000 // Different seed for upper layer
          );
          const cloudMesh2 = new THREE.Mesh(cloudGeometry2, cloudMaterial2);
          cloudMesh2.userData.cloudLayer = 2;
          cloudMesh2.userData.isDesertStorm = true; // Mark as desert storm layer
          cloudMesh2.userData.rotationSpeed = 0.2; // Slower upper layer
          mesh.add(cloudMesh2);
        } else if (isIcy) {
          // Ice planets: Use ice crystal/frost cloud material (thin atmosphere)
          const frostColor1 = 0xf0f8ff; // Pale icy blue
          const frostColor2 = 0xe8f4f8; // Slightly darker icy blue

          // Layer 1: Lower frost layer (sparse ice crystals)
          const cloudRadius1 = radius * 1.02; // Just above surface
          const cloudGeometry1 = new THREE.SphereGeometry(cloudRadius1, 48, 48);
          const cloudMaterial1 = this.materialFactory.createIceCloudMaterial(
            frostColor1,
            cloudCoverage * 0.2, // Sparse frost coverage (thin atmosphere)
            planetSeed
          );
          const cloudMesh1 = new THREE.Mesh(cloudGeometry1, cloudMaterial1);
          cloudMesh1.userData.cloudLayer = 1;
          cloudMesh1.userData.isIceFrost = true; // Mark as ice frost layer
          cloudMesh1.userData.rotationSpeed = 1.0; // Rotates with planet (thin atmosphere)
          mesh.add(cloudMesh1);

          // Layer 2: Upper frost layer (very wispy ice crystals)
          const cloudRadius2 = radius * 1.035; // Between surface and atmosphere
          const cloudGeometry2 = new THREE.SphereGeometry(cloudRadius2, 48, 48);
          const cloudMaterial2 = this.materialFactory.createIceCloudMaterial(
            frostColor2,
            cloudCoverage * 0.12, // Very thin high-altitude frost
            planetSeed + 1000 // Different seed for upper layer
          );
          const cloudMesh2 = new THREE.Mesh(cloudGeometry2, cloudMaterial2);
          cloudMesh2.userData.cloudLayer = 2;
          cloudMesh2.userData.isIceFrost = true; // Mark as ice frost layer
          cloudMesh2.userData.rotationSpeed = 1.0; // Rotates with planet (thin atmosphere)
          mesh.add(cloudMesh2);
        } else {
          // Terrestrial planets: Use regular cloud material
          const cloudColor1 = 0xffffff;
          const cloudColor2 = 0xffffff;

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
          cloudMesh1.userData.rotationSpeed = 0.3;
          mesh.add(cloudMesh1);

          // Layer 2: Upper clouds (slower rotation, less dense)
          const cloudRadius2 = radius * 1.035; // Between surface and atmosphere
          const cloudGeometry2 = new THREE.SphereGeometry(cloudRadius2, 48, 48);
          const cloudMaterial2 = this.materialFactory.createCloudMaterial(
            cloudColor2,
            cloudCoverage * 0.6,
            planetSeed + 1000 // Slightly different seed for upper layer
          );
          const cloudMesh2 = new THREE.Mesh(cloudGeometry2, cloudMaterial2);
          cloudMesh2.userData.cloudLayer = 2;
          cloudMesh2.userData.rotationSpeed = 0.15;
          mesh.add(cloudMesh2);
        }
      }
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
   * Creates a ship mesh using the ShipFactory
   * Defaults to the basic design with turret
   */
  createShipMesh(): THREE.Group {
    return this.shipFactory.createShip("basic");
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

    const noiseSeed = asteroid.noiseSeed || 0;
    let geometry: THREE.BufferGeometry;

    // Create geometry based on shape
    if (asteroid.shape === "spherical") {
      geometry = new THREE.SphereGeometry(radius, 16, 16);
    } else if (asteroid.shape === "elliptical") {
      geometry = new THREE.SphereGeometry(radius, 16, 16);
      geometry.scale(1.5, 0.8, 1.0);
    } else if (asteroid.shape === "faceted") {
      geometry = this.createFacetedGeometry(radius, 1, noiseSeed);
    } else if (asteroid.shape === "binary") {
      geometry = this.createBinaryGeometry(radius, 16, noiseSeed);
    } else {
      // Rugged/irregular asteroids (default)
      geometry = this.createRuggedGeometry(radius, 16, 0.7, 0.3, noiseSeed);
    }

    const composition = asteroid.composition || "silica";
    const shape = asteroid.shape || "rugged";
    const material = this.materialFactory.createAsteroidMaterial(
      composition,
      asteroid.color || 0x888888,
      shape,
      noiseSeed
    );

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = {
      id: asteroid.id,
      type: "asteroid",
      body: asteroid,
      rotationRate: asteroid.rotationRate || 0,
    };

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  /**
   * Creates a moon mesh with shape and composition variation
   * Similar to asteroids but with less extreme ruggedness
   */
  createMoon(moon: any): THREE.Mesh {
    const moonSizeMultiplier = this.bodySizeMultiplier * 2.5;
    let radius = moon.radius * this.scale * moonSizeMultiplier;

    const minVisibleRadius = 0.3;
    radius = Math.max(radius, minVisibleRadius);

    const noiseSeed = moon.noiseSeed || 0;
    let geometry: THREE.BufferGeometry;

    // Create geometry based on shape
    if (moon.shape === "spherical") {
      geometry = new THREE.SphereGeometry(radius, 24, 24);
    } else if (moon.shape === "elliptical") {
      geometry = new THREE.SphereGeometry(radius, 24, 24);
      geometry.scale(1.3, 0.9, 1.0);
    } else if (moon.shape === "faceted") {
      geometry = this.createFacetedGeometry(radius, 2, noiseSeed);
    } else if (moon.shape === "binary") {
      geometry = this.createBinaryGeometry(radius, 20, noiseSeed);
    } else {
      // Rugged moons -- less extreme than asteroids (80-100% vs 70-100%)
      geometry = this.createRuggedGeometry(radius, 20, 0.8, 0.2, noiseSeed);
    }

    const composition = moon.composition || "silica";
    const shape = moon.shape || "rugged";
    const material = this.materialFactory.createAsteroidMaterial(
      composition,
      moon.color || 0x888888,
      shape,
      noiseSeed
    );

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = {
      id: moon.id,
      type: "moon",
      body: moon,
      rotationRate: moon.rotationRate || 0,
    };

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  /**
   * Creates a rugged/irregular geometry using seeded noise displacement.
   * Used for both asteroids and moons with different parameters.
   */
  private createRuggedGeometry(
    radius: number,
    segments: number,
    baseDisplacement: number,
    noiseAmplitude: number,
    seed: number
  ): THREE.BufferGeometry {
    const geometry = new THREE.SphereGeometry(radius, segments, segments);
    const positions = geometry.attributes.position;

    // Seed offsets make each body unique
    const sx = seed * 1.37;
    const sy = seed * 2.51;
    const sz = seed * 0.73;

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      const length = Math.sqrt(x * x + y * y + z * z);
      const nx = x / length;
      const ny = y / length;
      const nz = z / length;

      const noise =
        Math.sin(nx * 5.3 + ny * 3.7 + sx) *
        Math.cos(ny * 4.1 + nz * 6.2 + sy) *
        Math.sin(nz * 3.9 + nx * 5.1 + sz);

      const displacement = radius * (baseDisplacement + noise * noiseAmplitude);

      positions.setXYZ(i, nx * displacement, ny * displacement, nz * displacement);
    }

    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Creates a faceted/angular geometry -- low-poly icosahedron with slight vertex jitter.
   * Looks like a rough crystal or fractured rock.
   */
  private createFacetedGeometry(
    radius: number,
    detail: number,
    seed: number
  ): THREE.BufferGeometry {
    const geometry = new THREE.IcosahedronGeometry(radius, detail);
    const positions = geometry.attributes.position;

    const sx = seed * 1.13;
    const sy = seed * 2.79;

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      const length = Math.sqrt(x * x + y * y + z * z);
      if (length === 0) continue;
      const nx = x / length;
      const ny = y / length;
      const nz = z / length;

      // Subtle jitter per vertex to break perfect icosahedron symmetry
      const jitter =
        Math.sin(nx * 7.1 + sy) *
        Math.cos(ny * 5.3 + nz * 8.7 + sx) * 0.12;

      const displacement = radius * (0.88 + jitter);

      positions.setXYZ(i, nx * displacement, ny * displacement, nz * displacement);
    }

    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Creates a contact binary (peanut/dumbbell) geometry -- two fused lobes.
   * Uses a radial profile curve: full radius at the two X-axis poles,
   * pinched at the equator to create the neck/waist.
   * Inspired by real objects like asteroid Arrokoth.
   */
  private createBinaryGeometry(
    radius: number,
    segments: number,
    seed: number
  ): THREE.BufferGeometry {
    const geometry = new THREE.SphereGeometry(radius, segments, segments);
    const positions = geometry.attributes.position;

    // Neck depth varies with seed (0.25 to 0.40 -- how pinched the waist is)
    const neckDepth = 0.25 + (Math.sin(seed * 3.17) * 0.5 + 0.5) * 0.15;
    // Asymmetry: one lobe slightly larger than the other (±0 to ±0.12)
    const asymmetry = (Math.sin(seed * 7.43) * 0.5 + 0.5) * 0.12;
    // Elongation along X axis to stretch the peanut shape
    const elongation = 1.15 + (Math.sin(seed * 2.31) * 0.5 + 0.5) * 0.15;

    const sx = seed * 1.91;
    const sy = seed * 0.67;
    const sz = seed * 1.23;

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      const length = Math.sqrt(x * x + y * y + z * z);
      if (length === 0) continue;
      const nx = x / length;
      const ny = y / length;
      const nz = z / length;

      // t = position along X axis (-1 to 1), this is the profile parameter
      const t = nx;
      // Waist profile: 1.0 at poles (t=±1), dips by neckDepth at equator (t=0)
      const waist = 1.0 - neckDepth * Math.pow(1.0 - t * t, 2);
      // Asymmetry makes one lobe slightly fatter
      const asym = 1.0 + asymmetry * t;

      // Surface roughness noise
      const noise =
        Math.sin(nx * 6.1 + ny * 4.3 + sx) *
        Math.cos(ny * 5.7 + nz * 3.2 + sy) *
        Math.sin(nz * 4.7 + nx * 3.1 + sz) * 0.05;

      const profileRadius = radius * waist * asym * (1.0 + noise);

      // Apply elongation along X, keep Y/Z as-is
      positions.setXYZ(
        i,
        nx * elongation * profileRadius,
        ny * profileRadius,
        nz * profileRadius
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
