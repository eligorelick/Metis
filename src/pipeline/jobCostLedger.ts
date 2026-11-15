/**
 * The run's cost ledger, split out of jobRunner.ts: reading the logged cost rows and the budget
 * plan, the cost breakdown and discarded-attempt disclosure, presumed spend, and reconciling a
 * report's meta and a recovered verify report with the ledger (P23, P24).
 */

import { PIPELINE_VERSION } from "@/report/versions";
import { parseSubscriptionModel } from "@/ai/contracts";
import { eq } from "drizzle-orm";
import { getDb, type ThesisDb } from "@/db";
import { costLog } from "@/db/schema";
import { type ManifestEntry } from "@/types/core";
import { DISCLAIMER_TEXT, REPORT_SPEC_VERSION, ReportSchema, type Report, type CostBreakdownEntry, type ExecutionMetadataEntry } from "@/report/schema";
import { buildDataCompleteness } from "@/report/completeness";
import { annotateSharedModelFamily, attributeJudgeProtocolDisclosures, buildExecutionMetadataEntry, webResearchLimitationGaps, failedPassNote, sharedModelFamilyOf } from "@/report/execution";
// WS7 (D-20): the judgement-protocol block the passes store is completed with
// the model families only the runner's settled execution list knows. This is a
// PURE module (no clock, no network, no provider) — the passes module itself
// stays injected, as the decoupling note above requires.
import { judgeProtocolManifestEntries, restampSharedModelFamily } from "@/pipeline/stageC/judgeProtocol";
import { completedTopLevelFields, sectionDigest } from "@/pipeline/stageC/continuation";
import { costRowBelongsToAttempt, readJobPassArtifactLineage, type CurrentGenerationPassArtifact } from "@/pipeline/jobArtifacts";
import { readStoredJobResumeInTransaction } from "@/pipeline/jobStore";
import { listPresumedCosts } from "@/pipeline/jobScheduler";
import { type AssemblyRejectedAttempt, type RunState, findStep } from "./jobStepProgress";
import type { PassResultLike, ReportMetaInput } from "./jobPassContract";

/* ------------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------------ */

export function reconcilePersistedCostBreakdown(
  existing: Report["appendix"]["costBreakdown"],
  ledger: CostLedgerRow[],
): Report["appendix"]["costBreakdown"] {
  let matchingPrefix = true;
  return ledger.map((entry, index) => {
    const previous = existing[index];
    const matches = matchingPrefix && previous !== undefined &&
      previous.step === entry.step &&
      previous.model === entry.model &&
      Object.is(previous.costUsd, entry.costUsd);
    if (matches) {
      return {
        ...previous,
        // cost_log is the durable per-attempt fallback source of truth.
        fallbackUsed: entry.fallbackUsed,
        ...ledgerTokens(entry),
      };
    }
    matchingPrefix = false;
    return {
      step: entry.step,
      model: entry.model,
      costUsd: entry.costUsd,
      fallbackUsed: entry.fallbackUsed,
      ...ledgerTokens(entry),
    };
  });
}

/* ------------------------------------------------------------------------ *
 * Report assembly helpers (data-only stub + meta reconciliation)
 * ------------------------------------------------------------------------ */

/**
 * One provider request the run paid for and threw away.
 *
 * A repaired pass bills twice: the rejected attempt and the one that replaced
 * it. Both settle, both are real spend, and both belong in the breakdown — but
 * a reader looking at two `bull` rows could not tell which of them bought
 * anything. The pass artifact records the outcome, so the two are joinable.
 */
interface DiscardedAttempt {
  pass: string;
  attemptId: string;
  reason: string;
  model: string;
  billable: boolean;
  usageReported?: boolean;
  /** D-116: its completed sections that the pass's final output kept ({@link keptSectionsOf}). */
  kept: string[];
}

/**
 * What a reader is told about a discarded attempt, chosen by failure kind.
 *
 * Nothing recorded on the artifact is echoed. A schema rejection's message and
 * its zod detail both quote the value that was rejected — which is the model's
 * own prose — so copying either into the report would carry unreviewed model
 * text past the rating-language gate. A match there fails the WHOLE report, not
 * the sentence, so a repaired run would crash instead of disclosing. The full
 * failure stays on the durable pass artifact, where a maintainer reads it; the
 * report gets a fixed phrase per kind, which is what a reader needs anyway.
 */
const DISCARDED_REASON_BY_KIND: Readonly<Record<string, string>> = {
  schema: "its output did not satisfy the report schema",
  parse: "its output was not valid JSON",
  // D-116: the default restated the failure ("did not produce usable output
  // because the attempt did not produce a usable result").
  transport: "the provider request failed before a usable response arrived",
  // D-123: a judge output that parsed but could not be assembled into a report.
  assembly: "the report could not be assembled from its output",
};
const DISCARDED_REASON_DEFAULT = "the attempt did not produce a usable result";

export function readerSafeFailureText(failure: { kind?: string; providerFailure?: import("@/ai/providerFailure").ProviderFailure }): string {
  if (failure.providerFailure?.code === "local_web_action_limit") return "the local research action limit canceled the request";
  if (failure.providerFailure?.code === "local_web_time_limit") return "the local research time limit canceled the request";
  if (failure.providerFailure?.code === "local_web_research_boundary") return "a local research safety boundary stopped the request";
  const known = failure.kind === undefined ? undefined : DISCARDED_REASON_BY_KIND[failure.kind];
  return known ?? DISCARDED_REASON_DEFAULT;
}

/**
 * The attempts whose output was rejected, from every generation's artifacts.
 *
 * The breakdown and total these annotate span the whole job ledger, so the
 * artifacts have to span the same lineage: a bear rejected in generation 0
 * and repaired by a generation-1 retry is billed in that retry's total, and
 * the reader is owed the marking for it there.
 *
 * Never throws: a corrupt artifact/cost pair degrades to "nothing known to be
 * discarded" for that pass in that generation, which is exactly the disclosure
 * this had before. Losing the marking is a smaller harm than failing to
 * assemble the report over it.
 */
function readDiscardedAttempts(jobId: string, assemblyRejected: readonly AssemblyRejectedAttempt[] = []): DiscardedAttempt[] {
  try {
    const lineage = readJobPassArtifactLineage(jobId);
    const rejected = lineage.flatMap((artifact): DiscardedAttempt[] => {
      if (artifact.envelope.outcome !== "failure") return [];
      return [{
        pass: artifact.pass,
        attemptId: artifact.attemptId,
        reason: readerSafeFailureText(artifact.envelope.failure),
        model: artifact.telemetry.model,
        billable: artifact.telemetry.billable,
        usageReported: artifact.telemetry.execution?.usageReported,
        kept: keptSectionsOf(artifact, lineage),
      }];
    });
    // D-123: a success artifact the report could not be assembled from.
    const assembly = assemblyRejected.flatMap((entry): DiscardedAttempt[] => {
      const artifact = lineage.find((candidate) => candidate.attemptId === entry.attemptId && candidate.envelope.outcome === "success");
      if (artifact === undefined) return [];
      return [{
        pass: entry.pass,
        attemptId: entry.attemptId,
        reason: entry.reason,
        model: artifact.telemetry.model,
        billable: artifact.telemetry.billable,
        usageReported: artifact.telemetry.execution?.usageReported,
        kept: [],
      }];
    });
    return [...rejected, ...assembly];
  } catch {
    return [];
  }
}

/**
 * D-116: the completed sections a failed attempt held that the pass's final
 * output kept. A retry reuses a cut-off attempt's finished sections, so that
 * attempt's output was not all thrown away: a verdict can come from a judge
 * attempt the report would otherwise call excluded. A section counts only when
 * the final output's kept text has the digest of the text this attempt held.
 */
function keptSectionsOf(artifact: CurrentGenerationPassArtifact, lineage: readonly CurrentGenerationPassArtifact[]): string[] {
  if (artifact.envelope.outcome !== "failure") return [];
  const final = lineage
    .filter((other) => other.pass === artifact.pass && other.envelope.outcome === "success" && other.settledAt >= artifact.settledAt)
    .sort((left, right) => left.settledAt.localeCompare(right.settledAt))
    .at(-1);
  const carried = final?.telemetry.execution?.carriedSections ?? [];
  if (carried.length === 0) return [];
  const held = completedTopLevelFields(artifact.envelope.failure.partialText ?? "");
  return carried
    .filter((entry) => Object.hasOwn(held, entry.section) && sectionDigest(held[entry.section]) === entry.digest)
    .map((entry) => entry.section);
}

export function buildCostBreakdown(state: RunState): CostBreakdownEntry[] {
  return costBreakdownRows(state.jobId, readCostLedger(state.jobId), { keepFallbackUsed: false, assemblyRejected: state.assemblyRejected });
}

/**
 * D-123: the one ledger-to-breakdown join. A row whose attempt was discarded
 * (and kept no section, D-116) carries the mark and its reason; the live
 * report and durable verify recovery both build their rows here, so recovery
 * cannot drop the mark. Recovery also keeps the per-attempt `fallbackUsed`
 * that cost_log persists.
 */
function costBreakdownRows(
  jobId: string,
  ledger: readonly CostLedgerRow[],
  options: { keepFallbackUsed: boolean; assemblyRejected?: readonly AssemblyRejectedAttempt[] },
): CostBreakdownEntry[] {
  const discarded = readDiscardedAttempts(jobId, options.assemblyRejected);
  let lineage: readonly CurrentGenerationPassArtifact[] = [];
  try { lineage = readJobPassArtifactLineage(jobId); } catch { /* Ledger costs remain authoritative without optional execution evidence. */ }
  const entries: CostBreakdownEntry[] = ledger.map((row) => {
    const match = discarded.find((attempt) => costRowBelongsToAttempt(row.attemptId, attempt.attemptId));
    const candidates = lineage.filter(artifact => artifact.pass === row.step && costRowBelongsToAttempt(row.attemptId, artifact.attemptId));
    const evidence = candidates.length === 1 ? candidates[0]!.telemetry.execution : undefined;
    const execution = evidence?.requestedModel === undefined ? undefined : buildExecutionMetadataEntry({
      step: row.step, requestedModel: evidence.requestedModel, effectiveModel: row.model,
      requestedEffort: evidence.requestedEffort ?? null, fallbackUsed: row.fallbackUsed, execution: evidence,
    });
    return {
      step: row.step,
      model: row.model,
      costUsd: row.costUsd,
      ...(execution === undefined ? {} : { requestedModel: execution.requestedModel, requestedEffort: execution.requestedEffort,
        effectiveEffort: execution.effectiveEffort, adjustments: execution.adjustments }),
      // This is the only execution option cost_log persists per attempt.
      ...(options.keepFallbackUsed ? { fallbackUsed: row.fallbackUsed } : {}),
      ...(match === undefined || match.kept.length > 0 ? {} : { discarded: true, discardedReason: match.reason }),
      ...ledgerTokens(row),
    };
  });
  return [...entries, ...readPlanCostBreakdown(jobId)];
}

export function readPlanCostBreakdown(jobId: string, db: ThesisDb = getDb()): CostBreakdownEntry[] {
  const entries: CostBreakdownEntry[] = [];
  // Plan-allowance attempts intentionally have no API-charge ledger row.
  // Their durable artifacts still belong in the report, including failures.
  try {
    const lineage = readJobPassArtifactLineage(jobId, db);
    for (const artifact of lineage) {
      if (artifact.telemetry.billable || !parseSubscriptionModel(artifact.telemetry.model)) continue;
      const failure = artifact.envelope.outcome === "failure" ? artifact.envelope.failure : null;
      entries.push({ step: artifact.pass, model: artifact.telemetry.execution?.modelObserved === false
        ? `unknown (requested ${artifact.telemetry.execution.requestedModel ?? artifact.telemetry.model})` : artifact.telemetry.model, costUsd: 0,
        ...(failure === null || keptSectionsOf(artifact, lineage).length > 0 ? {} : { discarded: true, discardedReason: readerSafeFailureText(failure) }),
      });
    }
  } catch { /* Invalid artifacts must not replace verified API accounting. */ }
  return entries;
}

/**
 * The manifest entries a repaired pass owes a reader: what was rejected, what
 * it cost, and that the figure beside it was paid twice for one result.
 */
export function discardedAttemptGaps(state: RunState, options: { dataOnly?: boolean } = {}): ManifestEntry[] {
  const discarded = readDiscardedAttempts(state.jobId, state.assemblyRejected);
  if (discarded.length === 0) return [];
  const ledger = readCostLedger(state.jobId);
  return discarded.map((attempt) => {
    const planUsage = attempt.usageReported === false
      ? "It was configured for the connected provider allowance and recorded $0 in API charges; allowance consumption is unknown"
      : "It used the connected provider allowance and recorded $0 in API charges";
    const wasted = ledger
      .filter((row) => costRowBelongsToAttempt(row.attemptId, attempt.attemptId))
      .reduce((sum, row) => sum + row.costUsd, 0);
    const kept = attempt.kept.length === 1
      ? `The completed section it held when it stopped (${attempt.kept[0]}) was kept and appears in this report`
      : `The ${attempt.kept.length} completed sections it held when it stopped (${attempt.kept.join(", ")}) were kept and appear in this report`;
    return {
      field: `llm.${attempt.pass}.discardedAttempt`,
      reason: `Saved attempt ${attempt.attemptId}: ` + (
        options.dataOnly
          ? `A ${attempt.pass} attempt stopped because ${attempt.reason}. ` +
            (attempt.kept.length > 0 ? `Accepted sections (${attempt.kept.join(", ")}) remain saved for recovery; ` : "Its output was not accepted; ") +
            "model analysis is not included in this deterministic snapshot. " +
            (parseSubscriptionModel(attempt.model) && !attempt.billable
              ? `${planUsage}. `
              : `The attempt cost $${wasted.toFixed(4)}, included in the reported total. `) +
            "Usage, failure details and available artifacts remain saved with the run."
          : parseSubscriptionModel(attempt.model) && !attempt.billable
          ? attempt.kept.length > 0
            ? `A ${attempt.pass} attempt stopped before it finished because ${attempt.reason}. ${kept}; the remaining sections were requested again. ${planUsage}; usage and failure details remain saved with the run.`
            : `A ${attempt.pass} attempt did not produce usable output because ${attempt.reason}. ${planUsage}. The rejected output is excluded from this report; usage and failure details remain saved with the run.`
          : attempt.kept.length > 0
            ? `A ${attempt.pass} attempt stopped because ${attempt.reason}. ${kept}; only missing or rejected sections were requested again. The attempt cost $${wasted.toFixed(4)}, included in the reported total. Its usage and failure details remain saved with the run.`
            : `the ${attempt.pass} pass was run more than once: an earlier attempt was billed and its output thrown ` +
        `away because ${attempt.reason}. That attempt cost $${wasted.toFixed(4)}, which is included in the ` +
        "reported total and appears in the cost breakdown marked `discarded`. The analysis itself comes from the " +
        "attempt that succeeded; nothing from the rejected one reached this report, and the failure itself is " +
        "recorded against the run rather than quoted here."),
      severity: "info",
      attemptedSources: [parseSubscriptionModel(attempt.model)?.provider ?? "anthropic"],
      expected: false,
    };
  });
}

interface CostLedgerRow {
  step: string;
  model: string;
  costUsd: number;
  fallbackUsed: boolean;
  attemptId: string | null;
  inputTokens: number;
  outputTokens: number;
  settlementKind: string;
}

/**
 * D-156: a settled request's own token counts. A presumed charge
 * reports none, and a row whose counts are both the column default of zero was
 * written without usage (no real request reports zero tokens both ways).
 */
function ledgerTokens(row: CostLedgerRow): Pick<CostBreakdownEntry, "inputTokens" | "outputTokens"> {
  const counted = (value: number) => Number.isInteger(value) && value >= 0;
  return row.settlementKind === "actual" && counted(row.inputTokens) && counted(row.outputTokens) && row.inputTokens + row.outputTokens > 0
    ? { inputTokens: row.inputTokens, outputTokens: row.outputTokens } : {};
}

/** Ordered immutable accounting rows used to rebuild persisted report metadata. */
export function readCostLedger(jobId: string, db: ThesisDb = getDb()): CostLedgerRow[] {
  return db
    .select({
      step: costLog.step,
      model: costLog.model,
      costUsd: costLog.costUsd,
      fallbackUsed: costLog.fallbackUsed,
      attemptId: costLog.attemptId,
      inputTokens: costLog.inputTokens,
      outputTokens: costLog.outputTokens,
      settlementKind: costLog.settlementKind,
    })
    .from(costLog)
    .where(eq(costLog.jobId, jobId))
    .orderBy(costLog.id)
    .all();
}

/** OAuth passes have no API-charge row; their durable artifacts retain execution evidence. */
export function readSuccessfulExecutions(jobId: string, requestedModel: string, includeFailures = false): ExecutionMetadataEntry[] {
  // Reuse resume's authoritative fold: a newer failed/corrupt pass supersedes
  // an older success, and newer upstream work invalidates old downstream work.
  const cohort = getDb().transaction((db) => readStoredJobResumeInTransaction(db, jobId)?.artifacts);
  if (cohort === undefined) return [];
  return ["bull", "bear", "synthesize"].flatMap((step) => {
    const artifacts = cohort.currentArtifacts.filter((artifact) =>
      artifact.pass === step && (includeFailures || artifact.envelope.outcome === "success"));
    if ((!includeFailures && artifacts.length !== 1) || cohort.corruptPasses.some((pass) => pass === step)) return [];
    return artifacts.map((artifact, index) => {
    const execution = buildExecutionMetadataEntry({
      step: artifacts.length > 1 ? `${step} attempt ${index + 1}` : step,
      requestedModel: artifact.telemetry.execution?.requestedModel ?? requestedModel,
      effectiveModel: artifact.telemetry.model,
      requestedEffort: null,
      fallbackUsed: artifact.telemetry.fallbackUsed,
      execution: artifact.telemetry.execution,
      usage: { input_tokens: artifact.telemetry.inputTokens, output_tokens: artifact.telemetry.outputTokens },
    });
    if (artifact.envelope.outcome === "failure") {
      execution.note = `${execution.note ? `${execution.note} ` : ""}${failedPassNote(step)}`;
    }
    return execution;
    });
  });
}

/** Sum of every cost_log row already recorded for a job (resume rehydration). */
export function sumLoggedCost(jobId: string, db: ThesisDb = getDb()): number {
  const rows = db
    .select({ costUsd: costLog.costUsd })
    .from(costLog)
    .where(eq(costLog.jobId, jobId))
    .all();
  return rows.reduce((acc, r) => acc + r.costUsd, 0);
}

/** What part of a run's reported cost is a bound rather than a charge. */
export interface PresumedSpendDisclosure {
  totalUsd: number;
  entry: ManifestEntry;
}

/**
 * Presumed spend belonging to this job, as a disclosure (DECISIONS D-07).
 *
 * A reservation whose owning process died, and a stream that was accepted and
 * then went silent, are both counted at their reserved maximum until evidence
 * lowers them. That bound is part of the total the report shows, so the report
 * has to say so: without this, a user whose run crashed mid-pass sees a total
 * inflated by up to one request maximum with no sign that part of it is an
 * upper bound rather than a charge.
 *
 * Every generation of the job qualifies, because every generation is in the
 * total: `meta.costUsd`, the breakdown and the per-step figures all sum the
 * whole job ledger. A process that died holding a lease cannot write its own
 * report, so its presumption is only ever reported by a LATER generation —
 * which a current-generation filter excluded, leaving the resumed report's
 * total silently inflated by the very row this disclosure exists for.
 */
export function presumedSpendDisclosure(jobId: string): PresumedSpendDisclosure | null {
  const rows = listPresumedCosts().filter((row) => row.jobId === jobId);
  if (rows.length === 0) return null;
  const totalUsd = round4(rows.reduce((total, row) => total + row.costUsd, 0));
  const passes = [...new Set(rows.map((row) => row.pass))].sort().join(", ");
  return {
    totalUsd,
    entry: {
      field: "cost.presumed",
      reason:
        `$${totalUsd.toFixed(4)} of the reported cost is a presumed upper bound, not a measured ` +
        `charge: ${rows.length} authorized provider request(s) (${passes}) did not provide ` +
        "enough evidence to verify billing; a conservative upper bound is counted until reconciled " +
        "(npm run costs:reconcile).",
      severity: "warn",
      attemptedSources: ["anthropic"],
    },
  };
}

/** Manifest fields reconcileMeta owns and therefore re-stamps wholesale. */
const RECONCILED_MANIFEST_FIELDS = new Set([
  "cost.presumed",
  "llm.judge.case-order",
  "llm.judge.model-family",
]);

/**
 * Suffix of the per-pass discarded-attempt entries, which are re-derived from
 * the durable artifacts on every reconciliation. Matched by suffix because the
 * field carries the pass name (`llm.bear.discardedAttempt`).
 */
const DISCARDED_ATTEMPT_FIELD_SUFFIX = ".discardedAttempt";

/**
 * Reconcile the runner-owned meta + appendix cost/verification fields onto a
 * Report the passes assembled (the passes may not know the final cost or the
 * complete cost breakdown). Non-destructive: only overwrites meta and the
 * cost/verification appendix fields, leaving section content untouched.
 */
export function reconcileMeta(
  report: Report,
  meta: ReportMetaInput,
  costBreakdown: CostBreakdownEntry[],
  verifyLog: unknown,
  presumed: PresumedSpendDisclosure | null = null,
  discarded: ManifestEntry[] = [],
): Report {
  // D-20: the shared-model-family disclosure has to be
  // computed HERE, from the runner's execution list, because this is the only
  // place the effective models per step are known for certain.
  //
  // Stage C's verify path assembles the report with `costEntries: []`, so
  // `sharedModelFamilyOf([])` returned "not shared" on every verify-succeeded
  // run — the normal path — and NOTHING lit: no metadata flag, no reader
  // sentence (both branches need non-null families), no llm.judge.model-family
  // manifest entry, no badge. And even where it was computed (the unverified
  // fallback), the `execution:` line below replaced meta.execution with the
  // runner's own list, discarding the appended execution note. Re-stamping the
  // protocol, the execution note and the manifest entry from `meta.execution`
  // fixes both paths at once, including durable verify recovery.
  const execution = meta.execution ?? report.meta.execution;
  const annotatedExecution =
    execution === undefined ? undefined : annotateSharedModelFamily(execution);
  const judgeProtocol =
    report.meta.judgeProtocol === undefined || annotatedExecution === undefined
      ? report.meta.judgeProtocol
      : restampSharedModelFamily(
          report.meta.judgeProtocol,
          sharedModelFamilyOf(annotatedExecution),
        );

  const missingData = attributeJudgeProtocolDisclosures([
    ...report.appendix.missingData.filter(
      (gap) =>
        !RECONCILED_MANIFEST_FIELDS.has(gap.field) &&
        !gap.field.endsWith(DISCARDED_ATTEMPT_FIELD_SUFFIX) &&
        !/^llm\..+\.researchCoverage$/.test(gap.field),
    ),
    ...(judgeProtocol === undefined ? [] : judgeProtocolManifestEntries(judgeProtocol)),
    ...(presumed === null ? [] : [presumed.entry]),
    // A pass that was rejected and re-run billed twice for one result. The
    // breakdown beside this marks the wasted row; these say so in words. They
    // belong HERE, with the cost breakdown they explain, so the two cannot
    // disagree — and so `dataCompleteness` below is computed over them.
    ...discarded,
    ...webResearchLimitationGaps(annotatedExecution),
  ], { execution: annotatedExecution, model: meta.model });
  // Both edits above CHANGE the manifest this metadata summarizes. Recomputing
  // is not optional: deriveReportCompletenessPresentation recomputes from the
  // manifest and reports "inconsistent" — which blanks state, counts, EDGAR,
  // XBRL and forensic validation in the appendix and the banner — the moment
  // the two disagree by a single warn entry.
  const dataCompleteness = buildDataCompleteness(missingData);

  const next: Report = {
    ...report,
    meta: {
      ...report.meta,
      symbol: meta.symbol,
      companyName: meta.companyName || report.meta.companyName,
      generatedAt: meta.generatedAt,
      // Verification assembles a provisional report before the runner stamps
      // final generation. Keep its disclosure cutoff on that same clock while
      // retaining the recorded input dates and Stage B calculation basis.
      ...(report.meta.evidenceTiming === undefined ? {} : { evidenceTiming: {
        ...report.meta.evidenceTiming,
        cutoffAt: meta.generatedAt,
        reportGeneratedAt: meta.generatedAt,
      } }),
      specVersion: REPORT_SPEC_VERSION,
      model: meta.model,
      pipelineVersion: PIPELINE_VERSION,
      costUsd: meta.costUsd,
      verificationRate: meta.verificationRate,
      disclaimer: DISCLAIMER_TEXT,
      asOfMap: { ...meta.asOfMap, ...report.meta.asOfMap },
      ...(annotatedExecution === undefined ? {} : { execution: annotatedExecution }),
      ...(judgeProtocol === undefined ? {} : { judgeProtocol }),
      dataCompleteness,
      runId: meta.runId ?? report.meta.runId,
      startedAt: meta.startedAt ?? report.meta.startedAt,
      completedAt: meta.completedAt ?? report.meta.completedAt,
      ...(presumed === null ? {} : { presumedCostUsd: presumed.totalUsd }),
    },
    appendix: {
      ...report.appendix,
      verificationRate: meta.verificationRate,
      missingData,
      // Each row was joined to its own durable attempt. A pass-level lookup
      // would relabel earlier failures with the successful retry's settings.
      costBreakdown: costBreakdown.length > 0 ? costBreakdown : report.appendix.costBreakdown,
    },
  };
  if (verifyLog !== undefined && Array.isArray(verifyLog)) {
    next.appendix.verificationLog = verifyLog as Report["appendix"]["verificationLog"];
  }
  return next;
}

/**
 * Repair runner-owned metadata on a recovered final verify artifact before it
 * is linked. Stage C settles verification before the runner knows the complete
 * ledger, so its durable report intentionally contains provisional zero/empty
 * accounting fields. Recovery has no live pipeline context; the local ledger
 * and durable verify telemetry are the complete authority available here.
 */
export function reconcileRecoveredVerifyReport(
  state: RunState,
  verify: PassResultLike<Report>,
): Report {
  const ledger = readCostLedger(state.jobId);
  state.totalCostUsd = ledger.reduce((total, row) => total + row.costUsd, 0);
  const requestedModel = verify.data.meta.model;
  const effectiveByStep = new Map<string, CostLedgerRow>();
  for (const row of ledger) {
    if (row.step === "bull" || row.step === "bear" || row.step === "synthesize") {
      // Ordered by cost_log.id: the last result attempt is the effective pass,
      // while every earlier billed attempt remains visible in the appendix.
      effectiveByStep.set(row.step, row);
    }
  }
  const savedExecution = readSuccessfulExecutions(state.jobId, requestedModel);
  const execution: ExecutionMetadataEntry[] = [];
  for (const step of ["bull", "bear", "synthesize"] as const) {
    const saved = savedExecution.find((entry) => entry.step === step);
    if (saved !== undefined) {
      execution.push(saved);
      continue;
    }
    const row = effectiveByStep.get(step);
    if (row === undefined) continue;
    execution.push(buildExecutionMetadataEntry({
      step,
      requestedModel,
      effectiveModel: row.model,
      // Requested effort is not persisted in cost_log; never infer historical
      // execution from the current process setting.
      requestedEffort: null,
      fallbackUsed: row.fallbackUsed,
    }));
  }
  // A recovered schema-valid report is finalized by this durable verify
  // artifact. Historical paid verify attempts remain costs, not the effective
  // final verification execution.
  execution.push(buildExecutionMetadataEntry({
    step: "verify",
    requestedModel: "deterministic",
    effectiveModel: verify.model,
    requestedEffort: null,
    fallbackUsed: verify.fallbackUsed,
  }));
  const costBreakdown = costBreakdownRows(state.jobId, ledger, { keepFallbackUsed: true });
  const report = costBreakdown.length === 0
    ? {
        ...verify.data,
        appendix: { ...verify.data.appendix, costBreakdown: [] },
      }
    : verify.data;
  const reconciled = reconcileMeta(
    report,
    {
      symbol: state.symbol,
      companyName: report.meta.companyName,
      generatedAt: report.meta.generatedAt,
      model: report.meta.model,
      costUsd: state.totalCostUsd,
      verificationRate: report.meta.verificationRate,
      asOfMap: { ...report.meta.asOfMap },
      execution,
      runId: state.jobId,
      startedAt: state.startedAt,
      completedAt: findStep(state, "verify").completedAt ?? findStep(state, "verify").finishedAt,
    },
    costBreakdown,
    report.appendix.verificationLog,
    presumedSpendDisclosure(state.jobId),
    // Durable recovery reads the same artifacts, so a run whose pass was
    // repaired before the crash still discloses the attempt it threw away.
    discardedAttemptGaps(state),
  );
  return ReportSchema.parse({
    ...reconciled,
    // Linking accepted work is not a rerun under today's financial/verifier
    // rules. Reconcile accounting, but keep the methods that produced it.
    meta: { ...reconciled.meta, specVersion: report.meta.specVersion, pipelineVersion: report.meta.pipelineVersion },
    appendix: {
      ...reconciled.appendix,
      // reconcileMeta's normal path enriches one row per pass. Recovery instead
      // has an attempt ledger, so preserve every row and its own persisted flag.
      costBreakdown,
    },
  });
}

export function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
