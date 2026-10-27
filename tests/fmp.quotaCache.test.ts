import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { flushPendingRefreshes } from "@/cache/apiCache";
import { createDatabase, setDbForTests, type DatabaseHandle } from "@/db";
import { apiCache } from "@/db/schema";
import { makeFmpCachedFetch } from "@/pipeline/dataBundle";
import { createFmpClient, resetFmpPlanLimits } from "@/providers/fmp";
import { makeLimiter } from "@/providers/http";

let handle: DatabaseHandle;

beforeEach(() => {
  handle = createDatabase(":memory:");
  setDbForTests(handle.db);
});

afterEach(async () => {
  await flushPendingRefreshes();
  setDbForTests(null);
  handle.sqlite.close();
  resetFmpPlanLimits();
});

function client(fetchImpl: typeof fetch) {
  return createFmpClient({
    apiKey: "quota-cache-key",
    fetchImpl,
    limiter: makeLimiter(1000, 1000),
    cachedFetch: makeFmpCachedFetch(),
    // Inside a US session, so the quote keeps its plain 15-minute TTL whenever
    // the suite runs (usSession.ts).
    now: () => new Date("2026-10-27T15:00:00Z"),
  });
}

describe("FMP quota cooldown and the durable response cache", () => {
  it.each([false, true])("preserves successful cached data and acquisition time while stale=$0", async (stale) => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => new URL(String(input)).pathname.endsWith("/quote")
      ? new Response(JSON.stringify([{ symbol: "AAPL", price: 200 }]), { status: 200 })
      : new Response("Limit Reach", { status: 402 }));
    const c = client(fetchImpl);
    expect((await c.quote("AAPL")).ok).toBe(true);
    expect((await c.profile("MSFT")).ok).toBe(false);
    const fetchedAt = new Date(Date.now() - (stale ? 16 * 60_000 : 60_000)).toISOString();
    handle.db.update(apiCache).set({ fetchedAt }).run();
    const before = handle.db.select().from(apiCache).all();

    const cached = await c.quote("AAPL");
    await flushPendingRefreshes();

    expect(cached).toMatchObject({ ok: true, value: { fetchedAt, data: { rows: [{ price: 200 }] } } });
    if (cached.ok) expect(cached.value.stale ?? false).toBe(stale);
    expect(handle.db.select().from(apiCache).all()).toEqual(before);
    expect(before).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("never persists quota error bodies or repeats a cold miss during the cooldown", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ "Error Message": "Limit Reach" }), { status: 200 }));
    const c = client(fetchImpl);
    expect((await c.quote("AAPL")).ok).toBe(false);
    expect((await c.quote("MSFT")).ok).toBe(false);
    expect(handle.db.select().from(apiCache).all()).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
