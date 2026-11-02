/**
 * AI-201 (verifier m2-verify-15): a data-only report's Macro table lists a FRED
 * series once per list it is in. dataBundle.ts:2140-2142 fills
 * `bundle.macro.core` and `bundle.macro.sector` from ONE de-duplicated fetch
 * (selectFredSeriesResults by spec), so a series that is both a core series
 * and a sector-routed one (DGS10 for Information Technology / Utilities;
 * T10Y2Y, EFFR, BAMLH0A0HYM2 for Financials; CPIAUCSL for Consumer Staples)
 * is present in both records. dataOnlyReport.ts:702-740 emits both records
 * with no seriesId de-duplication, and the row name is looked up by seriesId
 * from CORE_SERIES only (:703, :722).
 *
 * HEAD path: completeCurrencyBundle + runStageB -> buildDataOnlyReport (the
 * function jobRunner.ts:4462 calls for every keyless / AI-failed run) ->
 * reportToMarkdown and the classic ReportView.
 *
 * Asserts the CORRECT behaviour:
 *  1. Each FRED series id appears once in macro.relevantSeries (MacroSection
 *     keys rows by seriesId, sections.tsx:1892).
 *  2. A row whose value is an index LEVEL is not named "YoY %".
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ReportView } from "@/components/report/ReportView";
import { runStageB } from "@/pipeline/compute";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import type { DataBundle } from "@/pipeline/types";
import { reportToMarkdown } from "@/report/export/markdown";
import type { Report } from "@/report/schema";

import { completeCurrencyBundle } from "./helpers/currencyBundle";

const VALIDATION = { checks: [], flags: [], gaps: [] } as unknown as ValidationReport;
const BUILT_AT = "2026-07-06T00:00:00.000Z";

function fred(seriesId: string, units: string, value: number, date = "2026-07-02") {
  return {
    ok: true as const,
    value: {
      data: [{ date: "2026-06-01", value: value - 0.1 }, { date, value }],
      asOf: date,
      source: "fred" as const,
      endpoint: `series/observations?series_id=${seriesId}&units=${units}`,
      fetchedAt: BUILT_AT,
      stale: false,
    },
  };
}

/**
 * The macro record dataBundle builds: one fetch per distinct (id, units) spec,
 * then `core` and `sector` each select their own specs from it
 * (selectFredSeriesResults), so a shared spec is the SAME result in both.
 */
function macroFor(sector: "Information Technology" | "Consumer Staples"): DataBundle["macro"] {
  const dgs10 = fred("DGS10", "lin", 4.12);
  const cpiYoY = fred("CPIAUCSL", "pc1", 2.9, "2026-06-01");
  const core = { DGS10: dgs10, DGS2: fred("DGS2", "lin", 3.8), CPIAUCSL: cpiYoY };
  const sectorRecord =
    sector === "Information Technology"
      ? { DGS10: dgs10, DFII10: fred("DFII10", "lin", 1.9), NASDAQCOM: fred("NASDAQCOM", "lin", 21000) }
      : { PCE: fred("PCE", "lin", 20500), PCEND: fred("PCEND", "lin", 6200), CPIAUCSL: fred("CPIAUCSL", "lin", 324.1, "2026-06-01") };
  return { core, sector: sectorRecord, gicsSector: sector, attribution: "FRED attribution" } as unknown as DataBundle["macro"];
}

function dataOnly(sector: "Information Technology" | "Consumer Staples"): Report {
  const bundle = { ...completeCurrencyBundle({ debt: 300 }), macro: macroFor(sector) } as DataBundle;
  return buildDataOnlyReport({
    symbol: bundle.symbol,
    companyName: "Test General Co",
    generatedAt: "2026-07-06T12:00:00.000Z",
    model: "none (no ANTHROPIC_API_KEY)",
    costUsd: 0,
    bundle,
    validation: VALIDATION,
    computed: runStageB(bundle),
    costBreakdown: [],
    reason: "ANTHROPIC_API_KEY not set \xe2\u20ac\u201d analysis passes skipped",
  });
}

function dupes(report: Report): string[] {
  const ids = report.macro.relevantSeries.map((s) => s.seriesId);
  return ids.filter((id, i) => ids.indexOf(id) !== i);
}

describe("AI-201: data-only Macro table lists each FRED series once", () => {
  it("Information Technology issuer: DGS10 appears once", () => {
    const report = dataOnly("Information Technology");
    const md = reportToMarkdown(report);
    const mdRows = md.split(/\r?\n/).filter((l) => l.startsWith("| DGS10 |"));
    const html = renderToStaticMarkup(createElement(ReportView, { report }));
    const htmlRows = (html.match(/>DGS10</g) ?? []).length;
    console.log(JSON.stringify({
      ids: report.macro.relevantSeries.map((s) => s.seriesId),
      dupes: dupes(report),
      markdownRows: mdRows,
      htmlDgs10Cells: htmlRows,
    }));
    expect(dupes(report)).toEqual([]);
    expect(mdRows).toHaveLength(1);
  });

  it("Consumer Staples issuer: CPIAUCSL appears once and a level is not named YoY %", () => {
    const report = dataOnly("Consumer Staples");
    const md = reportToMarkdown(report);
    const cpiRows = md.split(/\r?\n/).filter((l) => l.startsWith("| CPIAUCSL |"));
    const levelNamedYoY = report.macro.relevantSeries.filter((s) => s.latest.unit !== "%" && /YoY %/.test(s.name));
    console.log(JSON.stringify({
      cpiRows,
      levelNamedYoY: levelNamedYoY.map((s) => ({ seriesId: s.seriesId, name: s.name, value: s.latest.value, unit: s.latest.unit, relevance: s.relevance })),
    }));
    expect(levelNamedYoY.map((s) => `${s.seriesId} "${s.name}" = ${s.latest.value} ${s.latest.unit}`)).toEqual([]);
    expect(dupes(report)).toEqual([]);
  });
});
