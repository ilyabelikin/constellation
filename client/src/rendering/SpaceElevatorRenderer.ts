import * as THREE from "three";
import { Megastructure } from "@constellation/shared";

/**
 * Manages rendering of Space Elevators on planets
 * Visuals:
 * - Simple dome at the bottom (smaller than helium extractor)
 * - A line going up to space
 * - A base station at the end of the line
 * - A tiny dot moving up and down representing the elevator car
 */
export class SpaceElevatorRenderer {
  private scene: THREE.Scene;
  private elevators: Map<string, SpaceElevator> = new Map();
  private celestialBodyMeshes: Map<string, THREE.Mesh | THREE.Group>;
  private camera: THREE.Camera;

  constructor(
    scene: THREE.Scene,
    celestialBodyMeshes: Map<string, THREE.Mesh | THREE.Group>,
    camera: THREE.Camera
  ) {
    this.scene = scene;
    this.celestialBodyMeshes = celestialBodyMeshes;
    this.camera = camera;
  }

  /**
   * Update Space Elevators based on current megastructures
   */
  update(megastructures: Megastructure[], deltaTime: number): void {
    const spaceElevators = megastructures.filter(m => m.type === "space_elevator");
    const activeElevatorBodies = new Set(spaceElevators.map(m => m.celestialBodyId));

    // Remove elevators that no longer exist
    for (const [bodyId, elevator] of this.elevators.entries()) {
      if (!activeElevatorBodies.has(bodyId)) {
        this.removeElevator(bodyId);
      }
    }

    // Add or update elevators
    for (const elevator of spaceElevators) {
      if (!elevator.celestialBodyId) continue;

      const bodyObject = this.celestialBodyMeshes.get(elevator.celestialBodyId);
      if (!bodyObject || !(bodyObject instanceof THREE.Mesh)) continue;

      if (!this.elevators.has(elevator.celestialBodyId)) {
        this.addElevator(elevator.celestialBodyId, bodyObject);
      }

      const renderer = this.elevators.get(elevator.celestialBodyId);
      if (renderer) {
        renderer.animate(deltaTime);
      }
    }
  }

  private addElevator(bodyId: string, bodyMesh: THREE.Mesh): void {
    const elevator = new SpaceElevator(this.scene, bodyMesh, this.camera);
    this.elevators.set(bodyId, elevator);
  }

  private removeElevator(bodyId: string): void {
    const elevator = this.elevators.get(bodyId);
    if (elevator) {
      elevator.dispose();
      this.elevators.delete(bodyId);
    }
  }

  dispose(): void {
    for (const elevator of this.elevators.values()) {
      elevator.dispose();
    }
    this.elevators.clear();
  }

  setVisible(visible: boolean): void {
    for (const elevator of this.elevators.values()) {
      elevator.setVisible(visible);
    }
  }
}

class SpaceElevator {
  private scene: THREE.Scene;
  private bodyMesh: THREE.Mesh;
  private camera: THREE.Camera;
  private group: THREE.Group;
  private dome!: THREE.Mesh;
  private cable!: THREE.Line;
  private station!: THREE.Mesh;
  private car!: THREE.Mesh;
  private animationTime: number = 0;

  private readonly DOME_RADIUS_RATIO = 0.02; // Smaller than Helium Extractor (0.12)
  private readonly CABLE_LENGTH_RATIO = 0.7; // Extends out 0.7 body radii
  private readonly CAR_SPEED = 0.2; // Speed of the car

  constructor(scene: THREE.Scene, bodyMesh: THREE.Mesh, camera: THREE.Camera) {
    this.scene = scene;
    this.bodyMesh = bodyMesh;
    this.camera = camera;
    this.group = new THREE.Group();

    // Add as a child of bodyMesh to automatically spin with it
    this.bodyMesh.add(this.group);

    const bodyRadius = this.getBodyRadius();
    this.createElevator(bodyRadius);
  }

  private getBodyRadius(): number {
    const geometry = this.bodyMesh.geometry;
    geometry.computeBoundingSphere();
    return geometry.boundingSphere?.radius || 1;
  }

  private createElevator(bodyRadius: number): void {
    // 1. Dome at the bottom
    const domeRadius = bodyRadius * this.DOME_RADIUS_RATIO;
    const domeGeometry = new THREE.SphereGeometry(domeRadius, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const domeMaterial = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
    this.dome = new THREE.Mesh(domeGeometry, domeMaterial);

    // Position dome on equator (local space)
    this.dome.position.set(bodyRadius, 0, 0);
    this.dome.rotation.z = -Math.PI / 2; // Rotate to point along +X
    this.group.add(this.dome);

    // 2. Cable going up
    const cableLength = bodyRadius * this.CABLE_LENGTH_RATIO;
    const cableGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(bodyRadius, 0, 0),
      new THREE.Vector3(bodyRadius + cableLength, 0, 0)
    ]);
    const cableMaterial = new THREE.LineBasicMaterial({ color: 0x888888 });
    this.cable = new THREE.Line(cableGeometry, cableMaterial);
    this.group.add(this.cable);

    // 3. Base station at the end
    const stationSize = bodyRadius * 0.025;
    const stationGeometry = new THREE.SphereGeometry(stationSize, 16, 16);
    const stationMaterial = new THREE.MeshBasicMaterial({ color: 0x88ccff }); // Light Blue
    this.station = new THREE.Mesh(stationGeometry, stationMaterial);
    this.station.position.set(bodyRadius + cableLength, 0, 0);
    this.group.add(this.station);

    // 3b. Solar batteries (panels) on the station
    const panelWidth = stationSize * 2.0;
    const panelHeight = stationSize * 0.1;
    const panelDepth = stationSize * 0.8;
    const panelGeometry = new THREE.BoxGeometry(panelDepth, panelHeight, panelWidth);
    const panelMaterial = new THREE.MeshBasicMaterial({ color: 0x3333bb });
    
    // Create a container for panels to rotate them together if needed
    const panelsGroup = new THREE.Group();
    this.station.add(panelsGroup);

    // Left panel
    const leftPanel = new THREE.Mesh(panelGeometry, panelMaterial);
    leftPanel.position.set(0, 0, stationSize + panelWidth / 2);
    panelsGroup.add(leftPanel);

    // Right panel
    const rightPanel = new THREE.Mesh(panelGeometry, panelMaterial);
    rightPanel.position.set(0, 0, -(stationSize + panelWidth / 2));
    panelsGroup.add(rightPanel);

    // 4. Elevator car (tiny dot)
    const carSize = bodyRadius * 0.01;
    const carGeometry = new THREE.SphereGeometry(carSize, 8, 8);
    const carMaterial = new THREE.MeshBasicMaterial({ color: 0xffb347 }); // Light Orange
    this.car = new THREE.Mesh(carGeometry, carMaterial);
    this.car.position.set(bodyRadius, 0, 0);
    this.group.add(this.car);
  }

  animate(deltaTime: number): void {
    this.animationTime += deltaTime;

    // Sync rotation with planet texture if it uses shader rotation
    if (this.bodyMesh.material instanceof THREE.ShaderMaterial && 
        this.bodyMesh.material.uniforms.rotation) {
      // Apply rotation to match the texture rotation in the shader
      this.group.rotation.y = this.bodyMesh.material.uniforms.rotation.value;
    }

    // Animate car moving up and down
    const bodyRadius = this.getBodyRadius();
    const cableLength = bodyRadius * this.CABLE_LENGTH_RATIO;
    const t = (Math.sin(this.animationTime * this.CAR_SPEED) + 1) / 2; // 0 to 1
    this.car.position.x = bodyRadius + t * cableLength;
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  dispose(): void {
    this.group.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      } else if (child instanceof THREE.Line) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });
    this.bodyMesh.remove(this.group);
  }
}

