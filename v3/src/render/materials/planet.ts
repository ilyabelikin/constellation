// Procedural planet surfaces, clouds and atmospheres. Everything is computed
// per-pixel from 3D noise in object space, so there are no texture seams and
// every world (seeded) looks unique.

import * as THREE from "three";
import { NOISE_GLSL } from "../glsl";
import type { PlanetVisual } from "../../sim/data/planets";

const STYLE_DEFINES: Record<PlanetVisual["style"], string> = {
  terrestrial: "STYLE_TERRESTRIAL",
  gas: "STYLE_GAS",
  lava: "STYLE_LAVA",
  rocky: "STYLE_ROCKY",
  crystal: "STYLE_CRYSTAL",
  shrouded: "STYLE_SHROUDED",
};

const VERT = /* glsl */ `
varying vec3 vObj;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
void main() {
  vObj = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SURFACE_FRAG = /* glsl */ `
uniform vec3 uColors[5];
uniform float uSeaLevel;
uniform float uIceCaps;
uniform vec3 uSeed;
uniform vec3 uLightPos;
uniform vec3 uLightColor;
uniform float uTime;
uniform vec3 uEmissive;
uniform float uCity;
uniform float uBump;
uniform float uDetail;
varying vec3 vObj;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
${NOISE_GLSL}

vec3 ramp(float t) {
  t = clamp(t, 0.0, 1.0) * 4.0;
  if (t < 1.0) return mix(uColors[0], uColors[1], t);
  if (t < 2.0) return mix(uColors[1], uColors[2], t - 1.0);
  if (t < 3.0) return mix(uColors[2], uColors[3], t - 2.0);
  return mix(uColors[3], uColors[4], t - 3.0);
}

vec3 perturb(vec3 pos, vec3 n, float h, float scale) {
  vec3 sx = dFdx(pos);
  vec3 sy = dFdy(pos);
  vec3 r1 = cross(sy, n);
  vec3 r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec2 dh = vec2(dFdx(h), dFdy(h)) * scale;
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * n - grad);
}

void main() {
  vec3 p = vObj;
  vec3 q = p + uSeed;
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uLightPos - vWorldPos);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 albedo;
  float height = 0.0;
  float spec = 0.0;
  vec3 emissive = vec3(0.0);
  float bumpScale = uBump;

#ifdef STYLE_TERRESTRIAL
  vec3 warp = vec3(fbm(q * 1.3, 3), fbm(q * 1.3 + 7.1, 3), fbm(q * 1.3 + 3.7, 3));
  float h = fbm(q * 1.6 + warp * 0.55, 6) * 0.5 + 0.5;
  float detail = fbm(q * 9.0, 3) * 0.5 + 0.5;
  float sea = mix(0.28, 0.72, uSeaLevel);
  if (h < sea) {
    float depth = (sea - h) / max(sea, 0.001);
    albedo = mix(uColors[1], uColors[0], smoothstep(0.0, 0.35, depth));
    spec = 1.0;
    height = sea;
  } else {
    float e = (h - sea) / max(1.0 - sea, 0.001);
    albedo = mix(uColors[2], uColors[3], smoothstep(0.05, 0.7, e + (detail - 0.5) * 0.35));
    albedo = mix(albedo, uColors[4] * 0.9, smoothstep(0.72, 0.95, e));
    albedo *= 0.85 + 0.3 * detail;
    height = h + detail * 0.04;
    // Thin coastal beaches
    albedo = mix(albedo, uColors[3] * 1.1, (1.0 - smoothstep(0.0, 0.025, e)) * 0.5);
  }
  float lat = abs(p.y) + fbm(q * 4.0, 3) * 0.08;
  float ice = smoothstep(uIceCaps, uIceCaps + 0.05, lat);
  albedo = mix(albedo, uColors[4], ice);
  spec *= 1.0 - ice;
  // City lights on the night side of inhabited worlds.
  if (uCity > 0.0 && h >= sea) {
    float c = smoothstep(0.62, 0.8, fbm(q * 14.0, 3) * 0.5 + 0.5) * smoothstep(0.0, 0.1, (h - sea));
    emissive += vec3(1.0, 0.75, 0.4) * c * uCity * 1.4;
  }
#endif

#ifdef STYLE_GAS
  float t = uTime * 0.004;
  float turb = fbm(vec3(q.x * 2.0 + t, q.y * 9.0, q.z * 2.0 - t), 5);
  float bands = p.y * 5.5 + turb * 0.9 + fbm(q * vec3(1.0, 3.0, 1.0), 2) * 0.6;
  float band = 0.5 + 0.5 * sin(bands * 3.14159);
  float fine = fbm(vec3(q.x * 4.0, q.y * 30.0, q.z * 4.0) + turb, 3) * 0.5 + 0.5;
  albedo = ramp(band * 0.75 + fine * 0.25);
  // A great storm
  vec3 stormCenter = normalize(vec3(sin(uSeed.x * 3.0), -0.35 + 0.2 * sin(uSeed.y), cos(uSeed.x * 3.0)));
  float sd = distance(p, stormCenter);
  float storm = 1.0 - smoothstep(0.08, 0.2, sd + fbm(q * 8.0, 2) * 0.05);
  albedo = mix(albedo, uColors[4], storm * 0.8);
  height = band * 0.2;
  bumpScale = 0.0;
  emissive += uEmissive * pow(1.0 - band, 3.0) * 0.8;
#endif

#ifdef STYLE_LAVA
  float crust = fbm(q * 2.5, 5) * 0.5 + 0.5;
  float cracks = ridged(q * 3.0 + vec3(0.0, uTime * 0.002, 0.0), 5);
  albedo = mix(uColors[0], uColors[3], crust);
  float glow = smoothstep(0.55, 0.85, cracks) * (0.6 + 0.4 * sin(uTime * 0.5 + crust * 10.0));
  float pools = smoothstep(0.62, 0.7, 1.0 - crust);
  emissive += uEmissive * (glow * 2.5 + pools * 3.0);
  albedo *= 1.0 - pools * 0.8;
  height = crust - glow * 0.3;
#endif

#ifdef STYLE_ROCKY
  float base = fbm(q * 2.0, 5) * 0.5 + 0.5;
  vec2 c1 = cellular(q * 5.0);
  vec2 c2 = cellular(q * 13.0 + 3.0);
  float crater1 = smoothstep(0.42, 0.18, c1.x) - smoothstep(0.5, 0.42, c1.x) * 0.6;
  float crater2 = smoothstep(0.35, 0.12, c2.x) * 0.5;
  height = base * 0.6 - crater1 * 0.25 - crater2 * 0.12;
  albedo = ramp(base * 0.8 + 0.1 + (fbm(q * 12.0, 2)) * 0.1);
  albedo *= 0.9 - crater1 * 0.15;
  float lat = abs(p.y) + fbm(q * 3.0, 2) * 0.1;
  albedo = mix(albedo, uColors[4], smoothstep(uIceCaps, uIceCaps + 0.06, lat));
#endif

#ifdef STYLE_CRYSTAL
  vec2 c = cellular(q * 4.0);
  float facet = c.y - c.x;
  float base = fbm(q * 3.0, 4) * 0.5 + 0.5;
  albedo = ramp(0.2 + base * 0.6);
  float edge = 1.0 - smoothstep(0.0, 0.06, facet);
  emissive += uEmissive * edge * (0.9 + 0.6 * sin(uTime * 0.8 + base * 20.0));
  height = c.x * 0.8;
  spec = 0.6;
#endif

#ifdef STYLE_SHROUDED
  float t = uTime * 0.01;
  vec3 wq = q + vec3(fbm(q * 2.0 + t, 3), 0.0, fbm(q * 2.0 - t, 3));
  float swirl = fbm(vec3(wq.x * 2.0, wq.y * 6.0, wq.z * 2.0), 6) * 0.5 + 0.5;
  albedo = ramp(0.25 + swirl * 0.7);
  height = swirl * 0.3;
  bumpScale *= 0.3;
#endif

  N = perturb(vWorldPos, N, height, bumpScale * uDetail);
  float ndl = dot(N, L);
  float diffuse = smoothstep(-0.05, 1.0, ndl);
  vec3 H = normalize(L + V);
  float specular = pow(max(dot(N, H), 0.0), 60.0) * spec * 0.6 * step(0.0, ndl);
  vec3 color = albedo * uLightColor * (diffuse * 1.15 + 0.015) + uLightColor * specular;
  // Night-side emissive only where it's dark.
  float night = 1.0 - smoothstep(-0.15, 0.2, ndl);
  #ifdef STYLE_TERRESTRIAL
    emissive *= night;
  #endif
  color += emissive;
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface PlanetMaterialOptions {
  visual: PlanetVisual;
  seed: number;
  city?: number;
}

function hexToVec(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

/** Small deterministic variation of the palette per planet. */
export function variedPalette(palette: string[], seed: number): THREE.Color[] {
  const rnd = (i: number) => {
    const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  return palette.map((hex, i) => {
    const c = hexToVec(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    c.setHSL((hsl.h + (rnd(i) - 0.5) * 0.06 + 1) % 1, Math.min(1, hsl.s * (0.85 + rnd(i + 9) * 0.3)), hsl.l * (0.9 + rnd(i + 17) * 0.2));
    return c;
  });
}

export function createPlanetMaterial(opts: PlanetMaterialOptions): THREE.ShaderMaterial {
  const { visual, seed } = opts;
  const colors = variedPalette(visual.palette, seed);
  const s = (seed % 1000) / 37.0;
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: SURFACE_FRAG,
    defines: { [STYLE_DEFINES[visual.style]]: "" },
    uniforms: {
      uColors: { value: colors },
      uSeaLevel: { value: visual.seaLevel },
      uIceCaps: { value: visual.iceCaps },
      uSeed: { value: new THREE.Vector3(s, s * 1.7, s * 0.3) },
      uLightPos: { value: new THREE.Vector3() },
      uLightColor: { value: new THREE.Color(1, 1, 1) },
      uTime: { value: 0 },
      uEmissive: { value: visual.emissive ? new THREE.Color(visual.emissive) : new THREE.Color(0, 0, 0) },
      uCity: { value: opts.city ?? 0 },
      uBump: { value: visual.bumpiness * 0.9 },
      uDetail: { value: 1 },
    },
  });
  return mat;
}

const CLOUD_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uCoverage;
uniform vec3 uSeed;
uniform vec3 uLightPos;
uniform vec3 uLightColor;
uniform float uTime;
varying vec3 vObj;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
${NOISE_GLSL}
void main() {
  vec3 q = vObj * 2.2 + uSeed;
  float t = uTime * 0.006;
  vec3 warp = vec3(fbm(q + t, 3), fbm(q + 4.0 - t, 3), fbm(q + 8.0, 3));
  float n = fbm(q * vec3(1.0, 2.2, 1.0) + warp * 0.9, 6) * 0.5 + 0.5;
  float thresh = 1.0 - uCoverage;
  float a = smoothstep(thresh - 0.08, thresh + 0.18, n) * 0.95;
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uLightPos - vWorldPos);
  float d = smoothstep(-0.1, 0.9, dot(N, L));
  gl_FragColor = vec4(uColor * uLightColor * (d * 1.1 + 0.02), a * (0.25 + 0.75 * smoothstep(-0.3, 0.2, dot(N, L))));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createCloudMaterial(visual: PlanetVisual, seed: number): THREE.ShaderMaterial {
  const s = (seed % 777) / 23.0;
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: CLOUD_FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color(visual.cloudColor) },
      uCoverage: { value: visual.clouds },
      uSeed: { value: new THREE.Vector3(s, s * 0.5, s * 1.3) },
      uLightPos: { value: new THREE.Vector3() },
      uLightColor: { value: new THREE.Color(1, 1, 1) },
      uTime: { value: 0 },
    },
  });
}

const ATMO_VERT = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const ATMO_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
uniform vec3 uLightPos;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(uLightPos - vWorldPos);
  float rim = 1.0 - max(dot(N, V), 0.0);
  float glow = pow(rim, 2.6);
  float lit = smoothstep(-0.35, 0.5, dot(N, L));
  // Forward scattering halo when looking towards the star.
  float forward = pow(max(dot(-V, L), 0.0), 8.0) * rim;
  vec3 c = uColor * (glow * lit * 1.6 + forward * 1.2) * uStrength;
  gl_FragColor = vec4(c, clamp(glow * lit * uStrength, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createAtmosphereMaterial(color: string, strength: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: ATMO_VERT,
    fragmentShader: ATMO_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uStrength: { value: strength },
      uLightPos: { value: new THREE.Vector3() },
    },
  });
}

const RING_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vLocal;
void main() {
  vUv = uv;
  vLocal = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const RING_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uInner;
uniform float uOuter;
uniform float uSeed;
uniform vec3 uLightPos;
uniform vec3 uPlanetPos;
uniform float uPlanetRadius;
varying vec3 vWorldPos;
varying vec3 vLocal;
float h(float x) { return fract(sin(x * 91.3458 + uSeed) * 47453.5453); }
float n1(float x) { float i = floor(x); float f = fract(x); return mix(h(i), h(i + 1.0), smoothstep(0.0, 1.0, f)); }
void main() {
  float r = length(vLocal.xy);
  float t = (r - uInner) / (uOuter - uInner);
  if (t < 0.0 || t > 1.0) discard;
  float bands = n1(t * 40.0) * 0.6 + n1(t * 120.0) * 0.3 + n1(t * 9.0) * 0.4;
  float gaps = smoothstep(0.08, 0.14, abs(t - 0.62)) * smoothstep(0.02, 0.05, abs(t - 0.25));
  float edge = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.9, t);
  float a = uOpacity * bands * gaps * edge;
  // Planet shadow on the ring.
  vec3 L = normalize(uLightPos - vWorldPos);
  vec3 toPlanet = uPlanetPos - vWorldPos;
  float along = dot(toPlanet, L);
  float perp = length(toPlanet - L * along);
  float shadow = (along > 0.0 && perp < uPlanetRadius) ? 0.15 : 1.0;
  vec3 col = uColor * (0.7 + 0.5 * n1(t * 60.0 + 3.0)) * shadow;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createRingMaterial(color: string, opacity: number, inner: number, outer: number, seed: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uInner: { value: inner },
      uOuter: { value: outer },
      uSeed: { value: (seed % 1000) * 0.13 },
      uLightPos: { value: new THREE.Vector3() },
      uPlanetPos: { value: new THREE.Vector3() },
      uPlanetRadius: { value: 1 },
    },
  });
}
