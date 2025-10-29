import * as THREE from "three";
import {
  StarSystem,
  CelestialBodyState,
  SystemState,
  ShipState,
  ASTRONOMICAL_UNIT,
  ConstellationNode,
  ConstellationConnection,
  UnexploredGate,
} from "@constellation/shared";
import { CameraController } from "./CameraController.js";
import { InteractionManager } from "./InteractionManager.js";
import { CelestialBodyFactory } from "./CelestialBodyFactory.js";
import { TimeInterpolator } from "./TimeInterpolator.js";
import { StarfieldGenerator } from "./StarfieldGenerator.js";
import { GateTravelAnimator } from "./GateTravelAnimator.js";
import { ConstellationView } from "./ConstellationView.js";
import {
  getOceanColorType,
  getAtmosphereColor,
} from "./materials/planetColorUtils";

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
  private timeInterpolator: TimeInterpolator;
  private starfieldGenerator: StarfieldGenerator;
  private gateTravelAnimator: GateTravelAnimator;
  private constellationView: ConstellationView;

  // Scene objects
  private bodies: Map<string, THREE.Mesh> = new Map();
  private ships: Map<string, THREE.Group> = new Map();
  private gates: Map<string, THREE.Group> = new Map();
  private asteroids: Map<string, THREE.Mesh> = new Map();
  private moons: Map<string, THREE.Mesh> = new Map();
  private rings: Map<string, THREE.Group> = new Map(); // Planetary ring systems
  private orbitLines: Map<string, THREE.Line> = new Map();
  private moonOrbitLines: Map<string, THREE.Line> = new Map(); // Moon orbit lines (shown conditionally)
  private starMaterials: THREE.ShaderMaterial[] = [];
  private gateMaterials: THREE.ShaderMaterial[] = [];
  private starfield: THREE.Points | null = null;
  private lights: THREE.Light[] = []; // Track lights for cleanup

  private system: StarSystem | null = null;
  private exploredGateIds: Set<string> = new Set();
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

  // Callback to check if keyboard input should be blocked (e.g., modal is open)
  public shouldBlockKeyboardInput: (() => boolean) | null = null;

  // Gate travel state
  private entryGateId: string | null = null;
  private exitGateId: string | null = null;

  // Event listener references for cleanup
  private resizeHandler: () => void;
  private mouseDownHandler: (e: MouseEvent) => void;
  private mouseMoveHandler: (e: MouseEvent) => void;
  private mouseUpHandler: () => void;
  private mouseWheelHandler: (e: WheelEvent) => void;
  private contextMenuHandler: (e: MouseEvent) => void;
  private keyDownHandler: (e: KeyboardEvent) => void;
  private keyUpHandler: (e: KeyboardEvent) => void;

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

    // Initialize constellation view
    this.constellationView = new ConstellationView(this.scene);

    // Create event listeners and store references for cleanup
    this.resizeHandler = () => this.onWindowResize();
    this.mouseDownHandler = (e: MouseEvent) => this.onMouseDown(e);
    this.mouseMoveHandler = (e: MouseEvent) => this.onMouseMove(e);
    this.mouseUpHandler = () => this.onMouseUp();
    this.mouseWheelHandler = (e: WheelEvent) => this.onMouseWheel(e);
    this.contextMenuHandler = (e: MouseEvent) => this.onContextMenu(e);
    this.keyDownHandler = (e: KeyboardEvent) => this.onKeyDown(e);
    this.keyUpHandler = (e: KeyboardEvent) => this.onKeyUp(e);

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
  }

  loadSystem(system: StarSystem): void {
    this.system = system;
    this.clearScene();

    // Create star
    const starMesh = this.celestialBodyFactory.createStar(
      system.star,
      this.scene
    );
    this.scene.add(starMesh);
    this.bodies.set(system.star.id, starMesh);

    // Store star material for animation updates
    if (starMesh.material instanceof THREE.ShaderMaterial) {
      this.starMaterials.push(starMesh.material);
    }

    // Track lights added by createStar
    this.scene.traverse((object) => {
      if (object instanceof THREE.Light && !this.lights.includes(object)) {
        this.lights.push(object);
      }
    });

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
      const isExplored = this.exploredGateIds.has(gate.id);
      const gateGroup = this.celestialBodyFactory.createGate(gate, isExplored);
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

      // Create moon orbit line (initially hidden)
      const moonOrbitLine = this.celestialBodyFactory.createOrbitLine(moon);
      moonOrbitLine.visible = false; // Hide by default
      this.scene.add(moonOrbitLine);
      this.moonOrbitLines.set(moon.id, moonOrbitLine);
    }
  }

  setExploredGates(exploredGateIds: string[]): void {
    this.exploredGateIds = new Set(exploredGateIds);
  }

  private clearScene(): void {
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
    this.starMaterials = [];
    this.gateMaterials = [];
    this.timeInterpolator.clearPositions();
  }

  /**
   * Properly disposes of a mesh and all its resources
   */
  private disposeMesh(mesh: THREE.Mesh): void {
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

    // Dispose children (like atmosphere meshes)
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

  updateState(state: SystemState): void {
    // Update game time tracking for smooth interpolation
    this.timeInterpolator.setServerTime(state.currentTime);

    // Update body positions with interpolation tracking
    for (const bodyState of state.bodies) {
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

        // Check for clicks after delay (stars or unexplored gates)
        setTimeout(() => {
          if (!this.cameraController.getIsDragging()) {
            const raycaster = new THREE.Raycaster();

            // First check for unexplored gate clicks
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

            // Then check for star clicks
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

    // Handle constellation view updates
    if (this.isConstellationViewActive) {
      const deltaTime = 0.016; // Approximate 60fps
      this.constellationView.update(deltaTime);

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

    // Update interpolated game time
    this.timeInterpolator.update();

    // Update star shader time uniforms for animation using interpolated game time
    for (const material of this.starMaterials) {
      material.uniforms.time.value = this.timeInterpolator.getGameTime();
    }

    // Update gate shader time uniforms for animation
    for (const material of this.gateMaterials) {
      material.uniforms.time.value = this.timeInterpolator.getGameTime();
    }

    // Handle gate travel animation
    const animState = this.gateTravelAnimator.update();

    if (
      animState.phase === "zoom-in" &&
      animState.progress >= 0.75 &&
      this.entryGateId
    ) {
      // Hide entry gate near end of zoom-in phase
      const entryGateGroup = this.gates.get(this.entryGateId);
      if (entryGateGroup && entryGateGroup.visible) {
        entryGateGroup.visible = false;
      }
    }

    if (
      animState.phase === "flash" &&
      animState.progress >= 0.5 &&
      this.exitGateId
    ) {
      // Show scene and position at exit gate (mid-flash)
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
        for (const line of this.orbitLines.values()) {
          line.visible = true;
        }
        // Moon orbit lines remain hidden (only shown when parent planet selected)

        // Position camera at exit gate
        this.gateTravelAnimator.positionAtExitGate(exitGateGroup);

        // Clear exit gate ID so we don't reposition again
        this.exitGateId = null;
      }
    }

    if (animState.isComplete && this.entryGateId) {
      // Clear entry gate ID when animation completes
      this.entryGateId = null;
    }

    // Get interpolation factor for smooth orbital motion
    const lerpFactor = this.timeInterpolator.getLerpFactor(0.2);

    // Update planet positions and rotations
    for (const [bodyId, mesh] of this.bodies.entries()) {
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

      // Add planet rotation via shader uniform for smooth animation
      if (mesh.userData.type === "planet") {
        // Rotate based on game time with realistic rotation periods
        const baseRotationSpeed = (2 * Math.PI) / 86400; // One Earth day
        const speedMultiplier = 0.5 + (bodyId.charCodeAt(0) % 10) * 0.15;
        const rotationSpeed = baseRotationSpeed * speedMultiplier;
        const rotation = this.timeInterpolator.getGameTime() * rotationSpeed;

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
              const cloudRotationSpeed =
                baseRotationSpeed * child.userData.rotationSpeed;
              cloudMaterial.uniforms.rotation.value =
                this.timeInterpolator.getGameTime() * cloudRotationSpeed;

              // Update time uniform for evolving cloud patterns
              if (cloudMaterial.uniforms.time) {
                cloudMaterial.uniforms.time.value =
                  this.timeInterpolator.getGameTime();
              }
            }
          }
        });
      } else if (mesh.userData.type === "star") {
        // Stars rotate very slowly
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

      // Rotate the gate's inner core (very slow rotation)
      gateGroup.traverse((child) => {
        if (child.userData.rotatingCore) {
          child.rotation.z = this.timeInterpolator.getGameTime() * 0.0001;
        }
      });

      // Rotate the entire gate structure extremely slowly for visual interest
      gateGroup.rotation.y = this.timeInterpolator.getGameTime() * 0.00005;
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
      const shouldUseGate = this.cameraController.centerOnObject(
        objectId,
        mesh
      );

      // Handle moon orbit line visibility based on planet selection
      this.updateMoonOrbitVisibility(objectId);

      // Notify listeners
      if (this.onObjectSelected) {
        this.onObjectSelected(objectId);
      }

      // Check if this is a gate being used (second click)
      if (shouldUseGate && this.onGateUse) {
        this.onGateUse(objectId);
      }
    }
  }

  /**
   * Show/hide moon orbit lines based on whether their parent planet is selected
   */
  private updateMoonOrbitVisibility(selectedObjectId: string): void {
    if (!this.system) return;

    // Check if selected object is a planet
    const selectedPlanet = this.system.planets.find(
      (p) => p.id === selectedObjectId
    );

    // Hide all moon orbit lines first
    for (const line of this.moonOrbitLines.values()) {
      line.visible = false;
    }

    // If a planet is selected, show its moons' orbit lines
    if (selectedPlanet && selectedPlanet.moons) {
      for (const moon of selectedPlanet.moons) {
        const moonOrbitLine = this.moonOrbitLines.get(moon.id);
        if (moonOrbitLine) {
          moonOrbitLine.visible = true;
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
   * Animate gate travel with zoom and flash effect
   * @param exitGateId - The ID of the exit gate to arrive at
   * @param onComplete - Optional callback to run when animation completes
   */
  animateExitGate(exitGateId: string, onComplete?: () => void): void {
    // Get the entry gate (the one we're traveling through)
    const entryGateGroup = this.entryGateId
      ? this.gates.get(this.entryGateId)
      : null;

    if (!entryGateGroup) {
      console.warn(`Entry gate not found, skipping animation`);
      // Still call completion callback
      if (onComplete) {
        onComplete();
      }
      return;
    }

    // Store exit gate ID for repositioning during animation
    this.exitGateId = exitGateId;

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
    for (const line of this.orbitLines.values()) {
      line.visible = false;
    }

    // Calculate system view distance for the animator
    const systemViewDistance = this.calculateSystemViewDistance();

    // Start the gate travel animation
    this.gateTravelAnimator.startTravel(systemViewDistance, onComplete);
  }

  getSelectedObjectId(): string | null {
    return this.cameraController.getSelectedObjectId();
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
    preserveSelectedSystemId?: string | null
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
      preserveSelectedSystemId
    );
    this.isConstellationViewActive = true;

    // Position camera for constellation view (only if not preserving - i.e., first open)
    if (!preserveSelectedSystemId) {
      this.cameraController.setConstellationView();
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
    for (const line of this.orbitLines.values()) {
      line.visible = true;
    }
    // Moon orbit lines remain hidden unless parent planet is selected
  }

  /**
   * Cleanup method to prevent memory leaks
   * Call this when the scene manager is no longer needed
   */
  dispose(): void {
    // Remove event listeners
    window.removeEventListener("resize", this.resizeHandler);
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

    // Update the planetSeed uniform if this is a ShaderMaterial
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

        // Update atmosphere color for terrestrial planets
        if (
          child.material.uniforms.atmosphereColor &&
          planetMesh.material instanceof THREE.ShaderMaterial &&
          planetMesh.material.uniforms.planetSeed
        ) {
          // Recalculate atmosphere color based on new seed using shared utility
          const oceanType = getOceanColorType(newSeed);
          const atmosphereColor = getAtmosphereColor(oceanType);

          child.material.uniforms.atmosphereColor.value = atmosphereColor;
          console.log(`Updated atmosphere color for seed ${newSeed}`);
        }
      }
    });
  }
}
