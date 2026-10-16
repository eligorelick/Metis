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
