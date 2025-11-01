import * as THREE from "three";
import { SurfaceTypeShaderValue, SurfaceTypeName } from "@constellation/shared";
import { createTerrestrialPlanetMaterial } from "./materials/TerrestrialPlanetMaterial";
import { createRockyPlanetMaterial } from "./materials/RockyPlanetMaterial";
import { createBarrenPlanetMaterial } from "./materials/BarrenPlanetMaterial";
import { createIcePlanetMaterial } from "./materials/IcePlanetMaterial";
import { createIceGiantMaterial } from "./materials/IceGiantMaterial";
import { createGasGiantMaterial } from "./materials/GasGiantMaterial";
import { createCloudMaterial as createCloudMaterialModule } from "./materials/CloudMaterial";
import { createDesertCloudMaterial as createDesertCloudMaterialModule } from "./materials/DesertCloudMaterial";
import { createIceCloudMaterial as createIceCloudMaterialModule } from "./materials/IceCloudMaterial";
import { createTerrestrialAtmosphereGlowMaterial as createTerrestrialAtmosphereGlowMaterialModule } from "./materials/TerrestrialAtmosphereGlowMaterial";
import { createDesertAtmosphereGlowMaterial as createDesertAtmosphereGlowMaterialModule } from "./materials/DesertAtmosphereGlowMaterial";
import { createStarMaterial as createStarMaterialModule } from "./materials/StarMaterial";
import {
  createDesertPlanetMaterial,
  regenerateDesertPlanetTexture as regenerateDesertPlanetTextureModule,
} from "./materials/DesertPlanetMaterial";
import { createOceanicPlanetMaterial } from "./materials/OceanicPlanetMaterial";
import { createVolcanicPlanetMaterial } from "./materials/VolcanicPlanetMaterial";
import { createAsteroidMaterial as createAsteroidMaterialModule } from "./materials/AsteroidMaterial";

/**
 * Factory for creating shader materials for celestial bodies and ships
 */
export class MaterialFactory {
  /**
   * Creates a shader material for stars with procedural animated texture and built-in glow
   */
  createStarMaterial(color: number): THREE.ShaderMaterial {
    return createStarMaterialModule(color);
  }

  /**
   * Creates a material for planets with procedural texture and lighting
   * Ice planets use MeshPhongMaterial with canvas-generated crack textures
   * Other planets use custom ShaderMaterial
   */
  createPlanetMaterial(
    color: number,
    surfaceType: SurfaceTypeName = "rocky",
    seed?: string,
    orbitalDistance?: number,
    habitability?: number,
    civilizationLevel?: string,
    hasAtmosphere?: boolean
  ): THREE.Material {
    // Generate unique seed number from string id
    const numericSeed = seed
      ? seed.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)
      : 0;

    // Normalize orbital distance for shader (typical habitable zone: 0.9-1.5 AU = 1.35e11 - 2.25e11 m)
    // Map to 0.0 (close) to 1.0+ (far) for easier shader use
    const normalizedDistance = orbitalDistance
      ? Math.max(0, (orbitalDistance - 1.0e11) / 2.0e11) // 0 at 1.0e11m, 1.0 at 3.0e11m
      : 0.5; // Default to mid-range

    // Convert civilization level to numeric scale (0-7)
    const civilizationLevels: { [key: string]: number } = {
      primitive: 1,
      agricultural: 2,
      industrial: 3,
      atomic: 4,
      information: 5,
      spacefaring: 6,
      interstellar: 7,
    };
    const numericCivilizationLevel = civilizationLevel
      ? civilizationLevels[civilizationLevel] || 0
      : 0;

    // Use modular material for Terrestrial planets
    if (surfaceType === "terrestrial") {
      return createTerrestrialPlanetMaterial(
        color,
        numericSeed,
        normalizedDistance,
        habitability ?? 0.5,
        numericCivilizationLevel
      );
    }

    // Use modular material for Rocky planets (heavily cratered)
    if (surfaceType === "rocky") {
      // Weathering level based on orbital distance (closer = more weathering from solar wind)
      const weatheringLevel = normalizedDistance < 0.5 ? 0.7 : 0.3;
      return createRockyPlanetMaterial(
        color,
        numericSeed,
        normalizedDistance,
        weatheringLevel
      );
    }

    // Use modular material for Barren planets (ancient, smooth, dust-covered)
    if (surfaceType === "barren") {
      // Dust thickness varies - some planets more dust-covered than others
      const dustThickness = 0.5 + (numericSeed % 100) / 200; // 0.5 to 1.0
      return createBarrenPlanetMaterial(
        color,
        numericSeed,
        normalizedDistance,
        dustThickness
      );
    }

    // Use shader material for Desert planets (sand dunes, arid)
    if (surfaceType === "desert") {
      return createDesertPlanetMaterial(
        color,
        numericSeed,
        hasAtmosphere || false,
        normalizedDistance,
        habitability ?? 0.0
      );
    }

    // Ice planets use 3D shader with procedural ice features
    if (surfaceType === "icy" && seed) {
      return createIcePlanetMaterial(color, numericSeed);
    }

    // Ice giants use custom shader with soft cloud patterns (Neptune/Uranus-like)
    if (surfaceType === "ice_giant") {
      return createIceGiantMaterial(color, numericSeed);
    }

    // Gas giants use custom shader with thick colorful bands (Jupiter/Saturn-like)
    if (surfaceType === "gas_giant") {
      return createGasGiantMaterial(color, numericSeed);
    }

    // Oceanic planets use custom shader with water currents and depth variation
    if (surfaceType === "oceanic") {
      return createOceanicPlanetMaterial(
        color,
        numericSeed,
        normalizedDistance
      );
    }

    // Volcanic planets use custom shader with animated lava flows
    if (surfaceType === "volcanic") {
      return createVolcanicPlanetMaterial(
        color,
        numericSeed,
        normalizedDistance
      );
    }

    // All other planets use custom shader
    return new THREE.ShaderMaterial({
      uniforms: {
        baseColor: { value: new THREE.Color(color) },
        lightPosition1: { value: new THREE.Vector3(0, 0, 0) }, // Primary star
        lightPosition2: { value: new THREE.Vector3(0, 0, 0) }, // Companion star 1
        lightPosition3: { value: new THREE.Vector3(0, 0, 0) }, // Companion star 2
        lightIntensity1: { value: 1.0 }, // Primary star intensity
        lightIntensity2: { value: 0.0 }, // Companion star 1 intensity (0 if no companion)
        lightIntensity3: { value: 0.0 }, // Companion star 2 intensity (0 if no companion)
        rotation: { value: 0.0 }, // Planet rotation angle
        surfaceType: {
          value: SurfaceTypeShaderValue[surfaceType] || 0.0,
        },
        planetSeed: { value: numericSeed }, // Planet seed for consistent variety
        orbitalDistance: { value: normalizedDistance }, // Normalized distance from star (0-1+)
        habitability: {
          value: habitability !== undefined ? habitability : 0.5,
        }, // 0-1 habitability score
        time: { value: 0.0 }, // Time for animations
      },
      lights: false, // Disable Three.js lighting system (we do custom lighting)
      vertexShader: `
        uniform float surfaceType;
        uniform float planetSeed;
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
        uniform float surfaceType;
        uniform float planetSeed;
        uniform float orbitalDistance; // 0.0 (close to star) to 1.0+ (far from star)
        uniform float habitability; // 0.0 (uninhabitable) to 1.0 (highly habitable)
        uniform float time; // Time for animations
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        varying vec2 vUv;
        
        // Note: cameraPosition is automatically provided by Three.js
        
        // Surface type constants
        // IMPORTANT: These must match SurfaceTypeShaderValue in shared/src/types.ts
        const float SURFACE_TERRESTRIAL = 0.0;
        const float SURFACE_DESERT = 1.0;
        const float SURFACE_BARREN = 2.0;
        const float SURFACE_ROCKY = 3.0;
        const float SURFACE_GAS_GIANT = 4.0;
        const float SURFACE_ICY = 5.0;
        const float SURFACE_VOLCANIC = 6.0;
        const float SURFACE_OCEANIC = 7.0;
        
        // Hash function for pseudo-random numbers
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        
        // Seeded random for consistent variation per planet
        float seededRandom(float seed) {
          return fract(sin(seed) * 43758.5453123);
        }
        
        // Simple noise for surface features
        float noise(vec2 p) {
          return sin(p.x * 10.0) * cos(p.y * 8.0) * 0.5 + 0.5;
        }
        
        // Better noise for gas giant clouds
        float noise2D(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
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
        
        // Turbulent flow for gas giants (2D)
        float turbulence(vec2 p, int octaves) {
          float value = 0.0;
          float amplitude = 0.5;
          float frequency = 1.0;
          
          for(int i = 0; i < 8; i++) {
            if(i >= octaves) break;
            value += amplitude * abs(noise2D(p * frequency));
            frequency *= 2.0;
            amplitude *= 0.5;
          }
          
          return value;
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
        
        // Generate seamless 3D craters using Voronoi-like cells
        float craters3D(vec3 pos, float scale) {
          vec3 scaledPos = pos * scale;
          vec3 grid = floor(scaledPos);
          vec3 localPos = fract(scaledPos);
          
          float craterEffect = 0.0;
          float minDist = 10.0;
          vec3 closestCraterPos = vec3(0.0);
          
          // Check this cell and neighboring cells in 3D
          for(float z = -1.0; z <= 1.0; z++) {
            for(float y = -1.0; y <= 1.0; y++) {
              for(float x = -1.0; x <= 1.0; x++) {
                vec3 neighbor = grid + vec3(x, y, z);
                
                // Generate random position for crater in this cell
                vec3 craterPos = vec3(
                  hash3D(neighbor),
                  hash3D(neighbor + vec3(13.7, 27.3, 41.1)),
                  hash3D(neighbor + vec3(53.2, 67.4, 79.8))
                );
                
                // Calculate distance to crater center
                vec3 toCenter = (localPos - vec3(x, y, z)) - craterPos;
                float dist = length(toCenter);
                
                // Track closest crater
                if(dist < minDist) {
                  minDist = dist;
                  closestCraterPos = craterPos;
                }
                
                // Generate random size - larger range for more dramatic craters
                float craterSize = 0.2 + hash3D(neighbor + vec3(50.1, 60.2, 70.3)) * 0.35;
                
                // Only create crater if random value is above threshold (controls density)
                float shouldExist = hash3D(neighbor + vec3(100.0, 200.0, 300.0));
                if(shouldExist > 0.6) {
                  // Crater bowl with raised rim - more dramatic depth
                  if(dist < craterSize) {
                    float rimDist = abs(dist - craterSize * 0.85) / (craterSize * 0.15);
                    float rimHeight = smoothstep(1.0, 0.0, rimDist) * 0.15;
                    float bowlDepth = smoothstep(craterSize, 0.0, dist) * -0.25;
                    craterEffect += bowlDepth + rimHeight;
                  }
                }
              }
            }
          }
          
          return craterEffect;
        }
        
        void main() {
          // Use geometry UVs with rotation applied
          // This keeps the texture fixed to the surface when the planet rotates
          float u = vUv.x + rotation / (2.0 * 3.14159);
          float v = vUv.y;
          
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
          
          // Base color intensity
          float intensity = 1.0;
          vec3 colorModulation = vec3(1.0);
          
          // Note: Gas giant rendering now handled by GasGiantMaterial.ts
          // This fallback case should not be reached for gas_giant surface type
          // NOTE: Icy planets now use IcePlanetMaterial (canvas-based)
          if(false && surfaceType == SURFACE_ICY) {
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
            
            // Smooth ice base with very subtle variation using 3D noise - scaled for larger patterns
            float baseIce = turbulence3D(samplePos * 1.2, 2) * 0.05;
            
            // Create thin, interconnected crack networks
            float totalCracks = 0.0;
            
            // Main crack systems - more cracks, thinner lines
            for(int i = 0; i < 30; i++) {
              float seed = float(i) * 123.456;
              
              // Random crack origin point
              vec2 origin = vec2(
                hash(vec2(seed, seed * 2.0)),
                hash(vec2(seed * 3.0, seed * 4.0))
              );
              
              // Random crack direction angle
              float angle = hash(vec2(seed * 5.0, seed * 6.0)) * 6.28318;
              vec2 crackDir = vec2(cos(angle), sin(angle));
              
              // Create a directed crack from origin
              vec2 toPoint = vec2(u, v) - origin;
              
              // Project point onto crack direction
              float alongCrack = dot(toPoint, crackDir);
              
              // Perpendicular distance from crack line
              float perpDist = abs(dot(toPoint, vec2(-crackDir.y, crackDir.x)));
              
              // Add jagged noise to make crack irregular and zigzag
              // Multiple frequencies for realistic jagged appearance
              float jaggedNoise1 = turbulence(vec2(alongCrack * 30.0, seed), 3) * 0.005;
              float jaggedNoise2 = turbulence(vec2(alongCrack * 60.0, seed * 1.3), 2) * 0.003;
              float jaggedNoise3 = noise(vec2(alongCrack * 120.0, seed * 1.7)) * 0.0015;
              
              // Combine multiple noise layers for jagged effect with wider detection
              perpDist = perpDist + jaggedNoise1 + jaggedNoise2 + jaggedNoise3;
              
              // Draw longer cracks with thinner width
              if(alongCrack > 0.0 && alongCrack < 0.5) {
                // Thinner cracks with subtle taper, wider to accommodate jaggedness
                float widthTaper = 1.0 - (alongCrack / 0.5) * 0.3; // Less tapering
                float crackWidth = 0.004 * widthTaper + 0.0015; // Slightly wider for jagged lines
                
                float crack = smoothstep(crackWidth, crackWidth * 0.3, perpDist);
                totalCracks += crack * 0.2;
                
                // Add multiple sub-branches for network effect
                // Branch 1 at 1/3 along crack
                float branch1Point = 0.17;
                if(alongCrack > branch1Point && alongCrack < branch1Point + 0.25) {
                  float branchAngle1 = angle + 0.8; // Branch at ~45 degrees
                  vec2 branchDir1 = vec2(cos(branchAngle1), sin(branchAngle1));
                  vec2 branchOrigin1 = origin + crackDir * branch1Point;
                  vec2 toBranch1 = vec2(u, v) - branchOrigin1;
                  
                  float alongBranch1 = dot(toBranch1, branchDir1);
                  float perpBranch1 = abs(dot(toBranch1, vec2(-branchDir1.y, branchDir1.x)));
                  
                  // Add jagged noise to sub-branch
                  float branchJagged1 = turbulence(vec2(alongBranch1 * 50.0, seed * 2.1), 2) * 0.003;
                  perpBranch1 += branchJagged1;
                  
                  if(alongBranch1 > 0.0 && alongBranch1 < 0.2) {
                    float branchWidth1 = 0.0025; // Slightly wider
                    totalCracks += smoothstep(branchWidth1, branchWidth1 * 0.3, perpBranch1) * 0.15;
                  }
                }
                
                // Branch 2 at 2/3 along crack (opposite side)
                float branch2Point = 0.33;
                if(alongCrack > branch2Point && alongCrack < branch2Point + 0.2) {
                  float branchAngle2 = angle - 0.7; // Branch at opposite angle
                  vec2 branchDir2 = vec2(cos(branchAngle2), sin(branchAngle2));
                  vec2 branchOrigin2 = origin + crackDir * branch2Point;
                  vec2 toBranch2 = vec2(u, v) - branchOrigin2;
                  
                  float alongBranch2 = dot(toBranch2, branchDir2);
                  float perpBranch2 = abs(dot(toBranch2, vec2(-branchDir2.y, branchDir2.x)));
                  
                  // Add jagged noise to sub-branch
                  float branchJagged2 = turbulence(vec2(alongBranch2 * 50.0, seed * 2.7), 2) * 0.003;
                  perpBranch2 += branchJagged2;
                  
                  if(alongBranch2 > 0.0 && alongBranch2 < 0.15) {
                    float branchWidth2 = 0.0025; // Slightly wider
                    totalCracks += smoothstep(branchWidth2, branchWidth2 * 0.3, perpBranch2) * 0.12;
                  }
                }
              }
            }
            
            // More fine random cracks for network density
            for(int i = 0; i < 70; i++) {
              float seed = float(i) * 456.789 + 1000.0;
              vec2 crackPos = vec2(
                hash(vec2(seed, seed * 1.1)),
                hash(vec2(seed * 1.2, seed * 1.3))
              );
              float crackAngle = hash(vec2(seed * 1.4, seed * 1.5)) * 6.28318;
              vec2 crackDir = vec2(cos(crackAngle), sin(crackAngle));
              
              vec2 toPoint = vec2(u, v) - crackPos;
              float alongCrack = dot(toPoint, crackDir);
              float perpDist = abs(dot(toPoint, vec2(-crackDir.y, crackDir.x)));
              
              // Add jagged noise to fine cracks
              float fineJagged = turbulence(vec2(alongCrack * 80.0, seed * 0.5), 2) * 0.002;
              perpDist += fineJagged;
              
              // Longer fine cracks for better connectivity
              if(alongCrack > 0.0 && alongCrack < 0.12) {
                float fineCrack = smoothstep(0.002, 0.0008, perpDist); // Slightly wider
                totalCracks += fineCrack * 0.12;
              }
            }
            
            totalCracks = clamp(totalCracks, 0.0, 1.0);
            
            // Base intensity: bright ice surface
            intensity = 0.95 + baseIce;
            intensity -= totalCracks * 0.6; // Slightly darker cracks for visibility
            
            // Crack color modulation - slightly darker for denser network
            vec3 iceSurface = vec3(1.0, 1.0, 1.02);
            vec3 crackColor = vec3(0.03, 0.03, 0.06); // Darker blue-black
            colorModulation = mix(iceSurface, crackColor, totalCracks * 0.7);
          }
          // Fallback for any unhandled surface types
          // NOTE: Oceanic planets now use OceanicPlanetMaterial
          // NOTE: Volcanic planets now use VolcanicPlanetMaterial
          else {
            intensity = 0.8;
            colorModulation = variedBaseColor;
          }
          
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
          
          // Add specular reflection for icy, oceanic, and terrestrial planets from all light sources
          vec3 specular = vec3(0.0);
          // NOTE: Icy planets now use IcePlanetMaterial (canvas-based)
          if(false && surfaceType == SURFACE_ICY) {
            // Ice is very reflective - calculate from each light source
            vec3 viewDir = normalize(cameraPosition - vWorldPosition);
            
            if (lightIntensity1 > 0.0) {
              vec3 lightDir1 = normalize(lightPosition1 - vWorldPosition);
              vec3 reflectDir1 = reflect(-lightDir1, vWorldNormal);
              float spec1 = pow(max(dot(viewDir, reflectDir1), 0.0), 32.0);
              specular += vec3(1.0) * spec1 * 0.6 * lightIntensity1;
            }
            
            if (lightIntensity2 > 0.0) {
              vec3 lightDir2 = normalize(lightPosition2 - vWorldPosition);
              vec3 reflectDir2 = reflect(-lightDir2, vWorldNormal);
              float spec2 = pow(max(dot(viewDir, reflectDir2), 0.0), 32.0);
              specular += vec3(1.0) * spec2 * 0.6 * lightIntensity2;
            }
            
            if (lightIntensity3 > 0.0) {
              vec3 lightDir3 = normalize(lightPosition3 - vWorldPosition);
              vec3 reflectDir3 = reflect(-lightDir3, vWorldNormal);
              float spec3 = pow(max(dot(viewDir, reflectDir3), 0.0), 32.0);
              specular += vec3(1.0) * spec3 * 0.6 * lightIntensity3;
            }
          }
          if(surfaceType == SURFACE_TERRESTRIAL) {
            // Terrestrial planets - specular on oceans and ice caps
            // NOTE: This is fallback code - terrestrial planets should use TerrestrialPlanetMaterial
            vec3 viewDir = normalize(cameraPosition - vWorldPosition);
            
            // Use primary light source for specular calculation
            vec3 lightDir1 = lightIntensity1 > 0.0 ? normalize(lightPosition1 - vWorldPosition) : vec3(0.0, 0.0, 1.0);
            vec3 reflectDir = reflect(-lightDir1, vWorldNormal);
            
            // Recalculate terrain parameters using same seed-based values and 3D noise
            float continentScaleSeed = seededRandom(planetSeed * 1.1);
            float waterLevelSeed = seededRandom(planetSeed * 1.3);
            float iceCapSizeSeed = seededRandom(planetSeed * 1.7);
            
            // Match main shader's reduced continent scale (was 2.5-6.0, now 1.0-2.5)
            float continentScale = 1.0 + continentScaleSeed * 1.5;
            float landThreshold = 0.40 + waterLevelSeed * 0.15;
            
            // Use same distance-based AND habitability-based ice threshold as main shader
            float temperatureFactor = clamp(orbitalDistance, 0.0, 2.0);
            float minIceThreshold, maxIceThreshold;
            
            if (temperatureFactor < 0.5) {
              minIceThreshold = 0.85;
              maxIceThreshold = 0.92;
            } else if (temperatureFactor < 1.0) {
              minIceThreshold = 0.70;
              maxIceThreshold = 0.85;
            } else if (temperatureFactor < 1.5) {
              minIceThreshold = 0.30;
              maxIceThreshold = 0.70;
            } else {
              minIceThreshold = 0.10;
              maxIceThreshold = 0.30;
            }
            
            // Apply same habitability adjustments
            if (habitability < 0.6) {
              float coldnessFactor = (0.6 - habitability) / 0.6;
              float iceExpansion = coldnessFactor * 0.6;
              minIceThreshold = max(0.05, minIceThreshold - iceExpansion);
              maxIceThreshold = max(0.10, maxIceThreshold - iceExpansion);
            } else if (habitability > 0.7) {
              float warmthFactor = (habitability - 0.7) / 0.3;
              float iceShrinkage = warmthFactor * 0.15;
              minIceThreshold = min(0.92, minIceThreshold + iceShrinkage);
              maxIceThreshold = min(0.95, maxIceThreshold + iceShrinkage);
            }
            
            float baseIceThreshold = minIceThreshold + iceCapSizeSeed * (maxIceThreshold - minIceThreshold);
            
            // Use 3D position for seamless noise
            vec3 rotatedPos2 = vPosition;
            float cosRot2 = cos(rotation);
            float sinRot2 = sin(rotation);
            rotatedPos2 = vec3(
              vPosition.x * cosRot2 - vPosition.z * sinRot2,
              vPosition.y,
              vPosition.x * sinRot2 + vPosition.z * cosRot2
            );
            vec3 samplePos2 = normalize(rotatedPos2) * continentScale;
            
            float continentNoise = turbulence3D(samplePos2, 5);
            float distanceFromPole = abs(v - 0.5) * 2.0;
            
            // Match irregular ice cap boundary using 3D noise
            float iceNoise = turbulence3D(samplePos2 * 0.8, 4) * 0.12;
            float iceThreshold = baseIceThreshold - iceNoise;
            
            bool isWater = continentNoise <= landThreshold;
            bool isPolarIce = distanceFromPole > iceThreshold;
            
            if (isPolarIce) {
              // Ice caps with layered specular
              // Inner ice: very glossy and reflective
              // Outer ice: less glossy
              
              float innerIceThreshold = iceThreshold + 0.05;
              bool isInnerIce = distanceFromPole > innerIceThreshold;
              
              if (isInnerIce) {
                // Inner core: very reflective and glossy
                float spec = pow(max(dot(viewDir, reflectDir), 0.0), 64.0); // Higher shininess
                specular = vec3(1.0) * spec * 0.7; // Stronger reflection
              } else {
                // Outer ice: less glossy
                float spec = pow(max(dot(viewDir, reflectDir), 0.0), 24.0); // Lower shininess
                specular = vec3(0.9, 0.95, 1.0) * spec * 0.4; // Weaker, bluish reflection
              }
            }
            else if (isWater) {
              // Oceans are moderately reflective
              float spec = pow(max(dot(viewDir, reflectDir), 0.0), 16.0);
              specular = vec3(0.2, 0.3, 0.5) * spec * 0.3;
              
              // Add specular for sea ice near ice caps
              if (distanceFromPole > iceThreshold * 0.85) {
                float distanceBeyondIceCap = distanceFromPole - iceThreshold;
                float seaIceRange = 0.15;
                float seaIceIntensity = smoothstep(seaIceRange, 0.0, distanceBeyondIceCap);
                
                if (seaIceIntensity > 0.0) {
                  // Recreate ice pattern (same as main shader)
                  float icePattern1 = turbulence3D(samplePos2 * 8.0, 4);
                  float icePattern2 = turbulence3D(samplePos2 * 15.0, 3);
                  float largeFloes = smoothstep(0.45, 0.55, icePattern1) * seaIceIntensity;
                  float smallFloes = smoothstep(0.5, 0.6, icePattern2) * seaIceIntensity * 0.5;
                  float seaIceZone = clamp(largeFloes + smallFloes, 0.0, 1.0);
                  
                  // Sea ice gets icy specular (less than ice caps but more than water)
                  float iceSpec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
                  vec3 iceSpecular = vec3(0.9, 0.95, 1.0) * iceSpec * 0.5;
                  
                  // Blend ice specular with water specular
                  specular = mix(specular, iceSpecular, seaIceZone);
                }
              }
            }
          }
          
          // Apply color modulation
          vec3 finalColor = colorModulation * intensity * (lighting + emissive) + specular;
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
    });
  }

  /**
   * Creates a shader material for terrestrial planet atmospheres
   * Syncs with ocean color based on seed
   */
  createTerrestrialAtmosphereGlowMaterial(
    planetSeed: number
  ): THREE.ShaderMaterial {
    return createTerrestrialAtmosphereGlowMaterialModule(planetSeed);
  }

  /**
   * Creates a shader material for desert planet atmospheres
   * Syncs with sand palette color based on seed, uses subtle glow
   */
  createDesertAtmosphereGlowMaterial(planetSeed: number): THREE.ShaderMaterial {
    return createDesertAtmosphereGlowMaterialModule(planetSeed);
  }

  /**
   * Creates a generic shader material for planet atmospheres
   * Used for gas giants and other non-terrestrial, non-desert planets
   */
  createGenericAtmosphereMaterial(
    color: number,
    opacityMultiplier: number = 1.0
  ): THREE.ShaderMaterial {
    const atmosphereColor = new THREE.Color(color);
    atmosphereColor.multiplyScalar(1.3); // Brighter

    // For Earth-like colors (blue/green), add slight cyan tint
    if (atmosphereColor.b > atmosphereColor.r) {
      atmosphereColor.g = Math.min(atmosphereColor.g * 1.2, 1.0);
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
      uniform float opacityMultiplier;
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
        float intensity = (innerGlow + outerGlow + scattering) * opacityMultiplier;
        
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
        opacityMultiplier: { value: opacityMultiplier },
      },
      vertexShader,
      fragmentShader,
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
    cloudCoverage: number = 0.5,
    planetSeed: number = 0
  ): THREE.ShaderMaterial {
    return createCloudMaterialModule(baseColor, cloudCoverage, planetSeed);
  }

  /**
   * Creates a shader material for desert sand storm layers
   * with 3D patterns and multi-directional wind movement
   */
  createDesertCloudMaterial(
    baseColor: number,
    stormCoverage: number = 0.5,
    planetSeed: number = 0
  ): THREE.ShaderMaterial {
    return createDesertCloudMaterialModule(
      baseColor,
      stormCoverage,
      planetSeed
    );
  }

  /**
   * Creates a shader material for ice world frost/ice crystal clouds
   */
  createIceCloudMaterial(
    baseColor: number,
    frostCoverage: number = 0.5,
    planetSeed: number = 0
  ): THREE.ShaderMaterial {
    return createIceCloudMaterialModule(baseColor, frostCoverage, planetSeed);
  }

  /**
   * Creates a shader material for asteroids based on composition
   */
  createAsteroidMaterial(
    composition: "water" | "metal" | "silica",
    color: number,
    shape: "spherical" | "elliptical" | "rugged"
  ): THREE.ShaderMaterial {
    return createAsteroidMaterialModule(composition, color, shape);
  }

  /**
   * Regenerate desert planet with a new seed
   * Used for debug mode to iterate on desert planet appearances
   */
  regenerateDesertPlanetTexture(
    material: THREE.ShaderMaterial,
    newSeed: number
  ): void {
    regenerateDesertPlanetTextureModule(material, newSeed);
  }
}
