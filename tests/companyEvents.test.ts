import { describe, expect, it } from "vitest";
import { companyEarningsAnnouncement, preferCompanyEarnings, discoverFiledEarningsAnnouncement, pressReleaseEarningsAnnouncements } from "@/providers/companyEvents";
import type { EdgarClient } from "@/providers/edgar";
import type { FmpEarningsRow } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";

const observedAt = "2026-10-13T12:00:00.000Z";
const issuer = { cik: "1", canonicalName: "Example Corporation", validAliases: ["Example"], verifiedWebsite: "https://example.com/" };
const evidence = { issuer, text: "Example Corporation today announced it will release its third quarter 2026 financial results on October 28, 2026 after market close.", publishedAt: "2026-09-24", observedAt, url: "https://investor.example.com/news/quarter-results", authority: "company_ir" as const };
const vendor: FetchResult<FmpEarningsRow> = { ok: true, value: { data: { date: "2026-10-29" }, asOf: "2026-10-13", source: "fmp", endpoint: "fmp:earnings", fetchedAt: observedAt } };

describe("authoritative company earnings events", () => {
  it.each(["unavailable", "throws"])("reads an available SEC exhibit when its primary document %s", async (mode) => {
    const filing = { accessionNumber: "0000000001-26-000003", form: "8-K", filingDate: "2026-09-24", reportDate: "2026-09-24", primaryDocument: "current.htm", items: "8.01" };
    const ok = <T,>(data: T, filename: string): FetchResult<T> => ({ ok: true, value: { data, source: "edgar", endpoint: `https://www.sec.gov/Archives/edgar/data/1/000000000126000003/${filename}`, asOf: filing.filingDate, fetchedAt: observedAt } });
    const client = { fetchFilingDocument: async (_cik: string, document: { primaryDocument: string }) => {
      if (document.primaryDocument === "current.htm") {
        if (mode === "throws") throw new Error("primary document unavailable");
        return { ok: false, gap: { field: "primary", reason: "404", severity: "info" } };
      }
      return ok(`<html><body>${evidence.text}</body></html>`, document.primaryDocument);
    }, filingIndexHeaders: async () => ok({ documents: [{ filename: "release.htm", type: "EX-99.1", sequence: "2" }] }, "index.htm") } as unknown as EdgarClient;
    const result = await discoverFiledEarningsAnnouncement(client, "1", [filing], "EXM", "2026-10-13", observedAt, issuer);
    expect(result).toMatchObject([{ ok: true, value: { source: "edgar", data: { date: "2026-10-28", confirmation: "company_confirmed", announcementUrl: "https://www.sec.gov/Archives/edgar/data/1/000000000126000003/release.htm" } } }]);
  });
  it.each(["SEATTLE -- ", "Redmond — ", "NEW YORK– "])("accepts an issuer-bound release after the recognized location dateline %s", (dateline) => {
    const text = `${dateline}Example Corporation will report financial results on October 28, 2026.`;
    const company = companyEarningsAnnouncement({ ...evidence, text }, "EXM", "2026-10-13");
    expect(company).toMatchObject({ ok: true, value: { data: {
      date: "2026-10-28", confirmation: "company_confirmed", evidenceText: text,
      issuerBinding: { matchedAlias: "Example Corporation", method: "named-subject", span: { start: 0, end: text.length, text } },
    } } });
  });
  it.each([
    "A competitor of Example Corporation -- Example Corporation will report financial results on October 28, 2026.",
    "SEATTLE -- A competitor of Example Corporation will report financial results on October 28, 2026.",
    "SEATTLE -- Other Corp, unlike Example Corporation, will report financial results on October 28, 2026.",
    "SEATTLE -- Other Corp will report financial results on October 28, 2026.",
    "REUTERS -- Example Corporation will report financial results on October 28, 2026.",
    "BUSINESS WIRE -- Example Corporation will report financial results on October 28, 2026.",
    "SEATTLE (BUSINESS WIRE) -- Example Corporation will report financial results on October 28, 2026.",
    "SEATTLE -- Reuters reports Example Corporation will report financial results on October 28, 2026.",
    "SEATTLE, September 24, 2026 -- Example Corporation will report financial results on October 28, 2026.",
  ])("keeps issuer anchoring and source-attribution boundaries after a dateline: %s", (text) => {
    expect(companyEarningsAnnouncement({ ...evidence, text }, "EXM", "2026-10-13")).toBeNull();
  });
  it("does not let a recognized dateline bypass SEC CIK or website binding", () => {
    const text = "SEATTLE -- Example Corporation will report financial results on October 28, 2026.";
    expect(companyEarningsAnnouncement({ ...evidence, text, url: "https://other.example.org/release" }, "EXM", "2026-10-13")).toBeNull();
    expect(companyEarningsAnnouncement({ ...evidence, text, authority: "sec_filing", url: "https://www.sec.gov/Archives/edgar/data/2/000000000226000001/release.htm" }, "EXM", "2026-10-13")).toBeNull();
  });
  it("prefers confirmed company announcement over conflicting vendor schedule with separate publication/observation dates", () => {
    const company = companyEarningsAnnouncement(evidence, "EXM", "2026-10-13");
    const out = preferCompanyEarnings(vendor, [company], "2026-10-13");
    expect(out).toMatchObject({ ok: true, value: { asOf: "2026-10-13", data: { date: "2026-10-28", confirmation: "company_confirmed", announcedAt: "2026-09-24", observedAt, announcementUrl: evidence.url } } });
  });
  it.each([
    "Analysts expect third quarter earnings on October 28, 2026.",
    "Example will hold its investor conference on October 28, 2026.",
    "Example released its quarterly financial results on October 28, 2026.",
    "Example will release quarterly results on October 28, 2026 or October 29, 2026.",
  ])("leaves unsupported or ambiguous extraction unconfirmed: %s", (text) => {
    expect(companyEarningsAnnouncement({ ...evidence, text }, "EXM", "2026-10-13")).toBeNull();
  });
  it("rejects evidence published or observed after analysis and preserves honest vendor fallback", () => {
    const future = companyEarningsAnnouncement({ ...evidence, publishedAt: "2026-10-14" }, "EXM", "2026-10-13");
    expect(future).toBeNull();
    expect(companyEarningsAnnouncement({ ...evidence, observedAt: "2026-10-14T01:00:00Z" }, "EXM", "2026-10-13")).toBeNull();
    expect(preferCompanyEarnings(vendor, [future], "2026-10-13")).toMatchObject({ ok: true, value: { data: { date: "2026-10-29", confirmation: "vendor_estimate" } } });
  });
  it("discovers a datelined issuer announcement from a recent 8-K exhibit without document-title fallback", async () => {
    const ok = <T,>(data: T, endpoint: string): FetchResult<T> => ({ ok: true, value: { data, source: "edgar", endpoint, asOf: "2026-09-24", fetchedAt: observedAt } });
    const client = { fetchFilingDocument: async (_cik: string, filing: { primaryDocument: string }) => ok(filing.primaryDocument === "release.htm" ? `<html><body>SEATTLE -- ${evidence.text}</body></html>` : "<html><body>Item 8.01. See Exhibit 99.1.</body></html>", `https://www.sec.gov/Archives/edgar/data/1/000000000126000003/${filing.primaryDocument}`), filingIndexHeaders: async () => ok({ documents: [{ filename: "release.htm", type: "EX-99.1", sequence: "2", description: "Press release" }] }, "https://www.sec.gov/index") } as unknown as EdgarClient;
    const out = await discoverFiledEarningsAnnouncement(client, "1", [{ accessionNumber: "0000000001-26-000003", form: "8-K", filingDate: "2026-09-24", reportDate: "2026-09-24", primaryDocument: "current.htm", items: "8.01" }], "EXM", "2026-10-13", observedAt, issuer);
    expect(out[0]).toMatchObject({ ok: true, value: { source: "edgar", data: { date: "2026-10-28", confirmation: "company_confirmed" } } });
  });
  it("admits company-owned issuer press releases and excludes wire services, wrong symbols and malformed source URLs", () => {
    const rows = [
      { symbol: "EXM", url: evidence.url, publishedDate: evidence.publishedAt, title: "Announcement", text: evidence.text },
      { symbol: "OTHER", url: evidence.url, publishedDate: evidence.publishedAt, text: evidence.text },
      { symbol: "EXM", url: "https://example.com.attacker.org/release", publishedDate: evidence.publishedAt, text: evidence.text },
      { symbol: "EXM", url: "invalid", publishedDate: evidence.publishedAt, text: evidence.text },
      { symbol: "EXM", url: "https://example.com/no-event", publishedDate: evidence.publishedAt },
      { symbol: "EXM", publishedDate: evidence.publishedAt, text: evidence.text },
      { symbol: "EXM", url: evidence.url, text: evidence.text },
    ];
    const press = { ok: true as const, value: { data: { rows, raw: rows }, source: "fmp" as const, asOf: "2026-10-13", fetchedAt: observedAt, endpoint: "fmp:press" } };
    expect(pressReleaseEarningsAnnouncements(press, "https://www.example.com", "EXM", "2026-10-13", issuer)).toMatchObject([{ ok: true, value: { data: { date: "2026-10-28", announcementUrl: evidence.url } } }]);
    expect(pressReleaseEarningsAnnouncements(press, "invalid", "EXM", "2026-10-13", issuer)).toEqual([]);
    expect(pressReleaseEarningsAnnouncements(press, null, "EXM", "2026-10-13", issuer)).toEqual([]);
    expect(pressReleaseEarningsAnnouncements({ ok: false, gap: { field: "press", reason: "402", severity: "info" } }, "https://example.com", "EXM", "2026-10-13", issuer)).toEqual([]);
  });
  it("uses a later company correction but leaves same-publication contradictions unconfirmed", () => {
    const first = companyEarningsAnnouncement(evidence, "EXM", "2026-10-13");
    const changed = companyEarningsAnnouncement({ ...evidence, text: evidence.text.replace("October 28", "October 30"), publishedAt: "2026-10-01" }, "EXM", "2026-10-13");
    expect(preferCompanyEarnings(vendor, [first, changed], "2026-10-13")).toMatchObject({ ok: true, value: { data: { date: "2026-10-30", announcedAt: "2026-10-01" } } });
    const contradiction = companyEarningsAnnouncement({ ...evidence, text: evidence.text.replace("October 28", "October 30") }, "EXM", "2026-10-13");
    expect(preferCompanyEarnings(vendor, [first, contradiction], "2026-10-13")).toMatchObject({ ok: true, value: { data: { date: "2026-10-29", confirmation: "vendor_estimate" } } });
    const missing: FetchResult<FmpEarningsRow> = { ok: false, gap: { field: "calendar", reason: "unavailable", severity: "info" } };
    expect(preferCompanyEarnings(missing, [null], "2026-10-13")).toBe(missing);
  });
  it.each([
    "Example will release quarterly financial results on September 24, 2026 and hold an investor conference on October 28, 2026.",
    "Example will release quarterly financial results on September 24, 2026, with the investor conference scheduled on October 28, 2026.",
    "September 24, 2026 is when Example will release quarterly financial results and hold an investor conference on October 28, 2026.",
  ])("does not relabel a future conference as earnings by dropping a past release date: %s", (text) => {
    expect(companyEarningsAnnouncement({ ...evidence, text }, "EXM", "2026-10-13")).toBeNull();
  });
  it.each([
    { url: "malformed" }, { url: "http://investor.example.com/release" },
    { url: "https://evil.example/release", authority: "sec_filing" as const },
    { text: "Example may release quarterly financial results on October 28, 2026." },
    { text: "Example will release financial results on February 30, 2027." },
    { text: "Example will release financial results on October 12, 2026." },
    { text: "Example will release financial results on October 28, 2027." },
    { observedAt: "2026-09-23T12:00:00Z" },
  ])("does not confirm invalid source or unsupported event evidence: %j", (patch) => {
    expect(companyEarningsAnnouncement({ ...evidence, ...patch }, "EXM", "2026-10-13")).toBeNull();
  });
  it("returns no SEC event for missing primary, missing exhibit, failed index, failed exhibit or thrown transport", async () => {
    const filing = { accessionNumber: "0000000001-26-000003", form: "8-K", filingDate: "2026-09-24", reportDate: "2026-09-24", primaryDocument: "current.htm", items: "8.01" };
    const gap = { ok: false as const, gap: { field: "filing", reason: "404", severity: "info" as const } };
    const ok = <T,>(data: T): FetchResult<T> => ({ ok: true, value: { data, source: "edgar", endpoint: "https://www.sec.gov/Archives/current.htm", asOf: filing.filingDate, fetchedAt: observedAt } });
    for (const mode of ["primary", "index", "no_exhibit", "exhibit", "throw"] as const) {
      const client = { fetchFilingDocument: async (_cik: string, document: { primaryDocument: string }) => {
        if (mode === "throw") throw new Error("offline");
        return mode === "primary" || document.primaryDocument === "release.htm" ? gap : ok("<html><body>No company event was announced in this current report.</body></html>");
      }, filingIndexHeaders: async () => mode === "index" ? gap : ok({ documents: mode === "no_exhibit" ? [] : [{ filename: "release.htm", type: "EX-99.1", sequence: "2" }] }) } as unknown as EdgarClient;
      expect(await discoverFiledEarningsAnnouncement(client, "1", [filing], "EXM", "2026-10-13", observedAt, issuer)).toEqual([]);
    }
  });
});
