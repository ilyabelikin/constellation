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
            
            // Smooth falloff at crater edge to reduce artifacts
            float edgeFalloff = smoothstep(0.95, 1.0, normalizedDist);
            
            // Bowl depth - deeper in center with smooth transition
            float bowlDepth = -0.3 * (1.0 - normalizedDist * normalizedDist);
            
            // Rim height - raised edge with smoothed transitions
            float rimStart = 0.75;
            float rimEnd = 0.95;
            float rimHeight = 0.0;
            if(normalizedDist > rimStart && normalizedDist < rimEnd) {
              float rimPos = (normalizedDist - rimStart) / (rimEnd - rimStart);
              // Use smoothstep for smoother rim transitions
              rimHeight = 0.18 * sin(rimPos * 3.14159) * (1.0 - smoothstep(0.85, 1.0, rimPos));
            }
            
            // Central peak for large craters with smooth transitions
            float centralPeak = 0.0;
            if(normalizedDist < 0.15 && craterSize > 0.4) {
              float peakFalloff = smoothstep(0.15, 0.12, normalizedDist);
              centralPeak = 0.08 * peakFalloff;
            }
            
            // Apply edge falloff to reduce boundary artifacts
            craterEffect += (bowlDepth + rimHeight + centralPeak) * (1.0 - edgeFalloff);
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
      
      // Apply displacement along normal direction with reduced intensity
      float displacementAmount = totalDisplacement * 0.05;
      displacedPosition = position + normal * displacementAmount;
      
      // Use the original normal without perturbation to eliminate vibration artifacts
      // The fragment shader will handle all the visual detail
      displacedNormal = normal;
      
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
    uniform float population; // Dynamic population from colony data
    
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
      
      // ROCKY WORLD CITY LIGHTS - Underground cavern settlements
      // Built in natural cave systems and crater bottoms for protection
      vec3 rockyLights = vec3(0.0);
      
      if (population > 10000.0) {
        // Calculate brightness based on population (logarithmic scale)
        float logPop = log(population / 10000.0) / log(150000.0);
        float cityBrightness = clamp(logPop, 0.0, 1.0);
        
        // Only show on night side
        vec3 lightDir1 = normalize(lightPosition1 - vWorldPosition);
        vec3 lightDir2 = normalize(lightPosition2 - vWorldPosition);
        vec3 lightDir3 = normalize(lightPosition3 - vWorldPosition);
        
        float lit1 = max(dot(vWorldNormal, lightDir1), 0.0) * lightIntensity1;
        float lit2 = max(dot(vWorldNormal, lightDir2), 0.0) * lightIntensity2;
        float lit3 = max(dot(vWorldNormal, lightDir3), 0.0) * lightIntensity3;
        float totalLit = clamp(lit1 + lit2 + lit3, 0.0, 1.0);
        
        float nightSide = 1.0 - totalLit;
        float nightFactor = smoothstep(0.2, 0.8, nightSide);
        
        if (nightFactor > 0.1) {
          // Prefer temperate latitudes
          float latitude = abs(vUv.y - 0.5) * 2.0;
          float latitudeFactor = 1.0 - smoothstep(0.0, 0.6, latitude);
          
          vec3 seedOffset = vec3(
            fract(planetSeed * 0.1031),
            fract(planetSeed * 0.1030),
            fract(planetSeed * 0.0973)
          ) * 100.0;
          
          // Settlements in crater bottoms (sheltered)
          // Use crater locations from earlier calculations
          float craterScaleMultiplier = 1.5 + seededRandom(planetSeed * 1.5) * 3.0;
          float settlementCraters = craters3D(samplePos, 0.8 * craterScaleMultiplier);
          float inCrater = smoothstep(-0.1, -0.05, settlementCraters); // Prefer crater bowls
          
          // Underground cavern cities
          vec3 cavernPos = samplePos * 6.0 + seedOffset * 0.8;
          float cavernNoise = turbulence3D(cavernPos, 4);
          float cavernSystem = smoothstep(0.55, 0.75, cavernNoise);
          
          // Mining outposts near mineral-rich areas
          vec3 minePos = samplePos * 9.0 + seedOffset * 1.0;
          float mineNoise = turbulence3D(minePos, 3);
          float miningZones = smoothstep(0.5, 0.7, mineNoise);
          
          // Combine: crater settlements + cavern cities + mining outposts
          float urbanization = (inCrater * 0.6 + cavernSystem * 0.9 + miningZones * 0.3) * latitudeFactor;
          urbanization = clamp(urbanization, 0.0, 1.0);
          
          // Sparse lights (harsh airless environment)
          vec3 lightPos1 = samplePos * 17.0 + seedOffset * 1.3;
          vec3 lightPos2 = samplePos * 22.0 + seedOffset * 1.7;
          
          float noise1 = turbulence3D(lightPos1, 3);
          float noise2 = turbulence3D(lightPos2, 3);
          
          float lightField = noise1 * 0.6 + noise2 * 0.4;
          lightField = clamp(lightField, 0.0, 1.0);
          
          float baseDensity = cityBrightness * 0.2 * urbanization; // Sparse
          float threshold = 0.55 - baseDensity;
          float hasLight = smoothstep(threshold - 0.1, threshold + 0.1, lightField);
          
          float brightnessNoise = turbulence3D(samplePos * 25.0 + seedOffset * 2.1, 3);
          float brightness = brightnessNoise * brightnessNoise * hasLight;
          brightness *= (0.35 + cavernSystem * 0.65);
          
          float lightIntensity = smoothstep(0.3, 0.7, lightField) * hasLight * brightness;
          
          // Industrial orange-yellow lights (mining/industrial colonies)
          vec3 lightColor = mix(
            vec3(1.0, 0.65, 0.35),  // Industrial orange (mining outposts)
            vec3(1.0, 0.85, 0.65),  // Warm yellow-orange (cavern cities)
            brightness
          );
          
          // Similar brightness to other colony types
          rockyLights = lightColor * lightIntensity * nightFactor * cityBrightness * 1.5;
        }
      }
      
      vec3 finalColor = colorModulation * intensity * (lighting + emissive) + rockyLights;
      
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
      population: { value: 0.0 }, // Dynamic population from colony data
    },
    vertexShader: buildVertexShader(),
    fragmentShader: buildFragmentShader(),
    side: THREE.FrontSide,
  });
}
