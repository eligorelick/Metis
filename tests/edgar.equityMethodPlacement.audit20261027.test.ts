import { describe, expect, it } from "vitest";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import { admitVendorLongTermInvestments } from "@/edgar/financialEnrichment";
import { PRETAX_EXCLUDING_EQUITY_METHOD_TAG } from "@/edgar/tagSynonyms";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpBalanceSheetRow } from "@/providers/fmp";

const M = 1_000_000;
const PRETAX = "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest";
interface Point { start?: string; end: string; val: number; filed: string; form: string; fp: string }
const fy = (val: number): Point => ({ start: "2025-01-01", end: "2025-12-31", val: val * M, filed: "2026-02-06", form: "10-K", fp: "FY" });
function facts(lines: Record<string, Point[]>): CompanyFacts {
  return { cik: 1, entityName: "Test", facts: { "us-gaap": Object.fromEntries(Object.entries(lines).map(([tag, points]) => [tag, {
    label: tag, units: { USD: points.map(p => ({ ...p, accn: `0000000001-${p.filed}`, fy: Number(p.end.slice(0, 4)) })) },
  }])) } } as unknown as CompanyFacts;
}
const options = { symbol: "TEST", cik: "0000000001", annualPeriods: 4, quarterlyPeriods: 6, asOf: "2026-10-15", factsObservedAt: "2026-10-15T00:00:00Z",
  vendorSplits: { status: "retrieved" as const, source: "test", events: [], coverage: [{ from: "2020-01-01", to: "2026-10-15" }] } };
function annual(lines: Record<string, number | undefined>) {
  return facts(Object.fromEntries(Object.entries({ Revenues: 100_000, NetIncomeLoss: 2000, Assets: 200_000, ...lines })
    .filter(([, value]) => value !== undefined)
    .map(([tag, value]) => [tag, [{ ...fy(value!), ...(["Assets", "LongTermInvestments", "EquityMethodInvestments"].includes(tag) ? { start: undefined } : {}) }]])));
}
const placement = (input: CompanyFacts) => buildStatementsFromCompanyFacts(input, options).incomeAnnual.rows[0]?.equityMethodIncomePlacement;

describe("FIN-401 / FIN-401-V1: equity-method income placement", () => {
  it("reads a filed operating subtotal that includes affiliate income from component arithmetic", () => {
    expect(placement(annual({ OperatingIncomeLoss: 4281, OtherNonoperatingIncomeExpense: 1125, InterestAndDebtExpense: 2771,
      [PRETAX]: 2635, IncomeLossFromEquityMethodInvestments: 33 }))).toMatchObject({ placement: "in-operating-income", income: 33 * M });
  });
  it("keeps income demonstrably between operating and pretax income below operating income", () => {
    expect(placement(annual({ OperatingIncomeLoss: 14_000, InvestmentIncomeInterest: 900, InterestExpense: 1600,
      OtherNonoperatingIncomeExpense: 300, [PRETAX]: 15_300, IncomeLossFromEquityMethodInvestments: 1700 })))
      .toMatchObject({ placement: "below-operating-income", income: 1700 * M });
  });
  it.each([
    { OperatingIncomeLoss: 5000, NonoperatingIncomeExpense: 720, InterestExpense: 3634, pretax: 2086, income: 51 },
    { OperatingIncomeLoss: 5000, NonoperatingIncomeExpense: 503, InterestExpense: 1052, pretax: 4452, income: 285 },
    { OperatingIncomeLoss: 5000, NonoperatingIncomeExpense: -1009, pretax: 3991, income: 171 },
  ])("does not infer inclusion from an aggregate that can itself hold the income ($income M)", ({ pretax, income, ...lines }) => {
    expect(placement(annual({ ...lines, [PRETAX]: pretax, IncomeLossFromEquityMethodInvestments: income })))
      .toMatchObject({ placement: "undetermined", income: income * M });
  });
  it("marks unmeasured income inside derived EBIT, but a subtracted filed result below it", () => {
    const lines = { [PRETAX]: 41_268, InterestExpense: 1000, EquityMethodInvestments: 33_324 };
    expect(placement(annual(lines))).toMatchObject({ placement: "in-operating-income", income: null });
    expect(placement(annual({ ...lines, IncomeLossFromEquityMethodInvestments: 6385 })))
      .toMatchObject({ placement: "below-operating-income", income: 6385 * M });
  });
  it.each([false, true])("reads B13's actual subtraction beside an aggregate (composed pretax %s)", composed => {
    const base = composed ? { IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic: 6000,
      IncomeLossFromContinuingOperationsBeforeIncomeTaxesForeign: 4000 } : { [PRETAX]: 10_000 };
    expect(placement(annual({ ...base, NonoperatingIncomeExpense: -500, IncomeLossFromEquityMethodInvestments: 700 })))
      .toMatchObject({ placement: "below-operating-income", income: 700 * M });
  });
  it("tests revenue less costs for a pretax element defined before equity-method income", () => {
    const lines = { [PRETAX_EXCLUDING_EQUITY_METHOD_TAG]: 20_000, Revenues: 195_000, CostsAndExpenses: 175_000,
      InterestExpense: 1000, IncomeLossFromEquityMethodInvestments: 3000 };
    expect(placement(annual(lines))).toMatchObject({ placement: "in-operating-income", income: 3000 * M });
    expect(placement(annual({ ...lines, CostsAndExpenses: 178_000 }))).toMatchObject({ placement: "below-operating-income", income: 3000 * M });
  });
  it("a filed zero quarter and a fourth quarter derived on one presentation remain measured", () => {
    const periods = [
      { start: "2025-01-01", end: "2025-03-31", filed: "2025-04-30", form: "10-Q", fp: "Q1", e: -4, i: 708 },
      { start: "2025-04-01", end: "2025-06-30", filed: "2025-07-30", form: "10-Q", fp: "Q2", e: 34, i: 710 },
      { start: "2025-07-01", end: "2025-09-30", filed: "2025-10-30", form: "10-Q", fp: "Q3", e: 17, i: 694 },
      { ...fy(0), e: 33, i: 2771 },
      { start: "2026-01-01", end: "2026-03-31", filed: "2026-04-30", form: "10-Q", fp: "Q1", e: 0, i: 650 },
      { start: "2026-04-01", end: "2026-06-30", filed: "2026-07-30", form: "10-Q", fp: "Q2", e: 32, i: 600 },
    ];
    const line = (value: (p: typeof periods[number]) => number, instant = false) => periods.map(p => ({ ...p, start: instant ? undefined : p.start, val: value(p) * M }));
    const input = facts({ Revenues: line(p => p.fp === "FY" ? 4000 : 1000), Assets: line(() => 5000, true),
      OperatingIncomeLoss: line(p => p.fp === "FY" ? 2000 : 500), OtherNonoperatingIncomeExpense: line(p => p.fp === "FY" ? 400 : 100),
      InterestExpense: line(p => p.i), [PRETAX]: line(p => (p.fp === "FY" ? 2400 : 600) - p.i), IncomeLossFromEquityMethodInvestments: line(p => p.e) });
    const rows = buildStatementsFromCompanyFacts(input, options).incomeQuarterly.rows;
    expect(rows.find(r => r.date === "2026-03-31")?.equityMethodIncomePlacement).toMatchObject({ placement: "immaterial", income: 0 });
    expect(rows.find(r => r.date === "2025-12-31")?.equityMethodIncomePlacement).toMatchObject({ placement: "in-operating-income", income: -14 * M });
    // FIN-401-V1 / I4: a presentation-refused operand must never be silently replaced by zero.
    const concept = input.facts["us-gaap"]!["OtherNonoperatingIncomeExpense"] as { units: { USD: Point[] } };
    concept.units.USD.push({ ...concept.units.USD[2]!, val: 200 * M, filed: "2026-08-01" });
    const refused = buildStatementsFromCompanyFacts(input, options).incomeQuarterly.rows.find(r => r.date === "2025-12-31");
    expect(refused?.equityMethodIncomePlacement?.placement).toBe("undetermined");
  });
  it.each([271, 40_000, 32_600])("the provider fill and builder use one component floor (total %s M)", total => {
    const input = annual({ LongTermInvestments: total, EquityMethodInvestments: 32_653 });
    const built = buildStatementsFromCompanyFacts(input, options).balanceAnnual;
    const row = built.rows[0]!;
    const vendor: FmpBalanceSheetRow = { date: "2025-12-31", longTermInvestments: 0 };
    const filled = admitVendorLongTermInvestments(vendor, input, "USD", options.factsObservedAt);
    const expected = total === 271 ? 32_653 * M : total * M;
    expect(row.longTermInvestments).toBe(expected);
    expect(filled.row.longTermInvestments).toBe(expected);
    expect(filled.row.fieldProvenance?.longTermInvestments.tags).toEqual(row.fieldProvenance?.longTermInvestments.tags);
    if (total === 271) {
      expect(built.notes.join(" ")).toMatch(/LongTermInvestments 271000000 not used.*EquityMethodInvestments 32653000000/);
      expect(filled.admissions[0]?.detail).toMatch(/LongTermInvestments 271000000 not used.*EquityMethodInvestments 32653000000/);
      expect(built.withheld.some(w => w.field === "longTermInvestments")).toBe(false);
    }
  });
});
