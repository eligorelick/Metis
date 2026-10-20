import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { reportToAuditMarkdown, reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import type { Report } from "@/report/schema";
import { valuationReviewBlocks } from "@/report/researchReview";

function fixture(): Report {
  const report = JSON.parse(readFileSync("fixtures/report/DEMO-sample.json", "utf8"));
  report.scenarioPresentation = {
    methodVersion: "test", weightBasis: "Fixed display prior; not calibrated odds.",
    interpretation: "Sensitivity values describe present intrinsic value.",
    sensitivity: { status: "sensitive", conclusion: "The valuation conclusion changes within the modeled grid.", validCells: 25, totalCells: 25, minPerShare: 70, maxPerShare: 180 },
  };
  report.thesisTriggers = [{ id: "reverse-growth", metric: "Supported constant annual revenue growth", comparator: "below", threshold: { value: 7.25, unit: "%", source: "computed.valuation.reverseDcf", asOf: null }, horizon: "Across 10 explicit forecast years", fixedAssumptions: ["Discount rate and margin path held fixed."], consequence: "Reassess the valuation when evidence no longer supports this threshold." }];
  report.valuation.peerCoverage = { methodology: ["Same industry; comparable reporting currency."], candidates: 6, evaluated: 5, eligible: ["PEERA", "PEERB", "PEERC", "PEERD"], exclusions: [{ symbol: "BAD", reason: "Currency unknown <untrusted>" }], comparisons: [{ name: "Market cap / TTM common earnings", current: 20, peerMedian: 18, peerCount: 4, basis: "Common earnings, four quarters." }] };
  report.valuation.multiples[0].peerCount = 4;
  report.valuation.scenarios[0].qualitativeCommentary = ["Demand could improve; this is commentary, not a model input."];
  return report as Report;
}

const surfaces = (report: Report) => ({
  app: renderToStaticMarkup(createElement(ReportView, { report })),
  markdown: reportToMarkdown(report),
  print: reportToPrintBody(report),
});

describe("research reliability report surfaces", () => {
  it("shows actionable thresholds, fixed assumptions and provenance on every surface", () => {
    for (const rendered of Object.values(surfaces(fixture()))) {
      expect(rendered).toContain("What would change the assessment");
      expect(rendered).toContain("7.25%");
      expect(rendered).toContain("10 explicit forecast years");
      expect(rendered).toContain("Discount rate and margin path held fixed.");
      // D-62: the trigger names its source by reader label.
      expect(rendered).toContain("Source: Reverse DCF");
      expect(rendered).toContain("Reassess the valuation");
    }
  });

  it("distinguishes computational weights, sensitivities and qualitative commentary", () => {
    for (const rendered of Object.values(surfaces(fixture()))) {
      expect(rendered).toMatch(/display weight/i);
      expect(rendered).toContain("not calibrated odds");
      expect(rendered).toContain("changes within the modeled grid");
      expect(rendered).toContain("Qualitative commentary");
      expect(rendered).toContain("Demand could improve");
    }
  });

  it("surfaces the peer selection basis, counts, excluded evidence and compatible comparison", () => {
    const report = fixture();
    const result = surfaces(report);
    // D-67: the body keeps a two-line summary and the comparison table; the
    // screen rules and each exclusion with its reason are in the audit export.
    for (const rendered of Object.values(result)) {
      expect(rendered).toContain("Peer comparison coverage");
      expect(rendered).toContain("5 of 6 candidate issuers evaluated; eligible: PEERA, PEERB, PEERC, PEERD; 1 excluded at the screen.");
      expect(rendered).toContain("Market cap / TTM common earnings");
      expect(rendered).toContain("18.0×");
      expect(rendered).not.toContain("Same industry; comparable reporting currency.");
      expect(rendered).not.toContain("Currency unknown");
    }
    const audit = reportToAuditMarkdown(report);
    expect(audit).toContain("Same industry; comparable reporting currency.");
    expect(audit).toContain("Excluded — BAD: Currency unknown");
    expect(audit).toContain("Common earnings, four quarters.");
    expect(result.app).not.toContain("<untrusted>");
    expect(result.print).not.toContain("<untrusted>");
  });

  // AMZN audit 2026-10-20 finding 7: the body said "1 of 7 candidate issuers
  // evaluated; eligible: none; 11 excluded at the screen" when a rate limit had
  // stopped collection: six candidates got no data, and the subject's own
  // exclusion was counted as a candidate's. The audit read that as a screen too strict.
  it("does not count candidates the peer provider never served, or the subject, as excluded at the screen", () => {
    const report = fixture();
    const limited = "FMP quota/rate limit (HTTP 429): Limit Reach. Live requests paused until 2026-10-20T06:58:38.335Z.";
    report.valuation.peerCoverage = { methodology: ["Exact normalized industry AND sector."], candidates: 7, evaluated: 1, eligible: [], comparisons: [],
      exclusions: [
        ...["SMALLA", "SMALLB", "SMALLC"].map((symbol) => ({ symbol, reason: "size screen: market cap 6.67B is 424× smaller than the subject's 2.83T, outside the 100× comparable-size band (house rule D-65)" })),
        { symbol: "ADRA", reason: "ordinary active non-ADR equity status not established" },
        ...["PEERB", "PEERC", "PEERD", "PEERE", "PEERF"].map((symbol) => ({ symbol, reason: "provider unavailable or optional deadline exhausted; candidate not requested" })),
        { symbol: "DEMO", reason: "Common earnings comparison: common ownership unproven" },
        { symbol: "PEERA", reason: limited },
      ] };
    for (const rendered of Object.values(surfaces(report))) {
      expect(rendered).toContain("1 of 7 candidate issuers evaluated; eligible: none; 4 excluded at the screen; 6 not compared because the peer data provider hit its rate limit or quota.");
      expect(rendered).not.toContain("11 excluded");
    }
  });
  // Independent review of these fixes: candidates past the house's own
  // candidate cap are neither screened out nor the provider's failure.
  it("counts candidates beyond the house candidate limit on their own", () => {
    const report = fixture();
    report.valuation.peerCoverage = { methodology: ["Exact normalized industry AND sector."], candidates: 12, evaluated: 10, eligible: ["PEERA", "PEERB", "PEERC", "PEERD"], comparisons: [],
      exclusions: [
        ...["SMALLA", "SMALLB", "SMALLC", "SMALLD", "SMALLE", "SMALLF"].map((symbol) => ({ symbol, reason: "size screen: market cap 6.67B is 424× smaller than the subject's 2.83T, outside the 100× comparable-size band (house rule D-65)" })),
        ...["EXTRA1", "EXTRA2"].map((symbol) => ({ symbol, reason: "optional candidate budget limit (10)" })),
      ] };
    for (const rendered of Object.values(surfaces(report))) {
      expect(rendered).toContain("10 of 12 candidate issuers evaluated; eligible: PEERA, PEERB, PEERC, PEERD; 6 excluded at the screen; 2 beyond the 10-candidate limit.");
      expect(rendered).not.toContain("peer data provider");
    }
  });

  it("keeps legacy reports readable without inventing a new review block", () => {
    const report = JSON.parse(readFileSync("fixtures/report/DEMO-sample.json", "utf8")) as Report;
    for (const rendered of Object.values(surfaces(report))) {
      expect(rendered).not.toContain("What would change the assessment");
      expect(rendered).not.toContain("Peer comparison coverage");
    }
  });

  it("prints dated currency milestones and reports unavailable peers without invented comparisons", () => {
    const report = fixture();
    report.thesisTriggers![0].threshold = { value: 1_000_000, unit: "USD", currency: "USD", source: "computed.projections.revenue.base", asOf: "2026-10-13", period: "FY2027", verified: null };
    const blocks = valuationReviewBlocks({ thesisTriggers: report.thesisTriggers, peerCoverage: { methodology: ["Data unavailable."], candidates: 0, evaluated: 0, eligible: [], exclusions: [], comparisons: [] } });
    const text = JSON.stringify(blocks);
    expect(text).toContain("as of 2026-10-13; period FY2027");
    expect(text).toContain("0 of 0 candidate issuers evaluated; eligible: none.");
    expect(text).not.toContain("Excluded or unavailable comparisons");
    expect(text).not.toContain("peer median");
    expect(blocks[0].items[0].title).toContain("1");
    delete report.thesisTriggers![0].threshold.currency;
    expect(valuationReviewBlocks({ thesisTriggers: report.thesisTriggers })[0].items).toHaveLength(1);
  });
});
