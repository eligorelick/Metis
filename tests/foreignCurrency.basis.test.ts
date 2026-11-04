import { describe, expect, it } from "vitest";
import { quotedDilutedCount, resolveForeignValuation } from "@/pipeline/foreignCurrency";
import { resolveSecurityBasis } from "@/pipeline/stageB/securityBasis";
import { foreignBundle } from "./helpers/foreignBundle";
import { withFilerShareUnits } from "@/pipeline/shareUnits";
import { discoverStockSplits } from "@/edgar/splits";

describe("foreign valuation security evidence", () => {
  it("admits a proved one-for-one ordinary listing with the same independent count checks", () => {
    const b = foreignBundle("EUR", 1);
    if (!b.profile.ok) throw Error("fixture");
    b.profile.value.data.rows[0]!.isAdr = false;
    const result = resolveForeignValuation(b, "EUR");
    expect(result.basis?.ratio).toBe(1);
    expect(result.basis?.securityEvidence.every(e => e.quoteUnit === "ordinary")).toBe(true);
    expect(result.basis?.note).toMatch(/one-for-one ordinary listing/);
    expect(result.basis?.note).not.toMatch(/per ADS|1 ADS/);
  });
  it("refuses a non-ADR listing whose two count constructions imply a receipt ratio", () => {
    const b = foreignBundle("EUR", 5);
    if (!b.profile.ok) throw Error("fixture");
    b.profile.value.data.rows[0]!.isAdr = false;
    expect(resolveForeignValuation(b, "EUR").basis).toBeNull();
  });
  it("reconciles native-currency EPS without requiring an FX rate", () => {
    const b = foreignBundle();
    delete b.valuationFx;
    if (!b.edgar.companyFacts.ok || !b.statements.incomeAnnual.ok) throw Error("fixture");
    const facts = b.edgar.companyFacts.value.data;
    const p = { start: "2025-01-01", end: "2025-12-31", filed: "2026-02-01", form: "20-F", accn: "0000000042-26-000001", fy: 2025, fp: "FY" };
    Object.assign(facts.facts["ifrs-full"]!, { Revenue: { units: { TWD: [{ ...p, val: 1000e6 }] } },
      DilutedEarningsLossPerShare: { units: { "TWD/shares": [{ ...p, val: 65.47 }] } } });
    b.edgar.shareBasis = { basisDay: b.builtAt.slice(0, 10), splits: discoverStockSplits(facts, { asOf: b.builtAt.slice(0, 10),
      vendor: { status: "retrieved", source: "fixture", events: [], coverage: [{ from: "2020-01-01", to: b.builtAt.slice(0, 10) }] } }) };
    Object.assign(b.statements.incomeAnnual.value.data.rows[0]!, { cik: "42", epsDiluted: 331.25 });
    const out = withFilerShareUnits(b).statements.incomeAnnual;
    expect(out.ok && out.value.data.rows[0]?.epsDiluted).toBeCloseTo(327.35, 8);
  });
  function issuedCover() {
    const b = foreignBundle("EUR", 1);
    if (!b.edgar.companyFacts.ok) throw Error("fixture");
    const f = b.edgar.companyFacts.value.data.facts;
    const cover = (f.dei!.EntityCommonStockSharesOutstanding as { units: { shares: { val: number }[] } }).units.shares[0]!;
    cover.val = 105e6;
    f["ifrs-full"]!.NumberOfSharesIssued = { units: { shares: [{ ...cover }] } };
    return b;
  }
  it("D-188: resolves an issued-share cover only with same-filing issued proof and an independent standard weighted ratio", () => {
    const result = resolveForeignValuation(issuedCover(), "EUR");
    expect(result.basis?.ratio).toBe(1);
    expect(result.basis?.note).toMatch(/cover.*issued.*0.1%.*weighted/i);
  });
  it.each(["issued-disagrees", "mixed-filing", "weighted-disagrees", "weighted-absent"])("D-188: refuses issued-cover fallback with %s", mode => {
    const b = issuedCover();
    if (!b.edgar.companyFacts.ok) throw Error("fixture");
    const f = b.edgar.companyFacts.value.data.facts["ifrs-full"]!;
    const issued = (f.NumberOfSharesIssued as { units: { shares: { val: number; accn: string }[] } }).units.shares[0]!;
    if (mode === "issued-disagrees") issued.val *= 1.01;
    if (mode === "mixed-filing") issued.accn = "0000000042-26-000002";
    if (mode === "weighted-disagrees") (f.WeightedAverageShares as { units: { shares: { val: number }[] } }).units.shares[0]!.val *= 1.04;
    if (mode === "weighted-absent") delete f.WeightedAverageShares;
    expect(resolveForeignValuation(b, "EUR").basis).toBeNull();
  });
  it("admits IFRS NumberOfSharesOutstanding when the DEI cover concept is absent", () => {
    // Frozen NVO FY2025 SEC amounts: 4.444bn outstanding and 4.443bn
    // weighted shares. Both corroborate one ordinary per quoted ADS.
    const b = foreignBundle("DKK", 1);
    if (!b.edgar.companyFacts.ok || !b.quote.ok || !b.sharesFloat.ok || !b.statements.incomeAnnual.ok || !b.valuationFx?.ok) throw Error("fixture");
    const f = b.edgar.companyFacts.value.data.facts;
    const cover = (f.dei!.EntityCommonStockSharesOutstanding as { units: { shares: object[] } }).units.shares[0]!;
    delete f.dei;
    f["ifrs-full"] = {
      NumberOfSharesOutstanding: { units: { shares: [{ ...cover, val: 4_444_000_000 }] } },
      WeightedAverageShares: { units: { shares: [{ ...cover, start: "2025-01-01", val: 4_443_000_000 }] } },
    };
    b.sharesFloat.value.data.rows[0]!.outstandingShares = 4_420_890_725;
    b.quote.value.data.rows[0]!.marketCap = 4_420_890_725 * b.quote.value.data.rows[0]!.price!;
    b.statements.incomeAnnual.value.data.rows[0]!.weightedAverageShsOut = 4_447_851_000;
    b.valuationFx.value.endpoint = "fredgraph.csv?id=DEXDNUS";
    b.valuationFx.value.data[0]!.value = 6.6946;
    expect(resolveForeignValuation(b, "DKK").basis?.ratio).toBe(1);
  });
  it("establishes 5 ordinary shares per ADS from two agreeing count constructions and the cap identity", () => {
    const b = foreignBundle();
    const result = resolveForeignValuation(b, "TWD");
    expect(result.basis?.ratio).toBe(5);
    expect(result.basis?.securityEvidence).toHaveLength(2);
    expect(resolveSecurityBasis(result.basis?.securityEvidence ?? [], "2026-07-02")?.ordinarySharesPerQuotedUnit).toBe(5);
    expect(result.basis?.note).toMatch(/one spot rate/);
  });
  it("admits a verified one-for-one receipt without changing its share count", () => {
    expect(resolveForeignValuation(foreignBundle("EUR", 1), "EUR").basis?.ratio).toBe(1);
  });
  it("distinguishes ordinary and already quoted diluted counts, withholding ambiguous units", () => {
    const basis = resolveForeignValuation(foreignBundle(), "TWD").basis!;
    expect(quotedDilutedCount(100e6, basis)).toBe(100e6);
    expect(quotedDilutedCount(500e6, basis)).toBe(100e6);
    expect(quotedDilutedCount(300e6, basis)).toBeNull();
    expect(quotedDilutedCount(null, basis)).toBeNull();
  });
  it.each(["disputed", "absent", "capitalization", "identity", "future", "stale"])("withholds %s evidence", mode => {
    const b = foreignBundle();
    if (!b.edgar.companyFacts.ok || !b.quote.ok) throw new Error("fixture");
    const facts = b.edgar.companyFacts.value.data;
    if (mode === "disputed") facts.facts["ifrs-full"] = { WeightedAverageShares: { units: { shares: [{ start: "2025-01-01", end: "2025-12-31", val: 800e6, filed: "2026-02-01", form: "20-F", accn: "0000000042-26-000001" }] } } };
    if (mode === "absent") delete facts.facts.dei;
    if (mode === "capitalization") b.quote.value.data.rows[0]!.marketCap = 5e9;
    if (mode === "identity") facts.cik = 999;
    if (mode === "future") b.builtAt = "2026-01-01T00:00:00Z";
    if (mode === "stale" && b.valuationFx?.ok) b.valuationFx.value.data[0]!.date = "2026-06-01";
    expect(resolveForeignValuation(b, "TWD").basis).toBeNull();
  });
  it("admits a share count re-stamped after the quote day but before the analysis cutoff", () => {
    // TSM live on 2026-11-02: the provider's row read 2026-11-03 04:22 with the same count as market cap / price.
    const b = foreignBundle();
    if (!b.sharesFloat?.ok) throw new Error("fixture");
    b.sharesFloat.value.data.rows[0]!.date = "2026-07-03 04:22:50";
    expect(resolveForeignValuation(b, "TWD").basis?.ratio).toBe(5);
  });
  it.each([["after the analysis cutoff", "2026-07-07", "2026-07-06T12:00:00Z"], ["more than 7 days from the quote", "2026-07-10", "2026-07-12T00:00:00Z"]])(
    "withholds a share count dated %s", (_label, floatDate, builtAt) => {
      const b = foreignBundle();
      if (!b.sharesFloat?.ok) throw new Error("fixture");
      b.sharesFloat.value.data.rows[0]!.date = floatDate;
      b.builtAt = builtAt;
      expect(resolveForeignValuation(b, "TWD").reason).toMatch(/dated quoted shares/);
    });
  it("has no effect on same-currency bundles even with stray FX data", () => {
    expect(resolveForeignValuation(foreignBundle(), "USD")).toEqual({ basis: null, reason: null });
  });
});
