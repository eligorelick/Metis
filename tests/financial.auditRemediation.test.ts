import { describe, expect, it } from "vitest";
import { admitStockCompensation, admitBalanceCash } from "@/edgar/financialEnrichment";
import type { FmpStatementRow } from "@/providers/fmp";
import type { CompanyFacts } from "@/edgar/xbrl";
import { normalizeQuarterRows } from "@/pipeline/stageB/quarterWindows";
import { terminalRoic } from "@/pipeline/stageB/valuation";

const points = [
  { start: "2025-01-01", end: "2025-09-30", val: 300, filed: "2025-11-01", form: "10-Q", accn: "0000000001-25-000003", fy: 2025, fp: "Q3" },
  { start: "2025-01-01", end: "2025-12-31", val: 420, filed: "2026-02-01", form: "10-K", accn: "0000000001-26-000001", fy: 2025, fp: "FY" },
];
const facts = { cik: 1, entityName: "Synthetic", facts: { "us-gaap": { ShareBasedCompensation: { units: { USD: points } } } } } as CompanyFacts;
const row: FmpStatementRow = { cik: "1", date: "2025-12-31", period: "Q4", reportedCurrency: "USD", filingDate: "2026-02-01", stockBasedCompensation: -7 };

describe("financial audit integrity", () => {
  it("uses compatible annual less nine-month SBC and retains the vendor conflict on replay", () => {
    const result = admitStockCompensation(row, facts, "quarter", "2026-11-01");
    expect(result.row.stockBasedCompensation).toBe(120);
    expect(result.row.fieldConflicts?.stockBasedCompensation).toMatchObject({ usable: true, vendorValue: -7, secValue: 120, resolution: "filed-family" });
    expect(result.row.fieldProvenance?.stockBasedCompensation?.derivation).toBe("ytd-difference");
    expect(admitStockCompensation(result.row, facts, "quarter", "2026-11-01").row).toEqual(result.row);
  });
  it.each([{ cik: "2" }, { reportedCurrency: "EUR" }, { periodStart: "2025-09-01" }, { filingDate: "2026-03-01" }])("does not admit incompatible SBC %j", changes => {
    expect(admitStockCompensation<FmpStatementRow>({ ...row, ...changes }, facts, "quarter", "2026-11-01").row.stockBasedCompensation).toBe(-7);
  });
  it("collapses a six-day annual alias before duration inference", () => {
    const vendor = { date: "2025-09-30", cik: "1", reportedCurrency: "USD", fiscalYear: "2025", period: "FY", filingDate: "2025-11-01", acceptedDate: "2025-11-01 10:00:00" };
    const filed = { ...vendor, date: "2025-09-24", periodStart: "2024-09-25", acceptedDate: "2025-11-01 11:00:00" };
    expect(normalizeQuarterRows([vendor, filed]).rows).toEqual([filed]);
    expect(normalizeQuarterRows([{ ...vendor, period: "Q4" }, { ...filed, period: "Q4" }]).rows).toHaveLength(2);
  });
  it("describes nonconsecutive return observations without claiming consecutive years", () => {
    const result = terminalRoic(10, [2022, 2023, 2024, 2026].map(year => ({ date: `${year}-12-31`, roicPct: 25 })));
    expect(result.basis).toContain("4 observed fiscal years");
    expect(result.basis).toContain("2025");
    expect(result.basis).not.toContain("each of the last 4");
  });
});


describe("cash scope replay", () => {
  const cash = "CashAndCashEquivalentsAtCarryingValue";
  const combined = "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents";
  const point = { end: "2025-12-31", filed: "2026-02-01", form: "10-K", accn: "0000000001-26-000001", val: 500 };
  const later = { ...point, filed: "2026-05-01", form: "10-Q", accn: "0000000001-26-000002" };
  const makeFacts = (unrestricted = 500): CompanyFacts => ({ cik: 1, entityName: "Synthetic", facts: { "us-gaap": {
    [cash]: { units: { USD: [point, { ...later, val: unrestricted }] } },
    [combined]: { units: { USD: [{ ...later, val: 700 }] } },
  } } } as CompanyFacts);
  const evidence = { source: "edgar" as const, unit: "USD", periodStart: null, periodEnd: point.end, observedAt: "2026-06-01", tags: [`us-gaap/${cash}`], filings: [point] };
  const refused: FmpStatementRow = { cik: "1", date: point.end, filingDate: point.filed, reportedCurrency: "USD", cashAndCashEquivalents: null,
    fieldConflicts: { cashAndCashEquivalents: { usable: false, vendorValue: 700, secValue: 500, secEvidence: evidence,
      reason: "vendor/SEC cashAndCashEquivalents conflict: exact instant" } } };
  it("uses a later same-source definition bridge only when unrestricted cash is unchanged", () => {
    const admitted = admitBalanceCash(refused, makeFacts(), "annual", "2026-06-01").row;
    expect(admitted.cashAndCashEquivalents).toBe(500);
    expect(admitted.fieldConflicts?.cashAndCashEquivalents).toMatchObject({ usable: true, vendorValue: 700, secValue: 500 });
    expect(admitted.netDebt).toBeNull();
    expect(admitted.cashAndShortTermInvestments).toBeNull();
  });
  it("does not combine a changed comparative balance with the earlier filing", () => {
    expect(admitBalanceCash(refused, makeFacts(550), "annual", "2026-06-01").row.cashAndCashEquivalents).toBeNull();
  });
});
