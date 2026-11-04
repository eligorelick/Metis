import { describe, expect, it } from "vitest";
import { computeScenarioTargets } from "@/pipeline/stageB/scenarioTargets";
import { computeFairValue } from "@/pipeline/stageB/fairValue";
import { excessReturnModel, type ExcessReturnInputs, type ValuationResult } from "@/pipeline/stageB/valuation";
import { ScenarioTargetsSchema } from "@/report/schema";
import { buildSyntheticRouteBundle, runResearchRoutePanel } from "./helpers/researchRoutePanel";

const history = [12, 14, 16, 18, 20].map((roicPct, i) => ({ date: `${2021 + i}-12-31`, roicPct, waccPct: null }));
function fixture(over: Partial<ExcessReturnInputs> = {}, route: "bank" | "insurer" = "bank") {
  const raw: ExcessReturnInputs = {
    bookValue: 1000, bookValueBasis: route === "bank" ? "tangible-common-equity" : "common-equity",
    currentRoePct: 16, currentRoeBasis: route === "bank" ? "fiscal-year-rote" : "fiscal-year-common-roe",
    currentRoeAsOf: "2025-12-31", costOfEquityPct: 10, years: 5, payoutRatioPct: 40,
    dilutedShares: 100, roeHistory: history, riskFreePct: 4,
    asOf: "2025-12-31", valuationDate: "2026-02-01", ...over,
  };
  const valuation = { kind: "excess-return", route, excessReturn: excessReturnModel(raw), notes: [], gaps: [] } as unknown as ValuationResult;
  const input = { route: { base: route } as never, valuation, waccPct: null, incomeHistory: [], currentPrice: 20, currency: "USD", asOf: "2026-02-01" };
  return { raw, valuation, input, targets: computeScenarioTargets(input) };
}

function completeFinancialBundle(route: "bank" | "insurer") {
  const bundle = buildSyntheticRouteBundle(route);
  if (!bundle.statements.balanceAnnual.ok) throw new Error("fixture balances");
  const balances = bundle.statements.balanceAnnual.value.data.rows;
  const template = balances.at(-1)!;
  for (const year of [2023, 2022, 2021]) balances.push({ ...template, date: `${year}-12-31`, filingDate: `${year + 1}-02-10`, totalStockholdersEquity: (350 + (year - 2021) * 25) * 1e6 });
  return bundle;
}

describe("D-193: financial-route own-history scenarios", () => {
  it.each(["bank", "insurer"] as const)("%s brackets an unchanged fair value with business-return and persistence stresses", route => {
    const { targets, input } = fixture({}, route);
    expect(targets.status).toBe("available");
    expect(targets.method).toBe("excess-return-history");
    expect(ScenarioTargetsSchema.parse(targets)).toEqual(targets);
    const [bull, base, bear] = targets.targets;
    expect(base.perShare?.value).toBe(computeFairValue(input).perShare?.value);
    expect(base.perShare?.asOf).toBe(computeFairValue(input).perShare?.asOf);
    expect(bull.perShare!.value).toBeGreaterThan(base.perShare!.value);
    expect(bear.perShare!.value).toBeLessThan(base.perShare!.value);
    expect(bull.upsidePct).toBeCloseTo((bull.perShare!.value / 20 - 1) * 100);
    expect(targets.basis.join(" ")).toMatch(/25th.*14.*75th.*18/);
    expect(targets.basis.join(" ")).toMatch(/cost of equity.*10.*fixed/i);
    expect(targets.basis.join(" ")).toMatch(/payout.*fixed/i);
    expect(targets.basis.join(" ")).toMatch(/0\.5.*2/);
    expect(targets.targets.every(t => t.growthDeltaPp === 0 && t.marginDeltaPp === 0)).toBe(true);
  });

  it.each([
    ["thin history", { roeHistory: history.slice(0, 3) }, /at least four/i],
    ["loss year", { roeHistory: history.map((y, i) => i === 2 ? { ...y, roicPct: -1 } : y) }, /loss|non-positive/i],
    ["missing annual return", { roeHistory: history.map((y, i) => i === 2 ? { ...y, roicPct: null } : y) }, /unavailable annual return/i],
    ["refused book", { bookValue: null }, /opening book/i],
    ["missing CoE", { costOfEquityPct: null }, /cost of equity unavailable/i],
    ["below CoE", { currentRoePct: 5, roeHistory: history.map(y => ({ ...y, roicPct: 6 })) }, /no.*excess return|below.*cost of equity/i],
    ["loss-making current", { currentRoePct: -2 }, /current.*non-positive|loss/i],
    ["gap in history", { roeHistory: history.filter((_, i) => i !== 2) }, /consecutive/i],
    ["duplicate history", { roeHistory: [...history, history[4]] }, /unique|duplicate/i],
    ["missing payout", { payoutRatioPct: null }, /payout/i],
  ] satisfies [string, Partial<ExcessReturnInputs>, RegExp][])("refuses %s with its own reason", (_name, over, reason) => {
    const { targets } = fixture(over);
    expect(targets.status).toBe("suppressed");
    expect(targets.method).toBe("excess-return-history");
    expect(targets.targets).toEqual([]);
    expect(targets.missingReasons.map(g => g.reason).join(" ")).toMatch(reason);
  });

  it("withholds an insurer's P/TBV rather than calling common book tangible", () => {
    const { targets } = fixture({ tangibleCommonEquity: null }, "insurer");
    expect(targets.status).toBe("available");
    expect(targets.basis.join(" ")).toMatch(/P\/TBV withheld.*tangible/i);
    expect(targets.basis.join(" ")).toMatch(/common-equity ROE/);
  });

  it("keeps the return fan independent of quote, consensus and WACC", () => {
    const { input, targets } = fixture();
    const changed = computeScenarioTargets({ ...input, currentPrice: 200, waccPct: 99 });
    expect(targets.status).toBe("available");
    expect(changed.targets.map(t => t.perShare)).toEqual(targets.targets.map(t => t.perShare));
    expect(changed.targets[0].upsidePct).not.toBe(targets.targets[0].upsidePct);
  });

  it("refuses an inconsistent retained base instead of rescaling a different model", () => {
    const { valuation, input } = fixture();
    if (valuation.kind !== "excess-return") throw new Error("fixture");
    valuation.excessReturn.equityValue! *= 1.1;
    const result = computeScenarioTargets(input);
    expect(result.status).toBe("suppressed");
    expect(result.missingReasons.map(g => g.reason).join(" ")).toMatch(/reproduce.*base|base.*reproduc/i);
  });

  it("refuses an unavailable retained payout path without throwing or inventing it", () => {
    const { valuation, input } = fixture();
    if (valuation.kind !== "excess-return") throw new Error("fixture");
    delete valuation.excessReturn.financialAssumptions!.payoutPathPct;
    const result = computeScenarioTargets(input);
    expect(result.status).toBe("suppressed");
    expect(result.missingReasons.map(g => g.reason).join(" ")).toMatch(/payout/i);
  });

  it("refuses a nonlinear convertible bridge until each path can admit its own choice", () => {
    const { valuation, input } = fixture();
    if (valuation.kind !== "excess-return") throw new Error("fixture");
    valuation.excessReturn.convertibles = [{ id: "claim", chosen: "converted" } as never];
    const result = computeScenarioTargets(input);
    expect(result.status).toBe("suppressed");
    expect(result.missingReasons.map(g => g.reason).join(" ")).toMatch(/convertible/);
  });

  it("keeps favorable labels when the current return is recovering toward terminal", () => {
    const { targets } = fixture({ currentRoePct: 11 });
    expect(targets.status).toBe("available");
    const [bull, base, bear] = targets.targets;
    expect(bull.perShare!.value).toBeGreaterThan(base.perShare!.value);
    expect(base.perShare!.value).toBeGreaterThan(bear.perShare!.value);
    // Bear's negative deviation from terminal persists longer: 11 -> 11.2679, versus base 11 -> 11.5.
    expect(targets.basis.find(line => line.startsWith("Bear:"))).toContain("11, 11.2679");
  });

  it("interpolates four-year own-history bounds and reports a fully collapsed fan honestly", () => {
    const four = fixture({ roeHistory: history.slice(1) }).targets;
    expect(four.status).toBe("available");
    expect(four.basis.join(" ")).toMatch(/25th percentile 15\.5%.*75th percentile 18\.5%/);
    const flat = fixture({ currentRoePct: 10, analystImpliedRoePct: 10, roeHistory: history.map(y => ({ ...y, roicPct: 10 })) }).targets;
    expect(flat.status).toBe("suppressed");
    expect(flat.missingReasons.map(g => g.reason).join(" ")).toMatch(/no positive excess return/);
  });

  it.each(["bank", "insurer"] as const)("%s targets and modeled assumptions reach live, Markdown and print", route => {
    const { computed, report, surfaces } = runResearchRoutePanel(completeFinancialBundle(route));
    expect(computed.scenarioTargets.status).toBe("available");
    expect(report.scenarioTargets?.targets.find(t => t.name === "base")?.perShare?.value).toBe(report.fairValue?.perShare?.value);
    expect(report.valuation.scenarios.every(s => s.horizon === "explicit excess-return horizon")).toBe(true);
    expect(report.scenarioPresentation?.interpretation).toMatch(/excess-return/);
    expect(report.scenarioPresentation?.weightBasis).not.toMatch(/DCF sensitivities/);
    for (const s of report.valuation.scenarios) {
      expect(s.assumptions.join(" ")).toMatch(/return path|ROTE path|ROE path/);
      expect(s.whatWouldHaveToBeTrue.join(" ")).not.toMatch(/sales-to-capital|WACC/);
      expect(s.probability).toBeNull();
    }
    for (const surface of Object.values(surfaces)) {
      expect(surface).toContain("excess-return-history");
      expect(surface).toContain("explicit excess-return horizon");
      expect(surface).toContain("P/TBV");
      expect(surface).toContain("fixed");
    }
  });

  it.each(["bank", "insurer"] as const)("%s never infers missing tangible operands as zero for scenario evidence", route => {
    const bundle = completeFinancialBundle(route);
    for (const result of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) {
      if (!result.ok) throw new Error("fixture");
      for (const row of result.value.data.rows) row.goodwill = undefined;
    }
    const { computed } = runResearchRoutePanel(bundle);
    // Preserve the old base calculation; scenarios impose no new guess about book.
    expect(computed.fairValue.status).toBe("available");
    if (route === "bank") {
      expect(computed.scenarioTargets.status).toBe("suppressed");
      expect(computed.scenarioTargets.missingReasons.map(g => g.reason).join(" ")).toMatch(/opening book.*goodwill/i);
    } else {
      expect(computed.scenarioTargets.status).toBe("available");
      expect(computed.scenarioTargets.basis.join(" ")).toMatch(/P\/TBV withheld.*tangible/i);
      expect(computed.scenarioTargets.basis.join(" ")).not.toContain("Implied target P/TBV");
    }
  });

  it("also admits the opening annual book used in the oldest sampled return", () => {
    const bundle = completeFinancialBundle("bank");
    if (!bundle.statements.balanceAnnual.ok) throw new Error("fixture");
    bundle.statements.balanceAnnual.value.data.rows.find(row => row.date === "2021-12-31")!.goodwill = undefined;
    const { computed } = runResearchRoutePanel(bundle);
    expect(computed.scenarioTargets.status).toBe("suppressed");
    expect(computed.scenarioTargets.missingReasons.map(g => g.reason).join(" ")).toMatch(/annual return.*goodwill.*2021-12-31/i);
  });
});
