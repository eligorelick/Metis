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
  LEGACY_EDGAR_BACKFILL_FAIR_VALUE_NOTE,
  LEGACY_EDGAR_BACKFILL_QUALITY_NOTE,
  withLegacyEdgarDerivedLines,
} from "@/report/legacyEdgarDerivedLines";
import { predecessorManifestEntry, type PredecessorFacts } from "@/edgar/successor";
import { parseStoredReportWithSafety } from "@/report/legacyEntitySafety";
import { specVersionBefore } from "@/report/legacyPayloadRecordSafety";
import type { Report } from "@/report/schema";

import { cloneTask28, loadTask28Fixture } from "./helpers/task28Report";

const DERIVATION = /built from SEC filings before report spec .*re-run the report for the current derivation/;
const TREND = /computed before report spec .* without checking whether the two quarters sit on one filed presentation/;
const SCREENS = /one-time-items screen was skipped without notice/;
const B_DERIVATION = /older statement periods on this report that were backfilled from SEC filings were built before report spec .*re-run the report for the current derivation/;
const B_SCREENS = /on this report(?:'|&#x27;|&#39;)s older periods backfilled from SEC filings were computed before report spec .*one-time-items screen was skipped without notice/;

const RESTATEMENT_REASON =
  "1 material line(s) restated or re-presented by more than 1% in a later filing; this statement carries the LAST-FILED value and keeps the superseded one as `original`: 2024-12-31 revenue 101887000000 → 105856000000 (+3.90%, first 10-K 0000000099-25-000001 filed 2025-02-25, restated in 10-K 0000000099-26-000001 filed 2026-02-25).";

type Entry = { field: string; reason: string; severity: "info" | "warn" | "critical"; expected?: boolean };

// Real shapes copied from stored reports (audit 2026-10-27 data/reports 46 and AMZN #51).
const FULL_ENTRY = {
  field: "keyless.incomeAnnual",
  reason: "served by edgar (companyfacts→income-statement(annual)) because FMP returned no rows",
  severity: "info" as const,
  expected: true,
};
const SHARE_BASIS_ENTRY = {
  field: "keyless.incomeQuarterly.shareBasis",
  reason: "4 field(s) in 1 vendor row(s) (2021-12-31 … 2021-12-31; eps, epsDiluted, weightedAverageShsOut, weightedAverageShsOutDil) withheld: each period precedes a split the report knows of, and its split basis on 2026-10-28 could not be established",
  severity: "warn" as const,
};
const SHARE_BASIS_ANNUAL_ENTRY = { ...SHARE_BASIS_ENTRY, field: "keyless.incomeAnnual.shareBasis" };
const BACKFILL_ENTRY = {
  field: "statements.backfill.incomeAnnual",
  reason: "FMP served 5 period(s) back to 2021-12-31; SEC EDGAR companyfacts supplied 5 older period(s), 2016-12-31 to 2020-12-31, each row carrying source \"edgar\" (companyfacts→income-statement(annual)).",
  severity: "info" as const,
};
// Built by the real producer, so a wording change in predecessorManifestEntry fails here (Task 10b fix round 1).
const PREDECESSOR_APPENDED_ENTRY: Entry = (() => {
  const { field, reason, severity } = predecessorManifestEntry(
    {
      cik10: "0000000001", name: "Example Predecessor Corp.", facts: {} as never, endpoint: "companyfacts CIK0000000001", fetchedAt: "2026-10-28T00:00:00Z",
      via: { accession: "0000000001-24-000001", form: "10-K", filed: "2024-02-20", successorFormAccession: "0000000001-24-000002" },
    } as PredecessorFacts,
    "0000000002", 4, "2020-12-31", "2023-12-31",
  );
  return { field, reason, severity };
})();
const PREDECESSOR_NOT_APPENDED_ENTRY = {
  field: "edgar.predecessor",
  reason: "the registrant is a successor issuer whose predecessor (CIK 0000000002) has filed history of its own, but THESIS_STATEMENT_SOURCE=fmp keeps the statements vendor-only, so no pre-reorganization periods were appended",
  severity: "info" as const,
  expected: true,
};

/** A report whose only income manifest entries are `entries` (Task 10b, R1 pre-flight I3). */
function withEntries(specVersion: string, entries: Entry[]): Report {
  const report = base(specVersion, { keyless: false });
  report.appendix.missingData = [...report.appendix.missingData, ...entries];
  return report;
}

function base(specVersion: string, opts: { fair?: "available" | "suppressed"; keyless?: boolean; restated?: boolean } = {}): Report {
  const report = cloneTask28(loadTask28Fixture());
  report.meta = { ...report.meta, specVersion };
  report.fairValue = opts.fair === "suppressed"
    ? { status: "suppressed", method: null, methodVersion: "stored", perShare: null, upsidePct: null, basis: [], reasons: [{ field: "valuation.fairValue", severity: "info", reason: "n/m" }] }
    : { status: "available", method: "fcff-dcf", methodVersion: "stored", perShare: report.valuation.dcf.perShare, upsidePct: 12, basis: ["Stored DCF basis line."], reasons: [] };
  if (opts.keyless !== false) {
    report.appendix.missingData = [
      ...report.appendix.missingData,
      // Task 10b (R1 pre-flight I3): the real "served by edgar" entry replaces the fake `.substitutions` one.
      FULL_ENTRY,
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
    expect(SINCE).toBe("1.49.0");
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

  it("an FMP-route report whose only income entries describe vendor rows is returned as the identical object", () => {
    // Task 10b (R1 pre-flight I3): keyless.ts files `.shareBasis` only when the member holds VENDOR rows.
    for (const entries of [[SHARE_BASIS_ENTRY], [SHARE_BASIS_ANNUAL_ENTRY, SHARE_BASIS_ENTRY]]) {
      const report = withEntries("1.44.0", entries);
      expect(withLegacyEdgarDerivedLines(report)).toBe(report);
      for (const surface of surfaces(report)) {
        expect(surface).not.toMatch(SCREENS);
        expect(surface).not.toMatch(B_SCREENS);
      }
    }
    // Control: a statements.<member> withholding entry and a scoped withheld entry, with no FULL or backfill entry, carry no note.
    const withheld = withEntries("1.44.0", [
      { field: "statements.incomeAnnual", reason: "withheld", severity: "warn" },
      { field: "keyless.incomeAnnual.withheld.ebit", reason: "ebit WITHHELD", severity: "info" },
    ]);
    expect(withLegacyEdgarDerivedLines(withheld)).toBe(withheld);
  });

  it("the FULL class needs the exact member field and a 'served by edgar' reason", () => {
    for (const bad of [
      { ...FULL_ENTRY, reason: "served by yahoo (chart) because FMP returned no rows" },
      { ...FULL_ENTRY, field: "keyless.incomeAnnual.withheld.ebit" },
      { ...FULL_ENTRY, field: "keyless.cashflowAnnual" },
    ]) {
      const report = withEntries("1.44.0", [bad]);
      expect(withLegacyEdgarDerivedLines(report)).toBe(report);
    }
    for (const field of ["keyless.incomeAnnual", "keyless.incomeQuarterly"]) {
      const view = withLegacyEdgarDerivedLines(withEntries("1.44.0", [{ ...FULL_ENTRY, field }]));
      expect(view.quality.notes!.filter((l) => SCREENS.test(l))).toHaveLength(1);
    }
  });

  it("a report with only older periods backfilled from SEC filings carries the scoped notes once on every surface", () => {
    const cases: Entry[][] = [
      [BACKFILL_ENTRY],
      [{ ...BACKFILL_ENTRY, field: "statements.backfill.incomeQuarterly" }],
      [PREDECESSOR_APPENDED_ENTRY],
      [{ field: "keyless.incomeQuarterly.backfill.interestExpense", reason: "stand-in", severity: "info" }],
      [{ field: "keyless.incomeAnnual.predecessor.restatements", reason: "x", severity: "info" }],
    ];
    for (const entries of cases) {
      const report = withEntries("1.44.0", entries);
      const before = JSON.stringify(report);
      for (const surface of surfaces(report)) {
        expect(count(surface, B_DERIVATION)).toBe(1);
        expect(count(surface, B_SCREENS)).toBe(1);
        expect(surface).not.toMatch(DERIVATION);
        expect(surface.replace(/\s+/g, " ")).not.toContain("Statement-derived screens on this report were computed");
      }
      const view = withLegacyEdgarDerivedLines(report);
      expect(view.fairValue!.basis).toContain(LEGACY_EDGAR_BACKFILL_FAIR_VALUE_NOTE);
      expect(view.quality.notes).toContain(LEGACY_EDGAR_BACKFILL_QUALITY_NOTE);
      // Idempotent, and the stored bytes are untouched.
      expect(withLegacyEdgarDerivedLines(view)).toEqual(view);
      expect(JSON.stringify(report)).toBe(before);
    }
  });

  it("the scoped notes keep the rest of each note and name the since-version", () => {
    expect(LEGACY_EDGAR_BACKFILL_FAIR_VALUE_NOTE.startsWith(`The older statement periods on this report that were backfilled from SEC filings were built before report spec ${SINCE}. Since then, a derived operating income:`)).toBe(true);
    expect(LEGACY_EDGAR_BACKFILL_QUALITY_NOTE.startsWith(`Statement-derived screens on this report's older periods backfilled from SEC filings were computed before report spec ${SINCE}: where the filer tags`)).toBe(true);
  });

  it("an appended predecessor triggers the scoped notes but the 'not appended' form carries no note", () => {
    const control = withEntries("1.44.0", [PREDECESSOR_NOT_APPENDED_ENTRY]);
    expect(withLegacyEdgarDerivedLines(control)).toBe(control);
  });

  it("a FULL entry wins over a backfill entry, and a report never carries both classes' texts", () => {
    const both = withEntries("1.44.0", [BACKFILL_ENTRY, PREDECESSOR_APPENDED_ENTRY, FULL_ENTRY]);
    const view = withLegacyEdgarDerivedLines(both);
    expect(JSON.stringify(view)).not.toMatch(B_DERIVATION);
    expect(JSON.stringify(view)).not.toMatch(B_SCREENS);
    expect(view.fairValue!.basis.filter((l) => DERIVATION.test(l))).toHaveLength(1);
    expect(view.quality.notes!.filter((l) => SCREENS.test(l))).toHaveLength(1);
    expect(withLegacyEdgarDerivedLines(view)).toEqual(view);
    for (const surface of surfaces(both)) {
      expect(count(surface, DERIVATION)).toBe(1);
      expect(count(surface, B_DERIVATION)).toBe(0);
    }
    // A report that already carries the FULL text never gains the BACKFILL text, and the reverse holds too.
    const fullFirst = withLegacyEdgarDerivedLines(base("1.44.0"));
    fullFirst.appendix.missingData = [...fullFirst.appendix.missingData, BACKFILL_ENTRY];
    expect(JSON.stringify(withLegacyEdgarDerivedLines(fullFirst))).not.toMatch(B_DERIVATION);
    const backfillFirst = withLegacyEdgarDerivedLines(withEntries("1.44.0", [BACKFILL_ENTRY]));
    backfillFirst.appendix.missingData = [...backfillFirst.appendix.missingData, FULL_ENTRY];
    const swapped = withLegacyEdgarDerivedLines(backfillFirst);
    expect(swapped.fairValue!.basis.filter((l) => B_DERIVATION.test(l))).toHaveLength(1);
    expect(swapped.fairValue!.basis.filter((l) => DERIVATION.test(l))).toHaveLength(0);
    expect(swapped.quality.notes!.filter((l) => SCREENS.test(l))).toHaveLength(1);
  });

  it("stored bytes are never rewritten", () => {
    const report = base("1.44.0", { restated: true });
    const before = JSON.stringify(report);
    withLegacyEdgarDerivedLines(report);
    surfaces(report);
    expect(JSON.stringify(report)).toBe(before);
  });
});
