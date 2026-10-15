import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildCacheKey, flushPendingRefreshes } from "@/cache/apiCache";
import { createDatabase, setDbForTests, type DatabaseHandle } from "@/db";
import { apiCache } from "@/db/schema";
import { makeFmpCachedFetch } from "@/pipeline/dataBundle";
import {
  createFmpClient,
  fmpCacheKey,
  FMP_TTLS,
  type CachedFetchFn,
  type FmpClient,
} from "@/providers/fmp";
import { makeLimiter } from "@/providers/http";

const FETCHED_AT = "2026-10-15T15:00:00.000Z";
const FETCHED_SECONDS = Date.parse(FETCHED_AT) / 1000;
const TEST_KEY = "future-quote-test-key";
type QuoteMethod = "quote" | "batchQuote";
let handle: DatabaseHandle;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FETCHED_AT);
  handle = createDatabase(":memory:");
  setDbForTests(handle.db);
});

afterEach(async () => {
  await flushPendingRefreshes();
  setDbForTests(null);
  handle.sqlite.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const json = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { "content-type": "application/json" },
});
const cacheRows = () => handle.db.select().from(apiCache).all();

function client(fetchImpl: typeof fetch, cachedFetch: CachedFetchFn = makeFmpCachedFetch()) {
  return createFmpClient({
    apiKey: TEST_KEY,
    fetchImpl,
    cachedFetch,
    limiter: makeLimiter(1000, 1000),
    now: () => new Date(),
  });
}

const request = (c: FmpClient, method: QuoteMethod) => method === "quote"
  ? c.quote("AAPL")
  : c.batchQuote(["AAPL", "MSFT"]);

const endpoint = (method: QuoteMethod) => method === "quote"
  ? fmpCacheKey("quote", { symbol: "AAPL" })
  : fmpCacheKey("batch-quote", { symbols: "AAPL,MSFT" });

describe.each<QuoteMethod>(["quote", "batchQuote"])("FMP %s timestamp admission", (method) => {
  it("rejects a future observation before durable storage and recovers on the next cold read", async () => {
    const future = FETCHED_SECONDS + 1; // Same calendar day, demonstrably later instant.
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json([{ symbol: "AAPL", price: 201, timestamp: future }]))
      .mockResolvedValueOnce(json([{ symbol: "AAPL", price: 200, timestamp: FETCHED_SECONDS }]));
    const c = client(fetchImpl);

    const rejected = await request(c, method);

    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.gap.reason).toMatch(/timestamp.*after.*cutoff/i);
      expect(rejected.gap.reason).toContain(String(future));
      expect(rejected.gap.reason).toContain(FETCHED_AT);
      expect(rejected).not.toHaveProperty("value");
      expect(JSON.stringify(rejected)).not.toContain(TEST_KEY);
    }
    expect(cacheRows()).toEqual([]);

    const recovered = await request(c, method);

    expect(recovered.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(cacheRows()).toHaveLength(1);
    expect(JSON.stringify(cacheRows())).not.toContain(TEST_KEY);
    if (recovered.ok) {
      expect(recovered.value.data.rows[0]?.timestamp).toBe(FETCHED_SECONDS);
      expect(recovered.value.fetchedAt).toBe(FETCHED_AT);
    }
  });

  it("keeps a legacy cached future observation rejected after wall time passes it", async () => {
    const future = FETCHED_SECONDS + 1;
    const body = [{ symbol: "AAPL", price: 201, timestamp: future }];
    const rawEnvelope = { body, status: 200, fetchedAt: FETCHED_AT };
    handle.db.insert(apiCache).values({
      cacheKey: buildCacheKey("fmp", endpoint(method), {}),
      provider: "fmp",
      endpoint: endpoint(method),
      paramsJson: "{}",
      bodyJson: JSON.stringify(rawEnvelope),
      fetchedAt: FETCHED_AT,
      ttlSeconds: FMP_TTLS[method] / 1000,
      asOf: "2026-10-15",
    }).run();
    // The poisoned row is still within its ordinary TTL, and its observation
    // is now in the past. Only its ORIGINAL acquisition cutoff proves lookahead.
    vi.setSystemTime("2026-10-15T15:10:00.000Z");
    const fetchImpl = vi.fn<typeof fetch>();

    const rejected = await request(client(fetchImpl), method);

    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.gap.reason).toContain(String(future));
      expect(rejected.gap.reason).toContain(FETCHED_AT);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(JSON.parse(cacheRows()[0]!.bodyJson)).toEqual(rawEnvelope);
  });

  it("accepts an observation at the exact acquisition cutoff", async () => {
    const result = await request(client(vi.fn(async () => json([
      { symbol: "AAPL", price: 200, timestamp: FETCHED_SECONDS },
    ]))), method);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.data.raw).toEqual([{ symbol: "AAPL", price: 200, timestamp: FETCHED_SECONDS }]);
      expect(result.value.asOf).toBe("2026-10-15");
    }
  });

  it("preserves a legitimate quote with no observation timestamp", async () => {
    const result = await request(client(vi.fn(async () => json([
      { symbol: "AAPL", price: 200 },
    ]))), method);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.data.rows[0]).not.toHaveProperty("timestamp");
      expect(result.value.data.raw).toEqual([{ symbol: "AAPL", price: 200 }]);
    }
  });

  it("does not reinterpret a millisecond timestamp as a valid quote observation", async () => {
    const timestamp = Date.parse(FETCHED_AT);
    const rejected = await request(client(vi.fn(async () => json([
      { symbol: "AAPL", price: 200, timestamp },
    ]))), method);

    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.gap.reason).toContain(String(timestamp));
      expect(rejected.gap.reason).toMatch(/unix seconds/i);
    }
    expect(cacheRows()).toEqual([]);
  });

  it("checks controlled numeric-string timestamps without changing the raw body", async () => {
    const future = String(FETCHED_SECONDS + 1);
    const rejected = await request(client(vi.fn(async () => json([
      { symbol: "AAPL", price: 200, timestamp: future },
    ]))), method);

    expect(rejected.ok).toBe(false);
    expect(cacheRows()).toEqual([]);
  });
});

describe("FMP quote timestamp scope", () => {
  it("uses an original cache cutoff even when the embedded loader timestamp is later", async () => {
    const cachedFetch: CachedFetchFn = async <T>() => ({
      fetchedAt: FETCHED_AT,
      value: {
        body: [{ symbol: "AAPL", price: 201, timestamp: FETCHED_SECONDS + 1 }],
        status: 200,
        fetchedAt: "2026-10-15T15:10:00.000Z",
      } as T,
    });
    vi.setSystemTime("2026-10-15T15:10:00.000Z");

    const result = await client(vi.fn<typeof fetch>(), cachedFetch).quote("AAPL");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.gap.reason).toContain(FETCHED_AT);
  });

  it("does not let a later cache write time override the original loader acquisition cutoff", async () => {
    const cachedFetch: CachedFetchFn = async <T>() => ({
      fetchedAt: "2026-10-15T15:10:00.000Z",
      value: {
        body: [{ symbol: "AAPL", price: 201, timestamp: FETCHED_SECONDS + 1 }],
        status: 200,
        fetchedAt: FETCHED_AT,
      } as T,
    });
    vi.setSystemTime("2026-10-15T15:10:00.000Z");

    const result = await client(vi.fn<typeof fetch>(), cachedFetch).quote("AAPL");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.gap.reason).toContain(FETCHED_AT);
  });

  it("rejects an observation after the client clock even when both acquisition times are future dated", async () => {
    const cachedFetch: CachedFetchFn = async <T>() => ({
      fetchedAt: "2026-10-15T15:10:00.000Z",
      value: {
        body: [{ symbol: "AAPL", price: 201, timestamp: FETCHED_SECONDS + 1 }],
        status: 200,
        fetchedAt: "2026-10-15T15:10:00.000Z",
      } as T,
    });

    const result = await client(vi.fn<typeof fetch>(), cachedFetch).quote("AAPL");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.gap.reason).toContain(FETCHED_AT);
      expect(result.gap.reason).toMatch(/client.*cutoff/i);
    }
  });

  it("rejects a demonstrably future legacy observation when acquisition metadata is absent", async () => {
    const cachedEnvelope = {
      body: [{ symbol: "AAPL", price: 201, timestamp: FETCHED_SECONDS + 1 }],
      status: 200,
    };
    const cachedFetch: CachedFetchFn = async <T>() => ({ value: cachedEnvelope as T });

    const result = await client(vi.fn<typeof fetch>(), cachedFetch).quote("AAPL");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.gap.reason).toContain(FETCHED_AT);
      expect(result.gap.reason).toMatch(/client.*cutoff/i);
    }
    expect(cachedEnvelope).not.toHaveProperty("fetchedAt");
  });

  it("accepts a valid scoped batch with past, boundary and unknown observations", async () => {
    const body = [
      { symbol: "AAPL", price: 200, timestamp: FETCHED_SECONDS - 1 },
      { symbol: "MSFT", price: 400, timestamp: FETCHED_SECONDS },
      { symbol: "GOOG", price: 150 },
    ];

    const result = await client(vi.fn(async () => json(body))).batchQuote(["AAPL", "MSFT", "GOOG"]);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.data.raw).toEqual(body);
  });

  it("rejects a whole scoped batch when only one issuer has a future observation", async () => {
    const result = await client(vi.fn(async () => json([
      { symbol: "AAPL", price: 200, timestamp: FETCHED_SECONDS - 1 },
      { symbol: "MSFT", price: 400, timestamp: FETCHED_SECONDS + 1 },
    ]))).batchQuote(["AAPL", "MSFT"]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.gap.reason).toContain("row 1");
    expect(cacheRows()).toEqual([]);
  });

  it("leaves explicitly synthetic fixture observations outside live admission", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const fixtures = createFmpClient({
      apiKey: "",
      fetchImpl,
      now: () => new Date("2000-01-01T00:00:00.000Z"),
    });

    const result = await fixtures.quote("DEMO");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.endpoint).toContain("[FIXTURE]");
      expect(result.value.stale).toBe(true);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(cacheRows()).toEqual([]);
  });
});
