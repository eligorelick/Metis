/**
 * Audit 2026-10-22 C-1: WACC (and with it the DCF) was withheld as "average
 * total debt missing — cannot distinguish debt-free from unknown leverage"
 * although the averaged balance pair was clean. A lease-scope refusal on the
 * newest quarter, which is not averaged, vetoed the average (AT&T: its 10-Q
 * tags only the noncurrent operating lease), and the gap named no cause.
 * Owner decision: when a lease conflict blocks the preferred pair, fall back
 * to the newest clean pair with a basis note; the critical gap names its
 * upstream cause.
 */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import type { FmpBalanceSheetRow } from "@/providers/fmp";
import { currencyBundle, M } from "./helpers/currencyBundle";

const observedAt = "2026-07-06T00:00:00.000Z";
function noncurrentLeaseOnly(row: FmpBalanceSheetRow): void {
  row.operatingLeaseLiability = 40 * M;
  row.fieldProvenance = { ...row.fieldProvenance, operatingLeaseLiability: { source: "edgar", unit: "USD", periodStart: null, periodEnd: String(row.date), observedAt, tags: ["us-gaap/OperatingLeaseLiabilityNoncurrent"], filings: [] } };
}
function quarters(bundle: ReturnType<typeof currencyBundle>): FmpBalanceSheetRow[] {
  return bundle.statements.balanceQuarterly.ok ? bundle.statements.balanceQuarterly.value.data.rows : [];
}
function annual(bundle: ReturnType<typeof currencyBundle>): FmpBalanceSheetRow[] {
  return bundle.statements.balanceAnnual.ok ? bundle.statements.balanceAnnual.value.data.rows : [];
}

describe("average debt behind a refused balance (audit 2026-10-22 C-1)", () => {
  it("keeps the clean annual average when only the newest quarter's lease scope is refused", () => {
    const bundle = currencyBundle({ balanceQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    expect(runStageB(bundle).returns.wacc.waccPct).not.toBeNull();
    noncurrentLeaseOnly(quarters(bundle)[0]!);
    const wacc = runStageB(bundle).returns.wacc;
    expect(wacc.waccPct).not.toBeNull();
    expect(wacc.debtBasis).toContain("latest two fiscal-year-end balances");
    expect(wacc.debtBasis).toContain("newest balance (2026-03-31) is not used");
    expect(wacc.debtBasis).toContain("noncurrent only");
    expect(wacc.gaps.some(g => g.field === "returns.wacc.weights" && g.severity === "critical")).toBe(false);
  });

  it("falls back from a refused quarter-end pair to the clean fiscal-year pair, saying why", () => {
    const bundle = currencyBundle({ balanceQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    const rows = quarters(bundle);
    rows.push({ ...rows[0]!, date: "2025-03-31", fieldProvenance: {} });
    noncurrentLeaseOnly(rows[0]!);
    const wacc = runStageB(bundle).returns.wacc;
    expect(wacc.waccPct).not.toBeNull();
    expect(wacc.debtBasis).toContain("latest two fiscal-year-end balances");
    expect(wacc.debtBasis).toContain("quarter-end pair (2026-03-31 and 2025-03-31) is not used");
  });

  it("names the cause in the critical gap when every pair is refused", () => {
    const bundle = currencyBundle({ balanceQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    for (const row of [...quarters(bundle), ...annual(bundle)]) noncurrentLeaseOnly(row);
    const wacc = runStageB(bundle).returns.wacc;
    expect(wacc.waccPct).toBeNull();
    const gap = wacc.gaps.find(g => g.field === "returns.wacc.weights" && g.severity === "critical");
    expect(gap?.reason).toContain("Operating lease liability is noncurrent only");
    expect(gap?.reason).toContain("2025-12-31");
  });

  it("still withholds when the newest balance's debt carrying total is refused, and says so", () => {
    const bundle = currencyBundle({ balanceQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    const newest = quarters(bundle)[0]!;
    newest.fieldConflicts = { totalDebt: { vendorValue: 300 * M, secValue: null, usable: false, reason: "incomplete debt carrying value: fixture" } };
    const wacc = runStageB(bundle).returns.wacc;
    expect(wacc.waccPct).toBeNull();
    expect(wacc.gaps.find(g => g.field === "returns.wacc.weights" && g.severity === "critical")?.reason).toContain("incomplete debt carrying value: fixture");
  });
});
