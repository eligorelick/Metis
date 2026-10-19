import { describe, expect, it } from "vitest";
import { discoverCompanyIrMaterialEvents, verifiedCompanyIrAliases, type CompanyIrOptions } from "@/providers/companyIr";

const issuer = { cik: "1", canonicalName: "Example Group, Inc.", verifiedWebsite: "https://example.com/" };
const now = () => new Date("2026-10-17T12:00:00.000Z");
const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
const acquisition = (date = "2026-07-31", subject = "Example Group") => `<html><head><meta property="article:published_time" content="${date}"></head><body><h1>${subject} acquires Journey</h1><p>SEATTLE, July 31, 2026 - ${subject} today announced that it has acquired Journey, a travel planning platform.</p><p>The acquisition supports its travel strategy.</p><p>About Example Group: Example Group is a travel marketplace.</p></body></html>`;
const pages = {
  "https://example.com/": '<a href="https://ir.example.com/">Investor Relations</a><a href="https://partner.example.com/deal">Example Group completes another acquisition</a>',
  "https://ir.example.com/": '<a href="/news/">News and Press Releases</a>',
  "https://ir.example.com/news/": '<a href="/news/journey">Example Group acquires Journey</a>',
  "https://ir.example.com/news/journey": acquisition(),
};

async function discover(overrides: Record<string, string> = {}, options: CompanyIrOptions = {}) {
  const attempted: string[] = [];
  const result = await discoverCompanyIrMaterialEvents(issuer.verifiedWebsite, "EXM", "2026-10-17", { issuer, now, lookup, fetchImpl: (async (url) => {
    attempted.push(String(url));
    const html = { ...pages, ...overrides }[String(url) as keyof typeof pages];
    return new Response(html ?? "not found", { status: html ? 200 : 404, headers: { "content-type": "text/html" } });
  }) as typeof fetch, ...options });
  return { result, attempted };
}

describe("bounded official material-event discovery", () => {
  it("binds the reviewed single-word alias to exact CIK, legal name and official website", () => {
    const adobe = { cik: "0000796343", canonicalName: "ADOBE INC.", verifiedWebsite: "https://www.adobe.com/" };
    expect(verifiedCompanyIrAliases(adobe)).toEqual(["Adobe"]);
    expect(verifiedCompanyIrAliases({ ...adobe, cik: "1" })).toEqual([]);
    expect(verifiedCompanyIrAliases({ ...adobe, canonicalName: "Adobe Holdings Inc." })).toEqual([]);
    expect(verifiedCompanyIrAliases({ ...adobe, verifiedWebsite: "https://adobe.com.unrelated.example/" })).toEqual([]);
    expect(verifiedCompanyIrAliases({ ...adobe, verifiedWebsite: "http://www.adobe.com/" })).toEqual([]);
  });
  it.each([
    'Today, Unrelated Company completed its acquisition of Journey.',
    'Today, Example Group has not completed its acquisition of Journey.',
    'Today, Example Group will complete its acquisition of Journey.',
    '"Today, Example Group completed its acquisition of Journey," a commentator claimed.',
  ])("does not loosen subject, negation, future or quotation checks: %s", async sentence => {
    const html = acquisition().replace(/<p>SEATTLE,[\s\S]*?<\/p>/, `<p>${sentence}</p>`);
    expect((await discover({ "https://ir.example.com/news/journey": html })).result).toMatchObject({ ok: false });
  });
  it("follows the official IR path and keeps issuer-stated completion separate from unknown deal terms", async () => {
    const { result, attempted } = await discover();
    expect(result).toMatchObject({ ok: true, value: { source: "computed", data: { events: [{ symbol: "EXM", category: "acquisition", status: "issuer-stated-completed", publishedAt: "2026-07-31", observedAt: now().toISOString(), url: "https://ir.example.com/news/journey", consideration: null, funding: null,
      authorityChain: ["https://example.com/", "https://ir.example.com/", "https://ir.example.com/news/", "https://ir.example.com/news/journey"], sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/), text: expect.stringContaining("has acquired Journey") }] } } });
    expect(attempted).toHaveLength(4);
    expect(attempted).not.toContain("https://partner.example.com/deal");
  });

  it.each(["2026-10-18", "2024-07-31", "2026-02-30", "not a date"])("rejects unsupported publication date %s", async (date) => {
    expect((await discover({ "https://ir.example.com/news/journey": acquisition(date) })).result).toMatchObject({ ok: false });
  });

  it("does not bind another acquirer's action through issuer boilerplate", async () => {
    expect((await discover({ "https://ir.example.com/news/journey": acquisition("2026-07-31", "Unrelated Company") })).result).toMatchObject({ ok: false });
  });

  it.each([
    "today announced that it has acquired no interest in Journey",
    "today announced that it has acquired zero shares of Journey",
    "today announced that it has not acquired Journey",
    "today announced that it has not completed the acquisition of Journey",
    "today announced that it has completed the acquisition of no interest in Journey",
    "announced the acquisition of no interest in Journey",
    "announced an agreement to acquire no shares of Journey",
    "today announced that it has acquired no direct or indirect interest in Journey",
    "today announced that it has acquired no direct interest in Journey",
    "today announced that it has acquired NO DIRECT OR INDIRECT INTEREST in Journey",
    "announced the acquisition of no direct or indirect interest in Journey",
    "announced an agreement to acquire no direct or indirect economic ownership interest in Journey",
  ])("does not publish denied acquisition as completed: %s", async (action) => {
    const html = acquisition().replace("today announced that it has acquired Journey, a travel planning platform", action);
    expect((await discover({ "https://ir.example.com/news/journey": html })).result).toMatchObject({ ok: false });
  });

  it.each(["No Limits Travel", "NO LIMITS TRAVEL"])("preserves the legitimate acquired company name %s", async (target) => {
    const html = acquisition().replace("Journey, a travel planning platform", `${target}, a travel planning platform that previously held no interest in Journey`);
    expect((await discover({ "https://ir.example.com/news/journey": html })).result).toMatchObject({ ok: true, value: { data: { events: [{ status: "issuer-stated-completed", text: expect.stringContaining(target) }] } } });
  });

  it("keeps an announced agreement distinct from a completed acquisition", async () => {
    const html = acquisition().replace("today announced that it has acquired", "announced an agreement to acquire");
    expect((await discover({ "https://ir.example.com/news/journey": html })).result).toMatchObject({ ok: true, value: { data: { events: [{ status: "issuer-announced", consideration: null, funding: null }] } } });
  });

  it("retains an issuer-announced executive appointment without converting it to completed execution", async () => {
    const html = acquisition().replace("today announced that it has acquired Journey, a travel planning platform", "announced the appointment of Jane Analyst as Chief Financial Officer, effective November 1, 2026");
    expect((await discover({ "https://ir.example.com/news/journey": html })).result).toMatchObject({ ok: true, value: { data: { events: [{ category: "executive-transition", status: "issuer-announced", consideration: null, funding: null }] } } });
  });

  it("rejects private DNS and cross-origin redirects without following them", async () => {
    const privateResult = await discover({}, { lookup: async () => [{ address: "169.254.169.254", family: 4 }] });
    expect(privateResult.result).toMatchObject({ ok: false });
    expect(privateResult.attempted).toEqual([]);
    let requests = 0;
    const redirect = await discover({}, { fetchImpl: (async () => { requests++; return new Response("", { status: 302, headers: { Location: "https://foreign.example/deal" } }); }) as typeof fetch });
    expect(redirect.result).toMatchObject({ ok: false });
    expect(requests).toBe(1);
  });

  it("discloses bounded absence instead of implying there were no events", async () => {
    const { result, attempted } = await discover({ "https://ir.example.com/news/": Array.from({ length: 100 }, (_, i) => `<a href="/news/other-${i}">Example Group acquires Asset ${i}</a>`).join("") });
    expect(result).toMatchObject({ ok: false, gap: { reason: expect.stringMatching(/bounded.*not evidence/i) } });
    expect(attempted.length).toBeLessThanOrEqual(6);
  });

  it("withholds an over-budget operative sentence instead of cutting its conditions", async () => {
    const html = acquisition().replace("a travel planning platform", `a travel planning platform ${"with contractual conditions ".repeat(100)}`);
    expect((await discover({ "https://ir.example.com/news/journey": html })).result).toMatchObject({ ok: false });
  });
});
