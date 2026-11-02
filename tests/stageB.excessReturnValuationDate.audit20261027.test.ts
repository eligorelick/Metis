import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { excessReturnModel, type ExcessReturnInputs } from "@/pipeline/stageB/valuation";
import { buildSyntheticRouteBundle } from "./helpers/researchRoutePanel";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

const pure: ExcessReturnInputs = { bookValue: 1000, currentRoePct: 15, costOfEquityPct: 10, payoutRatioPct: 50, dilutedShares: 110,
  asOf: "2026-03-31", startAlternative: { basis: "fiscal-year-common-roe", asOf: "2025-12-31", bookValue: 950, roePct: 13 }, totalDebt: 50,
  convertibles: [{ kind: "notes", claim: 50, conversionShares: 10, conversionPrice: 5, settlement: "full-shares", period: { start: "2026-01-01", end: "2026-03-31" }, basis: "filed" }] };
function run(route: "bank" | "insurer" | "general", day: string, currency = "USD") {
  const b = buildSyntheticRouteBundle(route);
  withIssuerFacts(b, { cik: 42, entityName: "Test", facts: {} });
  if (!b.quote.ok) throw new Error("fixture quote");
  b.quote.value.data.rows[0].timestamp = Date.parse(`${day}T20:00:00Z`) / 1000;
  if (day > "2026-07-06") b.builtAt = `${day}T23:00:00.000Z`; // future-quote controls must remain point-in-time admissible.
  if (currency !== "USD") for (const result of Object.values(b.statements)) if (result.ok) for (const row of result.value.data.rows) row.reportedCurrency = currency;
  const out = runStageB(b);
  return out;
}
describe("FIN-309: one value date on the financial route", () => {
  it.each(["bank", "insurer"] as const)("%s rolls to the quote date and dates headline fair value truthfully", route => {
    const earlier = run(route, "2026-04-01"), later = run(route, "2026-07-05");
    if (earlier.valuation.kind !== "excess-return" || later.valuation.kind !== "excess-return") throw new Error("fixture route");
    const a = earlier.valuation.excessReturn, b = later.valuation.excessReturn;
    expect(b.asOf).toBe("2026-03-31");
    expect(b.perShare).toBeCloseTo(a.perShare! * (1 + a.costOfEquityPct.value! / 100) ** (95 / 365.25), 8);
    expect(b.valuationDate?.value).toBe("2026-07-05");
    expect(b.notes.join(" ")).toMatch(/rolled forward 96 days.*gross of distributions/);
    expect(later.fairValue.perShare?.asOf).toBe("2026-07-05");
  });
  it("bounds only the headline roll, and refuses missing or incompatible inputs", () => {
    for (const [day, rolled] of [["2026-03-31", false], ["2026-10-17", true], ["2026-10-18", false]] as const) {
      const r = excessReturnModel({ ...pure, valuationDate: day });
      expect(r.perShare).not.toBeNull();
      expect(r.valuationDate !== undefined).toBe(rolled);
      if (day === "2026-10-18") expect(r.gaps.some(g => g.field === "valuation.excessReturn.valuationDate")).toBe(true);
    }
    expect(excessReturnModel({ ...pure, costOfEquityPct: null, valuationDate: "2026-07-05" }).perShare).toBeNull();
    const cad = run("bank", "2026-07-05", "CAD");
    expect(cad.fairValue.perShare).toBeNull();
  });
  it("rolls alternative and grid cells from their own dates/rates and inverts its chosen convertible reading", () => {
    const book = excessReturnModel(pure), later = excessReturnModel({ ...pure, valuationDate: "2026-07-05" });
    expect(later.startAlternative!.perShare).toBeCloseTo(book.startAlternative!.perShare! * 1.1 ** (186 / 365.25), 9);
    expect(later.startCoeGrid!.perShare[1][1]).toBeCloseTo(later.perShare!, 10);
    // F1: converted notes now restore book before valuation (950 -> 1000).
    const row = book.startCoeGrid!.rows.findIndex(r => r.bookValue === book.startAlternative!.bookValue);
    for (let c = 0; c < 3; c++) expect(later.startCoeGrid!.perShare[row][c]).toBeCloseTo(book.startCoeGrid!.perShare[row][c]! * (1 + book.startCoeGrid!.costOfEquityPcts[c] / 100) ** (186 / 365.25), 9);
    expect(excessReturnModel({ ...pure, valuationDate: "2026-07-05", price: later.perShare! }).reverseSolve.impliedCurrentRoePct).toBeCloseTo(15, 2);
  });
  it("does not roll a value backward and dates an over-limit headline at book", () => {
    const a = excessReturnModel(pure), b = excessReturnModel({ ...pure, valuationDate: "2026-03-30" });
    expect(a.perShare).toBe(b.perShare);
    const late = run("bank", "2026-10-18");
    expect(late.fairValue.perShare?.asOf).toBe("2026-03-31");
  });
  it("keeps the general-route DCF roll", () => {
    const r = run("general", "2026-07-05");
    if (r.valuation.kind !== "dcf") throw new Error("fixture DCF");
    expect(r.valuation.assumptions?.valuationDate?.value).toBe("2026-07-05");
  });
  it("withholds an alternative with an unknown opening date when the headline rolls", () => {
    const r = excessReturnModel({ ...pure, valuationDate: "2026-07-05", startAlternative: { ...pure.startAlternative!, asOf: null } });
    expect(r.startAlternative!.perShare).toBeNull();
    // F1: locate the alternative on its selected-reading book.
    const index = r.startCoeGrid!.rows.findIndex(row => row.bookValue === r.startAlternative!.bookValue);
    expect(r.startCoeGrid!.perShare[index]).toEqual([null, null, null]);
  });
  it("rolls an older fiscal-year alternative beyond 200 days when the headline is inside the limit", () => {
    const book = excessReturnModel(pure);
    const rolled = excessReturnModel({ ...pure, valuationDate: "2026-08-28" });
    expect(rolled.valuationDate?.elapsedYears).toBeCloseTo(150 / 365.25, 10);
    expect(rolled.startAlternative!.perShare).toBeCloseTo(book.startAlternative!.perShare! * 1.1 ** (240 / 365.25), 9);
  });
});
