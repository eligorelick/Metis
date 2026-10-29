/**
 * Which AI route a report runs on. Pure and browser-safe: no credential
 * material is read here, so nothing a label could leak ever reaches it.
 * The server wrapper `describeAnalysisRoute()` lives in connections.ts.
 */
import { resolveRegistryModel } from "@/models/registry";
import { subscriptionModel, type AiSelection } from "./contracts";

export interface AnalysisRoute {
  provider: "anthropic" | "chatgpt" | "gemini" | "none";
  model: string | null;
  effort: string | null;
  ready: boolean;
  label: string;
}

/**
 * The model id the job runner asks for. A subscription selection pins its own
 * model; a Claude route uses the saved analysis model. The job runner and the
 * route description both call this, so they cannot disagree.
 */
export function requestedAnalysisModel(selection: AiSelection, claudeModel: string): string {
  return "connectionId" in selection ? subscriptionModel(selection.provider, selection.model) : claudeModel;
}

function claudeName(model: string): string {
  const entry = resolveRegistryModel(model)?.entry;
  return entry ? entry.displayName.replace(/^Claude /, "") : model;
}

export function buildAnalysisRoute(
  selection: AiSelection,
  ready: boolean,
  settings: { analysisModel: string; analysisEffort: string },
): AnalysisRoute {
  if (selection.provider === "none") {
    return { provider: "none", model: null, effort: null, ready: false, label: "AI off (data-only reports)" };
  }
  if (selection.provider === "anthropic") {
    const model = requestedAnalysisModel(selection, settings.analysisModel);
    // The request builder sends effort only where the registry says the model accepts it (Haiku 4.5 does not).
    const effort = resolveRegistryModel(model)?.entry.effort.supported === true ? settings.analysisEffort : null;
    const label = effort === null ? `Claude API · ${claudeName(model)}` : `Claude API · ${claudeName(model)} · ${effort} effort`;
    return { provider: "anthropic", model, effort, ready, label: ready ? label : `${label} · key needed` };
  }
  const name = selection.provider === "chatgpt" ? "ChatGPT plan" : "Gemini";
  const effort = selection.provider === "chatgpt" ? selection.effort ?? null : null;
  if (!ready) return { provider: selection.provider, model: selection.model, effort, ready, label: `${name} · sign-in needed` };
  const parts = [name, selection.model];
  if (effort) parts.push(`${effort} effort`);
  if (selection.provider === "chatgpt" && selection.serviceTier === "fast") parts.push("Fast");
  return { provider: selection.provider, model: selection.model, effort, ready, label: parts.join(" · ") };
}
