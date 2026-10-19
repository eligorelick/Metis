import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildEarningsReleaseRecord, CURRENT_REPORTS_VERSION, type EarningsReleaseRecord } from "@/providers/currentReports";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import { ReportView } from "@/components/report/ReportView";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintHtml } from "@/report/export/printHtml";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";

const header = "Three months ended June 30, Six months ended June 30, 2026 2025 2026 2025";
const eps = `Financial Results for Second Quarter 2026. Quarter ended June 30, 2026. Adjusted Net Income (Loss) & Adjusted EPS ${header} (In millions, except share and per share data) GAAP diluted earnings per share $ 7.20 $ 2.40 $ 7.00 $ 1.00 Adjusted earnings per share $ 5.80 $ 4.20 $ 7.60 $ 4.60`;
const fcf = `Financial Results for Second Quarter 2026. Quarter ended June 30, 2026. Free Cash Flow is defined as net cash flow provided by operating activities less capital expenditures. Free Cash Flow ${header} (In millions) Net cash provided by operating activities $ 1,010 $ 900 $ 2,040 $ 1,830 Less: Total capital expenditures (200) (190) (410) (400) Free cash flow $ 810 $ 710 $ 1,630 $ 1,430`;
function record(releaseText = eps, commentaryText: string | null = eps.replace("$ 5.80", "$ 6.80")) {
  return buildEarningsReleaseRecord({ filing: { accessionNumber: "retention", filingDate: "2026-08-05" }, releaseUrl: "https://www.sec.gov/release", commentaryUrl: commentaryText === null ? null : "https://www.sec.gov/commentary", releaseText, commentaryText, includeNarrative: false });
}
function bundleOf(release: EarningsReleaseRecord) {
  const bundle = completeCurrencyBundle({ annualCurrency: "USD" });
  if (bundle.statements.incomeQuarterly.ok) bundle.statements.incomeQuarterly.value.data.rows.unshift({ date: "2026-06-30", reportedCurrency: "USD", revenue: 4e9 });
  bundle.edgar.currentReports = { ok: true, value: { data: { version: CURRENT_REPORTS_VERSION, releases: [release], events: [], notes: [] }, source: "edgar", asOf: "2026-08-05", endpoint: "fixture", fetchedAt: bundle.builtAt } };
  return bundle;
}
const current = <T extends { periodEnd: string; months: number }>(f: T) => f.periodEnd === "2026-06-30" && f.months === 3;

describe("source-distinct earnings observation retention", () => {
  it("retains same-period EPS from both documents and their different reported values", () => {
    const release = record();
    expect(release.reconciliation?.filter(f => current(f) && f.metric === "non-gaap-diluted-eps").map(f => [f.value, f.source?.exhibit]))
      .toEqual([[5.8, "EX-99.1"], [6.8, "EX-99.2"]]);
  });
  it("retains release and commentary FCF even when the release already supplies that period", () => {
    const release = record(fcf, fcf.replaceAll("$ 810", "$ 820").replaceAll("$ 1,010", "$ 1,020"));
    expect(release.freeCashFlow.filter(current).map(f => [f.value, f.source?.exhibit])).toEqual([[810e6, "EX-99.1"], [820e6, "EX-99.2"]]);
    const d = buildFilingDisclosures(bundleOf(release))!;
    expect(d.freeCashFlow.filter(current).map(f => [f.value, f.source.exhibit])).toEqual([[810e6, "EX-99.1"], [820e6, "EX-99.2"]]);
    expect(filingDisclosureTables(d, "fundamentals").filter(t => t.heading === "Issuer free-cash-flow reconciliation")).toHaveLength(2);
  });
  it("preserves conflicting same-source FCF values while collapsing only identical observations", () => {
    const release = record(fcf, null), first = release.freeCashFlow.find(current)!;
    release.freeCashFlow.push({ ...first, value: 820e6 }, structuredClone(first));
    const d = buildFilingDisclosures(bundleOf(release))!;
    expect(d.freeCashFlow.filter(current).map(f => f.value)).toEqual([810e6, 820e6]);
    const bridge = filingDisclosureTables(d, "fundamentals").find(t => t.heading === "Issuer free-cash-flow reconciliation")!;
    expect(bridge.rows.find(r => r[0] === "Free cash flow (issuer definition, as reported)")?.[1]).toBe("-");
  });
  it("does not attach the first document's FCF definition to differently defined retained observations", () => {
    const release = record(fcf, fcf);
    release.freeCashFlow.find(f => f.source?.exhibit === "EX-99.2")!.definition = "Different issuer-specific cash-flow definition.";
    expect(buildFilingDisclosures(bundleOf(release))!.freeCashFlowDefinition).toBeNull();
  });
  it("withholds a quarterly EPS selection when retained document values conflict", () => {
    const d = buildFilingDisclosures(bundleOf(record()))!;
    expect(d.quarterlyTrend.find(f => f.periodEnd === "2026-06-30")?.nonGaapEpsDiluted).toBeNull();
    expect(d.reconciliation?.filter(f => current(f) && f.metric === "non-gaap-diluted-eps").map(f => f.value)).toEqual([5.8, 6.8]);
  });
  it("keeps identical values in distinct documents without inventing a conflict", () => {
    const release = record(eps, eps);
    release.reconciliation!.push(structuredClone(release.reconciliation![0]!));
    const d = buildFilingDisclosures(bundleOf(release))!;
    expect(d.reconciliation?.filter(f => current(f) && f.metric === "gaap-diluted-eps")).toHaveLength(2);
    expect(d.quarterlyTrend.find(f => f.periodEnd === "2026-06-30")?.nonGaapEpsDiluted).toBe(5.8);
    expect(JSON.stringify(filingDisclosureTables(d, "fundamentals"))).not.toContain("conflicting observations");
  });
  it("collapses identical provider observations only when their entire supplying document is identical", () => {
    const release = buildEarningsReleaseRecord({ filing: { accessionNumber: "duplicate", filingDate: "2026-08-05" }, releaseUrl: "https://www.sec.gov/same", commentaryUrl: "https://www.sec.gov/same", releaseExhibit: "EX-99.1", commentaryExhibit: "EX-99.1", releaseText: eps, commentaryText: eps, includeNarrative: false });
    expect(release.reconciliation?.filter(f => current(f) && f.metric === "non-gaap-diluted-eps")).toHaveLength(1);
  });
  it("preserves conflicting same-document EPS values and units without selecting a derived or quarterly value", () => {
    const release = record(eps, null), first = release.reconciliation!.find(f => current(f) && f.metric === "non-gaap-diluted-eps")!;
    release.reconciliation!.push({ ...first, value: 6.8 }, { ...first, unit: "currency" }, structuredClone(first));
    const d = buildFilingDisclosures(bundleOf(release))!;
    expect(d.reconciliation?.filter(f => current(f) && f.metric === first.metric).map(f => [f.value, f.unit]))
      .toEqual([[5.8, "currency-per-share"], [6.8, "currency-per-share"], [5.8, "currency"]]);
    expect(d.quarterlyTrend.find(f => f.periodEnd === "2026-06-30")?.nonGaapEpsDiluted).toBeNull();
    expect(filingDisclosureTables(d, "fundamentals").flatMap(t => t.rows).find(r => r[0] === "Reported EPS difference (non-GAAP less GAAP)")?.[1]).toBe("-");
  });
  it.each(["unit", "chronology"] as const)("retains raw %s observations without admitting them to a quarterly EPS value or derived bridge", guard => {
    const release = record(eps, null);
    for (const f of release.reconciliation!) {
      if (guard === "unit") f.unit = "currency";
      else f.source = { ...f.source!, filingDate: "2026-06-01" };
    }
    const d = buildFilingDisclosures(bundleOf(release))!;
    expect(d.quarterlyTrend.find(f => f.periodEnd === "2026-06-30")?.nonGaapEpsDiluted).toBeNull();
    expect(d.reconciliation?.length).toBeGreaterThan(0);
    const derived = filingDisclosureTables(d, "fundamentals").flatMap(t => t.rows).find(r => r[0] === "Reported EPS difference (non-GAAP less GAAP)");
    expect(derived?.[1] ?? "-").toBe("-");
  });
  it("preserves both provider source/value pairs through reader, Markdown and print without changing the input", () => {
    const report = loadTask28Fixture();
    report.filingDisclosures = buildFilingDisclosures(bundleOf(record()))!;
    const before = JSON.stringify(report);
    for (const [name, output] of Object.entries({ reader: renderToStaticMarkup(createElement(ReportView, { report })), markdown: reportToMarkdown(report), print: reportToPrintHtml(report, { autoPrint: false }) })) {
      const displayed = name === "markdown" ? output.replace(/\\(.)/g, "$1") : output;
      for (const value of ["$5.80", "$6.80", "https://www.sec.gov/release", "https://www.sec.gov/commentary"]) expect(displayed.includes(value), `${name}: retains ${value}`).toBe(true);
    }
    expect(JSON.stringify(report)).toBe(before);
  });
});
