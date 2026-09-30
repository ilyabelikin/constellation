// A small turntable on the species screen showing the selected civilization's
// ship designs, cycling through a few hulls.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { HULL_MAP } from "../sim/data/ships";
import { SPECIES_MAP } from "../sim/data/structures";
import { hullMaterial, radiatorMat, SHIP_STYLES, shipModel, styleForSpecies } from "../render/ShipModels";
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
    this.loop();
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
    this.turntable.clear();
    const model = shipModel(hullId, style);
    const ship = new THREE.Group();
    ship.add(new THREE.Mesh(model.hull, hullMaterial(this.color, style)), new THREE.Mesh(model.radiators, radiatorMat()));
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
    this.index = Math.floor(elapsed / SECONDS_PER_SHIP) % SHOWCASE.length;
    this.rebuild();
    this.turntable.rotation.y = elapsed * 0.45;
    r.render(this.scene, this.camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.turntable.clear();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
    this.host.innerHTML = "";
  }
}
