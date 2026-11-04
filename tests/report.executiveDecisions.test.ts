import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { assessExecutiveEvidence } from "@/report/financialDiagnostics";
import { executiveOffice, executiveOfficeContext } from "@/report/executiveDecisions";
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
const context = () => ({ asOf: "2026-11-03", notes: ["Alex Smith — Chief Executive Officer (since 2024-04-01) [fmp:key-executives]"],
  filings: [{ source: "edgar:8-K", text: `Other discussion. ${decision().action[0]!.text} More discussion.` }] });

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
    expect(assessExecutiveEvidence(l, log, false, { ...context(), filings: [] }).executives[0]!.assessmentReason).toBe(EXECUTIVE_NOT_ASSESSED_REASON);
    expect(assessExecutiveEvidence(l, log, false, { ...context(), notes: [] }).executives[0]!.assessmentReason).toBe(EXECUTIVE_NOT_ASSESSED_REASON);
  });

  it("preserves an existing typed execution assessment when the new decision rule is refused", () => {
    const l = leadership(), log = actionLog();
    const claim = fact("Alex Smith: operating cash flow was USD 50 billion.", "payload.statements.cash-flow-quarterly.2026-06-24.operating-cash-flow");
    l.executives[0]!.evidence.capitalAllocation = [claim];
    log.push({ path: "leadership.executives[0].evidence.capitalAllocation[0]", claim: claim.text, source: claim.source, outcome: "unverified", validationStatus: "validated", executiveEvidenceKind: "execution" });
    expect(assessExecutiveEvidence(l, log, false, { ...context(), notes: [] }).executives[0]).toMatchObject({ grade: "B", credibilityGrade: "not-assessed", assessmentReason: CREDIBILITY_NOT_ASSESSED_REASON });
  });

  it.each(["title only", "pay only", "outside tenure", "rejected claim", "unquoted amount", "no tenure", "non-filing source", "company result", "wrong office"])("withholds execution for %s", (control) => {
    const l = leadership(), log = actionLog(), c = context();
    if (control === "title only" || control === "pay only") l.managementActions = [];
    if (control === "pay only") l.executives[0]!.evidence.compensation = [fact("Alex Smith: pay was USD 5 million.", "fmp:key-executives")];
    if (control === "outside tenure") c.notes = ["Alex Smith — Chief Executive Officer (since 2026-07-01) [fmp:key-executives]"];
    if (control === "rejected claim") log.push({ ...log[0]!, outcome: "unverified", check: "named-individual", reason: "named-individual-unsourced" });
    if (control === "unquoted amount") { log[0]!.validationStatus = "unchecked"; c.filings = []; }
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
    expect(assessExecutiveEvidence(l, log, false, { ...context(), filings: [{ source: "edgar:8-K", text }] }).executives[0]!.grade).toBe("B");
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
      expect(assessExecutiveEvidence(leadership(), actionLog(), false, { ...context(), filings: [{ source: "edgar:8-K", text }] }).executives[0]!.grade).toBe("not-assessed");
    }
  });

  it.each(["Chairman and CEO", "President, CEO & Director", "CEO, President and Director", "Chief Financial Officer, Treasurer", "Executive Vice President and CFO"])("keeps issuer-wide authority for %s", title => {
    expect(executiveOffice(title)).toBeDefined();
  });

  it.each(["Chief of Staff to CEO", "Deputy Chief Executive Officer", "Co-CEO of Investment Banking", "CEO, Asset & Wealth Management", "Co-CEO, Commercial & Investment Bank", "CFO, Consumer & Community Banking", "CEO - Americas"])("does not confer company-wide authority on %s", title => {
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
      expect(text).toContain("established tenure");
      expect(text).toContain("not an executed purchase");
      expect(text).not.toContain("A citation, rejected claim, compensation or job title alone");
      expect(text).not.toContain("This warrants an A execution grade.");
      expect(text).not.toContain("This warrants a B personal grade.");
    }
    expect(JSON.stringify(report)).toBe(before);
  });

  it("labels unchecked context explicitly and omits rejected actions without changing marks", () => {
    const l = leadership(), log = actionLog();
    log[0]!.validationStatus = "unchecked"; delete log[0]!.sourceSpans;
    const view = executiveOfficeContext(l.executives[0]!, l, log);
    expect(view?.actions[0]).toMatchObject({ verificationNote: "cited; figures not checked" });
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

  // Shape of a real filing sentence: a written date, a dollar sign and a second date.
  const QUOTED = "On June 24, 2026, the Company announced that its Board of Directors had authorized a new $50 billion common share repurchase program, effective July 1, 2026.";
  const quotedPayload = (filingText: string, notes = context().notes) => ({ provenanceRegistry: [], citationRegistry: [{ id: "edgar:10-Q item4", kind: "payload-text", origin: "edgar:10-Q item4", asOf: "2026-08-04" }],
    leadership: { notes, figures: [] }, quote: { figures: [{ asOf: "2026-11-03" }], notes: [] },
    filings: [{ source: "edgar:10-Q item4", asOf: "2026-08-04", title: "Issuer purchases", text: `Item 2 discussion. ${filingText} Other text follows.`, truncated: false, originalChars: 200 }] }) as unknown as ContextPayload;
  const quotedLeadership = (text: string, reasoning: SourcedClaim[] = []): Leadership => {
    const l = leadership(), claim = fact(text, "edgar:10-Q item4", "2026-08-04");
    l.managementActions![0]!.action = [claim];
    l.managementActions![0]!.assessment = [];
    l.executives[0]!.reasoning = [claim, ...reasoning];
    return l;
  };

  it("admits a decision quoted as the filing writes it, with a written date and a dollar sign", async () => {
    const result = await runVerifyPass({} as PassDeps, quotedPayload(QUOTED), { leadership: quotedLeadership(QUOTED) });
    expect(result.verifiedReport.leadership.executives[0]).toMatchObject({ grade: "B", credibilityGrade: "not-assessed" });
  });

  it("admits the exact quotation even when a repeated amount leaves its figures numerically ambiguous", async () => {
    const earlier = "Through June 30, 2026, the Company was authorized to purchase up to $50 billion of common shares under its previous program.";
    const result = await runVerifyPass({} as PassDeps, quotedPayload(`${earlier} ${QUOTED}`), { leadership: quotedLeadership(QUOTED) });
    expect(result.log.find(e => e.path === "leadership.managementActions[0].action[0]" && !e.check)?.validationStatus).not.toBe("validated");
    expect(result.verifiedReport.leadership.executives[0]).toMatchObject({ grade: "B", credibilityGrade: "not-assessed" });
  });

  it("refuses the same decision when its wording differs from the retained filing or its date differs from occurredOn", async () => {
    const reworded = QUOTED.replace("had authorized", "rejected a proposal for");
    const a = await runVerifyPass({} as PassDeps, quotedPayload(QUOTED), { leadership: quotedLeadership(reworded) });
    expect(a.verifiedReport.leadership.executives[0]!.grade).toBe("not-assessed");
    const l = quotedLeadership(QUOTED);
    l.managementActions![0]!.occurredOn = "2026-06-25";
    const b = await runVerifyPass({} as PassDeps, quotedPayload(QUOTED), { leadership: l });
    expect(b.verifiedReport.leadership.executives[0]!.grade).toBe("not-assessed");
  });

  it.each([
    ["On April 1, 2024, Alex Smith became Chief Executive Officer of the Company."],
    ["On 1 April 2024, Alex Smith became Chief Executive Officer."],
    ["Alex Smith was appointed Chief Executive Officer effective April 1, 2024."],
  ])("reads a tenure start from the appointment sentence: %s", async (appointment) => {
    const claim = fact(appointment, "edgar:10-Q item4", "2026-08-04");
    const result = await runVerifyPass({} as PassDeps, quotedPayload(`${QUOTED} ${appointment}`, []), { leadership: quotedLeadership(QUOTED, [claim]) });
    expect(result.verifiedReport.leadership.executives[0]).toMatchObject({ grade: "B", credibilityGrade: "not-assessed" });
  });

  it("binds the decision date to the sentence's own date, not an effective date inside it", async () => {
    const effective = quotedLeadership(QUOTED);
    effective.managementActions![0]!.occurredOn = "2026-07-01";
    const a = await runVerifyPass({} as PassDeps, quotedPayload(QUOTED), { leadership: effective });
    expect(a.verifiedReport.leadership.executives[0]!.grade).toBe("not-assessed");
    const noOpening = "The Board authorized a new $50 billion program on June 24, 2026, effective July 1, 2026.";
    const b = await runVerifyPass({} as PassDeps, quotedPayload(noOpening), { leadership: quotedLeadership(noOpening) });
    expect(b.verifiedReport.leadership.executives[0]!.grade).toBe("not-assessed");
    const single = "The Board authorized a new $50 billion program on June 24, 2026.";
    const c = await runVerifyPass({} as PassDeps, quotedPayload(single), { leadership: quotedLeadership(single) });
    expect(c.verifiedReport.leadership.executives[0]!.grade).toBe("B");
  });

  it.each([
    ["On June 24, 2026, the Board declared a quarterly cash dividend of $1 per common share.", "B"],
    ["On June 24, 2026, the Company completed the sale of its payments business for $2 billion.", "B"],
    ["On June 24, 2026, the Board said it may declare a special dividend of $1 per common share.", "not-assessed"],
    ["On June 24, 2026, the Company said it will not complete the sale of its payments business for $2 billion.", "not-assessed"],
    ["On June 24, 2026, the Board authorized a $50 billion share repurchase program under which the Company may repurchase common shares.", "B"],
    ["On June 24, 2026, the Company announced that it may repurchase up to $50 billion of common shares.", "not-assessed"],
    ["On June 24, 2026, the Company announced a $50 billion share repurchase program.", "B"],
    ["On June 24, 2026, the Company announced a proposed $50 billion share repurchase program.", "not-assessed"],
  ])("reads a completed decision and refuses a possible one: %s", async (sentence, grade) => {
    const result = await runVerifyPass({} as PassDeps, quotedPayload(sentence), { leadership: quotedLeadership(sentence) });
    expect(result.verifiedReport.leadership.executives[0]!.grade).toBe(grade);
  });

  it("refuses a quotation that drops the start or the end of its sentence", async () => {
    const full = "Subject to regulatory approval, on June 24, 2026, the Board authorized a $50 billion share repurchase program, conditional on a shareholder vote that has not been held.";
    for (const partial of ["On June 24, 2026, the Board authorized a $50 billion share repurchase program.",
      "The Board authorized a $50 billion share repurchase program on June 24, 2026.",
      "On June 24, 2026, the Board authorized a $50 billion share repurchase program, conditional on a shareholder vote that has not been held."]) {
      const result = await runVerifyPass({} as PassDeps, quotedPayload(full), { leadership: quotedLeadership(partial) });
      expect(result.verifiedReport.leadership.executives[0]!.grade).toBe("not-assessed");
    }
    const ending = "On June 24, 2026, the Board authorized a $50 billion share repurchase program, conditional on a shareholder vote.";
    const stop = await runVerifyPass({} as PassDeps, quotedPayload(`${ending} That vote has not been held.`), { leadership: quotedLeadership(ending.replace(", conditional on a shareholder vote", "")) });
    expect(stop.verifiedReport.leadership.executives[0]!.grade).toBe("not-assessed");
  });

  it("keeps citations that did not resolve out of the office context, the judgments and the guidance", () => {
    const l = leadership(), log = actionLog();
    log[0]!.traceKind = "untraced";
    log[0]!.reason = "unknown-source";
    expect(executiveOfficeContext(l.executives[0]!, l, log)).toBeUndefined();
    const judgment = actionLog();
    judgment[2]!.traceKind = "untraced";
    expect(executiveOfficeContext(l.executives[0]!, l, judgment)?.actions[0]!.assessment).toEqual([]);
    const claim = fact("The company guided to growth.", "https://example.com/unfetched");
    const guidance: VerificationLogEntry = { path: "outlook.guidanceCredibility[0]", claim: claim.text, source: claim.source, outcome: "unverified", validationStatus: "unchecked", traceKind: "untraced", reason: "unknown-source" };
    expect(executiveOfficeContext(l.executives[0]!, l, [...actionLog(), guidance], [claim])?.guidance).toEqual([]);
  });

  it("does not read a tenure start from another person, another office or a sentence with two dates", async () => {
    for (const appointment of ["On April 1, 2024, Jordan Lee became Chief Executive Officer.", "On April 1, 2024, Alex Smith became Chief Operating Officer.",
      "Alex Smith was appointed Chief Executive Officer effective April 1, 2024 and resigned on May 1, 2025."]) {
      const claim = fact(appointment, "edgar:10-Q item4", "2026-08-04");
      const result = await runVerifyPass({} as PassDeps, quotedPayload(`${QUOTED} ${appointment}`, []), { leadership: quotedLeadership(QUOTED, [claim]) });
      expect(result.verifiedReport.leadership.executives[0]!.grade).toBe("not-assessed");
    }
  });
});
