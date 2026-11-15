/**
 * D-300 review round 1 (P8, P12): a tax rate's operands that AGREE with the
 * reconciled filed earnings family are checked against a filing, as interest
 * expense is (D-282). Before this, only an adopted (disputed) family recorded
 * proof, so a vendor provision and pre-tax income equal to the filed facts
 * printed "Tax rate operands: vendor data, not checked against a filing".
 * The admission now records the filed proof beside the row; no value moves.
 * Amounts are fixture figures in the shape of Qualcomm's and Amazon's filings
 * (D-237); the accessions are fixture labels.
 */
import { describe, expect, it } from "vitest";

import { enrichIncomeClassification } from "@/edgar/incomeClassification";
import type { CompanyFacts } from "@/edgar/xbrl";
import { filedTaxOperands } from "@/pipeline/compute";
import type { FmpIncomeStatementRow, FmpPayload } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";

const at = "2026-10-29T00:00:00Z";
const M = 1_000_000;
const PRETAX_BEFORE_EQUITY = "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments";
const PRETAX_TOTAL = "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest";

interface Period { start: string; end: string; filed: string; form: "10-K" | "10-Q"; accn: string; fp: string }
const QUARTER: Period = { start: "2026-03-30", end: "2026-06-28", filed: "2026-07-29", form: "10-Q", accn: "fixture-10-q", fp: "Q3" };
const YEAR: Period = { start: "2025-01-01", end: "2025-12-31", filed: "2026-02-06", form: "10-K", accn: "fixture-10-k", fp: "FY" };

function facts(period: Period, millions: Record<string, number>): CompanyFacts {
  const point = (tag: string, val: number) => ({ ...(tag === "Assets" ? {} : { start: period.start }), end: period.end, val: val * M,
    accn: period.accn, filed: period.filed, form: period.form, fy: Number(period.end.slice(0, 4)), fp: period.fp });
  return { cik: 1, entityName: "Fixture", facts: { "us-gaap": Object.fromEntries(Object.entries({ Assets: 1, Revenues: 100_000, ...millions })
    .map(([tag, val]) => [tag, { units: { USD: [point(tag, val)] } }])) } };
}

function admit(period: Period, vendor: Record<string, number>, source: CompanyFacts, extra: Partial<FmpIncomeStatementRow> = {}) {
  const scaled = Object.fromEntries(Object.entries(vendor).map(([key, value]) => [key, value * M]));
  const rows = [{ cik: "1", date: period.end, periodStart: period.start, filingDate: period.filed, reportedCurrency: "USD", revenue: 100_000 * M, ...scaled, ...extra } as FmpIncomeStatementRow];
  const original: FetchResult<FmpPayload<FmpIncomeStatementRow>> = { ok: true, value: { data: { rows, raw: structuredClone(rows) }, asOf: period.end, source: "fmp", endpoint: "fixture", fetchedAt: at } };
  const result = enrichIncomeClassification(original, source, period.form === "10-K" ? "annual" : "quarter", at, { earningsOnly: true });
  if (!result.income.ok) throw new Error("income expected");
  return result.income.value.data.rows[0]!;
}

const FILED_QUARTER = { [PRETAX_TOTAL]: 2_462, IncomeTaxExpenseBenefit: 460, NetIncomeLoss: 2_002 };

describe("D-300: agreeing tax-rate operands carry the filed proof", () => {
  it("a provider provision and pre-tax income equal to the reconciled filed family record both proofs; no value moves", () => {
    const row = admit(QUARTER, { incomeBeforeTax: 2_462, incomeTaxExpense: 460, netIncome: 2_002 }, facts(QUARTER, FILED_QUARTER));
    expect(row).toMatchObject({ incomeBeforeTax: 2_462 * M, incomeTaxExpense: 460 * M, netIncome: 2_002 * M });
    expect(row.fieldProvenance?.incomeTaxExpense).toBeUndefined();
    expect(row.taxOperandAgreement?.incomeTaxExpense).toMatchObject({ source: "edgar", periodEnd: "2026-06-28", tags: ["us-gaap/IncomeTaxExpenseBenefit"] });
    expect(row.taxOperandAgreement?.incomeBeforeTax).toMatchObject({ source: "edgar", periodEnd: "2026-06-28", tags: [`us-gaap/${PRETAX_TOTAL}`] });
    expect(filedTaxOperands(row)).toBe(true);
  });

  it("different shape: a pre-tax line before equity-method results proves the base the rate divides by", () => {
    const row = admit(YEAR, { incomeBeforeTax: 96_757, incomeTaxExpense: 19_087, netIncome: 77_670 },
      facts(YEAR, { [PRETAX_BEFORE_EQUITY]: 97_311, IncomeLossFromEquityMethodInvestments: -554, IncomeTaxExpenseBenefit: 19_087, NetIncomeLoss: 77_670 }));
    expect(row.incomeBeforeTax).toBe(96_757 * M);
    expect(row.taxOperandAgreement?.incomeBeforeTax).toMatchObject({ tags: [`us-gaap/${PRETAX_BEFORE_EQUITY}`] });
    expect(filedTaxOperands(row)).toBe(true);
  });

  it.each<{ name: string; vendor: Record<string, number>; source: Record<string, number> }>([
    { name: "no filed provision", vendor: { incomeBeforeTax: 2_462, incomeTaxExpense: 460, netIncome: 2_002 }, source: { [PRETAX_TOTAL]: 2_462, NetIncomeLoss: 2_002 } },
    { name: "a filed family that does not reconcile", vendor: { incomeBeforeTax: 2_462, incomeTaxExpense: 460, netIncome: 2_002 }, source: { ...FILED_QUARTER, NetIncomeLoss: 1_500 } },
  ])("control: records no agreement for $name, and the label stays", ({ vendor, source }) => {
    const row = admit(QUARTER, vendor, facts(QUARTER, source));
    expect(row.taxOperandAgreement).toBeUndefined();
    if (!row.fieldProvenance?.incomeTaxExpense) expect(filedTaxOperands(row)).toBe(false);
  });

  it("an adopted filed family records the same proof, so a second pass over the adopted row is unchanged", () => {
    const row = admit(QUARTER, { incomeBeforeTax: 2_462, incomeTaxExpense: 520, netIncome: 1_942 }, facts(QUARTER, FILED_QUARTER));
    expect(row).toMatchObject({ incomeBeforeTax: 2_462 * M, incomeTaxExpense: 460 * M });
    expect(row.fieldProvenance?.incomeTaxExpense).toBeDefined();
    expect(row.taxOperandAgreement?.incomeTaxExpense).toEqual(row.fieldProvenance?.incomeTaxExpense);
    expect(filedTaxOperands(row)).toBe(true);
  });

  it("drops an agreement an earlier pass recorded when the family is no longer established", () => {
    const proof = { source: "edgar" as const, unit: "USD", periodStart: QUARTER.start, periodEnd: QUARTER.end, observedAt: at, tags: [], filings: [] };
    const row = admit(QUARTER, { incomeBeforeTax: 2_462, incomeTaxExpense: 460, netIncome: 2_002 }, facts(QUARTER, { [PRETAX_TOTAL]: 2_462 }),
      { taxOperandAgreement: { incomeBeforeTax: proof, incomeTaxExpense: proof } });
    expect(row.taxOperandAgreement).toBeUndefined();
  });

  it("an agreement for another period end, or a refused operand, establishes nothing", () => {
    const proof = (periodEnd: string) => ({ source: "edgar" as const, unit: "USD", periodStart: QUARTER.start, periodEnd, observedAt: at, tags: [], filings: [] });
    const base = { date: QUARTER.end, incomeBeforeTax: 2_462 * M, incomeTaxExpense: 460 * M } as FmpIncomeStatementRow;
    expect(filedTaxOperands({ ...base, taxOperandAgreement: { incomeBeforeTax: proof("2026-03-29"), incomeTaxExpense: proof(QUARTER.end) } })).toBe(false);
    expect(filedTaxOperands({ ...base, taxOperandAgreement: { incomeBeforeTax: proof(QUARTER.end), incomeTaxExpense: proof(QUARTER.end) },
      fieldConflicts: { incomeTaxExpense: { usable: false, vendorValue: 1, secValue: 2, reason: "refused" } } })).toBe(false);
    expect(filedTaxOperands(base)).toBe(false);
  });
});
