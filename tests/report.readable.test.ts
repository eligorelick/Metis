import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { reportToAuditMarkdown, reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { filingFactTables, SAME_PASSAGE_AS_ABOVE } from "@/report/filingSupplementPresentation";
import {
  BRIEF_NOT_ESTABLISHED,
  BRIEF_PART_NOT_ESTABLISHED,
  BUSINESS_BRIEF_HEADING,
  businessBrief,
  DISAGREEMENT_SIDES_NOTE,
  SCORE_DIAGNOSTICS_NOTE,
} from "@/report/presentation";
import { prepareReportForSurface } from "@/report/readerPreparation";
import { REPORT_SECTION_MANIFEST } from "@/report/sectionManifest";
import { ReportSchema, type Report, type SourcedClaim, type VerificationLogEntry } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";
import { readableHtml } from "./helpers/uiParityContract";

// D-273: synthetic company shapes only; every name below is invented.
const source = "edgar:10-K item1";
const asOf = "2026-02-20";
const fact = (text: string): SourcedClaim => ({ text, label: "FACT", source, asOf });
const judgment = (text: string): SourcedClaim => ({ text, label: "JUDGMENT", source, asOf });
type Status = NonNullable<VerificationLogEntry["validationStatus"]>;

/** Attach a factual-claim log entry for the claim at `path`, as the verify pass records it. */
function mark(report: Report, path: string, status: Status): void {
  const node = path.split(/\.|\[(\d+)\]/).filter(Boolean).reduce<unknown>((at, key) => (at as Record<string, unknown>)[key], report) as SourcedClaim;
  (report.appendix.verificationLog ??= []).push({
    claim: node.text, outcome: status === "validated" || status === "cited" ? "verified" : "unverified",
    validationStatus: status, path, evidenceKind: "factual-claim", source,
  });
}

const markdownOf = (report: Report) => reportToMarkdown(report);
const printOf = (report: Report) => readableHtml(reportToPrintBody(report)).text;
const appOf = (report: Report) => readableHtml(renderToStaticMarkup(createElement(ReportView, { report }))).text;
const surfaces = (report: Report) => [markdownOf(report), printOf(report), appOf(report)];
/** The brief part line the Markdown prints for one heading. */
const briefLine = (markdown: string, heading: string) => markdown.split("\n").find(line => line.startsWith(`- **${heading}:**`)) ?? "";

/** A drug maker: every part has candidates, and each part mixes passing and failing claims. */
function drugMaker(): Report {
  const report = loadTask28Fixture();
  report.appendix.verificationLog = [];
  report.business.whatTheySell = [fact("Verandol sales rose 40% to $9.1 billion."), fact("The company makes branded prescription medicines.")];
  report.business.customersAndSuppliers = [fact("Nordhavn Wholesale bought 31.4% of all units."), fact("Three wholesale distributors buy most U.S. product.")];
  report.business.protection = [];
  report.competitive.moatAssessment = [{ source: "ip", strength: "wide", reasoning: [judgment("Patents keep rivals out for years.")] }];
  report.competitive.moatGraded.reasoning = [fact("Gross margin was 81.2% for the fiscal year.")];
  report.business.whatIsComing = [fact("Orvane is in Phase 3 for obesity.")];
  report.catalystsRisks.risks = [{ title: "Pricing", severity: "high", probability: "unknown", source, reasoning: [fact("Prices fell 15.3% in the quarter.")] }];
  mark(report, "business.whatTheySell[0]", "unchecked");
  mark(report, "business.whatTheySell[1]", "cited");
  mark(report, "business.customersAndSuppliers[0]", "contradicted");
  mark(report, "business.customersAndSuppliers[1]", "validated");
  mark(report, "competitive.moatGraded.reasoning[0]", "unchecked");
  mark(report, "business.whatIsComing[0]", "cited");
  mark(report, "catalystsRisks.risks[0].reasoning[0]", "contradicted");
  return ReportSchema.parse(report);
}

/** A bank saved before D-271: no story fields; a buyer fact sits in the concentration list. */
function bankBeforeStoryFields(): Report {
  const report = loadTask28Fixture();
  report.appendix.verificationLog = [];
  report.business.whatTheySell = [fact("The bank takes deposits and makes commercial loans.")];
  report.business.concentrationRisks = [fact("Commercial real estate was 41.0% of loans."), fact("Retail customers in two states supply most deposits.")];
  mark(report, "business.whatTheySell[0]", "cited");
  mark(report, "business.concentrationRisks[0]", "validated");
  mark(report, "business.concentrationRisks[1]", "cited");
  return ReportSchema.parse(report);
}

const briefOf = (report: Report) => businessBrief(prepareReportForSurface(report, "markdown").report);

describe("opening business brief (D-273)", () => {
  it("admits only FACT claims that passed verification and says so for a part with none", () => {
    const report = drugMaker();
    const brief = briefOf(report);
    expect(brief.map(part => part.heading)).toEqual(["What it sells", "Who buys it", "Why it wins", "What is next", "What could break it"]);
    expect(Object.fromEntries(brief.map(part => [part.key, part.claims.map(claim => claim.text)]))).toEqual({
      sells: ["The company makes branded prescription medicines."],
      buyers: ["Three wholesale distributors buy most U.S. product."],
      wins: [],
      next: ["Orvane is in Phase 3 for obesity."],
      risks: [],
    });
    const markdown = markdownOf(report);
    expect(briefLine(markdown, "What it sells")).not.toContain("Verandol sales rose");
    expect(briefLine(markdown, "Who buys it")).not.toContain("Nordhavn");
    expect(briefLine(markdown, "Why it wins")).toBe(`- **Why it wins:** ${BRIEF_PART_NOT_ESTABLISHED}`);
    expect(briefLine(markdown, "What could break it")).toBe(`- **What could break it:** ${BRIEF_PART_NOT_ESTABLISHED}`);
    // Each admitted claim keeps its citation and mark.
    expect(briefLine(markdown, "Who buys it")).toMatch(/Three wholesale distributors buy most U\.S\. product\. _\(.+\)_ \[validated\]$/);
    for (const text of surfaces(report)) {
      expect(text).toContain(BUSINESS_BRIEF_HEADING);
      expect(text.indexOf(BUSINESS_BRIEF_HEADING)).toBeLessThan(text.indexOf("Executive summary") < 0 ? Infinity : text.indexOf("Executive summary"));
      expect(text).toContain("Three wholesale distributors buy most U.S. product.");
      expect(text).toContain(BRIEF_PART_NOT_ESTABLISHED);
    }
  });

  it("reads a buyer statement from an older field by its words, never a fact about something else", () => {
    const brief = briefOf(bankBeforeStoryFields());
    expect(brief.find(part => part.key === "buyers")?.claims.map(claim => claim.text)).toEqual(["Retail customers in two states supply most deposits."]);
    expect(brief.find(part => part.key === "sells")?.claims.map(claim => claim.text)).toEqual(["The bank takes deposits and makes commercial loans."]);
  });

  it("prints one line when nothing passed verification (a data-only or unchecked report)", () => {
    const report = loadTask28Fixture();
    report.appendix.verificationLog = [];
    expect(briefOf(report).every(part => part.claims.length === 0)).toBe(true);
    for (const text of surfaces(report)) {
      expect(text).toContain(BRIEF_NOT_ESTABLISHED);
      expect(text).not.toContain(BRIEF_PART_NOT_ESTABLISHED);
    }
  });
});

describe("reading order (D-273)", () => {
  const titles = REPORT_SECTION_MANIFEST.map(section => section.printTitle);
  it("puts the business group and catalysts and risks before the figures, in all three renderers", () => {
    expect(REPORT_SECTION_MANIFEST.map(section => section.key)).toEqual(["verdict", "business", "competitive", "outlook", "catalystsRisks",
      "fundamentals", "balanceSheet", "valuation", "quality", "technicals", "leadership", "projections", "macro", "appendix"]);
    const report = drugMaker();
    const markdown = markdownOf(report);
    const headings = [...markdown.matchAll(/^## (\d+)\. (.+)$/gm)].map(m => [Number(m[1]), m[2]]);
    expect(headings).toEqual(REPORT_SECTION_MANIFEST.filter(section => markdown.includes(`## ${section.index}. ${section.printTitle}`)).map(section => [section.index, section.printTitle]));
    expect(headings.map(([, title]) => title)).toEqual(titles.filter(title => headings.some(([, shown]) => shown === title)));
    const print = reportToPrintBody(report);
    const printOrder = REPORT_SECTION_MANIFEST.map(section => print.indexOf(`id="report-${section.key}"`)).filter(at => at >= 0);
    expect(printOrder.length).toBeGreaterThanOrEqual(12);
    expect(printOrder).toEqual([...printOrder].sort((a, b) => a - b));
    const app = renderToStaticMarkup(createElement(ReportView, { report }));
    const appOrder = REPORT_SECTION_MANIFEST.map(section => app.indexOf(`id="report-${section.key}"`)).filter(at => at >= 0);
    expect(appOrder.length).toBeGreaterThanOrEqual(12);
    expect(appOrder).toEqual([...appOrder].sort((a, b) => a - b));
  });

  it("renders a historical report in the new order without error and without changing its bytes", () => {
    const report = loadTask28Fixture();
    const before = JSON.stringify(report);
    const markdown = markdownOf(report);
    expect(markdown.indexOf("## 2. Business & Segments")).toBeLessThan(markdown.indexOf("## 6. Fundamentals"));
    expect(markdown.indexOf("## 5. Catalysts & Risks")).toBeLessThan(markdown.indexOf("## 8. Valuation"));
    expect(() => reportToPrintBody(report)).not.toThrow();
    expect(() => renderToStaticMarkup(createElement(ReportView, { report }))).not.toThrow();
    expect(JSON.stringify(report)).toBe(before);
  });
});

describe("shorter report (D-273)", () => {
  it("shows a statement repeated in another section once in full and references it, on every surface", () => {
    const report = drugMaker();
    const repeated = "Quarterly revenue was $24.40 billion, up 38.6%.";
    report.verdict.executiveSummary = [fact(repeated)];
    report.fundamentals.commentary = [fact(repeated), fact("Operating margin was 35.3% in the quarter.")];
    mark(report, "verdict.executiveSummary[0]", "validated");
    mark(report, "fundamentals.commentary[0]", "validated");
    for (const text of surfaces(report)) {
      expect(text.split(repeated).length - 1, "printed once").toBe(1);
      expect(text).toContain("Also stated here, shown in full under Verdict › Executive summary.");
      expect(text).toContain("Operating margin was 35.3% in the quarter.");
    }
  });

  it("keeps both copies when the verification marks differ (not the same statement) — control", () => {
    const report = drugMaker();
    const repeated = "Quarterly revenue was $24.40 billion, up 38.6%.";
    report.verdict.executiveSummary = [fact(repeated)];
    report.fundamentals.commentary = [fact(repeated)];
    mark(report, "verdict.executiveSummary[0]", "validated");
    mark(report, "fundamentals.commentary[0]", "unchecked");
    for (const text of surfaces(report)) {
      expect(text.split(repeated).length - 1).toBe(2);
      expect(text).not.toContain("Also stated here");
    }
  });

  it("moves the two sides of each disagreement and the score diagnostics to the audit export", () => {
    const report = drugMaker();
    report.disagreements = [{ topic: "Price against volume", kind: "interpretation", bullView: "Volume growth keeps outrunning price cuts.", bearView: "Price erosion is structural.", judgeResolution: "Results favour the bull; the trend favours the bear." }];
    for (const text of [markdownOf(report), printOf(report)]) {
      expect(text).toContain("Results favour the bull; the trend favours the bear.");
      expect(text).toContain(DISAGREEMENT_SIDES_NOTE);
      expect(text).not.toContain("Volume growth keeps outrunning price cuts.");
      expect(text).not.toContain("Price erosion is structural.");
    }
    // D-246: the app keeps every frozen fact, so its collapsed debate panel still shows both sides.
    expect(appOf(report)).toContain("Volume growth keeps outrunning price cuts.");
    const markdown = markdownOf(report);
    for (const heading of ["### Score drivers", "### Factor-family exposure", "### Factor contribution sensitivity", "### Attribute grade reliability"]) expect(markdown).not.toContain(heading);
    if (report.scores) expect(markdown).toContain(SCORE_DIAGNOSTICS_NOTE);
    const audit = reportToAuditMarkdown(report);
    expect(audit).toContain("## Bull/bear statements");
    expect(audit).toContain("- Bull: Volume growth keeps outrunning price cuts.");
    expect(audit).toContain("- Bear: Price erosion is structural.");
    if (report.scores) expect(audit).toContain("### Attribute grade reliability");
    expect(audit).toContain("## Sources");
  });

  it("names one shared filing once and references a passage the row above already quotes", () => {
    const filing = { form: "10-Q", filingDate: "2026-08-26", accession: "0000000000-26-000001", url: "https://www.sec.gov/Archives/edgar/data/1/000000000026000001/a.htm" };
    const shares = "Three direct customers represented 16%, 15% and 13% of total revenue.";
    const receivables = "Two direct customers accounted for 22% and 14% of accounts receivable.";
    const row = (i: number, value: number, text: string, source: typeof filing = filing) => ({ key: `concentration-${i}`, label: `reported share (${i})`, value, unit: "percent" as const,
      asOf: "2026-07-26", period: "Q2", qualifier: null, computed: null, source, text });
    const one = filingFactTables({ currency: "USD", filingFacts: [row(1, 16, shares), row(2, 15, shares), row(3, 22, receivables)] } as never)[0]!;
    expect(one.headers).not.toContain("Source");
    expect(one.note).toContain(`Source for every row: 10-Q filed 2026-08-26 (0000000000-26-000001) ${filing.url}.`);
    const basis = one.headers.indexOf("Basis / issuer context");
    expect(one.rows.map(cells => cells[basis])).toEqual([shares, SAME_PASSAGE_AS_ABOVE, receivables]);
    // Control: two filings keep the Source column on every row.
    const other = { ...filing, accession: "0000000000-26-000002" };
    const two = filingFactTables({ currency: "USD", filingFacts: [row(1, 16, shares), row(2, 22, receivables, other)] } as never)[0]!;
    expect(two.headers).toContain("Source");
    expect(two.note).not.toContain("Source for every row");
  });

});
