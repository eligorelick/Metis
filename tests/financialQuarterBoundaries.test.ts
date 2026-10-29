import { describe, expect, it } from "vitest";
import { enrichFinancialFields } from "@/edgar/financialEnrichment";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpBalanceSheetRow, FmpCashFlowRow, FmpPayload } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";

const observedAt = "2026-10-19T00:00:00Z";
const end = "2026-06-30";
const dayBefore = (day: string, days: number) => new Date(Date.parse(day) - days * 86400000).toISOString().slice(0, 10);
const point = (val: number, start: string, extra = {}) => ({ val, start, end, filed: "2026-07-30", accn: "new", form: "10-Q", fy: 2026, fp: "Q2", ...extra });
function sourced<T extends FmpBalanceSheetRow | FmpCashFlowRow>(rows: T[]): FetchResult<FmpPayload<T>> {
  return { ok: true, value: { data: { rows, raw: rows }, source: "fmp", endpoint: "test", fetchedAt: observedAt, asOf: end } };
}
function admit(ps: ReturnType<typeof point>[]) {
  const facts: CompanyFacts = { cik: 1, entityName: "Example", facts: { "us-gaap": Object.fromEntries(
    ["FinanceLeasePrincipalPayments", "NetCashProvidedByUsedInOperatingActivities"].map(tag => [tag, { units: { USD: ps } }])) } };
  const out = enrichFinancialFields(sourced<FmpBalanceSheetRow>([]), sourced([{ cik: "1", date: end, reportedCurrency: "USD", operatingCashFlow: 999 }]), facts, "quarter", observedAt);
  if (!out.cashflow.ok) throw Error("retained rows expected");
  return out.cashflow.value.data.rows[0]!;
}

describe("filed quarter duration contract uses end minus actual start", () => {
  it.each([69, 70, 105, 106, 112, 119, 125, 126])("direct span %i", days => {
    const row = admit([point(20, dayBefore(end, days))]);
    const usable = days >= 70 && days <= 125;
    expect(row.financeLeasePrincipalPayments).toBe(usable ? 20 : undefined);
    expect(row.fieldConflicts?.operatingCashFlow?.secValue).toBe(usable ? 20 : undefined);
  });
  it.each([69, 70, 105, 106, 112, 119, 125, 126])("derived span %i", days => {
    const start = dayBefore(end, days);
    const row = admit([point(50, "2025-12-01"), point(30, "2025-12-01", { end: dayBefore(start, 1), filed: "2026-04-30", accn: "prior" })]);
    const usable = days >= 70 && days <= 125;
    expect(row.financeLeasePrincipalPayments).toBe(usable ? 20 : undefined);
    expect(row.fieldConflicts?.operatingCashFlow?.secValue).toBe(usable ? 20 : undefined);
    if (usable) expect(row.fieldProvenance?.financeLeasePrincipalPayments?.periodStart).toBe(start);
  });
  it("does not fall back from a negative latest principal to an older positive filing", () => {
    const row = admit([point(20, "2026-04-01", { filed: "2026-07-01", accn: "old" }), point(-5, "2026-04-01")]);
    expect(row.financeLeasePrincipalPayments).toBeUndefined();
    expect(row.fieldConflicts?.operatingCashFlow?.secValue).toBe(-5);
  });
  it.each(["direct", "ytd", "prior"])("refuses ambiguous %s principal and CFO", kind => {
    const direct = [point(20, "2026-04-01"), point(21, "2026-04-01")];
    const ytd = point(50, "2025-12-01");
    const prior = point(30, "2025-12-01", { end: "2026-03-31", filed: "2026-04-30", accn: "prior" });
    const ps = kind === "direct" ? [...direct, ytd, prior] : kind === "ytd" ? [ytd, { ...ytd, val: 51 }, prior] : [ytd, prior, { ...prior, val: 31 }];
    expect(admit(ps).financeLeasePrincipalPayments).toBeUndefined();
    expect(admit(ps).fieldConflicts?.operatingCashFlow).toBeUndefined();
  });
  it("refuses negative latest cumulative principal while preserving signed CFO", () => {
    const ps = [point(-5, "2025-12-01"), point(30, "2025-12-01", { end: "2026-03-31", filed: "2026-04-30", accn: "prior" })];
    expect(admit(ps).financeLeasePrincipalPayments).toBeUndefined();
    expect(admit(ps).fieldConflicts?.operatingCashFlow?.secValue).toBe(-35);
  });
  it("a year to date re-filed from 50 to -5 is neither netted nor replaced by the older copy", () => {
    // Re-pinned (audit 2026-10-27 FIN-511-V2, decision C-9): this fixture carried the case above with the year to
    // date also filed as 50 by an earlier filing, and the CFO compared -5 - 30 = -35. The later filing moved the year
    // to date by -110% and labels no re-presentation, so no one-basis pair is on file: no SEC value, no conflict, and
    // the principal is still never filled from the older 50.
    const ps = [point(50, "2025-12-01", { filed: "2026-07-01", accn: "old" }), point(-5, "2025-12-01"), point(30, "2025-12-01", { end: "2026-03-31", filed: "2026-04-30", accn: "prior" })];
    expect(admit(ps).financeLeasePrincipalPayments).toBeUndefined();
    expect(admit(ps).fieldConflicts?.operatingCashFlow).toBeUndefined();
  });
});
