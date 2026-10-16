/**
 * D-66: verifier false negatives in the NVDA final rerun. 65 numeric FACT
 * claims were "not matched" although nearly all were correct; the sentences
 * and records below are that run's, verbatim. Each correction keeps a
 * definition-changing word (GAAP, non-GAAP, a window) a requirement.
 */
import { describe, expect, it } from "vitest";
import { validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import type { TextExcerpt } from "@/pipeline/stageC/payload";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";
import type { SourcedClaim } from "@/report/schema";

const record = (over: Partial<NumericProvenanceRecord> & Pick<NumericProvenanceRecord, "id" | "label" | "value" | "unit">): NumericProvenanceRecord => ({
  kind: "computed", currency: null, period: null, asOf: "2026-10-16", origin: over.id, formulaVersion: null, displayPrecision: 4, ...over,
});
const check = (text: string, cited: NumericProvenanceRecord) => {
  const claim: SourcedClaim = { label: "FACT", text, source: cited.id, asOf: cited.asOf };
  return validateClaimNumericSupport(claim, { record: cited, excerpts: [], sourceId: cited.id, reportingCurrency: "USD", ignoreWords: ["NVIDIA Corporation", "NVDA"] }).status;
};

describe("D-66 record-backed prose", () => {
  it("reads a score's 0–100 scale as its unit and a 12M window label as no figure", () => {
    const score = record({ id: "computed.deterministic-aspect-scores.fundamentals-score", label: "fundamentals score", value: 95, unit: "score" });
    expect(check("The fundamentals score was 95 on the 0–100 scale.", score)).toBe("validated");
    expect(check("The fundamentals score was 95/100.", score)).toBe("validated");
    expect(check("The fundamentals score was 94 on the 0–100 scale.", score)).toBe("contradicted");
    const projected = record({ id: "computed.weighted-projections.revenue-weighted-12m-ending-2027-07-26", label: "revenue weighted 12M ending 2027-07-26",
      value: 551_813e6, unit: "currency", currency: "USD", period: "12M ending 2027-07-26" });
    expect(check("Weighted projected revenue for the 12M ending 2027-07-26 is USD 551.813 billion.", projected)).toBe("validated");
  });

  it("names a metric head by its synonym, a registry key by its words and a segment row without its axis", () => {
    expect(check("The quoted price was USD 217.23 per share.", record({ id: "payload.quote.price", label: "price", value: 217.23, unit: "currency-per-share", currency: "USD", asOf: "2026-10-15" })))
      .toBe("validated");
    expect(check("Current price to book was 22.86x.", record({ id: "computed.valuation.pricetobook-current", label: "priceToBook (current)", value: 22.8629, unit: "ratio" })))
      .toBe("validated");
    expect(check("Consensus estimated revenue for the period ending 2027-01-25 is USD 409.797 billion.",
      record({ id: "payload.estimates.est-revenue-2027-01-25", label: "est revenue 2027-01-25", value: 409_797e6, unit: "currency", currency: "USD", period: "2027-01-25" })))
      .toBe("validated");
    const segment = record({ id: "payload.segment-revenue.product-market-platform-data-center-revenue-quarter-ended-2026-07-26",
      label: "Product / market platform: Data Center revenue, quarter ended 2026-07-26", value: 89_023e6, unit: "currency", currency: "USD", period: "2026-07-26", asOf: "2026-07-26" });
    expect(check("Data Center revenue for the quarter ended 2026-07-26 was USD 89.023 billion.", segment)).toBe("validated");
    // The window the label names is still a requirement of a different window.
    expect(check("Data Center revenue for the year ended 2026-07-26 was USD 89.023 billion.", segment)).not.toBe("validated");
  });

  it("reads a quarter's year-over-year growth under its own quarter, and a sign written as a word", () => {
    const growth = record({ id: "computed.quarterly-trend.revenue-growth-year-over-year-quarter-ended-2026-07-26",
      label: "revenue growth year over year, quarter ended 2026-07-26", value: 105.8511, unit: "percent", period: "2026-07-26", asOf: "2026-07-26" });
    expect(check("Revenue growth year over year for the quarter ended 2026-07-26 was 105.85%.", growth)).toBe("validated");
    expect(check("Revenue growth quarter over quarter for the quarter ended 2026-07-26 was 105.85%.", growth)).not.toBe("validated");
    const netDebt = record({ id: "computed.current-capital.net-debt-excluding-operating-leases", label: "net debt excluding operating leases",
      value: -23_220e6, unit: "currency", currency: "USD", period: "2026-07-26", asOf: "2026-07-26" });
    expect(check("Net debt excluding operating leases as of 2026-07-26 was negative USD 23.220 billion.", netDebt)).toBe("validated");
    expect(check("Net debt excluding operating leases as of 2026-07-26 was USD 23.220 billion.", netDebt)).toBe("contradicted");
  });

  it("keeps definition-changing words: GAAP, non-GAAP and the record's own scope", () => {
    const guided = record({ id: "payload.issuer-filings.q3-fy2027-gross-margin-gaap-guidance-midpoint", label: "Q3 FY2027 gross margin (GAAP) guidance midpoint",
      value: 74, unit: "percent", period: "Q3 FY2027", kind: "provider", asOf: "2026-08-26" });
    expect(check("Management's Q3 FY2027 GAAP gross-margin guidance midpoint is 74%.", guided)).toBe("validated");
    expect(check("Management's Q3 FY2027 gross-margin guidance midpoint is 74%.", guided)).toBe("unchecked");
    const eps = record({ id: "computed.quarterly-trend.non-gaap-diluted-eps-quarter-ended-2026-07-26", label: "non-GAAP diluted EPS, quarter ended 2026-07-26",
      value: 2.22, unit: "currency-per-share", currency: "USD", period: "2026-07-26", asOf: "2026-07-26" });
    expect(check("Non-GAAP diluted EPS for the quarter ended 2026-07-26 was USD 2.22 per share.", eps)).toBe("validated");
    expect(check("Diluted EPS for the quarter ended 2026-07-26 was USD 2.22 per share.", eps)).toBe("unchecked");
    // A parenthetical acronym that restates its words may be left out.
    const ni = record({ id: "computed.forensics.accrual-operand-net-income-ni", label: "accrual operand net income (NI)", value: 120_067e6,
      unit: "currency", currency: "USD", period: "2026-01-25", asOf: "2026-01-25" });
    expect(check("Accrual operand net income as of 2026-01-25 was USD 120.067 billion.", ni)).toBe("validated");
  });
});

describe("D-66 excerpt tables", () => {
  // NVIDIA's Q2 FY2027 10-Q MD&A other-income table, as the extractor flattens it.
  const text = "Other Income, Net Three Months Ended Six Months Ended Jul 26, 2026 Jul 27, 2025 $ Change Jul 26, 2026 Jul 27, 2025 $ Change " +
    "($ in millions) Interest income $ 496 $ 592 $ (96) $ 1,037 $ 1,108 $ (71) Interest expense (227) (62) (165) (329) (124) (205) " +
    "Gains from equity securities, net 7,771 2,247 5,524 23,707 2,073 21,634 Other (267) (11) (256) (275) (18) (257) " +
    "Other income, net $ 7,773 $ 2,766 $ 5,007 $ 24,018 $ 4,177 $ 19,841. " +
    "During the first half of fiscal year 2027, we incurred a $0.4 billion charge associated with H200 for excess inventory and purchase obligations, as the demand for H200 products diminished.";
  const excerpt: TextExcerpt = {
    title: "10-Q Item 2 — MD&A (10-Q 0001045810-26-000075; reporting period ended 2026-07-26 (Q2 FY2027); filed 2026-08-26)",
    text, source: "edgar:10-Q item2", asOf: "2026-07-26", truncated: false, originalChars: text.length,
  };
  const check = (sentence: string) => validateClaimNumericSupport({ label: "FACT", text: sentence, source: excerpt.source, asOf: excerpt.asOf },
    { excerpts: [excerpt], sourceId: excerpt.source, reportingCurrency: "USD" }).status;

  it("binds a quarter / year-to-date table with change columns by date, window, scale and the excerpt's fiscal label", () => {
    expect(check("Interest income for the second quarter of fiscal 2027 was USD 496 million.")).toBe("validated");
    expect(check("Interest income for the three months ended July 26, 2026 was USD 496 million.")).toBe("validated");
    expect(check("Interest income for the six months ended July 26, 2026 was USD 1,037 million.")).toBe("validated");
    // The year to date is not the quarter, and a date alone names two columns.
    expect(check("Interest income for the second quarter of fiscal 2027 was USD 1,037 million.")).toBe("contradicted");
    expect(check("Interest income as of July 26, 2026 was USD 496 million.")).toBe("unchecked");
  });

  it("reads a sentence's figure through its 'and' when no other figure follows", () => {
    expect(check("The H200 excess-inventory and purchase-obligation charge for the first half of fiscal 2027 was USD 0.4 billion.")).toBe("validated");
  });
});
