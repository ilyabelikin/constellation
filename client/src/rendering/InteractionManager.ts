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
   * Checks for intersections with objects and returns the first intersected object's ID
   * @param camera - The camera to use for raycasting
   * @param objects - Array of THREE.Mesh objects to check for intersections
   * @returns The ID of the first intersected object, or null if none
   */
  getIntersectedObjectId(
    camera: THREE.PerspectiveCamera,
    objects: THREE.Mesh[]
  ): string | null {
    this.raycaster.setFromCamera(this.mouse, camera);
    const intersects = this.raycaster.intersectObjects(objects);

    if (intersects.length > 0) {
      const object = intersects[0].object as THREE.Mesh;
      return object.userData.id || null;
    }

    return null;
  }

  /**
   * Checks if mouse is hovering over any object
   * @param camera - The camera to use for raycasting
   * @param objects - Array of THREE.Mesh objects to check
   * @returns true if hovering over an object, false otherwise
   */
  isHoveringOverObject(
    camera: THREE.PerspectiveCamera,
    objects: THREE.Mesh[]
  ): boolean {
    this.raycaster.setFromCamera(this.mouse, camera);
    const intersects = this.raycaster.intersectObjects(objects);
    return intersects.length > 0;
  }

  /**
   * Gets the current mouse position in normalized device coordinates
   */
  getMousePosition(): THREE.Vector2 {
    return this.mouse.clone();
  }
}
