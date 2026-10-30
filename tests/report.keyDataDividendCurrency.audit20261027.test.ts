import { describe, expect, it } from "vitest";
import { buildEarningsReleaseRecord, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
import { keyDataRows } from "@/report/presentation";
import type { Report } from "@/report/schema";
import { buildSyntheticRouteBundle, runResearchRoutePanel } from "./helpers/researchRoutePanel";

function run(currency: string) {
  const bundle = buildSyntheticRouteBundle("general");
  for (const result of Object.values(bundle.statements)) if (result.ok) {
    for (const row of result.value.data.rows) row.reportedCurrency = currency;
  }
  const release = buildEarningsReleaseRecord({
    filing: { accessionNumber: "0000000001-26-000001", filingDate: "2026-07-01", acceptanceDateTime: undefined },
    releaseUrl: "https://www.sec.gov/Archives/edgar/data/1/000000000126000001/ex99.htm",
    commentaryUrl: null, commentaryText: null, includeNarrative: true,
    releaseText: "Synthetic Corp Reports Results. The Board declared a quarterly cash dividend of $0.50 per share.",
  });
  bundle.edgar.currentReports = { ok: true, value: { source: "edgar", endpoint: "fixture", asOf: "2026-07-01", fetchedAt: bundle.builtAt,
    data: { version: CURRENT_REPORTS_VERSION, releases: [release], events: [], notes: [] } } };
  return runResearchRoutePanel(bundle);
}

function stripPriceCurrency(report: Report) {
  if (report.marketData) report.marketData.currency = null;
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const item of node) visit(item); return; }
    const record = node as Record<string, unknown>;
    if (typeof record.source === "string" && /^payload\.quote\.price$|^computed\.technicals\.last-close$/.test(record.source)) {
      record.currency = null;
      record.unit = "currency/share";
    }
    for (const [key, value] of Object.entries(record)) if (key !== "appendix" && key !== "verificationLog") visit(value);
  };
  visit(report);
  return report;
}

describe("FIN-105-V1 key-data dividend currency", () => {
  it("withholds a CAD dividend yield against the USD quote on the report and Markdown", () => {
    const { report, surfaces } = run("CAD");
    expect(report.filingDisclosures?.capitalReturn?.dividendPerShare).toBe(0.5);
    expect(report.filingDisclosures?.currency).toBe("CAD");
    const row = keyDataRows(report).find(r => r.label === "Dividend yield");
    expect(row?.value).toBe("withheld");
    expect(row?.note).toMatch(/dividend in CAD, quote in USD/);
    expect(surfaces.markdown.split("\n").find(line => line.includes("Dividend yield"))).toMatch(/withheld/);
  });

  it("does not use the USD model currency to fill missing price currency", () => {
    const report = stripPriceCurrency(structuredClone(run("USD").report));
    expect(report.valuation.dcf.perShare?.currency ?? report.valuation.dcf.perShare?.unit).toMatch(/USD/);
    const rows = keyDataRows(report);
    expect(rows.find(r => /^(Price|Latest price|Last close)$/.test(r.label))?.value).toMatch(/100/);
    expect(rows.find(r => r.label === "Dividend yield")?.value).toBe("withheld");
  });

  it("withholds a dividend whose own currency is unknown", () => {
    const report = structuredClone(run("USD").report);
    report.filingDisclosures!.currency = null;
    expect(keyDataRows(report).find(r => r.label === "Dividend yield")?.value).toBe("withheld");
  });

  it("keeps the same-currency quarterly control at exactly 2.00%", () => {
    expect(keyDataRows(run("USD").report).find(r => r.label === "Dividend yield")?.value).toBe("2.00%");
  });
});
