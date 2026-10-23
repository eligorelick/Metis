import { describe, expect, it } from "vitest";
import { excessReturnModel, multiplesFramework, percentileRank, type MultiplesFrameworkInputs } from "@/pipeline/stageB/valuation";
import { describeFinancialValuation } from "@/pipeline/stageB/valuationAssumptions";

function inputs(extra: Record<string, unknown> = {}): MultiplesFrameworkInputs {
  return {
    reportedCurrency: "USD",
    quote: { price: 50, marketCap: 1_000, currency: "USD" },
    incomeTtm: { date: "2025-12-31", revenue: 100, operatingIncome: 20, netIncome: 10, epsDiluted: null },
    cashFlowTtm: null,
    balance: { date: "2025-12-31", totalDebt: 0, cashAndShortTermInvestments: 0, totalStockholdersEquity: 200, goodwill: 0, intangibleAssets: 0, preferredStock: 0, minorityInterest: 0 },
    ...extra,
  } as MultiplesFrameworkInputs;
}
const multiple = (input: MultiplesFrameworkInputs, key: string) => multiplesFramework("bank", input).multiples.find((m) => m.key === key)!;
const security = (ratio: number, from: string, to: string | null = null) => ({
  issuerId: "issuer", securityId: "ADS", ordinaryClassId: "ordinary", quoteUnit: "ADS", ordinarySharesPerQuotedUnit: ratio,
  effectiveFrom: from, effectiveTo: to, sourceHash: "retained-primary-source-hash", sourceIds: ["issuer:deposit-agreement"],
});

describe("common-holder multiples", () => {
  it("uses common equity after known preferred rather than total stockholders equity", () => {
    const input = inputs();
    input.balance!.preferredStock = 100;
    expect(multiple(input, "priceToBook").current).toBe(10);
    expect(multiple(input, "priceToTbv").current).toBe(10);
  });

  it("uses filed common earnings when EPS is absent", () => {
    const input = inputs();
    Object.assign(input.incomeTtm!, { netIncomeAvailableToCommon: 5 });
    input.balance!.preferredStock = 100;
    expect(multiple(input, "peTtm").current).toBe(200);
  });

  it("withholds fallback P/E when preferred income allocation is unavailable", () => {
    const input = inputs();
    input.balance!.preferredStock = 100;
    const result = multiplesFramework("bank", input);
    expect(result.multiples.find((m) => m.key === "peTtm")!.current).toBeNull();
    expect(result.gaps.some((g) => /common.*income|common.*earnings/i.test(g.reason))).toBe(true);
  });

  it("does not subtract known NCI twice from parent stockholders equity", () => {
    const input = inputs();
    input.balance!.minorityInterest = 50;
    expect(multiple(input, "priceToBook").current).toBe(5);
  });

  it("removes NCI when the caller explicitly supplies consolidated equity", () => {
    const input = inputs();
    Object.assign(input.balance!, { minorityInterest: 50, equityOwnershipBasis: "consolidated" });
    expect(multiple(input, "priceToBook").current).toBeCloseTo(1_000 / 150);
  });

  it("withholds total-income fallback beside NCI when ownership basis is unknown", () => {
    const input = inputs();
    input.balance!.minorityInterest = 50;
    expect(multiple(input, "peTtm").current).toBeNull();
  });

  it("retains ordinary known-zero preferred and NCI controls", () => {
    expect(multiple(inputs(), "peTtm").current).toBe(100);
    expect(multiple(inputs(), "priceToBook").current).toBe(5);
  });
});

describe("ADR EPS admission", () => {
  function adr(extra: Record<string, unknown> = {}) {
    return inputs({
      quote: { price: 50, marketCap: null, currency: "USD", isAdr: true },
      incomeTtm: { date: "2025-12-31", revenue: 100, operatingIncome: 20, netIncome: null, epsDiluted: 2, epsSecurityBasis: "ordinary" },
      securityBasisAsOf: "2026-01-01",
      ...extra,
    });
  }

  it("withholds price/EPS when a dated ADR ratio is unavailable", () => {
    const result = multiplesFramework("bank", adr());
    expect(result.multiples.find((m) => m.key === "peTtm")!.current).toBeNull();
    expect(result.gaps.some((g) => /ADR|ADS/.test(g.reason))).toBe(true);
  });

  it("converts ordinary EPS with verified effective-dated ADS evidence", () => {
    expect(multiple(adr({ securityBasis: [security(5, "2025-01-01")] }), "peTtm").current).toBe(5);
  });

  it("does not adjust EPS already expressed per quoted ADS twice", () => {
    const input = adr({ securityBasis: [security(5, "2025-01-01")] });
    Object.assign(input.incomeTtm!, { epsDiluted: 10, epsSecurityBasis: "quoted" });
    expect(multiple(input, "peTtm").current).toBe(5);
  });

  it("rejects expired and conflicting security ratios", () => {
    expect(multiple(adr({ securityBasis: [security(5, "2025-01-01", "2025-12-31")] }), "peTtm").current).toBeNull();
    expect(multiple(adr({ securityBasis: [security(5, "2025-01-01"), security(2, "2025-01-01")] }), "peTtm").current).toBeNull();
  });

  it("rejects impossible calendar dates in security evidence and observations", () => {
    expect(multiple(adr({ securityBasis: [security(5, "2025-01-01")], securityBasisAsOf: "2026-02-31" }), "peTtm").current).toBeNull();
    expect(multiple(adr({ securityBasis: [security(5, "2025-02-31")] }), "peTtm").current).toBeNull();
  });

  it("rejects verified ratio evidence belonging to a different quoted security", () => {
    const input = adr({ securityBasis: [security(5, "2025-01-01")] });
    Object.assign(input.quote, { issuerId: "different-issuer", securityId: "different-ADS" });
    expect(multiple(input, "peTtm").current).toBeNull();
  });

  it("selects the documented ratio on each side of a ratio-change date", () => {
    const evidence = [security(2, "2025-01-01", "2026-01-01"), security(5, "2026-01-01")];
    expect(multiple(adr({ securityBasis: evidence, securityBasisAsOf: "2025-12-31" }), "peTtm").current).toBe(12.5);
    expect(multiple(adr({ securityBasis: evidence }), "peTtm").current).toBe(5);
  });

  it("uses market cap over common earnings when per-ADS EPS basis is unavailable", () => {
    const input = adr();
    input.quote.marketCap = 1_000;
    Object.assign(input.quote, { marketCapSecurityBasis: "issuer-common" });
    Object.assign(input.incomeTtm!, { netIncomeAvailableToCommon: 200 });
    expect(multiple(input, "peTtm").current).toBe(5);
  });

  it("withholds the ADR aggregate fallback when market-cap security scope is unknown", () => {
    const input = adr();
    input.quote.marketCap = 1_000;
    Object.assign(input.incomeTtm!, { netIncomeAvailableToCommon: 200 });
    expect(multiple(input, "peTtm").current).toBeNull();
    expect(multiple(input, "priceToBook").current).toBeNull();
  });
});

describe("own-history ties", () => {
  it.each([
    [[1, 1, 2, 3], 1, 100 / 6],
    [[1, 2, 2, 3], 2, 50],
    [[1, 2, 3, 3], 3, 500 / 6],
    [[1, 2, 3, 4], 2.5, 50],
  ])("uses tied order-statistic midranks for %j at %s", (values, value, expected) => {
    expect(percentileRank(values, value)).toBeCloseTo(expected, 8);
  });

  it("treats floating point noise as a tie and flat history as uninformative", () => {
    expect(percentileRank([1, 2, 2 + 1e-12, 3], 2)).toBeCloseTo(50, 8);
    expect(percentileRank([5, 5, 5, 5], 5)).toBeNull();
    expect(percentileRank([5, 5 + 1e-12, 5, 5], 6)).toBeNull();
  });

  it("withholds flat own-history rank in the integrated multiples output", () => {
    const input = inputs({ keyMetricsHistory: Array.from({ length: 8 }, (_, i) => ({ date: `202${5 - Math.floor(i / 4)}-${["12-31", "09-30", "06-30", "03-31"][i % 4]}`, priceToBookRatio: 5 })) });
    const band = multiple(input, "priceToBook").ownHistory!;
    expect(band.observations).toBe(8);
    expect(band.p50).toBe(5);
    expect(band.percentileRank).toBeNull();
    expect(band.basis).toMatch(/uninformative|degenerate|flat/i);
  });

  it("withholds vendor total-book history beside materially adjusted current common equity", () => {
    const input = inputs({ keyMetricsHistory: Array.from({ length: 8 }, (_, i) => ({ date: `2025-${i + 1}`, priceToBookRatio: i + 1 })) });
    input.balance!.preferredStock = 100;
    expect(multiple(input, "priceToBook").ownHistory).toBeNull();
    expect(multiplesFramework("bank", input).gaps.some((g) => /common.*history|history.*common/i.test(g.reason))).toBe(true);
  });

  it("withholds derived book history with unknown preferred allocation beside known current preferred", () => {
    const dates = ["2025-12-31", "2025-09-30", "2025-06-30", "2025-03-31", "2024-12-31", "2024-09-30", "2024-06-30", "2024-03-31", "2023-12-31", "2023-09-30", "2023-06-30", "2023-03-31"];
    const input = inputs({
      quarterlyFundamentals: dates.map((date) => ({ date, revenue: 25, operatingIncome: 5, depreciationAndAmortization: 0, netIncome: 2.5, operatingCashFlow: 5, capitalExpenditure: 0, totalStockholdersEquity: 200 })),
      enterpriseValuesHistory: dates.map((date) => ({ date, marketCapitalization: 1_000, enterpriseValue: 1_000 })),
    });
    input.balance!.preferredStock = 100;
    expect(multiple(input, "priceToBook").ownHistory).toBeNull();
  });
});

describe("financial forward assumptions", () => {
  const base = { bookValue: 1_000, currentRoePct: 15, costOfEquityPct: 10, payoutRatioPct: 50, dilutedShares: 100, marketCap: 1_800, tangibleCommonEquity: 900, rotePct: 16 };
  const durable = [2021, 2022, 2023, 2024, 2025].map((year) => ({ date: `${year}-12-31`, roicPct: 15, waccPct: 10 }));

  it("reports actual continuation in the stable-growth comparison without changing value", () => {
    // Audit 2026-10-22 C-10 follow-through (D-102): a one-year horizon pays the
    // steady state 1 − 2.5/12.5 = 80%, so BV1 = 1025 and CV = 0.025 x 1025 / 0.075 / 1.1
    // = 310.606...; value 1000 + 25/1.1 + 310.606... = 1333.33...
    const result = excessReturnModel({ ...base, years: 1, roeHistory: durable, riskFreePct: 4 });
    expect(result.equityValue).toBeCloseTo(1_333.3333333333333, 8);
    expect(result.priceToTangibleBookVsRote.basis).not.toMatch(/adds no continuing value/);
    expect(result.priceToTangibleBookVsRote.basis).toMatch(/continuing value.*310\.61/i);
    const assumptions = (result as unknown as { financialAssumptions?: Record<string, number> }).financialAssumptions;
    expect(assumptions?.terminalRoePct).toBe(12.5);
    expect(assumptions?.terminalGrowthPct).toBe(2.5);
    expect(assumptions?.continuingValuePv).toBeCloseTo(310.6060606060606, 8);
  });

  it("accurately states zero continuation for a finite competitive fade", () => {
    const result = excessReturnModel({ ...base, years: 2 });
    expect(result.equityValue).toBeCloseTo(1_045.4545454545455, 8);
    const assumptions = (result as unknown as { financialAssumptions?: Record<string, number> }).financialAssumptions;
    expect(assumptions?.continuingValuePv).toBe(0);
    expect(result.priceToTangibleBookVsRote.basis).toMatch(/no continuing value/i);
  });

  it("does not display a small positive continuation as zero or infer no continuation", () => {
    const a = excessReturnModel({ ...base, years: 1, roeHistory: durable }).financialAssumptions!;
    const text = describeFinancialValuation({ ...a, continuingValuePv: 0.0001 });
    expect(text).not.toMatch(/continuing value 0 \(/);
    expect(text).not.toMatch(/no continuing value/i);
  });

  it("discloses absent legacy assumptions without asserting zero continuation", () => {
    const text = describeFinancialValuation(undefined);
    expect(text).toMatch(/unavailable/i);
    expect(text).not.toMatch(/no continuing value|zero continuing value/i);
  });
});
