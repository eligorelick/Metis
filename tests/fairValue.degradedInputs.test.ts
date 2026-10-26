import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ReportView } from "@/components/report/ReportView";
import { runStageB, type ComputedMetrics } from "@/pipeline/compute";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import { assembleContextPayload, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import type { DataBundle } from "@/pipeline/types";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { keyDataRows } from "@/report/presentation";
import type { Report } from "@/report/schema";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

import { degradedInputsReason, withDegradedInputs } from "@/pipeline/stageB/fairValue";
import { TREASURY_PAR_CURVE_SERIES_ID } from "@/pipeline/riskFreeSeries";
import { fairValueDegradedText, FAIR_VALUE_DEGRADED_FIELD } from "@/report/fairValueText";
import type { FairValue } from "@/report/schema";
import type { ManifestEntry } from "@/types/core";

/**
 * Audit 2026-10-22 F-13: a headline fair value built on substituted inputs —
 * the risk-free rate from a fallback, statements or the quote from the keyless
 * layer after an FMP refusal, the analyst-growth method dropped for a refused
 * estimate feed — carries a "degraded inputs" reason naming each substitution.
 * A keyless-by-configuration run (expected substitutions) carries none.
 */
const keyless = (member: string, source: string, expected?: boolean): ManifestEntry => ({
  field: `keyless.${member}`,
  reason: `served by ${source} (some endpoint) because FMP FMP quota/rate limit (HTTP 429): Limit Reach`,
  severity: "info",
  ...(expected === undefined ? {} : { expected }),
});

const analystRefused: ManifestEntry = {
  field: "valuation.dcf.analystGrowth",
  reason: "no usable analyst revenue estimates because the valuation is degraded: analyst revenue estimates were refused by the data provider's rate limit (HTTP 429)",
  severity: "warn",
};

const available: FairValue = {
  status: "available",
  method: "fcff-dcf",
  methodVersion: "FAIR_VALUE_2026_10_D102",
  perShare: { value: 207.6, unit: "USD/share", source: "computed.valuation.dcf.perShare", asOf: "2026-10-22", verified: true },
  upsidePct: -38,
  basis: ["Intrinsic value per share = the deterministic FCFF DCF."],
  reasons: [],
} as unknown as FairValue;

describe("fair value degraded inputs (F-13)", () => {
  it("names the risk-free substitution and the dropped analyst-growth method", () => {
    const reason = degradedInputsReason({
      riskFree: { pct: 5.15, asOf: "2026-10-19", seriesId: "fmp:treasury-rates.year10" },
      bundleGaps: [],
      valuationGaps: [analystRefused],
    });
    expect(reason).toEqual({
      field: FAIR_VALUE_DEGRADED_FIELD,
      severity: "warn",
      reason:
        "Degraded inputs: the risk-free rate is FMP treasury rates 10-year (observation 2026-10-19), not FRED DGS10; " +
        "the analyst-consensus growth method was left out because the provider refused the analyst estimates. " +
        "A run with these providers healthy can give a different value.",
    });
  });

  it("names a ROIC-vs-WACC history that had no per-year DGS10 observation, since it sets the terminal ROIC", () => {
    const reason = degradedInputsReason({
      riskFree: { pct: 5.12, asOf: "2026-10-20", seriesId: "fred:DGS10.last-cached" },
      waccHistoryCurrentOnly: true,
      bundleGaps: [],
      valuationGaps: [],
    });
    expect(reason?.reason).toBe(
      "Degraded inputs: the risk-free rate is the last cached FRED DGS10 observation (observation 2026-10-20), not FRED DGS10; " +
        "the ROIC-vs-WACC history behind the terminal ROIC compares every fiscal year to the current WACC, because FRED DGS10 was unavailable for the per-year rates. " +
        "A run with these providers healthy can give a different value.",
    );
  });

  it("names every keyless member that replaced an FMP member, grouped by the source that served it", () => {
    const reason = degradedInputsReason({
      riskFree: { pct: 4.01, asOf: "2026-10-21", seriesId: TREASURY_PAR_CURVE_SERIES_ID },
      bundleGaps: [
        keyless("incomeAnnual", "edgar"),
        keyless("balanceAnnual", "edgar"),
        keyless("quote", "yahoo"),
        keyless("enterpriseValues", "computed"),
        // Not substitutions: a keyless failure, a structural keyless-plan entry, a sub-field note.
        { field: "keyless.cashflowAnnual", reason: "EDGAR could not build it", severity: "warn" },
        keyless("eodPrices", "yahoo", true),
        { field: "keyless.incomeAnnual.shareBasis", reason: "served by edgar (x)", severity: "info" },
      ],
      valuationGaps: [{ ...analystRefused, severity: "info", reason: "no usable analyst revenue estimates — the analyst-consensus growth method was excluded from the median" }],
    });
    expect(reason?.reason).toBe(
      "Degraded inputs: the risk-free rate is the U.S. Treasury daily par yield curve 10 Yr (observation 2026-10-21), not FRED DGS10; " +
        "the annual income statement and the annual balance sheet are from SEC EDGAR, the quote is from Yahoo and the enterprise values are computed from filed facts and prices, not FMP. " +
        "A run with these providers healthy can give a different value.",
    );
  });

  it("leaves out the members that never feed the fair value: the sector ETF prices and the shares float", () => {
    const only = degradedInputsReason({
      riskFree: { pct: 4.02, asOf: "2026-10-21", seriesId: "fred:DGS10" },
      bundleGaps: [keyless("sectorEtf", "yahoo"), keyless("sharesFloat", "edgar")],
      valuationGaps: [],
    });
    expect(only).toBeNull();
    const mixed = degradedInputsReason({
      riskFree: { pct: 4.02, asOf: "2026-10-21", seriesId: "fred:DGS10" },
      bundleGaps: [keyless("sectorEtf", "yahoo"), keyless("quote", "yahoo")],
      valuationGaps: [],
    });
    expect(mixed?.reason).toBe("Degraded inputs: the quote is from Yahoo, not FMP. A run with these providers healthy can give a different value.");
  });

  it("gives no reason on a healthy run or a keyless-by-configuration run", () => {
    expect(degradedInputsReason({ riskFree: { pct: 4.02, asOf: "2026-10-21", seriesId: "fred:DGS10" }, bundleGaps: [keyless("quote", "yahoo", true)], valuationGaps: [] })).toBeNull();
    // No rate at all is a withheld WACC, disclosed by its own gap — not a substitution.
    expect(degradedInputsReason({ riskFree: { pct: null, asOf: null, seriesId: null }, bundleGaps: [], valuationGaps: [] })).toBeNull();
  });

  it("adds the reason to an available fair value only, and every surface reads it back", () => {
    const reason = degradedInputsReason({ riskFree: { pct: 5.15, asOf: "2026-10-19", seriesId: "fmp:treasury-rates.year10" }, bundleGaps: [], valuationGaps: [] })!;
    const degraded = withDegradedInputs(available, reason);
    expect(degraded.reasons).toEqual([reason]);
    expect(available.reasons).toEqual([]);
    expect(fairValueDegradedText(degraded)).toBe(reason.reason);
    expect(fairValueDegradedText(available)).toBeNull();
    expect(fairValueDegradedText(undefined)).toBeNull();
    const suppressed = { ...available, status: "suppressed", perShare: null, reasons: [] } as unknown as FairValue;
    expect(withDegradedInputs(suppressed, reason)).toBe(suppressed);
    expect(withDegradedInputs(available, null)).toBe(available);
  });
});

describe("degraded inputs end to end: Stage B, both layouts, the exports and the AI context", () => {
  function degradedBundle(): DataBundle {
    const bundle = completeCurrencyBundle({ debt: 300 });
    // FRED DGS10 down, FMP treasury serving: the rate comes from the fallback.
    bundle.macro = { ...bundle.macro, core: { DGS10: { ok: false, gap: { field: "macro.DGS10", reason: "FRED API returned a maintenance/HTML page (HTTP 200)", severity: "warn" } } } };
    bundle.analystEstimates = { ok: false, gap: { field: "fmp.analystEstimates", reason: "FMP quota/rate limit (HTTP 429): Limit Reach", severity: "warn" } };
    return bundle;
  }
  function dataOnly(bundle: DataBundle, computed: ComputedMetrics): Report {
    return buildDataOnlyReport({
      symbol: bundle.symbol, companyName: "Test General Co", generatedAt: "2026-07-06T12:00:00.000Z", model: "none", costUsd: 0,
      bundle, validation: { checks: [], flags: [], gaps: [] } as unknown as ValidationReport, computed, costBreakdown: [], reason: "no analysis",
    });
  }

  it("names both substitutions in fairValue.reasons and prints them beside the headline on every surface", () => {
    const bundle = degradedBundle();
    const computed = runStageB(bundle);
    expect(computed.fairValue.status).toBe("available");
    const text = fairValueDegradedText(computed.fairValue);
    expect(text).toMatch(/^Degraded inputs: the risk-free rate is FMP treasury rates 10-year \(observation 2026-07-04\), not FRED DGS10; the ROIC-vs-WACC history behind the terminal ROIC compares every fiscal year to the current WACC, because FRED DGS10 was unavailable for the per-year rates; the analyst-consensus growth method was left out because the provider refused the analyst estimates\./);

    const report = dataOnly(bundle, computed);
    expect(fairValueDegradedText(report.fairValue)).toBe(text);
    const key = keyDataRows(report).find((row) => row.label.startsWith("Model fair value"));
    expect(key?.note).toContain("Degraded inputs: the risk-free rate is FMP treasury rates 10-year");
    for (const layout of ["classic", "dossier"] as const) {
      const html = renderToStaticMarkup(createElement(ReportView, { report, layout }));
      expect(html).toContain("Degraded inputs: the risk-free rate is FMP treasury rates 10-year (observation 2026-07-04)");
    }
    expect(reportToMarkdown(report)).toContain("**Degraded inputs: the risk-free rate is FMP treasury rates 10-year (observation 2026-07-04), not FRED DGS10;");
    expect(reportToPrintBody(report)).toContain('<p class="disclaimer">Degraded inputs: the risk-free rate is FMP treasury rates 10-year (observation 2026-07-04), not FRED DGS10;');
    expect(report.verdict.synthesis).toContain("Degraded inputs:");

    const prompt = serializePayloadForPrompt(assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] }));
    expect(prompt).toContain(`${text} Say so wherever the model value is cited.`);
    expect(prompt).toContain("risk-free 4% (fmp:treasury-rates.year10, observation 2026-07-04)");
  });

  it("adds nothing to a run whose rate is DGS10 and whose estimates arrived", () => {
    const bundle = completeCurrencyBundle({ debt: 300 });
    bundle.macro = { ...bundle.macro, core: { DGS10: { ok: true, value: { data: [{ date: "2026-07-02", value: 4.0 }], asOf: "2026-07-02", source: "fred", endpoint: "series/DGS10", fetchedAt: "2026-07-06T00:00:00Z" } } } };
    const computed = runStageB(bundle);
    expect(computed.fairValue.reasons.some((r) => r.field === FAIR_VALUE_DEGRADED_FIELD)).toBe(false);
    const prompt = serializePayloadForPrompt(assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] }));
    expect(prompt).not.toContain("Degraded inputs");
  });
});
