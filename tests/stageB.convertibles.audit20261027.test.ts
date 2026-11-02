import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { excessReturnModel } from "@/pipeline/stageB/valuation";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

export function convertibleBundle(kind: "notes" | "preferred", claim = 50 * M, count = 10 * M, price: number | null = claim / count) {
  const b = completeCurrencyBundle({ debt: 300 });
  const instant = (val: number) => ({ end: "2026-03-31", val, accn: "test", form: "10-Q", filed: "2026-04-30" });
  const tags: Record<string, unknown> = {
    [kind === "notes" ? "ConvertibleNotesPayable" : "ConvertiblePreferredStockNonredeemableOrRedeemableIssuerOptionValue"]: { units: { USD: [instant(claim), { ...instant(claim), end: "2025-12-31" }] } },
    [kind === "notes" ? "IncrementalCommonSharesAttributableToConversionOfDebtSecurities" : "IncrementalCommonSharesAttributableToConversionOfPreferredStock"]: {
      units: { shares: [{ ...instant(count), start: "2026-01-01" }] },
    },
  };
  if (price !== null) tags.DebtInstrumentConvertibleConversionPrice1 = { units: { "USD/shares": [instant(price), { ...instant(price), end: "2025-12-31" }] } };
  withIssuerFacts(b, { cik: 42, entityName: "Generic", facts: { "us-gaap": tags } });
  return b;
}

describe("FIN-302 / FIN-302-V1: one convertible reading", () => {
  it.each(["notes", "preferred"] as const)("DCF counts %s as a claim or shares, and grids inherit it", kind => {
    const b = convertibleBundle(kind);
    const control = runStageB(completeCurrencyBundle({ debt: 300 })).valuation;
    const v = runStageB(b).valuation;
    if (v.kind !== "dcf" || control.kind !== "dcf" || !v.dcf || !control.dcf) throw new Error("fixture DCF");
    const e = control.dcf.equityValue! - (kind === "preferred" ? 50 * M : 0);
    const d = control.dcf.bridge.dilutedShares!;
    expect(v.dcf.perShare).toBeCloseTo(Math.min(e / (d - 10 * M), (e + 50 * M) / d), 9);
    expect(v.dcf.bridge.convertibles).toHaveLength(1);
    const grid = v.sensitivity!;
    expect(grid.perShare[2][2]).toBeCloseTo(v.dcf.perShare!, 9);
  });
  it.each([null, 2.5])("unknown or cash-principal settlement keeps both claim and shares (%s)", price => {
    const v = runStageB(convertibleBundle("notes", 50 * M, 10 * M, price)).valuation;
    const control = runStageB(completeCurrencyBundle({ debt: 300 })).valuation;
    if (v.kind !== "dcf" || control.kind !== "dcf") throw new Error("fixture route");
    expect(v.dcf?.perShare).toBe(control.dcf?.perShare);
    expect(v.dcf?.bridge.convertibles?.[0].reading).toBe(price === null ? "unresolved" : "net-share");
    if (price === null) expect(v.gaps.find(g => g.field === "valuation.perShare.convertibleClaim")?.reason).toMatch(/at most/);
  });
  it.each(["bank", "insurer", "reit-mortgage"])("%s common-only value uses the same reading and reverse solve", () => {
    const base = { bookValue: 1000, currentRoePct: 15, costOfEquityPct: 10, payoutRatioPct: 50, dilutedShares: 110, totalDebt: 50 };
    const eq = excessReturnModel(base).equityValue!;
    const v = excessReturnModel({ ...base, convertibles: [{ kind: "notes", conversionShares: 10, claim: 50,
      settlement: "full-shares", conversionPrice: 5, period: { start: "2026-01-01", end: "2026-03-31" }, basis: "filed" }] });
    expect(v.perShare).toBeCloseTo(Math.min(eq / 100, (eq + 50) / 110), 9);
    expect(v.startCoeGrid?.perShare[1][1]).toBeCloseTo(v.perShare!, 9);
    expect(v.convertibles?.[0].reading).toBe("converted");
  });
});
