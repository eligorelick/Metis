/**
 * Audit 2026-10-22 F-19: the composite letter had no evidence floor, and the
 * neutral prior itself graded D. TSM printed "D (51/100)" on 5% evidence,
 * its one scored aspect a technicals B; a technicals score of 50.4 printed as
 * D, and the judge read it as weak momentum.
 */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import { scoreToBand } from "@/pipeline/stageB/grading";
import { assembleContextPayload, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import { compositeDisplay, gradeDisplayLabel } from "@/report/assessment";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { keyDataRows, scorecardTable } from "@/report/presentation";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { task28SentinelReport } from "./helpers/task28Report";

function reportWith(evidence: number, technicals: number) {
  const report = task28SentinelReport();
  const scores = report.scores!;
  const composite = 50 + (technicals - 50) * evidence;
  scores.composite = { ...scores.composite, score: composite, band: scoreToBand(composite) };
  scores.aspects.technicals = { ...scores.aspects.technicals, score: technicals, band: scoreToBand(technicals), dataCompleteness: 1 };
  scores.assessments = {
    businessQuality: { score: null, band: null, basis: "" },
    valuation: { score: null, band: null, basis: "" },
    evidenceCompleteness: evidence,
    calibration: "unbacktested-house-rules",
  };
  return report;
}

describe("the composite carries the aspects' evidence floor (audit 2026-10-22 F-19)", () => {
  it("prints no letter below 50% of route-applicable evidence, and shows the score and the evidence share", () => {
    const row = keyDataRows(reportWith(0.05, 76)).find((r) => r.label === "Composite grade")!;
    expect(row.value).toBe("Not graded: evidence 5% (score 51/100)");
    expect(row.value).not.toMatch(/\b[A-F]\b/);
    expect(row.note).toMatch(/evidence for 5% of the route-applicable signal weight/);
    expect(row.note).toMatch(/A ≥85, B ≥70, C ≥55, D ≥40, F below 40; 45–55 neutral/);
  });

  it("withholds the composite letter in the markdown and print exports too", () => {
    const report = reportWith(0.05, 76);
    expect(reportToMarkdown(report)).toContain("**Composite: 51 / 100 (Not graded: evidence 5%)**");
    const body = reportToPrintBody(report);
    expect(body).toMatch(/Composite: <strong class="mono">51 \/ 100<\/strong> <span class="chip g-unavailable">Not graded: evidence 5%<\/span>/);
    expect(body).toContain("evidence for 5% of the route-applicable signal weight");
  });

  it("keeps the letter at or above the floor, beside the thresholds and the evidence share", () => {
    const row = keyDataRows(reportWith(0.8, 76)).find((r) => r.label === "Composite grade")!;
    expect(row.value).toBe("B (71/100)");
    expect(row.note).toMatch(/evidence for 80%/);
  });
});

describe("a score within 45–55 is labelled neutral (audit 2026-10-22 F-19)", () => {
  it("never prints D beside a neutral score without the qualifier", () => {
    const report = reportWith(0.9, 50);
    expect(compositeDisplay(report.scores!).label).toBe("D (neutral)");
    report.verdict.gradeStrip.technicals.grade = "D";
    report.verdict.gradeStrip.technicals.assessmentStatus = "deterministic";
    expect(gradeDisplayLabel(report.verdict.gradeStrip.technicals, report.scores!.aspects.technicals)).toBe("D (neutral)");
    const card = scorecardTable(report.scores!);
    expect(card.rows.find((r) => r[0] === "Technicals")?.[2]).toBe("D (neutral)");
    // Outside the band the letter stands alone.
    expect(gradeDisplayLabel(report.verdict.gradeStrip.technicals, { ...report.scores!.aspects.technicals, score: 44.9 })).toBe("D");
    expect(compositeDisplay(reportWith(1, 55).scores!).label).toBe("C (neutral)");
    expect(compositeDisplay(reportWith(1, 55.4).scores!).label).toBe("C");
    expect(compositeDisplay(reportWith(0.9, 62).scores!).label).toBe("C");
  });

  it("labels a neutral score neutral in the judge payload", () => {
    const bundle = completeCurrencyBundle({});
    const computed = runStageB(bundle);
    computed.scores.aspects.technicals = { ...computed.scores.aspects.technicals, score: 50, band: "D" };
    const prompt = serializePayloadForPrompt(assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] }));
    expect(prompt).toMatch(/technicals score[^\n]*0-100 \(grade D, neutral 45–55\)/);
  });
});
