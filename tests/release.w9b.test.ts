import { readFileSync } from "node:fs";
import { valuationAuditTables } from "@/report/auditTables";
import { claimStatusMark, withReaderText } from "@/report/verificationMarks";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { readerBaseUnits, withReaderConventions } from "@/report/readerConventions";
import { SUPPORT_LEVELS, supportLevel, supportLevelText } from "@/report/supportLevel";
import { REPORT_SPEC_VERSION } from "@/report/versions";
import { ReportSchema, type FairValue, type Report, type TracedNumber } from "@/report/schema";
import { MODEL_PROSE_MARK, consensusTables, displayClaimText, displayProse, figureRow, indexModelWrittenClaims } from "@/report/presentation";
import { describeFinancialValuation } from "@/pipeline/stageB/valuationAssumptions";
import { prepareReportForSurface } from "@/report/readerPreparation";
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

  it("review round 1: never groups a version, a CIK number, an id or number reference, or a basic YYYYMMDD date", () => {
    for (const kept of [
      "version 1234567.123456",
      "CIK number 1234567.",
      "CIK no. 7654321 and CIK 1234567",
      "basic date 20261115 and 19991231.",
      "id 12345678, ID: 23456789 and identifier 34567890",
      "no. 1234567 and #7654321",
      "file number 1234567, account no. 23456789, registration number 3456789 and form number 1234567",
      "serial 98765432",
    ]) expect(readerBaseUnits(kept)).toBe(kept);
    // Controls: an amount after "number of", an 8-digit run that is not a real calendar day, and a year-led amount with cents.
    expect(readerBaseUnits("a number of 12345678 shares")).toBe("a number of 12,345,678 shares");
    expect(readerBaseUnits("revenue 20261345 and 20260230")).toBe("revenue 20,261,345 and 20,260,230");
    expect(readerBaseUnits("cash 20261115.5")).toBe("cash 20,261,115.5");
  });

  it("review round 1: model-written prose and claims are shown as written; code-written text is still grouped", () => {
    const text = "Revenue reached 12345678901 in FY2025.";
    // Code-written prose (control) is grouped; a paragraph carrying the model-prose mark is shown as written.
    expect(displayProse(text)).toBe("Revenue reached 12,345,678,901 in FY2025.");
    expect(displayProse(`${text} ${MODEL_PROSE_MARK}`)).toBe(`${text} ${MODEL_PROSE_MARK}`);
    // A statement of a report the AI wrote keeps its digits; the same statement in a data-only report is code-written.
    const modelReport = ReportSchema.parse(loadTask28Fixture());
    modelReport.appendix.missingData = modelReport.appendix.missingData.filter(gap => gap.field !== "analysis.llm");
    const claim = { text, label: "FACT" as const, source: "edgar:10-K item7", asOf: "2026-02-20" };
    modelReport.business.whatTheySell = [claim];
    indexModelWrittenClaims(modelReport);
    expect(displayClaimText(claim)).toBe(text);
    const dataOnly = ReportSchema.parse(loadTask28Fixture());
    dataOnly.appendix.missingData.push({ field: "analysis.llm", reason: "no AI connection", severity: "critical" });
    const codeClaim = { ...claim };
    dataOnly.business.whatTheySell = [codeClaim];
    indexModelWrittenClaims(dataOnly);
    expect(displayClaimText(codeClaim)).toBe("Revenue reached 12,345,678,901 in FY2025.");
    // A model-written grade line keeps its digits in the reader view; a code-written basis on the same report is grouped.
    const report = ReportSchema.parse(loadTask28Fixture());
    report.valuation.graded = { ...report.valuation.graded, oneLineWhy: "Analyst view: backlog of 12345678901 supports the case." };
    report.valuation.dcf.assumptions = [{ name: "start revenue", value: "12.35B", basis: "TTM revenue 12345678901 as of 2025-12-31" }];
    const view = withReaderConventions(report);
    expect(view.valuation.graded.oneLineWhy).toBe("Analyst view: backlog of 12345678901 supports the case.");
    expect(view.valuation.dcf.assumptions[0]!.basis).toBe("TTM revenue 12,345,678,901 as of 2025-12-31");
    // The D-67 precision pass does not round a version number either.
    expect(displayProse("Model deck version 1234567.123456 states the figures.")).toBe("Model deck version 1234567.123456 states the figures.");
  });

  it("review round 2: an AI-written grade interpretation keeps its digits through preparation and export; a data-only one is grouped", () => {
    const interpretation = "Backlog of 12345678901 supports the case.";
    // AI-written report (no analysis.llm gap): the interpretation is shown as written, with the model-prose mark.
    const model = ReportSchema.parse(loadTask28Fixture());
    model.appendix.missingData = model.appendix.missingData.filter(gap => gap.field !== "analysis.llm");
    model.valuation.graded = { ...model.valuation.graded, interpretation };
    expect(withReaderConventions(model).valuation.graded.interpretation).toBe(interpretation);
    const prepared = prepareReportForSurface(model, "markdown").report;
    expect(prepared.valuation.graded.interpretation).toBe(`${interpretation} ${MODEL_PROSE_MARK}`);
    for (const text of surfaces(model)) {
      expect(text).toContain("Backlog of 12345678901 supports the case.");
      expect(text).not.toContain("Backlog of 12,345,678,901");
    }
    // Control: in a data-only report the same grade text is code-written and is grouped on display.
    const dataOnly = ReportSchema.parse(loadTask28Fixture());
    dataOnly.appendix.missingData.push({ field: "analysis.llm", reason: "no AI connection", severity: "critical" });
    dataOnly.valuation.graded = { ...dataOnly.valuation.graded, interpretation };
    expect(reportToMarkdown(dataOnly)).toContain("Backlog of 12,345,678,901 supports the case.");
  });

  it("review round 2: the two saved code-written method statements of an AI-written report are grouped at read time, by typed fields", () => {
    const grading = "Capital grading basis: ttm: 2025-07-01 to 2026-06-30. TTM net income = filed fiscal year 57670000000 + current YTD 12902000000.";
    const bridge = "The debt bridge offsets cash of 31234567890 against total debt of 41234567890.";
    const saved = ReportSchema.parse(loadTask28Fixture());
    saved.appendix.missingData = saved.appendix.missingData.filter(gap => gap.field !== "analysis.llm");
    const method = (text: string) => ({ label: "JUDGMENT" as const, source: "computed.capital.current", asOf: "2026-06-30", text });
    // Controls in the same report: an AI statement citing the same record but labelled FACT, and an AI JUDGMENT with the
    // same source outside the two commentary lists, stay as written.
    const aiFact = { label: "FACT" as const, source: "computed.capital.current", asOf: "2026-06-30", text: "Cash reached 51234567890 at quarter end." };
    const aiElsewhere = method("Our judgment: the 61234567890 buyback is large.");
    saved.balanceSheet.coverage.commentary = [...saved.balanceSheet.coverage.commentary, aiFact, method(grading)];
    saved.balanceSheet.debtProfile.commentary = [...saved.balanceSheet.debtProfile.commentary, method(bridge)];
    saved.business.whatTheySell = [...saved.business.whatTheySell, aiElsewhere];
    const stored = JSON.stringify(saved);
    for (const text of surfaces(saved)) {
      expect(text).toContain("filed fiscal year 57,670,000,000 + current YTD 12,902,000,000.");
      expect(text).toContain("cash of 31,234,567,890 against total debt of 41,234,567,890.");
      expect(text).toContain("Cash reached 51234567890 at quarter end.");
      expect(text).toContain("the 61234567890 buyback is large.");
    }
    // Read time only: the saved report keeps its bytes (P21).
    expect(JSON.stringify(saved)).toBe(stored);
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
  // The demo fixture's one synthetic valuation-input gap would limit support by itself (review round 1).
  report.appendix.missingData = report.appendix.missingData.filter(gap => gap.field !== "valuation.cet1Ratio");
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

  it("review round 1: the fixture's synthetic valuation-input gap alone limits support (the literal definition)", () => {
    const report = ReportSchema.parse({ ...loadTask28Fixture(), fairValue });
    report.meta.specVersion = REPORT_SPEC_VERSION;
    report.scores = graded().scores;
    expect(supportLevel(report).limitations).toEqual([{ code: "headline-input-qualified", text: "a valuation input is withheld or qualified" }]);
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

  it("review round 1: any unexpected valuation-input or headline-figure gap limits support, by its typed field", () => {
    // The shape found on two general-route reports: a financial-asset add-back that cannot be placed.
    const addBack = graded();
    addBack.appendix.missingData.push({ field: "valuation.dcf.fairValueFinancialAssets", reason: "any wording", severity: "warn" });
    expect(supportLevel(addBack)).toMatchObject({ level: "limited", limitations: [{ code: "headline-input-qualified",
      text: "a separate add-back for financial assets is not included in the cash-flow value because their placement on the balance sheet is unresolved" }] });
    // Other shapes: a discount-rate input, a peer screen and an unlisted valuation field (generic label), each once.
    const several = graded();
    several.appendix.missingData.push(
      { field: "returns.wacc.history", reason: "x", severity: "info" },
      { field: "valuation.multiples.peers", reason: "x", severity: "info" },
      { field: "valuation.multiples.peers", reason: "y", severity: "info" },
      { field: "valuation.newInput", reason: "x", severity: "info" },
    );
    expect(supportLevel(several).limitations.map(item => item.text)).toEqual([
      "the ROIC-versus-WACC history uses the current discount rate for years without their own",
      "too few comparable peers pass the screen, so peer medians are withheld",
      "a valuation input is withheld or qualified",
    ]);
    // Controls: an expected omission, non-headline gaps and wording that names a valuation input change nothing.
    const control = graded();
    control.appendix.missingData.push(
      { field: "valuation.dcf.fairValueFinancialAssets", reason: "x", severity: "warn", expected: true },
      { field: "scores.leadership.buybackTiming", reason: "x", severity: "info" },
      { field: "capital.buybackPriceAnalysis", reason: "x", severity: "info" },
      { field: "edgar.annualGeography", reason: "the valuation input is withheld", severity: "info" },
    );
    expect(supportLevel(control).level).toBe("full");
  });

  it("review round 1: a gap another limitation already names is not repeated (named field, route, withheld fair value)", () => {
    const named = graded();
    named.appendix.missingData.push({ field: "returns.wacc.weights", reason: "x", severity: "critical" });
    named.scores = { ...named.scores!, qualification: { aspects: {}, composite: { status: "provisional", reasons: [
      { code: "financial-evidence-blocked", aspect: "valuation", field: "returns.wacc.weights", detail: "free text" },
    ] } } } as unknown as Report["scores"];
    expect(supportLevel(named).limitations.map(item => item.code)).toEqual(["headline-input-withheld"]);
    // A bank: the route limitation already says the cash-flow valuation, reverse DCF and EV/EBITDA do not apply.
    const bank = graded();
    bank.fairValue = { ...fairValue, method: "excess-return" } as FairValue;
    bank.routeMetrics = { route: "bank", metrics: [], notes: [], asOf: null };
    bank.appendix.missingData.push(...["valuation.dcf", "valuation.reverseDcf", "valuation.evEbitda"].map(field => ({ field, reason: "x", severity: "info" as const })));
    expect(supportLevel(bank).limitations.map(item => item.code)).toEqual(["financial-route"]);
    // A withheld fair value already names the cash-flow valuation; the tax-operand and SBC entries keep their own lines.
    const withheld = graded();
    withheld.fairValue = { ...fairValue, status: "suppressed", perShare: null, upsidePct: null } as FairValue;
    withheld.appendix.missingData.push(
      { field: "valuation.dcf", reason: "x", severity: "info" },
      { field: "valuation.dcf.taxOperands", reason: "x", severity: "info" },
      { field: "capital.fcf.sbc", reason: "x", severity: "info" },
    );
    expect(supportLevel(withheld).limitations.map(item => item.code)).toEqual(["fair-value-withheld", "tax-operands-vendor", "fcf-after-sbc-withheld"]);
  });

  it("is limited when free cash flow after stock-based compensation is withheld, read by its typed field", () => {
    const withheld = graded();
    withheld.appendix.missingData.push({ field: "capital.fcf.sbc", reason: "any wording", severity: "info" });
    expect(supportLevel(withheld)).toMatchObject({ level: "limited", limitations: [{ code: "fcf-after-sbc-withheld",
      text: "stock-based compensation is not established for the historical annual calculation (period not recorded), so free cash flow after it is withheld" }] });
    // Controls: the same wording on another free-cash-flow field is not read as the SBC entry (it limits by its own
    // typed line), and on a non-headline field or as an expected entry it changes nothing.
    const wording = graded();
    wording.appendix.missingData.push({ field: "capital.fcf.note", reason: "stock-based compensation not disclosed; free cash flow is reported before SBC", severity: "info" });
    expect(supportLevel(wording).limitations).toEqual([{ code: "headline-input-qualified", text: "a historical free-cash-flow figure is withheld or qualified (period not recorded)" }]);
    const control = graded();
    control.appendix.missingData.push(
      { field: "capital.note", reason: "stock-based compensation not disclosed; free cash flow is reported before SBC", severity: "info" },
      { field: "capital.fcf.sbc", reason: "x", severity: "info", expected: true },
    );
    expect(supportLevel(control).level).toBe("full");
  });

  it("states a partial grade on every surface", () => {
    const report = graded({ valuation: 0.7 });
    for (const text of surfaces(report)) expect(text).toContain("the valuation grade rests on 70.0% of the evidence that applies on this company's route");
  });
});

describe("Step 4 period and diagnostic reader regressions (D-310, D-312)", () => {
  it("dates historical capital refusals from their own records, never provider dataset dates", () => {
    const report = loadTask28Fixture();
    report.balanceSheet.graded!.keyNumbers = [];
    report.balanceSheet.coverage.numbers = [];
    report.meta.asOfMap["statements.balanceAnnual"] = "2025-06-30";
    report.balanceSheet.debtProfile.numbers = [{ value: 9, unit: "currency", source: "computed.capital.netDebtToEbitda.netDebt", asOf: "2024-06-30", verified: true }];
    report.appendix.missingData = [{ field: "capital.netDebtToEbitda", reason: "wording must not decide the period", severity: "info" }];
    expect(supportLevelText(supportLevel(report))).toContain("net debt to EBITDA for the historical annual period ended 2024-06-30 is withheld");
    report.balanceSheet.coverage.numbers = [{ value: 3, unit: "currency", source: "computed.capital.netDebtToEbitda.ebitda", asOf: "2023-06-30", verified: true }];
    expect(supportLevelText(supportLevel(report))).toContain("historical net debt to EBITDA is withheld (period not recorded)");
    report.balanceSheet.coverage.numbers = [];
    report.balanceSheet.debtProfile.numbers = [];
    // The provider envelope is still present; it must never fill the missing calculation date.
    expect(supportLevelText(supportLevel(report))).toContain("historical net debt to EBITDA is withheld (period not recorded)");
    report.appendix.missingData = [];
    expect(supportLevelText(supportLevel(report))).not.toContain("net debt to EBITDA");
  });
  it("uses the refused coverage basis and dates SBC from the admitted annual FCF series (D-310 review)", () => {
    const report = loadTask28Fixture();
    report.balanceSheet.graded!.keyNumbers = [];
    report.balanceSheet.debtProfile.numbers = [];
    report.meta.asOfMap["statements.incomeAnnual"] = "2025-12-31";
    report.balanceSheet.coverage.numbers = [{ value: 12, unit: "currency", source: "computed.capital.interestCoverage.ebit", asOf: "2023-12-31", verified: true }];
    report.fundamentals.fcf = [{ label: "Before SBC", values: [{ period: "2022-12-31", value: { value: 25, unit: "currency", source: "computed.capital.fcf.beforeSbc", asOf: "2022-12-31", verified: true } }] }];
    report.appendix.missingData = ["capital.interestCoverage", "capital.fcf.sbc"].map(field => ({field, reason: "irrelevant wording", severity: "info" as const}));
    const text = supportLevelText(supportLevel(report));
    expect(text).toContain("interest coverage for the historical annual period ended 2023-12-31 is withheld");
    expect(text).toContain("stock-based compensation is not established for the historical annual period ended 2022-12-31");
    expect(text).not.toContain("2025-12-31");
    // A current house after-SBC figure is shown: omit the old SBC refusal.
    report.balanceSheet.coverage.numbers.push({ value: 30, unit: "currency", source: "computed.capital.current.cashBridge.afterSbcStandardizedFcf", asOf: "2026-09-30", verified: true });
    expect(supportLevel(report).limitations.some(x => x.code === "fcf-after-sbc-withheld")).toBe(false);
    // No exact annual FCF record: an explicitly unrecorded historical period, never the dataset date.
    report.balanceSheet.coverage.numbers = [];
    report.fundamentals.fcf = [];
    expect(supportLevelText(supportLevel(report))).toContain("historical annual calculation (period not recorded)");
  });

  it("preserves model-written words and QName inventories (D-312 review)", () => {
    const prose = "eps and us-gaap:X describe the AI's claim.";
    expect(displayProse(prose, undefined, {modelWritten:true})).toBe(prose);
    expect(displayProse(prose + " " + MODEL_PROSE_MARK)).toBe(prose + " " + MODEL_PROSE_MARK);
    const r = loadTask28Fixture();
    r.business.whatTheySell = [{text:prose, label:"FACT", source:"edgar:10-K item1", asOf:"2025-12-31"}];
    r.appendix.verificationLog = [{claim:prose, outcome:"verified", validationStatus:"validated", path:"business.whatTheySell[0]", evidenceKind:"factual-claim", source:"edgar:10-K item1"}];
    const shown = prepareReportForSurface(r, "markdown").report;
    expect(claimStatusMark(shown.business.whatTheySell[0]!)).toBe("validated");
    expect(displayClaimText(shown.business.whatTheySell[0]!)).toBe(prose);
    const copy = withReaderText(shown.business.whatTheySell[0]!, "Company record: " + prose);
    expect(claimStatusMark(copy)).toBe("validated");
    expect(displayClaimText(copy)).toBe("Company record: " + prose);
    const members = "Observed member QNames: country:US, us-gaap:NonUsMember, srt:EuropeMember.";
    expect(displayProse(members)).toBe(members);
    expect(displayProse("FinanceLeaseLiabilityNoncurrent 99; FinanceLeaseLiabilityCurrent unavailable")).toBe("noncurrent finance lease liability 99; current finance lease liability unavailable");
  });

  it("formats bridge and enterprise-value diagnostics through the reader rule (D-312 review)", () => {
    const sample = ReportSchema.parse(JSON.parse(readFileSync("fixtures/report/DEMO-current.json", "utf8")));
    sample.valuation.dcf.bridge!.shareBasisNote = "Held-share evidence: us-gaap:CommonStockSharesHeldInEmployeeTrustShares at 2025-12-31.";
    const note = valuationAuditTables(sample.valuation.dcf).find(t => t.heading === "Enterprise value to equity bridge")!.note!;
    expect(note).toContain("shares held in an employee trust at 2025-12-31");
    expect(note).not.toContain("us-gaap:");
    const r = loadTask28Fixture();
    r.valuation.multiplesBasis = "FinanceLeaseLiabilityCurrent 4; FinanceLeaseLiabilityNoncurrent 99.";
    for (const text of surfaces(r)) {
      expect(text).toContain("current finance lease liability 4; noncurrent finance lease liability 99.");
      expect(text).not.toContain("FinanceLeaseLiability");
    }
  });

  it("keeps recorded FX precision in both assumption and multiples bases on every surface (D-312 review)", () => {
    const r = loadTask28Fixture();
    const basis = "FX inputs use 0.006712345 USD per JPY; native value 148.979234. Growth was 12.3456%.";
    r.valuation.multiplesBasis = basis;
    r.valuation.dcf.assumptions[0]!.basis = basis;
    const original = JSON.stringify(r);
    for (const text of surfaces(r)) {
      expect(text.split("0.006712345 USD per JPY").length).toBeGreaterThanOrEqual(3);
      expect(text.split("native value 148.979234").length).toBeGreaterThanOrEqual(3);
      expect(text).toContain("Growth was 12.3%.");
      expect(text).not.toContain("native value 148.98");
    }
    expect(reportToAuditMarkdown(r)).toContain(basis);
    expect(JSON.stringify(r)).toBe(original);
  });

  it("applies the vocabulary on all saved-report surfaces and preserves audit identifiers", () => {
    const report = loadTask28Fixture();
    const raw = "FinancingReceivableAllowanceForCreditLossExcludingAccruedInterest";
    report.valuation.multiples[0]!.basis = `allowance 123 (${raw}) at 2024-12-31`;
    report.appendix.missingData.push({field: "route.overlays.preRevenue.currency", severity: "warn",
      reason: "ttm revenue 987 has reportedCurrency GBP and is not proven USD; the raw $10,000,000 pre-revenue threshold was not evaluated for that observation, and no FX conversion was attempted"});
    const original = JSON.stringify(report);
    for (const text of surfaces(report)) {
      expect(text).not.toContain(raw);
      expect(text).not.toContain("reportedCurrency");
      expect(text).toContain("allowance for credit losses on loans (excluding accrued interest)");
      expect(text).toContain("GBP");
    }
    expect(reportToAuditMarkdown(report)).toContain(raw);
    expect(JSON.stringify(report)).toBe(original);
  });

  it("reads paths, field names and bank tags plainly while retaining dates and currency", () => {
    expect(displayProse("Annual revenue definitions are unreconciled (statements.income.2018-12-31.revenue)."))
      .toContain("revenue for the period ended 2018-12-31");
    expect(displayProse("has reportedCurrency GBP; FinancingReceivableAllowanceForCreditLossExcludingAccruedInterest"))
      .toBe("has reporting currency GBP; allowance for credit losses on loans (excluding accrued interest)");
    expect(displayProse("Revenue was GBP 12 million in 2018." )).toBe("Revenue was GBP 12 million in 2018.");
  });
});
