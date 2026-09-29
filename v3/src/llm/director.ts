// Drives LLM-voiced rival rulers for one game. Transport-agnostic: the game
// server calls the model directly; single-player browsers go through the
// server's proxy. The authoritative game (server session or local Game) is
// reached through `DirectorHost`.
//
// Rulers review their grand strategy every REVIEW_DAYS and at key moments
// (first contact, war declared on them, a colony lost, a demand answered),
// write to human rulers when the moment calls for it, and answer messages.

import { aiDiplomaticAction } from "../sim/diplomacy";
import type { ChatMessage, DiploAction, GameState } from "../sim/types";
import { buildBriefing } from "./briefing";
import type { DecideRequest, DirectiveReply, TalkReply, TalkRequest } from "./types";

export interface LlmTransport {
  decide(req: DecideRequest): Promise<DirectiveReply | null>;
  talk(req: TalkRequest): Promise<TalkReply | null>;
}

export interface DirectorHost {
  state(): GameState;
  /** Human-controlled empire (its ruler reads messages). */
  isHuman(empireId: string): boolean;
  /** Record a message and show it to its participants. */
  deliver(msg: ChatMessage): void;
  chats(): ChatMessage[];
  /** False while nobody is playing (paused, no one online): no strategy reviews then. */
  active(): boolean;
}

/** Days between routine strategy reviews. */
export const REVIEW_DAYS = 120;
/** Key moments re-trigger a review at most this often. */
export const MIN_REVIEW_GAP = 25;
/** Simultaneous strategy requests per game (keeps token use and bursts low). */
const MAX_IN_FLIGHT = 2;

let seq = 0;
export function chatId(): string {
  seq = (seq + 1) % 1e6;
  return `m${Date.now().toString(36)}${seq.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

interface Watch {
  relations: Record<string, string>;
  colonies: number;
  demandsOut: Set<string>;
  lastReview: number;
}

export class RivalDirector {
  private inFlight = new Set<string>();
  private talking = new Map<string, string[]>(); // "ai|partner" → queued texts
  private triggers = new Map<string, string[]>();
  private watch = new Map<string, Watch>();
  /** Number of model calls made (for tests and budgeting). */
  calls = 0;

  constructor(
    private host: DirectorHost,
    private transport: LlmTransport,
  ) {}

  private aiEmpires() {
    const s = this.host.state();
    return Object.values(s.empires).filter((e) => e.ai && e.alive && !e.isPirate && !this.host.isHuman(e.id));
  }

  /** Queue a key moment for an AI ruler; it is reviewed on the next tick. */
  keyMoment(empireId: string, what: string): void {
    const list = this.triggers.get(empireId) ?? [];
    if (!list.includes(what)) list.push(what);
    this.triggers.set(empireId, list.slice(-4));
  }

  /** Feed simulation events (first contacts). */
  onEvents(events: { type: string; a?: string; b?: string }[]): void {
    const s = this.host.state();
    for (const ev of events) {
      if (ev.type !== "contact" || !ev.a || !ev.b) continue;
      for (const [ai, other] of [
        [ev.a, ev.b],
        [ev.b, ev.a],
      ]) {
        const e = s.empires[ai];
        if (e?.ai && !this.host.isHuman(ai) && s.empires[other] && !s.empires[other].isPirate)
          this.keyMoment(ai, `FIRST CONTACT with the ${s.empires[other].name} [${other}]${this.host.isHuman(other) ? " (a human ruler) — consider greeting them" : ""}`);
      }
    }
  }

  /** Detect key moments by comparing with the last tick, then schedule reviews. */
  tick(): void {
    const s = this.host.state();
    if (s.winner) return;
    for (const e of this.aiEmpires()) {
      const colonies = Object.values(s.colonies).filter((c) => c.empireId === e.id).length;
      const demandsOut = new Set(Object.values(s.empires).filter((o) => o.demands?.[e.id]).map((o) => o.id));
      const w = this.watch.get(e.id);
      if (w) {
        for (const [id, rel] of Object.entries(e.relations)) {
          const other = s.empires[id];
          if (!other || other.isPirate) continue;
          if (w.relations[id] === "peace" && rel === "war" && e.ai!.directive?.warTarget !== id)
            this.keyMoment(e.id, `The ${other.name} [${id}] DECLARED WAR on you`);
          if (w.relations[id] === "war" && rel === "peace") this.keyMoment(e.id, `Peace was made with the ${other.name} [${id}]`);
        }
        if (colonies < w.colonies) this.keyMoment(e.id, "You LOST a colony");
        for (const id of w.demandsOut)
          if (!demandsOut.has(id)) this.keyMoment(e.id, `The ${s.empires[id]?.name} [${id}] answered your demand (see RECENT)`);
      }
      this.watch.set(e.id, { relations: { ...e.relations }, colonies, demandsOut, lastReview: w?.lastReview ?? -999 });
    }
    if (!this.host.active()) return;
    for (const e of this.aiEmpires()) {
      if (this.inFlight.size >= MAX_IN_FLIGHT) break;
      if (this.inFlight.has(e.id)) continue;
      const ai = e.ai!;
      const w = this.watch.get(e.id)!;
      const pending = this.triggers.get(e.id);
      const keyDue = !!pending?.length && s.day - w.lastReview >= MIN_REVIEW_GAP;
      if (ai.llmNext === undefined) ai.llmNext = s.day + 5 + (Number(e.id.replace(/\D/g, "")) % 7) * 6;
      if (!keyDue && s.day < ai.llmNext) continue;
      const trigger = keyDue ? pending!.join("; ") : "Routine review of your strategy.";
      this.triggers.delete(e.id);
      w.lastReview = s.day;
      ai.llmNext = s.day + REVIEW_DAYS;
      void this.decide(e.id, trigger);
    }
  }

  private async decide(empireId: string, trigger: string): Promise<void> {
    this.inFlight.add(empireId);
    let reply: DirectiveReply | null = null;
    try {
      const briefing = buildBriefing(this.host.state(), empireId, (id) => this.host.isHuman(id));
      this.calls++;
      reply = await this.transport.decide({ briefing, trigger });
    } catch (err) {
      console.error("llm decide failed", (err as Error).message);
      reply = null;
    } finally {
      this.inFlight.delete(empireId);
    }
    if (!reply) return;
    const s = this.host.state();
    const e = s.empires[empireId];
    if (!e?.ai || !e.alive || this.host.isHuman(empireId)) return;
    e.ai.directive = {
      posture: reply.posture,
      research: reply.research,
      warTarget: reply.warTarget,
      seekPeace: reply.seekPeace,
      summary: reply.summary,
      day: s.day,
    };
    for (const m of reply.messages) {
      if (!this.host.isHuman(m.to)) continue;
      const action = this.act(empireId, m.to, m.action);
      this.host.deliver({ id: chatId(), from: empireId, to: m.to, text: m.text, day: s.day, at: Date.now(), action });
    }
  }

  /** Carry out an action within the rules; returns what actually happened. */
  private act(aiId: string, partnerId: string, action: DiploAction): DiploAction {
    if (action.kind === "none") return action;
    const r = aiDiplomaticAction(this.host.state(), aiId, partnerId, action);
    return r.ok ? action : { kind: "none" };
  }

  /** A human ruler writes to an AI ruler: record it, then answer in character. */
  humanMessage(fromId: string, toId: string, text: string, extra: { auto?: boolean; action?: DiploAction } = {}): ChatMessage {
    const s = this.host.state();
    const msg: ChatMessage = { id: chatId(), from: fromId, to: toId, text, day: s.day, at: Date.now() };
    if (extra.auto) msg.auto = true;
    if (extra.action && extra.action.kind !== "none") msg.action = extra.action;
    this.host.deliver(msg);
    const said = modelText(msg);
    const key = `${toId}|${fromId}`;
    const queued = this.talking.get(key);
    if (queued) queued.push(said); // answered together once the current reply arrives
    else void this.answer(fromId, toId, [said]);
    return msg;
  }

  busyWith(aiId: string, partnerId: string): boolean {
    return this.talking.has(`${aiId}|${partnerId}`);
  }

  private async answer(fromId: string, aiId: string, texts: string[]): Promise<void> {
    const key = `${aiId}|${fromId}`;
    this.talking.set(key, []);
    let reply: TalkReply | null = null;
    try {
      const s = this.host.state();
      const e = s.empires[aiId];
      if (e?.ai && e.alive && !this.host.isHuman(aiId)) {
        const briefing = buildBriefing(s, aiId, (id) => this.host.isHuman(id));
        const history = this.host
          .chats()
          .filter((m) => (m.from === aiId && m.to === fromId) || (m.from === fromId && m.to === aiId))
          .slice(-(8 + texts.length), -texts.length || undefined)
          .map((m) => ({ from: m.from === aiId ? ("us" as const) : ("them" as const), text: modelText(m) }));
        this.calls++;
        reply = await this.transport.talk({ briefing, partnerId: fromId, history, text: texts.join("\n") });
      }
    } catch (err) {
      console.error("llm talk failed", (err as Error).message);
      reply = null;
    }
    const s = this.host.state();
    const action = reply ? this.act(aiId, fromId, reply.action) : ({ kind: "none" } as DiploAction);
    this.host.deliver({
      id: chatId(),
      from: aiId,
      to: fromId,
      text: reply?.reply ?? "(No reply. Their envoys have fallen silent.)",
      day: s.day,
      at: Date.now(),
      action,
    });
    const more = this.talking.get(key) ?? [];
    this.talking.delete(key);
    if (more.length) void this.answer(fromId, aiId, more);
  }
}

/** Automatic announcements are acts, not just words: mark them so the ruler reacts to the deed. */
export function modelText(m: ChatMessage): string {
  return m.auto ? `[ACT] ${m.text}` : m.text;
}
