import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { ReportView } from "@/components/report/ReportView";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { reportToPrintBody, reportToPrintHtml } from "@/report/export/printHtml";
import { parseStoredReportWithSafety } from "@/report/legacyEntitySafety";
import type { Report } from "@/report/schema";
import { ReportSchema } from "@/report/schema";
import { legacyScopeQualifications, withLegacyScopeQualifications } from "@/report/legacyScopeQualifications";
import { withLegacyBridgeMethod } from "@/report/legacyBridgeMethod";
import { buildMarketData } from "@/pipeline/marketData";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { runStageB } from "@/pipeline/compute";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { loadTask28Fixture } from "./helpers/task28Report";

// Synthetic saved-report reconstruction; not the unavailable original QCOM #53.
function saved(version = "1.52.0") {
  const report = loadTask28Fixture();
  report.meta.specVersion = version;
  report.quality.flags = [
    { severity: "high", source: "computed.forensics.flags.receivables-vs-revenue", text: "Receivables grew 62.0% while revenue grew 3.1% — possible channel stuffing or loosened credit terms. (rule: house rule: receivables growth − revenue growth > 10pp (warn) / > 20pp (flag), with receivables growth > 10%)" },
    { severity: "medium", source: "computed.forensics.flags.recurring-discontinued-ops", text: "Discontinued operations affected results in 2 of the last 5 fiscal years — recurring portfolio churn complicates run-rate earnings. (rule: house rule: netIncomeFromDiscontinuedOperations nonzero in >= 2 of the last 5 fiscal years)" },
  ];
  return report;
}
const readers: Record<string, (r: Report) => string> = {
  classic: r => renderToStaticMarkup(createElement(ReportView, { report: r, layout: "classic" })),
  dossier: r => renderToStaticMarkup(createElement(ReportView, { report: r, layout: "dossier" })),
  markdown: reportToMarkdown, audit: reportToAuditMarkdown, print: reportToPrintBody, html: reportToPrintHtml,
};
const caveats = ["Read-time saved-report clarifications", "receivables scope comparability is unverified", "complete period-specific lease coverage", "observation count does not establish", "market-cap observation date", "Stored figures, grades and recorded evidence are unchanged"];
function freeze(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
}

describe("immutable saved-report scope qualifications", () => {
  it.each(Object.keys(readers))("shows scope caveats in direct and parser-forwarded %s", name => {
    const report = saved(), bytes = JSON.stringify(report);
    const parsed = parseStoredReportWithSafety(bytes);
    expect(parsed).not.toBeNull();
    for (const input of [report, parsed!.report]) {
      const text = readers[name]!(input);
      for (const caveat of caveats) expect(text).toContain(caveat);
      expect(readers[name]!(input)).toBe(text);
      if (name !== "audit") {
        expect(text).not.toContain("possible channel stuffing");
        expect(text).not.toContain("recurring portfolio churn");
        expect(text).toContain("62.0%");
        expect(text).toContain("2 of the last 5");
      }
    }
    expect(JSON.stringify(report)).toBe(bytes);
    expect(parseStoredReportWithSafety(JSON.stringify(parsed!.report))!.readMode).toBe(parsed!.readMode);
  });
  it.each(["1.53.0", "1.53.1", "1.54.0", "9.0.0"])("does not apply the historical convention to %s", version => {
    const r = saved(version);
    r.quality.flags = [];
    for (const read of Object.values(readers)) expect(read(r)).not.toContain(caveats[0]);
  });
  it("keeps arbitrary analyst prose and escapes it without treating its source ID as a template", () => {
    const r = saved();
    r.quality.flags[0]!.text = "Analyst <script>alert(1)</script> says possible channel stuffing.";
    for (const name of ["classic", "dossier", "print", "html"]) {
      const text = readers[name]!(r);
      expect(text).toContain("&lt;script&gt;");
      expect(text).not.toContain("<script>alert(1)</script>");
      expect(text).toContain("says possible channel stuffing.");
      expect(text).toContain("receivables scope comparability is unverified");
    }
  });
  it("distinguishes recorded model labels from saved execution evidence in audit", () => {
    const r = saved();
    r.meta.model = "none";
    delete r.meta.execution;
    const text = reportToAuditMarkdown(r);
    expect(text).toContain("Recorded model label");
    expect(text).toContain("Saved model evidence");
    expect(text).toContain("Saved model request and execution unknown");
  });
  it("escapes raw labels in audit's new saved-evidence summary and keeps Markdown analyst text inert", () => {
    const r = saved();
    r.meta.model = "<script>alert(1)</script> | injected";
    delete r.meta.execution;
    r.quality.flags[0]!.text = "Analyst <script>alert(1)</script> retains context.";
    for (const text of [reportToAuditMarkdown(r), reportToMarkdown(r)]) {
      expect(text).not.toContain("<script>");
      expect(text).toContain("\\<script\\>");
      expect(text).toContain("receivables scope comparability is unverified");
    }
    expect(r.meta.model).toBe("<script>alert(1)</script> | injected");
  });
  it("qualifies missing versions conservatively without widening stored parser admission", () => {
    const r = saved();
    delete (r.meta as Partial<Report["meta"]>).specVersion;
    expect(parseStoredReportWithSafety(JSON.stringify(r))).toBeNull();
  });
  it.each(["1.49.0", "1.50.0", "1.51.0", "1.52.0", "", "unknown"])("preserves raw count, severity, rule and source through the parser at %s", version => {
    const r = saved(version), bytes = JSON.stringify(r);
    const p = parseStoredReportWithSafety(bytes)!;
    expect(p).not.toBeNull();
    expect(p.report.quality.flags[0]).toMatchObject({ source: r.quality.flags[0]!.source, severity: "high", text: expect.stringContaining("62.0% while revenue grew 3.1%") });
    expect(p.report.quality.flags[1]).toMatchObject({ source: r.quality.flags[1]!.source, severity: "medium", text: expect.stringContaining("2 of the last 5 fiscal-year observations") });
    expect(p.report.quality.flags[1]!.text).toContain("(rule: house rule: netIncomeFromDiscontinuedOperations nonzero in >= 2 of the last 5 fiscal years)");
    expect(JSON.stringify(r)).toBe(bytes);
    expect(parseStoredReportWithSafety(JSON.stringify(p.report))!.report).toEqual(p.report);
    const text = reportToAuditMarkdown(p.report);
    expect(text).toContain(version === "" || version === "unknown" ? "Historical scope evidence is not recorded" : "Built before report spec 1.53.0");
  });
  it("changes only exact owned flag text, shares untouched structure, and is idempotent on deep-frozen reports", () => {
    const r = saved();
    r.quality.flags.push({ severity: "low", source: "analyst", text: r.quality.flags[0]!.text });
    r.quality.flags.push({ severity: "medium", source: "computed.forensics.flags.dsri-elevated", text: "DSRI 1.62 — retained adverse evidence." });
    const bytes = JSON.stringify(r);
    freeze(r);
    const view = withLegacyScopeQualifications(r);
    expect(view).not.toBe(r);
    expect(view.quality.flags[2]).toBe(r.quality.flags[2]);
    expect(view.quality.flags[3]).toBe(r.quality.flags[3]);
    // This exact whole-object comparison covers all numbers/nulls/booleans,
    // scores, dates, severity, verification, trust, costs, state and raw sources.
    expect({ ...view, quality: { ...view.quality, flags: r.quality.flags } }).toEqual(r);
    for (const key of Object.keys(r) as (keyof Report)[]) if (key !== "quality") expect(view[key]).toBe(r[key]);
    expect(view.quality.forensicScores).toBe(r.quality.forensicScores);
    expect(view.quality.graded).toBe(r.quality.graded);
    expect(withLegacyScopeQualifications(view)).toBe(view);
    expect(legacyScopeQualifications(view)).toEqual(legacyScopeQualifications(r));
    expect(JSON.stringify(r)).toBe(bytes);
    const baseline = saved();
    baseline.quality.flags = baseline.quality.flags.map(f => ({ ...f, text: "Unchanged analyst wording." }));
    const parsedBaseline = parseStoredReportWithSafety(JSON.stringify(baseline))!;
    const parsed = parseStoredReportWithSafety(JSON.stringify(saved()))!;
    expect(parsed.readMode).toBe(parsedBaseline.readMode);
    expect({ ...parsed.report, quality: { ...parsed.report.quality, flags: parsedBaseline.report.quality.flags } }).toEqual(parsedBaseline.report);
  });
  it.each([undefined, null, 153, "not a version", "1.53.0-preview"])("does not crash or invent a build date for unrecorded version %j", value => {
    const r = saved();
    Object.assign(r.meta, { specVersion: value });
    expect(legacyScopeQualifications(r)[0]).toContain("Historical scope evidence is not recorded");
    expect(legacyScopeQualifications(r)[0]).not.toContain("Built before");
    expect(withLegacyScopeQualifications(r).quality.flags[0]!.text).not.toContain("possible channel stuffing");
    expect(r.meta.specVersion).toBe(value);
  });
  it.each(["1.53.0", "1.53.1", "2.0.0"])("returns the identical report and no sidecar at %s", version => {
    const r = saved(version);
    r.quality.flags = [];
    expect(withLegacyScopeQualifications(r)).toBe(r);
    expect(legacyScopeQualifications(r)).toEqual([]);
  });
  it.each(["prefix ", "", "suffix"])("refuses near-template prose and wrong owners (%j)", decoration => {
    const r = saved();
    r.quality.flags = r.quality.flags.map(f => ({ ...f, text: decoration === "suffix" ? f.text + " Analyst context." : decoration + f.text,
      source: decoration === "" ? "analyst" : f.source }));
    expect(withLegacyScopeQualifications(r)).toBe(r);
  });
  it("keeps the old bridge EXCLUDES evidence and its existing note intact before qualification", () => {
    const r = saved("1.49.0");
    r.fairValue = { status: "available", method: "fcff-dcf", methodVersion: "stored", perShare: r.valuation.dcf.perShare, upsidePct: 12, basis: [], reasons: [] };
    r.valuation.multiplesBasis = "Enterprise value EXCLUDES the OPERATING-lease liability, less an OPERATING lease liability of 5,494,000,000";
    r.valuation.dcf.assumptions.push({ name: "sales-to-capital", value: "2.58", basis: "Saved total debt basis" });
    const oldView = withLegacyBridgeMethod(r);
    const next = withLegacyScopeQualifications(oldView);
    expect(oldView.fairValue!.basis.join(" ")).toContain("sales-to-capital kept the 5,494M operating lease the EV left out");
    expect(next.fairValue).toBe(oldView.fairValue);
    expect(next.valuation).toBe(oldView.valuation);
    const parsed = parseStoredReportWithSafety(JSON.stringify(r))!;
    expect(parsed, JSON.stringify(ReportSchema.safeParse(r))).not.toBeNull();
    expect(parsed.report.fairValue!.basis).toEqual(oldView.fairValue!.basis);
    for (const [name, read] of Object.entries(readers)) {
      const text = read(parsed.report);
      expect(text.match(/These are display qualifications/g)).toHaveLength(1);
      // Audit has never rendered fairValue.basis; retain that separate raw surface contract.
      if (name !== "audit") expect(text).toContain("sales-to-capital kept the 5,494M operating lease the EV left out");
    }
  });
  it.each(["1.52.0", "1.53.0", "2.0.0"])("keeps collector/timing unknowns independent of version %s in all readers", version => {
    const r = saved(version);
    r.marketData = buildMarketData(completeCurrencyBundle({}));
    if (!r.marketData) throw new Error("controlled fixture must build market data");
    r.marketData.estimates = [{ fiscalYearEnd: "2027-09-28", revenueAvg: 1000, revenueLow: null, revenueHigh: null, epsAvg: 2, epsLow: null, epsHigh: null, analystsRevenue: 3, analystsEps: 3 }];
    r.marketData.estimatesAsOf = "2026-09-28";
    delete r.marketData.estimateTiming;
    delete r.filingDisclosures;
    r.appendix.sources = [];
    const bytes = JSON.stringify(r);
    const parsed = parseStoredReportWithSafety(bytes)!;
    expect(parsed).not.toBeNull();
    for (const input of [r, parsed.report]) for (const read of Object.values(readers)) {
      const text = read(input);
      expect(text).toContain("did not record its material-event item filter");
      expect(text).toContain("unclassified recorded date 2026-09-28");
      expect(text).toContain("original acquisition not established");
      expect(text).toContain("publication/update vintage not established");
    }
    expect(JSON.stringify(r)).toBe(bytes);
  });
  it.each([0, null, 102e6, 730e6])("preserves lease amounts %j without treating citations as scope proof", amount => {
    const r = saved();
    if (amount !== null) r.balanceSheet.debtProfile.numbers.push({ value: amount, unit: "currency", source: "computed.capital.current.debtBridge.operatingLeases", sourceId: "computed.capital.current.debtBridge.operatingLeases", asOf: "2024-09-29", verified: true });
    r.valuation.dcf.assumptions.push({ name: "Net debt", value: "6.97B", basis: "Net debt as reported 6.97B; less the OPERATING lease liability 6.97B. Partial noncurrent coverage." });
    const view = withLegacyScopeQualifications(r);
    expect(view.balanceSheet).toBe(r.balanceSheet);
    expect(view.valuation).toBe(r.valuation);
    expect(legacyScopeQualifications(view).join(" ")).toContain("saved partial-scope limitations still apply");
  });
  it("preserves lenient parser mode and its dates across all readers", () => {
    const r = saved();
    r.fundamentals.commentary[0]!.asOf = "2026-06";
    const bytes = JSON.stringify(r);
    const p = parseStoredReportWithSafety(bytes)!;
    expect(p.readMode).toBe("legacy");
    expect(p.report.fundamentals.commentary[0]!.asOf).toBe("2026-06");
    for (const read of Object.values(readers)) expect(read(p.report)).toContain("Stored figures, grades and recorded evidence are unchanged");
    expect(parseStoredReportWithSafety(JSON.stringify(p.report))!.readMode).toBe("legacy");
    expect(JSON.stringify(r)).toBe(bytes);
  });
  it.each(["original", "z-double-prime", "unknown"])("preserves Altman variant %s, score, dates and genuine refusals with a separate limitation", variant => {
    const r = saved();
    r.quality.forensicScores.altman = { variant, score: null, zone: null, notApplicableReason: "Market cap unavailable" };
    const quality = r.scores!.aspects.quality;
    quality.drivers.push({ value: 2, unit: "score", source: "computed.scores.quality.altmanZOriginalScale", asOf: "2024-09-29", period: "Balance 2024-09-29; income 2024-09-29; market cap unavailable", verified: true });
    const view = withLegacyScopeQualifications(r);
    expect(view.scores).toBe(r.scores);
    expect(view.quality.forensicScores).toBe(r.quality.forensicScores);
    expect(legacyScopeQualifications(view).join(" ")).toContain("Missing date evidence does not prove a missing market-cap value");
  });
  it("qualifies exact older computed flag inputs through the real current data-only builder without migrating its report", () => {
    const bundle = completeCurrencyBundle({});
    const computed = runStageB(bundle);
    // Controlled older computed inputs, not a restamped historical Report or recovered QCOM input.
    computed.forensics.flags = [
      { id: "receivables-vs-revenue", severity: "flag", message: "Receivables grew 62.0% while revenue grew 3.1% — possible channel stuffing or loosened credit terms.", metrics: { receivablesGrowthPct: 62, revenueGrowthPct: 3.1 }, rule: "house rule: receivables growth − revenue growth > 10pp (warn) / > 20pp (flag), with receivables growth > 10%", heuristic: true, asOf: [] },
      { id: "recurring-discontinued-ops", severity: "warn", message: "Discontinued operations affected results in 2 of the last 5 fiscal years — recurring portfolio churn complicates run-rate earnings.", metrics: { discontinuedOpsYears: 2, lookbackYears: 5 }, rule: "house rule: netIncomeFromDiscontinuedOperations nonzero in >= 2 of the last 5 fiscal years", heuristic: true, asOf: [] },
    ];
    const r = buildDataOnlyReport({ symbol: bundle.symbol, companyName: "Synthetic saved-input issuer", generatedAt: bundle.builtAt, model: "none", costUsd: 0, bundle, computed, validation: { checks: [], flags: [], gaps: [] }, costBreakdown: [], reason: "offline legacy-input control" });
    expect(r.meta.specVersion).toBe("1.53.0");
    expect(r.quality.flags[0]!.text).toContain("possible channel stuffing");
    const bytes = JSON.stringify(r);
    for (const input of [r, parseStoredReportWithSafety(bytes)!.report]) for (const read of Object.values(readers)) {
      const text = read(input);
      expect(text).toContain("saved receivables flag alone does not establish like-for-like scope");
      expect(text).toContain("saved discontinued-results flag alone does not establish transaction number or recurrence");
      expect(text).not.toContain("Built before report spec");
    }
    expect(withLegacyScopeQualifications(r)).toBe(r);
    expect(JSON.stringify(r)).toBe(bytes);
  });
  it.each(["1.53.0", "2.0.0"])("only exact owned older flags receive non-migration caveats at %s", version => {
    const r = saved(version);
    const notes = legacyScopeQualifications(r).join(" ");
    expect(notes).toContain("saved receivables flag alone");
    expect(notes).toContain("saved discontinued-results flag alone");
    expect(notes).not.toContain("Built before");
    expect(notes).not.toContain("lease coverage");
    expect(withLegacyScopeQualifications(r)).toBe(r);
    r.quality.flags = r.quality.flags.map(f => ({ ...f, source: "analyst" }));
    expect(legacyScopeQualifications(r)).toEqual([]);
    r.quality.flags = saved(version).quality.flags.map(f => ({ ...f, text: f.text + " Analyst addition." }));
    expect(legacyScopeQualifications(r)).toEqual([]);
    expect(legacyScopeQualifications({ meta: r.meta })).toEqual([]);
  });
});
