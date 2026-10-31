import { describe, expect, it } from "vitest";
import { summarizeSensitivity, summarizeExcessReturnGrid, applyScenarioPresentation, comparableScenarioPrice, buildScenarioPresentation } from "@/report/scenarioPresentation";
import type { DataBundle } from "@/pipeline/types";
import { runStageB, type ComputedMetrics } from "@/pipeline/compute";
import type { SensitivityCell, Valuation } from "@/report/schema";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

function grid(values: (number | null)[]): SensitivityCell[] {
  return values.map((perShare, index) => ({ waccPct: 8 + Math.floor(index / 2), gTermPct: 2 + index % 2, perShare }));
}

function narrativeValuation(): Valuation {
  return { scenarios: (["bull", "base", "bear"] as const).map((name) => ({
    name, probability: 1 / 3, assumptions: [`model ${name} commentary`],
    whatWouldHaveToBeTrue: ["demand remains stable"], priceTarget: null, horizon: "n/a",
  })) } as unknown as Valuation;
}

function computedFixture(): ComputedMetrics {
  const computed = runStageB(completeCurrencyBundle({}));
  if (computed.valuation.kind !== "dcf" || !computed.valuation.assumptions || !computed.valuation.dcf || computed.scenarioTargets.status !== "available") {
    throw new Error("fixture requires complete DCF scenarios");
  }
  computed.valuation.assumptions.growthPath.value = [10.126, 6, 2];
  computed.valuation.assumptions.ebitMarginPath.value = [20, 22, 24];
  computed.valuation.dcf.bridge.minorityInterest = null;
  computed.valuation.dcf.bridge.preferred = 0;
  computed.scenarioTargets.targets.forEach((target) => {
    target.growthDeltaPp = target.name === "bull" ? 2 : target.name === "bear" ? -2 : 0;
    target.marginDeltaPp = target.name === "bull" ? 1 : target.name === "bear" ? -1 : 0;
  });
  return computed;
}

describe("modeled-grid sensitivity conclusions", () => {
  it("retains observed growth/margin crossings without a usable WACC grid", () => {
    const gm = { growthShiftsPp: [-5, 5], marginShiftsPp: [-2, 2], perShare: [[90, 110], [95, 115]] };
    for (const dc of [[], grid([110]), grid([110, 120])]) {
      const result = summarizeSensitivity(dc, 100, gm);
      expect(result.status).toBe("sensitive");
      expect(result.conclusion).toContain("2 of 4 valid year-one growth");
      expect(result.conclusion).not.toContain("all 0 WACC");
    }
    expect(summarizeSensitivity([], 100, { ...gm, perShare: [[110, 120], [130, 140]] }).status).toBe("unavailable");
  });

  it("describes only the unique growth/margin coordinates counted as evidence", () => {
    const result = summarizeSensitivity(grid([110, 120, 115, 125]), 100, {
      growthShiftsPp: [-5, -5, 5], marginShiftsPp: [-2, 2], perShare: [[90, 110], [85, 115], [95, 120]],
    });
    expect(result.status).toBe("sensitive");
    expect(result.conclusion).toContain("1 of 2 valid year-one growth");
    expect(result.conclusion).toContain("growth +5pp at margin −2pp");
    expect(result.conclusion).not.toContain("growth −5pp");
  });

  it("does not claim robustness from an incomplete or malformed growth/margin grid", () => {
    const dc = grid([110, 120, 115, 125]);
    const gm = { growthShiftsPp: [-5, 5], marginShiftsPp: [-2, 2], perShare: [[110, 120], [130, 140]] as (number | null)[][] };
    expect(summarizeSensitivity(dc, 100, gm).status).toBe("robust-above");
    expect(summarizeSensitivity(dc, 100, { ...gm, perShare: [[110, null], [130, 140]] }).status).toBe("unavailable");
    expect(summarizeSensitivity(dc, 100, { ...gm, perShare: [[110, 120]] }).status).toBe("unavailable");
    expect(summarizeSensitivity(dc, 100, { ...gm, growthShiftsPp: [5, 5] }).status).toBe("unavailable");
    expect(summarizeSensitivity(dc, 100, { ...gm, marginShiftsPp: [NaN, 2] }).status).toBe("unavailable");
    expect(summarizeSensitivity(dc, 100, { ...gm, perShare: [[90, null], [130, 140]] }).status).toBe("sensitive");
    expect(summarizeSensitivity([...dc, dc[0]], 100).status).toBe("unavailable");
  });

  it("requires a complete two-axis excess-return grid, not just two numeric values", () => {
    const g = { rows: [{ label: "low", startReturnPct: 8, bookValue: 100 }, { label: "high", startReturnPct: 12, bookValue: 100 }],
      costOfEquityPcts: [8, 10], perShare: [[120, 110], [150, 140]], notes: [] };
    expect(summarizeExcessReturnGrid(g, 100).status).toBe("robust-above");
    expect(summarizeExcessReturnGrid({ ...g, perShare: [[120, 110]] }, 100).status).toBe("unavailable");
    expect(summarizeExcessReturnGrid({ ...g, rows: [g.rows[0], g.rows[0]] }, 100).status).toBe("unavailable");
    expect(summarizeExcessReturnGrid({ ...g, costOfEquityPcts: [8, 8] }, 100).status).toBe("unavailable");
    expect(summarizeExcessReturnGrid({ ...g, rows: [g.rows[0]], perShare: [[120, 110]] }, 100).status).toBe("unavailable");
  });
  it("retains fresh analyst text and citations that collide with the generated-condition prefix", () => {
    const computed = computedFixture();
    const input = narrativeValuation();
    const condition = "Modeled conditions: A change in product mix would be required. [edgar:10-Q item2 · 2026-04-30]";
    input.scenarios[0].whatWouldHaveToBeTrue = [condition];
    const result = applyScenarioPresentation(input, computed);
    expect(result.scenarios[0].whatWouldHaveToBeTrue[0]).not.toBe(condition);
    expect(result.scenarios[0].qualitativeCommentary).toContain(
      `Separate qualitative condition, not a modeled input or prerequisite for this target: ${condition}`,
    );
    expect(input.scenarios[0].whatWouldHaveToBeTrue).toEqual([condition]);
    expect(applyScenarioPresentation(result, computed)).toEqual(result);
  });
  it("retains an appended analyst condition even when the first condition exactly matches generated text", () => {
    const computed = computedFixture();
    const input = narrativeValuation();
    const generated = applyScenarioPresentation(input, computed).scenarios[0].whatWouldHaveToBeTrue;
    const extra = "A separately stated product-mix change remains possible. [edgar:10-Q item2 · 2026-04-30]";
    input.scenarios[0].whatWouldHaveToBeTrue = [...generated, extra];
    const result = applyScenarioPresentation(input, computed);
    expect(result.scenarios[0].qualitativeCommentary).toContain(
      `Separate qualitative condition, not a modeled input or prerequisite for this target: ${extra}`,
    );
    expect(applyScenarioPresentation(result, computed)).toEqual(result);
  });
  it.each([false, true])("separates unmodeled deterioration from actual lower-growth bear inputs (margin cap %s)", capped => {
    const computed = computedFixture();
    if (computed.scenarioTargets.status !== "available") throw Error("scenario fixture");
    if (computed.valuation.kind !== "dcf" || !computed.valuation.assumptions) throw Error("DCF fixture");
    if (!capped) computed.valuation.assumptions.scenarioMarginCeiling = null;
    computed.scenarioTargets.targets.find(t => t.name === "bear")!.marginDeltaPp = 1;
    const input = narrativeValuation();
    const claim = "A sustained deterioration in operating margins or capital efficiency would be required.";
    input.scenarios.find(s => s.name === "bear")!.whatWouldHaveToBeTrue = [claim];
    const before = JSON.stringify(computed);
    const result = applyScenarioPresentation(input, computed);
    const bear = result.scenarios.find(s => s.name === "bear")!;
    expect(bear.whatWouldHaveToBeTrue.join(" ")).toContain(`revenue growth -2 percentage points, operating margin ${capped ? 0 : 1} percentage points`);
    if (capped) expect(bear.whatWouldHaveToBeTrue.join(" ")).toContain("after the scenario margin cap (1 requested)");
    expect(bear.whatWouldHaveToBeTrue.join(" ")).toMatch(/capital efficiency.*WACC.*base/i);
    expect(bear.whatWouldHaveToBeTrue.join(" ")).not.toContain("deterioration");
    expect(bear.qualitativeCommentary?.some(c => c.includes(claim) && /not a modeled input/i.test(c))).toBe(true);
    expect(JSON.stringify(computed)).toBe(before);
    expect(applyScenarioPresentation(result, computed)).toEqual(result);
  });
  it.each([
    [[110, 120, 115, 125], "robust-above"],
    [[80, 90, 85, 95], "robust-below"],
    [[90, 120, 85, 110], "sensitive"],
    [[100, 120, 110, 115], "sensitive"],
    [[null, 120, 110, 115], "unavailable"],
  ] as const)("classifies only the available modeled cells: %j", (values, status) => {
    const result = summarizeSensitivity(grid([...values]), 100);
    expect(result.status).toBe(status);
    expect(result.conclusion).toContain("within the modeled grid");
    expect(result.validCells).toBe(values.filter((value) => value !== null).length);
  });

  it.each([null, 0, Number.NaN, Number.POSITIVE_INFINITY])("withholds a conclusion without a usable comparable price: %s", (price) => {
    expect(summarizeSensitivity(grid([80, 90, 85, 95]), price).status).toBe("unavailable");
  });

  it("does not call a missing or one-axis grid robust and excludes malformed cells", () => {
    expect(summarizeSensitivity([], 100)).toMatchObject({ status: "unavailable", validCells: 0, minPerShare: null, maxPerShare: null });
    expect(summarizeSensitivity(grid([null, null, null, 110]), 100).status).toBe("unavailable");
    expect(summarizeSensitivity(grid([110, 120]), 100).status).toBe("unavailable");
    const result = summarizeSensitivity([...grid([90, 120, 85, 110]), { waccPct: NaN, gTermPct: 2, perShare: 99999 }], 100);
    expect(result).toMatchObject({ validCells: 4, totalCells: 5, minPerShare: 85, maxPerShare: 120 });
  });

  it("does not infer the missing corners of a sparse grid from its diagonal", () => {
    const diagonal = [{ waccPct: 8, gTermPct: 2, perShare: 110 }, { waccPct: 9, gTermPct: 3, perShare: 120 }];
    expect(summarizeSensitivity(diagonal, 100)).toMatchObject({ status: "unavailable", validCells: 2 });
    expect(summarizeSensitivity(diagonal.map((cell) => ({ ...cell, gTermPct: 2 })), 100).status).toBe("unavailable");
  });

  it("withholds weights without real projections rather than preserving model odds", () => {
    const valuation = { scenarios: ["bull", "base", "bear"].map((name) => ({ name, probability: 0.5, assumptions: ["invented growth 99%"], whatWouldHaveToBeTrue: [], priceTarget: null, horizon: "n/a" })) } as unknown as Valuation;
    const computed = { projections: { series: [], scenarioWeights: { bull: 0.25, base: 0.5, bear: 0.25 } }, valuation: { kind: "reit" } } as unknown as ComputedMetrics;
    const result = applyScenarioPresentation(valuation, computed, false);
    expect(result.scenarios.map((s) => s.probability)).toEqual([null, null, null]);
    expect(result.scenarios.every((s) => s.qualitativeCommentary?.length === 0)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("99%");
  });

  it("does not describe an unused projection prior when there are no projection series", () => {
    const computed = computedFixture();
    computed.projections.series = [];
    const before = JSON.stringify(computed.projections);
    const presentation = buildScenarioPresentation(computed);
    expect(presentation.weightBasis).not.toContain("25/50/25");
    expect(presentation.weightBasis).not.toContain("display prior applies");
    expect(presentation.weightBasis).toContain("No weighted operating projections are available");
    expect(presentation.weightBasis).toContain("no probability-weighted value is implied");
    expect(JSON.stringify(computed.projections)).toBe(before);
  });

  it("retains the uncalibrated projection prior only alongside real projection series", () => {
    const computed = computedFixture();
    expect(computed.projections.series.length).toBeGreaterThan(0);
    const before = JSON.stringify(computed.projections);
    const presentation = buildScenarioPresentation(computed);
    expect(presentation.weightBasis).toContain("25/50/25");
    expect(presentation.weightBasis).toContain("not a calibrated probability");
    expect(JSON.stringify(computed.projections)).toBe(before);
  });

  it("uses the actual quote near rounding boundaries and withholds a currency-incomparable quote", () => {
    const computed = { fairValue: { status: "available", perShare: { value: 0.01 }, upsidePct: -99.985 } } as unknown as ComputedMetrics;
    const bundle = { quote: { ok: true, value: { data: { rows: [{ price: 99.99 }] } } } } as DataBundle;
    expect(comparableScenarioPrice(computed, bundle)).toBe(99.99);
    computed.fairValue.upsidePct = null;
    expect(comparableScenarioPrice(computed, bundle)).toBeNull();
  });

  it.each([null, Number.NaN, 0, -1])("withholds an absent, invalid or nonpositive market quote: %s", (price) => {
    const computed = computedFixture();
    const bundle = { quote: { ok: true, value: { data: { rows: [{ price }] } } } } as DataBundle;
    expect(comparableScenarioPrice(computed, bundle)).toBeNull();
  });

  it("withholds a failed quote request and a suppressed or incomplete fair value", () => {
    const computed = computedFixture();
    const bundle = completeCurrencyBundle({});
    expect(comparableScenarioPrice(computed, { quote: { ok: false, gap: { field: "quote", reason: "offline", severity: "warn" } } })).toBeNull();
    if (bundle.quote.ok) bundle.quote.value.data.rows = [];
    expect(comparableScenarioPrice(computed, bundle)).toBeNull();
    computed.fairValue.status = "suppressed";
    expect(comparableScenarioPrice(computed, completeCurrencyBundle({}))).toBeNull();
    computed.fairValue.status = "available";
    computed.fairValue.perShare = null;
    expect(comparableScenarioPrice(computed, completeCurrencyBundle({}))).toBeNull();
  });

  it.each([true, false])("keeps displayed paths, fixed inputs and qualitative commentary distinct (midyear %s)", (midYear) => {
    const computed = computedFixture();
    if (computed.valuation.kind !== "dcf" || !computed.valuation.assumptions) throw new Error("fixture DCF");
    computed.valuation.assumptions.midYear.value = midYear;
    const input = narrativeValuation();
    input.scenarios[0].qualitativeCommentary = ["previous qualitative comment"];
    const before = JSON.stringify(computed);
    const result = applyScenarioPresentation(input, computed);
    // Re-pinned for D-60: targets carry no weight, and the ±2pp shock decays (weights 1, 0.44, 0 over three years).
    expect(result.scenarios.map((scenario) => scenario.probability)).toEqual([null, null, null]);
    expect(result.scenarios[0].assumptions.join(" ")).toContain("12.13, 6.88, 2");
    expect(result.scenarios[1].assumptions.join(" ")).toContain("10.13, 6, 2");
    expect(result.scenarios[2].assumptions.join(" ")).toContain("8.13, 5.12, 2");
    expect(result.scenarios[0].assumptions.join(" ")).toContain(`mid-year discounting ${midYear ? "on" : "off"}`);
    expect(result.scenarios[0].assumptions.join(" ")).toContain("minority interest not disclosed");
    expect(result.scenarios[0].assumptions.join(" ")).toContain("preferred equity 0");
    expect(result.scenarios[0].qualitativeCommentary).toContain("previous qualitative comment");
    expect(result.scenarios[1].qualitativeCommentary).toContain("model base commentary");
    expect(result.scenarios[0].whatWouldHaveToBeTrue[0]).toContain("revenue growth 2 percentage points");
    expect(result.scenarios[0].qualitativeCommentary?.at(-1)).toContain("not a modeled input or prerequisite for this target: demand remains stable");
    expect(JSON.stringify(computed)).toBe(before);
    expect(input.scenarios[1].assumptions).toEqual(["model base commentary"]);
  });

  it.each([
    { bull: -0.1, base: 0.6, bear: 0.5 },
    { bull: 1.1, base: 0, bear: 0 },
    { bull: 0.25, base: 0.5, bear: 0.2 },
    { bull: Number.NaN, base: 0.5, bear: 0.25 },
  ])("refuses invalid or nonpartitioned computed weights: %j", (weights) => {
    const computed = computedFixture();
    computed.projections.scenarioWeights = weights;
    expect(applyScenarioPresentation(narrativeValuation(), computed).scenarios.map((scenario) => scenario.probability)).toEqual([null, null, null]);
  });

  it.each(["assumptions", "dcf", "target"] as const)("does not display numerical scenario inputs without the %s", (missing) => {
    const computed = computedFixture();
    if (computed.valuation.kind !== "dcf") throw new Error("fixture DCF");
    if (missing === "target") {
      computed.scenarioTargets.targets[0].perShare = null;
      delete computed.projections.scenarioAssumptions;
    }
    else computed.valuation[missing] = null;
    const result = applyScenarioPresentation(narrativeValuation(), computed);
    expect(result.scenarios[0].assumptions.join(" ")).toMatch(/inputs unavailable/);
    expect(result.scenarios[0].assumptions.join(" ")).not.toContain("Revenue growth path");
  });

  it("uses the stored grid for its conclusion and discloses unavailable scenarios without inventing a DCF", () => {
    const computed = computedFixture();
    if (computed.valuation.kind !== "dcf") throw new Error("fixture DCF");
    computed.valuation.sensitivity = { waccPcts: [8, 9], gTermPcts: [2, 3], perShare: [[110, 120], [115, 125]], notes: [], gaps: [] };
    // D-65: the growth × margin grid now joins the conclusion (tests/stageB.valuationD65.test.ts);
    // this test pins the WACC × g rule alone, so the fixture's second grid is removed.
    computed.valuation.growthMarginGrid = null;
    const available = buildScenarioPresentation(computed, 100);
    expect(available.sensitivity).toMatchObject({ status: "robust-above", minPerShare: 110, maxPerShare: 125, validCells: 4 });
    expect(available.interpretation).toMatch(/present-value DCF sensitivities/);
    // Re-pinned for D-60: the basis says targets carry no weight and the projection prior is not calibrated.
    expect(available.weightBasis).toMatch(/carry no weight/);
    expect(available.weightBasis).toMatch(/not a calibrated probability/);
    const unavailable = buildScenarioPresentation({} as ComputedMetrics);
    expect(unavailable.sensitivity).toMatchObject({ status: "unavailable", minPerShare: null, maxPerShare: null });
    expect(unavailable.interpretation).toMatch(/scenarios are unavailable/);
  });
});
