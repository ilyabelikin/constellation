import * as THREE from "three";

/**
 * Generate ice planet crack texture using Canvas 2D API
 * Creates seed-based variations in ice color and crack patterns
 */
export function generateIcePlanetTexture(
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

  // Generate seed-based ice color variations
  const iceColorSeed = seededRandom(seed * 2.3);
  const iceBrightnessSeed = seededRandom(seed * 2.9);
  const iceTintSeed = seededRandom(seed * 3.1);

  // Determine ice color type based on seed
  let r: number, g: number, b: number;

  if (iceColorSeed < 0.25) {
    // Pure white ice (pristine, fresh snow)
    const brightness = 240 + Math.floor(iceBrightnessSeed * 15);
    r = brightness;
    g = brightness;
    b = brightness;
  } else if (iceColorSeed < 0.5) {
    // Bluish ice (compressed glacier ice)
    const baseBrightness = 200 + Math.floor(iceBrightnessSeed * 40);
    r = baseBrightness - 20;
    g = baseBrightness - 10;
    b = baseBrightness + Math.floor(iceTintSeed * 15); // More blue
  } else if (iceColorSeed < 0.75) {
    // Cyan ice (exotic frozen methane/ammonia)
    const baseBrightness = 190 + Math.floor(iceBrightnessSeed * 40);
    r = baseBrightness - 30;
    g = baseBrightness + Math.floor(iceTintSeed * 10);
    b = baseBrightness + Math.floor(iceTintSeed * 20); // Cyan tint
  } else {
    // Pale gray-white ice (dusty, aged ice)
    const baseBrightness = 210 + Math.floor(iceBrightnessSeed * 30);
    r = baseBrightness;
    g = baseBrightness - Math.floor(iceTintSeed * 10);
    b = baseBrightness - Math.floor(iceTintSeed * 5); // Slight warm tint
  }

  const seedBasedIceColor = `rgb(${r}, ${g}, ${b})`;

  // Fill with seed-based ice color
  ctx.fillStyle = seedBasedIceColor;
  ctx.fillRect(0, 0, width, height);

  // Generate seed-based crack color variations
  const crackColorSeed = seededRandom(seed * 3.7);
  const crackDepthSeed = seededRandom(seed * 4.3);

  // Determine crack color based on seed
  let crackR: number, crackG: number, crackB: number, crackAlpha: number;

  if (crackColorSeed < 0.33) {
    // Dark blue-black cracks (deep ice crevasses)
    crackR = 5 + Math.floor(crackDepthSeed * 10);
    crackG = 10 + Math.floor(crackDepthSeed * 15);
    crackB = 20 + Math.floor(crackDepthSeed * 20);
    crackAlpha = 0.5 + crackDepthSeed * 0.2; // 0.5-0.7 opacity
  } else if (crackColorSeed < 0.66) {
    // Pure black cracks (very deep fissures)
    crackR = Math.floor(crackDepthSeed * 8);
    crackG = Math.floor(crackDepthSeed * 8);
    crackB = Math.floor(crackDepthSeed * 12);
    crackAlpha = 0.6 + crackDepthSeed * 0.2; // 0.6-0.8 opacity
  } else {
    // Gray-blue cracks (shallow surface cracks)
    crackR = 15 + Math.floor(crackDepthSeed * 20);
    crackG = 20 + Math.floor(crackDepthSeed * 25);
    crackB = 30 + Math.floor(crackDepthSeed * 25);
    crackAlpha = 0.4 + crackDepthSeed * 0.2; // 0.4-0.6 opacity (more subtle)
  }

  const crackColor = `rgba(${crackR}, ${crackG}, ${crackB}, ${crackAlpha})`;

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
 * Creates an ice planet material with procedural crack texture
 * Returns MeshPhongMaterial for glossy ice appearance
 */
export function createIcePlanetMaterial(
  color: number,
  planetSeed: number
): THREE.MeshPhongMaterial {
  // Generate crack texture
  const crackTexture = generateIcePlanetTexture(
    planetSeed,
    new THREE.Color(color).getStyle()
  );

  // Create MeshPhongMaterial with high shininess and reflectivity for ice
  const material = new THREE.MeshPhongMaterial({
    map: crackTexture,
    shininess: 100, // High shininess for glossy ice surface
    specular: new THREE.Color("#ffffff"), // White specular highlights
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.1, // Subtle self-illumination
  });

  // Store metadata for debug seed updates
  (material as any).userData = {
    isIcePlanet: true,
    baseColor: color,
  };

  return material;
}

/**
 * Regenerate ice planet texture with a new seed
 * Used for debug mode to iterate on ice planet appearances
 */
export function regenerateIcePlanetTexture(
  material: THREE.MeshPhongMaterial,
  newSeed: number
): void {
  // Check if this is an ice planet material
  if (!(material as any).userData?.isIcePlanet) {
    console.warn("Material is not an ice planet material");
    return;
  }

  const baseColor = (material as any).userData.baseColor;
  if (baseColor === undefined) {
    console.warn("Base color not found in material userData");
    return;
  }

  // Generate new texture with the new seed
  const newTexture = generateIcePlanetTexture(
    newSeed,
    new THREE.Color(baseColor).getStyle()
  );

  // Dispose old texture to free memory
  if (material.map) {
    material.map.dispose();
  }

  // Update material with new texture
  material.map = newTexture;
  material.needsUpdate = true;

  console.log(`Regenerated ice planet texture with seed ${newSeed}`);
}
