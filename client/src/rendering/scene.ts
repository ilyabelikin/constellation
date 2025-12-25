import * as THREE from "three";
import {
  StarSystem,
  CelestialBodyState,
  SystemState,
  ShipState,
  ASTRONOMICAL_UNIT,
  EARTH_MASS,
  ConstellationNode,
  ConstellationConnection,
  UnexploredGate,
} from "@constellation/shared";
import { CameraController } from "./CameraController.js";
import { InteractionManager } from "./InteractionManager.js";
import { CelestialBodyFactory } from "./CelestialBodyFactory.js";
import { GateFactory } from "./GateFactory.js";
import { TimeInterpolator } from "./TimeInterpolator.js";
import { StarfieldGenerator } from "./StarfieldGenerator.js";
import { GateTravelAnimator } from "./GateTravelAnimator.js";
import { ConstellationView } from "./ConstellationView.js";
import { DysonSwarmFactory } from "./DysonSwarmFactory.js";
import {
  getOceanColorType,
  getAtmosphereColor,
} from "./materials/planetColorUtils";
import { getDesertAtmosphereColor } from "./materials/DesertAtmosphereGlowMaterial";
import { MiningInstallationRenderer } from "./MiningInstallationRenderer.js";
import { Helium3ExtractorRenderer } from "./Helium3ExtractorRenderer.js";
import { ColonyEstablishmentRenderer } from "./ColonyEstablishmentRenderer.js";
import { GateDefenseRenderer } from "./GateDefenseRenderer.js";
import { GateResourceFlowRenderer } from "./GateResourceFlowRenderer.js";
import {
  SOLAR_RADIUS,
  calculateMaxDysonSwarms,
} from "../../../shared/src/constants.js";

/**
 * Main scene manager that orchestrates all rendering components
 */
export class SceneManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;

  // Component instances
  private cameraController: CameraController;
  private interactionManager: InteractionManager;
  private celestialBodyFactory: CelestialBodyFactory;
  private gateFactory: GateFactory;
  private timeInterpolator: TimeInterpolator;
  private starfieldGenerator: StarfieldGenerator;
  private gateTravelAnimator: GateTravelAnimator;
  private constellationView: ConstellationView;
  private dysonSwarmFactory: DysonSwarmFactory;
  private miningInstallationRenderer: MiningInstallationRenderer;
  private helium3ExtractorRenderer: Helium3ExtractorRenderer;
  private colonyEstablishmentRenderer: ColonyEstablishmentRenderer;
  private gateDefenseRenderer: GateDefenseRenderer;
  private gateResourceFlowRenderer: GateResourceFlowRenderer;

  // Scene objects
  private bodies: Map<string, THREE.Mesh | THREE.Group> = new Map();
  private ships: Map<string, THREE.Group> = new Map();
  private gates: Map<string, THREE.Group> = new Map();
  private asteroids: Map<string, THREE.Mesh> = new Map();
  private moons: Map<string, THREE.Mesh> = new Map();
  private rings: Map<string, THREE.Group> = new Map(); // Planetary ring systems
  private orbitLines: Map<string, THREE.Line> = new Map();
  private moonOrbitLines: Map<string, THREE.Line> = new Map(); // Moon orbit lines (shown conditionally)
  private satellites: Map<string, { meshes: THREE.Group[]; starId: string }> =
    new Map(); // Dyson swarm satellites keyed by megastructure ID with star ID
  private launchingsatellites: Map<
    string,
    {
      mesh: THREE.Group;
      startTime: number;
      startPos: THREE.Vector3;
      targetPos: THREE.Vector3;
      controlPoint: THREE.Vector3;
      starId: string;
      userData: any;
    }[]
  > = new Map(); // Satellites currently in launch animation
  private transitioningSatellites: Map<
    string,
    {
      meshes: THREE.Group[];
      starId: string;
      transitionStartTime: number;
      fromPositions: THREE.Vector3[];
      fromQuaternions: THREE.Quaternion[];
    }
  > = new Map(); // Satellites transitioning from launch to orbit
  private starMaterials: THREE.ShaderMaterial[] = [];
  private gateMaterials: THREE.ShaderMaterial[] = [];
  private starDimmingFactors: Map<string, number> = new Map(); // Dimming factor per star based on Dyson swarms (1.0 = full brightness, 0.5 = 50% dimmed)
  private starLights: Map<string, THREE.PointLight> = new Map(); // Track star lights for dimming
  private starfield: THREE.Points | null = null;
  private lights: THREE.Light[] = []; // Track lights for cleanup

  private system: StarSystem | null = null;
  private exploredGateIds: Set<string> = new Set();
  private gateOwnership: Map<
    string,
    {
      ownerId: string;
      ownerName: string;
      status: string;
      lastOvertakenAt: number;
    }
  > = new Map();
  private gateResourceFlow: Map<
    string,
    {
      energyFlow: number;
      alloyFlow: number;
      scienceFlow: number;
      isBlockaded: boolean;
      blockadeOwnerName?: string;
    }
  > = new Map();
  private currentPlayerId: string | null = null;
  private isConstellationViewActive = false;

  // Scale factor for visualization (1 AU = 1000 units in Three.js)
  private readonly SCALE = 1000 / ASTRONOMICAL_UNIT;
  // Multiplier for celestial body sizes (make them visible)
  private readonly BODY_SIZE_MULTIPLIER = 40;

  public onObjectSelected: ((objectId: string) => void) | null = null;
  public onGateUse: ((gateId: string) => void) | null = null;
  public onConstellationPositionsChanged:
    | ((positions: Record<string, { x: number; y: number; z: number }>) => void)
    | null = null;
  public onConstellationSystemSelected:
    | ((systemId: string, action: "select" | "travel") => void)
    | null = null;
  public onConstellationGateSelected: ((gateId: string) => void) | null = null;
  public onConstellationPlanetSelected:
    | ((systemId: string, planetId: string, planetName: string) => void)
    | null = null;

  // Callback to check if keyboard input should be blocked (e.g., modal is open)
  public shouldBlockKeyboardInput: (() => boolean) | null = null;

  // Planet rotation tracking for smooth rotation (avoids discontinuities from time updates)
  private planetRotations: Map<string, number> = new Map();
  private lastRotationUpdateTime: number = 0;

  // Gate travel state
  private entryGateId: string | null = null;
  private exitGateId: string | null = null;
  private pendingDestinationSystem: StarSystem | null = null;
  private hasLoadedDestinationDuringTravel = false;

  // Event listener references for cleanup
  private resizeHandler: () => void;
  private mouseDownHandler: (e: MouseEvent) => void;
  private mouseMoveHandler: (e: MouseEvent) => void;
  private mouseUpHandler: () => void;
  private mouseWheelHandler: (e: WheelEvent) => void;
  private contextMenuHandler: (e: MouseEvent) => void;
  private keyDownHandler: (e: KeyboardEvent) => void;
  private keyUpHandler: (e: KeyboardEvent) => void;
  private touchStartHandler: (e: TouchEvent) => void;
  private touchMoveHandler: (e: TouchEvent) => void;
  private touchEndHandler: (e: TouchEvent) => void;

  // Keyboard navigation state for constellation view
  private keyboardState: { [key: string]: boolean } = {};
  private readonly KEYBOARD_MOVE_SPEED = 50; // Units per second

  // Expose getters for external access
  getGameTime(): number {
    return this.timeInterpolator.getGameTime();
  }

  getIsPaused(): boolean {
    return this.timeInterpolator.getIsPaused();
  }

  getTimeScale(): number {
    return this.timeInterpolator.getTimeScale();
  }

  constructor(container: HTMLElement) {
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    // Camera setup
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.05, // Near plane - balanced for both asteroids and avoiding z-fighting
      1000000
    );
    this.camera.position.set(0, 3000, 3000);
    this.camera.lookAt(0, 0, 0);

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // Enable shadow mapping
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft shadows

    container.appendChild(this.renderer.domElement);

    // Initialize components
    this.cameraController = new CameraController(this.camera);
    this.interactionManager = new InteractionManager();
    this.celestialBodyFactory = new CelestialBodyFactory(
      this.SCALE,
      this.BODY_SIZE_MULTIPLIER
    );
    this.gateFactory = new GateFactory();
    this.timeInterpolator = new TimeInterpolator();
    this.starfieldGenerator = new StarfieldGenerator();

    // Add starfield background
    this.starfield = this.starfieldGenerator.createStarfield();
    this.scene.add(this.starfield);

    // Initialize gate travel animator
    this.gateTravelAnimator = new GateTravelAnimator(
      this.camera,
      this.cameraController
    );
    // Set scene reference for hyperspace effects
    this.gateTravelAnimator.setScene(this.scene);
    // Set scene manager reference for accessing exit gate
    this.gateTravelAnimator.setSceneManager(this);

    // Initialize constellation view
    this.constellationView = new ConstellationView(this.scene);

    // Initialize Dyson swarm factory
    this.dysonSwarmFactory = new DysonSwarmFactory();

    // Initialize mining installation renderer (handles both asteroids and moons)
    this.miningInstallationRenderer = new MiningInstallationRenderer(
      this.scene,
      this.asteroids,
      this.moons
    );

    // Initialize Helium-3 extractor renderer
    this.helium3ExtractorRenderer = new Helium3ExtractorRenderer(
      this.scene,
      this.bodies, // Uses bodies map which includes both planets and moons
      this.camera // Pass camera so extractors can face it
    );

    // Initialize colony establishment renderer
    this.colonyEstablishmentRenderer = new ColonyEstablishmentRenderer(
      this.scene,
      this.bodies
    );

    this.gateDefenseRenderer = new GateDefenseRenderer(this.scene, this.gates);

    // Initialize gate resource flow renderer
    this.gateResourceFlowRenderer = new GateResourceFlowRenderer(this.scene);

    // Create event listeners and store references for cleanup
    this.resizeHandler = () => this.onWindowResize();
    this.mouseDownHandler = (e: MouseEvent) => this.onMouseDown(e);
    this.mouseMoveHandler = (e: MouseEvent) => this.onMouseMove(e);
    this.mouseUpHandler = () => this.onMouseUp();
    this.mouseWheelHandler = (e: WheelEvent) => this.onMouseWheel(e);
    this.contextMenuHandler = (e: MouseEvent) => this.onContextMenu(e);
    this.keyDownHandler = (e: KeyboardEvent) => this.onKeyDown(e);
    this.keyUpHandler = (e: KeyboardEvent) => this.onKeyUp(e);
    this.touchStartHandler = (e: TouchEvent) => this.onTouchStart(e);
    this.touchMoveHandler = (e: TouchEvent) => this.onTouchMove(e);
    this.touchEndHandler = (e: TouchEvent) => this.onTouchEnd(e);

    // Add event listeners
    window.addEventListener("resize", this.resizeHandler);
    window.addEventListener("keydown", this.keyDownHandler);
    window.addEventListener("keyup", this.keyUpHandler);
    this.renderer.domElement.addEventListener(
      "mousedown",
      this.mouseDownHandler
    );
    this.renderer.domElement.addEventListener(
      "mousemove",
      this.mouseMoveHandler
    );
    this.renderer.domElement.addEventListener("mouseup", this.mouseUpHandler);
    this.renderer.domElement.addEventListener("wheel", this.mouseWheelHandler);
    this.renderer.domElement.addEventListener(
      "contextmenu",
      this.contextMenuHandler
    );
    // Touch event listeners
    this.renderer.domElement.addEventListener(
      "touchstart",
      this.touchStartHandler,
      { passive: false }
    );
    this.renderer.domElement.addEventListener(
      "touchmove",
      this.touchMoveHandler,
      { passive: false }
    );
    this.renderer.domElement.addEventListener(
      "touchend",
      this.touchEndHandler,
      { passive: false }
    );
  }

  loadSystem(system: StarSystem): void {
    this.system = system;
    this.clearScene();

    // Create star
    const starMesh = this.celestialBodyFactory.createStar(
      system.star,
      this.scene
    );
    // Primary star is always at the origin (0, 0, 0) in our coordinate system
    starMesh.position.set(0, 0, 0);
    this.scene.add(starMesh);
    this.bodies.set(system.star.id, starMesh);

    // Store star material for animation updates (only for regular stars, not black holes)
    if (
      starMesh instanceof THREE.Mesh &&
      starMesh.material instanceof THREE.ShaderMaterial
    ) {
      this.starMaterials.push(starMesh.material);
    }

    // Track lights added by createStar
    this.scene.traverse((object) => {
      if (object instanceof THREE.Light && !this.lights.includes(object)) {
        this.lights.push(object);
      }
    });

    // Create companion stars (for binary/trinary systems)
    if (system.companionStars && system.companionStars.length > 0) {
      console.log(`Loading ${system.companionStars.length} companion star(s)`);
      for (const companionStar of system.companionStars) {
        const companionMesh = this.celestialBodyFactory.createStar(
          companionStar,
          this.scene
        );
        this.scene.add(companionMesh);
        this.bodies.set(companionStar.id, companionMesh);

        // Store companion star material for animation updates (only for regular stars, not black holes)
        if (
          companionMesh instanceof THREE.Mesh &&
          companionMesh.material instanceof THREE.ShaderMaterial
        ) {
          this.starMaterials.push(companionMesh.material);
        }

        // Track lights added by companion star
        this.scene.traverse((object) => {
          if (object instanceof THREE.Light && !this.lights.includes(object)) {
            this.lights.push(object);
          }
        });

        // Create orbit line for companion star (initially hidden, shown when any star is selected)
        const orbitLine =
          this.celestialBodyFactory.createOrbitLine(companionStar);
        orbitLine.visible = false; // Hide by default
        this.scene.add(orbitLine);
        this.orbitLines.set(companionStar.id, orbitLine);
      }
    }

    // Create planets
    for (const planet of system.planets) {
      const planetMesh = this.celestialBodyFactory.createPlanet(planet);
      this.scene.add(planetMesh);
      this.bodies.set(planet.id, planetMesh);

      // Create rings if planet has them
      if (planet.rings && planet.rings.length > 0) {
        const ringGroup = this.celestialBodyFactory.createRings(planet);
        if (ringGroup) {
          this.scene.add(ringGroup);
          this.rings.set(planet.id, ringGroup);
        }
      }
    }

    // Create orbit lines
    for (const planet of system.planets) {
      const orbitLine = this.celestialBodyFactory.createOrbitLine(planet);
      this.scene.add(orbitLine);
      this.orbitLines.set(planet.id, orbitLine);
    }

    // Create gates
    for (const gate of system.gates) {
      const isExploredBySelf = this.exploredGateIds.has(gate.id);

      // Determine gate status based on ownership
      let gateStatus: string;
      const ownership = this.gateOwnership.get(gate.id);

      // Check if gate has an owner (explored by someone, possibly not by us)
      if (ownership && ownership.status) {
        // Gate has an owner - use their diplomatic stance color
        gateStatus = ownership.status;
      } else if (!isExploredBySelf) {
        // No owner and we haven't explored it - truly unexplored
        gateStatus = "unexplored";
      } else {
        // We explored it but no ownership info (shouldn't happen, but safe default)
        gateStatus = "owned_by_self";
      }

      const gateGroup = this.gateFactory.createGate(gate, gateStatus as any);
      this.scene.add(gateGroup);
      this.gates.set(gate.id, gateGroup);

      // Collect gate materials for animation
      gateGroup.traverse((child) => {
        if (
          child instanceof THREE.Mesh &&
          child.material instanceof THREE.ShaderMaterial
        ) {
          this.gateMaterials.push(child.material);
        }
      });

      // Track lights added by createGate
      gateGroup.traverse((object) => {
        if (object instanceof THREE.Light && !this.lights.includes(object)) {
          this.lights.push(object);
        }
      });
    }

    // Create asteroids
    for (const belt of system.asteroidBelts) {
      for (const asteroid of belt.asteroids) {
        const asteroidMesh = this.celestialBodyFactory.createAsteroid(asteroid);
        this.scene.add(asteroidMesh);
        this.asteroids.set(asteroid.id, asteroidMesh);
      }
    }

    // Create moons
    for (const moon of system.moons) {
      const moonMesh = this.celestialBodyFactory.createMoon(moon);
      this.scene.add(moonMesh);
      this.moons.set(moon.id, moonMesh);
      this.bodies.set(moon.id, moonMesh); // Also add to bodies map for Helium-3 renderer

      // Create moon orbit line (initially hidden)
      const moonOrbitLine = this.celestialBodyFactory.createOrbitLine(moon);
      moonOrbitLine.visible = false; // Hide by default
      this.scene.add(moonOrbitLine);
      this.moonOrbitLines.set(moon.id, moonOrbitLine);
    }

    // Create Dyson Swarm satellites
    if (system.megastructures) {
      // Group swarms by star to get swarm index per star
      const swarmsByStarId = new Map<string, any[]>();

      for (const megastructure of system.megastructures) {
        if (
          megastructure.type === "dyson_swarm" &&
          megastructure.celestialBodyId
        ) {
          const starId = megastructure.celestialBodyId;
          if (!swarmsByStarId.has(starId)) {
            swarmsByStarId.set(starId, []);
          }
          swarmsByStarId.get(starId)!.push(megastructure);
        }
      }

      // Create satellites for each swarm
      for (const [starId, swarms] of swarmsByStarId.entries()) {
        // Get the star body to calculate proper radius
        const starBody = this.bodies.get(starId);
        if (!starBody) continue;

        // Get the actual star data to get its real radius
        let star = system.star.id === starId ? system.star : null;
        if (!star && system.companionStars) {
          star = system.companionStars.find((s) => s.id === starId) || null;
        }
        if (!star) continue;

        // Calculate scaled star radius (same scaling used in rendering)
        const starRadius = star.radius * this.SCALE * this.BODY_SIZE_MULTIPLIER;

        // Create satellites for each swarm (sorted by creation time for consistent indexing)
        const sortedSwarms = swarms.sort(
          (a, b) => a.establishedAt - b.establishedAt
        );

        // Calculate max swarms for this star to ensure proper distribution
        const starRadiusInSolarRadii = star.radius / SOLAR_RADIUS;
        const maxSwarms = calculateMaxDysonSwarms(starRadiusInSolarRadii);

        for (let i = 0; i < sortedSwarms.length; i++) {
          const megastructure = sortedSwarms[i];
          const currentTime = this.timeInterpolator.getGameTime();

          // Create satellites for this swarm
          const satelliteMeshes = this.dysonSwarmFactory.createSwarmSatellites(
            i, // swarm index (0-9)
            starRadius,
            currentTime,
            maxSwarms // Pass max swarms for proper distribution
          );

          // Add satellites to scene
          // Note: Satellites are created in local space (relative to star at origin)
          // The update loop will position them correctly relative to the star's actual position
          for (const satellite of satelliteMeshes) {
            this.scene.add(satellite);
          }

          // Store satellites for updates and cleanup with star ID
          this.satellites.set(megastructure.id, {
            meshes: satelliteMeshes,
            starId: starId,
          });
        }
      }
    }

    // Update star dimming based on Dyson swarm coverage
    this.updateStarDimming();

    // Process any defense platforms that arrived before gates were loaded
    this.gateDefenseRenderer.processPendingDefenses();

    // Clear any stale pending defenses that don't match current system's gates
    this.gateDefenseRenderer.clearStalePendingDefenses();
  }

  setExploredGates(exploredGateIds: string[]): void {
    this.exploredGateIds = new Set(exploredGateIds);
  }

  setCurrentPlayerId(playerId: string): void {
    this.currentPlayerId = playerId;
    // Set player ID in gate defense renderer for proper coloring
    this.gateDefenseRenderer.setPlayerId(playerId);
  }

  /**
   * Calculate star dimming factor based on number of Dyson swarms
   * @param starId - ID of the star
   * @returns Dimming factor from 1.0 (no swarms) to 0.5 (max swarms)
   */
  private calculateStarDimming(starId: string): number {
    if (!this.system || !this.system.megastructures) return 1.0;

    // Count Dyson swarms on this star
    const swarmCount = this.system.megastructures.filter(
      (ms) => ms.type === "dyson_swarm" && ms.celestialBodyId === starId
    ).length;

    const MAX_SWARMS = 30;
    const MIN_BRIGHTNESS = 0.5; // 50% brightness at maximum swarms

    // Linear interpolation from 1.0 (no swarms) to 0.5 (max swarms)
    const dimmingFactor =
      1.0 - (swarmCount / MAX_SWARMS) * (1.0 - MIN_BRIGHTNESS);

    return Math.max(MIN_BRIGHTNESS, Math.min(1.0, dimmingFactor));
  }

  /**
   * Update the system data without rebuilding the entire scene
   * Used when receiving updated system data for the current system
   */
  updateSystemData(system: StarSystem): void {
    this.system = system;
    this.updateStarDimming();

    // Clean up destroyed platforms after system state refresh
    // This removes platforms that were destroyed in combat and are no longer in the database
    this.gateDefenseRenderer.cleanupDestroyedPlatforms();
  }

  /**
   * Update dimming for all stars in the system
   * Can be called publicly when system data changes (e.g., new swarm launched)
   */
  updateStarDimming(): void {
    if (!this.system) return;

    // Update primary star
    const primaryDimming = this.calculateStarDimming(this.system.star.id);
    this.starDimmingFactors.set(this.system.star.id, primaryDimming);

    // Update companion stars
    if (this.system.companionStars) {
      for (const star of this.system.companionStars) {
        const dimming = this.calculateStarDimming(star.id);
        this.starDimmingFactors.set(star.id, dimming);
      }
    }
  }

  setGateOwnership(
    gateId: string,
    ownerId: string,
    ownerName: string,
    status: string,
    lastOvertakenAt?: number
  ): void {
    this.gateOwnership.set(gateId, {
      ownerId,
      ownerName,
      status,
      lastOvertakenAt: lastOvertakenAt || 0,
    });

    // Update gate visual color to match new ownership status
    this.updateGateColor(gateId, status);

    // Update gate defense renderer with ownership info (for coloring platforms)
    this.gateDefenseRenderer.setGateOwner(gateId, ownerId);
  }

  /**
   * Update a gate's visual color based on its ownership status
   */
  private updateGateColor(gateId: string, status: string): void {
    const gateGroup = this.gates.get(gateId);
    if (!gateGroup) return;

    // Determine color based on status
    let color: number;
    switch (status) {
      case "unexplored":
        color = 0xa855f7; // Purple
        break;
      case "owned_by_self":
        color = 0xfbbf24; // Yellow/Orange
        break;
      case "neutral":
        color = 0x9ca3af; // Gray
        break;
      case "aggressive":
        color = 0xef4444; // Red
        break;
      case "friendly":
        color = 0x10b981; // Green
        break;
      default:
        color = 0xa855f7; // Default to purple
    }

    // Update all materials in the gate group
    gateGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const material = child.material;
        if (material instanceof THREE.ShaderMaterial) {
          // Update shader uniforms
          if (material.uniforms.color) {
            material.uniforms.color.value.setHex(color);
          }
          if (material.uniforms.baseColor) {
            material.uniforms.baseColor.value.setHex(color);
          }
        } else if (
          material instanceof THREE.MeshBasicMaterial ||
          material instanceof THREE.MeshStandardMaterial
        ) {
          // Update standard materials
          material.color.setHex(color);
        }
      } else if (child instanceof THREE.PointLight) {
        // Update light color too
        child.color.setHex(color);
      }
    });

    // Update userData status
    gateGroup.userData.status = status;
  }

  clearGateOwnership(): void {
    this.gateOwnership.clear();
    // Note: Don't clear gateResourceFlow here - it's independent and will be
    // updated separately when new resource flow messages arrive
  }

  getGateOwnership(gateId: string):
    | {
        ownerId: string;
        ownerName: string;
        status: string;
        lastOvertakenAt?: number;
      }
    | undefined {
    return this.gateOwnership.get(gateId);
  }

  /**
   * Launch a new Dyson swarm with animation
   * @param megastructureId - ID of the megastructure
   * @param starId - ID of the star the swarm orbits
   */
  launchDysonSwarm(megastructureId: string, starId: string): void {
    if (!this.system) {
      return;
    }

    // Find the star to get its radius
    let star = this.system.star.id === starId ? this.system.star : null;
    if (!star && this.system.companionStars) {
      star = this.system.companionStars.find((s) => s.id === starId) || null;
    }
    if (!star) {
      return;
    }

    // Calculate scaled star radius
    const starRadius = star.radius * this.SCALE * this.BODY_SIZE_MULTIPLIER;

    // Calculate max swarms for this star to ensure proper distribution
    const starRadiusInSolarRadii = star.radius / SOLAR_RADIUS;
    const maxSwarms = calculateMaxDysonSwarms(starRadiusInSolarRadii);

    // Count how many swarms already exist or are launching for this star
    const existingSwarms = Array.from(this.satellites.values()).filter(
      (satelliteData) => satelliteData.starId === starId
    );
    const launchingSwarms = Array.from(
      this.launchingsatellites.values()
    ).filter(
      (launchDataArray) =>
        launchDataArray.length > 0 && launchDataArray[0].starId === starId
    );
    const swarmIndex = existingSwarms.length + launchingSwarms.length;

    // Create satellites for this swarm
    const currentTime = this.timeInterpolator.getGameTime();
    const satelliteMeshes = this.dysonSwarmFactory.createSwarmSatellites(
      swarmIndex,
      starRadius,
      currentTime,
      maxSwarms // Pass max swarms for proper distribution
    );

    // Get camera position for launch animation
    const cameraPos = this.camera.position.clone();

    // Get star position
    const starBody = this.bodies.get(starId);
    const starPosition = new THREE.Vector3();
    if (starId === this.system.star.id) {
      starPosition.set(0, 0, 0);
    } else if (starBody) {
      starPosition.copy(starBody.position);
    }

    // Prepare launch animation data with curved paths
    const launchData: {
      mesh: THREE.Group;
      startTime: number;
      startPos: THREE.Vector3;
      targetPos: THREE.Vector3;
      controlPoint: THREE.Vector3;
      starId: string;
      userData: any;
    }[] = [];

    // Launch satellites one by one with delays
    const currentRealTime = performance.now() / 1000;
    const launchDuration = 3.0; // 3 seconds to reach orbit

    for (let i = 0; i < satelliteMeshes.length; i++) {
      const satellite = satelliteMeshes[i];
      const launchDelay = i * 0.5;
      const totalFlightTime = launchDelay + launchDuration;

      // Calculate where the satellite SHOULD be when it arrives (accounting for orbital motion during flight)
      // Get the current orbital position (this was calculated at creation time)
      const initialLocalPos = new THREE.Vector3(
        satellite.position.x,
        satellite.position.y,
        satellite.position.z
      );

      // Calculate future game time when satellite will arrive
      const currentGameTime = this.timeInterpolator.getGameTime();
      const arrivalGameTime = currentGameTime + totalFlightTime;

      // Get orbital data to calculate future position
      const userData = satellite.userData as any;
      const orbitalPeriod = userData.orbitalPeriod;
      const orbitRadius = userData.orbitRadius;
      const fixedLongitude = userData.fixedLongitude;
      const inclination = userData.inclination;

      // Calculate orbital position at arrival time using SAME formula as update loop
      const timeAngle = (arrivalGameTime / orbitalPeriod) * Math.PI * 2;
      const currentAngle = fixedLongitude + timeAngle;

      // Calculate position on sphere using spherical coordinates
      // MUST match updateSatellitePositions exactly
      const futureLocalX =
        Math.sin(inclination) * Math.cos(currentAngle) * orbitRadius;
      const futureLocalY = Math.cos(inclination) * orbitRadius;
      const futureLocalZ =
        Math.sin(inclination) * Math.sin(currentAngle) * orbitRadius;

      // Target position in world space
      const targetPos = new THREE.Vector3(
        futureLocalX + starPosition.x,
        futureLocalY + starPosition.y,
        futureLocalZ + starPosition.z
      );

      // Start at camera position (offset slightly for each satellite)
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 50,
        (Math.random() - 0.5) * 50,
        (Math.random() - 0.5) * 50
      );
      const startPos = cameraPos.clone().add(offset);

      // Calculate control point for quadratic Bezier curve that goes AROUND the sun
      // Use the cross product to find a point perpendicular to the start-target line
      const toTarget = new THREE.Vector3().subVectors(targetPos, startPos);
      const midPoint = new THREE.Vector3()
        .addVectors(startPos, targetPos)
        .multiplyScalar(0.5);

      // Vector from sun to midpoint
      const sunToMid = new THREE.Vector3().subVectors(midPoint, starPosition);

      // If the path would go through or near the sun, push control point outward
      const distanceToSun = sunToMid.length();
      const minSafeDistance = starRadius * 2.5; // Stay well away from sun

      if (distanceToSun < minSafeDistance) {
        // Push control point outward from sun
        sunToMid.normalize().multiplyScalar(minSafeDistance);
        const controlPoint = starPosition.clone().add(sunToMid);

        // Add some perpendicular offset for variety
        const perpendicular = new THREE.Vector3()
          .crossVectors(toTarget, sunToMid)
          .normalize();
        controlPoint.add(
          perpendicular.multiplyScalar(starRadius * 1.5 * (Math.random() - 0.5))
        );

        launchData.push({
          mesh: satellite,
          startTime: currentRealTime + i * 0.5,
          startPos: startPos,
          targetPos: targetPos,
          controlPoint: controlPoint,
          starId: starId,
          userData: satellite.userData,
        });
      } else {
        // Path doesn't go near sun, use simple arc
        const controlPoint = midPoint
          .clone()
          .add(sunToMid.normalize().multiplyScalar(starRadius * 0.5));

        launchData.push({
          mesh: satellite,
          startTime: currentRealTime + i * 0.5,
          startPos: startPos,
          targetPos: targetPos,
          controlPoint: controlPoint,
          starId: starId,
          userData: satellite.userData,
        });
      }

      satellite.position.copy(startPos);

      // Make satellite visible and add to scene
      satellite.visible = true;
      this.scene.add(satellite);
    }

    // Store launching satellites
    this.launchingsatellites.set(megastructureId, launchData);
  }

  private clearScene(): void {
    // Dispose black hole renderers first
    this.celestialBodyFactory.disposeBlackHoles();

    // Clear all gate defenses and attacks
    this.gateDefenseRenderer.clearAll();

    // Clear gate resource flow animations and data
    this.gateResourceFlowRenderer.clear();
    this.gateResourceFlow.clear();

    // Clear planet rotation tracking
    this.planetRotations.clear();
    this.lastRotationUpdateTime = 0;

    // Dispose and remove all bodies
    for (const mesh of this.bodies.values()) {
      this.disposeMesh(mesh);
      this.scene.remove(mesh);
    }

    // Dispose and remove all ships
    for (const shipGroup of this.ships.values()) {
      shipGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          this.disposeMesh(child);
        } else if (child instanceof THREE.Light) {
          child.dispose();
        }
      });
      this.scene.remove(shipGroup);
    }

    // Dispose and remove all gates
    for (const gateGroup of this.gates.values()) {
      gateGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          this.disposeMesh(child);
        }
      });
      this.scene.remove(gateGroup);
    }

    // Dispose and remove all asteroids
    for (const mesh of this.asteroids.values()) {
      this.disposeMesh(mesh);
      this.scene.remove(mesh);
    }

    // Dispose mining installations
    this.miningInstallationRenderer.dispose();

    // Dispose Helium-3 extractors
    this.helium3ExtractorRenderer.dispose();

    // Dispose and remove all moons
    for (const mesh of this.moons.values()) {
      this.disposeMesh(mesh);
      this.scene.remove(mesh);
    }

    // Dispose and remove all rings
    for (const ringGroup of this.rings.values()) {
      ringGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          this.disposeMesh(child);
        }
      });
      this.scene.remove(ringGroup);
    }

    // Dispose and remove all orbit lines
    for (const line of this.orbitLines.values()) {
      if (line.geometry) {
        line.geometry.dispose();
      }
      if (line.material instanceof THREE.Material) {
        line.material.dispose();
      }
      this.scene.remove(line);
    }

    // Dispose and remove all moon orbit lines
    for (const line of this.moonOrbitLines.values()) {
      if (line.geometry) {
        line.geometry.dispose();
      }
      if (line.material instanceof THREE.Material) {
        line.material.dispose();
      }
      this.scene.remove(line);
    }

    // Dispose and remove all satellites
    for (const satelliteData of this.satellites.values()) {
      for (const satellite of satelliteData.meshes) {
        this.disposeMesh(satellite);
        this.scene.remove(satellite);
      }
    }

    // Dispose and remove launching satellites
    for (const launchDataArray of this.launchingsatellites.values()) {
      for (const launchData of launchDataArray) {
        this.disposeMesh(launchData.mesh);
        this.scene.remove(launchData.mesh);
      }
    }

    // Dispose and remove transitioning satellites
    for (const transitionData of this.transitioningSatellites.values()) {
      for (const satellite of transitionData.meshes) {
        this.disposeMesh(satellite);
        this.scene.remove(satellite);
      }
    }

    // Remove and clear lights (except ambient light which we keep)
    for (const light of this.lights) {
      if (!(light instanceof THREE.AmbientLight)) {
        this.scene.remove(light);
      }
    }
    this.lights = this.lights.filter(
      (light) => light instanceof THREE.AmbientLight
    );

    this.bodies.clear();
    this.ships.clear();
    this.gates.clear();
    this.asteroids.clear();
    this.moons.clear();
    this.rings.clear();
    this.orbitLines.clear();
    this.moonOrbitLines.clear();
    this.satellites.clear();
    this.launchingsatellites.clear();
    this.transitioningSatellites.clear();
    this.starMaterials = [];
    this.gateMaterials = [];
    this.timeInterpolator.clearPositions();
  }

  /**
   * Properly disposes of a mesh and all its resources
   */
  private disposeMesh(mesh: THREE.Mesh | THREE.Group): void {
    if (mesh instanceof THREE.Mesh) {
      // Dispose geometry
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }

      // Dispose materials
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((material) => this.disposeMaterial(material));
        } else {
          this.disposeMaterial(mesh.material);
        }
      }
    }

    // Dispose children (like atmosphere meshes or black hole components)
    mesh.children.forEach((child) => {
      if (child instanceof THREE.Mesh) {
        this.disposeMesh(child);
      }
    });
  }

  /**
   * Properly disposes of a material and its textures
   */
  private disposeMaterial(material: THREE.Material): void {
    // Dispose textures
    if (material instanceof THREE.MeshStandardMaterial) {
      if (material.map) material.map.dispose();
      if (material.emissiveMap) material.emissiveMap.dispose();
      if (material.normalMap) material.normalMap.dispose();
      if (material.roughnessMap) material.roughnessMap.dispose();
      if (material.metalnessMap) material.metalnessMap.dispose();
    } else if (material instanceof THREE.MeshBasicMaterial) {
      if (material.map) material.map.dispose();
    }

    // Dispose material itself
    material.dispose();
  }

  setTimeState(isPaused: boolean, timeScale: number): void {
    this.timeInterpolator.setTimeState(isPaused, timeScale);
  }

  /**
   * Trigger colony establishment animation on a planet
   */
  triggerColonyEstablishment(planetId: string): void {
    this.colonyEstablishmentRenderer.startEstablishment(planetId);
  }

  updateState(state: SystemState): void {
    // Update game time tracking for smooth interpolation
    this.timeInterpolator.setServerTime(state.currentTime);

    // Update body positions with interpolation tracking
    for (const bodyState of state.bodies) {
      // Skip position updates for the primary star (it should always be at origin)
      // Companion stars still get updated since they orbit
      if (this.system && bodyState.id === this.system.star.id) {
        continue;
      }

      const newPosition = new THREE.Vector3(
        bodyState.position.x * this.SCALE,
        bodyState.position.z * this.SCALE,
        bodyState.position.y * this.SCALE
      );

      this.timeInterpolator.setBodyTargetPosition(bodyState.id, newPosition);

      // If this is the first update for this body, set position directly
      const mesh = this.bodies.get(bodyState.id);
      if (
        mesh &&
        !this.timeInterpolator.getInterpolatedPosition(bodyState.id, 0)
      ) {
        mesh.position.copy(newPosition);
      }
    }

    // Position planet orbit lines at companion star locations
    if (this.system && this.system.companionStars) {
      for (const companionStar of this.system.companionStars) {
        const companionState = state.bodies.find(
          (b) => b.id === companionStar.id
        );
        if (companionState) {
          const companionPos = new THREE.Vector3(
            companionState.position.x * this.SCALE,
            companionState.position.z * this.SCALE,
            companionState.position.y * this.SCALE
          );
          // Update orbit line positions for planets orbiting this companion star
          for (const planet of this.system.planets) {
            if (planet.parentId === companionStar.id) {
              const orbitLine = this.orbitLines.get(planet.id);
              if (orbitLine) {
                orbitLine.position.copy(companionPos);
              }
            }
          }
        }
      }
    }

    // Update ship positions with interpolation for smooth movement
    for (const shipState of state.ships) {
      const newPosition = new THREE.Vector3(
        shipState.position.x * this.SCALE,
        shipState.position.z * this.SCALE,
        shipState.position.y * this.SCALE
      );

      this.timeInterpolator.setBodyTargetPosition(shipState.id, newPosition);

      let mesh = this.ships.get(shipState.id);
      if (!mesh) {
        // Create ship mesh
        mesh = this.celestialBodyFactory.createShipMesh();
        mesh.userData = { id: shipState.id, type: "ship", state: shipState };
        this.scene.add(mesh);
        this.ships.set(shipState.id, mesh);

        // Set initial position directly on first creation
        mesh.position.copy(newPosition);
      }
    }

    // Clean up removed ships from scene and interpolator
    const currentShipIds = new Set(state.ships.map((s) => s.id));
    for (const [shipId, mesh] of this.ships.entries()) {
      if (!currentShipIds.has(shipId)) {
        this.scene.remove(mesh);
        mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            this.disposeMesh(child);
          } else if (child instanceof THREE.Light) {
            child.dispose();
          }
        });
        this.ships.delete(shipId);
        this.timeInterpolator.removeBody(shipId);
      }
    }

    // Update gate positions (gates orbit like planets)
    for (const gateState of state.gates) {
      const newPosition = new THREE.Vector3(
        gateState.position.x * this.SCALE,
        gateState.position.z * this.SCALE,
        gateState.position.y * this.SCALE
      );

      this.timeInterpolator.setBodyTargetPosition(gateState.id, newPosition);

      // If this is the first update for this gate, set position directly
      const gateGroup = this.gates.get(gateState.id);
      if (
        gateGroup &&
        !this.timeInterpolator.getInterpolatedPosition(gateState.id, 0)
      ) {
        gateGroup.position.copy(newPosition);
      }
    }

    // Update asteroid positions (asteroids orbit like planets)
    for (const asteroidState of state.asteroids) {
      const newPosition = new THREE.Vector3(
        asteroidState.position.x * this.SCALE,
        asteroidState.position.z * this.SCALE,
        asteroidState.position.y * this.SCALE
      );

      this.timeInterpolator.setBodyTargetPosition(
        asteroidState.id,
        newPosition
      );

      // If this is the first update for this asteroid, set position directly
      const asteroidMesh = this.asteroids.get(asteroidState.id);
      if (
        asteroidMesh &&
        !this.timeInterpolator.getInterpolatedPosition(asteroidState.id, 0)
      ) {
        asteroidMesh.position.copy(newPosition);
      }
    }

    // Update moon positions (moons orbit their parent planet)
    for (const moonState of state.moons) {
      const newPosition = new THREE.Vector3(
        moonState.position.x * this.SCALE,
        moonState.position.z * this.SCALE,
        moonState.position.y * this.SCALE
      );

      this.timeInterpolator.setBodyTargetPosition(moonState.id, newPosition);

      // If this is the first update for this moon, set position directly
      const moonMesh = this.moons.get(moonState.id);
      if (
        moonMesh &&
        !this.timeInterpolator.getInterpolatedPosition(moonState.id, 0)
      ) {
        moonMesh.position.copy(newPosition);
      }

      // Position moon orbit line at parent planet's position
      if (this.system && moonMesh) {
        const moon = this.system.moons.find((m) => m.id === moonState.id);
        if (moon && moon.parentId) {
          const parentBody = state.bodies.find((b) => b.id === moon.parentId);
          if (parentBody) {
            const moonOrbitLine = this.moonOrbitLines.get(moonState.id);
            if (moonOrbitLine) {
              moonOrbitLine.position.set(
                parentBody.position.x * this.SCALE,
                parentBody.position.z * this.SCALE,
                parentBody.position.y * this.SCALE
              );
            }
          }
        }
      }
    }

    // Update megastructures (Dyson swarms) - check if any new ones were added
    if (this.system && state.megastructures) {
      // Compare current megastructures with what we have rendered
      const currentMegastructureIds = new Set(
        (this.system.megastructures || []).map((m) => m.id)
      );
      const newMegastructureIds = new Set(
        state.megastructures.map((m) => m.id)
      );

      // Check if there are new megastructures we need to render
      const addedMegastructures = state.megastructures.filter(
        (m) => !currentMegastructureIds.has(m.id)
      );

      // Check if any megastructures were removed
      const removedMegastructureIds = Array.from(
        currentMegastructureIds
      ).filter((id) => !newMegastructureIds.has(id));

      // Update system data with new megastructures
      this.system.megastructures = state.megastructures;

      // Add new megastructures
      if (addedMegastructures.length > 0) {
        // Group swarms by star to get swarm index per star
        const swarmsByStarId = new Map<string, any[]>();

        for (const megastructure of state.megastructures) {
          if (
            megastructure.type === "dyson_swarm" &&
            megastructure.celestialBodyId
          ) {
            const starId = megastructure.celestialBodyId;
            if (!swarmsByStarId.has(starId)) {
              swarmsByStarId.set(starId, []);
            }
            swarmsByStarId.get(starId)!.push(megastructure);
          }
        }

        // Create satellites for new megastructures
        for (const megastructure of addedMegastructures) {
          if (
            megastructure.type === "dyson_swarm" &&
            megastructure.celestialBodyId
          ) {
            const starId = megastructure.celestialBodyId;
            const star =
              starId === this.system.star.id
                ? this.system.star
                : this.system.companionStars?.find((s) => s.id === starId);

            if (star) {
              const starSwarms = swarmsByStarId.get(starId) || [];
              const swarmIndex = starSwarms.findIndex(
                (s) => s.id === megastructure.id
              );

              // Calculate max swarms for proper distribution
              const starRadiusInSolarRadii = star.radius / SOLAR_RADIUS;
              const maxSwarms = calculateMaxDysonSwarms(starRadiusInSolarRadii);

              // Create satellites for this swarm (returns an array)
              const currentTime = state.currentTime;
              const starRadius =
                star.radius * this.SCALE * this.BODY_SIZE_MULTIPLIER;
              const satelliteMeshes =
                this.dysonSwarmFactory.createSwarmSatellites(
                  swarmIndex,
                  starRadius,
                  currentTime,
                  maxSwarms
                );

              // Add metadata to each satellite
              for (const satellite of satelliteMeshes) {
                satellite.userData = {
                  id: megastructure.id,
                  type: "dyson_swarm",
                  megastructure: megastructure,
                };

                // Add to scene
                this.scene.add(satellite);
              }

              // Update satellites map
              this.satellites.set(megastructure.id, {
                meshes: satelliteMeshes,
                starId: starId,
              });

              // Update star dimming
              this.updateStarDimming();
            }
          }
        }
      }

      // Remove deleted megastructures
      for (const removedId of removedMegastructureIds) {
        const satelliteData = this.satellites.get(removedId);
        if (satelliteData) {
          // Remove satellites from scene
          for (const mesh of satelliteData.meshes) {
            this.scene.remove(mesh);
            mesh.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.geometry?.dispose();
                if (Array.isArray(child.material)) {
                  child.material.forEach((m) => this.disposeMaterial(m));
                } else if (child.material) {
                  this.disposeMaterial(child.material);
                }
              }
            });
          }
          this.satellites.delete(removedId);

          // Update star dimming
          this.updateStarDimming();
        }
      }
    }
  }

  private onMouseDown(event: MouseEvent): void {
    // Handle constellation view
    if (this.isConstellationViewActive) {
      // Right mouse button: drag stars
      if (event.button === 2) {
        const raycaster = new THREE.Raycaster();
        const isDragging = this.constellationView.onMouseDown(
          event,
          this.camera,
          raycaster
        );
        if (isDragging) {
          event.preventDefault();
          return;
        }
      }

      // Left mouse button: only for camera rotation, not clicking
      // Camera controller will handle rotation via onMouseMove
      if (event.button === 0) {
        this.cameraController.onMouseDown(event);

        // Check for clicks after delay (planet circles, unexplored gates, or stars)
        setTimeout(() => {
          if (!this.cameraController.getIsDragging()) {
            const raycaster = new THREE.Raycaster();

            // First check for planet circle clicks
            const planetCircleClick =
              this.constellationView.onPlanetCircleClick(
                event,
                this.camera,
                raycaster
              );

            if (planetCircleClick) {
              console.log(
                `Scene: planet circle clicked: ${planetCircleClick.planetName} in system ${planetCircleClick.systemId}`
              );
              if (this.onConstellationPlanetSelected) {
                this.onConstellationPlanetSelected(
                  planetCircleClick.systemId,
                  planetCircleClick.planetId,
                  planetCircleClick.planetName
                );
                return;
              }
            }

            // Then check for unexplored gate clicks
            const clickedGateId = this.constellationView.onUnexploredGateClick(
              event,
              this.camera,
              raycaster
            );

            if (clickedGateId) {
              console.log(`Scene: unexplored gate clicked: ${clickedGateId}`);
              if (this.onConstellationGateSelected) {
                console.log(
                  `Scene: calling onConstellationGateSelected callback`
                );
                this.onConstellationGateSelected(clickedGateId);
                return;
              } else {
                console.warn(
                  `Scene: onConstellationGateSelected callback not set!`
                );
              }
            }

            // Finally check for star clicks
            const clickResult = this.constellationView.onStarClick(
              event,
              this.camera,
              raycaster
            );

            if (clickResult && this.onConstellationSystemSelected) {
              this.onConstellationSystemSelected(
                clickResult.systemId,
                clickResult.action
              );
            }
          }
        }, 150);
      }

      return;
    }

    // Normal system view
    this.cameraController.onMouseDown(event);
    this.interactionManager.updateMousePosition(event);

    // Small delay to differentiate between click and drag
    setTimeout(() => {
      if (!this.cameraController.getIsDragging()) {
        this.handleObjectClick();
      }
    }, 150);
  }

  private onMouseMove(event: MouseEvent): void {
    // Handle constellation view dragging
    if (this.isConstellationViewActive) {
      const raycaster = new THREE.Raycaster();
      const isDragging = this.constellationView.onMouseMove(
        event,
        this.camera,
        raycaster
      );
      if (isDragging) {
        event.preventDefault();
        return; // Don't handle camera rotation while dragging
      }
    }

    this.interactionManager.updateMousePosition(event);

    // Update hover state for cursor feedback
    this.updateHoverState();

    // Handle camera rotation
    this.cameraController.onMouseMove(event);
  }

  private updateHoverState(): void {
    // In constellation view, only show pointer over stars and mystery endpoints
    if (this.isConstellationViewActive) {
      const raycaster = new THREE.Raycaster();
      const mouse = this.interactionManager.getMousePosition();
      raycaster.setFromCamera(mouse, this.camera);

      // Get all constellation interactive objects (stars and mystery endpoints)
      const constellationObjects: THREE.Object3D[] = [];
      this.scene.traverse((object) => {
        if (
          object.userData.type === "constellationNode" ||
          object.userData.type === "undiscoveredEndpoint"
        ) {
          constellationObjects.push(object);
        }
      });

      const intersects = raycaster.intersectObjects(constellationObjects, true);
      this.renderer.domElement.style.cursor =
        intersects.length > 0 ? "pointer" : "default";
      return;
    }

    // Normal system view
    const allObjects = [
      ...this.bodies.values(),
      ...this.ships.values(),
      ...this.gates.values(),
      ...this.asteroids.values(),
      ...this.moons.values(),
    ];
    const isHovering = this.interactionManager.isHoveringOverObject(
      this.camera,
      allObjects
    );

    this.renderer.domElement.style.cursor = isHovering ? "pointer" : "default";
  }

  private onMouseUp(): void {
    // Handle constellation view drag end
    if (this.isConstellationViewActive) {
      const wasDragging = this.constellationView.isDragging();
      this.constellationView.onMouseUp();

      // Save positions if a drag just ended
      if (wasDragging && this.onConstellationPositionsChanged) {
        const positions = this.constellationView.getAllPositions();
        this.onConstellationPositionsChanged(positions);
      }
    }

    this.cameraController.onMouseUp();
  }

  private handleObjectClick(): void {
    // Handle constellation view clicks
    if (this.isConstellationViewActive) {
      const raycaster = new THREE.Raycaster();
      const clickResult = this.constellationView.onStarClick(
        new MouseEvent("click"), // We'll use the actual event in onMouseDown
        this.camera,
        raycaster
      );

      if (clickResult && this.onConstellationSystemSelected) {
        this.onConstellationSystemSelected(
          clickResult.systemId,
          clickResult.action
        );
      }
      return;
    }

    // Normal system view clicks
    const allObjects = [
      ...this.bodies.values(),
      ...this.ships.values(),
      ...this.gates.values(),
      ...this.asteroids.values(),
      ...this.moons.values(),
    ];
    const objectId = this.interactionManager.getIntersectedObjectId(
      this.camera,
      allObjects
    );

    if (objectId) {
      this.centerOnObject(objectId);
    }
  }

  private onMouseWheel(event: WheelEvent): void {
    this.cameraController.onMouseWheel(event);
  }

  private onContextMenu(event: MouseEvent): void {
    // Prevent context menu in constellation view when dragging stars
    if (this.isConstellationViewActive) {
      event.preventDefault();
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    // Check if keyboard input should be blocked (e.g., modal is open)
    if (this.shouldBlockKeyboardInput && this.shouldBlockKeyboardInput()) {
      return;
    }

    // Track keyboard state for constellation view navigation
    if (this.isConstellationViewActive) {
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d"].includes(key)) {
        this.keyboardState[key] = true;
        event.preventDefault(); // Prevent page scrolling
      }
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    // Check if keyboard input should be blocked (e.g., modal is open)
    if (this.shouldBlockKeyboardInput && this.shouldBlockKeyboardInput()) {
      return;
    }

    const key = event.key.toLowerCase();
    this.keyboardState[key] = false;
  }

  private onTouchStart(event: TouchEvent): void {
    // Prevent default to avoid triggering mouse events on mobile
    event.preventDefault();

    // Handle constellation view
    if (this.isConstellationViewActive) {
      // For now, only handle camera rotation in constellation view
      // Touch dragging stars would need more complex gesture detection
      if (event.touches.length === 1) {
        this.cameraController.onTouchStart(event);
        this.interactionManager.updateTouchPosition(event);

        // Check for taps after delay (stars or unexplored gates)
        setTimeout(() => {
          if (!this.cameraController.getIsTouchDragging()) {
            const raycaster = new THREE.Raycaster();

            // Convert touch to mouse event for compatibility
            const touch = event.touches[0] || event.changedTouches[0];
            const mockMouseEvent = new MouseEvent("click", {
              clientX: touch.clientX,
              clientY: touch.clientY,
            });

            // First check for unexplored gate taps
            const clickedGateId = this.constellationView.onUnexploredGateClick(
              mockMouseEvent,
              this.camera,
              raycaster
            );

            if (clickedGateId) {
              if (this.onConstellationGateSelected) {
                this.onConstellationGateSelected(clickedGateId);
                return;
              }
            }

            // Then check for star taps
            const clickResult = this.constellationView.onStarClick(
              mockMouseEvent,
              this.camera,
              raycaster
            );

            if (clickResult && this.onConstellationSystemSelected) {
              this.onConstellationSystemSelected(
                clickResult.systemId,
                clickResult.action
              );
            }
          }
        }, 150);
      }
      return;
    }

    // Normal system view
    this.cameraController.onTouchStart(event);
    this.interactionManager.updateTouchPosition(event);

    // Small delay to differentiate between tap and drag
    setTimeout(() => {
      if (!this.cameraController.getIsTouchDragging()) {
        this.handleObjectClick();
      }
    }, 150);
  }

  private onTouchMove(event: TouchEvent): void {
    // Prevent default to avoid scrolling and zooming
    event.preventDefault();

    // Handle constellation view
    if (this.isConstellationViewActive) {
      // For now, only handle camera rotation
      this.cameraController.onTouchMove(event);
      return;
    }

    this.interactionManager.updateTouchPosition(event);

    // Update hover state for cursor feedback
    this.updateHoverState();

    // Handle camera rotation and zoom
    this.cameraController.onTouchMove(event);
  }

  private onTouchEnd(event: TouchEvent): void {
    // Prevent default
    event.preventDefault();

    // Handle constellation view
    if (this.isConstellationViewActive) {
      // For constellation view, we don't have drag-to-reposition on touch yet
      // Just end the camera touch interaction
      this.cameraController.onTouchEnd();
      return;
    }

    this.cameraController.onTouchEnd();
  }

  private onWindowResize(): void {
    this.cameraController.onWindowResize();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  update(): void {
    // Rotate starfield slowly (independent of game time)
    if (this.starfield) {
      const realTime = performance.now() / 1000;
      this.starfield.rotation.y = realTime * 0.01; // Slow rotation
    }

    // Update interpolated game time (needed for both constellation and system view)
    this.timeInterpolator.update();

    // Handle constellation view updates
    if (this.isConstellationViewActive) {
      const deltaTime = 0.016; // Approximate 60fps
      const currentGameTime = this.timeInterpolator.getGameTime();
      this.constellationView.update(deltaTime, currentGameTime);

      // Update star animations in constellation view using real time
      const realTime = performance.now();
      this.constellationView.updateStarAnimations(realTime);

      // Handle WASD keyboard navigation relative to camera orientation
      const moveSpeed = this.KEYBOARD_MOVE_SPEED * deltaTime;
      const cameraTarget = this.cameraController.getCameraTarget();

      // Get camera's forward and right vectors (projected onto XZ plane for horizontal movement)
      const cameraDirection = new THREE.Vector3();
      this.camera.getWorldDirection(cameraDirection);

      // Project onto XZ plane and normalize
      const forward = new THREE.Vector3(
        cameraDirection.x,
        0,
        cameraDirection.z
      ).normalize();
      const right = new THREE.Vector3()
        .crossVectors(new THREE.Vector3(0, 1, 0), forward)
        .normalize();

      if (this.keyboardState["w"]) {
        // Move forward relative to camera view
        cameraTarget.add(forward.multiplyScalar(moveSpeed));
      }
      if (this.keyboardState["s"]) {
        // Move backward relative to camera view
        cameraTarget.add(forward.multiplyScalar(-moveSpeed));
      }
      if (this.keyboardState["a"]) {
        // Move left relative to camera view
        cameraTarget.add(right.multiplyScalar(moveSpeed));
      }
      if (this.keyboardState["d"]) {
        // Move right relative to camera view
        cameraTarget.add(right.multiplyScalar(-moveSpeed));
      }

      // Update camera in constellation view (allows rotation and zoom)
      this.cameraController.update(undefined);
      return; // Skip system view updates when in constellation view
    }

    // Update black hole animations (accretion disk rotation, lensing arcs)
    const deltaTime = 0.016; // Approximate 60fps
    this.celestialBodyFactory.updateBlackHoles(this.camera, deltaTime);

    // Update star shader time uniforms for animation using interpolated game time
    for (const material of this.starMaterials) {
      if (material.uniforms.time) {
        material.uniforms.time.value = this.timeInterpolator.getGameTime();
      }
    }

    // Update gate shader time uniforms for animation
    for (const material of this.gateMaterials) {
      if (material.uniforms.time) {
        material.uniforms.time.value = this.timeInterpolator.getGameTime();
      }
    }

    // Handle gate travel animation
    const animState = this.gateTravelAnimator.update();

    // Load destination system during travel phase (mid-way through travel)
    if (
      this.pendingDestinationSystem &&
      !this.hasLoadedDestinationDuringTravel &&
      animState.phase === "travel" &&
      animState.progress >= 0.5
    ) {
      console.log("Loading destination system during travel...");
      this.loadSystem(this.pendingDestinationSystem);
      this.hasLoadedDestinationDuringTravel = true;
      this.pendingDestinationSystem = null;
    }

    // Hide entry gate during zoom-in phase when we get very close
    if (
      animState.phase === "zoom-in" &&
      animState.progress >= 0.8 &&
      this.entryGateId
    ) {
      const entryGateGroup = this.gates.get(this.entryGateId);
      if (entryGateGroup && entryGateGroup.visible) {
        entryGateGroup.visible = false;
      }
    }

    // Show scene when animation completes
    if (animState.isComplete && this.exitGateId) {
      const exitGateGroup = this.gates.get(this.exitGateId);
      if (exitGateGroup && !exitGateGroup.visible) {
        // Show all objects
        for (const mesh of this.bodies.values()) {
          mesh.visible = true;
        }
        for (const mesh of this.ships.values()) {
          mesh.visible = true;
        }
        for (const gateGroup of this.gates.values()) {
          gateGroup.visible = true;
        }
        for (const mesh of this.asteroids.values()) {
          mesh.visible = true;
        }
        for (const mesh of this.moons.values()) {
          mesh.visible = true;
        }
        for (const ringGroup of this.rings.values()) {
          ringGroup.visible = true;
        }
        for (const satelliteData of this.satellites.values()) {
          for (const satellite of satelliteData.meshes) {
            satellite.visible = true;
          }
        }
        for (const launchDataArray of this.launchingsatellites.values()) {
          for (const launchData of launchDataArray) {
            launchData.mesh.visible = true;
          }
        }
        for (const transitionData of this.transitioningSatellites.values()) {
          for (const satellite of transitionData.meshes) {
            satellite.visible = true;
          }
        }
        // Show mining installations after gate travel
        this.miningInstallationRenderer.setVisible(true);
        // Show Helium-3 extractors after gate travel
        this.helium3ExtractorRenderer.setVisible(true);
        // Show planet orbit lines for planets orbiting the primary star only
        if (this.system) {
          for (const planet of this.system.planets) {
            const orbitLine = this.orbitLines.get(planet.id);
            if (orbitLine) {
              // Only show orbit lines for planets orbiting the primary star
              orbitLine.visible = planet.parentId === this.system.star.id;
            }
          }
        }
        // Moon orbit lines, companion star orbit lines, and companion star planet orbit lines remain hidden unless their conditions are met

        // Clear exit gate ID so we don't reposition again
        this.exitGateId = null;
      }
    }

    if (animState.isComplete && this.entryGateId) {
      // Clear entry gate ID when animation completes
      this.entryGateId = null;
      this.hasLoadedDestinationDuringTravel = false;
      this.pendingDestinationSystem = null;
    }

    // Get interpolation factor for smooth orbital motion
    // Match server update rate: 5Hz = 0.2s per update
    // We use a larger buffer (0.4s) to handle network jitter and server processing spikes
    const lerpFactor = this.timeInterpolator.getLerpFactor(0.4);

    // Collect all star positions for planet lighting
    const starLightPositions: THREE.Vector3[] = [];
    const starLightIntensities: number[] = [];

    if (this.system) {
      // Primary star is always at origin
      starLightPositions.push(new THREE.Vector3(0, 0, 0));
      // Apply Dyson swarm dimming to primary star
      const primaryDimming =
        this.starDimmingFactors.get(this.system.star.id) || 1.0;
      starLightIntensities.push(primaryDimming);

      // Update primary star brightness and light
      const primaryMesh = this.bodies.get(this.system.star.id);
      if (primaryMesh && primaryMesh.userData.light) {
        // Update star material brightness
        const starMaterial = (primaryMesh as THREE.Mesh)
          .material as THREE.ShaderMaterial;
        if (starMaterial.uniforms && starMaterial.uniforms.brightness) {
          starMaterial.uniforms.brightness.value = primaryDimming;
        }
        // Update star light intensity
        const light = primaryMesh.userData.light as THREE.PointLight;
        light.intensity = 30 * primaryDimming;
      }

      // Add companion stars if they exist
      if (this.system.companionStars) {
        for (const companionStar of this.system.companionStars) {
          const companionMesh = this.bodies.get(companionStar.id);
          if (companionMesh) {
            const companionPos = this.timeInterpolator.getInterpolatedPosition(
              companionStar.id,
              lerpFactor
            );
            if (companionPos) {
              starLightPositions.push(companionPos.clone());
              // Companion star intensity with Dyson swarm dimming
              const companionDimming =
                this.starDimmingFactors.get(companionStar.id) || 1.0;
              starLightIntensities.push(companionDimming);

              // Update companion star brightness and light
              if (companionMesh.userData.light) {
                const companionMaterial = (companionMesh as THREE.Mesh)
                  .material as THREE.ShaderMaterial;
                if (
                  companionMaterial.uniforms &&
                  companionMaterial.uniforms.brightness
                ) {
                  companionMaterial.uniforms.brightness.value =
                    companionDimming;
                }
                const companionLight = companionMesh.userData
                  .light as THREE.PointLight;
                companionLight.intensity = 30 * companionDimming;
              }

              // Update orbit line positions for planets orbiting this companion star
              for (const planet of this.system.planets) {
                if (planet.parentId === companionStar.id) {
                  const orbitLine = this.orbitLines.get(planet.id);
                  if (orbitLine) {
                    orbitLine.position.copy(companionPos);
                  }
                }
              }
            }
          }
        }
      }
    }

    // Ensure we have exactly 3 positions/intensities (pad with zeros if needed)
    while (starLightPositions.length < 3) {
      starLightPositions.push(new THREE.Vector3(0, 0, 0));
      starLightIntensities.push(0.0);
    }

    // Calculate delta time for smooth rotation updates (once per frame, not per planet)
    const currentRotationTime = performance.now() / 1000;
    const rotationDeltaTime =
      this.lastRotationUpdateTime === 0
        ? 0.016
        : currentRotationTime - this.lastRotationUpdateTime;

    // Update planet positions and rotations
    for (const [bodyId, mesh] of this.bodies.entries()) {
      // Update positions for all bodies except the primary star (which stays at origin)
      // Companion stars still get updated since they orbit
      const isPrimaryStar = this.system && bodyId === this.system.star.id;

      if (!isPrimaryStar) {
        // Smooth orbital motion interpolation
        const interpolatedPos = this.timeInterpolator.getInterpolatedPosition(
          bodyId,
          lerpFactor
        );
        if (interpolatedPos) {
          mesh.position.copy(interpolatedPos);

          // Update ring position to follow planet
          const ringGroup = this.rings.get(bodyId);
          if (ringGroup) {
            ringGroup.position.copy(interpolatedPos);
          }
        }
      }

      // Add planet rotation via shader uniform for smooth animation
      if (mesh.userData.type === "planet" && mesh instanceof THREE.Mesh) {
        // Rotate based on game time with realistic rotation periods
        const baseRotationSpeed = (2 * Math.PI) / 86400; // One Earth day
        const speedMultiplier = 0.5 + (bodyId.charCodeAt(0) % 10) * 0.15;
        const rotationSpeed = baseRotationSpeed * speedMultiplier;

        // Use incremental rotation to avoid discontinuities from time updates
        // Initialize rotation if not exists
        if (!this.planetRotations.has(bodyId)) {
          this.planetRotations.set(bodyId, 0);
        }

        // Increment rotation based on real time elapsed (not game time)
        // This ensures smooth visual rotation even if game time has small jumps
        if (!this.timeInterpolator.getIsPaused() && rotationDeltaTime > 0) {
          // Increment rotation based on time scale
          const rotationIncrement =
            rotationSpeed *
            rotationDeltaTime *
            this.timeInterpolator.getTimeScale();
          const currentRotation =
            this.planetRotations.get(bodyId)! + rotationIncrement;
          this.planetRotations.set(bodyId, currentRotation);
        }

        const rotation = this.planetRotations.get(bodyId)!;

        // Update shader uniform if using ShaderMaterial
        if (
          mesh.material instanceof THREE.ShaderMaterial &&
          mesh.material.uniforms.rotation
        ) {
          mesh.material.uniforms.rotation.value = rotation;

          // Update time uniform for animated shaders (like volcanic planets)
          if (mesh.material.uniforms.time) {
            mesh.material.uniforms.time.value =
              this.timeInterpolator.getGameTime();
          }

          // Update camera position for specular reflections (oceans)
          if (mesh.material.uniforms.viewPosition) {
            mesh.material.uniforms.viewPosition.value.copy(
              this.camera.position
            );
          }

          // Update light positions from all stars in the system
          if (mesh.material.uniforms.lightPosition1) {
            mesh.material.uniforms.lightPosition1.value.copy(
              starLightPositions[0]
            );
            mesh.material.uniforms.lightIntensity1.value =
              starLightIntensities[0];
          }
          if (mesh.material.uniforms.lightPosition2) {
            mesh.material.uniforms.lightPosition2.value.copy(
              starLightPositions[1]
            );
            mesh.material.uniforms.lightIntensity2.value =
              starLightIntensities[1];
          }
          if (mesh.material.uniforms.lightPosition3) {
            mesh.material.uniforms.lightPosition3.value.copy(
              starLightPositions[2]
            );
            mesh.material.uniforms.lightIntensity3.value =
              starLightIntensities[2];
          }

          // Update population uniform for dynamic city lights
          if (mesh.material.uniforms.population && this.system?.colonies) {
            // Find colony on this planet
            const colony = this.system.colonies.find(
              (c) => c.planetId === bodyId
            );
            if (colony) {
              mesh.material.uniforms.population.value = colony.population;
            } else {
              mesh.material.uniforms.population.value = 0;
            }
          }
        }

        // For MeshPhongMaterial (ice planets) and MeshStandardMaterial (terrestrial), rotate the texture
        if (
          (mesh.material instanceof THREE.MeshPhongMaterial ||
            mesh.material instanceof THREE.MeshStandardMaterial) &&
          mesh.material.map
        ) {
          // Rotate texture by offsetting U coordinate
          mesh.material.map.offset.x = rotation / (2 * Math.PI);
        }

        // Update cloud layer rotations if planet has atmosphere
        mesh.children.forEach((child) => {
          if (child.userData.cloudLayer && child instanceof THREE.Mesh) {
            const cloudMaterial = child.material as THREE.ShaderMaterial;
            if (cloudMaterial.uniforms && cloudMaterial.uniforms.rotation) {
              const cloudId = `${bodyId}_cloud_${child.userData.cloudLayer}`;

              // Initialize cloud rotation if not exists
              if (!this.planetRotations.has(cloudId)) {
                this.planetRotations.set(cloudId, 0);
              }

              // Increment cloud rotation
              if (
                !this.timeInterpolator.getIsPaused() &&
                rotationDeltaTime > 0
              ) {
                const cloudRotationSpeed =
                  baseRotationSpeed * child.userData.rotationSpeed;
                const cloudRotationIncrement =
                  cloudRotationSpeed *
                  rotationDeltaTime *
                  this.timeInterpolator.getTimeScale();
                const currentCloudRotation =
                  this.planetRotations.get(cloudId)! + cloudRotationIncrement;
                this.planetRotations.set(cloudId, currentCloudRotation);
              }

              cloudMaterial.uniforms.rotation.value =
                this.planetRotations.get(cloudId)!;

              // Update time uniform for evolving cloud patterns (use game time for these effects)
              if (cloudMaterial.uniforms.time) {
                cloudMaterial.uniforms.time.value =
                  this.timeInterpolator.getGameTime();
              }
            }
          }
        });
      } else if (mesh.userData.type === "star" && !mesh.userData.isBlackHole) {
        // Regular stars rotate very slowly (black holes don't rotate)
        mesh.rotation.y = this.timeInterpolator.getGameTime() * 0.00001;
      }
    }

    // Update gate positions and animations
    for (const [gateId, gateGroup] of this.gates.entries()) {
      // Smooth orbital motion interpolation
      const interpolatedPos = this.timeInterpolator.getInterpolatedPosition(
        gateId,
        lerpFactor
      );
      if (interpolatedPos) {
        gateGroup.position.copy(interpolatedPos);
      }

      // Animate the energy ball (slight rotation)
      gateGroup.traverse((child) => {
        if (child.userData.energyBall) {
          child.rotation.y = this.timeInterpolator.getGameTime() * 0.0002;
          child.rotation.x = this.timeInterpolator.getGameTime() * 0.00015;
        }
        // Rotate banners around the energy ball
        if (child.userData.banner) {
          const bannerIndex = child.userData.bannerIndex || 0;
          const offset = (bannerIndex / 3) * Math.PI * 2;
          child.rotation.y =
            this.timeInterpolator.getGameTime() * 0.0003 + offset;
        }
        // Animate particles floating around
        if (child.userData.particles && child instanceof THREE.Points) {
          child.rotation.y = this.timeInterpolator.getGameTime() * 0.0001;
          child.rotation.x =
            Math.sin(this.timeInterpolator.getGameTime() * 0.0002) * 0.2;
        }
      });
    }

    // Update asteroid positions and rotations
    for (const [asteroidId, mesh] of this.asteroids.entries()) {
      // Smooth orbital motion interpolation
      const interpolatedPos = this.timeInterpolator.getInterpolatedPosition(
        asteroidId,
        lerpFactor
      );
      if (interpolatedPos) {
        mesh.position.copy(interpolatedPos);
      }

      // Add asteroid rotation if it has a rotation rate
      if (mesh.userData.rotationRate && mesh.userData.rotationRate > 0) {
        const rotation =
          this.timeInterpolator.getGameTime() * mesh.userData.rotationRate;
        // Rotate around multiple axes for more interesting tumbling motion
        mesh.rotation.x = rotation;
        mesh.rotation.y = rotation * 0.7;
        mesh.rotation.z = rotation * 0.5;
      }
    }

    // Update mining installations
    if (this.system && this.system.miningOperations) {
      this.miningInstallationRenderer.update(
        this.system.miningOperations,
        deltaTime
      );
    }

    // Update Helium-3 extractors
    if (this.system && this.system.helium3Operations) {
      this.helium3ExtractorRenderer.update(
        this.system.helium3Operations,
        deltaTime
      );
    }

    // Update colony establishment animations
    this.colonyEstablishmentRenderer.update(deltaTime);

    // Update gate defense and attack animations
    this.gateDefenseRenderer.update(deltaTime);

    // Update gate resource flow animations
    this.gateResourceFlowRenderer.update(deltaTime);

    // Update moon positions and rotations
    for (const [moonId, mesh] of this.moons.entries()) {
      // Smooth orbital motion interpolation
      const interpolatedPos = this.timeInterpolator.getInterpolatedPosition(
        moonId,
        lerpFactor
      );
      if (interpolatedPos) {
        mesh.position.copy(interpolatedPos);
      }

      // Update moon orbit line position to follow parent planet
      if (this.system) {
        const moon = this.system.moons.find((m) => m.id === moonId);
        if (moon && moon.parentId) {
          const moonOrbitLine = this.moonOrbitLines.get(moonId);
          if (moonOrbitLine) {
            // Get parent planet's interpolated position
            const parentInterpolatedPos =
              this.timeInterpolator.getInterpolatedPosition(
                moon.parentId,
                lerpFactor
              );
            if (parentInterpolatedPos) {
              moonOrbitLine.position.copy(parentInterpolatedPos);
            }
          }
        }
      }

      // Add moon rotation if it has a rotation rate
      if (mesh.userData.rotationRate && mesh.userData.rotationRate > 0) {
        const rotation =
          this.timeInterpolator.getGameTime() * mesh.userData.rotationRate;

        // Check if this moon has chaotic tumbling or stable rotation
        const isTumbling = mesh.userData.body?.isTumbling || false;

        if (isTumbling) {
          // Chaotic tumbling: rotate around multiple axes (rare)
          mesh.rotation.x = rotation;
          mesh.rotation.y = rotation * 0.7;
          mesh.rotation.z = rotation * 0.5;
        } else {
          // Stable rotation: single axis (most common)
          mesh.rotation.y = rotation;
        }
      }
    }

    // Update launching Dyson swarm satellites (animation)
    const currentRealTime = performance.now() / 1000;
    const completedLaunches: string[] = [];

    if (this.launchingsatellites.size > 0) {
      // Only log when there are launching satellites to avoid spam
      for (const [
        megastructureId,
        launchDataArray,
      ] of this.launchingsatellites.entries()) {
        let allCompleted = true;

        for (const launchData of launchDataArray) {
          const elapsed = currentRealTime - launchData.startTime;

          if (elapsed < 0) {
            // Hasn't started yet
            allCompleted = false;
            continue;
          }

          const launchDuration = 3.0; // 3 seconds to reach orbit
          const t = Math.min(elapsed / launchDuration, 1.0);

          if (t < 1.0) {
            // Still launching - use ease-out animation with Bezier curve
            const eased = 1 - Math.pow(1 - t, 3); // Cubic ease-out

            // Quadratic Bezier curve: B(t) = (1-t)²P₀ + 2(1-t)tP₁ + t²P₂
            const oneMinusT = 1 - eased;
            const pos = new THREE.Vector3();

            // Calculate position on Bezier curve
            pos.addScaledVector(launchData.startPos, oneMinusT * oneMinusT);
            pos.addScaledVector(launchData.controlPoint, 2 * oneMinusT * eased);
            pos.addScaledVector(launchData.targetPos, eased * eased);

            launchData.mesh.position.copy(pos);

            // Smoothly rotate from travel direction to sun-facing
            // Calculate tangent for orientation (derivative of Bezier curve)
            const tangent = new THREE.Vector3();
            tangent.addScaledVector(
              new THREE.Vector3().subVectors(
                launchData.controlPoint,
                launchData.startPos
              ),
              2 * oneMinusT
            );
            tangent.addScaledVector(
              new THREE.Vector3().subVectors(
                launchData.targetPos,
                launchData.controlPoint
              ),
              2 * eased
            );

            // Get star position for this satellite's star
            const starId = launchData.starId;
            const starPosition = new THREE.Vector3();
            if (this.system && starId === this.system.star.id) {
              starPosition.set(0, 0, 0);
            } else {
              const starBody = this.bodies.get(starId);
              if (starBody) {
                starPosition.copy(starBody.position);
              }
            }

            // Direction to travel along path
            const travelDirection = tangent.clone().normalize();

            // Direction to sun
            const toSunDirection = new THREE.Vector3()
              .subVectors(starPosition, pos)
              .normalize();

            // Interpolate between travel direction and sun direction
            // Early in animation (t < 0.3): mostly travel direction
            // Late in animation (t > 0.7): mostly sun direction
            const rotationBlend = Math.max(0, (t - 0.3) / 0.7); // Smooth transition from 30% to 100%
            const blendedDirection = new THREE.Vector3();
            blendedDirection.lerpVectors(
              travelDirection,
              toSunDirection,
              rotationBlend
            );

            // Point in the blended direction
            const lookAtPoint = pos.clone().add(blendedDirection);
            launchData.mesh.lookAt(lookAtPoint);

            // Apply LOD during launch animation
            const distanceToCamera = this.camera.position.distanceTo(pos);
            const star =
              this.system?.star.id === starId
                ? this.system.star
                : this.system?.companionStars?.find((s) => s.id === starId);
            if (star) {
              const starRadius =
                star.radius * this.SCALE * this.BODY_SIZE_MULTIPLIER;
              const lodDistance = starRadius * 10;

              if (distanceToCamera > lodDistance) {
                // Far away: Hide detailed children
                launchData.mesh.traverse((child) => {
                  if (child instanceof THREE.Mesh) {
                    const childName = child.name || "";
                    if (
                      childName.includes("frame") ||
                      childName.includes("strut")
                    ) {
                      child.visible = false;
                    }
                  }
                });
              } else {
                // Close up: Show all detail
                launchData.mesh.traverse((child) => {
                  if (child instanceof THREE.Mesh) {
                    child.visible = true;
                  }
                });
              }
            }

            allCompleted = false;
          } else if (t >= 1.0) {
            // Just reached orbit - keep at final position but prepare for orbital transition
            // The orbital update will handle positioning from now on
            launchData.mesh.position.copy(launchData.targetPos);
          }
        }

        // If all satellites in this swarm have reached orbit, start transition phase
        // This creates smooth interpolation from launch end to orbital position
        if (allCompleted) {
          const satelliteMeshes = launchDataArray.map((data) => data.mesh);
          const starId = launchDataArray[0].starId;

          // Store current positions and rotations as transition starting points
          const fromPositions = satelliteMeshes.map((mesh) =>
            mesh.position.clone()
          );
          const fromQuaternions = satelliteMeshes.map((mesh) =>
            mesh.quaternion.clone()
          );

          // Add to transitioning satellites for smooth blend to orbit
          this.transitioningSatellites.set(megastructureId, {
            meshes: satelliteMeshes,
            starId: starId,
            transitionStartTime: currentRealTime,
            fromPositions: fromPositions,
            fromQuaternions: fromQuaternions,
          });

          completedLaunches.push(megastructureId);
        }
      }
    }

    // Remove completed launches
    for (const id of completedLaunches) {
      this.launchingsatellites.delete(id);
    }

    // Update transitioning satellites (smooth blend from launch to orbit)
    const completedTransitions: string[] = [];

    if (this.system) {
      const currentTime = this.timeInterpolator.getGameTime();

      for (const [
        megastructureId,
        transitionData,
      ] of this.transitioningSatellites.entries()) {
        const elapsed = currentRealTime - transitionData.transitionStartTime;
        const transitionDuration = 1.0; // 1 second smooth transition
        const t = Math.min(elapsed / transitionDuration, 1.0);

        const starId = transitionData.starId;
        const starBody = this.bodies.get(starId);

        if (starBody) {
          // Get star position
          const starPosition = new THREE.Vector3();
          if (starId === this.system.star.id) {
            starPosition.set(0, 0, 0);
          } else {
            starPosition.copy(starBody.position);
          }

          // Calculate target orbital positions
          this.dysonSwarmFactory.updateSatellitePositions(
            transitionData.meshes,
            currentTime
          );

          // Interpolate between launch end position and orbital position
          for (let i = 0; i < transitionData.meshes.length; i++) {
            const satellite = transitionData.meshes[i];
            const fromPos = transitionData.fromPositions[i];
            const fromQuat = transitionData.fromQuaternions[i];

            // Get the orbital position (already calculated by factory)
            const orbitalLocalPos = new THREE.Vector3(
              satellite.position.x,
              satellite.position.y,
              satellite.position.z
            );

            // Apply star offset to orbital position
            const orbitalWorldPos = new THREE.Vector3(
              orbitalLocalPos.x + starPosition.x,
              orbitalLocalPos.y + starPosition.y,
              orbitalLocalPos.z + starPosition.z
            );

            // Smooth interpolation with ease-out
            const eased = 1 - Math.pow(1 - t, 3); // Cubic ease-out
            satellite.position.lerpVectors(fromPos, orbitalWorldPos, eased);

            // Smoothly interpolate rotation to face the star
            // Create a temporary object to calculate target rotation
            const tempTarget = new THREE.Object3D();
            tempTarget.position.copy(satellite.position);
            tempTarget.lookAt(starPosition);
            const targetQuat = tempTarget.quaternion.clone();

            // Interpolate between starting rotation and target rotation
            satellite.quaternion.slerpQuaternions(fromQuat, targetQuat, eased);

            // Apply LOD during transition
            const distanceToCamera = this.camera.position.distanceTo(
              satellite.position
            );
            const star =
              starId === this.system!.star.id
                ? this.system!.star
                : this.system!.companionStars?.find((s) => s.id === starId);
            if (star) {
              const starRadius =
                star.radius * this.SCALE * this.BODY_SIZE_MULTIPLIER;
              const lodDistance = starRadius * 10;

              if (distanceToCamera > lodDistance) {
                // Far away: Hide detailed children
                satellite.traverse((child) => {
                  if (child instanceof THREE.Mesh) {
                    const childName = child.name || "";
                    if (
                      childName.includes("frame") ||
                      childName.includes("strut")
                    ) {
                      child.visible = false;
                    }
                  }
                });
              } else {
                // Close up: Show all detail
                satellite.traverse((child) => {
                  if (child instanceof THREE.Mesh) {
                    child.visible = true;
                  }
                });
              }
            }
          }

          // If transition complete, move to regular satellites
          if (t >= 1.0) {
            this.satellites.set(megastructureId, {
              meshes: transitionData.meshes,
              starId: starId,
            });
            completedTransitions.push(megastructureId);
          }
        }
      }
    }

    // Remove completed transitions
    for (const id of completedTransitions) {
      this.transitioningSatellites.delete(id);
    }

    // Update Dyson swarm satellite positions
    if (this.system) {
      const currentTime = this.timeInterpolator.getGameTime();

      for (const [
        megastructureId,
        satelliteData,
      ] of this.satellites.entries()) {
        const starId = satelliteData.starId;
        const satelliteArray = satelliteData.meshes;

        // Get the star body to track its position
        const starBody = this.bodies.get(starId);
        if (!starBody) continue;

        // Get star position (primary star is always at origin, companions move)
        const starPosition = new THREE.Vector3();
        if (starId === this.system.star.id) {
          // Primary star is at origin
          starPosition.set(0, 0, 0);
        } else {
          // Companion star - use interpolated position
          const interpolatedPos = this.timeInterpolator.getInterpolatedPosition(
            starId,
            lerpFactor
          );
          if (interpolatedPos) {
            starPosition.copy(interpolatedPos);
          }
        }

        // Update satellite positions using the factory's update method
        // This updates their local orbital positions and orients them toward (0,0,0)
        this.dysonSwarmFactory.updateSatellitePositions(
          satelliteArray,
          currentTime
        );

        // Apply star's position offset to all satellites
        // Satellites orbit in local space, so we add the star's world position
        for (const satellite of satelliteArray) {
          // Get satellite's local orbital position (already in 3D from factory)
          const localX = satellite.position.x;
          const localY = satellite.position.y;
          const localZ = satellite.position.z;

          // Apply star's world position offset
          satellite.position.x = localX + starPosition.x;
          satellite.position.y = localY + starPosition.y;
          satellite.position.z = localZ + starPosition.z;

          // Make satellite point toward the actual star position
          satellite.lookAt(starPosition);

          // Distance-based LOD to prevent aliasing/z-fighting at distance
          // Calculate distance from camera to satellite
          const distanceToCamera = this.camera.position.distanceTo(
            satellite.position
          );

          // Get star body to calculate relative distance threshold
          const star =
            starId === this.system!.star.id
              ? this.system!.star
              : this.system!.companionStars?.find((s) => s.id === starId);
          if (star) {
            const starRadius =
              star.radius * this.SCALE * this.BODY_SIZE_MULTIPLIER;
            // Switch to simplified LOD when camera is more than 10x star radius away
            const lodDistance = starRadius * 10;

            if (distanceToCamera > lodDistance) {
              // Far away: Hide detailed children (frames/struts)
              satellite.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  const childName = child.name || "";
                  // Hide frame and struts (detail geometry)
                  if (
                    childName.includes("frame") ||
                    childName.includes("strut")
                  ) {
                    child.visible = false;
                  } else {
                    child.visible = true;
                  }
                }
              });
            } else {
              // Close up: Show all detail
              satellite.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  child.visible = true;
                }
              });
            }
          }
        }
      }
    }

    // Update ship positions with smooth interpolation and pulsing effect
    for (const [shipId, shipGroup] of this.ships.entries()) {
      // Smooth orbital motion interpolation
      const interpolatedPos = this.timeInterpolator.getInterpolatedPosition(
        shipId,
        lerpFactor
      );
      if (interpolatedPos) {
        shipGroup.position.copy(interpolatedPos);
      }

      // Animate pulsing effect (frequency: 2 pulses per second)
      const gameTime = this.timeInterpolator.getGameTime();
      const pulseFrequency = 2.0; // Hz
      const pulsePhase = (gameTime * pulseFrequency) % 1.0;
      // Smooth sine wave pulsing between 0.5 and 1.0
      const pulseIntensity = 0.5 + 0.5 * Math.sin(pulsePhase * Math.PI * 2);

      // Apply pulsing to all children (core sphere, glow layers, and light)
      shipGroup.traverse((child) => {
        if (child.userData.isPulsing) {
          if (child instanceof THREE.Mesh) {
            const material = child.material as
              | THREE.MeshStandardMaterial
              | THREE.MeshBasicMaterial;

            if (material instanceof THREE.MeshStandardMaterial) {
              // Core sphere - pulse emissive intensity
              material.emissiveIntensity = 0.3 + pulseIntensity * 0.7;
            } else if (material instanceof THREE.MeshBasicMaterial) {
              // Glow layers - pulse opacity
              const baseOpacity =
                child.userData.glowLayer === 1.3
                  ? 0.6
                  : child.userData.glowLayer === 1.6
                  ? 0.4
                  : 0.2;
              material.opacity = baseOpacity * (0.6 + pulseIntensity * 0.4);
            }
          } else if (child instanceof THREE.PointLight) {
            // Pulse the light intensity
            child.intensity = 3 + pulseIntensity * 2;
          }
        }
      });
    }

    // Update rotation update time for next frame
    this.lastRotationUpdateTime = currentRotationTime;

    // Skip camera controller update during gate travel (we handle camera directly)
    if (!this.gateTravelAnimator.isAnimating()) {
      // Update camera with tracked object if tracking is enabled
      const selectedObjectId = this.cameraController.getSelectedObjectId();
      const trackedMesh = selectedObjectId
        ? this.bodies.get(selectedObjectId) ||
          this.ships.get(selectedObjectId) ||
          this.gates.get(selectedObjectId) ||
          this.asteroids.get(selectedObjectId) ||
          this.moons.get(selectedObjectId)
        : undefined;

      this.cameraController.update(trackedMesh);
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  centerOnObject(objectId: string): void {
    const mesh =
      this.bodies.get(objectId) ||
      this.ships.get(objectId) ||
      this.gates.get(objectId) ||
      this.asteroids.get(objectId) ||
      this.moons.get(objectId);
    if (mesh) {
      console.log(
        `[centerOnObject] Centering on ${mesh.userData.type}: ${objectId}, position:`,
        mesh.position
      );
      const shouldUseGate = this.cameraController.centerOnObject(
        objectId,
        mesh
      );

      // Handle moon orbit line visibility based on planet selection
      this.updateMoonOrbitVisibility(objectId);

      // Handle companion star orbit line visibility based on star selection
      this.updateCompanionStarOrbitVisibility(objectId);

      // Handle planet orbit line visibility based on star selection
      this.updatePlanetOrbitVisibility(objectId);

      // Notify listeners
      if (this.onObjectSelected) {
        this.onObjectSelected(objectId);
      }

      // Check if this is a gate being used (second click)
      if (shouldUseGate && this.onGateUse) {
        this.onGateUse(objectId);
      }
    } else {
      console.warn(`[centerOnObject] Object not found in scene: ${objectId}`);
      console.warn(
        `Available asteroids:`,
        Array.from(this.asteroids.keys()).slice(0, 10)
      );
    }
  }

  /**
   * Show/hide moon orbit lines based on whether their parent planet or a sibling moon is selected
   * General rule: show orbits of all objects at the same hierarchical level
   * - Planet selected → show all moons orbiting that planet
   * - Moon selected → show all moons orbiting the same planet (including itself)
   */
  private updateMoonOrbitVisibility(selectedObjectId: string): void {
    if (!this.system) return;

    // Check if selected object is a planet
    const selectedPlanet = this.system.planets.find(
      (p) => p.id === selectedObjectId
    );

    // Check if selected object is a moon
    const selectedMoon = this.system.moons.find(
      (m) => m.id === selectedObjectId
    );

    // Hide all moon orbit lines first
    for (const line of this.moonOrbitLines.values()) {
      line.visible = false;
    }

    // Determine which planet's moons to show
    let parentPlanetId: string | null = null;

    if (selectedPlanet) {
      // Planet selected - show its moons
      parentPlanetId = selectedPlanet.id;
    } else if (selectedMoon) {
      // Moon selected - show all moons orbiting the same planet
      parentPlanetId = selectedMoon.parentId;
    }

    // Show moon orbit lines for moons orbiting the determined planet
    if (parentPlanetId) {
      for (const moon of this.system.moons) {
        if (moon.parentId === parentPlanetId) {
          const moonOrbitLine = this.moonOrbitLines.get(moon.id);
          if (moonOrbitLine) {
            moonOrbitLine.visible = true;
          }
        }
      }
    }
  }

  /**
   * Show/hide companion star orbit lines based on whether any star is selected
   * In multi-star systems, all companion star orbits should be visible when any star is selected
   */
  private updateCompanionStarOrbitVisibility(selectedObjectId: string): void {
    if (!this.system || !this.system.companionStars) return;

    // Check if selected object is any star in the system
    const isStarSelected =
      this.system.star.id === selectedObjectId ||
      this.system.companionStars.some((star) => star.id === selectedObjectId);

    // Show or hide all companion star orbit lines based on whether a star is selected
    for (const companionStar of this.system.companionStars) {
      const orbitLine = this.orbitLines.get(companionStar.id);
      if (orbitLine) {
        orbitLine.visible = isStarSelected;
      }
    }
  }

  /**
   * Show/hide planet orbit lines based on which object is selected
   * Hierarchical visibility rules:
   * - Star selected → show all planets orbiting that star
   * - Planet selected → show all planets orbiting the same star (siblings)
   * - Moon selected → show ONLY the parent planet's orbit (not all planets)
   */
  private updatePlanetOrbitVisibility(selectedObjectId: string): void {
    if (!this.system) return;

    // Check if selected object is a star
    const isPrimaryStarSelected = this.system.star.id === selectedObjectId;
    const selectedCompanionStar = this.system.companionStars?.find(
      (star) => star.id === selectedObjectId
    );

    // Check if selected object is a planet
    const selectedPlanet = this.system.planets.find(
      (p) => p.id === selectedObjectId
    );

    // Check if selected object is a moon
    const selectedMoon = this.system.moons.find(
      (m) => m.id === selectedObjectId
    );

    // Hide all planet orbit lines first
    for (const planet of this.system.planets) {
      const orbitLine = this.orbitLines.get(planet.id);
      if (orbitLine) {
        orbitLine.visible = false;
      }
    }

    if (isPrimaryStarSelected) {
      // Primary star selected - show all planets orbiting it
      for (const planet of this.system.planets) {
        if (planet.parentId === this.system.star.id) {
          const orbitLine = this.orbitLines.get(planet.id);
          if (orbitLine) {
            orbitLine.visible = true;
          }
        }
      }
    } else if (selectedCompanionStar) {
      // Companion star selected - show all planets orbiting it
      for (const planet of this.system.planets) {
        if (planet.parentId === selectedCompanionStar.id) {
          const orbitLine = this.orbitLines.get(planet.id);
          if (orbitLine) {
            orbitLine.visible = true;
          }
        }
      }
    } else if (selectedPlanet) {
      // Planet selected - show all planets orbiting the same star (siblings)
      const parentStarId = selectedPlanet.parentId || this.system.star.id;
      for (const planet of this.system.planets) {
        if (planet.parentId === parentStarId) {
          const orbitLine = this.orbitLines.get(planet.id);
          if (orbitLine) {
            orbitLine.visible = true;
          }
        }
      }
    } else if (selectedMoon) {
      // Moon selected - show ONLY the parent planet's orbit (not all planets)
      const parentPlanetId = selectedMoon.parentId;
      if (parentPlanetId) {
        const orbitLine = this.orbitLines.get(parentPlanetId);
        if (orbitLine) {
          orbitLine.visible = true;
        }
      }
    } else {
      // Nothing relevant selected (gate, asteroid) - show only primary star's planets (default)
      for (const planet of this.system.planets) {
        if (planet.parentId === this.system.star.id) {
          const orbitLine = this.orbitLines.get(planet.id);
          if (orbitLine) {
            orbitLine.visible = true;
          }
        }
      }
    }
  }

  /**
   * Set the entry gate ID (the gate we're traveling through)
   */
  setEntryGate(gateId: string): void {
    this.entryGateId = gateId;
  }

  /**
   * Animate gate travel with hyperspace effects
   * This starts the animation with the current system, then loads the destination system mid-animation
   * @param destinationSystem - The system to travel to
   * @param exitGateId - The ID of the exit gate to arrive at
   * @param onComplete - Optional callback to run when animation completes
   */
  /**
   * Get the current entry gate ID (for checking exploration status before travel)
   */
  getEntryGateId(): string | null {
    return this.entryGateId;
  }

  animateGateTravel(
    destinationSystem: StarSystem,
    exitGateId: string,
    onComplete?: () => void,
    wasEntryGateExplored?: boolean,
    isExitGateBlocked?: boolean
  ): void {
    // Get the entry gate (the one we're traveling through)
    const entryGateGroup = this.entryGateId
      ? this.gates.get(this.entryGateId)
      : null;

    if (!entryGateGroup) {
      console.warn(`Entry gate not found, loading system immediately`);
      // Load system immediately and skip animation
      this.loadSystem(destinationSystem);
      if (onComplete) {
        onComplete();
      }
      return;
    }

    console.log("Starting hyperspace animation from gate:", this.entryGateId);
    if (isExitGateBlocked) {
      console.log("Exit gate is blocked - will stop at gate instead of star");
    }

    // Store exit gate ID and destination system for later
    this.exitGateId = exitGateId;
    this.pendingDestinationSystem = destinationSystem;
    this.hasLoadedDestinationDuringTravel = false;

    // Hide all celestial bodies, ships, asteroids, and orbit lines EXCEPT the entry gate
    // Keep starfield visible throughout
    for (const mesh of this.bodies.values()) {
      mesh.visible = false;
    }
    for (const mesh of this.ships.values()) {
      mesh.visible = false;
    }
    for (const [gateId, gateGroup] of this.gates.entries()) {
      // Hide all gates except the entry gate
      if (gateId !== this.entryGateId) {
        gateGroup.visible = false;
      }
    }
    for (const mesh of this.asteroids.values()) {
      mesh.visible = false;
    }
    for (const mesh of this.moons.values()) {
      mesh.visible = false;
    }
    for (const ringGroup of this.rings.values()) {
      ringGroup.visible = false;
    }
    // Hide mining installations during gate travel
    this.miningInstallationRenderer.setVisible(false);
    // Hide Helium-3 extractors during gate travel
    this.helium3ExtractorRenderer.setVisible(false);
    for (const satelliteData of this.satellites.values()) {
      for (const satellite of satelliteData.meshes) {
        satellite.visible = false;
      }
    }
    for (const launchDataArray of this.launchingsatellites.values()) {
      for (const launchData of launchDataArray) {
        launchData.mesh.visible = false;
      }
    }
    for (const transitionData of this.transitioningSatellites.values()) {
      for (const satellite of transitionData.meshes) {
        satellite.visible = false;
      }
    }
    for (const line of this.orbitLines.values()) {
      line.visible = false;
    }

    // Calculate system view distance for the current system
    const systemViewDistance = this.calculateSystemViewDistance();

    // Check if the entry gate was explored BEFORE travel
    // Use passed parameter if available, otherwise check current state (fallback)
    const isExploredGate =
      wasEntryGateExplored !== undefined
        ? wasEntryGateExplored
        : this.entryGateId
        ? this.exploredGateIds.has(this.entryGateId)
        : true;

    // Start the gate travel animation
    // The destination system will be loaded during the animation in the update() loop
    // Pass the exit gate ID so we can position the camera there when animation completes
    this.gateTravelAnimator.startTravel(
      systemViewDistance,
      exitGateId,
      onComplete,
      isExploredGate,
      entryGateGroup, // Pass entry gate mesh for positioning
      isExitGateBlocked
    );
  }

  /**
   * Legacy method - kept for compatibility
   * @deprecated Use animateGateTravel instead
   */
  animateExitGate(exitGateId: string, onComplete?: () => void): void {
    // This method is deprecated but kept for backward compatibility
    console.warn(
      "animateExitGate is deprecated, system should already be loaded"
    );

    // Store exit gate ID for repositioning during animation
    this.exitGateId = exitGateId;

    // Calculate system view distance for the animator
    const systemViewDistance = this.calculateSystemViewDistance();

    // Default to explored gate (legacy method assumes explored)
    const isExploredGate = true;

    // Start the gate travel animation
    this.gateTravelAnimator.startTravel(
      systemViewDistance,
      exitGateId,
      onComplete,
      isExploredGate
    );
  }

  getSelectedObjectId(): string | null {
    return this.cameraController.getSelectedObjectId();
  }

  /**
   * Reload camera controller settings (called when user changes)
   */
  reloadCameraSettings(): void {
    this.cameraController.reloadSettings();
  }

  getGateMesh(gateId: string): THREE.Group | undefined {
    return this.gates.get(gateId);
  }

  getSystem(): StarSystem | null {
    return this.system;
  }

  /**
   * Calculate the optimal camera distance for system view
   * @returns The camera distance to see the whole system
   */
  private calculateSystemViewDistance(): number {
    if (!this.system) return 1000;

    // Calculate the furthest object in the system
    let maxDistance = 0;

    // Check planets
    for (const planet of this.system.planets) {
      if (planet.orbitalElements) {
        const distance = planet.orbitalElements.semiMajorAxis * this.SCALE;
        maxDistance = Math.max(maxDistance, distance);
      }
    }

    // Check gates
    for (const gate of this.system.gates) {
      const distance = gate.orbitalElements.semiMajorAxis * this.SCALE;
      maxDistance = Math.max(maxDistance, distance);
    }

    // 1.2x the furthest object for a closer, more intimate view
    return maxDistance * 1.2;
  }

  /**
   * Show a nice overview of the entire star system
   * Positions camera to see the whole system at once
   */
  showSystemView(): void {
    const cameraDistance = this.calculateSystemViewDistance();
    // Use camera controller to animate to system view
    this.cameraController.setSystemView(cameraDistance);
  }

  /**
   * Show constellation view with connected systems
   */
  showConstellationView(
    nodes: ConstellationNode[],
    connections: ConstellationConnection[],
    unexploredGates: UnexploredGate[],
    currentSystemId: string,
    customPositions?: Record<string, { x: number; y: number; z: number }>,
    preserveSelectedSystemId?: string | null,
    homePlanetId?: string | null,
    homeSystemId?: string | null
  ): string | null {
    // Hide system objects
    this.hideSystemObjects();

    // Load constellation view
    this.constellationView.load(
      nodes,
      connections,
      unexploredGates,
      currentSystemId,
      customPositions,
      preserveSelectedSystemId,
      homePlanetId,
      homeSystemId
    );
    this.isConstellationViewActive = true;

    // Position camera for constellation view (only if not preserving - i.e., first open)
    if (!preserveSelectedSystemId) {
      const selectedSystemId = this.constellationView.getSelectedSystemId();
      if (selectedSystemId) {
        // Get the position of the selected system and center camera on it
        const selectedPosition =
          this.constellationView.getNodePosition(selectedSystemId);
        if (selectedPosition) {
          this.cameraController.setConstellationView(selectedPosition);
        } else {
          this.cameraController.setConstellationView();
        }
      } else {
        this.cameraController.setConstellationView();
      }
    }

    console.log("Switched to constellation view");

    // Save all positions (including mystery spheres) immediately after loading
    // This ensures that even if user never drags anything, positions are saved
    if (this.onConstellationPositionsChanged) {
      const positions = this.constellationView.getAllPositions();
      this.onConstellationPositionsChanged(positions);
    }

    // Return the initially selected system ID (current system)
    return this.constellationView.getSelectedSystemId();
  }

  /**
   * Center camera on a constellation node
   */
  centerOnConstellationNode(systemId: string): void {
    const position = this.constellationView.getNodePosition(systemId);
    if (position) {
      this.cameraController.centerOnConstellationNode(position);
    }
  }

  /**
   * Get the currently selected system ID in constellation view
   */
  getConstellationSelectedSystemId(): string | null {
    return this.constellationView.getSelectedSystemId();
  }

  /**
   * Select a system in constellation view
   */
  selectConstellationSystem(systemId: string): void {
    if (!this.isConstellationViewActive) {
      console.warn(
        "Cannot select constellation system: not in constellation view"
      );
      return;
    }
    this.constellationView.selectSystem(systemId);
    // Also center camera on the selected system
    this.centerOnConstellationNode(systemId);
    // Trigger callback to update HUD
    if (this.onConstellationSystemSelected) {
      this.onConstellationSystemSelected(systemId, "select");
    }
  }

  /**
   * Hide constellation view and return to system view
   */
  hideConstellationView(): void {
    if (!this.isConstellationViewActive) return;

    this.constellationView.clear();
    this.isConstellationViewActive = false;

    // Show system objects again
    this.showSystemObjects();

    console.log("Returned to system view");
  }

  /**
   * Check if constellation view is currently active
   */
  isInConstellationView(): boolean {
    return this.isConstellationViewActive;
  }

  /**
   * Hide all system objects (for constellation view)
   */
  private hideSystemObjects(): void {
    for (const mesh of this.bodies.values()) {
      mesh.visible = false;
    }
    for (const mesh of this.ships.values()) {
      mesh.visible = false;
    }
    for (const gateGroup of this.gates.values()) {
      gateGroup.visible = false;
    }
    for (const mesh of this.asteroids.values()) {
      mesh.visible = false;
    }
    for (const mesh of this.moons.values()) {
      mesh.visible = false;
    }
    for (const ringGroup of this.rings.values()) {
      ringGroup.visible = false;
    }
    // Hide mining installations in constellation view
    this.miningInstallationRenderer.setVisible(false);
    // Hide Helium-3 extractors in constellation view
    this.helium3ExtractorRenderer.setVisible(false);
    // Hide gate defenses and attacks in constellation view
    this.gateDefenseRenderer.setVisible(false);
    for (const satelliteData of this.satellites.values()) {
      for (const satellite of satelliteData.meshes) {
        satellite.visible = false;
      }
    }
    for (const launchDataArray of this.launchingsatellites.values()) {
      for (const launchData of launchDataArray) {
        launchData.mesh.visible = false;
      }
    }
    for (const transitionData of this.transitioningSatellites.values()) {
      for (const satellite of transitionData.meshes) {
        satellite.visible = false;
      }
    }
    for (const line of this.orbitLines.values()) {
      line.visible = false;
    }
    for (const line of this.moonOrbitLines.values()) {
      line.visible = false;
    }
  }

  /**
   * Show all system objects (return from constellation view)
   */
  private showSystemObjects(): void {
    for (const mesh of this.bodies.values()) {
      mesh.visible = true;
    }
    for (const mesh of this.ships.values()) {
      mesh.visible = true;
    }
    for (const gateGroup of this.gates.values()) {
      gateGroup.visible = true;
    }
    for (const mesh of this.asteroids.values()) {
      mesh.visible = true;
    }
    for (const mesh of this.moons.values()) {
      mesh.visible = true;
    }
    for (const ringGroup of this.rings.values()) {
      ringGroup.visible = true;
    }
    for (const satelliteData of this.satellites.values()) {
      for (const satellite of satelliteData.meshes) {
        satellite.visible = true;
      }
    }
    for (const launchDataArray of this.launchingsatellites.values()) {
      for (const launchData of launchDataArray) {
        launchData.mesh.visible = true;
      }
    }
    for (const transitionData of this.transitioningSatellites.values()) {
      for (const satellite of transitionData.meshes) {
        satellite.visible = true;
      }
    }
    // Show planet orbit lines for planets orbiting the primary star only
    if (this.system) {
      for (const planet of this.system.planets) {
        const orbitLine = this.orbitLines.get(planet.id);
        if (orbitLine) {
          // Only show orbit lines for planets orbiting the primary star
          orbitLine.visible = planet.parentId === this.system.star.id;
        }
      }
    }
    // Moon orbit lines, companion star orbit lines, and companion star planet orbit lines remain hidden unless their conditions are met
  }

  /**
   * Cleanup method to prevent memory leaks
   * Call this when the scene manager is no longer needed
   */
  dispose(): void {
    // Remove event listeners
    window.removeEventListener("resize", this.resizeHandler);
    window.removeEventListener("keydown", this.keyDownHandler);
    window.removeEventListener("keyup", this.keyUpHandler);
    this.renderer.domElement.removeEventListener(
      "mousedown",
      this.mouseDownHandler
    );
    this.renderer.domElement.removeEventListener(
      "mousemove",
      this.mouseMoveHandler
    );
    this.renderer.domElement.removeEventListener(
      "mouseup",
      this.mouseUpHandler
    );
    this.renderer.domElement.removeEventListener(
      "wheel",
      this.mouseWheelHandler
    );
    this.renderer.domElement.removeEventListener(
      "contextmenu",
      this.contextMenuHandler
    );
    this.renderer.domElement.removeEventListener(
      "touchstart",
      this.touchStartHandler
    );
    this.renderer.domElement.removeEventListener(
      "touchmove",
      this.touchMoveHandler
    );
    this.renderer.domElement.removeEventListener(
      "touchend",
      this.touchEndHandler
    );

    // Clear scene
    this.clearScene();

    // Dispose starfield
    if (this.starfield) {
      if (this.starfield.geometry) {
        this.starfield.geometry.dispose();
      }
      if (this.starfield.material instanceof THREE.Material) {
        this.starfield.material.dispose();
      }
      this.scene.remove(this.starfield);
      this.starfield = null;
    }

    // Dispose gate travel animator
    this.gateTravelAnimator.dispose();

    // Dispose all remaining lights
    for (const light of this.lights) {
      this.scene.remove(light);
    }
    this.lights = [];

    // Dispose renderer
    this.renderer.dispose();
    this.renderer.forceContextLoss();

    // Clear scene
    this.scene.clear();

    console.log("SceneManager disposed - all resources cleaned up");
  }

  /**
   * Update a planet's visual seed for debug purposes
   * This allows real-time iteration on planet appearances
   */
  updatePlanetSeed(planetId: string, newSeed: number): void {
    const planetMesh = this.bodies.get(planetId);
    if (!planetMesh) {
      console.warn(`Planet ${planetId} not found in scene`);
      return;
    }

    // Only works for Mesh objects (planets), not Groups (black holes)
    if (!(planetMesh instanceof THREE.Mesh)) {
      console.warn(`Cannot update seed for non-mesh object ${planetId}`);
      return;
    }

    // Get planet data from userData
    const planet = planetMesh.userData.body;
    if (!planet) {
      console.warn(`Planet data not found for ${planetId}`);
      return;
    }

    // Update the planetSeed uniform if this is a ShaderMaterial
    // This handles ice planets, desert planets, and other shader-based planets
    if (
      planetMesh.material instanceof THREE.ShaderMaterial &&
      planetMesh.material.uniforms.planetSeed
    ) {
      planetMesh.material.uniforms.planetSeed.value = newSeed;
      console.log(`Updated planet ${planetId} seed to ${newSeed}`);
    }

    // Update cloud layers and atmosphere if they exist
    planetMesh.children.forEach((child) => {
      if (
        child instanceof THREE.Mesh &&
        child.material instanceof THREE.ShaderMaterial
      ) {
        // Update cloud layers
        if (child.material.uniforms.planetSeed) {
          if (child.userData.cloudLayer === 1) {
            // Lower cloud layer uses base seed
            child.material.uniforms.planetSeed.value = newSeed;
            console.log(`Updated cloud layer 1 seed to ${newSeed}`);
          } else if (child.userData.cloudLayer === 2) {
            // Upper cloud layer uses offset seed
            child.material.uniforms.planetSeed.value = newSeed + 1000;
            console.log(`Updated cloud layer 2 seed to ${newSeed + 1000}`);
          }
        }

        // Update atmosphere color based on planet type
        if (
          child.material.uniforms.atmosphereColor &&
          planetMesh.material instanceof THREE.ShaderMaterial &&
          planetMesh.material.uniforms.planetSeed
        ) {
          const surfaceType = planet.surfaceType;

          if (surfaceType === "terrestrial") {
            // Recalculate atmosphere color for terrestrial planets based on ocean type
            const oceanType = getOceanColorType(newSeed);
            const atmosphereColor = getAtmosphereColor(oceanType);
            child.material.uniforms.atmosphereColor.value = atmosphereColor;
            console.log(
              `Updated terrestrial atmosphere color for seed ${newSeed}`
            );
          } else if (surfaceType === "desert") {
            // Recalculate atmosphere color for desert planets based on palette type
            const atmosphereColor = getDesertAtmosphereColor(newSeed);
            child.material.uniforms.atmosphereColor.value = atmosphereColor;
            console.log(`Updated desert atmosphere color for seed ${newSeed}`);
          }
        }
      }
    });

    // Regenerate rings for gas giants using the new seed
    // Check if planet is a gas giant (mass > 15 Earth masses or has rings)
    const massInEarthMasses = planet.mass / EARTH_MASS;
    if (massInEarthMasses > 15) {
      // Generate rings using the seed slider value
      const rings = this.celestialBodyFactory.generateRingsFromSeed(
        newSeed,
        planet.radius,
        planet.color || "#d4a373"
      );

      // Remove old rings if they exist
      const oldRingGroup = this.rings.get(planetId);
      if (oldRingGroup) {
        // Dispose of old ring meshes
        oldRingGroup.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            }
          }
        });
        this.scene.remove(oldRingGroup);
      }

      // Create new rings with the seed
      if (rings.length > 0) {
        const newRingGroup = this.celestialBodyFactory.createRingsGroup(
          rings,
          planetId
        );
        this.scene.add(newRingGroup);
        this.rings.set(planetId, newRingGroup);

        // Position rings at planet location
        const planetPosition = planetMesh.position.clone();
        newRingGroup.position.copy(planetPosition);

        console.log(
          `Regenerated rings for planet ${planetId} with seed ${newSeed}`
        );
      }
    }
  }

  /**
   * Add a defense platform to a gate
   */
  addGateDefense(defense: any): void {
    this.gateDefenseRenderer.addDefensePlatform(defense);
  }

  /**
   * Start an attack animation on a gate
   */
  startGateAttack(attack: any): void {
    this.gateDefenseRenderer.startAttack(attack);
  }

  /**
   * Update an ongoing attack with combat results
   */
  updateGateAttack(attack: any): void {
    this.gateDefenseRenderer.updateAttack(attack);
  }

  /**
   * Check if there's an active attack (blocks gate travel)
   */
  hasActiveAttack(gateId: string): boolean {
    return this.gateDefenseRenderer.hasActiveAttack(gateId);
  }

  /**
   * Get defense count for a gate
   */
  getGateDefenseCount(gateId: string): number {
    return this.gateDefenseRenderer.getDefenseCount(gateId);
  }

  setGateResourceFlow(
    gateId: string,
    energyFlow: number,
    alloyFlow: number,
    scienceFlow: number,
    isBlockaded: boolean,
    blockadeOwnerName?: string
  ): void {
    this.gateResourceFlow.set(gateId, {
      energyFlow,
      alloyFlow,
      scienceFlow,
      isBlockaded,
      blockadeOwnerName,
    });

    // Update visual resource flow animation
    const gateGroup = this.gates.get(gateId);
    if (gateGroup) {
      this.gateResourceFlowRenderer.setGateResourceFlow(
        gateId,
        gateGroup,
        energyFlow,
        alloyFlow,
        scienceFlow,
        isBlockaded
      );
    }
  }

  getGateResourceFlow(gateId: string):
    | {
        energyFlow: number;
        alloyFlow: number;
        scienceFlow: number;
        isBlockaded: boolean;
        blockadeOwnerName?: string;
      }
    | undefined {
    return this.gateResourceFlow.get(gateId);
  }
}
