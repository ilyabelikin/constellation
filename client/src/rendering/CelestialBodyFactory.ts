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
   * Creates a ship mesh - a space-built vessel with modular design
   */
  createShipMesh(): THREE.Group {
    const shipGroup = new THREE.Group();

    // Base scale for the ship
    const shipScale = this.bodySizeMultiplier * 0.0135;

    // Materials for different ship components - all metallic with good visibility
    const hullMaterial = new THREE.MeshStandardMaterial({
      color: 0xbbd0e0,
      metalness: 0.85,
      roughness: 0.35,
      emissive: 0x3a5a6a,
      emissiveIntensity: 0.35,
    });

    const windowMaterial = new THREE.MeshStandardMaterial({
      color: 0x5577aa,
      metalness: 0.8,
      roughness: 0.25,
      emissive: 0x4466aa,
      emissiveIntensity: 0.6,
    });

    const engineMaterial = new THREE.MeshStandardMaterial({
      color: 0x6688aa,
      metalness: 0.85,
      roughness: 0.3,
      emissive: 0x223355,
      emissiveIntensity: 0.4,
    });

    const engineGlowMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a5a6a,
      metalness: 0.7,
      roughness: 0.2,
      emissive: 0x00ffff,
      emissiveIntensity: 1.5,
    });

    // Main hull - elongated octagonal prism (command section)
    const hullGeometry = new THREE.CylinderGeometry(
      shipScale * 0.4,
      shipScale * 0.5,
      shipScale * 2.0,
      8,
      1
    );
    const hull = new THREE.Mesh(hullGeometry, hullMaterial);
    hull.rotation.x = Math.PI / 2; // Orient along Z-axis
    hull.castShadow = true;
    hull.receiveShadow = true;
    shipGroup.add(hull);

    // Bridge/cockpit section (front)
    const bridgeGeometry = new THREE.ConeGeometry(
      shipScale * 0.4,
      shipScale * 0.8,
      8
    );
    const bridge = new THREE.Mesh(bridgeGeometry, hullMaterial);
    bridge.rotation.x = Math.PI / 2;
    bridge.position.z = shipScale * 1.4;
    bridge.castShadow = true;
    bridge.receiveShadow = true;
    shipGroup.add(bridge);

    // Cockpit windows
    const windowGeometry = new THREE.BoxGeometry(
      shipScale * 0.3,
      shipScale * 0.15,
      shipScale * 0.05
    );
    const window1 = new THREE.Mesh(windowGeometry, windowMaterial);
    window1.position.set(0, shipScale * 0.25, shipScale * 1.3);
    shipGroup.add(window1);

    // Cargo/engineering section (middle-rear)
    const cargoGeometry = new THREE.BoxGeometry(
      shipScale * 0.9,
      shipScale * 0.7,
      shipScale * 1.2
    );
    const cargo = new THREE.Mesh(cargoGeometry, hullMaterial);
    cargo.position.z = -shipScale * 0.4;
    cargo.castShadow = true;
    cargo.receiveShadow = true;
    shipGroup.add(cargo);

    // Engine nacelles (2x side engines)
    const nacelleGeometry = new THREE.CylinderGeometry(
      shipScale * 0.2,
      shipScale * 0.25,
      shipScale * 1.5,
      6
    );
    
    const nacelle1 = new THREE.Mesh(nacelleGeometry, engineMaterial);
    nacelle1.rotation.x = Math.PI / 2;
    nacelle1.position.set(shipScale * 0.6, 0, -shipScale * 0.5);
    nacelle1.castShadow = true;
    shipGroup.add(nacelle1);

    const nacelle2 = new THREE.Mesh(nacelleGeometry, engineMaterial);
    nacelle2.rotation.x = Math.PI / 2;
    nacelle2.position.set(-shipScale * 0.6, 0, -shipScale * 0.5);
    nacelle2.castShadow = true;
    shipGroup.add(nacelle2);

    // Engine glow (exhaust ports)
    const glowGeometry = new THREE.CylinderGeometry(
      shipScale * 0.18,
      shipScale * 0.15,
      shipScale * 0.2,
      6
    );
    
    const engineGlow1 = new THREE.Mesh(glowGeometry, engineGlowMaterial);
    engineGlow1.rotation.x = Math.PI / 2;
    engineGlow1.position.set(shipScale * 0.6, 0, -shipScale * 1.3);
    engineGlow1.userData.isPulsing = true;
    shipGroup.add(engineGlow1);

    const engineGlow2 = new THREE.Mesh(glowGeometry, engineGlowMaterial);
    engineGlow2.rotation.x = Math.PI / 2;
    engineGlow2.position.set(-shipScale * 0.6, 0, -shipScale * 1.3);
    engineGlow2.userData.isPulsing = true;
    shipGroup.add(engineGlow2);

    // Connecting struts between nacelles and hull
    const strutGeometry = new THREE.BoxGeometry(
      shipScale * 0.1,
      shipScale * 0.05,
      shipScale * 0.8
    );
    
    const strut1 = new THREE.Mesh(strutGeometry, hullMaterial);
    strut1.position.set(shipScale * 0.45, 0, -shipScale * 0.3);
    shipGroup.add(strut1);

    const strut2 = new THREE.Mesh(strutGeometry, hullMaterial);
    strut2.position.set(-shipScale * 0.45, 0, -shipScale * 0.3);
    shipGroup.add(strut2);

    // Turret mount (top of hull)
    const turretBaseGeometry = new THREE.CylinderGeometry(
      shipScale * 0.2,
      shipScale * 0.25,
      shipScale * 0.15,
      8
    );
    const turretBase = new THREE.Mesh(turretBaseGeometry, hullMaterial);
    turretBase.position.set(0, shipScale * 0.4, shipScale * 0.2);
    turretBase.castShadow = true;
    shipGroup.add(turretBase);

    // Turret rotating section
    const turretBodyGeometry = new THREE.SphereGeometry(
      shipScale * 0.18,
      16,
      16,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.6
    );
    const turretBody = new THREE.Mesh(turretBodyGeometry, engineMaterial);
    turretBody.position.set(0, shipScale * 0.48, shipScale * 0.2);
    turretBody.castShadow = true;
    shipGroup.add(turretBody);

    // Turret barrel (dual barrels)
    const barrelGeometry = new THREE.CylinderGeometry(
      shipScale * 0.04,
      shipScale * 0.04,
      shipScale * 0.5,
      8
    );
    
    const barrel1 = new THREE.Mesh(barrelGeometry, engineMaterial);
    barrel1.rotation.x = Math.PI / 2;
    barrel1.position.set(shipScale * 0.06, shipScale * 0.55, shipScale * 0.45);
    barrel1.castShadow = true;
    shipGroup.add(barrel1);

    const barrel2 = new THREE.Mesh(barrelGeometry, engineMaterial);
    barrel2.rotation.x = Math.PI / 2;
    barrel2.position.set(-shipScale * 0.06, shipScale * 0.55, shipScale * 0.45);
    barrel2.castShadow = true;
    shipGroup.add(barrel2);

    // Turret barrel tips (glowing when ready)
    const barrelTipGeometry = new THREE.CylinderGeometry(
      shipScale * 0.035,
      shipScale * 0.035,
      shipScale * 0.05,
      6
    );
    const barrelTipMaterial = new THREE.MeshStandardMaterial({
      color: 0x334455,
      metalness: 0.8,
      roughness: 0.3,
      emissive: 0xff4400,
      emissiveIntensity: 0.3,
    });
    
    const barrelTip1 = new THREE.Mesh(barrelTipGeometry, barrelTipMaterial);
    barrelTip1.rotation.x = Math.PI / 2;
    barrelTip1.position.set(shipScale * 0.06, shipScale * 0.55, shipScale * 0.7);
    shipGroup.add(barrelTip1);

    const barrelTip2 = new THREE.Mesh(barrelTipGeometry, barrelTipMaterial);
    barrelTip2.rotation.x = Math.PI / 2;
    barrelTip2.position.set(-shipScale * 0.06, shipScale * 0.55, shipScale * 0.7);
    shipGroup.add(barrelTip2);

    // Communication array / sensor tower (rear top)
    const antennaGeometry = new THREE.CylinderGeometry(
      shipScale * 0.03,
      shipScale * 0.03,
      shipScale * 0.4,
      4
    );
    const antenna = new THREE.Mesh(antennaGeometry, hullMaterial);
    antenna.position.set(0, shipScale * 0.4, -shipScale * 0.4);
    shipGroup.add(antenna);

    // Antenna dish
    const dishGeometry = new THREE.CylinderGeometry(
      shipScale * 0.12,
      shipScale * 0.08,
      shipScale * 0.05,
      8
    );
    const dish = new THREE.Mesh(dishGeometry, hullMaterial);
    dish.position.set(0, shipScale * 0.6, -shipScale * 0.4);
    shipGroup.add(dish);

    // Small accent lights along the hull (metallic housing with glow)
    const accentLightGeometry = new THREE.SphereGeometry(shipScale * 0.05, 8, 8);
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: 0x442200,
      metalness: 0.8,
      roughness: 0.3,
      emissive: 0xff6600,
      emissiveIntensity: 1.2,
    });
    
    // Port and starboard lights
    const portLight = new THREE.Mesh(accentLightGeometry, accentMaterial);
    portLight.position.set(shipScale * 0.5, 0, shipScale * 0.5);
    shipGroup.add(portLight);

    const starboardMaterial = new THREE.MeshStandardMaterial({
      color: 0x003300,
      metalness: 0.8,
      roughness: 0.3,
      emissive: 0x00ff00,
      emissiveIntensity: 1.2,
    });
    const starboardLight = new THREE.Mesh(accentLightGeometry, starboardMaterial);
    starboardLight.position.set(-shipScale * 0.5, 0, shipScale * 0.5);
    shipGroup.add(starboardLight);

    // Point lights for engine glow
    const engineLight1 = new THREE.PointLight(0x00ffff, 2, shipScale * 3);
    engineLight1.position.set(shipScale * 0.6, 0, -shipScale * 1.3);
    engineLight1.userData.isPulsing = true;
    shipGroup.add(engineLight1);

    const engineLight2 = new THREE.PointLight(0x00ffff, 2, shipScale * 3);
    engineLight2.position.set(-shipScale * 0.6, 0, -shipScale * 1.3);
    engineLight2.userData.isPulsing = true;
    shipGroup.add(engineLight2);

    // Ambient light for the ship so it's always visible
    const shipAmbientLight = new THREE.PointLight(0xffffff, 8, shipScale * 5);
    shipAmbientLight.position.set(0, 0, 0); // At ship center
    shipGroup.add(shipAmbientLight);

    return shipGroup;
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
