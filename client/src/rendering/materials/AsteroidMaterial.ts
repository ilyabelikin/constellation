import * as THREE from "three";

/**
 * Creates a shader material for asteroids/moons with procedural craters and surface detail.
 * Supports different compositions (water ice, metal, silica) and shapes
 * (spherical, elliptical, rugged, faceted, binary).
 */
export function createAsteroidMaterial(
  composition: "water" | "metal" | "silica",
  color: number,
  shape: "spherical" | "elliptical" | "rugged" | "faceted" | "binary",
  noiseSeed: number = 0
): THREE.ShaderMaterial {
  const shapeValue =
    shape === "spherical"
      ? 0.0
      : shape === "elliptical"
        ? 1.0
        : shape === "faceted"
          ? 3.0
          : shape === "binary"
            ? 4.0
            : 2.0; // rugged

  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color(color) },
      lightPosition: { value: new THREE.Vector3(0, 0, 0) },
      composition: {
        value:
          composition === "water" ? 0.0 : composition === "metal" ? 1.0 : 2.0,
      },
      shape: { value: shapeValue },
      noiseSeed: { value: noiseSeed },
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
      uniform float noiseSeed;
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
      
      // Generate craters (for spherical, elliptical, and binary shapes)
      float craters(vec2 uv, float scale) {
        vec2 grid = floor(uv * scale);
        vec2 localUV = fract(uv * scale);
        
        float craterEffect = 0.0;
        
        for(float y = -1.0; y <= 1.0; y++) {
          for(float x = -1.0; x <= 1.0; x++) {
            vec2 neighbor = grid + vec2(x, y);
            
            vec2 craterPos = vec2(
              hash2(neighbor),
              hash2(neighbor + vec2(13.7, 27.3))
            );
            
            float craterSize = 0.15 + hash2(neighbor + vec2(50.1, 60.2)) * 0.25;
            
            vec2 toCenter = (localUV - vec2(x, y)) - craterPos;
            float dist = length(toCenter);
            
            float shouldExist = hash2(neighbor + vec2(100.0, 200.0));
            if(shouldExist > 0.55) {
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
        
        float ambient = 0.5;
        
        // Seeded surface variation -- each body gets unique noise pattern
        vec3 seedOffset = vec3(noiseSeed * 1.37, noiseSeed * 2.51, noiseSeed * 0.73);
        float n1 = noise(vPosition * 5.0 + seedOffset);
        float n2 = noise(vPosition * 15.0 + seedOffset * 2.0);
        float surfaceVariation = n1 * 0.7 + n2 * 0.3;
        
        // Craters for spherical and elliptical shapes only
        // Binary shapes skip 2D UV craters to avoid seam artifacts from
        // spherical projection on non-spherical geometry
        float craterIntensity = 0.0;
        if (shape < 1.5) { // spherical(0), elliptical(1)
          vec3 norm = normalize(vPosition);
          float u = atan(norm.z, norm.x) / (2.0 * 3.14159) + 0.5;
          float v = asin(clamp(norm.y, -1.0, 1.0)) / 3.14159 + 0.5;
          
          // Offset crater UV by seed so each body has unique crater placement
          vec2 craterUV = vec2(u, v) + vec2(noiseSeed * 0.31, noiseSeed * 0.47);
          
          float largeCraters = craters(craterUV, 6.0);
          float mediumCraters = craters(craterUV, 12.0) * 0.7;
          float smallCraters = craters(craterUV, 24.0) * 0.5;
          
          craterIntensity = largeCraters + mediumCraters + smallCraters;
        }
        
        // Binary shapes get 3D position-based pitting (no UV seams)
        if (shape > 3.5) { // binary(4)
          float largePits = noise(vPosition * 6.0 + seedOffset);
          float medPits = noise(vPosition * 14.0 + seedOffset * 1.7);
          float smallPits = noise(vPosition * 30.0 + seedOffset * 2.3);
          // Threshold noise to create discrete crater-like pits
          float pits = smoothstep(0.55, 0.65, largePits) * -0.25
                     + smoothstep(0.50, 0.62, medPits) * -0.15
                     + smoothstep(0.52, 0.60, smallPits) * -0.08;
          // Raised rims around pits
          float rim = smoothstep(0.48, 0.55, largePits) * smoothstep(0.65, 0.58, largePits) * 0.12;
          craterIntensity = pits + rim;
        }
        
        // Faceted shapes: emphasize flat face edges with Fresnel-like darkening
        float facetEdge = 0.0;
        if (shape > 2.5 && shape < 3.5) { // faceted (3.0)
          float edgeDot = abs(dot(vNormal, normalize(vPosition)));
          facetEdge = pow(1.0 - edgeDot, 3.0) * 0.25;
        }
        
        // Material properties based on composition
        float roughness = 0.9;
        float metallic = 0.1;
        float specular = 0.1;
        
        if (composition < 0.5) {
          // Water ice
          roughness = 0.3;
          metallic = 0.0;
          specular = 0.5;
        } else if (composition < 1.5) {
          // Metal
          roughness = 0.2;
          metallic = 0.8;
          specular = 0.9;
        }
        
        // Faceted metallic bodies get extra sparkle
        if (shape > 2.5 && shape < 3.5 && composition > 0.5 && composition < 1.5) {
          specular = 1.0;
        }
        
        // Specular highlight
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        vec3 reflectDir = reflect(-lightDir, vWorldNormal);
        float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0 * (1.0 - roughness));
        vec3 specularColor = vec3(1.0) * spec * specular;
        
        // Combine lighting with crater intensity and facet edges
        float lighting = ambient + diffuse * (1.0 - ambient);
        lighting += craterIntensity;
        lighting -= facetEdge;
        
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
