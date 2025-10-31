import * as THREE from "three";

/**
 * Seeded random for desert palette generation
 */
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/**
 * Get desert atmosphere color based on palette type
 * Matches the 8 desert palette types from DesertPlanetMaterial
 */
export function getDesertAtmosphereColor(planetSeed: number): THREE.Color {
  // Match the desert planet material's palette selection logic
  const paletteTypeSeed = seededRandom(planetSeed * 1.1);
  const paletteType = Math.min(Math.floor(paletteTypeSeed * 8.0), 7);

  let atmosphereColor: THREE.Color;

  switch (paletteType) {
    case 0: // Classic Sahara - golden/yellow atmosphere
      atmosphereColor = new THREE.Color(0.98, 0.88, 0.6);
      break;
    case 1: // Mars-like - red/orange atmosphere
      atmosphereColor = new THREE.Color(0.92, 0.65, 0.45);
      break;
    case 2: // White desert - cream/white atmosphere
      atmosphereColor = new THREE.Color(0.96, 0.94, 0.88);
      break;
    case 3: // Namib - orange/peach atmosphere
      atmosphereColor = new THREE.Color(0.98, 0.75, 0.52);
      break;
    case 4: // Rainbow - varied warm atmosphere
      atmosphereColor = new THREE.Color(0.92, 0.78, 0.58);
      break;
    case 5: // Rose - pink/rose atmosphere
      atmosphereColor = new THREE.Color(0.96, 0.8, 0.78);
      break;
    case 6: // Dark - brown atmosphere
      atmosphereColor = new THREE.Color(0.75, 0.62, 0.5);
      break;
    case 7: // Alien - purple-tinted atmosphere
      atmosphereColor = new THREE.Color(0.88, 0.75, 0.82);
      break;
    default:
      atmosphereColor = new THREE.Color(0.92, 0.78, 0.58);
  }

  return atmosphereColor;
}

/**
 * Creates a shader material for desert planet atmospheres
 * Syncs with sand palette color based on seed for visual consistency
 * Uses subtle glow intensity (thinner atmosphere)
 */
export function createDesertAtmosphereGlowMaterial(
  planetSeed: number
): THREE.ShaderMaterial {
  // Calculate atmosphere color based on desert palette type
  const atmosphereColor = getDesertAtmosphereColor(planetSeed);

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
      
      // Multi-layer atmospheric glow (very subtle/thin for desert - 30% thinner than before)
      float innerMultiplier = 0.175;
      float outerMultiplier = 0.315;
      float scatterMultiplier = 0.105;
      
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
