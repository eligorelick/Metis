import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { loadTask28Fixture } from "./helpers/task28Report";
import { readableHtml } from "./helpers/uiParityContract";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { Window } from "happy-dom";

describe("recorded capital structure presentation", () => {
  it("retains ownership claims, net cash, non-operating losses, share definitions and separate dates", () => {
    const report = loadTask28Fixture();
    report.valuation.dcf.bridge = {
      presentValueExplicit: 400_000_000, presentValueTerminal: 600_000_000, enterpriseValue: 1_000_000_000,
      netDebt: -100_000_000, minorityInterest: 80_000_000, noncontrollingBasis: "quoted ownership claim", noncontrollingBook: 25_000_000,
      preferredEquity: null, nonOperatingComponents: [{ label: "retained investment loss", value: -20_000_000 }],
      equityValue: 1_000_000_000, dilutedShares: 20_000_000, sharesOutstandingAtQuote: 18_000_000,
      currency: "EUR", asOf: "2025-12-31", valuationDate: "2026-01-15", rollForwardFactor: 1.0034,
    };
    report.valuation.dcf.perShare = { value: 50, unit: "EUR/share", currency: "EUR", period: "FY2026", sourceId: "bridge:original:per-share", source: "computed.fixture.perShare", asOf: "2026-01-15", verified: null };
    const before = JSON.stringify(report);
    const html = renderToStaticMarkup(createElement(ReportView, { report, layout: "dossier" }));
    expect(html).toContain('aria-label="Recorded capital structure bridge"');
    const { text } = readableHtml(html);
    for (const label of ["Explicit cash-flow present value", "Terminal present value", "Less net debt (negative means net cash)", "Less minority interest (quoted ownership claim)", "Minority interest at book value (not deducted)", "Less retained investment loss", "Diluted share denominator", "Shares outstanding at the quote (market cap ÷ price; not the divisor)", "Balance sheet in the bridge", "2026-01-15", "2025-12-31", "not disclosed; model uses 0"]) expect(text).toContain(label);
    const window = new Window();
    window.document.body.innerHTML = html;
    const endpoint = window.document.querySelector('[role="group"][aria-label="Recorded bridge per-share endpoint"]');
    expect(endpoint).not.toBeNull();
    for (const value of ["50.00 EUR/share", "bridge:original:per-share", "2026-01-15", "FY2026"]) expect(endpoint!.textContent).toContain(value);
    void window.happyDOM.close();
    expect(JSON.stringify(report)).toBe(before);
  });

  it("does not invent an operating-assets bridge for a snapshot that did not record one", () => {
    const report = loadTask28Fixture();
    delete report.valuation.dcf.bridge;
    const html = renderToStaticMarkup(createElement(ReportView, { report, layout: "dossier" }));
    expect(html).toContain('aria-label="Recorded capital structure bridge"');
    expect(html).toContain("An operating-assets to common-equity bridge was not recorded in this snapshot");
    expect(html).not.toContain("data-capital-stage=");
  });

  it("labels the recorded bank excess-return method without presenting an invented FCFF bridge or WACC grid", () => {
    const report = loadTask28Fixture();
    report.fairValue = { status: "available", method: "excess-return", methodVersion: "recorded-bank-method", perShare: report.valuation.dcf.perShare, upsidePct: 20, basis: ["Recorded book-value excess-return model"], reasons: [] };
    report.valuation.dcf.sensitivityGrid = [];
    delete report.valuation.dcf.bridge;
    const html = renderToStaticMarkup(createElement(ReportView, { report, layout: "dossier" }));
    expect(html.includes("Excess-return · model value / share")).toBe(true);
    expect(html.includes("DCF · intrinsic value / share")).toBe(false);
    expect(html.includes('aria-label="Recorded sensitivity cases"')).toBe(false);
    expect(html.includes("data-capital-stage=")).toBe(false);
    expect(readableHtml(html).text).toContain("Recorded book-value excess-return model");
    for (const surface of [readableHtml(html).text, reportToMarkdown(report), readableHtml(reportToPrintBody(report)).text]) {
      expect(surface.includes("Model fair value (excess return)")).toBe(true);
      expect(surface.includes("Model fair value (DCF)")).toBe(false);
    }
  });

  it("surfaces recorded thesis-review thresholds and their conditional context in the cover", () => {
    const report = loadTask28Fixture();
    report.thesisTriggers = [{ id: "stored-trigger-1", metric: "Year-one revenue growth", comparator: "below", horizon: "Next reported fiscal year", threshold: { value: 7.125, unit: "%", currency: null, period: "FY2026", sourceId: "trigger:stored:1", source: "computed.thesis.original", asOf: "2025-12-31", verified: null }, fixedAssumptions: ["Recorded margins and discount rate held fixed"], consequence: "Review the recorded operating thesis if this condition occurs." }];
    const html = renderToStaticMarkup(createElement(ReportView, { report, layout: "dossier" }));
    expect(html.includes('aria-label="Thesis review checkpoints"')).toBe(true);
    const coverEnd = html.indexOf('class="dossier-key-data"');
    const cover = html.slice(0, coverEnd);
    for (const value of ["Year-one revenue growth", "Next reported fiscal year", "7.13%", "Recorded margins and discount rate held fixed", "Review the recorded operating thesis", "trigger:stored:1", "FY2026"]) expect(cover.includes(value)).toBe(true);
    expect(cover).toContain("not automatic investment decisions");
  });

  it("retains all ten recorded cash-flow windows and the stored sensitivity conventions", () => {
    const report = loadTask28Fixture();
    report.valuation.dcf.sensitivityNotes = ["Ten recorded rolling windows; original mid-year convention"];
    report.valuation.dcf.forecastRows = Array.from({ length: 10 }, (_, i) => ({ year: i + 1, period: `FY${2026 + i}`, revenue: 1000 + i, growthPct: 2.25, ebitMarginPct: 20, taxRatePct: 21, nopat: 158, reinvestment: 15, fcff: i === 9 ? -143.12345 : 143, presentValue: 99 - i }));
    const text = readableHtml(renderToStaticMarkup(createElement(ReportView, { report, layout: "dossier" }))).text;
    expect(text).toContain("DCF annual cash-flow path");
    for (const year of [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035]) expect(text).toContain(`FY${year}`);
    expect(text).toContain("Ten recorded rolling windows; original mid-year convention");
    expect(text).toContain("−143.12");
  });

  it("preserves suppressed REIT valuation and its applicable metric without creating a per-share model", () => {
    const report = loadTask28Fixture();
    report.valuation.dcf.perShare = null;
    report.valuation.dcf.sensitivityGrid = [];
    delete report.valuation.dcf.bridge;
    report.fairValue = { status: "suppressed", method: null, methodVersion: "stored-reit", perShare: null, upsidePct: null, basis: ["REIT route; no applicable per-share valuation model"], reasons: [{ field: "valuation.fairValue", severity: "info", reason: "REIT route; no applicable per-share valuation model" }] };
    report.routeMetrics = { route: "reit", asOf: "2025-12-31", notes: ["Stored route metric convention"], metrics: [{ key: "ffo", label: "Funds from operations", value: 100, unit: "currency", currency: "EUR", basis: "Recorded FFO basis", sources: ["filing:reit:original"], asOf: "2025-12-31", withheldReason: null, proxy: false }] };
    const html = renderToStaticMarkup(createElement(ReportView, { report, layout: "dossier" }));
    const text = readableHtml(html).text;
    for (const value of ["REIT route; no applicable per-share valuation model", "Funds from operations", "Stored route metric convention", "Recorded FFO basis"]) expect(text).toContain(value);
    expect(html.includes("data-capital-stage=")).toBe(false);
    expect(html.includes('aria-label="Recorded sensitivity cases"')).toBe(false);
  });
});
