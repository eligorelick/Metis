import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { validateBundle } from "@/pipeline/stageA/validate";
import { assembleContextPayload, NEWS_NEWEST_ROWS, PAYLOAD_BUDGETS, sampleNewsRows } from "@/pipeline/stageC/payload";
import { buildDataBundle, NEWS_EARLIER_ROWS, NEWS_EARLIER_WINDOWS } from "@/pipeline/dataBundle";
import { createFmpClient } from "@/providers/fmp";
import { createEdgarClient } from "@/providers/edgar";
import { makeLimiter } from "@/providers/http";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

// D-176. The bundle kept the provider's newest 50 news rows over 30 days and the payload showed the
// first 12, which for AAPL, MSFT and other heavily covered issuers spans hours: the model saw only the
// latest headlines. Six two-week windows from 8 to 90 days back are now fetched (the provider returns a
// window's newest rows first, so short windows are what spread the dates) and the payload samples them.
const day = (offset: number) => new Date(Date.UTC(2026, 6, 6) - offset * 86_400_000).toISOString().slice(0, 10);
const row = (offset: number, n = 0) => ({ publishedDate: `${day(offset)} 12:00:00`, publisher: "Wire", title: `Story ${offset}-${n}`, text: "x", url: `https://news.test/${offset}/${n}` });

describe("news sampling (D-176)", () => {
  it("keeps up to the row limit in today's order", () => {
    const rows = [row(0), row(1), row(2)];
    expect(sampleNewsRows(rows, 12)).toEqual({ rows, sampled: false, retained: 3 });
  });

  it("keeps the newest rows and spreads the rest across the older dates", () => {
    const sameDay = Array.from({ length: 50 }, (_, n) => row(0, n)); // a heavily covered issuer: 50 rows in one day
    const earlier = [8, 12, 15, 20, 25, 29, 35, 45, 60, 75, 89].map(offset => row(offset));
    const sample = sampleNewsRows([...sameDay, ...earlier], 12);
    expect(sample.sampled).toBe(true);
    expect(sample.rows).toHaveLength(12);
    expect(sample.rows.slice(0, NEWS_NEWEST_ROWS).every(r => String(r.publishedDate).startsWith(day(0)))).toBe(true);
    const older = sample.rows.slice(NEWS_NEWEST_ROWS).map(r => String(r.publishedDate).slice(0, 10));
    expect(older).toContain(day(89));
    expect(older.some(d => d <= day(31))).toBe(true);
  });

  it("removes duplicates across windows", () => {
    const dup = row(10);
    expect(sampleNewsRows([dup, { ...dup }, row(11)], 12).rows).toHaveLength(2);
  });

  it("carries earlier windows into the payload with a dated sampling note", () => {
    const bundle = completeCurrencyBundle({});
    const fetch = (rows: object[]) => ({ ok: true as const, value: { source: "fmp", endpoint: "news/stock", asOf: day(0), fetchedAt: bundle.builtAt, data: { rows } } });
    Object.assign(bundle, {
      news: fetch(Array.from({ length: 50 }, (_, n) => row(0, n))),
      newsEarlier: [fetch([row(9), row(20)]), fetch([row(29)]), fetch([row(40)]), fetch([row(70)]), fetch([row(88)])],
    });
    const payload = assembleContextPayload(bundle, runStageB(bundle), validateBundle(bundle as never));
    const notes = payload.news.notes.join("\n");
    expect(notes).toContain(`News sampled from 56 retained rows: the ${NEWS_NEWEST_ROWS} newest and ${PAYLOAD_BUDGETS.listRows - NEWS_NEWEST_ROWS} spread across earlier dates`);
    expect(notes).toContain(day(88));
    expect(notes).toContain(day(29));
  });

  it("ignores an earlier window from another source", () => {
    const bundle = completeCurrencyBundle({});
    const fetch = (source: string, rows: object[]) => ({ ok: true as const, value: { source, endpoint: "news", asOf: day(0), fetchedAt: bundle.builtAt, data: { rows } } });
    Object.assign(bundle, { news: fetch("finnhub", [row(0)]), newsEarlier: [fetch("fmp", [row(20)]), fetch("fmp", [row(50)])] });
    const notes = assembleContextPayload(bundle, runStageB(bundle), validateBundle(bundle as never)).news.notes.join("\n");
    expect(notes).not.toContain(day(20));
  });
});

function newsBundle(windowRows: (from: string) => object[] | "fail") {
  const now = () => new Date("2026-11-03T01:00:00Z");
  const newsCalls: { window: string; limit: string | null }[] = [];
  const unavailable = async () => new Response("unavailable", { status: 404 });
  const bundle = buildDataBundle("NEWSX", { now, keyless: false, companyIr: false,
    fmp: createFmpClient({ apiKey: "test", now, limiter: makeLimiter(10000, 10000), fetchImpl: async input => {
      const url = new URL(String(input));
      const endpoint = url.pathname.replace(/^.*\/stable\//, "");
      if (endpoint === "news/stock") {
        const from = url.searchParams.get("from")!, to = url.searchParams.get("to")!;
        newsCalls.push({ window: `${from}..${to}`, limit: url.searchParams.get("limit") });
        const rows = to === "2026-11-03" ? [{ symbol: "NEWSX", publishedDate: `${to} 10:00:00`, title: "newest", url: "https://n.test/newest" }] : windowRows(from);
        return rows === "fail" ? new Response("unavailable", { status: 500 }) : new Response(JSON.stringify(rows));
      }
      return new Response(JSON.stringify(endpoint === "profile" ? [{ symbol: "NEWSX", currency: "USD" }] : []));
    } }),
    edgar: createEdgarClient({ transport: { fetchText: async () => ({ status: 404, body: "missing", fetchedAt: now().toISOString(), fromCache: false, stale: false }) }, maxRps: 10000 }),
    fred: { fetchImpl: unavailable, minRequestIntervalMs: 0, retryDelaysMs: [] },
    finra: { fetchImpl: unavailable, minRequestIntervalMs: 0, retryDelaysMs: [] },
    finnhub: { fetchImpl: unavailable, retryDelaysMs: [] },
  });
  return { bundle, newsCalls };
}

describe("earlier news windows in Stage A (D-176)", () => {
  it("requests six contiguous two-week windows from 8 to 90 days back beside the newest feed", async () => {
    const { bundle, newsCalls } = newsBundle(from => [{ symbol: "NEWSX", publishedDate: `${from} 10:00:00`, title: `t ${from}`, url: `https://n.test/${from}` }]);
    const built = await bundle;
    expect(NEWS_EARLIER_WINDOWS).toHaveLength(6);
    expect(newsCalls.map(call => call.window).sort()).toEqual([
      "2026-08-05..2026-08-17", "2026-08-18..2026-08-31", "2026-09-01..2026-09-14", "2026-09-15..2026-09-28",
      "2026-09-29..2026-10-12", "2026-10-04..2026-11-03", "2026-10-13..2026-10-26",
    ]);
    expect(newsCalls.filter(call => call.window.endsWith("2026-11-03")).map(call => call.limit)).toEqual(["50"]);
    expect(newsCalls.filter(call => !call.window.endsWith("2026-11-03")).every(call => call.limit === String(NEWS_EARLIER_ROWS))).toBe(true);
    expect(built.newsEarlier).toHaveLength(6);
  });

  it("drops a failed or empty window without a gap in the news feed", async () => {
    const { bundle } = newsBundle(from => (from === "2026-08-05" ? "fail" : from === "2026-09-01" ? [] : [{ symbol: "NEWSX", publishedDate: `${from} 10:00:00`, title: `t ${from}`, url: `https://n.test/${from}` }]));
    const built = await bundle;
    expect(built.news).toMatchObject({ ok: true });
    expect(built.newsEarlier).toHaveLength(4);
    expect(built.gaps.filter(gap => gap.field.includes("stockNews"))).toEqual([]);
  });
});
