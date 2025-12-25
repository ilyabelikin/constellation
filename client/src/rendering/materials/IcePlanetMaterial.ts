import * as THREE from "three";

/**
 * Creates a 3D shader material for ice planets with procedural surface features
 * Inspired by Europa, Pluto, Enceladus, and Triton
 * 
 * Features:
 * - Smooth, bright icy surface (water, methane, nitrogen ice)
 * - Crack networks and fissures (like Europa's reddish-tan streaks)
 * - Few craters (geologically young surfaces)
 * - Polar caps with different ice composition
 * - Rugged terrain and smooth plains
 * - High reflectivity (specular highlights)
 */
export function createIcePlanetMaterial(
  baseColor: number,
  planetSeed: number
): THREE.ShaderMaterial {
  
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

    // Voronoi-like crack generation using cell-based approach
    float cracks3D(vec3 pos, float scale, float crackSeed) {
      vec3 scaledPos = pos * scale;
      vec3 grid = floor(scaledPos);
      vec3 localPos = fract(scaledPos);
      
      float minDist = 1.0;
      vec3 closestPoint = vec3(0.0);
      
      // Find closest point in neighboring cells
      for(float z = -1.0; z <= 1.0; z++) {
        for(float y = -1.0; y <= 1.0; y++) {
          for(float x = -1.0; x <= 1.0; x++) {
            vec3 neighbor = grid + vec3(x, y, z);
            
            // Generate random point in cell
            vec3 point = vec3(
              hash3D(neighbor + vec3(crackSeed, 0.0, 0.0)),
              hash3D(neighbor + vec3(0.0, crackSeed, 0.0)),
              hash3D(neighbor + vec3(0.0, 0.0, crackSeed))
            );
            
            vec3 diff = (localPos - vec3(x, y, z)) - point;
            float dist = length(diff);
            
            if(dist < minDist) {
              minDist = dist;
              closestPoint = point;
            }
          }
        }
      }
      
      return minDist;
    }

    // Sparse crater generation (few craters for young surfaces)
    float sparseCraters3D(vec3 pos, float scale, float craterId) {
      vec3 scaledPos = pos * scale;
      vec3 grid = floor(scaledPos);
      vec3 localPos = fract(scaledPos);
      
      float craterEffect = 0.0;
      
      // Check neighboring cells
      for(float z = -1.0; z <= 1.0; z++) {
        for(float y = -1.0; y <= 1.0; y++) {
          for(float x = -1.0; x <= 1.0; x++) {
            vec3 neighbor = grid + vec3(x, y, z);
            
            // Generate random position for crater
            vec3 craterPos = vec3(
              hash3D(neighbor + vec3(craterId, 0.0, 0.0)),
              hash3D(neighbor + vec3(0.0, craterId, 0.0)),
              hash3D(neighbor + vec3(0.0, 0.0, craterId))
            );
            
            vec3 toCenter = (localPos - vec3(x, y, z)) - craterPos;
            float dist = length(toCenter);
            
            // Random size
            float craterSize = 0.15 + hash3D(neighbor + vec3(50.1 + craterId, 60.2, 70.3)) * 0.2;
            
            // Very few craters (85% threshold for young surface)
            float shouldExist = hash3D(neighbor + vec3(100.0 + craterId, 200.0, 300.0));
            if(shouldExist > 0.85) {
              if(dist < craterSize) {
                float rimDist = abs(dist - craterSize * 0.85) / (craterSize * 0.15);
                float rimHeight = smoothstep(1.0, 0.0, rimDist) * 0.08;
                float bowlDepth = smoothstep(craterSize, 0.0, dist) * -0.15;
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
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      vPosition = position;
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
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
    uniform float planetSeed;
    uniform float rotation;
    uniform float population; // Dynamic population from colony data
    
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldNormal;
    varying vec3 vPosition;
    varying vec3 vWorldPosition;

    ${glslUtils}

    void main() {
      vec3 colorModulation = vec3(1.0);
      float intensity = 1.0;
      
      // Apply rotation to the sampling position
      vec3 rotatedPos = vPosition;
      float cosRot = cos(rotation);
      float sinRot = sin(rotation);
      rotatedPos = vec3(
        vPosition.x * cosRot - vPosition.z * sinRot,
        vPosition.y,
        vPosition.x * sinRot + vPosition.z * cosRot
      );
      
      // Generate seed-based variety parameters
      float iceTypeSeed = seededRandom(planetSeed * 1.1);
      float crackDensitySeed = seededRandom(planetSeed * 1.3);
      float terrainRoughnessSeed = seededRandom(planetSeed * 1.5);
      float polarCapSizeSeed = seededRandom(planetSeed * 1.7);
      float organicTintSeed = seededRandom(planetSeed * 1.9);
      
      // Use rotated 3D position for seamless noise
      vec3 samplePos = normalize(rotatedPos);
      
      // Determine ice composition and base color
      vec3 baseIceColor;
      
      if (iceTypeSeed < 0.25) {
        // Pure water ice (Europa-like) - bright white/pale blue
        baseIceColor = vec3(0.95, 0.97, 1.0);
      } else if (iceTypeSeed < 0.5) {
        // Nitrogen ice (Triton/Pluto-like) - very bright white
        baseIceColor = vec3(0.98, 0.98, 0.98);
      } else if (iceTypeSeed < 0.75) {
        // Methane ice (Pluto-like) - pale blue-cyan
        baseIceColor = vec3(0.92, 0.95, 0.98);
      } else {
        // Mixed/dirty ice - slightly gray-white
        baseIceColor = vec3(0.90, 0.92, 0.93);
      }
      
      // Check if we're at the poles for distinct polar caps
      float distanceFromPole = abs(vUv.y - 0.5) * 2.0; // 0 at poles, 1 at equator
      
      // Polar cap size varies per planet
      float polarCapThreshold = 0.75 + polarCapSizeSeed * 0.15; // 0.75-0.90
      
      // Add noise to polar boundary for irregular shape
      float polarNoise = turbulence3D(samplePos * 0.6, 3) * 0.1;
      bool isPolarCap = distanceFromPole > (polarCapThreshold - polarNoise);
      
      if (isPolarCap) {
        // POLAR CAPS - THREE LAYERS with ice rocks at edge
        // Calculate distance from pole center for layering
        float polarDistance = distanceFromPole;
        
        // Layer thresholds
        float innerThreshold = polarCapThreshold - polarNoise + 0.08;
        float middleThreshold = polarCapThreshold - polarNoise + 0.04;
        float outerThreshold = polarCapThreshold - polarNoise;
        
        bool isInnerCap = polarDistance > innerThreshold;
        bool isMiddleCap = polarDistance > middleThreshold && !isInnerCap;
        bool isOuterCap = !isInnerCap && !isMiddleCap;
        
        if (isInnerCap) {
          // LAYER 1: Pure bright ice (core)
          if (iceTypeSeed < 0.5) {
            // Bright nitrogen ice (Triton-style)
            baseIceColor = vec3(0.99, 0.99, 0.98);
          } else {
            // Pinkish methane ice (Pluto-style)
            baseIceColor = vec3(0.97, 0.95, 0.94);
          }
          
          // Very smooth, pristine surface
          float capTexture = turbulence3D(samplePos * 1.5, 2);
          intensity = 1.08 + capTexture * 0.03;
          colorModulation = baseIceColor;
          
        } else if (isMiddleCap) {
          // LAYER 2: Slightly darker, more textured
          if (iceTypeSeed < 0.5) {
            baseIceColor = vec3(0.96, 0.97, 0.98);
          } else {
            baseIceColor = vec3(0.94, 0.92, 0.91);
          }
          
          // More surface detail
          float capTexture = turbulence3D(samplePos * 2.5, 3);
          intensity = 1.03 + capTexture * 0.05;
          
          // Add some subtle cracks in middle layer
          float midCracks = cracks3D(samplePos, 8.0, planetSeed + 500.0);
          float crackPattern = smoothstep(0.05, 0.08, midCracks);
          
          vec3 crackTint = vec3(0.85, 0.87, 0.88);
          colorModulation = mix(crackTint, baseIceColor, crackPattern);
          
        } else {
          // LAYER 3: Outer edge with ice rocks and boulders
          if (iceTypeSeed < 0.5) {
            baseIceColor = vec3(0.92, 0.93, 0.95);
          } else {
            baseIceColor = vec3(0.90, 0.88, 0.87);
          }
          
          // More weathered surface
          float capTexture = turbulence3D(samplePos * 3.0, 4);
          intensity = 0.98 + capTexture * 0.08;
          
          // ICE ROCKS AND BOULDERS at the edge
          // Use multi-scale noise to create clustered rocks
          float rockNoise1 = turbulence3D(samplePos * 12.0, 4);
          float rockNoise2 = turbulence3D(samplePos * 18.0, 3);
          float rockNoise3 = noise3D(samplePos * 25.0);
          
          // Large ice boulders (sparse)
          float largeBoulders = smoothstep(0.65, 0.75, rockNoise1);
          
          // Medium ice rocks (more common)
          float mediumRocks = smoothstep(0.55, 0.65, rockNoise2) * 0.7;
          
          // Small ice chunks (scattered)
          float smallChunks = smoothstep(0.5, 0.6, rockNoise3) * 0.4;
          
          // Combine rock patterns
          float iceRocks = largeBoulders + mediumRocks + smallChunks;
          iceRocks = clamp(iceRocks, 0.0, 1.0);
          
          // Ice rocks are slightly brighter and have more contrast
          vec3 rockColor = baseIceColor * 1.1;
          colorModulation = mix(baseIceColor * 0.9, rockColor, iceRocks);
          
          // Add height variation to rocks
          intensity += iceRocks * 0.12;
          
          // Add some cracks between rocks
          float edgeCracks = cracks3D(samplePos, 10.0, planetSeed + 600.0);
          float edgeCrackPattern = 1.0 - smoothstep(0.03, 0.06, edgeCracks);
          
          // Darken cracks
          colorModulation *= (0.92 + edgeCrackPattern * 0.08);
        }
        
      } else {
        // MAIN SURFACE
        
        // Smooth plains base with subtle height variation
        float baseElevation = turbulence3D(samplePos * 1.5, 4) * 0.3;
        
        // Generate rugged terrain in some regions
        float terrainRoughness = terrainRoughnessSeed * 1.5; // 0.0-1.5
        float ruggedTerrain = turbulence3D(samplePos * 2.5, 5);
        
        // Blend smooth and rugged based on noise
        float terrainMix = smoothstep(0.4, 0.6, ruggedTerrain);
        float elevation = mix(baseElevation * 0.5, ruggedTerrain * terrainRoughness, terrainMix);
        
        intensity += elevation * 0.1;
        
        // CRACKS AND FISSURES (Europa-style)
        // Multiple scales of cracks
        float crackScale = 3.0 + crackDensitySeed * 4.0; // 3.0-7.0
        
        float crack1 = cracks3D(samplePos, crackScale * 0.5, planetSeed);
        float crack2 = cracks3D(samplePos, crackScale * 1.0, planetSeed + 100.0);
        float crack3 = cracks3D(samplePos, crackScale * 2.0, planetSeed + 200.0);
        
        // Combine cracks with different thresholds
        float largeCracks = smoothstep(0.08, 0.12, crack1);
        float mediumCracks = smoothstep(0.06, 0.10, crack2) * 0.7;
        float fineCracks = smoothstep(0.04, 0.08, crack3) * 0.4;
        
        float totalCracks = 1.0 - clamp(largeCracks + mediumCracks + fineCracks, 0.0, 1.0);
        
        // Cracks are darker and have reddish-tan color (from subsurface material)
        vec3 crackColor;
        if (organicTintSeed > 0.6) {
          // Reddish-brown (Pluto-style organic tholins)
          crackColor = vec3(0.45, 0.35, 0.30);
        } else if (organicTintSeed > 0.3) {
          // Tan-brown (Europa-style)
          crackColor = vec3(0.50, 0.42, 0.35);
        } else {
          // Dark blue-black (deep crevasses)
          crackColor = vec3(0.15, 0.20, 0.25);
        }
        
        // Mix crack color with base ice
        colorModulation = mix(crackColor, baseIceColor, totalCracks);
        
        // Cracks are slightly darker
        intensity *= (0.85 + totalCracks * 0.15);
        
        // Add streak patterns (Europa-style lineae)
        float streakNoise = noise3D(samplePos * 6.0);
        float streakPattern = abs(sin(samplePos.x * 20.0 + streakNoise * 5.0));
        float streaks = smoothstep(0.9, 0.95, streakPattern);
        
        // Streaks are subtle reddish-tan bands
        vec3 streakColor = vec3(0.55, 0.45, 0.38);
        colorModulation = mix(colorModulation, streakColor, streaks * 0.15);
        
        // SPARSE CRATERS (geologically young surface)
        float craterEffect = sparseCraters3D(samplePos, 4.0, planetSeed);
        intensity += craterEffect * 0.3;
        
        // Darken crater interiors
        if (craterEffect < -0.05) {
          colorModulation *= 0.85;
        }
        
        // Add subtle surface frost variation
        float frostPattern = turbulence3D(samplePos * 8.0, 3);
        float frostVariation = 0.95 + frostPattern * 0.1;
        colorModulation *= frostVariation;
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
      
      totalDiffuse = clamp(totalDiffuse, 0.0, 1.0);
      
      // Ice has higher ambient light due to high albedo, but keep some contrast
      float ambient = 0.2;
      float lighting = ambient + totalDiffuse * (1.0 - ambient);
      
      // SPECULAR HIGHLIGHTS - ice is very reflective
      vec3 specular = vec3(0.0);
      vec3 viewDir = normalize(cameraPosition - vWorldPosition);
      
      // Calculate specular from each light source
      if (lightIntensity1 > 0.0) {
        vec3 lightDir1 = normalize(lightPosition1 - vWorldPosition);
        vec3 halfVector1 = normalize(lightDir1 + viewDir);
        float specAngle1 = max(dot(vWorldNormal, halfVector1), 0.0);
        float spec1 = pow(specAngle1, 128.0); // Very sharp highlights
        
        // Fresnel effect (more reflective at grazing angles)
        float viewAngle = max(dot(vWorldNormal, viewDir), 0.0);
        float fresnel = pow(1.0 - viewAngle, 4.0);
        
        spec1 *= (0.3 + fresnel * 0.7);
        float sunlit1 = max(dot(vWorldNormal, lightDir1), 0.0);
        specular += vec3(1.0) * spec1 * sunlit1 * lightIntensity1 * 0.6;
      }
      
      if (lightIntensity2 > 0.0) {
        vec3 lightDir2 = normalize(lightPosition2 - vWorldPosition);
        vec3 halfVector2 = normalize(lightDir2 + viewDir);
        float specAngle2 = max(dot(vWorldNormal, halfVector2), 0.0);
        float spec2 = pow(specAngle2, 128.0);
        
        float viewAngle = max(dot(vWorldNormal, viewDir), 0.0);
        float fresnel = pow(1.0 - viewAngle, 4.0);
        
        spec2 *= (0.3 + fresnel * 0.7);
        float sunlit2 = max(dot(vWorldNormal, lightDir2), 0.0);
        specular += vec3(1.0) * spec2 * sunlit2 * lightIntensity2 * 0.6;
      }
      
      if (lightIntensity3 > 0.0) {
        vec3 lightDir3 = normalize(lightPosition3 - vWorldPosition);
        vec3 halfVector3 = normalize(lightDir3 + viewDir);
        float specAngle3 = max(dot(vWorldNormal, halfVector3), 0.0);
        float spec3 = pow(specAngle3, 128.0);
        
        float viewAngle = max(dot(vWorldNormal, viewDir), 0.0);
        float fresnel = pow(1.0 - viewAngle, 4.0);
        
        spec3 *= (0.3 + fresnel * 0.7);
        float sunlit3 = max(dot(vWorldNormal, lightDir3), 0.0);
        specular += vec3(1.0) * spec3 * sunlit3 * lightIntensity3 * 0.6;
      }
      
      // ICE WORLD CITY LIGHTS - Underground/dome settlements
      // Rare colonies sheltered from extreme cold
      vec3 iceLights = vec3(0.0);
      
      if (population > 10000.0 && !isPolarCap) {
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
          // Prefer equatorial regions (warmer)
          float latitude = abs(vUv.y - 0.5) * 2.0;
          float latitudeFactor = 1.0 - smoothstep(0.0, 0.5, latitude);
          
          vec3 seedOffset = vec3(
            fract(planetSeed * 0.1031),
            fract(planetSeed * 0.1030),
            fract(planetSeed * 0.0973)
          ) * 100.0;
          
          // Underground/dome cities - very clustered (harsh conditions)
          vec3 cityPos = samplePos * 5.0 + seedOffset * 0.7;
          float cityNoise = turbulence3D(cityPos, 3);
          float cityCluster = smoothstep(0.6, 0.8, cityNoise); // Very selective locations
          
          // Research stations and outposts
          vec3 stationPos = samplePos * 10.0 + seedOffset * 1.1;
          float stationNoise = turbulence3D(stationPos, 3);
          float stations = smoothstep(0.58, 0.75, stationNoise);
          
          float urbanization = (cityCluster * 1.0 + stations * 0.25) * latitudeFactor;
          urbanization = clamp(urbanization, 0.0, 1.0);
          
          // Very sparse lights (extreme environment)
          vec3 lightPos1 = samplePos * 18.0 + seedOffset * 1.4;
          vec3 lightPos2 = samplePos * 24.0 + seedOffset * 1.8;
          
          float noise1 = turbulence3D(lightPos1, 3);
          float noise2 = turbulence3D(lightPos2, 3);
          
          float lightField = noise1 * 0.55 + noise2 * 0.45;
          lightField = clamp(lightField, 0.0, 1.0);
          
          float baseDensity = cityBrightness * 0.18 * urbanization; // Very sparse
          float threshold = 0.58 - baseDensity;
          float hasLight = smoothstep(threshold - 0.08, threshold + 0.08, lightField);
          
          float brightnessNoise = turbulence3D(samplePos * 26.0 + seedOffset * 2.3, 3);
          float brightness = brightnessNoise * brightnessNoise * hasLight;
          brightness *= (0.4 + cityCluster * 0.6);
          
          float lightIntensity = smoothstep(0.35, 0.70, lightField) * hasLight * brightness;
          
          // Cool white lights (representing dome/shelter lighting piercing through ice)
          vec3 lightColor = mix(
            vec3(0.85, 0.95, 1.0),  // Cool blue-white (research stations)
            vec3(0.95, 0.98, 1.0),  // Bright cool white (major domed cities)
            brightness
          );
          
          // Lights are dimmer and sparser
          iceLights = lightColor * lightIntensity * nightFactor * cityBrightness * 1.3;
        }
      }
      
      // Combine everything
      vec3 finalColor = colorModulation * intensity * lighting + specular + iceLights;
      
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color(baseColor) },
      lightPosition1: { value: new THREE.Vector3(0, 0, 0) },
      lightPosition2: { value: new THREE.Vector3(0, 0, 0) },
      lightPosition3: { value: new THREE.Vector3(0, 0, 0) },
      lightIntensity1: { value: 0.0 },
      lightIntensity2: { value: 0.0 },
      lightIntensity3: { value: 0.0 },
      time: { value: 0 },
      planetSeed: { value: planetSeed },
      rotation: { value: 0 },
      population: { value: 0.0 }, // Dynamic population from colony data
    },
    vertexShader,
    fragmentShader,
  });
}
