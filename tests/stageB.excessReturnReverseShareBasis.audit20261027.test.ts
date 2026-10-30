import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { excessReturnModel, type ExcessReturnInputs } from "@/pipeline/stageB/valuation";
import type { DataBundle } from "@/pipeline/types";
import type { CompanyFacts } from "@/edgar/xbrl";
import { buildSyntheticRouteBundle } from "./helpers/researchRoutePanel";
import { currencyBundle, M } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

// FIN-506: synthetic inputs only. Task 5's quote-date roll is deferred to B4b.
const base: ExcessReturnInputs = {
  bookValue: 50_000, tangibleCommonEquity: 50_000, currentRoePct: 16, rotePct: 16,
  costOfEquityPct: 10, payoutRatioPct: 60, riskFreePct: 4.2,
  dilutedShares: 1_000, asOf: "2026-03-31",
};
function atModelValue(gap: number, over: Partial<ExcessReturnInputs> & { price?: number | null } = {}) {
  const inputs = { ...base, dilutedShares: 1_000 * (1 + gap / 100) };
  const forward = excessReturnModel(inputs);
  const price = forward.perShare!;
  return { forward, er: excessReturnModel({ ...inputs, marketCap: price * 1_000, price, ...over }) };
}
function financial(b: DataBundle) {
  const out = runStageB(b);
  if (out.valuation.kind !== "excess-return") throw new Error("financial fixture required");
  return out.valuation;
}
function quoteAt(b: DataBundle, price: number, factor = 1) {
  if (!b.quote.ok) throw new Error("quote fixture required");
  const row = b.quote.value.data.rows[0]!;
  const shares = Number(row.marketCap) / Number(row.price);
  Object.assign(row, { price, marketCap: price * shares * factor });
}

describe("FIN-506: reverse solve shares the forward per-share basis", () => {
  it.each([1, 3])("a diluted-count gap of %s percent still solves a model-valued quote to its starting return", gap => {
    const { er, forward } = atModelValue(gap);
    expect(er.reverseSolve.impliedCurrentRoePct).toBeCloseTo(16, 1);
    expect(er.reverseSolve.basis).toBe("price-per-diluted-share");
    expect(er.reverseSolve.notes.join(" ")).toMatch(/matching the price per diluted share/);
    expect(er.perShare).toBe(forward.perShare);
    expect(er.equityValue).toBe(forward.equityValue);
    expect(er.startCoeGrid).toEqual(forward.startCoeGrid);
    expect(er.asOf).toBe(forward.asOf);
  });
  it("falls back to market cap when price is missing, retaining the previous solve", () => {
    const { er } = atModelValue(1, { price: null });
    expect(er.reverseSolve.impliedCurrentRoePct).toBeCloseTo(15.7117, 2);
    expect(er.reverseSolve.basis).toBe("market-cap");
    expect(er.reverseSolve.notes.join(" ")).toMatch(/matching market cap \(price or diluted shares unavailable\)/);
  });
  it("falls back when no diluted divisor was admitted", () => {
    const value = excessReturnModel(base).equityValue!;
    const er = excessReturnModel({ ...base, dilutedShares: null, marketCap: value, price: 100 });
    expect(er.perShare).toBeNull();
    // Exact main fallback: bisection stops at its existing 0.01pp bracket width.
    expect(er.reverseSolve.impliedCurrentRoePct).toBe(15.997314453125);
    expect(er.reverseSolve.basis).toBe("market-cap");
  });
  it("can solve a price without a market cap at the pure-model boundary", () => {
    expect(atModelValue(1, { marketCap: null }).er.reverseSolve).toMatchObject({
      impliedCurrentRoePct: expect.closeTo(16, 1), basis: "price-per-diluted-share",
    });
  });
  it("control: identical share counts already solve to the current return", () => {
    expect(atModelValue(0).er.reverseSolve.impliedCurrentRoePct).toBeCloseTo(16, 1);
  });
  it("runStageB follows price even when market cap implies 3% more quote shares", () => {
    const first = financial(buildSyntheticRouteBundle("bank")).excessReturn;
    const result = (factor: number) => {
      const b = buildSyntheticRouteBundle("bank");
      quoteAt(b, first.perShare!, factor);
      return financial(b).excessReturn;
    };
    const a = result(1), b = result(1.03);
    expect(a.reverseSolve.impliedCurrentRoePct).not.toBeNull();
    expect(b.reverseSolve.impliedCurrentRoePct).toBeCloseTo(a.reverseSolve.impliedCurrentRoePct!, 6);
    expect(b.reverseSolve.impliedCurrentRoePct).toBeCloseTo(b.roePathPct.value[0]!, 1);
    expect(b.reverseSolve.basis).toBe("price-per-diluted-share");
    expect(b.perShare).toBe(first.perShare);
    expect(b.equityValue).toBe(first.equityValue);
    expect(b.startAlternative).toEqual(first.startAlternative);
    expect(b.startCoeGrid).toEqual(first.startCoeGrid);
  });
  it("records price basis even when the quote is outside the ROE bracket", () => {
    const er = financial(buildSyntheticRouteBundle("bank")).excessReturn;
    expect(er.reverseSolve.impliedCurrentRoePct).toBeNull();
    expect(er.reverseSolve.basis).toBe("price-per-diluted-share");
    expect(er.reverseSolve.notes.join(" ")).toMatch(/price per diluted share above.*implied ROE > 80%/);
  });
  it.each(["substituted", "basic", "conversion-withheld"] as const)("uses B4a's %s divisor unchanged", mode => {
    const b = currencyBundle({ bank: true });
    for (const result of [b.statements.incomeAnnual, b.statements.incomeQuarterly]) {
      if (!result.ok) throw new Error("income fixture required");
      for (const row of result.value.data.rows) {
        row.weightedAverageShsOut = 99 * M;
        if (mode === "basic") row.weightedAverageShsOutDil = 99 * M;
      }
    }
    if (!b.statements.incomeQuarterly.ok) throw new Error("quarters required");
    Object.assign(b.statements.incomeQuarterly.value.data.rows[0]!, {
      netIncome: -40 * M, epsDiluted: -0.41, weightedAverageShsOut: 98.5 * M, weightedAverageShsOutDil: 98.5 * M,
    });
    if (mode === "conversion-withheld") withIssuerFacts(b, {
      cik: 1, entityName: "TEST", facts: { "us-gaap": { ConvertibleNotesPayable: { units: { USD: [
        { end: "2025-12-31", val: 500 * M, accn: "0000000000-26-000001", fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-13" },
      ] } } } },
    } as unknown as CompanyFacts);
    const first = financial(b).excessReturn;
    const divisor = (mode === "substituted" ? 99.5 : 98.5) * M;
    expect(first.perShare).toBeGreaterThan(0);
    expect(first.perShare! * divisor).toBeCloseTo(first.equityValue!, 3);
    quoteAt(b, first.perShare!, 1.03);
    const er = financial(b).excessReturn;
    expect(er.reverseSolve.impliedCurrentRoePct).not.toBeNull();
    expect(er.reverseSolve.impliedCurrentRoePct).toBeCloseTo(er.roePathPct.value[0]!, 1);
    expect(er.reverseSolve.basis).toBe("price-per-diluted-share");
    expect(er.perShare).toBe(first.perShare);
    expect(er.equityValue).toBe(first.equityValue);
  });
  it.each(["CAD", null])("retains the %s quote-currency refusal", currency => {
    const b = buildSyntheticRouteBundle("bank");
    if (!b.profile.ok) throw new Error("profile fixture required");
    b.profile.value.data.rows[0]!.currency = currency ?? undefined;
    const er = financial(b).excessReturn;
    expect(er.reverseSolve.impliedCurrentRoePct).toBeNull();
    expect(er.reverseSolve.basis).toBeUndefined();
    expect(er.reverseSolve.notes.join(" ")).toMatch(/currency|quote.*CAD/);
  });
  it("keeps an unverified ADS divisor withheld even with a usable price", () => {
    const b = currencyBundle({ bank: true });
    if (!b.profile.ok) throw new Error("profile fixture required");
    b.profile.value.data.rows[0]!.isAdr = true;
    const result = financial(b);
    expect(result.gaps.some(g => g.field === "valuation.perShare.securityBasis")).toBe(true);
    expect(result.excessReturn.perShare).toBeNull();
    expect(result.excessReturn.reverseSolve.impliedCurrentRoePct).toBeNull();
    expect(result.excessReturn.reverseSolve.basis).toBeUndefined();
  });
  it("does not use price with an unresolved economic-class divisor", () => {
    const b = currencyBundle({ bank: true });
    b.economicShareEvidence = [{
      issuerId: "0000000042", securityId: b.symbol, asOf: "2026-03-31", filed: "2026-05-06",
      effectiveFrom: "2026-03-31", effectiveTo: null, complete: true, sourceHash: "synthetic-class-source", sourceIds: ["filed:capital"],
      classes: [
        { classId: b.symbol, shares: 80 * M, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "quoted-market-price" },
        { classId: "B", shares: 20 * M, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "economic-equivalence-proxy" },
      ],
    }];
    const result = financial(b);
    expect(result.gaps.some(g => g.field === "valuation.perShare.economicClassBasis" && g.severity === "warn")).toBe(true);
    expect(result.excessReturn.perShare).toBeNull();
    expect(result.excessReturn.reverseSolve.basis).not.toBe("price-per-diluted-share");
  });
});
