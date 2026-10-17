import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { computeScores, type ScoringInputs } from "@/pipeline/stageB/grading";
import { describeScoreEvidence } from "@/pipeline/stageB/scoringEvidence";
import { metricPolicy } from "@/pipeline/stageB/sectorRouting";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { applyReportAssessmentStatus, gradeDisplayLabel, gradeForDisplay } from "@/report/assessment";
import { task28SentinelReport } from "./helpers/task28Report";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";

function inputs(): ScoringInputs {
  const c = runStageB(completeCurrencyBundle({}), { evIncludeLeases: false });
  return { route: c.route, policy: metricPolicy(c.route), growth: c.growth, ...c.returns,
    capital: c.capital, forensics: c.forensics, technicals: c.technicals,
    valuation: c.valuation, financialMetrics: c.financialMetrics, currentPrice: 100, asOf: "2026-10-17" };
}

describe("score freshness and historical growth context", () => {
  it("excludes a years-old gross margin from current moat evidence without hiding the historical series", () => {
    const i = inputs();
    i.growth.asOf = "2025-12-31";
    i.growth.margins.gross.series = [{ date: "2019-12-31", pct: 90 }, { date: "2025-12-31", pct: null }];
    const result = computeScores(i);
    expect(result.aspects.moat.signals?.some(s => s.id === "grossMarginLevel")).toBe(false);
    expect(result.aspects.moat.dataCompleteness).toBe(.75);
    expect(result.aspects.moat.note).toMatch(/2019-12-31.*withheld.*annual reporting cycle/i);
    expect(i.growth.margins.gross.series[0].pct).toBe(90);
  });

  it("allows a preceding annual cycle and withholds future or undated margin observations", () => {
    const i = inputs();
    i.growth.asOf = "2025-12-31";
    i.growth.margins.gross.series = [{ date: "2024-12-31", pct: 80 }, { date: "2025-12-31", pct: null }];
    expect(computeScores(i).aspects.moat.signals?.find(s => s.id === "grossMarginLevel")?.raw).toBe(80);
    for (const date of ["2026-12-31", "unknown"]) {
      i.growth.margins.gross.series = [{ date, pct: 90 }];
      expect(computeScores(i).aspects.moat.signals?.some(s => s.id === "grossMarginLevel")).toBe(false);
    }
  });

  it("discloses five-year versus three-year window sensitivity without inventing normalized growth", () => {
    const i = inputs();
    i.growth.revenueCagrs = [
      { windowYears: 5, actualYears: 5, cagrPct: 23.16, startDate: "2020-12-31", endDate: "2025-12-31", startValue: 500, endValue: 1416 },
      { windowYears: 3, actualYears: 3, cagrPct: 8.09, startDate: "2022-12-31", endDate: "2025-12-31", startValue: 1121, endValue: 1416 },
    ];
    const result = computeScores(i);
    const evidence = describeScoreEvidence(i, "fundamentals", "revenueCagr");
    expect(result.aspects.fundamentals.signals?.find(s => s.id === "revenueCagr")?.raw).toBe(23.16);
    expect(evidence.fallbackReason).toMatch(/historical.*5-year.*23.16.*3-year.*8.09.*15.07/i);
    expect(evidence.fallbackReason).toMatch(/recovery|base effects/i);
    expect(evidence.fallbackReason).toMatch(/not.*durable.*forecast/i);
    expect(evidence.operands.find(o => o.name === "3-year historical CAGR")).toMatchObject({ value: 8.09, asOf: "2025-12-31", source: "computed.growth.revenueCagrs[1].cagrPct" });
  });

  it("does not compare historical growth windows ending in different fiscal periods", () => {
    const i = inputs();
    i.growth.revenueCagrs = [
      { windowYears: 5, actualYears: 5, cagrPct: 23, startDate: "2020-12-31", endDate: "2025-12-31", startValue: 500, endValue: 1416 },
      { windowYears: 3, actualYears: 3, cagrPct: 8, startDate: "2021-12-31", endDate: "2024-12-31", startValue: 1121, endValue: 1416 },
    ];
    const result = describeScoreEvidence(i, "fundamentals", "revenueCagr");
    expect(result.fallbackReason).not.toContain("versus 3-year");
    expect(result.operands.some(o => o.name === "3-year historical CAGR")).toBe(false);
  });

  it("withholds an A valuation headline supported only by the 30% historical-multiple signal", () => {
    const i = inputs();
    if (i.valuation.kind !== "dcf") throw Error("DCF fixture");
    i.valuation.dcf = null; i.valuation.reverseDcf = null;
    i.valuation.multiples.multiples = [{ key: "peTtm", current: 14, basis: "historical sample", peers: null,
      ownHistory: { percentileRank: 6, observations: 18, basis: "sample", p5: null, p25: null, p50: null, p75: null, p95: null } }];
    const scores = computeScores(i);
    expect(scores.aspects.valuation).toMatchObject({ score: 88, band: "A", dataCompleteness: .3 });
    const report = task28SentinelReport();
    report.scores = scores;
    report.valuation.graded.grade = "A"; report.verdict.gradeStrip.valuation.grade = "A";
    const safe = applyReportAssessmentStatus(report);
    expect(gradeForDisplay(safe.valuation.graded)).toBeNull();
    const label = "Not assessed — limited evidence (score 88/100 on 30% of signals)";
    expect(gradeDisplayLabel(safe.valuation.graded, scores.aspects.valuation)).toBe(label);
    expect(reportToMarkdown(safe)).toContain(label);
    expect(reportToPrintBody(safe)).toContain(label);
    expect(safe.scores?.composite).toEqual(scores.composite);
  });
});
