/**
 * Audit 2026-10-22 F-21: the header counted validated, unverified,
 * contradicted and qualitative claims, but no bullet said which it was. Each
 * factual claim now carries its status after its citation, and the header's
 * counts are the counts of marked claims: the grade strip's reasoning claims,
 * which no surface prints, are logged but not counted.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReportView } from "@/components/report/ReportView";
import { reportToAuditMarkdown, reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { provenanceHeadline, trustHeadline, trustRows } from "@/report/presentation";
import { ReportSchema, type Report, type VerificationLogEntry } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";
import { reasoningClaims } from "@/report/presentation";

type Status = NonNullable<VerificationLogEntry["validationStatus"]>;

function entry(report: Report, path: string, status: Status, kind: "factual-claim" | "judgment" = "factual-claim"): VerificationLogEntry {
  const node = path.split(/\.|\[|\]/).filter(Boolean).reduce<unknown>((n, key) => (n as Record<string, unknown>)[key], report) as { text: string };
  return {
    claim: node.text, outcome: "unverified", note: `[unverified] ${status}`, path, evidenceKind: kind, source: "edgar:10-K",
    reason: status === "contradicted" ? "value-mismatch" : "supported", validationStatus: status, traceKind: "source-cited",
    claimSupportStatus: status === "validated" ? "numeric-only" : status === "contradicted" ? "contradicted" : "cited",
  };
}

function markedReport(): Report {
  const r = loadTask28Fixture();
  r.fundamentals.commentary[0].label = "FACT";
  reasoningClaims(r.catalystsRisks.catalysts[0].reasoning)[0]!.label = "FACT";
  r.fundamentals.graded.reasoning[0].label = "FACT";
  r.appendix.verificationLog = [
    entry(r, "verdict.executiveSummary[1]", "validated"),
    entry(r, "fundamentals.commentary[0]", "cited"),
    entry(r, "catalystsRisks.catalysts[0].reasoning", "unchecked"),
    entry(r, "fundamentals.graded.reasoning[0]", "contradicted"),
    entry(r, "verdict.executiveSummary[2]", "cited", "judgment"),
    // Verified and logged, but the grade strip prints only the grade and its one-line why.
    entry(r, "verdict.gradeStrip.fundamentals.reasoning[1]", "validated"),
  ];
  const coverage = {
    numeric: { supported: 9, total: 10, rate: 0.9 },
    factualClaims: { supported: 5, total: 5, rate: 1 },
    judgments: { cited: 1, total: 1, rate: 1 },
    factualValidation: { cited: 5, validated: 2, unchecked: 2, contradicted: 1, qualitative: 1, total: 5, rate: 0.4 },
  };
  r.meta.provenanceCoverage = coverage;
  r.appendix.provenanceCoverage = coverage;
  return ReportSchema.parse(r);
}

// D-282: "unverified" and "qualitative" both read "not confirmed"; a FACT or ESTIMATE the log has no entry for reads the same.
const MARKS = ["validated", "not confirmed", "contradicted"] as const;
const EXPECTED = { validated: 1, contradicted: 1 };

function tally(text: string, pattern: (mark: string) => RegExp): Record<string, number> {
  return Object.fromEntries(MARKS.map((mark) => [mark, text.match(pattern(mark))?.length ?? 0]));
}

/** The logged validated and contradicted claims exactly; every other factual claim reads "not confirmed" (D-282). */
function expectMarks(counts: Record<string, number>): number {
  const { ["not confirmed"]: notConfirmed, ...rest } = counts;
  expect(rest).toEqual(EXPECTED);
  // The logged cited and unchecked claims, plus any FACT/ESTIMATE without an entry of its own.
  expect(notConfirmed).toBeGreaterThanOrEqual(2);
  return notConfirmed!;
}

describe("per-claim validation marks (audit 2026-10-22 F-21)", () => {
  it("counts only printed claims, so the header equals the marked bullets", () => {
    const r = markedReport();
    const log = r.appendix.verificationLog;
    expect(trustHeadline(r.meta.provenanceCoverage, log)).toBe(
      "1 recorded numerical match; numeric-claim denominator unknown: uncited or contradicted claims do not have a complete numeric/qualitative split; 1 contradicted; 1 qualitative claims cited, not machine-checkable");
    expect(provenanceHeadline(r.meta.provenanceCoverage, log)).toContain("4/4 factual claims carry a citation");
    expect(trustRows(r.meta.provenanceCoverage, log).find((row) => row.label === "Judgments carrying a citation")?.value).toBe("1/1 (100.0%)");
    expect(reportToAuditMarkdown(r)).toContain("1 grade-strip reasoning claim, which no report surface prints, is listed in the verification log but not counted.");
  });

  it("does not subtract an earnings-guard audit entry, which no count includes (review of F-21)", () => {
    const r = markedReport();
    const before = trustHeadline(r.meta.provenanceCoverage, r.appendix.verificationLog);
    const guard: VerificationLogEntry = {
      claim: "See the earnings bridge below.", outcome: "removed", reason: "unsupported-report-reference", validationStatus: "unchecked",
      claimSupportStatus: "unreviewed", evidenceKind: "factual-claim", path: "verdict.gradeStrip.fundamentals.reasoning[0]", source: "edgar:10-K", note: "withheld",
    };
    r.appendix.verificationLog = [...r.appendix.verificationLog!, guard];
    expect(trustHeadline(r.meta.provenanceCoverage, r.appendix.verificationLog)).toBe(before);
    expect(provenanceHeadline(r.meta.provenanceCoverage, r.appendix.verificationLog)).toContain("4/4 factual claims carry a citation");
  });

  it("marks no claim from a removed entry (review of F-21)", () => {
    const r = markedReport();
    r.appendix.verificationLog = r.appendix.verificationLog!.map((row) => row.path === "fundamentals.commentary[0]" ? { ...row, outcome: "removed" as const } : row);
    // D-282: the claim is still marked, but only "not confirmed" (no check entry), never its removed entry's status.
    const md = reportToMarkdown(r);
    expect(md).toContain(r.fundamentals.commentary[0]!.text);
    expect(md).not.toMatch(/\[qualitative\]/);
  });

  it("marks each factual bullet after its citation in Markdown", () => {
    const md = reportToMarkdown(markedReport());
    // Bullets end "_(citation)_ [mark]"; a table cell escapes the brackets.
    expectMarks(tally(md, (mark) => new RegExp(`\\)_ \\[${mark}\\]$|\\\\\\[${mark}\\\\\\] \\|`, "gm")));
  });

  it("marks each factual bullet after its citation in print", () => {
    const html = reportToPrintBody(markedReport());
    expectMarks(tally(html, (mark) => new RegExp(`</span> <span class="claim-status">\\[${mark}\\]</span>|\\[${mark}\\]</td>`, "g")));
  });

  it("marks each factual claim in the dossier layout and leaves judgments unmarked", () => {
    const html = renderToStaticMarkup(createElement(ReportView, { report: markedReport() }));
    expectMarks(tally(html, (mark) => new RegExp(`class="claim-status[^"]*">\\[${mark}\\]<`, "g")));
  });

  it("marks nothing when no verification pass logged the claims", () => {
    const r = loadTask28Fixture();
    r.appendix.verificationLog = [];
    expect(renderToStaticMarkup(createElement(ReportView, { report: r }))).not.toContain("claim-status");
    expect(reportToPrintBody(r)).not.toContain("claim-status");
    expect(reportToMarkdown(r)).not.toMatch(/\)_ \[(validated|not confirmed|unverified|contradicted|qualitative)\]/);
  });

  it("D-282: prints the same number of not-confirmed marks on every surface and no old status word", () => {
    const md = reportToMarkdown(markedReport());
    const print = reportToPrintBody(markedReport());
    const web = renderToStaticMarkup(createElement(ReportView, { report: markedReport() }));
    // Statement marks only (a table cell's mark may also be a paragraph's or a figure's): the same on print and web.
    const printMarks = expectMarks(tally(print, (mark) => new RegExp(`</span> <span class="claim-status">\\[${mark}\\]</span>`, "g")));
    expect(expectMarks(tally(md, (mark) => new RegExp(`\\)_ \\[${mark}\\]$`, "gm")))).toBeGreaterThanOrEqual(2);
    expect(printMarks).toBeGreaterThanOrEqual(2);
    expectMarks(tally(web, (mark) => new RegExp(`class="claim-status[^"]*">\\[${mark}\\]<`, "g")));
    for (const text of [md, print, web]) expect(text).not.toMatch(/\[(?:unverified|qualitative)\]/);
  });
});
