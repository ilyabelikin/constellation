// Landing shuttles: small craft ferrying colonists from a ship in orbit down
// to a planet's surface (colony founding, migrant liners unloading), and
// cargo lighters carrying containers down from freighters and back up.

import * as THREE from "three";
import { getGlowTexture } from "./materials/misc";

interface Shuttle {
  obj: THREE.Group;
  glow: THREE.Sprite;
  from: THREE.Vector3;
  /** Surface direction and lateral offset, fixed at launch. */
  dir: THREE.Vector3;
  side: THREE.Vector3;
  bodyId: string;
  t: number;
  dur: number;
  /** Rising from the surface to the ship instead of descending. */
  up: boolean;
}

// Tiny next to the ship that carries them: a gentle ferry, not a missile salvo.
const hullGeo = new THREE.CapsuleGeometry(0.022, 0.05, 3, 6);
hullGeo.rotateX(Math.PI / 2);
const hullMat = new THREE.MeshStandardMaterial({ color: 0xdfe6f0, metalness: 0.5, roughness: 0.4 });
// Cargo lighters: a stubby tug carrying a painted container.
const crateGeo = new THREE.BoxGeometry(0.05, 0.04, 0.08);
const CRATE_COLORS = [0xc8553d, 0x2f6690, 0xd8a31a, 0x3a7d44, 0x8c8c8c].map((c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.3, roughness: 0.6 }));

export class Shuttles {
  readonly group = new THREE.Group();
  private list: Shuttle[] = [];
  private glowMat = new THREE.SpriteMaterial({
    map: getGlowTexture(),
    color: new THREE.Color(1.0, 0.9, 0.75),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  get count(): number {
    return this.list.length;
  }

  /**
   * Launch one shuttle between the ship at `from` and the body at `center`:
   * down to the surface, or (`up`) from the surface back to the ship; `cargo`
   * makes it a container lighter.
   */
  launch(from: THREE.Vector3, bodyId: string, center: THREE.Vector3, opts: { cargo?: boolean; up?: boolean } = {}): void {
    if (this.list.length > 60) return;
    const obj = new THREE.Group();
    obj.add(new THREE.Mesh(hullGeo, hullMat));
    if (opts.cargo) {
      const crate = new THREE.Mesh(crateGeo, CRATE_COLORS[Math.floor(Math.random() * CRATE_COLORS.length)]);
      crate.position.y = -0.035;
      obj.add(crate);
    }
    const glow = new THREE.Sprite(this.glowMat.clone());
    glow.scale.setScalar(0.12);
    glow.position.z = -0.05;
    obj.add(glow);
    const dir = from.clone().sub(center).normalize();
    const side = new THREE.Vector3(dir.z, 0, -dir.x).normalize().multiplyScalar((Math.random() - 0.5) * 0.9);
    obj.position.copy(from);
    this.group.add(obj);
    this.list.push({ obj, glow, from: from.clone(), dir, side, bodyId, t: 0, dur: 2.6 + Math.random() * 1.2, up: !!opts.up });
  }

  /** Advance; `locate` gives each target body's current centre and visual radius. */
  update(dt: number, locate: (bodyId: string, out: THREE.Vector3) => number | null): void {
    const center = new THREE.Vector3();
    const target = new THREE.Vector3();
    const ctrl = new THREE.Vector3();
    const next = new THREE.Vector3();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.t += dt / s.dur;
      const radius = locate(s.bodyId, center);
      if (s.t >= 1 || radius === null) {
        this.group.remove(s.obj);
        (s.glow.material as THREE.Material).dispose();
        this.list.splice(i, 1);
        continue;
      }
      // Descend along a gentle curve to a point on the facing hemisphere.
      target.copy(s.dir).add(s.side).normalize().multiplyScalar(radius * 0.98).add(center);
      ctrl.copy(s.from).lerp(target, 0.5).addScaledVector(s.side, radius * 0.8);
      // Along the same curve either way: rising lighters simply run it backwards.
      const p = s.up ? 1 - s.t : s.t;
      const t = p * p * (3 - 2 * p);
      bezier(s.from, ctrl, target, t, s.obj.position);
      bezier(s.from, ctrl, target, s.up ? Math.max(0, t - 0.02) : Math.min(1, t + 0.02), next);
      s.obj.lookAt(next);
      // Small near the surface, fading into (or out of) the atmosphere.
      const fade = p > 0.8 ? (1 - p) / 0.2 : 1;
      s.obj.scale.setScalar(Math.max(0.05, (1 - 0.7 * t) * fade));
      (s.glow.material as THREE.SpriteMaterial).opacity = 0.35 * fade;
    }
  }

  clear(): void {
    for (const s of this.list) {
      this.group.remove(s.obj);
      (s.glow.material as THREE.Material).dispose();
    }
    this.list = [];
  }
}

function bezier(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
  const u = 1 - t;
  return out.set(
    u * u * a.x + 2 * u * t * b.x + t * t * c.x,
    u * u * a.y + 2 * u * t * b.y + t * t * c.y,
    u * u * a.z + 2 * u * t * b.z + t * t * c.z,
  );
}
