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

  it("supplements the standard long consolidated-profit alias and preserves its selected source tag", () => {
    const tag = "NetIncomeLossIncludingPortionAttributableToNonredeemableNoncontrollingInterest";
    const filed = facts([]);
    filed.facts["us-gaap"]![tag] = { units: { USD: [{ ...FY2025, val: 875 }] } };
    const vendor = env([{ date: "2025-12-31", reportedCurrency: "USD", netIncome: 878 }]);
    const out = supplementCommonEarnings(vendor, env([{ date: "2025-12-31", minorityInterest: 1262 }]), filed, "2026-10-14");
    expect(rowsOf(out.income)[0]).toMatchObject({ netIncome: 878, netIncomeConsolidated: 875,
      fieldProvenance: { netIncomeConsolidated: { tags: [`us-gaap/${tag}`] } } });
  });

  it("supplements consolidated and signed NCI earnings even when common earnings already exist", () => {
    const filed = facts([]);
    filed.facts["us-gaap"]!.ProfitLoss = { units: { USD: [{ ...FY2025, val: 875 }] } };
    filed.facts["us-gaap"]!.NetIncomeLossAttributableToNoncontrollingInterest = { units: { USD: [{ ...FY2025, val: -3 }] } };
    const vendor = env([{ date: "2025-12-31", reportedCurrency: "USD", netIncome: 878, netIncomeAvailableToCommon: 878 }]);
    const out = supplementCommonEarnings(vendor, env([{ date: "2025-12-31", minorityInterest: -50 }]), filed, "2026-10-14", "2026-04-01T12:00:00.000Z");
    expect(rowsOf(out.income)[0]).toMatchObject({ netIncome: 878, netIncomeAvailableToCommon: 878, netIncomeConsolidated: 875,
      netIncomeAttributableToNoncontrollingInterest: -3, fieldProvenance: { netIncomeConsolidated: { tags: ["us-gaap/ProfitLoss"], observedAt: "2026-04-01T12:00:00.000Z" } } });
    expect(out.gaps).toHaveLength(2);
  });

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

/**
 * D-251 (P5): preferred stock redeemed during a fiscal year is absent from that year's closing balance, so the closing
 * balance alone never asked for the filed common earnings, while the earnings selector refused total net income for the
 * year because preferred claims existed in it. The caller passes the selector's own existence test.
 * Progressive's figures are the SEC XBRL facts of 10-K 0000080661-26-000086 (fiscal 2025, filed 2026-03-02) and
 * 10-K 0000080661-25-000007 (fiscal 2024, filed 2025-03-03); its Series B preferred was redeemed in the first quarter of 2024.
 */
describe("D-251: filed common earnings for a year whose preferred stock was redeemed before its end", () => {
  const PGR_2025 = { accn: "0000080661-26-000086", form: "10-K", fp: "FY", filed: "2026-03-02" };
  const PGR_2024 = { accn: "0000080661-25-000007", form: "10-K", fp: "FY", filed: "2025-03-03" };
  const pgrFacts = (): CompanyFacts => ({ cik: 80661, entityName: "PROGRESSIVE CORP/OH/", facts: { "us-gaap": { [TAG]: { units: { USD: [
    { start: "2025-01-01", end: "2025-12-31", val: 11_308_000_000, ...PGR_2025 },
    { start: "2024-01-01", end: "2024-12-31", val: 8_463_000_000, ...PGR_2025 },
    { start: "2024-01-01", end: "2024-12-31", val: 8_463_000_000, ...PGR_2024 },
    { start: "2023-01-01", end: "2023-12-31", val: 3_865_000_000, ...PGR_2025 },
  ] } } } } });
  const pgrIncome = () => env([
    { date: "2025-12-31", reportedCurrency: "USD", netIncome: 11_308_000_000 },
    { date: "2024-12-31", reportedCurrency: "USD", netIncome: 8_480_000_000 },
    { date: "2023-12-31", reportedCurrency: "USD", netIncome: 3_902_400_000, netIncomeAvailableToCommon: 3_864_800_000 },
  ]);
  // Closing balances: the preferred is gone at the end of 2024 and 2025.
  const pgrBalance = env([
    { date: "2025-12-31", preferredStock: 0, minorityInterest: 0 },
    { date: "2024-12-31", preferredStock: 0, minorityInterest: 0 },
    { date: "2023-12-31", preferredStock: 494_000_000, minorityInterest: 0 },
  ]);
  const claimsIn = (...years: string[]) => (row: { date?: string }) => years.includes(String(row.date));

  it("root cause: the closing balance alone never reads the filed figure for the redemption year", () => {
    const income = pgrIncome();
    const out = supplementCommonEarnings(income, pgrBalance, pgrFacts(), "2026-11-12");
    expect(out.income).toBe(income);
    expect(out.gaps).toEqual([]);
  });

  it("Progressive: fiscal 2025 and 2024 take the filed income available to common, each from the newest 10-K", () => {
    const out = supplementCommonEarnings(pgrIncome(), pgrBalance, pgrFacts(), "2026-11-12", "2026-11-12T18:18:20.407Z", claimsIn("2025-12-31", "2024-12-31"));
    const rows = rowsOf(out.income);
    expect(rows[0]).toMatchObject({ netIncome: 11_308_000_000, netIncomeAvailableToCommon: 11_308_000_000, fieldProvenance: { netIncomeAvailableToCommon: {
      source: "edgar", unit: "USD", periodStart: "2025-01-01", periodEnd: "2025-12-31", tags: [`us-gaap/${TAG}`], observedAt: "2026-11-12T18:18:20.407Z",
      filings: [{ accn: "0000080661-26-000086", filed: "2026-03-02", form: "10-K" }] } } });
    // 8,480M net income less the 17M the 10-K attributes to the preferred (dividends and the redemption).
    expect(rows[1]).toMatchObject({ netIncome: 8_480_000_000, netIncomeAvailableToCommon: 8_463_000_000, fieldProvenance: { netIncomeAvailableToCommon: {
      periodStart: "2024-01-01", periodEnd: "2024-12-31", filings: [{ accn: "0000080661-26-000086", filed: "2026-03-02", form: "10-K" }] } } });
    // The vendor's own 2023 figure is never overridden.
    expect(rows[2]).toMatchObject({ netIncomeAvailableToCommon: 3_864_800_000 });
    expect(out.gaps).toHaveLength(1);
    expect(out.gaps[0]).toMatchObject({ field: "statements.incomeAnnual.netIncomeAvailableToCommon.redeemedPreferred", severity: "info", expected: true });
    expect(out.gaps[0]!.reason).toMatch(/preferred stock or preferred dividends on record in its earnings window .* and none at its end/);
    expect(out.gaps[0]!.reason).toContain("2025-12-31 (0000080661-26-000086 filed 2026-03-02)");
    expect(out.gaps[0]!.reason).toContain("2024-12-31 (0000080661-26-000086 filed 2026-03-02)");
  });

  it("compatible control: a year with no preferred claim in it is left alone", () => {
    const income = pgrIncome();
    const out = supplementCommonEarnings(income, pgrBalance, pgrFacts(), "2026-11-12", undefined, claimsIn("2024-12-31"));
    expect(rowsOf(out.income)[0]!.netIncomeAvailableToCommon).toBeUndefined();
    expect(rowsOf(out.income)[1]!.netIncomeAvailableToCommon).toBe(8_463_000_000);
    const none = supplementCommonEarnings(income, pgrBalance, pgrFacts(), "2026-11-12", undefined, claimsIn());
    expect(none.income).toBe(income);
  });

  it("fills only the common earnings for such a year, never the consolidated or noncontrolling lines", () => {
    const filed = pgrFacts();
    filed.facts["us-gaap"]!.ProfitLoss = { units: { USD: [{ start: "2025-01-01", end: "2025-12-31", val: 11_308_000_000, ...PGR_2025 }] } };
    filed.facts["us-gaap"]!.NetIncomeLossAttributableToNoncontrollingInterest = { units: { USD: [{ start: "2025-01-01", end: "2025-12-31", val: 0, ...PGR_2025 }] } };
    const row = rowsOf(supplementCommonEarnings(pgrIncome(), pgrBalance, filed, "2026-11-12", undefined, claimsIn("2025-12-31")).income)[0]!;
    expect(row.netIncomeAvailableToCommon).toBe(11_308_000_000);
    expect(row.netIncomeConsolidated).toBeUndefined();
    expect(row.netIncomeAttributableToNoncontrollingInterest).toBeUndefined();
  });

  it("a refused common-earnings field stays refused, and a fact filed after the cutoff is not read", () => {
    const refused = env([{ date: "2025-12-31", reportedCurrency: "USD", netIncome: 11_308_000_000,
      fieldConflicts: { netIncomeAvailableToCommon: { usable: false, vendorValue: null, secValue: null, reason: "refused" } } }]);
    expect(supplementCommonEarnings(refused, pgrBalance, pgrFacts(), "2026-11-12", undefined, claimsIn("2025-12-31")).income).toBe(refused);
    const income = pgrIncome();
    const early = supplementCommonEarnings(income, pgrBalance, pgrFacts(), "2026-03-01", undefined, claimsIn("2025-12-31"));
    expect(early.income).toBe(income);
  });

  it("a refused field stays refused when a claim stands at the year end too (P11): no earnings line is refilled over its refusal", () => {
    // The Stage B view runs after the income classification may have refused the earnings family.
    const refusal = { usable: false, vendorValue: null, secValue: null, reason: "refused" };
    const refused = env([{ date: "2025-12-31", reportedCurrency: "USD", netIncome: 57_048_000_000,
      fieldConflicts: { netIncomeAvailableToCommon: refusal, netIncomeConsolidated: refusal, netIncomeAttributableToNoncontrollingInterest: refusal } }]);
    const balance = env([{ date: "2025-12-31", preferredStock: 20_045_000_000, minorityInterest: 1_000_000 }]);
    const filed = facts([FY2025]);
    filed.facts["us-gaap"]!.ProfitLoss = { units: { USD: [{ ...FY2025, val: 57_100_000_000 }] } };
    const out = supplementCommonEarnings(refused, balance, filed, "2026-10-14", undefined, () => true);
    expect(out.income).toBe(refused);
    expect(out.gaps).toEqual([]);
    // One refused field does not stop another that is not refused.
    const partly = env([{ date: "2025-12-31", reportedCurrency: "USD", netIncome: 57_048_000_000, fieldConflicts: { netIncomeConsolidated: refusal } }]);
    const row = rowsOf(supplementCommonEarnings(partly, balance, filed, "2026-10-14").income)[0]!;
    expect(row.netIncomeConsolidated).toBeUndefined();
    expect(typeof row.netIncomeAvailableToCommon).toBe("number");
  });

  it("unrelated shape: a bank with preferred outstanding at the year end is read exactly as before", () => {
    const income = env([{ date: "2025-12-31", netIncome: 57_048_000_000 }]);
    const balance = env([{ date: "2025-12-31", preferredStock: 20_045_000_000 }]);
    const before = supplementCommonEarnings(income, balance, facts([FY2025]), "2026-10-14");
    const after = supplementCommonEarnings(income, balance, facts([FY2025]), "2026-10-14", undefined, () => true);
    expect(after).toEqual(before);
    expect(after.gaps).toHaveLength(1);
    expect(after.gaps[0]!.reason).toMatch(/beside outstanding preferred stock or noncontrolling interests/);
  });
});
