/**
 * Audit item 15 (FCX-9) with AMZN audit 2026-10-20 finding 5: a one-off
 * inside operating income set the DCF's margin for every year. FCX's TTM to
 * June 2026 held a $699m insurance settlement gain (us-gaap/InsuredEventGainLoss,
 * public 10-Q facts); impairment charges are removed the same way, in the
 * other direction.
 */
import { describe, expect, it } from "vitest";

import { unusualOperatingItemsTtm } from "@/pipeline/stageB/unusualItems";
import { buildDcfAssumptions, type DcfAssumptionInputs } from "@/pipeline/stageB/valuation";
import type { CompanyFacts } from "@/edgar/xbrl";

const M = 1e6;
const point = (start: string, end: string, val: number, form = "10-Q", filed = "2026-08-01") =>
  ({ start, end, val, accn: `0000831259-${end}`, fy: Number(end.slice(0, 4)), fp: "Q2", form, filed });
const facts = (concepts: Record<string, ReturnType<typeof point>[]>): CompanyFacts =>
  ({ cik: 831259, entityName: "Test", facts: { "us-gaap": Object.fromEntries(Object.entries(concepts).map(([tag, pts]) => [tag, { units: { USD: pts } }])) } }) as unknown as CompanyFacts;

describe("tagged one-off items in the TTM operating income", () => {
  const fcx = facts({
    InsuredEventGainLoss: [
      point("2025-01-01", "2025-06-30", 0, "10-Q", "2025-08-01"),
      point("2026-01-01", "2026-03-31", 699 * M, "10-Q", "2026-05-01"),
      point("2026-01-01", "2026-06-30", 699 * M),
      point("2026-04-01", "2026-06-30", 0),
    ],
    AssetImpairmentCharges: [point("2025-01-01", "2025-12-31", 73 * M, "10-K", "2026-02-10")],
  });

  it("sums each tag over the TTM as fiscal year + year to date − prior year to date, gains positive and charges negative", () => {
    const placed = facts({
      InsuredEventGainLoss: [
        point("2025-01-01", "2025-06-30", 0, "10-Q", "2025-08-01"),
        point("2026-01-01", "2026-06-30", 699 * M),
      ],
      AssetImpairmentCharges: [
        point("2025-01-01", "2025-06-30", 20 * M, "10-Q", "2025-08-01"),
        point("2025-01-01", "2025-12-31", 73 * M, "10-K", "2026-02-10"),
      ],
    });
    const items = unusualOperatingItemsTtm(placed, { ttmEnd: "2026-06-30", fiscalYearEnd: "2025-12-31", unit: "USD", observedAt: "2026-10-19T00:00:00Z" })!;
    // Impairment: 73 (FY2025) + 0 (untagged H1 2026) − 20 (H1 2025) = 53 inside the window.
    expect(items.components).toEqual([
      { tag: "InsuredEventGainLoss", value: 699 * M },
      { tag: "AssetImpairmentCharges", value: -53 * M },
    ]);
    expect(items.value).toBe(646 * M);
    expect(items.withheld).toEqual([]);
    expect(items.basis).toMatch(/InsuredEventGainLoss/);
  });

  // Codex review of PR #41: an annual amount with no filed prior year to date
  // can't be split at the window's start, so none of it is removed.
  it("withholds a tag whose fiscal-year amount the filings don't split at the window's start", () => {
    const items = unusualOperatingItemsTtm(fcx, { ttmEnd: "2026-06-30", fiscalYearEnd: "2025-12-31", unit: "USD", observedAt: "2026-10-19T00:00:00Z" })!;
    expect(items.components).toEqual([{ tag: "InsuredEventGainLoss", value: 699 * M }]);
    expect(items.value).toBe(699 * M);
    expect(items.withheld).toEqual([{ tag: "AssetImpairmentCharges", reason: expect.stringMatching(/2025-01-01 to 2025-06-30/) }]);
    expect(items.basis).toMatch(/not removed: us-gaap\/AssetImpairmentCharges/);
  });

  it("withholds a tag whose prior year to date is filed but whose fiscal year is not", () => {
    const items = unusualOperatingItemsTtm(facts({
      InsuredEventGainLoss: [point("2025-01-01", "2025-06-30", 40 * M, "10-Q", "2025-08-01"), point("2026-01-01", "2026-06-30", 10 * M)],
    }), { ttmEnd: "2026-06-30", fiscalYearEnd: "2025-12-31", unit: "USD", observedAt: "2026-10-19T00:00:00Z" })!;
    expect(items.components).toEqual([]);
    expect(items.value).toBe(0);
    expect(items.withheld.map((w) => w.tag)).toEqual(["InsuredEventGainLoss"]);
  });

  it("withholds an impairment total without falling back to its components", () => {
    const items = unusualOperatingItemsTtm(facts({
      AssetImpairmentCharges: [point("2025-01-01", "2025-12-31", 73 * M, "10-K", "2026-02-10")],
      GoodwillImpairmentLoss: [point("2026-01-01", "2026-06-30", 9 * M)],
    }), { ttmEnd: "2026-06-30", fiscalYearEnd: "2025-12-31", unit: "USD", observedAt: "2026-10-19T00:00:00Z" })!;
    expect(items.components).toEqual([]);
    expect(items.withheld.map((w) => w.tag)).toEqual(["AssetImpairmentCharges"]);
  });

  it("takes the fiscal-year fact when the TTM ends on the fiscal year, and ignores facts filed after the build", () => {
    const annual = unusualOperatingItemsTtm(fcx, { ttmEnd: "2025-12-31", fiscalYearEnd: "2025-12-31", unit: "USD", observedAt: "2026-10-19T00:00:00Z" })!;
    expect(annual.value).toBe(-73 * M);
    expect(unusualOperatingItemsTtm(fcx, { ttmEnd: "2026-06-30", fiscalYearEnd: "2025-12-31", unit: "USD", observedAt: "2026-02-01T00:00:00Z" })).toBeNull();
  });

  it("reports nothing when no tagged item falls inside the window", () => {
    expect(unusualOperatingItemsTtm(facts({ InsuredEventGainLoss: [point("2023-01-01", "2023-12-31", 5 * M, "10-K", "2024-02-01")] }),
      { ttmEnd: "2026-06-30", fiscalYearEnd: "2025-12-31", unit: "USD", observedAt: "2026-10-19T00:00:00Z" })).toBeNull();
  });

  it("seeds the DCF margin from operating income without the one-offs and says so", () => {
    const base: DcfAssumptionInputs = {
      revenueCagr3yPct: 5, revenueCagr5yPct: 5, revenueLogLinear: null, analystEstimates: null, waccPct: 9, riskFreePct: 4,
      incomeTtm: { date: "2026-06-30", basis: "ttm", revenue: 25868 * M, operatingIncome: 6923 * M, incomeBeforeTax: 6500 * M, incomeTaxExpense: 2400 * M },
      incomeHistory: [],
      balance: { date: "2026-06-30", basis: "quarter", totalDebt: 9000 * M, totalStockholdersEquity: 30000 * M, cashAndShortTermInvestments: 4000 * M },
      marketCap: 60000 * M, domicileCountry: "US",
    } as DcfAssumptionInputs;
    const plain = buildDcfAssumptions(base);
    expect(plain.assumptions!.ebitMarginPath.value[0]).toBeCloseTo(26.763, 3);
    const normalized = buildDcfAssumptions({ ...base, unusualOperatingItems: { value: 699 * M, components: [{ tag: "InsuredEventGainLoss", value: 699 * M }], withheld: [], basis: "us-gaap/InsuredEventGainLoss 699m" } });
    // (6,923 − 699) / 25,868 = 24.06%
    expect(normalized.assumptions!.ebitMarginPath.value[0]).toBeCloseTo(24.061, 3);
    expect(normalized.assumptions!.ebitMarginPath.basis).toMatch(/excluding tagged one-off items/);
    expect(normalized.notes.some((n) => /one-off items .*InsuredEventGainLoss/.test(n))).toBe(true);
    const withheldOnly = buildDcfAssumptions({ ...base, unusualOperatingItems: { value: 0, components: [], withheld: [{ tag: "AssetImpairmentCharges", reason: "no filed amount for 2025-01-01 to 2025-06-30" }], basis: "not removed: us-gaap/AssetImpairmentCharges" } });
    expect(withheldOnly.assumptions!.ebitMarginPath.value[0]).toBeCloseTo(26.763, 3);
    expect(withheldOnly.notes.some((n) => /keeps tagged one-off items .*AssetImpairmentCharges/.test(n))).toBe(true);
  });
});
