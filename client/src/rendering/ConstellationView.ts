import * as THREE from "three";
import {
  ConstellationNode,
  ConstellationConnection,
  UnexploredGate,
} from "@constellation/shared";

/**
 * Renders a constellation view showing connected star systems
 */
export class ConstellationView {
  private scene: THREE.Scene;
  private nodes: Map<string, THREE.Group> = new Map();
  private connections: THREE.Group = new THREE.Group();
  private currentSystemId: string | null = null;

  // Scale factor for visualization (light years to Three.js units)
  private readonly SCALE = 5; // 1 light year = 5 units (very compact view)
  // Star size multiplier
  private readonly STAR_SIZE = 5;
  // Minimum distance between stars to prevent overlap
  private readonly MIN_STAR_DISTANCE = 30;

  // Dragging state
  private draggedNode: THREE.Group | null = null;
  private draggedMystery: THREE.Mesh | null = null; // For dragging mystery spheres
  private dragPlane: THREE.Plane = new THREE.Plane(
    new THREE.Vector3(0, 1, 0),
    0
  );
  private dragOffset: THREE.Vector3 = new THREE.Vector3();
  private connectionsList: ConstellationConnection[] = [];
  private nodesList: ConstellationNode[] = [];
  private mysteryPositions: Map<string, THREE.Vector3> = new Map(); // Store custom positions by gateId
  private unexploredGatesList: Array<{
    gateId: string;
    systemId: string;
    position: THREE.Vector3;
  }> = []; // Store unexplored gates for recreation

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.connections.name = "constellationConnections";
  }

  /**
   * Load and display constellation data
   */
  load(
    nodes: ConstellationNode[],
    connectionsList: ConstellationConnection[],
    unexploredGates: UnexploredGate[],
    currentSystemId: string,
    customPositions?: Record<string, { x: number; y: number; z: number }>
  ): void {
    this.clear();
    this.currentSystemId = currentSystemId;
    this.connectionsList = connectionsList;
    this.nodesList = nodes;

    // Center the view around the current system
    const currentNode = nodes.find((n) => n.systemId === currentSystemId);
    if (!currentNode) {
      console.warn("Current system not found in constellation nodes");
      return;
    }

    const centerOffset = new THREE.Vector3(
      currentNode.position.x * this.SCALE,
      currentNode.position.z * this.SCALE,
      currentNode.position.y * this.SCALE
    );

    // Create star nodes
    const placedPositions: THREE.Vector3[] = [];

    for (const node of nodes) {
      let position: THREE.Vector3;

      // Check if there's a custom position for this node
      if (customPositions && customPositions[node.systemId]) {
        const customPos = customPositions[node.systemId];
        position = new THREE.Vector3(customPos.x, customPos.y, customPos.z);
      } else {
        // Use default position
        position = new THREE.Vector3(
          node.position.x * this.SCALE,
          node.position.z * this.SCALE,
          node.position.y * this.SCALE
        );
        position.sub(centerOffset); // Center on current system

        // Check for overlaps and adjust position if needed
        position = this.adjustPositionToAvoidOverlap(position, placedPositions);
      }

      placedPositions.push(position.clone());

      const isCurrent = node.systemId === currentSystemId;
      const starGroup = this.createStarNode(node, position, isCurrent);
      this.nodes.set(node.systemId, starGroup);
      this.scene.add(starGroup);
    }

    // Create connections (lines between stars)
    // Use actual star group positions (which include custom positions)
    this.scene.add(this.connections);

    let exploredCount = 0;
    let unexploredCount = 0;
    let skippedCount = 0;

    for (const connection of connectionsList) {
      const fromGroup = this.nodes.get(connection.fromSystemId);
      const toGroup = this.nodes.get(connection.toSystemId);

      if (fromGroup && toGroup) {
        const fromPos = fromGroup.position;
        const toPos = toGroup.position;

        if (connection.isExplored) {
          // Explored connections: solid line
          this.createConnectionLine(fromPos, toPos, true);
          exploredCount++;
        } else {
          // Undiscovered connections: dashed line with purple sphere at end
          this.createConnectionLine(fromPos, toPos, false);
          this.createUndiscoveredEndpoint(toPos); // No gateId for regular unexplored connections
          unexploredCount++;
        }
      } else {
        skippedCount++;
        if (!fromGroup) {
          console.warn(
            `Missing fromGroup for system: ${connection.fromSystemId}`
          );
        }
        if (!toGroup) {
          console.warn(`Missing toGroup for system: ${connection.toSystemId}`);
        }
      }
    }

    // Create mystery paths for unexplored gates from current system
    this.unexploredGatesList = []; // Clear previous list
    for (const gate of unexploredGates) {
      const fromGroup = this.nodes.get(gate.systemId);
      if (fromGroup) {
        const fromPos = fromGroup.position;

        let mysteryPos: THREE.Vector3;

        // Check if there's a custom position for this mystery sphere (keyed by gateId with "mystery_" prefix)
        const customKey = `mystery_${gate.gateId}`;
        if (customPositions && customPositions[customKey]) {
          const customPos = customPositions[customKey];
          mysteryPos = new THREE.Vector3(customPos.x, customPos.y, customPos.z);
        } else {
          // Convert galaxy position to scene position (same as star positioning)
          mysteryPos = new THREE.Vector3(
            gate.position.x * this.SCALE,
            gate.position.z * this.SCALE,
            gate.position.y * this.SCALE
          );
          mysteryPos.sub(centerOffset);

          // Check for collision with existing stars and adjust if needed
          const existingPositions = Array.from(this.nodes.values()).map(
            (node) => node.position
          );
          mysteryPos = this.adjustPositionToAvoidOverlap(
            mysteryPos,
            existingPositions
          );
        }

        // Store the position and gate info for recreation during dragging
        this.mysteryPositions.set(gate.gateId, mysteryPos.clone());
        this.unexploredGatesList.push({
          gateId: gate.gateId,
          systemId: gate.systemId,
          position: mysteryPos.clone(),
        });

        // Draw mystery path (purple dashed line)
        this.createConnectionLine(fromPos, mysteryPos, false);

        // Add purple sphere at endpoint (where the star will appear) with gateId
        this.createUndiscoveredEndpoint(mysteryPos, gate.gateId);
      }
    }

    console.log(
      `Constellation view loaded: ${nodes.length} nodes, ${connectionsList.length} connections (${exploredCount} explored, ${unexploredCount} unexplored, ${skippedCount} skipped), ${unexploredGates.length} mystery paths`
    );
  }

  /**
   * Create a star node visual
   */
  private createStarNode(
    node: ConstellationNode,
    position: THREE.Vector3,
    isCurrent: boolean
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(position);
    group.userData = {
      type: "constellationNode",
      systemId: node.systemId,
      systemName: node.systemName,
    };

    // Parse star color
    const color = new THREE.Color(node.starColor);

    // Create star sphere
    const starSize = isCurrent ? this.STAR_SIZE * 1.5 : this.STAR_SIZE;
    const starGeometry = new THREE.SphereGeometry(starSize, 16, 16);
    const starMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
    });
    const starMesh = new THREE.Mesh(starGeometry, starMaterial);
    group.add(starMesh);

    // Add glow effect
    const glowGeometry = new THREE.SphereGeometry(starSize * 1.3, 16, 16);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.3,
      side: THREE.BackSide,
    });
    const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    group.add(glowMesh);

    // Add point light for current star
    if (isCurrent) {
      const light = new THREE.PointLight(color, 2, 200);
      group.add(light);
    }

    // Add text label
    this.createLabel(group, node.systemName, starSize, isCurrent);

    return group;
  }

  /**
   * Create a text label for a star
   */
  private createLabel(
    parent: THREE.Group,
    text: string,
    offset: number,
    isCurrent: boolean
  ): void {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return;

    // Set canvas size
    canvas.width = 512;
    canvas.height = 128;

    // Draw text
    context.fillStyle = "rgba(0, 0, 0, 0)"; // Transparent background
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.font = isCurrent ? "bold 48px Arial" : "36px Arial";
    context.fillStyle = isCurrent ? "#ffffff" : "#aaaaaa";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: isCurrent ? 1.0 : 0.7,
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.y = offset + 10; // Position above star
    sprite.scale.set(30, 7.5, 1); // Scale sprite appropriately

    parent.add(sprite);
  }

  /**
   * Create a connection line between two stars
   */
  private createConnectionLine(
    from: THREE.Vector3,
    to: THREE.Vector3,
    isExplored: boolean
  ): void {
    // Create a thick line using cylinder geometry (LineBasicMaterial linewidth doesn't work)
    const direction = new THREE.Vector3().subVectors(to, from);
    const length = direction.length();
    const midpoint = new THREE.Vector3()
      .addVectors(from, to)
      .multiplyScalar(0.5);

    // Create cylinder as the line
    const thickness = isExplored ? 0.3 : 0.2;
    const geometry = new THREE.CylinderGeometry(
      thickness,
      thickness,
      length,
      8
    );

    const material = new THREE.MeshBasicMaterial({
      color: isExplored ? 0x00ffff : 0x8800ff, // Cyan for explored, purple for undiscovered
      transparent: true,
      opacity: isExplored ? 0.7 : 0.5,
    });

    const line = new THREE.Mesh(geometry, material);
    line.position.copy(midpoint);

    // Orient the cylinder to point from 'from' to 'to'
    line.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize()
    );

    this.connections.add(line);
  }

  /**
   * Create a small purple sphere at the end of an undiscovered tunnel
   */
  private createUndiscoveredEndpoint(
    position: THREE.Vector3,
    gateId?: string
  ): void {
    const geometry = new THREE.SphereGeometry(3, 16, 16); // Larger and smoother
    const material = new THREE.MeshBasicMaterial({
      color: 0x8800ff, // Purple
      transparent: true,
      opacity: 0.9,
    });

    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.copy(position);
    sphere.userData = {
      type: "undiscoveredEndpoint",
      gateId: gateId, // Store gate ID directly
    };

    // Add pulsing animation data
    sphere.userData.pulsePhase = Math.random() * Math.PI * 2;

    this.connections.add(sphere);

    // Add small glow
    const glowGeometry = new THREE.SphereGeometry(5, 16, 16); // Larger glow
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x8800ff,
      transparent: true,
      opacity: 0.3,
      side: THREE.BackSide,
    });
    const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    glowMesh.position.copy(position);
    this.connections.add(glowMesh);
  }

  /**
   * Update animation (called every frame)
   */
  update(deltaTime: number): void {
    // Animate undiscovered endpoints (pulsing effect)
    this.connections.traverse((child) => {
      if (child.userData.type === "undiscoveredEndpoint") {
        const mesh = child as THREE.Mesh;
        const material = mesh.material as THREE.MeshBasicMaterial;

        // Update pulse phase
        child.userData.pulsePhase += deltaTime * 2;

        // Calculate pulsing opacity
        const pulseValue = Math.sin(child.userData.pulsePhase) * 0.5 + 0.5;
        material.opacity = 0.4 + pulseValue * 0.4;

        // Scale pulsing
        const scale = 1 + pulseValue * 0.3;
        mesh.scale.set(scale, scale, scale);
      }
    });

    // Rotate star glows slowly
    for (const starGroup of this.nodes.values()) {
      starGroup.children.forEach((child) => {
        if (
          child instanceof THREE.Mesh &&
          child.material instanceof THREE.MeshBasicMaterial
        ) {
          // Check if it's a glow mesh (has BackSide)
          if (child.material.side === THREE.BackSide) {
            child.rotation.y += deltaTime * 0.5;
          }
        }
      });
    }
  }

  /**
   * Clear all constellation visuals
   */
  clear(): void {
    // Remove all nodes
    for (const node of this.nodes.values()) {
      node.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        } else if (child instanceof THREE.Sprite) {
          if (child.material.map) {
            child.material.map.dispose();
          }
          child.material.dispose();
        }
      });
      this.scene.remove(node);
    }
    this.nodes.clear();

    // Remove all connections
    this.connections.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });
    this.connections.clear();
    this.scene.remove(this.connections);

    this.currentSystemId = null;
    this.mysteryPositions.clear();
    this.unexploredGatesList = [];
  }

  /**
   * Check if constellation view is currently active
   */
  isActive(): boolean {
    return this.nodes.size > 0;
  }

  /**
   * Get the current system ID
   */
  getCurrentSystemId(): string | null {
    return this.currentSystemId;
  }

  /**
   * Handle mouse down for dragging stars and mystery spheres
   */
  onMouseDown(
    event: MouseEvent,
    camera: THREE.Camera,
    raycaster: THREE.Raycaster
  ): boolean {
    if (event.button !== 2) return false; // Only right mouse button

    // Update raycaster
    const mouse = new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);

    // First check for mystery spheres
    const mysteryObjects: THREE.Object3D[] = [];
    this.connections.traverse((object) => {
      if (
        object.userData.type === "undiscoveredEndpoint" &&
        object.userData.gateId
      ) {
        mysteryObjects.push(object);
      }
    });

    const mysteryIntersects = raycaster.intersectObjects(mysteryObjects, true);
    if (mysteryIntersects.length > 0) {
      const mystery = mysteryIntersects[0].object;
      if (mystery.userData.type === "undiscoveredEndpoint") {
        this.draggedMystery = mystery as THREE.Mesh;

        // Set up drag plane at the mystery's position
        this.dragPlane.setFromNormalAndCoplanarPoint(
          new THREE.Vector3(0, 1, 0),
          this.draggedMystery.position
        );

        // Calculate offset from click point to mystery center
        const intersectPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(this.dragPlane, intersectPoint);
        this.dragOffset.copy(this.draggedMystery.position).sub(intersectPoint);

        return true; // Dragging started
      }
    }

    // Then check for star nodes
    const nodeArray = Array.from(this.nodes.values());
    const intersects = raycaster.intersectObjects(nodeArray, true);

    if (intersects.length > 0) {
      // Find the parent group (star node)
      let object = intersects[0].object;
      while (object.parent && !this.nodes.has(object.userData.systemId)) {
        object = object.parent as THREE.Object3D;
      }

      if (object.userData.type === "constellationNode") {
        this.draggedNode = object as THREE.Group;

        // Set up drag plane at the node's position
        this.dragPlane.setFromNormalAndCoplanarPoint(
          new THREE.Vector3(0, 1, 0),
          this.draggedNode.position
        );

        // Calculate offset from click point to node center
        const intersectPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(this.dragPlane, intersectPoint);
        this.dragOffset.copy(this.draggedNode.position).sub(intersectPoint);

        return true; // Dragging started
      }
    }

    return false;
  }

  /**
   * Handle mouse move for dragging stars and mystery spheres
   */
  onMouseMove(
    event: MouseEvent,
    camera: THREE.Camera,
    raycaster: THREE.Raycaster
  ): boolean {
    if (!this.draggedNode && !this.draggedMystery) return false;

    // Update raycaster
    const mouse = new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);

    // Find intersection with drag plane
    const intersectPoint = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(this.dragPlane, intersectPoint)) {
      if (this.draggedNode) {
        // Move the star node to the new position (with offset)
        this.draggedNode.position.copy(intersectPoint).add(this.dragOffset);
        // Update connections that involve this node
        this.updateConnections();
      } else if (this.draggedMystery) {
        // Move the mystery sphere to the new position (with offset)
        this.draggedMystery.position.copy(intersectPoint).add(this.dragOffset);

        // Update the stored position for this mystery sphere
        const gateId = this.draggedMystery.userData.gateId;
        if (gateId) {
          this.mysteryPositions.set(
            gateId,
            this.draggedMystery.position.clone()
          );
        }

        // Update connections that involve this mystery sphere
        this.updateConnections();
      }
    }

    return true; // Dragging in progress
  }

  /**
   * Handle mouse up to stop dragging
   */
  onMouseUp(): void {
    this.draggedNode = null;
    this.draggedMystery = null;
  }

  /**
   * Update connection lines to match current node positions
   */
  private updateConnections(): void {
    // Clear existing connections - DISPOSE PROPERLY to avoid memory leaks
    this.connections.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        if (child.geometry) {
          child.geometry.dispose();
        }
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        } else if (Array.isArray(child.material)) {
          child.material.forEach((mat) => mat.dispose());
        }
      }
    });
    this.connections.clear();

    // Recreate all connections with updated positions
    for (const connection of this.connectionsList) {
      const fromNode = this.nodesList.find(
        (n) => n.systemId === connection.fromSystemId
      );
      const toNode = this.nodesList.find(
        (n) => n.systemId === connection.toSystemId
      );

      if (fromNode && toNode) {
        const fromGroup = this.nodes.get(fromNode.systemId);
        const toGroup = this.nodes.get(toNode.systemId);

        if (fromGroup && toGroup) {
          const fromPos = fromGroup.position;
          const toPos = toGroup.position;

          if (connection.isExplored) {
            // Explored connections: solid line
            this.createConnectionLine(fromPos, toPos, true);
          } else {
            // Undiscovered connections: dashed line with purple sphere at end
            this.createConnectionLine(fromPos, toPos, false);
            this.createUndiscoveredEndpoint(toPos);
          }
        }
      }
    }

    // Recreate mystery sphere connections (lines from stars to mystery spheres)
    for (const unexploredGate of this.unexploredGatesList) {
      const fromGroup = this.nodes.get(unexploredGate.systemId);
      if (fromGroup) {
        // Get the current position (might have been updated by dragging)
        const currentPos =
          this.mysteryPositions.get(unexploredGate.gateId) ||
          unexploredGate.position;

        // Draw mystery path (purple dashed line)
        this.createConnectionLine(fromGroup.position, currentPos, false);

        // Add purple sphere at endpoint with gateId
        this.createUndiscoveredEndpoint(currentPos, unexploredGate.gateId);
      }
    }
  }

  /**
   * Check if currently dragging a node
   */
  isDragging(): boolean {
    return this.draggedNode !== null || this.draggedMystery !== null;
  }

  /**
   * Get all current node and mystery positions (for saving)
   */
  getAllPositions(): Record<string, { x: number; y: number; z: number }> {
    const positions: Record<string, { x: number; y: number; z: number }> = {};

    // Save star positions
    for (const [systemId, starGroup] of this.nodes.entries()) {
      positions[systemId] = {
        x: starGroup.position.x,
        y: starGroup.position.y,
        z: starGroup.position.z,
      };
    }

    // Save mystery sphere positions with "mystery_" prefix
    for (const [gateId, position] of this.mysteryPositions.entries()) {
      positions[`mystery_${gateId}`] = {
        x: position.x,
        y: position.y,
        z: position.z,
      };
    }

    return positions;
  }

  /**
   * Adjust position to avoid overlapping with existing stars
   */
  private adjustPositionToAvoidOverlap(
    position: THREE.Vector3,
    existingPositions: THREE.Vector3[]
  ): THREE.Vector3 {
    const adjustedPosition = position.clone();
    let attempts = 0;
    const maxAttempts = 50;

    while (attempts < maxAttempts) {
      let hasOverlap = false;

      // Check distance to all existing stars
      for (const existingPos of existingPositions) {
        const distance = adjustedPosition.distanceTo(existingPos);
        if (distance < this.MIN_STAR_DISTANCE) {
          hasOverlap = true;
          break;
        }
      }

      if (!hasOverlap) {
        return adjustedPosition;
      }

      // If overlap detected, nudge position in a spiral pattern
      const angle = attempts * 0.618 * Math.PI * 2; // Golden angle for better distribution
      const radius = this.MIN_STAR_DISTANCE * (1 + attempts * 0.3);
      adjustedPosition.x = position.x + Math.cos(angle) * radius;
      adjustedPosition.z = position.z + Math.sin(angle) * radius;
      // Keep y relatively similar to avoid too much vertical spread
      adjustedPosition.y =
        position.y + Math.sin(attempts) * this.MIN_STAR_DISTANCE * 0.3;

      attempts++;
    }

    // If we couldn't find a good spot, return the adjusted position anyway
    return adjustedPosition;
  }

  /**
   * Handle click on a star node to travel to that system
   */
  onStarClick(
    event: MouseEvent,
    camera: THREE.Camera,
    raycaster: THREE.Raycaster
  ): string | null {
    // Update raycaster
    const mouse = new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);

    // Check for intersections with star nodes
    const nodeArray = Array.from(this.nodes.values());
    const intersects = raycaster.intersectObjects(nodeArray, true);

    if (intersects.length > 0) {
      // Find the parent group (star node)
      let object = intersects[0].object;
      while (object.parent && !this.nodes.has(object.userData.systemId)) {
        object = object.parent as THREE.Object3D;
      }

      if (object.userData.type === "constellationNode") {
        const systemId = object.userData.systemId;

        // Don't travel if it's the current system
        if (systemId !== this.currentSystemId) {
          return systemId;
        }
      }
    }

    return null;
  }

  /**
   * Handle click on an unexplored endpoint to travel through that gate
   */
  onUnexploredGateClick(
    event: MouseEvent,
    camera: THREE.Camera,
    raycaster: THREE.Raycaster
  ): string | null {
    // Update raycaster
    const mouse = new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);

    // Get all unexplored endpoint spheres
    const unexploredEndpoints: THREE.Object3D[] = [];
    this.connections.traverse((object) => {
      if (
        object.userData.type === "undiscoveredEndpoint" &&
        object.userData.gateId
      ) {
        unexploredEndpoints.push(object);
      }
    });

    console.log(
      `Found ${unexploredEndpoints.length} unexplored endpoints to check`
    );

    // Check for intersections
    const intersects = raycaster.intersectObjects(unexploredEndpoints, true);

    console.log(
      `Raycaster found ${intersects.length} intersections with mystery spheres`
    );

    if (intersects.length > 0) {
      // Find the gate ID - might be on the object itself or its parent
      let gateId = intersects[0].object.userData.gateId;

      // If not on the object, check parent
      if (!gateId && intersects[0].object.parent) {
        gateId = intersects[0].object.parent.userData.gateId;
      }

      console.log(`Mystery sphere clicked, gateId: ${gateId}`);

      if (gateId) {
        return gateId;
      }
    }

    return null;
  }
}
