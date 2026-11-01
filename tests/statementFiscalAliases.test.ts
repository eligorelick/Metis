import { describe, expect, it } from "vitest";
import { compatibleFiscalAlias, normalizeQuarterRows } from "@/pipeline/stageB/quarterWindows";

const vendor = { date: "2020-09-30", cik: "0000804328", reportedCurrency: "USD", calendarYear: "2020", period: "Q4",
  filingDate: "2020-11-05", acceptedDate: "2020-11-05 15:00:00", revenue: 8346,
  finalLink: "https://www.sec.gov/Archives/edgar/data/804328/000080432820000085/qcom-20200927.htm" };
const sec = { ...vendor, date: "2020-09-27", acceptedDate: "2020-11-05 16:00:00" };

describe("source-compatible fiscal period aliases", () => {
  it("collapses a three-day calendar alias using recency without changing either input", () => {
    const before = JSON.stringify([vendor, sec]);
    expect(compatibleFiscalAlias(vendor, sec)).toBe(true);
    for (const input of [[vendor, sec], [sec, vendor]]) expect(normalizeQuarterRows(input).rows).toEqual([sec]);
    expect(JSON.stringify([vendor, sec])).toBe(before);
  });
  it.each([
    { cik: undefined }, { cik: "999" }, { reportedCurrency: "EUR" }, { reportedCurrency: undefined },
    { calendarYear: "2019" }, { calendarYear: undefined }, { period: "Q3" }, { period: undefined },
    { date: "2020-09-26" }, { filingDate: "2020-11-06" }, { acceptedDate: "invalid" },
    { finalLink: "https://www.sec.gov/Archives/edgar/data/804328/000080432820000099/qcom.htm" },
    { periodStart: "2020-07-02" },
  ])("does not combine incompatible or missing scope %j", change => {
    const left = { ...vendor, periodStart: "2020-07-01" };
    expect(compatibleFiscalAlias(left, { ...sec, periodStart: "2020-07-01", ...change })).toBe(false);
  });
  it("rejects tied alias recency instead of arbitrarily preferring the SEC row", () => {
    const result = normalizeQuarterRows([{ ...vendor, acceptedDate: undefined }, { ...sec, acceptedDate: undefined }]);
    expect(result.rows).toEqual([]);
    expect(result.rejected[0]?.reason).toMatch(/ambiguous/);
  });
  it("keeps a genuinely later restatement even when an older copy establishes the alias", () => {
    const restated = { ...vendor, filingDate: "2021-01-20", acceptedDate: "2021-01-20 16:00:00", revenue: 9000,
      finalLink: "https://www.sec.gov/Archives/edgar/data/804328/000080432821000009/qcom.htm" };
    for (const input of [[restated, vendor, sec], [sec, restated, vendor], [vendor, sec, restated]]) {
      expect(normalizeQuarterRows(input).rows).toEqual([restated]);
    }
  });
  it("supports annual aliases with the same scoped metadata", () => {
    expect(compatibleFiscalAlias({ ...vendor, period: "FY" }, { ...sec, period: "FY" })).toBe(true);
  });
  it("withholds alias ordering when SEC values were restated after their first-reported row dates", () => {
    const january = { ...sec, acceptedDate: "2020-11-05", revenue: 9000,
      fieldProvenance: { revenue: { filings: [{ filed: "2021-01-20" }] } } };
    const december = { ...vendor, acceptedDate: "2020-12-15 16:00:00", filingDate: "2020-12-15", revenue: 8600 };
    for (const rows of [[vendor, january, december], [december, january, vendor]]) {
      const normalized = normalizeQuarterRows(rows);
      expect(normalized.rows).toEqual([]);
      expect(normalized.rejected[0]?.reason).toMatch(/value.*source|restat/i);
    }
  });
  it.each([{ cik: "999" }, { reportedCurrency: "EUR" }, { calendarYear: "2019" }, { period: "Q3" }])("does not import an incompatible exact-date candidate through a compatible older alias: %j", scope => {
    const other = { ...vendor, ...scope, acceptedDate: "2021-01-20 16:00:00", filingDate: "2021-01-20" };
    for (const rows of [[vendor, sec, other], [other, sec, vendor]]) {
      const normalized = normalizeQuarterRows(rows);
      expect(normalized.rows).toEqual([]);
      expect(normalized.rejected[0]?.reason).toMatch(/scope|issuer|currency/);
    }
  });
  it("does not build chains beyond the three-day window", () => {
    const rows = [27, 29, 30].map((day, i) => ({ ...vendor, date: `2020-09-${day}`, acceptedDate: `2020-11-05 1${i}:00:00` }));
    const outside = { ...vendor, date: "2020-10-01", acceptedDate: "2020-11-05 16:00:00" };
    for (const input of [[...rows, outside], [outside, ...rows.toReversed()]]) {
      expect(normalizeQuarterRows(input).rows.map(row => row.date)).toEqual(["2020-10-01", "2020-09-30"]);
    }
  });
});
