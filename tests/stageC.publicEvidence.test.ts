import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { validateBundle } from "@/pipeline/stageA/validate";
import { assembleContextPayload, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import { issuerPrimarySource } from "@/pipeline/stageC/passes";
import { runConsistencyChecks } from "@/pipeline/stageC/consistency";
import type { DataBundle } from "@/pipeline/types";
import { completeCurrencyBundle, BUILT_AT } from "./helpers/currencyBundle";

const website = "https://www.safe.example/";
const transcriptUrl = "https://investors.safe.example/call-123.html";
const proxyUrl = "https://www.sec.gov/Archives/edgar/data/42/000000004226000001/proxy.htm";
const hash = "a".repeat(64);
function bundle(): DataBundle {
  const b = completeCurrencyBundle({ symbol: "SAFE" });
  if (b.profile.ok) b.profile.value.data.rows[0]!.website = website;
  b.edgar.cik = { ok: true, value: { source: "edgar", endpoint: "edgar:tickers", asOf: "2026-07-06", fetchedAt: BUILT_AT,
    data: { cik: 42, cik10: "0000000042", ticker: "SAFE", title: "Test General Co" } } };
  const text = "Test General Co Q2 2026 Earnings Call Transcript\nJane Doe:\nOur platform improved service quality.\nQuestion and Answer\nJohn Smith:\nHow are customers responding?\nJane Doe:\nWe continue to monitor customer satisfaction.";
  b.companyIrDocuments = { ok: true, value: { source: "computed", endpoint: "company-ir:documents", asOf: "2026-07-02", fetchedAt: BUILT_AT,
    data: [{ kind: "earnings-transcript", title: "Test General Co Q2 2026 Earnings Call Transcript", url: transcriptUrl,
      publishedAt: "2026-07-02", observedAt: BUILT_AT, sourceHash: hash, authorityChain: [website, transcriptUrl],
      text, originalChars: text.length, fiscalYear: 2026, quarter: 2 }] } };
  const comp = "Summary Compensation Table\nName | Year | Salary | Total\nJane Doe | 2025 | $500,000 | $600,000\nAmounts are reported in USD for the fiscal year shown; stock awards use grant-date fair values.";
  const own = "Security Ownership\nName | Shares Beneficially Owned | Percent\nJane Doe | 100,000 | 2%\nAs of May 1, 2026; includes options exercisable within sixty days.";
  const excerpt = (text: string, caption: string) => ({ caption, text, originalChars: text.length, span: { start: 10, end: 10 + text.length, html: text } });
  b.publicGovernance = { ok: true, value: { source: "edgar", endpoint: proxyUrl, asOf: "2026-05-15", fetchedAt: BUILT_AT,
    data: { cik: "0000000042", accession: "0000000042-26-000001", form: "DEF 14A", filingDate: "2026-05-15", reportDate: null,
      documentUrl: proxyUrl, observedAt: BUILT_AT, sourceHash: hash, compensation: excerpt(comp, "Summary Compensation Table"),
      beneficialOwnership: excerpt(own, "Security Ownership"), notes: ["Annual proxy excerpts are not a complete institutional holdings dataset."] } } };
  return b;
}
const payload = (b: DataBundle) => assembleContextPayload(b, runStageB(b), validateBundle(b, { now: new Date(BUILT_AT) }));

describe("public evidence in the research payload", () => {
  it("uses an official transcript's exact URL and publication date without fabricating an FMP response", () => {
    const b = bundle();
    const p = payload(b);
    expect(p.transcript).toMatchObject({ source: transcriptUrl, asOf: "2026-07-02", sourceEvidence: { sourceHash: hash } });
    expect(p.transcript?.title).toContain("published 2026-07-02");
    expect(p.citationRegistry).toContainEqual(expect.objectContaining({ id: transcriptUrl }));
    expect(issuerPrimarySource(p)(transcriptUrl)).toBe(true);
    expect(issuerPrimarySource(p)("https://other.example/call-123.html")).toBe(false);
    expect(b.transcript.latest.ok).toBe(false);
  });
  it("keeps usable subscribed transcript content ahead of a public fallback", () => {
    const b = bundle();
    b.transcript.latest = { ok: true, value: { source: "fmp", endpoint: "fmp:earning-call-transcript", asOf: "2026-07-03", fetchedAt: BUILT_AT,
      data: { rows: [{ content: "Subscribed actual call transcript", date: "2026-07-03" }], raw: {} } } };
    expect(payload(b).transcript).toMatchObject({ source: "fmp:earning-call-transcript", text: "Subscribed actual call transcript" });
  });
  it("admits the exact public transcript for person claims without admitting other web sources", () => {
    const p = payload(bundle());
    const other = "https://other.example/article";
    for (const source of [transcriptUrl, other]) {
      const result = runConsistencyChecks({ claims: [{ path: "leadership.commentary[0]", claim: {
        text: "Jane Doe discussed customer satisfaction.", label: "FACT", source, asOf: "2026-07-02",
      } }], registry: [], citationRegistry: [...p.citationRegistry!, { id: other, kind: "payload-text", asOf: "2026-07-02", origin: other }],
      fetchedUrls: new Set([source]), personNames: ["Jane Doe"], transcriptSource: p.transcript?.source });
      expect(result.checks.namedIndividual.failed).toBe(source === transcriptUrl ? 0 : 1);
    }
  });
  it("keeps whole proxy tables and qualifiers as cited excerpts, leaving normalized datasets missing", () => {
    const b = bundle(), p = payload(b);
    const excerpts = p.filings.filter(e => e.source === proxyUrl);
    expect(excerpts).toHaveLength(2);
    expect(excerpts.every(e => !e.truncated && e.text.length === e.originalChars)).toBe(true);
    expect(excerpts[0]!.text).toContain("grant-date fair values");
    expect(excerpts[1]!.text).toContain("options exercisable within sixty days");
    expect(issuerPrimarySource(p)(proxyUrl)).toBe(true);
    expect(serializePayloadForPrompt(p)).toContain(proxyUrl);
    expect(b.compensation.ok).toBe(false);
    expect(b.institutional.positionsSummary.ok).toBe(false);
  });
  it("retains cached proxy evidence observed after the original document fetch", () => {
    const b = bundle();
    if (!b.publicGovernance?.ok) throw new Error("fixture");
    b.publicGovernance.value.fetchedAt = "2026-06-01T18:00:00.000Z";
    expect(payload(b).filings.filter(e => e.source === proxyUrl)).toHaveLength(2);
  });
  it("does not mistake the proxy's later shareholder-meeting reportDate for unpublished evidence", () => {
    const b = bundle();
    if (!b.publicGovernance?.ok) throw new Error("fixture");
    b.publicGovernance.value.data.reportDate = "2026-08-30";
    expect(payload(b).filings.filter(e => e.source === proxyUrl)).toHaveLength(2);
  });
  it.each(["future", "stale", "outside calendar window", "wrong issuer", "wrong URL", "bad hash"])("refuses %s proxy evidence retained in an incompatible bundle", mode => {
    const b = bundle();
    if (!b.publicGovernance?.ok) throw new Error("fixture");
    const v = b.publicGovernance.value, d = v.data;
    if (mode === "future") d.filingDate = v.asOf = "2026-07-07";
    if (mode === "stale") d.filingDate = v.asOf = "2024-01-01";
    if (mode === "outside calendar window") d.filingDate = v.asOf = "2025-01-05";
    if (mode === "wrong issuer") d.cik = "0000000043";
    if (mode === "wrong URL") d.documentUrl = "https://evil.example/proxy.htm";
    if (mode === "bad hash") d.sourceHash = "missing";
    expect(payload(b).filings.filter(e => e.source === proxyUrl)).toEqual([]);
  });
  it.each(["future", "stale", "wrong authority", "bad observation"])("refuses %s issuer documents", mode => {
    const b = bundle();
    if (!b.companyIrDocuments?.ok) throw new Error("fixture");
    const d = b.companyIrDocuments.value.data[0]!;
    if (mode === "future") d.publishedAt = "2026-07-07";
    if (mode === "stale") d.publishedAt = "2025-01-01";
    if (mode === "wrong authority") d.authorityChain[0] = "https://evil.example/";
    if (mode === "bad observation") d.observedAt = "2026-07-01";
    expect(payload(b).transcript).toBeNull();
  });
  it("retains public releases with source lineage and bounded coverage", () => {
    const b = bundle();
    if (!b.companyIrDocuments?.ok) throw new Error("fixture");
    b.companyIrDocuments.value.data[0]!.kind = "press-release";
    const p = payload(b);
    expect(p.transcript).toBeNull();
    expect(p.filings.find(e => e.source === transcriptUrl)).toMatchObject({ sourceEvidence: { kind: "issuer-statement", authorityChain: [website, transcriptUrl] } });
  });
});
