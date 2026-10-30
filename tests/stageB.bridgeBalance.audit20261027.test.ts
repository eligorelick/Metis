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

const row = (date: string, totalDebt: number | null, extra: Record<string, unknown> = {}) =>
  ({ date, totalDebt, totalStockholdersEquity: 55e9, cashAndShortTermInvestments: 18e9, ...extra });

describe("FIN-103 the DCF bridge row", () => {
  it("the bridge row is the balance at the DCF statement date", () => {
    const q = row("2026-09-30", 20e9);
    const a = row("2026-06-30", 21e9);
    expect(dcfBridgeRow("2026-06-30", "annual", [q], [a], { row: q, basis: "quarter" })).toMatchObject({ row: a, basis: "annual", matchesStatement: true, cause: "statement-row" });
    // control: a TTM statement date equal to the newest quarter keeps it
    expect(dcfBridgeRow("2026-09-30", "ttm", [q], [a], { row: q, basis: "quarter" })).toMatchObject({ row: q, basis: "quarter", matchesStatement: true, cause: "statement-row" });
    expect(dcfBridgeRow("2026-05-31", "ttm", [q], [a], { row: q, basis: "quarter" })).toMatchObject({ row: q, matchesStatement: false, cause: "none-filed" });
  });

  it("a statement-date row missing a field the anchors read is passed over, as pickBalanceAnchor does", () => {
    // The Caterpillar shape: the 10-Q tags no debt line.
    const a = row("2026-06-30", 21e9);
    const noDebt = row("2026-09-30", null);
    expect(dcfBridgeRow("2026-09-30", "ttm", [noDebt], [a], { row: a, basis: "annual" }))
      .toMatchObject({ row: a, basis: "annual", matchesStatement: false, cause: "incomplete", detail: "totalDebt" });
  });

  it("the statement basis orders a fiscal-year-end tie: annual base takes the FY row, TTM base the quarter row", () => {
    const quarter = row("2025-12-31", 300e9, { cashAndShortTermInvestments: 120e9 });
    const fiscal = row("2025-12-31", 300e9, { cashAndShortTermInvestments: 100e9 });
    const newer = row("2026-03-31", 300e9);
    expect(dcfBridgeRow("2025-12-31", "annual", [newer, quarter], [fiscal], { row: newer, basis: "quarter" })).toMatchObject({ row: fiscal, basis: "annual", cause: "statement-row" });
    expect(dcfBridgeRow("2025-12-31", "ttm", [newer, quarter], [fiscal], { row: newer, basis: "quarter" })).toMatchObject({ row: quarter, basis: "quarter", cause: "statement-row" });
    // the anchor, when it is one of the dated candidates, takes its family's place: it is not tried first
    expect(dcfBridgeRow("2025-12-31", "annual", [quarter], [fiscal], { row: quarter, basis: "quarter" })).toMatchObject({ row: fiscal, basis: "annual" });
  });

  it("a refusal on the newest row is not cured by moving to the statement-date row", () => {
    // pickBalanceAnchor keeps a refused newest row; the bridge must not restore an older balance the current filing withholds.
    const refused = row("2026-09-30", 20e9, { fieldConflicts: { cashAndShortTermInvestments: { usable: false, reason: "cash scope" } } });
    const a = row("2026-06-30", 21e9);
    expect(dcfBridgeRow("2026-06-30", "annual", [refused], [a], { row: refused, basis: "quarter" }))
      .toMatchObject({ row: refused, basis: "quarter", matchesStatement: false, cause: "anchor-refused" });
  });

  it("a statement-date row the ownership gate would withhold keeps the clean anchor (M-2 a)", () => {
    // Consolidated-only equity: its parent equity is the consolidated total, so it is whole but the gate withholds it.
    const consolidatedOnly = row("2026-06-30", 21e9, {
      fieldProvenance: { totalStockholdersEquity: { tags: ["us-gaap/StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"] } },
    });
    const anchor = row("2026-09-30", 20e9);
    const result = dcfBridgeRow("2026-06-30", "ttm", [anchor], [consolidatedOnly], { row: anchor, basis: "quarter" });
    expect(result).toMatchObject({ row: anchor, basis: "quarter", matchesStatement: false, cause: "statement-row-refused" });
    expect(result.detail).toMatch(/consolidated equity/);
  });

  it("an anchor whose ownership is unresolved is kept beside a clean statement-date row (M-2 b)", () => {
    // Total equity differs from parent equity and no NCI line: the DCF's gate withholds the anchor, and another date must not cure it.
    const anchor = row("2026-09-30", 20e9, { totalEquity: 80e9 });
    const clean = row("2026-06-30", 21e9);
    expect(dcfBridgeRow("2026-06-30", "ttm", [anchor], [clean], { row: anchor, basis: "quarter" }))
      .toMatchObject({ row: anchor, basis: "quarter", matchesStatement: false, cause: "anchor-refused", detail: "noncontrolling ownership unresolved" });
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

  it("a TTM base at a fiscal-year end bridges on the quarter row, not the fiscal-year row of the same date", () => {
    const bundle = currencyBundle(OPTIONS);
    const member = bundle.statements.incomeQuarterly;
    // Drop the 2026-03-31 quarter: the window ends 2025-12-31 while the newest balance quarter (2026-03-31) is the anchor.
    if (member.ok) member.value.data.rows = member.value.data.rows.filter((r) => r.date !== "2026-03-31");
    const v = runStageB(bundle).valuation;
    if (v.kind !== "dcf" || v.dcf === null || v.assumptions === null) throw new Error("expected a DCF");
    expect(v.assumptions.forecastPeriod!.basis).toBe("rolling-12-month");
    expect(v.dcf.bridge.netDebt).toBe(180 * M); // the 2025-12-31 quarter row (cash 120); the FY row (cash 100) would give 200
  });

  it("the Caterpillar shape: a TTM base whose statement-date quarter tags no debt keeps the anchor, with a true reason", () => {
    const bundle = currencyBundle(OPTIONS);
    const rows = bundle.statements.balanceQuarterly;
    if (rows.ok) rows.value.data.rows[0] = { ...rows.value.data.rows[0]!, totalDebt: undefined };
    const caterpillar = runStageB(bundle).valuation;
    // Control: the same bundle with no quarterly balance rows at all, so the anchor is the same FY row.
    const control = currencyBundle(OPTIONS);
    const controlRows = control.statements.balanceQuarterly;
    if (controlRows.ok) controlRows.value.data.rows = [];
    const anchored = runStageB(control).valuation;
    if (caterpillar.kind !== "dcf" || caterpillar.dcf === null || anchored.kind !== "dcf" || anchored.dcf === null) throw new Error("expected DCFs");
    expect(caterpillar.dcf.bridge.netDebt).toBe(200 * M);
    expect(caterpillar.dcf.perShare).toBe(anchored.dcf.perShare);
    const gap = caterpillar.gaps.find((g) => g.field === "valuation.dcf.bridgeBalanceDate");
    expect(gap?.severity).toBe("info");
    expect(gap?.reason).toMatch(/lacks totalDebt/);
    expect(gap?.reason).not.toMatch(/no balance sheet is filed/);
    expect(caterpillar.gaps.some((g) => g.field === "valuation.balanceAnchor")).toBe(true);
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

  it("each cause words the gap with what was checked", () => {
    const withCause = (cause: "none-filed" | "incomplete" | "statement-row-refused" | "anchor-refused", detail: string | null) =>
      buildDcfAssumptions({
        revenueCagr3yPct: 5, revenueCagr5yPct: 5, analystEstimates: null, waccPct: 9, riskFreePct: 4.3,
        incomeTtm: { basis: "annual", ...HIST[0]! }, incomeHistory: HIST,
        balance: { date: "2026-03-31", basis: "quarter", totalDebt: 20 * B, totalStockholdersEquity: 55 * B, cashAndShortTermInvestments: 18 * B },
        bridgeCause: { cause, detail },
        marketCap: 250 * B, domicileCountry: "US", valuationDate: "2026-11-05",
      } as DcfAssumptionInputs).gaps.find((g) => g.field === "valuation.dcf.bridgeBalanceDate")!.reason;
    expect(withCause("none-filed", null)).toMatch(/^no balance sheet is filed at the statement date 2026-06-30; the equity bridge uses the 2026-03-31 balance, 91 days before/);
    expect(withCause("incomplete", "totalDebt")).toMatch(/^the balance sheet at the statement date 2026-06-30 lacks totalDebt; the equity bridge uses the 2026-03-31 balance/);
    expect(withCause("statement-row-refused", "consolidated equity")).toMatch(/^the balance sheet at the statement date 2026-06-30 is withheld \(consolidated equity\); the equity bridge keeps the 2026-03-31 balance/);
    expect(withCause("anchor-refused", "x")).toMatch(/^the market EV's balance \(2026-03-31\) is withheld \(x\), so the equity bridge keeps it and the DCF stays withheld as before/);
  });

  it("past the roll-forward limit the statement-date note names the bridge balance too", () => {
    const far = build("2026-09-30", "2027-09-30");
    expect(far.notes.join("\n")).toMatch(/beyond the \d+-day roll-forward limit[^\n]*equity bridge uses the 2026-09-30 balance/);
    expect(far.gaps).toContainEqual(expect.objectContaining({ field: "valuation.dcf.bridgeBalanceDate", severity: "info" }));
  });
});
