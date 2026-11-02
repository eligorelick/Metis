import { describe, expect, it } from "vitest";
import retained from "./fixtures/figr-pre2-quarterly.json";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { enrichFinancialFields } from "@/edgar/financialEnrichment";
import { runStageB } from "@/pipeline/compute";
import type { CompanyFacts } from "@/edgar/xbrl";

const at = "2026-11-02T00:00:00.000Z";
function fixture() {
  const b = completeCurrencyBundle({}); b.builtAt = at;
  b.edgar.companyFacts = { ok: true, value: { data: structuredClone(retained.companyFacts) as CompanyFacts, source: "edgar", endpoint: "retained", fetchedAt: at, asOf: "2026-06-30" } };
  b.edgar.cik = { ok: true, value: { ...b.edgar.companyFacts.value, data: { cik: retained.companyFacts.cik, cik10: String(retained.companyFacts.cik).padStart(10, "0"), ticker: b.symbol, title: "Example" } } };
  const dates = ["2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30"];
  for (const member of ["incomeQuarterly", "balanceQuarterly"] as const) {
    const res = b.statements[member];
    if (res.ok) res.value.data.rows = res.value.data.rows.slice(0, 4).map((r, i) => ({ ...r, date: dates[i], period: ["Q2", "Q1", "Q4", "Q3"][i], fiscalYear: dates[i]!.slice(0, 4) }));
  }
  if (!b.statements.cashflowQuarterly.ok) throw Error("fixture");
  b.statements.cashflowQuarterly.value.data.rows = [
    { date: "2026-06-30", operatingCashFlow: -35151000 }, { date: "2026-03-31", operatingCashFlow: -37818000 },
    { date: "2025-12-31", operatingCashFlow: 13271000 }, { date: "2025-09-30", operatingCashFlow: -1870000000 },
  ].map(r => ({ ...r, reportedCurrency: "USD", netCashProvidedByOperatingActivities: r.operatingCashFlow, freeCashFlow: r.operatingCashFlow - 1e6, capitalExpenditure: -1e6 }));
  return b;
}
describe("N4b L4 filed CFO operands", () => {
  it("refuses both vendor CFO aliases and FCF when later-filed YTD operands refute the quarter", () => {
    const b = fixture(); if (!b.edgar.companyFacts.ok) throw Error("fixture");
    const before = JSON.stringify(b);
    const out = enrichFinancialFields(b.statements.balanceQuarterly, b.statements.cashflowQuarterly, b.edgar.companyFacts.value.data, "quarter", at);
    if (!out.cashflow.ok) throw Error("fixture");
    const row = out.cashflow.value.data.rows.find(r => r.date === "2025-09-30")!;
    expect(row.operatingCashFlow).toBeNull(); expect(row.netCashProvidedByOperatingActivities).toBeNull(); expect(row.freeCashFlow).toBeNull();
    expect(row.fieldConflicts?.operatingCashFlow?.reason).toMatch(/49297000.*76089000.*-26792000/);
    expect(row.fieldConflicts?.operatingCashFlow?.reason).toMatch(/across.*filings.*withheld/i);
    expect(JSON.stringify(b)).toBe(before);
  });
  it("uses FY plus current YTD minus prior YTD from the same current 10-Q for TTM CFO", () => {
    const c = runStageB(fixture());
    expect(c.capital.current?.cashBridge.operatingCashFlow).toBe(-86490000);
    expect(c.gaps.find(g => g.field === "compute.ttmCashFlow.filedYtd")?.reason).toMatch(/62568000.*-72969000.*76089000.*-86490000/);
  });
  it("does not construct the TTM identity when the two YTD operands have different accessions", () => {
    const b = fixture(); if (!b.edgar.companyFacts.ok) throw Error("fixture");
    const f = b.edgar.companyFacts.value.data.facts["us-gaap"]!.NetCashProvidedByUsedInOperatingActivities as { units: { USD: { start?: string; end: string; accn: string }[] } };
    f.units.USD.find(p => p.end === "2025-06-30")!.accn = "different";
    expect(runStageB(b).gaps.some(g => g.field === "compute.ttmCashFlow.filedYtd")).toBe(false);
  });
});
