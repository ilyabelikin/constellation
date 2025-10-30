import * as THREE from "three";

/**
 * GLSL utility functions shared between vertex and fragment shaders
 */
const GLSL_UTILS = `
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

  // 3D crater generation using Voronoi-like cells
  float craters3D(vec3 pos, float scale) {
    vec3 scaledPos = pos * scale;
    vec3 grid = floor(scaledPos);
    vec3 localPos = fract(scaledPos);
    
    float craterEffect = 0.0;
    
    // Check neighboring cells in 3D
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
          
          // Random crater size with variety
          float craterSize = 0.2 + hash3D(neighbor + vec3(50.1, 60.2, 70.3)) * 0.35;
          
          // Crater existence probability
          float shouldExist = hash3D(neighbor + vec3(100.0, 200.0, 300.0));
          
          if(shouldExist > 0.6 && dist < craterSize) {
            // Enhanced crater profile with central peak
            float normalizedDist = dist / craterSize;
            
            // Bowl depth - deeper in center
            float bowlDepth = -0.3 * (1.0 - normalizedDist * normalizedDist);
            
            // Rim height - raised edge
            float rimStart = 0.75;
            float rimEnd = 0.95;
            float rimHeight = 0.0;
            if(normalizedDist > rimStart) {
              float rimPos = (normalizedDist - rimStart) / (rimEnd - rimStart);
              rimHeight = 0.18 * sin(rimPos * 3.14159);
            }
            
            // Central peak for large craters
            float centralPeak = 0.0;
            if(normalizedDist < 0.15 && craterSize > 0.4) {
              centralPeak = 0.08 * (1.0 - normalizedDist / 0.15);
            }
            
            craterEffect += bowlDepth + rimHeight + centralPeak;
          }
        }
      }
    }
    
    return craterEffect;
  }
`;

/**
 * Build vertex shader for rocky planet material
 */
function buildVertexShader(): string {
  return (
    GLSL_UTILS +
    `
    uniform float rotation;
    uniform float planetSeed;
    
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vWorldPosition;
    varying vec3 vWorldNormal;
    varying vec2 vUv;
    
    void main() {
      vec3 displacedPosition = position;
      vec3 displacedNormal = normal;
      
      // Normalize position for seamless 3D sampling
      vec3 normalizedPos = normalize(position);
      
      // Apply rotation
      float cosRot = cos(rotation);
      float sinRot = sin(rotation);
      vec3 rotatedPos = vec3(
        normalizedPos.x * cosRot - normalizedPos.z * sinRot,
        normalizedPos.y,
        normalizedPos.x * sinRot + normalizedPos.z * cosRot
      );
      
      // Generate seed-based crater variety
      float craterSizeSeed = seededRandom(planetSeed * 1.5);
      float craterScaleMultiplier = 1.5 + craterSizeSeed * 3.0;
      
      // Calculate crater displacement at multiple scales
      float largeCraters = craters3D(rotatedPos, 0.6 * craterScaleMultiplier);
      float mediumCraters = craters3D(rotatedPos, 1.25 * craterScaleMultiplier) * 0.7;
      float smallCraters = craters3D(rotatedPos, 2.25 * craterScaleMultiplier) * 0.5;
      
      float totalDisplacement = largeCraters + mediumCraters + smallCraters;
      
      // Apply displacement along normal direction
      float displacementAmount = totalDisplacement * 0.08;
      displacedPosition = position + normal * displacementAmount;
      
      // Calculate normal perturbation for realistic lighting
      float epsilon = 0.05;
      
      vec3 tangent = normalize(cross(normal, vec3(0.0, 1.0, 0.0)));
      if(length(tangent) < 0.1) {
        tangent = normalize(cross(normal, vec3(1.0, 0.0, 0.0)));
      }
      vec3 bitangent = normalize(cross(normal, tangent));
      
      // Sample displacement in tangent space
      vec3 posX = normalize(position + tangent * epsilon);
      vec3 rotX = vec3(
        posX.x * cosRot - posX.z * sinRot,
        posX.y,
        posX.x * sinRot + posX.z * cosRot
      );
      float dispX = (craters3D(rotX, 0.6 * craterScaleMultiplier) + 
                    craters3D(rotX, 1.25 * craterScaleMultiplier) * 0.7) * 0.08;
      
      vec3 posY = normalize(position + bitangent * epsilon);
      vec3 rotY = vec3(
        posY.x * cosRot - posY.z * sinRot,
        posY.y,
        posY.x * sinRot + posY.z * cosRot
      );
      float dispY = (craters3D(rotY, 0.6 * craterScaleMultiplier) + 
                    craters3D(rotY, 1.25 * craterScaleMultiplier) * 0.7) * 0.08;
      
      // Calculate gradient
      vec2 gradient = vec2(dispX - displacementAmount, dispY - displacementAmount) / epsilon;
      
      // Perturb normal
      vec3 perturbation = tangent * gradient.x + bitangent * gradient.y;
      displacedNormal = normalize(normal - perturbation * 0.3);
      
      vNormal = normalize(normalMatrix * displacedNormal);
      vPosition = position;
      vUv = uv;
      vec4 worldPosition = modelMatrix * vec4(displacedPosition, 1.0);
      vWorldPosition = worldPosition.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * displacedNormal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
    }
  `
  );
}

/**
 * Build fragment shader for rocky planet material
 */
function buildFragmentShader(): string {
  return (
    GLSL_UTILS +
    `
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
    uniform float weatheringLevel;
    
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vWorldPosition;
    varying vec3 vWorldNormal;
    varying vec2 vUv;
    
    void main() {
      // Apply rotation to sample position
      vec3 rotatedPos = vPosition;
      float cosRot = cos(rotation);
      float sinRot = sin(rotation);
      rotatedPos = vec3(
        vPosition.x * cosRot - vPosition.z * sinRot,
        vPosition.y,
        vPosition.x * sinRot + vPosition.z * cosRot
      );
      vec3 samplePos = normalize(rotatedPos);
      
      // Generate seed-based variety parameters
      float craterSizeSeed = seededRandom(planetSeed * 1.5);
      float craterDensitySeed = seededRandom(planetSeed * 2.3);
      float colorTypeSeed = seededRandom(planetSeed * 3.7);
      float brightnessSeed = seededRandom(planetSeed * 4.1);
      float hueSeed = seededRandom(planetSeed * 5.3);
      float mineralSeed = seededRandom(planetSeed * 6.7);
      float strataSeed = seededRandom(planetSeed * 7.1);
      
      // Base color determination with enhanced variety
      float baseBrightness = 0.25 + brightnessSeed * 0.35;
      vec3 rockColor;
      
      if(colorTypeSeed < 0.2) {
        // Pure gray rocks - lunar/mercury-like
        float grayValue = baseBrightness;
        rockColor = vec3(
          grayValue,
          grayValue * 0.98,
          grayValue * 0.96
        );
      }
      else if(colorTypeSeed < 0.4) {
        // Brownish rocks - Mars-like rust and oxidation
        float brownBase = baseBrightness;
        rockColor = vec3(
          brownBase * (1.0 + hueSeed * 0.3),
          brownBase * (0.7 + hueSeed * 0.2),
          brownBase * (0.5 + hueSeed * 0.15)
        );
      }
      else if(colorTypeSeed < 0.6) {
        // Yellowish/tan rocks - desert stone
        float yellowBase = baseBrightness * 1.1;
        rockColor = vec3(
          yellowBase * (1.0 + hueSeed * 0.2),
          yellowBase * (0.95 + hueSeed * 0.15),
          yellowBase * (0.6 + hueSeed * 0.2)
        );
      }
      else if(colorTypeSeed < 0.8) {
        // Dark charcoal/basalt - volcanic appearance
        float darkBase = baseBrightness * 0.7;
        rockColor = vec3(
          darkBase * (1.0 + hueSeed * 0.15),
          darkBase * (0.95 + hueSeed * 0.1),
          darkBase * (0.9 + hueSeed * 0.1)
        );
      }
      else {
        // Reddish rocks - iron-rich
        float redBase = baseBrightness * 0.9;
        rockColor = vec3(
          redBase * (1.2 + hueSeed * 0.15),
          redBase * (0.6 + hueSeed * 0.15),
          redBase * (0.55 + hueSeed * 0.1)
        );
      }
      
      vec3 colorModulation = rockColor;
      float intensity = 1.0;
      
      // Calculate craters for shading
      float craterScaleMultiplier = 1.5 + craterSizeSeed * 3.0;
      float largeCraters = craters3D(samplePos, 0.6 * craterScaleMultiplier);
      float mediumCraters = craters3D(samplePos, 1.25 * craterScaleMultiplier) * 0.7;
      float smallCraters = craters3D(samplePos, 2.25 * craterScaleMultiplier) * 0.5;
      float totalCraters = largeCraters + mediumCraters + smallCraters;
      
      intensity += totalCraters;
      
      // Add geological strata (exposed rock layers)
      float strataFreq = 8.0 + strataSeed * 12.0;
      float strataPattern = sin(samplePos.y * strataFreq + noise3D(samplePos * 2.0) * 2.0);
      float strataIntensity = smoothstep(0.6, 0.8, strataPattern);
      
      // Strata adds color variation
      vec3 strataColor = rockColor * (0.85 + strataSeed * 0.15);
      colorModulation = mix(colorModulation, strataColor, strataIntensity * 0.3);
      
      // Add mineral deposits (bright spots)
      float mineralPattern = turbulence3D(samplePos * 8.0 + vec3(mineralSeed * 100.0), 4);
      float hasMinerals = smoothstep(0.7, 0.9, mineralPattern);
      
      if(hasMinerals > 0.1) {
        // Mineral colors based on seed
        vec3 mineralColor;
        if(mineralSeed < 0.33) {
          // Bright silicates - white/pale
          mineralColor = vec3(0.8, 0.8, 0.75);
        } else if(mineralSeed < 0.66) {
          // Metallic ores - silvery
          mineralColor = vec3(0.7, 0.72, 0.68);
        } else {
          // Oxidized minerals - orange/rust
          mineralColor = vec3(0.75, 0.6, 0.45);
        }
        
        colorModulation = mix(colorModulation, mineralColor, hasMinerals * 0.4);
        intensity += hasMinerals * 0.15;
      }
      
      // Add weathering effects (surface erosion and dust)
      float weatheringNoise = turbulence3D(samplePos * 4.0, 5);
      float dustCoverage = weatheringNoise * weatheringLevel;
      
      // Dust smooths out details and adds uniform color
      vec3 dustColor = rockColor * 1.2; // Lighter, more uniform
      colorModulation = mix(colorModulation, dustColor, dustCoverage * 0.3);
      
      // Rocky terrain micro-variation
      float rockTexture = turbulence3D(samplePos * 6.0, 4) * 0.12;
      intensity += rockTexture;
      
      // Enhanced crater bowl shadowing with ambient occlusion
      if(totalCraters < -0.05) {
        float shadowDepth = abs(totalCraters) * 2.0;
        float ao = 1.0 - clamp(shadowDepth * 0.5, 0.0, 0.6);
        intensity *= ao;
        intensity -= shadowDepth * 0.2;
        
        // Darken and cool crater interiors
        colorModulation *= vec3(0.85, 0.85, 0.9);
        
        // Add darker material in deep craters (exposed bedrock)
        if(totalCraters < -0.15) {
          float bedrockFactor = abs(totalCraters + 0.15) * 3.0;
          vec3 bedrockColor = rockColor * 0.6; // Much darker
          colorModulation = mix(colorModulation, bedrockColor, clamp(bedrockFactor, 0.0, 0.5));
        }
      }
      
      // Brighten crater rims with enhanced highlights
      if(totalCraters > 0.02) {
        float rimBrightness = totalCraters * 3.0;
        intensity += rimBrightness * 0.25;
        
        // Add warming to sun-facing rim edges
        float warmth = 1.0 + (colorTypeSeed * 0.08);
        colorModulation *= vec3(1.0 + warmth * 0.05, 1.0 + warmth * 0.03, 1.0);
        
        // Expose fresher (less weathered) rock on rims
        if(weatheringLevel > 0.3) {
          float freshRock = clamp((totalCraters - 0.02) * 5.0, 0.0, 1.0);
          colorModulation = mix(colorModulation, rockColor, freshRock * 0.4);
        }
      }
      
      // Apply lighting from all light sources
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
      
      // Clamp and enhance lighting contrast
      totalDiffuse = clamp(totalDiffuse, 0.0, 1.0);
      float lighting = totalDiffuse * 0.85 + 0.15;
      
      // Add very subtle specular for mineral-rich areas from all light sources
      if(hasMinerals > 0.5) {
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        
        if (lightIntensity1 > 0.0) {
          vec3 lightDir1 = normalize(lightPosition1 - vWorldPosition);
          vec3 reflectDir1 = reflect(-lightDir1, vWorldNormal);
          float spec1 = pow(max(dot(viewDir, reflectDir1), 0.0), 16.0);
          intensity += spec1 * hasMinerals * 0.15 * lightIntensity1;
        }
        
        if (lightIntensity2 > 0.0) {
          vec3 lightDir2 = normalize(lightPosition2 - vWorldPosition);
          vec3 reflectDir2 = reflect(-lightDir2, vWorldNormal);
          float spec2 = pow(max(dot(viewDir, reflectDir2), 0.0), 16.0);
          intensity += spec2 * hasMinerals * 0.15 * lightIntensity2;
        }
        
        if (lightIntensity3 > 0.0) {
          vec3 lightDir3 = normalize(lightPosition3 - vWorldPosition);
          vec3 reflectDir3 = reflect(-lightDir3, vWorldNormal);
          float spec3 = pow(max(dot(viewDir, reflectDir3), 0.0), 16.0);
          intensity += spec3 * hasMinerals * 0.15 * lightIntensity3;
        }
      }
      
      // Slight emissive for visibility on dark side
      float emissive = 0.1;
      
      vec3 finalColor = colorModulation * intensity * (lighting + emissive);
      
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `
  );
}

/**
 * Creates a complete ShaderMaterial for Rocky/Cratered planets
 * with realistic craters, color variation, geological features, and weathering effects
 */
export function createRockyPlanetMaterial(
  baseColor: number,
  planetSeed: number,
  orbitalDistance: number = 0.5,
  weatheringLevel: number = 0.5 // 0 = pristine, 1 = heavily weathered
): THREE.ShaderMaterial {
  const color = new THREE.Color(baseColor);

  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: color },
      lightPosition1: { value: new THREE.Vector3(0, 0, 0) }, // Primary star
      lightPosition2: { value: new THREE.Vector3(0, 0, 0) }, // Companion star 1
      lightPosition3: { value: new THREE.Vector3(0, 0, 0) }, // Companion star 2
      lightIntensity1: { value: 1.0 }, // Primary star intensity
      lightIntensity2: { value: 0.0 }, // Companion star 1 intensity (0 if no companion)
      lightIntensity3: { value: 0.0 }, // Companion star 2 intensity (0 if no companion)
      rotation: { value: 0 },
      planetSeed: { value: planetSeed },
      orbitalDistance: { value: orbitalDistance },
      weatheringLevel: { value: weatheringLevel },
    },
    vertexShader: buildVertexShader(),
    fragmentShader: buildFragmentShader(),
    side: THREE.FrontSide,
  });
}
