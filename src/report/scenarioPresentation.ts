/** Report presentation only: no valuation formulas, probabilities or grades are fitted here. */
import type { ComputedMetrics } from "@/pipeline/compute";
import type { DataBundle } from "@/pipeline/types";
import { perturbScenarioAssumptions } from "@/pipeline/stageB/projections";
import type { Report, Scenario, ScenarioPresentation, SensitivityCell, Valuation } from "@/report/schema";
import { computeDcfDisplay, type DcfDisplay } from "@/pipeline/stageB/fairValue";
import { NCI_EARNINGS_KEY_MATERIALITY_PCT, noncontrollingProfitShareText, type DcfBridge } from "@/pipeline/stageB/valuation";
import { projectionAvailability } from "@/report/surfaceManifest";

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * Keep legacy synthetic sample targets from appearing as computed outputs.
 * The stored fixture remains unchanged; only the demo's display copy is adjusted.
 */
export function prepareSampleReport(report: Report): Report {
  if (report.scenarioTargets?.status === "available") return report;

  return {
    ...report,
    valuation: {
      ...report.valuation,
      scenarios: report.valuation.scenarios.map((scenario) => ({
        ...scenario,
        priceTarget: null,
        horizon: "n/a",
      })),
    },
  };
}

/**
 * D-60: price targets carry no weight. A 25/50/25 weight beside each target
 * implied a weighted value (NVDA report #34: ≈$284, above the quote) that the
 * report never showed and the grade contradicted. The display prior now
 * belongs to the weighted operating projections alone, and this is the one
 * place the report says it is not a calibrated probability.
 */
const WEIGHT_BASIS = "Scenario price targets carry no weight: bull and bear are DCF sensitivities around the base value, so no probability-weighted value is implied.";

/** D-65: the year-one growth × sustained margin grid, as the DCF display carries it. */
export interface GrowthMarginCells { growthShiftsPp: number[]; marginShiftsPp: number[]; perShare: (number | null)[][] }

const pp = (v: number): string => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}pp`;

/** "growth −20pp at margin −10pp to 0pp; growth −10pp at margin −10pp": the growth × margin cells on one side of the price. */
function describeGrowthMarginCells(grid: GrowthMarginCells, pick: (v: number) => boolean): string {
  return grid.growthShiftsPp.flatMap((g, i) => {
    const margins = grid.marginShiftsPp.filter((_, j) => { const v = grid.perShare[i]?.[j]; return finite(v) && pick(v); });
    if (margins.length === 0) return [];
    return [`growth ${pp(g)} at margin ${margins.length === 1 ? pp(margins[0]) : `${pp(margins[0])} to ${pp(margins[margins.length - 1])}`}`];
  }).join("; ");
}

/**
 * A statement about the tested grids only, never an error bar or confidence
 * interval. D-65: both grids decide it. NVDA report #34 rerun called the value
 * "robust" because every WACC × terminal-growth cell sat above the price while
 * four year-one-growth × margin cells sat below it; the grid that varies the
 * decisive inputs now counts, and the conclusion names the cells that cross.
 * Growth × margin cells withheld above the scenario margin ceiling are not
 * part of that grid's tested range.
 */
export function summarizeSensitivity(cells: SensitivityCell[], currentPrice: number | null, growthMargin?: GrowthMarginCells | null): ScenarioPresentation["sensitivity"] {
  const valid = cells.filter((cell) => finite(cell.waccPct) && finite(cell.gTermPct) && finite(cell.perShare));
  const gmValues = growthMargin ? growthMargin.perShare.flat().filter((v): v is number => finite(v)) : [];
  const gmTotal = growthMargin ? growthMargin.perShare.flat().length : 0;
  const values = [...valid.map((cell) => cell.perShare as number), ...gmValues];
  const minPerShare = values.length ? Math.min(...values) : null;
  const maxPerShare = values.length ? Math.max(...values) : null;
  const common = { validCells: valid.length + gmValues.length, totalCells: cells.length + gmTotal, minPerShare, maxPerShare };
  if (!finite(currentPrice) || currentPrice <= 0 || valid.length < 2 || new Set(valid.map((c) => c.waccPct)).size < 2 || new Set(valid.map((c) => c.gTermPct)).size < 2) {
    return { ...common, status: "unavailable", conclusion: "Sensitivity conclusion unavailable: a comparable current price and valid values spanning both modeled grid axes are required. Missing or invalid cells are excluded." };
  }
  // Comparisons at the quote are sensitive; avoid a robustness claim at a
  // numerical boundary after reconstructing a comparable price from upside.
  const tolerance = Math.max(1, Math.abs(currentPrice)) * 1e-10;
  const above = (v: number) => v > currentPrice + tolerance;
  const below = (v: number) => v < currentPrice - tolerance;
  const status = values.every(above) ? "robust-above" : values.every(below) ? "robust-below" : "sensitive";
  const expectedCells = new Set(cells.map((cell) => cell.waccPct)).size * new Set(cells.map((cell) => cell.gTermPct)).size;
  const uniqueValidCells = new Set(valid.map((cell) => `${cell.waccPct}:${cell.gTermPct}`)).size;
  if (status !== "sensitive" && (valid.length !== cells.length || uniqueValidCells !== expectedCells)) {
    return { ...common, status: "unavailable", conclusion: "All available modeled cells lie on the same side of the current price, but the incomplete grid prevents a robustness conclusion within the modeled grid. Missing or invalid cells are excluded." };
  }
  const waccBelow = valid.filter((c) => !above(c.perShare as number));
  const waccText = waccBelow.length === 0
    ? `all ${valid.length} WACC × terminal-growth cells stay above the current price`
    : waccBelow.length === valid.length
      ? `all ${valid.length} WACC × terminal-growth cells sit at or below the current price`
      : `${waccBelow.length} of ${valid.length} WACC × terminal-growth cells sit at or below the current price (WACC ${[...new Set(waccBelow.map((c) => `${(c.waccPct).toFixed(1)}%`))].join(", ")})`;
  const gmBelow = gmValues.filter((v) => !above(v)).length;
  const gmText = growthMargin === null || growthMargin === undefined || gmValues.length === 0 ? "" :
    gmBelow === 0
      ? `; all ${gmValues.length} valid year-one growth × margin cells stay above it`
      : `; ${gmBelow} of ${gmValues.length} valid year-one growth × margin cells sit at or below it (${describeGrowthMarginCells(growthMargin, (v) => !above(v))})`;
  const conclusion = status === "sensitive"
    ? `The valuation-versus-price conclusion is sensitive within the modeled grids: ${waccText}${gmText}.`
    : `The valuation-versus-price conclusion is robust within the modeled grids: every valid cell of ${gmValues.length > 0 ? "both grids" : "the grid"} remains ${status === "robust-above" ? "above" : "below"} the current price.`;
  const scope = gmValues.length > 0
    ? `The WACC × terminal-growth and year-one growth × sustained-margin grids are assessed (growth × margin cells withheld above the scenario margin ceiling are excluded)`
    : "Only available WACC-by-terminal-growth cells are assessed";
  return { ...common, status, conclusion: `${conclusion} ${scope}; this is not a statistical confidence interval or a future-price range.` };
}

/**
 * Audit 2026-10-22 C-11: the excess-return route's start-return × cost-of-equity
 * grid read against the price, on the same rules as the DCF grids: a robustness
 * claim needs every cell valid, and missing cells are excluded.
 */
export function summarizeExcessReturnGrid(grid: NonNullable<DcfDisplay["excessReturnGrid"]>, currentPrice: number | null): ScenarioPresentation["sensitivity"] {
  const all = grid.perShare.flat();
  const values = all.filter((v): v is number => finite(v));
  const common = { validCells: values.length, totalCells: all.length,
    minPerShare: values.length ? Math.min(...values) : null, maxPerShare: values.length ? Math.max(...values) : null };
  if (!finite(currentPrice) || currentPrice <= 0 || values.length < 2) {
    return { ...common, status: "unavailable", conclusion: "Sensitivity conclusion unavailable: a comparable current price and at least two valid cells of the starting-return × cost-of-equity grid are required. Missing or invalid cells are excluded." };
  }
  const tolerance = Math.max(1, Math.abs(currentPrice)) * 1e-10;
  const atOrBelow = values.filter((v) => v <= currentPrice + tolerance).length;
  const status = atOrBelow === 0 ? "robust-above" : values.every((v) => v < currentPrice - tolerance) ? "robust-below" : "sensitive";
  if (status !== "sensitive" && values.length !== all.length) {
    return { ...common, status: "unavailable", conclusion: "All available cells of the starting-return × cost-of-equity grid lie on the same side of the current price, but the incomplete grid prevents a robustness conclusion. Missing or invalid cells are excluded." };
  }
  const conclusion = status === "sensitive"
    ? `The valuation-versus-price conclusion is sensitive within the starting-return × cost-of-equity grid: ${atOrBelow} of ${values.length} cells sit at or below the current price.`
    : `The valuation-versus-price conclusion is robust within the starting-return × cost-of-equity grid: all ${values.length} cells remain ${status === "robust-above" ? "above" : "below"} the current price.`;
  return { ...common, status, conclusion: `${conclusion} The rows are the starting returns shown beside it, the columns the cost of equity ±1pp; this is not a statistical confidence interval or a future-price range.` };
}

/** Use the actual quote only when Stage B established its currency/share basis. */
export function comparableScenarioPrice(computed: ComputedMetrics, bundle: Pick<DataBundle, "quote">): number | null {
  const fv = computed.fairValue;
  if (fv?.status !== "available" || !finite(fv.perShare?.value) || !finite(fv.upsidePct)) return null;
  const price = bundle.quote.ok ? bundle.quote.value.data.rows[0]?.price : null;
  return finite(price) && price > 0 ? price : null;
}

export function buildScenarioPresentation(computed: ComputedMetrics, currentPrice: number | null = null): ScenarioPresentation {
  const display = computed.valuation ? computeDcfDisplay(computed.valuation) : null;
  const cells = display?.sensitivityGrid ?? [];
  const entityAvailable = finite(display?.bridge?.enterpriseValue) && (display?.forecastRows?.length ?? 0) > 0;
  const projections = projectionAvailability(computed.projections?.series ?? []);
  return {
    methodVersion: "SCENARIO_PRESENTATION_2026_10",
    weightBasis: `${WEIGHT_BASIS} ${projections.weighted
      ? "The fixed 25/50/25 display prior applies only to the weighted operating projections and is not a calibrated probability."
      : "No weighted operating projections are available; no projection weights are applied."}`,
    interpretation: computed.scenarioTargets?.status === "available"
      ? "Scenario values are present-value DCF sensitivities over the explicit operating horizon. Growth and margin paths use the shifts that generated each labeled target; all other model inputs remain at base. Model commentary is qualitative and does not set those inputs."
      : entityAvailable
        ? `${projections.forward ? "Entity DCF and numerical operating scenario paths are available" : "Entity DCF is available; numerical operating scenario paths are unavailable"}; per-share scenario targets are withheld. Any model commentary is qualitative; no future-price probability is implied.`
        : "Computational DCF scenarios are unavailable for this route or its inputs. Any model commentary is qualitative; no numerical scenario or future-price probability is implied.",
    sensitivity: cells.length === 0 && display?.excessReturnGrid
      ? summarizeExcessReturnGrid(display.excessReturnGrid, currentPrice)
      : summarizeSensitivity(cells, currentPrice, display?.growthMarginGrid ?? null),
  };
}

/**
 * E-5: the minority-interest claim each scenario path deducts. Above the
 * threshold a path's own consolidated equity decides between book and the
 * earnings key, so the base path's choice does not describe the others.
 */
export function fixedBridgeMinorityText(bridge: DcfBridge, claim: (v: number | null) => string): string {
  const share = bridge.noncontrollingEarningsShare;
  return share !== undefined && share * 100 > NCI_EARNINGS_KEY_MATERIALITY_PCT
    ? `the larger of its book value ${claim(bridge.minorityInterest)} and its ${noncontrollingProfitShareText(bridge)} × each path's consolidated equity value`
    : claim(bridge.minorityInterest);
}

/** The minority-interest and preferred clauses of the fixed-bridge sentence, each naming its temporary-equity part (FIN-119). */
export function fixedBridgeClaimsText(bridge: DcfBridge, claim: (v: number | null) => string, display: (v: number) => string): string {
  const temporary = bridge.temporaryEquity;
  return `minority interest ${fixedBridgeMinorityText(bridge, claim)}${temporaryEquityText(temporary?.redeemableNoncontrolling, "redeemable noncontrolling interests", display)}, ` +
    `preferred equity ${claim(bridge.preferred)}${temporaryEquityText(temporary === undefined ? undefined : temporary.redeemablePreferred + temporary.unsplit, "redeemable preferred and other temporary equity", display)}`;
}

/** FIN-119: names the temporary-equity claim inside a bridge line, when there is one. */
function temporaryEquityText(amount: number | undefined, label: string, display: (v: number) => string): string {
  return amount === undefined || amount === 0 ? "" : ` (including ${label} of ${display(amount)})`;
}

/**
 * The non-operating lines each scenario path carries unchanged: assets added,
 * then the investment tax and any E-7 obligations subtracted.
 */
export function fixedBridgeNonOperatingText(bridge: DcfBridge, display: (v: number) => string): string {
  if (bridge.nonOperatingAssets === undefined) return "";
  const components = bridge.nonOperatingComponents ?? [];
  if (components.length === 0) return `, plus non-operating marketable equity securities ${display(bridge.nonOperatingAssets)}`;
  // E-7: an obligation from an earlier filing keeps its balance date; FIN-305: a line deducted after tax keeps saying so.
  const name = (label: string) => {
    const at = /; balance at (\d{4}-\d{2}-\d{2})/.exec(label);
    return label.replace(/ \(.*\)$/, "") + (/\(filed, after tax at /.test(label) ? " after tax" : "") + (at === null ? "" : ` (balance at ${at[1]})`);
  };
  const added = components.filter((c) => c.value >= 0).map((c) => `${name(c.label)} ${display(c.value)}`);
  return (added.length > 0 ? `, plus non-operating ${added.join(" and ")}` : "") +
    components.filter((c) => c.value < 0).map((c) => `, less ${name(c.label)} ${display(-c.value)}`).join("");
}

function deterministicAssumptions(computed: ComputedMetrics, name: Scenario["name"]): string[] {
  const targets = computed.scenarioTargets;
  const target = targets?.status === "available" ? targets.targets.find((entry) => entry.name === name) : undefined;
  const scenarioInputs = target?.perShare != null ? target : computed.projections?.scenarioAssumptions?.scenarios.find(entry => entry.name === name);
  const valuation = computed.valuation;
  if (!scenarioInputs || valuation?.kind !== "dcf" || !valuation.assumptions || !valuation.dcf) {
    return ["Deterministic scenario inputs unavailable for this route or target; see the missing-data manifest."];
  }
  const a = name === "base" ? valuation.assumptions : perturbScenarioAssumptions(valuation.assumptions, scenarioInputs.growthDeltaPp, scenarioInputs.marginDeltaPp);
  const display = (value: number) => Number(value.toFixed(2)).toString();
  const path = (xs: number[]) => xs.map(display).join(", ");
  const bridge = valuation.dcf.bridge;
  const known = (v: number | null) => v === null ? "unavailable" : display(v);
  const claim = (v: number | null) => v === null ? "not disclosed; model uses 0" : display(v);
  // D-65: the margin shift the path carries after the scenario cap, beside the
  // shock requested (NVDA bull: +10.12pp requested, 0 after the 65.21% cap).
  const effectiveMargin = (a.ebitMarginPath.value[0] ?? 0) - (valuation.assumptions.ebitMarginPath.value[0] ?? 0);
  const marginText = Math.abs(effectiveMargin - scenarioInputs.marginDeltaPp) < 0.005
    ? `operating margin ${display(scenarioInputs.marginDeltaPp)} percentage points`
    : `operating margin ${display(effectiveMargin)} percentage points after the scenario margin cap (${display(scenarioInputs.marginDeltaPp)} requested)`;
  return [
    "Computed inputs are displayed rounded to two decimal places; valuation calculations retain full precision.",
    `Year-one shift versus base: revenue growth ${display(scenarioInputs.growthDeltaPp)} percentage points, ${marginText}; both decay to zero by year ${a.years}.`,
    `Revenue growth path (% per year, in horizon order): ${path(a.growthPath.value)}.`,
    `Operating-margin path (% per year, in horizon order): ${path(a.ebitMarginPath.value)}.`,
    `Fixed base inputs: starting revenue ${display(a.startRevenue.value)} reporting-currency units; WACC ${display(a.wacc.value)}%; terminal growth actually used ${display(valuation.dcf.gTermUsedPct)}%; terminal ROIC ${display(a.terminal.roicTermPct.value)}%; sales-to-capital ${display(a.salesToCapital.value)}x; tax path (%): ${path(a.taxRatePath.value)}; mid-year discounting ${a.midYear.value ? "on" : "off"}.`,
    `Fixed base equity bridge: net debt ${known(bridge.netDebt)}, ${fixedBridgeClaimsText(bridge, claim, display)}` +
      `${fixedBridgeNonOperatingText(bridge, display)} (reporting-currency units); diluted shares ${known(bridge.dilutedShares)}` +
      `${a.valuationDate === undefined ? "" : `; value stated at the quote date ${a.valuationDate.value}`}.`,
    target?.perShare != null
      ? "Targets are labeled by per-share value; a negative perturbed equity value is floored at zero. No scenario is a future-price forecast."
      : "Operating scenarios use the recorded enterprise-value ordering. Per-share targets and qualitative narratives may be withheld independently; no operating path is a future-price forecast.",
  ];
}

/** Apply after deterministic targets/horizons are injected, on both report paths. */
export function applyScenarioPresentation(valuation: Valuation, computed: ComputedMetrics, preserveCommentary = true): Valuation {
  return {
    ...valuation,
    scenarios: valuation.scenarios.map((scenario) => {
      const assumptions = deterministicAssumptions(computed, scenario.name);
      const modeled = assumptions.length > 1;
      const modeledConditions = modeled ? [`Modeled conditions: ${assumptions[1]} Capital efficiency (sales-to-capital), WACC, tax path and terminal assumptions stay at base. Additional qualitative conditions are not numerical prerequisites for this target.`] : [...scenario.whatWouldHaveToBeTrue];
      // A model-authored prefix is not proof of an earlier presentation pass.
      // Match the complete generated array so fresh text/citations survive.
      const alreadySeparated = modeled && scenario.whatWouldHaveToBeTrue.length === modeledConditions.length &&
        scenario.whatWouldHaveToBeTrue.every((condition, i) => condition === modeledConditions[i]);
      const separateConditions = modeled && !alreadySeparated ? scenario.whatWouldHaveToBeTrue.map(condition =>
        `Separate qualitative condition, not a modeled input or prerequisite for this target: ${condition}`) : [];
      return {
        ...scenario,
        // D-60: no weight on a price target (see WEIGHT_BASIS).
        probability: null,
        assumptions,
        // D-93: target prerequisites come from the actual recorded shifts, not
        // analyst text that may describe an unrelated margin/efficiency stress.
        whatWouldHaveToBeTrue: modeledConditions,
        qualitativeCommentary: preserveCommentary ? [...(scenario.qualitativeCommentary ?? scenario.assumptions), ...separateConditions] : [],
      };
    }),
  };
}
