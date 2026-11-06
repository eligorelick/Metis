import { describe, expect, it } from "vitest";
import { operatingIncomeForNonMargins, withIncomeOperatingBasis } from "@/pipeline/incomeBasis";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";
import { bindPrimaryIncome, parsePrimaryIncomeStatements, primaryPerimeterChange } from "@/edgar/primaryIncome";
import type { CompanyFacts } from "@/edgar/xbrl";

const header = "CONSOLIDATED STATEMENTS OF INCOME Years Ended December 31, 2025 2024 (Dollars in millions) ";
const table = "Net sales 1,000 900 Cost of sales 400 350 Selling, general and administrative expenses 300 280 Interest expense 10 10 Income before income taxes 290 260";
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
