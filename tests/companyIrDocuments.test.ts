import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverCompanyIrDocuments } from "@/providers/companyIrDocuments";
import type { CompanyIrOptions } from "@/providers/companyIr";

const issuer = { cik: "1", canonicalName: "Example Group, Inc.", verifiedWebsite: "https://example.com/" };
const today = "2026-11-06";
const now = () => new Date("2026-11-06T12:00:00Z");
const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
const needs = { pressReleases: true, transcript: true };
const article = (title: string, body: string, date = "2026-11-02") => `<html><head><meta property="article:published_time" content="${date}"></head><body><nav>Other Company News</nav><article><h1>${title}</h1>${body}</article></body></html>`;
const release = article("Example Group Reports Third Quarter Results", "<p>Example Group today announced its financial results for the third quarter. Revenue increased as customers adopted the company's services. The company will hold an earnings conference call to discuss the results and answer questions from analysts.</p>");
const transcript = article("Example Group Q3 FY2026 Earnings Call Transcript", "<p>Operator:</p><p>Welcome to the Example Group third quarter earnings conference call. Today's discussion includes forward-looking statements. I will now turn the call over to Jane Analyst.</p><p>Jane Analyst - Chief Executive Officer:</p><p>Thank you for joining us. Customers increased their use of our products this quarter. We are investing in the service team and will discuss our financial results in more detail.</p><h2>Questions and Answers</h2><p>Sam Research - Analyst:</p><p>Could you describe how customer demand changed during the quarter and the factors behind your outlook?</p><p>Jane Analyst:</p><p>Demand improved across our larger customers, and our outlook reflects the orders we have received to date.</p>");
const pages: Record<string, string> = {
  "https://example.com/": '<a href="https://ir.example-host.com/example/">Investor Relations</a>',
  "https://ir.example-host.com/example/": '<a href="/example/news/">News and Press Releases</a><a href="/example/results/">Quarterly Results</a>',
  "https://ir.example-host.com/example/news/": '<a href="/example/news/quarter">Example Group Reports Third Quarter Results</a>',
  "https://ir.example-host.com/example/results/": '<a href="/example/transcript">Q3 FY2026 Earnings Call Transcript</a>',
  "https://ir.example-host.com/example/news/quarter": release,
  "https://ir.example-host.com/example/transcript": transcript,
};

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now()); });
afterEach(() => { vi.useRealTimers(); });

async function discover(overrides: Record<string, string> = {}, options: Partial<CompanyIrOptions> = {}, requested = needs) {
  const attempted: string[] = [];
  const promise = discoverCompanyIrDocuments(issuer.verifiedWebsite, "EXM", today, {
    issuer, now, lookup, needs: requested,
    fetchImpl: (async input => {
      attempted.push(String(input));
      const html = { ...pages, ...overrides }[String(input)];
      return new Response(html ?? "missing", { status: html ? 200 : 404, headers: { "content-type": "text/html" } });
    }) as typeof fetch,
    ...options,
  });
  await vi.runAllTimersAsync();
  return { result: await promise, attempted };
}

describe("bounded official issuer document discovery", () => {
  it("follows observed issuer-authorized newsroom links and admits a commercial selection headline", async () => {
    const commercial = article("Cedar Network Selects Example Group to Expand Service", "<p>Example Group and Cedar Network today announced an agreement to expand their communications services. The companies expect commercial deployment following customer validation, and have not disclosed the contract value or expected revenue contribution.</p>");
    const { result, attempted } = await discover({
      "https://example.com/": '<a href="https://news.example-host.com/">Newsroom</a>',
      "https://news.example-host.com/": '<a href="/selection">Cedar Network Selects Example Group to Expand Service</a>',
      "https://news.example-host.com/selection": commercial,
    }, {}, { pressReleases: true, transcript: false });
    expect(result.documents[0]?.authorityChain).toEqual(["https://example.com/", "https://news.example-host.com/", "https://news.example-host.com/selection"]);
    expect(attempted).toHaveLength(3);
  });
  it("uses an exact legal-name core for a one-word issuer without guessing an unlinked host", async () => {
    const { result } = await discover({
      "https://example.com/": '<a href="https://ir.example-host.com/example/">Investor Relations</a>',
      "https://ir.example-host.com/example/": '<a href="https://example.com/news/">Newsroom</a>',
      "https://example.com/news/": '<a href="/selection">Cedar Selects Everpine to Expand Service</a>',
      "https://example.com/selection": article("Cedar Selects Everpine to Expand Service", "<p>Everpine today announced a commercial collaboration with Cedar. The customers are validating the products ahead of a planned rollout, and financial terms of the agreement have not been disclosed. Any future revenue remains subject to deployment timing and execution.</p>"),
    }, { issuer: { ...issuer, canonicalName: "Everpine Incorporated" } }, { pressReleases: true, transcript: false });
    expect(result.documents[0]?.title).toBe("Cedar Selects Everpine to Expand Service");
  });
  it("retains fetched releases and real call transcripts with separate provenance within one six-request budget", async () => {
    const { result, attempted } = await discover();
    expect(result.documents).toHaveLength(2);
    expect(result.documents.find(d => d.kind === "press-release")).toMatchObject({
      title: "Example Group Reports Third Quarter Results", publishedAt: "2026-11-02", observedAt: "2026-11-06T12:00:00.000Z",
      authorityChain: ["https://example.com/", "https://ir.example-host.com/example/", "https://ir.example-host.com/example/news/", "https://ir.example-host.com/example/news/quarter"],
      sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/), text: expect.stringContaining("Revenue increased"),
    });
    expect(result.documents.find(d => d.kind === "earnings-transcript")).toMatchObject({ fiscalYear: 2026, quarter: 3, text: expect.stringContaining("Sam Research - Analyst") });
    expect(attempted).toHaveLength(6);
    expect(result.gaps.some(g => /bounded.*comprehensive/i.test(g.reason))).toBe(true);
  });

  it("does not turn an earnings release or a transcript download notice into the call", async () => {
    const { result } = await discover({ "https://ir.example-host.com/example/transcript": release.replace("Third Quarter Results", "Earnings Call Transcript") }, {}, { pressReleases: false, transcript: true });
    expect(result.documents).toEqual([]);
    expect(result.gaps.some(g => /transcript.*unavailable|no.*transcript/i.test(g.reason))).toBe(true);
  });

  it("keeps the article's own header and heading while excluding site navigation", async () => {
    const html = release.replace("<h1>", "<header><h1>").replace("</h1>", "</h1></header>");
    const { result } = await discover({ "https://ir.example-host.com/example/news/quarter": html }, {}, { pressReleases: true, transcript: false });
    expect(result.documents[0]?.title).toBe("Example Group Reports Third Quarter Results");
    expect(result.documents[0]?.text).not.toContain("Other Company News");
  });

  it("rejects prepared-remarks-only material instead of claiming a complete earnings-call transcript", async () => {
    const partial = transcript.replace(/<h2>Questions and Answers<\/h2>[\s\S]*?<\/article>/, "</article>");
    expect((await discover({ "https://ir.example-host.com/example/transcript": partial }, {}, { pressReleases: false, transcript: true })).result.documents).toEqual([]);
  });

  it("does not count title-cased section headings as named speaker turns", async () => {
    const notice = article("Example Group Conference Call Transcript", `<h2>Financial Results</h2><p>${"The conference call will discuss the business performance and outlook. ".repeat(12)}</p><h2>Questions And Answers</h2><p>Read the call transcript using the link below.</p>`);
    expect((await discover({ "https://ir.example-host.com/example/transcript": notice }, {}, { pressReleases: false, transcript: true })).result.documents).toEqual([]);
  });

  it.each([
    ["press-release", "2026-10-06"],
    ["earnings-transcript", "2026-05-09"],
    ["press-release", "2026-11-07"],
    ["press-release", "2026-02-30"],
    ["press-release", "not a date"],
  ])("withholds %s with stale, future or malformed publication evidence %s", async (kind, date) => {
    const requested = { pressReleases: kind === "press-release", transcript: kind === "earnings-transcript" };
    const url = kind === "press-release" ? "https://ir.example-host.com/example/news/quarter" : "https://ir.example-host.com/example/transcript";
    const html = (kind === "press-release" ? release : transcript).replace('content="2026-11-02"', `content="${date}"`);
    expect((await discover({ [url]: html }, {}, requested)).result.documents).toEqual([]);
  });

  it.each(["11/05/2026", "05/11/2026", "11-05-2026"])("refuses numerically ambiguous publication date %s instead of assuming the issuer's date convention", async date => {
    const html = release.replace('content="2026-11-02"', `content="${date}"`);
    const { result } = await discover({ "https://ir.example-host.com/example/news/quarter": html }, {}, { pressReleases: true, transcript: false });
    expect(result.documents).toEqual([]);
    expect(result.gaps.some(g => /publication/i.test(g.reason))).toBe(true);
  });

  it.each([["10/10/2026", "2026-10-10"], ["10/31/2026", "2026-10-31"]])("preserves unambiguous numeric publication date %s", async (date, expected) => {
    const html = release.replace('content="2026-11-02"', `content="${date}"`);
    const { result } = await discover({ "https://ir.example-host.com/example/news/quarter": html }, {}, { pressReleases: true, transcript: false });
    expect(result.documents[0]?.publishedAt).toBe(expected);
  });

  it.each([
    '<meta property="article:published_time" content="2026-11-02"><meta name="datePublished" content="2026-10-01">',
    '<time datetime="2026-11-02">Earnings webcast November 2</time>',
    '<time itemprop="dateCreated" datetime="2026-11-02">Draft created</time>',
    '<script type="application/ld+json">{"@type":"Event","startDate":"2026-11-02"}</script>',
    '<script type="application/ld+json">{"@type":"NewsArticle","headline":"An Unrelated Article","datePublished":"2026-11-02"}</script>',
    '<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-11-02"}</script>',
    '<script type="application/ld+json">{"@type":"NewsArticle","url":"https://ir.example-host.com/example/unrelated","datePublished":"2026-11-02"}</script>',
    '',
  ])("does not invent publication time from ambiguous or event-only markup", async markup => {
    const html = release.replace(/<meta[^>]+>/, markup);
    const { result } = await discover({ "https://ir.example-host.com/example/news/quarter": html }, {}, { pressReleases: true, transcript: false });
    expect(result.documents).toEqual([]);
    expect(result.gaps.some(g => /publication/i.test(g.reason))).toBe(true);
  });

  it.each([
    '<aside><time itemprop="datePublished" datetime="2026-11-05">Related news</time></aside>',
    '<nav><span class="published-date">November 5, 2026</span></nav>',
    '<div style="display:none"><time itemprop="datePublished" datetime="2026-11-05">Hidden related news</time></div>',
    '<div hidden><time itemprop="datePublished" datetime="2026-11-05">Hidden related news</time></div>',
    '<div aria-hidden="true"><span class="published-date">November 5, 2026</span></div>',
  ])("does not borrow a publication date from excluded article content: %s", async excluded => {
    const html = release.replace(/<meta[^>]+>/, "").replace("</article>", `${excluded}</article>`);
    const { result } = await discover({ "https://ir.example-host.com/example/news/quarter": html }, {}, { pressReleases: true, transcript: false });
    expect(result.documents).toEqual([]);
    expect(result.gaps.some(g => /publication/i.test(g.reason))).toBe(true);
  });

  it("does not borrow a visible date from outside the retained article", async () => {
    const html = release.replace(/<meta[^>]+>/, "").replace("</article>", '</article><div class="published-date">November 5, 2026</div>');
    expect((await discover({ "https://ir.example-host.com/example/news/quarter": html }, {}, { pressReleases: true, transcript: false })).result.documents).toEqual([]);
  });

  it("keeps the article's publication date when related-news dates outside its retained body differ", async () => {
    const html = release.replace("</article>", '<aside><time itemprop="datePublished" datetime="2026-10-01">Related news</time></aside></article>');
    const { result } = await discover({ "https://ir.example-host.com/example/news/quarter": html }, {}, { pressReleases: true, transcript: false });
    expect(result.documents[0]?.publishedAt).toBe("2026-11-02");
  });

  it.each([
    '<script type="application/ld+json">{"@type":"NewsArticle","headline":"Example Group Reports Third Quarter Results","datePublished":"2026-11-02"}</script>',
    '<script type="application/ld+json">{"@type":"NewsArticle","url":"https://ir.example-host.com/example/news/quarter","datePublished":"2026-11-02"}</script>',
  ])("reads explicitly identified article publication markup", async markup => {
    const { result } = await discover({ "https://ir.example-host.com/example/news/quarter": release.replace(/<meta[^>]+>/, markup) }, {}, { pressReleases: true, transcript: false });
    expect(result.documents[0]?.publishedAt).toBe("2026-11-02");
  });

  it.each(['<time itemprop="datePublished" datetime="2026-11-02">November 2, 2026</time>', '<div class="news-details_date">November 2, 2026</div>'])("reads visible publication markup inside the retained article", async markup => {
    const html = release.replace(/<meta[^>]+>/, "").replace("<article>", `<article>${markup}`);
    const { result } = await discover({ "https://ir.example-host.com/example/news/quarter": html }, {}, { pressReleases: true, transcript: false });
    expect(result.documents[0]?.publishedAt).toBe("2026-11-02");
  });

  it("never derives a transcript fiscal period from its publication date or a comparison in its body", async () => {
    const html = transcript.replace("Q3 FY2026 Earnings Call Transcript", "Earnings Call Transcript").replace("Customers increased", "Compared with Q3 FY2025, customers increased");
    const { result } = await discover({ "https://ir.example-host.com/example/transcript": html }, {}, { pressReleases: false, transcript: true });
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]).not.toHaveProperty("fiscalYear");
    expect(result.documents[0]).not.toHaveProperty("quarter");
  });

  it("does not admit another issuer's article through navigation or boilerplate", async () => {
    const other = release.replaceAll("Example Group", "Unrelated Group").replace("</article>", "<footer>About Example Group</footer></article>");
    const { result } = await discover({ "https://ir.example-host.com/example/news/quarter": other }, {}, { pressReleases: true, transcript: false });
    expect(result.documents).toEqual([]);
  });

  it("does not follow external press links, unsafe URLs, duplicate links or unrelated navigation", async () => {
    const index = '<a href="https://unrelated.example/release">Example Group Reports Results</a><a href="https://127.0.0.1/private">Example Group Announces Results</a><a href="/example/news/quarter">Example Group Reports Results</a><a href="/example/news/quarter">Example Group Reports Results</a><a href="/about">About us</a>';
    const { attempted, result } = await discover({ "https://ir.example-host.com/example/news/": index }, {}, { pressReleases: true, transcript: false });
    expect(attempted).not.toContain("https://unrelated.example/release");
    expect(attempted.filter(url => url.endsWith("news/quarter"))).toHaveLength(1);
    expect(result.documents).toHaveLength(1);
  });

  it("retains canonical PDF links as unsupported diagnostics without inventing transcript text", async () => {
    const { result, attempted } = await discover({ "https://ir.example-host.com/example/results/": '<a href="/example/q3.pdf#page=1">Q3 FY2026 Earnings Call Transcript (PDF)</a>' }, {}, { pressReleases: false, transcript: true });
    expect(result.documents).toEqual([]);
    expect(attempted).not.toContain("https://ir.example-host.com/example/q3.pdf");
    expect(result.gaps).toEqual(expect.arrayContaining([expect.objectContaining({ reason: expect.stringMatching(/PDF.*unsupported/i), attemptedSources: expect.arrayContaining(["https://ir.example-host.com/example/q3.pdf"]) })]));
  });

  it("discloses an explicitly linked external transcript PDF without fetching its host", async () => {
    const external = "https://documents.example-cdn.com/transcript.pdf";
    const { result, attempted } = await discover({ "https://ir.example-host.com/example/results/": `<a href="${external}#page=1">Q3 Earnings Call Transcript (PDF)</a>` }, {}, { pressReleases: false, transcript: true });
    expect(result.documents).toEqual([]);
    expect(attempted).not.toContain(external);
    expect(result.gaps.some(g => /PDF.*unsupported/i.test(g.reason) && g.attemptedSources?.includes(external))).toBe(true);
  });

  it("rejects a non-HTML response even when its URL resembles a release", async () => {
    const { result } = await discover({}, { fetchImpl: (async () => new Response("%PDF document", { headers: { "content-type": "application/pdf" } })) as typeof fetch });
    expect(result.documents).toEqual([]);
    expect(result.gaps.some(g => /PDF|unsupported/i.test(g.reason))).toBe(true);
  });

  it("resolves article links from the final same-origin redirect URL and retains that source URL", async () => {
    const redirected: Record<string, string> = {
      "https://example.com/": '<a href="https://ir.example-host.com/example/">Investor Relations</a>',
      "https://ir.example-host.com/example/": '<a href="/example/news">News and Press Releases</a>',
      "https://ir.example-host.com/example/news/": '<a href="quarter">Example Group Reports Results</a>',
      "https://ir.example-host.com/example/news/quarter": release,
    };
    const { result } = await discover({}, { fetchImpl: (async input => String(input) === "https://ir.example-host.com/example/news"
      ? new Response(null, { status: 301, headers: { Location: "/example/news/" } })
      : new Response(redirected[String(input)] ?? "missing", { status: redirected[String(input)] ? 200 : 404, headers: { "content-type": "text/html" } })) as typeof fetch }, { pressReleases: true, transcript: false });
    expect(result.documents[0]?.url).toBe("https://ir.example-host.com/example/news/quarter");
    expect(result.documents[0]?.authorityChain).toContain("https://ir.example-host.com/example/news/");
  });

  it.each([undefined, { ...issuer, verifiedWebsite: "https://elsewhere.example/" }, { ...issuer, canonicalName: "" }])("requires a confirmed website and nonempty issuer identity", async identity => {
    const { result, attempted } = await discover({}, { issuer: identity });
    expect(result.documents).toEqual([]);
    expect(attempted).toEqual([]);
  });

  it("rejects private DNS and mixed public/private answers before sending a request", async () => {
    const { result, attempted } = await discover({}, { lookup: async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }] });
    expect(result.documents).toEqual([]);
    expect(attempted).toEqual([]);
  });

  it.each([403, 429, 302])("discloses blocked HTTP %s without bypassing it or following cross-origin redirects", async status => {
    const { result } = await discover({}, { fetchImpl: (async () => new Response("blocked", { status, headers: { Location: "https://unrelated.example/release" } })) as typeof fetch });
    expect(result.documents).toEqual([]);
    expect(result.gaps.some(g => g.reason.includes(String(status)))).toBe(true);
  });

  it("discloses a transport failure as unavailable evidence", async () => {
    const { result } = await discover({}, { fetchImpl: (async () => { throw new Error("network unavailable"); }) as typeof fetch });
    expect(result.documents).toEqual([]);
    expect(result.gaps.some(g => /unavailable|failed/i.test(g.reason))).toBe(true);
  });

  it("cancels while DNS is stalled and returns a bounded gap", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error("cancelled")), 20);
    const { result, attempted } = await discover({}, { signal: controller.signal, lookup: () => new Promise(() => {}) });
    expect(result.documents).toEqual([]);
    expect(attempted).toEqual([]);
    expect(result.gaps.some(g => /cancel|timeout|unavailable/i.test(g.reason))).toBe(true);
  });

  it("keeps a long index within its shared request budget and discloses incomplete coverage", async () => {
    const index = Array.from({ length: 40 }, (_, i) => `<a href="/example/news/release-${i}">Example Group Announces Update ${i}</a>`).join("");
    const { result, attempted } = await discover({ "https://ir.example-host.com/example/news/": index }, {}, { pressReleases: true, transcript: false });
    expect(attempted.length).toBeLessThanOrEqual(6);
    expect(result.documents).toEqual([]);
    expect(result.gaps.some(g => /bounded.*comprehensive/i.test(g.reason))).toBe(true);
  });

  it.each([false, true])("prioritizes a discovered release over annual-report navigation within a redirect-consuming request budget (homepage duplicate: %s)", async homepageDuplicate => {
    const visited: string[] = [];
    const navigation = '<a href="/example/annual-reports/">Annual Reports &amp; Proxies</a><a href="/example/news/">News &amp; events</a><a href="/example/results/">Quarterly Results</a>' +
      (homepageDuplicate ? '<a href="/example/news/quarter">Example Group Reports Third Quarter Results</a>' : "");
    const fixture: Record<string, string> = { ...pages,
      "https://example.com/en-us": pages["https://example.com/"]!,
      "https://ir.example-host.com/example/": navigation,
      "https://ir.example-host.com/example/results/": "No static transcript links are published here.",
    };
    const { result } = await discover({}, { fetchImpl: (async input => {
      const url = String(input);
      visited.push(url);
      return url === "https://example.com/" ? new Response(null, { status: 301, headers: { Location: "/en-us" } })
        : new Response(fixture[url] ?? "missing", { status: fixture[url] ? 200 : 404, headers: { "content-type": "text/html" } });
    }) as typeof fetch });
    expect(result.documents.map(d => d.kind)).toEqual(["press-release"]);
    expect(visited).not.toContain("https://ir.example-host.com/example/annual-reports/");
    expect(visited.indexOf("https://ir.example-host.com/example/news/quarter")).toBeLessThan(visited.indexOf("https://ir.example-host.com/example/results/"));
    expect(visited.length).toBeLessThanOrEqual(6);
  });

  it("refuses an oversized body instead of parsing a retained prefix as a full article", async () => {
    const { result } = await discover({}, { fetchImpl: (async () => new Response(`${release}${" ".repeat(1_000_001)}`, { headers: { "content-type": "text/html" } })) as typeof fetch });
    expect(result.documents).toEqual([]);
    expect(result.gaps.some(g => /limit|oversiz|exceeds/i.test(g.reason))).toBe(true);
  });
});
