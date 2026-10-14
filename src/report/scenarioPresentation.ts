/** Report presentation only: no valuation formulas, probabilities or grades are fitted here. */
import type { ComputedMetrics } from "@/pipeline/compute";
import type { DataBundle } from "@/pipeline/types";
import { perturbScenarioAssumptions } from "@/pipeline/stageB/projections";
import type { Scenario, ScenarioPresentation, SensitivityCell, Valuation } from "@/report/schema";
import { computeDcfDisplay } from "@/pipeline/stageB/fairValue";

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const WEIGHT_BASIS = "Fixed, uncalibrated display prior shared with the operating projections; these weights are not estimated probabilities of future prices or outcomes.";

/** A statement about the tested grid only, never an error bar or confidence interval. */
export function summarizeSensitivity(cells: SensitivityCell[], currentPrice: number | null): ScenarioPresentation["sensitivity"] {
  const valid = cells.filter((cell) => finite(cell.waccPct) && finite(cell.gTermPct) && finite(cell.perShare));
  const values = valid.map((cell) => cell.perShare as number);
  const minPerShare = values.length ? Math.min(...values) : null;
  const maxPerShare = values.length ? Math.max(...values) : null;
  const common = { validCells: valid.length, totalCells: cells.length, minPerShare, maxPerShare };
  if (!finite(currentPrice) || currentPrice <= 0 || values.length < 2 || new Set(valid.map((c) => c.waccPct)).size < 2 || new Set(valid.map((c) => c.gTermPct)).size < 2) {
    return { ...common, status: "unavailable", conclusion: "Sensitivity conclusion unavailable: a comparable current price and valid values spanning both modeled grid axes are required. Missing or invalid cells are excluded." };
  }
  // Comparisons at the quote are sensitive; avoid a robustness claim at a
  // numerical boundary after reconstructing a comparable price from upside.
  const tolerance = Math.max(1, Math.abs(currentPrice)) * 1e-10;
  const status = (minPerShare as number) > currentPrice + tolerance
    ? "robust-above" : (maxPerShare as number) < currentPrice - tolerance ? "robust-below" : "sensitive";
  const expectedCells = new Set(cells.map((cell) => cell.waccPct)).size * new Set(cells.map((cell) => cell.gTermPct)).size;
  const uniqueValidCells = new Set(valid.map((cell) => `${cell.waccPct}:${cell.gTermPct}`)).size;
  if (status !== "sensitive" && (valid.length !== cells.length || uniqueValidCells !== expectedCells)) {
    return { ...common, status: "unavailable", conclusion: "All available modeled cells lie on the same side of the current price, but the incomplete grid prevents a robustness conclusion within the modeled grid. Missing or invalid cells are excluded." };
  }
  const conclusion = status === "sensitive"
    ? "The valuation-versus-price conclusion is sensitive within the modeled grid: valid cells reach or cross the current price."
    : `The valuation-versus-price conclusion is robust within the modeled grid: all valid cells remain ${status === "robust-above" ? "above" : "below"} the current price.`;
  return { ...common, status, conclusion: `${conclusion} Only available WACC-by-terminal-growth cells are assessed; this is not a statistical confidence interval or a future-price range.` };
}

/** Use the actual quote only when Stage B established its currency/share basis. */
export function comparableScenarioPrice(computed: ComputedMetrics, bundle: Pick<DataBundle, "quote">): number | null {
  const fv = computed.fairValue;
  if (fv?.status !== "available" || !finite(fv.perShare?.value) || !finite(fv.upsidePct)) return null;
  const price = bundle.quote.ok ? bundle.quote.value.data.rows[0]?.price : null;
  return finite(price) && price > 0 ? price : null;
}

export function buildScenarioPresentation(computed: ComputedMetrics, currentPrice: number | null = null): ScenarioPresentation {
  const cells = computed.valuation ? computeDcfDisplay(computed.valuation).sensitivityGrid : [];
  return {
    methodVersion: "SCENARIO_PRESENTATION_2026_10",
    weightBasis: WEIGHT_BASIS,
    interpretation: computed.scenarioTargets?.status === "available"
      ? "Scenario values are present-value DCF sensitivities over the explicit operating horizon. Growth and margin paths use the shifts that generated each labeled target; all other model inputs remain at base. Model commentary is qualitative and does not set those inputs."
      : "Computational DCF scenarios are unavailable for this route or its inputs. Any model commentary is qualitative; no numerical scenario or future-price probability is implied.",
    sensitivity: summarizeSensitivity(cells, currentPrice),
  };
}

function deterministicAssumptions(computed: ComputedMetrics, name: Scenario["name"]): string[] {
  const targets = computed.scenarioTargets;
  const target = targets?.status === "available" ? targets.targets.find((entry) => entry.name === name) : undefined;
  const valuation = computed.valuation;
  if (!target || valuation?.kind !== "dcf" || !valuation.assumptions || !valuation.dcf || !target.perShare) {
    return ["Deterministic scenario inputs unavailable for this route or target; see the missing-data manifest."];
  }
  const a = name === "base" ? valuation.assumptions : perturbScenarioAssumptions(valuation.assumptions, target.growthDeltaPp, target.marginDeltaPp);
  const display = (value: number) => Number(value.toFixed(2)).toString();
  const path = (xs: number[]) => xs.map(display).join(", ");
  const bridge = valuation.dcf.bridge;
  const known = (v: number | null) => v === null ? "not disclosed (engine convention applies)" : display(v);
  return [
    "Computed inputs are displayed rounded to two decimal places; valuation calculations retain full precision.",
    `Revenue growth shift versus base: ${display(target.growthDeltaPp)} percentage points; operating-margin shift: ${display(target.marginDeltaPp)} percentage points.`,
    `Revenue growth path (% per year, in horizon order): ${path(a.growthPath.value)}.`,
    `Operating-margin path (% per year, in horizon order): ${path(a.ebitMarginPath.value)}.`,
    `Fixed base inputs: starting revenue ${display(a.startRevenue.value)} reporting-currency units; WACC ${display(a.wacc.value)}%; terminal growth actually used ${display(valuation.dcf.gTermUsedPct)}%; terminal ROIC ${display(a.terminal.roicTermPct.value)}%; sales-to-capital ${display(a.salesToCapital.value)}x; tax path (%): ${path(a.taxRatePath.value)}; mid-year discounting ${a.midYear.value ? "on" : "off"}.`,
    `Fixed base equity bridge: net debt ${known(bridge.netDebt)}, minority interest ${known(bridge.minorityInterest)}, preferred equity ${known(bridge.preferred)} (reporting-currency units); diluted shares ${known(bridge.dilutedShares)}.`,
    "Targets are labeled by per-share value; a negative perturbed equity value is floored at zero. No scenario is a future-price forecast.",
  ];
}

/** Apply after deterministic targets/horizons are injected, on both report paths. */
export function applyScenarioPresentation(valuation: Valuation, computed: ComputedMetrics, preserveCommentary = true): Valuation {
  const weights = computed.projections?.series?.length ? computed.projections.scenarioWeights : undefined;
  const validWeights = weights && [weights.bull, weights.base, weights.bear].every((w) => finite(w) && w >= 0 && w <= 1) && Math.abs(weights.bull + weights.base + weights.bear - 1) <= 1e-8;
  return {
    ...valuation,
    scenarios: valuation.scenarios.map((scenario) => ({
      ...scenario,
      probability: validWeights ? weights[scenario.name] : null,
      assumptions: deterministicAssumptions(computed, scenario.name),
      qualitativeCommentary: preserveCommentary ? [...(scenario.qualitativeCommentary ?? scenario.assumptions)] : [],
    })),
  };
}
