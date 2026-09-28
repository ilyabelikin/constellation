// Single-player games run in the browser, but their rival rulers' words come
// from the game server (which holds the model API key). This transport sends
// knowledge-limited briefings there and waits for the validated answers.

import type { LlmTransport } from "../llm/director";
import type { DecideRequest, DirectiveReply, TalkReply, TalkRequest } from "../llm/types";
import type { NetClient } from "./NetClient";
import type { ServerMessage } from "./protocol";

type Result = Extract<ServerMessage, { t: "llmResult" }>;

export class NetLlmTransport implements LlmTransport {
  private nextId = 1;
  private pending = new Map<number, (m: Result | null) => void>();
  private off: () => void;

  constructor(
    private net: NetClient,
    private timeoutMs = 60_000,
  ) {
    this.off = net.on("llmResult", (m) => {
      const done = this.pending.get(m.id);
      this.pending.delete(m.id);
      done?.(m);
    });
  }

  dispose(): void {
    this.off();
    for (const done of this.pending.values()) done(null);
    this.pending.clear();
  }

  private request(msg: { kind: "decide"; req: DecideRequest } | { kind: "talk"; req: TalkRequest }): Promise<Result | null> {
    if (!this.net.welcomed || !this.net.llmAvailable) return Promise.resolve(null);
    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(null);
      }, this.timeoutMs);
      this.pending.set(id, (m) => {
        clearTimeout(timer);
        resolve(m);
      });
      this.net.send({ t: "llm", id, ...msg } as never);
    });
  }

  async decide(req: DecideRequest): Promise<DirectiveReply | null> {
    const m = await this.request({ kind: "decide", req });
    return m?.ok ? (m.decide ?? null) : null;
  }

  async talk(req: TalkRequest): Promise<TalkReply | null> {
    const m = await this.request({ kind: "talk", req });
    return m?.ok ? (m.talk ?? null) : null;
  }
}
