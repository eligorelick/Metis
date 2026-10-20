/**
 * Stage B — deterministic scenario price targets (scenarioTargets.ts).
 *
 * The invariant this checkpoint establishes: bull/base/bear headline price
 * targets are COMPUTED (base = the deterministic DCF fair value; bull/bear = the
 * same DCF re-run with growth + operating-margin paths shifted ±1·σ of the
 * company's OWN historical dispersion — the identical construction used by the
 * projection fan), NOT authored by the judge/LLM. Missing inputs SUPPRESS the
 * targets rather than fabricating them. Every target is `computed-derived`
 * provenance, not a factual-verification claim.
 */

import { describe, expect, it } from "vitest";

import {
  computeScenarioTargets,
  SCENARIO_TARGET_METHOD_VERSION,
  type ScenarioTargetsInputs,
} from "@/pipeline/stageB/scenarioTargets";
import {
  scenarioDispersion,
  DISPERSION_K,
  type ProjectionIncomeRow,
} from "@/pipeline/stageB/projections";
import {
  buildDcfAssumptions,
  runDcf,
  valueCompany,
  type DcfAssumptionInputs,
  type DcfAssumptions,
  type DcfResult,
  type MultiplesFrameworkInputs,
  type ValuationResult,
} from "@/pipeline/stageB/valuation";
import { buildScenarioPaths, perturbScenarioAssumptions } from "@/pipeline/stageB/scenarioPaths";
import type { CompanyRouteResult } from "@/pipeline/stageB/sectorRouting";
import type { SectorRoute } from "@/types/core";

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

const INCOME_HISTORY: ProjectionIncomeRow[] = [
  { date: "2021-12-31", revenue: 700, ebit: 196, netIncome: 140, epsDiluted: 1.3 },
  { date: "2022-12-31", revenue: 780, ebit: 226, netIncome: 160, epsDiluted: 1.5 },
  { date: "2023-12-31", revenue: 850, ebit: 251, netIncome: 178, epsDiluted: 1.7 },
  { date: "2024-12-31", revenue: 920, ebit: 276, netIncome: 196, epsDiluted: 1.9 },
  { date: "2025-12-31", revenue: 1000, ebit: 300, netIncome: 214, epsDiluted: 2.1 },
];

function buildDcf(): { assumptions: DcfAssumptions; dcf: DcfResult } {
  const built = buildDcfAssumptions({
    revenueCagr3yPct: 12,
    revenueCagr5yPct: 12,
    analystEstimates: null,
    waccPct: 9,
    riskFreePct: 4,
    incomeTtm: { date: "2025-12-31", revenue: 1000, operatingIncome: 300, incomeBeforeTax: 280, incomeTaxExpense: 60 },
    incomeHistory: INCOME_HISTORY.map((r) => ({ date: r.date, revenue: r.revenue, operatingIncome: r.ebit, incomeBeforeTax: (r.ebit ?? 0) - 20, incomeTaxExpense: ((r.ebit ?? 0) - 20) * 0.21 })),
    balance: { date: "2025-12-31", basis: "annual", totalDebt: 200, totalStockholdersEquity: 800, cashAndShortTermInvestments: 300 },
    marketCap: 5000,
  });
  expect(built.assumptions).not.toBeNull();
  const assumptions = built.assumptions as DcfAssumptions;
  const dcf = runDcf(assumptions, { waccPct: 9, netDebt: -100, dilutedShares: 100 });
  return { assumptions, dcf };
}

function dcfValuation(over: Partial<Extract<ValuationResult, { kind: "dcf" }>> = {}): ValuationResult {
  const { assumptions, dcf } = buildDcf();
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
    ...over,
  };
}

function makeInputs(over: Partial<ScenarioTargetsInputs> = {}): ScenarioTargetsInputs {
  return {
    route: route(),
    valuation: dcfValuation(),
    waccPct: 9,
    incomeHistory: INCOME_HISTORY,
    currentPrice: 120,
    currency: "USD",
    asOf: "2026-07-06",
    ...over,
  };
}

const targetFor = (r: ReturnType<typeof computeScenarioTargets>, name: "bull" | "base" | "bear") =>
  r.targets.find((t) => t.name === name)!;

/* ------------------------------------------------------------------------ */

describe("scenarioTargets — available (general DCF route)", () => {
  it("produces three computed targets with base = the deterministic DCF fair value", () => {
    const inputs = makeInputs();
    const r = computeScenarioTargets(inputs);
    expect(r.status).toBe("available");
    expect(r.method).toBe("dcf-dispersion");
    expect(r.methodVersion).toBe(SCENARIO_TARGET_METHOD_VERSION);
    expect(r.targets.map((t) => t.name).sort()).toEqual(["base", "bear", "bull"]);

    const dcfPerShare = (inputs.valuation as Extract<ValuationResult, { kind: "dcf" }>).dcf!.perShare!;
    const base = targetFor(r, "base");
    expect(base.perShare).not.toBeNull();
    // Base target IS the deterministic DCF per-share (not recomputed, not LLM).
    expect(base.perShare!.value).toBeCloseTo(Math.round(dcfPerShare * 100) / 100, 6);
    expect(base.growthDeltaPp).toBe(0);
    expect(base.marginDeltaPp).toBe(0);
  });

  it("orders bull >= base >= bear in per-share value", () => {
    const r = computeScenarioTargets(makeInputs());
    const bull = targetFor(r, "bull").perShare!.value;
    const base = targetFor(r, "base").perShare!.value;
    const bear = targetFor(r, "bear").perShare!.value;
    expect(bull).toBeGreaterThanOrEqual(base);
    expect(base).toBeGreaterThanOrEqual(bear);
  });

  it("labels every target TracedNumber computed-derived (source computed.scenarioTargets.*), never factually verified-as-correct", () => {
    const r = computeScenarioTargets(makeInputs());
    for (const t of r.targets) {
      expect(t.perShare).not.toBeNull();
      expect(t.perShare!.source).toBe(`computed.scenarioTargets.${t.name}`);
      expect(t.perShare!.unit).toBe("USD/share");
      // verified:true here means "traced to computed inputs" (provenance), the
      // same convention projections uses — NOT a correctness assertion.
      expect(t.perShare!.verified).toBe(true);
    }
  });

  it("derives bull/bear deltas from the company's own dispersion — the SAME σ the projection fan uses", () => {
    const inputs = makeInputs();
    const disp = scenarioDispersion(inputs.incomeHistory);
    const r = computeScenarioTargets(inputs);
    expect(r.dispersion).not.toBeNull();
    expect(r.dispersion!.sigmaSource).toBe("own-history");
    // bull/bear growth delta === ±DISPERSION_K·σ_growth (identical construction).
    expect(targetFor(r, "bull").growthDeltaPp).toBeCloseTo(DISPERSION_K * disp.sigmaGrowth!, 6);
    expect(targetFor(r, "bear").growthDeltaPp).toBeCloseTo(-DISPERSION_K * disp.sigmaGrowth!, 6);
    // AMZN audit 2026-10-20 finding 11: the correlated margin shift is applied
    // only when it moves with the scenario. This history is anti-correlated, so
    // it would cut the bull's margin, and both margins stay at base.
    const correlated = DISPERSION_K * disp.sigmaMargin! * (disp.growthMarginCorrelation ?? 0);
    expect(correlated).toBeLessThan(0);
    expect(targetFor(r, "bull").marginDeltaPp).toBe(0);
    expect(targetFor(r, "bear").marginDeltaPp).toBe(0);
    expect(r.basis[1]).toContain(`Here it would have cut the bull's margin by ${round2(-correlated)}pp and raised the bear's by ${round2(-correlated)}pp, so both margins stay at base.`);
  });

  it("computes upside vs the current price for each target", () => {
    const r = computeScenarioTargets(makeInputs({ currentPrice: 100 }));
    const base = targetFor(r, "base");
    expect(base.upsidePct).not.toBeNull();
    expect(base.upsidePct!).toBeCloseTo((base.perShare!.value / 100 - 1) * 100, 4);
  });

  it("returns null upside (not 0) when the current price is missing", () => {
    const r = computeScenarioTargets(makeInputs({ currentPrice: null }));
    expect(targetFor(r, "base").upsidePct).toBeNull();
    expect(r.status).toBe("available"); // targets still computed; only upside unknown
  });

  it("suppresses targets when history is too thin instead of using a house default", () => {
    const r = computeScenarioTargets(makeInputs({ incomeHistory: [INCOME_HISTORY[0]] }));
    expect(r.status).toBe("suppressed");
    expect(r.dispersion).toBeNull();
    expect(r.targets).toEqual([]);
    expect(r.missingReasons.some((g) => g.field.includes("dispersion"))).toBe(true);
  });
});

describe("scenarioTargets — suppressed (never fabricate)", () => {
  it("suppresses on a non-DCF route (bank/insurer/REIT/pre-revenue)", () => {
    const r = computeScenarioTargets(
      makeInputs({
        valuation: { kind: "pre-revenue", route: "general", multiples: null, notes: [], gaps: [] },
      }),
    );
    expect(r.status).toBe("suppressed");
    expect(r.targets).toEqual([]);
    expect(r.missingReasons.length).toBeGreaterThan(0);
  });

  it("suppresses when WACC is unavailable", () => {
    const r = computeScenarioTargets(makeInputs({ waccPct: null }));
    expect(r.status).toBe("suppressed");
    expect(r.targets).toEqual([]);
    expect(r.missingReasons.some((g) => g.reason.toLowerCase().includes("wacc"))).toBe(true);
  });

  it("suppresses when the base DCF per-share is unavailable (e.g. net debt / shares missing)", () => {
    const noBridge = dcfValuation({ dcf: { ...buildDcf().dcf, perShare: null, equityValue: null } });
    const r = computeScenarioTargets(makeInputs({ valuation: noBridge }));
    expect(r.status).toBe("suppressed");
    expect(r.targets).toEqual([]);
  });
});

/* ------------------------------------------------------------------------ *
 * Regression: ordering / floor / degeneracy invariants (2026-07-20 audit).
 * ------------------------------------------------------------------------ */

// A DCF built on a chosen net debt. The scenario re-runs read the bridge from
// the result itself (DcfResult.bridge), so base and the perturbed extremes are
// always on one bridge. Used to force a heavily-levered bear bridge.
function buildDcfWithNetDebt(netDebt: number): { assumptions: DcfAssumptions; dcf: DcfResult } {
  const built = buildDcfAssumptions({
    revenueCagr3yPct: 12,
    revenueCagr5yPct: 12,
    analystEstimates: null,
    waccPct: 9,
    riskFreePct: 4,
    incomeTtm: { date: "2025-12-31", revenue: 1000, operatingIncome: 300, incomeBeforeTax: 280, incomeTaxExpense: 60 },
    incomeHistory: INCOME_HISTORY.map((r) => ({ date: r.date, revenue: r.revenue, operatingIncome: r.ebit, incomeBeforeTax: (r.ebit ?? 0) - 20, incomeTaxExpense: ((r.ebit ?? 0) - 20) * 0.21 })),
    balance: { date: "2025-12-31", basis: "annual", totalDebt: 200, totalStockholdersEquity: 800, cashAndShortTermInvestments: 300 },
    marketCap: 5000,
  });
  const assumptions = built.assumptions as DcfAssumptions;
  const dcf = runDcf(assumptions, { waccPct: 9, netDebt, dilutedShares: 100 });
  return { assumptions, dcf };
}

// Anti-correlated history: high-growth years carry LOW margins and vice-versa, so
// the growth/margin correlation is strongly negative and the correlated margin
// shift (σ capped at 12pp) dwarfs the growth shock (σ≈1.2pp). Before AMZN audit
// 2026-10-20 finding 11 that shift was applied against the growth shift, so the
// +growth run (lower margin) landed BELOW the −growth run (higher margin).
const ANTI_CORRELATED_HISTORY: ProjectionIncomeRow[] = [
  { date: "2021-12-31", revenue: 1000, ebit: 300, netIncome: 200, epsDiluted: 2.0 }, // margin 30%
  { date: "2022-12-31", revenue: 1100, ebit: 165, netIncome: 130, epsDiluted: 1.3 }, // g 10%,  margin 15%
  { date: "2023-12-31", revenue: 1188, ebit: 534.6, netIncome: 190, epsDiluted: 1.9 }, // g 8.0%, margin 45%
  { date: "2024-12-31", revenue: 1300.86, ebit: 260.172, netIncome: 180, epsDiluted: 1.8 }, // g 9.5%, margin 20%
  { date: "2025-12-31", revenue: 1398.42, ebit: 699.21, netIncome: 250, epsDiluted: 2.5 }, // g 7.5%, margin 50%
];

// Perfectly geometric revenue (constant 10%/yr) and constant 30% margin — margin
// sample σ is ~0, so the growth/margin correlation is mathematically undefined
// (scenarioDispersion.correlation() returns a spurious number on the float-noise-
// flat series).
const FLAT_MARGIN_HISTORY: ProjectionIncomeRow[] = [
  { date: "2021-12-31", revenue: 1000, ebit: 300, netIncome: 200, epsDiluted: 2.0 },
  { date: "2022-12-31", revenue: 1100, ebit: 330, netIncome: 220, epsDiluted: 2.2 },
  { date: "2023-12-31", revenue: 1210, ebit: 363, netIncome: 242, epsDiluted: 2.4 },
  { date: "2024-12-31", revenue: 1331, ebit: 399.3, netIncome: 266, epsDiluted: 2.66 },
  { date: "2025-12-31", revenue: 1464.1, ebit: 439.23, netIncome: 293, epsDiluted: 2.93 },
];

describe("scenarioTargets — ordering / floor / degeneracy invariants", () => {
  it("holds the margin at base under a negative growth/margin correlation, so the bull keeps the higher growth and no margin cut", () => {
    const inputs = makeInputs({ incomeHistory: ANTI_CORRELATED_HISTORY });
    const disp = scenarioDispersion(ANTI_CORRELATED_HISTORY);
    // Precondition: correlation is strongly negative.
    expect(disp.growthMarginCorrelation).not.toBeNull();
    expect(disp.growthMarginCorrelation!).toBeLessThan(-0.9);

    const r = computeScenarioTargets(inputs);
    const bull = targetFor(r, "bull").perShare!.value;
    const base = targetFor(r, "base").perShare!.value;
    const bear = targetFor(r, "bear").perShare!.value;
    expect(bull).toBeGreaterThanOrEqual(base);
    expect(base).toBeGreaterThanOrEqual(bear);
    expect(bull).toBeGreaterThan(bear); // a real, non-degenerate spread

    // AMZN audit 2026-10-20 finding 11: the bull used to be the −growth run
    // with an 11pp margin gain (37.53 for the +growth run against 42.26). Growth
    // creates value here, so the bull is the +growth run and the margin shift
    // that history pairs with it, a cut, is not applied to either scenario.
    expect(targetFor(r, "bull").growthDeltaPp).toBeCloseTo(DISPERSION_K * disp.sigmaGrowth!, 6);
    expect(targetFor(r, "bull").marginDeltaPp).toBe(0);
    expect(targetFor(r, "bear").growthDeltaPp).toBeCloseTo(-DISPERSION_K * disp.sigmaGrowth!, 6);
    expect(targetFor(r, "bear").marginDeltaPp).toBe(0);
    expect(r.missingReasons.some((g) => g.field === "valuation.scenarioTargets.ordering")).toBe(false);
  });

  it("re-labels bull/bear by value when growth destroys value, and discloses it", () => {
    // Sales-to-capital 0.2: the reinvestment extra growth needs costs more than
    // the operating profit it adds, so the lower-growth shock is worth more.
    const { assumptions } = buildDcf();
    const a = structuredClone(assumptions);
    a.salesToCapital.value = 0.2;
    const dcf = runDcf(a, { waccPct: 9, netDebt: -100, dilutedShares: 100 });
    expect(dcf.perShare!).toBeGreaterThan(0);
    const r = computeScenarioTargets(makeInputs({ valuation: dcfValuation({ assumptions: a, dcf }) }));
    const disp = scenarioDispersion(INCOME_HISTORY);
    expect(targetFor(r, "bull").perShare!.value).toBeGreaterThan(targetFor(r, "bear").perShare!.value);
    expect(targetFor(r, "bull").growthDeltaPp).toBeCloseTo(-DISPERSION_K * disp.sigmaGrowth!, 6);
    expect(targetFor(r, "bear").growthDeltaPp).toBeCloseTo(DISPERSION_K * disp.sigmaGrowth!, 6);
    // ρ < 0 here, so the margin gain history pairs with lower growth goes with the bull.
    expect(targetFor(r, "bull").marginDeltaPp).toBeGreaterThan(0);
    expect(targetFor(r, "bear").marginDeltaPp).toBeCloseTo(-targetFor(r, "bull").marginDeltaPp, 12);
    const ordering = r.missingReasons.find((g) => g.field === "valuation.scenarioTargets.ordering");
    expect(ordering?.reason).toMatch(/^with the margin at base the lower-growth shock is worth more than the higher-growth one/);
  });

  it("floors a negative bear per-share at 0 and caps upside at −100%, disclosed", () => {
    // netDebt 3950 sits between the −σ (bear) enterprise value (3,882 under the
    // D-60 decaying shocks) and the base EV (3,995), so the raw bear equity
    // bridge is negative. Re-pinned for D-60: decaying shocks narrow the band.
    const { assumptions, dcf } = buildDcfWithNetDebt(3950);
    const valuation: ValuationResult = {
      kind: "dcf", route: "general", assumptions, dcf, sensitivity: null, reverseDcf: null,
      multiples: { multiples: [], enterpriseValue: { value: null, excludingLeases: null, includingLeases: null, leaseLiability: null, includeLeases: false, basis: "test" }, sectorAppropriate: [], asOf: { quote: null, statements: null }, notes: [], gaps: [] },
      notes: [], gaps: [],
    };
    const r = computeScenarioTargets(makeInputs({ valuation }));
    expect(r.status).toBe("available");

    const bear = targetFor(r, "bear");
    // Hand-derived: raw bear equity/share < 0 → floored to exactly 0; upside =
    // (0 / 120 − 1)·100 = −100 exactly (never below).
    expect(bear.perShare!.value).toBe(0);
    expect(bear.upsidePct).toBe(-100);

    const bull = targetFor(r, "bull").perShare!.value;
    const base = targetFor(r, "base").perShare!.value;
    expect(bull).toBeGreaterThanOrEqual(base);
    expect(base).toBeGreaterThanOrEqual(0); // base still the positive DCF fair value (≈ 1.4)
    expect(r.missingReasons.some((g) => g.field === "valuation.scenarioTargets.floor")).toBe(true);
  });

  it("suppresses the whole fan when the base DCF per-share is non-positive (no base-below-bear inversion)", () => {
    // netDebt 4600 pushes enterprise value below net debt, so the BASE DCF
    // per-share is itself negative (≈ −$2.60). Flooring only bull/bear at 0 while
    // leaving base raw would publish base BELOW bear (0) — the risk direction
    // backwards. The fan is suppressed instead; the DCF page still shows the
    // negative fair value.
    const { assumptions, dcf } = buildDcfWithNetDebt(4600);
    expect(dcf.perShare!).toBeLessThan(0); // precondition: base equity value < 0
    const valuation: ValuationResult = {
      kind: "dcf", route: "general", assumptions, dcf, sensitivity: null, reverseDcf: null,
      multiples: { multiples: [], enterpriseValue: { value: null, excludingLeases: null, includingLeases: null, leaseLiability: null, includeLeases: false, basis: "test" }, sectorAppropriate: [], asOf: { quote: null, statements: null }, notes: [], gaps: [] },
      notes: [], gaps: [],
    };
    const r = computeScenarioTargets(makeInputs({ valuation }));
    expect(r.status).toBe("suppressed");
    expect(r.targets).toEqual([]);
    expect(
      r.missingReasons.some((g) => g.reason.toLowerCase().includes("non-positive")),
    ).toBe(true);
  });

  it("reports a degenerate correlation as unavailable (null), not a spurious measured value", () => {
    const disp = scenarioDispersion(FLAT_MARGIN_HISTORY);
    // scenarioDispersion itself emits a spurious non-null correlation on the flat
    // margin series (float-noise variance passes its varianceY>0 guard)...
    expect(disp.growthMarginCorrelation).not.toBeNull();
    expect(round2(disp.sigmaMargin ?? 1)).toBe(0); // margin σ rounds to 0.00pp

    const r = computeScenarioTargets(makeInputs({ incomeHistory: FLAT_MARGIN_HISTORY }));
    // ...but the scenario block reports it as unavailable and holds the margin
    // shock at zero, disclosing the degeneracy.
    expect(r.dispersion!.growthMarginCorrelation).toBeNull();
    expect(targetFor(r, "bull").marginDeltaPp).toBeCloseTo(0, 10);
    expect(r.missingReasons.some((g) => g.field === "valuation.scenarioTargets.dispersion.degenerate")).toBe(true);
  });
});

const round2 = (v: number): number => Math.round(v * 100) / 100;

/* ------------------------------------------------------------------------ *
 * Audit 2026-09-06: one bridge for base, bull and bear. valueCompany removes
 * the operating-lease liability from net debt before bridging the base
 * per-share; the scenario re-runs used to bridge on the RAW figure compute.ts
 * holds, and published a bull target below base for every lease-heavy issuer.
 * ------------------------------------------------------------------------ */

describe("scenarioTargets — the perturbed runs use the base DCF's own bridge", () => {
  const dcfInputs: DcfAssumptionInputs = {
    revenueCagr3yPct: 12,
    revenueCagr5yPct: 12,
    analystEstimates: null,
    waccPct: 9,
    riskFreePct: 4,
    incomeTtm: { date: "2025-12-31", revenue: 1000, operatingIncome: 300, incomeBeforeTax: 280, incomeTaxExpense: 60 },
    incomeHistory: INCOME_HISTORY.map((r) => ({
      date: r.date,
      revenue: r.revenue,
      operatingIncome: r.ebit,
      incomeBeforeTax: (r.ebit ?? 0) - 20,
      incomeTaxExpense: ((r.ebit ?? 0) - 20) * 0.21,
    })),
    balance: { date: "2025-12-31", basis: "annual", totalDebt: 200, totalStockholdersEquity: 800, cashAndShortTermInvestments: 300 },
    marketCap: 5000,
  };
  const multiples: MultiplesFrameworkInputs = {
    quote: { price: 100, marketCap: 10_000, currency: "USD" },
    reportedCurrency: "USD",
    incomeTtm: { date: "2025-12-31", revenue: 1000, operatingIncome: 300, depreciationAndAmortization: 50, netIncome: 214, epsDiluted: 2.1 },
    cashFlowTtm: { date: "2025-12-31", operatingCashFlow: 260, capitalExpenditure: -40, depreciationAndAmortization: 50 },
    balance: {
      date: "2025-12-31",
      totalDebt: 700,
      cashAndShortTermInvestments: 250,
      totalStockholdersEquity: 800,
      goodwill: 0,
      intangibleAssets: 0,
      minorityInterest: 0,
      preferredStock: 0,
      capitalLeaseObligations: 250,
      operatingLeaseLiability: 250,
    },
  };

  it("re-runs bull and bear on the lease-adjusted bridge the base per-share used, so bull is never below base", () => {
    const valuation = valueCompany(route(), {
      currentPrice: 100,
      waccPct: 9,
      netDebt: 450,
      dilutedShares: 100,
      operatingLeaseLiability: 250,
      includeLeasesInEv: false,
      dcfInputs,
      multiples,
      excessReturn: null,
      reit: null,
    });
    expect(valuation.kind).toBe("dcf");
    const dcf = (valuation as Extract<ValuationResult, { kind: "dcf" }>).dcf!;
    // The base bridge removed the operating-lease liability: 450 − 250.
    expect(dcf.bridge.netDebt).toBe(200);
    expect(dcf.bridge.dilutedShares).toBe(100);

    const r = computeScenarioTargets(makeInputs({ valuation }));
    expect(r.status).toBe("available");
    const bull = targetFor(r, "bull").perShare!.value;
    const base = targetFor(r, "base").perShare!.value;
    const bear = targetFor(r, "bear").perShare!.value;
    expect(base).toBeCloseTo(round2(dcf.perShare!), 6);
    expect(bull).toBeGreaterThanOrEqual(base);
    expect(base).toBeGreaterThanOrEqual(bear);
    expect(r.missingReasons.some((g) => g.field === "valuation.scenarioTargets.ordering")).toBe(false);
  });
});

/* ------------------------------------------------------------------------ *
 * AMZN audit 2026-10-20 finding 11: the bull case cut margin. Bull and bear
 * shifted margin by ρ·σm, and AMZN's growth/margin correlation is −0.378, so
 * the bull carried +10.38pp of growth with a 1.17pp margin cut and the bear a
 * 1.17pp margin gain. A scenario's margin shift now goes with its growth
 * shift only when it helps the scenario.
 * ------------------------------------------------------------------------ */

describe("scenario paths — a bull is never unfavourable on a driver and a bear never favourable", () => {
  const opts = { waccPct: 9, netDebt: -100, dilutedShares: 100 };
  const perShareAt = (a: DcfAssumptions, g: number, m: number) => runDcf(perturbScenarioAssumptions(a, g, m), opts).perShare!;
  const named = (shared: ReturnType<typeof buildScenarioPaths>, name: "bull" | "bear") =>
    shared.scenarioAssumptions.scenarios.find((s) => s.name === name)!;

  it("holds the margin at base when growth and margin are anti-correlated (AMZN: ρ −0.378 cut the bull's margin 1.17pp)", () => {
    const { assumptions } = buildDcf();
    const shared = buildScenarioPaths(assumptions, opts, { sigmaGrowth: 10.38, sigmaMargin: 3.09, growthMarginCorrelation: -0.378 });
    expect(named(shared, "bull").growthDeltaPp).toBeCloseTo(10.38, 9);
    expect(named(shared, "bull").marginDeltaPp).toBe(0);
    expect(named(shared, "bear").growthDeltaPp).toBeCloseTo(-10.38, 9);
    expect(named(shared, "bear").marginDeltaPp).toBe(0);
    expect(shared.bull.result.perShare).toBeCloseTo(perShareAt(assumptions, 10.38, 0), 9);
    expect(shared.bear.result.perShare).toBeCloseTo(perShareAt(assumptions, -10.38, 0), 9);
    // The measured correlation is still what the construction reports.
    expect(shared.scenarioAssumptions.growthMarginCorrelation).toBe(-0.378);
    expect(shared.orderingInverted).toBe(false);
  });

  it("keeps the correlated margin shift when it moves with the scenario", () => {
    const { assumptions } = buildDcf();
    const shared = buildScenarioPaths(assumptions, opts, { sigmaGrowth: 10, sigmaMargin: 4, growthMarginCorrelation: 0.5 });
    expect(named(shared, "bull").growthDeltaPp).toBe(10);
    expect(named(shared, "bull").marginDeltaPp).toBeCloseTo(2, 12);
    expect(named(shared, "bear").growthDeltaPp).toBe(-10);
    expect(named(shared, "bear").marginDeltaPp).toBeCloseTo(-2, 12);
  });

  // Sales-to-capital 0.2 makes growth destroy value in this DCF (reinvestment
  // outruns the NOPAT it buys), so there the lower-growth shift is the bull's.
  it.each([
    [-0.378, 3.09, null], [-0.95, 12, null], [0.5, 4, null], [0.9, 12, null],
    [-0.378, 3.09, 0.2], [-0.95, 12, 0.2], [0.5, 4, 0.2], [0.9, 12, 0.2],
  ])("ρ %s, margin σ %spp, sales-to-capital %s: bull ≥ base on both drivers, bear ≤ base on both", (rho, sigmaMargin, s2c) => {
    const a = structuredClone(buildDcf().assumptions);
    if (s2c !== null) {
      a.salesToCapital.value = s2c;
      expect(perShareAt(a, 10, 0)).toBeLessThan(perShareAt(a, -10, 0)); // precondition: growth destroys value
    }
    const shared = buildScenarioPaths(a, opts, { sigmaGrowth: 10, sigmaMargin, growthMarginCorrelation: rho });
    const bull = named(shared, "bull");
    const bear = named(shared, "bear");
    expect(bull.marginDeltaPp).toBeGreaterThanOrEqual(0);
    expect(bear.marginDeltaPp).toBeLessThanOrEqual(0);
    // The bull's growth shift is the one that raises value on its own.
    expect(perShareAt(a, bull.growthDeltaPp, 0)).toBeGreaterThan(perShareAt(a, bear.growthDeltaPp, 0));
    expect(shared.bull.result.perShare!).toBeGreaterThan(shared.bear.result.perShare!);
    expect(shared.orderingInverted).toBe(bull.growthDeltaPp < 0);
  });
});
