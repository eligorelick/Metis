import { isDeltaRecord, labelOperands } from "@/pipeline/stageC/consistency";
import { expect, it } from "vitest";
import { validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
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
 const bundle = completeCurrencyBundle({ debt: 300 });
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
