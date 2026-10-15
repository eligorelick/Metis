import { describe, expect, it } from "vitest";
import { buildStatementsFromCompanyFacts, type StatementBuildOptions } from "@/edgar/statements";
import type { CompanyFacts } from "@/edgar/xbrl";
import { discoverCompanyIrEarnings } from "@/providers/companyIr";
import { companyEarningsAnnouncement } from "@/providers/companyEvents";
import { validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import type { ContextPayload } from "@/pipeline/stageC/payload";
import type { JudgeOutput } from "@/report/schema";

const asOf = "2026-10-14";
const observedAt = `${asOf}T12:00:00.000Z`;
const issuer = { cik: "1", canonicalName: "Test Corporation", validAliases: ["Test Corp"], verifiedWebsite: "https://testcorp.example.com" };
const point = (val: number, filed = "2026-02-01") => ({ start: "2025-01-01", end: "2025-12-31", val, filed, form: "10-K", accn: `0000000001-${filed.slice(2, 4)}-000001`, fy: 2025, fp: "FY" });
function facts(costCurrency = "USD", future = false): CompanyFacts {
  return { cik: 1, entityName: issuer.canonicalName, facts: { "us-gaap": {
    Revenues: { units: { USD: [point(100), ...(future ? [point(200, "2027-02-01")] : [])] } },
    CostOfRevenue: { units: { [costCurrency]: [point(60)] } },
    NetIncomeLoss: { units: { [costCurrency]: [point(30)] } },
  } } } as CompanyFacts;
}
const options: StatementBuildOptions = { symbol: "TEST", cik: "1", annualPeriods: 2, quarterlyPeriods: 0, asOf, vendorSplits: { status: "retrieved", events: [], coverage: [{ from: "2025-01-01", to: asOf }], source: "yahoo" } };

describe("statement evidence boundaries", () => {
  it("weighted-average shares must cover the same flow window despite having no currency", () => {
    const raw=facts();raw.facts['us-gaap']!.WeightedAverageNumberOfDilutedSharesOutstanding={units:{shares:[{...point(10),start:'2025-01-11'}]}};
    expect(buildStatementsFromCompanyFacts(raw,options).incomeAnnual.rows[0]?.weightedAverageShsOutDil).toBeNull();
  });
  it("withholds other-currency fields before computing gross profit", () => {
    const result = buildStatementsFromCompanyFacts(facts("EUR"), options);
    expect(result.incomeAnnual.rows[0]).toMatchObject({ revenue: 100, costOfRevenue: null, netIncome: null, grossProfit: null, reportedCurrency: "USD" });
    expect(result.incomeAnnual.withheld.some((w) => w.field === "costOfRevenue" && /currency|mixed_unit/i.test(w.text))).toBe(true);
  });
  it("selects the filing available at analysis before deduping a later comparative", () => {
    const result = buildStatementsFromCompanyFacts(facts("USD", true), options);
    expect(result.incomeAnnual.rows[0]?.revenue).toBe(100);
    expect(result.factExclusions).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "future_filing", filed: "2027-02-01", value: 200 })]));
    expect(result.incomeAnnual.rows[0]?.fieldProvenance?.revenue).toMatchObject({ unit: "USD", periodStart: "2025-01-01", periodEnd: "2025-12-31", filings: [{ accn: "0000000001-26-000001", filed: "2026-02-01", form: "10-K" }] });
  });
  it("preserves hand-calculated same-currency gross profit including EUR reporting", () => {
    const usd = buildStatementsFromCompanyFacts(facts(), options);
    expect(usd.incomeAnnual.rows[0]).toMatchObject({ revenue: 100, costOfRevenue: 60, grossProfit: 40, netIncome: 30 });
    const eur = facts("EUR");
    const revenue = eur.facts["us-gaap"]!.Revenues as { units: Record<string, unknown> };
    revenue.units = { EUR: [point(100)] };
    expect(buildStatementsFromCompanyFacts(eur, options).incomeAnnual.rows[0]).toMatchObject({ revenue: 100, costOfRevenue: 60, grossProfit: 40, reportedCurrency: "EUR" });
  });
  it("does not invent an acquisition timestamp from the analytical cutoff", () => {
    expect(buildStatementsFromCompanyFacts(facts(), options).incomeAnnual.rows[0]?.fieldProvenance?.revenue.observedAt).toBe("");
    expect(buildStatementsFromCompanyFacts(facts(), { ...options, factsObservedAt: observedAt }).incomeAnnual.rows[0]?.fieldProvenance?.revenue.observedAt).toBe(observedAt);
  });
  it("does not subtract annual flows with different explicit start dates", () => {
    const f = facts();
    const cost = f.facts["us-gaap"]!.CostOfRevenue as { units: Record<string, unknown> };
    cost.units = { USD: [{ ...point(60), start: "2025-01-11" }] };
    const result = buildStatementsFromCompanyFacts(f, options);
    expect(result.incomeAnnual.rows[0]).toMatchObject({ revenue: 100, costOfRevenue: null, grossProfit: null });
    expect(result.incomeAnnual.withheld.some((w) => w.field === "costOfRevenue" && /period_mismatch/.test(w.text))).toBe(true);
  });
  it("does not let a future revenue concept alter the bank tagging route", () => {
    const f = facts();
    const tags = f.facts["us-gaap"]!;
    delete tags.Revenues;
    tags.SalesRevenueNet = { units: { USD: [point(150)] } };
    tags.InterestIncomeExpenseNet = { units: { USD: [point(80)] } };
    tags.NoninterestIncome = { units: { USD: [point(20)] } };
    tags.RevenueFromContractWithCustomerExcludingAssessedTax = { units: { USD: [point(10, "2027-02-01")] } };
    expect(buildStatementsFromCompanyFacts(f, options).incomeAnnual.rows[0]?.revenue).toBe(100);
  });
});

it.each(['A competitor of Test Corp will report financial results on November 1, 2026.','Other Corp, unlike Test Corp, will report financial results on November 1, 2026.'])('an issuer mention is not the event subject: %s',text=>{
  expect(companyEarningsAnnouncement({text,publishedAt:asOf,observedAt,url:'https://testcorp.example.com/release',authority:'company_ir',issuer},'TEST',asOf)).toBeNull();
});

describe("issuer-bound announcements", () => {
  const evidence = { text: "Other Corp will report financial results on November 1, 2026.", publishedAt: asOf, observedAt, url: "https://investors.othercorp.example.com/", authority: "company_ir" as const, issuer };
  it("does not confirm another company's announcement reached through an investor link", async () => {
    const pages: Record<string, string> = { "https://testcorp.example.com/": '<a href="https://investors.othercorp.example.com/">Investor Relations</a>', [evidence.url]: `<meta property="article:published_time" content="${asOf}"><h1>Other Corp</h1><p>${evidence.text}</p>` };
    const result = await discoverCompanyIrEarnings(issuer.verifiedWebsite, "TEST", asOf, { issuer, now: () => new Date(observedAt), lookup: async () => [{ address: "93.184.216.34", family: 4 }], fetchImpl: (async (url) => new Response(pages[String(url)] ?? "", { headers: { "content-type": "text/html" } })) as typeof fetch });
    expect(result.announcements).toEqual([]);
    expect(result.gaps.length).toBeGreaterThan(0);
  });
  it("accepts a matched issuer on an explicitly linked external IR platform", async () => {
    const external = "https://ir.hosted-investors.example.com/test/release";
    const result = await discoverCompanyIrEarnings(issuer.verifiedWebsite, "TEST", asOf, { issuer, now: () => new Date(observedAt), lookup: async () => [{ address: "93.184.216.34", family: 4 }], fetchImpl: (async (url) => new Response(String(url) === "https://testcorp.example.com/" ? `<a href="${external}">Investor Relations</a>` : `<meta property="article:published_time" content="${asOf}"><h1>Test Corp to report results</h1><p>Test Corp will report financial results on November 1, 2026.</p>`, { headers: { "content-type": "text/html" } })) as typeof fetch });
    expect(result.announcements[0]).toMatchObject({ ok: true, value: { data: { date: "2026-11-01", confirmation: "company_confirmed", issuerBinding: { issuerId: "cik:1", canonicalName: "Test Corporation", sourceHash: expect.any(String) } } } });
  });
  it("rejects parent/subsidiary subjects and SEC documents for another CIK", () => {
    expect(companyEarningsAnnouncement({ ...evidence, text: "Test Corp's subsidiary Other Corp will report financial results on November 1, 2026." }, "TEST", asOf)).toBeNull();
    expect(companyEarningsAnnouncement({ ...evidence, text: "Test Corp will report financial results on November 1, 2026.", authority: "sec_filing", url: "https://www.sec.gov/Archives/edgar/data/2/000000000226000001/release.htm" }, "TEST", asOf)).toBeNull();
  });
  it("does not borrow a headline issuer for another company's dated reporting action", () => {
    expect(companyEarningsAnnouncement({ ...evidence, authorityChain: ["https://testcorp.example.com/", evidence.url], text: "Test Corp to Announce Results Other Corp will report financial results on November 1, 2026." }, "TEST", asOf)).toBeNull();
  });
  it("retains matched legal-name punctuation and a subjectless issuer-specific release", () => {
    const source = { ...evidence, url: "https://testcorp.example.com/release" };
    expect(companyEarningsAnnouncement({ ...source, text: "Test Corp. today announced that it will report financial results on November 1, 2026." }, "TEST", asOf)).toMatchObject({ ok: true, value: { data: { date: "2026-11-01" } } });
    expect(companyEarningsAnnouncement({ ...source, documentTitle: "Test Corp Reports Earnings Date", text: "We will report financial results on November 1, 2026." }, "TEST", asOf)).toMatchObject({ ok: true, value: { data: { issuerBinding: { method: "issuer-document" } } } });
  });
  it("binds a subjectless acquired release to its issuer title and official link path", async () => {
    const result = await discoverCompanyIrEarnings(issuer.verifiedWebsite, "TEST", asOf, { issuer, now: () => new Date(observedAt), lookup: async () => [{ address: "93.184.216.34", family: 4 }], fetchImpl: (async (url) => new Response(String(url) === "https://testcorp.example.com/" ? '<a href="https://ir.hosted-investors.example.com/release">Investor Relations</a>' : `<meta property="article:published_time" content="${asOf}"><h1>Test Corp Reports Earnings Date</h1><p>We will report financial results on November 1, 2026.</p>`, { headers: { "content-type": "text/html" } })) as typeof fetch });
    expect(result.announcements[0]).toMatchObject({ ok: true, value: { data: { date: "2026-11-01", issuerBinding: { method: "issuer-document" } } } });
  });
});

describe("numeric evidence is not whole-claim adjudication", () => {
  it("keeps the supported numeric evidence without verifying an unrelated allegation", async () => {
    const claim = { text: "Revenue was USD 100. Management committed fraud.", label: "FACT" as const, source: "edgar:10-K item7", asOf };
    const excerpt = { title: "Results", text: "Revenue was USD 100.", source: claim.source, asOf, truncated: false, originalChars: 20 };
    const numeric = validateClaimNumericSupport(claim, { excerpts: [excerpt], sourceId: claim.source, reportingCurrency: "USD" });
    expect(numeric.status).toBe("validated");
    const payload = { filings: [excerpt], provenanceRegistry: [], citationRegistry: [{ id: claim.source, kind: "payload-text", asOf, origin: claim.source }], profile: { name: issuer.canonicalName }, statements: {} } as unknown as ContextPayload;
    const result = await runVerifyPass({} as PassDeps, payload, { claims: [claim] } as unknown as JudgeOutput, { fetchedUrls: [] });
    expect(result.log.find((entry) => entry.evidenceKind === "factual-claim")).toMatchObject({ outcome: "unverified", validationStatus: "validated", numericSupportStatus: "validated", claimSupportStatus: "numeric-only" });
    expect(result.coverage.factualValidation?.validated).toBe(1);
  });
});
