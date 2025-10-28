import * as THREE from "three";
import { getOceanColorType, getAtmosphereColor } from "./planetColorUtils";

/**
 * Creates a shader material for planet atmospheres with enhanced Fresnel effect
 * For terrestrial planets, syncs with ocean color based on seed
 */
export function createAtmosphereMaterial(
  color: number,
  planetSeed?: number,
  isTerrestrial: boolean = false
): THREE.ShaderMaterial {
  let atmosphereColor = new THREE.Color(color);

  // For terrestrial planets, use ocean color logic
  if (isTerrestrial && planetSeed !== undefined) {
    const oceanType = getOceanColorType(planetSeed);
    atmosphereColor = getAtmosphereColor(oceanType);
  } else {
    // Default behavior for non-terrestrial planets
    atmosphereColor.multiplyScalar(1.3); // Brighter

    // For Earth-like colors (blue/green), add slight cyan tint
    if (atmosphereColor.b > atmosphereColor.r) {
      atmosphereColor.g = Math.min(atmosphereColor.g * 1.2, 1.0);
    }
  }

  const vertexShader = `
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform vec3 atmosphereColor;
    varying vec3 vNormal;
    varying vec3 vPosition;
    
    void main() {
      // Enhanced Fresnel effect - stronger glow at edges
      float edgeFactor = dot(vNormal, vec3(0.0, 0.0, 1.0));
      
      // Multi-layer atmospheric glow
      // Inner glow - subtle and smooth
      float innerGlow = pow(0.8 - edgeFactor, 1.5) * 0.4;
      
      // Outer glow - more intense at the very edge
      float outerGlow = pow(0.7 - edgeFactor, 2.5) * 0.8;
      
      // Atmospheric scattering - brightest near horizon
      float scattering = smoothstep(0.0, 0.4, 1.0 - edgeFactor) * 0.3;
      
      // Combine glows
      float intensity = innerGlow + outerGlow + scattering;
      
      // Add slight color shift at edge (atmospheric scattering effect)
      vec3 finalColor = atmosphereColor;
      float edgeShift = smoothstep(0.3, 0.0, edgeFactor);
      finalColor = mix(atmosphereColor, atmosphereColor * vec3(1.2, 1.1, 1.0), edgeShift * 0.3);
      
      gl_FragColor = vec4(finalColor, intensity);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms: {
      atmosphereColor: { value: atmosphereColor },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });
}
