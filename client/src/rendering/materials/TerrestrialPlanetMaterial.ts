import * as THREE from "three";

/**
 * Creates a complete ShaderMaterial for Terrestrial (Earth-like) planets
 * with continents, oceans, ice caps, habitability-based vegetation, and city lights
 */
export function createTerrestrialPlanetMaterial(
  baseColor: number,
  planetSeed: number,
  orbitalDistance: number,
  habitability: number,
  civilizationLevel: number = 0 // 0-7 scale (0=none, 1=primitive, 2=agricultural, etc.)
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
  `;

  const vertexShader = `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldNormal;
    varying vec3 vPosition;
    varying vec3 vWorldPosition;

    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal); // View-space normal (for other uses)
      vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz); // World-space normal
      vPosition = position;
      vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform vec3 baseColor;
    uniform vec3 lightPosition;
    uniform vec3 viewPosition;
    uniform float time;
    uniform float rotation;
    uniform float planetSeed;
    uniform float orbitalDistance;
    uniform float habitability;
    uniform float civilizationLevel;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldNormal;
    varying vec3 vPosition;
    varying vec3 vWorldPosition;

    ${glslUtils}

    void main() {
      vec3 colorModulation = baseColor;
      float intensity = 1.0;
      float oceanSpecular = 0.0; // Will be set for ocean surfaces
      
      // Extract u, v for polar calculations
      float u = vUv.x;
      float v = vUv.y;

      // Generate seed-based variety parameters for this planet
      float continentScaleSeed = seededRandom(planetSeed * 1.1);
      float waterLevelSeed = seededRandom(planetSeed * 1.3);
      float iceCapSizeSeed = seededRandom(planetSeed * 1.7);
      
      // Vary continent scale - reduced to make continents larger (was 2.5-6.0, now 1.0-2.5)
      float continentScale = 1.0 + continentScaleSeed * 1.5;
      
      // Use 3D position for seamless noise (no UV seam)
      // Apply rotation to the sampling position
      vec3 rotatedPos = vPosition;
      float cosRot = cos(rotation);
      float sinRot = sin(rotation);
      rotatedPos = vec3(
        vPosition.x * cosRot - vPosition.z * sinRot,
        vPosition.y,
        vPosition.x * sinRot + vPosition.z * cosRot
      );
      
      // Normalize and scale for continent generation
      vec3 samplePos = normalize(rotatedPos) * continentScale;
      
      // Generate continents using 3D turbulence for seamless wrapping
      float continentNoise = turbulence3D(samplePos, 5);
      
      // Vary water level (0.35 to 0.65) for different ocean coverage
      // Higher threshold = more ocean (fewer noise values exceed threshold)
      // 0.35 = continental world (~30% water, 70% land)
      // 0.50 = balanced Earth-like (~50% water, 50% land)
      // 0.65 = oceanic atoll world (~70% water, 30% land)
      float landThreshold = 0.35 + waterLevelSeed * 0.30;
      bool isLand = continentNoise > landThreshold;
      
      // Check if we're near poles for ice caps with irregular boundaries
      float distanceFromPole = abs(v - 0.5) * 2.0; // 0 at poles, 1 at equator
      
      // Ice cap size varies with habitability AND orbital distance
      // High habitability (>0.6): temperate, smaller ice caps
      // Low habitability (<0.4): cold, very large ice caps  
      // Distance provides baseline, habitability adjusts it
      
      float temperatureFactor = clamp(orbitalDistance, 0.0, 2.0);
      float minIceThreshold, maxIceThreshold;
      
      if (temperatureFactor < 0.5) {
        // Hot planets (close to star) - tiny ice caps
        minIceThreshold = 0.85;
        maxIceThreshold = 0.92;
      } else if (temperatureFactor < 1.0) {
        // Temperate planets (habitable zone) - moderate ice caps
        minIceThreshold = 0.70;
        maxIceThreshold = 0.85;
      } else if (temperatureFactor < 1.5) {
        // Cool planets - large ice caps
        minIceThreshold = 0.30;
        maxIceThreshold = 0.70;
      } else {
        // Frozen planets (far from star) - massive ice caps up to 90%
        minIceThreshold = 0.10;
        maxIceThreshold = 0.30;
      }
      
      // Adjust ice caps based on habitability
      // Low habitability = colder = more ice
      // High habitability = warmer = less ice
      if (habitability < 0.6) {
        // Uninhabitable/marginal: expand ice caps significantly
        float coldnessFactor = (0.6 - habitability) / 0.6; // 0.0 at hab=0.6, 1.0 at hab=0.0
        
        // Shift thresholds down (more ice) based on how cold it is
        // At hab=0.0, ice caps cover up to 95% of planet
        // At hab=0.3, ice caps cover up to 80% of planet
        float iceExpansion = coldnessFactor * 0.6; // Up to 60% reduction in threshold
        minIceThreshold = max(0.05, minIceThreshold - iceExpansion);
        maxIceThreshold = max(0.10, maxIceThreshold - iceExpansion);
      } else if (habitability > 0.7) {
        // Highly habitable: shrink ice caps slightly
        float warmthFactor = (habitability - 0.7) / 0.3; // 0.0 at hab=0.7, 1.0 at hab=1.0
        
        // Shift thresholds up (less ice)
        float iceShrinkage = warmthFactor * 0.15; // Up to 15% increase in threshold
        minIceThreshold = min(0.92, minIceThreshold + iceShrinkage);
        maxIceThreshold = min(0.95, maxIceThreshold + iceShrinkage);
      }
      
      // Apply seed-based variety within the temperature range
      float baseIceThreshold = minIceThreshold + iceCapSizeSeed * (maxIceThreshold - minIceThreshold);
      
      // Add noise to ice cap boundary for irregular shape using 3D noise
      float iceNoise = turbulence3D(samplePos * 0.8, 4) * 0.12;
      float iceThreshold = baseIceThreshold - iceNoise;
      
      bool isIceCap = distanceFromPole > iceThreshold; // Ice caps with uneven edges
      
      // Color and intensity based on terrain type
      if (isIceCap) {
        // ICE CAPS with layered appearance
        // Inner core: pure white, very glossy
        // Outer layer: whitish, less glossy
        
        // Calculate distance from pole center for layering
        float polarDistance = distanceFromPole;
        
        // Inner core ice (closest to pole) - pure white, very glossy
        float innerIceThreshold = iceThreshold + 0.05;
        bool isInnerIce = polarDistance > innerIceThreshold;
        
        if (isInnerIce) {
          // Core: Pure white, very glossy
          colorModulation = vec3(1.0, 1.0, 1.0); // Pure white
          intensity = 1.15;
        } else {
          // Outer ice: Whitish with slight blue tint, less glossy
          colorModulation = vec3(0.90, 0.92, 0.95); // Whitish-blue
          intensity = 1.0;
        }
        
        // Add some crack detail to ice caps using 3D noise
        float iceCracks = turbulence3D(samplePos * 2.0, 3);
        intensity -= smoothstep(0.45, 0.55, iceCracks) * 0.08;
      }
      else if (isLand) {
        // CONTINENTS - color depends on habitability
        // High habitability (>0.6): green vegetation
        // Low habitability (<0.6): brown/gray barren rock
        float latitude = abs(v - 0.5) * 2.0;
        
        // Add terrain variation using 3D noise
        // Reduced scale for larger terrain features (was 1.5, now 0.6)
        float terrainDetail = turbulence3D(samplePos * 0.6, 4) * 0.15;
        
        if (habitability > 0.6) {
          // HABITABLE - green vegetation
          // Greener at equator, more brown/tan at higher latitudes
          float greenAmount = 1.0 - latitude * 0.5;
          colorModulation = vec3(
            0.4 + (1.0 - greenAmount) * 0.3,  // R - more brown at poles
            0.6 * greenAmount,                 // G - less green at poles  
            0.2 + (1.0 - greenAmount) * 0.2   // B
          );
        } else {
          // UNINHABITABLE - brown/gray barren rock
          // Vary color by habitability: lower habitability = grayer
          float grayness = 1.0 - habitability; // 0.4 to 1.0 (more gray when less habitable)
          
          // Brown rocky terrain for marginally habitable (0.3-0.6)
          // Gray rocky terrain for very uninhabitable (<0.3)
          if (habitability > 0.3) {
            // Brownish rock with some color variation
            colorModulation = vec3(
              0.45 + terrainDetail * 0.2,  // R - brown
              0.35 + terrainDetail * 0.15, // G - brown
              0.25 + terrainDetail * 0.1   // B - brown
            );
          } else {
            // Gray rock - very barren
            float baseGray = 0.35 + terrainDetail * 0.15;
            colorModulation = vec3(
              baseGray,              // R - gray
              baseGray * 0.95,       // G - slightly less
              baseGray * 0.90        // B - slightly less (subtle brown tint)
            );
          }
        }
        
        intensity = 0.9 + terrainDetail;
        
        // Add mountain ranges (darker, higher elevation) using 3D noise
        // Reduced scale for larger mountain features (was 0.8, now 0.3)
        float mountains = turbulence3D(samplePos * 0.3, 6);
        if (mountains > 0.65) {
          colorModulation *= 0.7; // Darker for mountains
          intensity += 0.1;
        }
      }
      else {
        // OCEANS - blue water with seed-based color variation
        // Deeper water = darker blue
        float oceanDepth = (landThreshold - continentNoise) / landThreshold;
        float depthFactor = 1.0 - oceanDepth * 0.5;
        
        // Generate seed-based ocean color (deep blue -> light blue -> turquoise)
        // This logic is shared with planetColorUtils.ts
        float oceanColorSeed = seededRandom(planetSeed * 2.7);
        vec3 baseOceanColor;
        
        if (oceanColorSeed < 0.33) {
          // Deep blue ocean (Earth-like) - OceanColorType.DEEP_BLUE
          baseOceanColor = vec3(0.05, 0.15, 0.35);
        } else if (oceanColorSeed < 0.66) {
          // Light blue ocean (tropical) - OceanColorType.LIGHT_BLUE
          baseOceanColor = vec3(0.15, 0.25, 0.40);
        } else {
          // Turquoise ocean (exotic) - OceanColorType.TURQUOISE
          baseOceanColor = vec3(0.10, 0.30, 0.35);
        }
        
        colorModulation = baseOceanColor * depthFactor;
        intensity = 0.8 + oceanDepth * 0.2;
        
        // Add wave patterns using 3D noise
        // Reduced scale for larger wave features (was 2.5, now 1.0)
        float waves = turbulence3D(samplePos * 1.0, 3) * 0.1;
        intensity += waves;
        
        // OCEAN SPECULAR HIGHLIGHTS - Make water reflective
        // Calculate view direction (from surface to camera)
        vec3 viewDir = normalize(viewPosition - vWorldPosition);
        vec3 lightDir = normalize(lightPosition - vWorldPosition);
        
        // Use Blinn-Phong for specular - more realistic than Phong
        vec3 halfVector = normalize(lightDir + viewDir);
        float specularAngle = max(dot(vWorldNormal, halfVector), 0.0);
        
        // High shininess for water (smooth surface)
        float shininess = 128.0;
        float specular = pow(specularAngle, shininess);
        
        // Specular is stronger at glancing angles (Fresnel effect)
        float viewAngle = max(dot(vWorldNormal, viewDir), 0.0);
        float fresnel = pow(1.0 - viewAngle, 3.0); // Increases at edges
        specular *= (0.5 + fresnel * 1.5); // Boost at edges
        
        // Only add specular on sunlit side
        float sunlit = max(dot(vWorldNormal, lightDir), 0.0);
        specular *= sunlit;
        
        // Vary specular strength with wave patterns for dynamic shimmer
        specular *= (1.0 + waves * 2.0);
        
        // Store specular for later (add after main lighting)
        float oceanSpecular = specular * 0.8;
        
        // Add sea ice near ice caps (broken ice floes in cold water)
        // Only appears in transition zone between ice caps and open ocean
        float seaIceZone = 0.0;
        
        // Check proximity to ice caps
        if (distanceFromPole > iceThreshold * 0.85) {
          // We're in potential sea ice zone (just beyond ice cap edge)
          float distanceBeyondIceCap = distanceFromPole - iceThreshold;
          
          // Sea ice extends 0.1-0.15 units beyond ice cap edge
          float seaIceRange = 0.15;
          float seaIceIntensity = smoothstep(seaIceRange, 0.0, distanceBeyondIceCap);
          
          if (seaIceIntensity > 0.0) {
            // Create broken ice pattern using 3D noise
            // Multiple scales for varied ice floe sizes
            float icePattern1 = turbulence3D(samplePos * 8.0, 4);
            float icePattern2 = turbulence3D(samplePos * 15.0, 3);
            
            // Large ice floes (more solid near ice cap)
            float largeFloes = smoothstep(0.45, 0.55, icePattern1) * seaIceIntensity;
            
            // Smaller ice chunks (scattered further out)
            float smallFloes = smoothstep(0.5, 0.6, icePattern2) * seaIceIntensity * 0.5;
            
            // Combine ice patterns
            seaIceZone = clamp(largeFloes + smallFloes, 0.0, 1.0);
            
            // Blend ice color with ocean
            vec3 seaIceColor = vec3(0.85, 0.88, 0.92); // Slightly blue-tinted white
            colorModulation = mix(colorModulation, seaIceColor, seaIceZone);
            
            // Ice is brighter than water
            intensity = mix(intensity, 1.05, seaIceZone);
          }
        }
      }

      // CITY LIGHTS - Procedural civilization lights
      vec3 cityLights = vec3(0.0);
      
      if (civilizationLevel > 1.0 && isLand && !isIceCap) {
        // Calculate brightness based on civilization level
        float cityBrightness = (civilizationLevel - 1.0) / 6.0; // 0 to 1.0
        
        // Only show on night side
        vec3 lightDir = normalize(lightPosition - vWorldPosition);
        float nightSide = 1.0 - max(dot(vWorldNormal, lightDir), 0.0);
        float nightFactor = smoothstep(0.2, 0.8, nightSide);
        
        if (nightFactor > 0.1) {
          // Latitude factor - more lights at equator, NO lights near/at poles
          float latitude = abs(vUv.y - 0.5) * 2.0; // 0 at equator, 1 at poles
          
          // Hard cutoff: no lights above 60° latitude (latitude > 0.6)
          if (latitude < 0.6) {
            // Only calculate city lights in temperate/tropical zones
            
            // Smooth falloff from equator to 60° latitude
            float latitudeFactor = 1.0 - smoothstep(0.0, 0.6, latitude); // 1.0 at equator, 0.0 at 60°
          
          // Create seed-based offset that's consistent but small
          vec3 seedOffset = vec3(
            fract(planetSeed * 0.1031),
            fract(planetSeed * 0.1030),
            fract(planetSeed * 0.0973)
          ) * 100.0; // Small varied offset (0-100 range)
          
          // Step 1: Create large metropolitan clusters (where big cities form)
          vec3 metroPos = samplePos * 2.0 + seedOffset * 0.5;
          float metroNoise = turbulence3D(metroPos, 3);
          float metroCluster = smoothstep(0.5, 0.7, metroNoise); // Only some regions are urban centers
          
          // Step 2: Create mid-scale population density (suburbs, towns)
          vec3 popPos = samplePos * 5.0 + seedOffset * 0.7;
          float popNoise = turbulence3D(popPos, 4);
          float popDensity = smoothstep(0.4, 0.6, popNoise);
          
          // Combine: bright metros + moderate population areas, modulated by latitude
          float urbanization = (metroCluster * 1.0 + popDensity * 0.3) * latitudeFactor;
          urbanization = clamp(urbanization, 0.0, 1.0);
          
          // Step 3: Chaotic light placement using multi-scale noise
          // Use multiple scales of noise to break up patterns
          vec3 chaosPos1 = samplePos * 18.0 + seedOffset;
          vec3 chaosPos2 = samplePos * 23.0 + seedOffset * 1.3;
          vec3 chaosPos3 = samplePos * 31.0 + seedOffset * 1.7; // Prime numbers to avoid resonance
          
          // Multiple noise layers for each position
          float noise1 = turbulence3D(chaosPos1, 3);
          float noise2 = turbulence3D(chaosPos2, 4);
          float noise3 = turbulence3D(chaosPos3, 2);
          
          // Combine noises to create highly irregular light field
          float lightField = noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2;
          
          // Normalize to 0-1 range (turbulence is already roughly 0-1 but can exceed)
          lightField = clamp(lightField, 0.0, 1.0);
          
          // Lights appear where noise is high
          float baseDensity = cityBrightness * 0.25 * urbanization;
          float threshold = 0.5 - baseDensity; // More civilization = lower threshold = more lights
          float hasLight = smoothstep(threshold - 0.1, threshold + 0.1, lightField);
          
          // Brightness varies with noise intensity
          float brightnessNoise = turbulence3D(samplePos * 27.0 + seedOffset * 2.1, 3);
          float brightness = brightnessNoise * brightnessNoise * hasLight; // Squared for variety
          
          // Metro centers are brighter
          brightness *= (0.3 + metroCluster * 0.7);
          
          // Create point-like appearance with soft falloff
          float pointIntensity = smoothstep(0.3, 0.7, lightField);
          float glow = smoothstep(0.2, 0.6, lightField) * 0.5;
          
          float lightIntensity = (pointIntensity + glow) * hasLight * brightness;
          
          // Warm city light color with variation
          vec3 lightColor = mix(
            vec3(1.0, 0.65, 0.35),  // Warm orange (dim residential)
            vec3(1.0, 0.90, 0.75),  // Bright yellow-white (city centers)
            brightness
          );
          
          // Reduced overall brightness
          cityLights = lightColor * lightIntensity * nightFactor * cityBrightness * 1.8;
          }
        }
      }

      // Apply Lambert lighting with proper world-space light direction
      vec3 lightDir = normalize(lightPosition - vWorldPosition);
      float diffuse = max(dot(vWorldNormal, lightDir), 0.0);
      
      // Ambient + diffuse lighting with modulated color
      vec3 ambient = colorModulation * 0.3;
      vec3 diffuseColor = colorModulation * diffuse * intensity;
      
      // Add ocean specular highlights (bright white reflections)
      vec3 specularColor = vec3(1.0, 1.0, 1.0) * oceanSpecular;
      
      // Add city lights (additive, so they glow)
      vec3 finalColor = ambient + diffuseColor + specularColor + cityLights;
      
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: color },
      lightPosition: { value: new THREE.Vector3(0, 0, 0) }, // Sun at origin
      viewPosition: { value: new THREE.Vector3(0, 0, 0) }, // Will be updated each frame
      time: { value: 0 },
      rotation: { value: 0 },
      planetSeed: { value: planetSeed },
      orbitalDistance: { value: orbitalDistance },
      habitability: { value: habitability },
      civilizationLevel: { value: civilizationLevel },
    },
    vertexShader,
    fragmentShader,
    side: THREE.FrontSide,
  });
}
