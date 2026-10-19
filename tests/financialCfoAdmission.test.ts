import { describe, expect, it } from "vitest";
import { enrichFinancialFields } from "@/edgar/financialEnrichment";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpBalanceSheetRow, FmpCashFlowRow, FmpPayload } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const observedAt = "2026-10-18T12:00:00.000Z";
function point(val: number, extra: Record<string, unknown> = {}) {
  return { start: "2025-11-29", end: "2026-05-29", val, accn: "0000796343-26-000112", filed: "2026-06-15", form: "10-Q", fy: 2026, fp: "Q2", ...extra };
}
function facts(points: ReturnType<typeof point>[], unit = "USD"): CompanyFacts {
  return { cik: 796343, entityName: "Example issuer", facts: { "us-gaap": {
    NetCashProvidedByUsedInOperatingActivities: { units: { [unit]: points } },
  } } };
}
function sourced<T extends FmpBalanceSheetRow | FmpCashFlowRow>(rows: T[]): FetchResult<FmpPayload<T>> {
  return { ok: true, value: { data: { rows, raw: rows }, source: "fmp", asOf: "2026-05-29", endpoint: "fmp:statements", fetchedAt: observedAt } };
}
const row: FmpCashFlowRow = { cik: "0000796343", date: "2026-05-29", period: "Q2", reportedCurrency: "USD", operatingCashFlow: 2_512_000_000, netCashProvidedByOperatingActivities: 2_512_000_000, capitalExpenditure: -58_000_000, freeCashFlow: 2_454_000_000 };
const filed = () => facts([point(5_123_000_000), point(2_958_000_000, { end: "2026-02-27", filed: "2026-03-25", accn: "0000796343-26-000056", fp: "Q1" })]);
function admit(r = row, f = filed(), scope: "annual" | "quarter" = "quarter") {
  const input = sourced([r]);
  const out = enrichFinancialFields(sourced<FmpBalanceSheetRow>([]), input, f, scope, observedAt);
  if (!out.cashflow.ok) throw Error("Expected retained statement");
  return { row: out.cashflow.value.data.rows[0]!, out, input };
}

describe("filed operating cash-flow admission", () => {
  it("refuses a vendor quarter inconsistent with compatible signed YTD difference, preserving both observations", () => {
    const result = admit();
    expect(result.input.ok && result.input.value.data.rows[0]?.operatingCashFlow).toBe(2_512_000_000);
    expect(result.row.fieldConflicts?.operatingCashFlow).toMatchObject({ vendorValue: 2_512_000_000, secValue: 2_165_000_000, usable: false,
      secEvidence: { periodStart: "2026-02-28", periodEnd: "2026-05-29", unit: "USD", derivation: "ytd-difference" } });
    expect(result.out.gaps.some(g => g.severity === "warn" && /operatingCashFlow/.test(g.field))).toBe(true);
    expect(result.input.ok && result.row).not.toBe(result.input.ok && result.input.value.data.rows[0]);
    expect(result.input.ok && result.input.value.data.rows[0]).not.toHaveProperty("fieldConflicts");
    expect(result.out.cashflow.ok && result.out.cashflow.value.data.raw).toBe(result.input.ok && result.input.value.data.raw);
  });
  it("keeps the alternate CFO and standardized FCF from reintroducing the refused cash flow", () => {
    const result = admit().row;
    expect(result.fieldConflicts?.netCashProvidedByOperatingActivities).toMatchObject({ usable: false, secValue: 2_165_000_000 });
    expect(result.fieldConflicts?.freeCashFlow).toMatchObject({ usable: false, secValue: null });
    expect(result.fieldConflicts?.freeCashFlow?.vendorValue).toBe(2_454_000_000);
  });
  it("withholds processed values so consumers of statement rows cannot bypass the recorded refusal", () => {
    expect(admit().row).toMatchObject({ operatingCashFlow: null, netCashProvidedByOperatingActivities: null, freeCashFlow: null });
  });
  it("admits matching quarterly evidence without replacing a vendor value", () => {
    const result = admit({ ...row, operatingCashFlow: 2_165_000_000, netCashProvidedByOperatingActivities: 2_165_000_000, freeCashFlow: 2_107_000_000 });
    expect(result.row.fieldConflicts?.operatingCashFlow).toBeUndefined();
    expect(result.row.operatingCashFlow).toBe(2_165_000_000);
  });
  it("compares a directly disclosed signed quarter including negative cash flow", () => {
    const result = admit({ ...row, operatingCashFlow: 10 }, facts([point(-20, { start: "2026-02-28" })])).row;
    expect(result.fieldConflicts?.operatingCashFlow).toMatchObject({ usable: false, vendorValue: 10, secValue: -20 });
  });
  it("allows a negative signed YTD difference rather than treating a cash outflow as missing", () => {
    const result = admit({ ...row, operatingCashFlow: 10 }, facts([point(30), point(50, { end: "2026-02-27", filed: "2026-03-25" })])).row;
    expect(result.fieldConflicts?.operatingCashFlow?.secValue).toBe(-20);
  });
  it.each(["EUR", null])("does not compare unknown/incompatible vendor currency %s", reportedCurrency => {
    expect(admit({ ...row, reportedCurrency }).row.fieldConflicts?.operatingCashFlow).toBeUndefined();
  });
  it("does not compare a different issuer", () => {
    expect(admit({ ...row, cik: "0000000002" }).row.fieldConflicts?.operatingCashFlow).toBeUndefined();
  });
  it("does not compare a conflicting explicit vendor interval", () => {
    expect(admit({ ...row, periodStart: "2026-03-01" }).row.fieldConflicts?.operatingCashFlow).toBeUndefined();
  });
  it("does not use a later published operand to manufacture a quarterly bridge", () => {
    const f = facts([point(30), point(50, { end: "2026-02-27", filed: "2026-07-30" })]);
    expect(admit(row, f).row.fieldConflicts?.operatingCashFlow).toBeUndefined();
  });
  it("does not compare a quarterly fact as an annual amount", () => {
    expect(admit(row, facts([point(20, { start: "2026-02-28" })]), "annual").row.fieldConflicts?.operatingCashFlow).toBeUndefined();
  });
  it("does not infer that absent filed evidence means zero cash flow", () => {
    const result = admit(row, facts([])).row;
    expect(result.operatingCashFlow).toBe(row.operatingCashFlow);
    expect(result.fieldConflicts?.operatingCashFlow).toBeUndefined();
  });
  it("does not resolve ambiguous direct filed values by falling back to a YTD bridge", () => {
    const f = facts([point(5_123_000_000), point(2_958_000_000, { end: "2026-02-27", filed: "2026-03-25" }),
      point(20, { start: "2026-02-28" }), point(30, { start: "2026-02-28" })]);
    expect(admit(row, f).row.fieldConflicts?.operatingCashFlow).toBeUndefined();
  });
  it("preserves an existing explicit refusal when recording dependent cash-flow conflicts", () => {
    const refusal = { usable: false as const, vendorValue: 2_512_000_000, secValue: null, reason: "Original independent scope refusal" };
    expect(admit({ ...row, fieldConflicts: { operatingCashFlow: refusal } }).row.fieldConflicts?.operatingCashFlow).toEqual(refusal);
  });
  it("checks a full-year amount only against a full-year signed fact", () => {
    const result = admit({ ...row, period: "FY", operatingCashFlow: 20 }, facts([point(30, { start: "2025-05-31", form: "10-K" })]), "annual").row;
    expect(result.fieldConflicts?.operatingCashFlow).toMatchObject({ usable: false, secValue: 30 });
  });
  it("leaves absent CFO unknown rather than enriching it from an unrelated free-cash-flow amount", () => {
    const result = admit({ ...row, operatingCashFlow: undefined, netCashProvidedByOperatingActivities: undefined }).row;
    expect(result.operatingCashFlow).toBeUndefined();
    expect(result.fieldConflicts?.operatingCashFlow).toBeUndefined();
  });
  it("withholds conflicting current FCF ratios through Stage B without changing FCFF valuation or annual history", () => {
    const bundle = completeCurrencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    const before = runStageB(bundle);
    const cash = bundle.statements.cashflowQuarterly;
    if (!cash.ok) throw Error("Expected quarterly fixture");
    const quarterly = cash.value.data.rows[0]!;
    const f = facts([point(1, { start: "2026-01-01", end: "2026-03-31", filed: "2026-04-30" })]);
    const admitted = enrichFinancialFields(sourced<FmpBalanceSheetRow>([]), cash, f, "quarter", observedAt);
    bundle.statements.cashflowQuarterly = admitted.cashflow;
    bundle.gaps.push(...admitted.gaps);
    const after = runStageB(bundle);
    expect(before.capital.current?.cashBridge.standardizedFcf).not.toBeNull();
    expect(after.capital.current).toMatchObject({ basis: "ttm", fcfBeforeSbc: null, fcfConversionBeforeSbc: null, sbcPctOfFcf: null,
      cashBridge: { operatingCashFlow: null, standardizedFcf: null, afterSbcStandardizedFcf: null } });
    expect(after.capital.fcf).toEqual(before.capital.fcf);
    if (!("dcf" in before.valuation) || !("dcf" in after.valuation)) throw Error("Expected general-route DCF fixture");
    expect(after.valuation.dcf).toEqual(before.valuation.dcf);
    expect(quarterly.operatingCashFlow).not.toBeNull();
  });
});
