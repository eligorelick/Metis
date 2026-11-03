import { describe, expect, it } from "vitest";
import { quotedDilutedCount, resolveForeignValuation } from "@/pipeline/foreignCurrency";
import { resolveSecurityBasis } from "@/pipeline/stageB/securityBasis";
import { foreignBundle } from "./helpers/foreignBundle";

describe("foreign valuation security evidence", () => {
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
