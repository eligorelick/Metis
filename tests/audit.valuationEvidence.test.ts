/**
 * Audit PGR-4 (docs/audit/2026-10-20-independent-audit-fixes.md): a valuation
 * grade resting on one own-history rank, with the excess-return signal
 * missing, was published as A on half its evidence.
 */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import { computeScores, type ScoringInputs } from "@/pipeline/stageB/grading";
import { describeScoreEvidence } from "@/pipeline/stageB/scoringEvidence";
import { metricPolicy } from "@/pipeline/stageB/sectorRouting";
import type { ValuationResult } from "@/pipeline/stageB/valuation";
import { applyReportAssessmentStatus, gradeDisplayLabel, gradeForDisplay, hasLimitedEvidence } from "@/report/assessment";
import { scoreDriverTable } from "@/report/presentation";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { task28SentinelReport } from "./helpers/task28Report";

/** An insurer whose ROE reverse solve is missing and whose P/TBV history fell back to P/B. */
function insurerInputs(reverseSolve: { impliedCurrentRoePct: number; notes: string[] } | null): ScoringInputs {
  const c = runStageB(completeCurrencyBundle({}), { evIncludeLeases: false });
  const route = { ...c.route, base: "insurer" as const };
  const valuation = {
    kind: "excess-return",
    route: "insurer",
    excessReturn: { roePathPct: { value: [30, 25], basis: "" }, costOfEquityPct: { value: 9, basis: "" }, reverseSolve },
    multiples: {
      multiples: [{ key: "priceToBook", current: 3.7, basis: "", peers: null,
        ownHistory: { percentileRank: 10.65, p5: null, p25: null, p50: null, p75: null, p95: null, observations: 19, basis: "" } }],
      sectorAppropriate: [], asOf: { quote: null, statements: null }, notes: [], gaps: [],
    },
    notes: [],
    gaps: [],
  } as unknown as ValuationResult;
  return { route, policy: metricPolicy(route), growth: c.growth, ...c.returns, capital: c.capital, forensics: c.forensics,
    technicals: c.technicals, valuation, financialMetrics: c.financialMetrics, currentPrice: 219.11, asOf: "2026-10-19" };
}

describe("a valuation grade needs corroborating evidence (audit PGR-4)", () => {
  it("withholds the letter when one own-history rank carries half the evidence", () => {
    const scores = computeScores(insurerInputs(null));
    const valuation = scores.aspects.valuation;
    expect(valuation.signals?.map((signal) => signal.id)).toEqual(["priceToTbvOwnHistoryRank"]);
    expect(valuation.dataCompleteness).toBe(0.5);
    expect(valuation.band).toBe("A");
    expect(hasLimitedEvidence(valuation)).toBe(true);

    const report = task28SentinelReport();
    report.scores = scores;
    report.valuation.graded.grade = "A";
    report.verdict.gradeStrip.valuation.grade = "A";
    const shown = applyReportAssessmentStatus(report);
    expect(gradeForDisplay(shown.valuation.graded)).toBeNull();
    expect(gradeForDisplay(shown.verdict.gradeStrip.valuation)).toBeNull();
    expect(gradeDisplayLabel(shown.valuation.graded, valuation)).toBe(`Not assessed — limited evidence (score ${Math.round(valuation.score!)}/100 on one signal, 50% of signals)`);
  });

  it("keeps the letter when both excess-return signals score", () => {
    const valuation = computeScores(insurerInputs({ impliedCurrentRoePct: 24, notes: [] })).aspects.valuation;
    expect(valuation.signals).toHaveLength(2);
    expect(hasLimitedEvidence(valuation)).toBe(false);
  });

  it("names a P/TBV rank that fell back to P/B as a P/B rank", () => {
    const i = insurerInputs(null);
    const evidence = describeScoreEvidence(i, "valuation", "priceToTbvOwnHistoryRank");
    expect(evidence.fallbackReason).toContain("P/TBV history comparison unavailable; using P/B own-history rank");
    const scores = computeScores(i);
    const table = scoreDriverTable(scores);
    const row = table?.rows.find((candidate) => candidate[0] === "Valuation");
    expect(row?.[1]).toBe("P/B own-history rank");
  });
});
