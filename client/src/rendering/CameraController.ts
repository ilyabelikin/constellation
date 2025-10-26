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

  private selectedObjectId: string | null = null;
  private isTrackingObject: boolean = false;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  /**
   * Handles mouse down event
   */
  onMouseDown(event: MouseEvent): void {
    if (event.button === 0) {
      // Left mouse button
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
        this.cameraTheta -= deltaX * rotationSpeed;
        this.cameraPhi -= deltaY * rotationSpeed;

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

    // Three-level zoom system for planets:
    // 1. First click: uniform distance to compare sizes, no tracking
    // 2. Second click (same object): size-based zoom to fill screen + track object
    // 3. Third click (same object, already tracking): back to uniform distance, stop tracking
    if (mesh.userData.type === "star") {
      // Stars always use size-based zoom (they're huge)
      const objectRadius =
        mesh instanceof THREE.Mesh && mesh.geometry.boundingSphere
          ? mesh.geometry.boundingSphere.radius
          : 10;
      this.cameraDistance = objectRadius * 5;
      this.isTrackingObject = false; // Don't track stars (they don't move)
    } else if (mesh.userData.type === "gate") {
      // Gates: two-click system
      // First click: zoom in and track
      // Second click: trigger gate travel (handled in SceneManager)
      if (isAlreadySelected && wasTracking) {
        // Second click: keep tracking and signal ready to travel
        this.isTrackingObject = true;
        shouldTravelThroughGate = true;
      } else {
        // First click: zoom close and start tracking
        this.cameraDistance = 40; // Close enough to see details
        this.isTrackingObject = true; // Track gates as they orbit
      }
    } else if (mesh.userData.type === "asteroid") {
      // Asteroids: single-click zoom system (they're too small for two-click)
      // Always zoom in close on first click and track them
      const objectRadius =
        mesh instanceof THREE.Mesh && mesh.geometry.boundingSphere
          ? mesh.geometry.boundingSphere.radius
          : 10;
      // Zoom very close to asteroids since they're small
      this.cameraDistance = objectRadius * 5;
      this.isTrackingObject = true; // Always track asteroids
    } else if (mesh.userData.type === "moon") {
      // Moons: single-click zoom system (similar to asteroids)
      // Always zoom in close on first click and track them
      const objectRadius =
        mesh instanceof THREE.Mesh && mesh.geometry.boundingSphere
          ? mesh.geometry.boundingSphere.radius
          : 10;
      // Zoom close to moons since they're relatively small
      this.cameraDistance = objectRadius * 4;
      this.isTrackingObject = true; // Always track moons
    } else if (isAlreadySelected && wasTracking) {
      // Third click: already tracking, reset to uniform distance and stop tracking
      this.cameraDistance = 80;
      this.isTrackingObject = false;
    } else if (isAlreadySelected) {
      // Second click on same planet: zoom to fill screen and start tracking
      const objectRadius =
        mesh instanceof THREE.Mesh && mesh.geometry.boundingSphere
          ? mesh.geometry.boundingSphere.radius
          : 10;
      this.cameraDistance = objectRadius * 3;
      this.isTrackingObject = true; // Start tracking the planet
    } else {
      // First click: uniform distance to show relative sizes, no tracking
      this.cameraDistance = 80;
      this.isTrackingObject = false;
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
   */
  update(trackedObject?: THREE.Mesh | THREE.Group): void {
    // Update camera target to follow selected object if tracking is enabled
    if (this.isTrackingObject && trackedObject) {
      this.cameraTarget.copy(trackedObject.position);
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

    const targetPosition = new THREE.Vector3(
      this.cameraTarget.x + x,
      this.cameraTarget.y + y,
      this.cameraTarget.z + z
    );

    // Smooth camera movement
    const cameraLerpFactor = 0.1;
    this.camera.position.lerp(targetPosition, cameraLerpFactor);
    this.camera.lookAt(this.cameraTarget);
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
}
