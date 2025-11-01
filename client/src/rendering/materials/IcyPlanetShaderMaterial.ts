import * as THREE from "three";

/**
 * Creates a shader material for icy planets with procedural crack networks
 * This is an alternative to the canvas-based IcePlanetMaterial
 * Features:
 * - Thin, interconnected crack networks
 * - Jagged, irregular crack patterns
 * - Branching sub-cracks
 * - Bright ice surface with dark cracks
 * - Very reflective specular highlights
 * - Supports multiple light sources
 * 
 * Note: This is used as a fallback for icy planets in the main shader
 */
export function createIcyPlanetShaderMaterial(
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
      
      // Hash function for 2D
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
      
      // Better noise for patterns
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
      
      // Turbulent flow
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
      
      void main() {
        // Use geometry UVs with rotation applied
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
        float intensity = 0.95 + baseIce;
        intensity -= totalCracks * 0.6; // Slightly darker cracks for visibility
        
        // Crack color modulation - slightly darker for denser network
        vec3 iceSurface = vec3(1.0, 1.0, 1.02);
        vec3 crackColor = vec3(0.03, 0.03, 0.06); // Darker blue-black
        vec3 colorModulation = mix(iceSurface, crackColor, totalCracks * 0.7);
        
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
        
        // Ice is very reflective - calculate from each light source
        vec3 specular = vec3(0.0);
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
        
        // Apply color modulation and lighting
        vec3 finalColor = colorModulation * intensity * (lighting + emissive) + specular;
        
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });
}

