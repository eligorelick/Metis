import { describe, expect, it } from "vitest";
import { operatingIncomeForNonMargins, withIncomeOperatingBasis } from "@/pipeline/incomeBasis";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";
import { bindPrimaryIncome, parsePrimaryIncomeStatements, primaryPerimeterChange } from "@/edgar/primaryIncome";
import type { CompanyFacts } from "@/edgar/xbrl";
import { runStageB, statementCurrencies, ttmIncome, effectiveTaxRateFromTtm, waccTaxRateFromStatements } from "@/pipeline/compute";
import { withFiledIncomeWindow } from "@/pipeline/incomeBasis";
import type { ManifestEntry } from "@/types/core";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";

const header = "CONSOLIDATED STATEMENTS OF INCOME Years Ended December 31, 2025 2024 (Dollars in millions) ";
const table = "Net sales 1,000 900 Cost of sales 400 350 Selling, general and administrative expenses 300 280 Interest expense 10 10 Income before income taxes 290 260";

function cumulativeOperatingFixture(direct = false) {
  const b = completeCurrencyBundle({ debt: 300 });
  b.builtAt = "2026-11-10T00:00:00Z";
  const periods = [
    ["2024-01-01", "2024-09-30", "2024-11-01", 700, 100, -15],
    ["2024-01-01", "2024-12-31", "2025-02-01", 1000, 180, -20],
    ["2025-01-01", "2025-03-31", "2025-05-01", 250, 35, -5],
    ["2025-01-01", "2025-06-30", "2025-08-01", 550, 75, -10],
    ["2025-01-01", "2025-09-30", "2025-11-01", 900, 120, -15],
    ["2025-01-01", "2025-12-31", "2026-02-01", 1200, 180, -20],
    ["2026-01-01", "2026-03-31", "2026-05-01", 400, 80, -5],
    ["2026-01-01", "2026-06-30", "2026-08-01", 900, 190, -10],
    ["2026-01-01", "2026-09-30", "2026-11-01", 1500, 310, -15],
  ] as const;
  const concepts: Record<string, { units: { USD: object[] } }> = {};
  for (const [start, end, filed, revenue, pretax, below] of periods) {
    const operating = pretax - below;
    const values = { Revenues: revenue, CostOfRevenue: revenue * 0.4, SellingGeneralAndAdministrativeExpense: revenue * 0.2,
      ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost: revenue * 0.1,
      ResearchAndDevelopmentAssetAcquiredOtherThanThroughBusinessCombinationWrittenOff: revenue * 0.05,
      RestructuringSettlementAndImpairmentProvisions: revenue * 0.25 - operating,
      IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: pretax,
      NonoperatingIncomeExpense: below, ...(direct ? { OperatingIncomeLoss: operating } : {}) };
    for (const [tag, val] of Object.entries(values)) (concepts[tag] ??= { units: { USD: [] } }).units.USD.push({
      start, end, val: val * M, accn: end, filed, form: end.endsWith("12-31") ? "10-K" : "10-Q", fy: Number(start.slice(0, 4)), fp: end.endsWith("12-31") ? "FY" : `Q${Number(end.slice(5, 7)) / 3}`,
    });
  }
  for (const [, end, filed, val] of [
    ["2024-07-01", "2024-09-30", "2024-11-01", 250],
    ["2025-04-01", "2025-06-30", "2025-08-01", 300],
    ["2025-07-01", "2025-09-30", "2025-11-01", 350],
    ["2026-04-01", "2026-06-30", "2026-08-01", 500],
    ["2026-07-01", "2026-09-30", "2026-11-01", 600],
  ] as const) (concepts.Assets ??= { units: { USD: [] } }).units.USD.push({ end, filed, val: val * M, accn: end, form: "10-Q", fy: Number(end.slice(0, 4)), fp: `Q${Number(end.slice(5, 7)) / 3}` });
  const facts: CompanyFacts = { cik: 42, entityName: "Synthetic research issuer", facts: { "us-gaap": concepts } };
  withIssuerFacts(b, facts);
  const built = buildStatementsFromCompanyFacts(facts, { symbol: b.symbol, cik: "42", asOf: "2026-11-10", factsObservedAt: b.builtAt,
    annualPeriods: 4, quarterlyPeriods: 10, vendorSplits: { status: "unavailable", source: "synthetic", reason: "No shares consumed" } });
  for (const name of ["incomeAnnual", "incomeQuarterly"] as const) {
    const input = b.statements[name]; if (!input.ok) throw Error("fixture");
    input.value.data.rows = built[name].rows.map(r => ({ ...r, source: "fmp", fieldProvenance: undefined, filedIncomeLines: undefined,
      operatingIncome: direct ? r.operatingIncome : r.grossProfit! - r.researchAndDevelopmentExpenses! - r.sellingGeneralAndAdministrativeExpenses! }));
    input.value.data.raw = structuredClone(input.value.data.rows);
  }
  return b;
}

it.each([false, true])("reconstructs a complete filed operating bridge for every cumulative quarter (direct tag %s, P1, D-260)", direct => {
  const b = cumulativeOperatingFixture(direct), before = JSON.stringify(b);
  const admitted = withIncomeOperatingBasis(b).statements.incomeQuarterly;
  if (!admitted.ok) throw Error("fixture");
  expect(admitted.value.data.rows.slice(0, 4).map(r => r.operatingIncome)).toEqual([125, 115, 85, 65].map(v => v * M));
  const q4 = admitted.value.data.rows.find(r => r.date === "2025-12-31")!;
  expect(q4.fieldProvenance?.operatingIncome?.derivation).toBe("fy-minus-ytd");
  expect(q4.fieldProvenance?.operatingIncome?.filings.map(f => f.accn).sort()).toEqual(["2025-09-30", "2025-12-31"]);
  const costOperands = q4.fieldProvenance?.operatingIncome?.flowOperands?.find(o => o.tag === "us-gaap/CostOfRevenue");
  expect(costOperands?.points.map(p => ({ start: p.start, end: p.end, val: p.val, accn: p.accn }))).toEqual([
    { start: "2025-01-01", end: "2025-12-31", val: 480 * M, accn: "2025-12-31" },
    { start: "2025-01-01", end: "2025-09-30", val: 360 * M, accn: "2025-09-30" },
  ]);
  expect(q4.operatingExpenses ?? null).toBeNull();
  const computed = runStageB(b);
  expect(computed).toBeDefined();
  expect(JSON.stringify(computed)).not.toContain("operatingIncome present in only");
  expect(JSON.stringify(b)).toBe(before);
});

it("reviews a vendor Q4 whose original filing no longer supplies the canonical revenue pair (D-260)", () => {
  const b = cumulativeOperatingFixture();
  if (!b.statements.incomeQuarterly.ok) throw Error("fixture");
  const row = b.statements.incomeQuarterly.value.data.rows.find(r => r.date === "2024-12-31")!;
  row.filingDate = "2025-02-02";
  (b.statements.incomeQuarterly.value.data.raw as typeof row[]).find(r => r.date === row.date)!.filingDate = row.filingDate;
  const out = withIncomeOperatingBasis(b).statements.incomeQuarterly;
  expect(out.ok && out.value.data.rows.find(r => r.date === row.date)?.operatingIncome).toBe(85 * M);
});

function trailingOnlyFixture() {
  const b = cumulativeOperatingFixture();
  if (!b.edgar.companyFacts.ok || !b.statements.incomeQuarterly.ok) throw Error("fixture");
  const facts = b.edgar.companyFacts.value.data.facts["us-gaap"]!;
  for (const [tag, raw] of Object.entries(facts)) {
    const c = raw as { units: { USD: { start?: string; end: string; accn: string; filed: string; form: string; val: number }[] } };
    const prior = c.units.USD.find(p => p.start === "2025-01-01" && p.end === "2025-09-30");
    if (prior) c.units.USD.push({ ...prior, accn: "2026-09-30", filed: "2026-11-01" });
    if (tag !== "Revenues" && tag !== "Assets") c.units.USD = c.units.USD.filter(p => p.end !== "2026-06-30");
  }
  for (const row of b.statements.incomeQuarterly.value.data.rows) {
    row.periodStart = `${row.date!.slice(0, 4)}-${String(Number(row.date!.slice(5, 7)) - 2).padStart(2, "0")}-01`;
    if (row.date === "2026-06-30" || row.date === "2026-09-30") row.operatingIncome = undefined;
  }
  return b;
}
it.each(["complete", "missing tax", "refused tax", "before equity"])("recovers a tax pair atomically with its own denominator: %s (D-260)", mode => {
  const b = trailingOnlyFixture();
  if (!b.edgar.companyFacts.ok || !b.statements.incomeQuarterly.ok) throw Error("fixture");
  const facts = b.edgar.companyFacts.value.data.facts["us-gaap"]!;
  const tag = "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest";
  const pretax = facts[tag] as { units: { USD: { val: number }[] } };
  if (mode !== "missing tax") facts.IncomeTaxExpenseBenefit = { units: { USD: pretax.units.USD.map(p => ({ ...p, val: p.val * 0.1 })) } };
  if (mode === "before equity") {
    facts.IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments = pretax;
    delete facts[tag];
  }
  const q = b.statements.incomeQuarterly.value.data.rows;
  q.forEach(r => { r.incomeBeforeTax = undefined; r.incomeTaxExpense = 1; });
  if (mode === "refused tax") q[0]!.fieldConflicts = { incomeTaxExpense: { usable: false, vendorValue: null, secValue: null, reason: "Independent tax refusal" } };
  const gaps: ManifestEntry[] = [];
  const window = ttmIncome(q, gaps)!;
  expect(window.taxRatePretaxIncome).toBeNull();
  const out = withFiledIncomeWindow(b, window, q, gaps)!;
  if (mode === "complete" || mode === "before equity") {
    expect(out.incomeBeforeTax).toBe(370 * M);
    expect(out.incomeTaxExpense).toBe(37 * M);
    expect(out.taxRatePretaxIncome).toBe(370 * M);
    expect(out.taxRatePretaxBasis).toContain("filed");
    expect(effectiveTaxRateFromTtm(out)).toBe(0.1);
    const waccTax = waccTaxRateFromStatements(out, { incomeBeforeTax: 100, incomeTaxExpense: 40 });
    expect(waccTax).toMatchObject({ rate: 0.1, fallback: null });
    expect(waccTax.basis).toMatch(mode === "before equity" ? /before equity-method results/ : /TTM incomeTaxExpense \/ incomeBeforeTax/);
    expect(gaps.some(g => g.field === "compute.ttmIncome.taxPair")).toBe(false);
  } else {
    expect(out.incomeBeforeTax).toBeNull();
    expect(out.incomeTaxExpense).toBeNull();
    expect(out.taxRatePretaxIncome).toBeNull();
    expect(gaps.some(g => g.field === "compute.ttmIncome.taxPair")).toBe(true);
  }
});
it("uses a complete filed FY plus YTD identity when standalone operating quarters cannot be proved (D-260)", () => {
  const c = runStageB(trailingOnlyFixture());
  expect(c.gaps).toContainEqual(expect.objectContaining({ field: "compute.ttmIncome.operatingIncome", reason: expect.stringContaining("390000000 USD") }));
  expect(JSON.stringify(c)).toContain("FY + current YTD - prior-year YTD");
});

it("uses an admitted exact revenue window when two standalone revenue quarters are absent (P1, D-260)", () => {
  const b = trailingOnlyFixture();
  if (!b.edgar.companyFacts.ok || !b.statements.incomeQuarterly.ok) throw Error("fixture");
  const revenue = b.edgar.companyFacts.value.data.facts["us-gaap"]!.Revenues as { units: { USD: { end: string }[] } };
  revenue.units.USD = revenue.units.USD.filter(p => p.end !== "2026-06-30");
  for (const row of b.statements.incomeQuarterly.value.data.rows) if (row.date === "2026-06-30" || row.date === "2026-09-30") row.revenue = undefined;
  const c = runStageB(b);
  expect(c.gaps).toContainEqual(expect.objectContaining({ field: "compute.ttmIncome.revenue", reason: expect.stringContaining("1800000000 USD") }));
  expect(c.gaps.some(g => g.reason.includes("revenue present in only"))).toBe(false);
  expect(statementCurrencies(b).ttmIncomeUsable).toBe(true);
});

it("does not restore reported operating income after a completed-sale normalization (D-260)", () => {
  const b = trailingOnlyFixture();
  b.gaps.push({ field: "compute.operatingDispositions", severity: "info",
    reason: "Synthetic completed sale already removed from recurring operating income." });
  expect(runStageB(b).gaps.some(g => /^compute\.ttmIncome\.(operatingIncome|ebit)$/.test(g.field) && g.reason.includes("uses the exact filed window"))).toBe(false);
});

it.each([0.5, 1.5])("tests independently reconciled operating totals before differencing rounded children (prior total changes %s million, D-260)", delta => {
  const b = trailingOnlyFixture();
  if (!b.edgar.companyFacts.ok) throw Error("fixture");
  const facts = b.edgar.companyFacts.value.data.facts["us-gaap"]!;
  for (const [tag, val] of Object.entries({
    IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: 119.3 + delta,
    NonoperatingIncomeExpense: -15.7,
    RestructuringSettlementAndImpairmentProvisions: 90 - delta,
  })) {
    const c = facts[tag] as { units: { USD: { accn: string; val: number }[] } };
    c.units.USD.find(p => p.accn === "2025-09-30")!.val = val * M;
  }
  const recovered = runStageB(b).gaps.find(g => g.field === "compute.ttmIncome.operatingIncome" && g.reason.includes("uses the exact filed window"));
  if (delta === 0.5) expect(recovered?.reason).toContain("390000000 USD");
  else expect(recovered).toBeUndefined();
});

it.each(["changed comparative", "mixed currency", "future acquisition", "wrong issuer", "independent refusal"])("keeps an unproved trailing operating window closed: %s (D-260)", defect => {
  const b = trailingOnlyFixture();
  if (!b.edgar.companyFacts.ok || !b.statements.incomeQuarterly.ok) throw Error("fixture");
  const facts = b.edgar.companyFacts.value.data;
  if (defect === "future acquisition") b.edgar.companyFacts.value.fetchedAt = "2027-01-01";
  if (defect === "wrong issuer") facts.cik = 99;
  if (defect === "changed comparative") {
    const c = facts.facts["us-gaap"]!.IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest as { units: { USD: { start: string; end: string; accn: string; val: number }[] } };
    c.units.USD.find(p => p.start === "2025-01-01" && p.end === "2025-09-30" && p.accn === "2026-09-30")!.val += 10 * M;
  }
  if (defect === "mixed currency") {
    const c = facts.facts["us-gaap"]!.NonoperatingIncomeExpense as { units: { USD: object[]; EUR?: object[] } };
    c.units.EUR = c.units.USD; c.units.USD = [];
  }
  if (defect === "independent refusal") {
    b.statements.incomeQuarterly.value.data.rows[0]!.fieldConflicts = {
      operatingIncome: { usable: false, cause: "operating-scope", vendorValue: null, secValue: null, reason: "Synthetic independent scope refusal" } };
    for (const row of b.statements.incomeQuarterly.value.data.rows) row.ebit = undefined;
  }
  expect(runStageB(b).gaps.some(g => /^compute\.ttmIncome\.(operatingIncome|ebit)$/.test(g.field) && g.reason.includes("uses the exact filed window"))).toBe(false);
});

it.each(["10-K", "20-F", "40-F"])("completes missing additive income fields from the same exact filed quarters (%s, D-260)", form => {
  const b = cumulativeOperatingFixture(true);
  if (!b.edgar.companyFacts.ok || !b.statements.incomeQuarterly.ok || !b.statements.incomeAnnual.ok) throw Error("fixture");
  const facts = b.edgar.companyFacts.value.data.facts["us-gaap"]!;
  const revenue = facts.Revenues as { units: { USD: { val: number; form: string }[] } };
  for (const tag of ["InterestExpense", "IncomeTaxExpenseBenefit", "DepreciationDepletionAndAmortization"])
    facts[tag] = { units: { USD: revenue.units.USD.map(p => ({ ...p, val: p.val * 0.01 })) } };
  if (form !== "10-K") for (const raw of Object.values(facts)) {
    const c = raw as typeof revenue;
    c.units.USD.forEach(p => { if (p.form === "10-K") p.form = form; });
  }
  for (const name of ["incomeAnnual", "incomeQuarterly"] as const) {
    const input = b.statements[name]; if (!input.ok) throw Error("fixture");
    for (const row of input.value.data.rows) for (const field of ["interestExpense", "incomeTaxExpense", "depreciationAndAmortization"]) row[field] = undefined;
  }
  const out = withIncomeOperatingBasis(b);
  for (const name of ["incomeAnnual", "incomeQuarterly"] as const) {
    const input = out.statements[name]; if (!input.ok) throw Error("fixture");
    const row = input.value.data.rows[0]!;
    for (const field of ["interestExpense", "incomeTaxExpense", "depreciationAndAmortization"]) {
      expect(row[field], field).toBe(row.revenue! * 0.01);
      expect(row.fieldProvenance?.[field]?.source).toBe("edgar");
    }
  }
});
function fixture(text = header + table) {
  const b = completeCurrencyBundle({ debt: 300 });
  const facts: Record<string, { units: { USD: object[] } }> = {};
  for (const [tag, amounts] of Object.entries({ Revenues: [1000, 900], OperatingIncomeLoss: [500, 450],
    IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: [290, 260] })) {
    facts[tag] = { units: { USD: amounts.map((val, i) => ({ val: val * M, start: `${2025-i}-01-01`, end: `${2025-i}-12-31`,
      accn: "annual", filed: "2026-02-01", form: "10-K", fy: 2025, fp: "FY" })) } };
  }
  withIssuerFacts(b, { cik: 42, entityName: "Synthetic", facts: { "us-gaap": facts } });
  if (!b.statements.incomeAnnual.ok) throw Error("fixture");
  for (const [i, r] of b.statements.incomeAnnual.value.data.rows.slice(0,2).entries()) {
    Object.assign(r, { cik: "42", revenue: [1000,900][i]! * M, operatingIncome: [500,450][i]! * M,
      incomeBeforeTax: [290,260][i]! * M, filingDate: "2026-02-01", nonMarginOperatingIncome: 500*M, waccOperatingIncome: 500*M });
  }
  b.edgar.tenKNotes = { ok: true, value: { source: "edgar", endpoint: "synthetic retained filing", asOf: "2026-02-01", fetchedAt: b.builtAt,
    data: { sectionName: "tenKNotes", text, statementsText: text, chars: text.length, method: "header-regex",
      accession: "annual", form: "10-K", filingDate: "2026-02-01", reportDate: "2025-12-31", documentUrl: "https://www.sec.gov/Archives/edgar/data/42/annual.htm" } } };
  return b;
}
function rows(b: ReturnType<typeof fixture>) {
  const r = withIncomeOperatingBasis(b).statements.incomeAnnual;
  if (!r.ok) throw Error("fixture");
  return r.value.data.rows;
}
describe("retained complete consolidated statement", () => {
  it("corrects every bound comparative and standalone operand before normalization", () => {
    const b = fixture(), before = JSON.stringify(b), out = rows(b);
    expect(out.slice(0,2).map(r => r.operatingIncome)).toEqual([300*M,270*M]);
    expect(out.slice(0,2).map(operatingIncomeForNonMargins)).toEqual([300*M,270*M]);
    expect(out[0]!.waccOperatingIncome).not.toBe(500*M);
    expect(out[0]!.fieldProvenance?.operatingIncome?.documents?.[0]?.accession).toBe("annual");
    expect(JSON.stringify(b)).toBe(before);
  });
  it("does not require provider agreement or an OperatingExpenses tag", () => {
    const b = fixture();
    if (!b.statements.incomeAnnual.ok) throw Error("fixture");
    b.statements.incomeAnnual.value.data.rows[0]!.operatingIncome = 300*M;
    expect(rows(b)[0]!.operatingIncome).toBe(300*M);
  });
  it("uses an explicitly printed gross-profit and SG&A bridge", () => {
    expect(rows(fixture(header + "Net sales 1,000 900 Cost of sales 400 350 Gross profit 600 550 Total selling and administrative expense 300 280 Interest (income) expense, net 10 10 Income before income taxes 290 260"))[0]!.operatingIncome).toBe(300*M);
  });
  it("does not certify older tag-only history from a tag family contradicted by the consolidated primary table",()=>{
    const b=fixture();
    if(!b.edgar.companyFacts.ok || !b.statements.incomeAnnual.ok) throw Error("fixture");
    const fs=b.edgar.companyFacts.value.data.facts["us-gaap"]!;
    for(const [tag,val] of Object.entries({Revenues:900,OperatingIncomeLoss:450,IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest:260})) {
      const raw=fs[tag] as {units:{USD:object[]}};
      raw.units.USD.push({start:"2023-01-01",end:"2023-12-31",val:val*M,accn:"old",filed:"2024-02-01",form:"10-K",fy:2023,fp:"FY"});
    }
    Object.assign(b.statements.incomeAnnual.value.data.rows[2]!,{revenue:900*M,operatingIncome:450*M,cik:"42",filingDate:"2024-02-01"});
    const r=rows(b)[2]!;
    expect(r.operatingIncome).toBeUndefined();
    expect(operatingIncomeForNonMargins(r),JSON.stringify(r)).toBeNull();
    expect(r.operatingIncomeBasis).toMatch(/tag family.*consolidated scope/i);
  });
  it.each(["segment", "unknown component", "missing component", "wrong issuer", "future filing", "currency", "primary currency", "ambiguous total"])("does not certify %s as a complete statement", defect => {
    let t = header + table;
    if (defect === "segment") t = t.replace("CONSOLIDATED", "SEGMENT");
    if (defect === "primary currency") t = t.replace("Dollars", "Canadian dollars");
    if (defect === "unknown component") t = t.replace("Selling, general and administrative expenses", "Unclassified deductions");
    if (defect === "missing component") t = t.replace("Selling, general and administrative expenses 300 280 ", "");
    if (defect === "ambiguous total") t = t.replace("Cost of sales 400 350", "Cost of sales 400 350 Total cost of sales 420 350");
    const b = fixture(t);
    if (!b.edgar.tenKNotes?.ok) throw Error("fixture");
    if (defect === "wrong issuer") b.edgar.tenKNotes.value.data.documentUrl = "https://www.sec.gov/Archives/edgar/data/99/annual.htm";
    if (defect === "future filing") b.edgar.tenKNotes.value.data.filingDate = "2027-02-01";
    if (defect === "currency" && b.statements.incomeAnnual.ok) b.statements.incomeAnnual.value.data.rows[0]!.reportedCurrency = "EUR";
    expect(rows(b)[0]!.fieldProvenance?.operatingIncome?.calculation).not.toBe("complete-operating-reconciliation");
  });
});

it("reconciles disjoint primary costs, signed nonservice expense and a separately printed income total",()=>{
  const text="CONDENSED CONSOLIDATED STATEMENT OF INCOME Dollars in millions Three Months Ended September 30, 2026 2025 "+
    "Sales and other operating revenue 1,000 900 Income from equity affiliates 30 20 Other income 10 10 Total revenues and other income 1,040 930 "+
    "Costs and other deductions Crude oil and product purchases 600 550 Production and manufacturing expenses 100 90 Selling, general and administrative expenses 40 40 Depreciation and depletion 52 40 Interest expense 10 10 Non-service pension and postretirement benefit expense (2) (1) Total costs and other deductions 800 729 Income/(Loss) before income taxes 240 201";
  const out=parsePrimaryIncomeStatements(text);
  expect(out.map(r=>r.operatingIncome)).toEqual([208*M,180*M]);
  expect(out.every(r=>r.roundingResidual===0)).toBe(true);
  expect(parsePrimaryIncomeStatements(text.replace("Total costs and other deductions 800","Total costs and other deductions 850"))).toEqual([out[1]]);
});

it("reads amount/percentage columns without treating the percentages as expenses",()=>{
  const text="CONSOLIDATED STATEMENTS OF EARNINGS (Dollars in millions) Fiscal Third Quarter Ended September 27, 2026 Percent to Sales September 28, 2025 Percent to Sales "+
    "Sales to customers (Note 9) 1,000 100.0% 900 100.0% Cost of products sold 400 40.0 350 38.9 Gross profit 600 60.0 550 61.1 Selling, marketing and administrative expenses 300 30.0 280 31.1 Interest income (10) (1.0) (10) (1.1) Interest expense 20 2.0 20 2.2 Earnings before provision for taxes on income 290 29.0 260 28.9";
  expect(parsePrimaryIncomeStatements(text).map(r=>r.operatingIncome)).toEqual([300*M,270*M]);
});

it("binds a preliminary issuer release to later duration facts while preserving the preliminary identity",()=>{
  const b=fixture(); if(!b.edgar.companyFacts.ok) throw Error("fixture");
  const doc={text:header+table,accession:"release",filed:"2026-01-25",form:"8-K",url:"https://www.sec.gov/Archives/edgar/data/42/release.htm"};
  const bound=bindPrimaryIncome(doc,b.edgar.companyFacts.value.data,"2026-07-01",b.builtAt);
  expect(bound[0]!.proof.documents?.[0]).toMatchObject({accession:"release",form:"8-K"});
  expect(bound[0]!.proof.filings[0]).toMatchObject({accn:"annual",form:"10-K"});
  expect(bindPrimaryIncome(doc,b.edgar.companyFacts.value.data,"2026-01-31",b.builtAt)).toEqual([]);
});

it("establishes a changed perimeter from a revised comparative and explicit changed-operations presentation, not dates alone",()=>{
  const point=(val:number,accn:string,filed:string)=>({start:"2025-01-01",end:"2025-03-31",val:val*M,accn,filed,form:"10-Q"});
  const old=point(1000,"old-quarter","2025-05-01"),current=point(500,"new-quarter","2026-05-01");
  const facts:CompanyFacts={cik:42,entityName:"Synthetic",facts:{"us-gaap":{
    Revenues:{units:{USD:[old,current]}},
    IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest:{units:{USD:[point(145,"new-quarter","2026-05-01")]}}
  }}};
  const text="CONSOLIDATED STATEMENTS OF INCOME Three Months Ended March 31, 2025 2024 (Dollars in millions) "+
    "Net sales 500 450 Cost of sales 200 175 Selling, general and administrative expenses 150 140 Interest expense 5 5 Income before income taxes 145 130 Net income from discontinued operations 5 4";
  const revised=bindPrimaryIncome({text,accession:"new-quarter",filed:"2026-05-01",form:"10-Q",url:"https://www.sec.gov/Archives/edgar/data/42/q.htm"},facts,"2026-07-01","2026-07-01");
  expect(revised).toHaveLength(1);
  expect(revised[0]).toMatchObject({months:3,revenue:500*M,presentationChange:true});
  expect(primaryPerimeterChange(revised,facts)?.reason).toMatch(/restates comparative sales/);
  expect(primaryPerimeterChange([{...revised[0]!,presentationChange:false}],facts)).toBeNull();
  // A bound document's dates alone do not supply either side of its sales comparison.
  for(const observations of [[old],[current]]) {
    const incomplete={...facts,facts:{"us-gaap":{...facts.facts["us-gaap"],Revenues:{units:{USD:observations}}}}};
    expect(primaryPerimeterChange(revised,incomplete)).toBeNull();
  }
});
