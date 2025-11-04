import * as THREE from "three";

/**
 * Factory for creating different ship designs
 */
export class ShipFactory {
  private bodySizeMultiplier: number;

  constructor(bodySizeMultiplier: number) {
    this.bodySizeMultiplier = bodySizeMultiplier;
  }

  /**
   * Creates a ship mesh based on the specified design
   */
  createShip(design: "basic" | "futuristic" = "futuristic"): THREE.Group {
    switch (design) {
      case "basic":
        return this.createBasicShipWithTurret();
      case "futuristic":
        return this.createFuturisticShip();
      default:
        return this.createFuturisticShip();
    }
  }

  /**
   * Creates a basic ship with turret (original design)
   */
  private createBasicShipWithTurret(): THREE.Group {
    const shipGroup = new THREE.Group();
    const shipScale = this.bodySizeMultiplier * 0.0135;

    // Materials
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

    // Main hull
    const hullGeometry = new THREE.CylinderGeometry(
      shipScale * 0.4,
      shipScale * 0.5,
      shipScale * 2.0,
      8,
      1
    );
    const hull = new THREE.Mesh(hullGeometry, hullMaterial);
    hull.rotation.x = Math.PI / 2;
    hull.castShadow = true;
    hull.receiveShadow = true;
    shipGroup.add(hull);

    // Bridge/cockpit
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

    // Windows
    const windowGeometry = new THREE.BoxGeometry(
      shipScale * 0.3,
      shipScale * 0.15,
      shipScale * 0.05
    );
    const window1 = new THREE.Mesh(windowGeometry, windowMaterial);
    window1.position.set(0, shipScale * 0.25, shipScale * 1.3);
    shipGroup.add(window1);

    // Cargo section
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

    // Engine nacelles
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

    // Engine glow
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

    // Struts
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

    // Turret
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

    // Turret barrels
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

    // Antenna
    const antennaGeometry = new THREE.CylinderGeometry(
      shipScale * 0.03,
      shipScale * 0.03,
      shipScale * 0.4,
      4
    );
    const antenna = new THREE.Mesh(antennaGeometry, hullMaterial);
    antenna.position.set(0, shipScale * 0.4, -shipScale * 0.4);
    shipGroup.add(antenna);

    const dishGeometry = new THREE.CylinderGeometry(
      shipScale * 0.12,
      shipScale * 0.08,
      shipScale * 0.05,
      8
    );
    const dish = new THREE.Mesh(dishGeometry, hullMaterial);
    dish.position.set(0, shipScale * 0.6, -shipScale * 0.4);
    shipGroup.add(dish);

    // Navigation lights
    const accentLightGeometry = new THREE.SphereGeometry(shipScale * 0.05, 8, 8);
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: 0x442200,
      metalness: 0.8,
      roughness: 0.3,
      emissive: 0xff6600,
      emissiveIntensity: 1.2,
    });
    
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

    // Lighting
    const engineLight1 = new THREE.PointLight(0x00ffff, 2, shipScale * 3);
    engineLight1.position.set(shipScale * 0.6, 0, -shipScale * 1.3);
    engineLight1.userData.isPulsing = true;
    shipGroup.add(engineLight1);

    const engineLight2 = new THREE.PointLight(0x00ffff, 2, shipScale * 3);
    engineLight2.position.set(-shipScale * 0.6, 0, -shipScale * 1.3);
    engineLight2.userData.isPulsing = true;
    shipGroup.add(engineLight2);

    const shipAmbientLight = new THREE.PointLight(0xffffff, 8, shipScale * 5);
    shipAmbientLight.position.set(0, 0, 0);
    shipGroup.add(shipAmbientLight);

    return shipGroup;
  }

  /**
   * Creates an advanced civilization starship - sleek delta-wing design
   */
  private createFuturisticShip(): THREE.Group {
    const shipGroup = new THREE.Group();
    const shipScale = this.bodySizeMultiplier * 0.025;

    // Advanced materials - dark sleek hull with energy accents
    const hullMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a2a,
      metalness: 0.95,
      roughness: 0.15,
      emissive: 0x0a0a1a,
      emissiveIntensity: 0.3,
    });

    const armorMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2a3a,
      metalness: 0.92,
      roughness: 0.18,
      emissive: 0x1a1a2a,
      emissiveIntensity: 0.35,
    });

    const energyMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ccff,
      metalness: 0.7,
      roughness: 0.1,
      emissive: 0x00ddff,
      emissiveIntensity: 1.5,
    });

    const reactorMaterial = new THREE.MeshStandardMaterial({
      color: 0x0099ff,
      metalness: 0.65,
      roughness: 0.12,
      emissive: 0x00bbff,
      emissiveIntensity: 2.2,
    });

    const weaponMaterial = new THREE.MeshStandardMaterial({
      color: 0xff4400,
      metalness: 0.85,
      roughness: 0.15,
      emissive: 0xff6600,
      emissiveIntensity: 1.2,
    });

    // Main body - sleek arrowhead/delta shape
    const mainBodyGeometry = new THREE.ConeGeometry(
      shipScale * 0.6,
      shipScale * 2.5,
      6,
      1
    );
    const mainBody = new THREE.Mesh(mainBodyGeometry, hullMaterial);
    mainBody.rotation.x = Math.PI / 2;
    mainBody.position.z = 0;
    mainBody.castShadow = true;
    mainBody.receiveShadow = true;
    shipGroup.add(mainBody);

    // Forward cockpit module - angular wedge
    const cockpitGeometry = new THREE.ConeGeometry(
      shipScale * 0.35,
      shipScale * 0.7,
      6,
      1
    );
    const cockpit = new THREE.Mesh(cockpitGeometry, armorMaterial);
    cockpit.rotation.x = Math.PI / 2;
    cockpit.position.z = shipScale * 1.6;
    cockpit.castShadow = true;
    shipGroup.add(cockpit);

    // Cockpit viewport - glowing cyan
    const viewportGeometry = new THREE.SphereGeometry(
      shipScale * 0.2,
      12,
      12,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.6
    );
    const viewport = new THREE.Mesh(viewportGeometry, energyMaterial);
    viewport.rotation.x = Math.PI;
    viewport.position.set(0, shipScale * 0.15, shipScale * 1.7);
    shipGroup.add(viewport);

    // Rear reactor core housing
    const reactorHousingGeometry = new THREE.SphereGeometry(
      shipScale * 0.45,
      16,
      16
    );
    const reactorHousing = new THREE.Mesh(reactorHousingGeometry, armorMaterial);
    reactorHousing.position.z = -shipScale * 1.1;
    reactorHousing.castShadow = true;
    shipGroup.add(reactorHousing);

    // Reactor core glow
    const reactorCoreGeometry = new THREE.SphereGeometry(
      shipScale * 0.35,
      16,
      16
    );
    const reactorCore = new THREE.Mesh(reactorCoreGeometry, reactorMaterial);
    reactorCore.position.z = -shipScale * 1.1;
    reactorCore.userData.isPulsing = true;
    shipGroup.add(reactorCore);

    // Wing extensions with integrated engines
    for (const side of [-1, 1]) {
      // Main wing extension
      const wingGeometry = new THREE.BoxGeometry(
        shipScale * 0.15,
        shipScale * 0.08,
        shipScale * 1.8
      );
      const wing = new THREE.Mesh(wingGeometry, armorMaterial);
      wing.position.set(
        shipScale * 0.45 * side,
        0,
        -shipScale * 0.2
      );
      wing.castShadow = true;
      shipGroup.add(wing);

      // Wing tip with angular cut
      const wingTipGeometry = new THREE.ConeGeometry(
        shipScale * 0.08,
        shipScale * 0.4,
        6
      );
      const wingTip = new THREE.Mesh(wingTipGeometry, hullMaterial);
      wingTip.rotation.x = Math.PI / 2;
      wingTip.position.set(
        shipScale * 0.45 * side,
        0,
        -shipScale * 1.2
      );
      wingTip.castShadow = true;
      shipGroup.add(wingTip);

      // Integrated engine pods (3 per side)
      for (let i = 0; i < 3; i++) {
        const engineZ = shipScale * (0.3 - i * 0.6);
        
        // Engine housing
        const engineGeometry = new THREE.CylinderGeometry(
          shipScale * 0.12,
          shipScale * 0.14,
          shipScale * 0.5,
          12
        );
        const engine = new THREE.Mesh(engineGeometry, armorMaterial);
        engine.rotation.x = Math.PI / 2;
        engine.position.set(
          shipScale * 0.45 * side,
          -shipScale * 0.08,
          engineZ
        );
        engine.castShadow = true;
        shipGroup.add(engine);

        // Engine exhaust glow
        const exhaustGeometry = new THREE.CylinderGeometry(
          shipScale * 0.1,
          shipScale * 0.08,
          shipScale * 0.15,
          12
        );
        const exhaust = new THREE.Mesh(exhaustGeometry, reactorMaterial);
        exhaust.rotation.x = Math.PI / 2;
        exhaust.position.set(
          shipScale * 0.45 * side,
          -shipScale * 0.08,
          engineZ - shipScale * 0.32
        );
        exhaust.userData.isPulsing = true;
        shipGroup.add(exhaust);

        // Engine lights
        const engineLight = new THREE.PointLight(0x00bbff, 3, shipScale * 4);
        engineLight.position.set(
          shipScale * 0.45 * side,
          -shipScale * 0.08,
          engineZ - shipScale * 0.32
        );
        engineLight.userData.isPulsing = true;
        shipGroup.add(engineLight);
      }
    }

    // Weapon hardpoints on top (rail guns)
    for (const xPos of [-0.25, 0.25]) {
      const weaponBaseGeometry = new THREE.CylinderGeometry(
        shipScale * 0.08,
        shipScale * 0.1,
        shipScale * 0.15,
        8
      );
      const weaponBase = new THREE.Mesh(weaponBaseGeometry, armorMaterial);
      weaponBase.position.set(xPos * shipScale, shipScale * 0.32, shipScale * 0.5);
      weaponBase.castShadow = true;
      shipGroup.add(weaponBase);

      const weaponBarrelGeometry = new THREE.CylinderGeometry(
        shipScale * 0.04,
        shipScale * 0.04,
        shipScale * 0.6,
        8
      );
      const weaponBarrel = new THREE.Mesh(weaponBarrelGeometry, weaponMaterial);
      weaponBarrel.rotation.x = Math.PI / 2;
      weaponBarrel.position.set(xPos * shipScale, shipScale * 0.4, shipScale * 0.8);
      weaponBarrel.castShadow = true;
      shipGroup.add(weaponBarrel);
    }

    // Sensor arrays along the spine
    for (let i = 0; i < 3; i++) {
      const sensorZ = shipScale * (0.8 - i * 0.7);
      const sensorGeometry = new THREE.BoxGeometry(
        shipScale * 0.15,
        shipScale * 0.06,
        shipScale * 0.08
      );
      const sensor = new THREE.Mesh(sensorGeometry, energyMaterial);
      sensor.position.set(0, shipScale * 0.3, sensorZ);
      shipGroup.add(sensor);
    }

    // Energy shield emitters (glowing nodes on the hull)
    for (const pos of [
      { x: 0, y: 0.25, z: 1.0 },
      { x: 0.3, y: 0, z: 0.3 },
      { x: -0.3, y: 0, z: 0.3 },
      { x: 0, y: 0, z: -0.8 },
    ]) {
      const shieldGeometry = new THREE.SphereGeometry(shipScale * 0.06, 12, 12);
      const shieldEmitter = new THREE.Mesh(shieldGeometry, energyMaterial);
      shieldEmitter.position.set(
        pos.x * shipScale,
        pos.y * shipScale,
        pos.z * shipScale
      );
      shipGroup.add(shieldEmitter);

      // Shield emitter glow
      const shieldLight = new THREE.PointLight(0x00ddff, 1.5, shipScale * 2);
      shieldLight.position.set(
        pos.x * shipScale,
        pos.y * shipScale,
        pos.z * shipScale
      );
      shipGroup.add(shieldLight);
    }

    // Hull detail lines (energy conduits)
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const lineZ = shipScale * (1.2 - i * 0.5);
        const lineGeometry = new THREE.BoxGeometry(
          shipScale * 0.02,
          shipScale * 0.01,
          shipScale * 0.3
        );
        const line = new THREE.Mesh(lineGeometry, energyMaterial);
        line.position.set(shipScale * 0.2 * side, 0, lineZ);
        shipGroup.add(line);
      }
    }

    // Navigation beacons
    for (const side of [-1, 1]) {
      const beaconGeometry = new THREE.SphereGeometry(shipScale * 0.04, 8, 8);
      const beaconMaterial = new THREE.MeshStandardMaterial({
        color: side > 0 ? 0x00ff00 : 0xff0000,
        metalness: 0.8,
        roughness: 0.2,
        emissive: side > 0 ? 0x00ff88 : 0xff4444,
        emissiveIntensity: 1.8,
      });
      const beacon = new THREE.Mesh(beaconGeometry, beaconMaterial);
      beacon.position.set(shipScale * 0.5 * side, 0, shipScale * 0.8);
      shipGroup.add(beacon);
    }

    // Main ambient lighting
    const shipAmbientLight = new THREE.PointLight(0xffffff, 12, shipScale * 7);
    shipAmbientLight.position.set(0, 0, 0);
    shipGroup.add(shipAmbientLight);

    // Reactor core light (strong blue glow from rear)
    const reactorLight = new THREE.PointLight(0x00bbff, 6, shipScale * 6);
    reactorLight.position.z = -shipScale * 1.1;
    reactorLight.userData.isPulsing = true;
    shipGroup.add(reactorLight);

    return shipGroup;
  }
}

