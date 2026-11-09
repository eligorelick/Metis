import "server-only";
import { getConfig } from "@/config/env";
import { readAiStore, withAiStore } from "./store";
import { chatGptPending } from "./chatgpt";
import { claudeExecutable } from "./claude";
import { getWritableSettingsAuthority } from "@/settings/settings";
import { buildAnalysisRoute, type AnalysisRoute } from "./analysisRoute";
import { CHATGPT_EFFORTS, chatGptFastOffered, validModelId, type ChatGptEffort, type AiConnectionsView, type AiSelection } from "./contracts";

export function captureAiSelection(): AiSelection {
  // Existing API installations retain their explicitly configured key route;
  // once a connection choice is saved, it is authoritative even after sign-out.
  const store = readAiStore();
  const selection: AiSelection = store && !store.selectionIsDefault ? store.selection : { provider: getConfig().hasAnthropicKey ? "anthropic" : "none" };
  // SEC-205: legacy saved Fast must match the Standard speed shown in Settings.
  return selection.provider === "chatgpt" && selection.serviceTier === "fast" && !chatGptFastOffered(selection.model)
    ? { ...selection, serviceTier: "default" } : selection;
}

export function selectionIsConnected(selection: AiSelection): boolean {
  if (selection.provider === "none") return false;
  if (selection.provider === "anthropic") return getConfig().hasAnthropicKey;
  const store = readAiStore();
  if (selection.provider === "claude") return store?.claude?.id === selection.connectionId && store.claude.connected && claudeExecutable() !== null;
  if (selection.provider === "chatgpt") return store?.profiles.some((p) => p.id === selection.connectionId && p.tokens?.scopes.includes("chatgpt.tokens.use.direct")) ?? false;
  // A selection saved for the removed Gemini CLI route is never connected.
  return false;
}

/** The route a report would run on right now: the same selection and settings the job runner captures. */
export function describeAnalysisRoute(): AnalysisRoute {
  const selection = captureAiSelection();
  return buildAnalysisRoute(selection, selectionIsConnected(selection), getWritableSettingsAuthority().state);
}

export function connectionsView(): AiConnectionsView {
  const store = readAiStore();
  return { selectionIsDefault: !store || store.selectionIsDefault === true, selection: captureAiSelection(), hasAnthropicKey: getConfig().hasAnthropicKey,
    claudeInstalled: claudeExecutable() !== null,
    pending: chatGptPending(),
    connections: [
      ...(store?.profiles ?? []).map((p, index) => ({ id: p.id, provider: "chatgpt" as const, label: `${p.email ?? "ChatGPT account"} · connection ${index + 1}`, connected: !!p.tokens, planEnabled: p.tokens?.scopes.includes("chatgpt.tokens.use.direct") ?? false })),
      ...(store?.claude ? [{ id: store.claude.id, provider: "claude" as const, label: "Your local Claude Code account", connected: store.claude.connected, planEnabled: store.claude.connected }] : []),
    ] };
}

export async function selectConnection(input: unknown): Promise<void> {
  if (!input || typeof input !== "object") throw new Error("Invalid AI selection");
  const s = input as Record<string, unknown>;
  if (s.provider === "none" || s.provider === "anthropic") {
    await withAiStore((store) => { store.selection = { provider: s.provider as "none" | "anthropic" }; delete store.selectionIsDefault; }); return;
  }
  if ((s.provider !== "chatgpt" && s.provider !== "claude") || typeof s.connectionId !== "string" || !validModelId(s.model)) throw new Error("Choose a connection and a valid model");
  if (s.effort !== undefined && ((s.provider !== "chatgpt" && s.provider !== "claude") || !CHATGPT_EFFORTS.includes(s.effort as ChatGptEffort))) throw new Error("Choose a supported reasoning effort");
  if (s.serviceTier !== undefined && (s.provider !== "chatgpt" || (s.serviceTier !== "default" && s.serviceTier !== "fast"))) throw new Error("Choose Standard or Fast for ChatGPT");
  if (s.serviceTier === "fast" && !chatGptFastOffered(s.model)) throw new Error("OpenAI does not offer Fast for this model. Choose Standard, or a model OpenAI lists for Fast.");
  const selection: AiSelection = { provider: s.provider, connectionId: s.connectionId, model: s.model,
    ...(s.effort === undefined ? {} : { effort: s.effort as ChatGptEffort }),
    ...(s.serviceTier === undefined ? {} : { serviceTier: s.serviceTier as "default" | "fast" }),
  };
  await withAiStore((store) => {
    const connected = selection.provider === "claude" ? store.claude?.id === selection.connectionId && store.claude.connected && claudeExecutable() !== null
      : store.profiles.some((p) => p.id === selection.connectionId && p.tokens?.scopes.includes("chatgpt.tokens.use.direct"));
    if (!connected) throw new Error("Connect this account before selecting it");
    store.selection = selection;
    delete store.selectionIsDefault;
  });
}
