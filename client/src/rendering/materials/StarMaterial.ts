import * as THREE from "three";

/**
 * Creates a shader material for stars with procedural animated texture and built-in glow
 * Features transparent edges to simulate atmospheric effects
 */
export function createStarMaterial(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color(color) },
      time: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vUv = uv;
        vPosition = position;
        vNormal = normalize(normalMatrix * normal);
        
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 baseColor;
      uniform float time;
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      
      // Smooth interpolation function
      float smoothNoise(float x) {
        return x * x * (3.0 - 2.0 * x);
      }
      
      // Improved 3D noise with better interpolation
      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f); // Smooth interpolation
        
        float a = sin(i.x + i.y * 57.0 + i.z * 113.0);
        float b = sin(i.x + 1.0 + i.y * 57.0 + i.z * 113.0);
        float c = sin(i.x + (i.y + 1.0) * 57.0 + i.z * 113.0);
        float d = sin(i.x + 1.0 + (i.y + 1.0) * 57.0 + i.z * 113.0);
        
        float e = sin(i.x + i.y * 57.0 + (i.z + 1.0) * 113.0);
        float g = sin(i.x + 1.0 + i.y * 57.0 + (i.z + 1.0) * 113.0);
        float h = sin(i.x + (i.y + 1.0) * 57.0 + (i.z + 1.0) * 113.0);
        float k = sin(i.x + 1.0 + (i.y + 1.0) * 57.0 + (i.z + 1.0) * 113.0);
        
        return mix(
          mix(mix(a, b, f.x), mix(c, d, f.x), f.y),
          mix(mix(e, g, f.x), mix(h, k, f.x), f.y),
          f.z
        ) * 0.5 + 0.5;
      }
      
      void main() {
        // Normalize position for consistent noise across all star sizes
        vec3 norm = normalize(vPosition);
        
        // Slow down animation significantly for more majestic movement
        float slowTime = time / 10.0;
        
        // Use VERY low frequencies to avoid aliasing at any scale
        // Large features that look good whether star is small or huge
        float n1 = noise(norm * 1.5 + slowTime * 0.0002);
        float n2 = noise(norm * 3.0 + slowTime * 0.0003);
        float n3 = noise(norm * 5.0 + slowTime * 0.0004);
        
        // Combine noise layers with minimal contribution for ultra-smooth appearance
        float intensity = 0.94 + n1 * 0.03 + n2 * 0.015 + n3 * 0.008;
        
        // Add some darker spots (sunspots) with very low frequency and heavy smoothing
        float spot1Raw = sin(norm.x * 8.0 + norm.y * 6.0 + slowTime * 0.0001) * 0.5 + 0.5;
        float spot2Raw = sin(norm.z * 7.0 + norm.x * 5.0 + slowTime * 0.00015) * 0.5 + 0.5;
        float spot1 = smoothstep(0.25, 0.75, spot1Raw);
        float spot2 = smoothstep(0.25, 0.75, spot2Raw);
        intensity -= (spot1 * 0.03 + spot2 * 0.025);
        
        // Add brighter areas with low frequency and very smooth transitions
        float bright1Raw = cos(norm.x * 4.0 + slowTime * 0.0005) * cos(norm.y * 3.5 - slowTime * 0.0004) * 0.5 + 0.5;
        float bright2Raw = cos(norm.z * 4.5 + slowTime * 0.0006) * cos(norm.x * 3.8 + slowTime * 0.0003) * 0.5 + 0.5;
        float bright3Raw = sin(norm.x * 5.0 + norm.z * 4.5 + slowTime * 0.0007) * cos(norm.y * 5.5 + slowTime * 0.0005) * 0.5 + 0.5;
        float bright1 = smoothstep(0.35, 0.65, bright1Raw);
        float bright2 = smoothstep(0.35, 0.65, bright2Raw);
        float bright3 = smoothstep(0.35, 0.65, bright3Raw);
        intensity += (bright1 * 0.1 + bright2 * 0.08 + bright3 * 0.11);
        
        // Add swirling bright patterns with low frequency and extremely smooth transitions
        float swirl1Raw = sin(norm.x * 6.0 + sin(norm.y * 4.5) + norm.z * 4.0 + slowTime * 0.0008) * 0.5 + 0.5;
        float swirl2Raw = cos(norm.y * 6.5 + cos(norm.z * 4.8) + norm.x * 3.8 - slowTime * 0.0009) * 0.5 + 0.5;
        float swirl3Raw = sin(norm.z * 6.8 + sin(norm.x * 5.5) + norm.y * 5.0 + slowTime * 0.001) * 0.5 + 0.5;
        float swirl1 = smoothstep(0.45, 0.92, swirl1Raw);
        float swirl2 = smoothstep(0.45, 0.92, swirl2Raw);
        float swirl3 = smoothstep(0.45, 0.92, swirl3Raw);
        intensity += (swirl1 * 0.13 + swirl2 * 0.11 + swirl3 * 0.09);
        
        // Add subtle breathing/pulsing effect
        float pulse = sin(slowTime * 0.005) * 0.02 + 1.0;
        intensity *= pulse;
        
        // Clamp to prevent over-exposure and graininess
        intensity = clamp(intensity, 0.85, 1.4);
        
        // Calculate base star color
        vec3 starColor = baseColor * intensity;
        
        // Calculate atmospheric glow and transparency at edges
        vec3 viewDir = normalize(vViewPosition);
        float edgeFactor = abs(dot(viewDir, vNormal));
        
        // Center is opaque (1.0), edges become transparent (fade out)
        // This simulates the star's atmosphere thinning at the limb
        float alpha = smoothstep(0.0, 0.3, edgeFactor); // Smooth falloff at edges
        
        // Add bright atmospheric glow at edges (limb brightening)
        float glowIntensity = pow(1.0 - edgeFactor, 2.0) * 0.6;
        vec3 glowColor = baseColor * 2.0; // Much brighter version of star color
        
        // Blend the glow with the star surface
        vec3 finalColor = starColor + glowColor * glowIntensity;
        
        // Output with transparency at edges
        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
    transparent: true,
    blending: THREE.NormalBlending,
    depthWrite: true,
  });
}
