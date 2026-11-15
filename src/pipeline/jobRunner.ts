/**
 * Stage C job runner — orchestrates the full report pipeline :
 *
 *   fetch → validate → compute → bull → bear → synthesize → verify
 *
 * (PIPELINE_STEPS from @/types/core, deterministic order.) After every step
 * transition it persists jobs.stepsJson (StepProgress[]) and emits a
 * "step-update" over the events bus; every LLM pass writes a cost_log row and
 * emits a "cost-update". On success it validates + persists the Report and
 * sets jobs.reportId + status "done"; on hard failure it records the error and
 * emits "error".
 *
 * Degrades gracefully with NO Anthropic key: runs fetch/validate/compute, marks
 * the four LLM steps "skipped" (reason `NO_KEY_SKIP_REASON`), and
 * persists a data-only Report stub (meta + appendix + empty graded sections
 * flagged) so the UI always has something to render. Missing data NEVER throws
 * (non-negotiable rule #4); a failed LLM step marks that step
 * "error" with detail and the runner still persists what it has.
 *
 * The Stage C passes (bull/bear/judge/verify + payload/report assembly) are
 * injected as a {@link PipelinePasses} bundle so this module does NOT import
 * src/pipeline/stageC/passes.ts at build time (keeps tsc green while a parallel
 * agent builds it; the integrator wires the real implementation in). The
 * interface uses loose/structural types — Report/JudgeOutput/AnalystCase come
 * from @/report/schema (which exists); ContextPayload/PassResult are generic so
 * there is no hard dependency on the passes module's concrete shapes.
 *
 * Server-only (imports @/db, @/config/env, @/providers/anthropic transitively
 * via settings/model resolution). Never import from a client component.
 */

import { withRetiredGapWording } from "@/report/retiredReaderWording";
import { PIPELINE_VERSION } from "@/report/versions";
import { createHash, randomUUID } from "node:crypto";
import { balanceIntegrityView } from "@/pipeline/balanceIntegrity";
import { withPrimaryCapitalBasis, primaryCapitalManifest } from "@/pipeline/primaryCapitalBasis";
import { bankRevenueManifest } from "@/pipeline/incomeBasis";
import { analysisOutcomeFromSteps } from "@/report/analysisCompletion";
import { captureAiSelection, selectionIsConnected } from "@/ai/connections";
import { requestedAnalysisModel } from "@/ai/analysisRoute";
import { parseSubscriptionModel, type AiSelection } from "@/ai/contracts";
import { bindAiFingerprint } from "@/ai/fingerprint";
import { withFreshCacheReads } from "@/cache/apiCache";
import { AI_RUNTIME_CONFLICT_HELP, AI_RUNTIME_CONFLICT_MESSAGE, claimAiRuntimeForRun, isAiRuntimeConflict } from "@/ai/store";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb, type ThesisDb } from "@/db";
import { costLog, jobPassArtifacts, jobs, reports, type JobRow } from "@/db/schema";
import { getConfig } from "@/config/env";
import { JOB_LEASE_RENEWAL_DIVISOR, MODEL_STAGE_DEADLINE_MS } from "@/pipeline/leaseTiming";
import {
  resolveModel,
} from "@/providers/anthropic";
import { explainAnalysisModel } from "@/settings/contracts";
import {
  getWritableSettingsAuthority,
  type EffortLevel,
} from "@/settings/settings";
import {
  PIPELINE_STEPS,
  type ManifestEntry,
  type PipelineStep,
  type StepProgress,
} from "@/types/core";
import {
  DISCLAIMER_TEXT,
  FRED_ATTRIBUTION_TEXT,
  REPORT_SPEC_VERSION,
  ReportSchema,
  type Report,
  type AnalystCase,
  type JudgeOutput,
  type ProvenanceCoverage,
  type ExecutionMetadataEntry,
} from "@/report/schema";
import { buildDataCompleteness } from "@/report/completeness";
import {
  buildExecutionMetadataEntry,
} from "@/report/execution";
import type { RequestAdmission } from "@/providers/anthropic";
import { buildDataBundle, type BuildDataBundleOptions } from "@/pipeline/dataBundle";
import { isConfirmedUnknownProfile } from "@/pipeline/unknownTicker";
import { isValidSymbol } from "@/symbol";
import { runStageB, type ComputedMetrics } from "@/pipeline/compute";
import { captureRunInputSnapshot, CURRENT_SNAPSHOT_VERSIONS } from "@/pipeline/runInputSnapshot";
import { getRuntimeReportCodeIdentity, getRuntimeSnapshotArtifactIdentity } from "@/pipeline/runtimeArtifactIdentity";
import { persistRunInputSnapshot, readJobRunSnapshotRef, readRunInputSnapshot } from "@/pipeline/runInputSnapshotStore";
import { validateBundle, type ValidationReport } from "@/pipeline/stageA/validate";
import { sourceManifestEntries, type DataBundle } from "@/pipeline/types";
import { canonicalizeFetchedUrl } from "@/pipeline/stageC/provenance";
import { dataOnlyReasonClause, enrichDataOnlyReport } from "@/pipeline/stageC/dataOnlyReport";
import { isIncompleteAnalystCase, previousOutputBlock } from "@/pipeline/stageC/payload";
import {
  getJobSnapshot,
  publishJobEvent,
  reportJsonIsDataOnly,
} from "@/pipeline/events";
import { mutateJobSnapshotInTransaction } from "@/pipeline/jobState";
import { normalizeLinkedReportRecoverySteps } from "@/pipeline/jobSteps";
import { completedTopLevelFields, type PassContinuation } from "@/pipeline/stageC/continuation";
import {
  classifyInstrumentSupport,
} from "@/pipeline/stageB/instrumentSupport";
import {
  PassSettlementHookError,
  analystArtifactVerificationTexts,
  analystVerificationTexts,
  parseLegacyAnalystSnapshot,
  readJobPassArtifactLineage,
  type DurablePass,
  type ComputedJobResumePlan,
  type PassTelemetry,
  type SerializedPassFailure,
} from "@/pipeline/jobArtifacts";
import {
  linkedReportBlocksResume,
  readQueuedSourceJobResumeInTransaction,
  readStoredJobResumeInTransaction,
} from "@/pipeline/jobStore";
import {
  paidReservationCapRefusal,
  claimQueuedJobById,
  configuredSchedulerLimits,
  reconcileExpiredJobClaims,
  reconcileExpiredSchedulerStateInTransaction,
  renewJobLease,
  stepSettledTotals,
  renewalFailureTolerable,
  connectionBusyTimeoutMs,
  type JobClaim,
  type SchedulerLimits,
} from "@/pipeline/jobScheduler";
import {
  largestPlannedReservation,
  paidBudgetRefusalReason,
  passReservationUsd,
  plannedPaidReservations,
  usesRequestAdmission,
  type RemainingPaidWork,
} from "@/pipeline/paidRunBudget";
import { EVIDENCE_CONTRACT_VERSION } from "@/report/evidenceContract";
import { withCodeIdentity, type ReportCodeIdentity } from "@/report/codeIdentity";
import { type RunState, SupersededRunError, emitStep, ensureStepStarted, findStep, finishStep, markSkipped, nowIso, persistSteps, publish, stampStepFinished, startStep, updateRunningStepDetail, withLiveRunAuthority } from "./jobStepProgress";
import { type AnalystPassHooks, type BilledPassAttempt, DURABLE_LAUNCH_AUTHORITY_CAPABILITY, type PassDeps, type PassResultLike, type PipelinePasses, type ReportMetaInput } from "./jobPassContract";
import { JUDGE_RETRY_RAW_OUTPUT_CAP, MAX_ANALYST_REPAIRS, SUBSCRIPTION_TIME_LIMIT_NEAR_MS, assemblyIssueKey, capRawOutput, carriedDetail, checkCarried, errMessage, gapFor, isRetryableJudgeError, isTransportFailure, partialTextOfError, plainRejectionNote, providerWasBusy, rawTextOfError, withPlainIssueList } from "./jobFailures";
import { type PresumedSpendDisclosure, buildCostBreakdown, discardedAttemptGaps, presumedSpendDisclosure, readSuccessfulExecutions, readerSafeFailureText, reconcileMeta, reconcileRecoveredVerifyReport, round4, sumLoggedCost } from "./jobCostLedger";
import { type RunJobResult, abortRun, failRun, finishRun, finishUnsupported, persistReport, supersededRunResult } from "./jobRunOutcome";
import { type SettlementCheckpoint, billedAttemptFromError, bullBearFailureFromError, createSettlementCheckpoint, failureSettlement, numOr0, passDetail, passErrorDetails, successSettlement, telemetryFromAttempt, throwFirstSettlementRejection } from "./jobSettlement";

export { type PassResultLike, type BilledPassAttempt, type BullBearPassFailureDetails, BullBearPassFailure, type PassUsageLike, type PassDeps, type VerifyPassResult, type PipelinePasses, type AnalystPassHooks, type AnalystSettlementHooks, type AssembleReportInput, type ReportMetaInput, DURABLE_LAUNCH_AUTHORITY_CAPABILITY } from "./jobPassContract";
export { type JobStatus } from "./jobStepProgress";
export { plainRejectionNote, withPlainIssueList, MAX_ANALYST_REPAIRS, PROVIDER_BUSY_PATTERN, providerWasBusy } from "./jobFailures";
export { requestSettlementWriteError } from "./jobSettlement";
export { type RunJobResult } from "./jobRunOutcome";

/* ------------------------------------------------------------------------ *
 * Public constants
 * ------------------------------------------------------------------------ */

export { PIPELINE_VERSION } from "@/report/versions";

/**
 * Reason recorded on skipped LLM steps when no Anthropic key is configured. It is
 * reader text (the data-only banner, synthesis and section notes quote it), so it
 * says in plain words that no AI analysis ran and why; the configuration variable
 * name stays out of reader surfaces (D-296).
 */
export const NO_KEY_SKIP_REASON = "This report was built without an AI connection, so no AI analysis ran." as const;

/** Saved model label for a data-only report built without an AI connection (D-296). */
export const NO_KEY_MODEL_LABEL = "none (no AI connection)" as const;


/** Reason recorded when the ticker resolved to no usable data, so no model is called. */
export const NO_ANALYZABLE_DATA_REASON =
  "No profile, quote, price history or annual income statement could be retrieved for this ticker — no model was called; this is a data-only report. Check the symbol.";

/** True when at least one core provider member returned rows worth analyzing. */
function hasAnalyzableData(bundle: DataBundle): boolean {
  const rows = (f: { ok: boolean; value?: { data: { rows: readonly unknown[] } } }): number =>
    f.ok && f.value ? f.value.data.rows.length : 0;
  return (
    rows(bundle.profile) > 0 ||
    rows(bundle.quote) > 0 ||
    rows(bundle.eodPrices) > 0 ||
    rows(bundle.statements.incomeAnnual) > 0
  );
}

/** Honest degraded-mode reason for legacy/injected adapters lacking that fence. */
export const LAUNCH_AUTHORITY_SKIP_REASON =
  "Stage C adapter lacks durable pre-provider launch authority" as const;

/** The four LLM steps (skipped as a block in the no-key path). */
export const LLM_STEPS: readonly PipelineStep[] = ["bull", "bear", "synthesize", "verify"] as const;

/**
 * Max judge retries on a report-schema (Zod) validation failure (the rule:
 * "on validation failure, retry with the error fed back (max 2 retries), then
 * fail loudly"). Defined locally so the runner stays decoupled from
 * src/pipeline/stageC/passes.ts at build time (module JSDoc) — it mirrors the
 * passes module's MAX_JUDGE_RETRIES. Total judge attempts = 1 + this.
 */
export const MAX_JUDGE_RETRIES = 2 as const;

/** Reason recorded on skipped LLM steps when model resolution fails . */
export const MODEL_RESOLUTION_SKIP_PREFIX = "model resolution failed" as const;

/**
 * `analysis.llm` manifest reason of a data-only report whose analysis was
 * launched and failed: the pass errors themselves are in the manifest.
 */
export const LLM_FAILURE_DATA_ONLY_REASON =
  "LLM analysis could not complete — the failed pass errors are disclosed in the missing-data manifest; this is a data-only report." as const;

/**
 * `analysis.llm` manifest reason when Stage B threw before any model was
 * called: the exception is disclosed as `pipeline.compute`, not as a pass
 * error.
 */
export const COMPUTE_FAILURE_DATA_ONLY_REASON =
  "Stage B metric computation failed before any model was called — the error is disclosed as pipeline.compute in the missing-data manifest; this is a data-only report." as const;

/** Active jobs older than this are treated as abandoned and no longer block reruns. */
export const ACTIVE_JOB_STALE_MS = 30 * 60 * 1000;

/** Conservative hard limits: bound hangs without truncating normal deep analysis. */
export const DEFAULT_JOB_DEADLINE_MS = 90 * 60 * 1000;
export const DEFAULT_FETCH_DEADLINE_MS = 10 * 60 * 1000;
export const DEFAULT_MODEL_STAGE_DEADLINE_MS = MODEL_STAGE_DEADLINE_MS;
/**
 * Subscription (plan) connections produce each response in parts to stay
 * under the provider's 15-minute response limit, and back off when the
 * provider reports overload. A max-effort run measured ~35 minutes for the
 * analysts alone (2026-10-13), so the general 90/45-minute bounds would
 * truncate legitimate work that costs nothing per request. Hangs stay bounded.
 */
export const SUBSCRIPTION_JOB_DEADLINE_MS = 180 * 60 * 1000;
export const SUBSCRIPTION_MODEL_STAGE_DEADLINE_MS = 90 * 60 * 1000;
/** Wait before retrying after the provider reports it is overloaded (x attempt number). */
export const OVERLOAD_BACKOFF_MS = 60_000;
/** Tries for an analyst side after a transient plan-connection failure. */
export const SUBSCRIPTION_ANALYST_ATTEMPTS = 3;

/** A fresh StepProgress[] with every pipeline step "pending". */
export function initialSteps(): StepProgress[] {
  return PIPELINE_STEPS.map((step) => ({ step, status: "pending" as const }));
}

/* ------------------------------------------------------------------------ *
 * createJob
 * ------------------------------------------------------------------------ */

/**
 * Insert a fresh "queued" job for a symbol with every step "pending". Returns
 * the generated jobId. Does not start the pipeline; the caller wakes the
 * durable scheduler after the enqueue commits.
 */
export function createJob(symbol: string): { jobId: string } {
  const sym = symbol.trim().toUpperCase();
  const jobId = randomUUID();
  const now = nowIso();
  getDb()
    .insert(jobs)
    .values({
      id: jobId,
      symbol: sym,
      status: "queued",
      stepsJson: JSON.stringify(initialSteps()),
      createdAt: now,
      updatedAt: now,
      queuedAt: now,
      maxCostUsd: getConfig().maxJobCostUsd,
      error: null,
      reportId: null,
      unsupportedKind: null,
      unsupportedMessage: null,
    })
    .run();
  return { jobId };
}

/**
 * Atomically reuse or create the active job for a symbol. The partial unique
 * SQLite index is the final arbiter across processes. BEGIN IMMEDIATE keeps
 * expiry reconciliation, the fresh-active check, and insertion under one
 * writer lock so no expired owner can be returned between phases.
 */
export function getOrCreateJobForSymbol(
  symbol: string,
  options: { now?: () => Date } = {},
):
  | { jobId: string; existing: true; status: "queued" | "running"; updatedAt: string }
  | { jobId: string; existing: false } {
  const sym = symbol.trim().toUpperCase();
  const db = getDb();
  return db.transaction((tx) => {
    const authority = options.now?.() ?? new Date();
    reconcileExpiredSchedulerStateInTransaction(tx as ThesisDb, authority);
    const active = tx
      .select({ id: jobs.id, status: jobs.status, updatedAt: jobs.updatedAt })
      .from(jobs)
      .where(and(eq(sql`upper(replace(${jobs.symbol}, '-', '.'))`, sym.replaceAll("-", ".")), inArray(jobs.status, ["queued", "running"])))
      .orderBy(desc(jobs.updatedAt), desc(jobs.id))
      .get();
    if (active && isReusableStatus(active.status)) {
      return { jobId: active.id, existing: true, status: active.status, updatedAt: active.updatedAt };
    }
    const jobId = randomUUID();
    const now = authority.toISOString();
    tx.insert(jobs)
      .values({
        id: jobId,
        symbol: sym,
        status: "queued",
        stepsJson: JSON.stringify(initialSteps()),
        createdAt: now,
        updatedAt: now,
        queuedAt: now,
        maxCostUsd: getConfig().maxJobCostUsd,
        error: null,
        reportId: null,
        unsupportedKind: null,
        unsupportedMessage: null,
      })
      .run();
    return { jobId, existing: false };
  }, { behavior: "immediate" });
}

export interface ReusableActiveJob {
  jobId: string;
  status: "queued" | "running";
  updatedAt: string;
}

function isReusableStatus(status: string): status is ReusableActiveJob["status"] {
  return status === "queued" || status === "running";
}

/**
 * Return a reusable active job for a symbol. Queued rows remain durable until a
 * scheduler claims them; running rows are reusable only while their exact job
 * lease is live. This read helper never mutates state or treats updatedAt as
 * liveness authority.
 */
export function getReusableActiveJobForSymbol(
  symbol: string,
  now: Date = new Date(),
  _staleMs = ACTIVE_JOB_STALE_MS,
): ReusableActiveJob | null {
  void _staleMs; // compatibility only; updatedAt age is never liveness authority
  const sym = symbol.trim().toUpperCase();
  const rows = getDb()
    .select({
      id: jobs.id,
      status: jobs.status,
      updatedAt: jobs.updatedAt,
      leaseOwner: jobs.leaseOwner,
      leaseExpiresAt: jobs.leaseExpiresAt,
    })
    .from(jobs)
    .where(eq(sql`upper(replace(${jobs.symbol}, '-', '.'))`, sym.replaceAll("-", ".")))
    .all()
    .filter((row): row is typeof row & { status: ReusableActiveJob["status"] } =>
      row.status === "queued" ||
      (
        row.status === "running" &&
        row.leaseOwner !== null &&
        row.leaseExpiresAt !== null &&
        row.leaseExpiresAt > now.toISOString()
      ),
    )
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  const row = rows[0];
  return row === undefined
    ? null
    : { jobId: row.id, status: row.status, updatedAt: row.updatedAt };
}

/**
 * True when a job for this symbol is currently queued or running. The retry
 * route uses it to refuse queuing a resume while another job for the symbol
 * is active (409); POST /api/report never rejects a duplicate — it attaches to
 * the active job through getOrCreateJobForSymbol instead.
 */
/** Read-only terminal discovery; reuse eligibility is the same durable fold as Retry. */
export function getLatestResumableJobForSymbol(symbol: string): string | null {
  const sym = symbol.trim().toUpperCase().replaceAll("-", ".");
  return getDb().transaction(db => {
    const row = db.select({ id: jobs.id }).from(jobs)
      .where(eq(sql`upper(replace(${jobs.symbol}, '-', '.'))`, sym))
      .orderBy(desc(jobs.updatedAt), desc(jobs.id)).limit(1).get();
    if (row !== undefined && readStoredJobResumeInTransaction(db, row.id)?.plan.state.resumable) return row.id;
    return null;
  });
}

export function isSymbolJobActive(symbol: string): boolean {
  return getReusableActiveJobForSymbol(symbol) !== null;
}

/* ------------------------------------------------------------------------ *
 * Analyst-pass snapshots (stage-level resume — 2026-07 audit item 1)
 * ------------------------------------------------------------------------ */

/**
 * Persisted analyst snapshots plus the fingerprint they were built on.
 * PER-SIDE nullable (2026-07-10): a run where one analyst pass succeeded and
 * the other failed persists the successful side alone, so its paid output is
 * never discarded — resume reuses it and re-bills only the missing side.
 */
export interface PersistedPassSnapshots {
  bull: PassResultLike<AnalystCase> | null;
  bear: PassResultLike<AnalystCase> | null;
  payloadFingerprint: string | null;
}

/**
 * Parse + validate one serialized PassResultLike<AnalystCase>. The AnalystCase
 * payload is re-validated against ANALYST_CASE_SCHEMA — a resumed judge must
 * never be fed a corrupt or hand-edited snapshot.
 */
/**
 * Read the persisted bull/bear snapshots for a job, per side (an invalid or
 * absent side is null — a resumed judge is never fed a corrupt snapshot).
 * Returns null only when neither side parses. This is a compatibility/readback
 * helper; retry authority lives in jobStore and never depends on this function.
 */
export function readPassSnapshots(jobId: string): PersistedPassSnapshots | null {
  const row = getDb()
    .select({
      bullJson: jobs.bullJson,
      bearJson: jobs.bearJson,
      payloadFingerprint: jobs.payloadFingerprint,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .get();
  if (row === undefined) return null;
  const bull = parseLegacyAnalystSnapshot(row.bullJson);
  const bear = parseLegacyAnalystSnapshot(row.bearJson);
  if (bull === null && bear === null) return null;
  return { bull, bear, payloadFingerprint: row.payloadFingerprint ?? null };
}

export interface PreparedJobResume {
  jobId: string;
  /** Current terminal/queued generation whose row is being advanced. */
  claimGeneration: number;
  /** Immutable artifact/paid-attempt cohort reused by the target generation. */
  sourceGeneration: number;
  targetGeneration: number;
  sourceRevision: number;
  sourceStatus: "done" | "error";
  sourceReportId: number | null;
  sourceReportExists: boolean;
  sourceStepsJson: string;
  sourceBullJson: string | null;
  sourceBearJson: string | null;
  sourcePayloadFingerprint: string | null;
  /** Exact source-generation artifact + paid-attempt ledger cohort captured before claim. */
  sourceArtifactSetDigest: string;
  bull: PassResultLike<AnalystCase> | null;
  bear: PassResultLike<AnalystCase> | null;
  synthesize: PassResultLike<JudgeOutput> | null;
  verify: PassResultLike<Report> | null;
  payloadFingerprint: string | null;
  /** Analyst web-search evidence, preserved when bull/bear are superseded. */
  analystFetchedUrls: string[];
}

const globalWithPreparedResumes = globalThis as typeof globalThis & {
  __thesisPreparedResumeAuthenticity?: WeakMap<PreparedJobResume, string>;
};

function preparedResumeAuthenticity(): WeakMap<PreparedJobResume, string> {
  globalWithPreparedResumes.__thesisPreparedResumeAuthenticity ??= new WeakMap();
  return globalWithPreparedResumes.__thesisPreparedResumeAuthenticity;
}

function preparedResumeDigest(prepared: PreparedJobResume): string {
  return createHash("sha256").update(JSON.stringify(prepared)).digest("hex");
}

function registerPreparedResume(prepared: PreparedJobResume | null): PreparedJobResume | null {
  if (prepared !== null) {
    preparedResumeAuthenticity().set(prepared, preparedResumeDigest(prepared));
  }
  return prepared;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function immutablePreparedResume(prepared: PreparedJobResume): PreparedJobResume {
  return deepFreeze(structuredClone(prepared));
}

type ResumeStateDb = Pick<ReturnType<typeof getDb>, "select">;

/**
 * Fingerprint the complete durable settlement cohort for an exact prepare/claim
 * fence. Including the paired attempt ledger prevents a half-pair repair or a
 * late billable settlement from slipping through the claim window.
 */
function sourceArtifactSetDigest(
  db: ResumeStateDb,
  jobId: string,
  firstGeneration: number,
  lastGeneration: number,
): string {
  const artifacts = db
    .select()
    .from(jobPassArtifacts)
    .where(and(
      eq(jobPassArtifacts.jobId, jobId),
      gte(jobPassArtifacts.runGeneration, firstGeneration),
      lte(jobPassArtifacts.runGeneration, lastGeneration),
    ))
    .all()
    .sort((left, right) =>
      left.attemptId.localeCompare(right.attemptId) ||
      left.pass.localeCompare(right.pass) ||
      left.settledAt.localeCompare(right.settledAt),
    );
  const ledger = db
    .select()
    .from(costLog)
    .where(and(
      eq(costLog.jobId, jobId),
      gte(costLog.runGeneration, firstGeneration),
      lte(costLog.runGeneration, lastGeneration),
    ))
    .all()
    .filter((row) => row.attemptId !== null)
    .sort((left, right) =>
      (left.attemptId ?? "").localeCompare(right.attemptId ?? "") ||
      left.step.localeCompare(right.step) ||
      left.id - right.id,
    );
  return createHash("sha256")
    .update(JSON.stringify({ version: 1, artifacts, ledger }))
    .digest("hex");
}

/** Build the immutable reusable-pass plan while the terminal source generation is current. */
function buildPreparedJobResume(
  row: JobRow,
  expectedTerminalStatus: "done" | "error",
  sourceGeneration: number,
  plan: ComputedJobResumePlan,
  sourceReportExists: boolean,
  artifactSetDigest: string,
): PreparedJobResume | null {
  if (row.status !== expectedTerminalStatus || !plan.state.resumable) return null;
  return {
    jobId: row.id,
    claimGeneration: row.runGeneration,
    sourceGeneration,
    targetGeneration: row.runGeneration + 1,
    sourceRevision: row.revision,
    sourceStatus: expectedTerminalStatus,
    sourceReportId: row.reportId,
    sourceReportExists,
    sourceStepsJson: row.stepsJson,
    sourceBullJson: row.bullJson,
    sourceBearJson: row.bearJson,
    sourcePayloadFingerprint: row.payloadFingerprint,
    sourceArtifactSetDigest: artifactSetDigest,
    bull: plan.bull,
    bear: plan.bear,
    synthesize: plan.synthesize,
    verify: plan.verify,
    payloadFingerprint: plan.payloadFingerprint,
    analystFetchedUrls: plan.analystFetchedUrls,
  };
}

/**
 * Re-derive a queued retry entirely from durable source-generation state. The
 * transaction form is the scheduler seam: a future queue claimant can compose
 * this exact authority read with its own queued-to-running lease transaction.
 */
export function prepareQueuedJobResumeInTransaction(
  db: ResumeStateDb,
  jobId: string,
): PreparedJobResume | null {
  const stored = readQueuedSourceJobResumeInTransaction(db, jobId);
  if (stored === null || !stored.plan.state.resumable) return null;
  const row = stored.row;
  return immutablePreparedResume({
    jobId,
    claimGeneration: row.runGeneration - 1,
    sourceGeneration: stored.artifacts.runGeneration,
    targetGeneration: row.runGeneration,
    sourceRevision: Math.max(0, row.revision - 1),
    sourceStatus: "error",
    sourceReportId: row.reportId,
    sourceReportExists: stored.artifacts.reportExists,
    sourceStepsJson: row.stepsJson,
    sourceBullJson: row.bullJson,
    sourceBearJson: row.bearJson,
    sourcePayloadFingerprint: row.payloadFingerprint,
    sourceArtifactSetDigest: sourceArtifactSetDigest(
      db,
      jobId,
      stored.artifacts.runGeneration,
      row.runGeneration - 1,
    ),
    bull: stored.plan.bull,
    bear: stored.plan.bear,
    synthesize: stored.plan.synthesize,
    verify: stored.plan.verify,
    payloadFingerprint: stored.plan.payloadFingerprint,
    analystFetchedUrls: stored.plan.analystFetchedUrls,
  });
}

/** Re-check the immutable source authority after a queued claim-side mutation. */
export function queuedResumeSourceMatchesInTransaction(
  db: ResumeStateDb,
  prepared: PreparedJobResume,
): boolean {
  const current = db
    .select({
      runGeneration: jobs.runGeneration,
      stepsJson: jobs.stepsJson,
      reportId: jobs.reportId,
      bullJson: jobs.bullJson,
      bearJson: jobs.bearJson,
      payloadFingerprint: jobs.payloadFingerprint,
    })
    .from(jobs)
    .where(eq(jobs.id, prepared.jobId))
    .get();
  if (
    current === undefined ||
    current.runGeneration !== prepared.targetGeneration ||
    current.stepsJson !== prepared.sourceStepsJson ||
    current.reportId !== prepared.sourceReportId ||
    current.bullJson !== prepared.sourceBullJson ||
    current.bearJson !== prepared.sourceBearJson ||
    current.payloadFingerprint !== prepared.sourcePayloadFingerprint
  ) {
    return false;
  }
  if (
    sourceArtifactSetDigest(
      db,
      prepared.jobId,
      prepared.sourceGeneration,
      prepared.claimGeneration,
    ) !==
    prepared.sourceArtifactSetDigest
  ) {
    return false;
  }
  const sourceReportExists = linkedReportBlocksResume(db, prepared.sourceReportId);
  return sourceReportExists === prepared.sourceReportExists;
}

export function prepareQueuedJobResume(jobId: string): PreparedJobResume | null {
  try {
    return getDb().transaction((tx) => prepareQueuedJobResumeInTransaction(tx, jobId));
  } catch {
    return null;
  }
}

/** Prepare and validate an immutable resume plan against the terminal source row. */
export function prepareJobResume(
  jobId: string,
  expectedTerminalStatus: "done" | "error",
): PreparedJobResume | null {
  if (expectedTerminalStatus !== "done" && expectedTerminalStatus !== "error") return null;
  try {
    const prepared = getDb().transaction((tx) => {
      const stored = readStoredJobResumeInTransaction(tx, jobId);
      if (stored === null) return null;
      const digest = sourceArtifactSetDigest(
        tx,
        jobId,
        stored.artifacts.runGeneration,
        stored.row.runGeneration,
      );
      return buildPreparedJobResume(
        stored.row,
        expectedTerminalStatus,
        stored.artifacts.runGeneration,
        stored.plan,
        stored.artifacts.reportExists,
        digest,
      );
    });
    return registerPreparedResume(prepared);
  } catch {
    return null;
  }
}

/** Claim exactly the source state captured by prepareJobResume and retain its reusable plan. */
export function claimPreparedJobResume(prepared: PreparedJobResume): boolean {
  const authenticity = preparedResumeAuthenticity();
  const expectedDigest = authenticity.get(prepared);
  authenticity.delete(prepared);
  if (
    expectedDigest === undefined ||
    preparedResumeDigest(prepared) !== expectedDigest ||
    prepared.jobId.length === 0 ||
    (prepared.sourceStatus !== "done" && prepared.sourceStatus !== "error") ||
    !Number.isSafeInteger(prepared.sourceGeneration) ||
    prepared.sourceGeneration < 0 ||
    !Number.isSafeInteger(prepared.claimGeneration) ||
    prepared.claimGeneration < prepared.sourceGeneration ||
    prepared.targetGeneration !== prepared.claimGeneration + 1 ||
    !Number.isSafeInteger(prepared.sourceRevision) ||
    prepared.sourceRevision < 0 ||
    typeof prepared.sourceReportExists !== "boolean" ||
    !/^[0-9a-f]{64}$/.test(prepared.sourceArtifactSetDigest)
  ) {
    return false;
  }
  let claimed = false;
  try {
    claimed = getDb().transaction((tx) => {
      const authority = new Date();
      if (
        sourceArtifactSetDigest(
          tx,
          prepared.jobId,
          prepared.sourceGeneration,
          prepared.claimGeneration,
        ) !==
        prepared.sourceArtifactSetDigest
      ) {
        return false;
      }
      const sourceReportExists = linkedReportBlocksResume(tx, prepared.sourceReportId);
      if (sourceReportExists !== prepared.sourceReportExists) return false;
      const result = mutateJobSnapshotInTransaction(tx as ThesisDb, {
        jobId: prepared.jobId,
        now: authority,
        fence: {
          expectedRevision: prepared.sourceRevision,
          status: prepared.sourceStatus,
          runGeneration: prepared.claimGeneration,
        },
        mutate: (row) => {
          if (
            row.stepsJson !== prepared.sourceStepsJson ||
            row.reportId !== prepared.sourceReportId ||
            row.bullJson !== prepared.sourceBullJson ||
            row.bearJson !== prepared.sourceBearJson ||
            row.payloadFingerprint !== prepared.sourcePayloadFingerprint
          ) return null;
          return {
          status: "queued",
          error: null,
          unsupportedKind: null,
          unsupportedMessage: null,
          resumeSourceGeneration: prepared.sourceGeneration,
          runGeneration: prepared.targetGeneration,
          stepsJson: JSON.stringify(initialSteps()),
          queuedAt: authority.toISOString(),
          };
        },
      });
      return result !== null;
    }, { behavior: "immediate" });
  } catch {
    return false;
  }
  return claimed;
}

/**
 * Atomically claim a terminal job for a synthesis-only retry. The expected
 * status is part of the UPDATE predicate, so two HTTP requests that read the
 * same terminal row cannot both launch a paid continuation: only the first
 * transition to queued succeeds.
 */
export function claimJobForResume(
  jobId: string,
  expectedTerminalStatus: "done" | "error",
): boolean {
  const prepared = prepareJobResume(jobId, expectedTerminalStatus);
  return prepared !== null && claimPreparedJobResume(prepared);
}

/* ------------------------------------------------------------------------ *
 * In-process cancellation registry
 *
 * A single LLM pass can silently run >30 minutes (web-search-heavy passes,
 * provider backoff) or a laptop sleep can freeze the clock mid-pass — with no
 * jobs-table write in between. Durable lease/heartbeat fields are the liveness
 * authority; this process-local registry exists only to deliver cancellation
 * promptly and expose a test diagnostic. Stashed on globalThis so Next.js dev
 * hot-reloads share controllers with in-flight runs from older module copies.
 * ------------------------------------------------------------------------ */

class JobCanceledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobCanceledError";
  }
}

class JobDeadlineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobDeadlineError";
  }
}

function positiveDeadline(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? Math.max(1, Math.trunc(value))
    : fallback;
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new JobCanceledError("job canceled");
}

function throwIfJobAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortReason(signal);
}

/**
 * Race a stage against the shared signal. The timer aborts the whole job, so
 * compliant providers stop their transport; the race also bounds injected or
 * buggy dependencies that ignore AbortSignal.
 */
async function awaitJobStage<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  controller: AbortController,
  stage: string,
  deadlineMs: number,
): Promise<T> {
  if (signal.aborted) {
    // The dependency promise is evaluated before this helper is entered. A
    // synchronous pre-provider fence can abort/reject in that narrow window;
    // observe its rejection before returning the durable cancellation result.
    void promise.catch(() => undefined);
    throw abortReason(signal);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      let settled = false;
      const cleanup = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
      };
      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        cleanup();
        fn();
      };
      const onAbort = (): void => finish(() => reject(abortReason(signal)));
      signal.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => {
        if (!controller.signal.aborted) {
          controller.abort(
            new JobDeadlineError(`${stage} stage deadline exceeded after ${deadlineMs}ms`),
          );
        }
      }, deadlineMs);
      timer.unref?.();
      promise.then(
        (value) => finish(() => resolve(value)),
        (err: unknown) => finish(() => reject(err)),
      );
    });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

const globalWithLiveJobs = globalThis as typeof globalThis & {
  __thesisLiveJobIds?: Set<string>;
  __thesisLiveJobControllers?: Map<string, AbortController>;
};

function liveJobIds(): Set<string> {
  return (globalWithLiveJobs.__thesisLiveJobIds ??= new Set());
}

function liveJobControllers(): Map<string, AbortController> {
  return (globalWithLiveJobs.__thesisLiveJobControllers ??= new Map());
}

/**
 * Terminal error message written when a job is canceled by the user. Load-
 * bearing: runJob's resume gate refuses to (re-)start a job that carries this
 * marker, so an acknowledged cancel is never silently un-done by a resume that
 * was dispatched in the same window (see runJob).
 */
export const JOB_CANCELED_ERROR = "job canceled by user";

function canceledStepsJson(raw: string, at: string): string {
  try {
    const steps = JSON.parse(raw) as StepProgress[];
    if (!Array.isArray(steps)) return raw;
    for (const step of steps) {
      if (step.status === "running") {
        step.status = "error";
        step.detail = JOB_CANCELED_ERROR;
        step.finishedAt = at;
        step.completedAt = at;
      } else if (step.status === "pending") {
        step.status = "skipped";
        step.detail = `not reached — ${JOB_CANCELED_ERROR}`;
      }
    }
    return JSON.stringify(steps);
  } catch {
    return raw;
  }
}

/** Durably cancel an exact queued/running row, then abort any local worker. */
export function cancelJob(jobId: string): boolean {
  const controller = liveJobControllers().get(jobId);
  const canceledRevision = getDb().transaction((tx): number | null => {
    const authority = new Date();
    const at = authority.toISOString();
    const row = tx.select().from(jobs).where(eq(jobs.id, jobId)).get();
    if (row === undefined || (row.status !== "queued" && row.status !== "running")) return null;
    const changed = mutateJobSnapshotInTransaction(tx as ThesisDb, {
      jobId,
      now: authority,
      fence: {
        expectedRevision: row.revision,
        runGeneration: row.runGeneration,
        status: ["queued", "running"],
        leaseOwner: row.leaseOwner,
      },
      mutate: () => ({
        status: "error",
        error: JOB_CANCELED_ERROR,
        unsupportedKind: null,
        unsupportedMessage: null,
        stepsJson: canceledStepsJson(row.stepsJson, at),
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
      }),
    });
    return changed?.revision ?? null;
  }, { behavior: "immediate" });
  const canceled = canceledRevision !== null;
  if (canceled && controller !== undefined && !controller.signal.aborted) {
    controller.abort(new JobCanceledError(JOB_CANCELED_ERROR));
  }
  if (canceledRevision !== null) {
    publishJobEvent({
      type: "error",
      jobId,
      revision: canceledRevision,
      message: JOB_CANCELED_ERROR,
    });
  }
  return canceled;
}

/** Legacy test export; durable renewal cadence is derived from the lease TTL. */
export { JOB_HEARTBEAT_MS } from "@/pipeline/leaseTiming";

/**
 * Compatibility seam for older callers. It now reconciles only exact missing
 * or expired durable job leases. Queued age and jobs.updatedAt have no write
 * authority, and read routes do not invoke this function.
 */
export function sweepAbandonedJobs(
  now: Date | undefined = undefined,
  _staleMs = ACTIVE_JOB_STALE_MS,
): number {
  void _staleMs; // compatibility only; durable lease expiry is authoritative
  return reconcileExpiredJobClaims(now);
}

/* ------------------------------------------------------------------------ *
 * runJob
 * ------------------------------------------------------------------------ */

export interface RunJobOptions<TPayload = unknown> {
  /** Trusted embedding selection for this execution; does not write account/model preferences. */
  aiSelection?: AiSelection;
  /** Durable scheduler claim. Production always supplies this preclaimed path. */
  claim?: JobClaim;
  /** Snapshot used for every job/pass lease decision in this run. */
  schedulerLimits?: SchedulerLimits;
  /** Options forwarded to buildDataBundle (injectable clients/clock in tests). */
  bundleOptions?: BuildDataBundleOptions;
  /**
   * The plan-connection runtime claim made before the data fetch (audit
   * 2026-10-22 F-12). Defaults to `claimAiRuntimeForRun`; tests inject it.
   */
  claimAiRuntime?: () => Promise<void>;
  /**
   * Test/override hook: skip live fetch and use this bundle directly. When set,
   * the fetch step is marked done immediately with this bundle.
   */
  bundle?: DataBundle;
  /**
   * Force the no-key degraded path regardless of config (tests). When
   * undefined, the runner reads getConfig().hasAnthropicKey.
   */
  hasAnthropicKey?: boolean;
  /** Injectable clock for meta.generatedAt (tests). Defaults to new Date(). */
  now?: () => Date;
  /**
   * Override the report-schema retry budget. Defaults to MAX_JUDGE_RETRIES;
   * reductions such as 0 support one-attempt test harnesses, while larger
   * values are clamped to the audited production maximum.
   */
  maxJudgeRetries?: number;
  /** Base wait before retrying after a provider overload (x attempt). Default OVERLOAD_BACKOFF_MS. */
  overloadBackoffMs?: number;
  /** Optional upstream cancellation (tests/embedding); composed with local cancel/deadline. */
  signal?: AbortSignal;
  /** Overall wall-clock deadline. Default 90 minutes. */
  deadlineMs?: number;
  /** Fetch-stage deadline. Default 10 minutes. */
  fetchDeadlineMs?: number;
  /** Deadline for each external model stage. Default 45 minutes. */
  modelStageDeadlineMs?: number;
  /**
   * Resume from persisted bull/bear snapshots (2026-07 audit item 1): skip the
   * analyst passes entirely — they are the expensive part — and re-run only
   * synthesize/verify/assemble. Compatible frozen inputs rebuild the judge
   * payload; legacy or version-incompatible inputs are fetched again. A payload-fingerprint mismatch
   * makes the prepared artifacts incompatible and aborts before paid work.
   * On a terminal (done/error) row, resume requires a resumable durable plan
   * (`claimJobForResume`) and otherwise REJECTS with "is not resumable"; on a
   * row that is already queued or claimed, a prepared plan that is empty or
   * unusable makes the runner fall back to a fresh full run.
   */
  resume?: boolean;
  /** Marker so TPayload is inferable from the passes argument. */
  readonly _payload?: TPayload;
}

type QueuedResumeSettlement =
  | {
      kind: "done";
      reportId: number;
      verificationRate: number | null;
      totalCostUsd: number;
      dataOnly: boolean;
      revision: number;
    }
  | { kind: "error"; message: string; revision: number }
  | { kind: "unchanged" };

function safeQueuedResumeFailure(err: unknown): string {
  const message = errMessage(err).toLowerCase();
  if (message.includes("source artifact") || message.includes("digest")) {
    return "runJob: queued retry source artifact digest changed before dispatch";
  }
  if (message.includes("source report") || message.includes("report existence")) {
    return "runJob: queued retry source report existence changed before dispatch";
  }
  if (message.includes("durable source plan")) {
    return "runJob: queued retry has no valid durable source plan";
  }
  return "runJob: queued retry dispatch failed before execution";
}

function normalizeQueuedDispatchFailureSteps(raw: string, message: string, at: string): string {
  try {
    const steps = JSON.parse(raw) as StepProgress[];
    if (!Array.isArray(steps)) return raw;
    return JSON.stringify(steps.map((step): StepProgress => {
      if (step.status === "running") {
        return {
          ...step,
          status: "error",
          detail: message,
          finishedAt: at,
          completedAt: at,
        };
      }
      if (step.status === "pending") {
        return { ...step, status: "skipped", detail: message };
      }
      return step;
    }));
  } catch {
    return raw;
  }
}

/**
 * Finish an accepted queued retry without launching paid work. The exact
 * generation and queued status fence every write. A linked report is checked
 * first under the same immediate transaction and always wins over an error.
 */
function settleQueuedResumeWithoutExecution(
  jobId: string,
  expectedGeneration: number,
  expectedRevision: number,
  failure: unknown,
): QueuedResumeSettlement {
  const message = safeQueuedResumeFailure(failure);
  const settled = getDb().transaction((tx): QueuedResumeSettlement => {
    const authority = new Date();
    const row = tx.select().from(jobs).where(eq(jobs.id, jobId)).get();
    if (
      row === undefined ||
      row.status !== "queued" ||
      row.runGeneration !== expectedGeneration ||
      row.revision !== expectedRevision
    ) {
      return { kind: "unchanged" };
    }
    const linkedReport = row.reportId === null
      ? undefined
      : tx
          .select({
            id: reports.id,
            verificationRate: reports.verificationRate,
            costUsd: reports.costUsd,
            reportJson: reports.reportJson,
          })
          .from(reports)
          .where(eq(reports.id, row.reportId))
          .get();
    // A data-only fallback is not a finished run: it falls through to the
    // `error` mutation below and stays linked (the admission rule, DB-001).
    // Mirrors linkedReportBlocksResume (jobStore), read inline on this test-seam path.
    if (linkedReport !== undefined && !reportJsonIsDataOnly(linkedReport.reportJson)) {
      const stepsJson = normalizeLinkedReportRecoverySteps(
        row.stepsJson,
        authority.toISOString(),
        "covered by linked persisted report recovered after queued dispatch failure",
      );
      const update = mutateJobSnapshotInTransaction(tx as ThesisDb, {
        jobId,
        now: authority,
        fence: {
          expectedRevision,
          status: "queued",
          runGeneration: expectedGeneration,
        },
        mutate: (current) => current.reportId === linkedReport.id ? ({
          status: "done",
          error: null,
          stepsJson,
        }) : null,
      });
      const ledger = tx.select({ costUsd: costLog.costUsd }).from(costLog)
        .where(eq(costLog.jobId, jobId)).all();
      return update !== null
        ? {
            kind: "done",
            reportId: linkedReport.id,
            verificationRate: linkedReport.verificationRate,
            totalCostUsd: round4(ledger.length > 0
              ? ledger.reduce((total, cost) => total + cost.costUsd, 0)
              : (linkedReport.costUsd ?? 0)),
            dataOnly: false, // this branch is taken only for a linked report that is not data-only
            revision: update.revision,
          }
        : { kind: "unchanged" };
    }
    const update = mutateJobSnapshotInTransaction(tx as ThesisDb, {
      jobId,
      now: authority,
      fence: {
        expectedRevision,
        status: "queued",
        runGeneration: expectedGeneration,
      },
      mutate: () => ({
        status: "error",
        error: message,
        stepsJson: normalizeQueuedDispatchFailureSteps(
          row.stepsJson,
          message,
          authority.toISOString(),
        ),
      }),
    });
    return update !== null
      ? { kind: "error", message, revision: update.revision }
      : { kind: "unchanged" };
  }, { behavior: "immediate" });

  if (settled.kind === "done") {
    publishJobEvent({
      type: "done",
      jobId,
      revision: settled.revision,
      reportId: settled.reportId,
      verificationRate: settled.verificationRate,
      totalCostUsd: settled.totalCostUsd,
      dataOnly: settled.dataOnly,
    });
  } else if (settled.kind === "error") {
    publishJobEvent({
      type: "error",
      jobId,
      revision: settled.revision,
      message: settled.message,
    });
  }
  return settled;
}

/**
 * Test seam: settles a queued retry that failed before runJob owned a running
 * row. Neither the route nor the scheduler calls it (the scheduler terminalizes
 * its own claims); only tests do.
 */
export function recordQueuedResumeDispatchFailure(
  jobId: string,
  expectedGeneration: number,
  expectedRevision: number,
  failure: unknown,
): boolean {
  return settleQueuedResumeWithoutExecution(
    jobId,
    expectedGeneration,
    expectedRevision,
    failure,
  ).kind !== "unchanged";
}

/**
 * Run the full pipeline for an already-created job. Deterministic step order,
 * per-step timing, cost logging, and progress events. Never throws for missing
 * data or a failed LLM pass — those degrade to gaps / "error" steps and the
 * runner still persists what it has. Rejects only on a truly unexpected
 * programming/DB failure (after recording "error" on the job).
 */
export async function runJob<TPayload = unknown>(
  jobId: string,
  passes: PipelinePasses<TPayload>,
  opts: RunJobOptions<TPayload> = {},
): Promise<RunJobResult> {
  let jobRow = getDb().select().from(jobs).where(eq(jobs.id, jobId)).get();
  let schedulerClaim = opts.claim;
  const schedulerLimits = opts.schedulerLimits ?? configuredSchedulerLimits();
  if (jobRow === undefined) {
    throw new Error(`runJob: no job with id "${jobId}"`);
  }

  // A cancel acknowledged (202) in the resume-dispatch window flips the claimed
  // row to error "job canceled by user" (cancelJob's dispatch-race close). The
  // retry route then calls runJob(resume) on it; the resume gate above would
  // accept that error status and silently re-run the paid passes, un-doing the
  // cancel. Refuse to start when the job carries the cancel marker. (The window
  // exists only across the route's async gap; between this read and controller
  // registration there is no await, so a later cancel finds the live controller
  // and aborts normally. A FRESH explicit retry clears error via
  // claimJobForResume, so this only blocks an override, never a real retry.)
  if (opts.resume === true && jobRow.status === "error" && jobRow.error === JOB_CANCELED_ERROR) {
    return {
      jobId,
      status: "error",
      reportId: null,
      verificationRate: null,
      totalCostUsd: round4(sumLoggedCost(jobId)),
      dataOnly: false,
    };
  }

  if (opts.resume === true && (jobRow.status === "done" || jobRow.status === "error")) {
    if (!claimJobForResume(jobId, jobRow.status)) {
      throw new Error(`runJob: job "${jobId}" is not resumable (already synthesized or no reusable analyst work)`);
    }
    jobRow = getDb().select().from(jobs).where(eq(jobs.id, jobId)).get();
    if (!jobRow) throw new Error(`runJob: job "${jobId}" disappeared after resume claim`);
  }
  if (schedulerClaim === undefined) {
    schedulerClaim = claimQueuedJobById(
      jobId,
      `direct-${process.pid}`,
      undefined,
      schedulerLimits,
    ) ?? undefined;
    if (schedulerClaim === undefined) {
      // Only reports a row another path already made terminal: a data-only
      // fallback is never closed as done before dispatch (DB-001), so it is claimed above.
      const afterClaim = getJobSnapshot(jobId);
      const linkedReportExists = afterClaim?.reportId !== null && afterClaim?.reportId !== undefined &&
        getDb().select({ id: reports.id }).from(reports)
          .where(eq(reports.id, afterClaim.reportId)).get() !== undefined;
      if (afterClaim?.status === "done" && afterClaim.reportId !== null && linkedReportExists) {
        const result: RunJobResult = {
          jobId,
          status: "done",
          reportId: afterClaim.reportId,
          verificationRate: afterClaim.verificationRate,
          totalCostUsd: round4(afterClaim.totalCostUsd),
          dataOnly: afterClaim.dataOnly,
        };
        publishJobEvent({ type: "done", revision: afterClaim.revision, ...result });
        return result;
      }
      if (afterClaim?.status === "error" && afterClaim.error !== null) {
        throw new Error(afterClaim.error);
      }
      throw new Error(
        `runJob: job "${jobId}" was already dispatched, already claimed, or blocked by scheduler capacity`,
      );
    }
    jobRow = getDb().select().from(jobs).where(eq(jobs.id, jobId)).get();
    if (jobRow === undefined) throw new Error(`runJob: job "${jobId}" disappeared after durable claim`);
  }

  if (
    jobRow.status !== "running" ||
    jobRow.runGeneration !== schedulerClaim.runGeneration ||
    jobRow.leaseOwner !== schedulerClaim.leaseOwner ||
    jobRow.leaseExpiresAt === null ||
    jobRow.leaseExpiresAt <= new Date().toISOString()
  ) {
    const reason =
      jobRow.status === "running" && jobRow.leaseOwner === schedulerClaim.leaseOwner
        ? "expired live preclaim"
        : jobRow.status === "running"
          ? "already dispatched"
          : `not active (status ${jobRow.status})`;
    throw new Error(`runJob: job "${jobId}" has no exact preclaimed authority (${reason})`);
  }
  const preparedResume = schedulerClaim.preparedResume;

  const state: RunState = {
    jobId,
    symbol: jobRow.symbol,
    startedAt: jobRow.createdAt,
    runGeneration: jobRow.runGeneration,
    revision: jobRow.revision,
    claim: schedulerClaim,
    schedulerLimits,
    steps: initialSteps(),
    // Rehydrate any cost already logged under this jobId BEFORE any early exit
    // (no-key / model-resolution-failure / compute-throw): a resumed run's
    // degraded report must still carry the job's true all-in cost. A fresh
    // job's cost_log is empty, so this is a no-op there.
    totalCostUsd: sumLoggedCost(jobId),
    assemblyRejected: [],
  };
  const jobController = new AbortController();
  const jobSignal = jobController.signal;
  const externalSignal = opts.signal;
  const onExternalAbort = (): void => {
    if (!jobController.signal.aborted) {
      jobController.abort(externalSignal?.reason ?? new JobCanceledError("job canceled upstream"));
    }
  };
  if (externalSignal?.aborted) onExternalAbort();
  else externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

  const deadlineMs = positiveDeadline(opts.deadlineMs, DEFAULT_JOB_DEADLINE_MS);
  const fetchDeadlineMs = positiveDeadline(opts.fetchDeadlineMs, DEFAULT_FETCH_DEADLINE_MS);
  let modelStageDeadlineMs = positiveDeadline(
    opts.modelStageDeadlineMs,
    DEFAULT_MODEL_STAGE_DEADLINE_MS,
  );
  const runStartedAt = Date.now();
  const armOverallDeadline = (ms: number): ReturnType<typeof setTimeout> => {
    const timer = setTimeout(() => {
      if (!jobController.signal.aborted) {
        jobController.abort(new JobDeadlineError(`overall deadline exceeded after ${ms}ms`));
      }
    }, Math.max(0, ms - (Date.now() - runStartedAt)));
    timer.unref?.();
    return timer;
  };
  let overallTimer = armOverallDeadline(deadlineMs);
  try {
    persistSteps(state);
  } catch (error) {
    clearTimeout(overallTimer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
    throw error;
  }

  // Process-local cancellation registration plus durable exact-claim renewal.
  liveJobIds().add(jobId);
  liveJobControllers().set(jobId, jobController);
  const heartbeatBeatMs = Math.max(1, Math.floor(state.schedulerLimits.jobLeaseTtlMs / JOB_LEASE_RENEWAL_DIVISOR));
  let jobLeaseKnownExpiresAtMs = Date.parse(state.claim.leaseExpiresAt);
  const heartbeat = setInterval(() => {
    const beatStartedMs = Date.now();
    try {
      if (!renewJobLease(state.claim, undefined, state.schedulerLimits)) {
        jobController.abort(new SupersededRunError(state.jobId, state.runGeneration));
      } else {
        jobLeaseKnownExpiresAtMs = beatStartedMs + state.schedulerLimits.jobLeaseTtlMs;
      }
    } catch (error) {
      if (renewalFailureTolerable({ error, knownLeaseExpiresAtMs: jobLeaseKnownExpiresAtMs,
        nowMs: Date.now(), beatMs: heartbeatBeatMs, busyTimeoutMs: connectionBusyTimeoutMs() })) return;
      jobController.abort(error);
    }
  }, heartbeatBeatMs);
  heartbeat.unref?.();

  const now = opts.now ?? ((): Date => new Date());
  const overloadBackoffMs = Math.max(0, opts.overloadBackoffMs ?? OVERLOAD_BACKOFF_MS);
  /** Wait out a provider overload before retrying; returns early if the job is canceled. */
  const backOffIfOverloaded = async (err: unknown, attemptNumber: number, step: PipelineStep): Promise<void> => {
    if (!providerWasBusy(err) || overloadBackoffMs === 0) return;
    const wait = overloadBackoffMs * attemptNumber;
    updateRunningStepDetail(state, step, `provider reported it is overloaded or failing; waiting ${Math.round(wait / 1000)}s before retrying`);
    await new Promise<void>((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        jobSignal.removeEventListener("abort", done);
        resolve();
      };
      const timer = setTimeout(done, wait);
      jobSignal.addEventListener("abort", done, { once: true });
    });
    throwIfJobAborted(jobSignal);
  };
  const maxJudgeRetries =
    opts.maxJudgeRetries !== undefined && Number.isFinite(opts.maxJudgeRetries)
      ? Math.min(MAX_JUDGE_RETRIES, Math.max(0, Math.trunc(opts.maxJudgeRetries)))
      : MAX_JUDGE_RETRIES;

  try {
    throwIfJobAborted(jobSignal);

    // A durable verify artifact is already the schema-valid final output. It
    // needs no live data, key, model lookup, or rebuilt payload: link that exact
    // report before any prerequisite can turn a completed result into failure.
    if (opts.resume === true && preparedResume?.verify !== null && preparedResume?.verify !== undefined) {
      for (const step of ["fetch", "validate", "compute", "bull", "bear", "synthesize"] as const) {
        markSkipped(state, step, "covered by reused durable verify artifact");
      }
      startStep(state, "verify");
      finishStep(
        state,
        "verify",
        "done",
        `reused durable verify from retry lineage rooted at generation ${preparedResume.sourceGeneration}`,
        preparedResume.verify.costUsd,
      );
      const recoveredReport = reconcileRecoveredVerifyReport(state, preparedResume.verify);
      const verificationRate = recoveredReport.meta.verificationRate;
      const reportId = persistReport(
        state,
        recoveredReport,
        recoveredReport.meta.model,
        verificationRate,
        "done",
      );
      return finishRun(state, { reportId, verificationRate, dataOnly: false });
    }
    const aiSelection = opts.aiSelection === undefined
      ? opts.hasAnthropicKey === undefined ? captureAiSelection() : { provider: "anthropic" as const }
      : structuredClone(opts.aiSelection);
    const capturedSettings = getWritableSettingsAuthority();
    const hasKey = opts.hasAnthropicKey ?? selectionIsConnected(aiSelection);
    // A plan connection gets the longer bounds, unless the caller set its own.
    if ("connectionId" in aiSelection) {
      if (opts.deadlineMs === undefined) {
        clearTimeout(overallTimer);
        overallTimer = armOverallDeadline(SUBSCRIPTION_JOB_DEADLINE_MS);
      }
      if (opts.modelStageDeadlineMs === undefined) modelStageDeadlineMs = SUBSCRIPTION_MODEL_STAGE_DEADLINE_MS;
    }

    // -- fetch ----------------------------------------------------------------
    startStep(state, "fetch");
    if (!isValidSymbol(state.symbol)) {
      return finishUnsupported(state, { supported: false, kind: "unknown",
        reason: "Malformed ticker symbol; company analysis is unsupported. No data or AI request was admitted." });
    }
    // Audit 2026-10-22 F-12: a plan connection owned by another Metis server
    // ends the job here, in one attempt, before any data is fetched. Any other
    // store problem is left to the pass, which reports its own reason. A
    // signed-out connection runs no pass, so it claims nothing.
    if ("connectionId" in aiSelection && hasKey) {
      try {
        await (opts.claimAiRuntime ?? claimAiRuntimeForRun)();
      } catch (err) {
        if (isAiRuntimeConflict(err)) return failRun(state, "fetch", new Error(`${AI_RUNTIME_CONFLICT_MESSAGE} ${AI_RUNTIME_CONFLICT_HELP}`));
      }
      throwIfJobAborted(jobSignal);
    }
    let bundle: DataBundle;
    let stageBConfig = { evIncludeLeases: getConfig().evIncludeLeases };
    let frozenInputDetail: string | null = null;
    try {
      const sourceRef = opts.resume === true && preparedResume !== null &&
        (preparedResume.bull !== null || preparedResume.bear !== null || preparedResume.synthesize !== null)
        ? readJobRunSnapshotRef(state.jobId, preparedResume.sourceGeneration) : null;
      const sourceSnapshot = sourceRef === null ? null : readRunInputSnapshot(sourceRef.hash);
      const frozen = sourceSnapshot !== null && Object.entries(CURRENT_SNAPSHOT_VERSIONS)
        .every(([key, value]) => sourceSnapshot.content.versions[key as keyof typeof CURRENT_SNAPSHOT_VERSIONS] === value)
        ? sourceSnapshot : null;
      bundle =
        frozen?.content.bundle ??
        opts.bundle ??
        (await awaitJobStage(withFreshCacheReads(() => buildDataBundle(state.symbol, {
          ...opts.bundleOptions,
          signal: jobSignal,
          onProgress: (msg) => {
            if (jobSignal.aborted) return;
            const s = findStep(state, "fetch");
            s.detail = msg;
            // Lightweight progress: persist + emit without changing status.
            persistSteps(state);
            emitStep(state, "fetch");
          },
        })), jobSignal, jobController, "fetch", fetchDeadlineMs));
      throwIfJobAborted(jobSignal);
      if (frozen !== null) stageBConfig = frozen.content.stageBConfig;
      const inputSnapshot = frozen ?? captureRunInputSnapshot(bundle, stageBConfig, undefined, getRuntimeSnapshotArtifactIdentity());
      const captured = withLiveRunAuthority(state, null, (db, _row, authorityAt) =>
        persistRunInputSnapshot(state.jobId, state.runGeneration, inputSnapshot, frozen !== null ? sourceRef!.capturedAt : authorityAt, db));
      if (!captured.authorized) throw new SupersededRunError(state.jobId, state.runGeneration);
      if (frozen !== null) frozenInputDetail = `reused frozen inputs of generation ${preparedResume!.sourceGeneration} (captured ${sourceRef!.capturedAt}) \u2014 ${bundle.gaps.length} gap(s)`;
      // The snapshot is the authority actually consumed, including redacted raw
      // envelopes and normalized JSON semantics, not a later cache reconstruction.
      bundle = inputSnapshot.content.bundle;
    } catch (err) {
      throwIfJobAborted(jobSignal);
      // A hard fetch failure is terminal for the whole run — there is nothing
      // downstream can compute from. Record it and finish with error.
      return failRun(state, "fetch", err);
    }
    finishStep(
      state,
      "fetch",
      "done",
      frozenInputDetail ?? `data bundle for ${state.symbol} (${bundle.gaps.length} gap(s))`,
    );

    // -- validate -------------------------------------------------------------
    startStep(state, "validate");
    let validation: ValidationReport;
    try {
      validation = validateBundle(bundle, { now: now() });
    } catch (err) {
      validation = { checks: [], flags: [], gaps: [gapFor("validate", err)] };
    }
    throwIfJobAborted(jobSignal);
    finishStep(
      state,
      "validate",
      "done",
      `${validation.checks.length} check(s), ${validation.flags.length} flag(s)`,
    );

    const validatedSupport = classifyInstrumentSupport(
      bundle.profile.ok ? (bundle.profile.value.data.rows[0] ?? null) : null,
    );
    if (!validatedSupport.supported) {
      // A positive empty response is different from a transport failure. Neither
      // admits a company report, a model resolution, or a paid request lease.
      // P5 (P11, D-242): by the typed causes; entries without one by their sentences.
      const confirmedMiss = isConfirmedUnknownProfile(bundle);
      if (validatedSupport.kind === "unknown" && confirmedMiss) {
        return finishUnsupported(state, { ...validatedSupport,
          reason: `Ticker ${bundle.symbol} was not found in the company sources. It may be invalid or delisted; no report was saved and no AI request was admitted.` });
      }
      return finishUnsupported(state, validatedSupport);
    }

    // -- compute --------------------------------------------------------------
    startStep(state, "compute");
    let computed: ComputedMetrics;
    try {
      computed = runStageB(bundle, stageBConfig, validation);
      // Preserve the captured raw snapshot; all later Stage C consumers receive admitted rows.
      bundle = balanceIntegrityView(bundle);
    } catch (err) {
      // Compute is pure; a throw here is a programming error, but degrade
      // rather than crash the app: finish compute with error and continue to
      // persist a data-only stub. The report is the durable record (the step
      // detail is transient UI), so the exception itself goes into the
      // manifest as a critical `pipeline.compute` entry, and the data-only
      // reason names it instead of pointing at pass errors that never ran.
      finishStep(state, "compute", "error", errMessage(err));
      return persistDataOnly(state, bundle, validation, null, now, hasKey, {
        reason: COMPUTE_FAILURE_DATA_ONLY_REASON,
        gaps: [{ ...gapFor("compute", err), severity: "critical" }],
      });
    }
    throwIfJobAborted(jobSignal);
    finishStep(
      state,
      "compute",
      "done",
      `route ${computed.route.base}${computed.route.overlays.length > 0 ? ` +${computed.route.overlays.join("/")}` : ""}, ${computed.gaps.length} gap(s)`,
    );

    // Defense in depth at the Stage C boundary: no payload assembly, model
    // resolution, or paid dispatch may proceed if a future caller bypasses the
    // post-validation gate above.
    const stageCSupport = classifyInstrumentSupport(
      bundle.profile.ok ? (bundle.profile.value.data.rows[0] ?? null) : null,
    );
    if (!stageCSupport.supported) return finishUnsupported(state, stageCSupport);

    // An unresolved issuer (no profile, quote, prices or annual income rows —
    // a mistyped or delisted ticker) gives the analysts nothing to reason
    // about. Skip the paid passes and persist the disclosed data-only report.
    if (!hasAnalyzableData(bundle)) {
      for (const step of LLM_STEPS) {
        startStep(state, step);
        finishStep(state, step, "skipped", NO_ANALYZABLE_DATA_REASON);
      }
      return persistDataOnly(state, bundle, validation, computed, now, hasKey, {
        reason: NO_ANALYZABLE_DATA_REASON,
      });
    }

    const reusableSynthesize = opts.resume === true
      ? (preparedResume?.synthesize ?? null)
      : null;

    // -- no-key degraded path -------------------------------------------------
    // A reusable synthesize artifact has already completed every key-dependent
    // pass. Its remaining verification/report assembly is deterministic and
    // must not depend on a currently configured provider key.
    if (!hasKey && reusableSynthesize === null) {
      for (const step of LLM_STEPS) {
        startStep(state, step);
        finishStep(state, step, "skipped", aiSelection.provider === "anthropic" ? NO_KEY_SKIP_REASON : "AI is off or the selected connection needs sign-in");
      }
      return persistDataOnly(state, bundle, validation, computed, now, hasKey, {
        reason: aiSelection.provider === "anthropic" ? NO_KEY_SKIP_REASON : "AI is off or the selected connection needs sign-in. Open Settings → AI connections. No paid fallback was attempted.",
      });
    }

    // Legacy or injected Stage C adapters must not be trusted to launch paid
    // work after a durable cancel/owner change. This capability is explicit so
    // the runner fails closed before even an "auto" model-resolution request.
    if (passes.launchAuthorityCapability !== DURABLE_LAUNCH_AUTHORITY_CAPABILITY) {
      for (const step of LLM_STEPS) {
        startStep(state, step);
        finishStep(state, step, "skipped", LAUNCH_AUTHORITY_SKIP_REASON);
      }
      return persistDataOnly(state, bundle, validation, computed, now, hasKey, {
        reason: `${LAUNCH_AUTHORITY_SKIP_REASON} — no model was called; this is a data-only report.`,
      });
    }

    // -- resolve models -------------------------------------------------------
    // Model resolution ("auto" hits client.models.list()) can throw on a
    // transient Anthropic transport/auth failure. That is NOT a reason to fail
    // the whole job — degrade like the no-key path: mark the four LLM steps
    // "skipped" with the resolution error and still persist a data-only report
    // Only genuinely unexpected
    // failures downstream still reach the outer catch and 'error'.
    let analysisModel: string;
    let analysisEffort: EffortLevel;
    if (reusableSynthesize !== null) {
      analysisModel = reusableSynthesize.model;
      analysisEffort = capturedSettings.state.analysisEffort;
    } else {
      try {
        const analysisResolved = await awaitJobStage(
          "connectionId" in aiSelection
            ? Promise.resolve({ model: requestedAnalysisModel(aiSelection, capturedSettings.state.analysisModel) })
            : resolveModel(requestedAnalysisModel(aiSelection, capturedSettings.state.analysisModel)),
          jobSignal,
          jobController,
          "model resolution",
          fetchDeadlineMs,
        );
        analysisModel = analysisResolved.model;
        analysisEffort = capturedSettings.state.analysisEffort;
      } catch (err) {
        throwIfJobAborted(jobSignal);
        const reason = `${MODEL_RESOLUTION_SKIP_PREFIX}: ${errMessage(err)}`;
        for (const step of LLM_STEPS) {
          startStep(state, step);
          finishStep(state, step, "skipped", reason);
        }
        // D-02: when the stored value is one the registry refuses (a dated
        // snapshot for a 4.6+ family, say), the run degrades with a named
        // cause rather than a transport accident. Disclose it as the
        // `model-rejected` execution adjustment so the data-only report says
        // which value was refused and what is accepted instead.
        const rejection = explainAnalysisModel(capturedSettings.state.analysisModel);
        return persistDataOnly(state, bundle, validation, computed, now, hasKey, {
          // The resolution error is the cause; the shared wording would have
          // sent the reader to pass errors no pass ever produced.
          reason: `${reason} — no model was called; this is a data-only report.`,
          execution: rejection === null
            ? undefined
            : LLM_STEPS.map((step) => buildExecutionMetadataEntry({
                step,
                requestedModel: capturedSettings.state.analysisModel,
                effectiveModel: "none",
                requestedEffort: capturedSettings.state.analysisEffort,
                fallbackUsed: false,
                rejectedReason: rejection,
              })),
        });
      }
    }

    // -- assemble payload (deterministic) -------------------------------------
    const payload = passes.assembleContextPayload(bundle, computed, validation);
    // Each pass registers its checkpoint's admission here as it is created, so
    // the Stage C adapter can reserve every provider request the pass makes.
    const passAdmissions = new Map<DurablePass, RequestAdmission>();
    const passAttemptIds = new Map<DurablePass, string>();
    const deps: PassDeps<TPayload> = {
      analysisModel,
      ...("connectionId" in aiSelection ? { connectionId: aiSelection.connectionId } : {}),
      ...(aiSelection.provider === "chatgpt" || aiSelection.provider === "claude" ? { subscriptionOptions: {
        ...(aiSelection.effort === undefined ? {} : { effort: aiSelection.effort }),
        ...(aiSelection.serviceTier === undefined ? {} : { serviceTier: aiSelection.serviceTier }),
      } } : {}),
      effort: analysisEffort,
      payload,
      jobSeed: jobId, // WS7 (D-20): seeds the judge's case order
      runGeneration: state.runGeneration,
      passAttemptFor: (pass) => {
        const attemptId = passAttemptIds.get(pass);
        return attemptId ? { jobId, runGeneration: state.runGeneration, attemptId } : undefined;
      },
      signal: jobSignal,
      ...(usesRequestAdmission()
        ? { admissionFor: (pass: DurablePass) => passAdmissions.get(pass) }
        : {}),
    };
    const fingerprint = bindAiFingerprint(passes.fingerprintPayload?.(payload) ?? null, aiSelection);
    if (preparedResume !== null && fingerprint !== preparedResume.payloadFingerprint) {
      throw new Error(
        "runJob: resume payload fingerprint mismatch; stored pass artifacts are incompatible — start a fresh job",
      );
    }

    // -- paid budget feasibility (before the first paid request) -------------
    // Admission refuses a request whose worst case does not fit what the job
    // has spent and reserved under the caps, but only when the run reaches it,
    // after every earlier pass has been paid for. Spend only grows during a
    // run, so if the largest reservation the remaining work asks for does not
    // fit now, it never will: launch nothing and finish the way any other
    // prelaunch degradation does (a data-only report that adds no cost). Each
    // entry path calls this before its first new paid request: a fresh run, a
    // resumed run before its missing analyst side or judge, and a reused
    // synthesize before verify. Retries keep the job's recorded cap (D-120), so
    // a retry that cannot finish is refused here too instead of spending first.
    const refuseUnaffordableRun = (work: RemainingPaidWork): RunJobResult | null => {
      const blocked = largestPlannedReservation(
        plannedPaidReservations(analysisModel, work, passes.verifyCapability),
      );
      if (blocked === null) return null;
      const refusal = paidReservationCapRefusal(state.jobId, blocked.reservationUsd, state.schedulerLimits);
      if (refusal === null) return null;
      const reason = paidBudgetRefusalReason(blocked, refusal);
      for (const step of LLM_STEPS) markSkipped(state, step, reason);
      return persistDataOnly(state, bundle, validation, computed, now, hasKey, { reason });
    };

    // -- synthesize (judge) + verify + assemble, with retry-on-Zod --
    // The rule: "on validation failure, retry with the error fed back (max 2
    // retries), then fail loudly." The judge/verify/assemble unit is retried as
    // a whole: a schema-validation failure at the judge pass OR at report
    // assembly (the assembled Report can fail the fuller ReportSchema even when
    // the JudgeOutput passed JUDGE_OUTPUT_SCHEMA) re-invokes the judge, feeding
    // the error back, up to maxJudgeRetries extra attempts. When they are all
    // exhausted we mark synthesize + verify "error" LOUDLY with the validation
    // detail and persist what we have (data-only) rather than crashing.
    // Shared by the fresh path and the resume path (which feeds it persisted
    // snapshots instead of fresh passes). verify is NOT started up front — it
    // starts when it actually runs (after a successful judge attempt) so its
    // timestamps reflect the real pass.
    const runSynthesisAndFinish = async (
      bull: PassResultLike<AnalystCase> | null,
      bear: PassResultLike<AnalystCase> | null,
      reusableJudge: PassResultLike<JudgeOutput> | null = null,
    ): Promise<RunJobResult> => {
      startStep(state, "synthesize");

      const buildMeta = (
        verificationRate: number | null,
        judge: PassResultLike<JudgeOutput>,
      ): ReportMetaInput => ({
        symbol: state.symbol,
        companyName: companyNameOf(bundle, state.symbol),
        // Generation completes after verification data exists; persistence is
        // stamped separately by persistReport.
        generatedAt: now().toISOString(),
        model: analysisModel,
        // Preserve the exact sum in report JSON. Presentation rounds each row
        // and the displayed total to six decimals through the shared formatter.
        costUsd: state.totalCostUsd,
        verificationRate,
        asOfMap: { ...bundle.asOf },
        runId: state.jobId,
        startedAt: state.startedAt,
        execution: [
          ...readSuccessfulExecutions(state.jobId, analysisModel).filter((entry) =>
            (entry.step === "bull" && bull === null) || (entry.step === "bear" && bear === null)),
          ...(bull === null
            ? []
            : [buildExecutionMetadataEntry({
                step: "bull",
                requestedModel: analysisModel,
                effectiveModel: bull.model,
                requestedEffort: analysisEffort,
                fallbackUsed: bull.fallbackUsed,
                execution: bull.execution,
                usage: bull.usage,
              })]),
          ...(bear === null
            ? []
            : [buildExecutionMetadataEntry({
                step: "bear",
                requestedModel: analysisModel,
                effectiveModel: bear.model,
                requestedEffort: analysisEffort,
                fallbackUsed: bear.fallbackUsed,
                execution: bear.execution,
                usage: bear.usage,
              })]),
          buildExecutionMetadataEntry({
            step: "synthesize",
            requestedModel: analysisModel,
            effectiveModel: judge.model,
            requestedEffort: analysisEffort,
            fallbackUsed: judge.fallbackUsed,
            execution: judge.execution,
            usage: judge.usage,
          }),
          buildExecutionMetadataEntry({
            step: "verify",
            requestedModel: "deterministic",
            effectiveModel: "deterministic",
            requestedEffort: null,
            fallbackUsed: false,
          }),
        ],
      });

      let assembled: {
        report: Report;
        verificationRate: number | null;
        verifyLog: unknown;
        meta: ReportMetaInput;
        costBreakdown: { step: string; model: string; costUsd: number }[];
      } | null = null;
      let lastValidationDetail = "";
      // What the next judge attempt is told to repair. A dropped connection is
      // not something the model can repair, so it neither becomes feedback nor
      // erases the feedback an earlier rejected output left behind.
      let lastFeedbackDetail = "";
      // Sections a cut-off judge response completed. The next attempt asks only
      // for the rest and merges these back in before validation, instead of
      // regenerating (and running into the provider's time limit again).
      let carriedSections: Record<string, unknown> = {};
      // Attempts that ran into the provider's response time limit. Each one
      // shrinks the next section batch, keeping the captured run settings.
      let timeLimitCutoffs = 0;
      let sectionRequestsUsed = 0;
      let sectionMaxKeys: number | undefined;
      let repairRejectedComplete = false;
      let lastFailedRawOutput = "";
      let lastJudgeFailureRetryable = true;
      let judgeAttemptsBusy = 0;
      let lastJudgeBusy = false;
      let judgeAttemptsInTransit = 0;
      let lastJudgeInTransit = false;
      let judgeAttemptsSeen = 0;
      // AI-112: the issue key of the previous attempt's assembly failure. The same
      // failure twice means the judge cannot repair it, so it is not bought again.
      let previousAssemblyIssueKey: string | null = null;
      let judgeProviderAttempted = false;
      let pendingReusableJudge = reusableJudge;

      for (let attempt = 0; attempt <= maxJudgeRetries; attempt++) {
        judgeAttemptsSeen = attempt + 1;
        // 1) Judge pass. A throw here is a synthesis failure (schema-invalid
        //    structured output in the real facade, or a mock rejection). It is
        //    retryable — feed the error back by re-invoking the judge,
        //    together with the failed raw output so the model repairs its previous
        //    JSON instead of regenerating the whole document from scratch.
        let judge: PassResultLike<JudgeOutput>;
        if (pendingReusableJudge !== null) {
          judge = pendingReusableJudge;
          pendingReusableJudge = null;
          finishStep(
            state,
            "synthesize",
            "done",
            `reused durable synthesize from retry lineage rooted at generation ${preparedResume?.sourceGeneration ?? "unknown"}`,
            judge.costUsd,
          );
        } else {
          if (bull === null || bear === null) {
            lastValidationDetail = "durable synthesize artifact could not be assembled without rerunning upstream paid work";
            lastJudgeFailureRetryable = false;
            break;
          }
          const continuation: PassContinuation | undefined =
            Object.keys(carriedSections).length > 0 || timeLimitCutoffs > 0 || sectionRequestsUsed > 0 || repairRejectedComplete
              ? { completed: carriedSections, ...(sectionRequestsUsed > 0 ? { sectionRequestsUsed } : {}),
                  ...(repairRejectedComplete ? { repairRejectedComplete: true } : {}),
                  ...(sectionMaxKeys === undefined ? {} : { sectionMaxKeys }), ...(timeLimitCutoffs > 0 ? { sectionRetryCount: timeLimitCutoffs } : {}) }
              : undefined;
          const attemptStartedAt = now().getTime();
          const feedback =
            lastFeedbackDetail.length > 0
              ? lastFailedRawOutput.length > 0
                ? `${lastFeedbackDetail}\n\n${previousOutputBlock(lastFailedRawOutput)}`
                : lastFeedbackDetail
              : undefined;
          const judgeCheckpoint = createSettlementCheckpoint<JudgeOutput>(
            state,
            "synthesize",
            fingerprint,
            passReservationUsd(analysisModel, "synthesize"),
            jobSignal,
            jobController,
            analysisModel,
          );
          try {
            await passes.preflightPass?.(deps, {
              pass: "synthesize",
              bull,
              bear,
              validationFeedback: feedback,
              ...(continuation === undefined ? {} : { continuation }),
            });
            passAdmissions.set("synthesize", judgeCheckpoint.admission);
            passAttemptIds.set("synthesize", judgeCheckpoint.attemptId);
            await judgeCheckpoint.beforeLaunch();
            judge = await awaitJobStage(
              passes.runJudgePass(
                deps,
                bull,
                bear,
                feedback,
                judgeCheckpoint.hook,
                () => {
                  judgeCheckpoint.authorizeLaunch(false);
                },
                continuation,
              ),
              jobSignal,
              jobController,
              "synthesize",
              modelStageDeadlineMs,
            );
            throwIfJobAborted(jobSignal);
            judgeProviderAttempted = true;
            if (!judgeCheckpoint.wasCalled() && judgeCheckpoint.hasLease()) {
              await judgeCheckpoint.hook(successSettlement(judge));
            }
          } catch (err) {
            throwIfJobAborted(jobSignal);
            if (err instanceof PassSettlementHookError) throw err;
            const billedAttempt = billedAttemptFromError(err);
            judgeProviderAttempted ||= judgeCheckpoint.wasLaunched() || billedAttempt !== null;
            lastJudgeInTransit = isTransportFailure(err);
            lastJudgeBusy = providerWasBusy(err);
            if (lastJudgeBusy) judgeAttemptsBusy++;
            else if (lastJudgeInTransit) judgeAttemptsInTransit++;
            lastValidationDetail = errMessage(err);
            repairRejectedComplete = false;
            if (err !== null && typeof err === "object") {
              const recovery = err as { sectionRequestsUsed?: number; sectionMaxKeys?: number; kind?: string; repairRejectedComplete?: boolean };
              repairRejectedComplete = recovery.repairRejectedComplete === true;
              if (Number.isSafeInteger(recovery.sectionRequestsUsed) && recovery.sectionRequestsUsed! >= 0) sectionRequestsUsed = Math.max(sectionRequestsUsed, recovery.sectionRequestsUsed!);
              if (Number.isSafeInteger(recovery.sectionMaxKeys) && recovery.sectionMaxKeys! > 0) sectionMaxKeys = Math.min(sectionMaxKeys ?? Infinity, recovery.sectionMaxKeys!);
              if (recovery.kind === "max_tokens" && sectionRequestsUsed > 0) timeLimitCutoffs++;
            }
            let keptNote = "";
            if (!isTransportFailure(err)) {
              lastFeedbackDetail = lastValidationDetail;
              lastFailedRawOutput = rawTextOfError(err);
              // Whole-object semantic rejection requires a new synthesis;
              // partial schema/cutoff recovery retains independently valid sections.
              carriedSections = repairRejectedComplete ? {} : checkCarried(passes, "synthesize", { ...completedTopLevelFields(partialTextOfError(err)), ...carriedSections }).kept;
            } else {
              const checked = checkCarried(passes, "synthesize", { ...completedTopLevelFields(partialTextOfError(err)), ...carriedSections });
              carriedSections = checked.kept;
              const kept = Object.keys(carriedSections);
              if (kept.length > 0) {
                keptNote = ` (kept ${kept.length} completed section${kept.length === 1 ? "" : "s"} of the cut-off response: ${kept.join(", ")}; the retry asks only for the rest)`;
              }
              if (checked.dropped.length > 0) {
                const n = checked.dropped.length;
                keptNote += ` (dropped ${n} cut-off section${n === 1 ? "" : "s"} that did not match ${n === 1 ? "its" : "their"} schema, so the retry writes ${n === 1 ? "it" : "them"} again: ${checked.dropped.join(", ")})`;
              }
              if (now().getTime() - attemptStartedAt >= SUBSCRIPTION_TIME_LIMIT_NEAR_MS) {
                timeLimitCutoffs += 1;
                keptNote += " (the response ran into the provider's time limit; the retry reduces section batch size while preserving the selected model, reasoning effort and speed)";
              }
            }
            lastJudgeFailureRetryable = isRetryableJudgeError(err);
            if (
              !judgeCheckpoint.wasCalled() &&
              (judgeCheckpoint.wasLaunched() || billedAttempt !== null)
            ) {
              await judgeCheckpoint.hook(
                failureSettlement(
                  err,
                  telemetryFromAttempt(billedAttempt, analysisModel),
                  { retryable: lastJudgeFailureRetryable },
                ),
              );
            }
            const retrying = lastJudgeFailureRetryable && attempt < maxJudgeRetries;
            const detail = `judge attempt ${attempt + 1}/${maxJudgeRetries + 1} failed${retrying ? "; retrying" : ""}: ${withPlainIssueList(lastValidationDetail)}${keptNote}`;
            if (retrying) {
              startStep(state, "synthesize");
              await backOffIfOverloaded(err, attempt + 1, "synthesize");
              updateRunningStepDetail(state, "synthesize", detail);
              continue;
            }
            updateRunningStepDetail(state, "synthesize", detail);
            break;
          } finally {
            // A launched/canceled call keeps its durable reservation, but the
            // exited worker must not retain a process-local renewal interval.
            judgeCheckpoint.releaseIfPrelaunch();
            judgeCheckpoint.stopRenewal();
          }
        }

        // 2) Verification failure does not buy another judge attempt. Preserve
        //    its durable artifact, mark verify "error", and let the mandatory
        //    completion gate persist a deterministic snapshot.
        let verificationRate: number | null = null;
        let verifiedReport: Report | null = null;
        let verifyLog: unknown = undefined;
        let verifyError: string | null = null;
        startStep(state, "verify");
        const verifyCheckpoint = createSettlementCheckpoint<Report>(
          state,
          "verify",
          fingerprint,
          passReservationUsd(analysisModel, "verify", passes.verifyCapability),
          jobSignal,
          jobController,
          analysisModel,
        );
        // Verification measures citation coverage against the evidence the run
        // actually gathered. On a synthesize-reuse resume `bull`/`bear` are null
        // by design (synthesize already holds their conclusion), so their
        // web-search URLs come from the durable artifacts instead — without them
        // verify checked against a smaller evidence set and understated the
        // coverage of a report whose analysts had fetched those sources.
        const fetchedUrls = [
          ...new Set(
            [
              ...(bull?.fetchedUrls ?? []),
              ...(bear?.fetchedUrls ?? []),
              ...(bull === null && bear === null ? (preparedResume?.analystFetchedUrls ?? []) : []),
              ...(judge.fetchedUrls ?? []),
            ].flatMap((value) => {
              const canonical = canonicalizeFetchedUrl(value);
              return canonical ? [canonical] : [];
            }),
          ),
        ].sort();
        const retainedTexts = [
          ...analystVerificationTexts("bull", bull),
          ...analystVerificationTexts("bear", bear),
          // Resume can reuse an analyst from an earlier generation of this job.
          // Earlier generations need the exact frozen-payload cohort; current
          // generation attempts were held by this run, including retained failures.
          ...analystArtifactVerificationTexts(readJobPassArtifactLineage(state.jobId).filter(artifact =>
            artifact.runGeneration === state.runGeneration || (fingerprint !== null && artifact.envelope.payloadFingerprint === fingerprint))),
        ];
        const evidence = { fetchedUrls, retainedTexts: [...new Map(retainedTexts.map(item => [JSON.stringify(item), item])).values()] };
        try {
          if (passes.verifyCapability?.billable === true && passes.preflightPass === undefined) {
            throw new Error("billable verify requires finite provider preflight capability");
          }
          await passes.preflightPass?.(deps, {
            pass: "verify",
            judgeOutput: judge.data,
            evidence,
          });
          // A billable verify adapter reserves each of its provider requests
          // through this admission, like the other three passes; without the
          // registration its requests went out unadmitted against a lease
          // sized for exactly one of them (D-10).
          passAdmissions.set("verify", verifyCheckpoint.admission);
          passAttemptIds.set("verify", verifyCheckpoint.attemptId);
          await verifyCheckpoint.beforeLaunch();
          const v = await awaitJobStage(
            passes.runVerifyPass(
              deps,
              judge.data,
              evidence,
              verifyCheckpoint.hook,
              () => {
                // Verify was already moved to running above. The atomic launch
                // transaction still renews/fences both exact leases and the
                // current revision at its logical execution boundary.
                verifyCheckpoint.authorizeLaunch(false);
              },
            ),
            jobSignal,
            jobController,
            "verify",
            modelStageDeadlineMs,
          );
          throwIfJobAborted(jobSignal);
          verificationRate = v.verificationRate;
          verifyLog = v.log;
          const parsedVerifiedReport = ReportSchema.safeParse(v.verifiedReport);
          const billable = typeof v.costUsd === "number";
          const verifyTelemetry: PassTelemetry = {
            model: v.model ?? (billable ? analysisModel : "deterministic"),
            inputTokens: numOr0(v.usage?.input_tokens),
            outputTokens: numOr0(v.usage?.output_tokens),
            cacheReadTokens: numOr0(v.usage?.cache_read_input_tokens),
            cacheWriteTokens: numOr0(v.usage?.cache_creation_input_tokens),
            webSearches: numOr0(v.webSearches),
            costUsd: v.costUsd ?? 0,
            fallbackUsed: v.fallbackUsed ?? false,
            billable,
            fetchedUrls: [],
          };
          if (!verifyCheckpoint.wasCalled() && verifyCheckpoint.hasLease()) {
            await verifyCheckpoint.hook(
              parsedVerifiedReport.success
                ? { outcome: "success", data: parsedVerifiedReport.data, telemetry: verifyTelemetry }
                : failureSettlement(
                    new Error("verify returned no schema-valid report"),
                    verifyTelemetry,
                    { kind: "schema" },
                  ),
            );
          }
          if (parsedVerifiedReport.success) {
            verifiedReport = parsedVerifiedReport.data;
          } else {
            verifyError = "verify returned no schema-valid report";
          }
        } catch (err) {
          throwIfJobAborted(jobSignal);
          if (err instanceof PassSettlementHookError) throw err;
          verifyError = errMessage(err);
          const billedAttempt = billedAttemptFromError(err);
          if (
            !verifyCheckpoint.wasCalled() &&
            (verifyCheckpoint.wasLaunched() || billedAttempt !== null)
          ) {
            await verifyCheckpoint.hook(
              failureSettlement(
                err,
                telemetryFromAttempt(billedAttempt, billedAttempt ? analysisModel : "deterministic"),
              ),
            );
          }
          const detail = `verify failed; assembling unverified report: ${verifyError}`;
          const verifyStatus = findStep(state, "verify").status;
          if (verifyStatus === "running") {
            // A prelaunch adapter exit has no artifact to merge, but the
            // user-visible step must still become terminal before the
            // unverified report commits. This does not fabricate billing.
            finishStep(state, "verify", "error", detail);
          } else if (verifyStatus === "error") {
            // A launched failure was already settled atomically. Preserve that
            // durable outcome while attaching the runner's degradation detail.
            updateRunningStepDetail(state, "verify", detail);
          }
        } finally {
          verifyCheckpoint.releaseIfPrelaunch();
          verifyCheckpoint.stopRenewal();
        }

        // 3) Assemble the final Report. A throw here is a report-schema (Zod)
        //    validation failure — retryable (re-invoke the judge).
        const meta = buildMeta(verificationRate, judge);
        const costBreakdown = buildCostBreakdown(state);
        let report: Report;
        try {
          report =
            verifiedReport ??
            passes.assembleReport({
              judgeOutput: judge.data,
              bundle,
              computed,
              validation,
              meta,
              verificationRate,
              verificationLog: verifyLog,
              costBreakdown,
              payload, // WS7 (D-20): recovers the judge order/length protocol
            });
        } catch (err) {
          // A reused durable synthesize artifact has no analyst outputs to
          // re-judge against: the one assembly attempt is all there is, and
          // the terminal detail must say that rather than claim every retry
          // was spent (it used to read "after 3 attempt(s)" for a single
          // provider-free attempt).
          const reusedArtifact = bull === null || bear === null;
          lastJudgeInTransit = false;
          lastJudgeBusy = false;
          lastValidationDetail = reusedArtifact
            ? `durable synthesize artifact could not be assembled without rerunning upstream paid work: ${errMessage(err)}`
            : errMessage(err);
          lastFeedbackDetail = lastValidationDetail;
          repairRejectedComplete = true;
          carriedSections = {};
          // The judge output parsed but failed report-schema validation — echo it
          // back (JSON) so the retry repairs rather than regenerates.
          try {
            lastFailedRawOutput = rawTextOfError(err) || JSON.stringify(judge.data).slice(0, JUDGE_RETRY_RAW_OUTPUT_CAP);
          } catch {
            lastFailedRawOutput = "";
          }
          const issueKey = assemblyIssueKey(err);
          lastJudgeFailureRetryable = !reusedArtifact && issueKey !== previousAssemblyIssueKey;
          previousAssemblyIssueKey = issueKey;
          // A reused artifact was not bought in this run; a fresh one was, and its
          // output is now thrown away.
          const rejectedAttemptId = passAttemptIds.get("synthesize");
          if (!reusedArtifact && rejectedAttemptId !== undefined) {
            state.assemblyRejected.push({
              pass: "synthesize",
              attemptId: rejectedAttemptId,
              reason: readerSafeFailureText({ kind: "assembly" }),
            });
          }
          const retrying = lastJudgeFailureRetryable && attempt < maxJudgeRetries;
          const detail = `report assembly attempt ${attempt + 1}/${maxJudgeRetries + 1} failed${retrying ? "; retrying judge" : ""}: ${withPlainIssueList(lastValidationDetail)}`;
          updateRunningStepDetail(state, "synthesize", detail);
          updateRunningStepDetail(state, "verify", detail);
          if (retrying) {
            finishStep(state, "verify", "error", detail);
            startStep(state, "synthesize");
            continue; // feed the Zod error back
          }
          break;
        }

        // Success for this attempt — synthesis already completed before verify.
        void verifyError;
        // P27, D-227: the build that assembled this report, after every pass
        // (never part of a request); omitted without a verified build identity.
        report = withCodeIdentity(report, getRuntimeReportCodeIdentity());
        assembled = { report, verificationRate, verifyLog, meta, costBreakdown };
        break;
      }

      // Retries exhausted (or judge/assemble never validated) — fail LOUDLY on
      // synthesize with the validation detail and persist data-only. verify is
      // only marked "error" if it actually ran (a judge attempt succeeded);
      // when the judge never produced output, verify never ran and is honestly
      // "skipped" — same convention as the bull/bear-failure path.
      if (assembled === null) {
        const plainDetail = withPlainIssueList(lastValidationDetail);
        const detail = lastJudgeBusy
          ? `judge provider was busy or unavailable ${judgeAttemptsBusy === judgeAttemptsSeen ? "on all" : "after"} ${judgeAttemptsSeen} attempt(s): ${plainDetail}`
          : lastJudgeInTransit && judgeAttemptsBusy > 0
          ? `judge requests were cut off or the provider was busy or unavailable across ${judgeAttemptsSeen} attempt(s): ${plainDetail}`
          : lastJudgeInTransit
          ? `judge request was cut off ${judgeAttemptsInTransit === judgeAttemptsSeen ? "on all" : "after"} ${judgeAttemptsSeen} attempt(s): ${plainDetail}`
          : lastJudgeFailureRetryable
          ? `report failed schema validation after ${maxJudgeRetries + 1} attempt(s): ${plainDetail}`
          : `synthesize failed: ${plainDetail}`;
        finishStep(state, "synthesize", "error", detail);
        if (findStep(state, "verify").status === "pending") {
          markSkipped(state, "verify", `upstream synthesize failed: ${plainDetail}`);
        } else {
          finishStep(state, "verify", "error", detail);
        }
        // Same manifest disclosure as the bull/bear path: the data-only report
        // must carry the judge failure itself, not just the transient step UI.
        computed.gaps.push({
          field: "llm.judge",
          reason: detail,
          severity: "critical",
          attemptedSources: judgeProviderAttempted ? [parseSubscriptionModel(analysisModel)?.provider ?? "anthropic"] : [],
        });
        return persistDataOnly(state, bundle, validation, computed, now, hasKey);
      }

      const { report, verificationRate, verifyLog, meta, costBreakdown } = assembled;
      if (analysisOutcomeFromSteps(state.steps) !== "complete") {
        return persistDataOnly(state, bundle, validation, computed, now, hasKey, {
          reason: "Mandatory research stages did not all complete successfully. Accepted pass artifacts remain saved for recovery; this snapshot contains deterministic results only.",
        });
      }
      meta.completedAt = findStep(state, "verify").completedAt ?? findStep(state, "verify").finishedAt;

      // Reconcile runner-owned meta onto the assembled report (cost/rate/model
      // are the runner's source of truth; the passes may not know the final cost).
      const finalReport = reconcileMeta(
        report,
        meta,
        costBreakdown,
        verifyLog,
        presumedSpendDisclosure(state.jobId),
        discardedAttemptGaps(state),
      );

      const validated = ReportSchema.safeParse(finalReport);
      if (!validated.success) {
        const detail = `final report failed Zod validation after reconciliation: ${validated.error.issues
          .slice(0, 3)
          // Do not echo rejected prose into the data-only manifest: doing so can
          // reproduce the same prohibited content and invalidate the fallback.
          .map((issue) => `${issue.path.join(".") || "$"}: schema constraint violation`)
          .join("; ")}`;
        computed.gaps.push({
          field: "report.finalValidation",
          reason: detail,
          severity: "critical",
        });
        // The durable record of this failure is the critical manifest gap above
        // (it lands in the persisted data-only report). Do NOT also write it to
        // jobs.error: persistDataOnly finishes the job "done" with error:null,
        // so an error write here would be dead within the same tick.
        persistSteps(state);
        return persistDataOnly(state, bundle, validation, computed, now, hasKey);
      }
      const reportId = persistReport(
        state,
        validated.data,
        analysisModel,
        verificationRate,
        "done",
      );

      return finishRun(state, {
        reportId,
        verificationRate,
        dataOnly: false,
      });
    };

    // A durable synthesize artifact contains the complete analyst conclusion.
    // Only deterministic/report verification remains; analysts and judge must
    // not be called merely because the retry moved to another process.
    if (reusableSynthesize !== null) {
      markSkipped(state, "bull", "covered by reused durable synthesize artifact");
      markSkipped(state, "bear", "covered by reused durable synthesize artifact");
      const refused = refuseUnaffordableRun({ analysts: [], synthesize: false, verify: true });
      if (refused !== null) return refused;
      return await runSynthesisAndFinish(null, null, reusableSynthesize);
    }

    const repairQueued = new Set<"bull" | "bear">();
    const rejectedOutput = (failure: SerializedPassFailure): boolean =>
      failure.retryable === true && (failure.kind === "schema" || failure.kind === "parse");
    const queueRepairNote = (side: "bull" | "bear") => (failure: SerializedPassFailure) => {
      if (!rejectedOutput(failure) || passes.runAnalystPass === undefined || !(MAX_ANALYST_REPAIRS > 0)) return null;
      repairQueued.add(side);
      return {
        detail: `${side} attempt 1/${MAX_ANALYST_REPAIRS + 1} rejected (${plainRejectionNote(failure.detail ?? failure.message)}); repair queued`,
        repairQueued: true,
      };
    };
    const closeQueuedRepairs = (why: string): void => {
      for (const side of repairQueued) {
        const step = findStep(state, side);
        if (step.status === "running") {
          finishStep(state, side, "error", (step.detail ?? `${side} output rejected`).replace(/; repair queued$/, `; ${why}`));
        }
      }
      repairQueued.clear();
    };
    type AnalystRecovery = "repair" | "retry" | "continue" | "fresh" | "resume";
    const RECOVERY_LABEL: Record<AnalystRecovery, string> = {
      repair: "repairing schema-invalid output",
      retry: "retrying after a dropped connection",
      continue: "continuing from the completed sections of the cut-off response",
      resume: "running the missing side of a resumed run",
      fresh: "running now that its sibling pass is being retried",
    };
    const RECOVERY_GAP: Record<AnalystRecovery, string> = {
      repair: "repair attempt after schema-invalid output also failed",
      retry: "retry after a dropped connection also failed",
      continue: "continuation of the cut-off response also failed",
      resume: "resumed side failed",
      fresh: "pass launched after its sibling's retry also failed",
    };
    const runAnalystRepairAttempt = async (
      side: "bull" | "bear",
      mode: AnalystRecovery,
      feedback: string | undefined,
      failureDetail: string,
      continuation: PassContinuation | undefined,
      attemptLabel: string,
    ): Promise<{ ok: true; value: PassResultLike<AnalystCase> } | { ok: false; error: unknown; launched: boolean }> => {
      startStep(state, side);
      repairQueued.delete(side);
      updateRunningStepDetail(
        state,
        side,
        `${side} attempt ${attemptLabel}: ${mode === "retry" && providerWasBusy(failureDetail) ? "retrying after the provider was busy or unavailable" : RECOVERY_LABEL[mode]} — ${mode === "repair" ? plainRejectionNote(failureDetail) : failureDetail}`,
      );
      const checkpoint = createSettlementCheckpoint<AnalystCase>(
        state,
        side,
        fingerprint,
        passReservationUsd(analysisModel, side),
        jobSignal,
        jobController,
        analysisModel,
        (failure) => rejectedOutput(failure)
          ? { detail: `${side} attempt ${attemptLabel} rejected (${plainRejectionNote(failure.detail ?? failure.message)})`, repairQueued: false }
          : null,
      );
      try {
        await passes.preflightPass?.(deps, { pass: side });
        passAdmissions.set(side, checkpoint.admission);
        passAttemptIds.set(side, checkpoint.attemptId);
        await checkpoint.beforeLaunch();
        const fresh = await awaitJobStage(
          passes.runAnalystPass!(
            deps,
            side,
            checkpoint.hook,
            () => {
              checkpoint.authorizeLaunch(false);
            },
            feedback,
            continuation,
          ),
          jobSignal,
          jobController,
          side,
          modelStageDeadlineMs,
        );
        throwIfJobAborted(jobSignal);
        if (!checkpoint.wasCalled() && checkpoint.hasLease()) {
          await checkpoint.hook(successSettlement(fresh));
        }
        return { ok: true, value: fresh };
      } catch (repairErr) {
        throwIfJobAborted(jobSignal);
        if (repairErr instanceof PassSettlementHookError) throw repairErr;
        const billedAttempt = billedAttemptFromError(repairErr);
        if (
          !checkpoint.wasCalled() &&
          (checkpoint.wasLaunched() || billedAttempt !== null)
        ) {
          await checkpoint.hook(
            failureSettlement(repairErr, telemetryFromAttempt(billedAttempt, analysisModel), passErrorDetails(repairErr)),
          );
        }
        return { ok: false, error: repairErr, launched: checkpoint.wasLaunched() || billedAttempt !== null };
      } finally {
        checkpoint.releaseIfPrelaunch();
        checkpoint.stopRenewal();
      }
    };
    const recoverAnalystSide = async (
      side: "bull" | "bear", initialMode: AnalystRecovery, detail: string,
      raw = "", partial = "", initialRequest = false,
    ): Promise<PassResultLike<AnalystCase> | null> => {
      const plan = parseSubscriptionModel(analysisModel) !== null;
      let repairs = MAX_ANALYST_REPAIRS;
      let resends = plan ? SUBSCRIPTION_ANALYST_ATTEMPTS : 0;
      let mode = initialMode;
      let currentDetail = detail;
      let feedback = mode === "repair"
        ? `${detail}${raw ? `\n\n${previousOutputBlock(raw, isIncompleteAnalystCase(detail))}` : ""}` : undefined;
      const checked = mode === "retry" ? checkCarried(passes, side, completedTopLevelFields(partial)) : { kept: {}, dropped: [] };
      let dropped = checked.dropped;
      let continuation: PassContinuation | undefined = mode === "retry" && (plan || Object.keys(checked.kept).length > 0)
        ? { completed: checked.kept, ...(plan ? { sectionRetryCount: 1 } : {}) } : undefined;
      if (Object.keys(checked.kept).length > 0) mode = "continue";
      let sent = initialRequest ? 0 : 1;
      let anyLaunched = !initialRequest;
      // Fresh sends and rejected-output repair are distinct from zero-cost plan resends.
      // The facade never admits a billed/uncertain transport failure as retryable.
      let first = true;
      while (true) {
        if (mode === "repair") {
          if (repairs-- <= 0) return null;
        } else if (mode !== "fresh" && mode !== "resume") {
          if (!first && !plan) return null;
          resends--;
          startStep(state, side);
          await backOffIfOverloaded(new Error(currentDetail), plan ? SUBSCRIPTION_ANALYST_ATTEMPTS - resends : 1, side);
        }
        first = false;
        sent++;
        const maximum = sent + repairs + Math.max(0, resends);
        const out = await runAnalystRepairAttempt(side, mode, feedback,
          `${currentDetail}${carriedDetail(continuation, dropped)}`, continuation, `${sent}/${maximum}`);
        if (out.ok) return out.value;
        anyLaunched ||= out.launched;
        const failure = passErrorDetails(out.error);
        const canRepair = isRetryableJudgeError(out.error) &&
          (failure.kind === "schema" || failure.kind === "parse") && repairs > 0;
        const canResend = plan && resends > 0 && isTransportFailure(out.error) && isRetryableJudgeError(out.error);
        if (!canRepair && !canResend) {
          computed.gaps.push({ field: `llm.${side}`,
            reason: `${mode === "retry" && providerWasBusy(currentDetail) ? "retry after the provider was busy or unavailable also failed" : RECOVERY_GAP[mode]}: ${withPlainIssueList(errMessage(out.error))}`,
            severity: "critical", attemptedSources: anyLaunched ? [parseSubscriptionModel(analysisModel)?.provider ?? "anthropic"] : [] });
          closeQueuedRepairs(`not repaired: the ${side} repair failed`);
          markSkipped(state, "synthesize", "upstream bull/bear pass failed");
          markSkipped(state, "verify", "upstream bull/bear pass failed");
          return null;
        }
        if (canRepair) {
          mode = "repair";
          const rejected = capRawOutput((out.error as { rawText?: string }).rawText ?? "");
          const repairDetail = errMessage(out.error);
          feedback = `${repairDetail}${rejected ? `\n\n${previousOutputBlock(rejected, isIncompleteAnalystCase(repairDetail))}` : ""}`;
          continuation = undefined;
        } else if (mode !== "repair") {
          const next = checkCarried(passes, side, { ...completedTopLevelFields(partialTextOfError(out.error)), ...(continuation?.completed ?? {}) });
          dropped = next.dropped;
          continuation = { completed: next.kept, sectionRetryCount: (continuation?.sectionRetryCount ?? 0) + 1 };
          mode = Object.keys(next.kept).length > 0 ? "continue" : "retry";
          feedback = undefined;
        } else {
          // Resending a dropped repair consumes a resend, not another repair.
          resends--;
          await backOffIfOverloaded(out.error, SUBSCRIPTION_ANALYST_ATTEMPTS - resends, side);
          repairs++;
        }
        currentDetail = errMessage(out.error);
      }
    };

    // -- resume: reuse persisted analyst passes --------------------------------
    const resumeSnapshots = opts.resume === true && preparedResume !== null
      ? {
          bull: preparedResume.bull,
          bear: preparedResume.bear,
          payloadFingerprint: preparedResume.payloadFingerprint,
        }
      : null;
    const resumeMissingSides = resumeSnapshots
      ? (["bull", "bear"] as const).filter((side) => resumeSnapshots[side] === null)
      : [];
    // A partial snapshot needs the single-side runner; without it (mocks, the
    // noop facade) fall through to a fresh full run — safe, just re-bills.
    const canResume =
      resumeSnapshots !== null &&
      (resumeMissingSides.length === 0 || typeof passes.runAnalystPass === "function");
    if (resumeSnapshots !== null && canResume) {
      // The original bull/bear cost_log rows live under this same jobId; the
      // running total was rehydrated from cost_log at RunState construction,
      // so meta.costUsd stays the job's true all-in cost. The reused passes
      // are NOT re-logged.
      for (const side of ["bull", "bear"] as const) {
        const snapshot = resumeSnapshots[side];
        if (snapshot === null) continue;
        startStep(state, side);
        // The step's own totals (JOB-204): a repaired or presumed-bearing side states its whole cost.
        const totals = stepSettledTotals(state.jobId, side);
        finishStep(
          state,
          side,
          "done",
          `reused persisted result from previous attempt (resume) — ${passDetail(
            { ...snapshot, costUsd: totals.costUsd > 0 ? totals.costUsd : snapshot.costUsd },
            totals.attempts,
            totals.presumedUsd,
          )}`,
          snapshot.costUsd,
        );
      }
      const refused = refuseUnaffordableRun({ analysts: resumeMissingSides, synthesize: true, verify: true });
      if (refused !== null) return refused;
      // Re-run ONLY the missing side(s) — the sibling's paid output is reused
      // (2026-07-10: one-sided analyst failures no longer discard the pair).
      let resumedBull = resumeSnapshots.bull;
      let resumedBear = resumeSnapshots.bear;
      for (const side of resumeMissingSides) {
        const fresh = await recoverAnalystSide(side, "resume", "running missing resumed side", "", "", true);
        if (fresh === null) return persistDataOnly(state, bundle, validation, computed, now, hasKey);
        if (side === "bull") resumedBull = fresh;
        else resumedBear = fresh;
      }
      // `await` so a rejection is caught by the outer catch (error recording).
      return await runSynthesisAndFinish(resumedBull!, resumedBear!);
    }

    // -- bull + bear ----------------------------------------------------------
    const refused = refuseUnaffordableRun({ analysts: ["bull", "bear"], synthesize: true, verify: true });
    if (refused !== null) return refused;
    // Per-pass timing comes from the hooks (the passes overlap in the
    // streaming path); ensureStepStarted backfills for hook-less mocks so a
    // step never jumps pending -> terminal.
    const analystLaunched = { bull: false, bear: false };
    // A first attempt whose output was received and rejected gets a repair
    // (below), so its step waits under a plain note rather than reading ERROR.
    // The pass settles the rejection before the runner knows whether the
    // sibling can continue; a run that gives up closes the step with the reason.
    // A dropped plan connection is retryable too, but it is retried, not
    // repaired, on its own attempt count: its row is unchanged.
    const bullCheckpoint = createSettlementCheckpoint<AnalystCase>(
      state,
      "bull",
      fingerprint,
      passReservationUsd(analysisModel, "bull"),
      jobSignal,
      jobController,
      analysisModel,
      queueRepairNote("bull"),
    );
    const bearCheckpoint = createSettlementCheckpoint<AnalystCase>(
      state,
      "bear",
      fingerprint,
      passReservationUsd(analysisModel, "bear"),
      jobSignal,
      jobController,
      analysisModel,
      queueRepairNote("bear"),
    );
    const analystHooks: AnalystPassHooks = {
      beforePass: async (side) => {
        const checkpoint = side === "bull" ? bullCheckpoint : bearCheckpoint;
        passAdmissions.set(side, checkpoint.admission);
        passAttemptIds.set(side, checkpoint.attemptId);
        await checkpoint.beforeLaunch();
      },
      onPassStart: (side) => {
        // Best-effort timing only. Durable authority must never pass through a
        // hook Stage C intentionally swallows.
        void side;
      },
      beforeProviderLaunch: (side) => {
        const checkpoint = side === "bull" ? bullCheckpoint : bearCheckpoint;
        checkpoint.authorizeLaunch(true);
        analystLaunched[side] = true;
      },
      onPassFinish: (side) => stampStepFinished(state, side),
    };
    let bull: PassResultLike<AnalystCase> | null = null;
    let bear: PassResultLike<AnalystCase> | null = null;
    /**
     * Re-run ONE analyst side with the schema error and its rejected output
     * fed back, under its own settlement checkpoint (own lease, own cost row,
     * own attempt id) — the partial-resume single-side contract. Returns null
     * after recording the failure and skipping synthesis, so the caller can
     * persist data-only exactly as the first-attempt path does.
     */
    /**
     * `repair`: the output was received but rejected, so it is fed back.
     * `retry`: the connection dropped, so the same request is simply re-run.
     * `fresh`: the side never launched because its sibling failed first.
     */
    try {
      await passes.preflightPass?.(deps, { pass: "bull" });
      await passes.preflightPass?.(deps, { pass: "bear" });
      const cases = await awaitJobStage(
        passes.runBullThenBear(deps, analystHooks, {
          bull: bullCheckpoint.hook,
          bear: bearCheckpoint.hook,
        }),
        jobSignal,
        jobController,
        "bull/bear",
        modelStageDeadlineMs,
      );
      throwIfJobAborted(jobSignal);
      bull = cases.bull;
      bear = cases.bear;
      ensureStepStarted(state, "bull");
      ensureStepStarted(state, "bear");
      const fallbackSettlements = await Promise.allSettled([
        bullCheckpoint.wasCalled()
          ? Promise.resolve()
          : bullCheckpoint.hook(successSettlement(bull)),
        bearCheckpoint.wasCalled()
          ? Promise.resolve()
          : bearCheckpoint.hook(successSettlement(bear)),
      ]);
      throwFirstSettlementRejection(fallbackSettlements);
    } catch (err) {
      if (!analystLaunched.bull) bullCheckpoint.releaseIfPrelaunch();
      if (!analystLaunched.bear) bearCheckpoint.releaseIfPrelaunch();
      throwIfJobAborted(jobSignal);
      if (err instanceof PassSettlementHookError) throw err;
      // Adversarial passes failed — mark both error and fall through to a
      // data-only stub (we still have fetch/validate/compute).
      const partial = bullBearFailureFromError(err);
      const bullLaunched = analystLaunched.bull ||
        partial?.bullLaunched === true ||
        partial?.bull !== undefined ||
        partial?.bullBilledAttempt !== undefined ||
        bullCheckpoint.wasCalled();
      const bearLaunched = analystLaunched.bear ||
        partial?.bearLaunched === true ||
        partial?.bear !== undefined ||
        partial?.bearBilledAttempt !== undefined ||
        bearCheckpoint.wasCalled();
      if (!bullLaunched) {
        bullCheckpoint.releaseIfPrelaunch();
        markSkipped(state, "bull", "provider pass was not launched");
      } else {
        ensureStepStarted(state, "bull");
      }
      if (!bearLaunched) {
        bearCheckpoint.releaseIfPrelaunch();
        markSkipped(state, "bear", "provider pass was not launched");
      } else {
        ensureStepStarted(state, "bear");
      }
      const settleMissingSide = async (
        checkpoint: SettlementCheckpoint<AnalystCase>,
        result: PassResultLike<AnalystCase> | undefined,
        sideError: string | undefined,
        billed: BilledPassAttempt | undefined,
        launched: boolean | undefined,
        retryable: boolean | undefined,
        failureKind: string | undefined,
      ): Promise<void> => {
        if (checkpoint.wasCalled()) return;
        if (launched === false) return;
        if (result !== undefined) {
          await checkpoint.hook(successSettlement(result));
          return;
        }
        await checkpoint.hook(
          failureSettlement(
            new Error(sideError ?? errMessage(err)),
            telemetryFromAttempt(billed ?? null, analysisModel),
            // Retry eligibility does not identify the failure cause. Preserve
            // the adapter's explicit classification, or leave it unknown so
            // the discarded-attempt disclosure uses its generic fallback.
            {
              retryable: retryable === true,
              ...(failureKind === undefined ? {} : { kind: failureKind }),
            },
          ),
        );
      };
      const fallbackSettlements = await Promise.allSettled([
        settleMissingSide(
          bullCheckpoint,
          partial?.bull,
          partial?.bullError,
          partial?.bullBilledAttempt,
          bullLaunched,
          partial?.bullRetryable,
          partial?.bullFailureKind,
        ),
        settleMissingSide(
          bearCheckpoint,
          partial?.bear,
          partial?.bearError,
          partial?.bearBilledAttempt,
          bearLaunched,
          partial?.bearRetryable,
          partial?.bearFailureKind,
        ),
      ]);
      throwFirstSettlementRejection(fallbackSettlements);

      // One repair attempt per side whose output was RECEIVED but rejected by
      // the schema — the judge has had this loop all along; the analysts had
      // none, so a haiku bull pass writing "2026-Q1" for `asOf` (2026-09-02)
      // lost both paid passes and the whole analysis. The sibling's paid
      // output is kept. A dropped zero-cost subscription stream is retried the
      // same way (the facade marks it retryable), and a side that never
      // launched because that sibling failed first runs fresh. A paid transport
      // failure or a refusal still degrades to data-only below.
      const sideResult = (side: "bull" | "bear"): PassResultLike<AnalystCase> | undefined =>
        side === "bull" ? partial?.bull : partial?.bear;
      const retryableSide = (side: "bull" | "bear"): boolean =>
        (side === "bull" ? partial?.bullRetryable : partial?.bearRetryable) === true;
      // Decided by the launch flag, not by the absence of an error: the facade
      // records a "not launched" message for such a side.
      const neverLaunched = (side: "bull" | "bear"): boolean =>
        sideResult(side) === undefined && !(side === "bull" ? bullLaunched : bearLaunched);
      const recoveryOf = (side: "bull" | "bear"): AnalystRecovery =>
        neverLaunched(side)
          ? "fresh"
          : (side === "bull" ? partial?.bullFailureKind : partial?.bearFailureKind) === "transport"
            ? "retry"
            : "repair";
      const repairable = (side: "bull" | "bear"): boolean =>
        passes.runAnalystPass !== undefined &&
        sideResult(side) === undefined &&
        (retryableSide(side) || (neverLaunched(side) && retryableSide(side === "bull" ? "bear" : "bull")));
      const recoverable = (["bull", "bear"] as const).every(
        (side) => sideResult(side) !== undefined || repairable(side),
      );
      if (recoverable && MAX_ANALYST_REPAIRS > 0) {
        let repairedBull = sideResult("bull") ?? null;
        let repairedBear = sideResult("bear") ?? null;
        for (const side of ["bull", "bear"] as const) {
          if (sideResult(side) !== undefined) continue;
          const detail =
            (side === "bull" ? partial?.bullError : partial?.bearError) ?? errMessage(err);
          const raw = capRawOutput((side === "bull" ? partial?.bullRawText : partial?.bearRawText) ?? "");
          const repaired = await recoverAnalystSide(side, recoveryOf(side), detail, raw,
            (side === "bull" ? partial?.bullPartialText : partial?.bearPartialText) ?? "");
          if (repaired === null) return persistDataOnly(state, bundle, validation, computed, now, hasKey);
          if (side === "bull") repairedBull = repaired;
          else repairedBear = repaired;
        }
        return await runSynthesisAndFinish(repairedBull, repairedBear);
      }
      // Disclose the per-pass failures in the report's missing-data manifest —
      // the report page has no access to step details, so without these the
      // data-only report could not say WHY analysis is absent (2026-07-10:
      // transport failures were only visible on the transient pipeline view).
      // A side that DID succeed is persisted (with the fingerprint) so its
      // paid output survives for a partial resume instead of being discarded.
      closeQueuedRepairs("not repaired: the other pass failed in a way a repair cannot fix");
      for (const side of ["bull", "bear"] as const) {
        const checkpoint = side === "bull" ? bullCheckpoint : bearCheckpoint;
        if (checkpoint.lastSettlement()?.outcome === "success") continue;
        const sideError = side === "bull" ? partial?.bullError : partial?.bearError;
        const launched = side === "bull" ? bullLaunched : bearLaunched;
        computed.gaps.push({
          field: `llm.${side}`,
          reason: withPlainIssueList(sideError ?? errMessage(err)),
          severity: "critical",
          attemptedSources: launched ? [parseSubscriptionModel(analysisModel)?.provider ?? "anthropic"] : [],
        });
      }
      markSkipped(state, "synthesize", "upstream bull/bear pass failed");
      markSkipped(state, "verify", "upstream bull/bear pass failed");
      return persistDataOnly(state, bundle, validation, computed, now, hasKey);
    } finally {
      bullCheckpoint.releaseIfPrelaunch();
      bearCheckpoint.releaseIfPrelaunch();
      bullCheckpoint.stopRenewal();
      bearCheckpoint.stopRenewal();
    }

    return await runSynthesisAndFinish(bull, bear);
  } catch (err) {
    if (err instanceof SupersededRunError) {
      return supersededRunResult(state);
    }
    const jobAbortReason = jobSignal.aborted ? abortReason(jobSignal) : null;
    if (jobSignal.aborted && !(jobAbortReason instanceof PassSettlementHookError)) {
      try {
        return abortRun(state, jobAbortReason);
      } catch (abortError) {
        if (abortError instanceof SupersededRunError) {
          return supersededRunResult(state);
        }
        throw abortError;
      }
    }
    // Unexpected orchestration failure: record and re-surface to the scheduler,
    // whose terminal/finally path wakes the next durable claim.
    const surfacedError = jobAbortReason instanceof PassSettlementHookError
      ? jobAbortReason
      : err;
    try {
      persistSteps(state, "error", errMessage(surfacedError));
    } catch (persistError) {
      if (persistError instanceof SupersededRunError) {
        return supersededRunResult(state);
      }
      throw persistError;
    }
    publish(state, { type: "error", jobId, message: errMessage(surfacedError) });
    throw surfacedError;
  } finally {
    clearInterval(heartbeat);
    clearTimeout(overallTimer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
    liveJobIds().delete(jobId);
    if (liveJobControllers().get(jobId) === jobController) {
      liveJobControllers().delete(jobId);
    }
  }
}

/**
 * Persist a data-only Report stub (meta + appendix + empty graded sections
 * flagged) and finish the job "done". Used for the no-key path and for
 * degraded LLM-failure paths so the UI always gets a renderable report.
 */
function persistDataOnly(
  state: RunState,
  bundle: DataBundle,
  validation: ValidationReport,
  computed: ComputedMetrics | null,
  now: () => Date,
  hasKey: boolean,
  /**
   * What the data-only report says about WHY it is data-only: an
   * `analysis.llm` reason specific to the degradation (default: the analysis
   * ran and its pass errors are in the manifest), extra manifest entries the
   * caller owes the reader (the Stage B exception, say), and the
   * requested-versus-effective disclosure for a run that never reached a
   * model.
   */
  disclosure: { reason?: string; gaps?: ManifestEntry[]; execution?: ExecutionMetadataEntry[] } = {},
): RunJobResult {
  // No job may be persisted terminal while a step still reads as live. The
  // callers mark the steps they know about, but `markSkipped` only moves a
  // PENDING step, so a pass that failed while RUNNING (an analyst failure on a
  // partial resume, for instance) stayed "running" forever on a job the client
  // was told is done. Sweep every non-terminal step at this single common exit.
  for (const step of LLM_STEPS) {
    const s = findStep(state, step);
    if (s.status === "running") {
      finishStep(state, step, "error", s.detail ?? "pass did not complete before the run ended");
    } else if (s.status === "pending") {
      markSkipped(state, step, s.detail ?? "pass not reached — data-only report");
    }
  }

  const generatedAt = now().toISOString();
  const model = hasKey ? "unavailable" : disclosure.reason && disclosure.reason !== NO_KEY_SKIP_REASON
    ? "none (AI connection unavailable)" : NO_KEY_MODEL_LABEL;
  const dataOnlyInput: DataOnlyInput = {
    symbol: state.symbol,
    companyName: companyNameOf(bundle, state.symbol),
    generatedAt,
    model,
    costUsd: state.totalCostUsd,
    bundle,
    validation,
    computed,
    costBreakdown: buildCostBreakdown(state),
    presumed: presumedSpendDisclosure(state.jobId),
    execution: disclosure.execution ?? readSuccessfulExecutions(state.jobId, model, true),
    gaps: [...(disclosure.gaps ?? []), ...discardedAttemptGaps(state, { dataOnly: true })],
    reason: disclosure.reason ?? (hasKey ? LLM_FAILURE_DATA_ONLY_REASON : NO_KEY_SKIP_REASON),
    codeIdentity: getRuntimeReportCodeIdentity(),
  };
  const report = buildDataOnlyReport(dataOnlyInput);
  const validated = ReportSchema.safeParse(report);
  let validatedReport: Report;
  if (validated.success) {
    validatedReport = validated.data;
  } else {
    // Provider/model error strings and source metadata are untrusted. Never use
    // a failed parse as permission to persist an invalid report. Rebuild one
    // sterile, fully disclosed data-only shell without the rejected metadata.
    const sterileInput: DataOnlyInput = {
      ...dataOnlyInput,
      companyName: state.symbol,
      reason: "Analysis unavailable; degraded-path metadata failed the final report safety schema and was withheld.",
      sterileManifest: true,
    };
    // Keep deterministic content only after rechecking it. Enrichment itself
    // can contain rejected provider prose, so the final tier omits enrichment.
    const kept = ReportSchema.safeParse(buildDataOnlyReport(sterileInput));
    validatedReport = kept.success ? kept.data : ReportSchema.parse(buildDataOnlyReport({
      ...sterileInput, computed: null, execution: [],
      costBreakdown: dataOnlyInput.costBreakdown.map(row => ({ ...row, model: "withheld" })),
    }));
  }
  const reportId = persistReport(
    state,
    validatedReport,
    model,
    null,
    "done",
  );
  return finishRun(state, { reportId, verificationRate: null, dataOnly: true });
}

/** Best-effort company name from the profile row; falls back to the symbol. */
function companyNameOf(bundle: DataBundle, symbol: string): string {
  if (bundle.profile.ok) {
    const row = bundle.profile.value.data.rows[0];
    const name = row?.companyName;
    if (typeof name === "string" && name.length > 0) return name;
  }
  return symbol;
}

/** Convert bundle + validation gaps into report ManifestEntry appendix rows. */
function collectMissingData(
  bundle: DataBundle,
  validation: ValidationReport,
  computed: ComputedMetrics | null,
  extra: readonly ManifestEntry[] = [],
): ManifestEntry[] {
  const all: ManifestEntry[] = [...withRetiredGapWording(bundle.gaps), ...validation.gaps, ...extra];
  if (computed !== null) all.push(...computed.gaps);
  // Dedup by field+reason, keep the highest severity first.
  const seen = new Set<string>();
  const order: Record<ManifestEntry["severity"], number> = { critical: 0, warn: 1, info: 2 };
  return all
    .filter((g) => {
      const key = `${g.field}::${g.reason}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => order[a.severity] - order[b.severity]);
}

/** Source-entry appendix rows copied from exact bundle provider envelopes. */
function collectSources(bundle: DataBundle): Report["appendix"]["sources"] {
  return sourceManifestEntries(bundle.sourceManifest).map((entry) => ({ ...entry }));
}

interface DataOnlyInput {
  /** Withhold untrusted provider metadata before calculating completeness. */
  sterileManifest?: boolean;
  symbol: string;
  companyName: string;
  generatedAt: string;
  model: string;
  costUsd: number;
  bundle: DataBundle;
  validation: ValidationReport;
  computed: ComputedMetrics | null;
  costBreakdown: { step: string; model: string; costUsd: number }[];
  reason: string;
  /** Part of `costUsd` that is a presumed upper bound (DECISIONS D-07). */
  presumed?: PresumedSpendDisclosure | null;
  /** Manifest entries the degraded path itself owes the reader (a Stage B exception, say). */
  gaps?: ManifestEntry[];
  /**
   * Requested-versus-effective execution for a run that never reached a model,
   * carrying the `model-rejected` adjustment when the stored model id was
   * refused (DECISIONS D-02).
   */
  execution?: ExecutionMetadataEntry[];
  /**
   * P27, D-227: the verified identity of the build assembling the report;
   * absent without one, and then `meta.codeIdentity` is omitted.
   */
  codeIdentity?: ReportCodeIdentity;
}

/**
 * Build a data-only Report: real meta + appendix (sources/manifest/cost), and
 * every graded section flagged as ungraded because the LLM analysis did not
 * run. When Stage B ran (`computed` present) the deterministic content it
 * produced — growth, margins, returns, capital structure, forensics,
 * technicals, DCF, reverse DCF, multiples, scenario targets, projections and
 * the aspect scores — is attached exactly as the LLM path attaches it after the
 * judge, and the grades are the deterministic score bands, stated as such.
 * Without `computed` (Stage B itself failed) the stub stays empty: nothing is
 * ever filled in that the pipeline did not compute.
 */
export function buildDataOnlyReport(input: DataOnlyInput): Report {
  const { symbol, validation, computed } = input;
  const bundle = balanceIntegrityView(withPrimaryCapitalBasis(input.bundle));
  const asOfMap = input.sterileManifest ? {} : { ...bundle.asOf };
  // The letter beside this claim is the deterministic score band when Stage B
  // ran and a schema placeholder when it did not; "ungraded" (before the
  // 2026-09-06 audit, F170) contradicted the band shown next to it.
  const flagClaim = {
    text: `No completed analysis is available — ${dataOnlyReasonClause(input.reason)}. This section is data-only: no analyst grade exists; any displayed score band comes from deterministic calculations.`,
    label: "JUDGMENT" as const,
    source: "pipeline",
    asOf: null,
  };
  const grade = (): Report["verdict"]["gradeStrip"]["fundamentals"] => ({
    grade: "F",
    assessmentStatus: "not-assessed",
    oneLineWhy: "Not assessed — deterministic calculations and completed AI analysis are unavailable.",
    reasoning: [flagClaim],
    confidence: "low",
    keyNumbers: [],
  });

  const missingData: ManifestEntry[] = input.sterileManifest ? [] : bankRevenueManifest(input.bundle, primaryCapitalManifest(input.bundle, collectMissingData(bundle, validation, computed, input.gaps ?? [])));
  const attemptedAnalysisSources = [
    ...new Set(
      missingData
        .filter((gap) => gap.field.startsWith("llm."))
        .flatMap((gap) => gap.attemptedSources ?? []),
    ),
  ].sort();
  const emptyCoverage: ProvenanceCoverage = {
    numeric: { supported: 0, total: 0, rate: null },
    factualClaims: { supported: 0, total: 0, rate: null },
    judgments: { cited: 0, total: 0, rate: null },
  };
  // Record the data-only condition itself as a critical manifest entry.
  missingData.unshift({
    field: "analysis.llm",
    reason: input.reason,
    severity: "critical",
    attemptedSources: attemptedAnalysisSources,
  });
  // A data-only report still shows a cost total, and a run that died mid-pass
  // is exactly the case where part of that total is a bound, not a charge.
  if (input.presumed != null) missingData.push(input.presumed.entry);

  const report: Report = {
    meta: {
      symbol,
      companyName: input.companyName,
      generatedAt: input.generatedAt,
      specVersion: REPORT_SPEC_VERSION,
      model: input.model,
      pipelineVersion: PIPELINE_VERSION,
      // P21, D-217: a data-only report built now carries the current evidence-rules stamp.
      evidenceContract: EVIDENCE_CONTRACT_VERSION,
      costUsd: input.costUsd,
      ...(input.presumed == null ? {} : { presumedCostUsd: input.presumed.totalUsd }),
      ...(input.execution === undefined || input.execution.length === 0
        ? {}
        : { execution: input.execution }),
      verificationRate: null,
      provenanceCoverage: emptyCoverage,
      dataCompleteness: buildDataCompleteness(missingData),
      disclaimer: DISCLAIMER_TEXT,
      asOfMap,
    },
    verdict: {
      synthesis:
        "Data-only report: no completed AI analysis is available, so no synthesis, analyst grades, or scenarios are shown. The appendix lists the fetched sources and every disclosed data gap.",
      gradeStrip: {
        fundamentals: grade(),
        valuation: grade(),
        technicals: grade(),
        quality: grade(),
        leadership: grade(),
        moat: grade(),
      },
    },
    business: {
      whatTheySell: [flagClaim],
      segments: { product: [], geographic: [] },
      concentrationRisks: [],
    },
    fundamentals: {
      graded: grade(),
      growthTable: [],
      marginTrend: [],
      returns: [],
      fcf: [],
      commentary: [flagClaim],
    },
    balanceSheet: {
      debtProfile: { commentary: [flagClaim], numbers: [] },
      coverage: { commentary: [], numbers: [] },
      capexTrajectory: { commentary: [], numbers: [] },
      capitalAllocation: [],
    },
    valuation: {
      graded: grade(),
      dcf: {
        perShare: null,
        assumptions: [],
        sensitivityGrid: [],
        upsidePct: null,
      },
      reverseDcf: {
        impliedMetric: "n/a",
        impliedValue: null,
        narrative: "Data-only report — no reverse-DCF computed.",
      },
      multiples: [],
      scenarios: [
        {
          name: "bull",
          probability: null,
          priceTarget: null,
          horizon: "n/a",
          assumptions: ["Data-only report — no scenario modeling performed."],
          whatWouldHaveToBeTrue: ["LLM analysis would have to run."],
        },
        {
          name: "base",
          probability: null,
          priceTarget: null,
          horizon: "n/a",
          assumptions: ["Data-only report — no scenario modeling performed."],
          whatWouldHaveToBeTrue: ["LLM analysis would have to run."],
        },
        {
          name: "bear",
          probability: null,
          priceTarget: null,
          horizon: "n/a",
          assumptions: ["Data-only report — no scenario modeling performed."],
          whatWouldHaveToBeTrue: ["LLM analysis would have to run."],
        },
      ],
    },
    quality: {
      graded: grade(),
      forensicScores: {
        altman: naScore(),
        beneish: naScore(),
        piotroski: naScore(),
        accruals: naScore(),
      },
      flags: [],
    },
    technicals: {
      graded: grade(),
      read: {
        trend: "Data-only report — no technical read.",
        momentum: "Data-only report — no technical read.",
        keyLevels: "Data-only report — no technical read.",
        relativeStrength: "Data-only report — no technical read.",
      },
      indicators: [],
      flags: [],
    },
    leadership: {
      graded: grade(),
      executives: [],
      insiderSummary: [],
      governanceNotes: [flagClaim],
    },
    competitive: {
      moatGraded: grade(),
      peerTable: [],
      moatAssessment: [],
      marketShareDirection: "Data-only report — no competitive assessment.",
    },
    catalystsRisks: { catalysts: [], risks: [] },
    outlook: {
      segmentTrajectories: [],
      estimateRevisionTrend: [],
      guidanceCredibility: [],
      scenarioNarratives: { y1: [flagClaim], y3: [], y5: [] },
    },
    macro: {
      relevantSeries: [],
      sensitivityNotes: [],
      fredAttribution: FRED_ATTRIBUTION_TEXT,
    },
    appendix: {
      sources: input.sterileManifest ? [] : collectSources(bundle),
      missingData,
      verificationRate: null,
      provenanceCoverage: emptyCoverage,
      costBreakdown: input.costBreakdown,
    },
    disagreements: [],
  };
  if (computed === null) return withCodeIdentity(report, input.codeIdentity);
  return withCodeIdentity(enrichDataOnlyReport(report, { bundle, computed, reason: input.reason }), input.codeIdentity);
}

function naScore(): Report["quality"]["forensicScores"]["altman"] {
  return {
    variant: "n/a",
    score: null,
    zone: null,
    notApplicableReason: "Data-only report — forensic scores not computed by this path.",
  };
}
