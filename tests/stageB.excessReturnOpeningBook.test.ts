import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { excessReturnModel } from "@/pipeline/stageB/valuation";
import { buildSyntheticRouteBundle } from "./helpers/researchRoutePanel";
import { M } from "./helpers/currencyBundle";

function fixture(route: "bank" | "insurer" = "bank", trailing = false) {
  const b = buildSyntheticRouteBundle(route);
  if (!b.statements.balanceQuarterly.ok || !b.statements.incomeQuarterly.ok || !b.quote.ok) throw new Error("fixture");
  const balance = b.statements.balanceQuarterly.value.data.rows[0]!;
  const income = b.statements.incomeQuarterly.value.data.rows[0]!;
  Object.assign(balance, { totalStockholdersEquity: 600 * M, filingDate: "2026-05-02", acceptedDate: "2026-05-02 16:00:00" });
  Object.assign(income, { weightedAverageShsOutDil: 120 * M, filingDate: "2026-05-02", acceptedDate: "2026-05-02 16:00:00" });
  if (!trailing) for (const row of b.statements.incomeQuarterly.value.data.rows) {
    row.netIncome = undefined;
    row.netIncomeAvailableToCommon = undefined;
  }
  b.quote.value.data.rows[0]!.timestamp = Date.parse("2026-07-05T20:00:00Z") / 1000;
  return { b, balance, income };
}
function result(b: ReturnType<typeof fixture>["b"]) {
  const c = runStageB(b);
  if (c.valuation.kind !== "excess-return") throw new Error("route");
  return { c, er: c.valuation.excessReturn };
}

describe("D-189: opening book is independent of return availability", () => {
  it.each(["bank", "insurer"] as const)("%s uses a lagging feed's book and matching shares without pairing later earnings", route => {
    const f = rejectedNewest(route, true);
    if (!f.b.statements.balanceQuarterly.ok) throw new Error("fixture");
    f.b.statements.balanceQuarterly.value.data.rows.shift();
    const { c, er } = result(f.b);
    expect(er.asOf).toBe("2026-03-31");
    expect(er.scenarioEvidence?.dilutedShares).toBe(120 * M);
    expect(er.perShare).toBeTypeOf("number");
    expect(c.returns.commonReturnTtm?.returnPct).toBeNull();
    expect(c.returns.commonReturnTtm?.withheldReason).toMatch(/no balance sheet within 45 days.*2026-06-30/);
    expect(er.roePathPct.basis).toMatch(/FY 2025-12-31/);
  });

  it("uses the existing payout treatment after rejecting a balance", () => {
    const f = rejectedNewest("bank", true);
    if (!f.b.statements.cashflowAnnual.ok) throw new Error("fixture");
    for (const row of f.b.statements.cashflowAnnual.value.data.rows) row.netDividendsPaid = row.commonDividendsPaid;
    expect(result(f.b).er.perShare).toBeTypeOf("number");
  });
  function rejectedNewest(route: "bank" | "insurer", trailing = false) {
    const f = fixture(route, trailing);
    if (!f.b.statements.balanceQuarterly.ok || !f.b.statements.incomeQuarterly.ok) throw new Error("fixture");
    Object.assign(f.balance, { netReceivables: 200 * M, inventory: 100 * M, propertyPlantEquipmentNet: 500 * M, longTermInvestments: 200 * M });
    const stub = { ...f.balance, date: "2026-06-30", filingDate: "2026-07-01", acceptedDate: "2026-07-01 16:00:00",
      netReceivables: 0, inventory: 0, propertyPlantEquipmentNet: 0, longTermInvestments: 0 };
    f.b.statements.balanceQuarterly.value.data.rows.unshift(stub);
    f.b.statements.incomeQuarterly.value.data.rows.unshift({ ...f.income, date: stub.date, weightedAverageShsOutDil: 140 * M,
      filingDate: stub.filingDate, acceptedDate: stub.acceptedDate });
    return f;
  }

  it.each(["bank", "insurer"] as const)("%s uses the admitted newer book and its own dated shares after rejecting a stub", route => {
    const f = rejectedNewest(route);
    const { c, er } = result(f.b);
    expect(er.asOf).toBe("2026-03-31");
    expect(er.openingBookValue.value).toBe((route === "bank" ? 500 : 550) * M);
    expect(er.scenarioEvidence?.dilutedShares).toBe(120 * M);
    expect(er.valuationDate?.value).toBe("2026-07-05");
    expect(c.fairValue.perShare?.asOf).toBe("2026-07-05");
    expect(er.roePathPct.basis).toMatch(/FY 2025-12-31/);
    expect(er.payoutRatioPct.value).toBe(result(fixture(route).b).er.payoutRatioPct.value);
    expect(c.valuation.notes.join(" ")).toMatch(/opening book admitted at 2026-03-31/);
  });

  it("states the older book's specific share refusal when its matching count is absent", () => {
    const f = rejectedNewest("bank");
    f.income.weightedAverageShsOutDil = undefined;
    const { c, er } = result(f.b);
    expect(er.asOf).toBe("2025-12-31");
    expect(c.valuation.notes.join(" ")).toMatch(/no admitted diluted share count.*2026-03-31/);
  });

  it.each(["bank", "insurer"] as const)("%s preserves a preferred-capital refusal at the admitted older book", route => {
    const f = rejectedNewest(route);
    f.balance.preferredCapitalWithheldReason = "Preferred capital unresolved at 2026-03-31";
    f.balance.preferredStock = undefined;
    const { c, er } = result(f.b);
    expect(er.perShare).toBeNull();
    expect(c.fairValue.perShare).toBeNull();
    expect(c.scores.aspects.quality.signals?.find(signal => signal.id === "equityReturnVsCoeSpread")?.raw ?? null).toBeNull();
    expect(c.valuation.notes.join(" ")).toMatch(/Preferred capital unresolved at 2026-03-31/);
    expect(c.fairValue.reasons.some(g => g.field === "valuation.excessReturn.preferredCapital" && /2026-03-31/.test(g.reason))).toBe(true);
  });
  it.each(["bank", "insurer"] as const)("%s opens from the filed quarter while retaining the annual return", route => {
    const { b } = fixture(route);
    const { c, er } = result(b);
    const book = (route === "bank" ? 500 : 550) * M;
    expect(er.asOf).toBe("2026-03-31");
    expect(er.openingBookValue.value).toBe(book);
    expect(er.roePathPct.basis).toMatch(/FY 2025-12-31/);
    expect(er.valuationDate?.value).toBe("2026-07-05");
    expect(c.fairValue.perShare?.asOf).toBe("2026-07-05");
    expect(er.startCoeGrid!.rows.every(row => row.bookValue === book)).toBe(true);
    expect(er.startCoeGrid!.perShare[1][1]).toBeCloseTo(er.perShare!, 10);
    if (route === "bank") {
      expect(er.priceToTangibleBookVsRote.asOf).toBe("2026-03-31");
      expect(er.priceToTangibleBookVsRote.roteAsOf).toBe("2025-12-31");
    }
    // The historical return is a forward rate, not historical earnings added to BV0.
    const expected = excessReturnModel({ bookValue: book, currentRoePct: er.roePathPct.value[0]!,
      costOfEquityPct: er.costOfEquityPct.value, payoutRatioPct: er.payoutRatioPct.value,
      analystImpliedRoePct: er.roePathPct.value.at(-1), dilutedShares: 120 * M,
      asOf: "2026-03-31", valuationDate: "2026-07-05" });
    expect(er.perShare).toBeCloseTo(expected.perShare!, 8);
    expect(c.valuation.notes.join(" ")).toMatch(/earnings already included.*not added/i);
  });

  it.each([
    ["equity conflict", (f: ReturnType<typeof fixture>) => { f.balance.fieldConflicts = { totalStockholdersEquity: { vendorValue: 600 * M, secValue: 500 * M, usable: false, reason: "conflict" } }; }],
    ["missing intangibleAssets", (f: ReturnType<typeof fixture>) => { f.balance.intangibleAssets = undefined; }],
    ["missing preferredStock", (f: ReturnType<typeof fixture>) => { f.balance.preferredStock = undefined; }],
    ["filing after cutoff", (f: ReturnType<typeof fixture>) => { f.balance.filingDate = "2026-07-07"; f.balance.acceptedDate = "2026-07-07 16:00:00"; }],
    ["different currency", (f: ReturnType<typeof fixture>) => { f.balance.reportedCurrency = "EUR"; }],
    ["shares on another date", (f: ReturnType<typeof fixture>) => { f.income.date = "2026-03-30"; }],
    ["missing filing date", (f: ReturnType<typeof fixture>) => { delete f.balance.filingDate; delete f.balance.acceptedDate; }],
    ["share conflict", (f: ReturnType<typeof fixture>) => { f.income.fieldConflicts = { weightedAverageShsOutDil: { vendorValue: 120 * M, secValue: 110 * M, usable: false, reason: "conflict" } }; }],
    ["negative preferred adjustment", (f: ReturnType<typeof fixture>) => { f.balance.preferredStock = -M; }],
    ["late filing despite older acceptance", (f: ReturnType<typeof fixture>) => { f.balance.filingDate = "2026-07-07"; }],
  ] as const)("retains the prior annual calculation and explains %s", (_name, mutate) => {
    const f = fixture();
    mutate(f);
    const { c, er } = result(f.b);
    const control = structuredClone(f.b);
    if (!control.statements.balanceQuarterly.ok) throw new Error("fixture");
    control.statements.balanceQuarterly.value.data.rows = [];
    const annual = result(control).er;
    expect(er.perShare).toBe(annual.perShare);
    expect(er.asOf).toBe("2025-12-31");
    expect(c.valuation.notes.join(" ")).toMatch(/quarterly opening book.*not admitted/i);
    expect(c.valuation.gaps.some(g => g.field === "valuation.excessReturn.openingBook")).toBe(true);
  });

  it("keeps the fiscal-return alternative on its own fiscal-year book (C-10)", () => {
    const { b } = fixture("bank", true);
    const { er } = result(b);
    expect(er.roePathPct.basis).toMatch(/TTM ROTE/);
    expect(er.startAlternative!.bookValue).toBeLessThan(er.openingBookValue.value!);
    expect(er.startAlternative!.asOf).toBe("2025-12-31");
    expect(er.startAlternative!.label).toMatch(/FY 2025-12-31/);
    expect(er.startCoeGrid!.rows.some(row => row.bookValue === er.startAlternative!.bookValue)).toBe(true);
  });

  it("keeps a refused quarter on a trailing start's own dated book", () => {
    const f = fixture("bank", true);
    delete f.balance.filingDate;
    delete f.balance.acceptedDate;
    const { c, er } = result(f.b);
    expect(c.valuation.notes.join(" ")).toMatch(/quarterly opening book.*not admitted/i);
    expect(er.roePathPct.basis).toMatch(/TTM ROTE/);
    expect(er.asOf).toBe("2026-03-31");
    expect(er.openingBookValue.value).toBe(500 * M);
  });
});
