import * as THREE from "three";

/**
 * Creates a shader material for asteroids with procedural craters and surface detail
 * Supports different compositions (water ice, metal, silica) and shapes
 */
export function createAsteroidMaterial(
  composition: "water" | "metal" | "silica",
  color: number,
  shape: "spherical" | "elliptical" | "rugged"
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color(color) },
      lightPosition: { value: new THREE.Vector3(0, 0, 0) },
      composition: {
        value:
          composition === "water" ? 0.0 : composition === "metal" ? 1.0 : 2.0,
      },
      shape: {
        value: shape === "spherical" ? 0.0 : shape === "elliptical" ? 1.0 : 2.0,
      },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 baseColor;
      uniform vec3 lightPosition;
      uniform float composition;
      uniform float shape;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      
      // Hash function for 2D (for craters)
      float hash2(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      
      // Hash function for 3D (for noise)
      float hash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
      }
      
      // 3D noise function
      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        
        return mix(
          mix(
            mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
            mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x),
            f.y
          ),
          mix(
            mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
            mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x),
            f.y
          ),
          f.z
        );
      }
      
      // Generate craters (adapted from planet shader)
      float craters(vec2 uv, float scale) {
        vec2 grid = floor(uv * scale);
        vec2 localUV = fract(uv * scale);
        
        float craterEffect = 0.0;
        
        // Check this cell and neighboring cells
        for(float y = -1.0; y <= 1.0; y++) {
          for(float x = -1.0; x <= 1.0; x++) {
            vec2 neighbor = grid + vec2(x, y);
            
            // Generate random position for crater in this cell
            vec2 craterPos = vec2(
              hash2(neighbor),
              hash2(neighbor + vec2(13.7, 27.3))
            );
            
            // Generate random size (smaller for asteroids)
            float craterSize = 0.15 + hash2(neighbor + vec2(50.1, 60.2)) * 0.25;
            
            // Calculate distance to crater center
            vec2 toCenter = (localUV - vec2(x, y)) - craterPos;
            float dist = length(toCenter);
            
            // Only create crater if random value is above threshold
            float shouldExist = hash2(neighbor + vec2(100.0, 200.0));
            if(shouldExist > 0.55) { // More craters on asteroids
              // Crater bowl with raised rim
              if(dist < craterSize) {
                float rimDist = abs(dist - craterSize * 0.85) / (craterSize * 0.15);
                float rimHeight = smoothstep(1.0, 0.0, rimDist) * 0.2;
                float bowlDepth = smoothstep(craterSize, 0.0, dist) * -0.3;
                craterEffect += bowlDepth + rimHeight;
              }
            }
          }
        }
        
        return craterEffect;
      }
      
      void main() {
        // Lighting
        vec3 lightDir = normalize(lightPosition - vWorldPosition);
        float diffuse = max(dot(vWorldNormal, lightDir), 0.0);
        
        // Ambient light (higher for asteroids so they're visible even in shadow)
        float ambient = 0.5;
        
        // Surface variation based on noise
        float n1 = noise(vPosition * 5.0);
        float n2 = noise(vPosition * 15.0);
        float surfaceVariation = n1 * 0.7 + n2 * 0.3;
        
        // Add craters for spherical and elliptical asteroids
        float craterIntensity = 0.0;
        if (shape < 1.5) { // spherical (0.0) or elliptical (1.0)
          // Calculate spherical UV coordinates for crater mapping
          vec3 norm = normalize(vPosition);
          float u = atan(norm.z, norm.x) / (2.0 * 3.14159) + 0.5;
          float v = asin(norm.y) / 3.14159 + 0.5;
          
          // Multiple layers of craters at different scales
          float largeCraters = craters(vec2(u, v), 6.0);
          float mediumCraters = craters(vec2(u, v), 12.0) * 0.7;
          float smallCraters = craters(vec2(u, v), 24.0) * 0.5;
          
          craterIntensity = largeCraters + mediumCraters + smallCraters;
        }
        
        // Material properties based on composition
        float roughness = 0.9; // Default (silica)
        float metallic = 0.1;
        float specular = 0.1;
        
        if (composition < 0.5) {
          // Water ice - smoother, more reflective
          roughness = 0.3;
          metallic = 0.0;
          specular = 0.5;
        } else if (composition < 1.5) {
          // Metal - very reflective
          roughness = 0.2;
          metallic = 0.8;
          specular = 0.9;
        }
        
        // Specular highlight
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        vec3 reflectDir = reflect(-lightDir, vWorldNormal);
        float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0 * (1.0 - roughness));
        vec3 specularColor = vec3(1.0) * spec * specular;
        
        // Combine lighting with crater intensity
        float lighting = ambient + diffuse * (1.0 - ambient);
        lighting += craterIntensity; // Add crater depth and height variations
        
        // Apply surface variation
        vec3 surfaceColor = baseColor * (0.8 + surfaceVariation * 0.4);
        
        // Mix in metallic reflections
        surfaceColor = mix(surfaceColor, surfaceColor * 1.5, metallic);
        
        vec3 finalColor = surfaceColor * lighting + specularColor;
        
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });
}
