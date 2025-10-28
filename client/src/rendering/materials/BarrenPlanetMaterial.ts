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

  // Fractional Brownian Motion for natural terrain
  float fbm3D(vec3 p, int octaves) {
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

  // Smooth buried craters (heavily eroded)
  // Now supports elliptical craters from oblique impacts
  float buriedCraters3D(vec3 pos, float scale) {
    vec3 scaledPos = pos * scale;
    vec3 grid = floor(scaledPos);
    vec3 localPos = fract(scaledPos);
    
    float craterEffect = 0.0;
    
    // Check neighboring cells
    for(float z = -1.0; z <= 1.0; z++) {
      for(float y = -1.0; y <= 1.0; y++) {
        for(float x = -1.0; x <= 1.0; x++) {
          vec3 neighbor = grid + vec3(x, y, z);
          
          vec3 craterPos = vec3(
            hash3D(neighbor),
            hash3D(neighbor + vec3(13.7, 27.3, 41.1)),
            hash3D(neighbor + vec3(53.2, 67.4, 79.8))
          );
          
          vec3 toCenter = (localPos - vec3(x, y, z)) - craterPos;
          
          // Elliptical crater parameters (for oblique impacts)
          float ellipseRatio = 0.7 + hash3D(neighbor + vec3(25.0, 35.0, 45.0)) * 0.6; // 0.7-1.3 (1.0 = circular)
          float ellipseAngle = hash3D(neighbor + vec3(55.0, 65.0, 75.0)) * 6.28318; // Random rotation
          
          // Rotate toCenter vector to align with ellipse
          float cosA = cos(ellipseAngle);
          float sinA = sin(ellipseAngle);
          vec3 rotated = vec3(
            toCenter.x * cosA - toCenter.z * sinA,
            toCenter.y,
            toCenter.x * sinA + toCenter.z * cosA
          );
          
          // Apply elliptical scaling (stretch one axis for oblique impact)
          vec3 elliptical = vec3(rotated.x * ellipseRatio, rotated.y, rotated.z);
          float dist = length(elliptical);
          
          // Smaller craters - reduced size range for more detail
          float craterSize = 0.15 + hash3D(neighbor + vec3(50.1, 60.2, 70.3)) * 0.25; // 0.15-0.4 range
          float shouldExist = hash3D(neighbor + vec3(100.0, 200.0, 300.0));
          
          // Many more craters - ancient worlds heavily bombarded
          if(shouldExist > 0.35 && dist < craterSize) {
            // Very subtle, smooth depression (ancient, filled with dust)
            float normalizedDist = dist / craterSize;
            
            // Gentle bowl - much smoother than rocky craters but visible
            // Vary depth by crater (some deeper than others)
            float depthVariation = 0.7 + hash3D(neighbor + vec3(200.0, 300.0, 400.0)) * 0.6;
            float bowlDepth = -0.12 * depthVariation * (1.0 - normalizedDist * normalizedDist);
            
            // Very subtle raised ring where dust has accumulated at edges
            float dustRing = 0.0;
            if(normalizedDist > 0.85) {
              float ringPos = (normalizedDist - 0.85) / 0.15;
              dustRing = 0.02 * sin(ringPos * 3.14159);
            }
            
            craterEffect += bowlDepth + dustRing;
          }
        }
      }
    }
    
    return craterEffect;
  }
`;

/**
 * Build vertex shader for barren planet material
 */
function buildVertexShader(): string {
  return (
    GLSL_UTILS +
    `
    uniform float rotation;
    uniform float planetSeed;
    uniform float time;
    
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
      
      // Generate seed-based terrain variety
      float terrainSeed = seededRandom(planetSeed * 1.3);
      float terrainScale = 0.8 + terrainSeed * 1.2;
      
      // Very subtle displacement - ancient smooth surface
      // Only large-scale undulations remain
      float largeTerrain = fbm3D(rotatedPos * 0.3 * terrainScale, 4) * 0.02;
      
      // Many small buried craters for displacement
      float buriedCraters = buriedCraters3D(rotatedPos, 1.2 * terrainScale) * 0.5; // Increased scale from 0.5 to 1.2
      
      float totalDisplacement = largeTerrain + buriedCraters;
      
      // Apply very subtle displacement
      displacedPosition = position + normal * totalDisplacement;
      
      // Calculate normal perturbation (very gentle)
      float epsilon = 0.08;
      
      // Better tangent calculation that handles poles correctly
      vec3 up = abs(normal.y) > 0.999 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
      vec3 tangent = normalize(cross(up, normal));
      vec3 bitangent = normalize(cross(normal, tangent));
      
      vec3 posX = normalize(position + tangent * epsilon);
      vec3 rotX = vec3(
        posX.x * cosRot - posX.z * sinRot,
        posX.y,
        posX.x * sinRot + posX.z * cosRot
      );
      float dispX = fbm3D(rotX * 0.3 * terrainScale, 4) * 0.02;
      
      vec3 posY = normalize(position + bitangent * epsilon);
      vec3 rotY = vec3(
        posY.x * cosRot - posY.z * sinRot,
        posY.y,
        posY.x * sinRot + posY.z * cosRot
      );
      float dispY = fbm3D(rotY * 0.3 * terrainScale, 4) * 0.02;
      
      vec2 gradient = vec2(dispX - totalDisplacement, dispY - totalDisplacement) / epsilon;
      
      // Very gentle normal perturbation for smooth surfaces
      vec3 perturbation = tangent * gradient.x + bitangent * gradient.y;
      displacedNormal = normalize(normal - perturbation * 0.15);
      
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
 * Build fragment shader for barren planet material
 */
function buildFragmentShader(): string {
  return (
    GLSL_UTILS +
    `
    uniform vec3 baseColor;
    uniform vec3 lightPosition;
    uniform float rotation;
    uniform float planetSeed;
    uniform float orbitalDistance;
    uniform float dustThickness;
    uniform float time;
    
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
      float dustColorSeed = seededRandom(planetSeed * 1.7);
      float dustPatternSeed = seededRandom(planetSeed * 2.1);
      float windPatternSeed = seededRandom(planetSeed * 2.9);
      float brightnessSeed = seededRandom(planetSeed * 3.3);
      float duneScaleSeed = seededRandom(planetSeed * 4.1);
      
      // Base dust color - ancient, weathered terrain
      // Variety: tan, reddish, yellowish, pale orange
      float baseBrightness = 0.55 + brightnessSeed * 0.25;
      vec3 dustColor;
      
      if(dustColorSeed < 0.25) {
        // Pale tan dust - like Mars
        dustColor = vec3(
          baseBrightness * 0.95,
          baseBrightness * 0.80,
          baseBrightness * 0.60
        );
      }
      else if(dustColorSeed < 0.5) {
        // Reddish dust - iron oxide rich
        dustColor = vec3(
          baseBrightness * 1.0,
          baseBrightness * 0.70,
          baseBrightness * 0.55
        );
      }
      else if(dustColorSeed < 0.75) {
        // Yellowish dust - sulfur or clay
        dustColor = vec3(
          baseBrightness * 1.0,
          baseBrightness * 0.95,
          baseBrightness * 0.70
        );
      }
      else {
        // Pale orange dust - mixed composition
        dustColor = vec3(
          baseBrightness * 0.98,
          baseBrightness * 0.85,
          baseBrightness * 0.68
        );
      }
      
      vec3 colorModulation = dustColor;
      float intensity = 1.0;
      
      // Ancient terrain - very smooth undulations
      float terrainScale = 0.8 + duneScaleSeed * 1.2;
      float ancientTerrain = fbm3D(samplePos * 0.3 * terrainScale, 5) * 0.15;
      intensity += ancientTerrain;
      
      // Many small buried crater depressions - increased scale for more detail
      float buriedCraters = buriedCraters3D(samplePos, 1.2 * terrainScale); // Increased from 0.5 to 1.2
      intensity += buriedCraters;
      
      // Enhanced shading for buried craters
      if(buriedCraters < -0.02) {
        // Darker in crater depressions (dust accumulation, shadows)
        float craterDepth = abs(buriedCraters);
        
        // Subtle ambient occlusion in depressions
        float ao = 1.0 - clamp(craterDepth * 3.0, 0.0, 0.3);
        intensity *= ao;
        
        // Dust is thicker in depressions (darker, more saturated color)
        colorModulation *= vec3(0.92, 0.93, 0.94);
        
        // Very deep craters show slightly different dust color (older, more compacted)
        if(buriedCraters < -0.05) {
          colorModulation *= vec3(0.96, 0.94, 0.92); // Slightly warmer/darker
        }
      }
      
      // Slight brightness on dust ring edges
      if(buriedCraters > 0.005) {
        intensity += buriedCraters * 2.0; // Brighten the subtle dust rings
      }
      
      // Dust layer variations - the key feature
      // Fine dust settles in depressions, thinner on peaks
      float dustDepth = turbulence3D(samplePos * 2.0, 4);
      
      // Wind-carved features - erosion patterns
      float windScale = 1.5 + windPatternSeed * 2.0;
      float windPatterns = fbm3D(samplePos * windScale, 5);
      
      // Subtle wind-eroded patterns (not regular streaks)
      // Use multiple scales of turbulence for natural, irregular patterns
      float windDirection = windPatternSeed * 6.28318; // 0 to 2π
      vec3 windAxis = vec3(cos(windDirection), 0.0, sin(windDirection));
      
      // Create irregular wind-carved features using multi-scale turbulence
      float windErosion1 = turbulence3D(samplePos * 2.5 + windAxis * 0.3, 4);
      float windErosion2 = turbulence3D(samplePos * 5.0 + windAxis * 0.5, 3);
      float windErosion3 = fbm3D(samplePos * 8.0, 3);
      
      // Combine erosion patterns - no regular sine waves
      float erosionPattern = windErosion1 * 0.5 + windErosion2 * 0.3 + windErosion3 * 0.2;
      
      // Only show erosion in certain areas (not everywhere)
      float erosionMask = smoothstep(0.45, 0.55, erosionPattern);
      
      // Very subtle color variation from wind erosion
      colorModulation *= (1.0 - erosionMask * 0.04); // Reduced from 0.08 to 0.04
      
      // Subtle dust disturbances (removed spiral dust devil tracks that caused artifacts)
      // Use simple turbulence for disturbed dust patterns
      float slowTime = time * 0.00001;
      vec3 disturbancePos = samplePos * 6.0 + vec3(slowTime * 0.2, slowTime * 0.15, 0.0);
      float disturbancePattern = turbulence3D(disturbancePos, 3);
      
      // Very subtle lighter patches where dust has been disturbed
      float dustDisturbance = smoothstep(0.75, 0.85, disturbancePattern);
      colorModulation += vec3(1.0) * dustDisturbance * 0.03;
      intensity += dustDisturbance * 0.02;
      
      // Fine dust ripples - micro-dunes everywhere
      float rippleScale = 12.0 + dustPatternSeed * 8.0;
      float dustRipples = sin(samplePos.x * rippleScale + windPatterns * 2.0) * 
                         sin(samplePos.y * rippleScale * 0.8 + windPatterns * 1.5) * 
                         sin(samplePos.z * rippleScale * 0.9 + windPatterns * 1.8);
      dustRipples = dustRipples * 0.5 + 0.5; // Normalize to 0-1
      
      // Ripples add very subtle height variation
      intensity += (dustRipples - 0.5) * 0.03;
      
      // Large dune fields - optional, based on dust thickness
      float duneFreq = 0.5 + duneScaleSeed * 0.5;
      float dunes = fbm3D(samplePos * duneFreq, 4);
      float dunePattern = smoothstep(0.4, 0.6, dunes);
      
      // Dunes create gentle elevation changes
      intensity += dunePattern * dustThickness * 0.1;
      
      // Dune crests are slightly different color (more exposed to sun/wind)
      if(dunePattern > 0.6) {
        colorModulation *= vec3(1.05, 1.03, 1.02); // Slightly lighter/warmer
      }
      
      // Ancient rock outcrops barely visible beneath dust
      float rockOutcrops = turbulence3D(samplePos * 1.2, 6);
      float hasRock = smoothstep(0.75, 0.85, rockOutcrops);
      
      if(hasRock > 0.1) {
        // Darker, less dusty areas where rock shows through
        vec3 rockColor = dustColor * 0.7; // Much darker
        colorModulation = mix(colorModulation, rockColor, hasRock * (1.0 - dustThickness * 0.5));
        intensity -= hasRock * 0.08;
      }
      
      // Overall dust layer brightness variation
      float dustBrightness = turbulence3D(samplePos * 4.0, 4);
      intensity += (dustBrightness - 0.5) * 0.08;
      
      // Apply lighting
      vec3 lightDir = normalize(lightPosition - vWorldPosition);
      float diffuse = max(dot(vWorldNormal, lightDir), 0.0);
      
      // Softer lighting for dust-covered surfaces (dust scatters light)
      float dustScattering = 0.25 + (1.0 - dustThickness) * 0.1;
      float lighting = diffuse * (1.0 - dustScattering) + dustScattering;
      
      // Dust specular reflection - very subtle, matte surface with occasional glints
      vec3 viewDir = normalize(cameraPosition - vWorldPosition);
      
      // Microsurface glints from dust particles
      float microGlints = turbulence3D(samplePos * 25.0, 3);
      microGlints = smoothstep(0.7, 0.9, microGlints);
      
      // Very subtle specular from dust particles
      vec3 halfVector = normalize(lightDir + viewDir);
      float specAngle = max(dot(vWorldNormal, halfVector), 0.0);
      
      // Low shininess for matte dust
      float dustSpec = pow(specAngle, 8.0) * microGlints * 0.12 * dustThickness;
      
      // Fresnel effect - dust reflects more at grazing angles
      float viewAngle = max(dot(vWorldNormal, viewDir), 0.0);
      float fresnel = pow(1.0 - viewAngle, 4.0);
      dustSpec += fresnel * 0.05 * dustThickness;
      
      // Only add specular on sunlit side
      float sunlit = max(dot(vWorldNormal, lightDir), 0.0);
      dustSpec *= sunlit;
      
      vec3 specularColor = vec3(1.0, 0.98, 0.95) * dustSpec; // Slightly warm specular
      
      // Slight emissive for visibility on dark side
      float emissive = 0.12;
      
      // Clamp intensity to prevent extreme darkening at poles or other artifacts
      intensity = clamp(intensity, 0.3, 2.0);
      
      vec3 finalColor = colorModulation * intensity * (lighting + emissive) + specularColor;
      
      // Final safeguard against black artifacts
      finalColor = max(finalColor, vec3(0.05));
      
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `
  );
}

/**
 * Creates a complete ShaderMaterial for Barren/Desert planets
 * with ancient smooth surfaces, dust layers, wind patterns, and subtle reflectivity
 */
export function createBarrenPlanetMaterial(
  baseColor: number,
  planetSeed: number,
  orbitalDistance: number = 0.5,
  dustThickness: number = 0.7 // 0 = rocky with patches of dust, 1 = completely dust-covered
): THREE.ShaderMaterial {
  const color = new THREE.Color(baseColor);

  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: color },
      lightPosition: { value: new THREE.Vector3(0, 0, 0) }, // Sun at origin
      rotation: { value: 0 },
      planetSeed: { value: planetSeed },
      orbitalDistance: { value: orbitalDistance },
      dustThickness: { value: dustThickness },
      time: { value: 0 },
    },
    vertexShader: buildVertexShader(),
    fragmentShader: buildFragmentShader(),
    side: THREE.FrontSide,
  });
}
