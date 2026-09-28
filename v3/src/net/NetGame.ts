// Client-side view of a multiplayer game. Holds the fog-of-war state the
// server sends, interpolates between snapshots, and forwards commands.

import type { CommandResult } from "../sim/api";
import { PlayerFacade } from "../sim/facade";
import { incomeReport } from "../sim/economy";
import type { GameState, SimEvent } from "../sim/types";
import { stateFromView, type PlayerView, type StaticView } from "../sim/view";
import type { NetClient } from "./NetClient";
import type { SessionInfo } from "./protocol";

export class NetGame extends PlayerFacade {
  state: GameState;
  info: SessionInfo;
  private events: SimEvent[] = [];
  private nextCmdId = 1;
  private pending = new Map<number, string>();
  /** Game day of the previous and latest snapshot, and when the latest arrived. */
  prevDay: number;
  lastViewAt = performance.now();
  viewInterval = 250;
  viewsReceived = 0;
  onError: ((message: string) => void) | null = null;
  onView: (() => void) | null = null;
  private unsubs: (() => void)[] = [];

  constructor(
    readonly net: NetClient,
    private stat: StaticView,
    view: PlayerView,
    info: SessionInfo,
  ) {
    super();
    this.state = stateFromView(stat, view);
    this.prevDay = view.day;
    this.info = info;
    this.refreshIncome();
    this.unsubs.push(
      net.on("view", (m) => this.applyView(m.data, m.events)),
      net.on("static", (m) => {
        this.stat = m.data;
      }),
      net.on("session", (m) => {
        this.info = m.info;
      }),
      net.on("cmdResult", (m) => {
        const name = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (!m.ok && name) this.onError?.(m.error ?? "Command failed");
      }),
    );
  }

  dispose(): void {
    for (const u of this.unsubs) u();
  }

  private applyView(view: PlayerView, events: SimEvent[]): void {
    const now = performance.now();
    this.viewInterval = Math.min(1000, Math.max(100, now - this.lastViewAt));
    this.lastViewAt = now;
    const old = this.state.fleets;
    this.prevDay = this.state.day;
    const next = stateFromView(this.stat, view);
    // Smooth motion: each fleet interpolates from where we last drew it.
    for (const f of Object.values(next.fleets)) {
      const before = old[f.id];
      f.prevPos = before && before.systemId === f.systemId ? { ...before.pos } : { ...f.pos };
    }
    this.state = next;
    this.refreshIncome();
    this.events.push(...events);
    this.viewsReceived++;
    this.onView?.();
  }

  /** Interpolation factor between the last two snapshots. */
  alpha(now = performance.now()): number {
    return Math.min(1, (now - this.lastViewAt) / this.viewInterval);
  }

  renderDay(now = performance.now()): number {
    return this.prevDay + (this.state.day - this.prevDay) * this.alpha(now);
  }

  private refreshIncome(): void {
    const me = this.state.empires[this.state.playerId];
    if (me) me.income = incomeReport(this.state, me).net;
  }

  /** Commands are validated by the server; errors come back asynchronously. */
  exec(name: string, ...args: unknown[]): CommandResult {
    const id = this.nextCmdId++;
    this.pending.set(id, name);
    this.net.send({ t: "cmd", id, name, args });
    return { ok: true };
  }

  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }
}
