/** Shared valuation arithmetic and policy constants; missing inputs stay gaps (P10, P16; D-104). */
import { millions, operatingLeaseOutOfDebt } from "@/pipeline/stageB/netDebt";
import { type ManifestEntry } from "@/types/core";
import { type GapCause } from "@/types/refusalCause";
import { type DcfIncomeRow, type DcfBalanceRow } from "./assumptions";
import { resolveConsolidatedEquity } from "@/pipeline/stageB/ownership";
import { temporaryEquityClaims } from "@/pipeline/stageB/seniorClaims";
import { medianOf } from "./statistics";


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
/* D-104: Establish sales-to-capital from compatible filed history before using it in valuation. */
export const S2C_HISTORY_MIN_YEARS = 3;
/* D-104: Establish sales-to-capital from compatible filed history before using it in valuation. */
export const S2C_HISTORY_MIN_RATIO = 0.1;
/**
 * D-65: the clause of the long-term-investments provenance that says what the sales-to-capital
 * denominator does with the holding. `compute.ts` writes it into the filed provenance; the bridge
 * swaps it for the exceed wording when the holding meets or exceeds invested capital (D-135), where
 * it would be untrue.
 */
export const LONG_TERM_INVESTMENTS_REMOVED_CLAUSE = "the amount the sales-to-capital denominator removes as non-operating";
export const TERMINAL_G_CAP_PCT = 2.5;

/* D-102: Use the evidenced starting return and converge payout to the terminal return and growth assumptions. */
export const TERMINAL_EXCESS_RETURN_CAP_PP = 5;
export const TERMINAL_EXCESS_RETURN_MIN_YEARS = 4;
/* D-102: Use the evidenced starting return and converge payout to the terminal return and growth assumptions. */
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
/* D-98: Use the evidenced margin regime and disclose the improving-margin fade assumption. */
export const IMPROVING_MARGIN_TREND_SHARE = 0.5;
/** Terminal-growth axis of the sensitivity grid (pp around the base terminal growth). */
export const SENSITIVITY_STEPS_PP: readonly number[] = [-1, -0.5, 0, 0.5, 1];
/* D-60: Vary WACC by the established sensitivity steps around the base assumption. */
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

/* D-135: Admit a finance-only lease total only when the filed finance amount establishes the total and no operating slice is known. */
export function financeLeaseOnlyTotal(total: number | null, operating: number | null | undefined, finance: number | null | undefined, conflict: string | null): number | null {
  if (total === null || total <= 0 || conflict !== null || isNum(operating) || !isNum(finance) || finance <= 0) return null;
  return Math.abs(finance - total) <= Math.max(1, Math.abs(total) * 1e-6) ? total : null;
}

/**
 * D-135: the EV basis clause for a finance-lease-only total. One wording for the live basis and for
 * the display-time correction of a stored report (`withLegacyBridgeMethod`, D-67).
 */
export function financeLeaseOnlyEvClause(total: number): string {
  return `the recorded finance-lease observation of ${millions(total)} stays in EV and net debt on both bases under the retained convention; operating-lease coverage remains unverified and EV uses the retained debt basis`;
}

const gapEntry = (
  field: string,
  reason: string,
  severity: ManifestEntry["severity"],
  /** P10, P11 (D-229): the typed cause beside the sentence, for the writers whose wording a reader tells apart. */
  cause?: GapCause,
): ManifestEntry => (cause === undefined ? { field, reason, severity } : { field, reason, severity, cause });

/* D-104, D-25: Establish sales-to-capital from compatible filed history before using it in valuation. */
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
    const ic = debt + equity + (temporary === null ? 0 : temporary.capitalTotal) - row.cashAndShortTermInvestments;
    const lti = isNum(row.longTermInvestments) && row.longTermInvestments > 0 ? row.longTermInvestments : 0;
    // D-135: a holding that meets or exceeds the year's capital leaves no operating capital; the
    // ratio approaches the house cap from below, so the year counts at the cap (never revenue over
    // the full capital).
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

/* D-58, D-99: Apply the domicile marginal tax floor without treating a loss-year effective rate as a stable tax assumption. */
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

const fmtMoney = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 1e12) return `${fmtNum(v / 1e12)}T`;
  if (a >= 1e9) return `${fmtNum(v / 1e9)}B`;
  if (a >= 1e6) return `${fmtNum(v / 1e6)}M`;
  return fmtNum(v);
};
export { posOrNull, isNum, fmtNum, fmtMoney, clampWithNote, zeroAsNull, gapEntry, fmtGrouped };
