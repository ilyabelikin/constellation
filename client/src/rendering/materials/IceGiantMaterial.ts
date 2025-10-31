import * as THREE from "three";

/**
 * Creates a shader material for ice giant planets (Neptune, Uranus-like)
 * Features soft, swirling gaseous atmospheres with gentle cloud patterns
 * Unlike gas giants with harsh bands, ice giants have more subtle, flowing clouds
 */
export function createIceGiantMaterial(
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

    // Smooth multi-octave noise (not absolute) for softer clouds
    float smoothNoise3D(vec3 p, int octaves) {
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
      vec3 colorModulation = baseColor;
      float intensity = 1.0;
      
      float u = vUv.x;
      float v = vUv.y;

      // Generate seed-based variety parameters
      float colorSeedR = seededRandom(planetSeed * 1.41);
      float colorSeedG = seededRandom(planetSeed * 1.73);
      float colorSeedB = seededRandom(planetSeed * 2.17);
      float cloudSpeedSeed = seededRandom(planetSeed * 2.9);
      float cloudScaleSeed = seededRandom(planetSeed * 3.1);
      float flowSeed1 = seededRandom(planetSeed * 3.7);
      float flowSeed2 = seededRandom(planetSeed * 4.3);
      
      // Apply subtle color variation to baseColor
      vec3 variedBaseColor = baseColor * vec3(
        0.85 + colorSeedR * 0.3,
        0.85 + colorSeedG * 0.3,
        0.85 + colorSeedB * 0.3
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
      
      // Very slow atmospheric flow animation
      float slowTime = time * 0.00001 * (0.5 + cloudSpeedSeed * 1.0);
      
      // Latitude affects flow speed (differential rotation like Neptune)
      float latitude = abs(v - 0.5) * 2.0;
      float latitudeFlow = (1.0 - latitude * 0.4);
      
      // Gentle rotation around Y-axis for atmospheric circulation
      float flowAngle = slowTime * latitudeFlow * 0.3;
      float cosFlow = cos(flowAngle);
      float sinFlow = sin(flowAngle);
      vec3 flowingSamplePos = vec3(
        samplePos.x * cosFlow - samplePos.z * sinFlow,
        samplePos.y,
        samplePos.x * sinFlow + samplePos.z * cosFlow
      );
      
      // Add multi-directional turbulent distortion to keep patterns organic
      // Use 3D turbulence to create complex, non-uniform flow
      vec3 turbulentFlow1 = vec3(
        turbulence3D(samplePos * 0.5 + vec3(slowTime * 0.1, 0.0, 0.0), 3),
        turbulence3D(samplePos * 0.5 + vec3(0.0, slowTime * 0.12, 0.0), 3),
        turbulence3D(samplePos * 0.5 + vec3(0.0, 0.0, slowTime * 0.08), 3)
      ) * 0.08;
      
      vec3 turbulentFlow2 = vec3(
        turbulence3D(samplePos * 0.8 + vec3(slowTime * 0.15, slowTime * 0.1, 0.0), 4),
        turbulence3D(samplePos * 0.8 + vec3(0.0, slowTime * 0.1, slowTime * 0.15), 4),
        turbulence3D(samplePos * 0.8 + vec3(slowTime * 0.1, 0.0, slowTime * 0.12), 4)
      ) * 0.05;
      
      // Add gentle circular eddies at different scales and speeds
      float eddyAngle1 = slowTime * 0.15 + flowSeed1 * 100.0;
      float eddyAngle2 = slowTime * 0.08 + flowSeed2 * 80.0;
      float eddyAngle3 = slowTime * 0.2 + flowSeed1 * 60.0;
      
      vec3 eddyOffset = vec3(
        sin(eddyAngle1) * 0.03 + cos(eddyAngle2) * 0.025 + sin(eddyAngle3 * 0.5) * 0.02,
        cos(eddyAngle1 * 0.7) * 0.015 + sin(eddyAngle2 * 0.8) * 0.02,
        cos(eddyAngle1) * 0.03 + sin(eddyAngle2) * 0.025 + cos(eddyAngle3 * 0.6) * 0.02
      );
      
      // Combine all flows for organic, multi-directional movement
      vec3 finalSamplePos = flowingSamplePos + turbulentFlow1 + turbulentFlow2 + eddyOffset;
      
      // Cloud scale varies per planet (1.5 - 3.0 range for larger features)
      float cloudScale = 1.5 + cloudScaleSeed * 1.5;
      
      // Generate multi-layered cloud patterns with dramatic features
      // Large-scale atmospheric base
      float largeFeatures = smoothNoise3D(finalSamplePos * cloudScale * 0.8, 4);
      
      // Medium-scale cloud structures
      float mediumClouds = smoothNoise3D(finalSamplePos * cloudScale * 1.5, 5);
      
      // Fine wispy details
      float fineClouds = smoothNoise3D(finalSamplePos * cloudScale * 3.0, 3);
      
      // Very subtle banding tendency
      float gentleBanding = smoothNoise3D(vec3(finalSamplePos.x * 0.5, finalSamplePos.y * 2.5, finalSamplePos.z * 0.5), 3);
      float bandingInfluence = (sin(v * 8.0 + gentleBanding * 0.3) * 0.5 + 0.5) * 0.15;
      
      // BRIGHT SWIRLING FEATURES (like Neptune's white streaks)
      // Create flowing turbulent regions with high brightness
      float swirl1 = turbulence3D(finalSamplePos * cloudScale * 1.8, 6);
      float swirl2 = turbulence3D(finalSamplePos * cloudScale * 2.3 + vec3(10.0, 5.0, 0.0), 5);
      
      // Create sharp, bright swirling patterns
      float brightSwirls = abs(swirl1 - 0.5) * 2.0; // 0 at 0.5, goes to 1.0 at extremes
      brightSwirls = pow(brightSwirls, 1.5); // Sharpen the contrast
      
      // Add secondary swirl layer with different scale
      float secondarySwirls = abs(swirl2 - 0.5) * 2.0;
      secondarySwirls = pow(secondarySwirls, 2.0);
      
      // Combine swirls
      float combinedSwirls = brightSwirls * 0.6 + secondarySwirls * 0.4;
      
      // Create threshold for bright features (only the brightest become visible)
      float brightFeatures = smoothstep(0.6, 0.85, combinedSwirls);
      
      // Add wispy streaks (elongated cloud formations)
      float streaks = turbulence3D(vec3(finalSamplePos.x * cloudScale * 3.5, finalSamplePos.y * cloudScale * 1.2, finalSamplePos.z * cloudScale * 3.5), 4);
      float brightStreaks = smoothstep(0.65, 0.8, streaks) * 0.7;
      
      // Storm cells - circular bright regions
      float storms = turbulence3D(finalSamplePos * cloudScale * 2.5, 5);
      float stormCells = smoothstep(0.7, 0.9, storms);
      
      // Combine base cloud pattern
      float cloudPattern = largeFeatures * 0.5 + mediumClouds * 0.35 + fineClouds * 0.15;
      cloudPattern = cloudPattern * 0.85 + bandingInfluence;
      
      // Add bright features on top
      float brightCloudFeatures = max(brightFeatures, max(brightStreaks, stormCells * 0.8));
      
      // Normalize to 0-1 range
      cloudPattern = clamp(cloudPattern, 0.0, 1.0);
      
      // Create dramatic color variations with bright features
      vec3 brightClouds = variedBaseColor * 1.25; // Brighter areas
      vec3 darkClouds = variedBaseColor * 0.75;   // Darker areas
      vec3 deepAtmosphere = variedBaseColor * 0.55; // Deep atmospheric regions
      vec3 brilliantWhite = vec3(1.8, 1.9, 2.0) * variedBaseColor; // Very bright white-blue clouds
      
      // Base color transitions
      vec3 cloudColor;
      if (cloudPattern < 0.4) {
        // Deep atmosphere
        float t = cloudPattern / 0.4;
        cloudColor = mix(deepAtmosphere, darkClouds, t);
      } else if (cloudPattern < 0.6) {
        // Mid-level clouds
        float t = (cloudPattern - 0.4) / 0.2;
        cloudColor = mix(darkClouds, variedBaseColor, t);
      } else {
        // Bright high-altitude clouds
        float t = (cloudPattern - 0.6) / 0.4;
        cloudColor = mix(variedBaseColor, brightClouds, t);
      }
      
      // Overlay bright swirling features (like Neptune's white streaks)
      if (brightCloudFeatures > 0.1) {
        // Mix in brilliant white clouds where swirls are present
        float brightMix = smoothstep(0.1, 0.8, brightCloudFeatures);
        cloudColor = mix(cloudColor, brilliantWhite, brightMix * 0.85);
      }
      
      // Add subtle color shifts in different regions
      float colorShift = smoothNoise3D(finalSamplePos * cloudScale * 0.5, 2);
      cloudColor *= vec3(
        1.0 + colorShift * 0.08,
        1.0 - colorShift * 0.05,
        1.0 + colorShift * 0.12
      );
      
      colorModulation = cloudColor;
      
      // Intensity variation with dramatic bright features
      float intensityVariation = smoothNoise3D(finalSamplePos * cloudScale * 2.0, 4);
      intensity = 0.9 + cloudPattern * 0.15 + intensityVariation * 0.08;
      
      // Boost intensity for bright features
      intensity += brightCloudFeatures * 0.4;
      
      // Keep the atmosphere natural with just the swirling cloud features
      // No artificial storm spots or polar vortices
      
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

