import * as THREE from "three";

/**
 * Creates a shader material for volcanic planets with animated lava flows
 * Features:
 * - Multi-scale lava flows (large rivers, medium cracks, fine veins)
 * - Animated lava movement using time-based offsets
 * - Pulsing lava pools (hotspots)
 * - Seed-based variation for unique lava patterns per planet
 * - Dark rocky base with glowing orange/red lava
 * - Supports multiple light sources
 */
export function createVolcanicPlanetMaterial(
  color: number,
  seed: number,
  normalizedDistance: number
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color(color) },
      lightPosition1: { value: new THREE.Vector3(0, 0, 0) }, // Primary star
      lightPosition2: { value: new THREE.Vector3(0, 0, 0) }, // Companion star 1
      lightPosition3: { value: new THREE.Vector3(0, 0, 0) }, // Companion star 2
      lightIntensity1: { value: 1.0 },
      lightIntensity2: { value: 0.0 },
      lightIntensity3: { value: 0.0 },
      rotation: { value: 0.0 },
      planetSeed: { value: seed },
      orbitalDistance: { value: normalizedDistance },
      time: { value: 0.0 }, // For animated lava flows
    },
    lights: false,
    vertexShader: `
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
      uniform vec3 lightPosition1;
      uniform vec3 lightPosition2;
      uniform vec3 lightPosition3;
      uniform float lightIntensity1;
      uniform float lightIntensity2;
      uniform float lightIntensity3;
      uniform float rotation;
      uniform float planetSeed;
      uniform float orbitalDistance;
      uniform float time;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec2 vUv;
      
      // Seeded random for consistent variation per planet
      float seededRandom(float seed) {
        return fract(sin(seed) * 43758.5453123);
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
      
      void main() {
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
        float intensity = 0.3 + baseRock; // Dark base
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
        
        vec3 colorModulation = mix(darkRock, hotLava, clamp(totalLava + poolPattern, 0.0, 1.0));
        
        // Lighting from all light sources using world space normal and position
        float totalDiffuse = 0.0;
        
        if (lightIntensity1 > 0.0) {
          vec3 lightDir1 = normalize(lightPosition1 - vWorldPosition);
          totalDiffuse += max(dot(vWorldNormal, lightDir1), 0.0) * lightIntensity1;
        }
        
        if (lightIntensity2 > 0.0) {
          vec3 lightDir2 = normalize(lightPosition2 - vWorldPosition);
          totalDiffuse += max(dot(vWorldNormal, lightDir2), 0.0) * lightIntensity2;
        }
        
        if (lightIntensity3 > 0.0) {
          vec3 lightDir3 = normalize(lightPosition3 - vWorldPosition);
          totalDiffuse += max(dot(vWorldNormal, lightDir3), 0.0) * lightIntensity3;
        }
        
        // Clamp and enhance the lighting difference between day and night side
        totalDiffuse = clamp(totalDiffuse, 0.0, 1.0);
        float lighting = totalDiffuse * 0.85 + 0.15; // Less ambient, more contrast
        
        // Add slight emissive on dark side for visibility
        float emissive = 0.1;
        
        // Apply color modulation and lighting
        vec3 finalColor = colorModulation * intensity * (lighting + emissive);
        
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });
}

