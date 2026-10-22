import { describe, expect, it } from "vitest";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import { admitDebtFields } from "@/edgar/financialEnrichment";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpBalanceSheetRow } from "@/providers/fmp";
import frozen from "./fixtures/crwv-debt-facts.json";

const observedAt = "2026-10-16T09:33:42.064Z";
const end = "2026-06-30";
const M = 1e6;
function withDebt(tag: "LongTermDebt" | "LongTermDebtNoncurrent", current?: number) {
  const facts = structuredClone(frozen.facts) as CompanyFacts;
  const point = { end, val: 20_000 * M, accn: "0001769628-26-000366", filed: "2026-08-12", form: "10-Q", fy: 2026, fp: "Q2" };
  facts.facts["us-gaap"]![tag] = { units: { USD: [point] } };
  if (current !== undefined) facts.facts["us-gaap"]!.LongTermDebtCurrent = { units: { USD: [{ ...point, val: current }] } };
  const built = buildStatementsFromCompanyFacts(facts, { symbol: "CRWV", cik: "0001769628", asOf: frozen.asOf, factsObservedAt: observedAt,
    annualPeriods: 2, quarterlyPeriods: 4, vendorSplits: { status: "retrieved", source: "test:vendor", events: [], coverage: [{ from: "2020-01-01", to: frozen.asOf }] } });
  return { built, row: built.balanceQuarterly.rows.find((entry) => entry.date === end)! };
}

describe("review: rejected debt operands never establish another carrying component", () => {
  it("withholds inclusive long-term debt when the only current allocation is the rejected fiscal maturity bucket", () => {
    const { built, row } = withDebt("LongTermDebt");
    expect(row.shortTermDebt).toBeNull();
    expect(row.longTermDebt).toBeNull(); // Previously20B - rejected6.184B =13.816B.
    // The inclusive total never depended on the split (audit 2026-10-22 B-40).
    expect(row.totalDebt).toBe(20_000 * M + (row.capitalLeaseObligations ?? 0));
    expect(row.fieldConflicts?.longTermDebt).toMatchObject({ usable: false, reason: expect.stringMatching(/current.*carrying|carrying.*current/i) });
    expect(built.balanceQuarterly.withheld).toContainEqual(expect.objectContaining({ field: "longTermDebt", periods: [end] }));
  });

  it("preserves explicit noncurrent debt despite an unrelated rejected current schedule allocation", () => {
    const { row } = withDebt("LongTermDebtNoncurrent");
    expect(row.shortTermDebt).toBeNull();
    expect(row.longTermDebt).toBe(20_000 * M);
    expect(row.fieldConflicts?.longTermDebt).toBeUndefined();
    expect(row.totalDebt).toBeNull();
  });

  it("preserves the established current-carrying subtraction when the proper current tag exists", () => {
    const { row } = withDebt("LongTermDebt", 7513 * M);
    expect(row.shortTermDebt).toBe(7513 * M);
    expect(row.longTermDebt).toBe(12_487 * M);
    expect(row.fieldConflicts?.longTermDebt).toBeUndefined();
    expect(row.totalDebt).not.toBeNull();
  });

  it.each(["shortTermDebt", "longTermDebt", "financeLeaseLiability", "capitalLeaseObligations", "operatingLeaseLiability"])("propagates unusable %s rather than proving completeness from rejected values", (field) => {
    const row: FmpBalanceSheetRow = { date: end, reportedCurrency: "USD", shortTermDebt: 6184 * M,
      financeLeaseLiability: 40_000 * M, capitalLeaseObligations: 40_000 * M, operatingLeaseLiability: 0,
      totalDebt: 46_184 * M, netDebt: 40_660 * M,
      fieldConflicts: { [field]: { vendorValue: field === "financeLeaseLiability" ? 40_000 * M : 1, secValue: 221 * M,
        usable: false, reason: `rejected ${field} observation` } } };
    const raw = JSON.stringify(row);
    const admitted = admitDebtFields(row, frozen.facts as CompanyFacts, "USD", observedAt);
    expect(admitted.row.totalDebt).toBeNull();
    expect(admitted.row.netDebt).toBeNull();
    expect(admitted.row.fieldConflicts?.totalDebt).toMatchObject({ usable: false, vendorValue: 46_184 * M, reason: expect.stringContaining(field) });
    expect(admitted.gaps).toContainEqual(expect.objectContaining({ field: `statements.balance.${end}.totalDebt`, severity: "warn" }));
    expect(JSON.stringify(row)).toBe(raw);
    expect(admitted.row.financeLeaseLiability).toBe(40_000 * M);
  });

  it("retains complete carrying debt including a legitimate zero and an unconflicted financing lease", () => {
    const row: FmpBalanceSheetRow = { date: end, shortTermDebt: 0, longTermDebt: 35_068 * M, financeLeaseLiability: 221 * M,
      totalDebt: 35_289 * M, netDebt: 29_765 * M };
    expect(admitDebtFields(row, frozen.facts as CompanyFacts, "USD", observedAt).row).toBe(row);
  });
});
