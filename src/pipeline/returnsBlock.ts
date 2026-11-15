/**
 * Returns block, split out of compute.ts: the WACC inputs (risk-free rate and its series, beta
 * closes, average book debt on the lease basis, prior-year cost of debt) and the ROIC/WACC result
 * Stage B reports. Inputs come from admitted evidence only (P13, P16, D-60).
 */

import { type ForeignValuationBasis } from "@/pipeline/foreignCurrency";
import { quotePriceObservationDay } from "@/providers/fmp";
import type { ManifestEntry } from "@/types/core";
import type { DataBundle } from "@/pipeline/types";
import { operatingIncomeEvidenceForNonMargins, operatingIncomeForNonMargins } from "@/pipeline/incomeBasis";
import { filedAnnualBorrowingCost, type BorrowingCostEvidenceInput } from "@/edgar/borrowingCosts";
import type { FmpBalanceSheetRow, FmpCashFlowRow, FmpIncomeStatementRow, FmpRawRow } from "@/providers/fmp";
import { type CompanyRouteResult } from "@/pipeline/stageB/sectorRouting";
import { withoutTransitionPeriods } from "@/pipeline/stageB/growth";
import {
  computeWacc,
  computeRoic,
  computeRote,
  computeDupont,
  computeFiscalRoicVsWaccSpread,
  type WaccResult,
  type RoicResult,
  type RoteResult,
  type DupontResult,
  type RoicVsWaccSpread,
  PRIOR_YEAR_COST_OF_DEBT_MAX_YEARS_BACK,
  type PriorYearCostOfDebt,
  // WS6 (D-19)
  waccByFiscalYear,
  waccDisclosure,
  type WaccDisclosure,
  type WaccHistoryResult,
} from "@/pipeline/stageB/returns";
import { leaseDebtConflict, operatingLeaseOutOfDebt } from "@/pipeline/stageB/netDebt";
import { temporaryEquityUnknownAt } from "@/pipeline/stageB/seniorClaims";
import { retainedCommonClassAmbiguity } from "@/pipeline/stageB/commonClassScope";
import { incompleteLeaseCoverage, leaseDebtScopeRefusal, leaseEvidenceNote, leaseEvidenceContextFor, type LeaseEvidenceContext } from "@/pipeline/stageB/leaseScope";
import { conversionRightsNote, resolveEconomicEquityScope } from "@/pipeline/stageB/securityBasis";
import { BETA_MIN_MONTHS, estimateBeta, type ClosePoint } from "@/pipeline/stageB/betaEstimate";
import { effectiveTaxPretaxIncome } from "@/edgar/incomeClassification";
import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import { computeTtmCommonReturn, type TtmCommonReturn } from "@/pipeline/stageB/excessReturnStart";
import { unusualOperatingItemsByFiscalYear, withoutRecurringFamilies, recurringOperatingItemsBasis, unusualOperatingItemsTtm } from "@/pipeline/stageB/unusualItems";
import { normalizeQuarterRows } from "@/pipeline/stageB/quarterWindows";
import { SPREAD_DAYS, firstRow, isoDay, num, rowsOf, sourcedOf, str } from "./bundleRows";
import { type CurrencyEvidenceRow, establishedRowsCurrency } from "./statementCurrency";
import type { TtmIncome } from "./ttmSynthesis";
import { US_COUNTRY_KEYS, countryKeyOf, selectEquityRiskPremium } from "./equityRiskPremium";
import { waccTaxRateFromStatements } from "./taxEvidence";
import { preferredClaimsInFlow, toReturnsBalance, toReturnsIncome } from "./stageBAdapters";

export interface ReturnsBlock {
  wacc: WaccResult;
  // WS6 (D-19): every WACC input named with its source and date, and the WACC
  // recomputed at each fiscal year end from that year's risk-free observation.
  waccInputs: WaccDisclosure;
  waccHistory: WaccHistoryResult;
  roic: RoicResult;
  rote: RoteResult;
  /**
   * D-102: the trailing-four-quarter return on common
   * equity on the financial routes (tangible for banks, book common equity for
   * insurers and mortgage REITs); null on every other route.
   */
  commonReturnTtm: TtmCommonReturn | null;
  dupont: DupontResult;
  roicVsWacc: RoicVsWaccSpread;
  notes: string[];
  gaps: ManifestEntry[];
}

/**
 * Latest risk-free rate (10y): FRED DGS10 (pct) → FMP treasury.year10 (pct)
 * → the last good cached DGS10 observation → the Treasury par curve (D-111).
 * D-60: DGS10 first, because every per-fiscal-year WACC is recomputed from
 * DGS10; the vendor endpoint is only the fallback, and the returns notes say so
 * when it is used.
 */
// WS6: the series the rate came from travels with it, so the WACC disclosure
// can name it instead of printing an unattributed percentage.
export function riskFreePct(
  bundle: Pick<DataBundle, "treasury" | "macro" | "riskFreeFallback">,
): { pct: number | null; asOf: string | null; seriesId: string | null } {
  const dgs10 = bundle.macro.core["DGS10"];
  if (dgs10 && dgs10.ok) {
    const last = dgs10.value.data.filter((o) => Number.isFinite(o.value)).at(-1);
    if (last) return { pct: last.value, asOf: last.date, seriesId: "fred:DGS10" };
  }
  const t = rowsOf(bundle.treasury)[0];
  const fromTreasury = t ? num(t.year10) : null;
  if (fromTreasury !== null) {
    return { pct: fromTreasury, asOf: isoDay(t?.date), seriesId: "fmp:treasury-rates.year10" };
  }
  // D-111: the last good cached DGS10 observation, then the Treasury par curve
  // (riskFreeFallback.ts), each with its own series id and date.
  const fallback = bundle.riskFreeFallback;
  if (fallback?.ok && Number.isFinite(fallback.value.data.value)) {
    return { pct: fallback.value.data.value, asOf: fallback.value.data.date, seriesId: fallback.value.data.seriesId };
  }
  return { pct: null, asOf: null, seriesId: null };
}

// WS6: the full FRED DGS10 observation history the bundle fetched (five years
// back), so a WACC can be recomputed at each fiscal year end.
/**
 * The series every PER-YEAR WACC is recomputed from. Since D-60 the CURRENT
 * WACC's risk-free rate is the same series (see `riskFreePct`); only when DGS10
 * is unavailable does it fall back to the vendor's treasury endpoint, and the
 * returns notes then say the two sources differ (N8).
 */
const WACC_HISTORY_RF_SERIES_ID = "fred:DGS10";

/** Daily bars for the D-60 beta regression; the dividend-adjusted close travels when the source has one. */
function betaClosePoints(rows: readonly FmpRawRow[]): ClosePoint[] {
  return rows.flatMap((row) => {
    const day = isoDay(row.date);
    const close = num(row.close);
    return day === null || close === null ? [] : [{ date: day, close, adjClose: num(row.adjClose) }];
  });
}

export function riskFreeObservations(bundle: DataBundle): { date: string; value: number }[] {
  const dgs10 = bundle.macro.core["DGS10"];
  if (!dgs10 || !dgs10.ok) return [];
  return dgs10.value.data.filter((o) => Number.isFinite(o.value));
}

/**
 * Book debt on the house lease basis: the provider's totalDebt less the
 * operating-lease liability where the balance sheet discloses it (the EDGAR
 * route; FMP publishes no split), unless METIS_EV_INCLUDE_LEASES keeps
 * leases in. The same rule the EV bridge and invested capital apply, so the
 * WACC's debt leg, ROIC and EV share one basis. Interest expense excludes
 * operating-lease interest under ASC 842, so dividing it by a lease-inclusive
 * balance understated the effective rate and could push it below the
 * acceptance band.
 */
export function bookDebtOnLeaseBasis(
  row: FmpBalanceSheetRow | undefined,
  includeOperatingLeases: boolean,
): { value: number | null; leaseRemoved: boolean } {
  const total = row ? num(row.totalDebt) : null;
  if (total === null) return { value: null, leaseRemoved: false };
  if (leaseDebtConflict(row ?? {}) !== null) return { value: null, leaseRemoved: false };
  if (leaseDebtScopeRefusal(row, includeOperatingLeases) !== null) return { value: null, leaseRemoved: false };
  // D-135 (D-25, D-97 item 3): the shared predicate, the same proof sales-to-capital and ROIC apply.
  const leaseOut = operatingLeaseOutOfDebt(row ?? {}, includeOperatingLeases);
  if (leaseOut.amount > 0) return { value: total - leaseOut.amount, leaseRemoved: true };
  return { value: total, leaseRemoved: false };
}

/**
 * Average debt for the WACC's debt weight and effective cost of debt.
 *
 * Which balances: when the interest figure is TRAILING-TWELVE-MONTH, the
 * quarter-end balances at the window's two ends (the latest quarter and the
 * one four quarters earlier), so numerator and denominator cover the same
 * twelve months — the fiscal-year-end pair was up to three quarters stale
 * against a TTM numerator, and a debt issue after the year end doubled the
 * measured rate. When the interest figure is the annual statement's, the
 * latest two fiscal-year ends. The basis string says which pair was used.
 *
 * A negative balance is invalid for FMP's totalDebt field. Preserve that fact
 * separately so opposite-signed observations can never average to zero and
 * impersonate a genuinely debt-free capital structure.
 */
/**
 * The most recent fiscal year (excluding the latest, at index 0) whose income
 * statement discloses a POSITIVE interest expense and whose balance sheet
 * carries positive total debt — the issuer's own last-disclosed effective cost
 * of debt. Consumed by the WACC only when the current interest expense is
 * missing or a provider-placeholder zero. Annual rows are newest-first.
 */
export function priorYearCostOfDebt(
  incomeAnnual: readonly FmpIncomeStatementRow[],
  balanceAnnual: readonly FmpBalanceSheetRow[],
  options: { includeOperatingLeases?: boolean; unusualByYear?: ReadonlyMap<string, number>; borrowingCostEvidence?: BorrowingCostEvidenceInput } = {},
): PriorYearCostOfDebt | null {
  const includeOperatingLeases = options.includeOperatingLeases === true;
  for (let index = 1; index < incomeAnnual.length && index <= PRIOR_YEAR_COST_OF_DEBT_MAX_YEARS_BACK; index += 1) {
    const income = incomeAnnual[index];
    const fiscalYearEnd = isoDay(income?.date);
    const interestExpense = num(income?.interestExpense);
    if (fiscalYearEnd === null || interestExpense !== null && interestExpense < 0) continue;
    const balanceIndex = balanceAnnual.findIndex((row) => isoDay(row.date) === fiscalYearEnd);
    if (balanceIndex < 0) continue;
    // Same lease basis as the current-year debt leg (bookDebtOnLeaseBasis).
    // A rejected opening balance cannot become the missing-balance fallback.
    if ([balanceAnnual[balanceIndex], balanceAnnual[balanceIndex + 1]]
      .some(row => leaseDebtConflict(row ?? {}) !== null)) continue;
    const debtThisYear = bookDebtOnLeaseBasis(balanceAnnual[balanceIndex], includeOperatingLeases).value;
    const debtPriorYear = bookDebtOnLeaseBasis(balanceAnnual[balanceIndex + 1], includeOperatingLeases).value;
    if (debtThisYear === null || debtThisYear <= 0) continue;
    if (debtPriorYear !== null && debtPriorYear < 0) continue;
    const openingDate = isoDay(balanceAnnual[balanceIndex + 1]?.date);
    const currency = str(income?.reportedCurrency);
    const latestFiscalYearEnd = isoDay(incomeAnnual[0]?.date);
    const elapsedDays = latestFiscalYearEnd === null ? null : (Date.parse(latestFiscalYearEnd) - Date.parse(fiscalYearEnd)) / 86_400_000;
    const borrowingCost = (interestExpense === null || interestExpense === 0) && options.borrowingCostEvidence &&
      elapsedDays !== null && elapsedDays >= 350 && elapsedDays <= PRIOR_YEAR_COST_OF_DEBT_MAX_YEARS_BACK * 371 &&
      openingDate && currency && balanceAnnual[balanceIndex]?.reportedCurrency === currency &&
      balanceAnnual[balanceIndex + 1]?.reportedCurrency === currency && debtPriorYear !== null
      ? filedAnnualBorrowingCost({ ...options.borrowingCostEvidence, fiscalYearEnd, openingDate, unit: currency,
          closingDebt: debtThisYear, openingDebt: debtPriorYear }) : null;
    if (!(interestExpense !== null && interestExpense > 0) && !borrowingCost) continue;
    const totalDebtAvg =
      debtPriorYear !== null && debtPriorYear > 0 ? (debtThisYear + debtPriorYear) / 2 : debtThisYear;
    return {
      pct: ((borrowingCost?.amount ?? interestExpense!) / totalDebtAvg) * 100,
      fiscalYearEnd,
      yearsBack: borrowingCost ? Math.round(elapsedDays! / 365.25) : index,
      interestExpense: interestExpense ?? 0,
      ...(borrowingCost ? { borrowingCost } : {}),
      totalDebtAvg,
      operatingIncomeEvidence: operatingIncomeEvidenceForNonMargins(income),
      ebit: borrowingCost || operatingIncomeForNonMargins(income) === null ? null : operatingIncomeForNonMargins(income)! - (options.unusualByYear?.get(fiscalYearEnd) ?? 0),
      coverageBasis: options.unusualByYear?.get(fiscalYearEnd) ? `FY ${fiscalYearEnd} operating income excluding tagged one-off items of ${options.unusualByYear.get(fiscalYearEnd)}` : undefined,
    };
  }
  return null;
}

function totalDebtSnapshot(
  balancesAnnual: FmpBalanceSheetRow[],
  balancesQuarterly: FmpBalanceSheetRow[],
  interestBasis: "ttm" | "annual",
  includeOperatingLeases: boolean,
  /** Other statements' rows: filing-linked currency evidence for an unlabelled balance row. */
  currencyEvidence: readonly CurrencyEvidenceRow[] = [],
  leaseEvidenceContext?: LeaseEvidenceContext,
): {
  average: number | null;
  negativeObservation: number | null;
  basis: string;
  /** The one currency the balances averaged are established in; null when not established. */
  currency: string | null;
  /** D-60: the newer balance of the pair on the same lease basis, and what it is. */
  latest?: number | null;
  latestBasis?: string;
  /** D-105: why no average was established, naming the balance date. */
  unavailable?: string;
  /** D-133: `unavailable` is a refusal of debt the balance carries, not an absent balance. */
  refused?: true;
  /** The date of the balance whose debt refusal (or invalid negative debt) withheld the average (D-133). */
  refusedBalanceDate?: string;
} {
  const quarterEnd = balancesQuarterly[0];
  const quarterEndMs = Date.parse(String(quarterEnd?.date ?? ""));
  const yearEarlier = balancesQuarterly.find(row => Math.abs(quarterEndMs - Date.parse(String(row.date)) - 365.25 * SPREAD_DAYS) <= 45 * SPREAD_DAYS);
  const quarterPair = interestBasis === "ttm" && quarterEnd && yearEarlier && num(quarterEnd.totalDebt) !== null && num(yearEarlier.totalDebt) !== null ? [quarterEnd, yearEarlier] : null;
  const annualPair = [balancesAnnual[0], balancesAnnual[1]].filter((row): row is FmpBalanceSheetRow => row !== undefined);
  const refusal = (row: FmpBalanceSheetRow): string | null => row.fieldConflicts?.totalDebt?.usable === false
    ? row.fieldConflicts.totalDebt.reason : leaseDebtScopeRefusal(row, includeOperatingLeases) ?? leaseDebtConflict(row);
  const complete = (row: FmpBalanceSheetRow): boolean => refusal(row) === null && bookDebtOnLeaseBasis(row, includeOperatingLeases).value !== null;
  // Preserve the existing complete annual-pair fallback for lease scope. Other
  // refused dates are excluded individually; they cannot veto clean balances.
  const pair = quarterPair && !(quarterPair.some(row => refusal(row) !== null) && annualPair.length === 2 && annualPair.every(complete))
    ? quarterPair : annualPair;
  const all = [...balancesQuarterly, ...balancesAnnual].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const newest = all[0];
  const negative = [...pair, ...(newest ? [newest] : [])].find(row => (num(row.totalDebt) ?? 0) < 0);
  if (negative) return { average: null, negativeObservation: num(negative.totalDebt), basis: "invalid negative debt observation", currency: null, refusedBalanceDate: isoDay(negative.date) ?? undefined };
  const used = pair.filter(complete);
  const oldest = pair.map(row => String(row.date)).sort()[0];
  const latestComplete = all.find(row => complete(row) && (oldest === undefined || String(row.date) >= oldest));
  if (used.length === 0 && latestComplete) used.push(latestComplete);
  const excluded = [...new Map([...pair, ...(newest ? [newest] : [])].filter(row => refusal(row) !== null)
    .map(row => [String(row.date), row])).values()];
  const exclusion = excluded.length ? "; excluded withheld balances: " + excluded.map(row => isoDay(row.date) + ": " + refusal(row)).join("; ") : "";
  const scope = (used.length ? used : pair).flatMap(row => [leaseEvidenceNote({ ...row, leaseEvidenceContext },
    { removed: bookDebtOnLeaseBasis(row, includeOperatingLeases).leaseRemoved ? num(row.operatingLeaseLiability) : null }),
    ...(incompleteLeaseCoverage(row) ? [incompleteLeaseCoverage(row)!.note] : [])]);
  const which = quarterPair && pair === quarterPair
    ? `the quarter-end balances at the TTM window's ends (${isoDay(quarterEnd!.date)} and ${isoDay(yearEarlier!.date)})`
    : "the latest two fiscal-year-end balances" + (quarterPair
      ? ` (so TTM interest is measured against fiscal-year-end debt; the quarter-end pair (${isoDay(quarterEnd!.date)} and ${isoDay(yearEarlier!.date)}) is not used: ${quarterPair.map(refusal).find(Boolean)})`
      : interestBasis === "ttm" ? " (no quarter-end balance four quarters back, so TTM interest is measured against fiscal-year-end debt)" : "");
  const basis = `book total debt on the retained calculation basis, average of ${which}${scope.length ? ` (retained lease coverage: ${scope.join(" ").replace(/\.$/, "")})` : ""}` +
    (excluded.length ? `; only complete balances used (${used.map(row => isoDay(row.date)).join(" and ") || "none"})${exclusion}` : "") +
    (newest && latestComplete && latestComplete !== newest ? `; the newest balance (${isoDay(newest.date)}) is not used for the debt weight, which uses the latest complete balance` : "");
  const currency = establishedRowsCurrency(used, currencyEvidence);
  if (used.length === 0) {
    const rejected = excluded[0];
    const unavailable = rejected ? isoDay(rejected.date) + ": " + refusal(rejected)
      : pair.length ? `no book total debt on ${pair.map(row => isoDay(row.date)).join(" or ")}${pair.length < 2 ? ", and no second balance to average it with" : ""}` : "no balance sheet to average";
    return { average: null, negativeObservation: null, basis, currency, unavailable,
      ...(rejected ? { refused: true as const, refusedBalanceDate: isoDay(rejected.date) ?? undefined } : {}) };
  }
  const average = used.reduce((sum, row) => sum + bookDebtOnLeaseBasis(row, includeOperatingLeases).value!, 0) / used.length;
  const latestCurrency = latestComplete ? establishedRowsCurrency([latestComplete], currencyEvidence) : null;
  const latest = latestComplete && latestCurrency !== null && latestCurrency === currency ? {
    latest: bookDebtOnLeaseBasis(latestComplete, includeOperatingLeases).value,
    latestBasis: "book total debt on the retained calculation basis, the latest " + (excluded.length ? "complete " : "") + "balance (" + isoDay(latestComplete.date) + ")" +
      (latestComplete === newest ? ", the one the EV bridge nets" : "; the newer withheld balance is not used; its EV bridge remains withheld") +
      " (lease evidence: " + leaseEvidenceNote({ ...latestComplete, leaseEvidenceContext },
        { removed: bookDebtOnLeaseBasis(latestComplete, includeOperatingLeases).leaseRemoved ? num(latestComplete.operatingLeaseLiability) : null }).replace(/\.$/, "") +
      (incompleteLeaseCoverage(latestComplete) ? "; " + incompleteLeaseCoverage(latestComplete)!.note.replace(/\.$/, "") : "") + ")" + exclusion,
  } : {};
  return { average, negativeObservation: null, basis, currency, ...latest };
}

export function computeReturns(
  bundle: DataBundle,
  incomeAnnual: FmpIncomeStatementRow[],
  balanceAnnual: FmpBalanceSheetRow[],
  balanceQuarterly: FmpBalanceSheetRow[],
  /** Currency-compatible annual cash flows (preferred dividends for ROTE). */
  cashflowAnnual: FmpCashFlowRow[],
  ttmInc: TtmIncome | null,
  route: CompanyRouteResult,
  /** One lease basis for the EV bridge, invested capital and the WACC's debt leg (read once in runStageB). */
  includeOperatingLeases: boolean,
  /** The statements' established currency (StatementCurrencies.model) for the ADR guard. */
  modelCurrency: string | null,
  /** StatementCurrencies.ttmIncomeUsable: the window's currency matches the annual statement's. */
  ttmIncomeUsable: boolean,
  foreignBasis: ForeignValuationBasis | null,
  /** Same admitted quarter window, independently of revenue completeness. */
  earningsTtm: TtmIncome | null,
): ReturnsBlock {
  const notes: string[] = [];
  const gaps: ManifestEntry[] = [];

  const profile = firstRow(bundle.profile);
  const quote = firstRow(bundle.quote);
  const ratiosTtm = rowsOf(bundle.ratiosTtm)[0] ?? rowsOf(bundle.ratios)[0];
  const rf = riskFreePct(bundle);
  const erpSelection = selectEquityRiskPremium(
    rowsOf(bundle.marketRiskPremium),
    str(profile?.country),
  );
  const usErpPct = erpSelection.pct;
  if (erpSelection.basis === "us-fallback") {
    notes.push(
      `Equity risk premium: no vendor row for ${erpSelection.country ?? "the issuer's domicile"} — the US ` +
        "premium is used, which OMITS the country risk premium and understates cost of equity for a " +
        "non-US issuer (no country-risk adjustment applied).",
    );
    gaps.push({
      field: "returns.wacc.erp.country",
      reason: `equity risk premium for ${erpSelection.country ?? "issuer domicile"} unavailable — US premium substituted without a country-risk adjustment`,
      severity: "warn",
    });
  }
  const bal0 = balanceAnnual[0];

  const isFinancial = route.base === "bank" || route.base === "insurer" || route.base === "reit-mortgage";

  // P13: key the annual fallback on FIELD nullness, not on
  // ttmInc existence — when the completeness gate nulls a TTM field the annual
  // figure must still be consulted. Missing interest with debt now suppresses
  // WACC, but using a complete annual observation preserves more valid output.
  //
  // D-25: ONE statement basis for both legs of the coverage
  // ratio. The two fallbacks used to be independent, so a TTM EBIT could be
  // scored against a fiscal-year interest expense (a notch of rating from the
  // mix) under a note that said "on TTM". When the TTM pair is incomplete
  // and the annual pair is complete, the annual figures are used for BOTH
  // legs; a genuinely mixed pair is the last resort and is labelled as such.
  // The basis also decides which balance-sheet pair averages the debt.
  const annualDate = isoDay(incomeAnnual[0]?.date) ?? "?";
  const interestExpenseAnnual = num(incomeAnnual[0]?.interestExpense);
  const ebitAnnual = operatingIncomeForNonMargins(incomeAnnual[0]) ?? num(incomeAnnual[0]?.waccOperatingIncome);
  const standaloneAnnualCoverage = operatingIncomeForNonMargins(incomeAnnual[0]) === null && num(incomeAnnual[0]?.waccOperatingIncome) !== null;
  // The TTM interest is divided by the debt balances at the window's ends; a
  // ratio of two sums is a figure only when both are in one currency. When the
  // balances are not established in the window's currency, the TTM pair is not
  // used for the coverage or the cost of debt and the annual basis is.
  const statementEvidence: CurrencyEvidenceRow[] = [
    ...rowsOf(bundle.statements.incomeQuarterly),
    ...rowsOf(bundle.statements.cashflowQuarterly),
    ...rowsOf(bundle.statements.incomeAnnual),
    ...rowsOf(bundle.statements.cashflowAnnual),
  ];
  const ttmDebtCurrency = ttmInc
    ? totalDebtSnapshot(balanceAnnual, balanceQuarterly, "ttm", includeOperatingLeases, statementEvidence, leaseEvidenceContextFor(bundle.symbol, bundle.edgar, bundle.builtAt)).currency
    : null;
  const ttmDebtComparable = ttmInc !== null && ttmInc.reportedCurrency !== null && ttmDebtCurrency === ttmInc.reportedCurrency;
  if (ttmInc && !ttmDebtComparable && (ttmInc.interestExpense !== null || ttmInc.ebit !== null || ttmInc.operatingIncome !== null)) {
    notes.push(
      `WACC interest expense and EBIT: the TTM window is in ${ttmInc.reportedCurrency ?? "an unestablished currency"} but the debt ` +
        `balances it would be measured against are ${ttmDebtCurrency === null ? "not established in one currency" : `in ${ttmDebtCurrency}`} — ` +
        "the TTM pair is not set against them; the latest annual statement is used instead",
    );
  }
  const interestExpenseTtm = ttmDebtComparable ? (ttmInc?.interestExpense ?? null) : null;
  // Match the annual and DCF operating-income basis. A broader vendor EBIT
  // is not a substitute for an unreported operating-income coverage leg.
  const ebitTtm = ttmDebtComparable ? operatingIncomeForNonMargins(ttmInc) : null;
  let interestExpenseForWacc: number | null;
  let ebitForWacc: number | null;
  let coverageUsesAnnualOperatingIncome = false;
  let coverageBasis: string;
  let interestBasis: "ttm" | "annual";
  if (ttmInc && interestExpenseTtm !== null && ebitTtm !== null) {
    interestExpenseForWacc = interestExpenseTtm;
    ebitForWacc = ebitTtm;
    coverageBasis = "TTM";
    interestBasis = "ttm";
  } else if (interestExpenseAnnual !== null && ebitAnnual !== null) {
    interestExpenseForWacc = interestExpenseAnnual;
    ebitForWacc = ebitAnnual;
    coverageUsesAnnualOperatingIncome = true;
    coverageBasis = `FY ${annualDate} annual statement${standaloneAnnualCoverage ? ` (derived from filed pretax/nonoperating operands; unverified consolidated operating scope, retained for standalone interest coverage only; ${incomeAnnual[0]?.fieldProvenance?.waccOperatingIncome?.tags.join(", ") ?? "derivation unavailable"})` : ""}`;
    interestBasis = "annual";
    if (ttmInc && ttmDebtComparable) {
      notes.push(
        `WACC interest expense and EBIT: the TTM pair is incomplete (${
          interestExpenseTtm === null ? "interest expense" : "EBIT"
        } suppressed or unreported) — the latest annual FY (${annualDate}) figures are used for BOTH legs so the coverage ratio stays on one basis`,
      );
    }
  } else {
    interestExpenseForWacc = interestExpenseTtm ?? interestExpenseAnnual;
    ebitForWacc = ebitTtm ?? ebitAnnual;
    coverageUsesAnnualOperatingIncome = ebitTtm === null;
    const interestLabel =
      interestExpenseTtm !== null ? "TTM" : interestExpenseAnnual !== null ? `FY ${annualDate}` : "unavailable";
    const ebitLabel = ebitTtm !== null ? "TTM" : ebitAnnual !== null ? `FY ${annualDate}${standaloneAnnualCoverage ? " derived from filed pretax/nonoperating operands; unverified consolidated operating scope, retained for standalone interest coverage only" : ""}` : "unavailable";
    interestBasis = interestExpenseTtm !== null ? "ttm" : "annual";
    coverageBasis =
      interestLabel === ebitLabel
        ? interestLabel
        : `mixed basis — interest expense ${interestLabel}, EBIT ${ebitLabel}`;
    if (interestExpenseForWacc !== null && ebitForWacc !== null && interestLabel !== ebitLabel) {
      notes.push(
        `WACC coverage ratio pairs ${interestLabel} interest expense with ${ebitLabel} EBIT — a mixed basis, named in the synthetic-rating note, because no single-basis pair was available`,
      );
    } else if (ttmInc && ttmDebtComparable && interestExpenseTtm === null && interestExpenseAnnual !== null) {
      notes.push(
        `WACC interest expense: TTM field unavailable (suppressed or unreported) — latest annual FY (${annualDate}) figure used instead`,
      );
    } else if (ttmInc && ttmDebtComparable && ebitTtm === null && ebitAnnual !== null) {
      notes.push(
        `WACC EBIT (interest-coverage input): TTM fields unavailable (suppressed or unreported) — latest annual FY (${annualDate}) operating income used instead`,
      );
    }
  }
  const annualUnusual = unusualOperatingItemsByFiscalYear(confirmedIssuerFacts(bundle.symbol, bundle.edgar), {
    fiscalYearEnds: incomeAnnual.map(r => isoDay(r.date) ?? ""), unit: modelCurrency, observedAt: bundle.builtAt,
  });
  const coverageUnusual = ebitTtm !== null && ebitForWacc === ebitTtm
    ? unusualOperatingItemsTtm(confirmedIssuerFacts(bundle.symbol, bundle.edgar), {
      ttmEnd: ttmInc!.date, fiscalYearEnd: incomeAnnual.map(r => isoDay(r.date) ?? "").find(d => d <= ttmInc!.date) ?? null, unit: modelCurrency, observedAt: bundle.builtAt,
    }) : annualUnusual.get(annualDate);
  if (ebitForWacc !== null && coverageUnusual && coverageUnusual.value !== 0) {
    ebitForWacc -= coverageUnusual.value;
    coverageBasis += ` operating income excluding tagged one-off items of ${coverageUnusual.value}: ${coverageUnusual.basis}`;
  }
  const historyUnusual = withoutRecurringFamilies(annualUnusual, withoutTransitionPeriods(normalizeQuarterRows(incomeAnnual).rows).rows.map(r => isoDay(r.date) ?? ""));
  const recurrenceBasis = recurringOperatingItemsBasis(historyUnusual.recurring);
  const debtSnapshot = totalDebtSnapshot(balanceAnnual, balanceQuarterly, interestBasis, includeOperatingLeases, statementEvidence, leaseEvidenceContextFor(bundle.symbol, bundle.edgar, bundle.builtAt));

  // D-60: the beta's regression window, frequency and fit. A vendor beta
  // publishes none, so the same 60-month OLS the keyless route uses runs on the
  // bundle's own daily prices (bars before the analysis day only) and is
  // disclosed beside it. D-204 retains a plausible provider beta; computeWacc
  // may use this independent fit only when the provider beta is unusable.
  const betaFit = estimateBeta(
    betaClosePoints(rowsOf(bundle.eodPrices)),
    betaClosePoints(bundle.benchmarkPrices ? rowsOf(bundle.benchmarkPrices.spy) : []),
    { asOf: isoDay(bundle.builtAt) ?? undefined },
  );
  const keylessBeta = profile !== null && num(profile.betaMonths) !== null;

  const classAmbiguity = retainedCommonClassAmbiguity(bundle);
  const equityQuote = {
    price: num(quote?.price) ?? num(profile?.price), marketCap: num(quote?.marketCap ?? profile?.marketCap),
    currency: str(profile?.currency),
    priceAsOf: quotePriceObservationDay(num(quote?.price) !== null ? quote : profile),
    issuerId: bundle.edgar.registrant?.cik10, securityId: bundle.symbol,
    ...(classAmbiguity ? { marketCapSecurityBasis: "unresolved" as const, marketCapScopeEvidence: classAmbiguity } : {}),
  };
  const equityScope = resolveEconomicEquityScope(equityQuote, bundle.economicShareEvidence ?? [], isoDay(bundle.builtAt) ?? "");

  const taxWindowPretax = ttmInc === null ? effectiveTaxPretaxIncome(incomeAnnual[0]) : ttmInc.taxRatePretaxIncome;
  // D-237 (P8): the provider's ratio divides by its own pre-tax income. Where the
  // filings re-based the TTM pair's denominator, that ratio rests on another
  // basis than the provision and the filed pair replaces it.
  const filedTaxPair = ttmInc !== null && (ttmInc.taxRateOperandsFiled || ttmInc.taxRatePretaxBasis !== null);
  const vendorTaxRate = filedTaxPair || (taxWindowPretax !== null && taxWindowPretax <= 0) ? null : num(ratiosTtm?.effectiveTaxRateTTM ?? ratiosTtm?.effectiveTaxRate);
  const statementTax = waccTaxRateFromStatements(ttmInc, incomeAnnual[0]);
  if (vendorTaxRate === null && statementTax.fallback !== null) {
    gaps.push({ field: "returns.wacc.effectiveTaxRate.basis", reason: `WACC tax rate: ${statementTax.fallback}`, severity: "info" });
  }

  const usdMoney = (v: number | null | undefined): number | null => v == null ? null : v * (foreignBasis?.fx.usdPerReportingUnit ?? 1);
  const wacc = computeWacc({
    beta: num(profile?.beta),
    riskFreePct: rf.pct,
    erpPct: usErpPct,
    ...(erpSelection.basis === "domicile" && erpSelection.country && !US_COUNTRY_KEYS.has(countryKeyOf(erpSelection.country)) ? { erpCountry: erpSelection.country } : {}),
    interestExpenseTtm: usdMoney(interestExpenseForWacc),
    // Never inferred on ANY financial route — bank, insurer and mortgage REIT
    // alike — and on keyed plans as well as keyless ones.
    //
    // The reason is what the route consumes, not how it is funded: all three
    // value on the cost of equity (the excess-return and price-to-book models
    // in valuation.ts), and none reads the WACC cost of debt. Nor would
    // interest expense over short-plus-long-term debt BE their funding cost:
    // deposits, policy reserves and repo are the liabilities that fund them,
    // and repo is tagged `SecuritiesSoldUnderAgreementsToRepurchase`, which is
    // outside the debt chains — so the inference is wrong for a mortgage REIT
    // for the same reason it is wrong for a bank (the ratio can read far above
    // any borrowing rate). Financials keep the existing "cost of debt unavailable, cost of
    // equity carried" outcome.
    priorYearCostOfDebt:
      !isFinancial && (interestExpenseForWacc === null || interestExpenseForWacc <= 0)
        ? priorYearCostOfDebt(incomeAnnual, balanceAnnual, { includeOperatingLeases, unusualByYear: new Map([...annualUnusual].map(([date, value]) => [date, value.value])),
            borrowingCostEvidence: { facts: bundle.edgar?.companyFacts?.ok && Date.parse(bundle.edgar.companyFacts.value.fetchedAt) <= Date.parse(bundle.builtAt)
              ? confirmedIssuerFacts(bundle.symbol, bundle.edgar) : null, observedAt: bundle.edgar?.companyFacts?.ok ? bundle.edgar.companyFacts.value.fetchedAt : bundle.builtAt } })
        : null,
    totalDebtAvg: usdMoney(debtSnapshot.average),
    totalDebtBasis: debtSnapshot.basis,
    totalDebtUnavailable: debtSnapshot.unavailable ?? null,
    totalDebtRefused: debtSnapshot.refused === true,
    totalDebtLatest: usdMoney(debtSnapshot.latest),
    totalDebtLatestBasis: debtSnapshot.latestBasis ?? null,
    currentCoverageBasis: coverageBasis,
    negativeTotalDebtObservation: usdMoney(debtSnapshot.negativeObservation),
    marketCap: equityScope.marketCap,
    // P20: a cap withheld on share scope is named as withheld, with the scope's reason.
    marketCapWithheld: equityScope.status === "unresolved" ? equityScope.basis : null,
    // FMP's ratios-ttm endpoint suffixes every metric name with "TTM"
    // (effectiveTaxRate -> effectiveTaxRateTTM); the annual ratios fallback row
    // keeps the bare name. Try both so a live vendor rename doesn't silently
    // suppress a levered WACC unnecessarily.
    effectiveTaxRate: vendorTaxRate ?? statementTax.rate,
    // WS6 (D-19): name which tax-rate source actually supplied it.
    effectiveTaxRateBasis:
      vendorTaxRate !== null && num(ratiosTtm?.effectiveTaxRateTTM) !== null
        ? "Provider trailing effective tax rate (observed)"
        : vendorTaxRate !== null && num(ratiosTtm?.effectiveTaxRate) !== null
          ? "Provider effective tax rate (observed)"
          : statementTax.basis,
    riskFreeSeriesId: rf.seriesId,
    erpAsOf: sourcedOf(bundle.marketRiskPremium)?.asOf ?? null,
    betaSource: keylessBeta
      ? "keyless profile regression on monthly returns"
      : "vendor profile beta; the vendor publishes no regression window or fit",
    betaRegression: betaFit.beta === null ? null : {
      beta: betaFit.beta, months: betaFit.months, windowStart: betaFit.windowStart, windowEnd: betaFit.windowEnd,
      rSquared: betaFit.rSquared, standardError: betaFit.standardError, basis: betaFit.basis, benchmark: "SPY",
    },
    betaRegressionUnavailable: betaFit.beta === null ? (betaFit.gap?.reason ?? betaFit.note) : null,
    ebitTtm: usdMoney(ebitForWacc),
    operatingIncomeEvidence: ebitForWacc === null ? undefined : coverageUsesAnnualOperatingIncome
      ? operatingIncomeEvidenceForNonMargins(incomeAnnual[0], standaloneAnnualCoverage) : ttmInc?.operatingIncomeEvidence,
    analysisDate: isoDay(bundle.builtAt) ?? undefined,
    isFinancial,
    // D-104: these routes value equity at the cost of equity.
    equityOnlyRoute: isFinancial ? route.base : null,
    totalAssets: bal0 ? usdMoney(num(bal0.totalAssets)) : null,
    // ADR guard: market cap is quoted in the trading currency while totalDebt
    // is a reporting-currency balance, so the E/D weights must not mix them.
    reportedCurrency: foreignBasis ? "USD" : modelCurrency,
    quoteCurrency: str(profile?.currency),
    asOf: {
      riskFreeRate: rf.asOf ?? undefined,
      statements: isoDay(interestBasis === "ttm" ? ttmInc?.date : incomeAnnual[0]?.date) ?? undefined,
      marketCap: (equityScope.status === "resolved" ? equityScope.priceAsOf ?? null
        : equityScope.status === "unresolved" ? null
          : quotePriceObservationDay(num(quote?.marketCap) !== null ? quote : profile)) ?? undefined,
    },
  });

  if (foreignBasis) wacc.notes.push(foreignBasis.note);

  if (route.overlays.includes("recent-ipo") && wacc.costOfEquityPct === null && betaFit.beta === null &&
    wacc.gaps.some(gap => gap.field === "returns.wacc.beta")) {
    const populatedPeers = Object.keys(bundle.peerFundamentals?.candidates ?? {}).length;
    const peerBasis = populatedPeers === 0
      ? `No peer candidate was populated (${bundle.peerFundamentals?.candidateCount ?? 0} discovered; see exclusions); the peer collection would retain profiles, quotes and quarterly statements only, without peer price histories, a common regression window or validated unlever/relever operands. `
      : `The peer collection retains ${populatedPeers} candidate(s), with profiles, quotes and quarterly statements, without peer price histories, a common regression window or validated unlever/relever operands. `;
    const reason = `Recent IPO: the retained issuer/SPY history supplies ${betaFit.months} usable monthly return observations; ${BETA_MIN_MONTHS} are required for the issuer regression. ` +
      peerBasis +
      "Bottom-up beta was not substituted. No sourced industry asset-beta dataset is retained; a sector ETF beta measures fund exposure, not an issuer asset beta. " +
      "Cost of equity remains withheld; any WACC needing it remains withheld. No fallback point estimate or sensitivity is presented.";
    wacc.notes.push(reason);
    wacc.betaRegressionUnavailable = `${wacc.betaRegressionUnavailable ?? "Issuer regression unavailable."} ${reason}`;
    for (const gap of wacc.gaps) if (gap.field === "returns.wacc.beta") gap.reason += `. ${reason}`;
  }

  if (equityScope.status === "unresolved") {
    wacc.gaps.push({ field: "returns.wacc.economicClassBasis", reason: equityScope.basis, severity: "warn", attemptedSources: equityScope.sourceIds });
  }
  // D-137: refusing this previously used cap
  // would newly Block the DCF. Preserve the existing WACC, but disclose its
  // unproven ADR scope. Existing currency/class refusals remain dominant.
  if ((route.overlays.includes("adr") || profile?.isAdr === true)
    && !foreignBasis && equityScope.status !== "unresolved" && wacc.waccPct !== null && wacc.weightEquity !== 1) {
    const capRow = quote?.marketCap != null ? quote : profile;
    const adrScope = resolveEconomicEquityScope({ ...equityQuote, isAdr: true,
      ...(capRow?.marketCapSecurityBasis === "issuer-common" ? { marketCapSecurityBasis: "issuer-common" as const } : {}),
    }, bundle.economicShareEvidence ?? [], isoDay(bundle.builtAt) ?? "");
    if (adrScope.status === "unresolved") {
      wacc.gaps.push({ field: "returns.wacc.adrMarketEquityScope", severity: "warn", attemptedSources: adrScope.sourceIds,
        reason: "ADR market-cap scope is not established as issuer-common. WACC retains the provided capitalization; its equity weight remains unverified. No depositary ratio is inferred." });
    }
  }

  // L9: the evidenced non-bank lender has neither an applicable FCFF DCF
  // nor an excess-return model. A refused, unconsumed rate is disclosure.
  if (route.base === "general" && route.cashFlowApplicability?.status === "not-applicable") {
    for (const gap of wacc.gaps) if (gap.severity === "critical") {
      gap.severity = "info";
      gap.reason += ". Disclosure only: no applicable model consumes this discount rate; the evidenced lender's FCFF DCF is not applicable and no excess-return model is used.";
    }
  }

  // Preferred dividends live on the CASH-FLOW statement; ROTE nets them out of
  // its numerator because its denominator already excludes preferred.
  const preferredByDate = new Map<string, FmpCashFlowRow>(
    cashflowAnnual.map((r: FmpCashFlowRow) => [String(r.date ?? ""), r]),
  );
  const returnsIncome = withoutTransitionPeriods(normalizeQuarterRows(incomeAnnual).rows).rows.map((r) => toReturnsIncome(r, preferredByDate,
    [...rowsOf(bundle.statements.balanceAnnual), ...rowsOf(bundle.statements.balanceQuarterly)],
    [...rowsOf(bundle.statements.cashflowAnnual), ...rowsOf(bundle.statements.cashflowQuarterly)], bundle.builtAt));
  const returnsBalance = balanceAnnual.map(toReturnsBalance);

  const roic: RoicResult = isFinancial
    ? { series: [], latestRoicPct: null, asOf: isoDay(incomeAnnual[0]?.date),
        notes: ["ROIC is not applicable to financial companies: funding liabilities and cash are operating inputs."], gaps: [] }
    : computeRoic(returnsIncome, returnsBalance, { includeOperatingLeases, domicileCountry: str(profile?.country),
        unusualByYear: new Map([...historyUnusual.byYear].map(([date, value]) => [date, value.value])),
        // D-135: the annual balance dates whose temporary-equity enrichment was withheld (the same matcher the bridge uses).
        temporaryEquityUnknownDates: balanceAnnual.flatMap((r) => {
          const unknown = temporaryEquityUnknownAt(r, isoDay(r.date), bundle.gaps);
          return unknown === null ? [] : [unknown.date];
        }),
        // D-133: the balance whose debt refusal withheld the WACC; ROIC's entry is critical only when
        // that same balance refusal withholds the latest fiscal year's ROIC.
        waccRefusal: wacc.waccPct === null && debtSnapshot.refusedBalanceDate !== undefined ? { date: debtSnapshot.refusedBalanceDate } : null });
  if (recurrenceBasis) roic.notes.push(recurrenceBasis);
  // Return on tangible common equity — the capital-return measure for
  // deposit-funded balance sheets, where invested capital is undefined.
  const rote = computeRote(returnsIncome, returnsBalance);
  // D-102: the trailing four quarters on the fiscal-year return's basis,
  // from the quarterly rows already fetched. A window in another currency than
  // the annual statement is withheld here as it is from the valuation: its
  // earnings cannot be set against balances in the model currency.
  const commonIncomeTtm = earningsTtm?.reportedCurrency === modelCurrency ? earningsTtm : null;
  const commonReturnTtm = isFinancial
    ? computeTtmCommonReturn({
        // The same earnings evidence the TTM P/E admits common income from.
        income: commonIncomeTtm === null ? null : {
          netIncome: commonIncomeTtm.netIncome,
          netIncomeAvailableToCommon: commonIncomeTtm.netIncomeAvailableToCommon ?? null,
          commonIncomeWithheldReason: commonIncomeTtm.commonIncomeWithheldReason,
          netIncomeWithheldReason: commonIncomeTtm.netIncomeWithheldReason,
          netIncomeOwnershipBasis: commonIncomeTtm.netIncomeOwnershipBasis,
          noncontrollingIncome: commonIncomeTtm.netIncomeAttributableToNoncontrollingInterest,
          incomeScope: commonIncomeTtm.incomeScope, commonIncomeScope: commonIncomeTtm.commonIncomeScope, noncontrollingIncomeScope: commonIncomeTtm.noncontrollingIncomeScope,
          targetScope: commonIncomeTtm.targetScope, admissionAsOf: commonIncomeTtm.admissionAsOf,
          preferredClaimsInPeriod: preferredClaimsInFlow(commonIncomeTtm.incomeScope ?? { periodEnd: commonIncomeTtm.date, basis: "ttm" },
            [...rowsOf(bundle.statements.balanceAnnual), ...rowsOf(bundle.statements.balanceQuarterly)],
            [...rowsOf(bundle.statements.cashflowAnnual), ...rowsOf(bundle.statements.cashflowQuarterly)]),
        },
        asOf: commonIncomeTtm?.date ?? null,
        periodStart: commonIncomeTtm?.commonIncomeScope?.periodStart ?? commonIncomeTtm?.incomeScope?.periodStart ?? null,
        balances: [...balanceQuarterly, ...balanceAnnual].map(toReturnsBalance),
        basis: route.base === "bank" ? "tangible-common-equity" : "common-equity",
      })
    : null;
  if (commonReturnTtm !== null) notes.push(commonReturnTtm.basisText);
  const dupont = computeDupont(returnsIncome, returnsBalance);

  // WS6 (D-19): recompute the WACC at each ROIC fiscal year end from that
  // year's own FRED observation. The bundle fetches DGS10 five years back, so
  // years outside that window (or without an observation near the year end)
  // are reported as missing and the current WACC is applied to them instead.
  const waccHistory = waccByFiscalYear(
    wacc,
    roic.series.map((y) => y.date),
    riskFreeObservations(bundle),
    { seriesId: WACC_HISTORY_RF_SERIES_ID },
  );
  const roicVsWacc = computeFiscalRoicVsWaccSpread(roic.latestRoicPct, wacc.waccPct, roic.series.at(-1)?.date ?? roic.asOf, waccHistory);
  notes.push(roicVsWacc.note);
  const waccInputs = waccDisclosure(wacc);
  if (equityScope.approximation) waccInputs.summary += ` ${conversionRightsNote(equityScope.approximation)}`;
  notes.push(waccInputs.summary);
  notes.push(...waccHistory.notes);
  // N8: the CURRENT WACC's risk-free rate is FRED DGS10 when available (D-60)
  // and the vendor's treasury endpoint only as the fallback, while every per-year
  // WACC is recomputed from DGS10. When the two differ, the newest fiscal year's
  // own WACC can differ from the current one by SOURCE rather than by time, and
  // saying so is the difference between a disclosed basis and a puzzling one.
  const currentRfSeries = wacc.riskFreeSeriesId;
  if (
    waccHistory.points.length > 0 &&
    typeof currentRfSeries === "string" &&
    currentRfSeries !== WACC_HISTORY_RF_SERIES_ID
  ) {
    notes.push(
      `Risk-free SOURCE differs between the current WACC and its history: the current WACC uses ${currentRfSeries}, ` +
        `every per-fiscal-year WACC uses ${WACC_HISTORY_RF_SERIES_ID}. The newest year's own WACC can therefore differ ` +
        "from the current one because the two rates come from different series, not because the rate moved over time.",
    );
  }
  // N1: the per-year-WACC shortfall reaches the missing-data manifest. It used
  // to be deliberately withheld here on the grounds that the DCF assumption
  // block discloses it, but that block only raises its own gap when NO year
  // carried its own WACC — a partial shortfall was disclosed nowhere.
  gaps.push(...wacc.gaps, ...roic.gaps, ...rote.gaps, ...dupont.gaps, ...waccHistory.gaps);
  return { wacc, waccInputs, waccHistory, roic, rote, commonReturnTtm, dupont, roicVsWacc, notes, gaps };
}
