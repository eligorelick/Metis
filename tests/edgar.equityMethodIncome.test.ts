import { describe, expect, it } from "vitest";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { VendorSplitEvidence } from "@/providers/splitEvents";

interface Point { start?: string; end: string; val: number; filed?: string; form?: string; fp?: string }
const fy = (val: number): Point => ({ start: "2025-01-01", end: "2025-12-31", val, filed: "2026-02-06", form: "10-K", fp: "FY" });
const q1 = (val: number): Point => ({ start: "2026-01-01", end: "2026-03-31", val, filed: "2026-04-30", form: "10-Q", fp: "Q1" });
const h1 = (val: number): Point => ({ start: "2026-01-01", end: "2026-06-30", val, filed: "2026-07-30", form: "10-Q", fp: "Q2" });
const q2 = (val: number): Point => ({ ...h1(val), start: "2026-04-01" });
const vendorSplits: VendorSplitEvidence = { status: "retrieved", source: "test:vendor", events: [], coverage: [{ from: "2020-01-01", to: "2026-10-15" }] };
const options = { symbol: "TEST", cik: "0000000001", annualPeriods: 2, quarterlyPeriods: 6, asOf: "2026-10-15", vendorSplits };

function facts(equity: Point[], unit = "USD"): CompanyFacts {
  const concept = (points: Point[], moneyUnit = "USD") => ({ label: "filed line", units: { [moneyUnit]: points.map((p, i) => ({
    ...p, accn: `0000000001-26-${String(i).padStart(6, "0")}`, fy: Number(p.end.slice(0, 4)),
  })) } });
  return { cik: 1, entityName: "Test", facts: { "us-gaap": {
    Revenues: concept([fy(716_924_000_000), q1(181_519_000_000), q2(200_606_000_000), h1(382_125_000_000)]),
    Assets: concept([fy(1), q1(1), q2(1)].map(point => ({ ...point, start: undefined }))),
    OperatingIncomeLoss: concept([fy(79_975_000_000), q2(27_461_000_000)]),
    IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments: concept([fy(97_311_000_000), q2(80_857_000_000)]),
    IncomeTaxExpenseBenefit: concept([fy(19_087_000_000), q2(18_199_000_000)]),
    NonoperatingIncomeExpense: concept([fy(17_336_000_000), q2(53_396_000_000)]),
    NetIncomeLoss: concept([fy(77_670_000_000), q2(62_647_000_000)]),
    NetIncomeLossAvailableToCommonStockholdersBasic: concept([fy(77_000_000_000), q2(62_000_000_000)]),
    IncomeLossFromEquityMethodInvestments: concept(equity, unit),
  } } };
}

describe("filed equity-method income or loss", () => {
  // Public SEC examples: AMZN 2025 10-K / 2026 Q2 10-Q, statement of operations.
  // The standardized element is as filed; its tax presentation is issuer-specific.
  it("retains the signed monetary line without changing pretax, operating or common earnings", () => {
    const built = buildStatementsFromCompanyFacts(facts([fy(-554_000_000), q2(-11_000_000)]), options);
    expect(built.incomeAnnual.rows[0]).toMatchObject({ equityMethodIncomeLoss: -554_000_000, operatingIncome: 79_975_000_000,
      incomeBeforeTax: 97_311_000_000, netIncome: 77_670_000_000, netIncomeAvailableToCommon: 77_000_000_000 });
    const quarter = built.incomeQuarterly.rows.find(row => row.date === "2026-06-30")!;
    expect(quarter.equityMethodIncomeLoss).toBe(-11_000_000);
    expect(quarter.incomeBeforeTax! - quarter.incomeTaxExpense! + Number(quarter.equityMethodIncomeLoss)).toBe(quarter.netIncome);
    expect(quarter.totalOtherIncomeExpensesNet).toBe(53_396_000_000);
    expect(quarter.fieldProvenance?.equityMethodIncomeLoss).toMatchObject({ unit: "USD", periodStart: "2026-04-01", periodEnd: "2026-06-30", tags: ["us-gaap/IncomeLossFromEquityMethodInvestments"] });
  });

  it("derives a signed quarter only from matching YTD durations and preserves the operands", () => {
    const quarter = buildStatementsFromCompanyFacts(facts([q1(-19_000_000), h1(-30_000_000)]), options)
      .incomeQuarterly.rows.find(row => row.date === "2026-06-30")!;
    expect(quarter.equityMethodIncomeLoss).toBe(-11_000_000);
    expect(quarter.fieldProvenance?.equityMethodIncomeLoss).toMatchObject({ derivation: "ytd-difference", periodStart: "2026-04-01", periodEnd: "2026-06-30" });
    expect(quarter.fieldProvenance?.equityMethodIncomeLoss.filings).toHaveLength(2);
  });

  it.each([0, 12_000_000])("preserves a filed zero or positive result (%s)", value => {
    expect(buildStatementsFromCompanyFacts(facts([q2(value)]), options).incomeQuarterly.rows[0]?.equityMethodIncomeLoss).toBe(value);
  });

  it.each([
    { points: [], unit: "USD", reason: "absent" },
    { points: [{ ...q2(-11), start: undefined }], unit: "USD", reason: "instant" },
    { points: [q2(-11)], unit: "shares", reason: "non-monetary" },
    { points: [q2(-11)], unit: "EUR", reason: "different currency" },
  ])("withholds an $reason value rather than inventing a monetary duration", ({ points, unit }) => {
    const quarter = buildStatementsFromCompanyFacts(facts(points, unit), options).incomeQuarterly.rows.find(row => row.date === "2026-06-30")!;
    expect(quarter.equityMethodIncomeLoss).toBeNull();
    expect(quarter.fieldProvenance?.equityMethodIncomeLoss).toBeUndefined();
  });
});
