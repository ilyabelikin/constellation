// Procedural "hard sci-fi" ship models. Each hull is assembled from simple
// primitives — spine trusses, habitat modules, fuel tanks, radiator panels,
// engine bells — so ships look plausible without any external assets.
// Geometry is merged per hull and cached; materials are shared.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export interface ShipModel {
  hull: THREE.BufferGeometry; // painted hull parts (empire-coloured stripes via vertex colours)
  radiators: THREE.BufferGeometry;
  engines: THREE.Vector3[]; // engine nozzle positions (for glow sprites), in model units
  length: number; // model length in model units (nose = +Z)
}

const cache = new Map<string, ShipModel>();

type Part = { geo: THREE.BufferGeometry; tint: number };

function colorize(geo: THREE.BufferGeometry, tint: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.getAttribute("position").count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c[i * 3] = tint;
    c[i * 3 + 1] = tint;
    c[i * 3 + 2] = tint;
  }
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  if (g.getAttribute("uv")) g.deleteAttribute("uv");
  return g;
}

function cyl(rTop: number, rBot: number, len: number, seg = 10): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, seg, 1);
  g.rotateX(Math.PI / 2); // axis along Z
  return g;
}

function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d);
}

function at(g: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry {
  g.translate(x, y, z);
  return g;
}

function bell(radius: number, len: number): THREE.BufferGeometry {
  // Engine nozzle: flared cone open at the back.
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push(new THREE.Vector2(radius * (0.35 + 0.65 * Math.pow(t, 0.7)), -len * t));
  }
  const g = new THREE.LatheGeometry(pts, 12);
  g.rotateX(Math.PI / 2);
  return g;
}

function truss(len: number, w: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const r = w * 0.08;
  for (const [x, y] of [
    [w, w],
    [-w, w],
    [w, -w],
    [-w, -w],
  ]) {
    parts.push(at(cyl(r, r, len, 5), x, y, 0));
  }
  const n = Math.max(2, Math.round(len / (w * 2.5)));
  for (let i = 0; i <= n; i++) {
    const z = -len / 2 + (len * i) / n;
    parts.push(at(box(w * 2, r * 1.5, r * 1.5), 0, w, z));
    parts.push(at(box(w * 2, r * 1.5, r * 1.5), 0, -w, z));
    parts.push(at(box(r * 1.5, w * 2, r * 1.5), w, 0, z));
    parts.push(at(box(r * 1.5, w * 2, r * 1.5), -w, 0, z));
  }
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)).map(stripUv))!;
}

function stripUv(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (g.getAttribute("uv")) g.deleteAttribute("uv");
  return g;
}

function radiatorPair(len: number, span: number, z: number, y = 0): THREE.BufferGeometry[] {
  // Thin, wide heat-radiator panels — the tell-tale look of realistic spacecraft.
  const t = 0.04;
  return [at(box(span, t, len), span / 2 + 0.25, y, z), at(box(span, t, len), -span / 2 - 0.25, y, z)];
}

function build(hull: string): ShipModel {
  const parts: Part[] = [];
  const rad: THREE.BufferGeometry[] = [];
  const engines: THREE.Vector3[] = [];
  const P = (geo: THREE.BufferGeometry, tint = 1) => parts.push({ geo, tint });
  let length = 4;

  switch (hull) {
    case "scout": {
      P(cyl(0.12, 0.45, 1.6), 1);
      P(at(cyl(0.45, 0.45, 1.4), 0, 0, -1.4), 0.9);
      P(at(new THREE.SphereGeometry(0.35, 10, 8), 0, 0.45, -1.2), 0.8); // sensor dome
      P(at(cyl(0.02, 0.02, 1.8, 4), 0, 0.2, 1.2), 0.6); // antenna
      P(at(bell(0.35, 0.6), 0, 0, -2.1), 0.5);
      rad.push(...radiatorPair(1.0, 0.9, -1.3));
      engines.push(new THREE.Vector3(0, 0, -2.8));
      length = 4;
      break;
    }
    case "corvette": {
      P(cyl(0.2, 0.55, 1.4), 1);
      P(at(box(1.1, 0.7, 2.2), 0, 0, -1.6), 0.9);
      P(at(box(0.3, 0.3, 1.2), 0.65, 0.15, -1.0), 0.7); // gun pods
      P(at(box(0.3, 0.3, 1.2), -0.65, 0.15, -1.0), 0.7);
      P(at(bell(0.3, 0.5), 0.3, 0, -2.9), 0.5);
      P(at(bell(0.3, 0.5), -0.3, 0, -2.9), 0.5);
      rad.push(...radiatorPair(1.2, 1.0, -1.8, 0.4));
      engines.push(new THREE.Vector3(0.3, 0, -3.4), new THREE.Vector3(-0.3, 0, -3.4));
      length = 4.6;
      break;
    }
    case "frigate": {
      P(cyl(0.3, 0.7, 1.6), 1);
      P(at(cyl(0.7, 0.7, 2.6, 12), 0, 0, -2.1), 0.95);
      P(at(truss(2.2, 0.35), 0, 0, -4.5), 0.6);
      P(at(cyl(0.55, 0.55, 1.2, 12), 0, 0, -6.1), 0.85); // reactor
      P(at(box(0.25, 0.25, 1.4), 0, 0.85, -1.4), 0.7); // turret spine
      P(at(new THREE.SphereGeometry(0.25, 8, 6), 0, 0.95, -0.6), 0.7);
      P(at(bell(0.5, 0.8), 0, 0, -6.8), 0.5);
      rad.push(...radiatorPair(1.8, 1.4, -4.5));
      engines.push(new THREE.Vector3(0, 0, -7.6));
      length = 8.4;
      break;
    }
    case "destroyer": {
      // Long spinal railgun with the ship built around it.
      P(at(box(0.35, 0.35, 5), 0, 0, 2.2), 0.7); // spinal barrel
      P(at(box(1.4, 1.0, 4), 0, 0, -1.2), 1);
      P(at(box(1.8, 0.5, 2.2), 0, -0.5, -1.8), 0.9);
      P(at(truss(3.5, 0.45), 0, 0, -5.0), 0.6);
      for (const s of [-1, 1]) P(at(cyl(0.45, 0.45, 2.4, 10), s * 1.05, 0, -5.0), 0.85); // tanks
      P(at(cyl(0.8, 0.8, 1.4, 12), 0, 0, -7.4), 0.85);
      for (const s of [-1, 1]) P(at(bell(0.5, 0.9), s * 0.5, 0, -8.1), 0.5);
      rad.push(...radiatorPair(2.8, 2.2, -5.0));
      engines.push(new THREE.Vector3(0.5, 0, -9), new THREE.Vector3(-0.5, 0, -9));
      length = 13;
      break;
    }
    case "cruiser": {
      P(cyl(0.6, 1.4, 2.4, 12), 1);
      P(at(cyl(1.4, 1.4, 5, 14), 0, 0, -3.7), 0.95);
      P(at(box(3.2, 0.5, 3.4), 0, 0, -3.2), 0.9); // wings with turrets
      for (const s of [-1, 1]) {
        P(at(new THREE.SphereGeometry(0.4, 8, 6), s * 1.3, 0.5, -2.2), 0.7);
        P(at(new THREE.SphereGeometry(0.4, 8, 6), s * 1.3, 0.5, -4.2), 0.7);
      }
      // Rotating habitat ring for crew gravity.
      const ring = new THREE.TorusGeometry(2.2, 0.22, 8, 28);
      P(at(ring, 0, 0, -6.8), 0.8);
      for (let i = 0; i < 4; i++) {
        const spoke = box(0.12, 4.4, 0.12);
        spoke.rotateZ((i * Math.PI) / 4);
        P(at(spoke, 0, 0, -6.8), 0.6);
      }
      P(at(truss(4, 0.6), 0, 0, -9.2), 0.6);
      P(at(cyl(1.1, 1.1, 1.8, 14), 0, 0, -12), 0.85);
      for (const [x, y] of [
        [0.6, 0.6],
        [-0.6, 0.6],
        [0.6, -0.6],
        [-0.6, -0.6],
      ])
        P(at(bell(0.45, 1.0), x, y, -12.9), 0.5);
      rad.push(...radiatorPair(3.4, 3.2, -9.3));
      engines.push(new THREE.Vector3(0.6, 0.6, -13.9), new THREE.Vector3(-0.6, 0.6, -13.9), new THREE.Vector3(0.6, -0.6, -13.9), new THREE.Vector3(-0.6, -0.6, -13.9));
      length = 17;
      break;
    }
    case "battleship": {
      P(at(box(2.2, 1.6, 6), 0, 0, 1.0), 1);
      P(at(cyl(0.3, 1.1, 1.6, 8), 0, 0, 4.8), 0.9);
      P(at(box(3.4, 2.2, 7), 0, 0, -4.8), 0.95);
      for (const s of [-1, 1]) {
        P(at(box(0.5, 0.5, 3.4), s * 0.8, 1.1, 1.5), 0.7); // main guns
        P(at(box(1.2, 0.8, 1.2), s * 0.8, 1.1, -0.4), 0.8);
        P(at(box(1.0, 1.2, 5.5), s * 2.1, 0, -4.8), 0.85); // armour sponsons
      }
      P(at(box(1.0, 1.4, 1.5), 0, 1.6, -3.0), 0.8); // bridge tower
      P(at(truss(5, 0.9), 0, 0, -10.8), 0.6);
      for (const s of [-1, 1]) for (const t of [-1, 1]) P(at(cyl(0.6, 0.6, 3.6, 10), s * 1.5, t * 1.5, -10.8), 0.85);
      P(at(cyl(1.6, 1.6, 2.4, 14), 0, 0, -14.4), 0.85);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        P(at(bell(0.55, 1.2), Math.cos(a) * 1.0, Math.sin(a) * 1.0, -15.6), 0.5);
        engines.push(new THREE.Vector3(Math.cos(a) * 1.0, Math.sin(a) * 1.0, -16.8));
      }
      rad.push(...radiatorPair(4.5, 4.5, -10.8, 0));
      rad.push(...radiatorPair(3.0, 3.0, -4.5, 1.2));
      length = 22;
      break;
    }
    case "titan": {
      P(at(box(0.9, 0.9, 12), 0, 0, 5.5), 0.7); // spinal lance
      P(at(cyl(1.2, 1.2, 1.2, 12), 0, 0, 11.2), 0.8);
      P(at(box(4.4, 3.0, 10), 0, 0, -1.5), 1);
      P(at(box(6.5, 1.0, 7), 0, 0, -2.5), 0.9);
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) P(at(box(0.9, 0.7, 1.4), s * 2.6, 1.0, 1.5 - i * 3), 0.75);
        P(at(box(1.4, 2.2, 8), s * 3.8, 0, -3), 0.85);
      }
      P(at(box(1.6, 2.0, 2.4), 0, 2.4, -4), 0.8);
      const ring = new THREE.TorusGeometry(4.2, 0.35, 10, 36);
      P(at(ring, 0, 0, -9.5), 0.8);
      for (let i = 0; i < 6; i++) {
        const spoke = box(0.2, 8.4, 0.2);
        spoke.rotateZ((i * Math.PI) / 6);
        P(at(spoke, 0, 0, -9.5), 0.6);
      }
      P(at(truss(8, 1.4), 0, 0, -15), 0.6);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        P(at(cyl(0.8, 0.8, 6, 10), Math.cos(a) * 2.3, Math.sin(a) * 2.3, -15), 0.85);
      }
      P(at(cyl(2.6, 2.6, 3, 16), 0, 0, -20.5), 0.85);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        P(at(bell(0.8, 1.6), Math.cos(a) * 1.7, Math.sin(a) * 1.7, -22), 0.5);
        engines.push(new THREE.Vector3(Math.cos(a) * 1.7, Math.sin(a) * 1.7, -23.6));
      }
      rad.push(...radiatorPair(7, 7, -15));
      rad.push(...radiatorPair(4, 5, -2.5, 1.8));
      length = 35;
      break;
    }
    case "constructor": {
      P(at(box(1.2, 1.2, 1.6), 0, 0, 1.0), 1);
      P(at(truss(3, 0.5), 0, 0, -1.3), 0.6);
      for (const s of [-1, 1]) {
        P(at(box(0.25, 0.25, 2.2), s * 1.1, 0.4, 1.4), 0.7); // manipulator arms
        P(at(new THREE.SphereGeometry(0.22, 8, 6), s * 1.1, 0.4, 2.6), 0.7);
      }
      P(at(box(2.2, 1.6, 1.6), 0, 0, -1.3), 0.9); // cargo container
      P(at(cyl(0.6, 0.6, 1, 10), 0, 0, -3.3), 0.85);
      P(at(bell(0.45, 0.8), 0, 0, -4.1), 0.5);
      rad.push(...radiatorPair(1.2, 1.2, -3.2));
      engines.push(new THREE.Vector3(0, 0, -4.9));
      length = 7;
      break;
    }
    case "colony": {
      P(cyl(0.4, 1.0, 1.4, 12), 1);
      // Big rotating habitat drum.
      P(at(cyl(1.8, 1.8, 3, 20), 0, 0, -2.4), 0.95);
      for (let i = 0; i < 3; i++) P(at(new THREE.TorusGeometry(1.85, 0.12, 6, 28), 0, 0, -1.2 - i * 1.2), 0.7);
      P(at(truss(4, 0.55), 0, 0, -6), 0.6);
      for (const s of [-1, 1]) P(at(cyl(0.7, 0.7, 3, 12), s * 1.35, 0, -6), 0.85);
      P(at(cyl(0.9, 0.9, 1.4, 12), 0, 0, -8.6), 0.85);
      for (const s of [-1, 1]) P(at(bell(0.5, 0.9), s * 0.45, 0, -9.3), 0.5);
      rad.push(...radiatorPair(2.6, 2.4, -6, 0.9));
      engines.push(new THREE.Vector3(0.45, 0, -10.2), new THREE.Vector3(-0.45, 0, -10.2));
      length = 12;
      break;
    }
    case "transport":
    default: {
      P(cyl(0.3, 0.8, 1.2, 10), 1);
      P(at(box(1.6, 1.2, 3.6), 0, 0, -2.2), 0.95);
      for (let i = 0; i < 3; i++) for (const s of [-1, 1]) P(at(box(0.5, 0.6, 0.9), s * 1.05, -0.2, -1.0 - i * 1.1), 0.7); // drop pods
      P(at(cyl(0.6, 0.6, 1.2, 10), 0, 0, -4.6), 0.85);
      P(at(bell(0.5, 0.8), 0, 0, -5.4), 0.5);
      rad.push(...radiatorPair(1.2, 1.2, -4.4, 0.7));
      engines.push(new THREE.Vector3(0, 0, -6.2));
      length = 7;
      break;
    }
  }

  const hullGeo = mergeGeometries(parts.map((p) => colorize(p.geo, p.tint)))!;
  hullGeo.computeVertexNormals();
  const radGeo = mergeGeometries(rad.map((r) => stripUv(r.index ? r.toNonIndexed() : r)))!;
  radGeo.computeVertexNormals();
  hullGeo.computeBoundingSphere();
  hullGeo.userData.shared = true;
  radGeo.userData.shared = true;
  return { hull: hullGeo, radiators: radGeo, engines, length };
}

export function shipModel(hull: string): ShipModel {
  let m = cache.get(hull);
  if (!m) {
    m = build(hull);
    cache.set(hull, m);
  }
  return m;
}

const hullMaterials = new Map<string, THREE.MeshStandardMaterial>();
let radiatorMaterial: THREE.MeshStandardMaterial | null = null;

/** Hull material tinted slightly towards the empire colour. */
export function hullMaterial(empireColor: string): THREE.MeshStandardMaterial {
  let m = hullMaterials.get(empireColor);
  if (!m) {
    const base = new THREE.Color("#c9ccd2").lerp(new THREE.Color(empireColor), 0.28);
    m = new THREE.MeshStandardMaterial({
      color: base,
      vertexColors: true,
      metalness: 0.55,
      roughness: 0.42,
      emissive: new THREE.Color(empireColor).multiplyScalar(0.06),
    });
    m.userData.shared = true;
    hullMaterials.set(empireColor, m);
  }
  return m;
}

export function radiatorMat(): THREE.MeshStandardMaterial {
  if (!radiatorMaterial) {
    radiatorMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#3a3f48"),
      metalness: 0.2,
      roughness: 0.6,
      emissive: new THREE.Color("#ff6a2a").multiplyScalar(0.18), // warm radiators glow faintly
      side: THREE.DoubleSide,
    });
  }
  radiatorMaterial.userData.shared = true;
  return radiatorMaterial;
}
