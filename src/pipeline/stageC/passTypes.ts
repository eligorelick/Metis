/**
 * The Stage C pass contract, split out of passes.ts: usage, message and outcome shapes, the
 * run-pass request and streaming function types, the injected dependencies and the pass result.
 * Types only.
 * Governed by P18 (models never author a number) and P23 (paid work is bounded).
 */

import type { ManifestEntry } from "@/types/core";
import { type SectionEvidence } from "@/pipeline/stageC/continuation";
import { type ProviderExecution } from "@/report/execution";
import { type JudgeProtocolDraft } from "@/pipeline/stageC/judgeProtocol";
import type { JudgeOrderSetting } from "@/report/schema";
import { type AnalystResearch } from "@/pipeline/jobArtifacts";

/* ------------------------------------------------------------------------ *
 * Injected runPass contract — the STRUCTURAL subset of the provider's API this
 * module depends on. The real src/providers/anthropic.ts exports match this;
 * tests pass a mock (see tests/helpers/mockRunPass.ts).
 * ------------------------------------------------------------------------ */

/** Minimal usage shape the cost accounting + verification need. */
export interface PassUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number } | null;
}

/** Minimal message shape: content blocks (text carries the structured JSON). */
export interface PassMessage {
  content: ReadonlyArray<{ type: string; text?: string }>;
  usage: PassUsage;
  model: string;
  stop_reason?: string | null;
}

/** The success branch of the provider's Sourced<PassOutcome>. */
export interface PassOutcomeLike {
  fetchedSources?: AnalystResearch["sources"];
  /** Text of every billed research message with cited URLs (Anthropic); the final message's text otherwise. */
  researchText?: string;
  presumed?: boolean;
  execution?: ProviderExecution;
  message: PassMessage;
  fetchedUrls?: string[];
  usage: PassUsage;
  costUsd: number;
  fallbackUsed: boolean;
  model: string;
}

/** Structural mirror of the provider's typed PassError (kinds incl. the
 * Stage-C-fabricated parse/schema/transport — see PassErrorKind docs). */
export interface PassErrorLike {
  research?: AnalystResearch;
  providerFailure?: import("@/ai/providerFailure").ProviderFailure;
  presumed?: boolean;
  execution?: ProviderExecution;
  kind:
    | "no_key"
    | "refusal"
    | "max_tokens"
    | "context_window"
    | "paused"
    | "parse"
    | "schema"
    | "preflight"
    | "section_budget"
    | "transport";
  message: string;
  maxTokens?: number;
  /** Usage/cost from a failed provider attempt, when the provider billed it. */
  usage?: PassUsage;
  costUsd?: number;
  fallbackUsed?: boolean;
  model?: string;
  webSearches?: number;
  /** Internal sequencing marker: the pass never crossed the provider boundary. */
  notLaunched?: boolean;
  /** The caller aborted the request; the provider did not fail it. */
  aborted?: boolean;
  /**
   * Answer text streamed before the response ended without completing. Never
   * itself a successful pass; section recovery may retain it only after the
   * corresponding output validates (see stageC/continuation.ts).
   */
  partialText?: string;
  sectionRequestsUsed?: number;
  sectionMaxKeys?: number;
  /** A cutoff is recoverable only when this attempt accepted new valid sections. */
  sectionProgress?: boolean;
  /** The whole validated object was rejected by a later semantic check. */
  repairRejectedComplete?: boolean;
}

/** Structural mirror of the provider's RunPassResult. */
export type RunPassOutcome =
  | { ok: true; value: { data: PassOutcomeLike } }
  | { ok: false; gap: ManifestEntry; error: PassErrorLike };

/**
 * Structural mirror of the provider's `BetaTextBlockParam` — kept local (not
 * imported from the SDK) so this module stays provider-agnostic. Used to mark a
 * prompt-cache breakpoint: Anthropic caches everything in the `tools -> system
 * -> messages` prefix up to and including the block carrying `cache_control`
 * .
 */
export interface RunPassContentBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral"; ttl?: "5m" | "1h" } | null;
}

/** Options mirror of the provider's RunPassOptions (only what we set). */
export interface RunPassArgs {
  model: string;
  system: string;
  messages: { role: "user" | "assistant"; content: string | RunPassContentBlock[] }[];
  tools?: unknown[];
  outputSchema?: Record<string, unknown>;
  maxTokens: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  field?: string;
  signal?: AbortSignal;
  /**
   * Per-request cost admission for this pass (DECISIONS D-10). Opaque here:
   * the adapter hands it to the provider, which reserves and settles every
   * request it makes.
   */
  admission?: unknown;
  /** Reservation identity for the per-request maximum. */
  reservationPass?: "bull" | "bear" | "synthesize" | "verify";
  /**
   * Earlier interrupted section attempts: shrink subscription section batches
   * without changing the captured model, reasoning effort or speed.
   */
  sectionRetryCount?: number;
  sectionRequestsUsed?: number;
  sectionMaxKeys?: number;
  /** Durable recovery only; partial text is never a successful result. */
  onPartialText?: (text: string) => void;
}

/** The injected non-streaming runner. */
export type RunPassFn = (args: RunPassArgs) => Promise<RunPassOutcome>;

/** The injected streaming runner (bull-first-then-bear cache sequencing). */
export type FirstStreamEvent = "streamEvent" | "error" | "abort" | "end";
export interface StreamingHandleLike {
  firstToken: Promise<FirstStreamEvent>;
  result: Promise<RunPassOutcome>;
}
export type RunPassStreamingFn = (args: RunPassArgs) => StreamingHandleLike;

/**
 * Web-search tool factory (kept identical across passes for cache discipline).
 * Always receives the pass model: which tool variant is accepted is a registry
 * fact about that model (haiku rejects `web_search_20260318`), never a default.
 */
export type WebSearchToolFn = (maxUses: number, model: string) => unknown;

/** Everything the pass runners need injected. */
export interface PassDeps {
  runPass: RunPassFn;
  /** Synchronous finite-cost validation, run before a durable gate/provider call. */
  validateRunPass?: (args: RunPassArgs) => void;
  /** Optional streaming runner; when absent, runBullThenBear falls back to runPass. */
  runPassStreaming?: RunPassStreamingFn;
  /** Web-search tool factory; when absent, passes run without web search. */
  webSearchTool?: WebSearchToolFn;
  /** Analysis model id (already resolved). */
  model: string;
  /** Effort for analysis passes (default "high"). */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /**
   * Produce each structured response in parts (JUDGE_SECTION_PARTS /
   * ANALYST_SECTION_PARTS) because the connection closes any single response
   * at a time limit. Set for subscription connections; the paid API has no
   * such limit and keeps one request per pass.
   */
  sectionedOutput?: boolean;
  /** Bound paid synthesis separately; analyst streaming/cache overlap stays intact. */
  judgeSectionedOutput?: boolean;
  /** An explicit user retry gets a new allowance; automatic retries share one. */
  runGeneration?: number;
  sectionCheckpoint?: {
    load: (field: string) => Record<string, unknown>;
    /** D-116: each saved section's writer evidence; absent when the store keeps none. */
    loadEvidence?: (field: string) => Record<string, SectionEvidence>;
    save: (field: string, completed: Record<string, unknown>, evidence?: Record<string, SectionEvidence>) => void;
    /** Append-only observations remain auditable even if the worker dies before settlement. */
    record?: (field: string, telemetry: { model: string; usage: PassUsage; costUsd: number; execution?: ProviderExecution }) => void;
  };
  /** One job-scoped cancellation/deadline signal. */
  signal?: AbortSignal;
  /** Per-request cost admission, by pass (DECISIONS D-10). */
  admissionFor?: (pass: "bull" | "bear" | "synthesize" | "verify") => unknown;
  // D-20 begin.
  /**
   * Per-job seed the judge's case order is drawn from — the job id in
   * production. Absent in tests and in the standalone
   * {@link runJudgeVerifyAssemble} path, which fall back to the payload
   * fingerprint so the draw stays deterministic and reproducible either way.
   */
  jobSeed?: string;
  /**
   * `METIS_JUDGE_ORDER`. Absent means "read the environment", which is what
   * production does; tests pass it explicitly so no test depends on env state.
   */
  judgeOrder?: JudgeOrderSetting;
  // D-20 end.
}

/* ------------------------------------------------------------------------ *
 * Pass result envelope
 * ------------------------------------------------------------------------ */

/** Successful pass output plus its usage/cost provenance. */
export interface PassResult<T> {
  research?: AnalystResearch;
  presumed?: boolean;
  execution?: ProviderExecution;
  output: T;
  usage: PassUsage;
  costUsd: number;
  fallbackUsed: boolean;
  model: string;
  /** Web searches this pass consumed (0 for judge/verify). */
  webSearches: number;
  /** Canonical URLs returned by successful web-search result blocks. */
  fetchedUrls: string[];
  /**
   * D-20: how the adversarial stage ran (case order, seed, per-side
   * lengths and self-assessments, `both`-mode reconciliation). Set ONLY by the
   * judge pass; every other pass leaves it undefined.
   */
  judgeProtocol?: JudgeProtocolDraft;
}

/**
 * A pass runner never throws for an expected LLM outcome — it returns this
 * discriminated result. `ok:false` carries the typed error + gap so the
 * orchestrator can file a ManifestEntry and continue (dry-run / refusal).
 *
 * `validationError` is set ONLY when the failure is a schema-validation failure
 * of otherwise-received structured output (as opposed to no-key/transport). The
 * retry loop feeds it back to the model; a transport/no-key failure (no
 * `validationError`) is not retryable.
 */
export type PassRun<T> =
  | { ok: true; result: PassResult<T> }
  | {
      ok: false;
      gap: ManifestEntry;
      error: PassErrorLike;
      validationError?: string;
      /**
       * Raw text of a received-but-invalid output (set alongside
       * validationError). Fed back on judge retries so the model repairs its
       * previous JSON instead of regenerating from scratch — the difference
       * between converging and re-rolling the dice on weaker models.
       */
      rawText?: string;
      /** Section response bytes retained for diagnosis, separately from accepted recovery. */
      rejectedText?: string;
      /** How a received-but-rejected response ended ({@link responseShapeText}). */
      responseShape?: string;
      presumed?: boolean;
      execution?: ProviderExecution;
      usage?: PassUsage;
      costUsd?: number;
      fallbackUsed?: boolean;
      model?: string;
      webSearches?: number;
    };
