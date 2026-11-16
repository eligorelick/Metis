import { reverseDcfValueText } from "@/report/presentation";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportView } from "@/components/report/ReportView";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { loadTask28Fixture } from "./helpers/task28Report";

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
    "computed.returns.unregistered notes",
    "manifest.evidenceCoverage.edgar:40-F notes governance",
    "payload..unregistered",
    "computed..missing",
  ])("D-313: hides malformed registry citation %s at read time, retaining the audit", (source) => {
    expect(sourceLabel(source)).toBe("Unresolved citation (no matching record)");
    const report = loadTask28Fixture();
    const claim = { label: "JUDGMENT" as const, text: "The retained evidence is incomplete.", source, asOf: "2026-01-01" };
    report.leadership.executives[0]!.reasoning = [claim];
    report.appendix.verificationLog = [{ path: "leadership.executives[0].reasoning[0]", claim: claim.text,
      source, outcome: "unverified", validationStatus: "unchecked", traceKind: "untraced", reason: "unknown-source" }];
    const stored = JSON.stringify(report);
    for (const reader of [reportToMarkdown(report), reportToPrintBody(report), renderToStaticMarkup(createElement(ReportView, { report }))]) {
      expect(reader).toContain("Unresolved citation (no matching record)");
      expect(reader.replace(/<[^>]+>/g, "")).not.toContain(source);
    }
    expect(reportToAuditMarkdown(report)).toContain(source);
    expect(report.appendix.verificationLog[0]!.reason).toBe("unknown-source");
    expect(JSON.stringify(report)).toBe(stored);
  });

  it("D-313: preserves valid gap citations and ordinary source labels", () => {
    expect(sourceLabel("manifest.returns.roic")).toBe("Data-gap record: returns ROIC");
    expect(sourceLabel("edgar:10-Q item2")).toBe("10-Q Item 2");
    expect(sourceLabel("news: Example Publisher: Article title")).toBe("Example Publisher: Article title");
    expect(sourceLabel("Example Publisher")).toBe("Example Publisher");
  });
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
    ["payload.macro.payems-change-from-prior-observation-core", "FRED PAYEMS, change from prior observation"],
    ["payload.insiders.insider-open-market-sale-transactions-form-4-code-s-four-calendar-quarters-ended-2026-09-30", "Insider sale transactions (Form 4 code S; open-market or private), four calendar quarters ended 2026-09-30"],
    ["payload.insiders.insider-sale-transactions-form-4-code-s-four-calendar-quarters-ended-2026-09-30", "Insider sale transactions (Form 4 code S; open-market or private), four calendar quarters ended 2026-09-30"],
    ["payload.insiders.insider-acquired-disposed-transaction-count-ratio-all-acquisition-and-disposition-codes-two-calendar-quarters-ended-2026-06-30", "Insider acquired/disposed transaction-count ratio, two calendar quarters ended 2026-06-30"],
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
    // RPT-205: the source name does not establish Hong Kong scope.
    expect(geographyLabel("CHINA")).toBe("China");
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

it("RPT-205: geographic labels add no unrecorded scope", () => {
 expect(geographyLabel("CHINA")).toBe("China");
 expect(geographyLabel("China including Hong Kong")).toBe("China including Hong Kong");
});

it("RPT-217: reverse values use the metric unit and unavailable sentinels", () => {
 expect(reverseDcfValueText("Forward FCF/share",11)).toBe("11.0");
 expect(reverseDcfValueText("n/a (not computed in payload)",0)).toBe("\u2014");
 expect(reverseDcfValueText("not applicable",0)).toBe("\u2014");
 expect(reverseDcfValueText("unavailable (data-only payload)",0)).toBe("\u2014");
});

it.each([
  ["no-same-period-revenue", "no same-period revenue"],
  ["revenue-refused", "revenue refused"],
  ["split-does-not-reconcile", "split does not reconcile"],
] as const)("D-280 headings name %s without guessing the cause", (cause, words) => {
  const rows: Parameters<typeof annualSegmentHeading>[1] = [{revenue:{value:100,unit:"currency",currency:"USD",source:"synthetic",asOf:"2025-12-31",verified:null},sharePct:null,shareWithheldReason:cause}];
  expect(annualSegmentHeading("Geographic",rows,false)).toBe(`Geographic segments (${words}; shares withheld)`);
  expect(annualSegmentHeading("Product",rows,true)).toContain(`(${words}; shares withheld)`);
});

it("D-306 does not call a fallback valuation-multiple history rank P/E",()=>{
 expect(signalLabel("peOwnHistoryRank")).toBe("Valuation multiple own-history rank");
});
