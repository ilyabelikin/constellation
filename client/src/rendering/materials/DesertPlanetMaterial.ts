import * as THREE from "three";

/**
 * Creates a complete ShaderMaterial for Desert planets
 * with varied sand colors, dunes, rocky areas, and occasional oases
 * Uses GPU shaders for fast rendering
 */
export function createDesertPlanetMaterial(
  baseColor: number,
  planetSeed: number,
  hasAtmosphere: boolean = false,
  orbitalDistance: number = 1.0,
  habitability: number = 0.0
): THREE.ShaderMaterial {
  const color = new THREE.Color(baseColor);

  // GLSL utility functions for procedural generation
  const glslUtils = `
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

    // Regular multi-octave noise (not absolute)
    float multiOctaveNoise3D(vec3 p, int octaves) {
      float value = 0.0;
      float amplitude = 0.5;
      float frequency = 1.0;
      
      for(int i = 0; i < 8; i++) {
        if(i >= octaves) break;
        value += amplitude * noise3D(p * frequency);
        frequency *= 2.0;
        amplitude *= 0.5;
      }
      
      return value;
    }

    // Generate seamless 3D craters using Voronoi-like cells
    float craters3D(vec3 pos, float scale, float craterId) {
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
              hash3D(neighbor + vec3(craterId, 0.0, 0.0)),
              hash3D(neighbor + vec3(0.0, craterId, 0.0)),
              hash3D(neighbor + vec3(0.0, 0.0, craterId))
            );
            
            // Calculate distance to crater center
            vec3 toCenter = (localPos - vec3(x, y, z)) - craterPos;
            float dist = length(toCenter);
            
            // Generate random size
            float craterSize = 0.2 + hash3D(neighbor + vec3(50.1, 60.2 + craterId, 70.3)) * 0.3;
            
            // Only create crater if random value is above threshold
            float shouldExist = hash3D(neighbor + vec3(100.0 + craterId, 200.0, 300.0));
            if(shouldExist > 0.65) {
              // Crater bowl with raised rim
              if(dist < craterSize) {
                float rimDist = abs(dist - craterSize * 0.85) / (craterSize * 0.15);
                float rimHeight = smoothstep(1.0, 0.0, rimDist) * 0.12;
                float bowlDepth = smoothstep(craterSize, 0.0, dist) * -0.2;
                craterEffect += bowlDepth + rimHeight;
              }
            }
          }
        }
      }
      
      return craterEffect;
    }
  `;

  const vertexShader = `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldNormal;
    varying vec3 vPosition;
    varying vec3 vWorldPosition;

    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
      vPosition = position;
      vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform vec3 baseColor;
    uniform vec3 lightPosition1;
    uniform vec3 lightPosition2;
    uniform vec3 lightPosition3;
    uniform float lightIntensity1;
    uniform float lightIntensity2;
    uniform float lightIntensity3;
    uniform float time;
    uniform float rotation;
    uniform float planetSeed;
    uniform float hasAtmosphere; // 1.0 if has atmosphere, 0.0 if airless
    uniform float orbitalDistance;
    uniform float habitability;
    uniform float population; // Dynamic population from colony data

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldNormal;
    varying vec3 vPosition;
    varying vec3 vWorldPosition;

    ${glslUtils}

    // Desert color palettes (8 different types)
    vec3 getPaletteColor(int paletteType, int colorType, float variation) {
      // colorType: 0=sand1, 1=sand2, 2=sand3, 3=sand4, 4=rock, 5=water
      
      vec3 color = vec3(1.0);
      
      // Classic Sahara - golden/yellow sands
      if (paletteType == 0) {
        if (colorType == 0) color = vec3(0.96, 0.86, 0.63);
        else if (colorType == 1) color = vec3(0.90, 0.78, 0.55);
        else if (colorType == 2) color = vec3(0.82, 0.67, 0.43);
        else if (colorType == 3) color = vec3(0.71, 0.55, 0.35);
        else if (colorType == 4) color = vec3(0.55, 0.43, 0.31);
        else color = vec3(0.31, 0.51, 0.59); // water
      }
      // Mars-like - red/orange sands
      else if (paletteType == 1) {
        if (colorType == 0) color = vec3(0.86, 0.59, 0.39);
        else if (colorType == 1) color = vec3(0.78, 0.47, 0.31);
        else if (colorType == 2) color = vec3(0.71, 0.39, 0.27);
        else if (colorType == 3) color = vec3(0.63, 0.31, 0.24);
        else if (colorType == 4) color = vec3(0.47, 0.24, 0.20);
        else color = vec3(0.39, 0.55, 0.55); // water
      }
      // White desert - light cream/white sands
      else if (paletteType == 2) {
        if (colorType == 0) color = vec3(0.98, 0.96, 0.90);
        else if (colorType == 1) color = vec3(0.94, 0.90, 0.82);
        else if (colorType == 2) color = vec3(0.86, 0.82, 0.75);
        else if (colorType == 3) color = vec3(0.78, 0.73, 0.65);
        else if (colorType == 4) color = vec3(0.63, 0.59, 0.55);
        else color = vec3(0.35, 0.55, 0.63); // water
      }
      // Namib - orange/red mixed sands
      else if (paletteType == 3) {
        if (colorType == 0) color = vec3(0.94, 0.71, 0.47);
        else if (colorType == 1) color = vec3(0.86, 0.59, 0.35);
        else if (colorType == 2) color = vec3(0.78, 0.43, 0.27);
        else if (colorType == 3) color = vec3(0.67, 0.35, 0.24);
        else if (colorType == 4) color = vec3(0.51, 0.27, 0.20);
        else color = vec3(0.27, 0.47, 0.55); // water
      }
      // Rainbow - multi-colored varied sands
      else if (paletteType == 4) {
        if (colorType == 0) color = vec3(0.94, 0.78, 0.55);
        else if (colorType == 1) color = vec3(0.86, 0.63, 0.47);
        else if (colorType == 2) color = vec3(0.75, 0.51, 0.39);
        else if (colorType == 3) color = vec3(0.63, 0.39, 0.31);
        else if (colorType == 4) color = vec3(0.47, 0.31, 0.27);
        else color = vec3(0.39, 0.59, 0.63); // water
      }
      // Rose - pink/rose tinted sands
      else if (paletteType == 5) {
        if (colorType == 0) color = vec3(0.96, 0.82, 0.78);
        else if (colorType == 1) color = vec3(0.90, 0.71, 0.67);
        else if (colorType == 2) color = vec3(0.82, 0.59, 0.55);
        else if (colorType == 3) color = vec3(0.71, 0.47, 0.43);
        else if (colorType == 4) color = vec3(0.55, 0.35, 0.33);
        else color = vec3(0.43, 0.55, 0.59); // water
      }
      // Dark - brown/dark sands
      else if (paletteType == 6) {
        if (colorType == 0) color = vec3(0.71, 0.59, 0.47);
        else if (colorType == 1) color = vec3(0.63, 0.51, 0.39);
        else if (colorType == 2) color = vec3(0.55, 0.43, 0.33);
        else if (colorType == 3) color = vec3(0.47, 0.35, 0.27);
        else if (colorType == 4) color = vec3(0.35, 0.27, 0.24);
        else color = vec3(0.24, 0.39, 0.47); // water
      }
      // Alien - purple-tinted desert
      else {
        if (colorType == 0) color = vec3(0.86, 0.75, 0.82);
        else if (colorType == 1) color = vec3(0.78, 0.63, 0.71);
        else if (colorType == 2) color = vec3(0.71, 0.51, 0.59);
        else if (colorType == 3) color = vec3(0.59, 0.39, 0.47);
        else if (colorType == 4) color = vec3(0.43, 0.31, 0.37);
        else color = vec3(0.47, 0.39, 0.55); // water
      }
      
      // Apply variation (±15%)
      return color * (0.85 + variation * 0.3);
    }

    void main() {
      vec3 colorModulation = vec3(1.0);
      float intensity = 1.0;
      
      // Extract u, v
      float u = vUv.x;
      float v = vUv.y;

      // Generate seed-based variety parameters for this planet
      float paletteTypeSeed = seededRandom(planetSeed * 1.1);
      float colorVariationSeed = seededRandom(planetSeed * 1.3);
      float terrainScaleSeed = seededRandom(planetSeed * 1.5);
      float duneScaleSeed = seededRandom(planetSeed * 1.7);
      float waterLevelSeed = seededRandom(planetSeed * 1.9);
      float colorMixingSeed = seededRandom(planetSeed * 2.1);
      
      // Select palette type (0-7)
      int paletteType = int(paletteTypeSeed * 8.0);
      if (paletteType > 7) paletteType = 7;
      
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
      
      // Terrain scale (larger features)
      float terrainScale = 1.5 + terrainScaleSeed * 2.5; // 1.5-4.0
      
      // Dune scale (smaller features)
      float duneScale = 6.0 + duneScaleSeed * 8.0; // 6.0-14.0
      
      // Generate base elevation
      float elevation = turbulence3D(samplePos * terrainScale, 5);
      
      // Desert planets: very little water (5-25%)
      // Lower threshold = less area above it = less water
      float waterLevel = 0.15 + waterLevelSeed * 0.10; // 0.15-0.25 range
      bool isWater = elevation < waterLevel;
      
      // Check for ice caps (only for planets with atmosphere)
      float distanceFromPole = abs(vUv.y - 0.5) * 2.0; // 0 at poles, 1 at equator
      bool isIceCap = false;
      
      if (hasAtmosphere > 0.5) {
        // Ice cap size varies with orbital distance
        float temperatureFactor = clamp(orbitalDistance, 0.0, 2.0);
        float minIceThreshold, maxIceThreshold;
        
        if (temperatureFactor < 0.5) {
          // Hot desert - minimal ice caps
          minIceThreshold = 0.92;
          maxIceThreshold = 0.96;
        } else if (temperatureFactor < 1.0) {
          // Temperate desert - small ice caps
          minIceThreshold = 0.80;
          maxIceThreshold = 0.90;
        } else if (temperatureFactor < 1.5) {
          // Cool desert - moderate ice caps
          minIceThreshold = 0.50;
          maxIceThreshold = 0.75;
        } else {
          // Cold desert - large ice caps
          minIceThreshold = 0.25;
          maxIceThreshold = 0.50;
        }
        
        // Generate seed-based variety
        float iceCapSizeSeed = seededRandom(planetSeed * 1.9);
        float baseIceThreshold = minIceThreshold + iceCapSizeSeed * (maxIceThreshold - minIceThreshold);
        
        // Add noise to ice cap boundary for irregular shape
        float iceNoise = turbulence3D(samplePos * 0.8, 4) * 0.12;
        float iceThreshold = baseIceThreshold - iceNoise;
        
        isIceCap = distanceFromPole > iceThreshold;
      }
      
      if (isIceCap) {
        // DESERT ICE CAPS - beige/tan tinted ice, appropriate for desert planets
        // Get the palette type to match ice with sand colors
        int paletteType = int(paletteTypeSeed * 8.0);
        if (paletteType > 7) paletteType = 7;
        
        // Calculate distance from pole center for layering
        float polarDistance = distanceFromPole;
        float iceNoise = turbulence3D(samplePos * 0.8, 4) * 0.12;
        float iceThreshold = 0.85 - iceNoise; // Recompute for layering
        
        // Inner core ice (closest to pole) - light beige, more pure
        float innerIceThreshold = iceThreshold + 0.05;
        bool isInnerIce = polarDistance > innerIceThreshold;
        
        if (isInnerIce) {
          // Core: Light beige-white (desert-appropriate ice)
          // Slightly tinted based on palette
          vec3 baseIce = vec3(0.95, 0.93, 0.88); // Warm white
          
          // Add subtle tint from palette
          if (paletteType == 0) baseIce *= vec3(1.0, 0.98, 0.92); // Golden tint
          else if (paletteType == 1) baseIce *= vec3(1.0, 0.92, 0.88); // Mars red tint
          else if (paletteType == 2) baseIce *= vec3(1.0, 1.0, 0.98); // Pure white
          else if (paletteType == 3) baseIce *= vec3(1.0, 0.95, 0.90); // Namib orange tint
          else if (paletteType == 5) baseIce *= vec3(1.0, 0.96, 0.96); // Rose tint
          else if (paletteType == 7) baseIce *= vec3(0.98, 0.94, 0.98); // Purple tint
          
          colorModulation = baseIce;
          intensity = 1.1;
        } else {
          // Outer ice: More tan/beige, transitioning to sand
          vec3 outerIce = vec3(0.88, 0.85, 0.78);
          
          // Stronger tint from palette for outer ice
          if (paletteType == 0) outerIce *= vec3(1.0, 0.96, 0.85); // Golden
          else if (paletteType == 1) outerIce *= vec3(1.0, 0.88, 0.80); // Mars red
          else if (paletteType == 2) outerIce *= vec3(1.0, 0.98, 0.92); // White desert
          else if (paletteType == 3) outerIce *= vec3(1.0, 0.90, 0.82); // Namib orange
          else if (paletteType == 5) outerIce *= vec3(1.0, 0.90, 0.88); // Rose
          else if (paletteType == 6) outerIce *= vec3(0.90, 0.82, 0.75); // Dark brown
          else if (paletteType == 7) outerIce *= vec3(0.95, 0.88, 0.90); // Purple
          
          colorModulation = outerIce;
          intensity = 0.95;
        }
        
        // Add gentle texture variation to ice
        float iceTexture = turbulence3D(samplePos * 2.0, 3);
        intensity -= smoothstep(0.45, 0.55, iceTexture) * 0.06;
      }
      else if (isWater) {
        // WATER - small oases or dry lakes
        vec3 waterColor = getPaletteColor(paletteType, 5, colorVariationSeed);
        
        // Depth-based shading
        float depth = (waterLevel - elevation) / waterLevel;
        float depthFactor = 1.0 - depth * 0.5;
        
        // Add slight pattern to water
        float waterPattern = noise3D(samplePos * duneScale * 0.5);
        depthFactor *= (0.9 + waterPattern * 0.2);
        
        colorModulation = waterColor * depthFactor;
        intensity = 0.9;
      } else {
        // LAND - sandy terrain with dunes
        float heightAboveSea = (elevation - waterLevel) / (1.0 - waterLevel);
        
        // Generate dune patterns at multiple scales
        float dunePattern = multiOctaveNoise3D(samplePos * duneScale, 4);
        float finePattern = multiOctaveNoise3D(samplePos * duneScale * 2.0, 3);
        float microPattern = noise3D(samplePos * duneScale * 4.0);
        
        // Color mixing intensity
        float colorMixing = 0.4 + colorMixingSeed * 0.4; // 0.4-0.8
        
        // Choose sand colors based on elevation and patterns
        vec3 sand1 = getPaletteColor(paletteType, 0, colorVariationSeed);
        vec3 sand2 = getPaletteColor(paletteType, 1, colorVariationSeed);
        vec3 sand3 = getPaletteColor(paletteType, 2, colorVariationSeed);
        vec3 sand4 = getPaletteColor(paletteType, 3, colorVariationSeed);
        vec3 rock = getPaletteColor(paletteType, 4, colorVariationSeed);
        
        vec3 sandColor;
        
        if (heightAboveSea < 0.25) {
          // Low dunes - mix sand1 and sand2
          float mix1 = dunePattern * colorMixing + (1.0 - colorMixing) * 0.5;
          sandColor = mix(sand2, sand1, mix1);
        } else if (heightAboveSea < 0.5) {
          // Medium dunes - mix sand2 and sand3
          float mix2 = (dunePattern * 0.6 + finePattern * 0.4) * colorMixing + (1.0 - colorMixing) * 0.5;
          sandColor = mix(sand3, sand2, mix2);
        } else if (heightAboveSea < 0.75) {
          // High dunes - mix sand3 and sand4
          float mix3 = dunePattern * colorMixing + (1.0 - colorMixing) * 0.5;
          sandColor = mix(sand4, sand3, mix3);
        } else {
          // Rocky peaks - mix sand4 and rock
          float mix4 = (dunePattern * 0.5 + finePattern * 0.5) * colorMixing + (1.0 - colorMixing) * 0.3;
          sandColor = mix(rock, sand4, mix4);
        }
        
        // Add fine detail variation
        float detailFactor = 0.90 + microPattern * 0.20;
        sandColor *= detailFactor;
        
        // Add more varied speckling for texture using multiple scales
        float speckle1 = noise3D(samplePos * duneScale * 8.0);
        float speckle2 = noise3D(samplePos * duneScale * 16.0);
        float speckle3 = noise3D(samplePos * duneScale * 32.0);
        
        // Combine speckle patterns for more variation
        float combinedSpeckle = speckle1 * 0.5 + speckle2 * 0.3 + speckle3 * 0.2;
        
        // Create clustered dark spots (rare, varied intensity)
        if (speckle1 > 0.88 && speckle2 > 0.6) {
          float darkIntensity = 0.6 + speckle3 * 0.3; // 0.6-0.9 range
          sandColor *= darkIntensity;
        }
        // Create scattered medium-dark spots
        else if (combinedSpeckle > 0.85) {
          float darkVariation = 0.75 + speckle2 * 0.15; // 0.75-0.9 range
          sandColor *= darkVariation;
        }
        // Create clustered bright spots (rare, varied intensity)
        else if (speckle1 < 0.12 && speckle2 < 0.4) {
          float brightIntensity = 1.15 + speckle3 * 0.25; // 1.15-1.4 range
          sandColor *= brightIntensity;
        }
        // Create scattered medium-bright spots
        else if (combinedSpeckle < 0.15) {
          float brightVariation = 1.05 + speckle2 * 0.15; // 1.05-1.2 range
          sandColor *= brightVariation;
        }
        
        colorModulation = sandColor;
        intensity = 0.95 + elevation * 0.05;
        
        // Add craters for airless desert planets
        if (hasAtmosphere < 0.5) {
          // Generate craters at multiple scales
          float largeCraters = craters3D(samplePos, 3.0, planetSeed);
          float mediumCraters = craters3D(samplePos, 6.0, planetSeed + 1000.0);
          float smallCraters = craters3D(samplePos, 12.0, planetSeed + 2000.0);
          
          float totalCraters = largeCraters + mediumCraters * 0.7 + smallCraters * 0.5;
          
          // Apply crater shading
          intensity += totalCraters * 0.6;
          
          // Darken inside craters slightly
          if (totalCraters < -0.1) {
            colorModulation *= (0.85 + totalCraters * 0.5);
          }
        }
      }
      
      // Lighting from all light sources
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
      
      totalDiffuse = clamp(totalDiffuse, 0.0, 1.0);
      float lighting = totalDiffuse * 0.75 + 0.35; // Higher ambient for desert visibility
      
      // Slight specular for water surfaces
      vec3 specular = vec3(0.0);
      if (isWater) {
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        
        if (lightIntensity1 > 0.0) {
          vec3 lightDir1 = normalize(lightPosition1 - vWorldPosition);
          vec3 reflectDir1 = reflect(-lightDir1, vWorldNormal);
          float spec1 = pow(max(dot(viewDir, reflectDir1), 0.0), 16.0);
          specular += vec3(0.3, 0.4, 0.5) * spec1 * 0.3 * lightIntensity1;
        }
      }
      
      // DESERT CITY LIGHTS - Settlements in arid regions
      // Clustered around oases and rocky outcrops for shelter
      vec3 desertLights = vec3(0.0);
      
      if (population > 10000.0 && !isWater) {
        // Calculate brightness based on population (logarithmic scale)
        float logPop = log(population / 10000.0) / log(150000.0);
        float cityBrightness = clamp(logPop, 0.0, 1.0);
        
        // Only show on night side - check all light sources
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
          // Latitude factor - settlements prefer temperate zones
          float latitude = abs(vUv.y - 0.5) * 2.0;
          float latitudeFactor = 1.0 - smoothstep(0.0, 0.65, latitude);
          
          // Create seed-based offset for settlement distribution
          vec3 seedOffset = vec3(
            fract(planetSeed * 0.1031),
            fract(planetSeed * 0.1030),
            fract(planetSeed * 0.0973)
          ) * 100.0;
          
          // Settlements cluster near oases (water areas)
          // Use oasis noise pattern to influence city placement
          vec3 oasisCheckPos = samplePos * 3.5 + seedOffset * 0.4;
          float oasisProximity = turbulence3D(oasisCheckPos, 4);
          float nearOasis = smoothstep(0.45, 0.65, oasisProximity); // Favor areas near oases
          
          // Rocky outcrops provide shelter - settlements cluster there too
          vec3 rockCheckPos = samplePos * 4.5 + seedOffset * 0.7;
          float rockNoise = turbulence3D(rockCheckPos, 3);
          float rockProximity = smoothstep(0.6, 0.8, rockNoise);
          
          // Settlement zones - prefer oases and rocky shelter
          float settlementZone = max(nearOasis, rockProximity * 0.7);
          
          // Major settlements (cities)
          vec3 cityPos = samplePos * 4.5 + seedOffset * 0.6;
          float cityNoise = turbulence3D(cityPos, 3);
          float cityCluster = smoothstep(0.55, 0.75, cityNoise) * settlementZone;
          
          // Smaller outposts and villages
          vec3 outpostPos = samplePos * 9.0 + seedOffset * 0.9;
          float outpostNoise = turbulence3D(outpostPos, 4);
          float outposts = smoothstep(0.5, 0.7, outpostNoise) * settlementZone;
          
          // Combine: major cities + outposts, modulated by latitude
          float urbanization = (cityCluster * 0.9 + outposts * 0.3) * latitudeFactor;
          urbanization = clamp(urbanization, 0.0, 1.0);
          
          // Light placement - more sparse than terrestrial (harsh environment)
          vec3 lightPos1 = samplePos * 16.0 + seedOffset * 1.3;
          vec3 lightPos2 = samplePos * 21.0 + seedOffset * 1.6;
          
          float noise1 = turbulence3D(lightPos1, 3);
          float noise2 = turbulence3D(lightPos2, 3);
          
          float lightField = noise1 * 0.6 + noise2 * 0.4;
          lightField = clamp(lightField, 0.0, 1.0);
          
          // Lights appear where there's urbanization
          float baseDensity = cityBrightness * 0.22 * urbanization; // Sparser than terrestrial
          float threshold = 0.52 - baseDensity;
          float hasLight = smoothstep(threshold - 0.1, threshold + 0.1, lightField);
          
          float brightnessNoise = turbulence3D(samplePos * 24.0 + seedOffset * 2.2, 3);
          float brightness = brightnessNoise * brightnessNoise * hasLight;
          brightness *= (0.35 + cityCluster * 0.65); // Cities are brighter
          
          float lightIntensity = smoothstep(0.3, 0.7, lightField) * hasLight * brightness;
          
          // Warm desert city lights - amber/orange tones (desert nights are cold, lights are warm)
          vec3 lightColor = mix(
            vec3(1.0, 0.70, 0.40),  // Warm amber-orange (small settlements)
            vec3(1.0, 0.88, 0.72),  // Bright warm yellow-white (major cities)
            brightness
          );
          
          // Desert lights similar brightness to terrestrial
          desertLights = lightColor * lightIntensity * nightFactor * cityBrightness * 1.6;
        }
      }
      
      vec3 finalColor = colorModulation * intensity * lighting + specular + desertLights;
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: color },
      lightPosition1: { value: new THREE.Vector3(0, 0, 0) },
      lightPosition2: { value: new THREE.Vector3(0, 0, 0) },
      lightPosition3: { value: new THREE.Vector3(0, 0, 0) },
      lightIntensity1: { value: 1.0 },
      lightIntensity2: { value: 0.0 },
      lightIntensity3: { value: 0.0 },
      time: { value: 0.0 },
      rotation: { value: 0.0 },
      planetSeed: { value: planetSeed },
      hasAtmosphere: { value: hasAtmosphere ? 1.0 : 0.0 },
      orbitalDistance: { value: orbitalDistance },
      habitability: { value: habitability },
      population: { value: 0.0 }, // Dynamic population from colony data
    },
    vertexShader,
    fragmentShader,
    lights: false,
  });
}

/**
 * Regenerate desert planet with a new seed (for debug mode)
 * For shader materials, we just update the uniform
 */
export function regenerateDesertPlanetTexture(
  material: THREE.ShaderMaterial,
  newSeed: number
): void {
  if (material.uniforms.planetSeed) {
    material.uniforms.planetSeed.value = newSeed;
    material.needsUpdate = true;
  }
}
