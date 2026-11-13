/**
 * D-229 (P10, P11, S4.5a): missing-data entries whose wording a consumer reads now also
 * carry an optional typed `cause` (`GAP_CAUSES`), written beside the unchanged sentence.
 * No consumer reads the code yet. These tests pin, per producer site:
 *
 * - the dual write (the code is written, the sentence is unchanged, controls carry none);
 * - the three rewrites that turn a gap into a sentence no longer stating its cause drop it;
 * - optionality (an entry without a code parses and stays without one; an unknown value is
 *   refused, never mapped to a member);
 * - the boundaries where a code must not travel (payload, run-input snapshot, request
 *   schemas, report summary);
 * - agreement: each consumer's wording test and the code give the same answer on every
 *   entry these producers write, and on the DEMO audit fixture rebuilt from current code.
 */
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReportSnapshotHeader } from "@/components/report/ReportSnapshotHeader";
import { ReportView } from "@/components/report/ReportView";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody, reportToPrintHtml } from "@/report/export/printHtml";
import { parseStoredReportWithSafety } from "@/report/legacyEntitySafety";
import type { Report } from "@/report/schema";

import { runStageB } from "@/pipeline/compute";
import { selectAnnualFiling, withResolvedPredecessor } from "@/pipeline/dataBundle";
import { captureRunInputSnapshot } from "@/pipeline/runInputSnapshot";
import { withoutGapCause, withoutGapCauses } from "@/pipeline/stageA/manifest";
import { validateBundle } from "@/pipeline/stageA/validate";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { FMP_EMPTY_ARRAY_REASON, resetFmpPlanLimits } from "@/providers/fmp";
import { resetFmpAccess } from "@/providers/fmpAccess";
import { analystCaseToJsonSchema, judgeOutputToJsonSchema, ManifestEntrySchema, reportToJsonSchema, ReportSchema } from "@/report/schema";
import type { FetchResult, ManifestEntry } from "@/types/core";
import { GAP_CAUSES, STATEMENT_CONFLICT_CAUSES } from "@/types/refusalCause";
import { buildAuditFixtureComparison } from "./helpers/auditFixtureComparison";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { agreementReport, collectGaps, g2Agreement, UNLINKED_PREDECESSOR_TEXT, type AgreementReport } from "./helpers/gapCauseAgreement";
import { edgarTickerStatuses, fmpStatuses, gapOf, investedCapitalStatuses, keylessExtendedProfile, NOW, submissions, successorBundle, temporaryEquityStatuses, valuationStatuses } from "./helpers/gapCauseProducers";

const ROOT = path.join(__dirname, "..");

afterEach(() => {
  resetFmpPlanLimits();
  resetFmpAccess();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Producers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Dual write per site
// ---------------------------------------------------------------------------

describe("D-229 dual write: each producer writes its code beside the unchanged sentence", () => {
  it("lists each gap code once, never sharing a name with a conflict code", () => {
    expect(new Set(GAP_CAUSES).size).toBe(GAP_CAUSES.length);
    expect(GAP_CAUSES.filter((code) => (STATEMENT_CONFLICT_CAUSES as readonly string[]).includes(code))).toEqual([]);
  });

  it("FMP client: quota (P1), empty array (P2, P3, P5), no key (P5), symbol restriction (P7a); other statuses carry none", async () => {
    const s = await fmpStatuses();
    expect(gapOf(s.quota)).toMatchObject({ cause: "fmp-quota", reason: expect.stringMatching(/^FMP quota\/rate limit \(HTTP 429\)/) });
    for (const empty of [s.empty, s.segmentation]) expect(gapOf(empty)).toMatchObject({ cause: "fmp-empty-array", reason: FMP_EMPTY_ARRAY_REASON, severity: "info" });
    expect(gapOf(s.noKey)).toMatchObject({ cause: "fmp-no-api-key", reason: "no API key + no fixture", severity: "warn" });
    expect(gapOf(s.symbol)).toMatchObject({ cause: "fmp-symbol-restricted", expected: true, reason: expect.stringContaining("this symbol is unavailable on this endpoint") });
    for (const control of [s.endpoint, s.objectBody, s.httpError]) expect("cause" in gapOf(control), JSON.stringify(control)).toBe(false);
  });

  it("EDGAR ticker lookup: a ticker missing from company_tickers.json (P5); a transport failure carries none", async () => {
    const s = await edgarTickerStatuses();
    expect(gapOf(s.notListed)).toEqual({ field: "edgar.tickerToCik(ZZZZ)", reason: 'ticker "ZZZZ" not in SEC company_tickers.json', severity: "warn",
      attemptedSources: [expect.stringContaining("company_tickers.json")], cause: "sec-ticker-not-listed" });
    expect("cause" in gapOf(s.httpError)).toBe(false);
  });

  it("annual filing: a successor's unlinked predecessor (P4), on the filing gap and every section gap that quotes it", async () => {
    const successor = gapOf(selectAnnualFiling(submissions(["8-K12B", "10-Q"]), "EXMP"));
    expect(successor).toMatchObject({ cause: "sec-unlinked-predecessor", reason: expect.stringContaining(UNLINKED_PREDECESSOR_TEXT) });
    expect("cause" in gapOf(selectAnnualFiling(submissions(["10-Q"]), "NEW"))).toBe(false);
    const bundle = await successorBundle();
    for (const member of ["latestTenK", "item1a", "mdna", "business", "tenKNotes"] as const) {
      const gap = gapOf(bundle.edgar[member] as FetchResult<unknown>);
      expect(gap.reason, member).toContain(UNLINKED_PREDECESSOR_TEXT);
      expect(gap.cause, member).toBe("sec-unlinked-predecessor");
    }
    // The same bundle's FMP empty arrays carry their code; segmentation's rewrite does not (below).
    expect(gapOf(bundle.profile)).toMatchObject({ cause: "fmp-empty-array", reason: FMP_EMPTY_ARRAY_REASON });
  });

  it("temporary-equity enrichment: a withheld balance date and an unmatched category (G5)", () => {
    const s = temporaryEquityStatuses();
    for (const gaps of [s.otherIssuer, s.noSecPeriod]) {
      expect(gaps).toEqual([expect.objectContaining({ field: "statements.balance.2024-12-31.temporaryEquity", severity: "warn",
        reason: expect.stringMatching(/^temporary-equity SEC enrichment withheld: /), cause: "temporary-equity-enrichment-withheld" })]);
    }
    expect(s.unmatched).toContainEqual(expect.objectContaining({ field: "statements.balance.2024-12-31.temporaryEquityAttributableToParent",
      reason: "temporary-equity SEC enrichment withheld: vendor A/L/permanent-equity operands are missing, conflicting, or do not match the temporary category's exact SEC filing scope",
      cause: "temporary-equity-operands-unmatched" }));
  });

  it("invested capital for the DCF: missing balance fields (G4), a refused temporary-equity claim and lease-emptied capital (G3)", () => {
    const s = investedCapitalStatuses();
    expect(s.fieldsMissing).toEqual([expect.objectContaining({ severity: "critical", reason: expect.stringMatching(/^balance-sheet fields missing for invested capital/), cause: "invested-capital-balance-fields-missing" })]);
    expect(s.temporaryRefused).toEqual([expect.objectContaining({ severity: "warn", reason: expect.stringMatching(/^Temporary equity refused for invested capital: /), cause: "invested-capital-temporary-equity-refused" })]);
    expect(s.leaseEmptied).toEqual([expect.objectContaining({ severity: "warn", reason: expect.stringMatching(/^Invested capital emptied by the operating-lease removal: /), cause: "invested-capital-lease-emptied" })]);
    // Control: non-positive capital is not one of the coded causes.
    expect(s.nonPositive).toEqual([expect.objectContaining({ severity: "critical", reason: expect.stringMatching(/^invested capital <= 0/) })]);
    expect("cause" in s.nonPositive[0]!).toBe(false);
  });

  it("valuation: the unprofitable-overlay DCF suppression (G1, G2), on the result's gap and in the run's gaps", () => {
    const { unprofitable, profitable } = valuationStatuses();
    expect(unprofitable.valuation.kind).toBe("dcf-suppressed");
    const coded = (gaps: readonly ManifestEntry[]) => gaps.filter((g) => g.field === "valuation.dcf" && g.cause === "dcf-unprofitable-overlay");
    expect(coded(unprofitable.valuation.gaps)).toEqual([expect.objectContaining({ severity: "info", reason: expect.stringMatching(/^DCF suppressed for unprofitable overlay/) })]);
    expect(coded(unprofitable.gaps)).toHaveLength(1);
    expect(collectGaps(profitable).filter(({ gap }) => gap.cause !== undefined)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rewrites that no longer state the cause drop the code
// ---------------------------------------------------------------------------

describe("D-229 rewrites: a sentence that no longer states the cause keeps no code", () => {
  it("1: the FIN-OTHER retained suppression replaces the unprofitable-overlay sentence (compute.ts)", () => {
    const { finOtherRetained } = valuationStatuses();
    const dcf = finOtherRetained.valuation.gaps.find((g) => g.field === "valuation.dcf");
    expect(dcf?.reason).toMatch(/^Prior DCF suppression retained/);
    expect(dcf !== undefined && "cause" in dcf).toBe(false);
    expect(collectGaps(finOtherRetained).filter(({ gap }) => gap.cause === "dcf-unprofitable-overlay")).toEqual([]);
  });

  it("2: an empty segmentation array becomes the expected structural gap (dataBundle.ts markSegmentationGapExpected)", async () => {
    const bundle = await successorBundle();
    for (const member of [bundle.segmentation.product, bundle.segmentation.geographic]) {
      const gap = gapOf(member as FetchResult<unknown>);
      expect(gap).toMatchObject({ severity: "info", expected: true, reason: expect.stringMatching(/^issuer does not report this revenue segmentation via FMP/) });
      expect("cause" in gap).toBe(false);
    }
  });

  it("3: a resolved predecessor replaces the unlinked clause (dataBundle.ts withResolvedPredecessor)", () => {
    const unlinked = selectAnnualFiling(submissions(["8-K12B", "10-Q"]), "EXMP");
    const section: FetchResult<unknown> = { ok: false, gap: { ...gapOf(unlinked), field: "edgar.item1a(EXMP)", reason: `no annual primary filing (10-K or 20-F) to extract from: ${gapOf(unlinked).reason}` } };
    for (const result of [unlinked, section]) {
      const resolved = gapOf(withResolvedPredecessor(result, { cik10: "0000034088", name: "EXXON MOBIL CORP" }));
      expect(resolved.reason).not.toContain(UNLINKED_PREDECESSOR_TEXT);
      expect(resolved.reason).toContain("its predecessor, EXXON MOBIL CORP (CIK 0000034088), was resolved");
      expect("cause" in resolved).toBe(false);
    }
    // Unresolved: the entry is returned as it was, code included.
    expect(withResolvedPredecessor(unlinked, null)).toBe(unlinked);
  });

  it("withoutGapCause returns an entry without a code as it is and never adds one", () => {
    const plain: ManifestEntry = { field: "x", reason: "y", severity: "info" };
    expect(withoutGapCause(plain)).toBe(plain);
    expect(withoutGapCause({ ...plain, cause: "fmp-quota" })).toEqual(plain);
  });
});

// ---------------------------------------------------------------------------
// Optionality
// ---------------------------------------------------------------------------

describe("D-229 optionality: an entry without a code is unresolved, never given one", () => {
  it("an entry stored before D-229 parses and stays without a code; an unknown value is refused, not mapped", () => {
    const legacy = { field: "fmp.profile(ZZZT)", reason: "no API key + no fixture", severity: "warn", attemptedSources: ["fixtures/fmp/profile/ZZZT.json"] };
    const parsed = ManifestEntrySchema.parse(legacy);
    expect(parsed).toEqual(legacy);
    expect("cause" in parsed).toBe(false);
    expect(ManifestEntrySchema.safeParse({ ...legacy, cause: "no-api-key-guess" }).success).toBe(false);
    expect(ManifestEntrySchema.safeParse({ ...legacy, cause: "vendor-sec-value-conflict" }).success).toBe(false);
    for (const cause of GAP_CAUSES) expect(ManifestEntrySchema.parse({ ...legacy, cause }).cause).toBe(cause);
  });

  it("a saved report without codes parses with every missing-data entry still without one", async () => {
    const { readFileSync } = await import("node:fs");
    const report = ReportSchema.parse(JSON.parse(readFileSync(path.join(ROOT, "fixtures", "report", "DEMO-current.json"), "utf8")));
    expect(report.appendix.missingData.length).toBeGreaterThan(0);
    expect(report.appendix.missingData.filter((entry) => "cause" in entry)).toEqual([]);
  });

  it("the agreement check counts an absent or unknown code as no code", () => {
    const legacy = { field: "fmp.quote(X)", reason: "FMP quota/rate limit (HTTP 429): slow down.", severity: "warn" };
    const report = agreementReport(collectGaps([legacy, { ...legacy, cause: "rate-limit-guess" }]));
    expect(report.sites.P1!.both).toBe(0);
    expect(report.sites.P1!.disagreements.map((d) => d.kind)).toEqual(["uncoded", "conflict"]);
  });
});

// ---------------------------------------------------------------------------
// Boundaries where a code must not travel
// ---------------------------------------------------------------------------

describe("D-229 boundaries: the code never reaches a model, a snapshot or the report summary", () => {
  it("the Stage C payload is byte-identical with and without the codes", () => {
    const bundle = completeCurrencyBundle({ burning: true, symbol: "TECHV" });
    const validation = validateBundle(bundle, { now: NOW });
    const computed = runStageB(bundle, { evIncludeLeases: false });
    expect(collectGaps(computed).some(({ gap }) => gap.cause !== undefined)).toBe(true);
    const payload = JSON.stringify(assembleContextPayload(bundle, computed, validation));
    expect(payload).not.toMatch(/"cause":"(?:dcf-unprofitable-overlay|fmp-|sec-|invested-capital-|temporary-equity-)/);
    expect(payload).toBe(JSON.stringify(assembleContextPayload(withoutGapCauses(bundle), withoutGapCauses(computed), validation)));
  });

  it("no request schema lets a model write a missing-data entry's code", () => {
    for (const schema of [judgeOutputToJsonSchema(), analystCaseToJsonSchema(), reportToJsonSchema()]) {
      const text = JSON.stringify(schema);
      for (const code of GAP_CAUSES) expect(text).not.toContain(`"${code}"`);
    }
  });

  it("a run-input snapshot of a bundle with codes has the bytes of the same bundle without them", async () => {
    const bundle = await successorBundle();
    expect(collectGaps(bundle).some(({ gap }) => gap.cause !== undefined)).toBe(true);
    const withCodes = captureRunInputSnapshot(bundle, { evIncludeLeases: false });
    expect(collectGaps(withCodes.content.bundle).filter(({ gap }) => gap.cause !== undefined)).toEqual([]);
    expect(withCodes.hash).toBe(captureRunInputSnapshot(withoutGapCauses(bundle), { evIncludeLeases: false }).hash);
  });

  it("no reader surface shows the code: app, header, Markdown, print and audit export render the same without it", () => {
    const bundle = completeCurrencyBundle({ burning: true, symbol: "TECHV" });
    const report: Report = buildDataOnlyReport({
      symbol: bundle.symbol, companyName: "Test Loss Co", generatedAt: "2026-07-06T12:00:00.000Z", model: "none", costUsd: 0,
      bundle, validation: { checks: [], flags: [], gaps: [] } as unknown as ValidationReport, computed: runStageB(bundle), costBreakdown: [], reason: "no analysis",
    });
    expect(report.appendix.missingData.filter((entry) => entry.cause === "dcf-unprofitable-overlay")).toHaveLength(1);
    const surfaces = (r: Report) => ({
      dossier: renderToStaticMarkup(createElement(ReportView, { report: r })),
      dossierSelected: renderToStaticMarkup(createElement(ReportView, { report: r, selectedReportId: 7 })),
      header: renderToStaticMarkup(createElement(ReportSnapshotHeader, { snapshot: r, reportId: 7, status: "done", actions: null })),
      markdown: reportToMarkdown(r), print: reportToPrintBody(r), printPage: reportToPrintHtml(r), audit: reportToAuditMarkdown(r),
    });
    const without = surfaces(withoutGapCauses(report));
    expect(surfaces(report)).toEqual(without);
    for (const text of Object.values(without)) expect(text).not.toContain("dcf-unprofitable-overlay");
    // Read back from storage, with and without the code (the stored read itself normalizes the report).
    const read = (r: Report) => parseStoredReportWithSafety(JSON.stringify(r))!.report;
    const stored = read(report);
    expect(stored.appendix.missingData.filter((entry) => entry.cause === "dcf-unprofitable-overlay")).toHaveLength(1);
    expect(surfaces(stored)).toEqual(surfaces(read(withoutGapCauses(report))));
  });

  it("withoutGapCauses keeps a field conflict's own code and returns uncoded parts as they are", () => {
    const conflict = { usable: false, reason: "vendor/SEC cash conflict", cause: "vendor-sec-value-conflict" };
    const plain = { gaps: [{ field: "a", reason: "b", severity: "warn" as const }] };
    expect(withoutGapCauses(plain)).toBe(plain);
    const stripped = withoutGapCauses({ fieldConflicts: { cash: conflict }, gaps: [{ field: "a", reason: "b", severity: "warn" as const, cause: "fmp-quota" as const }] });
    expect(stripped).toEqual({ fieldConflicts: { cash: conflict }, gaps: [{ field: "a", reason: "b", severity: "warn" }] });
  });
});

// ---------------------------------------------------------------------------
// Agreement
// ---------------------------------------------------------------------------

function expectAgreement(report: AgreementReport, label: string): void {
  const disagreements = Object.values(report.sites).flatMap((site) => site.disagreements);
  expect(disagreements, `${label}: ${JSON.stringify(disagreements, null, 1)}`).toEqual([]);
}

describe("D-229 agreement: each consumer's wording test and the code give the same answer", () => {
  it("on every entry the producers above write, and each site is exercised", async () => {
    const fmp = await fmpStatuses();
    const edgar = await edgarTickerStatuses();
    const produced = {
      fmp, edgar, bundle: await successorBundle(), temporaryEquity: temporaryEquityStatuses(),
      investedCapital: investedCapitalStatuses(), valuation: valuationStatuses(),
      annual: [selectAnnualFiling(submissions(["8-K12B", "10-Q"]), "EXMP"), selectAnnualFiling(submissions(["10-Q"]), "NEW")],
    };
    const report = agreementReport(collectGaps(produced));
    expectAgreement(report, "producers");
    for (const [id, site] of Object.entries(report.sites)) expect(site.both, `site ${id} has a positive case`).toBeGreaterThan(0);
    const { unprofitable, finOtherRetained, profitable } = produced.valuation;
    expect(g2Agreement(unprofitable.valuation)).toEqual({ wording: true, code: true, current: true });
    for (const control of [finOtherRetained, profitable]) expect(g2Agreement(control.valuation)).toEqual({ wording: false, code: false, current: false });
  });

  it("on the DEMO audit fixture rebuilt from current code (Stage B gaps and the report's missing data)", async () => {
    const result = await buildAuditFixtureComparison({
      fmpFixtures: path.join(ROOT, "fixtures", "fmp"),
      reportFixture: path.join(ROOT, "fixtures", "report", "DEMO-sample.json"),
    });
    const report = agreementReport(collectGaps(result.projection));
    expectAgreement(report, "DEMO");
    expect(report.sites["P5-key"]!.both).toBeGreaterThan(0);
  });

  it("D-242 (was D-229's one known disagreement): a keyless failure appended to FMP's empty-array profile carries its own code, so code and wording agree", async () => {
    // D-229 found that the keyless fallback appends its failure to FMP's empty-array sentence and kept
    // `fmp-empty-array`, while the confirmed-miss check (`reason === FMP_EMPTY_ARRAY_REASON`, job runner
    // and company page) never matched the longer sentence. D-242 writes `fmp-empty-array-fallback-failed`
    // on the extended entry: the code still says FMP returned an empty array (P3's containment reads it),
    // and the exact-status reader (P2, P5) does not pass it, as the sentence comparison did not.
    const { profile, members } = await keylessExtendedProfile();
    expect(profile.reason.startsWith(`${FMP_EMPTY_ARRAY_REASON}; `)).toBe(true);
    expect(profile.cause).toBe("fmp-empty-array-fallback-failed");
    expectAgreement(agreementReport(collectGaps([profile])), "keyless-extended profile");
    // Every other member's code is kept on its extended sentence, which still states that cause.
    for (const [member, result] of Object.entries(members)) {
      if (member === "profile" || result.ok) continue;
      expect(result.gap.cause, member).toBe("fmp-no-api-key");
    }
    // The sentence still states the empty array, so the containment test agrees with the code.
    expect(profile.reason.includes(FMP_EMPTY_ARRAY_REASON)).toBe(true);
  });
});
