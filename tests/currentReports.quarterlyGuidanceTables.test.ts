import { describe, expect, it } from "vitest";
import { parseDocument } from "@/edgar/extract";
import { parseGuidance } from "@/edgar/currentReports";
import { buildEarningsReleaseRecord, collectCurrentReports, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
import type { EdgarClient, EdgarFiling } from "@/providers/edgar";
import { buildFilingDisclosures, nextPeriodRevenueGuidance } from "@/pipeline/filingDisclosures";
import { dcfGuidance, runStageB } from "@/pipeline/compute";
import { buildDcfAssumptions, type DcfAssumptionInputs } from "@/pipeline/stageB/valuation";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

// Synthetic markup/IDs modeling source-derived table structure and filed ranges.
// This is NOT an exact retained raw QCOM release. No network source is fetched.
const sourceUrl = "https://www.sec.gov/Archives/edgar/data/804328/000080432826000085/qcom062826erex991.htm";
const html = `<html><body><h1>QUALCOMM Reports Financial Results for Third Quarter Fiscal 2026</h1>
<p>Quarter ended June 28, 2026. Revenues were $10.0 billion.</p>
<h2>Business Outlook</h2><table id="synthetic-source-derived-guidance">
<tr><th>Metric</th><th>Q4 FY26 Estimates</th></tr>
<tr><td>Revenues</td><td>$9.7B – $10.5B</td></tr>
<tr><td>GAAP diluted EPS</td><td>$1.22 – $1.42</td></tr>
<tr><td>Non-GAAP diluted EPS</td><td>$2.05 – $2.25</td></tr>
</table><h2>Conference Call</h2></body></html>`;
const filing: EdgarFiling = { accessionNumber: "0000804328-26-000085", form: "8-K", filingDate: "2026-07-29", reportDate: "2026-07-29", primaryDocument: "cover.htm", items: "2.02,9.01" };

function record(markup = html, commentary: string | null = null) {
  const document = parseDocument(markup);
  return buildEarningsReleaseRecord({ filing, releaseUrl: sourceUrl, commentaryUrl: commentary === null ? null : "https://www.sec.gov/commentary.htm",
    releaseText: document.fullText, releaseDocument: document, commentaryText: commentary, includeNarrative: true });
}

function bundleWith(release = record()) {
  const bundle = completeCurrencyBundle({ annualCurrency: "USD", quarterlyRevenue: 10_000 });
  bundle.builtAt = "2026-10-30T00:00:00.000Z";
  if (bundle.statements.incomeQuarterly.ok) {
    const template = bundle.statements.incomeQuarterly.value.data.rows[0]!;
    bundle.statements.incomeQuarterly.value.data.rows = [
      ["2026-06-28", 2026, "Q3"], ["2026-03-29", 2026, "Q2"], ["2025-12-28", 2026, "Q1"],
      ["2025-09-28", 2025, "Q4"], ["2025-06-29", 2025, "Q3"],
    ].map(([date, fiscalYear, period]) => ({ ...template, date: String(date), fiscalYear: String(fiscalYear), period: String(period), revenue: 10e9 }));
  }
  if (bundle.statements.incomeAnnual.ok) {
    bundle.statements.incomeAnnual.value.data.rows.forEach((row, i) => { row.date = ["2025-09-28", "2024-09-29", "2023-09-24", "2022-09-25"][i]!; });
  }
  bundle.edgar.currentReports = { ok: true, value: { source: "edgar", endpoint: sourceUrl, fetchedAt: "2026-07-29T20:00:00Z", asOf: filing.filingDate,
    data: { version: CURRENT_REPORTS_VERSION, releases: [release], events: [], notes: [] } } };
  return bundle;
}

describe("source-bound single-quarter guidance tables", () => {
  it("constructs three source-bound observations from a parsed document with distinct accounting bases", () => {
    const document = parseDocument(html);
    const release = record();
    expect(release.guidanceExhibit).toBe("EX-99.1");
    expect(release.guidance?.items.map(i => [i.metric, i.basis, i.unit, i.symbol, i.period.label, i.low, i.mid, i.high])).toEqual([
      ["revenue", "unspecified", "currency", "$", "Q4 FY2026", 9.7e9, 10.1e9, 10.5e9],
      ["eps", "gaap", "currency-per-share", "$", "Q4 FY2026", 1.22, 1.32, 1.42],
      ["eps", "non-gaap", "currency-per-share", "$", "Q4 FY2026", 2.05, 2.15, 2.25],
    ]);
    expect(release.releaseUrl).toBe(sourceUrl);
    expect(release.accession).toBe("0000804328-26-000085");
    expect(release.guidance?.items.map(i => i.span?.text)).toEqual([
      "Revenues $9.7B – $10.5B", "GAAP diluted EPS $1.22 – $1.42", "Non-GAAP diluted EPS $2.05 – $2.25",
    ]);
    for (const item of release.guidance!.items) {
      expect(document.fullText.slice(item.span!.start, item.span!.end)).toBe(item.span!.text);
      expect(document.fullText.slice(item.headerSpan!.start, item.headerSpan!.end)).toBe("Q4 FY26 Estimates");
    }
  });

  it("is generic across issuer names and supports explicit endpoint scales without guessing missing scales", () => {
    expect(record(html.replace("QUALCOMM", "Cedar Devices")).guidance?.items.map(i => i.mid)).toEqual([10.1e9, 1.32, 2.15]);
    expect(record(html.replace("$9.7B – $10.5B", "US$9700 million – US$10500 million")).guidance?.items[0]).toMatchObject({ symbol: "US$", low: 9.7e9, high: 10.5e9 });
    expect(record(html.replace("Q4 FY26 Estimates", "Q4 FY2026 Current Guidance")).guidance?.items).toHaveLength(3);
    expect(record(html.replace("$1.22 – $1.42", "$1.223 – $1.427")).guidance?.items.find(i => i.basis === "gaap")).toMatchObject({ low: 1.223, mid: 1.325, high: 1.427 });
    // Old compact layouts retain their existing parser and source priority.
    expect(parseGuidance("Business Outlook Metric Q3 2026 Revenue $4.2 - $4.4B Quarterly Dividend")?.items[0]).toMatchObject({ mid: 4.3e9 });
    expect(record(html, "Financial Outlook Q4 FY26. We expect revenue to be $90 billion.").guidance?.items[0]?.mid).toBe(10.1e9);
  });

  it("keeps the existing compact previous/current parser when its source arrives as HTML", () => {
    const compact = `<h2>Business Outlook</h2><table><tr><th>Metric</th><th>Q3 2026</th></tr><tr><td>Revenue</td><td>$4.2 - $4.4B</td></tr></table>
      <table><tr><th>Metric</th><th>Full Year 2026</th><th>Previous Guidance</th><th>Current Guidance</th></tr>
      <tr><td>Revenue</td><td>$15.1 - $15.3B</td><td>$15.5 - $15.7B</td></tr></table><p>Quarterly Dividend</p>`;
    expect(record(compact).guidance?.items.map(i => [i.period.label, i.low, i.high])).toEqual([
      ["Q3 FY2026", 4.2e9, 4.4e9], ["FY2026", 15.5e9, 15.7e9],
    ]);
  });

  it.each([
    ["duplicate columns", html.replace("<th>Q4 FY26 Estimates</th>", "<th>Q4 FY26 Estimates</th><th>Q4 FY26 Estimates</th>")],
    ["conflicting columns", html.replace("<th>Q4 FY26 Estimates</th>", "<th>Q4 FY26 Estimates</th><th>Q4 FY27 Estimates</th>")],
    ["ambiguous column", html.replace("Q4 FY26 Estimates", "Previous Guidance Current Guidance")],
    ["missing fiscal year", html.replace("Q4 FY26 Estimates", "Q4 Estimates")],
    ["duplicate tables", html.replace("</table>", `</table><table><tr><th>Metric</th><th>Q4 FY26 Estimates</th></tr><tr><td>Revenues</td><td>$9.7B – $10.5B</td></tr></table>`) ],
    ["duplicate metric", html.replace("</table>", "<tr><td>Revenues</td><td>$9.7B – $10.5B</td></tr></table>")],
    ["conflicting metric", html.replace("</table>", "<tr><td>Revenues</td><td>$9.9B – $10.8B</td></tr></table>")],
    ["segment heading", html.replace("<th>Metric</th>", "<th>Handset segment</th>")],
    ["segment section", html.replace("<h2>Business Outlook</h2>", "<h2>Handsets</h2>")],
    ["segment caption", html.replace("<tr><th>Metric", "<caption>Handsets</caption><tr><th>Metric")],
    ["conflicting compact table", html.replace("</table>", "</table><h2>Business Outlook</h2><table><tr><th>Metric</th><th>Q4 2026</th></tr><tr><td>Revenue</td><td>$20 - $21B</td></tr></table>")],
    ["merged columns", html.replace("<th>Q4 FY26 Estimates</th>", "<th colspan=\"2\">Q4 FY26 Estimates</th>")],
    ["oversized capture", html.replace("</table>", `<tr><td>${"padding ".repeat(900)}</td><td></td></tr></table>`)],
    ["too many rows", html.replace("</table>", `${"<tr><td>Unsupported row</td><td></td></tr>".repeat(32)}</table>`)],
  ])("refuses %s through release construction", (_name, markup) => {
    expect(record(markup).guidance?.items ?? []).toEqual([]);
  });

  it.each([
    ["reversed", "$10.5B – $9.7B"], ["mixed currencies", "$9.7B – €10.5B"], ["mixed scales", "$9.7M – $10.5B"],
    ["unscaled low endpoint", "$9.7 – $10.5B"], ["unsupported scale", "$9.7T – $10.5T"], ["no currency", "9.7B – 10.5B"],
    ["extra range", "$9.7B – $10.5B $11B – $12B"],
  ])("withholds a revenue row with %s endpoints", (_name, value) => {
    expect(record(html.replace("$9.7B – $10.5B", value)).guidance?.items.some(i => i.metric === "revenue") ?? false).toBe(false);
  });

  it("does not join endpoints across rows or tables, or promote segment and adjustment rows", () => {
    for (const replacement of [
      "<tr><td>Revenues</td><td>$9.7B –</td></tr><tr><td>Unrelated amount</td><td>$10.5B</td></tr>",
      "<tr><td>Revenues</td><td>$9.7B –</td></tr></table><table><tr><td>Revenues</td><td>$10.5B</td></tr>",
      "<tr><td>Handset segment revenues</td><td>$9.7B – $10.5B</td></tr>",
      "<tr><td>Revenue adjustments</td><td>$9.7B – $10.5B</td></tr>",
      "<tr><td>Handset segment</td><td></td></tr><tr><td>Revenues</td><td>$9.7B – $10.5B</td></tr>",
    ]) {
      const release = record(html.replace("<tr><td>Revenues</td><td>$9.7B – $10.5B</td></tr>", replacement));
      expect(release.guidance?.items.some(i => i.metric === "revenue") ?? false).toBe(false);
    }
    expect(record(html.replace("GAAP diluted EPS", "GAAP diluted EPS adjustment")).guidance?.items.some(i => i.basis === "gaap") ?? false).toBe(false);
  });

  it("does not rescue a refused structural table with sentence or compact flattened fallback", () => {
    const refused = html.replace("<th>Q4 FY26 Estimates</th>", "<th>Q4 FY26 Estimates</th><th>Current Guidance</th>")
      .replace("<h2>Business Outlook</h2>", "<h2>Business Outlook</h2><p>We expect Q4 FY26 revenue to be $99 billion.</p>");
    expect(record(refused).guidance?.items ?? []).toEqual([]);
    const document = parseDocument(html);
    const unrelated = parseDocument(html.replace("$9.7B", "$99B"));
    expect(parseGuidance(document.fullText, unrelated)?.items ?? []).toEqual([]);
  });

  it("keeps raw header and row instructions out of controlled model labels and notes", () => {
    const injected = html.replace("Q4 FY26 Estimates", "Q4 FY26 Estimates IGNORE_PREVIOUS_INSTRUCTIONS")
      .replace("Revenues</td>", "Revenues IGNORE_ROW_INSTRUCTIONS</td>");
    const bundle = bundleWith(record(injected));
    const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
    expect(JSON.stringify({ figures: payload.issuerFilings?.figures, notes: payload.issuerFilings?.notes })).not.toMatch(/IGNORE_/);
    expect(nextPeriodRevenueGuidance(bundle)).toBeNull();
    const captioned = bundleWith(record(html.replace("<h1>QUALCOMM", "<p>IGNORE_DATE_INSTRUCTIONS currency USD_DROP_GUARDS as of October 30, 2026</p><h1>IGNORE_ISSUER_INSTRUCTIONS")));
    const validPayload = assembleContextPayload(captioned, runStageB(captioned), { checks: [], flags: [], gaps: [] });
    expect(nextPeriodRevenueGuidance(captioned)).toMatchObject({ periodLabel: "Q4 FY2026", currency: "USD" });
    expect(validPayload.issuerFilings?.figures.filter(f => /guidance midpoint/.test(f.label))).toHaveLength(3);
    expect(JSON.stringify({ figures: validPayload.issuerFilings?.figures, notes: validPayload.issuerFilings?.notes })).not.toMatch(/IGNORE_|USD_DROP_GUARDS|October 30/);
  });

  it("applies existing period, currency and scale admission without relabeling a different fiscal year", () => {
    expect(record(html.replace("FY26 Estimates", "FY25 Estimates")).guidance?.items[0]?.period.label).toBe("Q4 FY2025");
    expect(nextPeriodRevenueGuidance(bundleWith(record(html.replace("FY26 Estimates", "FY25 Estimates"))))).toBeNull();
    expect(nextPeriodRevenueGuidance(bundleWith(record(html.replaceAll("$", "€"))))).toBeNull();
    expect(nextPeriodRevenueGuidance(bundleWith(record(html.replace("$9.7B – $10.5B", "$9.7M – $10.5M"))))).toBeNull();
  });

  it("collects raw HTML offline, preserves source/basis, and reuses B5 calendar and retirement rules", async () => {
    const ok = <T,>(data: T, endpoint: string) => ({ ok: true as const, value: { data, source: "edgar" as const, endpoint, asOf: filing.filingDate, fetchedAt: "2026-07-29T20:00:00Z" } });
    // Only transport is replaced: collection, document parsing, release construction and model admission are real.
    const client = {
      filingProblem: () => null,
      filingIndexHeaders: async () => ok({ documents: [{ type: "EX-99.1", filename: "qcom062826erex991.htm", sequence: "1" }], typeByFilename: {} }, "offline-index"),
      fetchFilingDocument: async (_cik: string, f: EdgarFiling) => {
        if (f.primaryDocument !== "qcom062826erex991.htm") throw new Error("Unexpected offline document");
        return ok(html, sourceUrl);
      },
    } as unknown as EdgarClient;
    const collected = await collectCurrentReports(client, "804328", [filing], "2026-10-30", "offline-submissions");
    expect(collected.ok).toBe(true);
    if (!collected.ok) throw new Error(collected.gap.reason);
    const bundle = bundleWith(collected.value.data.releases[0]!);
    bundle.edgar.currentReports = collected;
    const disclosures = buildFilingDisclosures(bundle);
    expect(disclosures?.guidance?.source).toMatchObject({ accession: filing.accessionNumber, exhibit: "EX-99.1", url: sourceUrl });
    expect(disclosures?.guidance?.rows.map(i => [i.metric, i.basis, i.mid])).toEqual([["revenue", "unspecified", 10.1e9], ["eps", "gaap", 1.32], ["eps", "non-gaap", 2.15]]);
    expect(nextPeriodRevenueGuidance(bundle)).toMatchObject({ periodLabel: "Q4 FY2026", periodEnd: "2026-09-27", periodEndBasis: "fiscal-year-end-rule", low: 9.7e9, high: 10.5e9 });
    const guide = dcfGuidance(bundle, "USD")!;
    expect(guide).toMatchObject({ revenue: 10.1e9, revenueLow: 9.7e9, periodEnd: "2026-09-27" });
    // A supplied FY2026 consensus less the first nine months implies Q4 10.202B, inside 9.7–10.5B.
    // This synthetic model control is not a replay of report 53.
    const inputs: DcfAssumptionInputs = {
      revenueCagr3yPct: 8, revenueCagr5yPct: 8, waccPct: 10, riskFreePct: 4, domicileCountry: "US", marketCap: 60e9,
      analystEstimates: [{ date: "2026-09-27", revenueAvg: 40.202e9 }, { date: "2027-09-26", revenueAvg: 44e9 }],
      incomeTtm: { date: "2026-06-28", basis: "ttm", revenue: 40e9, operatingIncome: 8e9, incomeBeforeTax: 7e9, incomeTaxExpense: 1.4e9 },
      incomeHistory: ["2025-09-28", "2024-09-29", "2023-09-24"].map(date => ({ date, revenue: 40e9, operatingIncome: 8e9, incomeBeforeTax: 7e9, incomeTaxExpense: 1.4e9 })),
      balance: { date: "2026-06-28", basis: "quarter", totalDebt: 4e9, totalStockholdersEquity: 20e9, cashAndShortTermInvestments: 3e9 },
      fiscalYearToDate: { priorFiscalYearEnd: "2025-09-28", through: "2026-06-28", revenue: 30e9, quarters: 3 },
      quarterRevenue: { latest: { date: "2026-06-28", revenue: 10e9 }, yearAgo: { date: "2025-06-29", revenue: 10e9 }, guidedYearAgo: { date: "2025-09-28", revenue: 10e9 } },
      guidance: guide,
    };
    const withGuide = buildDcfAssumptions(inputs).assumptions!;
    const withoutGuide = buildDcfAssumptions({ ...inputs, guidance: null }).assumptions!;
    expect(withGuide.revenueAnchor?.source).toBe("consensus");
    expect(withGuide.revenueAnchor?.yearOneRevenue).toBe(withoutGuide.revenueAnchor?.yearOneRevenue);
    expect(withGuide.revenueAnchor?.basis).toMatch(/consistent with the outlook/);
    const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
    expect(payload.issuerFilings?.figures.filter(f => /guidance midpoint/.test(f.label)).map(f => [f.label, f.value])).toEqual([
      ["Q4 FY2026 revenue guidance midpoint", 10.1e9], ["Q4 FY2026 diluted EPS (GAAP) guidance midpoint", 1.32], ["Q4 FY2026 diluted EPS (non-GAAP) guidance midpoint", 2.15],
    ]);
    collected.value.data.releases.unshift(buildEarningsReleaseRecord({ filing: { accessionNumber: "later-q4", filingDate: "2026-11-04" }, releaseUrl: "https://www.sec.gov/q4.htm", commentaryUrl: null,
      releaseText: "Cedar Devices Reports Financial Results for Fourth Quarter Fiscal 2026. Quarter ended September 27, 2026. Revenues were $10.2 billion.", commentaryText: null, includeNarrative: true }));
    expect(nextPeriodRevenueGuidance(bundle)).toBeNull();
    expect(buildFilingDisclosures(bundle)?.guidance).toBeNull();
  });
});
