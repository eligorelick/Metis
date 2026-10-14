import { describe, expect, it } from "vitest";
import { summarizeSensitivity, applyScenarioPresentation, comparableScenarioPrice, buildScenarioPresentation } from "@/report/scenarioPresentation";
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
    expect(result.scenarios.map((scenario) => scenario.probability)).toEqual([0.25, 0.5, 0.25]);
    expect(result.scenarios[0].assumptions.join(" ")).toContain("12.13, 8, 4");
    expect(result.scenarios[1].assumptions.join(" ")).toContain("10.13, 6, 2");
    expect(result.scenarios[2].assumptions.join(" ")).toContain("8.13, 4, 0");
    expect(result.scenarios[0].assumptions.join(" ")).toContain(`mid-year discounting ${midYear ? "on" : "off"}`);
    expect(result.scenarios[0].assumptions.join(" ")).toContain("minority interest not disclosed");
    expect(result.scenarios[0].assumptions.join(" ")).toContain("preferred equity 0");
    expect(result.scenarios[0].qualitativeCommentary).toEqual(["previous qualitative comment"]);
    expect(result.scenarios[1].qualitativeCommentary).toEqual(["model base commentary"]);
    expect(result.scenarios[0].whatWouldHaveToBeTrue).toEqual(["demand remains stable"]);
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
    if (missing === "target") computed.scenarioTargets.targets[0].perShare = null;
    else computed.valuation[missing] = null;
    const result = applyScenarioPresentation(narrativeValuation(), computed);
    expect(result.scenarios[0].assumptions.join(" ")).toMatch(/inputs unavailable/);
    expect(result.scenarios[0].assumptions.join(" ")).not.toContain("Revenue growth path");
  });

  it("uses the stored grid for its conclusion and discloses unavailable scenarios without inventing a DCF", () => {
    const computed = computedFixture();
    if (computed.valuation.kind !== "dcf") throw new Error("fixture DCF");
    computed.valuation.sensitivity = { waccPcts: [8, 9], gTermPcts: [2, 3], perShare: [[110, 120], [115, 125]], notes: [], gaps: [] };
    const available = buildScenarioPresentation(computed, 100);
    expect(available.sensitivity).toMatchObject({ status: "robust-above", minPerShare: 110, maxPerShare: 125, validCells: 4 });
    expect(available.interpretation).toMatch(/present-value DCF sensitivities/);
    expect(available.weightBasis).toMatch(/uncalibrated/);
    const unavailable = buildScenarioPresentation({} as ComputedMetrics);
    expect(unavailable.sensitivity).toMatchObject({ status: "unavailable", minPerShare: null, maxPerShare: null });
    expect(unavailable.interpretation).toMatch(/scenarios are unavailable/);
  });
});
