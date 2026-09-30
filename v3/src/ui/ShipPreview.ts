// A small turntable on the species screen showing the selected civilization's
// ship designs, cycling through a few hulls.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { HULL_MAP } from "../sim/data/ships";
import { SPECIES_MAP } from "../sim/data/structures";
import { Effects } from "../render/Effects";
import { getGlowTexture } from "../render/materials/misc";
import { makeScar, scarKindFor, SHOWCASE_WEAPONS, strikePoint } from "../render/Scarring";
import { hullMaterial, hullNow, MAX_SCARS, radiatorMat, setHullScars, SHIP_STYLES, shipModel, styleForSpecies, type Scar, type ShipStyle } from "../render/ShipModels";
import type { WeaponFamily } from "../sim/data/ships";

/** Every hull, civilian and military alternating, so each species' whole fleet is on show. */
const SHOWCASE = ["scout", "corvette", "constructor", "frigate", "colony", "destroyer", "freighter", "cruiser", "transport", "battleship", "liner", "titan", "tender"];
const SECONDS_PER_SHIP = 4.2;

export class ShipPreview {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 200);
  private turntable = new THREE.Group();
  private raf = 0;
  private start = performance.now();
  private shown = "";
  private species = "";
  private color = "#ffffff";
  private caption: HTMLElement;
  /** Index into SHOWCASE; exposed for tests. */
  index = 0;
  /** The ship on show: its hull (for hit points and damage) and role. */
  private hullMesh: THREE.Mesh | null = null;
  private role = "";
  private style: ShipStyle = "terran";
  private fx: { obj: THREE.Sprite; age: number; life: number; step: (t: number, o: THREE.Sprite) => void }[] = [];
  private nextShot = 0;
  private nextHit = 0;
  /** Weapon fire, explosions and shield splashes (the game's own effects, scaled to the ship). */
  private effects = new Effects();
  /** Where the unseen enemies sit (world space; they stay put while the ship turns). */
  private attackers: THREE.Vector3[] = [];
  private scars: Scar[] = [];
  /** Hits the shield still soaks up before fire reaches the hull. */
  private shieldHits = 0;
  private modelLength = 1;
  private guns: THREE.Vector3[] = [];
  private families: WeaponFamily[] = [];
  private pending: { at: number; fire: () => void }[] = [];
  private last = performance.now();

  constructor(private host: HTMLElement) {
    const canvas = document.createElement("canvas");
    canvas.className = "ship-preview-canvas";
    this.caption = document.createElement("div");
    this.caption.className = "ship-preview-caption";
    host.append(canvas, this.caption);
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      this.caption.textContent = "3D preview unavailable";
      return;
    }
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.5;
    pmrem.dispose();
    const key = new THREE.DirectionalLight(0xfff1dd, 2.2);
    key.position.set(4, 5, 6);
    const rim = new THREE.DirectionalLight(0x88aaff, 1.2);
    rim.position.set(-6, 2, -5);
    this.scene.add(key, rim, new THREE.AmbientLight(0x6070a0, 0.3), this.turntable, this.effects.group);
    (window as unknown as { __preview?: ShipPreview }).__preview = this; // for tests
    this.loop();
  }

  /** Keep a given hull on show (tests, screenshots). */
  private pinned: number | null = null;
  showHull(hullId: string): void {
    const i = SHOWCASE.indexOf(hullId);
    this.pinned = i >= 0 ? i : null;
  }

  /** Show the ships of this species in this empire colour. */
  set(speciesId: string, color: string): void {
    if (speciesId === this.species && color === this.color) return;
    if (speciesId !== this.species) {
      this.index = 0;
      this.start = performance.now();
    }
    this.species = speciesId;
    this.color = color;
    this.shown = "";
  }

  private rebuild(): void {
    const hullId = SHOWCASE[this.index % SHOWCASE.length];
    const style = styleForSpecies(this.species);
    const key = `${this.species}:${this.color}:${hullId}`;
    if (key === this.shown) return;
    this.shown = key;
    if (this.hullMesh) (this.hullMesh.material as THREE.Material).dispose();
    this.turntable.clear();
    this.clearFx();
    const model = shipModel(hullId, style);
    const ship = new THREE.Group();
    this.hullMesh = new THREE.Mesh(model.hull, hullMaterial(this.color, style));
    this.role = HULL_MAP[hullId].role;
    this.style = style;
    ship.add(this.hullMesh, new THREE.Mesh(model.radiators, radiatorMat()));
    const glow = new THREE.SpriteMaterial({ map: getGlowTexture(), color: new THREE.Color(SHIP_STYLES[style].engine), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    for (const e of model.engines) {
      const s = new THREE.Sprite(glow);
      s.position.copy(e);
      s.scale.setScalar(model.length * 0.08);
      ship.add(s);
    }
    // Frame the ship: fit its bounding sphere in view.
    const sphere = model.hull.boundingSphere ?? new THREE.Sphere(new THREE.Vector3(), model.length / 2);
    ship.position.copy(sphere.center).multiplyScalar(-1);
    this.turntable.add(ship);
    const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 0.72;
    this.camera.position.set(dist * 0.55, dist * 0.35, dist * 0.8);
    this.camera.lookAt(0, 0, 0);
    // The battle: effects sized to the ship, enemies spread all around it.
    const hullDef = HULL_MAP[hullId];
    this.modelLength = model.length;
    this.guns = model.guns;
    this.families = [...new Set(hullDef.weapons.map((w) => w.family).filter((f) => f !== "pd"))];
    const k = model.length * 0.16;
    this.effects.group.scale.setScalar(k);
    this.effects.pointScale = k * 1.8;
    this.scars = [];
    this.shieldHits = hullDef.shields > 0 ? 2 : 0;
    this.attackers = [];
    const spin = Math.random() * Math.PI * 2;
    for (let i = 0; i < 3; i++) {
      const a = spin + (i / 3) * Math.PI * 2;
      const el = (Math.random() - 0.35) * 1.1;
      this.attackers.push(new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)).multiplyScalar(sphere.radius * 3.4));
    }
    const sp = SPECIES_MAP[this.species];
    this.caption.textContent = `${sp?.adjective ?? ""} ${HULL_MAP[hullId].name} · ${SHIP_STYLES[style].name}`;
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const r = this.renderer;
    if (!r || !this.species) return;
    const w = this.host.clientWidth;
    const h = Math.max(1, Math.round(w * 0.3));
    if (r.domElement.width !== Math.round(w * r.getPixelRatio()) || r.domElement.height !== Math.round(h * r.getPixelRatio())) {
      r.setSize(w, h, false);
      r.domElement.style.width = `${w}px`;
      r.domElement.style.height = `${h}px`;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    const elapsed = (performance.now() - this.start) / 1000;
    this.index = this.pinned ?? Math.floor(elapsed / SECONDS_PER_SHIP) % SHOWCASE.length;
    this.rebuild();
    this.turntable.rotation.y = elapsed * 0.45;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    hullNow();
    this.animate(elapsed, dt);
    r.render(this.scene, this.camera);
  };

  // ------------------------------------------------------------ showcase action
  private glow(color: THREE.ColorRepresentation, size: number): THREE.Sprite {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.scale.setScalar(size);
    this.scene.add(sp);
    return sp;
  }

  private clearFx(): void {
    for (const f of this.fx) {
      this.scene.remove(f.obj);
      f.obj.material.dispose();
    }
    this.fx = [];
    this.effects.clear();
    this.pending = [];
  }

  /** World → effects-group coordinates (the group is scaled to the ship). */
  private fxPos(p: THREE.Vector3): THREE.Vector3 {
    return p.clone().divideScalar(this.effects.group.scale.x);
  }

  /** An enemy shot from one of the attackers: on the shield while it holds, then into the hull. */
  private incoming(family: WeaponFamily, from: THREE.Vector3): void {
    const mesh = this.hullMesh;
    if (!mesh) return;
    const struck = strikePoint(mesh, from);
    if (!struck) return;
    const color = new THREE.Color("#ff7a50");
    let to = struck.world;
    if (this.shieldHits > 0) {
      this.shieldHits--;
      const sphere = mesh.geometry.boundingSphere!;
      const c = mesh.localToWorld(sphere.center.clone());
      const r = sphere.radius * 1.12;
      to = new THREE.Ray(from, to.clone().sub(from).normalize()).intersectSphere(new THREE.Sphere(c, r), new THREE.Vector3()) ?? to;
      const delay = this.effects.shot(family, this.fxPos(from), this.fxPos(to), true, false, color);
      this.effects.shield(this.fxPos(c), r / this.effects.group.scale.x, this.fxPos(to), new THREE.Color(SHIP_STYLES[this.style].engine), delay);
      return;
    }
    const delay = this.effects.shot(family, this.fxPos(from), this.fxPos(to), true, false, color);
    this.scars.push(makeScar(scarKindFor(family), struck.local, struck.normal, this.modelLength, delay));
    if (this.scars.length > MAX_SCARS) this.scars.shift();
  }

  /** The ship on show fires back from its own turrets at whoever is shooting at it. */
  private outgoing(target: THREE.Vector3): void {
    const mesh = this.hullMesh;
    if (!mesh || !this.families.length) return;
    let from: THREE.Vector3 | null = null;
    if (this.guns.length) {
      // The barrel facing the target best (with some variety).
      const c = mesh.localToWorld(new THREE.Vector3());
      const dir = target.clone().sub(c).normalize();
      let best = -Infinity;
      for (const g of this.guns) {
        const w = mesh.localToWorld(g.clone());
        const score = w.clone().sub(c).normalize().dot(dir) + Math.random() * 0.8;
        if (score > best) {
          best = score;
          from = w;
        }
      }
    } else from = strikePoint(mesh, target)?.world ?? null;
    if (!from) return;
    const family = this.families[Math.floor(Math.random() * this.families.length)];
    const aim = target.clone().add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(this.modelLength * 0.3));
    this.effects.shot(family, this.fxPos(from), this.fxPos(aim), true, false, new THREE.Color(SHIP_STYLES[this.style].engine));
  }

  /**
   * Warships on show fight enemies all around them: kinetic rounds, lasers and
   * missiles splash on the shield, then scar the hull where they land, while
   * the ship fires back from its own turrets. Builders weld; the rest cruise.
   */
  private animate(elapsed: number, dt: number): void {
    if (!this.hullMesh) return;
    const size = this.hullMesh.geometry.boundingSphere?.radius ?? 3;
    const scale = this.hullMesh.getWorldScale(new THREE.Vector3()).x;
    const r = size * scale;
    if (this.role === "military") {
      // Return fire from the turrets, at the enemies pressing in.
      if (elapsed > this.nextShot && this.attackers.length) {
        this.nextShot = elapsed + 0.22 + Math.random() * 0.3;
        this.outgoing(this.attackers[Math.floor(Math.random() * this.attackers.length)]);
      }
      // Incoming: kinetic bursts, laser strikes and missiles from all sides.
      if (elapsed > this.nextHit && this.attackers.length) {
        this.nextHit = elapsed + 0.45 + Math.random() * 0.45;
        const src = this.attackers[Math.floor(Math.random() * this.attackers.length)];
        const family = SHOWCASE_WEAPONS[Math.floor(Math.random() * SHOWCASE_WEAPONS.length)];
        const rounds = family === "railgun" ? 3 : 1;
        for (let n = 0; n < rounds; n++) {
          const from = src.clone().add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(this.modelLength * 0.2));
          this.pending.push({ at: elapsed + n * 0.09, fire: () => this.incoming(family, from) });
        }
      }
      for (let i = this.pending.length - 1; i >= 0; i--) {
        if (this.pending[i].at > elapsed) continue;
        const p = this.pending.splice(i, 1)[0];
        p.fire();
      }
    } else if (this.role === "constructor" && elapsed > this.nextShot) {
      // Welding: bright arcs flicker at the crane arms' reach.
      this.nextShot = elapsed + 0.08 + Math.random() * 0.12;
      const box = this.hullMesh.geometry.boundingBox ?? this.hullMesh.geometry.computeBoundingBox() ?? this.hullMesh.geometry.boundingBox!;
      const tip = new THREE.Vector3((Math.random() - 0.5) * (box.max.x - box.min.x) * 0.6, 0, box.max.z * 1.05);
      this.hullMesh.localToWorld(tip);
      const spark = this.glow(Math.random() < 0.5 ? "#bfe6ff" : "#fff3c4", r * (0.06 + Math.random() * 0.08));
      const drift = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).multiplyScalar(r * 0.6);
      this.fx.push({ obj: spark, age: 0, life: 0.25, step: (t, o) => o.position.copy(tip).addScaledVector(drift, t) });
    }
    setHullScars(this.hullMesh.material as THREE.Material, this.scars);
    this.effects.update(dt);
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.age += dt;
      if (f.age >= f.life) {
        this.scene.remove(f.obj);
        f.obj.material.dispose();
        this.fx.splice(i, 1);
        continue;
      }
      f.step(f.age, f.obj);
      f.obj.material.opacity = 1 - f.age / f.life;
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.clearFx();
    if (this.hullMesh) (this.hullMesh.material as THREE.Material).dispose();
    this.hullMesh = null;
    this.turntable.clear();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
    this.host.innerHTML = "";
  }
}
