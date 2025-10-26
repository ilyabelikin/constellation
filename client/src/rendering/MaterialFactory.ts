import * as THREE from "three";

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
   * Creates a shader material for planets with procedural texture and lighting
   */
  createPlanetMaterial(
    color: number,
    surfaceType: string = "smooth"
  ): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        baseColor: { value: new THREE.Color(color) },
        lightPosition: { value: new THREE.Vector3(0, 0, 0) }, // Sun at origin
        rotation: { value: 0.0 }, // Planet rotation angle
        surfaceType: { value: surfaceType === "cratered" ? 1.0 : 0.0 },
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
        uniform float surfaceType;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        
        // Hash function for pseudo-random numbers
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        
        // Simple noise for surface features
        float noise(vec2 p) {
          return sin(p.x * 10.0) * cos(p.y * 8.0) * 0.5 + 0.5;
        }
        
        // Generate craters
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
                hash(neighbor),
                hash(neighbor + vec2(13.7, 27.3))
              );
              
              // Generate random size
              float craterSize = 0.2 + hash(neighbor + vec2(50.1, 60.2)) * 0.3;
              
              // Calculate distance to crater center
              vec2 toCenter = (localUV - vec2(x, y)) - craterPos;
              float dist = length(toCenter);
              
              // Only create crater if random value is above threshold (controls density)
              float shouldExist = hash(neighbor + vec2(100.0, 200.0));
              if(shouldExist > 0.6) {
                // Crater bowl with raised rim
                if(dist < craterSize) {
                  float rimDist = abs(dist - craterSize * 0.85) / (craterSize * 0.15);
                  float rimHeight = smoothstep(1.0, 0.0, rimDist) * 0.15;
                  float bowlDepth = smoothstep(craterSize, 0.0, dist) * -0.25;
                  craterEffect += bowlDepth + rimHeight;
                }
              }
            }
          }
          
          return craterEffect;
        }
        
        void main() {
          // Calculate spherical coordinates for texture mapping
          vec3 norm = normalize(vPosition);
          // Add rotation to the horizontal coordinate
          float u = atan(norm.z, norm.x) / (2.0 * 3.14159) + 0.5 + rotation / (2.0 * 3.14159);
          float v = asin(norm.y) / 3.14159 + 0.5;
          
          // Base color intensity
          float intensity = 1.0;
          
          // Add craters for barren/rocky planets
          if(surfaceType > 0.5) {
            // Multiple layers of craters at different scales
            float largeCraters = craters(vec2(u, v), 8.0);
            float mediumCraters = craters(vec2(u, v), 16.0) * 0.7;
            float smallCraters = craters(vec2(u, v), 32.0) * 0.5;
            
            intensity += largeCraters + mediumCraters + smallCraters;
          }
          
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
  }

  /**
   * Creates a shader material for planet atmospheres with Fresnel effect
   */
  createAtmosphereMaterial(color: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        atmosphereColor: { value: new THREE.Color(color) },
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
    cloudCoverage: number = 0.5
  ): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        baseColor: { value: new THREE.Color(baseColor) },
        rotation: { value: 0 },
        cloudCoverage: { value: cloudCoverage },
      },
      vertexShader: `
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec2 vUv;
        
        void main() {
          vPosition = position;
          vNormal = normalize(normalMatrix * normal);
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 baseColor;
        uniform float rotation;
        uniform float cloudCoverage;
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec2 vUv;
        
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
          float u = vUv.x - rotation;
          
          // Map UV to sphere coordinates for seamless wrapping
          // Convert u (0-1) to angle (0-2π) and use sin/cos for seamless tiling
          float angle = u * 6.28318530718; // 2 * PI
          float latitude = (vUv.y - 0.5) * 3.14159265359; // -π/2 to π/2
          
          // Create 3D position on a torus-like surface for seamless noise
          vec3 samplePos = vec3(
            cos(angle) * 2.0,
            sin(angle) * 2.0,
            latitude * 1.5
          );
          
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
          
          // Adjust threshold based on cloud coverage parameter
          // Lower coverage = higher threshold (less clouds), higher coverage = lower threshold (more clouds)
          float coverageThreshold = mix(0.5, 0.2, cloudCoverage);
          float coverageRange = mix(0.2, 0.3, cloudCoverage);
          
          // Threshold for cloud formation with smoother transitions
          float cloudMask = smoothstep(coverageThreshold, coverageThreshold + coverageRange, cloudPattern) * latitudeDensity;
          
          // Soften cloud edges
          cloudMask = smoothstep(0.1, 0.5, cloudMask);
          
          // Apply cloud coverage as density multiplier
          cloudMask *= (0.5 + cloudCoverage * 0.5);
          
          // Cloud color - white with slight brightness variation
          vec3 cloudColor = baseColor * (0.95 + cloudPattern * 0.1);
          
          // Make clouds semi-transparent with soft falloff
          float alpha = cloudMask * 0.6;
          
          gl_FragColor = vec4(cloudColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
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
}
