/**
 * Step-progress bookkeeping, split out of jobRunner.ts: the per-run orchestration state, the live
 * run-authority fence on every write, and persisting plus publishing each step transition. Failures
 * and skips are recorded as observed (P24).
 */

import { and, eq } from "drizzle-orm";
import { getDb, type ThesisDb } from "@/db";
import { costLog, jobs } from "@/db/schema";
import { type PipelineStep, type StepProgress } from "@/types/core";
import { publishJobEvent, type JobEvent } from "@/pipeline/events";
import { mutateJobSnapshotInTransaction } from "@/pipeline/jobState";
import { type JobClaim, type SchedulerLimits } from "@/pipeline/jobScheduler";

/** Job lifecycle statuses (owned by this module; jobs.status is free TEXT). */
export type JobStatus = "queued" | "running" | "done" | "error" | "unsupported";

/** The durable row moved to another generation/owner while this worker was alive. */
export class SupersededRunError extends Error {
  constructor(jobId: string, runGeneration: number) {
    super(`jobRunner: job "${jobId}" generation ${runGeneration} was superseded`);
    this.name = "SupersededRunError";
  }
}

/* ------------------------------------------------------------------------ *
 * Step-progress bookkeeping
 * ------------------------------------------------------------------------ */

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Mutable per-job orchestration state. Holds the live StepProgress[] and the
 * running cost so the runner can persist + publish after every transition
 * without re-reading the DB.
 */
export interface RunState {
  jobId: string;
  symbol: string;
  startedAt: string;
  runGeneration: number;
  revision: number;
  claim: JobClaim;
  schedulerLimits: SchedulerLimits;
  steps: StepProgress[];
  totalCostUsd: number;
  /**
   * D-123: judge attempts whose output was paid for and then rejected at
   * report assembly. They settled as successes, so no failure artifact marks
   * them; the runner records them here for the cost breakdown. Lives in this
   * process only: a durable verify recovery after a crash does not see it.
   */
  assemblyRejected: AssemblyRejectedAttempt[];
}

export interface AssemblyRejectedAttempt {
  pass: "synthesize";
  attemptId: string;
  reason: string;
}

export type JobEventPayload = JobEvent extends infer Event
  ? Event extends JobEvent
    ? Omit<Event, "revision">
    : never
  : never;

interface LiveAuthorityRow {
  revision: number;
  stepsJson: string;
  resumeSourceGeneration: number | null;
}

/**
 * Acquire SQLite write authority before sampling wall time. Every runner-owned
 * mutation uses this primitive so a writer-lock wait can never resurrect an
 * owner whose durable lease expired while blocked.
 */
export function withLiveRunAuthority<T>(
  state: RunState,
  expectedRevision: number | null,
  work: (db: ThesisDb, row: LiveAuthorityRow, authorityAt: string) => T,
): { authorized: true; value: T } | { authorized: false } {
  return getDb().transaction((tx) => {
    const authorityAt = new Date().toISOString();
    const row = tx.select({
      runGeneration: jobs.runGeneration,
      resumeSourceGeneration: jobs.resumeSourceGeneration,
      revision: jobs.revision,
      status: jobs.status,
      leaseOwner: jobs.leaseOwner,
      leaseExpiresAt: jobs.leaseExpiresAt,
      stepsJson: jobs.stepsJson,
    }).from(jobs).where(eq(jobs.id, state.jobId)).get();
    if (
      row === undefined ||
      row.runGeneration !== state.runGeneration ||
      row.status !== "running" ||
      row.leaseOwner !== state.claim.leaseOwner ||
      row.leaseExpiresAt === null ||
      row.leaseExpiresAt <= authorityAt ||
      (expectedRevision !== null && row.revision !== expectedRevision)
    ) {
      return { authorized: false } as const;
    }
    return {
      authorized: true,
      value: work(tx as ThesisDb, row, authorityAt),
    } as const;
  }, { behavior: "immediate" });
}

export function findStep(state: RunState, step: PipelineStep): StepProgress {
  const found = state.steps.find((s) => s.step === step);
  if (found === undefined) {
    // Programming error — PIPELINE_STEPS is fixed and initialSteps() covers all.
    throw new Error(`jobRunner: unknown pipeline step "${step}"`);
  }
  return found;
}

/** Persist the current StepProgress[] + updatedAt to the jobs row. */
export function persistSteps(state: RunState, status?: JobStatus, error?: string | null): void {
  const persisted = withLiveRunAuthority(state, null, (db, _row, authorityAt) => {
    const canonicalSteps = status === "error"
      ? state.steps.map((step): StepProgress => {
          if (step.status === "running") {
            return {
              ...step,
              status: "error",
              detail: error ?? "job failed",
              finishedAt: authorityAt,
              completedAt: authorityAt,
            };
          }
          if (step.status === "pending") {
            return {
              ...step,
              status: "skipped",
              detail: `not reached — ${error ?? "job failed"}`,
            };
          }
          return step;
        })
      : state.steps;
    const set: Record<string, unknown> = {
      stepsJson: JSON.stringify(canonicalSteps),
    };
    if (status !== undefined) {
      set.status = status;
      if (status === "done" || status === "error" || status === "unsupported") {
        set.leaseOwner = null;
        set.leaseExpiresAt = null;
        set.heartbeatAt = null;
      }
      if (status !== "unsupported") {
        set.unsupportedKind = null;
        set.unsupportedMessage = null;
      }
    }
    if (error !== undefined) set.error = error;
    const result = mutateJobSnapshotInTransaction(db, {
      jobId: state.jobId,
      now: new Date(authorityAt),
      fence: {
        runGeneration: state.runGeneration,
        status: "running",
        leaseOwner: state.claim.leaseOwner,
        leaseValidAfter: authorityAt,
      },
      mutate: () => set,
    });
    if (result === null) {
      // withLiveRunAuthority already proved this exact row/fence while holding
      // BEGIN IMMEDIATE. Null therefore means the canonical patch is an exact
      // no-op, not lost authority.
      return { revision: _row.revision, steps: canonicalSteps };
    }
    return { revision: result.revision, steps: canonicalSteps };
  });
  if (!persisted.authorized) {
    throw new SupersededRunError(state.jobId, state.runGeneration);
  }
  state.revision = persisted.value.revision;
  state.claim.revision = persisted.value.revision;
  state.steps = persisted.value.steps;
}

/** Emit a step-update event for the given step's current state. */
export function emitStep(state: RunState, step: PipelineStep): void {
  publish(state, {
    type: "step-update",
    jobId: state.jobId,
    step: { ...findStep(state, step) },
    steps: state.steps.map((s) => ({ ...s })),
  });
}

/** Publish an event through the bus (isolated so a bad subscriber can't break the run). */
export function publish(_state: RunState, event: JobEventPayload): void {
  const current = getDb()
    .select({
      runGeneration: jobs.runGeneration,
      revision: jobs.revision,
      status: jobs.status,
      leaseOwner: jobs.leaseOwner,
      leaseExpiresAt: jobs.leaseExpiresAt,
    })
    .from(jobs)
    .where(eq(jobs.id, _state.jobId))
    .get();
  const live =
    current?.runGeneration === _state.runGeneration &&
    current.status === "running" &&
    current.leaseOwner === _state.claim.leaseOwner &&
    current.leaseExpiresAt !== null &&
    current.leaseExpiresAt > nowIso();
  const terminal = current?.runGeneration === _state.runGeneration && (
    (event.type === "done" && current.status === "done") ||
    (event.type === "error" && current.status === "error") ||
    (event.type === "unsupported" && current.status === "unsupported")
  );
  if ((live || terminal) && current !== undefined) {
    publishJobEvent({ ...event, revision: current.revision } as JobEvent);
  }
}

/** Mark a step "running" (stamp startedAt), persist, and emit. */
export function startStep(state: RunState, step: PipelineStep): void {
  const s = findStep(state, step);
  s.status = "running";
  s.startedAt = nowIso();
  delete s.completedAt;
  delete s.finishedAt;
  delete s.detail;
  persistSteps(state);
  emitStep(state, step);
}

/**
 * Mark a step terminal ("done" | "error" | "skipped"), persist, and emit.
 * A finishedAt already stamped by a pass-finish hook is preserved (real pass
 * timing beats bookkeeping timing); startStep clears it, so every fresh run
 * still gets a fresh stamp.
 */
export function finishStep(
  state: RunState,
  step: PipelineStep,
  status: "done" | "error" | "skipped",
  detail?: string,
  costUsd?: number,
): void {
  const s = findStep(state, step);
  s.status = status;
  s.finishedAt ??= nowIso();
  s.completedAt = s.finishedAt;
  if (detail !== undefined) s.detail = detail;
  const logged = sumLoggedStepCost(state.jobId, step);
  if (costUsd !== undefined || logged > 0) {
    // A step may contain several billed attempts (judge retries, fallback
    // calls, or a partial-resume side). The cost log is authoritative; retain
    // the passed value only for hook-less callers that did not log a row.
    s.costUsd = logged > 0 ? logged : costUsd;
  }
  persistSteps(state);
  emitStep(state, step);
}

function sumLoggedStepCost(jobId: string, step: PipelineStep, db: ThesisDb = getDb()): number {
  const rows = db
    .select({ costUsd: costLog.costUsd })
    .from(costLog)
    .where(and(eq(costLog.jobId, jobId), eq(costLog.step, step)))
    .all();
  return rows.reduce((total, row) => total + row.costUsd, 0);
}

/** Record local timing only; durable completion is published after settlement commit. */
export function stampStepFinished(state: RunState, step: PipelineStep): void {
  const s = findStep(state, step);
  s.finishedAt = nowIso();
}

/** startStep only if the step never started (backfill for hook-less mocks). */
export function ensureStepStarted(state: RunState, step: PipelineStep): void {
  if (findStep(state, step).status === "pending") startStep(state, step);
}

/** Update detail on a running step without making it terminal. */
export function updateRunningStepDetail(
  state: RunState,
  step: PipelineStep,
  detail: string,
  costUsd?: number,
): void {
  const s = findStep(state, step);
  s.detail = detail;
  if (costUsd !== undefined) s.costUsd = costUsd;
  persistSteps(state);
  emitStep(state, step);
}

export function markSkipped(state: RunState, step: PipelineStep, reason: string): void {
  const s = findStep(state, step);
  if (s.status === "pending") {
    s.status = "skipped";
    s.startedAt ??= nowIso();
    s.finishedAt = nowIso();
    s.completedAt = s.finishedAt;
    s.detail = reason;
    persistSteps(state);
    emitStep(state, step);
  }
}
