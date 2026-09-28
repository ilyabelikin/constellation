// Title screen & new-game setup.

import { SPECIES } from "../sim/data/structures";
import { EMPIRE_COLORS } from "../sim/galaxy";
import type { GameSettings } from "../sim/types";
import { esc } from "./format";
import { helpHtml } from "./help";

export interface LobbyCallbacks {
  onNewGame(settings: Partial<GameSettings>): void;
  onContinue(): void;
  hasSave(): boolean;
}

export class Lobby {
  private species = SPECIES[0].id;
  private color = EMPIRE_COLORS[0];
  private showHelp = false;

  constructor(
    private root: HTMLElement,
    private cb: LobbyCallbacks,
  ) {}

  show(): void {
    this.root.classList.remove("hidden");
    this.render();
  }

  hide(): void {
    this.root.classList.add("hidden");
    this.root.innerHTML = "";
  }

  private render(): void {
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
    this.root.querySelector('[data-a="new"]')!.addEventListener("click", () => {
      const v = (id: string) => (this.root.querySelector(id) as HTMLInputElement).value;
      this.cb.onNewGame({
        playerName: v("#lb-name").trim() || sp.name,
        playerSpecies: this.species,
        playerColor: this.color,
        systemCount: Number(v("#lb-size")),
        aiCount: Number(v("#lb-ai")),
        difficulty: v("#lb-diff") as GameSettings["difficulty"],
        seed: v("#lb-seed") || "constellation",
        pirates: (this.root.querySelector("#lb-pirates") as HTMLInputElement).checked,
      });
    });
  }
}
