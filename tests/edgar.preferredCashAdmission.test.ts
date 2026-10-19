import { describe, expect, it } from "vitest";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { CompanyFacts } from "@/edgar/xbrl";

const START = "2025-01-01";
const END = "2025-12-31";
const K = { accn: "0000000001-26-000001", filed: "2026-02-20", form: "10-K", fy: 2025, fp: "FY" };
const annual = (val: number) => [{ ...K, start: START, end: END, val }];
const instant = (val: number, end = END) => [{ ...K, end, val }];
type Points = ReturnType<typeof annual> | ReturnType<typeof instant>;
const PREFERRED_TAGS = ["PreferredStockIncludingAdditionalPaidInCapitalNetOfDiscount", "PreferredStockIncludingAdditionalPaidInCapital", "PreferredStockValue"];

function build(extra: Record<string, Points> = {}, units: Record<string, string> = {}, quarterlyPeriods = 0) {
  const tags = {
    NetCashProvidedByUsedInOperatingActivities: annual(400), PaymentsOfDividends: annual(20),
    Assets: instant(900), ...extra,
  };
  const facts: CompanyFacts = { cik: 1, entityName: "Synthetic preferred issuer", facts: { "us-gaap":
    Object.fromEntries(Object.entries(tags).map(([tag, points]) => [tag, { units: { [units[tag] ?? "USD"]: points } }])),
  } };
  return buildStatementsFromCompanyFacts(facts, { symbol: "SYN", cik: "1", annualPeriods: 3, quarterlyPeriods,
    asOf: "2026-09-30", factsObservedAt: "2026-09-30T00:00:00Z",
    vendorSplits: { status: "retrieved", source: "test:vendor", events: [], coverage: [{ from: "2020-01-01", to: "2026-09-30" }] },
  });
}

function expectWithheld(result: ReturnType<typeof build>) {
  const row = result.cashflowAnnual.rows[0]!;
  expect(row.commonDividendsPaid).toBeNull();
  expect(row.netDividendsPaid).toBe(-20);
  expect(row.fieldProvenance?.commonDividendsPaid).toBeUndefined();
  expect(row.fieldProvenance?.netDividendsPaid?.tags).toEqual(["us-gaap/PaymentsOfDividends"]);
  expect(result.cashflowAnnual.withheld).toEqual(expect.arrayContaining([expect.objectContaining({ field: "commonDividendsPaid" })]));
}

describe("preferred cash dividend admission (D-42)", () => {
  it.each(PREFERRED_TAGS)("withholds aggregate common cash when %s is positive", (tag) => {
    expectWithheld(build({ [tag]: instant(100), PreferredStockDividendsAndOtherAdjustments: annual(8) }));
  });
  it.each(PREFERRED_TAGS.slice(0, 2))("positive %s cannot be hidden by a zero par tag", (tag) => {
    expectWithheld(build({ [tag]: instant(100), PreferredStockValue: instant(0) }));
  });
  it.each(["2024-12-31", "2025-06-30"])("closing zero does not erase preferred holdings at %s", (end) => {
    expectWithheld(build({ PreferredStockValue: [...instant(100, end), ...instant(0)] }));
  });
  it.each([0, 12])("preserves explicitly sourced common cash %s", (common) => {
    const result = build({ PreferredStockIncludingAdditionalPaidInCapital: instant(100), PaymentsOfDividendsCommonStock: annual(common) });
    expect(result.cashflowAnnual.rows[0]?.commonDividendsPaid).toBe(common === 0 ? 0 : -common);
    expect(result.cashflowAnnual.rows[0]?.fieldProvenance?.commonDividendsPaid?.tags).toEqual(["us-gaap/PaymentsOfDividendsCommonStock"]);
  });
  it("preserves compatible cash-only total less preferred with both source tags", () => {
    const result = build({ PreferredStockIncludingAdditionalPaidInCapital: instant(100), PaymentsOfDividendsPreferredStockAndPreferenceStock: annual(8) });
    expect(result.cashflowAnnual.rows[0]).toMatchObject({ commonDividendsPaid: -12, preferredDividendsPaid: -8 });
    expect(result.cashflowAnnual.rows[0]?.fieldProvenance?.commonDividendsPaid?.tags).toEqual([
      "us-gaap/PaymentsOfDividendsPreferredStockAndPreferenceStock", "us-gaap/PaymentsOfDividends",
    ]);
  });
  it.each([21, -8])("withholds contradictory preferred cash %s rather than clamping", (preferred) => {
    expectWithheld(build({ PaymentsOfDividendsPreferredStockAndPreferenceStock: annual(preferred) }));
  });
  it("withholds a mismatched cash period instead of falling through to aggregate common", () => {
    expectWithheld(build({ PaymentsOfDividendsPreferredStockAndPreferenceStock: [{ ...annual(8)[0]!, start: "2025-01-02" }] }));
  });
  it("an overlapping cash period ending after the payout window cannot re-admit aggregate common", () => {
    expectWithheld(build({ PaymentsOfDividendsPreferredStockAndPreferenceStock: [{ ...annual(8)[0]!, end: "2026-01-01" }] }));
  });
  it("withholds a foreign-currency cash component instead of falling through to aggregate common", () => {
    expectWithheld(build({ PaymentsOfDividendsPreferredStockAndPreferenceStock: annual(8) }, { PaymentsOfDividendsPreferredStockAndPreferenceStock: "CAD" }));
  });
  it("future preferred cash does not repair a known preferred issuer's aggregate", () => {
    const result = build({ PreferredStockIncludingAdditionalPaidInCapital: instant(100),
      PaymentsOfDividendsPreferredStockAndPreferenceStock: [{ ...annual(8)[0]!, filed: "2026-10-01" }] });
    expectWithheld(result);
    expect(result.factExclusions).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "future_filing" })]));
  });
  it("declared cash-settled common dividends do not establish cash paid", () => {
    expectWithheld(build({ PreferredStockIncludingAdditionalPaidInCapital: instant(100), DividendsCommonStockCash: annual(12) }));
  });
  it("preserves the ordinary aggregate fallback with no preferred evidence", () => {
    expect(build().cashflowAnnual.rows[0]?.commonDividendsPaid).toBe(-20);
  });
  it("does not use future or stale preferred holdings to reject an otherwise supported fallback", () => {
    expect(build({ PreferredStockValue: [{ ...instant(100)[0]!, filed: "2026-10-01" }] }).cashflowAnnual.rows[0]?.commonDividendsPaid).toBe(-20);
    expect(build({ PreferredStockValue: instant(100, "2023-12-31") }).cashflowAnnual.rows[0]?.commonDividendsPaid).toBe(-20);
  });
  it("a redemption before the current window does not block aggregate cash forever", () => {
    expect(build({ PreferredStockValue: [...instant(100, "2024-06-30"), ...instant(0, "2024-12-31"), ...instant(0)],
      PaymentsOfDividendsPreferredStockAndPreferenceStock: [{ ...annual(8)[0]!, start: "2024-01-01", end: "2024-12-31" }],
    }).cashflowAnnual.rows[0]?.commonDividendsPaid).toBe(-20);
  });
  it("positive preferred carrying evidence in another currency still establishes issuer exposure", () => {
    expectWithheld(build({ PreferredStockValue: instant(100) }, { PreferredStockValue: "CAD" }));
  });
  it("future preferred periods are excluded before exposure detection", () => {
    const result = build({ PreferredStockValue: instant(100, "2026-12-31") });
    expect(result.cashflowAnnual.rows[0]?.commonDividendsPaid).toBe(-20);
    expect(result.factExclusions).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "future_period" })]));
  });
  it("preserves direct common cash zero even beside contradictory components", () => {
    const result = build({ PaymentsOfDividendsCommonStock: annual(0), PaymentsOfDividendsPreferredStockAndPreferenceStock: annual(21) });
    expect(result.cashflowAnnual.rows[0]?.commonDividendsPaid).toBe(0);
  });
  it("preserves zero aggregate cash beside preferred holdings when no cash component contradicts it", () => {
    const result = build({ PaymentsOfDividends: annual(0), PreferredStockIncludingAdditionalPaidInCapital: instant(100) });
    expect(result.cashflowAnnual.rows[0]).toMatchObject({ commonDividendsPaid: 0, netDividendsPaid: 0 });
    expect(result.cashflowAnnual.rows[0]?.fieldProvenance?.commonDividendsPaid?.tags).toEqual(["us-gaap/PaymentsOfDividends"]);
  });
  it.each(["positive", "negative", "period", "currency"])("zero aggregate does not bypass %s preferred cash evidence", (mode) => {
    const result = build({ PaymentsOfDividends: annual(0), PreferredStockIncludingAdditionalPaidInCapital: instant(100),
      PaymentsOfDividendsPreferredStockAndPreferenceStock: [{ ...annual(mode === "negative" ? -8 : 8)[0]!,
        ...(mode === "period" ? { start: "2025-01-02" } : {}) }],
    }, mode === "currency" ? { PaymentsOfDividendsPreferredStockAndPreferenceStock: "CAD" } : {});
    expect(result.cashflowAnnual.rows[0]).toMatchObject({ commonDividendsPaid: null, netDividendsPaid: 0 });
    expect(result.cashflowAnnual.rows[0]?.fieldProvenance?.commonDividendsPaid).toBeUndefined();
  });
  it("rejects an inflow-signed total in a cash derivation and retains the raw total", () => {
    const result = build({ PaymentsOfDividends: annual(-20), PaymentsOfDividendsPreferredStockAndPreferenceStock: annual(8) });
    expect(result.cashflowAnnual.rows[0]).toMatchObject({ commonDividendsPaid: null, netDividendsPaid: 20 });
    expect(result.cashflowAnnual.rows[0]?.fieldProvenance?.commonDividendsPaid).toBeUndefined();
  });
  it("uses the actual derived quarter window when preferred is redeemed before quarter end", () => {
    const q = { ...K, fy: 2026, form: "10-Q", fp: "Q2", filed: "2026-08-01" };
    const result = build({
      Revenues: [...annual(800),
        { ...q, fp: "Q1", start: "2026-01-01", end: "2026-03-31", val: 200 },
        { ...q, start: "2026-01-01", end: "2026-06-30", val: 400 }],
      Assets: [...instant(900), { ...q, end: "2026-03-31", val: 900 }, { ...q, end: "2026-06-30", val: 900 }],
      NetCashProvidedByUsedInOperatingActivities: [...annual(400),
        { ...q, fp: "Q1", start: "2026-01-01", end: "2026-03-31", val: 50 },
        { ...q, start: "2026-01-01", end: "2026-06-30", val: 150 }],
      PaymentsOfDividends: [...annual(20),
        { ...q, fp: "Q1", start: "2026-01-01", end: "2026-03-31", val: 4 },
        { ...q, start: "2026-01-01", end: "2026-06-30", val: 10 }],
      PreferredStockValue: [{ ...q, end: "2026-03-31", val: 100 }, { ...q, end: "2026-06-30", val: 0 }],
    }, {}, 2);
    expect(result.cashflowQuarterly.rows[0]).toMatchObject({ date: "2026-06-30", commonDividendsPaid: null, netDividendsPaid: -6 });
    expect(result.cashflowQuarterly.rows[0]?.fieldProvenance?.netDividendsPaid?.periodStart).toBe("2026-04-01");
  });
});
