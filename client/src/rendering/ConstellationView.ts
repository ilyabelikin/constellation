import * as THREE from "three";
import {
  ConstellationNode,
  ConstellationConnection,
  UnexploredGate,
  GateStatusType,
} from "@constellation/shared";
import { MaterialFactory } from "./MaterialFactory.js";
import { DysonSwarmFactory } from "./DysonSwarmFactory.js";
import {
  SOLAR_RADIUS,
  calculateMaxDysonSwarms,
} from "../../../shared/src/constants.js";

/**
 * Renders a constellation view showing connected star systems
 */
export class ConstellationView {
  private scene: THREE.Scene;
  private nodes: Map<string, THREE.Group> = new Map();
  private connections: THREE.Group = new THREE.Group();
  private currentSystemId: string | null = null;
  private selectedSystemId: string | null = null; // Track selected system (starts as current system)
  private homePlanetId: string | null = null; // Track home planet for special marking
  private homeSystemId: string | null = null; // Track home system for pathfinding

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

  // Dyson swarm satellites
  private dysonSwarmFactory: DysonSwarmFactory;
  private dysonSatellites: Map<
    string,
    {
      satellites: THREE.Group[];
      starId: string;
      systemId: string;
      starOffset: THREE.Vector3;
    }
  > = new Map(); // Key is swarmKey (systemId-starId-swarmIndex)

  // Path to home animation
  private pathToHomePulses: THREE.Mesh[] = [];
  private pathToHomeLines: THREE.Line[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.connections.name = "constellationConnections";
    this.materialFactory = new MaterialFactory();
    this.dysonSwarmFactory = new DysonSwarmFactory();
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
    preserveSelectedSystemId?: string | null,
    homePlanetId?: string | null,
    homeSystemId?: string | null
  ): void {
    this.clear();
    this.currentSystemId = currentSystemId;
    // Preserve selection if provided, otherwise auto-select current system
    this.selectedSystemId = preserveSelectedSystemId || currentSystemId;
    this.connectionsList = connectionsList;
    this.nodesList = nodes;
    this.homePlanetId = homePlanetId || null;
    this.homeSystemId = homeSystemId || null;

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
          // Use tunnel gate statuses if available for split-color visualization
          this.createConnectionLine(
            fromPos,
            toPos,
            true,
            undefined,
            connection.status,
            connection.gateAStatus,
            connection.gateBStatus
          );
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

    // Create Dyson swarm satellites for each system
    this.createDysonSatellites(nodes);

    // Properly select the system to trigger animations (like path-to-home)
    // This ensures the animation shows regardless of how constellation view was opened
    // Note: selectSystem() will also update unexplored gates visibility
    if (this.selectedSystemId) {
      this.selectSystem(this.selectedSystemId);
    }
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
    // Store primary star ID for Dyson swarm positioning
    starMesh.userData = {
      starId: node.starId,
      starRadius: starSize,
    };
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
        // Store companion star ID and size for Dyson swarm positioning
        companionMesh.userData = {
          starId: companion.id,
          starRadius: companionSize,
        };
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
    this.createLabel(group, node, starSize, exploredGates, totalGates);

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
    context.font = isSelected
      ? `bold ${nameFontSize}px Arial`
      : `${nameFontSize}px Arial`;

    // Wrap text if needed
    const words = node.systemName.split(" ");
    const lines: string[] = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const testLine = currentLine + " " + words[i];
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
    const circleHeight = node.habitablePlanetCount > 0 ? 45 : 0; // Add space for circles if there are habitable planets (includes circle position below stats + radius + outline)
    const canvasHeight = Math.ceil(
      lines.length * lineHeight + statsHeight + circleHeight + padding * 2
    );

    // Set canvas size
    canvas.width = 512;
    canvas.height = canvasHeight;

    // Draw transparent background
    context.fillStyle = "rgba(0, 0, 0, 0)";
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Draw star name (possibly multi-line) with stroke for readability
    context.font = isSelected
      ? `bold ${nameFontSize}px Arial`
      : `${nameFontSize}px Arial`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 4;
    context.strokeStyle = "rgba(0, 0, 0, 0.8)";

    const startY = padding + lineHeight / 2;
    for (let i = 0; i < lines.length; i++) {
      const y = startY + i * lineHeight;
      // Draw stroke first
      context.strokeText(lines[i], canvas.width / 2, y);
      // Then draw fill
      context.fillStyle = isSelected ? "#ffffff" : "#aaaaaa";
      context.fillText(lines[i], canvas.width / 2, y);
    }

    // Draw connection stats below name with stroke for readability
    context.font = `${statsFontSize}px Arial`;
    const statsY = startY + lines.length * lineHeight + statsHeight / 2;
    const statsText = `${exploredGates}/${totalGates}`;

    // Draw stroke first
    context.lineWidth = 3;
    context.strokeStyle = "rgba(0, 0, 0, 0.8)";
    context.strokeText(statsText, canvas.width / 2, statsY);

    // Then draw fill
    context.fillStyle = isSelected ? "#cccccc" : "#888888";
    context.fillText(statsText, canvas.width / 2, statsY);

    // Draw habitable planet circles below connection stats
    if (node.habitablePlanetCount > 0) {
      const circleY = statsY + statsHeight / 2 + 15; // Position below stats
      const circleRadius = 6;
      const circleSpacing = 20; // Increased spacing for easier clicking
      const totalWidth =
        node.habitablePlanetCount * circleSpacing -
        circleSpacing +
        circleRadius * 2;
      const startX = (canvas.width - totalWidth) / 2 + circleRadius;

      for (let i = 0; i < node.habitablePlanetCount; i++) {
        const x = startX + i * circleSpacing;
        
        // Get planet info and check colonization status
        const planet = node.habitablePlanets?.[i];
        const isColonized = planet?.isColonized || false;

        // Check if this is the home planet
        const isHomePlanet =
          planet && this.homePlanetId && planet.planetId === this.homePlanetId;

        // Draw orange outer circle for home planet
        if (isHomePlanet) {
          context.beginPath();
          context.arc(x, circleY, circleRadius + 3, 0, Math.PI * 2);
          context.strokeStyle = "#FF8C00"; // Dark orange
          context.lineWidth = 2.5;
          context.stroke();
        }

        if (isColonized) {
          // Filled circle for colonized habitable planets with dark outline
          // Draw dark outline first
          context.beginPath();
          context.arc(x, circleY, circleRadius + 1, 0, Math.PI * 2);
          context.fillStyle = "rgba(0, 0, 0, 0.8)";
          context.fill();

          // Draw green fill
          context.beginPath();
          context.arc(x, circleY, circleRadius, 0, Math.PI * 2);
          context.fillStyle = "#10b981"; // Green
          context.fill();
        } else {
          // Empty donut circle for uncolonized habitable planets with dark outline
          // Draw dark outline first
          context.beginPath();
          context.arc(x, circleY, circleRadius, 0, Math.PI * 2);
          context.strokeStyle = "rgba(0, 0, 0, 0.8)";
          context.lineWidth = 4;
          context.stroke();

          // Draw green ring
          context.beginPath();
          context.arc(x, circleY, circleRadius, 0, Math.PI * 2);
          context.strokeStyle = "#10b981"; // Green
          context.lineWidth = 2;
          context.stroke();
        }
      }
    }

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

    // Create clickable sprites for habitable planet circles
    if (node.habitablePlanets && node.habitablePlanets.length > 0) {
      const circleY = statsY + statsHeight / 2 + 15; // Position below stats (same as drawn circles)
      const circleRadius = 6;
      const circleSpacing = 20; // Increased spacing for easier clicking
      const totalWidth =
        node.habitablePlanets.length * circleSpacing -
        circleSpacing +
        circleRadius * 2;
      const startX = (canvas.width - totalWidth) / 2 + circleRadius;

      for (let i = 0; i < node.habitablePlanets.length; i++) {
        const planet = node.habitablePlanets[i];
        const canvasX = startX + i * circleSpacing;

        // Convert canvas pixel coordinates to world coordinates
        // Canvas coordinates: (0,0) is top-left, y increases downward
        // World coordinates: (0,0) is center, y increases upward
        const pixelOffsetX = canvasX - canvas.width / 2;
        const pixelOffsetY = circleY - canvasHeight / 2;

        // Convert to world units using sprite dimensions
        const worldX = (pixelOffsetX / canvas.width) * spriteWidth;
        const worldY = -(pixelOffsetY / canvasHeight) * spriteHeight; // Negative because canvas y is flipped

        // Create a small canvas for the clickable area
        const clickCanvas = document.createElement("canvas");
        clickCanvas.width = 32;
        clickCanvas.height = 32;
        const clickContext = clickCanvas.getContext("2d");
        if (clickContext) {
          // Draw a small circle (invisible but used for hitbox)
          clickContext.fillStyle = "rgba(255, 255, 255, 0.01)"; // Nearly invisible but still renders
          clickContext.beginPath();
          clickContext.arc(16, 16, 14, 0, Math.PI * 2);
          clickContext.fill();

          const clickTexture = new THREE.CanvasTexture(clickCanvas);
          const clickMaterial = new THREE.SpriteMaterial({
            map: clickTexture,
            transparent: true,
            opacity: 1.0, // Keep at 1.0 since the canvas itself has low opacity
            depthTest: false,
          });

          const clickSprite = new THREE.Sprite(clickMaterial);
          // Position relative to the star (parent origin), accounting for label position
          clickSprite.position.set(worldX, offset + 10 + worldY, 0);

          // Make sprite slightly larger than the visible circle for easier clicking
          const clickSize = circleRadius * (spriteWidth / canvas.width) * 2.5;
          clickSprite.scale.set(clickSize, clickSize, 1);

          // Store planet information
          clickSprite.userData = {
            type: "habitablePlanetCircle",
            systemId: node.systemId,
            planetId: planet.planetId,
            planetName: planet.planetName,
            isColonized: planet.isColonized,
          };

          clickSprite.renderOrder = 999; // Render before the label sprite

          parent.add(clickSprite);
        }
      }
    }
  }

  /**
   * Create a connection line between two stars
   * Can show split colors for each end of the tunnel
   */
  private createConnectionLine(
    from: THREE.Vector3,
    to: THREE.Vector3,
    isExplored: boolean,
    systemId?: string,
    status?: GateStatusType,
    gateAStatus?: GateStatusType,
    gateBStatus?: GateStatusType
  ): void {
    // Create a thick line using cylinder geometry (LineBasicMaterial linewidth doesn't work)
    const direction = new THREE.Vector3().subVectors(to, from);
    const length = direction.length();
    const midpoint = new THREE.Vector3()
      .addVectors(from, to)
      .multiplyScalar(0.5);

    const thickness = isExplored ? 0.3 : 0.2;
    const opacity = isExplored ? 0.7 : 0.5;

    // Helper function to get color from status
    const getColor = (statusValue?: GateStatusType): number => {
      if (!isExplored || statusValue === "unexplored") {
        return 0x8800ff; // Purple for unexplored
      } else if (statusValue === "owned_by_self") {
        return 0xfbbf24; // Orange/Yellow for owned by self
      } else if (statusValue === "neutral") {
        return 0x9ca3af; // Gray for neutral
      } else if (statusValue === "friendly") {
        return 0x10b981; // Green for friendly
      } else if (statusValue === "aggressive") {
        return 0xef4444; // Red for aggressive
      } else {
        // Default to orange for explored but no status info
        return 0xfbbf24;
      }
    };

    // If we have both gate statuses, create a split-colored line
    if (gateAStatus && gateBStatus && gateAStatus !== gateBStatus) {
      // Create two half-cylinders with different colors
      const halfLength = length / 2;

      // First half (from start to midpoint)
      const geometry1 = new THREE.CylinderGeometry(
        thickness,
        thickness,
        halfLength,
        8
      );
      const color1 = getColor(gateAStatus);
      const material1 = new THREE.MeshBasicMaterial({
        color: color1,
        transparent: true,
        opacity: opacity,
      });
      const line1 = new THREE.Mesh(geometry1, material1);

      // Position first half
      const quarterPoint = new THREE.Vector3()
        .addVectors(from, midpoint)
        .multiplyScalar(0.5);
      line1.position.copy(quarterPoint);
      line1.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.normalize()
      );

      // Second half (from midpoint to end)
      const geometry2 = new THREE.CylinderGeometry(
        thickness,
        thickness,
        halfLength,
        8
      );
      const color2 = getColor(gateBStatus);
      const material2 = new THREE.MeshBasicMaterial({
        color: color2,
        transparent: true,
        opacity: opacity,
      });
      const line2 = new THREE.Mesh(geometry2, material2);

      // Position second half
      const threeQuarterPoint = new THREE.Vector3()
        .addVectors(midpoint, to)
        .multiplyScalar(0.5);
      line2.position.copy(threeQuarterPoint);
      line2.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.normalize()
      );

      // Store metadata
      if (systemId) {
        line1.userData.systemId = systemId;
        line1.userData.type = "unexploredConnection";
        line2.userData.systemId = systemId;
        line2.userData.type = "unexploredConnection";
      }

      this.connections.add(line1);
      this.connections.add(line2);
    } else {
      // Single color line (original behavior)
      const geometry = new THREE.CylinderGeometry(
        thickness,
        thickness,
        length,
        8
      );

      // Use gateAStatus if available, otherwise fall back to status
      const color = getColor(gateAStatus || status);

      const material = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
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
  update(deltaTime: number, currentTime: number = 0): void {
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

    // Update Dyson satellite positions
    for (const [swarmKey, swarmData] of this.dysonSatellites.entries()) {
      const starGroup = this.nodes.get(swarmData.systemId);
      if (!starGroup) continue;

      // Update satellite orbital positions
      this.dysonSwarmFactory.updateSatellitePositions(
        swarmData.satellites,
        currentTime
      );

      // Position satellites relative to star group's current position + star offset
      for (const satellite of swarmData.satellites) {
        // Get the local position from the factory update
        const localPos = satellite.position.clone();
        // Add both the star offset (for companion stars) and the star group's world position
        satellite.position
          .copy(localPos)
          .add(swarmData.starOffset)
          .add(starGroup.position);
      }
    }

    // Update path to home pulse animations
    this.updatePathToHomePulses(deltaTime);
  }

  /**
   * Create Dyson swarm satellites for systems that have them
   */
  private createDysonSatellites(nodes: ConstellationNode[]): void {
    for (const node of nodes) {
      if (!node.dysonSwarms || node.dysonSwarms.length === 0) continue;

      const starGroup = this.nodes.get(node.systemId);
      if (!starGroup) continue;

      // For each star in the system that has Dyson swarms
      for (const dysonSwarm of node.dysonSwarms) {
        const { starId, count } = dysonSwarm;

        // Find the star mesh (primary or companion) and its position offset
        let starRadius = this.STAR_SIZE;
        let starOffset = new THREE.Vector3(0, 0, 0); // Offset from group center

        // Check all children of the star group to find the matching star
        let foundStar = false;
        for (const child of starGroup.children) {
          if (
            child instanceof THREE.Mesh &&
            child.geometry instanceof THREE.SphereGeometry &&
            child.userData.starId
          ) {
            // Check if this star's ID matches the Dyson swarm's star ID
            if (child.userData.starId === starId) {
              starRadius = child.userData.starRadius || this.STAR_SIZE;
              starOffset.copy(child.position);
              foundStar = true;
              break;
            }
          }
        }

        if (!foundStar) continue;

        // In constellation view, use actual count as max
        // This ensures few swarms are concentrated, many swarms spread out
        // At max capacity, they'll fully cover the star
        const maxSwarms = count; // Use actual count for natural progression

        // Create satellites for each swarm (up to count)
        for (let i = 0; i < count; i++) {
          const satelliteMeshes = this.dysonSwarmFactory.createSwarmSatellites(
            i,
            starRadius,
            0, // Start time - will be updated in update loop
            maxSwarms // Pass actual count for proper distribution
          );

          // Position satellites relative to star group position + star offset
          for (const satellite of satelliteMeshes) {
            // Satellites are created in local space relative to star center
            // Add both the star group position and the star's offset within the group
            satellite.position.add(starOffset).add(starGroup.position);
            this.scene.add(satellite);
          }

          // Store satellites for updates and cleanup with star offset
          const swarmKey = `${node.systemId}-${starId}-${i}`;
          this.dysonSatellites.set(swarmKey, {
            satellites: satelliteMeshes,
            starId: starId,
            systemId: node.systemId,
            starOffset: starOffset.clone(), // Store the offset for update loop
          });
        }
      }
    }

    console.log(
      `Created Dyson satellites for ${this.dysonSatellites.size} swarms in constellation view`
    );
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

    // Remove all Dyson satellites
    for (const swarmData of this.dysonSatellites.values()) {
      for (const satellite of swarmData.satellites) {
        satellite.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            }
          }
        });
        this.scene.remove(satellite);
      }
    }
    this.dysonSatellites.clear();

    // Clear path to home animation
    this.clearPathToHomeAnimation();

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
            this.createConnectionLine(
              fromPos,
              toPos,
              true,
              undefined,
              connection.status,
              connection.gateAStatus,
              connection.gateBStatus
            );
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

    // Create path to home animation if this is not the home system
    if (systemId !== this.homeSystemId && this.homeSystemId) {
      const path = this.findPathToHome(systemId);
      if (path) {
        this.createPathToHomeAnimation(path);
      } else {
        // No path found, clear any existing animation
        this.clearPathToHomeAnimation();
      }
    } else {
      // Selected home system, clear animation
      this.clearPathToHomeAnimation();
    }
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
        // Store companion star ID and size for Dyson swarm positioning
        companionMesh.userData = {
          starId: companion.id,
          starRadius: companionSize,
        };
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
    this.createLabel(group, node, starSize, exploredGates, totalGates);
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
   * Handle click on a habitable planet circle
   * Returns: { systemId, planetId, planetName } or null
   */
  onPlanetCircleClick(
    event: MouseEvent,
    camera: THREE.Camera,
    raycaster: THREE.Raycaster
  ): { systemId: string; planetId: string; planetName: string } | null {
    // Update raycaster
    const mouse = new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);

    // Check for intersections with planet circles
    const nodeArray = Array.from(this.nodes.values());
    const intersects = raycaster.intersectObjects(nodeArray, true);

    if (intersects.length > 0) {
      // Find the first object with planet circle data
      for (const intersect of intersects) {
        if (intersect.object.userData.type === "habitablePlanetCircle") {
          const userData = intersect.object.userData;
          console.log(
            `Planet circle clicked: ${userData.planetName} in system ${userData.systemId}`
          );
          return {
            systemId: userData.systemId,
            planetId: userData.planetId,
            planetName: userData.planetName,
          };
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

  /**
   * Find the shortest path from a system to the home system using BFS
   * Returns an array of system IDs representing the path (including start and end)
   */
  private findPathToHome(fromSystemId: string): string[] | null {
    if (!this.homeSystemId || fromSystemId === this.homeSystemId) {
      return null;
    }

    // Build adjacency list from connections (only explored connections)
    const adjacencyList = new Map<string, string[]>();
    for (const connection of this.connectionsList) {
      if (connection.isExplored) {
        // Add bidirectional edges
        if (!adjacencyList.has(connection.fromSystemId)) {
          adjacencyList.set(connection.fromSystemId, []);
        }
        if (!adjacencyList.has(connection.toSystemId)) {
          adjacencyList.set(connection.toSystemId, []);
        }
        adjacencyList.get(connection.fromSystemId)!.push(connection.toSystemId);
        adjacencyList.get(connection.toSystemId)!.push(connection.fromSystemId);
      }
    }

    // BFS to find shortest path
    const queue: { systemId: string; path: string[] }[] = [
      { systemId: fromSystemId, path: [fromSystemId] },
    ];
    const visited = new Set<string>([fromSystemId]);

    while (queue.length > 0) {
      const { systemId, path } = queue.shift()!;

      // Check if we reached home
      if (systemId === this.homeSystemId) {
        return path;
      }

      // Explore neighbors
      const neighbors = adjacencyList.get(systemId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({
            systemId: neighbor,
            path: [...path, neighbor],
          });
        }
      }
    }

    // No path found
    return null;
  }

  /**
   * Create animated pulses along the path to home
   */
  private createPathToHomeAnimation(path: string[]): void {
    // Clear existing path animation
    this.clearPathToHomeAnimation();

    if (path.length < 2) return;

    // Create highlighted connection lines along the path
    for (let i = 0; i < path.length - 1; i++) {
      const fromNode = this.nodes.get(path[i]);
      const toNode = this.nodes.get(path[i + 1]);

      if (fromNode && toNode) {
        const fromPos = fromNode.position;
        const toPos = toNode.position;

        // Create a glowing line along the path
        const points = [fromPos, toPos];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
          color: 0xfbbf24, // Orange color for path (same as owned pathways)
          linewidth: 3,
          transparent: true,
          opacity: 0.4,
        });
        const line = new THREE.Line(geometry, material);
        this.pathToHomeLines.push(line);
        this.scene.add(line);
      }
    }

    // Calculate total path length
    let totalPathLength = 0;
    const segmentLengths: number[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const fromNode = this.nodes.get(path[i]);
      const toNode = this.nodes.get(path[i + 1]);
      if (fromNode && toNode) {
        const segmentLength = fromNode.position.distanceTo(toNode.position);
        segmentLengths.push(segmentLength);
        totalPathLength += segmentLength;
      }
    }

    // Create particles uniformly distributed by distance along the entire path
    const particleSpacing = 5.0; // Uniform spacing in world units
    const numParticles = Math.floor(totalPathLength / particleSpacing);

    for (let i = 0; i < numParticles; i++) {
      // Calculate distance along path for this particle
      const targetDistance = (i / numParticles) * totalPathLength;

      // Find which segment this distance falls into
      let accumulatedDistance = 0;
      let segmentIndex = 0;
      let progressInSegment = 0;

      for (let j = 0; j < segmentLengths.length; j++) {
        const segmentLength = segmentLengths[j];
        if (accumulatedDistance + segmentLength >= targetDistance) {
          // This is the segment
          segmentIndex = j;
          progressInSegment = (targetDistance - accumulatedDistance) / segmentLength;
          break;
        }
        accumulatedDistance += segmentLength;
      }

      const fromNode = this.nodes.get(path[segmentIndex]);
      const toNode = this.nodes.get(path[segmentIndex + 1]);

      if (!fromNode || !toNode) continue;

      const fromPos = fromNode.position;
      const toPos = toNode.position;

      // Create smaller particle
      const geometry = new THREE.SphereGeometry(0.5, 12, 12);
      const material = new THREE.MeshBasicMaterial({
        color: 0xfbbf24, // Orange color (same as owned pathways)
        transparent: true,
        opacity: 0.9,
      });
      const particle = new THREE.Mesh(geometry, material);

      // Store animation data
      particle.userData = {
        type: "pathToHomePulse",
        path: path,
        segmentIndex: segmentIndex,
        progress: progressInSegment,
        speed: 7.5 / segmentLengths[segmentIndex], // Normalize speed for current segment
      };

      // Position particle along the path
      particle.position.lerpVectors(fromPos, toPos, progressInSegment);

      this.pathToHomePulses.push(particle);
      this.scene.add(particle);

      // Add subtle glow
      const glowGeometry = new THREE.SphereGeometry(0.8, 12, 12);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xfbbf24, // Orange glow
        transparent: true,
        opacity: 0.3,
        side: THREE.BackSide,
      });
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      particle.add(glow);
    }
  }

  /**
   * Clear the path to home animation
   */
  private clearPathToHomeAnimation(): void {
    // Remove pulse particles
    for (const pulse of this.pathToHomePulses) {
      pulse.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
      this.scene.remove(pulse);
    }
    this.pathToHomePulses = [];

    // Remove path lines
    for (const line of this.pathToHomeLines) {
      line.geometry.dispose();
      if (line.material instanceof THREE.Material) {
        line.material.dispose();
      }
      this.scene.remove(line);
    }
    this.pathToHomeLines = [];
  }

  /**
   * Update path to home pulse animations
   */
  private updatePathToHomePulses(deltaTime: number): void {
    for (const particle of this.pathToHomePulses) {
      const userData = particle.userData;
      const path: string[] = userData.path;
      const speed = userData.speed;
      let segmentIndex = userData.segmentIndex;
      let progress = userData.progress;

      if (!path || path.length < 2) continue;

      // Update progress along current segment
      progress += speed * deltaTime;

      // If we've completed this segment, move to the next one
      if (progress >= 1.0) {
        segmentIndex++;
        progress = 0;

        // If we've reached the end of the path, loop back to the start
        if (segmentIndex >= path.length - 1) {
          segmentIndex = 0;
          progress = 0;
        }

        userData.segmentIndex = segmentIndex;
        userData.progress = progress;

        // Update speed for new segment
        const fromNode = this.nodes.get(path[segmentIndex]);
        const toNode = this.nodes.get(path[segmentIndex + 1]);
        if (fromNode && toNode) {
          const segmentLength = fromNode.position.distanceTo(toNode.position);
          userData.speed = 7.5 / segmentLength; // Normalize speed (half of original 15.0)
        }
      } else {
        userData.progress = progress;
      }

      // Update particle position
      const fromNode = this.nodes.get(path[segmentIndex]);
      const toNode = this.nodes.get(path[segmentIndex + 1]);

      if (fromNode && toNode) {
        const fromPos = fromNode.position;
        const toPos = toNode.position;

        // Interpolate position along current segment
        particle.position.lerpVectors(fromPos, toPos, progress);

        // Gentle pulsing scale effect
        const scale = 1 + Math.sin(progress * Math.PI * 2) * 0.2;
        particle.scale.set(scale, scale, scale);
      }
    }
  }
}
