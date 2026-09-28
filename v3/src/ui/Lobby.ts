// Title screen & new-game setup.

import { SPECIES } from "../sim/data/structures";
import { EMPIRE_COLORS } from "../sim/galaxy";
import type { GameSettings } from "../sim/types";
import type { CloudSaveSummary, SessionInfo, SessionSummary } from "../net/protocol";
import { dateString, esc } from "./format";
import { helpHtml } from "./help";

export interface LobbyCallbacks {
  onNewGame(settings: Partial<GameSettings>): void;
  onContinue(): void;
  hasSave(): boolean;
  online(): { connected: boolean; name: string; llm: boolean };
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

export function inviteLink(code: string): string {
  return `${location.origin}${location.pathname}?join=${encodeURIComponent(code)}`;
}

export class Lobby {
  private species = SPECIES[0].id;
  private color = EMPIRE_COLORS[0];
  private showHelp = false;
  private room: SessionInfo | null = null;

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
    if (el) el.innerHTML = this.onlineHtml();
  }

  private onlineHtml(): string {
    const o = this.cb.online();
    if (!o.connected) return `<div class="section-title">Play online</div><div class="hint">Connecting to the game server… (online play and cloud saves need it)</div>`;
    const sessions = this.cb.sessions();
    const saves = this.cb.cloudSaves();
    return `<div class="section-title">Play online ${o.llm ? `<span class="tag peace" title="Rival rulers are voiced by a language model">AI diplomats</span>` : ""}</div>
      <div class="form-row">
        <label class="field">Your name<input id="lb-player" maxlength="32" value="${esc(o.name)}" /></label>
        <button data-a="host" id="lb-host" title="Host this galaxy online and invite friends">Host online game</button>
        <label class="field">Invite code<input id="lb-code" maxlength="12" placeholder="ABC123" style="text-transform:uppercase" /></label>
        <button data-a="join" id="lb-join">Join</button>
      </div>
      ${
        sessions.length
          ? `<div class="lobby-list">${sessions
              .slice(0, 6)
              .map(
                (x) => `<div class="lobby-row"><span><b>${esc(x.name)}</b> · ${esc(x.empireName ?? "spectating")} · ${x.status === "lobby" ? "waiting to start" : dateString(x.day)} · ${x.online} online</span>
                <button data-a="resume" data-code="${esc(x.code)}">${x.status === "finished" ? "View" : "Resume"}</button></div>`,
              )
              .join("")}</div>`
          : ""
      }
      ${
        saves.length
          ? `<div class="section-title" style="margin-top:10px">Cloud saves</div><div class="lobby-list">${saves
              .map(
                (x) => `<div class="lobby-row"><span>${esc(x.name)} · ${dateString(x.day)}</span>
                <span><button data-a="cload" data-id="${esc(x.id)}">Load</button> <button class="danger" data-a="cdel" data-id="${esc(x.id)}" title="Delete">✕</button></span></div>`,
              )
              .join("")}</div>`
          : ""
      }`;
  }

  private renderRoom(info: SessionInfo): void {
    const mine = info.yourEmpireId;
    const link = inviteLink(info.code);
    this.root.innerHTML = `<div class="panel lobby-card room">
      <h1 class="title" style="font-size:30px">${esc(info.name)}</h1>
      <div class="tagline">${info.status === "lobby" ? `Hosted by ${esc(info.hostName)} · waiting to start` : `In progress · ${dateString(info.day)}`}</div>
      <div class="invite">Invite code <b id="room-code">${esc(info.code)}</b>
        <input id="room-link" readonly value="${esc(link)}" /><button data-a="copy">Copy link</button></div>
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
    this.root.querySelector('[data-a="start"]')?.addEventListener("click", () => this.cb.startSession());
    this.root.querySelector('[data-a="leave"]')!.addEventListener("click", () => this.cb.leaveSession());
  }

  hide(): void {
    this.root.classList.add("hidden");
    this.root.innerHTML = "";
  }

  private render(): void {
    if (this.room) return this.renderRoom(this.room);
    const sp = SPECIES.find((s) => s.id === this.species)!;
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
    this.root.innerHTML = `<div class="panel lobby-card">
      <h1 class="title">CONSTELLATION</h1>
      <div class="tagline">Chart the tunnels · Build your fleets · Rule the stars</div>
      <div class="section-title">Choose your species</div>
      <div class="species-grid">
        ${SPECIES.map(
          (s) => `<div class="species ${s.id === this.species ? "sel" : ""}" data-species="${s.id}">
            <div class="sn" style="color:${s.color}">${esc(s.name)}</div>
            <div class="sd">${esc(s.description)}</div>
          </div>`,
        ).join("")}
      </div>
      <div class="form-row">
        <label class="field">Empire name<input id="lb-name" maxlength="28" value="${esc(sp.name)}" /></label>
        <label class="field">Colour
          <select id="lb-color">${EMPIRE_COLORS.map((c) => `<option value="${c}" ${c === this.color ? "selected" : ""} style="color:${c}">■ ${c}</option>`).join("")}</select>
        </label>
        <label class="field">Galaxy size
          <select id="lb-size">
            <option value="20">Small (20 stars)</option>
            <option value="32" selected>Medium (32 stars)</option>
            <option value="48">Large (48 stars)</option>
          </select>
        </label>
        <label class="field">Rival empires
          <select id="lb-ai">${[1, 2, 3, 4, 5].map((n) => `<option ${n === 3 ? "selected" : ""}>${n}</option>`).join("")}</select>
        </label>
        <label class="field">Difficulty
          <select id="lb-diff"><option value="easy">Easy</option><option value="normal" selected>Normal</option><option value="hard">Hard</option></select>
        </label>
        <label class="field">Galaxy seed<input id="lb-seed" value="${Math.random().toString(36).slice(2, 8)}" /></label>
        <label class="field" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" id="lb-pirates" checked style="min-width:0" /> Void Raiders</label>
      </div>
      <div class="lobby-actions">
        ${this.cb.hasSave() ? `<button data-a="continue">Continue</button>` : ""}
        <button class="primary" data-a="new" id="lb-start">Launch New Game</button>
        <button data-a="help">How to play</button>
      </div>
      <div id="lb-online">${this.onlineHtml()}</div>
    </div>`;
    this.root.querySelectorAll<HTMLElement>("[data-species]").forEach((el) =>
      el.addEventListener("click", () => {
        this.species = el.dataset.species!;
        const s = SPECIES.find((x) => x.id === this.species)!;
        const idx = SPECIES.indexOf(s);
        this.color = EMPIRE_COLORS[idx % EMPIRE_COLORS.length];
        this.render();
      }),
    );
    (this.root.querySelector("#lb-color") as HTMLSelectElement).addEventListener("change", (e) => {
      this.color = (e.target as HTMLSelectElement).value;
    });
    this.root.querySelector('[data-a="continue"]')?.addEventListener("click", () => this.cb.onContinue());
    this.root.querySelector('[data-a="help"]')!.addEventListener("click", () => {
      this.showHelp = true;
      this.render();
    });
    const settings = (): Partial<GameSettings> => {
      const v = (id: string) => (this.root.querySelector(id) as HTMLInputElement).value;
      return {
        playerName: v("#lb-name").trim() || sp.name,
        playerSpecies: this.species,
        playerColor: this.color,
        systemCount: Number(v("#lb-size")),
        aiCount: Number(v("#lb-ai")),
        difficulty: v("#lb-diff") as GameSettings["difficulty"],
        seed: v("#lb-seed") || "constellation",
        pirates: (this.root.querySelector("#lb-pirates") as HTMLInputElement).checked,
      };
    };
    this.root.querySelector('[data-a="new"]')!.addEventListener("click", () => this.cb.onNewGame(settings()));
    // The online panel is re-rendered on its own, so delegate its events.
    const online = this.root.querySelector<HTMLElement>("#lb-online")!;
    online.addEventListener("change", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.id === "lb-player" && t.value.trim()) this.cb.setName(t.value.trim());
    });
    online.addEventListener("keydown", (e) => {
      const t = e.target as HTMLInputElement;
      if (e.key === "Enter" && t.id === "lb-code" && t.value.trim()) this.cb.onJoin(t.value.trim().toUpperCase());
    });
    online.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-a]");
      if (!b) return;
      const nameInput = online.querySelector<HTMLInputElement>("#lb-player");
      if (nameInput && nameInput.value.trim() && nameInput.value.trim() !== this.cb.online().name) this.cb.setName(nameInput.value.trim());
      switch (b.dataset.a) {
        case "host":
          this.cb.onHost(settings());
          break;
        case "join": {
          const code = online.querySelector<HTMLInputElement>("#lb-code")!.value.trim().toUpperCase();
          if (code) this.cb.onJoin(code);
          break;
        }
        case "resume":
          this.cb.onJoin(b.dataset.code!);
          break;
        case "cload":
          this.cb.onCloudLoad(b.dataset.id!);
          break;
        case "cdel":
          if (window.confirm("Delete this cloud save?")) this.cb.onCloudDelete(b.dataset.id!);
          break;
      }
    });
  }
}
