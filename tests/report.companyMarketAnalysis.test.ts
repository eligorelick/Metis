import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { ReportSnapshotHeader } from "@/components/report/ReportSnapshotHeader";
import { checkCarriedJudgeSections, runVerifyPass, sectionOutputSchema, type PassDeps } from "@/pipeline/stageC/passes";
import type { ContextPayload } from "@/pipeline/stageC/payload";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { ReportSchema, judgeOutputToJsonSchema, type Report, type SourcedClaim } from "@/report/schema";
import { claimStatusMarkText, indexVerificationMarks } from "@/report/verificationMarks";
import { loadTask28Fixture } from "./helpers/task28Report";
import { readableHtml } from "./helpers/uiParityContract";

const source = "edgar:10-K item1";
const asOf = "2026-02-20";
const market = "The home-equity market grew 12%.";
const competitor = "Example Bank competes on branch distribution.";
const claim = (text: string, label: SourcedClaim["label"] = "FACT"): SourcedClaim => ({ text, label, source, asOf });
function withAnalysis(): Report {
  const report = loadTask28Fixture();
  report.business.marketStructure = [claim(market), claim("Distribution and loan funding determine where value accrues.", "JUDGMENT")];
  report.competitive.competitors = [claim(competitor)];
  return report;
}
const surfaces = (report: Report) => [reportToMarkdown(report), readableHtml(reportToPrintBody(report)).text,
  ...(["classic", "dossier"] as const).map(layout => readableHtml(renderToStaticMarkup(createElement(ReportView, { report, layout }))).text)];

describe("company market and competitor claims", () => {
  it("leaves historical reports without the optional arrays unchanged when parsed", () => {
    const report = loadTask28Fixture();
    const parsed = ReportSchema.parse(report);
    expect(parsed).toEqual(report);
    expect(parsed.business).not.toHaveProperty("marketStructure");
    expect(parsed.competitive).not.toHaveProperty("competitors");
    for (const text of surfaces(parsed)) {
      expect(text).not.toMatch(/Market & industry structure/i);
      expect(text).not.toMatch(/(?:### |\b)Competitors\b/);
    }
  });

  it("parses the new sourced claims, renders them in section order, and retains their labels and citations", () => {
    const report = ReportSchema.parse(withAnalysis());
    expect(report.business).toHaveProperty("marketStructure", [claim(market), claim("Distribution and loan funding determine where value accrues.", "JUDGMENT")]);
    expect(report.competitive).toHaveProperty("competitors", [claim(competitor)]);
    for (const text of surfaces(report)) {
      expect(text).toContain(market);
      expect(text).toContain(competitor);
      expect(text).toContain("JUDGMENT");
      expect(text).toContain("FACT");
      expect(text).toMatch(/10-K/);
      expect(text.toLowerCase().indexOf("what they sell")).toBeLessThan(text.toLowerCase().indexOf("market & industry structure"));
      expect(text.toLowerCase().indexOf("competitors")).toBeLessThan(text.toLowerCase().indexOf("moat sources") >= 0 ? text.toLowerCase().indexOf("moat sources") : text.toLowerCase().indexOf("moat assessment"));
    }
  });

  it("requests both arrays in full and sectioned judge schemas without making stored fields mandatory", () => {
    const full = judgeOutputToJsonSchema();
    const part = sectionOutputSchema(full, ["business", "competitive"]);
    for (const schema of [full, part]) {
      const definitions: Array<{ properties?: Record<string, unknown>; required?: string[] }> = [];
      const visit = (value: unknown): void => {
        if (!value || typeof value !== "object") return;
        definitions.push(value);
        Object.values(value).forEach(visit);
      };
      visit(schema);
      for (const key of ["marketStructure", "competitors"]) {
        const owner = definitions.find(value => (value as { properties?: Record<string, unknown> }).properties?.[key]) as { required: string[] };
        expect(owner, key).toBeDefined();
        expect(owner.required).toContain(key);
      }
    }
  });

  it("retains valid new sections and drops malformed or blank claims during continuation", () => {
    const report = withAnalysis();
    const sections = { business: report.business, competitive: report.competitive };
    expect(checkCarriedJudgeSections(sections).kept).toEqual(sections);
    for (const bad of [claim(" "), { text: "Missing source", label: "FACT", asOf }]) {
      expect(checkCarriedJudgeSections({ business: { ...report.business, marketStructure: [bad] }, competitive: { ...report.competitive, competitors: [bad] } }).dropped).toEqual(["business", "competitive"]);
    }
  });

  it("verifies numeric support, qualitative citations and unsupported market sizes at their exact paths", async () => {
    const report = withAnalysis();
    report.business.marketStructure = [claim(market), claim("The home-equity market grew 99%."), claim("The home-equity market grew 12%.", "JUDGMENT")];
    const text = `${market} ${competitor}`;
    const payload = { provenanceRegistry: [], citationRegistry: [{ id: source, asOf, origin: source, kind: "payload-text" }],
      filings: [{ source, asOf, text, title: "Business", truncated: false, originalChars: text.length }] } as unknown as ContextPayload;
    const result = await runVerifyPass({} as PassDeps, payload, report);
    expect(result.log.find(entry => entry.path === "business.marketStructure[0]")).toMatchObject({ numericSupportStatus: "validated" });
    expect(result.log.find(entry => entry.path === "business.marketStructure[1]")).toMatchObject({ validationStatus: "contradicted" });
    expect(result.log.find(entry => entry.path === "competitive.competitors[0]")).toMatchObject({ validationStatus: "cited" });
    expect(result.log.some(entry => entry.path === "business.marketStructure[2]" && entry.evidenceKind === "factual-claim")).toBe(false);
    const checked = result.verifiedReport;
    checked.appendix.verificationLog = result.log;
    indexVerificationMarks(checked);
    const claims = checked.business.marketStructure!;
    expect(claimStatusMarkText(claims[0])).toBe("[validated]");
    expect(claimStatusMarkText(claims[1])).toBe("[contradicted]");
    for (const output of surfaces(checked)) {
      expect(output).toContain("[validated]");
      expect(output).toContain("[contradicted]");
      expect(output).toContain("[qualitative]");
    }
  });
});

describe("analyst report reading order", () => {
  it("prints no process table in the header and puts About this report first in the appendix", () => {
    const html = reportToPrintBody(loadTask28Fixture());
    expect(html.slice(0, html.indexOf("</header>"))).not.toContain("<table");
    expect(html).toMatch(/Appendix<\/h2><h3>About this report<\/h3>/);
    expect(html.indexOf('<section class="block keydata">')).toBeLessThan(html.indexOf('class="synthesis"'));
    expect(html.indexOf('class="synthesis"')).toBeLessThan(html.indexOf("<h3>About this report"));
  });

  it("puts identity, date and notices before key data and verdict; process information first in the appendix", () => {
    const report = loadTask28Fixture();
    report.meta.reportId = 59;
    const before = JSON.stringify(report);
    const outputs = [reportToMarkdown(report), readableHtml(reportToPrintBody(report)).text,
      ...(["classic", "dossier"] as const).map(layout => readableHtml(renderToStaticMarkup(createElement(ReportSnapshotHeader, { snapshot: report, reportId: 59, status: "done", actions: null })) + renderToStaticMarkup(createElement(ReportView, { report, layout, selectedReportStatus: "done", headerNotices: true }))).text)];
    for (const text of outputs) {
      const about = text.toLowerCase().indexOf("about this report");
      const appendix = text.lastIndexOf("Appendix", about);
      expect(about).toBeGreaterThan(0);
      expect(appendix).toBeGreaterThan(0);
      expect(about).toBeGreaterThan(appendix);
      const front = text.slice(0, text.toLowerCase().indexOf("key data"));
      expect(front).toContain(report.meta.companyName);
      expect(front).toMatch(/equity research report/i);
      expect(front).toContain(report.meta.generatedAt.slice(0, 10));
      expect(front).toContain(report.meta.disclaimer);
      expect(front).not.toMatch(/Usage|Versions|Verification|Process:|Saved report|Data completeness/i);
      expect(text.toLowerCase().indexOf("key data")).toBeLessThan(text.indexOf(report.verdict.synthesis));
      expect(text.indexOf("#59")).toBeGreaterThan(about);
      expect(text.indexOf(report.meta.specVersion)).toBeGreaterThan(about);
      expect(about).toBeLessThan(text.toLowerCase().indexOf("methodology and limitations"));
    }
    expect(JSON.stringify(report)).toBe(before);
  });
});
