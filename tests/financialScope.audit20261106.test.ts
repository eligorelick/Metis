import { describe, expect, it } from "vitest";
import { enrichIncomeClassification } from "@/edgar/incomeClassification";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpIncomeStatementRow, FmpPayload } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";

const at = "2026-11-06T21:00:34.324Z";
function fixture(nci = 9) {
  const values = { Revenues: 4938, OperatingIncomeLoss: 1326,
    IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: 1303,
    IncomeTaxExpenseBenefit: 264, ProfitLoss: 1039, NetIncomeLoss: 1039 - nci,
    NetIncomeLossAttributableToNoncontrollingInterest: nci };
  const facts: CompanyFacts = { cik: 123, entityName: "SYNTHETIC", facts: { "us-gaap": Object.fromEntries(Object.entries(values).map(([tag, value]) => [tag, {
    units: { USD: [{ start: "2026-07-01", end: "2026-09-30", val: value * M, filed: "2026-11-05", accn: "0000000123-26-000062", form: "10-Q", fy: 2026, fp: "Q3" }] },
  }])) } };
  const rows: FmpIncomeStatementRow[] = [{ cik: "123", date: "2026-09-30", periodStart: "2026-07-01", filingDate: "2026-11-05", reportedCurrency: "USD",
    revenue: 4938 * M, incomeBeforeTax: 1303 * M, incomeTaxExpense: 264 * M, netIncome: (1039 - nci) * M }];
  const income: FetchResult<FmpPayload<FmpIncomeStatementRow>> = { ok: true, value: { data: { rows, raw: structuredClone(rows) }, asOf: "2026-09-30", source: "fmp", endpoint: "fixture", fetchedAt: at } };
  return { facts, income };
}

describe("filed ownership scope without a vendor earnings dispute", () => {
  it.each([9, -6])("admits signed NCI %s and consolidated earnings while preserving the parent observation", nci => {
    const { facts, income } = fixture(nci);
    const before = JSON.stringify(income);
    const result = enrichIncomeClassification(income, facts, "quarter", at).income;
    expect(result.ok && result.value.data.rows[0]).toMatchObject({ netIncome: (1039 - nci) * M,
      netIncomeOwnershipBasis: "parent", netIncomeConsolidated: 1039 * M, netIncomeAttributableToNoncontrollingInterest: nci * M,
      fieldProvenance: { netIncomeConsolidated: { periodStart: "2026-07-01", periodEnd: "2026-09-30", unit: "USD" } } });
    expect(JSON.stringify(income)).toBe(before);
  });
  it.each(["currency", "period", "filing", "future", "refusal"])("does not admit a scope operand with %s mismatch", kind => {
    const { facts, income } = fixture();
    const concept = facts.facts["us-gaap"]!.NetIncomeLossAttributableToNoncontrollingInterest as { units: Record<string, Record<string, unknown>[]> };
    if (kind === "currency") { concept.units.EUR = concept.units.USD!; delete concept.units.USD; }
    if (kind === "period") concept.units.USD![0]!.start = "2026-01-01";
    if (kind === "filing") concept.units.USD![0]!.accn = "different-filing";
    if (kind === "future") concept.units.USD![0]!.filed = "2026-11-07";
    if (kind === "refusal" && income.ok) income.value.data.rows[0]!.fieldConflicts = { netIncomeAttributableToNoncontrollingInterest: { usable: false, vendorValue: null, secValue: null, reason: "Independent ownership refusal" } };
    const result = enrichIncomeClassification(income, facts, "quarter", at).income;
    expect(result.ok && result.value.data.rows[0]!.netIncomeAttributableToNoncontrollingInterest == null).toBe(true);
  });
});

describe("consolidated cash conversion", () => {
  function bundle(missing: boolean) {
    const b = completeCurrencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    if (!b.statements.incomeQuarterly.ok || !b.statements.balanceQuarterly.ok) throw Error("fixture");
    for (const row of b.statements.incomeQuarterly.value.data.rows.slice(0, 4)) row.netIncomeConsolidated = 50 * M;
    for (const row of b.statements.balanceQuarterly.value.data.rows) row.minorityInterest = 20 * M;
    if (missing) delete b.statements.incomeQuarterly.value.data.rows[1]!.netIncomeConsolidated;
    return b;
  }
  it("uses complete consolidated earnings rather than the generic mixed/parent sum", () => {
    const current = runStageB(bundle(false)).capital.current!;
    expect(current.netIncome).toBe(200 * M);
    expect(current.fcfConversionBeforeSbc).toBeCloseTo(current.cashBridge.standardizedFcf! / (200 * M));
  });
  it("withholds consolidated conversion when known NCI has no complete consolidated earnings window", () => {
    const c = runStageB(bundle(true));
    expect(c.capital.current!.cashBridge.standardizedFcf).not.toBeNull();
    expect(c.capital.current!.fcfConversionBeforeSbc).toBeNull();
    expect(c.capital.current!.netIncome).toBeNull();
  });
  it.each(["parent", "unknown"])("does not treat zero closing NCI balances as proof of consolidated %s earnings", basis => {
    const b = bundle(true);
    if (!b.statements.balanceQuarterly.ok || !b.statements.incomeQuarterly.ok) throw Error("fixture");
    for (const row of b.statements.balanceQuarterly.value.data.rows) row.minorityInterest = 0;
    for (const row of b.statements.incomeQuarterly.value.data.rows) {
      delete row.netIncomeConsolidated;
      if (basis === "parent") { row.netIncomeOwnershipBasis = "parent"; row.netIncomeAttributableToNoncontrollingInterest = 5 * M; }
    }
    expect(runStageB(b).capital.current!.fcfConversionBeforeSbc).toBeNull();
  });
});
