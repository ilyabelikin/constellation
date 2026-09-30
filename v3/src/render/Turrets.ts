// Gun turrets that turn. Each turret's head (housing and barrels) is a separate
// object that swivels on its ring and elevates its guns toward a target before
// firing, and kicks back when it does. To keep the cost of so many moving parts
// down, every turret of a kind (species style × barrel count) in a scene is
// drawn by one instanced mesh for housings and one for barrels: a few draw
// calls however many ships are fighting.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { at, box, colorize, cone, cyl, ellipsoid, SHIP_STYLES, type ShipStyle, type TurretMount } from "./ShipModels";

/** Geometry of one kind of turret at unit size: housing turns (yaw), barrels also elevate (pitch) about `pivot`. */
interface TurretKind {
  housing: THREE.BufferGeometry;
  barrels: THREE.BufferGeometry;
  /** Height of the barrels' trunnion above the ring. */
  pivot: number;
  /** Barrel tip distance ahead of the trunnion. */
  muzzle: number;
  /** Sideways offset of each barrel. */
  spread: number[];
}

const kinds = new Map<string, TurretKind>();

const upright = (g: THREE.BufferGeometry) => g.rotateX(Math.PI / 2); // cyl() runs along Z; stand it up

function kindFor(style: ShipStyle, n: number): TurretKind {
  const key = `${style}:${n}`;
  const hit = kinds.get(key);
  if (hit) return hit;
  const spread = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * 0.32);
  const H: THREE.BufferGeometry[] = [];
  const B: THREE.BufferGeometry[] = [];
  let pivot = 0.3;
  let muzzle = 1.1;
  const h = (g: THREE.BufferGeometry, tint = 0.85) => H.push(colorize(g, tint));
  const b = (g: THREE.BufferGeometry, tint = 0.55) => B.push(colorize(g, tint));
  switch (style) {
    case "vashari":
      // Armoured casemate: a squat slab with thick square barrels.
      h(at(box(1.1, 0.4, 0.9), 0, 0.2, 0), 0.75);
      h(at(box(0.8, 0.12, 0.5), 0, 0.45, -0.1), 1.3);
      pivot = 0.22;
      muzzle = 1.35;
      for (const x of spread) b(at(box(0.16, 0.16, 1.2), x, 0, 0.75));
      break;
    case "lumenari":
      // Crystal emitter: a faceted focus on a short stem, prongs for extra beams.
      h(at(upright(cyl(0.08, 0.12, 0.35, 5)), 0, 0.17, 0), 0.8);
      h(at(new THREE.OctahedronGeometry(0.38, 0).scale(1, 0.8, 1.4), 0, 0.5, 0), 1.35);
      pivot = 0.5;
      muzzle = 1.15;
      for (const x of spread) b(at(cone(0.07, 0.9, 4), x, 0, 0.7), 1.2);
      break;
    case "kraal":
      // Living weapon: a swollen blister bristling with bone spines.
      h(at(ellipsoid(0.55, 0.4, 0.6, 10), 0, 0.15, 0));
      pivot = 0.35;
      muzzle = 1.25;
      for (const x of spread) b(at(cone(0.1, 1.1, 6), x, 0, 0.7), 0.65);
      break;
    case "thalassi":
      // Smooth low dome with slim, flush barrels.
      h(at(ellipsoid(0.5, 0.28, 0.55, 14), 0, 0.02, 0), 1.15);
      pivot = 0.12;
      muzzle = 1.3;
      for (const x of spread) b(at(cyl(0.05, 0.07, 1.1, 8), x * 0.8, 0, 0.75), 0.75);
      break;
    case "aurelian":
      // Industrial gun mount: a post, a boxy breech and long rails with a collar.
      h(at(box(0.15, 0.45, 0.15), 0, 0.22, 0), 0.6);
      h(at(box(0.6, 0.35, 0.6), 0, 0.55, 0), 0.8);
      pivot = 0.55;
      muzzle = 1.85;
      for (const x of spread) {
        b(at(box(0.07, 0.07, 1.6), x, 0, 1.05));
        b(at(new THREE.TorusGeometry(0.1, 0.03, 4, 8), x, 0, 1.5), 0.9);
      }
      break;
    default:
      // Terran: a low armoured dome, a mantlet and slim rifled barrels.
      h(at(upright(cyl(0.4, 0.46, 0.22, 14)), 0, 0.11, 0), 0.8);
      h(at(ellipsoid(0.4, 0.2, 0.44, 12), 0, 0.22, 0), 0.9);
      pivot = 0.3;
      muzzle = 1.15;
      b(at(box(Math.max(0.3, n * 0.3), 0.2, 0.2), 0, 0, 0.3), 0.7);
      for (const x of spread) b(at(cyl(0.05, 0.065, 0.9, 8), x, 0, 0.75));
  }
  const kind: TurretKind = { housing: mergeGeometries(H)!, barrels: mergeGeometries(B)!, pivot, muzzle, spread };
  kind.housing.computeVertexNormals();
  kind.barrels.computeVertexNormals();
  kind.housing.userData.shared = kind.barrels.userData.shared = true; // cached: views must not dispose them
  kinds.set(key, kind);
  return kind;
}

const materials = new Map<ShipStyle, THREE.MeshStandardMaterial>();
function materialFor(style: ShipStyle): THREE.MeshStandardMaterial {
  let m = materials.get(style);
  if (!m) {
    const st = SHIP_STYLES[style];
    m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: st.metalness,
      roughness: st.roughness,
      emissive: new THREE.Color(st.engine).multiplyScalar(st.emissive * 0.6),
    });
    m.userData.shared = true;
    materials.set(style, m);
  }
  return m;
}

export interface Turret {
  owner: THREE.Object3D;
  kind: TurretKind;
  batch: string;
  /** Mount in the owner's model space (position, facing, size). */
  base: THREE.Matrix4;
  color: THREE.Color;
  yaw: number;
  pitch: number;
  /** World point it is tracking, while `hold` (seconds) lasts. */
  target: THREE.Vector3 | null;
  hold: number;
  /** Angle still to turn before it bears on its target. */
  err: number;
  recoil: number;
  gone: boolean;
  world: THREE.Matrix4;
  housingM: THREE.Matrix4;
  barrelM: THREE.Matrix4;
}

interface Batch {
  kind: TurretKind;
  style: ShipStyle;
  housing: THREE.InstancedMesh;
  barrels: THREE.InstancedMesh;
  list: Turret[];
}

const YAW_RATE = 2.4; // rad/s
const PITCH_RATE = 1.6;
const MIN_PITCH = -0.12;
const MAX_PITCH = 1.3;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const tmpM = new THREE.Matrix4();
const tmpInv = new THREE.Matrix4();
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const flipQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function visible(o: THREE.Object3D | null): boolean {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/** Every turret in one scene. Add its group to the scene and call update() each frame. */
export class TurretRig {
  readonly group = new THREE.Group();
  private batches = new Map<string, Batch>();

  /** Fit turret heads to a ship's hull mesh; returns them for aiming (and removal). */
  add(owner: THREE.Object3D, mounts: readonly TurretMount[], style: ShipStyle, color: THREE.Color): Turret[] {
    const out: Turret[] = [];
    for (const m of mounts) {
      const key = `${style}:${m.barrels}`;
      const batch = this.batch(key, style, m.barrels);
      const base = new THREE.Matrix4().compose(m.pos, m.up < 0 ? flipQ : new THREE.Quaternion(), new THREE.Vector3(m.size, m.size, m.size));
      const t: Turret = {
        owner,
        kind: batch.kind,
        batch: key,
        base,
        color: color.clone(),
        yaw: 0,
        pitch: 0,
        target: null,
        hold: 0,
        err: 0,
        recoil: 0,
        gone: false,
        world: new THREE.Matrix4(),
        housingM: new THREE.Matrix4(),
        barrelM: new THREE.Matrix4(),
      };
      batch.list.push(t);
      out.push(t);
    }
    return out;
  }

  remove(turrets: readonly Turret[]): void {
    for (const t of turrets) {
      t.gone = true;
      const b = this.batches.get(t.batch);
      if (!b) continue;
      const i = b.list.indexOf(t);
      if (i >= 0) b.list.splice(i, 1);
    }
  }

  /** Remove every turret (the scene is being torn down or rebuilt). */
  clear(): void {
    for (const b of this.batches.values()) {
      for (const t of b.list) t.gone = true;
      b.list.length = 0;
    }
  }

  /** Train a turret on a world point for `hold` seconds. */
  aim(t: Turret, p: THREE.Vector3, hold = 2.5): void {
    (t.target ??= new THREE.Vector3()).copy(p);
    t.hold = hold;
    t.err = Math.max(t.err, 0.5); // unknown until the next update measures it
  }

  /** Whether it bears on its target closely enough to fire. */
  onTarget(t: Turret, tolerance = 0.08): boolean {
    return t.err < tolerance;
  }

  /** The turret best placed to engage a point: on the side of the hull facing it, preferring idle guns. */
  pick(turrets: readonly Turret[], p: THREE.Vector3): Turret | null {
    let best: Turret | null = null;
    let bestScore = -Infinity;
    // Big fleets: weigh a handful of candidates, not every gun.
    const pool = turrets.length <= 10 ? turrets : Array.from({ length: 10 }, () => turrets[Math.floor(Math.random() * turrets.length)]);
    for (const t of pool) {
      if (t.gone) continue;
      this.pose(t);
      const origin = tmpV.setFromMatrixPosition(t.world);
      const dir = p.clone().sub(origin).normalize();
      const up = new THREE.Vector3(0, 1, 0).transformDirection(t.world);
      const score = up.dot(dir) + (t.hold > 0 ? 0 : 0.35) + Math.random() * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  /** World position of a barrel's tip (a random barrel if none given). */
  muzzle(t: Turret, out = new THREE.Vector3(), barrel = Math.floor(Math.random() * t.kind.spread.length)): THREE.Vector3 {
    this.pose(t);
    return out.set(t.kind.spread[barrel] ?? 0, 0, t.kind.muzzle).applyMatrix4(t.barrelM);
  }

  /** The gun fires: it kicks back and runs out again. */
  fire(t: Turret): void {
    t.recoil = 1;
  }

  update(dt: number): void {
    const fresh = new Set<THREE.Object3D>();
    for (const b of this.batches.values()) {
      if (b.list.length > b.housing.instanceMatrix.count) this.grow(b, b.list.length);
      let n = 0;
      for (const t of b.list) {
        if (!visible(t.owner)) {
          b.housing.setMatrixAt(n, ZERO);
          b.barrels.setMatrixAt(n, ZERO);
          n++;
          continue;
        }
        if (!fresh.has(t.owner)) {
          t.owner.updateWorldMatrix(true, false); // this frame's pose, so turrets never lag their ship
          fresh.add(t.owner);
        }
        this.slew(t, dt);
        this.pose(t);
        b.housing.setMatrixAt(n, t.housingM);
        b.barrels.setMatrixAt(n, t.barrelM);
        b.housing.setColorAt(n, t.color);
        b.barrels.setColorAt(n, t.color);
        n++;
      }
      b.housing.count = b.barrels.count = n;
      b.housing.instanceMatrix.needsUpdate = b.barrels.instanceMatrix.needsUpdate = true;
      if (b.housing.instanceColor) b.housing.instanceColor.needsUpdate = true;
      if (b.barrels.instanceColor) b.barrels.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const b of this.batches.values()) {
      b.housing.dispose();
      b.barrels.dispose();
    }
    this.batches.clear();
    this.group.clear();
  }

  // ------------------------------------------------------------------ internals
  private slew(t: Turret, dt: number): void {
    let wantYaw = 0;
    let wantPitch = 0;
    if (t.target && t.hold > 0) {
      t.hold -= dt;
      tmpM.multiplyMatrices(t.owner.matrixWorld, t.base);
      tmpInv.copy(tmpM).invert();
      const local = tmpV.copy(t.target).applyMatrix4(tmpInv);
      local.y -= t.kind.pivot;
      wantYaw = Math.atan2(local.x, local.z);
      wantPitch = THREE.MathUtils.clamp(Math.atan2(local.y, Math.hypot(local.x, local.z)), MIN_PITCH, MAX_PITCH);
    }
    const dy = wrap(wantYaw - t.yaw);
    const dp = wantPitch - t.pitch;
    t.yaw = wrap(t.yaw + THREE.MathUtils.clamp(dy, -YAW_RATE * dt, YAW_RATE * dt));
    t.pitch += THREE.MathUtils.clamp(dp, -PITCH_RATE * dt, PITCH_RATE * dt);
    t.err = Math.abs(wrap(wantYaw - t.yaw)) + Math.abs(wantPitch - t.pitch);
    t.recoil = Math.max(0, t.recoil - dt * 3.5);
  }

  /** World matrices of the mount, the turning housing and the elevating barrels. */
  private pose(t: Turret): void {
    t.world.multiplyMatrices(t.owner.matrixWorld, t.base);
    t.housingM.multiplyMatrices(t.world, tmpM.makeRotationY(t.yaw));
    tmpQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -t.pitch);
    tmpM.compose(new THREE.Vector3(0, t.kind.pivot, 0), tmpQ, new THREE.Vector3(1, 1, 1));
    t.barrelM.multiplyMatrices(t.housingM, tmpM);
    if (t.recoil > 0) t.barrelM.multiply(tmpM.makeTranslation(0, 0, -0.22 * Math.sin(Math.min(1, t.recoil) * Math.PI * 0.5)));
  }

  private batch(key: string, style: ShipStyle, barrels: number): Batch {
    let b = this.batches.get(key);
    if (!b) {
      const kind = kindFor(style, barrels);
      const mat = materialFor(style);
      b = { kind, style, housing: this.instanced(kind.housing, mat, 16), barrels: this.instanced(kind.barrels, mat, 16), list: [] };
      this.batches.set(key, b);
    }
    return b;
  }

  private instanced(geo: THREE.BufferGeometry, mat: THREE.Material, capacity: number): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(geo, mat, capacity);
    m.count = 0;
    m.frustumCulled = false; // instances span the whole scene
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(m);
    return m;
  }

  /** Room for more turrets: swap in bigger instanced meshes. */
  private grow(b: Batch, need: number): void {
    const cap = Math.max(need, b.housing.instanceMatrix.count * 2);
    const mat = materialFor(b.style);
    for (const k of ["housing", "barrels"] as const) {
      this.group.remove(b[k]);
      b[k].dispose();
      b[k] = this.instanced(b.kind[k], mat, cap);
    }
  }
}
