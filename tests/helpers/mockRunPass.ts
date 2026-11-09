/**
 * MockRunPass — drives the Stage C passes in tests without a live API.
 * Moved here from src/pipeline/stageC/passes.ts: no product code uses it.
 */
import type {
  PassErrorLike,
  PassMessage,
  PassUsage,
  RunPassArgs,
  RunPassFn,
  RunPassStreamingFn,
} from "@/pipeline/stageC/passes";
import type { ProviderExecution } from "@/report/execution";
import type { ManifestEntry } from "@/types/core";

/** A queued mock response: a structured JSON output, RAW text, or a typed failure. */
export type MockResponse =
  | { kind: "json"; value: unknown; costUsd?: number; webSearches?: number; fetchedUrls?: string[]; model?: string; fallbackUsed?: boolean; execution?: ProviderExecution }
  | { kind: "text"; text: string; costUsd?: number; webSearches?: number; fetchedUrls?: string[]; model?: string; fallbackUsed?: boolean; execution?: ProviderExecution }
  | { kind: "error"; error: PassErrorLike; gap?: ManifestEntry };

/**
 * A MockRunPass drives {@link RunPassFn} without a live API. Responses are
 * matched by the request's `field` (so bull/bear/judge/verify get the right
 * output) with a FIFO fallback queue for unmatched fields. Records every call
 * for assertions.
 */
export class MockRunPass {
  readonly calls: RunPassArgs[] = [];
  private readonly byField = new Map<string, MockResponse[]>();
  private readonly queue: MockResponse[] = [];

  /** Queue a response for a specific pass field (e.g. "llm.bull"). */
  on(field: string, resp: MockResponse): this {
    const list = this.byField.get(field) ?? [];
    list.push(resp);
    this.byField.set(field, list);
    return this;
  }

  /** Queue a fallback response (used when no field-specific response remains). */
  enqueue(resp: MockResponse): this {
    this.queue.push(resp);
    return this;
  }

  /** Convenience: queue a JSON output for a field. */
  onJson(field: string, value: unknown, over: Partial<Extract<MockResponse, { kind: "json" }>> = {}): this {
    return this.on(field, { kind: "json", value, ...over });
  }

  /** Convenience: queue RAW response text (unparseable/malformed-output cases). */
  onText(field: string, text: string, over: Partial<Extract<MockResponse, { kind: "text" }>> = {}): this {
    return this.on(field, { kind: "text", text, ...over });
  }

  /** The injectable RunPassFn. */
  readonly runPass: RunPassFn = async (args) => {
    this.calls.push(args);
    const field = args.field ?? "";
    const list = this.byField.get(field);
    const resp = (list && list.shift()) ?? this.queue.shift();
    if (!resp) {
      return {
        ok: false,
        gap: { field, reason: `MockRunPass: no response queued for ${field}`, severity: "critical" },
        error: { kind: "refusal", message: `no mock response for ${field}` },
      };
    }
    if (resp.kind === "error") {
      return {
        ok: false,
        gap: resp.gap ?? { field, reason: resp.error.message, severity: "critical" },
        error: resp.error,
      };
    }
    const usage: PassUsage = {
      input_tokens: 1000,
      output_tokens: 1000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      server_tool_use: resp.webSearches ? { web_search_requests: resp.webSearches } : null,
    };
    const message: PassMessage = {
      content: [
        { type: "text", text: resp.kind === "text" ? resp.text : JSON.stringify(resp.value) },
      ],
      usage,
      model: resp.model ?? args.model,
      stop_reason: "end_turn",
    };
    return {
      ok: true,
      value: {
        data: {
          message,
          fetchedUrls: resp.fetchedUrls ?? [],
          usage,
          costUsd: resp.costUsd ?? 0,
          fallbackUsed: resp.fallbackUsed ?? false,
          model: resp.model ?? args.model,
          ...(resp.execution === undefined ? {} : { execution: resp.execution }),
        },
      },
    };
  };

  /** A streaming runner backed by the same queue (firstToken resolves immediately). */
  readonly runPassStreaming: RunPassStreamingFn = (args) => {
    const result = this.runPass(args);
    return { firstToken: Promise.resolve("streamEvent"), result };
  };
}
