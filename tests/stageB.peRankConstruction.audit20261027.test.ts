import { describe, expect, it } from "vitest";
import { multiplesFramework, percentileRank, type MultiplesFrameworkInputs } from "@/pipeline/stageB/valuation";
import { peRankIssuer as issuer } from "./helpers/peRankConstruction";

const pe = (input: MultiplesFrameworkInputs) => multiplesFramework("general", input).multiples.find(m => m.key === "peTtm")!;
describe("FIN-505 P/E rank construction", () => {
  it("ranks the construction of the selected derived history while retaining displayed diluted P/E", () => {
    const p = pe(issuer(1.04));
    expect(p.basis).toMatch(/^price \/ epsDiluted/);
    expect(p.current).toBeCloseTo(26,10);
    expect(p.ownHistory!.p50).toBeCloseTo(25,9);
    expect(p.ownHistory!.percentileRank).toBeCloseTo(50,6);
    expect(p.ownHistory!.rankedCurrent).toEqual({ value:25, construction:"capitalization-common-income" });
    expect(p.ownHistory!.basis).toMatch(/ranked as market cap \/ common income \(25x\)/);
  });
  it("keeps displayed EPS P/E but refuses its rank when common earnings are withheld", () => {
    const input = issuer(1.04, { commonIncomeWithheldReason:"synthetic: common earnings allocation unavailable" });
    const p = pe(input);
    expect(p.current).toBeCloseTo(26,10);
    expect(p.ownHistory!.percentileRank).toBeNull();
    expect(p.ownHistory!.rankedCurrent).toEqual({ value:null, construction:"capitalization-common-income" });
    expect(multiplesFramework("general", input).notes.join(" ")).toMatch(/peTtm: .*not ranked: common income is withheld/);
    const ev = (i: MultiplesFrameworkInputs) => multiplesFramework("general", i).multiples.find(m => m.key === "evToEbitda")!.ownHistory;
    expect(ev(input)).toEqual(ev(issuer(1.04)));
  });
  it("keeps equal-count and already-common-income ranks; vendor history ranks displayed P/E", () => {
    expect(pe(issuer(1)).ownHistory!.percentileRank).toBeCloseTo(50,6);
    const common = pe(issuer(1.04,{epsDiluted:null}));
    expect(common.basis).toMatch(/^marketCap \/ common income/);
    expect(common.ownHistory!.rankedCurrent).toBeUndefined();
    expect(common.ownHistory!.percentileRank).toBeCloseTo(50,6);
    const rows = Array.from({length:8},(_,i)=>({date:`2025-0${i+1}-28`,priceToEarningsRatio:22+i}));
    const vendor = pe({...issuer(1.04),quarterlyFundamentals:[],enterpriseValuesHistory:[],keyMetricsHistory:rows});
    expect(vendor.ownHistory!.rankedCurrent).toBeUndefined();
    expect(vendor.ownHistory!.percentileRank).toBe(percentileRank(rows.map(r=>r.priceToEarningsRatio),vendor.current!));
  });
});
