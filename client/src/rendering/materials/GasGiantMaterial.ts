import * as THREE from "three";

/**
 * Creates a shader material for gas giant planets (Jupiter, Saturn-like)
 * Features thick colorful bands, turbulent storms, and contrasting color splashes
 */
export function createGasGiantMaterial(
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
  `;

  const vertexShader = `
    uniform float rotation;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldNormal;
    varying vec3 vPosition;
    varying vec3 vWorldPosition;

    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vPosition = position;
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
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

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldNormal;
    varying vec3 vPosition;
    varying vec3 vWorldPosition;

    ${glslUtils}

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
      
      vec3 colorModulation = vec3(1.0);
      float intensity = 1.0;
      
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
      
      // Generate seed-based distortion variety (no animation)
      float turbulenceSeed1 = seededRandom(planetSeed * 3.1);
      float turbulenceSeed2 = seededRandom(planetSeed * 3.7);
      
      // Use static seed-based distortion instead of time-based animation
      // Add seed-based circular distortions at different scales (static)
      float smallEddyAngle = turbulenceSeed1 * 100.0;
      vec3 smallEddyRotation = vec3(
        sin(smallEddyAngle) * 0.08,
        cos(smallEddyAngle * 0.7) * 0.04,
        cos(smallEddyAngle) * 0.08
      );
      
      // Medium eddies with different seed offset
      float mediumEddyAngle = turbulenceSeed2 * 80.0;
      vec3 mediumEddyRotation = vec3(
        sin(mediumEddyAngle) * 0.12,
        cos(mediumEddyAngle * 0.8) * 0.08,
        cos(mediumEddyAngle) * 0.12
      );
      
      // Combine static distortions for pattern variation
      vec3 totalRotation = samplePos + smallEddyRotation + mediumEddyRotation;
      
      // Create flowing turbulent bands using 3D noise with rotational motion
      float flow = turbulence3D(totalRotation * vec3(3.0, 2.5, 3.0), 6);
      float distortion = turbulence3D(totalRotation * vec3(4.5, 1.5, 4.5) + vec3(flow * 0.5, 0.0, 0.0), 4) * 0.3;
      
      // Multiple band layers with different frequencies - use latitude (v) for horizontal bands
      float mainBands = sin((v + distortion) * 20.0) * 0.5 + 0.5;
      float subBands = sin((v + distortion * 1.5) * 40.0) * 0.5 + 0.5;
      float fineBands = sin((v + flow * 0.2) * 80.0) * 0.5 + 0.5;
      
      // Combine bands with different weights
      float bandMix = mainBands * 0.6 + subBands * 0.3 + fineBands * 0.1;
      
      // Add turbulent spots and storms using 3D noise - scaled down for larger storm features
      // Use static seed-based offset instead of rotation animation
      float stormSeed = seededRandom(planetSeed * 4.3);
      
      // Create static seed-based offset for storm patterns
      vec3 stormOffset = vec3(
        sin(stormSeed * 100.0) * 0.2,
        cos(stormSeed * 100.0) * 0.15,
        sin(stormSeed * 70.0) * 0.2
      );
      
      float storms = turbulence3D((samplePos + stormOffset) * vec3(4.0, 3.0, 4.0), 5);
      float spotPattern = smoothstep(0.6, 0.8, storms);
      
      // Create color variations across bands
      // Use static seed-based color variation instead of time-based shifting
      float colorShiftSeed = seededRandom(planetSeed * 5.7);
      float colorShift = sin(colorShiftSeed * 50.0) * 0.03 
                       + cos(colorShiftSeed * 80.0) * 0.02 
                       + 1.0; // Subtle seed-based color variation
      float colorBand = sin(v * 15.0 + flow * 0.3) * 0.5 + 0.5;
      
      // Rich color palette for gas giants using varied base color
      vec3 lightBand = variedBaseColor * 1.3 * colorShift; // Brighter zones with color shift
      vec3 darkBand = variedBaseColor * 0.7; // Darker zones stay stable
      vec3 stormColor = variedBaseColor * vec3(1.2, 1.1, 0.9) * colorShift; // Slightly warmer storms with variation
      
      // Add contrasting color splashes (like Jupiter's Great Red Spot)
      // Generate seed-based contrasting color regions - ONE large prominent spot
      float contrastSeed1 = seededRandom(planetSeed * 6.1);
      float contrastSeed2 = seededRandom(planetSeed * 7.3);
      float contrastSeed3 = seededRandom(planetSeed * 8.9);
      
      // Create localized contrasting color regions using multiple noise layers
      vec3 contrastOffset = vec3(
        sin(contrastSeed1 * 100.0) * 10.0,
        cos(contrastSeed1 * 80.0) * 8.0,
        sin(contrastSeed2 * 90.0) * 10.0
      );
      
      // Generate ONE large swirling contrast spot with lower frequency (bigger size)
      // Reduced frequency from 6.0 to 3.0 to make it much bigger
      float contrastSpot1 = turbulence3D((samplePos + contrastOffset) * vec3(3.0, 2.5, 3.0), 5);
      
      // Create a larger, more prominent spot with softer falloff
      // Lower threshold (0.55 instead of 0.65) and wider range for bigger spot
      float spot1Mask = smoothstep(0.55, 0.7, contrastSpot1);
      
      // Use just the single large spot
      float contrastMask = spot1Mask;
      
      // Generate contrasting colors based on seed - warm/cool contrast
      // Some planets get warm splashes (reds, oranges), others get cool (blues, teals)
      float warmCool = seededRandom(planetSeed * 9.7);
      vec3 contrastColor;
      
      if(warmCool > 0.5) {
        // Warm contrasting colors (reddish, orangish)
        contrastColor = vec3(
          variedBaseColor.r * 1.6 + 0.3,
          variedBaseColor.g * 0.9 + 0.15,
          variedBaseColor.b * 0.6 + 0.05
        );
      } else {
        // Cool contrasting colors (bluish, teal)
        contrastColor = vec3(
          variedBaseColor.r * 0.7 + 0.1,
          variedBaseColor.g * 1.1 + 0.2,
          variedBaseColor.b * 1.5 + 0.25
        );
      }
      
      // Add some seed-based color variation to make each planet unique
      contrastColor *= vec3(
        0.9 + contrastSeed2 * 0.2,
        0.9 + contrastSeed3 * 0.2,
        0.9 + contrastSeed1 * 0.2
      );
      
      // Mix colors based on bands and turbulence
      colorModulation = mix(darkBand, lightBand, bandMix);
      colorModulation = mix(colorModulation, stormColor, spotPattern * 0.4);
      
      // Blend in the contrasting color splashes
      colorModulation = mix(colorModulation, contrastColor, contrastMask * 0.7);
      
      // Add extra saturation and color variation
      colorModulation *= vec3(
        1.0 + colorBand * 0.2,
        1.0 + (1.0 - colorBand) * 0.15,
        1.0 + sin(colorBand * 3.14159) * 0.15
      );
      
      // Intensity variations from turbulence (static)
      intensity = 0.85 + bandMix * 0.3 + storms * 0.15;
      
      // Add polar storms with contrasting colors
      float polarDistance = abs(v - 0.5) * 2.0; // 0 at equator, 1 at poles
      if(polarDistance > 0.7) {
        float poleIntensity = smoothstep(0.7, 0.95, polarDistance);
        
        // Create swirling vortex pattern at poles using 3D noise
        vec2 poleCenter = vec2(0.5, v > 0.5 ? 1.0 : 0.0);
        vec2 toPole = vec2(u, v) - poleCenter;
        float distFromPole = length(toPole) * 4.0; // Scale for visibility
        
        // Add static seed-based distortion to polar vortices
        float vortexSeed = seededRandom(planetSeed * 5.1);
        // Static seed-based rotation offset (no animation)
        float vortexRotation = vortexSeed * 6.28; // 0 to 2*PI
        float poleSign = v > 0.5 ? 1.0 : -1.0; // Opposite rotation for each pole
        
        // Spiral distortion using 3D noise with static offset
        float angle = atan(toPole.y, toPole.x) + vortexRotation * poleSign;
        vec3 spiralPos = samplePos + vec3(distFromPole * 1.2, angle * 0.8, distFromPole * 1.2);
        float spiral = turbulence3D(spiralPos, 5);
        
        // Create storm pattern using 3D noise - scaled for larger features
        // Add static offset to the vortex pattern
        vec3 vortexPos = samplePos * vec3(8.0, 12.0, 8.0) + vec3(spiral * 0.5 + vortexRotation * poleSign * 0.3, spiral * 0.3, 0.0);
        float vortexPattern = turbulence3D(vortexPos, 6);
        
        // Storm mask - visible only near poles
        float stormMask = smoothstep(0.8, 0.4, distFromPole) * poleIntensity;
        
        // Contrasting color for polar storms
        // Use complementary hue by shifting RGB channels
        vec3 polarStormColor = vec3(
          variedBaseColor.b * 1.4,  // Shift colors for contrast
          variedBaseColor.r * 1.2,
          variedBaseColor.g * 1.3
        );
        
        // Add variation within the storm
        float stormColorVariation = vortexPattern * 0.3 + 0.7;
        polarStormColor *= stormColorVariation;
        
        // Blend polar storm into the base color
        colorModulation = mix(colorModulation, polarStormColor, stormMask * 0.8);
        
        // Add extra intensity variation in storms
        intensity += stormMask * (vortexPattern - 0.5) * 0.4;
      }
      
      // Apply Lambert lighting from all light sources
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
      float lighting = totalDiffuse * 0.85 + 0.15; // Ambient light
      
      // Add very subtle atmospheric glow on edges
      vec3 viewDir = normalize(cameraPosition - vWorldPosition);
      float edgeFactor = 1.0 - abs(dot(vWorldNormal, viewDir));
      float atmosphericGlow = pow(edgeFactor, 3.0) * 0.12;
      
      vec3 finalColor = colorModulation * intensity * lighting + variedBaseColor * atmosphericGlow;
      
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color(baseColor) },
      lightPosition1: { value: new THREE.Vector3(0, 0, 0) },
      lightPosition2: { value: new THREE.Vector3(0, 0, 0) },
      lightPosition3: { value: new THREE.Vector3(0, 0, 0) },
      lightIntensity1: { value: 1.0 },
      lightIntensity2: { value: 0.0 },
      lightIntensity3: { value: 0.0 },
      rotation: { value: 0.0 },
      time: { value: 0.0 },
      planetSeed: { value: planetSeed },
    },
    lights: false,
    vertexShader,
    fragmentShader,
  });
}

