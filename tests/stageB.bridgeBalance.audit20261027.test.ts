/**
 * Audit 2026-10-27 FIN-103: the DCF equity bridge must read the balance at the
 * DCF statement date (the row D-65 promises: "the equity bridge stays at the
 * statement-date balance"). compute.ts took the bridge's net debt from
 * `pickBalanceAnchor` (the newer of the latest quarterly and annual balance
 * rows) whatever the income basis, so a DCF that fell back to the fiscal-year
 * statement bridged on a newer quarterly balance while its basis text claimed
 * the statement-date balance. The market EV keeps the newest balance.
 */
import { describe, expect, it } from "vitest";

import { dcfBridgeRow, runStageB } from "@/pipeline/compute";
import { buildDcfAssumptions, type DcfAssumptionInputs } from "@/pipeline/stageB/valuation";

import { M, currencyBundle } from "./helpers/currencyBundle";

const B = 1e9;
const HIST = ["2026-06-30", "2025-06-30", "2024-06-30", "2023-06-30", "2022-06-30"].map((date, i) => ({
  date, revenue: (80 - 4 * i) * B, operatingIncome: (18 - i) * B, grossProfit: 45 * B, incomeBeforeTax: (18 - i) * B, incomeTaxExpense: (3.2 - 0.15 * i) * B,
}));

function build(balanceDate: string, valuationDate = "2026-11-05") {
  return buildDcfAssumptions({
    revenueCagr3yPct: 5, revenueCagr5yPct: 5, analystEstimates: null, waccPct: 9, riskFreePct: 4.3,
    incomeTtm: { basis: "annual", ...HIST[0]! },
    incomeHistory: HIST,
    balance: { date: balanceDate, basis: "quarter", totalDebt: 20 * B, totalStockholdersEquity: 55 * B, cashAndShortTermInvestments: 18 * B },
    marketCap: 250 * B, domicileCountry: "US", valuationDate,
  } as DcfAssumptionInputs);
}

describe("FIN-103 the DCF bridge row", () => {
  it("the bridge row is the balance at the DCF statement date", () => {
    const q = { date: "2026-09-30", totalDebt: 20e9, totalStockholdersEquity: 55e9, cashAndShortTermInvestments: 18e9 };
    const a = { date: "2026-06-30", totalDebt: 21e9, totalStockholdersEquity: 52e9, cashAndShortTermInvestments: 14e9 };
    expect(dcfBridgeRow("2026-06-30", [q], [a], { row: q, basis: "quarter" })).toMatchObject({ row: a, basis: "annual", matchesStatement: true });
    // control: a TTM statement date equal to the newest quarter keeps it
    expect(dcfBridgeRow("2026-09-30", [q], [a], { row: q, basis: "quarter" })).toMatchObject({ row: q, basis: "quarter", matchesStatement: true });
    expect(dcfBridgeRow("2026-05-31", [q], [a], { row: q, basis: "quarter" })).toMatchObject({ row: q, matchesStatement: false });
  });

  it("a statement-date row missing a field the anchors read is passed over, as pickBalanceAnchor does", () => {
    // The Caterpillar shape: the 10-Q tags no debt line.
    const a = { date: "2026-06-30", totalDebt: 21e9, totalStockholdersEquity: 52e9, cashAndShortTermInvestments: 14e9 };
    const noDebt: { date: string; totalDebt: number | null; totalStockholdersEquity: number; cashAndShortTermInvestments: number } =
      { date: "2026-09-30", totalDebt: null, totalStockholdersEquity: 55, cashAndShortTermInvestments: 18 };
    expect(dcfBridgeRow("2026-09-30", [noDebt], [a], { row: a, basis: "annual" })).toMatchObject({ row: a, basis: "annual", matchesStatement: false });
  });

  it("a refusal on the newest row is not cured by moving to the statement-date row", () => {
    // pickBalanceAnchor keeps a refused newest row; the bridge must not restore an older balance the current filing withholds.
    const refused = { date: "2026-09-30", totalDebt: 20e9, totalStockholdersEquity: 55e9, cashAndShortTermInvestments: 18e9,
      fieldConflicts: { cashAndShortTermInvestments: { usable: false } } };
    const a = { date: "2026-06-30", totalDebt: 21e9, totalStockholdersEquity: 52e9, cashAndShortTermInvestments: 14e9 };
    expect(dcfBridgeRow("2026-06-30", [refused], [a], { row: refused, basis: "quarter" })).toMatchObject({ row: refused, basis: "quarter", matchesStatement: false });
  });
});

describe("FIN-103 runStageB bridges the statement-date balance", () => {
  // The quarterly balance rows are admitted only with a currency label (the helper leaves them unlabelled).
  const OPTIONS = { debt: 300, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] } as const;

  /** Drop the 2025-09-30 quarter, so the four-quarter window is not contiguous and the DCF falls back to FY2025. */
  function annualBase() {
    const bundle = currencyBundle(OPTIONS);
    const member = bundle.statements.incomeQuarterly;
    if (member.ok) member.value.data.rows = member.value.data.rows.filter((r) => r.date !== "2025-09-30");
    return bundle;
  }

  it("an annual-base DCF bridges on the fiscal-year balance, not the newer quarter", () => {
    const control = runStageB(currencyBundle(OPTIONS));
    const v = runStageB(annualBase()).valuation;
    if (v.kind !== "dcf" || v.dcf === null || v.assumptions === null) throw new Error("expected a DCF");
    expect(v.assumptions.forecastPeriod!.basis).toBe("fiscal-year");
    expect(v.dcf.bridge.netDebt).toBe(200 * M); // FY2025: 300 - 100; the 2026-03-31 quarter would give 180
    expect(v.assumptions.salesToCapital.basis).toMatch(/balance as of 2025-12-31/);
    // control: the market EV keeps the newest quarter
    expect(v.multiples!.enterpriseValue.value).toBe(control.valuation.multiples!.enterpriseValue.value);
  });

  it("a TTM-base DCF keeps the newest quarter", () => {
    const v = runStageB(currencyBundle(OPTIONS)).valuation;
    if (v.kind !== "dcf" || v.dcf === null || v.assumptions === null) throw new Error("expected a DCF");
    expect(v.dcf.bridge.netDebt).toBe(180 * M);
    expect(v.assumptions.salesToCapital.basis).toMatch(/balance as of 2026-03-31/);
  });
});

describe("FIN-103 the valuation-date basis names the balance bridged", () => {
  it("with no balance at the statement date the basis names the balance used", () => {
    const built = build("2026-09-30");
    const a = built.assumptions!;
    expect(a).not.toBeNull();
    expect(a.valuationDate!.basis).toMatch(/equity bridge uses the 2026-09-30 balance, 92 days after the statement date/);
    expect(a.valuationDate!.basis).not.toMatch(/stays at the 2026-06-30 balance/);
    expect(built.gaps).toContainEqual(expect.objectContaining({ field: "valuation.dcf.bridgeBalanceDate", severity: "info" }));

    // an OLDER balance (2026-03-31 against the 2026-06-30 statement) is named as such
    const older = build("2026-03-31");
    expect(older.assumptions!.valuationDate!.basis).toMatch(/equity bridge uses the 2026-03-31 balance, 91 days before the statement date/);
    expect(older.gaps).toContainEqual(expect.objectContaining({ field: "valuation.dcf.bridgeBalanceDate", severity: "info" }));

    // control: a balance dated at the statement date keeps the D-65 sentence and raises no gap
    const matched = build("2026-06-30");
    expect(matched.assumptions!.valuationDate!.basis).toMatch(/equity bridge stays at the 2026-06-30 balance/);
    expect(matched.gaps.some((g) => g.field === "valuation.dcf.bridgeBalanceDate")).toBe(false);
  });

  it("past the roll-forward limit the statement-date note names the bridge balance too", () => {
    const far = build("2026-09-30", "2027-09-30");
    expect(far.notes.join("\n")).toMatch(/beyond the \d+-day roll-forward limit[^\n]*equity bridge uses the 2026-09-30 balance/);
    expect(far.gaps).toContainEqual(expect.objectContaining({ field: "valuation.dcf.bridgeBalanceDate", severity: "info" }));
  });
});
