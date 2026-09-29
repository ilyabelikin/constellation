// LLM-driven rivals via OpenRouter. The API key lives only here (env
// OPENROUTER_API_KEY) and never reaches a browser: hosted sessions run their
// rulers on the server, and single-player browsers send knowledge-limited
// briefings to be answered here (rate limited per player).
//
// Environment:
//   OPENROUTER_API_KEY   enables LLM rivals
//   LLM_MODEL            default z-ai/glm-5.3-flash
//   LLM_BASE_URL         default https://openrouter.ai/api/v1
//   LLM_MAX_CALLS_PER_HOUR  global safety cap (default 2000)
//   LLM_MOCK=1           deterministic fake model (tests, offline development)

import type { ClientMessage } from "../src/net/protocol";
import { RivalDirector, type LlmTransport } from "../src/llm/director";
import { decideMessages, parseDecision, parseTalk, sanitizeBriefing, talkMessages, type ChatTurn } from "../src/llm/prompts";
import type { DecideRequest, TalkRequest } from "../src/llm/types";
import type { Hub } from "./hub";
import type { Conn, Session } from "./session";

export interface LlmClient {
  readonly model: string;
  complete(messages: ChatTurn[], opts?: { maxTokens?: number; temperature?: number }): Promise<string>;
}

export const DEFAULT_MODEL = "z-ai/glm-5.3-flash";

/**
 * Extra max_tokens on top of the reply budget. Hidden reasoning counts against
 * max_tokens, and some models (glm-5.3-flash) cannot turn it off, so without
 * headroom the reply gets cut off mid-sentence and can't be parsed.
 */
export const REASONING_HEADROOM = 1000;

export class OpenRouterClient implements LlmClient {
  /** Tokens used so far (prompt, completion) for logging. */
  usage = { prompt: 0, completion: 0, calls: 0, errors: 0 };
  private reasoningParam = true;

  constructor(
    private apiKey: string,
    readonly model = DEFAULT_MODEL,
    private baseUrl = "https://openrouter.ai/api/v1",
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async complete(messages: ChatTurn[], opts: { maxTokens?: number; temperature?: number } = {}): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      max_tokens: (opts.maxTokens ?? 400) + REASONING_HEADROOM,
      temperature: opts.temperature ?? 0.85,
    };
    // Rulers answer directly; low effort keeps hidden reasoning (and latency) near
    // zero. Some models reject disabling reasoning outright, but accept this.
    const withReasoning = this.reasoningParam;
    if (withReasoning) body.reasoning = { effort: "low" };
    const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.PUBLIC_URL ?? "https://constell.space",
        "X-Title": "Constellation",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
    this.usage.calls++;
    if (!res.ok) {
      this.usage.errors++;
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      // Some providers reject the reasoning setting: retry once without it. Check
      // what this request sent, not the shared flag, which a concurrent call may
      // already have cleared.
      if (res.status === 400 && withReasoning && /reasoning/i.test(detail)) {
        this.reasoningParam = false;
        return this.complete(messages, opts);
      }
      throw new Error(`LLM HTTP ${res.status}: ${detail}`);
    }
    const json = (await res.json()) as {
      choices?: { finish_reason?: string; message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
    };
    this.usage.prompt += json.usage?.prompt_tokens ?? 0;
    this.usage.completion += json.usage?.completion_tokens ?? 0;
    const choice = json.choices?.[0];
    if (choice?.finish_reason === "length")
      console.warn(
        `llm reply truncated at max_tokens (${json.usage?.completion_tokens ?? "?"} tokens, ${json.usage?.completion_tokens_details?.reasoning_tokens ?? "?"} reasoning)`,
      );
    return choice?.message?.content ?? "";
  }
}

/**
 * A deterministic stand-in for the model: picks sensible strategies from the
 * situation report and answers messages with simple, in-character replies.
 */
export class MockLlm implements LlmClient {
  readonly model = "mock";
  calls: ChatTurn[][] = [];

  async complete(messages: ChatTurn[]): Promise<string> {
    this.calls.push(messages);
    const system = messages[0]?.content ?? "";
    const user = messages[messages.length - 1]?.content ?? "";
    const title = /You are (.+?), ruler of the (.+?), in/.exec(system);
    const who = title ? `${title[1]} of the ${title[2]}` : "the ruler";
    if (system.includes("grand strategy")) {
      const war = /\[(e\d+)\][^\n]*: WAR/.exec(user);
      const human = /\[(e\d+)\][^\n]*\(HUMAN ruler\)/.exec(user);
      const contact = /FIRST CONTACT with the (.+?) \[(e\d+)\]/.exec(user);
      return JSON.stringify({
        posture: war ? "defend" : "expand",
        research: war ? "defense" : "industry",
        war_target: null,
        seek_peace: war ? [war[1]] : [],
        summary: war ? "Hold the line and seek terms." : "Grow while the galaxy is quiet.",
        messages: contact && human && contact[2] === human[1] ? [{ to: human[1], text: `Greetings from ${who}. We have noted your arrival.`, action: { kind: "none" } }] : [],
      });
    }
    const said = (/"""([\s\S]*)"""/.exec(user)?.[1] ?? "").toLowerCase();
    let action: Record<string, unknown> = { kind: "none" };
    if (said.startsWith("[act]")) {
      if (said.includes("send you") && /\[(e\d+)\][^\n]*: WAR/.test(user)) action = { kind: "accept_peace" };
      return JSON.stringify({ reply: `${who} takes note of your deed.`, action });
    }
    if (said.includes("peace")) action = { kind: "accept_peace" };
    else if (said.includes("gift") || said.includes("tribute")) action = { kind: "offer_tribute", resource: "credits", amount: 50 };
    else if (said.includes("trade")) action = { kind: "accept_trade" };
    else if (said.includes("war")) action = { kind: "declare_war" };
    return JSON.stringify({ reply: `${who} acknowledges your words.`, action });
  }
}

export function createLlmClient(env: NodeJS.ProcessEnv = process.env): LlmClient | null {
  if (env.LLM_MOCK === "1") return new MockLlm();
  const key = env.OPENROUTER_API_KEY?.trim();
  if (!key) return null;
  return new OpenRouterClient(key, env.LLM_MODEL?.trim() || DEFAULT_MODEL, env.LLM_BASE_URL?.trim() || undefined);
}

/** Global hourly cap plus per-player token buckets. */
export class LlmBudget {
  private hourStart = Date.now();
  private hourCalls = 0;
  private buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    private maxPerHour = Number(process.env.LLM_MAX_CALLS_PER_HOUR ?? 2000),
    private bucketSize = 12,
    private refillMs = 10_000,
  ) {}

  /** May `who` (a player uuid, or a session id) make a call now? Consumes on success. */
  take(who: string, now = Date.now()): boolean {
    if (now - this.hourStart > 3_600_000) {
      this.hourStart = now;
      this.hourCalls = 0;
    }
    if (this.hourCalls >= this.maxPerHour) return false;
    const b = this.buckets.get(who) ?? { tokens: this.bucketSize, at: now };
    b.tokens = Math.min(this.bucketSize, b.tokens + (now - b.at) / this.refillMs);
    b.at = now;
    this.buckets.set(who, b);
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    this.hourCalls++;
    return true;
  }
}

/** Model calls for rulers, parsed and validated. */
export function serverTransport(llm: LlmClient, budget: LlmBudget, who: string): LlmTransport {
  return {
    async decide(req: DecideRequest) {
      if (!budget.take(who)) {
        console.warn(`llm decide skipped: rate limit for ${who}`);
        return null;
      }
      const raw = await llm.complete(decideMessages(req), { maxTokens: 450, temperature: 0.8 });
      const decision = parseDecision(raw, req.briefing);
      if (!decision) console.warn(`llm decide reply unusable: ${JSON.stringify(raw.slice(0, 200))}`);
      return decision;
    },
    async talk(req: TalkRequest) {
      if (!budget.take(who)) {
        console.warn(`llm talk skipped: rate limit for ${who}`);
        return null;
      }
      const raw = await llm.complete(talkMessages(req), { maxTokens: 320, temperature: 0.9 });
      const reply = parseTalk(raw, req);
      if (!reply) console.warn(`llm talk reply unusable: ${JSON.stringify(raw.slice(0, 200))}`);
      return reply;
    },
  };
}

/** Give every hosted session LLM rulers, answer AI-bound chat, and serve single-player requests. */
export function attachLlm(hub: Hub, llm: LlmClient, budget = new LlmBudget()): void {
  const directors = new WeakMap<Session, RivalDirector>();
  const directorFor = (session: Session) => {
    let d = directors.get(session);
    if (!d) {
      d = new RivalDirector(
        {
          state: () => session.game.state,
          isHuman: (id) => session.seats.has(id),
          deliver: (m) => session.addChat(m),
          chats: () => session.chats,
          active: () => session.running,
        },
        serverTransport(llm, budget, `session:${session.id}`),
      );
      directors.set(session, d);
      session.onEvents = (events) => d!.onEvents(events);
      session.afterTick = () => d!.tick();
    }
    return d;
  };
  hub.opts.llmEnabled = true;
  hub.opts.onSessionLoaded = (session) => void directorFor(session);
  hub.opts.aiChat = (session, fromId, toId, text, extra) => void directorFor(session).humanMessage(fromId, toId, text, extra);
  hub.opts.onLlmRequest = (conn: Conn, msg: Extract<ClientMessage, { t: "llm" }>) => {
    const id = Number(msg.id) || 0;
    const briefing = sanitizeBriefing((msg.req as { briefing?: unknown })?.briefing);
    if (!briefing) return conn.send({ t: "llmResult", id, ok: false, error: "Bad request" });
    const transport = serverTransport(llm, budget, conn.uuid);
    const run = async () => {
      if (msg.kind === "decide") {
        const trigger = String((msg.req as { trigger?: unknown }).trigger ?? "Routine review.").slice(0, 400);
        const decide = await transport.decide({ briefing, trigger });
        return decide ? { t: "llmResult" as const, id, ok: true, decide } : { t: "llmResult" as const, id, ok: false, error: "No decision" };
      }
      const r = msg.req as Partial<TalkRequest>;
      const history = (Array.isArray(r.history) ? r.history : [])
        .slice(-8)
        .map((h) => ({ from: h?.from === "us" ? ("us" as const) : ("them" as const), text: String(h?.text ?? "").slice(0, 600) }));
      const talk = await transport.talk({ briefing, partnerId: String(r.partnerId ?? ""), history, text: String(r.text ?? "").slice(0, 600) });
      return talk ? { t: "llmResult" as const, id, ok: true, talk } : { t: "llmResult" as const, id, ok: false, error: "No reply" };
    };
    run()
      .then((m) => conn.send(m))
      .catch((err) => {
        console.error("llm request failed", (err as Error).message);
        conn.send({ t: "llmResult", id, ok: false, error: "The rulers are not answering right now" });
      });
  };
}
