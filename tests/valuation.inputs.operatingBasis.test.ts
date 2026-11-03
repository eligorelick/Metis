import { describe, expect, it } from "vitest";
import { withIncomeOperatingBasis } from "@/pipeline/incomeBasis";
import { buildDcfAssumptions, type DcfAssumptionInputs } from "@/pipeline/stageB/valuation";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

function fixture() {
  const b = completeCurrencyBundle({});
  if (!b.statements.incomeQuarterly.ok) throw Error("fixture");
  const row = b.statements.incomeQuarterly.value.data.rows[0]!;
  Object.assign(row, { date: "2026-03-31", periodStart: "2026-01-01", filingDate: "2026-05-01", cik: "42", revenue: 1000e6, operatingIncome: 200e6 });
  const point = { start: "2026-01-01", end: "2026-03-31", filed: "2026-05-01", accn: "0000000042-26-000001", form: "10-Q", fy: 2026, fp: "Q1" };
  row.fieldProvenance = { revenue: { source: "edgar", unit: "USD", periodStart: point.start, periodEnd: point.end, observedAt: b.builtAt, tags: ["us-gaap/Revenues"], filings: [point] } };
  b.edgar.cik = { ok: true, value: { source: "edgar", endpoint: "synthetic", fetchedAt: b.builtAt, asOf: point.filed, data: { cik: 42, cik10: "0000000042", ticker: b.symbol, title: "Synthetic" } } };
  b.edgar.companyFacts = { ok: true, value: { source: "edgar", endpoint: "synthetic", fetchedAt: b.builtAt, asOf: point.filed, data: { cik: 42, entityName: "Synthetic", facts: { "us-gaap": Object.fromEntries(Object.entries({ Assets: 2000, Revenues: 1000, IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: 190, InterestExpenseNonoperating: 10, NonoperatingIncomeExpense: -10 }).map(([tag, val]) => [tag, { units: { USD: [{ ...point, start: tag === "Assets" ? undefined : point.start, val: val * 1e6 }] } }])) } } } };
  return b;
}

describe("D-188 proved provider operating income", () => {
  it("uses retained provider revenue to prove its numerator's row basis", () => {
    const b = fixture();
    if (!b.statements.incomeQuarterly.ok) throw Error("fixture");
    const row = b.statements.incomeQuarterly.value.data.rows[0]!;
    row.operatingIncome = 210e6;
    b.statements.incomeQuarterly.value.data.raw = [{ ...row, fieldProvenance: undefined }];
    const out = withIncomeOperatingBasis(b).statements.incomeQuarterly;
    expect(out.ok && out.value.data.rows[0]!.operatingIncome).toBe(210e6);
  });
  it.each(["raw-period", "raw-revenue", "direct-filed-conflict", "raw-numerator"])("does not admit a retained row with %s", mode => {
    const b = fixture();
    if (!b.statements.incomeQuarterly.ok || !b.edgar.companyFacts.ok) throw Error("fixture");
    const row = b.statements.incomeQuarterly.value.data.rows[0]!;
    row.operatingIncome = 210e6;
    const raw = { ...row, fieldProvenance: undefined };
    if (mode === "raw-period") raw.date = "2026-06-30";
    if (mode === "raw-revenue") raw.revenue = 1200e6;
    if (mode === "raw-numerator") raw.operatingIncome = 250e6;
    if (mode === "direct-filed-conflict") {
      const usd = (b.edgar.companyFacts.value.data.facts["us-gaap"]!.Revenues as { units: { USD: object[] } }).units.USD;
      b.edgar.companyFacts.value.data.facts["us-gaap"]!.OperatingIncomeLoss = { units: { USD: usd.map(p => ({ ...p, val: 200e6 })) } };
      // Production's direct filed replacement/field refusal remains authoritative.
      row.fieldConflicts = { operatingIncome: { usable: false, vendorValue: 210e6, secValue: 200e6, reason: "FIGR shape" } };
    }
    b.statements.incomeQuarterly.value.data.raw = [raw];
    const out = withIncomeOperatingBasis(b).statements.incomeQuarterly;
    expect(out.ok && out.value.data.rows[0]!.operatingIncome).toBeUndefined();
  });
  it("admits a provider numerator agreeing with same-period SEC-derived EBIT", () => {
    const b = withIncomeOperatingBasis(fixture());
    if (!b.statements.incomeQuarterly.ok) throw Error("fixture");
    expect(b.statements.incomeQuarterly.value.data.rows[0]!.operatingIncome).toBe(200e6);
    expect(b.gaps.some(g => /operating income admitted/i.test(g.reason))).toBe(true);
  });
  it.each(["different-basis", "different-period", "conflict", "no-proof", "refused-gross"])("withholds %s", mode => {
    const b = fixture();
    if (!b.statements.incomeQuarterly.ok || !b.edgar.companyFacts.ok) throw Error("fixture");
    const row = b.statements.incomeQuarterly.value.data.rows[0]!;
    if (mode === "different-basis") row.operatingIncome = 250e6;
    if (mode === "different-period") row.periodStart = "2025-10-01";
    if (mode === "conflict") row.fieldConflicts = { operatingIncome: { usable: false, vendorValue: 200e6, secValue: null, reason: "refused" } };
    if (mode === "no-proof") b.edgar.companyFacts.value.data.facts["us-gaap"] = {};
    if (mode === "refused-gross") {
      b.edgar.companyFacts.value.data.facts["us-gaap"] = {};
      row.grossProfit = 600e6; row.operatingExpenses = 400e6;
      row.fieldConflicts = { grossProfit: { usable: false, vendorValue: 600e6, secValue: 500e6, reason: "refused gross profit cannot bridge" } };
    }
    const out = withIncomeOperatingBasis(b).statements.incomeQuarterly;
    expect(out.ok && out.value.data.rows[0]!.operatingIncome).toBeUndefined();
  });
});

describe("D-188 margin fallback", () => {
  const input: DcfAssumptionInputs = { revenueCagr3yPct: 5, revenueCagr5yPct: 5, analystEstimates: null, waccPct: 9, riskFreePct: 4,
    valuationDate: "2026-11-03", incomeTtm: { date: "2026-09-30", revenue: 1000, operatingIncome: null, incomeBeforeTax: 100, incomeTaxExpense: 20 },
    incomeHistory: [{ date: "2025-12-31", revenue: 1000, operatingIncome: 80 }, { date: "2024-12-31", revenue: 1000, operatingIncome: 200 }, { date: "2023-12-31", revenue: 1000, operatingIncome: 300 }],
    balance: { date: "2026-09-30", basis: "quarter", totalDebt: 100, totalStockholdersEquity: 500, cashAndShortTermInvestments: 0 }, marketCap: 2000 };
  it("takes the latest annual within 15 months before the median", () => {
    const a = buildDcfAssumptions(input).assumptions!;
    expect(a.ebitMarginPath.value[0]).toBe(8);
    expect(a.ebitMarginPath.basis).toContain("latest annual FY 2025-12-31");
  });
  it("uses an explicitly historical median when the annual is stale", () => {
    const out = buildDcfAssumptions({ ...input, valuationDate: "2027-04-02" });
    expect(out.assumptions!.ebitMarginPath.value[0]).toBe(20);
    expect(out.assumptions!.ebitMarginPath.basis).not.toMatch(/current 20/);
    expect(out.notes.join(" ")).not.toMatch(/versus current 20/);
  });
});
