import { describe, expect, it } from "vitest";

import {
  createEvaluationSnapshot,
  evaluateReportSnapshot,
  verifyEvaluationSnapshot,
} from "@/report/evaluation";

const issuer = { scheme: "cik", id: "0000000123", symbol: "TEST" };
const report = {
  meta: {
    symbol: "TEST", generatedAt: "2025-01-15T12:00:00.000Z",
    specVersion: "1.10.0", pipelineVersion: "test-pipeline",
  },
  projections: {
    weightsVersion: "unbacktested-test", notApplicableReason: null,
    series: [{
      metric: "revenue", unit: "USD",
      base: [{ period: "FY2025", periodStart: "2025-01-01", periodEnd: "2025-12-31", value: {
        value: 120, unit: "USD", asOf: "2024-12-31", source: "computed.projections.revenue.base",
      } }],
    }],
  },
  scenarioTargets: { targets: [{ name: "base", perShare: { value: 150 } }] },
};
const definition = {
  schemaVersion: 1,
  issuer,
  identitySource: "Local filing: CIK 0000000123 belongs to TEST",
  asOf: "2025-01-15",
  methodVersion: "pipeline-at-report-generation",
  operating: [{
    id: "revenue-fy2025-base", metric: "revenue", scenario: "base", periodLabel: "FY2025",
    periodStart: "2025-01-01", periodEnd: "2025-12-31",
    unit: "USD", currency: "USD", basis: "US-GAAP-consolidated-as-reported",
  }],
  market: [{
    id: "one-year-return", startDate: "2025-01-16", endDate: "2026-01-16",
    securityId: "isin:US0000000001", benchmarkId: "index:test-market",
    currency: "USD", basis: "split-adjusted-price",
  }],
};
const operatingOutcome = {
  kind: "operating", id: "revenue-fy2025-base", issuer, metric: "revenue",
  periodStart: "2025-01-01", periodEnd: "2025-12-31",
  unit: "USD", currency: "USD", basis: "US-GAAP-consolidated-as-reported",
  value: 100, availableDate: "2026-02-15", source: "local audited annual statement",
};
const marketOutcome = {
  kind: "market", id: "one-year-return", issuer,
  availableDate: "2026-01-16", source: "local price export",
  security: {
    id: "isin:US0000000001", startDate: "2025-01-16", endDate: "2026-01-16",
    currency: "USD", basis: "split-adjusted-price", startValue: 100, endValue: 110,
  },
  benchmark: {
    id: "index:test-market", startDate: "2025-01-16", endDate: "2026-01-16",
    currency: "USD", basis: "split-adjusted-price", startValue: 200, endValue: 210,
  },
};

function snapshot() {
  return createEvaluationSnapshot(report, definition, "2025-01-15T12:00:00.000Z");
}

describe("immutable evaluation snapshots", () => {
  it.each([
    ["12M ending 2026-06-30", "computed.projections.revenue.base"],
    ["12M ending 2026-06-30", "payload.computed.projections.revenue.base.12m-ending-2026-06-30"],
    ["FY2026 ending 2026-06-30", "computed.projections.revenue.base"],
    ["FY2026 ending 2026-06-30", "payload.computed.projections.revenue.base.fy2026-ending-2026-06-30"],
  ])("freezes exact annual periods with canonical provenance: %s / %s", (label, source) => {
    const input = structuredClone(report);
    Object.assign(input.projections.series[0].base[0], {
      period: label, periodStart: "2025-07-01", periodEnd: "2026-06-30",
    });
    input.projections.series[0].base[0].value.source = source;
    const selection = { ...definition.operating[0], periodLabel: label, periodStart: "2025-07-01", periodEnd: "2026-06-30" };
    const frozen = createEvaluationSnapshot(input, { ...definition, operating: [selection], market: [] });
    expect(frozen.operatingForecasts[0].periodExclusionReason).toBeNull();
    expect(frozen.operatingForecasts[0].sourcePeriodEnd).toBe("2026-06-30");
    expect(() => createEvaluationSnapshot(input, { ...definition, operating: [{ ...selection, periodEnd: "2026-12-31" }], market: [] })).toThrow(/annual|period|year/i);
    expect(() => createEvaluationSnapshot(input, { ...definition, operating: [{ ...selection, periodStart: "2025-07-02", periodEnd: "2026-07-01" }], market: [] })).toThrow(/annual|period|year/i);
  });

  it("preserves the report, versions and selected forecast without retaining mutable references", () => {
    const input = structuredClone(report);
    const frozen = createEvaluationSnapshot(input, definition, "2025-01-15T12:00:00.000Z");
    input.projections.series[0].base[0].value.value = 999;
    expect(frozen.operatingForecasts[0].forecastValue).toBe(120);
    expect(frozen.report).toEqual(report);
    expect(frozen.reportSpecVersion).toBe("1.10.0");
    expect(frozen.pipelineVersion).toBe("test-pipeline");
    expect(frozen.reportHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyEvaluationSnapshot(frozen).snapshotHash).toBe(frozen.snapshotHash);
  });

  it("hashes object key order identically, but detects edits to report, policy, or dates", () => {
    const original = snapshot();
    const reordered = { scenarioTargets: report.scenarioTargets, projections: report.projections, meta: report.meta };
    expect(createEvaluationSnapshot(reordered, definition, original.frozenAt).snapshotHash).toBe(original.snapshotHash);
    for (const field of ["reportHash", "policyVersion", "frozenAt"] as const) {
      expect(() => verifyEvaluationSnapshot({ ...original, [field]: "modified" })).toThrow();
    }
    const altered = structuredClone(original);
    altered.operatingForecasts[0].forecastValue = 130;
    expect(() => verifyEvaluationSnapshot(altered)).toThrow(/hash|integrity/i);
  });

  it("requires unambiguous identity, explicit dates and a forward operating forecast", () => {
    expect(() => createEvaluationSnapshot(report, { ...definition, issuer: { ...issuer, symbol: "OTHER" } })).toThrow(/issuer|symbol/i);
    expect(() => createEvaluationSnapshot(report, { ...definition, asOf: "2025-02-30" })).toThrow();
    expect(() => createEvaluationSnapshot(report, { ...definition, asOf: "2025-01-14" })).toThrow(/generated|as.of/i);
    const dcf = { ...definition, operating: [{ ...definition.operating[0], metric: "price" }] };
    expect(() => createEvaluationSnapshot(report, dcf)).toThrow();
    const historical = { ...definition, operating: [{ ...definition.operating[0], scenario: "historical" }] };
    expect(() => createEvaluationSnapshot(report, historical)).toThrow();
    expect(() => createEvaluationSnapshot(report, { ...definition, operating: [definition.operating[0], definition.operating[0]] })).toThrow(/duplicate/i);
  });

  it("refuses to invent a currency or relabel the report's forecast unit", () => {
    expect(() => createEvaluationSnapshot(report, { ...definition, operating: [{ ...definition.operating[0], currency: "EUR" }] })).toThrow(/currency/i);
    expect(() => createEvaluationSnapshot(report, { ...definition, operating: [{ ...definition.operating[0], unit: "USD millions" }] })).toThrow(/unit/i);
    const unknown = structuredClone(report);
    unknown.projections.series[0].unit = "currency";
    unknown.projections.series[0].base[0].value.unit = "currency";
    expect(() => createEvaluationSnapshot(unknown, { ...definition, operating: [{ ...definition.operating[0], unit: "currency" }] })).toThrow(/currency/i);
  });

  it("does not let a later cutoff make an old report look registered on its generation date", () => {
    expect(() => createEvaluationSnapshot(report, { ...definition, asOf: "2025-01-16", market: [] }, "2025-01-16T12:00:00.000Z"))
      .toThrow(/generated|as.of/i);
    expect(() => createEvaluationSnapshot(report, definition, "2099-01-15T12:00:00.000Z"))
      .toThrow(/future/i);
  });

  it("requires FCFF and an explicit EPS share basis rather than accepting differently defined cash flow or earnings", () => {
    const fcf = structuredClone(report);
    fcf.projections.series[0].metric = "fcf";
    fcf.projections.series[0].base[0].value.source = "computed.projections.fcf.base";
    const selected = { ...definition.operating[0], metric: "fcf", basis: "CFO-minus-capex" };
    expect(() => createEvaluationSnapshot(fcf, { ...definition, operating: [selected] })).toThrow(/FCFF/);
    expect(createEvaluationSnapshot(fcf, { ...definition, operating: [{ ...selected, basis: "unlevered-FCFF" }] }).operatingForecasts[0].forecastValue).toBe(120);
    const eps = structuredClone(report);
    eps.projections.series[0].metric = "epsDiluted";
    eps.projections.series[0].unit = "USD/share";
    Object.assign(eps.projections.series[0].base[0].value, { unit: "USD/share", source: "computed.projections.epsDiluted.base" });
    const epsSelected = { ...selected, metric: "epsDiluted", unit: "USD/share", basis: "diluted-EPS" };
    expect(() => createEvaluationSnapshot(eps, { ...definition, operating: [epsSelected] })).toThrow(/share basis/i);
    expect(createEvaluationSnapshot(eps, { ...definition, operating: [{ ...epsSelected, basis: "diluted-EPS;share-basis=2025-01-15" }] }).operatingForecasts[0].forecastValue).toBe(120);
  });

  it("does not infer a forward forecast from duplicated, suppressed or future-dated source values", () => {
    const duplicate = structuredClone(report);
    duplicate.projections.series.push(duplicate.projections.series[0]);
    expect(() => createEvaluationSnapshot(duplicate, definition)).toThrow(/ambiguous/i);
    const futureSource = structuredClone(report);
    futureSource.projections.series[0].base[0].value.asOf = "2025-01-16";
    expect(() => createEvaluationSnapshot(futureSource, definition)).toThrow(/as.of/i);
    expect(() => createEvaluationSnapshot({ ...report, projections: { ...report.projections, notApplicableReason: "unsupported route" } }, definition)).toThrow(/suppressed/i);
  });

  it.each([
    ["2025-10-01", "2025-12-31"],
    ["2035-01-01", "2035-12-31"],
    ["2024-01-01", "2025-12-31"],
  ])("cannot rebind an annual FY2025 forecast to %s through %s", (periodStart, periodEnd) => {
    expect(() => createEvaluationSnapshot(report, { ...definition, operating: [{ ...definition.operating[0], periodStart, periodEnd }] }))
      .toThrow(/annual|fiscal|year/i);
  });

  it.each([
    ["2024-12-29", "2025-12-27"],
    ["2024-12-22", "2025-12-27"],
  ])("accepts an explicitly supplied 52/53-week annual period %s through %s", (periodStart, periodEnd) => {
    const datedReport = structuredClone(report);
    Object.assign(datedReport.projections.series[0].base[0], { periodStart, periodEnd });
    expect(createEvaluationSnapshot(datedReport, { ...definition, operating: [{ ...definition.operating[0], periodStart, periodEnd }] }).operatingForecasts[0].periodEnd).toBe(periodEnd);
  });
});

describe("operating forecast evaluation", () => {
  it("accepts exact AI-bound projection provenance and rejects another metric, scenario or period", () => {
    const ai = structuredClone(report);
    ai.projections.series[0].base[0].value.source = "payload.computed.projections.revenue.base.fy2025";
    expect(createEvaluationSnapshot(ai, definition).operatingForecasts[0].forecastValue).toBe(120);
    for (const source of ["payload.computed.projections.fcf.base.fy2025", "payload.computed.projections.revenue.bull.fy2025", "payload.computed.projections.revenue.base.fy2026"]) {
      ai.projections.series[0].base[0].value.source = source;
      expect(() => createEvaluationSnapshot(ai, definition)).toThrow(/deterministic forward projection/i);
    }
  });

  it.each(["missing", "partial", "invalid"])("excludes %s saved forecast dates even if the operator supplies plausible annual dates", (mode) => {
    const legacy = structuredClone(report);
    const point = legacy.projections.series[0].base[0];
    if (mode !== "invalid") Reflect.deleteProperty(point, "periodStart");
    if (mode === "missing") Reflect.deleteProperty(point, "periodEnd");
    if (mode === "invalid") point.periodStart = "2025-02-30";
    const frozen = createEvaluationSnapshot(legacy, definition, "2025-01-15T12:00:00.000Z");
    const result = evaluateReportSnapshot(frozen, { schemaVersion: 1, outcomes: [operatingOutcome] }, "2026-03-01");
    expect(result.operating[0]).toEqual({ id: "revenue-fy2025-base", status: "excluded", reasons: ["unverified-period"] });
    expect(result.operating[0]).not.toHaveProperty("absoluteError");
  });

  it("cannot compare a TTM-anchored forward year with a different fiscal year sharing its FY label", () => {
    const midyear = structuredClone(report);
    Object.assign(midyear.projections.series[0].base[0], { periodStart: "2024-07-01", periodEnd: "2025-06-30" });
    const wrong = createEvaluationSnapshot(midyear, definition, "2025-01-15T12:00:00.000Z");
    expect(evaluateReportSnapshot(wrong, { schemaVersion: 1, outcomes: [operatingOutcome] }, "2026-03-01").operating[0])
      .toEqual({ id: "revenue-fy2025-base", status: "excluded", reasons: ["forecast-period-mismatch"] });
    const exactDates = { periodStart: "2024-07-01", periodEnd: "2025-06-30" };
    const correct = createEvaluationSnapshot(midyear, { ...definition, operating: [{ ...definition.operating[0], ...exactDates }] }, "2025-01-15T12:00:00.000Z");
    const actual = { ...operatingOutcome, ...exactDates, availableDate: "2025-08-01" };
    expect(evaluateReportSnapshot(correct, { schemaVersion: 1, outcomes: [actual] }, "2026-03-01").operating[0])
      .toMatchObject({ status: "included", absoluteError: 20, ...exactDates });
  });

  it("computes forecast-minus-actual errors and keeps market returns separate", () => {
    const result = evaluateReportSnapshot(snapshot(), { schemaVersion: 1, outcomes: [operatingOutcome, marketOutcome] }, "2026-03-01");
    expect(result.operating[0]).toMatchObject({
      status: "included", forecastValue: 120, actualValue: 100,
      signedError: 20, absoluteError: 20, absolutePercentageError: 20,
    });
    expect(result.market[0].status).toBe("included");
    if (result.market[0].status !== "included") throw new Error("Expected included market observation");
    expect(result.market[0].securityReturnPct).toBeCloseTo(10);
    expect(result.market[0].benchmarkReturnPct).toBeCloseTo(5);
    expect(result.market[0].excessReturnPp).toBeCloseTo(5);
    expect(result.market[0]).not.toHaveProperty("forecastError");
    expect(result.counts).toEqual({ operatingIncluded: 1, operatingExcluded: 0, marketIncluded: 1, marketExcluded: 0 });
  });

  it.each([
    ["issuer-mismatch", { issuer: { ...issuer, id: "999" } }],
    ["metric-mismatch", { metric: "fcf" }],
    ["period-mismatch", { periodStart: "2025-04-01" }],
    ["unit-mismatch", { unit: "USD millions" }],
    ["currency-mismatch", { currency: "EUR" }],
    ["basis-mismatch", { basis: "non-GAAP-adjusted" }],
    ["outcome-not-yet-available", { availableDate: "2026-04-01" }],
    ["invalid-availability-date", { availableDate: "2025-11-30" }],
    ["invalid-outcome", { value: null }],
    ["invalid-outcome", { value: Number.POSITIVE_INFINITY }],
  ])("excludes %s rather than manufacturing accuracy", (reason, patch) => {
    const result = evaluateReportSnapshot(snapshot(), { schemaVersion: 1, outcomes: [{ ...operatingOutcome, ...patch }] }, "2026-03-01");
    expect(result.operating[0]).toMatchObject({ status: "excluded", reasons: expect.arrayContaining([reason]) });
    expect(result.operating[0]).not.toHaveProperty("absoluteError");
  });

  it("excludes immature, missing and ambiguous duplicate outcomes", () => {
    expect(evaluateReportSnapshot(snapshot(), { schemaVersion: 1, outcomes: [operatingOutcome] }, "2025-06-01").operating[0])
      .toMatchObject({ status: "excluded", reasons: expect.arrayContaining(["horizon-not-matured"]) });
    expect(evaluateReportSnapshot(snapshot(), { schemaVersion: 1, outcomes: [] }, "2026-03-01").operating[0])
      .toMatchObject({ status: "excluded", reasons: ["missing-outcome"] });
    expect(evaluateReportSnapshot(snapshot(), { schemaVersion: 1, outcomes: [operatingOutcome, operatingOutcome] }, "2026-03-01").operating[0])
      .toMatchObject({ status: "excluded", reasons: ["duplicate-outcome"] });
  });

  it("keeps an actual zero valid while withholding percentage error", () => {
    const result = evaluateReportSnapshot(snapshot(), { schemaVersion: 1, outcomes: [{ ...operatingOutcome, value: 0 }] }, "2026-03-01");
    expect(result.operating[0]).toMatchObject({ status: "included", actualValue: 0, absoluteError: 120, absolutePercentageError: null });
  });

  it("excludes arithmetic overflow even when individual inputs are finite", () => {
    const huge = structuredClone(report);
    huge.projections.series[0].base[0].value.value = 1e308;
    const frozen = createEvaluationSnapshot(huge, definition, "2025-01-15T12:00:00.000Z");
    const result = evaluateReportSnapshot(frozen, { schemaVersion: 1, outcomes: [{ ...operatingOutcome, value: -1e308 }] }, "2026-03-01");
    expect(result.operating[0]).toMatchObject({ status: "excluded", reasons: ["non-finite-result"] });
  });

  it("rejects an evaluation date in the future", () => {
    expect(() => evaluateReportSnapshot(snapshot(), { schemaVersion: 1, outcomes: [] }, "2099-01-01")).toThrow(/future/i);
  });

  it("labels retrospective registration and reports unused malformed/unmatched outcomes", () => {
    const lateSnapshot = createEvaluationSnapshot(report, definition, "2026-03-01T00:00:00.000Z");
    const result = evaluateReportSnapshot(lateSnapshot, { schemaVersion: 1, outcomes: [null, { ...operatingOutcome, id: "unregistered" }] }, "2026-03-02");
    expect(result.registration).toBe("retrospective-snapshot");
    expect(result.unmatchedOutcomes).toEqual([
      { index: 0, id: null, reason: "missing-outcome-id" },
      { index: 1, id: "unregistered", reason: "unregistered-outcome" },
    ]);
    expect(result.outcomesHash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("benchmark-relative realized return eligibility", () => {
  it.each([
    ["security-mismatch", { id: "different-share-class" }],
    ["period-mismatch", { endDate: "2026-01-15" }],
    ["currency-mismatch", { currency: "EUR" }],
    ["basis-mismatch", { basis: "total-return-index" }],
    ["invalid-market-level", { startValue: 0 }],
    ["invalid-market-level", { endValue: -1 }],
  ])("excludes %s", (reason, patch) => {
    const result = evaluateReportSnapshot(snapshot(), { schemaVersion: 1, outcomes: [{ ...marketOutcome, security: { ...marketOutcome.security, ...patch } }] }, "2026-03-01");
    expect(result.market[0]).toMatchObject({ status: "excluded", reasons: expect.arrayContaining([reason]) });
  });

  it("requires the frozen benchmark and its independent currency/basis", () => {
    const result = evaluateReportSnapshot(snapshot(), { schemaVersion: 1, outcomes: [{
      ...marketOutcome, benchmark: { ...marketOutcome.benchmark, id: "other-index", currency: "EUR", basis: "total-return-index" },
    }] }, "2026-03-01");
    expect(result.market[0]).toMatchObject({ status: "excluded", reasons: expect.arrayContaining(["benchmark-mismatch", "currency-mismatch", "basis-mismatch"]) });
  });

  it("records a security ending at zero as a valid total loss", () => {
    const result = evaluateReportSnapshot(snapshot(), { schemaVersion: 1, outcomes: [{ ...marketOutcome, security: { ...marketOutcome.security, endValue: 0 } }] }, "2026-03-01");
    expect(result.market[0]).toMatchObject({ status: "included", securityReturnPct: -100, excessReturnPp: -105 });
  });
});
