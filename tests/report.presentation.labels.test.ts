import { describe, expect, it } from "vitest";

import {
  annualSegmentHeading,
  geographyLabel,
  metricLabel,
  moatHeading,
  moatSourceLabel,
  signalLabel,
  sourceLabel,
  splitCommonLines,
} from "@/report/presentation";

// D-62 reader labels for registry ids, checked against the ids the NVDA
// integration report actually cites (data/recovery/nvda-integration-20261015).
describe("reader labels for registry ids", () => {
  it.each([
    ["computed.weighted-projections.revenue-weighted-12m-ending-2027-07-26", "Weighted revenue, 12M ending 2027-07-26"],
    ["payload.computed.projections.revenue.base.12m-ending-2027-07-26", "Base case revenue, 12M ending 2027-07-26"],
    ["payload.computed.scenario-targets.bull.per-share", "Bull scenario value per share"],
    ["payload.computed.fair-value.per-share", "Model fair value per share"],
    ["payload.segment-revenue.product-market-platform-hyperscale-revenue-quarter-ended-2026-07-26", "Hyperscale revenue (quarter ended 2026-07-26)"],
    ["payload.segments.geographic-other-americas", "Other Americas revenue (annual geographic segment)"],
    ["payload.estimates.est-eps-2027-01-25", "Consensus EPS estimate, fiscal year ending 2027-01-25"],
    ["payload.estimates.est-revenue-2027-01-25", "Consensus revenue estimate, fiscal year ending 2027-01-25"],
    ["payload.estimates.price-target-consensus", "Analyst price target (consensus)"],
    ["payload.leadership.comp-jen-hsun-huang-president-and-ceo-fy2026", "Executive compensation record (FY2026)"],
    ["payload.peers.avgo-broadcom-inc", "AVGO market cap"],
    ["payload.macro.dgs10-core", "FRED DGS10"],
    ["payload.insiders.mspr-2026-10", "Insider sentiment (MSPR), 2026-10"],
    ["payload.statements.income-statement-quarterly.2026-07-26.net-income", "Net income (quarter ended 2026-07-26)"],
    ["payload.statements.balance-sheet-quarterly.2026-07-26.net-debt", "Net debt (at 2026-07-26)"],
    ["computed.deterministic-aspect-scores.leadership-score", "Leadership (capital-stewardship proxy) score"],
    ["computed.scores.composite", "Composite score"],
  ])("%s → %s", (id, label) => {
    expect(metricLabel(id)).toBe(label);
  });

  it("names quarterly-trend, accrual-operand and data-gap records without registry syntax", () => {
    expect(metricLabel("computed.quarterly-trend.q2-fy2027-revenue")).toBe("Q2 FY2027 revenue");
    expect(metricLabel("computed.forensics.accrual-operand-net-income-ni")).toBe("Net income");
    // D-67: the provider is named and the symbol argument dropped.
    expect(metricLabel("manifest.fmp.insiderTradingSearch(NVDA)")).toBe("Data-gap record: FMP insider trading search");
    expect(sourceLabel("edgar:10-Q item2")).toBe("10-Q Item 2");
    expect(sourceLabel("edgar:8-K 0001045810-26-000069")).toBe("8-K 0001045810-26-000069");
  });

  it("labels the D-61 grading signals and keeps the retired ones readable", () => {
    expect(signalLabel("roicFloor")).toBe("ROIC floor (worst year in window)");
    // AMZN audit 2026-10-20 finding 15: "price paid vs the year's average" beside
    // -3.0% read as paying 3% below the average, the opposite of the measure.
    expect(signalLabel("buybackTiming")).toBe("Buyback timing (year-average cost vs cost paid; negative = paid above average)");
    expect(signalLabel("beneishMSgiNeutral")).toBe("Beneish M-score (sales growth neutral)");
    expect(signalLabel("buybackDiscipline")).toBe("Current price vs average repurchase price");
    expect(signalLabel("someNewSignal")).toBe("Some new signal");
  });
});

describe("reader text helpers", () => {
  it("states lines common to every list once", () => {
    expect(splitCommonLines([["a", "b", "c"], ["b", "c", "d"], ["c", "b"]])).toEqual({ common: ["b", "c"], specific: [["a"], ["d"], []] });
    expect(splitCommonLines([["only"]])).toEqual({ common: [], specific: [["only"]] });
  });

  it("names geographies and moat sources for readers", () => {
    expect(geographyLabel("TAIWAN, PROVINCE OF CHINA")).toBe("Taiwan");
    expect(geographyLabel("CHINA")).toBe("China (incl. Hong Kong)");
    expect(geographyLabel("OTHER COUNTRIES")).toBe("Other Countries");
    expect(geographyLabel("Other Americas")).toBe("Other Americas");
    expect(moatHeading({ source: "scale", strength: "wide" })).toBe("Scale — wide");
    expect(moatSourceLabel("ip")).toBe("Intellectual property");
  });

  it("marks the annual provider segment table as the prior presentation only beside quarterly tables", () => {
    const rows = [{ revenue: { asOf: "2026-01-25" } }] as unknown as Parameters<typeof annualSegmentHeading>[1];
    expect(annualSegmentHeading("Product", rows, false)).toBe("Product segments");
    expect(annualSegmentHeading("Geographic", rows, true)).toBe("Geographic segments — annual, fiscal year ended 2026-01-25 (prior presentation)");
  });
});
