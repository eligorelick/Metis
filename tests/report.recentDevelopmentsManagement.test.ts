import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { checkCarriedJudgeSections, normalizeJudgeOutput, runVerifyPass, sectionOutputSchema, type PassDeps } from "@/pipeline/stageC/passes";
import type { ContextPayload } from "@/pipeline/stageC/payload";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import {
  LeadershipSchema, ReportSchema, VerdictSchema, judgeOutputToJsonSchema,
  type ManagementAction, type RecentDevelopment, type Report, type SourcedClaim,
} from "@/report/schema";
import { claimStatusMarkText, indexVerificationMarks } from "@/report/verificationMarks";
import { loadTask28Fixture } from "./helpers/task28Report";
import { readableHtml } from "./helpers/uiParityContract";

/**
 * Q1 (owner request 2026-11-02): a professional report covers what has
 * happened lately and what management is doing, not only the numbers. Both
 * fields are optional, so saved reports keep their bytes and their reading.
 */
const source = "edgar:8-K 0000000000-26-000001";
const asOf = "2026-09-01";
const claim = (text: string, label: SourcedClaim["label"] = "FACT", date: string | null = asOf): SourcedClaim => ({ text, label, source, asOf: date });

const ACQUISITION = "The company completed its acquisition of Example Lending on 2026-09-01 for cash consideration of USD 590 million.";
const ACQUISITION_WHY = "The purchase adds owned-loan credit exposure that the market has not yet seen in reported results.";
const BUYBACK = "The board authorized a share repurchase of up to USD 200 million on 2026-06-15.";
const BUYBACK_VIEW = "Repurchasing below the stated intrinsic value is aligned with shareholders; the record against the prior plan is not yet established.";

function development(overrides: Partial<RecentDevelopment> = {}): RecentDevelopment {
  return { occurredOn: "2026-09-01", title: "Acquisition of Example Lending completed",
    whatHappened: [claim(ACQUISITION)], whyItMatters: [claim(ACQUISITION_WHY, "JUDGMENT")],
    direction: "mixed", affects: "capital", ...overrides };
}

function action(overrides: Partial<ManagementAction> = {}): ManagementAction {
  return { occurredOn: "2026-06-15", category: "capital-allocation", actor: "board",
    action: [claim(BUYBACK, "FACT", "2026-06-15")], assessment: [claim(BUYBACK_VIEW, "JUDGMENT", null)],
    shareholderAlignment: "aligned", ...overrides };
}

function withAnalysis(): Report {
  const report = loadTask28Fixture();
  report.verdict.recentDevelopments = {
    summary: [claim("The debt-funded acquisition is the development that most changes the case.", "JUDGMENT")],
    items: [development(), development({ occurredOn: "2026-07-14", title: "Senior notes issued", direction: "negative", affects: "capital",
      whatHappened: [claim("The company closed USD 600 million of 8.500% senior notes due 2031 on 2026-07-14.", "FACT", "2026-07-14")],
      whyItMatters: [claim("The fixed coupon raises interest cost before the acquisition contributes.", "JUDGMENT")] })],
  };
  report.leadership.managementActions = [action(), action({ occurredOn: "2026-04-20", category: "leadership-change", actor: "board",
    action: [claim("The board appointed a new chief executive effective 2026-09-01.", "FACT", "2026-04-20")],
    assessment: [claim("An internal successor keeps the strategy continuous; the outcome is not yet in reported results.", "JUDGMENT", null)],
    shareholderAlignment: "unclear" })];
  return report;
}

const surfaces = (report: Report): Record<string, string> => ({
  markdown: reportToMarkdown(report),
  print: readableHtml(reportToPrintBody(report)).text,
  classic: readableHtml(renderToStaticMarkup(createElement(ReportView, { report, layout: "classic" }))).text,
  dossier: readableHtml(renderToStaticMarkup(createElement(ReportView, { report, layout: "dossier" }))).text,
});

describe("stored-report compatibility", () => {
  it("parses a saved report without the new fields unchanged and prints no new headings", () => {
    const report = loadTask28Fixture();
    const parsed = ReportSchema.parse(report);
    expect(parsed).toEqual(report);
    expect(parsed.verdict).not.toHaveProperty("recentDevelopments");
    expect(parsed.leadership).not.toHaveProperty("managementActions");
    for (const [surface, text] of Object.entries(surfaces(parsed))) {
      expect(text, surface).not.toMatch(/Recent developments/i);
      expect(text, surface).not.toMatch(/Management actions/i);
    }
  });
});

describe("recent developments and management actions schema", () => {
  it("accepts dated items with sourced claims and up to eight of each", () => {
    const report = withAnalysis();
    report.verdict.recentDevelopments!.items = Array.from({ length: 8 }, () => development());
    report.leadership.managementActions = Array.from({ length: 8 }, () => action());
    expect(ReportSchema.safeParse(report).success).toBe(true);
    expect(VerdictSchema.safeParse({ ...report.verdict, recentDevelopments: { summary: [], items: [] } }).success).toBe(true);
    expect(LeadershipSchema.safeParse({ ...report.leadership, managementActions: [] }).success).toBe(true);
    expect(VerdictSchema.safeParse({ ...report.verdict, recentDevelopments: { summary: [], items: [development({ occurredOn: null })] } }).success).toBe(true);
  });

  it.each([
    ["a ninth development", (r: Report) => { r.verdict.recentDevelopments!.items = Array.from({ length: 9 }, () => development()); }],
    ["a ninth management action", (r: Report) => { r.leadership.managementActions = Array.from({ length: 9 }, () => action()); }],
    ["a month in place of a date", (r: Report) => { r.verdict.recentDevelopments!.items[0]!.occurredOn = "2026-09"; }],
    ["an unknown direction", (r: Report) => { (r.verdict.recentDevelopments!.items[0] as { direction: string }).direction = "neutral"; }],
    ["a development without a sourced fact", (r: Report) => { r.verdict.recentDevelopments!.items[0]!.whatHappened = []; }],
    ["an unsourced claim", (r: Report) => { r.verdict.recentDevelopments!.items[0]!.whatHappened = [{ text: "x", label: "FACT", asOf } as unknown as SourcedClaim]; }],
    ["an invented key", (r: Report) => { (r.leadership.managementActions![0] as Record<string, unknown>).motive = "x"; }],
    ["an unknown category", (r: Report) => { (r.leadership.managementActions![0] as { category: string }).category = "rumour"; }],
    ["an unknown alignment", (r: Report) => { (r.leadership.managementActions![0] as { shareholderAlignment: string }).shareholderAlignment = "great"; }],
    ["an action without a sourced fact", (r: Report) => { r.leadership.managementActions![0]!.action = []; }],
    ["a person's name as the actor", (r: Report) => { (r.leadership.managementActions![0] as { actor: string }).actor = "Jane Doe"; }],
    ["a plain-text summary", (r: Report) => { (r.verdict.recentDevelopments as { summary: unknown }).summary = "Unsourced prose."; }],
    ["a rating in the assessment", (r: Report) => { r.leadership.managementActions![0]!.assessment = [claim("This makes the shares a strong buy.", "JUDGMENT")]; }],
  ])("rejects %s in a stored report", (_name, mutate) => {
    const report = withAnalysis();
    mutate(report);
    expect(ReportSchema.safeParse(report).success).toBe(false);
  });

  it("requires both fields and the event date in the judge request without adding optional or union parameters", () => {
    const full = judgeOutputToJsonSchema();
    for (const [schema, field] of [[sectionOutputSchema(full, ["verdict"]), "recentDevelopments"], [sectionOutputSchema(full, ["leadership"]), "managementActions"], [full, "recentDevelopments"], [full, "managementActions"]] as const) {
      const owners: Array<{ properties?: Record<string, unknown>; required?: string[] }> = [];
      const visit = (value: unknown): void => {
        if (!value || typeof value !== "object") return;
        owners.push(value as never);
        Object.values(value).forEach(visit);
      };
      visit(schema);
      const owner = owners.find(value => value.properties?.[field]);
      expect(owner, field).toBeDefined();
      expect(owner!.required).toContain(field);
      const dated = owners.filter(value => value.properties?.occurredOn);
      expect(dated.length, field).toBeGreaterThan(0);
      for (const item of dated) expect(item.required).toEqual(expect.arrayContaining(["occurredOn", ...Object.keys(item.properties!)]));
    }
    expect(JSON.stringify(full)).toContain("must contain at most 8 items");
  });
});

describe("judge output normalization", () => {
  const raw = () => {
    const report = withAnalysis();
    const sloppyItems = Array.from({ length: 10 }, (_, i) => ({
      ...development({ title: `Development ${i}` }),
      occurredOn: i === 3 ? "2026-05" : `2026-${String(1 + i).padStart(2, "0")}-15T00:00:00Z`.replace("T00:00:00Z", i % 2 === 0 ? "T00:00:00Z" : ""),
      direction: i === 5 ? "Positive" : i === 6 ? "neutral" : "mixed",
      whatHappened: i === 7 ? claim(ACQUISITION) : [claim(ACQUISITION), claim("  ")],
    }));
    sloppyItems.push({ ...development({ title: "No fact" }), occurredOn: "2026-12-01", whatHappened: [claim(" ")] } as never);
    return {
      verdict: { ...report.verdict, recentDevelopments: { summary: claim("One summary claim written as an object.", "JUDGMENT"), items: sloppyItems } },
      leadership: { ...report.leadership, managementActions: [
        { ...action(), category: "Executive change", shareholderAlignment: "Aligned", action: claim(BUYBACK) },
        { ...action({ occurredOn: "2026-08-01" }), category: "compensation", shareholderAlignment: "neutral" },
        { ...action({ occurredOn: "2026-07-01" }), category: "dividend" },
      ] },
    };
  };

  it("repairs forgiving shapes so a sloppy but substantive section is kept", () => {
    const normalized = normalizeJudgeOutput(raw()) as { verdict: Report["verdict"]; leadership: Report["leadership"] };
    const developments = VerdictSchema.parse(normalized.verdict).recentDevelopments!;
    expect(developments.summary).toHaveLength(1);
    expect(developments.items).toHaveLength(8);
    expect(developments.items.map(item => item.title)).not.toContain("No fact");
    const dates = developments.items.map(item => item.occurredOn).filter((date): date is string => date !== null);
    expect(dates).toHaveLength(8); // undated items go last, so the cap drops them first ("2026-05" is not a date)
    expect(dates).toEqual([...dates].sort().reverse());
    expect(dates[0]).toBe("2026-10-15");
    expect(developments.items.every(item => item.whatHappened.every(c => c.text.trim() !== ""))).toBe(true);
    expect(developments.items.find(item => item.title === "Development 5")?.direction).toBe("positive");
    expect(developments.items.find(item => item.title === "Development 6")?.direction).toBe("mixed");
    const actions = LeadershipSchema.parse(normalized.leadership).managementActions!;
    expect(actions.map(a => [a.occurredOn, a.category, a.shareholderAlignment])).toEqual([
      ["2026-08-01", "compensation", "unclear"],
      ["2026-07-01", "capital-allocation", "aligned"],
      ["2026-06-15", "leadership-change", "aligned"],
    ]);
    expect(actions[2]!.action).toEqual([claim(BUYBACK)]);
    const carried = checkCarriedJudgeSections(raw());
    expect(carried.dropped).toEqual([]);
    expect(Object.keys(carried.kept)).toEqual(["verdict", "leadership"]);
  });

  it("keeps an undated item last when there is room for it", () => {
    const report = withAnalysis();
    const items = [development({ occurredOn: null, title: "Undated" }), development({ occurredOn: "2026-03-01", title: "Older" }), development({ title: "Newer" })];
    const normalized = normalizeJudgeOutput({ verdict: { ...report.verdict, recentDevelopments: { summary: [], items } } }) as { verdict: Report["verdict"] };
    expect(normalized.verdict.recentDevelopments!.items.map(item => item.title)).toEqual(["Newer", "Older", "Undated"]);
  });

  it("drops unsourced prose and titles an untitled item from its own first fact", () => {
    const report = withAnalysis();
    const normalized = normalizeJudgeOutput({ verdict: { ...report.verdict, recentDevelopments: {
      summary: "Unsourced prose the judge wrote as a string.",
      items: [{ ...development(), title: undefined, whyItMatters: ["A bare string is not a claim.", claim(ACQUISITION_WHY, "JUDGMENT")] }],
    } } }) as { verdict: Report["verdict"] };
    const developments = VerdictSchema.parse(normalized.verdict).recentDevelopments!;
    expect(developments.summary).toEqual([]);
    expect(developments.items[0]!.whyItMatters).toEqual([claim(ACQUISITION_WHY, "JUDGMENT")]);
    expect(developments.items[0]!.title).toBe("The company completed its acquisition of Example Lending on 2026-09-01 for cash…");
    expect(developments.items[0]!.title.length).toBeLessThanOrEqual(81);
  });

  it.each([
    ["Aligned with shareholders", "aligned"], ["misaligned with shareholders", "misaligned"], ["Not aligned", "misaligned"],
    ["partially aligned", "mixed"], ["Mixed", "mixed"], ["neutral", "unclear"],
  ])("reads alignment %j as %s", (value, expected) => {
    const report = withAnalysis();
    const normalized = normalizeJudgeOutput({ leadership: { ...report.leadership, managementActions: [{ ...action(), shareholderAlignment: value }] } }) as { leadership: Report["leadership"] };
    expect(normalized.leadership.managementActions![0]!.shareholderAlignment).toBe(expected);
  });

  it.each([
    ["Executive change", "leadership-change"], ["executive compensation", "compensation"], ["CEO pay", "compensation"],
    ["officer stock sale", "insider-transaction"], ["director purchase", "insider-transaction"], ["Rule 10b5-1 plan", "insider-transaction"],
    ["share buyback", "capital-allocation"], ["Dividend", "capital-allocation"], ["debt issuance", "capital-allocation"],
    ["Acquisition", "acquisition-divestiture"], ["divestiture", "acquisition-divestiture"], ["Guidance raised", "guidance"],
    ["board appointment", "board-change"], ["CEO succession", "leadership-change"], ["Strategic review", "strategy"], ["payout", "other"],
  ])("reads category %j as %s", (value, expected) => {
    const report = withAnalysis();
    const normalized = normalizeJudgeOutput({ leadership: { ...report.leadership, managementActions: [{ ...action(), category: value }] } }) as { leadership: Report["leadership"] };
    expect(normalized.leadership.managementActions![0]!.category).toBe(expected);
  });

  it.each([
    ["CEO", "ceo"], ["Chief Executive Officer", "ceo"], ["CFO", "cfo"], ["Board of Directors", "board"], ["Chair", "board"],
    ["Chief Operating Officer", "other-executive"], ["General Counsel", "other-executive"], ["Company", "company"], ["management", "company"],
    ["Jane Doe", "unspecified"],
  ])("reads actor %j as the role %s, never a name", (value, expected) => {
    const report = withAnalysis();
    const normalized = normalizeJudgeOutput({ leadership: { ...report.leadership, managementActions: [{ ...action(), actor: value }] } }) as { leadership: Report["leadership"] };
    expect(normalized.leadership.managementActions![0]!.actor).toBe(expected);
  });

  it("reads a null field as absent and keeps an otherwise valid section", () => {
    const report = withAnalysis();
    const normalized = normalizeJudgeOutput({ verdict: { ...report.verdict, recentDevelopments: null }, leadership: { ...report.leadership, managementActions: null } }) as Record<string, Record<string, unknown>>;
    expect(normalized.verdict).not.toHaveProperty("recentDevelopments");
    expect(normalized.leadership).not.toHaveProperty("managementActions");
    expect(VerdictSchema.safeParse(normalized.verdict).success).toBe(true);
  });
});

describe("rendering", () => {
  it("prints recent developments after the executive summary and management actions inside leadership, on every surface", () => {
    const report = ReportSchema.parse(withAnalysis());
    for (const [surface, text] of Object.entries(surfaces(report))) {
      for (const expected of [ACQUISITION, ACQUISITION_WHY, BUYBACK, BUYBACK_VIEW, "Senior notes issued", "2026-09-01", "2026-07-14", "2026-06-15"]) {
        expect(text, `${surface}: ${expected}`).toContain(expected);
      }
      const lower = text.toLowerCase();
      for (const expected of ["capital allocation", "leadership change", "shareholder alignment", "aligned", "unclear", "affects", "capital", "negative"]) {
        expect(lower, `${surface}: ${expected}`).toContain(expected);
      }
      const recent = lower.indexOf("recent developments");
      expect(recent, surface).toBeGreaterThan(lower.indexOf("executive summary"));
      expect(lower.indexOf("acquisition of example lending completed"), surface).toBeLessThan(lower.indexOf("senior notes issued"));
      expect(recent, surface).toBeLessThan(lower.indexOf("what they sell"));
      const actions = lower.indexOf("management actions");
      const leadership = lower.lastIndexOf("leadership & governance", actions);
      expect(leadership, surface).toBeGreaterThan(-1);
      expect(lower.indexOf("competitive", leadership), surface).toBeGreaterThan(actions);
      expect(text, surface).toMatch(/JUDGMENT/);
      expect(text, surface).toMatch(/8-K/);
    }
  });

  it("states a clean empty state when the judge found nothing to report", () => {
    const report = withAnalysis();
    report.verdict.recentDevelopments = { summary: [], items: [] };
    report.leadership.managementActions = [];
    for (const [surface, text] of Object.entries(surfaces(ReportSchema.parse(report)))) {
      expect(text, surface).toContain("No recent developments recorded.");
      expect(text, surface).toContain("No management actions recorded.");
    }
  });
});

describe("verification", () => {
  it("checks every new claim at its exact path and marks it on every surface", async () => {
    const report = withAnalysis();
    report.verdict.recentDevelopments!.items[1]!.whatHappened = [claim("The company completed its acquisition of Example Lending on 2026-09-01 for cash consideration of USD 990 million.")];
    const text = `${ACQUISITION} ${BUYBACK}`;
    const payload = { provenanceRegistry: [], citationRegistry: [{ id: source, asOf, origin: source, kind: "payload-text" }, { id: source, asOf: "2026-06-15", origin: source, kind: "payload-text" }],
      filings: [{ source, asOf, text, title: "8-K", truncated: false, originalChars: text.length }, { source, asOf: "2026-06-15", text, title: "8-K", truncated: false, originalChars: text.length }] } as unknown as ContextPayload;
    const result = await runVerifyPass({} as PassDeps, payload, report);
    expect(result.log.find(entry => entry.path === "verdict.recentDevelopments.items[0].whatHappened[0]")).toMatchObject({ numericSupportStatus: "validated" });
    expect(result.log.find(entry => entry.path === "verdict.recentDevelopments.items[1].whatHappened[0]")).toMatchObject({ validationStatus: "contradicted" });
    expect(result.log.find(entry => entry.path === "leadership.managementActions[0].action[0]")).toMatchObject({ numericSupportStatus: "validated" });
    expect(result.log.some(entry => entry.path === "verdict.recentDevelopments.items[0].whyItMatters[0]" && entry.evidenceKind === "factual-claim")).toBe(false);
    const checked = result.verifiedReport;
    checked.appendix.verificationLog = result.log;
    indexVerificationMarks(checked);
    expect(claimStatusMarkText(checked.verdict.recentDevelopments!.items[0]!.whatHappened[0]!)).toBe("[validated]");
    expect(claimStatusMarkText(checked.verdict.recentDevelopments!.items[1]!.whatHappened[0]!)).toBe("[contradicted]");
    for (const [surface, output] of Object.entries(surfaces(checked))) {
      const text = output.replace(/\\([[\]])/g, "$1"); // Markdown table cells escape brackets
      const at = text.indexOf(ACQUISITION);
      expect(at, surface).toBeGreaterThan(-1);
      expect(text.slice(at, at + ACQUISITION.length + 60), surface).toMatch(/\(8-K 0000000000-26-000001 · 2026-09-01\)\s*\[validated\]/);
      expect(text, surface).toContain("[contradicted]");
    }
  });
});
