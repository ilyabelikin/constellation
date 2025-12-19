import * as THREE from "three";

/**
 * Handles camera positioning, rotation, zoom, and object tracking
 */
export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private cameraTarget: THREE.Vector3 = new THREE.Vector3();
  private cameraDistance: number = 3000;
  private cameraTheta: number = Math.PI / 4; // Horizontal angle
  private cameraPhi: number = Math.PI / 4; // Vertical angle

  private isDragging: boolean = false;
  private previousMousePosition = { x: 0, y: 0 };

  // Touch handling
  private touchStartDistance: number = 0;
  private previousTouchPosition = { x: 0, y: 0 };
  private isTouchDragging: boolean = false;

  private selectedObjectId: string | null = null;
  private isTrackingObject: boolean = false;

  // Camera control settings
  private invertX: boolean = false;
  private invertY: boolean = false;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.loadSettings();

    // Listen for settings changes
    window.addEventListener("settings-changed", ((event: CustomEvent) => {
      this.invertX = event.detail.invertX || false;
      this.invertY = event.detail.invertY || false;
    }) as EventListener);
  }

  /**
   * Get the settings key based on current user UUID
   */
  private getSettingsKey(): string {
    const uuid = localStorage.getItem("constellation-uuid");
    if (uuid) {
      return `constellation-settings-${uuid}`;
    }
    return "constellation-settings";
  }

  /**
   * Load camera control settings from localStorage
   */
  private loadSettings(): void {
    try {
      const settingsKey = this.getSettingsKey();
      const settings = localStorage.getItem(settingsKey);
      if (settings) {
        const parsed = JSON.parse(settings);
        this.invertX = parsed.invertX || false;
        this.invertY = parsed.invertY || false;
      }
    } catch (error) {
      console.error("Failed to load camera settings:", error);
    }
  }

  /**
   * Public method to reload settings - called when user logs in/changes
   */
  public reloadSettings(): void {
    this.loadSettings();
  }

  /**
   * Handles mouse down event
   */
  onMouseDown(event: MouseEvent): void {
    if (event.button === 0) {
      // Left mouse button
      this.isDragging = false; // Reset dragging state for new click
      this.previousMousePosition = { x: event.clientX, y: event.clientY };
    }
  }

  /**
   * Handles mouse move event for camera rotation
   * @returns true if dragging (for other handlers to know)
   */
  onMouseMove(event: MouseEvent): boolean {
    if (event.buttons === 1) {
      // Left mouse button is pressed
      const deltaX = event.clientX - this.previousMousePosition.x;
      const deltaY = event.clientY - this.previousMousePosition.y;

      // Mark as dragging if moved enough
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        this.isDragging = true;
      }

      if (this.isDragging) {
        // Rotate camera around target (works both with and without tracking)
        const rotationSpeed = 0.005;
        const xMultiplier = this.invertX ? 1 : -1;
        const yMultiplier = this.invertY ? 1 : -1;

        this.cameraTheta += deltaX * rotationSpeed * xMultiplier;
        this.cameraPhi += deltaY * rotationSpeed * yMultiplier;

        // Clamp phi to prevent flipping
        this.cameraPhi = Math.max(0.1, Math.min(Math.PI - 0.1, this.cameraPhi));
      }

      this.previousMousePosition = { x: event.clientX, y: event.clientY };
      return this.isDragging;
    }
    return false;
  }

  /**
   * Handles mouse up event
   */
  onMouseUp(): void {
    this.isDragging = false;
  }

  /**
   * Handles mouse wheel for zoom
   */
  onMouseWheel(event: WheelEvent): void {
    event.preventDefault();

    const zoomSpeed = 0.1;
    const delta = event.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;

    this.cameraDistance *= delta;
    // Reduced minimum distance to 1 to allow close-up views of small asteroids
    this.cameraDistance = Math.max(1, Math.min(50000, this.cameraDistance));
  }

  /**
   * Centers camera on an object with three-level zoom system
   * @param objectId - ID of the object to center on
   * @param mesh - The Three.js mesh or group of the object
   * @returns true if this is a gate ready to travel through (second click), false otherwise
   */
  centerOnObject(objectId: string, mesh: THREE.Mesh | THREE.Group): boolean {
    this.cameraTarget.copy(mesh.position);

    // Check if this is the same object being clicked again
    const isAlreadySelected = this.selectedObjectId === objectId;
    const wasTracking = this.isTrackingObject;
    this.selectedObjectId = objectId;

    let shouldTravelThroughGate = false;

    // Camera behavior for different object types:
    // - Stars: don't track (they don't move)
    // - Ships: zoom proportionally, track movement (no second-click behavior)
    // - Gates: two-click system (first zooms + tracks, second triggers travel)
    // - All other objects (planets, moons, asteroids): track on first click
    if (mesh.userData.type === "star") {
      // Stars always use size-based zoom (they're huge)
      const objectRadius =
        mesh instanceof THREE.Mesh && mesh.geometry.boundingSphere
          ? mesh.geometry.boundingSphere.radius
          : 10;
      this.cameraDistance = objectRadius * 5;
      this.isTrackingObject = false; // Don't track stars (they don't move)
    } else if (mesh.userData.type === "ship") {
      // Ships: zoom in close to see details, always track
      // Ships are Groups so we compute a size estimate
      const box = new THREE.Box3().setFromObject(mesh);
      const size = box.getSize(new THREE.Vector3());
      const maxDimension = Math.max(size.x, size.y, size.z);
      const shipRadius = maxDimension / 2;

      // Zoom close enough to see ship details but not too close
      this.cameraDistance = shipRadius * 8;
      this.isTrackingObject = true; // Always track ships as they move
    } else if (mesh.userData.type === "gate") {
      // Gates: two-click system
      // First click: zoom in close and track (builds anticipation)
      // Second click: trigger gate travel (handled in SceneManager)
      if (isAlreadySelected && wasTracking) {
        // Second click: keep tracking and signal ready to travel
        this.isTrackingObject = true;
        shouldTravelThroughGate = true;
      } else {
        // First click: zoom VERY close to gate for dramatic buildup
        this.cameraDistance = 25; // Much closer to feel the gate's energy
        this.isTrackingObject = true; // Track gates as they orbit
      }
    } else if (mesh.userData.type === "asteroid") {
      // Asteroids: zoom in close and track on first click
      const objectRadius =
        mesh instanceof THREE.Mesh && mesh.geometry.boundingSphere
          ? mesh.geometry.boundingSphere.radius
          : 10;
      // Zoom very close to asteroids since they're small
      this.cameraDistance = objectRadius * 5;
      this.isTrackingObject = true; // Always track asteroids
    } else if (mesh.userData.type === "moon") {
      // Moons: zoom in close and track on first click
      const objectRadius =
        mesh instanceof THREE.Mesh && mesh.geometry.boundingSphere
          ? mesh.geometry.boundingSphere.radius
          : 10;
      // Zoom close to moons since they're relatively small
      this.cameraDistance = objectRadius * 4;
      this.isTrackingObject = true; // Always track moons
    } else {
      // Planets and other objects: zoom in close and track on first click
      const objectRadius =
        mesh instanceof THREE.Mesh && mesh.geometry.boundingSphere
          ? mesh.geometry.boundingSphere.radius
          : 10;

      // Rocky and barren planets use vertex displacement in shaders,
      // making them appear larger than their bounding sphere radius.
      // Use a larger multiplier to avoid zooming too close.
      const planetType = mesh.userData.body?.surfaceType;
      const hasVertexDisplacement =
        planetType === "rocky" || planetType === "barren";
      const distanceMultiplier = hasVertexDisplacement ? 4 : 3;

      // Zoom to fill screen nicely
      this.cameraDistance = objectRadius * distanceMultiplier;
      this.isTrackingObject = true; // Always track moving objects
    }

    return shouldTravelThroughGate;
  }

  /**
   * Position camera near an object (for gate exit animation)
   * @param object - The object to position near
   * @param distance - Distance from the object
   */
  setPositionNearObject(
    object: THREE.Mesh | THREE.Group,
    distance: number
  ): void {
    this.cameraTarget.copy(object.position);
    this.cameraDistance = distance;
    this.isTrackingObject = false;
    this.selectedObjectId = null;

    // Immediately update camera position (no lerp)
    const x =
      this.cameraDistance *
      Math.sin(this.cameraPhi) *
      Math.cos(this.cameraTheta);
    const y = this.cameraDistance * Math.cos(this.cameraPhi);
    const z =
      this.cameraDistance *
      Math.sin(this.cameraPhi) *
      Math.sin(this.cameraTheta);

    this.camera.position.set(
      this.cameraTarget.x + x,
      this.cameraTarget.y + y,
      this.cameraTarget.z + z
    );
    this.camera.lookAt(this.cameraTarget);
  }

  /**
   * Set camera to system overview position
   * @param distance - Distance from system center
   */
  setSystemView(distance: number): void {
    // Center on origin (system center)
    this.cameraTarget.set(0, 0, 0);
    this.cameraDistance = distance;
    this.isTrackingObject = false;
    this.selectedObjectId = null;

    // Set a nice viewing angle (slightly above and to the side)
    this.cameraPhi = Math.PI / 3; // 60 degrees from top
    this.cameraTheta = Math.PI / 4; // 45 degrees around
  }

  /**
   * Set camera to constellation view position
   * @param centerPosition - Optional position to center on (defaults to origin for current system)
   */
  setConstellationView(centerPosition?: THREE.Vector3): void {
    // Center on the specified position or origin (current system at origin in constellation view)
    if (centerPosition) {
      this.cameraTarget.copy(centerPosition);
    } else {
      this.cameraTarget.set(0, 0, 0);
    }
    this.isTrackingObject = false;
    this.selectedObjectId = null;

    // Set a good viewing angle for constellation view (more top-down)
    this.cameraPhi = Math.PI / 2.5; // Slightly above
    this.cameraTheta = 0; // Straight ahead

    // Start camera at intermediate position for a nice short zoom animation
    const startDistance = 350; // Close enough for quick animation
    const targetDistance = 120; // Final zoomed-in view of current system area

    // Immediately snap to the starting position
    const startX =
      startDistance * Math.sin(this.cameraPhi) * Math.cos(this.cameraTheta);
    const startY = startDistance * Math.cos(this.cameraPhi);
    const startZ =
      startDistance * Math.sin(this.cameraPhi) * Math.sin(this.cameraTheta);

    this.camera.position.set(
      this.cameraTarget.x + startX,
      this.cameraTarget.y + startY,
      this.cameraTarget.z + startZ
    );
    this.camera.lookAt(this.cameraTarget);

    // Set target distance for smooth lerp animation
    this.cameraDistance = targetDistance;
  }

  /**
   * Center camera on a position in constellation view
   */
  centerOnConstellationNode(position: THREE.Vector3): void {
    this.cameraTarget.copy(position);
    // Keep existing distance and angles for smooth transitions
  }

  /**
   * Get the current camera distance
   * @returns Current distance from camera target
   */
  getCameraDistance(): number {
    return this.cameraDistance;
  }

  /**
   * Set the camera distance without changing target or angles
   * @param distance - New camera distance
   */
  setCameraDistance(distance: number): void {
    this.cameraDistance = distance;
  }

  /**
   * Position camera at a specific object with a given distance
   * Used for positioning at exit gate after hyperspace travel
   * @param objectId - ID of the object
   * @param mesh - The mesh or group to position at
   * @param distance - Distance from the object
   */
  positionAtObject(
    objectId: string,
    mesh: THREE.Mesh | THREE.Group,
    distance: number
  ): void {
    this.cameraTarget.copy(mesh.position);
    this.cameraDistance = distance;
    this.selectedObjectId = objectId;
    this.isTrackingObject = true; // Track the gate so camera follows it
  }

  /**
   * Smoothly transition to system view during gate travel animation
   * @param distance - Current camera distance
   * @param progress - Animation progress from 0 to 1
   */
  transitionToSystemView(distance: number, progress: number): void {
    // Stop tracking any object
    this.isTrackingObject = false;
    this.selectedObjectId = null;

    // Smoothly interpolate camera target to origin (0,0,0)
    // This assumes we're starting from an object position
    this.cameraTarget.lerp(new THREE.Vector3(0, 0, 0), progress);

    // Set the camera distance
    this.cameraDistance = distance;

    // Smoothly interpolate camera angles to system view angles
    const targetPhi = Math.PI / 3; // 60 degrees from top
    const targetTheta = Math.PI / 4; // 45 degrees around

    // Use linear interpolation for angles
    this.cameraPhi = this.cameraPhi + (targetPhi - this.cameraPhi) * progress;
    this.cameraTheta =
      this.cameraTheta + (targetTheta - this.cameraTheta) * progress;
  }

  /**
   * Updates camera position and tracking
   * @param trackedObject - Optional mesh or group to track (if tracking is enabled)
   * @param shakeOffset - Optional camera shake offset (for gate travel animation)
   */
  update(
    trackedObject?: THREE.Mesh | THREE.Group,
    shakeOffset?: THREE.Vector3
  ): void {
    // Update camera target to follow selected object if tracking is enabled
    if (this.isTrackingObject && trackedObject) {
      // Smoothly lerp the camera target to the object's position
      // This prevents the "jumping" effect when zoomed in close
      const targetLerpFactor = 0.15;
      this.cameraTarget.lerp(trackedObject.position, targetLerpFactor);
    }

    // Calculate camera position based on spherical coordinates
    const x =
      this.cameraDistance *
      Math.sin(this.cameraPhi) *
      Math.cos(this.cameraTheta);
    const y = this.cameraDistance * Math.cos(this.cameraPhi);
    const z =
      this.cameraDistance *
      Math.sin(this.cameraPhi) *
      Math.sin(this.cameraTheta);

    let targetPosition = new THREE.Vector3(
      this.cameraTarget.x + x,
      this.cameraTarget.y + y,
      this.cameraTarget.z + z
    );

    // Apply shake offset if provided (for hyperspace animation)
    if (shakeOffset) {
      targetPosition.add(shakeOffset);
    }

    // Smooth camera movement
    const cameraLerpFactor = 0.1;
    this.camera.position.lerp(targetPosition, cameraLerpFactor);
    this.camera.lookAt(this.cameraTarget);
  }

  /**
   * Handles touch start event
   */
  onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      // Single finger - prepare for rotation
      this.isTouchDragging = false;
      const touch = event.touches[0];
      this.previousTouchPosition = { x: touch.clientX, y: touch.clientY };
    } else if (event.touches.length === 2) {
      // Two fingers - prepare for pinch zoom
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      const dx = touch2.clientX - touch1.clientX;
      const dy = touch2.clientY - touch1.clientY;
      this.touchStartDistance = Math.sqrt(dx * dx + dy * dy);
      this.isTouchDragging = false; // Stop rotation when second finger touches
    }
  }

  /**
   * Handles touch move event for camera rotation and pinch zoom
   * @returns true if dragging (for other handlers to know)
   */
  onTouchMove(event: TouchEvent): boolean {
    if (event.touches.length === 1) {
      // Single finger - rotate camera
      const touch = event.touches[0];
      const deltaX = touch.clientX - this.previousTouchPosition.x;
      const deltaY = touch.clientY - this.previousTouchPosition.y;

      // Mark as dragging if moved enough
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        this.isTouchDragging = true;
      }

      if (this.isTouchDragging) {
        // Rotate camera around target
        const rotationSpeed = 0.005;
        const xMultiplier = this.invertX ? 1 : -1;
        const yMultiplier = this.invertY ? 1 : -1;

        this.cameraTheta += deltaX * rotationSpeed * xMultiplier;
        this.cameraPhi += deltaY * rotationSpeed * yMultiplier;

        // Clamp phi to prevent flipping
        this.cameraPhi = Math.max(0.1, Math.min(Math.PI - 0.1, this.cameraPhi));
      }

      this.previousTouchPosition = { x: touch.clientX, y: touch.clientY };
      return this.isTouchDragging;
    } else if (event.touches.length === 2) {
      // Two fingers - pinch to zoom
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      const dx = touch2.clientX - touch1.clientX;
      const dy = touch2.clientY - touch1.clientY;
      const currentDistance = Math.sqrt(dx * dx + dy * dy);

      if (this.touchStartDistance > 0) {
        const delta = currentDistance / this.touchStartDistance;

        // Apply zoom
        this.cameraDistance /= delta;
        // Clamp distance
        this.cameraDistance = Math.max(1, Math.min(50000, this.cameraDistance));
      }

      this.touchStartDistance = currentDistance;
      this.isTouchDragging = true; // Mark as dragging to prevent tap detection
      return true;
    }
    return false;
  }

  /**
   * Handles touch end event
   */
  onTouchEnd(): void {
    this.isTouchDragging = false;
    this.touchStartDistance = 0;
  }

  /**
   * Gets whether touch is currently being dragged
   */
  getIsTouchDragging(): boolean {
    return this.isTouchDragging;
  }

  /**
   * Handles window resize
   */
  onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Gets the currently selected object ID
   */
  getSelectedObjectId(): string | null {
    return this.selectedObjectId;
  }

  /**
   * Gets whether an object is currently being tracked
   */
  getIsTracking(): boolean {
    return this.isTrackingObject;
  }

  /**
   * Gets whether the camera is currently being dragged
   */
  getIsDragging(): boolean {
    return this.isDragging;
  }

  /**
   * Gets the camera target position
   */
  getCameraTarget(): THREE.Vector3 {
    return this.cameraTarget;
  }

  /**
   * Sets the camera target position
   */
  setCameraTarget(target: THREE.Vector3): void {
    this.cameraTarget.copy(target);
  }
}
