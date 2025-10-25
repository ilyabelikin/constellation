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
    this.cameraDistance = Math.max(10, Math.min(50000, this.cameraDistance));
  }

  /**
   * Centers camera on an object with three-level zoom system
   * @param objectId - ID of the object to center on
   * @param mesh - The Three.js mesh of the object
   */
  centerOnObject(objectId: string, mesh: THREE.Mesh): void {
    this.cameraTarget.copy(mesh.position);

    // Check if this is the same object being clicked again
    const isAlreadySelected = this.selectedObjectId === objectId;
    const wasTracking = this.isTrackingObject;
    this.selectedObjectId = objectId;

    // Three-level zoom system for planets:
    // 1. First click: uniform distance to compare sizes, no tracking
    // 2. Second click (same object): size-based zoom to fill screen + track object
    // 3. Third click (same object, already tracking): back to uniform distance, stop tracking
    if (mesh.userData.type === "star") {
      // Stars always use size-based zoom (they're huge)
      const objectRadius = mesh.geometry.boundingSphere?.radius || 10;
      this.cameraDistance = objectRadius * 5;
      this.isTrackingObject = false; // Don't track stars (they don't move)
    } else if (isAlreadySelected && wasTracking) {
      // Third click: already tracking, reset to uniform distance and stop tracking
      this.cameraDistance = 80;
      this.isTrackingObject = false;
    } else if (isAlreadySelected) {
      // Second click on same planet: zoom to fill screen and start tracking
      const objectRadius = mesh.geometry.boundingSphere?.radius || 10;
      this.cameraDistance = objectRadius * 3;
      this.isTrackingObject = true; // Start tracking the planet
    } else {
      // First click: uniform distance to show relative sizes, no tracking
      this.cameraDistance = 80;
      this.isTrackingObject = false;
    }
  }

  /**
   * Updates camera position and tracking
   * @param trackedObject - Optional mesh to track (if tracking is enabled)
   */
  update(trackedObject?: THREE.Mesh): void {
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
