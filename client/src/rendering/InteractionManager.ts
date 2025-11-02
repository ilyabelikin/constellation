import * as THREE from "three";

/**
 * Handles mouse interactions with 3D objects (raycasting, clicks, hover)
 */
export class InteractionManager {
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;

  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
  }

  /**
   * Updates mouse position from screen coordinates
   */
  updateMousePosition(event: MouseEvent): void {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  /**
   * Updates mouse position from touch coordinates
   */
  updateTouchPosition(event: TouchEvent): void {
    if (event.touches.length > 0) {
      const touch = event.touches[0];
      this.mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
    }
  }

  /**
   * Checks for intersections with objects and returns the first intersected object's ID
   * @param camera - The camera to use for raycasting
   * @param objects - Array of THREE.Mesh or THREE.Group objects to check for intersections
   * @returns The ID of the first intersected object, or null if none
   */
  getIntersectedObjectId(
    camera: THREE.PerspectiveCamera,
    objects: (THREE.Mesh | THREE.Group)[]
  ): string | null {
    this.raycaster.setFromCamera(this.mouse, camera);
    // Use recursive: true to handle Groups (gates) that contain multiple meshes
    const intersects = this.raycaster.intersectObjects(objects, true);

    if (intersects.length > 0) {
      // For groups, traverse up to find the root group with userData
      let object: THREE.Object3D = intersects[0].object;
      while (object.parent && !object.userData.id) {
        object = object.parent;
      }
      return object.userData.id || null;
    }

    return null;
  }

  /**
   * Checks if mouse is hovering over any object
   * @param camera - The camera to use for raycasting
   * @param objects - Array of THREE.Mesh or THREE.Group objects to check
   * @returns true if hovering over an object, false otherwise
   */
  isHoveringOverObject(
    camera: THREE.PerspectiveCamera,
    objects: (THREE.Mesh | THREE.Group)[]
  ): boolean {
    this.raycaster.setFromCamera(this.mouse, camera);
    // Use recursive: true to handle Groups (gates) that contain multiple meshes
    const intersects = this.raycaster.intersectObjects(objects, true);
    return intersects.length > 0;
  }

  /**
   * Gets the current mouse position in normalized device coordinates
   */
  getMousePosition(): THREE.Vector2 {
    return this.mouse.clone();
  }
}
