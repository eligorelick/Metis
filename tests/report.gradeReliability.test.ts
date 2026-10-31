import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompositeScorecard } from "@/components/report/sections";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { gradeReliabilityTable } from "@/report/presentation";
import { loadTask28Fixture } from "./helpers/task28Report";

const heading = "Attribute grade reliability";

function reliabilityReport() {
  const report = loadTask28Fixture();
  const aspects = report.scores!.aspects;
  Object.assign(aspects.fundamentals, { score: 80, band: "B", dataCompleteness: .5, applicableCompleteness: .5, notApplicableReason: null });
  Object.assign(aspects.valuation, { score: 75, band: "B", dataCompleteness: 1, notApplicableReason: null });
  delete aspects.valuation.applicableCompleteness;
  Object.assign(aspects.quality, { score: 80, band: "B", dataCompleteness: .25, applicableCompleteness: 1, notApplicableReason: null });
  Object.assign(aspects.moat, { score: null, band: null, applicableCompleteness: null, notApplicableReason: "Route excludes moat" });
  Object.assign(aspects.technicals, { score: null, band: null, applicableCompleteness: 1, notApplicableReason: null });
  Object.assign(aspects.balanceSheet, { score: 80, band: "B", applicableCompleteness: .9999, notApplicableReason: null });
  return report;
}

describe("attribute grade reliability across reader scorecards", () => {
  it("pairs each attribute with its own applicable coverage and rounds ranges outward", () => {
    const report = reliabilityReport();
    Object.assign(report.scores!.aspects.fundamentals, { score: 80.125, applicableCompleteness: .5 });
    expect(gradeReliabilityTable(report.scores!).rows.slice(0, 4)).toEqual([
      ["Fundamentals", "50.0%", "40.06–90.07", "D–A"],
      ["Valuation", "Unknown", "Unavailable: applicable coverage not recorded", "Unavailable"],
      ["Quality", "100.0%", "80–80", "B–B"],
      ["Balance Sheet", "<100.0%", "79.99–80.01", "B–B"],
    ]);
  });

  it("renders missing-input ranges and unavailable legacy/route/unscored states without changing scores", () => {
    const report = reliabilityReport();
    const before = structuredClone(report);
    const surfaces = [
      renderToStaticMarkup(createElement(CompositeScorecard, { scores: report.scores! })),
      renderToStaticMarkup(createElement(CompositeScorecard, { scores: report.scores!, mode: "cover" })),
      reportToMarkdown(report),
      reportToPrintBody(report),
    ];
    for (const surface of surfaces) {
      expect(surface).toContain(heading);
      expect(surface).toContain("40–90");
      expect(surface).toContain("80–80");
      expect(surface).toContain("Conditional band possibilities");
      expect(surface).toContain("D–A");
      expect(surface).toContain("B–B");
      expect(surface).toContain("they are not assessed grades");
      expect(surface).toContain("Unavailable: applicable coverage not recorded");
      expect(surface).toContain("Unavailable: route-inapplicable attribute");
      expect(surface).toContain("Unavailable: attribute not scored");
      expect(surface).toContain("Missing-input sensitivity");
      expect(surface).toContain("not a probability interval");
      expect(surface).toContain("Recorded scores, grades and weights stay unchanged");
    }
    // The cover diagnostic remains visible without expanding methodology details.
    expect(surfaces[1].indexOf(heading)).toBeLessThan(surfaces[1].indexOf('<details class="dossier-score-audit"'));
    expect(report).toEqual(before);
  });

  it("shows band possibilities from unrounded endpoints on each surface while preserving headline grade floors", () => {
    const report = reliabilityReport();
    Object.assign(report.scores!.aspects.fundamentals, { score: 9.999, dataCompleteness: .25, applicableCompleteness: .5 });
    const before = structuredClone(report);
    expect(gradeReliabilityTable(report.scores!).rows[0]).toEqual(["Fundamentals", "50.0%", "4.99–55", "F–D"]);
    for (const surface of [
      renderToStaticMarkup(createElement(CompositeScorecard, { scores: report.scores! })),
      renderToStaticMarkup(createElement(CompositeScorecard, { scores: report.scores!, mode: "cover" })),
      reportToMarkdown(report), reportToPrintBody(report),
    ]) {
      expect(surface).toContain("4.99–55");
      expect(surface).toContain("F–D");
      expect(surface).toContain("limited evidence");
      expect(surface).toContain("unrounded endpoints");
    }
    expect(report).toEqual(before);
  });

  it("escapes the less-than coverage marker in HTML and Markdown", () => {
    const report = reliabilityReport();
    for (const html of [renderToStaticMarkup(createElement(CompositeScorecard, { scores: report.scores! })), reportToPrintBody(report)]) {
      const diagnostic = html.slice(html.indexOf(heading));
      expect(diagnostic).toContain("&lt;100.0%");
      expect(diagnostic).not.toContain("<100.0%");
    }
    const markdown = reportToMarkdown(report);
    expect(markdown.slice(markdown.indexOf(heading))).toContain("\\<100.0%");
  });

  it("keeps legacy reports readable and reports their coverage as unknown", () => {
    const report = loadTask28Fixture();
    for (const aspect of Object.values(report.scores!.aspects)) delete aspect.applicableCompleteness;
    for (const surface of [reportToMarkdown(report), reportToPrintBody(report)]) {
      expect(surface).toContain(heading);
      expect(surface).toContain("Unavailable: applicable coverage not recorded");
    }
    delete report.scores;
    expect(reportToMarkdown(report)).not.toContain(heading);
    expect(reportToPrintBody(report)).not.toContain(heading);
  });
});
