import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ReportView } from "@/components/report/ReportView";
import { runStageB } from "@/pipeline/compute";
import { newerPeriodicFiling } from "@/pipeline/filingDisclosures";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import type { DataBundle } from "@/pipeline/types";
import type { EdgarFiling } from "@/providers/edgar";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";

import { completeCurrencyBundle } from "./helpers/currencyBundle";

// Audit 2026-10-22 B-23: where a newer 10-Q's facts could not be merged, the
// report says the statements end before a filing the issuer has made.

const SENTENCE = "10-Q 0001403161-26-000103 for the period ended 2026-06-30 was filed on 2026-07-29; statements, TTM and multiples here end 2026-03-31 and do not include it.";

function filing(form: string, accessionNumber: string, reportDate: string, filingDate: string): EdgarFiling {
  return { form, accessionNumber, reportDate, filingDate, primaryDocument: "doc.htm" } as EdgarFiling;
}

function bundleWith(tenQ: EdgarFiling | null, statementsEnd = "2026-03-31"): DataBundle {
  const bundle = completeCurrencyBundle({ annualCurrency: "USD" });
  if (bundle.statements.incomeQuarterly.ok) {
    bundle.statements.incomeQuarterly.value.data.rows.unshift({ date: statementsEnd, fiscalYear: "2026", period: "Q2", reportedCurrency: "USD", revenue: 3e8 } as never);
  }
  bundle.builtAt = "2026-10-22T06:00:00.000Z";
  if (tenQ !== null) bundle.edgar.latestTenQ = { ok: true, value: { data: tenQ, source: "edgar", asOf: tenQ.filingDate, endpoint: "https://www.sec.gov/submissions", fetchedAt: "2026-10-22T05:00:00Z" } };
  bundle.edgar.latestTenK = { ok: true, value: { data: filing("10-K", "0001403161-25-000089", "2025-09-30", "2025-11-06"), source: "edgar", asOf: "2025-11-06", endpoint: "https://www.sec.gov/submissions", fetchedAt: "2026-10-22T05:00:00Z" } };
  return bundle;
}

function render(bundle: DataBundle) {
  const computed = runStageB(bundle);
  const report = buildDataOnlyReport({ symbol: bundle.symbol, companyName: "Test General Co", generatedAt: "2026-10-22T06:00:00.000Z", model: "none", costUsd: 0,
    bundle, validation: { checks: [], flags: [], gaps: [] } as unknown as ValidationReport, computed, costBreakdown: [], reason: "no analysis" });
  return {
    computed, report,
    surfaces: [reportToMarkdown(report), reportToPrintBody(report),
      renderToStaticMarkup(createElement(ReportView, { report })), renderToStaticMarkup(createElement(ReportView, { report, layout: "dossier" }))],
  };
}

describe("a periodic filing the statements do not reach (audit 2026-10-22 B-23)", () => {
  it("names the filing and its date in every surface and records a warn gap", () => {
    const { computed, report, surfaces } = render(bundleWith(filing("10-Q", "0001403161-26-000103", "2026-06-30", "2026-07-29")));
    expect(report.filingDisclosures?.newerFiling).toEqual({
      source: { form: "10-Q", accession: "0001403161-26-000103", exhibit: null, filingDate: "2026-07-29", url: null },
      periodEnd: "2026-06-30", statementsEnd: "2026-03-31",
    });
    expect(computed.gaps).toContainEqual(expect.objectContaining({ field: "fundamentals.newerFiling", severity: "warn", reason: SENTENCE }));
    for (const text of surfaces) {
      expect(text).toContain("0001403161-26-000103");
      expect(text).toMatch(/[Nn]ewer filing not reflected/);
    }
    expect(surfaces[0]).toContain(`**Newer filing not reflected.** ${SENTENCE}`);
  });

  it("says nothing once the statements reach the filing's period", () => {
    const { computed, report, surfaces } = render(bundleWith(filing("10-Q", "0001403161-26-000103", "2026-06-30", "2026-07-29"), "2026-06-30"));
    expect(report.filingDisclosures?.newerFiling).toBeUndefined();
    expect(computed.gaps.map((g) => g.field)).not.toContain("fundamentals.newerFiling");
    for (const text of surfaces) expect(text).not.toMatch(/[Nn]ewer filing not reflected/);
  });

  it("allows for a 52/53-week calendar and ignores a filing after the build", () => {
    expect(newerPeriodicFiling(bundleWith(filing("10-Q", "a", "2026-04-03", "2026-04-29")))).toBeNull();
    expect(newerPeriodicFiling(bundleWith(filing("10-Q", "b", "2026-06-30", "2026-10-23")))).toBeNull();
    expect(newerPeriodicFiling(bundleWith(filing("6-K", "c", "2026-06-30", "2026-07-29")))).toBeNull();
    expect(newerPeriodicFiling(bundleWith(null))).toBeNull();
  });
});
