import { describe, expect, it } from "vitest";
import { companyEarningsAnnouncement } from "@/providers/companyEvents";

const issuer = { cik: "1", canonicalName: "Example Travel Group, Inc.", verifiedWebsite: "https://example.com/" };
const evidence = { issuer, publishedAt: "2026-10-07", observedAt: "2026-10-13T12:00:00Z", url: "https://ir.example.com/release", authority: "company_ir" as const };
const clause = "Example Travel Group (NASDAQ: EXM) will report its third quarter 2026 results for the period ended September 30, 2026, on Wednesday, November 4, 2026 via an earnings release and accompanying webcast.";

describe("issuer-bound earnings date grammar", () => {
  it.each([clause, `SEATTLE, October 7, 2026 -- ${clause}`])("separates publication, completed reporting period and reporting-action dates", (text) => {
    expect(companyEarningsAnnouncement({ ...evidence, text }, "EXM", "2026-10-13")).toMatchObject({ ok: true, value: { data: { date: "2026-11-04", confirmation: "company_confirmed", announcedAt: "2026-10-07", issuerBinding: { canonicalName: issuer.canonicalName, span: { start: 0, end: text.length, text } } } } });
  });
  it.each(["Example Travel Group Inc.", "Example Travel Group Inc", "Example Travel Group, Inc"])("accepts punctuation-equivalent legal suffix %s without inventing a business alias", (name) => {
    expect(companyEarningsAnnouncement({ ...evidence, text: `${name} will report earnings on November 4, 2026.` }, "EXM", "2026-10-13")).not.toBeNull();
    expect(companyEarningsAnnouncement({ ...evidence, text: "Example Travel will report earnings on November 4, 2026." }, "EXM", "2026-10-13")).toBeNull();
  });
  it.each([
    clause.replace("September 30", "October 30"),
    clause.replace("for the period ended September 30, 2026,", "on September 30, 2026 and"),
    clause.replace("November 4, 2026", "November 4, 2026 or November 5, 2026"),
    `SEATTLE, October 6, 2026 -- ${clause}`,
    `BUSINESS WIRE -- ${clause}`,
    clause.replace("Example Travel Group", "Other Corporation, unlike Example Travel Group,"),
    clause.replace("Example Travel Group", "Example Travel Group subsidiary"),
  ])("keeps ambiguous dates, datelines and subjects unconfirmed: %s", (text) => {
    expect(companyEarningsAnnouncement({ ...evidence, text }, "EXM", "2026-10-13")).toBeNull();
  });
  it("does not let legal-suffix or date normalization bypass primary issuer binding", () => {
    for (const patch of [
      { url: "https://finnhub.io/api/news?id=retained" },
      { authority: "sec_filing" as const, url: "https://www.sec.gov/Archives/edgar/data/2/000000000226000001/release.htm" },
    ]) expect(companyEarningsAnnouncement({ ...evidence, ...patch, text: clause }, "EXM", "2026-10-13")).toBeNull();
    expect(companyEarningsAnnouncement({ ...evidence, authority: "sec_filing", url: "https://www.sec.gov/Archives/edgar/data/1/000000000126000001/release.htm", text: clause }, "EXM", "2026-10-13")).not.toBeNull();
  });
});
