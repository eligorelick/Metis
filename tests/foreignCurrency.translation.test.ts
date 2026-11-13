import { describe, expect, it } from "vitest";
import { resolveForeignValuation, translateProjectionInputs, translateValuationInputs } from "@/pipeline/foreignCurrency";
import type { ValuationBundleInputs } from "@/pipeline/stageB/valuation";
import { foreignBundle } from "./helpers/foreignBundle";
import { valueCompany } from "@/pipeline/stageB/valuation";
import { runStageB } from "@/pipeline/compute";

const M = 1e6;
const basis = () => resolveForeignValuation(foreignBundle(), "TWD").basis!;
function inputs(): ValuationBundleInputs {
  const convertible = { kind: "notes" as const, claim: 320 * M, conversionShares: 5 * M, conversionPrice: 320,
    settlement: "full-shares" as const, period: { start: "2025-01-01", end: "2025-12-31" }, basis: "filed ordinary units" };
  const income = { date: "2025-12-31", revenue: 3200 * M, operatingIncome: 640 * M, grossProfit: 1600 * M, incomeBeforeTax: 480 * M, incomeTaxExpense: 160 * M };
  const balance = { date: "2025-12-31", basis: "annual" as const, totalDebt: 320 * M, totalStockholdersEquity: 3200 * M,
    cashAndShortTermInvestments: 640 * M, longTermInvestments: 96 * M,
    fieldProvenance: { totalDebt: { source: "edgar" as const, unit: "TWD", periodStart: null, periodEnd: "2025-12-31", observedAt: "2026-02-01", tags: ["us-gaap/LongTermDebt"], filings: [{ accn: "0000000042-26-000001", filed: "2026-02-01", form: "20-F" }] } } };
  const scope = { currency: "TWD", periodStart: "2025-01-01", periodEnd: "2025-12-31", basis: "annual" as const };
  return { currentPrice: 100, waccPct: 8, netDebt: -320 * M, dilutedShares: 500 * M,
    minorityInterest: 32 * M, preferred: 64 * M, leaseLiability: 32 * M, operatingLeaseLiability: 16 * M,
    convertiblePreferredClaim: 64 * M, convertibles: [convertible], bridgeBalance: { ...balance, cashAndShortTermInvestments: 640 * M, goodwill: 32 * M, intangibleAssets: 16 * M, minorityInterest: 32 * M, preferredStock: 64 * M },
    temporaryEquity: { total: 128 * M, capitalTotal: 128 * M, redeemablePreferred: 64 * M, redeemableNoncontrolling: 32 * M, unsplit: 32 * M, basis: "filed claims", capitalBasis: "filed claims", refusal: null },
    nonOperatingAssets: { value: 96 * M, basis: "filed financial asset" },
    noncontrollingEarnings: { noncontrollingIncome: 32 * M, consolidatedProfit: 352 * M, asOf: "2025-12-31" },
    debtLikeObligations: { assetRetirement: { value: 32 * M, basis: "filed retirement" }, environmental: null, settlementAssets: { value: 16 * M, basis: "restricted cash" }, pension: { value: 64 * M, basis: "funded status" } },
    dcfInputs: { revenueCagr3yPct: 12, waccPct: 8, riskFreePct: 4, reportedCurrency: "TWD", quoteCurrency: "USD", incomeTtm: income, incomeHistory: [income], balance, capitalHistory: [balance], marketCap: 10_000 * M,
      fcfSbc: { beforeSbc: 320 * M, afterSbc: 288 * M, sbc: 32 * M, asOf: "2025-12-31", basis: "filed SBC" },
      equityMethodStake: { value: 96 * M, treatment: "added-back", incomePlacement: "below-operating-income", basis: "filed affiliate" },
      unusualOperatingItems: { value: 32 * M, components: [{ tag: "gain", value: 32 * M }], withheld: [], basis: "filed one-off" },
      analystEstimates: [{ date: "2026-12-31", revenueAvg: 3520 * M, revenueLow: 3200 * M, revenueHigh: 3840 * M, analysts: 10 }],
      quarterRevenue: { latest: { date: "2025-12-31", revenue: 800 * M }, yearAgo: { date: "2024-12-31", revenue: 640 * M }, guidedYearAgo: { date: "2025-03-31", revenue: 640 * M }, guidedYearAgoWindow: [{ date: "2025-03-31", revenue: 640 * M }] },
      guidance: { revenue: 960 * M, revenueLow: 928 * M, revenueHigh: 992 * M, periodEnd: "2026-03-31", asOf: "2026-02-01", source: "filed guidance", currency: "TWD", annualRevenueComparison: { periodLabel: "FY2026", fiscalYear: 2026, low: 3520 * M, high: 3840 * M, currency: "TWD", source: "filed guidance", asOf: "2026-02-01" } },
      fiscalYearToDate: { revenue: 800 * M, priorFiscalYearEnd: "2024-12-31", through: "2025-03-31", quarters: 1 },
      revenueSeasonality: { fiscalYearEnd: "2025-12-31", quarters: [{ date: "2025-12-31", revenue: 800 * M }] },
    },
    multiples: { quote: { price: 100, marketCap: 10_000 * M, currency: "USD", isAdr: true }, reportedCurrency: "TWD",
      incomeTtm: { ...income, netIncome: 320 * M, netIncomeAvailableToCommon: 320 * M, epsDiluted: 0.64,
        incomeScope: scope, commonIncomeScope: scope, preferredCashScope: scope, noncontrollingIncomeScope: scope, targetScope: scope,
        commonIncomeQuarters: [{ period: "2025-12-31", periodStart: "2025-10-01", value: 80 * M, derivation: null, filings: null }] },
      cashFlowTtm: { date: "2025-12-31", operatingCashFlow: 320 * M, capitalExpenditure: -64 * M, depreciationAndAmortization: 64 * M, annualDepreciationAndAmortization: { date: "2025-12-31", value: 64 * M } },
      balance: { ...balance, reportedCurrency: "TWD", goodwill: 32 * M, intangibleAssets: 16 * M, minorityInterest: 32 * M, preferredStock: 64 * M }, ffoApprox: 320 * M, affoApprox: 256 * M,
    },
    excessReturn: { bookValue: 3200 * M, tangibleCommonEquity: 2880 * M, currentRoePct: 15, costOfEquityPct: 8, price: 100, marketCap: 10_000 * M, dilutedShares: 500 * M, totalDebt: 320 * M,
      startAlternative: { bookValue: 2880 * M, roePct: 14, basis: "fiscal-year-rote", asOf: "2025-12-31", permanentPreferred: 64 * M }, convertibles: [convertible] },
    reit: { ffoApprox: 320 * M, affoApprox: 256 * M, noiApprox: 640 * M, sharePrice: 100, shares: 500 * M, marketCap: 10_000 * M, enterpriseValue: { value: 10_320 * M, basis: "USD market cap plus local debt" } },
  };
}

describe("monetary valuation translation", () => {
  it("values a foreign bank on one USD/ADS basis, preserving payout and CAPM rates", () => {
    const raw = inputs();
    raw.excessReturn = { ...raw.excessReturn!, payoutRatioPct: 60, asOf: "2025-12-31", valuationDate: "2026-07-02" };
    const t = translateValuationInputs(raw, basis());
    const route = { base: "bank" as const, overlays: ["adr" as const], evidence: { sector: "Financial Services", industry: "Banks - Diversified" } };
    const native = valueCompany(route, { ...raw, multiples: { ...raw.multiples, reportedCurrency: "USD", quote: { ...raw.multiples.quote, currency: "USD", isAdr: false } } });
    const translated = valueCompany(route, t);
    expect(translated.kind).toBe("excess-return");
    if (native.kind !== "excess-return" || translated.kind !== "excess-return") throw Error("route");
    expect(translated.excessReturn.perShare).toBeCloseTo(native.excessReturn.perShare! / 32 * 5);
    expect(translated.excessReturn.priceToTangibleBookVsRote?.pTbv).toBeCloseTo(10_000 / 90);
    expect(t.excessReturn?.payoutRatioPct).toBe(60);
    expect(t.excessReturn?.costOfEquityPct).toBe(8);
    expect(t.excessReturn?.startAlternative?.bookValue).toBe(90 * M);
  });
  it.each(["fx", "ratio"])("a foreign bank headline names missing %s evidence", missing => {
    const b = foreignBundle();
    if (!b.profile.ok) throw Error("fixture");
    Object.assign(b.profile.value.data.rows[0]!, { sector: "Financial Services", industry: "Banks - Diversified" });
    if (missing === "fx") delete b.valuationFx;
    else b.sharesFloat = { ok: false, gap: { field: "sharesFloat", reason: "unavailable", severity: "warn" } };
    const c = runStageB(b);
    expect(c.valuation.kind).toBe("excess-return");
    expect(c.fairValue.perShare).toBeNull();
    expect(c.fairValue.reasons.map(r => r.reason).join(" ")).toMatch(missing === "fx" ? /FRED DEXTAUS observation missing/ : /dated quoted shares/);
    expect(c.valuation.gaps).toContainEqual(expect.objectContaining({ field: "valuation.currencyConversion" }));
  });
  it("labels the translated bridge balance in USD (PR #86 review)", () => {
    const input = inputs();
    const out = translateValuationInputs({ ...input, bridgeBalance: { ...input.bridgeBalance!, reportedCurrency: "TWD" } }, basis());
    expect(out.bridgeBalance?.reportedCurrency).toBe("USD");
  });
  it("keeps the full DCF forecast and its reinvestment/bridge operands in USD", () => {
    const raw = inputs(), snapshot = JSON.stringify(raw), t = translateValuationInputs(raw, basis()), d = t.dcfInputs!;
    expect(d.incomeTtm?.revenue).toBe(100 * M);
    expect(d.incomeHistory[0]?.operatingIncome).toBe(20 * M);
    expect(d.balance?.totalDebt).toBe(10 * M);
    expect(d.capitalHistory?.[0]?.longTermInvestments).toBe(3 * M);
    expect(d.unusualOperatingItems?.components[0]?.value).toBe(M);
    expect(d.equityMethodStake?.value).toBe(3 * M);
    expect(d.fcfSbc).toMatchObject({ beforeSbc: 10 * M, afterSbc: 9 * M, sbc: M });
    expect(d.analystEstimates?.[0]).toMatchObject({ revenueAvg: 110 * M, revenueLow: 100 * M, revenueHigh: 120 * M, analysts: 10 });
    expect(d.quarterRevenue?.latest.revenue).toBe(25 * M);
    expect(d.quarterRevenue?.yearAgo?.revenue).toBe(20 * M);
    expect(d.quarterRevenue?.guidedYearAgo?.revenue).toBe(20 * M);
    expect(d.quarterRevenue?.guidedYearAgoWindow?.[0]?.revenue).toBe(20 * M);
    expect(d.guidance).toMatchObject({ revenue: 30 * M, revenueLow: 29 * M, revenueHigh: 31 * M, currency: "USD", annualRevenueComparison: { low: 110 * M, high: 120 * M, currency: "USD" } });
    expect(d.fiscalYearToDate?.revenue).toBe(25 * M);
    expect(d.revenueSeasonality?.quarters[0]?.revenue).toBe(25 * M);
    expect(t.temporaryEquity).toMatchObject({ total: 4 * M, capitalTotal: 4 * M, redeemablePreferred: 2 * M, redeemableNoncontrolling: M, unsplit: M });
    expect(t.debtLikeObligations).toMatchObject({ assetRetirement: { value: M }, environmental: null, settlementAssets: { value: 0.5 * M }, pension: { value: 2 * M } });
    expect(t.noncontrollingEarnings).toMatchObject({ noncontrollingIncome: M, consolidatedProfit: 11 * M });
    expect(t.nonOperatingAssets?.value).toBe(3 * M);
    expect(t.netDebt).toBe(-10 * M);
    expect(t.convertibles?.[0]).toMatchObject({ claim: 10 * M, conversionShares: M, conversionPrice: 50 });
    expect(d.revenueCagr3yPct).toBe(12);
    expect(d.waccPct).toBe(8);
    expect(JSON.stringify(raw)).toBe(snapshot);
  });
  it("translates common-income scope and derives an ordinary EPS as per ADS exactly once", () => {
    const t = translateValuationInputs(inputs(), basis());
    expect(t.dilutedShares).toBe(100 * M);
    expect(t.multiples.incomeTtm?.epsDiluted).toBe(0.1);
    expect(t.multiples.incomeTtm?.commonIncomeQuarters?.[0]?.value).toBe(2.5 * M);
    expect(t.multiples.incomeTtm?.commonIncomeScope?.currency).toBe("USD");
    expect(t.multiples.cashFlowTtm?.annualDepreciationAndAmortization?.value).toBe(2 * M);
    expect(t.multiples.balance?.fieldProvenance?.totalDebt).toMatchObject({ unit: "USD", originalUnit: "TWD", currencyTranslation: { series: "DEXTAUS" } });
    expect(t.multiples.quote.marketCap).toBe(10_000 * M);
    expect(t.multiples.ffoApprox).toBe(10 * M);
    expect(t.multiples.affoApprox).toBe(8 * M);
  });
  it("converts equity-only and REIT amounts while preserving quoted USD numerators", () => {
    const t = translateValuationInputs(inputs(), basis());
    expect(t.excessReturn).toMatchObject({ bookValue: 100 * M, tangibleCommonEquity: 90 * M, dilutedShares: 100 * M, price: 100, marketCap: 10_000 * M, currentRoePct: 15, costOfEquityPct: 8, startAlternative: { bookValue: 90 * M, permanentPreferred: 2 * M } });
    expect(t.excessReturn?.convertibles?.[0]).toMatchObject({ conversionShares: M, claim: 10 * M, conversionPrice: 50 });
    expect(t.reit).toMatchObject({ ffoApprox: 10 * M, affoApprox: 8 * M, noiApprox: 20 * M, shares: 100 * M, sharePrice: 100, marketCap: 10_000 * M });
    // The model must rebuild EV from the USD quote and translated balance;
    // an upstream aggregate could already contain the quote capitalization.
    expect(t.reit?.enterpriseValue).toBeUndefined();
  });
  it("D-233: the REIT block keeps the count of FFO's own fiscal year on the quoted unit, not the latest count", () => {
    const raw = inputs();
    // Fiscal-year count 496 M ordinary shares against a latest count of 500 M (5 ordinary shares per ADS).
    const t = translateValuationInputs({ ...raw, reit: { ...raw.reit!, shares: 496 * M, sharesPeriodEnd: "2025-12-31" } }, basis());
    expect(t.dilutedShares).toBe(100 * M);
    expect(t.reit?.shares).toBe(99.2 * M);
    expect(t.reit?.sharesWithheldReason ?? null).toBeNull();
  });
  it("D-233: a fiscal-year count that cannot be placed on the quoted unit is withheld with the reason, never replaced by the latest count", () => {
    const raw = inputs();
    const t = translateValuationInputs({ ...raw, reit: { ...raw.reit!, shares: 470 * M, sharesPeriodEnd: "2025-12-31" } }, basis());
    expect(t.dilutedShares).toBe(100 * M);
    expect(t.reit?.shares).toBeNull();
    expect(t.reit?.sharesWithheldReason).toMatch(/fiscal year ending 2025-12-31 is not established in units of the quoted security/);
    // Control: a count already withheld upstream keeps its own reason.
    const upstream = translateValuationInputs({ ...raw, reit: { ...raw.reit!, shares: null, sharesWithheldReason: "the fiscal year ending 2025-12-31 carries no weighted-average diluted share count" } }, basis());
    expect(upstream.reit?.sharesWithheldReason).toBe("the fiscal year ending 2025-12-31 carries no weighted-average diluted share count");
  });
  it("keeps projection histories, interest, debt and capital-return authorization in one currency", () => {
    const t = translateProjectionInputs({ route: runStageB(foreignBundle()).route, valuation: { kind: "pre-revenue", route: "general", multiples: null, notes: [], gaps: [] }, waccPct: 8,
      dilutedShares: 500 * M, incomeHistory: [{ date: "2025-12-31", revenue: 3200 * M, ebit: 640 * M, netIncome: 320 * M, epsDiluted: 0.64, interestExpense: 32 * M }], fcfHistory: [{ date: "2025-12-31", fcf: 256 * M }], shareCountAnnualizedPct: -2, currency: "TWD", asOf: "2026-07-02",
      interestRunRate: { value: 32 * M, ratePct: 5, basis: "filed interest" }, debtAtAnchor: { date: "2025-12-31", debt: 640 * M }, capitalReturn: { authorizationRemaining: 320 * M, currentPrice: 100, source: "filed authorization" },
    }, basis());
    expect(t).toMatchObject({ currency: "USD", dilutedShares: 100 * M, incomeHistory: [{ revenue: 100 * M, ebit: 20 * M, netIncome: 10 * M, interestExpense: M }], fcfHistory: [{ fcf: 8 * M }], debtAtAnchor: { debt: 20 * M }, capitalReturn: { authorizationRemaining: 10 * M, currentPrice: 100 }, interestRunRate: { value: M, ratePct: 5 }, shareCountAnnualizedPct: -2 });
  });
});
