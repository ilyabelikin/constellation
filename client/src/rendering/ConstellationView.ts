import * as THREE from "three";
import {
  ConstellationNode,
  ConstellationConnection,
  UnexploredGate,
  GateStatusType,
} from "@constellation/shared";
import { MaterialFactory } from "./MaterialFactory.js";

/**
 * Renders a constellation view showing connected star systems
 */
export class ConstellationView {
  private scene: THREE.Scene;
  private nodes: Map<string, THREE.Group> = new Map();
  private connections: THREE.Group = new THREE.Group();
  private currentSystemId: string | null = null;
  private selectedSystemId: string | null = null; // Track selected system (starts as current system)

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
  private draggedNodePreviousPosition: THREE.Vector3 = new THREE.Vector3(); // Track star position for moving mystery endpoints
  private connectionsList: ConstellationConnection[] = [];
  private nodesList: ConstellationNode[] = [];
  private mysteryPositions: Map<string, THREE.Vector3> = new Map(); // Store custom positions by gateId
  private unexploredGatesList: Array<{
    gateId: string;
    systemId: string;
    position: THREE.Vector3;
  }> = []; // Store unexplored gates for recreation

  // Material factory for star materials
  private materialFactory: MaterialFactory;
  private starMaterials: THREE.ShaderMaterial[] = []; // Track for animation updates

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.connections.name = "constellationConnections";
    this.materialFactory = new MaterialFactory();
  }

  /**
   * Load and display constellation data
   */
  load(
    nodes: ConstellationNode[],
    connectionsList: ConstellationConnection[],
    unexploredGates: UnexploredGate[],
    currentSystemId: string,
    customPositions?: Record<string, { x: number; y: number; z: number }>,
    preserveSelectedSystemId?: string | null
  ): void {
    this.clear();
    this.currentSystemId = currentSystemId;
    // Preserve selection if provided, otherwise auto-select current system
    this.selectedSystemId = preserveSelectedSystemId || currentSystemId;
    this.connectionsList = connectionsList;
    this.nodesList = nodes;

    // Populate unexplored gates list EARLY (before creating star nodes)
    // so connection counts in labels are correct from the start
    this.unexploredGatesList = unexploredGates.map((gate) => ({
      gateId: gate.gateId,
      systemId: gate.systemId,
      position: new THREE.Vector3(
        gate.position.x,
        gate.position.y,
        gate.position.z
      ),
    }));

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

      const starGroup = this.createStarNode(node, position);
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
          // Explored connections: solid line with color based on status
          this.createConnectionLine(fromPos, toPos, true, undefined, connection.status);
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

    // Create 3D visuals for mystery paths (list already populated above)
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
            existingPositions,
            fromPos // Pass source position for connection-aware positioning
          );
        }

        // Store the position and update in list
        this.mysteryPositions.set(gate.gateId, mysteryPos.clone());
        const listItem = this.unexploredGatesList.find(
          (g) => g.gateId === gate.gateId
        );
        if (listItem) {
          listItem.position = mysteryPos.clone();
        }

        // Draw mystery path (purple dashed line)
        this.createConnectionLine(fromPos, mysteryPos, false, gate.systemId);

        // Add purple sphere at endpoint (where the star will appear) with gateId and systemId
        this.createUndiscoveredEndpoint(mysteryPos, gate.gateId, gate.systemId);
      }
    }

    console.log(
      `Constellation view loaded: ${nodes.length} nodes, ${connectionsList.length} connections (${exploredCount} explored, ${unexploredCount} unexplored, ${skippedCount} skipped), ${unexploredGates.length} mystery paths`
    );

    // Update visibility to only show mystery pathways for selected system
    this.updateUnexploredGatesVisibility();
  }

  /**
   * Create a star node visual
   */
  private createStarNode(
    node: ConstellationNode,
    position: THREE.Vector3
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(position);
    group.userData = {
      type: "constellationNode",
      systemId: node.systemId,
      systemName: node.systemName,
      isCurrent: node.systemId === this.currentSystemId,
    };

    // Parse star color
    const color = new THREE.Color(node.starColor);
    const colorHex = color.getHex();

    // Create star sphere - consistent size regardless of selection
    const starSize = this.STAR_SIZE;
    const starGeometry = new THREE.SphereGeometry(starSize, 32, 32);

    // Use shader material for realistic star rendering
    const starMaterial = this.materialFactory.createStarMaterial(colorHex);
    const starMesh = new THREE.Mesh(starGeometry, starMaterial);
    group.add(starMesh);

    // Track material for animation updates
    this.starMaterials.push(starMaterial);

    // No geometry-based glow layers - using shader-based transparent edge glow instead

    // Add companion stars for binary/trinary systems
    if (node.companionStars && node.companionStars.length > 0) {
      const companionSize = starSize * 0.6; // Smaller than primary
      const companionDistance = starSize * 2.5; // Distance from primary

      node.companionStars.forEach((companion, index) => {
        const companionColor = new THREE.Color(companion.color);
        const companionColorHex = companionColor.getHex();

        // Position companions in a circle around the primary
        // For binary: one on the right
        // For trinary: positioned at 120 degree intervals
        let angle: number;
        if (node.companionStars!.length === 1) {
          angle = 0; // Binary: companion to the right
        } else {
          angle =
            (index * 2 * Math.PI) / node.companionStars!.length + Math.PI / 6;
        }

        const offsetX = Math.cos(angle) * companionDistance;
        const offsetZ = Math.sin(angle) * companionDistance;

        // Create companion star sphere
        const companionGeometry = new THREE.SphereGeometry(
          companionSize,
          24,
          24
        );
        const companionMaterial =
          this.materialFactory.createStarMaterial(companionColorHex);
        const companionMesh = new THREE.Mesh(
          companionGeometry,
          companionMaterial
        );
        companionMesh.position.set(offsetX, 0, offsetZ);
        group.add(companionMesh);

        // Track material for animation updates
        this.starMaterials.push(companionMaterial);

        // No geometry-based glow layers - using shader-based transparent edge glow instead
      });
    }

    // Calculate connection stats for this system
    const exploredGates = this.connectionsList.filter(
      (c) => c.fromSystemId === node.systemId && c.isExplored
    ).length;
    const totalGates =
      this.connectionsList.filter((c) => c.fromSystemId === node.systemId)
        .length +
      this.unexploredGatesList.filter((g) => g.systemId === node.systemId)
        .length;

    // Add text label with connection stats
    this.createLabel(
      group,
      node,
      starSize,
      exploredGates,
      totalGates
    );

    return group;
  }

  /**
   * Create a text label for a star with connection stats
   */
  private createLabel(
    parent: THREE.Group,
    node: ConstellationNode,
    offset: number,
    exploredGates: number,
    totalGates: number
  ): void {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return;

    // System is bright if it's selected (selection starts at current system)
    const isSelected = node.systemId === this.selectedSystemId;
    
    // Determine font sizes
    const nameFontSize = isSelected ? 48 : 36;
    const statsFontSize = 28;
    const maxWidth = 500; // Maximum width for text before wrapping
    
    // Set font for measurement
    context.font = isSelected ? `bold ${nameFontSize}px Arial` : `${nameFontSize}px Arial`;
    
    // Wrap text if needed
    const words = node.systemName.split(' ');
    const lines: string[] = [];
    let currentLine = words[0];
    
    for (let i = 1; i < words.length; i++) {
      const testLine = currentLine + ' ' + words[i];
      const metrics = context.measureText(testLine);
      
      if (metrics.width > maxWidth) {
        lines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);
    
    // Calculate canvas height based on number of lines
    const lineHeight = nameFontSize * 1.2;
    const statsHeight = statsFontSize * 1.2;
    const padding = 20;
    const canvasHeight = Math.ceil(lines.length * lineHeight + statsHeight + padding * 2);
    
    // Set canvas size
    canvas.width = 512;
    canvas.height = canvasHeight;

    // Draw transparent background
    context.fillStyle = "rgba(0, 0, 0, 0)";
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Draw star name (possibly multi-line)
    context.font = isSelected ? `bold ${nameFontSize}px Arial` : `${nameFontSize}px Arial`;
    context.fillStyle = isSelected ? "#ffffff" : "#aaaaaa";
    context.textAlign = "center";
    context.textBaseline = "middle";
    
    const startY = padding + lineHeight / 2;
    for (let i = 0; i < lines.length; i++) {
      context.fillText(lines[i], canvas.width / 2, startY + i * lineHeight);
    }

    // Draw connection stats below name
    context.font = `${statsFontSize}px Arial`;
    context.fillStyle = isSelected ? "#cccccc" : "#888888";
    const statsY = startY + lines.length * lineHeight + statsHeight / 2;
    context.fillText(
      `${exploredGates}/${totalGates}`,
      canvas.width / 2,
      statsY
    );

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: isSelected ? 1.0 : 0.7,
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.y = offset + 10; // Position above star
    
    // Scale sprite based on canvas dimensions
    const spriteWidth = 30;
    const spriteHeight = spriteWidth * (canvasHeight / canvas.width);
    sprite.scale.set(spriteWidth, spriteHeight, 1);

    // Make label non-clickable so only the star sphere can be clicked
    sprite.raycast = () => {};

    parent.add(sprite);
  }

  /**
   * Create a connection line between two stars
   */
  private createConnectionLine(
    from: THREE.Vector3,
    to: THREE.Vector3,
    isExplored: boolean,
    systemId?: string,
    status?: GateStatusType
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

    // Determine color based on status (diplomatic stance)
    let color: number;
    if (!isExplored || status === "unexplored") {
      color = 0x8800ff; // Purple for unexplored
    } else if (status === "owned_by_self") {
      color = 0xfbbf24; // Orange for owned by self
    } else if (status === "neutral") {
      color = 0x9ca3af; // Gray for neutral
    } else if (status === "friendly") {
      color = 0x10b981; // Green for friendly
    } else if (status === "aggressive") {
      color = 0xef4444; // Red for aggressive
    } else {
      // Default to orange for explored but no status info
      color = 0xfbbf24;
    }

    const material = new THREE.MeshBasicMaterial({
      color: color,
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

    // Store systemId for filtering unexplored connections
    if (systemId) {
      line.userData.systemId = systemId;
      line.userData.type = "unexploredConnection";
    }

    this.connections.add(line);
  }

  /**
   * Create a small purple sphere at the end of an undiscovered tunnel
   */
  private createUndiscoveredEndpoint(
    position: THREE.Vector3,
    gateId?: string,
    systemId?: string,
    pulsePhase?: number
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
      systemId: systemId, // Store system ID for filtering
    };

    // Add pulsing animation data - preserve existing phase if provided
    sphere.userData.pulsePhase =
      pulsePhase !== undefined ? pulsePhase : Math.random() * Math.PI * 2;

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
    glowMesh.userData = {
      type: "undiscoveredEndpointGlow",
      systemId: systemId, // Also store on glow for filtering
    };
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
    this.starMaterials = []; // Clear star materials tracking
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

        // Store initial position for calculating delta movement
        this.draggedNodePreviousPosition.copy(this.draggedNode.position);

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
        // Calculate how much the star moved
        const delta = new THREE.Vector3()
          .copy(intersectPoint)
          .add(this.dragOffset)
          .sub(this.draggedNodePreviousPosition);

        // Move the star node to the new position (with offset)
        this.draggedNode.position.copy(intersectPoint).add(this.dragOffset);

        // Move all mystery endpoints attached to this star by the same delta
        const draggedSystemId = this.draggedNode.userData.systemId;
        if (draggedSystemId) {
          for (const unexploredGate of this.unexploredGatesList) {
            if (unexploredGate.systemId === draggedSystemId) {
              const currentPos = this.mysteryPositions.get(
                unexploredGate.gateId
              );
              if (currentPos) {
                currentPos.add(delta);
              } else {
                // Initialize with the delta applied
                const newPos = unexploredGate.position.clone().add(delta);
                this.mysteryPositions.set(unexploredGate.gateId, newPos);
              }
            }
          }
        }

        // Update previous position for next frame
        this.draggedNodePreviousPosition.copy(this.draggedNode.position);

        // Update connections that involve this node (including mystery pathways)
        this.updateConnections();
        // Restore visibility rules after updating connections
        this.updateUnexploredGatesVisibility();
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
        // Restore visibility rules after updating connections
        this.updateUnexploredGatesVisibility();
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
    // Save pulse phases before clearing to preserve animation state
    const savedPulsePhases = new Map<string, number>();
    this.connections.traverse((child) => {
      if (
        child.userData.type === "undiscoveredEndpoint" &&
        child.userData.gateId &&
        child.userData.pulsePhase !== undefined
      ) {
        savedPulsePhases.set(child.userData.gateId, child.userData.pulsePhase);
      }
    });

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
            // Explored connections: solid line with color based on status
            this.createConnectionLine(fromPos, toPos, true, undefined, connection.status);
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

        // Draw mystery path (purple dashed line) WITH systemId for filtering
        this.createConnectionLine(
          fromGroup.position,
          currentPos,
          false,
          unexploredGate.systemId
        );

        // Get saved pulse phase to maintain animation continuity
        const savedPhase = savedPulsePhases.get(unexploredGate.gateId);

        // Add purple sphere at endpoint with gateId, systemId, AND preserved pulse phase
        this.createUndiscoveredEndpoint(
          currentPos,
          unexploredGate.gateId,
          unexploredGate.systemId,
          savedPhase
        );
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
   * Check if two line segments intersect in 2D (X-Z plane in scene space)
   */
  private doLinesIntersect2D(
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    p3: THREE.Vector3,
    p4: THREE.Vector3
  ): boolean {
    const det = (p2.x - p1.x) * (p4.z - p3.z) - (p4.x - p3.x) * (p2.z - p1.z);
    if (Math.abs(det) < 0.0001) return false; // Parallel lines

    const t =
      ((p3.x - p1.x) * (p4.z - p3.z) - (p4.x - p3.x) * (p3.z - p1.z)) / det;
    const u =
      ((p3.x - p1.x) * (p2.z - p1.z) - (p2.x - p1.x) * (p3.z - p1.z)) / det;

    // Check if intersection is within both line segments
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  /**
   * Count how many existing connections a new line would cross
   */
  private countLineCrossings(
    fromPos: THREE.Vector3,
    toPos: THREE.Vector3
  ): number {
    let crossings = 0;

    // Check against all connection lines
    this.connections.traverse((child) => {
      if (child instanceof THREE.Line) {
        const positions = child.geometry.attributes.position;
        if (positions && positions.count >= 2) {
          const lineStart = new THREE.Vector3(
            positions.getX(0),
            positions.getY(0),
            positions.getZ(0)
          );
          const lineEnd = new THREE.Vector3(
            positions.getX(1),
            positions.getY(1),
            positions.getZ(1)
          );

          if (this.doLinesIntersect2D(fromPos, toPos, lineStart, lineEnd)) {
            crossings++;
          }
        }
      }
    });

    return crossings;
  }

  /**
   * Count how many stars are in a given direction (cluster detection)
   */
  private countStarsInDirection(
    fromPos: THREE.Vector3,
    toPos: THREE.Vector3,
    maxDistance: number = 75 // Scene units (15 LY * 5 scale)
  ): number {
    const targetDx = toPos.x - fromPos.x;
    const targetDz = toPos.z - fromPos.z;
    const targetAngle = Math.atan2(targetDz, targetDx);

    let count = 0;
    for (const node of this.nodes.values()) {
      if (node.position.equals(fromPos)) continue;

      const dx = node.position.x - fromPos.x;
      const dz = node.position.z - fromPos.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance > maxDistance) continue;

      const angle = Math.atan2(dz, dx);
      let angleDiff = Math.abs(angle - targetAngle);
      if (angleDiff > Math.PI) {
        angleDiff = 2 * Math.PI - angleDiff;
      }

      // Count stars within 45 degrees of the target direction
      if (angleDiff < Math.PI / 4) {
        count++;
      }
    }

    return count;
  }

  /**
   * Adjust position to avoid overlapping with existing stars and minimize line crossings
   * Heavily emphasizes free space and avoiding clusters
   */
  private adjustPositionToAvoidOverlap(
    position: THREE.Vector3,
    existingPositions: THREE.Vector3[],
    sourcePosition?: THREE.Vector3
  ): THREE.Vector3 {
    const adjustedPosition = position.clone();
    let attempts = 0;
    const maxAttempts = 64; // Try more positions
    let bestPosition = adjustedPosition.clone();
    let bestScore = Infinity;

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
        // Position is valid, now score it
        let score = 0;

        if (sourcePosition) {
          // 1. Prefer moderate distances
          const distance = adjustedPosition.distanceTo(sourcePosition);
          const idealDistance = 22.5; // 4.5 LY * 5 scale
          score += Math.abs(distance - idealDistance) * 1.5;

          // 2. VERY heavy penalty for visual line crossings
          const crossings = this.countLineCrossings(
            sourcePosition,
            adjustedPosition
          );
          score += crossings * 200;

          // 3. Heavy penalty for directions towards star clusters
          const starsInDirection = this.countStarsInDirection(
            sourcePosition,
            adjustedPosition,
            75 // 15 LY * 5 scale
          );
          score += starsInDirection * 50;

          // 4. Penalize proximity to existing lines
          let minLineDistance = Infinity;
          this.connections.traverse((child) => {
            if (child instanceof THREE.Line) {
              const positions = child.geometry.attributes.position;
              if (positions && positions.count >= 2) {
                const lineStart = new THREE.Vector3(
                  positions.getX(0),
                  positions.getY(0),
                  positions.getZ(0)
                );
                const lineEnd = new THREE.Vector3(
                  positions.getX(1),
                  positions.getY(1),
                  positions.getZ(1)
                );

                // Calculate distance in XZ plane
                const dx = adjustedPosition.x;
                const dz = adjustedPosition.z;
                const lsx = lineStart.x;
                const lsz = lineStart.z;
                const lex = lineEnd.x;
                const lez = lineEnd.z;

                const lineDx = lex - lsx;
                const lineDz = lez - lsz;
                const lengthSq = lineDx * lineDx + lineDz * lineDz;

                if (lengthSq > 0.001) {
                  const t = Math.max(
                    0,
                    Math.min(
                      1,
                      ((dx - lsx) * lineDx + (dz - lsz) * lineDz) / lengthSq
                    )
                  );
                  const closestX = lsx + t * lineDx;
                  const closestZ = lsz + t * lineDz;
                  const dist = Math.sqrt(
                    (dx - closestX) ** 2 + (dz - closestZ) ** 2
                  );
                  minLineDistance = Math.min(minLineDistance, dist);
                }
              }
            }
          });

          if (minLineDistance < 20) {
            // Less than 4 LY
            score += (20 - minLineDistance) * 3;
          }
        }

        // Track best position found
        if (score < bestScore) {
          bestScore = score;
          bestPosition.copy(adjustedPosition);
        }

        // If we found a perfect position (no crossings, no clusters), use it immediately
        if (score < 10) {
          return adjustedPosition;
        }

        // If we've tried enough positions and have a decent one, use it
        if (attempts > 20 && bestScore < 150) {
          return bestPosition;
        }
      }

      // Try next position in spiral pattern with tighter spacing
      const angle = attempts * 0.618 * Math.PI * 2; // Golden angle for better distribution
      const radius = this.MIN_STAR_DISTANCE * (1 + attempts * 0.2);
      adjustedPosition.x = position.x + Math.cos(angle) * radius;
      adjustedPosition.z = position.z + Math.sin(angle) * radius;
      // Keep y relatively similar to avoid too much vertical spread
      adjustedPosition.y =
        position.y + Math.sin(attempts) * this.MIN_STAR_DISTANCE * 0.15;

      attempts++;
    }

    // Return best position found, or adjusted position if nothing good was found
    return bestScore < Infinity ? bestPosition : adjustedPosition;
  }

  /**
   * Handle click on a star node - two-click system: first selects, second travels
   * Returns: { systemId, action: 'select' | 'travel' } or null
   */
  onStarClick(
    event: MouseEvent,
    camera: THREE.Camera,
    raycaster: THREE.Raycaster
  ): { systemId: string; action: "select" | "travel" } | null {
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

        // Check if this is the already-selected system (second click = travel)
        if (systemId === this.selectedSystemId) {
          // Second click on selected system = exit to system view
          // Even if it's the current system, allow it to exit constellation view
          return { systemId, action: "travel" };
        } else {
          // First click = select (allowed for any system, including current)
          this.selectSystem(systemId);
          return { systemId, action: "select" };
        }
      }
    }

    return null;
  }

  /**
   * Select a system in the constellation view
   * Public method to allow external selection (e.g., from home button)
   */
  selectSystem(systemId: string): void {
    const oldSelectedId = this.selectedSystemId;
    this.selectedSystemId = systemId;

    // Update visual style of previously selected system (if any)
    if (oldSelectedId) {
      const oldNode = this.nodesList.find((n) => n.systemId === oldSelectedId);
      const oldGroup = this.nodes.get(oldSelectedId);
      if (oldNode && oldGroup) {
        this.updateStarNodeVisual(oldGroup, oldNode);
      }
    }

    // Update visual style of newly selected system
    const newNode = this.nodesList.find((n) => n.systemId === systemId);
    const newGroup = this.nodes.get(systemId);
    if (newNode && newGroup) {
      this.updateStarNodeVisual(newGroup, newNode);
    }

    // Update unexplored gates to only show for selected system
    this.updateUnexploredGatesVisibility();
  }

  /**
   * Update the visual appearance of a star node
   */
  private updateStarNodeVisual(
    group: THREE.Group,
    node: ConstellationNode
  ): void {
    // Clear existing children
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }

    // Rebuild the star visual - consistent size regardless of selection
    const color = new THREE.Color(node.starColor);
    const colorHex = color.getHex();
    const starSize = this.STAR_SIZE;

    // Create star sphere with shader material
    const starGeometry = new THREE.SphereGeometry(starSize, 32, 32);
    const starMaterial = this.materialFactory.createStarMaterial(colorHex);
    const starMesh = new THREE.Mesh(starGeometry, starMaterial);
    group.add(starMesh);

    // Track material for animation updates
    this.starMaterials.push(starMaterial);

    // No geometry-based glow layers - using shader-based transparent edge glow instead

    // Add companion stars for binary/trinary systems
    if (node.companionStars && node.companionStars.length > 0) {
      const companionSize = starSize * 0.6; // Smaller than primary
      const companionDistance = starSize * 2.5; // Distance from primary

      node.companionStars.forEach((companion, index) => {
        const companionColor = new THREE.Color(companion.color);
        const companionColorHex = companionColor.getHex();

        // Position companions in a circle around the primary
        // For binary: one on the right
        // For trinary: positioned at 120 degree intervals
        let angle: number;
        if (node.companionStars!.length === 1) {
          angle = 0; // Binary: companion to the right
        } else {
          angle =
            (index * 2 * Math.PI) / node.companionStars!.length + Math.PI / 6;
        }

        const offsetX = Math.cos(angle) * companionDistance;
        const offsetZ = Math.sin(angle) * companionDistance;

        // Create companion star sphere
        const companionGeometry = new THREE.SphereGeometry(
          companionSize,
          24,
          24
        );
        const companionMaterial =
          this.materialFactory.createStarMaterial(companionColorHex);
        const companionMesh = new THREE.Mesh(
          companionGeometry,
          companionMaterial
        );
        companionMesh.position.set(offsetX, 0, offsetZ);
        group.add(companionMesh);

        // Track material for animation updates
        this.starMaterials.push(companionMaterial);

        // No geometry-based glow layers - using shader-based transparent edge glow instead
      });
    }

    // Calculate connection stats for this system
    const exploredGates = this.connectionsList.filter(
      (c) => c.fromSystemId === node.systemId && c.isExplored
    ).length;
    const totalGates =
      this.connectionsList.filter((c) => c.fromSystemId === node.systemId)
        .length +
      this.unexploredGatesList.filter((g) => g.systemId === node.systemId)
        .length;

    // Add text label with connection stats
    this.createLabel(
      group,
      node,
      starSize,
      exploredGates,
      totalGates
    );
  }

  /**
   * Get the currently selected system ID
   */
  getSelectedSystemId(): string | null {
    return this.selectedSystemId;
  }

  /**
   * Get the position of a star node
   */
  getNodePosition(systemId: string): THREE.Vector3 | null {
    const node = this.nodes.get(systemId);
    return node ? node.position.clone() : null;
  }

  /**
   * Clear the selection (reset to current system)
   */
  clearSelection(): void {
    if (this.currentSystemId) {
      this.selectSystem(this.currentSystemId);
    }
  }

  /**
   * Update visibility of unexplored gates based on selected system
   * Only shows mystery pathways for the currently selected star
   */
  private updateUnexploredGatesVisibility(): void {
    this.connections.traverse((child) => {
      // Handle unexplored endpoints (purple spheres)
      if (
        child.userData.type === "undiscoveredEndpoint" ||
        child.userData.type === "undiscoveredEndpointGlow"
      ) {
        if (child.userData.systemId) {
          // Only show if this gate belongs to the selected system
          child.visible = child.userData.systemId === this.selectedSystemId;
        }
      }
      // Handle unexplored connection lines
      else if (child.userData.type === "unexploredConnection") {
        if (child.userData.systemId) {
          // Only show if this connection belongs to the selected system
          child.visible = child.userData.systemId === this.selectedSystemId;
        }
      }
    });
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

    // Get all visible unexplored endpoint spheres
    const unexploredEndpoints: THREE.Object3D[] = [];
    this.connections.traverse((object) => {
      if (
        object.userData.type === "undiscoveredEndpoint" &&
        object.userData.gateId &&
        object.visible
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

  /**
   * Update star material animations
   * Should be called in the animation loop
   */
  updateStarAnimations(time: number): void {
    for (const material of this.starMaterials) {
      material.uniforms.time.value = time;
    }
  }
}
