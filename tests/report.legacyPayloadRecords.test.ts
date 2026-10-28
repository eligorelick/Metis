/**
 * Stored reports made before this batch's report spec (< 1.45.0) are shown
 * under the current payload-record rules without ever being rewritten
 * (D-67): foreign peer caps (AI-301), insider counts shown as shares
 * (AI-117), the capex/D&A "5y" label (AI-410), the data-only FRED unit
 * sentences (AI-310), provider geography the report's own XBRL tables
 * contradict (AI-509) and the data-only "graded ratio" label (AI-511).
 * Synthetic fixtures only; no network.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ReportView } from "@/components/report/ReportView";
import { runStageB } from "@/pipeline/compute";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { parseStoredReportWithSafety } from "@/report/legacyEntitySafety";
import {
  PAYLOAD_RECORD_CORRECTION_FIELD,
  PAYLOAD_RECORD_CORRECTION_NOTE,
  PAYLOAD_RECORD_CORRECTION_SPEC,
  specVersionBefore,
  withLegacyPayloadRecordSafety,
} from "@/report/legacyPayloadRecordSafety";
import { ReportSchema, type Report, type TracedNumber } from "@/report/schema";

import { completeCurrencyBundle } from "./helpers/currencyBundle";

const VALIDATION = { checks: [], flags: [], gaps: [] } as unknown as ValidationReport;

function newReport(): Report {
  const bundle = completeCurrencyBundle({});
  return buildDataOnlyReport({
    symbol: bundle.symbol,
    companyName: "Test General Co",
    generatedAt: "2026-07-06T12:00:00.000Z",
    model: "none",
    costUsd: 0,
    bundle,
    validation: VALIDATION,
    computed: runStageB(bundle),
    costBreakdown: [],
    reason: "no analysis",
  });
}

const PEER_FOREIGN: TracedNumber = { value: 21.5e12, unit: "currency", currency: "USD", sourceId: "payload.peers.9999-t-example-tokyo-corp", source: "payload.peers.9999-t-example-tokyo-corp", asOf: "2026-10-25", verified: true };
const PEER_US: TracedNumber = { ...PEER_FOREIGN, value: 4.25e9, sourceId: "payload.peers.peer-peer-inc", source: "payload.peers.peer-peer-inc" };
const INSIDER: TracedNumber = { value: 0, unit: "shares", sourceId: "payload.insiders.insider-total-sales", source: "payload.insiders.insider-total-sales", asOf: "2026-10-26", verified: true };
const CAPEX: TracedNumber = { value: 1.982143, unit: "x", period: "capex / D&A, 5y average", source: "computed.capital.maintenanceVsGrowthCapex", asOf: "2025-12-31", verified: true };
const SERIES_VALUE: TracedNumber = { value: 0.17, unit: "currency", currency: "USD", source: "fred:APU000072610", asOf: "2026-09-01", verified: true };

function stored(specVersion: string): Report {
  const report = newReport();
  report.meta = { ...report.meta, specVersion };
  report.competitive.peerTable = [
    { name: "Example Tokyo Corp.", symbol: "9999.T", metrics: [{ ...PEER_FOREIGN }] },
    { name: "Peer Inc", symbol: "PEER", metrics: [{ ...PEER_US }] },
  ];
  report.leadership.graded.keyNumbers.push({ ...INSIDER });
  report.balanceSheet.capexTrajectory.numbers.push({ ...CAPEX });
  report.appendix.verificationLog = [
    { claim: "0 shares [payload.insiders.insider-total-sales · 2026-10-26]", outcome: "verified", validationStatus: "validated",
      path: "leadership.graded.keyNumbers[0]", evidenceKind: "number", source: "payload.insiders.insider-total-sales", reason: "supported" },
    { claim: "Insider total sales were 0 shares.", outcome: "unverified", validationStatus: "validated", numericSupportStatus: "validated",
      claimSupportStatus: "numeric-only", path: "leadership.insiderSummary[0]", evidenceKind: "factual-claim", source: "payload.insiders.insider-total-sales",
      reason: "supported", traceKind: "payload-match" },
  ] as never;
  report.meta.provenanceCoverage = {
    numeric: { supported: 3, total: 4, rate: 0.75 },
    factualClaims: { supported: 1, total: 1, rate: 1 },
    judgments: { cited: 0, total: 0, rate: null },
    factualValidation: { cited: 1, validated: 1, unchecked: 0, contradicted: 0, total: 1, rate: 1 },
  };
  report.macro.relevantSeries = [
    { seriesId: "APU000072610", name: "Average Price: Electricity", latest: { ...SERIES_VALUE }, relevance: "Utilities sector series. Displayed in USD per therm." },
    { seriesId: "PAYEMS", name: "Nonfarm Payrolls, monthly change", latest: { ...SERIES_VALUE, unit: "persons", currency: null, source: "fred:PAYEMS" },
      relevance: "Core macro series tracked for every issuer. Displayed in persons (FRED serves thousands; shown ×1,000)." },
    { seriesId: "PCE", name: "Personal Consumption Expenditures", latest: { ...SERIES_VALUE, source: "fred:PCE" },
      relevance: "Core macro series tracked for every issuer. Displayed in USD (FRED serves billions; shown ×1,000,000,000)." },
    { seriesId: "DGS10", name: "10-Year Treasury", latest: { ...SERIES_VALUE, unit: "percent", currency: null, source: "fred:DGS10" },
      relevance: "The model wrote this: electricity moved. Displayed in USD per therm." },
  ];
  return report;
}

describe("legacy payload-record view", () => {
  it("withholds a foreign peer's inherited currency, relabels insider counts and the capex average, once", () => {
    const before = JSON.stringify(stored("1.44.0"));
    const input = stored("1.44.0");
    const after = withLegacyPayloadRecordSafety(input);
    expect(JSON.stringify(input)).toBe(before);                                               // the stored report is never rewritten
    expect(after.competitive.peerTable[0]!.metrics[0]).toMatchObject({ currency: null, verified: false, verificationNote: expect.stringMatching(/currency is not established/) });
    expect(after.competitive.peerTable[1]!.metrics[0]).toEqual(PEER_US);                       // same market: as stored
    expect(after.leadership.graded.keyNumbers.find((n) => n.source === INSIDER.source)).toMatchObject({ unit: "count", verified: false });
    expect(after.appendix.verificationLog!.find((e) => e.source === INSIDER.source)).toMatchObject({ outcome: "unverified", validationStatus: "unchecked" });
    expect(after.balanceSheet.capexTrajectory.numbers.find((n) => n.value === 1.982143)!.period).toBe("capex / D&A, average of up to 5 fiscal years (the number averaged was not recorded)");
    expect(after.macro.relevantSeries.find((r) => r.seriesId === "APU000072610")!.relevance).toBe("Utilities sector series. Displayed in USD per kilowatt-hour.");
    expect(after.macro.relevantSeries.find((r) => r.seriesId === "PCE")!.relevance)
      .toBe("Core macro series tracked for every issuer. Displayed in USD at a seasonally adjusted annual rate (FRED serves billions; shown ×1,000,000,000).");
    expect(after.macro.relevantSeries.find((r) => r.seriesId === "PAYEMS")!.relevance).toBe("Core macro series tracked for every issuer. Displayed in persons (FRED serves thousands; shown ×1,000).");   // control
    expect(after.macro.relevantSeries.find((r) => r.seriesId === "DGS10")!.relevance).toBe("The model wrote this: electricity moved. Displayed in USD per therm.");   // model prose is left alone
    expect(after.appendix.verificationLog!.find((e) => e.path === "leadership.insiderSummary[0]")).toMatchObject({ validationStatus: "unchecked", numericSupportStatus: "unchecked" });
    expect(after.appendix.verificationLog!.every((e) => (e.note ?? "").includes("(display correction, D-next)"))).toBe(true);
    // 3b: counts move only for corrected LOG entries. PEER_FOREIGN has no log entry in this fixture, so only the insider
    // key number's entry leaves numeric.supported (3 → 2), and the #48-shaped claim moves from validated to unchecked.
    expect(after.meta.provenanceCoverage).toMatchObject({ numeric: { supported: 2, total: 4, rate: 0.5 },
      factualValidation: { validated: 0, unchecked: 1, total: 1, rate: 0 } });
    expect(after.appendix.missingData.filter((g) => g.field === PAYLOAD_RECORD_CORRECTION_FIELD)).toHaveLength(1);
    expect(after.appendix.missingData.find((g) => g.field === PAYLOAD_RECORD_CORRECTION_FIELD)).toMatchObject({
      reason: PAYLOAD_RECORD_CORRECTION_NOTE, severity: "info", expected: true });
    expect(withLegacyPayloadRecordSafety(after)).toEqual(after);                               // review focus 4: idempotent
    expect(ReportSchema.safeParse(after).success).toBe(true);
  });

  it("leaves a report built under this batch's spec untouched", () => {
    expect(PAYLOAD_RECORD_CORRECTION_SPEC).toBe("1.45.0");
    const current = stored("1.45.0");
    expect(withLegacyPayloadRecordSafety(current)).toBe(current);
    const later = stored("1.46.0");
    expect(withLegacyPayloadRecordSafety(later)).toBe(later);
  });

  it("leaves a legacy report with nothing to correct as the identical object", () => {
    const clean = newReport();
    clean.meta = { ...clean.meta, specVersion: "1.44.0" };
    expect(withLegacyPayloadRecordSafety(clean)).toBe(clean);
    const demo = JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", "report", "DEMO-sample.json"), "utf8")) as Report;
    expect(demo.meta.specVersion).toBe("1.2.0");
    expect(withLegacyPayloadRecordSafety(demo)).toEqual(demo);
  });

  it("shows the corrected peer cap on every surface", () => {
    const legacy = stored("1.44.0");
    // A null currency prints "(currency unknown)" (format.ts withCurrency); the same-market cap still prints in USD (control).
    for (const surface of [reportToMarkdown(legacy), reportToPrintBody(legacy), reportToAuditMarkdown(legacy), renderToStaticMarkup(createElement(ReportView, { report: legacy }))]) {
      expect(surface).not.toContain("$21.50T");
      expect(surface).toContain("currency unknown");   // Markdown and print: "21.50T (currency unknown)"; the page may split value and suffix across elements
    }
    for (const surface of [reportToMarkdown(legacy), reportToPrintBody(legacy), renderToStaticMarkup(createElement(ReportView, { report: legacy }))]) {
      expect(surface).toContain("$4.25B");
    }
    expect(reportToMarkdown(legacy)).toContain("21.50T (currency unknown)");
    expect(parseStoredReportWithSafety(JSON.stringify(legacy))!.report.competitive.peerTable[0]!.metrics[0]!.verified).toBe(false);
    const current = stored("1.45.0");
    expect(reportToMarkdown(current)).toContain("$21.50T");                                    // a current report is shown as stored
  });

  it("compares spec versions numerically", () => {
    expect([["1.44.0", "1.45.0"], ["1.2.0", "1.45.0"], ["1.45.0", "1.45.0"], ["1.100.0", "1.45.0"], ["n/a", "1.45.0"]].map(([a, b]) => specVersionBefore(a!, b!)))
      .toEqual([true, true, false, false, true]);
  });

  it("does not count a peer cap whose currency is already unknown as changed", () => {
    const legacy = stored("1.44.0");
    const unknown = { ...PEER_FOREIGN, currency: null, verified: false };
    legacy.competitive.peerTable[0]!.metrics[0] = { ...unknown };
    const after = withLegacyPayloadRecordSafety(legacy);
    expect(after.competitive.peerTable[0]!.metrics[0]).toEqual(unknown);
    expect(after.appendix.missingData.find((g) => g.field === PAYLOAD_RECORD_CORRECTION_FIELD)!.attemptedSources).not.toContain("foreign peer market caps");
  });

  it("applies the same correction to other records of a corrected peer's source and to the appendix coverage", () => {
    const legacy = stored("1.44.0");
    legacy.leadership.graded.keyNumbers.push({ ...PEER_FOREIGN, value: 20e12 });
    legacy.appendix.provenanceCoverage = structuredClone(legacy.meta.provenanceCoverage);
    legacy.appendix.verificationLog!.push({ claim: "21.00T [payload.peers.9999-t-example-tokyo-corp]", outcome: "verified", validationStatus: "validated",
      path: "competitive.peerTable[0].metrics[0]", evidenceKind: "number", source: PEER_FOREIGN.source, reason: "supported" } as never);
    const after = withLegacyPayloadRecordSafety(legacy);
    expect(after.leadership.graded.keyNumbers.at(-1)).toMatchObject({ currency: null, verified: false });
    expect(after.meta.provenanceCoverage!.numeric).toMatchObject({ supported: 1, total: 4, rate: 0.25 });
    expect(after.appendix.provenanceCoverage).toEqual(after.meta.provenanceCoverage);
  });

  it("leaves a coverage object as recorded when the adjustment would go below zero", () => {
    const legacy = stored("1.44.0");
    legacy.meta.provenanceCoverage = { ...legacy.meta.provenanceCoverage!, numeric: { supported: 0, total: 4, rate: 0 } };
    const after = withLegacyPayloadRecordSafety(legacy);
    expect(after.meta.provenanceCoverage!.numeric).toEqual({ supported: 0, total: 4, rate: 0 });
    expect(ReportSchema.safeParse(after).success).toBe(true);
  });

  it("marks stored provider geography the report's own XBRL tables contradict, and drops 'the graded ratio' from the data-only label (AI-509, AI-511)", () => {
    const legacy = stored("1.44.0");
    const geo = (name: string, value: number, slug: string) => ({ name, sharePct: 50,
      revenue: { value, unit: "currency", currency: "USD", source: `payload.segments.geographic-${slug}`, asOf: "2025-12-31", verified: true } });
    legacy.business.segments.geographic = [geo("North Region Segment", 6e9, "north-region-segment"), geo("Cloud Services Segment", 3e9, "cloud-services-segment")];
    legacy.filingDisclosures = { ...legacy.filingDisclosures!, segments: [{ axis: "us-gaap:StatementBusinessSegmentsAxis", axisLabel: "Reportable segment", currency: "USD",
      quarters: ["2025-12-31"], rows: [{ label: "North Region", childOf: null, values: [1.5e9] }, { label: "Cloud Services", childOf: null, values: [0.75e9] }],
      total: [2.25e9], priorPresentation: [], derivedCells: 0, sources: ["edgar:xbrl segment revenue"] }] };
    legacy.appendix.verificationLog!.push(...legacy.business.segments.geographic.map((row, i) => ({ claim: `${row.revenue.value} [${row.revenue.source} · 2025-12-31]`,
      outcome: "verified", validationStatus: "validated", path: `business.segments.geographic[${i}].revenue`, evidenceKind: "number", source: row.revenue.source, reason: "supported" })) as unknown as NonNullable<Report["appendix"]["verificationLog"]>);
    const fcf = legacy.fundamentals.fcf.find((r) => r.values[0]?.value.source === "computed.capital.fcf.conversionBeforeSbc")!;
    fcf.label = "FCF conversion (FCF before SBC / net income — the graded ratio)";   // the label stored data-only reports #39, #42, #44, #47, #51 carry
    const after = withLegacyPayloadRecordSafety(legacy);
    expect(after.business.segments.geographic.map((r) => [r.revenue.verified, r.sharePct])).toEqual([[false, null], [false, null]]);
    expect(after.business.segments.geographic[0]!.revenue.verificationNote).toMatch(/^Not company geography: /);
    expect(after.appendix.verificationLog!.filter((e) => e.path?.startsWith("business.segments.geographic")).map((e) => [e.outcome, e.validationStatus]))
      .toEqual([["unverified", "unchecked"], ["unverified", "unchecked"]]);
    // 3b: the insider entry (rule 2) and the two geographic entries leave numeric.supported (3 → 0).
    expect(after.meta.provenanceCoverage).toMatchObject({ numeric: { supported: 0, total: 4, rate: 0 } });
    expect(after.fundamentals.fcf.map((r) => r.label)).toContain("FCF conversion (FCF before SBC / net income)");
    expect(after.fundamentals.fcf.some((r) => /graded ratio/.test(r.label))).toBe(false);
    const gap = after.appendix.missingData.find((g) => g.field === PAYLOAD_RECORD_CORRECTION_FIELD)!;
    expect(gap.attemptedSources).toEqual(expect.arrayContaining(["provider geography", "FCF conversion label"]));
    expect(PAYLOAD_RECORD_CORRECTION_NOTE).toMatch(/provider geography/);
    expect(PAYLOAD_RECORD_CORRECTION_NOTE).toMatch(/graded/);
    expect(withLegacyPayloadRecordSafety(after)).toEqual(after);
    expect(ReportSchema.safeParse(after).success).toBe(true);
  });

  it("names the issuer's own geography, and leaves SEC-basis and uncontradicted rows as stored (controls)", () => {
    const issuer = stored("1.44.0");
    issuer.business.segments.geographic = [{ name: "Other Americas", sharePct: 2, revenue: { value: 1e9, unit: "currency", currency: "USD", source: "payload.segments.geographic-other-americas", asOf: "2025-12-31", verified: true } }];
    issuer.filingDisclosures = { ...issuer.filingDisclosures!, segments: [{ axis: "srt:StatementGeographicalAxis", axisLabel: "Geographic area", currency: "USD", quarters: ["2025-12-31"],
      rows: [{ label: "United States", childOf: null, values: [2e9] }, { label: "Other", childOf: null, values: [0.25e9] }], total: [2.25e9], priorPresentation: [], derivedCells: 0, sources: ["edgar:xbrl segment revenue"] }] };
    expect(withLegacyPayloadRecordSafety(issuer).business.segments.geographic[0]!.revenue.verificationNote).toMatch(/^Not established as company geography: /);
    const plain = stored("1.44.0");
    plain.business.segments.geographic = issuer.business.segments.geographic;   // no XBRL segment table in this report
    expect(withLegacyPayloadRecordSafety(plain).business.segments.geographic).toEqual(issuer.business.segments.geographic);
    // META #44/#45 shape: the provider rows repeat the issuer's own geographic labels, so nothing contradicts them.
    const corroborated = stored("1.44.0");
    corroborated.business.segments.geographic = [{ name: "US & Canada", sharePct: 40, revenue: { value: 2e9, unit: "currency", currency: "USD", source: "payload.segments.geographic-us-canada", asOf: "2025-12-31", verified: true } },
      { name: "Rest Of World", sharePct: 60, revenue: { value: 3e9, unit: "currency", currency: "USD", source: "payload.segments.geographic-rest-of-world", asOf: "2025-12-31", verified: true } }];
    corroborated.filingDisclosures = { ...issuer.filingDisclosures!, segments: [{ ...issuer.filingDisclosures!.segments[0]!, rows: [{ label: "US & Canada", childOf: null, values: [0.5e9] }, { label: "Rest of World", childOf: null, values: [0.75e9] }] }] };
    expect(withLegacyPayloadRecordSafety(corroborated).business.segments.geographic).toEqual(corroborated.business.segments.geographic);
    // A model row sourced to the issuer's XBRL table is not provider geography, even beside a contradicting table.
    const xbrlRow = stored("1.44.0");
    xbrlRow.business.segments.geographic = [{ ...issuer.business.segments.geographic[0]!, revenue: { ...issuer.business.segments.geographic[0]!.revenue, source: "edgar:xbrl segment revenue" } }];
    xbrlRow.filingDisclosures = issuer.filingDisclosures;
    expect(withLegacyPayloadRecordSafety(xbrlRow).business.segments.geographic).toEqual(xbrlRow.business.segments.geographic);
    // SEC-parsed rows (D-80 parser) are left as stored beside a contradicting business-segment table.
    const sec = stored("1.44.0");
    const secNote = "Annual geographic revenue (filing 10-K 2025, SEC XBRL).";
    const secRow = (name: string) => ({ name, sharePct: 50, revenue: { value: 1e9, unit: "currency", currency: "USD", source: "https://www.sec.gov/Archives/edgar/data/1/000000000026000001/x.htm",
      asOf: "2025-12-31", verified: true, verificationNote: secNote } });
    sec.business.segments.geographic = [secRow("North Region Segment"), secRow("Cloud Services Segment")];
    sec.filingDisclosures = { ...issuer.filingDisclosures!, segments: [{ axis: "us-gaap:StatementBusinessSegmentsAxis", axisLabel: "Reportable segment", currency: "USD",
      quarters: ["2025-12-31"], rows: [{ label: "North Region", childOf: null, values: [1.5e9] }], total: [1.5e9], priorPresentation: [], derivedCells: 0, sources: ["edgar:xbrl segment revenue"] }] };
    expect(withLegacyPayloadRecordSafety(sec).business.segments.geographic).toEqual(sec.business.segments.geographic);
  });

  it("marks the data-only shared provider source without needing a log entry", () => {
    const legacy = stored("1.44.0");
    legacy.business.segments.geographic = [{ name: "Cloud Services Segment", sharePct: 100, revenue: { value: 3e9, unit: "currency", currency: "USD", source: "fmp:revenue-geographic-segmentation", asOf: "2025-12-31", verified: true } }];
    legacy.filingDisclosures = { ...legacy.filingDisclosures!, segments: [{ axis: "us-gaap:StatementBusinessSegmentsAxis", axisLabel: "Reportable segment", currency: "USD",
      quarters: ["2025-12-31"], rows: [{ label: "Cloud Services", childOf: null, values: [0.75e9] }], total: [0.75e9], priorPresentation: [], derivedCells: 0, sources: ["edgar:xbrl segment revenue"] }] };
    const after = withLegacyPayloadRecordSafety(legacy);
    expect(after.business.segments.geographic[0]).toMatchObject({ sharePct: null, revenue: { verified: false } });
    expect(after.meta.provenanceCoverage!.numeric.supported).toBe(2);   // only the insider entry left it
  });
});
