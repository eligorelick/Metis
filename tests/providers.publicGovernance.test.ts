import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createEdgarClient, type EdgarFiling, type EdgarTransport, type EdgarTransportResponse } from "@/providers/edgar";
import { collectPublicGovernance } from "@/providers/publicGovernance";

const NOW = "2026-11-06T12:00:00.000Z";
const CIK = "0001234567";
const URL = "https://www.sec.gov/Archives/edgar/data/1234567/000119312526123456/proxy.htm";
const filing = (patch: Partial<EdgarFiling> = {}): EdgarFiling => ({
  accessionNumber: "0001193125-26-123456", form: "DEF 14A", filingDate: "2026-04-15",
  reportDate: "", primaryDocument: "proxy.htm", ...patch,
});
const compensation = `<h2>Summary Compensation Table</h2>
  <p>The following table sets forth compensation for our named executive officers. Dollar amounts are in USD; stock awards reflect grant-date values.</p>
  <table><tr><th>Name and Principal Position</th><th>Year</th><th>Salary ($)</th><th>Stock Awards ($)</th><th>Total ($)</th></tr>
  <tr><td>Jane Example, Chief Executive Officer</td><td>2025</td><td>900,000</td><td>1,234,567</td><td>2,134,567</td></tr></table>
  <p>(1) The awards shown are not the cash actually received.</p>`;
const ownership = `<h2>Security Ownership of Certain Beneficial Owners and Management</h2>
  <p>The following table reports beneficial ownership as of March 31, 2026.</p>
  <table><tr><th>Name of beneficial owner</th><th>Common stock beneficially owned</th><th>Percent of class</th></tr>
  <tr><td>Northern Example Advisors</td><td>1,234,567</td><td>6.2%</td></tr></table>
  <p>The information is based on the holder's Schedule 13G and includes shared voting power.</p>`;
const document = (body: string) => `<html><head><title>Example Inc. Proxy Statement</title></head><body>${body}<h2>Other Business</h2><p>Other matters.</p></body></html>`;

function client(html = document(compensation + ownership), filings = [filing()], responseCik = CIK) {
  const calls: string[] = [];
  const response = (body: string): EdgarTransportResponse => ({ status: 200, body, fetchedAt: NOW, fromCache: false, stale: false });
  const transport: EdgarTransport = { async fetchText(url) {
    calls.push(url);
    if (url === `https://data.sec.gov/submissions/CIK${CIK}.json`) return response(JSON.stringify({
      cik: responseCik, name: "Example Inc.", tickers: ["EXMP"], exchanges: ["NYSE"],
      filings: { files: [], recent: {
        accessionNumber: filings.map(f => f.accessionNumber), form: filings.map(f => f.form),
        filingDate: filings.map(f => f.filingDate), reportDate: filings.map(f => f.reportDate),
        primaryDocument: filings.map(f => f.primaryDocument),
      } },
    }));
    if (url === URL) return response(html);
    throw new Error(`Unexpected SEC request: ${url}`);
  } };
  return { edgar: createEdgarClient({ transport }), calls };
}
const options = { now: () => new Date(NOW) };

describe("scope before a table-owned caption", () => {
  it.each([false, true])("retains adjacent units and currency before an internal compensation caption (bold: %s)", async bold => {
    const body = compensation.replace("<h2>Summary Compensation Table</h2>", "")
      .replace("Dollar amounts are in USD", "All amounts are in thousands of Canadian dollars")
      .replace("<table>", "<table><caption>Summary Compensation Table</caption>")
      .replace("<p>", bold ? '<p style="font-weight:bold">' : "<p>");
    const input = client(document(body));
    const result = await collectPublicGovernance(input.edgar, CIK, "2026-11-06", options);
    expect(result.ok && result.value.data.compensation?.text).toContain("thousands of Canadian dollars");
  });
  it("retains the as-of date before an internal ownership caption", async () => {
    const body = ownership.replace("<h2>Security Ownership of Certain Beneficial Owners and Management</h2>", "")
      .replace("<table>", "<table><caption>Security Ownership</caption>");
    const input = client(document(body));
    const result = await collectPublicGovernance(input.edgar, CIK, "2026-11-06", options);
    expect(result.ok && result.value.data.beneficialOwnership?.text).toContain("as of March 31, 2026");
  });
});

describe("public SEC governance evidence", () => {
  it("retains separate dated source tables and qualifications without fabricating normalized amounts", async () => {
    const html = document(compensation + ownership);
    const input = client(html);
    const result = await collectPublicGovernance(input.edgar, CIK, "2026-11-06", options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ source: "edgar", endpoint: URL, asOf: "2026-04-15", fetchedAt: NOW });
    const evidence = result.value.data;
    expect(evidence).toMatchObject({ cik: CIK, accession: "0001193125-26-123456", form: "DEF 14A", filingDate: "2026-04-15", reportDate: null,
      documentUrl: URL, observedAt: NOW, sourceHash: createHash("sha256").update(html).digest("hex") });
    expect(evidence.compensation?.text).toContain("Jane Example, Chief Executive Officer");
    expect(evidence.compensation?.text).toContain("2,134,567");
    expect(evidence.compensation?.text).toContain("not the cash actually received");
    expect(evidence.compensation?.text).not.toContain("Northern Example");
    expect(evidence.beneficialOwnership?.text).toContain("March 31, 2026");
    expect(evidence.beneficialOwnership?.text).toContain("shared voting power");
    expect(evidence.beneficialOwnership?.text).not.toContain("Jane Example");
    for (const excerpt of [evidence.compensation, evidence.beneficialOwnership]) {
      expect(excerpt).not.toBeNull();
      if (!excerpt) continue;
      expect(html.slice(excerpt.span.start, excerpt.span.end)).toBe(excerpt.span.html);
      expect(excerpt.originalChars).toBe(excerpt.text.length);
      expect(excerpt).not.toHaveProperty("total");
    }
    expect(evidence.notes.join(" ")).toMatch(/not.*13F|13F.*not/i);
    expect(input.calls).toEqual([`https://data.sec.gov/submissions/CIK${CIK}.json`, URL]);
  });

  it.each([
    ["stale", [filing({ filingDate: "2025-05-05" })]],
    ["future", [filing({ filingDate: "2026-11-07" })]],
    ["amended", [filing({ form: "DEF 14A/A", filingDate: "2026-04-16", accessionNumber: "0001193125-26-123457" }), filing()]],
    ["same-date competing proxies", [filing(), filing({ accessionNumber: "0001193125-26-123457", primaryDocument: "different.htm" })]],
  ] as const)("refuses %s scope before requesting a document", async (_name, filings) => {
    const input = client(document(compensation), [...filings]);
    const result = await collectPublicGovernance(input.edgar, CIK, "2026-11-06", options);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.gap.field).toBe("edgar.publicGovernance");
    expect(input.calls).toHaveLength(1);
  });

  it("accepts exactly eighteen calendar months but does not refresh the filing date to fetch date", async () => {
    const input = client(document(compensation), [filing({ filingDate: "2025-05-06" })]);
    const result = await collectPublicGovernance(input.edgar, CIK, "2026-11-06", options);
    expect(result.ok && result.value.asOf).toBe("2025-05-06");
  });

  it("rejects a different submissions issuer without reading its document", async () => {
    const input = client(document(compensation), [filing()], "0007654321");
    const result = await collectPublicGovernance(input.edgar, CIK, "2026-11-06", options);
    expect(result.ok).toBe(false);
    expect(input.calls).toHaveLength(1);
  });

  it("refuses a wrong issuer declared inside the filing document", async () => {
    const input = client(document(`<ix:nonNumeric name="dei:EntityCentralIndexKey">0007654321</ix:nonNumeric>${compensation}`));
    const result = await collectPublicGovernance(input.edgar, CIK, "2026-11-06", options);
    expect(result.ok).toBe(false);
  });

  it("rejects a document path that escapes its admitted accession", async () => {
    const input = client(document(compensation), [filing({ primaryDocument: "../proxy.htm" })]);
    const result = await collectPublicGovernance(input.edgar, CIK, "2026-11-06", options);
    expect(result.ok).toBe(false);
    expect(input.calls).toHaveLength(1);
  });

  it.each([
    ["caption only", "<h2>Summary Compensation Table</h2><p>See our prior filing for this table.</p>"],
    ["unrelated table", `<h2>Summary Compensation Table</h2><h3>Director Compensation</h3><table><tr><th>Name</th><th>Year</th><th>Total</th></tr><tr><td>John Director</td><td>2025</td><td>100,000</td></tr></table>`],
    ["plain conflicting heading", `<h2>Summary Compensation Table</h2><p>Director Compensation</p><table><tr><th>Name</th><th>Year</th><th>Salary</th><th>Total</th></tr><tr><td>John Director</td><td>2025</td><td>100,000</td><td>100,000</td></tr></table>`],
    ["say on pay", "<h2>Summary Compensation Table</h2><table><tr><th>For</th><th>Against</th></tr><tr><td>900000</td><td>1234</td></tr></table>"],
    ["appointment terms", "<h2>Appointment Package</h2><table><tr><th>Name</th><th>Salary</th><th>Total</th></tr><tr><td>Jane Example</td><td>900000</td><td>2134567</td></tr></table>"],
    ["empty body", "<div></div>"],
    ["contents link", `<a href="#elsewhere">Summary Compensation Table</a>${compensation.replace("<h2>Summary Compensation Table</h2>", "")}`],
    ["hidden section", `<div hidden>${compensation}</div>`],
    ["hidden style", `<div style="display:none">${compensation}</div>`],
    ["script decoy", `<script>var decoy = ${JSON.stringify(compensation)};</script>`],
  ])("rejects %s as annual compensation evidence", async (_name, body) => {
    const input = client(document(body));
    const result = await collectPublicGovernance(input.edgar, CIK, "2026-11-06", options);
    expect(result.ok).toBe(false);
  });

  it("admits a table's own caption when no external heading exists", async () => {
    const body = compensation.replace("<h2>Summary Compensation Table</h2>", "").replace("<table>", "<table><caption>2025 Summary Compensation Table</caption>");
    const input = client(document(body));
    const result = await collectPublicGovernance(input.edgar, CIK, "2026-11-06", options);
    expect(result.ok && result.value.data.compensation?.text).toContain("2,134,567");
  });

  it("keeps ownership evidence partial when compensation is not present", async () => {
    const input = client(document(ownership));
    const result = await collectPublicGovernance(input.edgar, CIK, "2026-11-06", options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.data.compensation).toBeNull();
    expect(result.value.data.beneficialOwnership?.text).toContain("6.2%");
    expect(result.value.data).not.toHaveProperty("ownershipPercent");
    expect(result.value.data.notes.join(" ")).toMatch(/compensation.*(?:unavailable|not|absent)/i);
  });

  it("refuses competing compensation tables instead of silently choosing one", async () => {
    const input = client(document(compensation + compensation.replace("2,134,567", "3,134,567")));
    const result = await collectPublicGovernance(input.edgar, CIK, "2026-11-06", options);
    expect(result.ok).toBe(false);
  });

  it("makes no requests after cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const input = client();
    const result = await collectPublicGovernance(input.edgar, CIK, "2026-11-06", { ...options, signal: controller.signal });
    expect(result.ok).toBe(false);
    expect(input.calls).toHaveLength(0);
  });

  it("returns promptly when cancelled during the submissions read and starts no document read", async () => {
    const controller = new AbortController();
    const calls: string[] = [];
    const edgar = createEdgarClient({ transport: { fetchText(url) { calls.push(url); return new Promise<EdgarTransportResponse>(() => {}); } } });
    const pending = collectPublicGovernance(edgar, CIK, "2026-11-06", { ...options, signal: controller.signal });
    controller.abort();
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(1);
  });
});
