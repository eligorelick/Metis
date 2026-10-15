import { describe, expect, it } from "vitest";
import { filedCommonEarnings, supplementCommonEarnings } from "@/pipeline/commonEarnings";
import type { CompanyFacts } from "@/edgar/xbrl";

const TAG = "NetIncomeLossAvailableToCommonStockholdersBasic";

function facts(points: Array<Record<string, unknown>>): CompanyFacts {
  return { cik: 19617, entityName: "BANK", facts: { "us-gaap": { [TAG]: { units: { USD: points } } } } };
}

const FY2025 = { start: "2025-01-01", end: "2025-12-31", val: 55_681_000_000, form: "10-K", fp: "FY", filed: "2026-02-13", accn: "0000019617-26-000001" };

function env<T>(rows: T[]) {
  return { ok: true as const, value: { data: { rows, raw: {} }, asOf: "2026-02-13", source: "fmp", endpoint: "x", fetchedAt: "t", stale: false } } as never;
}
const rowsOf = (r: { ok: boolean; value?: { data: { rows: unknown[] } } }) => (r.value as { data: { rows: Array<Record<string, unknown>> } }).data.rows;

describe("filedCommonEarnings", () => {
  it('does not bridge different explicit vendor and filed starts, and retains matched source evidence',()=>{
    const balance=env([{date:'2025-12-31',minorityInterest:10}]);
    const mismatched=env([{date:'2025-12-31',periodStart:'2025-01-11',reportedCurrency:'USD'}]);
    expect(rowsOf(supplementCommonEarnings(mismatched,balance,facts([FY2025]),'2026-10-14').income)[0]?.netIncomeAvailableToCommon).toBeUndefined();
    const matched=env([{date:'2025-12-31',periodStart:'2025-01-01',reportedCurrency:'USD'}]);
    expect(rowsOf(supplementCommonEarnings(matched,balance,facts([FY2025]),'2026-10-14').income)[0]?.fieldProvenance).toMatchObject({netIncomeAvailableToCommon:{source:'edgar',unit:'USD',periodStart:'2025-01-01',periodEnd:'2025-12-31'}});
  });
  it("returns the newest-filed full-year 10-K fact ending on the date", () => {
    const f = facts([
      { ...FY2025, val: 1, filed: "2026-01-01" },
      FY2025,
    ]);
    expect(filedCommonEarnings(f, "2025-12-31")).toEqual({ value: 55_681_000_000, accn: "0000019617-26-000001", filed: "2026-02-13" });
  });

  it.each([
    ["a different period end", { ...FY2025, end: "2025-09-30", start: "2024-10-01" }, "2025-12-31"],
    ["a quarterly span", { ...FY2025, start: "2025-10-01" }, "2025-12-31"],
    ["a 10-Q", { ...FY2025, form: "10-Q" }, "2025-12-31"],
    ["a non-FY fiscal period", { ...FY2025, fp: "Q4" }, "2025-12-31"],
    ["a non-numeric value", { ...FY2025, val: "55681" }, "2025-12-31"],
  ])("ignores %s", (_label, point, date) => {
    expect(filedCommonEarnings(facts([point]), date)).toBeNull();
  });

  it("returns null when the concept is absent", () => {
    expect(filedCommonEarnings({ cik: 1, entityName: "X", facts: { "us-gaap": {} } }, "2025-12-31")).toBeNull();
  });

  it("selects only common earnings filed by the analysis cutoff", () => {
    const f = facts([FY2025, { ...FY2025, val: 99, filed: "2026-12-01" }]);
    expect(filedCommonEarnings(f, "2025-12-31", "2026-10-14")?.value).toBe(55_681_000_000);
    expect(filedCommonEarnings(f, "2025-12-31", "2026-01-01")).toBeNull();
  });
});

describe("supplementCommonEarnings", () => {
  const income = env([{ date: "2025-12-31", netIncome: 57_048_000_000 }]);
  const balance = env([{ date: "2025-12-31", preferredStock: 20_045_000_000 }]);

  it("keeps the source acquisition time and selected filing", () => {
    const observedAt = "2026-04-01T12:13:14.000Z";
    const out = supplementCommonEarnings(income, balance, facts([FY2025]), "2026-10-14", observedAt);
    expect(rowsOf(out.income)[0]?.fieldProvenance).toMatchObject({netIncomeAvailableToCommon: {
      observedAt, filings: [{accn: FY2025.accn, filed: FY2025.filed, form: FY2025.form}], tags: [`us-gaap/${TAG}`],
    }});
    const conflict = env([{date:"2025-12-31", fieldProvenance:{revenue:{periodStart:"2025-01-11"}}}]);
    expect(supplementCommonEarnings(conflict, balance, facts([FY2025])).income).toBe(conflict);
  });

  it("fills only the one field, from the filed fact, and discloses it", () => {
    const out = supplementCommonEarnings(income, balance, facts([FY2025]));
    const row = rowsOf(out.income as never)[0]!;
    expect(row).toMatchObject({ date: "2025-12-31", netIncome: 57_048_000_000, netIncomeAvailableToCommon: 55_681_000_000,
      fieldProvenance: { netIncomeAvailableToCommon: { source: "edgar", unit: "USD", periodStart: "2025-01-01", periodEnd: "2025-12-31", observedAt: "" } } });
    expect(out.gaps).toHaveLength(1);
    expect(out.gaps[0]).toMatchObject({ field: "statements.incomeAnnual.netIncomeAvailableToCommon", severity: "info" });
    expect(out.gaps[0]!.reason).toContain("2025-12-31");
  });

  it("does not supplement a common earnings fact filed after the analysis", () => {
    const out = supplementCommonEarnings(income, balance, facts([FY2025]), "2026-01-01");
    expect(out.income).toBe(income);
    expect(out.gaps).toEqual([]);
  });

  it("never overrides a vendor value", () => {
    const vendor = env([{ date: "2025-12-31", netIncome: 57_048_000_000, netIncomeAvailableToCommon: 1 }]);
    const out = supplementCommonEarnings(vendor, balance, facts([FY2025]));
    expect(rowsOf(out.income as never)[0]!.netIncomeAvailableToCommon).toBe(1);
    expect(out.gaps).toEqual([]);
  });

  it("does not fill a row reported in a currency other than the fact's USD", () => {
    const eur = env([{ date: "2025-12-31", netIncome: 1, reportedCurrency: "EUR" }]);
    const out = supplementCommonEarnings(eur, balance, facts([FY2025]));
    expect(out.income).toBe(eur);
    expect(out.gaps).toEqual([]);
  });

  it("leaves issuers without outstanding preferred stock alone", () => {
    const noPreferred = env([{ date: "2025-12-31", preferredStock: 0 }]);
    const out = supplementCommonEarnings(income, noPreferred, facts([FY2025]));
    expect(out.income).toBe(income);
    expect(out.gaps).toEqual([]);
  });

  it("supplements filed common earnings for known NCI even without preferred", () => {
    const nci = env([{ date: "2025-12-31", preferredStock: 0, minorityInterest: 50 }]);
    const out = supplementCommonEarnings(income, nci, facts([FY2025]));
    expect(rowsOf(out.income as never)[0]!.netIncomeAvailableToCommon).toBe(55_681_000_000);
    expect(out.gaps[0]!.reason).toMatch(/noncontrolling/i);
  });

  it("does nothing without companyfacts, a matching period, or a successful statement", () => {
    expect(supplementCommonEarnings(income, balance, null).income).toBe(income);
    expect(supplementCommonEarnings(income, balance, facts([{ ...FY2025, end: "2024-12-31", start: "2024-01-01" }])).income).toBe(income);
    const failed = { ok: false as const, gap: { field: "x", reason: "r", severity: "warn" as const } } as never;
    expect(supplementCommonEarnings(failed, balance, facts([FY2025])).income).toBe(failed);
  });
});
