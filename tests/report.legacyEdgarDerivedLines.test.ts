/**
 * A stored report whose statements came from SEC filings before the B13 batch's
 * report spec is marked at display time with what changed since (audit
 * 2026-10-27 B13: FIN-507, FIN-508, FIN-509, FIN-509-V1, FIN-510, FIN-511-V1).
 * No figure is rewritten (D-67). Synthetic fixtures only; no network.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ReportView } from "@/components/report/ReportView";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import {
  EDGAR_DERIVED_LINES_SINCE_SPEC_VERSION as SINCE,
  withLegacyEdgarDerivedLines,
} from "@/report/legacyEdgarDerivedLines";
import { parseStoredReportWithSafety } from "@/report/legacyEntitySafety";
import { specVersionBefore } from "@/report/legacyPayloadRecordSafety";
import type { Report } from "@/report/schema";

import { cloneTask28, loadTask28Fixture } from "./helpers/task28Report";

const DERIVATION = /built from SEC filings before report spec .*re-run the report for the current derivation/;
const TREND = /computed before report spec .* without checking whether the two quarters sit on one filed presentation/;
const SCREENS = /one-time-items screen was skipped without notice/;

const RESTATEMENT_REASON =
  "1 material line(s) restated or re-presented by more than 1% in a later filing; this statement carries the LAST-FILED value and keeps the superseded one as `original`: 2024-12-31 revenue 101887000000 → 105856000000 (+3.90%, first 10-K 0000000099-25-000001 filed 2025-02-25, restated in 10-K 0000000099-26-000001 filed 2026-02-25).";

function base(specVersion: string, opts: { fair?: "available" | "suppressed"; keyless?: boolean; restated?: boolean } = {}): Report {
  const report = cloneTask28(loadTask28Fixture());
  report.meta = { ...report.meta, specVersion };
  report.fairValue = opts.fair === "suppressed"
    ? { status: "suppressed", method: null, methodVersion: "stored", perShare: null, upsidePct: null, basis: [], reasons: [{ field: "valuation.fairValue", severity: "info", reason: "n/m" }] }
    : { status: "available", method: "fcff-dcf", methodVersion: "stored", perShare: report.valuation.dcf.perShare, upsidePct: 12, basis: ["Stored DCF basis line."], reasons: [] };
  if (opts.keyless !== false) {
    report.appendix.missingData = [
      ...report.appendix.missingData,
      { field: "keyless.incomeAnnual.substitutions", reason: "income annual: served by edgar (fixture)", severity: "info", expected: true },
    ];
  }
  if (opts.restated === true) {
    report.appendix.missingData = [
      ...report.appendix.missingData,
      { field: "keyless.incomeQuarterly.restatements", reason: RESTATEMENT_REASON, severity: "warn" },
    ];
    const row = (periodEnd: string, label: string, revenue: number) => ({
      periodEnd, fiscalLabel: label, revenue, revenueYoyPct: null, revenueQoqPct: null, grossMarginPct: null, operatingExpenses: null,
      operatingMarginPct: null, epsDiluted: null, operatingCashFlow: null, freeCashFlow: null,
    });
    report.filingDisclosures = {
      version: "1.0.0", currency: "USD", currencyBasis: "fixture", guidance: null, guidanceChecks: [], freeCashFlow: [],
      freeCashFlowDefinition: null, capitalReturn: null, events: [], segments: [], reconciliation: [], commitments: [], notes: [],
      quarterlyTrend: [row("2025-06-30", "Q2 FY2025", 29_000_000_000), row("2025-03-31", "Q1 FY2025", 27_000_000_000)],
    } as never;
  }
  return report;
}

const count = (text: string, re: RegExp): number => (text.replace(/\s+/g, " ").match(new RegExp(re.source, `${re.flags.replace("g", "")}g`)) ?? []).length;
const surfaces = (report: Report): string[] => [
  reportToMarkdown(report),
  reportToPrintBody(report),
  renderToStaticMarkup(createElement(ReportView, { report })),
];

describe("legacy EDGAR-derived-lines view", () => {
  it("the since-version is the batch's frozen value", () => {
    expect(SINCE).toBe("1.48.0");
  });

  it("a legacy EDGAR-built report carries the derivation note once on every surface", () => {
    const report = base("1.44.0");
    for (const surface of surfaces(report)) expect(count(surface, DERIVATION)).toBe(1);
  });

  it("the trend note appears only when the stored manifest shows a quarterly revenue re-presentation", () => {
    const restated = base("1.44.0", { restated: true });
    const view = withLegacyEdgarDerivedLines(restated);
    expect(view.filingDisclosures!.quarterlyTrend[0]!.revenueGrowthNotes!.join(" ")).toMatch(TREND);
    expect(view.filingDisclosures!.quarterlyTrend[1]!.revenueGrowthNotes).toBeUndefined();
    for (const surface of [reportToMarkdown(restated), renderToStaticMarkup(createElement(ReportView, { report: restated }))]) {
      expect(count(surface, TREND)).toBe(1);
    }
    // Control: the same trend rows with no revenue re-presentation in the manifest carry no trend note.
    const plain = base("1.44.0", { restated: true });
    plain.appendix.missingData = plain.appendix.missingData.map((e) => (e.field.endsWith(".restatements") ? { ...e, reason: e.reason.replace(" revenue ", " operatingIncome ") } : e));
    expect(JSON.stringify(withLegacyEdgarDerivedLines(plain))).not.toMatch(TREND);
    expect(JSON.stringify(withLegacyEdgarDerivedLines(base("1.44.0")))).not.toMatch(TREND);
    // An annual revenue re-presentation (the derived Q4 case) also triggers it.
    const annual = base("1.44.0", { restated: true });
    annual.appendix.missingData = annual.appendix.missingData.map((e) => (e.field.endsWith(".restatements") ? { ...e, field: "keyless.incomeAnnual.restatements" } : e));
    expect(JSON.stringify(withLegacyEdgarDerivedLines(annual))).toMatch(TREND);
  });

  it("a scoped income restatements entry, or a list cut short with 'and N more', also triggers the trend note", () => {
    // Review of ab12906 (M2): `discloseStatementRows` files scoped fields (backfill, predecessor), and the reason lists
    // at most six restatements, so a revenue entry can sit behind "and N more".
    const scoped = base("1.44.0", { restated: true });
    scoped.appendix.missingData = scoped.appendix.missingData.map((e) => (e.field.endsWith(".restatements") ? { ...e, field: "keyless.incomeQuarterly.backfill.restatements" } : e));
    expect(JSON.stringify(withLegacyEdgarDerivedLines(scoped))).toMatch(TREND);
    const cut = base("1.44.0", { restated: true });
    cut.appendix.missingData = cut.appendix.missingData.map((e) => (e.field.endsWith(".restatements")
      ? { ...e, reason: e.reason.replace(" revenue ", " netIncome ").replace("filed 2026-02-25).", "filed 2026-02-25); and 3 more.") }
      : e));
    expect(JSON.stringify(withLegacyEdgarDerivedLines(cut))).toMatch(TREND);
    // Controls: a revenue line on a cash-flow restatements entry, and a scoped income entry naming no revenue and no overflow.
    const cash = base("1.44.0", { restated: true });
    cash.appendix.missingData = cash.appendix.missingData.map((e) => (e.field.endsWith(".restatements") ? { ...e, field: "keyless.cashflowAnnual.restatements" } : e));
    expect(JSON.stringify(withLegacyEdgarDerivedLines(cash))).not.toMatch(TREND);
    const other = base("1.44.0", { restated: true });
    other.appendix.missingData = other.appendix.missingData.map((e) => (e.field.endsWith(".restatements")
      ? { ...e, field: "keyless.incomeAnnual.predecessor.restatements", reason: e.reason.replace(" revenue ", " netIncome ") }
      : e));
    expect(JSON.stringify(withLegacyEdgarDerivedLines(other))).not.toMatch(TREND);
  });

  it("the stored-read view carries the notes once", () => {
    // Review of ab12906 (M1): the legacyEntitySafety wiring had no test of its own.
    const view = parseStoredReportWithSafety(JSON.stringify(base("1.44.0")))!.report;
    expect(view.quality.notes!.filter((l) => SCREENS.test(l))).toHaveLength(1);
    expect(view.fairValue!.basis.filter((l) => DERIVATION.test(l))).toHaveLength(1);
  });

  it("applying the rule twice adds the notes once", () => {
    const report = base("1.44.0", { restated: true });
    const once = withLegacyEdgarDerivedLines(report);
    expect(withLegacyEdgarDerivedLines(once)).toEqual(once);
    expect(once.fairValue!.basis.filter((l) => DERIVATION.test(l))).toHaveLength(1);
    expect(once.quality.notes!.filter((l) => SCREENS.test(l))).toHaveLength(1);
  });

  it("a report at or after the batch's spec, or an FMP-route report, carries no note", () => {
    for (const version of [SINCE, "9.0.0"]) {
      const report = base(version);
      expect(withLegacyEdgarDerivedLines(report)).toBe(report);
    }
    const fmp = base("1.44.0", { keyless: false });
    expect(withLegacyEdgarDerivedLines(fmp)).toBe(fmp);
    for (const surface of surfaces(fmp)) expect(surface).not.toMatch(SCREENS);
    // Control: the comparison is numeric, not string.
    expect(specVersionBefore("1.9.0", SINCE)).toBe(true);
    expect(JSON.stringify(withLegacyEdgarDerivedLines(base("1.9.0")))).toMatch(SCREENS);
  });

  it("the quality notes say a legacy EDGAR-built report's screens may not have been evaluated, with or without a fair value", () => {
    for (const fair of ["available", "suppressed"] as const) {
      const report = base("1.44.0", { fair });
      for (const surface of surfaces(report)) expect(count(surface, SCREENS)).toBe(1);
    }
    const suppressed = withLegacyEdgarDerivedLines(base("1.44.0", { fair: "suppressed" }));
    expect(suppressed.fairValue!.basis).toEqual([]);
  });

  it("composes with B3's wrapper", () => {
    // B3's peer-currency rule: a foreign peer's cap reads "currency unknown" on a report before spec 1.45.0.
    const report = base("1.44.0");
    report.competitive.peerTable = [{
      name: "Example Tokyo Corp.", symbol: "9999.T",
      metrics: [{ value: 21.5e12, unit: "currency", currency: "USD", sourceId: "payload.peers.9999-t-example-tokyo-corp", source: "payload.peers.9999-t-example-tokyo-corp", asOf: "2026-10-25", verified: true }],
    }];
    for (const surface of surfaces(report)) {
      expect(count(surface, DERIVATION)).toBe(1);
      expect(count(surface, /currency unknown/)).toBeGreaterThanOrEqual(1);
    }
  });

  it("stored bytes are never rewritten", () => {
    const report = base("1.44.0", { restated: true });
    const before = JSON.stringify(report);
    withLegacyEdgarDerivedLines(report);
    surfaces(report);
    expect(JSON.stringify(report)).toBe(before);
  });
});
