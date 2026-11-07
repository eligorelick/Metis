import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createDatabase, setDbForTests, type DatabaseHandle } from "@/db";
import { jobs } from "@/db/schema";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { captureRunInputSnapshot } from "@/pipeline/runInputSnapshot";
import { persistRunInputSnapshot } from "@/pipeline/runInputSnapshotStore";
import { readCompanyData, retainCompanyData, loadCompanyData } from "@/pipeline/companyData";
import { cachedFetch, withFreshCacheReads } from "@/cache/apiCache";

let handle: DatabaseHandle;
beforeEach(() => { handle = createDatabase(":memory:"); setDbForTests(handle.db); });
afterEach(() => { setDbForTests(null); handle?.sqlite.close(); });
it("recalls retained ticker data without calling providers, including after a new loader is created", async () => {
  const bundle = completeCurrencyBundle({});
  const fetcher = vi.fn(async () => bundle);
  await loadCompanyData(bundle.symbol, fetcher);
  const neverFetch = vi.fn(async () => { throw new Error("network should not run"); });
  expect((await loadCompanyData(bundle.symbol, neverFetch)).builtAt).toBe(bundle.builtAt);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(neverFetch).not.toHaveBeenCalled();
});
it("an explicit update replaces the retained bundle; a failed update keeps the old data", async () => {
  const bundle = completeCurrencyBundle({});
  retainCompanyData(bundle);
  const fresh = { ...bundle, builtAt: "2026-11-06T19:00:00.000Z" };
  await loadCompanyData(bundle.symbol, async () => fresh, true);
  await expect(loadCompanyData(bundle.symbol, async () => { throw new Error("offline"); }, true)).rejects.toThrow("offline");
  expect(readCompanyData(bundle.symbol)?.builtAt).toBe(fresh.builtAt);
  await expect(loadCompanyData(bundle.symbol, async () => ({ ...fresh, profile: { ok: false, gap: { field: "profile", reason: "offline", severity: "critical" } } }), true)).rejects.toThrow("retained inputs were not replaced");
  expect(readCompanyData(bundle.symbol)?.builtAt).toBe(fresh.builtAt);
});
it("recalls newer input data from a completed report run", () => {
  const bundle = completeCurrencyBundle({});
  handle.db.insert(jobs).values({ id: "run", symbol: bundle.symbol, status: "done", stepsJson: "[]", createdAt: bundle.builtAt, updatedAt: bundle.builtAt }).run();
  persistRunInputSnapshot("run", 0, captureRunInputSnapshot(bundle, { evIncludeLeases: false }), bundle.builtAt);
  expect(readCompanyData(bundle.symbol)?.symbol).toBe(bundle.symbol);
  expect(readCompanyData("A_DIFFERENT_TICKER")).toBeNull();
});
it("explicit updates wait for expired API data and reuse fresh responses", async () => {
  const fetcher = vi.fn(async () => ({ body: { price: 1 }, asOf: "2026-01-01" }));
  const options = { provider: "computed" as const, endpoint: "test", params: {}, ttlSeconds: 3600, fetcher };
  await cachedFetch(options);
  await withFreshCacheReads(() => cachedFetch(options));
  expect(fetcher).toHaveBeenCalledTimes(1);
  handle.sqlite.prepare("UPDATE api_cache SET fetchedAt = '2000-01-01T00:00:00.000Z'").run();
  fetcher.mockResolvedValue({ body: { price: 2 }, asOf: "2026-11-06" });
  expect((await withFreshCacheReads(() => cachedFetch(options))).data.price).toBe(2);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("skips newer failed-run inputs and recalls the last usable run or ticker snapshot", () => {
  const good = completeCurrencyBundle({});
  const failed = { ...good, builtAt: "2026-11-06T19:00:00.000Z", profile: { ok: false as const, gap: { field: "profile", reason: "offline", severity: "critical" as const } } };
  for (const [id, bundle] of [["good", good], ["failed", failed]] as const) {
    handle.db.insert(jobs).values({ id, symbol: bundle.symbol, status: id === "good" ? "done" : "error", stepsJson: "[]", createdAt: bundle.builtAt, updatedAt: bundle.builtAt }).run();
    persistRunInputSnapshot(id, 0, captureRunInputSnapshot(bundle, { evIncludeLeases: false }), bundle.builtAt);
  }
  expect(readCompanyData(good.symbol)?.builtAt).toBe(good.builtAt);
  retainCompanyData(good);
  expect(readCompanyData(good.symbol)?.builtAt).toBe(good.builtAt);
});
