import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompositeScorecard } from "@/components/report/sections";
import { ReportView } from "@/components/report/ReportView";
import { scoreAuditTables } from "@/report/auditTables";
import { reportToAuditMarkdown, reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import type { Scoring, ScoreSignal } from "@/report/schema";
import { computeScores, type ScoringInputs } from "@/pipeline/stageB/grading";
import { describeScoreEvidence } from "@/pipeline/stageB/scoringEvidence";
import { metricPolicy } from "@/pipeline/stageB/sectorRouting";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";

const heading = "Factor contribution sensitivity";
function signal(id: string, family: string, transformedScore: number, weight: number): ScoreSignal {
  return { id, family, raw: 10, unit: "%", transformedScore, signalWeight: 1, evidenceFraction: 1,
    effectiveCompositeWeightPct: weight, contributionPoints: (transformedScore - 50) * weight / 100,
    asOf: null, period: null, startDate: null, endDate: null, windowYears: null, fallbackReason: null, operands: [] };
}
function scores(): Scoring {
  const s = loadTask28Fixture().scores!;
  delete s.assessments;
  for (const [key, aspect] of Object.entries(s.aspects)) {
    Object.assign(aspect, { score: null, band: null, dataCompleteness: 0, drivers: [], signals: [] });
    s.composite.weights[key as keyof Scoring["aspects"]] = 0;
  }
  for (const [key, entry, completeness, weight] of [
    ["quality", signal("roicVsWaccSpread", "capital-returns", 80, 40), 1, 40],
    ["balanceSheet", signal("netDebtToEbitda", "financial-strength", 30, 20), 1, 20],
    ["fundamentals", signal("revenueCagr", "growth", 70, 35), .875, 40],
  ] as const) {
    Object.assign(s.aspects[key], { score: entry.transformedScore, band: "B", dataCompleteness: completeness, signals: [entry] });
    s.composite.weights[key] = weight;
  }
  s.composite.score = 65;
  s.factorExposure = [
    { family: "capital-returns", weightPct: 40, aboveNeutralPoints: 12 },
    { family: "financial-strength", weightPct: 20, aboveNeutralPoints: -4 },
    { family: "growth", weightPct: 35, aboveNeutralPoints: 7 },
  ];
  return s;
}
const sensitivity = (s: Scoring) => scoreAuditTables(s).find(t => t.heading === heading);
function inputs(): ScoringInputs {
  const c = runStageB(completeCurrencyBundle({}), { evIncludeLeases: false });
  return { route: c.route, policy: metricPolicy(c.route), growth: c.growth, ...c.returns, capital: c.capital,
    forensics: c.forensics, technicals: c.technicals, valuation: c.valuation, currentPrice: 100, asOf: "2026-10-17" };
}

describe("factor contribution sensitivity", () => {
  it("neutralizes one family at a time without redistributing weights, assigning grades or mutating scores", () => {
    const s = scores(), before = structuredClone(s);
    const table = sensitivity(s);
    expect(table?.rows).toEqual([
      ["capital-returns", "40.00%", "12.00", "53.00"],
      ["financial-strength", "20.00%", "-4.00", "69.00"],
      ["growth", "35.00%", "7.00", "58.00"],
    ]);
    expect(table?.note).toMatch(/weights and missingness.*unchanged/i);
    expect(table?.note).toMatch(/not.*causal.*calibrated/i);
    expect(table?.headers.some(h => /grade|band/i.test(h))).toBe(false);
    expect(s).toEqual(before);
  });

  it.each(["missing-aspect", "missing-family", "family-mismatch", "contribution-mismatch", "composite-mismatch", "duplicate-family", "missingness-mismatch"])("withholds numeric sensitivities for %s evidence", problem => {
    const s = scores();
    if (problem === "missing-aspect") delete s.aspects.fundamentals.signals;
    if (problem === "missing-family") s.aspects.quality.signals![0].family = "unclassified";
    if (problem === "family-mismatch") s.factorExposure![0].weightPct = 39;
    if (problem === "contribution-mismatch") s.aspects.quality.signals![0].contributionPoints = 13;
    if (problem === "composite-mismatch") s.composite.score = 66;
    if (problem === "duplicate-family") s.factorExposure!.push({ ...s.factorExposure![0] });
    if (problem === "missingness-mismatch") s.aspects.fundamentals.dataCompleteness = 1;
    const table = sensitivity(s);
    expect(table).toBeDefined();
    expect(table?.rows[0][0]).toBe("Unavailable");
    expect(table?.note).toMatch(/reconcil|complete/i);
    expect(JSON.stringify(table)).not.toContain("53.00");
  });

  it("says unavailable for legacy evidence and renders the diagnostic on all four surfaces", () => {
    const report = loadTask28Fixture();
    expect(sensitivity(report.scores!)?.rows[0][0]).toBe("Unavailable");
    report.scores = scores();
    for (const surface of [renderToStaticMarkup(createElement(CompositeScorecard, { scores: report.scores })), reportToMarkdown(report), reportToPrintBody(report), reportToAuditMarkdown(report)]) {
      expect(surface).toContain(heading);
      expect(surface).toContain("53.00");
      expect(surface).toContain("69.00");
    }
  });

  it("accepts an actual scored bundle including its route and missingness bookkeeping", () => {
    const s = computeScores(inputs());
    const table = sensitivity(s);
    expect(table?.rows.length).toBe(s.factorExposure!.length);
    expect(table?.rows[0][0]).not.toBe("Unavailable");
  });

  it("shows admitted positive and negative family contributions with their unchanged neutralization results", () => {
    const report = loadTask28Fixture();
    report.scores = scores();
    const before = JSON.stringify(report);
    const html = renderToStaticMarkup(createElement(ReportView, { report, layout: "dossier" }));
    expect(html).toContain('aria-label="Composite factor attribution"');
    expect(html).toContain('data-contribution-points="12.00"');
    expect(html).toContain('data-contribution-points="-4.00"');
    expect(html).toContain("53.00");
    expect(html).toContain("69.00");
    expect(html).toContain("weights and missingness stay unchanged");
    expect(JSON.stringify(report)).toBe(before);
  });

  it("withholds factor bars when the canonical reconciliation is unavailable", () => {
    const report = loadTask28Fixture();
    const html = renderToStaticMarkup(createElement(ReportView, { report, layout: "dossier" }));
    expect(html).toContain('aria-label="Composite factor attribution"');
    expect(html).not.toContain("data-contribution-points=");
    expect(html).toContain("Complete signal-family weights and contributions must reconcile");
  });
});

describe("historical score evidence qualifications", () => {
  it("shows a longer retained CAGR by actual span without changing the selected growth score", () => {
    const i = inputs();
    i.growth.revenueCagrs = [
      { windowYears: 5, actualYears: 5, cagrPct: 23.16, startDate: "2020-12-31", endDate: "2025-12-31", startValue: 500, endValue: 1416 },
      { windowYears: 3, actualYears: 3, cagrPct: 8.09, startDate: "2022-12-31", endDate: "2025-12-31", startValue: 1121, endValue: 1416 },
      { windowYears: 10, actualYears: 6, cagrPct: 10, startDate: "2019-12-31", endDate: "2025-12-31", startValue: 800, endValue: 1416, note: "requested 10y, only 6y available" },
    ];
    const before = computeScores(i).aspects.fundamentals;
    const evidence = describeScoreEvidence(i, "fundamentals", "revenueCagr");
    expect(evidence.fallbackReason).toContain("6.00 years of available history (2019-12-31 to 2025-12-31): 10.00%");
    expect(evidence.fallbackReason).not.toMatch(/10-year|pre-pandemic|normalized/i);
    expect(evidence.operands.find(o => o.name === "longest-history start value")).toMatchObject({ value: 800, asOf: "2019-12-31", source: "computed.growth.revenueCagrs[2].startValue" });
    i.growth.revenueCagrs.pop();
    const after = computeScores(i).aspects.fundamentals;
    expect(after.score).toBe(before.score);
    expect(after.dataCompleteness).toBe(before.dataCompleteness);
  });

  it.each(["different-end", "unknown-span", "duplicate", "invalid-dates", "span-mismatch"])("omits unsupported longer context: %s", problem => {
    const i = inputs();
    const base = { windowYears: 5 as const, actualYears: 5, cagrPct: 12, startDate: "2020-12-31", endDate: "2025-12-31", startValue: 100, endValue: 176 };
    const longer = { ...base, windowYears: 10 as const, actualYears: 6 as number | null, startDate: "2019-12-31" };
    if (problem === "different-end") longer.endDate = "2024-12-31";
    if (problem === "unknown-span") longer.actualYears = null;
    if (problem === "duplicate") { longer.startDate = base.startDate; longer.actualYears = 5.1; }
    if (problem === "invalid-dates") longer.startDate = "2019-02-30";
    if (problem === "span-mismatch") longer.actualYears = 9;
    i.growth.revenueCagrs = [base, longer];
    expect(describeScoreEvidence(i, "fundamentals", "revenueCagr").fallbackReason).not.toContain("Longest retained window");
  });

  it("uses retained historical sample dates while keeping availability and current quote dates distinct", () => {
    const i = inputs();
    if (i.valuation.kind !== "dcf") throw Error("fixture");
    i.valuation.multiples.asOf.quote = "2026-07-01";
    i.valuation.multiples.multiples = [{ key: "peTtm", current: 14, basis: "sample", peers: null,
      ownHistory: { percentileRank: 40, observations: 2, basis: "sample basis", p5: null, p25: null, p50: null, p75: null, p95: null,
        observationDetails: [
          { periodEnd: "2025-12-31", marketDate: "2025-12-30", value: 20, source: "raw-statements" },
          { periodEnd: "2025-09-30", marketDate: null, value: 10, source: "vendor-ratio" },
        ] } }];
    const evidence = describeScoreEvidence(i, "valuation", "peOwnHistoryRank");
    expect(evidence.period).toContain("empirical percentile rank");
    expect(evidence.period).toContain("2025-09-30 to 2025-12-31");
    expect(evidence.fallbackReason).toMatch(/publication.*availability.*not established/i);
    expect(evidence.fallbackReason).toMatch(/1.*market observation date.*unavailable/i);
    expect(evidence.operands.find(o => o.name === "historical multiple, period ending 2025-12-31")).toMatchObject({ value: 20, asOf: "2025-12-30" });
    expect(evidence.asOf).toBe("2026-07-01");
    expect(evidence.startDate).toBeNull(); expect(evidence.endDate).toBeNull();
    delete i.valuation.multiples.multiples[0].ownHistory!.observationDetails;
    expect(describeScoreEvidence(i, "valuation", "peOwnHistoryRank").fallbackReason).toMatch(/dates.*unavailable/i);
  });

  it("states the intrinsic-value limit of the same-year buyback comparison", () => {
    expect(describeScoreEvidence(inputs(), "leadership", "buybackTiming").fallbackReason).toMatch(/does not assess contemporaneous intrinsic.value discipline/i);
  });
});
