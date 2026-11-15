/**
 * The Stage C passes contract the job runner consumes, split out of jobRunner.ts: the structural
 * pass result, billed-attempt and usage shapes, the injected PipelinePasses bundle and its hooks,
 * the durable launch-authority capability an adapter declares, and the report-assembly input.
 * Types, one constant and the typed bull/bear failure; no runtime state.
 */

import { type VerifyReservationCapability } from "@/providers/anthropic";
import { type EffortLevel } from "@/settings/settings";
import { type Report, type AnalystCase, type JudgeOutput, type ProvenanceCoverage, type ExecutionMetadataEntry } from "@/report/schema";
import { type ProviderExecution } from "@/report/execution";
import type { RequestAdmission } from "@/providers/anthropic";
import { type ComputedMetrics } from "@/pipeline/compute";
import { type ValidationReport } from "@/pipeline/stageA/validate";
import { type DataBundle } from "@/pipeline/types";
import { type PassContinuation } from "@/pipeline/stageC/continuation";
import { type DurablePass, type PassSettlementHook, type AnalystResearch, type RetainedVerificationText } from "@/pipeline/jobArtifacts";

/* ------------------------------------------------------------------------ *
 * PipelinePasses — injected Stage C contract (loose/structural types)
 * ------------------------------------------------------------------------ */

/**
 * Structural view of one LLM pass's result that the runner needs for cost
 * logging + running-total accounting. The real passes module returns a richer
 * object (its own PassResult<T>); this is the subset the runner reads. `data`
 * is the parsed structured output (AnalystCase / JudgeOutput / …). Everything
 * cost-related is optional so a mock or a degraded pass can omit it.
 */
export interface PassResultLike<T> {
  research?: AnalystResearch;
  presumed?: boolean;
  execution?: ProviderExecution;
  /** The parsed structured output for this pass. */
  data: T;
  /** Model that actually served the response (fallback model when one served). */
  model: string;
  /** Cost of this pass, USD. */
  costUsd: number;
  /** True when a server-side refusal fallback served the response. */
  fallbackUsed: boolean;
  /** Token usage of the pass (drives cost_log token columns; optional). */
  usage?: PassUsageLike;
  /** Number of web searches billed on this pass (cost_log column). */
  webSearches?: number;
  /** Canonical URLs observed in successful web-search result blocks. */
  fetchedUrls?: string[];
}

/** Billed telemetry from a pass attempt that did not produce valid output. */
export interface BilledPassAttempt {
  presumed?: boolean;
  execution?: ProviderExecution;
  model: string;
  costUsd: number;
  fallbackUsed: boolean;
  usage?: PassUsageLike;
  webSearches?: number;
}

/** Partial result/error payload for a combined bull+bear run. */
export interface BullBearPassFailureDetails {
  bull?: PassResultLike<AnalystCase>;
  bear?: PassResultLike<AnalystCase>;
  bullError?: string;
  bearError?: string;
  bullBilledAttempt?: BilledPassAttempt;
  bearBilledAttempt?: BilledPassAttempt;
  /** False only when cache sequencing prevented this provider pass from launching. */
  bullLaunched?: boolean;
  bearLaunched?: boolean;
  /**
   * True when the side's output was RECEIVED but rejected by the ANALYST_CASE
   * schema (or was not JSON) — the one failure class worth a repair attempt.
   * A transport failure, a refusal or a never-launched sibling is not.
   */
  bullRetryable?: boolean;
  bearRetryable?: boolean;
  /** Raw text of the rejected output, echoed back on the repair attempt. */
  bullRawText?: string;
  bearRawText?: string;
  /**
   * The failure kind the adapter classified the side with ("schema", "parse",
   * "transport", …). When the adapter did not settle the side itself, the
   * runner records this on the failure artifact so the discarded-attempt
   * disclosure reads the same whichever settlement path a run took.
   */
  bullFailureKind?: string;
  bearFailureKind?: string;
  /** Answer text a side streamed before the provider cut its response off. */
  bullPartialText?: string;
  bearPartialText?: string;
}

/**
 * Thrown by the concrete Stage C adapter when one analyst side succeeded and
 * the other failed. The runner can then log costs and mark bull/bear statuses
 * independently instead of flattening both rows into one generic error.
 */
export class BullBearPassFailure extends Error {
  readonly bull?: PassResultLike<AnalystCase>;
  readonly bear?: PassResultLike<AnalystCase>;
  readonly bullError?: string;
  readonly bearError?: string;
  readonly bullBilledAttempt?: BilledPassAttempt;
  readonly bearBilledAttempt?: BilledPassAttempt;
  readonly bullLaunched?: boolean;
  readonly bearLaunched?: boolean;
  readonly bullRetryable?: boolean;
  readonly bearRetryable?: boolean;
  readonly bullRawText?: string;
  readonly bearRawText?: string;
  readonly bullFailureKind?: string;
  readonly bearFailureKind?: string;
  readonly bullPartialText?: string;
  readonly bearPartialText?: string;

  constructor(message: string, details: BullBearPassFailureDetails) {
    super(message);
    this.name = "BullBearPassFailure";
    this.bull = details.bull;
    this.bear = details.bear;
    this.bullError = details.bullError;
    this.bearError = details.bearError;
    this.bullBilledAttempt = details.bullBilledAttempt;
    this.bearBilledAttempt = details.bearBilledAttempt;
    this.bullLaunched = details.bullLaunched;
    this.bearLaunched = details.bearLaunched;
    this.bullRetryable = details.bullRetryable;
    this.bearRetryable = details.bearRetryable;
    this.bullRawText = details.bullRawText;
    this.bearRawText = details.bearRawText;
    this.bullFailureKind = details.bullFailureKind;
    this.bearFailureKind = details.bearFailureKind;
    this.bullPartialText = details.bullPartialText;
    this.bearPartialText = details.bearPartialText;
  }
}

/** Structural subset of the SDK usage object the runner logs to cost_log. */
export interface PassUsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/**
 * Dependencies threaded into every pass: the resolved models + the assembled,
 * deterministic context payload. Kept generic (`TPayload`) so the runner does
 * not depend on the passes module's ContextPayload shape.
 */
export interface PassDeps<TPayload = unknown> {
  analysisModel: string;
  /** Explicit Retry generation; automatic recovery/restarts share its request allowance. */
  runGeneration?: number;
  /** Captured once for this job; never re-read global selection inside a pass. */
  connectionId?: string;
  subscriptionOptions?: { effort?: EffortLevel; serviceTier?: "default" | "fast" };
  /**
   * Per-request cost admission for a pass (DECISIONS D-10). The Stage C
   * adapter threads the returned object into every provider request the pass
   * makes, so each one is reserved before it is sent and settled with its own
   * usage. Absent in "pass" reservation mode and in mocks.
   */
  admissionFor?: (pass: DurablePass) => RequestAdmission | undefined;
  /** Exact launch identity, captured before a subscription request starts. */
  passAttemptFor?: (pass: DurablePass) => { jobId: string; runGeneration: number; attemptId: string } | undefined;

  /** One job-scoped cancellation/deadline signal shared by every provider pass. */
  signal?: AbortSignal;
  /**
   * `output_config.effort` for the passes (settings table → ANALYSIS_EFFORT
   * env → "high"). Optional so mocks/older callers omit it; the Stage C
   * adapter defaults to "high" when absent.
   */
  effort?: EffortLevel;
  payload: TPayload;
  /**
   * WS7 (D-20): per-job seed for the judge's bull/bear presentation order. The
   * runner passes the job id, so the order is random across reports and exactly
   * reproducible within one — a resume, a judge retry and the pre-launch request
   * validation all draw the same order. Optional so mocks may omit it; Stage C
   * then falls back to the payload fingerprint.
   */
  jobSeed?: string;
}

/** Result of the verification pass: a fully-traced Report + the rate + log. */
export interface VerifyPassResult {
  verifiedReport: Report;
  /** Fraction of traceable numbers verified, 0..1 (null when none to trace). */
  verificationRate: number | null;
  /** Explicit numeric/claim/judgment provenance metrics. */
  coverage?: ProvenanceCoverage;
  /** Cost of the verification pass, USD. */
  costUsd?: number;
  model?: string;
  fallbackUsed?: boolean;
  usage?: PassUsageLike;
  webSearches?: number;
  /** Verification-log entries (appendix.verificationLog on the final report). */
  log?: unknown;
}

/**
 * The Stage C pass bundle, dependency-injected into runJob(). A parallel agent
 * implements this in src/pipeline/stageC/passes.ts; the integrator passes an
 * instance in. Loose types by design — see the module JSDoc.
 */
export interface PipelinePasses<TPayload = unknown> {
  /**
   * Proves that every adapter method awaits the runner's durable launch-
   * authority callback at its immediate provider/logical execution boundary.
   * Adapters without this capability fail closed before model resolution.
   */
  launchAuthorityCapability?: typeof DURABLE_LAUNCH_AUTHORITY_CAPABILITY;
  /** Verify is provider-free only when this explicit capability says so. */
  verifyCapability?: VerifyReservationCapability;
  /**
   * Validate the exact forthcoming request against the finite provider bounds
   * before the runner acquires a paid lease. Production implements this for
   * every provider-backed pass; deterministic verify is a no-op.
   */
  preflightPass?(
    deps: PassDeps<TPayload>,
    request:
      | { pass: "bull" | "bear" }
      | {
          pass: "synthesize";
          bull: PassResultLike<AnalystCase>;
          bear: PassResultLike<AnalystCase>;
          validationFeedback?: string;
          continuation?: PassContinuation;
        }
      | {
          pass: "verify";
          judgeOutput: JudgeOutput;
          evidence: { fetchedUrls: string[]; retainedTexts?: readonly RetainedVerificationText[] };
        },
  ): void | Promise<void>;
  /**
   * Assemble the deterministic context payload (Stage B metrics + extracts +
   * transcript + filings + ownership + macro + manifest). No timestamps/UUIDs,
   * sorted keys (cache discipline).
   */
  assembleContextPayload(
    bundle: DataBundle,
    computed: ComputedMetrics,
    validation: ValidationReport,
  ): TPayload;

  /**
   * Stable hash of the deterministic payload (optional — mocks may omit it).
   * Stored with the bull/bear snapshots so a resume can detect that the
   * underlying data drifted between the original run and the retry.
   */
  fingerprintPayload?(payload: TPayload): string;

  /**
   * Bull pass first, then bear (bull's first streamed token warms the cache
   * before bear fires). Returns both analyst cases. The optional
   * hooks let the runner stamp REAL per-pass start/finish times — the passes
   * overlap in the streaming path, so timing cannot be inferred from around
   * the combined call.
   */
  runBullThenBear(
    deps: PassDeps<TPayload>,
    hooks?: AnalystPassHooks,
    settlements?: AnalystSettlementHooks,
  ): Promise<{ bull: PassResultLike<AnalystCase>; bear: PassResultLike<AnalystCase> }>;

  /**
   * Run ONE analyst side (partial resume: the sibling's persisted snapshot is
   * being reused, so only the missing side is re-billed). No cache-sequencing
   * concern — a lone pass writes its own cache entry. Optional: mocks and the
   * noop facade may omit it; the resume path then requires both snapshots.
   * Throws (with a `billedAttempt` when the attempt billed) on failure, same
   * contract as runJudgePass.
   *
   * With `validationFeedback` it is the REPAIR attempt for a side whose first
   * output was received but rejected by the schema: the same cached payload
   * turn plus a feedback turn carrying the error and the previous output,
   * exactly as runJudgePass repairs the judge.
   */
  runAnalystPass?(
    deps: PassDeps<TPayload>,
    side: "bull" | "bear",
    settlement?: PassSettlementHook<AnalystCase>,
    beforeProviderLaunch?: () => void | Promise<void>,
    validationFeedback?: string,
    /** Sections kept from a response the provider cut off; only the rest is requested. */
    continuation?: PassContinuation,
  ): Promise<PassResultLike<AnalystCase>>;

  /**
   * Audit 2026-10-22 D-3: split the sections kept from a cut-off response
   * into those that validate on their own and those the retry must write
   * again (a kept section overrides the retry's copy, so a bad one would fail
   * the merged output by construction). Optional: without it every kept
   * section is carried.
   */
  checkCarriedSections?(
    pass: "bull" | "bear" | "synthesize",
    sections: Record<string, unknown>,
  ): { kept: Record<string, unknown>; dropped: string[] };

  /** Judge/synthesis pass: bull + bear + payload → JudgeOutput (report minus meta/appendix). */
  runJudgePass(
    deps: PassDeps<TPayload>,
    bull: PassResultLike<AnalystCase>,
    bear: PassResultLike<AnalystCase>,
    validationFeedback?: string,
    settlement?: PassSettlementHook<JudgeOutput>,
    beforeProviderLaunch?: () => void | Promise<void>,
    /** Sections kept from a response the provider cut off; only the rest is requested. */
    continuation?: PassContinuation,
  ): Promise<PassResultLike<JudgeOutput>>;

  /** Verification pass: trace every numeric claim; returns the verified Report + rate. */
  runVerifyPass(
    deps: PassDeps<TPayload>,
    judgeOutput: JudgeOutput,
    evidence?: { fetchedUrls: string[]; retainedTexts?: readonly RetainedVerificationText[] },
    settlement?: PassSettlementHook<Report>,
    beforeProviderLaunch?: () => void | Promise<void>,
  ): Promise<VerifyPassResult>;

  /**
   * Assemble the final Report from the judge output + meta/appendix inputs. The
   * runner calls this to wrap the judge output when it needs a persistable
   * Report (the verify pass may also return one; the runner prefers the
   * verified report when present).
   */
  assembleReport(input: AssembleReportInput): Report;
}

/** Per-side lifecycle hooks for the combined bull+bear call (real timing). */
export interface AnalystPassHooks {
  /** Awaited paid-permit gate immediately before this provider side launches. */
  beforePass?: (side: "bull" | "bear") => void | Promise<void>;
  /**
   * Awaited, non-swallowed durable authority fence at the immediate provider
   * boundary. Timing/telemetry hooks below remain best-effort by design.
   */
  beforeProviderLaunch?: (side: "bull" | "bear") => void | Promise<void>;
  onPassStart?: (side: "bull" | "bear") => void;
  onPassFinish?: (side: "bull" | "bear") => void;
}

/** Awaited, durable per-side settlement callbacks (trailing/optional compatibility). */
export interface AnalystSettlementHooks {
  bull?: PassSettlementHook<AnalystCase>;
  bear?: PassSettlementHook<AnalystCase>;
}

/** Everything assembleReport() needs to wrap a JudgeOutput into a full Report. */
export interface AssembleReportInput {
  judgeOutput: JudgeOutput;
  bundle: DataBundle;
  computed: ComputedMetrics;
  validation: ValidationReport;
  meta: ReportMetaInput;
  verificationRate: number | null;
  verificationLog?: unknown;
  costBreakdown: { step: string; model: string; costUsd: number }[];
  /**
   * WS7 (D-20): the payload object identity the passes keyed their per-job
   * records on, so the unverified-fallback assembly can still recover the judge
   * order/length protocol the judge pass recorded. Opaque to the runner.
   */
  payload?: unknown;
}

/** Meta fields the runner owns (symbol/model/cost/asOfMap) . */
export interface ReportMetaInput {
  symbol: string;
  companyName: string;
  generatedAt: string;
  model: string;
  costUsd: number;
  verificationRate: number | null;
  asOfMap: Record<string, string>;
  execution?: ExecutionMetadataEntry[];
  runId?: string;
  startedAt?: string;
  completedAt?: string;
}

/** Adapter contract for the non-swallowed immediate pre-provider authority fence. */
export const DURABLE_LAUNCH_AUTHORITY_CAPABILITY = "durable-preprovider-v1" as const;
