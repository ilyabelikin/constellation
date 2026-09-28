// Live 3D view of a single star system.

import * as THREE from "three";
import { BELT_TYPE_MAP, PLANET_TYPE_MAP } from "../sim/data/planets";
import { HULL_MAP } from "../sim/data/ships";
import { STAR_TYPE_MAP } from "../sim/data/stars";
import { STATION_MAP } from "../sim/data/structures";
import type { PlayerFacade as Game } from "../sim/facade";
import { sensorSystems } from "../sim/knowledge";
import { orbitPosition } from "../sim/orbits";
import type { Body, Fleet, SimEvent, Station } from "../sim/types";
import { Shuttles } from "./Shuttles";
import { Effects } from "./Effects";
import type { PickResult, View } from "./Engine";
import { temperatureColor } from "./glsl";
import { createGateMaterial, getGlowTexture, glowSprite } from "./materials/misc";
import {
  createAtmosphereMaterial,
  createCloudMaterial,
  createPlanetMaterial,
  createRingMaterial,
} from "./materials/planet";
import { createAccretionDiskMaterial, createBeamMaterial, createCoronaMaterial, createStarMaterial } from "./materials/star";
import { mapSystemPos, moonVisualRadius, planetVisualRadius, shipVisualLength, starVisualRadius, auToScene } from "./scale";
import { hullMaterial, radiatorMat, shipModel } from "./ShipModels";
import { stationGeometry, stationMaterial } from "./StationModels";

interface BodyVisual {
  body: Body;
  group: THREE.Group; // positioned at body centre
  spin: THREE.Object3D | null; // rotates with the day
  radius: number; // visual radius
  materials: THREE.ShaderMaterial[];
  surface?: THREE.ShaderMaterial;
  ringMat?: THREE.ShaderMaterial;
  colonyRing?: THREE.Mesh;
  colonyEmpire?: string;
}

interface FleetVisual {
  fleet: Fleet;
  group: THREE.Group;
  ships: THREE.Group[];
  engines: THREE.Sprite[];
  shipKey: string;
  heading: THREE.Vector3;
  pos: THREE.Vector3;
  pick: THREE.Mesh;
  radius: number;
  /** Seconds until the next landing shuttle leaves (while unloading). */
  shuttleTimer?: number;
}

interface StationVisual {
  station: Station;
  mesh: THREE.Object3D;
  angle: number;
}

const tmpV = { x: 0, y: 0, z: 0 };

export class SystemView implements View {
  readonly scene = new THREE.Scene();
  readonly effects = new Effects();
  readonly shuttles = new Shuttles();
  private bodies = new Map<string, BodyVisual>();
  private fleets = new Map<string, FleetVisual>();
  private stations = new Map<string, StationVisual>();
  private gates: { tunnelId: string; group: THREE.Group; mat: THREE.ShaderMaterial; to: string }[] = [];
  private belts: { body: Body; mesh: THREE.InstancedMesh }[] = [];
  private comets: { body: Body; group: THREE.Group; tail: THREE.Points }[] = [];
  private animated: THREE.ShaderMaterial[] = [];
  private pickables: THREE.Object3D[] = [];
  private orbitLines = new THREE.Group();
  private pathLines = new THREE.Group();
  private battleMarkers = new THREE.Group();
  private selectionRing: THREE.Mesh;
  private hoverRing: THREE.Mesh;
  private dysonGroups = new Map<string, THREE.InstancedMesh>();
  private pulsarBeams: THREE.Group | null = null;
  selected: PickResult | null = null;
  hovered: PickResult | null = null;
  renderDay = 0;
  alpha = 0;

  constructor(
    readonly game: Game,
    readonly systemId: string,
    private camera: THREE.Camera,
    envMap?: THREE.Texture,
  ) {
    const sys = game.state.systems[systemId];
    if (envMap) {
      this.scene.environment = envMap;
      this.scene.environmentIntensity = 0.28;
    }
    this.scene.add(new THREE.AmbientLight(0x8090b0, 0.18));
    this.scene.add(this.orbitLines, this.pathLines, this.battleMarkers, this.effects.group, this.shuttles.group);
    for (const sid of sys.starIds) this.buildStar(game.state.bodies[sid]);
    for (const bid of sys.bodyIds) {
      const b = game.state.bodies[bid];
      if (b.kind === "planet" || b.kind === "moon") this.buildPlanet(b);
      else if (b.kind === "belt") this.buildBelt(b);
      else if (b.kind === "comet") this.buildComet(b);
    }
    this.buildOrbits();
    this.buildGates();
    const ringGeo = new THREE.RingGeometry(1, 1.035, 96);
    this.selectionRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color("#7fe3ff"), transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.hoverRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffffff"), transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.selectionRing.visible = false;
    this.hoverRing.visible = false;
    this.scene.add(this.selectionRing, this.hoverRing);
    this.sync();
  }

  get extentScene(): number {
    return auToScene(this.game.state.systems[this.systemId].extent);
  }

  // ------------------------------------------------------------------ build
  private buildStar(body: Body): void {
    const st = STAR_TYPE_MAP[body.type];
    const r = starVisualRadius(body.type, body.radius);
    const [cr, cg, cb] = temperatureColor(st.temperature || 4000);
    const color = new THREE.Color(cr, cg, cb);
    const group = new THREE.Group();
    const spin = new THREE.Group();
    group.add(spin);
    const materials: THREE.ShaderMaterial[] = [];
    let lightColor = color.clone();
    let lightIntensity = 2.4;

    if (st.special === "blackhole") {
      const horizon = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      spin.add(horizon);
      const diskMat = createAccretionDiskMaterial(r * 1.6, r * 7);
      diskMat.uniforms.uGain.value = 0.42;
      const disk = new THREE.Mesh(new THREE.RingGeometry(r * 1.6, r * 7, 128, 4), diskMat);
      disk.rotation.x = -Math.PI / 2 + 0.25;
      group.add(disk);
      // Lensed "halo" of the far side of the disk arching over the hole.
      const halo = new THREE.Mesh(new THREE.RingGeometry(r * 1.25, r * 2.2, 96, 2), diskMat.clone());
      (halo.material as THREE.ShaderMaterial).uniforms.uInner.value = r * 1.25;
      (halo.material as THREE.ShaderMaterial).uniforms.uOuter.value = r * 2.2;
      (halo.material as THREE.ShaderMaterial).uniforms.uGain.value = 0.3;
      group.add(halo);
      materials.push(diskMat, halo.material as THREE.ShaderMaterial);
      const photon = new THREE.Mesh(new THREE.TorusGeometry(r * 1.08, r * 0.025, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd9a0").multiplyScalar(1.6) }));
      halo.add(photon); // billboarded with the lensed halo
      group.add(glowSprite("#ff9a4a", r * 12, 0.08));
      lightColor = new THREE.Color("#ffb070");
      lightIntensity = 1.4;
      (halo as THREE.Mesh).userData.billboard = true;
      this.haloMesh = halo;
    } else if (st.special === "neutron") {
      const core = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 0.9, 1).multiplyScalar(8) }));
      spin.add(core);
      group.add(glowSprite("#9fc8ff", r * 12, 0.5));
      const beams = new THREE.Group();
      const beamMat = createBeamMaterial(new THREE.Color("#a8d0ff"));
      materials.push(beamMat);
      for (const s of [1, -1]) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(r * 2.2, 60, 24, 1, true), beamMat);
        cone.geometry.translate(0, -30, 0);
        cone.rotation.x = s > 0 ? Math.PI : 0;
        beams.add(cone);
      }
      beams.rotation.z = 0.5;
      group.add(beams);
      this.pulsarBeams = beams;
      const coronaMat = createCoronaMaterial(new THREE.Color("#8fb8ff"), 0.7, 0.05);
      const corona = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), coronaMat);
      corona.scale.setScalar(r * 14);
      group.add(corona);
      materials.push(coronaMat);
      lightColor = new THREE.Color("#b8d6ff");
      lightIntensity = 1.2;
    } else {
      const intensity = st.id === "brown_dwarf" ? 1.1 : st.special === "whitedwarf" ? 3 : 1.7;
      const surf = createStarMaterial(color, intensity, body.seed, st.id === "red_dwarf" || st.id === "red_giant" ? 1.4 : 0.6);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 64, 48), surf);
      spin.add(mesh);
      materials.push(surf);
      const coronaSize = r * (st.special === "whitedwarf" ? 9 : st.special === "giant" ? 2.3 : 3.2);
      const coronaMat = createCoronaMaterial(color, st.id === "brown_dwarf" ? 0.35 : 0.6, r / coronaSize);
      const corona = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), coronaMat);
      corona.scale.setScalar(coronaSize);
      group.add(corona);
      materials.push(coronaMat);
      group.add(glowSprite(color, r * 6, 0.14));
      if (st.special === "protostar") {
        // Glowing protoplanetary disk.
        const diskMat = createAccretionDiskMaterial(r * 2, r * 14);
        diskMat.uniforms.uHot.value.set("#ffcf9a");
        diskMat.uniforms.uCool.value.set("#6a3a2a");
        diskMat.uniforms.uGain.value = 0.35;
        const disk = new THREE.Mesh(new THREE.RingGeometry(r * 2, r * 14, 128, 4), diskMat);
        disk.rotation.x = -Math.PI / 2;
        group.add(disk);
        materials.push(diskMat);
      }
      lightIntensity = st.id === "brown_dwarf" ? 0.9 : 2.4;
    }
    const light = new THREE.PointLight(lightColor, lightIntensity, 0, 0);
    group.add(light);
    this.scene.add(group);
    this.animated.push(...materials);
    const pick = new THREE.Mesh(new THREE.SphereGeometry(Math.max(r * 1.2, 3), 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    pick.userData.pick = { kind: "body", id: body.id } as PickResult;
    group.add(pick);
    this.pickables.push(pick);
    this.bodies.set(body.id, { body, group, spin, radius: r, materials, surface: materials[0] });
  }

  private haloMesh: THREE.Mesh | null = null;

  private buildPlanet(body: Body): void {
    const pt = PLANET_TYPE_MAP[body.type];
    const r = body.kind === "moon" ? moonVisualRadius(body.radius) : planetVisualRadius(body.radius);
    const group = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.rotation.z = body.axialTilt;
    group.add(tilt);
    const spin = new THREE.Group();
    tilt.add(spin);
    const materials: THREE.ShaderMaterial[] = [];
    const seg = body.kind === "moon" ? 40 : 72;
    const surface = createPlanetMaterial({ visual: pt.visual, seed: body.seed });
    spin.add(new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg / 2), surface));
    materials.push(surface);
    if (pt.visual.clouds > 0.01 && pt.visual.style !== "shrouded") {
      const clouds = createCloudMaterial(pt.visual, body.seed);
      const cm = new THREE.Mesh(new THREE.SphereGeometry(r * 1.012, seg, seg / 2), clouds);
      cm.userData.cloud = true;
      spin.add(cm);
      materials.push(clouds);
    }
    if (pt.visual.atmosphere) {
      const atmo = createAtmosphereMaterial(pt.visual.atmosphere, pt.visual.atmosphereStrength);
      tilt.add(new THREE.Mesh(new THREE.SphereGeometry(r * (1.05 + 0.03 * pt.visual.atmosphereStrength), seg, seg / 2), atmo));
      materials.push(atmo);
    }
    let ringMat: THREE.ShaderMaterial | undefined;
    if (body.ring) {
      const inner = r * body.ring.inner;
      const outer = r * body.ring.outer;
      ringMat = createRingMaterial(body.ring.color, body.ring.opacity, inner, outer, body.seed);
      const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 128, 1), ringMat);
      ring.rotation.x = -Math.PI / 2 + body.ring.tilt;
      tilt.add(ring);
      materials.push(ringMat);
    }
    this.scene.add(group);
    this.animated.push(...materials);
    const pick = new THREE.Mesh(new THREE.SphereGeometry(Math.max(r * 1.4, 1.6), 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    pick.userData.pick = { kind: "body", id: body.id } as PickResult;
    group.add(pick);
    this.pickables.push(pick);
    this.bodies.set(body.id, { body, group, spin, radius: r, materials, surface, ringMat });
  }

  private buildBelt(body: Body): void {
    const bt = BELT_TYPE_MAP[body.type];
    const count = body.type === "icy" ? 900 : 700;
    const geos = [0, 1, 2].map((k) => {
      const g = new THREE.IcosahedronGeometry(1, 1);
      const p = g.getAttribute("position");
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const y = p.getY(i);
        const z = p.getZ(i);
        const n = 0.7 + 0.45 * Math.abs(Math.sin(x * (4 + k) + y * 7.3 + z * (3 + k * 2)));
        p.setXYZ(i, x * n, y * n * (0.7 + k * 0.1), z * n);
      }
      g.computeVertexNormals();
      return g;
    });
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9 - bt.metalness * 0.5,
      metalness: bt.metalness,
      flatShading: true,
      emissive: body.type === "crystalline" ? new THREE.Color("#6a4cff").multiplyScalar(0.6) : new THREE.Color(0),
    });
    const mesh = new THREE.InstancedMesh(geos[body.seed % 3], mat, count);
    const c0 = new THREE.Color(bt.colors[0]);
    const c1 = new THREE.Color(bt.colors[1]);
    let s = body.seed || 1;
    const rnd = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const a = body.orbit!.a;
    const w = body.radius;
    for (let i = 0; i < count; i++) {
      const rr = a + (rnd() + rnd() + rnd() - 1.5) * w * 0.8;
      const ang = rnd() * Math.PI * 2;
      const rs = auToScene(rr);
      const y = (rnd() - 0.5) * (auToScene(a + w) - auToScene(a - w)) * 0.18;
      e.set(rnd() * 6, rnd() * 6, rnd() * 6);
      q.setFromEuler(e);
      const sc = 0.08 + Math.pow(rnd(), 4) * 0.55;
      m.compose(new THREE.Vector3(Math.cos(ang) * rs, y, Math.sin(ang) * rs), q, new THREE.Vector3(sc, sc * (0.6 + rnd() * 0.6), sc));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c0.clone().lerp(c1, rnd()));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.rotation.x = body.orbit!.inclination;
    this.scene.add(mesh);
    this.belts.push({ body, mesh });
    // Pick handle: a thin torus following the belt.
    const pr = auToScene(a);
    const pick = new THREE.Mesh(new THREE.TorusGeometry(pr, Math.max(2.5, (auToScene(a + w) - auToScene(a - w)) * 0.5), 6, 64), new THREE.MeshBasicMaterial({ visible: false }));
    pick.rotation.x = Math.PI / 2;
    pick.userData.pick = { kind: "body", id: body.id } as PickResult;
    this.scene.add(pick);
    this.pickables.push(pick);
    const group = new THREE.Group();
    this.scene.add(group);
    this.bodies.set(body.id, { body, group, spin: null, radius: 2, materials: [] });
  }

  private buildComet(body: Body): void {
    const group = new THREE.Group();
    const nucleus = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 1), new THREE.MeshStandardMaterial({ color: "#8a8680", roughness: 1, flatShading: true }));
    group.add(nucleus);
    group.add(glowSprite("#bfe8ff", 2.2, 0.8));
    const n = 90;
    const pos = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const tail = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 1.4, map: getGlowTexture(), color: new THREE.Color("#9fd8ff").multiplyScalar(1.3), transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    tail.frustumCulled = false;
    this.scene.add(group, tail);
    const pick = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    pick.userData.pick = { kind: "body", id: body.id } as PickResult;
    group.add(pick);
    this.pickables.push(pick);
    this.comets.push({ body, group, tail });
    this.bodies.set(body.id, { body, group, spin: nucleus, radius: 0.5, materials: [] });
  }

  private buildOrbits(): void {
    const sys = this.game.state.systems[this.systemId];
    for (const id of [...sys.bodyIds, ...sys.starIds]) {
      const b = this.game.state.bodies[id];
      if (!b.orbit || b.kind === "moon" || b.kind === "belt") continue;
      const pts: THREE.Vector3[] = [];
      const N = b.kind === "comet" ? 256 : 180;
      for (let i = 0; i <= N; i++) {
        const o = { ...b.orbit, phase: (i / N) * Math.PI * 2 };
        const p = orbitPosition(o, 0, tmpV);
        const m = mapSystemPos(p);
        pts.push(new THREE.Vector3(m.x, m.y, m.z));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const color = b.kind === "comet" ? "#6fb6ff" : b.kind === "star" ? "#ffcf80" : "#5f86c8";
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: b.kind === "comet" ? 0.12 : 0.2, depthWrite: false }));
      line.userData.bodyId = id;
      this.orbitLines.add(line);
    }
  }

  private buildGates(): void {
    const sys = this.game.state.systems[this.systemId];
    for (const gate of sys.gates) {
      const group = new THREE.Group();
      const p = mapSystemPos(gate.pos);
      group.position.set(p.x, p.y, p.z);
      group.lookAt(0, 0, 0);
      const ringMat = new THREE.MeshStandardMaterial({ color: "#8a93a6", metalness: 0.85, roughness: 0.3, emissive: new THREE.Color("#2a4a8a"), emissiveIntensity: 0.4 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.35, 12, 64), ringMat);
      group.add(ring);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const node = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 1.1), ringMat);
        node.position.set(Math.cos(a) * 4, Math.sin(a) * 4, 0);
        node.rotation.z = a;
        group.add(node);
        const light = glowSprite("#7fc8ff", 1.2, 0.9);
        light.position.set(Math.cos(a) * 4.5, Math.sin(a) * 4.5, 0.4);
        group.add(light);
      }
      const mat = createGateMaterial(new THREE.Color("#5fa8ff"));
      const membrane = new THREE.Mesh(new THREE.CircleGeometry(3.7, 64), mat);
      group.add(membrane);
      group.add(glowSprite("#5fa8ff", 14, 0.25));
      this.scene.add(group);
      this.animated.push(mat);
      const pick = new THREE.Mesh(new THREE.SphereGeometry(5, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
      pick.userData.pick = { kind: "gate", id: gate.tunnelId } as PickResult;
      group.add(pick);
      this.pickables.push(pick);
      this.gates.push({ tunnelId: gate.tunnelId, group, mat, to: gate.otherSystemId });
    }
  }

  // ------------------------------------------------------------------ sync
  /** Reconcile dynamic objects (fleets, stations, colonies) with sim state. */
  sync(): void {
    const s = this.game.state;
    // Fleets
    const present = new Set<string>();
    for (const f of Object.values(s.fleets)) {
      if (f.systemId !== this.systemId || f.transit || !f.ships.length) continue;
      if (!this.isVisible(f)) continue;
      present.add(f.id);
      const key = f.ships.slice(0, 24).map((sh) => sh.hull).join(",");
      const existing = this.fleets.get(f.id);
      if (existing && existing.shipKey === key) {
        existing.fleet = f;
        continue;
      }
      if (existing) this.removeFleet(f.id);
      this.buildFleet(f, key);
    }
    for (const id of [...this.fleets.keys()]) if (!present.has(id)) this.removeFleet(id);

    // Stations
    const stPresent = new Set<string>();
    for (const st of Object.values(s.stations)) {
      if (st.systemId !== this.systemId) continue;
      stPresent.add(st.id);
      if (!this.stations.has(st.id)) this.buildStation(st);
    }
    for (const [id, v] of this.stations) {
      if (!stPresent.has(id)) {
        v.mesh.parent?.remove(v.mesh);
        this.stations.delete(id);
      }
    }
    // Dyson swarms
    for (const sid of s.systems[this.systemId].starIds) {
      const has = Object.values(s.stations).find((st) => st.bodyId === sid && st.type === "dyson_swarm");
      const existing = this.dysonGroups.get(sid);
      if (has && !existing) this.buildDyson(sid, s.empires[has.empireId].color);
      if (!has && existing) {
        existing.parent?.remove(existing);
        this.dysonGroups.delete(sid);
      }
    }

    // Colonies: rings + city lights
    for (const bv of this.bodies.values()) {
      const col = Object.values(s.colonies).find((c) => c.bodyId === bv.body.id);
      const empireId = col?.empireId;
      if (bv.surface?.uniforms.uCity) bv.surface.uniforms.uCity.value = col ? Math.min(1, 0.25 + col.pop / 12) : 0;
      if (bv.colonyEmpire !== empireId) {
        if (bv.colonyRing) {
          bv.group.remove(bv.colonyRing);
          bv.colonyRing = undefined;
        }
        if (empireId) {
          const color = new THREE.Color(s.empires[empireId].color);
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(bv.radius * 1.9, bv.radius * 1.9 + 0.12, 96),
            new THREE.MeshBasicMaterial({ color: color.multiplyScalar(1.6), transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
          );
          ring.rotation.x = -Math.PI / 2;
          bv.group.add(ring);
          bv.colonyRing = ring;
        }
        bv.colonyEmpire = empireId;
      }
    }
  }

  /** Fog of war: only show foreign fleets where the player has presence. */
  private isVisible(f: Fleet): boolean {
    return f.empireId === this.game.state.playerId || this.playerPresent();
  }

  private playerPresent(): boolean {
    return sensorSystems(this.game.state, this.game.state.playerId).has(this.systemId);
  }

  private buildFleet(f: Fleet, key: string): void {
    const s = this.game.state;
    const color = s.empires[f.empireId].color;
    const group = new THREE.Group();
    const ships: THREE.Group[] = [];
    const engines: THREE.Sprite[] = [];
    const shown = f.ships.slice(0, 24);
    let maxLen = 0;
    for (const sh of shown) maxLen = Math.max(maxLen, shipVisualLength(HULL_MAP[sh.hull].length));
    const spacing = Math.max(1.6, maxLen * 0.75);
    shown.forEach((ship, i) => {
      const hull = HULL_MAP[ship.hull];
      const model = shipModel(ship.hull);
      const len = shipVisualLength(hull.length);
      const scale = len / model.length;
      const sg = new THREE.Group();
      const hm = new THREE.Mesh(model.hull, hullMaterial(color));
      const rm = new THREE.Mesh(model.radiators, radiatorMat());
      sg.add(hm, rm);
      for (const e of model.engines) {
        const spr = glowSprite(hull.role === "military" ? "#7fd0ff" : "#ffd28a", 1.4 / scale * len * 0.35, 0.9);
        spr.position.copy(e);
        sg.add(spr);
        engines.push(spr);
      }
      sg.scale.setScalar(scale);
      // Formation: wedge behind the flagship.
      if (i > 0) {
        const ring = Math.ceil(i / 6);
        const a = ((i - 1) % 6) / 6 * Math.PI * 2 + ring * 0.5;
        sg.position.set(Math.cos(a) * ring * spacing, Math.sin(a) * ring * spacing * 0.45, -ring * spacing * 0.8);
      }
      group.add(sg);
      ships.push(sg);
    });
    const radius = Math.max(1.6, maxLen * 0.8 + Math.ceil((shown.length - 1) / 6) * spacing);
    const pick = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
    pick.userData.pick = { kind: "fleet", id: f.id } as PickResult;
    group.add(pick);
    // Empire-coloured marker so fleets read at a distance.
    const marker = glowSprite(color, radius * 1.3, 0.1);
    group.add(marker);
    this.scene.add(group);
    this.pickables.push(pick);
    const v: FleetVisual = { fleet: f, group, ships, engines, shipKey: key, heading: new THREE.Vector3(0, 0, 1), pos: new THREE.Vector3(), pick, radius };
    this.fleetWorld(f, v.pos);
    group.position.copy(v.pos);
    this.fleets.set(f.id, v);
  }

  private removeFleet(id: string): void {
    const v = this.fleets.get(id);
    if (!v) return;
    this.scene.remove(v.group);
    this.pickables = this.pickables.filter((p) => p !== v.pick);
    v.pick.geometry.dispose();
    this.fleets.delete(id);
  }

  private buildStation(st: Station): void {
    const s = this.game.state;
    const color = s.empires[st.empireId].color;
    const mesh = new THREE.Mesh(stationGeometry(st.type), stationMaterial(st.type === "pirate_haven" ? "#ff3030" : color));
    const holder = new THREE.Group();
    holder.add(mesh);
    const beacon = glowSprite(st.type === "pirate_haven" ? "#ff3030" : color, 1.6, 0.8);
    beacon.position.y = 0.8;
    holder.add(beacon);
    if (st.type === "pirate_haven") holder.scale.setScalar(1.6);
    this.scene.add(holder);
    const idx = Object.values(s.stations).filter((o) => o.bodyId === st.bodyId).indexOf(st);
    this.stations.set(st.id, { station: st, mesh: holder, angle: idx * 2.1 + (st.id.length % 7) });
  }

  private buildDyson(starId: string, color: string): void {
    const bv = this.bodies.get(starId)!;
    const count = 1400;
    const geo = new THREE.PlaneGeometry(0.35, 0.35);
    const mat = new THREE.MeshStandardMaterial({ color: "#d8c890", metalness: 0.9, roughness: 0.25, side: THREE.DoubleSide, emissive: new THREE.Color(color).multiplyScalar(0.3) });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const r = bv.radius * (1.9 + Math.random() * 0.6);
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const k = Math.sqrt(1 - u * u);
      dummy.position.set(Math.cos(th) * k * r, u * r, Math.sin(th) * k * r);
      dummy.lookAt(0, 0, 0);
      dummy.updateMatrix();
      m.copy(dummy.matrix);
      mesh.setMatrixAt(i, m);
    }
    bv.group.add(mesh);
    this.dysonGroups.set(starId, mesh);
  }

  // ------------------------------------------------------------------ positions
  bodyWorld(body: Body, out = new THREE.Vector3()): THREE.Vector3 {
    if (!body.orbit) return out.set(0, 0, 0);
    if (body.kind === "moon" && body.parentId) {
      const parent = this.game.state.bodies[body.parentId];
      this.bodyWorld(parent, out);
      const pv = this.bodies.get(parent.id);
      const pr = pv ? pv.radius : 2;
      const ratio = body.orbit.a / Math.max(parent.radius, 0.1);
      const d = pr * (1.6 + 0.42 * ratio);
      const o = orbitPosition({ ...body.orbit, a: d, e: 0 }, this.renderDay, tmpV);
      return out.set(out.x + o.x, out.y + o.y, out.z + o.z);
    }
    const p = orbitPosition(body.orbit, this.renderDay, tmpV);
    const m = mapSystemPos(p);
    return out.set(m.x, m.y, m.z);
  }

  bodyRadius(bodyId: string): number {
    return this.bodies.get(bodyId)?.radius ?? 1;
  }

  /** The body a fleet holds orbit around, or is on final approach to (in this system). */
  private anchorBody(f: Fleet): Body | null {
    const s = this.game.state;
    const id = !f.order ? f.orbitBodyId : f.order.route.length === 0 && f.order.systemId === this.systemId ? (f.order.bodyId ?? null) : null;
    const body = id ? s.bodies[id] : null;
    return body && body.systemId === this.systemId && body.kind !== "belt" ? body : null;
  }

  /** The fleet's parking-orbit slot around a body (scene space). */
  private orbitSlot(f: Fleet, body: Body, out: THREE.Vector3): THREE.Vector3 {
    this.bodyWorld(body, out);
    const r = this.bodyRadius(body.id) * (body.kind === "star" ? 2.4 : 2.1) + 1.8 + (hashId(f.id) % 3) * 0.9;
    const a = this.renderDay * 0.35 + (hashId(f.id) % 628) / 100;
    return out.set(out.x + Math.cos(a) * r, out.y + 0.6 + (hashId(f.id) % 5) * 0.25, out.z + Math.sin(a) * r);
  }

  /**
   * Visual position of a fleet: interpolated flight, holding a parking orbit
   * around its anchor body when idle. Ships heading for a body steer into
   * their orbit slot on final approach instead of flying into the planet.
   */
  fleetWorld(f: Fleet, out = new THREE.Vector3()): THREE.Vector3 {
    const body = this.anchorBody(f);
    if (body && !f.order) return this.orbitSlot(f, body, out);
    const x = f.prevPos.x + (f.pos.x - f.prevPos.x) * this.alpha;
    const y = f.prevPos.y + (f.pos.y - f.prevPos.y) * this.alpha;
    const z = f.prevPos.z + (f.pos.z - f.prevPos.z) * this.alpha;
    const m = mapSystemPos({ x, y, z });
    out.set(m.x, m.y + 0.6, m.z);
    if (body) {
      const center = this.bodyWorld(body, new THREE.Vector3());
      const slot = this.orbitSlot(f, body, new THREE.Vector3());
      const reach = slot.distanceTo(center) * 4;
      const k = Math.min(1, Math.max(0, 1 - out.distanceTo(center) / reach));
      out.addScaledVector(slot.sub(center), k * k * (3 - 2 * k));
    }
    return out;
  }

  refWorld(ref: string, out = new THREE.Vector3()): THREE.Vector3 | null {
    const [kind, id] = ref.split(":");
    if (kind === "fleet") {
      const v = this.fleets.get(id);
      if (v) {
        out.copy(v.pos);
        if (v.ships.length > 1) {
          const sh = v.ships[Math.floor(Math.random() * v.ships.length)];
          out.add(sh.position.clone().applyQuaternion(v.group.quaternion));
        }
        return out;
      }
      const f = this.game.state.fleets[id];
      return f ? this.fleetWorld(f, out) : null;
    }
    const body = this.game.state.bodies[id];
    if (!body) return null;
    this.bodyWorld(body, out);
    const st = [...this.stations.values()].find((s) => s.station.bodyId === id);
    if (st && Math.random() < 0.5) out.copy(st.mesh.position);
    else out.y += this.bodyRadius(id) * 0.5;
    return out;
  }

  gateWorld(tunnelId: string): THREE.Vector3 | null {
    const g = this.gates.find((x) => x.tunnelId === tunnelId);
    return g ? g.group.position.clone() : null;
  }

  // ------------------------------------------------------------------ frame
  update(dt: number, time: number): void {
    const s = this.game.state;
    const tmp = new THREE.Vector3();
    for (const bv of this.bodies.values()) {
      if (bv.body.kind === "belt") continue;
      this.bodyWorld(bv.body, tmp);
      bv.group.position.copy(tmp);
      if (bv.spin && bv.body.rotation) bv.spin.rotation.y = (this.renderDay / bv.body.rotation) * Math.PI * 2 * 0.25;
      for (const m of bv.materials) {
        if (m.uniforms.uTime) m.uniforms.uTime.value = time;
        if (m.uniforms.uLightPos) m.uniforms.uLightPos.value.set(0, 0, 0);
      }
      if (bv.ringMat) {
        bv.ringMat.uniforms.uPlanetPos.value.copy(tmp);
        bv.ringMat.uniforms.uPlanetRadius.value = bv.radius;
      }
    }
    if (this.haloMesh) this.haloMesh.lookAt(this.camera.position);
    if (this.pulsarBeams) this.pulsarBeams.rotation.y = time * 2.4;
    for (const g of this.gates) g.mat.uniforms.uTime.value = time;
    for (const m of this.animated) if (m.uniforms.uTime) m.uniforms.uTime.value = time;
    for (const b of this.belts) b.mesh.rotation.y = -(this.renderDay / b.body.orbit!.period) * Math.PI * 2;
    // Comet tails point away from the star.
    for (const c of this.comets) {
      const p = c.group.position;
      const away = p.clone().normalize();
      const dist = p.length();
      const len = Math.min(40, 900 / Math.max(dist, 10));
      const pos = (c.tail.geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
      const n = pos.length / 3;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const spread = t * len * 0.12;
        pos[i * 3] = p.x + away.x * t * len + Math.sin(i * 12.3) * spread;
        pos[i * 3 + 1] = p.y + away.y * t * len + Math.cos(i * 7.1) * spread;
        pos[i * 3 + 2] = p.z + away.z * t * len + Math.sin(i * 3.7) * spread;
      }
      c.tail.geometry.attributes.position.needsUpdate = true;
    }
    // Stations orbit their host body.
    for (const sv of this.stations.values()) {
      const body = s.bodies[sv.station.bodyId];
      this.bodyWorld(body, tmp);
      const r = body.kind === "belt" ? 0 : this.bodyRadius(body.id) * (body.kind === "star" ? 1.6 : 1.5) + 1.2;
      const a = sv.angle + this.renderDay * 0.25;
      if (body.kind === "belt") {
        const ang = sv.angle;
        const rr = auToScene(body.orbit!.a);
        sv.mesh.position.set(Math.cos(ang) * rr, 1.5, Math.sin(ang) * rr);
      } else {
        sv.mesh.position.set(tmp.x + Math.cos(a) * r, tmp.y + 0.5, tmp.z + Math.sin(a) * r);
      }
      sv.mesh.rotation.y = -a;
    }
    // Fleets: ships point along their thrust, so they visibly flip to brake;
    // coasting ships face their velocity and idle ones follow their orbit.
    const want = new THREE.Vector3();
    for (const v of this.fleets.values()) {
      const f = v.fleet;
      const prev = v.pos.clone();
      this.fleetWorld(f, v.pos);
      // Glide (rather than snap) when switching between orbit-holding and flight positions.
      if (prev.distanceTo(v.pos) > 1.5) v.pos.lerpVectors(prev, v.pos, 1 - Math.exp(-dt * 4));
      const burn = f.thrust ? Math.hypot(f.thrust.x, f.thrust.y, f.thrust.z) : 0;
      const speed = f.vel ? Math.hypot(f.vel.x, f.vel.y, f.vel.z) : 0;
      const inFlight = !!f.order;
      if (inFlight && burn > 0.05) want.set(f.thrust.x, f.thrust.y, f.thrust.z).normalize();
      else if (inFlight && speed > 1e-3) want.set(f.vel.x, f.vel.y, f.vel.z).normalize();
      else want.copy(v.pos).sub(prev);
      if (want.lengthSq() > 1e-8) v.heading.lerp(want.normalize(), 1 - Math.exp(-dt * 2.5)).normalize();
      v.group.position.copy(v.pos);
      v.group.lookAt(v.pos.clone().add(v.heading));
      // Engine plumes: bright and long under full burn, a faint pilot glow otherwise.
      const glow = inFlight ? 0.2 + burn * 0.8 : 0.3;
      const flicker = 0.88 + Math.random() * 0.12;
      for (const e of v.engines) {
        const base = (e.userData.base ??= e.scale.x) as number;
        e.scale.setScalar(base * (0.55 + glow * 0.9) * flicker);
        (e.material as THREE.SpriteMaterial).opacity = glow * flicker;
      }
    }
    this.updateShuttles(dt);
    this.updatePaths();
    this.updateBattles(time);
    this.updateRings();
    this.effects.update(dt);
  }

  /** Ships founding a colony or unloading settlers send shuttles down to the surface. */
  private updateShuttles(dt: number): void {
    const s = this.game.state;
    const center = new THREE.Vector3();
    for (const v of this.fleets.values()) {
      const o = v.fleet.order;
      if (!o || (o.kind !== "colonize" && o.kind !== "migrate") || !(o.work && o.work > 0) || !o.bodyId || o.route.length) continue;
      const body = s.bodies[o.bodyId];
      if (!body || body.systemId !== this.systemId) continue;
      v.shuttleTimer = (v.shuttleTimer ?? 0) - dt;
      if (v.shuttleTimer > 0) continue;
      v.shuttleTimer = 0.35 + Math.random() * 0.45;
      this.shuttles.launch(v.pos, body.id, this.bodyWorld(body, center));
    }
    this.shuttles.update(dt, (bodyId, out) => {
      const b = s.bodies[bodyId];
      if (!b) return null;
      this.bodyWorld(b, out);
      return this.bodyRadius(bodyId);
    });
  }

  private updatePaths(): void {
    // Draw planned paths for player fleets.
    while (this.pathLines.children.length) {
      const c = this.pathLines.children.pop() as THREE.Line;
      c.geometry.dispose();
    }
    const s = this.game.state;
    for (const v of this.fleets.values()) {
      const f = v.fleet;
      if (f.empireId !== s.playerId || !f.order) continue;
      let target: THREE.Vector3 | null = null;
      if (f.order.route.length) target = this.gateWorld(f.order.route[0]);
      else if (f.order.bodyId) target = this.bodyWorld(s.bodies[f.order.bodyId]);
      else if (f.order.fleetId && s.fleets[f.order.fleetId]) target = this.fleetWorld(s.fleets[f.order.fleetId]);
      else if (f.order.pos) {
        const m = mapSystemPos(f.order.pos);
        target = new THREE.Vector3(m.x, m.y, m.z);
      }
      if (!target) continue;
      const geo = new THREE.BufferGeometry().setFromPoints([v.pos, target]);
      const color = f.order.kind === "attack" || f.order.kind === "invade" ? "#ff5a5a" : f.order.kind === "move" ? "#6fe0ff" : "#8aff8a";
      const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color, dashSize: 1.2, gapSize: 0.8, transparent: true, opacity: 0.8, depthWrite: false }));
      line.computeLineDistances();
      this.pathLines.add(line);
    }
  }

  private updateBattles(time: number): void {
    while (this.battleMarkers.children.length) this.battleMarkers.remove(this.battleMarkers.children[0]);
    for (const b of Object.values(this.game.state.battles)) {
      if (b.systemId !== this.systemId) continue;
      const m = mapSystemPos(b.pos);
      const spr = glowSprite("#ff3a3a", 10 + Math.sin(time * 6) * 2, 0.25);
      spr.position.set(m.x, m.y, m.z);
      this.battleMarkers.add(spr);
    }
  }

  private updateRings(): void {
    const place = (ring: THREE.Mesh, sel: PickResult | null) => {
      ring.visible = false;
      if (!sel) return;
      const pos = this.selectionPos(sel);
      if (!pos) return;
      ring.visible = true;
      ring.position.copy(pos.p);
      ring.scale.setScalar(pos.r);
      ring.lookAt(this.camera.position);
    };
    place(this.selectionRing, this.selected);
    place(this.hoverRing, this.hovered && (this.hovered.id !== this.selected?.id) ? this.hovered : null);
  }

  selectionPos(sel: PickResult): { p: THREE.Vector3; r: number } | null {
    if (sel.kind === "body") {
      const b = this.game.state.bodies[sel.id];
      if (!b || b.systemId !== this.systemId) return null;
      if (b.kind === "belt") return null;
      return { p: this.bodyWorld(b), r: this.bodyRadius(b.id) * 1.35 + 0.4 };
    }
    if (sel.kind === "fleet") {
      const v = this.fleets.get(sel.id);
      return v ? { p: v.pos.clone(), r: v.radius } : null;
    }
    if (sel.kind === "gate") {
      const p = this.gateWorld(sel.id);
      return p ? { p, r: 5.5 } : null;
    }
    return null;
  }

  handleEvents(events: SimEvent[]): void {
    const s = this.game.state;
    // Without eyes in this system we see nothing of what happens here.
    const present = this.playerPresent();
    for (const e of events) {
      if (!("systemId" in e) || e.systemId !== this.systemId) continue;
      const ours = (e.type === "colonized" || e.type === "stationBuilt") && e.empireId === s.playerId;
      if (!present && !ours) continue;
      if (e.type === "shot") {
        const from = this.refWorld(e.fromRef);
        const to = this.refWorld(e.toRef);
        if (!from || !to) continue;
        this.effects.shot(e.weapon as never, from, to, e.hit, !!e.intercepted, new THREE.Color(s.empires[e.fromEmpire]?.color ?? "#fff"));
      } else if (e.type === "explosion") {
        const p = this.refWorld(e.ref) ?? new THREE.Vector3(...Object.values(mapSystemPos(e.pos)) as [number, number, number]);
        this.effects.explosion(p, e.size);
      } else if (e.type === "jump") {
        const m = mapSystemPos(e.pos);
        this.effects.jump(new THREE.Vector3(m.x, m.y, m.z), new THREE.Color("#7fc8ff"));
      } else if (e.type === "colonized" || e.type === "stationBuilt") {
        const b = s.bodies[e.bodyId];
        if (b) this.effects.pulse(this.bodyWorld(b), new THREE.Color(s.empires[e.empireId].color), this.bodyRadius(b.id) * 6);
      } else if (e.type === "shipBuilt") {
        const f = s.fleets[e.fleetId];
        if (f) this.effects.flash(this.fleetWorld(f), new THREE.Color("#9fe0ff"), 4, 0.6);
      }
    }
  }

  pick(ndc: THREE.Vector2, camera: THREE.Camera): PickResult | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(this.pickables, false);
    // Prefer fleets over bodies when both are hit, then nearest.
    let best: THREE.Intersection | null = null;
    for (const h of hits) {
      const pr = h.object.userData.pick as PickResult;
      if (!best) best = h;
      else {
        const bp = best.object.userData.pick as PickResult;
        if (pr.kind === "fleet" && bp.kind !== "fleet") best = h;
      }
    }
    if (best) return best.object.userData.pick as PickResult;
    // Empty space: intersect the ecliptic plane.
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pt = new THREE.Vector3();
    if (ray.ray.intersectPlane(plane, pt)) return { kind: "point", id: "", point: pt };
    return null;
  }

  /** Inverse of mapSystemPos for the ecliptic (used for move-to-point orders). */
  sceneToSystem(p: THREE.Vector3): { x: number; y: number; z: number } {
    const r = Math.hypot(p.x, p.y, p.z);
    if (r < 1e-6) return { x: 0, y: 0, z: 0 };
    const au = Math.pow(r / 34, 1 / 0.55);
    return { x: (p.x / r) * au, y: (p.y / r) * au, z: (p.z / r) * au };
  }

  /** Objects that deserve a floating label. */
  labelAnchors(): { key: string; text: string; sub?: string; pos: THREE.Vector3; color: string; kind: string; size: number }[] {
    const s = this.game.state;
    const out: { key: string; text: string; sub?: string; pos: THREE.Vector3; color: string; kind: string; size: number }[] = [];
    for (const bv of this.bodies.values()) {
      const b = bv.body;
      if (b.kind === "belt") continue;
      const col = Object.values(s.colonies).find((c) => c.bodyId === b.id);
      const pos = bv.group.position.clone();
      pos.y += bv.radius + 0.6;
      out.push({
        key: `b:${b.id}`,
        text: b.name,
        sub: col ? `${s.empires[col.empireId].name.split(" ")[0]} · ${col.pop.toFixed(1)} pop` : undefined,
        pos,
        color: col ? s.empires[col.empireId].color : b.kind === "star" ? "#ffe9b0" : "#cfe0ff",
        kind: b.kind,
        size: bv.radius,
      });
    }
    for (const v of this.fleets.values()) {
      const f = v.fleet;
      const pos = v.pos.clone();
      pos.y += v.radius + 0.4;
      out.push({ key: `f:${f.id}`, text: f.name, sub: `${f.ships.length} ship${f.ships.length > 1 ? "s" : ""}${f.battleId ? " · ⚔" : ""}`, pos, color: s.empires[f.empireId].color, kind: "fleet", size: v.radius });
    }
    for (const g of this.gates) {
      const pos = g.group.position.clone();
      pos.y += 5.5;
      out.push({ key: `g:${g.tunnelId}`, text: `⟶ ${s.systems[g.to].name}`, pos, color: "#8fc8ff", kind: "gate", size: 4 });
    }
    return out;
  }

  focusPoint(sel: PickResult): { p: THREE.Vector3; dist: number } | null {
    const sp = this.selectionPos(sel);
    if (sp) {
      const isStar = sel.kind === "body" && this.game.state.bodies[sel.id]?.kind === "star";
      return { p: sp.p, dist: Math.max(8, sp.r * (isStar ? 11 : 6)) };
    }
    if (sel.kind === "body") {
      const b = this.game.state.bodies[sel.id];
      if (b?.kind === "belt") return { p: new THREE.Vector3(), dist: auToScene(b.orbit!.a) * 2.2 };
    }
    return null;
  }

  stationTypeAt(bodyId: string): string[] {
    return Object.values(this.game.state.stations).filter((s) => s.bodyId === bodyId).map((s) => STATION_MAP[s.type]?.name ?? s.type);
  }

  dispose(): void {
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry && !mesh.geometry.userData.shared) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (mat && !Array.isArray(mat) && (mat instanceof THREE.ShaderMaterial || !mat.userData.shared)) mat.dispose();
    });
    this.effects.clear();
    this.shuttles.clear();
  }
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}
