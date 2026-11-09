import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { describe, expect, it, vi } from "vitest";
import { UiDesignProvider } from "@/appearance/UiDesignProvider";
import { ReportView } from "@/components/report/ReportView";
import { factualValidationText, scoreAuditTables } from "@/report/auditTables";
import { reportToAuditMarkdown, reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { trustHeadline, trustRows } from "@/report/presentation";
import { ProvenanceCoverageSchema, ScoringSchema, type ProvenanceCoverage, type ScoreSignal } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";
import { reportDigest } from "./helpers/uiParityContract";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const signal: ScoreSignal = { id: "recorded", raw: 10, unit: "multiple", transformedScore: 85,
  signalWeight: 1, evidenceFraction: 1, effectiveCompositeWeightPct: 10, contributionPoints: 3.5,
  family: "valuation", asOf: null, period: null, startDate: null, endDate: null, windowYears: null,
  fallbackReason: null, operands: [] };

describe("public-readiness regressions", () => {
  it.each([
    { share: 0.1, signals: [], limited: true },
    { share: 0.49999, signals: [], limited: true },
    { share: 0.8, signals: [signal], limited: true },
    { share: 0.5, signals: [signal, { ...signal, id: "second" }], limited: false },
    { share: 1, signals: [signal], limited: false },
  ])("gates the cover's valuation band at $share evidence without changing its audit ($signals.length signals)", ({ share, signals, limited }) => {
    const report = loadTask28Fixture();
    const scores = report.scores!;
    scores.aspects.valuation = { ...scores.aspects.valuation, score: 85, band: "A", dataCompleteness: share, signals };
    scores.assessments = { businessQuality: { score: null, band: null, basis: "Not recorded" },
      valuation: { score: 85, band: "A", basis: "Saved valuation basis" }, evidenceCompleteness: share, calibration: "unbacktested-house-rules" };
    expect(ScoringSchema.safeParse(scores).success).toBe(true);
    const before = reportDigest(report);
    const window = new Window();
    try {
      window.document.body.innerHTML = renderToStaticMarkup(createElement(ReportView, { report, layout: "dossier" }));
      const dimension = [...window.document.querySelectorAll(".assessment-dimensions dl > div")].find(row => row.querySelector("dt")?.textContent === "Price attractiveness");
      const value = dimension?.querySelector(".assessment-value")?.textContent;
      // RPT-208: reader precision; audit remains two decimals.
      expect(value).toContain("85");
      expect(value).not.toContain("85.00");
      if (limited) {
        expect(value).toContain("limited evidence");
        expect(value).not.toMatch(/\bA\b/);
      } else expect(value).toBe("85 / A");
      expect(dimension?.textContent).toContain("Saved valuation basis");
      expect(scoreAuditTables(scores).find(t => t.heading === "Assessment dimensions")?.rows[1][1]).toBe("85.00 / A");
      expect(reportDigest(report)).toBe(before);
    } finally { void window.happyDOM.close(); }
  });

  const uncertain: Array<{ name: string; factual: NonNullable<ProvenanceCoverage["factualValidation"]> }> = [
    { name: "missing qualitative metadata", factual: { cited: 38, validated: 0, unchecked: 38, contradicted: 0, total: 38, rate: 0 } },
    { name: "uncited claim of unknown numeric kind", factual: { cited: 1, validated: 1, unchecked: 1, contradicted: 0, qualitative: 0, total: 2, rate: 0.5 } },
    { name: "contradicted claim of unknown numeric kind", factual: { cited: 2, validated: 1, unchecked: 0, contradicted: 1, qualitative: 0, total: 2, rate: 0.5 } },
  ];
  it.each(uncertain)("keeps the numeric denominator unknown for $name across reader and detached exports", ({ factual }) => {
    const coverage: ProvenanceCoverage = { numeric: { supported: 107, total: 119, rate: 107 / 119 },
      factualClaims: { supported: factual.cited, total: factual.total, rate: factual.cited / factual.total },
      judgments: { cited: 0, total: 0, rate: null }, factualValidation: factual };
    expect(ProvenanceCoverageSchema.safeParse(coverage).success).toBe(true);
    const report = loadTask28Fixture();
    report.meta.provenanceCoverage = coverage;
    report.appendix.provenanceCoverage = coverage;
    const before = reportDigest(report);
    const row = trustRows(coverage).find(r => r.label.startsWith("Numeric factual"))?.value;
    const outputs = [row, trustHeadline(coverage), factualValidationText(coverage), reportToMarkdown(report), reportToAuditMarkdown(report), reportToPrintBody(report),
      renderToStaticMarkup(createElement(ReportView, { report, layout: "dossier" }))];
    for (const text of outputs) {
      expect(text).toContain("numeric-claim denominator unknown");
      expect(text).not.toContain(`${factual.validated}/${factual.total} numeric`);
    }
    expect(factualValidationText(coverage)).toContain(`${factual.unchecked} unchecked`);
    expect(factualValidationText(coverage)).toContain(`${factual.contradicted} contradicted`);
    expect(factualValidationText(coverage)).toContain("107/119 citation-traced");
    expect(reportDigest(report)).toBe(before);
  });

  it.each(["classic", "dossier"] as const)("gives the reconciliation link one native, focusable destination in %s", layout => {
    const report = loadTask28Fixture();
    const window = new Window();
    try {
      window.document.body.innerHTML = renderToStaticMarkup(createElement(UiDesignProvider, { initialDesign: "workspace", layout }, createElement(ReportView, { report, layout })));
      expect(window.document.querySelector('.workspace-evidence-rail a[href="#report-trust-details"]')).not.toBeNull();
      const targets = window.document.querySelectorAll("#report-trust-details");
      expect(targets).toHaveLength(1);
      expect(targets[0].tagName).toBe("DETAILS");
      expect(targets[0].getAttribute("tabindex")).toBe("-1");
      expect(targets[0].textContent).toContain("original manifest entries remain in the audit");
      expect(targets[0].querySelector('[aria-label="Manifest reconciliation table"]')).not.toBeNull();
      if (layout === "classic") expect(targets[0].closest("#report-appendix")).not.toBeNull();
    } finally { void window.happyDOM.close(); }
  });

  it("retains the established MU partition and distinguishes an empty claim set from an unknown one", () => {
    const coverage: ProvenanceCoverage = { numeric: { supported: 267, total: 271, rate: 267 / 271 },
      factualClaims: { supported: 140, total: 140, rate: 1 }, judgments: { cited: 0, total: 0, rate: null },
      factualValidation: { cited: 140, validated: 36, unchecked: 104, contradicted: 0, qualitative: 19, total: 140, rate: 36 / 140 } };
    expect(trustRows(coverage).find(row => row.label.startsWith("Numeric factual"))?.value).toBe("36/121; 85 not matched to a cited figure");
    expect(trustHeadline(coverage)).toMatch(/^36\/121 \(29\.8%\) numeric claims numerically matched/);
    expect(factualValidationText(coverage)).toContain("85 unmatched numeric claims");
    coverage.factualValidation = { cited: 0, validated: 0, unchecked: 0, contradicted: 0, total: 0, rate: null };
    coverage.factualClaims = { supported: 0, total: 0, rate: null };
    expect(ProvenanceCoverageSchema.safeParse(coverage).success).toBe(true);
    expect(trustHeadline(coverage)).toContain("no factual claim states a figure");
    expect(trustHeadline(coverage)).not.toContain("denominator unknown");
  });
});

it("RPT-208: cover assessment scores use reader precision",()=>{
 const report=loadTask28Fixture(); report.scores!.assessments={businessQuality:{score:78.8,band:"B",basis:"Quality"},valuation:{score:85,band:"A",basis:"Value"},evidenceCompleteness:1,calibration:"unbacktested-house-rules"};
 const html=renderToStaticMarkup(createElement(ReportView,{report,layout:"dossier"}));
 expect(html).not.toContain("78.80");
 expect(scoreAuditTables(report.scores!).find(t=>t.heading==="Assessment dimensions")!.rows[0]![1]).toContain("78.80");
});


it("offers an audit download only for an identified saved report and uses reader scorecard labels", async () => {
  const { AppendixSection, CompositeScorecard } = await import("@/components/report/sections");
  const report = loadTask28Fixture();
  const sample = renderToStaticMarkup(createElement(AppendixSection, { report, index: 14 }));
  expect(sample).not.toContain("are in the separate audit export");
  const saved = renderToStaticMarkup(createElement(AppendixSection, { report, index: 14, selectedReportId: 42 }));
  expect(saved).toContain('/api/export/42?format=audit');
  expect(saved).toContain("download the audit trail");
  const header = renderToStaticMarkup(createElement(CompositeScorecard, { scores: report.scores! }));
  expect(header).not.toContain("SCORE_BANDS_");
  expect(header).toContain("House scoring bands");
});

it("removes narrowly owned workstream annotations while preserving company text", async () => {
  const { withoutDecisionNumbers } = await import("@/report/presentation");
  expect(withoutDecisionNumbers("Different figures (WS6 review, SHOULD-FIX 4)")).toBe("Different figures");
  expect(withoutDecisionNumbers('Growth (house rule, WS6 D-18: median of methods; the former "lower of the 3y/5y CAGR" and sign-disagreement rules are RETIRED).')).toBe("Growth (house rule: median of methods).");
  expect(withoutDecisionNumbers("Growth (house rule D-60/D-65)")).toBe("Growth (house rule)");
  const company = "WS6 Industries sells D-18 and D-60/D-65 equipment. RETIRED employees receive pensions; SHOULD-FIX 4 is a product label.";
  expect(withoutDecisionNumbers(company)).toBe(company);
});

it("uses a plain scorecard header", async () => {
  const { CompositeScorecard } = await import("@/components/report/sections");
  const html = renderToStaticMarkup(createElement(CompositeScorecard, { scores: loadTask28Fixture().scores! }));
  expect(html).not.toContain("SCORE_BANDS_");
  expect(html).toContain("House scoring bands");
});
it("explains the sample's separate fictional dataset beside its company link", async () => {
  const { default: SamplePage } = await import("@/app/report/sample/page");
  expect(renderToStaticMarkup(createElement(SamplePage))).toContain("separate fictional datasets with different figures");
});
