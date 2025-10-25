import * as THREE from "three";
import {
  StarSystem,
  CelestialBodyState,
  SystemState,
  ShipState,
  ASTRONOMICAL_UNIT,
} from "@constellation/shared";

export class SceneManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;

  private bodies: Map<string, THREE.Mesh> = new Map();
  private ships: Map<string, THREE.Mesh> = new Map();
  private orbitLines: Map<string, THREE.Line> = new Map();
  private starMaterials: THREE.ShaderMaterial[] = [];
  private starfield: THREE.Points | null = null;

  // Store previous and target positions for smooth interpolation
  private bodyPreviousPositions: Map<string, THREE.Vector3> = new Map();
  private bodyTargetPositions: Map<string, THREE.Vector3> = new Map();

  private system: StarSystem | null = null;
  private selectedObjectId: string | null = null;
  private cameraTarget: THREE.Vector3 = new THREE.Vector3();
  private cameraDistance: number = 3000;
  private cameraTheta: number = Math.PI / 4; // Horizontal angle
  private cameraPhi: number = Math.PI / 4; // Vertical angle

  private isDragging: boolean = false;
  private previousMousePosition = { x: 0, y: 0 };

  private gameTime: number = 0; // Game time in seconds
  private lastServerTime: number = 0; // Last game time from server
  private lastUpdateRealTime: number = 0; // Real time when last update received
  private isPaused: boolean = true;
  private timeScale: number = 1;

  // Scale factor for visualization (1 AU = 1000 units in Three.js)
  private readonly SCALE = 1000 / ASTRONOMICAL_UNIT;
  // Multiplier for celestial body sizes (make them visible)
  private readonly BODY_SIZE_MULTIPLIER = 70;

  public onObjectSelected: ((objectId: string) => void) | null = null;

  getGameTime(): number {
    return this.gameTime;
  }

  getIsPaused(): boolean {
    return this.isPaused;
  }

  getTimeScale(): number {
    return this.timeScale;
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

    // Raycaster for object picking
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Add starfield background
    this.addStarfield();

    // Event listeners
    window.addEventListener("resize", () => this.onWindowResize());
    this.renderer.domElement.addEventListener("mousedown", (e: MouseEvent) =>
      this.onMouseDown(e)
    );
    this.renderer.domElement.addEventListener("mousemove", (e: MouseEvent) =>
      this.onMouseMove(e)
    );
    this.renderer.domElement.addEventListener("mouseup", () =>
      this.onMouseUp()
    );
    this.renderer.domElement.addEventListener("wheel", (e: WheelEvent) =>
      this.onMouseWheel(e)
    );
  }

  private addStarfield(): void {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const colors = [];
    const radius = 50000; // Sphere radius

    // Star color palette (different star types)
    const starColors = [
      { r: 0.6, g: 0.7, b: 1.0 }, // Blue (hot stars)
      { r: 0.8, g: 0.9, b: 1.0 }, // Blue-white
      { r: 1.0, g: 1.0, b: 1.0 }, // White
      { r: 1.0, g: 1.0, b: 0.9 }, // Yellowish-white
      { r: 1.0, g: 0.9, b: 0.7 }, // Yellow
      { r: 1.0, g: 0.8, b: 0.6 }, // Orange
      { r: 1.0, g: 0.7, b: 0.5 }, // Red-orange
    ];

    for (let i = 0; i < 10000; i++) {
      // Generate random point on sphere surface
      const theta = Math.random() * Math.PI * 2; // Azimuthal angle
      const phi = Math.acos(2 * Math.random() - 1); // Polar angle

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);

      vertices.push(x, y, z);

      // Random color from palette
      const color = starColors[Math.floor(Math.random() * starColors.length)];
      colors.push(color.r, color.g, color.b);
    }

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3)
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 5,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
    });
    this.starfield = new THREE.Points(geometry, material);
    this.scene.add(this.starfield);
  }

  loadSystem(system: StarSystem): void {
    this.system = system;
    this.clearScene();

    // Create star
    this.createStar(system.star);

    // Create planets
    for (const planet of system.planets) {
      this.createPlanet(planet);
    }

    // Create orbit lines
    for (const planet of system.planets) {
      this.createOrbitLine(planet);
    }
  }

  private clearScene(): void {
    // Remove all bodies, ships, and orbits
    for (const mesh of this.bodies.values()) {
      this.scene.remove(mesh);
    }
    for (const mesh of this.ships.values()) {
      this.scene.remove(mesh);
    }
    for (const line of this.orbitLines.values()) {
      this.scene.remove(line);
    }

    this.bodies.clear();
    this.ships.clear();
    this.orbitLines.clear();
    this.starMaterials = [];
    this.bodyPreviousPositions.clear();
    this.bodyTargetPositions.clear();
  }

  private generateSunTexture(baseColor: number): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    // Convert hex color to RGB
    const r = (baseColor >> 16) & 255;
    const g = (baseColor >> 8) & 255;
    const b = baseColor & 255;

    // Create radial gradient for base
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2
    );
    gradient.addColorStop(
      0,
      `rgb(${Math.min(255, Math.floor(r * 1.2))}, ${Math.min(
        255,
        Math.floor(g * 1.2)
      )}, ${Math.min(255, Math.floor(b * 1.2))})`
    );
    gradient.addColorStop(0.5, `rgb(${r}, ${g}, ${b})`);
    gradient.addColorStop(
      1,
      `rgb(${Math.floor(r * 0.8)}, ${Math.floor(g * 0.8)}, ${Math.floor(
        b * 0.8
      )})`
    );
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Add some darker spots
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 15; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const radius = Math.random() * 20 + 10;
      ctx.fillStyle = `rgb(${Math.floor(r * 0.6)}, ${Math.floor(
        g * 0.6
      )}, ${Math.floor(b * 0.6)})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Add some brighter spots
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 10; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const radius = Math.random() * 15 + 8;
      ctx.fillStyle = `rgb(${Math.min(255, Math.floor(r * 1.3))}, ${Math.min(
        255,
        Math.floor(g * 1.3)
      )}, ${Math.min(255, Math.floor(b * 1.3))})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1.0;

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  private createStar(star: any): void {
    const radius = star.radius * this.SCALE * this.BODY_SIZE_MULTIPLIER;
    const geometry = new THREE.SphereGeometry(radius, 64, 64);

    // Create custom shader material for sun with procedural texture
    const material = new THREE.ShaderMaterial({
      uniforms: {
        baseColor: { value: new THREE.Color(star.color || 0xffff00) },
        time: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPosition;
        void main() {
          vUv = uv;
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 baseColor;
        uniform float time;
        varying vec2 vUv;
        varying vec3 vPosition;
        
        // Smooth interpolation function
        float smoothNoise(float x) {
          return x * x * (3.0 - 2.0 * x);
        }
        
        // 3D noise function for seamless sphere mapping with smoother transitions
        float noise(vec3 p) {
          float n = sin(p.x * 5.0 + sin(p.y * 4.0)) * cos(p.z * 4.5 + sin(p.x * 3.0)) * 0.5 + 0.5;
          return smoothNoise(n);
        }
        
        void main() {
          // Normalize position for consistent noise across the sphere
          vec3 norm = normalize(vPosition);
          
          // Slow down animation significantly for more majestic movement
          float slowTime = time / 10.0;
          
          // Create variation across the surface using 3D position with slow rotation
          float n1 = noise(norm * 3.0 + slowTime * 0.0002);
          float n2 = noise(norm * 6.0 + slowTime * 0.0003);
          float n3 = noise(norm * 12.0 + slowTime * 0.0004);
          
          // Combine noise layers
          float intensity = 0.85 + n1 * 0.1 + n2 * 0.05 + n3 * 0.025;
          
          // Add some darker spots (sunspots) with very slow movement
          float spot1Raw = sin(norm.x * 15.0 + norm.y * 10.0 + slowTime * 0.0001) * 0.5 + 0.5;
          float spot2Raw = sin(norm.z * 12.0 + norm.x * 8.0 + slowTime * 0.00015) * 0.5 + 0.5;
          float spot1 = smoothstep(0.3, 0.7, spot1Raw);
          float spot2 = smoothstep(0.3, 0.7, spot2Raw);
          intensity -= (spot1 * 0.1 + spot2 * 0.08);
          
          // Add brighter areas with medium rotation speed and smooth transitions
          float bright1Raw = cos(norm.x * 8.0 + slowTime * 0.0005) * cos(norm.y * 6.0 - slowTime * 0.0004) * 0.5 + 0.5;
          float bright2Raw = cos(norm.z * 7.0 + slowTime * 0.0006) * cos(norm.x * 5.0 + slowTime * 0.0003) * 0.5 + 0.5;
          float bright3Raw = sin(norm.x * 10.0 + norm.z * 8.0 + slowTime * 0.0007) * cos(norm.y * 9.0 - slowTime * 0.0005) * 0.5 + 0.5;
          float bright1 = smoothstep(0.4, 0.6, bright1Raw);
          float bright2 = smoothstep(0.4, 0.6, bright2Raw);
          float bright3 = smoothstep(0.4, 0.6, bright3Raw);
          intensity += (bright1 * 0.25 + bright2 * 0.2 + bright3 * 0.3);
          
          // Add swirling bright patterns with different rotation speeds and smooth transitions
          float swirl1Raw = sin(norm.x * 12.0 + sin(norm.y * 8.0) + norm.z * 6.0 + slowTime * 0.0008) * 0.5 + 0.5;
          float swirl2Raw = cos(norm.y * 10.0 + cos(norm.z * 7.0) + norm.x * 5.0 - slowTime * 0.0009) * 0.5 + 0.5;
          float swirl3Raw = sin(norm.z * 11.0 + sin(norm.x * 9.0) + norm.y * 7.0 + slowTime * 0.001) * 0.5 + 0.5;
          float swirl1 = smoothstep(0.5, 0.9, swirl1Raw);
          float swirl2 = smoothstep(0.5, 0.9, swirl2Raw);
          float swirl3 = smoothstep(0.5, 0.9, swirl3Raw);
          intensity += (swirl1 * 0.35 + swirl2 * 0.3 + swirl3 * 0.25);
          
          // Add subtle breathing/pulsing effect
          float pulse = sin(slowTime * 0.005) * 0.03 + 1.0;
          intensity *= pulse;
          
          // Clamp
          intensity = clamp(intensity, 0.75, 1.6);
          
          gl_FragColor = vec4(baseColor * intensity, 1.0);
        }
      `,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { id: star.id, type: "star", body: star };
    this.scene.add(mesh);
    this.bodies.set(star.id, mesh);

    // Store material for animation updates
    this.starMaterials.push(material);

    // Add bright point light from the star (no distance limit, minimal decay for visibility)
    const light = new THREE.PointLight(star.color || 0xffff00, 30, 0, 0.5);
    light.position.set(0, 0, 0);
    this.scene.add(light);

    // Add multiple layers of glow around the star for enhanced radiance
    const glowLayers = [
      { size: 1.1, opacity: 0.8 },
      { size: 1.2, opacity: 0.6 },
      { size: 1.35, opacity: 0.4 },
    ];

    glowLayers.forEach((layer) => {
      const glowGeometry = new THREE.SphereGeometry(
        radius * layer.size,
        32,
        32
      );
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: star.color || 0xffff00,
        transparent: true,
        opacity: layer.opacity,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide, // Render from inside for better effect
      });
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      this.scene.add(glow);
    });

    // Add ambient light for the system (so planets are always somewhat visible)
    const ambient = new THREE.AmbientLight(0x404040, 0.5);
    this.scene.add(ambient);
  }

  private generatePlanetTexture(baseColor: number): THREE.CanvasTexture {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    // Convert hex color to RGB
    const r = (baseColor >> 16) & 255;
    const g = (baseColor >> 8) & 255;
    const b = baseColor & 255;

    // Fill with base color
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(0, 0, size, size);

    // Add horizontal bands (like latitude lines or cloud bands)
    ctx.globalAlpha = 0.5;
    for (let y = 0; y < size; y += 30) {
      const bandHeight = 10 + Math.sin(y * 0.1) * 5;
      const variation = Math.sin(y * 0.05) * 30;
      ctx.fillStyle = `rgb(${Math.floor(r * 0.7)}, ${Math.floor(
        g * 0.7
      )}, ${Math.floor(b * 0.7)})`;
      ctx.fillRect(0, y, size, bandHeight);
    }

    // Add some vertical streaks and spots for variety
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const width = 20 + Math.random() * 40;
      const height = 30 + Math.random() * 60;

      ctx.fillStyle = `rgb(${Math.min(255, Math.floor(r * 1.2))}, ${Math.min(
        255,
        Math.floor(g * 1.2)
      )}, ${Math.min(255, Math.floor(b * 1.2))})`;
      ctx.fillRect(x, y, width, height);
    }

    // Add darker spots (like continents or storm systems)
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 15; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const radius = 20 + Math.random() * 50;

      ctx.fillStyle = `rgb(${Math.floor(r * 0.5)}, ${Math.floor(
        g * 0.5
      )}, ${Math.floor(b * 0.5)})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1.0;

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  private createPlanet(planet: any): void {
    const radius = planet.radius * this.SCALE * this.BODY_SIZE_MULTIPLIER;
    const geometry = new THREE.SphereGeometry(radius, 64, 64);

    // Create shader material with procedural texture
    const material = new THREE.ShaderMaterial({
      uniforms: {
        baseColor: { value: new THREE.Color(planet.color || 0x888888) },
        lightPosition: { value: new THREE.Vector3(0, 0, 0) }, // Sun at origin
        rotation: { value: 0.0 }, // Planet rotation angle
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = position;
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          // Calculate world space normal for lighting
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 baseColor;
        uniform vec3 lightPosition;
        uniform float rotation;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        
        // Simple noise for surface features
        float noise(vec2 p) {
          return sin(p.x * 10.0) * cos(p.y * 8.0) * 0.5 + 0.5;
        }
        
        void main() {
          // Calculate spherical coordinates for texture mapping
          vec3 norm = normalize(vPosition);
          // Add rotation to the horizontal coordinate
          float u = atan(norm.z, norm.x) / (2.0 * 3.14159) + 0.5 + rotation / (2.0 * 3.14159);
          float v = asin(norm.y) / 3.14159 + 0.5;
          
          // Base color intensity
          float intensity = 1.0;
          
          // Add horizontal bands (latitude-based) - smoother, lower frequency
          float bands = sin(v * 8.0) * 0.5 + 0.5;
          float bandPattern = smoothstep(0.3, 0.7, bands);
          intensity *= 0.9 + bandPattern * 0.1;
          
          // Add some spots/continents - lower frequency, smoother
          float spot1 = noise(vec2(u * 3.0, v * 3.0));
          float spot2 = noise(vec2(u * 5.0 + 1.5, v * 5.0 + 2.3));
          float spotPattern = smoothstep(0.55, 0.75, spot1) * 0.08 + smoothstep(0.6, 0.8, spot2) * 0.06;
          intensity -= spotPattern;
          
          // Basic lighting from sun using world space normal and position
          vec3 lightDir = normalize(lightPosition - vWorldPosition);
          float diffuse = max(dot(vWorldNormal, lightDir), 0.0);
          
          // Enhance the lighting difference between day and night side
          float lighting = diffuse * 0.85 + 0.15; // Less ambient, more contrast
          
          // Add slight emissive on dark side for visibility
          float emissive = 0.1;
          
          vec3 finalColor = baseColor * intensity * (lighting + emissive);
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { id: planet.id, type: "planet", body: planet };

    this.scene.add(mesh);
    this.bodies.set(planet.id, mesh);

    // Add atmosphere if planet has one
    if (planet.hasAtmosphere) {
      const atmosphereRadius = radius * 1.05; // 5% larger than planet
      const atmosphereGeometry = new THREE.SphereGeometry(
        atmosphereRadius,
        32,
        32
      );

      const atmosphereMaterial = new THREE.ShaderMaterial({
        uniforms: {
          atmosphereColor: { value: new THREE.Color(planet.color || 0x88ccff) },
        },
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 atmosphereColor;
          varying vec3 vNormal;
          
          void main() {
            // Fresnel effect - atmosphere is more visible at edges
            float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
            gl_FragColor = vec4(atmosphereColor, intensity * 0.6);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
      });

      const atmosphereMesh = new THREE.Mesh(
        atmosphereGeometry,
        atmosphereMaterial
      );
      mesh.add(atmosphereMesh); // Attach to planet so it rotates together
    }
  }

  private createOrbitLine(planet: any): void {
    if (!planet.orbitalElements) return;

    const oe = planet.orbitalElements;
    const a = oe.semiMajorAxis * this.SCALE;
    const e = oe.eccentricity;
    const segments = 128;

    // Create ellipse points in orbital plane
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const trueAnomaly = (i / segments) * Math.PI * 2;
      const r = (a * (1 - e * e)) / (1 + e * Math.cos(trueAnomaly));

      // Position in orbital plane
      const x_orb = r * Math.cos(trueAnomaly);
      const y_orb = r * Math.sin(trueAnomaly);

      // Apply 3D rotations: argument of periapsis, inclination, longitude of ascending node
      const cosΩ = Math.cos(oe.longitudeOfAscendingNode);
      const sinΩ = Math.sin(oe.longitudeOfAscendingNode);
      const cosω = Math.cos(oe.argumentOfPeriapsis);
      const sinω = Math.sin(oe.argumentOfPeriapsis);
      const cosi = Math.cos(oe.inclination);
      const sini = Math.sin(oe.inclination);

      // Transform from orbital plane to 3D space using proper rotation matrices
      const x =
        x_orb * (cosΩ * cosω - sinΩ * sinω * cosi) -
        y_orb * (cosΩ * sinω + sinΩ * cosω * cosi);
      const y = x_orb * sinω * sini + y_orb * cosω * sini;
      const z =
        x_orb * (sinΩ * cosω + cosΩ * sinω * cosi) -
        y_orb * (sinΩ * sinω - cosΩ * cosω * cosi);

      points.push(new THREE.Vector3(x, y, z));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      opacity: 0.3,
      transparent: true,
    });
    const line = new THREE.Line(geometry, material);

    this.scene.add(line);
    this.orbitLines.set(planet.id, line);
  }

  setTimeState(isPaused: boolean, timeScale: number): void {
    this.isPaused = isPaused;
    this.timeScale = timeScale;
  }

  updateState(state: SystemState): void {
    // Update game time tracking for smooth interpolation
    this.lastServerTime = state.currentTime;
    this.lastUpdateRealTime = performance.now() / 1000;

    // Update body positions with interpolation tracking
    for (const bodyState of state.bodies) {
      const mesh = this.bodies.get(bodyState.id);
      if (mesh) {
        const newPosition = new THREE.Vector3(
          bodyState.position.x * this.SCALE,
          bodyState.position.z * this.SCALE,
          bodyState.position.y * this.SCALE
        );

        // If this is the first update for this body, set position directly
        if (!this.bodyTargetPositions.has(bodyState.id)) {
          mesh.position.copy(newPosition);
          this.bodyPreviousPositions.set(bodyState.id, newPosition.clone());
          this.bodyTargetPositions.set(bodyState.id, newPosition.clone());
        } else {
          // Store current position as previous, and new position as target
          this.bodyPreviousPositions.set(bodyState.id, mesh.position.clone());
          this.bodyTargetPositions.set(bodyState.id, newPosition);
        }
      }
    }

    // Update ship positions
    for (const shipState of state.ships) {
      let mesh = this.ships.get(shipState.id);
      if (!mesh) {
        // Create ship mesh
        mesh = this.createShipMesh();
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

  private createShipMesh(): THREE.Mesh {
    const geometry = new THREE.ConeGeometry(2, 6, 4);
    const material = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 0.3, // Ships glow more so they're easy to see
      metalness: 0.8,
      roughness: 0.2,
    });
    return new THREE.Mesh(geometry, material);
  }

  private onMouseDown(event: MouseEvent): void {
    if (event.button === 0) {
      // Left mouse button
      this.previousMousePosition = { x: event.clientX, y: event.clientY };

      // Check if clicking on an object (only if not moving much)
      this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

      // Small delay to differentiate between click and drag
      setTimeout(() => {
        if (!this.isDragging) {
          this.handleObjectClick();
        }
      }, 150);
    }
  }

  private onMouseMove(event: MouseEvent): void {
    if (event.buttons === 1) {
      // Left mouse button is pressed
      const deltaX = event.clientX - this.previousMousePosition.x;
      const deltaY = event.clientY - this.previousMousePosition.y;

      // Mark as dragging if moved enough
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        this.isDragging = true;
      }

      if (this.isDragging) {
        // Rotate camera around target
        const rotationSpeed = 0.005;
        this.cameraTheta -= deltaX * rotationSpeed;
        this.cameraPhi -= deltaY * rotationSpeed;

        // Clamp phi to prevent flipping
        this.cameraPhi = Math.max(0.1, Math.min(Math.PI - 0.1, this.cameraPhi));
      }

      this.previousMousePosition = { x: event.clientX, y: event.clientY };
    }
  }

  private onMouseUp(): void {
    this.isDragging = false;
  }

  private handleObjectClick(): void {
    // Update raycaster
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Check for intersections
    const allObjects = [...this.bodies.values(), ...this.ships.values()];
    const intersects = this.raycaster.intersectObjects(allObjects);

    if (intersects.length > 0) {
      const object = intersects[0].object as THREE.Mesh;
      const objectId = object.userData.id;

      this.selectedObjectId = objectId;
      if (this.onObjectSelected) {
        this.onObjectSelected(objectId);
      }

      // Set camera target to selected object and zoom in
      this.cameraTarget.copy(object.position);

      // Calculate appropriate zoom distance based on object size
      const objectRadius = object.geometry.boundingSphere?.radius || 10;
      this.cameraDistance = objectRadius * 5; // 5x the object radius
    }
  }

  private onMouseWheel(event: WheelEvent): void {
    event.preventDefault();

    // Zoom in/out
    const zoomSpeed = 0.1;
    const delta = event.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;

    this.cameraDistance *= delta;
    this.cameraDistance = Math.max(10, Math.min(50000, this.cameraDistance));
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  update(): void {
    // Rotate starfield slowly (independent of game time)
    if (this.starfield) {
      const realTime = performance.now() / 1000;
      this.starfield.rotation.y = realTime * 0.01; // Slow rotation
    }

    // Interpolate game time smoothly between server updates
    if (!this.isPaused) {
      const currentRealTime = performance.now() / 1000;
      const realTimeDelta = currentRealTime - this.lastUpdateRealTime;
      this.gameTime = this.lastServerTime + realTimeDelta * this.timeScale;
    } else {
      this.gameTime = this.lastServerTime;
    }

    // Update star shader time uniforms for animation using interpolated game time
    for (const material of this.starMaterials) {
      material.uniforms.time.value = this.gameTime;
    }

    // Smooth interpolation factor for orbital positions (lerp over 200ms)
    const currentRealTime = performance.now() / 1000;
    const timeSinceUpdate = currentRealTime - this.lastUpdateRealTime;
    const lerpFactor = Math.min(timeSinceUpdate / 0.2, 1.0); // Interpolate over 200ms

    // Update planet positions and rotations
    for (const [bodyId, mesh] of this.bodies.entries()) {
      // Smooth orbital motion interpolation
      const prevPos = this.bodyPreviousPositions.get(bodyId);
      const targetPos = this.bodyTargetPositions.get(bodyId);

      if (prevPos && targetPos) {
        mesh.position.lerpVectors(prevPos, targetPos, lerpFactor);
      }

      // Add planet rotation via shader uniform for smooth animation
      if (mesh.userData.type === "planet") {
        // Rotate based on game time (arbitrary rotation periods for visual effect)
        // Different planets rotate at different speeds based on their ID
        const rotationSpeed = 0.0005 + (bodyId.charCodeAt(0) % 10) * 0.00025;
        const rotation = this.gameTime * rotationSpeed;

        // Update shader uniform if using ShaderMaterial
        if (
          mesh.material instanceof THREE.ShaderMaterial &&
          mesh.material.uniforms.rotation
        ) {
          mesh.material.uniforms.rotation.value = rotation;

          // Debug: log to verify smooth updates
          if (
            bodyId === this.bodies.keys().next().value &&
            Math.random() < 0.01
          ) {
            console.log(
              "Rotation:",
              rotation.toFixed(4),
              "GameTime:",
              this.gameTime.toFixed(2)
            );
          }
        }
      } else if (mesh.userData.type === "star") {
        // Stars rotate very slowly
        mesh.rotation.y = this.gameTime * 0.00001;
      }
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

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  centerOnObject(objectId: string): void {
    const mesh = this.bodies.get(objectId) || this.ships.get(objectId);
    if (mesh) {
      this.cameraTarget.copy(mesh.position);
      this.selectedObjectId = objectId;

      // Set appropriate zoom distance
      const objectRadius = mesh.geometry.boundingSphere?.radius || 10;
      this.cameraDistance = objectRadius * 5;
    }
  }

  getSelectedObjectId(): string | null {
    return this.selectedObjectId;
  }

  getSystem(): StarSystem | null {
    return this.system;
  }
}
