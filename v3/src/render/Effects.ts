// Short-lived visual effects: laser beams, railgun tracers, missiles with
// smoke trails, point-defense flak, impact flashes, explosions with debris
// and shockwaves, and tunnel jump flashes.

import * as THREE from "three";
import { WEAPONS, type WeaponFamily } from "../sim/data/ships";
import { getGlowTexture } from "./materials/misc";

interface Effect {
  obj: THREE.Object3D;
  age: number;
  life: number;
  update(t: number, dt: number): void;
  dispose?(): void;
  /** Keeps the effect on a moving object (orbiting planet, station, fleet). */
  follow?: Follow;
}

/** Writes the current position of whatever the effect is attached to; false once it's gone. */
export type Follow = (out: THREE.Vector3) => boolean;

const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
beamGeo.translate(0, 0.5, 0);
beamGeo.rotateX(Math.PI / 2); // along +Z from origin

const ringGeo = new THREE.RingGeometry(0.85, 1, 48);
const FORWARD = new THREE.Vector3(0, 0, 1);
const shieldGeo = new THREE.SphereGeometry(1, 32, 20);

function additiveSprite(color: THREE.Color, opacity = 1): THREE.Sprite {
  const m = new THREE.SpriteMaterial({
    map: getGlowTexture(),
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Sprite(m);
}

export class Effects {
  readonly group = new THREE.Group();
  private effects: Effect[] = [];
  private maxEffects = 600;
  /** Point sprites (sparks, smoke) don't scale with the group; scale them here. */
  pointScale = 1;

  update(dt: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.age += dt;
      const t = e.age / e.life;
      if (t >= 1) {
        this.group.remove(e.obj);
        e.obj.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (m) m.dispose();
          if (o instanceof THREE.Points) o.geometry.dispose();
        });
        e.dispose?.();
        this.effects.splice(i, 1);
        continue;
      }
      if (e.follow && !e.follow(e.obj.position)) e.follow = undefined; // object gone: stay put
      e.update(t, dt);
    }
  }

  private add(e: Effect): void {
    if (this.effects.length >= this.maxEffects) return;
    this.group.add(e.obj);
    this.effects.push(e);
  }

  /**
   * Turn an effect's +Z toward a point, both in the effects group's own space.
   * (Not lookAt(), which works in world space: that breaks once the group is
   * scaled, as the species-screen showcase does, and swings beams off target.)
   */
  private aim(obj: THREE.Object3D, target: THREE.Vector3): void {
    const dir = target.clone().sub(obj.position);
    if (dir.lengthSq() < 1e-12) return;
    obj.quaternion.setFromUnitVectors(FORWARD, dir.normalize());
  }

  get count(): number {
    return this.effects.length;
  }

  /**
   * One shot from a weapon; returns seconds until it strikes (so a scar can
   * appear on the hull the moment it lands).
   */
  shot(family: WeaponFamily, from: THREE.Vector3, to: THREE.Vector3, hit: boolean, intercepted: boolean, empireColor: THREE.Color): number {
    const color = new THREE.Color(WEAPONS[family].color).lerp(empireColor, 0.15);
    const miss = hit ? to.clone() : to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3));
    switch (family) {
      case "laser":
      case "lance":
        this.beam(from, miss, color, family === "lance" ? 0.22 : 0.07, family === "lance" ? 0.45 : 0.22);
        if (hit) {
          this.flash(to, color, family === "lance" ? 2.5 : 1.2, 0.25);
          this.sparks(to, new THREE.Color("#ffd2a0"), 6, 0.25);
        }
        return 0;
      case "railgun":
        this.tracer(from, miss, color, 0.3, hit);
        return 0.3 * 0.92;
      case "missile": {
        const life = 0.55 + Math.random() * 0.25;
        this.missile(from, intercepted ? from.clone().lerp(to, 0.4 + Math.random() * 0.4) : miss, color, hit && !intercepted, intercepted, life);
        return life * 0.95;
      }
      case "pd":
        this.tracer(from, from.clone().lerp(miss, 0.3 + Math.random() * 0.4), new THREE.Color("#c8ffc8"), 0.12, false, 0.05);
        return 0.12;
    }
    return 0;
  }

  /** A shot splashing on a shield: the bubble lights up around the impact and a ripple runs out from it. */
  shield(center: THREE.Vector3, radius: number, at: THREE.Vector3, color: THREE.Color, delay = 0, follow?: Follow): void {
    const hitDir = at.clone().sub(center).normalize();
    const u = { uHit: { value: hitDir }, uColor: { value: color.clone().lerp(new THREE.Color("#9fd8ff"), 0.6) }, uT: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: `varying vec3 vDir; varying vec3 vN; varying vec3 vV;
void main() { vDir = normalize(position); vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uHit; uniform vec3 uColor; uniform float uT; varying vec3 vDir; varying vec3 vN; varying vec3 vV;
void main() {
  if (uT <= 0.0) discard;
  float d = distance(vDir, uHit);
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5);
  float spot = exp(-d * d * 14.0);
  float ring = exp(-pow((d - uT * 1.4) * 7.0, 2.0));
  float hex = 0.75 + 0.25 * step(0.5, fract((vDir.x + vDir.y * 0.5) * 18.0) + fract(vDir.y * 18.0) * 0.5);
  float a = (fres * 0.35 * spot + spot * 0.9 + ring * 0.55 * (1.0 - smoothstep(0.0, 1.6, d))) * (1.0 - uT) * hex;
  gl_FragColor = vec4(uColor * a * 1.6, a);
}`,
    });
    const mesh = new THREE.Mesh(shieldGeo, mat);
    mesh.scale.setScalar(radius);
    mesh.position.copy(center);
    let flashed = false;
    this.add({
      obj: mesh,
      age: -delay,
      life: 0.7,
      follow,
      update: (t) => {
        u.uT.value = Math.max(0, t);
        if (t > 0 && !flashed) {
          flashed = true;
          this.flash(mesh.position.clone().addScaledVector(hitDir, radius), u.uColor.value, radius * 0.5, 0.25);
        }
      },
      dispose: () => mat.dispose(),
    });
  }

  beam(from: THREE.Vector3, to: THREE.Vector3, color: THREE.Color, width: number, life: number): void {
    const mat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(beamGeo, mat);
    mesh.position.copy(from);
    this.aim(mesh, to);
    const len = from.distanceTo(to);
    mesh.scale.set(width, width, len);
    const core = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    core.scale.set(0.35, 0.35, 1);
    mesh.add(core);
    this.add({
      obj: mesh,
      age: 0,
      life,
      update: (t) => {
        const f = 1 - t;
        mat.opacity = f;
        (core.material as THREE.MeshBasicMaterial).opacity = f;
        mesh.scale.x = mesh.scale.y = width * (0.6 + f * 0.4);
      },
    });
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color: THREE.Color, life: number, impact: boolean, size = 0.35): void {
    const s = additiveSprite(color.clone().multiplyScalar(3));
    s.scale.setScalar(size);
    s.position.copy(from);
    const trailMat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const trail = new THREE.Mesh(beamGeo, trailMat);
    const group = new THREE.Group();
    group.add(s, trail);
    let flashed = false;
    this.add({
      obj: group,
      age: 0,
      life,
      update: (t) => {
        const p = from.clone().lerp(to, t);
        s.position.copy(p);
        const tail = from.clone().lerp(to, Math.max(0, t - 0.25));
        trail.position.copy(tail);
        this.aim(trail, p);
        trail.scale.set(size * 0.12, size * 0.12, Math.max(0.01, tail.distanceTo(p)));
        trailMat.opacity = 0.8;
        if (impact && !flashed && t > 0.92) {
          flashed = true;
          this.flash(to, color, 1.4, 0.2);
          this.sparks(to, color, 8, 0.4);
        }
      },
    });
  }

  missile(from: THREE.Vector3, to: THREE.Vector3, color: THREE.Color, impact: boolean, intercepted: boolean, life = 0.55 + Math.random() * 0.25): void {
    const head = additiveSprite(new THREE.Color("#ffffff").multiplyScalar(2.5));
    head.scale.setScalar(0.45);
    const glow = additiveSprite(color.clone().multiplyScalar(2));
    glow.scale.setScalar(1.1);
    head.add(glow);
    // Smoke/exhaust trail as a fading point strip.
    const n = 24;
    const trailPos = new Float32Array(n * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
    const trailMat = new THREE.PointsMaterial({
      size: 0.35 * this.pointScale,
      map: getGlowTexture(),
      color: color.clone().multiplyScalar(1.2),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.6,
    });
    const trail = new THREE.Points(trailGeo, trailMat);
    trail.frustumCulled = false;
    const group = new THREE.Group();
    group.add(head, trail);
    // Curved path: arc sideways then home in.
    const side = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.2), (Math.random() - 0.5)).normalize().multiplyScalar(from.distanceTo(to) * 0.3);
    const ctrl = from.clone().lerp(to, 0.35).add(side);
    const curve = new THREE.QuadraticBezierCurve3(from.clone(), ctrl, to.clone());
    let done = false;
    this.add({
      obj: group,
      age: 0,
      life,
      update: (t) => {
        const p = curve.getPoint(t);
        head.position.copy(p);
        for (let i = 0; i < n; i++) {
          const q = curve.getPoint(Math.max(0, t - i * 0.012));
          trailPos[i * 3] = q.x;
          trailPos[i * 3 + 1] = q.y;
          trailPos[i * 3 + 2] = q.z;
        }
        trailGeo.attributes.position.needsUpdate = true;
        if (!done && t > 0.95) {
          done = true;
          if (impact) {
            this.flash(to, new THREE.Color("#ffb060"), 2.2, 0.35);
            this.sparks(to, new THREE.Color("#ffa040"), 14, 0.6);
          } else if (intercepted) {
            this.flash(p, new THREE.Color("#c8ffc8"), 1.0, 0.2);
          }
        }
      },
      dispose: () => trailGeo.dispose(),
    });
  }

  flash(at: THREE.Vector3, color: THREE.Color, size: number, life: number, follow?: Follow): void {
    const s = additiveSprite(color.clone().multiplyScalar(3));
    s.position.copy(at);
    this.add({
      obj: s,
      age: 0,
      life,
      follow,
      update: (t) => {
        s.scale.setScalar(size * (0.4 + t * 0.9));
        (s.material as THREE.SpriteMaterial).opacity = 1 - t;
      },
    });
  }

  sparks(at: THREE.Vector3, color: THREE.Color, count: number, speed: number): void {
    const pos = new Float32Array(count * 3);
    const vel: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      pos.set([at.x, at.y, at.z], i * 3);
      vel.push(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random()) * 10));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.3 * this.pointScale,
      map: getGlowTexture(),
      color: color.clone().multiplyScalar(3),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.add({
      obj: pts,
      age: 0,
      life: 0.6,
      update: (t, dt) => {
        for (let i = 0; i < count; i++) {
          pos[i * 3] += vel[i].x * dt;
          pos[i * 3 + 1] += vel[i].y * dt;
          pos[i * 3 + 2] += vel[i].z * dt;
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = 1 - t;
      },
      dispose: () => geo.dispose(),
    });
  }

  explosion(at: THREE.Vector3, size: number): void {
    const s = Math.max(1, size);
    const fire = additiveSprite(new THREE.Color("#ffb35a").multiplyScalar(4));
    fire.position.copy(at);
    const core = additiveSprite(new THREE.Color("#ffffff").multiplyScalar(5));
    core.position.copy(at);
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#ffc890").multiplyScalar(2),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(at);
    ring.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.8;
    ring.rotation.y = (Math.random() - 0.5) * 0.8;
    const group = new THREE.Group();
    group.add(fire, core, ring);
    this.add({
      obj: group,
      age: 0,
      life: 1.4,
      update: (t) => {
        fire.scale.setScalar(s * 3 * (0.3 + Math.pow(t, 0.4)));
        (fire.material as THREE.SpriteMaterial).opacity = Math.pow(1 - t, 1.5);
        (fire.material as THREE.SpriteMaterial).color.setRGB(4 * (1 - t * 0.3), 2.2 * (1 - t * 0.7), 0.9 * (1 - t));
        core.scale.setScalar(s * 1.6 * (1 - t));
        ring.scale.setScalar(s * 6 * Math.pow(t, 0.5));
        ringMat.opacity = (1 - t) * 0.8;
      },
    });
    this.sparks(at, new THREE.Color("#ffaa55"), 30, 0.5 * s);
    this.debris(at, s);
  }

  private debris(at: THREE.Vector3, s: number): void {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: "#555", metalness: 0.6, roughness: 0.5, emissive: new THREE.Color("#ff5a1a"), emissiveIntensity: 1.5 });
    const pieces: { m: THREE.Mesh; v: THREE.Vector3; r: THREE.Vector3 }[] = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.08 * s * (0.5 + Math.random())), mat);
      m.position.copy(at);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(s * (1 + Math.random() * 2));
      pieces.push({ m, v, r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6) });
      group.add(m);
    }
    this.add({
      obj: group,
      age: 0,
      life: 2.5,
      update: (t, dt) => {
        for (const p of pieces) {
          p.m.position.addScaledVector(p.v, dt);
          p.m.rotation.x += p.r.x * dt;
          p.m.rotation.y += p.r.y * dt;
        }
        mat.emissiveIntensity = 1.5 * (1 - t);
        mat.opacity = 1 - t;
        mat.transparent = true;
      },
      dispose: () => pieces.forEach((p) => p.m.geometry.dispose()),
    });
  }

  jump(at: THREE.Vector3, color: THREE.Color): void {
    this.flash(at, color, 8, 0.8);
    const ringMat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(3), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(at);
    ring.lookAt(0, 0, 0);
    this.add({
      obj: ring,
      age: 0,
      life: 0.9,
      update: (t) => {
        ring.scale.setScalar(1 + t * 10);
        ringMat.opacity = 1 - t;
      },
    });
  }

  pulse(at: THREE.Vector3, color: THREE.Color, size: number, follow?: Follow): void {
    const ringMat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(at);
    ring.rotation.x = -Math.PI / 2;
    this.add({
      obj: ring,
      age: 0,
      life: 1.6,
      follow,
      update: (t) => {
        ring.scale.setScalar(size * (0.3 + t));
        ringMat.opacity = (1 - t) * 0.9;
      },
    });
  }

  clear(): void {
    for (const e of this.effects) {
      this.group.remove(e.obj);
      e.obj.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m) m.dispose();
      });
      e.dispose?.();
    }
    this.effects = [];
  }
}
