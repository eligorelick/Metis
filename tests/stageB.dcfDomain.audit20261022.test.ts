/**
 * Audit 2026-10-22 B-29: a DCF outside its domain is not a fair value.
 *
 * NEE published $0.00 (−100%) from a DCF whose equity value was below zero
 * (enterprise value under net debt and the senior claims), and TSLA published
 * $10.21 (−97%) from a DCF whose explicit-period present value was −$29B, so
 * its terminal value was 1,234% of enterprise value. Neither figure says
 * anything about the operating business. The owner's rule: when equity value
 * ≤ 0, or the terminal value is more than 100% of enterprise value (an
 * explicit-period PV below zero), the fair value takes the status "model
 * outside its domain" with a critical gap naming the failed test; no per-share
 * value, scenario targets, sensitivity grid or reverse DCF is published from
 * it, and the valuation aspect does not grade it.
 */
import { describe, expect, it } from "vitest";

import { computeFairValue } from "@/pipeline/stageB/fairValue";
import { computeScenarioTargets } from "@/pipeline/stageB/scenarioTargets";
import { valueCompany, type DcfAssumptionInputs, type MultiplesFrameworkInputs, type ValuationBundleInputs } from "@/pipeline/stageB/valuation";
import type { CompanyRoute } from "@/types/core";
import type { FairValue } from "@/report/schema";
import { fairValueWithheldText } from "@/report/fairValueText";
import { keyDataRows } from "@/report/presentation";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { task28SentinelReport } from "./helpers/task28Report";

const route: CompanyRoute = { base: "general", overlays: [], evidence: { sector: null, industry: null } };

const multiples: MultiplesFrameworkInputs = {
  quote: { price: 100, marketCap: 10000, currency: "USD" },
  reportedCurrency: "USD",
  incomeTtm: { date: "2025-12-31", revenue: 1000, operatingIncome: 200, depreciationAndAmortization: 50, netIncome: 144, epsDiluted: 1.44 },
  cashFlowTtm: { date: "2025-12-31", operatingCashFlow: 180, capitalExpenditure: -30, depreciationAndAmortization: 50 },
  balance: { date: "2025-12-31", totalDebt: 300, cashAndShortTermInvestments: 100, totalStockholdersEquity: 500, goodwill: 50, intangibleAssets: 50, minorityInterest: 0, preferredStock: 0 },
};

/** A steady issuer: 10% growth at a 20% margin. Its DCF is inside the domain unless net debt swamps it. */
const steady: DcfAssumptionInputs = {
  revenueCagr3yPct: 10,
  revenueCagr5yPct: 10,
  analystEstimates: null,
  waccPct: 9,
  riskFreePct: 4.48,
  incomeTtm: { date: "2025-12-31", revenue: 1000, operatingIncome: 200, incomeBeforeTax: 180, incomeTaxExpense: 36 },
  incomeHistory: [
    { date: "2025-12-31", revenue: 1000, operatingIncome: 200 },
    { date: "2024-12-31", revenue: 900, operatingIncome: 180 },
    { date: "2023-12-31", revenue: 800, operatingIncome: 160 },
  ],
  balance: { date: "2025-12-31", basis: "annual", totalDebt: 300, totalStockholdersEquity: 500, cashAndShortTermInvestments: 100 },
  marketCap: 5000,
};

/** A TSLA-shaped issuer: 40% growth at a 12% margin, so reinvestment exceeds NOPAT for the explicit years. */
const g = 1.4;
const reinvesting: DcfAssumptionInputs = {
  ...steady,
  revenueCagr3yPct: 40,
  revenueCagr5yPct: 40,
  incomeTtm: { date: "2025-12-31", revenue: 1000, operatingIncome: 120, incomeBeforeTax: 120, incomeTaxExpense: 24 },
  incomeHistory: [
    { date: "2025-12-31", revenue: 1000, operatingIncome: 120 },
    { date: "2024-12-31", revenue: 1000 / g, operatingIncome: 120 / g },
    { date: "2023-12-31", revenue: 1000 / g ** 2, operatingIncome: 120 / g ** 2 },
  ],
  balance: { date: "2025-12-31", basis: "annual", totalDebt: 0, totalStockholdersEquity: 5000, cashAndShortTermInvestments: 0 },
  marketCap: 50000,
};

const bundle = (dcfInputs: DcfAssumptionInputs, netDebt: number): ValuationBundleInputs => ({
  currentPrice: 100,
  waccPct: 9,
  netDebt,
  dilutedShares: 100,
  dcfInputs,
  multiples,
  excessReturn: null,
  reit: null,
});

function outside(dcfInputs: DcfAssumptionInputs, netDebt: number) {
  const valuation = valueCompany(route, bundle(dcfInputs, netDebt));
  if (valuation.kind !== "dcf" || valuation.dcf === null) throw new Error("expected a built DCF");
  return { valuation, dcf: valuation.dcf };
}

describe("B-29: DCF domain gate", () => {
  it("equity value at or below zero: no per-share, grids, reverse DCF or scenarios; a critical gap names the test", () => {
    const { valuation, dcf } = outside(steady, 100_000);
    expect(dcf.equityValue).not.toBeNull();
    expect(dcf.equityValue!).toBeLessThanOrEqual(0);
    expect(dcf.perShare).toBeNull();
    expect(dcf.domain?.status).toBe("outside");
    expect(dcf.domain?.failures.map((f) => f.test)).toEqual(["equity-value-non-positive"]);
    expect(dcf.domain?.rawPerShare).toBeLessThan(0);
    if (valuation.kind !== "dcf") throw new Error("unreachable");
    expect(valuation.sensitivity).toBeNull();
    expect(valuation.growthMarginGrid).toBeNull();
    expect(valuation.reverseDcf).toBeNull();
    const gap = valuation.gaps.find((entry) => entry.field === "valuation.dcf.domain");
    expect(gap?.severity).toBe("critical");
    expect(gap?.reason).toMatch(/equity value/i);

    const fairValue = computeFairValue({ valuation, currentPrice: 100, currency: "USD", asOf: "2026-10-22" });
    expect(fairValue.status).toBe("outside-domain");
    expect(fairValue.method).toBe("fcff-dcf");
    expect(fairValue.perShare).toBeNull();
    expect(fairValue.upsidePct).toBeNull();
    expect(fairValue.reasons[0]).toMatchObject({ field: "valuation.dcf.domain", severity: "critical" });
    expect(fairValue.basis.join(" ")).toMatch(/outside its domain/i);

    const targets = computeScenarioTargets({ route: { base: "general", overlays: [], evidence: { sector: null, industry: null } } as never, valuation, waccPct: 9, incomeHistory: [], currentPrice: 100, currency: "USD", asOf: "2026-10-22" });
    expect(targets.status).toBe("suppressed");
    expect(targets.missingReasons[0]?.reason).toMatch(/outside its domain/i);
    // D-102 changes both resolutions, so their method stamps move (Codex review, PR #49).
    expect(fairValue.methodVersion).toBe("FAIR_VALUE_2026_10_D102");
    expect(targets.methodVersion).toBe("SCENARIO_TARGETS_2026_10_D102");
  });

  it("explicit-period PV below zero (terminal value over 100% of EV) withholds a positive per-share too", () => {
    const { valuation, dcf } = outside(reinvesting, -500);
    expect(dcf.pvExplicit).toBeLessThan(0);
    expect(dcf.enterpriseValue).toBeGreaterThan(0);
    expect(dcf.equityValue!).toBeGreaterThan(0);
    expect(dcf.perShare).toBeNull();
    expect(dcf.domain?.failures.map((f) => f.test)).toEqual(["terminal-share-above-100pct"]);
    expect(dcf.domain?.rawPerShare).toBeGreaterThan(0);
    const gap = valuation.gaps.find((entry) => entry.field === "valuation.dcf.domain");
    expect(gap?.severity).toBe("critical");
    expect(gap?.reason).toMatch(/terminal value/i);
    expect(gap?.reason).toMatch(/explicit-period/i);
    const fairValue = computeFairValue({ valuation, currentPrice: 100, currency: "USD", asOf: "2026-10-22" });
    expect(fairValue.status).toBe("outside-domain");
    expect(fairValue.perShare).toBeNull();
  });

  it("withholds a grid cell whose own rerun is outside the domain, though the base DCF is inside it (Codex review, PR #49)", () => {
    // Net debt at 95% of the base enterprise value: the base equity is
    // positive, but a +2pp WACC row or a −10pp margin column bridges below zero.
    const ev = outside(steady, 200).dcf.enterpriseValue;
    const { valuation, dcf } = outside(steady, ev * 0.95);
    expect(dcf.domain).toBeUndefined();
    expect(dcf.perShare!).toBeGreaterThan(0);
    if (valuation.kind !== "dcf") throw new Error("unreachable");
    const wacc = valuation.sensitivity!;
    const gm = valuation.growthMarginGrid!;
    for (const v of [...wacc.perShare.flat(), ...gm.perShare.flat()]) if (v !== null) expect(v).toBeGreaterThan(0);
    // The +2pp WACC row is far from the terminal-growth guard, so its nulls are the domain's.
    expect(wacc.perShare[wacc.perShare.length - 1]!.some((v) => v === null)).toBe(true);
    expect(gm.perShare.flat().some((v) => v === null)).toBe(true);
    expect(wacc.notes.join(" ")).toMatch(/outside the DCF's domain .*withheld/);
    expect(gm.notes.join(" ")).toMatch(/outside the DCF's domain .*withheld/);
    // The base cell is the headline.
    expect(wacc.perShare[2]![2]).toBeCloseTo(dcf.perShare!, 6);
  });

  it("a DCF inside the domain is unchanged", () => {
    const { valuation, dcf } = outside(steady, 200);
    expect(dcf.domain).toBeUndefined();
    expect(dcf.perShare).not.toBeNull();
    if (valuation.kind !== "dcf") throw new Error("unreachable");
    expect(valuation.sensitivity).not.toBeNull();
    expect(valuation.reverseDcf).not.toBeNull();
    expect(valuation.gaps.some((entry) => entry.field === "valuation.dcf.domain")).toBe(false);
    expect(computeFairValue({ valuation, currentPrice: 100, currency: "USD", asOf: "2026-10-22" }).status).toBe("available");
  });
});

describe("B-29: every surface says the model is outside its domain", () => {
  const outsideDomain = (): FairValue => {
    const { valuation } = outside(reinvesting, -500);
    return computeFairValue({ valuation, currentPrice: 100, currency: "USD", asOf: "2026-10-22" });
  };
  const reportWith = (fairValue: FairValue) => {
    const report = task28SentinelReport();
    report.fairValue = fairValue;
    report.valuation.dcf.perShare = null;
    report.valuation.dcf.upsidePct = null;
    return report;
  };

  it("names the failed test in the Key data headline row and the exports", () => {
    const report = reportWith(outsideDomain());
    const row = keyDataRows(report).find((r) => r.label === "Model fair value (DCF)");
    expect(row?.value).toBe("Model outside its domain");
    expect(row?.note).toMatch(/terminal value's present value .* exceeds the whole enterprise value/);
    expect(reportToMarkdown(report)).toMatch(/_Model outside its domain: the terminal value's present value/);
    expect(reportToPrintBody(report)).toMatch(/<p class="faint">Model outside its domain: the terminal value&#39;s present value/);
    expect(fairValueWithheldText(report.fairValue!)).toMatch(/^Model outside its domain: /);
  });

  it("keeps the suppressed wording for other withheld fair values", () => {
    const fairValue: FairValue = { status: "suppressed", method: null, methodVersion: "x", perShare: null, upsidePct: null, basis: ["basis line"], reasons: [{ field: "valuation.dcf.perShare", reason: "no shares", severity: "warn" }] };
    expect(fairValueWithheldText(fairValue)).toBe("Intrinsic value per share suppressed — no shares");
    expect(fairValueWithheldText({ ...fairValue, reasons: [] })).toBe("Intrinsic value per share suppressed — basis line");
    const report = reportWith(fairValue);
    expect(keyDataRows(report).some((r) => r.label === "Model fair value (DCF)")).toBe(false);
  });
});
