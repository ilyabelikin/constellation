// In-game HUD. Renders HTML strings from game state a few times per second
// (only touching the DOM when content changes) and routes clicks through a
// single delegated handler using data-action attributes.

import { PLANET_TYPE_MAP, BELT_TYPE_MAP } from "../sim/data/planets";
import { HULLS, HULL_MAP } from "../sim/data/ships";
import { STAR_TYPE_MAP } from "../sim/data/stars";
import { BUILDINGS, BUILDING_MAP, SPECIES_MAP, STATIONS, STATION_MAP } from "../sim/data/structures";
import { BRANCH_INFO, TECHS, TECH_MAP, type Branch } from "../sim/data/techs";
import { empirePower } from "../sim/ai";
import { fleetArmed, fleetPower, healthFraction } from "../sim/combat";
import {
  adminUpkeep,
  buildingSlots,
  canColonize,
  commandCapacity,
  commandUsed,
  garrison,
  settlementUpkeep,
  SETTLEMENT_DAYS,
  SETTLEMENT_UPKEEP,
  habitability,
  hullCost,
  incomeReport,
  buildingOutput,
  systemHolders,
  isBankrupt,
  isBlackout,
  maxDefense,
  popCapacity,
  stationAllowedOn,
  stationBuildError,
  stationProduction,
  storageCap,
  systemOwner,
  systemOwnerMap,
  techCost,
} from "../sim/economy";
import { fleetSpeed, findRoute } from "../sim/fleets";
import type { PlayerFacade as Game } from "../sim/facade";
import { buildingUnlocked, hullUnlocked, shipStats, stationUnlocked } from "../sim/modifiers";
import { dist } from "../sim/orbits";
import type { Body, ChatMessage, Colony, DiploAction, Fleet, GameLogEntry, Order, ResourceKey, Stance } from "../sim/types";
import type { SessionInfo } from "../net/protocol";
import { inviteLink } from "./Lobby";
import { morphHtml } from "./morph";
import { canAfford, canSeeLog } from "../sim/util";
import { hasMet } from "../sim/knowledge";
import { supplyLevel } from "../sim/supplies";
import type { PickResult } from "../render/Engine";
import { costHtml, dateString, esc, fmt, pct, RES_ICON, RES_NAME, signed, yieldsHtml } from "./format";
import { helpHtml } from "./help";
import { colonyShipOptions } from "../sim/planning";
import { findOpportunities, OPPORTUNITY_META, type Opportunity, type OpportunityKind, type OpportunityTarget } from "./opportunities";

function targetKey(t: OpportunityTarget): string {
  return `${t.kind}:${t.id}`;
}

export interface AppApi {
  game: Game;
  view: "galaxy" | "system";
  systemId: string;
  selection: PickResult | null;
  activeFleetId: string | null;
  readonly speedIndex: number;
  readonly paused: boolean;
  /** May this player change the game speed (always locally; only the host online)? */
  readonly isHost: boolean;
  /** Connected to the game server. */
  readonly online: boolean;
  /** The online session being played (null in local games). */
  readonly remote: { info: SessionInfo } | null;
  readonly chats: ChatMessage[];
  canChat(empireId: string): boolean;
  sendChat(to: string, text: string): void;
  /** Send an automatic note about a diplomatic act, so its recipient can react. */
  announce(to: string, text: string, action?: DiploAction): void;
  cloudSave(): void;
  select(sel: PickResult | null, focus?: boolean): void;
  enterSystem(id: string, focusSel?: PickResult | null): void;
  jumpThroughGate(tunnelId: string): void;
  /** Show what a log entry is about (or where it was last seen). */
  locateLog(entry: GameLogEntry): void;
  showGalaxy(): void;
  goHome(): void;
  setSpeed(i: number): void;
  togglePause(): void;
  focusSelection(): void;
  toast(msg: string, kind?: "error" | "good" | "info"): void;
  save(): void;
  load(): void;
  quitToTitle(): void;
}

type Modal = null | "research" | "empires" | "menu" | "help" | "end" | "colonize" | "chat";

export class Hud {
  private regions: Record<string, HTMLElement> = {};
  private cache: Record<string, string> = {};
  modal: Modal = null;
  private endShown = false;
  private splitSel = new Set<string>();
  private logCount = 0;
  private logEntries: GameLogEntry[] = [];
  outlinerTab: "system" | "empire" = "system";
  private badgeIndex: Partial<Record<OpportunityKind, number>> = {};
  private opportunities: Opportunity[] = [];
  private dismissed: Partial<Record<OpportunityKind, Set<string>>> = {};
  private colonizeTarget: string | null = null;
  private chatWith: string | null = null;
  private shiftHeld = false;
  /** Fleet whose name is being edited in place. */
  private renaming: string | null = null;
  private seenChats = new Set<string>();

  constructor(
    root: HTMLElement,
    private modalRoot: HTMLElement,
    private app: AppApi,
  ) {
    root.innerHTML = `
      <div id="topbar" class="panel"></div>
      <div id="badges"></div>
      <div id="outliner" class="panel"></div>
      <div id="details" class="panel hidden"></div>
      <div id="log" class="panel"></div>
      <div id="viewbar" class="panel"></div>
      <div id="minihelp" class="panel">Right-click to command the active fleet · <kbd>Shift</kbd> queues orders · <kbd>?</kbd> help</div>`;
    for (const id of ["topbar", "badges", "outliner", "details", "log", "viewbar"]) this.regions[id] = root.querySelector(`#${id}`)!;
    root.addEventListener("click", (e) => this.onClick(e));
    root.addEventListener("contextmenu", (e) => {
      const badge = (e.target as HTMLElement).closest<HTMLElement>('[data-action^="badge:"]');
      if (!badge) return;
      e.preventDefault();
      this.dismissBadge(badge.dataset.action!.split(":")[1] as OpportunityKind);
    });
    modalRoot.addEventListener("click", (e) => this.onClick(e));
    modalRoot.addEventListener("keydown", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.id === "chat-input" && e.key === "Enter") {
        e.preventDefault();
        this.submitChat();
      }
    });
    root.addEventListener("keydown", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.id !== "rename-input") return;
      e.stopPropagation(); // typing a name must not trigger hotkeys
      if (e.key === "Enter") this.finishRename(true);
      else if (e.key === "Escape") this.finishRename(false);
    });
    root.addEventListener("focusout", (e) => {
      if ((e.target as HTMLElement).id === "rename-input") this.finishRename(true);
    });
    root.addEventListener("change", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.ship) {
        if (t.checked) this.splitSel.add(t.dataset.ship);
        else this.splitSel.delete(t.dataset.ship);
      }
    });
  }

  get game(): Game {
    return this.app.game;
  }

  private set(region: string, html: string, el?: HTMLElement): void {
    if (this.cache[region] === html) return;
    this.cache[region] = html;
    const target = el ?? this.regions[region];
    // Patch in place (not innerHTML): hovered buttons don't blink, clicks in
    // progress aren't lost, and typed text, focus and scroll positions survive.
    const log0 = target.querySelector<HTMLElement>(".chat-log");
    const chatLen = log0?.childElementCount ?? -1;
    morphHtml(target, html);
    const log = target.querySelector<HTMLElement>(".chat-log");
    if (log && log.childElementCount !== chatLen) log.scrollTop = log.scrollHeight;
  }

  private finishRename(save: boolean): void {
    const id = this.renaming;
    if (!id) return;
    const input = this.regions.details.querySelector<HTMLInputElement>("#rename-input");
    this.renaming = null;
    const name = input?.value.trim() ?? "";
    if (save && name && name !== this.game.state.fleets[id]?.name) {
      const r = this.game.renameFleet(id, name);
      if (!r.ok) this.app.toast(r.error ?? "Cannot rename", "error");
    }
    this.invalidate();
    this.render();
  }

  isChattingWith(empireId: string): boolean {
    return this.modal === "chat" && this.chatWith === empireId;
  }

  private unreadFrom(empireId?: string): number {
    const me = this.game.playerId;
    return this.app.chats.filter((m) => m.to === me && m.from !== me && (!empireId || m.from === empireId) && !this.seenChats.has(m.id)).length;
  }

  private submitChat(): void {
    const input = this.modalRoot.querySelector<HTMLInputElement>("#chat-input");
    if (!input || !this.chatWith) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    this.app.sendChat(this.chatWith, text);
    this.render();
  }

  invalidate(): void {
    this.cache = {};
  }

  render(): void {
    this.renderTopbar();
    this.renderBadges();
    this.renderOutliner();
    this.renderDetails();
    this.renderLog();
    this.renderViewbar();
    this.renderModal();
  }

  // ------------------------------------------------------------ topbar
  private renderTopbar(): void {
    const g = this.game;
    const p = g.player;
    const r = p.resources;
    const inc = p.income;
    const cap = storageCap(g.state, p);
    const report = incomeReport(g.state, p);
    const res = (k: ResourceKey) => {
      const tip = `${RES_NAME[k]}: ${fmt(r[k], 1)} / ${fmt(cap)}\nProduction ${signed(report.gross[k])}/day\nUpkeep ${signed(-report.upkeep[k])}/day${k === "credits" ? ` (ships' crews, buildings, administration)\nMerchant trade ~${signed(p.tradeRate ?? 0)}/day (paid on delivery)` : ""}${k === "credits" ? `\n(of which administration ${fmt(adminUpkeep(g.playerColonies().length), 1)})` : ""}`;
      const warn = (k === "energy" && isBlackout(p)) || (k === "credits" && isBankrupt(p));
      return `<div class="res ${k} ${warn ? "warn" : ""}" title="${esc(tip)}"><span class="icon">${RES_ICON[k]}</span>${fmt(r[k])}<span class="inc ${inc[k] < 0 ? "neg" : "pos"}">${signed(inc[k])}</span></div>`;
    };
    const cur = p.research.current ? TECH_MAP[p.research.current] : null;
    const progress = cur ? (p.research.progress[cur.id] ?? 0) / techCost(g.state, p, cur) : 0;
    const used = commandUsed(g.state, p);
    const capC = commandCapacity(g.state, p);
    const speeds = ["❚❚", "1×", "2×", "4×", "8×"];
    const unread = this.unreadFrom();
    const remote = this.app.remote;
    const players = remote ? remote.info.seats.filter((x) => x.playerName) : [];
    this.set(
      "topbar",
      `<span class="brand">CONSTELLATION</span>
      ${res("credits")}${res("metals")}${res("energy")}${res("exotics")}
      <div class="res research" title="Research per day. Current: ${cur ? esc(cur.name) : "none"}"><span class="icon">${RES_ICON.research}</span>${fmt(inc.research, 1)}<span class="inc">${cur ? `${esc(cur.name)} ${pct(progress)}` : "idle"}</span></div>
      <div class="res cmd ${used >= capC ? "warn" : ""}" title="Fleet command points used / capacity. Found colonies and research hulls to raise it."><span class="icon">⚑</span>${used}/${capC}</div>
      <div class="spacer"></div>
      <button data-action="modal:research" title="Research (R)">⚗ Research</button>
      <button data-action="modal:empires" title="Empires & diplomacy (E)">☍ Empires${unread ? `<span class="unread">${unread}</span>` : ""}</button>
      ${remote ? `<div class="res online" title="${esc(players.map((x) => `${x.playerName} — ${x.empireName}${x.online ? "" : " (offline)"}`).join("\n"))}\nInvite code ${esc(remote.info.code)}"><span class="icon">👥</span>${players.filter((x) => x.online).length}/${players.length}</div>` : ""}
      <div class="date">${dateString(g.state.day)}</div>
      <div class="speed">${speeds
        .map((s, i) => {
          const locked = i > 0 && !this.app.isHost;
          return `<button data-action="speed:${i}" class="${(i === 0 && this.app.paused) || (!this.app.paused && i === this.app.speedIndex) ? "active" : ""}" ${locked ? "disabled" : ""} title="${locked ? "Only the host controls the speed" : i === 0 ? "Pause (Space)" : `Speed ${s} (${i})`}">${s}</button>`;
        })
        .join("")}</div>
      <button data-action="modal:menu" title="Menu (Esc)">☰</button>`,
    );
  }

  // ------------------------------------------------------------ outliner
  private renderOutliner(): void {
    const g = this.game;
    const s = g.state;
    const sel = this.app.selection;
    const colonies = g.playerColonies().sort((a, b) => Number(b.capital) - Number(a.capital) || b.pop - a.pop);
    const fleets = Object.values(s.fleets).filter((f) => f.empireId === s.playerId && f.ships.length);
    const colonyRows = colonies
      .map((c) => {
        const q = c.queue[0];
        const busy = q ? `<span class="tag busy">${q.kind === "ship" ? HULL_MAP[q.type].name : BUILDING_MAP[q.type].name}</span>` : "";
        const siege = c.defense <= 0 ? `<span class="tag war">besieged</span>` : "";
        return `<div class="row ${sel?.kind === "body" && sel.id === c.bodyId ? "sel" : ""}" data-action="goto:body:${c.bodyId}">
          <span class="dot" style="color:${g.player.color};background:${g.player.color}"></span>
          <span class="name">${c.capital ? "★ " : ""}${esc(c.name)}</span>${siege}${busy}<span class="meta">${c.pop.toFixed(1)}</span></div>`;
      })
      .join("");
    const fleetRows = fleets
      .map((f) => {
        const status = f.battleId ? `<span class="tag war">combat</span>` : f.transit ? `<span class="tag busy">tunnel</span>` : f.order ? `<span class="tag busy">${f.order.kind === "buildStation" ? "building" : f.order.kind}</span>` : "";
        const active = this.app.activeFleetId === f.id;
        return `<div class="row ${active ? "sel" : ""}" data-action="goto:fleet:${f.id}">
          <span class="dot" style="color:${fleetArmed(f) ? "#ff9d6b" : "#9fe0ff"};background:currentColor"></span>
          <span class="name">${esc(f.name)}</span>${status}<span class="meta">${f.ships.length}</span></div>`;
      })
      .join("");
    const tabs = `<div class="tabs"><button data-action="tab:system" class="${this.outlinerTab === "system" ? "active" : ""}">☉ System</button><button data-action="tab:empire" class="${this.outlinerTab === "empire" ? "active" : ""}">⚑ Empire</button></div>`;
    if (this.outlinerTab === "system") {
      this.set("outliner", tabs + this.systemOutline(this.outlineSystemId()));
      return;
    }
    this.set(
      "outliner",
      `${tabs}<div class="section-title"><span>Colonies</span><span>${colonies.length}</span></div>${colonyRows || `<div class="hint">No colonies.</div>`}
      <div class="section-title"><span>Fleets</span><span>${fleets.length}</span></div>${fleetRows || `<div class="hint">No fleets.</div>`}`,
    );
  }

  /** In the galaxy view the outline follows the selected star; otherwise the current system. */
  private outlineSystemId(): string {
    const sel = this.app.selection;
    if (this.app.view === "galaxy" && sel?.kind === "system") return sel.id;
    return this.app.systemId;
  }

  // ------------------------------------------------------------ system outline
  private systemOutline(systemId: string): string {
    const g = this.game;
    const s = g.state;
    const p = g.player;
    const sys = s.systems[systemId];
    if (!p.explored[systemId]) {
      return `<div class="section-title"><span>Unexplored system</span></div><div class="hint">Send a scout or any fleet through a tunnel to survey it and reveal its worlds.</div>`;
    }
    const sel = this.app.selection;
    const owner = systemOwner(s, systemId);
    const colonyBy = new Map(Object.values(s.colonies).map((c) => [c.bodyId, c]));
    const stationsBy = new Map<string, string[]>();
    for (const st of Object.values(s.stations)) {
      const list = stationsBy.get(st.bodyId) ?? [];
      list.push(`<span class="st" style="color:${s.empires[st.empireId].color}" title="${esc(STATION_MAP[st.type].name)} (${esc(s.empires[st.empireId].name)})">${STATION_MAP[st.type].icon}</span>`);
      stationsBy.set(st.bodyId, list);
    }
    const richIcons = (b: Body) =>
      (["metals", "energy", "research", "exotics"] as const)
        .filter((k) => b.richness[k] >= (k === "exotics" ? 0.5 : 1.3))
        .map((k) => `<span class="ri" style="color:var(--${k})" title="${RES_NAME[k]} ×${b.richness[k].toFixed(1)}">${RES_ICON[k]}</span>`)
        .join("") +
      (b.features.includes("artifact") ? `<span class="ri good" title="Precursor artifact">⌬</span>` : "") +
      (b.features.includes("anomaly") ? `<span class="ri good" title="Anomaly">◈</span>` : "");
    const row = (b: Body, depth: number, icon: string, typeName: string) => {
      const col = colonyBy.get(b.id);
      const h = b.size > 0 ? habitability(p, b) : 0;
      const hab = !col && b.size > 0 && h >= 0.2 ? `<span class="hab" style="color:${h >= 0.5 ? "var(--good)" : "var(--warn)"}" title="Habitability for us">${pct(h)}</span>` : "";
      const colTag = col ? `<span class="dot" style="color:${s.empires[col.empireId].color};background:${s.empires[col.empireId].color}" title="${esc(s.empires[col.empireId].name)} colony · ${col.pop.toFixed(1)} pop"></span>` : "";
      return `<div class="row orow ${sel?.kind === "body" && sel.id === b.id ? "sel" : ""}" style="padding-left:${6 + depth * 14}px" data-action="goto:body:${b.id}" title="${esc(typeName)}">
        <span class="oicon">${icon}</span><span class="name">${esc(b.name)}<span class="otype">${esc(typeName)}</span></span>${colTag}${hab}${richIcons(b)}${(stationsBy.get(b.id) ?? []).join("")}</div>`;
    };
    const bodies = sys.bodyIds.map((id) => s.bodies[id]);
    const byOrbit = (a: Body, b: Body) => (a.orbit?.a ?? 0) - (b.orbit?.a ?? 0);
    let html = `<div class="section-title"><span>${esc(sys.name)}</span><span>${owner ? `<span style="color:${s.empires[owner].color}">${esc(s.empires[owner].name.split(" ")[0])}</span>` : "unclaimed"}</span></div>`;
    for (const sid of sys.starIds) {
      const st = s.bodies[sid];
      html += row(st, 0, `<span style="color:${STAR_TYPE_MAP[st.type].color}">✹</span>`, STAR_TYPE_MAP[st.type].name);
    }
    const top = bodies.filter((b) => b.kind !== "moon").sort(byOrbit);
    for (const b of top) {
      if (b.kind === "belt") html += row(b, 0, "⁘", BELT_TYPE_MAP[b.type].name);
      else if (b.kind === "comet") html += row(b, 0, "☄", "Comet");
      else {
        const pt = PLANET_TYPE_MAP[b.type];
        html += row(b, 0, `<span style="color:${pt.visual.palette[2]}">●</span>`, pt.name + (b.ring ? " · rings" : ""));
        for (const m of bodies.filter((x) => x.parentId === b.id).sort(byOrbit)) {
          html += row(m, 1, `<span style="color:${PLANET_TYPE_MAP[m.type].visual.palette[2]}">•</span>`, PLANET_TYPE_MAP[m.type].name);
        }
      }
    }
    html += `<div class="section-title"><span>Tunnels</span><span>${sys.gates.length}</span></div>`;
    for (const gate of sys.gates) {
      const known = !!p.explored[gate.otherSystemId];
      html += `<div class="row orow ${sel?.kind === "gate" && sel.id === gate.tunnelId ? "sel" : ""}" data-action="sel:gate:${gate.tunnelId}:${systemId}">
        <span class="oicon">⟶</span><span class="name">${esc(s.systems[gate.otherSystemId].name)}${known ? "" : " · unexplored"}<span class="otype">${s.tunnels[gate.tunnelId].travelDays.toFixed(0)} days</span></span></div>`;
    }
    const fleets = Object.values(s.fleets).filter((f) => f.systemId === systemId && f.ships.length && (f.empireId === p.id || this.playerPresent(systemId)));
    if (fleets.length) {
      html += `<div class="section-title"><span>Fleets here</span><span>${fleets.length}</span></div>`;
      for (const f of fleets) {
        const e = s.empires[f.empireId];
        html += `<div class="row orow ${sel?.kind === "fleet" && sel.id === f.id ? "sel" : ""}" data-action="goto:fleet:${f.id}">
          <span class="dot" style="color:${e.color};background:${e.color}"></span><span class="name">${esc(f.name)}<span class="otype">${esc(e.name.split(" ")[0])}${f.battleId ? " · ⚔" : ""}</span></span><span class="meta">${f.ships.length}</span></div>`;
      }
    }
    return html;
  }

  private playerPresent(systemId: string): boolean {
    const s = this.game.state;
    const pid = s.playerId;
    return (
      Object.values(s.fleets).some((f) => f.empireId === pid && f.systemId === systemId) ||
      Object.values(s.colonies).some((c) => c.empireId === pid && c.systemId === systemId)
    );
  }

  // ------------------------------------------------------------ opportunity badges
  private renderBadges(): void {
    const g = this.game;
    const scope = this.app.view === "system" ? [this.app.systemId] : Object.keys(g.state.systems);
    const all = findOpportunities(g, scope);
    // Dismissed targets stay hidden; a badge reappears only for new targets.
    // Once a kind has nothing at all, forget its dismissals so it can return later.
    for (const kind of Object.keys(this.dismissed) as OpportunityKind[]) {
      if (!all.some((o) => o.kind === kind)) delete this.dismissed[kind];
    }
    this.opportunities = all
      .map((o) => ({ ...o, targets: o.targets.filter((t) => !this.dismissed[o.kind]?.has(targetKey(t))) }))
      .filter((o) => o.targets.length > 0);
    const where = this.app.view === "system" ? `in ${g.state.systems[this.app.systemId].name}` : "across explored space";
    const html = this.opportunities
      .map((o) => {
        const site = !["idleShips", "freeSlots", "researchIdle"].includes(o.kind);
        const tip = `${o.title}${site ? ` ${where}` : ""}:\n${o.targets.slice(0, 8).map((t) => "• " + t.label).join("\n")}${o.targets.length > 8 ? `\n…and ${o.targets.length - 8} more` : ""}\n(click to cycle · right-click to dismiss)`;
        return `<button class="badge" data-action="badge:${o.kind}" title="${esc(tip)}" style="--bc:${o.color}"><span class="bi">${o.icon}</span>${o.kind === "researchIdle" ? "" : `<span class="bn">${o.targets.length}</span>`}</button>`;
      })
      .join("");
    this.set("badges", html);
  }

  /** Hide a badge's current targets until something new shows up. */
  dismissBadge(kind: OpportunityKind): void {
    const o = this.opportunities.find((x) => x.kind === kind);
    if (!o) return;
    const set = (this.dismissed[kind] ??= new Set());
    for (const t of o.targets) set.add(targetKey(t));
    delete this.badgeIndex[kind];
    this.renderBadges();
  }

  private cycleBadge(kind: OpportunityKind): void {
    const o = this.opportunities.find((x) => x.kind === kind);
    if (!o || !o.targets.length) return;
    const i = (this.badgeIndex[kind] ?? -1) + 1;
    this.badgeIndex[kind] = i % o.targets.length;
    const t = o.targets[i % o.targets.length];
    const app = this.app;
    if (t.kind === "research") {
      this.modal = "research";
      return;
    }
    if (t.kind === "fleet") {
      const f = this.game.state.fleets[t.id];
      if (f?.systemId) app.enterSystem(f.systemId, { kind: "fleet", id: t.id });
      return;
    }
    const body = this.game.state.bodies[t.id];
    if (body) app.enterSystem(body.systemId, { kind: "body", id: body.id });
    app.toast(`${OPPORTUNITY_META[kind].icon} ${t.label}  (${(i % o.targets.length) + 1}/${o.targets.length})`, "info");
  }

  // ------------------------------------------------------------ viewbar & log
  private renderViewbar(): void {
    const s = this.game.state;
    this.set(
      "viewbar",
      `<button data-action="view:galaxy" class="${this.app.view === "galaxy" ? "active" : ""}" title="Galaxy map (G)">✧ Galaxy</button>
       <button data-action="view:system" class="${this.app.view === "system" ? "active" : ""}" title="Current system">☉ ${esc(s.systems[this.app.systemId].name)}</button>
       <button data-action="view:home" title="Home system (H)">⌂ Home</button>`,
    );
  }

  private renderLog(): void {
    const s = this.game.state;
    const entries = s.log.filter((l) => canSeeLog(l, s.playerId)).slice(-60);
    const last = entries[entries.length - 1];
    if (entries.length !== this.logCount || last !== this.logEntries[this.logEntries.length - 1] || this.cache.log === undefined) {
      this.logCount = entries.length;
      this.logEntries = entries;
      const html = entries
        .map(
          (l, i) =>
            `<div class="log-entry ${l.kind}" ${l.ref || l.systemId ? `data-action="log:${i}" data-system="1" title="Click to locate"` : ""}><span class="d">${dateString(l.day).slice(0, 7)}</span><span class="t">${esc(l.text)}</span></div>`,
        )
        .join("");
      this.set("log", html);
      this.regions.log.scrollTop = this.regions.log.scrollHeight;
    }
  }

  // ------------------------------------------------------------ details
  private renderDetails(): void {
    const sel = this.app.selection;
    const el = this.regions.details;
    if (!sel || sel.kind === "point") {
      el.classList.add("hidden");
      this.cache.details = "";
      return;
    }
    el.classList.remove("hidden");
    let html = "";
    if (sel.kind === "body") html = this.bodyDetails(sel.id);
    else if (sel.kind === "fleet") html = this.fleetDetails(sel.id);
    else if (sel.kind === "gate") html = this.gateDetails(sel.id);
    else if (sel.kind === "system") html = this.systemDetails(sel.id);
    this.set("details", html || `<div class="hint">Nothing selected.</div>`);
  }

  /**
   * The ship to task with a job: the selected fleet if it can do it, else the
   * nearest idle one, else a busy one (the job can then be Shift-queued).
   */
  private fleetFor(role: string, systemId: string): { fleet: Fleet; busy: boolean } | null {
    const s = this.game.state;
    const hasRole = (f: Fleet) => f.empireId === s.playerId && !f.civilian && f.ships.some((sh) => HULL_MAP[sh.hull].role === role);
    const active = this.app.activeFleetId ? s.fleets[this.app.activeFleetId] : null;
    if (active && hasRole(active)) return { fleet: active, busy: !!(active.order || active.transit) };
    const idle = this.nearestIdleFleet(role, systemId);
    if (idle) return { fleet: idle, busy: false };
    const busy = Object.values(s.fleets)
      .filter(hasRole)
      .sort((a, b) => (a.queue?.length ?? 0) - (b.queue?.length ?? 0))[0];
    return busy ? { fleet: busy, busy: true } : null;
  }

  /** Give a job to a fleet: immediately when idle, queued with Shift when busy. */
  private dispatch(pick: { fleet: Fleet; busy: boolean }, run: (queued: boolean) => { ok: boolean; error?: string }, what: string): void {
    const { fleet, busy } = pick;
    if (busy && !this.shiftHeld) {
      this.app.toast(`${fleet.name} is busy — Shift+click to queue this after its current orders`, "info");
      return;
    }
    const r = run(this.shiftHeld);
    if (!r.ok) this.app.toast(r.error ?? "Cannot do that", "error");
    else this.app.toast(busy ? `Queued for ${fleet.name}: ${what}` : `${fleet.name}: ${what}`, "good");
    this.invalidate();
  }

  private nearestIdleFleet(role: string, bodySystemId: string): Fleet | null {
    const s = this.game.state;
    let best: Fleet | null = null;
    let bestHops = Infinity;
    for (const f of Object.values(s.fleets)) {
      if (f.empireId !== s.playerId || !f.ships.some((sh) => HULL_MAP[sh.hull].role === role)) continue;
      // Never silently re-task a fleet that is already busy.
      if (f.order || f.transit) continue;
      const hops = findRoute(s, f.systemId!, bodySystemId, this.game.player)?.length ?? 99;
      if (hops < bestHops) {
        best = f;
        bestHops = hops;
      }
    }
    return best;
  }

  private bodyDetails(id: string): string {
    const g = this.game;
    const s = g.state;
    const p = g.player;
    const b = s.bodies[id];
    if (!b) return "";
    const colony = Object.values(s.colonies).find((c) => c.bodyId === id);
    const explored = !!p.explored[b.systemId];
    let typeName = "";
    let desc = "";
    const kv: [string, string][] = [];
    if (b.kind === "star") {
      const st = STAR_TYPE_MAP[b.type];
      typeName = `${st.name} (${st.spectral})`;
      desc = st.description;
      if (st.special !== "blackhole") kv.push(["Luminosity", `${b.luminosity! < 0.01 ? b.luminosity!.toExponential(1) : fmt(b.luminosity!, 2)} L☉`]);
      kv.push(["Mass", `${fmt(b.mass!, 2)} M☉`], ["Solar yield", `×${st.solar.toFixed(1)}`]);
      if (st.research) kv.push(["Research potential", `×${st.research.toFixed(1)}`]);
      if (st.exotics) kv.push(["Exotic matter", `×${st.exotics.toFixed(1)}`]);
    } else if (b.kind === "belt") {
      const bt = BELT_TYPE_MAP[b.type];
      typeName = bt.name;
      desc = bt.description;
      kv.push(["Orbit", `${b.orbit!.a.toFixed(2)} AU`]);
    } else if (b.kind === "comet") {
      typeName = "Comet";
      desc = "A dirty snowball on a long elliptical orbit, rich in volatile ices.";
      kv.push(["Orbit", `${b.orbit!.a.toFixed(1)} AU, e=${b.orbit!.e.toFixed(2)}`]);
    } else {
      const pt = PLANET_TYPE_MAP[b.type];
      typeName = `${pt.name}${b.kind === "moon" ? " (moon)" : ""}`;
      desc = pt.description;
      const h = habitability(p, b);
      kv.push(["Radius", `${b.radius.toFixed(2)} R⊕`]);
      if (b.temperatureK) kv.push(["Temperature", `${b.temperatureK} K`]);
      if (b.orbit && b.kind === "planet") kv.push(["Orbit", `${b.orbit.a.toFixed(2)} AU · ${fmt(b.orbit.period)} d`]);
      if (b.size > 0) kv.push(["Colony size", `${b.size}`], ["Habitability", `<span style="color:${h >= 0.5 ? "var(--good)" : h >= 0.2 ? "var(--warn)" : "var(--bad)"}">${pct(h)}</span>`]);
    }
    const rich = Object.entries(b.richness)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `<span class="chip" style="color:var(--${k})">${RES_ICON[k]} ${RES_NAME[k]} ×${v.toFixed(1)}</span>`)
      .join("");
    const feats = b.features
      .filter((f) => f !== "tidallyLocked")
      .map((f) => `<span class="chip ${f === "artifact" || f === "anomaly" ? "good" : ""}">${{ artifact: "⌬ Precursor artifact", anomaly: "◈ Anomaly", rings: "◯ Rings", homeworld: "★ Homeworld" }[f] ?? f}</span>`)
      .join("");
    let html = `<h2>${esc(b.name)}</h2><div class="subtitle">${esc(typeName)} · ${esc(s.systems[b.systemId].name)} system</div>
      <p class="desc">${esc(desc)}</p>
      <div class="kv">${kv.map(([k, v]) => `<div class="k">${k}</div><div class="v">${v}</div>`).join("")}</div>
      ${rich || feats ? `<div class="chips">${rich}${feats}</div>` : ""}`;

    if (colony) html += this.colonySection(colony);
    // Stations on this body
    const stations = Object.values(s.stations).filter((st) => st.bodyId === id);
    if (stations.length) {
      html += `<div class="section-title">Stations</div>`;
      for (const st of stations) {
        const def = STATION_MAP[st.type];
        const owner = s.empires[st.empireId];
        const out = st.empireId === s.playerId ? yieldsHtml(stationProduction(s, st)) : "";
        html += `<div class="row"><span class="dot" style="color:${owner.color};background:${owner.color}"></span><span class="name">${def.icon} ${esc(def.name)}</span><span class="meta">${out}</span></div>
          <div class="bar hp"><div style="width:${Math.max(0, (st.hp / def.hp) * 100)}%"></div></div>`;
      }
    }
    if (!explored) return html + `<div class="hint">Send a ship to survey this system.</div>`;

    // Player actions
    const actions: string[] = [];
    if (!colony && (b.kind === "planet" || b.kind === "moon") && b.size > 0) {
      const ok = canColonize(p, b);
      const f = ok ? this.nearestIdleFleet("colony", b.systemId) : null;
      const owner = systemOwner(s, b.systemId);
      const blocked = owner && owner !== p.id && !s.empires[owner].isPirate;
      const pending =
        Object.values(s.fleets).find((x) => x.empireId === p.id && x.order?.kind === "colonize" && x.order.bodyId === b.id) ??
        null;
      const queuedAt = g.playerColonies().find((c) => c.queue.some((q) => q.kind === "ship" && q.then?.bodyId === b.id));
      if (pending) actions.push(`<span class="chip good">🜨 ${esc(pending.name)} is on its way</span>`);
      else if (queuedAt) actions.push(`<span class="chip good">🜨 Colony ship being built at ${esc(queuedAt.name)}</span>`);
      else
        actions.push(
          `<button class="primary" data-action="colonize:${b.id}" ${ok && !blocked ? "" : "disabled"} title="${!ok ? "Uninhabitable for our species (needs 20%+)" : blocked ? "Claimed by another empire" : f ? `Send ${esc(f.name)}` : "Build a colony ship for this world"}">🜨 Colonize${f && ok ? ` · ${esc(f.name)}` : "…"}</button>`,
        );
    }
    if (colony && colony.empireId !== p.id && p.relations[colony.empireId] === "war") {
      const t = this.fleetFor("transport", b.systemId);
      actions.push(
        `<button class="danger" data-action="invade:${colony.id}" ${t ? "" : "disabled"} title="${t ? (t.busy ? `${esc(t.fleet.name)} is busy — Shift+click to queue` : "Troops land once planetary defenses are down") : "Requires Troop Transports (Ground Forces tech)"}">⚔ Invade${t ? ` · ${esc(t.fleet.name)}${t.busy ? " (busy)" : ""}` : ""}</button>`,
      );
    }
    if (actions.length) html += `<div class="actions">${actions.join("")}</div>`;

    // Stations being built or queued here by our constructors (like a colony's construction queue).
    const jobs: string[] = [];
    for (const f of Object.values(s.fleets)) {
      if (f.empireId !== p.id || f.civilian) continue;
      const o = f.order;
      if (o?.kind === "buildStation" && o.bodyId === b.id && o.stationType) {
        const def = STATION_MAP[o.stationType];
        const work = o.work ?? 0;
        const building = work > 0 && !f.transit && o.route.length === 0;
        const meta = building ? `${Math.max(0, Math.ceil(def.days - work))}d` : "en route";
        jobs.push(`<div class="queue-item" title="${esc(f.name)}"><span style="width:110px">${esc(def.name)}</span><div class="bar"><div style="width:${building ? Math.min(100, (work / def.days) * 100) : 0}%"></div></div><span class="meta">${meta}</span><button data-action="cancelorder:${f.id}:-1:buildStation" title="Cancel${building ? " & refund" : ""}">✕</button></div>`);
      }
      (f.queue ?? []).forEach((q, i) => {
        if (q.kind !== "buildStation" || q.bodyId !== b.id || !q.stationType) return;
        const def = STATION_MAP[q.stationType];
        const ahead = (f.order ? 1 : 0) + i;
        jobs.push(`<div class="queue-item" title="${esc(f.name)}: ${ahead} job${ahead === 1 ? "" : "s"} ahead"><span style="width:110px">${esc(def.name)}</span><div class="bar"></div><span class="meta">queued</span><button data-action="cancelorder:${f.id}:${i}:buildStation" title="Remove from ${esc(f.name)}'s queue">✕</button></div>`);
      });
    }
    if (jobs.length) html += `<div class="section-title">Station construction</div>${jobs.join("")}`;

    // Station construction options
    const options = STATIONS.filter((d) => d.requires !== "__never__" && stationAllowedOn(d, b));
    if (options.length && (!colony || colony.empireId === p.id)) {
      const pick = this.fleetFor("constructor", b.systemId);
      const cons = pick?.fleet;
      const queued = cons?.queue?.length ?? 0;
      html += `<div class="section-title"><span>Build station</span><span>${cons ? `${esc(cons.name)}${pick!.busy ? ` · busy${queued ? ` (+${queued} queued)` : ""} · Shift+click to queue` : ""}` : "no constructor"}</span></div><div class="grid-buttons">`;
      for (const d of options) {
        const unlocked = stationUnlocked(p, d.id);
        const err = unlocked ? stationBuildError(s, p, d.id, b) : "Requires research";
        const est = estimateStation(g, d.id, b);
        // A busy constructor can still take jobs (Shift queues them); resources are paid when work starts.
        const disabled = !!err || !cons || (!pick!.busy && !canAfford(p.resources, d.cost));
        const title =
          err ??
          (!cons
            ? "Build a Constructor first"
            : pick!.busy
              ? `${cons.name} is busy — Shift+click to queue after its current orders`
              : !canAfford(p.resources, d.cost)
                ? "Not enough resources"
                : d.description);
        html += `<button class="build-btn" data-action="station:${b.id}:${d.id}" ${disabled ? "disabled" : ""} title="${esc(title)}">
          <span class="t">${d.icon} ${esc(d.name)}</span><span class="c">${costHtml(d.cost, p.resources)}</span><span class="y">${est}</span></button>`;
      }
      html += `</div>`;
    }
    if (this.app.activeFleetId && s.fleets[this.app.activeFleetId]) html += `<div class="hint">Right-click to send <b>${esc(s.fleets[this.app.activeFleetId].name)}</b> here.</div>`;
    return html;
  }

  private colonySection(c: Colony): string {
    const g = this.game;
    const s = g.state;
    const p = g.player;
    const owner = s.empires[c.empireId];
    const cap = popCapacity(s, c);
    const maxD = maxDefense(s, c);
    let html = `<div class="section-title"><span style="color:${owner.color}">${c.capital ? "★ Capital of " : "Colony of "}${esc(owner.name)}</span><span>${esc(SPECIES_MAP[owner.speciesId]?.adjective ?? "")}</span></div>
      <div class="kv"><div class="k">Population</div><div class="v">${c.pop.toFixed(2)} / ${cap.toFixed(1)}</div></div>
      <div class="bar"><div style="width:${Math.min(100, (c.pop / cap) * 100)}%"></div></div>
      <div class="kv"><div class="k">Planetary defense</div><div class="v">${fmt(c.defense)} / ${fmt(maxD)}</div><div class="k">Garrison</div><div class="v">${garrison(s, c).toFixed(1)} troops</div></div>
      <div class="bar shield"><div style="width:${(c.defense / Math.max(1, maxD)) * 100}%"></div></div>`;
    if (c.empireId !== p.id) return html;
    const settling = settlementUpkeep(s, c);
    if (settling.credits > 0.005) {
      const left = SETTLEMENT_DAYS - (s.day - c.founded);
      html += `<div class="kv" title="A young colony needs supplies shipped in until it can stand on its own. The cost fades as it settles."><div class="k">Settling in</div><div class="v">${yieldsHtml(settling, -1)} · ${Math.ceil(left)}d left</div></div>
        <div class="bar"><div style="width:${Math.min(100, (1 - left / SETTLEMENT_DAYS) * 100)}%"></div></div>`;
    }
    const slots = buildingSlots(s, c);
    const queuedB = c.queue.filter((q) => q.kind === "building").length;
    html += `<div class="section-title"><span>Buildings</span><span>${c.buildings.length + queuedB}/${slots} slots</span></div><div class="chips">`;
    c.buildings.forEach((bld, i) => {
      const d = BUILDING_MAP[bld.type];
      html += `<span class="chip" title="${esc(d.description)} (shift-click to demolish)" data-action="demolish:${c.id}:${i}">${d.icon} ${esc(d.name)}</span>`;
    });
    html += `</div>`;
    if (c.queue.length) {
      html += `<div class="section-title">Construction queue</div>`;
      c.queue.forEach((q, i) => {
        const name = q.kind === "ship" ? HULL_MAP[q.type].name : BUILDING_MAP[q.type].name;
        html += `<div class="queue-item"><span style="width:110px">${esc(name)}</span><div class="bar"><div style="width:${(q.progress / q.total) * 100}%"></div></div><span class="meta">${Math.ceil(q.total - q.progress)}d</span><button data-action="cancel:${c.id}:${i}:${q.type}" title="Cancel & refund">✕</button></div>`;
      });
    }
    html += `<div class="section-title">Construct building</div><div class="grid-buttons">`;
    for (const d of BUILDINGS) {
      if (!buildingUnlocked(p, d.id)) continue;
      const full = c.buildings.length + queuedB >= slots;
      const dup = d.unique && (c.buildings.some((x) => x.type === d.id) || c.queue.some((x) => x.type === d.id));
      const afford = canAfford(p.resources, d.cost);
      const body = s.bodies[c.bodyId];
      // What it would actually produce here (deposits, population).
      const out = buildingOutput(d, body, c.pop);
      const y = Object.fromEntries(Object.entries(out).filter(([, v]) => v > 0));
      html += `<button class="build-btn" data-action="build:${c.id}:${d.id}" ${full || dup || !afford ? "disabled" : ""} title="${esc(full ? "No free slots — grow population" : dup ? "Only one allowed" : d.description)}">
        <span class="t">${d.icon} ${esc(d.name)}</span><span class="c">${costHtml(d.cost, p.resources)} · ${d.days}d</span><span class="y">${yieldsHtml(y)}${d.defense ? ` +${d.defense}🛡` : ""}${d.capacity ? ` +${d.capacity} pop cap` : ""}</span></button>`;
    }
    html += `</div>`;
    if (c.buildings.some((b) => b.type === "shipyard")) {
      const used = commandUsed(s, p);
      const capC = commandCapacity(s, p);
      html += `<div class="section-title"><span>Shipyard</span><span>⚑ ${used}/${capC}</span></div><div class="grid-buttons">`;
      for (const h of HULLS) {
        if (!hullUnlocked(p, h.id)) continue;
        const cost = hullCost(s, p, h.id);
        const overCap = h.command > 0 && used + h.command > capC;
        const afford = canAfford(p.resources, cost);
        html += `<button class="build-btn" data-action="ship:${c.id}:${h.id}" ${afford && !overCap ? "" : "disabled"} title="${esc(overCap ? "Fleet command capacity reached" : h.description)}">
          <span class="t">${esc(h.name)}</span><span class="c">${costHtml(cost, p.resources)} · ${h.buildDays}d${h.command ? ` · ⚑${h.command}` : ""}</span></button>`;
      }
      html += `</div>`;
    } else {
      html += `<div class="hint">Build an Orbital Shipyard to construct ships here.</div>`;
    }
    return html;
  }

  private fleetDetails(id: string): string {
    const g = this.game;
    const s = g.state;
    const f = s.fleets[id];
    if (!f) return `<div class="hint">Fleet destroyed.</div>`;
    const owner = s.empires[f.empireId];
    const mine = f.empireId === s.playerId && !f.civilian;
    const loc = f.transit
      ? `In tunnel to ${esc(s.systems[f.transit.to].name)} (${Math.max(0, f.transit.total - f.transit.progress).toFixed(0)}d)`
      : `${esc(s.systems[f.systemId!].name)} system${f.orbitBodyId ? `, orbiting ${esc(s.bodies[f.orbitBodyId].name)}` : ""}`;
    const order =
      (f.order ? describeOrder(g, f, f.order) : "Holding position") +
      (f.queue?.length
        ? `<div class="order-queue">${f.queue
            .map((q, i) => `<div>then ${describeOrder(g, f, { ...q, route: [] })}${mine ? ` <button class="icon-btn" data-action="cancelorder:${f.id}:${i}:${q.kind}" title="Remove from queue">✕</button>` : ""}</div>`)
            .join("")}</div>`
        : "");
    const title =
      mine && this.renaming === f.id
        ? `<input id="rename-input" class="rename-input" data-fleet="${f.id}" maxlength="32" value="${esc(f.name)}" style="color:${owner.color}" />`
        : `${esc(f.name)}${mine ? ` <button class="icon-btn" data-action="rename:${f.id}" title="Rename">✎</button>` : ""}`;
    let html = `<h2 class="fleet-name" style="color:${owner.color}">${title}</h2><div class="subtitle">${esc(owner.name)} · ${f.ships.length} ship${f.ships.length > 1 ? "s" : ""}</div>
      <div class="kv"><div class="k">Location</div><div class="v">${loc}</div>
      <div class="k">Orders</div><div class="v">${order}</div>
      <div class="k">Speed</div><div class="v">${fleetSpeed(s, f).toFixed(2)} AU/d</div>
      ${supplyRow(s, f)}
      ${f.civilian ? `<div class="k">Passengers</div><div class="v">${fmt(f.migrants ?? 0, 1)} pop of settlers (private charter)</div>` : `<div class="k">Strength</div><div class="v">${fmt(fleetPower(s, f))}</div>`}
      ${f.battleId ? `<div class="k">Status</div><div class="v" style="color:var(--bad)">IN COMBAT</div>` : ""}</div>`;
    if (mine) {
      html += `<div class="actions">
        ${(["aggressive", "defensive", "evasive", "passive"] as const).map((st) => `<button data-action="stance:${f.id}:${st}" class="${f.stance === st ? "active" : ""}" title="${STANCE_TIPS[st]}">${st}</button>`).join("")}
      </div><div class="actions">
        <button data-action="stop:${f.id}" ${f.order && !f.transit ? "" : "disabled"}>■ Stop</button>
        <button data-action="split:${f.id}" ${f.ships.length > 1 ? "" : "disabled"} title="Split checked ships into a new fleet">⑂ Split</button>
        <button data-action="focus">◎ Focus</button>
      </div>`;
      const nearby = Object.values(s.fleets).filter((o) => o.id !== f.id && o.empireId === f.empireId && o.systemId && o.systemId === f.systemId && !o.transit && dist(o.pos, f.pos) < 1.5);
      if (nearby.length)
        html += `<div class="actions">${nearby.map((o) => `<button data-action="merge:${f.id}:${o.id}">⊕ Merge ${esc(o.name)}</button>`).join("")}</div>`;
    }
    html += `<div class="section-title">Ships</div>`;
    for (const sh of f.ships.slice(0, 60)) {
      const hull = HULL_MAP[sh.hull];
      const st = shipStats(owner, hull);
      const hp = healthFraction(owner, sh);
      html += `<div class="ship-row">${mine ? `<input type="checkbox" data-ship="${sh.id}" ${this.splitSel.has(sh.id) ? "checked" : ""}/>` : `<span></span>`}
        <span title="${esc(hull.description)}">${esc(hull.name)} <span class="meta">${esc(sh.name.split(" ").pop() ?? "")}${sh.xp ? ` ★${sh.xp}` : ""}</span></span>
        <span title="Hull ${fmt(sh.hull_hp)}/${fmt(st.hull)} · Armor ${fmt(sh.armor)}/${fmt(st.armor)} · Shields ${fmt(sh.shields)}/${fmt(st.shields)}"><div class="bar hp"><div style="width:${hp * 100}%"></div></div>${st.shields > 0 ? `<div class="bar shield"><div style="width:${(sh.shields / st.shields) * 100}%"></div></div>` : ""}</span></div>`;
    }
    if (f.ships.length > 60) html += `<div class="hint">…and ${f.ships.length - 60} more.</div>`;
    if (mine) {
      const roles = new Set(f.ships.map((sh) => HULL_MAP[sh.hull].role));
      const tips: string[] = [];
      if (roles.has("colony")) tips.push("Select a habitable planet and press <b>Colonize</b> (or right-click it).");
      if (roles.has("constructor")) tips.push("Select any planet, moon, belt or star to build stations.");
      if (roles.has("transport")) tips.push("Select an enemy colony with no defenses left and press <b>Invade</b>.");
      tips.push("Right-click a planet, gate, point or enemy to give orders. Right-click a star on the galaxy map to travel.");
      html += `<div class="hint">${tips.join("<br/>")}</div>`;
    }
    return html;
  }

  private gateDetails(tunnelId: string): string {
    const s = this.game.state;
    const t = s.tunnels[tunnelId];
    const here = this.app.systemId;
    const to = t.a === here ? t.b : t.a;
    const explored = !!s.empires[s.playerId].explored[to];
    return `<h2>Tunnel Gate</h2><div class="subtitle">${esc(s.systems[here].name)} ⟶ ${esc(s.systems[to].name)}${explored ? "" : " (unexplored)"}</div>
      <p class="desc">An ancient gate anchoring a stable tunnel through subspace. Fleets entering it emerge ${t.length.toFixed(1)} light years away.</p>
      <div class="kv"><div class="k">Distance</div><div class="v">${t.length.toFixed(1)} ly</div><div class="k">Transit time</div><div class="v">${t.travelDays.toFixed(0)} days</div></div>
      <div class="actions"><button data-action="jumpgate:${tunnelId}" ${explored ? "" : `disabled title="Survey it first: send any ship through the gate"`}>⟶ Look through the gate</button>
      ${this.app.activeFleetId ? `<button class="primary" data-action="send:${to}">Send ${esc(s.fleets[this.app.activeFleetId]?.name ?? "fleet")}</button>` : ""}</div>`;
  }

  private systemDetails(id: string): string {
    const g = this.game;
    const s = g.state;
    const p = g.player;
    const sys = s.systems[id];
    const explored = !!p.explored[id];
    const owner = systemOwner(s, id);
    const star = s.bodies[sys.starIds[0]];
    const st = STAR_TYPE_MAP[star.type];
    const holders = explored ? systemHolders(s, id) : [];
    let html = `<h2>${esc(sys.name)}</h2><div class="subtitle">${explored ? `${esc(st.name)}${sys.starIds.length > 1 ? " binary" : ""}` : "Unexplored"}${owner && explored ? ` · <span style="color:${s.empires[owner].color}">${esc(s.empires[owner].name)}</span>` : ""}${holders.length > 1 ? ` · <span class="tag war">contested</span>` : ""}</div>`;
    if (holders.length)
      html += `<div class="section-title">Colonies</div>${holders
        .map((h) => `<div class="holder"><span style="color:${s.empires[h.empireId].color}">${esc(s.empires[h.empireId].name)}</span> · ${h.colonies.map((c) => `<a data-action="goto:body:${c.bodyId}">${esc(c.name)}</a> (${fmt(c.pop, 1)})`).join(", ")}</div>`)
        .join("")}${holders.length > 1 ? `<div class="hint">The empire with the most colonists holds the system; take every colony to claim it.</div>` : ""}`;
    if (explored) {
      const bodies = sys.bodyIds.map((b) => s.bodies[b]);
      const planets = bodies.filter((b) => b.kind === "planet");
      const moons = bodies.filter((b) => b.kind === "moon");
      const belts = bodies.filter((b) => b.kind === "belt");
      const habitable = bodies.filter((b) => canColonize(p, b));
      html += `<p class="desc">${esc(st.description)}</p><div class="kv">
        <div class="k">Planets</div><div class="v">${planets.length}</div>
        <div class="k">Moons</div><div class="v">${moons.length}</div>
        <div class="k">Asteroid belts</div><div class="v">${belts.length}</div>
        <div class="k">Habitable for us</div><div class="v">${habitable.length}</div>
        <div class="k">Tunnels</div><div class="v">${sys.gates.length}</div></div>`;
      if (habitable.length)
        html += `<div class="chips">${habitable.map((b) => `<span class="chip good">${esc(b.name)} ${pct(habitability(p, b))}</span>`).join("")}</div>`;
    } else html += `<p class="desc">Send a scout or any fleet through a tunnel to survey it.</p>`;
    const route = this.app.activeFleetId ? (() => {
      const f = s.fleets[this.app.activeFleetId!];
      if (!f) return null;
      const from = f.transit ? f.transit.to : f.systemId!;
      return findRoute(s, from, id, p);
    })() : null;
    html += `<div class="actions"><button class="primary" data-action="enter:${id}" ${p.explored[id] ? "" : `disabled title="Survey the system first: send any ship there"`}>☉ Enter system</button>
      ${this.app.activeFleetId && s.fleets[this.app.activeFleetId] ? `<button data-action="send:${id}">Send ${esc(s.fleets[this.app.activeFleetId].name)}${route ? ` (${route.length} jumps)` : ""}</button>` : ""}</div>
      <div class="hint">Double-click a star to enter it. Right-click to send the active fleet.</div>`;
    return html;
  }

  // ------------------------------------------------------------ modals
  private renderModal(): void {
    const g = this.game;
    if (g.state.winner && !this.endShown) {
      this.endShown = true;
      this.modal = "end";
      this.app.setSpeed(0);
    }
    if (!this.modal) {
      this.set("modal", "", this.modalRoot);
      return;
    }
    let inner = "";
    if (this.modal === "research") inner = this.researchModal();
    else if (this.modal === "empires") inner = this.empiresModal();
    else if (this.modal === "menu") inner = this.menuModal();
    else if (this.modal === "help") inner = `<header><h2>How to play</h2><button data-action="close">✕</button></header>${helpHtml()}`;
    else if (this.modal === "end") inner = this.endModal();
    else if (this.modal === "colonize") inner = this.colonizeModal();
    else if (this.modal === "chat") inner = this.chatModal();
    this.set("modal", `<div class="modal-backdrop" data-action="backdrop"><div class="panel modal" data-stop="1">${inner}</div></div>`, this.modalRoot);
  }

  private researchModal(): string {
    const g = this.game;
    const p = g.player;
    const branches = Object.keys(BRANCH_INFO) as Branch[];
    const cur = p.research.current;
    const cols = branches
      .map((br) => {
        const techs = TECHS.filter((t) => t.branch === br).sort((a, b) => a.tier - b.tier);
        return `<div class="tech-col"><h3 style="color:${BRANCH_INFO[br].color}">${BRANCH_INFO[br].name}</h3>${techs
          .map((t) => {
            const done = p.research.completed.includes(t.id);
            const avail = t.requires.every((r) => p.research.completed.includes(r));
            const cost = techCost(g.state, p, t);
            const prog = (p.research.progress[t.id] ?? 0) / cost;
            const cls = done ? "done" : t.id === cur ? "current" : p.research.queue.includes(t.id) ? "queued" : !avail ? "locked" : "";
            const eta = !done && g.player.income.research > 0 ? Math.ceil((cost * (1 - prog)) / g.player.income.research) : null;
            return `<div class="tech ${cls}" data-action="tech:${t.id}" title="${esc(t.requires.length ? "Requires: " + t.requires.map((r) => TECH_MAP[r].name).join(", ") : "No prerequisites")}">
              <div class="tn">${esc(t.name)}</div><div class="tc">Tier ${t.tier} · ${fmt(cost)} ⚗${t.exoticsCost ? ` + ${t.exoticsCost} ✦` : ""}${eta && !done ? ` · ~${eta}d` : ""}</div>
              <div class="td">${esc(t.description)}</div>${prog > 0 && !done ? `<div class="prog" style="width:${prog * 100}%"></div>` : ""}</div>`;
          })
          .join("")}</div>`;
      })
      .join("");
    const curT = cur ? TECH_MAP[cur] : null;
    return `<header><h2>Research</h2><span class="res research"><span class="icon">⚗</span>${fmt(p.income.research, 1)}/day</span>
      <span class="subtitle">${curT ? `Researching <b>${esc(curT.name)}</b>${p.research.queue.length ? ` then ${p.research.queue.map((q) => esc(TECH_MAP[q].name)).join(" → ")}` : ""}` : "Idle"}</span>
      <button data-action="close">✕</button></header>
      <div class="tech-grid">${cols}</div>`;
  }

  private empiresModal(): string {
    const g = this.game;
    const s = g.state;
    const p = g.player;
    const owners = systemOwnerMap(s);
    const total = Object.keys(s.systems).length;
    const rows = Object.values(s.empires)
      .filter((e) => e.alive)
      .map((e) => {
        const cols = Object.values(s.colonies).filter((c) => c.empireId === e.id);
        const pop = cols.reduce((a, c) => a + c.pop, 0);
        const systems = Object.values(owners).filter((o) => o === e.id).length;
        const met = hasMet(s, p.id, e.id);
        if (!met)
          return `<div class="empire-card"><div class="swatch" style="background:#3a4150"></div>
            <div><div style="font-weight:600;font-size:15px;color:var(--muted)">Unknown civilization</div>
            <div class="stats">Not yet contacted — meet them by sharing a system or surveying their territory.</div></div><div></div></div>`;
        const rel = e.id === p.id ? "" : `<span class="tag ${p.relations[e.id]}">${p.relations[e.id] === "war" ? "AT WAR" : "PEACE"}</span>`;
        const offer = e.id !== p.id && p.peaceOffers?.[e.id] !== undefined;
        const demand = e.id !== p.id ? p.demands?.[e.id] : undefined;
        const demandHtml = demand
          ? `<div class="demand">⚠ Demands ${esc(demand.kind === "colony" ? (s.colonies[demand.colonyId]?.name ?? "a colony") : `${demand.amount} ${demand.resource}`)}
              <button class="primary" data-action="acceptdemand:${e.id}">Give</button> <button class="danger" data-action="rejectdemand:${e.id}">Refuse</button></div>`
          : "";
        const unread = this.unreadFrom(e.id);
        const trading = p.tradePartners?.[e.id] !== undefined;
        const tradeOffer = e.id !== p.id && p.tradeOffers?.[e.id] !== undefined;
        const tradeBtn =
          e.id === p.id || e.isPirate || !met || p.relations[e.id] === "war"
            ? ""
            : trading
              ? `<button data-action="endtrade:${e.id}" title="Merchants fly between your trade hubs. End the agreement?">⇄ End trade</button>`
              : tradeOffer
                ? `<button class="primary" data-action="accepttrade:${e.id}">⇄ Accept trade</button> <button data-action="rejecttrade:${e.id}">Decline</button>`
                : `<button data-action="proposetrade:${e.id}" title="Open markets: merchant freighters will fly between your trade hubs, enriching both">⇄ Propose trade</button>`;
        const talk = e.id !== p.id && this.app.canChat(e.id) ? `<button data-action="chat:${e.id}">✉ Talk${unread ? `<span class="unread">${unread}</span>` : ""}</button>` : "";
        const btn =
          e.id === p.id || e.isPirate || !met
            ? ""
            : offer
              ? `<button class="primary" data-action="acceptpeace:${e.id}">☮ Accept peace</button> <button data-action="rejectpeace:${e.id}">Reject</button>`
              : p.relations[e.id] === "war"
                ? `<button data-action="peace:${e.id}">☮ Propose peace</button>`
                : `<button class="danger" data-action="war:${e.id}">⚔ Declare war</button>`;
        const seat = this.app.remote?.info.seats.find((x) => x.empireId === e.id);
        const ruler = seat?.playerName ? `<span class="tag" title="A human player">${seat.online ? "●" : "○"} ${esc(seat.playerName)}</span>` : "";
        return `<div class="empire-card"><div class="swatch" style="background:${e.color}"></div>
          <div><div style="font-weight:600;font-size:15px;color:${e.color}">${esc(e.name)} ${e.id === p.id ? "(you)" : ""} ${rel} ${ruler} ${offer ? `<span class="tag peace">offers peace</span>` : ""} ${trading ? `<span class="tag trade" title="Merchant income from this partnership">trade partner · +${(p.tradeWith?.[e.id] ?? 0).toFixed(1)}/d</span>` : tradeOffer ? `<span class="tag trade">offers trade</span>` : ""}</div>
          <div class="stats">${e.isPirate ? "Lawless raiders · always hostile" : `${esc(SPECIES_MAP[e.speciesId]?.adjective ?? "")} · ${met ? `${cols.length} colonies · ${fmt(pop, 1)} pop · ${systems}/${total} systems (${pct(systems / total)}) · strength ${fmt(empirePower(s, e.id))} · ${e.research.completed.length} techs${e.research.current === "ascension" ? " · <b style='color:var(--warn)'>pursuing Ascension!</b>" : ""}` : "not yet contacted"}`}</div></div>
          <div class="actions">${talk} ${tradeBtn} ${btn}${demandHtml}</div></div>`;
      })
      .join("");
    return `<header><h2>Empires of the galaxy</h2><button data-action="close">✕</button></header>${rows}
      <div class="hint">Victory: eliminate all rivals, control ${Math.round(0.6 * 100)}% of systems, or complete the Ascension Project.</div>`;
  }

  private menuModal(): string {
    const remote = this.app.remote;
    if (remote) {
      const info = remote.info;
      return `<header><h2>${esc(info.name)}</h2><button data-action="close">✕</button></header>
        <div class="actions" style="flex-direction:column;align-items:stretch;max-width:360px;margin:auto">
          <div class="hint" style="text-align:center">Invite code <b style="font-size:20px;letter-spacing:0.15em;color:var(--accent)">${esc(info.code)}</b><br/>The game is saved on the server automatically.</div>
          <button class="primary" data-action="close">Resume</button>
          <button data-action="copyinvite">Copy invite link</button>
          <button data-action="modal:help">How to play</button>
          <button class="danger" data-action="quit">Leave game</button>
        </div>`;
    }
    return `<header><h2>Menu</h2><button data-action="close">✕</button></header>
      <div class="actions" style="flex-direction:column;align-items:stretch;max-width:320px;margin:auto">
        <button class="primary" data-action="close">Resume</button>
        <button data-action="save">Save game</button>
        <button data-action="load">Load last save</button>
        ${this.app.online ? `<button data-action="cloudsave">Save to cloud</button>` : ""}
        <button data-action="modal:help">How to play</button>
        <button class="danger" data-action="quit">Quit to title</button>
      </div>`;
  }

  private chatModal(): string {
    const g = this.game;
    const other = this.chatWith ? g.state.empires[this.chatWith] : null;
    if (!other) return `<header><h2>Diplomacy</h2><button data-action="close">✕</button></header>`;
    const me = g.playerId;
    const msgs = this.app.chats.filter((m) => (m.from === me && m.to === other.id) || (m.from === other.id && m.to === me));
    for (const m of msgs) this.seenChats.add(m.id);
    const human = !!this.app.remote?.info.seats.find((x) => x.empireId === other.id)?.playerName;
    const waiting = msgs.length > 0 && msgs[msgs.length - 1].from === me && !human;
    const demand = g.player.demands?.[other.id];
    const r = g.player.resources;
    const gifts = (["credits", "metals"] as const)
      .map((k) => `<button data-action="gift:${other.id}:${k}:100" ${r[k] >= 100 ? "" : "disabled"} title="Send 100 ${k} as a gift or tribute">🎁 100 ${RES_ICON[k]}</button>`)
      .join("");
    return `<header><h2 style="color:${other.color}">${esc(other.name)}</h2>
      <span class="tag ${g.player.relations[other.id]}">${g.player.relations[other.id] === "war" ? "AT WAR" : "PEACE"}</span>
      <span class="subtitle">${human ? "A human ruler" : "Their ruler answers in character"}</span>
      <button data-action="modal:empires">← Empires</button><button data-action="close">✕</button></header>
      <div class="chat-log">${
        msgs.length
          ? msgs
              .map(
                (m) => `<div class="chat-msg ${m.from === me ? "ours" : ""}${m.auto ? " auto" : ""}"><div class="meta">${m.from === me ? "You" : esc(other.name)} · ${dateString(m.day)}${m.action && m.action.kind !== "none" ? ` · <b>${esc(describeAction(g, m.action))}</b>` : ""}</div>${esc(m.text)}</div>`,
              )
              .join("")
          : `<div class="hint">No correspondence yet. Open a channel — propose an alliance, demand tribute, or negotiate a ceasefire.</div>`
      }${waiting ? `<div class="hint">Awaiting their reply…</div>` : ""}</div>
      ${demand ? `<div class="demand">⚠ They demand ${esc(demand.kind === "colony" ? (g.state.colonies[demand.colonyId]?.name ?? "a colony") : `${demand.amount} ${demand.resource}`)} <button class="primary" data-action="acceptdemand:${other.id}">Give</button> <button class="danger" data-action="rejectdemand:${other.id}">Refuse</button></div>` : ""}
      <div class="chat-tools">${gifts}${g.player.relations[other.id] === "peace" && g.player.tradePartners?.[other.id] === undefined ? `<button data-action="proposetrade:${other.id}">⇄ Propose trade</button>` : ""}${g.player.peaceOffers?.[other.id] !== undefined ? `<button class="primary" data-action="acceptpeace:${other.id}">☮ Accept their peace offer</button>` : ""}${this.app.remote ? "" : `<span class="hint">The game is paused while you write.</span>`}</div>
      <div class="chat-input"><input id="chat-input" maxlength="500" placeholder="Message to the ${esc(other.name)}…" autocomplete="off" /><button class="primary" data-action="sendchat">Send</button></div>`;
  }

  private colonizeModal(): string {
    const g = this.game;
    const s = g.state;
    const body = this.colonizeTarget ? s.bodies[this.colonizeTarget] : null;
    if (!body) return `<header><h2>Colonize</h2><button data-action="close">✕</button></header>`;
    const options = colonyShipOptions(s, g.playerId, body.id);
    const h = habitability(g.player, body);
    const rows = options
      .map((o, i) => {
        const best = i === 0 && o.affordable;
        return `<div class="empire-card" style="grid-template-columns:1fr auto">
          <div><div style="font-weight:600;font-size:15px">${esc(o.colonyName)} ${best ? `<span class="tag peace">recommended</span>` : ""}</div>
          <div class="stats">Arrives in ~${Math.round(o.etaDays)} days · queue ${Math.round(o.queueDays)}d + build ${Math.round(o.buildDays)}d + travel ${Math.round(o.travelDays)}d (${o.jumps} jump${o.jumps === 1 ? "" : "s"}) · ${costHtml(o.cost, g.player.resources)}</div></div>
          <div><button class="${best ? "primary" : ""}" data-action="buildcolony:${o.colonyId}" ${o.affordable ? "" : "disabled"} title="${o.affordable ? "Queue a colony ship here" : "Not enough resources"}">Build &amp; send</button></div></div>`;
      })
      .join("");
    return `<header><h2>Colonize ${esc(body.name)}</h2><button data-action="close">✕</button></header>
      <p class="desc">No colony ship is available. Build one at a shipyard and it will fly to <b>${esc(body.name)}</b>
      (${esc(PLANET_TYPE_MAP[body.type]?.name ?? body.type)}, habitability ${pct(h)}, size ${body.size}) and settle it as soon as it launches.
      A new colony needs supplies shipped in at first (${yieldsHtml(SETTLEMENT_UPKEEP, -1)} per day, fading over ${SETTLEMENT_DAYS} days) before it stands on its own.</p>
      ${rows || `<div class="hint">None of your colonies has an Orbital Shipyard with a known route there. Build a shipyard first.</div>`}`;
  }

  private endModal(): string {
    const s = this.game.state;
    const won = s.winner === s.playerId;
    const winner = s.empires[s.winner ?? ""];
    const how: Record<string, string> = {
      conquest: "by total conquest",
      domination: "through galactic hegemony",
      ascension: "by ascending beyond physical form",
      defeat: "— your empire has fallen",
    };
    const p = this.game.player;
    return `<div class="endscreen"><h1 style="color:${won ? "var(--good)" : "var(--bad)"}">${won ? "VICTORY" : "DEFEAT"}</h1>
      <p style="font-size:16px">${won ? "You have triumphed" : `${esc(winner?.name ?? "Another power")} prevails`} ${how[s.victoryType ?? ""] ?? ""}.</p>
      <div class="kv" style="max-width:320px;margin:16px auto"><div class="k">Date</div><div class="v">${dateString(s.day)}</div>
      <div class="k">Ships built</div><div class="v">${p.stats.shipsBuilt}</div><div class="k">Ships lost</div><div class="v">${p.stats.shipsLost}</div>
      <div class="k">Enemies destroyed</div><div class="v">${p.stats.kills}</div><div class="k">Colonies founded</div><div class="v">${p.stats.coloniesFounded}</div>
      <div class="k">Technologies</div><div class="v">${p.research.completed.length}</div></div>
      <div class="actions" style="justify-content:center"><button data-action="close">Keep playing</button><button class="primary" data-action="quit">New game</button></div></div>`;
  }

  // ------------------------------------------------------------ input
  private onClick(e: MouseEvent): void {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!target) return;
    if (target.dataset.action === "backdrop" && (e.target as HTMLElement).closest("[data-stop]")) return;
    const [action, ...args] = target.dataset.action!.split(":");
    const g = this.game;
    const app = this.app;
    this.shiftHeld = e.shiftKey;
    const res = (r: { ok: boolean; error?: string }, okMsg?: string) => {
      if (!r.ok) app.toast(r.error ?? "Cannot do that", "error");
      else if (okMsg) app.toast(okMsg, "good");
      this.invalidate();
      return r.ok;
    };
    /** Carry out a diplomatic act and, if it worked, tell them about it. */
    const act = (r: { ok: boolean; error?: string }, okMsg: string, to: string, text: string, action?: DiploAction) => {
      if (res(r, okMsg)) app.announce(to, text, action);
    };
    switch (action) {
      case "speed":
        app.setSpeed(Number(args[0]));
        break;
      case "view":
        if (args[0] === "galaxy") app.showGalaxy();
        else if (args[0] === "home") app.goHome();
        else app.enterSystem(app.systemId);
        break;
      case "modal":
        this.modal = args[0] as Modal;
        break;
      case "close":
      case "backdrop":
        this.modal = null;
        break;
      case "goto": {
        const [kind, id] = args;
        if (kind === "system") app.enterSystem(id);
        else if (kind === "body") {
          const b = g.state.bodies[id];
          app.enterSystem(b.systemId, { kind: "body", id });
        } else if (kind === "fleet") {
          const f = g.state.fleets[id];
          if (!f) break;
          if (f.transit) {
            app.showGalaxy();
            app.select({ kind: "fleet", id }, false);
          } else app.enterSystem(f.systemId!, { kind: "fleet", id });
        }
        break;
      }
      case "tab":
        this.outlinerTab = args[0] as "system" | "empire";
        break;
      case "badge":
        this.cycleBadge(args[0] as OpportunityKind);
        break;
      case "sel": {
        const [kind, id, sysId] = args;
        if (kind === "gate") app.enterSystem(sysId, { kind: "gate", id });
        break;
      }
      case "build":
        res(g.queueBuilding(args[0], args[1]));
        break;
      case "ship":
        res(g.queueShip(args[0], args[1]));
        break;
      case "cancel":
        res(g.cancelQueueItem(args[0], Number(args[1]), args[2]));
        break;
      case "log": {
        const entry = this.logEntries[Number(args[0])];
        if (entry) app.locateLog(entry);
        return;
      }
      case "cancelorder":
        res(g.cancelFleetOrder(args[0], Number(args[1]), args[2]));
        break;
      case "demolish":
        if (e.shiftKey) res(g.demolishBuilding(args[0], Number(args[1])), "Building demolished");
        break;
      case "colonize": {
        const b = g.state.bodies[args[0]];
        const pick = this.fleetFor("colony", b.systemId);
        if (pick) this.dispatch(pick, (q) => g.colonize(pick.fleet.id, b.id, q), `colonize ${b.name}`);
        else {
          // No colony ship available: offer to build one at the best shipyard.
          this.colonizeTarget = b.id;
          this.modal = "colonize";
        }
        break;
      }
      case "buildcolony": {
        const target = this.colonizeTarget;
        if (!target) break;
        const r = g.buildColonyShipFor(target, args[0]);
        res(r, `Colony ship queued — it will settle ${g.state.bodies[target].name} on launch`);
        if (r.ok) {
          this.modal = null;
          this.colonizeTarget = null;
        }
        break;
      }
      case "invade": {
        const c = g.state.colonies[args[0]];
        const pick = this.fleetFor("transport", c.systemId);
        if (pick) this.dispatch(pick, (q) => g.invade(pick.fleet.id, c.id, q), `invade ${c.name} when defenses fall`);
        break;
      }
      case "station": {
        const b = g.state.bodies[args[0]];
        const pick = this.fleetFor("constructor", b.systemId);
        if (pick) this.dispatch(pick, (q) => g.buildStation(pick.fleet.id, b.id, args[1], q), `build ${STATION_MAP[args[1]]?.name ?? "station"} at ${b.name}`);
        break;
      }
      case "stance":
        res(g.setStance(args[0], args[1] as Stance));
        break;
      case "stop":
        res(g.stopFleet(args[0]));
        break;
      case "rename":
        // Edit the name in place (Enter saves, Esc cancels, clicking away saves).
        this.renaming = args[0];
        this.render();
        {
          const input = this.regions.details.querySelector<HTMLInputElement>("#rename-input");
          input?.focus();
          input?.select();
        }
        return;
      case "split": {
        const r = g.splitFleet(args[0], [...this.splitSel]);
        res(r, r.ok ? "Fleet split" : undefined);
        if (r.ok && "fleetId" in r && r.fleetId) app.select({ kind: "fleet", id: r.fleetId });
        this.splitSel.clear();
        break;
      }
      case "merge":
        res(g.mergeFleets(args[0], args[1]), "Fleets merged");
        break;
      case "focus":
        app.focusSelection();
        break;
      case "enter":
        app.enterSystem(args[0]);
        break;
      case "jumpgate":
        app.jumpThroughGate(args[0]);
        break;
      case "send": {
        const fid = app.activeFleetId;
        if (!fid) break;
        const sys = g.state.systems[args[0]];
        res(g.moveFleet(fid, sys.id, { bodyId: sys.starIds[0] }), "Course plotted");
        break;
      }
      case "tech":
        res(g.setResearch(args[0]));
        break;
      case "war":
        if (window.confirm(`Declare war on ${g.state.empires[args[0]].name}?`))
          act(g.declareWar(args[0]), "", args[0], "We declare war on you.", { kind: "declare_war" });
        break;
      case "peace":
        act(g.proposePeace(args[0]), app.remote ? "Peace proposal sent" : "Peace treaty signed", args[0], "We propose an end to this war. Let there be peace between us.", {
          kind: "propose_peace",
        });
        break;
      case "acceptpeace":
        act(g.acceptPeace(args[0]), "Peace treaty signed", args[0], "We accept your offer of peace.", { kind: "accept_peace" });
        break;
      case "rejectpeace":
        act(g.rejectPeace(args[0]), "Peace offer rejected", args[0], "We reject your offer of peace. The war goes on.");
        break;
      case "proposetrade": {
        const instant = !(app.remote && !g.state.empires[args[0]]?.ai);
        act(
          g.proposeTrade(args[0]),
          instant ? "Trade agreement signed — merchants will start flying" : "Trade proposal sent",
          args[0],
          "We propose a trade agreement: let our merchants fly between our worlds.",
          { kind: "propose_trade" },
        );
        break;
      }
      case "accepttrade":
        act(g.acceptTrade(args[0]), "Trade agreement signed", args[0], "We accept your trade agreement. Our merchants are on their way.", { kind: "accept_trade" });
        break;
      case "rejecttrade":
        act(g.rejectTrade(args[0]), "Trade offer declined", args[0], "We decline your trade proposal.");
        break;
      case "endtrade":
        if (window.confirm(`End the trade agreement with the ${g.state.empires[args[0]].name}?`))
          act(g.cancelTrade(args[0]), "Trade agreement ended", args[0], "We are ending our trade agreement.", { kind: "cancel_trade" });
        break;
      case "acceptdemand": {
        const d = g.state.empires[g.playerId]?.demands?.[args[0]];
        if (!d || !window.confirm("Give them what they demand?")) break;
        const colony = d.kind === "colony" ? g.state.colonies[d.colonyId] : null;
        if (colony) act(g.acceptDemand(args[0]), "Demand met", args[0], `We accept your demand and cede ${colony.name} to you.`, { kind: "cede_colony", colonyId: colony.id });
        else if (d.kind !== "colony")
          act(g.acceptDemand(args[0]), "Demand met", args[0], `We accept your demand and send you ${d.amount} ${d.resource}.`, {
            kind: "offer_tribute",
            resource: d.resource,
            amount: d.amount,
          });
        else res(g.acceptDemand(args[0]), "Demand met");
        break;
      }
      case "rejectdemand": {
        const d = g.state.empires[g.playerId]?.demands?.[args[0]];
        const what = !d ? "demand" : d.kind === "colony" ? `demand for ${g.state.colonies[d.colonyId]?.name ?? "our colony"}` : `demand for ${d.amount} ${d.resource}`;
        act(g.rejectDemand(args[0]), "Demand refused", args[0], `We refuse your ${what}.`);
        break;
      }
      case "gift": {
        const amount = Number(args[2]);
        const resource = args[1] as ResourceKey;
        const atWar = g.state.empires[g.playerId]?.relations[args[0]] === "war";
        act(g.sendTribute(args[0], resource, amount), `Sent ${amount} ${resource}`, args[0], `We send you ${amount} ${resource} as ${atWar ? "tribute" : "a gift"}.`, {
          kind: "offer_tribute",
          resource,
          amount,
        });
        break;
      }
      case "chat":
        this.chatWith = args[0];
        this.modal = "chat";
        this.render();
        this.modalRoot.querySelector<HTMLInputElement>("#chat-input")?.focus();
        return;
      case "sendchat":
        this.submitChat();
        return;
      case "cloudsave":
        app.cloudSave();
        this.modal = null;
        break;
      case "copyinvite":
        if (app.remote) {
          const link = inviteLink(app.remote.info.code);
          void navigator.clipboard?.writeText(link).then(
            () => app.toast("Invite link copied", "good"),
            () => app.toast(link, "info"),
          );
        }
        break;
      case "save":
        app.save();
        this.modal = null;
        break;
      case "load":
        app.load();
        this.modal = null;
        break;
      case "quit":
        this.modal = null;
        app.quitToTitle();
        break;
    }
    this.render();
  }

  toggleModal(m: Modal): void {
    this.modal = this.modal === m ? null : m;
    this.render();
  }

  reset(): void {
    this.modal = null;
    this.dismissed = {};
    this.badgeIndex = {};
    this.endShown = false;
    this.invalidate();
    this.logCount = 0;
  }
}

const STANCE_TIPS: Record<Stance, string> = {
  aggressive: "Engage and pursue enemies",
  defensive: "Engage enemies that come close; never pursue (default for warships)",
  evasive: "Never fight: fall back to a safe colony when hostile warships appear, then resume orders (default for civilian ships)",
  passive: "Hold course and hold fire, whatever happens",
};

/** Munitions and spares of an armed fleet, plus any tender on its way. */
function supplyRow(s: Game["state"], f: Fleet): string {
  if (f.civilian || !f.ships.some((sh) => HULL_MAP[sh.hull].weapons.length)) return "";
  const lv = supplyLevel(f.ships);
  const bar = (v: number, icon: string, title: string) =>
    `<span class="supply ${v < 0.25 ? "low" : v < 0.6 ? "mid" : ""}" title="${title}">${icon} ${pct(v)}</span>`;
  const tender = Object.values(s.fleets).find((t) => t.order?.kind === "resupply" && t.order.fleetId === f.id);
  return `<div class="k">Supplies</div><div class="v">${bar(lv.metals, "⚙", "Munitions and spare parts (metals): railguns, missiles, point defence, repairs")} ${bar(lv.energy, "⚡", "Energy cells: lasers and lances")}${
    tender ? ` · tender en route` : lv.overall < 0.25 ? ` · <b style="color:var(--bad)">low!</b>` : ""
  }</div>`;
}

function describeAction(g: Game, a: DiploAction): string {
  const s = g.state;
  switch (a.kind) {
    case "accept_peace":
      return "☮ accepted peace";
    case "propose_peace":
      return "☮ proposed peace";
    case "declare_war":
      return "⚔ declared war";
    case "offer_tribute":
      return `🎁 sent ${a.amount ?? ""} ${a.resource ?? ""}`;
    case "cede_colony":
      return `🜨 ceded ${s.colonies[a.colonyId ?? ""]?.name ?? "a colony"}`;
    case "demand_tribute":
      return `⚠ demands ${a.amount ?? ""} ${a.resource ?? ""}`;
    case "demand_colony":
      return `⚠ demands ${s.colonies[a.colonyId ?? ""]?.name ?? "a colony"}`;
    case "propose_trade":
      return "⇄ proposed trade";
    case "accept_trade":
      return "⇄ signed a trade agreement";
    case "cancel_trade":
      return "⇄ ended trade";
    default:
      return "";
  }
}

function describeOrder(g: Game, f: Fleet, o: Order): string {
  const s = g.state;
  void f;
  const where = o.bodyId ? s.bodies[o.bodyId]?.name : s.systems[o.systemId]?.name;
  const hops = o.route.length ? ` (${o.route.length} jump${o.route.length > 1 ? "s" : ""})` : "";
  switch (o.kind) {
    case "move":
      return `Moving to ${esc(where ?? "")}${hops}`;
    case "colonize":
      return (o.work ?? 0) > 0 ? `Establishing colony (${Math.min(100, Math.round(((o.work ?? 0) / 4) * 100))}%)` : `Colonizing ${esc(where ?? "")}${hops}`;
    case "buildStation": {
      const def = STATION_MAP[o.stationType!];
      return (o.work ?? 0) > 0 ? `Building ${esc(def.name)} (${Math.min(100, Math.round(((o.work ?? 0) / def.days) * 100))}%)` : `Building ${esc(def.name)} at ${esc(where ?? "")}${hops}`;
    }
    case "invade":
      return `Invading ${esc(where ?? "")}${hops}`;
    case "attack":
      return `Attacking ${esc(s.fleets[o.fleetId ?? ""]?.name ?? "target")}`;
    case "migrate":
      return (o.work ?? 0) > 0 ? `Shuttling settlers down to ${esc(where ?? "")}` : `Carrying settlers to ${esc(where ?? "")}${hops}`;
    case "resupply": {
      const t = s.fleets[o.fleetId ?? ""];
      const c = f.supplies;
      return `Resupplying ${esc(t?.name ?? "a fleet")}${hops}${c ? ` · ⚙${fmt(c.metals)} ⚡${fmt(c.energy)}` : ""}`;
    }
    case "trade":
      return (o.work ?? 0) > 0 ? `Unloading goods at ${esc(where ?? "")}` : `Trade run to ${esc(where ?? "")}${hops} · cargo ₵${fmt(f.cargo ?? 0)}`;
  }
}

function estimateStation(g: Game, type: string, b: Body): string {
  const s = g.state;
  const fake = { id: "_", empireId: s.playerId, type, bodyId: b.id, systemId: b.systemId, level: 1, hp: 1, founded: 0 };
  const y = stationProduction(s, fake);
  const def = STATION_MAP[type];
  const txt = yieldsHtml(y);
  const up = Object.entries(def.upkeep).map(([k, v]) => `<span style="color:var(--bad)">-${v}${RES_ICON[k]}</span>`).join(" ");
  return `${txt}${up ? " " + up : ""}${def.weapons ? " armed" : ""}`;
}
