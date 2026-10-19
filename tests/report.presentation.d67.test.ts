/**
 * D-67: presentation and data-completeness defects from the audit of the
 * final NVDA rerun (report 1, 2026-10-16): long decimals and ".00M" in the
 * body, raw registry ids and mechanical labels, the annual segment tables,
 * the peer methodology, the executive cards, the limited-evidence grade, the
 * EPS bridge that did not foot, the warning count, and the "shaded band".
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReportView } from "@/components/report/ReportView";
import { GradeReasoning } from "@/components/report/primitives";
import { gradeDisplayLabel } from "@/report/assessment";
import { classifyManifest, deriveReportCompletenessPresentation } from "@/report/completeness";
import { reportToAuditMarkdown, reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import { formatFinancialValue } from "@/report/format";
import {
  confidenceText,
  dataGapTables,
  dataStateText,
  executiveGroups,
  figureValueText,
  gapCountText,
  gapSummary,
  humanizeInlineCitations,
  metricLabel,
  readerPrecision,
  scorecardTable,
  signalValueText,
  withoutChartReferences,
} from "@/report/presentation";
import { ReportSchema, type FilingDisclosures, type Report } from "@/report/schema";
import type { ManifestEntry } from "@/types/core";
import { loadTask28Fixture } from "./helpers/task28Report";

/** A registry id or manifest field as it would read in prose (not a URL host). */
const RAW_ID = /(?<![\w./-])(?:(?:computed|payload|manifest|keyless|llm|verify)\.[A-Za-z0-9]|fmp\.[A-Za-z]+\(|(?:edgar|sec|fred):[A-Za-z0-9])/;

const visibleText = (html: string): string => {
  let out = html;
  let prev: string;
  // Drop the collapsed provenance of every <details> (it is the audit drill-down).
  do {
    prev = out;
    out = out.replace(/<\/summary>((?:(?!<details)[\s\S])*?)<\/details>/g, "</summary></details>");
  } while (out !== prev);
  return out.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ");
};

describe("figures in stored prose at reader precision", () => {
  it("rounds what the passes over-stated and leaves stated precision alone", () => {
    expect(readerPrecision("Our base-case DCF value is USD 296.3179 per share.")).toBe("Our base-case DCF value is USD 296.32 per share.");
    expect(readerPrecision("Interest coverage was 426.7365x; the AQI index was 1.5671x and TATA 0.0839x.")).toBe("Interest coverage was 426.7×; the AQI index was 1.57× and TATA 0.084×.");
    expect(readerPrecision("growth is 82.1353% over 4.6841 percentage points; revenue USD 1.7836 trillion; M -1.7161.")).toBe("growth is 82.1% over 4.7 percentage points; revenue USD 1.78 trillion; M -1.72.");
    expect(readerPrecision("The valuation score was 85.96 on the 0–100 scale.")).toBe("The valuation score was 86 on the 0–100 scale.");
    expect(readerPrecision("against the guided run-rate $432.00B")).toBe("against the guided run-rate $432B");
    // A coupon, an exact-to-the-million amount, a version and a timestamp are as written.
    const kept = "4.250% Notes due 2028; USD 7.771 billion; spec 1.18.0; 2026-10-16T04:37:46.983Z; raw 2.217";
    expect(readerPrecision(kept)).toBe(kept);
    expect(readerPrecision(readerPrecision("USD 296.3179 per share"))).toBe("USD 296.32 per share");
  });

  it("prints typed FCF conversion and accrual ratios in whole percent while preserving model prose", () => {
    expect(readerPrecision("FCF conversion before SBC was 0.6585x.", "computed.current-capital.fcf-conversion-before-sbc")).toBe("FCF conversion before SBC was 0.6585x.");
    expect(figureValueText({ value: 0.6584750024626839, unit: "x", currency: null, source: "computed.capital.current.fcfConversionBeforeSbc" })).toBe("66%");
    expect(figureValueText({ value: 0.5977, unit: "x", currency: null, source: "computed.forensics.accruals.cashFlowAccrualRatio" })).toBe("60%");
    expect(signalValueText({ id: "fcfConversionBeforeSbc", raw: 0.6584750024626839, unit: "frac" })).toBe("66%");
    expect(figureValueText({ value: 4, unit: "score", currency: null, source: "computed.forensics.piotroski-f-9-signals" })).toBe("4/9");
    expect(figureValueText({ value: 426.7365, unit: "x", currency: null, source: "computed.current-capital.interest-coverage" })).toBe("426.7×");
  });

  it("drops the decimals a whole amount never stated, in report money only", () => {
    expect(formatFinancialValue(959_000_000, "currency", "USD")).toBe("$959M");
    expect(formatFinancialValue(-175_000_000, "currency", "USD")).toBe("−$175M");
    expect(formatFinancialValue(28_995_200, "currency", "USD")).toBe("$29.00M");
  });
});

describe("no registry id reaches the body", () => {
  it.each([
    ["computed.valuation.pricetobook-current", "P/B"],
    ["computed.valuation.pricetobook-peer-median", "P/B peer median"],
    ["computed.capital.buybackPriceAnalysis.timingPct", "Buyback timing (price paid vs the year's average)"],
    ["computed.weighted-projections.epsdiluted-weighted-12m-ending-2031-07-26", "Weighted diluted EPS, 12M ending 2031-07-26"],
    ["computed.valuation.guided-run-rate-growth-over-ttm-next-quarter-guidance-4", "Guided run-rate growth over TTM (next-quarter guidance × 4)"],
    ["computed.quarterly-trend.product-market-platform-data-center-share-of-revenue-quarter-ended-2026-07-26", "Data Center share of revenue (quarter ended 2026-07-26)"],
    ["computed.quarterly-trend.non-gaap-diluted-eps-quarter-ended-2026-07-26", "Non-GAAP diluted EPS (quarter ended 2026-07-26)"],
    ["payload.issuer-filings.q3-fy2027-gross-margin-gaap-guidance-midpoint", "Q3 FY2027 GAAP gross margin guidance midpoint"],
    ["payload.issuer-filings.issuer-defined-free-cash-flow-three-months-ended-2026-07-26", "Issuer-defined free cash flow (three months ended 2026-07-26)"],
    ["computed.quarterly-trend.free-cash-flow-operating-cash-flow-less-capex-quarter-ended-2026-07-26", "FCF, operating cash flow less capex (quarter ended 2026-07-26)"],
    ["computed.forensics.beneish-index-aqi", "Beneish AQI index"],
    ["computed.forensics.beneish-m-with-the-sales-growth-index-at-neutral-1-0", "Beneish M-score (sales-growth index at 1.0)"],
    ["computed.valuation.peerCoverage.market-cap-ttm-common-earnings.median", "Market cap / TTM common earnings peer median"],
    ["manifest.valuation.multiples.peers.priceToBook.comparabilityCaveat", "Data-gap record: P/B peer comparability caveat"],
  ])("%s → %s", (id, label) => {
    expect(metricLabel(id)).toBe(label);
  });

  it("labels every citation in a multi-citation bracket and bare ids in pipeline prose", () => {
    expect(humanizeInlineCitations("Price implies more. [computed.valuation.reverse-dcf-implied-revenue-growth · 2026-10-16; edgar:10-K item1 · 2026-01-25; not a citation]"))
      .toBe("Price implies more. [Reverse-DCF implied revenue growth · 2026-10-16; 10-K Item 1 · 2026-01-25; not a citation]");
    expect(humanizeInlineCitations("Computed-derived (source computed.valuation.*); base = (computed.valuation.dcf.perShare). Source: sec:8-K EX-99.1 0001045810-26-000073; risk-free (fred:DGS10)."))
      .toBe("Computed-derived (source valuation model outputs); base = (DCF value per share). Source: 8-K EX-99.1 0001045810-26-000073; risk-free (FRED DGS10).");
    // A bracket that is not a citation is untouched.
    expect(humanizeInlineCitations("[computed: 7 series, $25.0 billion in total]")).toBe("[computed: 7 series, $25.0 billion in total]");
  });

  it("renders a report whose prose cites registry ids with none of them in the Markdown, print or visible live text", () => {
    const report = loadTask28Fixture();
    report.disagreements[0]!.judgeResolution = "Both are valid. [computed.valuation.reverse-dcf-implied-revenue-growth · 2026-10-16; edgar:8-K EX-99.2 · 2026-08-26]";
    report.valuation.reverseDcf.narrative = "Implied growth is demanding. [computed.valuation.guided-run-rate-growth-over-ttm-next-quarter-guidance-4 · 2026-07-26; computed.quarterly-trend.revenue-growth-year-over-year-quarter-ended-2026-07-26 · 2026-07-26]";
    report.technicals.read.keyLevels = "Reference levels. [computed.technicals.sma50 · 2026-10-15; computed.technicals.sma200 · 2026-10-15]";
    report.macro.relevantSeries[0]!.relevance = "Rates matter. [computed.returns.wacc · 2026-10-16; payload.macro.dfii10-sector · 2026-10-14]";
    report.fundamentals.commentary[0] = { ...report.fundamentals.commentary[0]!, text: "SMA50 was USD 223.1738 per share.", source: "computed.technicals.sma50", sourceId: "computed.technicals.sma50" };
    const parsed = ReportSchema.parse(report);
    for (const [surface, text] of [
      ["markdown", reportToMarkdown(parsed)],
      ["print", visibleText(reportToPrintBody(parsed))],
      ["live", visibleText(renderToStaticMarkup(createElement(ReportView, { report: parsed })))],
    ] as const) {
      expect(text.match(RAW_ID)?.[0], surface).toBeUndefined();
      expect(text, surface).toContain("Reverse-DCF implied revenue growth · 2026-10-16");
      expect(text, surface).toContain("USD 223.17 per share");
      expect(text, surface).not.toContain("223.1738");
    }
  });
});

describe("the manifest as a reader counts it", () => {
  const gaps: ManifestEntry[] = [
    { field: "fmp.historicalMarketCap(NVDA)", severity: "warn", reason: "FMP returned unparseable body (HTTP 402) for /stable/historical-market-capitalization; no market-cap history: 1254 price bars" },
    { field: "fmp.secFilingsSearch(NVDA)", severity: "warn", reason: "FMP returned unparseable body (HTTP 402) for /stable/sec-filings-search" },
    { field: "keyless.balanceAnnual.backfill.withheld.capitalLeaseObligations", severity: "warn", reason: "period_mismatch: OperatingLeaseLiability covers instant..2019-01-28, conflicting with row anchor instant..2019-01-27; field/component withheld (periods: 2019-01-27)" },
    { field: "keyless.balanceAnnual.backfill.withheld.operatingLeaseLiability", severity: "warn", reason: "period_mismatch: OperatingLeaseLiability covers instant..2021-02-01, conflicting with row anchor instant..2021-01-31; field/component withheld (periods: 2021-01-31)" },
    { field: "keyless.marketCapHistory", severity: "warn", reason: "no market-cap history: 1254 price bars and 69 share observations" },
    { field: "keyless.marketCapHistory.shareBasis", severity: "warn", reason: "1254 market-cap day(s) withheld because price and share count could not be put on one share basis: yahoo:chart(range=max) covers 1999-02-01 … 2026-10-15" },
    { field: "llm.bull.length-cap", severity: "warn", reason: "The bull case was truncated before the judge saw it." },
    { field: "llm.judge.model-family", severity: "warn", reason: "The judge and both analyst passes ran on one model family." },
    { field: "verify.check.namedIndividual", severity: "warn", reason: "4 of 25 checked claims about a named individual rest on an unlisted source." },
    { field: "fmp.insiderTradingSearch(NVDA)", severity: "warn", reason: "FMP subscription (HTTP 402)", expected: true },
    { field: "evidenceCoverage.edgar:10-K item1", severity: "info", reason: "37368 of 48241 source chars omitted" },
  ];

  it("counts one row per underlying gap, apart from process disclosures and moot entries", () => {
    const k = classifyManifest(gaps);
    expect(k.dataGaps.map((gap) => [gap.key, gap.fields.length])).toEqual([
      ["marketCapHistory", 3],
      ["keyless.balanceAnnual.backfill.withheld.capitalLeaseObligations", 1],
      ["keyless.balanceAnnual.backfill.withheld.operatingLeaseLiability", 1],
    ]);
    expect(k.dataGaps[0]!.reason).toBe("no market-cap history: 1254 price bars and 69 share observations");
    expect(k.processDisclosures.map((gap) => gap.key)).toEqual(["llm.bull.length-cap", "llm.judge.model-family", "verify.check.namedIndividual"]);
    expect(k.downgraded.map((gap) => [gap.key, gap.severity, gap.recordedSeverity])).toEqual([
      ["secFilingsSearch", "info", "warn"],
    ]);
    // Without EDGAR the filing search is a real gap.
    const noEdgar = classifyManifest([...gaps, { field: "edgar.submissions", severity: "warn", reason: "SEC unavailable" }]);
    expect(noEdgar.dataGaps.some((gap) => gap.key === "secFilingsSearch")).toBe(true);
  });

  it("states the counts in the header, the appendix sentence and the gap tables", () => {
    const c = deriveReportCompletenessPresentation(undefined, gaps);
    const confirmed = { ...c, metadataStatus: "confirmed" as const, state: "degraded" as const, edgar: "available" as const, xbrl: "checked" as const, forensicValidation: "complete" as const };
    expect(dataStateText(confirmed)).toBe("Degraded: 0 critical gaps, 3 data warnings; 3 analysis-process disclosures (not data gaps); EDGAR available; XBRL checked; forensics complete.");
    expect(gapCountText(gaps, c)).toBe("11 manifest entries: 1 expected disclosure, 1 informational note, 1 recorded warning shown as information, 3 analysis-process disclosures and 3 data gaps (5 entries).");
    const tables = dataGapTables(c);
    expect(tables.map((t) => t.heading)).toEqual(["Data warnings and critical gaps", "Analysis-process disclosures", "Recorded warnings shown as information"]);
    expect(tables[0]!.rows.map((row) => row[0])).toEqual(["Market-cap history", "Capital lease obligations withheld from the annual balance sheet backfill", "Operating lease liability withheld from the annual balance sheet backfill"]);
    expect(tables[1]!.rows.map((row) => row[0])).toEqual(["Bull case length cap", "Judge on the analysts' model family", "Named-person citation check"]);
    expect(JSON.stringify(tables)).not.toMatch(RAW_ID);
    expect(gapSummary(gaps, c.classification).find((row) => row.family === "Analysis-pass disclosures")?.highest).toBe("disclosure");
    // The audit export keeps every field and recorded severity beside how the body counts it.
    const report = loadTask28Fixture();
    report.appendix.missingData = gaps;
    const audit = reportToAuditMarkdown(ReportSchema.parse(report));
    expect(audit).toContain("| data gap | warn | warn | fmp.historicalMarketCap(NVDA), keyless.marketCapHistory, keyless.marketCapHistory.shareBasis |  |");
    expect(audit).toContain("| analysis-process disclosure | disclosure | warn | llm.bull.length-cap |  |");
    expect(audit).toContain("| data gap | warn | warn | keyless.balanceAnnual.backfill.withheld.capitalLeaseObligations |  |");
  });

  it("caps the displayed confidence by the data state", () => {
    expect(confidenceText("high", { metadataStatus: "confirmed", dataCriticalCount: 0, dataWarningCount: 1 })).toBe("medium — capped from high: 1 data warning");
    expect(confidenceText("medium", { metadataStatus: "confirmed", dataCriticalCount: 1, dataWarningCount: 0 })).toBe("low — capped from medium: 1 critical data gap");
    expect(confidenceText("high", { metadataStatus: "confirmed", dataCriticalCount: 0, dataWarningCount: 0 })).toBe("high");
    expect(confidenceText("high", { metadataStatus: "missing", dataCriticalCount: 0, dataWarningCount: 0 })).toBe("medium — capped from high: data completeness not confirmed");
    expect(confidenceText("low", { metadataStatus: "confirmed", dataCriticalCount: 0, dataWarningCount: 3 })).toBe("low");
  });

  it("keeps lease mismatches actionable without issuer-specific adoption evidence", () => {
    for (const reason of [
      "period_mismatch: CapitalLeaseObligations covers instant..2019-01-28, conflicting with row anchor instant..2019-01-27; field/component withheld (periods: 2019-01-27)",
      "period_mismatch: OperatingLeaseLiability covers instant..2018-01-29, conflicting with row anchor instant..2018-01-28; field/component withheld (periods: 2018-01-28)",
      "period_mismatch: OperatingLeaseLiability covers instant..2019-03-31, conflicting with row anchor instant..2019-01-27; field/component withheld (periods: 2019-01-27)",
    ]) {
      const classified = classifyManifest([{ field: "keyless.balanceAnnual.backfill.withheld.capitalLeaseObligations", severity: "warn", reason }]);
      expect(classified.downgraded, reason).toEqual([]);
      expect(classified.dataGaps, reason).toHaveLength(1);
    }
  });

  it("never lowers a recorded critical gap to an informational note", () => {
    const classified = classifyManifest([{ field: "fmp.secFilingsSearch(NVDA)", severity: "critical", reason: "Required filing coverage failed" }]);
    expect(classified.downgraded).toEqual([]);
    expect(classified.dataGaps[0]?.severity).toBe("critical");
  });
});

describe("one rule for an aspect under the evidence floor", () => {
  it("shows its score and the marker, never its letter, on every surface", () => {
    const report = loadTask28Fixture();
    report.scores!.aspects.leadership = { ...report.scores!.aspects.leadership, score: 60.83, band: "C", dataCompleteness: 0.4545 };
    report.verdict.gradeStrip.leadership = { ...report.verdict.gradeStrip.leadership, grade: "C", assessmentStatus: "limited-evidence" };
    report.leadership.graded = { ...report.leadership.graded, grade: "C", assessmentStatus: "limited-evidence" };
    const parsed = ReportSchema.parse(report);
    const label = "Not assessed — limited evidence (score 61/100 on 45% of signals)";
    expect(gradeDisplayLabel(parsed.leadership.graded, parsed.scores!.aspects.leadership)).toBe(label);
    const card = scorecardTable(parsed.scores!);
    expect(card.rows.find((row) => row[0] === "Leadership (capital-stewardship proxy)")?.slice(1, 3)).toEqual(["61", "limited evidence"]);
    expect(card.note).toMatch(/Leadership \(capital-stewardship proxy\) has evidence for 45% of its signal weight, below the 50% floor/);
    const markdown = reportToMarkdown(parsed);
    expect(markdown).toContain(`| Leadership (capital-stewardship proxy) | ${label} |`);
    expect(markdown).toContain(`**Leadership (capital-stewardship proxy) — ${label}**`);
    expect(reportToPrintBody(parsed)).toContain(label);
    expect(renderToStaticMarkup(createElement(ReportView, { report: parsed }))).toContain("61/100 · limited evidence");
    const section = renderToStaticMarkup(createElement(GradeReasoning, { title: "leadership", block: parsed.leadership.graded, aspect: parsed.scores!.aspects.leadership }));
    expect(section).toContain("61/100 · limited evidence");
    expect(section).not.toContain('aria-label="grade C"');
  });
});

describe("leadership, segments, peers, EPS bridge and charts", () => {
  it("collapses identical not-assessed cards into one line and never prints the raw enum", () => {
    const report = loadTask28Fixture();
    const base = report.leadership.executives[0]!;
    const notAssessed = (name: string) => ({ ...base, name, title: "EVP", grade: "not-assessed" as const, credibilityGrade: "not-assessed" as const,
      assessmentReason: "Attributable, validated execution evidence is absent.", reasoning: [], evidence: {} });
    report.leadership.executives = [base, notAssessed("Pat One"), notAssessed("Sam Two"), { ...base, name: "Lee Three", credibilityGrade: "not-assessed" as const }];
    const groups = executiveGroups(report.leadership.executives);
    expect(groups.assessed.map((e) => e.name)).toEqual([base.name, "Lee Three"]);
    expect(groups.notAssessedLines).toEqual(["Not assessed: Pat One (EVP); Sam Two (EVP). Attributable, validated execution evidence is absent."]);
    const parsed = ReportSchema.parse(report);
    for (const text of [reportToMarkdown(parsed), visibleText(reportToPrintBody(parsed))]) {
      expect(text).not.toContain("not-assessed");
      expect(text).toContain("Not assessed: Pat One (EVP); Sam Two (EVP).");
      expect(text.split("Attributable, validated execution evidence is absent.").length - 1).toBe(1);
    }
  });

  it("drops the annual segment tables beside the quarterly XBRL tables, keeps them in the audit export, and files axis notes under their table", () => {
    const report = loadTask28Fixture();
    const source = { form: "8-K", accession: "0000000000-26-000001", exhibit: "EX-99.1", filingDate: "2026-08-26", url: "https://www.sec.gov/x" };
    report.filingDisclosures = {
      version: "1.0.0", currency: "USD", currencyBasis: "statements in USD", guidance: null, guidanceChecks: [],
      freeCashFlow: [], freeCashFlowDefinition: null, capitalReturn: null, events: [],
      segments: [{ axis: "srt:StatementGeographicalAxis", axisLabel: "Geography", currency: "USD", quarters: ["2026-07-26", "2025-07-27"],
        rows: [{ label: "United States", childOf: null, values: [60e9, 33e9] }, { label: "Other", childOf: null, values: [1.28e9, 959e6] }],
        total: [61.28e9, 33.959e9], priorPresentation: [], derivedCells: 0, sources: ["10-Q 0000000000-26-000075 (filed 2026-08-26)"] }],
      quarterlyTrend: [],
      reconciliation: [
        { metric: "gaap-diluted-eps", periodEnd: "2026-07-26", months: 3, value: 2.46, unit: "currency-per-share", source },
        { metric: "non-gaap-diluted-eps", periodEnd: "2026-07-26", months: 3, value: 2.22, unit: "currency-per-share", source },
        { metric: "equity-securities-gains", periodEnd: "2026-07-26", months: 3, value: 7_771_000_000, unit: "currency", source },
        { metric: "non-gaap-tax-impact", periodEnd: "2026-07-26", months: 3, value: 1_517_000_000, unit: "currency", source },
      ],
      nonGaapBasisNote: null,
      notes: ["Segment XBRL, Geography: 1 quarter value is the quarter's total revenue less the axis's other top-level rows."],
    } satisfies FilingDisclosures;
    report.business.segments.geographic = [{ name: "Other Americas", revenue: { ...report.business.segments.product[0]!.revenue, value: 4.3e9 }, sharePct: 2 }];
    const parsed = ReportSchema.parse(report);
    const markdown = reportToMarkdown(parsed);
    expect(markdown).not.toContain("Other Americas");
    expect(markdown).not.toMatch(/segments — annual/);
    expect(markdown).toContain("| Other | $1.28B | $959M |");
    expect(reportToAuditMarkdown(parsed)).toContain("Other Americas");
    const [segmentTable] = filingDisclosureTables(parsed.filingDisclosures, "business");
    expect(segmentTable!.note).toContain("1 quarter value is the quarter's total revenue less the axis's other top-level rows.");
    expect(filingDisclosureTables(parsed.filingDisclosures, "outlook").map((t) => t.note).join(" ")).not.toContain("Segment XBRL");
    // The EPS bridge foots per share; the itemized amounts are their own table.
    const tables = filingDisclosureTables(parsed.filingDisclosures, "fundamentals");
    const eps = tables.find((t) => t.heading.startsWith("GAAP to non-GAAP diluted EPS"))!;
    expect(eps.rows).toEqual([
      ["GAAP diluted EPS", "$2.46"],
      ["Reported EPS difference (non-GAAP less GAAP)", "−$0.24"],
      ["Non-GAAP diluted EPS", "$2.22"],
    ]);
    const amounts = tables.find((t) => t.heading === "Non-GAAP adjustments itemized in the release (amounts)")!;
    expect(amounts.rows).toEqual([["Gains on equity securities", "$7.77B"], ["Tax effect of non-GAAP adjustments", "$1.52B"]]);
    expect(amounts.note).toMatch(/not a complete bridge/);
  });

  it("drops a sentence that points at a chart only where no chart is drawn", () => {
    expect(withoutChartReferences("Paths can cross. The shaded band is the scenario range; bull/bear labels do not imply an ordering."))
      .toBe("Paths can cross. Bull/bear labels do not imply an ordering.");
    const report: Report = loadTask28Fixture();
    report.projections!.series[0]!.assumptions = [...report.projections!.series[0]!.assumptions, "Paths can cross. The shaded band is the scenario range; bull/bear labels do not imply an ordering."];
    const parsed = ReportSchema.parse(report);
    expect(reportToMarkdown(parsed)).not.toContain("shaded band");
    expect(reportToPrintBody(parsed)).not.toContain("shaded band");
  });
});
