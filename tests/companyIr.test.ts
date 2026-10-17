import { describe, expect, it, vi } from "vitest";
import { discoverCompanyIrEarnings } from "@/providers/companyIr";

const native = vi.hoisted(() => ({ body: "", fail: false }));
// Native HTTPS is the external boundary. Keep public-address admission, pinned
// lookup, response streaming, extraction and event provenance real in this test.
vi.mock("node:https", async () => {
  const { EventEmitter } = await import("node:events");
  const { Readable } = await import("node:stream");
  return { request: (url: string, options: { lookup?: (host: string, options: object, callback: (error: Error | null, address: string, family: number) => void) => void }, callback: (response: unknown) => void) => {
    const req = new EventEmitter() as InstanceType<typeof EventEmitter> & { end: () => void };
    req.end = () => queueMicrotask(() => {
      if (native.fail || !options.lookup) { req.emit("error", new Error("recorded TLS transport failure")); return; }
      options.lookup(new URL(url).hostname, {}, (error, address, family) => {
        if (error || address !== "93.184.216.34" || family !== 4) { req.emit("error", new Error("unvalidated destination")); return; }
        callback(Object.assign(Readable.from([Buffer.from(native.body)]), { statusCode: 200, headers: { "content-type": "text/html", "set-cookie": ["a=1", "b=2"], "not-supplied": undefined } }));
      });
    });
    return req;
  } };
});

const issuer = { cik: "1", canonicalName: "Example Corporation", validAliases: ["Example"], verifiedWebsite: "https://example.com/" };
const now = () => new Date("2026-10-13T12:00:00.000Z");
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
const release = `<html><head><meta property="article:published_time" content="2026-09-24T08:00:00Z"></head><body><h1>Example to Announce Third Quarter 2026 Results</h1><p>Example announced it will release third quarter 2026 financial results on October 28, 2026 after market close.</p></body></html>`;

describe("bounded official IR announcement discovery", () => {
  it("reaches the news index when an IR homepage also lists older financial results", async () => {
    let requests = 0;
    const pages: Record<string, string> = {
      "https://example.com/": '<a href="https://investor.example.com/">Investor Relations</a>',
      "https://investor.example.com/": '<a href="/news/">Press Releases</a>' + Array.from({ length: 3 }, (_, i) => `<a href="/old/${i}">Example Reports Quarterly Financial Results</a>`).join(""),
      "https://investor.example.com/news/": '<a href="/new">Example to Announce Third Quarter Financial Results</a>',
      "https://investor.example.com/new": release,
    };
    const result = await discoverCompanyIrEarnings("https://example.com", "EXM", "2026-10-13", { issuer, now, lookup: publicLookup, fetchImpl: (async (url) => { requests++; return new Response(pages[String(url)] ?? "old results", { headers: { "content-type": "text/html" } }); }) as typeof fetch });
    expect(result.announcements).toMatchObject([{ ok: true, value: { data: { date: "2026-10-28", authorityChain: ["https://example.com/", "https://investor.example.com/", "https://investor.example.com/news/", "https://investor.example.com/new"] } } }]);
    expect(requests).toBeLessThanOrEqual(6);
  });
  it("follows the company's official IR relationship and index to public announcement without paid feeds", async () => {
    const pages: Record<string, string> = {
      "https://example.com/": '<a href="https://ir.example-investors.com/">Investor Relations</a>',
      "https://ir.example-investors.com/": '<a href="/news/">News and Press Releases</a>',
      "https://ir.example-investors.com/news/": '<a href="/release/quarter-2026">Example to Announce Third Quarter 2026 Financial Results</a>',
      "https://ir.example-investors.com/release/quarter-2026": release,
    };
    const result = await discoverCompanyIrEarnings("https://example.com", "EXM", "2026-10-13", { issuer, now, lookup: publicLookup, fetchImpl: (async (url) => new Response(pages[String(url)] ?? "missing", { status: pages[String(url)] ? 200 : 404, headers: { "content-type": "text/html" } })) as typeof fetch });
    expect(result.announcements[0]).toMatchObject({ ok: true, value: { data: { date: "2026-10-28", confirmation: "company_confirmed", announcedAt: "2026-09-24T08:00:00Z", authorityChain: ["https://example.com/", "https://ir.example-investors.com/", "https://ir.example-investors.com/news/", "https://ir.example-investors.com/release/quarter-2026"] } } });
  });
  it.each(["https://127.0.0.1/", "https://[::1]/", "http://example.com/", "https://user:pass@example.com/", "https://example.com:8443/"])("refuses non-public or credential-bearing seed %s before requesting", async (url) => {
    let requests = 0;
    const result = await discoverCompanyIrEarnings(url, "EXM", "2026-10-13", { issuer, now, lookup: publicLookup, fetchImpl: (async () => { requests++; return new Response(release); }) as typeof fetch });
    expect(result.announcements).toEqual([]);
    expect(requests).toBe(0);
  });
  it("rejects mixed public/private DNS and cross-origin redirects", async () => {
    let requests = 0;
    const blocked = await discoverCompanyIrEarnings("https://example.com", "EXM", "2026-10-13", { issuer, now, lookup: async () => [{ address: "93.184.216.34", family: 4 }, { address: "169.254.169.254", family: 4 }], fetchImpl: (async () => { requests++; return new Response(release); }) as typeof fetch });
    expect(blocked.announcements).toEqual([]);
    expect(requests).toBe(0);
    const redirected = await discoverCompanyIrEarnings("https://example.com", "EXM", "2026-10-13", { issuer, now, lookup: publicLookup, fetchImpl: (async () => new Response("", { status: 302, headers: { Location: "https://unrelated.example/release" } })) as typeof fetch });
    expect(redirected.announcements).toEqual([]);
  });
  it("requires publication evidence and stays within six requests despite an index with many releases", async () => {
    let requests = 0;
    const result = await discoverCompanyIrEarnings("https://example.com", "EXM", "2026-10-13", { issuer, now, lookup: publicLookup, fetchImpl: (async (url) => { requests++; return new Response(String(url) === "https://example.com/" ? '<a href="/investors/">Investors</a>' : String(url).endsWith("/investors/") ? Array.from({ length: 50 }, (_, i) => `<a href="/release/${i}">Announce Quarterly Financial Results</a>`).join("") : release.replace(/<meta[^>]+>/, ""), { headers: { "content-type": "text/html" } }); }) as typeof fetch });
    expect(result.announcements).toEqual([]);
    expect(requests).toBeLessThanOrEqual(6);
    expect(result.gaps.some((g) => /unavailable|unambiguous/i.test(g.reason))).toBe(true);
  });
  it("honors cancellation while DNS resolution is stalled", async () => {
    const result = await Promise.race([
      discoverCompanyIrEarnings("https://example.com", "EXM", "2026-10-13", { issuer, now, signal: AbortSignal.timeout(10), lookup: () => new Promise(() => {}) }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 150)),
    ]);
    expect(result).not.toBeNull();
    expect(result?.announcements).toEqual([]);
  });
  it("accepts an official profile website already at IR and explicit release-date markup", async () => {
    const article = release.replace(/<meta[^>]+>/, "").replace("<h1>", '<div class="news-details_date">09/24/2026</div><h1>');
    const result = await discoverCompanyIrEarnings("https://investor.example.com", "EXM", "2026-10-13", { issuer, now, lookup: publicLookup, fetchImpl: (async (url) => new Response(String(url) === "https://investor.example.com/" ? '<a href="/release/quarter">Announce Third Quarter Financial Results</a>' : article, { headers: { "content-type": "text/html" } })) as typeof fetch });
    expect(result.announcements[0]).toMatchObject({ ok: true, value: { data: { date: "2026-10-28", announcedAt: "2026-09-24" } } });
  });
  it("streams an official announcement through native TLS with the validated DNS address pinned", async () => {
    native.body = release;
    native.fail = false;
    const result = await discoverCompanyIrEarnings("https://investor.example.com/release", "EXM", "2026-10-13", { issuer, now, lookup: publicLookup });
    expect(result.announcements).toMatchObject([{ ok: true, value: { data: { date: "2026-10-28", announcedAt: "2026-09-24T08:00:00Z" } } }]);
    native.fail = true;
    try {
      const failed = await discoverCompanyIrEarnings("https://investor.example.com/release", "EXM", "2026-10-13", { issuer, now, lookup: publicLookup });
      expect(failed.announcements).toEqual([]);
      expect(failed.gaps[0]?.attemptedSources).toContain("https://investor.example.com/release");
    } finally { native.fail = false; }
  });
  it.each([
    '<script type="application/ld+json">{"datePublished":"2026-09-24"}</script>',
    '<time datetime="2026-09-24">September 24</time>',
    '<span class="published-date">September 24, 2026</span>',
  ])("preserves explicit publication date from supported public markup: %s", async (markup) => {
    const html = release.replace(/<meta[^>]+>/, markup);
    const result = await discoverCompanyIrEarnings("https://investor.example.com/release", "EXM", "2026-10-13", { issuer, now, lookup: publicLookup, fetchImpl: (async () => new Response(html, { headers: { "content-type": "text/html" } })) as typeof fetch });
    expect(result.announcements[0]).toMatchObject({ ok: true, value: { data: { date: "2026-10-28", announcedAt: "2026-09-24" } } });
  });
  it.each([
    '<p>Example will release quarterly financial results on <span class="published-date">September 24, 2026</span> and hold an investor conference on October 28, 2026.</p>',
    '<p>September 24, 2026 is when Example will release quarterly financial results and hold an investor conference on October 28, 2026.</p>',
    '<span class="date">September 24, 2026</span><p>Example will release quarterly financial results on October 28, 2026.</p>',
    '<span class="published-date">August 24, 2026</span><p>Example will release quarterly financial results on October 28, 2026.</p>',
  ])("leaves conflicting dates unconfirmed without matching standalone leading dateline proof: %s", async (body) => {
    const html = `<html><head><meta property="article:published_time" content="2026-09-24"></head><body>${body}</body></html>`;
    const result = await discoverCompanyIrEarnings("https://investor.example.com/release", "EXM", "2026-10-13", { issuer, now, lookup: publicLookup, fetchImpl: (async () => new Response(html, { headers: { "content-type": "text/html" } })) as typeof fetch });
    expect(result.announcements).toEqual([]);
  });
  it.each(["10.0.0.1", "172.20.0.1", "100.64.0.1", "192.168.1.2", "::1", "fe80::1", "2001:db8::1", "2001::1", "2001:0000::1", "2002:7f00:1::", "not-an-IP"])("refuses non-public DNS address %s before transport", async (address) => {
    let requests = 0;
    const result = await discoverCompanyIrEarnings("https://investor.example.com/release", "EXM", "2026-10-13", { issuer, now, lookup: async () => [{ address, family: address.includes(":") ? 6 : 4 }], fetchImpl: (async () => { requests++; return new Response(release); }) as typeof fetch });
    expect(result.announcements).toEqual([]);
    expect(requests).toBe(0);
  });
  it("ignores malformed links, external release links, duplicate navigation, non-HTML and unavailable responses", async () => {
    const company = '<a>no href</a><a href="%%%">non-investor</a><a href="https://investor.example.com/">Investor Relations</a>';
    const index = '<a href="/">Investor Relations</a><a href="https://attacker.org/release">Announce Quarterly Financial Results</a><a href="/bad">Announce Quarterly Financial Results</a><a href="/bad">Announce Quarterly Financial Results</a><a href="/not-html">Announce Quarterly Financial Results</a>';
    const result = await discoverCompanyIrEarnings("https://example.com", "EXM", "2026-10-13", { issuer, now, lookup: publicLookup, fetchImpl: (async (url) => {
      const name = String(url);
      if (name.endsWith("/bad")) return new Response("404", { status: 404 });
      if (name.endsWith("/not-html")) return new Response(JSON.stringify({ event: "unsupported" }), { headers: { "content-type": "application/json" } });
      return new Response(name === "https://example.com/" ? company : index, { headers: { "content-type": "text/html" } });
    }) as typeof fetch });
    expect(result.announcements).toEqual([]);
    expect(result.gaps[0]?.attemptedSources).not.toContain("https://attacker.org/release");
  });
});
