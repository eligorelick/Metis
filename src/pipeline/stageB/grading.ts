/**
 * Stage B — deterministic aspect scoring.
 *
 * PURE, deterministic TypeScript: no network, no DB, no LLM. Turns the other
 * Stage B module outputs into a 0–100 sub-score per aspect plus a route-adjusted
 * weighted composite. This is the reproducible numeric anchor beneath the LLM's
 * A–F letter grades (the judge is prompted to align its letter to `band` or
 * justify a deviation).
 *
 * Design rules:
 *  - Every signal maps a raw metric to 0–100 via a DOCUMENTED, versioned band
 *    table (see SCORE_BANDS_VERSION), piecewise-linear between named breakpoints.
 *    A band change is a visible, testable diff — same discipline as the DCF's
 *    versioned spread table.
 *  - Aspect score = weighted mean over the signals that had data. Missing signals
 *    are dropped and `dataCompleteness` (0–1) records the fraction of intended
 *    weight actually available — an aspect scored on half its inputs is disclosed,
 *    not silently defaulted.
 *  - Sector routing is honoured: a signal whose metric is in `metricPolicy.suppress`
 *    is skipped (a bank is never scored on Altman/Beneish/DCF/net-debt). An aspect
 *    with no valid signals for the route is `notApplicable`, not a forced grade.
 *  - Every driver is emitted as a TracedNumber (source `computed.scores.<aspect>.
 *    <signal>`) so it renders with provenance and reads as an audit trail.
 *
 * The numeric score is authoritative and reproducible; the letter band is a
 * convenience mapping. All breakpoints are versioned house rules, tunable via
 * the exported constant.
 */

import type { CompanyRouteResult } from "@/pipeline/stageB/sectorRouting";
import type { MetricPolicy } from "@/pipeline/stageB/sectorRouting";
import { windowCagr, type GrowthResult } from "@/pipeline/stageB/growth";
import type { RoicResult, RoicVsWaccSpread, RoteResult, WaccResult } from "@/pipeline/stageB/returns";
import type { CapitalResult } from "@/pipeline/stageB/capital";
import type { FinancialMetricsResult } from "@/pipeline/stageB/financialMetrics";
import { ALTMAN_ZONES, type AltmanVariant, type ForensicsReport } from "@/pipeline/stageB/forensics";
import type { TechnicalsResult } from "@/pipeline/stageB/technicals";
import type { ValuationResult } from "@/pipeline/stageB/valuation";
import type { Grade } from "@/types/core";
import type {
  AspectScore,
  Scoring,
  ScoreAspect,
  TracedNumber,
  ScoreSignal,
} from "@/report/schema";
import { describeScoreEvidence } from "@/pipeline/stageB/scoringEvidence";

/** Versioned band-table id, stamped into the report for auditability. */
export const SCORE_BANDS_VERSION = "SCORE_BANDS_2026_10_AUDIT" as const;

/* ------------------------------------------------------------------------ *
 * Scoring primitives
 * ------------------------------------------------------------------------ */

/** A piecewise-linear breakpoint: [rawInput, score0to100], sorted by input asc. */
type BandPoint = readonly [number, number];

const isNum = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

/**
 * Map a raw metric value to 0–100 by linear interpolation between the nearest
 * two breakpoints; clamped flat outside the first/last breakpoint. `points`
 * must be sorted ascending by input. Returns a value in [0, 100].
 */
export function bandScore(value: number, points: readonly BandPoint[]): number {
  if (points.length === 0) return 50;
  if (value <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (value >= last[0]) return last[1];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    if (value >= x0 && value <= x1) {
      const frac = x1 === x0 ? 0 : (value - x0) / (x1 - x0);
      return y0 + (y1 - y0) * frac;
    }
  }
  return last[1]; // unreachable for sorted input
}

/** Grade-letter bands over the 0–100 composite/aspect score (house rule). */
export function scoreToBand(score: number): Grade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

/** Population standard deviation over finite values; null when < 2 points. */
export function stdev(values: number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v));
  if (xs.length < 2) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

/* ------------------------------------------------------------------------ *
 * Signal + aspect assembly
 * ------------------------------------------------------------------------ */

/** One scored input to an aspect. `raw === null` ⇒ dropped (no data). */
interface Signal {
  /** Stable id -> becomes the driver TracedNumber source suffix. */
  name: string;
  raw: number | null;
  unit: string;
  weight: number;
  band: readonly BandPoint[];
  /** metricPolicy.suppress key that removes this signal for the route, if any. */
  suppressedBy?: string;
  /**
   * Share of the signal's evidence that was actually observed (0–1, default
   * 1). The signal's CONTRIBUTION and its used weight are scaled by it while
   * `totalWeight` keeps the full weight, so a reduced battery (a Piotroski
   * score over 2 of 9 signals) moves the aspect less than a full one and the
   * shortfall shows in `dataCompleteness` instead of hiding behind a full
   * weight.
   */
  evidenceFraction?: number;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * An AspectScore plus the weight bookkeeping the composite needs to distinguish
 * route-INAPPLICABLE evidence (a metric meaningless for this route) from
 * route-applicable evidence that is merely MISSING. Only the AspectScore is
 * persisted; the weight fields are internal to composite assembly.
 */
interface ScoredAspect {
  aspect: AspectScore;
  rawScore: number | null;
  /**
   * Sum of signal weights whose metric is NOT suppressed by the route policy —
   * i.e. the weight this aspect COULD support if every route-applicable input
   * had data. `usedWeight ≤ applicableWeight ≤ totalWeight`.
   */
  applicableWeight: number;
  /** Sum of ALL signal weights (the `dataCompleteness` denominator). */
  totalWeight: number;
  /**
   * True when the aspect is inapplicable to the route as a whole: the caller
   * passed an explicit not-applicable reason (e.g. pre-revenue valuation,
   * financial-route balance sheet) OR the route suppresses every signal. A
   * DEFAULT not-applicable (signals exist for the route but their data is
   * absent) is data-missing, NOT route-inapplicable, so it still counts toward
   * the completeness denominator.
   */
  routeInapplicable: boolean;
}

/**
 * Reduce a signal list into an AspectScore. Signals suppressed by the route
 * policy are removed from the applicable set entirely; signals with no data are
 * dropped from the score but still counted in `totalWeight`. `dataCompleteness`
 * = availableWeight / totalWeight. When nothing survives, the aspect is
 * `notApplicable`.
 */
function scoreAspect(
  aspect: ScoreAspect,
  signals: Signal[],
  weightPct: number,
  asOf: string,
  note: string,
  policy: MetricPolicy,
  notApplicableReason: string | null = null,
  /**
   * Reason shown when no signal had data. Unlike `notApplicableReason`, the
   * aspect stays route-applicable, so its absence still counts as missing
   * evidence in the composite.
   */
  noDataReason: string | null = null,
): ScoredAspect {
  const drivers: TracedNumber[] = [];
  const signalsUsed: ScoreSignal[] = [];
  let acc = 0;
  let usedWeight = 0;
  let applicableWeight = 0;
  const totalWeight = signals.reduce((a, s) => a + s.weight, 0) || 1;

  for (const s of signals) {
    if (s.suppressedBy && policy.suppress.includes(s.suppressedBy)) continue;
    // Applicable to this route (not policy-suppressed), whether or not data exists.
    applicableWeight += s.weight;
    if (!isNum(s.raw)) continue;
    const sub = bandScore(s.raw, s.band);
    const evidence = Math.min(1, Math.max(0, s.evidenceFraction ?? 1));
    if (evidence === 0) continue;
    acc += sub * s.weight * evidence;
    usedWeight += s.weight * evidence;
    signalsUsed.push({ id: s.name, raw: s.raw, unit: s.unit, transformedScore: sub,
      signalWeight: s.weight, evidenceFraction: evidence, effectiveCompositeWeightPct: 0, contributionPoints: 0,
      family: "unclassified", asOf: null, period: null, startDate: null, endDate: null,
      windowYears: null, fallbackReason: null, operands: [],
    });
    drivers.push({
      value: s.raw,
      unit: s.unit,
      source: `computed.scores.${aspect}.${s.name}`,
      asOf: null,
      verified: true, // deterministic, computed from sourced inputs (not model memory)
    });
  }

  if (notApplicableReason !== null || usedWeight === 0) {
    return {
      aspect: {
        score: null,
        band: null,
        weightPct,
        dataCompleteness: 0,
        // D-50 review: null when the route cannot score the aspect at all, so
        // the confidence ceiling does not read "not applicable" as "unscored".
        applicableCompleteness: notApplicableReason !== null || applicableWeight === 0 ? null : 0,
        drivers,
        signals: signalsUsed,
        notApplicableReason:
          notApplicableReason ??
          noDataReason ??
          "no applicable signals available for this route — aspect not scored",
        note,
      },
      applicableWeight,
      rawScore: null,
      totalWeight,
      // Route-inapplicable when the caller declared it, or when the route
      // suppresses EVERY signal (nothing applicable to measure here). A default
      // not-applicable with applicableWeight > 0 is data-missing (still counts
      // against completeness), not route-inapplicable.
      routeInapplicable: notApplicableReason !== null || applicableWeight === 0,
    };
  }

  const score = round2(acc / usedWeight);
  return {
    aspect: {
      score,
      band: scoreToBand(score),
      weightPct,
      dataCompleteness: usedWeight / totalWeight,
      applicableCompleteness: usedWeight / applicableWeight,
      drivers,
      signals: signalsUsed,
      notApplicableReason: null,
      note,
    },
    applicableWeight,
    rawScore: acc / usedWeight,
    totalWeight,
    routeInapplicable: false,
  };
}

/* ------------------------------------------------------------------------ *
 * Per-aspect band tables (see SCORE_BANDS_VERSION) — documented house rules
 * ------------------------------------------------------------------------ */

// Growth-style CAGR (percent): negative bad, strong compounding good.
const CAGR_BAND: readonly BandPoint[] = [
  [-20, 5],
  [0, 35],
  [10, 62],
  [20, 78],
  [35, 92],
  [50, 98],
];
// Margin slope (pp/yr): expanding margins reward, eroding penalise.
const MARGIN_SLOPE_BAND: readonly BandPoint[] = [
  [-5, 18],
  [-1, 42],
  [0, 55],
  [1, 70],
  [3, 88],
];
// ROIC − WACC spread (pp): the value-creation axis.
const SPREAD_BAND: readonly BandPoint[] = [
  [-10, 12],
  [-3, 38],
  [0, 55],
  [5, 75],
  [12, 92],
];
// ROIC level (percent).
const ROIC_LEVEL_BAND: readonly BandPoint[] = [
  [0, 18],
  [8, 45],
  [15, 65],
  [25, 82],
  [40, 95],
];
/**
 * Return on tangible common equity (percent) — the bank/insurer moat signal.
 *
 * Anchored on cost of equity rather than on an industrial ROIC scale: a
 * deposit-funded institution earning ~10% on tangible common equity is roughly
 * covering its cost of capital, which is the neutral point; mid-teens is the
 * level large banks are judged strong at, and sustained 20%+ is exceptional.
 * A versioned house rule like every other band here, pending backtesting.
 */
const ROTE_LEVEL_BAND: readonly BandPoint[] = [
  [0, 12],
  [5, 32],
  [10, 50],
  [15, 72],
  [20, 88],
  [30, 96],
];
// ROIC stability = stdev of the ROIC series (pp): lower = more durable moat.
const ROIC_STABILITY_BAND: readonly BandPoint[] = [
  [1, 90],
  [3, 72],
  [6, 52],
  [12, 30],
  [25, 12],
];
// Gross margin level (percent): pricing power proxy.
const GROSS_MARGIN_BAND: readonly BandPoint[] = [
  [10, 30],
  [30, 52],
  [50, 70],
  [65, 84],
  [80, 94],
];
// Net debt / EBITDA (ratio): net cash best, high leverage worst.
const NET_DEBT_EBITDA_BAND: readonly BandPoint[] = [
  [-1, 92],
  [0, 82],
  [1, 72],
  [2, 60],
  [3, 45],
  [4, 30],
  [6, 12],
];
// Interest coverage (EBIT/interest ratio): higher safer.
const COVERAGE_BAND: readonly BandPoint[] = [
  [1, 18],
  [3, 45],
  [6, 65],
  [10, 80],
  [20, 92],
];
// FCF conversion (FCF/NI fraction).
const FCF_CONVERSION_BAND: readonly BandPoint[] = [
  [0, 18],
  [0.5, 45],
  [0.8, 62],
  [1.0, 76],
  [1.3, 90],
];
// SBC as % of FCF: lower is better (dilution drag).
const SBC_FCF_BAND: readonly BandPoint[] = [
  [0, 90],
  [10, 72],
  [25, 52],
  [50, 30],
  [100, 10],
];
// Share-count annualised change (percent): buybacks (negative) reward.
const SHARE_TREND_BAND: readonly BandPoint[] = [
  [-8, 90],
  [-3, 76],
  [0, 58],
  [3, 40],
  [10, 18],
];
// Buyback price discipline: premium/discount to today (percent, positive = bought below today).
const BUYBACK_DISCIPLINE_BAND: readonly BandPoint[] = [
  [-40, 28],
  [-15, 45],
  [0, 58],
  [20, 75],
  [50, 90],
];
// Piotroski F fraction (score/outOf).
const PIOTROSKI_BAND: readonly BandPoint[] = [
  [0.33, 20],
  [0.55, 48],
  [0.67, 62],
  [0.78, 78],
  [0.89, 90],
  [1.0, 96],
];
// Altman Z-score banded on the ORIGINAL 1968 scale (1.81 distress / 2.99 safe).
// Scores from other variants (private, Z″, Z″-EM) live on different scales and
// MUST be passed through normalizeAltmanForBanding() first.
const ALTMAN_Z_BAND: readonly BandPoint[] = [
  [1.0, 15],
  [1.81, 35],
  [2.5, 55],
  [3.0, 72],
  [5.0, 92],
];

/**
 * Map an Altman score from its variant's scale onto the original 1968 scale
 * (which ALTMAN_Z_BAND is calibrated to) by anchoring the variant's published
 * distress/safe thresholds (ALTMAN_ZONES) to the original's 1.81/2.99. Affine,
 * so relative position inside (and beyond) the grey zone is preserved: a Z″
 * score of 2.7 (safe on the 1.10/2.60 scale) now bands like a safe original
 * score instead of a grey one.
 */
export function normalizeAltmanForBanding(score: number, variant: AltmanVariant): number {
  if (variant === "original") return score;
  const from = ALTMAN_ZONES[variant];
  const to = ALTMAN_ZONES.original;
  const slope = (to.safeAbove - to.distressBelow) / (from.safeAbove - from.distressBelow);
  return to.distressBelow + (score - from.distressBelow) * slope;
}
// Beneish M-score: MORE NEGATIVE is cleaner (flag threshold ≈ -1.78). bandScore
// requires x ASCENDING, so the breakpoints run -4 → -1 (score descending 92 → 22).
const BENEISH_M_BAND: readonly BandPoint[] = [
  [-4.0, 92],
  [-3.0, 82],
  [-2.22, 62],
  [-1.78, 45],
  [-1.0, 22],
];
// |Accruals ratio| (fraction): lower = higher earnings quality.
const ACCRUALS_ABS_BAND: readonly BandPoint[] = [
  [0.02, 82],
  [0.1, 58],
  [0.2, 38],
  [0.4, 16],
];
// SMA50/SMA200 gap (percent): trend strength.
const SMA_GAP_BAND: readonly BandPoint[] = [
  [-10, 22],
  [-2, 44],
  [0, 55],
  [3, 70],
  [10, 86],
];
/**
 * Proximity to the 52-week high: (close / 52-week high − 1) × 100, ≤ 0 (D-48,
 * corrected on review 2026-10-13). George & Hwang (2004) rank on price / 52-week
 * high; the range position (close − low) / (high − low) it replaced ranks
 * differently (a stock 4% off a narrow range's high read 20%). A house
 * convention, not fitted: the paper gives the direction, not these cut points.
 */
const HIGH_PROXIMITY_BAND: readonly BandPoint[] = [
  [-50, 15],
  [-30, 30],
  [-15, 50],
  [-5, 70],
  [0, 85],
];
/**
 * 12-1 month relative strength vs SPY (pp), D-48. A house convention, not
 * fitted: monotone, neutral (50) at zero, anchored on the 3-12 month winner-
 * minus-loser spread of about 1%/month (Jegadeesh & Titman 1993), so +20pp —
 * roughly a year of that spread — reads 75 and the scale flattens at ±30-40pp.
 */
const REL_STRENGTH_12M1M_BAND: readonly BandPoint[] = [
  [-30, 15],
  [0, 50],
  [20, 75],
  [40, 90],
];
/*
 * Bank balance sheet (D-46). House conventions, not fitted. The leverage
 * literature agrees on direction — the simple leverage ratio predicted failure
 * about as well as risk-weighted ratios (Estrella, Park & Peristiani 2000;
 * Haldane & Madouros 2012), and better-capitalised, more deposit-funded banks
 * did better in 2007-08 (Beltratti & Stulz 2012) — but not on cut points.
 */
// Tangible common equity / tangible assets (percent). House cut points on a
// holding-company GAAP ratio, NOT the regulatory leverage ratio: TCE excludes
// preferred stock (which counts in Tier 1) and is read over period-end
// tangible assets, so it runs structurally below Tier 1 leverage, and a bank at
// a cut point is not at a regulatory minimum (review of D-46, 2026-10-13). The
// numbers echo the PCA and Basel leverage lines in scale only.
const TCE_TO_TANGIBLE_ASSETS_BAND: readonly BandPoint[] = [
  [4, 20],
  [5, 35],
  [6, 50],
  [8, 70],
  [10, 85],
  [12, 90],
];
// Net charge-offs / average loans (percent; the FDIC Quarterly Banking Profile
// net charge-off rate definition): lower is better.
const NCO_RATE_BAND: readonly BandPoint[] = [
  [0.25, 85],
  [0.5, 70],
  [1.0, 50],
  [2.0, 25],
  [3.0, 10],
];
// Nonperforming (nonaccrual) loans / loans (percent): lower is better.
const NPL_RATIO_BAND: readonly BandPoint[] = [
  [0.25, 85],
  [0.5, 75],
  [1.0, 60],
  [2.0, 40],
  [4.0, 15],
];
// Loans / deposits (percent). Flat at the low end: custody and trust banks run
// low ratios by design, so a low ratio is never penalised.
const LOANS_TO_DEPOSITS_BAND: readonly BandPoint[] = [
  [80, 80],
  [90, 70],
  [100, 50],
  [110, 30],
  [125, 15],
];
// Valuation: DCF upside (percent) — more upside = more attractive.
const UPSIDE_BAND: readonly BandPoint[] = [
  [-40, 15],
  [-15, 40],
  [0, 55],
  [20, 75],
  [50, 92],
];
// Valuation: own-history multiple RANK among N quarters (0-100) — LOWER =
// cheaper = better. WS6 review (SHOULD-FIX 3): it is a rank within the observed
// sample, never a percentile of a distribution; 8-20 quarters cannot estimate
// one, and every reader-visible surface says rank.
const MULTIPLE_OWN_HISTORY_RANK_BAND: readonly BandPoint[] = [
  [10, 88],
  [25, 74],
  [50, 56],
  [75, 38],
  [90, 20],
];
// Valuation: reverse-DCF market-implied growth MINUS achievable growth (pp).
// Market pricing LESS than achievable ⇒ cheap.
const IMPLIED_VS_ACHIEVABLE_BAND: readonly BandPoint[] = [
  [-15, 90],
  [-5, 70],
  [0, 55],
  [10, 35],
  [25, 15],
];

/* ------------------------------------------------------------------------ *
 * Helper extractors
 * ------------------------------------------------------------------------ */

/**
 * A window's CAGR, but only when the span actually measured IS that window
 * (growth.ts `windowCagr`, shared with the DCF growth anchor). Reading
 * `cagrPct` without checking meant a four-year rate was consumed as the
 * labelled three-year one. The disclosure note alone does not protect a
 * numeric consumer.
 */
function cagr(
  result: { windowYears: number; cagrPct: number | null; actualYears?: number | null }[],
  window: number,
): number | null {
  return windowCagr(result, window).cagrPct;
}

/** 5y CAGR, falling back to 3y then 1y — each only if its span matches. */
function bestCagr(
  rows: { windowYears: number; cagrPct: number | null; actualYears?: number | null }[],
): number | null {
  return cagr(rows, 5) ?? cagr(rows, 3) ?? cagr(rows, 1);
}

/** Latest non-null margin from an oldest→newest series. */
function latestMarginPct(series: { pct: number | null }[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) {
    if (isNum(series[i].pct)) return series[i].pct;
  }
  return null;
}

/** Own-history percentile of a named multiple (valuation, any route). */
function multipleOwnHistoryRank(valuation: ValuationResult, keys: string[]): number | null {
  if (valuation.kind === "pre-revenue") return null;
  const stats = valuation.multiples?.multiples ?? [];
  for (const key of keys) {
    const stat = stats.find((m) => m.key === key);
    const pr = stat?.ownHistory?.percentileRank;
    if (isNum(pr)) return pr;
  }
  return null;
}

/* ------------------------------------------------------------------------ *
 * Composite weight vectors (route-adjusted; each sums to 100)
 * ------------------------------------------------------------------------ */

type WeightVector = Record<ScoreAspect, number>;

const WEIGHTS_GENERAL: WeightVector = {
  fundamentals: 20,
  valuation: 20,
  quality: 15,
  balanceSheet: 15,
  moat: 15,
  leadership: 10,
  technicals: 5,
};
// Financials: balance sheet is capital, credit and funding (not net-debt). It
// is scored on the bank route (D-46) and still drops out for insurers and
// mortgage REITs — tilt toward quality/valuation.
const WEIGHTS_FINANCIAL: WeightVector = {
  fundamentals: 15,
  valuation: 22,
  quality: 26,
  balanceSheet: 10,
  moat: 15,
  leadership: 7,
  technicals: 5,
};
const WEIGHTS_REIT: WeightVector = {
  fundamentals: 15,
  valuation: 25,
  quality: 15,
  balanceSheet: 15,
  moat: 15,
  leadership: 10,
  technicals: 5,
};

function weightsForRoute(route: CompanyRouteResult): WeightVector {
  switch (route.base) {
    case "bank":
    case "insurer":
    case "reit-mortgage":
      return WEIGHTS_FINANCIAL;
    case "reit":
      return WEIGHTS_REIT;
    default:
      return WEIGHTS_GENERAL;
  }
}

/**
 * The bank balance-sheet aspect (D-46): capital, credit and funding. Graded
 * only when tangible common equity / tangible assets AND at least one other
 * input are on file; otherwise unscored for lack of data (still counted as
 * missing evidence, never as route-inapplicable). A withheld NPL ratio — the
 * usual case, since large filers tag nonaccrual loans only by loan class — is
 * dropped and the other weights renormalise, with the gap in completeness.
 */
function bankBalanceSheet(
  fm: FinancialMetricsResult | null,
  weightPct: number,
  asOf: string,
  policy: MetricPolicy,
): ScoredAspect {
  const value = (key: string): number | null => {
    const m = fm?.route === "bank" ? fm.metrics.find((x) => x.key === key) : undefined;
    return m !== undefined && m.withheldReason === null && isNum(m.value) ? m.value : null;
  };
  const signals: Signal[] = [
    { name: "tceToTangibleAssets", raw: value("tangibleLeverage"), unit: "%", weight: 0.4, band: TCE_TO_TANGIBLE_ASSETS_BAND },
    { name: "ncoToAverageLoans", raw: value("ncoToAverageLoans"), unit: "%", weight: 0.25, band: NCO_RATE_BAND },
    { name: "nplRatio", raw: value("nplRatio"), unit: "%", weight: 0.15, band: NPL_RATIO_BAND },
    { name: "loansToDeposits", raw: value("loansToDeposits"), unit: "%", weight: 0.2, band: LOANS_TO_DEPOSITS_BAND },
  ];
  const sufficient = isNum(signals[0].raw) && signals.filter((s) => isNum(s.raw)).length >= 2;
  return scoreAspect(
    "balanceSheet",
    sufficient ? signals : signals.map((s) => ({ ...s, raw: null })),
    weightPct,
    asOf,
    "Bank capital, credit and funding: tangible common equity / tangible assets (weight 0.40), net charge-offs / " +
      "average loans (0.25), nonperforming loans / loans where the filer tags them (0.15) and loans / deposits (0.20). " +
      "The bands are house conventions, not fitted. The capital ratio is a holding-company GAAP ratio that excludes " +
      "preferred stock, so it runs below the regulatory Tier 1 leverage ratio and is not comparable to any regulatory " +
      "minimum or prompt-corrective-action category; the charge-off rate follows the FDIC Quarterly Banking Profile " +
      "definition. A leverage ratio is not comparable across business " +
      "models — custody and trust banks run thin by design — and a low loans / deposits ratio is not penalised for " +
      "the same reason. CET1 is shown when the filer tags it and is never graded, because the largest filers do not " +
      "tag it. No supervisory rating is used.",
    policy,
    null,
    "Not graded: tangible common equity / tangible assets and at least one of net charge-offs / average loans, " +
      "nonperforming loans / loans or loans / deposits are needed, and the filings on hand do not provide them.",
  );
}

/* ------------------------------------------------------------------------ *
 * computeScores — the public entry point
 * ------------------------------------------------------------------------ */

export interface ScoringInputs {
  route: CompanyRouteResult;
  policy: MetricPolicy;
  growth: GrowthResult;
  roic: RoicResult;
  /** Return on tangible common equity — the financial-route capital-return measure. */
  rote: RoteResult;
  roicVsWacc: RoicVsWaccSpread;
  wacc: WaccResult;
  capital: CapitalResult;
  forensics: ForensicsReport;
  technicals: TechnicalsResult;
  valuation: ValuationResult;
  /**
   * Route metrics from financialMetrics.ts. The bank balance sheet (D-46) is
   * graded on four of them; absent ⇒ that aspect is unscored for lack of data.
   */
  financialMetrics?: FinancialMetricsResult | null;
  /** Latest quote price (for DCF upside); null when unavailable. */
  currentPrice: number | null;
  /** Acquired quote observation; generation time is not a substitute. */
  quoteAsOf?: string | null;
  /** Analysis date, separate from each signal's financial measurement date. */
  asOf: string;
}

export function computeScores(inputs: ScoringInputs): Scoring {
  const { route, policy, growth, roic, rote, roicVsWacc, capital, forensics, technicals, valuation } = inputs;
  const weights = weightsForRoute(route);
  const financial = route.base === "bank" || route.base === "insurer" || route.base === "reit-mortgage";
  const currentCapital = capital.current;

  // --- Fundamentals --------------------------------------------------------
  const fundamentals = scoreAspect(
    "fundamentals",
    [
      { name: "revenueCagr", raw: bestCagr(growth.revenueCagrs), unit: "%", weight: 0.35, band: CAGR_BAND },
      { name: "operatingMarginSlope", raw: growth.margins.operating.slopePctPtsPerYear, unit: "pp/yr", weight: 0.3, band: MARGIN_SLOPE_BAND, suppressedBy: "operatingMargin" },
      // GAAP EPS growth is suppressed on routes where it is non-economic (REITs:
      // real-estate depreciation swamps net income, so FFO/AFFO growth leads).
      // Tagged so the route policy drops it instead of scoring fundamentals on a
      // metric the policy forbids displaying.
      { name: "epsCagr", raw: bestCagr(growth.epsDilutedCagrs), unit: "%", weight: 0.2, band: CAGR_BAND, suppressedBy: "epsGrowth" },
      { name: "fcfCagr", raw: bestCagr(growth.fcfCagrs), unit: "%", weight: 0.15, band: CAGR_BAND, suppressedBy: "fcfGrowth" },
    ],
    weights.fundamentals,
    inputs.asOf,
    "Growth + margin trajectory: revenue/EPS/FCF CAGRs and operating-margin slope. EPS CAGR is dropped where the route suppresses GAAP EPS growth (REITs).",
    policy,
  );

  // --- Valuation (route-aware) --------------------------------------------
  const valuationSignals: Signal[] = [];
  if (valuation.kind === "dcf") {
    const perShare = valuation.dcf?.perShare ?? null;
    const upside =
      isNum(perShare) && isNum(inputs.currentPrice) && inputs.currentPrice > 0
        ? (perShare / inputs.currentPrice - 1) * 100
        : null;
    valuationSignals.push({ name: "dcfUpside", raw: upside, unit: "%", weight: 0.4, band: UPSIDE_BAND, suppressedBy: "fcfDcf" });
    const impliedG = valuation.reverseDcf?.impliedRevenueGrowthPct ?? null;
    // The reverse solve and this anchor must describe the SAME fading path.
    // A historical CAGR is not an achievable constant-horizon forecast.
    const achievable = valuation.reverseDcf?.growthPathFamily === "linear-fade-to-terminal"
      ? valuation.reverseDcf.baseRevenueGrowthPct ?? valuation.assumptions?.growthPath.value[0] ?? null
      : null;
    const impliedVsAchievable = isNum(impliedG) && isNum(achievable) ? impliedG - achievable : null;
    valuationSignals.push({ name: "reverseImpliedVsAchievable", raw: impliedVsAchievable, unit: "pp", weight: 0.3, band: IMPLIED_VS_ACHIEVABLE_BAND, suppressedBy: "fcfDcf" });
    valuationSignals.push({ name: "peOwnHistoryRank", raw: multipleOwnHistoryRank(valuation, ["peTtm", "evToEbitda", "priceToFcf"]), unit: "rank", weight: 0.3, band: MULTIPLE_OWN_HISTORY_RANK_BAND });
  } else if (valuation.kind === "excess-return") {
    const cur = valuation.excessReturn?.roePathPct?.value?.[0] ?? null; // current/achievable ROE (path start)
    const implied = valuation.excessReturn?.reverseSolve?.impliedCurrentRoePct ?? null;
    // Match IMPLIED_VS_ACHIEVABLE_BAND's convention: (market-implied − achievable).
    // When the market implies a LOWER starting ROE than the bank actually earns,
    // it is too pessimistic ⇒ cheap ⇒ high score (negative input → high).
    // Both sides are now the SAME quantity — a starting ROE that fades to the
    // cost of equity — so the subtraction is apples-to-apples. It was not while
    // the reverse solve held ROE constant.
    const impliedVsAchievable = isNum(cur) && isNum(implied) ? implied - cur : null;
    valuationSignals.push({ name: "roeImpliedVsAchievable", raw: impliedVsAchievable, unit: "pp", weight: 0.5, band: IMPLIED_VS_ACHIEVABLE_BAND });
    valuationSignals.push({ name: "priceToTbvOwnHistoryRank", raw: multipleOwnHistoryRank(valuation, ["priceToTbv", "priceToBook"]), unit: "rank", weight: 0.5, band: MULTIPLE_OWN_HISTORY_RANK_BAND });
  } else if (valuation.kind === "reit") {
    valuationSignals.push({ name: "pFfoOwnHistoryRank", raw: multipleOwnHistoryRank(valuation, ["priceToFfo", "priceToAffo"]), unit: "rank", weight: 1.0, band: MULTIPLE_OWN_HISTORY_RANK_BAND });
  } else if (valuation.kind === "dcf-suppressed") {
    // Mirror the "dcf" branch's signal shape so dataCompleteness matches the
    // unprofitable overlay's actual scoring behavior from before this fix:
    // dcfUpside/reverseImpliedVsAchievable still count toward totalWeight but
    // are excluded via suppressedBy (no dcf/reverseDcf object exists to source
    // them from), so only peOwnHistoryRank actually scores — same math as the
    // "dcf" branch already produced for unprofitable-overlay routes.
    valuationSignals.push({ name: "dcfUpside", raw: null, unit: "%", weight: 0.4, band: UPSIDE_BAND, suppressedBy: "fcfDcf" });
    valuationSignals.push({ name: "reverseImpliedVsAchievable", raw: null, unit: "pp", weight: 0.3, band: IMPLIED_VS_ACHIEVABLE_BAND, suppressedBy: "fcfDcf" });
    valuationSignals.push({ name: "peOwnHistoryRank", raw: multipleOwnHistoryRank(valuation, ["peTtm", "evToEbitda", "priceToFcf"]), unit: "rank", weight: 0.3, band: MULTIPLE_OWN_HISTORY_RANK_BAND });
  }
  const valuationScore =
    valuation.kind === "pre-revenue"
      ? scoreAspect("valuation", [], weights.valuation, inputs.asOf, "Valuation not modelled for pre-revenue companies (runway framing instead).", policy, "Pre-revenue: no meaningful intrinsic-value model.")
      : scoreAspect(
          "valuation",
          valuationSignals,
          weights.valuation,
          inputs.asOf,
          "Attractiveness vs intrinsic value: DCF upside, reverse-DCF implied vs achievable growth, and where the current " +
            "multiple RANKS among the issuer's own quarters (a rank within the observed 8-20 quarter sample, not a percentile " +
            "of a distribution; N is published beside every rendered rank).",
          policy,
        );

  // --- Quality (value creation + accounting integrity) --------------------
  const piotroskiFrac =
    forensics.piotroski && isNum(forensics.piotroski.score) && forensics.piotroski.outOf > 0
      ? forensics.piotroski.score / forensics.piotroski.outOf
      : null;
  // Financial routes suppress ROIC − WACC because invested capital is undefined
  // when deposits fund the balance sheet; the route's own disclosure names the
  // equity-side spread (return on common equity against the cost of equity) as
  // the value-creation measure to use instead. It is scored here in the same
  // slot, weight and band. Without it, a bank's quality rested on a 3-5 signal
  // Piotroski battery alone (~7% of intended evidence), which swung JPM to F and
  // WFC to A on the same thin basis (2026-10-12 sweep).
  const er = valuation.kind === "excess-return" ? valuation.excessReturn : null;
  const equityReturn = er?.roePathPct?.value?.[0];
  const equityCoe = er?.costOfEquityPct?.value;
  // It REPLACES the ROIC − WACC signal (never added beside it), so the aspect's
  // weights still sum to 1 like every other aspect's.
  const valueCreationSignal: Signal =
    valuation.kind === "excess-return"
      ? {
          name: "equityReturnVsCoeSpread",
          raw: isNum(equityReturn) && isNum(equityCoe) ? equityReturn - equityCoe : null,
          unit: "pp",
          weight: 0.35,
          band: SPREAD_BAND,
        }
      : { name: "roicVsWaccSpread", raw: roicVsWacc.spreadPctPts, unit: "pp", weight: 0.35, band: SPREAD_BAND, suppressedBy: "roicVsWacc" };
  const quality = scoreAspect(
    "quality",
    [
      valueCreationSignal,
      // A reduced battery (7 signals on two years, 3-5 on a financial route)
      // is banded on the same fraction but carries only its share of the
      // evidence: two coin-flip signals must not swing the aspect the way nine
      // do (forensics.ts, METHODOLOGY "Piotroski F, on three scales").
      {
        name: "piotroskiF",
        raw: piotroskiFrac,
        unit: "frac",
        weight: 0.22,
        band: PIOTROSKI_BAND,
        suppressedBy: "piotroskiF",
        evidenceFraction: forensics.piotroski && forensics.piotroski.outOf > 0 ? Math.min(1, forensics.piotroski.outOf / 9) : 1,
      },
      // The driver is the score AFTER the affine map onto the original
      // variant's 1.81/2.99 zones (normalizeAltmanForBanding) — the number the
      // band was calibrated to, not the Z the forensic table prints — and its
      // name says so.
      { name: "altmanZOriginalScale", raw: forensics.altman && isNum(forensics.altman.score) ? normalizeAltmanForBanding(forensics.altman.score, forensics.altman.variant) : null, unit: "z", weight: 0.16, band: ALTMAN_Z_BAND, suppressedBy: "altmanZ" },
      // suppressedBy, like its three sibling accounting-integrity signals: the
      // Sloan accrual ratio is scaled by net operating assets, and NOA subtracts
      // (totalLiabilities − totalDebt) — for a bank that is deposits, its raw
      // material. Scoring it there is the same category error the route already
      // avoids for netDebt, fcfDcf, Altman and Beneish. Untagged, no route
      // policy could exclude it, so financials were graded on a meaningless
      // ratio.
      { name: "accrualsRatioAbs", raw: forensics.accruals && isNum(forensics.accruals.cashFlowAccrualRatio) ? Math.abs(forensics.accruals.cashFlowAccrualRatio) : null, unit: "frac", weight: 0.15, band: ACCRUALS_ABS_BAND, suppressedBy: "accrualsRatio" },
      { name: "beneishM", raw: forensics.beneish?.score ?? null, unit: "m", weight: 0.12, band: BENEISH_M_BAND, suppressedBy: "beneishM" },
    ],
    weights.quality,
    inputs.asOf,
    "Value creation (ROIC−WACC; on financial routes, which are costed on equity alone, the return on common or tangible common equity against the cost of equity instead) and accounting integrity (Piotroski, weighted by the share of its nine signals that were evaluable; plus Altman — banded after an affine map of the variant's zones onto the original 1.81/2.99 scale, which is the value the altmanZOriginalScale driver carries — accruals and Beneish where the route computes them — all three are withheld for financial classifications, whose balance sheets those models were not estimated on).",
    policy,
  );

  // --- Balance sheet & capital --------------------------------------------
  const balanceSheet = route.base === "bank"
    ? bankBalanceSheet(inputs.financialMetrics ?? null, weights.balanceSheet, inputs.asOf, policy)
    : financial
    ? scoreAspect("balanceSheet", [], weights.balanceSheet, inputs.asOf, "Balance-sheet strength for financials is capital-adequacy (CET1/leverage), not net-debt — not modelled in v1.", policy, "Financial route: net-debt/coverage framing not meaningful; capital adequacy not computed.")
    : scoreAspect(
        "balanceSheet",
        [
          { name: "netDebtToEbitda", raw: currentCapital ? currentCapital.netDebtToEbitda : capital.netDebtToEbitda.value, unit: "x", weight: 0.3, band: NET_DEBT_EBITDA_BAND, suppressedBy: "netDebtToEbitda" },
          { name: "interestCoverage", raw: currentCapital ? currentCapital.interestCoverage : capital.interestCoverage.value, unit: "x", weight: 0.2, band: COVERAGE_BAND },
          // WS6 review (SHOULD-FIX 2): graded on the BEFORE-SBC ratio, the
          // definition FCF_CONVERSION_BAND was calibrated on. Grading the
          // after-SBC ratio on the same band silently moved the metric onto a
          // new definition AND charged stock-based compensation twice, since
          // sbcPctOfFcf below already scores it. The driver name states which
          // ratio it is; both ratios are reported.
          { name: "fcfConversionBeforeSbc", raw: currentCapital ? currentCapital.fcfConversionBeforeSbc : capital.fcf.latestConversionBeforeSbc, unit: "frac", weight: 0.2, band: FCF_CONVERSION_BAND },
          { name: "sbcPctOfFcf", raw: currentCapital ? currentCapital.sbcPctOfFcf : capital.sbc.pctOfFcf, unit: "%", weight: 0.15, band: SBC_FCF_BAND },
          // D-49: net share-count change is scored once, under leadership,
          // where it reads as stewardship net of buybacks. Scoring it here as
          // well double-weighted one signal.
        ],
        weights.balanceSheet,
        inputs.asOf,
        `Financial strength on ${currentCapital?.basis ?? "annual"} flows and the corresponding balance date${currentCapital?.asOf ? ` ${currentCapital.asOf}` : ""}. ${currentCapital?.fallbackReason ?? ""} Leverage, coverage, FCF conversion and the cost of stock-based compensation. ` +
          "FCF conversion is graded as free cash flow BEFORE stock-based compensation over net income — the definition " +
          "used by this unbacktested house-rule band; the house-default after-SBC free cash flow is reported beside it, and the SBC " +
          "charge itself is scored exactly once, by SBC as a percentage of free cash flow. Net share-count change is " +
          "scored once, under leadership.",
        policy,
      );

  // --- Moat (durability proxy: ROIC level + stability + gross margin) ------
  const roicStdev = stdev(roic.series.map((r) => r.roicPct).filter(isNum));
  // Exactly ONE capital-return measure is scored, chosen by balance-sheet type,
  // and the two alternatives carry the SAME total weight (0.75) so the moat
  // aspect's completeness denominator is identical either way — adding a third
  // signal would have diluted every non-financial company's published
  // dataCompleteness for no data reason.
  //
  // ROIC's invested capital (debt + equity − cash) is undefined for a
  // deposit-funded institution: debt IS the raw material and cash is an earning
  // asset, which is why a bank's ROIC routinely went non-positive and vanished
  // entirely. ROTE divides the return the common shareholder actually receives
  // by the capital actually at risk, and is the measure the bank route already
  // declared it leads with but never computed.
  // Keyed on ROIC being suppressed, not on ROTE being permitted, so that the
  // DEFAULT for a policy that mentions neither is the ordinary industrial
  // measure. Choosing ROTE by default would silently score every
  // hand-constructed or legacy policy on a bank metric.
  const scoresRote = policy.suppress.includes("roic");
  // Same level/durability split as the industrial branch, at the same total
  // weight. A single year's ROTE carrying the whole 0.75 made the financial
  // moat a point-in-time profitability read with no durability dimension —
  // precisely what a moat proxy is supposed to measure.
  const roteStdev = stdev(rote.series.map((y) => y.rotePct).filter(isNum));
  const moatReturnSignals: Signal[] = scoresRote
    ? [
        { name: "roteLevel", raw: rote.latestRotePct, unit: "%", weight: 0.45, band: ROTE_LEVEL_BAND },
        { name: "roteStability", raw: roteStdev, unit: "pp", weight: 0.3, band: ROIC_STABILITY_BAND },
      ]
    : [
        { name: "roicLevel", raw: roic.latestRoicPct, unit: "%", weight: 0.45, band: ROIC_LEVEL_BAND },
        { name: "roicStability", raw: roicStdev, unit: "pp", weight: 0.3, band: ROIC_STABILITY_BAND },
      ];
  const moat = scoreAspect(
    "moat",
    [
      ...moatReturnSignals,
      // Gross margin is a hard-suppressed metric on some routes (banks: FMP emits
      // garbage revenue−costOfRevenue on an interest-income statement; pre-revenue:
      // no meaningful revenue base). Tagged so the route policy drops this signal
      // rather than scoring moat on a number the policy forbids displaying — a bank
      // with no ROIC framing then reads moat as not-applicable, not a garbage grade.
      { name: "grossMarginLevel", raw: latestMarginPct(growth.margins.gross.series), unit: "%", weight: 0.25, band: GROSS_MARGIN_BAND, suppressedBy: "grossMargin" },
    ],
    weights.moat,
    inputs.asOf,
    "Quantitative moat proxy: level and durability of ROIC plus gross-margin (pricing-power) level; financial routes score return on TANGIBLE COMMON EQUITY instead, since invested capital is undefined for a deposit-funded balance sheet. Gross margin is dropped where the route suppresses it (banks, pre-revenue).",
    policy,
  );

  // --- Leadership (deterministic capital-stewardship proxy) ----------------
  const leadership = scoreAspect(
    "leadership",
    [
      { name: "buybackDiscipline", raw: capital.buybackPriceAnalysis.premiumDiscountPct, unit: "%", weight: 0.3, band: BUYBACK_DISCIPLINE_BAND },
      { name: "capitalDeployment", raw: roicVsWacc.spreadPctPts, unit: "pp", weight: 0.25, band: SPREAD_BAND, suppressedBy: "roicVsWacc" },
      { name: "shareCountTrend", raw: capital.shareCount.annualizedPct, unit: "%", weight: 0.25, band: SHARE_TREND_BAND },
      // D-49: SBC % of revenue is no longer scored here. The SBC charge is
      // scored once (balance sheet, % of FCF) and the dilution it causes is
      // in shareCountTrend net of buybacks; the ratio stays in the capital
      // figures.
    ],
    weights.leadership,
    inputs.asOf,
    "Capital-stewardship proxy (buyback discipline, capital deployment above cost where the route scores it, net share-count change after buybacks, which is scored here only). Stock-based compensation is scored once, under balance sheet as a share of FCF; SBC as a share of revenue is shown with the capital figures, unscored. Qualitative leadership assessed in the analyst grade.",
    policy,
  );

  // --- Technicals ----------------------------------------------------------
  const smaGap =
    isNum(technicals.smaCross.sma50) && isNum(technicals.smaCross.sma200) && technicals.smaCross.sma200 > 0
      ? (technicals.smaCross.sma50 / technicals.smaCross.sma200 - 1) * 100
      : null;
  // D-48: the scored momentum is the 12-1 month window, which skips the
  // latest month. RSI-14 (no standalone predictive evidence) and the 6-month
  // window stay in the technicals section, unscored. Never substituted: a
  // withheld 12-1 window is missing evidence, not a 6- or 12-month read.
  const rs12m1m = technicals.relativeStrength.benchmark.momentum12m1m?.differentialPctPoints ?? null;
  const technicalsScore = scoreAspect(
    "technicals",
    [
      { name: "relStrength12m1m", raw: rs12m1m, unit: "pp", weight: 0.45, band: REL_STRENGTH_12M1M_BAND },
      // suppressedBy: the recent-ipo route already lists "fiftyTwoWeekRange" in
      // its suppress set, but no signal carried the tag, so the policy was
      // inert and a company with a few months of trading was still scored on a
      // "52-week" position it cannot have.
      { name: "pctFromHigh52w", raw: technicals.range52w.pctFromHigh, unit: "%", weight: 0.35, band: HIGH_PROXIMITY_BAND, suppressedBy: "fiftyTwoWeekRange" },
      { name: "smaGap", raw: smaGap, unit: "%", weight: 0.2, band: SMA_GAP_BAND, suppressedBy: "sma200" },
    ],
    weights.technicals,
    inputs.asOf,
    "Momentum and trend: 12-1 month relative strength vs SPY (the latest month skipped), distance below the 52-week high and the SMA50/200 gap. " +
      "Momentum is a 3-12 month tilt that has reversed sharply after market rebounds (Daniel-Moskowitz 2016); it is not an entry-timing signal. " +
      "RSI-14 and the 6-month relative strength are shown for context and not scored; RSI has no standalone predictive evidence.",
    policy,
  );

  const scored = {
    fundamentals,
    valuation: valuationScore,
    quality,
    balanceSheet,
    moat,
    leadership,
    technicals: technicalsScore,
  } satisfies Record<ScoreAspect, ScoredAspect>;

  const aspects = {
    fundamentals: fundamentals.aspect,
    valuation: valuationScore.aspect,
    quality: quality.aspect,
    balanceSheet: balanceSheet.aspect,
    moat: moat.aspect,
    leadership: leadership.aspect,
    technicals: technicalsScore.aspect,
  } satisfies Record<ScoreAspect, AspectScore>;

  // --- Composite: completeness-weighted mean over aspects with a score -----
  // Each aspect enters at route weight × its OWN data completeness, so an aspect
  // scored on a fraction of its intended signals influences the composite in
  // proportion to the data behind it — a well-supported aspect dominates a thin
  // one, instead of the old behaviour where a 20%-sourced aspect carried full
  // weight. The unsupported composite fraction is then regularized to neutral,
  // preventing sparse-but-favorable data from producing an extreme grade.
  //
  // `compWeight` is the evidence actually behind the composite. `maxCompWeight`
  // is the MOST evidence this ROUTE could ever supply — the sum of each aspect's
  // route-applicable weight (route weight × non-suppressed signal fraction),
  // EXCLUDING aspects that are inapplicable to the route entirely. Shrinkage is
  // measured against that route-applicable ceiling, NOT a fixed 100: a metric
  // that is meaningless for the route (a bank's Altman/Beneish/net-debt, a
  // pre-revenue company's DCF) is not missing evidence, so a fully-observed
  // bank/REIT is not structurally capped below A. Genuinely-absent applicable
  // data still shrinks the grade, because it lowers compWeight below the ceiling.
  let compAcc = 0;
  let compWeight = 0;
  let maxCompWeight = 0;
  for (const key of Object.keys(scored) as ScoreAspect[]) {
    const sc = scored[key];
    if (!sc.routeInapplicable) {
      // Route-applicable ceiling: full route weight scaled by the fraction of
      // this aspect's signal weight the route does not suppress.
      maxCompWeight += weights[key] * (sc.applicableWeight / sc.totalWeight);
    }
    if (sc.aspect.score !== null) {
      const eff = weights[key] * sc.aspect.dataCompleteness;
      compAcc += (sc.rawScore ?? sc.aspect.score) * eff;
      compWeight += eff;
    }
  }
  const rawCompositeScore = compWeight > 0 ? compAcc / compWeight : null;
  // Completeness is measured over ROUTE-APPLICABLE evidence (ceiling), so a
  // fully-observed company on ANY route shrinks by 0. Guard the empty ceiling.
  const overallCompleteness = maxCompWeight > 0 ? Math.min(1, compWeight / maxCompWeight) : 0;
  // Missing evidence is uncertainty, not evidence that the remaining favorable
  // signals deserve an extreme grade. Shrink only the unsupported fraction to
  // the neutral midpoint; a fully observed company (for its route) is unchanged.
  const compositeScore = rawCompositeScore !== null
    ? round2(50 + (rawCompositeScore - 50) * overallCompleteness)
    : null;

  const exposures = new Map<string, { family: string; weightPct: number; aboveNeutralPoints: number }>();
  for (const key of Object.keys(scored) as ScoreAspect[]) {
    const sc = scored[key];
    for (const signal of sc.aspect.signals ?? []) {
      Object.assign(signal, describeScoreEvidence(inputs, key, signal.id));
      signal.effectiveCompositeWeightPct = maxCompWeight > 0
        ? 100 * weights[key] * signal.signalWeight * signal.evidenceFraction / sc.totalWeight / maxCompWeight : 0;
      signal.contributionPoints = (signal.transformedScore - 50) * signal.effectiveCompositeWeightPct / 100;
      const exposure = exposures.get(signal.family) ?? { family: signal.family, weightPct: 0, aboveNeutralPoints: 0 };
      exposure.weightPct += signal.effectiveCompositeWeightPct;
      exposure.aboveNeutralPoints += signal.contributionPoints;
      exposures.set(signal.family, exposure);
      const driver = sc.aspect.drivers.find(d => d.source.endsWith(`.${signal.id}`));
      if (driver) { driver.asOf = signal.asOf; driver.period = signal.period; }
    }
  }
  const businessKeys: ScoreAspect[] = ["fundamentals", "quality", "balanceSheet", "moat", "leadership"];
  let businessAcc = 0, businessWeight = 0, businessCeiling = 0;
  for (const key of businessKeys) {
    const sc = scored[key];
    if (!sc.routeInapplicable) businessCeiling += weights[key] * sc.applicableWeight / sc.totalWeight;
    if (sc.rawScore !== null) { const w = weights[key] * sc.aspect.dataCompleteness; businessAcc += (sc.rawScore - 50) * w; businessWeight += w; }
  }
  const businessScore = businessWeight > 0 && businessCeiling > 0 ? round2(50 + businessAcc / businessCeiling) : null;

  return {
    aspects,
    composite: {
      score: compositeScore,
      band: compositeScore !== null ? scoreToBand(compositeScore) : null,
      weights,
      methodology:
        `Route-adjusted, completeness-weighted mean of the seven aspect scores: each aspect enters at route weight × data completeness. The unsupported fraction is then shrunk to the neutral midpoint (50); completeness ${round2(overallCompleteness * 100)}% is measured over route-applicable evidence (metrics the route suppresses or that are meaningless for it are excluded, not counted as missing). Fully observed scores are unchanged on any route, while sparse favorable data cannot create an extreme grade. Bands remain versioned house rules pending outcome backtesting.`,
    },
    bandsVersion: SCORE_BANDS_VERSION,
    factorExposure: [...exposures.values()].sort((a,b)=>b.weightPct-a.weightPct),
    assessments: {
      businessQuality: { score: businessScore, band: businessScore === null ? null : scoreToBand(businessScore), basis: "Completeness-adjusted fundamentals, quality, balance sheet, moat and capital stewardship; excludes price valuation and technical momentum." },
      valuation: { score: aspects.valuation.score, band: aspects.valuation.band, basis: "Price attractiveness under the disclosed valuation assumptions; independent of business-quality summary." },
      evidenceCompleteness: overallCompleteness, calibration: "unbacktested-house-rules",
    },
  };
}
