import * as THREE from "three";
import { SurfaceTypeShaderValue, SurfaceTypeName } from "@constellation/shared";
import { createTerrestrialPlanetMaterial } from "./materials/TerrestrialPlanetMaterial";
import { createRockyPlanetMaterial } from "./materials/RockyPlanetMaterial";
import { createBarrenPlanetMaterial } from "./materials/BarrenPlanetMaterial";
import { createCloudMaterial as createCloudMaterialModule } from "./materials/CloudMaterial";
import { createAtmosphereMaterial as createAtmosphereMaterialModule } from "./materials/AtmosphereMaterial";

/**
 * Generate ice planet crack texture using Canvas 2D API
 * Following the exact algorithm from the documentation
 */
function generateIcePlanetTexture(
  seed: number,
  baseColor: string
): THREE.Texture {
  const width = 2048;
  const height = 1024;

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Seeded random number generator
  const seededRandom = (s: number): number => {
    const x = Math.sin(s) * 10000;
    return x - Math.floor(x);
  };

  // Fill with base ice color
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, width, height);

  // Ice planet crack styling
  const crackColor = "rgba(10, 10, 20, 0.6)"; // Dark blue-black

  // Use seed to create variety in crack parameters for each planet
  const crackDensitySeed = seededRandom(seed * 1.1);
  const crackLengthSeed = seededRandom(seed * 1.3);
  const crackBendSeed = seededRandom(seed * 1.7);
  const fineCrackSeed = seededRandom(seed * 2.1);

  // Vary number of crack systems (10-40 range based on density seed)
  const numCrackSystems = 10 + Math.floor(crackDensitySeed * 30);

  // Vary crack length multiplier (0.7 to 1.3)
  const lengthMultiplier = 0.7 + crackLengthSeed * 0.6;

  // Vary bend/jaggedness (0.3 to 0.9 radians)
  const bendAmount = 0.3 + crackBendSeed * 0.6;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Main crack systems
  for (let i = 0; i < numCrackSystems; i++) {
    const startX = seededRandom(seed + i * 123) * width;
    const startY = seededRandom(seed + i * 456) * height;
    // Vary branches: use density seed to affect branch count (1-6 branches)
    const numBranches =
      1 +
      Math.floor(
        seededRandom(seed + i * 789) * 5 * (0.5 + crackDensitySeed * 0.5)
      );

    for (let b = 0; b < numBranches; b++) {
      const branchSeed = seed + i * 1000 + b * 100;
      let angle = seededRandom(branchSeed) * Math.PI * 2;
      let x = startX;
      let y = startY;

      const segments = 8 + Math.floor(seededRandom(branchSeed + 1) * 15); // 8-23 segments
      const segmentLength =
        (3 + seededRandom(branchSeed + 2) * 8) * lengthMultiplier; // Vary length per planet

      const path: Array<{ x: number; y: number; widthFactor: number }> = [
        { x, y, widthFactor: 1 },
      ];

      // Build crack path
      for (let s = 0; s < segments; s++) {
        angle += (seededRandom(branchSeed + s * 7) - 0.5) * bendAmount; // Vary bend per planet
        x += Math.cos(angle) * segmentLength;
        y += Math.sin(angle) * segmentLength;

        // Wrap around horizontally (sphere mapping)
        if (x < 0) x += width;
        if (x > width) x -= width;
        if (y < 0 || y > height) break;

        const widthFactor = 1 - s / segments;
        path.push({ x, y, widthFactor });
      }

      // Draw crack
      ctx.strokeStyle = crackColor;
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let p = 1; p < path.length; p++) {
        ctx.lineTo(path[p].x, path[p].y);
        // Taper from 2.5 to 0.5 pixels
        ctx.lineWidth = 2.0 * path[p].widthFactor + 0.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(path[p].x, path[p].y);
      }

      // Sub-branches (30% chance)
      if (seededRandom(branchSeed + 999) > 0.6 && path.length > 5) {
        const subBranchAngle =
          angle + (seededRandom(branchSeed + 888) - 0.5) * Math.PI * 0.5;
        const subSegments = 3 + Math.floor(seededRandom(branchSeed + 777) * 6); // 3-8 segments

        let subX = path[path.length - 1].x;
        let subY = path[path.length - 1].y;
        const subPath: Array<{ x: number; y: number; widthFactor: number }> = [
          { x: subX, y: subY, widthFactor: 1 },
        ];

        for (let ss = 0; ss < subSegments; ss++) {
          subX += Math.cos(subBranchAngle) * segmentLength * 0.7; // 70% of parent length
          subY += Math.sin(subBranchAngle) * segmentLength * 0.7;

          if (subX < 0) subX += width;
          if (subX > width) subX -= width;
          if (subY < 0 || subY > height) break;

          const widthFactor = 1 - ss / subSegments;
          subPath.push({ x: subX, y: subY, widthFactor });
        }

        ctx.strokeStyle = crackColor;
        ctx.beginPath();
        ctx.moveTo(subPath[0].x, subPath[0].y);
        for (let p = 1; p < subPath.length; p++) {
          ctx.lineTo(subPath[p].x, subPath[p].y);
          // Taper from 1.3 to 0.3 pixels for sub-branches
          ctx.lineWidth = 1.0 * subPath[p].widthFactor + 0.3;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(subPath[p].x, subPath[p].y);
        }
      }
    }
  }

  // Fine detail cracks - vary count based on seed (20-80 range)
  const numFineCracks = 20 + Math.floor(fineCrackSeed * 60);

  for (let i = 0; i < numFineCracks; i++) {
    const fx = seededRandom(seed + i * 234 + 5000) * width;
    const fy = seededRandom(seed + i * 567 + 5000) * height;
    const fAngle = seededRandom(seed + i * 890 + 5000) * Math.PI * 2;
    // Vary fine crack length using length multiplier (7-45 pixel range)
    const fLength =
      (10 + seededRandom(seed + i * 111 + 5000) * 25) * lengthMultiplier;

    const endX = fx + Math.cos(fAngle) * fLength;
    const endY = fy + Math.sin(fAngle) * fLength;

    ctx.strokeStyle = crackColor;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(endX, endY);
    ctx.lineWidth = 1.0;
    ctx.stroke();
  }

  // Create Three.js texture
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping; // Horizontal wrap for sphere
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  return texture;
}

/**
 * Generate terrestrial planet texture with continents, oceans, and rivers
 * Using multi-octave Perlin noise for realistic terrain
 */
function generateTerrestrialTexture(
  seed: number,
  baseColor: string
): THREE.Texture {
  const width = 2048;
  const height = 1024;

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Seeded random number generator
  const seededRandom = (s: number): number => {
    const x = Math.sin(s) * 10000;
    return x - Math.floor(x);
  };

  // Perlin-like noise function (simplified for performance)
  const noise2D = (x: number, y: number, s: number): number => {
    const n = seededRandom(
      Math.floor(x * 1000 + s) * 0.1 + Math.floor(y * 1000 + s) * 0.2 + s
    );
    return n;
  };

  // Multi-octave noise for terrain elevation
  const multiOctaveNoise = (
    x: number,
    y: number,
    octaves: number,
    s: number
  ): number => {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += noise2D(x * frequency, y * frequency, s + i * 100) * amplitude;
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }

    return value / maxValue;
  };

  // Detect planet type from base color
  const baseColorObj = new THREE.Color(baseColor);
  const r = baseColorObj.r;
  const g = baseColorObj.g;
  const b = baseColorObj.b;

  // Determine if this is a desert world (reddish/sandy) or Earth-like (bluish/greenish)
  const isDesert = r > 0.5 && r > g * 1.3 && r > b * 1.3; // Red dominant

  // Generate planet variety parameters
  const waterLevelSeed = seededRandom(seed * 1.2);
  const continentSizeSeed = seededRandom(seed * 1.5);
  const mountainsSeed = seededRandom(seed * 1.8);

  // Water level varies by planet type
  let waterLevel: number;
  if (isDesert) {
    // Desert planets: very little water (5-25%)
    waterLevel = 0.75 + waterLevelSeed * 0.2;
  } else {
    // Earth-like: moderate water (40-70%)
    waterLevel = 0.3 + waterLevelSeed * 0.3;
  }

  // Continent size: affects noise frequency
  const continentScale = 2 + continentSizeSeed * 4; // 2-6 range

  // Generate terrain
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const v = y / height;

      // Generate elevation using multi-octave noise
      const elevation = multiOctaveNoise(
        u * continentScale,
        v * continentScale,
        6,
        seed
      );

      // Determine if land or ocean
      const idx = (y * width + x) * 4;

      if (elevation > waterLevel) {
        // LAND - vary color by elevation and planet type
        const heightAboveSea = (elevation - waterLevel) / (1 - waterLevel);

        if (isDesert) {
          // DESERT PLANET - sandy, rocky terrain
          const noise = seededRandom(seed + x * 0.1 + y * 0.1);

          // Low areas - sand dunes
          if (heightAboveSea < 0.3) {
            data[idx] = 200 + noise * 40; // R - light sand
            data[idx + 1] = 160 + noise * 30; // G
            data[idx + 2] = 100 + noise * 20; // B
          }
          // Mid areas - darker sand/rock
          else if (heightAboveSea < 0.6) {
            data[idx] = 180 + noise * 30; // R - darker sand
            data[idx + 1] = 130 + noise * 25; // G
            data[idx + 2] = 80 + noise * 15; // B
          }
          // High areas - rocky mountains
          else {
            data[idx] = 140 + noise * 20; // R - dark rock
            data[idx + 1] = 100 + noise * 15; // G
            data[idx + 2] = 70 + noise * 10; // B
          }
        } else {
          // EARTH-LIKE PLANET - varied biomes
          const noise = seededRandom(seed + x * 0.1 + y * 0.1);

          // Beach (just above water)
          if (heightAboveSea < 0.1) {
            data[idx] = 220; // R - sandy beach
            data[idx + 1] = 200; // G
            data[idx + 2] = 150; // B
          }
          // Plains/lowlands - green vegetation
          else if (heightAboveSea < 0.4) {
            data[idx] = 60 + noise * 40; // R - lush green
            data[idx + 1] = 120 + noise * 50; // G
            data[idx + 2] = 40 + noise * 30; // B
          }
          // Highlands - darker vegetation
          else if (heightAboveSea < 0.7) {
            data[idx] = 80 + noise * 30; // R - forest green
            data[idx + 1] = 100 + noise * 30; // G
            data[idx + 2] = 50 + noise * 20; // B
          }
          // Mountains - rocky/snowy
          else {
            data[idx] = 160 + noise * 40; // R - mountain gray
            data[idx + 1] = 160 + noise * 40; // G
            data[idx + 2] = 160 + noise * 40; // B
          }
        }

        data[idx + 3] = 255; // Alpha
      } else {
        // WATER - varies by planet type
        const depth = (waterLevel - elevation) / waterLevel;

        if (isDesert) {
          // Desert planets - small oases or dry lakes (brownish water)
          const depthFactor = 1 - depth * 0.4;
          data[idx] = 100 * depthFactor; // R - murky water
          data[idx + 1] = 140 * depthFactor; // G
          data[idx + 2] = 160 * depthFactor; // B
        } else {
          // Earth-like - deep blue oceans
          const depthFactor = 1 - depth * 0.6;
          data[idx] = 20 * depthFactor; // R - deep blue
          data[idx + 1] = 60 * depthFactor; // G
          data[idx + 2] = 140 * depthFactor; // B
        }

        data[idx + 3] = 255; // Alpha
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // Create Three.js texture
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  return texture;
}

/**
 * Factory for creating shader materials for celestial bodies and ships
 */
export class MaterialFactory {
  /**
   * Creates a shader material for stars with procedural animated texture
   */
  createStarMaterial(color: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        baseColor: { value: new THREE.Color(color) },
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
  }

  /**
   * Creates a material for planets with procedural texture and lighting
   * Ice planets use MeshPhongMaterial with canvas-generated crack textures
   * Other planets use custom ShaderMaterial
   */
  createPlanetMaterial(
    color: number,
    surfaceType: SurfaceTypeName = "rocky",
    seed?: string,
    orbitalDistance?: number,
    habitability?: number,
    civilizationLevel?: string
  ): THREE.Material {
    // Generate unique seed number from string id
    const numericSeed = seed
      ? seed.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)
      : 0;

    // Normalize orbital distance for shader (typical habitable zone: 0.9-1.5 AU = 1.35e11 - 2.25e11 m)
    // Map to 0.0 (close) to 1.0+ (far) for easier shader use
    const normalizedDistance = orbitalDistance
      ? Math.max(0, (orbitalDistance - 1.0e11) / 2.0e11) // 0 at 1.0e11m, 1.0 at 3.0e11m
      : 0.5; // Default to mid-range

    // Convert civilization level to numeric scale (0-7)
    const civilizationLevels: { [key: string]: number } = {
      primitive: 1,
      agricultural: 2,
      industrial: 3,
      atomic: 4,
      information: 5,
      spacefaring: 6,
      interstellar: 7,
    };
    const numericCivilizationLevel = civilizationLevel
      ? civilizationLevels[civilizationLevel] || 0
      : 0;

    // Use modular material for Terrestrial planets
    if (surfaceType === "terrestrial") {
      return createTerrestrialPlanetMaterial(
        color,
        numericSeed,
        normalizedDistance,
        habitability ?? 0.5,
        numericCivilizationLevel
      );
    }

    // Use modular material for Rocky planets (heavily cratered)
    if (surfaceType === "rocky") {
      // Weathering level based on orbital distance (closer = more weathering from solar wind)
      const weatheringLevel = normalizedDistance < 0.5 ? 0.7 : 0.3;
      return createRockyPlanetMaterial(
        color,
        numericSeed,
        normalizedDistance,
        weatheringLevel
      );
    }

    // Use modular material for Barren planets (ancient, smooth, dust-covered)
    if (surfaceType === "barren") {
      // Dust thickness varies - some planets more dust-covered than others
      const dustThickness = 0.5 + (numericSeed % 100) / 200; // 0.5 to 1.0
      return createBarrenPlanetMaterial(
        color,
        numericSeed,
        normalizedDistance,
        dustThickness
      );
    }

    // Use modular material for Desert planets (sand dunes, arid)
    if (surfaceType === "desert") {
      // Deserts are similar to barren but with more dynamic wind patterns
      // Use slightly less dust coverage than barren planets
      const dustThickness = 0.3 + (numericSeed % 100) / 300; // 0.3 to 0.63
      return createBarrenPlanetMaterial(
        color,
        numericSeed,
        normalizedDistance,
        dustThickness
      );
    }

    // Ice planets use MeshPhongMaterial with canvas-generated textures
    if (surfaceType === "icy" && seed) {
      // Generate crack texture
      const crackTexture = generateIcePlanetTexture(
        numericSeed,
        new THREE.Color(color).getStyle()
      );

      // Create MeshPhongMaterial with high shininess and reflectivity for ice
      return new THREE.MeshPhongMaterial({
        map: crackTexture,
        shininess: 100, // High shininess for glossy ice surface
        specular: new THREE.Color("#ffffff"), // White specular highlights
        emissive: new THREE.Color(color),
        emissiveIntensity: 0.1, // Subtle self-illumination
      });
    }

    // Terrestrial planets use shader with continent/ocean generation (similar to clouds)
    // Commented out for now - keeping canvas approach available for future use
    /*
    if (surfaceType === "smooth" && seed) {
      // Generate continent/ocean texture
      const terrainTexture = generateTerrestrialTexture(
        numericSeed,
        new THREE.Color(color).getStyle()
      );
      
      // Use MeshStandardMaterial for PBR lighting with the terrain texture
      return new THREE.MeshStandardMaterial({
        map: terrainTexture,
        roughness: 0.8, // Somewhat rough surface (land)
        metalness: 0.1, // Slightly metallic (minerals)
      });
    }
    */

    // All other planets use custom shader
    return new THREE.ShaderMaterial({
      uniforms: {
        baseColor: { value: new THREE.Color(color) },
        lightPosition: { value: new THREE.Vector3(0, 0, 0) }, // Sun at origin
        rotation: { value: 0.0 }, // Planet rotation angle
        surfaceType: {
          value: SurfaceTypeShaderValue[surfaceType] || 0.0,
        },
        planetSeed: { value: numericSeed }, // Planet seed for consistent variety
        orbitalDistance: { value: normalizedDistance }, // Normalized distance from star (0-1+)
        habitability: {
          value: habitability !== undefined ? habitability : 0.5,
        }, // 0-1 habitability score
        time: { value: 0.0 }, // Time for animations
      },
      lights: false, // Disable Three.js lighting system (we do custom lighting)
      vertexShader: `
        uniform float surfaceType;
        uniform float planetSeed;
        uniform float rotation;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        varying vec2 vUv;
        
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = position;
          vUv = uv;
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 baseColor;
        uniform vec3 lightPosition;
        uniform float rotation;
        uniform float surfaceType;
        uniform float planetSeed;
        uniform float orbitalDistance; // 0.0 (close to star) to 1.0+ (far from star)
        uniform float habitability; // 0.0 (uninhabitable) to 1.0 (highly habitable)
        uniform float time; // Time for animations
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        varying vec2 vUv;
        
        // Note: cameraPosition is automatically provided by Three.js
        
        // Surface type constants
        // IMPORTANT: These must match SurfaceTypeShaderValue in shared/src/types.ts
        const float SURFACE_TERRESTRIAL = 0.0;
        const float SURFACE_DESERT = 1.0;
        const float SURFACE_BARREN = 2.0;
        const float SURFACE_ROCKY = 3.0;
        const float SURFACE_BANDED = 4.0;
        const float SURFACE_ICY = 5.0;
        const float SURFACE_VOLCANIC = 6.0;
        const float SURFACE_OCEANIC = 7.0;
        
        // Hash function for pseudo-random numbers
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        
        // Seeded random for consistent variation per planet
        float seededRandom(float seed) {
          return fract(sin(seed) * 43758.5453123);
        }
        
        // Simple noise for surface features
        float noise(vec2 p) {
          return sin(p.x * 10.0) * cos(p.y * 8.0) * 0.5 + 0.5;
        }
        
        // Better noise for gas giant clouds
        float noise2D(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        
        // 3D hash for seamless sphere noise
        float hash3D(vec3 p) {
          p = fract(p * vec3(127.1, 311.7, 74.7));
          p += dot(p, p.yzx + 19.19);
          return fract((p.x + p.y) * p.z);
        }
        
        // 3D noise for seamless spheres
        float noise3D(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          
          float n000 = hash3D(i);
          float n100 = hash3D(i + vec3(1.0, 0.0, 0.0));
          float n010 = hash3D(i + vec3(0.0, 1.0, 0.0));
          float n110 = hash3D(i + vec3(1.0, 1.0, 0.0));
          float n001 = hash3D(i + vec3(0.0, 0.0, 1.0));
          float n101 = hash3D(i + vec3(1.0, 0.0, 1.0));
          float n011 = hash3D(i + vec3(0.0, 1.0, 1.0));
          float n111 = hash3D(i + vec3(1.0, 1.0, 1.0));
          
          float nx00 = mix(n000, n100, f.x);
          float nx10 = mix(n010, n110, f.x);
          float nx01 = mix(n001, n101, f.x);
          float nx11 = mix(n011, n111, f.x);
          
          float nxy0 = mix(nx00, nx10, f.y);
          float nxy1 = mix(nx01, nx11, f.y);
          
          return mix(nxy0, nxy1, f.z);
        }
        
        // Turbulent flow for gas giants (2D)
        float turbulence(vec2 p, int octaves) {
          float value = 0.0;
          float amplitude = 0.5;
          float frequency = 1.0;
          
          for(int i = 0; i < 8; i++) {
            if(i >= octaves) break;
            value += amplitude * abs(noise2D(p * frequency));
            frequency *= 2.0;
            amplitude *= 0.5;
          }
          
          return value;
        }
        
        // 3D turbulence for seamless spheres
        float turbulence3D(vec3 p, int octaves) {
          float value = 0.0;
          float amplitude = 0.5;
          float frequency = 1.0;
          
          for(int i = 0; i < 8; i++) {
            if(i >= octaves) break;
            value += amplitude * abs(noise3D(p * frequency));
            frequency *= 2.0;
            amplitude *= 0.5;
          }
          
          return value;
        }
        
        // Generate seamless 3D craters using Voronoi-like cells
        float craters3D(vec3 pos, float scale) {
          vec3 scaledPos = pos * scale;
          vec3 grid = floor(scaledPos);
          vec3 localPos = fract(scaledPos);
          
          float craterEffect = 0.0;
          float minDist = 10.0;
          vec3 closestCraterPos = vec3(0.0);
          
          // Check this cell and neighboring cells in 3D
          for(float z = -1.0; z <= 1.0; z++) {
            for(float y = -1.0; y <= 1.0; y++) {
              for(float x = -1.0; x <= 1.0; x++) {
                vec3 neighbor = grid + vec3(x, y, z);
                
                // Generate random position for crater in this cell
                vec3 craterPos = vec3(
                  hash3D(neighbor),
                  hash3D(neighbor + vec3(13.7, 27.3, 41.1)),
                  hash3D(neighbor + vec3(53.2, 67.4, 79.8))
                );
                
                // Calculate distance to crater center
                vec3 toCenter = (localPos - vec3(x, y, z)) - craterPos;
                float dist = length(toCenter);
                
                // Track closest crater
                if(dist < minDist) {
                  minDist = dist;
                  closestCraterPos = craterPos;
                }
                
                // Generate random size - larger range for more dramatic craters
                float craterSize = 0.2 + hash3D(neighbor + vec3(50.1, 60.2, 70.3)) * 0.35;
                
                // Only create crater if random value is above threshold (controls density)
                float shouldExist = hash3D(neighbor + vec3(100.0, 200.0, 300.0));
                if(shouldExist > 0.6) {
                  // Crater bowl with raised rim - more dramatic depth
                  if(dist < craterSize) {
                    float rimDist = abs(dist - craterSize * 0.85) / (craterSize * 0.15);
                    float rimHeight = smoothstep(1.0, 0.0, rimDist) * 0.15;
                    float bowlDepth = smoothstep(craterSize, 0.0, dist) * -0.25;
                    craterEffect += bowlDepth + rimHeight;
                  }
                }
              }
            }
          }
          
          return craterEffect;
        }
        
        void main() {
          // Use geometry UVs with rotation applied
          // This keeps the texture fixed to the surface when the planet rotates
          float u = vUv.x + rotation / (2.0 * 3.14159);
          float v = vUv.y;
          
          // Generate seed-based color variety for this planet
          float colorSeedR = seededRandom(planetSeed * 1.41);
          float colorSeedG = seededRandom(planetSeed * 1.73);
          float colorSeedB = seededRandom(planetSeed * 2.17);
          
          // Apply subtle color variation to baseColor (±15% per channel)
          vec3 variedBaseColor = baseColor * vec3(
            0.85 + colorSeedR * 0.3,  // R: 85%-115%
            0.85 + colorSeedG * 0.3,  // G: 85%-115%
            0.85 + colorSeedB * 0.3   // B: 85%-115%
          );
          
          // Base color intensity
          float intensity = 1.0;
          vec3 colorModulation = vec3(1.0);
          
          // Gas giant thick colorful bands
          if(surfaceType == SURFACE_BANDED) {
            // Use 3D position for seamless noise
            vec3 rotatedPos = vPosition;
            float cosRot = cos(rotation);
            float sinRot = sin(rotation);
            rotatedPos = vec3(
              vPosition.x * cosRot - vPosition.z * sinRot,
              vPosition.y,
              vPosition.x * sinRot + vPosition.z * cosRot
            );
            vec3 samplePos = normalize(rotatedPos);
            
            // Generate seed-based animation variety
            float animSpeedSeed = seededRandom(planetSeed * 2.9);
            float turbulenceSeed1 = seededRandom(planetSeed * 3.1);
            float turbulenceSeed2 = seededRandom(planetSeed * 3.7);
            
            // Add very slow atmospheric rotation animation (jet streams rotate around planet)
            float slowTime = time * 0.000008 * (0.7 + animSpeedSeed * 0.6); // Vary speed per planet
            
            // Different latitudes rotate at different speeds (differential rotation)
            // Equatorial regions rotate faster, polar regions slower (like Jupiter)
            float latitude = abs(v - 0.5) * 2.0; // 0 at equator, 1 at poles
            float jetStreamSpeed = (1.0 - latitude * 0.7); // Faster at equator
            
            // Apply ROTATIONAL transformation around Y-axis (planet's rotation axis)
            // This creates circular motion instead of linear drift
            float rotationAngle = slowTime * jetStreamSpeed * 0.8;
            
            // Rotate the sampling position around Y-axis for circular jet stream motion
            float cosRot2 = cos(rotationAngle);
            float sinRot2 = sin(rotationAngle);
            vec3 rotatedSamplePos = vec3(
              samplePos.x * cosRot2 - samplePos.z * sinRot2,
              samplePos.y,
              samplePos.x * sinRot2 + samplePos.z * cosRot2
            );
            
            // Add circular eddies at different scales (rotating disturbances)
            // Small eddies rotating faster
            float smallEddyAngle = slowTime * 0.5 + turbulenceSeed1 * 100.0;
            vec3 smallEddyRotation = vec3(
              sin(smallEddyAngle) * 0.08,
              cos(smallEddyAngle * 0.7) * 0.04,
              cos(smallEddyAngle) * 0.08
            );
            
            // Medium eddies rotating slower
            float mediumEddyAngle = slowTime * 0.2 + turbulenceSeed2 * 80.0;
            vec3 mediumEddyRotation = vec3(
              sin(mediumEddyAngle) * 0.12,
              cos(mediumEddyAngle * 0.8) * 0.08,
              cos(mediumEddyAngle) * 0.12
            );
            
            // Combine rotations
            vec3 totalRotation = rotatedSamplePos + smallEddyRotation + mediumEddyRotation;
            
            // Create flowing turbulent bands using 3D noise with rotational motion
            float flow = turbulence3D(totalRotation * vec3(3.0, 2.5, 3.0), 6);
            float distortion = turbulence3D(totalRotation * vec3(4.5, 1.5, 4.5) + vec3(flow * 0.5, 0.0, 0.0), 4) * 0.3;
            
            // Multiple band layers with different frequencies - use latitude (v) for horizontal bands
            float mainBands = sin((v + distortion) * 20.0) * 0.5 + 0.5;
            float subBands = sin((v + distortion * 1.5) * 40.0) * 0.5 + 0.5;
            float fineBands = sin((v + flow * 0.2) * 80.0) * 0.5 + 0.5;
            
            // Combine bands with different weights
            float bandMix = mainBands * 0.6 + subBands * 0.3 + fineBands * 0.1;
            
            // Add turbulent spots and storms using 3D noise - scaled down for larger storm features
            // Storms rotate in circular patterns with some wobble
            float stormSeed = seededRandom(planetSeed * 4.3);
            float stormRotationAngle = slowTime * 0.4 + stormSeed * 100.0;
            
            // Create circular storm motion with spiral component
            vec3 stormRotation = vec3(
              samplePos.x * cos(stormRotationAngle) - samplePos.z * sin(stormRotationAngle),
              samplePos.y,
              samplePos.x * sin(stormRotationAngle) + samplePos.z * cos(stormRotationAngle)
            );
            
            // Add some wobble/precession to storm motion
            float wobbleAngle = slowTime * 0.15 + stormSeed * 70.0;
            vec3 stormWobble = vec3(
              sin(wobbleAngle) * 0.1,
              cos(wobbleAngle * 0.8) * 0.08,
              cos(wobbleAngle) * 0.1
            );
            
            float storms = turbulence3D((stormRotation + stormWobble) * vec3(4.0, 3.0, 4.0), 5);
            float spotPattern = smoothstep(0.6, 0.8, storms);
            
            // Create color variations across bands
            // Add very slow color shifting to simulate changing atmospheric chemistry
            // Use multiple frequencies for less predictable variation
            float colorShiftSeed = seededRandom(planetSeed * 5.7);
            float colorShift = sin(slowTime * 0.05 + colorShiftSeed * 50.0) * 0.03 
                             + cos(slowTime * 0.04 + colorShiftSeed * 80.0) * 0.02 
                             + 1.0; // Subtle ~5% color variation
            float colorBand = sin(v * 15.0 + flow * 0.3 + slowTime * 0.025) * 0.5 + 0.5;
            
            // Rich color palette for gas giants using varied base color
            vec3 lightBand = variedBaseColor * 1.3 * colorShift; // Brighter zones with color shift
            vec3 darkBand = variedBaseColor * 0.7; // Darker zones stay stable
            vec3 stormColor = variedBaseColor * vec3(1.2, 1.1, 0.9) * colorShift; // Slightly warmer storms with variation
            
            // Mix colors based on bands and turbulence
            colorModulation = mix(darkBand, lightBand, bandMix);
            colorModulation = mix(colorModulation, stormColor, spotPattern * 0.4);
            
            // Add extra saturation and color variation
            colorModulation *= vec3(
              1.0 + colorBand * 0.2,
              1.0 + (1.0 - colorBand) * 0.15,
              1.0 + sin(colorBand * 3.14159) * 0.15
            );
            
            // Intensity variations from turbulence
            // Add subtle atmospheric pulsing (turbulence changes) - very slow
            float atmosphericPulse = sin(slowTime * 0.08) * 0.03 + 1.0; // Subtle 3% intensity variation
            intensity = (0.85 + bandMix * 0.3 + storms * 0.15) * atmosphericPulse;
            
            // Add polar storms with contrasting colors
            float polarDistance = abs(v - 0.5) * 2.0; // 0 at equator, 1 at poles
            if(polarDistance > 0.7) {
              float poleIntensity = smoothstep(0.7, 0.95, polarDistance);
              
              // Create swirling vortex pattern at poles using 3D noise
              vec2 poleCenter = vec2(0.5, v > 0.5 ? 1.0 : 0.0);
              vec2 toPole = vec2(u, v) - poleCenter;
              float distFromPole = length(toPole) * 4.0; // Scale for visibility
              
              // Add rotation to polar vortices (spinning storms) with chaotic variation
              float vortexSeed = seededRandom(planetSeed * 5.1);
              // Non-uniform rotation speed (speeds up and slows down) - much slower
              float vortexRotation = slowTime * 0.5 * (1.0 + sin(slowTime * 0.12 + vortexSeed * 100.0) * 0.3);
              float poleSign = v > 0.5 ? 1.0 : -1.0; // Opposite rotation for each pole
              
              // Spiral distortion using 3D noise with rotation
              float angle = atan(toPole.y, toPole.x) + vortexRotation * poleSign;
              vec3 spiralPos = samplePos + vec3(distFromPole * 1.2, angle * 0.8, distFromPole * 1.2);
              float spiral = turbulence3D(spiralPos, 5);
              
              // Create storm pattern using 3D noise - scaled for larger features
              // Add rotation to the vortex pattern itself
              vec3 vortexPos = samplePos * vec3(8.0, 12.0, 8.0) + vec3(spiral * 0.5 + vortexRotation * poleSign * 0.3, spiral * 0.3, 0.0);
              float vortexPattern = turbulence3D(vortexPos, 6);
              
              // Storm mask - visible only near poles
              float stormMask = smoothstep(0.8, 0.4, distFromPole) * poleIntensity;
              
              // Contrasting color for polar storms
              // Use complementary hue by shifting RGB channels
              vec3 polarStormColor = vec3(
                variedBaseColor.b * 1.4,  // Shift colors for contrast
                variedBaseColor.r * 1.2,
                variedBaseColor.g * 1.3
              );
              
              // Add variation within the storm
              float stormColorVariation = vortexPattern * 0.3 + 0.7;
              polarStormColor *= stormColorVariation;
              
              // Blend polar storm into the base color
              colorModulation = mix(colorModulation, polarStormColor, stormMask * 0.8);
              
              // Add extra intensity variation in storms
              intensity += stormMask * (vortexPattern - 0.5) * 0.4;
            }
          }
          // Icy planets with thin branching crack networks
          else if(surfaceType == SURFACE_ICY) {
            // Use 3D position for seamless noise
            vec3 rotatedPos = vPosition;
            float cosRot = cos(rotation);
            float sinRot = sin(rotation);
            rotatedPos = vec3(
              vPosition.x * cosRot - vPosition.z * sinRot,
              vPosition.y,
              vPosition.x * sinRot + vPosition.z * cosRot
            );
            vec3 samplePos = normalize(rotatedPos);
            
            // Smooth ice base with very subtle variation using 3D noise - scaled for larger patterns
            float baseIce = turbulence3D(samplePos * 1.2, 2) * 0.05;
            
            // Create thin, interconnected crack networks
            float totalCracks = 0.0;
            
            // Main crack systems - more cracks, thinner lines
            for(int i = 0; i < 30; i++) {
              float seed = float(i) * 123.456;
              
              // Random crack origin point
              vec2 origin = vec2(
                hash(vec2(seed, seed * 2.0)),
                hash(vec2(seed * 3.0, seed * 4.0))
              );
              
              // Random crack direction angle
              float angle = hash(vec2(seed * 5.0, seed * 6.0)) * 6.28318;
              vec2 crackDir = vec2(cos(angle), sin(angle));
              
              // Create a directed crack from origin
              vec2 toPoint = vec2(u, v) - origin;
              
              // Project point onto crack direction
              float alongCrack = dot(toPoint, crackDir);
              
              // Perpendicular distance from crack line
              float perpDist = abs(dot(toPoint, vec2(-crackDir.y, crackDir.x)));
              
              // Add jagged noise to make crack irregular and zigzag
              // Multiple frequencies for realistic jagged appearance
              float jaggedNoise1 = turbulence(vec2(alongCrack * 30.0, seed), 3) * 0.005;
              float jaggedNoise2 = turbulence(vec2(alongCrack * 60.0, seed * 1.3), 2) * 0.003;
              float jaggedNoise3 = noise(vec2(alongCrack * 120.0, seed * 1.7)) * 0.0015;
              
              // Combine multiple noise layers for jagged effect with wider detection
              perpDist = perpDist + jaggedNoise1 + jaggedNoise2 + jaggedNoise3;
              
              // Draw longer cracks with thinner width
              if(alongCrack > 0.0 && alongCrack < 0.5) {
                // Thinner cracks with subtle taper, wider to accommodate jaggedness
                float widthTaper = 1.0 - (alongCrack / 0.5) * 0.3; // Less tapering
                float crackWidth = 0.004 * widthTaper + 0.0015; // Slightly wider for jagged lines
                
                float crack = smoothstep(crackWidth, crackWidth * 0.3, perpDist);
                totalCracks += crack * 0.2;
                
                // Add multiple sub-branches for network effect
                // Branch 1 at 1/3 along crack
                float branch1Point = 0.17;
                if(alongCrack > branch1Point && alongCrack < branch1Point + 0.25) {
                  float branchAngle1 = angle + 0.8; // Branch at ~45 degrees
                  vec2 branchDir1 = vec2(cos(branchAngle1), sin(branchAngle1));
                  vec2 branchOrigin1 = origin + crackDir * branch1Point;
                  vec2 toBranch1 = vec2(u, v) - branchOrigin1;
                  
                  float alongBranch1 = dot(toBranch1, branchDir1);
                  float perpBranch1 = abs(dot(toBranch1, vec2(-branchDir1.y, branchDir1.x)));
                  
                  // Add jagged noise to sub-branch
                  float branchJagged1 = turbulence(vec2(alongBranch1 * 50.0, seed * 2.1), 2) * 0.003;
                  perpBranch1 += branchJagged1;
                  
                  if(alongBranch1 > 0.0 && alongBranch1 < 0.2) {
                    float branchWidth1 = 0.0025; // Slightly wider
                    totalCracks += smoothstep(branchWidth1, branchWidth1 * 0.3, perpBranch1) * 0.15;
                  }
                }
                
                // Branch 2 at 2/3 along crack (opposite side)
                float branch2Point = 0.33;
                if(alongCrack > branch2Point && alongCrack < branch2Point + 0.2) {
                  float branchAngle2 = angle - 0.7; // Branch at opposite angle
                  vec2 branchDir2 = vec2(cos(branchAngle2), sin(branchAngle2));
                  vec2 branchOrigin2 = origin + crackDir * branch2Point;
                  vec2 toBranch2 = vec2(u, v) - branchOrigin2;
                  
                  float alongBranch2 = dot(toBranch2, branchDir2);
                  float perpBranch2 = abs(dot(toBranch2, vec2(-branchDir2.y, branchDir2.x)));
                  
                  // Add jagged noise to sub-branch
                  float branchJagged2 = turbulence(vec2(alongBranch2 * 50.0, seed * 2.7), 2) * 0.003;
                  perpBranch2 += branchJagged2;
                  
                  if(alongBranch2 > 0.0 && alongBranch2 < 0.15) {
                    float branchWidth2 = 0.0025; // Slightly wider
                    totalCracks += smoothstep(branchWidth2, branchWidth2 * 0.3, perpBranch2) * 0.12;
                  }
                }
              }
            }
            
            // More fine random cracks for network density
            for(int i = 0; i < 70; i++) {
              float seed = float(i) * 456.789 + 1000.0;
              vec2 crackPos = vec2(
                hash(vec2(seed, seed * 1.1)),
                hash(vec2(seed * 1.2, seed * 1.3))
              );
              float crackAngle = hash(vec2(seed * 1.4, seed * 1.5)) * 6.28318;
              vec2 crackDir = vec2(cos(crackAngle), sin(crackAngle));
              
              vec2 toPoint = vec2(u, v) - crackPos;
              float alongCrack = dot(toPoint, crackDir);
              float perpDist = abs(dot(toPoint, vec2(-crackDir.y, crackDir.x)));
              
              // Add jagged noise to fine cracks
              float fineJagged = turbulence(vec2(alongCrack * 80.0, seed * 0.5), 2) * 0.002;
              perpDist += fineJagged;
              
              // Longer fine cracks for better connectivity
              if(alongCrack > 0.0 && alongCrack < 0.12) {
                float fineCrack = smoothstep(0.002, 0.0008, perpDist); // Slightly wider
                totalCracks += fineCrack * 0.12;
              }
            }
            
            totalCracks = clamp(totalCracks, 0.0, 1.0);
            
            // Base intensity: bright ice surface
            intensity = 0.95 + baseIce;
            intensity -= totalCracks * 0.6; // Slightly darker cracks for visibility
            
            // Crack color modulation - slightly darker for denser network
            vec3 iceSurface = vec3(1.0, 1.0, 1.02);
            vec3 crackColor = vec3(0.03, 0.03, 0.06); // Darker blue-black
            colorModulation = mix(iceSurface, crackColor, totalCracks * 0.7);
          }
          // Volcanic planets with lava flows
          else if(surfaceType == SURFACE_VOLCANIC) {
            // Slow time for gradual lava movement
            float slowTime = time * 0.00005;
            
            // Generate seed-based variety parameters for this planet
            float lavaDensitySeed = seededRandom(planetSeed * 1.1);
            float lavaWidthSeed = seededRandom(planetSeed * 1.3);
            float lavaColorSeed = seededRandom(planetSeed * 1.7);
            float hotspotSeed = seededRandom(planetSeed * 2.1);
            float flowSpeedSeed = seededRandom(planetSeed * 2.3);
            float rockColorSeed = seededRandom(planetSeed * 2.7);
            
            // Vary lava coverage (0.4 = ~60% rock, 1.2 = ~90% lava)
            float lavaCoverage = 0.4 + lavaDensitySeed * 0.8;
            
            // Vary lava flow widths (0.06 - 0.12 range for main threshold)
            float lavaThickness = 0.06 + lavaWidthSeed * 0.06;
            
            // Vary flow speed (0.7x - 1.3x of base speed)
            float flowSpeed = 0.7 + flowSpeedSeed * 0.6;
            
            // Vary hotspot density (0.65 - 0.80 threshold = more or fewer pools)
            float hotspotThreshold = 0.65 + hotspotSeed * 0.15;
            
            // Use 3D position for seamless noise (no UV seam or pole distortion)
            // Apply rotation to the sampling position
            vec3 rotatedPos = vPosition;
            float cosRot = cos(rotation);
            float sinRot = sin(rotation);
            rotatedPos = vec3(
              vPosition.x * cosRot - vPosition.z * sinRot,
              vPosition.y,
              vPosition.x * sinRot + vPosition.z * cosRot
            );
            
            // Normalize and scale for lava pattern generation
            vec3 samplePos = normalize(rotatedPos);
            
            // Dark rocky base with turbulent variation (static) using 3D noise
            // Scale reduced to make patterns larger
            float baseRock = turbulence3D(samplePos * 3.0, 4) * 0.2;
            vec3 rockTint = vec3(
              0.2 + rockColorSeed * 0.15,        // R: 0.20 - 0.35
              0.2 + rockColorSeed * 0.10,        // G: 0.20 - 0.30  
              0.2 + rockColorSeed * 0.08         // B: 0.20 - 0.28
            );
            
            // Add seed-based offset to lava patterns for uniqueness
            vec3 seedOffset1 = vec3(seededRandom(planetSeed * 3.1), seededRandom(planetSeed * 3.2), seededRandom(planetSeed * 3.3)) * 10.0;
            vec3 seedOffset2 = vec3(seededRandom(planetSeed * 3.7), seededRandom(planetSeed * 3.8), seededRandom(planetSeed * 3.9)) * 10.0;
            vec3 seedOffset3 = vec3(seededRandom(planetSeed * 4.1), seededRandom(planetSeed * 4.2), seededRandom(planetSeed * 4.3)) * 10.0;
            
            // Time-based flow offset in 3D (primarily along one axis for directional flow)
            vec3 flowOffset1 = vec3(slowTime * 0.3 * flowSpeed, slowTime * 0.1 * flowSpeed, 0.0);
            vec3 flowOffset2 = vec3(slowTime * 0.25 * flowSpeed, slowTime * 0.12 * flowSpeed, 0.0);
            vec3 flowOffset3 = vec3(slowTime * 0.4 * flowSpeed, slowTime * 0.15 * flowSpeed, 0.0);
            vec3 flowOffset4 = vec3(slowTime * 0.6 * flowSpeed, slowTime * 0.2 * flowSpeed, 0.0);
            
            // Create glowing lava veins at multiple scales with flowing animation using 3D noise
            // Scale reduced to make patterns larger (6.0 -> 2.5, etc.)
            // Large lava flows - main rivers of lava (slow flow)
            float lava1 = abs(turbulence3D(samplePos * 2.5 + seedOffset1 + flowOffset1, 4) - 0.5);
            float lava2 = abs(turbulence3D(samplePos * 2.5 + seedOffset2 + flowOffset2, 4) - 0.5);
            float largeLava = smoothstep(lavaThickness, 0.0, lava1) * 1.2 * lavaCoverage;
            largeLava += smoothstep(lavaThickness, 0.0, lava2) * 1.2 * lavaCoverage;
            
            // Medium lava cracks - branching flows (medium speed)
            float lava3 = abs(turbulence3D(samplePos * 5.0 + seedOffset1 * 0.5 + flowOffset3, 3) - 0.5);
            float mediumLava = smoothstep(lavaThickness * 0.75, 0.0, lava3) * 0.9 * lavaCoverage;
            
            // Fine lava cracks - small glowing veins (faster flow for thin streams)
            float lava4 = abs(turbulence3D(samplePos * 10.0 + seedOffset3 + flowOffset4, 2) - 0.5);
            float fineLava = smoothstep(lavaThickness * 0.5, 0.0, lava4) * 0.6 * lavaCoverage;
            
            // Combine all lava flows
            float totalLava = largeLava + mediumLava + fineLava;
            
            // Hot spots - pulsing lava pools with animation using 3D noise
            float hotSpots = turbulence3D(samplePos * 4.0 + seedOffset2 * 0.3 + vec3(slowTime * 0.2 * flowSpeed, slowTime * 0.08 * flowSpeed, 0.0), 5);
            float poolPattern = smoothstep(hotspotThreshold, hotspotThreshold + 0.15, hotSpots) * 0.8;
            
            // Add slow pulsing effect to lava intensity (breathing effect)
            // Vary pulse speed slightly per planet (0.0002 - 0.0004)
            float pulseSpeed = 0.0002 + flowSpeedSeed * 0.0002;
            float pulse = sin(time * pulseSpeed) * 0.15 + 0.85; // Gentle pulsing
            float fastPulse = sin(time * pulseSpeed * 2.5) * 0.1 + 0.9; // Subtle faster pulse for variety
            
            // Dark rocky base with glowing lava
            intensity = 0.3 + baseRock; // Dark base
            intensity += (totalLava * pulse + poolPattern * fastPulse); // Add pulsing glowing lava
            
            // Color: dark gray rock transitions to bright orange/red lava
            vec3 darkRock = rockTint;
            
            // Vary lava color - some planets have more orange, some more red, some more yellow
            vec3 glowingLava = vec3(
              1.8 + lavaColorSeed * 0.4,         // R: 1.8 - 2.2 (always bright red)
              0.5 + lavaColorSeed * 0.3,         // G: 0.5 - 0.8 (orange to yellow)
              0.1 + (1.0 - lavaColorSeed) * 0.2  // B: 0.1 - 0.3 (minimal blue, redder when seed is low)
            );
            
            // Add color variation to lava based on flow speed (hotter = brighter/whiter)
            float lavaHeat = pulse * fastPulse;
            vec3 hotLava = mix(glowingLava, glowingLava * vec3(1.3, 1.5, 2.0), lavaHeat * 0.3); // Brighter and whiter when pulsing
            
            colorModulation = mix(darkRock, hotLava, clamp(totalLava + poolPattern, 0.0, 1.0));
          }
          // Oceanic planets with water currents
          else if(surfaceType == SURFACE_OCEANIC) {
            // Use 3D position for seamless noise
            vec3 rotatedPos = vPosition;
            float cosRot = cos(rotation);
            float sinRot = sin(rotation);
            rotatedPos = vec3(
              vPosition.x * cosRot - vPosition.z * sinRot,
              vPosition.y,
              vPosition.x * sinRot + vPosition.z * cosRot
            );
            vec3 samplePos = normalize(rotatedPos);
            
            // Smooth water base with subtle variation using 3D noise - scaled for larger patterns
            float baseNoise = turbulence3D(samplePos * 2.0, 3) * 0.1;
            
            // Create water current patterns at multiple scales using 3D noise
            // Large currents - main flow patterns - scaled for larger features
            float current1 = abs(turbulence3D(samplePos * 3.0, 4) - 0.5);
            float current2 = abs(turbulence3D(samplePos * 3.0 + vec3(4.0, 2.0, 0.0), 4) - 0.5);
            float largeCurrent = smoothstep(0.05, 0.0, current1) * 0.25;
            largeCurrent += smoothstep(0.05, 0.0, current2) * 0.25;
            
            // Medium currents - secondary flows
            float current3 = abs(turbulence3D(samplePos * 6.0 + vec3(1.2, 2.8, 0.0), 3) - 0.5);
            float mediumCurrent = smoothstep(0.04, 0.0, current3) * 0.15;
            
            // Fine currents - small details
            float current4 = abs(turbulence3D(samplePos * 12.0 + vec3(6.0, 8.0, 0.0), 2) - 0.5);
            float fineCurrent = smoothstep(0.03, 0.0, current4) * 0.1;
            
            // Combine all currents
            float totalCurrents = largeCurrent + mediumCurrent + fineCurrent;
            
            // Create depth variation - deeper water is darker using 3D noise
            float depthVariation = turbulence3D(samplePos * 2.5, 4);
            
            // Keep intensity lower to preserve water color (0.6 - 0.9 range)
            intensity = 0.6 + baseNoise + depthVariation * 0.15;
            intensity += totalCurrents * 0.3; // Currents create lighter areas
            
            // Enhance water color saturation - preserve varied base blue/green
            colorModulation = variedBaseColor * 1.15; // Boost saturation
          }
          // Fallback for any unhandled surface types
          else {
            intensity = 0.8;
            colorModulation = variedBaseColor;
          }
          
          // Basic lighting from sun using world space normal and position
          vec3 lightDir = normalize(lightPosition - vWorldPosition);
          float diffuse = max(dot(vWorldNormal, lightDir), 0.0);
          
          // Enhance the lighting difference between day and night side
          float lighting = diffuse * 0.85 + 0.15; // Less ambient, more contrast
          
          // Add slight emissive on dark side for visibility
          float emissive = 0.1;
          
          // Add specular reflection for icy, oceanic, and terrestrial planets
          vec3 specular = vec3(0.0);
          if(surfaceType == SURFACE_ICY) {
            // Ice is very reflective
            vec3 viewDir = normalize(cameraPosition - vWorldPosition);
            vec3 reflectDir = reflect(-lightDir, vWorldNormal);
            float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
            specular = vec3(1.0) * spec * 0.6; // Bright white specular highlights
          }
          else if(surfaceType == SURFACE_OCEANIC) {
            // Water is moderately reflective
            vec3 viewDir = normalize(cameraPosition - vWorldPosition);
            vec3 reflectDir = reflect(-lightDir, vWorldNormal);
            float spec = pow(max(dot(viewDir, reflectDir), 0.0), 16.0);
            specular = variedBaseColor * spec * 0.4; // Colored specular highlights matching water
          }
          else if(surfaceType == SURFACE_TERRESTRIAL) {
            // Terrestrial planets - specular on oceans and ice caps
            vec3 viewDir = normalize(cameraPosition - vWorldPosition);
            vec3 reflectDir = reflect(-lightDir, vWorldNormal);
            
            // Recalculate terrain parameters using same seed-based values and 3D noise
            float continentScaleSeed = seededRandom(planetSeed * 1.1);
            float waterLevelSeed = seededRandom(planetSeed * 1.3);
            float iceCapSizeSeed = seededRandom(planetSeed * 1.7);
            
            // Match main shader's reduced continent scale (was 2.5-6.0, now 1.0-2.5)
            float continentScale = 1.0 + continentScaleSeed * 1.5;
            float landThreshold = 0.40 + waterLevelSeed * 0.15;
            
            // Use same distance-based AND habitability-based ice threshold as main shader
            float temperatureFactor = clamp(orbitalDistance, 0.0, 2.0);
            float minIceThreshold, maxIceThreshold;
            
            if (temperatureFactor < 0.5) {
              minIceThreshold = 0.85;
              maxIceThreshold = 0.92;
            } else if (temperatureFactor < 1.0) {
              minIceThreshold = 0.70;
              maxIceThreshold = 0.85;
            } else if (temperatureFactor < 1.5) {
              minIceThreshold = 0.30;
              maxIceThreshold = 0.70;
            } else {
              minIceThreshold = 0.10;
              maxIceThreshold = 0.30;
            }
            
            // Apply same habitability adjustments
            if (habitability < 0.6) {
              float coldnessFactor = (0.6 - habitability) / 0.6;
              float iceExpansion = coldnessFactor * 0.6;
              minIceThreshold = max(0.05, minIceThreshold - iceExpansion);
              maxIceThreshold = max(0.10, maxIceThreshold - iceExpansion);
            } else if (habitability > 0.7) {
              float warmthFactor = (habitability - 0.7) / 0.3;
              float iceShrinkage = warmthFactor * 0.15;
              minIceThreshold = min(0.92, minIceThreshold + iceShrinkage);
              maxIceThreshold = min(0.95, maxIceThreshold + iceShrinkage);
            }
            
            float baseIceThreshold = minIceThreshold + iceCapSizeSeed * (maxIceThreshold - minIceThreshold);
            
            // Use 3D position for seamless noise
            vec3 rotatedPos2 = vPosition;
            float cosRot2 = cos(rotation);
            float sinRot2 = sin(rotation);
            rotatedPos2 = vec3(
              vPosition.x * cosRot2 - vPosition.z * sinRot2,
              vPosition.y,
              vPosition.x * sinRot2 + vPosition.z * cosRot2
            );
            vec3 samplePos2 = normalize(rotatedPos2) * continentScale;
            
            float continentNoise = turbulence3D(samplePos2, 5);
            float distanceFromPole = abs(v - 0.5) * 2.0;
            
            // Match irregular ice cap boundary using 3D noise
            float iceNoise = turbulence3D(samplePos2 * 0.8, 4) * 0.12;
            float iceThreshold = baseIceThreshold - iceNoise;
            
            bool isWater = continentNoise <= landThreshold;
            bool isPolarIce = distanceFromPole > iceThreshold;
            
            if (isPolarIce) {
              // Ice caps with layered specular
              // Inner ice: very glossy and reflective
              // Outer ice: less glossy
              
              float innerIceThreshold = iceThreshold + 0.05;
              bool isInnerIce = distanceFromPole > innerIceThreshold;
              
              if (isInnerIce) {
                // Inner core: very reflective and glossy
                float spec = pow(max(dot(viewDir, reflectDir), 0.0), 64.0); // Higher shininess
                specular = vec3(1.0) * spec * 0.7; // Stronger reflection
              } else {
                // Outer ice: less glossy
                float spec = pow(max(dot(viewDir, reflectDir), 0.0), 24.0); // Lower shininess
                specular = vec3(0.9, 0.95, 1.0) * spec * 0.4; // Weaker, bluish reflection
              }
            }
            else if (isWater) {
              // Oceans are moderately reflective
              float spec = pow(max(dot(viewDir, reflectDir), 0.0), 16.0);
              specular = vec3(0.2, 0.3, 0.5) * spec * 0.3;
              
              // Add specular for sea ice near ice caps
              if (distanceFromPole > iceThreshold * 0.85) {
                float distanceBeyondIceCap = distanceFromPole - iceThreshold;
                float seaIceRange = 0.15;
                float seaIceIntensity = smoothstep(seaIceRange, 0.0, distanceBeyondIceCap);
                
                if (seaIceIntensity > 0.0) {
                  // Recreate ice pattern (same as main shader)
                  float icePattern1 = turbulence3D(samplePos2 * 8.0, 4);
                  float icePattern2 = turbulence3D(samplePos2 * 15.0, 3);
                  float largeFloes = smoothstep(0.45, 0.55, icePattern1) * seaIceIntensity;
                  float smallFloes = smoothstep(0.5, 0.6, icePattern2) * seaIceIntensity * 0.5;
                  float seaIceZone = clamp(largeFloes + smallFloes, 0.0, 1.0);
                  
                  // Sea ice gets icy specular (less than ice caps but more than water)
                  float iceSpec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
                  vec3 iceSpecular = vec3(0.9, 0.95, 1.0) * iceSpec * 0.5;
                  
                  // Blend ice specular with water specular
                  specular = mix(specular, iceSpecular, seaIceZone);
                }
              }
            }
          }
          
          // Apply color modulation
          vec3 finalColor = colorModulation * intensity * (lighting + emissive) + specular;
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
    });
  }

  /**
   * Creates a shader material for planet atmospheres with enhanced Fresnel effect
   * For terrestrial planets, syncs with ocean color based on seed
   */
  createAtmosphereMaterial(
    color: number,
    planetSeed?: number,
    isTerrestrial: boolean = false
  ): THREE.ShaderMaterial {
    return createAtmosphereMaterialModule(color, planetSeed, isTerrestrial);
  }

  /**
   * Creates a standard material for ships
   */
  createShipMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 0.3,
      metalness: 0.8,
      roughness: 0.2,
    });
  }

  /**
   * Creates a basic material for glow layers around stars
   */
  createGlowMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: opacity,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    });
  }

  /**
   * Creates a shader material for weather/cloud layers on planets
   */
  createCloudMaterial(
    baseColor: number,
    cloudCoverage: number = 0.5,
    planetSeed: number = 0
  ): THREE.ShaderMaterial {
    return createCloudMaterialModule(baseColor, cloudCoverage, planetSeed);
  }

  /**
   * Creates a shader material for star gates with pulsing glow and energy effects
   */
  createGateMaterial(color: number, isExplored: boolean): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        baseColor: { value: new THREE.Color(color) },
        time: { value: 0 },
        glowIntensity: { value: isExplored ? 1.2 : 0.8 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 baseColor;
        uniform float time;
        uniform float glowIntensity;
        varying vec3 vNormal;
        varying vec3 vPosition;
        
        void main() {
          // Fresnel effect - brighter at edges
          vec3 viewDirection = normalize(cameraPosition - vPosition);
          float fresnel = pow(1.0 - abs(dot(viewDirection, vNormal)), 2.0);
          
          // Pulsing effect (very slow)
          float pulse = sin(time * 0.0002) * 0.1 + 0.9;
          
          // Energy ripples (very slow)
          float ripple = sin(vPosition.y * 3.0 + time * 0.0003) * 0.3 + 0.7;
          ripple = smoothstep(0.4, 0.8, ripple);
          
          // Combine effects
          float intensity = (fresnel * 0.5 + ripple * 0.2 + 0.6) * pulse * glowIntensity;
          
          vec3 finalColor = baseColor * intensity;
          
          // Add emissive glow
          gl_FragColor = vec4(finalColor, 0.9);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
    });
  }

  /**
   * Creates a shader material for asteroids based on composition
   */
  createAsteroidMaterial(
    composition: "water" | "metal" | "silica",
    color: number,
    shape: "spherical" | "elliptical" | "rugged"
  ): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        baseColor: { value: new THREE.Color(color) },
        lightPosition: { value: new THREE.Vector3(0, 0, 0) },
        composition: {
          value:
            composition === "water" ? 0.0 : composition === "metal" ? 1.0 : 2.0,
        },
        shape: {
          value:
            shape === "spherical" ? 0.0 : shape === "elliptical" ? 1.0 : 2.0,
        },
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
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 baseColor;
        uniform vec3 lightPosition;
        uniform float composition;
        uniform float shape;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        
        // Hash function for 2D (for craters)
        float hash2(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        
        // Hash function for 3D (for noise)
        float hash(vec3 p) {
          return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
        }
        
        // 3D noise function
        float noise(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          
          return mix(
            mix(
              mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x),
              f.y
            ),
            mix(
              mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x),
              f.y
            ),
            f.z
          );
        }
        
        // Generate craters (adapted from planet shader)
        float craters(vec2 uv, float scale) {
          vec2 grid = floor(uv * scale);
          vec2 localUV = fract(uv * scale);
          
          float craterEffect = 0.0;
          
          // Check this cell and neighboring cells
          for(float y = -1.0; y <= 1.0; y++) {
            for(float x = -1.0; x <= 1.0; x++) {
              vec2 neighbor = grid + vec2(x, y);
              
              // Generate random position for crater in this cell
              vec2 craterPos = vec2(
                hash2(neighbor),
                hash2(neighbor + vec2(13.7, 27.3))
              );
              
              // Generate random size (smaller for asteroids)
              float craterSize = 0.15 + hash2(neighbor + vec2(50.1, 60.2)) * 0.25;
              
              // Calculate distance to crater center
              vec2 toCenter = (localUV - vec2(x, y)) - craterPos;
              float dist = length(toCenter);
              
              // Only create crater if random value is above threshold
              float shouldExist = hash2(neighbor + vec2(100.0, 200.0));
              if(shouldExist > 0.55) { // More craters on asteroids
                // Crater bowl with raised rim
                if(dist < craterSize) {
                  float rimDist = abs(dist - craterSize * 0.85) / (craterSize * 0.15);
                  float rimHeight = smoothstep(1.0, 0.0, rimDist) * 0.2;
                  float bowlDepth = smoothstep(craterSize, 0.0, dist) * -0.3;
                  craterEffect += bowlDepth + rimHeight;
                }
              }
            }
          }
          
          return craterEffect;
        }
        
        void main() {
          // Lighting
          vec3 lightDir = normalize(lightPosition - vWorldPosition);
          float diffuse = max(dot(vWorldNormal, lightDir), 0.0);
          
          // Ambient light (higher for asteroids so they're visible even in shadow)
          float ambient = 0.5;
          
          // Surface variation based on noise
          float n1 = noise(vPosition * 5.0);
          float n2 = noise(vPosition * 15.0);
          float surfaceVariation = n1 * 0.7 + n2 * 0.3;
          
          // Add craters for spherical and elliptical asteroids
          float craterIntensity = 0.0;
          if (shape < 1.5) { // spherical (0.0) or elliptical (1.0)
            // Calculate spherical UV coordinates for crater mapping
            vec3 norm = normalize(vPosition);
            float u = atan(norm.z, norm.x) / (2.0 * 3.14159) + 0.5;
            float v = asin(norm.y) / 3.14159 + 0.5;
            
            // Multiple layers of craters at different scales
            float largeCraters = craters(vec2(u, v), 6.0);
            float mediumCraters = craters(vec2(u, v), 12.0) * 0.7;
            float smallCraters = craters(vec2(u, v), 24.0) * 0.5;
            
            craterIntensity = largeCraters + mediumCraters + smallCraters;
          }
          
          // Material properties based on composition
          float roughness = 0.9; // Default (silica)
          float metallic = 0.1;
          float specular = 0.1;
          
          if (composition < 0.5) {
            // Water ice - smoother, more reflective
            roughness = 0.3;
            metallic = 0.0;
            specular = 0.5;
          } else if (composition < 1.5) {
            // Metal - very reflective
            roughness = 0.2;
            metallic = 0.8;
            specular = 0.9;
          }
          
          // Specular highlight
          vec3 viewDir = normalize(cameraPosition - vWorldPosition);
          vec3 reflectDir = reflect(-lightDir, vWorldNormal);
          float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0 * (1.0 - roughness));
          vec3 specularColor = vec3(1.0) * spec * specular;
          
          // Combine lighting with crater intensity
          float lighting = ambient + diffuse * (1.0 - ambient);
          lighting += craterIntensity; // Add crater depth and height variations
          
          // Apply surface variation
          vec3 surfaceColor = baseColor * (0.8 + surfaceVariation * 0.4);
          
          // Mix in metallic reflections
          surfaceColor = mix(surfaceColor, surfaceColor * 1.5, metallic);
          
          vec3 finalColor = surfaceColor * lighting + specularColor;
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
    });
  }
}
