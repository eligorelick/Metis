import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { reportToAuditMarkdown, reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { filingFactTables, SAME_PASSAGE_AS_ABOVE } from "@/report/filingSupplementPresentation";
import { groupedWithheldNotes } from "@/report/filingDisclosurePresentation";
import {
  BRIEF_NOT_ESTABLISHED,
  BRIEF_PART_NOT_ESTABLISHED,
  BUSINESS_BRIEF_HEADING,
  businessBrief,
  DISAGREEMENT_SIDES_NOTE,
  MODELED_SHIFT_REFERENCE,
  SCORE_DIAGNOSTICS_NOTE,
  scenarioReaderLists,
  SEPARATE_CONDITION_PREFIX,
} from "@/report/presentation";
import { prepareReportForSurface } from "@/report/readerPreparation";
import { serializeCitationRef } from "@/pipeline/stageC/citations";
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
    expect(brief.map(part => part.heading)).toEqual(["What it sells", "Customers and suppliers", "Protection and competition", "What is next", "What could break it"]);
    expect(Object.fromEntries(brief.map(part => [part.key, part.claims.map(claim => claim.text)]))).toEqual({
      sells: ["The company makes branded prescription medicines."],
      buyers: ["Three wholesale distributors buy most U.S. product."],
      wins: [],
      next: ["Orvane is in Phase 3 for obesity."],
      risks: [],
    });
    const markdown = markdownOf(report);
    expect(briefLine(markdown, "What it sells")).not.toContain("Verandol sales rose");
    expect(briefLine(markdown, "Customers and suppliers")).not.toContain("Nordhavn");
    expect(briefLine(markdown, "Protection and competition")).toBe(`- **Protection and competition:** ${BRIEF_PART_NOT_ESTABLISHED}`);
    expect(briefLine(markdown, "What could break it")).toBe(`- **What could break it:** ${BRIEF_PART_NOT_ESTABLISHED}`);
    // Each admitted claim keeps its citation and mark.
    expect(briefLine(markdown, "Customers and suppliers")).toMatch(/Three wholesale distributors buy most U\.S\. product\. _\(.+\)_ \[validated\]$/);
    for (const text of surfaces(report)) {
      expect(text).toContain(BUSINESS_BRIEF_HEADING);
      expect(text.indexOf(BUSINESS_BRIEF_HEADING)).toBeLessThan(text.indexOf("Executive summary") < 0 ? Infinity : text.indexOf("Executive summary"));
      expect(text).toContain("Three wholesale distributors buy most U.S. product.");
      expect(text).toContain(BRIEF_PART_NOT_ESTABLISHED);
    }
  });

  it("reads a report saved before the story fields: buyers only from customers and suppliers, concentration under risks", () => {
    const brief = briefOf(bankBeforeStoryFields());
    // Review round 1 (lead decision): a buyer statement comes only from the customers-and-suppliers field.
    expect(brief.find(part => part.key === "buyers")?.claims).toEqual([]);
    expect(brief.find(part => part.key === "risks")?.claims.map(claim => claim.text)).toEqual(["Commercial real estate was 41.0% of loans."]);
    expect(brief.find(part => part.key === "sells")?.claims.map(claim => claim.text)).toEqual(["The bank takes deposits and makes commercial loans."]);
  });

  /** One verified (cited) FACT per listed field entry; every other story field empty. */
  function storyReport(fields: { sells?: string[]; buyers?: string[]; protection?: string[]; moat?: string[]; coming?: string[]; risks?: string[]; concentration?: string[]; plan?: string[] }): Report {
    const report = loadTask28Fixture();
    report.appendix.verificationLog = [];
    report.business.whatTheySell = (fields.sells ?? []).map(text => fact(text));
    report.business.customersAndSuppliers = (fields.buyers ?? []).map(text => fact(text));
    report.business.protection = (fields.protection ?? []).map(text => fact(text));
    report.business.whatIsComing = (fields.coming ?? []).map(text => fact(text));
    report.business.managementPlan = (fields.plan ?? []).map(text => fact(text));
    report.business.concentrationRisks = (fields.concentration ?? []).map(text => fact(text));
    report.competitive.moatAssessment = fields.moat ? [{ source: "ip", strength: "wide", reasoning: fields.moat.map(text => fact(text)) }] : [];
    report.competitive.moatGraded.reasoning = [fact("Gross margin was 81.2% for the fiscal year.")];
    report.catalystsRisks.catalysts = [];
    report.catalystsRisks.risks = fields.risks ? [{ title: "Pricing", severity: "high", probability: "unknown", source, reasoning: fields.risks.map(text => fact(text)) }] : [];
    const paths: Array<[string, string[] | undefined]> = [["business.whatTheySell", fields.sells], ["business.customersAndSuppliers", fields.buyers], ["business.protection", fields.protection],
      ["business.whatIsComing", fields.coming], ["business.managementPlan", fields.plan], ["business.concentrationRisks", fields.concentration],
      ["competitive.moatAssessment[0].reasoning", fields.moat], ["catalystsRisks.risks[0].reasoning", fields.risks]];
    for (const [path, list] of paths) (list ?? []).forEach((_, i) => mark(report, `${path}[${i}]`, "cited"));
    mark(report, "competitive.moatGraded.reasoning[0]", "validated");
    return ReportSchema.parse(report);
  }
  const partTexts = (report: Report) => Object.fromEntries(briefOf(report).map(part => [part.key, part.claims.map(claim => claim.text)]));

  it("never files a verified statement under a part it does not answer (review round 1 reproductions)", () => {
    const report = storyReport({
      protection: ["No reviewed source establishes patent protection or switching costs."],
      buyers: ["The company relies on a single supplier for its active ingredient.", "The company does not disclose its customers."],
      plan: ["Management plans to expand capacity."],
      sells: ["The company sells industrial pumps."],
    });
    // Review round 2 (lead fix): the part is labelled by its field, so a supplier statement is shown as one.
    expect(partTexts(report)).toEqual({ sells: ["The company sells industrial pumps."], buyers: ["The company relies on a single supplier for its active ingredient."], wins: [], next: [], risks: [] });
    const markdown = markdownOf(report);
    for (const heading of ["Protection and competition", "What is next"]) expect(briefLine(markdown, heading)).toBe(`- **${heading}:** ${BRIEF_PART_NOT_ESTABLISHED}`);
  });

  // Part C audit (bank, JPM #64): "What could break it: The share price was USD 346.19." and "What it sells:
  // Mortgage fees ... decreased ...". A brief line never cites a market or computed record, and the
  // descriptive parts skip statements of change; risks and what is next keep them.
  it("keeps market and computed figures out of the brief and changes out of the descriptive parts", () => {
    const report = storyReport({
      sells: ["Mortgage fees and related income decreased in Home Lending.", "The bank takes deposits and makes commercial and consumer loans."],
      risks: ["The share price was USD 346.19.", "Operating margin was 50.8% for the fiscal year.", "A merchant filed a putative antitrust class action over card interchange fees."],
    });
    report.catalystsRisks.risks[0]!.reasoning[0]!.source = "payload.quote.price";
    report.catalystsRisks.risks[0]!.reasoning[1]!.source = "computed.quality.operating-margin";
    expect(partTexts(report)).toMatchObject({
      sells: ["The bank takes deposits and makes commercial and consumer loans."],
      risks: ["A merchant filed a putative antitrust class action over card interchange fees."],
    });
    // Control (an unrelated issuer shape): a change statement still answers "what could break it" and "what is next".
    const control = storyReport({ risks: ["Card net charge-offs rose in the quarter."], coming: ["Wafer output increases when the new fab opens in 2027."] });
    expect(partTexts(control)).toMatchObject({ risks: ["Card net charge-offs rose in the quarter."], next: ["Wafer output increases when the new fab opens in 2027."] });
  });

  it("fills each part from the field that answers it (one positive case per part)", () => {
    const report = storyReport({
      sells: ["The company sells industrial pumps and spare parts."],
      buyers: ["Utilities and municipal customers buy most pumps under multi-year contracts.", "The company sources castings from two suppliers."],
      protection: ["The pump design patents expire in 2031."],
      coming: ["A larger pump line enters production in 2027."],
      risks: ["A single utility customer could cancel its framework agreement."],
    });
    expect(partTexts(report)).toEqual({
      sells: ["The company sells industrial pumps and spare parts."],
      buyers: ["Utilities and municipal customers buy most pumps under multi-year contracts."],
      wins: ["The pump design patents expire in 2031."],
      next: ["A larger pump line enters production in 2027."],
      risks: ["A single utility customer could cancel its framework agreement."],
    });
    // The moat assessment answers "why it wins" when protection is empty; concentration answers "what could break it" when risks are.
    const second = storyReport({ moat: ["Customers retrain staff to switch pump brands, which the filing calls costly."], concentration: ["Two customers were 38.0% of revenue."] });
    expect(partTexts(second)).toMatchObject({ wins: ["Customers retrain staff to switch pump brands, which the filing calls costly."], risks: ["Two customers were 38.0% of revenue."] });
    // The moat grade's figure is not a reason the company wins.
    expect(partTexts(storyReport({}))).toMatchObject({ wins: [] });
  });

  // Review round 2 reproductions: a word match cannot prove whose customer a statement names or that a
  // protection statement is a strength, so both parts carry labels that describe their field.
  it("labels the customer and protection parts by their field, never as demand or a strength (review round 2)", () => {
    const report = storyReport({
      buyers: ["Competitors serve municipal customers under long-term contracts."],
      protection: ["The company has no patent protection and competitors can copy its products.", "The reviewed filings provide no details about patent protection or switching costs."],
    });
    const headings = briefOf(report).map(part => part.heading);
    expect(headings).not.toContain("Who buys it");
    expect(headings).not.toContain("Why it wins");
    const markdown = markdownOf(report);
    expect(briefLine(markdown, "Customers and suppliers")).toContain("Competitors serve municipal customers");
    expect(briefLine(markdown, "Protection and competition")).toContain("The company has no patent protection");
    // A statement that the filings give no details is a limitation and never fills a part.
    expect(briefLine(markdown, "Protection and competition")).not.toContain("provide no details");
    expect(briefOf(report).find(part => part.key === "wins")?.claims.map(claim => claim.text)).toEqual(["The company has no patent protection and competitors can copy its products."]);
  });

  it("prints a brief claim in the app even when it is a repeat elsewhere (review round 1)", () => {
    const report = drugMaker();
    report.verdict.executiveSummary = [fact("The company makes branded prescription medicines.")];
    mark(report, "verdict.executiveSummary[0]", "cited");
    const app = renderToStaticMarkup(createElement(ReportView, { report: ReportSchema.parse(report) }));
    const start = app.indexOf(`aria-label="${BUSINESS_BRIEF_HEADING}"`);
    expect(start).toBeGreaterThan(-1);
    const brief = app.slice(start, app.indexOf("dossier-thesis", start));
    expect(brief).toContain("The company makes branded prescription medicines.");
    expect(brief).not.toContain("Also stated here");
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

  it("keeps both copies when the citations resolve to different dates (review round 1)", () => {
    const report = drugMaker();
    const repeated = "Quarterly revenue was $24.40 billion, up 38.6%.";
    report.verdict.executiveSummary = [{ text: repeated, label: "FACT", source: serializeCitationRef({ sourceId: "edgar:10-K item7", asOf: "2025-02-20" }), asOf: null }];
    report.fundamentals.commentary = [{ text: repeated, label: "FACT", source: serializeCitationRef({ sourceId: "edgar:10-K item7", asOf: "2026-02-20" }), asOf: null }];
    mark(report, "verdict.executiveSummary[0]", "validated");
    mark(report, "fundamentals.commentary[0]", "validated");
    for (const text of surfaces(ReportSchema.parse(report))) {
      expect(text.split(repeated).length - 1).toBe(2);
      expect(text).not.toContain("Also stated here");
    }
  });

  it("keeps each score's qualifications beside it in Markdown and print (review round 1, P12)", () => {
    const report = drugMaker();
    const qualifications = [
      "Capital-stewardship proxy, not an assessment of executives",
      "That income-statement denominator trend is not point-in-time outstanding shares or a measure of economic dilution",
      "Management quality, guidance execution and governance are not score inputs",
      "FCF conversion is graded as free cash flow BEFORE stock-based compensation over consolidated net income",
    ];
    report.scores!.aspects.leadership.note = `${qualifications[0]}: repurchase timing. ${qualifications[1]}. ${qualifications[2]}; they are assessed only in the analyst grade.`;
    report.scores!.aspects.balanceSheet.note = `Financial strength. ${qualifications[3]}, the definition used by this unbacktested house-rule band.`;
    for (const text of [markdownOf(report), printOf(report)]) {
      for (const sentence of qualifications) expect(text, sentence).toContain(sentence);
      expect(text).toContain("unbacktested house-rule band");
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
    for (const heading of ["### Score drivers", "### Factor-family exposure", "### Factor contribution sensitivity"]) expect(markdown).not.toContain(heading);
    // D-139: the grade ranges qualify the grades and stay in the body.
    if (report.scores) expect(markdown).toContain("### Attribute grade reliability");
    if (report.scores) expect(markdown).toContain(SCORE_DIAGNOSTICS_NOTE);
    const audit = reportToAuditMarkdown(report);
    expect(audit).toContain("## Bull/bear statements");
    expect(audit).toContain("- Bull: Volume growth keeps outrunning price cuts.");
    expect(audit).toContain("- Bear: Price erosion is structural.");
    if (report.scores) for (const heading of ["### Score drivers", "### Factor contribution sensitivity"]) expect(audit).toContain(heading);
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


  it("states a repeated scenario label once and keeps every assumption and condition (review round 1)", () => {
    const shift = "Year-one shift versus base: revenue growth 15.93 percentage points; both decay to zero by year 10.";
    const lists = scenarioReaderLists({
      assumptions: [shift],
      whatWouldHaveToBeTrue: [`Modeled conditions: ${shift} WACC and terminal assumptions stay at base. Additional qualitative conditions are not numerical prerequisites for this target.`],
      qualitativeCommentary: ["JUDGMENT: Volume keeps outrunning price.", `${SEPARATE_CONDITION_PREFIX}Gross margin holds near 83.9%.`, `${SEPARATE_CONDITION_PREFIX}Deal payments fall below free cash flow.`],
    }, [shift]);
    expect(lists.conditions).toEqual([`Modeled conditions: ${MODELED_SHIFT_REFERENCE} WACC and terminal assumptions stay at base. Additional qualitative conditions are not numerical prerequisites for this target.`]);
    expect(lists.commentary).toEqual(["JUDGMENT: Volume keeps outrunning price."]);
    expect(lists.separateConditions).toEqual(["Gross margin holds near 83.9%.", "Deal payments fall below free cash flow."]);
    // Control: a modeled condition that does not repeat a listed assumption is printed as stored.
    const other = "Modeled conditions: Cost of equity and payout path stay at base.";
    expect(scenarioReaderLists({ assumptions: [shift], whatWouldHaveToBeTrue: [other], qualitativeCommentary: [] }, [shift]).conditions).toEqual([other]);
    // Review round 2 reproductions: a prefix of a longer condition, or a non-shift assumption, prints as stored.
    for (const [assumption, condition] of [["Revenue grows 5%", "Modeled conditions: Revenue grows 5%-10%."], ["WACC remains 8%.", "Modeled conditions: WACC remains 8%. Terminal growth stays at base."]] as const)
      expect(scenarioReaderLists({ assumptions: [assumption], whatWouldHaveToBeTrue: [condition], qualitativeCommentary: [] }, [assumption]).conditions).toEqual([condition]);
    // A shift sentence that is only a prefix of a longer sentence is not replaced either.
    const longer = `Modeled conditions: ${shift.slice(0, -1)} and beyond.`;
    expect(scenarioReaderLists({ assumptions: [shift], whatWouldHaveToBeTrue: [longer], qualitativeCommentary: [] }, [shift]).conditions).toEqual([longer]);
  });

  it("groups per-quarter withheld notes only where item and cause match, naming every quarter (review round 1)", () => {
    const cause = "a complete operating-expense total on the revenue's filed basis is not established.";
    const other = "the provider amount does not bridge gross profit to operating income.";
    expect(groupedWithheldNotes([
      "From the quarterly statement rows.",
      `Operating expenses for 2026-06-30 withheld: ${cause}`,
      `Operating expenses for 2026-03-31 withheld: ${cause}`,
      `Operating expenses for 2025-09-30 withheld: ${other}`,
      `Operating expenses for 2025-06-30 withheld: ${cause}`,
      `Gross margin for 2025-06-30 withheld: ${cause}`,
    ])).toEqual([
      "From the quarterly statement rows.",
      `Operating expenses for 2026-06-30, 2026-03-31 and 2025-06-30 withheld: ${cause}`,
      `Operating expenses for 2025-09-30 withheld: ${other}`,
      `Gross margin for 2025-06-30 withheld: ${cause}`,
    ]);
  });
});
