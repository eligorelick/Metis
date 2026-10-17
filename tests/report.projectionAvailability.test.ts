import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectionsSection } from "@/components/report/sections";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { ReportSchema } from "@/report/schema";
import { runStageB } from "@/pipeline/compute";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { buildScenarioPresentation } from "@/report/scenarioPresentation";
import { projectionAvailability } from "@/report/surfaceManifest";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";

const surfaces = [
  ["live", (report: ReturnType<typeof loadTask28Fixture>) => renderToStaticMarkup(createElement(ProjectionsSection, { projections: report.projections!, index: 12 }))],
  ["Markdown", reportToMarkdown], ["print", reportToPrintBody],
] as const;
const projectionSection = (text: string) => text.slice(text.indexOf("Weighted Projections"), text.indexOf("Macro Context", text.indexOf("Weighted Projections")) < 0 ? undefined : text.indexOf("Macro Context", text.indexOf("Weighted Projections")));

function limitedReport(mode: "historical" | "null" | "unweighted" | "wrong-weighted-unit") {
  const report = loadTask28Fixture();
  for (const series of report.projections!.series) {
    delete series.flatShare;
    delete series.shareTrend;
    for (const path of ["bull", "base", "bear", "weighted"] as const) {
      if (mode === "historical") series[path] = [];
      else for (const point of series[path]) {
        if (mode === "null" || mode === "unweighted" && path === "weighted") Object.assign(point.value, { value: null });
        if (mode === "wrong-weighted-unit" && path === "weighted") point.value.unit = "wrong-unit";
      }
    }
    series.assumptions.push("Weighted path = 0.25 x bull + 0.5 x base + 0.25 x bear, the fixed display prior.");
  }
  report.projections!.notApplicableReason = mode === "historical" || mode === "null" ? "No actual forward projection points are available." : null;
  // Current stored-report schema rejects null TracedNumber values. Exercise
  // those inputs defensively at the rendering boundary without widening it.
  if (mode === "null" || mode === "unweighted") {
    expect(ReportSchema.safeParse(report).success).toBe(false);
    return report;
  }
  return ReportSchema.parse(report);
}

function alternativeReport(kind: "flatShare" | "shareTrend") {
  const report = limitedReport("wrong-weighted-unit");
  const eps = report.projections!.series.find(s => s.metric === "epsDiluted")!;
  const source = loadTask28Fixture().projections!.series.find(s => s.metric === "epsDiluted")!;
  eps[kind] = { bull: structuredClone(source.bull), base: structuredClone(source.base), bear: structuredClone(source.bear), weighted: structuredClone(source.weighted) };
  eps[kind]!.weighted[0]!.value.value = 9.03;
  eps[kind]!.weighted.at(-1)!.value.value = 19.03;
  return ReportSchema.parse(report);
}

describe("projection intro follows actual series availability", () => {
  it.each(surfaces)("withholds the unused horizon and prior intro for an empty series in %s", (_name, render) => {
    const report = loadTask28Fixture();
    report.projections!.series = [];
    report.projections!.notApplicableReason = "DCF assumptions/forward path unavailable - no basis for projections.";
    const before = JSON.stringify(report);
    const section = projectionSection(render(ReportSchema.parse(report)));
    expect(section.includes("25% / 50% / 25%") || section.includes("25/50/25")).toBe(false);
    expect(/Horizon 5y|5y.*bull\/base\/bear/.test(section)).toBe(false);
    expect(section).toContain("no basis for projections");
    expect(JSON.stringify(report)).toBe(before);
  });

  it.each(surfaces)("preserves actual projection horizon and weighting disclosure in %s", (_name, render) => {
    const report = loadTask28Fixture();
    expect(report.projections!.series.length).toBeGreaterThan(0);
    const before = JSON.stringify(report.projections);
    const section = projectionSection(render(report));
    expect(section.includes("25% / 50% / 25%") || section.includes("25/50/25")).toBe(true);
    expect(/Horizon 5y|5y.*bull\/base\/bear/.test(section)).toBe(true);
    expect(JSON.stringify(report.projections)).toBe(before);
  });

  it.each(surfaces)("does not treat retained historical containers or null forecasts as forward projections in %s", (_name, render) => {
    for (const mode of ["historical", "null"] as const) {
      const report = limitedReport(mode);
      expect(report.projections!.series).toHaveLength(4);
      expect(report.projections!.series.every(s => s.historical.some(p => p.value.value !== null))).toBe(true);
      const before = JSON.stringify(report);
      const section = projectionSection(render(report));
      expect(section.includes("25% / 50% / 25%") || section.includes("25/50/25")).toBe(false);
      expect(/Horizon 5y|5y.*bull\/base\/bear/.test(section)).toBe(false);
      expect(section).toContain("No actual forward projection points are available");
      expect(section.includes("Weighted path =")).toBe(false);
      expect(JSON.stringify(report)).toBe(before);
    }
  });

  it.each(surfaces)("retains finite unweighted paths and horizon without claiming an applied prior in %s", (_name, render) => {
    for (const mode of ["unweighted", "wrong-weighted-unit"] as const) {
      const section = projectionSection(render(limitedReport(mode)));
      expect(section.includes("25% / 50% / 25%") || section.includes("25/50/25")).toBe(false);
      expect(section.includes("Horizon 5y") || section.includes("5y")).toBe(true);
      expect(section.includes("Weighted path =")).toBe(false);
      expect(section).toContain("no projection weights are applied");
    }
  });

  it.each(["historical", "null", "unweighted", "wrong-weighted-unit"] as const)("keeps payload and scenario descriptions consistent for %s projections", mode => {
    const bundle = completeCurrencyBundle({});
    const computed = runStageB(bundle);
    computed.projections = limitedReport(mode).projections!;
    const payload = assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] });
    expect(payload.computed.flatMap(s => s.figures).some(f => f.source === "computed.projections.scenarioWeights")).toBe(false);
    const block = payload.computed.find(s => s.title.startsWith("Weighted projections") || s.title.startsWith("Operating projections"));
    expect(block?.title.includes("fixed display weights")).toBe(false);
    expect(block?.notes.join(" ").includes("Weighted path =")).toBe(false);
    if (mode === "unweighted" || mode === "wrong-weighted-unit") expect(block?.figures.some(f => f.label.includes(" base ") && typeof f.value === "number")).toBe(true);
    const presentation = buildScenarioPresentation(computed);
    expect(presentation.weightBasis.includes("25/50/25")).toBe(false);
    expect(presentation.weightBasis).toContain("no projection weights are applied");
  });

  it("retains the citable prior for actual weighted payload values", () => {
    const bundle = completeCurrencyBundle({});
    const computed = runStageB(bundle);
    const payload = assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] });
    expect(payload.computed.flatMap(s => s.figures).some(f => f.source === "computed.projections.scenarioWeights")).toBe(true);
    expect(payload.computed.some(s => s.title.includes("fixed display weights"))).toBe(true);
  });

  it("admits a real zero but rejects ambiguous or non-finite weighted observations", () => {
    const series = structuredClone(loadTask28Fixture().projections!.series[0]!);
    const seed = series.base[0]!;
    for (const path of ["bull", "base", "bear", "weighted"] as const) series[path] = [{ ...structuredClone(seed), value: { ...seed.value, value: 0 } }];
    expect(projectionAvailability([series])).toEqual({ forward: true, weighted: true });
    series.weighted.push(structuredClone(series.weighted[0]!));
    expect(projectionAvailability([series])).toEqual({ forward: true, weighted: false });
    series.weighted.pop();
    for (const path of ["bull", "base", "bear", "weighted"] as const) series[path][0]!.value.unit = "wrong-unit";
    expect(projectionAvailability([series])).toEqual({ forward: false, weighted: false });
    for (const path of ["bull", "base", "bear", "weighted"] as const) {
      series[path][0]!.value.unit = series.unit;
      series[path][0]!.value.value = Number.NaN;
    }
    expect(projectionAvailability([series])).toEqual({ forward: false, weighted: false });
  });

  it.each(surfaces)("bases prior disclosure on surviving weighted alternatives in %s", (_name, render) => {
    for (const kind of ["flatShare", "shareTrend"] as const) {
      const report = alternativeReport(kind);
      expect(projectionAvailability(report.projections!.series)).toEqual({ forward: true, weighted: true });
      const section = projectionSection(render(report));
      expect(section.includes("25% / 50% / 25%") || section.includes("25/50/25")).toBe(true);
      expect(section.includes("no projection weights are applied")).toBe(false);
      expect(section.includes("9.03")).toBe(true);
      expect(section.includes("19.03")).toBe(true);
    }
  });

  it.each(["flatShare", "shareTrend"] as const)("samples %s weighted alternatives on their own admitted periods", kind => {
    const bundle = completeCurrencyBundle({});
    const computed = runStageB(bundle);
    computed.projections = alternativeReport(kind).projections!;
    const payload = assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] });
    const block = payload.computed.find(s => s.title.startsWith("Weighted projections"))!;
    expect(block.title).toContain("fixed display weights");
    const alternative = block.figures.filter(f => f.source.includes(`.${kind}.weighted`));
    expect(alternative.map(f => f.value)).toEqual(expect.arrayContaining([9.03, 19.03]));
    expect(block.figures.some(f => f.source === "computed.projections.scenarioWeights")).toBe(true);
  });

  it.each(["duplicate", "wrong-unit", "wrong-period", "non-finite", "zero"] as const)("applies the shared admission guard to %s alternative weighted values", mode => {
    const report = alternativeReport("flatShare");
    const eps = report.projections!.series.find(s => s.metric === "epsDiluted")!;
    const point = structuredClone(eps.flatShare!.weighted[0]!);
    eps.flatShare!.weighted = [point];
    if (mode === "duplicate") eps.flatShare!.weighted.push(structuredClone(point));
    if (mode === "wrong-unit") point.value.unit = "wrong-unit";
    if (mode === "wrong-period") point.value.period = "Unrelated period";
    if (mode === "non-finite") point.value.value = Number.NaN;
    if (mode === "zero") point.value.value = 0;
    expect(ReportSchema.safeParse(report).success).toBe(mode !== "non-finite");
    expect(projectionAvailability(report.projections!.series).weighted).toBe(mode === "zero");
    const bundle = completeCurrencyBundle({});
    const computed = runStageB(bundle);
    computed.projections = report.projections!;
    const payload = assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] });
    const alternatives = payload.computed.flatMap(s => s.figures).filter(f => f.source.includes(".flatShare.weighted"));
    expect(alternatives.length > 0).toBe(mode === "zero");
    expect((payload.provenanceRegistry ?? []).some(r => r.id.includes(".flatshare-weighted."))).toBe(mode === "zero");
    if (mode === "zero") expect(alternatives[0]?.value).toBe(0);
  });
});
