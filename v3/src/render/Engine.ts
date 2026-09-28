// WebGL renderer + HDR post-processing (bloom, ACES tone mapping, FXAA) and
// input plumbing shared by the galaxy and system views.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { CameraRig } from "./CameraRig";
import { createSkyMaterial, createStarfield } from "./materials/misc";

export interface View {
  readonly scene: THREE.Scene;
  update(dt: number, time: number): void;
  pick(ndc: THREE.Vector2, camera: THREE.Camera): PickResult | null;
  dispose(): void;
}

export interface PickResult {
  kind: "body" | "fleet" | "gate" | "system" | "point";
  id: string;
  point?: THREE.Vector3;
}

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly rig: CameraRig;
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloom: UnrealBloomPass;
  private fxaa: ShaderPass;
  private view: View | null = null;
  private sky: THREE.Mesh;
  private stars: THREE.Points;
  private background = new THREE.Scene();
  /** Soft studio-like reflections so metal hulls and rocks read well in space. */
  readonly envMap: THREE.Texture;

  constructor(readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    container.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.05, 20000);
    this.rig = new CameraRig(this.camera);

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24), createSkyMaterial(new THREE.Color("#3a5dff"), 0.35, 1.7));
    this.sky.renderOrder = -20;
    this.stars = createStarfield(9000, 8000, 7);
    this.background.add(this.sky, this.stars);

    const size = new THREE.Vector2(container.clientWidth, container.clientHeight);
    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType }));
    this.renderPass = new RenderPass(new THREE.Scene(), this.camera);
    this.renderPass.clear = false;
    this.bloom = new UnrealBloomPass(size, 0.7, 0.45, 0.92);
    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.fxaa);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  setView(view: View): void {
    if (this.view && this.view !== view) this.view.dispose();
    this.view = view;
    this.renderPass.scene = view.scene;
  }

  getView(): View | null {
    return this.view;
  }

  setSky(nebula: string | undefined, seed: number): void {
    const mat = this.sky.material as THREE.ShaderMaterial;
    mat.uniforms.uNebula.value.set(nebula ?? "#2a3cff");
    mat.uniforms.uNebulaStrength.value = nebula ? 1.1 : 0.3;
    mat.uniforms.uSeed.value = seed;
  }

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.fxaa.material.uniforms["resolution"].value.set(1 / (w * pr), 1 / (h * pr));
  }

  render(dt: number, time: number): void {
    this.rig.update(dt);
    if (this.view) this.view.update(dt, time);
    // Background follows the camera so it's infinitely far away.
    this.sky.position.copy(this.camera.position);
    this.stars.position.copy(this.camera.position);
    (this.stars.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
    // Background is drawn into the composer's first target by rendering it first.
    this.renderer.setRenderTarget(this.composer.readBuffer);
    this.renderer.clear();
    this.renderer.render(this.background, this.camera);
    this.composer.render(dt);
  }

  /** Pick at client (pixel) coordinates. */
  pick(clientX: number, clientY: number): PickResult | null {
    if (!this.view) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    return this.view.pick(ndc, this.camera);
  }

  /** Project a world position to client pixels; null if behind the camera. */
  project(p: THREE.Vector3): { x: number; y: number; depth: number } | null {
    const v = p.clone().project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height, depth: v.z };
  }

  setBloom(strength: number): void {
    this.bloom.strength = strength;
  }
}
