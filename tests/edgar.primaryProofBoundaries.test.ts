import { describe, expect, it } from "vitest";
import { completeOperatingBridge } from "@/edgar/revenuePresentation";
import { corroborateOperatingIncome } from "@/edgar/revenueAdmission";
import { bindPrimaryIncome, primaryPerimeterChange, parsePrimaryIncomeStatements } from "@/edgar/primaryIncome";
import type { CompanyFacts } from "@/edgar/xbrl";
import { operatingIncomeForNonMargins, withIncomeOperatingBasis } from "@/pipeline/incomeBasis";
import type { FiledIncomeLine, FmpIncomeStatementRow, StatementFieldProvenance } from "@/providers/fmp";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

const proof: StatementFieldProvenance = { source: "edgar", unit: "USD", periodStart: "2025-01-01", periodEnd: "2025-12-31",
  observedAt: "2026-03-01", tags: ["us-gaap/Revenues"], filings: [{ accn: "annual", filed: "2026-02-01", form: "10-K" }] };
const line = (value: number, tag: string): FiledIncomeLine => ({ value, proof: { ...proof, tags: [`us-gaap/${tag}`] } });
const header = "CONSOLIDATED STATEMENTS OF INCOME Years Ended December 31, 2025 2024 (Dollars in millions) ";
const table = "Net sales 1,000 900 Cost of sales 400 350 Selling, general and administrative expenses 300 280 Interest expense 10 10 Income before income taxes 290 260";
function incomeRow(): FmpIncomeStatementRow {
  return { date: proof.periodEnd, periodStart: proof.periodStart!, period: "FY", reportedCurrency: "USD", revenue: 1000,
    operatingIncome: 500, nonMarginOperatingIncome: 500, waccOperatingIncome: 500, incomeBeforeTax: 290,
    fieldProvenance: { revenue: proof, incomeBeforeTax: line(290, "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest").proof },
    filedIncomeLines: { CostOfRevenue: line(400, "CostOfRevenue"), GrossProfit: line(600, "GrossProfit"),
      SellingGeneralAndAdministrativeExpense: line(300, "SellingGeneralAndAdministrativeExpense"), InterestExpense: line(10, "InterestExpense") } };
}
function retainedAndLater(later: { revenue: number; operating: number; pretax: number }) {
  const b = completeCurrencyBundle({ debt: 300 });
  const values = { Revenues: [1000, later.revenue], OperatingIncomeLoss: [500, later.operating],
    IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: [290, later.pretax] };
  withIssuerFacts(b, { cik: 42, entityName: "Synthetic", facts: { "us-gaap": Object.fromEntries(Object.entries(values).map(([tag, vals]) =>
    [tag, { units: { USD: vals.map((val, i) => ({ start: "2025-01-01", end: "2025-12-31", val: val * M,
      accn: i ? "recast" : "annual", filed: i ? "2026-06-01" : "2026-02-01", form: i ? "10-Q" : "10-K", fy: i ? 2026 : 2025, fp: i ? "Q1" : "FY" })) } }])) } });
  if (!b.statements.incomeAnnual.ok) throw Error("fixture");
  Object.assign(b.statements.incomeAnnual.value.data.rows[0]!, { cik: "42", filingDate: "2026-06-01", revenue: later.revenue * M,
    operatingIncome: later.operating * M, incomeBeforeTax: later.pretax * M });
  const text = header + table;
  b.edgar.tenKNotes = { ok: true, value: { source: "edgar", endpoint: "synthetic retained primary", asOf: "2026-02-01", fetchedAt: b.builtAt,
    data: { sectionName: "tenKNotes", text, statementsText: text, chars: text.length, method: "header-regex", accession: "annual",
      form: "10-K", filingDate: "2026-02-01", reportDate: "2025-12-31", documentUrl: "https://www.sec.gov/Archives/edgar/data/42/annual.htm" } } };
  return b;
}

describe("complete primary proof boundaries", () => {
  it("does not let an old complete table reverse a later same-concept recast", () => {
    const input = retainedAndLater({ revenue: 800, operating: 200, pretax: 190 }), before = JSON.stringify(input);
    const annual = withIncomeOperatingBasis(input).statements.incomeAnnual;
    if (!annual.ok) throw Error("fixture");
    const row = annual.value.data.rows[0]!;
    expect(row.revenue).toBe(800 * M);
    expect(row.operatingIncome).not.toBe(300 * M);
    expect(operatingIncomeForNonMargins(row)).not.toBe(300 * M);
    expect(row.waccOperatingIncome).not.toBe(300 * M);
    expect(row.primaryIncomeProof).toBeUndefined();
    expect(JSON.stringify(input)).toBe(before);
  });
  it("retains an older independent table when later same-concept observations are unchanged", () => {
    const annual = withIncomeOperatingBasis(retainedAndLater({ revenue: 1000, operating: 500, pretax: 290 })).statements.incomeAnnual;
    if (!annual.ok) throw Error("fixture");
    expect(annual.value.data.rows[0]!.operatingIncome).toBe(300 * M);
    expect(annual.value.data.rows[0]!.fieldProvenance?.operatingIncome?.calculation).toBe("complete-operating-reconciliation");
  });
  it("does not restore an old operating result after a changed later operating observation", () => {
    const annual = withIncomeOperatingBasis(retainedAndLater({ revenue: 1000, operating: 200, pretax: 290 })).statements.incomeAnnual;
    if (!annual.ok) throw Error("fixture");
    expect(annual.value.data.rows[0]!.operatingIncome).not.toBe(300 * M);
    expect(annual.value.data.rows[0]!.primaryIncomeProof).toBeUndefined();
  });
  it("does not confuse unchanged repeated operating facts with a newly changed concept", () => {
    const b = retainedAndLater({ revenue: 1000, operating: 500, pretax: 290 });
    if (!b.edgar.companyFacts.ok) throw Error("fixture");
    const concept = b.edgar.companyFacts.value.data.facts["us-gaap"]!.OperatingIncomeLoss as { units: { USD: { accn: string; filed: string }[] } };
    Object.assign(concept.units.USD[0]!, { accn: "earlier", filed: "2026-01-31" });
    const annual = withIncomeOperatingBasis(b).statements.incomeAnnual;
    if (!annual.ok) throw Error("fixture");
    expect(annual.value.data.rows[0]!.operatingIncome).toBe(300 * M);
  });
  it("does not let a later domestic-only pretax change supersede unchanged consolidated proof", () => {
    const b = retainedAndLater({ revenue: 1000, operating: 500, pretax: 290 });
    if (!b.edgar.companyFacts.ok) throw Error("fixture");
    const facts = b.edgar.companyFacts.value.data;
    facts.facts["us-gaap"] = { IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic: { units: { USD: [
      { start: "2025-01-01", end: "2025-12-31", val: 290 * M, accn: "annual", filed: "2026-02-01", form: "10-K" },
      { start: "2025-01-01", end: "2025-12-31", val: 250 * M, accn: "recast", filed: "2026-06-01", form: "10-Q" },
    ] } }, ...facts.facts["us-gaap"] };
    const annual = withIncomeOperatingBasis(b).statements.incomeAnnual;
    if (!annual.ok) throw Error("fixture");
    expect(annual.value.data.rows[0]!.operatingIncome).toBe(300 * M);
  });
  it("does not use a domestic-only pretax fact as the consolidated statement anchor", () => {
    const b = retainedAndLater({ revenue: 1000, operating: 500, pretax: 290 });
    if (!b.edgar.companyFacts.ok) throw Error("fixture");
    const facts = b.edgar.companyFacts.value.data, concepts = facts.facts["us-gaap"]!;
    concepts.IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic = concepts.IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest;
    delete concepts.IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest;
    expect(bindPrimaryIncome({ text: header + table, accession: "annual", filed: "2026-02-01", form: "10-K", url: "https://www.sec.gov/Archives/edgar/data/42/annual.htm" }, facts, "2026-07-06", b.builtAt)).toEqual([]);
  });
  it("includes an explicitly operating other expense before the operating subtotal", () => {
    const text = header + table.replace("Interest expense 10 10", "Other operating (income) expense, net 20 10 Interest expense 10 10").replace("290 260", "270 250");
    const rows = parsePrimaryIncomeStatements(text);
    expect(rows.map(row => row.operatingIncome)).toEqual([280 * M, 260 * M]);
    expect(rows.map(row => row.pretax)).toEqual([270 * M, 250 * M]);
    expect(rows.every(row => row.roundingResidual === 0)).toBe(true);
  });
  it("adds an explicitly income-signed operating line to operating income", () => {
    const text = header + table.replace("Interest expense 10 10", "Other operating income, net 20 10 Interest expense 10 10").replace("290 260", "310 270");
    expect(parsePrimaryIncomeStatements(text).map(row => row.operatingIncome)).toEqual([320 * M, 280 * M]);
  });
  it.each(["cost", "interest", "all costs"])("refuses unresolved conflicting %s aliases before any complete certificate", kind => {
    const row = incomeRow();
    if (kind === "cost") row.filedIncomeLines!.CostOfGoodsAndServicesSold = line(450, "CostOfGoodsAndServicesSold");
    if (kind === "interest") {
      row.filedIncomeLines!.InterestAndDebtExpense = line(20, "InterestAndDebtExpense");
      row.filedIncomeLines!.OtherNonoperatingIncomeExpense = line(-10, "OtherNonoperatingIncomeExpense");
    }
    if (kind === "all costs") Object.assign(row.filedIncomeLines!, { CostsAndExpenses: line(710, "CostsAndExpenses"), BenefitsLossesAndExpenses: line(720, "BenefitsLossesAndExpenses") });
    expect(completeOperatingBridge(line(1000, "Revenues"), line(290, "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest"), row.filedIncomeLines!)).toBeNull();
    const result = corroborateOperatingIncome(row, row);
    expect(result.operatingIncome).toBeUndefined();
    expect(operatingIncomeForNonMargins(result)).toBeNull();
    expect(result.waccOperatingIncome).toBeUndefined();
    expect(result.fieldConflicts?.operatingIncome?.usable).toBe(false);
    expect(result.operatingIncomeBasis).toMatch(/conflict/i);
  });
  it("lets an independently complete nonoperating aggregate replace its conflicting interest children", () => {
    const row = incomeRow();
    row.filedIncomeLines!.InterestAndDebtExpense = line(20, "InterestAndDebtExpense");
    row.filedIncomeLines!.NonoperatingIncomeExpense = line(-10, "NonoperatingIncomeExpense");
    const result = completeOperatingBridge(line(1000, "Revenues"), line(290, "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest"), row.filedIncomeLines!);
    expect(result?.value).toBe(300);
    expect(result?.proof.tags).toContain("us-gaap/NonoperatingIncomeExpense");
    expect(result?.proof.tags).not.toContain("us-gaap/InterestAndDebtExpense");
  });
  function quarterPerimeter(note: string, priorSales?: number, priorContractTag?: string) {
    const point = (val: number, accn: string, filed: string) => ({ start: "2025-07-01", end: "2025-09-30", val: val * M, accn, filed, form: "10-Q" });
    const facts: CompanyFacts = { cik: 42, entityName: "Synthetic", facts: { "us-gaap": {
      Revenues: { units: { USD: [point(1000, "new", "2026-10-25"), point(1040, "old", "2025-10-25")] } },
      ...(priorSales === undefined ? {} : { SalesRevenueNet: { units: { USD: [point(priorSales, "old", "2025-10-25")] } } }),
      ...(priorContractTag === undefined ? {} : { [priorContractTag]: { units: { USD: [point(1000, "old", "2025-10-25")] } } }),
      IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: { units: { USD: [point(290, "new", "2026-10-25")] } },
    } } };
    const text = header.replace("Years Ended December 31, 2025 2024", "Three Months Ended September 30, 2025 2024") + table + note;
    const bound = bindPrimaryIncome({ text, accession: "new", filed: "2026-10-25", form: "10-Q", url: "https://www.sec.gov/Archives/edgar/data/42/new.htm" }, facts, "2026-11-01", "2026-11-01");
    expect(bound).toHaveLength(1);
    return primaryPerimeterChange(bound, facts);
  }
  it.each([" Note: no discontinued operations.", " Historical note: operations discontinued in 2018.", " Net income from discontinued operations 0 0",
    " Consolidated Statements of Cash Flows Years Ended December 31, 2026 2025 Net income from discontinued operations 5 4",
    " Note 7. Other periods Net income from discontinued operations 5 4",
    " No net income from discontinued operations 5 4",
  ])("does not infer a current perimeter from a negated, remote or zero mention: %s", note => {
    expect(quarterPerimeter(note)).toBeNull();
  });
  it("does not mistake a changed broader revenue concept for a change in unchanged sales", () => {
    expect(quarterPerimeter(" Net income from discontinued operations 5 4", 1000)).toBeNull();
  });
  it("retains a positive perimeter finding for period-bound discontinued results and revised comparable sales", () => {
    expect(quarterPerimeter(" Net income from discontinued operations 5 4")?.reason).toContain("restates comparative sales for 2025-09-30");
  });
  it.each(["RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax"])("respects contract-family scope disagreement for %s", tag => {
    expect(quarterPerimeter(" Net income from discontinued operations 5 4", undefined, tag)).toBeNull();
  });
  it.each(["bound comparison", "annual admission"])("does not treat an unchanged income-total anchor as a sales recast through %s", mode => {
    const b = retainedAndLater({ revenue: 1000, operating: 500, pretax: 290 });
    if (!b.edgar.companyFacts.ok) throw Error("fixture");
    const facts = b.edgar.companyFacts.value.data, concepts = facts.facts["us-gaap"]!;
    const point = (val: number, accn: string, filed: string) => ({ start: "2025-01-01", end: "2025-03-31", val: val * M, accn, filed, form: "10-Q" });
    (concepts.Revenues as { units: { USD: object[] } }).units.USD.push(point(1100, "qnew", "2026-05-01"), point(1100, "qold", "2025-05-01"));
    (concepts.IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest as { units: { USD: object[] } }).units.USD.push(point(390, "qnew", "2026-05-01"));
    const text = header.replace("Years Ended December 31, 2025 2024", "Three Months Ended March 31, 2025 2024") +
      table.replace("Cost of sales", "Interest income 100 100 Total revenues and other income 1,100 1,000 Cost of sales").replace("290 260", "390 360") + " Net income from discontinued operations 5 4";
    const bound = bindPrimaryIncome({ text, accession: "qnew", filed: "2026-05-01", form: "10-Q", url: "https://www.sec.gov/Archives/edgar/data/42/q.htm" }, facts, "2026-07-06", b.builtAt);
    expect(bound).toHaveLength(1);
    expect(bound[0]).toMatchObject({ revenue: 1000 * M, totalIncome: 1100 * M, operatingIncome: 300 * M });
    if (mode === "bound comparison") expect(primaryPerimeterChange(bound, facts)).toBeNull();
    else {
      b.edgar.tenQNotes = { ok: true, value: { source: "edgar", endpoint: "synthetic", asOf: "2026-05-01", fetchedAt: b.builtAt,
        data: { sectionName: "tenQNotes", text, statementsText: text, chars: text.length, method: "header-regex", accession: "qnew", form: "10-Q", filingDate: "2026-05-01", reportDate: "2025-03-31", documentUrl: "https://www.sec.gov/Archives/edgar/data/42/q.htm" } } };
      const out = withIncomeOperatingBasis(b).statements.incomeAnnual;
      if (!out.ok) throw Error("fixture");
      expect(out.value.data.rows[0]!.primaryIncomeProof?.proof.documents?.[0]?.accession).toBe("annual");
      expect(out.value.data.rows[0]!.operatingIncome).toBe(300 * M);
      expect(out.value.data.rows[0]!.operatingPerimeterRefusal).toBeUndefined();
    }
  });
  it.each([1000, null])("does not treat a narrower contract component as a recast of the consolidated total (prior total %s)", priorTotal => {
    const point = (val: number, accn: string, filed: string) => ({ start: "2025-07-01", end: "2025-09-30", val: val * M, accn, filed, form: "10-Q" });
    const facts: CompanyFacts = { cik: 42, entityName: "Synthetic", facts: { "us-gaap": {
      Revenues: { units: { USD: [point(1000, "new", "2026-10-25"), ...(priorTotal === null ? [] : [point(priorTotal, "old", "2025-10-25")])] } },
      RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [point(900, "old", "2025-10-25")] } },
      IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: { units: { USD: [point(290, "new", "2026-10-25")] } },
    } } };
    const text = header.replace("Years Ended December 31, 2025 2024", "Three Months Ended September 30, 2025 2024") + table + " Net income from discontinued operations 5 4";
    const bound = bindPrimaryIncome({ text, accession: "new", filed: "2026-10-25", form: "10-Q", url: "https://www.sec.gov/Archives/edgar/data/42/new.htm" }, facts, "2026-11-01", "2026-11-01");
    expect(bound).toHaveLength(1);
    expect(primaryPerimeterChange(bound, facts)).toBeNull();
  });
  it("does not attach a false annual perimeter refusal from a smaller comparative contract component", () => {
    const b = retainedAndLater({ revenue: 1000, operating: 500, pretax: 290 });
    if (!b.edgar.companyFacts.ok) throw Error("fixture");
    const facts = b.edgar.companyFacts.value.data, concepts = facts.facts["us-gaap"]!;
    const point = (val: number, accn: string, filed: string) => ({ start: "2025-01-01", end: "2025-03-31", val: val * M, accn, filed, form: "10-Q" });
    (concepts.Revenues as { units: { USD: object[] } }).units.USD.push(point(1000, "qnew", "2026-05-01"), point(1000, "qold", "2025-05-01"));
    (concepts.IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest as { units: { USD: object[] } }).units.USD.push(point(290, "qnew", "2026-05-01"));
    concepts.RevenueFromContractWithCustomerExcludingAssessedTax = { units: { USD: [point(900, "qold", "2025-05-01")] } };
    const text = header.replace("Years Ended December 31, 2025 2024", "Three Months Ended March 31, 2025 2024") + table + " Net income from discontinued operations 5 4";
    b.edgar.tenQNotes = { ok: true, value: { source: "edgar", endpoint: "synthetic", asOf: "2026-05-01", fetchedAt: b.builtAt,
      data: { sectionName: "tenQNotes", text, statementsText: text, chars: text.length, method: "header-regex", accession: "qnew", form: "10-Q", filingDate: "2026-05-01", reportDate: "2025-03-31", documentUrl: "https://www.sec.gov/Archives/edgar/data/42/q.htm" } } };
    const out = withIncomeOperatingBasis(b).statements.incomeAnnual;
    if (!out.ok) throw Error("fixture");
    expect(out.value.data.rows[0]!.operatingPerimeterRefusal).toBeUndefined();
  });
});
