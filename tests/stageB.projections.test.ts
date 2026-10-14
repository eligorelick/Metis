/**
 * Stage B — weighted forward projections (projections.ts).
 *
 * The key invariant: the BASE projection path IS the DCF's own forward path
 * (so the projection page can never contradict the valuation page). Also covers
 * scenario ordering (bull ≥ base ≥ bear), the probability-weighted blend, EPS
 * derivation + graceful skip, TracedNumber provenance, and route/degradation
 * not-applicable paths.
 */

import { describe, expect, it } from "vitest";

import {
  computeProjections,
  PROJECTION_WEIGHTS,
  PROJECTION_HORIZON_YEARS,
  PROJECTION_WEIGHTS_VERSION,
  scenarioDispersion,
  type ProjectionIncomeRow,
  type ProjectionsInputs,
} from "@/pipeline/stageB/projections";
import {
  buildDcfAssumptions,
  runDcf,
  type DcfAssumptions,
  type DcfResult,
  type ValuationResult,
} from "@/pipeline/stageB/valuation";
import type { CompanyRouteResult } from "@/pipeline/stageB/sectorRouting";
import type { SectorRoute } from "@/types/core";
import { createEvaluationSnapshot, evaluateReportSnapshot } from "@/report/evaluation";
import { computeScenarioTargets } from "@/pipeline/stageB/scenarioTargets";

/* ------------------------------------------------------------------------ *
 * Fixtures — a REAL DCF built from the production valuation functions.
 * ------------------------------------------------------------------------ */

function route(base: SectorRoute = "general"): CompanyRouteResult {
  return {
    base,
    overlays: [],
    evidence: { sector: null, industry: null },
    notes: [],
    gaps: [],
    asOf: { today: "2026-07-06", incomeTtm: null, incomeAnnual: null, cashflowTtm: null, cashflowAnnual: null },
  };
}

const INCOME_HISTORY = [
  { date: "2021-12-31", revenue: 700, ebit: 196, netIncome: 140, epsDiluted: 1.3 },
  { date: "2022-12-31", revenue: 780, ebit: 226, netIncome: 160, epsDiluted: 1.5 },
  { date: "2023-12-31", revenue: 850, ebit: 251, netIncome: 178, epsDiluted: 1.7 },
  { date: "2024-12-31", revenue: 920, ebit: 276, netIncome: 196, epsDiluted: 1.9 },
  { date: "2025-12-31", revenue: 1000, ebit: 300, netIncome: 214, epsDiluted: 2.1 },
];

function buildDcf(anchor = "2025-12-31"): { assumptions: DcfAssumptions; dcf: DcfResult } {
  const built = buildDcfAssumptions({
    revenueCagr3yPct: 12,
    revenueCagr5yPct: 12,
    analystEstimates: null,
    waccPct: 9,
    riskFreePct: 4,
    incomeTtm: { date: anchor, revenue: 1000, operatingIncome: 300, incomeBeforeTax: 280, incomeTaxExpense: 60 },
    incomeHistory: INCOME_HISTORY.map((r) => ({ date: r.date, revenue: r.revenue, operatingIncome: r.ebit, incomeBeforeTax: r.ebit - 20, incomeTaxExpense: (r.ebit - 20) * 0.21 })),
    balance: { date: anchor, basis: "annual", totalDebt: 200, totalStockholdersEquity: 800, cashAndShortTermInvestments: 300 },
    marketCap: 5000,
  });
  expect(built.assumptions).not.toBeNull();
  const assumptions = built.assumptions as DcfAssumptions;
  const dcf = runDcf(assumptions, { waccPct: 9, netDebt: -100, dilutedShares: 100 });
  return { assumptions, dcf };
}

function dcfValuation(anchor = "2025-12-31"): ValuationResult {
  const { assumptions, dcf } = buildDcf(anchor);
  return {
    kind: "dcf",
    route: "general",
    assumptions,
    dcf,
    sensitivity: null,
    reverseDcf: null,
    multiples: { multiples: [], enterpriseValue: { value: null, excludingLeases: null, includingLeases: null, leaseLiability: null, includeLeases: false, basis: "test" }, sectorAppropriate: [], asOf: { quote: null, statements: null }, notes: [], gaps: [] },
    notes: [],
    gaps: [],
  };
}

function makeInputs(over: Partial<ProjectionsInputs> = {}): ProjectionsInputs {
  return {
    route: route(),
    valuation: dcfValuation(),
    waccPct: 9,
    dilutedShares: 100,
    incomeHistory: INCOME_HISTORY,
    fcfHistory: [
      { date: "2023-12-31", fcf: 150 },
      { date: "2024-12-31", fcf: 170 },
      { date: "2025-12-31", fcf: 190 },
    ],
    shareCountAnnualizedPct: -2,
    currency: "USD",
    asOf: "2026-07-06",
    ...over,
  };
}

const byMetric = (p: ReturnType<typeof computeProjections>, m: string) => p.series.find((s) => s.metric === m)!;

/* ------------------------------------------------------------------------ */

describe("projections — structure", () => {
  it("evaluates a newly generated modeled period only against that exact published window", () => {
    const inputs = makeInputs({ asOf: "2024-07-06", valuation: dcfValuation("2024-03-31") });
    const generated = { meta: { symbol: "TEST", generatedAt: "2024-07-06T12:00:00.000Z", specVersion: "1.11.0", pipelineVersion: "test" }, projections: computeProjections(inputs) };
    const issuer = { scheme: "cik", id: "123", symbol: "TEST" };
    const definition = { schemaVersion: 1, issuer, identitySource: "test issuer", asOf: "2024-07-06", methodVersion: "test", market: [], operating: [{
      id: "revenue-year1", metric: "revenue", scenario: "base", periodLabel: "12M ending 2025-03-31", periodStart: "2024-04-01", periodEnd: "2025-03-31", unit: "USD", currency: "USD", basis: "consolidated-revenue",
    }] };
    const frozen = createEvaluationSnapshot(generated, definition, "2024-07-06T12:00:00.000Z");
    const actual = { schemaVersion: 1, outcomes: [{ kind: "operating", id: "revenue-year1", issuer, metric: "revenue", periodStart: "2024-04-01", periodEnd: "2025-03-31", unit: "USD", currency: "USD", basis: "consolidated-revenue", value: 1000, availableDate: "2025-05-01", source: "test exact-window actuals" }] };
    expect(evaluateReportSnapshot(frozen, actual, "2025-06-01").operating[0]).toMatchObject({ status: "included", forecastValue: 1120, signedError: 120 });
  });

  it("saves annual model windows after the actual TTM anchor rather than guessing fiscal-year dates", () => {
    const inputs = makeInputs({ valuation: dcfValuation("2025-03-31") });
    const p = computeProjections(inputs);
    for (const series of p.series) {
      for (const scenario of ["base", "bull", "bear", "weighted"] as const) {
        expect(series[scenario][0]).toMatchObject({ period: "12M ending 2026-03-31", periodStart: "2025-04-01", periodEnd: "2026-03-31", periodBasis: "rolling-12-month" });
        expect(series[scenario][1]).toMatchObject({ period: "12M ending 2027-03-31", periodStart: "2026-04-01", periodEnd: "2027-03-31", periodBasis: "rolling-12-month" });
      }
    }
    expect(byMetric(p, "revenue").assumptions.some(line => /12.month.*fiscal/i.test(line))).toBe(true);
  });

  it("clamps a leap-day anchor to February end without gaps between modeled years", () => {
    const inputs = makeInputs({ valuation: dcfValuation("2024-02-29") });
    const rows = byMetric(computeProjections(inputs), "revenue").base;
    expect(rows[0]).toMatchObject({ periodStart: "2024-03-01", periodEnd: "2025-02-28" });
    expect(rows[1]).toMatchObject({ periodStart: "2025-03-01", periodEnd: "2026-02-28" });
    expect(rows[3]).toMatchObject({ periodStart: "2027-03-01", periodEnd: "2028-02-29" });
  });

  it.each([null, "2025-02-30", "2027-03-31"])("withholds period metadata for an unavailable/invalid/future TTM anchor %s", (anchor) => {
    const inputs = makeInputs();
    if (inputs.valuation.kind !== "dcf" || !inputs.valuation.assumptions) throw new Error("Expected DCF fixture");
    inputs.valuation.assumptions.asOf.statements = anchor;
    if (anchor === null) delete inputs.valuation.assumptions.forecastPeriod;
    else inputs.valuation.assumptions.forecastPeriod!.anchorEndDate = anchor;
    inputs.valuation.dcf = runDcf(inputs.valuation.assumptions, { waccPct: 9, netDebt: -100, dilutedShares: 100 });
    const p = computeProjections(inputs);
    const row = byMetric(p, "revenue").base[0];
    expect(row).not.toHaveProperty("periodStart");
    expect(row).not.toHaveProperty("periodEnd");
    expect(byMetric(p, "revenue").disclosures.some(d => d.field === "projections.period" && /unverified/i.test(d.reason))).toBe(true);
  });

  it("withholds stale DCF period metadata when the statement anchor changes without rebuilding the model", () => {
    const inputs = makeInputs();
    if (inputs.valuation.kind !== "dcf" || !inputs.valuation.assumptions) throw new Error("Expected DCF fixture");
    inputs.valuation.assumptions.asOf.statements = "2025-03-31";
    const point = byMetric(computeProjections(inputs), "revenue").base[0];
    expect(point.period).toBe("Y+1 (period basis unavailable)");
    expect(point).not.toHaveProperty("periodStart");
    expect(point).not.toHaveProperty("periodEnd");
  });

  it("produces revenue, operatingMargin, fcf, epsDiluted series over the horizon", () => {
    const p = computeProjections(makeInputs());
    expect(p.notApplicableReason).toBeNull();
    expect(p.horizonYears).toBe(PROJECTION_HORIZON_YEARS);
    expect(p.weightsVersion).toBe(PROJECTION_WEIGHTS_VERSION);
    expect(p.series.map((s) => s.metric).sort()).toEqual(["epsDiluted", "fcf", "operatingMargin", "revenue"]);
    for (const s of p.series) {
      expect(s.base.length).toBe(PROJECTION_HORIZON_YEARS);
      expect(s.bull.length).toBe(PROJECTION_HORIZON_YEARS);
      expect(s.bear.length).toBe(PROJECTION_HORIZON_YEARS);
      expect(s.weighted.length).toBe(PROJECTION_HORIZON_YEARS);
    }
  });

  it("forward numbers are TracedNumbers sourced under computed.projections.*", () => {
    const rev = byMetric(computeProjections(makeInputs()), "revenue");
    const pt = rev.weighted[0];
    expect(pt.value.source).toBe("computed.projections.revenue.weighted");
    expect(pt.value.verified).toBe(true);
    expect(pt.value.unit).toBe("USD");
    expect(pt.period).toBe("12M ending 2026-12-31");
    expect(pt.periodStart).toBe("2026-01-01");
    expect(pt.periodEnd).toBe("2026-12-31");
  });
});

describe("projections — DCF consistency (the load-bearing invariant)", () => {
  it("the base path equals the DCF's own forward path", () => {
    const { dcf } = buildDcf();
    const p = computeProjections(makeInputs());
    const rev = byMetric(p, "revenue");
    for (let i = 0; i < PROJECTION_HORIZON_YEARS; i++) {
      expect(rev.base[i].value.value).toBeCloseTo(Math.round(dcf.yearRows[i].revenue * 100) / 100, 2);
    }
    const margin = byMetric(p, "operatingMargin");
    for (let i = 0; i < PROJECTION_HORIZON_YEARS; i++) {
      expect(margin.base[i].value.value).toBeCloseTo(Math.round(dcf.yearRows[i].ebitMarginPct * 100) / 100, 2);
    }
  });
});

describe("projections — scenarios", () => {
  it("keeps the fan and targets on the same zero margin shock when growth dispersion rounds to zero", () => {
    const dates = ["2020-12-31", "2021-12-31", "2022-12-31", "2023-12-31", "2024-12-31"];
    let revenue = 100;
    const incomeHistory = dates.map((date, i) => {
      if (i > 0) {
        const years = (Date.parse(date) - Date.parse(dates[i - 1])) / 86_400_000 / 365.25;
        revenue *= Math.pow(1 + (10 + (i - 1) * 0.001) / 100, years);
      }
      return { date, revenue, ebit: revenue * (0.1 + i * 0.05), netIncome: revenue * 0.08, epsDiluted: 1 };
    });
    const measured = scenarioDispersion(incomeHistory);
    expect(measured.sigmaGrowth).toBeGreaterThan(0);
    expect(measured.sigmaGrowth).toBeLessThan(0.005);
    expect(measured.sigmaMargin).toBeGreaterThan(7);
    expect(measured.growthMarginCorrelation).toBeGreaterThan(0.99);

    const inputs = makeInputs({ incomeHistory });
    const targets = computeScenarioTargets({ ...inputs, currentPrice: 50 });
    expect(targets.status).toBe("available");
    expect(targets.dispersion?.growthMarginCorrelation).toBeNull();
    expect(targets.targets.every(target => target.marginDeltaPp === 0)).toBe(true);

    const projections = computeProjections(inputs);
    const margin = byMetric(projections, "operatingMargin");
    const values = (points: typeof margin.base) => points.map(point => point.value.value);
    expect(values(margin.bull)).toEqual(values(margin.base));
    expect(values(margin.bear)).toEqual(values(margin.base));
    expect(margin.disclosures.some(d => d.field === "projections.dispersion.degenerate")).toBe(true);
    // Suppressing an unmeasurable covariance must not alter the DCF base path.
    const unchangedBase = byMetric(computeProjections(makeInputs()), "operatingMargin").base;
    expect(values(margin.base)).toEqual(values(unchangedBase));
  });

  it("rejects nonconsecutive fiscal gaps from historical dispersion", () => {
    const consecutive = scenarioDispersion([
      { date: "2019-12-31", revenue: 100, ebit: 20, netIncome: null, epsDiluted: null },
      { date: "2020-12-31", revenue: 130, ebit: 25, netIncome: null, epsDiluted: null },
      { date: "2021-12-31", revenue: 135, ebit: 29, netIncome: null, epsDiluted: null },
      { date: "2022-12-31", revenue: 180, ebit: 36, netIncome: null, epsDiluted: null },
    ]);
    const gapped = scenarioDispersion([
      { date: "2019-12-31", revenue: 100, ebit: 20, netIncome: null, epsDiluted: null },
      { date: "2020-12-31", revenue: 130, ebit: 25, netIncome: null, epsDiluted: null },
      { date: "2024-12-31", revenue: 135, ebit: 29, netIncome: null, epsDiluted: null },
      { date: "2025-12-31", revenue: 180, ebit: 36, netIncome: null, epsDiluted: null },
    ]);
    // CONTRACT CHANGED 2026-08-31. `hasIrregularAnnualSpacing` returns true if
    // ANY adjacent interval anywhere in the history is off-annual, and that one
    // boolean used to null the ENTIRE sigma — discarding every good annual pair
    // because of a single gap, and suppressing the whole projections fan and
    // the scenario targets built on it. Off-annual pairs are now skipped
    // individually and the rest are used; the module's own 3-observation
    // minimum (stdev) still decides whether an estimate exists.
    expect(consecutive.growthDefaulted).toBe(false);
    expect(consecutive.irregularHistory).toBe(false);

    // This gapped history leaves only TWO annual steps (2019→2020, 2024→2025),
    // which is below the 3-observation minimum — so it still defaults, for a
    // statistical reason rather than a veto, and the skip is disclosed.
    expect(gapped.growthDefaulted).toBe(true);
    expect(gapped.irregularHistory).toBe(true);
  });

  it("keeps the annual steps that survive a single gap, instead of vetoing them all", () => {
    // Five consecutive years, then a four-year hole, then two more. Four annual
    // steps survive — comfortably above the minimum — so a dispersion IS
    // produced. Under the old whole-series veto this returned nothing at all.
    const withOneGap = scenarioDispersion([
      { date: "2015-12-31", revenue: 100, ebit: 20, netIncome: null, epsDiluted: null },
      { date: "2016-12-31", revenue: 120, ebit: 26, netIncome: null, epsDiluted: null },
      { date: "2017-12-31", revenue: 132, ebit: 27, netIncome: null, epsDiluted: null },
      { date: "2018-12-31", revenue: 160, ebit: 35, netIncome: null, epsDiluted: null },
      { date: "2019-12-31", revenue: 168, ebit: 36, netIncome: null, epsDiluted: null },
      { date: "2024-12-31", revenue: 200, ebit: 41, netIncome: null, epsDiluted: null },
      { date: "2025-12-31", revenue: 230, ebit: 49, netIncome: null, epsDiluted: null },
    ]);

    expect(withOneGap.growthDefaulted).toBe(false);
    expect(withOneGap.sigmaGrowth).not.toBeNull();
    // The excluded pair is still disclosed to the reader.
    expect(withOneGap.irregularHistory).toBe(true);
  });

  it("bull >= base >= bear for revenue and the weighted path is the documented blend", () => {
    const rev = byMetric(computeProjections(makeInputs()), "revenue");
    for (let i = 0; i < PROJECTION_HORIZON_YEARS; i++) {
      expect(rev.bull[i].value.value).toBeGreaterThanOrEqual(rev.base[i].value.value);
      expect(rev.base[i].value.value).toBeGreaterThanOrEqual(rev.bear[i].value.value);
      const blend =
        PROJECTION_WEIGHTS.bull * rev.bull[i].value.value +
        PROJECTION_WEIGHTS.base * rev.base[i].value.value +
        PROJECTION_WEIGHTS.bear * rev.bear[i].value.value;
      expect(rev.weighted[i].value.value).toBeCloseTo(Math.round(blend * 100) / 100, 1);
    }
  });

  it("thin revenue history suppresses the scenario fan instead of using a default", () => {
    const p = computeProjections(makeInputs({ incomeHistory: [{ date: "2025-12-31", revenue: 1000, ebit: 300, netIncome: 214, epsDiluted: 2.1 }] }));
    expect(p.series).toEqual([]);
    expect(p.notApplicableReason).toMatch(/four consecutive|suppressed/i);
  });

  it("suppresses the fan when margin dispersion cannot be measured", () => {
    // Revenue present every year (measurable growth σ) but EBIT only on the latest row.
    const hist = INCOME_HISTORY.map((r, i) => ({ ...r, ebit: i === INCOME_HISTORY.length - 1 ? r.ebit : null }));
    const p = computeProjections(makeInputs({ incomeHistory: hist }));
    expect(p.series).toEqual([]);
    expect(p.notApplicableReason).toMatch(/margin dispersion|suppressed/i);
  });

  it("the weighted path lies within the scenario range for EVERY metric (incl. the FCF crossover)", () => {
    const p = computeProjections(makeInputs());
    for (const s of p.series) {
      for (let i = 0; i < p.horizonYears; i++) {
        const lo = Math.min(s.bull[i].value.value, s.bear[i].value.value);
        const hi = Math.max(s.bull[i].value.value, s.bear[i].value.value);
        expect(s.weighted[i].value.value).toBeGreaterThanOrEqual(lo - 1e-6);
        expect(s.weighted[i].value.value).toBeLessThanOrEqual(hi + 1e-6);
      }
    }
    // FCF can legitimately invert near-term (bull reinvests more) — it's disclosed in the assumptions.
    const fcf = byMetric(p, "fcf");
    expect(fcf.assumptions.some((a) => /can cross/i.test(a))).toBe(true);
  });

  it("forward labels track the DCF's TTM base period (mid-year filer not mislabelled early)", () => {
    // TTM anchor stays explicitly rolling even when its date coincides with December.
    const rev = byMetric(computeProjections(makeInputs()), "revenue");
    expect(rev.base[0].period).toBe("12M ending 2026-12-31");
  });
});

describe("projections — EPS derivation", () => {
  it("derives EPS from the forward operating path over trended shares", () => {
    const eps = byMetric(computeProjections(makeInputs()), "epsDiluted");
    expect(eps.unit).toBe("USD/share");
    expect(eps.base.every((pt) => pt.value.value > 0)).toBe(true);
    // Buybacks (-2%/yr) lift EPS growth above net-income growth over time.
    expect(eps.base[4].value.value).toBeGreaterThan(eps.base[0].value.value);
  });

  it("skips EPS (no crash) when diluted shares are missing", () => {
    const p = computeProjections(makeInputs({ dilutedShares: null }));
    expect(p.series.some((s) => s.metric === "epsDiluted")).toBe(false);
    // The other three series still project.
    expect(p.series.length).toBe(3);
  });

  it("uses a disclosed flat-share base when the trend is missing and preserves zero trend", () => {
    const p = computeProjections(makeInputs({ shareCountAnnualizedPct: null }));
    const disclosures = p.series.flatMap((series) => series.disclosures);
    const revenue = byMetric(p, "revenue");

    expect(p.series.some((series) => series.metric === "epsDiluted")).toBe(true);
    expect(byMetric(p, "epsDiluted").capitalReturn?.appliedShareCountAnnualizedPct).toBe(0);
    expect(byMetric(p, "epsDiluted").shareTrend).toBeUndefined();
    expect(revenue.disclosures).toContainEqual(
      expect.objectContaining({
        field: "projections.eps.shareCountTrend",
        severity: "warn",
      }),
    );
    for (const series of p.series.filter((candidate) => candidate.metric !== "revenue")) {
      expect(series.disclosures.some((entry) => entry.field === "projections.eps.shareCountTrend")).toBe(false);
    }
    expect(
      disclosures.filter((entry) => entry.field === "projections.eps.shareCountTrend"),
    ).toHaveLength(1);
    expect(JSON.stringify(p)).not.toContain("0%/yr (buyback/dilution history)");

    const flatShares = computeProjections(makeInputs({ shareCountAnnualizedPct: 0 }));
    expect(flatShares.series.some((series) => series.metric === "epsDiluted")).toBe(true);
    expect(byMetric(flatShares, "epsDiluted").base).toEqual(
      byMetric(flatShares, "epsDiluted").flatShare?.base.map(pt => ({ ...pt,
        value: { ...pt.value, source: "computed.projections.epsDiluted.base" } })),
    );
  });
});

describe("projections — FCF basis change", () => {
  /**
   * The fcf series splices REPORTED LEVERED history (freeCashFlow, after
   * interest) onto UNLEVERED FCFF forecasts. The assumption text previously
   * asserted the whole series was FCFF, which is false for the historical half
   * and hides a level step at the seam that is a change of measure, not a
   * forecast of improvement.
   */
  it("labels the projected half FCFF and the historical half levered", () => {
    const fcf = byMetric(computeProjections(makeInputs()), "fcf");
    const assumptions = fcf.assumptions.join(" ");

    expect(assumptions).toMatch(/PROJECTED FCF is unlevered free cash flow \(FCFF\)/);
    expect(assumptions).toMatch(/HISTORICAL FCF[\s\S]*levered/i);
  });

  it("carries the basis change as a series disclosure when history exists", () => {
    const fcf = byMetric(computeProjections(makeInputs()), "fcf");

    expect(fcf.disclosures).toContainEqual(
      expect.objectContaining({ field: "projections.fcf.basisChange", severity: "info" }),
    );
  });

  it("omits the disclosure when there is no historical FCF to splice", () => {
    const fcf = byMetric(computeProjections(makeInputs({ fcfHistory: [] })), "fcf");

    expect(fcf.disclosures.some((d) => d.field === "projections.fcf.basisChange")).toBe(false);
  });
});

describe("projections — not applicable", () => {
  it("returns a reason for a non-DCF (financial) route", () => {
    const val: ValuationResult = { kind: "excess-return", route: "bank", excessReturn: {} as never, multiples: {} as never, notes: [], gaps: [] };
    const p = computeProjections(makeInputs({ route: route("bank"), valuation: val }));
    expect(p.series).toHaveLength(0);
    expect(p.notApplicableReason).toMatch(/general route/i);
  });

  it("returns a reason when the DCF could not be built", () => {
    const val = dcfValuation();
    (val as { assumptions: DcfAssumptions | null }).assumptions = null;
    (val as { dcf: DcfResult | null }).dcf = null;
    const p = computeProjections(makeInputs({ valuation: val }));
    expect(p.notApplicableReason).toMatch(/unavailable/i);
  });
});

describe("projections — provenance wording (audit 2026-09-06)", () => {
  it("names the growth anchor's actual methods and never claims an analyst anchor that does not exist", () => {
    // No analyst estimates in the fixture: the basis string still NAMES the
    // analyst method as unavailable, and a substring test on it printed
    // "anchored to analyst consensus" for every keyless report.
    const p = computeProjections(makeInputs());
    const line = byMetric(p, "revenue").assumptions[0]!;
    expect(line).not.toMatch(/analyst consensus/);
    expect(line).toMatch(/median of 2 methods \(3y revenue CAGR, 5y revenue CAGR\)/);
    expect(line).toMatch(/unavailable: .*analyst-consensus case/);
  });

  it("discloses excluded off-annual pairs as an info entry while still producing the fan", () => {
    const gapped: ProjectionIncomeRow[] = [
      { date: "2015-12-31", revenue: 100, ebit: 20, netIncome: 14, epsDiluted: 0.14 },
      { date: "2016-12-31", revenue: 120, ebit: 26, netIncome: 18, epsDiluted: 0.18 },
      { date: "2017-12-31", revenue: 132, ebit: 27, netIncome: 19, epsDiluted: 0.19 },
      { date: "2018-12-31", revenue: 160, ebit: 35, netIncome: 25, epsDiluted: 0.25 },
      { date: "2019-12-31", revenue: 168, ebit: 36, netIncome: 26, epsDiluted: 0.26 },
      { date: "2024-12-31", revenue: 200, ebit: 41, netIncome: 30, epsDiluted: 0.3 },
      { date: "2025-12-31", revenue: 230, ebit: 49, netIncome: 36, epsDiluted: 0.36 },
    ];
    const p = computeProjections(makeInputs({ incomeHistory: gapped }));
    expect(p.notApplicableReason).toBeNull();
    expect(p.series.length).toBeGreaterThan(0);
    const entry = byMetric(p, "revenue").disclosures.find((d) => d.field === "projections.dispersion.spacing");
    expect(entry?.severity).toBe("info");
    expect(entry?.reason).toMatch(/1 nonconsecutive fiscal interval excluded/);
    expect(entry?.reason).not.toMatch(/suppressed/);
  });
});
