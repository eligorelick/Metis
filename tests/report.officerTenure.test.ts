import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { runStageB } from "@/pipeline/compute";
import { executiveTenureStart } from "@/report/executiveDecisions";
import { assessExecutiveEvidence } from "@/report/financialDiagnostics";
import { ReportSchema, judgeOutputToJsonSchema, type Executive } from "@/report/schema";
import { LeadershipSection } from "@/components/report/sections";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const tenure = { name: "Alex S. Smith", office: "ceo" as const, start: "2024-04-30", precision: "month" as const, wording: "April 2024", quote: "Alex Smith became Chief Executive Officer in April 2024.", source: "https://www.sec.gov/Archives/edgar/data/1234/000123426000001/annual.htm", filingDate: "2026-02-13" };
const executive = (): Executive => ({ name: "Alex Smith", title: "CEO", tenureYears: 99, grade: "not-assessed", credibilityGrade: "not-assessed", reasoning: [], evidence: {} });

describe("a filing's stated period and an exact start", () => {
  const card = { name: "Alex Smith", title: "Chief Executive Officer", tenureYears: null, grade: "B", credibilityGrade: "B", reasoning: [], evidence: {} } as never;
  const filing = (start: string, precision: "day" | "month" | "year", wording: string) =>
    ({ name: "Alex Smith", office: "ceo" as const, start, precision, wording, quote: `since ${wording}`, source: "edgar:10-K officer-biographies", filingDate: "2026-02-13" });
  const notes = ["Alex Smith \u2014 Chief Executive Officer (since 2024-04-01) [fmp:key-executives]"];

  it("keeps the exact date when the filing's month or year contains it", () => {
    expect(executiveTenureStart(card, 0, [], { notes, officerTenures: [filing("2024-04-30", "month", "April 2024")] })).toBe("2024-04-01");
    expect(executiveTenureStart(card, 0, [], { notes, officerTenures: [filing("2024-12-31", "year", "2024")] })).toBe("2024-04-01");
  });

  it("keeps the filing citation on the card when an exact date agrees with its period", () => {
    const leadership = { graded: { grade: "B", confidence: "low", oneLineWhy: "x", reasoning: [], keyNumbers: [] }, executives: [card], insiderSummary: [], governanceNotes: [] } as never;
    const result = assessExecutiveEvidence(leadership, [], false, { notes, officerTenures: [filing("2024-04-30", "month", "April 2024")] });
    expect(result.executives[0]!.officeTenure).toMatchObject({ wording: "April 2024" });
  });

  it("fails closed when the filing's period excludes it", () => {
    expect(executiveTenureStart(card, 0, [], { notes, officerTenures: [filing("2023-12-31", "year", "2023")] })).toBeUndefined();
    expect(executiveTenureStart(card, 0, [], { notes, officerTenures: [filing("2024-04-02", "day", "April 2, 2024")] })).toBeUndefined();
  });
});

describe("filing tenure from leadership context to persisted officer cards", () => {
  it("adds source-bound tenure and its original precision to leadership context and retained filings", () => {
    const b = completeCurrencyBundle({});
    b.executives = { ok: true, value: { source: "fmp", asOf: "2026-07-06", endpoint: "key-executives", fetchedAt: b.builtAt, data: { rows: [{ name: "Alex S. Smith", title: "CEO" }], raw: [] } } };
    b.edgar.officerBiographies = { text: tenure.quote, notes: [], documentUrl: tenure.source, filingDate: tenure.filingDate, reportDate: "2025-12-31", accession: "000123426000001", form: "10-K" };
    const p = assembleContextPayload(b, runStageB(b), { checks: [], flags: [], gaps: [] });
    expect(p.leadership.officerTenures).toEqual([tenure]);
    expect(p.leadership.notes.join(" ")).toContain("April 2024");
    expect(p.leadership.notes.join(" ")).toContain("2026-02-13");
    expect(p.filings).toEqual(expect.arrayContaining([expect.objectContaining({ source: tenure.source, text: expect.stringContaining(tenure.quote) })]));
  });

  it("keeps a supported CEO start when the provider lists that officer after the generic row budget", () => {
    const b = completeCurrencyBundle({});
    const rows = [...Array.from({ length: 13 }, (_, i) => ({ name: `Other Person ${i}`, title: "Chief Operating Officer" })), { name: "Alex S. Smith", title: "CEO" }];
    b.executives = { ok: true, value: { source: "fmp", asOf: "2026-07-06", endpoint: "key-executives", fetchedAt: b.builtAt, data: { rows, raw: [] } } };
    b.edgar.officerBiographies = { text: tenure.quote, notes: [], documentUrl: tenure.source, filingDate: tenure.filingDate, reportDate: "2025-12-31", accession: "000123426000001", form: "10-K" };
    expect(assembleContextPayload(b, runStageB(b), { checks: [], flags: [], gaps: [] }).leadership.officerTenures).toEqual([tenure]);
  });

  it("keeps deterministic tenure out of the judge wire schema", () => {
    const wire = judgeOutputToJsonSchema() as { properties: { leadership: { properties: { executives: { items: { properties: Record<string, unknown> } } } } } };
    expect(wire.properties.leadership.properties.executives.items.properties).not.toHaveProperty("officeTenure");
  });

  it("does not fall back to a provider date after the filing explicitly conflicts with itself", () => {
    const b = completeCurrencyBundle({});
    b.executives = { ok: true, value: { source: "fmp", asOf: "2026-07-06", endpoint: "key-executives", fetchedAt: b.builtAt, data: { rows: [{ name: "Alex Smith", title: "CEO", titleSince: "2024-04-01" }], raw: [] } } };
    b.edgar.officerBiographies = { text: "Alex Smith became CEO in April 2024. Alex Smith was appointed CEO on May 1, 2023.", notes: [], documentUrl: tenure.source, filingDate: tenure.filingDate, reportDate: "2025-12-31", accession: "000123426000001", form: "10-K" };
    const p = assembleContextPayload(b, runStageB(b), { checks: [], flags: [], gaps: [] });
    expect(p.leadership.tenureConflicts).toEqual([{ name: "Alex Smith", office: "ceo" }]);
    expect(executiveTenureStart(executive(), 0, [], { notes: p.leadership.notes, tenureConflicts: p.leadership.tenureConflicts })).toBeUndefined();
    expect(p.leadership.notes.join(" ")).toContain("conflicting");
  });

  it("consumes a pipeline-sourced tenure with safe middle-initial matching, never tenureYears", () => {
    const e = executive();
    expect(executiveTenureStart(e, 0, [], { asOf: "2026-11-03", officerTenures: [tenure] })).toBe("2024-04-30");
    expect(executiveTenureStart(e, 0, [], {})).toBeUndefined();
    expect(executiveTenureStart({ ...e, name: "Alex T. Smith" }, 0, [], { officerTenures: [tenure] })).toBeUndefined();
    expect(executiveTenureStart({ ...e, title: "CEO of Consumer Banking" }, 0, [], { officerTenures: [tenure] })).toBeUndefined();
    expect(executiveTenureStart(e, 0, [], { asOf: "2025-01-01", officerTenures: [tenure] })).toBeUndefined();
    expect(executiveTenureStart(e, 0, [], { officerTenures: [tenure], notes: ["Alex Smith — CEO (since 2023-01-01) [fmp:key-executives]"] })).toBeUndefined();
  });

  it("persists deterministic tenure even for an unassessed officer, and discards model-written tenure", () => {
    const l = ReportSchema.parse(JSON.parse(fs.readFileSync("fixtures/report/DEMO-sample.json", "utf8"))).leadership;
    l.executives = [executive()];
    const after = assessExecutiveEvidence(l, [], false, { officerTenures: [tenure], asOf: "2026-11-03" });
    expect(after.executives[0]?.officeTenure).toEqual(tenure);
    expect(after.executives[0]?.grade).toBe("not-assessed");
    expect(assessExecutiveEvidence(l, [], false, { officerTenures: [tenure], notes: ["Alex Smith — CEO (since 2023-01-01) [fmp:key-executives]"] }).executives[0]?.officeTenure).toBeUndefined();
    expect(assessExecutiveEvidence(after, [], true, {}).executives[0]?.officeTenure).toBeUndefined();
  });

  it("shows the original month and source in live, Markdown and print, including unassessed cards", () => {
    const report = ReportSchema.parse(JSON.parse(fs.readFileSync("fixtures/report/DEMO-sample.json", "utf8")));
    report.leadership.executives = [{ ...executive(), officeTenure: tenure }];
    const before = JSON.stringify(report);
    for (const text of [reportToMarkdown(report), reportToPrintBody(report), renderToStaticMarkup(createElement(LeadershipSection, { leadership: report.leadership, report, index: 7 }))]) {
      expect(text).toContain("CEO since April 2024");
      expect(text).toContain(tenure.source);
      expect(text).not.toContain("CEO since 2024-04-30");
    }
    expect(JSON.stringify(report)).toBe(before);
    delete report.leadership.executives[0]!.officeTenure;
    expect(ReportSchema.safeParse(report).success).toBe(true);
  });
});
