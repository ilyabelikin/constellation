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
  createPlanetMaterial(color: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        baseColor: { value: new THREE.Color(color) },
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
