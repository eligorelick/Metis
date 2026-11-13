/**
 * D-229, D-242 (P10, P11): the producers of every missing-data entry whose cause a consumer
 * tells apart, as the pipeline writes them, plus controls that carry no code. Shared by
 * tests/gapCause.dualWrite.test.ts (the dual write) and tests/gapCause.readers.test.ts (the
 * switched readers decide as the wording did).
 */
import { vi } from "vitest";

import { supplementTemporaryEquity } from "@/edgar/temporaryEquityEnrichment";
import { runStageB } from "@/pipeline/compute";
import { buildDataBundle } from "@/pipeline/dataBundle";
import { buildDcfAssumptions, type DcfAssumptionInputs, type DcfBalanceRow } from "@/pipeline/stageB/valuation";
import { createEdgarClient, EdgarClient, type EdgarFiling, type EdgarSubmissions, type EdgarTransport, type EdgarTransportResponse } from "@/providers/edgar";
import { createFmpClient, type FmpBalanceSheetRow, type FmpPayload, type FmpRawRow } from "@/providers/fmp";
import { applyKeylessFallbacks, type KeylessMembers } from "@/pipeline/keyless";
import { createYahooClient } from "@/providers/yahoo";
import { makeLimiter } from "@/providers/http";
import type { FetchResult, ManifestEntry, Sourced } from "@/types/core";
import { completeCurrencyBundle } from "./currencyBundle";

export const NOW = new Date("2026-07-06T00:00:00.000Z");

export const json = (body: unknown, status = 200) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
export const liveFmp = (fetchImpl: typeof fetch, apiKey = "d229-test-key") =>
  createFmpClient({ apiKey, fetchImpl, limiter: makeLimiter(10_000, 10_000) });
export const SYMBOL_DENIED = "Premium Query Parameter: Special Endpoint : This value set for symbol is not available under your current subscription.";
export const ENDPOINT_DENIED = "Restricted Endpoint: This endpoint is not available under your current subscription. Please visit our subscription page to upgrade your plan.";

/** Every FMP status a consumer tells apart by wording, plus controls that carry no code. */
export async function fmpStatuses() {
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

export const tickers = JSON.stringify({ 0: { cik_str: 1234567, ticker: "EXMP", title: "Example Successor Corp" } });
export const response = (body: string, status = 200): EdgarTransportResponse => ({ status, body, fetchedAt: "2026-07-06T00:00:00.000Z", fromCache: false, stale: false });

export async function edgarTickerStatuses() {
  const listed: EdgarTransport = { fetchText: () => Promise.resolve(response(tickers)) };
  const failing: EdgarTransport = { fetchText: () => Promise.resolve(response("unavailable", 404)) };
  return {
    notListed: await new EdgarClient({ transport: listed }).tickerToCik("ZZZZ"),
    httpError: await new EdgarClient({ transport: failing }).tickerToCik("ZZZZ"),
  };
}

export function filing(form: string): EdgarFiling {
  return { accessionNumber: "0001234567-26-000001", form, filingDate: "2026-03-01", reportDate: "2025-12-31", primaryDocument: "doc.htm" };
}
export function submissions(forms: string[]): Sourced<EdgarSubmissions> {
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
export async function successorBundle() {
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

export const VENDOR_ROW: FmpBalanceSheetRow = { cik: "0001769628", symbol: "CRWV", date: "2024-12-31", reportedCurrency: "USD",
  totalAssets: 100, totalLiabilities: 60, totalStockholdersEquity: 40 };
export const SEC_ROW = { ...VENDOR_ROW, temporaryEquityAttributableToParent: 5 } as FmpBalanceSheetRow;

export function temporaryEquityStatuses() {
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

export const dcfHistory = ["2025-12-31", "2024-12-31", "2023-12-31", "2022-12-31"].map((date) => ({ date, revenue: 1000, operatingIncome: 200, incomeBeforeTax: 180, incomeTaxExpense: 36 }));
export const dcfRow = (equity: number, extra: Record<string, unknown> = {}) =>
  ({ date: "2025-12-31", basis: "annual" as const, totalDebt: 0, totalStockholdersEquity: equity, cashAndShortTermInvestments: 0, ...extra });
export const dcfInputs = (balance: ReturnType<typeof dcfRow>): DcfAssumptionInputs => ({
  revenueCagr3yPct: 10, revenueCagr5yPct: 10, analystEstimates: null, waccPct: 9, riskFreePct: 4.48,
  incomeTtm: { date: "2025-12-31", revenue: 1000, operatingIncome: 200, incomeBeforeTax: 180, incomeTaxExpense: 36 },
  incomeHistory: dcfHistory, balance, capitalHistory: [], marketCap: 5000,
});
export const refusedClaim = { temporaryEquityAttributableToParent: 5, fieldConflicts: { temporaryEquityAttributableToParent: { usable: false, reason: "test refusal" } } };
// tests/stageB.branchFix1.audit20261027.test.ts I-1: a covered operating lease of 250M leaves 150M lease-inclusive, -100M without it.
export const leaseBase = {
  revenueCagr3yPct: 8, revenueCagr5yPct: 8, analystEstimates: null, waccPct: 10, riskFreePct: 4, marketCap: 20e9,
  incomeTtm: { date: "2026-03-31", revenue: 1000e6, operatingIncome: 200e6, incomeBeforeTax: 180e6, incomeTaxExpense: 36e6 },
  incomeHistory: [2023, 2024, 2025].map((y) => ({ date: `${y}-12-31`, revenue: 900e6, operatingIncome: 180e6, incomeBeforeTax: 160e6, incomeTaxExpense: 32e6 })),
};
export const leaseRow = (date: string, basis: "quarter" | "annual", equity: number): DcfBalanceRow => ({
  date, basis, totalDebt: 300e6, shortTermDebt: 10e6, longTermDebt: 40e6, operatingLeaseLiability: 250e6, capitalLeaseObligations: 250e6,
  financeLeaseLiability: 0, totalStockholdersEquity: equity, cashAndShortTermInvestments: 50e6,
});

export function investedCapitalStatuses() {
  const salesToCapital = (built: { gaps: ManifestEntry[] }) => built.gaps.filter((g) => g.field === "valuation.dcf.salesToCapital");
  return {
    fieldsMissing: salesToCapital(buildDcfAssumptions(dcfInputs(dcfRow(700, { totalStockholdersEquity: null })))),
    temporaryRefused: salesToCapital(buildDcfAssumptions(dcfInputs(dcfRow(700, refusedClaim)))),
    nonPositive: salesToCapital(buildDcfAssumptions(dcfInputs(dcfRow(-50, refusedClaim)))),
    leaseEmptied: salesToCapital(buildDcfAssumptions({ ...leaseBase, balance: leaseRow("2026-03-31", "quarter", -100e6),
      capitalHistory: [2024, 2025].map((y) => leaseRow(`${y}-12-31`, "annual", 500e6)) } as DcfAssumptionInputs)),
  };
}

export function brokerBundle() {
  const b = completeCurrencyBundle({ burning: true, sic: "6211", symbol: "BRKV" });
  if (!b.profile.ok || !b.profile.value.data.rows[0]) throw new Error("fixture profile missing");
  Object.assign(b.profile.value.data.rows[0], { sector: "Financial Services", industry: "Financial - Capital Markets" });
  for (const rows of [b.statements.incomeAnnual, b.statements.incomeQuarterly]) {
    if (!rows.ok) throw new Error("fixture income rows missing");
    for (const row of rows.value.data.rows) delete row.operatingIncome;
  }
  return b;
}

export function valuationStatuses() {
  return {
    // G1, G2: the unprofitable-overlay suppression.
    unprofitable: runStageB(completeCurrencyBundle({ burning: true, symbol: "TECHV" }), { evIncludeLeases: false }),
    // Rewrite 1: a FIN-OTHER issuer keeps the prior suppression under a new sentence (D-229 drops the code).
    finOtherRetained: runStageB(brokerBundle(), { evIncludeLeases: false }),
    profitable: runStageB(completeCurrencyBundle({ symbol: "PROFV" }), { evIncludeLeases: false }),
  };
}

export const gapOf = (result: FetchResult<unknown>): ManifestEntry => {
  if (result.ok) throw new Error("expected a gap");
  return result.gap;
};


const noKeyMember = (field: string): FetchResult<FmpPayload<FmpRawRow>> => ({ ok: false, gap: { field, reason: "no API key + no fixture", severity: "warn", cause: "fmp-no-api-key" } });

/**
 * D-229's known disagreement, end to end: FMP answers the profile with an empty array, the public
 * fallback is tried (EDGAR confirmed the issuer) and fails, and appends its failure to FMP's sentence.
 */
export async function keylessExtendedProfile(): Promise<{ profile: ManifestEntry; members: Record<string, FetchResult<unknown>> }> {
  const empty = await liveFmp(async () => json([]), "d229-keyless").profile("AAPL");
  const fmp = Object.fromEntries((["profile", "quote", "incomeAnnual", "incomeQuarterly", "balanceAnnual", "balanceQuarterly", "cashflowAnnual",
    "cashflowQuarterly", "eodPrices", "spy", "sectorEtf", "enterpriseValues", "marketCapHistory", "sharesFloat"] as const)
    .map((member) => [member, member === "profile" ? empty : noKeyMember(`fmp.${member}(AAPL)`)])) as unknown as KeylessMembers;
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
  return { profile: gapOf(out.members.profile), members: out.members as unknown as Record<string, FetchResult<unknown>> };
}
