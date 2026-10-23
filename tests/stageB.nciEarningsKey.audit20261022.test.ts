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

import { ttmIncome } from "@/pipeline/compute";
import { computeDcfDisplay, computeFairValue } from "@/pipeline/stageB/fairValue";
import { NCI_EARNINGS_KEY_MATERIALITY_PCT, noncontrollingEarningsInput, valueCompany, type DcfAssumptionInputs, type MultiplesFrameworkInputs, type ValuationBundleInputs } from "@/pipeline/stageB/valuation";
import { valuationAuditTables } from "@/report/auditTables";
import { fixedBridgeMinorityText } from "@/report/scenarioPresentation";
import type { CompanyRoute } from "@/types/core";

import { currencyBundle } from "./helpers/currencyBundle";

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

  it("applies the earnings key when book NCI is zero but NCI earns a share of profit", () => {
    // A zero book balance does not negate the outside claim the income shows (Codex review, PR #49).
    const v = dcfOf({ minorityInterest: 0, noncontrollingEarnings: { noncontrollingIncome: 30, consolidatedProfit: 100, asOf: "2026-06-30" } });
    expect(v.dcf!.bridge.noncontrollingEarningsShare).toBeCloseTo(0.3, 12);
    expect(v.dcf!.bridge.noncontrollingDeducted).toBeCloseTo(0.3 * consolidated, 6);
    expect(v.dcf!.equityValue!).toBeCloseTo(0.7 * consolidated, 6);
    // At or under the threshold the deduction stays at book, here zero, and the share is stated.
    const small = dcfOf({ minorityInterest: 0, noncontrollingEarnings: { noncontrollingIncome: 8, consolidatedProfit: 100, asOf: "2026-06-30" } });
    expect(small.dcf!.equityValue!).toBeCloseTo(consolidated, 6);
    expect(small.dcf!.notes.join(" ")).toMatch(/8\.0% share of trailing consolidated profit/);
    // NCI income with no consolidated profit to size it withholds the per-share value.
    const unsized = dcfOf({ minorityInterest: 0, noncontrollingEarnings: { noncontrollingIncome: 30, consolidatedProfit: null, asOf: "2026-06-30" } });
    expect(unsized.gaps.some((g) => g.field === "valuation.dcf.noncontrollingEarningsKey")).toBe(true);
    expect(unsized.dcf!.perShare).toBeNull();
  });

  it("withholds the per-share value when NCI earns a profit but its book value is unavailable", () => {
    // Neither book nor the larger of book and the profit share can be set (Codex review, PR #49).
    for (const income of [30, 8]) {
      const v = dcfOf({ minorityInterest: null, noncontrollingEarnings: { noncontrollingIncome: income, consolidatedProfit: 100, asOf: "2026-06-30" } });
      const reason = v.gaps.find((g) => g.field === "valuation.dcf.noncontrollingEarningsKey")?.reason ?? "";
      expect(reason).toMatch(/book value is unavailable/);
      expect(v.dcf!.perShare).toBeNull();
    }
    // No book balance and no NCI income: no claim, no withhold.
    const none = dcfOf({ minorityInterest: null, noncontrollingEarnings: null });
    expect(none.gaps.some((g) => g.field === "valuation.dcf.noncontrollingEarningsKey")).toBe(false);
    expect(none.dcf!.perShare).not.toBeNull();
  });
});

describe("E-5 review fixes", () => {
  it("does not read a profit share above 100% as a claim larger than the whole equity value", () => {
    // The parent lost money while the subsidiaries' outside holders earned 60 of a consolidated 10.
    const valuation = valueCompany(route, bundle({ minorityInterest: 0.05 * consolidated, noncontrollingEarnings: { noncontrollingIncome: 60, consolidatedProfit: 10, asOf: "2026-06-30" } }));
    expect(valuation.gaps.some((g) => g.field === "valuation.dcf.domain")).toBe(false);
    const gap = valuation.gaps.find((g) => g.field === "valuation.dcf.noncontrollingEarningsKey");
    expect(gap?.reason).toMatch(/trailing profit attributable to noncontrolling interests 60 exceeds consolidated profit 10, so the parent's own share is negative/);
    const fairValue = computeFairValue({ valuation, currentPrice: 100, currency: "USD", asOf: "2026-10-22" });
    expect(fairValue.perShare).toBeNull();
    expect(fairValue.reasons[0]).toMatchObject({ field: "valuation.dcf.noncontrollingEarningsKey" });
  });

  it("keeps an earlier gate's reason when the per-share value was already unavailable", () => {
    const valuation = valueCompany(route, bundle({ dilutedShares: null, minorityInterest: 0.2 * consolidated, noncontrollingEarnings: null }));
    if (valuation.kind !== "dcf") throw new Error("expected the DCF route");
    expect(valuation.dcf).not.toBeNull();
    const fairValue = computeFairValue({ valuation, currentPrice: 100, currency: "USD", asOf: "2026-10-22" });
    expect(fairValue.perShare).toBeNull();
    expect(fairValue.reasons[0]?.field).not.toBe("valuation.dcf.noncontrollingEarningsKey");
  });

  it(`says a share of ${NCI_EARNINGS_KEY_MATERIALITY_PCT}% or less is under the threshold, not that it would deduct no more`, () => {
    const v = dcfOf({ minorityInterest: 0.001 * consolidated, noncontrollingEarnings: { noncontrollingIncome: 8, consolidatedProfit: 100, asOf: "2026-06-30" } });
    const basis = computeDcfDisplay(v, "USD").bridge?.noncontrollingBasis ?? "";
    expect(basis).toMatch(/8\.0% share of trailing consolidated profit to 2026-06-30 is not above the 10% house threshold/);
    expect(basis).not.toMatch(/would not deduct more/);
  });

  it("states a fiscal-year key as fiscal-year profit", () => {
    const v = dcfOf({ minorityInterest: 0.273 * consolidated, noncontrollingEarnings: { noncontrollingIncome: 1645, consolidatedProfit: 4590, asOf: "2025-12-31", basis: "annual" } });
    expect(v.dcf!.notes.join(" ")).toMatch(/35\.8% share of fiscal-year consolidated profit to 2025-12-31/);
    expect(computeDcfDisplay(v, "USD").bridge?.noncontrollingBasis).toMatch(/35\.8% share of fiscal-year consolidated profit to 2025-12-31/);
  });

  it("describes the scenario bridge as the larger of the two whenever the share is above the threshold", () => {
    // The base path deducts book, but a richer path's consolidated equity can tip it onto the earnings key.
    const book = 0.3 * consolidated;
    const v = dcfOf({ minorityInterest: book, noncontrollingEarnings: { noncontrollingIncome: 20, consolidatedProfit: 100, asOf: "2026-06-30" } });
    expect(v.dcf!.bridge.noncontrollingDeductionBasis).toBe("book");
    expect(fixedBridgeMinorityText(v.dcf!.bridge, (x) => String(x))).toMatch(/the larger of its book value .* and its 20\.0% share of trailing consolidated profit/);
    const small = dcfOf({ minorityInterest: book, noncontrollingEarnings: { noncontrollingIncome: 8, consolidatedProfit: 100, asOf: "2026-06-30" } });
    expect(fixedBridgeMinorityText(small.dcf!.bridge, (x) => String(x))).toBe(String(book));
  });
});

describe("E-5: the earnings key's inputs", () => {
  const ttm = { date: "2026-06-30", netIncome: 100, netIncomeOwnershipBasis: "parent" as const, netIncomeAttributableToNoncontrollingInterest: 30 };
  const annual = { date: "2025-12-31", netIncome: 90, netIncomeConsolidated: 115, netIncomeAttributableToNoncontrollingInterest: 25 };

  it("uses the trailing four quarters when they carry both figures", () => {
    expect(noncontrollingEarningsInput(ttm, annual)).toEqual({ noncontrollingIncome: 30, consolidatedProfit: 130, asOf: "2026-06-30", basis: "ttm" });
  });

  it("falls back to the latest fiscal year, as the DCF's income does, when the trailing window cannot size the key", () => {
    expect(noncontrollingEarningsInput(null, annual)).toEqual({ noncontrollingIncome: 25, consolidatedProfit: 115, asOf: "2025-12-31", basis: "annual" });
    expect(noncontrollingEarningsInput({ ...ttm, netIncomeAttributableToNoncontrollingInterest: null }, annual)).toMatchObject({ basis: "annual" });
  });

  it("does not read a zero NCI income without field evidence as an established 0% share", () => {
    // A vendor row can emit an omitted field as 0; only a filed zero sizes the key.
    const zeroTtm = { ...ttm, netIncomeAttributableToNoncontrollingInterest: 0 };
    const zeroAnnual = { ...annual, netIncomeAttributableToNoncontrollingInterest: 0 };
    expect(noncontrollingEarningsInput(zeroTtm, zeroAnnual)?.noncontrollingIncome).toBeNull();
    expect(noncontrollingEarningsInput({ ...zeroTtm, noncontrollingIncomeEvidenced: true }, zeroAnnual)).toMatchObject({ basis: "ttm", noncontrollingIncome: 0 });
    expect(noncontrollingEarningsInput(zeroTtm, { ...zeroAnnual, noncontrollingIncomeEvidenced: true })).toMatchObject({ basis: "annual", noncontrollingIncome: 0 });
    // A nonzero figure stands on its own.
    expect(noncontrollingEarningsInput(ttm, annual)).toMatchObject({ basis: "ttm", noncontrollingIncome: 30 });
  });

  it("does not size the key from a trailing sum one of whose quarters is an unevidenced zero", () => {
    // Three quarters report 10 and one is a vendor zero: the 30 sum may omit a
    // quarter, so the fiscal year sizes the key instead (Codex review, PR #49).
    const partial = { ...ttm, noncontrollingIncomeUnevidencedZero: true };
    expect(noncontrollingEarningsInput(partial, annual)).toMatchObject({ basis: "annual", noncontrollingIncome: 25 });
    expect(noncontrollingEarningsInput(partial, null)?.noncontrollingIncome).toBeNull();
  });

  it("marks a trailing window whose quarter reports zero NCI income without a filed fact", () => {
    const bundle = currencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    if (!bundle.statements.incomeQuarterly.ok) throw new Error("fixture income unavailable");
    const quarters = bundle.statements.incomeQuarterly.value.data.rows.slice(0, 4)
      .map((row, i) => ({ ...row, netIncomeConsolidated: 875, netIncomeAttributableToNoncontrollingInterest: i === 2 ? 0 : 10 }));
    const window = ttmIncome(quarters)!;
    expect(window.netIncomeAttributableToNoncontrollingInterest).toBe(30);
    expect(window.noncontrollingIncomeUnevidencedZero).toBe(true);
    // Every quarter nonzero, or the zero quarter filed: the sum stands.
    expect(ttmIncome(quarters.map((row) => ({ ...row, netIncomeAttributableToNoncontrollingInterest: 10 })))!.noncontrollingIncomeUnevidencedZero).toBe(false);
    const filed = quarters.map((row, i) => i === 2 ? { ...row, fieldProvenance: { netIncomeAttributableToNoncontrollingInterest: { tags: ["us-gaap/NetIncomeLossAttributableToNoncontrollingInterest"], unit: "USD", periodEnd: String(row.date), filings: [] } } } : row);
    expect(ttmIncome(filed as unknown as typeof quarters)!.noncontrollingIncomeUnevidencedZero).toBe(false);
  });

  it("falls back to the fiscal year when the trailing window is complete but cannot size the key", () => {
    // A trailing consolidated loss, and NCI income above consolidated profit.
    expect(noncontrollingEarningsInput({ ...ttm, netIncome: -5, netIncomeAttributableToNoncontrollingInterest: 2 }, annual)).toMatchObject({ basis: "annual", noncontrollingIncome: 25 });
    expect(noncontrollingEarningsInput({ ...ttm, netIncome: -10, netIncomeAttributableToNoncontrollingInterest: 30 }, annual)).toMatchObject({ basis: "annual" });
    // With no usable fiscal year, the trailing window stays, so the reason names what it lacked.
    expect(noncontrollingEarningsInput({ ...ttm, netIncome: -5, netIncomeAttributableToNoncontrollingInterest: 2 }, null)).toMatchObject({ basis: "ttm", consolidatedProfit: -3 });
  });

  it("says the withhold tried both periods", () => {
    const valuation = valueCompany(route, bundle({ minorityInterest: 0.2 * consolidated, noncontrollingEarnings: { noncontrollingIncome: null, consolidatedProfit: 4590, asOf: "2026-06-30", basis: "ttm" } }));
    const reason = valuation.gaps.find((g) => g.field === "valuation.dcf.noncontrollingEarningsKey")?.reason ?? "";
    expect(reason).toMatch(/from neither the trailing four quarters nor the latest fiscal year/);
    expect(reason).toMatch(/\(trailing profit attributable to noncontrolling interests unavailable\)/);
  });

  it("does not add NCI income to a net income whose ownership is unknown", () => {
    const key = noncontrollingEarningsInput({ ...ttm, netIncomeOwnershipBasis: undefined }, null);
    expect(key).toMatchObject({ noncontrollingIncome: 30, consolidatedProfit: null, basis: "ttm" });
  });
});
