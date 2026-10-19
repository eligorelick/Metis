import { describe, expect, it } from "vitest";
import { buildDataBundle } from "@/pipeline/dataBundle";
import { runStageB } from "@/pipeline/compute";
import { validateBundle } from "@/pipeline/stageA/validate";
import { assembleContextPayload, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import { createEdgarClient, type EdgarTransport } from "@/providers/edgar";
import { createFmpClient } from "@/providers/fmp";
import { makeLimiter } from "@/providers/http";
import { readFileSync } from "node:fs";

describe("official material-event source wiring", () => {
  it.each(["indexed", "missing", "captured"])("uses Adobe's production registrant identity and actual publication shape (%s)", async mode => {
    const indexed = mode !== "missing";
    const now = () => new Date("2026-10-19T00:00:00Z");
    const home = "https://www.adobe.com/";
    const ir = "https://www.adobe.com/investor-relations.html";
    const news = "https://blog.adobe.com/";
    const release = "https://blog.adobe.com/en/publish/2026/09/23/adobe-completes-acquisition-of-topaz-labs";
    // Compact structural fixture, not a claim that every live index retains this older article.
    // The announcement's exact metadata name/format, main/h1/p/link structure
    // and operative statement were inspected at the source URL on 2026-10-19.
    const pages: Record<string, string> = {
      [home]: `<a href="${ir}">Investor Relations</a><a href="${news}">Adobe Blog</a><a href="https://unrelated.example/deal">News</a>`,
      [ir]: '<a href="https://news.adobe.com/">Newsroom</a>',
      [news]: indexed ? `<a href="${release}">Adobe completes acquisition of Topaz Labs</a>` : "No retained material headline.",
      [release]: '<html><head><meta name="publication-date" content="09-23-2026"></head><body><header></header><main><div><h1>Adobe completes acquisition of Topaz Labs</h1><p><picture><img alt="Adobe and Topaz Labs"></picture></p><p>Today, Adobe completed its <a href="https://news.adobe.com/news/2026/06/adobe-to-acquire-topaz-labs">acquisition of Topaz Labs</a>.</p></div></main></body></html>',
    };
    if (mode === "captured") for (const [url,file] of [[home,"home"],[news,"blog"],[release,"completion"]]) pages[url!] = readFileSync(`fixtures/company-ir/adobe-20261019/${file}.html`, "utf8");
    const attempted: string[] = [];
    const unavailable = async () => new Response("unavailable", { status: 404 });
    const bundle = await buildDataBundle("ADBE", { now, keyless: false,
      fmp: createFmpClient({ apiKey: "test", now, limiter: makeLimiter(10000, 10000), fetchImpl: (async input => {
        const endpoint = new URL(String(input)).pathname.replace(/^.*\/stable\//, "");
        return new Response(JSON.stringify(endpoint === "profile" ? [{ symbol: "ADBE", companyName: "Adobe Inc.", cik: "796343", website: home }] : []), { status: 200 });
      }) as typeof fetch }),
      edgar: createEdgarClient({ maxRps: 10000, transport: { async fetchText(url) {
        const body = url.includes("company_tickers.json") ? { "0": { cik_str: 796343, ticker: "ADBE", title: "ADOBE INC." } }
          : url.includes("submissions/") ? { cik: "0000796343", name: "ADOBE INC.", tickers: ["ADBE"], exchanges: ["Nasdaq"], filings: { files: [], recent: { accessionNumber: [], filingDate: [], reportDate: [], form: [], primaryDocument: [] } } }
          : { cik: 796343, entityName: "ADOBE INC.", facts: {} };
        return { status: 200, body: JSON.stringify(body), fetchedAt: now().toISOString(), stale: false, fromCache: false };
      } } }),
      fred: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 }, finnhub: { fetchImpl: unavailable, retryDelaysMs: [] }, finra: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 },
      companyIr: { now, lookup: async () => [{ address: "93.184.216.34", family: 4 }], fetchImpl: (async input => {
        attempted.push(String(input)); return new Response(pages[String(input)] ?? "missing", { status: pages[String(input)] ? 200 : 404, headers: { "content-type": "text/html" } });
      }) as typeof fetch },
    });
    if (indexed) {
      expect(bundle.companyIrMaterialEvents).toMatchObject({ ok: true, value: { data: { events: [{ symbol: "ADBE", status: "issuer-stated-completed", publishedAt: "2026-09-23", consideration: null, funding: null, authorityChain: mode === "captured" ? [news, release] : [home, news, release] }] } } });
      const payload = assembleContextPayload(bundle, runStageB(bundle), validateBundle(bundle, { now: now() }));
      expect(payload.filings.find(entry => entry.source === release)).toMatchObject({ asOf: "2026-09-23", text: expect.stringContaining("Today, Adobe completed") });
      if (mode === "captured") expect(payload.filings.find(entry => entry.source === release)?.sourceEvidence).toMatchObject({discoveryEvidence:{kind:"reviewed-issuer-index",indexUrl:news,indexSourceHash:expect.stringMatching(/^[a-f0-9]{64}$/)}});
    } else expect(bundle.companyIrMaterialEvents).toMatchObject({ ok: false, gap: { reason: expect.stringMatching(/bounded.*not evidence/i) } });
    expect(attempted).not.toContain("https://unrelated.example/deal");
  });
  it("carries guarded source discovery through DataBundle and its own citable payload excerpt", async () => {
    const now = () => new Date("2026-10-17T12:00:00.000Z");
    const fmpFetch = (async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
      const endpoint = url.pathname.replace(/^.*\/stable\//, "");
      if (endpoint === "news/press-releases") return new Response("subscription required", { status: 402 });
      return new Response(JSON.stringify(endpoint === "profile" ? [{ symbol: "EXM", companyName: "Example Group", cik: "1", website: "https://example.com" }] : []), { status: 200 });
    }) as typeof fetch;
    const transport: EdgarTransport = { async fetchText(url) {
      const body = url.includes("company_tickers.json") ? JSON.stringify({ "0": { cik_str: 1, ticker: "EXM", title: "Example Group" } })
        : url.includes("submissions/") ? JSON.stringify({ cik: "0000000001", name: "Example Group, Inc.", tickers: ["EXM"], exchanges: ["NYSE"], filings: { files: [], recent: { accessionNumber: [], filingDate: [], reportDate: [], form: [], primaryDocument: [] } } })
        : JSON.stringify({ cik: 1, entityName: "Example Group", facts: {} });
      return { status: 200, body, fetchedAt: now().toISOString(), fromCache: false, stale: false };
    } };
    const pages: Record<string, string> = {
      "https://example.com/": '<a href="https://ir.example.com/">Investor Relations</a>',
      "https://ir.example.com/": '<a href="/news/">News</a>',
      "https://ir.example.com/news/": '<a href="/news/deal">Example Group acquires Journey</a>',
      "https://ir.example.com/news/deal": '<html><head><meta property="article:published_time" content="2026-07-31"></head><body><h1>Example Group acquires Journey</h1><p>Example Group announced that it has acquired Journey, a trip planning platform.</p></body></html>',
    };
    const unavailable = async () => new Response("unavailable", { status: 404 });
    const bundle = await buildDataBundle("EXM", { now, keyless: false,
      fmp: createFmpClient({ apiKey: "test", fetchImpl: fmpFetch, limiter: makeLimiter(10000, 10000), now }),
      edgar: createEdgarClient({ transport, maxRps: 10000 }),
      fred: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 },
      finnhub: { fetchImpl: unavailable, retryDelaysMs: [] }, finra: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 },
      companyIr: { now, lookup: async () => [{ address: "93.184.216.34", family: 4 }], fetchImpl: (async (url) => new Response(pages[String(url)] ?? "missing", { status: pages[String(url)] ? 200 : 404, headers: { "content-type": "text/html" } })) as typeof fetch },
    });
    expect(bundle.companyIrMaterialEvents).toMatchObject({ ok: true, value: { data: { events: [{ consideration: null, funding: null }] } } });
    expect(bundle.sourceManifest.companyIrMaterialEvents).toMatchObject({ provider: "computed", asOf: "2026-07-31" });
    const payload = assembleContextPayload(bundle, runStageB(bundle), validateBundle(bundle, { now: now() }));
    const excerpt = payload.filings.find((entry) => entry.source === "https://ir.example.com/news/deal");
    expect(excerpt).toMatchObject({ title: expect.stringContaining("Official company news"), asOf: "2026-07-31", text: expect.stringContaining("has acquired Journey"), sourceEvidence: { kind: "issuer-statement", sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/), observedAt: now().toISOString() } });
    expect(payload.citationRegistry).toEqual(expect.arrayContaining([expect.objectContaining({ id: "https://ir.example.com/news/deal", asOf: "2026-07-31" })]));
    const prompt = serializePayloadForPrompt(payload);
    expect(prompt).toContain("issuer-statement");
    expect(prompt).toContain("not a comprehensive");
    expect(prompt).toContain("BEGIN_UNTRUSTED_SOURCE_DATA");
  });
});
