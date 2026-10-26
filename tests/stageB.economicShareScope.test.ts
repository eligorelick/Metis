import { describe, expect, it } from "vitest";
import { describeScoreEvidence } from "@/pipeline/stageB/scoringEvidence";
import { metricPolicy } from "@/pipeline/stageB/sectorRouting";
import { assembleContextPayload, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import { multiplesFramework, type MultiplesFrameworkInputs } from "@/pipeline/stageB/valuation";
import { commonHolderCapital, type EconomicShareEvidence } from "@/pipeline/stageB/securityBasis";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { retainedCommonClassAmbiguity } from "@/pipeline/stageB/commonClassScope";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportView } from "@/components/report/ReportView";
import { applyMultiples } from "@/pipeline/stageC/passes";
import { ReportSchema, judgeOutputToJsonSchema } from "@/report/schema";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintHtml } from "@/report/export/printHtml";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { loadTask28Fixture } from "./helpers/task28Report";
import { keyDataRows } from "@/report/presentation";

const base = (): MultiplesFrameworkInputs => ({
  quote: { price: 288.95, priceAsOf: "2026-10-14", marketCap: 114_473_000 * 288.95, currency: "USD" }, reportedCurrency: "USD",
  incomeTtm: { date: "2026-06-30", revenue: 10e9, operatingIncome: 2e9, depreciationAndAmortization: 1e9, netIncome: 1e9, epsDiluted: 10 },
  cashFlowTtm: { date: "2026-06-30", operatingCashFlow: 2e9, capitalExpenditure: -1e9 },
  balance: { date: "2026-06-30", totalDebt: 5e9, cashAndShortTermInvestments: 4e9, totalStockholdersEquity: 2e9, minorityInterest: 0.487e9, preferredStock: 0, goodwill: 0, intangibleAssets: 0 },
  securityBasisAsOf: "2026-10-15",
});
const evidence = (): EconomicShareEvidence => ({
  issuerId: "issuer", securityId: "common", asOf: "2026-06-30", filed: "2026-08-06",
  effectiveFrom: "2026-06-30", effectiveTo: null, complete: true,
  sourceIds: ["filing:share-capital", "filing:economic-rights"], sourceHash: "retained-source-hash",
  classes: [
    { classId: "common", shares: 114_473_000, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "quoted-market-price" },
    { classId: "class-b", shares: 5_523_000, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "economic-equivalence-proxy" },
  ],
});

describe("issuer economic-share scope", () => {
  it.each(["resolved", "unresolved", "class-ambiguous", "unverified"])("keeps page-one values on the admitted %s economic scope", (status) => {
    const args = base();
    if (status !== "unverified") args.quote = { ...args.quote, issuerId: "issuer", securityId: "common", marketCapSecurityBasis: "quoted-security" };
    if (status === "resolved") args.economicShareEvidence = [evidence()];
    if (status === "class-ambiguous") args.quote = { ...args.quote, marketCapSecurityBasis: "unresolved", marketCapScopeEvidence: { reason: "Filing enumerates multiple outstanding common classes.", sourceIds: ["filing:cover"] } };
    const report = loadTask28Fixture();
    report.valuation = applyMultiples(report.valuation, { kind: "dcf-suppressed", route: "general", multiples: multiplesFramework("general", args), notes: [], gaps: [] });
    report.marketData = { version: "1", currency: "USD", estimateCurrency: null, estimateCurrencyBasis: null,
      quote: { price: 288.95, marketCap: 114_473_000 * 288.95, yearHigh: null, yearLow: null, volume: null, priceAvg50: null, priceAvg200: null, asOf: "2026-10-15" },
      shares: { outstanding: 114_473_000, float: null, freeFloatPct: 80, asOf: "2026-06-30" }, enterpriseValue: null,
      estimates: [], estimatesAsOf: null, priceTarget: null, gradeCounts: null, shortInterest: null };
    const rows = keyDataRows(ReportSchema.parse(report));
    if (status === "resolved") {
      expect(rows.find(row => row.label === "Issuer-common capitalization")?.value).toBe("$34.67B");
      expect(rows.find(row => row.label === "Economic share units")?.note).toContain("2026-06-30");
      expect(rows.find(row => row.label === "Issuer-common capitalization")?.note).toContain("approximation");
      expect(rows.find(row => row.label === "Issuer-common capitalization")?.note).toContain("main quote as of 2026-10-14");
      expect(rows.find(row => row.label === "Issuer-common capitalization")?.note).not.toContain("2026-10-15");
      expect(rows.find(row => row.label === "Economic share units")?.note).not.toContain("free float");
      expect(rows.find(row => row.label === "Enterprise value (market)")?.value).toBe("$36.16B");
      args.balance = { ...args.balance!, totalStockholdersEquity: 100, totalEquity: 130, minorityInterest: null };
      report.valuation = applyMultiples(report.valuation, { kind: "dcf-suppressed", route: "general", multiples: multiplesFramework("general", args), notes: [], gaps: [] });
      expect(keyDataRows(report).some(row => row.label === "Enterprise value (market)")).toBe(false);
    } else if (status === "class-ambiguous") {
      // Audit 2026-10-22 B-8: an unresolved class scope shows no single-class figure as the issuer's capitalization.
      expect(rows.find(row => row.label === "Issuer-common capitalization")).toMatchObject({ value: "withheld" });
      expect(rows.find(row => row.label === "Issuer-common capitalization")?.note).toContain("class scope unresolved");
      expect(rows.some(row => /market cap/i.test(row.label))).toBe(false);
      expect(reportToMarkdown(ReportSchema.parse(report))).toContain("Market cap (quote; may cover one share class only)");
      expect(rows.find(row => row.label === "Provider shares (scope unverified)")?.note).toContain("2026-06-30");
      expect(rows.some(row => row.label === "Enterprise value (market)")).toBe(false);
    } else {
      // A scope unresolved for another reason (an ADR, a quoted-security vendor basis) names no share class.
      expect(reportToMarkdown(ReportSchema.parse(report))).not.toContain("share class only");
      expect(rows.some(row => row.value === "withheld")).toBe(false);
      expect(rows.find(row => row.label === "Provider market cap (scope unverified)")?.note).toContain("2026-10-15");
      expect(rows.find(row => row.label === "Provider shares (scope unverified)")?.note).toContain("2026-06-30");
      expect(rows.some(row => row.label === "Enterprise value (market)")).toBe(false);
      expect(rows.some(row => row.label === "Market cap")).toBe(false);
    }
    expect(JSON.stringify(judgeOutputToJsonSchema())).not.toContain('"marketValueScope"');
  });

  // Audit 2026-10-22 B-19: a keyless cap is Métis's price × filed count.
  it("labels a market cap Métis computed as derived, never as a provider observation", () => {
    const report = loadTask28Fixture();
    report.valuation = applyMultiples(report.valuation, { kind: "dcf-suppressed", route: "general", multiples: multiplesFramework("general", base()), notes: [], gaps: [] });
    report.marketData = { version: "1", currency: "USD", estimateCurrency: null, estimateCurrencyBasis: null,
      quote: { price: 288.95, marketCap: 114_473_000 * 288.95, yearHigh: null, yearLow: null, volume: null, priceAvg50: null, priceAvg200: null, asOf: "2026-10-15", marketCapOrigin: "computed" },
      shares: null, enterpriseValue: null, estimates: [], estimatesAsOf: null, priceTarget: null, gradeCounts: null, shortInterest: null };
    const rows = keyDataRows(ReportSchema.parse(report));
    expect(rows.find(row => row.label === "Derived market cap (scope unverified)")?.note).toBe("quote price × filed share count, computed by Métis; complete issuer-common coverage unverified; as of 2026-10-15");
    expect(rows.some(row => row.label === "Provider market cap (scope unverified)")).toBe(false);
    expect(reportToMarkdown(report)).not.toContain("raw provider observation");
  });

  it("withholds a known unresolved second common class found in retained filing statements", () => {
    const bundle = completeCurrencyBundle({});
    bundle.edgar.tenQNotes = { ok: true, value: { data: { sectionName: "tenQNotes", text: "Capital stock", statementsText: "Common stock, issued and outstanding: 114,473 shares. Class B common stock, issued and outstanding: 5,523 shares.", method: "header-regex", chars: 13, accession: "filing", form: "10-Q", filingDate: "2026-05-06", reportDate: "2026-03-31", documentUrl: "https://www.sec.gov/filing" }, source: "edgar", endpoint: "filing:notes", asOf: "2026-03-31", fetchedAt: bundle.builtAt } };
    const result = runStageB(bundle);
    expect(result.valuation.multiples!.enterpriseValue.value).toBeNull();
    expect(result.valuation.multiples!.enterpriseValue.equityScope!.sourceIds).toContain("filing:notes");
    expect(result.valuation.multiples!.multiples.find(row => row.key === "peTtm")?.current).not.toBeNull();
    if (result.valuation.kind !== "dcf") throw new Error("Expected DCF route");
    expect(result.valuation.dcf?.perShare ?? null).toBeNull();
    expect(result.valuation.gaps.some(gap => gap.field === "valuation.perShare.economicClassBasis")).toBe(true);
  });

  // Audit 2026-10-22 B-8, left by batch 3a: the AI context states the quote's cap with the same caveat as the report.
  it("caveats the quote section's market cap when a second common class leaves the scope unresolved", () => {
    const plain = completeCurrencyBundle({});
    expect(serializePayloadForPrompt(assembleContextPayload(plain, runStageB(plain), { checks: [], flags: [], gaps: [] }))).not.toContain("may cover one share class only");
    const bundle = completeCurrencyBundle({});
    bundle.edgar.tenQNotes = { ok: true, value: { data: { sectionName: "tenQNotes", text: "Capital stock", statementsText: "Common stock, issued and outstanding: 114,473 shares. Class B common stock, issued and outstanding: 5,523 shares.", method: "header-regex", chars: 13, accession: "filing", form: "10-Q", filingDate: "2026-05-06", reportDate: "2026-03-31", documentUrl: "https://www.sec.gov/filing" }, source: "edgar", endpoint: "filing:notes", asOf: "2026-03-31", fetchedAt: bundle.builtAt } };
    const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
    const note = payload.quote.notes.find(text => text.includes("marketCap"));
    expect(note).toContain("may cover one share class only");
    expect(note).toContain("filing:notes");
    expect(serializePayloadForPrompt(payload)).toContain("may cover one share class only");
  });

  it("keeps prior filed class ambiguity when a newer statement omits the capital description", () => {
    const bundle = completeCurrencyBundle({});
    const section = (filingDate: string, statement: string, sectionName: "tenKNotes" | "tenQNotes") => ({ ok: true as const, value: { data: { sectionName, text: "Notes", statementsText: statement, method: "header-regex" as const, chars: 5, accession: filingDate, form: sectionName === "tenKNotes" ? "10-K" : "10-Q", filingDate, reportDate: "2025-12-31", documentUrl: "https://www.sec.gov/filing" }, source: "edgar" as const, endpoint: `filing:${filingDate}`, asOf: "2025-12-31", fetchedAt: bundle.builtAt } });
    bundle.edgar.tenQNotes = section("2026-05-06", "Assets and liabilities", "tenQNotes");
    bundle.edgar.tenKNotes = section("2026-02-06", "Class A common stock: outstanding. Class B common stock: outstanding.", "tenKNotes");
    expect(retainedCommonClassAmbiguity(bundle)?.sourceIds).toEqual(["filing:2026-02-06"]);
  });

  it("finds explicit outstanding-class evidence beyond the risk-text prefix and preserves its source", () => {
    const bundle = completeCurrencyBundle({});
    const text = "Other risk discussion. ".repeat(3500) + "An investor beneficially owned 100% of the issuer's outstanding Class B common stock, representing approximately 32% of total voting power of all shares of issuer common stock and Class B common stock outstanding.";
    bundle.edgar.item1a = { ok: true, value: { data: { sectionName: "item1A", text, method: "header-regex", chars: text.length, accession: "annual-capital-source", form: "10-K", filingDate: "2026-02-06", reportDate: "2025-12-31", documentUrl: "https://www.sec.gov/filing" }, source: "edgar", endpoint: "filing:annual-risk", asOf: "2025-12-31", fetchedAt: bundle.builtAt } };
    expect(retainedCommonClassAmbiguity(bundle)?.sourceIds).toEqual(["filing:annual-risk"]);
    const result = runStageB(bundle);
    expect(result.valuation.multiples!.enterpriseValue.value).toBeNull();
    if (result.valuation.kind !== "dcf") throw new Error("Expected DCF route");
    expect(result.valuation.dcf?.perShare ?? null).toBeNull();
    bundle.edgar.item1a.value.data.text = "The charter authorizes Class A common stock and Class B common stock. We may issue these classes in a future financing.";
    expect(retainedCommonClassAmbiguity(bundle)).toBeNull();
  });

  it("preserves ordinary issuer coverage without claiming verified all-class scope", () => {
    const result = multiplesFramework("general", base());
    expect(result.enterpriseValue.value).toBeCloseTo(34_563_973_350, 2);
    expect(result.enterpriseValue.equityScope!.status).toBe("unverified-vendor-scope");
    expect(result.enterpriseValue.basis).toContain("all-class economic coverage is not independently established");
  });

  it("uses outstanding economically equivalent classes with an explicit same-price approximation", () => {
    const input = base();
    input.quote = { ...input.quote, issuerId: "issuer", securityId: "common", marketCapSecurityBasis: "quoted-security" };
    input.economicShareEvidence = [evidence()];
    const result = multiplesFramework("general", input);
    expect(result.enterpriseValue.equityScope).toMatchObject({ status: "resolved", economicShares: 119_996_000, marketCap: 34_672_844_200, approximate: true });
    expect(result.enterpriseValue.value).toBeCloseTo(36_159_844_200, 2);
    expect(result.enterpriseValue.basis).toMatch(/same-price approximation/);
    expect(result.enterpriseValue.basis).toMatch(/not a traded quote/);
    expect(result.enterpriseValue.noncontrollingInterestBasis).toBe("book-value-proxy");
    expect(result.enterpriseValue.basis).toMatch(/book-value proxy.*market value/);
    expect(result.enterpriseValue.nonOperatingHoldingsScope).toBe("not-comprehensively-resolved");
    expect(result.multiples.find(row => row.key === "peTtm")?.current).toBeCloseTo(28.895);
  });

  // Audit 2026-10-22 B-8: a class on a stated economic weight (BRK: A = 1,500 B).
  it("values a weighted class at its economic units x the main quote and prices P/E on capitalization", () => {
    const input = base();
    input.quote = { ...input.quote, issuerId: "issuer", securityId: "common", marketCapSecurityBasis: "quoted-security" };
    const weighted = evidence();
    weighted.classes = [weighted.classes[0]!, { classId: "class-a", shares: 1_000, countBasis: "outstanding", economicUnitsPerQuotedShare: 1500, priceBasis: "economic-equivalence-proxy" }];
    input.economicShareEvidence = [weighted];
    input.balance = { ...input.balance!, minorityInterest: 0 };
    const result = multiplesFramework("general", input);
    const marketCap = (114_473_000 + 1_000 * 1500) * 288.95;
    expect(result.enterpriseValue.equityScope).toMatchObject({ status: "resolved", economicShares: 115_973_000, approximate: true });
    expect(result.enterpriseValue.equityScope!.marketCap).toBeCloseTo(marketCap, 2);
    expect(result.enterpriseValue.basis).toMatch(/economic-weight approximation/);
    expect(result.multiples.find(row => row.key === "peTtm")?.current).toBeCloseTo(marketCap / 1e9, 6);
    expect(result.gaps.find(gap => gap.field === "valuation.multiples.peTtm.economicClassBasis")?.reason).toMatch(/economic weight/);
  });

  // Review of B-8: only the evidence in force on the price day decides the P/E basis.
  it("keeps price / EPS when only an ended evidence row carried unequal weights", () => {
    const input = base();
    input.quote = { ...input.quote, issuerId: "issuer", securityId: "common", marketCapSecurityBasis: "quoted-security" };
    const ended = evidence();
    Object.assign(ended, { asOf: "2025-06-30", filed: "2025-08-06", effectiveFrom: "2025-06-30", effectiveTo: "2026-06-30" });
    ended.classes = [ended.classes[0]!, { classId: "class-a", shares: 1_000, countBasis: "outstanding", economicUnitsPerQuotedShare: 1500, priceBasis: "economic-equivalence-proxy" }];
    input.economicShareEvidence = [ended, evidence()];
    const result = multiplesFramework("general", input);
    expect(result.enterpriseValue.equityScope).toMatchObject({ status: "resolved", economicShares: 119_996_000 });
    expect(result.multiples.find(row => row.key === "peTtm")?.current).toBeCloseTo(28.895);
    expect(result.gaps.some(gap => gap.field === "valuation.multiples.peTtm.economicClassBasis")).toBe(false);
  });

  it.each(["issued", "unknown-rights", "incomplete", "future", "wrong-security", "conflicting"])("withholds aggregate valuation for %s class evidence without changing price/EPS", condition => {
    const input = base();
    input.quote = { ...input.quote, issuerId: "issuer", securityId: "common", marketCapSecurityBasis: "quoted-security" };
    const row = evidence();
    if (condition === "issued") row.classes[0].countBasis = "issued";
    if (condition === "unknown-rights") row.classes[1].economicUnitsPerQuotedShare = null;
    if (condition === "incomplete") row.complete = false;
    if (condition === "future") row.filed = "2026-10-16";
    if (condition === "wrong-security") row.securityId = "another-security";
    input.economicShareEvidence = condition === "conflicting" ? [row, { ...row, classes: row.classes.slice(0, 1) }] : [row];
    const result = multiplesFramework("general", input);
    expect(result.enterpriseValue.value).toBeNull();
    expect(result.multiples.find(row => row.key === "priceToBook")?.current).toBeNull();
    expect(result.multiples.find(row => row.key === "peTtm")?.current).toBeCloseTo(28.895);
    expect(result.gaps.some(gap => gap.field === "valuation.multiples.marketCap.securityBasis")).toBe(true);
  });

  it("does not guess an ADR ratio from economic class counts", () => {
    const input = base();
    input.quote = { ...input.quote, isAdr: true, marketCapSecurityBasis: "quoted-security" };
    input.economicShareEvidence = [evidence()];
    const result = multiplesFramework("general", input);
    expect(result.enterpriseValue.value).toBeNull();
    expect(result.multiples.find(row => row.key === "peTtm")?.current).toBeNull();
  });

  it("values independently quoted common classes at their own source-bound prices", () => {
    const args = base();
    args.quote = { price: 10, priceAsOf: "2026-10-14", marketCap: 1000, currency: "USD", issuerId: "issuer", securityId: "common", marketCapSecurityBasis: "quoted-security" };
    const row = evidence();
    row.classes[0].shares = 100;
    row.classes[1] = { ...row.classes[1], shares: 20, priceBasis: "quoted-market-price",
      observedPrice: { value: 12, currency: "USD", asOf: "2026-10-14", sourceIds: ["class-b:quote"], sourceHash: "b-quote-hash" } };
    args.economicShareEvidence = [row];
    expect(multiplesFramework("general", args).enterpriseValue.equityScope).toMatchObject({ marketCap: 1240, approximate: false, sourceIds: expect.arrayContaining(["class-b:quote"]) });
    const report = loadTask28Fixture();
    report.valuation = applyMultiples(report.valuation, { kind: "dcf-suppressed", route: "general", multiples: multiplesFramework("general", args), notes: [], gaps: [] });
    expect(keyDataRows(ReportSchema.parse(report)).find(item => item.label === "Issuer-common capitalization")?.note).toContain("class-b at 2026-10-14");
    row.classes[1].observedPrice = undefined;
    expect(multiplesFramework("general", args).enterpriseValue.value).toBeNull();
    row.classes[1].priceBasis = "economic-equivalence-proxy";
    expect(multiplesFramework("general", args).enterpriseValue.equityScope).toMatchObject({ marketCap: 1200, approximate: true });
  });

  it("identifies signed negative NCI as a book-value proxy while preserving its arithmetic sign", () => {
    const args = base();
    args.balance!.minorityInterest = -0.487e9;
    const result = multiplesFramework("general", args);
    expect(result.enterpriseValue.value).toBeCloseTo(33_589_973_350, 2);
    expect(result.enterpriseValue.noncontrollingInterestBasis).toBe("book-value-proxy");
    expect(result.enterpriseValue.basis).toMatch(/book-value proxy/);
  });

  it.each(["old-other-price", "missing-main-date"])("rejects separately quoted classes on incompatible or unknown valuation sessions: %s", condition => {
    const args = base();
    args.quote = { ...args.quote, issuerId: "issuer", securityId: "common", marketCapSecurityBasis: "quoted-security" };
    const row = evidence();
    row.asOf = "2019-06-30"; row.filed = "2019-08-06"; row.effectiveFrom = "2019-06-30";
    row.classes[1] = { ...row.classes[1], priceBasis: "quoted-market-price", observedPrice: { value: 12, currency: "USD", asOf: condition === "old-other-price" ? "2019-10-14" : "2026-10-14", sourceIds: ["separate:quote"], sourceHash: "quote-hash" } };
    if (condition === "missing-main-date") args.quote.priceAsOf = undefined;
    args.economicShareEvidence = [row];
    expect(multiplesFramework("general", args).enterpriseValue.value).toBeNull();
  });

  it("persists the economic-share and EV basis through all actual report surfaces", () => {
    const args = base();
    args.quote = { ...args.quote, issuerId: "issuer", securityId: "common", marketCapSecurityBasis: "quoted-security" };
    args.economicShareEvidence = [evidence()];
    const multiples = multiplesFramework("general", args);
    const report = loadTask28Fixture();
    report.valuation = applyMultiples(report.valuation, { kind: "dcf-suppressed", route: "general", multiples, notes: [], gaps: [] });
    const stored = ReportSchema.parse(report);
    expect(stored.valuation.multiplesBasis).toContain("119996000 economic shares");
    const surfaces = [renderToStaticMarkup(createElement(ReportView, { report: stored })), reportToMarkdown(stored), reportToPrintHtml(stored, { autoPrint: false }), reportToAuditMarkdown(stored)];
    for (const surface of surfaces) {
      for (const text of ["119996000 economic shares", "2026-06-30", "34672844200 USD", "same-price approximation", "not a traded quote", "book-value proxy", "not comprehensively resolved"]) expect(surface).toContain(text);
    }
    expect(JSON.stringify(judgeOutputToJsonSchema())).not.toContain('"multiplesBasis"');
  });

  it("withholds EV for known outside ownership with an unknown NCI allocation and preserves equity-only ratios", () => {
    const args = base();
    args.balance = { ...args.balance!, totalStockholdersEquity: 100, totalEquity: 130, minorityInterest: null };
    const result = multiplesFramework("general", args);
    expect(result.enterpriseValue.value).toBeNull();
    expect(result.enterpriseValue.noncontrollingInterestBasis).toBe("unknown-allocation");
    expect(result.enterpriseValue.basis).toContain("NCI allocation is unavailable");
    expect(result.gaps.some(gap => gap.field === "valuation.multiples.enterpriseValue.noncontrollingOwnership")).toBe(true);
    expect(result.multiples.find(row => row.key === "peTtm")?.current).toBeCloseTo(28.895);
    expect(result.multiples.find(row => row.key === "priceToBook")?.current).toBeCloseTo(args.quote.marketCap! / 100);
    const bundle = completeCurrencyBundle({});
    for (const member of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) {
      if (member.ok) for (const row of member.value.data.rows) Object.assign(row, { totalStockholdersEquity: 100, totalEquity: 130, minorityInterest: undefined });
    }
    expect(runStageB(bundle).valuation.multiples!.enterpriseValue.value).toBeNull();
  });

  it("withholds the separate REIT EV sketch for unknown NCI allocation without suppressing FFO", () => {
    const bundle = completeCurrencyBundle({ reit: true });
    for (const member of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) {
      if (member.ok) for (const row of member.value.data.rows) Object.assign(row, { totalStockholdersEquity: 100, totalEquity: 130, minorityInterest: undefined });
    }
    const result = runStageB(bundle);
    if (result.valuation.kind !== "reit") throw new Error("Expected REIT route");
    expect(result.valuation.reit.enterpriseValue).toBeNull();
    expect(result.valuation.reit.impliedCapRatePct).toBeNull();
    expect(result.valuation.reit.ffoPerShare).not.toBeNull();
    expect(result.valuation.reit.pToFfo).not.toBeNull();
    expect(result.valuation.gaps.some(gap => gap.field === "valuation.reit.noncontrollingOwnership")).toBe(true);
  });

  it.each(["missing-parent", "consolidated-stand-in"])("withholds EV for an unresolved consolidated equity split: %s", condition => {
    const args = base();
    args.balance = { ...args.balance!, totalStockholdersEquity: condition === "missing-parent" ? null : 130, totalEquity: 130, minorityInterest: null, equityOwnershipBasis: condition === "missing-parent" ? "parent" : "consolidated" };
    expect(multiplesFramework("general", args).enterpriseValue.noncontrollingInterestBasis).toBe("unknown-allocation");
    expect(multiplesFramework("general", args).enterpriseValue.value).toBeNull();
  });

  it("requires an explicit common-income ownership basis beside signed negative NCI", () => {
    expect(commonHolderCapital({ netIncome: 100 }, { totalStockholdersEquity: 100, minorityInterest: -30 }).commonIncome).toBeNull();
  });
});

describe("parent-common P/FCF cash attribution", () => {
  it.each([487e6,-487e6,null])("withholds parent interpretation without attributing consolidated cash flows (NCI %s)", nci => {
    const args = base();
    args.balance!.minorityInterest = nci;
    if (nci === null) args.balance = {...args.balance!, totalStockholdersEquity:100,totalEquity:130};
    args.keyMetricsHistory = Array.from({length:8},(_,i)=>({date:`202${5-Math.floor(i/4)}-${["12-31","09-30","06-30","03-31"][i%4]}`,priceToFreeCashFlowRatio:10+i}));
    const stat = multiplesFramework("general", args).multiples.find(row=>row.key==="priceToFcf");
    expect(stat?.current).toBeNull();
    expect(stat?.ownHistory).toBeNull();
    expect(stat?.peers).toBeNull();
    expect(stat?.ownershipScope).toContain("Parent-common cash-flow attribution unresolved");
    expect(stat?.basis).toContain("consolidated operating cash flow");
  });
  it("preserves ordinary zero-NCI P/FCF arithmetic", () => {
    const args = base();args.balance!.minorityInterest=0;
    expect(multiplesFramework("general",args).multiples.find(row=>row.key==="priceToFcf")?.current).toBeCloseTo(args.quote.marketCap!/1e9);
  });
  it("carries the cash-scope qualifier through scoring, payload and stored report surfaces", () => {
    const bundle=completeCurrencyBundle({});
    for(const member of [bundle.statements.balanceAnnual,bundle.statements.balanceQuarterly]) if(member.ok) for(const row of member.value.data.rows) row.minorityInterest=487e6;
    const c=runStageB(bundle);
    if(c.valuation.kind==="pre-revenue") throw new Error("multiple fixture");
    const stat=c.valuation.multiples.multiples.find(row=>row.key==="priceToFcf")!;
    expect(stat.current).toBeNull();
    const qualifier="Parent-common cash-flow attribution unresolved";
    expect(c.scores.aspects.valuation.note).toContain(qualifier);
    const scoring={route:c.route,policy:metricPolicy(c.route),growth:c.growth,...c.returns,capital:c.capital,forensics:c.forensics,technicals:c.technicals,valuation:c.valuation,financialMetrics:c.financialMetrics,currentPrice:100,asOf:"2026-07-06"};
    expect(describeScoreEvidence(scoring,"valuation","peOwnHistoryRank").fallbackReason).toContain(qualifier);
    const payload=assembleContextPayload(bundle,c,{checks:[],flags:[],gaps:[]});
    expect(serializePayloadForPrompt(payload)).toContain(qualifier);
    const report=loadTask28Fixture();report.valuation=applyMultiples(report.valuation,c.valuation);
    const stored=ReportSchema.parse(report);
    expect(stored.valuation.multiples.find(row=>row.name.startsWith("P/FCF"))?.name).toContain("cash attribution unresolved");
    for(const surface of [renderToStaticMarkup(createElement(ReportView,{report:stored})),reportToMarkdown(stored),reportToPrintHtml(stored,{autoPrint:false}),reportToAuditMarkdown(stored)]) expect(surface).toContain(qualifier);
  });
});

it.each(["preferredStock", "preferredDividendsPaid"] as const)("withholds current P/FCF beside known preferred cash claims (%s)", field => {
  const args=base();args.balance!.minorityInterest=0;args.balance!.preferredStock=0;
  if(field==="preferredStock") args.balance!.preferredStock=10;
  else args.incomeTtm!.preferredDividendsPaid=-10;
  const stat=multiplesFramework("general",args).multiples.find(row=>row.key==="priceToFcf")!;
  expect(stat.current).toBeNull();expect(stat.basis).toContain("preferred claims");
  args.balance!.preferredStock=0;args.incomeTtm!.preferredDividendsPaid=0;
  expect(multiplesFramework("general",args).multiples.find(row=>row.key==="priceToFcf")?.current).toBeCloseTo(args.quote.marketCap!/1e9);
});
