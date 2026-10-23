/**
 * Audit 2026-10-22, batch 1: debt tags no chain read, and debt counted twice.
 *
 * tests/fixtures/batch1-debt-facts.json is each issuer's SEC companyfacts
 * payload (public EDGAR data), trimmed to balance-sheet debt instants ending
 * 2025 or later:
 *
 *   ORCL  Oracle, CIK 1341439      LongTermNotesAndLoans beside NotesPayableCurrent (B-14)
 *   CVX   Chevron, CIK 93410       LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities (B-15, B-17)
 *   PLD   Prologis, CIK 1045609    an inclusive LongTermDebt with an unbucketable split (B-40)
 *   META  Meta Platforms, CIK 1326801  a zero remainder-of-year maturity bucket (A-10)
 */
import { describe, expect, it } from "vitest";

import { fiscalMaturityScopeReason } from "@/edgar/debtCompleteness";
import { admitDebtFields } from "@/edgar/financialEnrichment";
import { buildStatementsFromCompanyFacts, type BuiltStatements } from "@/edgar/statements";
import type { CompanyFacts } from "@/edgar/xbrl";
import fixture from "./fixtures/batch1-debt-facts.json";

type Ticker = "ORCL" | "CVX" | "PLD" | "META";
type Gaap = Record<string, { units: Record<string, Record<string, unknown>[]> }>;
const B = 1e9;

function build(ticker: Ticker, edit?: (gaap: Gaap) => void): BuiltStatements {
  const issuer = fixture.issuers[ticker];
  const facts = structuredClone(issuer.facts) as unknown as CompanyFacts;
  edit?.(facts.facts["us-gaap"] as unknown as Gaap);
  return buildStatementsFromCompanyFacts(facts, {
    symbol: ticker, cik: String(issuer.cik).padStart(10, "0"), annualPeriods: 3, quarterlyPeriods: 6,
    asOf: fixture.asOf, factsObservedAt: `${fixture.asOf}T00:00:00.000Z`,
    vendorSplits: { status: "retrieved", source: "audit-fixture", events: [], coverage: [{ from: "2000-01-01", to: fixture.asOf }] },
  });
}
type Row = Record<string, unknown> & { fieldConflicts?: Record<string, { usable?: boolean; reason?: string }> };
const quarter = (built: BuiltStatements, date: string) => built.balanceQuarterly.rows.find((row) => row.date === date) as unknown as Row;
const annual = (built: BuiltStatements, date: string) => built.balanceAnnual.rows.find((row) => row.date === date) as unknown as Row;
const financing = (row: Row) => ((row.shortTermDebt as number | null) ?? 0) + ((row.longTermDebt as number | null) ?? 0);
const near = (value: unknown, target: number) => {
  expect(typeof value).toBe("number");
  expect(Math.abs((value as number) - target)).toBeLessThanOrEqual(1e6);
};

describe("noncurrent notes and loans (audit 2026-10-22 B-14)", () => {
  it("ORCL: composes LongTermNotesAndLoans with its current portion, never the current portion alone", () => {
    const row = quarter(build("ORCL"), "2026-08-31");
    near(financing(row), 125.337 * B);
    near(row.totalDebt, 125.337 * B + (row.capitalLeaseObligations as number));
    expect(row.fieldConflicts?.totalDebt).toBeUndefined();
  });

  it("ORCL: beside the balance sheet's current-debt line, the current notes are not counted twice", () => {
    const row = quarter(build("ORCL"), "2026-05-31");
    near(row.shortTermDebt, 7.199 * B);
    near(row.longTermDebt, 122.342 * B);
    near(financing(row), 129.541 * B); // the filer's own DebtLongtermAndShorttermCombinedAmount
  });

  it("withholds debt a tagged aggregate shows to be partial rather than publishing the partial sum", () => {
    const row = quarter(build("ORCL", (gaap) => {
      // A noncurrent figure that covers only part of the debt, beside the
      // filer's inclusive LongTermDebt total that no chain step chose.
      const at = gaap.LongTermNotesAndLoans!.units.USD!.find((p) => p.end === "2026-08-31")!;
      delete gaap.LongTermNotesAndLoans;
      gaap.LongTermDebtNoncurrent = { units: { USD: [{ ...at, val: 50 * B }] } };
      gaap.LongTermDebt = { units: { USD: [{ ...at, val: 125.337 * B }] } };
    }), "2026-08-31");
    expect(row.totalDebt).toBeNull();
    expect(row.fieldConflicts?.totalDebt?.reason).toMatch(/LongTermDebt 125337000000 exceeds/);
  });

  // PR #47 review: vendor statement rows reach Stage B through admitDebtFields
  // alone, so the same tagged-total check runs there too.
  const vendorRow = (longTermDebt: number) => ({
    date: "2026-08-31", reportedCurrency: "USD", cik: "0001341439", shortTermDebt: 7.625 * B, longTermDebt, financeLeaseLiability: 9.185 * B,
    totalDebt: 7.625 * B + longTermDebt + 9.185 * B, cashAndCashEquivalents: 36.369 * B, netDebt: 7.625 * B + longTermDebt + 9.185 * B - 36.369 * B,
  });
  const admitVendor = (longTermDebt: number) => admitDebtFields(vendorRow(longTermDebt) as never, fixture.issuers.ORCL.facts as unknown as CompanyFacts, "USD", `${fixture.asOf}T00:00:00.000Z`);

  it("withholds a vendor row's debt that the filer's tagged total shows to be partial", () => {
    const { row, gaps } = admitVendor(50 * B);
    const admitted = row as unknown as Row;
    expect(admitted.totalDebt).toBeNull();
    expect(admitted.netDebt).toBeNull();
    expect(admitted.fieldConflicts?.totalDebt?.reason).toMatch(/same-period LongTermNotesAndLoans 117712000000 exceeds the composed current and noncurrent financing debt and finance leases 66810000000/);
    expect(gaps.map((gap) => gap.field)).toContain("statements.balance.2026-08-31.totalDebt");
  });

  it("keeps a vendor row whose components cover the tagged total", () => {
    const admitted = admitVendor(117.712 * B).row as unknown as Row;
    near(admitted.totalDebt, 134.522 * B);
    expect(admitted.fieldConflicts?.totalDebt).toBeUndefined();
  });
});

describe("long-term debt including current maturities (audit 2026-10-22 B-15, B-17)", () => {
  it("CVX: reads the inclusive long-term total beside short-term borrowings", () => {
    const built = build("CVX");
    for (const [date, stb, total] of [["2026-06-30", 0.401, 36.674], ["2026-03-31", 5.828, 39.6], ["2025-09-30", 3.591, 37.953]] as const) {
      const row = quarter(built, date);
      near(financing(row), (stb + total) * B);
      expect(row.totalDebt).not.toBeCloseTo(stb * B, -6);
    }
    near(quarter(built, "2026-06-30").totalDebt, 37.075 * B);
  });

  it("CVX FY2025: does not count the current debt reclassified to long-term twice", () => {
    const built = build("CVX");
    for (const row of [annual(built, "2025-12-31"), quarter(built, "2025-12-31")]) {
      near(financing(row), 40.758 * B); // short-term borrowings 0.977 + long-term debt and finance leases 39.781
      expect(financing(row)).toBeLessThan(45 * B);
      near(row.totalDebt, 40.758 * B + 5.985 * B); // the finance leases are inside the inclusive total
    }
  });

  it("withholds the composition when it exceeds the inclusive total and no short-term borrowing is tagged", () => {
    const row = annual(build("CVX", (gaap) => { delete gaap.ShortTermBorrowings; delete gaap.CommercialPaper; delete gaap.ShortTermBankLoansAndNotesPayable; }), "2025-12-31");
    expect(row.totalDebt).toBeNull();
    expect(row.fieldConflicts?.totalDebt?.reason).toMatch(/LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities/);
  });
});

describe("an inclusive LongTermDebt whose current/noncurrent split is refused (audit 2026-10-22 B-40)", () => {
  // Prologis files an unclassified balance sheet: LongTermDebt is all of its
  // carrying debt. At 2026-03-31 the next-twelve-months maturity bucket sits
  // beside a remainder-of-year bucket, so it cannot stand in as current debt.
  it("PLD: keeps total debt from the inclusive total while the split stays withheld", () => {
    const row = quarter(build("PLD"), "2026-03-31");
    expect(row.shortTermDebt).toBeNull();
    expect(row.longTermDebt).toBeNull();
    near(row.totalDebt, 34_669.592e6 + (row.capitalLeaseObligations as number));
    expect(row.fieldConflicts?.totalDebt).toBeUndefined();
    expect(row.fieldConflicts?.shortTermDebt?.usable).toBe(false);
  });

  it("PLD: Stage B's debt admission keeps the total too", () => {
    const facts = fixture.issuers.PLD.facts as unknown as CompanyFacts;
    const row = quarter(build("PLD"), "2026-03-31");
    const admitted = admitDebtFields(row as never, facts, "USD", `${fixture.asOf}T00:00:00.000Z`).row as unknown as Row;
    near(admitted.totalDebt, 34_669.592e6 + (row.capitalLeaseObligations as number));
    expect(admitted.netDebt).not.toBeNull();
    expect(admitted.fieldConflicts?.totalDebt).toBeUndefined();
  });

  it("exempts only the split's own refusals: a component refused for another reason still withholds the total", () => {
    const facts = fixture.issuers.PLD.facts as unknown as CompanyFacts;
    const built = quarter(build("PLD"), "2026-03-31");
    for (const refused of [["longTermDebt"], ["shortTermDebt", "longTermDebt"]]) {
      const row = structuredClone(built);
      for (const field of refused) row.fieldConflicts = { ...row.fieldConflicts, [field]: { usable: false, reason: "vendor and SEC values disagree" } };
      const admitted = admitDebtFields(row as never, facts, "USD", `${fixture.asOf}T00:00:00.000Z`).row as unknown as Row;
      expect(admitted.totalDebt, refused.join("+")).toBeNull();
    }
  });

  it("still withholds total debt when short-term borrowings sit beside the refused bucket", () => {
    const row = quarter(build("PLD", (gaap) => {
      const at = gaap.LongTermDebt!.units.USD!.find((p) => p.end === "2026-03-31")!;
      gaap.ShortTermBorrowings = { units: { USD: [{ ...at, val: 500e6 }] } };
    }), "2026-03-31");
    expect(row.totalDebt).toBeNull();
  });
});

describe("a zero remainder-of-year maturity bucket (audit 2026-10-22 A-10)", () => {
  // Meta's June 2026 10-Q tags the remainder of the fiscal year at 0 and
  // 2.75B "in next twelve months", which is the next fiscal year's bucket;
  // its balance sheet carries no current debt (LongTermDebt = LongTermDebtNoncurrent).
  it("META: declines the maturity bucket as current debt the balance sheet does not carry", () => {
    const row = quarter(build("META"), "2026-06-30");
    expect(row.shortTermDebt ?? 0).toBe(0);
    near(row.longTermDebt, 83.664 * B);
    near(financing(row), 83.664 * B);
    near(row.totalDebt, 83.664 * B + (row.capitalLeaseObligations as number));
    expect(row.fieldConflicts?.totalDebt).toBeUndefined();
    expect((row.fieldProvenance as { shortTermDebt?: { tags: string[] } } | undefined)?.shortTermDebt?.tags ?? []).not.toContain("us-gaap/LongTermDebtMaturitiesRepaymentsOfPrincipalInNextTwelveMonths");
  });

  it("META: Stage B's debt admission keeps the total", () => {
    const row = quarter(build("META"), "2026-06-30");
    const admitted = admitDebtFields(row as never, fixture.issuers.META.facts as unknown as CompanyFacts, "USD", `${fixture.asOf}T00:00:00.000Z`).row as unknown as Row;
    near(admitted.totalDebt, row.totalDebt as number);
    expect(admitted.shortTermDebt).toBe(0);
  });

  it("refuses the next-twelve-months bucket beside any tagged remainder-of-year bucket, zero included", () => {
    expect(fiscalMaturityScopeReason(2.75e9, 0)).toMatch(/remainder-of-fiscal-year/);
    expect(fiscalMaturityScopeReason(2.75e9, null)).toBeNull();
  });
});

describe("principal aggregate within the discount band (audit 2026-10-22 B-5)", () => {
  // Meta's 2024 balance sheets carried no current debt and tagged the notes'
  // principal (DebtInstrumentCarryingAmount 29.000B) beside 28.826B of carrying
  // debt: the 174M gap is the unamortized discount, and total debt was withheld.
  const withAggregate = (principal: number) => quarter(build("META", (gaap) => {
    const at = gaap.LongTermDebtNoncurrent!.units.USD!.find((p) => p.end === "2025-09-30")!;
    gaap.DebtInstrumentCarryingAmount!.units.USD!.push({ ...at, val: principal });
  }), "2025-09-30");

  it("META: admits the carrying components when principal exceeds them by 0.6%", () => {
    const row = withAggregate(29 * B);
    near(row.longTermDebt, 28.834 * B);
    expect(row.totalDebt).not.toBeNull();
    expect(row.fieldConflicts?.totalDebt).toBeUndefined();
  });

  it("META: still withholds when the aggregate is beyond the band, naming both figures", () => {
    const row = withAggregate(30 * B);
    expect(row.totalDebt).toBeNull();
    expect(row.fieldConflicts?.totalDebt?.reason).toMatch(/DebtInstrumentCarryingAmount 30000000000 exceeds the resolved financing components 28834000000/);
  });
});
