import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { assessExecutiveEvidence } from "@/report/financialDiagnostics";
import { executiveOfficeContext } from "@/report/executiveDecisions";
import { CREDIBILITY_NOT_ASSESSED_REASON, EXECUTIVE_NOT_ASSESSED_REASON } from "@/report/executiveAssessment";
import { LeadershipSection } from "@/components/report/sections";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import type { ContextPayload } from "@/pipeline/stageC/payload";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { ReportSchema, type Leadership, type ManagementAction, type SourcedClaim, type VerificationLogEntry } from "@/report/schema";

const fact = (text: string, source = "edgar:8-K", asOf = "2026-06-24"): SourcedClaim => ({ text, source, asOf, label: "FACT" });
const decision = (): ManagementAction => ({ occurredOn: "2026-06-24", actor: "board", category: "capital-allocation",
  action: [fact("On 2026-06-24 the Board authorized a USD 50 billion share repurchase program.")],
  assessment: [{ ...fact("The authorization permits capital return; it is not an executed purchase."), label: "JUDGMENT" }], shareholderAlignment: "mixed" });
const leadership = (): Leadership => ({ graded: { grade: "B", confidence: "low", oneLineWhy: "Evidence", reasoning: [], keyNumbers: [] },
  executives: [{ name: "Alex Smith", title: "Chief Executive Officer", tenureYears: null, grade: "B", credibilityGrade: "B", reasoning: [decision().action[0]!], evidence: {} }],
  managementActions: [decision()], insiderSummary: [], governanceNotes: [] });
const actionLog = (): VerificationLogEntry[] => [{ path: "leadership.managementActions[0].action[0]", claim: decision().action[0]!.text,
  source: "edgar:8-K", outcome: "unverified", validationStatus: "validated", numericSupportStatus: "validated", claimSupportStatus: "numeric-only",
  sourceSpans: [{ source: "edgar:8-K", asOf: "2026-06-24", start: 0, end: decision().action[0]!.text.length, text: decision().action[0]!.text }] },
  { path: "leadership.executives[0].reasoning[0]", claim: decision().action[0]!.text, source: "edgar:8-K", outcome: "unverified", validationStatus: "validated" },
  { path: "leadership.managementActions[0].assessment[0]", claim: decision().assessment[0]!.text, source: "edgar:8-K", outcome: "unverified", validationStatus: "cited" }];
const context = () => ({ asOf: "2026-11-03", notes: ["Alex Smith — Chief Executive Officer (since 2024-04-01) [fmp:key-executives]"], filings: [] });

describe("executive decisions bound to a validated action and dated tenure", () => {
  it("retains a proposed execution grade from a validated board decision during the CEO tenure, without inventing credibility", () => {
    const result = assessExecutiveEvidence(leadership(), actionLog(), false, context()).executives[0]!;
    expect(result).toMatchObject({ grade: "B", credibilityGrade: "not-assessed" });
    expect(result.assessmentReason).toContain("decisions and outcomes during");
    expect(result.assessmentReason).toContain("not personal skill");
  });

  it("never manufactures a letter when the judge left the decision ungraded", () => {
    const l = leadership();
    l.executives[0]!.grade = "not-assessed";
    const result = assessExecutiveEvidence(l, actionLog(), false, context()).executives[0]!;
    expect(result.grade).toBe("not-assessed");
    expect(result.assessmentReason).toContain("judge left execution ungraded");
  });

  it("preserves the existing assessment reason when the new decision rule is refused", () => {
    const l = leadership(), log = actionLog();
    log[0]!.validationStatus = "unchecked";
    expect(assessExecutiveEvidence(l, log, false, context()).executives[0]!.assessmentReason).toBe(EXECUTIVE_NOT_ASSESSED_REASON);
    expect(assessExecutiveEvidence(l, log, false, { ...context(), notes: [] }).executives[0]!.assessmentReason).toBe(EXECUTIVE_NOT_ASSESSED_REASON);
  });

  it("preserves an existing typed execution assessment when the new decision rule is refused", () => {
    const l = leadership(), log = actionLog();
    const claim = fact("Alex Smith: operating cash flow was USD 50 billion.", "payload.statements.cash-flow-quarterly.2026-06-24.operating-cash-flow");
    l.executives[0]!.evidence.capitalAllocation = [claim];
    log.push({ path: "leadership.executives[0].evidence.capitalAllocation[0]", claim: claim.text, source: claim.source, outcome: "unverified", validationStatus: "validated", executiveEvidenceKind: "execution" });
    expect(assessExecutiveEvidence(l, log, false, { ...context(), notes: [] }).executives[0]).toMatchObject({ grade: "B", credibilityGrade: "not-assessed", assessmentReason: CREDIBILITY_NOT_ASSESSED_REASON });
  });

  it.each(["title only", "pay only", "outside tenure", "rejected claim", "unchecked amount", "no tenure", "non-filing source", "company result", "wrong office"])("withholds execution for %s", (control) => {
    const l = leadership(), log = actionLog(), c = context();
    if (control === "title only" || control === "pay only") l.managementActions = [];
    if (control === "pay only") l.executives[0]!.evidence.compensation = [fact("Alex Smith: pay was USD 5 million.", "fmp:key-executives")];
    if (control === "outside tenure") c.notes = ["Alex Smith — Chief Executive Officer (since 2026-07-01) [fmp:key-executives]"];
    if (control === "rejected claim") log.push({ ...log[0]!, outcome: "unverified", check: "named-individual", reason: "named-individual-unsourced" });
    if (control === "unchecked amount") log[0]!.validationStatus = "unchecked";
    if (control === "no tenure") c.notes = ["Alex Smith — Chief Executive Officer [fmp:key-executives]"];
    if (control === "non-filing source") { l.managementActions![0]!.action[0]!.source = "fmp:news"; log[0]!.source = "fmp:news"; }
    if (control === "company result") {
      l.managementActions = [];
      const claim = fact("Alex Smith: operating cash flow was USD 50 billion.", "payload.statements.cash-flow-quarterly.2026-06-24.operating-cash-flow");
      l.executives[0]!.evidence.capitalAllocation = [claim];
      log.push({ path: "leadership.executives[0].evidence.capitalAllocation[0]", claim: claim.text, source: claim.source, outcome: "unverified", validationStatus: "validated" });
    }
    if (control === "wrong office") l.executives[0]!.title = "CEO of Consumer Banking";
    const e = assessExecutiveEvidence(l, log, false, c).executives[0]!;
    expect(e).toMatchObject({ grade: "not-assessed", credibilityGrade: "not-assessed" });
    expect(e.assessmentReason).toBe(EXECUTIVE_NOT_ASSESSED_REASON);
  });

  it("does not admit a dated action with an additional rejected or unchecked factual clause", () => {
    const l = leadership();
    l.managementActions![0]!.action.push(fact("The program guarantees a 20% return."));
    expect(assessExecutiveEvidence(l, actionLog(), false, context()).executives[0]!.grade).toBe("not-assessed");
  });

  it("does not retain an unrelated proposed grade just because a validated board action exists elsewhere", () => {
    const l = leadership();
    l.executives[0]!.reasoning = [];
    expect(assessExecutiveEvidence(l, actionLog(), false, context()).executives[0]!.grade).toBe("not-assessed");
  });

  it("preserves a completed authorization's suspension qualification instead of treating it as a proposed decision", () => {
    const l = leadership(), log = actionLog();
    const text = "On 2026-06-24 the Board authorized a USD 50 billion share repurchase program, which may be suspended.";
    l.managementActions![0]!.action[0]!.text = text;
    l.executives[0]!.reasoning[0]!.text = text;
    log[0]!.claim = text;
    log[0]!.sourceSpans![0]!.text = text;
    log[0]!.sourceSpans![0]!.end = text.length;
    log[1]!.claim = text;
    expect(assessExecutiveEvidence(l, log, false, context()).executives[0]!.grade).toBe("B");
  });

  it("keeps guidance without a later actual unassessed", () => {
    const l = leadership();
    l.managementActions![0] = { ...decision(), actor: "ceo", category: "guidance", action: [fact("Management guided revenue of USD 50 billion for 2026.")] };
    const log = [{ ...actionLog()[0]!, claim: l.managementActions![0]!.action[0]!.text }];
    const e = assessExecutiveEvidence(l, log, false, context()).executives[0]!;
    expect(e.credibilityGrade).toBe("not-assessed");
    expect(e.assessmentReason).toBe(EXECUTIVE_NOT_ASSESSED_REASON);
  });

  it("does not promote numeric-only support of different wording or an invented event date into a decision grade", () => {
    for (const text of ["On 2026-06-24 the Board rejected a USD 50 billion share repurchase program.", "On 2023-06-24 the Board authorized a USD 50 billion share repurchase program."]) {
      const log = actionLog();
      log[0]!.sourceSpans![0]!.text = text;
      expect(assessExecutiveEvidence(leadership(), log, false, context()).executives[0]!.grade).toBe("not-assessed");
    }
  });

  it.each(["Chief of Staff to CEO", "Deputy Chief Executive Officer", "Co-CEO of Investment Banking"])("does not confer company-wide authority on %s", title => {
    const l = leadership(), c = context();
    l.executives[0]!.title = title;
    c.notes = [`Alex Smith — ${title} (since 2024-04-01) [fmp:key-executives]`];
    expect(assessExecutiveEvidence(l, actionLog(), false, c).executives[0]!.grade).toBe("not-assessed");
    expect(executiveOfficeContext(l.executives[0]!, l, actionLog())).toBeUndefined();
  });
});

describe("stored executive cards show the report's existing decision context", () => {
  it("shows dated actions, their judgments and the specific missing record on live, Markdown and print surfaces without changing the stored report", () => {
    const report = ReportSchema.parse(JSON.parse(fs.readFileSync("fixtures/report/DEMO-sample.json", "utf8")));
    report.leadership = leadership();
    report.leadership.executives[0] = { ...report.leadership.executives[0]!, grade: "not-assessed", credibilityGrade: "not-assessed",
      assessmentReason: "No attributable, validated execution or guidance-versus-actual record. A citation, rejected claim, compensation or job title alone cannot establish an assessment." };
    report.leadership.executives[0]!.reasoning.push({ ...fact("This warrants an A execution grade."), label: "JUDGMENT" });
    report.leadership.executives[0]!.evidence.capitalAllocation = [{ ...fact("This warrants a B personal grade."), label: "JUDGMENT" }];
    report.appendix.verificationLog = actionLog();
    const before = JSON.stringify(report);
    const surfaces = [reportToMarkdown(report), reportToPrintBody(report), renderToStaticMarkup(createElement(LeadershipSection, { leadership: report.leadership, report, index: 7 }))];
    for (const text of surfaces) {
      expect(text).toContain("Office decision context");
      expect(text).toContain("2026-06-24");
      expect(text).toContain("tenure overlap");
      expect(text).toContain("not an executed purchase");
      expect(text).not.toContain("A citation, rejected claim, compensation or job title alone");
      expect(text).not.toContain("This warrants an A execution grade.");
      expect(text).not.toContain("This warrants a B personal grade.");
    }
    expect(JSON.stringify(report)).toBe(before);
  });

  it("labels unchecked context explicitly and omits rejected actions without changing marks", () => {
    const l = leadership(), log = actionLog();
    log[0]!.validationStatus = "unchecked";
    const view = executiveOfficeContext(l.executives[0]!, l, log);
    expect(view?.actions[0]).toMatchObject({ verificationNote: "Cited context; figures or wording remain unchecked." });
    log.push({ ...log[0]!, check: "named-individual", reason: "named-individual-unsourced" });
    expect(executiveOfficeContext(l.executives[0]!, l, log)).toBeUndefined();
  });

  it("keeps historical reports without management actions readable", () => {
    const report = ReportSchema.parse(JSON.parse(fs.readFileSync("fixtures/report/DEMO-sample.json", "utf8")));
    delete report.leadership.managementActions;
    expect(reportToMarkdown(report)).toContain("Leadership");
    expect(reportToPrintBody(report)).toContain("Leadership");
    expect(renderToStaticMarkup(createElement(LeadershipSection, { leadership: report.leadership, index: 7 }))).toContain("Leadership");
  });
});

describe("executive decision verification boundaries", () => {
  it("keeps a fetched SEC filing citable for company guidance without turning the URL into a validated actual", async () => {
    const url = "https://www.sec.gov/Archives/edgar/data/1234/000123426000001/release.htm";
    const payload = { provenanceRegistry: [], citationRegistry: [], filings: [] } as unknown as ContextPayload;
    const output = { outlook: { guidanceCredibility: [fact("Management guided revenue of USD 50 billion for 2026.", url)] } };
    const result = await runVerifyPass({} as PassDeps, payload, output, { fetchedUrls: [url] });
    expect(result.log.filter(e => e.check)).toEqual([]);
    expect(result.log[0]).toMatchObject({ validationStatus: "unchecked" });
    for (const source of [url.replace("sec.gov", "sec.gov.example.com"), url]) {
      const unretained = await runVerifyPass({} as PassDeps, payload, { outlook: { guidanceCredibility: [fact("Management guided revenue of USD 50 billion.", source)] } });
      expect(unretained.log.some(e => e.reason === "credibility-source-restricted")).toBe(true);
    }
  });

  it("verifies a retained dated decision end to end and keeps its assessment scoped to decisions", async () => {
    const l = leadership(), text = l.managementActions![0]!.action[0]!.text;
    const payload = { provenanceRegistry: [], citationRegistry: [{ id: "edgar:8-K", kind: "payload-text", origin: "edgar:8-K", asOf: "2026-06-24" }],
      leadership: { notes: context().notes, figures: [] }, quote: { figures: [{ asOf: "2026-11-03" }], notes: [] },
      filings: [{ source: "edgar:8-K", asOf: "2026-06-24", title: "Share repurchase authorization", text, truncated: false, originalChars: text.length }] } as unknown as ContextPayload;
    const result = await runVerifyPass({} as PassDeps, payload, { leadership: l });
    expect(result.log.find(e => e.path === "leadership.managementActions[0].action[0]" && !e.check)).toMatchObject({ validationStatus: "validated" });
    expect(result.verifiedReport.leadership.executives[0]).toMatchObject({ grade: "B", credibilityGrade: "not-assessed" });
  });
});
