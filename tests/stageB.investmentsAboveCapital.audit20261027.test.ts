/**
 * Audit 2026-10-27 FIN-304 (batch B4, Task 5): a holding that exceeds invested
 * capital is still valued, and sales-to-capital is continuous at the boundary.
 *
 * Long-term investments are non-operating (D-60): the sales-to-capital
 * denominator removes them and the equity bridge adds them back at carrying
 * value less the tax a sale would owe (D-65). When the holding met or exceeded
 * the capital, the D-58 fallback kept the holding in the denominator AND dropped
 * the add-back, so one more dollar of investments lowered the DCF value by
 * hundreds of millions. The operating ratio then approaches the house cap from
 * below, so the cap is the continuous value at the boundary.
 *
 * Hermetic: direct `valueCompany` / `buildDcfAssumptions` fixtures; seed
 * `probes/FIN-304.probe.ts` with every `fs` read and write dropped.
 */
import { describe, expect, it } from "vitest";

import {
  buildDcfAssumptions,
  establishedSalesToCapital,
  S2C_CLAMP,
  valueCompany,
  type DcfAssumptionInputs,
  type DcfBalanceRow,
  type MultiplesFrameworkInputs,
  type ValuationBundleInputs,
} from "@/pipeline/stageB/valuation";
import type { CompanyRoute } from "@/types/core";

const route: CompanyRoute = { base: "general", overlays: [], evidence: { sector: null, industry: null } };

const multiples: MultiplesFrameworkInputs = {
  quote: { price: 100, marketCap: 10000, currency: "USD" },
  reportedCurrency: "USD",
  incomeTtm: { date: "2025-12-31", revenue: 1000, operatingIncome: 200, depreciationAndAmortization: 50, netIncome: 144, epsDiluted: 1.44 },
  cashFlowTtm: { date: "2025-12-31", operatingCashFlow: 180, capitalExpenditure: -30, depreciationAndAmortization: 50 },
  balance: { date: "2025-12-31", totalDebt: 300, cashAndShortTermInvestments: 100, totalStockholdersEquity: 500, goodwill: 50, intangibleAssets: 50, minorityInterest: 0, preferredStock: 0 },
};

// Revenue 1000, total debt 300, equity 500, cash 100: invested capital 700.
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

const withBalance = (over: Partial<DcfBalanceRow>): DcfAssumptionInputs => ({ ...steady, balance: { ...steady.balance!, ...over } });

const bundle = (dcfInputs: DcfAssumptionInputs): ValuationBundleInputs => ({
  currentPrice: 100, waccPct: 9, netDebt: 200, dilutedShares: 100, dcfInputs, multiples, excessReturn: null, reit: null,
});

function valued(dcfInputs: DcfAssumptionInputs) {
  const v = valueCompany(route, bundle(dcfInputs));
  if (v.kind !== "dcf" || v.dcf === null) throw new Error("expected the DCF route");
  return v.dcf;
}

const taxFraction = (dcfInputs: DcfAssumptionInputs): number => {
  const a = buildDcfAssumptions(dcfInputs).assumptions!;
  return a.investmentTax!.ratePct / 100;
};

describe("FIN-304: a holding above invested capital is still valued", () => {
  it("1 more of long-term investments never lowers DCF equity value", () => {
    let previous = -Infinity;
    for (const lti of [0, 350, 690, 699, 700, 701, 900]) {
      const equity = valued(withBalance({ longTermInvestments: lti })).equityValue!;
      expect(equity, `lti ${lti}`).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = equity;
    }
  });

  it("a holding above invested capital is added back at carrying value less the investment tax", () => {
    const belowInputs = withBalance({ longTermInvestments: 699 });
    const aboveInputs = withBalance({ longTermInvestments: 701 });
    const below = valued(belowInputs);
    const above = valued(aboveInputs);
    const t = taxFraction(aboveInputs);
    expect(above.equityValue! - below.equityValue!).toBeCloseTo((701 - 699) * (1 - t), 6);
    expect(above.bridge?.nonOperatingComponents ?? []).toContainEqual(expect.objectContaining({ kind: "long-term-investments", value: 701, basis: expect.stringMatching(/not positive once long-term investments .* are removed/) }));
    const a = buildDcfAssumptions(aboveInputs).assumptions!;
    const b = buildDcfAssumptions(belowInputs).assumptions!;
    expect(a.salesToCapital.value).toBe(S2C_CLAMP[1]);
    expect(b.salesToCapital.value).toBe(S2C_CLAMP[1]);
    expect(a.salesToCapital.basis).toMatch(/not positive once long-term investments .* are removed.*house cap/);
    expect(a.salesToCapital.basis).not.toMatch(/Infinity|NaN/);
    expect(a.nonOperatingInvestments).toEqual({ value: 701, balanceDate: "2025-12-31", basis: expect.stringMatching(/exceed|not positive/) });
    // Exactly at the boundary (operating capital zero) is the same case.
    const atBoundary = buildDcfAssumptions(withBalance({ longTermInvestments: 700 })).assumptions!;
    expect(atBoundary.salesToCapital.value).toBe(S2C_CLAMP[1]);
    expect(atBoundary.nonOperatingInvestments).toMatchObject({ value: 700, balanceDate: "2025-12-31" });
  });

  it("a holding well inside capital is unchanged", () => {
    const a = buildDcfAssumptions(withBalance({ longTermInvestments: 350 })).assumptions!;
    expect(a.salesToCapital.value).toBeCloseTo(1000 / 350, 9);
    expect(a.nonOperatingInvestments).toEqual({ value: 350, balanceDate: "2025-12-31" });
    expect(a.salesToCapital.basis).not.toMatch(/house cap/);
    // No holding: nothing recorded.
    expect(buildDcfAssumptions(steady).assumptions!.nonOperatingInvestments).toBeUndefined();
  });
});

describe("FIN-304: the A-2 history counts a year whose holding meets its capital at the house cap", () => {
  const income = [["2023", 800], ["2024", 900], ["2025", 1000]].map(([y, revenue]) => ({ date: `${y}-12-31`, revenue: revenue as number, operatingIncome: (revenue as number) / 5 }));
  const row = (y: string, over: Partial<DcfBalanceRow> = {}): DcfBalanceRow => ({
    date: `${y}-12-31`, basis: "annual", totalDebt: 300, totalStockholdersEquity: 2000, cashAndShortTermInvestments: 100, ...over,
  });
  const lease = { fcx1Excluded: false, includeLeasesInEv: false, currentRowExcludesLease: true };

  it("a history year whose holding meets its capital counts at the house cap", () => {
    const history = establishedSalesToCapital(income, [row("2023"), row("2024", { totalStockholdersEquity: 500, longTermInvestments: 800 }), row("2025")], lease);
    // FY2024: invested capital 700, holding 800 -> the cap (HEAD: 900 / 700 = 1.2857x, revenue over the full capital).
    expect(history.basis).toContain("FY2024-12-31 5.0000x");
    expect(history.basis).not.toContain("1.2857x");
    expect(history.basis).toContain("FY2023-12-31 0.3636x");
    expect(history.basis).toContain("FY2025-12-31 0.4545x");
    expect(history.ratio).toBeCloseTo(0.4545454545, 6);
  });

  it("a year with a holding inside its capital is unchanged", () => {
    const inside = establishedSalesToCapital(income, [row("2023"), row("2024", { longTermInvestments: 500 }), row("2025")], lease);
    expect(inside.basis).toContain("FY2024-12-31 0.5294x"); // 900 / (2200 - 500)
  });
});

describe("FIN-304: precedence with the lease-emptied branch (Task 4, I6)", () => {
  const base = {
    revenueCagr3yPct: 8, revenueCagr5yPct: 8, analystEstimates: null, waccPct: 10, riskFreePct: 4, marketCap: 20e9,
    incomeTtm: { date: "2026-03-31", revenue: 1000e6, operatingIncome: 200e6, incomeBeforeTax: 180e6, incomeTaxExpense: 36e6 },
  };
  const income = [2021, 2022, 2023, 2024, 2025].map((y, i) => ({ date: `${y}-12-31`, revenue: (600 + 100 * i) * 1e6, operatingIncome: 100e6, incomeBeforeTax: 90e6, incomeTaxExpense: 18e6 }));
  const lessee = (over: Partial<DcfBalanceRow> = {}): DcfBalanceRow => ({
    date: "2026-03-31", basis: "quarter", totalDebt: 300e6, shortTermDebt: 10e6, longTermDebt: 40e6,
    operatingLeaseLiability: 250e6, capitalLeaseObligations: 250e6, financeLeaseLiability: 0,
    totalStockholdersEquity: 500e6, cashAndShortTermInvestments: 100e6, ...over,
  });

  it("lease exclusion that empties operating capital takes the cap", () => {
    // Total debt 300 holds a covered operating lease of 250: invested capital 700 lease-inclusive, 450 once the lease leaves debt.
    const at = (lti: number): DcfAssumptionInputs => ({ ...base, incomeHistory: income, balance: lessee({ longTermInvestments: lti * 1e6 }) });
    const low = valued2(at(440));
    const high = valued2(at(460));
    expect(buildDcfAssumptions(at(440)).assumptions!.salesToCapital.value).toBe(S2C_CLAMP[1]);
    const a460 = buildDcfAssumptions(at(460)).assumptions!;
    expect(a460.salesToCapital.value).toBe(S2C_CLAMP[1]);
    expect(a460.nonOperatingInvestments).toMatchObject({ value: 460e6, balanceDate: "2026-03-31" });
    const t = a460.investmentTax!.ratePct / 100;
    expect(high.equityValue! - low.equityValue!).toBeCloseTo(20e6 * (1 - t), 6);
  });

  it("an I6 case with a holding takes I6's history ratio, not the house cap", () => {
    // Equity -100: invested capital 150 lease-inclusive, -100 once the lease leaves debt (ic <= 0), so I6 runs and Task 5's rule must not.
    const capitalHistory = [2023, 2024, 2025].map((y): DcfBalanceRow => ({ ...lessee(), date: `${y}-12-31`, basis: "annual" }));
    const inputs: DcfAssumptionInputs = { ...base, incomeHistory: income, capitalHistory, balance: lessee({ totalStockholdersEquity: -100e6, cashAndShortTermInvestments: 50e6, longTermInvestments: 30e6 }) };
    const history = establishedSalesToCapital(income, capitalHistory, { fcx1Excluded: false, includeLeasesInEv: false, currentRowExcludesLease: true });
    expect(history.ratio).not.toBeNull();
    expect(history.ratio).not.toBe(S2C_CLAMP[1]);
    const a = buildDcfAssumptions(inputs).assumptions!;
    expect(a.salesToCapital.value).toBeCloseTo(history.ratio as number, 9);
    expect(a.salesToCapital.value).not.toBe(S2C_CLAMP[1]);
    expect(a.salesToCapital.basis).toMatch(/not positive once the operating lease .* leaves debt/);
    expect(a.salesToCapital.basis).not.toMatch(/not positive once long-term investments/);
    expect(a.nonOperatingInvestments).toEqual({ value: 30e6, balanceDate: "2026-03-31" });
  });

  function valued2(dcfInputs: DcfAssumptionInputs) {
    const m: MultiplesFrameworkInputs = {
      quote: { price: 100, marketCap: 10e9, currency: "USD" }, reportedCurrency: "USD",
      incomeTtm: { date: "2026-03-31", revenue: 1000e6, operatingIncome: 200e6, depreciationAndAmortization: 50e6, netIncome: 144e6, epsDiluted: 1.44 },
      cashFlowTtm: { date: "2026-03-31", operatingCashFlow: 180e6, capitalExpenditure: -30e6, depreciationAndAmortization: 50e6 },
      balance: { date: "2026-03-31", totalDebt: 300e6, cashAndShortTermInvestments: 100e6, totalStockholdersEquity: 500e6, goodwill: 0, intangibleAssets: 0, minorityInterest: 0, preferredStock: 0 },
    };
    const v = valueCompany(route, { currentPrice: 100, waccPct: 10, netDebt: 150e6, dilutedShares: 100e6, multiples: m, excessReturn: null, reit: null, dcfInputs });
    if (v.kind !== "dcf" || v.dcf === null) throw new Error("expected the DCF route");
    return v.dcf;
  }
});
