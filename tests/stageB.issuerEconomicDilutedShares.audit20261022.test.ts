/**
 * Audit 2026-10-22 B-37: `dilutedShareSecurityBasis` had no producer, so every
 * issuer with more than one common class had its per-share intrinsic value
 * withheld even when the filed weighted counts already span every class
 * (EXPE, META). The producer admits the filed diluted count as
 * issuer-economic only when the basic weighted count from the same income
 * row matches the resolved all-class economic share total on one class's
 * unit basis; otherwise the value stays withheld with the specific reason.
 */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import { issuerEconomicDilutedShares, type EconomicEquityScope, type EconomicShareEvidence } from "@/pipeline/stageB/securityBasis";
import { currencyBundle, M } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

function multiClassBundle(basic: number | null) {
  const bundle = currencyBundle({ sic: "3571" });
  bundle.edgar.registrant = { name: "Generic", cik10: "0000000042", sic: "3571", sicDescription: null, exchanges: [], tickers: [bundle.symbol], fiscalYearEnd: "1231", stateOfIncorporation: null, forms: ["10-K"] };
  if (!bundle.quote.ok) throw new Error("fixture quote unavailable");
  bundle.quote.value.asOf = "2026-07-06";
  bundle.quote.value.data.rows[0].timestamp = Date.parse("2026-07-06T20:00:00Z") / 1000;
  for (const result of [bundle.statements.incomeAnnual, bundle.statements.incomeQuarterly]) {
    if (result.ok) for (const row of result.value.data.rows) row.weightedAverageShsOut = basic ?? undefined;
  }
  bundle.economicShareEvidence = [{ issuerId: "0000000042", securityId: bundle.symbol, asOf: "2026-03-31", filed: "2026-05-06", effectiveFrom: "2026-03-31", effectiveTo: null,
    complete: true, sourceHash: "retained-capital-source", sourceIds: ["filed:capital"], classes: [
      { classId: bundle.symbol, shares: 80 * M, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "quoted-market-price" },
      { classId: "B", shares: 20 * M, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "economic-equivalence-proxy" },
    ] }];
  return bundle;
}

describe("issuer-economic diluted shares (audit 2026-10-22 B-37)", () => {
  it("publishes a per-share value when the basic weighted count spans every class", () => {
    const result = runStageB(multiClassBundle(99.5 * M));
    if (result.valuation.kind !== "dcf") throw new Error("fixture route");
    expect(result.valuation.multiples?.enterpriseValue.equityScope?.status).toBe("resolved");
    expect(result.valuation.dcf?.perShare ?? null).not.toBeNull();
    const gaps = result.valuation.gaps.filter(gap => gap.field === "valuation.perShare.economicClassBasis");
    expect(gaps.map(gap => gap.severity)).toEqual(["info"]);
    expect(gaps[0].reason).toContain("issuer-economic");
    expect(gaps[0].reason).toContain("2026-03-31");
  });

  it("withholds, naming the shortfall, when the basic count covers one class only", () => {
    const result = runStageB(multiClassBundle(80 * M));
    if (result.valuation.kind !== "dcf") throw new Error("fixture route");
    expect(result.valuation.dcf?.perShare ?? null).toBeNull();
    const gap = result.valuation.gaps.find(g => g.field === "valuation.perShare.economicClassBasis");
    expect(gap?.severity).toBe("warn");
    expect(gap?.reason).toContain("does not match the all-class economic share total");
  });

  it("withholds when no basic weighted count is filed", () => {
    const result = runStageB(multiClassBundle(null));
    if (result.valuation.kind !== "dcf") throw new Error("fixture route");
    expect(result.valuation.dcf?.perShare ?? null).toBeNull();
    expect(result.valuation.gaps.find(g => g.field === "valuation.perShare.economicClassBasis")?.reason).toContain("no basic weighted-average count");
  });
});

describe("issuerEconomicDilutedShares", () => {
  const scope = (economicShares: number, shareCountAsOf = "2026-06-30"): EconomicEquityScope => ({
    status: "resolved", marketCap: economicShares * 100, economicShares, approximate: true, basis: "", sourceIds: ["filed:capital"],
    sourceHashes: ["hash"], shareCountAsOf, priceAsOf: "2026-07-10",
  });
  const evidence = (classes: EconomicShareEvidence["classes"]): EconomicShareEvidence[] => [{
    issuerId: "i", securityId: "B", asOf: "2026-06-30", filed: "2026-07-30", effectiveFrom: "2026-06-30", effectiveTo: null,
    complete: true, sourceHash: "hash", sourceIds: ["filed:capital"], classes,
  }];
  // A Class A share carries 1,500 units of the quoted Class B share.
  const weighted = evidence([
    { classId: "A", shares: 1 * M, countBasis: "outstanding", economicUnitsPerQuotedShare: 1500, priceBasis: "economic-equivalence-proxy" },
    { classId: "B", shares: 1500 * M, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "quoted-market-price" },
  ]);

  it("converts a count filed in Class A equivalents to quoted-share units", () => {
    const result = issuerEconomicDilutedShares(scope(3000 * M), weighted, { basic: 2 * M, diluted: 2.01 * M, periodEnd: "2026-06-30" });
    expect(result?.shares).toBeCloseTo(3015 * M, 0);
    expect(result?.shares === null ? "" : result?.basis).toContain("1500");
  });

  it("accepts the same count filed in quoted-share units", () => {
    const result = issuerEconomicDilutedShares(scope(3000 * M), weighted, { basic: 2990 * M, diluted: 3010 * M, periodEnd: "2026-06-30" });
    expect(result?.shares).toBe(3010 * M);
  });

  it("refuses a count dated far from the class inventory", () => {
    const result = issuerEconomicDilutedShares(scope(3000 * M), weighted, { basic: 2 * M, diluted: 2.01 * M, periodEnd: "2025-12-31" });
    expect(result?.shares).toBeNull();
    expect(result?.shares === null ? result.reason : "").toContain("2025-12-31");
  });

  it("does not apply to an unresolved scope or a single-class inventory", () => {
    const single = evidence([{ classId: "B", shares: 100 * M, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "quoted-market-price" }]);
    expect(issuerEconomicDilutedShares(scope(100 * M), single, { basic: 100 * M, diluted: 101 * M, periodEnd: "2026-06-30" })).toBeNull();
    expect(issuerEconomicDilutedShares({ ...scope(3000 * M), status: "unresolved" }, weighted, { basic: 2 * M, diluted: 2.01 * M, periodEnd: "2026-06-30" })).toBeNull();
  });
});

describe("B-37 wording when the count was not filed (FIN-404 carried minor)", () => {
  const scope: EconomicEquityScope = {
    status: "resolved", marketCap: 3000 * M * 100, economicShares: 3000 * M, approximate: true, basis: "", sourceIds: ["filed:capital"],
    sourceHashes: ["hash"], shareCountAsOf: "2026-06-30", priceAsOf: "2026-07-10",
  };
  const evidence: EconomicShareEvidence[] = [{
    issuerId: "i", securityId: "B", asOf: "2026-06-30", filed: "2026-07-30", effectiveFrom: "2026-06-30", effectiveTo: null,
    complete: true, sourceHash: "hash", sourceIds: ["filed:capital"], classes: [
      { classId: "A", shares: 1 * M, countBasis: "outstanding", economicUnitsPerQuotedShare: 1500, priceBasis: "economic-equivalence-proxy" },
      { classId: "B", shares: 1500 * M, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "quoted-market-price" },
    ],
  }];
  const counts = { basic: 2990 * M, diluted: 3010 * M, periodEnd: "2026-06-30" };
  const text = (r: ReturnType<typeof issuerEconomicDilutedShares>): string => (r && r.shares !== null ? r.basis : "");

  it("a substituted or loss-period count is called the diluted count, not the filed one", () => {
    const filed = text(issuerEconomicDilutedShares(scope, evidence, counts));
    const substituted = text(issuerEconomicDilutedShares(scope, evidence, counts, { countNotFiled: true }));
    expect(filed).toContain("so the filed diluted count 3,010,000,000 spans every class");
    expect(substituted).toContain("so the diluted count 3,010,000,000 spans every class");
    expect(substituted).not.toContain("filed diluted count");
  });

  it("control: every other filer's text is byte for byte unchanged", () => {
    expect(text(issuerEconomicDilutedShares(scope, evidence, counts))).toBe(
      "Diluted shares on the issuer-economic basis: the basic weighted-average count 2,990,000,000 for the period ending 2026-06-30 " +
      "matches the all-class economic share total of 3,000,000,000 quoted-share units at 2026-06-30 within 3.0%, so the filed diluted count " +
      "3,010,000,000 spans every class (audit 2026-10-22 B-37).");
    expect(text(issuerEconomicDilutedShares(scope, evidence, counts, { countNotFiled: false }))).toBe(text(issuerEconomicDilutedShares(scope, evidence, counts)));
  });

  it("the refusal text drops 'filed' only when the count was not filed", () => {
    const bad = { basic: 2990 * M, diluted: 3010 * M, periodEnd: "2025-12-31" };
    const reason = (o?: { countNotFiled?: boolean }) => { const r = issuerEconomicDilutedShares(scope, evidence, bad, o); return r && r.shares === null ? r.reason : ""; };
    expect(reason()).toMatch(/^The filed diluted count is not established on the all-class economic basis: /);
    expect(reason({ countNotFiled: true })).toMatch(/^The diluted count is not established on the all-class economic basis: /);
  });

  it("runStageB: a loss quarter's substituted count is not called filed", () => {
    const b = multiClassBundle(99.5 * M);
    const q = (b.statements.incomeQuarterly as unknown as { value: { data: { rows: Record<string, unknown>[] } } }).value.data.rows[0]!;
    q.netIncome = -40 * M;
    q.epsDiluted = -0.4;
    q.weightedAverageShsOutDil = 99.5 * M;
    const out = runStageB(b);
    if (out.valuation.kind !== "dcf") throw new Error("fixture route");
    const reason = out.valuation.gaps.find(g => g.field === "valuation.perShare.economicClassBasis")?.reason ?? "";
    expect(reason).toContain("spans every class");
    expect(reason).not.toContain("filed diluted count");
  });

  it("runStageB: the not-restored case divides by the filed count and keeps 'filed'", () => {
    const b = multiClassBundle(99.5 * M);
    const q = (b.statements.incomeQuarterly as unknown as { value: { data: { rows: Record<string, unknown>[] } } }).value.data.rows[0]!;
    q.netIncome = -40 * M;
    q.epsDiluted = -0.4;
    q.weightedAverageShsOutDil = 99.5 * M;
    // A convertible is filed but no conversion increment: nothing is restored (loss-period-withheld).
    const pt = { end: "2025-12-31", val: 500 * M, accn: "0000000000-26-000001", fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-13" };
    withIssuerFacts(b, { cik: 1, entityName: "T", facts: { "us-gaap": { ConvertibleNotesPayable: { units: { USD: [pt] } } } } } as never);
    const out = runStageB(b);
    if (out.valuation.kind !== "dcf") throw new Error("fixture route");
    expect(out.valuation.gaps.find(g => g.field === "valuation.perShare.lossPeriodDivisor")?.reason).toMatch(/Award dilution not restored/);
    const reason = out.valuation.gaps.find(g => g.field === "valuation.perShare.economicClassBasis")?.reason ?? "";
    expect(reason).toContain("so the filed diluted count 99,500,000 spans every class");
  });

  it("runStageB control: a profitable quarter keeps the filed wording", () => {
    const out = runStageB(multiClassBundle(99.5 * M));
    if (out.valuation.kind !== "dcf") throw new Error("fixture route");
    expect(out.valuation.gaps.find(g => g.field === "valuation.perShare.economicClassBasis")?.reason).toContain("the filed diluted count");
  });
});
