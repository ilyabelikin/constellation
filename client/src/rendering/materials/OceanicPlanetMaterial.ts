import * as THREE from "three";

/**
 * Creates a shader material for oceanic planets with procedural water currents
 * Features:
 * - Multi-scale water current patterns
 * - Depth variation for realistic ocean shading
 * - Specular highlights for water reflections
 * - Supports multiple light sources
 */
export function createOceanicPlanetMaterial(
  color: number,
  seed: number,
  normalizedDistance: number
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color(color) },
      lightPosition1: { value: new THREE.Vector3(0, 0, 0) }, // Primary star
      lightPosition2: { value: new THREE.Vector3(0, 0, 0) }, // Companion star 1
      lightPosition3: { value: new THREE.Vector3(0, 0, 0) }, // Companion star 2
      lightIntensity1: { value: 1.0 },
      lightIntensity2: { value: 0.0 },
      lightIntensity3: { value: 0.0 },
      rotation: { value: 0.0 },
      planetSeed: { value: seed },
      orbitalDistance: { value: normalizedDistance },
    },
    lights: false,
    vertexShader: `
      uniform float rotation;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec2 vUv;
      
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 baseColor;
      uniform vec3 lightPosition1;
      uniform vec3 lightPosition2;
      uniform vec3 lightPosition3;
      uniform float lightIntensity1;
      uniform float lightIntensity2;
      uniform float lightIntensity3;
      uniform float rotation;
      uniform float planetSeed;
      uniform float orbitalDistance;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec2 vUv;
      
      // Seeded random for consistent variation per planet
      float seededRandom(float seed) {
        return fract(sin(seed) * 43758.5453123);
      }
      
      // 3D hash for seamless sphere noise
      float hash3D(vec3 p) {
        p = fract(p * vec3(127.1, 311.7, 74.7));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }
      
      // 3D noise for seamless spheres
      float noise3D(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        
        float n000 = hash3D(i);
        float n100 = hash3D(i + vec3(1.0, 0.0, 0.0));
        float n010 = hash3D(i + vec3(0.0, 1.0, 0.0));
        float n110 = hash3D(i + vec3(1.0, 1.0, 0.0));
        float n001 = hash3D(i + vec3(0.0, 0.0, 1.0));
        float n101 = hash3D(i + vec3(1.0, 0.0, 1.0));
        float n011 = hash3D(i + vec3(0.0, 1.0, 1.0));
        float n111 = hash3D(i + vec3(1.0, 1.0, 1.0));
        
        float nx00 = mix(n000, n100, f.x);
        float nx10 = mix(n010, n110, f.x);
        float nx01 = mix(n001, n101, f.x);
        float nx11 = mix(n011, n111, f.x);
        
        float nxy0 = mix(nx00, nx10, f.y);
        float nxy1 = mix(nx01, nx11, f.y);
        
        return mix(nxy0, nxy1, f.z);
      }
      
      // 3D turbulence for seamless spheres
      float turbulence3D(vec3 p, int octaves) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 1.0;
        
        for(int i = 0; i < 8; i++) {
          if(i >= octaves) break;
          value += amplitude * abs(noise3D(p * frequency));
          frequency *= 2.0;
          amplitude *= 0.5;
        }
        
        return value;
      }
      
      void main() {
        // Generate seed-based color variety for this planet
        float colorSeedR = seededRandom(planetSeed * 1.41);
        float colorSeedG = seededRandom(planetSeed * 1.73);
        float colorSeedB = seededRandom(planetSeed * 2.17);
        
        // Apply subtle color variation to baseColor (±15% per channel)
        vec3 variedBaseColor = baseColor * vec3(
          0.85 + colorSeedR * 0.3,  // R: 85%-115%
          0.85 + colorSeedG * 0.3,  // G: 85%-115%
          0.85 + colorSeedB * 0.3   // B: 85%-115%
        );
        
        // Use 3D position for seamless noise
        vec3 rotatedPos = vPosition;
        float cosRot = cos(rotation);
        float sinRot = sin(rotation);
        rotatedPos = vec3(
          vPosition.x * cosRot - vPosition.z * sinRot,
          vPosition.y,
          vPosition.x * sinRot + vPosition.z * cosRot
        );
        vec3 samplePos = normalize(rotatedPos);
        
        // Smooth water base with subtle variation using 3D noise - scaled for larger patterns
        float baseNoise = turbulence3D(samplePos * 2.0, 3) * 0.1;
        
        // Create water current patterns at multiple scales using 3D noise
        // Large currents - main flow patterns - scaled for larger features
        float current1 = abs(turbulence3D(samplePos * 3.0, 4) - 0.5);
        float current2 = abs(turbulence3D(samplePos * 3.0 + vec3(4.0, 2.0, 0.0), 4) - 0.5);
        float largeCurrent = smoothstep(0.05, 0.0, current1) * 0.25;
        largeCurrent += smoothstep(0.05, 0.0, current2) * 0.25;
        
        // Medium currents - secondary flows
        float current3 = abs(turbulence3D(samplePos * 6.0 + vec3(1.2, 2.8, 0.0), 3) - 0.5);
        float mediumCurrent = smoothstep(0.04, 0.0, current3) * 0.15;
        
        // Fine currents - small details
        float current4 = abs(turbulence3D(samplePos * 12.0 + vec3(6.0, 8.0, 0.0), 2) - 0.5);
        float fineCurrent = smoothstep(0.03, 0.0, current4) * 0.1;
        
        // Combine all currents
        float totalCurrents = largeCurrent + mediumCurrent + fineCurrent;
        
        // Create depth variation - deeper water is darker using 3D noise
        float depthVariation = turbulence3D(samplePos * 2.5, 4);
        
        // Keep intensity lower to preserve water color (0.6 - 0.9 range)
        float intensity = 0.6 + baseNoise + depthVariation * 0.15;
        intensity += totalCurrents * 0.3; // Currents create lighter areas
        
        // Enhance water color saturation - preserve varied base blue/green
        vec3 colorModulation = variedBaseColor * 1.15; // Boost saturation
        
        // Lighting from all light sources using world space normal and position
        float totalDiffuse = 0.0;
        
        if (lightIntensity1 > 0.0) {
          vec3 lightDir1 = normalize(lightPosition1 - vWorldPosition);
          totalDiffuse += max(dot(vWorldNormal, lightDir1), 0.0) * lightIntensity1;
        }
        
        if (lightIntensity2 > 0.0) {
          vec3 lightDir2 = normalize(lightPosition2 - vWorldPosition);
          totalDiffuse += max(dot(vWorldNormal, lightDir2), 0.0) * lightIntensity2;
        }
        
        if (lightIntensity3 > 0.0) {
          vec3 lightDir3 = normalize(lightPosition3 - vWorldPosition);
          totalDiffuse += max(dot(vWorldNormal, lightDir3), 0.0) * lightIntensity3;
        }
        
        // Clamp and enhance the lighting difference between day and night side
        totalDiffuse = clamp(totalDiffuse, 0.0, 1.0);
        float lighting = totalDiffuse * 0.85 + 0.15; // Less ambient, more contrast
        
        // Add slight emissive on dark side for visibility
        float emissive = 0.1;
        
        // Water is moderately reflective - calculate from each light source
        vec3 specular = vec3(0.0);
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        
        if (lightIntensity1 > 0.0) {
          vec3 lightDir1 = normalize(lightPosition1 - vWorldPosition);
          vec3 reflectDir1 = reflect(-lightDir1, vWorldNormal);
          float spec1 = pow(max(dot(viewDir, reflectDir1), 0.0), 16.0);
          specular += variedBaseColor * spec1 * 0.4 * lightIntensity1;
        }
        
        if (lightIntensity2 > 0.0) {
          vec3 lightDir2 = normalize(lightPosition2 - vWorldPosition);
          vec3 reflectDir2 = reflect(-lightDir2, vWorldNormal);
          float spec2 = pow(max(dot(viewDir, reflectDir2), 0.0), 16.0);
          specular += variedBaseColor * spec2 * 0.4 * lightIntensity2;
        }
        
        if (lightIntensity3 > 0.0) {
          vec3 lightDir3 = normalize(lightPosition3 - vWorldPosition);
          vec3 reflectDir3 = reflect(-lightDir3, vWorldNormal);
          float spec3 = pow(max(dot(viewDir, reflectDir3), 0.0), 16.0);
          specular += variedBaseColor * spec3 * 0.4 * lightIntensity3;
        }
        
        // Apply color modulation and lighting
        vec3 finalColor = colorModulation * intensity * (lighting + emissive) + specular;
        
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });
}

