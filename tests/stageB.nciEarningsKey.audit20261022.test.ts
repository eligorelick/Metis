/**
 * Audit 2026-10-22 E-5: FCX's DCF values consolidated free cash flow, so its
 * enterprise value includes the outside holders' share of PT-FI and Cerro
 * Verde, but the bridge deducted noncontrolling interest at its $12.11B book
 * value. Outside holders earned 35.8% of trailing consolidated profit; on that
 * key their claim on the $44.3B consolidated equity value is $15.9B, and the
 * published $22.31 overstated common equity by about 13%.
 *
 * The owner's rule: when NCI's share of trailing consolidated profit is above
 * 10% and above NCI book ÷ consolidated equity value (EV less net debt and the
 * other claims), deduct NCI at that profit share of consolidated equity value;
 * otherwise keep the book deduction. When the earnings key cannot be
 * established, withhold the per-share value with an NCI-scope reason.
 */
import { describe, expect, it } from "vitest";

import { computeDcfDisplay, computeFairValue } from "@/pipeline/stageB/fairValue";
import { NCI_EARNINGS_KEY_MATERIALITY_PCT, valueCompany, type DcfAssumptionInputs, type MultiplesFrameworkInputs, type ValuationBundleInputs } from "@/pipeline/stageB/valuation";
import { valuationAuditTables } from "@/report/auditTables";
import type { CompanyRoute } from "@/types/core";

const route: CompanyRoute = { base: "general", overlays: [], evidence: { sector: null, industry: null } };

const multiples: MultiplesFrameworkInputs = {
  quote: { price: 100, marketCap: 10000, currency: "USD" },
  reportedCurrency: "USD",
  incomeTtm: { date: "2025-12-31", revenue: 1000, operatingIncome: 200, depreciationAndAmortization: 50, netIncome: 144, epsDiluted: 1.44 },
  cashFlowTtm: { date: "2025-12-31", operatingCashFlow: 180, capitalExpenditure: -30, depreciationAndAmortization: 50 },
  balance: { date: "2025-12-31", totalDebt: 300, cashAndShortTermInvestments: 100, totalStockholdersEquity: 500, goodwill: 50, intangibleAssets: 50, minorityInterest: 0, preferredStock: 0 },
};

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

const NET_DEBT = 200;
const bundle = (over: Partial<ValuationBundleInputs> = {}): ValuationBundleInputs => ({
  currentPrice: 100,
  waccPct: 9,
  netDebt: NET_DEBT,
  dilutedShares: 100,
  dcfInputs: steady,
  multiples,
  excessReturn: null,
  reit: null,
  ...over,
});

function dcfOf(over: Partial<ValuationBundleInputs> = {}) {
  const valuation = valueCompany(route, bundle(over));
  if (valuation.kind !== "dcf") throw new Error("expected the DCF route");
  return valuation;
}

/** Consolidated equity value before any NCI deduction: EV less net debt. */
const consolidated = (() => {
  const v = dcfOf();
  return v.dcf!.enterpriseValue - NET_DEBT;
})();

describe("E-5: NCI on the earnings key", () => {
  it("FCX shape: a 35.8% profit share above the 27% book ratio is deducted at 35.8% of consolidated equity value", () => {
    const book = 0.273 * consolidated;
    const v = dcfOf({ minorityInterest: book, noncontrollingEarnings: { noncontrollingIncome: 1645, consolidatedProfit: 4590, asOf: "2026-06-30" } });
    const share = 1645 / 4590;
    expect(v.dcf!.equityValue!).toBeCloseTo((1 - share) * consolidated, 6);
    expect(v.dcf!.equityValue!).toBeLessThan(consolidated - book);
    expect(v.dcf!.perShare!).toBeCloseTo(((1 - share) * consolidated) / 100, 6);
    expect(v.dcf!.bridge.minorityInterest).toBe(book);
    expect(v.dcf!.bridge.noncontrollingEarningsShare).toBeCloseTo(share, 12);
    expect(v.dcf!.bridge.noncontrollingDeducted).toBeCloseTo(share * consolidated, 6);
    expect(v.dcf!.notes.join(" ")).toMatch(/35\.8% share of trailing consolidated profit/);
    // The sensitivity grid, growth × margin grid and reverse DCF use the same key.
    const centre = v.sensitivity!.perShare[2]![2]!;
    expect(centre).toBeCloseTo(v.dcf!.perShare!, 6);
    expect(v.growthMarginGrid!.perShare[2]![2]!).toBeCloseTo(v.dcf!.perShare!, 6);
    // The report bridge shows the amount deducted and its basis.
    const display = computeDcfDisplay(v, "USD");
    expect(display.bridge?.minorityInterest).toBeCloseTo(share * consolidated, 6);
    expect(display.bridge?.noncontrollingBasis).toMatch(/35\.8% share of trailing consolidated profit to 2026-06-30/);
    const table = valuationAuditTables({ perShare: null, upsidePct: null, ...display } as never)
      .flatMap((t) => t.rows.map((r) => r.join(" | "))).join("\n");
    expect(table).toMatch(/35\.8% share of trailing consolidated profit/);
  });

  it("keeps the book deduction when the profit share is at or below book ÷ consolidated equity value", () => {
    const book = 0.273 * consolidated;
    const v = dcfOf({ minorityInterest: book, noncontrollingEarnings: { noncontrollingIncome: 20, consolidatedProfit: 100, asOf: "2026-06-30" } });
    expect(v.dcf!.equityValue!).toBeCloseTo(consolidated - book, 6);
    expect(v.dcf!.bridge.noncontrollingDeducted).toBeCloseTo(book, 6);
    expect(v.dcf!.notes.join(" ")).toMatch(/book value/);
  });

  it(`keeps the book deduction when the profit share is ${NCI_EARNINGS_KEY_MATERIALITY_PCT}% or less`, () => {
    const book = 0.02 * consolidated;
    const v = dcfOf({ minorityInterest: book, noncontrollingEarnings: { noncontrollingIncome: 8, consolidatedProfit: 100, asOf: "2026-06-30" } });
    expect(v.dcf!.equityValue!).toBeCloseTo(consolidated - book, 6);
  });

  it("withholds the per-share value with an NCI-scope reason when the earnings key cannot be established", () => {
    for (const earnings of [null, { noncontrollingIncome: null, consolidatedProfit: 4590, asOf: "2026-06-30" }, { noncontrollingIncome: 100, consolidatedProfit: -50, asOf: "2026-06-30" }]) {
      const valuation = valueCompany(route, bundle({ minorityInterest: 0.2 * consolidated, noncontrollingEarnings: earnings }));
      const gap = valuation.gaps.find((g) => g.field === "valuation.dcf.noncontrollingEarningsKey");
      expect(gap?.reason).toMatch(/noncontrolling/i);
      const fairValue = computeFairValue({ valuation, currentPrice: 100, currency: "USD", asOf: "2026-10-22" });
      expect(fairValue.perShare).toBeNull();
      expect(fairValue.reasons[0]).toMatchObject({ field: "valuation.dcf.noncontrollingEarningsKey" });
    }
  });

  it("keeps the bridge at book but publishes no equity value, grids or reverse DCF", () => {
    const valuation = valueCompany(route, bundle({ minorityInterest: 0.2 * consolidated, noncontrollingEarnings: null }));
    if (valuation.kind !== "dcf") throw new Error("expected the DCF route");
    // The bridge stays visible at book, but no equity value or per-share is published.
    expect(valuation.dcf!.bridge.minorityInterest).toBeCloseTo(0.2 * consolidated, 6);
    expect(valuation.dcf!.equityValue).toBeNull();
    expect(valuation.sensitivity).toBeNull();
    expect(valuation.growthMarginGrid).toBeNull();
    expect(valuation.reverseDcf).toBeNull();
  });

  it("does not replace an earlier reason the DCF was not built (panel: ORCL without WACC)", () => {
    const valuation = valueCompany(route, bundle({ waccPct: null, minorityInterest: 0.2 * consolidated, noncontrollingEarnings: null }));
    expect(valuation.gaps.some((g) => g.field === "valuation.dcf.noncontrollingEarningsKey")).toBe(false);
  });

  it("reports a DCF outside its domain on book NCI as outside the domain, not as an NCI gap (panel: NEE)", () => {
    // Book is the smallest deduction the rule allows, so a domain failure on book holds on any key.
    const valuation = valueCompany(route, bundle({ netDebt: consolidated + NET_DEBT + 1, minorityInterest: 0.2 * consolidated, noncontrollingEarnings: null }));
    expect(valuation.gaps.some((g) => g.field === "valuation.dcf.domain")).toBe(true);
    expect(valuation.gaps.some((g) => g.field === "valuation.dcf.noncontrollingEarningsKey")).toBe(false);
    expect(computeFairValue({ valuation, currentPrice: 100, currency: "USD", asOf: "2026-10-22" }).status).toBe("outside-domain");
  });

  it("needs no earnings key without a noncontrolling interest", () => {
    const v = dcfOf({ minorityInterest: 0, noncontrollingEarnings: null });
    expect(v.dcf!.equityValue!).toBeCloseTo(consolidated, 6);
    expect(v.gaps.some((g) => g.field === "valuation.dcf.noncontrollingEarningsKey")).toBe(false);
  });
});
