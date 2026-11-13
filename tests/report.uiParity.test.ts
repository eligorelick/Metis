import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { esc, reportToPrintBody } from "@/report/export/printHtml";
import { withPrincipalSummarySafety } from "@/report/principalAggregationSafety";
import { withHistoricalEnterpriseValueSafety } from "@/report/enterpriseValueSafety";
import type { Report } from "@/report/schema";
import { loadTask28Fixture, task28SentinelReport, task28LegacyMissingBlocksReport, task28LegacyOptionalReport } from "./helpers/task28Report";
import { dataOnlyReport, LAYOUT_FIXTURES, longEvidenceReport, missingCurrencyReport } from "./helpers/uiParityFixtures";
import { assertUiParityContract, assertValuationParity, captureUiParityContract, captureValuationParity, classicFactsMissingFromDossier, freezeClassicFacts, freezeReport, frozenFactsMissingFromDossier, readableHtml, reportDigest, type FrozenLayoutFacts } from "./helpers/uiParityContract";
import frozenFacts from "./fixtures/dossier-facts-d246.json";
import { summarizeSensitivity } from "@/report/scenarioPresentation";

function surfaces(report: Report, layout: "classic" | "dossier" = "classic") {
  return {
    live: renderToStaticMarkup(createElement(ReportView, { report, layout })),
    markdown: reportToMarkdown(report), print: reportToPrintBody(report), audit: reportToAuditMarkdown(report),
  };
}

describe("production UI semantic preservation baseline", () => {
  it.each(([
    ["canonical", loadTask28Fixture], ["sentinel context", task28SentinelReport],
    ["legacy missing blocks", task28LegacyMissingBlocksReport], ["legacy optional", task28LegacyOptionalReport],
    ["data-only and limited evidence", dataOnlyReport], ["unknown currency, negative and stale input", missingCurrencyReport],
    ["more than one hundred long claims", longEvidenceReport],
  ] as const).flatMap(([name, makeReport]) => (["classic", "dossier"] as const).map((layout) => [`${name} in ${layout}`, makeReport, layout] as const)))("retains report and export meanings without mutating %s", (_, makeReport, layout) => {
    const report = freezeReport(makeReport());
    const before = reportDigest(report);
    const admitted = withHistoricalEnterpriseValueSafety(withPrincipalSummarySafety(report));
    const contract = captureUiParityContract(admitted);
    const rendered = surfaces(report, layout);
    expect(() => assertUiParityContract(contract, rendered)).not.toThrow();
    expect(() => assertValuationParity(captureValuationParity(report), rendered, layout)).not.toThrow();
    expect(reportDigest(report)).toBe(before);
    expect(contract.figures.length).toBeGreaterThan(0);
  });

  it.each(["warning", "source", "numeric context"])("detects a deliberately omitted %s", (kind) => {
    const report = loadTask28Fixture();
    report.appendix.missingData.push({ field: "ui.parity.sentinel", severity: "critical", reason: "PARITY-WARNING-MUST-SURVIVE" });
    report.fundamentals.graded.keyNumbers[0] = {
      ...report.fundamentals.graded.keyNumbers[0]!, sourceId: "PARITY-SOURCE-MUST-SURVIVE", period: "PARITY-PERIOD-MUST-SURVIVE",
    };
    const contract = captureUiParityContract(withHistoricalEnterpriseValueSafety(withPrincipalSummarySafety(report)));
    const rendered = surfaces(report);
    const marker = kind === "warning" ? "PARITY-WARNING-MUST-SURVIVE" : kind === "source" ? "PARITY-SOURCE-MUST-SURVIVE" : "PARITY-PERIOD-MUST-SURVIVE";
    rendered.audit = rendered.audit.replaceAll(marker, "REMOVED");
    expect(() => assertUiParityContract(contract, rendered)).toThrow(/Missing/);
  });

  it("does not count hidden duplicate content as accessible report text", () => {
    expect(readableHtml('<p>Visible</p><div hidden>Hidden warning</div><span class="sr-only">Duplicate</span><script>fake source</script>').text).toBe("Visible");
  });
});


function layouts(report: Report) {
  return {
    classic: renderToStaticMarkup(createElement(ReportView, { report, layout: "classic" })),
    dossier: renderToStaticMarkup(createElement(ReportView, { report, layout: "dossier" })),
  };
}

describe("the dossier shows every fact the classic layout shows (D-241, P22)", () => {
  it.each(LAYOUT_FIXTURES)("%s", (_, makeReport) => {
    const { classic, dossier } = layouts(freezeReport(makeReport()));
    expect(classicFactsMissingFromDossier(classic, dossier)).toEqual([]);
  });

  it("detects a classic fact the dossier dropped, a row whose parts survive apart, and hidden duplicates", () => {
    const report = loadTask28Fixture();
    report.appendix.missingData.push({ field: "ui.layout.sentinel", severity: "warn", reason: "PARITY-FACT-MUST-SURVIVE" });
    const { classic, dossier } = layouts(report);
    expect(classicFactsMissingFromDossier(classic, dossier)).toEqual([]);
    expect(classicFactsMissingFromDossier(classic, dossier.replaceAll("PARITY-FACT-MUST-SURVIVE", "REMOVED"))).toContain("PARITY-FACT-MUST-SURVIVE");
    const row = "<table><tbody><tr><th>Net debt</th><td>$65.5</td></tr></tbody></table>";
    expect(classicFactsMissingFromDossier(row, "<p>$65.5</p><p>Net debt</p>")).toContain("Net debt$65.5");
    expect(classicFactsMissingFromDossier("<p>Recorded gap</p>", '<p hidden>Recorded gap</p><span class="sr-only">Recorded gap</span>')).toEqual(["Recorded gap"]);
  });

  it("accepts only the listed classic wording and grid rounding, not a changed value", () => {
    expect(classicFactsMissingFromDossier("<h3>composite scorecard</h3>", "<h3>Deterministic scorecard</h3>")).toEqual([]);
    const grid = "<table><tbody><tr><th>8.5%</th><td>$161</td><td>$1,162</td></tr></tbody></table>";
    expect(classicFactsMissingFromDossier(grid, "<table><tr><th>8.5%</th><td>$161.37</td><td>$1,161.50</td></tr></table>")).toEqual([]);
    expect(classicFactsMissingFromDossier("<table><tr><td>$112</td></tr></table>", "<table><tr><td>$112.50</td></tr></table>")).toEqual([]);
    expect(classicFactsMissingFromDossier(grid, "<table><tr><th>8.5%</th><td>$161.37</td><td>$1,170.00</td></tr></table>")).not.toEqual([]);
    // Review of D-241: a longer dossier number that contains the classic digits does not show the classic figure.
    const cell = "<table><tr><th>8.5%</th><td>$161</td></tr></table>";
    expect(classicFactsMissingFromDossier(cell, "<table><tr><th>8.5%</th><td>$1610.00</td></tr></table>")).not.toEqual([]);
    expect(classicFactsMissingFromDossier(cell, "<table><tr><th>8.5%</th><td>$2161</td></tr></table>")).not.toEqual([]);
    expect(classicFactsMissingFromDossier("<p>Fair value $161</p>", "<p>Fair value $161.37</p>")).toEqual(["Fair value $161"]);
    // Adjacent cells and sentence punctuation do not run numbers together.
    expect(classicFactsMissingFromDossier(cell, "<table><tr><th>8.5%</th><td>$161</td><td>5.2%</td></tr></table>")).toEqual([]);
    expect(classicFactsMissingFromDossier("<p>Value $161</p>", "<p>Value $161. 2025 was strong.</p>")).toEqual([]);
  });

  it("outlines the same base-case cell in both sensitivity grids", () => {
    const report = task28SentinelReport();
    report.valuation.dcf.sensitivityGrid = [7, 8, 9].flatMap(waccPct => [2, 3, 4].map(gTermPct => ({ waccPct, gTermPct, perShare: waccPct * 10 + gTermPct })));
    const { classic, dossier } = layouts(report);
    const outlined = (html: string) => Array.from(html.matchAll(/aria-label="WACC ([\d.]+)% growth ([\d.]+)%[^"]*"[^>]*style="[^"]*outline:1px solid var\(--accent\)/g), m => `${m[1]}/${m[2]}`)
      .concat(Array.from(html.matchAll(/style="[^"]*outline:1px solid var\(--accent\)[^"]*"[^>]*aria-label="WACC ([\d.]+)% growth ([\d.]+)%/g), m => `${m[1]}/${m[2]}`));
    expect(outlined(classic)).toEqual(["8/3"]);
    expect(outlined(dossier)).toEqual(["8/3"]);
  });
});

/**
 * D-246: the frozen form of the D-241 guarantee. The classic layout is
 * removed, so the facts it showed for each parity fixture were frozen from
 * both layouts (tests/fixtures/dossier-facts-d246.json, freezeClassicFacts)
 * while both still existed; the dossier must keep rendering every one.
 */
const FROZEN_FACTS = (frozenFacts as unknown as { fixtures: Record<string, FrozenLayoutFacts> }).fixtures;

describe("the dossier keeps every fact classic showed, frozen when classic was removed (D-246, P22)", () => {
  it("freezes one entry per parity fixture, each with facts", () => {
    expect(Object.keys(FROZEN_FACTS)).toEqual(LAYOUT_FIXTURES.map(([name]) => name));
    for (const [name] of LAYOUT_FIXTURES) expect(FROZEN_FACTS[name]!.segments.length, name).toBeGreaterThan(300);
  });

  it.each(LAYOUT_FIXTURES)("the dossier renders every frozen fact: %s", (name, makeReport) => {
    const dossier = renderToStaticMarkup(createElement(ReportView, { report: freezeReport(makeReport()), layout: "dossier" }));
    expect(frozenFactsMissingFromDossier(FROZEN_FACTS[name]!, dossier)).toEqual([]);
  });

  it.each(LAYOUT_FIXTURES)("the frozen facts are exactly what both layouts show at the freeze: %s", (name, makeReport) => {
    const { classic, dossier } = layouts(freezeReport(makeReport()));
    expect(freezeClassicFacts(classic, dossier)).toEqual(FROZEN_FACTS[name]);
  });

  it("detects a dropped fact, a row whose parts survive apart, a re-rounded grid row and hidden duplicates", () => {
    const facts = FROZEN_FACTS.canonical!;
    const dossier = renderToStaticMarkup(createElement(ReportView, { report: loadTask28Fixture(), layout: "dossier" }));
    expect(frozenFactsMissingFromDossier(facts, dossier)).toEqual([]);
    const dropped = facts.segments.find((text) => text.length > 30 && dossier.split(text).length === 2)!;
    expect(dropped).toBeDefined();
    expect(frozenFactsMissingFromDossier(facts, dossier.replace(dropped, "REMOVED"))).toEqual([dropped]);
    const row = { segments: ["Net debt$65.5"], roundedRows: [] };
    expect(frozenFactsMissingFromDossier(row, "<table><tr><th>Net debt</th><td>$65.5</td></tr></table>")).toEqual([]);
    expect(frozenFactsMissingFromDossier(row, "<p>$65.5</p><p>Net debt</p>")).toEqual(["Net debt$65.5"]);
    const grid = { segments: [], roundedRows: [["8.5%", "$161", "$1,162"]] };
    expect(frozenFactsMissingFromDossier(grid, "<table><tr><th>8.5%</th><td>$161.37</td><td>$1,161.50</td></tr></table>")).toEqual([]);
    expect(frozenFactsMissingFromDossier(grid, "<table><tr><th>8.5%</th><td>$161.37</td><td>$1,170.00</td></tr></table>")).toEqual(["8.5% | $161 | $1,162"]);
    expect(frozenFactsMissingFromDossier({ segments: ["Recorded gap"], roundedRows: [] }, '<p hidden>Recorded gap</p><span class="sr-only">Recorded gap</span>')).toEqual(["Recorded gap"]);
    expect(frozenFactsMissingFromDossier({ segments: ["$161"], roundedRows: [] }, "<p>$1610.00</p>")).toEqual(["$161"]);
    expect(frozenFactsMissingFromDossier({ segments: ["$161"], roundedRows: [] }, "<p>$161</p><p>0.00</p>")).toEqual([]);
  });
});

/**
 * A report whose fair value survives the current-use check ("current"), or
 * becomes a dated reference ("reference"): the quote is dated after the
 * valuation. Modelled on tests/report.valuationUseSafety.test.ts.
 */
function valuedReport(mode: "current" | "reference", perShare = 123.45, upsidePct: number | null = 23.45): Report {
  const report = task28SentinelReport();
  report.fairValue = { status: "available", method: "fcff-dcf", methodVersion: "PARITY", perShare: {
    value: perShare, unit: "USD/share", source: "computed.valuation.dcf.perShare", asOf: "2025-12-31", verified: true,
  }, upsidePct, basis: ["PARITY recorded supported calculation"], reasons: [] };
  report.valuation.dcf.perShare = structuredClone(report.fairValue.perShare);
  report.valuation.dcf.upsidePct = upsidePct;
  report.valuation.dcf.bridge = { enterpriseValue: 1300, netDebt: 65.5, minorityInterest: 0, preferredEquity: 0,
    equityValue: 1234.5, dilutedShares: 10, presentValueExplicit: 600, presentValueTerminal: 700, currency: "USD", asOf: "2025-12-31" };
  report.valuation.marketValueScope = { status: "unverified-vendor-scope", marketCap: 1000, economicShares: null,
    currency: "USD", shareCountAsOf: null, priceAsOf: mode === "current" ? "2025-12-31" : "2026-07-20", approximate: false,
    basis: "Synthetic same-currency quote", enterpriseValue: 1065.5, enterpriseValueBasis: "Synthetic bridge" };
  return report;
}

describe("valuation display parity (P22)", () => {
  const cases: ReadonlyArray<readonly [string, () => Report]> = [
    ["upside that rounds half up (12.35)", () => valuedReport("current", 123.45, 12.35)],
    ["negative upside that rounds to zero (-0.04)", () => valuedReport("current", 123.45, -0.04)],
    ["no recorded comparison", () => valuedReport("current", 123.45, null)],
    ["unrounded dated reference value", () => valuedReport("reference", 31.4876543)],
    ["withheld headline value", () => { const report = valuedReport("current"); report.valuation.dcf.perShare = null; return report; }],
    ["excess-return method", () => { const report = valuedReport("current"); report.fairValue!.method = "excess-return"; return report; }],
    ["computed scenario weights", () => {
      const report = valuedReport("current");
      report.valuation.dcf.sensitivityGrid = [{ waccPct: 8, gTermPct: 2, perShare: 50 }, { waccPct: 9, gTermPct: 3, perShare: 60 }];
      report.scenarioPresentation = { methodVersion: "parity", weightBasis: "PARITY display weight basis", interpretation: "PARITY interpretation",
        sensitivity: summarizeSensitivity(report.valuation.dcf.sensitivityGrid, 100) };
      report.valuation.scenarios = report.valuation.scenarios.map(s => ({ ...s, probability: s.name === "base" ? 0.5 : null }));
      return report;
    }],
  ];

  it.each(cases.flatMap(([name, make]) => (["classic", "dossier"] as const).map(layout => [`${name} in ${layout}`, make, layout] as const)))(
    "every surface shows its decided valuation text: %s", (_, make, layout) => {
      const report = freezeReport(make());
      const contract = captureValuationParity(report);
      expect(contract.markdown.length).toBeGreaterThan(0);
      expect(() => assertValuationParity(contract, surfaces(report, layout), layout)).not.toThrow();
    });

  it("states the rounding every surface shares for 12.35 and -0.04", () => {
    const up = captureValuationParity(valuedReport("current", 123.45, 12.35));
    const flat = captureValuationParity(valuedReport("current", 123.45, -0.04));
    for (const surface of ["markdown", "print", "classic", "dossier"] as const) {
      expect(up[surface].find(t => t.label === "comparison")?.text).toBe("+12.4%");
      expect(flat[surface].find(t => t.label === "comparison")?.text).toBe("0.0%");
    }
  });

  it.each(["headline label", "comparison", "basis caveat", "base target"])("detects a renderer that drops or re-decides the %s", (label) => {
    const report = valuedReport("current", 123.45, 12.35);
    const contract = captureValuationParity(report);
    const rendered = surfaces(report);
    const text = contract.print.find(t => t.label === label)!.text;
    rendered.print = rendered.print.replaceAll(esc(text), "REMOVED");
    expect(() => assertValuationParity(contract, rendered, "classic")).toThrow(/Missing print valuation/);
  });
});
