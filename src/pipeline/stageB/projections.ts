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
 *  - BULL / BEAR re-run the exported `runDcf` with year-one growth shifted by
 *    sample σ from consecutive company history; the margin shift is scaled by
 *    the observed growth/margin correlation rather than assuming perfect
 *    covariance; both shocks decay to the base path by the final year and the
 *    margin is capped at gross margin less the leanest opex ratio (D-60);
 *  - the WEIGHTED path uses an explicitly versioned 25/50/25 display prior.
 *    These weights are not presented as empirically calibrated probabilities.
 * Thin or irregular history suppresses the fan instead of inventing dispersion.
 *
 * EPS is the one series not directly a DcfYearRow: it is derived from the
 * forward operating path (EBIT × historical net-income/EBIT ratio) over a
 * conservatively flat or dilution-trended share count, with a separate,
 * explicitly unfunded historical-share-trend sensitivity. EPS is skipped when
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
  consensusYearsText,
  forecastYearPeriod,
  type DcfYearRow,
  type ValuationResult,
} from "@/pipeline/stageB/valuation";
import { buildScenarioPaths, type ScenarioAssumptions } from "@/pipeline/stageB/scenarioPaths";
export { perturbScenarioAssumptions } from "@/pipeline/stageB/scenarioPaths";
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
  /** D-60: interest expense (positive), deducted before tax in forecast EPS. */
  interestExpense?: number | null;
  /** A zero is usable only when direct filing evidence distinguishes it from a vendor placeholder. */
  interestExpenseDisclosed?: boolean;
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
  /** A known ownership refusal; historical reported EPS remains displayable. */
  forecastEpsWithheldReason?: string | null;
  /** Annual income history (any order). */
  incomeHistory: ProjectionIncomeRow[];
  /** Annual FCF history (any order) — for the FCF fan's historical half. */
  fcfHistory: ProjectionFcfRow[];
  /** Annualised share-count change (percent; negative = buybacks). */
  shareCountAnnualizedPct: number | null;
  /** Currency label for revenue/FCF/EPS units. */
  currency: string | null;
  asOf: string;
  /** Remaining repurchase authorization from the admitted issuer disclosure, its source, and the quote. */
  capitalReturn?: { authorizationRemaining: number | null; source: string | null; currentPrice: number | null } | null;
  /**
   * D-65: the annual interest expense forecast EPS deducts, from the latest
   * quarter (its effective rate on the quarter-end debt, else the quarter × 4).
   * NVDA's FY2026 $0.26B predates $25B of notes issued in Q2 FY2027. Absent:
   * the latest annual interest expense.
   */
  interestRunRate?: { value: number; basis: string } | null;
  /** Established financing debt at the DCF statement anchor; zero can establish a debt-free interest assumption. */
  debtAtAnchor?: { date: string; debt: number | null } | null;
}

/**
 * D-65: annual interest expense at the latest quarter's run-rate. The
 * quarter's interest over its average debt (opening and closing balances,
 * operating leases excluded: their cost is in operating expenses) is the
 * issuer's own effective rate; applied to the closing debt it prices debt
 * issued during the quarter for a full year. Without both balances, the
 * quarter × 4. Null without a nonnegative disclosed quarterly interest figure.
 */
export function interestRunRate(quarter: { date: string; interestExpense: number | null; interestExpenseDisclosed?: boolean } | null,
  closing: { date: string; debt: number | null } | null, opening: { date: string; debt: number | null } | null): { value: number; basis: string } | null {
  if (quarter === null || !isNum(quarter.interestExpense) || quarter.interestExpense < 0) return null;
  if (quarter.interestExpense === 0 && quarter.interestExpenseDisclosed !== true) return null;
  const q = quarter.interestExpense;
  const b = (v: number) => `${round2(v / 1e9)}B`;
  if (closing !== null && opening !== null && closing.date === quarter.date && isNum(closing.debt) && isNum(opening.debt) && closing.debt > 0 && opening.debt >= 0) {
    const average = (closing.debt + opening.debt) / 2;
    const rate = (q / average) * 4;
    if (average > 0 && rate > 0 && rate < 0.25) {
      return { value: rate * closing.debt, basis: `the quarter ending ${quarter.date}'s interest ${b(q)} over its average debt ${b(average)} (${opening.date} and ${quarter.date}, operating leases excluded) = ${round2(rate * 100)}% a year, on the closing debt ${b(closing.debt)}` };
    }
  }
  return { value: q * 4, basis: `the quarter ending ${quarter.date}'s interest ${b(q)} × 4` };
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

export type ScenarioPointPaths = Pick<ProjectionSeries, "bull" | "base" | "bear" | "weighted">;
export type AuditableProjectionSeries = ProjectionSeries & {
  flatShare?: ScenarioPointPaths;
  shareTrend?: ScenarioPointPaths;
  capitalReturn?: { shareCountAnnualizedPct: number | null; appliedShareCountAnnualizedPct: number; policy: "flat-share-conservative" | "dilution-trend"; basis: string; netIncomeToEbit: number;
    authorizationRemaining?: number; authorizationAnnualizedPct?: number | null };
};
export type AuditableProjections = Projections & { scenarioAssumptions?: ScenarioAssumptions; series: AuditableProjectionSeries[] };

export function computeProjections(inputs: ProjectionsInputs): AuditableProjections {
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

  const shared = buildScenarioPaths(assumptions, {
      waccPct: inputs.waccPct as number,
      netDebt: baseDcf.bridge.netDebt,
      dilutedShares: baseDcf.bridge.dilutedShares,
      minorityInterest: baseDcf.bridge.minorityInterest,
      preferred: baseDcf.bridge.preferred,
      nonOperatingAssets: baseDcf.bridge.nonOperatingAssets ?? null,
    }, { sigmaGrowth: dg, sigmaMargin: DISPERSION_K * rawDisp.sigmaMargin, growthMarginCorrelation: shocks.growthMarginCorrelation });
  const bullRows = shared.bull.result.yearRows;
  const bearRows = shared.bear.result.yearRows;
  const baseRows = baseDcf.yearRows;
  const effectiveCorr = shared.scenarioAssumptions.growthMarginCorrelation;

  // The DCF's own dated windows are authoritative. Reject stale/inconsistent,
  // invalid or future anchors instead of assigning evaluation periods by label.
  const anchor = assumptions.forecastPeriod?.anchorEndDate;
  const periodsVerified = Boolean(anchor && anchor === assumptions.asOf.statements
    && forecastYearPeriod(asOf, 0, "rolling-12-month") && anchor <= asOf
    && baseRows.slice(0, H).length === H && baseRows.slice(0, H).every((row, i) => {
      const expected = forecastYearPeriod(anchor, i + 1, assumptions.forecastPeriod!.basis);
      return expected !== null && row.period?.startDate === expected.startDate
        && row.period?.endDate === expected.endDate && row.period?.basis === expected.basis
        && row.period?.label === expected.label;
    }));

  // Legacy assumptions without period metadata remain readable, but do not
  // acquire a guessed fiscal year/date from annual history or analysis time.
  const fwdPeriod = (t: number): string => periodsVerified ? baseRows[t - 1].period!.label : `Y+${t} (period basis unavailable)`;

  // The anchor is described from the growth-anchor record, never from a
  // substring of the basis string: that string names every method including
  // the unavailable ones, so "analyst consensus" was printed for every
  // keyless report that had no analyst estimates at all.
  // D-60: the clamped near-term rate is printed as the clamped rate, with the
  // median it came from; it is named as a year-one input only when it set year one.
  const anchorMethods = assumptions.growthAnchor.methods.filter((m) => m.valuePct !== null);
  const preClamp = assumptions.growthAnchor.preClampMedianPct;
  const anchorText =
    `${round2(assumptions.growthAnchor.pointPct)}%` +
    (preClamp === undefined
      ? `, the median of ${anchorMethods.length} method${anchorMethods.length === 1 ? "" : "s"}`
      : `, the house clamp of the ${round2(preClamp)}% median of ${anchorMethods.length} method${anchorMethods.length === 1 ? "" : "s"}`) +
    ` (${anchorMethods.map((m) => m.name).join(", ")})` +
    (assumptions.growthAnchor.unavailable.length > 0
      ? `; unavailable: ${assumptions.growthAnchor.unavailable.join(", ")}`
      : "");
  const revenueAnchor = assumptions.revenueAnchor;
  const anchorWindowEnd = assumptions.forecastPeriod?.anchorEndDate ?? null;
  // D-65: name the years consensus set, never "consensus-anchored" alone.
  const anchored = revenueAnchor?.anchoredGrowthPct ?? (revenueAnchor ? [revenueAnchor.yearOneGrowthPct, ...(revenueAnchor.yearTwoGrowthPct === null ? [] : [revenueAnchor.yearTwoGrowthPct])] : []);
  const consensusYears = revenueAnchor?.consensusYears ?? (revenueAnchor ? [...(revenueAnchor.source === "consensus" ? [1] : []), ...(revenueAnchor.yearTwoGrowthPct === null ? [] : [2])] : []);
  const laterText = anchored.length <= 1 ? "" : `; years 2–${anchored.length} ${anchored.slice(1).map((g) => `${round2(g)}%`).join(", ")} on consensus growth`;
  const consensusText = consensusYears.length === 0 ? "" : `; consensus sets ${consensusYearsText(consensusYears)} of ${assumptions.years}`;
  // The decay and cap paragraph is the scenario-construction table's note; the
  // effective shift after the cap is stated here once.
  const scenarios = shared.scenarioAssumptions.scenarios;
  const capped = scenarios.filter((s) => s.effectiveMarginDeltaPp !== undefined);
  const effectiveText = capped.length === 0 ? "" :
    ` After the scenario margin cap the year-one margin shift is ${scenarios.filter((s) => s.name !== "base").map((s) => `${round2(s.effectiveMarginDeltaPp ?? s.marginDeltaPp)}pp for ${s.name}`).join(" and ")}, ` +
    "so the shocks are not symmetric and the weighted margin differs from the base margin by the display weights times the shifts that remain.";
  const assumptionLines: string[] = [
    revenueAnchor === undefined
      ? `Base path is the DCF forward trajectory (near-term growth ${anchorText}, fading to ${round2(assumptions.terminal.gTermPct.value)}% terminal growth).`
      : `Base path is the DCF forward trajectory (year-one revenue from ${revenueAnchor.source}, ${round2(revenueAnchor.yearOneGrowthPct)}% growth${laterText}` +
        `${revenueAnchor.source === "run-rate" || revenueAnchor.source === "ttm" ? `, carried at the near-term growth rate ${anchorText}` : ""}${consensusText}; ` +
        `then a convergent fade to ${round2(assumptions.terminal.gTermPct.value)}% terminal growth).`,
    `Bull/bear shift year-one growth by ±${round2(dg)}pp and the year-one margin by ±${round2(dm)}pp, both decaying to zero by the final explicit year; the margin shift is sample σ scaled by the company's observed growth/margin correlation (${effectiveCorr === null ? "unavailable" : round2(effectiveCorr)}).${effectiveText}`,
    `Forward periods are 12-month windows ending on anniversaries of the latest statement date${anchorWindowEnd === null ? "" : ` (${anchorWindowEnd})`}, not fiscal years or company guidance periods. Exact periodStart/periodEnd are saved on each verified forecast point; leap-day anniversaries clamp to February end.`,
    `Bull/bear identity is shared with price targets and ordered by enterprise value. Bull growth delta ${round2(shared.bull.growthDeltaPp)}pp; margin delta ${round2(shared.bull.marginDeltaPp)}pp. Revenue or FCF paths may cross.`,
    `Weighted path = ${PROJECTION_WEIGHTS.bull}·bull + ${PROJECTION_WEIGHTS.base}·base + ${PROJECTION_WEIGHTS.bear}·bear, the fixed display prior.`,
  ];

  // --- Build series --------------------------------------------------------
  // Absolute-currency series (revenue, FCF). Unknown currency must not silently
  // read as USD downstream, so it is stated rather than defaulted.
  const revUnit = currency !== null && currency.trim().length > 0 ? currency : "currency unknown";
  const series: AuditableProjectionSeries[] = [];

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
        "PROJECTED FCF is unlevered free cash flow (FCFF), consistent with the DCF (NOPAT − reinvestment); stock-based compensation is an expense inside that EBIT, so FCFF is after stock-based compensation.",
        "HISTORICAL FCF on this series is levered free cash flow after stock-based compensation (house default: operating cash flow + capital expenditure − SBC; unadjusted only where SBC was not disclosed), stated AFTER interest. It is not the before-SBC vendor figure behind the FCF CAGR. The two segments share the SBC treatment but differ on leverage: for a leveraged issuer the level steps at the history→forecast seam by roughly after-tax interest, and that step is a change of basis, not a forecast of improvement.",
        "Scenario paths can cross: the higher-growth shock reinvests more up front, so its near-term FCF may sit below the lower-growth shock. The bull-to-bear spread is the scenario range; bull/bear labels do not imply an ordering of each operating metric.",
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
        "Historical FCF is levered (after interest) and after stock-based compensation, while projected FCF is unlevered FCFF; the history→forecast step reflects that change of basis, not a forecast improvement.",
      severity: "info",
    });
  }

  if (!isNum(inputs.shareCountAnnualizedPct)) {
    series.find((candidate) => candidate.metric === "revenue")?.disclosures.push({
      field: "projections.eps.shareCountTrend",
      reason: "Annualized diluted-share trend unavailable; EPS uses an explicit conservative flat-share assumption. No historical-share-trend alternative is available.",
      severity: "warn",
    });
  }

  // Diluted EPS (derived; disclosed + skipped when inputs missing)
  const epsSeries = buildEpsSeries(inputs, { bullRows, baseRows, bearRows }, H, incomeAsc, fwdPeriod, assumptionLines, asOf);
  if (epsSeries) series.push(epsSeries);
  else if (isNum(inputs.dilutedShares) && inputs.dilutedShares > 0) {
    series.find((candidate) => candidate.metric === "revenue")?.disclosures.push({
      field: "projections.eps.interestExpense",
      reason: "Forecast EPS withheld: no established quarterly or annual interest expense and no matching debt-free balance anchor.",
      severity: "warn",
    });
  }

  const dated = (points: ProjectionPoint[]) => points.map((pt, i) => {
    const period = periodsVerified ? baseRows[i]?.period : undefined;
    return period ? { ...pt, periodStart: period.startDate, periodEnd: period.endDate, periodBasis: period.basis } : pt;
  });
  for (const s of series) {
    for (const key of ["bull", "base", "bear", "weighted"] as const) s[key] = dated(s[key]);
    for (const alternate of [s.flatShare, s.shareTrend]) {
      if (alternate) for (const key of ["bull", "base", "bear", "weighted"] as const) alternate[key] = dated(alternate[key]);
    }
    if (!periodsVerified) {
      s.disclosures.push({
        field: "projections.period",
        reason: "Forecast periods are unverified: a valid, nonfuture DCF statement anchor and consistent dated DCF rows are required. Annual-history dates and period labels cannot establish evaluation horizons.",
        severity: "warn",
      });
    }
  }

  return {
    horizonYears: H,
    scenarioWeights: { ...PROJECTION_WEIGHTS },
    weightsVersion: PROJECTION_WEIGHTS_VERSION,
    scenarioAssumptions: shared.scenarioAssumptions,
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
): AuditableProjectionSeries | null {
  const unit = perShareUnit(inputs.currency);
  const historical = incomeAsc.filter(r => isNum(r.epsDiluted)).slice(-4)
    .map(r => point(fyLabel(r.date), r.epsDiluted as number, unit, "epsDiluted", "historical", asOf));
  // Pure callers inherit the valuation's refusal too. A positive raw count
  // cannot restore a denominator that the shared valuation already rejected.
  const scopeGap = inputs.valuation.gaps.find(g => ["valuation.perShare.economicClassBasis", "valuation.perShare.securityBasis",
    "valuation.dcf.noncontrollingOwnership", "valuation.multiples.peTtm.commonIncome"].includes(g.field));
  const nci = inputs.valuation.kind === "dcf" ? inputs.valuation.dcf?.bridge.minorityInterest : null;
  const preferred = inputs.valuation.kind === "dcf" ? inputs.valuation.dcf?.bridge.preferred : null;
  const reason = inputs.forecastEpsWithheldReason ?? scopeGap?.reason ??
    (isNum(nci) && nci !== 0 ? "Noncontrolling ownership is evidenced but a future common-earnings allocation is unestablished. Book NCI and historical NCI income do not allocate forecast operating profit to common holders." : null) ??
    (isNum(preferred) && preferred !== 0 ? "A preferred claim is evidenced but a future common-earnings allocation is unestablished. Preferred book value is not a dividend forecast and is not subtracted from forecast operating earnings." : null);
  if (reason !== null) return {
    metric: "epsDiluted", unit, historical, bull: [], base: [], bear: [], weighted: [],
    assumptions: [...assumptionLines, "Reported historical diluted EPS is retained. Future operating EPS and every share-count alternative are withheld; consolidated/entity revenue, operating margin and FCFF do not establish common-holder per-share earnings."],
    disclosures: [{ field: "projections.eps.ownershipScope", reason: `Forecast operating EPS withheld: ${reason}`, severity: "warn" }],
  };
  const shares0 = inputs.dilutedShares;
  // EPS requires a positive share anchor.
  if (!isNum(shares0) || shares0 <= 0) {
    return null;
  }
  // D-60: net income from the DCF's own operating path. The former median
  // historical net-income/EBIT ratio (NVDA 0.9525) carried low-tax years and
  // investment gains into every forecast year, overstating EPS against the
  // 16-18% guided tax rate. Net income is now operating EBIT less the latest
  // annual interest expense (held flat), taxed at that year's DCF rate; interest
  // income, investment gains and other non-operating items are excluded.
  const latestInterest = incomeAsc
    .filter((r) => isNum(r.interestExpense) && (r.interestExpense > 0 || (r.interestExpense === 0 && r.interestExpenseDisclosed === true)))
    .at(-1);
  // D-65: the latest quarter's run-rate when supplied; the annual figure otherwise.
  const runRate = inputs.interestRunRate && isNum(inputs.interestRunRate.value) && inputs.interestRunRate.value >= 0 ? inputs.interestRunRate : null;
  const debtFree = inputs.valuation.kind === "dcf" && inputs.debtAtAnchor?.debt === 0 &&
    inputs.debtAtAnchor.date === inputs.valuation.assumptions?.asOf.statements;
  if (runRate === null && latestInterest === undefined && !debtFree) return null;
  const interest = runRate ? runRate.value : latestInterest ? (latestInterest.interestExpense as number) : 0;
  const interestText = runRate
    ? `interest expense ${round2(interest / 1e9)}B a year at the latest quarter's run-rate (${runRate.basis})`
    : latestInterest ? `latest annual interest expense ${round2(interest / 1e9)}B`
      : `zero interest expense from the evidenced debt-free balance as of ${inputs.debtAtAnchor!.date}`;
  const netIncomeOf = (r: DcfYearRow): number => {
    const pretax = r.ebit - interest;
    return pretax > 0 ? pretax * (1 - r.taxRatePct / 100) : pretax;
  };
  // Historical repurchases are not a funded forward capital-return schedule.
  // The conservative base never shrinks shares; positive dilution still applies.
  const observedTrend = isNum(inputs.shareCountAnnualizedPct) ? inputs.shareCountAnnualizedPct : null;
  const appliedTrend = Math.max(0, observedTrend ?? 0);
  const g = appliedTrend / 100;
  const sharesAt = (t: number): number => shares0 * Math.pow(1 + g, t); // t = 1..H

  const epsPath = (dcfRows: DcfYearRow[]): number[] =>
    dcfRows.slice(0, H).map((r, i) => netIncomeOf(r) / sharesAt(i + 1));

  const bull = epsPath(rows.bullRows);
  const base = epsPath(rows.baseRows);
  const bear = epsPath(rows.bearRows);

  const histEps = incomeAsc
    .filter((r) => isNum(r.epsDiluted))
    .slice(-4)
    .map((r) => ({ period: fyLabel(r.date), value: r.epsDiluted as number }));

  const weighted = weightedPath(bull, base, bear);
  const mk = (arr: number[], scenario: string): ProjectionPoint[] =>
    arr.map((v, i) => point(fwdPeriod(i + 1), v, unit, "epsDiluted", scenario, asOf));
  const alternate = (trend: number, name: string): ScenarioPointPaths => {
    const values = (rs: DcfYearRow[]) => rs.slice(0, H).map((r, i) => netIncomeOf(r) / (shares0 * (1 + trend / 100) ** (i + 1)));
    const b = values(rows.bullRows), m = values(rows.baseRows), d = values(rows.bearRows);
    return { bull: mk(b, `${name}.bull`), base: mk(m, `${name}.base`), bear: mk(d, `${name}.bear`), weighted: mk(weightedPath(b, m, d), `${name}.weighted`) };
  };
  // D-60 (P1-G): say what the authorization would buy instead of claiming no
  // repurchase evidence exists. Spent evenly over the horizon at the current
  // quote, the remaining authorization retires a share count the reader can
  // set against the historical trend; it is discretionary, so the base stays flat.
  const auth = inputs.capitalReturn ?? null;
  const authRemaining = auth && isNum(auth.authorizationRemaining) && auth.authorizationRemaining > 0 ? auth.authorizationRemaining : null;
  const authPrice = auth && isNum(auth.currentPrice) && auth.currentPrice > 0 ? auth.currentPrice : null;
  const authRetiredPct = authRemaining !== null && authPrice !== null ? (authRemaining / authPrice / shares0) * 100 : null;
  const authAnnualPct = authRetiredPct !== null && authRetiredPct < 100 ? (Math.pow(1 - authRetiredPct / 100, 1 / H) - 1) * 100 : null;
  const authorizationText = authRemaining === null
    ? "No remaining repurchase authorization was read from the filings."
    : `The retained issuer disclosure reports ${round2(authRemaining / 1e9)}B of repurchase authorization remaining${auth?.source ? ` (${auth.source})` : ""}` +
      (authRetiredPct === null || authAnnualPct === null
        ? "."
        : `; spent evenly over the ${H}-year horizon at the current quote it would retire ${round2(authRetiredPct)}% of diluted shares (${round2(authAnnualPct)}%/yr), against the observed ${observedTrend === null ? "unavailable" : `${round2(observedTrend)}%/yr`} trend.`);
  const capitalBasis =
    "The base holds the diluted share count flat: a repurchase authorization is discretionary capacity, not a committed schedule, and future repurchases depend on cash and price. Positive dilution is retained only when the observed share-count trend is positive. " +
    `${authorizationText} The historical-share-trend alternative is hypothetical and does not deduct repurchase cash from equity value; flat-share EPS isolates operating performance.`;
  const yearOne = rows.baseRows[0];
  const conversion = yearOne && yearOne.ebit > 0 ? netIncomeOf(yearOne) / yearOne.ebit : 0;
  return {
    metric: "epsDiluted",
    unit,
    historical: histEps.map((h) => point(h.period, h.value, unit, "epsDiluted", "historical", asOf)),
    bull: mk(bull, "bull"),
    base: mk(base, "base"),
    bear: mk(bear, "bear"),
    weighted: mk(weighted, "weighted"),
    flatShare: alternate(0, "flatShare"),
    ...(observedTrend !== null && observedTrend > -100 ? { shareTrend: alternate(observedTrend, "shareTrend") } : {}),
    capitalReturn: { shareCountAnnualizedPct: observedTrend, appliedShareCountAnnualizedPct: appliedTrend,
      policy: appliedTrend > 0 ? "dilution-trend" : "flat-share-conservative", basis: capitalBasis, netIncomeToEbit: conversion,
      ...(authRemaining !== null ? { authorizationRemaining: authRemaining, authorizationAnnualizedPct: authAnnualPct } : {}) },
    // D-65: the flat-share paragraph is the capital-return table's note; it is
    // not repeated here.
    assumptions: [
      ...assumptionLines,
      `Operating EPS = (forward operating EBIT − ${interestText}, held flat) × (1 − that year's DCF tax rate) ÷ diluted shares with applied change ${round2(g * 100)}%/yr ` +
        `(year-one net income / EBIT ${round2(conversion)}). Interest income, investment gains and other non-operating items are excluded, so this is operating EPS, not a forecast of GAAP diluted EPS.`,
    ],
    disclosures: [],
  };
}
