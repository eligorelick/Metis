/**
 * Stage B — weighted forward projections.
 *
 * PURE, deterministic TypeScript: no network, no DB, no LLM. Projects revenue,
 * operating margin, free cash flow (unlevered/FCFF) and diluted EPS forward, in
 * three scenarios (bull / base / bear) plus a display-prior-weighted path.
 *
 * The engine REUSES the DCF's own assumptions rather than inventing a parallel
 * model, so the projection page can never contradict the valuation page:
 *  - the BASE path IS the DCF's forward `DcfYearRow[]` (already analyst-anchored
 *    near-term by buildDcfAssumptions, fading to terminal growth);
 *  - BULL / BEAR re-run the exported `runDcf` with growth shifted by sample σ
 *    from consecutive company history; the margin shift is scaled by the
 *    observed growth/margin correlation rather than assuming perfect covariance;
 *  - the WEIGHTED path uses an explicitly versioned 25/50/25 display prior.
 *    These weights are not presented as empirically calibrated probabilities.
 * Thin or irregular history suppresses the fan instead of inventing dispersion.
 *
 * EPS is the one series not directly a DcfYearRow: it is derived from the
 * forward operating path (EBIT × historical net-income/EBIT ratio) over a
 * buyback-trended diluted-share count, and is disclosed + skipped when those
 * inputs are missing.
 *
 * Every forward number is a TracedNumber sourced "computed.projections.<metric>.
 * <scenario>" (an ESTIMATE by construction — it never comes from model memory).
 * Route-inappropriate cases (banks/insurers/REITs/pre-revenue) return a
 * `notApplicableReason` rather than forcing an FCFF fan.
 */

import type { CompanyRouteResult } from "@/pipeline/stageB/sectorRouting";
import { yearsBetweenDates } from "@/pipeline/stageB/growth";
import {
  MARGIN_CLAMP_PP,
  runDcf,
  type DcfAssumptions,
  type DcfYearRow,
  type ValuationResult,
} from "@/pipeline/stageB/valuation";
import { perShareUnit } from "@/pipeline/stageB/fairValue";
import type { ManifestEntry } from "@/types/core";
import type {
  Projections,
  ProjectionSeries,
  ProjectionPoint,
  ProjectionMetric,
  TracedNumber,
} from "@/report/schema";

/** Forward horizon in years (annual). */
export const PROJECTION_HORIZON_YEARS = 5;
/** Versioned scenario-weight prior, stamped into the report. */
export const PROJECTION_WEIGHTS_VERSION = "UNBACKTESTED_SCENARIO_PRIOR_2026_07" as const;
/** Coarse display prior over the three scenarios (sums to 1; not empirical odds). */
export const PROJECTION_WEIGHTS = { bull: 0.25, base: 0.5, bear: 0.25 } as const;

/** Dispersion multiplier: bull/bear = base ± DISPERSION_K · σ. */
export const DISPERSION_K = 1.0;
/** Upper sanity bounds only; stable firms are no longer forced to show a band. */
const SIGMA_GROWTH_MAX = 25; // pp
const SIGMA_MARGIN_MAX = 12; // pp
/** Perturbed-path sanity clamps. */
const GROWTH_CLAMP: readonly [number, number] = [-30, 60]; // pct/yr
// The margin bound is the BASE engine's own (valuation's MARGIN_CLAMP_PP,
// [-20, 45]), not a second, tighter one. A local [0, 60] floored the perturbed
// path at zero while the base DCF path may legitimately be negative, so for a
// loss-making issuer BOTH the bull and the bear leg were lifted ABOVE the base
// case — a bear scenario that cannot model a loss, and two targets that are
// inflated rather than bracketing. Sharing the bound also makes
// perturbScenarioAssumptions(a, 0, 0) reproduce the base path exactly.

const isNum = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);
const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Sample standard deviation over finite values; null when fewer than 3 observations. */
function stdev(values: number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v));
  if (xs.length < 3) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
}

function correlation(pairs: Array<{ x: number; y: number }>): number | null {
  if (pairs.length < 3) return null;
  const meanX = pairs.reduce((sum, p) => sum + p.x, 0) / pairs.length;
  const meanY = pairs.reduce((sum, p) => sum + p.y, 0) / pairs.length;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (const pair of pairs) {
    const dx = pair.x - meanX;
    const dy = pair.y - meanY;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }
  if (varianceX <= 0 || varianceY <= 0) return 0;
  return clamp(covariance / Math.sqrt(varianceX * varianceY), -1, 1);
}

/** Median over finite values, or null. */
function median(values: number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 0 ? (xs[mid - 1] + xs[mid]) / 2 : xs[mid];
}

/* ------------------------------------------------------------------------ *
 * Inputs
 * ------------------------------------------------------------------------ */

export interface ProjectionIncomeRow {
  date: string;
  revenue: number | null;
  /** EBIT (operating income), FMP names — used for the net-income/EBIT ratio. */
  ebit: number | null;
  netIncome: number | null;
  epsDiluted: number | null;
}

export interface ProjectionFcfRow {
  date: string;
  fcf: number | null;
}

export interface ProjectionsInputs {
  route: CompanyRouteResult;
  /** The valuation result — projections only run on the general DCF route. */
  valuation: ValuationResult;
  waccPct: number | null;
  /**
   * Latest diluted share count (for the EPS series). The per-share DCF bridge
   * for the bull/bear re-runs is `valuation.dcf.bridge`, the base result's own.
   */
  dilutedShares: number | null;
  /** Annual income history (any order). */
  incomeHistory: ProjectionIncomeRow[];
  /** Annual FCF history (any order) — for the FCF fan's historical half. */
  fcfHistory: ProjectionFcfRow[];
  /** Annualised share-count change (percent; negative = buybacks). */
  shareCountAnnualizedPct: number | null;
  /** Currency label for revenue/FCF/EPS units. */
  currency: string | null;
  asOf: string;
}

/* ------------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------------ */

function tn(value: number, unit: string, metric: ProjectionMetric, scenario: string, asOf: string): TracedNumber {
  return {
    value: round2(value),
    unit,
    source: `computed.projections.${metric}.${scenario}`,
    asOf,
    verified: true, // deterministic, computed from sourced inputs (not model memory)
  };
}

function point(period: string, value: number, unit: string, metric: ProjectionMetric, scenario: string, asOf: string): ProjectionPoint {
  return { period, value: tn(value, unit, metric, scenario, asOf) };
}

/** Fiscal-year label from an ISO date; falls back to the raw string. */
function fyLabel(dateIso: string): string {
  const y = Number.parseInt(dateIso.slice(0, 4), 10);
  return Number.isFinite(y) ? `FY${y}` : dateIso;
}

/** Calendar-anniversary model years, not an inferred issuer fiscal calendar. */
function forwardModelWindow(anchor: string | null, year: number, asOf: string): { periodStart: string; periodEnd: string } | null {
  const realDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!anchor || !realDate(anchor) || !realDate(asOf) || anchor > asOf) return null;
  const base = new Date(`${anchor}T00:00:00Z`);
  const month = base.getUTCMonth();
  const day = base.getUTCDate();
  if (base.getUTCFullYear() + year > 9999) return null;
  const anniversary = (offset: number): Date => {
    const targetYear = base.getUTCFullYear() + offset;
    const lastDay = new Date(base);
    lastDay.setUTCFullYear(targetYear, month + 1, 0);
    const shifted = new Date(base);
    shifted.setUTCFullYear(targetYear, month, Math.min(day, lastDay.getUTCDate()));
    return shifted;
  };
  const start = anniversary(year - 1);
  start.setUTCDate(start.getUTCDate() + 1);
  return { periodStart: start.toISOString().slice(0, 10), periodEnd: anniversary(year).toISOString().slice(0, 10) };
}

/** Shift a path by a constant delta with sanity clamps. */
function shiftPath(path: number[], delta: number, lo: number, hi: number): number[] {
  return path.map((v) => clamp(v + delta, lo, hi));
}

/** Weighted blend of three same-length scenario paths. */
function weightedPath(bull: number[], base: number[], bear: number[]): number[] {
  const w = PROJECTION_WEIGHTS;
  return base.map((b, i) => w.bull * bull[i] + w.base * b + w.bear * bear[i]);
}

/** Historical annualized revenue growth from dated oldest→newest observations. */
/**
 * Year-over-year growth for each ANNUAL step, skipping pairs that are not
 * annual steps.
 *
 * A sigma of annual growth must be built from annual intervals: annualizing
 * across a four-year gap yields a smoothed rate whose variance means something
 * else entirely. Skipping the odd pair is right; vetoing the WHOLE estimate
 * because one pair anywhere in the history was irregular — which is what the
 * caller used to do — throws away every good pair with it and suppresses the
 * entire projections fan.
 */
function annualizedGrowthPct(revenues: Array<{ date: string; value: number }>): {
  values: number[];
  skippedPairs: number;
} {
  const values: number[] = [];
  let skippedPairs = 0;
  for (let i = 1; i < revenues.length; i++) {
    const prior = revenues[i - 1];
    const current = revenues[i];
    const years = yearsBetweenDates(prior.date, current.date);
    if (years === null || years < 0.7 || years > 1.3) {
      skippedPairs += 1;
      continue;
    }
    if (prior.value > 0 && current.value > 0) {
      values.push((Math.pow(current.value / prior.value, 1 / years) - 1) * 100);
    }
  }
  return { values, skippedPairs };
}

/* ------------------------------------------------------------------------ *
 * Shared scenario construction — reused by the projection fan (this module)
 * AND the deterministic scenario price targets (scenarioTargets.ts), so the two
 * can never disagree on what "bull"/"bear" mean. Both consume the SAME σ and the
 * SAME clone-and-shift perturbation of the base DCF assumptions.
 * ------------------------------------------------------------------------ */

export interface ScenarioDispersion {
  /** Revenue-growth sample σ, percentage points; null when evidence is too thin. */
  sigmaGrowth: number | null;
  /** Operating-margin sample σ, percentage points; null when evidence is too thin. */
  sigmaMargin: number | null;
  /** Empirical correlation of annual growth and the corresponding margin. */
  growthMarginCorrelation: number | null;
  /** Retained compatibility name: true now means unavailable, never defaulted. */
  growthDefaulted: boolean;
  /** Retained compatibility name: true now means unavailable, never defaulted. */
  marginDefaulted: boolean;
  /** True when any measured series contained a nonconsecutive fiscal interval. */
  irregularHistory: boolean;
  /** How many adjacent revenue pairs were skipped as off-annual (disclosed, never suppressing). */
  skippedPairs: number;
}

/**
 * One effective shock rule for targets and projections. A sigma below the
 * displayed precision cannot support a meaningful sample correlation: tiny
 * growth noise must not amplify into a material correlated margin shift.
 * Keep the measured growth delta; hold only the unsupported margin delta at 0.
 */
export function effectiveScenarioShocks(
  sigmaGrowth: number,
  sigmaMargin: number,
  correlation: number | null,
) {
  const degenerate = round2(sigmaGrowth) === 0 || round2(sigmaMargin) === 0;
  const growthMarginCorrelation = degenerate ? null : correlation;
  return {
    growthDeltaPp: DISPERSION_K * sigmaGrowth,
    marginDeltaPp: DISPERSION_K * sigmaMargin * (growthMarginCorrelation ?? 0),
    growthMarginCorrelation,
    degenerate,
  };
}

/**
 * The company's OWN historical dispersion of revenue growth + operating margin,
 * capped only at an upper sanity bound. Thin history returns null and suppresses
 * the fan/targets rather than fabricating a default band.
 */
export function scenarioDispersion(incomeHistory: ProjectionIncomeRow[]): ScenarioDispersion {
  const incomeAsc = incomeHistory
    .filter((r) => r.date.length > 0)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  const revenueSeries = incomeAsc.flatMap((r) =>
    isNum(r.revenue) ? [{ date: r.date, value: r.revenue }] : []);
  const marginSeries = incomeAsc.flatMap((r) =>
    isNum(r.ebit) && isNum(r.revenue) && r.revenue > 0
      ? [{ date: r.date, value: (r.ebit / r.revenue) * 100 }]
      : []);
  // Per-pair, not all-or-nothing. `hasIrregularAnnualSpacing` returns true if ANY
  // adjacent interval anywhere in the history is off-annual, and that single
  // boolean used to null the entire sigma — suppressing the whole projections
  // fan and the scenario targets built on it. A restated fiscal year (two rows
  // for one period, a zero-length interval) was enough to trigger it, which is
  // why the duplicate collapse above matters here too. Growth now skips the
  // non-annual pairs and keeps the rest; the margin sigma is a stdev of LEVELS,
  // which does not depend on spacing at all once duplicates are gone.
  const growth = annualizedGrowthPct(revenueSeries);
  const rawSigmaG = stdev(growth.values);
  const rawSigmaM = stdev(marginSeries.map((p) => p.value));
  const marginByDate = new Map(marginSeries.map((point) => [point.date, point.value]));
  const paired: Array<{ x: number; y: number }> = [];
  for (let i = 1; i < revenueSeries.length; i++) {
    const prior = revenueSeries[i - 1];
    const current = revenueSeries[i];
    const years = yearsBetweenDates(prior.date, current.date);
    const margin = marginByDate.get(current.date);
    // Annual steps only, for the same reason the growth sigma uses them.
    if (
      years !== null &&
      years >= 0.7 &&
      years <= 1.3 &&
      prior.value > 0 &&
      current.value > 0 &&
      margin !== undefined
    ) {
      paired.push({
        x: (Math.pow(current.value / prior.value, 1 / years) - 1) * 100,
        y: margin,
      });
    }
  }
  return {
    sigmaGrowth: rawSigmaG === null ? null : clamp(rawSigmaG, 0, SIGMA_GROWTH_MAX),
    sigmaMargin: rawSigmaM === null ? null : clamp(rawSigmaM, 0, SIGMA_MARGIN_MAX),
    // `paired` now contains only annual steps, so the correlation no longer
    // needs an all-or-nothing veto either.
    growthMarginCorrelation: correlation(paired),
    growthDefaulted: rawSigmaG === null,
    marginDefaulted: rawSigmaM === null,
    // Retained as a DISCLOSURE — the history did contain off-annual intervals
    // and the reader should know some pairs were excluded — but it no longer
    // suppresses the estimate built from the pairs that were usable.
    irregularHistory: growth.skippedPairs > 0,
    skippedPairs: growth.skippedPairs,
  };
}

/**
 * Clone the base DCF assumptions and shift the growth + operating-margin paths
 * by a constant delta (percentage points), with the same sanity clamps the fan
 * uses. Pure — the caller runs the shifted assumptions through the DCF engine.
 */
export function perturbScenarioAssumptions(
  assumptions: DcfAssumptions,
  growthDelta: number,
  marginDelta: number,
): DcfAssumptions {
  const cloned: DcfAssumptions = structuredClone(assumptions);
  // Same headroom the margin path gets below: clamping the perturbed path with
  // the bound the BASE path already satisfies truncates the bear leg for a
  // low-growth issuer, biasing the fan upward while the disclosure claims the
  // full shock.
  cloned.growthPath.value = shiftPath(
    assumptions.growthPath.value,
    growthDelta,
    GROWTH_CLAMP[0] - Math.abs(growthDelta),
    GROWTH_CLAMP[1] + Math.abs(growthDelta),
  );
  // The base path was ALREADY clamped to MARGIN_CLAMP_PP, so reusing that exact
  // bound as the perturbation's clamp annihilates the shock for any issuer
  // sitting at the boundary: a 45%-margin company's bull leg would be clamped
  // straight back to 45 while the report still claims the full +dm. Give the
  // perturbation the headroom the base clamp consumed, so a shift of dm always
  // moves the path by dm.
  cloned.ebitMarginPath.value = shiftPath(
    assumptions.ebitMarginPath.value,
    marginDelta,
    MARGIN_CLAMP_PP[0] - Math.abs(marginDelta),
    MARGIN_CLAMP_PP[1] + Math.abs(marginDelta),
  );
  return cloned;
}

/* ------------------------------------------------------------------------ *
 * computeProjections
 * ------------------------------------------------------------------------ */

function notApplicable(reason: string): Projections {
  return {
    horizonYears: PROJECTION_HORIZON_YEARS,
    scenarioWeights: { ...PROJECTION_WEIGHTS },
    weightsVersion: PROJECTION_WEIGHTS_VERSION,
    series: [],
    notApplicableReason: reason,
  };
}

export function computeProjections(inputs: ProjectionsInputs): Projections {
  const { valuation, asOf, currency } = inputs;

  // Projections run only on the general FCFF-DCF route (docs/METHODOLOGY.md "Financial-company routes": financials /
  // REITs use book-value models; pre-revenue uses runway framing).
  if (valuation.kind !== "dcf") {
    return notApplicable(
      `Forward FCFF projections are only modelled on the general route; this company routed to "${valuation.kind}".`,
    );
  }
  const assumptions = valuation.assumptions;
  const baseDcf = valuation.dcf;
  if (assumptions === null || baseDcf === null || baseDcf.yearRows.length === 0) {
    return notApplicable("DCF assumptions/forward path unavailable — no basis for projections.");
  }
  if (!isNum(inputs.waccPct)) {
    return notApplicable("WACC unavailable — cannot re-run the forward model for scenarios.");
  }

  const H = Math.min(PROJECTION_HORIZON_YEARS, assumptions.years);

  // --- Dispersion from the company's own history ---------------------------
  const disclosures: ManifestEntry[] = [];
  const incomeAsc = inputs.incomeHistory
    .filter((r) => r.date.length > 0)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  const rawDisp = scenarioDispersion(inputs.incomeHistory);
  if (rawDisp.sigmaGrowth === null || rawDisp.sigmaMargin === null) {
    return notApplicable(
      "At least four consecutive annual revenue observations and three margin observations are required for sample dispersion; scenario fan suppressed rather than using house defaults.",
    );
  }
  const shocks = effectiveScenarioShocks(rawDisp.sigmaGrowth, rawDisp.sigmaMargin, rawDisp.growthMarginCorrelation);
  if (rawDisp.irregularHistory) {
    // Off-annual pairs are skipped individually since 2026-08-31; the fan IS
    // built from the surviving annual steps, and the disclosure says so (it
    // used to claim the fan was suppressed beside four published series).
    disclosures.push({
      field: "projections.dispersion.spacing",
      reason: `${rawDisp.skippedPairs} nonconsecutive fiscal interval${rawDisp.skippedPairs === 1 ? "" : "s"} excluded from the growth and correlation dispersion — the scenario fan is built from the remaining annual steps`,
      severity: "info",
    });
  }
  if (rawDisp.growthMarginCorrelation === null) {
    disclosures.push({
      field: "projections.dispersion.covariance",
      reason: "insufficient paired history to estimate growth/margin covariance — margin path left at base in scenarios",
      severity: "warn",
    });
  } else if (shocks.degenerate) {
    disclosures.push({
      field: "projections.dispersion.degenerate",
      reason: "revenue-growth or operating-margin history shows negligible dispersion (σ rounds to 0.00pp) — growth/margin correlation is unavailable and the scenario margin path stays at base, consistent with the valuation targets",
      severity: "info",
    });
  }

  // --- Bull / bear paths via the SAME DCF engine ---------------------------
  const dg = shocks.growthDeltaPp;
  const dm = shocks.marginDeltaPp;

  const runScenario = (growthDelta: number, marginDelta: number): DcfYearRow[] =>
    runDcf(perturbScenarioAssumptions(assumptions, growthDelta, marginDelta), {
      waccPct: inputs.waccPct as number,
      netDebt: baseDcf.bridge.netDebt,
      dilutedShares: baseDcf.bridge.dilutedShares,
      minorityInterest: baseDcf.bridge.minorityInterest,
      preferred: baseDcf.bridge.preferred,
    }).yearRows;

  const bullRows = runScenario(dg, dm);
  const bearRows = runScenario(-dg, -dm);
  const baseRows = baseDcf.yearRows;

  // Forward fiscal-year labels track the DCF's BASE period. The base path grows
  // from startRevenue (= the TTM/statements figure), so labelling off the last
  // ANNUAL date would mislabel mid-year filers (TTM more recent than the last
  // FYE) by up to a year. Prefer the statements date the DCF actually built from.
  const baseDate =
    assumptions.asOf.statements ??
    (incomeAsc.length > 0 ? incomeAsc[incomeAsc.length - 1].date : asOf);
  const lastFy = Number.parseInt(baseDate.slice(0, 4), 10);
  const fwdPeriod = (t: number): string => (Number.isFinite(lastFy) ? `FY${lastFy + t}` : `Y+${t}`);

  // The anchor is described from the growth-anchor record, never from a
  // substring of the basis string: that string names every method including
  // the unavailable ones, so "analyst consensus" was printed for every
  // keyless report that had no analyst estimates at all.
  const anchorMethods = assumptions.growthAnchor.methods.filter((m) => m.valuePct !== null);
  const anchorText =
    `${round2(assumptions.growthAnchor.pointPct)}%, the median of ${anchorMethods.length} method${anchorMethods.length === 1 ? "" : "s"}` +
    ` (${anchorMethods.map((m) => m.name).join(", ")})` +
    (assumptions.growthAnchor.unavailable.length > 0
      ? `; unavailable: ${assumptions.growthAnchor.unavailable.join(", ")}`
      : "");
  const assumptionLines: string[] = [
    `Base path is the DCF forward trajectory (near-term growth ${anchorText}, fading to ${round2(assumptions.terminal.gTermPct.value)}% terminal growth).`,
    `The two scenario shocks shift growth by ±${round2(dg)}pp and margin by ±${round2(dm)}pp; the margin shift is sample σ scaled by the company's observed growth/margin correlation (${shocks.growthMarginCorrelation === null ? "unavailable" : round2(shocks.growthMarginCorrelation)}). Where valuation targets are available, bull/bear labels follow the corresponding higher/lower valuation.`,
    `Weighted path uses the coarse unbacktested display prior ${PROJECTION_WEIGHTS.bull}·bull + ${PROJECTION_WEIGHTS.base}·base + ${PROJECTION_WEIGHTS.bear}·bear; these are not empirical probabilities.`,
  ];

  // --- Build series --------------------------------------------------------
  // Absolute-currency series (revenue, FCF). Unknown currency must not silently
  // read as USD downstream, so it is stated rather than defaulted.
  const revUnit = currency !== null && currency.trim().length > 0 ? currency : "currency unknown";
  const series: ProjectionSeries[] = [];

  // Historical helpers (last up to 4 actual years, oldest→newest).
  const histTail = <T,>(rows: T[]): T[] => rows.slice(Math.max(0, rows.length - 4));

  // Revenue
  series.push(
    buildSeries(
      "revenue",
      revUnit,
      histTail(incomeAsc.filter((r) => isNum(r.revenue))).map((r) => ({ period: fyLabel(r.date), value: r.revenue as number })),
      bullRows.slice(0, H).map((r) => r.revenue),
      baseRows.slice(0, H).map((r) => r.revenue),
      bearRows.slice(0, H).map((r) => r.revenue),
      fwdPeriod,
      assumptionLines,
      disclosures,
      asOf,
    ),
  );

  // Operating margin (percent)
  const marginHist = incomeAsc
    .filter((r) => isNum(r.ebit) && isNum(r.revenue) && (r.revenue as number) > 0)
    .map((r) => ({ period: fyLabel(r.date), value: ((r.ebit as number) / (r.revenue as number)) * 100 }));
  series.push(
    buildSeries(
      "operatingMargin",
      "%",
      histTail(marginHist),
      bullRows.slice(0, H).map((r) => r.ebitMarginPct),
      baseRows.slice(0, H).map((r) => r.ebitMarginPct),
      bearRows.slice(0, H).map((r) => r.ebitMarginPct),
      fwdPeriod,
      assumptionLines,
      disclosures,
      asOf,
    ),
  );

  // Free cash flow (unlevered / FCFF)
  const fcfAsc = inputs.fcfHistory.filter((r) => r.date.length > 0 && isNum(r.fcf)).sort((a, b) => a.date.localeCompare(b.date));
  series.push(
    buildSeries(
      "fcf",
      revUnit,
      histTail(fcfAsc).map((r) => ({ period: fyLabel(r.date), value: r.fcf as number })),
      bullRows.slice(0, H).map((r) => r.fcff),
      baseRows.slice(0, H).map((r) => r.fcff),
      bearRows.slice(0, H).map((r) => r.fcff),
      fwdPeriod,
      [
        ...assumptionLines,
        "PROJECTED FCF is unlevered free cash flow (FCFF), consistent with the DCF (NOPAT − reinvestment).",
        "HISTORICAL FCF on this series is the reported levered figure (freeCashFlow, or operatingCashFlow + capitalExpenditure), which is stated AFTER interest. The two segments are therefore different measures: for a leveraged issuer the level steps at the history→forecast seam by roughly after-tax interest, and that step is a change of basis, not a forecast of improvement.",
        "Scenario paths can cross: the higher-growth shock reinvests more up front, so its near-term FCF may sit below the lower-growth shock. The shaded band is the scenario range; bull/bear labels do not imply an ordering of each operating metric.",
      ],
      disclosures,
      asOf,
    ),
  );

  // The fcf series splices reported LEVERED history onto UNLEVERED (FCFF)
  // forecasts, so the seam is a change of measure. Disclose it on the series
  // itself, not only in the assumption prose, so the manifest carries it.
  if (fcfAsc.length > 0) {
    series.find((candidate) => candidate.metric === "fcf")?.disclosures.push({
      field: "projections.fcf.basisChange",
      reason:
        "Historical FCF is the reported levered figure (after interest) while projected FCF is unlevered FCFF; the history→forecast step reflects that change of basis, not a forecast improvement.",
      severity: "info",
    });
  }

  if (!isNum(inputs.shareCountAnnualizedPct)) {
    series.find((candidate) => candidate.metric === "revenue")?.disclosures.push({
      field: "projections.eps.shareCountTrend",
      reason: "Annualized diluted-share trend unavailable; EPS projection suppressed rather than assuming a flat share count.",
      severity: "warn",
    });
  }

  // Diluted EPS (derived; disclosed + skipped when inputs missing)
  const epsSeries = buildEpsSeries(inputs, { bullRows, baseRows, bearRows }, H, incomeAsc, fwdPeriod, assumptionLines, asOf);
  if (epsSeries) series.push(epsSeries);

  const windows = Array.from({ length: H }, (_, index) => forwardModelWindow(assumptions.asOf.statements, index + 1, asOf));
  for (const item of series) {
    if (windows.every(window => window !== null)) {
      for (const scenario of ["bull", "base", "bear", "weighted"] as const) {
        item[scenario].forEach((point, index) => Object.assign(point, windows[index]));
      }
      item.assumptions = [...item.assumptions,
        `Forward points represent modeled 12-month windows after the DCF statement anchor ${assumptions.asOf.statements}; these need not coincide with issuer fiscal years. FY labels identify each modeled period-end calendar year. Exact periodStart/periodEnd are saved on each forecast point; leap-day anniversaries clamp to February end.`,
      ];
    } else {
      item.disclosures.push({
        field: "projections.period",
        reason: "Forecast periods are unverified: an explicit valid, nonfuture DCF statement anchor is unavailable. Annual-history dates and FY labels cannot establish evaluation horizons.",
        severity: "warn",
      });
    }
  }

  return {
    horizonYears: H,
    scenarioWeights: { ...PROJECTION_WEIGHTS },
    weightsVersion: PROJECTION_WEIGHTS_VERSION,
    series,
    notApplicableReason: null,
  };
}

/* ------------------------------------------------------------------------ *
 * Series builders
 * ------------------------------------------------------------------------ */

function buildSeries(
  metric: ProjectionMetric,
  unit: string,
  historical: { period: string; value: number }[],
  bull: number[],
  base: number[],
  bear: number[],
  fwdPeriod: (t: number) => string,
  assumptions: string[],
  disclosures: ManifestEntry[],
  asOf: string,
): ProjectionSeries {
  const weighted = weightedPath(bull, base, bear);
  const mk = (arr: number[], scenario: string): ProjectionPoint[] =>
    arr.map((v, i) => point(fwdPeriod(i + 1), v, unit, metric, scenario, asOf));
  return {
    metric,
    unit,
    historical: historical.map((h) => point(h.period, h.value, unit, metric, "historical", asOf)),
    bull: mk(bull, "bull"),
    base: mk(base, "base"),
    bear: mk(bear, "bear"),
    weighted: mk(weighted, "weighted"),
    assumptions,
    disclosures: [...disclosures],
  };
}

function buildEpsSeries(
  inputs: ProjectionsInputs,
  rows: { bullRows: DcfYearRow[]; baseRows: DcfYearRow[]; bearRows: DcfYearRow[] },
  H: number,
  incomeAsc: ProjectionIncomeRow[],
  fwdPeriod: (t: number) => string,
  assumptionLines: string[],
  asOf: string,
): ProjectionSeries | null {
  const shares0 = inputs.dilutedShares;
  const niToEbit = median(
    incomeAsc
      .filter((r) => isNum(r.netIncome) && isNum(r.ebit) && (r.ebit as number) > 0)
      .map((r) => (r.netIncome as number) / (r.ebit as number)),
  );
  // EPS requires both a positive share anchor and a historical profitability conversion.
  if (!isNum(shares0) || shares0 <= 0 || niToEbit === null) {
    return null;
  }
  // The caller records a missing share trend once on the surviving revenue series.
  if (!isNum(inputs.shareCountAnnualizedPct)) return null;
  const g = inputs.shareCountAnnualizedPct / 100;
  const sharesAt = (t: number): number => shares0 * Math.pow(1 + g, t); // t = 1..H

  const epsPath = (dcfRows: DcfYearRow[]): number[] =>
    dcfRows.slice(0, H).map((r, i) => (r.ebit * niToEbit) / sharesAt(i + 1));

  const bull = epsPath(rows.bullRows);
  const base = epsPath(rows.baseRows);
  const bear = epsPath(rows.bearRows);

  const histEps = incomeAsc
    .filter((r) => isNum(r.epsDiluted))
    .slice(-4)
    .map((r) => ({ period: fyLabel(r.date), value: r.epsDiluted as number }));

  const unit = perShareUnit(inputs.currency);
  const weighted = weightedPath(bull, base, bear);
  const mk = (arr: number[], scenario: string): ProjectionPoint[] =>
    arr.map((v, i) => point(fwdPeriod(i + 1), v, unit, "epsDiluted", scenario, asOf));
  return {
    metric: "epsDiluted",
    unit,
    historical: histEps.map((h) => point(h.period, h.value, unit, "epsDiluted", "historical", asOf)),
    bull: mk(bull, "bull"),
    base: mk(base, "base"),
    bear: mk(bear, "bear"),
    weighted: mk(weighted, "weighted"),
    assumptions: [
      ...assumptionLines,
      `EPS = forward EBIT × median historical net-income/EBIT ratio (${round2(niToEbit)}) ÷ diluted shares trended ${round2(g * 100)}%/yr (buyback/dilution history).`,
    ],
    disclosures: [],
  };
}
