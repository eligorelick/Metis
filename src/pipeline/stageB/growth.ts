/**
 * Stage B — Growth: revenue/EPS/FCF CAGRs, margin series + trends,
 * revenue acceleration.
 *
 * Pure, deterministic TypeScript: no network, no DB, no LLM.
 * Input rows use FMP's exact field names; the integration
 * layer wires the DataBundle into these interfaces.
 *
 * Contract rules honored here:
 * - Missing inputs never throw → partial results + ManifestEntry-compatible gaps.
 * - Every house-rule threshold is annotated in notes[] instead of silently applied.
 * - Full precision is returned; rounding happens only at display time.
 * - CAGR is undefined across sign flips (or non-positive endpoints) → null + note.
 * - Windows degrade to available history; the actual span is annotated.
 */

import type { ManifestEntry } from "@/types/core";
import { deriveFcf } from "@/pipeline/stageB/financialValues";
import { normalizeQuarterRows, type FiscalDatedRow } from "@/pipeline/stageB/quarterWindows";

// ---------------------------------------------------------------------------
// Input interfaces — field names exactly as FMP returns them
// ---------------------------------------------------------------------------

export interface GrowthIncomeRow extends FiscalDatedRow {
  fieldProvenance?: Record<string, { periodStart?: string | null } | undefined>;
  /** Fiscal period end, ISO yyyy-mm-dd. */
  date: string;
  /** Filing recency, used ONLY to pick the surviving row of a restated period. */
  acceptedDate?: string | null;
  filingDate?: string | null;
  revenue?: number | null;
  grossProfit?: number | null;
  operatingIncome?: number | null;
  operatingBasis?: string;
  netIncome?: number | null;
  epsDiluted?: number | null;
}

export interface GrowthCashFlowRow extends FiscalDatedRow {
  fieldProvenance?: Record<string, { periodStart?: string | null } | undefined>;
  /** Fiscal period end, ISO yyyy-mm-dd. */
  date: string;
  /** Filing recency, used ONLY to pick the surviving row of a restated period. */
  acceptedDate?: string | null;
  filingDate?: string | null;
  freeCashFlow?: number | null;
  operatingCashFlow?: number | null;
  /** FMP reports capex NEGATIVE (freeCashFlow = operatingCashFlow + capitalExpenditure). */
  capitalExpenditure?: number | null;
}

/** Missing periods inside the observed window cannot disappear from a trend. */
export function interiorMissingDates(points: readonly {date:string;value:number|null}[]): string[] {
  const first=points.findIndex(p=>p.value!==null);
  const last=points.findLastIndex(p=>p.value!==null);
  return first<0 ? [] : points.slice(first,last+1).filter(p=>p.value===null).map(p=>p.date);
}

export interface MissingFiscalInterval { after: string; before: string; fiscalYears: number[]; label: string }
function annualDay(value: unknown): number | null {
  if(typeof value!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms=Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0,10)===value ? ms : null;
}

/** Retain only identities of rejected/excluded records, never their values or
 * superseded copies of an admitted row. These are barriers, not absent slots. */
export function rejectedAnnualCadenceRows(rows: readonly FiscalDatedRow[], rejected: readonly {period:string}[]): FiscalDatedRow[] {
  const periods=new Set(rejected.flatMap(row=>row.period.split(" / ")));
  return rows.filter(row=>periods.has(String(row.date || "<missing>")))
    .map(row=>({date:row.date,fiscalYear:row.fiscalYear,period:undefined}));
}

/** A known recorded period can withhold an interior trend without asserting
 * that a filing is absent or inventing a valid date for a malformed record. */
export function unavailableAnnualPeriods(history: readonly FiscalDatedRow[], barriers: readonly FiscalDatedRow[] = []): string[] {
  const dates=history.flatMap(row=>annualDay(row.date)===null ? [] : [String(row.date)]).sort();
  if(!dates.length) return [];
  const years=history.flatMap(row=>/^\d{4}$/.test(String(row.fiscalYear)) ? [Number(row.fiscalYear)] : []);
  return [...new Set(barriers.flatMap(row=>{
    const date=annualDay(row.date)===null ? null : String(row.date);
    const year=/^\d{4}$/.test(String(row.fiscalYear)) ? Number(row.fiscalYear) : null;
    if(date!==null ? date<dates[0]! || date>dates.at(-1)! : year!==null && years.length && (year<Math.min(...years) || year>Math.max(...years))) return [];
    const identity=date!==null ? `${date}${year===null ? "" : ` (FY ${year})`}` : year!==null ? `FY ${year}` : "of unknown date and fiscal year";
    return [`recorded annual period ${identity} unavailable after normalization`];
  }))];
}

/** An absent slot needs an established annual cadence, explicit fiscal labels
 * and actual annual durations. Calendar labels or a long day gap alone do not
 * establish it. Never invent a period end for a missing filing. */
export function missingAnnualIntervals(rows: readonly FiscalDatedRow[]): MissingFiscalInterval[] {
  if(rows.length<3) return [];
  const entries=rows.map(r=>{
    const proof=r.fieldProvenance as Record<string,{periodStart?:string|null}> | undefined;
    const start=typeof r.periodStart==="string" && r.periodStart ? r.periodStart : proof?.revenue?.periodStart;
    const end=typeof r.date==="string" ? r.date : "", endMs=annualDay(end), startMs=annualDay(start);
    const year=/^\d{4}$/.test(String(r.fiscalYear)) && Number(r.fiscalYear)>=1900 ? Number(r.fiscalYear) : null;
    const days=endMs!==null && startMs!==null ? (endMs-startMs)/86400000+1 : 0;
    const point=r.period==="FY" && year!==null && start && startMs!==null && endMs!==null && [364,365,366,371].includes(days)
      ? {start,end,year,days,startMs,endMs} : null;
    return {endMs,year,point};
  });
  // An invalid end can still locate an internal barrier by its explicit FY.
  // With neither date nor fiscal identity, its position cannot be established.
  const unplaced=entries.filter(e=>e.endMs===null);
  if(unplaced.some(e=>e.year===null)) return [];
  type Point=NonNullable<typeof entries[number]["point"]>;
  const compatible=(a:Point,b:Point):boolean=>{
    const n=b.year-a.year, elapsed=(b.endMs-a.endMs)/86400000;
    if(n<1 || n>10 || b.startMs<=a.endMs || n===1 && b.startMs-a.endMs!==86400000) return false;
    const calendar=[a,b].every(p=>[365,366].includes(p.days)) && a.start.slice(5)===b.start.slice(5) && a.end.slice(5)===b.end.slice(5);
    const weekly=[a,b].every(p=>[364,371].includes(p.days)) && new Date(a.endMs).getUTCDay()===new Date(b.endMs).getUTCDay();
    return calendar && Math.abs(elapsed-n*365.2425)<=2 || weekly && Math.abs(elapsed-n*364)<=7;
  };
  const out: MissingFiscalInterval[]=[];
  let run:Point[]=[];
  const finish=()=>{
    // A consecutive pair must independently establish THIS coherent run.
    if(run.length>=3 && run.some((p,i)=>i>0 && p.year===run[i-1]!.year+1 && p.startMs-run[i-1]!.endMs===86400000)) {
      for(let i=1;i<run.length;i++) {
        const a=run[i-1]!,b=run[i]!,n=b.year-a.year;
        if(n<2) continue;
        const fiscalYears=Array.from({length:n-1},(_,j)=>a.year+j+1);
        out.push({after:a.end,before:b.end,fiscalYears,label:`absent fiscal slot${fiscalYears.length>1?"s":""} ${fiscalYears.map(y=>`FY ${y}`).join(", ")} between ${a.end} and ${b.end}`});
      }
    }
    run=[];
  };
  for(const entry of entries.filter(e=>e.endMs!==null).sort((a,b)=>a.endMs!-b.endMs!)) {
    const p=entry.point, prior=run.at(-1);
    // Present but unsupported rows divide runs; never filter them out and join
    // their neighbours into an invented absent interval.
    if(!p) { finish(); continue; }
    if(prior && (!compatible(prior,p) || unplaced.some(e=>e.year!>=prior.year && e.year!<=p.year))) finish();
    run.push(p);
  }
  finish();
  return out;
}

export interface GrowthOptions {
  /** Only annual rows are supported in v1 — quarterly CAGRs are not meaningful here. */
  period: "annual";
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export const CAGR_WINDOWS = [1, 3, 5, 10] as const;
export type CagrWindow = (typeof CAGR_WINDOWS)[number];

export interface CagrPoint {
  /** The requested window (1/3/5/10 years). */
  windowYears: CagrWindow;
  /** The span actually used (available history may be shorter). Null when uncomputable. */
  actualYears: number | null;
  /** Annualized growth in percent (full precision). Null on sign flip / missing data. */
  cagrPct: number | null;
  startDate: string | null;
  endDate: string | null;
  startValue: number | null;
  endValue: number | null;
  note?: string;
}

/**
 * Tolerance for "the span is the window", covering 52/53-week fiscal calendars
 * (a 53-week year is ~1.019 years, so a 5-year window can legitimately measure
 * ~5.1 years).
 */
export const CAGR_SPAN_TOLERANCE_YEARS = 0.25;

/**
 * A window's CAGR, but only when the span actually measured IS that window.
 *
 * `actualYears` can differ from `windowYears` in both directions — short when
 * history runs out, and LONG when a restated fiscal year is collapsed out of
 * the series. The degraded value stays in the displayed series (with its
 * span); a consumer that names the window — grading, the DCF growth anchor,
 * the data-only achievable-growth comparison — reads it through here.
 * `excludedSpanYears` is the measured span of a computed CAGR rejected for
 * not matching, so the consumer can say why. Absent `actualYears`
 * (hand-built fixtures) is treated as matching.
 */
export function windowCagr(
  rows: ReadonlyArray<{ windowYears: number; cagrPct: number | null; actualYears?: number | null }>,
  window: number,
): { cagrPct: number | null; excludedSpanYears: number | null } {
  const p = rows.find((c) => c.windowYears === window);
  if (!p || !isFiniteNumber(p.cagrPct)) return { cagrPct: null, excludedSpanYears: null };
  if (isFiniteNumber(p.actualYears) && Math.abs(p.actualYears - window) > CAGR_SPAN_TOLERANCE_YEARS) {
    return { cagrPct: null, excludedSpanYears: p.actualYears };
  }
  return { cagrPct: p.cagrPct, excludedSpanYears: null };
}

export interface MarginPoint {
  date: string;
  /** Margin in percent, full precision; null when revenue ≤ 0 or numerator missing. */
  pct: number | null;
}

/**
 * A current margin score may use at most the preceding annual reporting cycle.
 * The 1.25-year house tolerance accommodates 52/53-week years and period-end
 * shifts. Compare fiscal observations, not the replay/analysis clock. Missing,
 * future or older evidence stays in the historical series but is not scored.
 */
export function scoringMargin(
  series: readonly MarginPoint[],
  latestStatementDate: string | null,
): { pct: number | null; date: string | null; reason: string | null } {
  const latest = [...series].reverse().find(row => isFiniteNumber(row.pct));
  if (!latest) return { pct: null, date: null, reason: "Gross margin unavailable." };
  const age = latestStatementDate ? yearsBetweenDates(latest.date, latestStatementDate) : null;
  if (age === null || age < 0 || age > 1.25) {
    return { pct: null, date: latest.date,
      reason: `Gross margin at ${latest.date} withheld from current scoring: observation must be dated, not future, and within one annual reporting cycle (1.25-year tolerance) of the latest statement ${latestStatementDate ?? "unavailable"}.` };
  }
  return { pct: latest.pct, date: latest.date, reason: null };
}

export interface MarginTrend {
  missingIntervals?: MissingFiscalInterval[];
  /** Oldest → newest, up to MARGIN_SERIES_MAX_YEARS annual observations. */
  series: MarginPoint[];
  /**
   * Least-squares slope in percentage points per year over the annual series
   * (actual elapsed fiscal years). Null when fewer than REGRESSION_MIN_POINTS non-null points.
   */
  slopePctPtsPerYear: number | null;
  note?: string;
}

/** Displayed history is distinct from the window a valuation selects. Derive
 * support from recorded points so saved computations need no new metadata.
 * Fiscal labels are optional, supplied only by the existing issuer-label view. */
export function operatingHistorySupport(trend: MarginTrend, fiscalLabels: ReadonlyMap<string,string> = new Map()): string | null {
  const points=[...trend.series].sort((a,b)=>a.date.localeCompare(b.date));
  const observed=points.filter(p=>isFiniteNumber(p.pct));
  const unsupported=points.filter(p=>!isFiniteNumber(p.pct));
  const absent=trend.missingIntervals ?? [];
  if(!points.length || !unsupported.length && !absent.length) return null;
  const period=(p:MarginPoint)=>`${p.date}${fiscalLabels.has(p.date) ? ` (${fiscalLabels.get(p.date)})` : ""}`;
  return `Displayed operating-margin history: ${observed.length} observed annual margins across ${points.length} recorded annual rows from ${points[0]!.date} to ${points.at(-1)!.date}. ` +
    `Observed periods: ${observed.length ? observed.map(period).join(", ") : "none"}. ` +
    `Unsupported recorded periods: ${unsupported.length ? unsupported.map(period).join(", ") : "none"}. ` +
    (absent.length ? `Absent fiscal intervals: ${absent.map(p=>p.label).join("; ")}. ` : "") +
    "Model seed support, when used, is stated separately.";
}

export interface RevenueAcceleration {
  latestYoyPct: number | null;
  threeYearCagrPct: number | null;
  /** latestYoyPct − threeYearCagrPct, in percentage points. */
  deltaPctPts: number | null;
  /** True when the latest YoY exceeds the 3y CAGR. Null when either input is null. */
  accelerating: boolean | null;
  note?: string;
}

/**
 * Log-linear trend fit: ln(value) = a + b·t over elapsed fiscal years, so the
 * annualized growth is exp(b) − 1. Unlike a two-endpoint CAGR it uses every
 * year on record; a spike or a collapse inside the window shows up in the fit
 * statistic (R²) instead of moving the whole anchor (D-18 growth anchor).
 */
export interface LogLinearTrend {
  /** exp(slope) − 1, percent per year. Null when the fit is unavailable. */
  growthPct: number | null;
  /** Least-squares slope of ln(value) on elapsed years. */
  slopePerYear: number | null;
  /** Coefficient of determination of the fit (0–1). */
  rSquared: number | null;
  /** Positive, finite observations that entered the fit. */
  n: number;
  startDate: string | null;
  endDate: string | null;
  note?: string;
}

export interface GrowthResult {
  /** Latest statement date used (fiscal period end) — provenance anchor. */
  asOf: string | null;
  period: "annual";
  revenueCagrs: CagrPoint[];
  /** Log-linear revenue trend over every annual year on record (D-18 growth-anchor method). */
  revenueLogLinear: LogLinearTrend;
  epsDilutedCagrs: CagrPoint[];
  fcfCagrs: CagrPoint[];
  margins: { gross: MarginTrend; operating: MarginTrend; net: MarginTrend };
  revenueAcceleration: RevenueAcceleration;
  notes: string[];
  gaps: ManifestEntry[];
}

// ---------------------------------------------------------------------------
// House-rule constants (annotated in notes whenever they bite)
// ---------------------------------------------------------------------------

/** Margin series depth (house rule: up to ten years). */
export const MARGIN_SERIES_MAX_YEARS = 10;
/** Minimum non-null points for a regression slope (house rule). */
export const REGRESSION_MIN_POINTS = 3;
/**
 * Tolerance (years) between index-implied and date-implied spans before the
 * date-based span is used and the irregularity is flagged. Wide enough for a
 * 52/53-week calendar (a week, ≈0.02y) and a fiscal-year-end shift of a few
 * weeks; narrow enough that a six- or seven-month transition period the
 * vendor serves as an "annual" row is compounded over its real span, not
 * annualised as a full year (the previous 0.6 let a half-year stub print a
 * one-year CAGR with no caveat).
 */
export const IRREGULAR_SPACING_TOLERANCE_YEARS = 0.1;

const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;

// ---------------------------------------------------------------------------
// Small pure helpers (exported for reuse by sibling Stage B modules and tests)
// ---------------------------------------------------------------------------

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Sort rows newest-first by ISO date (defensive — FMP is usually newest-first already). */
export function sortNewestFirst<T extends { date: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/**
 * Least-squares slope of y over x. Returns null when fewer than
 * REGRESSION_MIN_POINTS points survive null-filtering or x has no variance.
 */
export function linearRegressionSlope(
  points: ReadonlyArray<{ x: number | null; y: number | null }>,
): number | null {
  const clean = points.filter((p): p is { x: number; y: number } =>
    isFiniteNumber(p.x) && isFiniteNumber(p.y));
  if (clean.length < REGRESSION_MIN_POINTS) return null;
  const n = clean.length;
  const meanX = clean.reduce((s, p) => s + p.x, 0) / n;
  const meanY = clean.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of clean) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) * (p.x - meanX);
  }
  if (den === 0) return null;
  return num / den;
}

function fmt(n: number): string {
  return String(Number(n.toFixed(4)));
}

/**
 * Log-linear growth over every positive observation: OLS of ln(value) on
 * elapsed years since the oldest observation. Needs REGRESSION_MIN_POINTS
 * positive values; non-positive or missing values are excluded (a logarithm
 * has no value there) and the exclusion is noted. Returns the annualized
 * rate exp(b) − 1 together with the slope, R² and n so a reader can judge
 * how well a single trend describes the history.
 */
export function logLinearGrowth(
  points: ReadonlyArray<{ date: string; value: number | null }>,
): LogLinearTrend {
  const usable = points
    .filter((p): p is { date: string; value: number } => isFiniteNumber(p.value) && p.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const excluded = points.length - usable.length;
  const n = usable.length;
  const base: LogLinearTrend = {
    growthPct: null,
    slopePerYear: null,
    rSquared: null,
    n,
    startDate: usable[0]?.date ?? null,
    endDate: usable[n - 1]?.date ?? null,
  };
  const exclusionNote =
    excluded > 0 ? `${excluded} non-positive or missing observation(s) excluded from the log-linear fit` : null;
  if (n < REGRESSION_MIN_POINTS) {
    return {
      ...base,
      note: [`log-linear fit needs ≥${REGRESSION_MIN_POINTS} positive annual observations (${n} available)`, exclusionNote]
        .filter((s): s is string => s !== null)
        .join("; "),
    };
  }
  const xs = usable.map((p) => yearsBetweenDates(usable[0].date, p.date));
  if (xs.some((x) => x === null)) {
    return { ...base, note: "log-linear fit unavailable: unparseable fiscal dates" };
  }
  const x = xs as number[];
  const y = usable.map((p) => Math.log(p.value));
  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (x[i] - meanX) * (x[i] - meanX);
    sxy += (x[i] - meanX) * (y[i] - meanY);
    syy += (y[i] - meanY) * (y[i] - meanY);
  }
  if (sxx === 0) {
    return { ...base, note: "log-linear fit unavailable: no elapsed time between observations" };
  }
  const slope = sxy / sxx;
  const rSquared = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return {
    ...base,
    growthPct: (Math.exp(slope) - 1) * 100,
    slopePerYear: slope,
    rSquared,
    note: exclusionNote ?? undefined,
  };
}

export function yearsBetweenDates(olderIso: string, newerIso: string): number | null {
  const a = Date.parse(olderIso);
  const b = Date.parse(newerIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return (b - a) / MS_PER_YEAR;
}

/** True when any adjacent fiscal observation is not approximately annual. */
export function hasIrregularAnnualSpacing(datesOldestFirst: readonly string[]): boolean {
  for (let i = 1; i < datesOldestFirst.length; i++) {
    const years = yearsBetweenDates(datesOldestFirst[i - 1], datesOldestFirst[i]);
    if (years === null || years < 0.7 || years > 1.3) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// CAGR core
// ---------------------------------------------------------------------------

interface SeriesPoint {
  date: string;
  value: number | null;
}

/**
 * CAGR over a requested window against a newest-first annual series.
 * - Window degrades to available history (actualYears annotated).
 * - Sign flips / non-positive endpoints → cagrPct null + note (SPEC rule).
 * - Irregular fiscal spacing detected via dates → date-based span used + note.
 */
export function cagrForWindow(
  pointsNewestFirst: ReadonlyArray<SeriesPoint>,
  windowYears: CagrWindow,
): CagrPoint {
  const empty: CagrPoint = {
    windowYears,
    actualYears: null,
    cagrPct: null,
    startDate: null,
    endDate: null,
    startValue: null,
    endValue: null,
  };
  if (pointsNewestFirst.length === 0) {
    return { ...empty, note: "no data" };
  }

  // End = most recent finite value (walk inward if the latest is null).
  let endIdx = 0;
  while (endIdx < pointsNewestFirst.length && !isFiniteNumber(pointsNewestFirst[endIdx].value)) {
    endIdx += 1;
  }
  if (endIdx >= pointsNewestFirst.length) {
    return { ...empty, note: "no finite values in series" };
  }
  const notes: string[] = [];
  if (endIdx > 0) {
    notes.push(`latest ${endIdx} period(s) missing — endpoint moved to ${pointsNewestFirst[endIdx].date}`);
  }

  // Start = value `windowYears` periods older, degraded to oldest available,
  // then walked toward the endpoint until a finite value is found.
  let startIdx = Math.min(endIdx + windowYears, pointsNewestFirst.length - 1);
  while (startIdx > endIdx && !isFiniteNumber(pointsNewestFirst[startIdx].value)) {
    startIdx -= 1;
  }
  if (startIdx <= endIdx) {
    return {
      ...empty,
      endDate: pointsNewestFirst[endIdx].date,
      endValue: pointsNewestFirst[endIdx].value,
      note: "insufficient history (need at least two finite annual values)",
    };
  }

  const end = pointsNewestFirst[endIdx];
  const start = pointsNewestFirst[startIdx];
  const endValue = end.value as number;
  const startValue = start.value as number;

  // Span: index difference assumes annual spacing; cross-check against dates.
  let years: number = startIdx - endIdx;
  const dateYears = yearsBetweenDates(start.date, end.date);
  if (dateYears !== null && Math.abs(dateYears - years) > IRREGULAR_SPACING_TOLERANCE_YEARS) {
    notes.push(
      `irregular fiscal spacing: index-implied ${years}y vs date-implied ${fmt(dateYears)}y — date-based span used`,
    );
    years = dateYears;
  }
  if (years < windowYears - 0.001) {
    notes.push(`requested ${windowYears}y window, only ${fmt(years)}y of history available`);
  }

  const base: CagrPoint = {
    windowYears,
    actualYears: years,
    cagrPct: null,
    startDate: start.date,
    endDate: end.date,
    startValue,
    endValue,
    note: notes.length > 0 ? notes.join("; ") : undefined,
  };

  if (startValue <= 0 || endValue <= 0) {
    notes.push(
      `CAGR undefined across sign flip / non-positive endpoint (start=${fmt(startValue)}, end=${fmt(endValue)})`,
    );
    return { ...base, note: notes.join("; ") };
  }
  if (years <= 0) {
    notes.push("non-positive span — CAGR undefined");
    return { ...base, note: notes.join("; ") };
  }

  const cagrPct = (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
  return { ...base, cagrPct, note: notes.length > 0 ? notes.join("; ") : undefined };
}

// ---------------------------------------------------------------------------
// computeGrowth
// ---------------------------------------------------------------------------

export function computeGrowth(
  income: ReadonlyArray<GrowthIncomeRow>,
  cashflow: ReadonlyArray<GrowthCashFlowRow>,
  options: GrowthOptions,
): GrowthResult {
  const notes: string[] = [];
  const gaps: ManifestEntry[] = [];

  // Collapse restated/duplicate fiscal periods BEFORE any series is built.
  // FMP can return the same fiscal year twice (an original and its
  // restatement). Left in place, both rows entered every series: the CAGR
  // window counted one fiscal year as two, so an "N-year" CAGR spanned N-1
  // actual years and could anchor on the SUPERSEDED figure. The house rule is
  // the one `normalizeQuarterRows` already implements for quarters — whole
  // row, provably-latest filing wins, ambiguous duplicates rejected outright
  // rather than guessed at — and it is period-agnostic, so annual rows use it
  // unchanged.
  const incNorm = normalizeQuarterRows(income);
  const cfNorm = normalizeQuarterRows(cashflow);
  for (const { period, reason } of incNorm.rejected) {
    gaps.push({ field: "growth.incomeStatement.period", reason: `annual income period ${period} dropped: ${reason}`, severity: "warn" });
  }
  for (const { period, reason } of cfNorm.rejected) {
    gaps.push({ field: "growth.cashFlow.period", reason: `annual cash-flow period ${period} dropped: ${reason}`, severity: "warn" });
  }
  if (incNorm.rows.length !== income.length || cfNorm.rows.length !== cashflow.length) {
    notes.push(
      `Duplicate/restated annual periods collapsed before the growth series were built ` +
        `(income ${income.length}->${incNorm.rows.length}, cash flow ${cashflow.length}->${cfNorm.rows.length}); ` +
        "the most recently filed row wins.",
    );
  }

  const incomeFlows = withoutTransitionPeriods(sortNewestFirst(incNorm.rows));
  const cashFlows = withoutTransitionPeriods(sortNewestFirst(cfNorm.rows));
  const inc = incomeFlows.rows;
  const cf = cashFlows.rows;
  for (const [family, result] of [["incomeStatement", incomeFlows], ["cashFlow", cashFlows]] as const) {
    for (const w of result.withheld) gaps.push({field:`growth.${family}.transitionPeriod`, severity:"warn",
      reason:`Annual period ${w.date} covers ${w.days} days, a transition period rather than a fiscal year; withheld from annual growth, regression, projections, DCF history and ROIC.`});
  }

  if (inc.length === 0) {
    gaps.push({
      field: "growth.incomeStatement",
      reason: "no annual income-statement rows provided",
      severity: "critical",
    });
  }
  if (cf.length === 0) {
    gaps.push({
      field: "growth.fcf",
      reason: "no annual cash-flow rows provided — FCF CAGRs unavailable",
      severity: "warn",
    });
  }

  const asOf = inc[0]?.date ?? cf[0]?.date ?? null;

  // --- CAGR series -----------------------------------------------------------
  const revenueSeries: SeriesPoint[] = inc.map((r) => ({
    date: r.date,
    value: isFiniteNumber(r.revenue) ? r.revenue : null,
  }));
  const epsSeries: SeriesPoint[] = inc.map((r) => ({
    date: r.date,
    value: isFiniteNumber(r.epsDiluted) ? r.epsDiluted : null,
  }));

  let fcfDerivedFromComponents = false;
  const fcfSeries: SeriesPoint[] = cf.map((r) => {
    if (isFiniteNumber(r.freeCashFlow)) return { date: r.date, value: r.freeCashFlow };
    const derivedFcf = deriveFcf(r.operatingCashFlow, r.capitalExpenditure);
    if (derivedFcf !== null) {
      fcfDerivedFromComponents = true;
      return { date: r.date, value: derivedFcf };
    }
    return { date: r.date, value: null };
  });
  if (fcfDerivedFromComponents) {
    notes.push(
      "FCF derived as operatingCashFlow + capitalExpenditure (FMP capex negative) for rows missing freeCashFlow",
    );
  }
  if (inc.length > 0 && epsSeries.every((p) => p.value === null)) {
    gaps.push({
      field: "growth.epsDiluted",
      reason: "epsDiluted missing on all income rows",
      severity: "warn",
    });
  }

  const revenueCagrs = CAGR_WINDOWS.map((w) => cagrForWindow(revenueSeries, w));
  const revenueLogLinear = logLinearGrowth(revenueSeries);
  const epsDilutedCagrs = CAGR_WINDOWS.map((w) => cagrForWindow(epsSeries, w));
  const fcfCagrs = CAGR_WINDOWS.map((w) => cagrForWindow(fcfSeries, w));

  // A CAGR whose requested horizon was not met is still labelled "10y"/"5y"
  // downstream: the payload forwards windowYears but neither `actualYears` nor
  // the per-point note, so a 4-year span could be read and cited as a ten-year
  // compound growth rate. Fold the shortfall into GrowthResult.notes, which the
  // payload already serializes, so the horizon actually used is stated wherever
  // the figure is used.
  const pushHorizonNotes = (label: string, points: readonly CagrPoint[]): void => {
    for (const p of points) {
      if (p.cagrPct === null || !isFiniteNumber(p.actualYears)) continue;
      // SYMMETRIC. Guarding only the short side missed the opposite failure the
      // annual dedupe can now create: collapsing a restated year removes a data
      // point, so a "3y" window can span FOUR actual years and be read as a
      // three-year compound rate.
      if (Math.abs(p.actualYears - p.windowYears) <= 0.05) continue;
      const longer = p.actualYears > p.windowYears;
      notes.push(
        `${label} ${p.windowYears}y CAGR is computed over ${p.actualYears.toFixed(1)} years ` +
          `(${p.startDate ?? "?"} → ${p.endDate ?? "?"}) — ` +
          (longer
            ? `a LONGER span than the ${p.windowYears}-year label, because an intervening fiscal period is unavailable; `
            : `the full ${p.windowYears}-year history is unavailable; `) +
          "read it as that span, not as the labelled horizon.",
      );
    }
  };
  pushHorizonNotes("Revenue", revenueCagrs);
  pushHorizonNotes("Diluted EPS", epsDilutedCagrs);
  pushHorizonNotes("Free cash flow", fcfCagrs);

  // --- Margin series + trend ---------------------------------------------------
  const marginRows = sortNewestFirst(incNorm.rows).slice(0, MARGIN_SERIES_MAX_YEARS).reverse(); // oldest → newest
  // Normalization rejects malformed or ambiguous records before building the
  // financial series. Retain their identities as cadence barriers only: a
  // rejected recorded period is not an entirely absent filing. Superseded
  // copies of an admitted period are not reintroduced.
  const rejectedCadenceRows=rejectedAnnualCadenceRows(income,incNorm.rejected);
  const missingIntervals=missingAnnualIntervals([...marginRows,...rejectedCadenceRows]);
  const buildMargin = (
    numerator: (r: GrowthIncomeRow) => number | null | undefined,
    label: string,
  ): MarginTrend => {
    const series: MarginPoint[] = marginRows.map((r) => {
      const num = numerator(r);
      const rev = r.revenue;
      if (!isFiniteNumber(num) || !isFiniteNumber(rev) || rev <= 0) {
        return { date: r.date, pct: null };
      }
      return { date: r.date, pct: (num / rev) * 100 };
    });
    const oldestDate = series[0]?.date;
    const interior = [...interiorMissingDates(series.map(p=>({date:p.date,value:p.pct}))),...missingIntervals.map(p=>p.label),
      ...unavailableAnnualPeriods(marginRows,rejectedCadenceRows)];
    const slope = interior.length ? null : linearRegressionSlope(
      series.map((p) => ({
        x: oldestDate === undefined ? null : yearsBetweenDates(oldestDate, p.date),
        y: p.pct,
      })),
    );
    const trendNotes: string[] = [];
    if (label === "operating" && marginRows.some(r => r.operatingBasis)) {
      trendNotes.push("Operating-margin evidence is assessed period by period; a filed check on one row does not corroborate unverified provider rows elsewhere in this series");
    }
    if (series.some((p) => p.pct === null)) {
      trendNotes.push(`${label} margin null where revenue ≤ 0 or numerator missing`);
    }
    if (interior.length) {
      const reason=`${label} margin slope withheld across interior unavailable periods: ${interior.join(", ")}`;
      trendNotes.push(reason);
      notes.push(reason);
      gaps.push({field:`growth.margins.${label}.slope`,reason,severity:"info"});
    }
    if (slope === null && !interior.length && series.length > 0) {
      trendNotes.push(
        `slope requires ≥${REGRESSION_MIN_POINTS} non-null annual points (house rule)`,
      );
    }
    if (hasIrregularAnnualSpacing(series.map((p) => p.date))) {
      trendNotes.push("irregular fiscal spacing detected — slope uses actual elapsed fiscal years");
    }
    return {
      series,
      ...(missingIntervals.length ? {missingIntervals} : {}),
      slopePctPtsPerYear: slope,
      note: trendNotes.length > 0 ? trendNotes.join("; ") : undefined,
    };
  };

  const margins = {
    gross: buildMargin((r) => r.grossProfit, "gross"),
    operating: buildMargin((r) => r.operatingIncome, "operating"),
    net: buildMargin((r) => r.netIncome, "net"),
  };

  // --- Revenue acceleration: latest YoY vs 3y CAGR ------------------------------
  const yoyPoint = cagrForWindow(revenueSeries, 1);
  const threeYearPoint = revenueCagrs.find((c) => c.windowYears === 3) ?? cagrForWindow(revenueSeries, 3);
  // Latest YoY only counts when it truly spans ~1 year of history.
  const latestYoyPct =
    yoyPoint.endDate === inc[0]?.date && yoyPoint.cagrPct !== null && yoyPoint.actualYears !== null && yoyPoint.actualYears >= 0.75 && yoyPoint.actualYears <= 1.5
      ? yoyPoint.cagrPct
      : null;
  // Preserve degraded CAGR windows above, but a differently sized window
  // cannot serve as the explicitly named three-year acceleration benchmark.
  const threeYearSpanMatches = threeYearPoint.actualYears !== null &&
    Math.abs(threeYearPoint.actualYears - 3) <= 0.05;
  const threeYearCagrPct = threeYearSpanMatches ? threeYearPoint.cagrPct : null;
  const accelNotes: string[] = [
    "revenue acceleration = latest YoY minus 3y CAGR (house framing)",
  ];
  if (latestYoyPct === null) accelNotes.push("latest YoY unavailable");
  if (yoyPoint.endDate !== inc[0]?.date) accelNotes.push(`newest annual revenue ${inc[0]?.date ?? "unknown date"} unavailable; an older endpoint is not current growth`);
  if (!threeYearSpanMatches && threeYearPoint.cagrPct !== null) {
    const reason = `3y revenue acceleration benchmark withheld: actual span is ${threeYearPoint.actualYears?.toFixed(2) ?? "unknown"} years, outside the 3y horizon (±0.05y fiscal-calendar tolerance)`;
    accelNotes.push(reason);
    gaps.push({ field: "growth.revenueAcceleration.threeYearCagr", reason, severity: "info" });
  }
  if (threeYearCagrPct === null) accelNotes.push("3y revenue CAGR unavailable");
  const deltaPctPts =
    latestYoyPct !== null && threeYearCagrPct !== null ? latestYoyPct - threeYearCagrPct : null;
  const revenueAcceleration: RevenueAcceleration = {
    latestYoyPct,
    threeYearCagrPct,
    deltaPctPts,
    accelerating: deltaPctPts !== null ? deltaPctPts > 0 : null,
    note: accelNotes.join("; "),
  };

  return {
    asOf,
    period: options.period,
    revenueCagrs,
    revenueLogLinear,
    epsDilutedCagrs,
    fcfCagrs,
    margins,
    revenueAcceleration,
    notes,
    gaps,
  };
}

/** B5 OD-3/O-2: census gate found 0 full years below 357 days (51 weeks). */
export const TRANSITION_PERIOD_UNDER_DAYS = 357;
export function withoutTransitionPeriods<T extends { date?: unknown; fieldProvenance?: Record<string, { periodStart?: string | null } | undefined> }>(rowsNewestFirst: readonly T[]): { rows: T[]; withheld: {date:string;days:number}[] } {
  const withheld: {date:string;days:number}[] = [];
  const rows = rowsNewestFirst.filter((row, i) => {
    const date = typeof row.date === "string" ? row.date.slice(0,10) : "";
    const start = row.fieldProvenance?.revenue?.periodStart;
    const older = rowsNewestFirst[i+1]?.date;
    const days = typeof start === "string" ? (Date.parse(date) - Date.parse(start)) / 86400000 + 1
      : typeof older === "string" ? (Date.parse(date) - Date.parse(older)) / 86400000 : NaN;
    if (Number.isFinite(days) && days > 0 && days < TRANSITION_PERIOD_UNDER_DAYS) {
      withheld.push({date,days}); return false;
    }
    return true;
  });
  return {rows,withheld};
}
