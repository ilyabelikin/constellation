import "./ui/styles.css";
import * as THREE from "three";
import { Game, STEP_DAYS } from "./sim/game";
import type { GameSettings } from "./sim/types";
import { Engine, type PickResult } from "./render/Engine";
import { GalaxyView } from "./render/GalaxyView";
import { SystemView } from "./render/SystemView";
import { auToScene } from "./render/scale";
import { Hud, type AppApi } from "./ui/Hud";
import { Labels } from "./ui/Labels";
import { Lobby } from "./ui/Lobby";
import { HULL_MAP } from "./sim/data/ships";
import { canColonize } from "./sim/economy";

const SAVE_KEY = "constellation-v3-save";
const SPEEDS = [0, 1, 2, 4, 8]; // game days per real second

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

class App implements AppApi {
  game!: Game;
  view: "galaxy" | "system" = "system";
  systemId = "";
  selection: PickResult | null = null;
  activeFleetId: string | null = null;
  speedIndex = 1;
  paused = true;

  private engine: Engine;
  private galaxyView: GalaxyView | null = null;
  private systemView: SystemView | null = null;
  private hud: Hud | null = null;
  private labels: Labels;
  private lobby: Lobby;
  private acc = 0;
  private lastFrame = performance.now();
  private startTime = performance.now();
  private hudTimer = 0;
  private autosaveTimer = 0;
  private running = false;
  private keys = new Set<string>();

  constructor() {
    this.engine = new Engine(document.getElementById("canvas")!);
    this.labels = new Labels(document.getElementById("labels")!);
    this.lobby = new Lobby(document.getElementById("lobby")!, {
      onNewGame: (s) => this.newGame(s),
      onContinue: () => this.load(),
      hasSave: () => !!storage()?.getItem(SAVE_KEY),
    });
    this.setupInput();
    this.showTitle();
    requestAnimationFrame(() => this.frame());
    (window as unknown as { __app: App }).__app = this; // for tests & debugging
  }

  // ---------------------------------------------------------------- lifecycle
  private showTitle(): void {
    this.running = false;
    document.getElementById("hud")!.classList.add("hidden");
    this.labels.clear();
    // Attract mode: a demo galaxy slowly rotating behind the title.
    this.game = Game.create({ seed: "title-screen", systemCount: 24, aiCount: 3 });
    const home = this.game.playerColonies()[0];
    this.systemId = home.systemId;
    this.showSystemInternal(home.systemId);
    this.engine.rig.goalDistance = 150;
    this.engine.rig.goalPitch = 0.35;
    this.engine.rig.snap();
    this.lobby.show();
  }

  newGame(settings: Partial<GameSettings>): void {
    this.startGame(Game.create(settings));
    this.toast("Welcome, leader. Your homeworld awaits orders.", "good");
  }

  private startGame(game: Game): void {
    this.game = game;
    this.lobby.hide();
    this.selection = null;
    this.activeFleetId = null;
    this.running = true;
    this.paused = false;
    this.speedIndex = 1;
    this.acc = 0;
    const hudRoot = document.getElementById("hud")!;
    hudRoot.classList.remove("hidden");
    if (!this.hud) this.hud = new Hud(hudRoot, document.getElementById("modal-root")!, this);
    else this.hud.reset();
    this.galaxyView?.dispose();
    this.galaxyView = null;
    this.goHome();
    this.hud.render();
  }

  save(): void {
    try {
      storage()?.setItem(SAVE_KEY, this.game.serialize());
      this.toast("Game saved", "good");
    } catch (e) {
      this.toast(`Save failed: ${(e as Error).message}`, "error");
    }
  }

  load(): void {
    const json = storage()?.getItem(SAVE_KEY);
    if (!json) {
      this.toast("No saved game found", "error");
      return;
    }
    try {
      this.startGame(Game.deserialize(json));
      this.toast("Game loaded", "good");
    } catch (e) {
      this.toast(`Load failed: ${(e as Error).message}`, "error");
    }
  }

  quitToTitle(): void {
    this.showTitle();
  }

  // ---------------------------------------------------------------- views
  private showSystemInternal(id: string): void {
    this.systemId = id;
    this.view = "system";
    this.systemView = new SystemView(this.game, id, this.engine.camera);
    this.engine.setView(this.systemView);
    const sys = this.game.state.systems[id];
    this.engine.setSky(sys.nebula, (Number(id.replace(/\D/g, "")) % 50) * 0.37);
    const rig = this.engine.rig;
    rig.follow = null;
    rig.minDistance = 3;
    rig.maxDistance = auToScene(sys.extent) * 4;
    rig.focus(new THREE.Vector3(), Math.min(rig.maxDistance, auToScene(sys.extent) * 1.6));
    rig.goalPitch = 0.62;
    this.labels.clear();
  }

  enterSystem(id: string, focusSel: PickResult | null = null): void {
    if (this.view !== "system" || this.systemId !== id) {
      if (!focusSel && this.selection && !this.selectionInSystem(this.selection, id)) this.select(null);
      this.galaxyView?.dispose();
      this.galaxyView = null;
      this.showSystemInternal(id);
    }
    if (focusSel) {
      this.select(focusSel, true);
    }
    this.hud?.render();
  }

  private selectionInSystem(sel: PickResult, systemId: string): boolean {
    const s = this.game.state;
    if (sel.kind === "body") return s.bodies[sel.id]?.systemId === systemId;
    if (sel.kind === "fleet") return s.fleets[sel.id]?.systemId === systemId;
    if (sel.kind === "gate") return s.systems[systemId].gates.some((g) => g.tunnelId === sel.id);
    return false;
  }

  showGalaxy(): void {
    if (this.view === "galaxy") return;
    this.view = "galaxy";
    this.systemView = null;
    this.galaxyView = new GalaxyView(this.game, this.engine.camera);
    this.engine.setView(this.galaxyView);
    this.engine.setSky(undefined, 0.5);
    const rig = this.engine.rig;
    rig.follow = null;
    rig.minDistance = 20;
    rig.maxDistance = 2500;
    const p = this.galaxyView.systemPos(this.systemId) ?? new THREE.Vector3();
    rig.focus(p, 380);
    rig.goalPitch = 0.95;
    this.labels.clear();
    if (this.selection && this.selection.kind !== "fleet") this.selection = { kind: "system", id: this.systemId };
    this.galaxyView.selected = this.selection;
    this.hud?.render();
  }

  goHome(): void {
    const home = this.game.playerColonies().find((c) => c.capital) ?? this.game.playerColonies()[0];
    if (home) this.enterSystem(home.systemId, { kind: "body", id: home.bodyId });
    else {
      const f = Object.values(this.game.state.fleets).find((x) => x.empireId === this.game.playerId && x.systemId);
      if (f) this.enterSystem(f.systemId!);
    }
  }

  select(sel: PickResult | null, focus = false): void {
    this.selection = sel;
    if (sel?.kind === "fleet") {
      const f = this.game.state.fleets[sel.id];
      if (f && f.empireId === this.game.playerId) this.activeFleetId = sel.id;
    }
    if (this.systemView) this.systemView.selected = sel;
    if (this.galaxyView) this.galaxyView.selected = sel;
    if (focus) this.focusSelection();
    this.hud?.invalidate();
    this.hud?.render();
  }

  focusSelection(): void {
    const sel = this.selection;
    if (!sel) return;
    const rig = this.engine.rig;
    if (this.systemView) {
      const fp = this.systemView.focusPoint(sel);
      if (!fp) return;
      rig.goalDistance = fp.dist;
      const view = this.systemView;
      if (sel.kind === "body" || sel.kind === "fleet") {
        rig.follow = () => {
          const r = view.selectionPos(sel);
          return r ? r.p : null;
        };
      } else {
        rig.follow = null;
        rig.focus(fp.p);
      }
    } else if (this.galaxyView && sel.kind === "system") {
      const p = this.galaxyView.systemPos(sel.id);
      if (p) rig.focus(p, 160);
    }
  }

  setSpeed(i: number): void {
    if (i === 0) this.paused = true;
    else {
      this.paused = false;
      this.speedIndex = i;
    }
    this.hud?.render();
  }

  togglePause(): void {
    this.paused = !this.paused;
    this.hud?.render();
  }

  toast(msg: string, kind: "error" | "good" | "info" = "info"): void {
    const root = document.getElementById("toasts")!;
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => el.remove(), kind === "error" ? 3200 : 2400);
    while (root.children.length > 4) root.firstChild?.remove();
  }

  // ---------------------------------------------------------------- orders
  private commandAt(pick: PickResult | null): void {
    const g = this.game;
    const s = g.state;
    const fid = this.activeFleetId;
    const fleet = fid ? s.fleets[fid] : null;
    if (!fleet || fleet.empireId !== g.playerId) {
      this.toast("Select one of your fleets first", "error");
      return;
    }
    if (!pick) return;
    let r: { ok: boolean; error?: string } = { ok: false, error: "Nothing there" };
    let msg = "";
    const roles = new Set(fleet.ships.map((sh) => HULL_MAP[sh.hull].role));
    if (pick.kind === "system") {
      const sys = s.systems[pick.id];
      r = g.moveFleet(fleet.id, sys.id, { bodyId: sys.starIds[0] });
      msg = `${fleet.name} → ${sys.name}`;
    } else if (pick.kind === "body") {
      const body = s.bodies[pick.id];
      const colony = Object.values(s.colonies).find((c) => c.bodyId === body.id);
      if (roles.has("colony") && !colony && canColonize(g.player, body)) {
        r = g.colonize(fleet.id, body.id);
        msg = `${fleet.name} will colonize ${body.name}`;
      } else if (roles.has("transport") && colony && colony.empireId !== g.playerId) {
        r = g.invade(fleet.id, colony.id);
        msg = `${fleet.name} will invade ${body.name}`;
      } else {
        r = g.moveFleet(fleet.id, body.systemId, { bodyId: body.id });
        msg = `${fleet.name} → ${body.name}`;
      }
    } else if (pick.kind === "fleet") {
      const target = s.fleets[pick.id];
      if (!target) return;
      if (target.empireId !== g.playerId && g.player.relations[target.empireId] === "war") {
        r = g.attackFleet(fleet.id, target.id);
        msg = `${fleet.name} engaging ${target.name}`;
      } else if (target.systemId) {
        r = g.moveFleet(fleet.id, target.systemId, { pos: { ...target.pos } });
        msg = `${fleet.name} joining ${target.name}`;
      }
    } else if (pick.kind === "gate") {
      const t = s.tunnels[pick.id];
      const to = t.a === this.systemId ? t.b : t.a;
      r = g.moveFleet(fleet.id, to);
      msg = `${fleet.name} jumping to ${s.systems[to].name}`;
    } else if (pick.kind === "point" && pick.point && this.systemView) {
      r = g.moveFleet(fleet.id, this.systemId, { pos: this.systemView.sceneToSystem(pick.point) });
      msg = `${fleet.name} moving`;
    }
    if (!r.ok) this.toast(r.error ?? "Cannot do that", "error");
    else this.toast(msg, "good");
    this.hud?.invalidate();
    this.hud?.render();
  }

  // ---------------------------------------------------------------- input
  private setupInput(): void {
    const canvas = this.engine.renderer.domElement;
    let down: { x: number; y: number; button: number; moved: boolean } | null = null;
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("pointerdown", (e) => {
      down = { x: e.clientX, y: e.clientY, button: e.button, moved: false };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (down) {
        const dx = e.clientX - down.x;
        const dy = e.clientY - down.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) down.moved = true;
        if (down.moved) {
          if (down.button === 0 && !e.shiftKey) this.engine.rig.rotate(e.movementX, e.movementY);
          else this.engine.rig.pan(e.movementX, e.movementY);
        }
        return;
      }
      if (!this.running) return;
      const hov = this.engine.pick(e.clientX, e.clientY);
      const h = hov && hov.kind !== "point" ? hov : null;
      if (this.systemView) this.systemView.hovered = h;
      if (this.galaxyView) this.galaxyView.hovered = h;
      canvas.style.cursor = h ? "pointer" : "default";
    });
    canvas.addEventListener("pointerup", (e) => {
      const d = down;
      down = null;
      if (!d || d.moved || !this.running) return;
      const pick = this.engine.pick(e.clientX, e.clientY);
      if (d.button === 2) this.commandAt(pick);
      else if (d.button === 0) {
        if (!pick || pick.kind === "point") this.select(null);
        else this.select(pick);
      }
    });
    canvas.addEventListener("dblclick", (e) => {
      if (!this.running) return;
      const pick = this.engine.pick(e.clientX, e.clientY);
      if (!pick || pick.kind === "point") return;
      if (pick.kind === "system") this.enterSystem(pick.id);
      else {
        this.select(pick, true);
      }
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.engine.rig.zoom(Math.exp(e.deltaY * 0.0012));
      },
      { passive: false },
    );
    window.addEventListener("keydown", (e) => {
      if (!this.running) return;
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      this.keys.add(e.key.toLowerCase());
      switch (e.key) {
        case " ":
          e.preventDefault();
          this.togglePause();
          break;
        case "1":
        case "2":
        case "3":
        case "4":
          this.setSpeed(Number(e.key));
          break;
        case "g":
        case "G":
          if (this.view === "galaxy") this.enterSystem(this.systemId);
          else this.showGalaxy();
          break;
        case "h":
        case "H":
          this.goHome();
          break;
        case "r":
        case "R":
          this.hud?.toggleModal("research");
          break;
        case "e":
        case "E":
          this.hud?.toggleModal("empires");
          break;
        case "f":
        case "F":
          this.focusSelection();
          break;
        case "?":
          this.hud?.toggleModal("help");
          break;
        case "Escape":
          if (this.hud?.modal) this.hud.toggleModal(this.hud.modal);
          else if (this.selection) {
            this.select(null);
            this.activeFleetId = null;
          } else this.hud?.toggleModal("menu");
          break;
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this.keys.clear());
  }

  // ---------------------------------------------------------------- loop
  private frame(): void {
    requestAnimationFrame(() => this.frame());
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const time = (now - this.startTime) / 1000;
    const rig = this.engine.rig;
    // Keyboard panning.
    const pan = 500 * dt;
    if (this.keys.has("w")) rig.pan(0, pan);
    if (this.keys.has("s")) rig.pan(0, -pan);
    if (this.keys.has("a")) rig.pan(pan, 0);
    if (this.keys.has("d")) rig.pan(-pan, 0);
    if (this.keys.has("q")) rig.rotate(-pan, 0);

    let steps = 0;
    if (this.running && !this.paused) {
      this.acc += dt * SPEEDS[this.speedIndex];
      while (this.acc >= STEP_DAYS && steps < 120) {
        this.game.step();
        this.acc -= STEP_DAYS;
        steps++;
      }
      if (steps >= 120) this.acc = 0;
    } else if (!this.running) {
      // Title screen: gently orbit.
      rig.goalYaw += dt * 0.03;
    }
    const alpha = Math.min(1, this.acc / STEP_DAYS);
    const events = this.game.drainEvents();
    if (this.systemView) {
      this.systemView.alpha = this.running ? alpha : 0;
      this.systemView.renderDay = this.running ? this.game.state.day - STEP_DAYS * (1 - alpha) : time * 2;
      if (steps > 0) this.systemView.sync();
      this.systemView.handleEvents(events);
    }
    if (this.galaxyView) {
      this.galaxyView.alpha = alpha;
      if (steps > 0 || this.hudTimer === 0) this.galaxyView.sync();
    }
    // Drop the selection if the object vanished.
    if (this.selection?.kind === "fleet" && !this.game.state.fleets[this.selection.id]) this.select(null);
    if (this.activeFleetId && !this.game.state.fleets[this.activeFleetId]) this.activeFleetId = null;

    this.engine.render(dt, time);
    if (this.running) {
      const anchors = this.systemView ? this.systemView.labelAnchors() : this.galaxyView ? this.galaxyView.labelAnchors() : [];
      this.labels.update(this.engine, anchors, { hideMoonsBeyond: 80 });
      this.hudTimer += dt;
      if (this.hudTimer > 0.25) {
        this.hudTimer = 0;
        this.hud?.render();
      }
      this.autosaveTimer += dt;
      if (this.autosaveTimer > 90) {
        this.autosaveTimer = 0;
        try {
          storage()?.setItem(SAVE_KEY, this.game.serialize());
        } catch {
          /* storage full or unavailable: ignore autosave */
        }
      }
    }
  }
}

new App();
