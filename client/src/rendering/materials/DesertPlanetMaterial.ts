import * as THREE from "three";

/**
 * Generate desert planet texture with sand dunes, rocky areas, and oases
 * Using multi-octave Perlin noise for realistic terrain
 */
function generateDesertTexture(seed: number, baseColor: string): THREE.Texture {
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

  // Generate planet variety parameters
  const waterLevelSeed = seededRandom(seed * 1.2);
  const continentSizeSeed = seededRandom(seed * 1.5);

  // Desert planets: very little water (5-25%)
  const waterLevel = 0.75 + waterLevelSeed * 0.2;

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

      // Determine if land or oasis/dry lake
      const idx = (y * width + x) * 4;

      if (elevation > waterLevel) {
        // LAND - sandy, rocky terrain
        const heightAboveSea = (elevation - waterLevel) / (1 - waterLevel);
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

        data[idx + 3] = 255; // Alpha
      } else {
        // WATER - small oases or dry lakes (brownish water)
        const depth = (waterLevel - elevation) / waterLevel;
        const depthFactor = 1 - depth * 0.4;
        data[idx] = 100 * depthFactor; // R - murky water
        data[idx + 1] = 140 * depthFactor; // G
        data[idx + 2] = 160 * depthFactor; // B
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
 * Creates a MeshStandardMaterial for desert planets with procedurally generated textures
 * Features sand dunes, rocky areas, and occasional oases
 */
export function createDesertPlanetMaterial(
  color: number,
  seed: number
): THREE.MeshStandardMaterial {
  // Generate desert terrain texture
  const desertTexture = generateDesertTexture(
    seed,
    new THREE.Color(color).getStyle()
  );

  // Use MeshStandardMaterial for PBR lighting with the terrain texture
  return new THREE.MeshStandardMaterial({
    map: desertTexture,
    roughness: 0.9, // Very rough surface (sand)
    metalness: 0.05, // Minimal metallic (some minerals in sand)
  });
}

