// LLM-driven rivals (filled in by the LLM phase).
import type { Hub } from "./hub";

export interface LlmClient {
  complete(messages: { role: "system" | "user" | "assistant"; content: string }[], opts?: { json?: boolean; maxTokens?: number }): Promise<string>;
}

export function createLlmClient(): LlmClient | null {
  return null;
}

export function attachLlm(hub: Hub, llm: LlmClient): void {
  void hub;
  void llm;
}
