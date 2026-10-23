import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ReportView } from "@/components/report/ReportView";
import { parseReleaseHeadline, parseReportedPeriod, reportsResults } from "@/edgar/currentReports";
import { runStageB } from "@/pipeline/compute";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import type { DataBundle } from "@/pipeline/types";
import { buildEarningsReleaseRecord, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";

import { completeCurrencyBundle } from "./helpers/currencyBundle";

// Audit 2026-10-22 B-24: a results 8-K for a quarter later than the newest
// statement period must be disclosed, never silently ignored and never merged
// into the statements, TTM or multiples.
const RESULTS = "Example Corp Reports Third Quarter 2026 Results. Quarter ended September 30, 2026. Revenue was $1.40 billion, up 12% year over year. Net income was $210 million, or $0.52 per diluted share. Adjusted earnings per share were $0.61.";
const DELIVERIES = "Example Corp Q3 2026 Vehicle Production & Deliveries. In the third quarter, we produced 400,000 vehicles and delivered 410,000 vehicles. Our net income and cash flow results will be announced along with further financial details in our quarterly results.";

function bundleWith(releaseText: string, filingDate = "2026-10-13", commentaryText: string | null = null): DataBundle {
  const bundle = completeCurrencyBundle({ annualCurrency: "USD" });
  if (bundle.statements.incomeQuarterly.ok) {
    bundle.statements.incomeQuarterly.value.data.rows.unshift({ date: "2026-06-30", fiscalYear: "2026", period: "Q2", reportedCurrency: "USD", revenue: 3e8 } as never);
  }
  const record = buildEarningsReleaseRecord({ filing: { accessionNumber: "0000000042-26-000099", filingDate }, releaseUrl: "https://www.sec.gov/ex99.htm", commentaryUrl: commentaryText === null ? null : "https://www.sec.gov/ex992.htm", releaseText, commentaryText, includeNarrative: true });
  bundle.edgar.currentReports = { ok: true, value: { data: { version: CURRENT_REPORTS_VERSION, releases: [record], events: [], notes: [] }, source: "edgar", asOf: filingDate, endpoint: "https://www.sec.gov/ex99.htm", fetchedAt: "2026-10-14T00:00:00Z" } };
  return bundle;
}

function render(bundle: DataBundle) {
  const computed = runStageB(bundle);
  const report = buildDataOnlyReport({ symbol: bundle.symbol, companyName: "Test General Co", generatedAt: "2026-10-14T12:00:00.000Z", model: "none", costUsd: 0,
    bundle, validation: { checks: [], flags: [], gaps: [] } as unknown as ValidationReport, computed, costBreakdown: [], reason: "no analysis" });
  return { computed, report, surfaces: [reportToMarkdown(report), reportToPrintBody(report), renderToStaticMarkup(createElement(ReportView, { report }))] };
}

describe("release parsing for newer results (audit 2026-10-22 B-24)", () => {
  it.each([
    ["Bank of America Reports 3Q26 Net Income of $7.5 Billion; EPS of $0.91", 2026, 3],
    ["Q3 2026 Update. Highlights: profitability and cash generation.", 2026, 3],
  ])("reads a compact quarter title: %s", (text, fiscalYear, fiscalQuarter) => {
    expect(parseReportedPeriod(text).fiscal).toMatchObject({ fiscalYear, fiscalQuarter });
  });

  it("reads a compact title beside an ordinal guidance heading", () => {
    const text = "Example Corp Q2 2026 Update. Revenue was $1.2 billion. Third Quarter 2026 Guidance: revenue of $1.3 billion to $1.4 billion.";
    expect(parseReportedPeriod(text).fiscal).toMatchObject({ fiscalYear: 2026, fiscalQuarter: 2 });
  });

  it("reads a hyphenated ordinal title before a later quarter named in the text", () => {
    const text = "EX-99.1 August 5, 2026 Example Co. reports second-quarter 2026 financial results. Revenue in Q2 2026 increased 48% to $23.0 billion. We plan to submit an application to the FDA in the first quarter of 2027.";
    expect(parseReportedPeriod(text).fiscal).toMatchObject({ fiscalYear: 2026, fiscalQuarter: 2 });
  });

  it("dates the release by its own quarter end, not a year-ago comparison stated first", () => {
    const text = "Example Corp Reports Third Quarter 2026 Results. Revenue was $1.2 billion in the third quarter ended September 30, 2025 and $1.4 billion in the third quarter ended September 30, 2026.";
    expect(parseReportedPeriod(text)).toMatchObject({ fiscal: { fiscalYear: 2026, fiscalQuarter: 3 }, periodEnd: "2026-09-30" });
  });

  it("tells a results release from an operational update", () => {
    expect(reportsResults(RESULTS)).toBe(true);
    expect(reportsResults(DELIVERIES)).toBe(false);
    // Tesla's Q3 2026 update prints its headline figures without full stops; a later "projects" is no outlook.
    expect(reportsResults("Q3 2026 Update. Profitability $0.7B GAAP operating income $0.8B GAAP net income $1.7B non-GAAP net income1 In Q3, we maintained strong momentum on many projects spanning Super Intelligence (SI), robotics and renewable energy.")).toBe(true);
  });

  it("reads headline revenue and GAAP diluted EPS, ignoring the adjusted figure", () => {
    expect(parseReleaseHeadline(RESULTS)).toEqual({ revenue: { value: 1.4e9, symbol: "$" }, epsDiluted: { value: 0.52, symbol: "$" } });
    expect(parseReleaseHeadline(`${RESULTS} Revenue was $1.50 billion on a constant-currency basis.`).revenue).toBeNull();
  });

  it("reads the total, never a segment's revenue, and an exact amount", () => {
    const head = "Example Inc. Announces Third Quarter 2026 Results.";
    expect(parseReleaseHeadline(`${head} Consolidated revenues increased 16.4% year over year to $64.6 billion. Cloud revenues of $15.2 billion grew 34%. Diluted EPS was $2.87.`))
      .toEqual({ revenue: { value: 64.6e9, symbol: "$" }, epsDiluted: { value: 2.87, symbol: "$" } });
    expect(parseReleaseHeadline(`${head} Cloud revenues of $15.2 billion grew 34%. Diluted EPS was $2.87.`).revenue).toBeNull();
  });

  it("ignores an adjusted per-share figure stated later in its sentence", () => {
    expect(parseReleaseHeadline("Net income was $1.0 billion, or $2.10 per diluted share. Adjusted net income was $900 million, or $1.95 per diluted share.").epsDiluted)
      .toEqual({ value: 2.1, symbol: "$" });
  });

  it("never reads a loss per share, a basis named after the figure, or a full-year amount as the quarter's", () => {
    const head = "Acme Reports Third Quarter 2026 Results. Revenue was $1.2 billion.";
    expect(parseReleaseHeadline(`${head} Net loss was $50.0 million, or $0.12 per diluted share.`).epsDiluted).toBeNull();
    expect(parseReleaseHeadline(`${head} Diluted EPS was $2.10, excluding the impact of restructuring charges.`).epsDiluted).toBeNull();
    const q4 = "Acme Reports Fourth Quarter and Full Year 2026 Results. Full-year revenue was $4.8 billion. Diluted EPS for the full year was $5.10.";
    expect(parseReleaseHeadline(q4)).toEqual({ revenue: null, epsDiluted: null });
  });

  it("does not count a dividend or an EPS outlook as results", () => {
    expect(reportsResults("Example Corp Declares Quarterly Dividend. The board declared a quarterly dividend of $0.52 per share, payable November 14, 2026.")).toBe(false);
    expect(reportsResults("Example Corp Updates Outlook. The company now expects full-year diluted EPS of $3.10 to $3.20.")).toBe(false);
    expect(reportsResults("Q3 2026 Update. Diluted EPS of $3.10 is expected.")).toBe(false);
    for (const word of ["projected", "forecasted", "anticipated", "targeted", "guided"]) {
      expect(reportsResults(`Q3 2026 Update. Diluted EPS of $3.10 is ${word}.`)).toBe(false);
    }
  });
});

describe("newer results than the statements (audit 2026-10-22 B-24)", () => {
  it("discloses the release in every surface and records a warn gap", () => {
    const { computed, report, surfaces } = render(bundleWith(RESULTS));
    for (const text of surfaces) {
      expect(text).toContain("0000000042-26-000099");
      expect(text).toContain("2026-10-13");
      expect(text).toMatch(/do not reflect them/);
    }
    expect(surfaces[0]).toContain("Results for Q3 FY2026 (quarter ended 2026-09-30) were published in 8-K 0000000042-26-000099 on 2026-10-13; statements, TTM and multiples here end 2026-06-30 and do not reflect them.");
    expect(computed.gaps).toContainEqual(expect.objectContaining({ field: "fundamentals.newerResults", severity: "warn" }));
    expect(report.filingDisclosures?.newerResults).toMatchObject({ revenue: 1.4e9, epsDiluted: 0.52, currency: "USD" });
    expect(surfaces[0]).toMatch(/Q3 FY2026 \(unaudited, from the results release\)/);
  });

  it("still discloses it when the release names its quarter but no end date", () => {
    const { computed, surfaces } = render(bundleWith(RESULTS.replace(" Quarter ended September 30, 2026.", "")));
    expect(surfaces[0]).toMatch(/Results for Q3 FY2026 \(the quarter\b[^)]*\)|Results for Q3 FY2026 were published/);
    expect(surfaces[0]).toMatch(/0000000042-26-000099 on 2026-10-13; statements, TTM and multiples here end 2026-06-30 and do not reflect them/);
    expect(computed.gaps.some((g) => g.field === "fundamentals.newerResults")).toBe(true);
  });

  it("orders by the fiscal quarter when the only quarter end stated is a year-ago comparison", () => {
    const text = "Example Corp Reports Third Quarter 2026 Results. Compared with the third quarter ended September 30, 2025, revenue was $1.40 billion. Net income was $210 million, or $0.52 per diluted share.";
    const { report, surfaces } = render(bundleWith(text));
    expect(report.filingDisclosures?.newerResults).toMatchObject({ reportedPeriod: "Q3 FY2026", reportedPeriodEnd: null, statementsEnd: "2026-06-30" });
    expect(surfaces[0]).toContain("Results for Q3 FY2026 were published in 8-K 0000000042-26-000099 on 2026-10-13;");
    expect(surfaces[0]).not.toContain("quarter ended 2025-09-30");
  });

  it("cites the exhibit that states the results", () => {
    const cover = "Example Corp Reports Third Quarter 2026 Results. Quarter ended September 30, 2026. The financial commentary is furnished as Exhibit 99.2.";
    const { report } = render(bundleWith(cover, "2026-10-13", RESULTS));
    expect(report.filingDisclosures?.newerResults?.source).toMatchObject({ exhibit: "EX-99.2", url: "https://www.sec.gov/ex992.htm" });
    expect(render(bundleWith(RESULTS)).report.filingDisclosures?.newerResults?.source).toMatchObject({ exhibit: "EX-99.1", url: "https://www.sec.gov/ex99.htm" });
  });

  it.each([
    ["an operational update", DELIVERIES, "2026-10-02"],
    ["the statements' own quarter", RESULTS.replace("Third Quarter", "Second Quarter").replace("September 30", "June 30"), "2026-07-28"],
  ])("raises nothing for %s", (_name, text, filed) => {
    const { computed, surfaces } = render(bundleWith(text, filed));
    expect(surfaces.some((s) => /do not reflect them/.test(s))).toBe(false);
    expect(computed.gaps.some((g) => g.field === "fundamentals.newerResults")).toBe(false);
  });
});
