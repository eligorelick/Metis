import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { excessReturnModel } from "@/pipeline/stageB/valuation";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";
import { buildSyntheticRouteBundle } from "./helpers/researchRoutePanel";
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
  it.each(["bank", "insurer", "reit"] as const)("F7: %s runs notes and folded preferred through its financial route", route => {
    const make = () => {
      const b = buildSyntheticRouteBundle(route);
      if (!b.profile.ok) throw new Error("profile");
      if (route === "reit") b.profile.value.data.rows[0].industry = "REIT - Mortgage";
      withIssuerFacts(b, { cik: 42, entityName: "Test", facts: {} });
      return b;
    };
    const control = runStageB(make()).valuation;
    expect(control.kind).toBe("excess-return");
    const original = control.excessReturn!;
    for (const kind of ["notes", "preferred"] as const) {
      const b = make();
      const c = 50 * M, n = 10 * M;
      for (const result of [b.statements.incomeAnnual, b.statements.incomeQuarterly]) {
        if (!result.ok) throw new Error("income");
        for (const row of result.value.data.rows) row.weightedAverageShsOutDil = Number(row.weightedAverageShsOutDil) + n;
      }
      for (const result of [b.statements.balanceAnnual, b.statements.balanceQuarterly]) {
        if (!result.ok) throw new Error("balance");
        for (const row of result.value.data.rows) {
          // F1: only the convertible tag supplies preferred; do not rely on the permanent-preferred overlap.
          if (kind === "preferred") row.preferredStock = 0;
          else row.totalDebt = Number(row.totalDebt) + c;
        }
      }
      const noInstrument = runStageB(structuredClone(b)).valuation.excessReturn!;
      const instant = { end: "2026-03-31", val: c, form: "10-Q", filed: "2026-04-30", accn: "test" };
      withIssuerFacts(b, { cik: 42, entityName: "Test", facts: { "us-gaap": {
        [kind === "notes" ? "ConvertibleNotesPayable" : "ConvertiblePreferredStockNonredeemableOrRedeemableIssuerOptionValue"]: { units: { USD: [instant] } },
        [`IncrementalCommonSharesAttributableToConversionOf${kind === "notes" ? "DebtSecurities" : "PreferredStock"}`]: { units: { shares: [{ ...instant, start: "2026-01-01", val: n }] } },
        ...(kind === "notes" ? { DebtInstrumentConvertibleConversionPrice1: { units: { "USD/shares": [{ ...instant, val: c / n }] } } } : {}),
      } } });
      const v = runStageB(b).valuation;
      expect(v.kind).toBe(control.kind);
      const er = v.excessReturn!;
      const bv = noInstrument.openingBookValue.value!;
      const d = noInstrument.equityValue! / noInstrument.perShare!;
      const e = noInstrument.equityValue!;
      const claimBook = kind === "preferred" ? bv - c : bv;
      const convertedBook = kind === "preferred" ? bv : bv + c;
      expect(er.perShare).toBeCloseTo(Math.min(e * claimBook / bv / (d - n), e * convertedBook / bv / d), 9);
      expect(er.startCoeGrid?.perShare[1][1]).toBeCloseTo(er.perShare!, 9);
      expect(er.convertibles).toHaveLength(1);
      expect(er.roePathPct.value).toEqual(noInstrument.roePathPct.value);
      expect(original.perShare).toBeGreaterThan(0);
      // F1: the exact retained floor is min(11.8104675494, 11.8790002431).
      if (route === "reit" && kind === "preferred") expect(er.perShare).toBeCloseTo(11.810467549421368, 9);
    }
  });
  it.each([15, 6])("F1: folded preferred values each reading on its own book at ROE %s", roe => {
    const base = { bookValue: 1000, currentRoePct: roe, costOfEquityPct: 10, payoutRatioPct: 50, dilutedShares: 110,
      startAlternative: { roePct: roe - 2, basis: "fiscal-year-common-roe" as const, asOf: "2026-03-31", bookValue: 900 } };
    const pref = { kind: "preferred" as const, conversionShares: 10, claim: 50, settlement: "full-shares" as const,
      conversionPrice: null, period: { start: "2026-01-01", end: "2026-03-31" }, basis: "filed" };
    const full = excessReturnModel(base);
    const less = excessReturnModel({ ...base, bookValue: 950 });
    const expected = Math.min(less.equityValue! / 100, full.equityValue! / 110);
    const v = excessReturnModel({ ...base, convertiblePreferredClaim: 50, convertibles: [pref], price: expected });
    const converted = v.convertibles![0].reading === "converted";
    expect(v.perShare).toBeCloseTo(expected, 9);
    const reference = excessReturnModel({ ...base, bookValue: converted ? 1000 : 950, dilutedShares: converted ? 110 : 100, price: expected,
      startAlternative: { ...base.startAlternative, bookValue: converted ? 900 : 850 } });
    expect(v.startAlternative?.perShare).toBeCloseTo(reference.startAlternative!.perShare!, 9);
    expect(v.startCoeGrid?.perShare).toEqual(reference.startCoeGrid?.perShare);
    expect(v.bookValuePath).toEqual(reference.bookValuePath);
    expect(v.openingBookValue.value).toBe(reference.openingBookValue.value);
    expect(v.financialAssumptions?.initialCommonBook).toBe(reference.financialAssumptions?.initialCommonBook);
    expect(v.reverseSolve.impliedCurrentRoePct).toBe(reference.reverseSolve.impliedCurrentRoePct);
  });
});
