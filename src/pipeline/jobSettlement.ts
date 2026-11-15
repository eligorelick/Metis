/**
 * Paid-pass settlement, split out of jobRunner.ts: the checkpoint that settles each billed request
 * exactly once against its reservation, adopts a settlement another worker committed, and turns a
 * pass result or failure into its telemetry and step detail (P23, P24).
 */

import { randomUUID } from "node:crypto";
import { ProviderFailureSchema } from "@/ai/providerFailure";
import { RequestSettlementNotRecordedError } from "@/providers/anthropic";
import type { RequestAdmission, RequestPermit } from "@/providers/anthropic";
import { canonicalizeFetchedUrl } from "@/pipeline/stageC/provenance";
import { PassSettlementHookError, serializePassFailure, type DurablePass, type PassSettlement, type PassSettlementHook, type PassTelemetry, type SerializedPassFailure } from "@/pipeline/jobArtifacts";
import { acquirePaidPassLease, authorizePaidPassLaunch, releaseUnbilledPaidPassLease, renewPaidPassLease, requestAttemptId, resizePaidPassLease, settlePaidPassLease, settleRequestCost, PaidPassOverReservationError, isTransientWriterLock, renewalFailureTolerable, connectionBusyTimeoutMs, type PaidPassLease, type SettlePaidPassResult } from "@/pipeline/jobScheduler";
import type { BilledPassAttempt, BullBearPassFailureDetails, PassResultLike } from "./jobPassContract";
import { type RunState, SupersededRunError, emitStep, findStep, nowIso, publish } from "./jobStepProgress";
import { errMessage } from "./jobFailures";

/**
 * What a failed request-settlement write is thrown as. A write refused by
 * another process's writer lock did not commit and may be retried, so the
 * provider is told so; any other error (the over-reservation invariant, a
 * programming error) is returned unchanged and stays loud.
 */
export function requestSettlementWriteError(error: unknown): unknown {
  return isTransientWriterLock(error) ? new RequestSettlementNotRecordedError(error) : error;
}

export function numOr0(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function canonicalFetchedUrls(values: string[] | undefined): string[] {
  return [
    ...new Set(
      (values ?? []).flatMap((value) => {
        const canonical = canonicalizeFetchedUrl(value);
        return canonical ? [canonical] : [];
      }),
    ),
  ].sort();
}

function telemetryFromPassResult<T>(
  pass: PassResultLike<T>,
  billable = true,
): PassTelemetry {
  return {
    model: pass.model,
    inputTokens: numOr0(pass.usage?.input_tokens),
    outputTokens: numOr0(pass.usage?.output_tokens),
    cacheReadTokens: numOr0(pass.usage?.cache_read_input_tokens),
    cacheWriteTokens: numOr0(pass.usage?.cache_creation_input_tokens),
    webSearches: numOr0(pass.webSearches),
    costUsd: pass.costUsd,
    fallbackUsed: pass.fallbackUsed,
    billable,
    ...(pass.presumed === undefined ? {} : { presumed: pass.presumed }),
    fetchedUrls: canonicalFetchedUrls(pass.fetchedUrls),
    ...(pass.execution === undefined ? {} : { execution: pass.execution }),
  };
}

export function telemetryFromAttempt(
  attempt: BilledPassAttempt | null,
  defaultModel: string,
): PassTelemetry {
  return {
    model: attempt?.model ?? defaultModel,
    inputTokens: numOr0(attempt?.usage?.input_tokens),
    outputTokens: numOr0(attempt?.usage?.output_tokens),
    cacheReadTokens: numOr0(attempt?.usage?.cache_read_input_tokens),
    cacheWriteTokens: numOr0(attempt?.usage?.cache_creation_input_tokens),
    webSearches: numOr0(attempt?.webSearches),
    costUsd: attempt?.costUsd ?? 0,
    fallbackUsed: attempt?.fallbackUsed ?? false,
    billable: attempt !== null,
    ...(attempt?.presumed === undefined ? {} : { presumed: attempt.presumed }),
    fetchedUrls: [],
    ...(attempt?.execution === undefined ? {} : { execution: attempt.execution }),
  };
}

export function successSettlement<T>(pass: PassResultLike<T>, billable = true): PassSettlement<T> {
  return { outcome: "success", data: pass.data, telemetry: telemetryFromPassResult(pass, billable), ...(pass.research ? { research: pass.research } : {}) };
}

export function failureSettlement(
  error: unknown,
  telemetry: PassTelemetry,
  details: { kind?: string; retryable?: boolean; providerFailure?: import("@/ai/providerFailure").ProviderFailure } = {},
): PassSettlement<never> {
  return {
    outcome: "failure",
    failure: serializePassFailure(error, details),
    telemetry,
  };
}

/** The kind and retryability a pass error carries (PassRunError), for its fallback settlement. */
export function passErrorDetails(error: unknown): { kind?: string; retryable?: boolean; providerFailure?: import("@/ai/providerFailure").ProviderFailure } {
  if (error === null || typeof error !== "object") return {};
  const { kind, retryable, providerFailure } = error as { kind?: unknown; retryable?: unknown; providerFailure?: unknown };
  const diagnostic = ProviderFailureSchema.safeParse(providerFailure);
  return {
    ...(typeof kind === "string" ? { kind } : {}),
    ...(typeof retryable === "boolean" ? { retryable } : {}),
    ...(diagnostic.success ? { providerFailure: diagnostic.data } : {}),
  };
}

/** `total`: the step's cost, attempt count and presumed part when the step holds more than this attempt. */
function settlementStepDetail<T>(
  settlement: PassSettlement<T>,
  total?: { costUsd: number; attempts: number; presumedUsd: number },
): string {
  if (settlement.outcome === "failure") return settlement.failure.message;
  return passDetail({
    data: settlement.data,
    model: settlement.telemetry.model,
    costUsd: total?.costUsd ?? settlement.telemetry.costUsd,
    fallbackUsed: settlement.telemetry.fallbackUsed,
    usage: {
      input_tokens: settlement.telemetry.inputTokens,
      output_tokens: settlement.telemetry.outputTokens,
      cache_read_input_tokens: settlement.telemetry.cacheReadTokens,
      cache_creation_input_tokens: settlement.telemetry.cacheWriteTokens,
    },
    webSearches: settlement.telemetry.webSearches,
    fetchedUrls: settlement.telemetry.fetchedUrls,
  }, total?.attempts, total?.presumedUsd);
}

/** Adopt the one exact-current settlement snapshot after its outer transaction commits. */
function adoptCommittedSettlement<T>(
  state: RunState,
  pass: DurablePass,
  settlement: PassSettlement<T>,
  persisted: SettlePaidPassResult,
): boolean {
  if (!persisted.currentGeneration) return false;
  if (
    persisted.currentRevision === null ||
    persisted.currentTotalCostUsd === null
  ) {
    if (!persisted.inserted) return true;
    throw new Error("jobRunner: exact-current settlement omitted its canonical snapshot");
  }
  state.revision = persisted.currentRevision;
  state.claim.revision = persisted.currentRevision;
  state.totalCostUsd = persisted.currentTotalCostUsd;
  if (persisted.inserted && settlement.telemetry.billable) {
    publish(state, {
      type: "cost-update",
      jobId: state.jobId,
      step: pass,
      passCostUsd: settlement.telemetry.costUsd,
      totalCostUsd: state.totalCostUsd,
    });
  }
  if (persisted.projectionError !== null) {
    throw new PassSettlementHookError(
      `pass settlement projection failed after immutable commit: ${persisted.projectionError}`,
    );
  }
  if (persisted.currentSteps === null) {
    if (!persisted.inserted) return true;
    throw new Error("jobRunner: exact-current settlement omitted its canonical steps");
  }
  state.steps = persisted.currentSteps;
  if (persisted.inserted) emitStep(state, pass);
  return true;
}

export interface SettlementCheckpoint<T> {
  attemptId: string;
  /** Per-request cost admission for every provider request this pass makes. */
  admission: RequestAdmission;
  beforeLaunch(): Promise<void>;
  authorizeLaunch(startStepAtBoundary: boolean): void;
  wasLaunched(): boolean;
  releaseIfPrelaunch(): void;
  stopRenewal(): void;
  hasLease(): boolean;
  hook: PassSettlementHook<T>;
  wasCalled(): boolean;
  lastSettlement(): PassSettlement<T> | null;
}

export function throwFirstSettlementRejection(outcomes: PromiseSettledResult<unknown>[]): void {
  const rejected = outcomes.find(
    (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected",
  );
  if (rejected) throw rejected.reason;
}

export function createSettlementCheckpoint<T>(
  state: RunState,
  pass: DurablePass,
  payloadFingerprint: string | null,
  maximumNextPassUsd: number,
  signal: AbortSignal,
  controller: AbortController,
  /** Model the reservation was priced for; recorded on the durable lease. */
  reservationModel = "",
  /**
   * The step note for a failed settlement, or null for the failure's own
   * message. `repairQueued`: the run will still repair it, so the step stays
   * running under the note instead of reading ERROR until the repair starts.
   */
  failureNote?: (failure: SerializedPassFailure) => { detail: string; repairQueued: boolean } | null,
): SettlementCheckpoint<T> {
  const attemptId = randomUUID();
  let called = false;
  let committed = false;
  let launched = false;
  let last: PassSettlement<T> | null = null;
  let lease: PaidPassLease | null = null;
  let renewal: ReturnType<typeof setInterval> | undefined;
  let permitBackoffMs = 250;
  // Live per-request leases, keyed by the permit id the provider carries
  // (DECISIONS D-10). In "pass" reservation mode this map stays empty.
  const requestLeases = new Map<string, PaidPassLease>();
  let requestSequence = 0;

  const stopRenewal = (): void => {
    if (renewal !== undefined) clearInterval(renewal);
    renewal = undefined;
  };
  const beforeLaunch = async (): Promise<void> => {
    if (lease !== null) return;
    while (lease === null) {
      signal.throwIfAborted();
      const acquired = acquirePaidPassLease(
        state.claim,
        pass,
        attemptId,
        maximumNextPassUsd,
        undefined,
        state.schedulerLimits,
        undefined,
        reservationModel,
      );
      if (acquired.acquired) {
        lease = acquired.lease;
        const beatMs = Math.max(1, Math.floor(state.schedulerLimits.paidPassLeaseTtlMs / 4));
        renewal = setInterval(() => {
          const beatStartedMs = Date.now();
          try {
            if (lease !== null && !renewPaidPassLease(lease, undefined, state.schedulerLimits)) {
              stopRenewal();
              controller.abort(new Error(`paid ${pass} lease renewal lost authority`));
              return;
            }
            // A request in flight holds its own lease; renew it on the same
            // beat so a long generation cannot expire into presumed spend
            // while it is still being read.
            for (const [, requestLease] of requestLeases) {
              if (!renewPaidPassLease(requestLease, undefined, state.schedulerLimits)) {
                // KEEP the identity in the map. Renewal loses authority
                // exactly when the lease has already expired into a presumed
                // row at its full reserved maximum — and the provider may
                // still return real usage for this very request moments
                // later. Dropping the entry made `settle` return early, so
                // the measurement was thrown away and the presumption stood
                // (on Opus 5, a permanent ~$9.53 row where the truth might be
                // $0.40). settleRequestCost is written for exactly this case:
                // it supersedes the presumed row with the measured one and
                // tolerates a lease row that is already gone.
                stopRenewal();
                controller.abort(new Error(`paid ${pass} request lease renewal lost authority`));
                return;
              }
            }
            const expiresAt = new Date(beatStartedMs + state.schedulerLimits.paidPassLeaseTtlMs).toISOString();
            if (lease !== null) lease.leaseExpiresAt = expiresAt;
            for (const requestLease of requestLeases.values()) requestLease.leaseExpiresAt = expiresAt;
          } catch (error) {
            const knownLeaseExpiresAtMs = Math.min(
              Date.parse(lease!.leaseExpiresAt),
              ...Array.from(requestLeases.values(), row => Date.parse(row.leaseExpiresAt)),
            );
            if (renewalFailureTolerable({ error, knownLeaseExpiresAtMs,
              nowMs: Date.now(), beatMs, busyTimeoutMs: connectionBusyTimeoutMs() })) return;
            stopRenewal();
            controller.abort(error);
          }
        }, beatMs);
        renewal.unref?.();
        return;
      }
      if (
        acquired.reason !== "capacity" &&
        acquired.reason !== "job-budget-pending" &&
        acquired.reason !== "rolling-budget-pending"
      ) {
        const error = new Error(`paid ${pass} pass blocked by ${acquired.reason}`);
        if (acquired.reason === "revision-headroom" && !controller.signal.aborted) {
          // Near revision exhaustion, degradation cannot safely spend several
          // intermediate revisions. Abort into the runner's one-write terminal
          // path while the reserved terminal slot still exists.
          controller.abort(error);
        }
        throw error;
      }
      await new Promise<void>((resolve, reject) => {
        const cleanup = (): void => signal.removeEventListener("abort", onAbort);
        const timer = setTimeout(() => {
          cleanup();
          resolve();
        }, permitBackoffMs);
        const onAbort = (): void => {
          clearTimeout(timer);
          cleanup();
          reject(signal.reason ?? new DOMException("aborted", "AbortError"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        timer.unref?.();
      });
      permitBackoffMs = Math.min(1_000, permitBackoffMs * 2);
    }
  };
  /**
   * Admit one provider request against the durable spend caps, waiting out
   * transient capacity/pending refusals exactly as the pass gate does. A
   * refusal that is not transient (a cap that is genuinely full) is thrown, and
   * the provider turns it into a stop at the request boundary.
   */
  const reserveRequest = async (maximumUsd: number): Promise<RequestPermit> => {
    let backoffMs = 250;
    for (;;) {
      signal.throwIfAborted();
      const sequence = requestSequence + 1;
      // The pass lease's one-request headroom exists only until a real request
      // reserves for itself. Release it BEFORE that request asks for
      // admission, not after: while both are live the pass's own lease
      // occupies a paid slot (and job/rolling headroom) that its own first
      // request then has to fit beside. At METIS_MAX_ACTIVE_LLM_CALLS=1 that
      // refused every first request with "capacity" — a transient reason, so
      // the loop below retried forever and no provider request was ever sent —
      // and at the default of 2 it serialised bull and bear, which costs bear
      // a full cache write instead of the read runBullThenBear starts it early
      // to get. Nothing is at risk in the window: no request has been sent, so
      // there is nothing yet to bill.
      if (sequence === 1 && lease !== null && lease.reservedCostUsd > 0) {
        const resized = resizePaidPassLease(lease, 0, undefined, undefined);
        if (resized !== null) lease = resized;
      }
      const acquired = acquirePaidPassLease(
        state.claim,
        pass,
        requestAttemptId(attemptId, sequence),
        maximumUsd,
        undefined,
        state.schedulerLimits,
        undefined,
        reservationModel,
      );
      if (acquired.acquired) {
        requestSequence = sequence;
        requestLeases.set(acquired.lease.permitId, acquired.lease);
        return { id: acquired.lease.permitId, maximumUsd: acquired.lease.reservedCostUsd };
      }
      if (
        acquired.reason !== "capacity" &&
        acquired.reason !== "job-budget-pending" &&
        acquired.reason !== "rolling-budget-pending"
      ) {
        throw new Error(`paid ${pass} request blocked by ${acquired.reason}`);
      }
      await new Promise<void>((resolve, reject) => {
        const cleanup = (): void => signal.removeEventListener("abort", onAbort);
        const timer = setTimeout(() => {
          cleanup();
          resolve();
        }, backoffMs);
        const onAbort = (): void => {
          clearTimeout(timer);
          cleanup();
          reject(signal.reason ?? new DOMException("aborted", "AbortError"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        timer.unref?.();
      });
      backoffMs = Math.min(1_000, backoffMs * 2);
    }
  };

  // The identity leaves the map only once the durable write has COMMITTED. A
  // write that throws (a writer-lock timeout past busy_timeout, say) leaves
  // the entry in place, so renewal keeps the row alive and the provider's
  // second settle — or a later one for the same attempt — can still record
  // the measured figure. Dropping it first made that retry a silent no-op,
  // after which the row expired into a presumed-maximum row that only the
  // reconcile script could lower. An over-reservation write DOES commit
  // (`inserted: true`) before it throws, so that one is removed and rethrown.
  // A settle write refused by another process's writer lock is mapped to the
  // provider's error class (requestSettlementWriteError), so the provider
  // retries the write and, failing that, keeps the response (D-118).
  const admission: RequestAdmission = {
    reserve: async ({ maximumUsd }) => reserveRequest(maximumUsd),
    settle: async (permit, settled) => {
      const requestLease = requestLeases.get(permit.id);
      if (requestLease === undefined) return;
      try {
        settleRequestCost(requestLease, {
          model: settled.model,
          inputTokens: settled.usage?.input_tokens ?? 0,
          outputTokens: settled.usage?.output_tokens ?? 0,
          cacheReadTokens: settled.usage?.cache_read_input_tokens ?? 0,
          cacheWriteTokens: settled.usage?.cache_creation_input_tokens ?? 0,
          webSearches: settled.webSearches,
          costUsd: settled.costUsd,
          fallbackUsed: settled.fallbackUsed,
          ...(settled.presumed === true ? { presumed: true } : {}),
        });
      } catch (error) {
        if (error instanceof PaidPassOverReservationError && error.result.inserted) {
          requestLeases.delete(permit.id);
        }
        throw requestSettlementWriteError(error);
      }
      requestLeases.delete(permit.id);
    },
    release: async (permit) => {
      const requestLease = requestLeases.get(permit.id);
      if (requestLease === undefined) return;
      releaseUnbilledPaidPassLease(requestLease);
      requestLeases.delete(permit.id);
    },
    // The settlement write gave up (D-118): the lease stays held at its
    // reserved maximum but is no longer renewed, so it expires into the
    // sweep's presumed row (the cap stays honoured) and frees its capacity
    // slot instead of blocking the pass's next request to the stage deadline.
    abandon: (permit) => {
      requestLeases.delete(permit.id);
    },
  };

  const authorizeLaunch = (startStepAtBoundary: boolean): void => {
    signal.throwIfAborted();
    if (lease === null) {
      throw new Error(`paid ${pass} launch authority checked before its durable lease was acquired`);
    }
    const priorSteps = structuredClone(state.steps);
    const authorityNow = new Date();
    if (startStepAtBoundary) {
      const step = findStep(state, pass);
      step.status = "running";
      step.startedAt = authorityNow.toISOString();
      delete step.completedAt;
      delete step.finishedAt;
      delete step.detail;
    }
    let authority: ReturnType<typeof authorizePaidPassLaunch>;
    try {
      authority = authorizePaidPassLaunch(
        lease,
        state.revision,
        JSON.stringify(state.steps),
        undefined,
        state.schedulerLimits,
      );
    } catch (error) {
      // The running transition above is only a candidate snapshot until the
      // exact job + paid-lease fence commits. A database/configuration failure
      // must not leave unpersisted local state that a later degradation path
      // could accidentally publish.
      state.steps = priorSteps;
      if (!controller.signal.aborted) controller.abort(error);
      throw error;
    }
    if (authority === null) {
      state.steps = priorSteps;
      const error = new SupersededRunError(state.jobId, state.runGeneration);
      if (!controller.signal.aborted) controller.abort(error);
      throw error;
    }
    state.revision = authority.revision;
    state.claim.revision = authority.revision;
    state.claim.heartbeatAt = authority.heartbeatAt;
    state.claim.leaseExpiresAt = authority.jobLeaseExpiresAt;
    lease = { ...lease, leaseExpiresAt: authority.paidLeaseExpiresAt };
    launched = true;
    if (startStepAtBoundary) emitStep(state, pass);
  };
  const hook: PassSettlementHook<T> = async (settlement) => {
    if (called) {
      if (committed && JSON.stringify(last) === JSON.stringify(settlement)) return;
      const duplicate = new PassSettlementHookError(
        "conflicting duplicate pass settlement callback",
      );
      if (!controller.signal.aborted) controller.abort(duplicate);
      throw duplicate;
    }
    called = true;
    last = settlement;
    try {
      if (lease === null) {
        throw new Error(`paid ${pass} settlement occurred before its durable lease was acquired`);
      }
      stopRenewal();
      // When this pass admitted its own requests, each already wrote a cost
      // row, so the artifact records the same figures WITHOUT billing them a
      // second time. A pass that settled without reaching the provider (an
      // injected adapter, or a durable replay) still bills here: suppression
      // follows the rows that exist, never the mode alone.
      const settlementForPass: PassSettlement<T> =
        requestSequence > 0 && settlement.telemetry.billable
          ? { ...settlement, telemetry: { ...settlement.telemetry, billable: false } }
          : settlement;
      const note = settlement.outcome === "failure" ? failureNote?.(settlement.failure) ?? null : null;
      const persisted = settlePaidPassLease(lease, {
        settlement: settlementForPass,
        payloadFingerprint,
        step: note?.repairQueued === true
          ? { detail: note.detail, repairQueued: true }
          : {
            finishedAt: findStep(state, pass).finishedAt ?? nowIso(),
            detail: note?.detail ?? settlementStepDetail(settlement),
            ...(note === null
              ? { detailAcrossAttempts: (costUsd: number, attempts: number, presumedUsd: number) => settlementStepDetail(settlement, { costUsd, attempts, presumedUsd }) }
              : {}),
          },
      });
      // Once settlePaidPassLease returns inserted truth, a later projection
      // error must remain an idempotent committed callback, never a rebill.
      committed = persisted.inserted;
      adoptCommittedSettlement(state, pass, settlement, persisted);
      committed = true;
    } catch (caught) {
      let error = caught;
      if (caught instanceof PaidPassOverReservationError) {
        committed = caught.result.inserted;
        try {
          adoptCommittedSettlement(state, pass, settlement, caught.result);
          committed = true;
        } catch (projectionError) {
          error = projectionError;
        }
      }
      const wrapped = error instanceof PassSettlementHookError
        ? error
        : new PassSettlementHookError(
        `pass settlement persistence failed: ${errMessage(error)}`,
        { cause: error },
      );
      // Settlement persistence is execution authority, not telemetry. Stop a
      // sibling still waiting at its permit gate so it cannot launch after the
      // exact launched result was lost.
      if (!controller.signal.aborted) controller.abort(wrapped);
      throw wrapped;
    }
  };
  return {
    attemptId,
    admission,
    beforeLaunch,
    authorizeLaunch,
    wasLaunched: () => launched,
    releaseIfPrelaunch: () => {
      if (lease !== null && !launched && !called) {
        stopRenewal();
        for (const [permitId, requestLease] of requestLeases) {
          releaseUnbilledPaidPassLease(requestLease);
          requestLeases.delete(permitId);
        }
        releaseUnbilledPaidPassLease(lease);
        lease = null;
      }
    },
    stopRenewal,
    hasLease: () => lease !== null,
    hook,
    wasCalled: () => called,
    lastSettlement: () => last,
  };
}

export function billedAttemptFromError(err: unknown): BilledPassAttempt | null {
  if (err === null || typeof err !== "object" || !("billedAttempt" in err)) return null;
  const attempt = (err as { billedAttempt?: unknown }).billedAttempt;
  if (attempt === null || typeof attempt !== "object") return null;
  const candidate = attempt as Partial<BilledPassAttempt>;
  return typeof candidate.model === "string" &&
    typeof candidate.costUsd === "number" &&
    Number.isFinite(candidate.costUsd) &&
    typeof candidate.fallbackUsed === "boolean"
    ? {
        model: candidate.model,
        costUsd: candidate.costUsd,
        fallbackUsed: candidate.fallbackUsed,
        usage: candidate.usage,
        webSearches: candidate.webSearches,
        ...(candidate.presumed === undefined ? {} : { presumed: candidate.presumed }),
        ...(candidate.execution === undefined ? {} : { execution: candidate.execution }),
      }
    : null;
}

export function bullBearFailureFromError(err: unknown): BullBearPassFailureDetails | null {
  if (err === null || typeof err !== "object") return null;
  const candidate = err as Partial<BullBearPassFailureDetails>;
  const hasBull =
    candidate.bull !== undefined ||
    candidate.bullError !== undefined ||
    candidate.bullBilledAttempt !== undefined ||
    candidate.bullLaunched !== undefined;
  const hasBear =
    candidate.bear !== undefined ||
    candidate.bearError !== undefined ||
    candidate.bearBilledAttempt !== undefined ||
    candidate.bearLaunched !== undefined;
  if (!hasBull && !hasBear) return null;
  return candidate;
}

/* ------------------------------------------------------------------------ *
 * Small utilities
 * ------------------------------------------------------------------------ */

export function passDetail(pass: PassResultLike<unknown>, attempts = 1, presumedUsd = 0): string {
  const parts = [
    `model ${pass.model}`,
    `$${pass.costUsd.toFixed(4)}${attempts > 1 ? ` over ${attempts} attempts` : ""}${
      presumedUsd > 0 ? ` (incl. $${presumedUsd.toFixed(4)} presumed until reconciled)` : ""}`,
  ];
  if (pass.fallbackUsed) parts.push("fallback served");
  return parts.join(", ");
}
