import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase, setDbForTests, type DatabaseHandle } from "@/db";
import { apiCache, reports } from "@/db/schema";
import { buildCacheKey, flushPendingRefreshes } from "@/cache/apiCache";
import { fmpCacheKey } from "@/providers/fmp";
import { ReportSchema, REPORT_SPEC_VERSION } from "@/report/schema";
import { addToWatchlist, getWatchlistView } from "@/watchlist/watchlist";

const NOW = new Date("2026-10-16T12:00:00.000Z");
let handle: DatabaseHandle;
let network: ReturnType<typeof vi.fn>;

beforeEach(() => {
  handle = createDatabase(":memory:");
  setDbForTests(handle.db);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("FMP_API_KEY", "watchlist-test-key");
  network = vi.fn(async () => new Response("rejected", { status: 401 }));
  vi.stubGlobal("fetch", network);
  addToWatchlist("AAPL");
});

afterEach(async () => {
  await flushPendingRefreshes();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setDbForTests(null);
  handle.sqlite.close();
});

function seedCache(endpoint: "quote" | "earnings", options: {
  age?: number;
  body?: unknown;
  exchange?: unknown;
  fetchedAt?: string;
  provider?: string;
  corrupt?: boolean;
  compressed?: boolean;
  asOf?: string;
  cachedEndpoint?: string;
  paramsJson?: string;
  bodyGz?: Buffer;
} = {}) {
  const fetchedAt = options.fetchedAt ?? new Date(NOW.getTime() - (options.age ?? 60) * 1000).toISOString();
  const body = options.body ?? (endpoint === "quote"
    ? [{ symbol: "AAPL", name: "Apple Inc.", price: 211.5, changePercentage: 1.23,
      timestamp: Math.floor(Date.parse(fetchedAt) / 1000) }]
    : [{ symbol: "AAPL", date: "2026-10-30", epsActual: null, epsEstimated: 1.7 }]);
  const key = fmpCacheKey(endpoint, endpoint === "quote" ? { symbol: "AAPL" } : { symbol: "AAPL", limit: 40 });
  const text = options.corrupt ? "{broken" : JSON.stringify(options.exchange ?? {
    body, status: 200, fetchedAt,
    entityScope: { expectedSymbols: ["AAPL"], returnedSymbol: endpoint === "quote" ? "required" : "optional" },
  });
  handle.db.insert(apiCache).values({
    cacheKey: buildCacheKey("fmp", key, {}), provider: options.provider ?? "fmp", endpoint: options.cachedEndpoint ?? key,
    paramsJson: options.paramsJson ?? "{}", bodyJson: options.compressed ? "" : text,
    bodyGz: options.bodyGz ?? (options.compressed ? gzipSync(text) : null),
    fetchedAt, asOf: options.asOf ?? "2026-10-16", ttlSeconds: 900,
  }).run();
}

function seedReport() {
  const fixture = ReportSchema.parse(JSON.parse(readFileSync("fixtures/report/DEMO-sample.json", "utf8")));
  fixture.meta.symbol = "AAPL";
  if (!fixture.scores) throw new Error("sample scores required");
  fixture.scores.aspects.quality.dataCompleteness = 0.4;
  fixture.scores.aspects.valuation.dataCompleteness = 0.5;
  fixture.verdict.gradeStrip.quality.grade = "A";
  fixture.verdict.gradeStrip.valuation.grade = "B";
  handle.db.insert(reports).values({ symbol: "AAPL", createdAt: NOW.toISOString(), model: "saved-model",
    status: "done", reportJson: JSON.stringify(fixture), specVersion: REPORT_SPEC_VERSION }).run();
}

describe("default watchlist cache-only boundary", () => {
  it("renders saved reports on a cold cache without provider requests or durable writes", async () => {
    seedReport();
    const before = handle.db.select().from(reports).all();
    const [row] = await getWatchlistView();
    expect(row?.lastReportAt).toBe(NOW.toISOString());
    expect(row?.price).toBeNull();
    expect(row?.nextEarnings).toBeNull();
    expect(row?.grades?.quality).toBeNull();
    expect(row?.grades?.valuation).toBe("B");
    expect(row?.gradeLabels?.quality).toMatch(/limited evidence.*40%.*50%/i);
    expect(network).not.toHaveBeenCalled();
    expect(handle.db.select().from(reports).all()).toEqual(before);
    expect(handle.db.select().from(apiCache).all()).toEqual([]);
  });

  it.each([false, true])("reads eligible durable cache bodies (compressed=%s) without fetching", async (compressed) => {
    seedCache("quote", { compressed });
    seedCache("earnings", { compressed });
    const before = handle.db.select().from(apiCache).all();
    const [row] = await getWatchlistView();
    expect(row).toMatchObject({ price: 211.5, changePct: 1.23, nextEarnings: "2026-10-30", asOf: "2026-10-16" });
    expect(row?.priceStale).toBe(false);
    expect(network).not.toHaveBeenCalled();
    expect(handle.db.select().from(apiCache).all()).toEqual(before);
  });

  it("marks an eligible stale quote and never starts background refresh", async () => {
    seedCache("quote", { age: 3600 });
    const before = handle.db.select().from(apiCache).all();
    const [row] = await getWatchlistView();
    await flushPendingRefreshes();
    expect(row?.price).toBe(211.5);
    expect(row?.priceStale).toBe(true);
    expect(network).not.toHaveBeenCalled();
    expect(handle.db.select().from(apiCache).all()).toEqual(before);
  });

  it.each([
    { age: 900 + 7 * 86400 + 1 },
    { fetchedAt: "2026-10-17T00:00:00.000Z" },
    { fetchedAt: "invalid" },
    { provider: "yahoo" },
    { cachedEndpoint: "other" },
    { paramsJson: '{"symbol":"MSFT"}' },
    { asOf: "invalid" },
    { asOf: "2026-10-17" },
    { corrupt: true },
    { bodyGz: Buffer.from("invalid gzip") },
    { body: [{ symbol: "MSFT", price: 211.5 }] },
    { body: [{ symbol: "AAPL", price: "invalid" }] },
    { exchange: { body: [{ symbol: "AAPL", price: 211.5 }], status: 402, fetchedAt: NOW.toISOString() } },
    { exchange: { body: [{ symbol: "AAPL", price: 211.5 }], status: 200, fetchedAt: "invalid" } },
    { exchange: {} },
    { exchange: { body: [{ symbol: "AAPL", price: 211.5 }], status: 200, fetchedAt: NOW.toISOString(),
      entityScope: { expectedSymbols: ["MSFT"], returnedSymbol: "required" } } },
  ])("suppresses ineligible cache data without self-healing or fetching: %j", async (options) => {
    seedCache("quote", options);
    const before = handle.db.select().from(apiCache).all();
    const [row] = await getWatchlistView();
    expect(row?.price).toBeNull();
    expect(network).not.toHaveBeenCalled();
    expect(handle.db.select().from(apiCache).all()).toEqual(before);
  });

  it("retains the stale flag at the exact TTL plus seven-day hard ceiling", async () => {
    seedCache("quote", { age: 900 + 7 * 86400 });
    const [row] = await getWatchlistView();
    expect(row?.price).toBe(211.5);
    expect(row?.priceStale).toBe(true);
    expect(network).not.toHaveBeenCalled();
  });

  it("does not call an older provider exchange fresh when cache metadata is newer", async () => {
    seedCache("quote", { exchange: {
      body: [{ symbol: "AAPL", price: 211.5 }], status: 200,
      fetchedAt: "2026-10-16T10:00:00.000Z",
      entityScope: { expectedSymbols: ["AAPL"], returnedSymbol: "required" },
    } });
    const [row] = await getWatchlistView();
    expect(row?.price).toBe(211.5);
    expect(row?.priceStale).toBe(true);
    expect(network).not.toHaveBeenCalled();
  });

  it("keeps misses cache-only even when no provider key is configured", async () => {
    vi.stubEnv("FMP_API_KEY", "");
    const [row] = await getWatchlistView();
    expect(row?.price).toBeNull();
    expect(network).not.toHaveBeenCalled();
    expect(handle.db.select().from(apiCache).all()).toEqual([]);
  });

  it("does not load synthetic fixture prices into navigation", async () => {
    addToWatchlist("DEMO");
    const rows = await getWatchlistView();
    expect(rows.find((row) => row.symbol === "DEMO")?.price).toBeNull();
    expect(network).not.toHaveBeenCalled();
  });

  it("degrades unreadable cache storage without falling back to provider work", async () => {
    handle.sqlite.exec("DROP TABLE api_cache");
    const [row] = await getWatchlistView();
    expect(row?.price).toBeNull();
    expect(row?.nextEarnings).toBeNull();
    expect(network).not.toHaveBeenCalled();
  });
});
