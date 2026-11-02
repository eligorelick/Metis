import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { assembleContextPayload, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const rights = "The rights, including the liquidation and dividend rights and sharing of losses, of the Class A common stock, Alternate common stock, and Class B common stock are identical, other than voting rights.";
function fixture(statement = "", text = rights) {
  const b = completeCurrencyBundle({});
  if (!b.profile.ok) throw new Error("fixture profile");
  Object.assign(b.profile.value.data.rows[0]!, { symbol: b.symbol, cik: "0000000042", companyName: "Example Class A Common Stock", isAdr: false });
  if (b.quote.ok) b.quote.value.data.rows[0]!.timestamp = Date.parse("2026-07-05T00:00:00Z") / 1000;
  b.edgar.registrant = { cik10: "0000000042", name: "Example", tickers: [b.symbol], exchanges: ["Nasdaq"], sic: "3571", sicDescription: "Computers", fiscalYearEnd: "1231", stateOfIncorporation: "DE", forms: ["10-Q"] };
  b.edgar.tenQNotes = { ok: true, value: { source: "edgar", endpoint: "filing:notes", asOf: "2026-03-31", fetchedAt: b.builtAt,
    data: { sectionName: "tenQNotes", text, statementsText: statement || "CONSOLIDATED BALANCE SHEETS (in thousands, except share and per share data) March 31, 2026 December 31, 2025 Stockholders' equity: Class A common stock - $0.0001 par value per share: 500,000,000 shares authorized, 100,000,000 shares issued and outstanding at March 31, 2026; 99,000,000 shares issued and outstanding at December 31, 2025 10 9 Class B common stock - $0.0001 par value per share: 100,000,000 shares authorized, 20,000,000 shares issued and outstanding at March 31, 2026 and December 31, 2025 2 2 Alternate common stock - $0.0001 par value per share: 100,000,000 shares authorized, 5,000,000 and no shares issued and outstanding at March 31, 2026 and December 31, 2025 1 0 Total stockholders' equity 100 90 CONSOLIDATED STATEMENTS OF OPERATIONS",
      method: "toc-anchor", chars: text.length, accession: "0000000042-26-000001", form: "10-Q", filingDate: "2026-05-06", reportDate: "2026-03-31", documentUrl: "https://www.sec.gov/Archives/edgar/data/42/000000004226000001/quarter.htm" } } };
  return b;
}

describe("R-FIGR-3 filed common-class economics", () => {
  it("admits all three equally participating outstanding classes, with dated proxy provenance and no raw-bundle mutation", () => {
    const b = fixture();
    const before = JSON.stringify(b);
    const c = runStageB(b);
    const scope = c.valuation.multiples!.enterpriseValue.equityScope!;
    expect(scope).toMatchObject({ status: "resolved", economicShares: 125_000_000, approximate: true, shareCountAsOf: "2026-03-31" });
    expect(scope.sourceIds).toContain("https://www.sec.gov/Archives/edgar/data/42/000000004226000001/quarter.htm");
    expect(scope.sourceHashes.length).toBeGreaterThan(0);
    expect(scope.basis).toContain("same-price approximation");
    expect(scope.basis).toContain("Quote class bound by provider title");
    expect(scope.marketCap).toBe(12_500_000_000); // 125m outstanding x the fixture's $100 quote.
    expect(c.valuation.multiples!.multiples.find(m => m.key === "priceToBook")?.current).toBeGreaterThan(0);
    const payload = assembleContextPayload(b, c, { checks: [], flags: [], gaps: [] });
    expect(payload.quote.figures.find(f => f.source === "computed.valuation.equityScope.marketCap")).toMatchObject({ value: 12_500_000_000, currency: "USD", asOf: "2026-07-05" });
    expect(payload.quote.figures.find(f => f.source === "computed.valuation.equityScope.economicShares")).toMatchObject({ value: 125_000_000, unit: "shares", currency: null, asOf: "2026-03-31" });
    expect(payload.quote.figures.find(f => /provider market cap/i.test(f.label))?.value).toBe(10_000_000_000);
    const prompt = serializePayloadForPrompt(payload);
    expect(prompt).toContain("125000000");
    expect(prompt).toContain("same-price approximation");
    expect(JSON.stringify(b)).toBe(before);
  });

  it("F5 discloses a same-filing provider quoted-class discrepancy without changing admission", () => {
    const b = fixture();
    if (!b.edgar.tenQNotes?.ok) throw new Error("fixture");
    b.sharesFloat = { ok: true, value: { source: "fmp", endpoint: "/shares-float", asOf: "2026-05-05", fetchedAt: b.builtAt,
      data: { rows: [{ symbol: b.symbol, date: "2026-05-05 12:00:00", outstandingShares: 104_000_000, source: b.edgar.tenQNotes.value.data.documentUrl }], raw: [] } } };
    const scope = runStageB(b).valuation.multiples!.enterpriseValue.equityScope!;
    expect(scope.economicShares).toBe(125_000_000);
    expect(scope.basis).toMatch(/104000000.*2026-05-05/);
    expect(scope.basis).toMatch(/100000000.*2026-03-31/);
    const control = fixture();
    control.sharesFloat = structuredClone(b.sharesFloat);
    if (control.sharesFloat.ok) control.sharesFloat.value.data.rows[0]!.source = "https://example.com/different";
    expect(runStageB(control).valuation.multiples!.enterpriseValue.equityScope!.basis).not.toContain("Provider quoted-class count");
  });

  it("F6 discloses treasury shares and their share of un-netted units (review P4)", () => {
    const b = fixture();
    if (!b.edgar.tenQNotes?.ok) throw new Error("fixture");
    b.edgar.tenQNotes.value.data.statementsText = b.edgar.tenQNotes.value.data.statementsText!.replace("Total stockholders' equity", "Treasury stock, at cost (5,000,000 shares) (500) Total stockholders' equity");
    const scope = runStageB(b).valuation.multiples!.enterpriseValue.equityScope!;
    expect(scope.economicShares).toBe(125_000_000);
    expect(scope.basis).toMatch(/treasury.*5000000.*4\.00%.*not netted/i);
  });

  it("F6 reads treasury shares from a dated equity rollforward, without mistaking cost for shares", () => {
    const b = fixture();
    if (!b.edgar.tenQNotes?.ok) throw new Error("fixture");
    b.edgar.tenQNotes.value.data.statementsText += " CONSOLIDATED STATEMENTS OF STOCKHOLDERS' EQUITY (in thousands, except share and per share data) Class A Common Stock Class B Common Stock Alternate Common Stock Treasury Stock Shares Amount Shares Amount Shares Amount Shares Amount Balance at March 31, 2026 100,000,000 $ 10 20,000,000 $ 2 5,000,000 $ 1 882,013 $ (27,775) Total equity 100";
    expect(runStageB(b).valuation.multiples!.enterpriseValue.equityScope!.basis).toMatch(/treasury.*882013.*0\.71%.*not netted/i);
  });

  it("F7 describes an equivalent class without claiming it is unquoted", () => {
    expect(runStageB(fixture()).valuation.multiples!.enterpriseValue.equityScope!.basis).toContain("same-price approximation for equivalent classes without an admitted quote (a separately traded class's own price was not used)");
  });

  it.each(["common share", "shares"])("F8 blocks contrary Class B %s economics (review P1)", label => {
    const b = fixture("", rights + ` Each Class B ${label} possesses dividend and distribution rights equal to one-fifteen-hundredth of such rights of a Class A common share.`);
    expect(runStageB(b).valuation.multiples!.enterpriseValue.equityScope!.status).toBe("unresolved");
  });

  it.each([
    ["missing economic relation", (b: ReturnType<typeof fixture>) => { if (b.edgar.tenQNotes?.ok) b.edgar.tenQNotes.value.data.text = "Class A and Class B common stock have different voting rights."; }],
    ["a relation omitting the named third class", (b: ReturnType<typeof fixture>) => { if (b.edgar.tenQNotes?.ok) b.edgar.tenQNotes.value.data.text = rights.replace("Alternate common stock, and ", "and "); }],
    ["a conflicting economic entitlement", (b: ReturnType<typeof fixture>) => { if (b.edgar.tenQNotes?.ok) b.edgar.tenQNotes.value.data.text += " Alternate common stock has preferential dividend rights over Class A common stock."; }],
    ["issued counts without outstanding counts", (b: ReturnType<typeof fixture>) => { if (b.edgar.tenQNotes?.ok) b.edgar.tenQNotes.value.data.statementsText = b.edgar.tenQNotes.value.data.statementsText!.replaceAll("issued and outstanding", "issued"); }],
    ["different class count dates", (b: ReturnType<typeof fixture>) => { if (b.edgar.tenQNotes?.ok) b.edgar.tenQNotes.value.data.statementsText = b.edgar.tenQNotes.value.data.statementsText!.replace("20,000,000 shares issued and outstanding at March 31, 2026", "20,000,000 shares issued and outstanding at February 28, 2026"); }],
    ["quote issuer mismatch", (b: ReturnType<typeof fixture>) => { if (b.profile.ok) b.profile.value.data.rows[0]!.cik = "0000000099"; }],
    ["unbound quoted class", (b: ReturnType<typeof fixture>) => { if (b.profile.ok) b.profile.value.data.rows[0]!.companyName = "Example Common Stock"; }],
    ["non-SEC primary source", (b: ReturnType<typeof fixture>) => { if (b.edgar.tenQNotes?.ok) b.edgar.tenQNotes.value.data.documentUrl = "https://example.com/quarter.htm"; }],
    ["scaled share counts", (b: ReturnType<typeof fixture>) => { if (b.edgar.tenQNotes?.ok) b.edgar.tenQNotes.value.data.statementsText = b.edgar.tenQNotes.value.data.statementsText!.replace("except share and per share data", "except per share data"); }],
    ["a newer unresolved inventory", (b: ReturnType<typeof fixture>) => { b.edgar.economicShareInventory = [{ classes: [], evidence: null, passages: { inventory: "", rights: null }, reason: "unknown", source: { form: "10-Q", accession: "later", filingDate: "2026-06-01", documentUrl: "https://www.sec.gov/newer.htm", hash: "hash" } }]; }],
    ["newer cover observations within the same primary filing", (b: ReturnType<typeof fixture>) => { b.edgar.economicShareInventory = [{ classes: [], evidence: null,
      observations: [{ classId: "custom:UnresolvedCommonMember", shares: 130_000_000, asOf: "2026-04-30", contextId: "cover", sourceId: "cover-count" }],
      passages: { inventory: "", rights: null }, reason: "unknown", source: { form: "10-Q", accession: "0000000042-26-000001", filingDate: "2026-05-06", documentUrl: "https://www.sec.gov/Archives/edgar/data/42/000000004226000001/quarter.htm", hash: "hash" } }]; }],
  ])("refuses %s", (_name, change) => {
    const b = fixture(); change(b);
    expect(runStageB(b).valuation.multiples!.enterpriseValue.equityScope!.status).toBe("unresolved");
  });

  it("leaves ordinary single-class vendor scope unchanged", () => {
    expect(runStageB(completeCurrencyBundle({})).valuation.multiples!.enterpriseValue.equityScope!.status).toBe("unverified-vendor-scope");
  });

  it("keeps bank routing and the bank valuation map", () => {
    const b = fixture();
    if (b.profile.ok) Object.assign(b.profile.value.data.rows[0]!, { industry: "Banks - Regional", sector: "Financial Services" });
    b.edgar.sic = "6022";
    const c = runStageB(b);
    expect(c.route.base).toBe("bank");
    expect(c.valuation.kind).toBe("excess-return");
    expect(c.valuation.multiples!.enterpriseValue.equityScope!.economicShares).toBe(125_000_000);
  });
});

function coverFixture() {
  const b = fixture();
  if (!b.edgar.tenQNotes?.ok) throw new Error("fixture");
  const d = b.edgar.tenQNotes.value.data;
  b.edgar.economicShareInventory = [{ source: { form: d.form, accession: d.accession, filingDate: d.filingDate, documentUrl: d.documentUrl, hash: "retained-inline-hash" },
    classes: [], evidence: null, reason: "No eligible complete inline cover-share inventory", passages: { inventory: "", rights: null },
    observations: [
      { classId: "us-gaap:CommonClassAMember", shares: 101_000_000, asOf: "2026-04-30", contextId: "a", sourceId: d.documentUrl + "#a" },
      { classId: "us-gaap:CommonClassBMember", shares: 21_000_000, asOf: "2026-04-30", contextId: "b", sourceId: d.documentUrl + "#b" },
      { classId: "issuer:AlternateCommonStockMember", shares: 6_000_000, asOf: "2026-04-30", contextId: "c", sourceId: d.documentUrl + "#c" },
    ] }];
  return b;
}

describe("L1 retained cover counts with same-filing class rights", () => {
  it("admits the one-to-one cover class set at its own date, with provider quote binding", () => {
    const b = coverFixture(), before = JSON.stringify(b);
    const scope = runStageB(b).valuation.multiples!.enterpriseValue.equityScope!;
    expect(scope).toMatchObject({ status: "resolved", economicShares: 128_000_000, marketCap: 12_800_000_000, shareCountAsOf: "2026-04-30", approximate: true });
    expect(scope.basis).toContain("cover");
    expect(scope.basis).toContain("Quote class bound by provider title");
    expect(scope.basis).toContain("same-price approximation");
    expect(scope.sourceIds).toContain(b.edgar.economicShareInventory![0]!.observations![2]!.sourceId);
    expect(JSON.stringify(b)).toBe(before);
  });
  it.each(["missing", "mismatch", "duplicate", "mixed-date", "future-date", "contrary", "other-filing"])("refuses %s cover evidence", mode => {
    const b = coverFixture(), row = b.edgar.economicShareInventory![0]!;
    if (mode === "missing") row.observations!.pop();
    if (mode === "mismatch") row.observations![2]!.classId = "issuer:OtherCommonStockMember";
    if (mode === "duplicate") row.observations!.push({ ...row.observations![0]! });
    if (mode === "mixed-date") row.observations![2]!.asOf = "2026-04-29";
    if (mode === "future-date") row.observations![2]!.asOf = "2026-08-01";
    if (mode === "contrary" && b.edgar.tenQNotes?.ok) b.edgar.tenQNotes.value.data.text += " Alternate common stock has preferential dividend rights.";
    if (mode === "other-filing") row.source.accession = "0000000042-26-000002";
    expect(runStageB(b).valuation.multiples!.enterpriseValue.equityScope!.status).toBe("unresolved");
  });
});
