import * as THREE from "three";
import {
  StarSystem,
  CelestialBodyState,
  SystemState,
  ShipState,
  ASTRONOMICAL_UNIT,
} from "@constellation/shared";
import { CameraController } from "./CameraController.js";
import { InteractionManager } from "./InteractionManager.js";
import { MaterialFactory } from "./MaterialFactory.js";
import { CelestialBodyFactory } from "./CelestialBodyFactory.js";
import { TimeInterpolator } from "./TimeInterpolator.js";
import { StarfieldGenerator } from "./StarfieldGenerator.js";

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

  // Scene objects
  private bodies: Map<string, THREE.Mesh> = new Map();
  private ships: Map<string, THREE.Mesh> = new Map();
  private orbitLines: Map<string, THREE.Line> = new Map();
  private starMaterials: THREE.ShaderMaterial[] = [];
  private starfield: THREE.Points | null = null;
  private lights: THREE.Light[] = []; // Track lights for cleanup

  private system: StarSystem | null = null;

  // Scale factor for visualization (1 AU = 1000 units in Three.js)
  private readonly SCALE = 1000 / ASTRONOMICAL_UNIT;
  // Multiplier for celestial body sizes (make them visible)
  private readonly BODY_SIZE_MULTIPLIER = 70;

  public onObjectSelected: ((objectId: string) => void) | null = null;

  // Event listener references for cleanup
  private resizeHandler: () => void;
  private mouseDownHandler: (e: MouseEvent) => void;
  private mouseMoveHandler: (e: MouseEvent) => void;
  private mouseUpHandler: () => void;
  private mouseWheelHandler: (e: WheelEvent) => void;

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
      0.1,
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

    // Create event listeners and store references for cleanup
    this.resizeHandler = () => this.onWindowResize();
    this.mouseDownHandler = (e: MouseEvent) => this.onMouseDown(e);
    this.mouseMoveHandler = (e: MouseEvent) => this.onMouseMove(e);
    this.mouseUpHandler = () => this.onMouseUp();
    this.mouseWheelHandler = (e: WheelEvent) => this.onMouseWheel(e);

    // Add event listeners
    window.addEventListener("resize", this.resizeHandler);
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
    }

    // Create orbit lines
    for (const planet of system.planets) {
      const orbitLine = this.celestialBodyFactory.createOrbitLine(planet);
      this.scene.add(orbitLine);
      this.orbitLines.set(planet.id, orbitLine);
    }
  }

  private clearScene(): void {
    // Dispose and remove all bodies
    for (const mesh of this.bodies.values()) {
      this.disposeMesh(mesh);
      this.scene.remove(mesh);
    }

    // Dispose and remove all ships
    for (const mesh of this.ships.values()) {
      this.disposeMesh(mesh);
      this.scene.remove(mesh);
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
    this.orbitLines.clear();
    this.starMaterials = [];
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

    // Update ship positions
    for (const shipState of state.ships) {
      let mesh = this.ships.get(shipState.id);
      if (!mesh) {
        // Create ship mesh
        mesh = this.celestialBodyFactory.createShipMesh();
        mesh.userData = { id: shipState.id, type: "ship", state: shipState };
        this.scene.add(mesh);
        this.ships.set(shipState.id, mesh);
      }

      mesh.position.set(
        shipState.position.x * this.SCALE,
        shipState.position.z * this.SCALE,
        shipState.position.y * this.SCALE
      );
    }
  }

  private onMouseDown(event: MouseEvent): void {
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
    this.interactionManager.updateMousePosition(event);

    // Update hover state for cursor feedback
    this.updateHoverState();

    // Handle camera rotation
    this.cameraController.onMouseMove(event);
  }

  private updateHoverState(): void {
    const allObjects = [...this.bodies.values(), ...this.ships.values()];
    const isHovering = this.interactionManager.isHoveringOverObject(
      this.camera,
      allObjects
    );

    this.renderer.domElement.style.cursor = isHovering ? "pointer" : "default";
  }

  private onMouseUp(): void {
    this.cameraController.onMouseUp();
  }

  private handleObjectClick(): void {
    const allObjects = [...this.bodies.values(), ...this.ships.values()];
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

    // Update interpolated game time
    this.timeInterpolator.update();

    // Update star shader time uniforms for animation using interpolated game time
    for (const material of this.starMaterials) {
      material.uniforms.time.value = this.timeInterpolator.getGameTime();
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
        }
      } else if (mesh.userData.type === "star") {
        // Stars rotate very slowly
        mesh.rotation.y = this.timeInterpolator.getGameTime() * 0.00001;
      }
    }

    // Update camera with tracked object if tracking is enabled
    const selectedObjectId = this.cameraController.getSelectedObjectId();
    const trackedMesh = selectedObjectId
      ? this.bodies.get(selectedObjectId) || this.ships.get(selectedObjectId)
      : undefined;
    this.cameraController.update(trackedMesh);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  centerOnObject(objectId: string): void {
    const mesh = this.bodies.get(objectId) || this.ships.get(objectId);
    if (mesh) {
      this.cameraController.centerOnObject(objectId, mesh);

      // Notify listeners
      if (this.onObjectSelected) {
        this.onObjectSelected(objectId);
      }
    }
  }

  getSelectedObjectId(): string | null {
    return this.cameraController.getSelectedObjectId();
  }

  getSystem(): StarSystem | null {
    return this.system;
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
}
