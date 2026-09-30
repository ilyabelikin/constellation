// Procedural ship models. Each hull is assembled from simple primitives, so
// ships look plausible without any external assets. Every species has its own
// design language (see SHIP_STYLES): Terran "hard sci-fi" trusses, radiators
// and engine bells; Vashari armoured wedges; Lumenari grown crystal; Kraal
// segmented bio-ships; Thalassi smooth manta hulls; Aurelian geometric frames.
// Geometry is merged per (style, hull) and cached; materials are shared.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { HULL_MAP } from "../sim/data/ships";

export type ShipStyle = "terran" | "vashari" | "lumenari" | "kraal" | "thalassi" | "aurelian";

export interface ShipStyleInfo {
  name: string;
  /** Engine glow for warships and for civilian craft. */
  engine: string;
  civilEngine: string;
  metalness: number;
  roughness: number;
  /** Base hull colour before the empire tint. */
  base: string;
  tint: number;
  emissive: number;
}

export const SHIP_STYLES: Record<ShipStyle, ShipStyleInfo> = {
  terran: { name: "Hard sci-fi trusses and radiators", engine: "#7fd0ff", civilEngine: "#ffd28a", metalness: 0.55, roughness: 0.42, base: "#c9ccd2", tint: 0.28, emissive: 0.06 },
  vashari: { name: "Armoured forge-wedges", engine: "#ff9d4a", civilEngine: "#ffb870", metalness: 0.7, roughness: 0.5, base: "#8a7f74", tint: 0.35, emissive: 0.05 },
  lumenari: { name: "Grown light-crystal", engine: "#d9b0ff", civilEngine: "#f0d8ff", metalness: 0.15, roughness: 0.12, base: "#dcd4ff", tint: 0.45, emissive: 0.35 },
  kraal: { name: "Segmented bio-carapace", engine: "#b6ff6a", civilEngine: "#d8ff9a", metalness: 0.1, roughness: 0.75, base: "#6b4a44", tint: 0.4, emissive: 0.04 },
  thalassi: { name: "Smooth tidal mantas", engine: "#6affe0", civilEngine: "#a8fff0", metalness: 0.35, roughness: 0.18, base: "#b8d8dc", tint: 0.35, emissive: 0.08 },
  aurelian: { name: "Geometric synod frames", engine: "#ffe27a", civilEngine: "#fff0b0", metalness: 0.95, roughness: 0.22, base: "#d8b25a", tint: 0.18, emissive: 0.05 },
};

/** Which design language a species builds in (raiders fly stolen Terran-pattern hulls). */
export function styleForSpecies(speciesId: string): ShipStyle {
  switch (speciesId) {
    case "vashari":
    case "lumenari":
    case "kraal":
    case "thalassi":
    case "aurelian":
      return speciesId;
    default:
      return "terran";
  }
}

export interface ShipModel {
  hull: THREE.BufferGeometry; // painted hull parts (empire-coloured stripes via vertex colours)
  radiators: THREE.BufferGeometry;
  engines: THREE.Vector3[]; // engine nozzle positions (for glow sprites), in model units
  length: number; // model length in model units (nose = +Z)
  /** Every separate part (hull pieces and radiators) before merging, for structural checks. */
  parts: THREE.BufferGeometry[];
  /** Gun muzzles (barrel tips), in model units; empty where the design has none marked. */
  guns: THREE.Vector3[];
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
    case "liner": {
      // Passenger liner: long streamlined hull with window bands and a spin ring.
      P(cyl(0.25, 0.75, 1.2, 12), 1);
      P(at(cyl(0.75, 0.75, 5, 14), 0, 0, -3.1), 0.95);
      for (let i = 0; i < 4; i++) P(at(new THREE.TorusGeometry(0.77, 0.05, 4, 20), 0, 0, -1.3 - i * 1.2), 1.6);
      P(at(new THREE.TorusGeometry(1.5, 0.16, 6, 28), 0, 0, -3.4), 0.8);
      for (let i = 0; i < 4; i++) {
        const spoke = box(0.12, 3.0, 0.12);
        spoke.rotateZ((i * Math.PI) / 4);
        P(at(spoke, 0, 0, -3.4), 0.6);
      }
      P(at(cyl(0.55, 0.55, 1.2, 12), 0, 0, -6.2), 0.85);
      P(at(bell(0.45, 0.8), 0, 0, -7.0), 0.5);
      rad.push(...radiatorPair(1.0, 1.0, -5.8, 0.7));
      engines.push(new THREE.Vector3(0, 0, -7.8));
      length = 9;
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

  for (const g of strutsFor([...parts.map((p) => p.geo), ...rad.filter((r) => r.getAttribute("position").count > 36 || new THREE.Box3().setFromBufferAttribute(r.getAttribute("position") as THREE.BufferAttribute).getSize(new THREE.Vector3()).length() > 0.01)], length)) parts.push({ geo: g, tint: 0.6 });
  const hullGeo = mergeGeometries(parts.map((p) => colorize(p.geo, p.tint)))!;
  hullGeo.computeVertexNormals();
  const radGeo = mergeGeometries(rad.map((r) => stripUv(r.index ? r.toNonIndexed() : r)))!;
  radGeo.computeVertexNormals();
  hullGeo.computeBoundingSphere();
  hullGeo.userData.shared = true;
  radGeo.userData.shared = true;
  return { hull: hullGeo, radiators: radGeo, engines, length, parts: [...parts.map((p) => p.geo), ...rad], guns: [] };
}

// ---------------------------------------------------------------------------
// Structural soundness: every part must be joined to the ship.

interface PartShape {
  tris: THREE.Triangle[];
  box: THREE.Box3;
  samples: THREE.Vector3[];
  mesh: THREE.Mesh;
}

const probeMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

function partShape(g: THREE.BufferGeometry): PartShape {
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const idx = g.index;
  const n = idx ? idx.count : pos.count;
  const v = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(i) : i);
  const tris: THREE.Triangle[] = [];
  for (let i = 0; i + 2 < n; i += 3) tris.push(new THREE.Triangle(v(i), v(i + 1), v(i + 2)));
  const samples: THREE.Vector3[] = [];
  const k = 3;
  for (const t of tris)
    for (let i = 0; i <= k; i++)
      for (let j = 0; j <= k - i; j++) {
        const a = i / k;
        const b = j / k;
        samples.push(new THREE.Vector3().addScaledVector(t.a, a).addScaledVector(t.b, b).addScaledVector(t.c, 1 - a - b));
      }
  return { tris, box: new THREE.Box3().setFromBufferAttribute(pos), samples, mesh: new THREE.Mesh(g, probeMaterial) };
}

const insideRay = new THREE.Raycaster();
const insideDir = new THREE.Vector3(0.577, 0.577, 0.577);

/** Does any part of `a` touch (within eps) or sit inside `b`? */
function touches(a: PartShape, b: PartShape, eps: number): boolean {
  const zone = b.box.clone().expandByScalar(eps);
  if (!zone.intersectsBox(a.box)) return false;
  const cp = new THREE.Vector3();
  const near = b.tris.filter((t) => zone.intersectsTriangle(t));
  let probes = 0;
  for (const p of a.samples) {
    if (!zone.containsPoint(p)) continue;
    for (const t of near) if (t.closestPointToPoint(p, cp).distanceToSquared(p) < eps * eps) return true;
    if (probes++ < 24) {
      insideRay.set(p, insideDir);
      if (insideRay.intersectObject(b.mesh, false).length % 2 === 1) return true;
    }
  }
  return false;
}

/** Groups of parts joined to one another; the largest (by part count) first. */
export function partGroups(geos: THREE.BufferGeometry[], length: number, shapes = geos.map(partShape)): number[][] {
  const eps = length * 0.012;
  const parent = shapes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < shapes.length; i++)
    for (let j = i + 1; j < shapes.length; j++) if (find(i) !== find(j) && (touches(shapes[i], shapes[j], eps) || touches(shapes[j], shapes[i], eps))) parent[find(i)] = find(j);
  const groups = new Map<number, number[]>();
  shapes.forEach((_, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  });
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

/**
 * Join any part that floats free of the ship with a strut across the
 * shortest gap, so every design is structurally sound whatever its builder
 * did. Returns the struts to add.
 */
function strutsFor(geos: THREE.BufferGeometry[], length: number): THREE.BufferGeometry[] {
  const shapes = geos.map(partShape);
  const groups = partGroups(geos, length, shapes);
  if (groups.length < 2) return [];
  const struts: THREE.BufferGeometry[] = [];
  const main = new Set(groups[0]);
  for (const group of groups.slice(1)) {
    // Closest pair of surface points between this group and the ship so far.
    let best = Infinity;
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    const size = new THREE.Vector3();
    const gbox = new THREE.Box3();
    for (const i of group) gbox.union(shapes[i].box);
    for (const i of group)
      for (const p of shapes[i].samples)
        for (const j of main) {
          if (shapes[j].box.distanceToPoint(p) ** 2 >= best) continue;
          for (const q of shapes[j].samples) {
            const d = p.distanceToSquared(q);
            if (d < best) {
              best = d;
              from.copy(p);
              to.copy(q);
            }
          }
        }
    gbox.getSize(size);
    const r = Math.max(length * 0.008, Math.min(length * 0.03, Math.min(size.x, size.y, size.z) * 0.18));
    const dir = to.clone().sub(from);
    const len = dir.length() + r * 2;
    const strut = new THREE.CylinderGeometry(r, r, len, 6, 1);
    strut.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.lengthSq() > 1e-9 ? dir.normalize() : new THREE.Vector3(0, 0, 1)));
    const mid = from.clone().add(to).multiplyScalar(0.5);
    strut.translate(mid.x, mid.y, mid.z);
    struts.push(strut);
    for (const i of group) main.add(i);
  }
  return struts;
}

export function shipModel(hull: string, style: ShipStyle = "terran"): ShipModel {
  const key = `${style}:${hull}`;
  let m = cache.get(key);
  if (!m) {
    m = style === "terran" ? build(hull) : buildStyled(hull, style);
    cache.set(key, m);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Species design languages. Each builds any hull from its size class and role.

/** Size class of each hull (0 small … 5 titan). */
const TIER: Record<string, number> = { scout: 0, corvette: 0, frigate: 1, constructor: 1, transport: 1, freighter: 1, tender: 1, destroyer: 2, colony: 2, liner: 2, cruiser: 3, battleship: 4, titan: 5 };

/**
 * Per-hull proportions (width, height, length) laid over a species' design,
 * so hulls sharing a size class still read differently: scouts are slim
 * needles, destroyers long knives, battleships broad slabs.
 */
const PROPORTION = new Map<string, [number, number, number]>([
  ["scout", [0.6, 0.75, 1.2]],
  ["corvette", [0.95, 0.9, 0.85]],
  ["frigate", [0.9, 0.95, 1.1]],
  ["destroyer", [0.75, 0.85, 1.4]],
  ["cruiser", [1.1, 1.05, 1.05]],
  ["battleship", [1.25, 1.2, 1.0]],
  ["titan", [1.1, 1.1, 1.2]],
  ["constructor", [1.15, 1.1, 0.85]],
  ["transport", [1.2, 1.0, 0.9]],
  ["freighter", [1.1, 1.15, 1.0]],
  ["tender", [1.0, 1.1, 1.0]],
]);

/** Finds points on a hull's surface by casting rays at it. */
interface Probe {
  /** Hull surface hit by a ray from `from` travelling along `dir`, or null. */
  hit(from: THREE.Vector3, dir: THREE.Vector3): THREE.Vector3 | null;
}

function makeProbe(parts: THREE.BufferGeometry[]): Probe {
  const geo = mergeGeometries(parts.map((g) => stripUv(g.index ? g.toNonIndexed() : g.clone())).map((g) => (g.getAttribute("color") ? (g.deleteAttribute("color"), g) : g)))!;
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster();
  return {
    hit(from, dir) {
      ray.set(from, dir.clone().normalize());
      const h = ray.intersectObject(mesh, false)[0];
      return h ? h.point.clone() : null;
    },
  };
}

/**
 * Parts every species fits to a hull of this type, in its own palette: the
 * weapons, masts and cargo that tell hulls apart. Each part is mounted on the
 * hull's actual surface (found by probing it), with a pylon where it stands
 * off, so nothing floats free of the ship.
 */
function hullSignature(b: Builder, hull: string, box3: THREE.Box3, probe: Probe, style: Exclude<ShipStyle, "terran">): void {
  const W = (box3.max.x - box3.min.x) / 2;
  const H = (box3.max.y - box3.min.y) / 2;
  const L = box3.max.z - box3.min.z;
  const cy = (box3.max.y + box3.min.y) / 2;
  const nose = box3.max.z;
  const s = Math.max(0.2, Math.min(W, H * 1.6));
  const far = L + W + H + 10;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  /** Hull surface straight above (up = 1) or below (up = -1) the point (x, z); tries the centre line if off the hull. */
  const deck = (x: number, z: number, up = 1): { x: number; y: number } | null => {
    for (const px of [x, x * 0.5, 0]) {
      const h = probe.hit(V(px, cy + up * far, z), V(0, -up, 0));
      if (h) return { x: px, y: h.y };
    }
    return null;
  };
  /** Hull surface seen from the side (sx = ±1) at height y and position z. */
  const flank = (sx: number, y: number, z: number): number | null => probe.hit(V(sx * far, y, z), V(-sx, 0, 0))?.x ?? null;
  /** The frontmost hull surface along the line (x, y). */
  const prow = (x: number, y: number): number | null => probe.hit(V(x, y, nose + far), V(0, 0, -1))?.z ?? null;
  // Sink mounts slightly into the hull so their bases never show a gap.
  const sink = s * 0.06;

  /** A flank plate (armour belt, hangar bay) shaped in the species' idiom. */
  const plate = (w: number, h: number, l: number): THREE.BufferGeometry => {
    switch (style) {
      case "lumenari":
        return new THREE.OctahedronGeometry(1, 0).scale(w * 0.6, h * 0.55, l * 0.55); // a long crystal facet
      case "kraal":
        return ellipsoid(w * 0.6, h * 0.5, l * 0.5, 10); // a carapace ridge
      case "thalassi":
        return ellipsoid(w * 0.5, h * 0.45, l * 0.52, 14); // a smooth fairing
      default:
        return box(w, h, l);
    }
  };
  // Each species arms its ships in its own idiom; turrets sit on the hull's real surface.
  const turret = (x: number, z: number, size: number, barrels: number, up = 1) => {
    // Streamlined Thalassi ships carry their weapons in pairs off the centre line, like fins.
    if (style === "thalassi" && Math.abs(x) < 1e-6 && up === 1) {
      for (const sx of [-1, 1]) mount(sx * W * 0.32, z, size * 0.8, Math.max(1, barrels - 1), up);
      return;
    }
    mount(x, z, size, barrels, up);
  };
  const mount = (x: number, z: number, size0: number, barrels: number, up: number) => {
    const size = size0 * 1.3;
    const d = deck(x, z, up);
    if (!d) return;
    const y = d.y - up * sink;
    const spread = (i: number) => (i - (barrels - 1) / 2) * size * 0.32;
    switch (style) {
      case "vashari": {
        // Armoured casemate: a squat slab with thick square barrels.
        b.P(at(box(size * 1.1, size * 0.4, size * 0.9), d.x, y + up * size * 0.2, z), 0.7);
        b.P(at(box(size * 0.8, size * 0.12, size * 0.5), d.x, y + up * size * 0.45, z - size * 0.1), 1.3);
        for (let i = 0; i < barrels; i++) {
          b.P(at(box(size * 0.16, size * 0.16, size * 1.2), d.x + spread(i), y + up * size * 0.22, z + size * 0.95), 0.55);
          b.gun?.(d.x + spread(i), y + up * size * 0.22, z + size * 1.55);
        }
        break;
      }
      case "lumenari": {
        // Crystal emitters: a faceted focus on a short stem, prongs for extra beams.
        b.P(at(cyl(size * 0.08, size * 0.12, size * 0.35, 5).rotateX(Math.PI / 2), d.x, y + up * size * 0.17, z), 0.8);
        b.P(at(new THREE.OctahedronGeometry(size * 0.38, 0).scale(1, 0.8, 1.4), d.x, y + up * size * 0.5, z), 1.35);
        for (let i = 0; i < barrels; i++) {
          b.P(at(cone(size * 0.07, size * 0.9, 4), d.x + spread(i), y + up * size * 0.5, z + size * 0.7), 1.2);
          b.gun?.(d.x + spread(i), y + up * size * 0.5, z + size * 1.15);
        }
        break;
      }
      case "kraal": {
        // Living weapons: a swollen blister bristling with bone spines.
        b.P(at(ellipsoid(size * 0.55, size * 0.4, size * 0.6, 10), d.x, y + up * size * 0.15, z), 0.85);
        for (let i = 0; i < barrels; i++) {
          b.P(at(rot(cone(size * 0.1, size * 1.1, 6), up * -0.25, 0, 0), d.x + spread(i), y + up * size * 0.35, z + size * 0.7), 0.65);
          b.gun?.(d.x + spread(i), y + up * size * 0.48, z + size * 1.25);
        }
        break;
      }
      case "thalassi": {
        // Smooth low dome with slim, flush barrels.
        b.P(at(ellipsoid(size * 0.5, size * 0.28, size * 0.55, 14), d.x, y, z), 1.15);
        for (let i = 0; i < barrels; i++) {
          b.P(at(cyl(size * 0.05, size * 0.07, size * 1.1, 8), d.x + spread(i) * 0.8, y + up * size * 0.12, z + size * 0.75), 0.75);
          b.gun?.(d.x + spread(i) * 0.8, y + up * size * 0.12, z + size * 1.3);
        }
        break;
      }
      case "aurelian": {
        // Industrial gun mount: a post, a boxy breech and long rails with a collar.
        b.P(at(box(size * 0.15, size * 0.45, size * 0.15), d.x, y + up * size * 0.22, z), 0.6);
        b.P(at(box(size * 0.6, size * 0.35, size * 0.6), d.x, y + up * size * 0.55, z), 0.8);
        for (let i = 0; i < barrels; i++) {
          b.P(at(box(size * 0.07, size * 0.07, size * 1.6), d.x + spread(i), y + up * size * 0.55, z + size * 1.05), 0.55);
          b.P(at(new THREE.TorusGeometry(size * 0.1, size * 0.03, 4, 8), d.x + spread(i), y + up * size * 0.55, z + size * 1.5), 0.9);
          b.gun?.(d.x + spread(i), y + up * size * 0.55, z + size * 1.85);
        }
        break;
      }
    }
  };
  /** A pod along the flank at (y, z), on a pylon reaching back to the hull. */
  const sidePod = (sx: number, y: number, z: number, geo: () => THREE.BufferGeometry, halfWidth: number, standOff: number, tint: number) => {
    const surf = flank(sx, y, z) ?? flank(sx, cy, z);
    if (surf === null) return;
    const px = surf + sx * (halfWidth + standOff);
    b.P(at(geo(), px, y, z), tint);
    if (standOff > 0) b.P(at(box(standOff + halfWidth + sink * 2, s * 0.08, s * 0.25), (surf + px) / 2 - sx * sink, y, z), 0.6);
  };
  /** Something sticking out of the prow along the centre line (a mast, a gun barrel). */
  const fromProw = (y: number, len: number, rBase: number, rTip: number, tint: number): number => {
    const front = prow(0, y) ?? prow(0, cy) ?? nose;
    b.P(at(cyl(rTip, rBase, len, 8), 0, y, front - sink + len / 2), tint);
    return front - sink + len;
  };

  switch (hull) {
    case "scout": {
      // Long sensor mast with a dish: an unarmed eye.
      const tip = fromProw(cy, L * 0.4, s * 0.07, s * 0.04, 0.7);
      b.P(at(new THREE.SphereGeometry(s * 0.16, 10, 8), 0, cy, tip), 1.3);
      const d = deck(0, -L * 0.05);
      if (d) {
        b.P(at(cyl(s * 0.03, s * 0.03, s * 0.4, 5).rotateX(Math.PI / 2), 0, d.y + s * 0.15, -L * 0.05), 0.7);
        b.P(at(cyl(s * 0.45, s * 0.05, s * 0.18, 16), 0, d.y + s * 0.35, -L * 0.05), 1.2);
      }
      break;
    }
    case "corvette":
      turret(0, nose - L * 0.3, s * 0.5, 1);
      break;
    case "frigate":
      // Twin gun pods on pylons along the flanks.
      for (const sx of [-1, 1]) {
        const r = s * 0.15;
        sidePod(sx, cy, nose - L * 0.35, () => cyl(r * 0.9, r, L * 0.5, 8), r, s * 0.05, 0.75);
        const surf = flank(sx, cy, nose - L * 0.35) ?? W;
        b.P(at(cyl(s * 0.05, s * 0.05, L * 0.2, 6), surf + sx * (r + s * 0.05), cy, nose - L * 0.35 + L * 0.34), 0.55);
      }
      turret(0, -L * 0.05, s * 0.4, 1);
      break;
    case "destroyer": {
      // Spinal gun running out of the prow, with a dorsal fin.
      const muzzle = fromProw(cy, L * 0.3, s * 0.12, s * 0.09, 0.6);
      b.P(at(cyl(s * 0.14, s * 0.14, L * 0.05, 8), 0, cy, muzzle), 0.8);
      const d = deck(0, -L * 0.2);
      if (d) b.P(at(box(s * 0.08, H * 0.7, L * 0.3), 0, d.y + H * 0.35 - sink, -L * 0.2), 0.8);
      turret(0, nose - L * 0.45, s * 0.38, 2);
      break;
    }
    case "cruiser":
      turret(0, nose - L * 0.3, s * 0.45, 2);
      turret(0, nose - L * 0.55, s * 0.45, 2);
      turret(0, nose - L * 0.4, s * 0.4, 2, -1);
      for (const sx of [-1, 1]) sidePod(sx, cy, -L * 0.1, () => plate(s * 0.12, Math.min(H * 0.6, s * 0.45), L * 0.3), s * 0.06 - sink, 0, 0.65); // hangar bays
      break;
    case "battleship":
      for (let i = 0; i < 3; i++) turret(0, nose - L * (0.25 + i * 0.2), s * 0.42, 3);
      for (const sx of [-1, 1]) sidePod(sx, cy, -L * 0.05, () => plate(s * 0.1, Math.min(H * 0.7, s * 0.5), L * 0.55), s * 0.05 - sink, 0, 0.6); // armour belts
      break;
    case "titan": {
      // A spinal lance with its emitter ring.
      const tip = fromProw(cy, L * 0.35, s * 0.18, s * 0.14, 0.55);
      b.P(at(new THREE.TorusGeometry(s * 0.45, s * 0.07, 8, 24), 0, cy, tip), 1.4);
      for (const sx of [-1, 1]) b.P(at(box(s * 0.05, s * 0.45, s * 0.05), 0, cy + sx * s * 0.25, tip), 0.6); // ring supports
      for (let i = 0; i < 4; i++) turret((i % 2 ? 1 : -1) * W * 0.45, nose - L * (0.3 + i * 0.12), s * 0.35, 2);
      break;
    }
    case "constructor": {
      // Crane arms reaching ahead from the prow.
      const front = prow(0, cy) ?? nose;
      for (const sx of [-1, 1]) {
        const base = V(sx * W * 0.35, cy, front - L * 0.12);
        const len = L * 0.4;
        const arm = rot(box(s * 0.08, s * 0.08, len), 0, -sx * 0.3, 0);
        const dir = V(Math.sin(-sx * 0.3), 0, Math.cos(-sx * 0.3));
        b.P(at(arm, base.x + (dir.x * len) / 2, base.y, base.z + (dir.z * len) / 2), 0.7);
        b.P(at(box(s * 0.2, s * 0.2, s * 0.2), base.x + dir.x * len, base.y, base.z + dir.z * len), 1.25);
      }
      break;
    }
    case "transport":
      for (const sx of [-1, 1]) for (const z of [0.15, -0.2]) sidePod(sx, cy - H * 0.2, z * L, () => box(s * 0.35, s * 0.3, L * 0.22), s * 0.175, s * 0.04, 0.8); // drop pods
      break;
    case "freighter":
      for (let i = 0; i < 3; i++) {
        const z = nose - L * (0.3 + i * 0.17);
        const d = deck(0, z);
        if (!d) continue;
        const h = Math.min(H * 0.55, s * 0.6);
        b.P(at(box(W * 0.8, h, L * 0.14), 0, d.y + h / 2 - sink, z), [0.75, 1.1, 0.9][i]); // containers
      }
      break;
    case "tender":
      for (const sx of [-1, 1]) sidePod(sx, cy, -L * 0.05, () => new THREE.SphereGeometry(s * 0.35, 12, 8), s * 0.35, s * 0.05, 1.1); // fuel and munitions tanks
      break;
  }
}

interface Builder {
  P(geo: THREE.BufferGeometry, tint?: number): void;
  R(geo: THREE.BufferGeometry): void;
  engine(x: number, y: number, z: number): void;
  /** Marks a gun muzzle (barrel tip). */
  gun?(x: number, y: number, z: number): void;
}

function ellipsoid(rx: number, ry: number, rz: number, seg = 14): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.6)));
  g.scale(rx, ry, rz);
  return g;
}

function cone(r: number, len: number, seg = 8): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, len, seg);
  g.rotateX(Math.PI / 2); // tip towards +Z
  return g;
}

function rot(g: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry {
  if (x) g.rotateX(x);
  if (y) g.rotateY(y);
  if (z) g.rotateZ(z);
  return g;
}

function vashari(b: Builder, t: number, role: string): number {
  // Armoured wedge: triangular prism hull, pyramid prow, slanted side plates, big square drives.
  const L = 6 + t * 3.2;
  const W = 1.3 + t * 0.55;
  const prism = new THREE.CylinderGeometry(W, W, L, 3, 1);
  prism.rotateX(Math.PI / 2);
  prism.rotateZ(Math.PI); // flat keel underneath
  prism.scale(1, 0.55, 1);
  b.P(prism, 1);
  const prow = new THREE.ConeGeometry(W * 0.9, L * 0.35, 4);
  prow.rotateX(Math.PI / 2);
  prow.rotateZ(Math.PI / 4);
  prow.scale(1, 0.5, 1);
  b.P(at(prow, 0, -0.05 * W, L / 2 + L * 0.17), 0.9);
  const plates = 2 + t;
  for (let i = 0; i < plates; i++) {
    const z = L / 2 - (i + 0.6) * (L / plates);
    for (const sx of [-1, 1]) b.P(at(rot(box(W * 0.12, W * 0.55, L / plates * 0.85), 0, 0, sx * 0.5), sx * W * 0.78, W * 0.05, z), 0.7);
  }
  b.P(at(box(W * 0.12, W * 0.55, L * 0.5), 0, W * 0.45, -L * 0.1), 0.8); // dorsal fin
  if (role === "military") for (let i = 0; i <= t; i++) b.P(at(box(W * 0.35, W * 0.2, W * 0.5), 0, W * 0.45, L * 0.3 - i * (L / (t + 2))), 0.6);
  if (role === "colony" || role === "civilian") b.P(at(box(W * 1.4, W * 0.7, L * 0.35), 0, W * 0.2, -L * 0.1), 0.95);
  if (role === "transport") for (const sx of [-1, 1]) b.P(at(box(W * 0.4, W * 0.4, L * 0.5), sx * W * 1.05, -W * 0.15, 0), 0.75);
  const drives = t >= 3 ? 4 : 2;
  for (let i = 0; i < drives; i++) {
    const x = (i - (drives - 1) / 2) * W * 0.55;
    b.P(at(box(W * 0.45, W * 0.45, L * 0.18), x, 0, -L / 2 - L * 0.06), 0.65);
    b.P(at(bell(W * 0.2, W * 0.35), x, 0, -L / 2 - L * 0.15), 0.5);
    b.engine(x, 0, -L / 2 - L * 0.15 - W * 0.35);
  }
  return L * 1.35;
}

function lumenari(b: Builder, t: number, role: string): number {
  // Grown crystal: a long central spindle with shards arranged around it.
  const L = 5 + t * 3;
  const W = 0.9 + t * 0.35;
  const core = new THREE.OctahedronGeometry(1, 0);
  core.scale(W, W, L / 2);
  b.P(core, 1.2);
  const shards = role === "military" ? 3 + t : 2 + Math.min(t, 2);
  for (let i = 0; i < shards; i++) {
    const a = (i / shards) * Math.PI * 2;
    const r = W * (1.15 + (i % 2) * 0.3);
    const len = L * (0.45 + (i % 3) * 0.08);
    const sh = new THREE.OctahedronGeometry(1, 0);
    sh.scale(W * 0.32, W * 0.32, len / 2);
    b.P(at(sh, Math.cos(a) * r, Math.sin(a) * r, -L * 0.08 + (i % 2) * L * 0.06), 1.4);
    b.engine(Math.cos(a) * r, Math.sin(a) * r, -L * 0.08 - len / 2);
  }
  if (t >= 3) {
    const halo = new THREE.TorusGeometry(W * 2, W * 0.06, 4, 24);
    b.P(at(halo, 0, 0, -L * 0.05), 1.6);
  }
  if (role === "colony" || role === "civilian") b.P(at(new THREE.IcosahedronGeometry(W * 1.1, 0), 0, 0, -L * 0.1), 1.3);
  if (role === "constructor") for (const sx of [-1, 1]) b.P(at(rot(cone(W * 0.15, L * 0.4, 4), 0, sx * 0.3, 0), sx * W * 0.8, 0, L * 0.35), 1.2);
  b.engine(0, 0, -L / 2);
  return L * 1.05;
}

function kraal(b: Builder, t: number, role: string): number {
  // Bio-ship: a chain of carapace segments, mandibles at the prow, spines on the back.
  const segs = 3 + Math.min(t, 3);
  const R = 0.8 + t * 0.32;
  let z = 0;
  const zs: number[] = [];
  for (let i = 0; i < segs; i++) {
    const r = R * (i === 0 ? 0.85 : 1.05 - (i / segs) * 0.45);
    const len = r * 1.6;
    b.P(at(ellipsoid(r * (role === "transport" || role === "colony" ? 1.25 : 1), r * 0.8, len), 0, 0, z - len), 0.9 + (i % 2) * 0.15);
    zs.push(z - len);
    if (i > 0 && role === "military") b.P(at(rot(cone(r * 0.18, r * 1.1, 5), -Math.PI / 2 + 0.5, 0, 0), 0, r * 0.95, z - len), 0.6);
    z -= len * 1.55;
  }
  for (const sx of [-1, 1]) {
    const m = cone(R * 0.16, R * 1.6, 5);
    rot(m, 0, -sx * 0.35, 0);
    b.P(at(m, sx * R * 0.45, -R * 0.1, R * 0.9), 0.55);
  }
  if (role === "military") for (let i = 1; i < segs; i++) for (const sx of [-1, 1]) b.P(at(rot(cone(R * 0.08, R * 1.2, 4), 0, sx * 1.2, 0), sx * R * 0.95, -R * 0.35, zs[i]), 0.5);
  if (segs > 3) {
    // Beetle-like wing casings over the thorax.
    for (const sx of [-1, 1]) {
      const ely = ellipsoid(R * 0.75, R * 0.14, R * 1.9, 12);
      rot(ely, 0, sx * 0.18, sx * -0.35);
      b.P(at(ely, sx * R * 0.55, R * 0.55, zs[1] - R * 0.4), 1.15);
    }
  }
  const tailZ = z + R * 0.6;
  b.P(at(ellipsoid(R * 0.35, R * 0.35, R * 0.35, 10), 0, 0, tailZ), 1.3); // glowing drive sac
  b.engine(0, 0, tailZ - R * 0.3);
  return R * 1.8 - tailZ;
}

function thalassi(b: Builder, t: number, role: string): number {
  // Manta: wide, flat, smooth body with a long tail and swept fins.
  const L = 5 + t * 3;
  const W = 1.4 + t * 0.7;
  b.P(ellipsoid(W, W * 0.28, L * 0.38, 20), 1);
  b.P(at(ellipsoid(W * 0.4, W * 0.3, L * 0.22, 14), 0, W * 0.12, L * 0.12), 1.15); // canopy ridge
  const tail = cyl(W * 0.12, W * 0.02, L * 0.5, 8);
  b.P(at(tail, 0, 0, -L * 0.55), 0.85);
  for (const sx of [-1, 1]) {
    const fin = box(W * 0.9, W * 0.05, L * 0.35);
    rot(fin, 0, sx * 0.55, sx * -0.12);
    b.P(at(fin, sx * W * 0.95, -W * 0.02, -L * 0.12), 0.9);
  }
  if (role === "military") for (let i = 0; i <= Math.min(t, 3); i++) b.P(at(ellipsoid(W * 0.12, W * 0.1, W * 0.25, 8), (i % 2 ? 1 : -1) * W * 0.35 * (1 + Math.floor(i / 2) * 0.5), W * 0.22, L * 0.05 - i * L * 0.05), 0.7);
  if (role === "colony" || role === "civilian" || role === "transport") b.P(at(ellipsoid(W * 0.7, W * 0.35, L * 0.2, 14), 0, -W * 0.22, -L * 0.05), 1.05);
  for (const sx of [-1, 1]) {
    b.P(at(ellipsoid(W * 0.14, W * 0.12, L * 0.12, 10), sx * W * 0.4, 0, -L * 0.34), 0.75);
    b.engine(sx * W * 0.4, 0, -L * 0.46);
  }
  return L * 1.05;
}

function aurelian(b: Builder, t: number, role: string): number {
  // Machine synod: a cube core in square frames, node spheres, perfect symmetry.
  const L = 5 + t * 3;
  const S = 1 + t * 0.4;
  b.P(box(S, S, S), 1);
  const frames = 2 + t;
  for (let i = 0; i < frames; i++) {
    const z = L / 2 - (i + 0.5) * (L / frames);
    const ring = new THREE.TorusGeometry(S * 1.1, S * 0.06, 3, 4);
    ring.rotateZ(Math.PI / 4);
    b.P(at(ring, 0, 0, z), 0.9);
  }
  for (const [x, y] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ]) {
    b.P(at(box(S * 0.08, S * 0.08, L), x * S * 0.55, y * S * 0.55, 0), 0.8); // spars
    b.P(at(ellipsoid(S * 0.14, S * 0.14, S * 0.14, 8), x * S * 0.55, y * S * 0.55, L / 2), 1.3);
  }
  b.P(at(cone(S * 0.45, S, 4), 0, 0, L / 2 + S * 0.4), 1.1);
  if (role === "military") for (let i = 0; i < 1 + t; i++) b.P(at(box(S * 0.3, S * 0.3, S * 0.3), 0, S * 0.55, L * 0.3 - i * (L / (t + 2))), 1.2);
  if (role === "colony" || role === "civilian") b.P(at(new THREE.TorusGeometry(S * 1.6, S * 0.2, 6, 24), 0, 0, 0), 1.1);
  if (role === "transport") for (const sx of [-1, 1]) b.P(at(box(S * 0.5, S * 0.5, L * 0.6), sx * S * 1.1, 0, 0), 0.9);
  b.P(at(box(S * 0.7, S * 0.7, S * 0.4), 0, 0, -L / 2), 0.7);
  b.engine(0, 0, -L / 2 - S * 0.25);
  return L + S;
}

const STYLE_BUILDERS: Record<Exclude<ShipStyle, "terran">, (b: Builder, t: number, role: string) => number> = { vashari, lumenari, kraal, thalassi, aurelian };

function buildStyled(hull: string, style: Exclude<ShipStyle, "terran">): ShipModel {
  const parts: Part[] = [];
  const rad: THREE.BufferGeometry[] = [];
  const engines: THREE.Vector3[] = [];
  const role = HULL_MAP[hull]?.role ?? "military";
  const tier = TIER[hull] ?? 1;
  const guns: THREE.Vector3[] = [];
  const builder: Builder = {
    P: (geo, tint = 1) => parts.push({ geo, tint }),
    R: (g) => rad.push(g),
    engine: (x, y, z) => engines.push(new THREE.Vector3(x, y, z)),
    gun: (x, y, z) => guns.push(new THREE.Vector3(x, y, z)),
  };
  let length = STYLE_BUILDERS[style](builder, tier, role);
  const [px, py, pz] = PROPORTION.get(hull) ?? [1, 1, 1];
  for (const p of parts) p.geo.scale(px, py, pz);
  for (const r of rad) r.scale(px, py, pz);
  for (const e of engines) e.set(e.x * px, e.y * py, e.z * pz);
  length *= pz;
  const bounds = new THREE.Box3();
  for (const p of parts) {
    p.geo.computeBoundingBox();
    bounds.union(p.geo.boundingBox!);
  }
  hullSignature(builder, hull, bounds, makeProbe(parts.map((p) => p.geo)), style);
  if (!rad.length) rad.push(box(0.001, 0.001, 0.001)); // no radiator panels in this style
  for (const g of strutsFor([...parts.map((p) => p.geo), ...rad.filter((r) => r.getAttribute("position").count > 36 || new THREE.Box3().setFromBufferAttribute(r.getAttribute("position") as THREE.BufferAttribute).getSize(new THREE.Vector3()).length() > 0.01)], length)) parts.push({ geo: g, tint: 0.6 });
  const hullGeo = mergeGeometries(parts.map((p) => colorize(p.geo, p.tint)))!;
  hullGeo.computeVertexNormals();
  const radGeo = mergeGeometries(rad.map((r) => stripUv(r.index ? r.toNonIndexed() : r)))!;
  hullGeo.computeBoundingSphere();
  hullGeo.userData.shared = true;
  radGeo.userData.shared = true;
  return { hull: hullGeo, radiators: radGeo, engines, length, parts: [...parts.map((p) => p.geo), ...rad], guns };
}

let radiatorMaterial: THREE.MeshStandardMaterial | null = null;

/** Per-style surface detail: plate size (model units), seam darkness, grime amount. */
const SURFACE: Record<ShipStyle, [number, number, number]> = {
  terran: [0.55, 0.32, 0.9],
  vashari: [0.95, 0.45, 1.0],
  lumenari: [0.8, 0.12, 0.25],
  kraal: [0.35, 0.18, 1.2],
  thalassi: [1.1, 0.1, 0.35],
  aurelian: [0.45, 0.4, 0.8],
};

/** Shared clock (seconds) for impact heat and flickering fires; see hullNow(). */
export const hullClock = { value: 0 };

/** The clock scars are timed against — wall time, so every view agrees. */
export function hullNow(): number {
  return (hullClock.value = performance.now() / 1000);
}

/** What left a mark: a kinetic round, a laser burn, or a warhead's blast. */
export type ScarKind = "kinetic" | "laser" | "blast";
const SCAR_KIND: Record<ScarKind, number> = { kinetic: 0, laser: 1, blast: 2 };

/** One impact on a hull, in the model's own coordinates. */
export interface Scar {
  kind: ScarKind;
  /** Where it struck (model space). */
  p: THREE.Vector3;
  /** Size of the mark (model units). */
  r: number;
  /** Laser burns run along this direction (unit, model space). */
  axis: THREE.Vector3;
  /** hullNow() time it lands; glows hot at first, then cools. */
  born: number;
  seed: number;
}

/** Marks a hull can carry at once; the oldest give way first. */
export const MAX_SCARS = 24;

/** How big a mark a weapon leaves on a model of this length (model units). */
export function scarRadius(kind: ScarKind, modelLength: number, heavy = false): number {
  const k = kind === "blast" ? 0.24 : kind === "laser" ? 0.085 : 0.1;
  return k * Math.sqrt(modelLength) * (heavy ? 1.6 : 1) * (0.8 + Math.random() * 0.4);
}

/**
 * The hull shader: plating seams, per-plate tone and grime drawn from the
 * model's own coordinates (the models have no UVs), plus battle scars exactly
 * where the ship was hit — kinetic rounds punch holes ringed with torn bright
 * metal, lasers melt glowing grooves, warheads tear open soot-ringed craters
 * that smoulder. Fresh hits glow and cool; scars stay until the ship repairs.
 */
function hullShader(m: THREE.MeshStandardMaterial, style: ShipStyle): void {
  const u = {
    uSurface: { value: new THREE.Vector3(...SURFACE[style]) },
    uTime: hullClock,
    uScarCount: { value: 0 },
    uScarPos: { value: Array.from({ length: MAX_SCARS }, () => new THREE.Vector4()) },
    uScarInfo: { value: Array.from({ length: MAX_SCARS }, () => new THREE.Vector4()) },
    uScarAxis: { value: Array.from({ length: MAX_SCARS }, () => new THREE.Vector3(1, 0, 0)) },
  };
  m.userData.hull = u;
  m.customProgramCacheKey = () => "hull-v2";
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjNormal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObjPos = position;\nvObjNormal = normal;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
#define MAX_SCARS ${MAX_SCARS}
uniform float uTime;
uniform vec3 uSurface;
uniform int uScarCount;
uniform vec4 uScarPos[MAX_SCARS];
uniform vec4 uScarInfo[MAX_SCARS];
uniform vec3 uScarAxis[MAX_SCARS];
varying vec3 vObjPos;
varying vec3 vObjNormal;
float hHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hHash(i), hHash(i + vec3(1, 0, 0)), f.x), mix(hHash(i + vec3(0, 1, 0)), hHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hHash(i + vec3(0, 0, 1)), hHash(i + vec3(1, 0, 1)), f.x), mix(hHash(i + vec3(0, 1, 1)), hHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float hFbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * hNoise(p); p *= 2.03; a *= 0.5; } return s; }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
// Plating: staggered plates on the faces most square to the surface, seams between them.
vec3 an = abs(normalize(vObjNormal));
vec2 puv = (an.x > an.y && an.x > an.z ? vObjPos.yz : an.y > an.z ? vObjPos.xz : vObjPos.xy) / uSurface.x;
puv.x += step(1.0, mod(floor(puv.y), 2.0)) * 0.5;
vec2 cellId = floor(puv); vec2 fr = fract(puv);
float edgeD = min(min(fr.x, 1.0 - fr.x), min(fr.y, 1.0 - fr.y));
float seam = 1.0 - smoothstep(0.0, 0.05, edgeD);
float tone = hHash(vec3(cellId, 3.7));
float grime = hFbm(vObjPos * 1.6);
diffuseColor.rgb *= (1.0 - seam * uSurface.y) * (0.9 + 0.18 * tone) * (1.0 - 0.3 * uSurface.z * smoothstep(0.5, 0.85, grime));
// Battle scars, each where it struck.
float soot = 0.0, hole = 0.0, bare = 0.0, heat = 0.0, relief = 0.0;
for (int i = 0; i < MAX_SCARS; i++) {
  if (i >= uScarCount) break;
  vec4 sp = uScarPos[i];
  vec4 si = uScarInfo[i];
  float age = uTime - si.y;
  if (age < 0.0) continue;
  vec3 off = vObjPos - sp.xyz;
  float r = sp.w;
  float d = length(off) / r;
  if (d > 4.5) continue;
  float hot = exp(-age * 0.3);
  float ember = 0.6 + 0.4 * sin(uTime * 6.0 + si.z * 17.0 + d * 5.0);
  float n = hFbm(vObjPos * (2.2 / r) + si.z);
  if (si.x < 0.5) {
    // Kinetic: a punched hole, a lip of torn bright metal, spalled soot around it.
    float dj = d + (n - 0.5) * 0.45;
    float h = 1.0 - smoothstep(0.26, 0.34, dj);
    float lip = smoothstep(0.28, 0.36, dj) * (1.0 - smoothstep(0.4, 0.62, dj));
    hole = max(hole, h);
    bare = max(bare, lip * 0.9);
    soot = max(soot, (1.0 - smoothstep(0.35, 1.7, d + (n - 0.5) * 0.8)) * 0.85);
    heat = max(heat, (1.0 - smoothstep(0.15, 0.55, dj)) * hot * 1.1);
    relief += lip * 0.6 - h;
  } else if (si.x < 1.5) {
    // Laser: a molten groove raked along the hull, glassy edges, a long scorch.
    vec3 ax = uScarAxis[i];
    float along = dot(off, ax) / r;
    float perp = length(off - ax * along * r) / r + (n - 0.5) * 0.18;
    float L = 3.2;
    float t = clamp(abs(along) / L, 0.0, 1.0);
    float w = sqrt(max(0.0, 1.0 - t * t));
    float inside = step(abs(along), L);
    float groove = (1.0 - smoothstep(0.14 * w, 0.22 * w + 0.01, perp)) * inside;
    float glass = smoothstep(0.16 * w, 0.24 * w, perp) * (1.0 - smoothstep(0.26 * w, 0.4 * w, perp)) * inside;
    hole = max(hole, groove * 0.9);
    bare = max(bare, glass * 0.55);
    soot = max(soot, (1.0 - smoothstep(0.25 * w, 1.1 * w + 0.15, perp)) * (1.0 - smoothstep(L, L + 0.8, abs(along))) * 0.85);
    heat = max(heat, groove * (hot * 1.6 + 0.12 * ember * smoothstep(12.0, 0.0, age)));
    relief += glass * 0.4 - groove * 0.7;
  } else {
    // Warhead: a torn crater that smoulders, buckled plates, streaked soot.
    float dj = d + (n - 0.5) * 0.7;
    float streak = hNoise(normalize(off + 1e-5) * 4.0 + si.z) ;
    float h = 1.0 - smoothstep(0.4, 0.48, dj);
    float lip = smoothstep(0.42, 0.5, dj) * (1.0 - smoothstep(0.58, 0.8, dj));
    hole = max(hole, h);
    bare = max(bare, lip * 0.55);
    soot = max(soot, (1.0 - smoothstep(0.45, 1.7 + streak * 1.6, d + (n - 0.5) * 0.5)) * 0.97);
    heat = max(heat, (1.0 - smoothstep(0.25, 0.62, dj)) * hot * 1.8 + h * smoothstep(0.55, 0.8, n) * 0.35 * ember);
    relief += lip * 0.8 - h * 1.2 + (1.0 - smoothstep(0.5, 1.2, d)) * (n - 0.5) * 0.8;
  }
}
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.038, 0.034), soot * 0.9);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.7, 0.68, 0.64), bare);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.01, 0.01), hole);
float gHot = heat;`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
// Scars have depth: tilt the normal along the relief's screen-space slope.
{
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
  float hx = dFdx(relief) * 0.06, hy = dFdy(relief) * 0.06;
  vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  if (abs(det) > 1e-12) normal = normalize(abs(det) * normal - sign(det) * (hx * r1 + hy * r2));
}`,
      )
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance = mix(totalEmissiveRadiance, vec3(0.0), max(hole, soot * 0.8));\ntotalEmissiveRadiance += vec3(1.0, 0.34, 0.07) * gHot * 2.2 + vec3(1.0, 0.8, 0.5) * pow(gHot, 3.0);")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + soot * 0.4 + seam * 0.1 + hole * 0.5 - bare * 0.35, 0.05, 1.0);")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = mix(mix(metalnessFactor, 1.0, bare), 0.0, max(hole, soot * 0.6));");
  };
}

/**
 * A hull material of its own for one ship (it carries that ship's damage),
 * in the species' finish, tinted towards the empire colour. Dispose with the ship.
 */
export function hullMaterial(empireColor: string, style: ShipStyle = "terran"): THREE.MeshStandardMaterial {
  const st = SHIP_STYLES[style];
  const base = new THREE.Color(st.base).lerp(new THREE.Color(empireColor), st.tint);
  const m = new THREE.MeshStandardMaterial({
    color: base,
    vertexColors: true,
    metalness: st.metalness,
    roughness: st.roughness,
    emissive: new THREE.Color(empireColor).lerp(new THREE.Color(st.engine), 0.3).multiplyScalar(st.emissive),
  });
  hullShader(m, style);
  return m;
}

/** Show these scars on a hull material (the newest MAX_SCARS). */
export function setHullScars(m: THREE.Material, scars: readonly Scar[]): void {
  const u = (m.userData as { hull?: { uScarCount: { value: number }; uScarPos: { value: THREE.Vector4[] }; uScarInfo: { value: THREE.Vector4[] }; uScarAxis: { value: THREE.Vector3[] } } }).hull;
  if (!u) return;
  const list = scars.length > MAX_SCARS ? scars.slice(scars.length - MAX_SCARS) : scars;
  u.uScarCount.value = list.length;
  list.forEach((s, i) => {
    u.uScarPos.value[i].set(s.p.x, s.p.y, s.p.z, s.r);
    u.uScarInfo.value[i].set(SCAR_KIND[s.kind], s.born, s.seed, 0);
    u.uScarAxis.value[i].copy(s.axis);
  });
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
