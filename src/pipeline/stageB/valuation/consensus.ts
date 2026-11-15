/** Calendarized revenue consensus and dispersion; use proved fiscal windows (P1, P16; D-65, D-136). */
import { type AnalystEstimateRow, type DcfQuarterRevenue, type RevenueRunRate, type RevenueSeasonality, type FiscalYearToDate, type ConsensusPathRow } from "./assumptions";
import { posOrNull, isNum } from "./primitives";
import { thirteenWeekFactor, weeksOf, type FiscalYearRule, snapToFiscalYearEnd, fiscalYearEndFor } from "../fiscalCalendar";
import { forecastYearPeriod } from "./dcf";


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
  const latestFactor = thirteenWeekFactor(quarters.latest.days ?? null);
  const yearAgoFactor = thirteenWeekFactor(quarters.yearAgo.days ?? null);
  const latestQuarterWeeks = weeksOf(quarters.latest.days ?? null);
  const lengthNotes = [quarters.latest, quarters.yearAgo].flatMap((quarter) => {
    const weeks = weeksOf(quarter.days ?? null);
    if (quarter.days == null) return [`the quarter ending ${quarter.date}: length not established; read as 13 weeks`];
    return weeks !== null && weeks !== 13 ? [`the ${weeks}-week quarter ending ${quarter.date} on a 13-week basis (× 13/${weeks})`] : [];
  });
  const annualized = 4 * latest * latestFactor;
  const ratio = (latest * latestFactor) / (yearAgo * yearAgoFactor);
  const seasonallyNeutral = ttmRevenue * Math.pow(ratio, TTM_TO_LATEST_QUARTER_YEARS);
  const value = Math.min(Math.max(seasonallyNeutral, Math.min(annualized, ttmRevenue)), Math.max(annualized, ttmRevenue));
  return { value, latestQuarterEnd: ttmEnd, latestQuarterAnnualized: annualized, seasonallyNeutral, yoyPct: (ratio - 1) * 100,
    latestQuarterWeeks, lengthNote: lengthNotes.length > 0 ? lengthNotes.join("; ") : null };
}

/**
 * D-99 (seasonal consensus): each fiscal quarter's share of the last complete fiscal year's revenue,
 * first quarter first, or null unless the four reported quarters are consecutive 13/14-week quarters
 * ending on that year's end, each with positive revenue.
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
 * D-99 (seasonal consensus): the share of a fiscal year's revenue that falls in [from, to) when its
 * twelve months take the quarterly shape, each quarter's share spread evenly over its three months
 * and each month's over its days.
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

/* D-136, D-58, D-65: Calendarize consensus and guidance over the issuer fiscal windows using the established seasonal shape. */
export function calendarizeConsensusWindow(
  rows: AnalystEstimateRow[] | null,
  window: { startDate: string; endDate: string },
  reported?: FiscalYearToDate | null,
  seasonality?: RevenueSeasonality | null,
  calendar?: FiscalYearRule | null,
): { value: number | null; fiscalYears: ConsensusPathRow["fiscalYears"]; staleAgainstReported: boolean; partialSpread: "seasonal" | "even" | null } {
  const empty = { value: null, fiscalYears: [], staleAgainstReported: false, partialSpread: null };
  // D-99 (seasonal consensus): the quarterly shape applies to estimates for fiscal years ending on an
  // anniversary (within 10 days) of the year it was measured in; any other year keeps the even spread.
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
    if (revenue !== null && /^\d{4}-\d{2}-\d{2}$/.test(row.date.slice(0, 10))) {
      const date = snapToFiscalYearEnd(calendar ?? null, row.date.slice(0, 10));
      byDate.set(date, { ...row, date, revenueAvg: revenue });
    }
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
    // Established 52/53-week dates use the issuer's weekday rule. Each year
    // starts after the preceding snapped end, so adjacent years share no day.
    const span = previousEnd === null ? null : daysBetween(previousEnd, date);
    const chained = previousEnd !== null && span !== null && span >= YEAR_AGO_QUARTER_DAYS[0] && span <= YEAR_AGO_QUARTER_DAYS[1];
    // The first estimate (or one after a missing year) also needs the filed
    // calendar's start, even without YTD. A December rule can end in January.
    const endYear = Number(date.slice(0, 4));
    const ruleYear = calendar ? [endYear, endYear - 1].find(year => fiscalYearEndFor(calendar, year) === date) : undefined;
    const rulePreviousEnd = calendar && ruleYear !== undefined ? fiscalYearEndFor(calendar, ruleYear - 1) : null;
    const priorEnd = chained ? previousEnd : rulePreviousEnd;
    let fyStart = priorEnd === null ? Date.parse(fy.startDate) : Date.parse(priorEnd) + DAY_MS;
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
export { daysBetween, NEXT_QUARTER_DAYS, YEAR_AGO_QUARTER_DAYS, GUIDED_QUARTER_TO_YEAR_ONE_YEARS, LATEST_QUARTER_TO_YEAR_ONE_YEARS };
