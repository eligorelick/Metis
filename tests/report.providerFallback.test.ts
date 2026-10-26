import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ReportSnapshotHeader } from "@/components/report/ReportSnapshotHeader";
import { ReportView } from "@/components/report/ReportView";
import { runStageB } from "@/pipeline/compute";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { TREASURY_PAR_CURVE_SERIES_ID } from "@/pipeline/riskFreeSeries";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import { assembleContextPayload, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import type { DataBundle } from "@/pipeline/types";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { providerFallbackNotice } from "@/report/providerFallback";
import type { Report } from "@/report/schema";
import type { ManifestEntry } from "@/types/core";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

/**
 * Audit 2026-10-22 F-1 (owner decision): when providers fell back, one
 * run-level header line names them and what replaced them, in both layouts
 * and every export. Configured substitutions (`expected`) are not named.
 */
const substitution = (member: string, source: string, expected: boolean): ManifestEntry => ({
  field: `keyless.${member}`,
  reason: `served by ${source} (some endpoint) because FMP FMP quota/rate limit (HTTP 429): Limit Reach`,
  severity: "info",
  expected,
});
const rateStandIn: ManifestEntry = {
  field: "riskFree.substitution",
  reason: "risk-free rate served by the U.S. Treasury daily par yield curve 10 Yr (observation 2026-07-02) because FRED DGS10 had no observation and FMP treasury rates had no 10-year value",
  severity: "info",
  attemptedSources: ["fred", TREASURY_PAR_CURVE_SERIES_ID],
};

const LINE =
  "Provider fallback · FMP did not serve every member, so the annual income statement and the annual balance sheet are from SEC EDGAR " +
  "and the quote is from Yahoo; the risk-free rate is the U.S. Treasury daily par yield curve 10 Yr (observation 2026-07-02), not FRED DGS10. " +
  "A run with these providers healthy can give different figures; each substitution is listed under missing data.";

function report(gaps: ManifestEntry[]): Report {
  const bundle: DataBundle = completeCurrencyBundle({ debt: 300 });
  bundle.gaps = [...bundle.gaps, ...gaps];
  return buildDataOnlyReport({
    symbol: bundle.symbol, companyName: "Test General Co", generatedAt: "2026-07-06T12:00:00.000Z", model: "none", costUsd: 0,
    bundle, validation: { checks: [], flags: [], gaps: [] } as unknown as ValidationReport, computed: runStageB(bundle), costBreakdown: [], reason: "no analysis",
  });
}

describe("provider-fallback header line (F-1)", () => {
  it("names the fallen-back members and the rate's stand-in once, on every surface", () => {
    const r = report([substitution("incomeAnnual", "edgar", false), substitution("balanceAnnual", "edgar", false), substitution("quote", "yahoo", false), rateStandIn]);
    expect(providerFallbackNotice(r)).toBe(LINE);

    const count = (text: string): number => text.split("Provider fallback ·").length - 1;
    const classic = renderToStaticMarkup(createElement(ReportView, { report: r, layout: "classic" }));
    expect(classic).toContain(LINE);
    expect(count(classic)).toBe(1);
    // The saved-snapshot header carries it in either layout; the dossier body does not repeat it.
    const header = renderToStaticMarkup(createElement(ReportSnapshotHeader, { snapshot: r, reportId: 7, status: "done", actions: null }));
    expect(header).toContain(LINE);
    expect(count(renderToStaticMarkup(createElement(ReportView, { report: r, layout: "dossier" })))).toBe(0);

    const markdown = reportToMarkdown(r);
    expect(markdown).toContain(`> ${LINE}`);
    expect(count(markdown)).toBe(1);
    const audit = reportToAuditMarkdown(r);
    expect(audit).toContain(`> ${LINE}`);
    expect(count(audit)).toBe(1);
    const print = reportToPrintBody(r);
    expect(print).toContain(`<p class="disclaimer">${LINE}</p>`);
    expect(count(print)).toBe(1);
  });

  it("tells the AI context the same line, once", () => {
    const bundle: DataBundle = completeCurrencyBundle({ debt: 300 });
    bundle.gaps = [...bundle.gaps, substitution("incomeAnnual", "edgar", false), substitution("balanceAnnual", "edgar", false), substitution("quote", "yahoo", false), rateStandIn];
    const prompt = serializePayloadForPrompt(assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] }));
    expect(prompt).toContain(`${LINE} Never attribute a substituted figure to FMP or FRED DGS10.`);
    expect(prompt.split("Provider fallback ·").length - 1).toBe(1);
    const healthy = completeCurrencyBundle({ debt: 300 });
    expect(serializePayloadForPrompt(assembleContextPayload(healthy, runStageB(healthy), { checks: [], flags: [], gaps: [] }))).not.toContain("Provider fallback");
  });

  it("is absent when every input came from its primary provider or the substitution was configured", () => {
    const configured = report([substitution("incomeAnnual", "edgar", true), substitution("quote", "yahoo", true)]);
    expect(providerFallbackNotice(configured)).toBeNull();
    expect(reportToMarkdown(configured)).not.toContain("Provider fallback");
    expect(renderToStaticMarkup(createElement(ReportView, { report: configured, layout: "classic" }))).not.toContain("Provider fallback");
  });

  it("names a rate stand-in alone, and a date the source did not report", () => {
    expect(providerFallbackNotice({ appendix: { missingData: [{ ...rateStandIn, attemptedSources: ["fred", "fmp:treasury-rates.year10"], reason: "risk-free rate served by FMP treasury rates 10-year (observation date not reported) because FRED DGS10 had no observation" }] } })).toBe(
      "Provider fallback · The risk-free rate is FMP treasury rates 10-year (observation date not reported), not FRED DGS10. " +
        "A run with these providers healthy can give different figures; each substitution is listed under missing data.",
    );
  });
});
