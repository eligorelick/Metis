import { resolveEconomicEquityScope } from "@/pipeline/stageB/securityBasis";
import { parsePrimaryEconomicShares, economicEvidenceFromInventories } from "@/edgar/economicShares";
import { expect, it } from "vitest";
import { createFmpClient } from "@/providers/fmp";
import { createEdgarClient, type EdgarTransport } from "@/providers/edgar";
import { makeLimiter } from "@/providers/http";
import { buildDataBundle } from "@/pipeline/dataBundle";
import { runStageB } from "@/pipeline/compute";
import { applyMultiples } from "@/pipeline/stageC/passes";
import { ReportSchema } from "@/report/schema";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";

const rights = "For common stock and Class B common stock, the holders of each class receive equal per share distributions through dividends or liquidation.";
function primaryHtml(options: { rights?: string; count?: string } = {}): string {
  return `<html><body><ix:header><xbrli:context id="issuer"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000000042</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>2026-06-30</xbrli:instant></xbrli:period></xbrli:context>
    ${["common", "other"].map(member => `<xbrli:context id="${member}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000000042</xbrli:identifier><xbrli:segment><xbrldi:explicitMember dimension="us-gaap:StatementClassOfStockAxis">issuer:${member}Member</xbrldi:explicitMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:instant>2026-07-24</xbrli:instant></xbrli:period></xbrli:context>`).join("")}
    <xbrli:unit id="shares"><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unit></ix:header>
    <table><tr><th>Title of each class</th><th>Trading symbol</th><th>Exchange</th></tr><tr><td><ix:nonNumeric name="dei:Security12bTitle" contextRef="issuer">Common stock, $0.001 par value</ix:nonNumeric></td><td><ix:nonNumeric name="dei:TradingSymbol" contextRef="issuer">EXMP</ix:nonNumeric></td><td>Exchange</td></tr></table>
    <p>As of July 24, 2026, the following shares of the registrant's common stock were outstanding:</p>
    <table><tr><td>Common stock, $0.001 par value</td><td><ix:nonFraction name="dei:EntityCommonStockSharesOutstanding" contextRef="common" unitRef="shares" scale="0">100,000,000</ix:nonFraction></td><td>shares</td></tr>
    <tr><td>Class B common stock, $0.001 par value</td><td><ix:nonFraction name="dei:EntityCommonStockSharesOutstanding" contextRef="other" unitRef="shares" scale="0">${options.count ?? "20,000,000"}</ix:nonFraction></td><td>shares</td></tr></table>
    <h2>Part I</h2><h2>Item 1. Financial Statements</h2><p>Shares issued: 500,000,000. Treasury shares: 380,000,000.</p><p>${options.rights ?? rights}</p><p>${"Financial statement discussion. ".repeat(100)}</p>
    <h2>Item 2. Management's Discussion and Analysis</h2><p>${"Operating results reflect current market conditions. ".repeat(100)}</p><h2>Item 3. Market Risk</h2></body></html>`;
}

async function productionBundle(html: string, dated = true) {
  const now = () => new Date("2026-10-15T12:00:00.000Z");
  const financial = completeCurrencyBundle({ symbol: "EXMP", siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  const rows = (member: { ok: boolean; value?: { data: { rows: unknown[] } } }) => member.ok ? member.value!.data.rows : [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    const endpoint = url.pathname.replace(/^.*\/stable\//, "");
    const quarter = url.searchParams.get("period") === "quarter";
    const body = endpoint === "profile" ? rows(financial.profile).map(row => ({ ...(row as object), cik: "42", symbol: "EXMP" }))
      : endpoint === "quote" ? rows(financial.quote).map(row => ({ ...(row as object), symbol: "EXMP", timestamp: dated ? Date.parse("2026-10-14T20:00:00Z") / 1000 : undefined }))
      : endpoint === "income-statement" ? rows(quarter ? financial.statements.incomeQuarterly : financial.statements.incomeAnnual)
      : endpoint === "balance-sheet-statement" ? rows(quarter ? financial.statements.balanceQuarterly : financial.statements.balanceAnnual)
      : endpoint === "cash-flow-statement" ? rows(quarter ? financial.statements.cashflowQuarterly : financial.statements.cashflowAnnual) : [];
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  const transport: EdgarTransport = { async fetchText(url) {
    const body = url.includes("company_tickers.json") ? JSON.stringify({ "0": { cik_str: 42, ticker: "EXMP", title: "Example" } })
      : url.includes("submissions/") ? JSON.stringify({ cik: "0000000042", name: "Example", tickers: ["EXMP"], exchanges: ["Exchange"], filings: { files: [], recent: { accessionNumber: ["0000000042-26-000001"], filingDate: ["2026-08-06"], reportDate: ["2026-06-30"], form: ["10-Q"], primaryDocument: ["quarter.htm"] } } })
      : url.includes("companyfacts/") ? JSON.stringify({ cik: 42, entityName: "Example", facts: {} }) : html;
    return { status: 200, body, fetchedAt: now().toISOString(), stale: false, fromCache: false };
  } };
  const unavailable = (async () => new Response("unavailable", { status: 404 })) as typeof fetch;
  return buildDataBundle("EXMP", { now, keyless: false, filingDisclosures: false, companyIr: false,
    fmp: createFmpClient({ apiKey: "test", fetchImpl, limiter: makeLimiter(10000, 10000), now }),
    edgar: createEdgarClient({ transport, maxRps: 10000 }),
    fred: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 },
    finnhub: { fetchImpl: unavailable, retryDelaysMs: [] }, finra: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 },
  });
}

it.each([true, false])("retrieves and retains source-bound class capital through production bundle, Stage B and Report (equal rights: %s)", async equal => {
  const bundle = await productionBundle(primaryHtml({ rights: equal ? rights : "Common and Class B shares have different voting rights." }));
  expect(bundle.edgar.economicShareInventory?.[0].classes.map(row => row.shares)).toEqual([100_000_000, 20_000_000]);
  const result = runStageB(bundle);
  const scope = result.valuation.multiples?.enterpriseValue.equityScope;
  expect(scope?.status).toBe(equal ? "resolved" : "unresolved");
  const report = loadTask28Fixture();
  report.valuation = applyMultiples(report.valuation, result.valuation);
  const stored = ReportSchema.parse(report);
  if (equal) {
    expect(scope).toMatchObject({ economicShares: 120_000_000, shareCountAsOf: "2026-07-24", marketCap: 12_000_000_000, approximate: true, priceAsOf: "2026-10-14" });
    expect(bundle.economicShareEvidence?.[0].sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(reportToAuditMarkdown(stored)).toContain("same-price approximation");
    expect(reportToAuditMarkdown(stored)).toContain("120,000,000 economic shares");
  } else {
    expect(scope?.marketCap).toBeNull();
    expect(reportToAuditMarkdown(stored)).toContain("scope unresolved");
  }
});

it("does not treat acquisition date as an undated main quote observation", async () => {
  const bundle = await productionBundle(primaryHtml(), false);
  if (!bundle.quote.ok) throw new Error("fixture quote");
  expect(bundle.quote.value.data.rows[0].priceAsOf).toBeNull();
  expect(bundle.quote.value.asOf).toBe("2026-10-15");
  expect(runStageB(bundle).valuation.multiples?.enterpriseValue.equityScope?.status).toBe("unresolved");
});

const identity = { issuerId: "0000000042", securityId: "EXMP", form: "10-Q", accession: "0000000042-26-000001", filingDate: "2026-08-06", primaryDocument: "quarter.htm", documentUrl: "https://www.sec.gov/Archives/edgar/data/42/000000004226000001/quarter.htm" };
it.each([
  ["negated rights", primaryHtml({ rights: rights.replace("receive equal", "do not receive equal") })],
  ["unequal rights", primaryHtml({ rights: rights.replace("equal", "unequal") })],
  ["EPS only", primaryHtml({ rights: "Common stock and Class B common stock have the same earnings per share." })],
  ["non-share unit", primaryHtml().replace("xbrli:shares</xbrli:measure>", "xbrli:pure</xbrli:measure>")],
  ["issued counts", primaryHtml().replaceAll("dei:EntityCommonStockSharesOutstanding", "us-gaap:CommonStockSharesIssued")],
  ["duplicate count", primaryHtml().replace("20,000,000", "20,000,000.5")],
])("does not admit %s as economic-class proof", (_name, html) => {
  expect(parsePrimaryEconomicShares(html, identity, "2026-10-15").evidence).toBeNull();
});
it("supports a dated enumerating cover-table header and duration-context symbol binding", () => {
  const html = primaryHtml().replace("<xbrli:instant>2026-06-30</xbrli:instant>", "<xbrli:startDate>2026-01-01</xbrli:startDate><xbrli:endDate>2026-06-30</xbrli:endDate>")
    .replace("<p>As of July 24, 2026, the following shares of the registrant's common stock were outstanding:</p>\n    <table>", "<table><tr><th>Class</th><th>Outstanding Shares at July 24, 2026 were approximately,</th></tr>");
  expect(parsePrimaryEconomicShares(html, { ...identity, form: "10-K" }, "2026-10-15").evidence?.asOf).toBe("2026-07-24");
});
it("honors filed cutoffs and ends old proof when a newer inventory has unknown rights", () => {
  const previous = parsePrimaryEconomicShares(primaryHtml(), identity, "2026-10-15");
  expect(parsePrimaryEconomicShares(primaryHtml(), identity, "2026-08-05").evidence).toBeNull();
  const newer = parsePrimaryEconomicShares(primaryHtml({ rights: "Economics not established." }), { ...identity, filingDate: "2026-09-01" }, "2026-10-15");
  expect(economicEvidenceFromInventories([newer, previous])[0].effectiveTo).toBe("2026-09-01");
});

it("does not pair a profile fallback price with the quote row's observation day", async () => {
  const bundle = await productionBundle(primaryHtml());
  if (!bundle.quote.ok || !bundle.profile.ok) throw new Error("fixture price rows");
  bundle.quote.value.data.rows[0].price = undefined;
  bundle.profile.value.data.rows[0].price = 150;
  delete bundle.profile.value.data.rows[0].timestamp;
  delete bundle.profile.value.data.rows[0].date;
  const result = runStageB(bundle);
  expect(result.returns.wacc.waccPct).toBeNull();
  expect(result.valuation.multiples?.enterpriseValue.equityScope?.status).toBe("unresolved");
});

it("retains same-day conflicting inventories together for the scope resolver to reject", () => {
  const first = parsePrimaryEconomicShares(primaryHtml(), identity, "2026-10-15");
  const second = parsePrimaryEconomicShares(primaryHtml({count: "21,000,000"}), identity, "2026-10-15");
  expect(economicEvidenceFromInventories([first, second]).map(row => row.effectiveTo)).toEqual([null, null]);
});
it("admits an explicit ordinary-class inventory without inventing extra rights or counts", () => {
  const html = primaryHtml().replace(/<tr><td>Class B common stock[\s\S]*?<\/tr>/, "");
  const parsed = parsePrimaryEconomicShares(html, identity, "2026-10-15");
  expect(parsed.evidence?.classes).toEqual([{classId: "EXMP",shares:100_000_000,countBasis:"outstanding",economicUnitsPerQuotedShare:1,priceBasis:"quoted-market-price"}]);
});

it("requires an independent observed price when the filing lists another quoted common class", async () => {
  const html = primaryHtml().replace("<p>As of July", '<table><tr><td><ix:nonNumeric name="dei:Security12bTitle" contextRef="issuer">Class B common stock</ix:nonNumeric></td><td><ix:nonNumeric name="dei:TradingSymbol" contextRef="issuer">EXMB</ix:nonNumeric></td></tr></table><p>As of July');
  const result = runStageB(await productionBundle(html));
  expect(result.valuation.multiples?.enterpriseValue.equityScope?.status).toBe("unresolved");
});

it("does not extend dividend equality to an explicitly denied liquidation right", () => {
  const html = primaryHtml({rights:"The holders of common stock and Class B common stock are entitled to equal per share distributions through dividends; Class B common stock has no rights in liquidation."});
  expect(parsePrimaryEconomicShares(html, identity, "2026-10-15").evidence).toBeNull();
});
it("refuses a partial first table when another same-date outstanding class follows", async () => {
  const html = primaryHtml().replace('</tr>\n    <tr><td>Class B', '</tr></table><table><tr><td>Class B');
  const bundle = await productionBundle(html);
  expect(bundle.economicShareEvidence).toEqual([]);
  expect(runStageB(bundle).valuation.multiples?.enterpriseValue.equityScope?.status).toBe("unresolved");
});
it("rejects a source URL not bound to SEC Archives and filing identity", () => {
  expect(parsePrimaryEconomicShares(primaryHtml(), {...identity, documentUrl:"https://example.org/foreign.htm"}, "2026-10-15").evidence).toBeNull();
});

it("does not treat proposed conditional future distributions as current rights", () => {
  const html = primaryHtml({rights:"If the proposed amendment is approved, holders of common stock and Class B common stock would receive equal per share distributions through dividends or liquidation."});
  expect(parsePrimaryEconomicShares(html, identity, "2026-10-15").evidence).toBeNull();
});
it("does not ignore an unresolved competing filing on the same disclosure day", () => {
  const known = parsePrimaryEconomicShares(primaryHtml(), identity, "2026-10-15");
  const unknownIdentity = {...identity, accession:"0000000042-26-000002",documentUrl:"https://www.sec.gov/Archives/edgar/data/42/000000004226000002/quarter.htm"};
  const unknown = parsePrimaryEconomicShares(primaryHtml({rights:"Common stock and Class B common stock have different economic rights."}), unknownIdentity, "2026-10-15");
  const evidence = economicEvidenceFromInventories([known, unknown]);
  expect(resolveEconomicEquityScope({price:100,marketCap:10e9,priceAsOf:"2026-10-14",issuerId:identity.issuerId,securityId:identity.securityId,currency:"USD"},evidence,"2026-10-15").status).toBe("unresolved");
});

it.each([
  "Prior to the July 2026 recapitalization, holders of common stock and Class B common stock received equal per share distributions through dividends or liquidation.",
  "Prior to the July 2026 recapitalization, holders of common stock and Class B common stock received equal per share distributions through dividends or liquidation. Following the recapitalization, Class B common stock receives twice the distributions of common stock.",
  rights + " Class B common stock receives twice the distributions of common stock.",
])("does not admit historical or contradictory class economics: %s", async description => {
  const bundle=await productionBundle(primaryHtml({rights:description}));
  expect(bundle.economicShareEvidence).toEqual([]);
  expect(runStageB(bundle).valuation.multiples?.enterpriseValue.equityScope?.status).toBe("unresolved");
});
it.each(["common stock","common shares","ordinary shares"])("retains an untagged outstanding class row as ambiguity (%s)", async alias => {
  const html=primaryHtml().replace(/<tr><td>Class B common stock[\s\S]*?<\/tr>/,`<tr><td>Class B ${alias}, $0.001 par value</td><td>20,000,000</td><td>shares</td></tr>`);
  const bundle=await productionBundle(html);
  expect(bundle.economicShareEvidence).toEqual([]);
  expect(runStageB(bundle).valuation.multiples?.enterpriseValue.equityScope?.status).toBe("unresolved");
});
it("admits consistently tagged common-share aliases as a complete inventory", () => {
  const html=primaryHtml().replaceAll("common stock","common shares");
  expect(parsePrimaryEconomicShares(html,identity,"2026-10-15").evidence?.classes).toHaveLength(2);
});

it.each(["common shares","ordinary shares"])("refuses an adjacent fragmented untagged %s class", async alias => {
  const html=primaryHtml().replace(/<tr><td>Class B common stock[\s\S]*?<\/tr>/,`</table><table><tr><td>Class B ${alias}</td><td>20,000,000 shares</td></tr>`);
  const bundle=await productionBundle(html);
  expect(bundle.economicShareEvidence).toEqual([]);
  expect(runStageB(bundle).valuation.multiples?.enterpriseValue.equityScope?.status).toBe("unresolved");
});
it("does not present a former charter's equality as current economics", () => {
  const html=primaryHtml({rights:"Under the former charter, holders of common stock and Class B common stock receive equal per share distributions through dividends or liquidation."});
  expect(parsePrimaryEconomicShares(html,identity,"2026-10-15").evidence).toBeNull();
});

it.each(["Effective January 1, 2027", "Beginning January1,2027", "From 2027-01-01", "Starting next fiscal year"])("does not infer current applicability for dated or relative rights (%s)", async qualifier => {
  const description=qualifier+", holders of common stock and Class B common stock receive equal per share distributions through dividends or liquidation.";
  const bundle=await productionBundle(primaryHtml({rights:description}));
  expect(bundle.economicShareEvidence).toEqual([]);
  expect(runStageB(bundle).valuation.multiples?.enterpriseValue.equityScope?.status).toBe("unresolved");
});
it.each(["half", "one-half", "0.5 times", "a preferential share of"])("does not ignore unsupported additional-class distribution assertions (%s)", async amount => {
  const description=rights+` Class B common stock receives ${amount} the distributions of common stock.`;
  const bundle=await productionBundle(primaryHtml({rights:description}));
  expect(bundle.economicShareEvidence).toEqual([]);
  expect(runStageB(bundle).valuation.multiples?.enterpriseValue.equityScope?.status).toBe("unresolved");
});

it("does not discard a conflicting economic-rights assertion carried in a layout table", async () => {
  const html=primaryHtml().replace("<h2>Item 3. Market Risk</h2>","<table><tr><td>Class B common stock</td><td>receives half the distributions of common stock.</td></tr></table><h2>Item 3. Market Risk</h2>");
  const bundle=await productionBundle(html);
  expect(bundle.economicShareEvidence).toEqual([]);
  expect(runStageB(bundle).valuation.multiples?.enterpriseValue.equityScope?.status).toBe("unresolved");
});

const boundedEquality = "Holders of common stock and Class B common stock receive equal per share distributions through dividends or liquidation.";
const withRightsPassage = (passage: string): string => primaryHtml({ rights: boundedEquality }).replace(`<p>${boundedEquality}</p>`, passage);
it.each([
  ["future introductory sentence", `<p>The rights described below apply starting January 1, 2027. ${boundedEquality}</p>`],
  ["historical introductory sentence", `<p>The following describes rights in force before the July 2026 recapitalization. ${boundedEquality}</p>`],
  ["conditional introduction", `<p>Upon completion of the proposed recapitalization, distributions will be made as follows. ${boundedEquality}</p>`],
  ["same-paragraph anaphora", `<p>${boundedEquality} The latter class instead receives twice the distributions of the former.</p>`],
  ["same-paragraph future suffix", `<p>${boundedEquality} These rights become effective January 1, 2027.</p>`],
  ["classless applicability suffix", `<p>${boundedEquality} This applies beginning January 1, 2027.</p>`],
  ["classless conditional prefix", `<p>This applies only after approval. ${boundedEquality}</p>`],
  ["following paragraph anaphora", `<p>${boundedEquality}</p><p>The latter class instead receives twice the distributions of the former.</p>`],
  ["plural governing paragraph", `<p>Distributions commence in 2027.</p><p>${boundedEquality}</p>`],
  ["governing clause across neutral paragraph", `<p>The following rights become effective January 1, 2027.</p><p>Common stock has two classes.</p><p>${boundedEquality}</p>`],
  ["future applicability heading", `<h4>The rights described below apply starting January 1, 2027.</h4><p>${boundedEquality}</p>`],
  ["following scope heading and anaphora", `<p>${boundedEquality}</p><h4>Distribution limitations</h4><p>The latter class instead receives twice the distributions of the former.</p>`],
  ["governing div", `<div>The following distribution rights become effective January 1, 2027. ${boundedEquality}</div>`],
  ["governing layout row", `<table><tr><td>The following distribution rights become effective January 1, 2027.</td><td>${boundedEquality}</td></tr></table>`],
  ["numeric layout is not an applicability reset", `<table><tr><td>Distributions commence in 2027.</td><td><ix:nonFraction name="us-gaap:Assets" contextRef="issuer" unitRef="shares">1</ix:nonFraction></td></tr></table><p>${boundedEquality}</p>`],
  ["unsupported coreference grammar", `<p>${boundedEquality} Their participation differs.</p>`],
  ["selected paragraph budget", `<p>${"The company has two classes of common stock. ".repeat(400)}${boundedEquality}</p>`],
  ["passage budget across neutral paragraphs", `<p>Distributions commence in 2027.</p>${"<p>The company has two classes of common stock.</p>".repeat(70)}<p>${boundedEquality}</p>`],
])("refuses unresolved complete-passage context: %s", async (_name, passage) => {
  const bundle = await productionBundle(withRightsPassage(passage));
  expect(bundle.economicShareEvidence).toEqual([]);
  const result = runStageB(bundle);
  expect(result.valuation.multiples?.enterpriseValue.equityScope?.status).toBe("unresolved");
  expect(result.valuation.multiples?.enterpriseValue.value).toBeNull();
});
it.each([
  "The company has two classes of common stock. ",
  "The following describes current rights. ",
])("retains supported current-rights passage: %s", async introduction => {
  const bundle = await productionBundle(primaryHtml({ rights: introduction + boundedEquality }));
  expect(runStageB(bundle).valuation.multiples?.enterpriseValue.equityScope?.status).toBe("resolved");
});
it.each([
  "It is false that holders of common stock and Class B common stock receive equal per share distributions through dividends or liquidation.",
  "Some investors incorrectly assume that holders of common stock and Class B common stock receive equal per share distributions through dividends or liquidation.",
  "Management disputes that holders of common stock and Class B common stock receive equal per share distributions through dividends or liquidation.",
  "According to an unadopted draft, holders of common stock and Class B common stock receive equal per share distributions through dividends or liquidation.",
  boundedEquality + " Earnings per share is calculated using weighted-average shares; the latter class instead receives twice the amount.",
  boundedEquality + " Earnings per share is calculated using weighted-average shares and the latter class instead receives twice the amount.",
  boundedEquality + " Earnings per share is calculated using weighted-average shares, while the latter class instead receives twice the amount.",
])("requires an entire supported affirmative assertion and accounting clause: %s", async description => {
  const bundle = await productionBundle(primaryHtml({ rights: description }));
  expect(bundle.economicShareEvidence).toEqual([]);
  expect(runStageB(bundle).valuation.multiples?.enterpriseValue.equityScope?.status).toBe("unresolved");
});
it("preserves a whole neutral EPS-method clause alongside current equality", async () => {
  const bundle = await productionBundle(primaryHtml({ rights: boundedEquality + " Earnings per share is calculated using weighted-average shares." }));
  expect(runStageB(bundle).valuation.multiples?.enterpriseValue.equityScope?.status).toBe("resolved");
});
it.each([
  "Net income attributable to parent; the latter class instead receives twice the amount.",
  "Net income attributable to parent and the latter class instead receives twice the amount.",
  "Earnings per share attributable to parent; the latter class instead receives twice the amount. available to common stockholders",
])("refuses compound assertions in a neutral financial row: %s", async label => {
  const passage = `<p>${boundedEquality}</p><table><tr><td>${label}</td><td>$100</td></tr></table>`;
  const bundle = await productionBundle(withRightsPassage(passage));
  expect(bundle.economicShareEvidence).toEqual([]);
  expect(runStageB(bundle).valuation.multiples?.enterpriseValue.equityScope?.status).toBe("unresolved");
});
it("retains a supported numeric income row with a plain issuer label", async () => {
  const passage = `<p>${boundedEquality}</p><table><tr><td>Net income attributable to Example Issuer</td><td>$100</td></tr></table>`;
  const bundle = await productionBundle(withRightsPassage(passage));
  expect(runStageB(bundle).valuation.multiples?.enterpriseValue.equityScope?.status).toBe("resolved");
});
