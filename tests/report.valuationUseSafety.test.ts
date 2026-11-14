import { keyDataRows, scorecardTable } from "@/report/presentation";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { withValuationUseSafety } from "@/report/valuationUseSafety";
import { ReportView } from "@/components/report/ReportView";
import { HeadlineGrade } from "@/components/report/primitives";
import { CompositeScorecard } from "@/components/report/sections";
import { applyReportAssessmentStatus, withAssessmentQualification } from "@/report/assessment";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { runStageB } from "@/pipeline/compute";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { task28SentinelReport } from "./helpers/task28Report";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { unavailableValuationUseFixture } from "./helpers/valuationUse";
import { ReportSchema, ScoreAspectSchema, type Report } from "@/report/schema";
import { summarizeSensitivity } from "@/report/scenarioPresentation";

function legacy(): Report {
  const report = task28SentinelReport();
  report.fairValue = { status: "available", method: "fcff-dcf", methodVersion: "OLD", perShare: {
    value: 123.45, unit: "USD/share", source: "computed.valuation.dcf.perShare", asOf: "2026-11-05", verified: true,
  }, upsidePct: 23.45, basis: ["Recorded supported calculation"], reasons: [] };
  report.valuation.dcf.perShare = structuredClone(report.fairValue.perShare); report.valuation.dcf.upsidePct = 23.45;
  report.valuation.dcf.bridge = { enterpriseValue: 1300, netDebt: 65.5, minorityInterest: 0, preferredEquity: 0,
    equityValue: 1234.5, dilutedShares: 10, presentValueExplicit: 600, presentValueTerminal: 700,
    currency: "USD", asOf: "2025-12-31" };
  report.valuation.marketValueScope = { status: "unverified-vendor-scope", marketCap: 1000, economicShares: null,
    currency: "USD", shareCountAsOf: null, priceAsOf: "2026-07-20", approximate: false,
    basis: "Synthetic same-currency quote", enterpriseValue: 1065.5, enterpriseValueBasis: "Synthetic bridge" };
  delete report.scores!.qualification;
  return report;
}

describe("immutable current-use report view", () => {
  it.each(["reference", "unestablished", "current"] as const)("requalifies cached price-dependent conclusions for %s use without erasing guidance", mode => {
    const report = legacy();
    report.valuation.dcf.sensitivityGrid = [{ waccPct: 8, gTermPct: 2, perShare: 50 }, { waccPct: 8, gTermPct: 3, perShare: 60 },
      { waccPct: 9, gTermPct: 2, perShare: 40 }, { waccPct: 9, gTermPct: 3, perShare: 50 }];
    delete report.valuation.dcf.growthMarginGrid;
    report.scenarioPresentation = { methodVersion: "saved-scenario", weightBasis: "Saved operating display prior",
      interpretation: "Saved model interpretation", sensitivity: summarizeSensitivity(report.valuation.dcf.sensitivityGrid, 100) };
    report.thesisTriggers = [
      { id: "reverse-growth", metric: "Saved price-implied growth", comparator: "above", threshold: { value: 7.5, unit: "%", source: "computed.valuation.reverseDcf", asOf: "2025-12-31", verified: null }, horizon: "Explicit model years", fixedAssumptions: ["Current price held fixed"], consequence: "Review at the price-implied threshold." },
      { id: "another-inverse", metric: "Saved inverse margin", comparator: "above", threshold: { value: 25, unit: "%", source: "computed.valuation.reverseDcf.impliedTerminalMarginPct", asOf: "2025-12-31", verified: null }, horizon: "Terminal year", fixedAssumptions: ["Current price held fixed"], consequence: "Review the price-implied margin." },
      { id: "guided-quarter-revenue", metric: "Management revenue guidance", comparator: "below", threshold: { value: 50, unit: "USD", source: "filing.guidance-low", asOf: "2026-06-30", verified: null }, horizon: "Next reported quarter", fixedAssumptions: ["Same reported quarter"], consequence: "Review management guidance." },
      { id: "operating-checkpoint", metric: "Operating revenue", comparator: "below", threshold: { value: 60, unit: "USD", source: "computed.projections.revenue", asOf: "2025-12-31", verified: null }, horizon: "Explicit model year", fixedAssumptions: ["Operating model"], consequence: "Review operating assumptions." },
    ];
    if (mode === "current") report.valuation.marketValueScope!.priceAsOf = "2025-12-31";
    if (mode === "unestablished") Object.assign(report.valuation.dcf.bridge!, { valuationDate: "2026-07-20", rollForwardFactor: 1.1 });
    const before = JSON.stringify(report), view = withValuationUseSafety(report);
    if (mode === "current") {
      expect(view.scenarioPresentation).toEqual(report.scenarioPresentation); expect(view.thesisTriggers).toEqual(report.thesisTriggers);
    } else {
      expect(view.scenarioPresentation?.sensitivity).toMatchObject({ status: "unavailable", minPerShare: 40, maxPerShare: 60 });
      expect(view.thesisTriggers?.map(trigger => trigger.id)).toEqual(["guided-quarter-revenue", "operating-checkpoint"]);
      expect(view.fairValue?.auditValuation?.scenarioPresentation).toEqual(report.scenarioPresentation);
      expect(view.fairValue?.auditValuation?.thesisTriggers).toEqual(report.thesisTriggers);
      const parsed = ReportSchema.parse(view);
      expect(parsed.fairValue?.auditValuation?.scenarioPresentation).toEqual(report.scenarioPresentation);
      for (const text of [reportToMarkdown(report), reportToPrintBody(report)]) {
        expect(text).not.toContain("every valid cell of the grid remains below the current price");
        expect(text).not.toContain("Review at the price-implied threshold.");
        expect(text).toContain("Review management guidance.");
      }
      expect(reportToAuditMarkdown(report)).toContain("every valid cell of the grid remains below the current price");
    }
    expect(JSON.stringify(report)).toBe(before); expect(withValuationUseSafety(view)).toEqual(view);
    expect(view.valuation.dcf.sensitivityGrid).toEqual(report.valuation.dcf.sensitivityGrid);
  });
  it("explains a legacy numeric model whose current-use authority was never recorded", () => {
    const report = legacy();
    delete report.fairValue;
    const before = JSON.stringify(report), view = withValuationUseSafety(report);
    expect(view.fairValue?.reasons).toContainEqual({ field: "valuation.currentUse", severity: "warn",
      reason: "Current valuation use withheld by the existing financial or model evidence requirements." });
    for (const output of [reportToMarkdown(report), reportToPrintBody(report)]) {
      expect(output).toContain("Current valuation use withheld by the existing financial or model evidence requirements.");
    }
    expect(JSON.stringify(report)).toBe(before);
    expect(withValuationUseSafety(view)).toEqual(view);
  });
  it("dates the citable current model figure from the value date rather than payload build time", () => {
    const bundle = completeCurrencyBundle({});
    if (!bundle.quote.ok) throw Error("fixture quote");
    bundle.quote.value.data.rows[0]!.timestamp = Date.parse("2026-07-05T20:00:00Z") / 1000;
    const computed = runStageB(bundle), payload = assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] });
    expect(computed.fairValue.currentUse?.status).toBe("current");
    const figure = payload.computed.find(s => s.title === "Valuation (computed)")!.figures.find(f => f.label === "DCF per share")!;
    expect(figure.asOf).toBe("2026-07-05");
    expect(payload.provenanceRegistry!.find(r => r.id === figure.provenanceId)?.asOf).toBe("2026-07-05");
  });
  it("moves a supported old value into a separately dated reference, without rewriting stored scores or bytes", () => {
    const source = legacy(), before = JSON.stringify(source), view = withValuationUseSafety(source);
    expect(view.fairValue?.status).toBe("dated-reference");
    expect(keyDataRows(view).some(row => row.label === "Dated reference model value" && row.note?.includes("2026-07-20"))).toBe(true);
    expect(view.fairValue?.reference).toMatchObject({ valuationDate: "2025-12-31", quoteDate: "2026-07-20", perShare: { value: 123.45, asOf: "2025-12-31" } });
    expect(view.valuation.dcf.perShare).toBeNull(); expect(view.valuation.dcf.upsidePct).toBeNull();
    expect(view.valuation.reverseDcf.impliedValue).toBeNull();
    expect(view.scenarioTargets?.targets ?? []).toEqual([]);
    expect(view.valuation.scenarios.every(s => s.priceTarget === null)).toBe(true);
    expect(view.fairValue?.auditValuation?.scenarios).toEqual(source.valuation.scenarios);
    expect(view.fairValue?.auditValuation?.reverseDcf).toEqual(source.valuation.reverseDcf);
    expect(view.scores?.composite).toEqual(source.scores?.composite);
    expect(JSON.stringify(source)).toBe(before); expect(withValuationUseSafety(view)).toEqual(view);
  });
  it.each(["quote", "bridge", "future", "roll"] as const)("does not certify unavailable or contradictory %s timing", missing => {
    const report = legacy();
    if (missing === "quote") delete report.valuation.marketValueScope;
    if (missing === "bridge") delete report.valuation.dcf.bridge;
    if (missing === "future") report.valuation.dcf.bridge!.asOf = "2027-01-01";
    if (missing === "roll") Object.assign(report.valuation.dcf.bridge!, { valuationDate: "2026-07-20", rollForwardFactor: -1 });
    const view = withValuationUseSafety(report);
    expect(view.fairValue?.currentUse?.status).toBe("unestablished");
    expect(view.fairValue?.reference).toBeUndefined(); expect(view.fairValue?.perShare).toBeNull();
  });
  it("does not reopen an existing financial refusal as a historical reference", () => {
    const report = legacy(); report.fairValue!.status = "outside-domain"; report.fairValue!.perShare = null;
    const view = withValuationUseSafety(report);
    expect(view.fairValue?.status).toBe("outside-domain"); expect(view.fairValue?.reference).toBeUndefined();
    expect(view.fairValue?.currentUse?.reason).toBe("model-unavailable");
  });
  it("keeps a proved same-day unrolled legacy model current, while grade qualification remains unknown", () => {
    const report = legacy(); report.valuation.marketValueScope!.priceAsOf = "2025-12-31";
    const view = withValuationUseSafety(report);
    expect(view.fairValue?.currentUse?.status).toBe("current"); expect(view.fairValue?.perShare?.asOf).toBe("2025-12-31");
    expect(view.scores?.qualification?.composite.status).toBe("unknown");
  });
  it("shows visible qualification in the actual grade chips and scorecard", () => {
    const report = legacy(), scores = report.scores!;
    for (const key of ScoreAspectSchema.options) Object.assign(scores.aspects[key], { score: 75, band: "B", dataCompleteness: 1, applicableCompleteness: 1, signals: [] });
    scores.composite.score = 75; scores.composite.band = "B";
    report.scores = withAssessmentQualification(scores, { valuationUse: unavailableValuationUseFixture, financialEvidence: [] });
    const view = applyReportAssessmentStatus(report);
    const chip = renderToStaticMarkup(createElement(HeadlineGrade, { block: { ...view.valuation.graded, grade: "B" }, aspect: view.scores!.aspects.valuation }));
    expect(chip.replace(/ title="[^"]*"/g, "")).toContain("Provisional");
    expect(scorecardTable(view.scores!).rows.find(row => row[0] === "Valuation")?.[2]).toBe("B — Provisional");
    const scorecard = renderToStaticMarkup(createElement(CompositeScorecard, { scores: view.scores! }));
    expect(scorecard.replace(/ title="[^"]*"/g, "")).toContain("Provisional");
  });
  it("presents the same dated-reference limit on live, Markdown, print and audit surfaces", () => {
    const report = legacy(), before = JSON.stringify(report);
    for (const text of [renderToStaticMarkup(createElement(ReportView, { report })), reportToMarkdown(report), reportToPrintBody(report)]) {
      expect(text).toContain("Model value at 2025-12-31");
      expect(text).toContain("not a current fair value");
      expect(text).toContain("2026-07-20");
    }
    // Generation/audit deliberately retain the original diagnostic wording.
    expect(reportToAuditMarkdown(report)).toContain("Dated reference value");
    expect(JSON.stringify(report)).toBe(before);
  });
  it("registers reference values separately and binds the same qualification on the data-only path", () => {
    const bundle = completeCurrencyBundle({});
    if (!bundle.quote.ok) throw Error("fixture quote");
    bundle.builtAt = "2026-11-05T22:00:00Z"; bundle.quote.value.data.rows[0]!.timestamp = Date.parse("2026-11-04T20:00:00Z") / 1000;
    const computed = runStageB(bundle), validation = { checks: [], flags: [], gaps: [] };
    expect(computed.fairValue.status).toBe("dated-reference");
    const payload = assembleContextPayload(bundle, computed, validation);
    const serialized = JSON.stringify(payload);
    expect(serialized.includes("computed.fairValue.reference.perShare")).toBe(true);
    expect(serialized.includes("Dated reference value")).toBe(true);
    const report = buildDataOnlyReport({ symbol: bundle.symbol, companyName: "Synthetic", generatedAt: bundle.builtAt,
      model: "none", costUsd: 0, bundle, validation, computed, costBreakdown: [], reason: "Offline policy regression" });
    expect(report.verdict.gradeStrip.valuation.qualification).toEqual(computed.scores.qualification?.aspects.valuation);
    expect(report.valuation.graded.qualification).toEqual(computed.scores.qualification?.aspects.valuation);
  });
});
