import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportView } from "@/components/report/ReportView";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import type { DataBundle } from "@/pipeline/types";
import * as presentation from "@/report/presentation";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintHtml } from "@/report/export/printHtml";
import { buildSyntheticRouteBundle, runResearchRoutePanel } from "./helpers/researchRoutePanel";

function relabel(bundle: DataBundle, currency: string | null) {
  for (const result of Object.values(bundle.statements)) if (result.ok) {
    for (const row of result.value.data.rows) row.reportedCurrency = currency;
  }
  return bundle;
}

describe("FIN-105 financial-route P/TBV currency", () => {
  it.each(["bank", "insurer"] as const)("withholds mixed-currency %s P/TBV and premium, preserving justified P/TBV and ROTE", (route) => {
    const control = runResearchRoutePanel(buildSyntheticRouteBundle(route));
    const { computed, report, surfaces } = runResearchRoutePanel(relabel(buildSyntheticRouteBundle(route), "CAD"));
    const rows = Object.fromEntries(report.routeMetrics!.metrics.map(m => [m.key, m]));
    const ctl = Object.fromEntries(control.report.routeMetrics!.metrics.map(m => [m.key, m]));
    expect(computed.route.overlays).not.toContain("adr");
    expect(rows.pTbv.value).toBeNull();
    expect(rows.pTbv.withheldReason).toMatch(/statements in CAD, quote in USD/);
    expect(rows.premiumToJustified.value).toBeNull();
    expect(rows.justifiedPTbv.value).toBe(ctl.justifiedPTbv.value);
    expect(rows.rote.value).toBe(ctl.rote.value);
    expect(surfaces.markdown).toMatch(/\| price \/ tangible book value \| withheld \|/);
    expect(computed.valuation.gaps.find(g => g.field === "valuation.excessReturn.currency")?.reason).not.toMatch(/ADR case/);
  });

  it("gives the writer no mixed-currency P/TBV figure", () => {
    const bundle = relabel(buildSyntheticRouteBundle("bank"), "CAD");
    const { computed, validation } = runResearchRoutePanel(bundle);
    const figure = assembleContextPayload(bundle, computed, validation).computed.flatMap(s => s.figures ?? []).find(f => f.label === "P/TBV");
    expect(figure?.value ?? null).toBeNull();
  });

  it("withholds P/TBV when statement currency is unknown", () => {
    const { report } = runResearchRoutePanel(relabel(buildSyntheticRouteBundle("bank"), null));
    expect(report.routeMetrics!.metrics.find(m => m.key === "pTbv")!.value).toBeNull();
  });

  it("withholds a stored mixed-currency pair on every reader surface without mutating its audit record", () => {
    const { report } = runResearchRoutePanel(relabel(buildSyntheticRouteBundle("bank"), "CAD"));
    const legacy = structuredClone(report);
    for (const m of legacy.routeMetrics!.metrics) if (m.key === "pTbv" || m.key === "premiumToJustified") Object.assign(m, { value: 23.81, withheldReason: null });
    const before = structuredClone(legacy);
    const shown = presentation.routeMetricsForDisplay(legacy)!;
    expect(shown.metrics.find(m => m.key === "pTbv")!.value).toBeNull();
    expect(shown.metrics.find(m => m.key === "premiumToJustified")!.value).toBeNull();
    expect(presentation.routeMetricsForDisplay({ ...legacy, routeMetrics: shown })).toEqual(shown);
    expect(reportToMarkdown(legacy)).toMatch(/\| price \/ tangible book value \| withheld \|/);
    for (const html of [reportToPrintHtml(legacy), renderToStaticMarkup(createElement(ReportView, { report: legacy }))]) {
      expect(html).not.toMatch(/>23\.81×</);
      expect(html).toContain("statements in CAD, quote in USD");
    }
    expect(legacy).toEqual(before);
  });

  it("pins the same-currency bank pairing and leaves its display object intact", () => {
    const { report } = runResearchRoutePanel(buildSyntheticRouteBundle("bank"));
    const values = Object.fromEntries(report.routeMetrics!.metrics.map(m => [m.key, m.value]));
    expect(values.pTbv).toBe(23.80952380952381);
    expect(values.justifiedPTbv).toBe(6.329365079365079);
    expect(values.premiumToJustified).toBe(17.48015873015873);
    expect(presentation.routeMetricsForDisplay(report)).toBe(report.routeMetrics);
  });
});
