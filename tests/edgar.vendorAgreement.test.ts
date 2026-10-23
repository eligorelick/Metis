import { describe, expect, it } from "vitest";
import { enrichFinancialFields } from "@/edgar/financialEnrichment";
import { enrichIncomeClassification } from "@/edgar/incomeClassification";
import { sharedReportingUnit, vendorAgreesWithFiled } from "@/edgar/vendorAgreement";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpBalanceSheetRow, FmpCashFlowRow, FmpIncomeStatementRow, FmpPayload } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";

// Audit 2026-10-22 A-11: a vendor figure within one reporting unit (at most a
// million) or 0.01% of the filed figure is the same observation, not a conflict.
describe("vendor-versus-filed tolerance (audit 2026-10-22 A-11)", () => {
  it("reads the reporting unit both figures share, capped at a million", () => {
    expect(sharedReportingUnit(59_894e6, 59_893e6)).toBe(1e6);
    expect(sharedReportingUnit(5e9, 6e9)).toBe(1e6);
    expect(sharedReportingUnit(12_345_000, 12_346_000)).toBe(1_000);
    expect(sharedReportingUnit(6618, 6619)).toBe(1);
    expect(sharedReportingUnit(0.5, 0.5)).toBe(0);
    expect(sharedReportingUnit(0, 1e6)).toBe(0);
  });
  it("admits META's one-million display rounding and refuses a classification-scale gap", () => {
    expect(vendorAgreesWithFiled(59_894e6, 59_893e6)).toBe(true);
    expect(vendorAgreesWithFiled(61_000e6, 59_893e6)).toBe(false);
  });
  it("is two-sided at one reporting unit", () => {
    expect(vendorAgreesWithFiled(12_346_000, 12_345_000)).toBe(true);
    expect(vendorAgreesWithFiled(12_347_000, 12_345_000)).toBe(false);
    expect(vendorAgreesWithFiled(816, 815)).toBe(true);
    expect(vendorAgreesWithFiled(817, 815)).toBe(false);
  });
  it("is two-sided at 0.01% of the larger figure", () => {
    expect(vendorAgreesWithFiled(100_010_000_000, 100_000_000_000)).toBe(true);
    expect(vendorAgreesWithFiled(100_011_000_000, 100_000_000_000)).toBe(false);
  });
  it("allows a whole reporting unit only on figures of at least 100 units", () => {
    expect(vendorAgreesWithFiled(2_000_000, 1_000_000)).toBe(false);
    expect(vendorAgreesWithFiled(99_000_000, 98_000_000)).toBe(false);
    expect(vendorAgreesWithFiled(100_000_000, 99_000_000)).toBe(true);
    expect(vendorAgreesWithFiled(5, 4)).toBe(false);
    expect(vendorAgreesWithFiled(101, 100)).toBe(true);
  });
  it("gives a zero against a nonzero figure no unit allowance", () => {
    expect(vendorAgreesWithFiled(0, 1e6)).toBe(false);
    expect(vendorAgreesWithFiled(0, 0)).toBe(true);
  });
});

const at = "2026-10-19T00:00:00Z";
function incomeFacts(revenue: number): CompanyFacts {
  const values = { Assets: 400_000e6, Revenues: revenue, CostOfRevenue: 10_906e6, GrossProfit: revenue - 10_906e6 };
  return { cik: 1326801, entityName: "Example", facts: { "us-gaap": Object.fromEntries(Object.entries(values).map(([tag, val]) => [tag, { units: { USD: [
    { start: tag === "Assets" ? undefined : "2025-10-01", end: "2025-12-31", val, accn: "0001326801-26-000010", filed: "2026-01-29", form: "10-K", fy: 2025, fp: "FY", frame: tag === "Assets" ? undefined : "CY2025Q4" },
  ] } }])) } };
}
function incomeInput(revenue: number, grossProfit: number): FetchResult<FmpPayload<FmpIncomeStatementRow>> {
  const rows = [{ cik: "1326801", date: "2025-12-31", periodStart: "2025-10-01", reportedCurrency: "USD", revenue, costOfRevenue: 10_906e6, grossProfit }];
  return { ok: true, value: { data: { rows, raw: structuredClone(rows) }, asOf: "2025-12-31", source: "fmp", endpoint: "fixture", fetchedAt: at } };
}

describe("income classification at display precision (audit 2026-10-22 A-11)", () => {
  it("keeps a vendor quarter one display unit from the filed figure", () => {
    const out = enrichIncomeClassification(incomeInput(59_894e6, 48_988e6), incomeFacts(59_893e6), "quarter", at);
    const row = out.income.ok ? out.income.value.data.rows[0]! : null;
    expect(row).toMatchObject({ revenue: 59_894e6, grossProfit: 48_988e6 });
    expect(row?.fieldConflicts?.revenue).toBeUndefined();
    expect(row?.fieldProvenance?.revenue?.tags).toContain("us-gaap/Revenues");
    expect(out.gaps.filter((gap) => /classification conflict/.test(gap.reason))).toEqual([]);
  });
  it("still refuses a classification-scale difference", () => {
    const out = enrichIncomeClassification(incomeInput(61_000e6, 50_094e6), incomeFacts(59_893e6), "quarter", at);
    const row = out.income.ok ? out.income.value.data.rows[0]! : null;
    expect(row?.revenue).toBeNull();
    expect(row?.fieldConflicts?.revenue).toMatchObject({ usable: false, vendorValue: 61_000e6, secValue: 59_893e6 });
  });
});

const observedAt = "2026-10-13T12:00:00.000Z";
const point = (val: number) => ({ end: "2026-06-30", val, accn: "0000000001-26-000002", filed: "2026-07-30", form: "10-Q", fy: 2026, fp: "Q2" });
function sourced<T extends FmpBalanceSheetRow | FmpCashFlowRow>(rows: T[]): FetchResult<FmpPayload<T>> {
  return { ok: true, value: { data: { rows, raw: rows }, source: "fmp", asOf: "2026-06-30", endpoint: "fmp:statements", fetchedAt: observedAt } };
}
const balanceFacts = (): CompanyFacts => ({ cik: 1, entityName: "Example", facts: { "us-gaap": {
  OperatingLeaseLiability: { units: { USD: [point(13_201e6)] } },
  CashAndCashEquivalentsAtCarryingValue: { units: { USD: [point(24_811e6)] } },
} } });

describe("SEC field enrichment at display precision (audit 2026-10-22 A-11)", () => {
  it.each([
    ["operatingLeaseLiability", 13_202e6, 13_201e6],
    ["cashAndCashEquivalents", 24_812e6, 24_811e6],
  ])("keeps a vendor %s one display unit from the filed figure", (field, vendor, filed) => {
    const out = enrichFinancialFields(sourced([{ date: "2026-06-30", reportedCurrency: "USD", [field]: vendor }]), sourced<FmpCashFlowRow>([]), balanceFacts(), "quarter", observedAt);
    const row = out.balance.ok ? out.balance.value.data.rows[0]! : null;
    expect(row?.[field]).toBe(vendor);
    expect(row?.fieldConflicts?.[field]).toBeUndefined();
    expect(out.gaps.filter((gap) => /conflict/.test(gap.reason))).toEqual([]);
    expect(filed).not.toBe(vendor);
  });
  it.each([
    ["operatingLeaseLiability", 13_204e6, 13_201e6],
    ["cashAndCashEquivalents", 24_814e6, 24_811e6],
  ])("still refuses a vendor %s beyond the tolerance", (field, vendor, filed) => {
    const out = enrichFinancialFields(sourced([{ date: "2026-06-30", reportedCurrency: "USD", [field]: vendor }]), sourced<FmpCashFlowRow>([]), balanceFacts(), "quarter", observedAt);
    const row = out.balance.ok ? out.balance.value.data.rows[0]! : null;
    expect(row?.fieldConflicts?.[field]).toMatchObject({ usable: false, vendorValue: vendor, secValue: filed });
  });
});
