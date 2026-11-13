/**
 * D-237 (P13 one basis, P8 filed beats vendor): an effective tax rate divides
 * the provision by the pre-tax income the provision relates to.
 *
 * A filer whose pre-tax line excludes equity-method results presents those
 * results after its provision, net of tax. The provider's pre-tax figure for
 * such a filer can be the one that reconciles to net income, which includes the
 * after-tax equity-method result, so a rate over it mixes two bases. Amazon's
 * DCF year-one rate was 22.6467% (39,615M over 174,926M) against 22.5770% on
 * the filed pre-tax income of 175,466M.
 *
 * The earnings admission records the filed line beside the row's pre-tax income
 * only from the complete reconciled filed family; every effective tax rate reads
 * `effectiveTaxPretaxIncome`. Filed amounts below are from Amazon's 10-K
 * 0001018724-26-000004 and 10-Qs 0001018724-25-000123, 0001018724-26-000014 and
 * 0001018724-26-000026; Caterpillar and Qualcomm are the control and the
 * unrelated shape.
 */
import { describe, expect, it } from "vitest";

import { effectiveTaxPretaxIncome, enrichIncomeClassification } from "@/edgar/incomeClassification";
import type { CompanyFacts } from "@/edgar/xbrl";
import { effectiveTaxRateFromTtm, taxRatePretaxOperand, ttmIncome, waccTaxRateFromStatements } from "@/pipeline/compute";
import { withIncomeOperatingBasis } from "@/pipeline/incomeBasis";
import type { FmpIncomeStatementRow, FmpPayload } from "@/providers/fmp";
import type { FetchResult, ManifestEntry } from "@/types/core";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

const at = "2026-10-29T00:00:00Z";
const M = 1_000_000;
const PRETAX_BEFORE_EQUITY = "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments";
const PRETAX_TOTAL = "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest";

interface Period { start: string; end: string; filed: string; form: "10-K" | "10-Q"; accn: string; fp: string }
const FY2025: Period = { start: "2025-01-01", end: "2025-12-31", filed: "2026-02-06", form: "10-K", accn: "0001018724-26-000004", fp: "FY" };
const Q3_2025: Period = { start: "2025-07-01", end: "2025-09-30", filed: "2025-10-31", form: "10-Q", accn: "0001018724-25-000123", fp: "Q3" };
const Q1_2026: Period = { start: "2026-01-01", end: "2026-03-31", filed: "2026-04-30", form: "10-Q", accn: "0001018724-26-000014", fp: "Q1" };

/** One filing's income facts for one period, in millions. */
function facts(period: Period, millions: Record<string, number>, cik = 1018724): CompanyFacts {
  const point = (tag: string, val: number) => ({ ...(tag === "Assets" ? {} : { start: period.start }), end: period.end, val: val * M,
    accn: period.accn, filed: period.filed, form: period.form, fy: Number(period.end.slice(0, 4)), fp: period.fp });
  return { cik, entityName: "Fixture", facts: { "us-gaap": Object.fromEntries(Object.entries({ Assets: 1, Revenues: 100_000, ...millions })
    .map(([tag, val]) => [tag, { units: { USD: [point(tag, val)] } }])) } };
}

function input(period: Period, millions: Partial<Record<keyof FmpIncomeStatementRow, number>>, extra: Partial<FmpIncomeStatementRow> = {}, cik = 1018724): FetchResult<FmpPayload<FmpIncomeStatementRow>> {
  const scaled = Object.fromEntries(Object.entries(millions).map(([key, value]) => [key, (value as number) * M]));
  const rows = [{ cik: String(cik), date: period.end, periodStart: period.start, filingDate: period.filed, reportedCurrency: "USD", revenue: 100_000 * M, ...scaled, ...extra } as FmpIncomeStatementRow];
  return { ok: true, value: { data: { rows, raw: structuredClone(rows) }, asOf: period.end, source: "fmp", endpoint: "fixture", fetchedAt: at } };
}

function admit(period: Period, vendor: Partial<Record<keyof FmpIncomeStatementRow, number>>, source: CompanyFacts, extra: Partial<FmpIncomeStatementRow> = {}) {
  const original = input(period, vendor, extra, source.cik);
  const result = enrichIncomeClassification(original, source, period.form === "10-K" ? "annual" : "quarter", at, { earningsOnly: true });
  if (!result.income.ok) throw new Error("income expected");
  return { row: result.income.value.data.rows[0]!, original, gaps: result.gaps };
}

const AMZN_FY2025 = { [PRETAX_BEFORE_EQUITY]: 97_311, IncomeLossFromEquityMethodInvestments: -554, IncomeTaxExpenseBenefit: 19_087, NetIncomeLoss: 77_670 };

describe("D-237: the earnings admission records the filed pre-tax line the provision relates to", () => {
  it("Amazon fiscal 2025: the provider's pre-tax income nets the after-tax equity-method loss; the filed line is the tax base", () => {
    const { row, original } = admit(FY2025, { incomeBeforeTax: 96_757, incomeTaxExpense: 19_087, netIncome: 77_670 }, facts(FY2025, AMZN_FY2025));
    // The earnings identity keeps the provider figure (D-200): 96,757 - 19,087 = 77,670.
    expect(row.incomeBeforeTax).toBe(96_757 * M);
    expect(row.fieldConflicts?.incomeBeforeTax).toBeUndefined();
    expect(row.pretaxIncomeBeforeEquityMethod).toBe(97_311 * M);
    expect(row.fieldProvenance?.pretaxIncomeBeforeEquityMethod).toMatchObject({ source: "edgar", unit: "USD", periodStart: "2025-01-01", periodEnd: "2025-12-31",
      tags: [`us-gaap/${PRETAX_BEFORE_EQUITY}`], filings: [{ accn: "0001018724-26-000004", filed: "2026-02-06", form: "10-K" }] });
    expect(effectiveTaxPretaxIncome(row)).toBe(97_311 * M);
    expect(row.incomeTaxExpense! / effectiveTaxPretaxIncome(row)!).toBeCloseTo(0.19614432, 8);
    expect(taxRatePretaxOperand(row)).toBe("2025-01-01 through 2025-12-31: 97311000000 USD (10-K 0001018724-26-000004, filed 2026-02-06) against 96757000000 including the equity-method result");
    // The stored row is untouched (P21): the base exists only in the admitted view.
    expect(original.ok && original.value.data.rows[0]!.pretaxIncomeBeforeEquityMethod).toBeUndefined();
  });

  it("Amazon Q3 2025, a quarter of the trailing window: 28,170M filed against the provider's 28,097M", () => {
    const { row } = admit(Q3_2025, { incomeBeforeTax: 28_097, incomeTaxExpense: 6_910, netIncome: 21_187 },
      facts(Q3_2025, { [PRETAX_BEFORE_EQUITY]: 28_170, IncomeLossFromEquityMethodInvestments: -73, IncomeTaxExpenseBenefit: 6_910, NetIncomeLoss: 21_187 }));
    expect(row.incomeBeforeTax).toBe(28_097 * M);
    expect(effectiveTaxPretaxIncome(row)).toBe(28_170 * M);
  });

  it("the same filer when the provider already reports the filed line (Amazon Q1 2026): the base is recorded and no figure moves", () => {
    const { row } = admit(Q1_2026, { incomeBeforeTax: 39_834, incomeTaxExpense: 9_560, netIncome: 30_255 },
      facts(Q1_2026, { [PRETAX_BEFORE_EQUITY]: 39_834, IncomeLossFromEquityMethodInvestments: -19, IncomeTaxExpenseBenefit: 9_560, NetIncomeLoss: 30_255 }));
    expect(row.incomeBeforeTax).toBe(39_834 * M);
    expect(row.pretaxIncomeBeforeEquityMethod).toBe(39_834 * M);
    expect(effectiveTaxPretaxIncome(row)).toBe(row.incomeBeforeTax);
    expect(taxRatePretaxOperand(row)).toBeNull();
  });

  it("compatible control, Caterpillar fiscal 2025: an adopted family carries the same base (2,768M over 11,541M, not over 11,650M)", () => {
    // The amounts are D-200's Caterpillar figures; the accession is a fixture label, not a citation.
    const period: Period = { ...FY2025, accn: "fixture-caterpillar-10-k", filed: "2026-02-13" };
    const { row } = admit(period, { incomeBeforeTax: 11_563, incomeTaxExpense: 2_768, netIncome: 8_873 },
      facts(period, { [PRETAX_BEFORE_EQUITY]: 11_541, IncomeLossFromEquityMethodInvestments: 109, IncomeTaxExpenseBenefit: 2_768, ProfitLoss: 8_882,
        NetIncomeLossAttributableToNoncontrollingInterest: -2 }, 18230));
    expect(row).toMatchObject({ incomeBeforeTax: 11_650 * M, incomeTaxExpense: 2_768 * M, netIncome: 8_882 * M });
    expect(effectiveTaxPretaxIncome(row)).toBe(11_541 * M);
  });

  it("unrelated shape, Qualcomm Q3 fiscal 2026: a pre-tax line that includes equity-method income is its own tax base", () => {
    const period: Period = { start: "2026-03-30", end: "2026-06-28", filed: "2026-07-29", form: "10-Q", accn: "0000804328-26-000086", fp: "Q3" };
    const { row } = admit(period, { incomeBeforeTax: 2_462, incomeTaxExpense: 460, netIncome: 2_002 },
      facts(period, { [PRETAX_TOTAL]: 2_462, IncomeLossFromEquityMethodInvestments: 66, IncomeTaxExpenseBenefit: 460, NetIncomeLoss: 2_002 }, 804328));
    expect(row.pretaxIncomeBeforeEquityMethod).toBeUndefined();
    expect(effectiveTaxPretaxIncome(row)).toBe(2_462 * M);
  });

  it.each<{ name: string; source: Record<string, number> }>([
    { name: "no filed net income (the family is incomplete)", source: { [PRETAX_BEFORE_EQUITY]: 97_311, IncomeLossFromEquityMethodInvestments: -554, IncomeTaxExpenseBenefit: 19_087 } },
    { name: "no filed equity-method amount (nothing bridges the line to net income)", source: { [PRETAX_BEFORE_EQUITY]: 97_311, IncomeTaxExpenseBenefit: 19_087, NetIncomeLoss: 77_670 } },
    { name: "a filed family that does not reconcile", source: { [PRETAX_BEFORE_EQUITY]: 97_311, IncomeLossFromEquityMethodInvestments: -554, IncomeTaxExpenseBenefit: 19_087, NetIncomeLoss: 70_000 } },
  ])("records no base without the complete reconciled filed family: $name", ({ source }) => {
    const { row } = admit(FY2025, { incomeBeforeTax: 96_757, incomeTaxExpense: 19_087, netIncome: 77_670 }, facts(FY2025, source));
    expect(row.pretaxIncomeBeforeEquityMethod).toBeUndefined();
    expect(row.fieldProvenance?.pretaxIncomeBeforeEquityMethod).toBeUndefined();
  });

  it("drops a base an earlier pass recorded when the family is no longer established", () => {
    const stale = { pretaxIncomeBeforeEquityMethod: 97_311 * M, fieldProvenance: { pretaxIncomeBeforeEquityMethod: { source: "edgar" as const, unit: "USD",
      periodStart: "2025-01-01", periodEnd: "2025-12-31", observedAt: at, tags: [`us-gaap/${PRETAX_BEFORE_EQUITY}`], filings: [{ accn: FY2025.accn, filed: FY2025.filed, form: "10-K" }] } } };
    const { row } = admit(FY2025, { incomeBeforeTax: 96_757, incomeTaxExpense: 19_087, netIncome: 77_670 },
      facts(FY2025, { [PRETAX_BEFORE_EQUITY]: 97_311, IncomeTaxExpenseBenefit: 19_087, NetIncomeLoss: 77_670 }), stale);
    expect(row.pretaxIncomeBeforeEquityMethod).toBeUndefined();
    expect(row.fieldProvenance?.pretaxIncomeBeforeEquityMethod).toBeUndefined();
    expect(effectiveTaxPretaxIncome(row)).toBe(row.incomeBeforeTax);
  });

  it("a withheld pre-tax income has no tax base, whatever was recorded beside it", () => {
    expect(effectiveTaxPretaxIncome({ incomeBeforeTax: undefined, pretaxIncomeBeforeEquityMethod: 97_311 * M })).toBeNull();
    expect(effectiveTaxPretaxIncome(null)).toBeNull();
    expect(effectiveTaxPretaxIncome({ incomeBeforeTax: 5 })).toBe(5);
  });

  it("the report's calculation view records the base on a stored bundle without changing its bytes", () => {
    const source = facts(FY2025, AMZN_FY2025);
    const bundle = withIssuerFacts(completeCurrencyBundle({}), source);
    bundle.builtAt = at;
    bundle.statements.incomeAnnual = input(FY2025, { incomeBeforeTax: 96_757, incomeTaxExpense: 19_087, netIncome: 77_670 });
    const before = JSON.stringify(bundle);
    const view = withIncomeOperatingBasis(bundle).statements.incomeAnnual;
    expect(view.ok && effectiveTaxPretaxIncome(view.value.data.rows[0])).toBe(97_311 * M);
    expect(view.ok && view.value.data.rows[0]!.incomeBeforeTax).toBe(96_757 * M);
    expect(JSON.stringify(bundle)).toBe(before);
    // Idempotent: a second pass re-establishes the same base.
    expect(withIncomeOperatingBasis(withIncomeOperatingBasis(bundle)).statements).toEqual(withIncomeOperatingBasis(bundle).statements);
  });
});

/** Amazon's trailing four quarters to 2026-06-30 as the calculation view holds them (newest first). */
function amazonWindow(): FmpIncomeStatementRow[] {
  const proof = (start: string, end: string, filings: { accn: string; filed: string; form: string }[], derivation?: "fy-minus-ytd") => ({
    source: "edgar" as const, unit: "USD", periodStart: start, periodEnd: end, observedAt: at, tags: [`us-gaap/${PRETAX_BEFORE_EQUITY}`], filings, ...(derivation ? { derivation } : {}) });
  const quarter = (date: string, pretax: number, tax: number, revenue: number, base?: { value: number; proof: ReturnType<typeof proof> }): FmpIncomeStatementRow => ({
    date, reportedCurrency: "USD", revenue: revenue * M, operatingIncome: 20_000 * M, netIncome: (pretax - tax) * M, incomeBeforeTax: pretax * M, incomeTaxExpense: tax * M,
    ...(base ? { pretaxIncomeBeforeEquityMethod: base.value * M, fieldProvenance: { pretaxIncomeBeforeEquityMethod: base.proof } } : {}) });
  return [
    quarter("2026-06-30", 80_857, 18_199, 200_606, { value: 80_857, proof: proof("2026-04-01", "2026-06-30", [{ accn: "0001018724-26-000026", filed: "2026-07-31", form: "10-Q" }]) }),
    quarter("2026-03-31", 39_834, 9_560, 181_519, { value: 39_834, proof: proof("2026-01-01", "2026-03-31", [{ accn: "0001018724-26-000014", filed: "2026-04-30", form: "10-Q" }]) }),
    quarter("2025-12-31", 26_138, 4_946, 213_386, { value: 26_605, proof: proof("2025-10-01", "2025-12-31",
      [{ accn: "0001018724-26-000004", filed: "2026-02-06", form: "10-K" }, { accn: "0001018724-25-000123", filed: "2025-10-31", form: "10-Q" }], "fy-minus-ytd") }),
    quarter("2025-09-30", 28_097, 6_910, 180_169, { value: 28_170, proof: proof("2025-07-01", "2025-09-30", [{ accn: "0001018724-25-000123", filed: "2025-10-31", form: "10-Q" }]) }),
  ];
}

describe("D-237: the TTM tax pair divides by the four quarters' own bases", () => {
  it("Amazon TTM to 2026-06-30: 39,615M over the filed 175,466M = 22.5770%, not over 174,926M = 22.6467%", () => {
    const gaps: ManifestEntry[] = [];
    const ttm = ttmIncome(amazonWindow(), gaps)!;
    expect(ttm.incomeTaxExpense).toBe(39_615 * M);
    expect(ttm.taxRatePretaxIncome).toBe(175_466 * M);
    // Pre-tax income itself keeps the figure that reconciles to net income (the P/E note reads it).
    expect(ttm.incomeBeforeTax).toBe(174_926 * M);
    expect(effectiveTaxRateFromTtm(ttm)! * 100).toBeCloseTo(22.57702347, 8);
    const entry = gaps.find(gap => gap.field === "compute.ttmIncome.taxRatePretaxIncome");
    expect(entry).toMatchObject({ severity: "info", expected: true });
    expect(entry!.reason).toContain("the provision 39615000000 is divided by 175466000000");
    expect(entry!.reason).toContain("not by the 174926000000");
    expect(entry!.reason).toContain("2025-10-01 through 2025-12-31: 26605000000 USD (10-K 0001018724-26-000004, filed 2026-02-06 + 10-Q 0001018724-25-000123, filed 2025-10-31; fy-minus-ytd) against 26138000000");
    expect(entry!.reason).toContain("2025-07-01 through 2025-09-30: 28170000000 USD (10-Q 0001018724-25-000123, filed 2025-10-31) against 28097000000");
    // The two 2026 quarters already equal their filed line and are not listed as changes.
    expect(entry!.reason).not.toContain("2026-04-01 through");
    expect(ttm.taxRatePretaxBasis).toBe(entry!.reason);
    expect(waccTaxRateFromStatements(ttm, undefined)).toMatchObject({ rate: 39_615 / 175_466, fallback: null,
      basis: expect.stringContaining("filed pre-tax income before equity-method results") });
  });

  it("a window the filings leave alone keeps its pair, its wording and no entry (Qualcomm's four quarters to 2026-06-28)", () => {
    const rows = [["2026-06-28", 2_462, 460], ["2026-03-29", 2_232, -5_138], ["2025-12-28", 3_547, 543], ["2025-09-28", 2_971, 6_088]].map(([date, pretax, tax]) => ({
      date: date as string, reportedCurrency: "USD", revenue: 10_000 * M, operatingIncome: 2_000 * M, netIncome: ((pretax as number) - (tax as number)) * M,
      incomeBeforeTax: (pretax as number) * M, incomeTaxExpense: (tax as number) * M }) as FmpIncomeStatementRow);
    const gaps: ManifestEntry[] = [];
    const ttm = ttmIncome(rows, gaps)!;
    // The sum of the four filed quarterly provisions, 1,953M: the filer's nine-month column (-4,136M) is 1M off its three quarters (-4,135M).
    expect(ttm.incomeTaxExpense).toBe(1_953 * M);
    expect(ttm.taxRatePretaxIncome).toBe(11_212 * M);
    expect(ttm.taxRatePretaxIncome).toBe(ttm.incomeBeforeTax);
    expect(ttm.taxRatePretaxBasis).toBeNull();
    expect(gaps.some(gap => gap.field === "compute.ttmIncome.taxRatePretaxIncome")).toBe(false);
    expect(effectiveTaxRateFromTtm(ttm)! * 100).toBeCloseTo(17.41883696, 8);
    expect(waccTaxRateFromStatements(ttm, undefined).basis).toBe("TTM incomeTaxExpense / incomeBeforeTax from the statements (observed effective rate)");
  });

  it("an incomplete pair has no base either", () => {
    const rows = amazonWindow();
    rows[1] = { ...rows[1]!, incomeTaxExpense: undefined };
    const ttm = ttmIncome(rows)!;
    expect(ttm.incomeBeforeTax).toBeNull();
    expect(ttm.taxRatePretaxIncome).toBeNull();
    expect(ttm.taxRatePretaxBasis).toBeNull();
    expect(effectiveTaxRateFromTtm(ttm)).toBeNull();
  });

  it("the annual fallback reads the latest year's base (Amazon fiscal 2025: 19,087M over 97,311M)", () => {
    const { row } = admit(FY2025, { incomeBeforeTax: 96_757, incomeTaxExpense: 19_087, netIncome: 77_670 }, facts(FY2025, AMZN_FY2025));
    expect(waccTaxRateFromStatements(null, row).rate).toBeCloseTo(19_087 / 97_311, 12);
  });
});
