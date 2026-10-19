import { describe, expect, it } from "vitest";
import { applyGradeOverrideContract } from "@/pipeline/stageC/gradeContract";
import { applyReportAssessmentStatus, gradeContractText, gradeForDisplay } from "@/report/assessment";
import { ReportSchema, judgeOutputToJsonSchema, type Report, type VerificationLogEntry } from "@/report/schema";
import { task28SentinelReport } from "./helpers/task28Report";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintHtml } from "@/report/export/printHtml";
import { parseStoredReportWithSafety } from "@/report/legacyEntitySafety";
import { extractGradeStrip } from "@/report/history";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GradeReasoning } from "@/components/report/primitives";

function fixture(band: "A" | "B" | "C" | "D" | "F", proposed: "A" | "B" | "C" | "D" | "F"): Report {
  const report = task28SentinelReport();
  report.scores!.aspects.fundamentals = { ...report.scores!.aspects.fundamentals, score: 80, band, dataCompleteness: 1 };
  for (const block of [report.fundamentals.graded, report.verdict.gradeStrip.fundamentals]) {
    block.grade = proposed;
    delete block.assessmentStatus;
    block.reasoning = [{ text: "The disclosed customer loss weakens durable earning power.", label: "JUDGMENT", sourceId: "filing.customer-loss", source: "filing.customer-loss", asOf: "2026-06-30" }];
  }
  return report;
}

function reason(report: Report) {
  report.fundamentals.graded.overrideRationale = { reason: "The score does not capture the disclosed customer loss.", evidenceSources: ["filing.customer-loss"] };
}

function log(report: Report): VerificationLogEntry[] {
  return [{ path: "fundamentals.graded.reasoning[0]", claim: report.fundamentals.graded.reasoning[0].text,
    outcome: "unverified", evidenceKind: "judgment", source: "filing.customer-loss", reason: "supported",
    traceKind: "source-cited", validationStatus: "cited", claimSupportStatus: "cited" }];
}

describe("versioned grade override contract", () => {
  it.each(["reason", "claim"])("rejects a known entity conflict in raw override %s before direct export", (field) => {
    const raw = fixture("B", "C"); reason(raw);
    raw.meta.symbol = "LLY";
    if (field === "reason") raw.fundamentals.graded.overrideRationale!.reason = "TRIUMPH evaluates Foundayo";
    else raw.fundamentals.graded.reasoning[0].text = "TRIUMPH evaluates Foundayo";
    raw.appendix.verificationLog = log(raw);
    const checked = applyGradeOverrideContract(raw, raw.appendix.verificationLog);
    expect(checked.fundamentals.graded.gradeContract?.reason).toBe("unadmitted-override-evidence");
    expect(gradeForDisplay(checked.fundamentals.graded)).toBeNull();
    for (const output of [reportToMarkdown(raw), reportToPrintHtml(raw)]) expect(output).toContain("unadmitted-override-evidence");
  });
  it("validates an immutable legacy stored view without relabeling its original generation", () => {
    const raw = fixture("A", "D");
    const json = JSON.stringify(raw);
    const safe = parseStoredReportWithSafety(json)!.report;
    expect(safe.fundamentals.graded.gradeContract?.reason).toBe("grade-distance-exceeded");
    expect(gradeForDisplay(safe.fundamentals.graded)).toBeNull();
    expect(safe.meta).toEqual(raw.meta);
    expect(JSON.stringify(raw)).toBe(json);
    expect(reportToMarkdown(safe)).not.toContain("Fundamentals - Grade D");
  });
  it("rejects A to D without rewriting the raw proposed letter or original band", () => {
    const raw = fixture("A", "D"); reason(raw);
    const report = applyGradeOverrideContract(raw, log(raw));
    expect(report.fundamentals.graded.grade).toBe("D");
    expect(report.fundamentals.graded.gradeContract).toMatchObject({ version: "GRADE_OVERRIDE_1", originalBand: "A", proposedGrade: "D", distance: 3, status: "rejected", reason: "grade-distance-exceeded" });
    expect(gradeForDisplay(report.fundamentals.graded)).toBeNull();
    expect(gradeForDisplay(report.verdict.gradeStrip.fundamentals)).toBeNull();
    expect(raw.fundamentals.graded.assessmentStatus).toBeUndefined();
    expect(ReportSchema.safeParse(report).success).toBe(true);
  });

  it("requires explicit rationale and admitted cited reasoning for a one-step change", () => {
    const raw = fixture("B", "C");
    expect(applyGradeOverrideContract(raw, log(raw)).fundamentals.graded.gradeContract?.reason).toBe("missing-override-rationale");
    reason(raw);
    expect(applyGradeOverrideContract(raw, []).fundamentals.graded.gradeContract?.reason).toBe("unadmitted-override-evidence");
    const accepted = applyGradeOverrideContract(raw, log(raw));
    expect(accepted.fundamentals.graded.gradeContract?.status).toBe("accepted");
    expect(gradeForDisplay(accepted.fundamentals.graded)).toBe("C");
    expect(accepted.verdict.gradeStrip.fundamentals.gradeContract).toEqual(accepted.fundamentals.graded.gradeContract);
    raw.verdict.gradeStrip.fundamentals.overrideRationale = { reason: "UNADMITTED STRIP RATIONALE", evidenceSources: ["unrelated"] };
    expect(gradeContractText(applyGradeOverrideContract(raw, log(raw)).verdict.gradeStrip.fundamentals)).not.toContain("UNADMITTED STRIP RATIONALE");
  });

  it("treats D to F as one step in the actual ordered scale", () => {
    const raw = fixture("D", "F"); reason(raw);
    expect(applyGradeOverrideContract(raw, log(raw)).fundamentals.graded.gradeContract).toMatchObject({ distance: 1, status: "accepted" });
  });

  it("rejects conflicting strip/section grades and contradicted, stale or unrelated verification entries", () => {
    const raw = fixture("B", "C"); reason(raw);
    raw.verdict.gradeStrip.fundamentals.grade = "A";
    expect(applyGradeOverrideContract(raw, log(raw)).fundamentals.graded.gradeContract?.reason).toBe("inconsistent-grade-surfaces");
    raw.verdict.gradeStrip.fundamentals.grade = "C";
    for (const entry of [
      { ...log(raw)[0], validationStatus: "contradicted" as const },
      { ...log(raw)[0], validationStatus: "unchecked" as const },
      { ...log(raw)[0], outcome: "removed" as const },
      { ...log(raw)[0], claim: "A different claim." },
      { ...log(raw)[0], path: "quality.graded.reasoning[0]" },
      { ...log(raw)[0], source: "different-source" },
    ]) expect(applyGradeOverrideContract(raw, [entry]).fundamentals.graded.gradeContract?.status).toBe("rejected");
  });

  it("does not promote missing or limited evidence and keeps same-band grades unchanged", () => {
    const raw = fixture("B", "B");
    expect(applyGradeOverrideContract(raw, []).fundamentals.graded.gradeContract?.status).toBe("unchanged");
    raw.scores!.aspects.fundamentals.dataCompleteness = 0.3;
    expect(gradeForDisplay(applyReportAssessmentStatus(applyGradeOverrideContract(raw, [])).fundamentals.graded)).toBeNull();
    raw.scores!.aspects.fundamentals.band = null;
    raw.scores!.aspects.fundamentals.score = null;
    expect(applyGradeOverrideContract(raw, []).fundamentals.graded.gradeContract?.status).toBe("unavailable");
    expect(gradeForDisplay(applyGradeOverrideContract(raw, []).fundamentals.graded)).toBeNull();
  });

  it("keeps an admitted override withheld under the independent evidence floor on every stored surface", () => {
    const raw = fixture("B", "C"); reason(raw);
    raw.scores!.aspects.fundamentals.dataCompleteness = 0.3;
    raw.appendix.verificationLog = log(raw);
    const report = parseStoredReportWithSafety(JSON.stringify(raw))!.report;
    expect(report.fundamentals.graded.gradeContract?.status).toBe("accepted");
    expect(report.fundamentals.graded.assessmentStatus).toBe("limited-evidence");
    expect(extractGradeStrip(report).find(cell => cell.key === "fundamentals")?.grade).toBeNull();
    expect(renderToStaticMarkup(createElement(GradeReasoning, { title: "Fundamentals", block: report.fundamentals.graded }))).toContain('aria-label="not assessed"');
    for (const output of [reportToMarkdown(report), reportToPrintHtml(report)]) {
      expect(output).toContain("limited evidence");
      expect(output).not.toContain("Fundamentals - Grade C");
    }
  });

  it("fails closed for a strip-only optional override and ignores forged pipeline validation", () => {
    const raw = fixture("B", "C");
    raw.scores!.aspects.balanceSheet = { ...raw.scores!.aspects.balanceSheet, score: 70, band: "B", dataCompleteness: 1 };
    raw.verdict.gradeStrip.balanceSheet = { ...raw.fundamentals.graded };
    delete raw.balanceSheet.graded;
    const result = applyGradeOverrideContract(raw, []);
    expect(result.verdict.gradeStrip.balanceSheet?.gradeContract?.reason).toBe("missing-override-rationale");
    expect(gradeForDisplay(result.verdict.gradeStrip.balanceSheet!)).toBeNull();
    delete raw.verdict.gradeStrip.balanceSheet;
    expect(applyGradeOverrideContract(raw, []).verdict.gradeStrip.balanceSheet).toBeUndefined();
  });

  it("recomputes pipeline-owned validation, is idempotent, and allows final verification after a provisional assembly", () => {
    const raw = fixture("B", "C"); reason(raw);
    const pending = applyGradeOverrideContract(raw, []);
    const accepted = applyGradeOverrideContract(pending, log(raw));
    expect(gradeForDisplay(accepted.fundamentals.graded)).toBe("C");
    expect(applyGradeOverrideContract(accepted, log(raw))).toEqual(accepted);
    expect(applyGradeOverrideContract(accepted, []).fundamentals.graded.gradeContract?.status).toBe("rejected");
  });

  it("withholds rejected letters in markdown and print and exposes the validation reason", () => {
    const raw = fixture("A", "D");
    const report = applyGradeOverrideContract(raw, []);
    const markdown = reportToMarkdown(report);
    const html = reportToPrintHtml(report);
    expect(markdown).toContain("grade-distance-exceeded");
    expect(html).toContain("grade-distance-exceeded");
    expect(markdown).not.toContain("Fundamentals - Grade D");
    expect(html).not.toContain('>D</span> <strong>Fundamentals');
  });

  it("enforces the contract even when a caller directly exports an unaudited stored object", () => {
    const raw = fixture("A", "D");
    const json = JSON.stringify(raw);
    for (const output of [reportToMarkdown(raw), reportToPrintHtml(raw)]) {
      expect(output).toContain("grade-distance-exceeded");
      expect(output).not.toContain("Fundamentals - Grade D");
    }
    expect(JSON.stringify(raw)).toBe(json);
  });

  it("permits rationale in model schema but reserves validation records for the pipeline", () => {
    const schema = JSON.stringify(judgeOutputToJsonSchema());
    expect(schema).toContain("overrideRationale");
    expect(schema).not.toContain("gradeContract");
    expect(ReportSchema.safeParse(task28SentinelReport()).success).toBe(true);
  });

  it("keeps exact citation IDs containing rating-like URL slugs while guarding rationale prose", () => {
    const raw = fixture("B", "C"); reason(raw);
    const source = "web:https://example.test/news/is-company-a-strong-buy/";
    raw.fundamentals.graded.reasoning[0].source = source;
    raw.fundamentals.graded.reasoning[0].sourceId = source;
    raw.fundamentals.graded.overrideRationale!.evidenceSources = [source];
    expect(ReportSchema.safeParse(raw).success).toBe(true);
    raw.fundamentals.graded.overrideRationale!.reason = "Strong Buy";
    expect(ReportSchema.safeParse(raw).success).toBe(false);
  });
});
