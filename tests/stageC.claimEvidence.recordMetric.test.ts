import { withFixtureQuoteDay } from "./helpers/valuationUse";
import { isDeltaRecord, labelOperands } from "@/pipeline/stageC/consistency";
import { expect, it } from "vitest";
import { buildPlainFigureIndex, checkPlainFigures, reportedSeriesLatest, validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";
const inc: NumericProvenanceRecord = { id: "computed.forensics.increase-in-goodwill-and-other-intangible-assets", label: "increase in goodwill and other intangible assets", kind: "computed", value: 18143000000, unit: "currency", currency: "USD", period: "2026-01-25", asOf: "2026-01-25", origin: "computed", formulaVersion: null, displayPrecision: 4 };
function check(text: string, record = inc) {
  return validateClaimNumericSupport({ label: "FACT", text, source: record.id, asOf: record.asOf }, { record, excerpts: [], sourceId: record.id, reportingCurrency: "USD" }).status;
}
it.each([inc.id, "computed.forensics.accruals.acquiredGoodwillAndIntangibles"])("AI-501 refuses a level citing increase %s", id => {
  expect(check("Goodwill and other intangible assets as of 2026-01-25 were USD 18.14 billion.", { ...inc, id })).toBe("unchecked");
});
it("AI-501 retains noun-form increase and movement refusals", () => {
  expect(check("The increase in goodwill and other intangible assets as of 2026-01-25 was USD 18.14 billion.")).toBe("validated");
  expect(check("Goodwill and other intangible assets rose USD 18.14 billion.")).toBe("unchecked");
});

it("AI-501 refuses share-of-level and omitted gains", () => {
  const share = { ...inc, id: "computed.forensics.goodwill-and-intangibles-increase-as-a-share-of-the-net-operating-asset-increase", label: "goodwill and intangibles increase as a share of the net-operating-asset increase", value: 44.36158, unit: "percent" as const, currency: null };
  expect(check("Goodwill and intangibles as a share of net operating assets as of 2026-01-25 was 44.36%.", share)).toBe("unchecked");
  const gains = { ...inc, id: "payload.quarterly-trend.net-gains-from-equity-securities-quarter-ended-2026-07-26", label: "net gains from equity securities, quarter ended 2026-07-26", period: "2026-07-26", asOf: "2026-07-26", value: 2100000000 };
  expect(check("Net equity securities for the quarter ended 2026-07-26 were USD 2.1 billion.", gains)).toBe("unchecked");
  expect(check("Net gains from equity securities for the quarter ended 2026-07-26 were USD 2.1 billion.", gains)).toBe("validated");
});

const spread = { ...inc, id: "computed.returns.roic-wacc-spread", label: "ROIC \u2212 WACC spread", value: 136.76, unit: "percentage-points" as const, currency: null, period: null };
it.each(["rose", "fell"])("AI-502 leaves a spread movement %s unchecked", verb => {
 expect(check(`The ROIC \u2212 WACC spread ${verb} 136.76 percentage points.`, spread)).toBe("unchecked");
});
it("AI-502 retains level and signed-change controls", () => {
 expect(check("The ROIC \u2212 WACC spread was 136.76 percentage points.", spread)).toBe("validated");
 const change = { ...spread, id: "computed.margins.operating-margin-change", label: "operating margin change", value: -1.2 };
 expect(check("Operating margin fell 1.2 percentage points.", change)).not.toBe("validated");
});

it.each([
 ["computed.returns.roic-wacc-spread", "ROIC \u2212 WACC spread", false],
 ["computed.forensics.accruals.divergence", "absolute cash-flow versus balance-sheet accrual divergence", false],
 ["payload.macro.t10y2y-core", "T10Y2Y (core)", false],
 ["computed.growth-margins.revenue-accel-yoy-3y-cagr", "revenue accel (YoY \u2212 3y CAGR)", false],
 ["computed.margins.operating-margin-change", "operating margin change", true],
 ["computed.margins.operating-margin-change.2", "operating margin change", true],
 ["computed.unknown", "unknown", false],
])("AI-502 classifies %s", (id, label, expected) => {
 expect(isDeltaRecord({ ...spread, id, label })).toBe(expected);
});
it("AI-502 always reads slopes as changes", () => {
 expect(isDeltaRecord({ ...spread, unit: "percentage-points-per-year" })).toBe(true);
});
it("AI-502 distinguishes temporal basis from difference operators", () => {
 expect(labelOperands("revenue growth year over year")).toBeNull();
 expect(labelOperands("revenue accel (YoY \u2212 3y CAGR)")?.kind).toBe("difference");
});

it.each([
 [spread, "The WACC \u2212 ROIC spread was 136.76 percentage points.", "The ROIC \u2212 WACC spread was 136.76 percentage points."],
 [{ ...spread, id: "computed.net-debt-to-ebitda", label: "net debt to ebitda", value: -0.12, unit: "ratio" as const }, "EBITDA to net debt was -0.12x.", "Net debt to EBITDA was -0.12x."],
 [{ ...spread, id: "computed.capex-d-a", label: "capex/D&A (latest)", value: 2.13, unit: "ratio" as const }, "D&A/capex (latest) was 2.13x.", "Capex/D&A (latest) was 2.13x."],
 [{ ...spread, id: "computed.priceToBook", label: "priceToBook (current)", value: 22.86, unit: "ratio" as const }, "Current book to price was 22.86x.", "Current price to book was 22.86x."],
])("AI-504 refuses reversed operands %#", (rec, reversed, correct) => {
 expect(check(reversed, rec)).toBe("unchecked");
 expect(check(correct, rec)).toBe("validated");
});
it.each(["absolute cash-flow versus balance-sheet accrual divergence", "P/E (ttm)", "FCF conversion (latest, before SBC \u2014 the graded ratio)", "investments subject to short-term lock-up restrictions as of 2026-07-26", "free cash flow, 2025-07-27 to 2026-07-26"])("AI-504 keeps nonoperators %s", label => {
 expect(labelOperands(label)).toBeNull();
});

it("AI-504 preserves buyback comparison order", () => {
 const rec = { ...spread, id: "computed.buyback-timing", label: "buyback timing: cost of the repurchased shares at each year's average price vs cost paid", value: 5, unit: "percent" as const };
 expect(check("Buyback timing: cost paid vs cost of the repurchased shares at each year's average price was 5.00%.", rec)).toBe("unchecked");
 expect(check("Buyback timing: cost of the repurchased shares at each year's average price vs cost paid was 5.00%.", rec)).toBe("validated");
});

it("AI-502 pins every percentage-point record in the synthetic helper payload", async () => {
 const { completeCurrencyBundle } = await import("./helpers/currencyBundle");
 const { runStageB } = await import("@/pipeline/compute");
 const { assembleContextPayload } = await import("@/pipeline/stageC/payload");
 const bundle = withFixtureQuoteDay(completeCurrencyBundle({ debt: 300 }), "2026-03-31");
 const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
 const kinds = Object.fromEntries(payload.provenanceRegistry!.filter(r => r.unit === "percentage-points" || r.unit === "percentage-points-per-year").map(r => [r.id, isDeltaRecord(r)]));
 expect(kinds).toEqual({
  "computed.growth-margins.gross-margin-slope": true,
  "computed.growth-margins.operating-margin-slope": true,
  "computed.growth-margins.net-margin-slope": true,
  "computed.growth-margins.revenue-accel-yoy-3y-cagr": false,
  "computed.returns.roic-wacc-spread": false,
  "computed.capital-cash.capex-revenue-slope": true,
  "computed.forensics.absolute-cash-flow-versus-balance-sheet-accrual-divergence": false,
  "computed.forensics.accruals.divergence": false,
  "computed.scores.fundamentals.operatingMarginSlope": true,
  "computed.scores.valuation.reverseImpliedVsAchievable": false,
  "computed.scores.quality.roicVsWaccSpread": false
});
});

it("AI-501 leaves a claim's own direction words out of a level label's metric", () => {
  // Integration fix: only a label that is itself a change keeps direction nouns;
  // "up from Q2 2019" states a comparison base, checked as a period.
  const level = { ...inc, id: "computed.test.gross-margin-level", label: "gross margin", value: 74, unit: "percent" as const, currency: null, period: "2026-06-30", asOf: "2026-06-30" };
  const result = validateClaimNumericSupport({ label: "FACT", text: "Gross margin was 74%, up from Q2 2019.", source: level.id, asOf: level.asOf },
    { record: level, excerpts: [], sourceId: level.id, reportingCurrency: "USD" });
  expect(result).toMatchObject({ status: "unchecked", reason: "period-mismatch" });
  expect(check("Gross margin as of 2026-06-30 was 74%.", level)).toBe("validated");
});

// D-263: outflow magnitudes are explicit producer metadata, never sign-blind matching.
it("D-263 validates declared cash expenditure magnitudes and preserves real conflicts", () => {
  const outflow: NumericProvenanceRecord = { ...inc, id: "computed.current-capital.cash-capital-expenditure", origin: "computed.capital.current.cashBridge.cashCapitalExpenditure", label: "cash capital expenditure", value: -10983700000, period: "2026-09-30", asOf: "2026-09-30", cashFlowDirection: "outflow" };
  expect(check("Cash capital expenditure as of 2026-09-30 was USD 10.98 billion.", outflow)).toBe("validated");
  expect(check("Cash capital expenditure as of 2026-09-30 was USD 11.98 billion.", outflow)).toBe("contradicted");
  expect(check("Cash capital expenditure inflow as of 2026-09-30 was USD 10.98 billion.", outflow)).not.toBe("validated");
  for (const label of ["net income", "net cash position"]) {
    const record = { ...outflow, label, cashFlowDirection: undefined };
    expect(check(`${label} as of 2026-09-30 was USD 10.98 billion.`, record)).toBe("contradicted");
  }
});

it("D-263 binds the subject outside a parenthetical cash-flow definition", () => {
  const fcf: NumericProvenanceRecord = { ...inc, id: "computed.current-capital.standardized-fcf", origin: "computed.capital.current.cashBridge.standardizedFcf", label: "standardized fcf", componentDefinitions: ["operating cash flow less capital expenditure", "operating cash flow less cash capital expenditure"], value: 19660900000, period: "TTM: 2025-10-01 to 2026-09-30", asOf: "2026-09-30", periodContext: { kind: "duration", start: "2025-10-01", end: "2026-09-30", basis: "rolling-12-month" } };
  for (const definition of ["operating cash flow less capital expenditure", "operating cash flow less cash capital expenditure"]) {
    const text = `Standardized free cash flow (${definition}) for the twelve months ended 2026-09-30 was USD 19.66 billion.`;
    expect(check(text, fcf)).toBe("validated");
    expect(check(text.replace("19.66", "29.66"), fcf)).toBe("contradicted");
    const cfo = { ...fcf, id: "computed.current-capital.operating-cash-flow", origin: "computed.capital.current.cashBridge.operatingCashFlow", label: "operating cash flow", value: 30644600000 };
    expect(check(text, cfo)).toBe("unchecked");
    expect(check(text.replace(definition, "cash capital expenditure less operating cash flow"), fcf)).toBe("unchecked");
  }
});

it("D-263 keeps direction conflicts contradicted", () => {
  const growth = { ...inc, id: "computed.revenue-growth", label: "revenue growth", value: -12.34, unit: "percent" as const, currency: null };
  expect(check("Revenue growth as of 2026-01-25 increased 12.34%.", growth)).toBe("contradicted");
});

it("D-263 plain prose compares FCF to FCF and retains real value differences", () => {
  const base: NumericProvenanceRecord = { ...inc, period: "2026-01-25", label: "free cash flow", componentDefinitions: ["operating cash flow less capital expenditure"], value: 19.66e9 };
  const registry = [base, { ...base, id: "cfo", label: "operating cash flow", value: 30.64e9 }];
  const options = { registry, excerpts: [], reportingCurrency: "USD", ignoreWords: [], seriesLatest: reportedSeriesLatest(registry), index: buildPlainFigureIndex(registry, [], "USD", []) };
  const text = "Free cash flow (operating cash flow less capital expenditure) as of 2026-01-25 was USD 19.66 billion.";
  expect(checkPlainFigures(text, options)[0].outcome).toBe("confirmed");
  expect(checkPlainFigures(text.replace("19.66", "29.66"), options)[0].outcome).toBe("contradiction");
  const ambiguous = [...registry, { ...base, id: "fcf-other", value: 29.66e9 }];
  expect(checkPlainFigures(text, { ...options, registry: ambiguous, index: buildPlainFigureIndex(ambiguous, [], "USD", []) })[0].outcome).not.toBe("contradiction");
});

it.each(["cash capital expenditure", "share repurchases"])("D-263 supports declared %s across issuer and period shapes", label => {
  for (const kind of ["provider", "computed"] as const) {
    const record = { ...inc, id: `synthetic.${kind}`, label, value: -1234000000, cashFlowDirection: "outflow" as const, kind };
    expect(check(`${label} as of 2026-01-25 was USD 1.234 billion.`, record)).toBe("validated");
    expect(check(`${label} as of 2026-01-25 was USD 2.234 billion.`, record)).toBe("contradicted");
    expect(check(`${label} as of 2026-01-25 was USD 1.234 billion.`, { ...record, cashFlowDirection: undefined })).toBe("contradicted");
  }
});

it.each([
  ["net debt", "total debt less cash and short-term investments", "currency", "USD 1.234 billion", 1.234e9],
  ["EBITDA", "EBIT plus depreciation and amortization", "currency", "USD 1.234 billion", 1.234e9],
  ["gross margin", "gross profit divided by revenue", "percent", "12.34%", 12.34],
  ["interest coverage", "EBIT divided by interest expense", "ratio", "12.34x", 12.34],
] as const)("D-263 binds %s outside its producer-declared definition", (label, definition, unit, figure, value) => {
  const record = { ...inc, label, unit, value, currency: unit === "currency" ? "USD" : null, componentDefinitions: [definition] };
  const text = `${label} (${definition}) as of 2026-01-25 was ${figure}.`;
  expect(check(text, record)).toBe("validated");
  expect(check(text.replace("12.34", "22.34").replace("1.234", "2.234"), record)).toBe("contradicted");
  expect(check(text.replace(definition, "revenue less cash"), record)).toBe("unchecked");
});

it.each([
  ["industrial 10-K", "cash capital expenditure", "fiscal-year", "2025-01-01", "2025-12-31"],
  ["bank 10-Q", "share repurchases", "fiscal-quarter", "2026-04-01", "2026-06-30"],
  ["foreign 20-F", "cash capital expenditure", "rolling-12-month", "2025-07-01", "2026-06-30"],
  ["utility YTD", "share repurchases", "year-to-date", "2026-01-01", "2026-06-30"],
] as const)("D-263 preserves period evidence for %s cash uses", (_shape, label, basis, start, end) => {
  const record: NumericProvenanceRecord = { ...inc, label, value: -1.234e9, cashFlowDirection: "outflow", asOf: end, period: `${start} to ${end}`, periodContext: { kind: "duration", start, end, basis } };
  expect(check(`${label} from ${start} to ${end} was USD 1.234 billion.`, record)).toBe("validated");
  expect(check(`${label} from 2024-01-01 to 2024-12-31 was USD 1.234 billion.`, record)).toBe("unchecked");
});

it("D-263 reads component definitions declared in a producer label without removing basis qualifiers", () => {
  const record = { ...inc, label: "gross margin (gross profit divided by revenue)", unit: "percent" as const, currency: null, value: 12.34 };
  expect(check("Gross margin (gross profit divided by revenue) as of 2026-01-25 was 12.34%.", record)).toBe("validated");
  expect(check("Gross margin (GAAP) as of 2026-01-25 was 12.34%.", record)).toBe("unchecked");
});

it("D-263 plain cash-use fallback does not discard an explicit inflow", () => {
  const record: NumericProvenanceRecord = { ...inc, label: "dividends paid", value: -1.234e9, cashFlowDirection: "outflow" };
  const registry = [record];
  const options = { registry, excerpts: [], reportingCurrency: "USD", ignoreWords: [], seriesLatest: reportedSeriesLatest(registry), index: buildPlainFigureIndex(registry, [], "USD", []) };
  expect(checkPlainFigures("Dividends paid inflow as of 2026-01-25 was USD 1.234 billion.", options)[0].outcome).not.toBe("confirmed");
});

it.each(["positive", "proceeds", "refund", "received", "a source of cash", "provided", "added", "reversal"])("D-263 review preserves the opposing cash-use cue %s", cue => {
  const record: NumericProvenanceRecord = { ...inc, label: "cash capital expenditure", value: -1.234e9, cashFlowDirection: "outflow" };
  const registry = [record];
  const options = { registry, excerpts: [], reportingCurrency: "USD", ignoreWords: [], seriesLatest: reportedSeriesLatest(registry), index: buildPlainFigureIndex(registry, [], "USD", []) };
  expect(checkPlainFigures(`Cash capital expenditure as of 2026-01-25 was a ${cue} USD 1.234 billion.`, options)[0].outcome).not.toBe("confirmed");
});
it.each(["more or less", "well over plan", "plus or minus", "less buybacks"])("D-263 review retains incidental parenthetical %s", aside => {
  const record: NumericProvenanceRecord = { ...inc, label: "gross margin", value: 12.34, unit: "percent", currency: null };
  const registry = [record];
  const options = { registry, excerpts: [], reportingCurrency: "USD", ignoreWords: [], seriesLatest: reportedSeriesLatest(registry), index: buildPlainFigureIndex(registry, [], "USD", []) };
  expect(checkPlainFigures(`Gross margin (${aside}) as of 2026-01-25 was 22.34%.`, options)[0].outcome).toBe("contradiction");
});
it("D-263 review retains qualifiers in record labels", () => {
  const record: NumericProvenanceRecord = { ...inc, label: "margin (adjusted, less stock compensation)", value: 12.34, unit: "percent", currency: null };
  expect(check("Margin as of 2026-01-25 was 12.34%.", record)).toBe("unchecked");
});

it("D-263 review keeps an explicit positive sign as a real outflow conflict", () => {
  const record: NumericProvenanceRecord = { ...inc, label: "cash capital expenditure", value: -1.234e9, cashFlowDirection: "outflow" };
  const text = "Cash capital expenditure as of 2026-01-25 was +USD 1.234 billion.";
  expect(check(text, record)).toBe("contradicted");
  const registry = [record];
  expect(checkPlainFigures(text, { registry, excerpts: [], reportingCurrency: "USD", ignoreWords: [], seriesLatest: reportedSeriesLatest(registry), index: buildPlainFigureIndex(registry, [], "USD", []) })[0].outcome).toBe("contradiction");
});
