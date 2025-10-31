import * as THREE from "three";

/**
 * Creates a shader material for weather/cloud layers on planets
 * with seed-based pattern and coverage variation
 */
export function createCloudMaterial(
  baseColor: number,
  cloudCoverage: number = 0.5,
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
    uniform float cloudCoverage;
    uniform float time; // Time for cloud pattern evolution
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
    
    // Fractal Brownian Motion for clouds
    float fbm(vec3 p) {
      float value = 0.0;
      float amplitude = 0.5;
      float frequency = 1.0;
      
      for(int i = 0; i < 5; i++) {
        value += amplitude * noise3D(p * frequency);
        frequency *= 2.0;
        amplitude *= 0.5;
      }
      
      return value;
    }
    
    void main() {
      // Apply rotation to UV coordinates (subtract to match planet rotation direction)
      // Clouds move slightly faster (1.05x) to simulate slow weather drift
      float u = vUv.x - rotation * 1.05;
      
      // Map UV to sphere coordinates for seamless wrapping
      // Convert u (0-1) to angle (0-2π) and use sin/cos for seamless tiling
      float angle = u * 6.28318530718; // 2 * PI
      float latitude = (vUv.y - 0.5) * 3.14159265359; // -π/2 to π/2
      
      // Create 3D position on a torus-like surface for seamless noise
      // Add very slow time evolution to the sample position for changing patterns
      vec3 samplePos = vec3(
        cos(angle) * 2.0,
        sin(angle) * 2.0,
        latitude * 1.5
      );
      
      // Add seed-based offset for unique cloud patterns per planet
      vec3 seedOffset = vec3(
        seededRandom(planetSeed * 1.1) * 100.0,
        seededRandom(planetSeed * 1.3) * 100.0,
        seededRandom(planetSeed * 1.7) * 100.0
      );
      samplePos += seedOffset;
      
      // Add very slow temporal evolution (scaled way down for slow changes)
      // This makes cloud patterns evolve over time - 10x slower
      vec3 timeOffset = vec3(time * 0.000002, time * 0.0000015, time * 0.000001);
      samplePos += timeOffset;
      
      // Add animated polar storm vortex effect
      float polarDistance = abs(vUv.y - 0.5) * 2.0; // 0 at equator, 1 at poles
      if (polarDistance > 0.75) {
        // We're near a pole - add swirl effect with animation
        float poleIntensity = smoothstep(0.75, 1.0, polarDistance);
        
        // Use noise to vary vortex strength organically
        float vortexNoise = fbm(samplePos * 0.5) * 0.5 + 0.5;
        // Scale vortex strength with cloud coverage (more clouds = more activity)
        float vortexStrength = poleIntensity * vortexNoise * (0.5 + cloudCoverage * 0.5);
        
        // Add slow rotation animation (clockwise, slower at equator, faster at poles)
        float animationSpeed = rotation * 0.3; // Use shader rotation uniform
        float poleRotation = animationSpeed * poleIntensity;
        
        // Determine if we're at north or south pole for rotation direction
        float poleSign = vUv.y > 0.5 ? -1.0 : 1.0; // Clockwise for both
        
        // Create soft rotational distortion with animation
        float distFromCenter = length(vec2(u - 0.5, (vUv.y - (vUv.y > 0.5 ? 1.0 : 0.0)) * 2.0));
        float vortexAngle = (distFromCenter * vortexStrength * 1.2) + (poleRotation * poleSign);
        
        // Apply rotation to sample position
        float cosV = cos(vortexAngle);
        float sinV = sin(vortexAngle);
        vec3 rotatedPos = vec3(
          samplePos.x * cosV - samplePos.y * sinV,
          samplePos.x * sinV + samplePos.y * cosV,
          samplePos.z
        );
        samplePos = mix(samplePos, rotatedPos, poleIntensity * 0.5);
      }
      
      // Generate cloud pattern with multiple octaves
      float cloudPattern = fbm(samplePos);
      
      // Add detail at different scale
      float detailNoise = fbm(samplePos * 2.5) * 0.3;
      cloudPattern = (cloudPattern + detailNoise) * 0.6;
      
      // Create subtle variation in cloud density by latitude (but allow clouds everywhere)
      float latitudeFactor = abs(vUv.y - 0.5) * 2.0; // 0 at equator, 1 at poles
      float latitudeDensity = 0.7 + sin(latitudeFactor * 3.14159) * 0.3; // Varies between 0.7 and 1.0
      
      // Generate seed-based coverage variation (0.85 to 1.15 multiplier for moderate variety)
      // Narrower range to keep variety closer to the middle
      float coverageSeed = seededRandom(planetSeed * 2.1);
      float seedCoverage = 0.85 + coverageSeed * 0.30;
      float finalCoverage = cloudCoverage * seedCoverage;
      
      // Adjust threshold based on cloud coverage parameter
      // Lower coverage = higher threshold (less clouds), higher coverage = lower threshold (more clouds)
      float coverageThreshold = mix(0.5, 0.2, finalCoverage);
      float coverageRange = mix(0.2, 0.3, finalCoverage);
      
      // Threshold for cloud formation with smoother transitions
      float cloudMask = smoothstep(coverageThreshold, coverageThreshold + coverageRange, cloudPattern) * latitudeDensity;
      
      // Soften cloud edges
      cloudMask = smoothstep(0.1, 0.5, cloudMask);
      
      // Apply cloud coverage as density multiplier
      cloudMask *= (0.5 + finalCoverage * 0.5);
      
      // Generate seed-based color tint (mostly white, sometimes tinted)
      float colorSeed = seededRandom(planetSeed * 2.3);
      vec3 cloudTint = vec3(1.0);
      
      if (colorSeed < 0.7) {
        // 70% chance: Pure white clouds
        cloudTint = vec3(1.0, 1.0, 1.0);
      } else if (colorSeed < 0.8) {
        // 10% chance: Slightly bluish (water vapor rich)
        cloudTint = vec3(0.95, 0.97, 1.0);
      } else if (colorSeed < 0.9) {
        // 10% chance: Slightly greenish (algae/organic)
        cloudTint = vec3(0.95, 1.0, 0.97);
      } else {
        // 10% chance: Slightly purplish (exotic atmosphere)
        cloudTint = vec3(0.98, 0.95, 1.0);
      }
      
      // Cloud color - base color with tint and brightness variation
      vec3 cloudColor = baseColor * cloudTint * (0.95 + cloudPattern * 0.1);
      
      // Make clouds semi-transparent with soft falloff
      float alpha = cloudMask * 0.6;
      
      gl_FragColor = vec4(cloudColor, alpha);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: color },
      rotation: { value: 0 },
      cloudCoverage: { value: cloudCoverage },
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
