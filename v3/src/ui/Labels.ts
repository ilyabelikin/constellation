// Floating HTML labels anchored to 3D positions, with simple declutter.

import type * as THREE from "three";
import type { Engine } from "../render/Engine";
import { esc } from "./format";

export interface LabelAnchor {
  key: string;
  text: string;
  sub?: string;
  pos: THREE.Vector3;
  color: string;
  kind: string;
  size: number;
}

export class Labels {
  private els = new Map<string, HTMLDivElement>();
  private content = new Map<string, string>();

  constructor(private root: HTMLElement) {}

  update(engine: Engine, anchors: LabelAnchor[], opts: { hideMoonsBeyond?: number; maxDistance?: number } = {}): void {
    const seen = new Set<string>();
    const cam = engine.camera.position;
    const placed: { x: number; y: number; w: number }[] = [];
    // Priority: stars/systems, fleets, planets, gates, moons.
    const prio: Record<string, number> = { star: 0, system: 0, fleet: 1, planet: 2, gate: 3, belt: 4, comet: 4, moon: 5 };
    anchors.sort((a, b) => (prio[a.kind] ?? 9) - (prio[b.kind] ?? 9));
    for (const a of anchors) {
      const dist = cam.distanceTo(a.pos);
      if (a.kind === "moon" && dist > (opts.hideMoonsBeyond ?? 90)) continue;
      if (opts.maxDistance && dist > opts.maxDistance && a.kind !== "star" && a.kind !== "system") continue;
      const p = engine.project(a.pos);
      if (!p) continue;
      if (p.x < -50 || p.y < -20 || p.x > window.innerWidth + 50 || p.y > window.innerHeight + 20) continue;
      // Declutter: skip if overlapping a higher-priority label.
      const w = Math.max(40, a.text.length * 6.5);
      if (placed.some((q) => Math.abs(q.x - p.x) < (q.w + w) / 2 && Math.abs(q.y - p.y) < 22)) continue;
      placed.push({ x: p.x, y: p.y, w });
      seen.add(a.key);
      let el = this.els.get(a.key);
      if (!el) {
        el = document.createElement("div");
        this.root.appendChild(el);
        this.els.set(a.key, el);
      }
      const html = `<div class="n" style="color:${a.color}">${esc(a.text)}</div>${a.sub ? `<div class="s">${esc(a.sub)}</div>` : ""}`;
      if (this.content.get(a.key) !== html) {
        el.innerHTML = html;
        el.className = `label ${a.kind}`;
        this.content.set(a.key, html);
      }
      el.style.transform = `translate(${p.x.toFixed(1)}px, ${(p.y - 4).toFixed(1)}px) translate(-50%, -100%)`;
      el.style.display = "";
    }
    for (const [k, el] of this.els) {
      if (!seen.has(k)) el.style.display = "none";
    }
  }

  clear(): void {
    for (const el of this.els.values()) el.remove();
    this.els.clear();
    this.content.clear();
  }
}
