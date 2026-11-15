import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { readerBaseUnits, withReaderConventions } from "@/report/readerConventions";
import { SUPPORT_LEVELS, supportLevel, supportLevelText } from "@/report/supportLevel";
import { REPORT_SPEC_VERSION } from "@/report/versions";
import { ReportSchema, type FairValue, type Report, type TracedNumber } from "@/report/schema";
import { consensusTables, figureRow } from "@/report/presentation";
import { describeFinancialValuation } from "@/pipeline/stageB/valuationAssumptions";
import { loadTask28Fixture } from "./helpers/task28Report";
import { readableHtml } from "./helpers/uiParityContract";

// Release brief W9b (D-308, D-309). Synthetic shapes only; every amount is invented.

const surfaces = (report: Report) => [
  reportToMarkdown(report),
  readableHtml(reportToPrintBody(report)).text,
  readableHtml(renderToStaticMarkup(createElement(ReportView, { report }))).text,
];

describe("raw base-unit amounts in reader text (D-308, check 3)", () => {
  it("groups an amount with cents, an amount ending a sentence and a fractional share count", () => {
    expect(readerBaseUnits("Reported free cash flow as of 2025-12-31: 31234567890.12, UNADJUSTED.")).toBe("Reported free cash flow as of 2025-12-31: 31,234,567,890.12, UNADJUSTED.");
    expect(readerBaseUnits("after subtracting SBC of 270000000.")).toBe("after subtracting SBC of 270,000,000.");
    expect(readerBaseUnits("market cap / price = 2208355468.988709 ADS versus provider 2208355469.")).toBe("market cap / price = 2,208,355,468.99 ADS versus provider 2,208,355,469.");
    expect(readerBaseUnits("minority interest 1276687427.7, preferred equity 0")).toBe("minority interest 1,276,687,427.7, preferred equity 0");
    expect(readerBaseUnits("net debt -42783000000.5;")).toBe("net debt -42,783,000,000.5;");
  });

  it("leaves dates, accessions, identifiers, small and already-grouped numbers alone (controls)", () => {
    for (const kept of [
      "filed 2025-12-31 under 0000320193-25-000079",
      "CIK 0000320193 and CIK: 1234567",
      "file number 0001234567.",
      "seed 123456789012.",
      "https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/",
      "a ratio of 0.1234567 and 1234.5678",
      "already 45,841,111,567.73 and 19.31B",
      "a version 1234567.12.3",
      "a run 12345678901234567 of seventeen digits",
      "shares 123456 and 1234567x",
    ]) expect(readerBaseUnits(kept)).toBe(kept);
  });

  it("formats the bank residual-income basis, the DCF free-cash-flow basis and scenario fixed inputs on every surface", () => {
    const raw = {
      unadjusted: "Reported free cash flow as of 2025-12-31: 31234567890.12, UNADJUSTED — stock-based compensation is not established.",
      // Excess-return wording from its one producer (bank and insurer route), on a different issuer shape.
      bank: describeFinancialValuation({
        version: "financial-valuation-assumptions-v1", modelKind: "excess-return", horizonYears: 10, costOfEquityPct: 9.5,
        initialCommonBook: 251234567890.25, roePathBasis: "ROE fades to terminal", terminalRoePct: 14, terminalGrowthPct: 3,
        terminalExcessReturnPp: 4.5, continuingValuePv: 112713769889.69, continuingValueSharePct: 40.12, continuingValueBasis: "growing perpetuity",
      }),
      scenario: "Fixed base inputs: starting revenue 30090716981.13 reporting-currency units; WACC 8.1%.",
    };
    const report = ReportSchema.parse(loadTask28Fixture());
    report.valuation.dcf.assumptions = [
      { name: "free cash flow, SBC treatment", value: "31.23B (unadjusted)", basis: raw.unadjusted },
      { name: "excess-return assumptions", value: "10 years", basis: raw.bank },
    ];
    report.valuation.scenarios = report.valuation.scenarios.map(s => ({ ...s, assumptions: [raw.scenario] }));
    const view = withReaderConventions(report);
    expect(view.valuation.dcf.assumptions[0]!.basis).toContain("31,234,567,890.12, UNADJUSTED");
    expect(view.valuation.dcf.assumptions[1]!.basis).toContain("continuing value 112,713,769,889.69 (currency, present value");
    expect(view.valuation.dcf.assumptions[1]!.basis).toContain("opening book equity 251,234,567,890.25;");
    expect(view.valuation.scenarios[0]!.assumptions[0]).toContain("starting revenue 30,090,716,981.13");
    for (const text of surfaces(report)) {
      expect(text).toContain("31,234,567,890.12");
      expect(text).toContain("112,713,769,889.69");
      expect(text).not.toMatch(/31234567890|112713769889|251234567890/);
    }
    // The stored report keeps its bytes (P21): the view is read-time only.
    expect(report.valuation.dcf.assumptions[0]!.basis).toBe(raw.unadjusted);
  });

  it("sweep: basis lists, a signal's fallback reason, a route metric's formula period and an unestablished-currency consensus cell", () => {
    const report = ReportSchema.parse(loadTask28Fixture());
    report.fairValue = { ...fairValue, status: "suppressed", perShare: null, upsidePct: null,
      basis: ["Observed trigger: unprofitable overlay applied: net income -1973000000 (ttm), operating cash flow -1629000000 (ttm)."] } as FairValue;
    const signal = { id: "peOwnHistoryRank", raw: 1, unit: "rank", transformedScore: 50, signalWeight: 1, evidenceFraction: 1, effectiveCompositeWeightPct: 0,
      contributionPoints: 0, family: "valuation", asOf: null, period: null, startDate: null, endDate: null, windowYears: null, operands: [],
      fallbackReason: "P/E not ranked: pre-tax income 104926000000 (TTM) includes non-operating income of 41214000000, 39.28% of pre-tax income." };
    report.scores!.aspects.valuation = { ...report.scores!.aspects.valuation, signals: [signal] } as never;
    (signal as { period: string | null }).period = "(equity − goodwill) 108230000000 / (total assets − goodwill) 2341373000000 × 100";
    report.scores = { ...report.scores!, qualification: { aspects: {}, composite: { status: "provisional", reasons: [{ code: "financial-evidence-blocked",
      aspect: "valuation", field: "valuation.excessReturn.preferredCapital", detail: "zero par with 14572200 preferred shares and USD 102000000 preferred-dividend evidence" }] } } } as unknown as Report["scores"];
    const view = withReaderConventions(report);
    expect(view.scores!.aspects.valuation.signals![0]!.period).toBe("(equity − goodwill) 108,230,000,000 / (total assets − goodwill) 2,341,373,000,000 × 100");
    expect(view.scores!.qualification!.composite.reasons[0]!.detail).toBe("zero par with 14,572,200 preferred shares and USD 102,000,000 preferred-dividend evidence");
    expect(view.fairValue!.basis[0]).toBe("Observed trigger: unprofitable overlay applied: net income -1,973,000,000 (ttm), operating cash flow -1,629,000,000 (ttm).");
    expect(view.scores!.aspects.valuation.signals![0]!.fallbackReason).toBe("P/E not ranked: pre-tax income 104,926,000,000 (TTM) includes non-operating income of 41,214,000,000, 39.28% of pre-tax income.");

    // A route metric whose period cell states its formula (a lender shape), and a control with a plain period.
    const metric = (period: string): TracedNumber => ({ value: 0.5, unit: "%", source: "computed.routeMetrics.ncoToAverageLoans", asOf: "2025-12-31", verified: true, period });
    expect(figureRow(metric("net charge-offs 3631000000 (ChargeOffTag) / average loans 940767500000 (LoanTag) at 2025-12-31 × 100")).period)
      .toBe("net charge-offs 3,631,000,000 (ChargeOffTag) / average loans 940,767,500,000 (LoanTag) at 2025-12-31 × 100");
    expect(figureRow(metric("FY2025")).period).toBe("FY2025");

    // Provider consensus rows: an unestablished currency keeps its words with a formatted amount; a known currency is unchanged (control).
    const row = (currency: string | null) => ({ date: "2026-01-30", periodStart: "2025-10-01", periodEnd: "2025-12-31", asOf: "2026-01-30", currency,
      values: { revenueActual: 21904190000, revenueEstimated: 21069820000, revenueDifference: 834370000, epsActual: 1.2345, epsEstimated: 1.1, epsDifference: 0.1345 } });
    report.marketData = { ...report.marketData!, estimates: [], estimateCurrency: null, resultsHistory: [row(null), row("USD")] } as Report["marketData"];
    const [unknown, known] = consensusTables(report)[0]!.rows;
    expect(unknown!.slice(2, 8)).toEqual(["21.90B (currency unestablished)", "21.07B (currency unestablished)", "834.37M (currency unestablished)",
      "1.23 (currency unestablished)", "1.10 (currency unestablished)", "0.13 (currency unestablished)"]);
    expect(known!.join(" ")).not.toContain("currency unestablished");
  });
});

/** A current, available general-route value. */
const fairValue: FairValue = {
  status: "available", method: "fcff-dcf", methodVersion: "FAIR_VALUE_TEST", upsidePct: 5, basis: [], reasons: [],
  perShare: { value: 48, unit: "usd", source: "computed.valuation.dcf.perShare", asOf: "2025-12-31", verified: true },
  currentUse: { status: "current", statementDate: "2025-12-31", valueDate: "2026-01-15", quoteDate: "2026-01-15", reason: "same-date" },
} as FairValue;

const ASPECTS = ["fundamentals", "valuation", "quality", "balanceSheet", "moat", "leadership", "technicals"] as const;

/** A recorded, supported report whose aspects carry the given route-applicable shares (default 100%). */
function graded(shares: Partial<Record<(typeof ASPECTS)[number], number | null>> = {}): Report {
  const report = ReportSchema.parse({ ...loadTask28Fixture(), fairValue });
  report.meta.specVersion = REPORT_SPEC_VERSION;
  const aspects = structuredClone(report.scores!.aspects) as Record<string, Record<string, unknown>>;
  for (const key of ASPECTS) {
    const share = key in shares ? shares[key]! : 1;
    aspects[key] = { ...aspects[key], dataCompleteness: share ?? 0, applicableCompleteness: share };
  }
  const qualification = { aspects: Object.fromEntries(ASPECTS.map(key => [key, { status: "supported", reasons: [] }])), composite: { status: "supported", reasons: [] } };
  report.scores = { ...report.scores, aspects, qualification } as unknown as Report["scores"];
  return report;
}

describe("full support only on complete evidence (D-309, check 5)", () => {
  it("keeps the definition and is full only when every scored grade has all of its applicable evidence", () => {
    expect(SUPPORT_LEVELS.full.definition).toContain("every grade rests on complete recorded evidence");
    expect(supportLevel(graded())).toMatchObject({ level: "full", limitations: [] });
  });

  it("names each partial grade with its share (a general-route shape like the one found, and one grade alone)", () => {
    const two = graded({ valuation: 0.7, moat: 0.75 });
    expect(supportLevel(two).limitations).toEqual([{ code: "grade-evidence-partial",
      text: "the valuation and moat grades rest on 70.0% and 75.0% of the evidence that applies on this company's route" }]);
    expect(supportLevelText(supportLevel(graded({ balanceSheet: 0.8235 })))).toBe(
      "Limited support: the balance-sheet grade rests on 82.3% of the evidence that applies on this company's route.");
    // Display precision never shows a partial share as complete.
    expect(supportLevelText(supportLevel(graded({ quality: 0.99999 })))).toContain("the quality grade rests on <100.0% of the evidence");
  });

  it("does not count evidence the route does not apply, an unweighted aspect or a grade already named (controls)", () => {
    // Route-inapplicable signals are outside the applicable share: 60% of all signal weight, 100% applicable.
    const routeScoped = graded();
    (routeScoped.scores!.aspects.fundamentals as { dataCompleteness: number }).dataCompleteness = 0.6;
    expect(supportLevel(routeScoped).level).toBe("full");
    // An aspect the route does not apply at all (no applicable share).
    expect(supportLevel(graded({ moat: null })).level).toBe("full");
    // An aspect with no weight in the composite.
    const unweighted = graded({ technicals: 0.5 });
    unweighted.scores!.composite.weights.technicals = 0;
    expect(supportLevel(unweighted).level).toBe("full");
    // A grade the qualification already names as limited is not repeated as partial.
    const limited = graded({ leadership: 0.455 });
    limited.scores = { ...limited.scores!, qualification: { aspects: {}, composite: { status: "provisional", reasons: [
      { code: "limited-applicable-evidence", aspect: "leadership", field: "scores.aspects.leadership", detail: "free text" },
    ] } } } as unknown as Report["scores"];
    expect(supportLevel(limited).limitations.map(item => item.code)).toEqual(["grade-evidence-limited"]);
  });

  it("is limited when free cash flow after stock-based compensation is withheld, read by its typed field", () => {
    const withheld = graded();
    withheld.appendix.missingData.push({ field: "capital.fcf.sbc", reason: "any wording", severity: "info" });
    expect(supportLevel(withheld)).toMatchObject({ level: "limited", limitations: [{ code: "fcf-after-sbc-withheld",
      text: "stock-based compensation is not established for the latest fiscal year, so free cash flow after it is withheld" }] });
    // Controls: the same wording on another field, and an expected entry, change nothing.
    const control = graded();
    control.appendix.missingData.push(
      { field: "capital.fcf.note", reason: "stock-based compensation not disclosed; free cash flow is reported before SBC", severity: "info" },
      { field: "capital.fcf.sbc", reason: "x", severity: "info", expected: true },
    );
    expect(supportLevel(control).level).toBe("full");
  });

  it("states a partial grade on every surface", () => {
    const report = graded({ valuation: 0.7 });
    for (const text of surfaces(report)) expect(text).toContain("the valuation grade rests on 70.0% of the evidence that applies on this company's route");
  });
});
