/**
 * Run outcomes, split out of jobRunner.ts: finishing a run as done, superseded, unsupported, failed
 * or aborted, and persisting the validated report under the live run authority (P21, P24).
 */

import { analysisOutcomeFromSteps } from "@/report/analysisCompletion";
import { eq } from "drizzle-orm";
import { reports } from "@/db/schema";
import { type PipelineStep } from "@/types/core";
import { REPORT_SPEC_VERSION, ReportSchema, type Report } from "@/report/schema";
import { persistRunInputSnapshot, readJobRunSnapshotRef, readRunInputSnapshot } from "@/pipeline/runInputSnapshotStore";
import { mutateJobSnapshotInTransaction } from "@/pipeline/jobState";
import { type InstrumentSupport } from "@/pipeline/stageB/instrumentSupport";
import { readStoredJobResumeInTransaction } from "@/pipeline/jobStore";
import { type JobEventPayload, type RunState, SupersededRunError, finishStep, markSkipped, nowIso, persistSteps, publish, withLiveRunAuthority } from "./jobStepProgress";
import { readCostLedger, readPlanCostBreakdown, reconcilePersistedCostBreakdown, round4, sumLoggedCost } from "./jobCostLedger";
import { errMessage } from "./jobFailures";

interface RunJobCommonResult {
  jobId: string;
  reportId: number | null;
  verificationRate: number | null;
  totalCostUsd: number;
  /** True when the LLM steps were skipped (no key) → data-only report. */
  dataOnly: boolean;
}

export type RunJobResult =
  | (RunJobCommonResult & { status: "done" | "error" })
  | (RunJobCommonResult & {
      status: "unsupported";
      reportId: null;
      verificationRate: null;
      dataOnly: false;
      kind: Extract<InstrumentSupport, { supported: false }>["kind"];
      message: string;
    });

/* ------------------------------------------------------------------------ *
 * Terminal helpers
 * ------------------------------------------------------------------------ */

export function finishRun(
  state: RunState,
  out: { reportId: number | null; verificationRate: number | null; dataOnly: boolean },
): RunJobResult {
  const doneEvent: JobEventPayload = {
    type: "done",
    jobId: state.jobId,
    reportId: out.reportId,
    verificationRate: out.verificationRate,
    totalCostUsd: round4(state.totalCostUsd),
    dataOnly: out.dataOnly,
  };
  publish(state, doneEvent);
  return {
    jobId: state.jobId,
    status: "done",
    reportId: out.reportId,
    verificationRate: out.verificationRate,
    totalCostUsd: round4(state.totalCostUsd),
    dataOnly: out.dataOnly,
  };
}

/** Return to a stale caller without changing or announcing the current owner. */
export function supersededRunResult(state: RunState): RunJobResult {
  return {
    jobId: state.jobId,
    status: "error",
    reportId: null,
    verificationRate: null,
    totalCostUsd: round4(sumLoggedCost(state.jobId)),
    dataOnly: false,
  };
}

export function finishUnsupported(
  state: RunState,
  support: Extract<InstrumentSupport, { supported: false }>,
): RunJobResult {
  for (const step of state.steps) markSkipped(state, step.step, support.reason);

  const terminal = withLiveRunAuthority(state, null, (db, _row, authorityAt) => {
    const update = mutateJobSnapshotInTransaction(db, {
      jobId: state.jobId,
      now: new Date(authorityAt),
      fence: {
        runGeneration: state.runGeneration,
        status: "running",
        leaseOwner: state.claim.leaseOwner,
        leaseValidAfter: authorityAt,
      },
      mutate: () => ({
        status: "unsupported",
        error: null,
        reportId: null,
        unsupportedKind: support.kind,
        unsupportedMessage: support.reason,
        stepsJson: JSON.stringify(state.steps),
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
      }),
    });
    if (update === null) {
      throw new SupersededRunError(state.jobId, state.runGeneration);
    }
    return update.revision;
  });
  if (!terminal.authorized) {
    throw new SupersededRunError(state.jobId, state.runGeneration);
  }
  state.revision = terminal.value;

  const totalCostUsd = round4(state.totalCostUsd);
  publish(state, {
    type: "unsupported",
    jobId: state.jobId,
    kind: support.kind,
    message: support.reason,
    totalCostUsd,
  });
  return {
    jobId: state.jobId,
    status: "unsupported",
    reportId: null,
    verificationRate: null,
    totalCostUsd,
    dataOnly: false,
    kind: support.kind,
    message: support.reason,
  };
}

/** Terminal failure that leaves nothing to persist (e.g. fetch hard-failed). */
export function failRun(state: RunState, step: PipelineStep, err: unknown): RunJobResult {
  finishStep(state, step, "error", errMessage(err));
  // Any steps not yet started become skipped for a clean strip.
  for (const s of state.steps) {
    if (s.status === "pending") {
      s.status = "skipped";
      s.detail = `not reached — ${step} failed`;
    }
  }
  persistSteps(state, "error", errMessage(err));
  publish(state, { type: "error", jobId: state.jobId, message: errMessage(err) });
  return {
    jobId: state.jobId,
    status: "error",
    reportId: null,
    verificationRate: null,
    totalCostUsd: round4(state.totalCostUsd),
    dataOnly: false,
  };
}

/** Terminal cancellation/deadline: never persists a partial or misleading report. */
export function abortRun(state: RunState, reason: unknown): RunJobResult {
  const message = errMessage(reason);
  for (const step of state.steps) {
    if (step.status === "running") {
      step.status = "error";
      step.finishedAt = nowIso();
      step.completedAt = step.finishedAt;
      step.detail = message;
    } else if (step.status === "pending") {
      step.status = "skipped";
      step.detail = `not reached — ${message}`;
    }
  }
  persistSteps(state, "error", message);
  publish(state, { type: "error", jobId: state.jobId, message });
  return {
    jobId: state.jobId,
    status: "error",
    reportId: null,
    verificationRate: null,
    totalCostUsd: round4(state.totalCostUsd),
    dataOnly: false,
  };
}

/** Insert a reports row, link jobs.reportId, return the new report id. */
export function persistReport(
  state: RunState,
  report: Report | unknown,
  model: string,
  verificationRate: number | null,
  status: string,
): number {
  const persisted = withLiveRunAuthority(state, null, (db, _row, authorityAt) => {
    let runSnapshot = readJobRunSnapshotRef(state.jobId, state.runGeneration, db);
    // A settled verification resume skips fetch/compute. Carry the exact input
    // association from its durable source generation, never today's cache.
    if (runSnapshot === null && _row.resumeSourceGeneration !== null) {
      const verifyGeneration = readStoredJobResumeInTransaction(db, state.jobId)?.artifacts.currentArtifacts
        .find(artifact => artifact.pass === "verify" && artifact.envelope.outcome === "success")?.runGeneration;
      const sourceRef = readJobRunSnapshotRef(state.jobId, verifyGeneration ?? _row.resumeSourceGeneration, db);
      if (sourceRef !== null) {
        const source = readRunInputSnapshot(sourceRef.hash, db)!;
        runSnapshot = persistRunInputSnapshot(state.jobId, state.runGeneration, source, sourceRef.capturedAt, db);
      }
    }
    // R1: the same reader as every other ledger join, inside this authority
    // transaction, so a row reconciled here keeps its settled token counts.
    const ledger = readCostLedger(state.jobId, db);
    const authoritativeCostUsd = ledger.reduce((total, entry) => total + entry.costUsd, 0);
    const parsed = ReportSchema.safeParse(report);
    const reportForPersistence: Report | unknown = parsed.success
      ? {
          ...parsed.data,
          meta: {
            ...parsed.data.meta,
            costUsd: authoritativeCostUsd,
            runSnapshot: runSnapshot ?? undefined,
            analysisOutcome: analysisOutcomeFromSteps(state.steps, {
              dataOnly: parsed.data.appendix.missingData.some(gap => gap.field === "analysis.llm"),
            }),
          },
          appendix: {
            ...parsed.data.appendix,
            costBreakdown: [...reconcilePersistedCostBreakdown(
              parsed.data.appendix.costBreakdown,
              ledger,
            ), ...readPlanCostBreakdown(state.jobId, db)],
          },
        }
      : report;
    const inserted = db
      .insert(reports)
      .values({
        symbol: state.symbol,
        createdAt: authorityAt,
        model,
        status,
        reportJson: JSON.stringify(reportForPersistence),
        verificationRate,
        costUsd: authoritativeCostUsd,
        specVersion: REPORT_SPEC_VERSION,
      })
      .returning({ id: reports.id })
      .get();
    if (parsed.success) {
      const canonical = reportForPersistence as Report;
      const persistedReport: Report = {
        ...canonical,
        meta: {
          ...canonical.meta,
          runId: state.jobId,
          reportId: inserted.id,
          persistedAt: authorityAt,
        },
      };
      db
        .update(reports)
        .set({ reportJson: JSON.stringify(persistedReport) })
        .where(eq(reports.id, inserted.id))
        .run();
    }
    const link = mutateJobSnapshotInTransaction(db, {
      jobId: state.jobId,
      now: new Date(authorityAt),
      fence: {
        runGeneration: state.runGeneration,
        status: "running",
        leaseOwner: state.claim.leaseOwner,
        leaseValidAfter: authorityAt,
      },
      mutate: () => ({
        reportId: inserted.id,
        status: "done",
        error: null,
        unsupportedKind: null,
        unsupportedMessage: null,
        stepsJson: JSON.stringify(state.steps),
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
      }),
    });
    if (link === null) {
      throw new SupersededRunError(state.jobId, state.runGeneration);
    }
    return {
      reportId: inserted.id,
      revision: link.revision,
      totalCostUsd: authoritativeCostUsd,
    };
  });
  if (!persisted.authorized) {
    throw new SupersededRunError(state.jobId, state.runGeneration);
  }
  state.revision = persisted.value.revision;
  state.claim.revision = persisted.value.revision;
  state.totalCostUsd = persisted.value.totalCostUsd;
  return persisted.value.reportId;
}
