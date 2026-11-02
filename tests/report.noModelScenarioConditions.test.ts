import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { unavailableCashFlowModel } from "@/report/readerConventions";
import type { Report } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";

/**
 * Integration review of R3 (FIGR paid audit). R3 replaced absent cash-flow model
 * scaffolding (targets, probabilities, sensitivity, shared deterministic
 * assumptions) with one route explanation, but its no-model branch also dropped
 * every scenario card, and with it each case's "What would have to be true" and
 * qualitative commentary. On the paid FIGR report those are the analysis's own
 * bull/base/bear conditions (fee-revenue share, Kiavi funding, tax normalisation,
 * take-rate compression, purchaser liquidity). The scaffolding stays withheld; the
 * stated conditions stay, with lines every case shares stated once.
 */
function noModelReport(): Report {
  const r = loadTask28Fixture();
  r.valuation.dcf = { ...r.valuation.dcf, perShare: null, upsidePct: null, assumptions: [], sensitivityGrid: [] };
  delete r.valuation.dcf.forecastRows;
  delete r.valuation.dcf.excessReturnGrid;
  r.valuation.reverseDcf = { impliedMetric: "n/a", impliedValue: null, narrative: "No reverse DCF applies to this route." };
  r.fairValue = { status: "suppressed", method: null, methodVersion: "test", perShare: null, upsidePct: null, basis: [],
    reasons: [{ field: "valuation.fairValue", reason: "Cash-flow valuation is unavailable for this route.", severity: "info" }] };
  const shared = "Shared condition: the next two quarterly reports confirm the trend.";
  r.valuation.scenarios = r.valuation.scenarios.map(s => ({ ...s, priceTarget: null, probability: null, horizon: "n/a",
    assumptions: ["No model assumptions available."],
    whatWouldHaveToBeTrue: [`Fee revenue keeps gaining share in the ${s.name} case.`, shared],
    qualitativeCommentary: [`Commentary for the ${s.name} case stays qualitative.`] }));
  if (r.projections) r.projections = { ...r.projections, series: [] };
  return r;
}

const surfaces = (r: Report): [string, string][] => [
  ["markdown", reportToMarkdown(r)],
  ["print", reportToPrintBody(r)],
  ["app", renderToStaticMarkup(createElement(ReportView, { report: r }))],
];

describe("R3 review: scenario conditions survive an unavailable cash-flow model", () => {
  it("is the no-model route", () => {
    expect(unavailableCashFlowModel(noModelReport())).toBe(true);
    expect(noModelReport().valuation.scenarios.map(s => s.name)).toEqual(["bull", "base", "bear"]);
  });

  it("keeps each case's stated conditions and commentary on every reader surface", () => {
    for (const [surface, text] of surfaces(noModelReport())) {
      expect(text, surface).toContain("Scenario conditions (qualitative)");
      for (const name of ["bull", "base", "bear"]) {
        expect(text, surface).toContain(`Fee revenue keeps gaining share in the ${name} case.`);
        expect(text, surface).toContain(`Commentary for the ${name} case stays qualitative.`);
      }
    }
  });

  it("states a condition every case shares once and keeps the withheld scaffolding out", () => {
    for (const [surface, text] of surfaces(noModelReport())) {
      expect(text.split("Shared condition: the next two quarterly reports confirm the trend.").length - 1, surface).toBe(1);
      expect(text, surface).not.toContain("per-share target unavailable");
      expect(text, surface).not.toContain("No model assumptions available");
      expect(text, surface).not.toContain("Assumptions common to every scenario");
    }
  });

  it("adds no empty block when no case states a condition", () => {
    const r = noModelReport();
    r.valuation.scenarios = r.valuation.scenarios.map(s => ({ ...s, whatWouldHaveToBeTrue: [], qualitativeCommentary: [] }));
    for (const [surface, text] of surfaces(r)) expect(text, surface).not.toContain("Scenario conditions (qualitative)");
  });
});
