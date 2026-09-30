// Assorted materials: tunnel gates, background sky, starfield points,
// soft glow sprites and animated tunnel links for the galaxy map.

import * as THREE from "three";
import { NOISE_GLSL } from "../glsl";

let glowTexture: THREE.Texture | null = null;

/** Soft radial gradient used for glows, engine flares and explosions. */
export function getGlowTexture(): THREE.Texture {
  if (glowTexture) return glowTexture;
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      const v = Math.max(0, 1 - r);
      const a = Math.pow(v, 2.2) * 0.85 + Math.exp(-r * 10) * 0.6;
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.min(255, a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  glowTexture = tex;
  return tex;
}

export function glowSprite(color: THREE.ColorRepresentation, scale: number, opacity = 1): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: getGlowTexture(),
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(scale);
  return s;
}

// ---------------------------------------------------------------------------
// Tunnel gate: a massive ring with a swirling wormhole membrane.

const GATE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const GATE_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uActive;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float ang = atan(vUv.y, vUv.x);
  float swirl = ang * 2.0 + 3.0 / (r + 0.15) - uTime * 1.5;
  float n = fbm(vec3(cos(swirl) * 1.5, sin(swirl) * 1.5, r * 3.0 + uTime * 0.2), 4) * 0.5 + 0.5;
  float core = exp(-r * 4.0);
  float edge = smoothstep(1.0, 0.85, r);
  vec3 c = mix(uColor * 0.4, vec3(1.0), core) * (0.4 + n * 1.3);
  float a = edge * (0.35 + n * 0.5 + core) * (0.5 + 0.5 * uActive);
  gl_FragColor = vec4(c * (1.2 + uActive), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createGateMaterial(color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: GATE_VERT,
    fragmentShader: GATE_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: color.clone() }, uActive: { value: 0 } },
  });
}

// ---------------------------------------------------------------------------
// Procedural sky sphere: faint galactic band + optional coloured nebula.

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uNebula;
uniform float uNebulaStrength;
uniform vec3 uBandTilt;
uniform float uSeed;
varying vec3 vDir;
${NOISE_GLSL}
void main() {
  vec3 d = normalize(vDir);
  float band = exp(-pow(dot(d, normalize(uBandTilt)) * 3.2, 2.0));
  float dust = fbm(d * 3.0 + uSeed, 5) * 0.5 + 0.5;
  float fine = fbm(d * 9.0 + uSeed * 2.0, 4) * 0.5 + 0.5;
  vec3 milky = vec3(0.55, 0.6, 0.85) * band * (0.25 + 0.5 * fine) * (0.6 + 0.4 * dust);
  milky *= 1.0 - smoothstep(0.55, 0.75, dust) * band * 0.8; // dark dust lanes
  float neb = pow(fbm(d * 1.6 + uSeed * 3.0, 6) * 0.5 + 0.5, 3.0) * 2.2;
  vec3 nebula = uNebula * neb * uNebulaStrength;
  vec3 c = milky * 0.08 + nebula * 0.22 + vec3(0.004, 0.005, 0.012);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createSkyMaterial(nebula: THREE.Color, strength: number, seed: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uNebula: { value: nebula.clone() },
      uNebulaStrength: { value: strength },
      uBandTilt: { value: new THREE.Vector3(0.3, 1, 0.2) },
      uSeed: { value: seed },
    },
  });
}

// ---------------------------------------------------------------------------
// Twinkling background stars (points with per-star colour & size).

const STARS_VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aPhase;
uniform float uTime;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vTw;
void main() {
  vColor = aColor;
  vTw = 0.75 + 0.25 * sin(uTime * (0.5 + aPhase) + aPhase * 20.0);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixelRatio;
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w * 0.99999;
}
`;

const STARS_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vTw;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = dot(c, c);
  if (r > 1.0) discard;
  float a = exp(-r * 4.0);
  gl_FragColor = vec4(vColor * a * vTw, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createStarfield(count: number, radius: number, seed = 1): THREE.Points {
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  const palette = [
    [1, 0.75, 0.6],
    [1, 0.9, 0.8],
    [1, 1, 1],
    [0.8, 0.88, 1],
    [0.65, 0.78, 1],
  ];
  for (let i = 0; i < count; i++) {
    // Concentrate some stars in a galactic band.
    let x = rnd() * 2 - 1;
    let y = rnd() * 2 - 1;
    let z = rnd() * 2 - 1;
    if (rnd() < 0.45) y *= 0.18;
    const l = Math.hypot(x, y, z) || 1;
    x /= l;
    y /= l;
    z /= l;
    pos.set([x * radius, y * radius, z * radius], i * 3);
    const c = palette[Math.floor(rnd() * palette.length)];
    const b = 0.35 + Math.pow(rnd(), 3) * 1.6;
    col.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
    size[i] = 1.2 + Math.pow(rnd(), 6) * 3.5;
    phase[i] = rnd();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  const m = new THREE.ShaderMaterial({
    vertexShader: STARS_VERT,
    fragmentShader: STARS_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    // globalThis, not window: tests import this under the server's Node-only types.
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: Math.min(2, (globalThis as { devicePixelRatio?: number }).devicePixelRatio || 1) } },
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = -10;
  return pts;
}

// ---------------------------------------------------------------------------
// Galaxy-map tunnel link: a flowing, glowing ribbon between two systems.

const LINK_VERT = /* glsl */ `
attribute float aT;
varying float vT;
void main() {
  vT = aT;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const LINK_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uOpacity;
uniform float uLength;
varying float vT;
void main() {
  float flow = 0.55 + 0.45 * sin((vT * uLength * 0.6) - uTime * 2.5);
  float ends = smoothstep(0.0, 0.08, vT) * smoothstep(1.0, 0.92, vT);
  gl_FragColor = vec4(uColor * (0.6 + flow * 0.8), uOpacity * ends * (0.5 + flow * 0.5));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createLinkMaterial(color: THREE.Color, opacity: number, length: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: LINK_VERT,
    fragmentShader: LINK_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: color.clone() },
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uLength: { value: length },
    },
  });
}
