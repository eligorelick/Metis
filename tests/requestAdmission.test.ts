/**
 * Per-request cost admission (DECISIONS D-10).
 *
 * Before this, one reservation per pass had to cover every request the pass
 * could make — 108 of them — so a job cap anywhere near real spend rejected
 * every job before it started. Now each provider request is admitted and
 * settled on its own, and a cap can be set at a useful size.
 *
 * Offline throughout: the provider is a fake stream, and admission is the real
 * scheduler running against a temporary SQLite file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { APIError } from "@anthropic-ai/sdk";
import type { BetaMessage, BetaUsage } from "@anthropic-ai/sdk/resources/beta/messages/messages";

import { resetConfigCache } from "@/config/env";
import { createDatabase, setDbForTests, type DatabaseHandle, type ThesisDb } from "@/db";
import { costLog, jobLlmLeases, jobs } from "@/db/schema";
import { createJob, getOrCreateJobForSymbol, initialSteps, requestSettlementWriteError } from "@/pipeline/jobRunner";
import {
  acquirePaidPassLease,
  claimNextQueuedJob,
  configuredSchedulerLimits,
  effectiveJobCapUsd,
  isTransientWriterLock,
  reconcileExpiredJobClaims,
  releaseUnbilledPaidPassLease,
  requestAttemptId,
  resizePaidPassLease,
  settlePaidPassLease,
  settleRequestCost,
  type ClaimedJob,
  type PaidPassLease,
  type SchedulerLimits,
} from "@/pipeline/jobScheduler";
import { readGenerationResumeArtifacts } from "@/pipeline/jobArtifacts";
import { readStoredJobResumeInTransaction } from "@/pipeline/jobStore";
import type { AnalystCase } from "@/report/schema";
import {
  JUDGE_ORDER_SETTINGS,
  JUDGE_PASSES_PER_SETTING,
} from "@/pipeline/stageC/judgeProtocol";
import {
  MAX_PROVIDER_WEB_SEARCHES,
  PASS_MAX_REQUESTS,
  PASS_TRANSPORT_MAX_ATTEMPTS,
  RequestSettlementNotRecordedError,
  _resetAnthropicForTests,
  computeCostUsd,
  isPreSendConnectionFailure,
  maximumPassCostUsd,
  maximumRequestCostUsd,
  passWorstCaseCostUsd,
  runPass,
  runPassStreaming,
  webSearchTool,
  type RequestAdmission,
  type RequestPermit,
} from "@/providers/anthropic";

const NOW = new Date("2026-08-08T12:00:00.000Z");

const LIMITS: SchedulerLimits = {
  maxActiveJobs: 1,
  maxActiveLlmCalls: 2,
  maxRollingCostUsd: null,
  rollingCostWindowMs: 60 * 60 * 1000,
  paidPassLeaseTtlMs: 15 * 60 * 1000,
  jobLeaseTtlMs: 15 * 60 * 1000,
};

let directory: string;
let first: DatabaseHandle;
let second: DatabaseHandle;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "thesis-request-admission-"));
  const file = join(directory, "scheduler.db");
  first = createDatabase(file);
  second = createDatabase(file);
  setDbForTests(first.db);
});

afterEach(() => {
  vi.useRealTimers();
  _resetAnthropicForTests();
  setDbForTests(null);
  first.sqlite.close();
  second.sqlite.close();
  rmSync(directory, { recursive: true, force: true });
});

function seedJob(db: ThesisDb, id: string, symbol: string, maxCostUsd: number | null = null): void {
  const now = NOW.toISOString();
  db.insert(jobs).values({
    id,
    symbol,
    status: "queued",
    stepsJson: JSON.stringify(initialSteps()),
    createdAt: now,
    updatedAt: now,
    queuedAt: now,
    maxCostUsd,
  }).run();
}

function analystCase(): AnalystCase {
  return {
    thesis: [{ text: "t", label: "JUDGMENT", source: "payload", asOf: null }],
    keyDrivers: [],
    risksToCase: [],
    catalysts: [],
    priceTarget: { value: 250, horizon: "12mo", assumptions: [] },
    evidence: [],
  };
}

function usage(over: Partial<BetaUsage> = {}): BetaUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation: null,
    inference_geo: null,
    iterations: null,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: null,
    speed: null,
    ...over,
  } as BetaUsage;
}

function message(over: Record<string, unknown> = {}): BetaMessage {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    content: [{ type: "text", text: '{"ok":true}', citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: usage(),
    ...over,
  } as unknown as BetaMessage;
}

/** A stream that emits its events then resolves or fails. */
function fakeStream(script: { events?: unknown[]; final?: BetaMessage; failWith?: unknown }) {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const add = (name: string, fn: (...args: unknown[]) => void): void => {
    listeners.set(name, [...(listeners.get(name) ?? []), fn]);
  };
  let settle!: { resolve: (m: BetaMessage) => void; reject: (e: unknown) => void };
  const finalPromise = new Promise<BetaMessage>((resolve, reject) => {
    settle = { resolve, reject };
  });
  finalPromise.catch(() => {});
  queueMicrotask(() => {
    for (const event of script.events ?? []) {
      for (const fn of listeners.get("streamEvent") ?? []) fn(event);
    }
    if (script.failWith !== undefined) settle.reject(script.failWith);
    else if (script.final !== undefined) settle.resolve(script.final);
  });
  return {
    on: add,
    once: add,
    finalMessage: () => finalPromise,
    abort: () => {},
  };
}

function fakeClient(scripts: Array<{ events?: unknown[]; final?: BetaMessage; failWith?: unknown }>): Anthropic {
  let i = 0;
  return {
    beta: {
      messages: {
        stream: () => fakeStream(scripts[Math.min(i++, scripts.length - 1)]!),
        create: async () => message(),
      },
    },
  } as unknown as Anthropic;
}

function midStreamOverload(): APIError {
  return new APIError(
    undefined,
    { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } as never,
    undefined,
    undefined,
    "overloaded_error",
  );
}

/** The real scheduler as the provider's admission, for one pass attempt. */
function schedulerAdmission(
  claim: ClaimedJob,
  pass: "bull" | "synthesize",
  passAttemptId: string,
  db: ThesisDb,
): { admission: RequestAdmission; reserved: number[]; leases: Map<string, PaidPassLease> } {
  const leases = new Map<string, PaidPassLease>();
  const reserved: number[] = [];
  let sequence = 0;
  return {
    reserved,
    leases,
    admission: {
      reserve: async ({ maximumUsd }) => {
        sequence += 1;
        const acquired = acquirePaidPassLease(
          claim, pass, requestAttemptId(passAttemptId, sequence), maximumUsd,
          NOW, LIMITS, db, "claude-sonnet-5",
        );
        if (!acquired.acquired) throw new Error(`paid ${pass} request blocked by ${acquired.reason}`);
        leases.set(acquired.lease.permitId, acquired.lease);
        reserved.push(acquired.lease.reservedCostUsd);
        return { id: acquired.lease.permitId, maximumUsd: acquired.lease.reservedCostUsd };
      },
      settle: async (permit: RequestPermit, settled) => {
        const lease = leases.get(permit.id);
        if (lease === undefined) return;
        leases.delete(permit.id);
        settleRequestCost(lease, {
          model: settled.model,
          inputTokens: settled.usage?.input_tokens ?? 0,
          outputTokens: settled.usage?.output_tokens ?? 0,
          cacheReadTokens: settled.usage?.cache_read_input_tokens ?? 0,
          cacheWriteTokens: settled.usage?.cache_creation_input_tokens ?? 0,
          webSearches: settled.webSearches,
          costUsd: settled.costUsd,
          fallbackUsed: settled.fallbackUsed,
          ...(settled.presumed === true ? { presumed: true } : {}),
        }, NOW, db);
      },
      release: async (permit: RequestPermit) => {
        const lease = leases.get(permit.id);
        if (lease === undefined) return;
        leases.delete(permit.id);
        releaseUnbilledPaidPassLease(lease, db, NOW);
      },
    },
  };
}

const passOpts = {
  model: "claude-sonnet-5",
  system: "system",
  messages: [{ role: "user" as const, content: "hi" }],
  maxTokens: 8_000,
  field: "llm.bull",
  reservationPass: "bull" as const,
};

describe("pause resumption admission", () => {
  it("returns billed usage when the job budget refuses the next paused-turn request", async () => {
    // One Sonnet request reserves $26.36. Its $0.012 measured charge leaves
    // less than another request maximum beneath this cap.
    seedJob(first.db, "job-pause-budget", "AAPL", 26.365);
    const claim = claimNextQueuedJob("owner", NOW, LIMITS, first.db)!;
    const { admission } = schedulerAdmission(claim, "bull", "pause-budget", first.db);
    const paused = message({
      stop_reason: "pause_turn",
      usage: usage({ input_tokens: 1_000, output_tokens: 1_000 }),
    });
    _resetAnthropicForTests(fakeClient([{ events: [{ type: "message_start", message: paused }], final: paused }]));

    await expect(runPass({ ...passOpts, admission })).resolves.toMatchObject({
      ok: false,
      error: {
        kind: "transport",
        costUsd: 0.012,
        usage: { input_tokens: 1_000, output_tokens: 1_000 },
      },
    });
    const ledger = first.db.select().from(costLog).where(eq(costLog.jobId, claim.jobId)).all();
    expect(ledger).toEqual([expect.objectContaining({ costUsd: 0.012, settlementKind: "actual" })]);
    expect(first.db.select().from(jobLlmLeases).all()).toEqual([]);
  });
});

describe("what one request may cost", () => {
  it("bounds a request by context at the cache-write price, the output ceiling and the search cap", () => {
    // Sonnet 5: up to 10 sampling iterations of 1M input at $2.50/MTok,
    // one 128K output ceiling at $10/MTok, and 8 searches at $0.01.
    expect(maximumRequestCostUsd("claude-sonnet-5", "bull")).toBeCloseTo(25 + 1.28 + 0.08, 6);
    // The judge never searches.
    expect(maximumRequestCostUsd("claude-sonnet-5", "synthesize")).toBeCloseTo(2.5 + 1.28, 6);
    // Haiku's judge runs on the Sonnet floor, so it is bounded there.
    expect(maximumRequestCostUsd("claude-haiku-4-5", "synthesize"))
      .toBe(maximumRequestCostUsd("claude-sonnet-5", "synthesize"));
    expect(maximumRequestCostUsd("claude-haiku-4-5", "bull"))
      .toBeCloseTo(2.5 + 0.32 + 0.08, 6);
    expect(MAX_PROVIDER_WEB_SEARCHES).toBe(8);
  });

  it("reports the pass worst case without reserving it", () => {
    const perRequest = maximumRequestCostUsd("claude-sonnet-5", "bull");
    expect(passWorstCaseCostUsd("claude-sonnet-5", "bull")).toBeCloseTo(perRequest * PASS_MAX_REQUESTS, 5);
    expect(PASS_MAX_REQUESTS).toBe(36);
  });

  it("sizes the JUDGE worst case and pass bound for the orders the setting runs", () => {
    // WS7 (D-20), 2026-09 review: `THESIS_JUDGE_ORDER=both` issues a MIRRORED
    // second judge request per attempt. The published worst case and the
    // "pass"-mode reservation were both sized for one order, so the figure
    // understated the real exposure by two times and, in pass mode (which has
    // no per-request admission at all), two requests shared one reservation
    // sized for one.
    const perRequest = maximumRequestCostUsd("claude-sonnet-5", "synthesize");
    const oneOrder = passWorstCaseCostUsd("claude-sonnet-5", "synthesize");
    expect(oneOrder).toBeCloseTo(perRequest * PASS_MAX_REQUESTS, 5);
    expect(
      passWorstCaseCostUsd("claude-sonnet-5", "synthesize", undefined, JUDGE_PASSES_PER_SETTING.both),
    ).toBeCloseTo(oneOrder * 2, 5);
    expect(
      maximumPassCostUsd("claude-sonnet-5", "synthesize", undefined, JUDGE_PASSES_PER_SETTING.both),
    ).toBeCloseTo(maximumPassCostUsd("claude-sonnet-5", "synthesize") * 2, 5);

    // Only the judge multiplies, and only when the setting says two orders.
    for (const setting of JUDGE_ORDER_SETTINGS.filter((value) => value !== "both")) {
      expect(
        passWorstCaseCostUsd("claude-sonnet-5", "synthesize", undefined, JUDGE_PASSES_PER_SETTING[setting]),
      ).toBeCloseTo(oneOrder, 5);
    }
    for (const pass of ["bull", "bear"] as const) {
      expect(
        passWorstCaseCostUsd("claude-sonnet-5", pass, undefined, JUDGE_PASSES_PER_SETTING.both),
      ).toBeCloseTo(passWorstCaseCostUsd("claude-sonnet-5", pass), 5);
      expect(
        maximumPassCostUsd("claude-sonnet-5", pass, undefined, JUDGE_PASSES_PER_SETTING.both),
      ).toBeCloseTo(maximumPassCostUsd("claude-sonnet-5", pass), 5);
    }
  });

  it("refuses a verify bound without explicit capability metadata", () => {
    expect(() => maximumRequestCostUsd("claude-sonnet-5", "verify")).toThrow(/capability|billable/i);
    expect(maximumRequestCostUsd("claude-sonnet-5", "verify", { billable: false })).toBe(0);
  });

  it("reserves repeated inputs only when verify permits server search", () => {
    const capability = { billable: true as const, maxInputTokens: 1_000, maxOutputTokens: 100, maxWebSearches: 0 };
    expect(maximumRequestCostUsd("claude-sonnet-5", "verify", capability)).toBeCloseTo(0.0035, 10);
    expect(maximumRequestCostUsd("claude-sonnet-5", "verify", { ...capability, maxWebSearches: 1 })).toBeCloseTo(0.036, 10);
  });
});

describe("a paid pass settled in request mode is still resumable", () => {
  it("pairs a `#rN` request cost row with its pass artifact instead of calling it an orphan", () => {
    seedJob(first.db, "job-resume", "AAPL");
    const claim = claimNextQueuedJob("owner", NOW, LIMITS, first.db)!;
    const attemptId = "pass-attempt";

    // The exact shape request mode leaves behind: a pass lease taken for one
    // request maximum, one request settled under `<attempt>#r1`, and the pass
    // artifact written under the bare attempt id with billable false (the
    // request already billed it).
    const passLease = acquirePaidPassLease(
      claim, "bull", attemptId, maximumRequestCostUsd("claude-sonnet-5", "bull"),
      NOW, LIMITS, first.db, "claude-sonnet-5",
    );
    if (!passLease.acquired) throw new Error("fixture pass lease failed");
    const requestLease = acquirePaidPassLease(
      claim, "bull", requestAttemptId(attemptId, 1),
      maximumRequestCostUsd("claude-sonnet-5", "bull"), NOW, LIMITS, first.db, "claude-sonnet-5",
    );
    if (!requestLease.acquired) throw new Error("fixture request lease failed");
    settleRequestCost(requestLease.lease, {
      model: "claude-sonnet-5",
      inputTokens: 40_000,
      outputTokens: 6_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 12_000,
      webSearches: 2,
      costUsd: 0.21,
      fallbackUsed: false,
    }, NOW, first.db);
    const settled = settlePaidPassLease(passLease.lease, {
      settlement: {
        outcome: "success",
        data: analystCase(),
        telemetry: {
          model: "claude-sonnet-5",
          inputTokens: 40_000,
          outputTokens: 6_000,
          cacheReadTokens: 0,
          cacheWriteTokens: 12_000,
          webSearches: 2,
          costUsd: 0.21,
          fallbackUsed: false,
          billable: false,
          fetchedUrls: [],
        },
      },
      payloadFingerprint: "1.3.0:request-mode",
    }, first.db, NOW);
    expect(settled.inserted).toBe(true);

    // One request row, no pass row: exactly what the reader used to reject.
    const rows = first.db.select().from(costLog).where(eq(costLog.jobId, "job-resume")).all();
    expect(rows.map((row) => row.attemptId)).toEqual([requestAttemptId(attemptId, 1)]);

    const read = readGenerationResumeArtifacts(first.db, "job-resume", 0);
    expect(read.corruptPasses).toEqual([]);
    expect(read.artifacts).toHaveLength(1);

    first.db.update(jobs)
      .set({ status: "error", error: "killed mid-run" })
      .where(eq(jobs.id, "job-resume"))
      .run();
    const resume = readStoredJobResumeInTransaction(first.db, "job-resume")!;
    expect(resume.plan.state.resumable).toBe(true);
    expect(resume.plan.state.reusablePasses).toContain("bull");
    expect(resume.plan.bull?.data).toEqual(analystCase());
  });

  it("still rejects a cost row that belongs to no artifact at all", () => {
    seedJob(first.db, "job-orphan", "AAPL");
    const claim = claimNextQueuedJob("owner", NOW, LIMITS, first.db)!;
    const stray = acquirePaidPassLease(
      claim, "bull", requestAttemptId("some-other-attempt", 1), 1, NOW, LIMITS, first.db, "claude-sonnet-5",
    );
    if (!stray.acquired) throw new Error("fixture lease failed");
    settleRequestCost(stray.lease, {
      model: "claude-sonnet-5",
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      webSearches: 0,
      costUsd: 0.5,
      fallbackUsed: false,
    }, NOW, first.db);

    const read = readGenerationResumeArtifacts(first.db, "job-orphan", 0);
    expect(read.corruptPasses).toEqual(["bull"]);
    expect(read.corruptionReasons.bull).toMatch(/cost row exists without its artifact/);
  });
});

describe("every provider request is admitted and settled on its own", () => {
  it("reserves once per attempt and records one cost row per request", async () => {
    seedJob(first.db, "job-a", "AAPL");
    const claim = claimNextQueuedJob("owner", NOW, LIMITS, first.db)!;
    const { admission, reserved } = schedulerAdmission(claim, "bull", "pass-attempt", first.db);
    _resetAnthropicForTests(fakeClient([
      { events: [{ type: "message_start", message: message({ usage: usage({ input_tokens: 1_000 }) }) }], failWith: midStreamOverload() },
      { events: [{ type: "message_start", message: message() }], final: message({ usage: usage({ input_tokens: 2_000, output_tokens: 500 }) }) },
    ]));
    const { _setTransportRetrySleepForTests } = await import("@/providers/anthropic");
    _setTransportRetrySleepForTests(async () => {});

    const result = await runPass({ ...passOpts, admission });

    expect(result.ok).toBe(true);
    // Two requests: the failed attempt and the retry, each with its own
    // reservation at the per-request maximum.
    expect(reserved).toEqual([
      maximumRequestCostUsd("claude-sonnet-5", "bull"),
      maximumRequestCostUsd("claude-sonnet-5", "bull"),
    ]);
    const rows = first.db.select().from(costLog).where(eq(costLog.jobId, "job-a")).all();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.attemptId)).toEqual([
      requestAttemptId("pass-attempt", 1),
      requestAttemptId("pass-attempt", 2),
    ]);
    // The failed attempt died after message_start without its final usage event: presumed.
    expect(rows.map((row) => row.settlementKind)).toEqual(["presumed", "actual"]);
    expect(rows[0]!.costUsd).toBeLessThanOrEqual(maximumRequestCostUsd("claude-sonnet-5", "bull"));
    // No reservation outlives the pass.
    expect(first.db.select().from(jobLlmLeases).all()).toEqual([]);
  });

  it("settles a request that never reached the provider at zero", async () => {
    seedJob(first.db, "job-b", "AAPL");
    const claim = claimNextQueuedJob("owner", NOW, LIMITS, first.db)!;
    const { admission } = schedulerAdmission(claim, "bull", "pass-attempt", first.db);
    _resetAnthropicForTests(fakeClient([{ failWith: new APIError(400, { type: "error", error: { type: "invalid_request_error", message: "bad" } } as never, "bad", new Headers()) }]));

    const result = await runPass({ ...passOpts, admission });

    expect(result.ok).toBe(false);
    expect(first.db.select().from(costLog).all()).toEqual([]);
    expect(first.db.select().from(jobLlmLeases).all()).toEqual([]);
  });

  it("presumes the maximum for a request that was sent and then timed out", async () => {
    seedJob(first.db, "job-c", "AAPL");
    const claim = claimNextQueuedJob("owner", NOW, LIMITS, first.db)!;
    const { admission } = schedulerAdmission(claim, "bull", "pass-attempt", first.db);
    process.env.THESIS_STREAM_IDLE_SECONDS = "1";
    resetConfigCache();
    try {
      _resetAnthropicForTests(fakeClient([
        // Accepted, streamed a little, then silence.
        { events: [{ type: "message_start", message: message({ usage: usage({ input_tokens: 1_000, output_tokens: 100 }) }) }] },
      ]));

      const result = await runPass({ ...passOpts, admission });

      expect(result.ok).toBe(false);
      const rows = first.db.select().from(costLog).all();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ settlementKind: "presumed", attemptId: requestAttemptId("pass-attempt", 1) });
      // Reported usage plus the presumed remainder, never above the bound.
      expect(rows[0]!.costUsd).toBeGreaterThan(0);
      expect(rows[0]!.costUsd).toBeLessThanOrEqual(maximumRequestCostUsd("claude-sonnet-5", "bull"));
    } finally {
      delete process.env.THESIS_STREAM_IDLE_SECONDS;
      resetConfigCache();
    }
  }, 15_000);

  it("stops at a request boundary when the cap refuses the next request, keeping what was billed", async () => {
    // The cap admits the first request and nothing after it.
    const oneRequest = maximumRequestCostUsd("claude-sonnet-5", "bull");
    seedJob(first.db, "job-d", "AAPL", oneRequest);
    const claim = claimNextQueuedJob("owner", NOW, LIMITS, first.db)!;
    const { admission } = schedulerAdmission(claim, "bull", "pass-attempt", first.db);
    _resetAnthropicForTests(fakeClient([
      { events: [{ type: "message_start", message: message({ usage: usage({ input_tokens: 1_000, output_tokens: 10 }) }) }], failWith: midStreamOverload() },
    ]));
    const { _setTransportRetrySleepForTests } = await import("@/providers/anthropic");
    _setTransportRetrySleepForTests(async () => {});

    const result = await runPass({ ...passOpts, admission });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("transport");
    expect(result.error.message).toMatch(/spend admission refused request/);
    expect(result.gap.reason).toMatch(/stopped at a request boundary/);
    // What the first request billed is disclosed, not lost.
    expect(result.error.costUsd ?? 0).toBeGreaterThan(0);
    const rows = first.db.select().from(costLog).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.costUsd).toBeGreaterThan(0);
  });
});

describe("spend caps at a usable size", () => {
  it("refuses a search-capable request when the cap cannot cover its repeated-input exposure", () => {
    seedJob(first.db, "job-e-small", "AAPL", 5);
    const claim = claimNextQueuedJob("owner", NOW, LIMITS, first.db)!;
    const acquired = acquirePaidPassLease(
      claim, "bull", requestAttemptId("small", 1), maximumRequestCostUsd("claude-sonnet-5", "bull"),
      NOW, LIMITS, first.db, "claude-sonnet-5",
    );
    expect(acquired.acquired).toBe(false);
    expect(first.db.select().from(costLog).all()).toHaveLength(0);
  });

  it("admits a Sonnet 5 fixture-shaped run under a $30 per-job cap", () => {
    seedJob(first.db, "job-e", "AAPL", 30);
    const claim = claimNextQueuedJob("owner", NOW, LIMITS, first.db)!;
    const perRequest = maximumRequestCostUsd("claude-sonnet-5", "bull");
    expect(perRequest).toBeLessThan(30);

    // A fixture run makes one request per analyst side and one for the judge.
    for (const [pass, attempt] of [["bull", "a1"], ["bear", "a2"]] as const) {
      const acquired = acquirePaidPassLease(
        claim, pass, requestAttemptId(attempt, 1), perRequest, NOW, LIMITS, first.db, "claude-sonnet-5",
      );
      expect(acquired.acquired, `${pass} must be admitted under a $30 cap`).toBe(true);
      if (acquired.acquired) {
        settleRequestCost(acquired.lease, {
          model: "claude-sonnet-5",
          inputTokens: 40_000,
          outputTokens: 6_000,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          webSearches: 2,
          costUsd: 0.16,
          fallbackUsed: false,
        }, NOW, first.db);
      }
    }
    const judge = acquirePaidPassLease(
      claim, "synthesize", requestAttemptId("a3", 1),
      maximumRequestCostUsd("claude-sonnet-5", "synthesize"), NOW, LIMITS, first.db, "claude-sonnet-5",
    );
    expect(judge.acquired).toBe(true);

    // The former bound would have needed hundreds of dollars of headroom for
    // the same run.
    expect(passWorstCaseCostUsd("claude-sonnet-5", "bull")).toBeGreaterThan(100);
  });

  it("counts only reservations that can bill toward global LLM capacity", () => {
    seedJob(first.db, "job-f", "AAPL");
    const claim = claimNextQueuedJob("owner", NOW, LIMITS, first.db)!;
    // Deterministic verify reserves nothing and must never occupy a paid slot.
    for (const attempt of ["z1", "z2", "z3"]) {
      expect(acquirePaidPassLease(claim, "verify", attempt, 0, NOW, LIMITS, first.db, ""))
        .toMatchObject({ acquired: true });
    }
    expect(acquirePaidPassLease(claim, "bull", "p1", 1, NOW, LIMITS, first.db, "claude-sonnet-5"))
      .toMatchObject({ acquired: true });
    expect(acquirePaidPassLease(claim, "bear", "p2", 1, NOW, LIMITS, first.db, "claude-sonnet-5"))
      .toMatchObject({ acquired: true });
    // Two paid calls is the configured capacity.
    expect(acquirePaidPassLease(claim, "bull", "p3", 1, NOW, LIMITS, first.db, "claude-sonnet-5"))
      .toMatchObject({ acquired: false, reason: "capacity" });
  });

  it("lowers a pass reservation to zero once a request reserves for itself, and never raises one", () => {
    seedJob(first.db, "job-g", "AAPL");
    const claim = claimNextQueuedJob("owner", NOW, LIMITS, first.db)!;
    const acquired = acquirePaidPassLease(claim, "bull", "pass", 3, NOW, LIMITS, first.db, "claude-sonnet-5");
    if (!acquired.acquired) throw new Error("fixture lease failed");

    const resized = resizePaidPassLease(acquired.lease, 0, NOW, first.db);
    expect(resized).toMatchObject({ reservedCostUsd: 0 });
    expect(second.db.select().from(jobLlmLeases).all()).toEqual([
      expect.objectContaining({ permitId: acquired.lease.permitId, reservedCostUsd: 0 }),
    ]);
    expect(() => resizePaidPassLease(resized!, 1, NOW, first.db)).toThrow(/only be lowered/);
    // A lease that is gone cannot be resized.
    releaseUnbilledPaidPassLease(resized!, first.db, NOW);
    expect(resizePaidPassLease(resized!, 0, NOW, first.db)).toBeNull();
  });

  it("replays an already-settled request without billing it twice", () => {
    seedJob(first.db, "job-h", "AAPL");
    const claim = claimNextQueuedJob("owner", NOW, LIMITS, first.db)!;
    const acquired = acquirePaidPassLease(claim, "bull", requestAttemptId("pass", 1), 2, NOW, LIMITS, first.db, "claude-sonnet-5");
    if (!acquired.acquired) throw new Error("fixture lease failed");
    const settlement = {
      model: "claude-sonnet-5",
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      webSearches: 0,
      costUsd: 0.5,
      fallbackUsed: false,
    };
    expect(settleRequestCost(acquired.lease, settlement, NOW, first.db)).toEqual({ recorded: true, costUsd: 0.5 });
    expect(settleRequestCost(acquired.lease, settlement, NOW, second.db)).toEqual({ recorded: false, costUsd: 0.5 });
    expect(first.db.select().from(costLog).all()).toHaveLength(1);
  });

  it("refuses to settle a request above its own reservation", () => {
    seedJob(first.db, "job-i", "AAPL");
    const claim = claimNextQueuedJob("owner", NOW, LIMITS, first.db)!;
    const acquired = acquirePaidPassLease(claim, "bull", requestAttemptId("pass", 1), 1, NOW, LIMITS, first.db, "claude-sonnet-5");
    if (!acquired.acquired) throw new Error("fixture lease failed");
    expect(() => settleRequestCost(acquired.lease, {
      model: "claude-sonnet-5",
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      webSearches: 0,
      costUsd: 1.5,
      fallbackUsed: false,
    }, NOW, first.db)).toThrow();
  });
});

/**
 * A request the provider has answered (HTTP 200 and SSE headers) is presumed
 * when the caller cancels it before `message_start`, at the request maximum:
 * the figure a socket death in the same wire state settles (AI-113-V1, B7 OD-2).
 * Real SDK client on an in-memory fetch; no network.
 */
describe("a caller abort after the provider answered but before message_start (AI-113-V1)", () => {
  const OFFLINE_KEY = "sk-" + "ant-api03-offline-test";

  type Behaviour =
    | { kind: "sse"; body: string }
    | { kind: "hang-after-headers"; onHeaders?: () => void }
    | { kind: "die-after-headers" };

  function abortError(): Error {
    return Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
  }

  function realClient(behaviours: Behaviour[]): { client: Anthropic; calls: () => number } {
    let calls = 0;
    const fetchImpl = async (_url: unknown, init?: RequestInit): Promise<Response> => {
      const b = behaviours[Math.min(calls, behaviours.length - 1)]!;
      calls += 1;
      const signal = init?.signal ?? undefined;
      if (signal?.aborted) throw abortError();
      const headers = { "content-type": "text/event-stream", "request-id": `req_${calls}` };
      if (b.kind === "sse") return new Response(b.body, { status: 200, headers });
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          signal?.addEventListener("abort", () => controller.error(abortError()), { once: true });
          if (b.kind === "die-after-headers") {
            setTimeout(() => controller.error(Object.assign(new TypeError("terminated"), {
              cause: Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" }),
            })), 5);
          } else {
            setTimeout(() => b.onHeaders?.(), 5);
          }
        },
      });
      return new Response(body, { status: 200, headers });
    };
    const client = new Anthropic({ apiKey: OFFLINE_KEY, fetch: fetchImpl as never, maxRetries: 0 });
    return { client, calls: () => calls };
  }

  function sse(events: Array<Record<string, unknown>>): string {
    return events.map((e) => `event: ${String(e.type)}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  }

  const pausedBody = sse([
    { type: "message_start", message: {
      id: "msg_p", type: "message", role: "assistant", model: "claude-sonnet-5", content: [],
      stop_reason: null, stop_sequence: null,
      usage: { input_tokens: 1_000, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "partial" } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "pause_turn", stop_sequence: null }, usage: { output_tokens: 200 } },
    { type: "message_stop" },
  ]);

  /** The scheduler admission, counting releases. */
  function countedAdmission(id: string): { admission: RequestAdmission; released: () => number } {
    seedJob(first.db, id, "AAPL");
    const claim = claimNextQueuedJob("owner", NOW, LIMITS, first.db)!;
    const { admission } = schedulerAdmission(claim, "bull", "abort-attempt", first.db);
    let released = 0;
    return {
      admission: {
        ...admission,
        release: async (permit) => {
          released += 1;
          await admission.release(permit);
        },
      },
      released: () => released,
    };
  }

  const rows = () => ({ cost: first.db.select().from(costLog).all() });

  beforeEach(async () => {
    const { _setTransportRetrySleepForTests } = await import("@/providers/anthropic");
    _setTransportRetrySleepForTests(async () => {});
  });
  afterEach(async () => {
    const { _setTransportRetrySleepForTests } = await import("@/providers/anthropic");
    _setTransportRetrySleepForTests();
  });

  it("presumes a caller abort after the provider answered but before message_start", async () => {
    const { admission, released } = countedAdmission("job-abort");
    const controller = new AbortController();
    const { client, calls } = realClient([
      { kind: "hang-after-headers", onHeaders: () => controller.abort(new Error("model stage deadline")) },
    ]);
    _resetAnthropicForTests(client);

    const result = await runPass({ ...passOpts, admission, signal: controller.signal });

    expect(calls()).toBe(1);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.aborted).toBe(true);
    expect(!result.ok && result.error.message).toMatch(/aborted by the caller after the provider answered/);
    expect(released()).toBe(0);
    expect(rows().cost).toHaveLength(1);
    expect(rows().cost[0]).toMatchObject({ settlementKind: "presumed" });
    expect(rows().cost[0]!.costUsd).toBeCloseTo(maximumRequestCostUsd("claude-sonnet-5", "bull"), 6);
    expect(!result.ok && result.error.costUsd).toBeCloseTo(maximumRequestCostUsd("claude-sonnet-5", "bull"), 6);
  });

  it("presumes the same abort inside a pause_turn resumption", async () => {
    const { admission, released } = countedAdmission("job-resume-abort");
    const controller = new AbortController();
    const { client, calls } = realClient([
      { kind: "sse", body: pausedBody },
      { kind: "hang-after-headers", onHeaders: () => controller.abort(new Error("job canceled")) },
    ]);
    _resetAnthropicForTests(client);

    const result = await runPass({ ...passOpts, admission, signal: controller.signal });

    expect(calls()).toBe(2);
    expect(released()).toBe(0);
    expect(rows().cost).toHaveLength(2);
    const presumed = rows().cost.filter((c) => c.settlementKind === "presumed");
    expect(presumed).toHaveLength(1);
    // The presumed row is the request maximum, and the pass error states the sum of both settled rows.
    expect(presumed[0]!.costUsd).toBeCloseTo(maximumRequestCostUsd("claude-sonnet-5", "bull"), 6);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.costUsd).toBeCloseTo(rows().cost.reduce((sum, row) => sum + row.costUsd, 0), 6);
  });

  it("control: a socket death in the same state settles the same figure", async () => {
    const { admission, released } = countedAdmission("job-control");
    const { client } = realClient([{ kind: "die-after-headers" }]);
    _resetAnthropicForTests(client);

    await runPass({ ...passOpts, admission });

    expect(released()).toBe(0);
    expect(rows().cost[0]!.costUsd).toBeCloseTo(maximumRequestCostUsd("claude-sonnet-5", "bull"), 6);
  });

  it("control: an abort before dispatch never calls fetch and is released at $0", async () => {
    const { admission, released } = countedAdmission("job-predispatch");
    const { client, calls } = realClient([{ kind: "hang-after-headers" }]);
    _resetAnthropicForTests(client);
    const controller = new AbortController();
    controller.abort(new Error("job canceled"));

    await runPass({ ...passOpts, admission, signal: controller.signal });

    expect(calls()).toBe(0);
    expect(released()).toBe(1);
    expect(rows().cost).toHaveLength(0);
  });
});

/**
 * A request whose connection never opened was never sent, so it is released at
 * $0; a failure after the send stays presumed (AI-307). The client is the one
 * the real getClient() builds, on a stubbed global fetch, so these tests also
 * prove getClient installs the pre-send classifier.
 */
describe("a connect-phase failure releases the request (AI-307)", () => {
  const OFFLINE_KEY = "sk-" + "ant-api03-offline-test";
  let fetchCount = 0;
  let behaviour: () => never;
  let decisions: string[] = [];

  const fetchCalls = () => fetchCount;
  const rows = () => ({ cost: first.db.select().from(costLog).all() });

  function connectCause(over: Record<string, unknown>): TypeError {
    return new TypeError("fetch failed", { cause: Object.assign(new Error(String(over.message)), over) });
  }

  function recordingAdmission(id: string): RequestAdmission {
    seedJob(first.db, id, "AAPL");
    const claim = claimNextQueuedJob("owner", NOW, LIMITS, first.db)!;
    const { admission } = schedulerAdmission(claim, "bull", "connect-attempt", first.db);
    return {
      ...admission,
      settle: async (permit, settled) => {
        decisions.push(`settle presumed=${settled.presumed === true} usd=${settled.costUsd.toFixed(2)}`);
        await admission.settle(permit, settled);
      },
      release: async (permit) => {
        decisions.push("release");
        await admission.release(permit);
      },
    };
  }

  async function runBull(id: string): Promise<void> {
    await runPass({
      model: "claude-opus-5-5",
      system: "system",
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 8_000,
      field: "llm.bull",
      reservationPass: "bull",
      effort: "high",
      tools: [webSearchTool(8, "claude-opus-5-5")],
      admission: recordingAdmission(id),
    });
  }

  beforeEach(async () => {
    fetchCount = 0;
    decisions = [];
    process.env.ANTHROPIC_API_KEY = OFFLINE_KEY;
    resetConfigCache();
    _resetAnthropicForTests();
    vi.stubGlobal("fetch", async () => {
      fetchCount += 1;
      return behaviour();
    });
    const { _setTransportRetrySleepForTests } = await import("@/providers/anthropic");
    _setTransportRetrySleepForTests(async () => {});
  });
  afterEach(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    resetConfigCache();
    _resetAnthropicForTests();
    vi.unstubAllGlobals();
    const { _setTransportRetrySleepForTests } = await import("@/providers/anthropic");
    _setTransportRetrySleepForTests();
  });

  it("releases a TCP connect timeout on every attempt instead of presuming the request maximum", async () => {
    behaviour = () => {
      throw connectCause({
        name: "ConnectTimeoutError",
        code: "UND_ERR_CONNECT_TIMEOUT",
        message: "Connect Timeout Error (attempted address: 10.255.255.1:443, timeout: 10000ms)",
      });
    };
    await runBull("job-connect-timeout");
    expect(fetchCalls()).toBe(PASS_TRANSPORT_MAX_ATTEMPTS);
    expect([...new Set(decisions)]).toEqual(["release"]);
    expect(rows().cost).toHaveLength(0);
  });

  it("releases an OS connect ETIMEDOUT", async () => {
    behaviour = () => {
      throw connectCause({ code: "ETIMEDOUT", syscall: "connect", message: "connect ETIMEDOUT 160.79.104.10:443" });
    };
    await runBull("job-os-etimedout");
    expect([...new Set(decisions)]).toEqual(["release"]);
    expect(rows().cost).toHaveLength(0);
  });

  it("control: ECONNREFUSED is released", async () => {
    behaviour = () => {
      throw connectCause({ code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:443" });
    };
    await runBull("job-refused");
    expect([...new Set(decisions)]).toEqual(["release"]);
  });

  it("control: a connect-syscall EHOSTUNREACH is released", async () => {
    behaviour = () => {
      throw connectCause({ code: "EHOSTUNREACH", syscall: "connect", message: "connect EHOSTUNREACH 160.79.104.10:443, request timed out" });
    };
    await runBull("job-hostunreach-connect");
    expect([...new Set(decisions)]).toEqual(["release"]);
    expect(rows().cost).toHaveLength(0);
  });

  it("pins that a connection reset before the response headers is released (D-next-1 limit)", async () => {
    // D-next-1 limit, as at main: only a timeout after send, a stream lost after the headers, or an
    // answered-then-cancelled request is presumed. A non-timeout connection failure before the headers
    // (here an ECONNRESET on the read of an established socket, wrapped by the SDK as an
    // APIConnectionError) is released at $0 with no cost row, although the request may have been
    // sent and billed; costs:reconcile lowers presumed rows only, so such a charge is not recorded.
    behaviour = () => {
      throw connectCause({ code: "ECONNRESET", syscall: "read", message: "read ECONNRESET" });
    };
    await runBull("job-econnreset-read");
    expect(fetchCalls()).toBe(PASS_TRANSPORT_MAX_ATTEMPTS);
    expect([...new Set(decisions)]).toEqual(["release"]);
    expect(rows().cost).toHaveLength(0);
  });

  it("keeps a headers timeout presumed", async () => {
    behaviour = () => {
      throw connectCause({ name: "HeadersTimeoutError", code: "UND_ERR_HEADERS_TIMEOUT", message: "Headers Timeout Error" });
    };
    await runBull("job-headers-timeout");
    expect(decisions.length).toBeGreaterThan(0);
    expect(decisions.every((d) => d.startsWith("settle presumed=true"))).toBe(true);
  });

  it("keeps the SDK request timeout presumed", async () => {
    // The SDK's own timer aborts its internal controller, so fetch rejects with an
    // AbortError while the caller's signal is live; the SDK maps that to
    // APIConnectionTimeoutError. A bare AbortError must pass the wrapper unchanged.
    behaviour = () => {
      throw Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
    };
    await runBull("job-sdk-timeout");
    expect(fetchCalls()).toBe(PASS_TRANSPORT_MAX_ATTEMPTS);
    expect(decisions.every((d) => d.startsWith("settle presumed=true"))).toBe(true);
  });

  it("tags only connect-phase failures", () => {
    const wrap = (over: Record<string, unknown>) => connectCause({ message: "x", ...over });
    for (const code of ["UND_ERR_CONNECT_TIMEOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"]) {
      expect(isPreSendConnectionFailure(wrap({ code }))).toBe(true);
    }
    // Re-pinned (review of AI-307): EHOSTUNREACH and ENETUNREACH are pre-send only from the connect
    // syscall, like ETIMEDOUT; a route loss on an established socket happens after the send.
    for (const code of ["EHOSTUNREACH", "ENETUNREACH"]) {
      expect(isPreSendConnectionFailure(wrap({ code, syscall: "connect" }))).toBe(true);
      expect(isPreSendConnectionFailure(wrap({ code, syscall: "read" }))).toBe(false);
      expect(isPreSendConnectionFailure(wrap({ code }))).toBe(false);
    }
    expect(isPreSendConnectionFailure(wrap({ code: "ETIMEDOUT", syscall: "connect" }))).toBe(true);
    expect(isPreSendConnectionFailure(wrap({ code: "ETIMEDOUT", syscall: "getaddrinfo" }))).toBe(true);
    for (const code of ["UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET", "ECONNRESET", "ETIMEDOUT"]) {
      expect(isPreSendConnectionFailure(wrap({ code }))).toBe(false);
    }
    expect(isPreSendConnectionFailure(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe(false);
  });
});

/**
 * A completed paid response whose ledger write meets another process's writer
 * lock (AI-308). The admission mirrors the runner's: a settle write that
 * throws leaves the request lease in the map. A second connection holds
 * BEGIN IMMEDIATE on the same temporary file, as a second process would.
 */
describe("a contended ledger write keeps a completed response (AI-308)", () => {
  const OFFLINE_KEY = "sk-" + "ant-api03-offline-test";
  const MODEL = "claude-opus-5-5";
  const USAGE = { input_tokens: 5_720, cache_creation_input_tokens: 153_607, cache_read_input_tokens: 0, output_tokens: 2_410 };
  const frame = (e: Record<string, unknown>) => `event: ${String(e.type)}\ndata: ${JSON.stringify(e)}\n\n`;
  const body = [
    { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: MODEL, content: [], stop_reason: null, stop_sequence: null, usage: { ...USAGE, output_tokens: 1 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "{\"thesis\":\"done\"}" } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: USAGE },
    { type: "message_stop" },
  ].map(frame).join("");
  const passOptions = {
    model: MODEL,
    system: "system",
    messages: [{ role: "user" as const, content: "hi" }],
    tools: [webSearchTool(8, MODEL)],
    maxTokens: 64_000,
    effort: "high" as const,
    field: "llm.bull",
    reservationPass: "bull" as const,
  };
  let file: string;
  let holder: Database.Database | null = null;
  let sleeps: number[] = [];

  beforeEach(async () => {
    file = join(directory, "locked.db");
    first.sqlite.close();
    second.sqlite.close();
    first = createDatabase(file);
    second = createDatabase(file);
    first.sqlite.pragma("busy_timeout = 100"); // production 5000 ms, scaled
    setDbForTests(first.db);
    sleeps = [];
    const { _setTransportRetrySleepForTests } = await import("@/providers/anthropic");
    _setTransportRetrySleepForTests(async (ms) => { sleeps.push(ms); });
  });
  afterEach(async () => {
    try { holder?.exec("ROLLBACK"); } catch { /* none open */ }
    holder?.close();
    holder = null;
    const { _setTransportRetrySleepForTests } = await import("@/providers/anthropic");
    _setTransportRetrySleepForTests();
  });

  function lockingClient(): Anthropic {
    const fetchImpl = async (): Promise<Response> => {
      holder = new Database(file);
      holder.pragma("busy_timeout = 100");
      holder.exec("BEGIN IMMEDIATE"); // another process takes the writer lock
      return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
    };
    return new Anthropic({ apiKey: OFFLINE_KEY, fetch: fetchImpl as never, maxRetries: 0 });
  }

  /** The runner's admission shape: the write error is mapped, the lease stays in the map. */
  function runnerShapedAdmission(id: string, onWriteError: () => void, failWith?: Error) {
    seedJob(first.db, id, "NVDA");
    const claim = claimNextQueuedJob("owner", NOW, LIMITS, first.db)!;
    const leases = new Map<string, PaidPassLease>();
    const errors: string[] = [];
    let seq = 0;
    const admission: RequestAdmission = {
      reserve: async ({ maximumUsd }) => {
        seq += 1;
        const a = acquirePaidPassLease(claim, "bull", requestAttemptId("attempt", seq), maximumUsd, NOW, LIMITS, first.db, MODEL);
        if (!a.acquired) throw new Error(`blocked by ${a.reason}`);
        leases.set(a.lease.permitId, a.lease);
        return { id: a.lease.permitId, maximumUsd: a.lease.reservedCostUsd };
      },
      settle: async (permit, s) => {
        const lease = leases.get(permit.id);
        if (lease === undefined) return;
        try {
          if (failWith !== undefined) throw failWith;
          settleRequestCost(lease, {
            model: s.model,
            inputTokens: s.usage?.input_tokens ?? 0,
            outputTokens: s.usage?.output_tokens ?? 0,
            cacheReadTokens: s.usage?.cache_read_input_tokens ?? 0,
            cacheWriteTokens: s.usage?.cache_creation_input_tokens ?? 0,
            webSearches: s.webSearches,
            costUsd: s.costUsd,
            fallbackUsed: s.fallbackUsed,
            ...(s.presumed === true ? { presumed: true } : {}),
          }, NOW, first.db);
        } catch (error) {
          errors.push(`${(error as { code?: string }).code}`);
          onWriteError();
          throw requestSettlementWriteError(error);
        }
        leases.delete(permit.id);
      },
      release: async (permit) => {
        const lease = leases.get(permit.id);
        if (lease === undefined) return;
        releaseUnbilledPaidPassLease(lease, first.db, NOW);
        leases.delete(permit.id);
      },
    };
    return { admission, errors };
  }

  async function outcomeOf(p: Promise<{ ok: boolean }>): Promise<string> {
    try {
      return (await p).ok ? "resolved ok" : "resolved failure";
    } catch (e) {
      return `REJECTED ${(e as Error).name}: ${(e as Error).message}`;
    }
  }

  it("returns a completed response once a retried settle records it (S1)", async () => {
    const { admission, errors } = runnerShapedAdmission("s1", () => {
      if (holder?.inTransaction) holder.exec("COMMIT"); // the lock clears before the retry
    });
    _resetAnthropicForTests(lockingClient());
    const outcome = await outcomeOf(runPassStreaming({ ...passOptions, admission }).result);
    const rows = first.db.select().from(costLog).all();
    const liveLeases = first.db.select().from(jobLlmLeases).all().length;
    expect(errors).toEqual(["SQLITE_BUSY"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.costUsd).toBeCloseTo(computeCostUsd(USAGE, MODEL), 6);
    expect(rows[0]!.settlementKind).toBe("actual");
    expect(liveLeases).toBe(0);
    expect(outcome).toBe("resolved ok");
    expect(sleeps).toEqual([250]);
  });

  it("returns a completed response when the lock outlasts every retry, leaving the lease to be presumed (S2)", async () => {
    const { admission, errors } = runnerShapedAdmission("s2", () => {});
    _resetAnthropicForTests(lockingClient());
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const outcome = await outcomeOf(runPassStreaming({ ...passOptions, admission }).result);
    holder?.exec("COMMIT");
    const before = first.db.select().from(costLog).all().length;
    reconcileExpiredJobClaims(new Date(NOW.getTime() + 16 * 60 * 1000), first.db);
    const after = first.db.select().from(costLog).all().map((r) => [r.costUsd, r.settlementKind]);
    expect(errors).toEqual(["SQLITE_BUSY", "SQLITE_BUSY", "SQLITE_BUSY", "SQLITE_BUSY"]); // first try + 3 retries
    expect(sleeps).toEqual([250, 1_000, 4_000]);
    expect(log.mock.calls.filter(([m]) => String(m).includes("llm.bull"))).toHaveLength(1);
    log.mockRestore();
    expect(outcome).toBe("resolved ok");
    expect(before).toBe(0);
    expect(after).toEqual([[maximumRequestCostUsd(MODEL, "bull"), "presumed"]]); // $52.64 after the expiry sweep
  });

  it("control: a settle failure that is not lock contention still rejects the pass", async () => {
    const { admission } = runnerShapedAdmission(
      "s3",
      () => {},
      new Error("jobScheduler invariant: actual paid-pass cost exceeds its reservation"),
    );
    _resetAnthropicForTests(lockingClient());
    await expect(runPassStreaming({ ...passOptions, admission }).result).rejects.toThrow(/exceeds its reservation/);
    expect(sleeps).toEqual([]);
  });

  it("treats only the SQLITE_BUSY family as a contended ledger write", () => {
    const busy = (code: string) => Object.assign(new Error("database is locked"), { code });
    for (const code of ["SQLITE_BUSY", "SQLITE_BUSY_RECOVERY", "SQLITE_BUSY_SNAPSHOT", "SQLITE_BUSY_TIMEOUT"]) {
      expect(requestSettlementWriteError(busy(code))).toBeInstanceOf(RequestSettlementNotRecordedError);
      expect(requestSettlementWriteError(new Error("wrapped", { cause: busy(code) }))).toBeInstanceOf(RequestSettlementNotRecordedError);
    }
    const locked = busy("SQLITE_LOCKED");
    expect(requestSettlementWriteError(locked)).toBe(locked); // same-connection conflict: stays loud
  });

  it("walks a bounded, cycle-safe cause chain and ignores non-error values", () => {
    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;
    expect(isTransientWriterLock(cyclic)).toBe(false);
    let deep: unknown = Object.assign(new Error("busy"), { code: "SQLITE_BUSY" });
    for (let i = 0; i < 8; i++) deep = new Error("wrapper", { cause: deep });
    expect(isTransientWriterLock(deep)).toBe(false); // past the 8-link bound
    for (const value of [null, undefined, "SQLITE_BUSY", 5, { code: 5 }]) {
      expect(isTransientWriterLock(value)).toBe(false);
    }
  });
});

describe("per-job cap (JOB-209)", () => {
  // One Sonnet 5.5 analyst request reservation (README pricing table).
  const SONNET_55_ANALYST_REQUEST_USD = 26.36;

  // The "restart": the cap env changes and the cached config is dropped.
  function restartWith(cap: string | undefined): void {
    if (cap === undefined) delete process.env.METIS_MAX_JOB_COST_USD;
    else process.env.METIS_MAX_JOB_COST_USD = cap;
    resetConfigCache();
  }

  function lease(reserveUsd = SONNET_55_ANALYST_REQUEST_USD) {
    const claim = claimNextQueuedJob("owner", undefined, configuredSchedulerLimits(), first.db)!;
    return acquirePaidPassLease(claim, "bull", "a1", reserveUsd, undefined, configuredSchedulerLimits(), first.db);
  }

  beforeEach(() => restartWith(undefined));
  afterEach(() => restartWith(undefined));

  it("binds a job queued before a restart that set METIS_MAX_JOB_COST_USD=5", () => {
    const { jobId } = createJob("AAPL");
    restartWith("5");
    expect(getOrCreateJobForSymbol("AAPL")).toMatchObject({ jobId, existing: true });
    expect(first.db.select({ cap: jobs.maxCostUsd }).from(jobs).where(eq(jobs.id, jobId)).get()?.cap).toBeNull();
    expect(lease()).toEqual({ acquired: false, reason: "job-budget" });
  });

  it("control: a job queued after the $5 cap is refused", () => {
    restartWith("5");
    createJob("AAPL");
    expect(lease()).toEqual({ acquired: false, reason: "job-budget" });
  });

  it("keeps the recorded cap when the configured cap is raised", () => {
    restartWith("5");
    createJob("AAPL");
    restartWith("30");
    expect(lease()).toEqual({ acquired: false, reason: "job-budget" });
  });

  it("uses the recorded cap when no cap is configured now", () => {
    restartWith("5");
    createJob("AAPL");
    restartWith(undefined);
    expect(lease()).toEqual({ acquired: false, reason: "job-budget" });
  });

  // Review of JOB-209: the lowered live cap also closes the gap through live reservations.
  it("reports job-budget-pending when the live cap is below the recorded cap and a reservation fills it", () => {
    restartWith("30");
    createJob("AAPL");
    restartWith("5");
    const claim = claimNextQueuedJob("owner", undefined, configuredSchedulerLimits(), first.db)!;
    const lowLimits = { ...configuredSchedulerLimits(), maxActiveLlmCalls: 2 };
    expect(acquirePaidPassLease(claim, "bull", "a1", 3, undefined, lowLimits, first.db)).toMatchObject({ acquired: true });
    // 3 live + 3 more is $6, over the live $5 cap but under the recorded $30; nothing is settled yet.
    expect(acquirePaidPassLease(claim, "bear", "a2", 3, undefined, lowLimits, first.db))
      .toEqual({ acquired: false, reason: "job-budget-pending" });
    // Control: the same two reservations fit when the live cap equals the recorded one.
    restartWith("30");
    expect(acquirePaidPassLease(claim, "bear", "a3", 3, undefined, { ...configuredSchedulerLimits(), maxActiveLlmCalls: 2 }, first.db))
      .toMatchObject({ acquired: true });
  });

  it("admits when neither cap is set", () => {
    createJob("AAPL");
    expect(lease()).toMatchObject({ acquired: true });
  });

  it("admits a zero reservation under a zero cap", () => {
    restartWith("0");
    createJob("AAPL");
    expect(lease(0)).toMatchObject({ acquired: true });
  });

  it("takes the smaller of the non-null caps", () => {
    expect(effectiveJobCapUsd(5, 30)).toBe(5);
    expect(effectiveJobCapUsd(30, 5)).toBe(5);
    expect(effectiveJobCapUsd(null, 5)).toBe(5);
    expect(effectiveJobCapUsd(5, null)).toBe(5);
    expect(effectiveJobCapUsd(5, undefined)).toBe(5);
    expect(effectiveJobCapUsd(null, null)).toBeNull();
    expect(effectiveJobCapUsd(null, undefined)).toBeNull();
  });

  it("rejects a configured cap that is not null or a finite nonnegative number", () => {
    seedJob(first.db, "job-bad-cap", "AAPL");
    const claim = claimNextQueuedJob("owner", NOW, LIMITS, first.db)!;
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => acquirePaidPassLease(
        claim, "bull", "a1", 1, NOW, { ...LIMITS, maxJobCostUsd: bad }, first.db,
      )).toThrow(/maxJobCostUsd must be null or a finite nonnegative value/);
    }
  });
});
