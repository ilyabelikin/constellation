// Stars and exotic stellar remnants: boiling photospheres, coronas,
// pulsar beams and black-hole accretion disks. Output is HDR so the bloom
// pass turns them into convincing light sources.

import * as THREE from "three";
import { NOISE_GLSL } from "../glsl";

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

const STAR_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
uniform float uSeed;
uniform float uSpots;
varying vec3 vObj;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
${NOISE_GLSL}
void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float mu = max(dot(N, V), 0.0);
  vec3 q = vObj * 3.0 + uSeed;
  float t = uTime * 0.02;
  vec2 cell = cellular(q * 4.0 + vec3(t, -t, t * 0.5));
  float gran = smoothstep(0.0, 0.9, cell.y - cell.x);
  float n = fbm(q * 1.5 + vec3(0.0, t, 0.0), 4) * 0.5 + 0.5;
  float spots = smoothstep(0.72, 0.8, fbm(q * 0.8 + 11.0 + t * 0.2, 3) * 0.5 + 0.5) * uSpots;
  float limb = 0.35 + 0.65 * pow(mu, 0.45);
  vec3 hot = mix(uColor, vec3(1.0), 0.35);
  vec3 c = mix(uColor * 0.8, hot, gran * 0.6 + n * 0.4);
  c *= limb * (1.0 - spots * 0.7);
  gl_FragColor = vec4(c * uIntensity, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createStarMaterial(color: THREE.Color, intensity: number, seed: number, spots = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: STAR_FRAG,
    uniforms: {
      uColor: { value: color.clone() },
      uTime: { value: 0 },
      uIntensity: { value: intensity },
      uSeed: { value: (seed % 1000) * 0.07 },
      uSpots: { value: spots },
    },
  });
}

// Billboard corona with slowly rotating streamers.
const CORONA_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 scale = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
  mv.xy += position.xy * scale;
  gl_Position = projectionMatrix * mv;
}
`;

const CORONA_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
uniform float uCore;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float ang = atan(vUv.y, vUv.x);
  float streak = fbm(vec3(cos(ang) * 2.0, sin(ang) * 2.0, uTime * 0.03), 4) * 0.5 + 0.5;
  float rays = pow(streak, 3.0) * 1.6;
  float fall = pow(max(0.0, 1.0 - r), 2.4);
  float core = smoothstep(uCore * 1.2, uCore * 0.9, r);
  float glow = fall * (0.55 + rays) + exp(-r * 9.0) * 1.2;
  float a = glow * (1.0 - core * 0.0);
  gl_FragColor = vec4(uColor * a * uIntensity, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createCoronaMaterial(color: THREE.Color, intensity: number, coreFraction: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: CORONA_VERT,
    fragmentShader: CORONA_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: color.clone() },
      uTime: { value: 0 },
      uIntensity: { value: intensity },
      uCore: { value: coreFraction },
    },
  });
}

// Black-hole accretion disk: hot inner edge, spiral turbulence, doppler beaming.
const DISK_VERT = /* glsl */ `
varying vec3 vLocal;
varying vec3 vWorldPos;
void main() {
  vLocal = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const DISK_FRAG = /* glsl */ `
uniform float uTime;
uniform float uInner;
uniform float uOuter;
uniform vec3 uHot;
uniform vec3 uCool;
uniform float uGain;
varying vec3 vLocal;
varying vec3 vWorldPos;
${NOISE_GLSL}
void main() {
  float r = length(vLocal.xy);
  float t = (r - uInner) / (uOuter - uInner);
  if (t < 0.0 || t > 1.0) discard;
  float ang = atan(vLocal.y, vLocal.x);
  float swirl = ang + 6.0 / (r * 0.5 + 0.3) - uTime * (1.2 / (0.4 + t));
  float n = fbm(vec3(cos(swirl) * 2.0, sin(swirl) * 2.0, t * 5.0), 5) * 0.5 + 0.5;
  float heat = pow(1.0 - t, 2.2);
  vec3 col = mix(uCool, uHot, heat) * (0.4 + n * 1.2);
  // Doppler beaming: the side rotating towards the viewer is brighter.
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 tangent = normalize(vec3(-vLocal.y, vLocal.x, 0.0));
  float beam = 1.0 + 0.6 * dot(tangent, normalize(vec3(V.x, V.z, V.y)));
  float a = smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.55, t) * (0.35 + n);
  gl_FragColor = vec4(col * beam * (0.45 + heat * 1.6) * uGain, a * min(1.0, uGain + 0.3));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createAccretionDiskMaterial(inner: number, outer: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: DISK_VERT,
    fragmentShader: DISK_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uInner: { value: inner },
      uOuter: { value: outer },
      uHot: { value: new THREE.Color(1.0, 0.85, 0.6) },
      uCool: { value: new THREE.Color(0.9, 0.3, 0.08) },
      uGain: { value: 1 },
    },
  });
}

// Pulsar beam: an additive cone fading along its length.
const BEAM_VERT = /* glsl */ `
varying float vAlong;
varying float vAround;
void main() {
  vAlong = uv.y;
  vAround = uv.x;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
varying float vAlong;
varying float vAround;
void main() {
  float fade = pow(1.0 - vAlong, 1.5);
  float flicker = 0.8 + 0.2 * sin(uTime * 30.0 + vAlong * 40.0);
  gl_FragColor = vec4(uColor * fade * flicker * 2.0, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createBeamMaterial(color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: color.clone() }, uTime: { value: 0 } },
  });
}
