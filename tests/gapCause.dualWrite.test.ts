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

import { supplementTemporaryEquity } from "@/edgar/temporaryEquityEnrichment";
import { runStageB } from "@/pipeline/compute";
import { buildDataBundle, selectAnnualFiling, withResolvedPredecessor } from "@/pipeline/dataBundle";
import { applyKeylessFallbacks, type KeylessMembers } from "@/pipeline/keyless";
import { captureRunInputSnapshot } from "@/pipeline/runInputSnapshot";
import { withoutGapCause, withoutGapCauses } from "@/pipeline/stageA/manifest";
import { validateBundle } from "@/pipeline/stageA/validate";
import { buildDcfAssumptions, type DcfAssumptionInputs, type DcfBalanceRow } from "@/pipeline/stageB/valuation";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { createEdgarClient, EdgarClient, type EdgarFiling, type EdgarSubmissions, type EdgarTransport, type EdgarTransportResponse } from "@/providers/edgar";
import { createFmpClient, FMP_EMPTY_ARRAY_REASON, resetFmpPlanLimits, type FmpBalanceSheetRow, type FmpPayload, type FmpRawRow } from "@/providers/fmp";
import { resetFmpAccess } from "@/providers/fmpAccess";
import { makeLimiter } from "@/providers/http";
import { createYahooClient } from "@/providers/yahoo";
import { analystCaseToJsonSchema, judgeOutputToJsonSchema, ManifestEntrySchema, reportToJsonSchema, ReportSchema } from "@/report/schema";
import type { FetchResult, ManifestEntry, Sourced } from "@/types/core";
import { GAP_CAUSES, STATEMENT_CONFLICT_CAUSES } from "@/types/refusalCause";
import { buildAuditFixtureComparison } from "./helpers/auditFixtureComparison";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { agreementReport, collectGaps, g2Agreement, UNLINKED_PREDECESSOR_TEXT, type AgreementReport } from "./helpers/gapCauseAgreement";

const ROOT = path.join(__dirname, "..");
const NOW = new Date("2026-07-06T00:00:00.000Z");

afterEach(() => {
  resetFmpPlanLimits();
  resetFmpAccess();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Producers
// ---------------------------------------------------------------------------

const json = (body: unknown, status = 200) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const liveFmp = (fetchImpl: typeof fetch, apiKey = "d229-test-key") =>
  createFmpClient({ apiKey, fetchImpl, limiter: makeLimiter(10_000, 10_000) });
const SYMBOL_DENIED = "Premium Query Parameter: Special Endpoint : This value set for symbol is not available under your current subscription.";
const ENDPOINT_DENIED = "Restricted Endpoint: This endpoint is not available under your current subscription. Please visit our subscription page to upgrade your plan.";

/** Every FMP status a consumer tells apart by wording, plus controls that carry no code. */
async function fmpStatuses() {
  const empty = await liveFmp(async () => json([])).earnings("ZZZT");
  // P3 reads the segmentation result before markSegmentationGapExpected rewrites it.
  const segmentation = await liveFmp(async () => json([]), "d229-segments").revenueProductSegmentation("ZZZT", "annual");
  const objectBody = await liveFmp(async () => json({ unexpected: true })).earnings("ZZZU");
  const noKey = await createFmpClient({ apiKey: "" }).profile("ZZZT");
  const symbol = await liveFmp(async () => json(SYMBOL_DENIED, 402), "d229-symbol").quote("ZZZS");
  const endpoint = await liveFmp(async () => json(ENDPOINT_DENIED, 402), "d229-endpoint").quote("ZZZE");
  const httpError = await liveFmp(async () => json({ "Error Message": "plan limited" }, 400), "d229-http").earnings("ZZZH");
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const pending = liveFmp(async () => json({ "Error Message": "Limit Reach ." }, 429), "d229-quota").quote("ZZZQ");
  await vi.runAllTimersAsync();
  const quota = await pending;
  vi.useRealTimers();
  return { empty, segmentation, objectBody, noKey, symbol, endpoint, httpError, quota };
}

const tickers = JSON.stringify({ 0: { cik_str: 1234567, ticker: "EXMP", title: "Example Successor Corp" } });
const response = (body: string, status = 200): EdgarTransportResponse => ({ status, body, fetchedAt: "2026-07-06T00:00:00.000Z", fromCache: false, stale: false });

async function edgarTickerStatuses() {
  const listed: EdgarTransport = { fetchText: () => Promise.resolve(response(tickers)) };
  const failing: EdgarTransport = { fetchText: () => Promise.resolve(response("unavailable", 404)) };
  return {
    notListed: await new EdgarClient({ transport: listed }).tickerToCik("ZZZZ"),
    httpError: await new EdgarClient({ transport: failing }).tickerToCik("ZZZZ"),
  };
}

function filing(form: string): EdgarFiling {
  return { accessionNumber: "0001234567-26-000001", form, filingDate: "2026-03-01", reportDate: "2025-12-31", primaryDocument: "doc.htm" };
}
function submissions(forms: string[]): Sourced<EdgarSubmissions> {
  return {
    data: { cik: "0001234567", name: "Example Successor Corp", sic: null, sicDescription: null, fiscalYearEnd: "1231", stateOfIncorporation: null,
      tickers: ["EXMP"], exchanges: ["NYSE"], recentFilings: forms.map(filing), olderPages: [] },
    asOf: "2026-03-01", source: "edgar", endpoint: "submissions/CIK0001234567.json", fetchedAt: "2026-03-01T00:00:00.000Z",
  };
}

/**
 * A successor registrant (8-K12B, no annual report) built end to end with a live FMP client that
 * answers every request with an empty array: P2, P3 and P4 entries as the pipeline writes them.
 */
async function successorBundle() {
  const submissionsBody = JSON.stringify({
    cik: "0001234567", name: "Example Successor Corp", tickers: ["EXMP"], exchanges: ["NYSE"],
    filings: { files: [], recent: { accessionNumber: ["0001234567-26-000002", "0001234567-26-000001"], filingDate: ["2026-05-01", "2026-03-01"],
      reportDate: ["2026-03-31", ""], form: ["10-Q", "8-K12B"], primaryDocument: ["q1.htm", "succession.htm"] } },
  });
  const transport: EdgarTransport = {
    fetchText(url) {
      if (url.includes("company_tickers.json")) return Promise.resolve(response(tickers));
      if (url.includes("submissions/CIK0001234567.json")) return Promise.resolve(response(submissionsBody));
      if (url.includes("companyfacts/")) return Promise.resolve(response(JSON.stringify({ cik: 1234567, entityName: "Example Successor Corp", facts: {} })));
      return Promise.resolve(response("not found", 404));
    },
  };
  const unavailable = (): Promise<Response> => Promise.resolve(new Response("unavailable", { status: 404 }));
  return buildDataBundle("EXMP", {
    now: () => NOW, eodYears: 1,
    fmp: liveFmp(async () => json([]), "d229-successor"), edgar: createEdgarClient({ transport }), keyless: false,
    fred: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 },
    finnhub: { fetchImpl: unavailable, retryDelaysMs: [] },
    finra: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 },
  });
}

const VENDOR_ROW: FmpBalanceSheetRow = { cik: "0001769628", symbol: "CRWV", date: "2024-12-31", reportedCurrency: "USD",
  totalAssets: 100, totalLiabilities: 60, totalStockholdersEquity: 40 };
const SEC_ROW = { ...VENDOR_ROW, temporaryEquityAttributableToParent: 5 } as FmpBalanceSheetRow;

function temporaryEquityStatuses() {
  const filed = new Set(["2024-12-31"]);
  return {
    // `refuse`: the whole balance date is withheld.
    otherIssuer: supplementTemporaryEquity({ ...VENDOR_ROW, cik: "0000000009" }, [SEC_ROW], 1769628, filed).gaps,
    noSecPeriod: supplementTemporaryEquity(VENDOR_ROW, [], 1769628, filed).gaps,
    // One category: the SEC operands carry no compatible provenance, so they do not match.
    unmatched: supplementTemporaryEquity(VENDOR_ROW, [{ ...SEC_ROW, fieldProvenance: {
      temporaryEquityAttributableToParent: { source: "edgar", unit: "USD", periodStart: null, periodEnd: "2024-12-31", observedAt: "2026-07-06T00:00:00Z",
        tags: ["us-gaap/TemporaryEquityCarryingAmountAttributableToParent"], filings: [{ accn: "0001769628-25-000014", filed: "2025-05-15", form: "10-Q" }] },
    } } as FmpBalanceSheetRow], 1769628, filed).gaps,
  };
}

const dcfHistory = ["2025-12-31", "2024-12-31", "2023-12-31", "2022-12-31"].map((date) => ({ date, revenue: 1000, operatingIncome: 200, incomeBeforeTax: 180, incomeTaxExpense: 36 }));
const dcfRow = (equity: number, extra: Record<string, unknown> = {}) =>
  ({ date: "2025-12-31", basis: "annual" as const, totalDebt: 0, totalStockholdersEquity: equity, cashAndShortTermInvestments: 0, ...extra });
const dcfInputs = (balance: ReturnType<typeof dcfRow>): DcfAssumptionInputs => ({
  revenueCagr3yPct: 10, revenueCagr5yPct: 10, analystEstimates: null, waccPct: 9, riskFreePct: 4.48,
  incomeTtm: { date: "2025-12-31", revenue: 1000, operatingIncome: 200, incomeBeforeTax: 180, incomeTaxExpense: 36 },
  incomeHistory: dcfHistory, balance, capitalHistory: [], marketCap: 5000,
});
const refusedClaim = { temporaryEquityAttributableToParent: 5, fieldConflicts: { temporaryEquityAttributableToParent: { usable: false, reason: "test refusal" } } };
// tests/stageB.branchFix1.audit20261027.test.ts I-1: a covered operating lease of 250M leaves 150M lease-inclusive, -100M without it.
const leaseBase = {
  revenueCagr3yPct: 8, revenueCagr5yPct: 8, analystEstimates: null, waccPct: 10, riskFreePct: 4, marketCap: 20e9,
  incomeTtm: { date: "2026-03-31", revenue: 1000e6, operatingIncome: 200e6, incomeBeforeTax: 180e6, incomeTaxExpense: 36e6 },
  incomeHistory: [2023, 2024, 2025].map((y) => ({ date: `${y}-12-31`, revenue: 900e6, operatingIncome: 180e6, incomeBeforeTax: 160e6, incomeTaxExpense: 32e6 })),
};
const leaseRow = (date: string, basis: "quarter" | "annual", equity: number): DcfBalanceRow => ({
  date, basis, totalDebt: 300e6, shortTermDebt: 10e6, longTermDebt: 40e6, operatingLeaseLiability: 250e6, capitalLeaseObligations: 250e6,
  financeLeaseLiability: 0, totalStockholdersEquity: equity, cashAndShortTermInvestments: 50e6,
});

function investedCapitalStatuses() {
  const salesToCapital = (built: { gaps: ManifestEntry[] }) => built.gaps.filter((g) => g.field === "valuation.dcf.salesToCapital");
  return {
    fieldsMissing: salesToCapital(buildDcfAssumptions(dcfInputs(dcfRow(700, { totalStockholdersEquity: null })))),
    temporaryRefused: salesToCapital(buildDcfAssumptions(dcfInputs(dcfRow(700, refusedClaim)))),
    nonPositive: salesToCapital(buildDcfAssumptions(dcfInputs(dcfRow(-50, refusedClaim)))),
    leaseEmptied: salesToCapital(buildDcfAssumptions({ ...leaseBase, balance: leaseRow("2026-03-31", "quarter", -100e6),
      capitalHistory: [2024, 2025].map((y) => leaseRow(`${y}-12-31`, "annual", 500e6)) } as DcfAssumptionInputs)),
  };
}

function brokerBundle() {
  const b = completeCurrencyBundle({ burning: true, sic: "6211", symbol: "BRKV" });
  if (!b.profile.ok || !b.profile.value.data.rows[0]) throw new Error("fixture profile missing");
  Object.assign(b.profile.value.data.rows[0], { sector: "Financial Services", industry: "Financial - Capital Markets" });
  for (const rows of [b.statements.incomeAnnual, b.statements.incomeQuarterly]) {
    if (!rows.ok) throw new Error("fixture income rows missing");
    for (const row of rows.value.data.rows) delete row.operatingIncome;
  }
  return b;
}

function valuationStatuses() {
  return {
    // G1, G2: the unprofitable-overlay suppression.
    unprofitable: runStageB(completeCurrencyBundle({ burning: true, symbol: "TECHV" }), { evIncludeLeases: false }),
    // Rewrite 1: a FIN-OTHER issuer keeps the prior suppression under a new sentence (D-229 drops the code).
    finOtherRetained: runStageB(brokerBundle(), { evIncludeLeases: false }),
    profitable: runStageB(completeCurrencyBundle({ symbol: "PROFV" }), { evIncludeLeases: false }),
  };
}

const gapOf = (result: FetchResult<unknown>): ManifestEntry => {
  if (result.ok) throw new Error("expected a gap");
  return result.gap;
};

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

  it("no reader surface shows the code: app (both layouts), header, Markdown, print and audit export render the same without it", () => {
    const bundle = completeCurrencyBundle({ burning: true, symbol: "TECHV" });
    const report: Report = buildDataOnlyReport({
      symbol: bundle.symbol, companyName: "Test Loss Co", generatedAt: "2026-07-06T12:00:00.000Z", model: "none", costUsd: 0,
      bundle, validation: { checks: [], flags: [], gaps: [] } as unknown as ValidationReport, computed: runStageB(bundle), costBreakdown: [], reason: "no analysis",
    });
    expect(report.appendix.missingData.filter((entry) => entry.cause === "dcf-unprofitable-overlay")).toHaveLength(1);
    const surfaces = (r: Report) => ({
      classic: renderToStaticMarkup(createElement(ReportView, { report: r, layout: "classic" })),
      dossier: renderToStaticMarkup(createElement(ReportView, { report: r, layout: "dossier" })),
      dossierSelected: renderToStaticMarkup(createElement(ReportView, { report: r, layout: "dossier", selectedReportId: 7 })),
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
    expect(g2Agreement(unprofitable.valuation)).toEqual({ wording: true, code: true });
    for (const control of [finOtherRetained, profitable]) expect(g2Agreement(control.valuation)).toEqual({ wording: false, code: false });
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

  it("known disagreement: a keyless failure appended to FMP's empty-array profile keeps the code, and `===` no longer matches", async () => {
    // Listed in D-229 for the step that moves P2/P5 to the code. The appended sentence still states that
    // FMP returned an empty array, so the code stays (D-226's rule); the consumers' exact comparison
    // (`reason === FMP_EMPTY_ARRAY_REASON` in jobRunner.ts and the company page) fails on it. Today that
    // exact test also keeps such a ticker from being called unknown although EDGAR confirmed the issuer.
    const empty = await liveFmp(async () => json([]), "d229-keyless").profile("AAPL");
    const noKey = (field: string): FetchResult<FmpPayload<FmpRawRow>> => ({ ok: false, gap: { field, reason: "no API key + no fixture", severity: "warn", cause: "fmp-no-api-key" } });
    const fmp = Object.fromEntries((["profile", "quote", "incomeAnnual", "incomeQuarterly", "balanceAnnual", "balanceQuarterly", "cashflowAnnual",
      "cashflowQuarterly", "eodPrices", "spy", "sectorEtf", "enterpriseValues", "marketCapHistory", "sharesFloat"] as const)
      .map((member) => [member, member === "profile" ? empty : noKey(`fmp.${member}(AAPL)`)])) as unknown as KeylessMembers;
    const out = await applyKeylessFallbacks({
      symbol: "AAPL", today: "2026-07-06", eodFrom: "2021-07-06", sectorEtfSymbol: null, fmp, fmpKeyless: false, statementSource: "auto",
      edgarConfirmedIssuer: true,
      edgar: {
        cik: { ok: true, value: { data: { cik10: "0000320193", cik: 320193, ticker: "AAPL", title: "Apple Inc." }, asOf: "2026-07-06", source: "edgar", endpoint: "company_tickers.json", fetchedAt: NOW.toISOString() } },
        registrant: null,
        companyFacts: { ok: false, gap: { field: "edgar.companyFacts(AAPL)", reason: "EDGAR HTTP 503", severity: "warn" } },
      },
      yahoo: createYahooClient({ fetchImpl: (async () => new Response("unavailable", { status: 404 })) as unknown as typeof fetch, limiter: makeLimiter(1000, 1000), now: () => NOW, maxRetries: 0 }),
      annualPeriods: 10, quarterlyPeriods: 24, now: () => NOW, resolveSectorEtf: () => null,
    });
    const profile = gapOf(out.members.profile);
    expect(profile.reason.startsWith(`${FMP_EMPTY_ARRAY_REASON}; `)).toBe(true);
    expect(profile.cause).toBe("fmp-empty-array");
    const report = agreementReport(collectGaps([profile]));
    expect(report.sites["P2/P5-empty"]!.disagreements).toEqual([expect.objectContaining({ kind: "conflict", wording: false, code: true })]);
    // The sentence still states the empty array, so a containment test would agree with the code.
    expect(profile.reason.includes(FMP_EMPTY_ARRAY_REASON)).toBe(true);
  });
});
