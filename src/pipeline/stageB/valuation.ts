/**
 * Stage B — valuation engine (own DCF, sensitivity grid, reverse DCF,
 * multiples framework, sector-override models).
 *
 * PURE, deterministic TypeScript: no network, no db, no LLM. Inputs are plain
 * typed rows whose field names match FMP exactly;
 * the integration agent wires the DataBundle into these interfaces.
 *
 * Conventions:
 * - Every rate/percentage field suffixed `Pct` is in PERCENT units (8 = 8%).
 *   Conversion to decimals happens only inside discounting math.
 * - Missing inputs never throw: results carry ManifestEntry-compatible gaps.
 * - FMP zero-for-undisclosed is treated as null where a zero is implausible.
 * - Every "house rule" (clamp/fade/guard) that fires is annotated in notes[].
 * - Full precision is returned everywhere; round only at display time.
 *
 * Methodology source: the valuation methodology (Damodaran-standard).
 */

import { comparePriceCurrency } from "@/pipeline/stageB/priceCurrency";
import { resolveConsolidatedEquity } from "@/pipeline/stageB/ownership";
import { comparablePeers } from "@/pipeline/stageB/peerComparability";
import { commonHolderCapital, constructCommonIncomeQuarterWindow, resolveSecurityBasis, resolveEconomicEquityScope, type CommonIncomeInputs, type SecurityBasisEvidence, type EconomicShareEvidence, type EconomicEquityScope } from "@/pipeline/stageB/securityBasis";
import { incompleteLeaseCoverage, leaseDebtScopeRefusal } from "@/pipeline/stageB/leaseScope";
import type { DebtLikeObligations } from "@/pipeline/stageB/debtLikeObligations";
import { describeFinancialValuation, type FinancialValuationAssumptions } from "@/pipeline/stageB/valuationAssumptions";
import type { CompanyRoute, ManifestEntry, SectorRoute } from "@/types/core";
import { deriveFcf } from "@/pipeline/stageB/financialValues";
import { RATE_REGULATED_UTILITY_SIC } from "@/edgar/sic";
import { leaseDebtConflict, millions, operatingLeaseOutOfDebt, operatingLeaseScopeUnproven, resolveNetDebt } from "@/pipeline/stageB/netDebt";
import { TEMPORARY_EQUITY_REFUSAL_LEAD, temporaryEquityClaims, type TemporaryEquityClaims } from "@/pipeline/stageB/seniorClaims";
import { latestOnOrBeforeWithin } from "@/pipeline/stageB/asOfSelection";
import { metricPolicy, type ReitSubmap } from "@/pipeline/stageB/sectorRouting";
import { CAGR_SPAN_TOLERANCE_YEARS, linearRegressionSlope, yearsBetweenDates } from "@/pipeline/stageB/growth";
import {
  contiguousQuarterWindows,
  normalizeQuarterRows,
} from "@/pipeline/stageB/quarterWindows";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Every DCF assumption carries its value plus a human-readable basis string. */
export interface Assumption<T> {
  value: T;
  basis: string;
}

/** House-rule constants (annotated in notes whenever they fire). */
export const DCF_HORIZON_YEARS = 10;
// docs/METHODOLOGY.md "Growth anchor": clamp starting growth
// g_1 ∈ [−10%, +25%]. (Every other clamp here matches its spec value exactly;
// this one had drifted to [-15, 40], inflating the DCF for high-growth names
// with no analyst estimates — corrected back to spec.)
export const NEAR_TERM_GROWTH_CLAMP_PP: readonly [number, number] = [-10, 25];
export const S2C_CLAMP: readonly [number, number] = [0.5, 5.0];
/** Audit 2026-10-22 A-2: fiscal years of filed revenue and invested capital that establish an issuer's own sales-to-capital. */
export const S2C_HISTORY_MIN_YEARS = 3;
/**
 * Audit 2026-10-22 A-2: the lowest history median read as the issuer's own
 * ratio. Capital-heavy filers sit near 0.15–0.25 (water and electric
 * utilities, pipelines); a median below this is read as a scale error, which
 * would repeat in every year, and the house floor stands.
 */
export const S2C_HISTORY_MIN_RATIO = 0.1;
/**
 * D-65: the clause of the long-term-investments provenance that says what the sales-to-capital denominator does with
 * the holding. `compute.ts` writes it into the filed provenance; the bridge swaps it for the exceed wording when the
 * holding meets or exceeds invested capital (FIN-304), where it would be untrue.
 */
export const LONG_TERM_INVESTMENTS_REMOVED_CLAUSE = "the amount the sales-to-capital denominator removes as non-operating";
export const TERMINAL_G_CAP_PCT = 2.5;

/**
 * Terminal excess-return house rule.
 *
 * The default terminal ROIC equals WACC: growth adds nothing after the
 * explicit horizon. That is McKinsey's recommendation for most firms and it
 * is what the 21-issuer keyless sweep of 2026-09-02 ran on — where it valued
 * every evidenced compounder (Apple at 92% ROIC, Home Depot 22%, Coca-Cola
 * 18%) as if its returns collapsed to the cost of capital in year 11, and
 * graded 19 of 21 large caps D or F on valuation. McKinsey (Valuation,
 * "Estimating continuing value") sets RONIC above WACC only for firms with
 * sustainable advantages, and its ROIC-persistence data show a top-quintile
 * spread over WACC roughly halving over 10-15 years rather than closing;
 * Damodaran allows perpetual excess returns only when they are modest.
 *
 * So: when ROIC exceeded WACC in every one of the last
 * TERMINAL_EXCESS_RETURN_MIN_YEARS+ fiscal years on record, half the median
 * spread is carried in perpetuity, capped at TERMINAL_EXCESS_RETURN_CAP_PP.
 * Anything short of that evidence keeps the default, and the reason is
 * written into the assumption notes.
 *
 * The excess-return equity model (banks, insurers) applies the rule as "at
 * least 4 of the last 5 fiscal years", and a below-hurdle year with material
 * business-combination evidence does not count against it (audit 2026-10-22
 * C-10, owner decision); the FCFF DCF keeps the every-year rule.
 */
export const TERMINAL_EXCESS_RETURN_CAP_PP = 5;
export const TERMINAL_EXCESS_RETURN_MIN_YEARS = 4;
/**
 * HOUSE CONVENTION (owner decision, audit 2026-10-22 C-10): the excess-return
 * model's fiscal-year start is shown beside the headline when it differs from
 * the trailing start by more than this many percentage points.
 */
export const EXCESS_RETURN_START_GAP_PP = 5;
export const TERMINAL_EXCESS_RETURN_CARRY = 0.5;
/** Below this carried spread the evidence is noise; the default applies. */
export const TERMINAL_EXCESS_RETURN_MIN_PP = 0.5;
/** Base-case Gordon TV guard: require WACC − g_term ≥ 2.0pp (docs/METHODOLOGY.md "Fade and horizon"). */
export const TV_GUARD_PP = 2.0;
/**
 * Sensitivity-grid cells use a LOOSER guard than the base case (docs/METHODOLOGY.md,
 * Fade and horizon): a cell renders "n/m" only when WACC − g_term < 1.5%. Reusing
 * the 2.0pp base-case guard nulled corner cells the grid exists to show.
 */
export const GRID_TV_GUARD_PP = 1.5;
export const MARGIN_CLAMP_PP: readonly [number, number] = [-20, 45];
export const MARGIN_WARN_BAND_PP: readonly [number, number] = [0, 35];
export const MARGIN_FADE_YEARS = 5;
/** Dated margin slope needed to classify a clear improving/declining regime. */
export const MARGIN_TREND_THRESHOLD_PP_PER_YEAR = 0.5;
/**
 * AMZN audit 2026-10-20: the share of an improving regime's dated slope the
 * fade carries over the fade years. Half the trend, and never past the
 * scenario margin ceiling (docs/METHODOLOGY.md "Fade and horizon").
 */
export const IMPROVING_MARGIN_TREND_SHARE = 0.5;
/** Terminal-growth axis of the sensitivity grid (pp around the base terminal growth). */
export const SENSITIVITY_STEPS_PP: readonly number[] = [-1, -0.5, 0, 0.5, 1];
/**
 * D-60: WACC axis of the sensitivity grid, ±200bp in 100bp steps. A ±100bp
 * axis spanned less than the uncertainty in a single regression beta (NVDA:
 * each 100bp of WACC moved the value by $20-40 a share).
 */
export const SENSITIVITY_WACC_STEPS_PP: readonly number[] = [-2, -1, 0, 1, 2];
export const REVERSE_GROWTH_RANGE_PCT: readonly [number, number] = [-20, 60];
export const REVERSE_MARGIN_RANGE_PCT: readonly [number, number] = [0, 60];
export const REVERSE_PRESCAN_POINTS = 17;
export const BISECTION_TOL_PP = 0.01; // 1bp of growth/margin
export const BISECTION_MAX_ITER = 80;
export const EXCESS_RETURN_YEARS = 10;
/**
 * Bisection bracket for the excess-return reverse solve.
 *
 * MUST span the reachable value range of the objective it inverts. When that
 * objective became the FADE path, [0, 40] stopped covering it: the invertible
 * window collapsed to roughly [0.60x, 2.79x] book, so a bank trading below
 * ~0.6x book (routine for a distressed or sub-book bank) and an insurer above
 * ~2.8x both fell outside the bracket and returned null — dropping the
 * 0.5-weight valuation signal entirely.
 *
 * A negative lower bound is not a modelling artefact: a loss-making issuer has
 * a genuinely negative ROE, and the solve must be able to say so.
 */
export const REVERSE_ROE_RANGE_PCT: readonly [number, number] = [-40, 80];
export const PAYOUT_CLAMP_PCT: readonly [number, number] = [0, 90];
export const MIN_PEERS_FOR_STATS = 4;
export const MIN_HISTORY_OBS_FOR_BAND = 8;
/** Full 5-year own-history window (deriveOwnHistory caps here). Below it, bands are flagged low-sample. */
export const FULL_OWN_HISTORY_OBS = 20;

const isNum = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** Guarded division: null on missing/zero/non-finite denominator. */
export function safeDiv(
  num: number | null | undefined,
  den: number | null | undefined,
): number | null {
  if (!isNum(num) || !isNum(den) || den === 0) return null;
  const r = num / den;
  return Number.isFinite(r) ? r : null;
}

/** FMP emits 0 for undisclosed items — null where a zero is implausible. */
const zeroAsNull = (v: number | null | undefined): number | null =>
  isNum(v) && v !== 0 ? v : null;

const posOrNull = (v: number | null | undefined): number | null =>
  isNum(v) && v > 0 ? v : null;

const fmtNum = (v: number): string => String(Math.round(v * 100) / 100);
/** An exact amount for reader text, digits grouped ("42,783,000,000"), at fmtNum's two-decimal precision. */
const fmtGrouped = (v: number): string => (Math.round(v * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });

const gapEntry = (
  field: string,
  reason: string,
  severity: ManifestEntry["severity"],
): ManifestEntry => ({ field, reason, severity });

/**
 * Audit 2026-10-22 A-2: the issuer's own sales-to-capital, the median of the
 * newest five fiscal years with revenue and positive invested capital filed
 * for the same date. Invested capital is measured as the DCF measures the
 * current balance: debt (excluding operating leases when the current balance
 * does) + temporary equity (FIN-119-V1: redeemable preferred and redeemable
 * NCI are financing capital) + consolidated equity - cash and short-term
 * investments - long-term investments, a year whose holding meets or exceeds its
 * capital counting at the house cap (FIN-304). A year whose
 * temporary equity is refused is skipped with a note, never zero-filled.
 * Fewer than three years: no ratio.
 *
 * FIN-303: one median is on one lease basis, the current balance's (D-25). The
 * FCX-1 mode (`fcx1Excluded`) subtracts every row's disclosed operating lease
 * and skips a row without one. Otherwise, with the lease-inclusive switch set
 * or a current row that keeps its lease (its scope unproven), every row keeps
 * its debt as reported; else each row subtracts `operatingLeaseOutOfDebt`, and
 * a row with an operating lease the predicate cannot prove inside its total
 * debt is left out with a note, never kept lease-inclusive beside
 * lease-excluded years.
 */
export function establishedSalesToCapital(
  incomeHistory: DcfIncomeRow[],
  capitalHistory: DcfBalanceRow[] | null,
  lease: { fcx1Excluded: boolean; includeLeasesInEv: boolean; currentRowExcludesLease: boolean },
): { ratio: number | null; basis: string } {
  const revenueByDate = new Map(incomeHistory.flatMap((r) => isNum(r.revenue) && r.revenue > 0 ? [[r.date.slice(0, 10), r.revenue] as const] : []));
  const years = new Map<string, number>();
  const refused: string[] = [];
  const unprovenLease = new Map<string, string>();
  const cappedYears = new Set<string>();
  const removeLease = !lease.includeLeasesInEv && lease.currentRowExcludesLease;
  for (const row of capitalHistory ?? []) {
    const date = row.date.slice(0, 10);
    const revenue = revenueByDate.get(date);
    let leaseOut = 0;
    if (lease.fcx1Excluded) leaseOut = isNum(row.operatingLeaseLiability) ? row.operatingLeaseLiability : NaN;
    else if (removeLease) {
      const proof = operatingLeaseOutOfDebt(row, false);
      if (proof.clause !== null) {
        if (revenue !== undefined && !unprovenLease.has(date)) unprovenLease.set(date, proof.clause);
        continue;
      }
      leaseOut = proof.amount;
    }
    const debt = isNum(row.totalDebt) ? row.totalDebt - leaseOut : NaN;
    const equity = resolveConsolidatedEquity(row).value;
    if (revenue === undefined || years.has(date) || !Number.isFinite(debt) || equity === null || !isNum(row.cashAndShortTermInvestments)) continue;
    const temporary = temporaryEquityClaims(row);
    if (temporary !== null && temporary.refusal !== null) { refused.push(`FY${date}`); continue; }
    const ic = debt + equity + (temporary === null ? 0 : temporary.total) - row.cashAndShortTermInvestments;
    const lti = isNum(row.longTermInvestments) && row.longTermInvestments > 0 ? row.longTermInvestments : 0;
    // FIN-304: a holding that meets or exceeds the year's capital leaves no operating capital; the ratio approaches the
    // house cap from below, so the year counts at the cap (never revenue over the full capital).
    if (ic > 0) {
      years.set(date, ic - lti > 0 ? revenue / (ic - lti) : S2C_CLAMP[1]);
      if (ic - lti <= 0) cappedYears.add(date);
    }
  }
  const newest = [...years].sort(([a], [b]) => b.localeCompare(a)).slice(0, 5);
  const atCap = (d: string) => cappedYears.has(d) ? " (house cap: holding >= capital, FIN-304)" : "";
  const skipped = (refused.length === 0 ? "" : `; ${refused.join(", ")} left out: a temporary-equity operand was refused, so that year's invested capital is unknown (FIN-119-V1)`) +
    [...unprovenLease].filter(([d]) => !years.has(d)).map(([d, note]) => `; FY${d} left out: ${note} - the year cannot be put on the current balance's lease-excluded basis, so it is not kept lease-inclusive beside lease-excluded years (FIN-303)`).join("");
  if (newest.length < S2C_HISTORY_MIN_YEARS) {
    return { ratio: null, basis: `the issuer's filings show ${newest.length} fiscal year${newest.length === 1 ? "" : "s"} of filed revenue and invested capital; three are required to establish its own ratio (audit 2026-10-22 A-2)${skipped}` };
  }
  const ratio = medianOf(newest.map(([, r]) => r)) as number;
  const list = newest.map(([d, r]) => `FY${d} ${r.toFixed(4)}x${atCap(d)}`).join(", ");
  if (ratio < S2C_HISTORY_MIN_RATIO) {
    return { ratio: null, basis: `its filed history's median ${ratio.toFixed(4)}x is below ${S2C_HISTORY_MIN_RATIO}, the lowest ratio read as the issuer's own (${list}), so it is not used (audit 2026-10-22 A-2)${skipped}` };
  }
  return {
    ratio,
    basis: ratio < S2C_CLAMP[0]
      ? `revenue / operating invested capital ${list}; median ${ratio.toFixed(4)}x over ${newest.length} fiscal years (audit 2026-10-22 A-2)${skipped}`
      : `history establishes ${ratio.toFixed(4)}x, not below the house floor (${list}; audit 2026-10-22 A-2)${skipped}`,
  };
}

/** Clamp with a note appended when the clamp actually fires. */
function clampWithNote(
  v: number,
  lo: number,
  hi: number,
  label: string,
  notes: string[],
  range = `house rule range [${lo}, ${hi}]`,
): number {
  if (v < lo) {
    notes.push(`${label} clamped ${fmtNum(v)} -> ${fmtNum(lo)} (${range})`);
    return lo;
  }
  if (v > hi) {
    notes.push(`${label} clamped ${fmtNum(v)} -> ${fmtNum(hi)} (${range})`);
    return hi;
  }
  return v;
}

/**
 * Linear fade from startPct (year 1) to endPct (year `years`), inclusive.
 * Exported because reverseDcf's margin fallback rebuilds paths with it and
 * tests must reproduce the exact same construction.
 */
export function fadePath(startPct: number, endPct: number, years: number): number[] {
  if (years <= 0) return [];
  if (years === 1) return [endPct];
  return Array.from(
    { length: years },
    (_, i) => startPct + ((endPct - startPct) * i) / (years - 1),
  );
}

/**
 * D-58: the growth path's excess over the terminal rate halves every this many
 * years. Chan, Karceski and Lakonishok (2003) find growth beyond one or two
 * years is not persistent, so the gap closes fastest at the start instead of
 * evenly over the horizon. A house convention pending the point-in-time
 * backtest (docs/RESEARCH.md §8.2, §8.7).
 */
export const GROWTH_FADE_HALF_LIFE_YEARS = 3;

/**
 * Weight of the starting gap left in each explicit year: 1 in year 1, 0 in the
 * final year, decaying geometrically with GROWTH_FADE_HALF_LIFE_YEARS and
 * rescaled so the path reaches the terminal rate exactly in year `years`.
 */
export function convergentFadeWeights(years: number): number[] {
  if (years <= 0) return [];
  if (years === 1) return [0];
  const phi = Math.pow(0.5, 1 / GROWTH_FADE_HALF_LIFE_YEARS);
  const tail = Math.pow(phi, years - 1);
  return Array.from({ length: years }, (_, i) => (Math.pow(phi, i) - tail) / (1 - tail));
}

/** D-58: convergent (convex) fade from startPct in year 1 to endPct in year `years`. */
export function convergentFadePath(startPct: number, endPct: number, years: number): number[] {
  return convergentFadeWeights(years).map((w) => endPct + (startPct - endPct) * w);
}

/** D-58: 15% global minimum tax (OECD Pillar Two GloBE rules) floors the terminal tax rate. */
export const GLOBAL_MINIMUM_TAX_PCT = 15;

/**
 * D-58: national statutory corporate rates by issuer domicile (ISO 3166
 * alpha-2). Only rates with a primary source are listed; sub-national taxes
 * are excluded, so each is a floor rather than the full marginal rate.
 */
export const STATUTORY_MARGINAL_TAX_PCT: Readonly<Record<string, { pct: number; source: string }>> = {
  US: { pct: 21, source: "US federal corporate rate, 26 U.S.C. §11(b); state taxes excluded" },
};

/**
 * D-58: the marginal-rate floor for an issuer domicile: the sourced statutory
 * rate, never below the global minimum, and the global minimum alone where no
 * statutory rate is sourced. Shared by the DCF's terminal tax and ROIC's
 * loss-year NOPAT (AMZN audit 2026-10-20 finding 9).
 */
export function marginalTaxFloor(domicileCountry: string | null | undefined): { pct: number; basis: string } {
  const domicile = (domicileCountry ?? "").trim().toUpperCase();
  const statutory = STATUTORY_MARGINAL_TAX_PCT[domicile] ?? null;
  return {
    pct: Math.max(GLOBAL_MINIMUM_TAX_PCT, statutory?.pct ?? 0),
    basis: statutory === null
      ? `the ${GLOBAL_MINIMUM_TAX_PCT}% global minimum tax (OECD Pillar Two; no sourced statutory rate for domicile ${domicile || "unknown"})`
      : `max(statutory ${statutory.pct}% — ${statutory.source} — and the ${GLOBAL_MINIMUM_TAX_PCT}% global minimum tax, OECD Pillar Two)`,
  };
}

/** Years from the TTM window's midpoint to the latest quarter's midpoint (4.5 months). */
const TTM_TO_LATEST_QUARTER_YEARS = 4.5 / 12;
/** Years from the latest quarter's midpoint to the year-one window's midpoint (7.5 months). */
const LATEST_QUARTER_TO_YEAR_ONE_YEARS = 7.5 / 12;
/** Years from the guided next quarter's midpoint to the year-one window's midpoint (4.5 months). */
const GUIDED_QUARTER_TO_YEAR_ONE_YEARS = 4.5 / 12;
/** Day span that makes two quarter ends the same fiscal quarter a year apart (52/53-week calendars). */
const YEAR_AGO_QUARTER_DAYS: readonly [number, number] = [350, 380];
/** Day span that makes a guided quarter the one after the latest reported quarter. */
const NEXT_QUARTER_DAYS: readonly [number, number] = [80, 100];
/** A calendarized consensus window must be this fully covered by fiscal-year estimates. */
const CONSENSUS_COVERAGE_MIN = 0.97;

/**
 * D-65: a fiscal-year estimate anchors a DCF year only when at least this many
 * analysts contribute a revenue estimate. A mean of one or two forecasts is a
 * forecaster's view, not a consensus, and dispersion is undefined below two
 * (Diether, Malloy and Scherbina 2002 measure it only with two or more); three
 * gives the low-high range an interior point. Unbacktested house convention.
 */
export const MIN_CONSENSUS_ANALYSTS = 3;
/**
 * D-65: and only while the analysts agree on the level: the implied
 * coefficient of variation, (high − low) / (d2(n) × mean), may not exceed
 * this. The raw range widens with the number of forecasters, so it is
 * normalised by d2(n), the expected range of n normal draws (Tippett 1925),
 * which turns it into an estimate of one standard deviation. At 25% one
 * standard deviation of disagreement already spans half the level; wider than
 * that the mean no longer pins a level (dispersion as uncertainty: Barron,
 * Kim, Lim and Stevens 1998). Unbacktested house convention (RESEARCH §8).
 */
export const MAX_CONSENSUS_CV_PCT = 25;

/**
 * Expected range of n independent standard normal draws (the d2 constant of
 * range charts; Harter 1960 tables). Linear between tabulated n, held at
 * d2(50) above it, which overstates the implied dispersion of a larger panel
 * and so errs toward not anchoring.
 */
const D2_TABLE: readonly (readonly [number, number])[] = [
  [2, 1.128], [3, 1.693], [4, 2.059], [5, 2.326], [6, 2.534], [7, 2.704], [8, 2.847], [9, 2.97], [10, 3.078],
  [11, 3.173], [12, 3.258], [13, 3.336], [14, 3.407], [15, 3.472], [16, 3.532], [17, 3.588], [18, 3.64], [19, 3.689],
  [20, 3.735], [21, 3.778], [22, 3.819], [23, 3.858], [24, 3.895], [25, 3.931], [30, 4.086], [35, 4.213], [40, 4.322],
  [45, 4.415], [50, 4.498],
];
export function expectedNormalRange(n: number): number | null {
  if (!Number.isFinite(n) || n < 2) return null;
  const last = D2_TABLE[D2_TABLE.length - 1];
  if (n >= last[0]) return last[1];
  for (let i = 1; i < D2_TABLE.length; i++) {
    const [n1, d1] = D2_TABLE[i];
    const [n0, d0] = D2_TABLE[i - 1];
    if (n <= n1) return d0 + ((d1 - d0) * (n - n0)) / (n1 - n0);
  }
  return last[1];
}

/** D-65: implied coefficient of variation (percent) of one fiscal-year revenue estimate; null without a count and range. */
export function consensusDispersionPct(row: AnalystEstimateRow): number | null {
  const mean = posOrNull(row.revenueAvg);
  const n = isNum(row.analysts) ? row.analysts : null;
  if (mean === null || n === null || !isNum(row.revenueLow) || !isNum(row.revenueHigh) || row.revenueHigh < row.revenueLow) return null;
  const d2 = expectedNormalRange(n);
  if (d2 === null) return null;
  return ((row.revenueHigh - row.revenueLow) / (d2 * mean)) * 100;
}

const DAY_MS = 24 * 3600 * 1000;
function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(from);
  const b = Date.parse(to);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / DAY_MS) : null;
}

const fmtMoney = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 1e12) return `${fmtNum(v / 1e12)}T`;
  if (a >= 1e9) return `${fmtNum(v / 1e9)}B`;
  if (a >= 1e6) return `${fmtNum(v / 1e6)}M`;
  return fmtNum(v);
};

/**
 * D-58: the annualized revenue run-rate at the latest quarter, seasonally
 * neutral. Latest quarter × 4 overstates a seasonal peak quarter and
 * understates a trough, so the run-rate is the TTM carried 4.5 months forward
 * (TTM midpoint to latest-quarter midpoint) at the latest quarter's
 * year-over-year growth, which has no seasonal component — bounded by the TTM
 * and latest quarter × 4, the two levels actually observed. Null without the
 * same fiscal quarter a year earlier.
 */
export function revenueRunRate(
  ttmRevenue: number,
  ttmEnd: string,
  quarters: DcfQuarterRevenue | null | undefined,
): RevenueRunRate | null {
  if (!quarters || quarters.yearAgo === null || quarters.latest.date !== ttmEnd) return null;
  const latest = posOrNull(quarters.latest.revenue);
  const yearAgo = posOrNull(quarters.yearAgo.revenue);
  const days = daysBetween(quarters.yearAgo.date, quarters.latest.date);
  if (latest === null || yearAgo === null || days === null || days < YEAR_AGO_QUARTER_DAYS[0] || days > YEAR_AGO_QUARTER_DAYS[1]) {
    return null;
  }
  const annualized = 4 * latest;
  const seasonallyNeutral = ttmRevenue * Math.pow(latest / yearAgo, TTM_TO_LATEST_QUARTER_YEARS);
  const value = Math.min(Math.max(seasonallyNeutral, Math.min(annualized, ttmRevenue)), Math.max(annualized, ttmRevenue));
  return { value, latestQuarterEnd: ttmEnd, latestQuarterAnnualized: annualized, seasonallyNeutral, yoyPct: (latest / yearAgo - 1) * 100 };
}

/**
 * D-58: consensus revenue for one forecast window, calendarized from
 * fiscal-year estimates by day overlap (each fiscal year's revenue spread
 * evenly over its days, or by the issuer's quarterly shape when one is given).
 * Null unless the estimates cover the window.
 */
export function calendarizedConsensus(
  rows: AnalystEstimateRow[] | null,
  window: { startDate: string; endDate: string },
  reported?: FiscalYearToDate | null,
  seasonality?: RevenueSeasonality | null,
): number | null {
  return calendarizeConsensusWindow(rows, window, reported, seasonality).value;
}

/**
 * AMZN audit 2026-10-20 finding 19: each fiscal quarter's share of the last
 * complete fiscal year's revenue, first quarter first, or null unless the
 * four reported quarters are consecutive 13/14-week quarters ending on that
 * year's end, each with positive revenue.
 */
export function seasonalQuarterShares(seasonality: RevenueSeasonality | null | undefined): number[] | null {
  const quarters = seasonality?.quarters;
  if (!seasonality || !quarters || quarters.length !== 4 || quarters[3].date !== seasonality.fiscalYearEnd) return null;
  for (let i = 0; i < 4; i++) {
    if (posOrNull(quarters[i].revenue) === null) return null;
    const span = i === 0 ? 91 : daysBetween(quarters[i - 1].date, quarters[i].date);
    if (span === null || span < 84 || span > 98) return null;
  }
  const total = quarters.reduce((sum, q) => sum + q.revenue, 0);
  return quarters.map((q) => q.revenue / total);
}

/** The UTC instant `months` calendar months after `start`, its day clamped to the month's last day. */
function addMonthsUtc(start: number, months: number): number {
  const d = new Date(start);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months + 1, 0)).getUTCDate();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, Math.min(d.getUTCDate(), lastDay));
}

/**
 * AMZN audit 2026-10-20 finding 19: the share of a fiscal year's revenue that
 * falls in [from, to) when its twelve months take the quarterly shape, each
 * quarter's share spread evenly over its three months and each month's over
 * its days.
 */
function seasonalFiscalYearShare(fyBegin: number, fyEnd: number, from: number, to: number, shares: number[]): number {
  let total = 0;
  for (let m = 0; m < 12; m++) {
    const a = Math.min(fyEnd, addMonthsUtc(fyBegin, m));
    const b = m === 11 ? fyEnd : Math.min(fyEnd, addMonthsUtc(fyBegin, m + 1));
    const overlap = Math.min(to, b) - Math.max(from, a);
    if (overlap > 0 && b > a) total += (shares[Math.floor(m / 3)] / 3) * (overlap / (b - a));
  }
  return total;
}

/**
 * D-58/D-65: the calendarized window and the fiscal-year estimates behind it.
 * D-65: when the issuer has already reported part of a fiscal year that
 * overlaps the window, that year contributes its consensus LESS the reported
 * revenue, spread over its unreported days (NVDA FY2027: $409.80B − $177.84B
 * reported for H1 = $231.96B for 2026-07-27..2027-01-25, where an even spread
 * gave $205.5B). A consensus at or below what is already reported is stale
 * and leaves the window uncovered.
 */
export function calendarizeConsensusWindow(
  rows: AnalystEstimateRow[] | null,
  window: { startDate: string; endDate: string },
  reported?: FiscalYearToDate | null,
  seasonality?: RevenueSeasonality | null,
): { value: number | null; fiscalYears: ConsensusPathRow["fiscalYears"]; staleAgainstReported: boolean; partialSpread: "seasonal" | "even" | null } {
  const empty = { value: null, fiscalYears: [], staleAgainstReported: false, partialSpread: null };
  // AMZN audit 2026-10-20 finding 19: the quarterly shape applies to estimates
  // for fiscal years ending on an anniversary (within 10 days) of the year it
  // was measured in; any other year keeps the even spread.
  const shares = seasonalQuarterShares(seasonality);
  const sharesFor = (date: string): number[] | null => {
    const days = shares === null ? null : daysBetween((seasonality as RevenueSeasonality).fiscalYearEnd, date);
    return days !== null && Math.abs(days - Math.round(days / 365.2425) * 365.2425) <= 10 ? shares : null;
  };
  let partialSpread: "seasonal" | "even" | null = null;
  if (!rows) return empty;
  const windowStart = Date.parse(window.startDate);
  const windowEnd = Date.parse(window.endDate) + DAY_MS;
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || windowEnd <= windowStart) return empty;
  const byDate = new Map<string, AnalystEstimateRow & { revenueAvg: number }>();
  for (const row of rows) {
    const revenue = posOrNull(row.revenueAvg);
    if (revenue !== null && /^\d{4}-\d{2}-\d{2}$/.test(row.date.slice(0, 10))) byDate.set(row.date.slice(0, 10), { ...row, revenueAvg: revenue });
  }
  const reportedEnd = reported && posOrNull(reported.revenue) !== null ? Date.parse(reported.through) : Number.NaN;
  let total = 0;
  let covered = 0;
  let stale = false;
  const fiscalYears: ConsensusPathRow["fiscalYears"] = [];
  let previousEnd: string | null = null;
  for (const [date, row] of [...byDate].sort(([a], [b]) => a.localeCompare(b))) {
    const fy = forecastYearPeriod(date, 0, "fiscal-year");
    if (fy === null) continue;
    // A 52/53-week year starts the day after the previous estimate's year
    // end, not on a calendar anniversary, so adjacent years never share a day.
    const span = previousEnd === null ? null : daysBetween(previousEnd, date);
    const chained = previousEnd !== null && span !== null && span >= YEAR_AGO_QUARTER_DAYS[0] && span <= YEAR_AGO_QUARTER_DAYS[1];
    let fyStart = chained ? Date.parse(previousEnd as string) + DAY_MS : Date.parse(fy.startDate);
    const fyBegin = fyStart;
    previousEnd = date;
    const fyEnd = Date.parse(fy.endDate) + DAY_MS;
    let revenue = row.revenueAvg;
    let reportedToDate: number | undefined;
    // D-65: the fiscal year the reported quarters belong to (its prior year
    // end a fiscal year before this estimate's end, the reported days inside it).
    const priorGap = reported ? daysBetween(reported.priorFiscalYearEnd, date) : null;
    if (reported && Number.isFinite(reportedEnd) && priorGap !== null && priorGap >= YEAR_AGO_QUARTER_DAYS[0] && priorGap <= YEAR_AGO_QUARTER_DAYS[1]
      && reportedEnd + DAY_MS > fyStart && reportedEnd + DAY_MS < fyEnd) {
      if (revenue - reported.revenue <= 0) {
        stale = true;
        continue;
      }
      revenue -= reported.revenue;
      reportedToDate = reported.revenue;
      fyStart = reportedEnd + DAY_MS;
    }
    const overlap = Math.min(windowEnd, fyEnd) - Math.max(windowStart, fyStart);
    if (overlap <= 0) continue;
    const yearShares = sharesFor(date);
    if (yearShares === null) {
      total += (revenue * overlap) / (fyEnd - fyStart);
    } else {
      // The unreported part of the year takes its share of the shape.
      total += revenue * seasonalFiscalYearShare(fyBegin, fyEnd, Math.max(windowStart, fyStart), Math.min(windowEnd, fyEnd), yearShares)
        / seasonalFiscalYearShare(fyBegin, fyEnd, fyStart, fyEnd, yearShares);
    }
    if (overlap < fyEnd - fyStart) partialSpread = yearShares === null || partialSpread === "even" ? "even" : "seasonal";
    covered += overlap;
    fiscalYears.push({
      date, revenue: row.revenueAvg, analysts: isNum(row.analysts) ? row.analysts : null,
      dispersionPct: consensusDispersionPct(row), days: Math.round(overlap / DAY_MS),
      ...(reportedToDate !== undefined ? { reportedToDate } : {}),
    });
  }
  const span = windowEnd - windowStart;
  const value = covered >= CONSENSUS_COVERAGE_MIN * span && covered <= (2 - CONSENSUS_COVERAGE_MIN) * span ? total : null;
  return { value, fiscalYears, staleAgainstReported: stale, partialSpread };
}

/** Linear-interpolated quantile (p in [0,1]) over finite values. */
export function quantile(values: number[], p: number): number | null {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (s.length === 0) return null;
  const idx = Math.min(Math.max(p, 0), 1) * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

export const medianOf = (values: number[]): number | null => quantile(values, 0.5);

/**
 * Percentile rank (0–100) of v within values, linear interpolation between
 * order statistics, with tolerance-aware tied midranks. Flat samples are
 * uninformative and return null. Needs >= 2 finite values.
 */
export function percentileRank(values: number[], v: number): number | null {
  const s = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (s.length < 2 || !Number.isFinite(v)) return null;
  const tied = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  if (tied(s[0], s[s.length - 1])) return null;
  const tiedIndices = s.flatMap((x, i) => tied(x, v) ? [i] : []);
  if (tiedIndices.length > 0) return ((tiedIndices[0] + tiedIndices[tiedIndices.length - 1]) / 2 / (s.length - 1)) * 100;
  if (v <= s[0]) return 0;
  if (v >= s[s.length - 1]) return 100;
  for (let i = 0; i < s.length - 1; i++) {
    if (v >= s[i] && v <= s[i + 1]) {
      const frac = s[i + 1] === s[i] ? 0 : (v - s[i]) / (s[i + 1] - s[i]);
      return ((i + frac) / (s.length - 1)) * 100;
    }
  }
  return null; // unreachable for finite sorted input
}

// ---------------------------------------------------------------------------
// DCF assumptions
// ---------------------------------------------------------------------------

/** Annual analyst-estimate row (FMP /stable/analyst-estimates field names). */
export interface AnalystEstimateRow {
  /** Fiscal period end the estimate refers to (ISO). */
  date: string;
  revenueAvg: number | null;
  /** D-65: number of analysts behind the revenue estimate (FMP numAnalystsRevenue); absent when the provider gives none. */
  analysts?: number | null;
  /** D-65: lowest and highest analyst revenue estimate. */
  revenueLow?: number | null;
  revenueHigh?: number | null;
}

/**
 * D-65: revenue the issuer has already reported inside the fiscal year that
 * holds the start of the first forecast window (NVDA: Q1 + Q2 FY2027 =
 * $177.84B through 2026-07-26). The window takes that year's consensus less
 * this, instead of an even share of the whole year.
 */
export interface FiscalYearToDate {
  /** End of the previous fiscal year (the day before this fiscal year starts). */
  priorFiscalYearEnd: string;
  /** Last day reported (the TTM end). */
  through: string;
  revenue: number;
  quarters: number;
}

/**
 * AMZN audit 2026-10-20 finding 19: the four reported quarterly revenues of the
 * issuer's last complete fiscal year, oldest first, in the model currency. They
 * give each fiscal year's consensus its seasonal shape when it is calendarized.
 */
export interface RevenueSeasonality {
  /** The last complete fiscal year's end; the fourth quarter ends on it. */
  fiscalYearEnd: string;
  quarters: { date: string; revenue: number }[];
}

/** D-65: one forecast window set against calendarized consensus. */
export interface ConsensusPathRow {
  year: number;
  label: string;
  startDate: string;
  endDate: string;
  /** Calendarized consensus revenue; null when the estimates do not cover the window. */
  consensus: number | null;
  /** True when this year's growth came from consensus. */
  anchored: boolean;
  /** Why the year is or is not anchored. */
  status: string;
  /** Fiscal-year estimates behind the window. */
  fiscalYears: { date: string; revenue: number; analysts: number | null; dispersionPct: number | null; days: number; reportedToDate?: number }[];
}

/** Income-statement slice used by the DCF builder (FMP field names). */
export interface DcfIncomeRow {
  date: string;
  /** Four-quarter TTM or the latest audited annual statement when TTM is unavailable. */
  basis?: "ttm" | "annual";
  revenue: number | null;
  operatingIncome: number | null;
  /** D-60: gross profit, for the scenario operating-margin ceiling; absent or null leaves the ceiling unavailable. */
  grossProfit?: number | null;
  incomeBeforeTax?: number | null;
  incomeTaxExpense?: number | null;
}

/** Selected whole balance-sheet slice used by the DCF builder (FMP field names). */
export interface DcfBalanceRow {
  fieldProvenance?: import("./leaseScope").LeaseScopeRow["fieldProvenance"];
  operatingLeaseLiability?: number | null;
  financeLeaseLiability?: number | null;
  capitalLeaseObligations?: number | null;
  /** The financing components that prove a partial operating lease's scope (audit 2026-10-19 FCX-1). */
  shortTermDebt?: number | null;
  longTermDebt?: number | null;
  leaseCoverageNote?: string;
  date: string;
  basis: "quarter" | "annual";
  totalDebt: number | null;
  totalStockholdersEquity: number | null;
  /** Consolidated equity is used once; otherwise parent equity plus signed NCI. */
  totalEquity?: number | null;
  minorityInterest?: number | null;
  /** FIN-119-V1: temporary equity is financing capital (read through `temporaryEquityClaims`; a refusal rides in `fieldConflicts`). */
  temporaryEquity?: number | null;
  temporaryEquityAttributableToParent?: number | null;
  temporaryEquityAttributableToNoncontrollingInterest?: number | null;
  fieldConflicts?: Record<string, { usable?: boolean; reason?: string } | undefined>;
  cashAndShortTermInvestments: number | null;
  /** D-60: non-operating long-term investments, removed from the sales-to-capital denominator when reported. */
  longTermInvestments?: number | null;
}

/** WS6 (D-19): SBC treatment, with the reported FCF before and after it. */
export interface DcfSbcTreatment {
  beforeSbc: number | null;
  afterSbc: number | null;
  sbc: number | null;
  asOf: string | null;
  basis: string;
}

/**
 * WS6 (D-18): log-linear revenue trend over every annual year on record
 * (growth.ts `logLinearGrowth`). Structural, so the DCF does not depend on the
 * whole GrowthResult.
 */
export interface DcfRevenueTrend {
  growthPct: number | null;
  rSquared: number | null;
  n: number;
  startDate: string | null;
  endDate: string | null;
}

export interface DcfAssumptionInputs {
  /**
   * FIN-303 (D-25): the lease-inclusive switch (`METIS_EV_INCLUDE_LEASES`, from `runStageB`'s `evIncludeLeases`).
   * Absent is false, the default: sales-to-capital and its A-2 history remove the proven operating-lease slice
   * from debt exactly when the equity bridge does.
   */
  includeLeasesInEv?: boolean;
  /** 3y revenue CAGR in percent (computed upstream from statements); null when unavailable. */
  revenueCagr3yPct: number | null;
  /** 5y revenue CAGR in percent — one of the growth-anchor methods (D-18). */
  revenueCagr5yPct?: number | null;
  /**
   * D-39: the measured span of a 3y / 5y CAGR that was computed but excluded
   * because that span is not its window (growth.ts `windowCagr`). The method
   * is then listed as unavailable with this span. Absent or null means the
   * CAGR is either the window's own or was not computed at all.
   */
  revenueCagr3yExcludedSpanYears?: number | null;
  revenueCagr5yExcludedSpanYears?: number | null;
  /**
   * WS6 (D-18): the log-linear regression method of the growth anchor. Absent
   * or null makes it an unavailable method, named as such in the basis.
   */
  revenueLogLinear?: DcfRevenueTrend | null;
  /**
   * WS6 (D-19): the WACC disclosure sentence (returns.ts `waccDisclosure`),
   * printed verbatim in the assumption block so the discount rate is never an
   * unattributed percentage.
   */
  waccBasis?: string | null;
  /**
   * WS6 (D-19): the reported free-cash-flow metric before and after the SBC
   * deduction (capital.ts). The FCFF DCF does not consume FCF — it projects
   * EBIT, which already expenses SBC — but the assumption block must show the
   * adjustment so the two numbers a reader sees are never silently different
   * definitions.
   */
  fcfSbc?: DcfSbcTreatment | null;
  /** Forward annual analyst estimates (FMP names); null/empty when uncovered. */
  analystEstimates: AnalystEstimateRow[] | null;
  /**
   * The provider's rate-limit refusal when that, not coverage, is why
   * `analystEstimates` is null (AMZN audit 2026-10-20, finding 2). It makes the
   * analyst-growth record name the cause and mark the valuation degraded.
   */
  analystEstimatesRefusal?: string | null;
  waccPct: number;
  riskFreePct: number;
  /**
   * Statements' reportedCurrency (ADR guard, 2026-07-09 audit H3). When it
   * differs from quoteCurrency the DCF per-share would be in reported currency
   * against a quote-currency price — valueCompany suppresses the DCF instead
   * (mirroring the multiples currencyMismatch flag; no FX conversion).
   */
  reportedCurrency?: string | null;
  /** Listing/trading currency of the quote and market cap. */
  quoteCurrency?: string | null;
  /** Base income statement: four-quarter TTM, or an explicitly labeled annual fallback. */
  incomeTtm: DcfIncomeRow | null;
  /**
   * Audit item 15 (FCX-9): tagged one-off items inside the base period's
   * operating income, removed from the margin seed in both directions.
   */
  unusualOperatingItems?: import("./unusualItems").UnusualOperatingItems | null;
  /** Annual income history (any order; used for 5y median margin + trend). */
  incomeHistory: DcfIncomeRow[];
  /** Selected newest whole balance row; required invested-capital fields fail closed. */
  balance: DcfBalanceRow | null;
  /**
   * FIN-103: why `balance` is not dated at the statement date, when it is not
   * (`dcfBridgeRow`), so the basis and the info gap state only what was checked.
   */
  bridgeCause?: { cause: "statement-row" | "none-filed" | "incomplete" | "statement-row-refused" | "anchor-refused"; detail: string | null };
  /**
   * Audit 2026-10-22 A-2: annual balance rows (any order), measured like
   * `balance`. With the income history they show whether the issuer's own
   * filings establish a sales-to-capital below the house floor. Omitted or
   * null: the house floor applies, as before.
   */
  capitalHistory?: DcfBalanceRow[] | null;
  marketCap: number | null;
  /**
   * Annual ROIC history (any order; the newest five count), the evidence
   * behind the terminal excess-return house rule. Omitted or null: the
   * terminal ROIC stays at WACC without comment.
   */
  roicHistory?: DcfRoicYear[] | null;
  /**
   * D-58: the TTM window's newest quarter and the same fiscal quarter a year
   * earlier, both in the model currency. They set the seasonally neutral
   * run-rate the year-one revenue anchor is measured against. Omitted or
   * null: the anchor is measured against the TTM, as before D-58.
   */
  quarterRevenue?: DcfQuarterRevenue | null;
  /** D-58: next-quarter management guidance in the model currency; null when none was ingested. */
  guidance?: DcfGuidance | null;
  /** D-58: issuer domicile (ISO 3166 alpha-2), for the statutory marginal tax floor. */
  domicileCountry?: string | null;
  /** D-65: revenue already reported in the fiscal year the first window starts in. */
  fiscalYearToDate?: FiscalYearToDate | null;
  /**
   * AMZN audit 2026-10-20 finding 19: the last complete fiscal year's four
   * reported quarters. Omitted or null: consensus is spread evenly over each
   * fiscal year's days.
   */
  revenueSeasonality?: RevenueSeasonality | null;
  /**
   * D-65: the date the value is compared with a price (the quote date). Cash
   * flows discounted to the statement date are rolled forward to it at the
   * WACC. Omitted or not after the statement date: no roll-forward.
   */
  valuationDate?: string | null;
}

/** D-58: the run-rate quarters (revenue in the model currency). */
export interface DcfQuarterRevenue {
  latest: { date: string; revenue: number | null };
  yearAgo: { date: string; revenue: number | null } | null;
  /** The same fiscal quarter a year before the guided quarter, model currency (AMZN audit 2026-10-20). */
  guidedYearAgo?: { date: string; revenue: number | null } | null;
}

/** D-58: management's outlook for the next fiscal quarter (an 8-K earnings release). */
export interface DcfGuidance {
  /** Guided revenue for the next fiscal quarter (midpoint), model currency. */
  revenue: number;
  /** Guided quarter's period end (ISO date). */
  periodEnd: string;
  /** Date the guidance was published (ISO date). */
  asOf: string;
  /** Provenance tag of the release. */
  source: string;
  /** Guided operating (EBIT) margin, percent, when the outlook implies one. */
  operatingMarginPct?: number | null;
  /** D-60: low end of the guided revenue range, when the outlook gives one. */
  revenueLow?: number | null;
  /** Optional quarterly range and identity for an admitted annual comparison. */
  revenueHigh?: number | null;
  currency?: string;
  fiscalYear?: number;
  /** Comparison evidence only; this fiscal-year range never replaces NTM. */
  annualRevenueComparison?: { periodLabel: string; fiscalYear: number; low: number; high: number; currency: string; source: string; asOf: string };
  /** D-60: guided GAAP effective tax rate (percent) and the period it covers, when the same release gives one. */
  taxRatePct?: number | null;
  taxRatePeriod?: string | null;
  /** D-60: low end of the guided GAAP gross margin, percent. */
  grossMarginLowPct?: number | null;
}

/** D-58: the seasonally neutral annualized revenue run-rate at the latest quarter. */
export interface RevenueRunRate {
  value: number;
  latestQuarterEnd: string;
  /** Latest quarter × 4. */
  latestQuarterAnnualized: number;
  /** TTM carried 4.5 months forward at the latest quarter's year-over-year growth. */
  seasonallyNeutral: number;
  /** Latest quarter's year-over-year revenue growth, percent. */
  yoyPct: number;
}

/** D-58: what set the year-one (and year-two) revenue level. */
export interface RevenueAnchor {
  source: "guidance" | "consensus" | "run-rate" | "ttm";
  yearOneRevenue: number;
  /** Year-one growth over the start revenue, percent (growthPath[0]). */
  yearOneGrowthPct: number;
  /** Year-two growth from consensus, percent, when consensus anchored year two. */
  yearTwoGrowthPct: number | null;
  /**
   * D-65: the growth of every anchored year in order (year one first): year
   * one from the anchor source, each later entry from consensus. The fade
   * starts after the last entry. Absent on assumptions built before D-65.
   */
  anchoredGrowthPct?: number[];
  /** D-65: the 1-based years whose growth came from consensus. */
  consensusYears?: number[];
  /** D-65: every explicit window against calendarized consensus, anchored or not. */
  consensusPath?: ConsensusPathRow[];
  runRate: RevenueRunRate | null;
  /** The unclamped year-one revenue when the house clamp moved it; null otherwise. */
  clampedFrom: number | null;
  basis: string;
  /**
   * D-60 evidence beside the level actually used, so the reverse DCF and the
   * report can set the price against it. Absent on assumptions built before D-60.
   */
  evidence?: {
    /** Next-quarter guidance × 4 (the guided run-rate). */
    guidedRunRate: number | null;
    /** Guided quarter over the latest reported quarter, annualized, percent. */
    guidedPacePct: number | null;
    /** Guided quarter over the same quarter a year earlier, percent; absent before the AMZN audit 2026-10-20. */
    guidedYoyPct?: number | null;
    /** Calendarized consensus for the year-one and year-two windows. */
    consensusYearOne: number | null;
    consensusYearTwo: number | null;
    /** Whether the near-term growth rate (median of methods, clamped) set any year-one level. */
    nearTermRateUsed: boolean;
    /** The guided quarter itself, for observable checkpoints. */
    guidedQuarter?: { periodEnd: string; revenueLow: number; revenueMid: number; grossMarginLowPct: number | null; source: string; asOf: string } | null;
  };
}

export interface DcfRoicYear {
  date: string;
  roicPct: number | null;
  /**
   * WS6 (D-19): that fiscal year's OWN WACC, recomputed from the risk-free
   * observation at its year end (returns.ts `waccByFiscalYear`). Absent or
   * null means the current WACC is applied to that year and the note says so.
   */
  waccPct?: number | null;
  /** Date of the risk-free observation behind `waccPct`. */
  waccAsOf?: string | null;
  /**
   * Audit 2026-10-22 C-10: material business-combination evidence for this
   * fiscal year (excessReturnStart.ts `businessCombinationYears`), printed
   * beside the year. Under the four-of-five rule a below-hurdle year carrying
   * it does not count against the terminal carry.
   */
  combinationEvidence?: string | null;
}

export interface TerminalRoic {
  roicTermPct: number;
  /** Excess return carried in perpetuity, percentage points above WACC (0 = default). */
  excessPp: number;
  basis: string;
  /** Why the default held when history was supplied; null when none is owed. */
  note: string | null;
  /**
   * WS6 (D-19): how each fiscal year's ROIC was compared to a cost of capital.
   * "per-year" when at least one year carried its own recomputed WACC,
   * "current" when the single current WACC was applied to every year,
   * "none" when no history was supplied.
   */
  waccBasis: "per-year" | "current" | "none";
  /** The comparison sentence, so the assumption block can state it verbatim. */
  waccBasisNote: string | null;
}

const TERMINAL_ROIC_DEFAULT_BASIS =
  "terminal ROIC = WACC (zero excess returns in perpetuity, HOUSE CONVENTION default — see docs/METHODOLOGY.md, \"Terminal value house convention\")";

/**
 * Apply the terminal excess-return HOUSE CONVENTION (see
 * TERMINAL_EXCESS_RETURN_CAP_PP). It is not a standard: it is this app's own
 * convention, and it is labelled as such wherever it is printed.
 *
 * WS6 (D-19): each fiscal year is compared to its OWN WACC when the caller
 * supplied one (recomputed from that year end's risk-free observation); years
 * without one fall back to the current WACC and the note says which happened.
 */
export function terminalRoic(
  waccPct: number,
  history: DcfRoicYear[] | null,
  /**
   * The return and hurdle names printed in the basis and notes. The excess-return
   * equity model applies this same convention to ROTE (or common ROE) against
   * the cost of equity, so its disclosures must not say ROIC and WACC.
   */
  labels: { ret: string; rate: string } = { ret: "ROIC", rate: "WACC" },
  /**
   * "every-year" (the FCFF DCF): the return beat the hurdle in every one of the
   * last 4+ years. "four-of-five" (the excess-return model, audit 2026-10-22
   * C-10): in at least 4 of the last 5, where a below-hurdle year with
   * business-combination evidence is set aside rather than counted as a miss.
   */
  options: { rule?: "every-year" | "four-of-five" } = {},
): TerminalRoic {
  const { ret: RET, rate: RATE } = labels;
  const fourOfFive = options.rule === "four-of-five";
  const hold = (
    note: string | null,
    waccBasis: TerminalRoic["waccBasis"],
    waccBasisNote: string | null,
  ): TerminalRoic => ({
    roicTermPct: waccPct,
    excessPp: 0,
    basis:
      RET === "ROIC"
        ? TERMINAL_ROIC_DEFAULT_BASIS
        : `terminal ${RET} = ${RATE} (zero excess returns in perpetuity, HOUSE CONVENTION default — see docs/METHODOLOGY.md)`,
    note,
    waccBasis,
    waccBasisNote,
  });
  if (history === null) return hold(null, "none", null);
  // The four-of-five rule reads the latest five fiscal years as filed: a year
  // whose return is unestablished stays in that window as non-evidence, so an
  // older year cannot fill it (C-10).
  const byDate = [...history].sort((a, b) => b.date.localeCompare(a.date));
  const window = fourOfFive ? byDate.slice(0, 5) : byDate;
  const years = window
    .filter((y): y is DcfRoicYear & { roicPct: number } => isNum(y.roicPct))
    .slice(0, 5);
  const n = years.length;
  const lastN = fourOfFive ? window.length : n;
  const unestablishedText = fourOfFive && window.length > n
    ? `; ${window.filter((y) => !isNum(y.roicPct)).map((y) => y.date).join(", ")} not established, so not evidence`
    : "";
  // Each year against its own cost of capital when one was recomputed for it.
  const waccForYear = (y: DcfRoicYear): number => (isNum(y.waccPct) ? y.waccPct : waccPct);
  const perYear = years.filter((y) => isNum(y.waccPct));
  const currentOnly = years.filter((y) => !isNum(y.waccPct));
  // N5: with a history supplied but NO year carrying a computable ROIC there is
  // no ROIC-vs-WACC comparison at all, so blaming a missing per-year risk-free
  // observation misstated the cause. Report "none" and say nothing about rates;
  // the `n < TERMINAL_EXCESS_RETURN_MIN_YEARS` branch below already names the
  // real reason ("0 fiscal years of ROIC on record").
  const waccBasis: TerminalRoic["waccBasis"] =
    n === 0 ? "none" : perYear.length > 0 ? "per-year" : "current";
  const waccBasisNote =
    n === 0
      ? null
      : perYear.length === 0
      ? `${RET}-vs-${RATE} history compares every fiscal year to the CURRENT ${RATE} ${fmtNum(waccPct)}% — no per-year risk-free observation was available to recompute a year-specific ${RATE}`
      : `${RET}-vs-${RATE} history uses each fiscal year's own ${RATE}, recomputed from that year end's risk-free observation (${perYear
          .map((y) => `${y.date}: ${fmtNum(waccForYear(y))}%${y.waccAsOf ? ` (rf as of ${y.waccAsOf})` : ""}`)
          .join(", ")})` +
        (currentOnly.length > 0
          ? `; the current ${RATE} ${fmtNum(waccPct)}% was applied to ${currentOnly
              .map((y) => y.date)
              .join(", ")}, which had no usable risk-free observation`
          : "");
  if (n < TERMINAL_EXCESS_RETURN_MIN_YEARS) {
    return hold(
      `terminal ${RET} held at ${RATE}: ${n} fiscal year${n === 1 ? "" : "s"} of ${RET} on record, ${TERMINAL_EXCESS_RETURN_MIN_YEARS} needed to evidence durable excess returns (house convention)`,
      waccBasis,
      waccBasisNote,
    );
  }
  const below = years.filter((y) => y.roicPct <= waccForYear(y));
  // At most one combination year is set aside (the latest), so set-aside years
  // never stand in for the evidence; any other counts as a miss.
  const combinationBelow = fourOfFive
    ? below.filter((y) => typeof y.combinationEvidence === "string" && y.combinationEvidence !== "").sort((a, b) => b.date.localeCompare(a.date))
    : [];
  const setAside = combinationBelow.slice(0, 1);
  const misses = below.filter((y) => !setAside.includes(y));
  const above = n - below.length;
  const missText = (list: typeof years): string =>
    list.map((y) => `${y.date}: ${RET} ${fmtNum(y.roicPct)}% vs ${RATE} ${fmtNum(waccForYear(y))}%`).join("; ");
  const setAsideText = setAside.length === 0
    ? ""
    : `; set aside as business-combination year${setAside.length === 1 ? "" : "s"}, not counted as a miss: ${setAside.map((y) => `${y.date} (${RET} ${fmtNum(y.roicPct)}% vs ${RATE} ${fmtNum(waccForYear(y))}%, ${y.combinationEvidence})`).join("; ")}` +
      (combinationBelow.length > 1 ? `; only one business-combination year is set aside, so ${combinationBelow.slice(1).map((y) => y.date).join(", ")} count${combinationBelow.length === 2 ? "s" : ""} as ${combinationBelow.length === 2 ? "a miss" : "misses"}` : "");
  const combinationAbove = fourOfFive
    ? years.filter((y) => !below.includes(y) && typeof y.combinationEvidence === "string" && y.combinationEvidence !== "")
    : [];
  const annotatedText = combinationAbove.length === 0
    ? ""
    : `; business-combination year${combinationAbove.length === 1 ? "" : "s"} (above the hurdle, annotated): ${combinationAbove.map((y) => `${y.date} (${y.combinationEvidence})`).join("; ")}`;
  if (fourOfFive && above + setAside.length < TERMINAL_EXCESS_RETURN_MIN_YEARS) {
    return hold(
      `terminal ${RET} held at ${RATE}: ${RET} beat that year's ${RATE} in only ${above} of the last ${lastN} fiscal years (${missText(misses)}${setAsideText}${unestablishedText}) — at least ${TERMINAL_EXCESS_RETURN_MIN_YEARS} of the last 5 are needed to evidence durable excess returns (house convention)`,
      waccBasis,
      waccBasisNote,
    );
  }
  if (!fourOfFive && below.length > 0) {
    return hold(
      `terminal ${RET} held at ${RATE}: ${RET} was at or below that year's ${RATE} in ${below.length} of the last ${n} fiscal years (${below
        .map((y) => `${y.date}: ${RET} ${fmtNum(y.roicPct)}% vs ${RATE} ${fmtNum(waccForYear(y))}%`)
        .join("; ")}) — excess returns not evidenced as durable (house convention)`,
      waccBasis,
      waccBasisNote,
    );
  }
  // A set-aside combination year is not evidence either way, so it stays out of the median too.
  const counted = years.filter((y) => !setAside.includes(y));
  const spreads = counted.map((y) => y.roicPct - waccForYear(y));
  const median = medianOf(spreads) as number;
  const excess = Math.min(TERMINAL_EXCESS_RETURN_CAP_PP, TERMINAL_EXCESS_RETURN_CARRY * median);
  if (excess < TERMINAL_EXCESS_RETURN_MIN_PP) {
    return hold(
      fourOfFive
        ? `terminal ${RET} held at ${RATE}: ${RET} exceeded ${RATE} in ${above} of the last ${lastN} fiscal years${setAsideText}${unestablishedText}${annotatedText} but the median spread ${fmtNum(median)}pp is too thin to carry (house convention floor ${TERMINAL_EXCESS_RETURN_MIN_PP}pp)`
        : `terminal ${RET} held at ${RATE}: ${RET} exceeded ${RATE} in all ${n} fiscal years but the median spread ${fmtNum(median)}pp is too thin to carry (house convention floor ${TERMINAL_EXCESS_RETURN_MIN_PP}pp)`,
      waccBasis,
      waccBasisNote,
    );
  }
  const oldest = years[n - 1].date;
  const newest = years[0].date;
  return {
    roicTermPct: waccPct + excess,
    excessPp: excess,
    basis:
      `terminal ${RET} = ${RATE} ${fmtNum(waccPct)}% + ${fmtNum(excess)}pp evidenced excess return: ` +
      (fourOfFive
        ? `${RET} exceeded ${RATE} in ${above} of the last ${lastN} fiscal years` +
          (above < TERMINAL_EXCESS_RETURN_MIN_YEARS && setAside.length > 0
            ? `, and the set-aside business-combination year counts toward the at least ${TERMINAL_EXCESS_RETURN_MIN_YEARS} of the last 5 required `
            : `, at least ${TERMINAL_EXCESS_RETURN_MIN_YEARS} of the last 5 being required `) +
          `(${oldest} to ${newest}${misses.length > 0 ? `; miss: ${missText(misses)}` : ""}${setAsideText}${unestablishedText}${annotatedText}; median spread ${fmtNum(median)}pp over the years counted); `
        : `${RET} exceeded ${RATE} in each of the last ${n} fiscal years (${oldest} to ${newest}, median spread ${fmtNum(median)}pp); `) +
      `half the spread is carried in perpetuity, capped at ${TERMINAL_EXCESS_RETURN_CAP_PP}pp ` +
      "(HOUSE CONVENTION after McKinsey's RONIC guidance and Damodaran's modest-excess-return cap — not a standard; see docs/METHODOLOGY.md)",
    note: null,
    waccBasis,
    waccBasisNote,
  };
}

/** WS6 (D-18): one method of the growth anchor and what it produced. */
export interface GrowthAnchorMethod {
  name: string;
  valuePct: number | null;
  /** Value with its fit statistics / window, or the reason it was unavailable. */
  detail: string;
}

/** WS6 (D-18): median-of-methods near-term growth anchor. */
export interface GrowthAnchor {
  /**
   * The year-one growth the DCF actually fades from — the median of the
   * available methods AFTER the near-term clamp (WS6 review, SHOULD-FIX 1).
   * It used to carry the pre-clamp median, so the assumption table could print
   * a 65% anchor beside a 25% year-one growth taken from the same anchor.
   */
  pointPct: number;
  /**
   * The pre-clamp median, present ONLY when the clamp actually moved the value.
   * Undefined means the anchor is the median untouched.
   */
  preClampMedianPct?: number;
  /** Min..max across the available methods; null when only one was available. */
  rangePct: [number, number] | null;
  methods: GrowthAnchorMethod[];
  /** Names of the methods that could not be computed. */
  unavailable: string[];
  basis: string;
}

export interface DcfAssumptions {
  /** Exact basis of the revenue anchor; absent on legacy/manual assumptions. */
  forecastPeriod?: { basis: "rolling-12-month" | "fiscal-year"; anchorEndDate: string; anchorStartDate: string | null };
  startRevenue: Assumption<number>;
  /** Explicit horizon (default 10). */
  years: number;
  /** WS6 (D-19): the discount rate with every input named. */
  wacc: Assumption<number>;
  /** WS6 (D-19): SBC treatment, with the reported FCF before and after it. */
  sbc: Assumption<DcfSbcTreatment>;
  /** WS6 (D-18): the growth anchor's methods, point estimate and range. */
  growthAnchor: GrowthAnchor;
  /** D-58: what set the year-one/two revenue level; absent on assumptions built before D-58. */
  revenueAnchor?: RevenueAnchor;
  /** Revenue growth per explicit year, percent, length === years. */
  growthPath: Assumption<number[]>;
  /** EBIT margin per explicit year, percent, length === years. */
  ebitMarginPath: Assumption<number[]>;
  /** Company-specific effective tax rate per explicit year, percent. */
  taxRatePath: Assumption<number[]>;
  salesToCapital: Assumption<number>;
  terminal: {
    gTermPct: Assumption<number>;
    /** Terminal ROIC, percent — default = WACC (zero excess returns). */
    roicTermPct: Assumption<number>;
    /** Terminal reinvestment rate as a FRACTION of NOPAT: g / ROIC. */
    reinvestmentRate: Assumption<number>;
  };
  midYear: Assumption<boolean>;
  /**
   * D-60: the highest operating margin a bull/bear scenario may reach. Null
   * when gross profit is not on record; absent on assumptions built before D-60.
   */
  scenarioMarginCeiling?: ScenarioMarginCeiling | null;
  /**
   * AMZN audit 2026-10-20: present only when an improving regime faded the
   * margin up, so runStageB can show the value with the margin held flat.
   */
  improvingMarginFade?: { currentPct: number; targetPct: number };
  /**
   * D-65: the date the value is stated at. The explicit years are windows
   * from the statement date, so their flows are discounted from it; every
   * discount exponent then moves back by `elapsedYears`, which rolls the whole
   * value forward to the quote date at the WACC. Absent or 0: the value is at
   * the statement date (assumptions built before D-65, or no later quote).
   */
  valuationDate?: { value: string; elapsedYears: number; basis: string };
  /**
   * D-65: long-term investments the sales-to-capital denominator removed as
   * non-operating (D-60). The equity bridge adds back exactly this amount, so
   * an asset left out of operating capital is never left out of value too.
   * FIN-304: recorded whenever the balance carries a holding; `basis` is set
   * only when the denominator does not remove the holding, and it replaces, in
   * the bridge line's provenance, the clause saying it does. Either the holding
   * meets or exceeds a positive invested capital, so nothing is left to remove
   * from operating capital and sales-to-capital takes the house cap (the bridge
   * still adds the holding back), or the lease-emptied path (capital already
   * non-positive) takes the issuer's own history for the ratio.
   */
  nonOperatingInvestments?: { value: number; balanceDate: string; basis?: string };
  /**
   * AMZN audit 2026-10-20: the rate at which the bridge taxes the non-operating
   * investments it adds — the marginal-rate floor the terminal tax converges
   * to (D-58) — applied to their whole carrying value, as if their tax basis
   * were zero. Selling a stake is how its value reaches shareholders, and the
   * gain is taxed; the filed carrying value is before that tax.
   */
  investmentTax?: { ratePct: number; basis: string };
  asOf: { statements: string | null; estimates: string | null };
  notes: string[];
}

/**
 * D-65: a quote more than this many days after the statement date is not
 * rolled forward: a stale statement is a data problem, not a timing one, and
 * the bridge's balance sheet would be older still.
 */
export const MAX_ROLL_FORWARD_DAYS = 200;

/**
 * D-60: operating margin = gross margin − operating-expense ratio, so no
 * scenario can earn more than today's gross margin less the leanest
 * operating-expense ratio the issuer has actually run.
 */
export interface ScenarioMarginCeiling {
  pct: number;
  grossMarginPct: number;
  /** The period the gross margin is measured over (TTM, else the latest fiscal year). */
  grossMarginPeriod: string;
  minOpexRatioPct: number;
  /** The period with the leanest operating-expense ratio among the TTM and the last five fiscal years. */
  minOpexRatioPeriod: string;
  basis: string;
}

export interface BuildDcfAssumptionsResult {
  assumptions: DcfAssumptions | null;
  notes: string[];
  gaps: ManifestEntry[];
}

// Day-count handling for the TTM→FY1 analyst leg (2026-07-09 audit L3): the
// TTM window and the FY1 estimate are both 12-month figures whose END DATES
// are offset by the TTM→FY1 span, so the raw ratio is growth over that span —
// treating a 3–9 month offset as a full-year rate depresses the whole fade
// path for mid-fiscal-year runs.
const DAYS_PER_YEAR = 365.25;
const LEG_DAY_MS = 24 * 3600 * 1000;
/** Below this span the partial-period ratio is too noisy to annualize — skip the leg. */
const ANALYST_LEG_MIN_DAYS = 90;
/** Spans in this band are an aligned fiscal year (52/53-week calendars) — the ratio IS the annual rate. */
const ANALYST_LEG_ALIGNED_DAYS: readonly [number, number] = [351, 380];

/** Average analyst-implied revenue growth over the next ~2 fiscal years, percent. */
function analystTwoYearGrowthPct(
  rows: AnalystEstimateRow[] | null,
  ttmRevenue: number | null,
  ttmDate: string | null,
): { value: number | null; asOf: string | null; notes: string[]; legs: string[] } {
  const notes: string[] = [];
  const legs: string[] = [];
  if (!rows || rows.length === 0) return { value: null, asOf: null, notes, legs };
  const future = rows
    .filter((r) => posOrNull(r.revenueAvg) !== null && (!ttmDate || r.date > ttmDate))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 2);
  if (future.length === 0) return { value: null, asOf: null, notes, legs };
  const growths: number[] = [];
  const base = posOrNull(ttmRevenue);
  if (base !== null) {
    const ratio = (future[0].revenueAvg as number) / base;
    const t0 = ttmDate !== null ? Date.parse(ttmDate) : Number.NaN;
    const t1 = Date.parse(future[0].date);
    const days =
      Number.isFinite(t0) && Number.isFinite(t1) ? Math.round((t1 - t0) / LEG_DAY_MS) : null;
    if (
      days === null ||
      (days >= ANALYST_LEG_ALIGNED_DAYS[0] && days <= ANALYST_LEG_ALIGNED_DAYS[1])
    ) {
      // Aligned full fiscal year (or no day-count derivable): raw ratio is the annual rate.
      growths.push((ratio - 1) * 100);
      legs.push(`FY ending ${future[0].date} over TTM ${fmtNum((ratio - 1) * 100)}%`);
    } else if (days < ANALYST_LEG_MIN_DAYS) {
      notes.push(
        `analyst year-1 growth leg skipped: TTM end ${ttmDate} to FY1 end ${future[0].date} spans only ${days} days (< ${ANALYST_LEG_MIN_DAYS}) — too noisy to annualize; FY1→FY2 leg used alone`,
      );
    } else {
      const annualized = (Math.pow(ratio, DAYS_PER_YEAR / days) - 1) * 100;
      notes.push(
        `analyst year-1 growth leg annualized by day-count: ${fmtNum((ratio - 1) * 100)}% over ${days} days (TTM end ${ttmDate} → FY1 end ${future[0].date}) → ${fmtNum(annualized)}%/yr`,
      );
      growths.push(annualized);
      legs.push(`FY ending ${future[0].date} over TTM ${fmtNum((ratio - 1) * 100)}% in ${days} days, annualized ${fmtNum(annualized)}%`);
    }
  }
  if (future.length === 2) {
    const g = ((future[1].revenueAvg as number) / (future[0].revenueAvg as number) - 1) * 100;
    growths.push(g);
    legs.push(`FY ending ${future[1].date} over FY ending ${future[0].date} ${fmtNum(g)}%`);
  }
  if (growths.length === 0) return { value: null, asOf: null, notes, legs };
  return {
    value: growths.reduce((a, b) => a + b, 0) / growths.length,
    asOf: future[future.length - 1].date,
    notes,
    legs,
  };
}

const YEAR_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const yearWord = (k: number): string => YEAR_WORDS[k] ?? String(k);

/** D-65: "years 1–4", "year one", "no year": the years consensus set, for every text that names them. */
export function consensusYearsText(years: readonly number[]): string {
  if (years.length === 0) return "no year";
  if (years.length === 1) return `year ${yearWord(years[0])}`;
  const contiguous = years.every((y, i) => i === 0 || y === years[i - 1] + 1);
  return contiguous ? `years ${years[0]}–${years[years.length - 1]}` : `years ${years.join(", ")}`;
}

/** D-65: the reported fiscal-year-to-date revenue, only when it ends on the TTM end and spans whole quarters. */
function validFiscalYearToDate(ytd: FiscalYearToDate | null | undefined, ttmEnd: string | null, basis: DcfIncomeRow["basis"]): FiscalYearToDate | null {
  if (!ytd || ttmEnd === null || basis === "annual" || ytd.through !== ttmEnd || posOrNull(ytd.revenue) === null) return null;
  const days = daysBetween(ytd.priorFiscalYearEnd, ytd.through);
  if (days === null || !Number.isInteger(ytd.quarters) || ytd.quarters < 1 || ytd.quarters > 3) return null;
  // 52/53-week quarters run 13 or 14 weeks.
  return days >= ytd.quarters * 84 && days <= ytd.quarters * 98 ? ytd : null;
}

/**
 * D-65: why the fiscal-year estimates behind a window cannot anchor it, or
 * null when they can. A provider row without an analyst count or range is
 * accepted for years one and two (the D-60 rule, under which those years were
 * already consensus) and never beyond, where coverage thins.
 */
function consensusGate(fiscalYears: ConsensusPathRow["fiscalYears"], year: number): string | null {
  for (const f of fiscalYears) {
    if (f.analysts === null) {
      if (year > 2) return `the provider gives no analyst count for the fiscal year ending ${f.date}, required beyond year two`;
      continue;
    }
    if (f.analysts < MIN_CONSENSUS_ANALYSTS) {
      return `the fiscal year ending ${f.date} has ${f.analysts} revenue estimate${f.analysts === 1 ? "" : "s"}, fewer than the ${MIN_CONSENSUS_ANALYSTS} a consensus needs`;
    }
    if (f.dispersionPct === null) {
      if (year > 2) return `the provider gives no low-high range for the fiscal year ending ${f.date}, required beyond year two`;
      continue;
    }
    if (f.dispersionPct > MAX_CONSENSUS_CV_PCT) {
      return `the fiscal year ending ${f.date} has an implied analyst dispersion of ${fmtNum(f.dispersionPct)}%, above the ${MAX_CONSENSUS_CV_PCT}% limit`;
    }
  }
  return null;
}

/** D-58: guidance usable as the next-quarter level, or null. */
function nextQuarterGuidance(guidance: DcfGuidance | null | undefined, ttmEnd: string | null): DcfGuidance | null {
  if (!guidance || ttmEnd === null || posOrNull(guidance.revenue) === null) return null;
  const days = daysBetween(ttmEnd, guidance.periodEnd);
  const published = daysBetween(ttmEnd, guidance.asOf);
  if (days === null || days < NEXT_QUARTER_DAYS[0] || days > NEXT_QUARTER_DAYS[1]) return null;
  return published !== null && published >= 0 ? guidance : null;
}

/**
 * D-58/D-60: the year-one revenue level, and year two's.
 *
 * D-60 order of evidence:
 *  1. Calendarized consensus LEVELS for years one and two, when consensus
 *     covers year one and is consistent with guidance (no guidance, or a
 *     year-one consensus at or above the guided quarter's low end × 4: the
 *     window opens with the guided quarter, so a lower consensus predates or
 *     contradicts the outlook). Consensus covers all four quarters of the
 *     window; guidance covers one, and an issuer that beats its range each
 *     quarter makes the guided run-rate a floor rather than a central case.
 *     D-58 grew consensus year-two growth from a guidance year one, which put
 *     both years ~15% below the consensus levels without saying so.
 *  2. Next-quarter guidance × 4, carried to the year-one midpoint at the
 *     GUIDED year-over-year pace (guided quarter over the same quarter a year
 *     earlier), else the guided sequential pace (guided quarter over the latest
 *     reported quarter, annualized) — D-58 carried it at the clamped near-term
 *     rate, which is a statement about history, not about the guided
 *     trajectory. The sequential pace carries the season (AMZN audit
 *     2026-10-20: Q3 below Q2 read as −2.2% a year against a guided +9% to
 *     +12%), so it serves only without the year-ago quarter. Year two then
 *     takes consensus growth when covered, with the gap to the consensus
 *     level stated.
 *  3. The run-rate (or the TTM) carried at the near-term growth rate.
 * The house clamp bounds the result relative to the run-rate as a
 * broken-input guard. Its range is [−10%, +25%] widened to the evidenced pace
 * (the guided pace used and the latest quarter's year-over-year growth), so
 * it cannot overrule the issuer's own reported trajectory.
 */
function buildRevenueAnchor(args: {
  inputs: DcfAssumptionInputs;
  startRev: number;
  periodBasis: string;
  gMid: number;
  notes: string[];
}): RevenueAnchor {
  const { inputs, startRev, periodBasis, gMid, notes } = args;
  const ttm = inputs.incomeTtm;
  const ttmEnd = ttm?.date ?? null;
  const windowBasis = ttm?.basis === "annual" ? "fiscal-year" : "rolling-12-month";
  const runRate = ttm?.basis !== "annual" && ttmEnd !== null ? revenueRunRate(startRev, ttmEnd, inputs.quarterRevenue) : null;
  const level = runRate?.value ?? startRev;
  const levelText = runRate === null
    ? `${periodBasis} revenue ${fmtMoney(startRev)}`
    : `the seasonally neutral run-rate ${fmtMoney(runRate.value)} (latest quarter ending ${runRate.latestQuarterEnd} × 4 = ${fmtMoney(runRate.latestQuarterAnnualized)}; ` +
      `${periodBasis} ${fmtMoney(startRev)} carried 4.5 months at the quarter's ${fmtNum(runRate.yoyPct)}% year-over-year growth = ${fmtMoney(runRate.seasonallyNeutral)}; bounded by the two)`;
  // D-65: every explicit window against calendarized consensus. The first
  // window takes the current fiscal year's consensus less what is already
  // reported; each window then passes or fails the breadth and agreement gates.
  const reported = validFiscalYearToDate(inputs.fiscalYearToDate, ttmEnd, ttm?.basis);
  const path: (ConsensusPathRow & { gate: string | null })[] = [];
  // AMZN audit 2026-10-20 finding 19: how the fiscal years a covered window
  // holds only part of were spread (null when each falls wholly inside one).
  let spread: "seasonal" | "even" | null = null;
  for (let k = 1; ttmEnd !== null && k <= DCF_HORIZON_YEARS; k++) {
    const w = forecastYearPeriod(ttmEnd, k, windowBasis);
    if (w === null) break;
    const cal = calendarizeConsensusWindow(inputs.analystEstimates, w, reported, inputs.revenueSeasonality);
    if (cal.value !== null && cal.partialSpread !== null) spread = spread === "even" ? "even" : cal.partialSpread;
    const gate = cal.value === null
      ? cal.staleAgainstReported
        ? `the fiscal-year consensus is at or below the ${fmtMoney((reported as FiscalYearToDate).revenue)} already reported through ${(reported as FiscalYearToDate).through}`
        : `${w.label} is not covered by the fiscal-year estimates`
      : consensusGate(cal.fiscalYears, k);
    path.push({ year: k, label: w.label, startDate: w.startDate, endDate: w.endDate, consensus: cal.value, anchored: false, status: "", fiscalYears: cal.fiscalYears, gate });
  }
  const usable = (k: number): boolean => path[k - 1] !== undefined && path[k - 1].consensus !== null && path[k - 1].gate === null;
  const window1 = path[0] ?? null;
  const ntm1 = usable(1) ? path[0].consensus : null;
  const ntm2 = usable(2) ? path[1].consensus : null;
  const reportedText = reported === null || !window1?.fiscalYears.some((f) => f.reportedToDate !== undefined) ? "" :
    `; the fiscal year ending ${window1.fiscalYears.find((f) => f.reportedToDate !== undefined)?.date} contributes its consensus less the ${fmtMoney(reported.revenue)} ` +
    `already reported through ${reported.through} (${reported.quarters} quarter${reported.quarters === 1 ? "" : "s"}), spread over its unreported days`;
  const shares = seasonalQuarterShares(inputs.revenueSeasonality);
  const spreadText = spread === "seasonal" && shares !== null
    ? `fiscal-year estimates spread by the quarterly shape of the fiscal year ending ${(inputs.revenueSeasonality as RevenueSeasonality).fiscalYearEnd} ` +
      `(${shares.slice(0, 3).map((x) => `${fmtNum(x * 100)}%`).join(", ")} and ${fmtNum(shares[3] * 100)}% of its reported revenue, each quarter's share over its three months)`
    : spread === "even"
      ? `fiscal-year estimates weighted by day overlap, each fiscal year spread evenly over its days because ${shares === null
        ? "the last complete fiscal year has no four reported quarterly revenues to shape it"
        : "its year end is not an anniversary of the fiscal year the quarterly shape was measured in"}`
      : "fiscal-year estimates weighted by day overlap";
  const statedGuide = nextQuarterGuidance(inputs.guidance, ttmEnd);
  const annual = statedGuide?.annualRevenueComparison;
  const quarterLow = posOrNull(statedGuide?.revenueLow);
  const quarterHigh = posOrNull(statedGuide?.revenueHigh);
  const comparable = statedGuide !== null && annual !== undefined && annual.fiscalYear === statedGuide.fiscalYear &&
    annual.currency === statedGuide.currency && annual.source === statedGuide.source && annual.asOf === statedGuide.asOf &&
    posOrNull(annual.low) !== null && posOrNull(annual.high) !== null && annual.low <= annual.high &&
    quarterLow !== null && quarterHigh !== null && quarterLow <= statedGuide.revenue && statedGuide.revenue <= quarterHigh;
  const refusedExtrapolation = comparable && (4 * quarterLow > annual.high || 4 * quarterHigh < annual.low);
  const comparabilityText = !refusedExtrapolation ? "" :
    ` Quarterly-guidance annualization withheld by the independent house comparability guard: the quarter range x 4 ` +
    `${fmtMoney(4 * quarterLow)}-${fmtMoney(4 * quarterHigh)} lies entirely outside ${annual.periodLabel} revenue ` +
    `${fmtMoney(annual.low)}-${fmtMoney(annual.high)} from the same release (${annual.source}, ${annual.asOf}). ` +
    "This is a model comparability policy, not an accounting fact: the quarter is not an unconditional annual revenue floor. " +
    "Fiscal-year and next-twelve-month periods differ; fiscal-year guidance is not substituted for NTM. The quarterly floor, sequential pace and quarterly level extrapolation are withheld; the existing consensus, run-rate or TTM fallback is used.";
  const guide = refusedExtrapolation ? null : statedGuide;
  const carry = (from: number, years: number, ratePct: number): number => from * Math.pow(1 + ratePct / 100, years);

  // D-60: the guided sequential pace, annualized.
  const latestQuarter = inputs.quarterRevenue?.latest.date === ttmEnd ? posOrNull(inputs.quarterRevenue?.latest.revenue) : null;
  const guidedPacePct = guide !== null && latestQuarter !== null ? (Math.pow(guide.revenue / latestQuarter, 4) - 1) * 100 : null;
  // AMZN audit 2026-10-20: the guided quarter over the same quarter a year earlier.
  const yearAgoRow = inputs.quarterRevenue?.guidedYearAgo ?? null;
  const yearAgoRevenue = posOrNull(yearAgoRow?.revenue);
  const yearAgoDays = guide === null || yearAgoRow === null ? null : daysBetween(yearAgoRow.date, guide.periodEnd);
  const guidedYearAgo = guide !== null && yearAgoRow !== null && yearAgoRevenue !== null && yearAgoDays !== null &&
    yearAgoDays >= YEAR_AGO_QUARTER_DAYS[0] && yearAgoDays <= YEAR_AGO_QUARTER_DAYS[1] ? { date: yearAgoRow.date, revenue: yearAgoRevenue } : null;
  const guidedYoyPct = guide !== null && guidedYearAgo !== null ? (guide.revenue / guidedYearAgo.revenue - 1) * 100 : null;
  const guidedRatePct = guidedYoyPct ?? guidedPacePct;
  const guidedRunRate = guide === null ? null : 4 * guide.revenue;
  const guidedFloor = guide === null ? null : 4 * (posOrNull(guide.revenueLow) ?? guide.revenue);
  const consensusConsistent = ntm1 !== null && (guidedFloor === null || ntm1 >= guidedFloor);

  // Broken-input guard, widened to the evidenced pace.
  const pace = [guidedRatePct, runRate?.yoyPct ?? null].filter((v): v is number => isNum(v));
  const lo = Math.min(NEAR_TERM_GROWTH_CLAMP_PP[0], ...pace);
  const hi = Math.max(NEAR_TERM_GROWTH_CLAMP_PP[1], ...pace);
  const rangeText = lo === NEAR_TERM_GROWTH_CLAMP_PP[0] && hi === NEAR_TERM_GROWTH_CLAMP_PP[1]
    ? `[${lo}%, +${hi}%]`
    : `[${fmtNum(lo)}%, +${fmtNum(hi)}%] (the house [${NEAR_TERM_GROWTH_CLAMP_PP[0]}%, +${NEAR_TERM_GROWTH_CLAMP_PP[1]}%] widened to the evidenced pace)`;

  let source: RevenueAnchor["source"];
  let raw: number;
  let rawText: string;
  let nearTermRateUsed = false;
  const guidanceText = guide === null ? "" :
    `management guidance ${fmtMoney(guide.revenue)} for the quarter ending ${guide.periodEnd} (${guide.source}, ${guide.asOf}) × 4 = ${fmtMoney(4 * guide.revenue)}`;
  if (ntm1 !== null && window1 !== null && consensusConsistent) {
    source = "consensus";
    raw = ntm1;
    rawText = `analyst consensus calendarized to ${window1.label} (${spreadText}${reportedText})` +
      (guide === null ? "" : `, at or above the guided run-rate (${guidanceText}${guidedFloor !== guidedRunRate ? `; low end × 4 = ${fmtMoney(guidedFloor as number)}` : ""}), so consistent with the outlook`);
  } else if (guide !== null) {
    source = "guidance";
    const rate = guidedRatePct ?? gMid;
    nearTermRateUsed = guidedRatePct === null;
    raw = carry(4 * guide.revenue, GUIDED_QUARTER_TO_YEAR_ONE_YEARS, rate);
    rawText = `model extrapolation of quarterly guidance: ${guidanceText}, carried 4.5 months to the year-one midpoint at ` +
      (guidedYoyPct !== null && guidedYearAgo !== null
        ? `the guided year-over-year pace ${fmtNum(guidedYoyPct)}% (guided quarter over the quarter ending ${guidedYearAgo.date}, ${fmtMoney(guidedYearAgo.revenue)}; ` +
          `the sequential pace${guidedPacePct === null ? "" : ` ${fmtNum(guidedPacePct)}%/yr`} is not used because it carries the season)`
        : guidedPacePct === null
        ? `the near-term growth rate ${fmtNum(gMid)}% (no latest reported quarter to measure the guided pace against)`
        : `the guided sequential pace ${fmtNum(guidedPacePct)}%/yr (guided quarter over the quarter ending ${ttmEnd}, ${fmtMoney(latestQuarter as number)}, annualized)`) +
      (ntm1 === null
        ? window1?.consensus != null && window1.gate !== null ? `; consensus ${fmtMoney(window1.consensus)} for the window is not used: ${window1.gate}` : ""
        : `; consensus ${fmtMoney(ntm1)} for the window sits below the guided run-rate and is not used for year one`);
  } else {
    source = runRate === null ? "ttm" : "run-rate";
    nearTermRateUsed = true;
    const years = runRate === null ? 1 : LATEST_QUARTER_TO_YEAR_ONE_YEARS;
    raw = carry(level, years, gMid);
    rawText = runRate === null
      ? `${periodBasis} revenue grown one year at the near-term growth rate ${fmtNum(gMid)}%`
      : `the run-rate carried 7.5 months to the year-one midpoint at the near-term growth rate ${fmtNum(gMid)}%`;
  }
  const floor = level * (1 + lo / 100);
  const ceiling = level * (1 + hi / 100);
  const yearOneRevenue = Math.min(ceiling, Math.max(floor, raw));
  const clampedFrom = yearOneRevenue === raw ? null : raw;
  const clampText = clampedFrom === null
    ? ""
    : `; CLAMPED from ${fmtMoney(raw)} to ${fmtMoney(yearOneRevenue)}: the house guard bounds year-one revenue to ${rangeText} of ${runRate === null ? `${periodBasis} revenue` : "the run-rate"}`;
  if (clampedFrom !== null) {
    notes.push(`year-one revenue (${source}) clamped ${fmtMoney(raw)} -> ${fmtMoney(yearOneRevenue)} (house guard ${rangeText} of ${fmtMoney(level)})`);
  }
  // Without a run-rate, guidance or consensus this is the pre-D-58 rule
  // exactly: TTM grown one year at the clamped rate.
  const yearOneGrowthPct = source === "ttm" && clampedFrom === null ? gMid : (yearOneRevenue / startRev - 1) * 100;
  // Later years (D-58/D-60 for year two, D-65 beyond): each takes consensus
  // growth, window over window — the consensus level itself when consensus set
  // year one, else consensus growth applied to the level actually used, with
  // the gap to the consensus level stated. Year two may not fall below the
  // house floor or re-accelerate past both the house ceiling and year one
  // (clamped, as D-58 did); from year three a window that fails a gate, or
  // whose growth leaves that band, ends the anchored stretch, and the fade
  // starts from the last anchored year. The final explicit year is always the
  // fade's, so the path reaches the terminal rate.
  if (path[0]) {
    path[0].anchored = source === "consensus";
    path[0].status = source === "consensus"
      ? "anchored: the year-one level"
      : path[0].gate !== null ? `not anchored: ${path[0].gate}`
        : `not anchored: year one comes from ${source}${guidedFloor !== null && ntm1 !== null && ntm1 < guidedFloor ? " (consensus is below the guided run-rate floor)" : ""}`;
  }
  const anchoredGrowth = [yearOneGrowthPct];
  const consensusYears: number[] = source === "consensus" ? [1] : [];
  const stepTexts: string[] = [];
  let anchoredLevel = yearOneRevenue;
  let stop: { year: number; reason: string } | null = null;
  for (let k = 2; k <= path.length; k++) {
    const row = path[k - 1];
    if (stop !== null) {
      row.status = `not anchored: the anchored stretch ended at year ${yearWord(anchoredGrowth.length)}`;
      continue;
    }
    if (k >= DCF_HORIZON_YEARS) {
      stop = { year: k, reason: "it is the final explicit year, which the fade sets to the terminal rate" };
    } else if (!usable(k - 1)) {
      stop = { year: k, reason: `there is no consensus growth into it (year ${yearWord(k - 1)}: ${path[k - 2].gate ?? "no consensus"})` };
    } else if (!usable(k)) {
      stop = { year: k, reason: row.gate ?? "no consensus" };
    } else if (k > 2 && !consensusYears.includes(k - 1)) {
      stop = { year: k, reason: `year ${yearWord(k - 1)} was not anchored` };
    }
    if (stop !== null) {
      row.status = `not anchored: ${stop.reason}`;
      continue;
    }
    const prev = path[k - 2].consensus as number;
    const cur = row.consensus as number;
    const rawG = (cur / prev - 1) * 100;
    const prevG = anchoredGrowth[anchoredGrowth.length - 1];
    const gHi = Math.max(NEAR_TERM_GROWTH_CLAMP_PP[1], prevG);
    let g = rawG;
    let clampNote = "";
    if (k === 2) {
      g = clampWithNote(rawG, NEAR_TERM_GROWTH_CLAMP_PP[0], gHi, "consensus year-two growth (pct)", notes);
      if (g !== rawG) {
        clampNote = `, ${fmtNum(rawG)}% clamped to [${NEAR_TERM_GROWTH_CLAMP_PP[0]}%, ${fmtNum(gHi)}%] = [house floor, max(house ceiling ${NEAR_TERM_GROWTH_CLAMP_PP[1]}%, year-one growth)]`;
      }
    } else if (rawG < NEAR_TERM_GROWTH_CLAMP_PP[0] || rawG > gHi) {
      stop = { year: k, reason: `consensus growth ${fmtNum(rawG)}% ${rawG < NEAR_TERM_GROWTH_CLAMP_PP[0] ? `falls below the ${NEAR_TERM_GROWTH_CLAMP_PP[0]}% house floor` : `re-accelerates past max(${NEAR_TERM_GROWTH_CLAMP_PP[1]}%, year ${yearWord(k - 1)}'s ${fmtNum(prevG)}%)`}` };
      row.status = `not anchored: ${stop.reason}`;
      continue;
    }
    anchoredGrowth.push(g);
    consensusYears.push(k);
    anchoredLevel *= 1 + g / 100;
    row.anchored = true;
    row.status = g === rawG ? "anchored: consensus growth" : "anchored: consensus growth, clamped";
    const gap = (anchoredLevel / cur - 1) * 100;
    stepTexts.push(
      `year ${yearWord(k)} grows ${fmtNum(g)}% on consensus (${row.label} ${fmtMoney(cur)} over ${fmtMoney(prev)}${clampNote})` +
      (Math.abs(gap) < 0.05 ? "" : `, so year ${yearWord(k)} ${fmtMoney(anchoredLevel)} is ${fmtNum(Math.abs(gap))}% ${gap < 0 ? "below" : "above"} the consensus level`),
    );
    // A clamped year two leaves the consensus levels behind; later years fade.
    if (g !== rawG) stop = { year: k + 1, reason: "year two's consensus growth was clamped" };
  }
  const yearTwoGrowthPct = consensusYears.includes(2) ? anchoredGrowth[1] : null;
  // When consensus sets later years but not year one, the spread is stated with them.
  const laterSpreadText = source === "consensus" || spread === null ? "" : ` (consensus calendarized with ${spreadText})`;
  const yearTwoText = stepTexts.length === 0 ? "" : `; ${stepTexts.join("; ")}${laterSpreadText}`;
  const anyConsensus = path.some((r) => r.consensus !== null);
  const lastCovered = [...path].reverse().find((r) => r.consensus !== null);
  const stopText = stop === null || !anyConsensus ? "" :
    `; year ${yearWord(stop.year)} is not anchored: ${stop.reason}${/not covered/.test(stop.reason) && lastCovered ? ` (the estimates cover through ${lastCovered.label})` : ""}`;
  const yearOneGap = ntm1 === null || source === "consensus" ? null : (yearOneRevenue / ntm1 - 1) * 100;
  const yearOneGapText = yearOneGap === null || Math.abs(yearOneGap) < 0.05 ? "" :
    `; year one is ${fmtNum(Math.abs(yearOneGap))}% ${yearOneGap < 0 ? "below" : "above"} the consensus ${fmtMoney(ntm1 as number)}`;
  const gateText = !anyConsensus ? "" :
    ` House rule D-65: consensus sets every year whose fiscal-year estimates have at least ${MIN_CONSENSUS_ANALYSTS} analysts and an implied dispersion of at most ${MAX_CONSENSUS_CV_PCT}%, while its growth stays within [${NEAR_TERM_GROWTH_CLAMP_PP[0]}%, max(${NEAR_TERM_GROWTH_CLAMP_PP[1]}%, the prior year)].`;
  const basis =
    `year-one revenue ${fmtMoney(yearOneRevenue)} (${fmtNum(yearOneGrowthPct)}% over ${periodBasis} ${fmtMoney(startRev)}) from ${rawText}` +
    `${clampText}${yearOneGapText}; measured against ${levelText}${yearTwoText}${stopText} (house rule D-60: consensus levels when consistent with admitted guidance extrapolation, then model extrapolation of quarterly guidance, then the run-rate).${gateText}${comparabilityText}`;
  notes.push(`Year-one revenue anchor: ${basis}`);
  return {
    source, yearOneRevenue, yearOneGrowthPct, yearTwoGrowthPct, runRate, clampedFrom, basis,
    anchoredGrowthPct: anchoredGrowth,
    consensusYears,
    consensusPath: path.map((row) => ({ year: row.year, label: row.label, startDate: row.startDate, endDate: row.endDate,
      consensus: row.consensus, anchored: row.anchored, status: row.status, fiscalYears: row.fiscalYears })),
    evidence: { guidedRunRate, guidedPacePct, ...(guidedYoyPct === null ? {} : { guidedYoyPct }), consensusYearOne: ntm1, consensusYearTwo: ntm2, nearTermRateUsed,
      guidedQuarter: statedGuide === null ? null : { periodEnd: statedGuide.periodEnd, revenueLow: posOrNull(statedGuide.revenueLow) ?? statedGuide.revenue, revenueMid: statedGuide.revenue,
        grossMarginLowPct: isNum(statedGuide.grossMarginLowPct) ? statedGuide.grossMarginLowPct : null, source: statedGuide.source, asOf: statedGuide.asOf } },
  };
}

/**
 * D-60: the scenario operating-margin ceiling. The gross margin is the TTM's
 * (the latest fiscal year's when no TTM gross profit exists); the
 * operating-expense ratio, (gross profit − operating income) / revenue, is the
 * lowest among the TTM and the last five fiscal years. A row whose operating
 * income exceeds its gross profit, or whose gross margin is outside (0, 100],
 * is a broken row and is skipped.
 */
export function scenarioMarginCeiling(ttm: DcfIncomeRow | null, history: DcfIncomeRow[]): ScenarioMarginCeiling | null {
  const ratios = (row: DcfIncomeRow, period: string) => {
    const revenue = posOrNull(zeroAsNull(row.revenue));
    if (revenue === null || !isNum(row.grossProfit) || !isNum(row.operatingIncome)) return [];
    const gross = (row.grossProfit / revenue) * 100;
    const opex = ((row.grossProfit - row.operatingIncome) / revenue) * 100;
    return gross > 0 && gross <= 100 && opex >= 0 ? [{ gross, opex, period }] : [];
  };
  const current = ttm === null ? [] : ratios(ttm, ttm.basis === "annual" ? `FY ${ttm.date}` : `TTM ending ${ttm.date}`);
  const annual = history
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .flatMap((row) => ratios(row, `FY ${row.date}`));
  const latest = current[0] ?? annual[0];
  if (latest === undefined) return null;
  const leanest = [...current, ...annual].reduce((best, p) => (p.opex < best.opex ? p : best));
  const pct = latest.gross - leanest.opex;
  return {
    pct,
    grossMarginPct: latest.gross,
    grossMarginPeriod: latest.period,
    minOpexRatioPct: leanest.opex,
    minOpexRatioPeriod: leanest.period,
    basis:
      `scenario operating margins are capped at ${fmtNum(pct)}% = gross margin ${fmtNum(latest.gross)}% (${latest.period}) ` +
      `less the leanest operating-expense ratio on record, ${fmtNum(leanest.opex)}% (${leanest.period}, among the TTM and the last five fiscal years); ` +
      "the cap never pulls a scenario below the base path (house rule D-60)",
  };
}

/**
 * D-60: the discounting convention, stated where the reader sees the
 * assumptions. The Gordon terminal value is FCFF_(N+1) / (WACC − g): the value
 * at the end of year N of flows that, like the explicit ones, arrive through
 * each year. Discounting it at N − 0.5 keeps that timing; at N it would treat
 * explicit flows as mid-year and perpetuity flows as year-end.
 */
export const MID_YEAR_DISCOUNTING_BASIS =
  "mid-year convention: explicit-year FCFF is discounted at t − 0.5 years, and the Gordon terminal value is discounted at N − 0.5 " +
  "because its perpetuity flows also arrive through each year (Rosenbaum & Pearl, Investment Banking, ch. 3: perpetuity-growth terminal " +
  "values take the mid-year factor, exit-multiple values the year-end factor; Koller, Goedhart & Wessels, Valuation, apply the half-year " +
  "adjustment to the whole value including continuing value). Discounting the terminal value at N instead lowers it by a factor of " +
  "(1 + WACC)^0.5 (house rule D-60)";

/**
 * Build the base-case DCF assumption block. Every assumption carries
 * {value, basis}; every clamp/fallback fired lands in notes[]; missing inputs
 * produce gaps and — when the base is unusable — a null assumptions object.
 */
export function buildDcfAssumptions(inputs: DcfAssumptionInputs): BuildDcfAssumptionsResult {
  const notes: string[] = [];
  const gaps: ManifestEntry[] = [];
  const years = DCF_HORIZON_YEARS;

  const ttm = inputs.incomeTtm;
  const periodBasis = ttm?.basis === "annual" ? `latest annual FY ${ttm.date}` : "TTM";
  const startRev = posOrNull(zeroAsNull(ttm?.revenue));
  if (startRev === null) {
    gaps.push(
      gapEntry(
        "valuation.dcf.startRevenue",
        "base-period revenue missing or non-positive (FMP zero-for-undisclosed treated as null) — DCF not buildable",
        "critical",
      ),
    );
    return { assumptions: null, notes, gaps };
  }

  // --- Terminal growth: min(2.5, rf) — Damodaran g <= rf rule --------------
  // Computed first: the near-term anchor falls back to it when revenue
  // history shows no trend.
  const gTerm = Math.min(TERMINAL_G_CAP_PCT, inputs.riskFreePct);
  // N6: criterion (b) asks for "house convention" wherever the terminal rule
  // prints; the terminal ROIC basis already says it, this one said "house rule".
  const gTermBasis = `min(${TERMINAL_G_CAP_PCT}%, risk-free ${fmtNum(inputs.riskFreePct)}%) — HOUSE CONVENTION: nothing grows faster than rf forever`;

  // --- Near-term growth: MEDIAN OF METHODS (WS6, D-18) ---------------------
  // Retired here: "lower of the 3Y/5Y CAGR" and the sign-disagreement rule
  // that set g1 = gTerm. Both let one window decide ten years of growth: the
  // min rule extrapolated whichever window happened to be worse, and the
  // sign rule threw the history away entirely. The replacement runs every
  // method the data supports — a log-linear regression over ALL annual years
  // (reported with its R2 and n, so an erratic history shows up as a poor fit
  // instead of moving the anchor), the 3-year and 5-year CAGRs, and the
  // analyst-consensus case when estimates exist — and takes the MEDIAN, with
  // the full range shown. Each method's value, and every method that was
  // unavailable, is named in the basis.
  const analyst = analystTwoYearGrowthPct(inputs.analystEstimates, startRev, ttm?.date ?? null);
  notes.push(...analyst.notes);

  const methods: GrowthAnchorMethod[] = [];
  const trend = inputs.revenueLogLinear ?? null;
  if (trend && isNum(trend.growthPct)) {
    methods.push({
      name: "log-linear revenue regression",
      valuePct: trend.growthPct,
      detail:
        `${fmtNum(trend.growthPct)}%/yr fitted over ${trend.n} annual years` +
        `${trend.startDate && trend.endDate ? ` (${trend.startDate} to ${trend.endDate})` : ""}` +
        `${isNum(trend.rSquared) ? `, R2 ${fmtNum(trend.rSquared)}` : ", R2 unavailable"}`,
    });
  } else {
    methods.push({
      name: "log-linear revenue regression",
      valuePct: null,
      detail: `unavailable: ${trend === null ? "no annual revenue trend supplied" : "fewer than 3 positive annual revenue observations"}`,
    });
  }
  // D-39: a window whose CAGR was computed over a different span is not that
  // window's method; say what was measured instead of "no CAGR".
  const cagrMethod = (window: 3 | 5, pct: number | null | undefined, excludedSpan: number | null | undefined): GrowthAnchorMethod => {
    const name = `${window}y revenue CAGR`;
    if (isNum(pct)) return { name, valuePct: pct, detail: `${fmtNum(pct)}%` };
    if (isNum(excludedSpan)) {
      return {
        name,
        valuePct: null,
        detail: `unavailable: measured span ${excludedSpan.toFixed(2)} years, not the ${window}-year window (±${CAGR_SPAN_TOLERANCE_YEARS}-year tolerance)`,
      };
    }
    return { name, valuePct: null, detail: `unavailable: no ${window}-year revenue CAGR` };
  };
  methods.push(cagrMethod(3, inputs.revenueCagr3yPct, inputs.revenueCagr3yExcludedSpanYears));
  methods.push(cagrMethod(5, inputs.revenueCagr5yPct, inputs.revenueCagr5yExcludedSpanYears));
  if (analyst.value !== null) {
    methods.push({
      name: "analyst-consensus case",
      valuePct: analyst.value,
      // D-65 (P2-9): both legs are printed, so the average can be reproduced.
      detail: `${fmtNum(analyst.value)}% (mean of ${analyst.legs.join(" and ")}, through ${analyst.asOf ?? "?"})`,
    });
  } else {
    methods.push({
      name: "analyst-consensus case",
      valuePct: null,
      detail: "unavailable: no usable analyst revenue estimates",
    });
  }

  const available = methods.filter((m): m is GrowthAnchorMethod & { valuePct: number } => isNum(m.valuePct));
  const unavailable = methods.filter((m) => !isNum(m.valuePct)).map((m) => m.name);
  if (available.length === 0) {
    gaps.push(
      gapEntry(
        "valuation.dcf.nearTermGrowth",
        `no growth-anchor method available (${unavailable.join("; ")}) — DCF growth path not buildable`,
        "critical",
      ),
    );
    return { assumptions: null, notes, gaps };
  }
  const values = available.map((m) => m.valuePct);
  const point = medianOf(values) as number;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const rangePct: [number, number] | null = available.length > 1 ? [lo, hi] : null;
  // WS6 review (SHOULD-FIX 1): clamp FIRST, then describe. The basis used to be
  // built from the pre-clamp median and then attached to the clamped value, so
  // a 65% median printed a basis sentence that said 25% and then said 65%.
  // D-58: this clamped median is the near-term rate the revenue anchor
  // carries the latest evidenced level forward at (the run-rate or guided
  // quarter to the year-one midpoint; the TTM by a full year without them).
  const gMid = clampWithNote(
    point,
    NEAR_TERM_GROWTH_CLAMP_PP[0],
    NEAR_TERM_GROWTH_CLAMP_PP[1],
    "near-term growth (pct)",
    notes,
  );
  const clampFired = gMid !== point;
  // D-60: build the year-one level first, so the clamp sentence says whether
  // the clamped rate set it. Under guidance or consensus it does not, and
  // D-58's "year-one revenue is built from the clamped value" was false.
  const revenueAnchor = buildRevenueAnchor({ inputs, startRev, periodBasis, gMid, notes });
  const rateSetsYearOne = revenueAnchor.evidence?.nearTermRateUsed ?? true;
  const clampSentence = !clampFired
    ? (rateSetsYearOne ? "" : ` It does not set year one, which comes from ${revenueAnchor.source}.`)
    : rateSetsYearOne
      ? ` CLAMPED to ${fmtNum(gMid)}%: the near-term growth house rule bounds the rate to [${NEAR_TERM_GROWTH_CLAMP_PP[0]}%, ${NEAR_TERM_GROWTH_CLAMP_PP[1]}%], and year-one revenue is built from the clamped value, not the median.`
      : ` CLAMPED to ${fmtNum(gMid)}% by the near-term growth house rule [${NEAR_TERM_GROWTH_CLAMP_PP[0]}%, ${NEAR_TERM_GROWTH_CLAMP_PP[1]}%]; it does not set year one, which comes from ${revenueAnchor.source}, and is shown as a cross-check only.`;
  const anchorBasis =
    `median of ${available.length} available growth method${available.length === 1 ? "" : "s"} = ${fmtNum(point)}%` +
    `${rangePct === null ? " (single method; no range)" : `, range ${fmtNum(lo)}% to ${fmtNum(hi)}%`}` +
    ` — methods: ${methods.map((m) => `${m.name} ${m.detail}`).join("; ")}` +
    ` (house rule, WS6 D-18: median of methods; the former "lower of the 3y/5y CAGR" and sign-disagreement rules are RETIRED).` +
    clampSentence;
  notes.push(`Near-term growth anchor: ${anchorBasis}`);
  if (unavailable.length > 0) {
    gaps.push(
      gapEntry(
        "valuation.dcf.growthAnchor",
        `growth-anchor method(s) unavailable: ${unavailable.join(", ")} — the point estimate is the median of the ${available.length} that were computable`,
        "info",
      ),
    );
  }
  if (analyst.value === null) {
    const refusal = inputs.analystEstimatesRefusal ?? null;
    if (refusal !== null) {
      const degraded =
        `the valuation is degraded: analyst revenue estimates were refused by the data provider's rate limit (HTTP 429) — ${refusal.replace(/\.$/, "")} — ` +
        "so the analyst-consensus growth method was excluded from the median and no year is anchored to consensus";
      notes.push(`Valuation degraded: ${degraded}.`);
      gaps.push(gapEntry("valuation.dcf.analystGrowth", `no usable analyst revenue estimates because ${degraded}`, "warn"));
    } else {
      gaps.push(
        gapEntry("valuation.dcf.analystGrowth", "no usable analyst revenue estimates — the analyst-consensus growth method was excluded from the median", "info"),
      );
    }
  }

  const gMidBasis =
    `median of the available growth methods (${available.map((m) => `${m.name} ${fmtNum(m.valuePct)}%`).join(", ")})` +
    (clampFired
      ? ` = ${fmtNum(point)}%, clamped to ${fmtNum(gMid)}% by the near-term growth house rule range [${NEAR_TERM_GROWTH_CLAMP_PP[0]}%, ${NEAR_TERM_GROWTH_CLAMP_PP[1]}%]`
      : "");
  const growthAnchor: GrowthAnchor = {
    pointPct: gMid,
    ...(clampFired ? { preClampMedianPct: point } : {}),
    rangePct,
    methods,
    unavailable,
    basis: anchorBasis,
  };

  // --- D-58: year one (and two) from evidence, then a convergent fade ------
  // TTM x (1 + clamped g) put NVDA's year-one revenue below its own latest
  // quarter x 4, and a linear fade from a consensus year one of +78% would
  // have kept growth above 50% for four years. The anchored years now come
  // from guidance, consensus or the run-rate; every later year closes the
  // gap to the terminal rate geometrically from the last anchored year.
  // D-65: every year consensus anchors, not only the first two.
  const anchoredGrowth = (revenueAnchor.anchoredGrowthPct ?? [revenueAnchor.yearOneGrowthPct]).slice(0, Math.max(1, years - 1));
  const lastAnchored = anchoredGrowth[anchoredGrowth.length - 1];
  const growthPath = [
    ...anchoredGrowth,
    ...convergentFadePath(lastAnchored, gTerm, years - anchoredGrowth.length + 1).slice(1),
  ];
  const guide = nextQuarterGuidance(inputs.guidance, ttm?.date ?? null);

  // --- EBIT margin path -----------------------------------------------------
  // Audit item 15 (FCX-9): a one-off inside operating income (FCX's $699m
  // insurance gain, an impairment) would set the margin for every year, so
  // the seed leaves tagged one-offs out, gains and charges alike.
  const unusual = inputs.unusualOperatingItems ?? null;
  const baseOperatingIncome = ttm?.operatingIncome ?? null;
  const normalizeUnusual = unusual !== null && unusual.value !== 0 && isNum(baseOperatingIncome);
  const ttmMarginRaw = safeDiv(normalizeUnusual ? (baseOperatingIncome as number) - unusual.value : baseOperatingIncome, startRev);
  if (normalizeUnusual) {
    notes.push(
      `EBIT margin seed excludes tagged one-off items of ${fmtNum(unusual.value)} from ${periodBasis} operating income ${fmtNum(baseOperatingIncome as number)}: ${unusual.basis}`,
    );
  } else if (unusual !== null && unusual.withheld.length > 0) {
    notes.push(`EBIT margin seed keeps tagged one-off items the filings don't place inside the ${periodBasis} window: ${unusual.basis}`);
  }
  const histMarginPoints = inputs.incomeHistory
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .flatMap((r) => {
      const margin = safeDiv(r.operatingIncome, posOrNull(zeroAsNull(r.revenue)));
      return margin === null ? [] : [{ date: r.date, marginPct: margin * 100 }];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  const histMargins = histMarginPoints.map((point) => point.marginPct);
  const median5y = medianOf(histMargins);
  const oldestMarginDate = histMarginPoints[0]?.date;
  const marginSlope = linearRegressionSlope(
    histMarginPoints.map((point) => ({
      x: oldestMarginDate === undefined ? null : yearsBetweenDates(oldestMarginDate, point.date),
      y: point.marginPct,
    })),
  );

  // D-58: guidance, when it implies an operating margin, sets year one.
  const guidedMargin = guide !== null && isNum(guide.operatingMarginPct) ? guide.operatingMarginPct : null;
  let m0 = guidedMargin ?? (ttmMarginRaw !== null ? ttmMarginRaw * 100 : null);
  let m0Source = guidedMargin !== null
    ? `guided (${guide!.source})`
    : normalizeUnusual ? `${periodBasis}, excluding tagged one-off items` : periodBasis;
  if (m0 === null && median5y !== null) {
    m0 = median5y;
    m0Source = "5y median";
    notes.push("TTM EBIT margin unavailable — base margin set to 5y median (fallback)");
    gaps.push(gapEntry("valuation.dcf.ttmEbitMargin", "TTM operatingIncome or revenue missing", "warn"));
  }
  if (m0 === null) {
    gaps.push(
      gapEntry("valuation.dcf.ebitMargin", "no EBIT margin derivable from TTM or history — DCF not buildable", "critical"),
    );
    return { assumptions: null, notes, gaps };
  }

  // The margin cap is a broken-input guard, not a view on what a company can
  // earn, so it never binds below a margin the issuer has demonstrably earned:
  // a flat 45% cap removed a third of the DCF of a 65%-margin payments network
  // under a rule no document described. The ceiling is the house figure or
  // the issuer's own highest annual margin in the five-year history,
  // whichever is higher (METHODOLOGY "Fade and horizon", RESEARCH §7.5).
  // D-58: it binds the margin the path fades TO — year five onward and the
  // terminal year — not year one. Capping year one forced NVDA from its 65.2%
  // TTM margin to 62.4% with nothing in the evidence behind the step-down;
  // the current margin may set year one unless it is impossible (above 100%).
  // D-60: a full four-quarter TTM is as demonstrated as a fiscal year, so it
  // counts as an earned margin too. NVDA ran 63.2-66.2% in each of the last
  // four quarters (TTM 65.21%) while the cap stayed at FY2025's 62.42%, so the
  // path faded to a margin below every recent quarter with nothing in the
  // evidence behind the step-down. A single quarter does not count.
  const ttmMarginPoint = ttm?.basis !== "annual" && ttmMarginRaw !== null && ttmMarginRaw <= 1 && ttm?.date
    ? [{ date: ttm.date, marginPct: ttmMarginRaw * 100, ttm: true }]
    : [];
  const observedPoints: { date: string; marginPct: number; ttm?: boolean }[] = [
    ...histMarginPoints.filter((p) => isNum(p.marginPct)),
    ...ttmMarginPoint,
  ];
  const observedTop = observedPoints.reduce<{ date: string; marginPct: number; ttm?: boolean } | null>(
    (best, p) => (best === null || p.marginPct > best.marginPct ? p : best),
    null,
  );
  const marginCeiling = Math.max(MARGIN_CLAMP_PP[1], observedTop?.marginPct ?? MARGIN_CLAMP_PP[1]);
  const ceilingText = observedTop !== null && observedTop.marginPct > MARGIN_CLAMP_PP[1]
    ? `the issuer's highest sustained margin (the last five fiscal years and the TTM), ${fmtNum(marginCeiling)}% (${observedTop.ttm ? `TTM ending ${observedTop.date}` : `FY ${observedTop.date}`})`
    : `the house ceiling ${MARGIN_CLAMP_PP[1]}%`;
  const yearOneCeiling = m0 <= 100 ? Math.max(marginCeiling, m0) : marginCeiling;
  const m0Raw = m0;
  m0 = Math.min(yearOneCeiling, Math.max(MARGIN_CLAMP_PP[0], m0));
  if (m0 !== m0Raw) {
    notes.push(`EBIT margin (pct) clamped: current ${fmtNum(m0Raw)} -> ${fmtNum(m0)} (house rule range [${MARGIN_CLAMP_PP[0]}, ${fmtNum(yearOneCeiling)}])`);
  }

  const fadeYears = Math.min(MARGIN_FADE_YEARS, years);
  let regime: string | null = null;
  let slopeBasis = "unavailable";
  let targetMargin = m0;
  let improvingBound: string | null = null;
  if (median5y === null) {
    gaps.push(gapEntry("valuation.dcf.marginTarget", "no annual margin history — margin held flat", "info"));
  } else {
    regime = marginSlope === null
      ? "stable/insufficient-history"
      : marginSlope > MARGIN_TREND_THRESHOLD_PP_PER_YEAR
        ? "improving"
        : marginSlope < -MARGIN_TREND_THRESHOLD_PP_PER_YEAR
          ? "declining"
          : "stable";
    // AMZN audit 2026-10-20: a declining margin fades down to its history, so
    // an improving one fades up rather than being held at today's level for
    // ten years. The target is bounded twice: half the dated trend carried
    // over the fade years, and the efficiency the issuer has already shown
    // (today's gross margin less its leanest operating-expense ratio, the
    // scenario ceiling). Without a gross margin to bound it, it stays flat.
    const improvingCeiling = regime === "improving" && marginSlope !== null
      ? scenarioMarginCeiling(ttm, inputs.incomeHistory)
      : null;
    const trendTarget = marginSlope !== null ? m0 + IMPROVING_MARGIN_TREND_SHARE * marginSlope * fadeYears : m0;
    const improvingTarget = improvingCeiling === null ? m0 : Math.min(trendTarget, improvingCeiling.pct);
    targetMargin = regime === "improving"
      ? Math.max(m0, median5y, improvingTarget)
      : regime === "declining"
        ? Math.min(m0, median5y)
        : median5y;
    if (regime === "improving" && improvingCeiling !== null && improvingTarget > Math.max(m0, median5y)) {
      improvingBound = trendTarget <= improvingCeiling.pct
        ? `half the dated trend over ${fadeYears} years (${fmtNum(m0)}% + ${IMPROVING_MARGIN_TREND_SHARE} × ${fmtNum(marginSlope as number)}pp × ${fadeYears}), below the ${fmtNum(improvingCeiling.pct)}% gross margin less the leanest operating-expense ratio`
        : `the gross margin less the leanest operating-expense ratio, ${fmtNum(improvingCeiling.pct)}% (${fmtNum(improvingCeiling.grossMarginPct)}% ${improvingCeiling.grossMarginPeriod} less ${fmtNum(improvingCeiling.minOpexRatioPct)}% ${improvingCeiling.minOpexRatioPeriod}), below half the dated trend (${fmtNum(trendTarget)}%)`;
    }
    slopeBasis = marginSlope === null ? "unavailable" : `${fmtNum(marginSlope)}pp/year`;
    notes.push(
      `EBIT margin regime ${regime}: dated 5y slope ${slopeBasis}; target ${fmtNum(targetMargin)}% versus current ${fmtNum(m0)}% and median ${fmtNum(median5y)}%`,
    );
  }
  const cappedTarget = Math.min(marginCeiling, Math.max(MARGIN_CLAMP_PP[0], targetMargin));
  const capText = cappedTarget < targetMargin
    ? `; the target ${fmtNum(targetMargin)}% is capped at ${ceilingText} (house broken-input guard; it binds year ${fadeYears} onward, not year one)`
    : cappedTarget > targetMargin
      ? `; the target ${fmtNum(targetMargin)}% is floored at ${MARGIN_CLAMP_PP[0]}% (house rule)`
      : "";
  if (cappedTarget !== targetMargin) {
    notes.push(
      `EBIT margin target (pct) clamped ${fmtNum(targetMargin)} -> ${fmtNum(cappedTarget)} to the house rule range [${MARGIN_CLAMP_PP[0]}, ${fmtNum(marginCeiling)}]` +
        (marginCeiling > MARGIN_CLAMP_PP[1] ? ` (ceiling raised from ${MARGIN_CLAMP_PP[1]} to the issuer's own observed maximum margin)` : "") +
        `; year one keeps the current ${fmtNum(m0)}%`,
    );
  }
  const fade = fadePath(m0, cappedTarget, fadeYears);
  const marginPath = Array.from({ length: years }, (_, i) => (i < fade.length ? fade[i] : cappedTarget));
  // Written after every clamp, so the text names the values the path holds.
  const regimeText = regime === null
    ? "no 5y margin history for a fade target"
    : `${regime} dated-margin regime (5y median ${fmtNum(median5y as number)}%, slope ${slopeBasis})`;
  const marginBasis = cappedTarget === m0
    ? `held flat at current ${fmtNum(m0)}% (${m0Source}) under ${regimeText}${capText}`
    : `fade current ${fmtNum(m0)}% (${m0Source}) -> ${fmtNum(cappedTarget)}% by year ${fadeYears} under ${regimeText}` +
      `${improvingBound !== null ? `; the improving target is ${improvingBound}` : ""}${capText}, flat thereafter`;
  if (marginPath.some((m) => m < MARGIN_WARN_BAND_PP[0] || m > MARGIN_WARN_BAND_PP[1])) {
    notes.push(
      `EBIT margin path leaves [${MARGIN_WARN_BAND_PP[0]}%, ${MARGIN_WARN_BAND_PP[1]}%] — unusual outside software; review (house-rule warning)`,
    );
  }

  // --- Tax rate path: company history, never a universal domicile assumption -
  const pretax = zeroAsNull(ttm?.incomeBeforeTax);
  const taxExp = ttm?.incomeTaxExpense ?? null;
  const currentTaxRate =
    pretax !== null && pretax > 0 && isNum(taxExp) && taxExp >= 0
      ? clampWithNote((taxExp / pretax) * 100, 0, 35, "effective tax rate (pct)", notes)
      : null;
  const historicalTaxRates = inputs.incomeHistory.flatMap((row): number[] => {
    const rowPretax = zeroAsNull(row.incomeBeforeTax);
    const rowTax = row.incomeTaxExpense ?? null;
    if (rowPretax === null || rowPretax <= 0 || !isNum(rowTax) || rowTax < 0) return [];
    return [Math.min(35, Math.max(0, (rowTax / rowPretax) * 100))];
  });
  const historicalMedianTax = medianOf(historicalTaxRates);
  const companyTerminalTax = historicalMedianTax ?? currentTaxRate;
  if (currentTaxRate === null && companyTerminalTax === null) {
    gaps.push(
      gapEntry(
        "valuation.dcf.effectiveTaxRate",
        "no positive-pre-tax current or historical company tax rate — DCF suppressed instead of assuming a universal marginal rate",
        "critical",
      ),
    );
    return { assumptions: null, notes, gaps };
  }
  // D-58: a below-statutory effective rate (credits, deferrals, preferential
  // regimes) is not carried in perpetuity: the terminal rate converges toward
  // the marginal rate (Damodaran), never below the 15% global minimum (OECD
  // Pillar Two). NVDA's terminal NOPAT was taxed at its 8.9% historical median
  // while it guides 16-18%. A company whose own history is higher keeps it.
  const { pct: taxFloor, basis: taxFloorText } = marginalTaxFloor(inputs.domicileCountry);
  const companyTax = companyTerminalTax as number;
  const taxTerminal = Math.max(companyTax, taxFloor);
  const companyTaxText = historicalMedianTax !== null ? "company historical median" : `${periodBasis} effective rate`;
  const terminalTaxText = taxTerminal > companyTax
    ? `the ${companyTaxText} ${fmtNum(companyTax)}% floored at ${fmtNum(taxTerminal)}% = ${taxFloorText} (house rule D-58: the terminal rate converges toward the marginal rate)`
    : `the ${companyTaxText} ${fmtNum(taxTerminal)}%, at or above the ${fmtNum(taxFloor)}% floor = ${taxFloorText}`;
  if (taxTerminal > companyTax) notes.push(`terminal tax rate floored: ${terminalTaxText}`);
  // D-60: management's effective-tax-rate guidance, when the same release
  // gives one, sets year one (NVDA guided 16-18% for FY2027 against a 16.05%
  // TTM rate); the path still fades to the terminal rate.
  const guidedTax =
    guide !== null && isNum(guide.taxRatePct) && guide.taxRatePct >= 0 && guide.taxRatePct <= 50 ? guide.taxRatePct : null;
  const tEff = guidedTax ?? currentTaxRate ?? taxTerminal;
  if (currentTaxRate === null && guidedTax === null) {
    // The substitution is a note and a gap, as the margin fallback's is, and
    // the basis says no current rate was observed: it used to print "TTM
    // effective rate 22%" for an issuer with a pre-tax loss.
    notes.push(
      `${periodBasis} effective tax rate not computable (pre-tax income ≤ 0, or tax expense missing/negative) — tax path held at ${terminalTaxText}`,
    );
    gaps.push(
      gapEntry(
        "valuation.dcf.ttmTaxRate",
        `${periodBasis} effective tax rate not computable (non-positive pre-tax income or missing tax expense) — ${fmtNum(taxTerminal)}% (${companyTaxText} ${fmtNum(companyTax)}%, floor ${fmtNum(taxFloor)}%) is used for the whole path`,
        "info",
      ),
    );
  }
  const taxBasis =
    guidedTax !== null
      ? `guided GAAP effective rate ${fmtNum(guidedTax)}% (${guide?.taxRatePeriod ?? "guided period"}, ${guide?.source ?? "earnings release"})` +
        `${currentTaxRate === null ? "" : ` against the ${periodBasis} observed ${fmtNum(currentTaxRate)}%`}` +
        `${tEff === taxTerminal ? ` held flat: terminal rate is ${terminalTaxText}` : ` fading to ${fmtNum(taxTerminal)}% by year ${years}: ${terminalTaxText}`} (house rule D-60: tax guidance sets year one)`
      : currentTaxRate === null
      ? `${periodBasis} effective rate not computable (pre-tax income ≤ 0 or tax expense missing) — held at ${terminalTaxText} for all ${years} years`
      : tEff === taxTerminal
        ? `${periodBasis} effective rate ${fmtNum(tEff)}% held flat: terminal rate is ${terminalTaxText}`
        : `${periodBasis} effective rate ${fmtNum(tEff)}% fading to ${fmtNum(taxTerminal)}% by year ${years}: ${terminalTaxText}`;
  const taxRatePath = fadePath(tEff, taxTerminal, years);

  // --- Sales-to-capital ------------------------------------------------------
  const bal = inputs.balance;
  // Audit 2026-10-19 FCX-1: a missing operating-lease maturity leaves the
  // lease-inclusive total unknown, but where the financing components prove the
  // tagged operating portion is the only lease in totalDebt, invested capital
  // is measured excluding operating leases instead of the DCF being withheld.
  // A missing finance maturity still withholds it.
  const debtScopeRefusal = leaseDebtScopeRefusal(bal, true) === null ? null : leaseDebtScopeRefusal(bal, false);
  if (debtScopeRefusal) {
    gaps.push(gapEntry("valuation.dcf.salesToCapital", `${debtScopeRefusal} Raw lease-inclusive invested capital cannot support sales-to-capital; DCF withheld.`, "critical"));
    return { assumptions: null, notes, gaps };
  }
  const leaseExcluded = leaseDebtScopeRefusal(bal, true) !== null && bal !== null && isNum(bal.operatingLeaseLiability);
  // FIN-303 / FIN-303-V1 (D-25, D-97 item 3): on the default switch the operating-lease slice leaves debt here exactly
  // when the equity bridge removes it (`operatingLeaseOutOfDebt`: positive, inside total debt, scope proven). The
  // FCX-1 partial-coverage path above is unchanged and runs first.
  const leaseOut = leaseExcluded || bal === null ? { amount: 0, note: null, clause: null } : operatingLeaseOutOfDebt(bal, inputs.includeLeasesInEv === true);
  const leaseBasis = { fcx1Excluded: leaseExcluded, includeLeasesInEv: inputs.includeLeasesInEv === true, currentRowExcludesLease: leaseOut.note === null };
  const icDebt = bal && isNum(bal.totalDebt) ? bal.totalDebt - (leaseExcluded ? bal.operatingLeaseLiability as number : leaseOut.amount) : null;
  const equity = resolveConsolidatedEquity(bal ?? {});
  // FIN-119-V1: temporary equity (redeemable preferred and redeemable NCI) is financing capital. A refused operand leaves
  // the capital unknown, never zero (D-87): the DCF is withheld as it is for missing equity.
  const temporary = temporaryEquityClaims(bal);
  const temporaryText = temporary !== null && temporary.total !== 0 ? ` + temporaryEquity ${fmtMoney(temporary.total)} [${temporary.basis}]` : "";
  const ic =
    bal && icDebt !== null && equity.value !== null && isNum(bal.cashAndShortTermInvestments)
      ? icDebt + equity.value + (temporary === null ? 0 : temporary.total) - bal.cashAndShortTermInvestments
      : null;
  const mainCapitalGap = (lead: string): ManifestEntry => gapEntry(
    "valuation.dcf.salesToCapital",
    `${lead} - this sales-to-capital DCF is suppressed instead of inventing a capital-efficiency input. An explicit operating-cash-flow model requires separately supported reinvestment assumptions; negative book capital alone does not prohibit valuation`,
    "critical",
  );
  if (bal === null || ic === null) {
    gaps.push(mainCapitalGap("balance-sheet fields missing for invested capital"));
    return { assumptions: null, notes, gaps };
  }
  // FIN-303 (pre-flight I6): invested capital that the lease subtraction itself emptied (positive lease-inclusive, not
  // positive once the proven operating lease leaves debt) takes the issuer's own history on the same lease basis, or
  // the DCF is withheld. It never falls back to the lease-inclusive (mixed) basis. A non-positive capital with no lease
  // removed keeps main's gap text.
  let emptiedHistory: ReturnType<typeof establishedSalesToCapital> | null = null;
  if (ic <= 0) {
    if (!(leaseOut.amount > 0 && ic + leaseOut.amount > 0)) {
      gaps.push(mainCapitalGap("invested capital <= 0"));
      return { assumptions: null, notes, gaps };
    }
    const history = establishedSalesToCapital(inputs.incomeHistory, inputs.capitalHistory ?? null, leaseBasis);
    if (history.ratio === null) {
      gaps.push(gapEntry("valuation.dcf.salesToCapital",
        `invested capital ${millions(ic)} is not positive once the operating lease ${millions(leaseOut.amount)} leaves debt (lease-excluded basis, D-25), and the issuer's own filed history does not establish a sales-to-capital ratio on that basis (${history.basis}) - ` +
        `this sales-to-capital DCF is withheld instead of falling back to the lease-inclusive basis`, "critical"));
      return { assumptions: null, notes, gaps };
    }
    emptiedHistory = history;
  }
  // Only after main's critical checks (a refused claim is zero in `ic` above, so those read as at main): a refused
  // temporary-equity operand withholds the DCF at warn, never critical (controller ruling, Task 3, 2026-10-29): the
  // claim exists, only its amount is disputed, and a critical gap would block the report.
  if (temporary !== null && temporary.refusal !== null) {
    gaps.push(gapEntry("valuation.dcf.salesToCapital", `${TEMPORARY_EQUITY_REFUSAL_LEAD}${temporary.refusal} (balance ${bal.date.slice(0, 10)}) - invested capital for sales-to-capital cannot be established, so the DCF cannot be built without the claim's amount and is withheld instead of zero-filling it`, "warn"));
    return { assumptions: null, notes, gaps };
  }
  // D-60: long-term investments (strategic and non-marketable stakes, long
  // marketable securities) are non-operating: their income is below the EBIT
  // this DCF projects, so they are not capital the operating path earns on.
  // NVDA's $51.2B of them cut sales-to-capital from 2.58 to 1.80. When
  // removing them would leave no operating capital (FIN-304), the operating
  // ratio is unbounded and takes the house cap, and the bridge still adds the
  // holding back. (Capital emptied by the lease removal is `emptiedHistory`'s.)
  const lti = isNum(bal.longTermInvestments) && bal.longTermInvestments > 0 ? bal.longTermInvestments : null;
  const operatingIc = lti !== null && ic - lti > 0 ? ic - lti : null;
  const holdingExceedsCapital = emptiedHistory === null && lti !== null && operatingIc === null;
  const exceedsBasis = holdingExceedsCapital
    ? `operating invested capital ${millions(ic - (lti as number))} is not positive once long-term investments ${millions(lti as number)} are removed, so the operating ratio is unbounded and takes the house cap ${S2C_CLAMP[1]} (the limit it approaches from below); the holding is added back in the bridge (house rule D-next, FIN-304)`
    : null;
  const exceedsHoldingClause = `the holding meets or exceeds operating invested capital, so sales-to-capital takes the house cap ${S2C_CLAMP[1]} and the holding is added back here`;
  const emptiedHoldingClause = "sales-to-capital takes the issuer's own history because invested capital is not positive once the operating lease leaves debt";
  const capitalDefinition = `invested capital (totalDebt + consolidated equity [${equity.basis}]${temporaryText} - cashAndShortTermInvestments, ${bal.basis} balance as of ${bal.date}; ${equity.reason})`;
  // Audit 2026-10-22 A-2: the house floor guards against a mis-scaled input,
  // so it yields to a lower ratio the issuer's own filings establish.
  const s2cHistory = emptiedHistory ?? establishedSalesToCapital(inputs.incomeHistory, inputs.capitalHistory ?? null, leaseBasis);
  const rawS2c = emptiedHistory !== null ? emptiedHistory.ratio as number : holdingExceedsCapital ? S2C_CLAMP[1] : startRev / (operatingIc ?? ic);
  const s2cFloor = s2cHistory.ratio !== null && s2cHistory.ratio < S2C_CLAMP[0] ? s2cHistory.ratio : S2C_CLAMP[0];
  const s2c = s2cFloor === S2C_CLAMP[0] ? clampWithNote(rawS2c, S2C_CLAMP[0], S2C_CLAMP[1], "sales-to-capital", notes)
    : clampWithNote(rawS2c, s2cFloor, S2C_CLAMP[1], "sales-to-capital", notes, `the issuer's filed-history floor ${fmtNum(s2cFloor)} in place of the house floor ${S2C_CLAMP[0]}; house cap ${S2C_CLAMP[1]}`);
  let s2cBasis = exceedsBasis !== null
    ? `sales-to-capital is the house cap ${S2C_CLAMP[1]}, not a measured ratio; ${capitalDefinition} less long-term investments: ${exceedsBasis}`
    : operatingIc !== null
    ? `${periodBasis} revenue / operating invested capital (totalDebt + consolidated equity [${equity.basis}]${temporaryText} - cashAndShortTermInvestments - longTermInvestments ${fmtMoney(lti as number)}, ${bal.basis} balance as of ${bal.date}; ${equity.reason}; long-term investments are non-operating, house rule D-60, and the equity bridge adds them back at carrying value less the tax a sale would owe, house rule D-65)`
    : `${periodBasis} revenue / ${capitalDefinition}`;
  if (bal.leaseCoverageNote) s2cBasis += ` Retained totalDebt operand ${bal.totalDebt} (source monetary units): ${bal.leaseCoverageNote}`;
  if (leaseExcluded) s2cBasis += ` Invested capital excludes the disclosed operating-lease portion ${bal.operatingLeaseLiability} (source monetary units): the lease-inclusive total is unavailable, so debt is taken on the lease-excluded basis.`;
  else if (leaseOut.amount > 0) s2cBasis += ` The operating-lease liability ${millions(leaseOut.amount)} removed: its cost is inside the EBIT this DCF projects (ASC 842; D-25).`;
  else if (leaseOut.clause !== null) s2cBasis += ` The operating lease is not removed from invested capital: ${leaseOut.clause}; total debt is used as reported.`;
  else if (leaseBasis.includeLeasesInEv && isNum(bal.operatingLeaseLiability) && bal.operatingLeaseLiability > 0) s2cBasis += ` The operating lease ${millions(bal.operatingLeaseLiability)} is kept in invested capital: METIS_EV_INCLUDE_LEASES keeps it in debt, as the equity bridge does.`;
  if (emptiedHistory !== null) {
    s2cBasis = `sales-to-capital ${s2c.toFixed(4)}x is the median of the issuer's own filed fiscal-year ratios on the lease-excluded basis: invested capital ${millions(ic)} is not positive once the operating lease ${millions(leaseOut.amount)} leaves debt (D-25), ` +
      `so the ${bal.basis} balance as of ${bal.date} cannot establish a ratio and the lease is not put back (${emptiedHistory.basis})${s2c !== rawS2c ? `; held to the house cap ${S2C_CLAMP[1]}` : ""}` +
      `${lti !== null ? `; long-term investments ${fmtMoney(lti)} are non-operating, house rule D-60, and the equity bridge adds them back at carrying value less the tax a sale would owe, house rule D-65` : ""}`;
  } else if (s2c !== rawS2c && s2cFloor !== S2C_CLAMP[0] && rawS2c < s2cFloor) s2cBasis = `model input used ${s2c.toFixed(4)}x; raw ratio ${rawS2c.toFixed(4)}x = revenue ${startRev} / ${operatingIc !== null ? "operating " : ""}invested capital ${operatingIc ?? ic} (source monetary units). ` +
    `Applied lower floor ${s2c.toFixed(4)}x, the issuer's own filed history in place of the house floor ${S2C_CLAMP[0]}: ${s2cHistory.basis}. Forecast reinvestment uses the applied ratio, not the raw ratio. Raw-input basis: ${s2cBasis}`;
  else if (s2c !== rawS2c) s2cBasis = `model input used ${s2c.toFixed(4)}x; raw ratio ${rawS2c.toFixed(4)}x = revenue ${startRev} / ${operatingIc !== null ? "operating " : ""}invested capital ${operatingIc ?? ic} (source monetary units). ` +
    `Applied ${rawS2c > S2C_CLAMP[1] ? "upper cap" : "lower floor"} ${s2c.toFixed(4)}x within house-policy range [${S2C_CLAMP[0]}, ${S2C_CLAMP[1]}]: a house input guard against extreme or mis-scaled capital-efficiency inputs, not an observed economic limit or a calibrated capital-productivity estimate. Forecast reinvestment uses the applied ratio, not the raw ratio. Raw-input basis: ${s2cBasis}` +
    `${rawS2c < S2C_CLAMP[0] ? ` Floor basis: ${s2cHistory.basis}.` : ""}`;
  else if (rawS2c < S2C_CLAMP[0]) s2cBasis += ` The house floor ${S2C_CLAMP[0]} does not apply: ${s2cHistory.basis}.`;

  // --- Terminal economics ----------------------------------------------------
  const terminal = terminalRoic(inputs.waccPct, inputs.roicHistory ?? null);
  if (terminal.note !== null) notes.push(terminal.note);
  // WS6 (D-19): say which cost of capital each ROIC year was measured against,
  // in the notes AND in the manifest when it was not the year's own WACC.
  if (terminal.waccBasisNote !== null) notes.push(terminal.waccBasisNote);
  if (terminal.waccBasis === "current") {
    gaps.push(
      gapEntry(
        "valuation.dcf.terminalRoic.waccBasis",
        "no per-fiscal-year risk-free observation was available, so the ROIC-vs-WACC evidence behind the terminal excess-return house convention compares every fiscal year to the CURRENT WACC",
        "info",
      ),
    );
  }
  const roicTerm = terminal.roicTermPct;
  const reinvestRate = roicTerm > 0 ? gTerm / roicTerm : 0;

  // WS6 (D-19): SBC treatment, stated in the assumption block with the size of
  // the adjustment to the reported free-cash-flow metric.
  const sbcInfo = inputs.fcfSbc ?? null;
  const sbcBasis =
    sbcInfo === null || sbcInfo.beforeSbc === null
      ? "Stock-based compensation is expensed inside the EBIT this DCF projects, so it is never added back here; the reported free-cash-flow metric subtracts it as well (house default). The FCFF path derives from revenue, EBIT margin and reinvestment, not from the free-cash-flow metric, so the two are consistent but not the same series."
      : sbcInfo.sbc === null
        ? `Stock-based compensation is expensed inside the EBIT this DCF projects, so it is never added back here; the reported free-cash-flow metric subtracts it as well (house default). The FCFF path derives from revenue, EBIT margin and reinvestment, not from the free-cash-flow metric, so the two are consistent but not the same series. Reported free cash flow as of ${sbcInfo.asOf ?? "?"}: ${fmtNum(sbcInfo.beforeSbc)}, UNADJUSTED — stock-based compensation was not disclosed.`
        : `Stock-based compensation is expensed inside the EBIT this DCF projects, so it is never added back here; the reported free-cash-flow metric subtracts it as well (house default). The FCFF path derives from revenue, EBIT margin and reinvestment, not from the free-cash-flow metric, so the two are consistent but not the same series. Reported free cash flow as of ${sbcInfo.asOf ?? "?"}: ${fmtNum(sbcInfo.beforeSbc)} before SBC → ${fmtNum(sbcInfo.afterSbc as number)} after subtracting SBC of ${fmtNum(sbcInfo.sbc)}.`;
  notes.push(sbcBasis);

  // D-60: the ceiling the bull/bear margin shocks may not cross. The scenario
  // construction text states it; it does not bind the base path.
  const scenarioCeiling = scenarioMarginCeiling(ttm, inputs.incomeHistory);

  // D-65: the explicit windows start the day after the statement date, so the
  // flows are discounted to that date; the price they are compared with is a
  // later quote. Rolling the value forward at the WACC states it at the quote
  // date. The bridge stays at the statement-date balance: cash generated since
  // then is inside the first window's flows, not double counted.
  const statementDate = ttm?.date ?? null;
  // FIN-103: the bridge row is the statement-date balance when one exists
  // (`dcfBridgeRow`); when none does, the text names the balance actually used
  // and which side of the statement date it falls on, never the D-65 sentence.
  const bridgeOffsetDays = statementDate !== null ? daysBetween(statementDate, bal.date.slice(0, 10)) : null;
  const bridgeDate = bal.date.slice(0, 10);
  const bridgeCause = inputs.bridgeCause?.cause;
  const bridgeDetail = inputs.bridgeCause?.detail ?? null;
  const keeps = bridgeCause === "statement-row-refused" || bridgeCause === "anchor-refused";
  const dayClause = bridgeOffsetDays === null || bridgeOffsetDays === 0 ? null
    : bridgeOffsetDays > 0
      ? `${bridgeOffsetDays} days after the statement date; flows between the two dates are in both that balance and the first window`
      : `${-bridgeOffsetDays} days before the statement date; flows between the two dates are in neither that balance nor the first window`;
  const bridgeBalanceText = dayClause === null ? null : `the equity bridge ${keeps ? "keeps" : "uses"} the ${bridgeDate} balance, ${dayClause}`;
  if (bridgeBalanceText !== null) {
    const lead = bridgeCause === "none-filed" ? `no balance sheet is filed at the statement date ${statementDate}`
      : bridgeCause === "incomplete" ? `the balance sheet at the statement date ${statementDate} lacks ${bridgeDetail ?? "an operand the bridge reads"}`
      : bridgeCause === "statement-row-refused" ? `the balance sheet at the statement date ${statementDate} is withheld (${bridgeDetail ?? "refused"})`
      : bridgeCause === "anchor-refused" ? null
      : `the balance sheet the bridge reads is not dated at the statement date ${statementDate}`;
    gaps.push(gapEntry("valuation.dcf.bridgeBalanceDate",
      lead === null
        ? `the market EV's balance (${bridgeDate}) is withheld${bridgeDetail ? ` (${bridgeDetail})` : ""}, so the equity bridge keeps it and the DCF stays withheld as before; that balance is ${dayClause}`
        : `${lead}; ${bridgeBalanceText}`, "info"));
  }
  const elapsedDays = statementDate !== null && inputs.valuationDate ? daysBetween(statementDate, inputs.valuationDate) : null;
  let valuationDate: DcfAssumptions["valuationDate"] | undefined;
  if (elapsedDays !== null && elapsedDays > 0 && elapsedDays <= MAX_ROLL_FORWARD_DAYS) {
    const elapsedYears = elapsedDays / DAYS_PER_YEAR;
    const factor = Math.pow(1 + inputs.waccPct / 100, elapsedYears);
    valuationDate = {
      value: inputs.valuationDate as string,
      elapsedYears,
      basis: `cash flows are discounted from the statement date ${statementDate} and rolled forward ${elapsedDays} days to the quote date ${inputs.valuationDate} ` +
        `at the WACC (× ${factor.toFixed(4)}), so the per-share value and the price it is compared with share a date; ${bridgeBalanceText ?? `the equity bridge stays at the ${statementDate} balance, ` +
        "whose later cash generation is inside the first window's flows"} (house rule D-65)`,
    };
    notes.push(`Valuation date: ${valuationDate.basis}`);
  } else if (elapsedDays !== null && elapsedDays > MAX_ROLL_FORWARD_DAYS) {
    notes.push(`Valuation date: the quote ${inputs.valuationDate} is ${elapsedDays} days after the statement date ${statementDate}, beyond the ${MAX_ROLL_FORWARD_DAYS}-day roll-forward limit; the value is stated at the statement date${bridgeBalanceText === null ? "" : `, and ${bridgeBalanceText}`} (house rule D-65)`);
    gaps.push(gapEntry("valuation.dcf.valuationDate", `quote ${elapsedDays} days after the statement date — value not rolled forward`, "info"));
  }

  const assumptions: DcfAssumptions = {
    ...(ttm?.date ? { forecastPeriod: {
      basis: ttm.basis === "annual" ? "fiscal-year" as const : "rolling-12-month" as const,
      anchorEndDate: ttm.date,
      anchorStartDate: forecastYearPeriod(ttm.date, 0, "rolling-12-month")?.startDate ?? null,
    } } : {}),
    startRevenue: { value: startRev, basis: `${periodBasis} revenue as of ${ttm?.date ?? "?"}` },
    years,
    wacc: {
      value: inputs.waccPct,
      basis: inputs.waccBasis ?? `WACC ${fmtNum(inputs.waccPct)}% (inputs not supplied to the assumption block)`,
    },
    sbc: {
      value: inputs.fcfSbc ?? {
        beforeSbc: null,
        afterSbc: null,
        sbc: null,
        asOf: null,
        basis: "free-cash-flow SBC treatment not supplied to the assumption block",
      },
      basis: sbcBasis,
    },
    growthAnchor,
    revenueAnchor,
    growthPath: {
      value: growthPath,
      basis:
        `year one ${fmtNum(growthPath[0])}% from the revenue anchor (${revenueAnchor.source === "consensus" ? "analyst consensus" : revenueAnchor.source})` +
        (anchoredGrowth.length >= 2
          ? `, ${anchoredGrowth.length === 2 ? "year two" : `years 2–${anchoredGrowth.length}`} ${anchoredGrowth.slice(1).map((g) => `${fmtNum(g)}%`).join(", ")} on consensus` +
            ` (consensus anchors ${consensusYearsText(revenueAnchor.consensusYears ?? [])}; house rule D-65)`
          : revenueAnchor.source === "consensus" ? " (consensus anchors year one only)" : "") +
        "; " +
        `later years follow a convergent fade from year ${anchoredGrowth.length}'s ${fmtNum(lastAnchored)}% to the terminal rate ${fmtNum(gTerm)}% in year ${years}: ` +
        `the excess over the terminal rate decays geometrically with a ${GROWTH_FADE_HALF_LIFE_YEARS}-year half-life, rescaled so it closes exactly in year ${years}, ` +
        `so it falls somewhat faster than halving every ${GROWTH_FADE_HALF_LIFE_YEARS} years (house rule D-58; the linear fade is retired). ` +
        (rateSetsYearOne
          ? `Year one carries the near-term growth rate ${fmtNum(gMid)}% = ${gMidBasis}. `
          : "") +
        "The year-one revenue anchor and the near-term growth rows state their own bases.",
    },
    ebitMarginPath: { value: marginPath, basis: marginBasis },
    ...(improvingBound !== null && cappedTarget > m0 ? { improvingMarginFade: { currentPct: m0, targetPct: cappedTarget } } : {}),
    taxRatePath: { value: taxRatePath, basis: taxBasis },
    salesToCapital: { value: s2c, basis: s2cBasis },
    terminal: {
      gTermPct: { value: gTerm, basis: gTermBasis },
      roicTermPct: {
        value: roicTerm,
        basis: terminal.waccBasisNote === null ? terminal.basis : `${terminal.basis}; ${terminal.waccBasisNote}`,
      },
      reinvestmentRate: {
        value: reinvestRate,
        basis: "terminal reinvestment = gTerm / ROICterm (Damodaran consistency rule)",
      },
    },
    midYear: { value: true, basis: MID_YEAR_DISCOUNTING_BASIS },
    scenarioMarginCeiling: scenarioCeiling,
    ...(valuationDate ? { valuationDate } : {}),
    ...(lti !== null ? { nonOperatingInvestments: { value: lti, balanceDate: bal.date, ...(exceedsBasis !== null ? { basis: exceedsHoldingClause } : emptiedHistory !== null ? { basis: emptiedHoldingClause } : {}) } } : {}),
    investmentTax: { ratePct: taxFloor, basis: taxFloorText },
    asOf: { statements: ttm?.date ?? null, estimates: analyst.asOf },
    notes,
  };
  return { assumptions, notes, gaps };
}

// ---------------------------------------------------------------------------
// DCF engine
// ---------------------------------------------------------------------------

export interface DcfRunOptions {
  waccPct: number;
  /** Net debt in reporting-currency units (totalDebt - cash...); null = gap. */
  netDebt: number | null;
  dilutedShares: number | null;
  /**
   * Minority (non-controlling) interest — a claim senior to common equity, netted
   * out of EV in the bridge. Undisclosed ⇒ omit/null ⇒ treated as 0 (FMP convention,
   * mirroring the multiples-path EV definition). Never part of net debt.
   */
  minorityInterest?: number | null;
  /** Preferred equity — same treatment as minority interest above. */
  preferred?: number | null;
  /**
   * Audit 2026-10-22 E-5: NCI's share of trailing consolidated profit (a
   * fraction). Above NCI_EARNINGS_KEY_MATERIALITY_PCT, the bridge deducts NCI
   * at this share of consolidated equity value whenever that exceeds the book
   * `minorityInterest`. Omit/null ⇒ the book deduction.
   */
  noncontrollingEarningsShare?: number | null;
  /** E-5: the end of the period the share was measured over, for the disclosure. */
  noncontrollingEarningsAsOf?: string | null;
  /** E-5: that period: the trailing four quarters, or the latest fiscal year when they cannot size the key. */
  noncontrollingEarningsBasis?: "ttm" | "annual";
  /**
   * D-60: non-operating assets ADDED to equity value, at a sourced fair value
   * (marketable equity securities excluded from cash). Their returns are below
   * EBIT, so the FCFF path does not value them. Omit/null ⇒ none.
   */
  nonOperatingAssets?: number | null;
  /** D-65: what `nonOperatingAssets` is made of, for the bridge disclosure; the engine reads only the total. */
  nonOperatingComponents?: NonOperatingAssetComponent[] | null;
  /**
   * FIN-119: the temporary-equity claims already folded into `preferred` and
   * `minorityInterest`. Disclosure only, so every re-run of the bridge (D-26)
   * carries what the base bridge deducted.
   */
  temporaryEquity?: TemporaryEquityDisclosure | null;
}

/** FIN-119: the redeemable claims inside a bridge's `preferred` and `minorityInterest` (never added again). */
export interface TemporaryEquityDisclosure {
  redeemablePreferred: number;
  redeemableNoncontrolling: number;
  unsplit: number;
  basis: string;
}

/**
 * D-65: one non-operating asset the equity bridge adds, at its filed carrying
 * or fair value. The "investment-tax" line is negative: the tax a sale of the
 * others would owe (AMZN audit 2026-10-20). So is a "debt-like-obligation":
 * a filed asset-retirement, environmental, pension and OPEB, loss-contingency
 * or contingent-consideration liability (audit 2026-10-22 E-7, audit 2026-10-27
 * FIN-305), whose value is the AFTER-TAX claim: the filed amount times one
 * minus the D-98 marginal rate.
 */
export interface NonOperatingAssetComponent {
  kind: "marketable-equity-securities" | "long-term-investments" | "investment-tax" | "debt-like-obligation";
  label: string;
  value: number;
  basis: string;
}

export interface DcfYearRow {
  period?: DcfForecastPeriod;
  year: number;
  revenue: number;
  growthPct: number;
  ebitMarginPct: number;
  ebit: number;
  taxRatePct: number;
  nopat: number;
  reinvestment: number;
  fcff: number;
  discountFactor: number;
  pv: number;
}

export interface DcfForecastPeriod {
  basis: "rolling-12-month" | "fiscal-year";
  startDate: string;
  endDate: string;
  label: string;
}

/** Calendar-anniversary windows, clamped for leap days; never a guessed fiscal year. */
export function forecastYearPeriod(anchorEndDate: string, t: number, basis: DcfForecastPeriod["basis"]): DcfForecastPeriod | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorEndDate) || !Number.isInteger(t)) return null;
  const anchor = new Date(`${anchorEndDate}T00:00:00Z`);
  if (!Number.isFinite(anchor.getTime()) || anchor.toISOString().slice(0, 10) !== anchorEndDate) return null;
  // Retain the exact four-digit ISO-date contract, including the main branch's
  // overflow guard. setUTCFullYear avoids Date.UTC's 1900 offset for years <100.
  if (anchor.getUTCFullYear() + t > 9999 || anchor.getUTCFullYear() + t - 1 < 0) return null;
  const anniversary = (offset: number) => {
    const year = anchor.getUTCFullYear() + offset;
    const month = anchor.getUTCMonth();
    const lastDay = new Date(anchor);
    lastDay.setUTCFullYear(year, month + 1, 0);
    const shifted = new Date(anchor);
    shifted.setUTCFullYear(year, month, Math.min(anchor.getUTCDate(), lastDay.getUTCDate()));
    return shifted;
  };
  const endDate = anniversary(t).toISOString().slice(0, 10);
  const start = anniversary(t - 1);
  start.setUTCDate(start.getUTCDate() + 1);
  return { basis, startDate: start.toISOString().slice(0, 10), endDate,
    label: basis === "fiscal-year" ? `FY${endDate.slice(0, 4)} ending ${endDate}` : `12M ending ${endDate}` };
}

/** The EV→equity→per-share bridge a DCF result was computed with. */
export interface DcfBridge {
  netDebt: number | null;
  dilutedShares: number | null;
  minorityInterest: number | null;
  preferred: number | null;
  /** FIN-119: the temporary-equity claims inside `preferred` / `minorityInterest` above (disclosure only). */
  temporaryEquity?: TemporaryEquityDisclosure;
  /** D-60: present only when the bridge added a sourced non-operating asset. */
  nonOperatingAssets?: number;
  /** D-65: the components of `nonOperatingAssets`, when more than the D-60 equity securities are known. */
  nonOperatingComponents?: NonOperatingAssetComponent[];
  /**
   * D-65: shares outstanding the quote implies (market cap ÷ price), shown
   * beside the diluted denominator; disclosure only, never the divisor.
   */
  sharesOutstandingAtQuote?: number;
  /** E-5: NCI's share of consolidated profit, when the earnings key was established. */
  noncontrollingEarningsShare?: number;
  noncontrollingEarningsAsOf?: string | null;
  noncontrollingEarningsBasis?: "ttm" | "annual";
  /** E-5: the NCI amount the base bridge deducted (book, or the earnings share of consolidated equity value). */
  noncontrollingDeducted?: number;
  noncontrollingDeductionBasis?: "book" | "earnings-share";
}

export interface DcfResult {
  enterpriseValue: number;
  equityValue: number | null;
  perShare: number | null;
  /**
   * The bridge this result used. Every consumer that re-runs the DCF for a
   * scenario (scenarioTargets.ts, projections.ts) reads it from here, so bull,
   * base and bear can never bridge on different net debt: valueCompany removes
   * the operating-lease liability before bridging, and a re-run on the raw
   * figure published a bull target below base for every lease-heavy issuer.
   */
  bridge: DcfBridge;
  pvExplicit: number;
  pvTerminal: number;
  /** pvTerminal / enterpriseValue (share of value in the terminal). */
  terminalShare: number | null;
  terminalValue: number;
  /** Terminal growth actually used after the TV guard (pct). */
  gTermUsedPct: number;
  yearRows: DcfYearRow[];
  notes: string[];
  gaps: ManifestEntry[];
  /**
   * Audit 2026-10-22 B-29: set only when the base DCF failed a domain test.
   * `perShare` is then null; the model's own figure is kept here for the record.
   */
  domain?: DcfDomainFailure;
  /**
   * Audit 2026-10-22 E-5: set only when the per-share value was withheld
   * because NCI's earnings key is unestablished (no other gate had withheld it).
   */
  noncontrollingKeyWithheld?: string;
  /**
   * FIN-119: set only when the per-share value was withheld because a
   * temporary-equity claim is refused, or an unsplit total meets the E-5
   * earnings key (no earlier gate had withheld it).
   */
  temporaryEquityWithheld?: string;
}

/** A domain test the base DCF failed (audit 2026-10-22 B-29). */
export interface DcfDomainTest {
  test: "equity-value-non-positive" | "terminal-share-above-100pct";
  detail: string;
}

export interface DcfDomainFailure {
  status: "outside";
  failures: DcfDomainTest[];
  /** The per-share the model computed before it was withheld (null when no share count). */
  rawPerShare: number | null;
  reason: string;
}

/**
 * Audit 2026-10-22 B-29: an FCFF DCF is outside its domain when its equity
 * value is at or below zero (enterprise value at or below net debt and the
 * senior claims), or when its terminal value is more than all of enterprise
 * value (explicit-period present value below zero, so the explicit forecast
 * destroys value and the terminal year alone carries it). Either way the
 * per-share figure describes the balance sheet or the Gordon year, not the
 * operating business. Returns null when the DCF is inside the domain.
 */
export function dcfDomainFailure(dcf: DcfResult): DcfDomainFailure | null {
  const failures: DcfDomainTest[] = [];
  if (isNum(dcf.equityValue) && dcf.equityValue <= 0) {
    failures.push({
      test: "equity-value-non-positive",
      detail: `equity value ${fmtMoney(dcf.equityValue)} is at or below zero: enterprise value ${fmtMoney(dcf.enterpriseValue)} does not cover net debt and the senior claims`,
    });
  }
  if (dcf.pvExplicit < 0) {
    const share = dcf.enterpriseValue > 0 ? ` (${fmtNum((dcf.pvTerminal / dcf.enterpriseValue) * 100)}% of enterprise value ${fmtMoney(dcf.enterpriseValue)})` : "";
    failures.push({
      test: "terminal-share-above-100pct",
      detail: `the terminal value's present value ${fmtMoney(dcf.pvTerminal)} exceeds the whole enterprise value${share}: the explicit-period present value is ${fmtMoney(dcf.pvExplicit)}, below zero`,
    });
  }
  if (failures.length === 0) return null;
  const reason =
    `FCFF DCF outside its domain: ${failures.map((f) => f.detail).join("; ")}. ` +
    "The per-share value, sensitivity grids, reverse DCF and scenario targets are withheld, and the valuation grade does not use the DCF";
  // `rawPerShare` is null when an unsplit temporary-equity total met the earnings key (the per share was already withheld); nothing reads it.
  return { status: "outside", failures, rawPerShare: dcf.perShare, reason };
}

interface DcfCoreOverrides {
  growthPathPct?: number[];
  ebitMarginPathPct?: number[];
  gTermPct?: number;
  /** "clamp": pull gTerm down to wacc - guardPp and note; "null": return null. */
  guardMode: "clamp" | "null";
  /** WACC − gTerm minimum (pp) before the TV guard fires. Default TV_GUARD_PP (2.0pp). */
  guardPp?: number;
}

interface DcfCoreOutput {
  pvExplicit: number;
  pvTerminal: number;
  terminalValue: number;
  enterpriseValue: number;
  gTermUsedPct: number;
  yearRows: DcfYearRow[];
  notes: string[];
}

/** Shared DCF evaluation. Cash-flow path derives only from assumptions (+overrides). */
function dcfCore(
  a: DcfAssumptions,
  waccPct: number,
  o: DcfCoreOverrides,
): DcfCoreOutput | null {
  const notes: string[] = [];
  const n = a.years;
  const growth = o.growthPathPct ?? a.growthPath.value;
  const margins = o.ebitMarginPathPct ?? a.ebitMarginPath.value;
  const taxes = a.taxRatePath.value;
  const midYear = a.midYear.value;
  const w = waccPct / 100;
  if (w <= -1) return null; // degenerate discount rate

  const guardPp = o.guardPp ?? TV_GUARD_PP;
  let gTerm = o.gTermPct ?? a.terminal.gTermPct.value;
  if (waccPct - gTerm < guardPp) {
    if (o.guardMode === "null") return null;
    const clamped = waccPct - guardPp;
    notes.push(
      `Gordon TV guard: WACC ${fmtNum(waccPct)}% - gTerm ${fmtNum(gTerm)}% < ${guardPp}pp — gTerm reduced to ${fmtNum(clamped)}% (house rule)`,
    );
    gTerm = clamped;
  }

  const s2c = a.salesToCapital.value;
  // D-65: the value is stated at the quote date, `elapsed` years after the
  // statement date the windows are measured from.
  const elapsed = a.valuationDate && Number.isFinite(a.valuationDate.elapsedYears) && a.valuationDate.elapsedYears > 0 ? a.valuationDate.elapsedYears : 0;
  const yearRows: DcfYearRow[] = [];
  let rev = a.startRevenue.value;
  let pvExplicit = 0;
  // Net-operating-loss balance carried across the explicit horizon.
  let nolBalance = 0;
  let nolUsed = false;
  for (let t = 1; t <= n; t++) {
    const g = growth[t - 1];
    const m = margins[t - 1];
    const tax = taxes[t - 1];
    const prev = rev;
    rev = prev * (1 + g / 100);
    const ebit = rev * (m / 100);
    // A loss year earns no cash tax REFUND. `ebit * (1 - t)` applied to a
    // negative EBIT credits the firm |EBIT| x t of cash it never receives,
    // shrinking the modelled loss and inflating the DCF — on exactly the
    // unprofitable issuers whose valuation is least certain. Note the
    // deliberate asymmetry one line below: reinvestment is already floored at 0.
    // Losses are instead carried forward and shelter later taxable income,
    // which is standard DCF practice; no jurisdictional cap is modelled.
    let nopat: number;
    // Report the rate actually applied, so ebit/taxRatePct/nopat stay
    // internally consistent for a reader auditing the year rows.
    let effectiveTaxPct: number;
    if (ebit <= 0) {
      nopat = ebit;
      nolBalance += -ebit;
      effectiveTaxPct = 0;
    } else if (nolBalance <= 0) {
      // Unchanged arithmetic, deliberately: the overwhelming majority of
      // issuers project no loss year, and rearranging this expression would
      // shift their results in the last floating-point digit for no reason.
      nopat = ebit * (1 - tax / 100);
      effectiveTaxPct = tax;
    } else {
      const sheltered = Math.min(ebit, nolBalance);
      nolBalance -= sheltered;
      nolUsed = true;
      nopat = ebit - (ebit - sheltered) * (tax / 100);
      effectiveTaxPct = ((ebit - nopat) / ebit) * 100;
    }
    const reinvestment = Math.max(0, (rev - prev) / s2c);
    const fcff = nopat - reinvestment;
    const discountFactor = Math.pow(1 + w, (midYear ? t - 0.5 : t) - elapsed);
    const pv = fcff / discountFactor;
    pvExplicit += pv;
    yearRows.push({
      year: t,
      ...(a.forecastPeriod && forecastYearPeriod(a.forecastPeriod.anchorEndDate, t, a.forecastPeriod.basis)
        ? { period: forecastYearPeriod(a.forecastPeriod.anchorEndDate, t, a.forecastPeriod.basis)! } : {}),
      revenue: rev,
      growthPct: g,
      ebitMarginPct: m,
      ebit,
      taxRatePct: effectiveTaxPct,
      nopat,
      reinvestment,
      fcff,
      discountFactor,
      pv,
    });
  }

  if (nolUsed) {
    notes.push(
      "Projected operating losses earn no cash tax refund; they are carried forward and shelter later " +
        "taxable income within the explicit horizon (no jurisdictional carryforward cap modelled). " +
        "Year rows report the effective rate actually applied.",
    );
  }
  if (nolBalance > 0) {
    notes.push(
      "Unused net operating losses remain at the end of the explicit horizon; no residual tax asset is " +
        "credited to the terminal value (conservative).",
    );
  }

  // Terminal: FCFF_{N+1} = NOPAT_{N+1} * (1 - g/ROICterm); TV = FCFF_{N+1}/(WACC - g)
  const roicTerm = a.terminal.roicTermPct.value;
  let reinvestRate: number;
  if (roicTerm > 0) {
    reinvestRate = gTerm / roicTerm;
    if (reinvestRate > 1) {
      notes.push(
        `terminal reinvestment rate g/ROIC = ${fmtNum(reinvestRate)} > 1 — clamped to 1 (house rule; terminal FCFF floored at 0)`,
      );
      reinvestRate = 1;
    }
  } else {
    reinvestRate = 0;
    notes.push("terminal ROIC <= 0 — terminal reinvestment set to 0 (house rule)");
  }
  const marginTerm = margins[n - 1];
  const taxTerm = taxes[n - 1];
  // Same rule as the explicit years: a negative terminal EBIT is not handed a
  // tax refund.
  const ebitN1 = rev * (1 + gTerm / 100) * (marginTerm / 100);
  const nopatN1 = ebitN1 > 0 ? ebitN1 * (1 - taxTerm / 100) : ebitN1;
  const fcffN1 = nopatN1 * (1 - reinvestRate);
  const terminalValue = fcffN1 / ((waccPct - gTerm) / 100);
  const pvTerminal = terminalValue / Math.pow(1 + w, (midYear ? n - 0.5 : n) - elapsed);

  return {
    pvExplicit,
    pvTerminal,
    terminalValue,
    enterpriseValue: pvExplicit + pvTerminal,
    gTermUsedPct: gTerm,
    yearRows,
    notes,
  };
}

/**
 * EV → equity → per-share bridge. Equity = EV − net debt − minority interest −
 * preferred equity, mirroring the multiples-path EV definition (which ADDS
 * preferred + minority to market cap). Undisclosed minority/preferred are 0 (FMP
 * convention). Net debt is required — without it EV cannot be bridged.
 */
function bridgeToPerShare(
  enterpriseValue: number,
  netDebt: number | null,
  dilutedShares: number | null,
  gaps: ManifestEntry[],
  minorityInterest: number | null = null,
  preferred: number | null = null,
  nonOperatingAssets: number | null = null,
  noncontrollingEarningsShare: number | null = null,
  unsplitTemporaryEquity: number = 0,
): { equityValue: number | null; perShare: number | null; noncontrollingDeducted: number; noncontrollingBasis: "book" | "earnings-share"; unsplitWithheld?: true } {
  const book = isNum(minorityInterest) ? minorityInterest : 0;
  if (!isNum(netDebt)) {
    gaps.push(
      gapEntry("valuation.dcf.netDebt", "net debt unavailable — enterprise value cannot be bridged to equity", "warn"),
    );
    return { equityValue: null, perShare: null, noncontrollingDeducted: book, noncontrollingBasis: "book" };
  }
  // E-5: consolidated equity value, the claim common and NCI holders share.
  const consolidatedEquity =
    enterpriseValue - netDebt - (isNum(preferred) ? preferred : 0) + (isNum(nonOperatingAssets) ? nonOperatingAssets : 0);
  const { deducted, basis } = noncontrollingDeduction(consolidatedEquity, book, noncontrollingEarningsShare);
  const equityValue = consolidatedEquity - deducted;
  const shares = posOrNull(dilutedShares);
  if (shares === null) {
    gaps.push(
      gapEntry("valuation.dcf.dilutedShares", "diluted share count missing or non-positive — per-share value unavailable", "warn"),
    );
    return { equityValue, perShare: null, noncontrollingDeducted: deducted, noncontrollingBasis: basis };
  }
  // FIN-119: an unsplit temporary-equity total may be NCI the earnings key already sizes, so
  // wherever the deduction is on the earnings share (the base, a grid cell, a scenario path) it is withheld.
  if (unsplitTemporaryEquity !== 0 && basis === "earnings-share") {
    return { equityValue, perShare: null, noncontrollingDeducted: deducted, noncontrollingBasis: basis, unsplitWithheld: true };
  }
  return { equityValue, perShare: equityValue / shares, noncontrollingDeducted: deducted, noncontrollingBasis: basis };
}

/** FIN-119: the sentence a grid, reverse DCF or scenario note carries when its own cells or paths were withheld by the unsplit rule. */
export const UNSPLIT_CELLS_LEAD = "Cells where the noncontrolling deduction takes the profit share are withheld";
export function unsplitCellsNote(unsplit: number): string {
  return `${UNSPLIT_CELLS_LEAD}: the filed temporary-equity total of ${millions(unsplit)} is not split between redeemable preferred and redeemable noncontrolling interests, so it could be counted twice.`;
}

/** FIN-119: why the per share is withheld when an unsplit temporary-equity total meets the E-5 earnings key. */
function unsplitEarningsKeyReason(unsplit: number): string {
  return `The filed temporary equity of ${millions(unsplit)} has no parent/NCI split, and the noncontrolling interest is sized on its share of earnings, so the unsplit amount may be noncontrolling interest that the earnings key already counts. ` +
    "The per-share value is withheld rather than deduct it twice (FIN-119).";
}

/**
 * HOUSE CONVENTION (owner decision, audit 2026-10-22 E-5): NCI's share of
 * trailing consolidated profit must exceed this before it can replace the book
 * deduction.
 */
export const NCI_EARNINGS_KEY_MATERIALITY_PCT = 10;

/**
 * E-5: a consolidated FCFF DCF values the outside holders' share of the
 * subsidiaries too. When NCI earns more than NCI_EARNINGS_KEY_MATERIALITY_PCT
 * of trailing consolidated profit and that share of consolidated equity value
 * exceeds the book NCI (profit share > book ÷ consolidated equity value), NCI is
 * deducted at the profit share; otherwise at book.
 */
function noncontrollingDeduction(consolidatedEquity: number, book: number, share: number | null): { deducted: number; basis: "book" | "earnings-share" } {
  if (isNum(share) && share * 100 > NCI_EARNINGS_KEY_MATERIALITY_PCT && consolidatedEquity > 0 && share * consolidatedEquity > book) {
    return { deducted: share * consolidatedEquity, basis: "earnings-share" };
  }
  return { deducted: book, basis: "book" };
}

/** E-5: "35.8% share of trailing consolidated profit to 2026-06-30", the key as every surface states it. */
export function noncontrollingProfitShareText(bridge: Pick<DcfBridge, "noncontrollingEarningsShare" | "noncontrollingEarningsAsOf" | "noncontrollingEarningsBasis">): string {
  const share = bridge.noncontrollingEarningsShare ?? 0;
  const period = bridge.noncontrollingEarningsBasis === "annual" ? "fiscal-year" : "trailing";
  return `${(share * 100).toFixed(1)}% share of ${period} consolidated profit${bridge.noncontrollingEarningsAsOf ? ` to ${bridge.noncontrollingEarningsAsOf}` : ""}`;
}

/** E-5: why a share that is on record still leaves the deduction at book. */
export function noncontrollingBookReason(share: number): string {
  return share * 100 > NCI_EARNINGS_KEY_MATERIALITY_PCT ? "would deduct no more than book" : `is not above the ${NCI_EARNINGS_KEY_MATERIALITY_PCT}% house threshold`;
}

/** The income-statement fields the E-5 key reads, from a TTM window or an annual row. */
export interface NoncontrollingEarningsRow {
  date?: string | null;
  netIncome?: number | null;
  netIncomeConsolidated?: number | null;
  netIncomeOwnershipBasis?: "parent" | "consolidated";
  netIncomeAttributableToNoncontrollingInterest?: number | null;
  /** The NCI income came from a filed fact (every quarter of a window); a vendor row can emit an omitted field as 0. */
  noncontrollingIncomeEvidenced?: boolean;
  /** A quarter of the window reports zero NCI income without a filed fact, so a nonzero sum may still omit it. */
  noncontrollingIncomeUnevidencedZero?: boolean;
}

/**
 * E-5: NCI's profit and consolidated profit for the earnings key. The trailing
 * four quarters when they carry both, else the latest fiscal year (the DCF's
 * own income falls back the same way). Parent net income plus NCI income is
 * consolidated profit only when the net income is known to be the parent's.
 */
export function noncontrollingEarningsInput(ttm: NoncontrollingEarningsRow | null, annual: NoncontrollingEarningsRow | null): NonNullable<ValuationBundleInputs["noncontrollingEarnings"]> | null {
  const read = (row: NoncontrollingEarningsRow | null, basis: "ttm" | "annual") => {
    if (row === null) return null;
    const reported = isNum(row.netIncomeAttributableToNoncontrollingInterest) ? row.netIncomeAttributableToNoncontrollingInterest : null;
    // A zero establishes a 0% share only when a filing reports it, and a sum
    // with an unevidenced zero quarter may omit that quarter's NCI income.
    const nci = (reported === 0 && row.noncontrollingIncomeEvidenced !== true) || row.noncontrollingIncomeUnevidencedZero === true ? null : reported;
    const net = isNum(row.netIncome) ? row.netIncome : null;
    const consolidatedProfit = isNum(row.netIncomeConsolidated) ? row.netIncomeConsolidated
      : row.netIncomeOwnershipBasis === "consolidated" ? net
      : row.netIncomeOwnershipBasis === "parent" && net !== null && nci !== null ? net + nci
      : null;
    return { noncontrollingIncome: nci, consolidatedProfit, asOf: row.date ? row.date.slice(0, 10) : null, basis };
  };
  const trailing = read(ttm, "ttm");
  const fiscal = read(annual, "annual");
  // Usable: both figures, positive consolidated profit, and NCI income within it (the rule valueCompany applies).
  const usable = (key: ReturnType<typeof read>) => key !== null && key.noncontrollingIncome !== null && key.consolidatedProfit !== null &&
    key.consolidatedProfit > 0 && key.noncontrollingIncome <= key.consolidatedProfit;
  return usable(trailing) ? trailing : usable(fiscal) ? fiscal : trailing ?? fiscal;
}

/** E-5: the DCF note naming which NCI basis the bridge used, and the other one. */
function noncontrollingBridgeNote(bridge: DcfBridge, consolidatedEquity: number | null): string {
  const book = bridge.minorityInterest ?? 0;
  const share = bridge.noncontrollingEarningsShare;
  if (bridge.noncontrollingDeductionBasis === "earnings-share" && isNum(share)) {
    return `equity bridge deducts noncontrolling interest at its ${noncontrollingProfitShareText(bridge)}: ` +
      `${fmtNum(bridge.noncontrollingDeducted ?? 0)} of consolidated equity value ${consolidatedEquity === null ? "unavailable" : fmtNum(consolidatedEquity)}, ` +
      `above its book value ${fmtNum(book)} (house rule: the earnings key applies above ${NCI_EARNINGS_KEY_MATERIALITY_PCT}% of profit when it exceeds the book deduction; audit 2026-10-22 E-5)`;
  }
  return `equity bridge deducts noncontrolling interest at its book value ${fmtNum(book)}` +
    (isNum(share)
      ? ` — its ${noncontrollingProfitShareText(bridge)} ${noncontrollingBookReason(share)}`
      : "") +
    " (a filed book-value proxy, not a market value)";
}

/**
 * Run the FCFF DCF: mid-year convention per assumptions, Gordon terminal with
 * the WACC - g >= 2pp guard (clamps g down and notes it).
 */
export function runDcf(assumptions: DcfAssumptions, opts: DcfRunOptions): DcfResult {
  const gaps: ManifestEntry[] = [];
  const bridge: DcfBridge = {
    netDebt: opts.netDebt,
    dilutedShares: opts.dilutedShares,
    minorityInterest: opts.minorityInterest ?? null,
    preferred: opts.preferred ?? null,
    ...(opts.temporaryEquity ? { temporaryEquity: { ...opts.temporaryEquity } } : {}),
    ...(isNum(opts.noncontrollingEarningsShare) ? {
      noncontrollingEarningsShare: opts.noncontrollingEarningsShare,
      noncontrollingEarningsAsOf: opts.noncontrollingEarningsAsOf ?? null,
      ...(opts.noncontrollingEarningsBasis !== undefined ? { noncontrollingEarningsBasis: opts.noncontrollingEarningsBasis } : {}),
    } : {}),
    ...(isNum(opts.nonOperatingAssets) && opts.nonOperatingAssets !== 0 ? { nonOperatingAssets: opts.nonOperatingAssets } : {}),
    ...(isNum(opts.nonOperatingAssets) && opts.nonOperatingAssets !== 0 && opts.nonOperatingComponents && opts.nonOperatingComponents.length > 0
      ? { nonOperatingComponents: opts.nonOperatingComponents.map((c) => ({ ...c })) } : {}),
  };
  const core = dcfCore(assumptions, opts.waccPct, { guardMode: "clamp" });
  if (core === null) {
    // Only reachable for degenerate WACC (<= -100%); keep a total-function shape.
    return {
      enterpriseValue: 0,
      equityValue: null,
      perShare: null,
      bridge,
      pvExplicit: 0,
      pvTerminal: 0,
      terminalShare: null,
      terminalValue: 0,
      gTermUsedPct: assumptions.terminal.gTermPct.value,
      yearRows: [],
      notes: ["DCF not evaluable at the supplied WACC (degenerate discount rate)"],
      gaps: [gapEntry("valuation.dcf", "degenerate WACC input", "critical")],
    };
  }
  const { equityValue, perShare, noncontrollingDeducted, noncontrollingBasis, unsplitWithheld } = bridgeToPerShare(
    core.enterpriseValue,
    opts.netDebt,
    opts.dilutedShares,
    gaps,
    opts.minorityInterest ?? null,
    opts.preferred ?? null,
    opts.nonOperatingAssets ?? null,
    opts.noncontrollingEarningsShare ?? null,
    opts.temporaryEquity?.unsplit ?? 0,
  );
  const notes = [...core.notes];
  let temporaryEquityWithheld: string | undefined;
  if (unsplitWithheld === true) {
    temporaryEquityWithheld = unsplitEarningsKeyReason(opts.temporaryEquity!.unsplit);
    gaps.push(gapEntry("valuation.dcf.temporaryEquityAllocation", temporaryEquityWithheld, "warn"));
  }
  // E-5: book NCI, or a profit share valueCompany sized from positive NCI income (book may be zero).
  const noncontrollingClaim = (isNum(opts.minorityInterest) && opts.minorityInterest !== 0) || isNum(opts.noncontrollingEarningsShare);
  if (noncontrollingClaim || (isNum(opts.preferred) && opts.preferred !== 0)) {
    notes.push("equity bridge nets minority interest and preferred equity out of EV (in addition to net debt)");
  }
  // E-5: which NCI basis the bridge used, beside the other.
  if (noncontrollingClaim && equityValue !== null) {
    bridge.noncontrollingDeducted = noncontrollingDeducted;
    bridge.noncontrollingDeductionBasis = noncontrollingBasis;
    notes.push(noncontrollingBridgeNote(bridge, equityValue + noncontrollingDeducted));
  }
  return {
    enterpriseValue: core.enterpriseValue,
    equityValue,
    perShare,
    bridge,
    pvExplicit: core.pvExplicit,
    pvTerminal: core.pvTerminal,
    terminalShare: safeDiv(core.pvTerminal, core.enterpriseValue),
    terminalValue: core.terminalValue,
    gTermUsedPct: core.gTermUsedPct,
    yearRows: core.yearRows,
    notes,
    gaps,
    ...(temporaryEquityWithheld !== undefined ? { temporaryEquityWithheld } : {}),
  };
}

// ---------------------------------------------------------------------------
// Sensitivity grid
// ---------------------------------------------------------------------------

/**
 * B-29 for one grid cell: the cell's own rerun is outside the DCF's domain on
 * the base DCF's tests (equity value at or below zero, or an explicit-period
 * present value below zero), so its per-share is withheld, not published.
 */
function gridCellOutsideDomain(core: DcfCoreOutput, equityValue: number | null): boolean {
  return core.pvExplicit < 0 || (isNum(equityValue) && equityValue <= 0);
}

function gridDomainNote(withheld: number): string[] {
  return withheld === 0 ? [] : [
    `${withheld} cell${withheld === 1 ? "" : "s"} whose own rerun is outside the DCF's domain (equity value at or below zero, or a terminal value above the whole enterprise value) withheld, as the base DCF would be (audit 2026-10-22 B-29)`,
  ];
}

export interface SensitivityGrid {
  /** Row axis: WACC values (pct), base +/- 2 in 1pp steps (D-60). */
  waccPcts: number[];
  /** Column axis: terminal growth values (pct), base +/- 1 in 0.5 steps. */
  gTermPcts: number[];
  /** perShare[i][j] for waccPcts[i] x gTermPcts[j]; null where TV guard violated. */
  perShare: (number | null)[][];
  notes: string[];
  gaps: ManifestEntry[];
}

/**
 * 5x5 per-share sensitivity: WACC +/-2pp in 1pp steps (D-60) x gTerm +/-1pp in 0.5 steps. The
 * cash-flow path is held fixed; only discounting + terminal are recomputed.
 * Cells violating the grid TV guard (WACC - g < 1.5pp) are null, never
 * a huge number — a looser bound than the 2.0pp base-case guard on purpose.
 */
export function sensitivityGrid(assumptions: DcfAssumptions, base: DcfRunOptions): SensitivityGrid {
  const notes: string[] = [
    "Explicit-period reinvestment is floored at zero: contracting revenue does not release invested capital in these grid cells.",
    `grid cells with WACC - gTerm < ${GRID_TV_GUARD_PP}pp are withheld and shown as — (Gordon TV guard; docs/METHODOLOGY.md, Fade and horizon)`,
  ];
  const gaps: ManifestEntry[] = [];
  const waccPcts = SENSITIVITY_WACC_STEPS_PP.map((s) => base.waccPct + s);
  const gTermPcts = SENSITIVITY_STEPS_PP.map((s) => assumptions.terminal.gTermPct.value + s);
  if (!isNum(base.netDebt) || posOrNull(base.dilutedShares) === null) {
    gaps.push(
      gapEntry(
        "valuation.sensitivityGrid",
        "net debt or diluted shares missing — per-share sensitivity not computable",
        "warn",
      ),
    );
    return {
      waccPcts,
      gTermPcts,
      perShare: waccPcts.map(() => gTermPcts.map(() => null)),
      notes,
      gaps,
    };
  }
  // Terminal ROIC is defined RELATIVE to the WACC (the terminal-value house
  // convention: WACC plus any evidenced excess), so each cell keeps the base
  // case's EXCESS rather than its level. At a fixed level a −1pp WACC row
  // earned a phantom +1pp excess and a +1pp row a phantom deficit, and under
  // the default rule the g-axis reversed sign across rows while the assumption
  // block said terminal ROIC = WACC.
  const terminalExcessPp = assumptions.terminal.roicTermPct.value - base.waccPct;
  notes.push(
    `terminal ROIC held at WACC ${terminalExcessPp >= 0 ? "+" : "−"} ${fmtNum(Math.abs(terminalExcessPp))}pp in every cell (the house convention defines it relative to the discount rate)`,
  );
  let withheld = 0;
  let unsplitCells = 0;
  const perShare = waccPcts.map((w) => {
    const cellAssumptions: DcfAssumptions = {
      ...assumptions,
      terminal: {
        ...assumptions.terminal,
        roicTermPct: { ...assumptions.terminal.roicTermPct, value: w + terminalExcessPp },
      },
    };
    return gTermPcts.map((g) => {
      const core = dcfCore(cellAssumptions, w, { gTermPct: g, guardMode: "null", guardPp: GRID_TV_GUARD_PP });
      if (core === null) return null;
      const bridged = bridgeToPerShare(
        core.enterpriseValue,
        base.netDebt,
        base.dilutedShares,
        [],
        base.minorityInterest ?? null,
        base.preferred ?? null,
        base.nonOperatingAssets ?? null,
        base.noncontrollingEarningsShare ?? null,
        base.temporaryEquity?.unsplit ?? 0,
      );
      if (bridged.unsplitWithheld === true) unsplitCells += 1;
      if (bridged.perShare !== null && gridCellOutsideDomain(core, bridged.equityValue)) {
        withheld += 1;
        return null;
      }
      return bridged.perShare;
    });
  });
  notes.push(...gridDomainNote(withheld));
  if (unsplitCells > 0) notes.push(unsplitCellsNote(base.temporaryEquity!.unsplit));
  return { waccPcts, gTermPcts, perShare, notes, gaps };
}

/** D-60: year-one revenue growth shifts (pp) of the growth × margin grid; each decays on the convergent weights. */
export const GROWTH_GRID_STEPS_PP: readonly number[] = [-20, -10, 0, 10, 20];
/** D-60: sustained operating-margin shifts (pp) of the growth × margin grid, applied to every year and the terminal value. */
export const MARGIN_GRID_STEPS_PP: readonly number[] = [-10, -5, 0, 5, 10];

export interface GrowthMarginGrid {
  growthShiftsPp: number[];
  marginShiftsPp: number[];
  /** perShare[i][j] for growthShiftsPp[i] × marginShiftsPp[j]; null above the scenario margin ceiling or without a bridge. */
  perShare: (number | null)[][];
  notes: string[];
}

/**
 * D-60: the two inputs that decide the value. The WACC × g grid varies the two
 * least decisive inputs (NVDA report #34); this one varies year-one growth (the
 * reverse DCF's convergent-shift family, so the shift is gone by the final
 * explicit year) against a sustained operating-margin shift. A cell whose
 * margin would exceed the scenario ceiling (gross margin less the leanest
 * operating-expense ratio on record) above the base path is null, not priced.
 */
export function growthMarginGrid(assumptions: DcfAssumptions, base: DcfRunOptions): GrowthMarginGrid {
  const growthShiftsPp = [...GROWTH_GRID_STEPS_PP];
  const marginShiftsPp = [...MARGIN_GRID_STEPS_PP];
  const ceiling = assumptions.scenarioMarginCeiling?.pct ?? null;
  const weights = convergentFadeWeights(assumptions.growthPath.value.length);
  const notes = [
    "Explicit-period reinvestment is floored at zero: contracting revenue does not release invested capital in these grid cells.",
    `rows shift year-one revenue growth by ${growthShiftsPp.join("/")}pp, decaying on the convergent weights to zero by year ${assumptions.years}; ` +
      `columns shift the operating margin by ${marginShiftsPp.join("/")}pp in every year and the terminal value; WACC, terminal growth, tax and the bridge stay at base`,
    ceiling === null
      ? "no gross profit on record, so no cell is withheld for exceeding gross margin"
      : `cells whose margin would exceed ${fmtNum(ceiling)}% (gross margin less the leanest operating-expense ratio) above the base path are withheld`,
  ];
  let withheld = 0;
  let unsplitCells = 0;
  const perShare = growthShiftsPp.map((dg) =>
    marginShiftsPp.map((dm) => {
      const margins = assumptions.ebitMarginPath.value.map((m) => m + dm);
      if (ceiling !== null && dm > 0 && margins.some((m, i) => m > Math.max(assumptions.ebitMarginPath.value[i], ceiling) + 1e-9)) return null;
      const growth = assumptions.growthPath.value.map((g, i) => g + dg * (weights[i] ?? 0));
      const core = dcfCore(assumptions, base.waccPct, { growthPathPct: growth, ebitMarginPathPct: margins, guardMode: "clamp" });
      if (core === null) return null;
      const bridged = bridgeToPerShare(core.enterpriseValue, base.netDebt, base.dilutedShares, [], base.minorityInterest ?? null,
        base.preferred ?? null, base.nonOperatingAssets ?? null, base.noncontrollingEarningsShare ?? null, base.temporaryEquity?.unsplit ?? 0);
      if (bridged.unsplitWithheld === true) unsplitCells += 1;
      if (bridged.perShare !== null && gridCellOutsideDomain(core, bridged.equityValue)) {
        withheld += 1;
        return null;
      }
      return bridged.perShare;
    }),
  );
  notes.push(...gridDomainNote(withheld));
  if (unsplitCells > 0) notes.push(unsplitCellsNote(base.temporaryEquity!.unsplit));
  return { growthShiftsPp, marginShiftsPp, perShare, notes };
}

// ---------------------------------------------------------------------------
// Reverse DCF (market-implied growth / terminal margin)
// ---------------------------------------------------------------------------

/**
 * The one-parameter growth-path family a reverse solve searched. D-58 replaced
 * "linear-fade-to-terminal" (a linear fade from the solved year-one rate) with
 * "convergent-shift-to-terminal": the base path with its year-one growth moved
 * to the solved rate and every later year moved by the same amount times the
 * convergent fade weight, so the shift is gone by the final year. The base
 * path is the family member at the base year-one growth, so implied minus base
 * year-one growth compares like with like.
 */
export type GrowthPathFamily = "linear-fade-to-terminal" | "convergent-shift-to-terminal";

/** Both families start from a year-one rate and reach the base path's final rate. */
export function isStartingGrowthFamily(family: GrowthPathFamily | undefined): boolean {
  return family === "linear-fade-to-terminal" || family === "convergent-shift-to-terminal";
}

export interface ReverseDcfResult {
  method: "growth" | "margin" | "none";
  /** First-year growth (pct) on `growthPathFamily`, reaching the forward model's final rate. */
  impliedRevenueGrowthPct: number | null;
  growthPathFamily?: GrowthPathFamily;
  baseRevenueGrowthPct?: number | null;
  impliedGrowthPathPct?: number[] | null;
  /** Market-implied terminal EBIT margin (pct) — margin-fallback mode. */
  impliedTerminalMarginPct: number | null;
  /**
   * AMZN audit 2026-10-20 finding 10: present only when the growth pre-scan
   * found no root because the price lies above (or below) the DCF value at
   * every evaluable year-one growth on the grid. `boundPct` is the grid end
   * the price lies beyond, `perShareAtBound` the value there. No implied
   * growth is inferred; `basis` states what the grid does establish.
   */
  /** `rising`: value rises with growth across the whole grid, so the price implies growth beyond the range end. */
  growthOutsideRange?: { side: "above" | "below"; boundPct: number; perShareAtBound: number; rising: boolean; basis: string };
  notes: string[];
  gaps: ManifestEntry[];
}

interface Bracket {
  lo: number;
  hi: number;
  fLo: number;
  fHi: number;
}

/** Uniform pre-scan grid (17 points) over [lo, hi]. */
function prescanGrid(lo: number, hi: number): number[] {
  return Array.from(
    { length: REVERSE_PRESCAN_POINTS },
    (_, i) => lo + ((hi - lo) * i) / (REVERSE_PRESCAN_POINTS - 1),
  );
}

/** All sign-change brackets of f over the grid (skips non-evaluable points). */
function findBrackets(xs: number[], fs: (number | null)[]): Bracket[] {
  const brackets: Bracket[] = [];
  for (let i = 0; i < xs.length; i++) {
    const a = fs[i];
    if (a === null) continue;
    // Exact grid roots include both boundaries, even beside an unevaluable
    // point; they do not require a sign change in a neighbouring interval.
    if (a === 0) brackets.push({ lo: xs[i], hi: xs[i], fLo: a, fHi: a });
    if (i === xs.length - 1) continue;
    const b = fs[i + 1];
    if (b === null) continue;
    if (a * b < 0) brackets.push({ lo: xs[i], hi: xs[i + 1], fLo: a, fHi: b });
  }
  return brackets;
}

/** Bracket whose midpoint is closest to `anchor` (economically meaningful branch). */
function nearestBracket(brackets: Bracket[], anchor: number): Bracket | null {
  if (brackets.length === 0) return null;
  let best = brackets[0];
  let bestDist = Math.abs((best.lo + best.hi) / 2 - anchor);
  for (const b of brackets.slice(1)) {
    const d = Math.abs((b.lo + b.hi) / 2 - anchor);
    if (d < bestDist) {
      best = b;
      bestDist = d;
    }
  }
  return best;
}

/** Derivative-free bisection to BISECTION_TOL_PP, retaining exact price roots. */
function bisect(
  f: (x: number) => number | null,
  bracket: Bracket,
  price: number,
): number | null {
  let { lo, hi, fLo } = bracket;
  if (lo === hi) return lo; // exact grid root
  const fTol = 1e-10 * Math.abs(price);
  for (let iter = 0; iter < BISECTION_MAX_ITER && hi - lo > BISECTION_TOL_PP; iter++) {
    const mid = (lo + hi) / 2;
    const fMid = f(mid);
    if (fMid === null) return null; // guard tripped mid-bracket — cannot refine
    if (Math.abs(fMid) < fTol) return mid;
    if (fLo * fMid <= 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Reverse DCF: what first-year revenue growth, on the base path shifted by the
 * same amount fading out by the final year (D-58, "convergent-shift-to-terminal"),
 * justifies the current price, everything else frozen at base case? Pre-scans
 * f(g) on a 17-point grid over [-20, +60], widened to base year-one growth
 * + 30pp when that is higher (value is non-monotone in growth when
 * ROIC < WACC — picks the sign-change bracket whose midpoint is nearest the
 * base-case year-1 growth), then bisects to 1bp. If no bracket exists or the
 * base-year FCFF is negative, falls back to solving the market-implied
 * terminal EBIT margin over [0, 60] with the same machinery.
 */
export function reverseDcf(
  currentPrice: number | null,
  assumptions: DcfAssumptions,
  opts: DcfRunOptions,
): ReverseDcfResult {
  const hit = { unsplit: false };
  const result = reverseDcfCore(currentPrice, assumptions, opts, hit);
  // FIN-119: a candidate path whose deduction takes the profit share while an unsplit total is deducted is withheld from the solve.
  if (hit.unsplit) {
    const note = unsplitCellsNote(opts.temporaryEquity!.unsplit);
    result.notes.push(note);
    result.gaps.push(gapEntry("valuation.dcf.temporaryEquityAllocation", note, "warn"));
  }
  return result;
}

function reverseDcfCore(
  currentPrice: number | null,
  assumptions: DcfAssumptions,
  opts: DcfRunOptions,
  hit: { unsplit: boolean },
): ReverseDcfResult {
  const notes: string[] = [];
  const gaps: ManifestEntry[] = [];
  const none = (why: string): ReverseDcfResult => {
    notes.push(why);
    return { method: "none", impliedRevenueGrowthPct: null, impliedTerminalMarginPct: null,
      growthPathFamily: "convergent-shift-to-terminal", baseRevenueGrowthPct: assumptions.growthPath.value[0] ?? null,
      impliedGrowthPathPct: null, notes, gaps };
  };

  const price = posOrNull(currentPrice);
  if (price === null) {
    gaps.push(gapEntry("valuation.reverseDcf", "current price missing — nothing to invert", "warn"));
    return none("reverse DCF skipped: no current price");
  }
  if (!isNum(opts.netDebt) || posOrNull(opts.dilutedShares) === null) {
    gaps.push(
      gapEntry("valuation.reverseDcf", "net debt or diluted shares missing — per-share value not computable", "warn"),
    );
    return none("reverse DCF skipped: equity bridge inputs missing");
  }

  const n = assumptions.years;
  const perShareAt = (overrides: Omit<DcfCoreOverrides, "guardMode">): number | null => {
    const core = dcfCore(assumptions, opts.waccPct, { ...overrides, guardMode: "clamp" });
    if (core === null) return null;
    const bridged = bridgeToPerShare(
      core.enterpriseValue,
      opts.netDebt,
      opts.dilutedShares,
      [],
      opts.minorityInterest ?? null,
      opts.preferred ?? null,
      opts.nonOperatingAssets ?? null,
      opts.noncontrollingEarningsShare ?? null,
      opts.temporaryEquity?.unsplit ?? 0,
    );
    if (bridged.unsplitWithheld === true) hit.unsplit = true;
    return bridged.perShare;
  };

  // Base-year FCFF sign check (negative-FCF companies skip the growth solve).
  const baseRows = dcfCore(assumptions, opts.waccPct, { guardMode: "clamp" });
  const baseFcff1 = baseRows?.yearRows[0]?.fcff ?? null;
  const baseG1 = assumptions.growthPath.value[0];
  const finalGrowth = assumptions.growthPath.value[n - 1];
  // D-58: the base path itself is the family member at g = baseG1.
  const shiftWeights = convergentFadeWeights(n);
  const shiftedPath = (g: number): number[] =>
    assumptions.growthPath.value.map((base, i) => base + (g - baseG1) * shiftWeights[i]);

  // AMZN audit 2026-10-20 finding 10: what an unbracketed growth scan establishes.
  let growthOutsideRange: ReverseDcfResult["growthOutsideRange"];

  const solveGrowth = (): ReverseDcfResult | null => {
    const lo = REVERSE_GROWTH_RANGE_PCT[0];
    const hi = Math.max(REVERSE_GROWTH_RANGE_PCT[1], baseG1 + 30);
    const xs = [...new Set([...prescanGrid(lo, hi), ...(baseG1 >= lo && baseG1 <= hi ? [baseG1] : [])])].sort((a, b) => a - b);
    const fG = (g: number): number | null => {
      const v = perShareAt({ growthPathPct: shiftedPath(g) });
      return v === null ? null : v - price;
    };
    const fs = xs.map(fG);
    const brackets = findBrackets(xs, fs);
    if (brackets.length === 0) {
      // AMZN audit 2026-10-20 finding 10: with every grid value on one side of
      // the price, the grid does establish something: no year-one growth in
      // the range reaches the price (Amazon: $128.88 at 60% against $262.45).
      // The implied rate is still not inferred; only which end it lies beyond,
      // and only when value rises with growth across the whole grid.
      const values = fs.every((f) => f !== null) ? fs.map((f) => (f as number) + price) : null;
      const side = values === null ? null : values.every((v) => v < price) ? "above" : values.every((v) => v > price) ? "below" : null;
      let reason = `no root bracket for the fading year-one growth anchor on the [${lo}, ${hi}]% pre-scan grid; no outside-range growth is inferred because value may be non-monotone`;
      if (values !== null && side !== null) {
        const rising = values.every((v, i) => i === 0 || v >= values[i - 1]);
        const at = side === "above" ? xs.length - 1 : 0;
        const extreme = side === "above" ? Math.max(...values) : Math.min(...values);
        const basis = `the price ${fmtNum(price)} is ${side} the DCF value at every year-one growth on the [${fmtNum(lo)}, ${fmtNum(hi)}]% pre-scan grid ` +
          (rising
            ? `(${fmtNum(values[at])} at ${fmtNum(xs[at])}%), and value rises with growth across the grid, so the price implies year-one growth ${side} ${fmtNum(xs[at])}%`
            : `(${side === "above" ? "highest" : "lowest"} value ${fmtNum(extreme)}); value is non-monotone in growth here, so no year-one growth in the range ${side === "above" ? "reaches" : "comes down to"} the price and no outside-range growth is inferred`);
        growthOutsideRange = { side, boundPct: xs[at], perShareAtBound: values[at], rising, basis };
        reason = `no root bracket for the fading year-one growth anchor: ${basis}`;
      }
      notes.push(reason);
      gaps.push(gapEntry("valuation.reverseDcf.growthBracket", reason, "warn"));
      return null;
    }
    if (brackets.length > 1) {
      notes.push(
        `f(growth) non-monotone: ${brackets.length} sign-change brackets on the pre-scan grid — picked the bracket nearest base-case growth ${fmtNum(baseG1)}% (house rule)`,
      );
    }
    const bracket = nearestBracket(brackets, baseG1);
    if (bracket === null) return null;
    const root = bisect(fG, bracket, price);
    if (root === null) return null;
    notes.push(
      `implied first-year revenue growth, with every later year of the base path shifted by the same amount times its convergent fade weight so the shift is gone by year ${n} (final growth ${fmtNum(finalGrowth)}%); compare with the base year-one growth ${fmtNum(baseG1)}% on the same path, not a historical CAGR; all other assumptions frozen at base case`,
    );
    return { method: "growth", impliedRevenueGrowthPct: root, impliedTerminalMarginPct: null,
      growthPathFamily: "convergent-shift-to-terminal", baseRevenueGrowthPct: baseG1,
      impliedGrowthPathPct: shiftedPath(root), notes, gaps };
  };

  const solveMargin = (): ReverseDcfResult | null => {
    const [lo, hi] = REVERSE_MARGIN_RANGE_PCT;
    const m0 = assumptions.ebitMarginPath.value[0];
    const xs = prescanGrid(lo, hi);
    const fM = (m: number): number | null => {
      const v = perShareAt({ ebitMarginPathPct: fadePath(m0, m, n) });
      return v === null ? null : v - price;
    };
    const fs = xs.map(fM);
    const brackets = findBrackets(xs, fs);
    if (brackets.length === 0) {
      const fHi = fs[fs.length - 1];
      if (fHi !== null && fHi < 0) {
        notes.push(
          `even a ${hi}% terminal EBIT margin does not justify the price — years-to-breakeven framing applies (fallback B)`,
        );
      } else {
        notes.push("no sign change of f(terminal margin) on the pre-scan grid");
      }
      return null;
    }
    const anchor = assumptions.ebitMarginPath.value[n - 1];
    if (brackets.length > 1) {
      notes.push(
        `f(margin) has ${brackets.length} brackets — picked the one nearest base terminal margin ${fmtNum(anchor)}% (house rule)`,
      );
    }
    const bracket = nearestBracket(brackets, anchor);
    if (bracket === null) return null;
    const root = bisect(fM, bracket, price);
    if (root === null) return null;
    notes.push(
      `market-implied steady-state (terminal) EBIT margin, fading from current ${fmtNum(m0)}% over ${n} years; growth path frozen at base case`,
    );
    return { method: "margin", impliedRevenueGrowthPct: null, impliedTerminalMarginPct: root,
      growthPathFamily: "convergent-shift-to-terminal", baseRevenueGrowthPct: baseG1,
      impliedGrowthPathPct: null, notes, gaps };
  };

  if (baseFcff1 !== null && baseFcff1 <= 0) {
    notes.push(
      "base-year FCFF <= 0 — revenue-growth inversion unreliable; solving market-implied terminal EBIT margin instead (fallback A)",
    );
    const viaMargin = solveMargin();
    if (viaMargin) return viaMargin;
    return none("reverse DCF: margin fallback found no root");
  }

  const viaGrowth = solveGrowth();
  if (viaGrowth) return viaGrowth;
  notes.push("growth inversion found no bracket — attempting terminal-margin fallback (fallback A)");
  const withOutside = (r: ReverseDcfResult): ReverseDcfResult => (growthOutsideRange ? { ...r, growthOutsideRange } : r);
  const viaMargin = solveMargin();
  if (viaMargin) return withOutside(viaMargin);
  return withOutside(none("reverse DCF: no root in growth [-20, 60] nor terminal margin [0, 60]"));
}

// ---------------------------------------------------------------------------
// Multiples framework
// ---------------------------------------------------------------------------

export type MultipleKey =
  | "peTtm"
  | "evToEbitda"
  | "evToSales"
  | "priceToFcf"
  | "priceToBook"
  | "priceToTbv"
  | "priceToFfo"
  | "priceToAffo";

/** Sector -> valid multiples (banks NEVER get EV multiples). */
export const SECTOR_APPROPRIATE_MULTIPLES: Record<SectorRoute, MultipleKey[]> = {
  general: ["peTtm", "evToEbitda", "evToSales", "priceToFcf", "priceToBook"],
  bank: ["peTtm", "priceToTbv", "priceToBook"],
  insurer: ["priceToBook", "peTtm", "priceToTbv"],
  reit: ["priceToFfo", "priceToAffo"],
  "reit-mortgage": ["priceToBook", "peTtm", "priceToTbv"],
};

export interface MultiplesQuoteInputs {
  price: number | null;
  /** Main price valuation day, not report build or fetch time. */
  priceAsOf?: string | null;
  marketCap: number | null;
  /** Listing/trading currency (e.g. "USD"). */
  currency?: string | null;
  isAdr?: boolean | null;
  issuerId?: string;
  securityId?: string;
  /** Aggregate common cap; ADR quote class alone does not establish this scope. */
  marketCapSecurityBasis?: "issuer-common" | "quoted-security" | "unresolved";
  marketCapScopeEvidence?: { reason: string; sourceIds: string[] };
}

/** TTM income statement slice (FMP names). */
export interface MultiplesIncomeTtm extends CommonIncomeInputs {
  date: string;
  /**
   * Period basis of this slice: "ttm" (4 complete quarters) or "annual"
   * (latest FY substituted when TTM was suppressed — incomplete quarterly
   * data). Drives honest basis labels on the multiples; defaults to "ttm"
   * when absent (legacy callers).
   */
  basis?: "ttm" | "annual";
  /** Audit 2026-10-22 B-9: the annual row's own fiscal year, which names an annual-basis multiple. */
  fiscalYear?: string | null;
  revenue: number | null;
  operatingIncome: number | null;
  /** AMZN audit 2026-10-20: pre-tax income, to measure how much of it is non-operating. */
  incomeBeforeTax?: number | null;
  depreciationAndAmortization?: number | null;
  netIncome: number | null;
  epsDiluted: number | null;
  /** Explicit construction from the adapter; absent for reported annual EPS. */
  epsDilutedBasis?: "sum-quarterly-diluted-eps" | null;
  netIncomeAvailableToCommon?: number | null;
  preferredDividendsPaid?: number | null;
  noncontrollingIncome?: number | null;
  netIncomeOwnershipBasis?: "parent" | "consolidated";
  epsSecurityBasis?: "ordinary" | "quoted";
  /** Audit 2026-10-22 B-7: the caveat when this slice's D&A was composed from separate lines (a lower bound). */
  dAndALowerBound?: string | null;
}

/** TTM cash-flow slice (FMP names; capitalExpenditure is NEGATIVE). */
export interface MultiplesCashFlowTtm {
  date: string;
  /** Period basis — see MultiplesIncomeTtm.basis. */
  basis?: "ttm" | "annual";
  operatingCashFlow: number | null;
  capitalExpenditure: number | null;
  depreciationAndAmortization?: number | null;
  /** The latest annual cash-flow row's D&A and date, beside a TTM slice: a fiscal-year operating income's own-period D&A. */
  annualDepreciationAndAmortization?: { date: string; value: number | null } | null;
}

/** Latest balance sheet slice (FMP names). */
export interface MultiplesBalance {
  shortTermDebt?: number | null;
  longTermDebt?: number | null;
  fieldProvenance?: Record<string, { tags: string[] }>;
  /** The admission's refusals, so a refused total debt is named (KNW-04). */
  fieldConflicts?: Record<string, { usable?: boolean; reason?: string } | undefined>;
  date: string;
  /**
   * Which statement period the row came from: "quarter" (latest quarterly
   * balance sheet — the preferred point-in-time anchor, 2026-07-09 audit M4) or
   * "annual" (whole-row fallback). Drives honest basis labels; absent on
   * legacy callers ⇒ generic "latest" label.
   */
  basis?: "quarter" | "annual";
  totalDebt: number | null;
  cashAndCashEquivalents?: number | null;
  shortTermInvestments?: number | null;
  cashAndShortTermInvestments: number | null;
  /**
   * D-65: the filed fair value of marketable equity securities inside cash and
   * short-term investments (D-60). The multiples' EV nets the same canonical
   * net cash as the DCF bridge and the key-data box, so equity stakes are not
   * cash here either.
   */
  marketableEquitySecurities?: number | null;
  totalStockholdersEquity: number | null;
  /** Consolidated equity can establish outside ownership without sizing a market NCI claim. */
  totalEquity?: number | null;
  goodwill: number | null;
  intangibleAssets: number | null;
  minorityInterest: number | null;
  preferredStock: number | null;
  /**
   * FIN-119: temporary equity (redeemable preferred and redeemable NCI), read
   * through `temporaryEquityClaims`. Absent => none filed on this row.
   */
  temporaryEquity?: number | null;
  temporaryEquityAttributableToParent?: number | null;
  temporaryEquityAttributableToNoncontrollingInterest?: number | null;
  commonEquity?: number | null;
  equityOwnershipBasis?: "parent" | "consolidated";
  /**
   * WS6 (D-19): TOTAL lease liabilities (FMP `capitalLeaseObligations`, which
   * carries the operating AND finance lease liability; the EDGAR statements
   * builder resolves the same field). FMP's `totalDebt` is documented as
   * shortTermDebt + longTermDebt + capitalLeaseObligations, so this figure is
   * ALREADY inside `totalDebt`. Context for the bridge's disclosure only — the
   * EV adjustment reads `operatingLeaseLiability` below, never this.
   */
  capitalLeaseObligations?: number | null;
  financeLeaseLiability?: number | null;
  /**
   * WS6 review (BLOCKER 1): the OPERATING slice of the lease liability, the
   * ONLY slice the EV bridge may remove. Under ASC 842 operating-lease cost
   * stays in operating expenses, so EBIT and EBITDA are already AFTER it;
   * finance-lease cost is split between right-of-use amortisation (added back
   * in EBITDA but included in EBIT) and interest (below EBIT), and
   * the finance-lease liability is debt in both frames. Null when the split is
   * unavailable (the FMP route publishes one combined figure): enterprise value
   * is then reported as-is and the `enterpriseValue.leases` gap says so, rather
   * than removing an unknown mix of operating and finance leases.
   */
  operatingLeaseLiability?: number | null;
}

/** Quarterly fundamentals merged per quarter by the caller (FMP names). */
export interface QuarterlyFundamentalsRow extends CommonIncomeInputs {
  fieldProvenance?: import("./leaseScope").LeaseScopeRow["fieldProvenance"];
  shortTermDebt?: number | null;
  longTermDebt?: number | null;
  date: string;
  acceptedDate?: unknown;
  filingDate?: unknown;
  revenue: number | null;
  operatingIncome: number | null;
  depreciationAndAmortization: number | null;
  netIncome: number | null;
  /** Only explicit quoted-security EPS evidence can enter a price/EPS history. */
  epsDiluted?: number | null;
  epsSecurityBasis?: "quoted";
  netIncomeAvailableToCommon?: number | null;
  preferredDividendsPaid?: number | null;
  noncontrollingIncome?: number | null;
  netIncomeOwnershipBasis?: "parent" | "consolidated";
  operatingCashFlow: number | null;
  capitalExpenditure: number | null;
  totalStockholdersEquity: number | null;
  totalEquity?: number | null;
  commonEquity?: number | null;
  equityOwnershipBasis?: "parent" | "consolidated";
  /**
   * INCOME-statement D&A only. `depreciationAndAmortization` above may fall
   * back to the cash-flow figure, which is a different quantity; the REIT FFO
   * history must use the same basis as the current ffoApprox.
   */
  incomeDepreciationAndAmortization?: number | null;
  /**
   * Balance components of the HOUSE enterprise value, so the own-history EV is
   * built from the same definition as the current one. FMP's
   * `enterpriseValue` omits preferred stock and minority interest and nets only
   * cash, so ranking today's house EV against a history of vendor EVs compared
   * two different quantities.
   */
  totalDebt?: number | null;
  cashAndCashEquivalents?: number | null;
  shortTermInvestments?: number | null;
  capitalLeaseObligations?: number | null;
  financeLeaseLiability?: number | null;
  cashAndShortTermInvestments?: number | null;
  /** D-65: that quarter's filed marketable equity securities inside cash and short-term investments, so the own-history EV nets the same cash as the current one. */
  marketableEquitySecurities?: number | null;
  preferredStock?: number | null;
  minorityInterest?: number | null;
  /** FIN-119: the quarter's temporary equity (read through `temporaryEquityClaims`) and any refusal of it. */
  temporaryEquity?: number | null;
  temporaryEquityAttributableToParent?: number | null;
  temporaryEquityAttributableToNoncontrollingInterest?: number | null;
  fieldConflicts?: Record<string, { usable?: boolean; reason?: string } | undefined>;
  /**
   * WS6 review (BLOCKER 2): the quarter's OPERATING lease liability, so the
   * own-history EV carries the SAME lease adjustment as the current one. A
   * lease-adjusted current multiple ranked against an unadjusted history
   * compared two definitions and biased the printed rank. Null when the
   * quarter's balance sheet does not resolve the split — the window's EV
   * multiples are then dropped rather than ranked on the wrong basis.
   */
  operatingLeaseLiability?: number | null;
}

/** FMP /stable/enterprise-values row (quarterly history). */
export interface EnterpriseValuesRow {
  date: string;
  marketCapitalization: number | null;
  enterpriseValue: number | null;
  sourceId?: string;
  stockPrice?: number | null;
  /** Explicit historical quote currency; never borrowed from today's profile. */
  priceCurrency?: string | null;
}

/** Pre-baked vendor ratio history (FMP key-metrics / ratios quarterly rows). */
export interface VendorMultiplesRow {
  date: string;
  evToSales?: number | null;
  evToEBITDA?: number | null;
  priceToEarningsRatio?: number | null;
  priceToBookRatio?: number | null;
  priceToFreeCashFlowRatio?: number | null;
}

/** Peer multiples computed upstream from validated quotes and raw statements. */
export interface PeerMultiples {
  symbol: string;
  multiples: Partial<Record<MultipleKey, number | null>>;
  economicEvidence?: import("@/pipeline/stageB/peerComparability").PeerEconomicEvidence;
}

export interface MultiplesFrameworkInputs {
  quote: MultiplesQuoteInputs;
  /** Statements' reportedCurrency — mismatch vs quote.currency flags the ADR case. */
  reportedCurrency?: string | null;
  incomeTtm: MultiplesIncomeTtm | null;
  cashFlowTtm: MultiplesCashFlowTtm | null;
  balance: MultiplesBalance | null;
  /** Retained, effective-dated evidence only; never a static guessed ratio. */
  securityBasis?: SecurityBasisEvidence[];
  securityBasisAsOf?: string;
  economicShareEvidence?: EconomicShareEvidence[];
  /** Quarterly merged fundamentals (>= 8 rows enables derived TTM history). */
  quarterlyFundamentals?: QuarterlyFundamentalsRow[];
  enterpriseValuesHistory?: EnterpriseValuesRow[];
  /** Vendor pre-baked ratio history — used only when derivation impossible AND currencies match. */
  keyMetricsHistory?: VendorMultiplesRow[];
  peers?: PeerMultiples[];
  subjectEconomicEvidence?: import("@/pipeline/stageB/peerComparability").PeerEconomicEvidence;
  /** Dated quote/analysis observation for point-in-time comparability evidence. */
  peerComparisonAsOf?: string;
  peerCoverage?: import("@/pipeline/peers").PeerCoverage;
  /** REIT-only: FFO/AFFO totals provided by the caller (labeled approximate upstream). */
  ffoApprox?: number | null;
  affoApprox?: number | null;
  /** Explicitly undetermined subtype withholds equity-REIT current/history/peer multiples. */
  reitSubmap?: ReitSubmap | null;
  /**
   * REIT-only: true when the CURRENT FFO is the plain net income + total D&A
   * construction — the only definition the own-history series can rebuild
   * from quarterly statements. A NAREIT FFO that netted property-sale gains,
   * impairments or real-estate-only depreciation is a different quantity, and
   * ranking it inside a net-income-plus-D&A history biased the rank; the P/FFO
   * and P/AFFO bands are withheld in that case with a disclosing gap.
   */
  ffoHistoryComparable?: boolean;
  /** Separate from FFO: recurring capex or rent adjustments cannot be ranked against all-capex history. */
  affoHistoryComparable?: boolean;
  /**
   * WS6 (D-19): keep the OPERATING-lease liability in enterprise value
   * (THESIS_EV_INCLUDE_LEASES=1). OFF by default, because under US GAAP
   * (ASC 842) the operating-lease cost stays in operating expenses, so EBIT and
   * EBITDA are already AFTER it — adding that liability to EV as well would
   * double-count the leases in EV/EBITDA. It never touches the FINANCE-lease
   * liability (WS6 review, BLOCKER 1): its interest is below EBIT, while EBITDA
   * adds back its amortisation, so it remains financing debt in both frames.
   */
  includeLeasesInEv?: boolean;
}

/**
 * The operator setting the EV bridge basis names (WS6, D-19), exactly as the
 * basis spells it. AMZN audit 2026-10-20 finding 20: the report states the
 * lease convention without the environment variable that changes it.
 */
export const EV_LEASE_SETTING_TEXT = {
  excluded: " (house default; set THESIS_EV_INCLUDE_LEASES=1 to keep it)",
  included: " (THESIS_EV_INCLUDE_LEASES=1)",
} as const;

/** WS6 (D-19): the EV bridge, both ways, with the convention stated. Only the
 * OPERATING slice ever moves between the two (WS6 review, BLOCKER 1). */
export interface EnterpriseValueBridge {
  /** Optional for reports serialized before scope metadata was introduced. */
  equityScope?: EconomicEquityScope;
  noncontrollingInterestBasis?: "book-value-proxy" | "none-disclosed" | "unknown-allocation";
  nonOperatingHoldingsScope?: "not-comprehensively-resolved";
  /** The EV actually used by the EV multiples. */
  value: number | null;
  /** EV with the OPERATING lease liability removed (the house default). */
  excludingLeases: number | null;
  /** EV as reported: every lease liability left inside totalDebt. */
  includingLeases: number | null;
  /**
   * The liability actually removed by `excludingLeases` — the OPERATING slice
   * only (WS6 review, BLOCKER 1). Null when the split is unavailable, in which
   * case EV is reported as-is and the leases gap states the reason.
   */
  leaseLiability: number | null;
  /** Operating + finance lease liability where disclosed; context only. */
  totalLeaseLiability?: number | null;
  /** Finance slice, which stays inside EV on BOTH bases; context only. */
  financeLeaseLiability?: number | null;
  includeLeases: boolean;
  basis: string;
}

export interface OwnHistoryBand {
  /** Empirical percentile rank (0-100) in this finite sample, not an ordinal rank. */
  percentileRank: number | null;
  /**
   * 5th percentile of up to 20 quarterly observations. NOTE: because the window
   * caps at 20 (deriveOwnHistory), the quantile index 0.05·(n−1) stays inside the
   * OUTERMOST cell for all n ≤ 20 — so p5 tracks the near-minimum (2nd-smallest
   * obs), NOT a stable tail percentile. Read together with `lowSample`.
   */
  p5: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  /** 95th percentile — same caveat as p5: tracks the near-maximum at these sizes. */
  p95: number | null;
  observations: number;
  /** Optional for legacy serialized results; values are in the original sample order. */
  observationDetails?: OwnHistoryObservation[];
  basis: string;
  /**
   * True when the window is shorter than a full 5 years (< 20 quarters), i.e. the
   * p5/p95 tails are especially thin. When true the basis carries a LOW SAMPLE note.
   */
  lowSample?: boolean;
}

export interface OwnHistoryObservation {
  periodEnd: string;
  /** Actual dated market-cap observation; vendor ratios do not establish it. */
  marketDate: string | null;
  value: number;
  source: "raw-statements" | "vendor-ratio";
  marketCapSourceId?: string;
}

export interface PeerStats {
  median: number | null;
  min: number | null;
  max: number | null;
  count: number;
}

export interface MultipleStat {
  key: MultipleKey;
  /** Current multiple; null = n/m (negative/zero denominator or missing input). */
  current: number | null;
  basis: string;
  /** A retained numerator/denominator ownership mismatch, not a parent allocation. */
  ownershipScope?: string;
  historyScope?: string;
  ownHistory: OwnHistoryBand | null;
  peers: PeerStats | null;
  /**
   * AMZN audit 2026-10-20: set on the P/E when non-operating income is more
   * than GAIN_INFLATED_NON_OPERATING_SHARE of pre-tax income. The grade then
   * ranks the next own-history multiple and the report caveats the P/E.
   */
  gainInflatedEarnings?: { nonOperatingSharePct: number; basis: string };
  /**
   * Audit 2026-10-22 B-7: set on EV/EBITDA when the EBITDA's D&A was composed
   * from separate lines, a lower bound; the report caveats the row. Unlike the
   * P/E caveat, the own-history rank stays: the history is built the same way.
   */
  ebitdaLowerBound?: { basis: string };
  /**
   * Audit 2026-10-22 B-9: the statement period an income-derived multiple's
   * denominator covers: "TTM to <date>" for four summed quarters, or "FY<year>"
   * when TTM was suppressed and the latest annual row stands in. Labels are
   * derived from it.
   */
  period?: string;
}

/** Share of pre-tax income above which non-operating income makes the P/E unrepresentative. */
export const GAIN_INFLATED_NON_OPERATING_SHARE = 0.25;

export interface MultiplesResult {
  multiples: MultipleStat[];
  peerCoverage?: import("@/pipeline/peers").PeerCoverage;
  /** WS6 (D-19): the enterprise-value bridge, both ways. */
  enterpriseValue: EnterpriseValueBridge;
  sectorAppropriate: MultipleKey[];
  asOf: { quote: string | null; statements: string | null };
  notes: string[];
  gaps: ManifestEntry[];
}

/** Trimmed peer stats: drop n/m and 1.5x-IQR outliers; suppress below 4 survivors. */
function peerStats(values: (number | null | undefined)[], notes: string[], key: string): PeerStats | null {
  const clean = values.filter((v): v is number => isNum(v) && v > 0);
  if (clean.length === 0) return null;
  const q1 = quantile(clean, 0.25);
  const q3 = quantile(clean, 0.75);
  let trimmed = clean;
  if (q1 !== null && q3 !== null) {
    const iqr = q3 - q1;
    trimmed = clean.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
  }
  if (trimmed.length < MIN_PEERS_FOR_STATS) {
    notes.push(
      `${key}: only ${trimmed.length} usable peers after n/m + 1.5x-IQR trim — peer comparison suppressed (house rule: never show a <${MIN_PEERS_FOR_STATS}-peer median)`,
    );
    return null;
  }
  return {
    median: medianOf(trimmed),
    min: Math.min(...trimmed),
    max: Math.max(...trimmed),
    count: trimmed.length,
  };
}

type HistorySeries = Partial<Record<MultipleKey, number[]>>;

interface OwnHistoryDerivation {
  series: HistorySeries;
  details: Partial<Record<MultipleKey, OwnHistoryObservation[]>>;
  observations: number;
  rejectedPeriods: Array<{ period: string; reason: string }>;
  rejectedWindows: Array<{ anchor: string; reason: string }>;
  unusableWindows: Array<{ anchor: string; reason: string }>;
  /**
   * WS6 review (BLOCKER 2): windows whose EV could not be put on the current
   * EV's lease basis (no operating-lease liability on that quarter's balance
   * sheet while the current EV removes one). Their EV multiples are dropped.
   */
  leaseBasisMismatchWindows: string[];
  leaseScopeRejectedWindows: Array<{ anchor: string; reason: string }>;
  cashOwnershipRejectedWindows: string[];
}

const DERIVED_HISTORY_KEYS: readonly MultipleKey[] = [
  "evToSales",
  "evToEbitda",
  "peTtm",
  "priceToFcf",
  "priceToBook",
];
const OWN_HISTORY_EV_MAX_AGE_DAYS = 45;

/** A consolidated/parent difference proves outside ownership, never its market value. */
function unknownNoncontrollingAllocation(balance: { totalEquity?: number | null; totalStockholdersEquity?: number | null; minorityInterest?: number | null; equityOwnershipBasis?: "parent" | "consolidated" } | null): boolean {
  if (!balance || isNum(balance.minorityInterest)) return false;
  if (balance.equityOwnershipBasis === "consolidated" && (isNum(balance.totalEquity) || isNum(balance.totalStockholdersEquity))) return true;
  if (!isNum(balance.totalEquity)) return false;
  return !isNum(balance.totalStockholdersEquity) ||
    Math.abs(balance.totalEquity - balance.totalStockholdersEquity) > Math.max(1, Math.abs(balance.totalEquity) * 1e-10);
}

/**
 * Known NCI at or below this share of consolidated equity cannot move a
 * parent-common cash multiple. Without the floor, $5-7M of NCI against $2.4-3.0bn
 * of equity withheld P/FCF and its whole history (audit SNOW-2). The NCI
 * share of earnings must be as small, and known: a stake bought out before
 * the balance date leaves a zero balance but still earned its share of the
 * cash flow, so an ending balance alone cannot bound it.
 */
const IMMATERIAL_NCI_SHARE_OF_EQUITY = 0.01;

function immaterialNoncontrollingInterest(row: { totalEquity?: number | null; minorityInterest?: number | null } | null, noncontrollingIncome?: number | null): boolean {
  if (!isNum(row?.minorityInterest) || !isNum(row?.totalEquity) || row.totalEquity <= 0) return false;
  const floor = row.totalEquity * IMMATERIAL_NCI_SHARE_OF_EQUITY;
  return Math.abs(row.minorityInterest) <= floor && isNum(noncontrollingIncome) && Math.abs(noncontrollingIncome) <= floor;
}

/** FIN-119: the redeemable preferred (and unsplit) part of a row's admitted temporary equity. */
function temporaryParentLike(row: Parameters<typeof temporaryEquityClaims>[0]): number {
  const claims = temporaryEquityClaims(row);
  return claims !== null && claims.refusal === null ? claims.redeemablePreferred + claims.unsplit : 0;
}

function temporaryEquityRefused(row: Parameters<typeof temporaryEquityClaims>[0]): boolean {
  return temporaryEquityClaims(row)?.refusal != null;
}

/** FIN-119: a filed (or refused) temporary-equity claim is a claim senior to common, like preferred and book NCI. */
function hasTemporaryEquityClaim(row: Parameters<typeof temporaryEquityClaims>[0]): boolean {
  const claims = temporaryEquityClaims(row);
  return claims !== null && (claims.refusal !== null || claims.total !== 0);
}

function unresolvedCashOwnership(row: Parameters<typeof unknownNoncontrollingAllocation>[0] & Parameters<typeof temporaryEquityClaims>[0] & { noncontrollingIncome?: number | null; preferredStock?: number | null; preferredDividendsPaid?: number | null }): boolean {
  const nciImmaterial = immaterialNoncontrollingInterest(row, row?.noncontrollingIncome);
  return unknownNoncontrollingAllocation(row) || (!nciImmaterial && isNum(row?.minorityInterest) && row.minorityInterest !== 0) ||
    (!nciImmaterial && isNum(row?.noncontrollingIncome) && row.noncontrollingIncome !== 0) ||
    (isNum(row?.preferredStock) && row.preferredStock !== 0) ||
    hasTemporaryEquityClaim(row) ||
    (isNum(row?.preferredDividendsPaid) && row.preferredDividendsPaid !== 0);
}

/** Rolling-4-quarter TTM multiples derived from raw statements + EV history. */
function deriveOwnHistory(
  quarters: QuarterlyFundamentalsRow[] | undefined,
  evRows: EnterpriseValuesRow[] | undefined,
  derivedKeys: readonly MultipleKey[] = DERIVED_HISTORY_KEYS,
  /**
   * WS6 review (BLOCKER 2): true when the CURRENT enterprise value removed the
   * operating-lease liability, so every historical window must remove its own.
   */
  removeOperatingLease = false,
  currentCommonAllocation: { preferred: boolean; nci: boolean } = { preferred: false, nci: false },
  peConstruction: "price-eps" | "capitalization-common-income" = "capitalization-common-income",
): OwnHistoryDerivation {
  const series: HistorySeries = {};
  const details: Partial<Record<MultipleKey, OwnHistoryObservation[]>> = {};
  const normalized = normalizeQuarterRows(quarters ?? []);
  const candidates = contiguousQuarterWindows(normalized.rows, normalized.rows.length);
  if (candidates.windows.length === 0) {
    return {
      series,
      details,
      observations: 0,
      rejectedPeriods: normalized.rejected,
      rejectedWindows: candidates.rejected,
      unusableWindows: [],
      leaseBasisMismatchWindows: [],
      leaseScopeRejectedWindows: [],
      cashOwnershipRejectedWindows: [],
    };
  }
  const unusableWindows: Array<{ anchor: string; reason: string }> = [];
  const leaseBasisMismatchWindows: string[] = [];
  const leaseScopeRejectedWindows: Array<{ anchor: string; reason: string }> = [];
  const cashOwnershipRejectedWindows: string[] = [];
  const push = (key: MultipleKey, value: number): void => {
    const values = (series[key] ??= []);
    if (values.length < FULL_OWN_HISTORY_OBS) values.push(value);
  };
  for (const window of candidates.windows) {
    if (derivedKeys.every((key) => (series[key]?.length ?? 0) >= FULL_OWN_HISTORY_OBS)) break;
    const leaseScopeRefusal = leaseDebtScopeRefusal(window[0], !removeOperatingLease);
    if (leaseScopeRefusal) leaseScopeRejectedWindows.push({ anchor: window[0].date, reason: leaseScopeRefusal });
    const ev = latestOnOrBeforeWithin(
      evRows ?? [],
      window[0].date,
      OWN_HISTORY_EV_MAX_AGE_DAYS,
    );
    if (!ev) {
      unusableWindows.push({
        anchor: window[0].date,
        reason:
          "no enterprise-values history row on or before the TTM period end within 45 calendar days (future rows are ineligible); historical multiple window unavailable",
      });
      continue;
    }
    const sum = (f: (r: QuarterlyFundamentalsRow) => number | null): number | null => {
      let acc = 0;
      for (const r of window) {
        const v = f(r);
        if (!isNum(v)) return null;
        acc += v;
      }
      return acc;
    };
    const ttmRev = posOrNull(sum((r) => r.revenue));
    const ttmEbitda = sum((r) =>
      isNum(r.operatingIncome) && isNum(r.depreciationAndAmortization)
        ? r.operatingIncome + r.depreciationAndAmortization
        : null,
    );
    const ttmNi = sum((r) => r.netIncome);
    const commonWindow = constructCommonIncomeQuarterWindow(window);
    // Preserve each quarter's outside-claim admission while selecting the same
    // complete numerator branch for the entire current/historical window.
    const fallbackRefusal = isNum(commonWindow.netIncomeAvailableToCommon) ? null : window.map(r => {
      if (
        ((currentCommonAllocation.preferred && !isNum(r.preferredStock)) ||
          (currentCommonAllocation.nci && !isNum(r.minorityInterest) && r.netIncomeOwnershipBasis !== "parent"))) return "historical outside-claim allocation is unavailable";
      return commonHolderCapital({ ...r, netIncomeAvailableToCommon: null }, r).incomeWithheldReason;
    }).find(reason => reason !== null) ?? null;
    const commonSelection = commonHolderCapital(commonWindow, window[0]);
    const commonWindowRefusal = commonWindow.commonIncomeWithheldReason ?? fallbackRefusal ?? commonSelection.incomeWithheldReason;
    if (commonWindowRefusal) unusableWindows.push({ anchor: window[0].date, reason: `historical common-income P/E withheld: ${commonWindowRefusal}` });
    const ttmCommonNi = commonWindowRefusal ? null : commonSelection.commonIncome;
    const quotedEps = peConstruction === "price-eps" ? sum(r => r.epsSecurityBasis === "quoted" ? r.epsDiluted ?? null : null) : null;
    const ttmFcf = sum((r) => deriveFcf(r.operatingCashFlow, r.capitalExpenditure));
    const cashOwnershipUnresolved = window.some(unresolvedCashOwnership);
    if (cashOwnershipUnresolved) cashOwnershipRejectedWindows.push(window[0].date);
    const equity = currentCommonAllocation.preferred && !isNum(window[0].preferredStock) && !isNum(window[0].commonEquity)
      ? null : commonHolderCapital(window[0], window[0]).commonEquity;
    const mcap = ev.marketCapitalization;
    // Build the historical EV from the SAME components as the current one
    // rather than trusting the vendor field, which omits preferred stock and
    // minority interest and nets cash only. Ranking a house EV against a
    // history of vendor EVs put a definitional gap into every EV percentile.
    // Undisclosed preferred/minority are treated as 0, matching the current
    // path's FMP convention; debt and cash are required, and when they are
    // absent the EV-based multiples for this window are simply not produced
    // (the equity-based ones below are unaffected because they use mcap).
    const b = window[0];
    // WS6 review (BLOCKER 2): the SAME lease adjustment the current EV carries.
    // Only the operating slice leaves EV (BLOCKER 1), and a window that cannot
    // supply its own operating-lease liability while the current EV removed one
    // is dropped rather than ranked against a different definition.
    const windowOperatingLease =
      isNum(b.operatingLeaseLiability) && b.operatingLeaseLiability >= 0
        ? b.operatingLeaseLiability
        : null;
    const leaseBasisMatches = !removeOperatingLease || windowOperatingLease !== null;
    if (!leaseBasisMatches) leaseBasisMismatchWindows.push(b.date);
    const historicalNetDebt = resolveNetDebt(b);
    // FIN-119: the quarter's own redeemable claims, read as the current EV reads them; a refused one drops the EV multiples.
    const windowTemporary = temporaryEquityClaims(b);
    const evVal =
      leaseBasisMatches && leaseScopeRefusal === null && !unknownNoncontrollingAllocation(b) && windowTemporary?.refusal == null && isNum(mcap) && historicalNetDebt.value !== null
        ? mcap +
          historicalNetDebt.value +
          (isNum(b.preferredStock) ? b.preferredStock : 0) +
          (isNum(b.minorityInterest) ? b.minorityInterest : 0) +
          (windowTemporary?.total ?? 0) -
          (removeOperatingLease ? (windowOperatingLease as number) : 0)
        : null;
    // FFO/AFFO history on the net income + income-statement D&A construction
    // (AFFO = FFO − |capex|), the only definition four quarterly statements
    // can rebuild. The CURRENT FFO is computeNareitFfo's fiscal-year figure;
    // the caller says through `ffoHistoryComparable` whether that figure IS
    // this construction (no gains, impairments or real-estate-only D&A
    // netted), and the framework withholds these bands when it is not, so a
    // NAREIT FFO is never ranked inside a differently-defined history. Without
    // the history, `priceToFfo`/`priceToAffo` had no own-history band at all,
    // so every equity REIT's only two multiples scored null and its composite
    // was permanently shrunk for evidence the pipeline could compute.
    // INCOME-statement D&A only: mergeQuarterly falls back to the cash-flow
    // figure, and allowing it here ranked one D&A definition against another.
    const ttmDa = sum((r) => r.incomeDepreciationAndAmortization ?? null);
    const ttmCapex = sum((r) => r.capitalExpenditure);
    const ttmFfo = isNum(ttmNi) && isNum(ttmDa) ? ttmNi + ttmDa : null;
    const ttmAffo = isNum(ttmFfo) && isNum(ttmCapex) ? ttmFfo - Math.abs(ttmCapex) : null;
    const values: Partial<Record<MultipleKey, number | null>> = {
      evToSales: safeDiv(evVal, ttmRev),
      evToEbitda: safeDiv(evVal, posOrNull(ttmEbitda)),
      peTtm: peConstruction === "price-eps" ? safeDiv(ev.stockPrice, posOrNull(quotedEps)) : safeDiv(mcap, posOrNull(ttmCommonNi)),
      priceToFcf: cashOwnershipUnresolved ? null : safeDiv(mcap, posOrNull(ttmFcf)),
      priceToBook: safeDiv(mcap, posOrNull(equity)),
      priceToFfo: safeDiv(mcap, posOrNull(ttmFfo)),
      priceToAffo: safeDiv(mcap, posOrNull(ttmAffo)),
    };
    const stillNeeded = derivedKeys.filter(
      (key) => (series[key]?.length ?? 0) < FULL_OWN_HISTORY_OBS,
    );
    const unavailable = derivedKeys.filter((key) => {
      const value = values[key];
      return value === null || value === undefined || value <= 0;
    });
    for (const key of stillNeeded) {
      const value = values[key];
      if (value !== null && value !== undefined && value > 0) {
        push(key, value);
        (details[key] ??= []).push({ periodEnd: window[0].date, marketDate: ev.date, value,
          source: "raw-statements", ...(ev.sourceId ? { marketCapSourceId: ev.sourceId } : {}) });
      }
    }
    if (unavailable.length > 0) {
      unusableWindows.push({
        anchor: window[0].date,
        reason: `${unavailable.length === derivedKeys.length ? "historical multiple window unavailable" : "partial historical multiple window"}: no positive/computable ${unavailable.join(", ")}`,
      });
    }
  }
  const observations = Math.max(0, ...DERIVED_HISTORY_KEYS.map((key) => series[key]?.length ?? 0));
  return {
    series,
    details,
    observations,
    rejectedPeriods: normalized.rejected,
    rejectedWindows: candidates.rejected,
    unusableWindows,
    leaseBasisMismatchWindows,
    leaseScopeRejectedWindows,
    cashOwnershipRejectedWindows,
  };
}

function ownHistoryWindowGap(derived: OwnHistoryDerivation): ManifestEntry | null {
  const total = derived.rejectedPeriods.length + derived.rejectedWindows.length + derived.unusableWindows.length;
  if (total === 0) return null;
  const details = [
    ...derived.rejectedPeriods.map(({ period, reason }) => `period ${period}: ${reason}`),
    ...derived.rejectedWindows.map(({ anchor, reason }) => `window ${anchor}: ${reason}`),
    ...derived.unusableWindows.map(({ anchor, reason }) => `window ${anchor}: ${reason}`),
  ];
  const shown = details.slice(0, 8);
  const omitted = details.length - shown.length;
  return gapEntry(
    "valuation.multiples.ownHistory.windows",
    `${derived.rejectedPeriods.length} rejected fiscal period(s), ${derived.rejectedWindows.length} rejected quarter window(s), and ${derived.unusableWindows.length} financially partial/unusable window(s): ${shown.join("; ")}${omitted > 0 ? `; +${omitted} more` : ""}`,
    "info",
  );
}

/** Vendor pre-baked history mapped to our multiple keys. */
function vendorHistory(rows: VendorMultiplesRow[] | undefined): HistorySeries {
  const series: HistorySeries = {};
  if (!rows) return series;
  const push = (k: MultipleKey, v: number | null | undefined): void => {
    const values = (series[k] ??= []);
    if (isNum(v) && v > 0 && values.length < FULL_OWN_HISTORY_OBS) values.push(v);
  };
  for (const r of rows) {
    push("evToSales", r.evToSales);
    push("evToEbitda", r.evToEBITDA);
    push("peTtm", r.priceToEarningsRatio);
    push("priceToBook", r.priceToBookRatio);
    push("priceToFcf", r.priceToFreeCashFlowRatio);
  }
  return series;
}

function bandFor(values: number[] | undefined, current: number | null, basis: string, details: OwnHistoryObservation[] = []): OwnHistoryBand | null {
  if (!values || values.length < MIN_HISTORY_OBS_FOR_BAND) return null;
  // With the derivation capped at 20 quarterly obs, quantile idx 0.05·(n−1) < 1 for
  // all n ≤ 20, so p5/p95 are interpolated within the outermost cell — they track the
  // near-min/near-max (≈ observed range), not stable tail percentiles. Flag thin
  // windows so p5/p95 aren't over-read; the median/quartiles stay robust.
  const lowSample = values.length < FULL_OWN_HISTORY_OBS;
  const flat = percentileRank(values, values[0]) === null;
  const observationBasis =
    `${basis} (${values.length} observations). The reported figure is an empirical percentile rank within this sample ` +
    "(0-100 by linear interpolation between order statistics; tied values receive their midrank within a relative tolerance of 1e-9). " +
    "It is not an ordinal position or an estimate of a population percentile; small samples and input comparability limit interpretation.";
  const notedBasis = lowSample
    ? `${observationBasis} LOW SAMPLE (${values.length} quarterly observations < 5y): p5/p95 track the tail observations (≈ observed range), not stable quantiles.`
    : observationBasis;
  return {
    percentileRank: current !== null ? percentileRank(values, current) : null,
    p5: quantile(values, 0.05),
    p25: quantile(values, 0.25),
    p50: quantile(values, 0.5),
    p75: quantile(values, 0.75),
    p95: quantile(values, 0.95),
    observations: values.length,
    observationDetails: details,
    basis: notedBasis + (flat ? " Flat history is uninformative; no own-history rank or grade signal is available." : ""),
    lowSample,
  };
}

/**
 * Current multiples computed from raw FMP fields (never trusting pre-baked
 * ratios for the current print), own-history 5y percentile bands, and trimmed
 * peer stats. `sectorAppropriate` tells the UI which multiples are valid for
 * the route (banks never get EV multiples; REITs lead with P/FFO).
 */
export function multiplesFramework(
  route: SectorRoute,
  inputs: MultiplesFrameworkInputs,
): MultiplesResult {
  const notes: string[] = [];
  const gaps: ManifestEntry[] = [];
  const inc = inputs.incomeTtm;
  const cf = inputs.cashFlowTtm;
  const bal = inputs.balance;
  const financialsRoute = route === "bank" || route === "insurer" || route === "reit-mortgage";
  const ffoSubmapUndetermined = route === "reit" && inputs.reitSubmap === "undetermined";
  const ffoSubmapReason =
    "REIT sub-map is undetermined — P/FFO and P/AFFO require an evidenced equity REIT; current multiples, own-history bands and peer comparisons are withheld";
  if (ffoSubmapUndetermined) {
    notes.push(ffoSubmapReason);
    gaps.push(gapEntry("valuation.multiples.reitSubmap", ffoSubmapReason, "warn"));
  }
  // Every multiple here sets the quote (price, market cap, EV) against the
  // statements. Unless both are in one known currency none of them is a
  // figure, and neither is its rank in an own history built the same way:
  // the price inputs are withheld, so every multiple reads n/m. Peer stats
  // describe other issuers and stay.
  const priceCurrency = comparePriceCurrency(inputs.reportedCurrency, inputs.quote.currency);
  const equityScope = resolveEconomicEquityScope(inputs.quote, inputs.economicShareEvidence ?? [], inputs.securityBasisAsOf ?? "");
  const marketCapSecurityKnown = equityScope.status !== "unresolved";
  const mcap = priceCurrency.comparable && marketCapSecurityKnown ? posOrNull(equityScope.marketCap) : null;
  const price = priceCurrency.comparable ? posOrNull(inputs.quote.price) : null;
  if (!marketCapSecurityKnown) {
    const reason = equityScope.basis;
    notes.push(reason);
    gaps.push(gapEntry("valuation.multiples.marketCap.securityBasis", reason, "warn"));
  }
  if (!priceCurrency.comparable) {
    notes.push(
      `price multiples withheld: ${priceCurrency.reason} — a multiple would set the quote against statements that are not proven to share its currency; own-history bands withheld on the same rule`,
    );
    gaps.push(
      gapEntry(
        "valuation.multiples.currency",
        priceCurrency.mismatch
          ? `reportedCurrency ${inputs.reportedCurrency} != quote currency ${inputs.quote.currency} (ADR case) — FX conversion pending, price multiples withheld`
          : `${priceCurrency.reason} — price multiples withheld`,
        "warn",
      ),
    );
  } else if (mcap === null) {
    // Fix round 2, M4: a cap withheld on share scope is named as withheld, with the scope's reason; "missing" only when absent.
    gaps.push(gapEntry("valuation.multiples.marketCap", !marketCapSecurityKnown
      ? `market cap withheld — most multiples not computable: ${equityScope.basis.replace(/\.$/, "")}`
      : "market cap missing — most multiples not computable", "warn"));
  }

  // --- Raw building blocks (zero-for-undisclosed handled where implausible) --
  const revenue = posOrNull(zeroAsNull(inc?.revenue));
  // Audit 2026-10-22 B-9 review: the cash-flow statement's D&A stands in only
  // on the income statement's own period; on another, EBITDA would add two
  // periods' figures under one period's label.
  const period = (row: { date: string; basis?: "ttm" | "annual"; fiscalYear?: string | null }): string =>
    row.basis === "annual"
      ? (/^\d{4}$/.test(row.fiscalYear ?? "") ? `FY${row.fiscalYear}` : row.date === "" ? "an undated fiscal year" : `FY ended ${row.date}`)
      : row.date === "" ? "an undated TTM" : `TTM to ${row.date}`;
  // An undated row matches nothing: two empty dates are not one period.
  const onIncomeDate = (date: string): boolean => inc !== null && inc.date !== "" && date === inc.date;
  const cashFlowDaSamePeriod =
    inc === null || cf === null
      ? null
      : isNum(cf.depreciationAndAmortization) && onIncomeDate(cf.date) && (cf.basis ?? "ttm") === (inc.basis ?? "ttm")
        ? cf.depreciationAndAmortization
        : inc.basis === "annual" && isNum(cf.annualDepreciationAndAmortization?.value) && onIncomeDate(cf.annualDepreciationAndAmortization.date)
          ? cf.annualDepreciationAndAmortization.value
          : null;
  const cashFlowDaElsewhere = inc !== null && !isNum(inc.depreciationAndAmortization) && cashFlowDaSamePeriod === null && isNum(cf?.depreciationAndAmortization);
  const dAndA = isNum(inc?.depreciationAndAmortization) ? inc.depreciationAndAmortization : cashFlowDaSamePeriod;
  const ebitda =
    isNum(inc?.operatingIncome) && isNum(dAndA) ? inc.operatingIncome + dAndA : null;
  const ebitdaLowerBound = ebitda !== null && isNum(inc?.depreciationAndAmortization) && inc.dAndALowerBound ? inc.dAndALowerBound : null;
  if (!financialsRoute && inc && cashFlowDaElsewhere) {
    gaps.push(gapEntry("valuation.multiples.ebitda", `no income-statement D&A, and the cash-flow D&A covers ${period(cf!)}, not ${period(inc)} — EBITDA (computed) withheld rather than adding two periods`, "info"));
  } else if (!financialsRoute && inc && !isNum(dAndA)) {
    gaps.push(gapEntry("valuation.multiples.ebitda", "depreciationAndAmortization missing — EBITDA (computed) unavailable", "info"));
  }
  const fcf = deriveFcf(cf?.operatingCashFlow, cf?.capitalExpenditure);
  const capital = commonHolderCapital(inc, bal);
  const equity = capital.commonEquity;
  const tbv =
    isNum(equity) && isNum(bal?.goodwill) && isNum(bal?.intangibleAssets)
      ? equity - bal.goodwill - bal.intangibleAssets
      : null;
  // WS6 (D-19): the EV bridge, computed BOTH ways and disclosed.
  // Base = market cap + total debt + preferred + minority interest − cash and
  // short-term investments. FMP's totalDebt already contains the lease
  // liability, so the default (leases NOT in EV) subtracts it back out.
  const netDebt = resolveNetDebt(bal ?? {});
  const unknownNciAllocation = unknownNoncontrollingAllocation(bal);
  // FIN-119 (OD-1): redeemable preferred and redeemable NCI sit in temporary
  // equity, outside every equity field above, and are claims on the enterprise
  // like permanent preferred and book NCI. A refused operand withholds the EV.
  const temporaryClaims = financialsRoute ? null : temporaryEquityClaims(bal);
  const temporaryRefusal = temporaryClaims?.refusal ?? null;
  const temporaryTotal = temporaryClaims !== null && temporaryRefusal === null ? temporaryClaims.total : 0;
  if (temporaryRefusal !== null) {
    const reason = `${temporaryRefusal}; the redeemable preferred and redeemable noncontrolling claims cannot be added, and the EV-dependent multiples are withheld rather than zero-filled`;
    notes.push(reason);
    gaps.push(gapEntry("valuation.multiples.enterpriseValue.temporaryEquity", reason, "warn"));
  }
  // Inspect known ownership in every quarter that can contribute to the
  // current annual/TTM cash-flow year, including interests divested by its end.
  const cashEnd = cf?.date ?? "";
  const cashStart = /^\d{4}-\d{2}-\d{2}$/.test(cashEnd) ? `${Number(cashEnd.slice(0, 4)) - 1}${cashEnd.slice(4)}` : "";
  const currentCashRows = (inputs.quarterlyFundamentals ?? []).filter(row => cashStart && row.date > cashStart && row.date <= cashEnd);
  const unresolvedParentFcf = (bal !== null && unresolvedCashOwnership({ ...bal, noncontrollingIncome: inc?.noncontrollingIncome })) ||
    (!immaterialNoncontrollingInterest(bal, inc?.noncontrollingIncome) && isNum(inc?.noncontrollingIncome) && inc.noncontrollingIncome !== 0) ||
    (isNum(inc?.preferredDividendsPaid) && inc.preferredDividendsPaid !== 0) || currentCashRows.some(unresolvedCashOwnership);
  const parentFcfScope = unresolvedParentFcf
    ? "Parent-common cash-flow attribution unresolved: the numerator is parent-common capitalization and the denominator is consolidated operating cash flow less capital expenditure before SBC. Retained disclosures do not allocate that cash flow among parent common holders, noncontrolling interests or preferred claims. P/FCF, its own-history rank and peer comparison are withheld as parent-common valuation measures."
    : null;
  if (!financialsRoute && parentFcfScope) {
    notes.push(parentFcfScope);
    gaps.push(gapEntry("valuation.multiples.priceToFcf.cashOwnership", parentFcfScope, "warn"));
  }
  const unknownNciReason = "Consolidated equity has no resolved parent/NCI split or differs from parent equity, but the NCI allocation is unavailable; outside ownership cannot be zero-filled or valued from the book-equity difference. EV-dependent multiples withheld.";
  if (!financialsRoute && unknownNciAllocation) {
    notes.push(unknownNciReason);
    gaps.push(gapEntry("valuation.multiples.enterpriseValue.noncontrollingOwnership", unknownNciReason, "warn"));
  }
  if (!financialsRoute && bal && netDebt.value === null) {
    gaps.push(gapEntry("valuation.multiples.netDebt", netDebt.reason, "warn"));
    notes.push(`EV withheld: ${netDebt.reason}. Equity-only multiples are evaluated separately.`);
  }
  const rawEvIncludingLeases =
    mcap !== null && bal && netDebt.value !== null && !unknownNciAllocation && temporaryRefusal === null
      ? mcap +
        netDebt.value +
        (isNum(bal.preferredStock) ? bal.preferredStock : 0) +
        (isNum(bal.minorityInterest) ? bal.minorityInterest : 0) +
        temporaryTotal
      : null;
  // WS6 review (BLOCKER 1): ONLY the operating-lease liability may leave EV.
  // Under ASC 842 operating-lease cost sits in operating expenses, so EBIT and
  // EBITDA are already AFTER it. Finance-lease cost is split between
  // right-of-use amortisation (inside EBIT, added back in EBITDA) and interest
  // (below EBIT), and the finance-lease liability is
  // debt in both. Removing the combined figure understated net debt (Apple
  // FY2025: ~1.2bn of finance leases) and overstated equity value.
  const totalLeaseLiability =
    isNum(bal?.capitalLeaseObligations) && bal.capitalLeaseObligations >= 0
      ? bal.capitalLeaseObligations
      : null;
  // Audit 2026-10-19 CODE-1: removed only when totalDebt is shown to hold it.
  const evLeaseScope = operatingLeaseScopeUnproven(bal ?? {});
  const leaseLiability =
    evLeaseScope === null && isNum(bal?.operatingLeaseLiability) && bal.operatingLeaseLiability >= 0
      ? bal.operatingLeaseLiability
      : null;
  const financeLeaseLiability =
    leaseDebtConflict(bal ?? {}) !== null ? null
      : isNum(bal?.financeLeaseLiability) && bal.financeLeaseLiability >= 0 ? bal.financeLeaseLiability
        : totalLeaseLiability !== null && leaseLiability !== null
          ? Math.max(0, totalLeaseLiability - leaseLiability)
          : null;
  const includeLeases = inputs.includeLeasesInEv === true;
  const incompleteLeases = incompleteLeaseCoverage(bal);
  const inclusiveRefusal = leaseDebtScopeRefusal(bal, true);
  const excludedRefusal = leaseDebtScopeRefusal(bal, false);
  const evIncludingLeases = inclusiveRefusal ? null : rawEvIncludingLeases;
  const evExcludingLeases =
    excludedRefusal || rawEvIncludingLeases === null
      ? null
      : leaseLiability === null
        ? rawEvIncludingLeases
        : rawEvIncludingLeases - leaseLiability;
  const ev = includeLeases ? evIncludingLeases : evExcludingLeases;
  // VAL-4/KNW-04 (audit 2026-10-29, AMZN #51): a withheld EV states the actual
  // refusal; it is never described as reported as-is or as missing components.
  const evWithheldReason = financialsRoute || ev !== null ? null
    : !bal ? "no balance sheet is available"
      : netDebt.value === null ? netDebt.reason
        : !marketCapSecurityKnown ? equityScope.basis
          : !priceCurrency.comparable ? priceCurrency.reason
            : mcap === null ? "market cap missing"
              : unknownNciAllocation ? unknownNciReason
                : temporaryRefusal !== null ? temporaryRefusal
                  : (includeLeases ? inclusiveRefusal : excludedRefusal) || "the enterprise value bridge did not resolve";
  // Review m3: a reason that already ends a sentence keeps its one period.
  const evBridgeBasis = evWithheldReason !== null ? (evWithheldReason.endsWith(".") ? `EV withheld: ${evWithheldReason}` : `EV withheld: ${evWithheldReason}.`) :
    ((includeLeases ? inclusiveRefusal : excludedRefusal) ? `${includeLeases ? inclusiveRefusal : excludedRefusal} ` : "") +
    (incompleteLeases !== null
      ? `Enterprise value ${includeLeases ? "keeps" : "removes"} the disclosed operating-lease portion embedded in retained debt. ${incompleteLeases.note} `
      : includeLeases
      ? `Enterprise value INCLUDES the operating-lease liability${EV_LEASE_SETTING_TEXT.included}. `
      : `Enterprise value EXCLUDES the OPERATING-lease liability${EV_LEASE_SETTING_TEXT.excluded}. `) +
    "EV = market cap + total debt + preferred stock + minority interest" +
    (temporaryTotal !== 0 && temporaryClaims !== null
      ? ` + ${[...(temporaryClaims.redeemablePreferred !== 0 ? ["temporary equity attributable to the parent"] : []),
        ...(temporaryClaims.unsplit !== 0 ? ["temporary equity with no parent/NCI split"] : []),
        ...(temporaryClaims.redeemableNoncontrolling !== 0 ? ["redeemable noncontrolling interest"] : [])].join(" + ")}`
      : "") +
    " − cash and short-term investments" +
    (netDebt.nonOperatingEquitySecurities !== undefined
      ? ` excluding ${fmtGrouped(netDebt.nonOperatingEquitySecurities)} of marketable equity securities, which are not cash (the D-60 net cash the DCF bridge and the key-data EV use; house rule D-65)`
      : "") +
    (leaseLiability === null
      ? evLeaseScope !== null
        ? `; ${evLeaseScope}, and EV is reported as-is`
        : totalLeaseLiability === null
        ? "; lease liabilities were not disclosed separately, so they could not be separated from totalDebt and EV is reported as-is"
        : `; a total lease liability of ${fmtGrouped(totalLeaseLiability)} is disclosed but its operating slice is not, so no lease adjustment was made and EV is reported as-is`
      : `, ${includeLeases ? "keeping" : "less"} ${incompleteLeases === null ? "an OPERATING lease liability" : "a disclosed operating-lease portion"} of ${fmtGrouped(leaseLiability)}` +
        (financeLeaseLiability === null || financeLeaseLiability === 0
          ? ""
          : `; the finance-lease liability of ${fmtGrouped(financeLeaseLiability)} STAYS in EV on both bases`) +
        " (both already inside totalDebt under FMP's definition)") +
    ". EV/EBITDA uses this same EV. Under US GAAP (ASC 842) operating-lease cost stays in operating expenses, so EBIT and EBITDA are already AFTER it" +
    (incompleteLeases !== null
      ? ", with the disclosed operating-lease portion treated on that convention; unverified maturities prevent a claim of complete lease coverage."
      : includeLeases
      ? ", and keeping the operating-lease liability in EV pairs a lease-INCLUSIVE numerator with a lease-EXPENSED denominator — not comparable to the default basis, and the caller's explicit choice."
      : ", so removing the operating-lease liability keeps numerator and denominator on the same basis.") +
    " Finance-lease right-of-use amortisation is included in EBIT and added back in EBITDA; finance-lease interest is below EBIT. The finance-lease liability remains financing debt in both frames and is never removed." +
    ` ${equityScope.basis} ` +
    (unknownNciAllocation ? `${unknownNciReason} ` : "") +
    (temporaryClaims !== null && temporaryRefusal === null && temporaryClaims.redeemablePreferred + temporaryClaims.unsplit !== 0
      ? "The temporary equity attributable to the parent can also hold redeemable common shares (for example shares subject to possible redemption or an ESOP put) that the quoted market cap already counts; the filed facts do not separate them, so such shares would be counted twice. "
      : "") +
    (isNum(bal?.minorityInterest) && bal.minorityInterest !== 0 ? "Noncontrolling interest is a filed book-value proxy, not an established market value. " : "") +
    "Non-operating holdings are not comprehensively resolved; this bridge does not establish a fully adjusted operating enterprise value. " +
    (evIncludingLeases === null || evExcludingLeases === null
      ? ""
      : ` EV excluding ${incompleteLeases === null ? "the operating-lease liability" : "the disclosed operating-lease portion"} ${fmtGrouped(evExcludingLeases)}; ${incompleteLeases === null ? "EV as reported" : "EV on retained debt basis"} ${fmtGrouped(evIncludingLeases)}.`);
  const enterpriseValue: EnterpriseValueBridge = {
    equityScope,
    noncontrollingInterestBasis: unknownNciAllocation ? "unknown-allocation" : isNum(bal?.minorityInterest) && bal.minorityInterest !== 0 ? "book-value-proxy" : "none-disclosed",
    nonOperatingHoldingsScope: "not-comprehensively-resolved",
    value: financialsRoute ? null : ev,
    excludingLeases: financialsRoute ? null : evExcludingLeases,
    includingLeases: financialsRoute ? null : evIncludingLeases,
    leaseLiability: financialsRoute ? null : leaseLiability,
    totalLeaseLiability: financialsRoute ? null : totalLeaseLiability,
    financeLeaseLiability: financialsRoute ? null : financeLeaseLiability,
    includeLeases,
    basis: financialsRoute ? "Enterprise value is not applicable to financial companies; funding liabilities are operating inputs." : evBridgeBasis,
  };
  // A withheld net debt already noted "EV withheld: <reason>" above.
  if (!financialsRoute && !(evWithheldReason !== null && netDebt.value === null)) notes.push(evBridgeBasis);
  if (!financialsRoute && ev === null) {
    gaps.push(gapEntry("valuation.multiples.enterpriseValue", `EV withheld: ${evWithheldReason} — EV multiples n/m`, "info"));
  } else if (!financialsRoute && leaseLiability === null) {
    gaps.push(
      gapEntry(
        "valuation.multiples.enterpriseValue.leases",
        evLeaseScope !== null
          ? `${evLeaseScope}; enterprise value is reported as-is`
          : totalLeaseLiability === null
          ? "lease liabilities (capitalLeaseObligations) not disclosed — they could not be separated from totalDebt, so enterprise value is reported as-is and any lease liability inside totalDebt stays in EV under either lease setting"
          : `lease liabilities of ${fmtNum(totalLeaseLiability)} are disclosed only as a combined operating + finance figure (the FMP route publishes no split) — only the OPERATING slice may be netted out of EV, so enterprise value is reported as-is rather than removing an unknown mix`,
        "info",
      ),
    );
  } else if (!financialsRoute && includeLeases && leaseLiability !== null) {
    gaps.push(
      gapEntry(
        "valuation.multiples.enterpriseValue.leases",
        `THESIS_EV_INCLUDE_LEASES=1: enterprise value keeps the operating-lease liability of ${fmtNum(leaseLiability)} while EBITDA remains after operating-lease cost (ASC 842) — EV/EBITDA is not comparable to the default basis`,
        "warn",
      ),
    );
  }

  if (financialsRoute) {
    notes.push("EV multiples suppressed for financials — debt is raw material, EV is meaningless (house rule; docs/METHODOLOGY.md, Financial-company routes)");
  }

  // --- Current multiples from raw fields ------------------------------------
  let eps = posOrNull(inc?.epsDiluted);
  let epsBasis = "price / epsDiluted";
  // Audit 2026-10-22 B-20: why price / diluted EPS did not produce the P/E, named in its basis.
  let epsUnused = isNum(inc?.epsDiluted)
    ? "diluted EPS for the period is not positive"
    : inc?.basis === "annual" ? "the fiscal year's diluted EPS is not reported" : "diluted EPS is not available for every quarter of the period";
  if (inputs.quote.isAdr === true && eps !== null) {
    const security = resolveSecurityBasis(inputs.securityBasis ?? [], inputs.securityBasisAsOf ?? "");
    if (security === null || security.quoteUnit !== "ADS" || inc?.epsSecurityBasis === undefined ||
      (inputs.quote.issuerId !== undefined && security.issuerId !== inputs.quote.issuerId) ||
      (inputs.quote.securityId !== undefined && security.securityId !== inputs.quote.securityId)) {
      eps = null;
      epsUnused = "the ADR's depositary ratio and EPS basis are not verified";
      const reason = "ADR/ADS price-to-EPS basis unavailable: a verified effective-dated depositary ratio and explicit ordinary-versus-quoted EPS basis are required; price/EPS withheld, with common-income market-cap fallback only when eligible";
      notes.push(reason);
      gaps.push(gapEntry("valuation.multiples.peTtm.securityBasis", reason, "warn"));
    } else if (inc.epsSecurityBasis === "ordinary") {
      eps *= security.ordinarySharesPerQuotedUnit;
      epsBasis = `price per ADS / (ordinary epsDiluted x ${security.ordinarySharesPerQuotedUnit} ordinary shares per ADS) (verified basis ${security.sourceIds.join(", ")}, effective ${security.effectiveFrom})`;
    } else epsBasis = "price per ADS / epsDiluted already per quoted ADS (no second ratio adjustment)";
  }
  // Audit 2026-10-22 B-8: when the classes carry different economic weights,
  // a filed diluted EPS is per share of one class whose identity the filing
  // facts do not establish (BRK reports per Class A equivalent), so P/E uses
  // the issuer-economic capitalization over common income instead.
  if (eps !== null && equityScope.status === "resolved" && equityScope.weightedClasses === true) {
    eps = null;
    epsUnused = "share classes carry different economic weights and the diluted EPS class basis is not established";
    const reason = "share classes carry different economic weights and the diluted EPS class basis is not established; P/E is issuer-economic market cap / common income, not price / EPS";
    notes.push(reason);
    gaps.push(gapEntry("valuation.multiples.peTtm.economicClassBasis", reason, "info"));
  }
  if (capital.equityWithheldReason) gaps.push(gapEntry("valuation.multiples.priceToBook.commonEquity", capital.equityWithheldReason, "warn"));
  if (eps === null && capital.incomeWithheldReason) gaps.push(gapEntry("valuation.multiples.peTtm.commonIncome", capital.incomeWithheldReason, "warn"));
  const current: Partial<Record<MultipleKey, number | null>> = {
    peTtm:
      price !== null && eps !== null
        ? price / eps
        : safeDiv(mcap, posOrNull(capital.commonIncome)),
    priceToFcf: financialsRoute || unresolvedParentFcf ? null : safeDiv(mcap, posOrNull(fcf)),
    priceToBook: safeDiv(mcap, posOrNull(equity)),
    priceToTbv: safeDiv(mcap, posOrNull(tbv)),
    evToEbitda: financialsRoute ? null : safeDiv(ev, posOrNull(ebitda)),
    evToSales: financialsRoute ? null : safeDiv(ev, revenue),
    priceToFfo: ffoSubmapUndetermined ? null : safeDiv(mcap, posOrNull(inputs.ffoApprox)),
    priceToAffo: ffoSubmapUndetermined ? null : safeDiv(mcap, posOrNull(inputs.affoApprox)),
  };
  if (route === "reit" && posOrNull(inputs.ffoApprox) === null) {
    gaps.push(gapEntry("valuation.multiples.priceToFfo", "FFO (approx.) not provided by caller — P/FFO unavailable", "warn"));
  }

  // The bounded upstream collector discloses evaluated candidates and their
  // exclusions. Legacy/direct callers without a collector still disclose the
  // missing input; neither path implies a market-wide search found no peers.
  if (inputs.peerCoverage) {
    notes.push(...inputs.peerCoverage.methodology);
    for (const exclusion of inputs.peerCoverage.exclusions) {
      notes.push(`Peer ${exclusion.symbol}: ${exclusion.reason}`);
    }
    if ((inputs.peers ?? []).length < MIN_PEERS_FOR_STATS) {
      gaps.push(gapEntry("valuation.multiples.peers", "Insufficient eligible peer coverage; each median requires four surviving issuers for that metric after the IQR rule. See peer selection/exclusions.", "info"));
    }
  } else if ((inputs.peers ?? []).length === 0) {
    notes.push(
      "Peer multiples were not supplied for this report — the peer median/IQR columns are " +
        "unavailable. This is a missing input, not a finding that the company has no peers.",
    );
    gaps.push(
      gapEntry(
        "valuation.multiples.peers",
        "peer multiples not supplied to the valuation stage — peer medians unavailable (not evaluated)",
        "info",
      ),
    );
  }

  // --- Own-history bands ------------------------------------------------------
  // Equity REITs are scored on P/FFO and P/AFFO alone, so those must be derived
  // for them; deriving them for every issuer would make the window scan chase
  // series no other route consumes.
  const derivedKeys: readonly MultipleKey[] = financialsRoute
    ? ["peTtm", "priceToBook"]
    : route === "reit" && !ffoSubmapUndetermined ? [...DERIVED_HISTORY_KEYS, "priceToFfo", "priceToAffo"] : DERIVED_HISTORY_KEYS;
  // WS6 review (BLOCKER 2): the own-history EV must be built from the SAME
  // definition as the current one — the file's own invariant. `removeOperatingLease`
  // is true exactly when the current EV removed an operating-lease liability.
  const removeOperatingLease = !financialsRoute && !includeLeases && leaseLiability !== null;
  const requiresHistoricalClassScope = equityScope.status === "resolved" &&
    inputs.economicShareEvidence?.some(row => row.classes.length > 1 || row.classes.some(cls => cls.economicUnitsPerQuotedShare !== 1)) === true;
  const historicalMarket = requiresHistoricalClassScope ? (inputs.enterpriseValuesHistory ?? []).map(row => {
    const historicalScope = row.sourceId && row.priceCurrency && inputs.reportedCurrency && inputs.quote.currency &&
      row.priceCurrency === inputs.reportedCurrency && row.priceCurrency === inputs.quote.currency ? resolveEconomicEquityScope({
      price: row.stockPrice ?? null, priceAsOf: row.date, currency: row.priceCurrency,
      issuerId: inputs.quote.issuerId, securityId: inputs.quote.securityId,
      marketCap: null, marketCapSecurityBasis: "unresolved",
    }, (inputs.economicShareEvidence ?? []).filter(evidence => evidence.filed <= row.date), row.date) : null;
    return { ...row, marketCapitalization: historicalScope?.status === "resolved" ? historicalScope.marketCap : null,
      stockPrice: historicalScope?.status === "resolved" ? row.stockPrice : null,
      sourceId: historicalScope?.status === "resolved" ? [row.sourceId, ...historicalScope.sourceIds].join("; ") : row.sourceId };
  }) : inputs.enterpriseValuesHistory;
  const derived = deriveOwnHistory(
    inputs.quarterlyFundamentals,
    historicalMarket,
    derivedKeys,
    removeOperatingLease,
    // A refused temporary-equity operand is a filed claim of unknown amount: it counts, as in the other two checks.
    { preferred: (bal?.preferredStock ?? 0) > 0 || temporaryParentLike(bal) > 0 || temporaryEquityRefused(bal),
      nci: (isNum(bal?.minorityInterest) && bal.minorityInterest !== 0) || (temporaryEquityClaims(bal)?.redeemableNoncontrolling ?? 0) > 0 || temporaryEquityRefused(bal) },
    requiresHistoricalClassScope && price !== null && eps !== null ? "price-eps" : "capitalization-common-income",
  );
  const windowGap = ownHistoryWindowGap(derived);
  if (windowGap) gaps.push(windowGap);
  if (derived.leaseBasisMismatchWindows.length > 0) {
    const detail =
      `${derived.leaseBasisMismatchWindows.length} historical quarter window(s) (${derived.leaseBasisMismatchWindows.slice(0, 8).join(", ")}` +
      `${derived.leaseBasisMismatchWindows.length > 8 ? `, +${derived.leaseBasisMismatchWindows.length - 8} more` : ""}) ` +
      "disclose no operating-lease liability while the current enterprise value removes one — their EV/EBITDA and EV/sales were dropped rather than ranked against a lease-inclusive history";
    notes.push(`own-history EV lease basis: ${detail}`);
    gaps.push(gapEntry("valuation.multiples.ownHistory.evLeaseBasis", detail, "info"));
  }
  const history: HistorySeries = {};
  const historyDetails: Partial<Record<MultipleKey, OwnHistoryObservation[]>> = {};
  const historyBasisByKey: Partial<Record<MultipleKey, string>> = {};
  const derivedBasis =
    "per-quarter TTM multiples derived from four normalized contiguous fiscal quarters of raw statements + the latest enterprise value and market capitalization on or before each TTM period end (maximum age 45 calendar days; future observations are ineligible)";
  const vendorBasis = "vendor pre-baked ratio history (FMP key-metrics/ratios quarterly) — derivation from raw statements not possible for this multiple";
  const vendor = priceCurrency.comparable ? vendorHistory(inputs.keyMetricsHistory) : {};
  const historicalFcfScope = derived.cashOwnershipRejectedWindows.length
    ? `P/FCF historical cash-flow attribution unresolved in ${derived.cashOwnershipRejectedWindows.length} retained TTM window(s): consolidated cash flow includes known or unresolved noncontrolling ownership or preferred claims. Those windows are excluded; vendor P/FCF history cannot restore their unknown parent-common cash scope.` : null;
  if (historicalFcfScope) {
    delete vendor.priceToFcf;
    gaps.push(gapEntry("valuation.multiples.priceToFcf.historicalCashOwnership", historicalFcfScope, "warn"));
    notes.push(historicalFcfScope);
  }
  const materialCommonAllocation = (bal?.preferredStock ?? 0) > 0 || (isNum(bal?.minorityInterest) && bal.minorityInterest !== 0) || hasTemporaryEquityClaim(bal);
  if (materialCommonAllocation && (vendor.priceToBook?.length || vendor.peTtm?.length)) {
    delete vendor.priceToBook;
    delete vendor.peTtm;
    const reason = "vendor P/B and P/E history has no common-holder ownership evidence beside material preferred or noncontrolling interests; common-basis history cannot be established, so these vendor own-history bands are withheld";
    notes.push(reason);
    gaps.push(gapEntry("valuation.multiples.ownHistory.commonBasis", reason, "info"));
  }
  // WS6 review (BLOCKER 2): the vendor's pre-baked EV ratios are built on the
  // vendor's own lease-INCLUSIVE enterprise value. Ranking a lease-adjusted
  // current multiple inside that distribution compares two definitions, so when
  // the adjustment fired the vendor EV bands are withheld rather than published
  // on a basis the current number does not share.
  const vendorEvKeys: readonly MultipleKey[] = ["evToEbitda", "evToSales"];
  if (derived.leaseScopeRejectedWindows.length) {
    for (const key of vendorEvKeys) delete vendor[key];
    const reason = `${derived.leaseScopeRejectedWindows.length} historical quarter window(s) have a known incomplete lease/debt scope: ` +
      derived.leaseScopeRejectedWindows.slice(0, 3).map(({ anchor, reason }) => `${anchor}: ${reason}`).join("; ") +
      ". Affected raw-statement EV windows are excluded. Vendor EV/EBITDA and EV/sales history lacks the component evidence needed to cure these refusals and cannot restore an own-history band; supported raw-statement windows remain eligible.";
    notes.push(reason);
    gaps.push(gapEntry("valuation.multiples.ownHistory.evLeaseScope", reason, "warn"));
  }
  if (unknownNciAllocation || inputs.quarterlyFundamentals?.some(unknownNoncontrollingAllocation)) {
    for (const key of vendorEvKeys) delete vendor[key];
    const reason = "Known outside ownership has an unavailable NCI allocation in current or historical balance evidence; affected historical EV windows and vendor EV-ratio fallback without ownership allocation evidence are withheld. Equity-only history is evaluated separately.";
    notes.push(reason);
    gaps.push(gapEntry("valuation.multiples.ownHistory.noncontrollingOwnership", reason, "info"));
  }
  if (removeOperatingLease && vendorEvKeys.some((key) => (vendor[key]?.length ?? 0) > 0)) {
    for (const key of vendorEvKeys) delete vendor[key];
    const reason =
      "vendor pre-baked EV/EBITDA and EV/sales history is built on the vendor's lease-INCLUSIVE enterprise value, " +
      "while the current EV removes the operating-lease liability — the vendor EV bands are withheld rather than ranking the current multiple inside a differently-defined distribution";
    notes.push(reason);
    gaps.push(gapEntry("valuation.multiples.ownHistory.evLeaseBasis", reason, "info"));
  }
  // The current FFO has component adjustments (gains, impairments or real-estate-only
  // D&A) while the history can only be net income + D&A: withhold the FFO
  // bands rather than rank two definitions against each other (the same rule
  // the lease basis applies to EV above).
  const ffoKeys: readonly MultipleKey[] = ["priceToFfo", "priceToAffo"];
  if (route === "reit" && inputs.ffoHistoryComparable === false) {
    const reason =
      "the current FFO uses a component-adjusted reconstruction (property-sale gains, impairments or real-estate-only depreciation netted, on the latest fiscal year; ownership reconciliation remains unavailable) " +
      "while the own-history series can only be rebuilt as net income + D&A per rolling four quarters — the P/FFO and P/AFFO bands are withheld " +
      "rather than ranking one definition inside a history built on another";
    for (const key of ffoKeys) {
      delete derived.series[key];
      delete vendor[key];
    }
    notes.push(`own-history FFO basis: ${reason}`);
    gaps.push(gapEntry("valuation.multiples.ownHistory.ffoBasis", reason, "info"));
  }
  if (route === "reit" && inputs.affoHistoryComparable !== true) {
    const reason = "The current AFFO construction is not established as net income + total income-statement D&A - all capital expenditure. Recurring-capex/rent or FFO adjustments cannot be ranked against the historical all-capex construction; P/AFFO own-history ranking is withheld independently of P/FFO.";
    delete derived.series.priceToAffo;
    delete vendor.priceToAffo;
    notes.push(reason);
    gaps.push(gapEntry("valuation.multiples.ownHistory.affoBasis", reason, "info"));
  }
  const historyKeys: readonly MultipleKey[] = [
    ...DERIVED_HISTORY_KEYS,
    "priceToTbv",
    "priceToFfo",
    "priceToAffo",
  ];
  if (requiresHistoricalClassScope) {
    for (const key of historyKeys) delete vendor[key];
    const reason = "Current issuer-common capitalization resolves economic classes. Historical numerators require each market day's own sourced price/currency and effective inventory filed by that day; unproven rows and vendor aggregate fallback are withheld, and today's counts are never applied to the past. Current P/E from price/EPS requires historical quoted-unit EPS evidence; historical capitalization/common-income P/E is a different construction and is withheld when equivalence is not established.";
    notes.push(reason);
    gaps.push(gapEntry("valuation.multiples.ownHistory.economicClassBasis", reason, "warn"));
  }
  let usedVendor = false;
  for (const key of historyKeys) {
    const ownValues = derived.series[key];
    const vendorValues = vendor[key];
    if ((ownValues?.length ?? 0) >= MIN_HISTORY_OBS_FOR_BAND) {
      history[key] = ownValues;
      historyDetails[key] = derived.details[key];
      historyBasisByKey[key] =
        derivedBasis +
        (requiresHistoricalClassScope && key === "peTtm" && price !== null && eps !== null
          ? ". P/E construction: historical quoted price / sum of four quoted-unit diluted EPS observations; capitalization/common-income P/E is not substituted" : "") +
        (removeOperatingLease && vendorEvKeys.includes(key)
          ? ". Each historical enterprise value removes that quarter's OWN operating-lease liability, the same adjustment the current EV carries"
          : "") +
        (ffoKeys.includes(key)
          ? ". FFO per window = net income + income-statement D&A over four quarters (AFFO = FFO − |capex|); the current figure is the latest fiscal year's on the same construction"
          : "");
    } else if ((vendorValues?.length ?? 0) >= MIN_HISTORY_OBS_FOR_BAND) {
      history[key] = vendorValues;
      const vendorField: Partial<Record<MultipleKey, keyof VendorMultiplesRow>> = { evToSales: "evToSales", evToEbitda: "evToEBITDA", peTtm: "priceToEarningsRatio", priceToBook: "priceToBookRatio", priceToFcf: "priceToFreeCashFlowRatio" };
      const field = vendorField[key];
      historyDetails[key] = (inputs.keyMetricsHistory ?? []).flatMap(row => {
        const value = field ? row[field] : undefined;
        return typeof value === "number" && Number.isFinite(value) && value > 0 ? [{ periodEnd: row.date, marketDate: null, value, source: "vendor-ratio" as const }] : [];
      }).slice(0, FULL_OWN_HISTORY_OBS);
      historyBasisByKey[key] = vendorBasis;
      usedVendor = true;
    }
  }
  if (usedVendor) {
    notes.push("own-history bands built from vendor pre-baked multiples (raw derivation unavailable)");
  }
  if (!historyKeys.some((key) => (history[key]?.length ?? 0) >= MIN_HISTORY_OBS_FOR_BAND)) {
    if (!priceCurrency.comparable && (inputs.keyMetricsHistory?.length ?? 0) > 0) {
      notes.push(`vendor pre-baked multiple history skipped: ${priceCurrency.reason}`);
    }
    gaps.push(gapEntry("valuation.multiples.ownHistory", `insufficient history (need ≥${MIN_HISTORY_OBS_FOR_BAND} quarters) to rank the current multiple among the issuer's own quarters (window up to 5y)`, "info"));
  }

  // --- Assemble ---------------------------------------------------------------
  const universalKeys: MultipleKey[] = ["peTtm", "evToEbitda", "evToSales", "priceToFcf", "priceToBook", "priceToTbv"];
  const keys: MultipleKey[] =
    route === "reit" ? [...universalKeys, "priceToFfo", "priceToAffo"] : universalKeys;
  // Honest period labels: when TTM was suppressed upstream (incomplete
  // quarterly data) the income/cash-flow slice is the latest ANNUAL row — the
  // multiples table must say so instead of claiming "(TTM)".
  const incomeBasisLabel =
    inputs.incomeTtm?.basis === "annual"
      ? `latest annual FY ${inputs.incomeTtm.date} — TTM suppressed`
      : "TTM";
  const cashFlowBasisLabel =
    inputs.cashFlowTtm?.basis === "annual"
      ? `latest annual FY ${inputs.cashFlowTtm.date} — TTM suppressed`
      : "TTM";
  const incomePeriod = inputs.incomeTtm === null || inputs.incomeTtm === undefined || inputs.incomeTtm.date === "" ? undefined : period(inputs.incomeTtm);
  if (inputs.incomeTtm?.basis === "annual") {
    notes.push(
      "income-derived multiples use the latest ANNUAL statement — TTM was suppressed (incomplete quarterly data)",
    );
  }
  if (inputs.cashFlowTtm?.basis === "annual") {
    notes.push(
      "cash-flow-derived multiples use the latest ANNUAL statement — TTM was suppressed (incomplete quarterly data)",
    );
  }
  // Honest balance-period label (2026-07-09 audit M4): say WHICH balance row
  // anchors the point-in-time multiples instead of a vague "(latest)".
  const balanceBasisLabel =
    bal?.basis === "quarter"
      ? `latest quarterly balance sheet ${bal.date}`
      : bal?.basis === "annual"
        ? `latest annual balance sheet ${bal.date}`
        : "latest";
  const basisByKey: Record<MultipleKey, string> = {
    peTtm: (price !== null && eps !== null
      ? `${epsBasis} (${incomeBasisLabel})`
      : `marketCap / common income (${incomeBasisLabel}; ${capital.incomeBasis}); diluted EPS not used: ${price === null ? "no quote price" : epsUnused}`) +
      (price !== null && eps !== null && inc?.basis !== "annual" && inc?.epsDilutedBasis === "sum-quarterly-diluted-eps"
        ? ". EPS convention: sum of four reported quarterly diluted EPS observations; annual or year-to-date GAAP diluted EPS is not reconstructed. Share-count changes and period-specific anti-dilution can make the results differ; a common split basis is not independently verified by this sum."
        : ""),
    evToEbitda: `EV / (operatingIncome + D&A), ${incomeBasisLabel}-computed — vendor ebitda field not trusted. ${evBridgeBasis} Balance basis: ${balanceBasisLabel}.` +
      (ebitdaLowerBound === null ? "" : ` ${ebitdaLowerBound}.`),
    evToSales: `EV / revenue (${incomeBasisLabel}). ${evBridgeBasis}`,
    priceToFcf:
      `marketCap / (operatingCashFlow + capitalExpenditure) (${cashFlowBasisLabel}; FMP capex negative) — free cash flow BEFORE ` +
      "stock-based compensation, the vendor convention, which is also the basis of the own-history distribution this multiple is " +
      "ranked in. The capital block's house-default free cash flow subtracts SBC and is a DIFFERENT figure; the two are never mixed (WS6 review, SHOULD-FIX 4)",

    priceToBook: `marketCap / common equity (${balanceBasisLabel}; ${capital.equityBasis}); carrying parent common-equity measure: repurchases and omitted internally generated intangibles can limit comparison; this ratio does not independently establish expensiveness`,
    priceToTbv: `marketCap / (common equity - goodwill - intangibleAssets) (${balanceBasisLabel}; ${capital.equityBasis}; undisclosed preferred assumed zero only when no material preferred amount is known)`,
    priceToFfo: "marketCap / FFO (approx., caller-provided)",
    priceToAffo: "marketCap / AFFO (rough, caller-provided)",
  };
  const multiples: MultipleStat[] = keys.map((key) => {
    if (ffoSubmapUndetermined && (key === "priceToFfo" || key === "priceToAffo")) {
      return { key, current: null, basis: ffoSubmapReason, ownHistory: null, peers: null };
    }
    if (financialsRoute && (key === "priceToFcf" || key === "evToEbitda" || key === "evToSales")) {
      return { key, current: null, basis: "Not applicable to financial companies: debt is an operating input and industrial free cash flow is not meaningful.", ownHistory: null, peers: null };
    }
    if (key === "priceToFcf" && parentFcfScope) {
      return { key, current: null, basis: `${basisByKey[key]}. ${parentFcfScope}`, ownershipScope: parentFcfScope,
        ownHistory: null, peers: null };
    }
    const cur = current[key] ?? null;
    const comparison = comparablePeers(inputs.subjectEconomicEvidence, inputs.peers ?? [], key, inputs.peerComparisonAsOf ?? null);
    if (comparison.excluded.length) {
      const disclosure = `${key}: economic/accounting comparability excluded ${comparison.excluded.map((peer) => `${peer.symbol} (${peer.reasons.join("; ")})`).join(", ")}; raw peer observations retained; no median uses excluded rows`;
      notes.push(disclosure);
      gaps.push(gapEntry(`valuation.multiples.peers.${key}.comparability`, disclosure, "info"));
    }
    // A median that rests on the screen alone says so beside itself.
    for (const caveat of comparison.caveats) {
      notes.push(caveat);
      gaps.push(gapEntry(`valuation.multiples.peers.${key}.comparabilityCaveat`, caveat, "info"));
    }
    return {
      key,
      current: cur,
      basis: basisByKey[key],
      ...(key === "priceToFcf" && historicalFcfScope ? { basis: `${basisByKey[key]}. ${historicalFcfScope}`, historyScope: historicalFcfScope } : {}),
      ...(key === "evToEbitda" && ebitdaLowerBound !== null && cur !== null ? { ebitdaLowerBound: { basis: ebitdaLowerBound } } : {}),
      ...(incomePeriod !== undefined && (key === "peTtm" || key === "evToEbitda" || key === "evToSales") ? { period: incomePeriod } : {}),
      ownHistory: priceCurrency.comparable && marketCapSecurityKnown
        ? bandFor(history[key], cur, historyBasisByKey[key] ?? "no usable multiple history", historyDetails[key])
        : null,
      peers: peerStats(comparison.eligible.map((p) => p.multiples[key]), notes, key),
    };
  });
  // AMZN audit 2026-10-20: GAAP earnings can be carried by gains below
  // operating income (Amazon's TTM pre-tax income included about $80B of
  // investment gains, so its P/E read 21x against roughly 40x on operating
  // earnings). The P/E is still shown, flagged, and is not ranked.
  const pretaxTtm = inc?.incomeBeforeTax ?? null;
  const operatingTtm = inc?.operatingIncome ?? null;
  if (isNum(pretaxTtm) && pretaxTtm > 0 && isNum(operatingTtm)) {
    const share = (pretaxTtm - operatingTtm) / pretaxTtm;
    const pe = multiples.find((m) => m.key === "peTtm");
    if (pe !== undefined && pe.current !== null && share > GAIN_INFLATED_NON_OPERATING_SHARE) {
      const basis = `pre-tax income ${fmtNum(pretaxTtm)} (${incomeBasisLabel}) includes non-operating income of ${fmtNum(pretaxTtm - operatingTtm)}, ` +
        `${fmtNum(share * 100)}% of pre-tax income (above ${GAIN_INFLATED_NON_OPERATING_SHARE * 100}%): the P/E rests on earnings that gains, not operations, carry, ` +
        "so it is not ranked against its own history";
      pe.gainInflatedEarnings = { nonOperatingSharePct: share * 100, basis };
      notes.push(`peTtm: ${basis}.`);
    }
  }
  // WS6 (D-19): state N per multiple. The report's multiples table carries the
  // rank but not the window size, so the sentence that makes the number
  // readable - "rank among N quarters", never "percentile" - is published here.
  for (const m of multiples) {
    const band = m.ownHistory;
    if (band === null) continue;
    if (band.percentileRank === null) {
      notes.push(`${m.key}: own-history empirical percentile rank (${band.observations} observations) unavailable; ${percentileRank(history[m.key] ?? [], history[m.key]?.[0] ?? NaN) === null ? "flat history is uninformative" : "current multiple is unavailable"}, so no own-history grade signal is available.`);
      continue;
    }
    notes.push(
      `${m.key}: own-history empirical percentile rank ${fmtNum(band.percentileRank)} on a 0-100 scale, based on ${band.observations} observations. ` +
        "This is a relative position in the retained sample, not an ordinal quarter rank; input comparability and the small sample limit interpretation.",
    );
  }

  // Negative denominators were already nulled via posOrNull; belt-and-braces:
  for (const m of multiples) {
    if (m.current !== null && m.current <= 0) {
      m.current = null;
      // The own-history rank was computed from this value before it was ruled
      // not-meaningful, so it must go too — otherwise the report shows a
      // rank (typically 0) for a multiple it prints as n/m. The
      // distribution (p5..p95, observations) is independent of `current` and
      // stays.
      if (m.ownHistory !== null) m.ownHistory = { ...m.ownHistory, percentileRank: null };
      notes.push(`${m.key}: negative/zero multiple rendered n/m`);
    }
  }

  return {
    multiples,
    ...(inputs.peerCoverage ? { peerCoverage: inputs.peerCoverage } : {}),
    enterpriseValue,
    sectorAppropriate: SECTOR_APPROPRIATE_MULTIPLES[route],
    asOf: { quote: null, statements: inc?.date ?? bal?.date ?? null },
    notes,
    gaps,
  };
}

// ---------------------------------------------------------------------------
// Excess-return model (banks / insurers) — Damodaran equity-only model
// ---------------------------------------------------------------------------

export interface ExcessReturnInputs {
  /** BV0: equity on the same ownership/asset basis as currentRoePct. */
  bookValue: number | null;
  /** Production financial routes value only the equity belonging to common holders. */
  bookValueBasis?: "tangible-common-equity" | "common-equity";
  /** Current ROE, percent — TTM unless `currentRoeBasis` says otherwise. */
  currentRoePct: number | null;
  /**
   * Which figure `currentRoePct` actually is. The keyless path has no FMP
   * key-metrics-TTM row and falls back to the latest fiscal-year DuPont ROE
   * (net income / average fiscal-year equity), so the printed assumption must
   * not keep calling that "TTM ROE". Defaults to `"ttm"`.
   */
  currentRoeBasis?: "ttm" | "fiscal-year-dupont" | "fiscal-year-rote" | "fiscal-year-common-roe" | "ttm-rote" | "ttm-common-roe";
  /** Fiscal-year end for any annual return basis; the window's end for a trailing one. */
  currentRoeAsOf?: string | null;
  /**
   * Audit 2026-10-22 C-10: the fiscal-year start the model did not use, when it
   * starts from the trailing four quarters. It is valued with the same fade,
   * terminal target and payout from its own fiscal-year book value, and shown
   * beside the headline when the two starts differ by more than
   * EXCESS_RETURN_START_GAP_PP.
   */
  startAlternative?: {
    roePct: number;
    basis: "fiscal-year-rote" | "fiscal-year-common-roe";
    asOf: string | null;
    bookValue: number;
  } | null;
  /**
   * Optional caller override of the TERMINAL ROE (percent). Without an override,
   * the terminal target follows roeHistory's evidenced-excess convention, or
   * defaults to cost of equity when that evidence is absent or insufficient.
   * Production supplies history rather than an analyst override (compute.ts).
   */
  analystImpliedRoePct?: number | null;
  /**
   * Cost of equity, percent. Null (e.g. risk-free-rate fetch failed upstream)
   * SUPPRESSES the model with a critical gap — a discount rate is never
   * defaulted (2026-07-09 audit M5; mirrors the DCF's WACC guard).
   */
  costOfEquityPct: number | null;
  /** Explicit horizon; default 10. */
  years?: number;
  /** Dividend + buyback payout as % of net income; missing history suppresses. */
  payoutRatioPct?: number | null;
  dilutedShares?: number | null;
  /** Reverse-solve target (market cap in same currency units as bookValue). */
  marketCap?: number | null;
  asOf?: string | null;
  /**
   * WS5: tangible common equity (equity − goodwill − other intangibles −
   * preferred) for the P/TBV-against-ROTE pairing. Optional; without it the
   * pairing is withheld with a reason rather than falling back to plain book
   * value, which would flatter a goodwill-heavy acquirer.
   */
  tangibleCommonEquity?: number | null;
  /** WS5: return on tangible common equity, percent — the return P/TBV is read against. */
  rotePct?: number | null;
  /**
   * Risk-free rate, percent, for the sustainable-growth cap in the justified
   * P/TBV cross-check. The house rule (same one the DCF terminal value obeys)
   * is that nothing grows faster than the risk-free rate forever, so
   * g = min(ROTE x retention, TERMINAL_G_CAP_PCT, riskFree). When it is absent
   * the cap falls back to TERMINAL_G_CAP_PCT alone and the basis says so — no
   * rate is ever invented.
   */
  riskFreePct?: number | null;
  /**
   * Fiscal-year history of the SAME return `currentRoePct` measures (ROTE for
   * banks, common ROE otherwise), each year against that year's own cost of
   * equity in `waccPct`. When supplied, the DCF's terminal excess-return house
   * convention (`terminalRoic`) applies to the fade target: a return that beat
   * the cost of equity in every one of the last 4+ years keeps half its median
   * spread (capped at 5pp) in perpetuity. Absent, ROE fades to the cost of
   * equity exactly as before.
   */
  roeHistory?: DcfRoicYear[] | null;
}

/** WS5: the multiple a financial's price is actually read on, beside the return that justifies it. */
export interface PriceToTangibleBookVsRote {
  /** market cap / tangible common equity. */
  pTbv: number | null;
  /** Return on tangible common equity, percent. */
  rotePct: number | null;
  /**
   * A STABLE-GROWTH cross-check: (ROTE − g) / (CoE − g), the Gordon-form
   * justified multiple, with g = min(ROTE × retention, the terminal-growth cap,
   * the risk-free rate). It is NOT the forward excess-return model read as a
   * multiple: that model follows its evidenced terminal target and separately
   * disclosed continuing value, while this identity assumes a constant ROTE in
   * perpetuity. The two rest on different assumptions and can disagree; the
   * basis string says so. Null when the identity does not hold.
   */
  justifiedPTbv: number | null;
  /** pTbv − justifiedPTbv; positive = the market pays more than the return supports. */
  premiumToJustified: number | null;
  basis: string;
  /** Non-null when the pairing (or the justified multiple) was withheld. */
  withheldReason: string | null;
}

/** Audit 2026-10-22 C-10: the excess-return value from the start the model did not use. */
export interface ExcessReturnStartAlternative {
  basis: "fiscal-year-rote" | "fiscal-year-common-roe";
  asOf: string | null;
  startRoePct: number;
  bookValue: number;
  equityValue: number;
  perShare: number | null;
  /** Alternative start minus the start used, percentage points. */
  differencePp: number;
  /** True when |differencePp| > EXCESS_RETURN_START_GAP_PP: the value is printed beside the headline. */
  besideHeadline: boolean;
  /** e.g. "FY 2025-12-31 ROTE start 4.2%". */
  label: string;
}

/**
 * Audit 2026-10-22 C-11: per-share value for three starting returns against
 * the cost of equity ±1pp. Each row carries the book value it starts from; the
 * centre cell is the headline.
 */
export interface ExcessReturnGrid {
  rows: { label: string; startReturnPct: number; bookValue: number }[];
  costOfEquityPcts: number[];
  perShare: (number | null)[][];
  notes: string[];
}

/** Rows of the C-11 grid without a fiscal-year alternative: the start, and this many pp either side. */
export const EXCESS_RETURN_GRID_START_STEP_PP = 5;
/** Columns of the C-11 grid: the cost of equity, and this many pp either side. */
export const EXCESS_RETURN_GRID_COE_STEP_PP = 1;

export interface ExcessReturnResult {
  equityValue: number | null;
  perShare: number | null;
  /** equityValue / BV0 — sanity anchor vs (ROE - g)/(CoE - g). */
  impliedPToBv: number | null;
  roePathPct: Assumption<number[]>;
  payoutRatioPct: Assumption<number | null>;
  /** WS5: the explicit horizon the excess returns are summed over. */
  horizonYears: Assumption<number>;
  /** WS5: the discount rate — the cost of EQUITY, never a WACC. */
  costOfEquityPct: Assumption<number | null>;
  /** WS5: opening book equity the model builds on. */
  openingBookValue: Assumption<number | null>;
  /** WS5: P/TBV against ROTE — the pairing a financial is actually judged on. */
  priceToTangibleBookVsRote: PriceToTangibleBookVsRote;
  /** BV_0 .. BV_N under retention compounding. */
  bookValuePath: number[];
  /**
   * Year-N economic profit in currency: (ROE_N − CoE) · BV_{N-1}. Zero when ROE
   * fades to CoE (the default); nonzero when `roeHistory` evidences durable
   * excess returns or a caller overrides the terminal ROE via
   * analystImpliedRoePct. Computed, never assumed.
   */
  terminalExcess: number | null;
  /** Additive: legacy objects may not retain these forward parameters. */
  financialAssumptions?: FinancialValuationAssumptions;
  reverseSolve: { impliedCurrentRoePct: number | null; notes: string[] };
  /** Audit 2026-10-22 C-10: present when the model started from the trailing four quarters and a fiscal-year start exists. */
  startAlternative?: ExcessReturnStartAlternative;
  /** Audit 2026-10-22 C-11: start-return × cost-of-equity sensitivity; absent without a per-share denominator. */
  startCoeGrid?: ExcessReturnGrid;
  asOf: string | null;
  notes: string[];
  gaps: ManifestEntry[];
}

/**
 * Audit 2026-10-22 C-10 follow-through (owner decision, D-102): the payout the
 * continuing value assumes. Residual income growing at g needs book growing at
 * g, a retention of g / ROE_T, so the steady-state payout is 1 − g / ROE_T
 * (Damodaran's stable-growth consistency), clamped to 0-100%. A terminal
 * return at or below zero funds no payout.
 */
export function steadyStatePayoutPct(terminalRoePct: number, gPct: number): number {
  if (terminalRoePct <= 0) return 0;
  return Math.min(100, Math.max(0, (1 - gPct / terminalRoePct) * 100));
}

/**
 * Core: BV_t = BV_{t-1}(1 + ROE_t * retention_t); value = BV0 + sum PV(excess),
 * plus — only when evidenced excess returns are carried past the horizon — the
 * continuing value of the year-N+1 residual income growing at g:
 * CV_N = (ROE_T − CoE) · BV_N / (CoE − g), discounted N years. The payout is
 * given per year (it fades to the steady state).
 */
function excessReturnValue(
  bv0: number,
  roePathPct: number[],
  coePct: number,
  payoutPathPct: number[],
  continuing: { excessPp: number; gPct: number } | null = null,
): { equityValue: number; bookValuePath: number[]; continuingValuePv: number } {
  const coe = coePct / 100;
  const bookValuePath: number[] = [bv0];
  let bv = bv0;
  let pvExcess = 0;
  for (let t = 1; t <= roePathPct.length; t++) {
    const roe = roePathPct[t - 1] / 100;
    const retention = 1 - payoutPathPct[t - 1] / 100;
    const excess = (roe - coe) * bv;
    pvExcess += excess / Math.pow(1 + coe, t);
    // A LOSS is retained in full. `roe * retention` on a negative ROE returns a
    // fraction of the loss to book value — arithmetically a capital injection
    // proportional to the loss, because `payout x negative earnings` is a
    // negative dividend. Dividends are not negative; a loss reduces book value
    // by its whole amount. Only positive earnings are shared with holders.
    const bvGrowth = roe < 0 ? roe : roe * retention;
    bv = bv * (1 + bvGrowth);
    bookValuePath.push(bv);
  }
  let continuingValuePv = 0;
  if (continuing !== null && continuing.excessPp > 0) {
    const n = roePathPct.length;
    const cv = ((continuing.excessPp / 100) * bv) / (coe - continuing.gPct / 100);
    continuingValuePv = cv / Math.pow(1 + coe, n);
  }
  return { equityValue: bv0 + pvExcess + continuingValuePv, bookValuePath, continuingValuePv };
}

/**
 * Excess-return equity model for banks/insurers (NO WACC, NO FCFF anywhere):
 * EquityValue = BV0 + sum_t (ROE_t - CoE) * BV_{t-1} / (1 + CoE)^t, with ROE
 * fading from the current return to its terminal target. The target is the
 * cost of equity (zero terminal excess) unless `roeHistory` evidences durable
 * excess returns, in which case the DCF's own house convention applies: half
 * the median spread (capped at 5pp) persists, valued as a growing perpetuity
 * past the horizon. Before this, the DCF carried evidenced excess and this
 * model did not, so every high-ROTE bank was valued as if its returns
 * collapsed by year 10 (a 2026-10-12 sweep graded JPM, BAC, WFC and C all F on
 * valuation; JPM's price "required" a 54% starting ROTE). A caller MAY override the terminal ROE
 * (analystImpliedRoePct) to assert persistent excess; the override is reflected
 * honestly in `terminalExcess` and the basis string. Also reverse-solves the
 * constant steady-state ROE that reproduces the current market cap.
 */
/**
 * WS5: P/TBV read against ROTE — the pair a bank, insurer or mortgage REIT is
 * actually judged on, and the one the route's `lead` list has named all along.
 *
 * Tangible common equity is the denominator, not book equity: goodwill and
 * other intangibles absorb losses only after common equity is gone, so a
 * goodwill-heavy acquirer trading at 1.0x BOOK can be at 2.0x tangible book,
 * and comparing that multiple against a return computed on tangible equity
 * (ROTE) would be comparing two different denominators.
 *
 * The justified multiple is a STABLE-GROWTH cross-check, (ROTE − g) / (CoE − g)
 * — the Gordon form of the residual-income identity, which assumes a constant
 * ROTE in perpetuity. The forward model above assumes the opposite: ROE fades
 * to the cost of equity over the horizon and no continuing value is added. So
 * the two readings rest on DIFFERENT assumptions and can legitimately disagree,
 * and the basis string says which is which rather than claiming they cannot.
 *
 * `g` obeys the same house rule the DCF terminal value obeys — nothing grows
 * faster than the risk-free rate forever — so it is capped at
 * min(ROTE × retention, TERMINAL_G_CAP_PCT, risk-free). Uncapped, a bank at
 * ROTE 14% with a one-third payout implied g = 9.4% and a justified multiple of
 * 7.45x against a forward-model reading of 1.18x, which made every well-earning
 * financial look grossly cheap against its own pipeline fair value.
 *
 * The multiple is withheld — never clamped — when CoE − g is not comfortably
 * positive, because the ratio explodes through infinity there and any number it
 * produced would be an artefact of the arithmetic rather than a valuation.
 */
export const JUSTIFIED_PTBV_MIN_SPREAD_PP = 0.5;

function priceToTangibleBookVsRote(
  inputs: ExcessReturnInputs,
  coePct: number | null,
  payoutPct: number | null,
): PriceToTangibleBookVsRote {
  const tce = posOrNull(inputs.tangibleCommonEquity);
  const mcap = posOrNull(inputs.marketCap);
  const rotePct = isNum(inputs.rotePct) ? inputs.rotePct : null;
  const empty = (reason: string, basis: string): PriceToTangibleBookVsRote => ({
    pTbv: null,
    rotePct,
    justifiedPTbv: null,
    premiumToJustified: null,
    basis,
    withheldReason: reason,
  });

  if (tce === null) {
    return empty(
      "tangible common equity unavailable or not positive — P/TBV withheld rather than substituting book equity, which would flatter a goodwill-heavy balance sheet",
      "market cap / tangible common equity, against return on tangible common equity",
    );
  }
  if (mcap === null) {
    return empty(
      "market cap unavailable — P/TBV not computable",
      "market cap / tangible common equity, against return on tangible common equity",
    );
  }
  const pTbv = mcap / tce;

  if (rotePct === null || coePct === null || payoutPct === null) {
    const missing =
      rotePct === null
        ? "return on tangible common equity"
        : coePct === null
          ? "cost of equity"
          : "payout history (needed for the retention rate in g)";
    return {
      pTbv,
      rotePct,
      justifiedPTbv: null,
      premiumToJustified: null,
      basis: `P/TBV = market cap ${mcap} / tangible common equity ${tce} = ${fmtNum(pTbv)}x`,
      withheldReason: `${missing} unavailable — the justified multiple (ROTE − g)/(CoE − g) was not computed, so the multiple is shown without the return that would justify it`,
    };
  }

  const retention = 1 - payoutPct / 100;
  const gSustainable = (rotePct / 100) * retention * 100;
  // House rule, the same one the DCF terminal value obeys: nothing grows faster
  // than the risk-free rate forever. Uncapped, g = ROTE x retention routinely
  // lands above the cost of equity for a profitable bank, which either withheld
  // the multiple or (just under the floor) published a very large one.
  const rf = isNum(inputs.riskFreePct) ? inputs.riskFreePct : null;
  const gCap = rf === null ? TERMINAL_G_CAP_PCT : Math.min(TERMINAL_G_CAP_PCT, rf);
  const gCapBasis =
    rf === null
      ? `min(ROTE x retention, ${TERMINAL_G_CAP_PCT}% terminal-growth cap) — no risk-free rate supplied, so the cap rests on the house terminal-growth ceiling alone`
      : `min(ROTE x retention, ${TERMINAL_G_CAP_PCT}% terminal-growth cap, risk-free ${fmtNum(rf)}%) — house rule: nothing grows faster than rf forever`;
  const g = Math.min(gSustainable, gCap);
  const gCapped = g < gSustainable;
  const spread = coePct - g;
  if (spread < JUSTIFIED_PTBV_MIN_SPREAD_PP) {
    return {
      pTbv,
      rotePct,
      justifiedPTbv: null,
      premiumToJustified: null,
      basis:
        `P/TBV = market cap ${mcap} / tangible common equity ${tce} = ${fmtNum(pTbv)}x, against ROTE ${fmtNum(rotePct)}%`,
      withheldReason:
        `growth g = ${fmtNum(g)}% (${gCapped ? `ROTE ${fmtNum(rotePct)}% x retention ${fmtNum(retention * 100)}% = ${fmtNum(gSustainable)}%, capped by ${gCapBasis}` : `ROTE ${fmtNum(rotePct)}% x retention ${fmtNum(retention * 100)}%, below ${gCapBasis}`}) ` +
        `leaves only ${fmtNum(spread)}pp below the cost of equity ${fmtNum(coePct)}% (floor ${JUSTIFIED_PTBV_MIN_SPREAD_PP}pp) — ` +
        "the justified multiple (ROTE − g)/(CoE − g) diverges there, so it is withheld rather than reported as a very large number",
    };
  }
  const justifiedPTbv = (rotePct - g) / spread;
  return {
    pTbv,
    rotePct,
    justifiedPTbv,
    premiumToJustified: pTbv - justifiedPTbv,
    basis:
      `P/TBV = market cap ${mcap} / tangible common equity ${tce} = ${fmtNum(pTbv)}x, against ROTE ${fmtNum(rotePct)}%. ` +
      `Justified P/TBV = (ROTE ${fmtNum(rotePct)}% − g ${fmtNum(g)}%) / (CoE ${fmtNum(coePct)}% − g ${fmtNum(g)}%) = ` +
      `${fmtNum(justifiedPTbv)}x, where g = ${gCapped ? `${gCapBasis} (ROTE x retention ${fmtNum(retention * 100)}% = ${fmtNum(gSustainable)}%, capped)` : `ROTE x retention ${fmtNum(retention * 100)}% = ${fmtNum(gSustainable)}%, within ${gCapBasis}`}. ` +
      "This is a STABLE-GROWTH cross-check: it assumes ROTE persists in perpetuity. The forward excess-return " +
      "model uses its separately disclosed ROE path and continuation assumptions. The two rest " +
      "on different assumptions and can disagree — read the difference as the value of persistence, not as an error.",
    withheldReason: null,
  };
}

export function excessReturnModel(inputs: ExcessReturnInputs): ExcessReturnResult {
  const notes: string[] = [];
  const gaps: ManifestEntry[] = [];
  const years = inputs.years ?? EXCESS_RETURN_YEARS;
  const reverseNotes: string[] = [];
  // WS5: the horizon, the discount rate and the opening book value are printed
  // as assumptions in their own right — the model's shape was previously only
  // inferable from the ROE-path basis string.
  // The fade target is the cost of equity ONLY when no caller overrides the
  // terminal ROE. Stating "so the year-N excess is zero" unconditionally would
  // contradict a non-zero `terminalExcess` whenever one did — latent today
  // (production supplies no override) but a false sentence either way, and the
  // adjacent note already branches.
  const terminalOverridePct = isNum(inputs.analystImpliedRoePct) ? inputs.analystImpliedRoePct : null;
  const horizonBasis = (built: boolean): string =>
    built
      ? `explicit ${years}-year horizon: the excess return (ROE − cost of equity) x prior-year book equity is ` +
        `discounted year by year to year ${years}. ROE is faded LINEARLY to ` +
        (terminalOverridePct === null
          ? "the cost of equity over exactly that horizon, so the year-N excess is zero and NO continuing value is added beyond it."
          : `a caller-supplied terminal ROE of ${fmtNum(terminalOverridePct)}% over exactly that horizon — NOT to the cost of equity — so the year-N excess is NOT zero (it is reported as terminalExcess), and NO continuing value is added beyond it.`)
      : `explicit ${years}-year horizon (model not built)`;
  const coeSupplied = isNum(inputs.costOfEquityPct) ? inputs.costOfEquityPct : null;
  const unbuiltAssumptions = {
    horizonYears: { value: years, basis: horizonBasis(false) },
    costOfEquityPct: {
      value: coeSupplied,
      basis:
        coeSupplied === null
          ? "not supplied — the model is suppressed rather than discounting at a defaulted rate"
          : `cost of equity ${fmtNum(coeSupplied)}% (CAPM, upstream); the model never uses a WACC`,
    },
    openingBookValue: {
      value: posOrNull(inputs.bookValue),
      basis:
        posOrNull(inputs.bookValue) === null
          ? "totalStockholdersEquity missing or non-positive"
          : "latest total stockholders' equity (BV0)",
    },
    priceToTangibleBookVsRote: priceToTangibleBookVsRote(inputs, coeSupplied, null),
  } satisfies Pick<
    ExcessReturnResult,
    "horizonYears" | "costOfEquityPct" | "openingBookValue" | "priceToTangibleBookVsRote"
  >;

  // 2026-07-09 audit M5: a null cost of equity used to be silently defaulted to
  // 10% upstream. Suppress instead — the discount rate is load-bearing, exactly
  // like the DCF path's WACC guard.
  if (!isNum(inputs.costOfEquityPct)) {
    gaps.push(
      gapEntry(
        "valuation.excessReturn.costOfEquity",
        "cost of equity unavailable (risk-free rate / CAPM inputs missing upstream) — excess-return valuation suppressed rather than defaulting a discount rate",
        "critical",
      ),
    );
    return {
      equityValue: null,
      perShare: null,
      impliedPToBv: null,
      roePathPct: { value: [], basis: "not built (no cost of equity)" },
      payoutRatioPct: { value: null, basis: "not built (no cost of equity)" },
      bookValuePath: [],
      ...unbuiltAssumptions,
      terminalExcess: null,
      reverseSolve: { impliedCurrentRoePct: null, notes: ["skipped: no cost of equity"] },
      asOf: inputs.asOf ?? null,
      notes,
      gaps,
    };
  }
  const coe = inputs.costOfEquityPct;

  const bv0 = posOrNull(inputs.bookValue);
  if (bv0 === null) {
    gaps.push(
      gapEntry("valuation.excessReturn.bookValue", "totalStockholdersEquity missing or non-positive — excess-return model not computable", "critical"),
    );
    return {
      equityValue: null,
      perShare: null,
      impliedPToBv: null,
      roePathPct: { value: [], basis: "not built (no book value)" },
      payoutRatioPct: { value: null, basis: "not built (no book value)" },
      bookValuePath: [],
      ...unbuiltAssumptions,
      terminalExcess: null,
      reverseSolve: { impliedCurrentRoePct: null, notes: ["skipped: no book value"] },
      asOf: inputs.asOf ?? null,
      notes,
      gaps,
    };
  }

  if (!isNum(inputs.payoutRatioPct)) {
    gaps.push(
      gapEntry(
        "valuation.excessReturn.payout",
        "company payout history unavailable — excess-return valuation suppressed rather than assuming a universal payout ratio",
        "critical",
      ),
    );
    return {
      equityValue: null,
      perShare: null,
      impliedPToBv: null,
      roePathPct: { value: [], basis: "not built (no payout history)" },
      payoutRatioPct: { value: null, basis: "not built (no payout history)" },
      bookValuePath: [],
      ...unbuiltAssumptions,
      terminalExcess: null,
      reverseSolve: { impliedCurrentRoePct: null, notes: ["skipped: no payout history"] },
      asOf: inputs.asOf ?? null,
      notes,
      gaps,
    };
  }
  const payout = clampWithNote(
    inputs.payoutRatioPct,
    PAYOUT_CLAMP_PCT[0],
    PAYOUT_CLAMP_PCT[1],
    "payout ratio (pct)",
    notes,
  );
  const payoutBasis = inputs.bookValueBasis
    ? "caller-provided (common dividends + net common buybacks / income available to common, up to 3-year average; at least 2 usable years upstream)"
    : "caller-provided (dividends + net buybacks / net income, 3y avg upstream)";

  // Competitive fade: ROE fades to the cost of equity by the terminal year, so
  // terminal excess returns are zero — the equity-side analogue of the DCF
  // core's terminal ROIC = WACC. A caller MAY override the terminal ROE
  // (analystImpliedRoePct); that asserts persistent excess and is surfaced
  // honestly below. Production supplies the return history instead; its
  // evidenced-excess convention may carry a continuing value past the horizon.
  if (!isNum(inputs.currentRoePct)) {
    gaps.push(
      gapEntry(
        "valuation.excessReturn.currentRoe",
        "current company ROE unavailable — excess-return valuation suppressed rather than substituting the terminal ROE path",
        "critical",
      ),
    );
    return {
      equityValue: null,
      perShare: null,
      impliedPToBv: null,
      roePathPct: { value: [], basis: "not built (no current ROE)" },
      payoutRatioPct: { value: payout, basis: payoutBasis },
      bookValuePath: [],
      ...unbuiltAssumptions,
      terminalExcess: null,
      reverseSolve: { impliedCurrentRoePct: null, notes: ["skipped: no current ROE"] },
      asOf: inputs.asOf ?? null,
      notes,
      gaps,
    };
  }
  const roeStart = inputs.currentRoePct;
  const overrideTerminal = isNum(inputs.analystImpliedRoePct);
  const retLabel = inputs.currentRoeBasis === "fiscal-year-rote" || inputs.currentRoeBasis === "ttm-rote" ? "ROTE" : "ROE";
  // The DCF's terminal excess-return house convention, on the equity side, as
  // "4 of the last 5 years" with business-combination years set aside (C-10).
  const evidenced =
    !overrideTerminal && inputs.roeHistory != null
      ? terminalRoic(coe, inputs.roeHistory, { ret: retLabel, rate: "cost of equity" }, { rule: "four-of-five" })
      : null;
  if (evidenced?.note) notes.push(evidenced.note);
  if (evidenced?.waccBasisNote) notes.push(evidenced.waccBasisNote);
  // The carried excess is valued as residual income growing at g past the
  // horizon, under the same g cap as the justified-P/TBV cross-check and the
  // same CoE − g guard as the DCF's Gordon terminal value.
  const rfForG = isNum(inputs.riskFreePct) ? inputs.riskFreePct : null;
  const continuingG = rfForG === null ? TERMINAL_G_CAP_PCT : Math.min(TERMINAL_G_CAP_PCT, rfForG);
  let carriedPp = evidenced?.excessPp ?? 0;
  if (carriedPp > 0 && coe - continuingG < TV_GUARD_PP) {
    notes.push(
      `evidenced excess ${retLabel} not carried: cost of equity ${fmtNum(coe)}% leaves less than ${TV_GUARD_PP}pp over the continuing growth ${fmtNum(continuingG)}% (same guard as the DCF terminal value)`,
    );
    carriedPp = 0;
  }
  const continuing = carriedPp > 0 ? { excessPp: carriedPp, gPct: continuingG } : null;
  const endRoe = overrideTerminal ? (inputs.analystImpliedRoePct as number) : coe + carriedPp;
  const endBasis = overrideTerminal
    ? `caller-supplied terminal ROE ${fmtNum(endRoe)}% (persistent excess asserted)`
    : continuing !== null
      ? `${fmtNum(endRoe)}% — ${evidenced!.basis}; carried past year ${years} as residual income growing at ${fmtNum(continuingG)}%`
      : `cost of equity ${fmtNum(coe)}% (competitive fade — zero terminal excess)`;
  const startBasis =
    inputs.currentRoeBasis === "fiscal-year-rote"
      ? `FY ${inputs.currentRoeAsOf ?? "unknown"} ROTE (common earnings / average tangible common equity)`
      : inputs.currentRoeBasis === "fiscal-year-common-roe"
        ? `FY ${inputs.currentRoeAsOf ?? "unknown"} common-equity ROE (common earnings / average common equity)`
        : inputs.currentRoeBasis === "ttm-rote"
          ? `TTM ROTE to ${inputs.currentRoeAsOf ?? "unknown"} (four quarters of common earnings / average tangible common equity)`
          : inputs.currentRoeBasis === "ttm-common-roe"
            ? `TTM common-equity ROE to ${inputs.currentRoeAsOf ?? "unknown"} (four quarters of common earnings / average common equity)`
            : inputs.currentRoeBasis === "fiscal-year-dupont"
      ? `${inputs.currentRoeAsOf != null ? `FY ${inputs.currentRoeAsOf} ` : ""}DuPont ROE`
      : "TTM ROE";
  const roeBasis = `linear fade from ${startBasis} ${fmtNum(roeStart)}% to ${endBasis} by year ${years}`;
  const roePath = fadePath(roeStart, endRoe, years);
  // C-10 follow-through (D-102): the payout fades from the three-year average
  // in year 1 to the steady state of the terminal return in year N, so book
  // grows at g when the continuing value starts. Holding the average flat
  // compounded book at above-cost returns (PGR 6.5x) before the carry applied.
  const payoutPathFor = (terminalRoePct: number): number[] => fadePath(payout, steadyStatePayoutPct(terminalRoePct, continuingG), years);
  const steadyPayout = steadyStatePayoutPct(endRoe, continuingG);
  const payoutPath = payoutPathFor(endRoe);
  const payoutPathBasis =
    `fades linearly from ${fmtNum(payout)}% in year 1 to ${fmtNum(steadyPayout)}% in year ${years}, the steady state ` +
    `1 − g / terminal ROE = 1 − ${fmtNum(continuingG)}% / ${fmtNum(endRoe)}% at which book grows at g (clamped to 0-100%)`;

  const { equityValue, bookValuePath, continuingValuePv } = excessReturnValue(bv0, roePath, coe, payoutPath, continuing);
  const shares = posOrNull(inputs.dilutedShares);
  const perShare = shares !== null ? equityValue / shares : null;
  if (shares === null) {
    gaps.push(gapEntry("valuation.excessReturn.dilutedShares", "diluted shares missing — per-share value unavailable", "info"));
  }
  // C-10: the fiscal-year start, valued with the same fade target, carry and
  // payout from its own book value, so the reader sees what the start choice is worth.
  let startAlternative: ExcessReturnStartAlternative | undefined;
  const alt = inputs.startAlternative;
  if (alt != null && isNum(alt.roePct) && posOrNull(alt.bookValue) !== null) {
    const altValue = excessReturnValue(alt.bookValue, fadePath(alt.roePct, endRoe, years), coe, payoutPath, continuing).equityValue;
    const differencePp = alt.roePct - roeStart;
    const altLabel = `FY ${alt.asOf ?? "unknown"} ${alt.basis === "fiscal-year-rote" ? "ROTE" : "common-equity ROE"} start ${fmtNum(alt.roePct)}%`;
    startAlternative = {
      basis: alt.basis,
      asOf: alt.asOf,
      startRoePct: alt.roePct,
      bookValue: alt.bookValue,
      equityValue: altValue,
      perShare: shares !== null ? altValue / shares : null,
      differencePp,
      besideHeadline: Math.abs(differencePp) > EXCESS_RETURN_START_GAP_PP,
      label: altLabel,
    };
    notes.push(
      `start ${retLabel}: ${startBasis} ${fmtNum(roeStart)}% (newer than the latest fiscal year); the ${altLabel} from book value ${alt.bookValue} ` +
        `would value the equity at ${fmtNum(altValue)}${shares !== null ? ` (${fmtNum(altValue / shares)} per share)` : ""}, ` +
        `${fmtNum(Math.abs(differencePp))}pp ${differencePp < 0 ? "below" : "above"} the start used` +
        (startAlternative.besideHeadline ? ` — more than ${EXCESS_RETURN_START_GAP_PP}pp apart, so it is shown beside the headline (house convention)` : ""),
    );
  }
  // C-11: the start return against the cost of equity. Each column moves the
  // discount rate and the fade target together (the carried excess, if any, is
  // held and passes the same CoE − g guard); each row keeps the headline's
  // horizon and payout. The fiscal-year start, when there is one, replaces the
  // shifted row on its side and starts from its own book value.
  let startCoeGrid: ExcessReturnGrid | undefined;
  if (shares !== null) {
    const step = EXCESS_RETURN_GRID_START_STEP_PP;
    const rows: ExcessReturnGrid["rows"] = [
      { label: `${startBasis.replace(/ \(.*\)$/, "")} ${fmtNum(roeStart - step)}% (headline −${step}pp)`, startReturnPct: roeStart - step, bookValue: bv0 },
      { label: `${startBasis.replace(/ \(.*\)$/, "")} ${fmtNum(roeStart)}% (headline)`, startReturnPct: roeStart, bookValue: bv0 },
      { label: `${startBasis.replace(/ \(.*\)$/, "")} ${fmtNum(roeStart + step)}% (headline +${step}pp)`, startReturnPct: roeStart + step, bookValue: bv0 },
    ];
    if (startAlternative !== undefined) {
      rows[startAlternative.startRoePct < roeStart ? 0 : 2] = {
        label: `${startAlternative.label} (fiscal-year book value)`,
        startReturnPct: startAlternative.startRoePct,
        bookValue: startAlternative.bookValue,
      };
    }
    const evidencedPp = evidenced?.excessPp ?? 0;
    const costOfEquityPcts = [coe - EXCESS_RETURN_GRID_COE_STEP_PP, coe, coe + EXCESS_RETURN_GRID_COE_STEP_PP];
    // Floored at 0 like the published headline (limited liability).
    const cell = (value: number): number | null => (Number.isFinite(value) ? Math.max(0, value) : null);
    const perShareGrid = rows.map((row) => costOfEquityPcts.map((c) => {
      if (c === coe) {
        return cell(excessReturnValue(row.bookValue, fadePath(row.startReturnPct, endRoe, years), coe, payoutPath, continuing).equityValue / shares);
      }
      const carry = evidencedPp > 0 && c - continuingG >= TV_GUARD_PP ? evidencedPp : 0;
      const target = overrideTerminal ? endRoe : c + carry;
      const cont = carry > 0 ? { excessPp: carry, gPct: continuingG } : null;
      return cell(excessReturnValue(row.bookValue, fadePath(row.startReturnPct, target, years), c, payoutPathFor(target), cont).equityValue / shares);
    }));
    startCoeGrid = {
      rows,
      costOfEquityPcts,
      perShare: perShareGrid,
      notes: [
        `rows = starting ${retLabel}; columns = cost of equity ${fmtNum(coe)}% ±${EXCESS_RETURN_GRID_COE_STEP_PP}pp`,
        overrideTerminal
          ? `each cell fades its start linearly over ${years} years to the caller-supplied terminal ROE ${fmtNum(endRoe)}%, discounted at the column's cost of equity`
          : evidencedPp > 0
            ? `each cell fades its start linearly over ${years} years to the column's cost of equity plus the ${fmtNum(evidencedPp)}pp evidenced excess, carried past year ${years} at ${fmtNum(continuingG)}% where the cost of equity clears that growth by ${TV_GUARD_PP}pp`
            : `each cell fades its start linearly over ${years} years to the column's cost of equity (zero terminal excess)`,
        `payout fades from ${fmtNum(payout)}% to each cell's steady state (1 − g / its terminal ROE) by year ${years}; ${startAlternative !== undefined ? "the fiscal-year row starts from its own fiscal-year book value, the others from the headline's opening book value" : `rows other than the headline shift its start by ±${step}pp from the same opening book value`}`,
        "the centre cell is the headline value; a cell below zero is shown as 0, as the headline is",
      ],
    };
  }
  const impliedPToBv = safeDiv(equityValue, bv0);
  if (impliedPToBv !== null && (impliedPToBv > 3 || impliedPToBv < 0.3)) {
    notes.push(`implied P/B ${fmtNum(impliedPToBv)} outside [0.3, 3] sanity band — review assumptions (house-rule flag)`);
  }

  // Reverse solve: the STARTING ROE which, under this model's own competitive
  // fade, reproduces the market cap. Monotone in the starting ROE.
  //
  // It previously held ROE CONSTANT for `years` and then stopped accruing
  // residual income — neither a fade (what the forward model assumes) nor a
  // perpetuity (what "steady state" promises), so it inverted no model at all.
  // Two things make the fade the right choice rather than the Gordon closed
  // form:
  //   - Empirically, ROE mean-reverts toward the cost of capital (Fama-French
  //     2000; Nissim-Penman 2001). A perpetual constant excess ROE is the
  //     assumption the forward path explicitly refuses.
  //   - grading.ts compares this number DIRECTLY against `roePathPct.value[0]`
  //     (the current ROE) at 0.5 weight of the valuation aspect. That
  //     subtraction is only meaningful if both sides are the same quantity —
  //     a starting ROE under identical dynamics. Holding ROE constant made the
  //     solved value systematically LOW (a flat path is worth more than a
  //     fading one, so less ROE was needed to reach the price), which biased
  //     every bank, insurer and mortgage REIT toward "market too pessimistic".
  //
  // A clean property follows: with no carried excess the model returns exactly
  // book value when ROE equals the cost of equity, so an issuer priced at book
  // solves to CoE. The solve fades to the same target and carries the same
  // continuing value as the forward path, so the comparison stays like for like.
  let impliedCurrentRoePct: number | null = null;
  const mcap = posOrNull(inputs.marketCap);
  if (mcap === null) {
    reverseNotes.push("skipped: market cap not provided");
  } else {
    const [lo, hi] = REVERSE_ROE_RANGE_PCT;
    const f = (roe: number): number =>
      // Fade to the SAME terminal target the forward path uses. Hard-wiring CoE
      // here re-opened the apples-to-apples defect this solve exists to close
      // whenever a caller overrode the terminal ROE.
      excessReturnValue(bv0, fadePath(roe, endRoe, years), coe, payoutPath, continuing).equityValue - mcap;
    const fLo = f(lo);
    const fHi = f(hi);
    if (fLo > 0) {
      reverseNotes.push(`market cap below the ${lo}% starting-ROE value — implied ROE < ${lo}%`);
    } else if (fHi < 0) {
      reverseNotes.push(`market cap above the ${hi}% starting-ROE value — implied ROE > ${hi}% (price not justifiable on book returns)`);
    } else {
      const root = bisect(f, { lo, hi, fLo, fHi }, mcap);
      impliedCurrentRoePct = root;
      if (root !== null) {
        reverseNotes.push(`starting ROE fading to ${endBasis} over ${years} years (payout fading ${fmtNum(payout)}% → ${fmtNum(steadyPayout)}%) matching market cap — comparable to the current ROE, same dynamics as the forward path`);
      }
    }
  }

  // Terminal excess = year-N economic profit (ROE_N − CoE)·BV_{N-1}, undiscounted,
  // in currency. Zero by construction when the fade lands on CoE (the default).
  const terminalExcess =
    roePath.length > 0
      ? ((roePath[roePath.length - 1] - coe) / 100) * bookValuePath[bookValuePath.length - 2]
      : 0;
  notes.push(
    overrideTerminal
      ? `excess-return model: equity-only (CoE, never WACC); terminal ROE overridden to ${fmtNum(endRoe)}% — terminal excess ${fmtNum(terminalExcess)} (currency), NOT zero`
      : continuing !== null
        ? `excess-return model: equity-only (CoE, never WACC); ${retLabel} fades to CoE + ${fmtNum(carriedPp)}pp evidenced excess, whose continuing value past year ${years} is ${fmtNum(continuingValuePv)} (currency, present value)`
        : "excess-return model: equity-only (CoE, never WACC); ROE fades to CoE so terminal excess returns = 0",
  );
  // WS5: the P/TBV-against-ROTE pairing, now that the payout (and hence the
  // retention rate inside g) is known.
  const financialAssumptions: FinancialValuationAssumptions = {
    version: "financial-valuation-assumptions-v1", modelKind: "excess-return", horizonYears: years,
    costOfEquityPct: coe, initialCommonBook: bv0, roePathBasis: roeBasis, terminalRoePct: endRoe,
    terminalGrowthPct: continuing === null ? null : continuingG, terminalExcessReturnPp: endRoe - coe,
    continuingValuePv, continuingValueSharePct: equityValue !== 0 ? (continuingValuePv / equityValue) * 100 : null,
    continuingValueBasis: continuing === null
      ? overrideTerminal ? "caller terminal override affects the finite ROE path only; no continuing value was added" : "competitive fade to cost of equity; zero excess returns beyond the horizon"
      : `${evidenced!.basis}; residual income beyond year ${years} = terminal excess return x BV_N / (CoE - growth), discounted ${years} years; growth capped at ${TERMINAL_G_CAP_PCT}%${rfForG === null ? "; risk-free rate unavailable" : ` and risk-free ${fmtNum(rfForG)}%`}`,
    payoutPathPct: payoutPath, steadyStatePayoutPct: steadyPayout, payoutPathBasis,
  };
  const pTbvVsRote = priceToTangibleBookVsRote(inputs, coe, payout);
  pTbvVsRote.basis += ` ${describeFinancialValuation(financialAssumptions)}`;
  if (pTbvVsRote.withheldReason !== null && pTbvVsRote.pTbv === null) {
    gaps.push(
      gapEntry("valuation.excessReturn.priceToTangibleBook", pTbvVsRote.withheldReason, "info"),
    );
  }
  return {
    equityValue,
    perShare,
    impliedPToBv,
    roePathPct: { value: roePath, basis: roeBasis },
    payoutRatioPct: { value: payout, basis: `${payoutBasis}; the year-1 payout, which fades linearly to the steady-state ${fmtNum(steadyPayout)}% by year ${years} (1 − g / terminal ROE)` },
    horizonYears: {
      value: years,
      basis:
        continuing === null
          ? horizonBasis(true)
          : `explicit ${years}-year horizon: the excess return (ROE − cost of equity) x prior-year book equity is ` +
            `discounted year by year to year ${years}. ROE is faded LINEARLY to the cost of equity plus ${fmtNum(carriedPp)}pp ` +
            `of evidenced excess return over exactly that horizon, so the year-N excess is NOT zero; that excess is carried ` +
            `past year ${years} as residual income growing at ${fmtNum(continuingG)}% (continuing value, present value ` +
            `${fmtNum(continuingValuePv)}).`,
    },
    costOfEquityPct: {
      value: coe,
      basis:
        `cost of equity ${fmtNum(coe)}% (CAPM, upstream) — the ONLY discount rate in this model: the excess returns ` +
        "are equity flows, so a WACC would discount them at a blended rate that includes the cost of deposits, " +
        "policy reserves or repo, which are this company's raw material rather than its financing.",
    },
    openingBookValue: {
      value: bv0,
      basis: `opening book equity BV0 = ${inputs.bookValueBasis === "tangible-common-equity" ? "tangible common equity (equity less goodwill, intangibles and preferred)" : inputs.bookValueBasis === "common-equity" ? "common equity (equity less preferred)" : "latest total stockholders' equity"} ${bv0}${inputs.asOf != null ? ` as of ${inputs.asOf}` : ""}; each later year's book value compounds at the matching equity return x retention`,
    },
    priceToTangibleBookVsRote: pTbvVsRote,
    bookValuePath,
    terminalExcess,
    financialAssumptions,
    reverseSolve: { impliedCurrentRoePct, notes: reverseNotes },
    ...(startAlternative !== undefined ? { startAlternative } : {}),
    ...(startCoeGrid !== undefined ? { startCoeGrid } : {}),
    asOf: inputs.asOf ?? null,
    notes,
    gaps,
  };
}

// ---------------------------------------------------------------------------
// REIT valuation (P/FFO, P/AFFO, implied cap rate sketch)
// ---------------------------------------------------------------------------

export interface ReitInputs {
  /**
   * Approximate FFO reconstruction. `ffoBasis` identifies the available NAREIT
   * components and missing ownership / affiliated-entity reconciliation.
   */
  ffoApprox: number | null;
  /** AFFO — recurring capex and straight-line rent when tagged, else FFO − all capex. */
  affoApprox: number | null;
  sharePrice: number | null;
  shares: number | null;
  netDebt: number | null;
  /** NOI approx = operatingIncome + D&A, when derivable. */
  noiApprox?: number | null;
  asOf?: string | null;
  /** WS5: how FFO was actually built, printed instead of the fixed disclaimer. */
  ffoBasis?: string | null;
  /** WS5: how AFFO was actually built. */
  affoBasis?: string | null;
  /** True when FFO components or the ownership / affiliated-entity basis remain unreconciled. */
  ffoApproximate?: boolean;
  /** True when AFFO inherits approximate FFO or lacks recurring capex / straight-line rent. */
  affoApproximate?: boolean;
  /**
   * WS5 (D-16): the REIT sub-map. "undetermined" withholds every FFO-based
   * figure, because publishing them would assert an equity REIT on no evidence.
   */
  submap?: "equity" | "mortgage" | "undetermined" | null;
  /** WS5: the routing reason for an undetermined sub-map, repeated on each withheld figure. */
  submapReason?: string | null;
  /**
   * Claims senior to common in the HOUSE enterprise value — the definition the
   * multiples framework and the DCF bridge use. 0 when absent (the provider's
   * convention). The sketch used market cap + net debt alone, so a UPREIT
   * with OP-unit non-controlling interest and preferred carried two EVs in
   * one report and its implied cap rate was overstated.
   */
  preferredStock?: number | null;
  minorityInterest?: number | null;
  /** The operating-lease slice inside net debt; removed unless `includeLeasesInEv` (the EV bridge's rule). */
  operatingLeaseLiability?: number | null;
  includeLeasesInEv?: boolean;
}

export interface ReitValuationResult {
  pToFfo: number | null;
  pToAffo: number | null;
  ffoPerShare: number | null;
  affoPerShare: number | null;
  /** NOI(approx) / EV, percent — labeled sketch. */
  impliedCapRatePct: number | null;
  enterpriseValue: number | null;
  asOf: string | null;
  /** WS5: non-null when every FFO-based figure was withheld, with the reason. */
  withheldReason: string | null;
  notes: string[];
  gaps: ManifestEntry[];
}

/**
 * REIT valuation block: P/FFO + P/AFFO + implied-cap-rate sketch.
 *
 * WS5: FFO and AFFO now arrive already computed (see
 * `computeNareitFfo` in stageB/financialMetrics.ts), which reconstructs available
 * NAREIT components and discloses unreconciled ownership and affiliated entities.
 * This function prints the basis it is given and preserves its uncertainty.
 *
 * When the equity-vs-mortgage sub-map is undetermined every FFO-based figure is
 * withheld: P/FFO on a mortgage REIT is meaningless, and asserting an equity
 * REIT on the strength of SIC 6798 alone is exactly what D-16 forbids.
 */
export function reitValuation(inputs: ReitInputs): ReitValuationResult {
  const notes: string[] = [];
  const gaps: ManifestEntry[] = [];

  if (inputs.submap === "undetermined") {
    const reason =
      inputs.submapReason ??
      "the REIT sub-map is undetermined (SIC 6798 covers equity and mortgage REITs alike and no XBRL evidence separated them)";
    notes.push(
      `FFO, AFFO, P/FFO, P/AFFO and the implied cap rate are all WITHHELD: ${reason}. FFO presumes an equity REIT — ` +
        "on a mortgage REIT it is not a meaningful figure — so publishing it here would assert a business model the " +
        "evidence does not support. The book-value metrics a mortgage REIT leads with are withheld for the mirror " +
        "reason.",
    );
    gaps.push(
      gapEntry(
        "valuation.reit.submap",
        `REIT valuation withheld: ${reason} — FFO/AFFO/P-FFO presume an equity REIT and book-value metrics presume a mortgage REIT; neither family is published`,
        "warn",
      ),
    );
    return {
      pToFfo: null,
      pToAffo: null,
      ffoPerShare: null,
      affoPerShare: null,
      impliedCapRatePct: null,
      enterpriseValue: null,
      asOf: inputs.asOf ?? null,
      withheldReason: reason,
      notes,
      gaps,
    };
  }

  notes.push(
    inputs.ffoBasis ??
      "FFO (approx.) = netIncome + D&A — gains on property sales / RE impairments not netted (no tagged lines)",
  );
  notes.push(
    inputs.affoBasis ??
      "AFFO (rough) = approximate FFO - |capex| — treats ALL capex as maintenance; unreconciled FFO and issuer-specific adjustments prevent a guaranteed bound",
  );
  if (inputs.ffoApproximate === true) {
    notes.push(
      "FFO is labeled APPROXIMATE: ownership reconciliation and/or NAREIT components remain incomplete — the FFO basis above identifies the limitations. " +
        "Common/preferred shareholder allocations, noncontrolling interests and consolidated/unconsolidated partnerships and joint ventures " +
        "are not fully reconciled, so the reconstruction may be above or below the issuer's common-holder FFO.",
    );
  }
  const price = posOrNull(inputs.sharePrice);
  const shares = posOrNull(inputs.shares);
  const mcap = price !== null && shares !== null ? price * shares : null;
  if (mcap === null) {
    gaps.push(gapEntry("valuation.reit.marketCap", "share price or share count missing", "warn"));
  }
  const ffo = posOrNull(inputs.ffoApprox);
  const affo = posOrNull(inputs.affoApprox);
  if (ffo === null) {
    gaps.push(gapEntry("valuation.reit.ffo", "FFO missing or non-positive — P/FFO n/m", "warn"));
  }
  const operatingLease =
    isNum(inputs.operatingLeaseLiability) && inputs.operatingLeaseLiability > 0 ? inputs.operatingLeaseLiability : 0;
  const leaseRemoved = inputs.includeLeasesInEv === true ? 0 : operatingLease;
  const preferred = isNum(inputs.preferredStock) ? inputs.preferredStock : 0;
  const minority = isNum(inputs.minorityInterest) ? inputs.minorityInterest : 0;
  const ev =
    mcap !== null && isNum(inputs.netDebt) ? mcap + inputs.netDebt - leaseRemoved + preferred + minority : null;
  if (ev === null) {
    gaps.push(gapEntry("valuation.reit.enterpriseValue", "net debt or market cap missing — EV/implied cap rate unavailable", "info"));
  } else {
    notes.push(
      `enterprise value = market cap ${fmtNum(mcap as number)} + net debt ${fmtNum(inputs.netDebt as number)}` +
        (leaseRemoved > 0 ? ` − operating-lease liability ${fmtNum(leaseRemoved)}` : "") +
        ` + preferred ${fmtNum(preferred)} + minority interest ${fmtNum(minority)} = ${fmtNum(ev)} — the house definition the multiples and the DCF bridge use`,
    );
  }
  const noi = posOrNull(inputs.noiApprox);
  let impliedCapRatePct: number | null = null;
  if (noi !== null && ev !== null && ev > 0) {
    impliedCapRatePct = (noi / ev) * 100;
    notes.push("implied cap rate = NOI(approx = operatingIncome + D&A) / EV — a sketch, not an appraisal");
  } else {
    gaps.push(gapEntry("valuation.reit.impliedCapRate", "NOI not derivable (or EV missing) — implied cap rate disclosed as gap", "info"));
  }
  return {
    pToFfo: safeDiv(mcap, ffo),
    pToAffo: safeDiv(mcap, affo),
    ffoPerShare: safeDiv(ffo, shares),
    affoPerShare: safeDiv(affo, shares),
    impliedCapRatePct,
    enterpriseValue: ev,
    asOf: inputs.asOf ?? null,
    withheldReason: null,
    notes,
    gaps,
  };
}

// ---------------------------------------------------------------------------
// valueCompany — route dispatcher
// ---------------------------------------------------------------------------

export interface ValuationBundleInputs {
  currentPrice: number | null;
  waccPct: number | null;
  /** Why `waccPct` is null (the WACC's own gap), quoted by the DCF gap (VAL-10). */
  waccUnavailableReason?: string | null;
  netDebt: number | null;
  dilutedShares: number | null;
  /** Required for an ADR per-share bridge, along with dated ADS evidence. */
  dilutedShareSecurityBasis?: "ordinary" | "quoted" | "issuer-economic";
  /**
   * Audit 2026-10-22 B-37: how the multi-class producer
   * (`issuerEconomicDilutedShares`) decided — the basis of an admitted
   * issuer-economic count, or the reason it was refused.
   */
  dilutedShareEconomicBasis?: string | null;
  /**
   * FIN-404: set only when the divisor row is a loss period, whose filed diluted
   * count equals its basic count; `dilutedShares` already carries the substitution.
   */
  dilutedShareDivisor?: { basis: "loss-period-substituted" | "loss-period-basic"; donorDate: string | null; note: string | null };
  /** Consolidated equity proves outside claims, but the equity bridge has no allocation. */
  noncontrollingOwnershipUnresolved?: boolean;
  /**
   * FIN-103: the balance row the DCF equity bridge reads, the one dated at the
   * DCF statement date (`dcfBridgeRow`). Absent ⇒ the bridge reads
   * `multiples.balance`, the anchor the market EV uses.
   */
  bridgeBalance?: MultiplesBalance | null;
  /** Minority interest / preferred equity for the DCF equity bridge (0 when absent). */
  minorityInterest?: number | null;
  preferred?: number | null;
  /**
   * FIN-119: the redeemable preferred and redeemable NCI filed in temporary
   * equity at the bridge date. `valueCompany` folds them into `preferred` and
   * `minorityInterest` before the E-5 block, so one claim is deducted once.
   */
  temporaryEquity?: TemporaryEquityClaims | null;
  /**
   * FIN-119 (a withheld enrichment is unknown, not absent): the issuer tags
   * temporary equity at the bridge date but its SEC enrichment was withheld, so
   * a claim may be missing. No claim is added and nothing is withheld; one warn gap says so.
   */
  temporaryEquityUnknown?: { bridge: { date: string; reason: string } | null; market: { date: string; reason: string } | null } | null;
  /**
   * Audit 2026-10-22 E-5: profit attributable to noncontrolling interests and
   * consolidated profit (ProfitLoss), the key the DCF bridge uses for NCI, over
   * the trailing four quarters or else the latest fiscal year
   * (`noncontrollingEarningsInput`). Null/absent ⇒ the key is unestablished,
   * and a DCF with a noncontrolling interest withholds its per-share value.
   */
  noncontrollingEarnings?: { noncontrollingIncome: number | null; consolidatedProfit: number | null; asOf: string | null; basis?: "ttm" | "annual" } | null;
  /**
   * WS6 (D-19): TOTAL lease liabilities (FMP `capitalLeaseObligations`), already
   * inside `totalDebt` and therefore inside `netDebt`. Null when undisclosed.
   * Disclosure context only — the bridge adjusts by `operatingLeaseLiability`.
   */
  leaseLiability?: number | null;
  /**
   * WS6 review (BLOCKER 1): the OPERATING slice, the only one the equity bridge
   * may net out of net debt. Finance-lease interest is below EBIT and its
   * right-of-use amortisation is added back in EBITDA, so its liability is
   * debt in both frames. Null when the split is unavailable ⇒ net debt is used
   * as reported.
   */
  operatingLeaseLiability?: number | null;
  /** WS6 (D-19): THESIS_EV_INCLUDE_LEASES — keep leases in the EV bridge. */
  includeLeasesInEv?: boolean;
  /**
   * D-60: marketable equity securities the house net debt excluded from cash,
   * at their filed fair value. The DCF bridge adds them back as a separately
   * disclosed non-operating asset. Null ⇒ none identified.
   */
  nonOperatingAssets?: { value: number; basis: string } | null;
  /**
   * D-65: the filed source of the long-term investments the DCF removes from
   * operating capital (balance date, filing, any XBRL carrying-value fact),
   * for the bridge disclosure. The amount is the DCF's own
   * (`DcfAssumptions.nonOperatingInvestments`), never supplied separately.
   */
  longTermInvestmentsBasis?: string | null;
  /**
   * Audit 2026-10-22 E-7 and audit 2026-10-27 FIN-305: the asset-retirement,
   * environmental, pension and OPEB, loss-contingency and contingent-consideration
   * obligations tagged at the bridge's balance date (or within E-7's look-back),
   * and any assets legally restricted to settle the retirement obligations. The
   * DCF bridge deducts them after tax, except the pension and OPEB deficit of a
   * rate-regulated utility, which it discloses. Null ⇒ none tagged.
   */
  debtLikeObligations?: DebtLikeObligations | null;
  /**
   * FIN-305 (pre-flight I7): the filer's SIC code, the one fact the utility rule reads. A code in
   * `RATE_REGULATED_UTILITY_SIC` means the pension and OPEB deficit is assumed recoverable through rates (ASC 980) and
   * is disclosed, not deducted; null or absent means not established, which is read as not a utility, and a deducted
   * pension line then raises the `sicUnknown` info gap.
   */
  sicCode?: number | null;
  /** General route: DCF assumption inputs (null when not applicable). */
  dcfInputs: DcfAssumptionInputs | null;
  multiples: MultiplesFrameworkInputs;
  /** Bank/insurer route (null otherwise). */
  excessReturn: ExcessReturnInputs | null;
  /** Equity REIT route (null otherwise). */
  reit: ReitInputs | null;
}

export type ValuationResult =
  | {
      kind: "ineligible";
      route: SectorRoute;
      multiples: MultiplesResult;
      notes: string[];
      gaps: ManifestEntry[];
    }
  | {
      kind: "dcf";
      route: SectorRoute;
      assumptions: DcfAssumptions | null;
      dcf: DcfResult | null;
      sensitivity: SensitivityGrid | null;
      /** D-60: year-one growth × sustained margin grid; absent on results built before D-60. */
      growthMarginGrid?: GrowthMarginGrid | null;
      reverseDcf: ReverseDcfResult | null;
      multiples: MultiplesResult;
      notes: string[];
      gaps: ManifestEntry[];
    }
  | {
      kind: "excess-return";
      route: SectorRoute;
      excessReturn: ExcessReturnResult;
      multiples: MultiplesResult;
      notes: string[];
      gaps: ManifestEntry[];
    }
  | {
      kind: "reit";
      route: SectorRoute;
      reit: ReitValuationResult;
      multiples: MultiplesResult;
      notes: string[];
      gaps: ManifestEntry[];
    }
  | {
      kind: "pre-revenue";
      route: SectorRoute;
      multiples: null;
      notes: string[];
      gaps: ManifestEntry[];
    }
  | {
      /**
       * General route, but metricPolicy suppresses fcfDcf for this route's
       * overlays (currently: "unprofitable" — structurally negative FCF makes
       * an FCFF-based intrinsic-value model unreliable). Unlike "pre-revenue",
       * multiples ARE still meaningful here (only pe/peg/fcfDcf/dividendSafety/
       * piotroskiF/beneishM are suppressed, not multiples generally), so
       * `multiples` is a real MultiplesResult, not null.
       */
      kind: "dcf-suppressed";
      route: SectorRoute;
      multiples: MultiplesResult;
      notes: string[];
      gaps: ManifestEntry[];
    };

/**
 * Dispatch per sector route: general -> DCF + sensitivity + reverse DCF +
 * multiples; bank/insurer/mortgage-REIT -> excess-return + book multiples
 * (NO DCF); equity REIT -> reitValuation + FFO multiples; pre-revenue overlay
 * -> null valuation (runway framing handled by a different module).
 */
/**
 * FIN-119 (a withheld enrichment is unknown, not absent): no claim is added and
 * nothing is withheld, but the reader is told, for each consumer whose own
 * balance date the withheld enrichment touched. The DCF bridge reads the
 * statement-date row and the enterprise values the anchor row (FIN-103), so the
 * dates can differ. A consumer that publishes no figure is not named.
 */
export function valueCompany(route: CompanyRoute, inputs: ValuationBundleInputs): ValuationResult {
  const result = valueCompanyCore(route, inputs);
  const unknown = inputs.temporaryEquityUnknown ?? null;
  if (unknown === null || route.base === "bank" || route.base === "insurer" || route.base === "reit-mortgage") return result;
  const published = result.kind === "dcf" && result.dcf !== null && isNum(result.dcf.perShare);
  const multiples = "multiples" in result ? result.multiples : null;
  const enterpriseValues = multiples !== null && multiples !== undefined && isNum(multiples.enterpriseValue.value);
  const dcfUnknown = published ? unknown.bridge : null;
  const evUnknown = enterpriseValues ? unknown.market : null;
  if (dcfUnknown === null && evUnknown === null) return result;
  const missing = (u: { date: string; reason: string }, consumers: string) =>
    `its SEC enrichment for the ${u.date} balance was withheld (${u.reason}); a redeemable preferred or redeemable noncontrolling claim at that date could not be established ` +
    `and may be missing from ${consumers}, which keep their figures without it`;
  const parts = dcfUnknown !== null && evUnknown !== null && dcfUnknown.date === evUnknown.date
    ? [missing(dcfUnknown, "the DCF bridge and the enterprise values")]
    : [...(dcfUnknown !== null ? [missing(dcfUnknown, "the DCF bridge")] : []), ...(evUnknown !== null ? [missing(evUnknown, "the enterprise values")] : [])];
  result.gaps.push(gapEntry("valuation.temporaryEquity.unknown", `The issuer has tagged temporary equity in some period, but ${parts.join("; and ")}.`, "warn"));
  return result;
}

function valueCompanyCore(route: CompanyRoute, inputs: ValuationBundleInputs): ValuationResult {
  const notes: string[] = [];
  const gaps: ManifestEntry[] = [];
  if (route.modelEligibility?.status === "unresolved") {
    const { reason, sources } = route.modelEligibility;
    const entry: ManifestEntry = { field: "valuation.modelEligibility", reason, severity: "warn", attemptedSources: sources };
    // No model is selected, so no multiple/history/peer rank can smuggle its
    // assumptions back into the grade. Raw source statements remain upstream.
    return { kind: "ineligible", route: route.base, notes: [reason], gaps: [entry], multiples: {
      multiples: [], sectorAppropriate: [],
      enterpriseValue: { value: null, excludingLeases: null, includingLeases: null,
        leaseLiability: null, includeLeases: inputs.includeLeasesInEv === true, basis: reason },
      asOf: { quote: inputs.multiples.quote.priceAsOf ?? null, statements: inputs.multiples.incomeTtm?.date ?? null },
      notes: [reason], gaps: [entry],
    } };
  }

  // FIN-119 (OD-1): redeemable preferred and redeemable NCI are claims senior to
  // common, carried outside every equity field the bridge reads. Fold them into
  // `preferred` and `minorityInterest` here, before the E-5 block, so the
  // redeemable NCI joins book NCI as the floor of the E-5 test (never a second
  // deduction) and every D-26 re-run inherits the claims.
  const temporaryClaims = inputs.temporaryEquity ?? null;
  const temporaryRefusal = temporaryClaims?.refusal ?? null;
  const temporaryAdmitted = temporaryClaims !== null && temporaryRefusal === null && temporaryClaims.total !== 0 ? temporaryClaims : null;
  const redeemableNoncontrolling = temporaryAdmitted?.redeemableNoncontrolling ?? 0;
  let temporaryEquityDisclosure: TemporaryEquityDisclosure | null = null;
  let temporaryEquityNote: string | null = null;
  if (temporaryAdmitted !== null) {
    const parentLike = temporaryAdmitted.redeemablePreferred + temporaryAdmitted.unsplit;
    inputs = { ...inputs,
      ...(parentLike !== 0 ? { preferred: (isNum(inputs.preferred) ? inputs.preferred : 0) + parentLike } : {}),
      // A null book NCI is not a zero claim (E-5): it stays null and the redeemable amount is carried beside it.
      ...(redeemableNoncontrolling !== 0 && isNum(inputs.minorityInterest) ? { minorityInterest: inputs.minorityInterest + redeemableNoncontrolling } : {}) };
    temporaryEquityDisclosure = { redeemablePreferred: temporaryAdmitted.redeemablePreferred, redeemableNoncontrolling,
      unsplit: temporaryAdmitted.unsplit, basis: temporaryAdmitted.basis };
    const parts = [
      ...(temporaryAdmitted.redeemablePreferred !== 0 ? [`temporary equity attributable to the parent (redeemable preferred and other redeemable parent equity) of ${millions(temporaryAdmitted.redeemablePreferred)}, deducted beside preferred`] : []),
      ...(temporaryAdmitted.unsplit !== 0 ? [`temporary equity of ${millions(temporaryAdmitted.unsplit)} with no filed parent/NCI split, deducted beside preferred`] : []),
      ...(redeemableNoncontrolling !== 0 ? [`redeemable noncontrolling interests of ${millions(redeemableNoncontrolling)}, added to the book noncontrolling interest as the floor of the larger-of test (E-5), never deducted twice`] : []),
    ];
    temporaryEquityNote = `DCF equity bridge deducts ${parts.join(" and ")}: filed in temporary equity outside every equity field, they are claims senior to common (${temporaryAdmitted.basis}; house rule, decisions D-next OD-1).` +
      (parentLike !== 0
        ? " This caption can also hold redeemable common shares (for example shares subject to possible redemption or an ESOP put), which may already be in the diluted share count; " +
          "the filed facts do not separate them from redeemable preferred, so such shares would be counted both as a claim and in the divisor."
        : "");
  }
  // Audit 2026-10-22 C-15: the critical DCF gap names this gate, not a missing caller input.
  let dcfWithheldCause: string | null = null;
  // FIN-103: the DCF-only gates read the balance the bridge reads.
  const bridgeBalance = inputs.bridgeBalance ?? inputs.multiples.balance;
  if ((inputs.noncontrollingOwnershipUnresolved === true || unknownNoncontrollingAllocation(bridgeBalance)) && inputs.dcfInputs !== null) {
    const reason = "Consolidated equity has no resolved parent/NCI split, or differs from parent equity, and the NCI allocation is unavailable. The consolidated operating DCF cannot be presented as parent/common equity by treating unknown outside claims as zero; book NCI would itself be only a proxy for market value.";
    gaps.push(gapEntry("valuation.dcf.noncontrollingOwnership", reason, "warn"));
    notes.push(reason);
    dcfWithheldCause = `DCF withheld: noncontrolling ownership unresolved at ${bridgeBalance?.date ?? "the valuation balance date"} (the balance sheet carries consolidated equity without a filed parent/NCI split; see valuation.dcf.noncontrollingOwnership)`;
    inputs = { ...inputs, dcfInputs: null, dilutedShares: null };
  }

  // Audit 2026-10-22 E-5: a consolidated DCF bridged to common equity needs the
  // outside holders' share of profit to size their claim. Without it the DCF
  // runs on book NCI only to test its domain (book is the smallest deduction
  // the rule allows), and the per-share value is then withheld.
  let noncontrollingEarningsShare: number | null = null;
  let noncontrollingKeyMissing: string | null = null;
  const noncontrollingEarningsAsOf = inputs.noncontrollingEarnings?.asOf ?? null;
  const noncontrollingEarningsBasis = inputs.noncontrollingEarnings?.basis;
  // A zero book balance does not negate the outside claim positive NCI income shows.
  const noncontrollingIncomeClaim = isNum(inputs.noncontrollingEarnings?.noncontrollingIncome) && inputs.noncontrollingEarnings.noncontrollingIncome > 0;
  // A signed NCI income, profit or loss, shows outside holders exist.
  const noncontrollingIncomeSigned = isNum(inputs.noncontrollingEarnings?.noncontrollingIncome) && inputs.noncontrollingEarnings.noncontrollingIncome !== 0;
  if (!isNum(inputs.minorityInterest) && (noncontrollingIncomeSigned || redeemableNoncontrolling > 0)) {
    // Neither book nor the larger of book and the profit share can be set
    // without the book balance; a null book is not a zero claim. A redeemable
    // NCI is itself evidence of outside holders, as signed NCI income is.
    const earnings = inputs.noncontrollingEarnings;
    const allocated = noncontrollingIncomeSigned && earnings
      ? `are allocated ${fmtNum(earnings.noncontrollingIncome!)} of ${earnings.basis === "annual" ? "fiscal-year" : "trailing"} net income`
      : null;
    const unavailable = "but their book value is unavailable, so the deduction can be set neither at book" +
      `${redeemableNoncontrolling > 0 ? " (plus the redeemable amount)" : ""} nor at the larger of ${redeemableNoncontrolling > 0 ? "that" : "book"} and their profit share. `;
    const withheld = "The per-share value is withheld: the consolidated DCF would otherwise credit the outside holders' claim to common holders (audit 2026-10-22 E-5).";
    noncontrollingKeyMissing = redeemableNoncontrolling > 0
      ? `Noncontrolling interests hold a redeemable noncontrolling interest of ${millions(redeemableNoncontrolling)} filed in temporary equity${allocated === null ? "" : ` and ${allocated}`}, ${unavailable}${withheld}`
      : `Noncontrolling interests ${allocated}, ${unavailable}${withheld}`;
  } else if (isNum(inputs.minorityInterest) && (inputs.minorityInterest !== 0 || noncontrollingIncomeClaim)) {
    const earnings = inputs.noncontrollingEarnings ?? null;
    const period = earnings?.basis === "annual" ? `fiscal-year (${earnings.asOf ?? "date unavailable"})` : "trailing";
    // A share above 1 (the parent's own share negative) is not a claim on value.
    if (earnings !== null && isNum(earnings.noncontrollingIncome) && isNum(earnings.consolidatedProfit) && earnings.consolidatedProfit > 0 &&
      earnings.noncontrollingIncome <= earnings.consolidatedProfit) {
      noncontrollingEarningsShare = earnings.noncontrollingIncome / earnings.consolidatedProfit;
    } else {
      noncontrollingKeyMissing = `Noncontrolling interest of ${fmtNum(inputs.minorityInterest)} sits in the consolidated DCF, but its share of consolidated profit could be established from neither the trailing four quarters nor the latest fiscal year ` +
        (earnings === null ? "(no trailing or fiscal-year noncontrolling and consolidated profit)"
          : !isNum(earnings.noncontrollingIncome) ? `(${period} profit attributable to noncontrolling interests unavailable)`
          : !isNum(earnings.consolidatedProfit) ? `(${period} consolidated profit unavailable)`
          : earnings.consolidatedProfit <= 0 ? `(${period} consolidated profit ${fmtNum(earnings.consolidatedProfit)} is not positive)`
          : `(${period} profit attributable to noncontrolling interests ${fmtNum(earnings.noncontrollingIncome)} exceeds consolidated profit ${fmtNum(earnings.consolidatedProfit)}, so the parent's own share is negative)`) +
        ". The per-share value is withheld: book NCI alone can understate the outside holders' claim on a consolidated valuation (audit 2026-10-22 E-5).";
    }
  }

  if (route.overlays.includes("pre-revenue")) {
    notes.push(
      "pre-revenue: DCF, reverse DCF and multiples suppressed (denominators zero/negative); runway + scenario framing handled elsewhere",
    );
    gaps.push(gapEntry("valuation", "pre-revenue company — no meaningful intrinsic-value model in v1", "info"));
    return { kind: "pre-revenue", route: route.base, multiples: null, notes, gaps };
  }

  const adr = route.overlays.includes("adr") || inputs.multiples.quote.isAdr === true;
  if (adr) {
    const security = resolveSecurityBasis(inputs.multiples.securityBasis ?? [], inputs.multiples.securityBasisAsOf ?? "");
    const quotedSharesKnown = inputs.dilutedShareSecurityBasis === "quoted" && security?.quoteUnit === "ADS" &&
      (inputs.multiples.quote.issuerId === undefined || inputs.multiples.quote.issuerId === security.issuerId) &&
      (inputs.multiples.quote.securityId === undefined || inputs.multiples.quote.securityId === security.securityId);
    inputs = { ...inputs, multiples: { ...inputs.multiples, quote: { ...inputs.multiples.quote, isAdr: true } } };
    if (!quotedSharesKnown) {
      const reason = "ADR per-share valuation withheld: weighted-average diluted shares are not established as shares of the quoted ADS with verified effective-dated security evidence; no depositary ratio is guessed";
      notes.push(reason);
      gaps.push(gapEntry("valuation.perShare.securityBasis", reason, "warn"));
      inputs = { ...inputs, dilutedShares: null,
        excessReturn: inputs.excessReturn ? { ...inputs.excessReturn, dilutedShares: null } : null,
        reit: inputs.reit ? { ...inputs.reit, shares: null, sharePrice: null } : null };
    }
    if (inputs.multiples.quote.marketCapSecurityBasis !== "issuer-common" && inputs.excessReturn) {
      inputs = { ...inputs, excessReturn: { ...inputs.excessReturn, marketCap: null } };
    }
  }

  const economicScope = resolveEconomicEquityScope(inputs.multiples.quote,
    inputs.multiples.economicShareEvidence ?? [], inputs.multiples.securityBasisAsOf ?? "");
  const multiclassEvidence = inputs.multiples.economicShareEvidence?.some(row => row.classes.length > 1) === true;
  if (economicScope.status === "unresolved" ||
    (multiclassEvidence && inputs.dilutedShareSecurityBasis !== "issuer-economic")) {
    const reason = "Per-share intrinsic valuation withheld: common-class coverage or the economic basis of weighted-average diluted shares is unresolved. Outstanding class counts do not establish the diluted denominator; no class ratio is guessed." +
      (economicScope.status === "resolved" && inputs.dilutedShareEconomicBasis ? ` ${inputs.dilutedShareEconomicBasis}` : "");
    notes.push(reason);
    gaps.push(gapEntry("valuation.perShare.economicClassBasis", reason, "warn"));
    inputs = { ...inputs, dilutedShares: null,
      excessReturn: inputs.excessReturn ? { ...inputs.excessReturn, dilutedShares: null } : null,
      reit: inputs.reit ? { ...inputs.reit, shares: null, sharePrice: null } : null };
  } else if (multiclassEvidence && inputs.dilutedShareEconomicBasis) {
    notes.push(inputs.dilutedShareEconomicBasis);
    gaps.push(gapEntry("valuation.perShare.economicClassBasis", inputs.dilutedShareEconomicBasis, "info"));
  }
  if (inputs.dilutedShareDivisor?.note && isNum(inputs.dilutedShares) && inputs.dilutedShares > 0) {
    notes.push(inputs.dilutedShareDivisor.note);
    gaps.push(gapEntry("valuation.perShare.lossPeriodDivisor", inputs.dilutedShareDivisor.note, "info"));
  }
  if (economicScope.status !== "unverified-vendor-scope") inputs = { ...inputs,
    excessReturn: inputs.excessReturn ? { ...inputs.excessReturn, marketCap: economicScope.marketCap } : null };

  const multiples = multiplesFramework(route.base, inputs.multiples);
  if (route.base === "reit" && inputs.reit && multiples.enterpriseValue.noncontrollingInterestBasis === "unknown-allocation") {
    const reason = "REIT enterprise value and implied cap rate withheld: consolidated equity establishes outside ownership but the NCI allocation is unavailable; no market NCI value is inferred from the book-equity difference. FFO figures are evaluated separately.";
    notes.push(reason);
    gaps.push(gapEntry("valuation.reit.noncontrollingOwnership", reason, "warn"));
    inputs = { ...inputs, reit: { ...inputs.reit, netDebt: null } };
  }
  // The one rule every comparison with the quote obeys (priceCurrency.ts):
  // statements and quote in ONE KNOWN currency, or no comparison at all.
  const quoteComparison = comparePriceCurrency(inputs.multiples.reportedCurrency, inputs.multiples.quote.currency);
  // Hoist the multiples model's own gaps (peers, ownHistory, priceToFfo) into
  // the valuation manifest, mirroring the excess-return and REIT hoists below.
  // Without this the peers gap added earlier never reached the missing-data
  // manifest, so a permanently empty peer column still had no disclosure.
  gaps.push(...multiples.gaps);

  if (route.base === "bank" || route.base === "insurer" || route.base === "reit-mortgage") {
    notes.push("FCFF DCF and FCFF reverse-DCF suppressed for financials (debt is raw material) — excess-return model used");
    // WS5 (V-10): the three FCFF-derived outputs and the ROIC−WACC spread are
    // all withheld on this route, and each now says so in the manifest as well
    // as the notes. They were structurally absent before — nothing computed
    // them — but an absence with no stated reason reads to a report reader as
    // missing data rather than as a deliberate methodological refusal.
    gaps.push(
      gapEntry(
        "valuation.dcf",
        `FCFF DCF withheld on the '${route.base}' route: FCFF is before debt service, but debt, cash and reinvestment cannot be separated reliably into operating and financing items for a deposit-, float- or repo-funded balance sheet — the equity excess-return model is used instead`,
        "info",
      ),
      gapEntry(
        "valuation.reverseDcf",
        `FCFF reverse DCF withheld on the '${route.base}' route: it inverts the same FCFF model, so the growth or margin it would solve for inherits the same category error — the excess-return model's reverse solve (the starting ROE that reproduces the market cap) is reported instead`,
        "info",
      ),
      gapEntry(
        "valuation.evEbitda",
        `EV/EBITDA withheld on the '${route.base}' route: enterprise value adds debt and subtracts cash, both of which are operating items here, so the multiple is not defined (a profitable bank can show a negative EV)`,
        "info",
      ),
      gapEntry(
        "returns.roicVsWacc",
        `ROIC − WACC withheld on the '${route.base}' route: invested capital (debt + equity − cash) is undefined when deposits, policy reserves or repo fund the assets and cash is itself an earning asset — return on tangible common equity against the cost of equity is the value-creation read instead`,
        "info",
      ),
    );
    if (route.base === "reit-mortgage") {
      notes.push("mortgage REIT routed to the book-value (excess-return) map (docs/METHODOLOGY.md, Financial-company routes)");
    }
    const er = inputs.excessReturn
      ? excessReturnModel(inputs.excessReturn)
      : excessReturnModel({ bookValue: null, currentRoePct: null, costOfEquityPct: null });
    if (!inputs.excessReturn) {
      gaps.push(gapEntry("valuation.excessReturn", "excess-return inputs not provided by caller", "critical"));
    }
    // ADR currency guard, the excess-return twin of the DCF guard below. The
    // per-share value is in the statements' reportedCurrency while the price it
    // is graded against is the quote currency, so on a mismatch the upside is
    // off by the FX rate. Suppress the per-share (and the market-cap reverse
    // solve, which compares equity value to a quote-currency market cap) rather
    // than publish a mixed-currency comparison. No FX conversion attempted.
    const erReported = inputs.multiples.reportedCurrency;
    const erQuote = inputs.multiples.quote.currency;
    if (
      typeof erReported === "string" &&
      typeof erQuote === "string" &&
      erReported.toUpperCase() !== erQuote.toUpperCase()
    ) {
      notes.push(
        `ADR/currency mismatch: statements in ${erReported}, quote in ${erQuote} — excess-return per-share and reverse solve suppressed ` +
          `(per-share intrinsic value would be in ${erReported} against a ${erQuote} price; no FX conversion attempted). ` +
          "See multiples (flagged) for relative valuation.",
      );
      gaps.push(
        gapEntry(
          "valuation.excessReturn.currency",
          `reportedCurrency ${erReported} != quote currency ${erQuote} (ADR case) — excess-return per-share suppressed rather than comparing mixed-currency per-share vs price`,
          "critical",
        ),
      );
      const guarded: ExcessReturnResult = {
        ...er,
        perShare: null,
        startAlternative: undefined,
        startCoeGrid: undefined,
        reverseSolve: {
          impliedCurrentRoePct: null,
          notes: [
            ...er.reverseSolve.notes,
            `reverse solve suppressed: market cap is in ${erQuote} while book value is in ${erReported}`,
          ],
        },
      };
      // Hoist the model-level gaps on this path too. Suppressing the per-share
      // does not make the CoE/bookValue/payout/ROE gaps irrelevant — an ADR is
      // exactly where the reader needs to see everything else that was missing,
      // so returning early without them made a degraded model MORE opaque than
      // the unguarded path below.
      gaps.push(...er.gaps);
      return { kind: "excess-return", route: route.base, excessReturn: guarded, multiples, notes, gaps };
    }
    if (!quoteComparison.comparable) {
      // Currency unknown on one side: the per-share value (book value and ROE,
      // all statements) stands in its own currency, but the reverse solve sets
      // the equity value against the market cap and is withheld.
      gaps.push(
        gapEntry(
          "valuation.excessReturn.reverseSolve.currency",
          `${quoteComparison.reason} — the market-implied ROE sets the market cap against book value, so it is withheld`,
          "warn",
        ),
      );
      gaps.push(...er.gaps);
      const withheld: ExcessReturnResult = {
        ...er,
        reverseSolve: {
          impliedCurrentRoePct: null,
          notes: [...er.reverseSolve.notes, `reverse solve withheld: ${quoteComparison.reason}`],
        },
      };
      return { kind: "excess-return", route: route.base, excessReturn: withheld, multiples, notes, gaps };
    }
    // Hoist model-level gaps (CoE/bookValue/payout/ROE suppression, …) so
    // they reach the merged manifest, mirroring the general branch's
    // gaps.push(...built.gaps) — otherwise a suppressed model is invisible in
    // the report appendix.
    gaps.push(...er.gaps);
    return { kind: "excess-return", route: route.base, excessReturn: er, multiples, notes, gaps };
  }

  if (route.base === "reit") {
    notes.push("FCFF DCF suppressed for equity REITs — P/FFO / P/AFFO + cap-rate sketch used");
    // WS5 (criterion e): a net-income DCF is withheld on this route with the
    // reason, not merely omitted. Real-estate depreciation is a large non-cash
    // charge against a REIT's GAAP net income, so discounting that net income
    // would value the company on an earnings figure the industry itself
    // replaces with FFO.
    gaps.push(
      gapEntry(
        "valuation.netIncomeDcf",
        "net-income DCF withheld on the equity-REIT route: GAAP net income is struck after real-estate depreciation, a non-cash charge on assets that typically hold or gain value, so discounting it would understate the company — FFO/AFFO and P/FFO are used instead, per the NAREIT definition",
        "info",
      ),
    );
    // P/FFO, P/AFFO and the implied cap rate set the quote against the
    // statements; FFO per share does not. Without one known currency the price
    // is withheld from the block, so only the price-free figures remain.
    if (inputs.reit && !quoteComparison.comparable) {
      gaps.push(
        gapEntry(
          "valuation.reit.currency",
          `${quoteComparison.reason} — P/FFO, P/AFFO and the implied cap rate withheld; FFO and AFFO per share stand`,
          "warn",
        ),
      );
    }
    const reitDebtRefusal = leaseDebtScopeRefusal(inputs.multiples.balance, inputs.includeLeasesInEv === true);
    if (reitDebtRefusal) gaps.push(gapEntry("valuation.reit.enterpriseValue.leaseScope", reitDebtRefusal, "critical"));
    const reit = inputs.reit
      ? reitValuation({ ...inputs.reit, ...(!quoteComparison.comparable ? { sharePrice: null } : {}), ...(reitDebtRefusal ? { netDebt: null } : {}) })
      : reitValuation({ ffoApprox: null, affoApprox: null, sharePrice: null, shares: null, netDebt: null });
    if (!inputs.reit) {
      gaps.push(gapEntry("valuation.reit", "REIT inputs not provided by caller", "critical"));
    }
    gaps.push(...reit.gaps);
    return { kind: "reit", route: route.base, reit, multiples, notes, gaps };
  }

  // General route: DCF + sensitivity + reverse DCF + multiples — unless
  // metricPolicy suppresses fcfDcf for this route's overlays (currently:
  // "unprofitable"), in which case an FCFF-based intrinsic-value model isn't
  // meaningful and we skip it entirely rather than returning a DCF the
  // report's own display policy says shouldn't be shown.
  if (metricPolicy(route).suppress.includes("fcfDcf")) {
    notes.push(
      "fcfDcf suppressed by metric policy (unprofitable overlay) — DCF/sensitivity/reverse-DCF not modelled; " +
        "free cash flow is structurally negative, making an FCFF-based intrinsic-value model unreliable. " +
        "See multiples below for relative valuation.",
    );
    gaps.push(
      gapEntry(
        "valuation.dcf",
        "DCF suppressed for unprofitable overlay — FCFF-based intrinsic value is not meaningful when free " +
          "cash flow is structurally negative",
        "info",
      ),
    );
    return { kind: "dcf-suppressed", route: route.base, multiples, notes, gaps };
  }
  let assumptions: DcfAssumptions | null = null;
  let dcf: DcfResult | null = null;
  let sensitivity: SensitivityGrid | null = null;
  let growthMargin: GrowthMarginGrid | null = null;
  let reverse: ReverseDcfResult | null = null;
  // ADR currency guard (2026-07-09 audit H3): the per-share DCF value is in the
  // statements' reportedCurrency while the price it is graded against is in the
  // quote currency. On a mismatch (e.g. TSM: TWD statements, USD quote) the
  // upside would be off by the FX rate (~+800% for TSM) — suppress the DCF,
  // reverse-DCF and sensitivity grid with a disclosed gap, exactly as the
  // multiples framework flags its currencyMismatch. No FX conversion attempted.
  const dcfIn = inputs.dcfInputs;
  const dcfCurrencyMismatch =
    dcfIn !== null &&
    typeof dcfIn.reportedCurrency === "string" &&
    typeof dcfIn.quoteCurrency === "string" &&
    dcfIn.reportedCurrency.toUpperCase() !== dcfIn.quoteCurrency.toUpperCase();
  // Currency is checked FIRST because it is the root cause, not a symptom: an
  // ADR's WACC is itself suppressed for the same mismatch (the equity weight
  // would divide a quote-currency market cap by a reporting-currency debt
  // balance), so testing `waccPct` first would report the generic "WACC
  // unavailable" and hide the specific, actionable reason from the valuation
  // section entirely.
  if (dcfCurrencyMismatch) {
    notes.push(
      `ADR/currency mismatch: statements in ${dcfIn.reportedCurrency}, quote in ${dcfIn.quoteCurrency} — DCF, sensitivity grid and reverse DCF suppressed ` +
        `(per-share intrinsic value would be in ${dcfIn.reportedCurrency} against a ${dcfIn.quoteCurrency} price; no FX conversion attempted). ` +
        "See multiples (flagged) for relative valuation.",
    );
    gaps.push(
      gapEntry(
        "valuation.dcf.currency",
        `reportedCurrency ${dcfIn.reportedCurrency} != quote currency ${dcfIn.quoteCurrency} (ADR case) — DCF/reverse-DCF suppressed rather than comparing mixed-currency per-share vs price`,
        "critical",
      ),
    );
  } else if (dcfIn === null || !isNum(inputs.waccPct)) {
    gaps.push(
      gapEntry("valuation.dcf", dcfIn === null ? dcfWithheldCause ?? "DCF inputs not provided by caller"
        : `WACC unavailable — DCF suppressed${inputs.waccUnavailableReason ? `: ${inputs.waccUnavailableReason}` : ""}`, "critical"),
    );
  } else {
    const built = buildDcfAssumptions(dcfIn);
    gaps.push(...built.gaps);
    notes.push(...built.notes);
    assumptions = built.assumptions;
    if (assumptions !== null) {
      // WS6 (D-19): the DCF equity bridge follows the SAME lease convention as
      // the multiples EV. Net debt is built from totalDebt, which already
      // contains the lease liabilities, so the default subtracts the OPERATING
      // slice back out and THESIS_EV_INCLUDE_LEASES=1 keeps it. Both bridges
      // are stated.
      // WS6 review (BLOCKER 1): only the OPERATING slice leaves net debt. The
      // finance-lease liability stays as financing debt: its interest is
      // below EBIT; its amortisation is inside EBIT and added back in EBITDA.
      const totalLeaseLiability =
        isNum(inputs.leaseLiability) && inputs.leaseLiability >= 0 ? inputs.leaseLiability : null;
      // Audit 2026-10-19 CODE-1: the operating lease leaves net debt only when
      // totalDebt is shown to hold it; otherwise net debt is used as reported.
      const bridgeLeaseScope = operatingLeaseScopeUnproven({ ...bridgeBalance,
        capitalLeaseObligations: inputs.leaseLiability ?? bridgeBalance?.capitalLeaseObligations,
        operatingLeaseLiability: inputs.operatingLeaseLiability ?? bridgeBalance?.operatingLeaseLiability });
      if (bridgeLeaseScope !== null) gaps.push(gapEntry("valuation.dcf.netDebt.leaseScope", bridgeLeaseScope, "warn"));
      const leaseLiability =
        bridgeLeaseScope === null && isNum(inputs.operatingLeaseLiability) && inputs.operatingLeaseLiability >= 0
          ? inputs.operatingLeaseLiability
          : null;
      const financeLeaseLiability =
        totalLeaseLiability !== null && leaseLiability !== null
          ? Math.max(0, totalLeaseLiability - leaseLiability)
          : null;
      const includeLeases = inputs.includeLeasesInEv === true;
      const leaseConflict = leaseDebtConflict({
        totalDebt: bridgeBalance?.totalDebt,
        capitalLeaseObligations: inputs.leaseLiability,
        operatingLeaseLiability: inputs.operatingLeaseLiability,
        financeLeaseLiability: bridgeBalance?.financeLeaseLiability,
      });
      if (leaseConflict !== null) gaps.push(gapEntry("valuation.dcf.leaseIntegrity", leaseConflict, "critical"));
      const bridgeScopeRefusal = leaseDebtScopeRefusal(bridgeBalance, inputs.includeLeasesInEv === true);
      if (bridgeScopeRefusal) { notes.push(bridgeScopeRefusal); gaps.push(gapEntry("valuation.dcf.netDebt.leaseScope", bridgeScopeRefusal, "critical")); }
      const netDebtIncludingLeases = leaseConflict === null && bridgeScopeRefusal === null ? inputs.netDebt : null;
      const netDebtExcludingLeases =
        isNum(netDebtIncludingLeases) && leaseLiability !== null
          ? netDebtIncludingLeases - leaseLiability
          : netDebtIncludingLeases;
      const netDebtForBridge = includeLeases ? netDebtIncludingLeases : netDebtExcludingLeases;
      if (isNum(netDebtIncludingLeases)) {
        notes.push(
          `DCF equity bridge: EV − net debt − minority interest − preferred equity. ` +
            (leaseLiability === null
              ? bridgeLeaseScope !== null
                ? `${bridgeLeaseScope}.`
                : totalLeaseLiability === null
                ? "Lease liabilities were not disclosed separately, so they could not be separated from total debt; net debt is used as reported."
                : `A total lease liability of ${fmtNum(totalLeaseLiability)} is disclosed but its operating slice is not, so no lease adjustment was made; net debt is used as reported.`
              : `Net debt as reported ${fmtNum(netDebtIncludingLeases)}; less the OPERATING lease liability ${fmtNum(netDebtExcludingLeases as number)}; ` +
                `${includeLeases ? "KEEPING" : "REMOVING"} the operating-lease liability of ${fmtNum(leaseLiability)} (house default removes it; THESIS_EV_INCLUDE_LEASES=1 keeps it)` +
                (financeLeaseLiability === null || financeLeaseLiability === 0
                  ? ". "
                  : `; the finance-lease liability of ${fmtNum(financeLeaseLiability)} stays in net debt on both bases. `) +
                "Operating-lease cost is inside the EBIT this DCF projects (ASC 842), so its liability is not debt here; finance-lease right-of-use amortisation is inside EBIT, while its interest is below EBIT, and its liability remains financing debt."),
        );
      }
      // D-60: equity securities left out of cash return as a non-operating
      // asset at their filed fair value, only when net debt itself bridges.
      // D-65: so do the long-term investments the sales-to-capital denominator
      // removed as non-operating, at their filed carrying value. FIN-304: a
      // holding that met or exceeded invested capital is added back too.
      // The exceed and lease-emptied cases keep the filed provenance and swap
      // only the clause that says the denominator removes the amount.
      const components: NonOperatingAssetComponent[] = [];
      if (isNum(netDebtForBridge) && inputs.nonOperatingAssets && isNum(inputs.nonOperatingAssets.value) && inputs.nonOperatingAssets.value > 0) {
        components.push({ kind: "marketable-equity-securities", label: "marketable equity securities (filed fair value, not cash)",
          value: inputs.nonOperatingAssets.value, basis: inputs.nonOperatingAssets.basis });
      }
      const lti = assumptions.nonOperatingInvestments ?? null;
      if (isNum(netDebtForBridge) && lti !== null && isNum(lti.value) && lti.value > 0) {
        components.push({ kind: "long-term-investments", label: "long-term investments (filed carrying value)", value: lti.value,
          basis: (inputs.longTermInvestmentsBasis ?? `long-term investments ${fmtMoney(lti.value)} on the ${lti.balanceDate} balance sheet, at carrying value: ${LONG_TERM_INVESTMENTS_REMOVED_CLAUSE}`)
            .replace(LONG_TERM_INVESTMENTS_REMOVED_CLAUSE, lti.basis ?? LONG_TERM_INVESTMENTS_REMOVED_CLAUSE) });
      }
      for (const c of components) {
        notes.push(
          `DCF equity bridge adds ${c.label} of ${fmtNum(c.value)}: ${c.basis}. ` +
            "They are not cash: their gains and losses sit below operating income, so the FCFF path does not value them, and no marketability discount or fair-value estimate is applied.",
        );
      }
      // AMZN audit 2026-10-20: a stake reaches shareholders by being sold, and
      // the gain is taxed. The basis of each holding is not in the statements,
      // so the whole carrying value is taxed at the marginal rate: an upper
      // bound on the tax, exact for stakes bought for next to nothing.
      const investmentTax = assumptions.investmentTax ?? null;
      const grossInvestments = components.reduce((sum, c) => sum + c.value, 0);
      if (investmentTax !== null && grossInvestments > 0 && investmentTax.ratePct > 0) {
        const value = -grossInvestments * investmentTax.ratePct / 100;
        const label = `estimated tax on non-operating investments (${fmtNum(investmentTax.ratePct)}% marginal rate, zero tax basis assumed)`;
        const basis = `${fmtNum(investmentTax.ratePct)}% of the ${fmtNum(grossInvestments)} added above; the rate is ${investmentTax.basis}. ` +
          "The tax basis of each holding is not filed in the statements, so none is assumed: this is the most the tax could be, and it overstates it for holdings carried near cost";
        components.push({ kind: "investment-tax", label, value, basis });
        notes.push(`DCF equity bridge subtracts the ${label} of ${fmtNum(-value)}: ${basis}.`);
      }
      // Audit 2026-10-22 E-7, extended by audit 2026-10-27 FIN-305 (decisions spec 4.3): filed retirement,
      // environmental, pension and OPEB, loss-contingency and contingent-consideration obligations are claims the FCFF
      // path never pays, so the bridge deducts them, AFTER tax at the D-98 marginal rate the bridge already uses for
      // the investments it adds. Funds legally restricted to retirement settle those first, less any long-term
      // investments already added above; the relief is applied to the amount deducted, never to the offset.
      const obligations = isNum(netDebtForBridge) ? inputs.debtLikeObligations ?? null : null;
      const taxRatePct = assumptions.investmentTax?.ratePct ?? 0;
      const afterTax = taxRatePct > 0;
      const keep = afterTax ? 1 - taxRatePct / 100 : 1;
      // A balance from an earlier filing is dated on its line; the bridge's
      // own balance-sheet date would otherwise be read as its date.
      const obligationLabel = (name: string, o: { asOf?: string }) =>
        `${name} (filed, ${afterTax ? `after tax at ${fmtNum(taxRatePct)}%` : "before tax"}${o.asOf === undefined ? "" : `; balance at ${o.asOf}, the latest filed`})`;
      const relief = (net: number) => (afterTax && net > 0 ? ` (${fmtNum(net * keep)} after the ${fmtNum(taxRatePct)}% tax relief)` : "");
      let retirementDeducted = false;
      if (obligations !== null) {
        const aro = obligations.assetRetirement;
        if (aro !== null && aro.value > 0) {
          // The fund may already be inside the investments added above; only
          // what lies beyond them is credited, so it is never counted twice.
          const assetsAdded = components.filter((c) => c.kind === "long-term-investments" || c.kind === "marketable-equity-securities")
            .reduce((sum, c) => sum + c.value, 0);
          const fund = obligations.settlementAssets;
          const offset = fund === null ? 0 : Math.min(aro.value, Math.max(0, fund.value - assetsAdded));
          const fundNote = fund === null ? ""
            : `, less assets legally restricted to settle them (${fund.basis}) of ${fmtNum(fund.value)}` +
              (assetsAdded > 0 ? ` beyond the investments of ${fmtNum(assetsAdded)} the bridge already adds` : "") +
              `: an offset of ${fmtNum(offset)}`;
          if (aro.value - offset > 0) {
            retirementDeducted = true;
            components.push({ kind: "debt-like-obligation", label: obligationLabel("asset-retirement obligations", aro), value: -((aro.value - offset) * keep), basis: `${aro.basis}${fundNote}` });
          }
          notes.push(fund === null
            ? `DCF equity bridge subtracts asset-retirement obligations of ${fmtNum(aro.value)}${relief(aro.value)}: ${aro.basis}.`
            : `DCF equity bridge weighs asset-retirement obligations of ${fmtNum(aro.value)} (${aro.basis})${fundNote}, so ${fmtNum(aro.value - offset)} is deducted${relief(aro.value - offset)}.`);
        }
        const deduct = (name: string, o: { value: number; basis: string; asOf?: string } | null | undefined) => {
          if (o === null || o === undefined || !(o.value > 0)) return;
          components.push({ kind: "debt-like-obligation", label: obligationLabel(name, o), value: -(o.value * keep), basis: o.basis });
          notes.push(`DCF equity bridge subtracts ${name} of ${fmtNum(o.value)}${relief(o.value)}: ${o.basis}.`);
        };
        deduct("environmental remediation accruals", obligations.environmental);
        const pension = obligations.pension ?? null;
        if (pension !== null && pension.value > 0) {
          if (isNum(inputs.sicCode) && RATE_REGULATED_UTILITY_SIC.has(inputs.sicCode)) {
            // FIN-305 (pre-flight I7): a rate-regulated utility recovers the cost through rates (ASC 980); the
            // offsetting regulatory asset is dimensional XBRL, which companyfacts does not carry.
            const sic = ` (SIC ${inputs.sicCode})`;
            notes.push(`Pension and other postretirement benefit deficits of ${millions(pension.value)} (${pension.basis}) are not deducted: a rate-regulated utility${sic} is assumed to recover them through rates (ASC 980); ` +
              "the offsetting regulatory asset is reported only in dimensional XBRL, which the SEC companyfacts the bridge reads does not carry.");
            gaps.push(gapEntry("valuation.dcf.debtLikeObligations.rateRegulated",
              `The filer is a rate-regulated utility${sic}: its pension and OPEB deficit of ${millions(pension.value)} is assumed recoverable through rates (ASC 980) and is disclosed, not deducted.`, "info"));
          } else {
            deduct("pension and other postretirement benefit deficits", pension);
            if (!isNum(inputs.sicCode)) {
              gaps.push(gapEntry("valuation.dcf.debtLikeObligations.sicUnknown",
                "The filer's SIC code is not established, so it is read as not a rate-regulated utility and its pension and OPEB deficit is deducted.", "info"));
            }
          }
        }
        deduct("loss-contingency accruals", obligations.lossContingencies);
        deduct("business-combination contingent consideration", obligations.contingentConsideration);
        if (components.some((c) => c.kind === "debt-like-obligation")) {
          notes.push("These are filed liabilities and the FCFF path does not project their settlement, so equity value is what remains after them. " +
            (afterTax
              ? `Each is deducted net of the tax relief a settlement would earn, at the ${fmtNum(taxRatePct)}% marginal-rate floor (${assumptions.investmentTax!.basis}; D-98, D-58). ` +
                "The relief is approximate: the rate omits state and local taxes and assumes the deduction is taken against taxable income in the year the claim is paid, " +
                "and a payment that is not deductible (a government fine or penalty, 26 U.S.C. §162(f)) or that only adds to tax basis (contingent consideration, which adds to the basis of the acquired assets or shares) " +
                `is credited a relief it will not earn, or not for years, understating that claim by up to ${fmtNum(taxRatePct)}% of it.` +
                (retirementDeducted ? " The retirement obligations' accretion, which filers charge to operating income, also lowers the projected NOPAT, so their time value is counted twice; the bridge does not adjust for it." : "")
              : "They are deducted at the recognised amount before any tax relief, which overstates the claim by the tax deduction a settlement would earn. " +
                "The retirement obligations' accretion, which filers charge to operating income, also lowers the projected NOPAT, so their time value is counted twice; the bridge does not adjust for either."));
          // FIN-305 (OD-4): none of these joins the market EV; say so where the EV is stated.
          // Only the families with a deducted line are named: a utility's disclosed pension deficit is not one.
          const deductedFamilies = [
            ["retirement", /^asset-retirement/], ["environmental", /^environmental/], ["pension and OPEB", /^pension/],
            ["loss-contingency", /^loss-contingency/], ["contingent-consideration", /^business-combination contingent/],
          ].filter(([, label]) => components.some((c) => c.kind === "debt-like-obligation" && (label as RegExp).test(c.label))).map(([name]) => name as string);
          const named = deductedFamilies.length > 2 ? `${deductedFamilies.slice(0, -1).join(", ")} and ${deductedFamilies[deductedFamilies.length - 1]}` : deductedFamilies.join(" and ");
          multiples.enterpriseValue.basis += ` The debt-like obligations the DCF equity bridge deducts (${named}) are not added to the market EV.`;
        }
      }
      if (temporaryEquityNote !== null) notes.push(temporaryEquityNote);
      const nonOperatingTotal = components.reduce((sum, c) => sum + c.value, 0);
      const runOpts: DcfRunOptions = {
        waccPct: inputs.waccPct,
        netDebt: netDebtForBridge,
        dilutedShares: inputs.dilutedShares,
        minorityInterest: inputs.minorityInterest ?? null,
        preferred: inputs.preferred ?? null,
        ...(temporaryEquityDisclosure !== null ? { temporaryEquity: temporaryEquityDisclosure } : {}),
        ...(noncontrollingEarningsShare !== null ? { noncontrollingEarningsShare, noncontrollingEarningsAsOf, ...(noncontrollingEarningsBasis !== undefined ? { noncontrollingEarningsBasis } : {}) } : {}),
        ...(components.length > 0 ? { nonOperatingAssets: nonOperatingTotal, nonOperatingComponents: components } : {}),
      };
      dcf = runDcf(assumptions, runOpts);
      // Audit 2026-10-22 B-29: a DCF outside its domain publishes nothing
      // built from its per-share. The bridge and year rows stay, so a reader
      // sees why; the critical gap names the failed test.
      const domain = dcfDomainFailure(dcf);
      if (domain !== null) {
        dcf.domain = domain;
        dcf.perShare = null;
        notes.push(`${domain.reason}.`);
        gaps.push(gapEntry("valuation.dcf.domain", domain.reason, "critical"), ...dcf.gaps);
        return { kind: "dcf", route: route.base, assumptions, dcf, sensitivity: null, growthMarginGrid: null, reverseDcf: null, multiples, notes, gaps };
      }
      // E-5: inside its domain, but the NCI claim cannot be sized. The bridge
      // stays visible at book; nothing built from the per-share is published.
      // The NCI reason leads only when no earlier gate (shares, net debt)
      // had already withheld the per-share value.
      // FIN-119: a refused temporary-equity operand, or an unsplit total beside the
      // E-5 earnings key (the unsplit amount may be NCI the key already sizes),
      // leaves the claim unknown: the per share is withheld, never zero-filled (D-87).
      // `runDcf` already withheld the unsplit-beside-earnings-key case (and put its gap in `dcf.gaps`).
      const refusedReason = temporaryRefusal !== null
        ? `Temporary equity cannot be admitted as a claim: ${temporaryRefusal}. The per-share value is withheld: the redeemable preferred and redeemable noncontrolling claims are unknown, not zero (FIN-119).`
        : null;
      const temporaryEquityWithheld = refusedReason ?? dcf.temporaryEquityWithheld ?? null;
      if (noncontrollingKeyMissing !== null || temporaryEquityWithheld !== null) {
        // Each reason is recorded as the cause only when no earlier gate (shares, net debt) had already withheld the per share.
        if (noncontrollingKeyMissing !== null && dcf.perShare !== null) dcf.noncontrollingKeyWithheld = noncontrollingKeyMissing;
        if (refusedReason !== null && dcf.perShare !== null) dcf.temporaryEquityWithheld = refusedReason;
        dcf.perShare = null;
        dcf.equityValue = null;
        if (noncontrollingKeyMissing !== null) {
          notes.push(noncontrollingKeyMissing);
          gaps.push(gapEntry("valuation.dcf.noncontrollingEarningsKey", noncontrollingKeyMissing, "warn"));
        }
        if (temporaryEquityWithheld !== null) {
          notes.push(temporaryEquityWithheld);
          if (refusedReason !== null) gaps.push(gapEntry("valuation.dcf.temporaryEquityAllocation", refusedReason, "warn"));
        }
        gaps.push(...dcf.gaps);
        return { kind: "dcf", route: route.base, assumptions, dcf, sensitivity: null, growthMarginGrid: null, reverseDcf: null, multiples, notes, gaps };
      }
      // AMZN audit 2026-10-20: the improving fade is a judgment, so the reader
      // sees what it is worth: the value with the margin held at today's level.
      const fade = assumptions.improvingMarginFade;
      if (fade !== undefined && dcf.perShare !== null) {
        const flat = runDcf(
          { ...assumptions, ebitMarginPath: { ...assumptions.ebitMarginPath, value: assumptions.ebitMarginPath.value.map(() => fade.currentPct) } },
          runOpts,
        );
        if (flat.perShare !== null) {
          const text = `margin-fade sensitivity: ${fmtNum(dcf.perShare)} a share on the faded path to ${fmtNum(fade.targetPct)}%, ` +
            `${fmtNum(flat.perShare)} with the margin held flat at ${fmtNum(fade.currentPct)}%`;
          assumptions.ebitMarginPath.basis = `${assumptions.ebitMarginPath.basis}; ${text}`;
          notes.push(`DCF ${text}.`);
        }
      }
      sensitivity = sensitivityGrid(assumptions, runOpts);
      growthMargin = growthMarginGrid(assumptions, runOpts);
      // D-60: the terminal transition, stated. The explicit years reinvest
      // revenue growth / sales-to-capital; the Gordon year reinvests g / RONIC.
      // Where the two conventions disagree FCFF steps at year N+1, and the
      // reader should see that it is a convention meeting, not a forecast.
      const lastRow = dcf.yearRows.at(-1);
      if (lastRow && lastRow.nopat > 0) {
        const wTerm = (assumptions.wacc.value - dcf.gTermUsedPct) / 100;
        const fcffNext = dcf.terminalValue * wTerm;
        const roicTerm = assumptions.terminal.roicTermPct.value;
        const termReinvest = roicTerm > 0 ? Math.min(1, dcf.gTermUsedPct / roicTerm) : 0;
        const lastReinvest = lastRow.reinvestment / lastRow.nopat;
        const impliedRonic = (lastRow.nopat / lastRow.revenue) * assumptions.salesToCapital.value * 100;
        const step = lastRow.fcff !== 0 ? (fcffNext / lastRow.fcff - 1) * 100 : null;
        const text =
          `terminal transition: FCFF ${fmtMoney(lastRow.fcff)} in year ${lastRow.year} becomes ${fmtMoney(fcffNext)} in year ${lastRow.year + 1}` +
          `${step === null ? "" : ` (${step >= 0 ? "+" : ""}${fmtNum(step)}%)`}: reinvestment moves from ${fmtNum(lastReinvest * 100)}% of NOPAT ` +
          `(revenue growth / sales-to-capital, an implied return on new capital of ${fmtNum(impliedRonic)}%) to ${fmtNum(termReinvest * 100)}% ` +
          `(terminal growth ${fmtNum(dcf.gTermUsedPct)}% / terminal ROIC ${fmtNum(roicTerm)}%). The step is where the two reinvestment conventions meet, not a forecast (D-60 disclosure)`;
        assumptions.terminal.reinvestmentRate = { ...assumptions.terminal.reinvestmentRate, basis: `${assumptions.terminal.reinvestmentRate.basis}; ${text}` };
        notes.push(`DCF ${text}.`);
      }
      // D-60: say which share count divides the equity value. The weighted
      // diluted count includes option and RSU dilution; a quote's market cap
      // divides by basic shares outstanding at the quote date.
      const quotePrice = inputs.multiples.quote.price;
      const quoteCap = inputs.multiples.quote.marketCap;
      if (isNum(inputs.dilutedShares) && inputs.dilutedShares > 0 && isNum(quotePrice) && quotePrice > 0 && isNum(quoteCap) && quoteCap > 0) {
        const implied = quoteCap / quotePrice;
        const diff = (inputs.dilutedShares / implied - 1) * 100;
        // D-65: the reader sees both share counts beside the bridge.
        dcf.bridge.sharesOutstandingAtQuote = implied;
        if (Math.abs(diff) >= 0.1) {
          // FIN-404: the wording follows how the count was formed (filed, a loss period's basic count plus a profitable period's award dilution, or a loss period's basic count alone).
          const divisorBasis = inputs.dilutedShareDivisor?.basis ?? "filed";
          const head = divisorBasis === "filed"
            ? `Per-share values divide by the latest weighted-average diluted share count, ${fmtMoney(inputs.dilutedShares)}`
            : divisorBasis === "loss-period-substituted"
              ? `Per-share values divide by the latest period's basic count plus the award dilution of the profitable period ending ${inputs.dilutedShareDivisor?.donorDate ?? "?"} (the latest period is a loss, so its filed diluted count carries none), ${fmtMoney(inputs.dilutedShares)}`
              : `Per-share values divide by the latest period's basic count, ${fmtMoney(inputs.dilutedShares)}, which carries no option or RSU dilution (the latest period is a loss and no profitable period in the filed history shows any)`;
          const tail = divisorBasis === "loss-period-basic"
            ? "The gap is repurchases or issuance since the quarter, and the per-share value does not carry the option and RSU dilution the market cap omits (D-60 disclosure)."
            : "The gap is option and RSU dilution plus repurchases or issuance since the quarter; the diluted count is kept so the per-share value carries the dilution the market cap omits (D-60 disclosure).";
          notes.push(`${head}; the quoted market cap implies ${fmtMoney(implied)} shares outstanding at the quote, ${fmtNum(Math.abs(diff))}% ${diff > 0 ? "fewer" : "more"}. ${tail}`);
        }
      }
      // The reverse DCF solves for the growth the market cap implies, so it
      // needs the quote and the model in one known currency; the DCF and its
      // grid are price-free and stand either way.
      if (quoteComparison.comparable) {
        reverse = reverseDcf(inputs.currentPrice, assumptions, runOpts);
      } else {
        gaps.push(
          gapEntry(
            "valuation.reverseDcf.currency",
            `${quoteComparison.reason} — the reverse DCF sets the market price against the model, so it is withheld; the DCF per share stands in the model's currency`,
            "warn",
          ),
        );
      }
      // Hoist the DCF and reverse-DCF model gaps too. The earlier hoist covered
      // only the multiples channel, so a suppressed equity bridge or an
      // unsolvable reverse DCF stayed invisible in the manifest — the same
      // defect, on the model that carries the headline number.
      gaps.push(...dcf.gaps, ...(reverse?.gaps ?? []));
      // FIN-119: a grid cell withheld by the unsplit rule is said once for the run, even when the base per share published.
      const cellNote = [sensitivity, growthMargin].flatMap((g) => g?.notes ?? []).find((n) => n.startsWith(UNSPLIT_CELLS_LEAD));
      if (cellNote !== undefined && !gaps.some((g) => g.field === "valuation.dcf.temporaryEquityAllocation")) {
        gaps.push(gapEntry("valuation.dcf.temporaryEquityAllocation", cellNote, "warn"));
      }
    }
  }
  return { kind: "dcf", route: route.base, assumptions, dcf, sensitivity, growthMarginGrid: growthMargin, reverseDcf: reverse, multiples, notes, gaps };
}
