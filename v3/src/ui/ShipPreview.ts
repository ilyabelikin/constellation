// A small turntable on the species screen showing the selected civilization's
// ship designs, cycling through a few hulls.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { HULL_MAP } from "../sim/data/ships";
import { SPECIES_MAP } from "../sim/data/structures";
import { hullClock, hullMaterial, radiatorMat, setHullDamage, SHIP_STYLES, shipModel, styleForSpecies, type ShipStyle } from "../render/ShipModels";
import { getGlowTexture } from "../render/materials/misc";

/** Every hull, civilian and military alternating, so each species' whole fleet is on show. */
const SHOWCASE = ["scout", "corvette", "constructor", "frigate", "colony", "destroyer", "freighter", "cruiser", "transport", "battleship", "liner", "titan", "tender"];
const SECONDS_PER_SHIP = 3.5;

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
  private damage = 0;
  private fx: { obj: THREE.Sprite; age: number; life: number; step: (t: number, o: THREE.Sprite) => void }[] = [];
  private nextShot = 0;
  private nextHit = 0;
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
    this.scene.add(key, rim, new THREE.AmbientLight(0x6070a0, 0.3), this.turntable);
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
    this.damage = 0;
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
    hullClock.value = elapsed;
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
  }

  /** A random point on the ship's hull, in world space. */
  private hullPoint(out: THREE.Vector3): THREE.Vector3 {
    const pos = this.hullMesh!.geometry.getAttribute("position");
    out.fromBufferAttribute(pos as THREE.BufferAttribute, Math.floor(Math.random() * pos.count));
    return this.hullMesh!.localToWorld(out);
  }

  /**
   * Warships on show trade fire with an unseen enemy — their shots streak
   * away, incoming fire flashes on the hull and leaves it scorched; builders
   * weld; the rest cruise.
   */
  private animate(elapsed: number, dt: number): void {
    if (!this.hullMesh) return;
    const size = this.hullMesh.geometry.boundingSphere?.radius ?? 3;
    const scale = this.hullMesh.getWorldScale(new THREE.Vector3()).x;
    const r = size * scale;
    const weapon = new THREE.Color(SHIP_STYLES[this.style].engine);
    if (this.role === "military") {
      if (elapsed > this.nextShot) {
        this.nextShot = elapsed + 0.35 + Math.random() * 0.45;
        const from = this.hullPoint(new THREE.Vector3());
        const dir = new THREE.Vector3(1.4, 0.15 + Math.random() * 0.3, -0.6 + Math.random() * 1.2).normalize();
        // A bright bolt with a short fading trail.
        for (let k = 0; k < 4; k++) {
          const bolt = this.glow(k === 0 ? "#ffffff" : weapon, r * (0.32 - k * 0.05));
          this.fx.push({ obj: bolt, age: 0, life: 0.6, step: (t, o) => o.position.copy(from).addScaledVector(dir, Math.max(0, t - k * 0.03) * r * 5) });
        }
      }
      if (elapsed > this.nextHit) {
        this.nextHit = elapsed + 0.5 + Math.random() * 0.6;
        const at = this.hullPoint(new THREE.Vector3());
        const src = at.clone().add(new THREE.Vector3(-r * 4, r * (Math.random() - 0.3), r * (Math.random() * 2 - 1)));
        const incoming = this.glow("#ff8a5a", r * 0.26);
        this.fx.push({ obj: incoming, age: 0, life: 0.28, step: (t, o) => o.position.lerpVectors(src, at, Math.min(1, t / 0.28)) });
        setTimeout(() => {
          if (!this.hullMesh) return;
          const flash = this.glow("#ffe2b0", r * 0.7);
          flash.position.copy(at);
          this.fx.push({ obj: flash, age: 0, life: 0.4, step: (t, o) => o.scale.setScalar(r * (0.7 + t * 2.2)) });
          this.damage = Math.min(0.85, this.damage + 0.09);
        }, 280);
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
    setHullDamage(this.hullMesh.material as THREE.Material, this.damage);
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
