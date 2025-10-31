import * as THREE from "three";
import { getOceanColorType, getAtmosphereColor } from "./planetColorUtils";

/**
 * Creates a shader material for terrestrial planet atmospheres
 * Syncs with ocean color based on seed for visual consistency
 * Uses standard glow intensity
 */
export function createTerrestrialAtmosphereGlowMaterial(
  planetSeed: number
): THREE.ShaderMaterial {
  // Calculate atmosphere color based on ocean type
  const oceanType = getOceanColorType(planetSeed);
  const atmosphereColor = getAtmosphereColor(oceanType);

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
      
      // Multi-layer atmospheric glow (standard intensity)
      float innerMultiplier = 0.4;
      float outerMultiplier = 0.8;
      float scatterMultiplier = 0.3;
      
      // Inner glow - subtle and smooth
      float innerGlow = pow(0.8 - edgeFactor, 1.5) * innerMultiplier;
      
      // Outer glow - more intense at the very edge
      float outerGlow = pow(0.7 - edgeFactor, 2.5) * outerMultiplier;
      
      // Atmospheric scattering - brightest near horizon
      float scattering = smoothstep(0.0, 0.4, 1.0 - edgeFactor) * scatterMultiplier;
      
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

