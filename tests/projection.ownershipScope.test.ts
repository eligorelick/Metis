import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { buildMarketData } from "@/pipeline/marketData";
import { ReportView } from "@/components/report/ReportView";
import { keyDataRows } from "@/report/presentation";
import { reportToAuditMarkdown, reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";

function fixture() {
  const bundle = completeCurrencyBundle({});
  for (const result of [bundle.statements.incomeAnnual, bundle.statements.incomeQuarterly]) {
    if (!result.ok) throw new Error("Missing fixture income");
    for (const row of result.value.data.rows) row.interestExpense = 10e6;
  }
  return bundle;
}
describe("derived forecast EPS uses the admitted common-holder scope", () => {
  it.each(["class", "positive-nci", "negative-nci", "nci-income", "unknown-allocation", "preferred"])("withholds only modeled EPS and forward P/E for %s", limitation => {
    const bundle = fixture();
    if (limitation === "class") bundle.edgar.tenQNotes = { ok: true, value: { source: "edgar", endpoint: "fixture:class", asOf: "2026-03-31", fetchedAt: bundle.builtAt,
      data: { sectionName: "tenQNotes", text: "Capital stock", statementsText: "Common stock, issued and outstanding: 114,473 shares. Class B common stock, issued and outstanding: 5,523 shares.", method: "header-regex", chars: 13, accession: "filing", form: "10-Q", filingDate: "2026-05-06", reportDate: "2026-03-31", documentUrl: "https://www.sec.gov/filing" } } };
    for (const result of [bundle.statements.balanceQuarterly, bundle.statements.balanceAnnual]) {
      if (!result.ok) throw new Error("Missing fixture balance");
      for (const row of result.value.data.rows) {
        if (limitation === "positive-nci") row.minorityInterest = 30e6;
        if (limitation === "negative-nci") row.minorityInterest = -30e6;
        if (limitation === "preferred") row.preferredStock = 10e6;
        if (limitation === "unknown-allocation") { row.totalEquity = (row.totalStockholdersEquity ?? 0) + 30e6; delete row.minorityInterest; }
      }
    }
    if (limitation === "nci-income" && bundle.statements.incomeQuarterly.ok) bundle.statements.incomeQuarterly.value.data.rows[0]!.netIncomeAttributableToNoncontrollingInterest = -3e6;
    const computed = runStageB(bundle);
    const eps = computed.projections.series.find(s => s.metric === "epsDiluted");
    if (eps) { expect(eps.base).toEqual([]); expect(eps.historical.length).toBeGreaterThan(0); }
    expect(computed.projections.series.flatMap(s => s.metric === "epsDiluted" ? s.base : [])).toEqual([]);
    const report = loadTask28Fixture();
    report.projections = computed.projections;
    report.marketData = buildMarketData(bundle);
    if (!report.marketData) throw new Error("Expected fixture market data");
    // No source consensus: the page-one multiple would have to come from model EPS.
    report.marketData.estimates = [];
    for (const text of [reportToMarkdown(report), reportToPrintBody(report), reportToAuditMarkdown(report), renderToStaticMarkup(createElement(ReportView, { report }))]) expect(text).not.toContain("Forward P/E (model base-case operating EPS)");
    expect(keyDataRows(report).some(row => /Forward P\/E \(model/.test(row.label))).toBe(false);
    // An independently admitted analyst EPS quote remains an independent display input.
    report.marketData.estimates = [{ fiscalYearEnd: "2027-12-31", revenueAvg: null, revenueLow: null, revenueHigh: null,
      epsAvg: 12, epsLow: 11, epsHigh: 13, analystsRevenue: null, analystsEps: 8 }];
    expect(keyDataRows(report).some(row => row.label === "Price / provider EPS (basis unverified)")).toBe(true);
  });
  it("leaves an ordinary no-NCI operating EPS forecast intact", () => {
    const bundle = fixture();
    for (const balance of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) if (balance.ok) for (const row of balance.value.data.rows) row.preferredStock = 0;
    const result = runStageB(bundle);
    expect(result.projections.series.find(s => s.metric === "epsDiluted")?.base.length).toBeGreaterThan(0);
  });
});
