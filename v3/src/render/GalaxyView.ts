// Galaxy map: stars, tunnel network, territories, fleets in transit, battles.

import * as THREE from "three";
import { STAR_TYPE_MAP } from "../sim/data/stars";
import { systemOwnerMap } from "../sim/economy";
import { sensorSystems } from "../sim/knowledge";
import type { PlayerFacade as Game } from "../sim/facade";
import type { PickResult, View } from "./Engine";
import { temperatureColor } from "./glsl";
import { createLinkMaterial, getGlowTexture, glowSprite } from "./materials/misc";
import { galaxyPos } from "./scale";

interface SystemVisual {
  id: string;
  group: THREE.Group;
  core: THREE.Sprite;
  halo: THREE.Sprite;
  territory: THREE.Sprite;
  pos: THREE.Vector3;
}

export class GalaxyView implements View {
  readonly scene = new THREE.Scene();
  private systems = new Map<string, SystemVisual>();
  private links: { id: string; mesh: THREE.Mesh; mat: THREE.ShaderMaterial; a: string; b: string }[] = [];
  private fleetGroup = new THREE.Group();
  private battleGroup = new THREE.Group();
  private pickables: THREE.Object3D[] = [];
  private selectionRing: THREE.Mesh;
  private hoverRing: THREE.Mesh;
  private dust: THREE.Points;
  selected: PickResult | null = null;
  hovered: PickResult | null = null;
  alpha = 0;
  private time = 0;
  private owners: Record<string, string | null> = {};

  constructor(
    readonly game: Game,
    private camera: THREE.Camera,
  ) {
    this.dust = this.buildGalaxyBackdrop();
    this.scene.add(this.dust, this.fleetGroup, this.battleGroup);
    for (const sys of Object.values(game.state.systems)) this.buildSystem(sys.id);
    for (const t of Object.values(game.state.tunnels)) this.buildLink(t.id);
    const ringGeo = new THREE.RingGeometry(1, 1.1, 64);
    this.selectionRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color("#7fe3ff"), transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.hoverRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.selectionRing, this.hoverRing);
    this.sync();
  }

  private buildGalaxyBackdrop(): THREE.Points {
    const s = this.game.state;
    const pts = Object.values(s.systems).map((x) => galaxyPos(x.pos));
    let maxR = 0;
    for (const p of pts) maxR = Math.max(maxR, Math.hypot(p.x, p.z));
    const R = maxR * 1.35;
    const count = 26000;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    let seed = 1234;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const arms = 3;
    for (let i = 0; i < count; i++) {
      const r = R * Math.pow(rnd(), 0.7);
      const arm = Math.floor(rnd() * arms);
      const th = (arm / arms) * Math.PI * 2 + (r / R) * 3.2 + (rnd() - 0.5) * (0.9 - (r / R) * 0.4);
      const bulge = rnd() < 0.18;
      const rr = bulge ? R * 0.18 * Math.pow(rnd(), 1.5) : r;
      const tt = bulge ? rnd() * Math.PI * 2 : th;
      pos[i * 3] = Math.cos(tt) * rr;
      pos[i * 3 + 1] = (rnd() - 0.5) * (bulge ? 18 : 6) - 8;
      pos[i * 3 + 2] = Math.sin(tt) * rr;
      const warm = bulge || rnd() < 0.25;
      const b = 0.15 + rnd() * 0.35;
      col.set(warm ? [b * 1.2, b * 0.95, b * 0.7] : [b * 0.7, b * 0.85, b * 1.25], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size: 2.2, map: getGlowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const p = new THREE.Points(g, m);
    const core = glowSprite("#ffd9a8", R * 0.7, 0.18);
    core.position.y = -8;
    p.add(core);
    return p;
  }

  private buildSystem(id: string): void {
    const s = this.game.state;
    const sys = s.systems[id];
    const star = s.bodies[sys.starIds[0]];
    const st = STAR_TYPE_MAP[star.type];
    const [r, g, b] = st.special === "blackhole" ? [1, 0.6, 0.3] : temperatureColor(st.temperature || 4000);
    const color = new THREE.Color(r, g, b);
    const p = galaxyPos(sys.pos);
    const group = new THREE.Group();
    group.position.set(p.x, p.y, p.z);
    const size = st.special === "giant" ? 7 : st.special === "blackhole" ? 5 : st.special === "neutron" ? 4 : st.id === "red_dwarf" || st.id === "brown_dwarf" ? 3.4 : 4.6;
    const halo = glowSprite(color, size * 4, 0.55);
    const core = glowSprite(color.clone().multiplyScalar(3), size, 1);
    group.add(halo, core);
    if (sys.starIds.length > 1) {
      const comp = s.bodies[sys.starIds[1]];
      const [cr, cg, cb] = temperatureColor(STAR_TYPE_MAP[comp.type].temperature || 4000);
      const c2 = glowSprite(new THREE.Color(cr, cg, cb).multiplyScalar(2.5), size * 0.6, 1);
      c2.position.set(size * 0.55, 0.3, 0);
      group.add(c2);
    }
    if (sys.nebula) {
      const neb = glowSprite(sys.nebula, 34, 0.12);
      neb.position.y = -1;
      group.add(neb);
    }
    const territory = glowSprite("#ffffff", 44, 0);
    territory.position.y = -2;
    group.add(territory);
    const pick = new THREE.Mesh(new THREE.SphereGeometry(5, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
    pick.userData.pick = { kind: "system", id } as PickResult;
    group.add(pick);
    this.pickables.push(pick);
    this.scene.add(group);
    this.systems.set(id, { id, group, core, halo, territory, pos: new THREE.Vector3(p.x, p.y, p.z) });
  }

  private buildLink(tunnelId: string): void {
    const t = this.game.state.tunnels[tunnelId];
    const a = this.systems.get(t.a)!.pos;
    const b = this.systems.get(t.b)!.pos;
    // Slightly curved flat ribbon.
    const mid = a.clone().lerp(b, 0.5);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    mid.addScaledVector(perp, len * 0.06).y += len * 0.03;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const N = 40;
    const width = 0.55;
    const positions: number[] = [];
    const ts: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const tt = i / N;
      const p = curve.getPoint(tt);
      const tan = curve.getTangent(tt);
      const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize().multiplyScalar(width);
      positions.push(p.x + side.x, p.y, p.z + side.z, p.x - side.x, p.y, p.z - side.z);
      ts.push(tt, tt);
      if (i < N) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("aT", new THREE.Float32BufferAttribute(ts, 1));
    geo.setIndex(idx);
    const mat = createLinkMaterial(new THREE.Color("#4fa8ff"), 0.6, len / 6);
    mat.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.curve = curve;
    this.scene.add(mesh);
    this.links.push({ id: tunnelId, mesh, mat, a: t.a, b: t.b });
  }

  /** Reconcile ownership, exploration and fleets with the sim. */
  sync(): void {
    const s = this.game.state;
    const player = s.empires[s.playerId];
    this.owners = systemOwnerMap(s);
    for (const v of this.systems.values()) {
      const explored = !!player.explored[v.id];
      const known = explored || s.systems[v.id].gates.some((g) => player.explored[g.otherSystemId]);
      (v.core.material as THREE.SpriteMaterial).opacity = explored ? 1 : known ? 0.55 : 0.25;
      (v.halo.material as THREE.SpriteMaterial).opacity = explored ? 0.55 : 0.18;
      const owner = this.owners[v.id];
      const tm = v.territory.material as THREE.SpriteMaterial;
      if (owner && (explored || owner === s.playerId)) {
        tm.color.set(s.empires[owner].color);
        tm.opacity = 0.2;
      } else tm.opacity = 0;
    }
    for (const l of this.links) {
      const known = player.explored[l.a] || player.explored[l.b];
      l.mesh.visible = !!known;
      const oa = this.owners[l.a];
      const ob = this.owners[l.b];
      const col = oa && oa === ob ? s.empires[oa].color : "#4fa8ff";
      l.mat.uniforms.uColor.value.set(col);
      l.mat.uniforms.uOpacity.value = player.explored[l.a] && player.explored[l.b] ? 0.7 : 0.3;
    }
  }

  update(dt: number, time: number): void {
    void dt;
    this.time = time;
    for (const l of this.links) l.mat.uniforms.uTime.value = time;
    this.dust.rotation.y = time * 0.002;
    // Twinkle
    for (const v of this.systems.values()) v.core.scale.setScalar((v.core.userData.base ??= v.core.scale.x) * (0.95 + 0.05 * Math.sin(time * 2 + v.pos.x)));
    this.updateFleets();
    this.updateRings();
  }

  private fleetMarkerMat = new Map<string, THREE.SpriteMaterial>();

  private updateFleets(): void {
    while (this.fleetGroup.children.length) this.fleetGroup.remove(this.fleetGroup.children[0]);
    while (this.battleGroup.children.length) this.battleGroup.remove(this.battleGroup.children[0]);
    const s = this.game.state;
    const sensors = sensorSystems(s, s.playerId);
    const perSystem = new Map<string, number>();
    for (const f of Object.values(s.fleets)) {
      if (!f.ships.length) continue;
      const mine = f.empireId === s.playerId;
      let pos: THREE.Vector3;
      if (f.transit) {
        const link = this.links.find((l) => l.id === f.transit!.tunnelId);
        if (!link) continue;
        if (!mine && !sensors.has(f.transit.from) && !sensors.has(f.transit.to)) continue;
        const curve = link.mesh.userData.curve as THREE.QuadraticBezierCurve3;
        let t = Math.min(1, (f.transit.progress + 0.1 * this.alpha) / f.transit.total);
        if (link.a !== f.transit.from) t = 1 - t;
        pos = curve.getPoint(t);
      } else if (f.systemId) {
        if (!mine && !sensors.has(f.systemId)) continue;
        const k = perSystem.get(f.systemId) ?? 0;
        perSystem.set(f.systemId, k + 1);
        const base = this.systems.get(f.systemId)!.pos;
        const a = k * 1.1 + 0.6;
        pos = base.clone().add(new THREE.Vector3(Math.cos(a) * (6 + k * 0.6), 2, Math.sin(a) * (6 + k * 0.6)));
      } else continue;
      const color = s.empires[f.empireId].color;
      let mat = this.fleetMarkerMat.get(color);
      if (!mat) {
        mat = new THREE.SpriteMaterial({ map: getGlowTexture(), color: new THREE.Color(color).multiplyScalar(2.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        this.fleetMarkerMat.set(color, mat);
      }
      const spr = new THREE.Sprite(mat);
      spr.position.copy(pos);
      spr.scale.setScalar(2.2 + Math.min(4, Math.sqrt(f.ships.length)));
      spr.userData.pick = { kind: "fleet", id: f.id } as PickResult;
      spr.userData.fleetId = f.id;
      this.fleetGroup.add(spr);
    }
    for (const b of Object.values(s.battles)) {
      if (!sensors.has(b.systemId)) continue;
      const v = this.systems.get(b.systemId);
      if (!v) continue;
      const spr = glowSprite("#ff3030", 14 + Math.sin(this.time * 6) * 3, 0.5);
      spr.position.copy(v.pos);
      this.battleGroup.add(spr);
    }
  }

  private updateRings(): void {
    const place = (ring: THREE.Mesh, sel: PickResult | null, scale: number) => {
      ring.visible = false;
      if (!sel) return;
      let p: THREE.Vector3 | null = null;
      if (sel.kind === "system") p = this.systems.get(sel.id)?.pos ?? null;
      else if (sel.kind === "fleet") {
        const spr = this.fleetGroup.children.find((c) => c.userData.fleetId === sel.id);
        p = spr ? spr.position : null;
      }
      if (!p) return;
      ring.visible = true;
      ring.position.copy(p);
      ring.scale.setScalar(sel.kind === "fleet" ? scale * 0.5 : scale);
      ring.lookAt(this.camera.position);
    };
    place(this.selectionRing, this.selected, 7);
    place(this.hoverRing, this.hovered && this.hovered.id !== this.selected?.id ? this.hovered : null, 7);
  }

  systemPos(id: string): THREE.Vector3 | null {
    return this.systems.get(id)?.pos.clone() ?? null;
  }

  pick(ndc: THREE.Vector2, camera: THREE.Camera): PickResult | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    // Fleets first (sprites), then systems.
    const fleetHits = ray.intersectObjects(this.fleetGroup.children, false);
    if (fleetHits.length) return fleetHits[0].object.userData.pick as PickResult;
    const hits = ray.intersectObjects(this.pickables, false);
    if (hits.length) return hits[0].object.userData.pick as PickResult;
    // Nearest system to the ray (generous clicking).
    let best: { id: string; d: number } | null = null;
    for (const v of this.systems.values()) {
      const d = ray.ray.distanceToPoint(v.pos);
      if (d < 9 && (!best || d < best.d)) best = { id: v.id, d };
    }
    return best ? { kind: "system", id: best.id } : null;
  }

  labelAnchors(): { key: string; text: string; sub?: string; pos: THREE.Vector3; color: string; kind: string; size: number }[] {
    const s = this.game.state;
    const player = s.empires[s.playerId];
    const out: { key: string; text: string; sub?: string; pos: THREE.Vector3; color: string; kind: string; size: number }[] = [];
    for (const v of this.systems.values()) {
      const explored = !!player.explored[v.id];
      const owner = this.owners[v.id];
      const pos = v.pos.clone();
      pos.y += 4;
      const star = s.bodies[s.systems[v.id].starIds[0]];
      out.push({
        key: `s:${v.id}`,
        text: explored ? s.systems[v.id].name : "Unexplored",
        sub: explored ? STAR_TYPE_MAP[star.type].name : undefined,
        pos,
        color: owner && explored ? s.empires[owner].color : explored ? "#d8e6ff" : "#7a8599",
        kind: "system",
        size: 4,
      });
    }
    return out;
  }

  dispose(): void {
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | undefined;
      if (mat && !Array.isArray(mat)) mat.dispose();
    });
  }
}
