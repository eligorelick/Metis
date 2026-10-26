/** Browser-safe connection and model identifiers. No credential fields. */
export type SubscriptionProvider = "chatgpt" | "gemini";
export const CHATGPT_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type ChatGptEffort = (typeof CHATGPT_EFFORTS)[number];
export interface ChatGptRunOptions {
  effort?: ChatGptEffort;
  serviceTier?: "default" | "fast";
}
/**
 * Models OpenAI's speed documentation lists for Fast with ChatGPT sign-in
 * (https://learn.chatgpt.com/docs/agent-configuration/speed, 2026-10-26):
 * GPT-6.1 Sol, GPT-6.1 Terra, GPT-6 Astra, GPT-6 Sol and GPT-6 Luna. Fast is
 * not offered for any other model, so Metis does not offer it either.
 */
export const CHATGPT_FAST_MODELS: readonly string[] = ["gpt-6.1-sol", "gpt-6.1-terra", "gpt-6-astra", "gpt-6-sol", "gpt-6-luna"];
export function chatGptFastOffered(model: string): boolean {
  return CHATGPT_FAST_MODELS.includes(model);
}
/** OpenAI's "Manage usage" destination for ChatGPT plan usage (Sign in with ChatGPT UI/UX guidelines). */
export const CHATGPT_MANAGE_USAGE_URL = "https://chatgpt.com/settings/usage";
export interface ChatGptModelChoice {
  id: string;
  name: string;
  efforts?: ChatGptEffort[];
}
export type AiSelection =
  | { provider: "none" }
  | { provider: "anthropic" }
  | ({ provider: SubscriptionProvider; connectionId: string; model: string } & ChatGptRunOptions);

export interface AiConnectionSummary {
  id: string;
  provider: SubscriptionProvider;
  label: string;
  connected: boolean;
  planEnabled: boolean;
}

export interface AiConnectionsView {
  selection: AiSelection;
  connections: AiConnectionSummary[];
  hasAnthropicKey: boolean;
  geminiInstalled: boolean;
  pending: { status: "waiting" | "connected" | "error"; message: string; url?: string } | null;
}

export function validModelId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value);
}

export function subscriptionModel(provider: SubscriptionProvider, model: string): string {
  if (!validModelId(model)) throw new Error("Invalid model identifier");
  return `${provider}/${model}`;
}

export function parseSubscriptionModel(value: string): { provider: SubscriptionProvider; model: string } | null {
  const match = /^(chatgpt|gemini)\/([a-zA-Z0-9][a-zA-Z0-9._-]{0,127})$/.exec(value);
  return match ? { provider: match[1] as SubscriptionProvider, model: match[2] } : null;
}
