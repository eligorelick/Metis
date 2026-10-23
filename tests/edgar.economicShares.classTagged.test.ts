import { describe, expect, it } from "vitest";
import { economicEvidenceFromInventories, parsePrimaryEconomicShares } from "@/edgar/economicShares";
import { parseDocument } from "@/edgar/extract";
import { resolveEconomicEquityScope } from "@/pipeline/stageB/securityBasis";

// Audit 2026-10-22 B-8: a cover that tags each class's count with a class
// member, binds the trading symbol to one class and states every class's
// economic relation establishes issuer-economic scope. Wording below is the
// public 10-Q text of META (equal classes) and BRK (Class B = 1/1,500 of A).
const metaRights = "The holders of our Class A and Class B common stock (together, \"common stock\") have identical liquidation and dividend rights but different voting rights.";
const brkRights = "Class B common stock possesses dividend and distribution rights equal to one-fifteen-hundredth (1/1,500) of such rights of Class A common stock.";

function coverHtml(options: { symbol: string; title: string; counts: Record<string, string>; body: string; symbolMember?: string; dates?: Record<string, string> }): string {
  const context = (id: string, period: string, member?: string) => `<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000000042</xbrli:identifier>${member ? `<xbrli:segment><xbrldi:explicitMember dimension="us-gaap:StatementClassOfStockAxis">us-gaap:CommonClass${member}Member</xbrldi:explicitMember></xbrli:segment>` : ""}</xbrli:entity><xbrli:period>${period}</xbrli:period></xbrli:context>`;
  const duration = "<xbrli:startDate>2026-01-01</xbrli:startDate><xbrli:endDate>2026-06-30</xbrli:endDate>";
  return `<html xmlns:dei="http://xbrl.sec.gov/dei/2025" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"><body>
    <ix:header>${context("c-1", duration, options.symbolMember)}${Object.keys(options.counts).map(cls => context(`count-${cls}`, `<xbrli:instant>${options.dates?.[cls] ?? "2026-07-24"}</xbrli:instant>`, cls)).join("")}
    <xbrli:unit id="shares"><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unit></ix:header>
    <table><tr><td><ix:nonNumeric contextRef="c-1" name="dei:Security12bTitle">${options.title}</ix:nonNumeric></td><td><ix:nonNumeric contextRef="c-1" name="dei:TradingSymbol">${options.symbol}</ix:nonNumeric></td></tr></table>
    <p>${Object.entries(options.counts).map(([cls, count]) => `Class ${cls}: <ix:nonFraction unitRef="shares" contextRef="count-${cls}" name="dei:EntityCommonStockSharesOutstanding" format="ixt:num-dot-decimal" scale="0">${count}</ix:nonFraction>`).join("; ")}</p>
    <h2>Part I</h2><h2>Item 1. Financial Statements</h2>${options.body}<p>${"Financial statement discussion. ".repeat(100)}</p>
    <h2>Item 2. Management's Discussion and Analysis</h2><p>${"Operating results reflect current market conditions. ".repeat(100)}</p><h2>Item 3. Market Risk</h2></body></html>`;
}
const identity = (symbol: string) => ({ issuerId: "0000000042", securityId: symbol, form: "10-Q", accession: "0000000042-26-000001", filingDate: "2026-08-06",
  primaryDocument: "quarter.htm", documentUrl: "https://www.sec.gov/Archives/edgar/data/42/000000004226000001/quarter.htm" });
const parse = (html: string, symbol: string) => parsePrimaryEconomicShares(html, identity(symbol), "2026-10-15", parseDocument(html));
const quote = (symbol: string, price: number) => ({ price, marketCap: 1, issuerId: "0000000042", securityId: symbol, currency: "USD", priceAsOf: "2026-10-14" });

const metaLike = (body = `<h3>Earnings per Share</h3><p>${metaRights}</p>`) => coverHtml({ symbol: "META", title: "Class A Common Stock, $0.000006 par value",
  counts: { A: "2,205,128,509", B: "342,377,716" }, body });
const brkLike = (body = `<p>${brkRights}</p>`) => coverHtml({ symbol: "BRK.B", title: "Class B Common Stock", symbolMember: "B",
  counts: { A: "488,450", B: "1,408,035,161" }, body });

describe("class-tagged cover with stated class economics (audit 2026-10-22 B-8)", () => {
  it("values equal classes at the quoted price, even under a heading", () => {
    const parsed = parse(metaLike(), "META");
    expect(parsed.evidence?.classes).toEqual([
      { classId: "META", shares: 2_205_128_509, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "quoted-market-price" },
      { classId: "us-gaap:CommonClassBMember", shares: 342_377_716, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "economic-equivalence-proxy" },
    ]);
    expect(parsed.passages.rights).toBe(metaRights);
    const scope = resolveEconomicEquityScope(quote("META", 700), economicEvidenceFromInventories([parsed]), "2026-10-15");
    expect(scope).toMatchObject({ status: "resolved", economicShares: 2_547_506_225, shareCountAsOf: "2026-07-24" });
    expect(scope.marketCap).toBeCloseTo(2_547_506_225 * 700, 0);
  });

  it("values a class at its stated economic weight times the quoted class price", () => {
    const parsed = parse(brkLike(), "BRK-B");
    expect(parsed.evidence?.classes).toEqual([
      { classId: "us-gaap:CommonClassAMember", shares: 488_450, countBasis: "outstanding", economicUnitsPerQuotedShare: 1500, priceBasis: "economic-equivalence-proxy" },
      { classId: "BRK-B", shares: 1_408_035_161, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "quoted-market-price" },
    ]);
    const scope = resolveEconomicEquityScope(quote("BRK-B", 500), economicEvidenceFromInventories([parsed]), "2026-10-15");
    expect(scope.status).toBe("resolved");
    expect(scope.marketCap).toBeCloseTo((488_450 * 1500 + 1_408_035_161) * 500, 0);
  });

  it.each([
    ["no stated relation", metaLike("<p>Class A and Class B common stock vote together as a single class.</p>")],
    ["a conflicting economic statement", metaLike(`<p>${metaRights}</p><p>Class B common stock is not entitled to dividends declared on Class A common stock.</p>`)],
    ["a relation naming a class with no count", metaLike("<p>The holders of our Class A, Class B and Class C common stock have identical liquidation and dividend rights.</p>")],
    ["a relation covering only some classes", brkLike("<p>The holders of our Class A common stock have identical liquidation and dividend rights.</p>")],
    ["an unparsed relative entitlement", metaLike(`<p>${metaRights}</p><p>Class B common stock is entitled to receive 110% of dividends paid on Class A common stock.</p>`)],
  ])("keeps withholding on %s", (_name, html) => {
    const parsed = parse(html, html.includes("BRK.B") ? "BRK-B" : "META");
    expect(parsed.evidence).toBeNull();
    expect(parsed.reason).toMatch(/^Class-tagged cover counts retained/);
  });

  it("keeps withholding when a class is counted at another date", () => {
    const html = coverHtml({ symbol: "META", title: "Class A Common Stock, $0.000006 par value", body: `<p>${metaRights}</p>`,
      counts: { A: "2,205,128,509", B: "342,377,716", C: "900,000,000" }, dates: { C: "2026-06-30" } });
    const parsed = parse(html, "META");
    expect(parsed.evidence).toBeNull();
    expect(resolveEconomicEquityScope(quote("META", 700), economicEvidenceFromInventories([parsed]), "2026-10-15").status).not.toBe("resolved");
  });

  it("still reads a sentence reporting dividends paid on each class", () => {
    const paid = "We paid quarterly dividends and dividend equivalents of $ 0.525 per share of common stock, totaling $ 1.17 billion for Class A common stock and $ 180 million for Class B common stock.";
    expect(parse(metaLike(`<p>${metaRights}</p><p>${paid}</p>`), "META").evidence?.complete).toBe(true);
  });

  it("flags class ambiguity only from evidence in force on the price day", () => {
    const multiClass = economicEvidenceFromInventories([parse(metaLike(), "META")]);
    const ended = multiClass.map(row => ({ ...row, effectiveFrom: "2025-01-01", effectiveTo: "2026-01-01" }));
    expect(resolveEconomicEquityScope(quote("META", 700), ended, "2026-10-15")).toMatchObject({ status: "unresolved" });
    expect(resolveEconomicEquityScope(quote("META", 700), ended, "2026-10-15").classAmbiguity).toBeUndefined();
    const incomplete = multiClass.map(row => ({ ...row, complete: false }));
    expect(resolveEconomicEquityScope(quote("META", 700), incomplete, "2026-10-15")).toMatchObject({ status: "unresolved", classAmbiguity: true });
  });

  it("keeps withholding when the trading symbol is not the quoted security", () => {
    expect(parse(metaLike(), "FB").evidence).toBeNull();
  });
});
