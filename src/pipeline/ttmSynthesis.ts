/**
 * Trailing-twelve-month synthesis, split out of compute.ts: TTM income and cash flow from the latest
 * four contiguous, complete quarters in one established currency, and the statement currencies each
 * kind of figure is in. Annual never stands in for TTM (P1, P4, P13).
 */

import type { ManifestEntry } from "@/types/core";
import type { DataBundle, FmpFetch } from "@/pipeline/types";
import { operatingIncomeEvidenceForNonMargins, operatingIncomeForNonMargins, withFiledIncomeWindow } from "@/pipeline/incomeBasis";
import type { FmpCashFlowRow, FmpIncomeStatementRow, FmpRawRow } from "@/providers/fmp";
import { normalizeReportedCurrency } from "@/pipeline/stageB/sectorRouting";
import { type WaccOperatingEvidence } from "@/pipeline/stageB/returns";
import { constructCommonIncomeQuarterWindow, type CommonIncomeFlowScope } from "@/pipeline/stageB/securityBasis";
import { filedTaxOperandPair } from "@/edgar/incomeClassification";
import { adjacentQuarterEnds, normalizeQuarterRows, quarterWindowViolation, type FiscalDatedRow } from "@/pipeline/stageB/quarterWindows";
import { periodDays } from "@/pipeline/stageB/fiscalCalendar";
import { SPREAD_DAYS, firstRow, isoDay, num, rowsOf } from "./bundleRows";
import { type CurrencyEvidenceRow, quarterCurrency, resolveQuarterCurrency, windowCurrencyGap } from "./statementCurrency";
import { ttmTaxRatePretax } from "./taxEvidence";
import { commonIncomeEvidence, filedInterestOperand } from "./stageBAdapters";

// ---------------------------------------------------------------------------
// TTM synthesis: sum the latest 4 quarters for flow fields. Diluted EPS uses
// the separately labeled quarter-sum convention, not a reconstructed annual EPS.
// Returns null when fewer than 4 quarters are available.
// ---------------------------------------------------------------------------

export interface TtmIncome {
  /** Filed operands when the exact window is proved independently of quarter completeness. */
  filedIncomeFlows?: FmpIncomeStatementRow["fieldProvenance"];
  date: string;
  periodStart: string | null;
  periodStartBasis: "filed" | "prior-quarter-end" | null;
  days: number | null;
  /**
   * The window's one currency. ttmIncome returns no window at all when its
   * currency is not established, so a window it returns always carries one.
   */
  reportedCurrency: string | null;
  /** True when an unlabelled quarter's currency came from another statement of the same filing. */
  currencyFromSameFilingStatements: boolean;
  revenue: number | null;
  operatingIncome: number | null;
  nonMarginOperatingIncome?: number | null;
  operatingIncomeBasis?: string;
  operatingIncomeEvidence?: WaccOperatingEvidence;
  /** D-282: every quarter's interest expense is established for its own period end. */
  interestExpenseFiled?: true;
  depreciationAndAmortization: number | null;
  netIncome: number | null;
  netIncomeConsolidated?: number | null;
  netIncomeAttributableToNoncontrollingInterest?: number | null;
  /** Every quarter's NCI income came from a filed fact (field provenance), not a vendor default. */
  noncontrollingIncomeEvidenced?: boolean;
  /** A quarter reports zero NCI income without a filed fact: the sum may omit that quarter. */
  noncontrollingIncomeUnevidencedZero?: boolean;
  /** Complete four-quarter common-holder flow; never the latest quarter alone. */
  netIncomeAvailableToCommon?: number | null;
  commonIncomeWithheldReason?: string | null;
  netIncomeWithheldReason?: string | null;
  netIncomeOwnershipBasis?: "parent" | "consolidated";
  incomeScope?: CommonIncomeFlowScope;
  commonIncomeScope?: CommonIncomeFlowScope;
  noncontrollingIncomeScope?: CommonIncomeFlowScope;
  admissionAsOf?: string;
  targetScope?: CommonIncomeFlowScope;
  /** Sum of four reported quarterly diluted EPS observations, not full-period GAAP EPS. */
  epsDiluted: number | null;
  epsDilutedBasis: "sum-quarterly-diluted-eps" | null;
  ebit: number | null;
  interestExpense: number | null;
  incomeBeforeTax: number | null;
  incomeTaxExpense: number | null;
  /**
   * D-237 (P13): pre-tax income on the provision's own basis, the denominator of
   * the TTM effective tax rate: each quarter's filed pre-tax line before
   * equity-method results where the earnings admission recorded one
   * (`effectiveTaxPretaxIncome`), else its `incomeBeforeTax`. Gated with the pair.
   */
  taxRatePretaxIncome: number | null;
  taxRateIncomeTaxExpense?: number | null;
  taxRateOperandsFiled?: boolean;
  /** D-237 (P20): set when a quarter's base differs from its `incomeBeforeTax`; the disclosure, with each filed operand. */
  taxRatePretaxBasis: string | null;
  /** D-60: four-quarter gross profit, or null unless all four quarters report it. */
  grossProfit?: number | null;
}

interface NormalizedQuarterSet<T> {
  rows: T[];
  rejected: Array<{ period: string; reason: string }>;
}

function quarterRowsGap(
  family: "income" | "cashFlow" | "balance",
  rejected: ReadonlyArray<{ period: string; reason: string }>,
): ManifestEntry | null {
  if (rejected.length === 0) return null;
  const shown = rejected.slice(0, 8).map(({ period, reason }) => `${period}: ${reason}`);
  const omitted = rejected.length - shown.length;
  return {
    field: `compute.quarterRows.${family}`,
    reason: `${rejected.length} rejected quarterly period${rejected.length === 1 ? "" : "s"}: ${shown.join("; ")}${omitted > 0 ? `; +${omitted} more` : ""}`,
    severity: "info",
    attemptedSources: [
      family === "income"
        ? "fmp:/stable/income-statement?period=quarter"
        : family === "cashFlow"
          ? "fmp:/stable/cash-flow-statement?period=quarter"
          : "fmp:/stable/balance-sheet-statement?period=quarter",
    ],
  };
}

export function normalizeStatementQuarters<T extends FiscalDatedRow>(
  rows: readonly T[],
  family: "income" | "cashFlow" | "balance",
  gaps?: ManifestEntry[],
  source?: FmpFetch<FmpRawRow>,
): NormalizedQuarterSet<T> {
  const normalized = normalizeQuarterRows(rows);
  if (source?.ok) normalized.rejected.push(...(source.value.data.rejectedPeriods ?? []));
  const disclosure = quarterRowsGap(family, normalized.rejected);
  if (disclosure) gaps?.push(disclosure);
  return normalized;
}

export function rejectedAffectsCurrentWindow<T extends FiscalDatedRow>(
  normalized: NormalizedQuarterSet<T>,
): { period: string; reason: string } | null {
  if (normalized.rejected.length === 0) return null;
  const selected = normalized.rows.slice(0, 4);
  const oldestSelected = typeof selected[3]?.date === "string" ? selected[3].date : null;
  if (oldestSelected === null) return normalized.rejected[0];

  return normalized.rejected.find(({ period }) => {
    const prefix = /^(\d{4}-\d{2}-\d{2})/.exec(period)?.[1] ?? null;
    const orderable =
      prefix !== null && normalizeQuarterRows([{ date: prefix }]).rows.length === 1
        ? prefix
        : null;
    return orderable === null || orderable >= oldestSelected;
  }) ?? null;
}

function sumField(rows: FmpIncomeStatementRow[], key: keyof FmpIncomeStatementRow): number | null {
  let acc = 0;
  let seen = false;
  for (const r of rows) {
    const v = num(r[key]);
    if (v !== null) {
      acc += v;
      seen = true;
    }
  }
  return seen ? acc : null;
}

/** Non-null quarter count for a field (completeness gate for critical sums). */
function countField(rows: FmpIncomeStatementRow[], key: keyof FmpIncomeStatementRow): number {
  let n = 0;
  for (const r of rows) if (num(r[key]) !== null) n++;
  return n;
}

/** D-280: filed zero is disclosed; share the projection interest evidence test with TTM admission. */
export function disclosedProjectionInterest(row: FmpIncomeStatementRow, currency: string | null): boolean {
  const evidence = row.fieldProvenance?.interestExpense;
  return evidence?.source === "edgar" && evidence.periodEnd === isoDay(row.date) && currency !== null &&
    evidence.unit.toUpperCase() === currency && evidence.tags.length > 0 && evidence.filings.length > 0 &&
    row.fieldConflicts?.interestExpense === undefined;
}

/**
 * TTM income from the latest 4 quarterly income rows (newest first).
 *
 * Completeness gating (P1, P7): revenue routes the pre-revenue overlay
 * and seeds the DCF, so a 3-of-4-quarter partial sum labeled "TTM" silently
 * understates it ~25% — when any of the 4 quarters lacks revenue the WHOLE row
 * is null so every consumer falls back to the audited annual row on one
 * consistent basis. The tax pair (incomeTaxExpense / incomeBeforeTax) is gated
 * as a PAIR so effective-tax rates are never computed over mismatched quarter
 * subsets. A null field is missing data, not a zero: every other period-flow
 * value is individually suppressed unless all four quarters report it. That
 * prevents a smaller period from contaminating EBITDA/FFO, DCF EBIT,
 * net-income multiples, or the cost-of-debt proxy. Suppressions are disclosed
 * via `gaps`.
 *
 * Contiguity gating (P1): the 4 rows must also BE the last
 * four quarters — distinct period-ends, strictly descending, each gap ~1
 * quarter and total span ~3 quarters (52/53-week calendars accepted) — else
 * the whole row is suppressed with a disclosed gap and every consumer falls
 * back to the audited annual statement.
 */

export function ttmIncome(
  quarterly: FmpIncomeStatementRow[],
  gaps?: ManifestEntry[],
  /** Same-period balance-sheet / cash-flow quarters: currency evidence for unlabelled quarters. */
  siblings: readonly CurrencyEvidenceRow[] = [],
): TtmIncome | null {
  const normalized = normalizeStatementQuarters(quarterly, "income", gaps);
  return ttmIncomeFromNormalized(normalized, gaps, siblings);
}

/** Filed starts take precedence; quarterly inference requires an adjacent predecessor. */
export function incomePeriod(row: FmpIncomeStatementRow, previous?: FmpIncomeStatementRow, basis: "quarter" | "annual" = "quarter"): {
  periodStart: string | null; periodStartBasis: "filed" | "prior-quarter-end" | null; days: number | null;
} {
  const end = String(row.date ?? "");
  const filed = row.fieldProvenance?.revenue?.periodStart;
  if (filed != null) {
    const days = periodDays(filed, end);
    return { periodStart: days === null ? null : filed, periodStartBasis: days === null ? null : "filed", days };
  }
  const prior = String(previous?.date ?? "");
  // Missing earlier history does not establish a multi-quarter duration. Annual
  // fallback is separate: its predecessor is the prior annual period, not a quarter.
  if (basis === "quarter" && !adjacentQuarterEnds(end, prior)) {
    return { periodStart: null, periodStartBasis: null, days: null };
  }
  const span = periodDays(prior, end);
  if (span === null || span <= 1) return { periodStart: null, periodStartBasis: null, days: null };
  return { periodStart: new Date(Date.parse(prior) + SPREAD_DAYS).toISOString().slice(0, 10), periodStartBasis: "prior-quarter-end", days: span - 1 };
}

export function ttmIncomeFromNormalized(
  normalized: NormalizedQuarterSet<FmpIncomeStatementRow>,
  gaps?: ManifestEntry[],
  siblings: readonly CurrencyEvidenceRow[] = [],
  admissionAsOf?: string,
): TtmIncome | null {
  const rejected = rejectedAffectsCurrentWindow(normalized);
  if (rejected) {
    gaps?.push({
      field: "compute.ttmIncome",
      reason: `current TTM window is uncertain because fiscal period ${rejected.period} was rejected (${rejected.reason}) — TTM basis suppressed; latest annual statement used instead`,
      severity: "info",
      attemptedSources: ["fmp:/stable/income-statement?period=quarter"],
    });
    return null;
  }
  if (normalized.rows.length < 4) return null;
  const q = normalized.rows.slice(0, 4);

  // Contiguity gate (P1): a non-TTM window must never be labeled TTM.
  // The 5th row (when present) lets the gate check the OLDEST quarter's own
  // duration, so a transition/stub period cannot enter the TTM sum unchecked.
  const violation = quarterWindowViolation(q, normalized.rows[4] ?? null);
  if (violation !== null) {
    gaps?.push({
      field: "compute.ttmIncome",
      reason: `latest 4 quarterly rows do not form a contiguous trailing twelve months (${violation}) — TTM basis suppressed; latest annual statement used instead`,
      severity: "info",
      attemptedSources: ["fmp:/stable/income-statement?period=quarter"],
    });
    return null;
  }

  const windowCurrency = resolveQuarterCurrency(q, siblings);
  const currencyGap = windowCurrencyGap("income", windowCurrency, "fmp:/stable/income-statement?period=quarter");
  if (currencyGap !== null || windowCurrency.state !== "known") {
    if (currencyGap !== null) gaps?.push(currencyGap);
    return null;
  }

  const revenueCount = countField(q, "revenue");
  if (revenueCount < 4) {
    gaps?.push({
      field: "compute.ttmIncome.revenue",
      reason: `revenue present in only ${revenueCount}/4 latest quarters — TTM revenue suppressed (a partial sum would understate it); revenue-dependent consumers use the latest annual statement or refuse. Independently complete common earnings remain eligible.`,
      severity: "info",
      attemptedSources: ["fmp:/stable/income-statement?period=quarter"],
    });
  }

  let incomeBeforeTax = sumField(q, "incomeBeforeTax");
  let incomeTaxExpense = sumField(q, "incomeTaxExpense");
  const preTaxCount = countField(q, "incomeBeforeTax");
  const taxCount = countField(q, "incomeTaxExpense");
  if (preTaxCount < 4 || taxCount < 4) {
    if (incomeBeforeTax !== null || incomeTaxExpense !== null) {
      gaps?.push({
        field: "compute.ttmIncome.taxPair",
        reason: `incomeBeforeTax/incomeTaxExpense present in ${preTaxCount}/4 and ${taxCount}/4 quarters — TTM tax pair suppressed (a rate over mismatched quarters would be distorted)`,
        severity: "info",
        attemptedSources: ["fmp:/stable/income-statement?period=quarter"],
      });
    }
    incomeBeforeTax = null;
    incomeTaxExpense = null;
  }
  const filedPairs = q.map(filedTaxOperandPair);
  const filedPair = filedPairs.every(pair => pair !== null)
    ? filedPairs.reduce((sum, pair) => ({ pretax: sum.pretax + pair.pretax, tax: sum.tax + pair.tax }), { pretax: 0, tax: 0 }) : null;
  const taxRateOperandsFiled = filedPair !== null;
  // Select the complete window once; incomplete proof keeps the original pair.
  const taxRateIncomeTaxExpense = incomeTaxExpense === null ? null : filedPair?.tax ?? incomeTaxExpense;
  const taxBase = incomeBeforeTax === null ? null : ttmTaxRatePretax(q, incomeBeforeTax, taxRateIncomeTaxExpense);
  if (taxBase && filedPair) taxBase.value = filedPair.pretax;
  if (taxBase?.basis) gaps?.push({ field: "compute.ttmIncome.taxRatePretaxIncome", reason: taxBase.basis, severity: "info", expected: true, attemptedSources: ["edgar:companyfacts"] });

  // Bottom-line fields feed routing (unprofitable overlay) and multiples
  // (P/E, EPS): a 3-of-4-quarter partial sum silently understates them —
  // e.g. an inflated P/E from missing a quarter of earnings. Gate them at
  // field level (not whole-row) with a disclosed suppression, same rationale
  // as the tax pair. All remaining period-flow fields are gated below as
  // well; missing is not equivalent to zero for a TTM calculation.
  const gateComplete = (key: keyof FmpIncomeStatementRow): number | null => {
    if (key === "interestExpense") {
      const refused = q.filter(row => num(row.interestExpense) === null || row.fieldConflicts?.interestExpense?.usable === false ||
        (row.interestExpense === 0 && !disclosedProjectionInterest(row, windowCurrency.code)) || (row.interestExpense ?? 0) < 0);
      if (refused.length) {
        gaps?.push({field:"compute.ttmIncome.interestExpense", severity:"info",
          reason:`TTM interest expense and coverage withheld: quarter ending ${refused.map(row => row.date).join(", ")} has missing, conflicted, negative or vendor-zero interest without exact filed evidence.`});
        return null;
      }
    }
    const count = countField(q, key);
    const value = sumField(q, key);
    if (count === 0 || count === 4) return value;
    gaps?.push({
      field: `compute.ttmIncome.${key}`,
      reason: `${key} present in only ${count}/4 latest quarters — TTM value suppressed (a partial sum labeled TTM would understate it)`,
      severity: "info",
      attemptedSources: ["fmp:/stable/income-statement?period=quarter"],
    });
    return null;
  };

  // EPS is a per-share observation, not an additive earnings numerator. Keep
  // the existing analytical sum and identify it explicitly: the available net
  // income/share fields cannot reconstruct full-period dilution or verify a
  // common split basis across the observations.
  const epsDiluted = gateComplete("epsDiluted");
  const quarterEvidence = q.map(row => commonIncomeEvidence(row, "quarter", admissionAsOf));
  const commonWindow = constructCommonIncomeQuarterWindow(quarterEvidence, windowCurrency.code);
  // Keep the existing field-completeness disclosures; the shared constructor
  // owns the earnings sums and source admission used by both P/E paths.
  gateComplete("netIncome");
  gateComplete("netIncomeAttributableToNoncontrollingInterest");
  if (!commonWindow.commonIncomeWithheldReason) gateComplete("netIncomeAvailableToCommon");

  const windowStart = incomePeriod(q[3], normalized.rows[4]);
  const operatingValues = q.map(operatingIncomeForNonMargins);
  const operatingObservations = q.flatMap(row => {
    const evidence = operatingIncomeEvidenceForNonMargins(row);
    return evidence ? [{ status: evidence.status, asOf: evidence.asOf, field: evidence.field }] : [];
  });
  const unverifiedOperating = operatingObservations.some(evidence => evidence.status === "unverified-derivation");
  // An unverified selected component qualifies the sum. Claim a fully filed
  // sum only when all four observations actually carry that evidence.
  const operatingEvidence: WaccOperatingEvidence | undefined = operatingValues.every(value => value !== null) &&
    (unverifiedOperating || operatingObservations.length === 4) ? {
      status: unverifiedOperating ? "unverified-derivation" : "filed-or-reconciled",
      asOf: String(q[0].date ?? "") || null, field: `statements.income.ttm.${q[0].date}.operatingIncome`,
      usedInDiscountRate: false, observations: operatingObservations,
    } : undefined;
  const standaloneOperating = q.some(row => row.nonMarginOperatingIncome !== undefined) && operatingValues.every((v): v is number => v !== null)
    ? operatingValues.reduce((sum, v) => sum + v, 0) : undefined;
  const corroboratedQuarters = q.filter(row=>row.fieldConflicts?.operatingIncome?.cause==="operating-basis" && row.fieldConflicts.operatingIncome.usable);
  const unverifiedQuarters = q.filter(row=>num(row.operatingIncome)!==null && row.fieldConflicts?.operatingIncome?.usable!==false && !corroboratedQuarters.includes(row));
  const numeratorBasis = [
    corroboratedQuarters.length ? `Filed-corroborated quarters: ${corroboratedQuarters.map(row=>row.date).join(", ")}` : null,
    unverifiedQuarters.length ? `Unverified provider quarters: ${unverifiedQuarters.map(row=>row.date).join(", ")}` : null,
    ...new Set(q.flatMap(row=>row.operatingIncomeBasis?[row.operatingIncomeBasis]:[])),
  ].filter(Boolean).join("; ");
  return {
    date: String(q[0].date ?? ""),
    periodStart: windowStart.periodStart,
    periodStartBasis: windowStart.periodStartBasis,
    days: periodDays(windowStart.periodStart, String(q[0].date ?? "")),
    // One established code for all four quarters (the gate above).
    reportedCurrency: windowCurrency.code,
    currencyFromSameFilingStatements: windowCurrency.fromSameFiling,
    revenue: revenueCount === 4 ? sumField(q, "revenue") : null,
    operatingIncome: gateComplete("operatingIncome"),
    ...(standaloneOperating !== undefined ? { nonMarginOperatingIncome: standaloneOperating } : {}),
    operatingIncomeBasis: numeratorBasis || undefined,
    ...(operatingEvidence ? { operatingIncomeEvidence: operatingEvidence } : {}),
    depreciationAndAmortization: gateComplete("depreciationAndAmortization"),
    netIncome: commonWindow.netIncome,
    netIncomeConsolidated: gateComplete("netIncomeConsolidated"),
    netIncomeAttributableToNoncontrollingInterest: commonWindow.noncontrollingIncome,
    noncontrollingIncomeEvidenced: q.every((row) => row.fieldProvenance?.netIncomeAttributableToNoncontrollingInterest != null),
    noncontrollingIncomeUnevidencedZero: q.some((row) =>
      num(row.netIncomeAttributableToNoncontrollingInterest) === 0 && row.fieldProvenance?.netIncomeAttributableToNoncontrollingInterest == null),
    netIncomeAvailableToCommon: commonWindow.netIncomeAvailableToCommon,
    commonIncomeWithheldReason: commonWindow.commonIncomeWithheldReason,
    netIncomeWithheldReason: commonWindow.netIncomeWithheldReason,
    admissionAsOf, targetScope: commonWindow.targetScope,
    netIncomeOwnershipBasis: commonWindow.netIncomeOwnershipBasis,
    incomeScope: commonWindow.incomeScope, commonIncomeScope: commonWindow.commonIncomeScope, noncontrollingIncomeScope: commonWindow.noncontrollingIncomeScope,
    epsDiluted,
    epsDilutedBasis: epsDiluted === null ? null : "sum-quarterly-diluted-eps",
    ebit: gateComplete("ebit"),
    interestExpense: gateComplete("interestExpense"),
    ...(q.every(filedInterestOperand) ? { interestExpenseFiled: true as const } : {}),
    incomeBeforeTax,
    incomeTaxExpense,
    taxRatePretaxIncome: taxBase?.value ?? null,
    taxRateIncomeTaxExpense,
    taxRateOperandsFiled,
    taxRatePretaxBasis: taxBase?.basis ?? null,
    // D-60: only the scenario margin ceiling reads it, and it falls back to the
    // latest fiscal year, so a partial window is simply not a TTM figure.
    grossProfit: countField(q, "grossProfit") === 4 ? sumField(q, "grossProfit") : null,
  };
}

export interface TtmCashFlow {
  date: string;
  /** The window's one currency, or null when nothing establishes it. */
  reportedCurrency: string | null;
  operatingCashFlow: number | null;
  capitalExpenditure: number | null;
  depreciationAndAmortization: number | null;
}

export function ttmCashFlow(
  quarterly: FmpCashFlowRow[],
  gaps?: ManifestEntry[],
  /** Same-period income / balance-sheet quarters: currency evidence for unlabelled quarters. */
  siblings: readonly CurrencyEvidenceRow[] = [],
): TtmCashFlow | null {
  const normalized = normalizeStatementQuarters(quarterly, "cashFlow", gaps);
  return ttmCashFlowFromNormalized(normalized, gaps, siblings);
}

/**
 * The window gates of ttmCashFlowFromNormalized (no rejected current period,
 * four contiguous quarters, one known currency), without its manifest entries.
 * A filed CFO identity establishes only CFO's twelve months; the other quarterly
 * flows summed beside it still need their own admitted window (PR #83 review).
 */
export function cashFlowQuarterWindowAdmitted(
  normalized: NormalizedQuarterSet<FmpCashFlowRow>,
  siblings: readonly CurrencyEvidenceRow[] = [],
): boolean {
  if (rejectedAffectsCurrentWindow(normalized) || normalized.rows.length < 4) return false;
  const q = normalized.rows.slice(0, 4);
  if (quarterWindowViolation(q, normalized.rows[4] ?? null) !== null) return false;
  const windowCurrency = resolveQuarterCurrency(q, siblings);
  return windowCurrency.state === "known" &&
    windowCurrencyGap("cash-flow", windowCurrency, "fmp:/stable/cash-flow-statement?period=quarter") === null;
}

export function ttmCashFlowFromNormalized(
  normalized: NormalizedQuarterSet<FmpCashFlowRow>,
  gaps?: ManifestEntry[],
  siblings: readonly CurrencyEvidenceRow[] = [],
): TtmCashFlow | null {
  const rejected = rejectedAffectsCurrentWindow(normalized);
  if (rejected) {
    gaps?.push({
      field: "compute.ttmCashFlow",
      reason: `current TTM window is uncertain because fiscal period ${rejected.period} was rejected (${rejected.reason}) — TTM basis suppressed; latest annual statement used instead`,
      severity: "info",
      attemptedSources: ["fmp:/stable/cash-flow-statement?period=quarter"],
    });
    return null;
  }
  if (normalized.rows.length < 4) return null;
  const q = normalized.rows.slice(0, 4);
  // Contiguity gate (P1) — identical to ttmIncome.
  const violation = quarterWindowViolation(q, normalized.rows[4] ?? null);
  if (violation !== null) {
    gaps?.push({
      field: "compute.ttmCashFlow",
      reason: `latest 4 quarterly rows do not form a contiguous trailing twelve months (${violation}) — TTM basis suppressed; latest annual statement used instead`,
      severity: "info",
      attemptedSources: ["fmp:/stable/cash-flow-statement?period=quarter"],
    });
    return null;
  }
  // Currency gate — identical to ttmIncome.
  const windowCurrency = resolveQuarterCurrency(q, siblings);
  const currencyGap = windowCurrencyGap("cash-flow", windowCurrency, "fmp:/stable/cash-flow-statement?period=quarter");
  if (currencyGap !== null || windowCurrency.state !== "known") {
    if (currencyGap !== null) gaps?.push(currencyGap);
    return null;
  }
  const sum = (key: keyof FmpCashFlowRow): number | null => {
    let acc = 0;
    let seen = false;
    for (const r of q) {
      const v = num(r[key]);
      if (v !== null) {
        acc += v;
        seen = true;
      }
    }
    return seen ? acc : null;
  };
  const gateComplete = (key: keyof FmpCashFlowRow): number | null => {
    let count = 0;
    for (const row of q) if (num(row[key]) !== null) count++;
    if (count === 0 || count === 4) return sum(key);
    gaps?.push({
      field: `compute.ttmCashFlow.${key}`,
      reason: `${key} present in only ${count}/4 latest quarters — TTM value suppressed (a partial sum would understate the period flow)`,
      severity: "info",
      attemptedSources: ["fmp:/stable/cash-flow-statement?period=quarter"],
    });
    return null;
  };
  return {
    date: String(q[0].date ?? ""),
    reportedCurrency: windowCurrency.code,
    operatingCashFlow: gateComplete("operatingCashFlow"),
    capitalExpenditure: gateComplete("capitalExpenditure"),
    depreciationAndAmortization: gateComplete("depreciationAndAmortization"),
  };
}

// ---------------------------------------------------------------------------
// Statement currencies
// ---------------------------------------------------------------------------

/**
 * Which currency each kind of figure is in, from evidence only.
 *
 *  - `trading`: the listing currency the quote and price history are in.
 *  - `annual`: the latest annual income statement's own label.
 *  - `model`: the currency every currency-dependent Stage B calculation ran
 *    in — the DCF, the excess-return model, the price multiples, and every
 *    per-share value derived from them. That is the TTM window's currency
 *    when the window anchors them, else the annual statement's; null when
 *    neither is established, except that an issuer with no annual income
 *    statement can establish it from its latest reported income quarter.
 *    This labels existing data; it does not create an annual or TTM window.
 *    It is never borrowed from the listing.
 *
 * The TTM windows feed currency-dependent calculations only when their own
 * currency is established and agrees with the annual statement's; otherwise
 * they stay available for currency-free uses (routing signs, WACC coverage
 * and tax ratios) and the dependent calculations use the annual statement.
 */
export interface StatementCurrencies {
  trading: string | null;
  annual: string | null;
  model: string | null;
  ttmIncomeUsable: boolean;
  ttmCashFlowUsable: boolean;
}

export function resolveStatementCurrencies(
  profileCurrency: unknown,
  latestAnnualIncome: FmpIncomeStatementRow | undefined,
  ttmInc: TtmIncome | null,
  ttmCf: TtmCashFlow | null,
  latestQuarterlyIncome: FmpIncomeStatementRow | undefined,
  quarterlyEvidence: readonly CurrencyEvidenceRow[],
  gaps?: ManifestEntry[],
): StatementCurrencies {
  const trading = normalizeReportedCurrency(profileCurrency);
  const annual = normalizeReportedCurrency(latestAnnualIncome?.reportedCurrency);
  const annualText = annual ?? "unlabelled";
  const usable = (code: string | null): boolean => code !== null && (annual === null || code === annual);
  const ttmIncomeUsable = ttmInc !== null && usable(ttmInc.reportedCurrency);
  const quarterEvidence = latestAnnualIncome === undefined && latestQuarterlyIncome !== undefined
    ? quarterCurrency(latestQuarterlyIncome, quarterlyEvidence)
    : null;
  const quarterCurrencyCode = quarterEvidence?.state === "known" ? quarterEvidence.code : null;
  const model = ttmIncomeUsable ? ttmInc!.reportedCurrency : annual ?? quarterCurrencyCode;
  const ttmCashFlowUsable = ttmCf !== null && ttmCf.reportedCurrency !== null && ttmCf.reportedCurrency === model;

  // A window reaching here is established in one currency (ttmIncome and
  // ttmCashFlow return none otherwise); it may still differ from the model's.
  const withheld = (window: "income" | "cash-flow", code: string | null): string =>
    `the latest 4 quarterly ${window} rows are in ${code ?? "an unestablished currency"} but the ` +
    `${window === "income" ? "latest annual statement is" : "model runs"} in ${window === "income" ? annualText : (model ?? "an unestablished currency")}` +
    " — the window's sums are used only within the window itself (routing signs, its own coverage and tax ratios), " +
    "while the DCF anchor, the price multiples and anything set against another statement use the latest annual statement instead";
  if (ttmInc !== null && !ttmIncomeUsable) {
    gaps?.push({
      field: "compute.ttmIncome.currency",
      reason: withheld("income", ttmInc.reportedCurrency),
      severity: "warn",
      attemptedSources: ["fmp:/stable/income-statement?period=quarter"],
    });
  }
  if (ttmCf !== null && !ttmCashFlowUsable) {
    gaps?.push({
      field: "compute.ttmCashFlow.currency",
      reason: withheld("cash-flow", ttmCf.reportedCurrency),
      severity: "warn",
      attemptedSources: ["fmp:/stable/cash-flow-statement?period=quarter"],
    });
  }
  return { trading, annual, model, ttmIncomeUsable, ttmCashFlowUsable };
}

/**
 * The same resolution runStageB makes, from the bundle alone — for a surface
 * (the company page) that labels Stage B's figures and must use the currency
 * the model actually ran in. Pure, and discloses nothing: runStageB owns the
 * gaps.
 */
export function statementCurrencies(bundle: DataBundle): StatementCurrencies {
  // A degraded bundle may lack a member; missing rows are simply no evidence.
  const rows = <TRow extends FmpRawRow>(f: FmpFetch<TRow> | undefined): TRow[] => (f === undefined ? [] : rowsOf(f));
  const statements: Partial<DataBundle["statements"]> = bundle.statements ?? {};
  const income = normalizeStatementQuarters(rows(statements.incomeQuarterly), "income", undefined, statements.incomeQuarterly);
  const balance = normalizeStatementQuarters(rows(statements.balanceQuarterly), "balance");
  const cashflow = normalizeStatementQuarters(rows(statements.cashflowQuarterly), "cashFlow", undefined, statements.cashflowQuarterly);
  const incomeWindow = withFiledIncomeWindow(bundle, ttmIncomeFromNormalized(income, undefined, [...balance.rows, ...cashflow.rows]), income.rows, []);
  return resolveStatementCurrencies(
    bundle.profile === undefined ? undefined : firstRow(bundle.profile)?.currency,
    rows(statements.incomeAnnual)[0],
    incomeWindow?.revenue != null ? incomeWindow : null,
    ttmCashFlowFromNormalized(cashflow, undefined, [...income.rows, ...balance.rows]),
    income.rows[0],
    [...income.rows, ...balance.rows, ...cashflow.rows],
  );
}
