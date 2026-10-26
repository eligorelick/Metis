import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cachedFetch, flushPendingRefreshes, listCachedBodies } from "@/cache/apiCache";
import { createDatabase, setDbForTests, type DatabaseHandle } from "@/db";
import { apiCache } from "@/db/schema";
import { lastCachedDgs10, resolveRiskFreeFallback, type CachedDgs10Row } from "@/pipeline/riskFreeFallback";
import { CACHED_DGS10_SERIES_ID } from "@/pipeline/riskFreeSeries";

/**
 * Audit 2026-10-22 B-4: a FRED cache row's key carries the request's
 * five-year window start, so yesterday's DGS10 row is never found under
 * today's key. The fallback reads every cached DGS10 row whatever its params.
 * In-memory SQLite only.
 */
let handle: DatabaseHandle;

beforeEach(() => {
  handle = createDatabase(":memory:");
  setDbForTests(handle.db);
});

afterEach(async () => {
  await flushPendingRefreshes();
  setDbForTests(null);
  try {
    handle.sqlite.close();
  } catch {
    // already closed by the test
  }
});

async function storeDgs10(start: string, obs: Array<{ date: string; value: number }>, units = "lin"): Promise<void> {
  await cachedFetch({
    provider: "fred",
    endpoint: "series/DGS10",
    params: { authMode: "keyed", start, end: null, units },
    ttlSeconds: 7_200,
    fetcher: async () => ({ body: { obs, endpoint: "https://api.stlouisfed.org/fred/series/observations", source: "fred" }, asOf: obs.at(-1)!.date }),
  });
}

describe("cached DGS10 rows across request windows", () => {
  it("lists every row of the endpoint and picks the newest observation", async () => {
    await storeDgs10("2021-10-20", [{ date: "2026-10-15", value: 4.1 }, { date: "2026-10-16", value: 4.08 }]);
    await storeDgs10("2021-10-21", [{ date: "2026-10-19", value: 4.04 }]);
    await storeDgs10("2021-10-21", [{ date: "2026-10-20", value: 50 }], "chg");
    await cachedFetch({ provider: "fred", endpoint: "series/DGS2", params: { start: "x" }, ttlSeconds: 60, fetcher: async () => ({ body: { obs: [{ date: "2026-10-21", value: 3.5 }] }, asOf: "2026-10-21" }) });
    // A row whose body cannot be decoded is skipped, not fatal.
    handle.db.insert(apiCache).values({ cacheKey: "fred|series/DGS10|corrupt", provider: "fred", endpoint: "series/DGS10", paramsJson: "{}", bodyJson: "{not json", fetchedAt: "2026-10-20T00:00:00Z", ttlSeconds: 60, asOf: "2026-10-20" }).run();

    const rows = listCachedBodies<CachedDgs10Row["data"]>("fred", "series/DGS10");
    expect(rows).toHaveLength(3);
    expect(lastCachedDgs10(rows, "2026-10-22")?.obs).toEqual({ date: "2026-10-19", value: 4.04 });

    const served = await resolveRiskFreeFallback("2026-10-22", {
      cachedDgs10Rows: async () => listCachedBodies<CachedDgs10Row["data"]>("fred", "series/DGS10"),
      treasuryParYield: async () => { throw new Error("must not be asked"); },
    });
    expect(served).toMatchObject({ ok: true, value: { data: { date: "2026-10-19", value: 4.04, seriesId: CACHED_DGS10_SERIES_ID }, asOf: "2026-10-19", stale: true } });
  });

  it("yields no rows rather than an error when the store cannot be read", () => {
    handle.sqlite.close();
    expect(listCachedBodies("fred", "series/DGS10")).toEqual([]);
  });
});
