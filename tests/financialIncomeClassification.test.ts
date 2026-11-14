import { describe, expect, it } from "vitest";
import { enrichIncomeClassification } from "@/edgar/incomeClassification";
import { getConcept, type CompanyFacts } from "@/edgar/xbrl";
import type { FmpIncomeStatementRow, FmpPayload } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";
import { withIncomeOperatingBasis } from "@/pipeline/incomeBasis";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { buildSourceFactSummary } from "@/report/sourceFacts";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import { withFilerShareUnits } from "@/pipeline/shareUnits";

const at = "2026-10-19T00:00:00Z";
function facts(extra: Record<string, number> = {}): CompanyFacts {
  // THREE-MONTH Adobe Q2 control; cash-flow SIX-MONTH values never enter this table.
  const values = { Assets: 10000, Revenues: 6618, CostOfRevenue: 715, GrossProfit: 5903, OperatingIncomeLoss: 2000, OperatingExpenses: 3903, ...extra };
  return { cik: 796343, entityName: "ADOBE INC.", facts: { "us-gaap": Object.fromEntries(Object.entries(values).map(([tag, val]) => [tag, { units: { USD: [
    { start: tag === "Assets" ? undefined : "2026-02-28", end: "2026-05-29", val, accn: "0000796343-26-000112", filed: "2026-06-15", form: "10-Q", fy: 2026, fp: "Q2" },
  ] } }])) } };
}
function input(row: Partial<FmpIncomeStatementRow> = {}): FetchResult<FmpPayload<FmpIncomeStatementRow>> {
  const rows = [{ cik: "796343", date: "2026-05-29", periodStart: "2026-02-28", reportedCurrency: "USD", revenue: 6618, costOfRevenue: 815, grossProfit: 5803, operatingExpenses: 3803, operatingIncome: 2000, ...row }];
  return { ok: true, value: { data: { rows, raw: structuredClone(rows) }, asOf: "2026-05-29", source: "fmp", endpoint: "fixture", fetchedAt: at } };
}
function admit(row: Partial<FmpIncomeStatementRow> = {}, source = facts()) {
  const original = input(row); const result = enrichIncomeClassification(original, source, "quarter", at);
  if (!result.income.ok) throw Error("retained income expected");
  return { row: result.income.value.data.rows[0]!, result, original };
}
describe("same-definition income classification", () => {
  it("refuses a purported quarterly total duplicated as a full-year fact", () => {
    const source = facts({ Revenues: 26472 });
    const concept = source.facts["us-gaap"]!.Revenues as { units: { USD: Record<string, unknown>[] } };
    concept.units.USD.push({ ...concept.units.USD[0]!, start: "2025-05-30", filed: "2026-09-15", accn: "later-annual", form: "10-K", fp: "FY" });
    const result = admit({ revenue: 6600 }, source);
    expect(result.row.revenue).toBeNull();
    expect(result.row.fieldConflicts?.revenue?.reason).toMatch(/duration|full.year/i);
    const supported = facts({ Revenues: 26472, GrossProfit: 25757 });
    (supported.facts["us-gaap"]!.Revenues as typeof concept).units.USD.push(concept.units.USD[1]!);
    expect(admit({ revenue: 6600 }, supported).row.revenue).toBe(26472);
  });
  it.each([false, true])("preserves a later revenue recast and refuses the superseded gross-profit pair (prior GP refusal: %s)", priorGrossRefusal => {
    const source = facts({ RegulatedAndUnregulatedOperatingRevenue: 6618 });
    delete source.facts["us-gaap"]!.Revenues;
    for (const raw of Object.values(source.facts["us-gaap"]!)) {
      const c = raw as { units: { USD: Record<string, unknown>[] } };
      c.units.USD.push({ ...c.units.USD[0]!, val: c.units.USD[0]!.val === 6618 ? 6500 : c.units.USD[0]!.val === 5903 ? 5785 : c.units.USD[0]!.val,
        filed: "2026-09-15", accn: "later-restatement" });
    }
    const original = input({ revenue: undefined, grossProfit: undefined, filingDate: "2026-06-15", fieldConflicts: {
      revenue: { usable: false, vendorValue: 6618, secValue: 6500, reason: "Revenue scope unresolved: older refusal" },
      ...(priorGrossRefusal ? { grossProfit: { usable: false as const, vendorValue: 5903, secValue: null, reason: "Income classification conflict for grossProfit: older refusal" } } : {}),
    } });
    if (!original.ok) throw Error("fixture");
    original.value.data.raw = [{ ...original.value.data.rows[0]!, revenue: 6618, grossProfit: 5903 }];
    const result = enrichIncomeClassification(original, source, "quarter", at).income;
    expect(result.ok && result.value.data.rows[0]).toMatchObject({ revenue: 6500, fieldConflicts: {grossProfit: {usable:false}} });
    expect(result.ok && result.value.data.rows[0]!.grossProfit == null).toBe(true);
  });
  it("binds unchanged revenue to an already admitted same-filing operating numerator on replay", () => {
    const source = facts();
    const op = source.facts["us-gaap"]!.OperatingIncomeLoss as { units: { USD: Record<string, unknown>[] } };
    op.units.USD.push({ ...op.units.USD[0]!, val: 2100, filed: "2026-09-15", accn: "later-operating-copy" });
    const original = input({ filingDate: "2026-06-15", fieldProvenance: { operatingIncome: {
      source: "edgar", unit: "USD", periodStart: "2026-02-28", periodEnd: "2026-05-29", observedAt: at,
      tags: ["us-gaap/OperatingIncomeLoss"], filings: [{ accn: "0000796343-26-000112", filed: "2026-06-15", form: "10-Q" }],
    } } });
    const b = withIssuerFacts(completeCurrencyBundle({}), source); b.builtAt = at;
    const replay = withIncomeOperatingBasis({ ...b, statements: { ...b.statements, incomeQuarterly: original } }).statements.incomeQuarterly;
    expect(replay.ok && replay.value.data.rows[0]!.operatingIncome).toBe(2000);
    const fresh = enrichIncomeClassification(original, source, "quarter", at).income;
    const acquired = withIncomeOperatingBasis({ ...b, statements: { ...b.statements, incomeQuarterly: fresh } }).statements.incomeQuarterly;
    expect(acquired.ok && acquired.value.data.rows[0]!.operatingIncome).toBe(2000);
  });
  it.each(["quarter", "annual"] as const)("adopts an independently filed total revenue in %s rows and preserves the vendor observation", scope => {
    const source = facts();
    const original = input({ revenue: 6600, filingDate: "2026-06-15" });
    if (scope === "annual") {
      for (const raw of Object.values(source.facts["us-gaap"]!)) {
        const c = raw as { units: { USD: Record<string, unknown>[] } };
        Object.assign(c.units.USD[0]!, { start: "2025-05-30", form: "10-K", fp: "FY" });
      }
      if (original.ok) original.value.data.rows[0]!.periodStart = "2025-05-30";
    }
    const result = enrichIncomeClassification(original, source, scope, at);
    expect(result.income.ok && result.income.value.data.rows[0]).toMatchObject({ revenue: 6618,
      fieldConflicts: { revenue: { vendorValue: 6600, secValue: 6618, usable: true, resolution: "filed-family" } },
      fieldProvenance: { revenue: { tags: ["us-gaap/Revenues"] } } });
    expect(original.ok && original.value.data.rows[0]!.revenue).toBe(6600);
  });
  it("recovers a frozen total-revenue refusal in the calculation view", () => {
    const b = withIssuerFacts(completeCurrencyBundle({}), facts()); b.builtAt = at;
    b.statements.incomeQuarterly = input({ revenue: undefined, fieldConflicts: { revenue: { usable: false, vendorValue: 6600, secValue: 6618,
      reason: "Income classification conflict for revenue: old refusal" } } });
    const before = JSON.stringify(b);
    const result = withIncomeOperatingBasis(b).statements.incomeQuarterly;
    expect(result.ok && result.value.data.rows[0]!.revenue).toBe(6618);
    expect(JSON.stringify(b)).toBe(before);
  });
  it("uses the complete operating total instead of a narrower contract-revenue note", () => {
    const source = facts({ RegulatedAndUnregulatedOperatingRevenue: 6618 });
    source.facts["us-gaap"]!.RevenueFromContractWithCustomerIncludingAssessedTax = facts({ Revenues: 6500 }).facts["us-gaap"]!.Revenues;
    delete source.facts["us-gaap"]!.Revenues;
    const result = admit({}, source);
    expect(result.row.revenue).toBe(6618);
    expect(result.row.fieldProvenance?.revenue?.tags).toEqual(["us-gaap/RegulatedAndUnregulatedOperatingRevenue"]);
  });
  it("establishes a total from both filed goods and services rather than one component", () => {
    const source = facts({ SalesRevenueGoodsNet: 6000, SalesRevenueServicesNet: 618 }); delete source.facts["us-gaap"]!.Revenues;
    const result = admit({ revenue: 6600 }, source);
    expect(result.row.revenue).toBe(6618);
    expect(result.row.fieldProvenance?.revenue?.tags).toEqual(["us-gaap/SalesRevenueGoodsNet", "us-gaap/SalesRevenueServicesNet"]);
    delete source.facts["us-gaap"]!.SalesRevenueServicesNet;
    expect(admit({ revenue: undefined }, source).row.revenue).toBeUndefined();
  });
  it("does not combine goods and services from different filings", () => {
    const source = facts({ SalesRevenueGoodsNet: 6000, SalesRevenueServicesNet: 618 }); delete source.facts["us-gaap"]!.Revenues;
    const c = source.facts["us-gaap"]!.SalesRevenueServicesNet as { units: { USD: Record<string, unknown>[] } };
    Object.assign(c.units.USD[0]!, { accn: "0000796343-26-000113", filed: "2026-06-16" });
    const result = admit({ revenue: 6600 }, source);
    expect(result.row.revenue).not.toBe(6618);
  });
  it("prefers a later filed comparative when it is no further from the provider", () => {
    const source = facts();
    const c = source.facts["us-gaap"]!.Revenues as { units: { USD: Record<string, unknown>[] } };
    c.units.USD.push({ ...c.units.USD[0], accn: "0000796343-26-000113", filed: "2026-09-15" });
    const result = admit({ filingDate: "2026-06-15", revenue: 6600 }, source);
    expect(result.row.revenue).toBe(6618);
    expect(result.row.fieldProvenance?.revenue?.filings[0]!.filed).toBe("2026-09-15");
  });
  it("does not let a pre-admission validation conflict veto the independently adopted total", () => {
    const source = facts();
    for (const raw of Object.values(source.facts["us-gaap"]!)) {
      const c = raw as { units: { USD: Record<string, unknown>[] } };
      Object.assign(c.units.USD[0]!, { start: "2025-05-30", form: "10-K", fp: "FY" });
    }
    const b = withIssuerFacts(completeCurrencyBundle({}), source); b.builtAt = at;
    b.statements.incomeAnnual = input({ revenue: 6600, date: "2026-05-29", periodStart: "2025-05-30", period: "FY", fiscalYear: "2026", filingDate: "2026-06-15" });
    const result = runStageB(b, undefined, { checks: [{ id: "xbrlCrossCheck.revenue.FY.2026-05-29", name: "Revenue", status: "fail", detail: "Vendor and filed total differ before admission" }], flags: [], gaps: [] });
    expect(result.gaps.some(g => g.field === "projections.revenueEligibility")).toBe(false);
  });
  it("withholds genuinely conflicting same-filing totals instead of selecting one", () => {
    const source = facts();
    const c = source.facts["us-gaap"]!.Revenues as { units: { USD: Record<string, unknown>[] } };
    c.units.USD.push({ ...c.units.USD[0], val: 7000 });
    const result = admit({ revenue: 6600 }, source);
    expect(result.row.revenue).toBeNull();
    expect(result.row.fieldConflicts?.revenue?.reason).toMatch(/filed observations conflict/i);
  });
  it.each(["SalesRevenueNet", "components"])("prefers the complete %s revenue over a narrower contract note", total => {
    const source = facts({ RevenueFromContractWithCustomerExcludingAssessedTax: 6500,
      ...(total === "components" ? { SalesRevenueGoodsNet: 6000, SalesRevenueServicesNet: 618 } : { SalesRevenueNet: 6618 }) });
    delete source.facts["us-gaap"]!.Revenues;
    expect(admit({}, source).row.revenue).toBe(6618);
  });
  it("uses the same total in the validation summary and income admission", () => {
    const source = facts({ RegulatedAndUnregulatedOperatingRevenue: 6618, RevenueFromContractWithCustomerIncludingAssessedTax: 6500 });
    delete source.facts["us-gaap"]!.Revenues;
    const summary = getConcept(source, "revenue", { period: { start: "2026-02-28", end: "2026-05-29" } });
    expect(summary.ok && summary.value.data.value).toBe(6618);
  });
  it.each([true, false])("preserves a later retrospective revenue presentation only when its full gross-profit bridge reconciles (%s)", reconciles => {
    const source = facts({ SalesRevenueNet: 6000, RevenueFromContractWithCustomerExcludingAssessedTax: reconciles ? 6618 : 6500 });
    delete source.facts["us-gaap"]!.Revenues;
    for (const raw of Object.values(source.facts["us-gaap"]!)) {
      const c = raw as { units: { USD: Record<string, unknown>[] } };
      Object.assign(c.units.USD[0]!, { accn: "0000796343-26-000113", filed: "2026-09-15" });
    }
    const original = source.facts["us-gaap"]!.SalesRevenueNet as { units: { USD: Record<string, unknown>[] } };
    Object.assign(original.units.USD[0]!, { accn: "0000796343-26-000112", filed: "2026-06-15" });
    const expected = reconciles ? 6618 : 6000;
    const summary = getConcept(source, "revenue", { period: { start: "2026-02-28", end: "2026-05-29" } });
    expect(summary.ok && summary.value.data.value).toBe(expected);
    expect(admit({ revenue: expected, filingDate: "2026-06-15" }, source).row.revenue).toBe(expected);
  });
  it.each(["SalesRevenueNet", "components"])("selects the exact reconciled later revenue in the %s validation chain", total => {
    const source = facts({ ...(total === "components" ? { SalesRevenueGoodsNet: 5000, SalesRevenueServicesNet: 1000 } : { SalesRevenueNet: 6000 }),
      RevenueFromContractWithCustomerExcludingAssessedTax: 6500, RevenueFromContractWithCustomerIncludingAssessedTax: 6618 });
    delete source.facts["us-gaap"]!.Revenues;
    for (const [tag, raw] of Object.entries(source.facts["us-gaap"]!)) {
      const p = (raw as { units: { USD: Record<string, unknown>[] } }).units.USD[0]!;
      if (!/^SalesRevenue/.test(tag)) Object.assign(p, { accn: "0000796343-26-000113", filed: "2026-09-15" });
    }
    const summary = getConcept(source, "revenue", { period: { start: "2026-02-28", end: "2026-05-29" } });
    expect(summary.ok && summary.value.data.value).toBe(6618);
    expect(summary.ok && summary.value.data.tag).toBe("RevenueFromContractWithCustomerIncludingAssessedTax");
  });
  it("does not mistake a later sales/gross-profit bridge for proof of the broader issuer total", () => {
    const source = facts({ Revenues: 7000, RevenueFromContractWithCustomerExcludingAssessedTax: 6618 });
    const total = source.facts["us-gaap"]!.Revenues as { units: { USD: Record<string, unknown>[] } };
    const gross = source.facts["us-gaap"]!.GrossProfit as { units: { USD: Record<string, unknown>[] } };
    const cost = source.facts["us-gaap"]!.CostOfRevenue as { units: { USD: Record<string, unknown>[] } };
    const contract = source.facts["us-gaap"]!.RevenueFromContractWithCustomerExcludingAssessedTax as { units: { USD: Record<string, unknown>[] } };
    for (const c of [gross, cost, contract]) Object.assign(c.units.USD[0]!, { accn: "0000796343-26-000113", filed: "2026-09-15" });
    expect(total.units.USD[0]!.val).toBe(7000);
    const result = admit({ revenue: 7000, filingDate: "2026-06-15" }, source);
    expect(result.row.revenue).toBe(7000);
    const summary = getConcept(source, "revenue", { period: { start: "2026-02-28", end: "2026-05-29" } });
    expect(summary.ok && summary.value.data.value).toBe(7000);
  });
  it("converges matching later total and gross-profit evidence after an older contract-note refusal", () => {
    const source = facts({ RegulatedAndUnregulatedOperatingRevenue: 6618 }); delete source.facts["us-gaap"]!.Revenues;
    for (const raw of Object.values(source.facts["us-gaap"]!)) {
      const c = raw as { units: { USD: Record<string, unknown>[] } };
      Object.assign(c.units.USD[0]!, { accn: "0000796343-26-000113", filed: "2026-09-15" });
    }
    const fields = { filingDate: "2026-06-15", costOfRevenue: 715, operatingExpenses: 3903 };
    const fresh = admit({ ...fields, revenue: 6618, grossProfit: 5903 }, source);
    const replay = admit({ ...fields, revenue: undefined, grossProfit: undefined, fieldConflicts: {
      revenue: { usable: false, vendorValue: 6618, secValue: 6500, reason: "Revenue scope unresolved: older contract note" },
      grossProfit: { usable: false, vendorValue: 5903, secValue: 5785, reason: "Income classification conflict for grossProfit: older note basis" },
    } }, source);
    expect(replay.row).toMatchObject({ revenue: 6618, grossProfit: 5903 });
    expect(fresh.row).toMatchObject({ revenue: 6618, grossProfit: 5903 });
    expect(replay.row.fieldProvenance?.revenue).toEqual(fresh.row.fieldProvenance?.revenue);
    expect(replay.row.fieldProvenance?.grossProfit).toEqual(fresh.row.fieldProvenance?.grossProfit);
    const b = withIssuerFacts(completeCurrencyBundle({}), source); b.builtAt = at;
    const calculation = (input: typeof fresh.original) => {
      const a = withIncomeOperatingBasis({ ...b, statements: { ...b.statements, incomeQuarterly: input } }).statements.incomeQuarterly;
      return a.ok ? [a.value.data.rows[0]!.revenue, a.value.data.rows[0]!.grossProfit, a.value.data.rows[0]!.operatingIncome] : [];
    };
    expect(calculation(fresh.original)).toEqual(calculation(replay.original));
  });
  it("admits revenue before recovering the dependent filed operating and earnings family", () => {
    const source = facts({ OperatingIncomeLoss: 900, NonoperatingIncomeExpense: 100,
      IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: 1000, IncomeTaxExpenseBenefit: 200, NetIncomeLoss: 800 });
    const result = admit({ revenue: 6600, incomeBeforeTax: 1002, incomeTaxExpense: 200, netIncome: 802,
      operatingIncome: 902, totalOtherIncomeExpensesNet: 100 }, source);
    expect(result.row).toMatchObject({ revenue: 6618, operatingIncome: 900, totalOtherIncomeExpensesNet: 100, incomeBeforeTax: 1000, netIncome: 800 });
    expect(result.row.incomeBeforeTaxRatio).toBeCloseTo(1000 / 6618);
  });
  it.each([false, true])("recovers the dependent operating numerator after prior earnings adoption (nonoperating already adopted: %s)", adoptedOther => {
    const source = facts({ OperatingIncomeLoss: 900, NonoperatingIncomeExpense: 100,
      IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: 1000, IncomeTaxExpenseBenefit: 200, NetIncomeLoss: 800 });
    const fields = { revenue: undefined, operatingIncome: 902, totalOtherIncomeExpensesNet: 100,
      incomeBeforeTax: 1000, incomeTaxExpense: 200, netIncome: 800, fieldConflicts: {
        revenue: { usable: false as const, vendorValue: 6600, secValue: 6618, reason: "Income classification conflict for revenue: older refusal" },
        incomeBeforeTax: { usable: true as const, resolution: "filed-family" as const, vendorValue: adoptedOther ? 1004 : 1002, secValue: 1000, reason: "Filed earnings family adopted" },
        ...(adoptedOther ? { totalOtherIncomeExpensesNet: { usable: true as const, resolution: "filed-family" as const, vendorValue: 102, secValue: 100, reason: "Filed earnings family adopted" } } : {}),
      } };
    expect(admit(fields, source).row.operatingIncome).toBe(900);
    const unknown = admit({ ...fields, operatingIncome: undefined, fieldConflicts: { ...fields.fieldConflicts,
      operatingIncome: { usable: false, vendorValue: 902, secValue: null, reason: "Independent unknown operating refusal" } } }, source);
    expect(unknown.row.operatingIncome).toBeUndefined();
  });
  it("recovers a set-aside gross-profit observation only from an exactly matching retained provider row", () => {
    const source = facts({ RegulatedAndUnregulatedOperatingRevenue: 6618 }); delete source.facts["us-gaap"]!.Revenues;
    const original = input({ revenue: undefined, grossProfit: undefined, filingDate: "2026-06-15", fieldConflicts: {
      revenue: { usable: false, vendorValue: 6618, secValue: 6500, reason: "Vendor quarterly revenue differs from a contract note" },
    } });
    if (!original.ok) throw Error("fixture");
    const raw = { ...original.value.data.rows[0]!, revenue: 6618, grossProfit: 5903, fieldConflicts: undefined };
    original.value.data.raw = [raw];
    const result = enrichIncomeClassification(original, source, "quarter", at);
    expect(result.income.ok && result.income.value.data.rows[0]!.grossProfit).toBe(5903);
    raw.date = "2026-05-28";
    const unmatched = enrichIncomeClassification(original, source, "quarter", at);
    expect(unmatched.income.ok && unmatched.income.value.data.rows[0]!.grossProfit).toBeUndefined();
  });
  it("recovers the original filed earnings before treating later comparative copies as no dispute", () => {
    const source = facts({ IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: 1000,
      IncomeTaxExpenseBenefit: 200, NetIncomeLoss: 800 });
    for (const tag of ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "IncomeTaxExpenseBenefit", "NetIncomeLoss"]) {
      const concept = source.facts["us-gaap"]![tag] as { units: { USD: Record<string, unknown>[] } };
      concept.units.USD.push({ ...concept.units.USD[0], accn: "0000796343-26-000113", filed: "2026-09-15" });
    }
    const result = admit({ filingDate: "2026-06-15", incomeBeforeTax: -1000, incomeTaxExpense: -200, netIncome: -800 }, source);
    expect(result.row).toMatchObject({ incomeBeforeTax: 1000, incomeTaxExpense: 200, netIncome: 800 });
    expect(result.row.fieldProvenance?.netIncome?.filings).toEqual([{ accn: "0000796343-26-000112", filed: "2026-06-15", form: "10-Q" }]);
  });
  it("preserves an SEC-built earnings restatement with the original reporter date", () => {
    const source = facts({ IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: 1000,
      IncomeTaxExpenseBenefit: 200, NetIncomeLoss: 800 });
    for (const [tag, value] of Object.entries({ IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: 1100, IncomeTaxExpenseBenefit: 200, NetIncomeLoss: 900 })) {
      const concept = source.facts["us-gaap"]![tag] as { units: { USD: Record<string, unknown>[] } };
      concept.units.USD.push({ ...concept.units.USD[0], val: value, accn: "0000796343-26-000113", filed: "2026-09-15" });
    }
    const built = buildStatementsFromCompanyFacts(source, { symbol: "EXAMPLE", cik: "796343", asOf: at.slice(0, 10), factsObservedAt: at, annualPeriods: 4, quarterlyPeriods: 4,
      vendorSplits: { status: "retrieved", source: "fixture", events: [], coverage: [{ from: "2020-01-01", to: at.slice(0, 10) }] } });
    const row = built.incomeQuarterly.rows.find(r => r.date === "2026-05-29")!;
    expect(row).toMatchObject({ filingDate: "2026-06-15", incomeBeforeTax: 1100, netIncome: 900 });
    expect(admit(row, source).row).toMatchObject({ incomeBeforeTax: 1100, incomeTaxExpense: 200, netIncome: 900 });
  });
  it.each([false, true])("converges fresh income-first and replay shares-first admission on filed EPS (missing start: %s)", missingStart => {
    const source = facts({ IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: 1000,
      IncomeTaxExpenseBenefit: 200, NetIncomeLoss: 800 });
    const point = { start: "2026-02-28", end: "2026-05-29", accn: "0000796343-26-000112", filed: "2026-06-15", form: "10-Q", fy: 2026, fp: "Q2" };
    source.facts["us-gaap"]!.WeightedAverageNumberOfDilutedSharesOutstanding = { units: { shares: [{ ...point, val: 100 }] } };
    if (missingStart) {
      const shares = source.facts["us-gaap"]!.WeightedAverageNumberOfDilutedSharesOutstanding as { units: { shares: Record<string, unknown>[] } };
      shares.units.shares.push({ ...point, start: "2026-03-01", val: 97 });
    }
    source.facts["us-gaap"]!.EarningsPerShareDiluted = { units: { "USD/shares": [{ ...point, val: 8 }] } };
    const b = completeCurrencyBundle({}); b.builtAt = at;
    withIssuerFacts(b, source);
    if (!b.profile.ok) throw Error("fixture");
    b.profile.value.data.rows[0]!.isAdr = false;
    b.edgar.registrant = { cik10: "0000796343", name: "Example", tickers: [b.symbol], sic: null, sicDescription: null,
      exchanges: [], fiscalYearEnd: "1130", forms: ["10-Q"], stateOfIncorporation: null };
    const built = buildStatementsFromCompanyFacts(source, { symbol: b.symbol, cik: "796343", asOf: at.slice(0, 10), factsObservedAt: at, annualPeriods: 4, quarterlyPeriods: 4,
      vendorSplits: { status: "retrieved", source: "fixture", events: [], coverage: [{ from: "2020-01-01", to: at.slice(0, 10) }] } });
    b.edgar.shareBasis = { splits: built.splits, basisDay: at.slice(0, 10) };
    b.statements.incomeQuarterly = input({ periodStart: missingStart ? undefined : point.start, period: "Q2", filingDate: "2026-06-15", incomeBeforeTax: 1002, incomeTaxExpense: 200,
      netIncome: 802, epsDiluted: 8.02, weightedAverageShsOutDil: 102 });
    const original = structuredClone(b);
    const freshIncome = enrichIncomeClassification(b.statements.incomeQuarterly, source, "quarter", at).income;
    const fresh = withIncomeOperatingBasis(withFilerShareUnits({ ...b, statements: { ...b.statements, incomeQuarterly: freshIncome } }));
    const replay = withIncomeOperatingBasis(withFilerShareUnits(b));
    const row = (bundle: typeof b) => bundle.statements.incomeQuarterly.ok ? bundle.statements.incomeQuarterly.value.data.rows[0]! : null;
    expect(row(fresh)).toMatchObject({ incomeBeforeTax: 1000, incomeTaxExpense: 200, netIncome: 800, weightedAverageShsOutDil: 100, epsDiluted: 8 });
    expect(row(replay)?.epsDiluted).toBe(8);
    expect(row(fresh)?.fieldProvenance?.epsDiluted).toEqual(row(replay)?.fieldProvenance?.epsDiluted);
    expect(row(fresh)?.fieldConflicts?.epsDiluted).toEqual(row(replay)?.fieldConflicts?.epsDiluted);
    expect(b).toEqual(original);
  });
  it("adopts a reconciled filed family even when the contradicted vendor loss adds up", () => {
    const source = facts({ IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: 1119,
      IncomeTaxExpenseBenefit: 270, ProfitLoss: 849, NetIncomeLoss: 844, NetIncomeLossAvailableToCommonStockholdersBasic: 844,
      NetIncomeLossAttributableToNoncontrollingInterest: 5 });
    const result = admit({ incomeBeforeTax: -2251, incomeTaxExpense: -540, netIncome: -1711,
      bottomLineNetIncome: -1711, netIncomeFromContinuingOperations: -1711, netIncomeRatio: -0.2 }, source);
    expect(result.row).toMatchObject({ incomeBeforeTax: 1119, incomeTaxExpense: 270, netIncome: 849,
      bottomLineNetIncome: 844, netIncomeFromContinuingOperations: 849,
      netIncomeConsolidated: 849, netIncomeAvailableToCommon: 844, netIncomeOwnershipBasis: "consolidated" });
    expect(result.row.fieldConflicts?.netIncome).toMatchObject({ vendorValue: -1711, secValue: 849, usable: true, resolution: "filed-family" });
    expect(result.row.fieldProvenance?.netIncome?.tags).toContain("us-gaap/ProfitLoss");
    expect(result.row.incomeBeforeTax! - result.row.incomeTaxExpense!).toBe(result.row.netIncome);
    expect(result.original.ok && result.original.value.data.rows[0]?.netIncome).toBe(-1711);
    const b = withIssuerFacts(completeCurrencyBundle({}), source);
    b.builtAt = at;
    b.statements.incomeQuarterly = result.original;
    const calculation = withIncomeOperatingBasis(b).statements.incomeQuarterly;
    expect(calculation.ok && calculation.value.data.rows[0]?.netIncome).toBe(849);
    expect(calculation.ok && calculation.value.data.rows[0]?.netIncomeConsolidated).toBe(849);
    expect(withIncomeOperatingBasis(withIncomeOperatingBasis(b)).statements).toEqual(withIncomeOperatingBasis(b).statements);
    const summary = buildSourceFactSummary(assembleContextPayload(b, runStageB(b), { checks: [], flags: [], gaps: [] }));
    expect(summary?.status).toBe("available");
    expect(summary?.earningsReconciliation).toMatchObject({ status: "available", pretaxMinusTax: 849, reportedNetIncome: 849, residual: 0 });
  });
  it("adopts a complete filed family even for a small difference", () => {
    const source = facts({ IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: 1000,
      IncomeTaxExpenseBenefit: 200, NetIncomeLoss: 800 });
    const result = admit({ incomeBeforeTax: 1002, incomeTaxExpense: 200, netIncome: 802, bottomLineNetIncome: 802 }, source);
    expect(result.row).toMatchObject({ incomeBeforeTax: 1000, incomeTaxExpense: 200, netIncome: 800, bottomLineNetIncome: 800 });
    expect(result.row.fieldConflicts?.incomeBeforeTax).toMatchObject({ vendorValue: 1002, secValue: 1000, usable: true });
  });
  it("retains a small difference with both observations when the filed family is incomplete", () => {
    const result = admit({ incomeBeforeTax: 1003, incomeTaxExpense: 200, netIncome: 803 },
      facts({ IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: 1000 }));
    expect(result.row).toMatchObject({ incomeBeforeTax: 1003, incomeTaxExpense: 200, netIncome: 803 });
    expect(result.row.fieldConflicts?.incomeBeforeTax).toMatchObject({ vendorValue: 1003, secValue: 1000, usable: true, resolution: "minor-retained" });
    expect(result.result.gaps.some(g => /incomplete/i.test(g.reason) && /1003.*1000/.test(g.reason))).toBe(true);
  });
  it("withholds a material difference when the filed family is incomplete", () => {
    const result = admit({ incomeBeforeTax: 1100, incomeTaxExpense: 200, netIncome: 900 },
      facts({ IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: 1000 }));
    expect(result.row).toMatchObject({ incomeBeforeTax: null, incomeTaxExpense: null, netIncome: null });
    expect(result.row.fieldConflicts?.netIncome?.reason).toMatch(/material.*incomplete|incomplete.*material/i);
  });
  it("withholds an incomplete family on a sign conflict", () => {
    const result = admit({ incomeBeforeTax: -1, incomeTaxExpense: 0, netIncome: -1 },
      facts({ IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: 1 }));
    expect(result.row.netIncome).toBeNull();
    expect(result.row.fieldConflicts?.netIncome?.reason).toMatch(/sign conflict/i);
  });
  it("reconciles filed pretax before equity-method income to the adopted consolidated family", () => {
    const result = admit({ incomeBeforeTax: 11563, incomeTaxExpense: 2768, netIncome: 8873 },
      facts({ IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments: 11541,
        IncomeLossFromEquityMethodInvestments: 109, IncomeTaxExpenseBenefit: 2768, ProfitLoss: 8882, NetIncomeLossAttributableToNoncontrollingInterest: -2 }));
    expect(result.row).toMatchObject({ incomeBeforeTax: 11650, incomeTaxExpense: 2768, netIncome: 8882, netIncomeConsolidated: 8882 });
    expect(result.row.fieldProvenance?.incomeBeforeTax?.tags).toContain("us-gaap/IncomeLossFromEquityMethodInvestments");
  });
  it("replaces or refuses dependent aggregates that no longer reconcile after adoption", () => {
    const source = facts({ OperatingIncomeLoss: 900, NonoperatingIncomeExpense: 100,
      IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: 1000,
      IncomeTaxExpenseBenefit: 200, NetIncomeLoss: 800, DepreciationDepletionAndAmortization: 200 });
    const result = admit({ incomeBeforeTax: 1002, incomeTaxExpense: 200, netIncome: 802,
      operatingIncome: 900, totalOtherIncomeExpensesNet: 102, interestExpense: 100, ebit: 1102, ebitda: 1302, depreciationAndAmortization: 200,
      revenue: 6618, costAndExpenses: 5616 }, source);
    expect(result.row).toMatchObject({ incomeBeforeTax: 1000, incomeTaxExpense: 200, netIncome: 800,
      operatingIncome: 900, totalOtherIncomeExpensesNet: 100, ebit: 900, ebitda: 1100, costAndExpenses: null });
    expect(result.row.operatingIncome! + Number(result.row.totalOtherIncomeExpensesNet)).toBe(result.row.incomeBeforeTax);
    expect(result.row.ebit! + result.row.depreciationAndAmortization!).toBe(result.row.ebitda);
  });
  it("recovers a complete family from a prior D-200 refusal without mutating its frozen row", () => {
    const source = facts({ IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: 1000,
      IncomeTaxExpenseBenefit: 200, NetIncomeLoss: 800 });
    const result = admit({ fieldConflicts: { netIncome: { usable: false, vendorValue: 802, secValue: 800, reason: "Filed earnings conflict for netIncome: old refusal" } } }, source);
    expect(result.row.netIncome).toBe(800);
    expect(result.row.fieldConflicts?.netIncome).toMatchObject({ usable: true, vendorValue: 802, resolution: "filed-family" });
  });
  it("adopts independently filed EPS when the admitted diluted count proves the unchanged share unit", () => {
    const source = facts({ IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: 1000,
      IncomeTaxExpenseBenefit: 200, NetIncomeLoss: 800 });
    const point = { start: "2026-02-28", end: "2026-05-29", accn: "0000796343-26-000112", filed: "2026-06-15", form: "10-Q", fy: 2026, fp: "Q2" };
    source.facts["us-gaap"]!.WeightedAverageNumberOfDilutedSharesOutstanding = { units: { shares: [{ ...point, val: 100 }] } };
    source.facts["us-gaap"]!.EarningsPerShareDiluted = { units: { "USD/shares": [{ ...point, val: 8 }] } };
    const result = admit({ incomeBeforeTax: 1002, incomeTaxExpense: 200, netIncome: 802, epsDiluted: 8.02, weightedAverageShsOutDil: 100,
      fieldProvenance: { weightedAverageShsOutDil: { source: "edgar", unit: "shares", periodStart: point.start, periodEnd: point.end,
        observedAt: at, tags: ["us-gaap/WeightedAverageNumberOfDilutedSharesOutstanding"], filings: [point] } } }, source);
    expect(result.row.epsDiluted).toBe(8);
    expect(result.row.fieldProvenance?.epsDiluted?.unit).toBe("USD/shares");
    expect(result.row.fieldConflicts?.epsDiluted).toMatchObject({ vendorValue: 8.02, secValue: 8, usable: true });
  });
  it("keeps parent earnings when filed noncontrolling income bridges to consolidated profit", () => {
    const source = facts({ IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: 500,
      IncomeTaxExpenseBenefit: 68, ProfitLoss: 432, NetIncomeLoss: 404, NetIncomeLossAttributableToNoncontrollingInterest: 28 });
    delete source.facts["us-gaap"]!.NetIncomeLoss;
    const result = admit({ incomeBeforeTax: 500, incomeTaxExpense: 68, netIncome: 404 }, source);
    expect(result.row.netIncome).toBe(404);
    expect(result.row.fieldConflicts?.netIncome).toBeUndefined();
  });
  it("keeps pretax income that includes the separately filed equity-method result", () => {
    const source = facts({ IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments: 97311,
      IncomeLossFromEquityMethodInvestments: -554, IncomeTaxExpenseBenefit: 19087, NetIncomeLoss: 77670 });
    const result = admit({ incomeBeforeTax: 96757, incomeTaxExpense: 19087, netIncome: 77670 }, source);
    expect(result.row.netIncome).toBe(77670);
    expect(result.row.incomeBeforeTax).toBe(96757);
  });
  it("explains the original contract-scope refusal in an immutable frozen calculation view", () => {
    const f = facts();
    f.facts["us-gaap"]!.RevenueFromContractWithCustomerIncludingAssessedTax = f.facts["us-gaap"]!.Revenues;
    delete f.facts["us-gaap"]!.Revenues;
    const result = admit({ revenue: 7000 }, f);
    result.row.fieldConflicts!.revenue!.reason = "Income classification conflict for revenue: vendor 7000, filed 6618 USD";
    const b = withIssuerFacts(completeCurrencyBundle({}), f);
    b.builtAt = at;
    b.statements.incomeQuarterly = result.result.income;
    const before = JSON.stringify(b);
    const replay = withIncomeOperatingBasis(b).statements.incomeQuarterly;
    expect(replay.ok && replay.value.data.rows[0]!.revenue).toBeNull();
    expect(replay.ok && replay.value.data.rows[0]!.fieldConflicts?.revenue?.reason).toMatch(/contract.revenue.*not established as consolidated/i);
    expect(JSON.stringify(b)).toBe(before);
  });
  it("identifies a contract-revenue scope disagreement without substituting it for a parent total", () => {
    const f = facts();
    f.facts["us-gaap"]!.RevenueFromContractWithCustomerIncludingAssessedTax = f.facts["us-gaap"]!.Revenues;
    delete f.facts["us-gaap"]!.Revenues;
    const result = admit({ revenue: 7000 }, f);
    expect(result.row.revenue).toBeNull();
    expect(result.row.fieldConflicts?.revenue?.reason).toMatch(/contract.revenue.*not established as consolidated/i);
  });
  it("D-262: adopts costs from a complete filed operating family, independently of vendor expense placement", () => {
    const result = admit();
    expect(result.row).toMatchObject({ costOfRevenue: 715, grossProfit: 5903, operatingExpenses: 3903, operatingIncome: 2000 });
    expect(result.row.fieldConflicts?.grossProfit).toMatchObject({ usable: true, vendorValue: 5803, secValue: 5903, secEvidence: { periodStart: "2026-02-28", periodEnd: "2026-05-29" } });
    expect(result.original.ok && result.original.value.data.rows[0]?.grossProfit).toBe(5803);
    expect(result.result.income.ok && result.result.income.value.data.raw).toEqual(result.original.ok && result.original.value.data.raw);
  });
  it("retains matching classifications with independently supported operands", () => {
    const result = admit({ costOfRevenue: 715, grossProfit: 5903, operatingExpenses: 3903 });
    expect(result.row.grossProfit).toBe(5903);
    expect(result.row.fieldConflicts?.grossProfit).toMatchObject({usable:true});
    expect(result.row.fieldProvenance?.costOfRevenue?.tags).toContain("us-gaap/CostOfRevenue");
  });
  it("checks an untagged gross-profit subtotal only from independent compatible full revenue and cost", () => {
    const f = facts(); delete f.facts["us-gaap"]!.GrossProfit;
    const result = admit({ costOfRevenue: 715 }, f);
    expect(result.row.grossProfit).toBe(5903);
    expect(result.row.fieldConflicts?.grossProfit).toMatchObject({ secValue: 5903,
      secEvidence: { calculation: "revenue-minus-cost", tags: ["us-gaap/Revenues", "us-gaap/CostOfRevenue"] } });
  });
  it.each(["financial-revenue", "partial-cost"])("does not promote incompatible operand definitions into an industrial gross-profit comparison (%s)", change => {
    const f = facts(); delete f.facts["us-gaap"]!.GrossProfit;
    if (change === "financial-revenue") {
      f.facts["us-gaap"]!.RevenuesNetOfInterestExpense = f.facts["us-gaap"]!.Revenues!;
      delete f.facts["us-gaap"]!.Revenues;
    } else {
      f.facts["us-gaap"]!.CostOfServices = f.facts["us-gaap"]!.CostOfRevenue!;
      delete f.facts["us-gaap"]!.CostOfRevenue;
    }
    const result = admit({ costOfRevenue: 715 }, f);
    expect(result.row.grossProfit).toBeNull();
    expect(result.row.fieldConflicts?.grossProfit).toMatchObject({ usable: false, secValue: null, reason: expect.stringMatching(/compatible full|definition.*not.*compatible/i) });
  });
  it.each(["date", "unknown-currency", "no-anchor", "no-facts"])("retains unknown observations without invented classification (%s)", change => {
    const f = facts();
    if (change === "no-anchor") { delete f.facts["us-gaap"]!.Assets; delete f.facts["us-gaap"]!.Revenues; } // L3: revenue is an independent income anchor.
    if (change === "no-facts") f.facts = {};
    const row = admit(change === "date" ? { date: undefined } : change === "unknown-currency" ? { reportedCurrency: null } : {}, f).row;
    expect(row.fieldConflicts?.grossProfit).toBeUndefined();
  });
  it("retains missing statements and revalidates serialized EDGAR rows", () => {
    const unavailable = { ok: false as const, gap: { field: "income", severity: "warn" as const, reason: "unavailable" } };
    expect(enrichIncomeClassification(unavailable, facts(), "quarter", at).income).toBe(unavailable);
    const edgar = input(); if (!edgar.ok) throw Error("fixture"); edgar.value.source = "edgar";
    expect(enrichIncomeClassification(edgar, facts(), "quarter", at).income).toMatchObject({ ok: true, value: { data: { rows: [{ grossProfit: 5903, fieldConflicts: { grossProfit: { usable: true } } }] } } });
    expect(edgar.value.data.rows[0]?.grossProfit).toBe(5803);
    const empty = input(); if (!empty.ok) throw Error("fixture"); empty.value.data.rows = [];
    expect(enrichIncomeClassification(empty, facts(), "quarter", at).income).toBe(empty);
  });
  it.each(["issuer", "currency", "start", "filing", "future"])("does not assert classification from incompatible %s evidence", change => {
    const f = facts();
    if (change === "future") for (const concept of Object.values(f.facts["us-gaap"] ?? {})) (concept as { units: { USD: { filed: string }[] } }).units.USD[0]!.filed = "2026-12-31";
    const row = change === "issuer" ? { cik: "1" } : change === "currency" ? { reportedCurrency: "EUR" } : change === "start" ? { periodStart: "2025-11-29" } : change === "filing" ? { filingDate: "2026-06-14" } : {};
    expect(admit(row, f).row.fieldConflicts?.grossProfit).toBeUndefined();
  });
  it("cannot promote a partial operating-expense subtotal", () => {
    const f = facts({ SellingGeneralAndAdministrativeExpense: 100 });
    delete f.facts["us-gaap"]!.OperatingExpenses;
    const result = admit({ operatingExpenses: 100 }, f);
    expect(result.row.operatingExpenses).toBeNull();
    expect(result.row.fieldConflicts?.operatingExpenses).toMatchObject({ usable: false, secValue: null, reason: expect.stringMatching(/complete.*total/i) });
  });
  it("preserves an existing explicit refusal", () => {
    const refusal = { usable: false as const, vendorValue: 1, secValue: null, reason: "Original classification refusal" };
    expect(admit({ fieldConflicts: { grossProfit: refusal } }).row.fieldConflicts?.grossProfit).toEqual(refusal);
  });
  it.each(["currency", "start", "filing"])("does not propagate a partial-cost refusal across incompatible %s scope", change => {
    const f = facts({ CostOfServices: 715 });
    delete f.facts["us-gaap"]!.CostOfRevenue;
    delete f.facts["us-gaap"]!.GrossProfit;
    const scope = change === "currency" ? { reportedCurrency: "EUR" } : change === "start" ? { periodStart: "2026-01-01" } : { filingDate: "2026-06-14" };
    const result = admit({ ...scope, grossProfitRatio: 0.8769, grossProfitMargin: 0.8769 }, f);
    expect(result.row).toMatchObject({ grossProfit: 5803, grossProfitRatio: 0.8769, grossProfitMargin: 0.8769 });
    expect(result.row.fieldConflicts?.grossProfit).toBeUndefined();
    expect(result.result.gaps.filter(gap => gap.field.endsWith(".grossProfit"))).toEqual([]);
    expect(result.result.income.ok && result.result.income.value.data.raw).toEqual(result.original.ok && result.original.value.data.raw);
  });
  it.each(["currency", "start", "filing"])("preserves an existing partial-cost GP refusal despite incompatible %s scope", change => {
    const f = facts({ CostOfServices: 715 });
    delete f.facts["us-gaap"]!.CostOfRevenue;
    delete f.facts["us-gaap"]!.GrossProfit;
    const scope = change === "currency" ? { reportedCurrency: "EUR" } : change === "start" ? { periodStart: "2026-01-01" } : { filingDate: "2026-06-14" };
    const refusal = { usable: false as const, vendorValue: 5803, secValue: null, reason: "Existing independent refusal" };
    const result = admit({ ...scope, fieldConflicts: { grossProfit: refusal } }, f);
    expect(result.row.grossProfit).toBeNull();
    expect(result.row.fieldConflicts?.grossProfit).toEqual(refusal);
  });
  it("does not launder rejected margins into serialized Stage B growth or forensic outputs", () => {
    const b = completeCurrencyBundle({});
    if (!b.statements.incomeAnnual.ok) throw Error("income expected");
    for (const row of b.statements.incomeAnnual.value.data.rows) row.fieldConflicts = {
      grossProfit: { usable: false, vendorValue: 10, secValue: 5, reason: "Unsupported classification" },
      costOfRevenue: { usable: false, vendorValue: 10, secValue: 15, reason: "Unsupported classification" },
    };
    const result = JSON.parse(JSON.stringify(runStageB(b)));
    expect(result.forensics.beneish.neutralized).toContain("GMI");
    expect(result.forensics.piotroski.signals.marginUp.value).toBeNull();
  });
});

it("DATA-103 bank total revenue cannot prove industrial gross-profit compatibility", () => {
 const f = facts();
 delete f.facts["us-gaap"]!.GrossProfit;
 delete f.facts["us-gaap"]!.CostOfRevenue;
 f.facts["us-gaap"]!.RevenuesNetOfInterestExpense=f.facts["us-gaap"]!.Revenues!;
 delete f.facts["us-gaap"]!.Revenues;
 const result=enrichIncomeClassification(input({costOfRevenue:0,grossProfit:6618}),f,"quarter",at,{bankRevenue:true});
 if (!result.income.ok) throw Error("fixture");
 const row=result.income.value.data.rows[0]!;
 expect(row.revenue).toBe(6618);
 expect(row.fieldProvenance?.revenue?.tags).toContain("us-gaap/RevenuesNetOfInterestExpense");
 expect(row.grossProfit).toBeNull();
 expect(row.fieldConflicts?.grossProfit?.reason).toContain("not independently compatible with industrial gross-profit arithmetic");
});
