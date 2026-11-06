import { expect, it } from "vitest";
import { computeFairValue, withDegradedInputs } from "@/pipeline/stageB/fairValue";
import { buildDcfAssumptions, excessReturnModel, runDcf, type ValuationResult } from "@/pipeline/stageB/valuation";

const multiples = { multiples: [], enterpriseValue: { value: null, excludingLeases: null, includingLeases: null, leaseLiability: null,
  includeLeases: false, basis: "synthetic" }, sectorAppropriate: [], asOf: { quote: null, statements: null }, notes: [], gaps: [] };

function model(rolledTo?: string): Extract<ValuationResult, {kind:"dcf"}> {
  const built = buildDcfAssumptions({ revenueCagr3yPct: 8, revenueCagr5yPct: 8, analystEstimates: null, waccPct: 9, riskFreePct: 4,
    valuationDate: rolledTo,
    incomeTtm: { date: "2025-12-31", revenue: 1000, operatingIncome: 300, incomeBeforeTax: 280, incomeTaxExpense: 60 },
    incomeHistory: [
      { date: "2016-12-31", revenue: 600, operatingIncome: 170, incomeBeforeTax: 150, incomeTaxExpense: 30 },
      { date: "2023-12-31", revenue: 850, operatingIncome: 250, incomeBeforeTax: 230, incomeTaxExpense: 45 },
      { date: "2025-12-31", revenue: 1000, operatingIncome: 300, incomeBeforeTax: 280, incomeTaxExpense: 60 },
    ], balance: { date: "2025-12-31", basis: "annual", totalDebt: 200, totalStockholdersEquity: 800, cashAndShortTermInvestments: 300 }, marketCap: 5000 });
  if (!built.assumptions) throw Error("A real synthetic DCF is required");
  const dcf = runDcf(built.assumptions, { waccPct: 9, netDebt: -100, dilutedShares: 100 });
  expect(dcf.perShare).not.toBeNull();
  return { kind: "dcf", route: "general", assumptions: built.assumptions, dcf, sensitivity: null, reverseDcf: null, multiples, notes: [], gaps: [] };
}

function resolve(valuation: ValuationResult, quoteAsOf: string | null) {
  // Analysis time deliberately differs from price/model time: it is not date evidence.
  const input = { valuation, currentPrice: 100, currency: "USD", quoteAsOf, asOf: "2026-11-05" };
  return computeFairValue(input);
}

it.each([
  { name: "same-date model using older normalization observations", roll: undefined, quote: "2025-12-31", status: "available", use: "current", reason: "same-date", valueDate: "2025-12-31" },
  { name: "supported roll at the existing 200-day boundary", roll: "2026-07-19", quote: "2026-07-19", status: "available", use: "current", reason: "supported-roll-forward", valueDate: "2026-07-19" },
  { name: "unrolled 201-day model", roll: "2026-07-20", quote: "2026-07-20", status: "dated-reference", use: "dated-reference", reason: "not-rolled-to-quote", valueDate: "2025-12-31" },
  { name: "unrolled model inside the roll limit", roll: undefined, quote: "2026-01-10", status: "dated-reference", use: "dated-reference", reason: "not-rolled-to-quote", valueDate: "2025-12-31" },
  { name: "unknown quote observation", roll: undefined, quote: null, status: "suppressed", use: "unestablished", reason: "quote-date-missing", valueDate: "2025-12-31" },
  { name: "invalid Gregorian quote observation", roll: undefined, quote: "2026-02-30", status: "suppressed", use: "unestablished", reason: "quote-date-missing", valueDate: "2025-12-31" },
  { name: "future model date relative to the quote", roll: undefined, quote: "2025-12-30", status: "suppressed", use: "unestablished", reason: "future-value-date", valueDate: "2025-12-31" },
])("admits current use only for supported dates: $name", ({ roll, quote, status, use, reason, valueDate }) => {
  const valuation = model(roll), before = JSON.stringify(valuation);
  const fair = resolve(valuation, quote);
  expect(fair).toMatchObject({ status, currentUse: { status: use, statementDate: "2025-12-31", valueDate, reason } });
  if (use !== "current") { expect(fair.perShare).toBeNull(); expect(fair.upsidePct).toBeNull(); }
  if (use === "current") expect(fair.perShare?.asOf).toBe(valueDate);
  if (use === "dated-reference") {
    expect(fair).toMatchObject({ reference: { perShare: { asOf: valueDate }, valuationDate: valueDate, quoteDate: quote } });
    // Keep the existing two-decimal presentation; raw DCF precision is unchanged.
    expect(fair.reference?.perShare.value).toBeCloseTo(valuation.dcf!.perShare!, 2);
  }
  else expect(fair).not.toHaveProperty("reference");
  expect(JSON.stringify(valuation)).toBe(before);
});

it("refuses contradictory roll metadata rather than certifying the quoted date", () => {
  const valuation = model();
  valuation.assumptions!.valuationDate = { value: "2026-01-10", elapsedYears: 1, basis: "Synthetic contradictory elapsed time" };
  expect(resolve(valuation, "2026-01-10")).toMatchObject({ status: "suppressed", perShare: null, upsidePct: null,
    currentUse: { status: "unestablished", reason: "invalid-roll-forward" } });
});

it("does not substitute build time for missing model-date evidence", () => {
  const valuation = model();
  valuation.assumptions!.asOf = { ...valuation.assumptions!.asOf, statements: null };
  expect(resolve(valuation, "2026-01-10")).toMatchObject({ status: "suppressed", perShare: null,
    currentUse: { status: "unestablished", reason: "value-date-missing" } });
});

it("keeps financial refusals closed even when model and quote dates agree", () => {
  const valuation = model(); valuation.dcf!.noncontrollingKeyWithheld = "Synthetic common-income allocation is unestablished";
  const fair = resolve(valuation, "2025-12-31");
  expect(fair).toMatchObject({ status: "suppressed", perShare: null, currentUse: { status: "unestablished", reason: "model-unavailable" } });
  expect(fair).not.toHaveProperty("reference");
  expect(fair.reasons.some(reason => reason.reason.includes("common-income allocation"))).toBe(true);
});

it.each(["route-policy", "input-evidence", undefined] as const)("distinguishes deliberate exclusion from missing/unknown model evidence: %s", suppressionKind => {
  const valuation = { kind: "dcf-suppressed" as const, route: "general" as const, multiples, notes: [], gaps: [], suppressionKind,
    suppressionReason: "Identical display text cannot determine the classification" };
  expect(resolve(valuation, "2025-12-31")).toMatchObject({ status: "suppressed", currentUse: {
    status: suppressionKind === "route-policy" ? "not-applicable" : "unestablished",
    reason: suppressionKind === "route-policy" ? "route-policy" : "model-unavailable" } });
});

it("preserves current-use metadata when attaching an existing degraded-input warning", () => {
  const fair = resolve(model(), "2025-12-31");
  expect(withDegradedInputs(fair, { field: "provider.synthetic", reason: "Synthetic degraded input", severity: "warn" }))
    .toMatchObject({ currentUse: { status: "current", reason: "same-date" } });
});

it("keeps input limitations beside a supported dated reference", () => {
  const fair = resolve(model(), "2026-01-10");
  const warned = withDegradedInputs(fair, { field: "provider.synthetic", reason: "Synthetic degraded input", severity: "warn" });
  expect(warned.status).toBe("dated-reference");
  expect(warned.reasons.some(reason => reason.field === "provider.synthetic")).toBe(true);
});

it.each(["2025-12-31", "2026-07-20", null])("requires an actual aligned quote observation for the financial reverse solve: %s", quoteDate => {
  const input = { bookValue: 1000, currentRoePct: 14, costOfEquityPct: 9, payoutRatioPct: 40, dilutedShares: 100,
    asOf: "2025-12-31", price: 10, valuationDate: quoteDate, quoteAsOf: quoteDate };
  const result = excessReturnModel(input);
  const current = excessReturnModel({ ...input, valuationDate: "2025-12-31", quoteAsOf: "2025-12-31" });
  expect(current.reverseSolve.impliedCurrentRoePct).not.toBeNull();
  expect(result.perShare).toBe(current.perShare);
  if (quoteDate === "2025-12-31") expect(result.reverseSolve.impliedCurrentRoePct).not.toBeNull();
  else expect(result.reverseSolve.impliedCurrentRoePct).toBeNull();
});
