// Title screen & new-game setup.

import { icon } from "./icons";
import { SPECIES } from "../sim/data/structures";
import { EMPIRE_COLORS } from "../sim/galaxy";
import type { GameSettings } from "../sim/types";
import type { CloudSaveSummary, SessionInfo, SessionSummary } from "../net/protocol";
import { dateString, esc } from "./format";
import { morphHtml } from "./morph";
import { ShipPreview } from "./ShipPreview";
import { helpHtml } from "./help";

export interface LobbyCallbacks {
  onNewGame(settings: Partial<GameSettings>): void;
  onContinue(): void;
  hasSave(): boolean;
  /** What "Continue" would resume, if known. */
  saveInfo(): { empire: string; day: number } | null;
  online(): { connected: boolean; name: string; llm: boolean; transferLink: string | null };
  /** Opened with another player's transfer link: ask before switching to them. */
  pendingTransfer(): boolean;
  onTransfer(accept: boolean): void;
  setName(name: string): void;
  onHost(settings: Partial<GameSettings>): void;
  onJoin(code: string): void;
  sessions(): SessionSummary[];
  cloudSaves(): CloudSaveSummary[];
  onCloudLoad(id: string): void;
  onCloudDelete(id: string): void;
  takeSeat(empireId: string): void;
  startSession(): void;
  leaveSession(): void;
}

/** Galaxy sizes; each brings a matching number of rivals (overridable in Advanced settings). */
export const GALAXY_SIZES = [
  { id: "small", label: "Small", stars: 16, rivals: 2 },
  { id: "medium", label: "Medium", stars: 24, rivals: 3 },
  { id: "large", label: "Large", stars: 32, rivals: 5 },
] as const;

interface Setup {
  species: string;
  color: string;
  size: string;
  rivals: number | null; // null: automatic for the size
  difficulty: GameSettings["difficulty"];
  pirates: boolean;
}

const SETUP_KEY = "constellation-v3-setup";

function loadSetup(): Partial<Setup> {
  try {
    return JSON.parse(localStorage.getItem(SETUP_KEY) ?? "{}") as Partial<Setup>;
  } catch {
    return {};
  }
}

export function inviteLink(code: string): string {
  return `${location.origin}${location.pathname}?join=${encodeURIComponent(code)}`;
}

export class Lobby {
  private setup: Setup = {
    species: SPECIES[0].id,
    color: EMPIRE_COLORS[0],
    size: "medium",
    rivals: null,
    difficulty: "normal",
    pirates: true,
    ...loadSetup(),
  };
  private showHelp = false;
  private showAdvanced = false;
  /** "Play on another device" is open (kept across refreshes of the online panel). */
  private showTransfer = false;
  private seed = Math.random().toString(36).slice(2, 8);
  private room: SessionInfo | null = null;
  /** The species' ships on a turntable; kept across re-renders (one WebGL context). */
  private previewHost: HTMLElement | null = null;
  private preview: ShipPreview | null = null;

  constructor(
    private root: HTMLElement,
    private cb: LobbyCallbacks,
  ) {}

  show(): void {
    this.room = null;
    this.root.classList.remove("hidden");
    this.render();
  }

  /** The waiting room of an online game (also used to take over a seat mid-game). */
  showRoom(info: SessionInfo): void {
    this.room = info;
    this.root.classList.remove("hidden");
    this.render();
  }

  /** Re-render only the online panel (keeps whatever the player typed in the form). */
  refreshOnline(): void {
    if (this.room) return;
    const el = this.root.querySelector("#lb-online");
    if (el) morphHtml(el, this.onlineHtml());
    const host = this.root.querySelector<HTMLButtonElement>("#lb-host");
    if (host) {
      const connected = this.cb.online().connected;
      host.disabled = !connected;
      host.title = connected ? "Host this galaxy online and invite friends with a link" : "Connecting to the game server…";
    }
  }

  private onlineHtml(): string {
    if (this.cb.pendingTransfer())
      return `<div class="transfer-ask"><b>Play as the player from this link?</b>
        <div class="hint">You'll get their cloud saves and online games in this browser. The player you have here now won't be reachable here any more, unless you've kept its own transfer link.</div>
        <div class="actions"><button class="primary" data-a="tyes">Switch player</button><button data-a="tno">Keep current player</button></div></div>`;
    const o = this.cb.online();
    if (!o.connected) return `<div class="hint">Connecting to the game server… (online play and cloud saves need it)</div>`;
    const sessions = this.cb.sessions();
    const saves = this.cb.cloudSaves();
    return `${
      sessions.length
        ? `<div class="section-title">Your online games</div><div class="lobby-list">${sessions
            .slice(0, 6)
            .map(
              (x) => `<div class="lobby-row"><span><b>${esc(x.name)}</b> · ${esc(x.empireName ?? "spectating")} · ${x.status === "lobby" ? "waiting to start" : dateString(x.day)} · ${x.online} online</span>
              <button data-a="resume" data-code="${esc(x.code)}">${x.status === "finished" ? "View" : "Resume"}</button></div>`,
            )
            .join("")}</div><div class="hint">Hosted games are deleted 10 minutes after the last player leaves.</div>`
        : ""
    }${
      saves.length
        ? `<div class="section-title" style="margin-top:10px">Cloud saves</div><div class="lobby-list">${saves
            .map(
              (x) => `<div class="lobby-row"><span>${esc(x.name)} · ${dateString(x.day)}</span>
              <span><button data-a="cload" data-id="${esc(x.id)}">Load</button> <button class="danger" data-a="cdel" data-id="${esc(x.id)}" title="Delete">${icon("close")}</button></span></div>`,
            )
            .join("")}</div>`
        : ""
    }${
      o.transferLink
        ? `<details class="transfer" ${this.showTransfer ? "open" : ""}><summary data-a="transfer">Play on another device</summary>
          <div class="hint">Open this link on your other device to get your cloud saves and online games there. Keep it private: anyone with it can play as you.</div>
          <div class="invite"><input id="lb-transfer" readonly value="${esc(o.transferLink)}" /><button data-a="tcopy">Copy link</button></div></details>`
        : ""
    }`;
  }

  private renderRoom(info: SessionInfo): void {
    const mine = info.yourEmpireId;
    const link = inviteLink(info.code);
    this.root.innerHTML = `<div class="panel lobby-card room">
      <h1 class="title" style="font-size:30px">${esc(info.name)}</h1>
      <div class="tagline">${info.status === "lobby" ? `Hosted by ${esc(info.hostName)} · waiting to start` : `In progress · ${dateString(info.day)}`}</div>
      <div class="invite"><span>Invite friends with this link</span>
        <input id="room-link" readonly value="${esc(link)}" /><button data-a="copy">Copy link</button><span class="code" title="Invite code">${icon("players")} <b id="room-code">${esc(info.code)}</b></span></div>
      <label class="field room-name">Your name<input id="room-player" maxlength="32" value="${esc(this.cb.online().name)}" /></label>
      <div class="section-title">Empires</div>
      <div class="seats">${info.seats
        .map(
          (seat) => `<div class="seat ${seat.empireId === mine ? "mine" : ""}">
            <span class="swatch" style="background:${seat.color}"></span>
            <span class="sn" style="color:${seat.color}">${esc(seat.empireName)}</span>
            <span class="who">${
              seat.playerName
                ? `${seat.online ? "●" : "○"} ${esc(seat.playerName)}${seat.isHost ? " (host)" : ""}`
                : seat.alive
                  ? "AI ruler"
                  : "fallen"
            }</span>
            ${!mine && !seat.playerName && seat.alive ? `<button data-a="seat" data-id="${esc(seat.empireId)}">Take seat</button>` : ""}
          </div>`,
        )
        .join("")}</div>
      <div class="hint">${
        info.status === "lobby"
          ? info.youAreHost
            ? "Friends join with the code or link and take over an AI empire. Empires nobody takes stay AI-controlled. Start when everyone is ready."
            : mine
              ? "Waiting for the host to start the game…"
              : "Take a free seat to play."
          : mine
            ? "Entering the game…"
            : "Take over an AI empire to join the game."
      }</div>
      <div class="lobby-actions">
        ${info.status === "lobby" && info.youAreHost ? `<button class="primary" data-a="start" id="room-start">Start game</button>` : ""}
        <button data-a="leave">Leave</button>
      </div>
    </div>`;
    this.root.querySelector('[data-a="copy"]')!.addEventListener("click", () => {
      const input = this.root.querySelector<HTMLInputElement>("#room-link")!;
      input.select();
      void navigator.clipboard?.writeText(link).catch(() => document.execCommand("copy"));
    });
    this.root.querySelectorAll<HTMLElement>('[data-a="seat"]').forEach((b) => b.addEventListener("click", () => this.cb.takeSeat(b.dataset.id!)));
    this.root.querySelector<HTMLInputElement>("#room-player")!.addEventListener("change", (e) => {
      const v = (e.target as HTMLInputElement).value.trim();
      if (v) this.cb.setName(v);
    });
    this.root.querySelector('[data-a="start"]')?.addEventListener("click", () => this.cb.startSession());
    this.root.querySelector('[data-a="leave"]')!.addEventListener("click", () => this.cb.leaveSession());
  }

  hide(): void {
    this.root.classList.add("hidden");
    this.root.innerHTML = "";
    this.preview?.dispose();
    this.preview = null;
    this.previewHost = null;
  }

  private mountPreview(): void {
    const slot = this.root.querySelector("#lb-ship-slot");
    if (!slot) return;
    if (!this.previewHost) {
      this.previewHost = document.createElement("div");
      this.previewHost.className = "ship-preview";
      this.previewHost.id = "lb-ship";
      this.preview = new ShipPreview(this.previewHost);
    }
    slot.replaceWith(this.previewHost);
    this.preview?.set(this.setup.species, this.setup.color);
  }

  private render(): void {
    if (this.room || this.showHelp) {
      // The turntable only lives on the species screen.
      this.preview?.dispose();
      this.preview = null;
      this.previewHost = null;
    }
    if (this.room) return this.renderRoom(this.room);
    if (this.showHelp) {
      this.root.innerHTML = `<div class="panel lobby-card">
        <h1 class="title" style="font-size:30px">HOW TO PLAY</h1>
        ${helpHtml()}
        <div class="lobby-actions"><button class="primary" data-a="back">Back</button></div>
      </div>`;
      this.root.querySelector('[data-a="back"]')!.addEventListener("click", () => {
        this.showHelp = false;
        this.render();
      });
      return;
    }
    const st = this.setup;
    const sp = SPECIES.find((x) => x.id === st.species) ?? SPECIES[0];
    const size = GALAXY_SIZES.find((g) => g.id === st.size) ?? GALAXY_SIZES[1];
    const rivals = st.rivals ?? size.rivals;
    const online = this.cb.online();
    const save = this.cb.hasSave() ? this.cb.saveInfo() : null;
    this.root.innerHTML = `<div class="panel lobby-card">
      <h1 class="title">CONSTELLATION</h1>
      <div class="tagline">Chart the tunnels · Build your fleets · Rule the stars</div>
      <div class="section-title">Choose your species</div>
      <div class="species-grid">
        ${SPECIES.map(
          (s) => `<div class="species ${s.id === st.species ? "sel" : ""}" data-species="${s.id}">
            <div class="sn" style="color:${s.color}">${esc(s.name)}</div>
            <div class="sd">${esc(s.description)}</div>
          </div>`,
        ).join("")}
      </div>
      <div id="lb-ship-slot"></div>
      <div class="setup-row">
        <label class="field grow">Empire name<input id="lb-name" maxlength="28" value="${esc(sp.name)}" /></label>
        <div class="field">Colour<div class="swatches">${EMPIRE_COLORS.map((c) => `<button class="swatch-btn ${c === st.color ? "sel" : ""}" data-color="${c}" style="--c:${c}" title="${c}"></button>`).join("")}</div></div>
        <div class="field">Galaxy<div class="seg">${GALAXY_SIZES.map((g) => `<button class="${g.id === size.id ? "sel" : ""}" data-size="${g.id}" title="${g.stars} stars · ${g.rivals} rival empires">${g.label}<small>${g.stars} stars · ${st.rivals === null ? g.rivals : rivals} rivals</small></button>`).join("")}</div></div>
      </div>
      <details class="advanced" ${this.showAdvanced ? "open" : ""}><summary>Advanced settings</summary>
        <div class="setup-row">
          <label class="field">Rival empires
            <select id="lb-ai"><option value="auto" ${st.rivals === null ? "selected" : ""}>Auto (${size.rivals})</option>${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${st.rivals === n ? "selected" : ""}>${n}</option>`).join("")}</select>
          </label>
          <label class="field">Difficulty
            <select id="lb-diff">${(["easy", "normal", "hard"] as const).map((d) => `<option value="${d}" ${st.difficulty === d ? "selected" : ""}>${d[0].toUpperCase() + d.slice(1)}</option>`).join("")}</select>
          </label>
          <label class="field">Galaxy seed<input id="lb-seed" value="${esc(this.seed)}" /></label>
          <label class="field check"><input type="checkbox" id="lb-pirates" ${st.pirates ? "checked" : ""} /> Void Raiders</label>
        </div>
      </details>
      <div class="lobby-actions">
        ${save ? `<button data-a="continue" title="Resume your last game on this device">Continue<small>${esc(save.empire)} · ${dateString(save.day)}</small></button>` : ""}
        <button class="primary" data-a="new" id="lb-start">Start</button>
        <button data-a="host" id="lb-host" ${online.connected ? "" : "disabled"} title="${online.connected ? "Host this galaxy online and invite friends with a link" : "Connecting to the game server…"}">${icon("players")} Host online</button>
        <button data-a="help">How to play</button>
      </div>
      <div id="lb-online">${this.onlineHtml()}</div>
    </div>`;
    const remember = () => {
      try {
        localStorage.setItem(SETUP_KEY, JSON.stringify(this.setup));
      } catch {
        /* private mode: fine */
      }
    };
    /** Keep what was typed or picked across a re-render. */
    const capture = () => {
      const v = (id: string) => this.root.querySelector<HTMLInputElement>(id)?.value;
      this.seed = v("#lb-seed") ?? this.seed;
      this.showAdvanced = !!this.root.querySelector<HTMLDetailsElement>("details.advanced")?.open;
    };
    this.root.querySelectorAll<HTMLElement>("[data-species]").forEach((el) =>
      el.addEventListener("click", () => {
        capture();
        st.species = el.dataset.species!;
        st.color = EMPIRE_COLORS[SPECIES.findIndex((x) => x.id === st.species) % EMPIRE_COLORS.length];
        remember();
        this.render();
      }),
    );
    this.root.querySelectorAll<HTMLElement>("[data-color]").forEach((el) =>
      el.addEventListener("click", () => {
        st.color = el.dataset.color!;
        remember();
        this.root.querySelectorAll(".swatch-btn").forEach((b) => b.classList.toggle("sel", b === el));
        this.preview?.set(st.species, st.color);
      }),
    );
    this.root.querySelectorAll<HTMLElement>("[data-size]").forEach((el) =>
      el.addEventListener("click", () => {
        capture();
        st.size = el.dataset.size!;
        remember();
        this.render();
      }),
    );
    this.root.querySelector<HTMLSelectElement>("#lb-ai")!.addEventListener("change", (e) => {
      capture();
      const v = (e.target as HTMLSelectElement).value;
      st.rivals = v === "auto" ? null : Number(v);
      remember();
      this.render();
    });
    this.root.querySelector<HTMLSelectElement>("#lb-diff")!.addEventListener("change", (e) => {
      st.difficulty = (e.target as HTMLSelectElement).value as Setup["difficulty"];
      remember();
    });
    this.root.querySelector<HTMLInputElement>("#lb-pirates")!.addEventListener("change", (e) => {
      st.pirates = (e.target as HTMLInputElement).checked;
      remember();
    });
    this.mountPreview();
    this.root.querySelector('[data-a="continue"]')?.addEventListener("click", () => this.cb.onContinue());
    this.root.querySelector('[data-a="help"]')!.addEventListener("click", () => {
      capture();
      this.showHelp = true;
      this.render();
    });
    const settings = (): Partial<GameSettings> => {
      const v = (id: string) => (this.root.querySelector(id) as HTMLInputElement).value;
      return {
        playerName: v("#lb-name").trim() || sp.name,
        playerSpecies: st.species,
        playerColor: st.color,
        systemCount: size.stars,
        aiCount: rivals,
        difficulty: st.difficulty,
        seed: v("#lb-seed") || "constellation",
        pirates: st.pirates,
      };
    };
    this.root.querySelector('[data-a="new"]')!.addEventListener("click", () => this.cb.onNewGame(settings()));
    this.root.querySelector('[data-a="host"]')!.addEventListener("click", () => this.cb.onHost(settings()));
    // The online panel is re-rendered on its own, so delegate its events.
    const panel = this.root.querySelector<HTMLElement>("#lb-online")!;
    panel.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-a]");
      if (!b) return;
      switch (b.dataset.a) {
        case "resume":
          this.cb.onJoin(b.dataset.code!);
          break;
        case "cload":
          this.cb.onCloudLoad(b.dataset.id!);
          break;
        case "cdel":
          if (window.confirm("Delete this cloud save?")) this.cb.onCloudDelete(b.dataset.id!);
          break;
        case "tyes":
        case "tno":
          this.cb.onTransfer(b.dataset.a === "tyes");
          break;
        case "transfer":
          // The click toggles the <details> after this handler runs.
          this.showTransfer = !this.root.querySelector<HTMLDetailsElement>("details.transfer")?.open;
          break;
        case "tcopy": {
          const input = this.root.querySelector<HTMLInputElement>("#lb-transfer");
          if (!input) break;
          input.select();
          void navigator.clipboard?.writeText(input.value).catch(() => document.execCommand("copy"));
          b.textContent = "Copied";
          setTimeout(() => (b.textContent = "Copy link"), 1500);
          break;
        }
      }
    });
  }
}
