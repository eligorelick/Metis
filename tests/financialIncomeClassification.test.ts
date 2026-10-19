import { describe, expect, it } from "vitest";
import { enrichIncomeClassification } from "@/edgar/incomeClassification";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpIncomeStatementRow, FmpPayload } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

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
  it("does not let a reconciled EBIT prove vendor expense placement", () => {
    const result = admit();
    expect(result.row).toMatchObject({ costOfRevenue: null, grossProfit: null, operatingExpenses: null, operatingIncome: 2000 });
    expect(result.row.fieldConflicts?.grossProfit).toMatchObject({ usable: false, vendorValue: 5803, secValue: 5903, secEvidence: { periodStart: "2026-02-28", periodEnd: "2026-05-29" } });
    expect(result.original.ok && result.original.value.data.rows[0]?.grossProfit).toBe(5803);
    expect(result.result.income.ok && result.result.income.value.data.raw).toEqual(result.original.ok && result.original.value.data.raw);
  });
  it("retains matching classifications with independently supported operands", () => {
    const result = admit({ costOfRevenue: 715, grossProfit: 5903, operatingExpenses: 3903 });
    expect(result.row.grossProfit).toBe(5903);
    expect(result.row.fieldConflicts?.grossProfit).toBeUndefined();
    expect(result.row.fieldProvenance?.costOfRevenue?.tags).toContain("us-gaap/CostOfRevenue");
  });
  it("checks an untagged gross-profit subtotal only from independent compatible full revenue and cost", () => {
    const f = facts(); delete f.facts["us-gaap"]!.GrossProfit;
    const result = admit({ costOfRevenue: 715 }, f);
    expect(result.row.grossProfit).toBeNull();
    expect(result.row.fieldConflicts?.grossProfit).toMatchObject({ secValue: 5903,
      secEvidence: { calculation: "revenue-minus-cost", tags: ["us-gaap/Revenues", "us-gaap/CostOfRevenue"] } });
  });
  it.each(["date", "unknown-currency", "no-anchor", "no-facts"])("retains unknown observations without invented classification (%s)", change => {
    const f = facts();
    if (change === "no-anchor") delete f.facts["us-gaap"]!.Assets;
    if (change === "no-facts") f.facts = {};
    const row = admit(change === "date" ? { date: undefined } : change === "unknown-currency" ? { reportedCurrency: null } : {}, f).row;
    expect(row.fieldConflicts?.grossProfit).toBeUndefined();
  });
  it("does not rebuild missing statements or canonical EDGAR statements", () => {
    const unavailable = { ok: false as const, gap: { field: "income", severity: "warn" as const, reason: "unavailable" } };
    expect(enrichIncomeClassification(unavailable, facts(), "quarter", at).income).toBe(unavailable);
    const edgar = input(); if (!edgar.ok) throw Error("fixture"); edgar.value.source = "edgar";
    expect(enrichIncomeClassification(edgar, facts(), "quarter", at).income).toBe(edgar);
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
