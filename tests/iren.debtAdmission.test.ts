import { describe, expect, it } from "vitest";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import { admitDebtFields } from "@/edgar/financialEnrichment";
import type { CompanyFacts } from "@/edgar/xbrl";

const instant = (val: number, end = "2026-03-31") => ({ end, val, accn: "0001878848-26-000026", filed: "2026-05-08", form: "10-Q", fy: 2026, fp: "Q3" });
function facts(extra: Record<string, unknown> = {}): CompanyFacts {
  return { cik: 1878848, entityName: "IREN", facts: { "us-gaap": {
    Assets: { units: { USD: [instant(6_000_000_000)] } },
    CashAndCashEquivalentsAtCarryingValue: { units: { USD: [instant(2_213_274_000)] } },
    OperatingLeaseLiability: { units: { USD: [instant(2_825_000)] } },
    FinanceLeaseLiability: { units: { USD: [instant(274_256_000)] } },
    ConvertibleLongTermNotesPayable: { units: { USD: [instant(3_687_832_000)] } }, ...extra,
  } } };
}
describe("convertible carrying debt completeness", () => {
  // Audit 2026-10-19 SNOW-10: the convertible carrying tag is now read as
  // financing debt, so the total is complete rather than withheld.
  it("does not publish a lease-only March debt total when noncurrent convertible carrying debt is available", () => {
    const out = buildStatementsFromCompanyFacts(facts(), { symbol: "IREN", cik: "0001878848", asOf: "2026-10-19", annualPeriods: 1, quarterlyPeriods: 4, vendorSplits: { status: "retrieved", source: "fixture", events: [], coverage: [{ from: "2020-01-01", to: "2026-10-19" }] } });
    const row = out.balanceQuarterly.rows.find(r => r.date === "2026-03-31");
    expect(row).toMatchObject({ longTermDebt: 3_687_832_000, totalDebt: 3_964_913_000, netDebt: 1_751_639_000 });
    expect(row?.fieldConflicts?.totalDebt).toBeUndefined();
  });
  it("invalidates non-null partial vendor debt and net debt without substituting principal or adding twice", () => {
    const row = { date: "2026-03-31", totalDebt: 277_081_000, netDebt: -1_936_193_000, financeLeaseLiability: 274_256_000, operatingLeaseLiability: 2_825_000 };
    const out = admitDebtFields(row, facts(), "USD", "2026-10-19T00:00:00Z");
    expect(out.row).toMatchObject({ totalDebt: null, netDebt: null });
    expect(row.totalDebt).toBe(277_081_000);
  });
  it("preserves a sufficient generic noncurrent carrying aggregate without adding its convertible subtype", () => {
    const row = { date: "2026-03-31", longTermDebt: 3_687_832_000, totalDebt: 3_964_913_000, netDebt: 1_751_639_000 };
    expect(admitDebtFields(row, facts(), "USD", "2026-10-19T00:00:00Z").row).toMatchObject(row);
  });
  it("covers the convertible subtype within the vendor's display rounding (audit 2026-10-22 A-11)", () => {
    const row = { date: "2026-03-31", longTermDebt: 3_687_700_000, totalDebt: 3_964_781_000, netDebt: 1_751_507_000 };
    const out = admitDebtFields(row, facts(), "USD", "2026-10-19T00:00:00Z");
    expect(out.row).toMatchObject(row);
    expect(out.gaps.some(gap => /convertible/.test(gap.reason))).toBe(false);
  });
  it("does not apply a March comparison to the valid June debt", () => {
    const row = { date: "2026-06-30", totalDebt: 7_839_526_000 };
    expect(admitDebtFields(row, facts(), "USD", "2026-10-19T00:00:00Z").row).toEqual(row);
  });
});
