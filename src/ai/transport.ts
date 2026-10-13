import "server-only";
import type { RunPassArgs, RunPassOutcome } from "@/pipeline/stageC/passes";
import { chatGptAccess, trackChatGptRequest, chatGptConnected } from "./chatgpt";
import { runGemini } from "./gemini";
import { CHATGPT_EFFORTS, parseSubscriptionModel, subscriptionModel, validModelId, type ChatGptEffort, type ChatGptModelChoice, type ChatGptRunOptions } from "./contracts";

// Counts every streamed byte (lifecycle events echo the request), not just the answer text.
const MAX_RESPONSE_BYTES = 16_000_000;
/** Upper bound on the partial answer text kept from a stream that ended early. */
const MAX_PARTIAL_TEXT_CHARS = 1_000_000;
interface ChatGptObservation {
  model?: string;
  usage?: { input_tokens: number; output_tokens: number };
  effort?: ChatGptEffort;
  serviceTier?: string;
  /**
   * Answer text streamed before the response ended without completing (the
   * plan endpoint closes a response at 15 minutes). Never treated as a
   * successful pass: the caller may only keep the sections it can validate.
   */
  partialText?: string;
}
class ChatGptStreamError extends Error {
  constructor(message: string, readonly observed: ChatGptObservation) { super(message); }
}
function chatGptFailure(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const { code, param } = error as Record<string, unknown>;
  if (code === "subscription_sharing_usage_limit_exceeded" || code === "subscription_sharing_usage_unavailable") return "ChatGPT plan usage is unavailable or exhausted. Check your account allowance. No paid fallback was attempted.";
  if (param === "service_tier") return "ChatGPT did not accept the selected speed. Choose Standard or a model/account with Fast access. No paid fallback was attempted.";
  if (param === "reasoning.effort") return "ChatGPT did not accept the selected reasoning effort. Choose Provider default or a supported effort.";
  if (code === "model_not_found" || param === "model") return "ChatGPT did not grant access to the selected model. Refresh the account model list or choose another model. No paid fallback was attempted.";
  return null;
}
/** Short, sanitized provider error code for diagnostics (never the request or any payload text). */
function providerErrorDetail(failure: unknown, event: { type?: unknown; response?: { incomplete_details?: { reason?: unknown } } }): string {
  const code = failure && typeof failure === "object" ? (failure as Record<string, unknown>).code : undefined;
  const reason = event.response?.incomplete_details?.reason;
  const parts = [event.type, code, reason].filter((v): v is string => typeof v === "string" && /^[\w.-]{1,60}$/.test(v));
  return parts.length ? ` (${parts.join(": ")})` : "";
}
export function subscriptionMessages(args: RunPassArgs) {
  const evidenceRule = "Use only evidence in the supplied research payload. Web search is unavailable for this connection. Do not invent URLs or claim you fetched a source. Return JSON only, without Markdown fences.";
  // The schema rides in the developer message, not as a trailing user turn: a
  // response produced in parts ends with "return ONLY these sections now",
  // and a trailing "must match the full schema" turn would contradict it.
  const schemaRule = args.outputSchema
    ? `\n\nThe complete response object must match this JSON schema. When a later instruction asks for only some top-level sections, return only those sections, each matching its part of the schema:\n${JSON.stringify(args.outputSchema)}`
    : "";
  return [
    { role: "developer", content: `${args.system}\n\n${evidenceRule}${schemaRule}` },
    ...args.messages.map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : m.content.map((b) => b.text).join("\n") })),
  ];
}

/** A terminal completed event is mandatory; partial JSON is never a successful pass. */
export async function consumeChatGptStream(response: Response): Promise<{ text: string; model: string; input: number; output: number; effort?: ChatGptEffort; serviceTier?: string }> {
  if (!response.ok) {
    const failure = await response.json().catch(() => null);
    const reason = chatGptFailure(failure?.error);
    if (reason) throw new Error(reason);
  }
  if (!response.ok || !response.body) throw new Error(response.status === 429
    ? "ChatGPT usage allowance is exhausted. No paid fallback was attempted."
    : response.status === 401 || response.status === 403 ? "ChatGPT connection needs authorization or model access."
      : "ChatGPT could not start the report pass.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = ""; let bytes = 0;
  const completedItems = new Map<number, unknown>();
  const observed: ChatGptObservation = {};
  // Answer-text deltas by output index. Only ever surfaced on a FAILED stream,
  // as `partialText`; a completed pass still reads the completed items.
  const textDeltas = new Map<number, string[]>();
  const excludedIndices = new Set<number>();
  let partialChars = 0;
  const notePartial = (): void => {
    if (textDeltas.size === 0) return;
    observed.partialText = [...textDeltas].sort(([a], [b]) => a - b).map(([, parts]) => parts.join("")).join("\n");
  };
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new Error("ChatGPT response exceeded the local size limit");
      // Normalize after appending: a CR/LF pair can straddle network chunks.
      buffer = (buffer + decoder.decode(chunk.value, { stream: true })).replace(/\r\n/g, "\n");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        const raw = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        if (!raw || raw === "[DONE]") continue;
        const event = JSON.parse(raw);
        const responseData = event.response;
        if (responseData && typeof responseData === "object") {
          if (validModelId(responseData.model)) observed.model = responseData.model;
          const usage = responseData.usage;
          if (Number.isSafeInteger(usage?.input_tokens) && Number.isSafeInteger(usage?.output_tokens) && usage.input_tokens >= 0 && usage.output_tokens >= 0) {
            observed.usage = { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens };
          }
          if (CHATGPT_EFFORTS.includes(responseData.reasoning?.effort)) observed.effort = responseData.reasoning.effort;
          if (["default", "fast", "priority", "flex", "scale", "ultrafast"].includes(responseData.service_tier)) observed.serviceTier = responseData.service_tier;
        }
        // OAuth can put the full answer only in output_item.done and return an
        // empty terminal output array. Keep completed items by index, never
        // accept uncompleted deltas, and still require response.completed.
        if (event.type === "response.output_item.done" && Number.isSafeInteger(event.output_index) && event.output_index >= 0 && event.output_index < 10_000) {
          completedItems.set(event.output_index, event.item);
        }
        // An item announced as anything but the final answer (commentary,
        // reasoning) never contributes partial text.
        if (event.type === "response.output_item.added" && Number.isSafeInteger(event.output_index)) {
          const item = event.item as { type?: string; phase?: string } | undefined;
          if (item?.type !== "message" || (item.phase !== undefined && item.phase !== "final_answer")) {
            excludedIndices.add(event.output_index);
            textDeltas.delete(event.output_index);
          }
        }
        if (event.type === "response.output_text.delta" && typeof event.delta === "string" &&
            Number.isSafeInteger(event.output_index) && !excludedIndices.has(event.output_index) &&
            partialChars + event.delta.length <= MAX_PARTIAL_TEXT_CHARS) {
          const parts = textDeltas.get(event.output_index) ?? [];
          parts.push(event.delta);
          textDeltas.set(event.output_index, parts);
          partialChars += event.delta.length;
        }
        if (["error", "response.failed", "response.incomplete"].includes(event.type)) {
          const failure = event.response?.error ?? event.error ?? event;
          throw new Error(chatGptFailure(failure) ?? `ChatGPT did not complete the pass${providerErrorDetail(failure, event)}. Check your model access and plan allowance. No paid fallback was attempted.`);
        }
        if (event.type === "response.completed") {
          const data = event.response;
          if (data?.status !== "completed" || !Array.isArray(data.output)) throw new Error("Invalid completed ChatGPT response");
          const streamed = data.output.length === 0;
          const output: unknown[] = streamed ? [...completedItems].sort(([a], [b]) => a - b).map(([, item]) => item) : data.output;
          const text = output.flatMap((value) => {
            if (!value || typeof value !== "object") return [];
            const item = value as { type?: string; role?: string; status?: string; phase?: string; content?: unknown[] };
            if (item.type !== "message" || (item.role !== undefined && item.role !== "assistant") || (item.phase !== undefined && item.phase !== "final_answer") || (streamed ? item.status !== "completed" : item.status !== undefined && item.status !== "completed") || !Array.isArray(item.content)) return [];
            return item.content.flatMap((part) => {
              if (!part || typeof part !== "object") return [];
              const content = part as { type?: string; text?: unknown };
              return content.type === "output_text" && typeof content.text === "string" ? [content.text] : [];
            });
          }).join("\n");
          if (!validModelId(data.model)) throw new Error("ChatGPT response omitted a valid model identifier");
          if (!text.trim()) throw new Error("ChatGPT returned no usable report content");
          const usage = data.usage;
          if (!Number.isSafeInteger(usage?.input_tokens) || !Number.isSafeInteger(usage?.output_tokens) || usage.input_tokens < 0 || usage.output_tokens < 0) throw new Error("ChatGPT response omitted valid usage accounting");
          return { text, model: data.model, input: usage.input_tokens, output: usage.output_tokens,
            ...(CHATGPT_EFFORTS.includes(data.reasoning?.effort) ? { effort: data.reasoning.effort as ChatGptEffort } : {}),
            ...(["default", "fast", "priority", "flex", "scale", "ultrafast"].includes(data.service_tier) ? { serviceTier: data.service_tier as string } : {}),
          };
        }
      }
    }
    throw new Error("ChatGPT stream ended before completion");
  } catch (error) {
    const reason = error instanceof Error && /^(ChatGPT|Invalid completed)/.test(error.message) ? error.message : "ChatGPT stream failed or was canceled. No paid fallback was attempted.";
    notePartial();
    throw new ChatGptStreamError(reason, observed);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function listChatGptModels(id: string): Promise<ChatGptModelChoice[]> {
  const tracked = trackChatGptRequest(id);
  try {
    const access = await chatGptAccess(id);
    tracked.signal.throwIfAborted();
    if (!chatGptConnected(id)) throw new Error("ChatGPT connection is signed out");
    const response = await fetch("https://api.openai.com/v1/models", { cache: "no-store", headers: { Authorization: `Bearer ${access}` }, redirect: "error", signal: AbortSignal.any([tracked.signal, AbortSignal.timeout(20_000)]) });
    if (!response.ok) throw new Error("ChatGPT model catalog is unavailable; reconnect or retry later");
    const data = await response.json();
    if (!Array.isArray(data.models)) throw new Error("Unexpected ChatGPT model catalog");
    const seen = new Set<string>();
    return data.models.flatMap((m: unknown): ChatGptModelChoice[] => {
      if (!m || typeof m !== "object") return [];
      const item = m as Record<string, unknown>;
      if (item.visibility !== "list" || !validModelId(item.slug) || seen.has(item.slug)) return [];
      seen.add(item.slug);
      const levels = Array.isArray(item.supported_reasoning_levels) ? item.supported_reasoning_levels : [];
      const efforts = levels.flatMap((level: unknown): ChatGptEffort[] => {
        const effort = typeof level === "string" ? level : level && typeof level === "object" ? (level as Record<string, unknown>).effort : undefined;
        return CHATGPT_EFFORTS.includes(effort as ChatGptEffort) ? [effort as ChatGptEffort] : [];
      });
      return [{ id: item.slug, name: typeof item.display_name === "string" && item.display_name.trim() ? item.display_name : item.slug,
        ...(efforts.length ? { efforts: [...new Set(efforts)] } : {}),
      }];
    });
  } finally { tracked.release(); }
}

export async function runSubscriptionPass(args: RunPassArgs, connectionId: string, options: ChatGptRunOptions = {}): Promise<RunPassOutcome> {
  const parsed = parseSubscriptionModel(args.model);
  if (!parsed) throw new Error("Invalid subscription provider model");
  const field = args.field ?? "llm";
  const messages = subscriptionMessages(args);
  try {
    args.signal?.throwIfAborted();
    let result: { text: string; model: string; input: number; output: number; effort?: ChatGptEffort; serviceTier?: string; observedModels?: string[] };
    if (parsed.provider === "chatgpt") {
      const tracked = trackChatGptRequest(connectionId, args.signal);
      try {
        const access = await chatGptAccess(connectionId);
        tracked.signal.throwIfAborted();
        if (!chatGptConnected(connectionId)) throw new Error("ChatGPT connection is signed out");
        result = await consumeChatGptStream(await fetch("https://api.openai.com/v1/responses", {
          method: "POST", redirect: "error", signal: AbortSignal.any([tracked.signal, AbortSignal.timeout(45 * 60_000)]),
          headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
          // The plan-usage preview does not accept max_output_tokens or temperature.
          body: JSON.stringify({ model: parsed.model, input: messages, store: false, stream: true,
            ...(options.effort === undefined ? {} : { reasoning: { effort: options.effort } }),
            // Prompt-only JSON intermittently produced unescaped quotes in long judge
            // output, so JSON mode is requested too. The endpoint accepts it but has
            // still returned invalid JSON on large reports, so the caller's parse and
            // schema validation (and their retries) remain the real guard.
            ...(args.outputSchema ? { text: { format: { type: "json_object" } } } : {}),
            service_tier: options.serviceTier ?? "default",
          }),
        }));
      } finally { tracked.release(); }
    } else {
      result = await runGemini(connectionId, parsed.model, messages.map((m) => `${m.role}:\n${m.content}`).join("\n\n"), args.signal);
    }
    const usage = { input_tokens: result.input, output_tokens: result.output };
    const model = subscriptionModel(parsed.provider, result.model);
    return { ok: true, value: { data: { model, usage, costUsd: 0, fallbackUsed: false, fetchedUrls: [],
      execution: { requestedModel: args.model, requestedEffort: parsed.provider === "chatgpt" ? options.effort ?? null : null,
        modelObserved: true, usageReported: true,
        effectiveEffort: result.effort ?? null,
        ...(result.observedModels === undefined ? {} : { observedModels: result.observedModels }),
        ...(parsed.provider === "chatgpt" ? { requestedServiceTier: options.serviceTier ?? "default", effectiveServiceTier: result.serviceTier ?? null } : {}),
      },
      message: { model, usage, stop_reason: "end_turn", content: [{ type: "text", text: result.text.replace(/^\s*```(?:json)?\s*\n([\s\S]*?)\n```\s*$/, "$1") }] } } } };
  } catch (error) {
    const observed = error instanceof ChatGptStreamError ? error.observed : undefined;
    const reason = error instanceof Error && /^(ChatGPT|Gemini|Invalid completed|Invalid subscription)/.test(error.message)
      ? error.message : `${parsed.provider} pass failed or was canceled. No paid fallback was attempted.`;
    return { ok: false, gap: { field, reason, severity: "critical", attemptedSources: [parsed.provider] },
      error: { kind: "transport", message: reason, model: observed?.model ? subscriptionModel(parsed.provider, observed.model) : args.model, costUsd: 0, fallbackUsed: false, aborted: args.signal?.aborted === true,
        ...(observed?.usage ? { usage: observed.usage } : {}),
        ...(observed?.partialText ? { partialText: observed.partialText } : {}),
        execution: { requestedModel: args.model, requestedEffort: parsed.provider === "chatgpt" ? options.effort ?? null : null, effectiveEffort: observed?.effort ?? null,
          modelObserved: observed?.model !== undefined, usageReported: observed?.usage !== undefined,
          ...(parsed.provider === "chatgpt" ? { requestedServiceTier: options.serviceTier ?? "default", effectiveServiceTier: observed?.serviceTier ?? null } : {}),
        },
      } };
  }
}
