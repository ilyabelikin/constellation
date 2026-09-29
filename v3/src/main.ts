import "./ui/styles.css";
import * as THREE from "three";
import { Game, STEP_DAYS } from "./sim/game";
import type { PlayerFacade } from "./sim/facade";
import type { ChatMessage, DiploAction, GameSettings } from "./sim/types";
import type { PlayerView, StaticView } from "./sim/view";
import { NetClient } from "./net/NetClient";
import { NetGame } from "./net/NetGame";
import { NetLlmTransport } from "./net/NetLlm";
import { RivalDirector } from "./llm/director";
import { hasMet, sensorSystems } from "./sim/knowledge";
import type { GameLogEntry, Vec3 } from "./sim/types";
import { SPEEDS, type CloudSaveSummary, type SessionInfo, type SessionSummary } from "./net/protocol";
import { Engine, type PickResult } from "./render/Engine";
import { GalaxyView } from "./render/GalaxyView";
import { SystemView } from "./render/SystemView";
import { Hud, type AppApi } from "./ui/Hud";
import { Labels } from "./ui/Labels";
import { Lobby } from "./ui/Lobby";
import { dateString } from "./ui/format";
import { HULL_MAP } from "./sim/data/ships";
import { canColonize } from "./sim/economy";

const SAVE_KEY = "constellation-v3-save";
const AUTOSAVE_KEY = "constellation-v3-autosave";

function writeSave(key: string, json: string): void {
  const st = storage();
  if (!st) throw new Error("Storage unavailable");
  st.setItem(key, json);
  st.setItem(`${key}-time`, String(Date.now()));
}

/** The newest of the manual save and the autosave. */
function newestSave(): string | null {
  const st = storage();
  if (!st) return null;
  const pick = [SAVE_KEY, AUTOSAVE_KEY]
    .filter((k) => st.getItem(k))
    .sort((a, b) => Number(st.getItem(`${b}-time`) ?? 0) - Number(st.getItem(`${a}-time`) ?? 0))[0];
  return pick ? st.getItem(pick) : null;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

class App implements AppApi {
  game!: PlayerFacade;
  /** The authoritative game when playing locally (single player). */
  local: Game | null = null;
  /** The server-hosted game when playing online. */
  remote: NetGame | null = null;
  view: "galaxy" | "system" = "system";
  systemId = "";
  selection: PickResult | null = null;
  activeFleetId: string | null = null;
  private localSpeed = 1;
  private localPaused = true;

  readonly net = new NetClient();
  session: SessionInfo | null = null;
  mySessions: SessionSummary[] = [];
  cloudSaves: CloudSaveSummary[] = [];
  chatLog: ChatMessage[] = [];
  private pendingStatic: StaticView | null = null;
  private pendingView: PlayerView | null = null;
  private lastViews = -1;
  /** LLM-voiced rival rulers for local games (answers come via the server). */
  private director: RivalDirector | null = null;
  private llmTransport: NetLlmTransport | null = null;
  private directorTimer = 0;
  /** The game was paused automatically while the player writes a message. */
  private chatPaused = false;
  /** Battles already noticed (auto-slow triggers once per battle). */
  private seenBattles = new Set<string>();
  /** Where we last saw each foreign fleet (for "locate" from the log). */
  private lastSeen = new Map<string, { systemId: string; pos: Vec3; day: number }>();
  /** Camera flight through a tunnel gate into the connected system. */
  private gateJump: { tunnelId: string; to: string; t: number; phase: "dive" | "emerge"; gate: THREE.Vector3; out: THREE.Vector3; fired: boolean } | null = null;
  private baseFov = 50;

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
      hasSave: () => !!newestSave(),
      online: () => ({ connected: this.net.welcomed, name: this.net.name, llm: this.net.llmAvailable }),
      setName: (name) => this.net.setName(name),
      onHost: (settings) => this.net.send({ t: "create", settings, sessionName: `${settings.playerName ?? "Commander"}'s galaxy` }),
      onJoin: (code) => this.net.send({ t: "join", code }),
      sessions: () => this.mySessions,
      cloudSaves: () => this.cloudSaves,
      onCloudLoad: (id) => this.net.send({ t: "cloudLoad", id }),
      onCloudDelete: (id) => this.net.send({ t: "cloudDelete", id }),
      takeSeat: (empireId) => this.net.send({ t: "takeSeat", empireId }),
      startSession: () => this.net.send({ t: "start" }),
      leaveSession: () => this.leaveSession(),
    });
    this.setupNet();
    this.setupInput();
    this.showTitle();
    requestAnimationFrame(() => this.frame());
    (window as unknown as { __app: App }).__app = this; // for tests & debugging
  }

  // ---------------------------------------------------------------- lifecycle
  get speedIndex(): number {
    return this.remote ? this.remote.info.speedIndex : this.localSpeed;
  }

  get paused(): boolean {
    return this.remote ? this.remote.info.paused : this.localPaused;
  }

  get isHost(): boolean {
    return this.remote ? this.remote.info.youAreHost : true;
  }

  // ---------------------------------------------------------------- network
  private setupNet(): void {
    const net = this.net;
    net.onStatus = (up) => {
      if (up) {
        net.send({ t: "mySessions" });
        net.send({ t: "cloudList" });
        const code = new URLSearchParams(location.search).get("join");
        if (code && !this.session) net.send({ t: "join", code });
        // Back online in the middle of a game: rejoin it.
        else if (this.session) net.send({ t: "join", code: this.session.code });
      } else if (this.remote) this.toast("Connection lost — reconnecting…", "error");
      this.lobby.refreshOnline();
    };
    net.on("sessions", (m) => {
      this.mySessions = m.list;
      this.lobby.refreshOnline();
    });
    net.on("cloudSaves", (m) => {
      this.cloudSaves = m.list;
      this.lobby.refreshOnline();
    });
    net.on("cloudSaved", () => this.toast("Saved to the cloud", "good"));
    net.on("cloudData", (m) => {
      try {
        this.startLocal(Game.deserialize(m.data));
        this.toast("Cloud save loaded", "good");
      } catch (e) {
        this.toast(`Load failed: ${(e as Error).message}`, "error");
      }
    });
    net.on("error", (m) => this.toast(m.message, "error"));
    net.on("session", (m) => {
      const joining = !this.session || this.session.id !== m.info.id;
      this.session = m.info;
      if (joining) {
        this.pendingStatic = null;
        this.pendingView = null;
        this.chatLog = [];
        if (location.search.includes("join=")) history.replaceState(null, "", location.pathname);
      }
      if (this.remote) {
        this.remote.info = m.info;
        this.hud?.render();
      } else {
        this.maybeEnterRemote();
        if (!this.remote) this.lobby.showRoom(m.info);
      }
    });
    net.on("static", (m) => {
      this.pendingStatic = m.data;
      this.maybeEnterRemote();
    });
    net.on("view", (m) => {
      if (this.remote) return; // NetGame consumes views itself
      this.pendingView = m.data;
      this.maybeEnterRemote();
    });
    net.on("left", () => {
      this.session = null;
      if (this.remote) this.showTitle();
      else this.lobby.show();
    });
    net.on("chatHistory", (m) => {
      this.chatLog = m.messages;
      this.hud?.render();
    });
    net.on("chat", (m) => this.receiveChat(m.message));
    net.connect();
  }

  private maybeEnterRemote(): void {
    const info = this.session;
    if (this.remote || !info || info.status === "lobby" || !info.yourEmpireId) return;
    if (!this.pendingStatic || !this.pendingView || this.pendingView.playerId !== info.yourEmpireId) return;
    const ng = new NetGame(this.net, this.pendingStatic, this.pendingView, info);
    ng.onError = (msg) => this.toast(msg, "error");
    this.pendingView = null;
    this.remote = ng;
    this.local = null;
    this.startGame(ng);
    this.toast(`Joined ${info.name}. Invite code ${info.code}`, "good");
  }

  leaveSession(): void {
    this.net.send({ t: "leave" });
    this.net.send({ t: "mySessions" });
    this.session = null;
    if (this.remote) this.showTitle();
    else this.lobby.show();
  }

  receiveChat(msg: ChatMessage): void {
    if (this.chatLog.some((m) => m.id === msg.id)) return;
    this.chatLog.push(msg);
    this.notifyChat(msg);
  }

  private notifyChat(msg: ChatMessage): void {
    const me = this.game?.playerId;
    if (this.running && msg.to === me && msg.from !== me) {
      const from = this.game.state.empires[msg.from];
      if (!this.hud?.isChattingWith(msg.from)) this.toast(`✉ ${from?.name ?? "Someone"}: ${msg.text.slice(0, 90)}`, "info");
    }
    this.hud?.render();
  }

  get chats(): ChatMessage[] {
    return this.local ? (this.local.state.chats ?? []) : this.chatLog;
  }

  /** Can we talk to this empire? Humans always (online); AI rulers need the LLM service. */
  canChat(empireId: string): boolean {
    const e = this.game.state.empires[empireId];
    if (!e || e.isPirate || !e.alive || empireId === this.game.playerId) return false;
    if (!hasMet(this.game.state, this.game.playerId, empireId)) return false;
    if (this.remote) {
      const seat = this.remote.info.seats.find((x) => x.empireId === empireId);
      return !!seat?.playerName || this.net.llmAvailable;
    }
    return !!e.ai && this.net.llmAvailable;
  }

  sendChat(to: string, text: string): void {
    const clean = text.trim().slice(0, 500);
    if (!clean) return;
    if (this.remote) this.net.send({ t: "chat", to, text: clean });
    else if (this.local) {
      this.ensureDirector();
      if (this.director) this.director.humanMessage(this.local.playerId, to, clean);
      else this.toast("Rival rulers can't be reached (no connection to the game server)", "error");
    }
  }

  /** Tell another ruler about a diplomatic act we just took, so they can react to it. */
  announce(to: string, text: string, action?: DiploAction): void {
    if (!this.canChat(to)) return;
    const extra = { auto: true, ...(action && action.kind !== "none" ? { action } : {}) };
    if (this.remote) this.net.send({ t: "chat", to, text, ...extra });
    else if (this.local) {
      this.ensureDirector();
      this.director?.humanMessage(this.local.playerId, to, text, extra);
    }
  }

  /** Local games get LLM rulers once the server says the service is available. */
  private ensureDirector(): void {
    const game = this.local;
    if (!game || !this.running || this.director || !this.net.llmAvailable) return;
    this.llmTransport = new NetLlmTransport(this.net);
    this.director = new RivalDirector(
      {
        state: () => game.state,
        isHuman: (id) => id === game.state.playerId,
        deliver: (m) => {
          const log = (game.state.chats ??= []);
          log.push(m);
          if (log.length > 400) log.splice(0, log.length - 400);
          this.notifyChat(m);
        },
        chats: () => game.state.chats ?? [],
        active: () => this.running && !this.localPaused && this.local === game,
      },
      this.llmTransport,
    );
  }

  private dropDirector(): void {
    this.llmTransport?.dispose();
    this.llmTransport = null;
    this.director = null;
  }

  cloudSave(): void {
    if (!this.local) return;
    if (!this.net.welcomed) {
      this.toast("Cloud saves need a connection to the game server", "error");
      return;
    }
    const p = this.local.player;
    this.net.send({ t: "cloudSave", name: `${p.name} — day ${Math.floor(this.local.state.day)}`, data: this.local.serialize() });
  }

  get online(): boolean {
    return this.net.welcomed;
  }

  // ---------------------------------------------------------------- lifecycle
  private showTitle(): void {
    this.dropDirector();
    this.remote?.dispose();
    this.remote = null;
    this.running = false;
    document.getElementById("hud")!.classList.add("hidden");
    this.labels.clear();
    // Attract mode: a demo galaxy slowly rotating behind the title.
    this.local = Game.create({ seed: "title-screen", systemCount: 24, aiCount: 3 });
    this.game = this.local;
    const home = this.game.playerColonies()[0];
    this.systemId = home.systemId;
    this.showSystemInternal(home.systemId);
    this.engine.rig.goalDistance = 150;
    this.engine.rig.goalPitch = 0.35;
    this.engine.rig.snap();
    if (this.session) this.lobby.showRoom(this.session);
    else this.lobby.show();
  }

  newGame(settings: Partial<GameSettings>): void {
    this.startLocal(Game.create(settings));
    this.toast("Welcome, leader. Your homeworld awaits orders.", "good");
  }

  private startLocal(game: Game): void {
    if (this.session) this.leaveSession();
    this.remote?.dispose();
    this.remote = null;
    this.local = game;
    this.startGame(game);
  }

  private startGame(game: PlayerFacade): void {
    this.dropDirector();
    this.lastSeen.clear();
    this.chatPaused = false;
    this.game = game;
    this.lobby.hide();
    this.selection = null;
    this.activeFleetId = null;
    this.running = true;
    this.localPaused = false;
    this.localSpeed = 1;
    this.acc = 0;
    this.lastViews = -1;
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
    if (!this.local) {
      this.toast("Online games are saved on the server automatically", "info");
      return;
    }
    try {
      writeSave(SAVE_KEY, this.local.serialize());
      this.toast("Game saved", "good");
    } catch (e) {
      this.toast(`Save failed: ${(e as Error).message}`, "error");
    }
  }

  load(): void {
    const json = newestSave();
    if (!json) {
      this.toast("No saved game found", "error");
      return;
    }
    try {
      this.startLocal(Game.deserialize(json));
      this.toast("Game loaded", "good");
    } catch (e) {
      this.toast(`Load failed: ${(e as Error).message}`, "error");
    }
  }

  quitToTitle(): void {
    if (this.remote) this.leaveSession();
    else this.showTitle();
  }

  // ---------------------------------------------------------------- views
  private showSystemInternal(id: string): void {
    this.systemId = id;
    this.view = "system";
    this.systemView = new SystemView(this.game, id, this.engine.camera, this.engine.envMap);
    this.engine.setView(this.systemView);
    const sys = this.game.state.systems[id];
    this.engine.setSky(sys.nebula, (Number(id.replace(/\D/g, "")) % 50) * 0.37);
    const rig = this.engine.rig;
    rig.follow = null;
    rig.minDistance = 3;
    const extent = this.systemView.extentScene;
    rig.maxDistance = extent * 4;
    rig.focus(new THREE.Vector3(), Math.min(rig.maxDistance, extent * 1.6));
    rig.goalPitch = 0.62;
    this.labels.clear();
  }

  /** Only systems the player has surveyed can be viewed up close. */
  private canView(id: string): boolean {
    if (this.game.player?.explored[id]) return true;
    this.toast("Unsurveyed system — send a ship there to reveal it", "error");
    return false;
  }

  enterSystem(id: string, focusSel: PickResult | null = null): void {
    if (this.view !== "system" || this.systemId !== id) {
      if (!this.canView(id)) return;
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

  // ---------------------------------------------------------------- battles
  /** A battle of ours starting in the system we're watching: drop to 1× so it can be followed. */
  private watchBattles(): void {
    const s = this.game.state;
    for (const b of Object.values(s.battles)) {
      if (this.seenBattles.has(b.id)) continue;
      this.seenBattles.add(b.id);
      if (!this.local || this.localPaused || this.localSpeed <= 1) continue;
      if (this.view !== "system" || b.systemId !== this.systemId || !b.empireIds.includes(s.playerId)) continue;
      this.localSpeed = 1;
      this.toast("Battle! Slowing to 1× — press 2–4 to speed up again", "info");
      this.hud?.render();
    }
    for (const id of this.seenBattles) if (!s.battles[id]) this.seenBattles.delete(id);
  }

  // ---------------------------------------------------------------- log
  /** Remember where foreign fleets were last seen by our sensors. */
  private recordSightings(): void {
    const s = this.game.state;
    const eyes = sensorSystems(s, s.playerId);
    for (const f of Object.values(s.fleets))
      if (f.empireId !== s.playerId && f.systemId && eyes.has(f.systemId)) this.lastSeen.set(f.id, { systemId: f.systemId, pos: { ...f.pos }, day: s.day });
  }

  /** Show what a log entry is about: the fleet or body, or where it was last seen. */
  locateLog(entry: GameLogEntry): void {
    const s = this.game.state;
    const me = s.playerId;
    const ref = entry.ref;
    if (ref?.kind === "fleet") {
      const f = s.fleets[ref.id];
      const visible = f && (f.empireId === me || (f.systemId && sensorSystems(s, me).has(f.systemId)));
      if (f && visible && f.systemId) {
        this.enterSystem(f.systemId, { kind: "fleet", id: f.id });
        return;
      }
      if (f && f.empireId === me && f.transit) {
        this.showGalaxy();
        this.select({ kind: "fleet", id: f.id });
        return;
      }
      const seen = this.lastSeen.get(ref.id);
      const at = seen && seen.day >= entry.day ? seen : { systemId: ref.systemId, pos: ref.pos, day: entry.day };
      this.showLastSeen(at.systemId, at.pos, `Last seen ${at.day >= s.day - 0.5 ? "just now" : dateString(at.day)}`);
      return;
    }
    if (ref?.kind === "body" && s.bodies[ref.id]) {
      if (s.empires[me].explored[ref.systemId]) this.enterSystem(ref.systemId, { kind: "body", id: ref.id });
      else this.showLastSeen(ref.systemId, undefined, s.bodies[ref.id].name);
      return;
    }
    if (ref?.kind === "point") {
      this.showLastSeen(ref.systemId, ref.pos, "Here");
      return;
    }
    if (entry.systemId) this.showLastSeen(entry.systemId, undefined, s.systems[entry.systemId]?.name ?? "");
  }

  /** Fly to a spot in a system and mark it; unsurveyed systems are shown on the galaxy map. */
  private showLastSeen(systemId: string, pos: Vec3 | undefined, label: string): void {
    const s = this.game.state;
    if (!s.empires[s.playerId].explored[systemId]) {
      this.showGalaxy();
      this.select({ kind: "system", id: systemId }, true);
      this.toast(`${label} — ${s.systems[systemId]?.name ?? "unknown"} system (not surveyed)`, "info");
      return;
    }
    if (this.view !== "system" || this.systemId !== systemId) this.enterSystem(systemId);
    else this.select(null);
    if (pos && this.systemView) {
      const m = this.systemView.layout.map(pos);
      const p = new THREE.Vector3(m.x, m.y, m.z);
      this.engine.rig.follow = null;
      this.engine.rig.focus(p, 45);
      this.systemView.markSpot(p);
      this.toast(label, "info");
    }
  }

  // ---------------------------------------------------------------- gate flight
  /** Nearest equivalent of `angle` to `ref` (so eased yaw never spins the long way round). */
  private closestAngle(angle: number, ref: number): number {
    return angle + Math.round((ref - angle) / (Math.PI * 2)) * Math.PI * 2;
  }

  /** Dive through a gate, emerge from its twin in the connected system and pull back to a side view. */
  jumpThroughGate(tunnelId: string): void {
    if (!this.systemView || this.gateJump) return;
    const t = this.game.state.tunnels[tunnelId];
    const gate = this.systemView.gateWorld(tunnelId);
    if (!t || !gate) return;
    const to = t.a === this.systemId ? t.b : t.a;
    if (!this.canView(to)) return;
    const out = gate.clone().normalize(); // gates face the star; "out" leads through the ring
    const rig = this.engine.rig;
    rig.follow = null;
    rig.minDistance = 0.3;
    // Line up on the star side of the ring, looking out through it.
    rig.goalYaw = this.closestAngle(Math.atan2(-out.x, -out.z), rig.yaw);
    rig.goalPitch = 0.05;
    rig.focus(gate, 18);
    this.baseFov = this.engine.camera.fov;
    this.select(null);
    this.gateJump = { tunnelId, to, t: 0, phase: "dive", gate, out, fired: false };
  }

  private warpFlash(on: boolean): void {
    let el = document.getElementById("warp-flash");
    if (!el) {
      el = document.createElement("div");
      el.id = "warp-flash";
      document.body.appendChild(el);
    }
    el.classList.toggle("on", on);
  }

  private stepGateJump(dt: number): void {
    const j = this.gateJump!;
    const rig = this.engine.rig;
    const cam = this.engine.camera;
    j.t += dt;
    if (j.phase === "dive") {
      if (j.t > 0.8 && !j.fired) {
        // Punch through the membrane.
        j.fired = true;
        rig.focus(j.gate.clone().addScaledVector(j.out, 40), 0.4);
        this.systemView?.effects.jump(j.gate, new THREE.Color("#7fc8ff"));
      }
      if (j.fired) cam.fov = THREE.MathUtils.lerp(cam.fov, this.baseFov + 45, 1 - Math.exp(-dt * 4));
      if (j.t > 1.15) this.warpFlash(true);
      if (j.t > 1.35) {
        this.enterSystem(j.to);
        const exit = this.systemView?.gateWorld(j.tunnelId);
        if (!exit) {
          this.endGateJump();
          return;
        }
        const out = exit.clone().normalize();
        // Arrive just outside the twin gate, looking in towards the star...
        rig.minDistance = 0.3;
        rig.follow = null;
        rig.goalYaw = Math.atan2(out.x, out.z);
        rig.goalPitch = 0.04;
        rig.focus(exit.clone().addScaledVector(out, -6), 9);
        rig.snap();
        this.systemView!.effects.jump(exit, new THREE.Color("#7fc8ff"));
        this.gateJump = { ...j, phase: "emerge", t: 0, gate: exit, out, fired: false };
        this.warpFlash(false);
      }
    } else {
      cam.fov = THREE.MathUtils.lerp(cam.fov, this.baseFov, 1 - Math.exp(-dt * 2.5));
      if (j.t > 0.35 && !j.fired) {
        // ...then pull back to take in the whole system from the side.
        j.fired = true;
        rig.focus(new THREE.Vector3(), (this.systemView?.extentScene ?? 300) * 1.9);
        rig.goalPitch = 0.2;
      }
      if (j.t > 2.6) this.endGateJump();
    }
    cam.updateProjectionMatrix();
  }

  private endGateJump(): void {
    const cam = this.engine.camera;
    cam.fov = this.baseFov;
    cam.updateProjectionMatrix();
    this.engine.rig.minDistance = 3;
    this.warpFlash(false);
    this.gateJump = null;
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
      if (f && f.empireId === this.game.playerId && !f.civilian) this.activeFleetId = sel.id;
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
    if (this.remote) {
      this.net.send({ t: "speed", index: i });
      return;
    }
    if (i === 0) this.localPaused = true;
    else {
      this.localPaused = false;
      this.localSpeed = i;
    }
    this.hud?.render();
  }

  togglePause(): void {
    if (this.remote) {
      const info = this.remote.info;
      this.setSpeed(info.speedIndex > 0 ? 0 : 1);
      return;
    }
    this.localPaused = !this.localPaused;
    this.hud?.render();
  }

  toast(msg: string, kind: "error" | "good" | "info" = "info"): void {
    const root = document.getElementById("toasts")!;
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.textContent = msg;
    el.title = "Right-click to dismiss";
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      el.remove();
    });
    root.appendChild(el);
    setTimeout(() => el.remove(), kind === "error" ? 3200 : 2400);
    while (root.children.length > 4) root.firstChild?.remove();
  }

  // ---------------------------------------------------------------- orders
  /** Right-click order for the active fleet; with Shift it is queued after its current orders. */
  private commandAt(pick: PickResult | null, queued = false): void {
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
      r = g.moveFleet(fleet.id, sys.id, { bodyId: sys.starIds[0] }, queued);
      msg = `${fleet.name} → ${sys.name}`;
    } else if (pick.kind === "body") {
      const body = s.bodies[pick.id];
      const colony = Object.values(s.colonies).find((c) => c.bodyId === body.id);
      if (roles.has("colony") && !colony && canColonize(g.player, body)) {
        r = g.colonize(fleet.id, body.id, queued);
        msg = `${fleet.name} will colonize ${body.name}`;
      } else if (roles.has("transport") && colony && colony.empireId !== g.playerId) {
        r = g.invade(fleet.id, colony.id, queued);
        msg = `${fleet.name} will invade ${body.name}`;
      } else {
        r = g.moveFleet(fleet.id, body.systemId, { bodyId: body.id }, queued);
        msg = `${fleet.name} → ${body.name}`;
      }
    } else if (pick.kind === "fleet") {
      const target = s.fleets[pick.id];
      if (!target) return;
      if (target.empireId !== g.playerId && g.player.relations[target.empireId] === "war") {
        r = g.attackFleet(fleet.id, target.id);
        msg = `${fleet.name} engaging ${target.name}`;
      } else if (target.systemId) {
        r = g.moveFleet(fleet.id, target.systemId, { pos: { ...target.pos } }, queued);
        msg = `${fleet.name} joining ${target.name}`;
      }
    } else if (pick.kind === "gate") {
      const t = s.tunnels[pick.id];
      const to = t.a === this.systemId ? t.b : t.a;
      r = g.moveFleet(fleet.id, to, {}, queued);
      msg = `${fleet.name} jumping to ${s.systems[to].name}`;
    } else if (pick.kind === "point" && pick.point && this.systemView) {
      r = g.moveFleet(fleet.id, this.systemId, { pos: this.systemView.sceneToSystem(pick.point) }, queued);
      msg = `${fleet.name} moving`;
    }
    if (!r.ok) this.toast(r.error ?? "Cannot do that", "error");
    else this.toast(queued && (fleet.order || fleet.transit || fleet.queue?.length) ? `Queued: ${msg}` : msg, "good");
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
      if (!d || d.moved || !this.running || this.gateJump) return;
      const pick = this.engine.pick(e.clientX, e.clientY);
      if (d.button === 2) this.commandAt(pick, e.shiftKey);
      else if (d.button === 0) {
        if (!pick || pick.kind === "point") this.select(null);
        else this.select(pick);
      }
    });
    canvas.addEventListener("dblclick", (e) => {
      if (!this.running || this.gateJump) return;
      const pick = this.engine.pick(e.clientX, e.clientY);
      if (!pick || pick.kind === "point") return;
      if (pick.kind === "system") this.enterSystem(pick.id);
      else if (pick.kind === "gate") this.jumpThroughGate(pick.id);
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
    let alpha = 0;
    let renderDay = this.game.state.day;
    if (this.remote) {
      // The server runs the clock; we interpolate between its snapshots.
      if (this.remote.viewsReceived !== this.lastViews) {
        this.lastViews = this.remote.viewsReceived;
        steps = 1;
      }
      alpha = this.remote.alpha(now);
      renderDay = this.remote.renderDay(now);
    } else if (this.local) {
      if (this.running && !this.localPaused) {
        this.acc += dt * SPEEDS[this.localSpeed];
        while (this.acc >= STEP_DAYS && steps < 120) {
          this.local.step();
          this.acc -= STEP_DAYS;
          steps++;
        }
        if (steps >= 120) this.acc = 0;
      } else if (!this.running) {
        // Title screen: gently orbit.
        rig.goalYaw += dt * 0.03;
      }
      alpha = Math.min(1, this.acc / STEP_DAYS);
      renderDay = this.local.state.day - STEP_DAYS * (1 - alpha);
    }
    const events = this.game.drainEvents();
    if (this.local && this.running) {
      this.ensureDirector();
      if (this.director) {
        if (events.length) this.director.onEvents(events);
        this.directorTimer += dt;
        if (this.directorTimer > 0.5) {
          this.directorTimer = 0;
          this.director.tick();
        }
      }
      // Writing to another ruler pauses a local game (and resumes it after).
      const chatting = this.hud?.modal === "chat";
      if (chatting && !this.localPaused) {
        this.localPaused = true;
        this.chatPaused = true;
      } else if (!chatting && this.chatPaused) {
        this.chatPaused = false;
        this.localPaused = false;
      }
    }
    if (this.systemView) {
      this.systemView.alpha = this.running ? alpha : 0;
      this.systemView.renderDay = this.running ? renderDay : time * 0.8;
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

    if (this.gateJump) this.stepGateJump(dt);
    this.engine.render(dt, time);
    if (this.running) {
      const anchors = this.systemView ? this.systemView.labelAnchors() : this.galaxyView ? this.galaxyView.labelAnchors() : [];
      this.labels.update(this.engine, anchors, { hideMoonsBeyond: 80 });
      this.hudTimer += dt;
      if (this.hudTimer > 0.25) {
        this.hudTimer = 0;
        this.recordSightings();
        this.watchBattles();
        this.hud?.render();
      }
      if (this.local && !this.localPaused && !this.local.state.winner) this.autosaveTimer += dt;
      if (this.local && this.autosaveTimer > 90) {
        this.autosaveTimer = 0;
        try {
          writeSave(AUTOSAVE_KEY, this.local.serialize());
        } catch {
          /* storage full or unavailable: ignore autosave */
        }
      }
    }
  }
}

new App();
