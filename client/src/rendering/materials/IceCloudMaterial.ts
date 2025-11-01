import * as THREE from "three";

/**
 * Creates a shader material for ice world atmospheric frost/ice crystal layers
 * with 3D patterns and slow atmospheric circulation
 * Inspired by desert storm clouds but adapted for frozen atmospheres
 */
export function createIceCloudMaterial(
  baseColor: number,
  frostCoverage: number = 0.5,
  planetSeed: number = 0
): THREE.ShaderMaterial {
  const color = new THREE.Color(baseColor);

  const vertexShader = `
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    
    void main() {
      vPosition = position;
      vNormal = normalize(normalMatrix * normal);
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform vec3 baseColor;
    uniform float rotation;
    uniform float frostCoverage;
    uniform float time;
    uniform float planetSeed;
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    
    // Seeded random for consistent variation per planet
    float seededRandom(float seed) {
      return fract(sin(seed) * 43758.5453123);
    }
    
    // Better hash function for noise
    vec3 hash3(vec3 p) {
      p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
               dot(p, vec3(269.5, 183.3, 246.1)),
               dot(p, vec3(113.5, 271.9, 124.6)));
      return fract(sin(p) * 43758.5453123);
    }
    
    // Smooth 3D noise with interpolation
    float noise3D(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      
      // Smooth interpolation
      f = f * f * (3.0 - 2.0 * f);
      
      // Sample corners
      float n000 = hash3(i + vec3(0.0, 0.0, 0.0)).x;
      float n100 = hash3(i + vec3(1.0, 0.0, 0.0)).x;
      float n010 = hash3(i + vec3(0.0, 1.0, 0.0)).x;
      float n110 = hash3(i + vec3(1.0, 1.0, 0.0)).x;
      float n001 = hash3(i + vec3(0.0, 0.0, 1.0)).x;
      float n101 = hash3(i + vec3(1.0, 0.0, 1.0)).x;
      float n011 = hash3(i + vec3(0.0, 1.0, 1.0)).x;
      float n111 = hash3(i + vec3(1.0, 1.0, 1.0)).x;
      
      // Trilinear interpolation
      float nx00 = mix(n000, n100, f.x);
      float nx10 = mix(n010, n110, f.x);
      float nx01 = mix(n001, n101, f.x);
      float nx11 = mix(n011, n111, f.x);
      
      float nxy0 = mix(nx00, nx10, f.y);
      float nxy1 = mix(nx01, nx11, f.y);
      
      return mix(nxy0, nxy1, f.z);
    }
    
    // Fractal Brownian Motion for ice crystal patterns
    float fbm(vec3 p) {
      float value = 0.0;
      float amplitude = 0.5;
      float frequency = 1.0;
      
      for(int i = 0; i < 6; i++) {
        value += amplitude * noise3D(p * frequency);
        frequency *= 2.0;
        amplitude *= 0.5;
      }
      
      return value;
    }
    
    // Turbulent noise for crystalline effects
    float turbulence(vec3 p) {
      float value = 0.0;
      float amplitude = 0.5;
      float frequency = 1.0;
      
      for(int i = 0; i < 5; i++) {
        value += amplitude * abs(noise3D(p * frequency));
        frequency *= 2.0;
        amplitude *= 0.5;
      }
      
      return value;
    }
    
    void main() {
      // Use actual 3D position on sphere (normalized) - avoids pole singularities
      vec3 spherePos = normalize(vPosition);
      
      // Apply rotation around Y axis for planet spin
      float cosRot = cos(rotation);
      float sinRot = sin(rotation);
      vec3 rotatedPos = vec3(
        spherePos.x * cosRot - spherePos.z * sinRot,
        spherePos.y,
        spherePos.x * sinRot + spherePos.z * cosRot
      );
      
      // Scale up for better noise frequency
      vec3 samplePos = rotatedPos * 3.0;
      
      // Add seed-based offset for unique frost patterns per planet
      vec3 seedOffset = vec3(
        seededRandom(planetSeed * 1.1) * 100.0,
        seededRandom(planetSeed * 1.3) * 100.0,
        seededRandom(planetSeed * 1.7) * 100.0
      );
      samplePos += seedOffset;
      
      // SLOW ATMOSPHERIC CIRCULATION
      // Ice worlds have slow, sluggish atmospheres due to cold temperatures
      
      // Seed-based circulation patterns (each planet has unique flow)
      vec3 flowDir1 = vec3(
        seededRandom(planetSeed * 2.1) * 2.0 - 1.0,
        seededRandom(planetSeed * 2.3) * 2.0 - 1.0,
        seededRandom(planetSeed * 2.5) * 2.0 - 1.0
      );
      flowDir1 = normalize(flowDir1);
      
      vec3 flowDir2 = vec3(
        seededRandom(planetSeed * 3.1) * 2.0 - 1.0,
        seededRandom(planetSeed * 3.3) * 2.0 - 1.0,
        seededRandom(planetSeed * 3.5) * 2.0 - 1.0
      );
      flowDir2 = normalize(flowDir2);
      
      vec3 flowDir3 = vec3(
        seededRandom(planetSeed * 4.1) * 2.0 - 1.0,
        seededRandom(planetSeed * 4.3) * 2.0 - 1.0,
        seededRandom(planetSeed * 4.5) * 2.0 - 1.0
      );
      flowDir3 = normalize(flowDir3);
      
      // Very slow speeds for frozen atmosphere circulation
      float flowSpeed1 = 0.0000008 * (0.8 + seededRandom(planetSeed * 5.1) * 0.4);
      float flowSpeed2 = 0.0000012 * (0.7 + seededRandom(planetSeed * 5.3) * 0.6);
      float flowSpeed3 = 0.0000006 * (0.9 + seededRandom(planetSeed * 5.5) * 0.3);
      
      // Apply multi-directional atmospheric flow
      vec3 flow1 = flowDir1 * time * flowSpeed1;
      vec3 flow2 = flowDir2 * time * flowSpeed2;
      vec3 flow3 = flowDir3 * time * flowSpeed3;
      
      // Sample frost/ice crystal patterns at different scales with flow offset
      float frostPattern1 = fbm(samplePos + flow1);
      float frostPattern2 = fbm(samplePos * 0.8 + flow2);
      float frostPattern3 = turbulence(samplePos * 1.3 + flow3);
      
      // Combine patterns with different weights for complex crystalline structure
      float combinedPattern = frostPattern1 * 0.5 + frostPattern2 * 0.3 + frostPattern3 * 0.2;
      
      // Add fine ice crystal detail at higher frequency
      float crystalDetail = turbulence(samplePos * 4.0 + flow1 * 2.0) * 0.18;
      combinedPattern += crystalDetail;
      
      // Add altitude-based variation (stratification of ice clouds)
      float altitude = abs(vPosition.y / length(vPosition));
      vec3 stratificationFlow = vec3(sin(time * 0.000008), cos(time * 0.000008), 0.0) * altitude * 0.4;
      float stratification = fbm(samplePos * 0.6 + stratificationFlow) * 0.2;
      combinedPattern += stratification;
      
      // Create latitude-based frost distribution
      // Ice crystals more common at higher latitudes (polar regions)
      float latitudeFactor = abs(spherePos.y); // 0 at equator, 1 at poles
      
      // Moderate frost formation near poles (thin atmosphere = less concentration)
      float polarBias = latitudeFactor * latitudeFactor * 0.25 + 0.65; // Varies 0.65-0.9
      
      // Generate seed-based coverage variation
      float coverageSeed = seededRandom(planetSeed * 6.1);
      float seedCoverage = 0.75 + coverageSeed * 0.5; // 0.75-1.25 multiplier
      float finalCoverage = frostCoverage * seedCoverage;
      
      // Threshold for frost formation (sparse ice world atmosphere)
      float coverageThreshold = mix(0.65, 0.45, finalCoverage); // Higher threshold = less coverage
      float coverageRange = mix(0.15, 0.20, finalCoverage); // Narrower range = sharper edges
      
      // Create frost mask with soft edges
      float frostMask = smoothstep(
        coverageThreshold, 
        coverageThreshold + coverageRange, 
        combinedPattern
      ) * polarBias;
      
      // Add wispy, feathery edges to frost clouds (ice crystals are light and delicate)
      float edgeNoise = noise3D(samplePos * 5.0 + flow1 * 3.0);
      frostMask *= (0.35 + edgeNoise * 0.65); // More aggressive feathering
      
      // Apply frost coverage as density multiplier (much sparser)
      frostMask *= (0.20 + finalCoverage * 0.50); // Reduced base density
      
      // ICE CRYSTAL COLOR PALETTE (bright whites, pale blues, slight cyan)
      // Generate palette based on seed
      float colorSeed = seededRandom(planetSeed * 7.1);
      vec3 frostColor;
      
      if (colorSeed < 0.25) {
        // Pure white frost (water ice crystals)
        frostColor = vec3(0.98, 0.99, 1.00);
      } else if (colorSeed < 0.5) {
        // Pale blue frost (compressed ice crystals)
        frostColor = vec3(0.94, 0.97, 1.00);
      } else if (colorSeed < 0.75) {
        // Cyan-white frost (methane ice)
        frostColor = vec3(0.92, 0.98, 1.00);
      } else {
        // Slightly warm white (dusty ice)
        frostColor = vec3(0.98, 0.96, 0.94);
      }
      
      // Mix with base color (subtle tint)
      frostColor = mix(frostColor, baseColor, 0.15);
      
      // Add sparkle variation based on crystal density (ice crystals catch light)
      float sparkleVariation = turbulence(samplePos * 3.0 + flow2);
      frostColor *= (0.90 + sparkleVariation * 0.2);
      
      // Create areas of denser frost (slightly darker/thicker)
      float density = smoothstep(0.55, 0.85, combinedPattern);
      frostColor = mix(frostColor, frostColor * 0.85, density * 0.3);
      
      // Add bright atmospheric scattering (ice crystals scatter light beautifully)
      float edgeFactor = dot(normalize(vNormal), vec3(0.0, 0.0, 1.0));
      float scattering = pow(1.0 - abs(edgeFactor), 2.0) * 0.25;
      frostColor += vec3(scattering * 0.95, scattering * 0.97, scattering);
      
      // Ice frost clouds are very transparent and wispy (thin atmosphere)
      float alpha = frostMask * (0.35 + density * 0.20); // Reduced opacity
      
      // Add sparkle/shimmer effect (ice crystals reflect light)
      float shimmer = smoothstep(0.7, 0.9, sparkleVariation);
      alpha += shimmer * frostMask * 0.12;
      
      // Clamp alpha to reasonable range (much lower max for sparse atmosphere)
      alpha = clamp(alpha, 0.0, 0.55); // Reduced max opacity
      
      gl_FragColor = vec4(frostColor, alpha);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: color },
      rotation: { value: 0 },
      frostCoverage: { value: frostCoverage },
      time: { value: 0 },
      planetSeed: { value: planetSeed },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
}

/**
 * Update the ice cloud material's time for animation
 */
export function updateIceCloudAnimation(
  material: THREE.ShaderMaterial,
  deltaTime: number
): void {
  if (material.uniforms.time) {
    material.uniforms.time.value += deltaTime;
  }
}

/**
 * Update the ice cloud material's rotation to sync with planet
 */
export function updateIceCloudRotation(
  material: THREE.ShaderMaterial,
  rotation: number
): void {
  if (material.uniforms.rotation) {
    material.uniforms.rotation.value = rotation;
  }
}

