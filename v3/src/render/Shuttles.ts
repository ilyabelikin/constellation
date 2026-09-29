// Landing shuttles: small craft ferrying colonists from a ship in orbit down
// to a planet's surface (colony founding, migrant liners unloading).

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
}

// Tiny next to the ship that carries them: a gentle ferry, not a missile salvo.
const hullGeo = new THREE.CapsuleGeometry(0.022, 0.05, 3, 6);
hullGeo.rotateX(Math.PI / 2);
const hullMat = new THREE.MeshStandardMaterial({ color: 0xdfe6f0, metalness: 0.5, roughness: 0.4 });

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

  /** Launch one shuttle from `from` (ship position) towards the body at `center` with radius `radius`. */
  launch(from: THREE.Vector3, bodyId: string, center: THREE.Vector3): void {
    if (this.list.length > 60) return;
    const obj = new THREE.Group();
    obj.add(new THREE.Mesh(hullGeo, hullMat));
    const glow = new THREE.Sprite(this.glowMat.clone());
    glow.scale.setScalar(0.12);
    glow.position.z = -0.05;
    obj.add(glow);
    const dir = from.clone().sub(center).normalize();
    const side = new THREE.Vector3(dir.z, 0, -dir.x).normalize().multiplyScalar((Math.random() - 0.5) * 0.9);
    obj.position.copy(from);
    this.group.add(obj);
    this.list.push({ obj, glow, from: from.clone(), dir, side, bodyId, t: 0, dur: 2.6 + Math.random() * 1.2 });
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
      const t = s.t * s.t * (3 - 2 * s.t);
      bezier(s.from, ctrl, target, t, s.obj.position);
      bezier(s.from, ctrl, target, Math.min(1, t + 0.02), next);
      s.obj.lookAt(next);
      // The craft dwindles as it sinks towards the surface and softly fades into the atmosphere.
      const fade = s.t > 0.8 ? (1 - s.t) / 0.2 : 1;
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
