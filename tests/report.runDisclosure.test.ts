/**
 * AMZN audit 2026-10-20 findings 12 and 17: the human report states what the
 * audit export states. A plan-allowance pass that used only the supplied
 * evidence says so in the report header and run details, and a figure the
 * verification log marks contradicted is counted in the header.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReportView } from "@/components/report/ReportView";
import { reportToAuditMarkdown, reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { buildExecutionMetadataEntry, failedPassNote } from "@/report/execution";
import { evidenceScopeSummary, trustHeadline, trustRows } from "@/report/presentation";
import type { Report } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";

function planReport(): Report {
  const r = loadTask28Fixture();
  r.meta.execution = (["bull", "bear", "synthesize"] as const).map((step) => buildExecutionMetadataEntry({
    step, requestedModel: "chatgpt/gpt-6.1-sol", effectiveModel: "chatgpt/gpt-6.1-sol", requestedEffort: "xhigh", fallbackUsed: false,
    usage: { input_tokens: 1000, output_tokens: 100 },
  }));
  r.meta.execution.push({ step: "verify", requestedModel: "deterministic", effectiveModel: "deterministic", requestedEffort: null, effectiveEffort: null, fallbackUsed: false, adjustments: [] });
  return r;
}

const SCOPE = "bull, bear and judge used only the supplied evidence (payload-only; no web search)";

describe("payload-only evidence disclosure (AMZN audit 2026-10-20 finding 17)", () => {
  it("is derived from the same execution entries that carry the audit export's per-pass note", () => {
    const r = planReport();
    expect(r.meta.execution?.[0].note).toContain("without additional web search");
    expect(evidenceScopeSummary(r)).toBe(SCOPE);
  });

  it("appears in the report header and run details, and in the print header", () => {
    const r = planReport();
    const markdown = reportToMarkdown(r);
    expect(markdown.slice(0, markdown.indexOf("### Key data"))).toContain(`| Evidence | ${SCOPE} |`);
    const run = markdown.slice(markdown.indexOf("### Run details"));
    expect(run.slice(0, run.indexOf("### Verification"))).toContain(`| Evidence | ${SCOPE} |`);
    const print = reportToPrintBody(r);
    const header = print.slice(0, print.indexOf("</header>"));
    expect(header).toContain("<td>Evidence</td>");
    expect(header).toContain(SCOPE);
    expect(renderToStaticMarkup(createElement(ReportView, { report: r }))).toContain(SCOPE);
  });

  // Codex review of PR #41: a data-only report after failed plan passes
  // lists the failed attempts in its run details; none of them is a pass
  // that used the supplied evidence.
  it("leaves out passes that failed or were never sent", () => {
    const r = planReport();
    const bear = r.meta.execution!.find((e) => e.step === "bear")!;
    bear.note = `${bear.note} ${failedPassNote("bear")}`;
    expect(evidenceScopeSummary(r)).toBe("bull and judge used only the supplied evidence (payload-only; no web search)");
    r.meta.execution = (["bull", "bear", "synthesize"] as const).map((step) => buildExecutionMetadataEntry({
      step, requestedModel: "chatgpt/gpt-6.1-sol", effectiveModel: "none", requestedEffort: "xhigh", fallbackUsed: false,
      rejectedReason: "the stored model id is not accepted",
    }));
    expect(evidenceScopeSummary(r)).toBeNull();
  });

  it("is absent when no pass ran on a plan allowance", () => {
    const r = loadTask28Fixture();
    r.meta.execution = [buildExecutionMetadataEntry({
      step: "bull", requestedModel: "claude-sonnet-5-5", effectiveModel: "claude-sonnet-5-5", requestedEffort: "high", fallbackUsed: false,
    })];
    expect(evidenceScopeSummary(r)).toBeNull();
    expect(reportToMarkdown(r)).not.toContain("payload-only");
  });
});

describe("contradicted count (AMZN audit 2026-10-20 finding 12)", () => {
  function contradictedFigureReport(): Report {
    const r = planReport();
    r.meta.provenanceCoverage = {
      numeric: { supported: 9, total: 10, rate: 0.9 },
      factualClaims: { supported: 4, total: 4, rate: 1 },
      judgments: { cited: 2, total: 2, rate: 1 },
      factualValidation: { cited: 4, validated: 2, unchecked: 2, contradicted: 0, qualitative: 1, total: 4, rate: 0.5 },
    };
    r.appendix.provenanceCoverage = r.meta.provenanceCoverage;
    r.appendix.verificationLog = [
      { claim: "185000 USD: annual salary", outcome: "unverified", note: "[unverified] value-mismatch", path: "leadership.graded.keyNumbers[22]", evidenceKind: "number", source: "edgar:8-K", reason: "value-mismatch", validationStatus: "contradicted" },
      { claim: "Revenue grew 11%", outcome: "verified", path: "growth.graded.reasoning[0]", evidenceKind: "factual-claim", source: "edgar:10-Q", reason: "supported", validationStatus: "validated", claimSupportStatus: "numeric-only" },
    ];
    return r;
  }

  it("counts a figure the verification log marks contradicted, as the audit export does", () => {
    const r = contradictedFigureReport();
    const coverage = r.meta.provenanceCoverage;
    const log = r.appendix.verificationLog;
    expect(trustHeadline(coverage, log)).toContain("1 contradicted (1 cited figure, 0 prose claims)");
    expect(trustRows(coverage, log).find((row) => row.label === "Claims contradicted by their cited source")?.value)
      .toBe("1 (1 cited figure, 0 prose claims)");
    expect(reportToAuditMarkdown(r).split("\n").find((line) => line.startsWith("| 185000 USD: annual salary |"))).toContain("| contradicted |");
    const markdown = reportToMarkdown(r);
    expect(markdown.slice(0, markdown.indexOf("### Key data"))).toContain("1 contradicted (1 cited figure, 0 prose claims)");
    expect(markdown).toContain("| Claims contradicted by their cited source | 1 (1 cited figure, 0 prose claims) |");
    expect(reportToAuditMarkdown(r)).toContain("| Claims contradicted by their cited source | 1 (1 cited figure, 0 prose claims) |");
    expect(reportToPrintBody(r)).toContain("1 contradicted (1 cited figure, 0 prose claims)");
    expect(renderToStaticMarkup(createElement(ReportView, { report: r }))).toContain("1 contradicted (1 cited figure, 0 prose claims)");
  });

  // Audit 2026-10-22 F-22: report #43's only contradiction was this salary
  // recorded contradicted for its unit. A unit the record does not establish
  // is a metadata gap, so a stored log reads it as unverified everywhere.
  it("reads a stored unit-mismatch figure as unverified, not contradicted", () => {
    const r = contradictedFigureReport();
    r.appendix.verificationLog![0] = { ...r.appendix.verificationLog![0], note: "[unverified] unit-mismatch", reason: "unit-mismatch" };
    const coverage = r.meta.provenanceCoverage;
    const log = r.appendix.verificationLog;
    expect(trustHeadline(coverage, log)).toContain("; 0 contradicted");
    expect(reportToAuditMarkdown(r).split("\n").find((line) => line.startsWith("| 185000 USD: annual salary |")))
      .toContain("| unchecked (recorded contradicted; period or unit not established; value not rechecked) |");
    expect(renderToStaticMarkup(createElement(ReportView, { report: r }))).toContain("0 contradicted");
  });

  // Review of F-22: a legacy claim entry recorded its support columns from the
  // same failure, so they read as its status does, never a bare contradicted.
  it("reads a stored metadata-gap claim's support columns as unverified too", () => {
    const r = contradictedFigureReport();
    r.appendix.verificationLog!.push({
      claim: "Revenue for the twelve months ended June 30 was 10.", outcome: "unverified", path: "growth.graded.reasoning[1]", evidenceKind: "factual-claim",
      source: "edgar:10-Q", reason: "period-word-mismatch", validationStatus: "contradicted", numericSupportStatus: "contradicted", claimSupportStatus: "contradicted",
    });
    const row = reportToAuditMarkdown(r).split("\n").find((line) => line.startsWith("| Revenue for the twelve months ended June 30 was 10. |"))!;
    expect(row).not.toMatch(/\| contradicted \|/);
    expect(row.split("(recorded contradicted; period or unit not established; value not rechecked)").length - 1).toBe(3);
    expect(row).toContain("| cited (recorded contradicted;");
    expect(reportToAuditMarkdown(r)).toContain("Displayed factual-claim statuses:");
    expect(reportToAuditMarkdown(r)).toContain("| Evidence class | Supported / total, as recorded |");
  });

  it("keeps the coverage count when no log is stored", () => {
    const r = contradictedFigureReport();
    expect(trustHeadline(r.meta.provenanceCoverage)).toContain("; 0 contradicted;");
  });
});
