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
    const v = excessReturnModel({ ...base, startAlternative: { ...base.startAlternative, convertiblePreferredClaim: 50 }, convertiblePreferredClaim: 50, convertibles: [pref], price: expected });
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


describe("F2: market EV and own-history count tagged preferred once", () => {
  it.each([0, 300 * M, 500 * M, 1000 * M])("folds the claim against permanent preferred %s", permanent => {
    const b = convertibleBundle("preferred", 500 * M, M);
    for (const result of [b.statements.balanceAnnual, b.statements.balanceQuarterly]) {
      if (!result.ok) throw new Error("balance");
      for (const row of result.value.data.rows) row.preferredStock = permanent;
    }
    const control = structuredClone(b);
    withIssuerFacts(control, { cik: 42, entityName: "Test", facts: {} });
    const before = runStageB(control).valuation;
    const after = runStageB(b).valuation;
    expect(after.multiples.enterpriseValue.value! - before.multiples.enterpriseValue.value!).toBe(Math.max(0, 500 * M - permanent));
    expect(after.dcf?.bridge.preferred).toBe(Math.max(permanent, 500 * M));
  });
  it("folds each historical quarter's own claim before computing EV ranks", () => {
    const b = buildSyntheticRouteBundle("general", { quarterHistory: true });
    if (!b.statements.incomeQuarterly.ok) throw new Error("income");
    for (const row of b.statements.incomeQuarterly.value.data.rows) row.revenue = 100 * M;
    const control = structuredClone(b);
    withIssuerFacts(control, { cik: 42, entityName: "Test", facts: {} });
    if (!b.statements.balanceQuarterly.ok || !b.statements.incomeQuarterly.ok) throw new Error("history");
    const dates = b.statements.balanceQuarterly.value.data.rows.map(row => String(row.date));
    withIssuerFacts(b, { cik: 42, entityName: "Test", facts: { "us-gaap": {
      ConvertiblePreferredStockNonredeemableOrRedeemableIssuerOptionValue: { units: { USD: dates.map(end => ({ end, val: end === dates[0] ? 500 * M : 50 * M, form: "10-Q", filed: "2026-04-30", accn: "test" })) } },
    } } });
    const before = runStageB(control).valuation.multiples;
    const after = runStageB(b).valuation.multiples;
    expect(after.enterpriseValue.value! - before.enterpriseValue.value!).toBe(500 * M);
    const prior = before.multiples.find(row => row.key === "evToSales")!.ownHistory!;
    const current = after.multiples.find(row => row.key === "evToSales")!.ownHistory!;
    expect(current.observationDetails!.length).toBeGreaterThanOrEqual(8);
    for (const row of current.observationDetails!) {
      const old = prior.observationDetails!.find(x => x.periodEnd === row.periodEnd)!;
      const revenue = b.statements.incomeQuarterly.value.data.rows.filter(x => String(x.date) <= row.periodEnd!).slice(0, 4).reduce((sum, x) => sum + Number(x.revenue), 0);
      expect(row.value - old.value).toBeCloseTo((row.periodEnd === dates[0] ? 500 * M : 50 * M) / revenue, 10);
    }
    expect(prior.percentileRank).toBeNull(); // flat, equal-EV control
    expect(current.percentileRank).toBe(100); // dated 500M current claim exceeds historical 50M claims
    expect(current.rankedCurrent).toEqual(prior.rankedCurrent);
    expect(after.multiples.find(row => row.key === "evToSales")!.current! - before.multiples.find(row => row.key === "evToSales")!.current!).toBeGreaterThan(0);
  });
});


describe("F4: fiscal-year preferred is measured at its own book date", () => {
  it.each(["bank", "insurer", "reit"] as const)("%s never subtracts a later claim from the FY alternative", route => {
    const b = buildSyntheticRouteBundle(route);
    if (!b.profile.ok) throw new Error("profile");
    if (route === "reit") b.profile.value.data.rows[0].industry = "REIT - Mortgage";
    for (const result of [b.statements.balanceAnnual, b.statements.balanceQuarterly]) {
      if (!result.ok) throw new Error("balance");
      for (const row of result.value.data.rows) row.preferredStock = 0;
    }
    withIssuerFacts(b, { cik: 42, entityName: "Test", facts: {} });
    const control = runStageB(structuredClone(b)).valuation.excessReturn!;
    for (const prior of [null, 0, 50 * M]) {
      const copy = structuredClone(b);
      withIssuerFacts(copy, { cik: 42, entityName: "Test", facts: { "us-gaap": {
        ConvertiblePreferredStockNonredeemableOrRedeemableIssuerOptionValue: { units: { USD: [
          { end: "2026-03-31", val: 180 * M, form: "10-Q", filed: "2026-04-30", accn: "current" },
          ...(prior === null ? [] : [{ end: "2025-12-31", val: prior, form: "10-K", filed: "2026-02-10", accn: "prior" }]),
        ] } },
      } } });
      const er = runStageB(copy).valuation.excessReturn!;
      const book = control.startAlternative!.bookValue - (prior ?? 0);
      expect(er.startAlternative!.bookValue).toBe(book);
      expect(er.startAlternative!.perShare).toBeCloseTo(control.startAlternative!.perShare! * book / control.startAlternative!.bookValue, 9);
      expect(er.startCoeGrid!.rows.some(row => row.bookValue === book)).toBe(true);
    }
  });
  it("does not restore a later converted preferred into an earlier book", () => {
    const base = { bookValue: 1000, currentRoePct: 15, costOfEquityPct: 10, payoutRatioPct: 50, dilutedShares: 110,
      startAlternative: { roePct: 12, basis: "fiscal-year-common-roe" as const, asOf: "2025-12-31", bookValue: 900 } };
    const v = excessReturnModel({ ...base, convertiblePreferredClaim: 50, convertibles: [{ kind: "preferred", conversionShares: 10, claim: 50, settlement: "full-shares", conversionPrice: null, period: { start: "2026-01-01", end: "2026-03-31" }, basis: "filed" }] });
    expect(v.convertibles![0].reading).toBe("converted");
    expect(v.startAlternative!.bookValue).toBe(900);
  });
});
