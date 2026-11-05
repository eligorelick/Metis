import { describe, expect, it } from "vitest";
import { identicalClassRights } from "@/edgar/economicShares";
import { retainedClassEconomicEvidence } from "@/edgar/retainedClassEconomics";
import { resolveEconomicEquityScope } from "@/pipeline/stageB/securityBasis";
import { retainedCommonClassAmbiguity } from "@/pipeline/stageB/commonClassScope";
import type { DataBundle } from "@/pipeline/types";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import filed from "./fixtures/valuation-coverage-equal-classes.json";

const rights = "There are no differences in the dividend and liquidation preferences or participation rights of the holders of Class A and Class B Common Stock.";
function fixture() {
  const b = completeCurrencyBundle({ symbol: "EQUAL" });
  b.builtAt = "2026-11-03T18:00:00Z";
  if (!b.profile.ok) throw Error("profile fixture");
  Object.assign(b.profile.value.data.rows[0]!, { symbol: b.symbol, cik: "0000320187", companyName: "Example, Inc.", isAdr: false });
  b.edgar.registrant = { cik10: "0000320187", name: "Example", tickers: [b.symbol], exchanges: ["NYSE"], sic: "3021", sicDescription: null, fiscalYearEnd: "0531", stateOfIncorporation: null, forms: ["10-K", "10-Q"] };
  b.edgar.tenKNotes = structuredClone(filed.tenKNotes) as DataBundle["edgar"]["tenKNotes"];
  b.edgar.tenQNotes = structuredClone(filed.tenQNotes) as DataBundle["edgar"]["tenQNotes"];
  b.edgar.economicShareInventory = structuredClone(filed.economicShareInventory);
  return b;
}

function syntheticInterimFixture() {
  const b = completeCurrencyBundle({ symbol: "EQUAL" });
  b.builtAt = "2026-11-03T18:00:00Z";
  if (!b.profile.ok || !b.quote.ok) throw Error("fixture");
  Object.assign(b.profile.value.data.rows[0]!, { symbol: b.symbol, cik: "0000000042", isAdr: false });
  b.quote.value.data.rows[0]!.timestamp = Date.parse("2026-11-03T17:00:00Z") / 1000;
  b.edgar.registrant = { cik10: "0000000042", name: "Example", tickers: [b.symbol], exchanges: ["NYSE"],
    sic: "3021", sicDescription: null, fiscalYearEnd: "0531", stateOfIncorporation: null, forms: ["10-K", "10-Q"] };
  const source = (form: string, accession: string, filingDate: string) => ({ form, accession, filingDate,
    documentUrl: `https://www.sec.gov/Archives/edgar/data/42/${accession.replaceAll("-", "")}/example.htm`, hash: accession });
  const annual = source("10-K", "0000000042-26-000001", "2026-07-15");
  const interim = source("10-Q", "0000000042-26-000002", "2026-10-02");
  const observations = (s: typeof annual, asOf: string) => ["A", "B"].map((c, i) => ({ classId: `us-gaap:CommonClass${c}Member`,
    shares: 100 + i * 100, asOf, contextId: `c${i}`, sourceId: `${s.documentUrl}#f${i}` }));
  b.edgar.economicShareInventory = [annual, interim].map((s, i) => ({ source: s, classes: [], evidence: null,
    observations: observations(s, i === 0 ? "2026-07-08" : "2026-09-28"), reason: "unresolved cover", passages: { inventory: "", rights: null } }));
  const notes = (s: typeof annual, reportDate: string, text: string) => ({ ok: true as const, value: { source: "edgar" as const,
    endpoint: s.documentUrl, asOf: reportDate, fetchedAt: b.builtAt, data: { ...s, reportDate, text, chars: text.length,
      sectionName: s.form === "10-K" ? "tenKNotes" as const : "tenQNotes" as const, method: "header-regex" as const } } });
  b.edgar.tenKNotes = notes(annual, "2026-05-31", "The holders of Class A and Class B common stock have identical liquidation and dividend rights.");
  b.edgar.tenQNotes = notes(interim, "2026-08-31", "Common stock at stated value: Class A convertible — 100 shares outstanding; Class B — 200 shares outstanding Capital in excess");
  return b;
}

describe("D-186 equally participating class coverage", () => {
  it("reads explicit equal economics with voting and conversion differences", () => {
    expect(identicalClassRights("The rights, including the liquidation and dividend rights, of the holders of Class A and Class B common stock are identical, except with respect to voting and conversion."))
      .toEqual(["class a common stock", "class b common stock"]);
  });
  it("admits complete inline counts with a share-for-share conversion and an ordinary balance-sheet layout", () => {
    const b = syntheticInterimFixture();
    if (!b.edgar.tenKNotes?.ok || !b.edgar.tenQNotes?.ok) throw Error("fixture");
    b.edgar.tenKNotes.value.data.text = "Each share of Class B common stock is convertible into Class A common stock on a one-for-one basis.";
    b.edgar.tenQNotes.value.data.text = "Consolidated Balance Sheets Equity: Class A common stock, authorized 1,000 shares; 100 shares issued and outstanding. Class B common stock, authorized 1,000 shares; 200 shares issued and outstanding. Additional paid-in capital 30. Consolidated Statements of Income";
    const evidence = retainedClassEconomicEvidence(b);
    expect(evidence[0]?.classes.map(c => [c.shares, c.economicUnitsPerQuotedShare])).toEqual([[100, 1], [200, 1]]);
    expect(evidence[0]?.basis).toMatch(/one-for-one/);
    expect(evidence[0]?.basis).toContain("equal current dividend and liquidation rights are not independently established");
    b.edgar.tenQNotes.value.data.text += " Class B common stock has preferential dividend rights.";
    expect(retainedClassEconomicEvidence(b)).toEqual([]);
  });
  it("does not infer a conversion ratio from convertible class names alone", () => {
    const b = syntheticInterimFixture();
    if (!b.edgar.tenKNotes?.ok) throw Error("fixture");
    b.edgar.tenKNotes.value.data.text = "Class A common stock is convertible into Class B common stock.";
    expect(retainedClassEconomicEvidence(b)).toEqual([]);
  });
  it("refuses unequal current per-share dividends despite a one-for-one conversion", () => {
    const b = syntheticInterimFixture();
    if (!b.edgar.tenKNotes?.ok || !b.edgar.tenQNotes?.ok) throw Error("fixture");
    b.edgar.tenKNotes.value.data.text = "Class B common stock is convertible, share for share, into Class A common stock.";
    b.edgar.tenQNotes.value.data.text += " Class A common stock receives a dividend of $0.44 per share and Class B common stock receives a dividend of $0.28 per share.";
    expect(retainedClassEconomicEvidence(b)).toEqual([]);
    expect(retainedCommonClassAmbiguity(b)?.reason).toMatch(/unequal per-share dividends.*Class A.*Class B/i);
  });
  it("does not let a repeated denial grant economic rights to a voting-only security", () => {
    const b = syntheticInterimFixture();
    if (!b.edgar.tenKNotes?.ok || !b.edgar.tenQNotes?.ok) throw Error("fixture");
    const q = b.edgar.economicShareInventory![1]!;
    q.observations!.push({ classId: "example:ControlShareMember", shares: 1, asOf: "2026-09-28", contextId: "control", sourceId: `${q.source.documentUrl}#control` });
    b.edgar.tenKNotes.value.data.text = "The Control Share has no economic rights.";
    b.edgar.tenQNotes.value.data.text += ". Holders of Class A and Class B common stock are entitled to equal dividends per share and share equally in liquidation. The Control Share has no economic rights.";
    expect(retainedClassEconomicEvidence(b)[0]?.classes.map(c => c.shares)).toEqual([100, 200]);
  });
  it("establishes one-for-one conversion from both sides of the filed class rollforward", () => {
    const b = syntheticInterimFixture();
    if (!b.edgar.tenKNotes?.ok) throw Error("fixture");
    b.edgar.tenKNotes.value.data.text = "Class A shares are fully convertible into class B shares at any time. " +
      "Class A Common Stock: Balance at beginning of year 80 90 100 Conversions of class A to class B common stock (8) (5) (4) Class A shares issued at end of year 72 85 96 " +
      "Class B Common Stock: Balance at beginning of year 300 310 320 Conversions of class A to class B common stock 8 5 4 Class B shares issued at end of year 308 315 324";
    b.edgar.tenKNotes.value.data.text += " Prior table Class A Common Stock: Conversions of class A to class B common stock (3) — — Class B Common Stock: Conversions of class A to class B common stock 3 — — ";
    expect(retainedClassEconomicEvidence(b)[0]?.classes.every(c => c.economicUnitsPerQuotedShare === 1)).toBe(true);
    b.edgar.tenKNotes.value.data.text = b.edgar.tenKNotes.value.data.text.replace("stock 8 5 4", "stock 16 10 8");
    expect(retainedClassEconomicEvidence(b)).toEqual([]);
  });
  it("uses the filed two-class participation statement and excludes only a proved non-economic voting share", () => {
    const b = syntheticInterimFixture();
    if (!b.edgar.tenKNotes?.ok || !b.edgar.tenQNotes?.ok) throw Error("fixture");
    const q = b.edgar.economicShareInventory![1]!;
    q.observations!.push({ classId: "example:FounderShareMember", shares: 1, asOf: "2026-09-28", contextId: "founder", sourceId: `${q.source.documentUrl}#founder` });
    b.edgar.tenKNotes.value.data.text = "The Founder Share carries no economic rights.";
    b.edgar.tenQNotes.value.data.text = "Class A common stock and Class B common stock are participating securities with equal participation rights and receive dividends on a one-for-one basis.";
    const evidence = retainedClassEconomicEvidence(b);
    expect(evidence[0]?.classes.map(c => c.shares)).toEqual([100, 200]);
    expect(evidence[0]?.basis).toMatch(/Founder Share.*no economic rights|no economic rights.*Founder Share/i);
    expect(evidence[0]?.basis).not.toContain("balance-sheet inventory");
    const text = b.edgar.tenQNotes.value.data.text;
    b.edgar.tenQNotes.value.data.text += " The Founder Share has no economic rights.";
    expect(retainedClassEconomicEvidence(b)[0]?.classes.map(c => c.shares)).toEqual([100, 200]);
    b.edgar.tenQNotes.value.data.text = text;
    b.edgar.tenQNotes.value.data.text += " The Founder Share has dividend rights.";
    expect(retainedClassEconomicEvidence(b)).toEqual([]);
    b.edgar.tenQNotes.value.data.text = text;
    q.observations!.push({ ...q.observations!.at(-1)!, contextId: "duplicate" });
    expect(retainedClassEconomicEvidence(b)).toEqual([]);
    q.observations!.pop();
    b.edgar.tenKNotes.value.data.text = "The Founder Share has variable voting rights.";
    expect(retainedClassEconomicEvidence(b)).toEqual([]);
  });
  it("reads the filed no-differences sentence as equal economic rights", () => {
    expect(identicalClassRights(rights)).toEqual(["class a common stock", "class b common stock"]);
  });
  it("values every dated class at the same-price approximation without guessing the quoted class", () => {
    const b = fixture(), before = JSON.stringify(b);
    const evidence = retainedClassEconomicEvidence(b);
    const scope = resolveEconomicEquityScope({ price: 50, marketCap: 1, issuerId: "0000320187", securityId: "EQUAL", currency: "USD", priceAsOf: "2026-11-03", isAdr: false }, evidence, "2026-11-03");
    expect(scope).toMatchObject({ status: "resolved", economicShares: 1_485_308_829, marketCap: 74_265_441_450, approximate: true, shareCountAsOf: "2026-09-28" });
    expect(scope.basis).toContain(rights);
    expect(scope.basis).toContain("quoted class is not identified");
    expect(scope.sourceIds).toContain(filed.tenKNotes.value.data.documentUrl);
    expect(scope.sourceIds).toContain(filed.tenQNotes.value.data.documentUrl);
    expect(JSON.stringify(b)).toBe(before);
  });
  it("replaces expired annual evidence with a fully proved current interim cover", () => {
    const b = syntheticInterimFixture();
    b.economicShareEvidence = [{ issuerId: "0000000042", securityId: b.symbol, asOf: "2026-07-08",
      filed: "2026-07-15", effectiveFrom: "2026-07-15", effectiveTo: "2026-10-02", complete: true,
      sourceHash: "annual", sourceIds: ["annual"], classes: [
        { classId: "class a common stock", shares: 280, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "economic-equivalence-proxy" },
        { classId: "class b common stock", shares: 1200, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "economic-equivalence-proxy" },
      ] }];
    const before = JSON.stringify(b);
    const evidence = retainedClassEconomicEvidence(b);
    expect(evidence[0]?.asOf).toBe("2026-09-28");
    expect(evidence[0]?.classes.reduce((n, c) => n + c.shares, 0)).toBe(300);
    expect(JSON.stringify(b)).toBe(before);
    b.edgar.economicShareInventory![1]!.observations!.pop();
    const refused = retainedClassEconomicEvidence(b);
    expect(resolveEconomicEquityScope({ price: 50, marketCap: 1, issuerId: "0000000042", securityId: b.symbol,
      currency: "USD", priceAsOf: "2026-11-03", isAdr: false }, refused, "2026-11-03").status).toBe("unresolved");
  });
  it("refuses a split after the cover date rather than using pre-split counts", () => {
    const b = fixture();
    b.edgar.shareBasis = { basisDay: "2026-11-03", splits: { asOf: "2026-11-03", coverage: [], events: [{ date: "2026-10-15", ratio: 2 }], notes: [], unresolved: [], vendor: { source: "fixture", status: "unavailable" } } } as unknown as NonNullable<DataBundle["edgar"]["shareBasis"]>;
    expect(retainedClassEconomicEvidence(b)).toEqual([]);
  });
  it("refuses an inventory with a third class absent from its cover observations", () => {
    const b = fixture();
    b.edgar.economicShareInventory![1]!.classes.push({ classId: "unknown", label: "Class C", shares: 1, asOf: "2026-09-28", sourceId: "source" });
    expect(retainedClassEconomicEvidence(b)).toEqual([]);
  });
  it.each(["missing rights", "qualified rights", "other issuer", "ADR", "incomplete cover", "duplicate cover", "mixed dates", "future cover", "extra class", "contrary newer rights", "unbound URL", "newer filing", "stale rights", "split"])("refuses %s", mode => {
    const b = fixture();
    if (!b.edgar.tenKNotes?.ok || !b.edgar.tenQNotes?.ok || !b.profile.ok) throw Error("fixture");
    const a = b.edgar.tenKNotes.value.data, q = b.edgar.tenQNotes.value.data;
    const inventory = b.edgar.economicShareInventory![1]!;
    if (mode === "missing rights") a.text = "Class A converts to Class B.";
    if (mode === "qualified rights") a.text = rights.replace(".", ", except for special dividends.");
    if (mode === "other issuer") b.profile.value.data.rows[0]!.cik = "99";
    if (mode === "ADR") b.profile.value.data.rows[0]!.isAdr = true;
    if (mode === "incomplete cover") inventory.observations!.pop();
    if (mode === "duplicate cover") inventory.observations!.push({ ...inventory.observations![0]! });
    if (mode === "mixed dates") inventory.observations![0]!.asOf = "2026-09-27";
    if (mode === "future cover") inventory.observations!.forEach(o => o.asOf = "2026-10-03");
    if (mode === "extra class") q.statementsText = q.statementsText!.replace("Capital in excess", "Class C — 5 shares outstanding Capital in excess");
    if (mode === "contrary newer rights") q.text += " Class B common stock has preferential dividend rights.";
    if (mode === "unbound URL") q.documentUrl = "https://example.com/filing.htm";
    if (mode === "newer filing") b.edgar.economicShareInventory!.push({ ...inventory, source: { ...inventory.source, filingDate: "2026-10-03" } });
    if (mode === "stale rights") a.filingDate = "2024-07-15";
    if (mode === "split") b.edgar.shareBasis = { basisDay: "2026-11-03", splits: { asOf: "2026-11-03", coverage: [], events: [], notes: [], unresolved: [{ reason: "unknown split" }], vendor: { source: "fixture", status: "unavailable" } } } as unknown as NonNullable<DataBundle["edgar"]["shareBasis"]>;
    expect(retainedClassEconomicEvidence(b)).toEqual([]);
  });
});
