/**
 * P22: the valuation display decisions in src/report/presentation.ts. Each
 * named per-surface EXCEPTION is pinned here, so making two surfaces agree is
 * a deliberate, visible change (see tmp/drift/REPORT.md).
 */
import { describe, expect, it } from "vitest";
import {
  fairValueKeyDataLabel,
  isFairValueKeyDataLabel,
  recordedPerShareLabel,
  scenarioTargetsCaveat,
  scenarioWeightView,
  valuationComparison,
  valuationHeadlineView,
  valuationNoModelWithheldText,
  valuationScenarioView,
  type ValuationSurface,
} from "@/report/presentation";
import type { FairValue, Scenario, ScenarioTargets, TracedNumber, Valuation } from "@/report/schema";

const SURFACES: readonly ValuationSurface[] = ["markdown", "print", "classic", "dossier"];
const perShare: TracedNumber = { value: 123.456, unit: "USD/share", currency: "USD", source: "computed.valuation.dcf.perShare", asOf: "2025-12-31", verified: true };

function fairValue(overrides: Partial<FairValue> = {}): FairValue {
  return { status: "available", method: "fcff-dcf", methodVersion: "T", perShare, upsidePct: 12.35, basis: ["Basis 1234567.891 recorded."], reasons: [], ...overrides };
}
function valuation(upsidePct: number | null = 12.35, ps: TracedNumber | null = perShare): Pick<Valuation, "dcf"> {
  return { dcf: { perShare: ps, upsidePct } as Valuation["dcf"] };
}
function scenario(name: Scenario["name"], probability: number | null, value: number | null): Scenario {
  return { name, probability, horizon: "12 months", assumptions: ["Shared line", `${name} line`], whatWouldHaveToBeTrue: [],
    priceTarget: value === null ? null : { ...perShare, value, source: `computed.scenarioTargets.${name}` } } as Scenario;
}

describe("valuation headline decisions", () => {
  it("rounds and signs the comparison once for every surface", () => {
    for (const surface of [...SURFACES, "key-data"] as const) {
      expect(valuationComparison(perShare, 12.35, surface)?.text).toBe("+12.4%");
      expect(valuationComparison(perShare, -12.35, surface)?.text).toBe("-12.4%");
      expect(valuationComparison(perShare, -0.04, surface)?.text).toBe("0.0%");
      expect(valuationComparison(null, 12.35, surface)).toBeNull();
      expect(valuationComparison(perShare, null, surface)).toBeNull();
    }
    expect(valuationComparison(perShare, 1, "markdown")?.label).toBe("upside");
    expect(valuationComparison(perShare, 1, "classic")?.label).toBe("vs price");
    expect(valuationComparison(perShare, 1, "key-data")?.label).toBe("vs price");
    // EXCEPTION app-zero-tone: a negative value that rounds to zero is toned negative.
    expect(valuationComparison(perShare, -0.04, "classic")?.tone).toBe("neg");
  });

  it("labels the headline per surface (EXCEPTION dossier-label)", () => {
    const labels = (fv: FairValue) => SURFACES.map(surface => valuationHeadlineView(valuation(), fv, surface).label);
    expect(labels(fairValue())).toEqual(["Intrinsic value per share", "Intrinsic value per share", "DCF · intrinsic value / share", "FCFF DCF · model value / share"]);
    expect(labels(fairValue({ method: "excess-return" }))).toEqual(["Model value per share", "Model value per share", "Excess-return · model value / share", "Excess-return · model value / share"]);
    expect(labels(fairValue({ method: null }))[3]).toBe("Recorded model value / share");
    expect(valuationHeadlineView(valuation(), fairValue({ method: "excess-return" }), "print").heading).toBe("Excess-return value");
    expect(valuationHeadlineView(valuation(), fairValue(), "print").heading).toBe("DCF");
  });

  it("keeps the raw trace beside the rounded visible value", () => {
    const view = valuationHeadlineView(valuation(), fairValue(), "markdown");
    expect(view.perShare).toBe(perShare);
    expect(view.valueText).toBe("$123.46");
  });

  it("gives a withheld value's reason in the exports only (EXCEPTION app-withheld-no-reason)", () => {
    for (const surface of SURFACES) {
      const view = valuationHeadlineView(valuation(12.35, null), fairValue(), surface);
      expect(view.valueText).toBeNull();
      expect(view.comparison).toBeNull();
      expect(view.withheldReason === null).toBe(surface === "classic" || surface === "dossier");
    }
  });

  it("prints the withheld sentence in reader form in Markdown only (EXCEPTION markdown-withheld-reader-form)", () => {
    const reference = fairValue({ status: "dated-reference", perShare: null, reference: { perShare: { ...perShare, value: 31.4876543 }, valuationDate: "2025-12-31", quoteDate: "2026-07-20", basis: [] } });
    expect(valuationHeadlineView(valuation(), reference, "markdown").basisCaveat).toContain("31.49");
    for (const surface of ["print", "classic", "dossier"] as const) expect(valuationHeadlineView(valuation(), reference, surface).basisCaveat).toContain("31.4876543");
  });

  it("prints the no-model sentence as stored in Markdown only (EXCEPTION markdown-no-model-reader-form)", () => {
    const reference = fairValue({ status: "dated-reference", perShare: null, reference: { perShare: { ...perShare, value: 31.4876543 }, valuationDate: "2025-12-31", quoteDate: "2026-07-20", basis: [] } });
    expect(valuationNoModelWithheldText(reference, "markdown")).toContain("31.4876543");
    expect(valuationNoModelWithheldText(reference, "print")).toContain("31.49");
    expect(valuationNoModelWithheldText(undefined, "print")).toBeNull();
  });

  it("names the key-data row once (EXCEPTION key-data-unavailable-label)", () => {
    expect(fairValueKeyDataLabel(fairValue(), "shown")).toBe("Model fair value (DCF)");
    expect(fairValueKeyDataLabel(fairValue({ method: null }), "shown")).toBe("Model fair value (DCF)");
    expect(fairValueKeyDataLabel(fairValue({ method: null }), "unavailable")).toBe("Model fair value");
    expect(fairValueKeyDataLabel(fairValue({ method: "excess-return" }), "unavailable")).toBe("Model fair value (excess return)");
    expect(isFairValueKeyDataLabel("Model fair value (DCF)")).toBe(true);
    expect(recordedPerShareLabel({ perShare: null })).toBe("Recorded model value per share (audit only)");
  });
});

describe("scenario row decisions", () => {
  const scenarios = { scenarios: [scenario("bear", 0.25, 36), scenario("bull", 0.25, 52), scenario("base", null, null)] };

  it("orders bull, base, bear in the app and keeps stored order in the exports (EXCEPTION app-scenario-order)", () => {
    expect(valuationScenarioView(scenarios, undefined, "markdown").rows.map(r => r.scenario.name)).toEqual(["bear", "bull", "base"]);
    expect(valuationScenarioView(scenarios, undefined, "classic").rows.map(r => r.scenario.name)).toEqual(["bull", "base", "bear"]);
    const view = valuationScenarioView(scenarios, undefined, "print");
    expect(view.common).toEqual(["Shared line"]);
    expect(view.rows[0]!.assumptions).toEqual(["bear line"]);
    expect(view.rows[2]!.targetText).toBeNull();
  });

  it("words the weight per surface (EXCEPTION app-weight-wording)", () => {
    expect(scenarioWeightView(0.25, false, "markdown")).toMatchObject({ label: "p", text: "25%" });
    expect(scenarioWeightView(null, false, "markdown")).toMatchObject({ label: "p", text: "unavailable" });
    expect(scenarioWeightView(null, false, "classic")).toMatchObject({ label: "p", text: "n/a", unavailableNote: "scenario probability unavailable" });
    expect(scenarioWeightView(0.5, true, "print")).toMatchObject({ label: "display weight", text: "50%" });
    expect(scenarioWeightView(0.5, true, "dossier")).toMatchObject({ label: "Display weight", text: "50%", unavailableNote: "display weight unavailable" });
    // D-60: a computed target with no stored weight shows none.
    for (const surface of SURFACES) expect(scenarioWeightView(null, true, surface)).toBeNull();
  });

  it("prints a weight-basis fallback in the app only (EXCEPTION app-weight-basis-fallback)", () => {
    expect(valuationScenarioView(scenarios, undefined, "markdown").weightBasis).toBeNull();
    expect(valuationScenarioView(scenarios, undefined, "classic").weightBasis).toMatch(/^Narrative probabilities/);
    expect(valuationScenarioView(scenarios, undefined, "classic").heading).toBe("scenarios · probability-weighted (bull / base / bear)");
    expect(valuationScenarioView(scenarios, undefined, "markdown").heading).toBe("Scenarios");
  });

  it("escapes only the recorded parts of the target caveat", () => {
    const available = { status: "available", method: "m<1>", basis: ["b&c"], missingReasons: [] } as unknown as ScenarioTargets;
    expect(scenarioTargetsCaveat(available, text => `[${text}]`)).toBe("Price targets are computed-derived ([m<1>]), not analyst targets. [b&c]");
    const suppressed = { status: "suppressed", method: "m", basis: ["fallback"], missingReasons: [{ reason: "r1" }, { reason: "r2" }] } as unknown as ScenarioTargets;
    expect(scenarioTargetsCaveat(suppressed, text => text)).toBe("Scenario price targets suppressed — r1; r2");
    expect(scenarioTargetsCaveat(undefined, text => text)).toBeNull();
  });
});
