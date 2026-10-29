/**
 * Audit 2026-10-27 FIN-303 and FIN-303-V1 (batch B4, Task 4): invested capital
 * uses one lease basis. D-25 removes the operating-lease slice from debt for
 * the EV bridge, the WACC debt leg and ROIC; the DCF's sales-to-capital and its
 * A-2 history kept it, so the same lease was charged twice (inside the projected
 * EBIT and inside the capital reinvestment must rebuild). The slice leaves debt
 * only when total debt is shown to hold it (CODE-1, `operatingLeaseScopeUnproven`):
 * ROIC removed it without that proof.
 *
 * Hermetic: direct `buildDcfAssumptions` / `valueCompany` fixtures and the
 * synthetic `completeCurrencyBundle`; seeds `probes/FIN-303.probe.ts` and
 * `probes/FIN-303-V1.probe.ts` with every `fs` read and write dropped.
 */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import { operatingLeaseOutOfDebt, operatingLeaseScopeUnproven } from "@/pipeline/stageB/netDebt";
import { computeRoic, type ReturnsBalanceRow, type ReturnsIncomeRow } from "@/pipeline/stageB/returns";
import {
  buildDcfAssumptions,
  establishedSalesToCapital,
  runDcf,
  valueCompany,
  type DcfAssumptionInputs,
  type DcfBalanceRow,
  type DcfIncomeRow,
  type MultiplesFrameworkInputs,
} from "@/pipeline/stageB/valuation";
import type { CompanyRoute } from "@/types/core";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";

const route: CompanyRoute = { base: "general", overlays: [], evidence: { sector: null, industry: null } };

// ---------------------------------------------------------------------------
// FIN-303: the DCF's sales-to-capital (probe Part 1 and its restaurant-shaped case)
// ---------------------------------------------------------------------------

const base = {
  revenueCagr3yPct: 8, revenueCagr5yPct: 8, analystEstimates: null, waccPct: 10, riskFreePct: 4, marketCap: 20e9,
  incomeTtm: { date: "2026-03-31", revenue: 1000e6, operatingIncome: 200e6, incomeBeforeTax: 180e6, incomeTaxExpense: 36e6 },
  incomeHistory: [2023, 2024, 2025].map((y) => ({ date: `${y}-12-31`, revenue: 900e6, operatingIncome: 180e6, incomeBeforeTax: 160e6, incomeTaxExpense: 32e6 })),
};
// Financial debt 100M + operating lease 200M = total debt 300M; equity 500M; cash 100M.
const withLeaseBalance = {
  date: "2026-03-31", basis: "quarter" as const, totalDebt: 300e6, shortTermDebt: 20e6, longTermDebt: 80e6,
  operatingLeaseLiability: 200e6, capitalLeaseObligations: 200e6, financeLeaseLiability: 0, totalStockholdersEquity: 500e6, cashAndShortTermInvestments: 100e6,
};
const noLeaseBalance = {
  date: "2026-03-31", basis: "quarter" as const, totalDebt: 100e6, shortTermDebt: 20e6, longTermDebt: 80e6,
  operatingLeaseLiability: 0, capitalLeaseObligations: 0, financeLeaseLiability: 0, totalStockholdersEquity: 500e6, cashAndShortTermInvestments: 100e6,
};
const dcfInput = (balance: DcfBalanceRow, extra: Partial<DcfAssumptionInputs> = {}): DcfAssumptionInputs => ({ ...base, balance, ...extra });

describe("FIN-303: sales-to-capital removes the operating lease the bridge removes (D-25)", () => {
  it("a fully covered operating lease leaves sales-to-capital's invested capital", () => {
    const withLease = buildDcfAssumptions(dcfInput(withLeaseBalance));
    const noLease = buildDcfAssumptions(dcfInput(noLeaseBalance));
    // 1000 / (300 - 200 + 500 - 100) = 2.0, the no-lease balance's own figure.
    expect(withLease.assumptions!.salesToCapital.value).toBeCloseTo(2.0, 9);
    expect(withLease.assumptions!.salesToCapital.basis).toMatch(/operating-lease liability 200M removed: its cost is inside the EBIT this DCF projects \(ASC 842; D-25\)/);
    // Control: a balance with no lease, and the lease-inclusive switch (the default's opposite).
    expect(noLease.assumptions!.salesToCapital.value).toBeCloseTo(2.0, 9);
    const included = buildDcfAssumptions(dcfInput(withLeaseBalance, { includeLeasesInEv: true }));
    expect(included.assumptions!.salesToCapital.value).toBeCloseTo(1000 / 700, 9);
  });

  it("an unproven operating lease stays in sales-to-capital's capital and the basis says why", () => {
    const unproven = { ...withLeaseBalance, capitalLeaseObligations: null, shortTermDebt: 50e6, longTermDebt: 250e6 };
    const built = buildDcfAssumptions(dcfInput(unproven));
    expect(built.assumptions!.salesToCapital.value).toBeCloseTo(1000 / 700, 9);
    expect(built.assumptions!.salesToCapital.basis).toMatch(/operating-lease scope unproven/);
  });

  it("DCF per share is invariant to an operating lease the bridge removes", () => {
    // Restaurant-shaped: leases of 5.0B inside 6.4B of total debt.
    const r = {
      ...base, revenueCagr3yPct: 5, revenueCagr5yPct: 5, waccPct: 8, marketCap: 18e9,
      incomeTtm: { date: "2026-05-31", revenue: 11.4e9, operatingIncome: 1.14e9, incomeBeforeTax: 1.0e9, incomeTaxExpense: 0.15e9 },
      incomeHistory: [[2023, 9.8e9], [2024, 10.5e9], [2025, 11.0e9]].map(([y, rev]) => ({ date: `${y}-05-31`, revenue: rev!, operatingIncome: rev! * 0.1, incomeBeforeTax: rev! * 0.09, incomeTaxExpense: rev! * 0.012 })),
    };
    const bal = (op: number): DcfBalanceRow => ({
      date: "2026-05-31", basis: "quarter", totalDebt: 1.4e9 + op, shortTermDebt: 0.1e9, longTermDebt: 1.3e9,
      operatingLeaseLiability: op, capitalLeaseObligations: op, financeLeaseLiability: 0, totalStockholdersEquity: 2.2e9, cashAndShortTermInvestments: 0.2e9,
    });
    const a1 = buildDcfAssumptions({ ...r, balance: bal(5.0e9) }).assumptions!;
    const a0 = buildDcfAssumptions({ ...r, balance: bal(0) }).assumptions!;
    const opts = { waccPct: 8, netDebt: 1.2e9, dilutedShares: 117e6 };
    const v1 = runDcf(a1, opts), v0 = runDcf(a0, opts);
    expect(v1.perShare).toBeCloseTo(v0.perShare as number, 2);
  });
});

// ---------------------------------------------------------------------------
// The shared predicate
// ---------------------------------------------------------------------------

describe("operatingLeaseOutOfDebt: the CODE-1 proven slice", () => {
  const proven = { totalDebt: 300, shortTermDebt: 20, longTermDebt: 80, operatingLeaseLiability: 200, capitalLeaseObligations: 200 };
  it("returns the slice on the default switch when the scope is proven, and nothing with the switch set", () => {
    expect(operatingLeaseOutOfDebt(proven, false)).toEqual({ amount: 200, note: null });
    expect(operatingLeaseOutOfDebt(proven, true)).toEqual({ amount: 0, note: null });
  });
  it("returns nothing and the unproven reason when total debt is not shown to hold the lease", () => {
    const row = { totalDebt: 300, shortTermDebt: 50, longTermDebt: 250, operatingLeaseLiability: 150, capitalLeaseObligations: null };
    const out = operatingLeaseOutOfDebt(row, false);
    expect(out.amount).toBe(0);
    expect(out.note).toBe(operatingLeaseScopeUnproven(row));
    expect(out.note).toMatch(/operating-lease scope unproven/);
  });
  it("returns nothing, with a reason, for a slice larger than total debt, and nothing for a row without a lease", () => {
    const over = operatingLeaseOutOfDebt({ totalDebt: 100, capitalLeaseObligations: 200, operatingLeaseLiability: 200 }, false);
    expect(over.amount).toBe(0);
    expect(over.note).toMatch(/exceeds total debt/);
    expect(operatingLeaseOutOfDebt({ totalDebt: 100, operatingLeaseLiability: null }, false)).toEqual({ amount: 0, note: null });
    expect(operatingLeaseOutOfDebt({ totalDebt: 100, operatingLeaseLiability: 0 }, false)).toEqual({ amount: 0, note: null });
  });
});

// ---------------------------------------------------------------------------
// The A-2 history (the history is measured on the current balance's lease basis)
// ---------------------------------------------------------------------------

describe("the A-2 history is measured on one lease basis", () => {
  const income = (years: [string, number][]): DcfIncomeRow[] => years.map(([y, revenue]) => ({ date: `${y}-12-31`, revenue, operatingIncome: revenue / 5 }));
  const row = (y: string, over: Partial<DcfBalanceRow> = {}): DcfBalanceRow => ({
    date: `${y}-12-31`, basis: "annual", totalDebt: 300, operatingLeaseLiability: 200, capitalLeaseObligations: 200,
    totalStockholdersEquity: 2000, cashAndShortTermInvestments: 100, ...over,
  });
  const excluded = { fcx1Excluded: false, includeLeasesInEv: false, currentRowExcludesLease: true };

  it("the A-2 history measures each year on the same lease basis", () => {
    const inc = income([["2023", 800], ["2024", 900], ["2025", 1000]]);
    const rows = ["2023", "2024", "2025"].map((y) => row(y));
    const stripped = ["2023", "2024", "2025"].map((y) => row(y, { totalDebt: 100, operatingLeaseLiability: null, capitalLeaseObligations: null }));
    const got = establishedSalesToCapital(inc, rows, excluded);
    expect(got.ratio).toBeCloseTo(establishedSalesToCapital(inc, stripped, excluded).ratio as number, 9);
    expect(got.ratio).toBeCloseTo(0.45, 9);
    expect(got.ratio).not.toBeCloseTo(900 / 2200, 4);
    // Control: the lease-inclusive switch keeps the lease in every year.
    const included = establishedSalesToCapital(inc, rows, { ...excluded, includeLeasesInEv: true });
    expect(included.ratio).toBeCloseTo(900 / 2200, 9);
  });

  it("an unproven history year is left out of a lease-excluded median", () => {
    const inc = income([["2022", 700], ["2023", 800], ["2024", 900], ["2025", 1000]]);
    const rows = [
      row("2022"), row("2023"),
      row("2024", { capitalLeaseObligations: null, shortTermDebt: 50, longTermDebt: 250 }),
      row("2025"),
    ];
    const got = establishedSalesToCapital(inc, rows, excluded);
    expect(got.ratio).toBeCloseTo(0.4, 9);
    expect(got.basis).toContain("FY2022-12-31 0.3500x");
    expect(got.basis).toContain("FY2023-12-31 0.4000x");
    expect(got.basis).toContain("FY2025-12-31 0.5000x");
    expect(got.basis).toMatch(/FY2024-12-31 left out: operating-lease scope unproven: the operating-lease liability 0M is not shown to be inside total debt 0M .*- the year cannot be put on the current balance's lease-excluded basis/);
    expect(got.basis).not.toContain("0.4091x");
    // Control: an unproven CURRENT row keeps debt as reported for every year (one lease-inclusive basis).
    const mixedFree = establishedSalesToCapital(inc, rows, { ...excluded, currentRowExcludesLease: false });
    expect(mixedFree.ratio).toBeCloseTo(850 / 2200, 9);
    expect(mixedFree.basis).toContain("FY2024-12-31 0.4091x");
    expect(mixedFree.basis).not.toMatch(/left out/);
  });

  it("the FCX-1 mode still subtracts the disclosed operating portion and skips a year that has none", () => {
    const inc = income([["2023", 800], ["2024", 900], ["2025", 1000], ["2022", 700]]);
    const rows = [row("2022", { operatingLeaseLiability: null }), row("2023"), row("2024"), row("2025")];
    const got = establishedSalesToCapital(inc, rows, { fcx1Excluded: true, includeLeasesInEv: false, currentRowExcludesLease: true });
    expect(got.basis).not.toContain("FY2022");
    expect(got.ratio).toBeCloseTo(0.45, 9);
  });
});

// ---------------------------------------------------------------------------
// Lease-emptied capital (pre-flight I6; Review Focus 13)
// ---------------------------------------------------------------------------

describe("lease-emptied capital (Review Focus 13)", () => {
  // Total debt 300M holds a covered operating lease of 250M; equity -100M; cash 50M:
  // 150M lease-inclusive, -100M once the lease leaves debt.
  const emptied = (over: Partial<DcfBalanceRow> = {}): DcfBalanceRow => ({
    date: "2026-03-31", basis: "quarter", totalDebt: 300e6, shortTermDebt: 10e6, longTermDebt: 40e6,
    operatingLeaseLiability: 250e6, capitalLeaseObligations: 250e6, financeLeaseLiability: 0,
    totalStockholdersEquity: -100e6, cashAndShortTermInvestments: 50e6, ...over,
  });
  const historyRow = (y: number): DcfBalanceRow => ({
    date: `${y}-12-31`, basis: "annual", totalDebt: 300e6, shortTermDebt: 10e6, longTermDebt: 40e6,
    operatingLeaseLiability: 250e6, capitalLeaseObligations: 250e6, financeLeaseLiability: 0,
    totalStockholdersEquity: 500e6, cashAndShortTermInvestments: 50e6,
  });
  const income = [2021, 2022, 2023, 2024, 2025].map((y, i) => ({ date: `${y}-12-31`, revenue: (600 + 100 * i) * 1e6, operatingIncome: 100e6, incomeBeforeTax: 90e6, incomeTaxExpense: 18e6 }));
  const lease = { fcx1Excluded: false, includeLeasesInEv: false, currentRowExcludesLease: true };

  it("lease-emptied capital takes the issuer's own history on the same basis", () => {
    const capitalHistory = [2023, 2024, 2025].map(historyRow);
    const history = establishedSalesToCapital(income, capitalHistory, lease);
    expect(history.ratio).not.toBeNull();
    const built = buildDcfAssumptions({ ...base, incomeHistory: income, balance: emptied(), capitalHistory });
    const a = built.assumptions!;
    expect(a).not.toBeNull();
    expect(a.salesToCapital.value).toBeCloseTo(history.ratio as number, 9);
    expect(a.salesToCapital.value).not.toBeCloseTo(1000e6 / 150e6, 3);
    expect(a.salesToCapital.basis).toMatch(/not positive once the operating lease .* leaves debt/);
    expect(a.salesToCapital.basis).toContain("FY2025-12-31");
    expect(built.gaps.some((g) => g.field === "valuation.dcf.salesToCapital")).toBe(false);

    // A long-term investment is still added back (OD-6), and the history ratio is used, not Task 5's cap.
    const withLti = buildDcfAssumptions({ ...base, incomeHistory: income, balance: emptied({ longTermInvestments: 30e6 }), capitalHistory }).assumptions!;
    expect(withLti.salesToCapital.value).toBeCloseTo(history.ratio as number, 9);
    expect(withLti.nonOperatingInvestments).toEqual({ value: 30e6, balanceDate: "2026-03-31" });

    // ... and the bridge carries it as a component.
    const multiples: MultiplesFrameworkInputs = {
      quote: { price: 100, marketCap: 10e9, currency: "USD" }, reportedCurrency: "USD",
      incomeTtm: { date: "2026-03-31", revenue: 1000e6, operatingIncome: 200e6, depreciationAndAmortization: 50e6, netIncome: 144e6, epsDiluted: 1.44 },
      cashFlowTtm: { date: "2026-03-31", operatingCashFlow: 180e6, capitalExpenditure: -30e6, depreciationAndAmortization: 50e6 },
      balance: { date: "2026-03-31", totalDebt: 300e6, cashAndShortTermInvestments: 50e6, totalStockholdersEquity: -100e6, goodwill: 0, intangibleAssets: 0, minorityInterest: 0, preferredStock: 0 },
    };
    const valued = valueCompany(route, {
      currentPrice: 100, waccPct: 10, netDebt: 250e6, dilutedShares: 100e6, multiples, excessReturn: null, reit: null,
      dcfInputs: { ...base, incomeHistory: income, balance: emptied({ longTermInvestments: 30e6 }), capitalHistory, marketCap: 10e9 },
    });
    if (valued.kind !== "dcf" || valued.dcf === null) throw new Error("expected the DCF route");
    expect(valued.dcf.bridge?.nonOperatingComponents ?? []).toContainEqual(expect.objectContaining({ kind: "long-term-investments", value: 30e6 }));
  });

  it("lease-emptied capital without three usable years withholds the DCF and says why", () => {
    const capitalHistory = [2024, 2025].map(historyRow);
    const built = buildDcfAssumptions({ ...base, incomeHistory: income, balance: emptied(), capitalHistory });
    expect(built.assumptions).toBeNull();
    const gap = built.gaps.find((g) => g.field === "valuation.dcf.salesToCapital");
    expect(gap?.severity).toBe("critical");
    expect(gap?.reason).toMatch(/invested capital -100M/);
    expect(gap?.reason).toMatch(/once the operating lease .* leaves debt/);
    expect(gap?.reason).toMatch(/lease-excluded basis/);
    // Control: with the switch set the lease stays in capital and the DCF publishes on 150M, as at main.
    const included = buildDcfAssumptions({ ...base, incomeHistory: income, balance: emptied(), capitalHistory, includeLeasesInEv: true });
    expect(included.assumptions).not.toBeNull();
    expect(included.assumptions!.salesToCapital.value).toBe(5);
    expect(included.assumptions!.salesToCapital.basis).toMatch(/1000000000 \/ 150000000|raw ratio 6\.6667x/);
  });

  it("a non-positive capital with no lease removed keeps main's gap text", () => {
    const noLease = emptied({ totalDebt: 50e6, operatingLeaseLiability: null, capitalLeaseObligations: null });
    const built = buildDcfAssumptions({ ...base, balance: noLease });
    expect(built.assumptions).toBeNull();
    expect(built.gaps.find((g) => g.field === "valuation.dcf.salesToCapital")?.reason).toMatch(/^invested capital <= 0 - this sales-to-capital DCF is suppressed/);
  });
});

// ---------------------------------------------------------------------------
// FIN-303-V1: ROIC follows the CODE-1 proof (probe: synthetic FMP-shaped rows)
// ---------------------------------------------------------------------------

const secLease = (date: string) => ({
  source: "edgar" as const, unit: "USD", periodStart: null, periodEnd: date, observedAt: "2026-10-16T00:00:00Z",
  tags: ["us-gaap/OperatingLeaseLiability"], filings: [{ accn: "0000000001-26-000001", filed: "2026-02-01", form: "10-K" }],
});

function bundleWith(lease: number | null, row: Record<string, unknown>) {
  const bundle = completeCurrencyBundle({ debt: 300, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  for (const result of [bundle.statements.balanceQuarterly, bundle.statements.balanceAnnual]) {
    if (!result.ok) throw new Error("Missing balance fixture");
    for (const r of result.value.data.rows) {
      Object.assign(r, row, {
        netDebt: null, cashAndCashEquivalents: 100 * M, shortTermInvestments: 0, cashAndShortTermInvestments: 100 * M,
        financeLeaseLiability: null, operatingLeaseLiability: lease,
      });
      if (lease !== null) r.fieldProvenance = { ...(r.fieldProvenance ?? {}), operatingLeaseLiability: secLease(String(r.date)) };
    }
  }
  return bundle;
}

function roicOf(lease: number | null, row: Record<string, unknown>) {
  const out = runStageB(bundleWith(lease, row), { evIncludeLeases: false });
  const latest = out.returns.roic.series[out.returns.roic.series.length - 1] ?? null;
  return { icAvg: latest?.investedCapitalAvg ?? null, notes: latest?.notes ?? [] };
}

describe("FIN-303-V1: ROIC removes the operating lease only when total debt is shown to hold it", () => {
  // FMP row: total debt = short + long borrowings (300M); no lease total; a 150M operating lease enriched from SEC.
  const borrowingsOnly = { totalDebt: 300 * M, shortTermDebt: 50 * M, longTermDebt: 250 * M, capitalLeaseObligations: null };
  const proven = { totalDebt: 450 * M, shortTermDebt: 50 * M, longTermDebt: 250 * M, capitalLeaseObligations: 150 * M };

  it("ROIC removes the operating lease only when total debt is shown to hold it", () => {
    const none = roicOf(null, borrowingsOnly);
    const unproven = roicOf(150 * M, borrowingsOnly);
    expect(unproven.icAvg).toBe(675 * M);
    expect(unproven.icAvg).toBe(none.icAvg);
    expect(unproven.notes.join(" ")).toMatch(/operating-lease scope unproven/);
    expect(unproven.notes.join(" ")).not.toMatch(/excluded from invested capital/);
    // Control: a proven row (the 150M lease is inside the 450M) removes it and lands on the same capital.
    const covered = roicOf(150 * M, proven);
    expect(covered.icAvg).toBe(675 * M);
    expect(covered.notes.join(" ")).toMatch(/excluded from invested capital/);
  });

  it("computeRoic directly: an unproven lease is not subtracted from totalDebt", () => {
    const bal = (date: string, over: Partial<ReturnsBalanceRow> = {}): ReturnsBalanceRow => ({
      date, totalDebt: 300, shortTermDebt: 50, longTermDebt: 250, capitalLeaseObligations: null, operatingLeaseLiability: 150,
      totalStockholdersEquity: 500, cashAndCashEquivalents: 100, shortTermInvestments: 0, totalAssets: 2_000, ...over,
    });
    const inc = (date: string): ReturnsIncomeRow => ({ date, operatingIncome: 100, incomeBeforeTax: 100, incomeTaxExpense: 25, netIncome: 75 });
    const income = [inc("2025-12-31"), inc("2024-12-31")];
    const latest = (r: ReturnType<typeof computeRoic>) => r.series[r.series.length - 1]!;
    // Correct: capital = 300 + 500 - 100 = 700 (debt as reported, as the bridge and WACC use it).
    expect(latest(computeRoic(income, [bal("2025-12-31"), bal("2024-12-31")])).investedCapitalAvg).toBe(700);
    // Control: a proven row removes the lease (700 - 150 = 550).
    const provenRows = [bal("2025-12-31", { capitalLeaseObligations: 150 }), bal("2024-12-31", { capitalLeaseObligations: 150 })];
    expect(latest(computeRoic(income, provenRows)).investedCapitalAvg).toBe(550);
  });
});
