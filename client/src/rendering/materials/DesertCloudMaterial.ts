import * as THREE from "three";

/**
 * Creates a shader material for desert sand storm layers
 * with 3D patterns and multi-directional slow wind movement
 */
export function createDesertCloudMaterial(
  baseColor: number,
  stormCoverage: number = 0.5,
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
    uniform float stormCoverage;
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
    
    // Fractal Brownian Motion for storm patterns
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
    
    // Turbulent noise for storm effects
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
      // Use actual 3D position on sphere (normalized) - this avoids pole singularities!
      vec3 spherePos = normalize(vPosition);
      
      // Apply rotation around Y axis for planet spin
      // Rotate the sampling position in the same direction as planet rotation
      float cosRot = cos(rotation);
      float sinRot = sin(rotation);
      vec3 rotatedPos = vec3(
        spherePos.x * cosRot - spherePos.z * sinRot,
        spherePos.y,
        spherePos.x * sinRot + spherePos.z * cosRot
      );
      
      // Scale up for better noise frequency
      vec3 samplePos = rotatedPos * 2.5;
      
      // Add seed-based offset for unique storm patterns per planet
      vec3 seedOffset = vec3(
        seededRandom(planetSeed * 1.1) * 100.0,
        seededRandom(planetSeed * 1.3) * 100.0,
        seededRandom(planetSeed * 1.7) * 100.0
      );
      samplePos += seedOffset;
      
      // MULTI-DIRECTIONAL WIND MOVEMENT
      // Different layers of wind moving in different directions and speeds
      
      // Seed-based wind directions (each planet has unique wind patterns)
      vec3 windDir1 = vec3(
        seededRandom(planetSeed * 2.1) * 2.0 - 1.0,
        seededRandom(planetSeed * 2.3) * 2.0 - 1.0,
        seededRandom(planetSeed * 2.5) * 2.0 - 1.0
      );
      windDir1 = normalize(windDir1);
      
      vec3 windDir2 = vec3(
        seededRandom(planetSeed * 3.1) * 2.0 - 1.0,
        seededRandom(planetSeed * 3.3) * 2.0 - 1.0,
        seededRandom(planetSeed * 3.5) * 2.0 - 1.0
      );
      windDir2 = normalize(windDir2);
      
      vec3 windDir3 = vec3(
        seededRandom(planetSeed * 4.1) * 2.0 - 1.0,
        seededRandom(planetSeed * 4.3) * 2.0 - 1.0,
        seededRandom(planetSeed * 4.5) * 2.0 - 1.0
      );
      windDir3 = normalize(windDir3);
      
      // Different speeds for each wind layer (very slow for sand storms)
      // Reduced to be subtle additions to the base rotation, not overpowering it
      float windSpeed1 = 0.000001 * (0.8 + seededRandom(planetSeed * 5.1) * 0.4);
      float windSpeed2 = 0.0000015 * (0.7 + seededRandom(planetSeed * 5.3) * 0.6);
      float windSpeed3 = 0.0000008 * (0.9 + seededRandom(planetSeed * 5.5) * 0.3);
      
      // Apply multi-directional wind drift
      vec3 wind1 = windDir1 * time * windSpeed1;
      vec3 wind2 = windDir2 * time * windSpeed2;
      vec3 wind3 = windDir3 * time * windSpeed3;
      
      // Sample storm patterns at different scales with wind offset
      float stormPattern1 = fbm(samplePos + wind1);
      float stormPattern2 = fbm(samplePos * 0.7 + wind2);
      float stormPattern3 = turbulence(samplePos * 1.5 + wind3);
      
      // Combine patterns with different weights for complex storm structure
      float combinedPattern = stormPattern1 * 0.5 + stormPattern2 * 0.3 + stormPattern3 * 0.2;
      
      // Add swirling detail at higher frequency (dust devils/eddies)
      float eddyPattern = turbulence(samplePos * 3.0 + wind1 * 2.0) * 0.15;
      combinedPattern += eddyPattern;
      
      // Add vertical wind shear effect (storms at different altitudes move differently)
      float altitude = abs(vPosition.y / length(vPosition));
      vec3 shearWind = vec3(sin(time * 0.00001), cos(time * 0.00001), 0.0) * altitude * 0.5;
      float shearPattern = fbm(samplePos * 0.5 + shearWind) * 0.2;
      combinedPattern += shearPattern;
      
      // Create latitude-based storm intensity (storms more common in certain bands)
      // Use actual Y position from sphere (no UV singularity!)
      float latitudeFactor = abs(spherePos.y); // 0 at equator, 1 at poles
      
      // Desert storms typically stronger in mid-latitudes
      float stormBelt = sin(latitudeFactor * 3.14159) * 0.3 + 0.7; // Varies 0.7-1.0
      
      // Generate seed-based coverage variation
      float coverageSeed = seededRandom(planetSeed * 6.1);
      float seedCoverage = 0.8 + coverageSeed * 0.4; // 0.8-1.2 multiplier
      float finalCoverage = stormCoverage * seedCoverage;
      
      // Threshold for storm formation
      float coverageThreshold = mix(0.4, 0.15, finalCoverage);
      float coverageRange = mix(0.25, 0.35, finalCoverage);
      
      // Create storm mask with soft edges
      float stormMask = smoothstep(
        coverageThreshold, 
        coverageThreshold + coverageRange, 
        combinedPattern
      ) * stormBelt;
      
      // Add wispy edges to storms for realistic sand/dust appearance
      float edgeNoise = noise3D(samplePos * 4.0 + wind1 * 3.0);
      stormMask *= (0.7 + edgeNoise * 0.6);
      
      // Apply storm coverage as density multiplier
      stormMask *= (0.4 + finalCoverage * 0.6);
      
      // Desert/sand storm color palette (beige, tan, orange hues)
      // Generate palette based on seed
      float colorSeed = seededRandom(planetSeed * 7.1);
      vec3 stormColor;
      
      if (colorSeed < 0.3) {
        // Golden sand storm
        stormColor = vec3(0.95, 0.82, 0.60);
      } else if (colorSeed < 0.5) {
        // Red/Mars-like dust storm
        stormColor = vec3(0.90, 0.65, 0.45);
      } else if (colorSeed < 0.7) {
        // Tan/beige storm
        stormColor = vec3(0.92, 0.80, 0.68);
      } else if (colorSeed < 0.85) {
        // Orange desert storm
        stormColor = vec3(0.96, 0.75, 0.52);
      } else {
        // Pink/rose tinted storm
        stormColor = vec3(0.94, 0.78, 0.75);
      }
      
      // Mix with base color
      stormColor = mix(stormColor, baseColor, 0.3);
      
      // Add depth variation based on storm density
      float densityVariation = turbulence(samplePos * 2.0 + wind2);
      stormColor *= (0.85 + densityVariation * 0.3);
      
      // Create areas of denser/thicker storm (darker)
      float thickness = smoothstep(0.5, 0.8, combinedPattern);
      stormColor = mix(stormColor, stormColor * 0.7, thickness * 0.4);
      
      // Add slight atmospheric scattering (lighter at edges)
      float edgeFactor = dot(normalize(vNormal), vec3(0.0, 0.0, 1.0));
      float scattering = pow(1.0 - abs(edgeFactor), 2.0) * 0.15;
      stormColor += vec3(scattering * 0.8, scattering * 0.7, scattering * 0.5);
      
      // Sand storms are more opaque than regular clouds
      float alpha = stormMask * (0.7 + thickness * 0.3);
      
      // Clamp alpha to reasonable range
      alpha = clamp(alpha, 0.0, 0.9);
      
      gl_FragColor = vec4(stormColor, alpha);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: color },
      rotation: { value: 0 },
      stormCoverage: { value: stormCoverage },
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
 * Update the sand storm material's time for animation
 */
export function updateDesertCloudAnimation(
  material: THREE.ShaderMaterial,
  deltaTime: number
): void {
  if (material.uniforms.time) {
    material.uniforms.time.value += deltaTime;
  }
}

/**
 * Update the sand storm material's rotation to sync with planet
 */
export function updateDesertCloudRotation(
  material: THREE.ShaderMaterial,
  rotation: number
): void {
  if (material.uniforms.rotation) {
    material.uniforms.rotation.value = rotation;
  }
}

