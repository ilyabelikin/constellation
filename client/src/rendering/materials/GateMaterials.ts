import * as THREE from "three";

/**
 * Creates a shader material for star gates with pulsing glow and energy effects
 */
export function createGateMaterial(color: number, isExplored: boolean): THREE.ShaderMaterial {
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
 * Creates a shader material for energy ball gates with intense pulsation
 */
export function createEnergyBallMaterial(
  color: number,
  isExplored: boolean
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color(color) },
      time: { value: 0 },
      glowIntensity: { value: isExplored ? 1.5 : 1.0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec2 vUv;
      
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 baseColor;
      uniform float time;
      uniform float glowIntensity;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec2 vUv;
      
      // Simple noise function for energy variation
      float noise(vec3 p) {
        return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
      }
      
      void main() {
        // Fresnel effect - much stronger glow at edges
        vec3 viewDirection = normalize(cameraPosition - vPosition);
        float fresnel = pow(1.0 - abs(dot(viewDirection, vNormal)), 3.0);
        
        // Multiple pulsing layers at different speeds
        float pulse1 = sin(time * 0.0005) * 0.5 + 0.5;
        float pulse2 = sin(time * 0.0008 + 1.0) * 0.5 + 0.5;
        float pulse3 = sin(time * 0.0003 + 2.0) * 0.5 + 0.5;
        float combinedPulse = (pulse1 + pulse2 * 0.5 + pulse3 * 0.3) / 1.8;
        
        // Energy waves moving across surface
        float wave1 = sin(vPosition.x * 3.0 + time * 0.001) * 0.5 + 0.5;
        float wave2 = sin(vPosition.y * 4.0 - time * 0.0015) * 0.5 + 0.5;
        float wave3 = sin(vPosition.z * 3.5 + time * 0.0012) * 0.5 + 0.5;
        float waves = (wave1 + wave2 + wave3) / 3.0;
        
        // Add some noise for energy crackle effect
        float energyNoise = noise(vPosition * 5.0 + time * 0.0002);
        energyNoise = smoothstep(0.3, 0.7, energyNoise);
        
        // Combine all effects
        float intensity = fresnel * 2.0 + 
                        combinedPulse * 0.5 + 
                        waves * 0.3 + 
                        energyNoise * 0.2 + 
                        0.3;
        intensity *= glowIntensity;
        
        vec3 finalColor = baseColor * intensity;
        
        // Very bright emissive effect
        gl_FragColor = vec4(finalColor, 0.95);
      }
    `,
    transparent: true,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * Creates a shader material for flowing banner ribbons around gates
 */
export function createBannerMaterial(
  color: number,
  isExplored: boolean
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color(color) },
      time: { value: 0 },
      opacity: { value: isExplored ? 0.7 : 0.5 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vPosition;
      uniform float time;
      
      void main() {
        vUv = uv;
        vPosition = position;
        
        // Add slight wave animation to vertices
        vec3 pos = position;
        pos.y += sin(uv.x * 6.28318 + time * 0.001) * 0.3;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 baseColor;
      uniform float time;
      uniform float opacity;
      varying vec2 vUv;
      varying vec3 vPosition;
      
      void main() {
        // Create flowing energy pattern along the banner
        float flow = sin(vUv.x * 6.28318 * 3.0 - time * 0.002) * 0.5 + 0.5;
        
        // Fade at edges for smooth appearance
        float edgeFade = smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.8, vUv.y);
        
        // Pulsing brightness
        float pulse = sin(time * 0.0006) * 0.3 + 0.7;
        
        // Combine effects
        float intensity = (flow * 0.6 + 0.4) * pulse;
        vec3 finalColor = baseColor * (intensity + 0.5);
        
        float finalOpacity = opacity * edgeFade;
        
        gl_FragColor = vec4(finalColor, finalOpacity);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

/**
 * Creates a basic material for glow layers around gates
 */
export function createGlowMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: opacity,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });
}

