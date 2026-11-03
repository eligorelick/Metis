/**
 * Pre-launch paid-run budget feasibility.
 *
 * On 2026-11-03 a live Haiku 4.5 run under METIS_MAX_JOB_COST_USD=3 paid $0.44
 * for its bull pass and then could not admit its bear research request
 * ($2.90 worst case on top of the $0.44) or its judge (each section request
 * reserves $5.28 on the Sonnet 5.5 floor, more than the whole cap). The run
 * fell back to a data-only report and the $0.44 bought nothing. These tests pin
 * the two pieces the runner now uses to refuse such a run before its first
 * paid request:
 *
 *  - the plan of every reservation the remaining run asks admission for,
 *    priced by the same functions admission uses (real registry, no mocks);
 *  - a read-only mirror of the scheduler's cap test, which must agree with
 *    `acquirePaidPassLease` on the same database state.
 *
 * Offline: real config parsing, an in-memory SQLite database, no network.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetConfigCache } from "@/config/env";
import { MODEL_REGISTRY } from "@/models/registry";
import { createDatabase, setDbForTests, type DatabaseHandle } from "@/db";
import { costLog, jobLlmLeases, jobs } from "@/db/schema";
import { initialSteps } from "@/pipeline/jobRunner";
import {
  acquirePaidPassLease,
  claimNextQueuedJob,
  paidReservationCapRefusal,
  type PaidCapRefusal,
  type SchedulerLimits,
} from "@/pipeline/jobScheduler";
import {
  largestPlannedReservation,
  paidBudgetRefusalReason,
  plannedPaidReservations,
  type PlannedReservation,
} from "@/pipeline/paidRunBudget";
import { runStageB } from "@/pipeline/compute";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import { buildAnalystRunPassArgs, buildJudgeRunPassArgs, runBullPass, type RunPassArgs } from "@/pipeline/stageC/passes";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import {
  maximumPassCostUsd,
  requestReservationUsd,
  webSearchTool,
  type RunPassOptions,
} from "@/providers/anthropic";
import type { AnalystCase } from "@/report/schema";

import { completeCurrencyBundle } from "./helpers/currencyBundle";

const NOW = new Date("2026-11-03T12:00:00.000Z");
const ALL_REMAINING = { analysts: ["bull", "bear"] as const, synthesize: true, verify: true };
const DETERMINISTIC_VERIFY = { billable: false } as const;
const VALIDATION = { checks: [], flags: [], gaps: [] } as unknown as ValidationReport;

const LIMITS: SchedulerLimits = {
  maxActiveJobs: 1,
  maxActiveLlmCalls: 2,
  maxRollingCostUsd: null,
  rollingCostWindowMs: 24 * 60 * 60 * 1000,
  paidPassLeaseTtlMs: 15 * 60 * 1000,
  jobLeaseTtlMs: 15 * 60 * 1000,
  maxJobCostUsd: null,
};

function setEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  resetConfigCache();
}

beforeEach(() => {
  setEnv("METIS_RESERVATION_MODE", undefined);
  setEnv("METIS_JUDGE_ORDER", undefined);
});

afterEach(() => {
  setEnv("METIS_RESERVATION_MODE", undefined);
  setEnv("METIS_JUDGE_ORDER", undefined);
});

describe("the plan of paid reservations a run asks admission for", () => {
  it("prices the observed Haiku 4.5 run: $2.90 research, $0.57 writing, $5.28 judge sections on the Sonnet 5.5 floor", () => {
    const planned = plannedPaidReservations("claude-haiku-4-5", ALL_REMAINING, DETERMINISTIC_VERIFY);
    const byKind = (pass: string, kind: string) =>
      planned.filter((entry) => entry.pass === pass && entry.kind === kind).map((entry) => [entry.model, entry.reservationUsd]);
    expect(byKind("bull", "research")).toEqual([["claude-haiku-4-5", 2.9]]);
    expect(byKind("bear", "research")).toEqual([["claude-haiku-4-5", 2.9]]);
    expect(byKind("bull", "writing")).toEqual([["claude-haiku-4-5", 0.57]]);
    expect(byKind("synthesize", "judge-section")).toEqual([["claude-sonnet-5-5", 5.28]]);
    // Deterministic verification reserves nothing.
    expect(planned.filter((entry) => entry.pass === "verify").every((entry) => entry.reservationUsd === 0)).toBe(true);
    expect(largestPlannedReservation(planned)).toMatchObject({
      pass: "synthesize", kind: "judge-section", model: "claude-sonnet-5-5", reservationUsd: 5.28,
    });
  });

  it.each([
    ["claude-sonnet-5-5", 26.36, 5.28],
    ["claude-opus-5-5", 52.64, 10.56],
  ])("names the analyst research request as the largest reservation on %s", (model, research, judge) => {
    const planned = plannedPaidReservations(model, ALL_REMAINING, DETERMINISTIC_VERIFY);
    expect(planned.find((entry) => entry.pass === "synthesize" && entry.kind === "judge-section")?.reservationUsd).toBe(judge);
    expect(largestPlannedReservation(planned)).toMatchObject({ pass: "bull", kind: "research", model, reservationUsd: research });
  });

  it("covers only the work still to run", () => {
    const judgeOnly = plannedPaidReservations("claude-sonnet-5-5", { analysts: [], synthesize: true, verify: true }, DETERMINISTIC_VERIFY);
    expect(judgeOnly.some((entry) => entry.pass === "bull" || entry.pass === "bear")).toBe(false);
    expect(largestPlannedReservation(judgeOnly)).toMatchObject({ pass: "synthesize", reservationUsd: 5.28 });
    const verifyOnly = plannedPaidReservations("claude-sonnet-5-5", { analysts: [], synthesize: false, verify: true }, DETERMINISTIC_VERIFY);
    expect(largestPlannedReservation(verifyOnly)).toBeNull();
  });

  it("reserves nothing for a subscription connection", () => {
    for (const model of ["chatgpt/gpt-6.1-sol", "gemini/auto"]) {
      expect(largestPlannedReservation(plannedPaidReservations(model, ALL_REMAINING, DETERMINISTIC_VERIFY))).toBeNull();
    }
  });

  it("uses the whole-pass reservation in pass reservation mode", () => {
    setEnv("METIS_RESERVATION_MODE", "pass");
    const planned = plannedPaidReservations("claude-haiku-4-5", ALL_REMAINING, DETERMINISTIC_VERIFY);
    const judgePass = maximumPassCostUsd("claude-haiku-4-5", "synthesize", undefined, 1);
    expect(planned.find((entry) => entry.pass === "bull")?.reservationUsd).toBe(maximumPassCostUsd("claude-haiku-4-5", "bull"));
    expect(largestPlannedReservation(planned)).toMatchObject({ pass: "synthesize", kind: "pass-admission", reservationUsd: judgePass });
    // `both` doubles the judge pass bound in pass mode, as the runner's lease does.
    setEnv("METIS_JUDGE_ORDER", "both");
    expect(largestPlannedReservation(plannedPaidReservations("claude-haiku-4-5", ALL_REMAINING, DETERMINISTIC_VERIFY))?.reservationUsd)
      .toBe(maximumPassCostUsd("claude-haiku-4-5", "synthesize", undefined, 2));
  });

  it("prices exactly the requests Stage C sends (research, writing and a judge section)", async () => {
    // A real payload (Stage B over a test bundle), so the requests are the ones
    // Stage C builds in a run; the reservation depends on their model, tools
    // and cache TTL, never on the payload text.
    const bundle = completeCurrencyBundle({});
    const payload = assembleContextPayload(bundle, runStageB(bundle), VALIDATION);
    const toOptions = (args: RunPassArgs): RunPassOptions => args as unknown as RunPassOptions;
    const analyst: AnalystCase = {
      thesis: [{ text: "t", label: "JUDGMENT", source: "payload", asOf: null }],
      keyDrivers: [], risksToCase: [], catalysts: [],
      priceTarget: { value: 1, horizon: "12mo", assumptions: [] }, evidence: [],
    };
    for (const model of ["claude-haiku-4-5", "claude-sonnet-5-5", "claude-opus-5-5"]) {
      const captured: RunPassArgs[] = [];
      const deps = {
        model,
        effort: "medium" as const,
        webSearchTool,
        judgeSectionedOutput: true,
        judgeOrder: "random" as const,
        jobSeed: "seed",
        runPass: async (args: RunPassArgs) => {
          captured.push(args);
          return { ok: false as const, gap: { field: "llm.bull", reason: "stop", severity: "critical" as const }, error: { message: "stop", kind: "transport" as const } };
        },
      };
      // The first request a bull pass sends is its research request.
      await runBullPass(deps, payload);
      const research = captured[0]!;
      expect(research.tools?.length).toBe(1);
      const writing = buildAnalystRunPassArgs(deps, payload, "bull");
      expect(writing.tools).toBeUndefined();
      const judge = buildJudgeRunPassArgs(deps, payload, analyst, analyst);
      const planned = plannedPaidReservations(model, ALL_REMAINING, DETERMINISTIC_VERIFY);
      const plannedOf = (kind: string, pass = "bull") =>
        planned.find((entry) => entry.pass === pass && entry.kind === kind)?.reservationUsd;
      expect(plannedOf("research"), model).toBe(requestReservationUsd(toOptions(research)));
      expect(plannedOf("writing"), model).toBe(requestReservationUsd(toOptions(writing)));
      expect(plannedOf("judge-section", "synthesize"), model).toBe(requestReservationUsd(toOptions(judge)));
      expect(planned.find((entry) => entry.kind === "judge-section")?.model, model).toBe(judge.model);
    }
  });
});

describe("the read-only mirror of the scheduler's cap test", () => {
  let handle: DatabaseHandle;

  beforeEach(() => {
    handle = createDatabase(":memory:");
    setDbForTests(handle.db);
  });

  afterEach(() => {
    setDbForTests(null);
    handle.sqlite.close();
  });

  function seedJob(id: string, maxCostUsd: number | null): void {
    const at = NOW.toISOString();
    handle.db.insert(jobs).values({
      id, symbol: id.toUpperCase(), status: "queued", stepsJson: JSON.stringify(initialSteps()),
      createdAt: at, updatedAt: at, queuedAt: at, maxCostUsd,
    }).run();
  }

  function seedCost(jobId: string, costUsd: number, createdAt = NOW.toISOString()): void {
    handle.db.insert(costLog).values({
      jobId, runGeneration: 0, attemptId: `${jobId}-${costUsd}-${createdAt}`, step: "bull", model: "claude-haiku-4-5",
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 0,
      costUsd, fallbackUsed: false, createdAt,
    }).run();
  }

  it("agrees with acquirePaidPassLease on the job cap at, below and above the boundary", () => {
    for (const [settled, reservation, expectRefused] of [
      [0.44, 2.56, false], // exactly the $3 cap
      [0.44, 2.560001, true],
      [0, 5.28, true], // the observed judge reservation
      [0, 2.9, false], // the observed research reservation, alone
      [0.44, 2.9, true], // the observed bear refusal
    ] as const) {
      setDbForTests(null);
      handle.sqlite.close();
      handle = createDatabase(":memory:");
      setDbForTests(handle.db);
      seedJob("job", 3);
      if (settled > 0) seedCost("job", settled);
      const refusal = paidReservationCapRefusal("job", reservation, LIMITS, NOW, handle.db);
      const claim = claimNextQueuedJob("owner", NOW, LIMITS, handle.db)!;
      const acquired = acquirePaidPassLease(claim, "bear", "a1", reservation, NOW, LIMITS, handle.db);
      expect(refusal !== null, `settled ${settled} + ${reservation}`).toBe(expectRefused);
      expect(acquired.acquired, `settled ${settled} + ${reservation}`).toBe(!expectRefused);
      if (refusal !== null) {
        expect(refusal).toMatchObject({ cap: "job", capUsd: 3, settledUsd: settled, reservedUsd: 0, recordedJobCapUsd: 3 });
        expect(refusal.minimumCapUsd).toBeCloseTo(settled + reservation, 6);
      }
    }
  });

  it("applies the lower of the recorded and configured job caps, as admission does", () => {
    seedJob("job", 30);
    expect(paidReservationCapRefusal("job", 5.28, { ...LIMITS, maxJobCostUsd: 3 }, NOW, handle.db))
      .toMatchObject({ cap: "job", capUsd: 3, recordedJobCapUsd: 30, configuredJobCapUsd: 3 });
    expect(paidReservationCapRefusal("job", 5.28, { ...LIMITS, maxJobCostUsd: 30 }, NOW, handle.db)).toBeNull();
    seedJob("uncapped", null);
    expect(paidReservationCapRefusal("uncapped", 5.28, LIMITS, NOW, handle.db)).toBeNull();
  });

  it("counts the job's live reservations and every live reservation against the rolling cap", () => {
    seedJob("job", null);
    seedJob("other", null);
    seedCost("other", 20);
    // An older row outside the 24h window does not count.
    seedCost("other", 100, new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString());
    const rolling = { ...LIMITS, maxRollingCostUsd: 25 };
    expect(paidReservationCapRefusal("job", 4.9, rolling, NOW, handle.db)).toBeNull();
    expect(paidReservationCapRefusal("job", 5.28, rolling, NOW, handle.db)).toMatchObject({
      cap: "rolling", capUsd: 25, settledUsd: 20, reservedUsd: 0, headroomUsd: 5,
    });
    // Another job's request in flight holds $2 of the window.
    handle.db.insert(jobLlmLeases).values({
      permitId: "p1", jobId: "other", runGeneration: 0, attemptId: "x", pass: "bull", leaseOwner: "o",
      reservedCostUsd: 2, model: "claude-haiku-4-5", acquiredAt: NOW.toISOString(),
      leaseExpiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    }).run();
    const refusal = paidReservationCapRefusal("job", 4.9, rolling, NOW, handle.db);
    expect(refusal).toMatchObject({ cap: "rolling", settledUsd: 20, reservedUsd: 2, headroomUsd: 3 });
    expect(refusal?.minimumCapUsd).toBeCloseTo(26.9, 6);
  });

  it("treats an expired lease as admission's presumed spend, dated at its acquisition", () => {
    // PR #88 review: admission first converts an expired lease into presumed spend
    // dated when it was acquired, so a lease older than the rolling window leaves it.
    const window = { ...LIMITS, maxRollingCostUsd: 25, rollingCostWindowMs: 10 * 60_000 };
    seedJob("job", null);
    const claim = claimNextQueuedJob("owner", NOW, window, handle.db)!;
    seedJob("other", null);
    const lease = (attemptId: string, reservedCostUsd: number, acquiredMinutesAgo: number) => handle.db.insert(jobLlmLeases).values({
      permitId: `p-${attemptId}`, jobId: "other", runGeneration: 0, attemptId, pass: "bull", leaseOwner: "o",
      reservedCostUsd, model: "claude-opus-5-5", acquiredAt: new Date(NOW.getTime() - acquiredMinutesAgo * 60_000).toISOString(),
      leaseExpiresAt: new Date(NOW.getTime() - 60_000).toISOString(),
    }).run();
    lease("old", 20, 15); // acquired before the 10-minute window: presumed spend outside it
    lease("recent", 3, 5); // acquired inside the window: presumed spend inside it
    // Settled before it expired: admission counts the cost row only, not the lease too.
    lease("settled", 4, 5);
    handle.db.insert(costLog).values({
      jobId: "other", runGeneration: 0, attemptId: "settled", step: "bull", model: "claude-opus-5-5",
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 0,
      costUsd: 1, fallbackUsed: false, createdAt: new Date(NOW.getTime() - 4 * 60_000).toISOString(),
    }).run();
    // Window spend is $1 settled + $3 presumed; $21 is left, so $21 fits and $21.000001 does not.
    expect(paidReservationCapRefusal("job", 21.000001, window, NOW, handle.db)).toMatchObject({
      cap: "rolling", settledUsd: 4, reservedUsd: 0, headroomUsd: 21,
    });
    expect(paidReservationCapRefusal("job", 21, window, NOW, handle.db)).toBeNull();
    expect(acquirePaidPassLease(claim, "bear", "a1", 21, NOW, window, handle.db).acquired).toBe(true);
  });

  it("never refuses a zero reservation, even under a zero cap", () => {
    seedJob("job", 0);
    expect(paidReservationCapRefusal("job", 0, { ...LIMITS, maxRollingCostUsd: 0 }, NOW, handle.db)).toBeNull();
  });
});

describe("the refusal disclosure", () => {
  const judge = { pass: "synthesize" as const, kind: "judge-section" as const, model: "claude-sonnet-5-5", reservationUsd: 5.28 };

  it("names the pass, the model, the reservation, the blocking cap and the minimum cap", () => {
    const reason = paidBudgetRefusalReason(judge, {
      cap: "job", capUsd: 3, settledUsd: 0, reservedUsd: 0, headroomUsd: 3, minimumCapUsd: 5.28,
      recordedJobCapUsd: 3, configuredJobCapUsd: 3, rollingWindowMs: LIMITS.rollingCostWindowMs,
    });
    expect(reason).toContain("synthesize (judge)");
    expect(reason).toContain("claude-sonnet-5-5");
    expect(reason).toContain("$5.28");
    expect(reason).toContain("per-job cost cap");
    expect(reason).toContain("$3.00");
    expect(reason).toMatch(/at least \$5\.28/);
    expect(reason).toContain("plus whatever");
    // The cap a job was created with is kept on Retry (D-120).
    expect(reason).toContain("start a new report");
    expect(reason).toContain("this is a data-only report");
  });

  it("states what the job has already spent on a resumed run", () => {
    const reason = paidBudgetRefusalReason(
      { pass: "bear", kind: "research", model: "claude-haiku-4-5", reservationUsd: 2.9 },
      { cap: "job", capUsd: 3, settledUsd: 0.44, reservedUsd: 0, headroomUsd: 2.56, minimumCapUsd: 3.34,
        recordedJobCapUsd: null, configuredJobCapUsd: 3, rollingWindowMs: LIMITS.rollingCostWindowMs },
    );
    expect(reason).toContain("bear analyst's web-research request");
    expect(reason).toMatch(/at least \$3\.34/);
    expect(reason).toContain("$0.44 this job has already spent");
    // No recorded cap: raising the setting does lift this job's cap.
    expect(reason).not.toContain("start a new report");
    expect(reason).toContain("METIS_MAX_JOB_COST_USD");
  });

  it("describes rolling-cap headroom", () => {
    const reason = paidBudgetRefusalReason(judge, {
      cap: "rolling", capUsd: 25, settledUsd: 20, reservedUsd: 2, headroomUsd: 3, minimumCapUsd: 27.28,
      recordedJobCapUsd: null, configuredJobCapUsd: null, rollingWindowMs: LIMITS.rollingCostWindowMs,
    });
    expect(reason).toContain("rolling cost cap");
    expect(reason).toContain("METIS_MAX_ROLLING_COST_USD");
    expect(reason).toContain("$3.00 of the $25.00");
    expect(reason).toContain("$20.00");
    expect(reason).toContain("$2.00");
    expect(reason).toMatch(/at least \$27\.28/);
  });

  const jobRefusal = (over: Partial<PaidCapRefusal> = {}): PaidCapRefusal => ({
    cap: "job", capUsd: 1, settledUsd: 0, reservedUsd: 0, headroomUsd: 1, minimumCapUsd: 2,
    recordedJobCapUsd: null, configuredJobCapUsd: 1, rollingWindowMs: LIMITS.rollingCostWindowMs, ...over,
  });

  it("names every kind of reservation in words, by reservation mode", () => {
    const of = (pass: PlannedReservation["pass"], kind: PlannedReservation["kind"]) =>
      paidBudgetRefusalReason({ pass, kind, model: "claude-haiku-4-5", reservationUsd: 2 }, jobRefusal());
    expect(of("bull", "writing")).toContain("the bull analyst's writing request");
    expect(of("bear", "pass-admission")).toContain("the bear analyst pass on");
    expect(of("synthesize", "pass-admission")).toContain("the synthesize (judge) pass on");
    expect(of("verify", "verify")).toContain("the verify pass on");
    setEnv("METIS_RESERVATION_MODE", "pass");
    expect(of("bull", "pass-admission")).toContain("the bull analyst pass (pass reservation mode reserves every request the pass could make)");
    expect(of("synthesize", "pass-admission")).toContain("the synthesize (judge) pass (pass reservation mode reserves every request the pass could make)");
  });

  it("names the job cap's source and counts the job's requests in flight", () => {
    const recordedOnly = paidBudgetRefusalReason(judge, jobRefusal({
      capUsd: 3, recordedJobCapUsd: 3, configuredJobCapUsd: null, reservedUsd: 0.5, minimumCapUsd: 5.78,
    }));
    expect(recordedOnly).toContain("$3.00 (recorded when this job was created)");
    expect(recordedOnly).toContain("$0.50 reserved by its requests in flight");
    expect(recordedOnly).toContain("start a new report");
    // A recorded cap above what is needed: raising the setting is enough.
    const configuredBinds = paidBudgetRefusalReason(judge, jobRefusal({
      capUsd: 3, recordedJobCapUsd: 30, configuredJobCapUsd: 3, minimumCapUsd: 5.28,
    }));
    expect(configuredBinds).toContain("the lower of the $30.00 recorded when this job was created and the $3.00 set in METIS_MAX_JOB_COST_USD now");
    expect(configuredBinds).not.toContain("start a new report");
  });

  it("prints exact micro-dollar amounts", () => {
    const reason = paidBudgetRefusalReason(
      { pass: "verify", kind: "verify", model: "claude-haiku-4-5", reservationUsd: 0.035 },
      jobRefusal({ capUsd: 0.000001, settledUsd: 0.000001, headroomUsd: 0, minimumCapUsd: 0.035001 }),
    );
    expect(reason).toContain("$0.035");
    expect(reason).toContain("$0.035001");
    expect(reason).toContain("$0.000001");
  });
});

describe("the plan's remaining edges", () => {
  const billableVerify = { billable: true, maxInputTokens: 12_000, maxOutputTokens: 4_000, maxWebSearches: 0 } as const;

  it("prices a billable verify adapter's lease and request, and leaves an undeclared one to the verify boundary", () => {
    const planned = plannedPaidReservations("claude-haiku-4-5", { analysts: [], synthesize: false, verify: true }, billableVerify);
    expect(planned.map((entry) => [entry.kind, entry.reservationUsd])).toEqual([["pass-admission", 0.035], ["verify", 0.035]]);
    expect(largestPlannedReservation(planned)).toMatchObject({ kind: "verify" });
    expect(plannedPaidReservations("claude-haiku-4-5", { analysts: [], synthesize: false, verify: true })).toEqual([]);
  });

  it("breaks ties toward a request over the pass lease that equals it, then toward the earlier entry", () => {
    const lease: PlannedReservation = { pass: "bull", kind: "pass-admission", model: "m", reservationUsd: 2 };
    const research: PlannedReservation = { pass: "bull", kind: "research", model: "m", reservationUsd: 2 };
    const judgeEqual: PlannedReservation = { pass: "synthesize", kind: "judge-section", model: "m", reservationUsd: 2 };
    expect(largestPlannedReservation([lease, research, judgeEqual])).toBe(research);
    expect(largestPlannedReservation([research, lease])).toBe(research);
    expect(largestPlannedReservation([{ ...lease, reservationUsd: 0 }])).toBeNull();
  });
});

describe("the documented minimum caps (docs/CLAUDE-USAGE.md)", () => {
  const usage = readFileSync(path.join(process.cwd(), "docs", "CLAUDE-USAGE.md"), "utf8");
  const section = usage.slice(usage.indexOf("### Worst-case reservations and the smallest workable cap"));
  const money = (value: number): string => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  it("states the registry snapshot the figures were computed from", () => {
    expect(section).toContain(`registry snapshot ${MODEL_REGISTRY.snapshotDate}`);
  });

  it("matches the request-mode reservations the planner computes for every active model", () => {
    for (const model of MODEL_REGISTRY.models.filter((entry) => entry.lifecycle === "active")) {
      const planned = plannedPaidReservations(model.id, ALL_REMAINING, DETERMINISTIC_VERIFY);
      const of = (kind: string) => planned.find((entry) => entry.kind === kind)!;
      const judge = of("judge-section");
      const judgeCell = judge.model === model.id
        ? money(judge.reservationUsd)
        : `${money(judge.reservationUsd)} (on ${MODEL_REGISTRY.models.find((entry) => entry.id === judge.model)!.displayName})`;
      const row = `| ${model.displayName} | ${money(of("research").reservationUsd)} | ${money(of("writing").reservationUsd)} | ${judgeCell} | ${money(largestPlannedReservation(planned)!.reservationUsd)} |`;
      expect(section, model.id).toContain(row);
    }
  });

  it("matches the pass-mode synthesize reservations it quotes", () => {
    setEnv("METIS_RESERVATION_MODE", "pass");
    for (const [model, figure] of [
      ["claude-sonnet-5-5", "$1,140.48"], ["claude-haiku-4-5", "$1,140.48"], ["claude-opus-5-5", "$2,280.96"],
      ["claude-opus-4-8", "$2,851.20"], ["claude-fable-5-1", "$8,553.60"],
    ] as const) {
      const largest = largestPlannedReservation(plannedPaidReservations(model, ALL_REMAINING, DETERMINISTIC_VERIFY))!;
      expect(largest.pass, model).toBe("synthesize");
      expect(money(largest.reservationUsd), model).toBe(figure);
      expect(section).toContain(figure);
    }
    expect(money(maximumPassCostUsd("claude-haiku-4-5", "bull"))).toBe("$107.82");
    expect(money(maximumPassCostUsd("claude-sonnet-5-5", "bull"))).toBe("$971.64");
  });
});
