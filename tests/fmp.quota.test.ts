import { afterEach, describe, expect, it, vi } from "vitest";

import { createFmpClient, FMP_RATE_LIMIT_PROBE_MS, FMP_RATE_LIMIT_WAIT_BUDGET_MS, resetFmpPlanLimits, type FmpClientConfig } from "@/providers/fmp";
import { fetchWithPolicy, makeLimiter } from "@/providers/http";

const START = Date.parse("2026-10-16T12:00:00Z");
const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

function client(fetchImpl: typeof fetch, config: Partial<FmpClientConfig> = {}) {
  return createFmpClient({
    apiKey: "quota-test-secret",
    fetchImpl,
    limiter: makeLimiter(10_000, 10_000),
    ...config,
  });
}

afterEach(() => {
  resetFmpPlanLimits();
  vi.useRealTimers();
});

describe("FMP quota cooldown", () => {
  it("pays for one HTTP 429 and suppresses later symbols, endpoints, and clients", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    const fetchImpl = vi.fn(async () => json({ "Error Message": "Limit Reach . quota-test-secret" }, 429));
    const first = client(fetchImpl).quote("AAPL");
    await vi.runAllTimersAsync();
    const second = client(fetchImpl).quote("MSFT");
    await vi.runAllTimersAsync();
    const third = client(fetchImpl).profile("GOOG");
    await vi.runAllTimersAsync();
    const results = [await first, await second, await third];
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    for (const result of results) {
      expect(result).toMatchObject({ ok: false, gap: { reason: expect.stringContaining("HTTP 429") } });
      if (!result.ok) {
        expect(result.gap.reason).toMatch(/quota|rate limit/i);
        expect(result.gap.reason).toContain("Limit Reach");
        expect(result.gap.reason).not.toContain("quota-test-secret");
        expect(result.gap.reason).not.toContain("unparseable");
        expect(result.gap.expected).toBeUndefined();
      }
    }
  });

  it.each([
    { body: "Limit Reach . Please upgrade your plan", status: 402 },
    { body: { "Error Message": "Limit Reach . Please upgrade your plan" }, status: 200 },
    { body: { "Error Message": "Daily request limit reached. Try again later" }, status: 403 },
  ])("learns explicit quota failures at HTTP $status without treating them as subscription restrictions", async ({ body, status }) => {
    const fetchImpl = vi.fn(async () => typeof body === "string" ? new Response(body, { status }) : json(body, status));
    const c = client(fetchImpl);
    const first = await c.quote("AAPL");
    const second = await c.profile("MSFT");
    expect(first).toMatchObject({ ok: false, gap: { reason: expect.stringContaining(`HTTP ${status}`) } });
    expect(second).toMatchObject({ ok: false, gap: { reason: expect.stringMatching(/quota|rate limit/i) } });
    if (!first.ok) expect(first.gap.expected).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    { retryAfter: "2", duration: 2_000 },
    { retryAfter: "Fri, 16 Oct 2026 12:00:03 GMT", duration: 3_000 },
    { retryAfter: "999999999999", duration: 15 * 60_000 },
    { retryAfter: "Fri, 16 Oct 2099 12:00:00 GMT", duration: 15 * 60_000 },
    { retryAfter: "not-a-date", duration: 15 * 60_000 },
    { retryAfter: null, duration: 15 * 60_000 },
  ])("rechecks at a bounded expiry for Retry-After $retryAfter", async ({ retryAfter, duration }) => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    let clock = START;
    let limited = true;
    const fetchImpl = vi.fn(async () => limited
      ? new Response("Too many requests", { status: 429, headers: retryAfter === null ? {} : { "retry-after": retryAfter } })
      : json([{ symbol: "AAPL", price: 100 }]));
    const c = client(fetchImpl, { now: () => new Date(clock) });
    const first = c.quote("AAPL");
    await vi.runAllTimersAsync();
    expect((await first).ok).toBe(false);
    limited = false;
    clock += duration - 1;
    expect((await c.quote("AAPL")).ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    clock += 1;
    expect((await c.quote("AAPL")).ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not extend a cooldown indefinitely when the clock moves backwards", async () => {
    let clock = START;
    let limited = true;
    const fetchImpl = vi.fn(async () => limited
      ? new Response("Limit Reach", { status: 402 })
      : json([{ symbol: "AAPL", price: 100 }]));
    const c = client(fetchImpl, { now: () => new Date(clock) });
    await c.quote("AAPL");
    limited = false;
    clock -= 60_000;
    expect((await c.quote("AAPL")).ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("bounds remembered quota cooldowns without forgetting the newest credential", async () => {
    const denied = async () => new Response("Limit Reach", { status: 402 });
    const now = () => new Date(START);
    for (let index = 0; index <= 2_048; index++) {
      await client(denied, { apiKey: `bounded-quota-${index}`, now }).quote("AAPL");
    }
    const allowed = vi.fn(async () => json([{ symbol: "AAPL", price: 100 }]));
    expect((await client(allowed, { apiKey: "bounded-quota-0", now }).quote("AAPL")).ok).toBe(true);
    expect((await client(allowed, { apiKey: "bounded-quota-2048", now }).quote("AAPL")).ok).toBe(false);
    expect(allowed).toHaveBeenCalledTimes(1);
  });

  it("preserves caller cancellation while a quota cooldown is active", async () => {
    await client(async () => new Response("Limit Reach", { status: 402 })).quote("AAPL");
    const controller = new AbortController();
    const canceled = new DOMException("Report canceled", "AbortError");
    controller.abort(canceled);
    const fetchImpl = vi.fn(async () => json([{ symbol: "MSFT", price: 100 }]));
    await expect(client(fetchImpl, { signal: controller.signal }).quote("MSFT")).rejects.toBe(canceled);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("isolates cooldowns by credential and normalized provider base URL", async () => {
    const denied = vi.fn(async () => new Response("Limit Reach", { status: 402 }));
    const allowed = vi.fn(async () => json([{ symbol: "AAPL", price: 100 }]));
    await client(denied).quote("AAPL");
    expect((await client(allowed, { apiKey: "different-key" }).quote("AAPL")).ok).toBe(true);
    expect((await client(allowed, { baseUrl: "https://example.invalid/stable" }).quote("AAPL")).ok).toBe(true);
    expect((await client(allowed, { baseUrl: "https://financialmodelingprep.com/stable/" }).quote("AAPL")).ok).toBe(false);
    expect(allowed).toHaveBeenCalledTimes(2);
    const otherProvider = await fetchWithPolicy("https://example.invalid/other", undefined, {
      provider: "edgar", fetchImpl: allowed, limiter: makeLimiter(1000, 1000),
    });
    expect(otherProvider.ok).toBe(true);
  });

  it("rechecks after a limiter wait before sending an already queued request", async () => {
    const blocked = Promise.withResolvers<void>();
    const waiting = Promise.withResolvers<void>();
    const allowed = vi.fn(async () => json([{ symbol: "MSFT", companyName: "Microsoft" }]));
    const queued = client(allowed, {
      limiter: { ...makeLimiter(1000, 1000), take: async () => { waiting.resolve(); await blocked.promise; } },
    }).profile("MSFT");
    await waiting.promise;
    try {
      await client(async () => new Response("Limit Reach", { status: 402 })).quote("AAPL");
    } finally {
      blocked.resolve();
    }
    expect(await queued).toMatchObject({ ok: false, gap: { reason: expect.stringMatching(/quota|rate limit/i) } });
    expect(allowed).not.toHaveBeenCalled();
  });

  it("keeps another key's newer cooldown when a queued request rethrows its original observation", async () => {
    let clock = START;
    const now = () => new Date(clock);
    const blocked = Promise.withResolvers<void>();
    const waiting = Promise.withResolvers<void>();
    const allowed = vi.fn(async () => json([{ symbol: "MSFT", companyName: "Microsoft" }]));
    const denied = async () => new Response("Limit Reach", { status: 402 });
    const queued = client(allowed, {
      now,
      limiter: { ...makeLimiter(1000, 1000), take: async () => { waiting.resolve(); await blocked.promise; } },
    }).profile("MSFT");
    await waiting.promise;
    try {
      await client(denied, { now }).quote("AAPL");
      clock += 1_000;
      await client(denied, { now, apiKey: "other-limited-key" }).quote("AAPL");
    } finally {
      blocked.resolve();
    }
    expect((await queued).ok).toBe(false);
    expect((await client(allowed, { now, apiKey: "other-limited-key" }).profile("MSFT")).ok).toBe(false);
    expect(allowed).not.toHaveBeenCalled();
  });

  it("cancels a waiting caller without canceling or releasing the quota discovery owner", async () => {
    const response = Promise.withResolvers<Response>();
    const started = Promise.withResolvers<void>();
    const waiterController = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>(async () => { started.resolve(); return response.promise; });
    const owner = client(fetchImpl).quote("AAPL");
    await started.promise;
    try {
      const waiter = client(fetchImpl, { signal: waiterController.signal }).quote("MSFT");
      const canceled = new DOMException("Report canceled", "AbortError");
      const rejected = expect(waiter).rejects.toBe(canceled);
      waiterController.abort(canceled);
      await rejected;
      expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
      const survivor = client(fetchImpl).quote("GOOG");
      await Promise.resolve();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      response.resolve(new Response("Limit Reach", { status: 402 }));
      expect((await owner).ok).toBe(false);
      expect((await survivor).ok).toBe(false);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      response.resolve(new Response("Limit Reach", { status: 402 }));
      await owner;
    }
  });

  it.each([
    { status: 500, body: "Limit Reach", attempts: 8 },
    { status: 401, body: "Limit Reach", attempts: 2 },
    { status: 403, body: "Invalid API key", attempts: 2 },
    { status: 402, body: "The values for 'limit' must be between 0 and 5 based on your current subscription", attempts: 2 },
    { status: 200, body: { "Error Message": "Requested limit is too large" }, attempts: 2 },
    { status: 200, body: [{ symbol: "AAPL", price: 100, note: "Limit Reach" }], attempts: 2 },
  ])("does not learn a quota from auth, server, parameter, or data bodies ($status)", async ({ status, body, attempts }) => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async () => typeof body === "string" ? new Response(body, { status }) : json(body, status));
    const c = client(fetchImpl);
    const first = c.quote("AAPL");
    await vi.runAllTimersAsync();
    await first;
    const second = c.quote("AAPL");
    await vi.runAllTimersAsync();
    await second;
    expect(fetchImpl).toHaveBeenCalledTimes(attempts);
  });
});

/**
 * AMZN audit 2026-10-20, finding 2: one burst of HTTP 429s cost the run its
 * analyst consensus and the vendor balance sheet, because a refused request
 * was never asked again. A valuation-critical request now waits out the pause
 * once, inside a fixed bound, and says so when it is still refused.
 */
describe("FMP rate-limit retry for valuation-critical requests", () => {
  const estimates = [{ symbol: "AAPL", date: "2027-09-30", revenueAvg: 500 }];

  function clocked(fetchImpl: typeof fetch) {
    let clock = START;
    const slept: number[] = [];
    const c = client(fetchImpl, {
      now: () => new Date(clock),
      sleep: async (ms: number) => { slept.push(ms); clock += ms; },
    });
    return { c, slept };
  }

  it("waits out a vendor-stated pause inside the bound and asks again", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => ++calls === 1
      ? new Response("Too many requests", { status: 429, headers: { "retry-after": "20" } })
      : json(estimates));
    const { c, slept } = clocked(fetchImpl);
    const result = await c.retryRateLimited(() => c.analystEstimates("AAPL"));
    expect(result.ok).toBe(true);
    expect(slept).toEqual([20_000]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("probes once after one rate window when the vendor names no pause", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => ++calls === 1
      ? json({ "Error Message": "Limit Reach . Please upgrade your plan" }, 429)
      : json(estimates));
    const { c, slept } = clocked(fetchImpl);
    const result = await c.retryRateLimited(() => c.analystEstimates("AAPL"));
    expect(result.ok).toBe(true);
    expect(slept).toEqual([FMP_RATE_LIMIT_PROBE_MS]);
    expect(slept.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(FMP_RATE_LIMIT_WAIT_BUDGET_MS);
  });

  it("stops at the bound and names the wait in the gap when the limit persists", async () => {
    const fetchImpl = vi.fn(async () => json({ "Error Message": "Limit Reach . Please upgrade your plan" }, 429));
    const { c, slept } = clocked(fetchImpl);
    const result = await c.retryRateLimited(() => c.analystEstimates("AAPL"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.gap.reason).toContain("HTTP 429");
      expect(result.gap.reason).toMatch(/still refused after waiting 60 s \(bound 90 s\)/);
      expect(result.gap.severity).toBe("warn");
    }
    expect(slept.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(FMP_RATE_LIMIT_WAIT_BUDGET_MS);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not wait for a vendor-stated pause longer than the bound", async () => {
    const fetchImpl = vi.fn(async () => new Response("Too many requests", { status: 429, headers: { "retry-after": "600" } }));
    const { c, slept } = clocked(fetchImpl);
    const result = await c.retryRateLimited(() => c.analystEstimates("AAPL"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.gap.reason).toMatch(/pause exceeds the 90 s retry bound/);
    expect(slept).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns any other refusal untouched, without waiting", async () => {
    const fetchImpl = vi.fn(async () => json({ "Error Message": "Invalid API key" }, 401));
    const { c, slept } = clocked(fetchImpl);
    const result = await c.retryRateLimited(() => c.analystEstimates("AAPL"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.gap.reason).not.toMatch(/still refused|retry bound/);
    expect(slept).toEqual([]);
  });
});
