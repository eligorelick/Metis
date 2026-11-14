import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { runStageB } from "@/pipeline/compute";
import * as tagOwner from "@/edgar/tagSynonyms";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpCashFlowRow, FmpIncomeStatementRow, FmpStatementRow } from "@/providers/fmp";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import { enrichIncomeClassification } from "@/edgar/incomeClassification";
import { enrichFinancialFields, admitFiledStatementFlows, admitFiledCapitalExpenditure, admitFiledInterestExpense } from "@/edgar/financialEnrichment";
import { withCashFlowSbcBasis } from "@/pipeline/cashFlowBasis";
import { withBorrowingCostBasis } from "@/pipeline/borrowingCostBasis";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

// D-262 (P8, P13): synthetic filings and observations, no vendor response data.
const observedAt = "2026-11-01T12:00:00.000Z";
const M = 1_000_000;
const PPE = "PaymentsToAcquireOtherPropertyPlantAndEquipment";
const INTEREST = "InterestExpenseNonoperating";
const point = (start: string, end: string, val: number, filed: string, accn = filed) =>
  ({ start, end, val, filed, accn, form: end.endsWith("12-31") ? "10-K" : "10-Q", fy: Number(end.slice(0, 4)), fp: end.endsWith("12-31") ? "FY" : "Q3" });
type Point = ReturnType<typeof point>;
const facts = (tags: Record<string, Point[]>, unit = "USD"): CompanyFacts => ({ cik: 1, entityName: "Synthetic equipment manufacturer",
  facts: { "us-gaap": Object.fromEntries(Object.entries(tags).map(([tag, ps]) => [tag, { units: { [unit]: ps } }])) } });
const annual = (val: number) => point("2025-01-01", "2025-12-31", val, "2026-02-10");
describe("D-262 review: same quantity, not a convenient component", () => {
  it.each([
    ["PaymentsToAcquireProductiveAssets", 1000, PPE, 50],
    ["PaymentsToAcquireOilAndGasProperty", 900, PPE, 100],
    ["PaymentsToAcquirePropertyPlantAndEquipment", 300, "PaymentsToAcquireRealEstate", 700],
    ["PaymentsToAcquirePropertyPlantAndEquipment", 300, "PaymentsToDevelopSoftware", 700],
    ["PaymentsToAcquirePropertyPlantAndEquipment", 300, "PaymentsForCapitalImprovements", 700],
    ["PaymentsToAcquirePropertyPlantAndEquipment", 300, "PaymentsForProceedsFromProductiveAssets", 700],
    ["PaymentsToAcquireRealEstate", 300, PPE, 700],
  ] as const)("retains capex beside competing %s and %s", (a, av, b, bv) => {
    const out = admitFiledCapitalExpenditure(cashRow(-1000 * M), facts({ [a]: [annual(av * M)], [b]: [annual(bv * M)] }), "annual", observedAt);
    expect(out.row.capitalExpenditure).toBe(-1000 * M);
    expect(out.gaps.some(g => g.reason.includes(a) && g.reason.includes(b))).toBe(true);
  });
  it("retains income D&A agreeing with the income line, not the wider cash add-back", () => {
    const row = { ...interestRow(), depreciationAndAmortization: 80 * M };
    const out = admitFiledStatementFlows(row, facts({ CostDepreciationAmortizationAndDepletion: [annual(80 * M)], DepreciationDepletionAndAmortization: [annual(90 * M)] }), "income", "annual", observedAt);
    expect(out.row.depreciationAndAmortization).toBe(80 * M);
  });
  it("does not establish income D&A from the cash-flow line alone", () => {
    const out = admitFiledStatementFlows({ ...interestRow(), depreciationAndAmortization: 80 * M }, facts({ DepreciationDepletionAndAmortization: [annual(90 * M)] }), "income", "annual", observedAt);
    expect(out.row.depreciationAndAmortization).toBe(80 * M);
  });
  it.each([false, true])("does not turn combined interest and dividends into interest alone (bank %s)", bank => {
    const out = admitFiledStatementFlows({ ...interestRow(), interestIncome: 0 }, facts({ InterestAndDividendIncomeOperating: [annual(90 * M)] }), "income", "annual", observedAt, bank);
    expect(out.row.interestIncome).toBe(bank ? 90 * M : 0);
    if (!bank) expect(out.gaps.some(g => g.reason.includes("InterestAndDividendIncomeOperating"))).toBe(true);
  });
  it("treats an absent expense at a vendor-zero row as expected", () => {
    expect(admitFiledInterestExpense(interestRow(0), facts({}), "annual", observedAt).gaps[0]).toMatchObject({ severity: "info", expected: true });
    expect(admitFiledInterestExpense(interestRow(1), facts({}), "annual", observedAt).gaps[0]).toMatchObject({ severity: "warn" });
  });
  it("discloses expense parts on a mixed operating basis", () => {
    const out = admitFiledStatementFlows({ ...interestRow(), sellingGeneralAndAdministrativeExpenses: 80 * M, researchAndDevelopmentExpenses: 20 * M, operatingExpenses: 100 * M }, facts({ SellingGeneralAndAdministrativeExpense: [annual(90 * M)] }), "income", "annual", observedAt);
    expect(out.gaps.some(g => /mixed basis/i.test(g.reason))).toBe(true);
  });
});
const nineMonths = (val: number) => point("2025-01-01", "2025-09-30", val, "2025-10-30");
const sixMonths = (val: number) => point("2025-01-01", "2025-06-30", val, "2025-07-30");
const firstQuarter = (val: number) => point("2025-01-01", "2025-03-31", val, "2025-04-30");
const source = <T extends FmpStatementRow>(rows: T[]) => ({ ok: true as const, value: {
  data: { rows, raw: structuredClone(rows) }, source: "fmp" as const, asOf: "2025-12-31", fetchedAt: observedAt, endpoint: "synthetic" } });
const cashRow = (capitalExpenditure = -120 * M): FmpCashFlowRow => ({ date: "2025-12-31", cik: "1", period: "FY", filingDate: "2026-02-10",
  reportedCurrency: "USD", operatingCashFlow: 1000 * M, capitalExpenditure, investmentsInPropertyPlantAndEquipment: capitalExpenditure, freeCashFlow: 1000 * M + capitalExpenditure });
const interestRow = (interestExpense = 80 * M): FmpIncomeStatementRow => ({ date: "2025-12-31", cik: "1", period: "FY", filingDate: "2026-02-10", reportedCurrency: "USD", interestExpense, operatingIncome: 600 * M });
function cashBasis(f: CompanyFacts, annualRows = [cashRow()], quarters: FmpCashFlowRow[] = []) {
  const b = completeCurrencyBundle({}); b.builtAt = observedAt; withIssuerFacts(b, f);
  b.statements.cashflowAnnual = source(annualRows); b.statements.cashflowQuarterly = source(quarters);
  return withCashFlowSbcBasis(b);
}
function interestBasis(f: CompanyFacts, rows = [interestRow()], quarter = false) {
  const b = completeCurrencyBundle({}); b.builtAt = observedAt; withIssuerFacts(b, f);
  b.statements[quarter ? "incomeQuarterly" : "incomeAnnual"] = source(rows);
  return withBorrowingCostBasis(b);
}
const cashRows = (b: ReturnType<typeof cashBasis>, quarter = false) => {
  const input = b.statements[quarter ? "cashflowQuarterly" : "cashflowAnnual"];
  if (!input.ok) throw Error("fixture");
  return input.value.data.rows;
};
const incomeRows = (b: ReturnType<typeof interestBasis>, quarter = false) => {
  const input = b.statements[quarter ? "incomeQuarterly" : "incomeAnnual"];
  if (!input.ok) throw Error("fixture");
  return input.value.data.rows;
};

describe("D-262: filed PP&E spending replaces a conflicting vendor capex family", () => {
  it("corrects the annual capex, its alias and standardized FCF, retaining every vendor observation", () => {
    const out = cashBasis(facts({ [PPE]: [annual(90 * M)], PaymentsToAcquireIntangibleAssets: [annual(20 * M)], PaymentsToAcquireInProcessResearchAndDevelopment: [annual(30 * M)] }));
    expect(cashRows(out)[0]).toMatchObject({ capitalExpenditure: -90 * M, investmentsInPropertyPlantAndEquipment: -90 * M, freeCashFlow: 910 * M,
      fieldConflicts: { capitalExpenditure: { usable: true, resolution: "filed-family", vendorValue: -120 * M, secValue: -90 * M },
        freeCashFlow: { vendorValue: 880 * M, secValue: 910 * M } },
      fieldProvenance: { capitalExpenditure: { tags: [`us-gaap/${PPE}`], periodStart: "2025-01-01", filings: [{ filed: "2026-02-10" }] } } });
    expect(out.statements.cashflowAnnual.ok && out.statements.cashflowAnnual.value.data.raw).toEqual([cashRow()]);
  });

  it("derives all four standalone quarters on the same tag even when annual vendor capex conflicts", () => {
    const f = facts({ [PPE]: [firstQuarter(17 * M), sixMonths(42 * M), nineMonths(60 * M), annual(90 * M)] });
    const quarters = [
      { ...cashRow(-2 * M), period: "Q3", date: "2025-09-30", filingDate: "2025-10-30" },
      { ...cashRow(-28 * M), period: "Q2", date: "2025-06-30", filingDate: "2025-07-30" },
      { ...cashRow(-55 * M), period: "Q1", date: "2025-03-31", filingDate: "2025-04-30" },
      { ...cashRow(-20 * M), period: "Q4" },
    ];
    const out = cashBasis(f, [cashRow()], quarters);
    expect(cashRows(out, true).map(row => row.capitalExpenditure)).toEqual([-18 * M, -25 * M, -17 * M, -30 * M]);
    expect(cashRows(out, true).map(row => row.freeCashFlow)).toEqual([982 * M, 975 * M, 983 * M, 970 * M]);
    expect(cashRows(out, true)[0]?.fieldProvenance?.capitalExpenditure).toMatchObject({ derivation: "ytd-difference", periodStart: "2025-07-01",
      filings: [{ filed: "2025-10-30" }, { filed: "2025-07-30" }] });
  });

  it("keeps the original compatible quarter when later comparatives only reround the operands", () => {
    const f = facts({ [PPE]: [sixMonths(42.6 * M), nineMonths(60.7 * M), annual(90 * M),
      point("2025-01-01", "2025-06-30", 43 * M, "2026-07-30"), point("2025-01-01", "2025-09-30", 61 * M, "2026-10-30")] });
    const row = { ...cashRow(-2 * M), period: "Q3", date: "2025-09-30", filingDate: "2025-10-30" };
    expect(cashRows(cashBasis(f, [cashRow()], [row]), true)[0]).toMatchObject({ capitalExpenditure: -18.1 * M,
      fieldProvenance: { capitalExpenditure: { filings: [{ filed: "2025-10-30" }, { filed: "2025-07-30" }] } } });
  });

  it("compatible control: same-observation rounding leaves the vendor values unchanged", () => {
    const row = cashRow(-90 * M);
    expect(cashRows(cashBasis(facts({ PaymentsToAcquirePropertyPlantAndEquipment: [annual(90.001 * M)] }), [row]))[0]?.capitalExpenditure).toBe(-90 * M);
  });

  it("unrelated software filer: no PP&E fact leaves its retained cash-capex convention intact", () => {
    const row = cashRow();
    const f = facts({ PaymentsToDevelopSoftware: [annual(50 * M)], PaymentsToAcquireBusinessesNetOfCashAcquired: [annual(90 * M)] });
    expect(cashRows(cashBasis(f, [row]))[0]?.capitalExpenditure).toBe(-120 * M);
  });

  it("retains the observation when another admitted filing carries a competing period line", () => {
    const f = facts({ PaymentsToAcquirePropertyPlantAndEquipment: [annual(100 * M)], [PPE]: [{ ...annual(90 * M), accn: "another-filing" }],
      PaymentsToAcquireIntangibleAssets: [annual(20 * M)], PaymentsToAcquireInProcessResearchAndDevelopment: [annual(30 * M)] });
    expect(cashRows(cashBasis(f))[0]?.capitalExpenditure).toBe(-120 * M);
  });

  it.each(["currency", "issuer", "period", "future", "ambiguous", "negative"])("does not replace an unproved %s capex value", reason => {
    const row = cashRow(); const f = facts({ [PPE]: [annual(90 * M)] });
    if (reason === "currency") row.reportedCurrency = "EUR";
    if (reason === "issuer") row.cik = "2";
    if (reason === "period") row.periodStart = "2025-01-02";
    if (reason === "future") f.facts["us-gaap"]![PPE] = { units: { USD: [{ ...annual(90 * M), filed: "2027-02-10" }] } };
    if (reason === "ambiguous") f.facts["us-gaap"]![PPE] = { units: { USD: [annual(90 * M), annual(95 * M)] } };
    if (reason === "negative") f.facts["us-gaap"]![PPE] = { units: { USD: [annual(-90 * M)] } };
    expect(cashRows(cashBasis(f, [row]))[0]?.capitalExpenditure).toBe(-120 * M);
  });

  it("keeps an independent FCF refusal after correcting capex", () => {
    const row = cashRow(); row.fieldConflicts = { freeCashFlow: { usable: false, vendorValue: 880 * M, secValue: null, reason: "independent scope refusal", cause: "vendor-sec-value-conflict" } };
    const out = cashRows(cashBasis(facts({ [PPE]: [annual(90 * M)] }), [row]))[0]!;
    expect(out.capitalExpenditure).toBe(-90 * M);
    expect(out.fieldConflicts?.freeCashFlow).toEqual(row.fieldConflicts.freeCashFlow);
  });

  it("the statement owner extracts other PP&E as cash capex without adding acquired research", () => {
    const f = facts({ Revenues: [annual(2000 * M)], [PPE]: [annual(90 * M)], PaymentsToAcquireIntangibleAssets: [annual(20 * M)], PaymentsToAcquireInProcessResearchAndDevelopment: [annual(30 * M)], NetCashProvidedByUsedInOperatingActivities: [annual(1000 * M)] });
    const out = buildStatementsFromCompanyFacts(f, { symbol: "SYNTH", cik: "1", asOf: observedAt.slice(0, 10), factsObservedAt: observedAt,
      annualPeriods: 1, quarterlyPeriods: 0, vendorSplits: { status: "unavailable", source: "fixture", reason: "additive cash only" } });
    expect(out.cashflowAnnual.rows[0]).toMatchObject({ capitalExpenditure: -90 * M, freeCashFlow: 910 * M });
  });
});

describe("D-262: filed interest expense, with no net-income or capitalized-interest proxy", () => {
  it("corrects a conflicting fiscal-year expense and keeps the provider observation and filing", () => {
    const out = incomeRows(interestBasis(facts({ [INTEREST]: [annual(90 * M)] })))[0]!;
    expect(out).toMatchObject({ interestExpense: 90 * M, operatingIncome: 600 * M,
      fieldConflicts: { interestExpense: { usable: true, resolution: "filed-family", vendorValue: 80 * M, secValue: 90 * M } },
      fieldProvenance: { interestExpense: { tags: [`us-gaap/${INTEREST}`], periodStart: "2025-01-01", filings: [{ filed: "2026-02-10" }] } } });
  });

  it("derives Q4 as annual less nine-month expense", () => {
    const row = { ...interestRow(10 * M), period: "Q4", periodStart: "2025-10-01" };
    const out = incomeRows(interestBasis(facts({ [INTEREST]: [annual(90 * M), nineMonths(67 * M)] }), [row], true), true)[0]!;
    expect(out).toMatchObject({ interestExpense: 23 * M, fieldProvenance: { interestExpense: { derivation: "ytd-difference", periodStart: "2025-10-01",
      filings: [{ filed: "2026-02-10" }, { filed: "2025-10-30" }] } } });
  });

  it("compatible control: an agreeing direct expense does not move", () => {
    expect(incomeRows(interestBasis(facts({ InterestExpense: [annual(80 * M)] })))[0]?.interestExpense).toBe(80 * M);
  });

  it("a vendor zero cannot conceal a positive filed expense", () => {
    expect(incomeRows(interestBasis(facts({ [INTEREST]: [annual(90 * M)] }), [interestRow(0)]))[0]?.interestExpense).toBe(90 * M);
  });

  it("a direct expense fact settles a vendor amount that instead matches capitalized borrowing costs", () => {
    const f = facts({ [INTEREST]: [annual(90 * M)], InterestCostsIncurred: [annual(80 * M)], RealEstateInventoryCapitalizedInterestCostsCostOfSales1: [annual(70 * M)] });
    f.facts["us-gaap"]!.RealEstateInventoryCapitalizedInterestCosts = { units: { USD: [
      { ...annual(100 * M), start: undefined, end: "2024-12-31" }, { ...annual(110 * M), start: undefined },
    ] } };
    expect(incomeRows(interestBasis(f))[0]?.interestExpense).toBe(90 * M);
  });

  it.each(["InterestIncomeExpenseNonoperatingNet", "InterestPaid", "InterestCostsIncurred"])("retains expense unverified when only %s is filed", tag => {
    const out = interestBasis(facts({ [tag]: [annual(90 * M)] }));
    expect(incomeRows(out)[0]?.interestExpense).toBe(80 * M);
    expect(incomeRows(out)[0]?.fieldProvenance?.interestExpense).toBeUndefined();
    expect(out.gaps.some(gap => gap.field === "statements.income.2025-12-31.interestExpense" && /vendor.*unverified/i.test(gap.reason))).toBe(true);
  });

  it("never revives a less preferred concept when the preferred expense has conflicting copies", () => {
    const out = interestBasis(facts({ InterestExpense: [annual(90 * M), annual(95 * M)], [INTEREST]: [annual(100 * M)] }));
    expect(incomeRows(out)[0]?.interestExpense).toBe(80 * M);
    expect(incomeRows(out)[0]?.fieldProvenance?.interestExpense).toBeUndefined();
  });

  it("keeps an independent earlier interest refusal", () => {
    const row = interestRow(); row.fieldConflicts = { interestExpense: { usable: false, vendorValue: 80 * M, secValue: null, reason: "independent scope refusal", cause: "borrowing-cost-scope" } };
    expect(incomeRows(interestBasis(facts({ [INTEREST]: [annual(90 * M)] }), [row]))[0]?.fieldConflicts?.interestExpense).toEqual(row.fieldConflicts.interestExpense);
  });
});

describe("D-262 breadth: independently tagged statement flows", () => {
  const cashFields = [
    ["depreciationAndAmortization", "DepreciationDepletionAndAmortization", 1],
    ["stockBasedCompensation", "ShareBasedCompensation", 1],
    ["commonStockRepurchased", "PaymentsForRepurchaseOfCommonStock", -1],
    ["commonStockIssuance", "ProceedsFromIssuanceOfCommonStock", 1],
    ["acquisitionsNet", "PaymentsToAcquireBusinessesNetOfCashAcquired", -1],
    ["netDividendsPaid", "PaymentsOfDividends", -1],
    ["commonDividendsPaid", "PaymentsOfDividendsCommonStock", -1],
    ["preferredDividendsPaid", "PaymentsOfDividendsPreferredStockAndPreferenceStock", -1],
    ["incomeTaxesPaid", "IncomeTaxesPaidNet", 1],
    ["interestPaid", "InterestPaidNet", 1],
    ["financeLeasePrincipalPayments", "FinanceLeasePrincipalPayments", 1],
    ["changeInWorkingCapital", "IncreaseDecreaseInOperatingCapital", -1],
    ["netCashProvidedByInvestingActivities", "NetCashProvidedByUsedInInvestingActivities", 1],
    ["netCashProvidedByFinancingActivities", "NetCashProvidedByUsedInFinancingActivities", 1],
  ] as const;
  it.each(cashFields)("corrects annual and quarterly %s from its own filed %s", (field, tag, sign) => {
    const f = facts({ [tag]: [annual(90 * M), nineMonths(60 * M)] });
    const row = { ...cashRow(), [field]: sign * 80 * M };
    const q = { ...row, [field]: sign * 20 * M, period: "Q4" };
    const out = cashBasis(f, [row], [q]);
    expect(cashRows(out)[0]?.[field]).toBe(sign * 90 * M);
    expect(cashRows(out, true)[0]?.[field]).toBe(sign * 30 * M);
    expect(cashRows(out)[0]?.fieldConflicts?.[field]).toMatchObject({ usable: true, resolution: "filed-family", vendorValue: sign * 80 * M });
    const acquired = enrichFinancialFields(source([]), source([row]), f, "annual", observedAt);
    expect(acquired.cashflow.ok && acquired.cashflow.value.data.rows[0]?.[field]).toBe(sign * 90 * M);
  });

  it.each([
    ["depreciationAndAmortization", "CostDepreciationAmortizationAndDepletion"],
    ["researchAndDevelopmentExpenses", "ResearchAndDevelopmentExpense"],
    ["sellingGeneralAndAdministrativeExpenses", "SellingGeneralAndAdministrativeExpense"],
    ["interestIncome", "InvestmentIncomeInterest"],
    ["netInterestIncome", "InterestIncomeExpenseNet"],
  ])("corrects income-statement %s without changing its definition", (field, tag) => {
    const f = facts({ [tag]: [annual(90 * M), nineMonths(60 * M)] });
    const a = enrichIncomeClassification(source([{ ...interestRow(), [field]: 80 * M }]), f, "annual", observedAt);
    const q = enrichIncomeClassification(source([{ ...interestRow(), period: "Q4", [field]: 20 * M }]), f, "quarter", observedAt);
    expect(a.income.ok && a.income.value.data.rows[0]?.[field]).toBe((field === "depreciationAndAmortization" ? 80 : 90) * M);
    if (field === "depreciationAndAmortization") expect(a.income.ok && a.income.value.data.rows[0]?.fieldProvenance?.[field]).toBeUndefined();
    expect(q.income.ok && q.income.value.data.rows[0]?.[field]).toBe((field === "depreciationAndAmortization" ? 20 : 30) * M);
  });

  it("does not call partial depreciation total D&A", () => {
    const f = facts({ Depreciation: [annual(90 * M)] });
    expect(cashRows(cashBasis(f, [{ ...cashRow(), depreciationAndAmortization: 80 * M }]))[0]?.depreciationAndAmortization).toBe(80 * M);
    const subset = facts({ DepreciationDepletionAndAmortization: [annual(70 * M)], Depreciation: [annual(90 * M)] });
    expect(cashRows(cashBasis(subset, [{ ...cashRow(), depreciationAndAmortization: 80 * M }]))[0]?.depreciationAndAmortization).toBe(80 * M);
  });

  it("never treats common-share components or absent proceeds as total net stock issuance", () => {
    const row = { ...cashRow(), netStockIssuance: -80 * M };
    const f = facts({ ProceedsFromIssuanceOfCommonStock: [annual(10 * M)], PaymentsForRepurchaseOfCommonStock: [annual(100 * M)] });
    expect(cashRows(cashBasis(f, [row]))[0]?.netStockIssuance).toBe(-80 * M);
    expect(cashRows(cashBasis(facts({ PaymentsForRepurchaseOfCommonStock: [annual(100 * M)] }), [row]))[0]?.netStockIssuance).toBe(-80 * M);
  });

  it("supports US-GAAP facts in a foreign annual filing without mapping unrelated IFRS concepts", () => {
    const f = facts({ ShareBasedCompensation: [{ ...annual(90 * M), form: "20-F" }] });
    expect(cashRows(cashBasis(f, [{ ...cashRow(), stockBasedCompensation: 80 * M }]))[0]?.stockBasedCompensation).toBe(90 * M);
    const ifrs: CompanyFacts = { ...f, facts: { "ifrs-full": { SharebasedPayment: { units: { USD: [annual(90 * M)] } } } } };
    expect(cashRows(cashBasis(ifrs, [{ ...cashRow(), stockBasedCompensation: 80 * M }]))[0]?.stockBasedCompensation).toBe(80 * M);
  });

  it("recovers an earlier value-only SBC refusal only from the same exact filed evidence", () => {
    const proof = { source: "edgar" as const, unit: "USD", periodStart: "2025-01-01", periodEnd: "2025-12-31", observedAt,
      tags: ["us-gaap/ShareBasedCompensation"], filings: [{ accn: "2026-02-10", filed: "2026-02-10", form: "10-K" }] };
    const row = { ...cashRow(), stockBasedCompensation: null, fieldConflicts: { stockBasedCompensation: { usable: false, cause: "vendor-sec-value-conflict" as const,
      vendorValue: 80 * M, secValue: 90 * M, secEvidence: proof, reason: "original value-only conflict" } } } as unknown as FmpCashFlowRow;
    const out = cashBasis(facts({ ShareBasedCompensation: [annual(90 * M)] }), [row]);
    expect(cashRows(out)[0]?.stockBasedCompensation).toBe(90 * M);
    expect(cashRows(out)[0]?.fieldConflicts?.stockBasedCompensation).toMatchObject({ usable: true, vendorValue: 80 * M });
    expect(cashRows(cashBasis(facts({ ShareBasedCompensation: [annual(91 * M)] }), [row]))[0]?.stockBasedCompensation).toBeNull();
  });

  it("adopts conflicting costs only as a complete operating family on the admitted revenue", () => {
    const f = facts({ Revenues: [annual(2000 * M)], CostOfRevenue: [annual(1000 * M)], GrossProfit: [annual(1000 * M)],
      OperatingExpenses: [annual(400 * M)], OperatingIncomeLoss: [annual(600 * M)] });
    const row = { ...interestRow(), revenue: 2000 * M, costOfRevenue: 1100 * M, grossProfit: 900 * M, operatingExpenses: 450 * M };
    const out = enrichIncomeClassification(source([row]), f, "annual", observedAt);
    expect(out.income.ok && out.income.value.data.rows[0]).toMatchObject({ costOfRevenue: 1000 * M, grossProfit: 1000 * M, operatingExpenses: 400 * M });
  });

  it("preserves proved bank revenue when a sibling R&D correction creates a new row object", () => {
    const f = facts({ Revenues: [annual(1000 * M)], InterestIncomeExpenseNet: [annual(600 * M)], NoninterestIncome: [annual(400 * M)],
      ResearchAndDevelopmentExpense: [annual(90 * M)] });
    const row = { ...interestRow(), revenue: 2000 * M, researchAndDevelopmentExpenses: 80 * M };
    const out = enrichIncomeClassification(source([row]), f, "annual", observedAt, { bankRevenue: true });
    expect(out.income.ok && out.income.value.data.rows[0]).toMatchObject({ revenue: 1000 * M, researchAndDevelopmentExpenses: 90 * M,
      fieldConflicts: { revenue: { usable: true, vendorValue: 2000 * M } } });
  });

  it.each(["bank", "securities"])("uses operating interest income before investment components for a %s filer", shape => {
    const f = facts({ InterestIncomeOperating: [annual(100 * M)], InvestmentIncomeInterest: [annual(90 * M)] });
    const out = enrichIncomeClassification(source([{ ...interestRow(), interestIncome: 80 * M }]), f, "annual", observedAt,
      shape === "bank" ? { bankRevenue: true } : { securitiesRevenue: true });
    expect(out.income.ok && out.income.value.data.rows[0]?.interestIncome).toBe(100 * M);
  });
});

it("records both revised decisions", () => {
  const text = fs.readFileSync("docs/audit/DECISIONS.md", "utf8");
  expect(text.split("## D-200 -")[1]!.split("\n## ")[0]).toContain("Revised by D-262");
  expect(text.split("## D-262 -")[1]!.split("\n## ")[0]).toContain("D-215");
});

it("preserves original lease-principal precision through the legacy enrichment loop", () => {
  const f = facts({ FinanceLeasePrincipalPayments: [annual(90.4 * M), { ...annual(90 * M), filed: "2026-04-01", accn: "later" }] });
  const out = enrichFinancialFields(source([]), source([{ ...cashRow(), financeLeasePrincipalPayments: 90 * M }]), f, "annual", observedAt);
  expect(out.cashflow.ok && out.cashflow.value.data.rows[0]?.financeLeasePrincipalPayments).toBe(90.4 * M);
  expect(out.cashflow.ok && out.cashflow.value.data.rows[0]?.fieldConflicts?.financeLeasePrincipalPayments?.usable).toBe(true);
});

it("does not narrow an income D&A observation already agreeing with a separately filed D&A basis", () => {
  const out = admitFiledStatementFlows({ ...interestRow(), depreciationAndAmortization: 80 * M }, facts({ CostDepreciationAmortizationAndDepletion: [annual(70 * M)], DepreciationDepletionAndAmortization: [annual(80 * M)] }), "income", "annual", observedAt);
  expect(out.row.depreciationAndAmortization).toBe(80 * M);
});

it.each(["PaymentsForConstructionInProcess", "PaymentsForSoftware"])("blocks the capital sibling %s", tag => {
 expect(admitFiledCapitalExpenditure(cashRow(-1000*M),facts({ PaymentsToAcquirePropertyPlantAndEquipment:[annual(300*M)], [tag]:[annual(700*M)] }),"annual",observedAt).row.capitalExpenditure).toBe(-1000*M);
});
it("covers every member of the owner's capital spending family", () => {
 const family = (tagOwner as unknown as { capitalSpendingTags:()=>readonly string[] }).capitalSpendingTags();
 expect(family).toContain("PaymentsForConstructionInProcess");
 for(const tag of family) {
  const selected=tag===PPE?"PaymentsToAcquirePropertyPlantAndEquipment":PPE;
  const out=admitFiledCapitalExpenditure(cashRow(-1000*M),facts({[selected]:[annual(300*M)],[tag]:[annual(700*M)]}),"annual",observedAt);
  expect(out.row.capitalExpenditure,tag).toBe(-1000*M);
 }
});
it("recognizes competing period facts in another admitted filing", () => {
 const out=admitFiledCapitalExpenditure(cashRow(-1000*M),facts({[PPE]:[annual(300*M)],PaymentsForSoftware:[{...annual(700*M),accn:"other",filed:"2026-03-01"}]}),"annual",observedAt);
 expect(out.row.capitalExpenditure).toBe(-1000*M);
});
it("ignores an explicit zero competing component", () => {
 expect(admitFiledCapitalExpenditure(cashRow(-900*M),facts({PaymentsToAcquirePropertyPlantAndEquipment:[annual(1000*M)],[PPE]:[annual(0)]}),"annual",observedAt).row.capitalExpenditure).toBe(-1000*M);
});
it("does not narrow unproved total income D&A to the cost portion", () => {
 expect(admitFiledStatementFlows({...interestRow(),depreciationAndAmortization:200*M},facts({CostDepreciationAmortizationAndDepletion:[annual(150*M)]}),"income","annual",observedAt).row.depreciationAndAmortization).toBe(200*M);
});
it("does not disclose a mixed basis when the corrected parts agree", () => {
 const out=admitFiledStatementFlows({...interestRow(),researchAndDevelopmentExpenses:20*M,sellingGeneralAndAdministrativeExpenses:80*M,operatingExpenses:110*M},facts({SellingGeneralAndAdministrativeExpense:[annual(90*M)]}),"income","annual",observedAt);
 expect(out.gaps.some(g=>/Mixed basis/.test(g.reason))).toBe(false);
});

it("keeps the manifest disclosure visible while documenting the existing row-qualification limit", () => {
 const f=facts({SellingGeneralAndAdministrativeExpense:[annual(90*M)]});
 const out=admitFiledStatementFlows({...interestRow(),researchAndDevelopmentExpenses:20*M,sellingGeneralAndAdministrativeExpenses:80*M,operatingExpenses:100*M},f,"income","annual",observedAt);
 expect(out.gaps.some(g=>g.field.includes("2025-12-31") && g.reason.includes("Mixed basis"))).toBe(true);
 const b=completeCurrencyBundle({});b.builtAt=observedAt;withIssuerFacts(b,f);b.statements.incomeAnnual=source([out.row]);b.gaps.push(...out.gaps);
 const payload=assembleContextPayload(b,runStageB(b),{checks:[],flags:[],gaps:[]});
 const statement=payload.statements.find(s=>s.title.startsWith("Income statement") && s.title.endsWith("annual"));
 expect(statement).toBeDefined();
 expect(statement!.notes.join(" ")).not.toContain("Mixed basis");
});
it("honors the latest explicit component zero without treating an omitted period as zero", () => {
 const f=facts({[PPE]:[annual(1000*M)],PaymentsForSoftware:[{...annual(100*M),accn:"earlier"},{...annual(0),accn:"newer",filed:"2026-03-01"}]});
 expect(admitFiledCapitalExpenditure(cashRow(-900*M),f,"annual",observedAt).row.capitalExpenditure).toBe(-1000*M);
});
