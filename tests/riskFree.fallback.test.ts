import { describe, expect, it, vi } from "vitest";

import { riskFreePct } from "@/pipeline/compute";
import { buildDataBundle } from "@/pipeline/dataBundle";
import {
  businessDaysBetween,
  CACHED_DGS10_MAX_BUSINESS_DAYS,
  lastCachedDgs10,
  primaryRiskFreeAvailable,
  resolveRiskFreeFallback,
  riskFreeSourceLabel,
  riskFreeSubstitutionGap,
  type CachedDgs10Row,
  type RiskFreeFallbackObservation,
} from "@/pipeline/riskFreeFallback";
import { CACHED_DGS10_SERIES_ID, riskFreeSeriesText, TREASURY_PAR_CURVE_SERIES_ID } from "@/pipeline/riskFreeSeries";
import { computeWacc, waccDisclosure } from "@/pipeline/stageB/returns";
import type { DataBundle } from "@/pipeline/types";
import { createEdgarClient, type EdgarTransport } from "@/providers/edgar";
import { createFmpClient } from "@/providers/fmp";
import { makeLimiter } from "@/providers/http";
import { latestTenYearParYield, parseTreasuryParCurveCsv, treasuryParCurveUrl } from "@/providers/treasury";
import type { FetchResult } from "@/types/core";

/**
 * Audit 2026-10-22 B-4. Owner order for the risk-free rate: FRED DGS10 (keyed,
 * then fredgraph.csv) → FMP treasury → the last good cached DGS10 observation
 * (ten business days at most, dated) → the U.S. Treasury daily par yield curve
 * 10-year point. The WACC line names the source and date; with every source
 * down the WACC is withheld as before. No live network: every fetch is stubbed.
 */

const TREASURY_CSV = [
  "Date,\"1 Mo\",\"2 Mo\",\"3 Mo\",\"1 Yr\",\"2 Yr\",\"5 Yr\",\"10 Yr\",\"30 Yr\"",
  "10/23/2026,4.20,4.18,4.10,3.90,3.60,3.70,4.06,4.60",
  "10/22/2026,4.21,4.19,4.11,3.91,3.61,3.71,4.02,4.61",
  "10/21/2026,4.22,4.20,4.12,3.92,3.62,3.72,N/A,4.62",
].join("\n");

const csvResponse = (body: string) => new Response(body, { status: 200, headers: { "content-type": "text/csv" } });

describe("U.S. Treasury par yield curve client", () => {
  it("reads the 10 Yr column by header name, skipping rows after the analysis date and N/A cells", () => {
    expect(parseTreasuryParCurveCsv(TREASURY_CSV, "2026-10-22")).toEqual({ date: "2026-10-22", value: 4.02 });
    expect(parseTreasuryParCurveCsv(TREASURY_CSV, "2026-10-30")).toEqual({ date: "2026-10-23", value: 4.06 });
    // Only the N/A row is on or before the date: no observation, not a zero.
    expect(parseTreasuryParCurveCsv(TREASURY_CSV, "2026-10-21")).toBe("no-rows");
    // A reordered file still reads the 10-year column, and ISO dates are accepted.
    expect(parseTreasuryParCurveCsv("\"10 Yr\",Date\n3.99,2026-10-20\n", "2026-10-22")).toEqual({ date: "2026-10-20", value: 3.99 });
  });

  it("fails closed on anything that is not the par-curve CSV", () => {
    expect(parseTreasuryParCurveCsv("<!DOCTYPE html><html><title>Maintenance</title></html>", "2026-10-22")).toBeNull();
    expect(parseTreasuryParCurveCsv("Date,\"5 Yr\"\n10/22/2026,3.7\n", "2026-10-22")).toBeNull();
    // Impossible dates, unparseable or implausible yields are rows that do not count.
    expect(parseTreasuryParCurveCsv("Date,10 Yr\n13/40/2026,4.0\n10/22/2026,abc\n10/21/2026,400\n2026-1-5,4.1\n", "2026-10-22")).toBe("no-rows");
  });

  it("returns a dated, sourced observation and sends no key or identity", async () => {
    const fetchImpl = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>(async () => csvResponse(TREASURY_CSV));
    const result = await latestTenYearParYield("2026-10-22", { fetchImpl, timeoutMs: 0 });
    expect(result).toMatchObject({ ok: true, value: { data: { date: "2026-10-22", value: 4.02 }, asOf: "2026-10-22", source: "treasury" } });
    expect(String(fetchImpl.mock.calls[0]![0])).toBe(treasuryParCurveUrl(2026));
    expect(treasuryParCurveUrl(2026)).toContain("type=daily_treasury_yield_curve&field_tdr_date_value=2026");
    const headers = new Headers(fetchImpl.mock.calls[0]![1]?.headers);
    expect([...headers.keys()]).toEqual(["accept"]);
  });

  it("reads the previous year's file when the current year has no observation yet", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) =>
      String(url).includes("/2027/") ? csvResponse("Date,10 Yr\n") : csvResponse("Date,10 Yr\n12/31/2026,4.11\n"));
    const result = await latestTenYearParYield("2027-01-02", { fetchImpl, timeoutMs: 0 });
    expect(result).toMatchObject({ ok: true, value: { data: { date: "2026-12-31", value: 4.11 } } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const empty = await latestTenYearParYield("2027-01-02", { fetchImpl: async () => csvResponse("Date,10 Yr\n"), timeoutMs: 0 });
    expect(empty).toMatchObject({ ok: false, gap: { field: "riskFree.treasuryParCurve", reason: expect.stringContaining("no 10-year observation on or before 2027-01-02 in the 2026 file") } });
  });

  it("files an HTTP error, a network error or an HTML page as a gap and propagates a caller abort", async () => {
    const http = await latestTenYearParYield("2026-10-22", { fetchImpl: async () => new Response("", { status: 503 }), timeoutMs: 0 });
    expect(http).toMatchObject({ ok: false, gap: { reason: "U.S. Treasury par yield curve unavailable: HTTP 503", attemptedSources: ["treasury"] } });
    const network = await latestTenYearParYield("2026-10-22", { fetchImpl: async () => { throw new Error("connect ECONNREFUSED"); }, timeoutMs: 5 });
    expect(network).toMatchObject({ ok: false, gap: { reason: expect.stringContaining("network error: connect ECONNREFUSED") } });
    const html = await latestTenYearParYield("2026-10-22", { fetchImpl: async () => new Response("<html></html>", { status: 200 }), timeoutMs: 0 });
    expect(html).toMatchObject({ ok: false, gap: { reason: expect.stringContaining("no recognizable CSV") } });
    const abort = new AbortController();
    abort.abort(new Error("job cancelled"));
    await expect(latestTenYearParYield("2026-10-22", { signal: abort.signal, timeoutMs: 1_000, fetchImpl: async () => { throw new Error("aborted"); } })).rejects.toThrow(/job cancelled/);
    await expect(latestTenYearParYield("bad", {})).rejects.toThrow(/invalid date/);
  });
});

const row = (obs: Array<{ date: string; value: number }>, fetchedAt: string, units = "lin"): CachedDgs10Row => ({
  params: JSON.stringify({ authMode: "keyed", end: null, start: "2021-10-01", units }),
  data: { obs },
  fetchedAt,
});

describe("the last good cached DGS10 observation", () => {
  it("counts business days, so a weekend does not age the observation", () => {
    expect(businessDaysBetween("2026-10-16", "2026-10-19")).toBe(1); // Friday → Monday
    expect(businessDaysBetween("2026-10-08", "2026-10-22")).toBe(10);
    expect(businessDaysBetween("2026-10-07", "2026-10-22")).toBe(11);
    expect(businessDaysBetween("not a date", "2026-10-22")).toBe(Number.POSITIVE_INFINITY);
    expect(CACHED_DGS10_MAX_BUSINESS_DAYS).toBe(10);
  });

  it("takes the newest finite percent-unit observation across every cached row", () => {
    const rows = [
      row([{ date: "2026-10-14", value: 4.1 }], "2026-10-15T00:00:00Z"),
      row([{ date: "2026-10-19", value: 4.0 }, { date: "2026-10-20", value: Number.NaN }], "2026-10-20T00:00:00Z"),
      row([{ date: "2026-10-21", value: 99 }], "2026-10-21T00:00:00Z", "chg"),
      row([{ date: "2026-10-30", value: 3.9 }], "2026-10-30T00:00:00Z"),
      { params: "not json", data: { obs: [{ date: "2026-10-21", value: 1 }] }, fetchedAt: "x" },
      { params: JSON.stringify({ units: "lin" }), data: {}, fetchedAt: "x" },
    ];
    expect(lastCachedDgs10(rows, "2026-10-22")).toEqual({ obs: { date: "2026-10-19", value: 4.0 }, fetchedAt: "2026-10-20T00:00:00Z" });
    expect(lastCachedDgs10([], "2026-10-22")).toBeNull();
  });

  it("serves a cached observation within ten business days, dated and marked stale, without asking Treasury", async () => {
    const treasuryParYield = vi.fn();
    const result = await resolveRiskFreeFallback("2026-10-22", {
      cachedDgs10Rows: async () => [row([{ date: "2026-10-08", value: 4.12 }], "2026-10-08T21:00:00Z")],
      treasuryParYield,
    });
    expect(result).toEqual({
      ok: true,
      value: {
        data: { date: "2026-10-08", value: 4.12, seriesId: CACHED_DGS10_SERIES_ID },
        asOf: "2026-10-08",
        source: "fred",
        endpoint: "api_cache series/DGS10 (last good observation)",
        fetchedAt: "2026-10-08T21:00:00Z",
        stale: true,
      },
    });
    expect(treasuryParYield).not.toHaveBeenCalled();
  });

  it("goes to the Treasury par curve when the cached observation is too old, and withholds when both fail", async () => {
    const old = async () => [row([{ date: "2026-10-07", value: 4.12 }], "2026-10-07T21:00:00Z")];
    const served = await resolveRiskFreeFallback("2026-10-22", {
      cachedDgs10Rows: old,
      treasuryParYield: async () => ({ ok: true, value: { data: { date: "2026-10-21", value: 4.01 }, asOf: "2026-10-21", source: "treasury", endpoint: "x", fetchedAt: "2026-10-22T06:00:00Z" } }),
    });
    expect(served).toMatchObject({ ok: true, value: { data: { date: "2026-10-21", value: 4.01, seriesId: TREASURY_PAR_CURVE_SERIES_ID }, source: "treasury" } });

    const none = await resolveRiskFreeFallback("2026-10-22", {
      cachedDgs10Rows: old,
      treasuryParYield: async () => ({ ok: false, gap: { field: "riskFree.treasuryParCurve", reason: "U.S. Treasury par yield curve unavailable: HTTP 503", severity: "warn" } }),
    });
    expect(none).toEqual({
      ok: false,
      gap: {
        field: "riskFree.fallback",
        reason: "risk-free fallback unavailable: last cached DGS10 observation (2026-10-07) is 11 business days old, beyond the 10-business-day limit; U.S. Treasury par yield curve unavailable: HTTP 503",
        severity: "warn",
        attemptedSources: ["fred (api_cache)", "treasury"],
      },
    });
    const empty = await resolveRiskFreeFallback("2026-10-22", {
      cachedDgs10Rows: async () => [],
      treasuryParYield: async () => ({ ok: false, gap: { field: "f", reason: "down", severity: "warn" } }),
    });
    expect(empty).toMatchObject({ ok: false, gap: { reason: "risk-free fallback unavailable: no cached DGS10 observation; down" } });
  });
});

describe("the substitution disclosure and the WACC line", () => {
  const dgs10Down: FetchResult<Array<{ date: string; value: number }>> = { ok: false, gap: { field: "macro.DGS10", reason: "FRED API returned a maintenance/HTML page (HTTP 200)", severity: "warn" } };
  const treasuryDown = { ok: false, gap: { field: "fmp.treasuryRates", reason: "HTTP 429", severity: "warn" } } as const;
  const treasuryUp = { ok: true, value: { data: { rows: [{ date: "2026-10-21T00:00:00", year10: 4.03 }] } } } as unknown as Parameters<typeof riskFreeSubstitutionGap>[1];
  const fallback: FetchResult<RiskFreeFallbackObservation> = { ok: true, value: { data: { date: "2026-10-21", value: 4.01, seriesId: TREASURY_PAR_CURVE_SERIES_ID }, asOf: "2026-10-21", source: "treasury", endpoint: "x", fetchedAt: "y" } };

  it("names the source that stood in, its date and why — and nothing when DGS10 served or nothing did", () => {
    expect(primaryRiskFreeAvailable(dgs10Down, treasuryDown)).toBe(false);
    expect(primaryRiskFreeAvailable(dgs10Down, treasuryUp)).toBe(true);
    expect(primaryRiskFreeAvailable({ ok: true, value: { data: [{ date: "2026-10-21", value: 4 }], asOf: "", source: "fred", endpoint: "", fetchedAt: "" } }, treasuryDown)).toBe(true);
    expect(riskFreeSubstitutionGap(dgs10Down, treasuryDown, fallback)).toEqual({
      field: "riskFree.substitution",
      reason: "risk-free rate served by the U.S. Treasury daily par yield curve 10 Yr (observation 2026-10-21) because FRED DGS10 had no observation and FMP treasury rates had no 10-year value",
      severity: "info",
      attemptedSources: ["fred", TREASURY_PAR_CURVE_SERIES_ID],
    });
    expect(riskFreeSubstitutionGap(dgs10Down, treasuryUp, undefined)?.reason).toBe(
      "risk-free rate served by FMP treasury rates 10-year (observation 2026-10-21) because FRED DGS10 had no observation",
    );
    expect(riskFreeSubstitutionGap(undefined, treasuryDown, undefined)).toBeNull();
    expect(riskFreeSubstitutionGap({ ok: true, value: { data: [{ date: "2026-10-21", value: 4 }], asOf: "", source: "fred", endpoint: "", fetchedAt: "" } }, treasuryDown, fallback)).toBeNull();
    expect(riskFreeSourceLabel(CACHED_DGS10_SERIES_ID)).toBe("the last cached FRED DGS10 observation");
    expect(riskFreeSourceLabel("other:id")).toBe("other:id");
  });

  it("prints the fallback source by name with its observation date on the WACC line", () => {
    const bundle = {
      treasury: treasuryDown,
      macro: { core: { DGS10: dgs10Down } },
      riskFreeFallback: fallback,
    } as unknown as DataBundle;
    const rf = riskFreePct(bundle);
    expect(rf).toEqual({ pct: 4.01, asOf: "2026-10-21", seriesId: TREASURY_PAR_CURVE_SERIES_ID });
    expect(riskFreePct({ ...bundle, riskFreeFallback: undefined })).toEqual({ pct: null, asOf: null, seriesId: null });

    const wacc = computeWacc({ beta: 1.1, riskFreePct: rf.pct, erpPct: 4.46, erpAsOf: "2026-10-15", interestExpenseTtm: 463e6,
      totalDebtAvg: 20_000e6, marketCap: 5e11, effectiveTaxRate: 0.16, ebitTtm: 50_000e6, analysisDate: "2026-10-22",
      riskFreeSeriesId: rf.seriesId, asOf: { riskFreeRate: rf.asOf ?? undefined } });
    expect(waccDisclosure(wacc).summary).toContain("risk-free 4.01% (U.S. Treasury par yield curve 10 Yr, observation 2026-10-21)");
    expect(riskFreeSeriesText(CACHED_DGS10_SERIES_ID)).toBe("FRED DGS10 last cached observation");
    expect(riskFreeSeriesText("fred:DGS10")).toBe("fred:DGS10");
    expect(riskFreeSeriesText(null)).toBe("series not stated");
  });
});

describe("buildDataBundle risk-free fallback wiring", { timeout: 60_000 }, () => {
  const NOW = new Date("2026-10-22T06:00:00.000Z");
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const edgar: EdgarTransport = {
    fetchText: async () => ({ status: 404, body: "not available", fetchedAt: NOW.toISOString(), fromCache: false, stale: false }),
  };
  async function build(opts: { dgs10Ok: boolean; treasuryOk: boolean; riskFreeFallback?: ((today: string) => Promise<FetchResult<RiskFreeFallbackObservation>>) | false }): Promise<DataBundle> {
    const fmpImpl = (async (input: string | URL | Request) => {
      const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const endpoint = new URL(raw).pathname.replace(/^.*\/stable\//, "");
      if (endpoint === "profile") return json([{ symbol: "EXMP", cik: "0000000123", sector: "Technology" }]);
      if (endpoint === "treasury-rates" && opts.treasuryOk) return json([{ date: "2026-10-21", year10: 4.03 }]);
      return json({ "Error Message": "not available in risk-free test" }, 401);
    }) as unknown as typeof fetch;
    return buildDataBundle("EXMP", {
      now: () => NOW,
      eodYears: 0,
      keyless: false,
      fmp: createFmpClient({ apiKey: "RF-FALLBACK-KEY", fetchImpl: fmpImpl, limiter: makeLimiter(1_000_000, 1_000_000), now: () => NOW, timeoutMs: 1_000 }),
      edgar: createEdgarClient({ transport: edgar }),
      fredFetch: async (seriesId) =>
        opts.dgs10Ok || seriesId !== "DGS10"
          ? { ok: true, value: { data: [{ date: "2026-10-21", value: 4.05 }], asOf: "2026-10-21", source: "fred", endpoint: `/series/${seriesId}`, fetchedAt: NOW.toISOString() } }
          : { ok: false, gap: { field: "macro.DGS10", reason: "FRED API returned a maintenance/HTML page (HTTP 200); fredgraph.csv returned a maintenance/HTML page (HTTP 200); retry after provider maintenance", severity: "warn", attemptedSources: ["fred"] } },
      finnhub: { apiKey: "TEST-KEY", fetchImpl: async () => json({}, 404), retryDelaysMs: [] },
      finra: { fetchImpl: async () => json({}, 404), retryDelaysMs: [], minRequestIntervalMs: 0 },
      companyIr: false,
      ...(opts.riskFreeFallback === undefined ? {} : { riskFreeFallback: opts.riskFreeFallback }),
    });
  }
  const treasuryServed = async (): Promise<FetchResult<RiskFreeFallbackObservation>> => ({
    ok: true,
    value: { data: { date: "2026-10-21", value: 4.01, seriesId: TREASURY_PAR_CURVE_SERIES_ID }, asOf: "2026-10-21", source: "treasury", endpoint: "home.treasury.gov daily Treasury par yield curve rates (10 Yr)", fetchedAt: NOW.toISOString() },
  });

  it("asks the fallback only when DGS10 and FMP treasury both have no value, and discloses the substitution", async () => {
    const fallback = vi.fn(treasuryServed);
    const bundle = await build({ dgs10Ok: false, treasuryOk: false, riskFreeFallback: fallback });
    expect(fallback).toHaveBeenCalledWith("2026-10-22");
    expect(riskFreePct(bundle)).toEqual({ pct: 4.01, asOf: "2026-10-21", seriesId: TREASURY_PAR_CURVE_SERIES_ID });
    expect(bundle.sourceManifest.riskFreeFallback).toMatchObject({ provider: "treasury", asOf: "2026-10-21" });
    const substitution = bundle.gaps.find((g) => g.field === "riskFree.substitution");
    expect(substitution).toMatchObject({ severity: "info", reason: expect.stringContaining("the U.S. Treasury daily par yield curve 10 Yr (observation 2026-10-21)") });
    expect(substitution?.expected).toBeUndefined();

    for (const healthy of [{ dgs10Ok: true, treasuryOk: false }, { dgs10Ok: false, treasuryOk: true }]) {
      const untouched = vi.fn(treasuryServed);
      const b = await build({ ...healthy, riskFreeFallback: untouched });
      expect(untouched).not.toHaveBeenCalled();
      expect(b.riskFreeFallback).toBeUndefined();
    }
  });

  it("files the fallback's own gap when it fails, and never reads the shared cache or Treasury.gov for an injected FRED", async () => {
    const failed = await build({ dgs10Ok: false, treasuryOk: false, riskFreeFallback: async () => ({ ok: false, gap: { field: "riskFree.fallback", reason: "risk-free fallback unavailable: no cached DGS10 observation; down", severity: "warn" } }) });
    expect(riskFreePct(failed).pct).toBeNull();
    expect(failed.gaps.some((g) => g.field === "riskFree.fallback")).toBe(true);
    expect(failed.gaps.some((g) => g.field === "riskFree.substitution")).toBe(false);

    const thrown = await build({ dgs10Ok: false, treasuryOk: false, riskFreeFallback: async () => { throw new Error("cache unreadable"); } });
    expect(thrown.gaps.find((g) => g.field === "riskFree.fallback")?.reason).toContain("cache unreadable");

    const injected = await build({ dgs10Ok: false, treasuryOk: false });
    expect(injected.riskFreeFallback).toBeUndefined();
    const disabled = await build({ dgs10Ok: false, treasuryOk: false, riskFreeFallback: false });
    expect(disabled.riskFreeFallback).toBeUndefined();
  });
});
