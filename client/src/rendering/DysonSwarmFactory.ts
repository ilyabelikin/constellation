import * as THREE from "three";
import { 
  DYSON_PANEL_SIZE, 
  DYSON_ORBIT_DISTANCE_MULTIPLIER, 
  SOLAR_RADIUS,
  MAX_DYSON_SWARMS_PER_STAR,
  PANELS_PER_SWARM
} from "../../../shared/src/constants";

/**
 * Factory for creating Dyson Swarm visuals
 * Each swarm consists of 3 satellites orbiting the star
 * Panels are now constant size regardless of star size
 */
export class DysonSwarmFactory {
  /**
   * Create a solar panel satellite mesh with distinct front/back surfaces
   * @param size - Size of the panel
   * @returns THREE.Group containing the satellite geometry
   */
  private createSolarPanel(size: number): THREE.Group {
    const group = new THREE.Group();
    
    // Main panel dimensions - very flat like a real solar panel
    const panelWidth = size;
    const panelHeight = size;
    const panelDepth = size * 0.05; // Very thin - 5% of width
    
    // Create the main panel body
    const panelGeometry = new THREE.BoxGeometry(panelWidth, panelHeight, panelDepth);
    
    // Front face (sun-facing): Bright blue photovoltaic cells
    const frontMaterial = new THREE.MeshBasicMaterial({
      color: 0x4dd0ff, // Bright cyan-blue (photovoltaic cells)
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -1.0,
    });
    
    // Back face (away from sun): Dark metallic radiator surface
    const backMaterial = new THREE.MeshBasicMaterial({
      color: 0x1a1a2e, // Very dark blue-grey (radiators)
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -1.0,
    });
    
    // Side faces: Medium grey metallic edges
    const sideMaterial = new THREE.MeshBasicMaterial({
      color: 0x4a5568, // Grey metallic
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -1.0,
    });
    
    // Apply different materials to different faces
    // Box faces order: right, left, top, bottom, front, back
    const materials = [
      sideMaterial, // right
      sideMaterial, // left
      sideMaterial, // top
      sideMaterial, // bottom
      frontMaterial, // front (this will face the sun due to lookAt)
      backMaterial, // back
    ];
    
    const panel = new THREE.Mesh(panelGeometry, materials);
    group.add(panel);
    
    // Add a metallic frame around the panel for detail
    const frameThickness = size * 0.08;
    const frameDepth = panelDepth * 1.5;
    const frameMaterial = new THREE.MeshBasicMaterial({
      color: 0x8899aa, // Lighter metallic grey for frame
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -1.0,
    });
    
    // Top frame bar
    const topFrame = new THREE.Mesh(
      new THREE.BoxGeometry(panelWidth + frameThickness, frameThickness, frameDepth),
      frameMaterial
    );
    topFrame.position.y = (panelHeight + frameThickness) / 2;
    topFrame.name = 'frame';
    group.add(topFrame);
    
    // Bottom frame bar
    const bottomFrame = new THREE.Mesh(
      new THREE.BoxGeometry(panelWidth + frameThickness, frameThickness, frameDepth),
      frameMaterial
    );
    bottomFrame.position.y = -(panelHeight + frameThickness) / 2;
    bottomFrame.name = 'frame';
    group.add(bottomFrame);
    
    // Left frame bar
    const leftFrame = new THREE.Mesh(
      new THREE.BoxGeometry(frameThickness, panelHeight, frameDepth),
      frameMaterial
    );
    leftFrame.position.x = -(panelWidth + frameThickness) / 2;
    leftFrame.name = 'frame';
    group.add(leftFrame);
    
    // Right frame bar
    const rightFrame = new THREE.Mesh(
      new THREE.BoxGeometry(frameThickness, panelHeight, frameDepth),
      frameMaterial
    );
    rightFrame.position.x = (panelWidth + frameThickness) / 2;
    rightFrame.name = 'frame';
    group.add(rightFrame);
    
    // Add small support struts in the corners for detail
    const strutSize = frameThickness * 0.6;
    const strutMaterial = new THREE.MeshBasicMaterial({
      color: 0xaabbcc, // Lighter accent
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -1.0,
    });
    
    const cornerPositions = [
      { x: panelWidth / 3, y: panelHeight / 3 },
      { x: -panelWidth / 3, y: panelHeight / 3 },
      { x: panelWidth / 3, y: -panelHeight / 3 },
      { x: -panelWidth / 3, y: -panelHeight / 3 },
    ];
    
    for (const pos of cornerPositions) {
      const strut = new THREE.Mesh(
        new THREE.BoxGeometry(strutSize, strutSize, frameDepth * 0.8),
        strutMaterial
      );
      strut.position.set(pos.x, pos.y, 0);
      strut.name = 'strut';
      group.add(strut);
    }
    
    return group;
  }
  /**
   * Create satellites for a Dyson Swarm around a star
   * @param swarmIndex - Index of this swarm (0-9)
   * @param starRadius - Radius of the star in scene units (already scaled and multiplied)
   * @param currentTime - Current game time for orbital positions
   * @param maxSwarmsForStar - Maximum swarms this star can support (for proper distribution)
   * @returns Array of THREE.Group objects representing satellites (solar panels)
   */
  createSwarmSatellites(
    swarmIndex: number,
    starRadius: number,
    currentTime: number,
    maxSwarmsForStar?: number
  ): THREE.Group[] {
    const satellites: THREE.Group[] = [];

    // Each swarm has 3 satellites
    const satellitesPerSwarm = 3;

    // Orbital distance: ALL satellites orbit at the same distance, forming a single sphere
    // This creates a true Dyson swarm that gradually covers the star like a shell
    const orbitRadius = starRadius * DYSON_ORBIT_DISTANCE_MULTIPLIER;

    // CONSTANT panel size: panels are the same physical size regardless of star size
    // Make panels large enough to be visible (about 2.6% of star radius)
    // 30% larger than base size for better clarity
    const satelliteSize = starRadius * 0.026; // 2.6% of star radius for visibility

    // Create 3 satellites evenly distributed on the sphere
    for (let i = 0; i < satellitesPerSwarm; i++) {
      // Create solar panel satellite
      const satellite = this.createSolarPanel(satelliteSize);

      // Distribute ALL satellites (across all swarms) evenly on a single spherical shell
      // using Fibonacci sphere algorithm for perfect distribution
      const goldenRatio = (1 + Math.sqrt(5)) / 2;
      const satelliteGlobalIndex = swarmIndex * satellitesPerSwarm + i;
      
      // Each satellite has a FIXED position on the sphere based on its index
      // Scale distribution based on this star's actual max capacity, not global max
      // This ensures full coverage at max capacity for each star
      const maxSwarms = maxSwarmsForStar || MAX_DYSON_SWARMS_PER_STAR;
      const MAX_TOTAL_SATELLITES = maxSwarms * PANELS_PER_SWARM;
      
      // Calculate fixed latitude (inclination) using Fibonacci sphere
      // This distributes satellites evenly from north pole to south pole
      const inclination = Math.acos(1 - 2 * (satelliteGlobalIndex + 0.5) / MAX_TOTAL_SATELLITES);
      
      // Calculate fixed longitude using golden ratio for even azimuthal spacing
      const fixedLongitude = (satelliteGlobalIndex * goldenRatio) * Math.PI * 2;

      // ALL satellites share the same orbital period - they rotate as ONE rigid shell
      const orbitalPeriod = 180000; // 50 hours per orbit for the ENTIRE Dyson sphere
      
      // Time-based rotation - SAME for ALL satellites across ALL swarms
      const timeAngle = (currentTime / orbitalPeriod) * Math.PI * 2;
      
      // Current angle on the sphere (fixed position + time rotation)
      const currentAngle = fixedLongitude + timeAngle;

      // Calculate position on sphere using spherical coordinates
      // x-z plane forms the equator, y is the polar axis
      const x = Math.sin(inclination) * Math.cos(currentAngle) * orbitRadius;
      const y = Math.cos(inclination) * orbitRadius;
      const z = Math.sin(inclination) * Math.sin(currentAngle) * orbitRadius;
      
      satellite.position.x = x;
      satellite.position.y = y;
      satellite.position.z = z;

      // Make satellite initially point toward the star center
      satellite.lookAt(0, 0, 0);

      // Store orbital data for animation updates
      (satellite.userData as any).orbitRadius = orbitRadius;
      (satellite.userData as any).orbitalPeriod = orbitalPeriod;
      (satellite.userData as any).swarmIndex = swarmIndex;
      (satellite.userData as any).satelliteIndex = i;
      (satellite.userData as any).satelliteGlobalIndex = satelliteGlobalIndex;
      (satellite.userData as any).inclination = inclination; // Latitude on sphere (0 = north pole, PI = south pole)
      (satellite.userData as any).fixedLongitude = fixedLongitude; // Fixed longitude on sphere

      satellites.push(satellite);
    }

    return satellites;
  }

  /**
   * Update satellite positions based on current time
   * All satellites rotate together as a rigid spherical shell
   * @param satellites - Array of satellite groups (solar panels)
   * @param currentTime - Current game time
   */
  updateSatellitePositions(
    satellites: THREE.Group[],
    currentTime: number
  ): void {
    for (const satellite of satellites) {
      const userData = satellite.userData as any;
      
      // Time-based rotation - SAME for ALL satellites (rigid shell rotation)
      const timeAngle = (currentTime / userData.orbitalPeriod) * Math.PI * 2;
      
      // Current angle on the sphere (fixed position + time rotation)
      const currentAngle = userData.fixedLongitude + timeAngle;

      // Calculate position on sphere using spherical coordinates
      // MUST match the creation calculation exactly to prevent jumping
      // x-z plane forms the equator, y is the polar axis
      const x = Math.sin(userData.inclination) * Math.cos(currentAngle) * userData.orbitRadius;
      const y = Math.cos(userData.inclination) * userData.orbitRadius;
      const z = Math.sin(userData.inclination) * Math.sin(currentAngle) * userData.orbitRadius;
      
      satellite.position.x = x;
      satellite.position.y = y;
      satellite.position.z = z;
      
      // Make satellite always point toward the star center (0, 0, 0 in local space)
      // This simulates solar panels tracking the star
      satellite.lookAt(0, 0, 0);
    }
  }

  /**
   * Create orbital path visualization for a swarm
   * @param swarmIndex - Index of this swarm
   * @param starRadius - Radius of the star in scene units
   * @returns THREE.Line representing the orbital path
   */
  createOrbitalPath(swarmIndex: number, starRadius: number): THREE.Line {
    // All satellites orbit at the same radius, forming a single sphere
    const orbitRadius = starRadius * DYSON_ORBIT_DISTANCE_MULTIPLIER;

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
