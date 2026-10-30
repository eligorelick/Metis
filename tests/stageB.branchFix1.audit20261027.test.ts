/**
 * B4a whole-branch review, fix round 1 (PR #76). The merge rule: no report that
 * main publishes may become "Blocked", and no figure may be worse than main.
 *
 *   I-1  lease-emptied capital withholds the DCF at warn, not critical
 *   I-2  the statement-date bridge row is refused by every refusal the DCF reads on it
 *   M-1  a refused temporary-equity operand does not mask the lease critical
 *   M-7  a null book NCI beside a redeemable NCI takes the floor on the redeemable NCI alone
 *   M-8  the rate-regulated utility note does not assert rate recovery as a fact
 *   M-9  mezzanine preferred tagged twice is deducted once
 */
import { describe, expect, it } from "vitest";

import { dcfBridgeRow, runStageB } from "@/pipeline/compute";
import { computeFairValue } from "@/pipeline/stageB/fairValue";
import { LEASE_EMPTIED_CAPITAL_LEAD } from "@/pipeline/stageB/seniorClaims";
import {
  buildDcfAssumptions,
  valueCompany,
  type DcfAssumptionInputs,
  type DcfBalanceRow,
  type MultiplesFrameworkInputs,
} from "@/pipeline/stageB/valuation";
import type { CompanyRoute } from "@/types/core";

import { completeCurrencyBundle, currencyBundle, M } from "./helpers/currencyBundle";

const route: CompanyRoute = { base: "general", overlays: [], evidence: { sector: null, industry: null } };

// ---------------------------------------------------------------------------
// I-1
// ---------------------------------------------------------------------------

const base = {
  revenueCagr3yPct: 8, revenueCagr5yPct: 8, analystEstimates: null, waccPct: 10, riskFreePct: 4, marketCap: 20e9,
  incomeTtm: { date: "2026-03-31", revenue: 1000e6, operatingIncome: 200e6, incomeBeforeTax: 180e6, incomeTaxExpense: 36e6 },
  incomeHistory: [2023, 2024, 2025].map((y) => ({ date: `${y}-12-31`, revenue: 900e6, operatingIncome: 180e6, incomeBeforeTax: 160e6, incomeTaxExpense: 32e6 })),
};
// Total debt 300M holds a covered operating lease of 250M; equity -100M; cash 50M: 150M lease-inclusive, -100M without the lease.
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

describe("I-1: lease-emptied capital withholds the DCF at warn", () => {
  const gapOf = (balance: DcfBalanceRow) => {
    const built = buildDcfAssumptions({ ...base, balance, capitalHistory: [2024, 2025].map(historyRow) } as DcfAssumptionInputs);
    return { built, gap: built.gaps.find((g) => g.field === "valuation.dcf.salesToCapital") };
  };

  it("the I6 case withholds the DCF with a warn gap that starts with the exported lead", () => {
    const { built, gap } = gapOf(emptied());
    expect(built.assumptions).toBeNull();
    expect(gap?.severity).toBe("warn");
    expect(gap?.reason.startsWith(LEASE_EMPTIED_CAPITAL_LEAD)).toBe(true);
    expect(gap?.reason).toMatch(/invested capital -100M/);
  });

  it("the headline fair-value reason and the scenario targets name the cause", () => {
    const multiples: MultiplesFrameworkInputs = {
      quote: { price: 100, marketCap: 10e9, currency: "USD" }, reportedCurrency: "USD",
      incomeTtm: { date: "2026-03-31", revenue: 1000e6, operatingIncome: 200e6, depreciationAndAmortization: 50e6, netIncome: 144e6, epsDiluted: 1.44 },
      cashFlowTtm: { date: "2026-03-31", operatingCashFlow: 180e6, capitalExpenditure: -30e6, depreciationAndAmortization: 50e6 },
      balance: { date: "2026-03-31", totalDebt: 300e6, cashAndShortTermInvestments: 50e6, totalStockholdersEquity: -100e6, goodwill: 0, intangibleAssets: 0, minorityInterest: 0, preferredStock: 0 },
    };
    const valuation = valueCompany(route, {
      currentPrice: 100, waccPct: 10, netDebt: 250e6, dilutedShares: 100e6, multiples, excessReturn: null, reit: null,
      dcfInputs: { ...base, balance: emptied(), capitalHistory: [2024, 2025].map(historyRow), marketCap: 10e9 } as DcfAssumptionInputs,
    });
    const fair = computeFairValue({ valuation, currentPrice: 100, currency: "USD", asOf: "2026-07-01" });
    expect(fair.status).toBe("suppressed");
    expect(fair.reasons[0]!.reason.startsWith(LEASE_EMPTIED_CAPITAL_LEAD)).toBe(true);
  });

  it("control: main's own ic <= 0 case, with no lease removed, keeps main's critical gap", () => {
    const { built, gap } = gapOf(emptied({ totalDebt: 50e6, operatingLeaseLiability: null, capitalLeaseObligations: null }));
    expect(built.assumptions).toBeNull();
    expect(gap?.severity).toBe("critical");
    expect(gap?.reason).toMatch(/^invested capital <= 0/);
  });
});

// ---------------------------------------------------------------------------
// I-2 and M-1
// ---------------------------------------------------------------------------

const row = (date: string, extra: Record<string, unknown> = {}) =>
  ({ date, totalDebt: 300e6, totalStockholdersEquity: 500e6, cashAndShortTermInvestments: 100e6, ...extra });
// An operating lease above total debt: the lease and debt inputs do not reconcile (leaseDebtConflict).
const LEASE_CONFLICT = { operatingLeaseLiability: 400e6, capitalLeaseObligations: 400e6 };
// An operating lease with its noncurrent portion only: the scope is unproven (leaseDebtScopeRefusal).
const LEASE_SCOPE = {
  shortTermDebt: 50e6, longTermDebt: 200e6, operatingLeaseLiability: 50e6,
  fieldProvenance: { operatingLeaseLiability: { tags: ["us-gaap/OperatingLeaseLiabilityNoncurrent"] } },
};
const TEMP_REFUSED = { temporaryEquity: 5e6, fieldConflicts: { temporaryEquity: { usable: false, reason: "two filings disagree" } } };

describe("I-2: the statement-date row is refused by the lease and temporary-equity refusals too", () => {
  const anchor = row("2026-03-31", { cashAndShortTermInvestments: 120e6 });
  const cases: Array<[string, Record<string, unknown>]> = [
    ["a lease conflict", LEASE_CONFLICT],
    ["a lease-scope refusal", LEASE_SCOPE],
    ["a refused temporary-equity operand", TEMP_REFUSED],
  ];

  for (const [label, defect] of cases) {
    it(`a statement-date row with ${label} keeps the clean anchor`, () => {
      const fiscal = row("2025-12-31", defect);
      const out = dcfBridgeRow("2025-12-31", "annual", [anchor], [fiscal], { row: anchor, basis: "quarter" }, false);
      expect(out).toMatchObject({ row: anchor, basis: "quarter", cause: "statement-row-refused", matchesStatement: false });
      expect(out.detail).toEqual(expect.any(String));
    });

    it(`a refused anchor (${label}) beside a clean statement-date row is not cured`, () => {
      const refusedAnchor = row("2026-03-31", defect);
      const clean = row("2025-12-31");
      const out = dcfBridgeRow("2025-12-31", "annual", [refusedAnchor], [clean], { row: refusedAnchor, basis: "quarter" }, false);
      expect(out).toMatchObject({ row: refusedAnchor, cause: "anchor-refused" });
    });
  }

  it("the lease-scope test reads the run's own switch; a proven scope and a clean row pass (control)", () => {
    const fiscal = row("2025-12-31", LEASE_SCOPE);
    // With the switch set a partial operating coverage is refused outright, as on the default.
    expect(dcfBridgeRow("2025-12-31", "annual", [anchor], [fiscal], { row: anchor, basis: "quarter" }, true)).toMatchObject({ cause: "statement-row-refused" });
    const clean = row("2025-12-31");
    expect(dcfBridgeRow("2025-12-31", "annual", [anchor], [clean], { row: anchor, basis: "quarter" }, false)).toMatchObject({ row: clean, cause: "statement-row" });
  });

  describe("runStageB: a fiscal-year-base run keeps the clean anchor and publishes, as main", () => {
    const OPTIONS = { debt: 300, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] } as const;

    /** The fiscal-year 10-K row is the only statement-date balance, and the DCF falls back to the fiscal year. */
    function fiscalYearBase(defect: Record<string, unknown>) {
      const bundle = currencyBundle(OPTIONS);
      const income = bundle.statements.incomeQuarterly;
      if (income.ok) income.value.data.rows = income.value.data.rows.filter((r) => r.date !== "2025-09-30");
      const quarters = bundle.statements.balanceQuarterly;
      if (quarters.ok) quarters.value.data.rows = quarters.value.data.rows.filter((r) => r.date !== "2025-12-31");
      const annual = bundle.statements.balanceAnnual;
      if (annual.ok) Object.assign(annual.value.data.rows[0]!, defect);
      return bundle;
    }

    const control = runStageB(fiscalYearBase({})).valuation;

    // The lease cases are covered at the row-choice level above: the WACC debt leg reads the same fiscal-year pair and
    // refuses such a row on main too, so only a refused temporary-equity operand isolates the bridge row end to end.
    for (const [label, defect] of cases.filter(([name]) => /temporary/.test(name))) {
      it(`with ${label} on the 10-K row`, () => {
        const v = runStageB(fiscalYearBase(defect)).valuation;
        if (control.kind !== "dcf" || control.dcf === null) throw new Error("the control must publish a DCF");
        if (v.kind !== "dcf") throw new Error("expected the DCF route");
        expect(v.gaps.filter((g) => g.severity === "critical" && g.field.startsWith("valuation.dcf"))).toEqual([]);
        expect(v.dcf).not.toBeNull();
        // The anchor is the 2026-03-31 quarter: debt 300, cash 120.
        expect(v.dcf!.bridge.netDebt).toBe(180 * M);
        expect(v.gaps.find((g) => g.field === "valuation.dcf.bridgeBalanceDate")?.reason).toMatch(/withheld/);
      });
    }
  });
});

describe("M-1: a refused temporary-equity operand does not mask the lease critical", () => {
  const input = (balance: Partial<DcfBalanceRow> & Record<string, unknown>, extra: Partial<DcfAssumptionInputs> = {}) =>
    buildDcfAssumptions({
      ...base,
      balance: { date: "2026-03-31", basis: "quarter", totalDebt: 300e6, totalStockholdersEquity: 500e6, cashAndShortTermInvestments: 100e6, ...balance } as DcfBalanceRow,
      ...extra,
    } as DcfAssumptionInputs);

  it("a row with a lease conflict and a refused operand raises the critical lease gap beside the warn", () => {
    const built = input({ ...LEASE_CONFLICT, ...TEMP_REFUSED });
    expect(built.assumptions).toBeNull();
    expect(built.gaps).toContainEqual(expect.objectContaining({ field: "valuation.dcf.leaseIntegrity", severity: "critical" }));
    expect(built.gaps.some((g) => g.field === "valuation.dcf.salesToCapital" && g.severity === "warn")).toBe(true);
  });

  it("a row with a lease-scope refusal and a refused operand raises the critical scope gap", () => {
    const built = input({ ...LEASE_SCOPE, ...TEMP_REFUSED }, { includeLeasesInEv: true });
    expect(built.assumptions).toBeNull();
    expect(built.gaps.some((g) => g.severity === "critical" && /lease/i.test(g.reason))).toBe(true);
  });

  it("control: a row with only a refused operand keeps the warn and raises no critical", () => {
    const built = input({ ...TEMP_REFUSED });
    expect(built.assumptions).toBeNull();
    expect(built.gaps.filter((g) => g.severity === "critical")).toEqual([]);
    expect(built.gaps.some((g) => g.field === "valuation.dcf.salesToCapital" && g.severity === "warn")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// M-7
// ---------------------------------------------------------------------------

function nciRun(opts: { redeemableNci?: number; nciIncome?: number | null }) {
  const bundle = completeCurrencyBundle({ debt: 300, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  for (const key of ["balanceAnnual", "balanceQuarterly"] as const) {
    const statement = bundle.statements[key];
    if (!statement.ok) throw new Error("fixture has balances");
    for (const r of statement.value.data.rows) {
      const fields = r as Record<string, unknown>;
      fields.minorityInterest = null;
      if (opts.redeemableNci !== undefined) fields.temporaryEquityAttributableToNoncontrollingInterest = opts.redeemableNci;
    }
  }
  for (const key of ["incomeAnnual", "incomeQuarterly"] as const) {
    const statement = bundle.statements[key];
    if (!statement.ok) throw new Error("fixture has income");
    for (const r of statement.value.data.rows) {
      const income = r as { netIncomeAttributableToNoncontrollingInterest?: number | null };
      if (opts.nciIncome === null) delete income.netIncomeAttributableToNoncontrollingInterest;
      else if (opts.nciIncome !== undefined) income.netIncomeAttributableToNoncontrollingInterest = opts.nciIncome;
    }
  }
  return runStageB(bundle);
}
const cashOwnershipGap = (out: ReturnType<typeof runStageB>) => out.gaps.some((gap) => gap.field === "valuation.multiples.priceToFcf.cashOwnership");

describe("M-7: a null book NCI beside a redeemable NCI", () => {
  // The fixture's consolidated equity is about 503M, so the 1% floor is about 5M.
  it("publishes P/FCF when the redeemable NCI and the NCI income are under the floor", () => {
    expect(cashOwnershipGap(nciRun({ redeemableNci: 1 * M, nciIncome: 100_000 }))).toBe(false);
  });
  it("withholds P/FCF over the floor, or with an unknown NCI income", () => {
    expect(cashOwnershipGap(nciRun({ redeemableNci: 30 * M, nciIncome: 100_000 }))).toBe(true);
    expect(cashOwnershipGap(nciRun({ redeemableNci: 1 * M, nciIncome: null }))).toBe(true);
    expect(cashOwnershipGap(nciRun({ redeemableNci: 1 * M, nciIncome: 40 * M }))).toBe(true);
  });
  it("control: a null book NCI with no redeemable NCI behaves as main", () => {
    expect(cashOwnershipGap(nciRun({ nciIncome: 100_000 }))).toBe(nciRun({ redeemableNci: 0, nciIncome: 100_000 }).gaps.some((g) => g.field === "valuation.multiples.priceToFcf.cashOwnership"));
  });
});

// ---------------------------------------------------------------------------
// M-9
// ---------------------------------------------------------------------------

function preferredRun(preferred: number, parent: number) {
  const bundle = completeCurrencyBundle({ debt: 300, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  for (const key of ["balanceAnnual", "balanceQuarterly"] as const) {
    const statement = bundle.statements[key];
    if (!statement.ok) throw new Error("fixture has balances");
    for (const r of statement.value.data.rows) {
      const fields = r as Record<string, unknown>;
      fields.preferredStock = preferred;
      fields.temporaryEquityAttributableToParent = parent;
    }
  }
  return runStageB(bundle);
}

describe("M-9: mezzanine preferred tagged twice is deducted once", () => {
  const claimsOf = (out: ReturnType<typeof runStageB>) => {
    const v = out.valuation;
    if (v.kind !== "dcf" || v.dcf === null) throw new Error("expected a DCF");
    const bridge = v.dcf.bridge;
    // `valueCompany` folds the redeemable preferred into the bridge's preferred line, so that line is the whole deduction.
    return { preferred: bridge.preferred ?? 0, ev: v.multiples!.enterpriseValue.value };
  };

  it("an equal pair is deducted once in the bridge and in the multiples EV, and an info note names both tags", () => {
    const pair = preferredRun(100 * M, 100 * M);
    const only = preferredRun(0, 100 * M);
    const claims = claimsOf(pair);
    expect(claims.preferred).toBe(100 * M);
    expect(claims.ev).toBe(claimsOf(only).ev);
    const note = pair.gaps.find((g) => g.field === "valuation.preferredOverlap");
    expect(note?.severity).toBe("info");
    expect(note?.reason).toMatch(/PreferredStockValue/);
    expect(note?.reason).toMatch(/TemporaryEquityCarryingAmountAttributableToParent/);
    expect(only.gaps.some((g) => g.field === "valuation.preferredOverlap")).toBe(false);
  });

  it("an unequal pair is deducted in full (B4b's overlap territory)", () => {
    const pair = preferredRun(100 * M, 60 * M);
    const claims = claimsOf(pair);
    expect(claims.preferred).toBe(160 * M);
    expect(claims.ev).toBe(claimsOf(preferredRun(0, 60 * M)).ev! + 100 * M);
    expect(pair.gaps.some((g) => g.field === "valuation.preferredOverlap")).toBe(false);
  });
});
