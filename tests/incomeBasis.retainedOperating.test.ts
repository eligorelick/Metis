import { describe, expect, it } from "vitest";
import { operatingMarginBasis, withIncomeOperatingBasis } from "@/pipeline/incomeBasis";
import { runStageB } from "@/pipeline/compute";
import type { CompanyFacts } from "@/edgar/xbrl";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

function fixture(retainPair: boolean) {
  const b = completeCurrencyBundle({ debt: 300, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  const points: Record<string, unknown>[] = [];
  const sales: Record<string, unknown>[] = [], costs: Record<string, unknown>[] = [], interest: Record<string, unknown>[] = [];
  for (const [name, annual] of [["incomeAnnual", true], ["incomeQuarterly", false]] as const) {
    const input = b.statements[name];
    if (!input.ok) throw Error("fixture");
    for (const row of input.value.data.rows) {
      row.cik = "42";
      row.incomeBeforeTax=row.revenue!*0.1+row.operatingIncome!-row.interestExpense!;
      const date = row.date!, year = date.slice(0, 4), month = Number(date.slice(5, 7));
      const start = annual ? `${year}-01-01` : `${year}-${String(month - 2).padStart(2, "0")}-01`;
      points.push({ start, end: date, val: row.revenue! * 1.1, accn: `${annual ? "annual" : "quarter"}-${date}`,
        filed: new Date(Date.parse(date) + 32 * 86400000).toISOString().slice(0, 10), form: annual || month === 12 ? "10-K" : "10-Q", fy: Number(year), fp: annual ? "FY" : `Q${month / 3}` });
      const p = points.at(-1)!;
      sales.push({ ...p, val: row.revenue }); costs.push({ ...p, val: row.revenue! - row.operatingIncome! + row.interestExpense! });
      interest.push({ ...p, val: row.interestExpense });
    }
    input.value.data.raw = retainPair ? structuredClone(input.value.data.rows) : [];
  }
  const pretax=points.map((p,i)=>({...p,val:(p.val as number)-(costs[i]!.val as number)}));
  const operatingExpenses=costs.map((p,i)=>({...p,val:(p.val as number)-(interest[i]!.val as number)}));
  const facts: CompanyFacts = { cik: 42, entityName: "SYNTHETIC", facts: { "us-gaap": { Revenues: { units: { USD: points } }, ...(retainPair ? { SalesRevenueNet: { units: { USD: sales } }, CostsAndExpenses: { units: { USD: costs } }, OperatingExpenses: { units: { USD: operatingExpenses } }, IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: { units: { USD: pretax } }, InterestExpense: { units: { USD: interest } } } : {}) } } };
  return withIssuerFacts(b, facts);
}

describe("revenue admission preserves independent operating figures", () => {
  it("retains non-margin EBIT and ROIC while no mixed-basis margin or DCF seed is available", () => {
    const b = fixture(false), before = JSON.stringify(b);
    const admitted = withIncomeOperatingBasis(b);
    if (!admitted.statements.incomeQuarterly.ok) throw Error("fixture");
    const row = admitted.statements.incomeQuarterly.value.data.rows[0]!;
    expect(row.revenue).toBe(330 * M);
    expect(row.operatingIncome).toBeUndefined();
    expect(row.nonMarginOperatingIncome).toBe(60 * M);
    const c = runStageB(b);
    expect(c.capital.current?.ebit).toBe(240 * M);
    expect(c.capital.current?.interestCoverage).toBe(15);
    expect(c.returns.roic.series.some(r => r.roicPct !== null)).toBe(true);
    expect(c.growth.margins.operating.series.every(p => p.pct === null)).toBe(true);
    expect(c.valuation.kind === "dcf" && c.valuation.assumptions).toBeNull();
    expect(JSON.stringify(b)).toBe(before);
  });

  it("uses the corroborated sales and operating-income basis across the report and forecast", () => {
    const b = fixture(true);
    const admitted = withIncomeOperatingBasis(b);
    if (!admitted.statements.incomeQuarterly.ok) throw Error("fixture");
    const row = admitted.statements.incomeQuarterly.value.data.rows[0]!;
    expect(row.revenue).toBe(300 * M);
    expect(row.operatingIncome).toBe(60 * M);
    expect(row.nonMarginOperatingIncome).toBeUndefined();
    const c = runStageB(b);
    expect(c.growth.margins.operating.series.every(p => p.pct === 20)).toBe(true);
    if (c.valuation.kind !== "dcf" || !c.valuation.assumptions) throw Error("DCF expected");
    expect(c.valuation.assumptions.startRevenue.value).toBe(1200 * M);
    expect(c.valuation.assumptions.ebitMarginPath.value[0]).toBe(20);
    expect(c.valuation.assumptions.ebitMarginPath.basis).toMatch(/filed operating revenue/i);
    expect(c.projections.series.find(s => s.metric === "operatingMargin")?.historical.map(p => p.value.value))
      .toEqual([20, 20, 20, 20]);
  });

  it("retains independently known revenue when operating income was already missing", () => {
    expect(operatingMarginBasis({ revenue: 100 })).toEqual({ revenue: 100, operatingIncome: null });
    expect(operatingMarginBasis({ revenue: 110, fieldConflicts: { revenue: { usable: true, resolution: "filed-family",
      vendorValue: 100, secValue: 110, reason: "Broader filed total adopted" } } }))
      .toEqual({ revenue: 110, operatingIncome: null });
  });

  it("cannot silently use the filed TTM total when a retained operating window has an independently refused quarter", () => {
    const b = fixture(true);
    if (!b.statements.incomeQuarterly.ok) throw Error("fixture");
    const row = b.statements.incomeQuarterly.value.data.rows[2]!;
    row.operatingIncome = undefined;
    row.fieldConflicts = { operatingIncome: { usable: false, vendorValue: 60 * M, secValue: null, reason: "Independent operating refusal" } };
    const c = runStageB(b);
    expect(c.capital.current?.ebit).toBeNull();
    if (c.valuation.kind !== "dcf" || !c.valuation.assumptions) throw Error("annual DCF expected");
    expect(c.valuation.assumptions.startRevenue.value).toBe(1000 * M);
    expect(c.valuation.assumptions.startRevenue.basis).toMatch(/annual/);
  });

  it("forecasts the retained sales pair and adds investments once, without forecasting the broader total's extra income", () => {
    const actual = fixture(true), control = completeCurrencyBundle({ debt: 300, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    for (const name of ["incomeAnnual","incomeQuarterly"] as const) {
      const input=control.statements[name];if(input.ok)for(const row of input.value.data.rows)row.incomeBeforeTax=row.revenue!*0.1+row.operatingIncome!-row.interestExpense!;
    }
    for (const b of [actual, control]) for (const name of ["balanceAnnual", "balanceQuarterly"] as const) {
      const input = b.statements[name];
      if (!input.ok) throw Error("fixture");
      for (const row of input.value.data.rows) row.longTermInvestments = 100 * M;
    }
    const a = runStageB(actual), c = runStageB(control);
    if (a.valuation.kind !== "dcf" || c.valuation.kind !== "dcf" || !a.valuation.dcf || !c.valuation.dcf) throw Error("DCF expected");
    expect(a.valuation.dcf.yearRows.map(r => [r.revenue, r.ebitMarginPct, r.fcff]))
      .toEqual(c.valuation.dcf.yearRows.map(r => [r.revenue, r.ebitMarginPct, r.fcff]));
    expect(a.valuation.dcf.bridge.nonOperatingComponents?.filter(x => x.kind === "long-term-investments"))
      .toMatchObject([{ value: 100 * M }]);
  });

  it.each(["currency", "date", "duplicate"])("does not replace filed operating evidence with incompatible retained %s observations", change => {
    const b = fixture(true);
    if (!b.statements.incomeQuarterly.ok) throw Error("fixture");
    const raw = b.statements.incomeQuarterly.value.data.raw as Record<string, unknown>[];
    if (change === "currency") raw[0]!.reportedCurrency = "EUR";
    if (change === "date") raw[0]!.date = "2026-03-30";
    if (change === "duplicate") raw.push({ ...raw[0]!, revenue: 310 * M });
    const admitted = withIncomeOperatingBasis(b);
    expect(admitted.statements.incomeQuarterly.ok && admitted.statements.incomeQuarterly.value.data.rows[0]!)
      .toMatchObject({ revenue: 300 * M, operatingIncome: 60 * M });
  });

  it("does not restore an operating numerator that was already independently refused", () => {
    const b = fixture(true);
    if (!b.statements.incomeQuarterly.ok) throw Error("fixture");
    const row = b.statements.incomeQuarterly.value.data.rows[0]!;
    row.operatingIncome = undefined;
    row.fieldConflicts = { operatingIncome: { usable: false, vendorValue: 60 * M, secValue: null, reason: "Independent operating refusal" } };
    const admitted = withIncomeOperatingBasis(b);
    const result = admitted.statements.incomeQuarterly.ok && admitted.statements.incomeQuarterly.value.data.rows[0]!;
    expect(result && result.nonMarginOperatingIncome).toBeUndefined();
    expect(result && result.operatingIncome).toBeUndefined();
    expect(result && result.fieldConflicts?.operatingIncome?.reason).toBe("Independent operating refusal");
  });
});

it("keeps an already filed standalone numerator when revenue changes its filing basis",()=>{
 const b=fixture(false);if(!b.statements.incomeQuarterly.ok)throw Error("fixture");
 const r=b.statements.incomeQuarterly.value.data.rows[0]!;
 const proof={source:"edgar" as const,unit:"USD",periodStart:"2026-01-01",periodEnd:r.date!,observedAt:b.builtAt,tags:["us-gaap/Revenues"],filings:[{accn:"previous",filed:"2026-05-05",form:"10-Q"}]};
 r.fieldProvenance={revenue:proof,operatingIncome:{...proof,tags:["us-gaap/OperatingIncomeLoss"]}};
 const v=withIncomeOperatingBasis(b).statements.incomeQuarterly;if(!v.ok)throw Error("fixture");
 expect(v.value.data.rows[0]!.operatingIncome).toBeUndefined();
 expect(v.value.data.rows[0]!.nonMarginOperatingIncome).toBe(60*M);
 expect(withIncomeOperatingBasis(withIncomeOperatingBasis(b)).statements.incomeQuarterly).toEqual(v);
});

it("does not reuse a standalone numerator in projection margin history or dispersion",()=>{
 const b=fixture(true);if(!b.statements.incomeAnnual.ok||!b.edgar.companyFacts.ok)throw Error("fixture");
 b.statements.incomeAnnual.value.data.rows[0]!.operatingIncome=250*M;
 (b.statements.incomeAnnual.value.data.raw as {operatingIncome:number}[])[0]!.operatingIncome=250*M;
 for(const tag of ["CostsAndExpenses","InterestExpense"]){const c=b.edgar.companyFacts.value.data.facts["us-gaap"]![tag] as {units:{USD:{start:string,end:string}[]}};c.units.USD=c.units.USD.filter(p=>p.start!=="2025-01-01"||p.end!=="2025-12-31");}
 const c=runStageB(b);expect(c.valuation.kind==="dcf"&&c.valuation.assumptions).toBeTruthy();
 expect(c.projections.series.find(s=>s.metric==="operatingMargin")?.historical).toEqual([]);
 expect(c.projections.series.find(s=>s.metric==="operatingMargin")?.disclosures.some(g=>g.reason.includes("2025")&&g.field==="projections.operatingMargin.historical")).toBe(true);
 expect(c.capital.current?.interestCoverage).toBe(15);
});
