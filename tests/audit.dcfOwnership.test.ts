import { describe, expect, it } from "vitest";
import { buildDcfAssumptions, type DcfAssumptionInputs } from "@/pipeline/stageB/valuation";
import { runStageB, ttmIncome } from "@/pipeline/compute";
import { currencyBundle, M } from "./helpers/currencyBundle";

const inputs = (balance: NonNullable<DcfAssumptionInputs["balance"]>): DcfAssumptionInputs => ({
  revenueCagr3yPct: 8, revenueCagr5yPct: 8, analystEstimates: null, waccPct: 9, riskFreePct: 4,
  incomeTtm: { date: "2025-12-31", revenue: 500, operatingIncome: 100, incomeBeforeTax: 90, incomeTaxExpense: 18 },
  incomeHistory: [{ date: "2025-12-31", revenue: 500, operatingIncome: 100 }, { date: "2024-12-31", revenue: 450, operatingIncome: 90 }],
  balance, marketCap: 5_000,
});

describe("DCF and Stage B ownership propagation", () => {
  it("includes NCI capital without inventing a positive operating-cash reserve", () => {
    const balance = { date: "2025-12-31", basis: "annual" as const, totalDebt: 70, totalStockholdersEquity: 100, minorityInterest: 30, cashAndShortTermInvestments: 20 };
    const result = buildDcfAssumptions(inputs(balance));
    expect(result.assumptions?.salesToCapital.value).toBeCloseTo(500 / 180, 10);
    expect(result.assumptions?.salesToCapital.basis).toMatch(/consolidated|minorityInterest/);
  });

  it("uses explicit total equity once, including legitimate zero totals", () => {
    const base = { date: "2025-12-31", basis: "annual" as const, totalDebt: 70, totalStockholdersEquity: 100, minorityInterest: 30, totalEquity: 130, cashAndShortTermInvestments: 20 };
    expect(buildDcfAssumptions(inputs(base)).assumptions?.salesToCapital.value).toBeCloseTo(500 / 180, 10);
    const zero = buildDcfAssumptions(inputs({ ...base, totalEquity: 0, totalDebt: 20 }));
    expect(zero.assumptions).toBeNull();
    expect(zero.gaps.some(g => g.field === "valuation.dcf.salesToCapital")).toBe(true);
  });

  it("passes consolidated equity from statement rows into annual ROIC", () => {
    const bundle = currencyBundle();
    for (const result of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) {
      if (result.ok) for (const row of result.value.data.rows) { row.totalStockholdersEquity = 100 * M; row.totalEquity = 130 * M; row.minorityInterest = 30 * M; }
    }
    const actual = runStageB(bundle);
    const equivalent = structuredClone(bundle);
    for (const result of [equivalent.statements.balanceAnnual, equivalent.statements.balanceQuarterly]) {
      if (result.ok) for (const row of result.value.data.rows) { row.totalStockholdersEquity = 130 * M; row.totalEquity = 130 * M; row.minorityInterest = 0; }
    }
    expect(actual.returns.roic.series.map(r => r.roicPct)).toEqual(runStageB(equivalent).returns.roic.series.map(r => r.roicPct));
  });

  it("aggregates consolidated income and signed NCI only over complete TTM windows", () => {
    const bundle = currencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    if (!bundle.statements.incomeQuarterly.ok) throw new Error("fixture income unavailable");
    const rows = bundle.statements.incomeQuarterly.value.data.rows.slice(0, 4).map(row => ({ ...row, netIncomeConsolidated: 875, netIncomeAttributableToNoncontrollingInterest: -3 }));
    expect(ttmIncome(rows)?.netIncomeConsolidated).toBe(3_500);
    expect(ttmIncome(rows)?.netIncomeAttributableToNoncontrollingInterest).toBe(-12);
    expect(ttmIncome(rows.map((r, i) => i ? r : { ...r, netIncomeConsolidated: undefined }))?.netIncomeConsolidated).toBeNull();
  });

  it("withholds debt/equity weights when a retained filing proves unresolved economic classes", () => {
    const bundle = currencyBundle({ sic: "3571" });
    if (bundle.statements.balanceAnnual.ok) for (const row of bundle.statements.balanceAnnual.value.data.rows) {
      row.totalCurrentAssets = 500 * M; row.totalCurrentLiabilities = 200 * M; row.retainedEarnings = 300 * M;
    }
    bundle.edgar.tenQNotes = { ok: true, value: { data: { sectionName: "tenQNotes", text: "Capital", statementsText: "Common stock, shares issued and outstanding. Class B common stock, shares issued and outstanding.", method: "header-regex", chars: 7, accession: "filing", form: "10-Q", filingDate: "2026-05-06", reportDate: "2026-03-31", documentUrl: "https://www.sec.gov/filing" }, source: "edgar", endpoint: "filing:notes", asOf: "2026-03-31", fetchedAt: bundle.builtAt } };
    const computed = runStageB(bundle);
    expect(computed.returns.wacc.waccPct).toBeNull();
    expect(computed.returns.wacc.gaps.some(g => g.field === "returns.wacc.economicClassBasis")).toBe(true);
    expect(computed.returns.roic.latestRoicPct).not.toBeNull();
    expect(computed.forensics.altman?.variant).toBe("original");
    expect(computed.forensics.altman?.score).toBeNull();
    expect(computed.forensics.gaps.some(g => g.field === "forensics.economicClassBasis")).toBe(true);
  });

  it("does not treat an undisclosed NCI allocation as zero when consolidated equity proves outside claims", () => {
    const bundle = currencyBundle();
    for (const result of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) {
      if (result.ok) for (const row of result.value.data.rows) { row.totalStockholdersEquity = 100 * M; row.totalEquity = 130 * M; row.minorityInterest = undefined; }
    }
    const result = runStageB(bundle);
    expect(result.valuation.kind).toBe("dcf");
    if (result.valuation.kind !== "dcf") throw new Error("fixture route");
    expect(result.valuation.dcf?.perShare ?? null).toBeNull();
    expect(result.valuation.gaps.some(g => g.field === "valuation.dcf.noncontrollingOwnership")).toBe(true);
    expect(result.returns.roic.latestRoicPct).not.toBeNull();
  });

  it("passes quoted-class currency consistently to WACC and original Altman", () => {
    const bundle = currencyBundle({ sic: "3571" });
    bundle.edgar.registrant = { name: "Generic", cik10: "0000000042", sic: "3571", sicDescription: null, exchanges: [], tickers: [bundle.symbol], fiscalYearEnd: "1231", stateOfIncorporation: null, forms: ["10-K"] };
    if (!bundle.quote.ok) throw new Error("fixture quote unavailable");
    bundle.quote.value.asOf = "2026-07-06";
    bundle.quote.value.data.rows[0].timestamp = Date.parse("2026-07-06T20:00:00Z") / 1000;
    bundle.economicShareEvidence = [{ issuerId: "0000000042", securityId: bundle.symbol, asOf: "2026-03-31", filed: "2026-05-06", effectiveFrom: "2026-03-31", effectiveTo: null,
      complete: true, sourceHash: "retained-capital-source", sourceIds: ["filed:capital"], classes: [
        { classId: bundle.symbol, shares: 100 * M, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "quoted-market-price" },
        { classId: "B", shares: 20 * M, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "quoted-market-price", observedPrice: { value: 120, currency: "USD", asOf: "2026-07-06", sourceIds: ["quote:B"], sourceHash: "retained-B-quote" } },
      ] }];
    const result = runStageB(bundle);
    expect(result.valuation.multiples?.enterpriseValue.equityScope?.status).toBe("resolved");
    expect(result.returns.wacc.waccPct).not.toBeNull();
    expect(result.returns.wacc.gaps.some(g => g.field === "returns.wacc.economicClassBasis")).toBe(false);
    expect(result.forensics.gaps.some(g => g.field === "forensics.economicClassBasis")).toBe(false);
  });
});
