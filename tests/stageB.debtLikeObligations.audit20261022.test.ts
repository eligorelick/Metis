/**
 * Audit 2026-10-22 E-7: the DCF equity bridge subtracted net debt, NCI and
 * preferred equity only. FCX's companyfacts carry a $3.84B asset-retirement
 * obligation and $2.02B of environmental accruals at 2025-12-31, claims on
 * the enterprise whose settlement the FCFF path does not project, and the
 * bridge had no line for them.
 *
 * The owner's rule: deduct asset-retirement and environmental obligations
 * when they are tagged (the filed total, else noncurrent plus current) and
 * disclose the deduction; when they are not tagged, change nothing. House
 * conventions beside it: a balance tagged in the year before the bridge's
 * date stands in, with its date, when the bridge's quarter does not tag it
 * (FCX tags them in the 10-K only); and assets the filer tags
 * as legally restricted to settle the retirement obligations (nuclear
 * decommissioning trusts) offset them, less any long-term investments the
 * bridge already adds back, so a trust is never credited twice.
 */
import { describe, expect, it } from "vitest";

import type { CompanyFacts } from "@/edgar/xbrl";
import { debtLikeObligationsAt } from "@/pipeline/stageB/debtLikeObligations";
import { computeDcfDisplay } from "@/pipeline/stageB/fairValue";
import { valueCompany, type DcfAssumptionInputs, type MultiplesFrameworkInputs, type ValuationBundleInputs } from "@/pipeline/stageB/valuation";
import { valuationAuditTables } from "@/report/auditTables";
import { fixedBridgeNonOperatingText } from "@/report/scenarioPresentation";
import type { CompanyRoute } from "@/types/core";

const route: CompanyRoute = { base: "general", overlays: [], evidence: { sector: null, industry: null } };

const usd = (end: string, val: number, form = "10-K", filed = "2026-02-12") => ({ end, val, accn: `0000831259-26-${filed.slice(5, 7)}${filed.slice(8)}`, fy: 2025, fp: "FY", form, filed });
const facts = (tags: Record<string, ReturnType<typeof usd>[]>): CompanyFacts =>
  ({ cik: 831259, entityName: "TEST", facts: { "us-gaap": Object.fromEntries(Object.entries(tags).map(([t, pts]) => [t, { units: { USD: pts } }])) } }) as unknown as CompanyFacts;

/** FCX at 2025-12-31 (companyfacts CIK 831259). */
const FCX_FACTS = facts({
  AssetRetirementObligation: [usd("2025-12-31", 3_836e6)],
  AssetRetirementObligationCurrent: [usd("2025-12-31", 188e6)],
  AssetRetirementObligationsNoncurrent: [usd("2025-12-31", 3_648e6)],
  AccrualForEnvironmentalLossContingencies: [usd("2025-12-31", 2_018e6)],
  AccrualForEnvironmentalLossContingenciesGross: [usd("2025-12-31", 4_300e6)],
  AccruedEnvironmentalLossContingenciesCurrent: [usd("2025-12-31", 125e6)],
  AccruedEnvironmentalLossContingenciesNoncurrent: [usd("2025-12-31", 1_893e6)],
});

describe("E-7: reading the filed obligations at the bridge's balance date", () => {
  it("reads the filed totals, not the parts again and not the undiscounted gross", () => {
    const o = debtLikeObligationsAt(FCX_FACTS, "2025-12-31", "USD", "2026-10-22T00:00:00Z");
    expect(o?.assetRetirement?.value).toBe(3_836e6);
    expect(o?.assetRetirement?.basis).toContain("us-gaap/AssetRetirementObligation");
    expect(o?.environmental?.value).toBe(2_018e6);
    expect(o?.environmental?.basis).toContain("us-gaap/AccrualForEnvironmentalLossContingencies");
    expect(o?.settlementAssets).toBeNull();
  });

  it("sums noncurrent and current when the total is not tagged at that date (a 10-Q)", () => {
    const q = facts({
      AssetRetirementObligation: [usd("2025-12-31", 9_625e6)],
      AssetRetirementObligationCurrent: [usd("2026-03-31", 574e6, "10-Q", "2026-05-05")],
      AssetRetirementObligationsNoncurrent: [usd("2026-03-31", 9_036e6, "10-Q", "2026-05-05")],
      AccrualForEnvironmentalLossContingencies: [usd("2026-03-31", 95e6, "10-Q", "2026-05-05")],
      DecommissioningFundInvestments: [usd("2026-03-31", 12_644e6, "10-Q", "2026-05-05")],
    });
    const o = debtLikeObligationsAt(q, "2026-03-31", "USD", "2026-10-22");
    expect(o?.assetRetirement?.value).toBe(9_610e6);
    expect(o?.assetRetirement?.basis).toMatch(/AssetRetirementObligationsNoncurrent.*AssetRetirementObligationCurrent/);
    expect(o?.environmental?.value).toBe(95e6);
    expect(o?.settlementAssets?.value).toBe(12_644e6);
  });

  it("falls back to the latest filed balance within a year when the bridge's quarter does not tag them (FCX tags them in the 10-K only)", () => {
    const o = debtLikeObligationsAt(FCX_FACTS, "2026-06-30", "USD", "2026-10-22");
    expect(o?.assetRetirement?.value).toBe(3_836e6);
    expect(o?.assetRetirement?.basis).toMatch(/at 2025-12-31 \(10-K filed 2026-02-12\); the latest filed balance, as the 2026-06-30 balance sheet does not tag it/);
    expect(o?.environmental?.value).toBe(2_018e6);
    // The earlier balance date travels with each figure, for the bridge's label.
    expect(o?.assetRetirement?.asOf).toBe("2025-12-31");
    expect(o?.environmental?.asOf).toBe("2025-12-31");
    expect(debtLikeObligationsAt(FCX_FACTS, "2025-12-31", "USD", "2026-10-22")?.assetRetirement?.asOf).toBeUndefined();
    // A balance dated after the bridge's is not read.
    const later = facts({ AssetRetirementObligation: [usd("2026-09-30", 4_000e6, "10-Q", "2026-10-20")] });
    expect(debtLikeObligationsAt(later, "2026-06-30", "USD", "2026-10-22")).toBeNull();
  });

  it("reads the retirement fund at the date of the obligation it offsets", () => {
    const q = facts({
      AssetRetirementObligation: [usd("2025-12-31", 9_625e6)],
      DecommissioningFundInvestments: [usd("2025-12-31", 11_900e6), usd("2026-06-30", 12_644e6, "10-Q", "2026-08-05")],
    });
    const o = debtLikeObligationsAt(q, "2026-06-30", "USD", "2026-10-22");
    expect(o?.assetRetirement?.value).toBe(9_625e6);
    expect(o?.settlementAssets?.value).toBe(11_900e6);
  });

  it("changes nothing when nothing is tagged at the balance date or in the year before it", () => {
    expect(debtLikeObligationsAt(facts({}), "2025-12-31", "USD", "2026-10-22")).toBeNull();
    // A balance more than a year older than the bridge's, or filed after the run, is not evidence for this balance sheet.
    expect(debtLikeObligationsAt(FCX_FACTS, "2027-01-02", "USD", "2027-03-01")).toBeNull();
    expect(debtLikeObligationsAt(FCX_FACTS, "2025-12-31", "USD", "2026-01-31")).toBeNull();
    expect(debtLikeObligationsAt(FCX_FACTS, "2025-12-31", "EUR", "2026-10-22")).toBeNull();
    expect(debtLikeObligationsAt(null, "2025-12-31", "USD", "2026-10-22")).toBeNull();
  });
});

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

const bundle = (over: Partial<ValuationBundleInputs> = {}): ValuationBundleInputs => ({
  currentPrice: 100,
  waccPct: 9,
  netDebt: 200,
  dilutedShares: 100,
  dcfInputs: steady,
  multiples,
  excessReturn: null,
  reit: null,
  ...over,
});

function dcfOf(over: Partial<ValuationBundleInputs> = {}) {
  const valuation = valueCompany(route, bundle(over));
  if (valuation.kind !== "dcf" || valuation.dcf === null) throw new Error("expected the DCF route");
  return valuation;
}

const filed = (value: number, tag: string) => ({ value, basis: `us-gaap/${tag} ${value} at 2025-12-31 (10-K filed 2026-02-12)` });

describe("E-7: the equity bridge deducts tagged retirement and environmental obligations", () => {
  const base = dcfOf();
  const withObligations = dcfOf({ debtLikeObligations: {
    assetRetirement: filed(384, "AssetRetirementObligation"), environmental: filed(202, "AccrualForEnvironmentalLossContingencies"), settlementAssets: null,
  } });

  it("lowers equity value by the filed amounts, before tax, and says so", () => {
    expect(withObligations.dcf!.enterpriseValue).toBeCloseTo(base.dcf!.enterpriseValue, 9);
    expect(withObligations.dcf!.equityValue! - base.dcf!.equityValue!).toBeCloseTo(-586, 6);
    expect(withObligations.dcf!.perShare! - base.dcf!.perShare!).toBeCloseTo(-5.86, 6);
    const notes = withObligations.notes.join(" ");
    expect(notes).toMatch(/subtracts asset-retirement obligations of 384/);
    expect(notes).toMatch(/subtracts environmental remediation accruals of 202/);
    expect(notes).toMatch(/FCFF path does not project their settlement/);
  });

  it("shows each deduction as its own bridge line on every surface", () => {
    const display = computeDcfDisplay(withObligations, "USD");
    const table = valuationAuditTables({ ...display!, perShare: null } as never).find((t) => t.heading === "Enterprise value to equity bridge")!;
    const labels = table.rows.map((r) => r[0]);
    expect(labels.some((l) => /^Less asset-retirement obligations/.test(l))).toBe(true);
    expect(labels.some((l) => /^Less environmental remediation accruals/.test(l))).toBe(true);
    expect(labels.some((l) => /^Plus non-operating/.test(l))).toBe(false);
  });

  it("names an earlier balance date on the bridge line, which otherwise reads as the bridge's own balance sheet", () => {
    const earlier = dcfOf({ debtLikeObligations: {
      assetRetirement: { ...filed(384, "AssetRetirementObligation"), asOf: "2025-09-30" }, environmental: filed(202, "AccrualForEnvironmentalLossContingencies"), settlementAssets: null,
    } });
    const display = computeDcfDisplay(earlier, "USD");
    const labels = valuationAuditTables({ ...display!, perShare: null } as never).find((t) => t.heading === "Enterprise value to equity bridge")!.rows.map((r) => r[0]);
    expect(labels).toContain("Less asset-retirement obligations (filed, before tax; balance at 2025-09-30, the latest filed)");
    expect(labels).toContain("Less environmental remediation accruals (filed, before tax)");
    expect(fixedBridgeNonOperatingText(earlier.dcf!.bridge, (v) => v.toFixed(2))).toBe(", less asset-retirement obligations 384.00, less environmental remediation accruals 202.00");
  });

  it("carries the same bridge into the sensitivity grid and the reverse DCF", () => {
    const centre = withObligations.sensitivity!.perShare[Math.floor(withObligations.sensitivity!.perShare.length / 2)];
    expect(centre[Math.floor(centre.length / 2)]).toBeCloseTo(withObligations.dcf!.perShare!, 6);
    expect(withObligations.dcf!.bridge.nonOperatingAssets).toBeCloseTo(-586, 9);
  });

  it("states the deductions in the scenario paths' fixed bridge, with no empty 'plus' clause", () => {
    const text = fixedBridgeNonOperatingText(withObligations.dcf!.bridge, (v) => v.toFixed(2));
    expect(text).toBe(", less asset-retirement obligations 384.00, less environmental remediation accruals 202.00");
  });

  it("changes nothing when no obligation is tagged", () => {
    const untagged = dcfOf({ debtLikeObligations: null });
    expect(untagged.dcf!.perShare).toBe(base.dcf!.perShare);
    expect(untagged.dcf!.bridge).toEqual(base.dcf!.bridge);
  });

  it("offsets legally restricted settlement funds against the retirement obligation, never below zero", () => {
    const trust = dcfOf({ debtLikeObligations: {
      assetRetirement: filed(961, "AssetRetirementObligationsNoncurrent"), environmental: filed(9.5, "AccrualForEnvironmentalLossContingencies"),
      settlementAssets: filed(1264, "DecommissioningFundInvestments"),
    } });
    expect(trust.dcf!.equityValue! - base.dcf!.equityValue!).toBeCloseTo(-9.5, 6);
    expect(trust.notes.join(" ")).toMatch(/legally restricted to settle them .*1264/);
  });

  it("credits only the part of a settlement fund the bridge has not already added as long-term investments", () => {
    const lti = { ...steady, balance: { ...steady.balance!, longTermInvestments: 50 } };
    const withLti = dcfOf({ dcfInputs: lti });
    const v = dcfOf({ dcfInputs: lti, debtLikeObligations: { assetRetirement: filed(300, "AssetRetirementObligation"), environmental: null, settlementAssets: filed(200, "DecommissioningFundInvestments") } });
    // 300 − (200 − 50) = 150 is deducted.
    expect(v.dcf!.equityValue! - withLti.dcf!.equityValue!).toBeCloseTo(-150, 6);
  });
});
