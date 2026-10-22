/**
 * Stage B — where the excess-return model starts, and which fiscal years carry
 * business-combination evidence (audit 2026-10-22 C-10).
 *
 * The bank and insurer routes value common equity by fading the current return
 * on common (tangible) equity to the cost of equity. The latest fiscal year can
 * be unrepresentative: COF's FY2025 ROTE was 4.2% because the Day-1 allowance
 * on the acquired Discover loans went through provision, while its trailing
 * four quarters earned about 17%. These helpers compute the trailing return on
 * the same basis as the fiscal-year one, and name the fiscal years in which an
 * acquisition was material, so the terminal rule can annotate them.
 *
 * Pure, deterministic TypeScript: no network, no DB, no LLM.
 */

import { tagPoints, type CompanyFacts } from "@/edgar/xbrl";
import { isFiniteNumber } from "@/pipeline/stageB/growth";
import { BALANCE_MATCH_TOLERANCE_DAYS, tangibleCommonEquity, type ReturnsBalanceRow } from "@/pipeline/stageB/returns";
import { selectCommonIncome, type CommonIncomeInputs } from "@/pipeline/stageB/securityBasis";

// Defined beside the model that applies it; valuation.ts cannot import this module (returns.ts imports valuation.ts).
export { EXCESS_RETURN_START_GAP_PP } from "@/pipeline/stageB/valuation";

/**
 * HOUSE CONVENTION (owner decision, audit 2026-10-22 C-10): a fiscal year
 * carries material business-combination evidence when its goodwill step-up, or
 * any one acquisition tag, is at least this share of the opening common equity.
 */
export const BUSINESS_COMBINATION_MATERIALITY_PCT = 10;

/** Annual duration tags that measure an acquisition's size in the year it closed. */
export const BUSINESS_COMBINATION_TAGS = [
  "GoodwillAcquiredDuringPeriod",
  "BusinessCombinationConsiderationTransferred1",
  "BusinessCombinationConsiderationTransferred",
  "BusinessAcquisitionCostOfAcquiredEntityPurchasePrice",
  "FinancingReceivableAllowanceForCreditLossesAcquiredWithDeterioratedCreditQuality",
] as const;

const DAY_MS = 86_400_000;

export type CommonEquityBasis = "tangible-common-equity" | "common-equity";

export interface TtmCommonReturn {
  basis: CommonEquityBasis;
  /** Percent; null when withheld. */
  returnPct: number | null;
  /** Equity at the window's end: the opening book a trailing-start model builds on. */
  closingEquity: number | null;
  averageEquity: number | null;
  /** The window's last day. */
  asOf: string | null;
  incomeAvailableToCommon: number | null;
  /** How the figure was built, or why it was not. */
  basisText: string;
  withheldReason: string | null;
}

/** Common equity on the requested basis: tangible for banks, book common equity otherwise. */
export function commonEquityOn(row: ReturnsBalanceRow, basis: CommonEquityBasis): number | null {
  return tangibleCommonEquity(basis === "tangible-common-equity" ? row : { ...row, goodwill: 0, intangibleAssets: 0 });
}

function balanceNear(balances: ReadonlyArray<ReturnsBalanceRow>, iso: string): ReturnsBalanceRow | null {
  const target = Date.parse(iso);
  if (!Number.isFinite(target)) return null;
  let best: ReturnsBalanceRow | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const row of balances) {
    const t = Date.parse(row.date);
    if (!Number.isFinite(t)) continue;
    const delta = Math.abs(t - target) / DAY_MS;
    if (delta < bestDelta) {
      bestDelta = delta;
      best = row;
    }
  }
  return bestDelta <= BALANCE_MATCH_TOLERANCE_DAYS ? best : null;
}

/**
 * Trailing-four-quarter return on common (tangible) equity, on the same basis
 * as the fiscal-year figure: income available to common (admitted by the same
 * `selectCommonIncome` rule) over the average of the equity at the window's
 * end and at its start, four quarters earlier. A missing opening balance falls
 * back to the closing one, as the fiscal-year figure does, and the basis says so.
 */
export function computeTtmCommonReturn(input: {
  /** The four-quarter window's earnings evidence; null when there is no complete window. */
  income: CommonIncomeInputs | null;
  /** The window's last day. */
  asOf: string | null;
  /** The window's first day; defaults to one year before `asOf`. */
  periodStart?: string | null;
  /** Annual and quarterly balance rows. */
  balances: ReadonlyArray<ReturnsBalanceRow>;
  basis: CommonEquityBasis;
}): TtmCommonReturn {
  const label = input.basis === "tangible-common-equity" ? "ROTE" : "common-equity ROE";
  let income: number | null = null;
  const withheld = (reason: string, closingEquity: number | null = null): TtmCommonReturn => ({
    basis: input.basis, returnPct: null, closingEquity, averageEquity: null, asOf: input.asOf,
    incomeAvailableToCommon: income, basisText: `TTM ${label} withheld: ${reason}`, withheldReason: reason,
  });
  if (input.asOf === null || input.income === null) return withheld("no complete trailing four-quarter window");
  const closingRow = balanceNear(input.balances, input.asOf);
  const closing = closingRow === null ? null : commonEquityOn(closingRow, input.basis);
  if (closingRow === null || closing === null) return withheld(`no balance sheet within ${BALANCE_MATCH_TOLERANCE_DAYS} days of the window's end ${input.asOf}`);
  const selected = selectCommonIncome(
    { ...input.income, capitalPeriodEnd: closingRow.commonEquityPeriodEnd ?? closingRow.date },
    { ...closingRow, totalStockholdersEquity: closingRow.totalStockholdersEquity ?? null },
  );
  if (selected.withheldReason !== null || !isFiniteNumber(selected.value)) {
    return withheld(selected.withheldReason ?? "four-quarter income available to common is not established", closing);
  }
  income = selected.value;
  const startMs = input.periodStart ? Date.parse(input.periodStart) - DAY_MS : Date.parse(input.asOf) - 365 * DAY_MS;
  const openingDate = Number.isFinite(startMs) ? new Date(startMs).toISOString().slice(0, 10) : null;
  const openingRow = openingDate === null ? null : balanceNear(input.balances, openingDate);
  const opening = openingRow === null || openingRow === closingRow ? null : commonEquityOn(openingRow, input.basis);
  const average = opening === null ? closing : (closing + opening) / 2;
  if (average <= 0) return withheld(`${input.basis === "tangible-common-equity" ? "tangible common" : "common"} equity is not positive`, closing);
  const returnPct = (income / average) * 100;
  const equityName = input.basis === "tangible-common-equity" ? "tangible common equity" : "common equity";
  return {
    basis: input.basis,
    returnPct,
    closingEquity: closing,
    averageEquity: average,
    asOf: input.asOf,
    incomeAvailableToCommon: income,
    basisText: opening === null
      ? `TTM ${label} to ${input.asOf}: four quarters of income available to common ${income} / closing ${equityName} ${closing} (no balance sheet four quarters earlier, so the closing balance stands alone, as the fiscal-year figure does)`
      : `TTM ${label} to ${input.asOf}: four quarters of income available to common ${income} / average ${equityName} ${average} (${openingRow!.date} and ${closingRow!.date})`,
    withheldReason: null,
  };
}

function annualDurationTotal(facts: CompanyFacts, tag: string, fiscalYearEnd: string): number | null {
  const tp = tagPoints(facts, tag, "USD");
  if (tp === null) return null;
  const end = Date.parse(fiscalYearEnd);
  let best: number | null = null;
  for (const p of tp.points) {
    if (!p.form.startsWith("10-K") || p.start === undefined) continue;
    const pEnd = Date.parse(p.end);
    const days = (pEnd - Date.parse(p.start)) / DAY_MS;
    if (Math.abs(pEnd - end) / DAY_MS > 10 || days < 330 || days > 400) continue;
    // Restated comparatives carry the same period; the largest is the year's figure.
    if (best === null || p.val > best) best = p.val;
  }
  return best;
}

/**
 * Fiscal years (balance-sheet dates) whose business-combination evidence is
 * material: the goodwill step-up from the prior year end, or one of
 * BUSINESS_COMBINATION_TAGS for that year, is at least
 * BUSINESS_COMBINATION_MATERIALITY_PCT of the opening common equity. The value
 * is the human annotation printed beside the year.
 */
export function businessCombinationYears(
  facts: CompanyFacts | null,
  annualBalancesNewestFirst: ReadonlyArray<ReturnsBalanceRow>,
): Map<string, string> {
  const out = new Map<string, string>();
  const rows = [...annualBalancesNewestFirst].sort((a, b) => b.date.localeCompare(a.date));
  for (let i = 0; i < rows.length - 1; i++) {
    const cur = rows[i];
    const prior = rows[i + 1];
    const gap = (Date.parse(cur.date) - Date.parse(prior.date)) / DAY_MS;
    if (!(gap > 330 && gap < 400)) continue;
    const openingCommon = commonEquityOn(prior, "common-equity");
    if (openingCommon === null || openingCommon <= 0) continue;
    const threshold = (BUSINESS_COMBINATION_MATERIALITY_PCT / 100) * openingCommon;
    const share = (v: number): string => `${Math.round((v / openingCommon) * 100)}% of opening common equity`;
    const evidence: string[] = [];
    if (isFiniteNumber(cur.goodwill) && isFiniteNumber(prior.goodwill) && cur.goodwill - prior.goodwill >= threshold) {
      const step = cur.goodwill - prior.goodwill;
      evidence.push(`goodwill rose ${step} (${share(step)})`);
    }
    if (facts !== null) {
      for (const tag of BUSINESS_COMBINATION_TAGS) {
        const v = annualDurationTotal(facts, tag, cur.date);
        if (v !== null && v >= threshold) evidence.push(`${tag} ${v} (${share(v)})`);
      }
    }
    if (evidence.length > 0) out.set(cur.date, evidence.join("; "));
  }
  return out;
}
