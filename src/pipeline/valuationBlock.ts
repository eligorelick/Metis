/**
 * Valuation block, split out of compute.ts: assembles the discriminated valuation inputs Stage B
 * hands to the valuation methods (DCF guidance, multiples balance, share divisors, equity-method
 * window, net debt, payout history) from admitted rows (P13, P14, P15, P16).
 */

import { forwardAnnualEstimates } from "./forwardEstimates";
import { translateValuationInputs, type ForeignValuationBasis } from "@/pipeline/foreignCurrency";
import { convertibleInstrumentsAt, foldConvertiblePreferred } from "@/pipeline/stageB/convertibles";
import { isFmpQuotaGap, quotePriceObservationDay } from "@/providers/fmp";
import { gapCauseMatches } from "@/edgar/refusalCauseRead";
import { calibratedRevenueCurrency, inheritedIssuerCurrency, providerRowCurrency } from "@/pipeline/estimateCurrency";
import { comparePeerFundamentals } from "@/pipeline/peers";
import { nextPeriodRevenueGuidance } from "@/pipeline/filingDisclosures";
import type { ManifestEntry } from "@/types/core";
import type { DataBundle } from "@/pipeline/types";
import { operatingIncomeForNonMargins, operatingMarginBasis } from "@/pipeline/incomeBasis";
import { filedAnnualNciEarnings } from "@/pipeline/nciEarnings";
import type { FmpBalanceSheetRow, FmpCashFlowRow, FmpIncomeStatementRow, FmpRawRow } from "@/providers/fmp";
import { parseSicCode } from "@/edgar/sic";
import { successorContinuity } from "@/edgar/successor";
import { type CompanyRouteResult } from "@/pipeline/stageB/sectorRouting";
import { computeNareitFfo } from "@/pipeline/stageB/financialMetrics";
import { rejectedAnnualCadenceRows, windowCagr, type GrowthResult, withoutTransitionPeriods } from "@/pipeline/stageB/growth";
import { computeRote, incomeAvailableToCommon, type WaccResult, type RoicResult, type RoteResult, type DupontResult, type WaccDisclosure, type WaccHistoryResult } from "@/pipeline/stageB/returns";
import { type CapitalResult } from "@/pipeline/stageB/capital";
import { valueCompany, type ValuationResult, type ValuationBundleInputs, type DcfAssumptionInputs, type DcfIncomeRow, type DcfQuarterRevenue, type DcfGuidance, type DcfBalanceRow, type AnalystEstimateRow, type FiscalYearToDate, type RevenueSeasonality, type MultiplesFrameworkInputs, type MultiplesQuoteInputs, type MultiplesIncomeTtm, type MultiplesCashFlowTtm, type MultiplesBalance, type QuarterlyFundamentalsRow, type EnterpriseValuesRow, type ExcessReturnInputs, type ReitInputs, noncontrollingEarningsInput, LONG_TERM_INVESTMENTS_REMOVED_CLAUSE } from "@/pipeline/stageB/valuation";
import { resolveNetDebt, type NetDebtResolution } from "@/pipeline/stageB/netDebt";
import { awardDilutedDivisor, convertibleFiledNear, conversionSharesFiled, employeeTrustSharesFiled, type DivisorResult, type DivisorRow } from "@/pipeline/stageB/dilutedDivisor";
import { temporaryEquityClaims, temporaryEquityOperands, temporaryEquityUnknownAt } from "@/pipeline/stageB/seniorClaims";
import { predecessorFactsFor, successorObligationsAt } from "@/pipeline/stageB/debtLikeObligations";
import { instantFact, nonMarketableEquityCarrying, validDay } from "@/pipeline/stageB/marketableEquity";
import { millions } from "@/pipeline/stageB/netDebt";
import { retainedCommonClassAmbiguity, retainedCombinedClassEpsBasis } from "@/pipeline/stageB/commonClassScope";
import { incompleteLeaseCoverage, leaseEvidenceContextFor, type LeaseEvidenceContext } from "@/pipeline/stageB/leaseScope";
import { preferredCapitalRefusal, commonIncomeFlowRefusal } from "@/pipeline/stageB/securityBasis";
import { issuerEconomicDilutedShares, resolveEconomicEquityScope } from "@/pipeline/stageB/securityBasis";
import { CORE_FACT_FORMS, tagPoints, type CompanyFacts } from "@/edgar/xbrl";
import { effectiveTaxOperands } from "@/edgar/incomeClassification";
import { buildStatementsFromCompanyFacts, lowerBoundDAndACaveat } from "@/edgar/statements";
import { admittedIssuerFacts, confirmedIssuerFacts } from "@/edgar/issuerFacts";
import { businessCombinationYears, type TtmCommonReturn } from "@/pipeline/stageB/excessReturnStart";
import { quarterlyOpeningBook } from "@/pipeline/stageB/excessReturnBook";
import { type OperatingDispositionRead, unusualOperatingItemsByFiscalYear, withoutRecurringFamilies, recurringOperatingItemsBasis, unusualOperatingItemsTtm } from "@/pipeline/stageB/unusualItems";
import { normalizeQuarterRows, quarterWindowViolation, type FiscalDatedRow } from "@/pipeline/stageB/quarterWindows";
import { fiscalYearRule } from "@/pipeline/stageB/fiscalCalendar";
import { withoutGapCause } from "@/pipeline/stageA/manifest";
import { type TtmCashFlow, type TtmIncome, incomePeriod } from "./ttmSynthesis";
import { type CurrencyEvidenceRow, establishedCurrencyOn, rowsInModelCurrency } from "./statementCurrency";
import { SPREAD_DAYS, isoDay, matchByDate, num, rowsOf, str } from "./bundleRows";
import { commonFlowScope, commonIncomeEvidence, filedTaxOperands, fiscalIdentity, preferredClaimsInFlow, statementEquityOwnershipBasis, statementParentEquity, temporaryEquityFields, toReturnsBalance, toReturnsIncome } from "./stageBAdapters";
import { dcfBridgeRow, newestBalanceRow, noncontrollingOwnershipUnresolvedAt, pickBalanceAnchor } from "./balanceAnchor";
import { riskFreePct } from "./returnsBlock";

// ---------------------------------------------------------------------------
// Valuation block — assemble the discriminated ValuationBundleInputs
// ---------------------------------------------------------------------------

interface ValuationCtx {
  foreignBasis: ForeignValuationBasis | null;
  route: CompanyRouteResult;
  revenueEligibilityReason: string | null;
  /** Previously suppressed solely by negative FIN-OTHER operating cash flow. */
  finOtherOcfExemption: boolean;
  incomeAnnual: FmpIncomeStatementRow[];
  incomeAnnualUndatedPeriods: FiscalDatedRow[];
  balanceAnnual: FmpBalanceSheetRow[];
  cashflowAnnual: FmpCashFlowRow[];
  incomeQuarterly: FmpIncomeStatementRow[];
  balanceQuarterly: FmpBalanceSheetRow[];
  cashflowQuarterly: FmpCashFlowRow[];
  ttmInc: TtmIncome | null;
  ttmCf: TtmCashFlow | null;
  /** StatementCurrencies.model: the currency the valuation's statements are in. */
  modelCurrency: string | null;
  /** Normalized statements retain each quarter's own filing-linked currency evidence. */
  currencyEvidence: readonly CurrencyEvidenceRow[];
  growth: GrowthResult;
  /** D-19: FCF/SBC treatment for the DCF assumption block. */
  capital: CapitalResult;
  wacc: WaccResult;
  // D-19: the named WACC inputs and the per-fiscal-year WACC series.
  waccInputs: WaccDisclosure;
  waccHistory: WaccHistoryResult;
  /** Annual ROIC series — evidence for the DCF terminal excess-return rule. */
  roic: RoicResult;
  /** Latest fiscal-year DuPont decomposition — the excess-return ROE fallback. */
  dupont: DupontResult;
  /** D-17: return on tangible common equity — the return P/TBV is read against. */
  rote: RoteResult;
  /** D-102: the trailing-four-quarter common return (financial routes). */
  commonReturnTtm: TtmCommonReturn | null;
  operatingDispositions: OperatingDispositionRead;
  /** METIS_EV_INCLUDE_LEASES, read once in runStageB and shared with the returns block. */
  evIncludeLeases: boolean;
  profile: FmpRawRow | null;
  quote: FmpRawRow | null;
}


/**
 * D-58 / WP3: the 8-K earnings release's next-quarter revenue outlook as the
 * DCF's guidance anchor. Withheld unless the outlook is in the model currency
 * and its quarter end could be established; the valuation then falls back to
 * consensus or the run-rate.
 */
export function dcfGuidance(bundle: DataBundle, modelCurrency: string | null): DcfGuidance | null {
  const outlook = nextPeriodRevenueGuidance(bundle);
  if (outlook === null || outlook.periodEnd === null || modelCurrency === null || outlook.currency !== modelCurrency) return null;
  return {
    revenue: outlook.mid,
    periodEnd: outlook.periodEnd,
    ...(outlook.basePeriodEnd === null ? {} : { periodStart: new Date(Date.parse(outlook.basePeriodEnd) + SPREAD_DAYS).toISOString().slice(0, 10) }),
    periodEndBasis: outlook.periodEndBasis,
    asOf: outlook.filingDate,
    source: `sec:8-K EX-99.1 ${outlook.accession}`,
    qualifiers: outlook.qualifiers,
    operatingMarginPct: outlook.impliedOperatingMarginPct,
    revenueLow: outlook.low,
    ...(outlook.annualRevenueComparison === undefined ? {} : { revenueHigh: outlook.high, currency: outlook.currency, fiscalYear: outlook.fiscalYear,
      annualRevenueComparison: { ...outlook.annualRevenueComparison,
      source: `sec:8-K EX-99.1 ${outlook.accession}`, asOf: outlook.filingDate } }),
    taxRatePct: outlook.taxRatePct ?? null,
    taxRatePeriod: outlook.taxRatePeriod ?? null,
    grossMarginLowPct: outlook.grossMarginLowPct ?? null,
  };
}

/**
 * The `MultiplesBalance` view of one balance row: the market EV reads the
 * newest row, and (D-135) the DCF equity bridge reads the row dated at the
 * statement date. One mapping, so the two cannot drift.
 */
function toMultiplesBalance(row: FmpBalanceSheetRow, basis: "quarter" | "annual" | null | undefined, leaseEvidenceContext: LeaseEvidenceContext): MultiplesBalance {
  return {
    reportedCurrency: row.reportedCurrency,
    leaseEvidenceContext,
    date: String(row.date ?? ""),
    basis: basis ?? undefined,
    totalDebt: num(row.totalDebt),
    cashAndCashEquivalents: num(row.cashAndCashEquivalents),
    shortTermInvestments: num(row.shortTermInvestments),
    cashAndShortTermInvestments: num(row.cashAndShortTermInvestments),
    // D-65: the multiples' EV nets the same canonical (D-60) net cash as the DCF bridge.
    marketableEquitySecurities: num(row.marketableEquitySecurities),
    totalStockholdersEquity: statementParentEquity(row),
    totalEquity: num(row.totalEquity),
    goodwill: num(row.goodwill),
    intangibleAssets: num(row.intangibleAssets),
    tangibleBookDeductionBasis: str(row.tangibleBookDeductionBasis) ?? undefined,
    minorityInterest: num(row.minorityInterest),
    preferredStock: num(row.preferredStock),
    preferredCapitalWithheldReason: row.preferredCapitalWithheldReason,
    preferredCapitalBasis: row.preferredCapitalBasis,
    // D-135: redeemable preferred and redeemable NCI (temporary equity), read through `temporaryEquityClaims`.
    ...temporaryEquityOperands(row),
    equityOwnershipBasis: statementEquityOwnershipBasis(row),
    // D-19: lease liabilities for the EV bridge. The TOTAL is
    // disclosure context; only the OPERATING slice is netted out of EV,
    // and the EDGAR route is the only one that
    // resolves the split — on the FMP route it is absent and EV is
    // reported as-is with the leases gap raised.
    capitalLeaseObligations: num(row.capitalLeaseObligations),
    operatingLeaseLiability: num(row.operatingLeaseLiability),
    financeLeaseLiability: num(row.financeLeaseLiability),
    fieldProvenance: row.fieldProvenance,
    ...(row.fieldConflicts !== undefined ? { fieldConflicts: row.fieldConflicts } : {}),
    shortTermDebt: num(row.shortTermDebt), longTermDebt: num(row.longTermDebt),
  };
}

/**
 * D-135: the per-share divisor of the newest quarterly and the newest annual
 * income row, each through `awardDilutedDivisor` (a loss period keeps the award
 * dilution its filed count dropped). The four latest quarters and the latest
 * year are the donor pool, so the DCF, the excess-return route, the REIT block
 * and the scenario paths read one divisor. A literal 0 is FMP's
 * zero-for-undisclosed sentinel, not a count (missing is not zero).
 */
export function incomeDivisors(
  incomeQuarterly: readonly FmpIncomeStatementRow[],
  inc0: FmpIncomeStatementRow | undefined,
  facts: CompanyFacts | null,
): { quarter: DivisorResult; annual: DivisorResult } {
  // FMP's 0 is its zero-for-undisclosed sentinel, never a filed count: a non-positive count is missing.
  const pos = (v: unknown): number | null => { const n = num(v); return n !== null && n > 0 ? n : null; };
  const divisorRow = (r: FmpIncomeStatementRow, period: "quarter" | "fiscal year"): DivisorRow => {
    const date = typeof r.date === "string" ? r.date : "";
    // The filed if-converted increment for this exact period is not award dilution (D-135; the bridge deducts the instrument).
    const conversionShares = date === "" ? null : conversionSharesFiled(facts, date, period);
    return {
      date, period, basic: pos(r.weightedAverageShsOut), diluted: pos(r.weightedAverageShsOutDil),
      netIncome: num(r.netIncome), continuingIncome: num(r.netIncomeFromContinuingOperations),
      ...(conversionShares === null ? {} : { conversionShares }),
    };
  };
  const rows = [...incomeQuarterly.slice(0, 4).map((r) => ({ r, period: "quarter" as const })), ...(inc0 === undefined ? [] : [{ r: inc0, period: "fiscal year" as const }])];
  const anchor = typeof incomeQuarterly[0]?.date === "string" ? incomeQuarterly[0].date : typeof inc0?.date === "string" ? inc0.date : "";
  const options = { convertiblesFiled: convertibleFiledNear(facts, anchor) };
  const one = (row: FmpIncomeStatementRow | undefined, period: "quarter" | "fiscal year"): DivisorResult => {
    if (row === undefined) return { shares: null, basis: "filed", donorDate: null, donorPeriod: null, note: null };
    return awardDilutedDivisor(divisorRow(row, period), rows.filter((x) => x.r !== row).map((x) => divisorRow(x.r, x.period)), options);
  };
  return { quarter: one(incomeQuarterly[0], "quarter"), annual: one(inc0, "fiscal year") };
}

/** The valuation input that discloses a non-filed divisor (D-135); callers pass only a result whose basis is not "filed". */
function divisorDisclosure(d: DivisorResult): NonNullable<ValuationBundleInputs["dilutedShareDivisor"]> {
  const note = d.note ?? "";
  if (d.basis === "loss-period-substituted") return { basis: d.basis, donorDate: d.donorDate ?? "", donorPeriod: d.donorPeriod ?? "quarter", note,
    ...(typeof d.filedShares === "number" ? { filedShares: d.filedShares } : {}) };
  return { basis: d.basis === "loss-period-withheld" ? "loss-period-withheld" : "loss-period-basic", note };
}

/** D-147: only a complete measured window permits an income subtraction. */
function equityMethodWindow(rows: readonly FmpIncomeStatementRow[]): { placement: "in-operating-income" | "below-operating-income" | "undetermined" | null; income: number | null } {
  const placements = rows.map(row => row.equityMethodIncomePlacement);
  // D-147: no filed placement is distinct from ambiguous evidence.
  if (placements.every(p => p === undefined)) return { placement: null, income: null };
  if (placements.some(p => p?.placement === "in-operating-income" && p.income === null)) return { placement: "in-operating-income", income: null };
  if (placements.length > 0 && placements.every(p => p !== undefined && (p.placement === "in-operating-income" || p.placement === "immaterial") && p.income !== null)
    && placements.some(p => p?.placement === "in-operating-income")) {
    return { placement: "in-operating-income", income: placements.reduce((sum, p) => sum + p!.income!, 0) };
  }
  return { placement: placements.length > 0 && placements.every(p => p?.placement === "below-operating-income" || p?.placement === "immaterial")
    && placements.some(p => p?.placement === "below-operating-income") ? "below-operating-income" : "undetermined", income: null };
}

export function computeValuation(bundle: DataBundle, ctx: ValuationCtx): ValuationResult {
  const { route, incomeAnnual, balanceAnnual, balanceQuarterly, incomeQuarterly, ttmInc, ttmCf, growth, wacc, roic, profile, quote, evIncludeLeases } = ctx;
  const operatingTtm = operatingMarginBasis(ttmInc);
  const dcfUsesTtm = ttmInc !== null && operatingTtm.revenue !== null && operatingTtm.operatingIncome !== null;
  // D-18/D-19: the growth-anchor regression method and the WACC
  // disclosure travel into the DCF assumption block with the rest.
  const waccByYear = new Map(ctx.waccHistory.points.map((point) => [point.date, point]));

  const bal0 = balanceAnnual[0];
  const inc0 = withoutTransitionPeriods(normalizeQuarterRows(incomeAnnual).rows).rows[0];
  const rowDate = (r: { date?: unknown } | null | undefined): string =>
    typeof r?.date === "string" ? r.date : "";
  // Point-in-time balance anchor (P1, P2): whole-row preference
  // for the NEWER of the latest quarterly vs latest annual balance row — a
  // lagging quarterly feed must not beat a fresher annual row, and fields are
  // never mixed across periods. Same pattern runway already uses.
  const balQ = balanceQuarterly[0] ?? null;
  const balanceAnchor = pickBalanceAnchor(balQ, bal0);
  const balPoint = balanceAnchor.row;
  const balPointBasis = balanceAnchor.basis;
  const ratiosTtm = rowsOf(bundle.ratiosTtm)[0] ?? rowsOf(bundle.ratios)[0];

  const currentPrice = num(quote?.price);
  const marketCap = num(quote?.marketCap ?? profile?.marketCap);
  // P3: per-share values against a current price use the
  // weighted-average diluted share count from the NEWER of the latest quarterly
  // vs annual income statement (domain-valuation.md §"per-share"); annual can be
  // up to ~18 months stale on buybacks/dilution, but a lagging quarterly feed
  // must not beat a fresher annual row. A literal 0 is FMP's
  // zero-for-undisclosed sentinel, not a real count (missing ≠ zero).
  const posShares = (v: number | null): number | null => (v !== null && v > 0 ? v : null);
  const financialRoute = route.base === "bank" || route.base === "insurer" || route.base === "reit-mortgage";
  // Financial opening book and its diluted count share one instant, including an ordinary feed lag.
  const shareIncomeQuarterly = financialRoute && balQ
    ? incomeQuarterly.filter(row => rowDate(row) <= rowDate(balQ)) : incomeQuarterly;
  // D-135: a loss period's count is its basic count; `incomeDivisors` restores the award dilution.
  const divisors = incomeDivisors(shareIncomeQuarterly, inc0, confirmedIssuerFacts(bundle.symbol, bundle.edgar));
  const sharesQuarterly = divisors.quarter.shares;
  const sharesAnnual = divisors.annual.shares;
  const quarterlySharesFresh = rowDate(shareIncomeQuarterly[0]) >= rowDate(inc0);
  const dilutedShares = quarterlySharesFresh ? (sharesQuarterly ?? sharesAnnual) : (sharesAnnual ?? sharesQuarterly);
  const dilutedSharesBasis: "quarter" | "annual" | null =
    dilutedShares === null
      ? null
      : (quarterlySharesFresh && sharesQuarterly !== null) || sharesAnnual === null
        ? "quarter"
        : "annual";
  const dilutedShareDivisor = dilutedSharesBasis === "quarter" ? divisors.quarter : dilutedSharesBasis === "annual" ? divisors.annual : null;
  const employeeTrustShares = employeeTrustSharesFiled(confirmedIssuerFacts(bundle.symbol, bundle.edgar), bundle.builtAt.slice(0, 10));

  const netDebtInfo = netDebtFromBalance(balPoint);

  // --- DCF inputs (general route) -------------------------------------------
  // The analyst-consensus growth case divides FY1 estimated revenue by the
  // statements' revenue, and FY2 by FY1: estimates enter only when their
  // currency is the model's — the row's own, else the issuer currency they
  // inherit when the statements and the listing agree (D-57). Otherwise the
  // case is unavailable and the anchor uses the rest.
  const issuerCurrency = inheritedIssuerCurrency({
    reporting: ctx.modelCurrency,
    listing: str(profile?.currency),
    isAdr: route.overlays.includes("adr") || profile?.isAdr === true,
  });
  const estimateRows = rowsOf(bundle.analystEstimates);
  const revenueCalibration = calibratedRevenueCurrency(bundle, issuerCurrency, ctx.foreignBasis);
  const estimateResolved = estimateRows.map((r) => {
    const resolved = providerRowCurrency(r, issuerCurrency);
    return resolved.code === null && revenueCalibration.code !== null ? { code: revenueCalibration.code, inherited: false } : resolved;
  });
  const estimateCodes = [...new Set(estimateResolved.map((r) => r.code))];
  const estimatesInModelCurrency =
    ctx.modelCurrency !== null && estimateCodes.length === 1 && estimateCodes[0] === ctx.modelCurrency;
  const estimateGaps: ManifestEntry[] = [];
  if (estimateRows.length > 0 && !estimatesInModelCurrency) {
    estimateGaps.push({
      field: "valuation.analystEstimates.currency",
      reason:
        (estimateCodes.includes(null)
          ? `analyst estimates carry no currency of their own and the issuer currency is ${issuerCurrency.basis}`
          : `analyst estimates are in ${estimateCodes.join("/")}`) +
        `; ${revenueCalibration.basis}` + (ctx.foreignBasis
          ? `; their currency/share basis is not established against the reporting-currency inputs (${ctx.modelCurrency}), so the analyst-consensus growth case is not used. The admitted statement FX rate does not establish these analyst rows' units.`
          : ` while the model runs in ${ctx.modelCurrency ?? "an unestablished currency"}, so the analyst-consensus growth case is not used (no FX conversion is attempted)`),
      severity: "info",
      attemptedSources: ["fmp:/stable/analyst-estimates"],
    });
  } else if (revenueCalibration.code !== null && estimateRows.some(r => providerRowCurrency(r, issuerCurrency).code === null)) {
    estimateGaps.push({ field: "valuation.analystEstimates.currency", severity: "info", reason: revenueCalibration.basis,
      attemptedSources: ["fmp:/stable/analyst-estimates", "edgar:companyfacts"] });
  } else if (estimateResolved.some((r) => r.inherited)) {
    estimateGaps.push({
      field: "valuation.analystEstimates.currency",
      reason: `analyst estimate currency ${issuerCurrency.basis}; the analyst-consensus growth case uses them in ${ctx.modelCurrency}`,
      severity: "info",
      attemptedSources: ["fmp:/stable/analyst-estimates"],
    });
  }
  const analystEstimates: AnalystEstimateRow[] | null = bundle.analystEstimates.ok && estimatesInModelCurrency
    ? forwardAnnualEstimates(estimateRows, withoutTransitionPeriods(normalizeQuarterRows(incomeAnnual).rows).rows.flatMap(row => isoDay(row.date) ? [isoDay(row.date)!] : []))
        // D-65: the analyst count and range are the breadth and agreement evidence beyond year two.
        .map((r) => ({ date: String(r.date ?? ""), revenueAvg: num(r.revenueAvg), analysts: num(r.numAnalystsRevenue),
          revenueLow: num(r.revenueLow), revenueHigh: num(r.revenueHigh) }))
        .filter((r) => r.date.length > 0)
    : null;

  const equityWindowRows = dcfUsesTtm && ttmInc ? normalizeQuarterRows(incomeQuarterly).rows.filter(row => String(row.date) <= ttmInc.date).slice(0, 4) : inc0 ? [inc0] : [];
  const equityWindow = equityMethodWindow(equityWindowRows);

  // D-135: the DCF equity bridge reads the balance dated at the DCF statement
  // date (D-65), not the newest row the market EV uses.
  const bridge = dcfBridgeRow(isoDay(dcfUsesTtm ? ttmInc?.date : inc0?.date), dcfUsesTtm ? "ttm" : inc0 ? "annual" : null, balanceQuarterly, balanceAnnual, { row: balPoint ?? null, basis: balPointBasis ?? null }, evIncludeLeases);
  const bridgePoint = bridge.row;
  const bridgePointBasis = bridge.basis;
  const bridgeNetDebtInfo = netDebtFromBalance(bridgePoint);
  const equityMethodFacts = confirmedIssuerFacts(bundle.symbol, bundle.edgar);
  const equityMethodStakeAt = (row: FmpBalanceSheetRow): number => {
    const lti = num(row.longTermInvestments);
    const date = isoDay(row.date);
    if (lti === null || lti <= 0 || date === null) return 0;
    const tags = row.fieldProvenance?.longTermInvestments?.tags ?? [];
    if (tags.length > 0 && tags.every(tag => tag === "us-gaap/EquityMethodInvestments")) return lti;
    const stake = equityMethodFacts === null || ctx.modelCurrency === null ? null : instantFact(equityMethodFacts, "EquityMethodInvestments", ctx.modelCurrency, date, bundle.builtAt.slice(0, 10));
    return stake === null ? 0 : Math.min(lti, Math.max(0, stake.val));
  };
  const equityMethodStakeValue = bridgePoint === null ? 0 : equityMethodStakeAt(bridgePoint);
  // D-147: a recent breakout can establish placement inside
  // the added-back LTI, but cannot supply a bridge-date stake amount.
  const priorStakePlacement = (() => {
    const date = isoDay(bridgePoint?.date), lti = num(bridgePoint?.longTermInvestments);
    if (equityMethodFacts === null || ctx.modelCurrency === null || date === null || lti === null || lti <= 0) return null;
    const stakes = tagPoints(equityMethodFacts, "EquityMethodInvestments", ctx.modelCurrency);
    const investments = tagPoints(equityMethodFacts, "LongTermInvestments", ctx.modelCurrency);
    if (stakes?.unit !== ctx.modelCurrency || investments?.unit !== ctx.modelCurrency) return null;
    const observedDay = bundle.builtAt.slice(0, 10);
    const stake = stakes.points.filter(p => p.start === undefined && validDay(p.end) && p.end < date &&
      CORE_FACT_FORMS.has(p.form) && validDay(p.filed) && p.filed <= observedDay && Number.isFinite(p.val) && p.val >= 0)
      .sort((a, b) => b.filed.localeCompare(a.filed) || b.accn.localeCompare(a.accn) || b.end.localeCompare(a.end))[0];
    if (stake === undefined || stake.val <= 0 || lti < stake.val) return null;
    const cutoff = new Date(`${date}T00:00:00Z`);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
    // Clamp February 29 to February 28 when the preceding year is not a leap year.
    if (cutoff.getUTCMonth() !== Number(date.slice(5, 7)) - 1) cutoff.setUTCDate(0);
    if (stake.end < cutoff.toISOString().slice(0, 10)) return null;
    const priorLti = investments.points.find(p => p.start === undefined && p.end === stake.end &&
      p.accn === stake.accn && p.filed === stake.filed && p.form === stake.form && Number.isFinite(p.val) && p.val >= stake.val);
    return priorLti === undefined ? null : `${stake.form} ${stake.accn} filed ${stake.filed}, balance ${stake.end}, places the equity-method stake inside long-term investments; the bridge uses only its filed ${date} LTI amount, with no prior stake amount carried forward`;
  })();
  const incomeExcludedFromEbit = equityWindow.placement === "in-operating-income" && equityWindow.income !== null &&
    (equityMethodStakeValue > 0 || priorStakePlacement !== null);
  const equityMethodStake: DcfAssumptionInputs["equityMethodStake"] = bridgePoint === null ? null : {
    value: equityMethodStakeValue, treatment: equityMethodStakeValue > 0 && equityWindow.placement === "in-operating-income" && equityWindow.income === null ? "operating" : "added-back",
    incomePlacement: equityWindow.placement,
    incomeExcludedFromEbit,
    basis: equityWindow.placement === "in-operating-income" && equityMethodStakeValue <= 0 && !incomeExcludedFromEbit
      ? "equity-method income stays in EBIT because its stake could not be located in long-term investments; the existing investment add-back is retained without establishing a separate stake amount"
      : equityWindow.placement === "in-operating-income" && equityWindow.income !== null
      ? `equity-method income ${millions(equityWindow.income)} inside operating income is taken out of the EBIT seed and measured history before the stake is added back${equityMethodStakeValue <= 0 && priorStakePlacement !== null ? `; placement evidence: ${priorStakePlacement}` : ""}`
      : equityWindow.placement === "in-operating-income"
        ? "equity-method income is inside operating income but unmeasured; its stake stays in operating capital and is not added back"
        : equityWindow.placement === "below-operating-income" ? "equity-method income is below operating income; its stake is added back once"
          : equityWindow.placement === null ? "no equity-method income placement is filed; the existing investment treatment is retained"
          : "equity-method income is assumed below operating income under Regulation S-X Rule 5-03; placement is undetermined and the existing stake treatment is retained",
  };

  // D-147: the window's treatment also governs its quarters
  // and all history years. Restore only income already removed from EBIT.
  const adjustEbit = (value: number | null, rows: readonly FmpIncomeStatementRow[]): number | null => {
    // Placement needs evidence that added-back LTI holds the measured-income stake;
    // the operating capital split still requires a same-date stake amount (D-147).
    if (value === null || (equityMethodStakeValue <= 0 && !incomeExcludedFromEbit)) return value;
    if (equityMethodStake?.treatment === "operating") return value + rows.reduce((sum, row) => {
      const p = row.equityMethodIncomePlacement;
      return sum + (p?.placement === "below-operating-income" && p.income !== null ? p.income : 0);
    }, 0);
    const reading = equityMethodWindow(rows);
    return reading.placement === "in-operating-income" && reading.income !== null ? value - reading.income : value;
  };
  const annualOperating = operatingMarginBasis(inc0);
  const dcfIncomeTtm: DcfIncomeRow | null = dcfUsesTtm && ttmInc
    ? {
        date: ttmInc.date,
        days: ttmInc.days,
        basis: "ttm",
        revenue: operatingTtm.revenue,
        operatingIncome: adjustEbit(operatingTtm.operatingIncome, equityWindowRows),
        operatingBasis: operatingTtm.basis,
        grossProfitBasis: [...new Set(equityWindowRows.map(r=>r.fieldConflicts?.grossProfit?.usable===false ? r.fieldConflicts.grossProfit.reason : null).filter(Boolean))].join(" ") || undefined,
        operatingPerimeterRefusal: equityWindowRows.find(r=>r.operatingPerimeterRefusal)?.operatingPerimeterRefusal,
        grossProfit: ttmInc.grossProfit ?? null,
        // D-237 (P13): the DCF reads this field only as the tax rate's denominator.
        taxEvidenceBasis: equityWindowRows.every(filedTaxOperands) ? undefined : "Tax rate operands: vendor data, not checked against a filing",
        incomeBeforeTax: ttmInc.taxRatePretaxIncome,
        incomeTaxExpense: ttmInc.taxRateIncomeTaxExpense ?? ttmInc.incomeTaxExpense,
      }
    : inc0
      ? {
          date: String(inc0.date ?? ""),
          days: incomePeriod(inc0, normalizeQuarterRows(incomeAnnual).rows.find((row) => String(row.date) < String(inc0.date)), "annual").days,
          basis: "annual",
          revenue: annualOperating.revenue,
          operatingIncome: adjustEbit(annualOperating.operatingIncome, equityWindowRows),
          operatingBasis: annualOperating.basis,
          grossProfitBasis: inc0.fieldConflicts?.grossProfit?.usable===false ? inc0.fieldConflicts.grossProfit.reason : undefined,
          operatingPerimeterRefusal: inc0.operatingPerimeterRefusal,
          grossProfit: num(inc0.grossProfit),
          taxEvidenceBasis: filedTaxOperands(inc0) ? undefined : "Tax rate operands: vendor data, not checked against a filing",
          incomeBeforeTax: effectiveTaxOperands(inc0).pretax,
          incomeTaxExpense: effectiveTaxOperands(inc0).tax,
        }
      : null;

  // Same deduped rows the projection history uses: the DCF's near-term growth
  // path is fitted to this series, so a restated fiscal year appearing twice
  // biases the base case exactly as it biased the dispersion.
  const guardedAnnualUnusual = withoutRecurringFamilies(unusualOperatingItemsByFiscalYear(confirmedIssuerFacts(bundle.symbol, bundle.edgar), {
    fiscalYearEnds: incomeAnnual.map(r => isoDay(r.date) ?? ""), unit: ctx.modelCurrency, observedAt: bundle.builtAt,
  }), withoutTransitionPeriods(normalizeQuarterRows(incomeAnnual).rows).rows.map(r => isoDay(r.date) ?? ""));
  const dcfAnnualNorm = normalizeQuarterRows(incomeAnnual);
  const dcfRegular = withoutTransitionPeriods(dcfAnnualNorm.rows);
  const dcfCadenceBarriers = [...ctx.incomeAnnualUndatedPeriods,...rejectedAnnualCadenceRows(incomeAnnual,
    [...dcfAnnualNorm.rejected,...dcfRegular.withheld.map(row=>({period:row.date}))])];
  const dcfIncomeHistory: DcfIncomeRow[] = dcfRegular.rows.map((r) => ({
    ...fiscalIdentity(r),
    date: String(r.date ?? ""),
    revenue: num(r.revenue),
    operatingIncome: adjustEbit(num(r.operatingIncome), [r]),
    operatingBasis: r.operatingIncomeBasis,
    grossProfitBasis: r.fieldConflicts?.grossProfit?.usable===false ? r.fieldConflicts.grossProfit.reason : undefined,
    unusualOperatingItems: guardedAnnualUnusual.byYear.get(rowDate(r))?.value ?? null,
    grossProfit: num(r.grossProfit),
    incomeBeforeTax: effectiveTaxOperands(r).pretax,
    incomeTaxExpense: effectiveTaxOperands(r).tax,
  }));

  const toDcfBalance = (row: FmpBalanceSheetRow, basis: DcfBalanceRow["basis"]): DcfBalanceRow => ({
    leaseCoverageNote: incompleteLeaseCoverage(row)?.note,
    fieldProvenance: row.fieldProvenance,
    operatingLeaseLiability: num(row.operatingLeaseLiability), financeLeaseLiability: num(row.financeLeaseLiability), capitalLeaseObligations: num(row.capitalLeaseObligations),
    shortTermDebt: num(row.shortTermDebt), longTermDebt: num(row.longTermDebt),
    date: String(row.date ?? ""),
    basis,
    totalDebt: num(row.totalDebt),
    totalStockholdersEquity: statementParentEquity(row),
    totalEquity: num(row.totalEquity),
    minorityInterest: num(row.minorityInterest),
    // D-135: temporary equity (and any refusal of it, in `fieldConflicts`) is financing capital in sales-to-capital.
    ...temporaryEquityFields(row),
    // The preferred line as filed: `temporaryEquityClaims` reads it to see one mezzanine series filed twice (D-135).
    preferredStock: num(row.preferredStock),
    ...(row.fieldConflicts !== undefined ? { fieldConflicts: row.fieldConflicts } : {}),
    cashBasis: row.cashBasis,
    cashConflictReconciled: row.cashConflictReconciled,
    cashAndCashEquivalents: num(row.cashAndCashEquivalents), shortTermInvestments: num(row.shortTermInvestments),
    cashAndShortTermInvestments: num(row.cashAndShortTermInvestments),
    longTermInvestments: num(row.longTermInvestments),
  });
  const dcfBalance: DcfBalanceRow | null = bridgePoint && bridgePointBasis ? toDcfBalance(bridgePoint, bridgePointBasis) : null;
  // D-104: the annual rows behind the issuer's own sales-to-capital.
  const dcfCapitalHistory: DcfBalanceRow[] = balanceAnnual.map((row) => {
    const result = toDcfBalance(row, "annual");
    if (equityMethodStake?.treatment === "operating" && result.longTermInvestments != null) result.longTermInvestments -= equityMethodStakeAt(row);
    return result;
  });

  // D-58: the run-rate quarters — the TTM window's newest quarter and the same
  // fiscal quarter a year earlier, the latter only when its own currency
  // evidence establishes the model currency.
  const basePeriodEnd = dcfIncomeTtm?.date ?? null;
  const latestQuarter = incomeQuarterly.find((r) => isoDay(r.date) === basePeriodEnd);
  const yearAgoQuarter = latestQuarter === undefined ? undefined : incomeQuarterly.find((r) => {
    const days = (Date.parse(String(latestQuarter.date)) - Date.parse(String(r.date))) / SPREAD_DAYS;
    return days >= 350 && days <= 380;
  });
  const yearAgoDate = yearAgoQuarter === undefined ? null : isoDay(yearAgoQuarter.date);
  // D-98 (guided year-over-year pace): the same fiscal quarter a year before the guided
  // quarter, so the guidance carries at its year-over-year pace, under the
  // same currency rule.
  const guidance = dcfGuidance(bundle, ctx.modelCurrency);
  const guidedYearAgoQuarter = guidance === null ? undefined : incomeQuarterly.find((r) => {
    const days = (Date.parse(guidance.periodEnd) - Date.parse(String(r.date))) / SPREAD_DAYS;
    return days >= 350 && days <= 380;
  });
  const guidedYearAgoDate = guidedYearAgoQuarter === undefined ? null : isoDay(guidedYearAgoQuarter.date);
  const guidedYearAgoWindow: NonNullable<DcfQuarterRevenue["guidedYearAgoWindow"]> = [];
  if (guidedYearAgoQuarter !== undefined) {
    for (const row of incomeQuarterly.slice(incomeQuarterly.indexOf(guidedYearAgoQuarter), incomeQuarterly.indexOf(guidedYearAgoQuarter) + 16)) {
      const date = isoDay(row.date), revenue = num(row.revenue);
      if (date === null || revenue === null || revenue <= 0 || establishedCurrencyOn([row], date, ctx.currencyEvidence) !== ctx.modelCurrency) break;
      const candidate = { date, revenue, days: incomePeriod(row, incomeQuarterly[incomeQuarterly.indexOf(row) + 1]).days };
      const window = [...guidedYearAgoWindow, candidate];
      if (window.length >= 4 && quarterWindowViolation(window.slice(-4)) !== null) break;
      guidedYearAgoWindow.push(candidate);
    }
  }
  const dcfQuarterRevenue: DcfQuarterRevenue | null = basePeriodEnd !== null
    ? {
        latest: latestQuarter === undefined ? { date: basePeriodEnd, revenue: null } :
          { date: basePeriodEnd, revenue: num(latestQuarter.revenue), days: incomePeriod(latestQuarter, incomeQuarterly[incomeQuarterly.indexOf(latestQuarter) + 1]).days },
        yearAgo: yearAgoQuarter !== undefined && yearAgoDate !== null &&
          establishedCurrencyOn([yearAgoQuarter], yearAgoDate, ctx.currencyEvidence) === ctx.modelCurrency
          ? { date: yearAgoDate, revenue: num(yearAgoQuarter.revenue), days: incomePeriod(yearAgoQuarter, incomeQuarterly[incomeQuarterly.indexOf(yearAgoQuarter) + 1]).days }
          : null,
        ...(guidedYearAgoQuarter !== undefined && guidedYearAgoDate !== null &&
          establishedCurrencyOn([guidedYearAgoQuarter], guidedYearAgoDate, ctx.currencyEvidence) === ctx.modelCurrency
          ? { guidedYearAgo: { date: guidedYearAgoDate, revenue: num(guidedYearAgoQuarter.revenue), days: incomePeriod(guidedYearAgoQuarter, incomeQuarterly[incomeQuarterly.indexOf(guidedYearAgoQuarter) + 1]).days } }
          : {}),
        guidedYearAgoWindow,
      }
    : null;

  // D-65: revenue already reported in the fiscal year the first DCF window
  // starts in — the quarters after the latest annual statement through the TTM
  // end, each in the model currency. Consecutive 13/14-week quarters only.
  const fiscalYearToDate: FiscalYearToDate | null = (() => {
    const priorFiscalYearEnd = isoDay(inc0?.date);
    if (!dcfUsesTtm || !ttmInc || priorFiscalYearEnd === null || priorFiscalYearEnd >= ttmInc.date) return null;
    const quarters = incomeQuarterly
      .filter((r) => { const d = isoDay(r.date); return d !== null && d > priorFiscalYearEnd && d <= ttmInc.date; })
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    // A repeated quarter end (a restatement served twice) would double count; refuse rather than pick one.
    if (quarters.length < 1 || quarters.length > 3 || isoDay(quarters.at(-1)?.date) !== ttmInc.date
      || new Set(quarters.map((q) => isoDay(q.date))).size !== quarters.length) return null;
    let previous = priorFiscalYearEnd;
    let revenue = 0;
    for (const q of quarters) {
      const day = isoDay(q.date) as string;
      const span = (Date.parse(day) - Date.parse(previous)) / SPREAD_DAYS;
      const value = num(q.revenue);
      if (span < 84 || span > 98 || value === null || value <= 0 || establishedCurrencyOn([q], day, ctx.currencyEvidence) !== ctx.modelCurrency) return null;
      revenue += value;
      previous = day;
    }
    return { priorFiscalYearEnd, through: ttmInc.date, revenue, quarters: quarters.length };
  })();

  // D-99 (seasonal consensus): the last complete fiscal year's four
  // reported quarters (the quarter ends inside the 330 days to its year end,
  // which leaves out the year before's), each in the model currency, give
  // consensus its seasonal shape; valuation.ts checks they are consecutive
  // 13/14-week quarters.
  const revenueSeasonality: RevenueSeasonality | null = (() => {
    const fiscalYearEnd = isoDay(inc0?.date);
    if (fiscalYearEnd === null) return null;
    const quarters = incomeQuarterly
      .filter((r) => { const d = isoDay(r.date); return d !== null && d <= fiscalYearEnd && (Date.parse(fiscalYearEnd) - Date.parse(d)) / SPREAD_DAYS < 330; })
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (quarters.length !== 4 || new Set(quarters.map((q) => isoDay(q.date))).size !== 4) return null;
    const rows: RevenueSeasonality["quarters"] = [];
    for (const q of quarters) {
      const day = isoDay(q.date) as string;
      const value = num(q.revenue);
      if (value === null || value <= 0 || establishedCurrencyOn([q], day, ctx.currencyEvidence) !== ctx.modelCurrency) return null;
      rows.push({ date: day, revenue: value });
    }
    return { fiscalYearEnd, quarters: rows };
  })();

  const rf = riskFreePct(bundle);
  const revenueCagr3y = windowCagr(growth.revenueCagrs, 3);
  const revenueCagr5y = windowCagr(growth.revenueCagrs, 5);
  const dcfInputs: DcfAssumptionInputs | null =
    route.base === "general" && !route.overlays.includes("pre-revenue")
      ? {
          // D-39: a CAGR feeds the anchor only when its measured span is its
          // window (the rule grading applies); a degraded window is named as
          // unavailable with the span it actually measured.
          revenueCagr3yPct: revenueCagr3y.cagrPct,
          revenueCagr3yExcludedSpanYears: revenueCagr3y.excludedSpanYears,
          revenueCagr5yPct: revenueCagr5y.cagrPct,
          revenueCagr5yExcludedSpanYears: revenueCagr5y.excludedSpanYears,
          // D-18: the log-linear regression method of the growth anchor.
          revenueLogLinear: growth.revenueLogLinear,
          analystEstimates,
          // D-98 (rate limits): a rate-limit refusal is named, not shown as "uncovered".
          ...(!bundle.analystEstimates.ok && isFmpQuotaGap(bundle.analystEstimates.gap)
            ? { analystEstimatesRefusal: bundle.analystEstimates.gap.reason }
            : {}),
          waccPct: wacc.waccPct ?? 0,
          // D-19: every WACC input named in the assumption block.
          waccBasis: ctx.waccInputs.summary,
          // D-19: the reported FCF before and after the SBC deduction.
          // D-60: the trailing twelve months when the current-capital cash
          // bridge has a complete TTM window (the DCF starts from the TTM), else
          // the latest fiscal year, so a fiscal-year FCF never sits beside a
          // TTM start revenue.
          fcfSbc: ctx.capital.current?.basis === "ttm" && ctx.capital.current.cashBridge.standardizedFcf !== null
            ? {
                beforeSbc: ctx.capital.current.cashBridge.standardizedFcf,
                afterSbc: ctx.capital.current.cashBridge.afterSbcStandardizedFcf,
                sbc: ctx.capital.current.cashBridge.stockBasedCompensation,
                asOf: ctx.capital.current.asOf,
                basis: `TTM ${ctx.capital.current.periodStart ?? "?"} to ${ctx.capital.current.asOf ?? "?"}: operating cash flow minus cash capital expenditure, before and after stock-based compensation${ctx.capital.current.sbcConcentration ? `; ${ctx.capital.current.sbcConcentration.basis}` : ""}`,
              }
            : {
                beforeSbc: ctx.capital.fcf.latestFcfBeforeSbc,
                afterSbc: ctx.capital.fcf.latestFcf,
                sbc: ctx.capital.fcf.latestSbc,
                // the FCF row's OWN fiscal year end, not the capital block's
                // as-of (which falls back to the income or balance statement). The
                // assumption block printed a date that was not the year the figure
                // came from whenever those statements ended on different days.
                asOf:
                  ctx.capital.fcf.series[ctx.capital.fcf.series.length - 1]?.date ?? ctx.capital.asOf,
                basis: ctx.capital.fcf.basis,
              },
          riskFreePct: rf.pct ?? 0,
          incomeTtm: dcfIncomeTtm,
          operatingNormalizationBasis: ctx.operatingDispositions.basis,
          operatingNormalizationRefusal: ctx.operatingDispositions.refusal,
          equityBridgePreferredRefusal: preferredCapitalRefusal(bridgePoint),
          equityMethodStake,
          // D-98: tagged one-offs inside that operating income.
          unusualOperatingItems: dcfIncomeTtm === null ? null : unusualOperatingItemsTtm(confirmedIssuerFacts(bundle.symbol, bundle.edgar), {
            ttmEnd: dcfIncomeTtm.date,
            fiscalYearEnd: incomeAnnual.map((r) => rowDate(r)).find((d) => d !== "" && d <= dcfIncomeTtm.date) ?? null,
            unit: ctx.modelCurrency,
            observedAt: bundle.builtAt,
          }),
          incomeHistory: dcfIncomeHistory,
          incomeCadenceBarriers: dcfCadenceBarriers,
          recurringOperatingItemsBasis: recurringOperatingItemsBasis(guardedAnnualUnusual.recurring),
          fiscalCalendar: fiscalYearRule(normalizeQuarterRows(incomeAnnual).rows.map(row => String(row.date))),
          balance: dcfBalance,
          // D-135: the existing lease switch (no new config read) reaches sales-to-capital and its D-104 history.
          includeLeasesInEv: evIncludeLeases,
          bridgeCause: { cause: bridge.cause, detail: bridge.detail },
          capitalHistory: dcfCapitalHistory,
          marketCap,
          // The terminal excess-return rule reads the same annual ROIC series
          // the returns section reports.
          // D-19: each ROIC year carries the WACC recomputed from its own
          // fiscal year end's risk-free observation, when one existed.
          roicHistory: roic.series.map((y) => {
            const point = waccByYear.get(y.date);
            return {
              date: y.date,
              roicPct: y.terminalEvidenceRoicPct ?? y.roicPct,
              operatingLoss: y.operatingLoss,
              waccPct: point?.waccPct ?? null,
              waccAsOf: point?.riskFreeAsOf ?? null,
            };
          }),
          // ADR guard (P4): same currency pair the multiples framework
          // already flags — valueCompany suppresses the DCF on mismatch.
          reportedCurrency: ctx.modelCurrency,
          quoteCurrency: str(profile?.currency),
          // D-58: year-one anchor and terminal tax floor evidence. The guidance
          // anchor is the 8-K earnings release's next-quarter revenue outlook,
          // used only in the model currency and when its quarter end is known.
          quarterRevenue: dcfQuarterRevenue,
          guidance,
          domicileCountry: str(profile?.country),
          // D-65: the fiscal year's reported revenue so far, and the quote date the value is stated at.
          fiscalYearToDate,
          revenueSeasonality,
          analysisCutoff: bundle.builtAt.slice(0, 10),
          valuationDate: quotePriceObservationDay(quote),
        }
      : null;

  // --- Multiples framework ---------------------------------------------------
  const commonClassAmbiguity = retainedCommonClassAmbiguity(bundle);
  const multiplesQuote: MultiplesQuoteInputs = {
    price: currentPrice,
    priceAsOf: quotePriceObservationDay(quote),
    marketCap,
    currency: str(profile?.currency),
    isAdr: route.overlays.includes("adr") || profile?.isAdr === true,
    issuerId: bundle.edgar.registrant?.cik10,
    securityId: bundle.symbol,
    ...(commonClassAmbiguity ? { marketCapSecurityBasis: "unresolved" as const, marketCapScopeEvidence: commonClassAmbiguity } : {}),
  };
  // Preferred distributions are period flows. They may accompany a TTM only
  // when all four EXACT income-quarter ends resolve on the cash-flow feed.
  const preferredDividendsTtm = (() => {
    if (ttmInc === null || ctx.modelCurrency === null) return null;
    const dates = incomeQuarterly.filter((row) => String(row.date ?? "") <= ttmInc.date).slice(0, 4).map((row) => String(row.date ?? ""));
    if (dates.length !== 4 || dates[0] !== ttmInc.date) return null;
    const values = dates.map((date) => {
      const row = ctx.cashflowQuarterly.find((cash) => cash.date === date);
      return row && establishedCurrencyOn([row], date, ctx.currencyEvidence) === ctx.modelCurrency ? num(row.preferredDividendsPaid) : null;
    });
    return values.every((value): value is number => value !== null) ? values.reduce((sum, value) => sum + value, 0) : null;
  })();
  const annualPreferredDividends = inc0 === undefined ? null :
    num(ctx.cashflowAnnual.find((row) => row.date === inc0.date)?.preferredDividendsPaid);
  const multiplesIncomeTtm: MultiplesIncomeTtm | null = ttmInc
    ? {
        date: ttmInc.date,
        basis: "ttm",
        revenue: ttmInc.revenue,
        operatingIncome: operatingIncomeForNonMargins(ttmInc),
        incomeBeforeTax: ttmInc.incomeBeforeTax,
        depreciationAndAmortization: ttmInc.depreciationAndAmortization,
        netIncome: ttmInc.netIncome,
        netIncomeAvailableToCommon: ttmInc.netIncomeAvailableToCommon ?? null,
        ...(ttmInc.netIncomeAvailableToCommon != null && !ttmInc.commonIncomeWithheldReason ? {
          commonIncomeQuarters: incomeQuarterly.slice(0, 4).map(row => {
            const evidence = row.fieldProvenance?.netIncomeAvailableToCommon;
            return { period: String(row.date), periodStart: evidence?.periodStart ?? null,
              value: Number(row.netIncomeAvailableToCommon),
              derivation: evidence?.derivation ?? null,
              filings: evidence ? evidence.filings.map(f => ({ form: f.form, filed: f.filed })) : null };
          }),
        } : {}),
        commonIncomeWithheldReason: ttmInc.commonIncomeWithheldReason,
        netIncomeWithheldReason: ttmInc.netIncomeWithheldReason,
        netIncomeOwnershipBasis: ttmInc.netIncomeOwnershipBasis,
        noncontrollingIncome: ttmInc.netIncomeAttributableToNoncontrollingInterest,
        incomeScope: ttmInc.incomeScope, commonIncomeScope: ttmInc.commonIncomeScope, noncontrollingIncomeScope: ttmInc.noncontrollingIncomeScope,
        targetScope: ttmInc.targetScope, admissionAsOf: ttmInc.admissionAsOf,
        preferredClaimsInPeriod: preferredClaimsInFlow(ttmInc.incomeScope ?? { periodEnd: ttmInc.date, basis: "ttm" },
          [...rowsOf(bundle.statements.balanceAnnual), ...rowsOf(bundle.statements.balanceQuarterly)],
          [...rowsOf(bundle.statements.cashflowAnnual), ...rowsOf(bundle.statements.cashflowQuarterly)]),
        preferredDividendsPaid: preferredDividendsTtm,
        epsDiluted: ttmInc.epsDiluted,
        epsDilutedBasis: ttmInc.epsDilutedBasis,
        dAndALowerBound: lowerBoundDAndACaveat(incomeQuarterly.filter((row) => String(row.date ?? "") <= ttmInc.date).slice(0, 4)),
      }
    : inc0
      ? {
          ...commonIncomeEvidence(inc0, "annual", bundle.builtAt),
          preferredClaimsInPeriod: preferredClaimsInFlow(commonFlowScope(inc0, "netIncome", "annual"),
            [...rowsOf(bundle.statements.balanceAnnual), ...rowsOf(bundle.statements.balanceQuarterly)],
            [...rowsOf(bundle.statements.cashflowAnnual), ...rowsOf(bundle.statements.cashflowQuarterly)]),
          date: String(inc0.date ?? ""),
          basis: "annual",
          fiscalYear: typeof inc0.fiscalYear === "string" ? inc0.fiscalYear : typeof inc0.fiscalYear === "number" ? String(inc0.fiscalYear) : null,
          revenue: num(inc0.revenue),
          operatingIncome: operatingIncomeForNonMargins(inc0),
          incomeBeforeTax: num(inc0.incomeBeforeTax),
          depreciationAndAmortization: num(inc0.depreciationAndAmortization),
          netIncome: num(inc0.netIncome),
          netIncomeAvailableToCommon: num(inc0.netIncomeAvailableToCommon),
          preferredDividendsPaid: annualPreferredDividends,
          epsDiluted: num(inc0.epsDiluted),
          dAndALowerBound: lowerBoundDAndACaveat([inc0]),
        }
      : null;
  const multiplesCashFlowTtm: MultiplesCashFlowTtm | null = ttmCf
    ? {
        date: ttmCf.date,
        basis: "ttm",
        operatingCashFlow: ttmCf.operatingCashFlow,
        capitalExpenditure: ttmCf.capitalExpenditure,
        depreciationAndAmortization: ttmCf.depreciationAndAmortization,
        annualDepreciationAndAmortization: ctx.cashflowAnnual[0]
          ? { date: String(ctx.cashflowAnnual[0].date ?? ""), value: num(ctx.cashflowAnnual[0].depreciationAndAmortization) }
          : null,
      }
    : ctx.cashflowAnnual[0]
      ? {
          date: String(ctx.cashflowAnnual[0].date ?? ""),
          basis: "annual",
          operatingCashFlow: num(ctx.cashflowAnnual[0].operatingCashFlow),
          capitalExpenditure: num(ctx.cashflowAnnual[0].capitalExpenditure),
          depreciationAndAmortization: num(ctx.cashflowAnnual[0].depreciationAndAmortization),
        }
      : null;
  const dilutedSharesRow = dilutedSharesBasis === "quarter" ? shareIncomeQuarterly[0] : dilutedSharesBasis === "annual" ? inc0 : undefined;
  const readConvertibles = (row: FmpBalanceSheetRow | null | undefined) => convertibleInstrumentsAt(
    confirmedIssuerFacts(bundle.symbol, bundle.edgar),
    { end: isoDay(dilutedSharesRow?.date) ?? "", basis: dilutedSharesBasis === "quarter" ? "quarter" : "annual" },
    isoDay(row?.date) ?? "", ctx.modelCurrency ?? "USD",
    bundle.edgar?.companyFacts?.ok ? bundle.edgar.companyFacts.value.fetchedAt : bundle.builtAt,
    { permanentPreferred: num(row?.preferredStock), totalDebt: num(row?.totalDebt) });
  // market and historical EV use the same dated, overlap-aware preferred claim.
  const preferredForEv = (row: FmpBalanceSheetRow | null | undefined) => {
    const read = readConvertibles(row);
    return foldConvertiblePreferred(num(row?.preferredStock), read.convertiblePreferredClaim, read.preferredSeriesDistinct).preferred;
  };
  const multiplesBalance: MultiplesBalance | null = balPoint ? toMultiplesBalance(balPoint, balPointBasis, leaseEvidenceContextFor(bundle.symbol, bundle.edgar, bundle.builtAt)) : null;
  // D-135: the DCF bridge's own row, mapped the same way.
  const bridgeBalance: MultiplesBalance | null = bridgePoint ? toMultiplesBalance(bridgePoint, bridgePointBasis, leaseEvidenceContextFor(bundle.symbol, bundle.edgar, bundle.builtAt)) : null;

  // The latest TTM gate does not establish the currency of older quarters.
  // Own-history bands roll over those older rows too, so apply the same
  // filing-evidence rule before mergeQuarterly removes currency metadata.
  const historyIncome = rowsInModelCurrency("incomeQuarterly", ctx.incomeQuarterly, ctx.modelCurrency, ctx.currencyEvidence);
  const historyCashflow = rowsInModelCurrency("cashflowQuarterly", ctx.cashflowQuarterly, ctx.modelCurrency, ctx.currencyEvidence);
  const quarterlyFundamentals: QuarterlyFundamentalsRow[] = mergeQuarterly(
    historyIncome.rows,
    historyCashflow.rows,
    ctx.balanceQuarterly,
    bundle.builtAt,
    [...rowsOf(bundle.statements.cashflowAnnual), ...rowsOf(bundle.statements.cashflowQuarterly)],
  );

  const vendorEnterpriseValues: EnterpriseValuesRow[] = rowsOf(bundle.enterpriseValues).map((r) => ({
    date: String(r.date ?? ""),
    marketCapitalization: num(r.marketCapitalization),
    enterpriseValue: num(r.enterpriseValue),
    sourceId: bundle.enterpriseValues.ok ? bundle.enterpriseValues.value.endpoint : undefined,
    stockPrice: num(r.stockPrice),
    priceCurrency: str(r.currency ?? r.reportedCurrency),
  }));
  // D-60 (P1-K): the vendor's enterprise-values history stops at five
  // quarters, so the own-history bands never reached their eight-quarter
  // minimum for any issuer. The bundle already holds five years of daily market
  // capitalization; it supplies the market cap at older quarter ends. Only the
  // market cap is taken — the own-history EV is rebuilt from each quarter's
  // own statement components either way — and a vendor row wins on its date.
  const vendorEvDates = new Set(vendorEnterpriseValues.map((r) => r.date));
  const enterpriseValuesHistory: EnterpriseValuesRow[] = [
    ...vendorEnterpriseValues,
    ...rowsOf(bundle.marketCapHistory).flatMap((r) => {
      const date = isoDay(r.date);
      const marketCapitalization = num(r.marketCap);
      return date === null || marketCapitalization === null || marketCapitalization <= 0 || vendorEvDates.has(date)
        ? [] : [{ date, marketCapitalization, enterpriseValue: null,
          sourceId: bundle.marketCapHistory.ok ? bundle.marketCapHistory.value.endpoint : undefined }];
    }),
  ];

  // D-17: FFO/AFFO per the NAREIT definition where the filer's tags allow (net
  // income + real-estate D&A − gains on property sales + impairments; AFFO less
  // recurring capex and straight-line rent), falling back to the netIncome +
  // D&A approximation and saying so. Read-only from EDGAR companyfacts.
  const da = ttmInc?.depreciationAndAmortization ?? null;
  // The FFO period is the latest FISCAL YEAR, and every input is read at that
  // same period end. The NAREIT components (real-estate depreciation, gains on
  // property sales, impairments) resolve as annual XBRL facts at `periodEnd`,
  // so passing TRAILING net income, D&A or capex as the fallbacks made the
  // fallback path a hybrid of two periods — a fiscal-year XBRL net income
  // against trailing depreciation — while the primary path was already all
  // fiscal year. A hybrid is worse than a stale-but-coherent figure, so the
  // trailing fallbacks are refused; the REIT block carries the computed as-of
  // and the note below states the basis.
  const nareitFfo = computeNareitFfo({
    companyFacts: admittedIssuerFacts(bundle.symbol, bundle.edgar),
    periodEnd: isoDay(ctx.incomeAnnual[0]?.date),
    reportedCurrency: str(ctx.incomeAnnual[0]?.reportedCurrency),
    netIncome: num(ctx.incomeAnnual[0]?.netIncome),
    depreciationAndAmortization: num(ctx.incomeAnnual[0]?.depreciationAndAmortization),
    capitalExpenditure: num(ctx.cashflowAnnual[0]?.capitalExpenditure),
  });
  const ffoApprox = nareitFfo.ffo;
  const affoApprox = nareitFfo.affo;

  const multiples: MultiplesFrameworkInputs = {
    revenueEligibilityReason: ctx.revenueEligibilityReason,
    quote: multiplesQuote,
    economicShareEvidence: bundle.economicShareEvidence,
    securityBasisAsOf: bundle.builtAt.slice(0, 10),
    reportedCurrency: ctx.modelCurrency,
    incomeTtm: multiplesIncomeTtm,
    cashFlowTtm: multiplesCashFlowTtm,
    balance: multiplesBalance === null ? null : { ...multiplesBalance, preferredStock: preferredForEv(balPoint) },
    quarterlyFundamentals: quarterlyFundamentals.map(row => ({ ...row, preferredStock: preferredForEv({ date: row.date, preferredStock: row.preferredStock ?? undefined, totalDebt: row.totalDebt ?? undefined }) })),
    enterpriseValuesHistory,
    reitSubmap: route.reitSubmap,
    ffoApprox: route.base === "reit" ? ffoApprox : null,
    affoApprox: route.base === "reit" ? affoApprox : null,
    // The own-history P/FFO band can only be rebuilt as net income + D&A per
    // quarter; say whether the current FFO is that construction.
    ffoHistoryComparable: route.base === "reit" ? nareitFfo.netIncomePlusTotalDa : undefined,
    affoHistoryComparable: route.base === "reit" ? nareitFfo.affoHistoryComparable === true : undefined,
    // D-19: off by default; see docs/METHODOLOGY.md, "EV bridge".
    includeLeasesInEv: evIncludeLeases,
    // The observation cutoff any supplied comparability evidence must predate;
    // without it every supplied evidence row read as "unavailable".
    peerComparisonAsOf: bundle.peerFundamentals?.collectedAt ?? bundle.builtAt,
  };
  Object.assign(multiples, comparePeerFundamentals({
    symbol: bundle.symbol, profile: bundle.profile.ok ? bundle.profile.value.data.rows[0] : undefined, quote: bundle.quote, route: route.base,
    subjectCashFlowApplicability: route.cashFlowApplicability,
    subject: multiples, now: new Date(bundle.peerFundamentals?.collectedAt ?? bundle.builtAt), collection: bundle.peerFundamentals,
    subjectIncomeQuarterly: bundle.statements.incomeQuarterly.ok
      ? { ...bundle.statements.incomeQuarterly, value: { ...bundle.statements.incomeQuarterly.value, data: { ...bundle.statements.incomeQuarterly.value.data, rows: ctx.incomeQuarterly } } }
      : bundle.statements.incomeQuarterly,
    subjectBalanceQuarterly: bundle.statements.balanceQuarterly,
  }));

  // --- Excess-return inputs (financials) ------------------------------------
  // Market cap and diluted shares belong to COMMON. Keep opening equity,
  // earnings and payout on that ownership basis and the same fiscal year.
  // A vendor total-equity ROE cannot be applied to common or tangible equity.
  const financialCashByDate = new Map(ctx.cashflowAnnual.map((row) => [String(row.date ?? ""), row]));
  const financialIncome = ctx.incomeAnnual.map((row) => toReturnsIncome(row, financialCashByDate,
    [...rowsOf(bundle.statements.balanceAnnual), ...rowsOf(bundle.statements.balanceQuarterly)],
    [...rowsOf(bundle.statements.cashflowAnnual), ...rowsOf(bundle.statements.cashflowQuarterly)], bundle.builtAt));
  const commonReturns = route.base === "bank" ? ctx.rote : computeRote(
    financialIncome,
    // Reuse the same dated common-earnings/average-equity calculation without
    // deducting intangibles: insurers and mortgage REITs use common book equity.
    ctx.balanceAnnual.map((row) => ({ ...toReturnsBalance(row), goodwill: 0, intangibleAssets: 0 })),
  );
  const commonPayoutRows = ctx.cashflowAnnual.map((row) => {
    // A known total cash payout with an unknown common portion cannot be
    // treated as zero common dividends merely because repurchases are known.
    // An explicit parser refusal also survives a zero aggregate: contradictory
    // preferred cash prevents that aggregate from proving zero common cash.
    if (row.fieldConflicts?.commonDividendsPaid?.usable === false ||
      (num(row.commonDividendsPaid) === null && num(row.netDividendsPaid) !== null && row.netDividendsPaid !== 0)) {
      return { ...row, netIncome: undefined };
    }
    const income = matchByDate(new Map(financialIncome.map(inc => [inc.date, inc])), String(row.date ?? ""));
    const balance = ctx.balanceAnnual.find((bal) => bal.date === row.date);
    const admittedScope = income && num(income.netIncomeAvailableToCommon) !== null ? income.commonIncomeScope : income?.incomeScope;
    const scopeRefusal = income ? commonIncomeFlowRefusal(admittedScope, commonFlowScope(row, "commonDividendsPaid", "annual")) : null;
    return { ...row, netIncome: !scopeRefusal && income && (balance || num(income.netIncomeAvailableToCommon) !== null)
      ? incomeAvailableToCommon(income, num(balance?.preferredStock), num(balance?.minorityInterest)) ?? undefined : undefined };
  });

  // Reuse the statement owner's existing admission only to recover provenance
  // for unchanged admitted operands in old snapshots. No value is replaced.
  const payoutFacts = confirmedIssuerFacts(bundle.symbol, bundle.edgar);
  const payoutObserved = bundle.edgar?.companyFacts?.ok ? bundle.edgar.companyFacts.value.fetchedAt : null;
  const payoutFiled = payoutFacts && payoutObserved && Date.parse(payoutObserved)<=Date.parse(bundle.builtAt)
    ? buildStatementsFromCompanyFacts(payoutFacts,{symbol:bundle.symbol,cik:String(payoutFacts.cik),annualPeriods:3,quarterlyPeriods:1,
        asOf:bundle.builtAt.slice(0,10),factsObservedAt:payoutObserved,vendorSplits:{status:"unavailable",source:"cash-payout-evidence",reason:"only additive unchanged common cash and income operands; no per-share inference"}}) : null;
  const payoutRows=commonPayoutRows.map(row=>{
    const filed=payoutFiled?.cashflowAnnual.rows.find(f=>f.date===row.date && f.reportedCurrency===row.reportedCurrency);
    return !row.fieldProvenance?.commonDividendsPaid && row.fieldConflicts?.commonDividendsPaid?.usable!==false && filed?.commonDividendsPaid===row.commonDividendsPaid && filed?.fieldProvenance?.commonDividendsPaid
      ? {...row,fieldProvenance:{...row.fieldProvenance,commonDividendsPaid:filed.fieldProvenance.commonDividendsPaid}} : row;
  });
  const payoutIncome=ctx.incomeAnnual.map(row=>{
    const filed=payoutFiled?.incomeAnnual.rows.find(f=>f.date===row.date && f.reportedCurrency===row.reportedCurrency);
    const admitted=commonPayoutRows.find(r=>r.date===row.date)?.netIncome;
    const field=num(filed?.netIncomeAvailableToCommon)!==null ? "netIncomeAvailableToCommon" : "netIncome";
    return !row.fieldProvenance?.netIncomeAvailableToCommon && !row.fieldProvenance?.netIncome && admitted!=null && filed?.[field]===admitted && filed?.fieldProvenance?.[field]
      ? {...row,fieldProvenance:{...row.fieldProvenance,[field]:filed.fieldProvenance[field]}} : row;
  });
  ctx.capital.cashDividendPayout = fiscalCashDividendPayout(payoutRows,payoutIncome,bundle.builtAt.slice(0,10));

  // D-102: start from the trailing four quarters when that
  // return is complete and newer than the latest fiscal year, from the book
  // value at the window's end; the fiscal-year start is valued beside it.
  // D-105: with more than one common class, the diluted count
  // is the per-share denominator only when the basic count from the same row
  // spans every class (`issuerEconomicDilutedShares`); it is then restated in
  // quoted-share units.
  const economicScope = resolveEconomicEquityScope(multiplesQuote, bundle.economicShareEvidence ?? [], bundle.builtAt.slice(0, 10));
  const economicDiluted = issuerEconomicDilutedShares(
    economicScope,
    bundle.economicShareEvidence ?? [],
    { basic: posShares(num(dilutedSharesRow?.weightedAverageShsOut)), diluted: dilutedShares, periodEnd: isoDay(dilutedSharesRow?.date) },
    // D-135: a substituted count, or a loss period's basic count, is not the filed diluted count; the not-restored case divides by the filed count.
    { countNotFiled: dilutedShareDivisor !== null && (dilutedShareDivisor.basis === "loss-period-substituted" || dilutedShareDivisor.basis === "loss-period-basic"),
      combinedClassEps: retainedCombinedClassEpsBasis(bundle, { basic: posShares(num(dilutedSharesRow?.weightedAverageShsOut)), diluted: dilutedShares, periodEnd: isoDay(dilutedSharesRow?.date) }) },
  );
  const valuationDilutedShares = economicDiluted?.shares ?? dilutedShares;
  const bridgeConvertibles = readConvertibles(bridgePoint);
  const financialConvertibles = readConvertibles(balPoint);
  const instrumentsOnEconomicBasis = (read: typeof bridgeConvertibles) => {
    // A substituted loss count already excludes conversion shares. An unresolved class count cannot be repaired here.
    if (dilutedShareDivisor && dilutedShareDivisor.basis !== "filed") return [];
    const factor = economicDiluted?.shares != null && dilutedShares ? economicDiluted.shares / dilutedShares : 1;
    return read.instruments.map(i => ({ ...i, conversionShares: i.conversionShares * factor,
      conversionPrice: i.conversionPrice === null ? null : i.conversionPrice / factor }));
  };


  const ttmReturn = ctx.commonReturnTtm;
  const fyBasis = route.base === "bank" ? "fiscal-year-rote" as const : "fiscal-year-common-roe" as const;
  const ttmStart = ttmReturn !== null && ttmReturn.returnPct !== null && ttmReturn.closingEquity !== null && ttmReturn.closingEquity > 0 &&
    ttmReturn.asOf !== null && (commonReturns.asOf === null || ttmReturn.asOf > commonReturns.asOf)
    ? { roePct: ttmReturn.returnPct, bookValue: ttmReturn.closingEquity, asOf: ttmReturn.asOf }
    : null;
  const combinationYears = financialRoute
    ? businessCombinationYears(confirmedIssuerFacts(bundle.symbol, bundle.edgar), ctx.balanceAnnual.map(toReturnsBalance), ctx.modelCurrency)
    : new Map<string, string>();
  const fiscalYearBalance = ctx.balanceAnnual.find(row => isoDay(row.date) === commonReturns.asOf);
  const openingBook = quarterlyOpeningBook({
    row: balQ ? { ...balQ, ...toReturnsBalance(balQ) } : null,
    annualAsOf: commonReturns.asOf,
    basis: route.base === "bank" ? "tangible-common-equity" : "common-equity",
    currency: ctx.modelCurrency, cutoff: bundle.builtAt,
    shareRow: dilutedSharesRow, dilutedShares: valuationDilutedShares,
  });
  const quarterlyBook = "bookValue" in openingBook ? openingBook : null;
  const currentBookPreferredRefusal = preferredCapitalRefusal(newestBalanceRow(ctx.balanceQuarterly[0], ctx.balanceAnnual[0]));
  const fiscalYearConvertibles = readConvertibles(fiscalYearBalance ?? { date: commonReturns.asOf ?? undefined });
  const quarterlyConvertibles = quarterlyBook ? readConvertibles(balQ ?? { date: quarterlyBook.asOf }) : null;
  // D-193/D-198: scenario evidence requires the dated book adjustments. An
  // explicit preferred-capital refusal also blocks the headline common book.
  const scenarioBookRefusal = (date: string | null, tangible: boolean): string | null => {
    const row = [...ctx.balanceAnnual, ...ctx.balanceQuarterly].find(row => isoDay(row.date) === date);
    if (!row) return `no balance for book date ${date ?? "unavailable"}`;
    const preferredRefusal = preferredCapitalRefusal(row);
    if (preferredRefusal) return preferredRefusal;
    if (row.reportedCurrency !== ctx.modelCurrency || !ctx.modelCurrency) return `book currency unavailable or inconsistent at ${date}`;
    const fields = tangible ? ["totalStockholdersEquity", "preferredStock", "goodwill", "intangibleAssets"] as const
      : ["totalStockholdersEquity", "preferredStock"] as const;
    for (const field of fields) {
      const v = num(row[field]);
      if (v === null || (field !== "totalStockholdersEquity" && v < 0) || row.fieldConflicts?.[field]?.usable === false) {
        return `${field} missing, negative or conflicted at ${date}; undisclosed adjustments are not zero`;
      }
    }
    return null;
  };
  const scenarioHistoryDates = financialRoute ? commonReturns.series.slice(-5).flatMap(y => [y.date,
    ...ctx.balanceAnnual.filter(row => {
      const days = (Date.parse(y.date) - Date.parse(String(row.date))) / 86_400_000;
      return days >= 330 && days <= 400;
    }).map(row => String(row.date)),
  ]) : [];
  const excessReturn: ExcessReturnInputs | null =
    financialRoute
      ? {
          scenarioBookEvidence: {
            openingBookRefusal: currentBookPreferredRefusal ?? scenarioBookRefusal(quarterlyBook?.asOf ?? ttmStart?.asOf ?? commonReturns.asOf, route.base === "bank"),
            tangibleBookRefusal: scenarioBookRefusal(route.base === "bank"
              ? quarterlyBook?.asOf ?? ttmStart?.asOf ?? commonReturns.asOf : ctx.rote?.asOf ?? null, true),
            historyRefusal: scenarioHistoryDates.map(date => scenarioBookRefusal(date, route.base === "bank")).find(reason => reason !== null) ?? null,
          },
          bookValue: currentBookPreferredRefusal ? null : quarterlyBook?.bookValue ?? ttmStart?.bookValue ?? commonReturns.latestTangibleCommonEquity,
          bookValueRefusal: currentBookPreferredRefusal,
          bookValueBasisDetail: (quarterlyBook ? balQ : fiscalYearBalance)?.preferredCapitalBasis,
          bookValueBasis: route.base === "bank" ? "tangible-common-equity" : "common-equity",
          currentRoePct: ttmStart?.roePct ?? commonReturns.latestRotePct,
          currentRoeBasis: ttmStart !== null ? (route.base === "bank" ? "ttm-rote" : "ttm-common-roe") : fyBasis,
          currentRoeAsOf: ttmStart?.asOf ?? commonReturns.asOf,
          startAlternative: ttmStart !== null && commonReturns.latestRotePct !== null && commonReturns.latestTangibleCommonEquity !== null && commonReturns.latestTangibleCommonEquity > 0
            ? { roePct: commonReturns.latestRotePct, basis: fyBasis, asOf: commonReturns.asOf, bookValue: commonReturns.latestTangibleCommonEquity,
              convertiblePreferredClaim: fiscalYearConvertibles.convertiblePreferredClaim,
              permanentPreferred: num(fiscalYearBalance?.preferredStock), preferredSeriesDistinct: fiscalYearConvertibles.preferredSeriesDistinct }
            : null,
          // P10: null CoE SUPPRESSES the model inside excessReturnModel
          // (critical gap) — never a silent 10% default.
          costOfEquityPct: wacc.costOfEquityPct,
          // Payout: (dividends + net buybacks) / net income, 3y average, from
          // the annual cash-flow statements; null suppresses the valuation.
          payoutRatioPct: payoutRatioPct3y(commonPayoutRows),
          dilutedShares: valuationDilutedShares,
          convertibles: instrumentsOnEconomicBasis(quarterlyConvertibles ?? financialConvertibles),
          convertiblePreferredClaim: (quarterlyConvertibles ?? financialConvertibles).convertiblePreferredClaim,
          permanentPreferred: num((quarterlyBook ? balQ : balPoint)?.preferredStock),
          preferredSeriesDistinct: (quarterlyConvertibles ?? financialConvertibles).preferredSeriesDistinct,
          totalDebt: num((quarterlyBook ? balQ : balPoint)?.totalDebt),
          marketCap,
          price: currentPrice,
          asOf: quarterlyBook?.asOf ?? ttmStart?.asOf ?? commonReturns.asOf,
          valuationDate: quotePriceObservationDay(quote),
          // D-17: P/TBV is read against ROTE, both on the tangible base the
          // returns block already computes — never against plain book equity.
          // A bank's trailing ROTE and the tangible equity at its end pair the same way (D-102).
          tangibleCommonEquity: route.base === "bank" && quarterlyBook ? quarterlyBook.bookValue : route.base === "bank" && ttmStart !== null ? ttmStart.bookValue : ctx.rote?.latestTangibleCommonEquity ?? null,
          tangibleCommonEquityAsOf: route.base === "bank" && quarterlyBook ? quarterlyBook.asOf : route.base === "bank" && ttmStart !== null ? ttmStart.asOf : ctx.rote?.asOf ?? null,
          rotePct: route.base === "bank" && ttmStart !== null ? ttmStart.roePct : ctx.rote?.latestRotePct ?? null,
          roteAsOf: route.base === "bank" && ttmStart !== null ? ttmStart.asOf : ctx.rote?.asOf ?? null,
          roteSource: route.base === "bank" && ttmStart !== null ? "computed.returns.commonReturnTtm" : "computed.returns.rote",
          // The justified-P/TBV cross-check caps its growth rate at the same
          // ceiling the DCF terminal value uses: nothing grows faster than the
          // risk-free rate forever. Null leaves the house terminal-growth cap
          // as the only bound, which the basis string discloses.
          riskFreePct: rf.pct,
          // The same return, year by year — the evidence the terminal
          // excess-return convention reads. A financial route has no ROIC
          // series, so no year has a cost of equity of its own and each is
          // compared with the current one (D-104).
          roeHistory: commonReturns.series.map((y) => {
            const point = waccByYear.get(y.date);
            return {
              date: y.date,
              roicPct: y.rotePct,
              waccPct: point?.costOfEquityPct ?? null,
              waccAsOf: point?.riskFreeAsOf ?? null,
              combinationEvidence: combinationYears.get(y.date) ?? null,
            };
          }),
        }
      : null;

  // --- REIT inputs -----------------------------------------------------------
  const noiOperating = operatingIncomeForNonMargins(ttmInc);
  const noiApprox = noiOperating !== null && da !== null ? noiOperating + da : null;
  const reitSubmapReason =
    route.reitSubmap === "undetermined"
      ? (route.gaps.find((g) => g.field === "route.reitSubmap")?.reason ?? null)
      : null;
  // D-233 (P13, P1, P3, P10): FFO and AFFO are flows of the latest fiscal year (`computeNareitFfo`), so their
  // per-share divisor is that same fiscal year's weighted diluted count: the annual income row at FFO's period end,
  // through the one divisor owner (`incomeDivisors`, D-135) and the one class-basis rule (D-105). The latest
  // quarter's count divides a value per share (the DCF and the excess-return model), never a flow of another
  // period. With no count established for FFO's own year the per-share figures are withheld with the reason.
  const ffoPeriodEnd = nareitFfo.asOf ?? isoDay(inc0?.date);
  const reitDivisor = ((): { shares: number | null; withheld: string | null; divisor: DivisorResult | null } => {
    const annualEnd = isoDay(inc0?.date);
    if (ffoPeriodEnd === null || annualEnd !== ffoPeriodEnd) {
      return { shares: null, divisor: null, withheld: `no fiscal-year income row ends at FFO's period end ${ffoPeriodEnd ?? "(unavailable)"}` };
    }
    const annual = divisors.annual;
    if (annual.shares === null) {
      return { shares: null, divisor: null, withheld: `the fiscal year ending ${annualEnd} carries no weighted-average diluted share count` };
    }
    const counts = { basic: posShares(num(inc0?.weightedAverageShsOut)), diluted: annual.shares, periodEnd: annualEnd };
    const economic = issuerEconomicDilutedShares(economicScope, bundle.economicShareEvidence ?? [], counts, {
      countNotFiled: annual.basis === "loss-period-substituted" || annual.basis === "loss-period-basic",
      combinedClassEps: retainedCombinedClassEpsBasis(bundle, counts),
    });
    if (economic !== null && economic.shares === null) return { shares: null, divisor: null, withheld: economic.reason.replace(/\.$/, "") };
    return { shares: economic?.shares ?? annual.shares, divisor: annual, withheld: null };
  })();
  // D-135: the divisor a published per-share figure divides by. On the equity-REIT route that is the fiscal-year row above.
  const disclosedDivisor = route.base === "reit" ? reitDivisor.divisor : dilutedShareDivisor;
  const reit: ReitInputs | null =
    route.base === "reit"
      ? {
          ffoApprox,
          affoApprox,
          sharePrice: currentPrice,
          shares: reitDivisor.shares,
          sharesPeriodEnd: ffoPeriodEnd,
          sharesWithheldReason: reitDivisor.withheld,
          noiApprox,
          // The FFO computation's own period end, never the trailing income
          // date: labelling a fiscal-year FFO with a TTM as-of asserted a
          // freshness the figure does not have.
          asOf: nareitFfo.asOf ?? isoDay(inc0?.date),
          // D-17: print the basis FFO/AFFO were actually built on, and withhold
          // the whole block when the equity-vs-mortgage sub-map is unproven.
          ffoBasis: nareitFfo.ffoBasis,
          affoBasis: nareitFfo.affoBasis,
          ffoApproximate: nareitFfo.ffoApproximate,
          affoApproximate: nareitFfo.affoApproximate,
          submap: route.reitSubmap ?? null,
          submapReason: reitSubmapReason,
          // D-135: the market cap and the house EV come from the
          // multiples framework (`valueCompany`), never rebuilt here.
        }
      : null;

  // D-135: a successor registrant with no annual report of its own bears its predecessor's filed obligations, when its
  // filings re-present the predecessor's periods unchanged (D-112); without that continuity nothing is read from it.
  // An FMP-supplied CIK that SEC answers for another registrant must not drive the successor read.
  const ownCompanyFacts = confirmedIssuerFacts(bundle.symbol, bundle.edgar);
  const predecessorEntry = bundle.edgar?.predecessor ?? null;
  const successorPredecessor = predecessorEntry === null || ownCompanyFacts === null ? null : {
    facts: predecessorEntry.facts, cik10: predecessorEntry.cik10, continuity: successorContinuity(ownCompanyFacts, predecessorEntry.facts) !== null,
  };
  const bundleInputs: ValuationBundleInputs = {
    currentPrice,
    waccPct: wacc.waccPct,
    // D-133: the DCF gap quotes why the WACC is unavailable.
    waccUnavailableReason: wacc.waccPct !== null ? null
      : (wacc.gaps.find((g) => g.severity === "critical") ?? wacc.gaps.find((g) => g.severity === "warn"))?.reason ?? null,
    // D-135: every DCF-bridge operand below reads the bridge row (`bridgePoint`: the
    // statement-date row, else the anchor); `multiples.balance`, `reit` and
    // `excessReturn` keep the anchor (`balPoint`).
    bridgeBalance,
    netDebt: bridgeNetDebtInfo.value,
    dilutedShares: valuationDilutedShares,
    convertibles: instrumentsOnEconomicBasis(bridgeConvertibles),
    convertiblePreferredClaim: bridgeConvertibles.convertiblePreferredClaim,
    preferredSeriesDistinct: bridgeConvertibles.preferredSeriesDistinct,
    ...(economicDiluted?.shares != null ? { dilutedShareSecurityBasis: "issuer-economic" as const } : {}),
    ...(economicDiluted ? { dilutedShareEconomicBasis: economicDiluted.shares === null ? economicDiluted.reason : economicDiluted.basis } : {}),
    // D-135: how the divisor row's count was formed, so a loss period's substitution is disclosed.
    ...(disclosedDivisor !== null && disclosedDivisor.basis !== "filed" ? { dilutedShareDivisor: divisorDisclosure(disclosedDivisor) } : {}),
    // D-265 (P3, P2): filed held-share evidence beside a share-basis difference; disclosure only.
    ...(employeeTrustShares !== null ? { employeeTrustShares } : {}),
    noncontrollingOwnershipUnresolved: noncontrollingOwnershipUnresolvedAt(bridgePoint),
    minorityInterest: bridgePoint ? num(bridgePoint.minorityInterest) : null,
    preferred: bridgePoint ? num(bridgePoint.preferredStock) : null,
    // D-135: temporary equity at the bridge date (redeemable preferred and redeemable NCI), folded into the two above by `valueCompany`.
    temporaryEquity: bridgePoint ? temporaryEquityClaims({ ...temporaryEquityOperands(bridgePoint), preferredStock: num(bridgePoint.preferredStock) }) : null,
    // The DCF bridge reads the statement-date row and the enterprise values the anchor row, so each is matched on its own date.
    temporaryEquityUnknown: (() => {
      const unknownAt = (row: FmpBalanceSheetRow | null | undefined) => temporaryEquityUnknownAt(row ?? null, row ? isoDay(row.date) : null, bundle.gaps);
      const bridge = unknownAt(bridgePoint), market = unknownAt(balPoint);
      return bridge === null && market === null ? null : { bridge, market };
    })(),
    // D-102: the trailing profit key for the DCF's NCI deduction.
    // Consolidated profit is the filed ProfitLoss, else net income on a
    // consolidated basis, else parent plus NCI income (as forensics does).
    noncontrollingEarnings: noncontrollingEarningsInput(
      ttmInc === null ? null : {
        date: ttmInc.date, netIncome: ttmInc.netIncome, netIncomeConsolidated: ttmInc.netIncomeConsolidated ?? null,
        netIncomeOwnershipBasis: ttmInc.netIncomeOwnershipBasis, netIncomeAttributableToNoncontrollingInterest: ttmInc.netIncomeAttributableToNoncontrollingInterest ?? null,
        noncontrollingIncomeEvidenced: ttmInc.noncontrollingIncomeEvidenced,
        noncontrollingIncomeUnevidencedZero: ttmInc.noncontrollingIncomeUnevidencedZero,
      },
      inc0 === undefined ? null : {
        date: isoDay(inc0.date), netIncome: num(inc0.netIncome), netIncomeConsolidated: num(inc0.netIncomeConsolidated),
        netIncomeOwnershipBasis: commonIncomeEvidence(inc0, "annual").netIncomeOwnershipBasis,
        netIncomeAttributableToNoncontrollingInterest: num(inc0.netIncomeAttributableToNoncontrollingInterest),
        noncontrollingIncomeEvidenced: inc0.fieldProvenance?.netIncomeAttributableToNoncontrollingInterest != null,
      },
    ) ?? null,
    staleNoncontrollingEarnings: filedAnnualNciEarnings(bundle, ctx.modelCurrency),
    latestAnnualIncomeDate: isoDay(inc0?.date),
    analysisCutoff: bundle.builtAt.slice(0, 10),
    // D-19: the DCF equity bridge follows the same lease convention.
    leaseLiability: bridgePoint ? num(bridgePoint.capitalLeaseObligations) : null,
    operatingLeaseLiability: bridgePoint ? num(bridgePoint.operatingLeaseLiability) : null,
    includeLeasesInEv: evIncludeLeases,
    // D-60: equity securities the house net debt left out of cash.
    nonOperatingAssets: bridgeNetDebtInfo.nonOperatingEquitySecurities !== undefined
      ? { value: bridgeNetDebtInfo.nonOperatingEquitySecurities, basis: str(bridgePoint?.marketableEquityBasis) ?? "marketable equity securities at filed fair value" }
      : null,
    // D-65: the filed source of the long-term investments the DCF removes from operating capital.
    longTermInvestmentsBasis: (() => {
      const lti = bridgePoint ? num(bridgePoint.longTermInvestments) : null;
      const date = bridgePoint ? isoDay(bridgePoint.date) : null;
      if (lti === null || lti <= 0 || date === null) return null;
      const filed = isoDay(bridgePoint?.filingDate) ?? (typeof bridgePoint?.acceptedDate === "string" ? isoDay(bridgePoint.acceptedDate.slice(0, 10)) : null);
      // D-135: a successor with no annual report of its own cites its predecessor's filed stakes (same rule as the obligations).
      // It is read at the bridge date only, and the citation names the predecessor's CIK.
      const ownStakes = nonMarketableEquityCarrying(ownCompanyFacts, date, ctx.modelCurrency, bundle.builtAt);
      const predecessorStakes = ownStakes !== null || successorPredecessor === null ? null
        : nonMarketableEquityCarrying(predecessorFactsFor(ownCompanyFacts, successorPredecessor, date, ctx.modelCurrency, bundle.builtAt), date, ctx.modelCurrency, bundle.builtAt);
      const privateStakes = ownStakes ?? predecessorStakes;
      const b = (v: number) => `${(v / 1e9).toFixed(2)}B`;
      return `long-term investments ${b(lti)} on the ${date} ${bridgePointBasis ?? ""} balance sheet${filed ? ` (filed ${filed})` : ""}, at carrying value — ${LONG_TERM_INVESTMENTS_REMOVED_CLAUSE}` +
        (privateStakes === null ? "" : `; of which non-marketable equity securities ${b(privateStakes.value)} (us-gaap/EquitySecuritiesWithoutReadilyDeterminableFairValueAmount, ${predecessorStakes === null || successorPredecessor === null ? "" : `predecessor CIK ${successorPredecessor.cik10}, `}${privateStakes.form} filed ${privateStakes.filed}), carried at cost less impairment adjusted for observable price changes`) +
        "; a stake the statements do not break out of other assets stays in operating capital";
    })(),
    // D-104 and D-135: the retirement, environmental, pension and OPEB, loss-contingency
    // and contingent-consideration obligations filed at the bridge's balance date, or in the year before it.
    debtLikeObligations: bridgePoint === null ? null : successorObligationsAt(
      ownCompanyFacts, successorPredecessor, isoDay(bridgePoint.date), ctx.modelCurrency, bundle.builtAt),
    // D-135: the one SIC fact; valueCompany derives "rate-regulated utility" and "established" from it.
    sicCode: parseSicCode(bundle.edgar?.sic),
    dcfInputs,
    multiples,
    excessReturn,
    reit,
  };

  void ratiosTtm; // reserved for future ratio cross-checks
  const valuationInputs = ctx.foreignBasis ? translateValuationInputs(bundleInputs, ctx.foreignBasis) : bundleInputs;
  let result = valueCompany(route, valuationInputs);
  if (ctx.foreignBasis) {
    result.notes.push(ctx.foreignBasis.note);
    result.gaps.push({ field: "valuation.currencyTranslation", reason: ctx.foreignBasis.note, severity: "info", attemptedSources: [`fred:${ctx.foreignBasis.fx.series}`, ...ctx.foreignBasis.securityEvidence.flatMap(e => e.sourceIds)] });
    if (result.multiples) {
      result.multiples.notes.push(ctx.foreignBasis.note);
      result.multiples.enterpriseValue.basis += ` ${ctx.foreignBasis.note}`;
      for (const row of result.multiples.multiples) row.basis += ` ${ctx.foreignBasis.note}`;
    }
  }
  // D-147: disclosure only. Filing-note text is not admitted as placement evidence.
  if (!financialRoute && ownCompanyFacts !== null && bridgePoint && ctx.modelCurrency !== null) {
    const tag = "AvailableForSaleSecuritiesDebtSecurities";
    const date = isoDay(bridgePoint.date);
    const observed = bundle.edgar.companyFacts.ok
      ? bundle.edgar.companyFacts.value.fetchedAt.slice(0, 10) : bundle.builtAt.slice(0, 10);
    const fact = date === null ? null : instantFact(ownCompanyFacts, tag, ctx.modelCurrency, date,
      [observed, bundle.builtAt.slice(0, 10)].sort()[0]);
    const counted = ["cashAndShortTermInvestments", "shortTermInvestments", "longTermInvestments"] as const;
    const alreadyCounted = counted.some(field => (num(bridgePoint[field]) ?? 0) > 0 &&
      (bridgePoint.fieldProvenance?.[field]?.tags ?? []).includes(`us-gaap/${tag}`));
    if (fact !== null && fact.val > 0 && !fact.dimensions && !fact.segment && !alreadyCounted) {
      const reason = `${tag} ${millions(fact.val)} (${ctx.modelCurrency}, ${date}, filed ${fact.filed}) is left out of a separate fair-value financial-asset add-back: admitted structured facts do not establish placement outside cash and short-term investments without overlap with existing investments. Filing-note text is not admitted as placement evidence under C2. Existing cash and investment amounts remain counted; this total is not added again (VAL-14).`;
      result.gaps.push({ field: "valuation.dcf.fairValueFinancialAssets", severity: "warn", reason });
      result.notes.push(reason);
    }
  }
  result.gaps.push(...(financialRoute ? financialConvertibles.gaps : bridgeConvertibles.gaps));
  // D-137: a newly applicable DCF must not newly Block a
  // report main published. Retain its prior withheld valuation only when the
  // new attempt fails critically and the actual prior treatment did not.
  // Existing model-eligibility holds and every ordinary DCF check still run.
  if (ctx.finOtherOcfExemption && !route.modelEligibility && result.kind === "dcf" &&
      result.gaps.some(g => g.severity === "critical")) {
    const prior = valueCompany({ ...route, overlays: ["unprofitable", ...route.overlays] }, valuationInputs);
    if (prior.kind === "dcf-suppressed" && !prior.gaps.some(g => g.severity === "critical")) {
      const reason = "Prior DCF suppression retained for this FIN-OTHER financial issuer: the required model inputs do not support a value (" +
        result.gaps.filter(g => g.severity === "critical").map(g => g.reason).join("; ") +
        "). Negative operating cash flow alone is not a profitability signal; the issuer is not labelled unprofitable.";
      result = {
        ...prior,
        suppressionReason: reason,
        suppressionKind: "input-evidence",
        notes: [...prior.notes.filter(n => !n.startsWith("fcfDcf suppressed by metric policy (unprofitable overlay)")), reason],
        // Keep the prior suppression's classification; no input check or gap
        // severity is changed. Replace its obsolete profitability explanation.
        // D-229: the new sentence no longer states the unprofitable-overlay cause, so its code is not kept.
        gaps: prior.gaps.map(g => isUnprofitableOverlayGap(g)
          ? { ...withoutGapCause(g), reason } : g),
      };
    }
  }
  result.gaps.push(...estimateGaps);
  result.notes.push(...bundle.gaps.filter(g => g.field.endsWith(".shareUnitRepair")).map(g => g.reason));
  if (estimatesInModelCurrency && revenueCalibration.code !== null) result.notes.push(revenueCalibration.basis);
  // D-135: one info gap per date the bridge or the market EV reads a mezzanine preferred filed twice (the bridge and the anchor often share a row).
  const overlapDates = new Set<string>();
  for (const row of [bridgePoint, balPoint]) {
    const overlap = row ? temporaryEquityClaims({ ...temporaryEquityOperands(row), preferredStock: num(row.preferredStock) })?.overlap ?? null : null;
    const date = row ? isoDay(row.date) ?? "" : "";
    if (row && overlap !== null && !overlapDates.has(date)) {
      overlapDates.add(date);
      result.gaps.push({ field: "valuation.preferredOverlap", reason: `balance ${date}: ${overlap}`, severity: "info" });
    }
  }
  // D-135: on the DCF route, say when a predecessor would have supplied an obligation but continuity is not established.
  if (result.kind === "dcf" && successorPredecessor !== null && !successorPredecessor.continuity && bridgePoint !== null) {
    const bridgeDate = isoDay(bridgePoint.date);
    const withheld = successorObligationsAt(ownCompanyFacts, { ...successorPredecessor, continuity: true }, bridgeDate, ctx.modelCurrency, bundle.builtAt);
    const read = successorObligationsAt(ownCompanyFacts, successorPredecessor, bridgeDate, ctx.modelCurrency, bundle.builtAt);
    if (JSON.stringify(withheld) !== JSON.stringify(read)) {
      result.gaps.push({
        field: "valuation.dcf.debtLikeObligations.predecessor",
        reason: `a predecessor registrant (CIK ${successorPredecessor.cik10}) files obligations (retirement, environmental, pension, loss-contingency or contingent-consideration) ` +
          "that the successor does not tag, but the successor's own filings do not re-present the predecessor's periods unchanged (net income and per-share basis), " +
          "so the two are not shown to be one reporting entity and those obligations are not deducted in the equity bridge",
        severity: "info",
      });
    }
  }
  for (const history of [historyIncome, historyCashflow]) {
    if (history.gap !== null) result.gaps.push(history.gap);
  }
  // D-17: the FFO computation's own notes and gaps (which tags resolved, which
  // stand-in was used) reach the report on the route that consumes them.
  if (route.base === "reit") {
    result.notes.push(...nareitFfo.notes);
    result.gaps.push(...nareitFfo.gaps);
    result.notes.push(
      `FFO, AFFO and everything derived from them (P/FFO, P/AFFO, the AFFO payout ratio) are measured on the latest ` +
        `FISCAL YEAR${nareitFfo.asOf !== null ? ` ending ${nareitFfo.asOf}` : ""}, not on a trailing twelve months: ` +
        "the NAREIT components resolve as annual XBRL facts, and mixing a fiscal-year net income with trailing " +
        "depreciation would make the figure a hybrid of two periods. The market cap in P/FFO is at the current quote, so for a " +
        "REIT compounding FFO the multiple is measured against a figure up to three quarters old.",
    );
  }
  // Basis disclosures for the point-in-time anchors chosen above (P20).
  if (balanceAnchor.fallback !== null) {
    result.notes.push(balanceAnchor.fallback);
    result.gaps.push({ field: "valuation.balanceAnchor", reason: balanceAnchor.fallback, severity: "info" });
  }
  if (!financialRoute && netDebtInfo.value === null && balPoint !== null) {
    result.notes.push(
      `House net-debt basis: net debt unavailable — ${netDebtInfo.reason}`,
    );
    // P20: only a provider balance has an FMP netDebt field to set aside; a keyless report names none.
    const balPointFamily = balPointBasis === "quarter" ? bundle.statements.balanceQuarterly : bundle.statements.balanceAnnual;
    const fmpBalance = balPointFamily.ok && balPointFamily.value.source === "fmp";
    result.gaps.push({
      field: "valuation.netDebt",
      reason: `${netDebtInfo.reason}; valuation equity bridge suppressed` +
        (fmpBalance ? " rather than using FMP's incompatible cash-only netDebt field" : ""),
      severity: "warn",
    });
  } else if (!financialRoute && netDebtInfo.value !== null) {
    const c = netDebtInfo.components;
    result.notes.push(
      `House net-debt basis: ${balPoint?.cashConflictReconciled ? netDebtInfo.reason + "; " : ""}net debt ${netDebtInfo.value} as of ${netDebtInfo.asOf ?? "?"}; total debt ${c.totalDebt}, cash and short-term investments ${c.cashAndShortTermInvestments ?? "derived from cash + short-term investments"}` +
        (netDebtInfo.nonOperatingEquitySecurities !== undefined
          ? `, less marketable equity securities ${netDebtInfo.nonOperatingEquitySecurities} that are not cash (${str(balPoint?.marketableEquityBasis) ?? "filed fair value"})`
          : ""),
    );
  }
  if (excessReturn !== null) {
    const payoutGap = result.gaps.find(g => g.field === "valuation.excessReturn.payout");
    if (payoutGap) {
      const missingEarnings = commonPayoutRows.slice(0, 3).filter(row => num(row.netIncome) === null || row.netIncome! <= 0)
        .map(row => isoDay(row.date) ?? "undated fiscal year");
      payoutGap.reason += missingEarnings.length
        ? ` Common earnings aligned with payout are unavailable or non-positive for ${missingEarnings.join(", ")}; at least 2 of the latest 3 fiscal years need positive common earnings and compatible common cash payouts. Total net income cannot substitute for unresolved common-holder earnings.`
        : " At least 2 of the latest 3 fiscal years need compatible common cash dividends or repurchases and positive common earnings; missing or refused cash payouts cannot be assumed zero.";
    }
    const bookNote = quarterlyBook
      ? `Quarterly opening book admitted at ${quarterlyBook.asOf}, with equity, adjustments and diluted shares on that date. The ${ttmStart ? "trailing" : "fiscal-year"} return remains a forward rate; historical earnings already included in opening book are not added again. The forecast begins after opening book; roll-forward starts only at that book date.`
      : `Quarterly opening book not admitted: ${"reason" in openingBook ? openingBook.reason : "unavailable"}; retaining the fiscal-year opening-book calculation.`;
    result.notes.push(bookNote);
    if (!quarterlyBook) result.gaps.push({ field: "valuation.excessReturn.openingBook", reason: bookNote, severity: "info" });
    result.notes.push(
      `Common-share valuation uses ${route.base === "bank" ? "tangible common equity and ROTE" : "common equity and common-equity ROE"} ` +
        (excessReturn.currentRoeBasis === "ttm-rote" || excessReturn.currentRoeBasis === "ttm-common-roe"
          ? `from the trailing four quarters to ${excessReturn.currentRoeAsOf ?? "unavailable"}, opening book at ${excessReturn.asOf ?? "unavailable"} (fiscal-year history to FY ${commonReturns.asOf ?? "unavailable"}); ` +
            "earnings and payout exclude preferred claims; vendor total-equity ROE is not substituted."
          : `from FY ${commonReturns.asOf ?? "unavailable"}; ` +
            `earnings and payout exclude preferred claims. Opening equity is dated ${excessReturn.asOf ?? "unavailable"}; vendor total-equity ROE is not substituted.`),
    );
    if (excessReturn.payoutRatioPct === null && ctx.cashflowAnnual.some(row => row.fieldConflicts?.commonDividendsPaid?.usable === false ||
      (num(row.commonDividendsPaid) === null && num(row.netDividendsPaid) !== null && row.netDividendsPaid !== 0))) {
      const reason = "Common cash dividends are explicitly withheld or cannot be separated from aggregate dividends; insufficient common payout history to value common equity. An explicit refusal cannot be treated as zero, including when aggregate cash is zero. Filed earnings allocations cannot substitute for cash dividends.";
      result.notes.push(reason);
      result.gaps.push({ field: "valuation.excessReturn.commonDividends", reason, severity: "warn" });
    }
  }
  if (dilutedSharesBasis === "annual") {
    result.notes.push(
      `diluted share count from the latest ANNUAL statement (${isoDay(inc0?.date) ?? "?"}) — latest-quarter weightedAverageShsOutDil unavailable, zero, or older than the annual row; per-share values may lag recent buybacks/dilution`,
    );
  }
  if (result.kind === "dcf-suppressed" && route.overlays.includes("unprofitable") && isUnprofitableOverlaySuppression(result)) {
    const trigger = route.notes.find(n => n.startsWith("unprofitable overlay applied:"));
    if (trigger) result.suppressionReason += ` Observed trigger: ${trigger}`;
  }
  if (dilutedShares === null) {
    const refusals = bundle.gaps.filter(g => /^keyless\.income(?:Quarterly|Annual)\.shareBasis$/.test(g.field));
    const upstream = refusals.map(g => g.reason).join("; ");
    if (upstream) for (const gap of result.gaps) if (gap.field === "valuation.dcf.dilutedShares") gap.reason += ` Source share admission: ${upstream}`;
  }
  if (ctx.revenueEligibilityReason) {
    const revenueGap = result.gaps.find(g => g.field === "valuation.dcf.startRevenue");
    if (revenueGap) revenueGap.reason += ` ${ctx.revenueEligibilityReason}`;
  }
  return result;
}

/**
 * Point-in-time net debt (D-60: one net-cash figure). House convention — matching the
 * multiples-EV and invested-capital definitions — is
 * totalDebt minus cash and short-term investments, resolved from the combined
 * field or both explicitly disclosed components. FMP's vendor `netDebt` nets cash ONLY
 * (the statement-field contract: netDebt = totalDebt − cashAndCashEquivalents),
 * so it is retained only as a diagnostic component and never used as a
 * fallback for the house convention.
 */
/**
 * P11 (D-242): whether a suppressed valuation is the unprofitable-overlay suppression. The writer
 * (`valueCompany`) records the cause on the result's own `valuation.dcf` gap beside the same sentence it
 * gives `suppressionReason`; a rewrite that replaces that sentence drops the code (`withoutGapCause`).
 * A result whose `valuation.dcf` gap carries no code (an older writer) is read by `suppressionReason`'s
 * wording, through `@/edgar/refusalCauseRead`.
 */
export const isUnprofitableOverlayGap = (g: ManifestEntry): boolean => g.field === "valuation.dcf" && gapCauseMatches(g, "dcfUnprofitableOverlay");

/** P11 (D-242): the result's unprofitable-overlay suppression gap, which the FIN-OTHER retained suppression rewrites. */
export function isUnprofitableOverlaySuppression(result: { suppressionReason?: string; gaps: readonly ManifestEntry[] }): boolean {
  const coded = result.gaps.find(g => g.field === "valuation.dcf" && g.cause !== undefined);
  return coded !== undefined ? gapCauseMatches(coded, "dcfUnprofitableOverlay")
    : result.suppressionReason !== undefined && gapCauseMatches({ reason: result.suppressionReason }, "dcfUnprofitableOverlay");
}

function netDebtFromBalance(
  bal: FmpBalanceSheetRow | null | undefined,
): NetDebtResolution {
  return resolveNetDebt({
    cashBasis: bal?.cashBasis,
    cashConflictReconciled: bal?.cashConflictReconciled,
    date: bal ? str(bal.date) : null,
    totalDebt: bal ? num(bal.totalDebt) : null,
    capitalLeaseObligations: bal ? num(bal.capitalLeaseObligations) : null,
    operatingLeaseLiability: bal ? num(bal.operatingLeaseLiability) : null,
    financeLeaseLiability: bal ? num(bal.financeLeaseLiability) : null,
    cashAndCashEquivalents: bal ? num(bal.cashAndCashEquivalents) : null,
    shortTermInvestments: bal ? num(bal.shortTermInvestments) : null,
    cashAndShortTermInvestments: bal ? num(bal.cashAndShortTermInvestments) : null,
    marketableEquitySecurities: bal ? num(bal.marketableEquitySecurities) : null,
    vendorNetDebt: bal ? num(bal.vendorNetDebt !== undefined ? bal.vendorNetDebt : bal.netDebt) : null,
    fieldConflicts: bal?.fieldConflicts,
    fieldProvenance: bal?.fieldProvenance,
  });
}

/** D-272: rows have already passed the common-holder admission above; this
 * disclosure adds exact filed-window proof and never changes the valuation payout. */
export function fiscalCashDividendPayout(rows: readonly FmpCashFlowRow[], incomes: readonly FmpIncomeStatementRow[], cutoff: string) {
  return rows.slice(0,3).map(row=>{
    const income=incomes.find(i=>i.date===row.date);
    const dividendProof=row.fieldProvenance?.commonDividendsPaid;
    const incomeField=income?.fieldProvenance?.netIncomeAvailableToCommon ? "netIncomeAvailableToCommon" as const : "netIncome" as const;
    const incomeProof=income?.fieldProvenance?.[incomeField];
    const start=dividendProof?.periodStart ?? null, end=isoDay(row.date);
    const proofs=[dividendProof,incomeProof];
    // P5/P13: the income operand is the admitted common earnings on the payout row, and it must equal the
    // proven field of the income row; a parent or consolidated figure the common-income owner withheld never stands in.
    const admittedIncome=num(row.netIncome), provenIncome=num(income?.[incomeField]);
    const commonIncome=admittedIncome!==null && admittedIncome===provenIncome ? admittedIncome : null, cash=num(row.commonDividendsPaid);
    // P7/P13 (D-272): both operands must be read from one filing (a shared accession).
    const oneFiling=!!dividendProof && !!incomeProof && dividendProof.filings.some(d=>incomeProof.filings.some(i=>i.accn===d.accn));
    const reason=!start || !end || !incomeProof?.periodStart || start!==incomeProof.periodStart || end!==incomeProof.periodEnd || end!==dividendProof?.periodEnd
      ? "Exact matching filed fiscal-year windows for common dividends and common income are not established."
      : proofs.some(p=>!p || p.unit!==dividendProof!.unit || p.filings.length===0 || p.filings.some(f=>f.filed>cutoff) || p.observedAt.slice(0,10)>cutoff)
      ? "Compatible filed currency and cutoff evidence for both payout operands is missing."
      : !oneFiling ? "Common dividends and common income are not established from one filing."
      : commonIncomeFlowRefusal(income ? commonFlowScope(income,incomeField,"annual") : undefined,commonFlowScope(row,"commonDividendsPaid","annual"))!==null || income?.fieldConflicts?.netIncome?.usable===false || income?.fieldConflicts?.netIncomeAvailableToCommon?.usable===false || row.fieldConflicts?.commonDividendsPaid?.usable===false || commonIncome===null || commonIncome<=0 || cash===null || cash>0
      ? "Admitted common cash dividends or positive income available to common is unavailable." : null;
    const source=proofs.flatMap(p=>p ? p.filings.map(f=>`${f.form} ${f.accn} filed ${f.filed}; ${p.tags.join(", ")}`) : []).join("; ");
    const dates=proofs.flatMap(p=>p?.filings.map(f=>f.filed) ?? []).sort();
    return {value:reason===null ? Math.abs(cash!)/commonIncome!*100 : null,dividends:reason===null ? Math.abs(cash!) : null,commonIncome:reason===null ? commonIncome : null,
      start,end,source,asOf:dates.at(-1) ?? null,currency:dividendProof?.unit ?? null,reason};
  });
}

export function payoutRatioPct3y(cashflowAnnual: FmpCashFlowRow[]): number | null {
  const ratios: number[] = [];
  for (const r of cashflowAnnual.slice(0, 3)) {
    if (["commonDividendsPaid", "commonStockRepurchased", "commonStockIssuance"].some(field => r.fieldConflicts?.[field]?.usable === false)) continue;
    const ni = num(r.netIncome);
    if (ni === null || ni <= 0) continue;
    const div = num(r.commonDividendsPaid);
    const rep = num(r.commonStockRepurchased);
    if (div === null && rep === null) continue;
    const iss = num(r.commonStockIssuance) ?? 0;
    const distributed = -(div ?? 0) - (rep ?? 0) - iss;
    ratios.push((distributed / ni) * 100);
  }
  if (ratios.length < 2) return null;
  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  return Math.min(100, Math.max(0, avg));
}

/** Merge quarterly income + cash-flow + balance by matching fiscal-period date. */
function mergeQuarterly(
  income: FmpIncomeStatementRow[],
  cashflow: FmpCashFlowRow[],
  balance: FmpBalanceSheetRow[],
  admissionAsOf?: string,
  cashEvidence: readonly FmpCashFlowRow[] = cashflow,
): QuarterlyFundamentalsRow[] {
  const cfByDate = new Map<string, FmpCashFlowRow>();
  for (const r of cashflow) cfByDate.set(String(r.date ?? ""), r);
  const balByDate = new Map<string, FmpBalanceSheetRow>();
  for (const r of balance) balByDate.set(String(r.date ?? ""), r);

  return income.map((i) => {
    const d = String(i.date ?? "");
    const cf = matchByDate(cfByDate, d);
    const bal = matchByDate(balByDate, d);
    return {
      ...commonIncomeEvidence(i, "quarter", admissionAsOf),
      date: d,
      acceptedDate: i.acceptedDate,
      filingDate: i.filingDate,
      revenue: num(i.revenue),
      operatingIncome: operatingIncomeForNonMargins(i),
      depreciationAndAmortization: num(i.depreciationAndAmortization) ?? (cf ? num(cf.depreciationAndAmortization) : null),
      // Kept separate: the REIT FFO history must use the same D&A basis as the
      // current ffoApprox, which reads the income statement only.
      incomeDepreciationAndAmortization: num(i.depreciationAndAmortization),
      netIncome: num(i.netIncome),
      epsDiluted: num(i.epsDiluted),
      ...(i.epsSecurityBasis === "quoted" ? { epsSecurityBasis: "quoted" as const } : {}),
      netIncomeAvailableToCommon: num(i.netIncomeAvailableToCommon),
      // Nearby cash is exposure evidence only, never an earnings allocation.
      preferredDividendsPaid: cf ? num(cf.preferredDividendsPaid) : null,
      preferredCashScope: cf ? commonFlowScope(cf, "preferredDividendsPaid", "quarter") : undefined,
      preferredClaimsInPeriod: preferredClaimsInFlow(commonFlowScope(i, "netIncome", "quarter"), balance, cashEvidence),
      operatingCashFlow: cf ? num(cf.operatingCashFlow) : null,
      capitalExpenditure: cf ? num(cf.capitalExpenditure) : null,
      totalStockholdersEquity: statementParentEquity(bal),
      totalEquity: bal ? num(bal.totalEquity) : null,
      equityOwnershipBasis: statementEquityOwnershipBasis(bal),
      // House-EV components, so own-history EV matches the current definition.
      fieldProvenance: bal?.fieldProvenance,
      shortTermDebt: bal ? num(bal.shortTermDebt) : null,
      longTermDebt: bal ? num(bal.longTermDebt) : null,
      totalDebt: bal ? num(bal.totalDebt) : null,
      cashAndCashEquivalents: bal ? num(bal.cashAndCashEquivalents) : null,
      shortTermInvestments: bal ? num(bal.shortTermInvestments) : null,
      capitalLeaseObligations: bal ? num(bal.capitalLeaseObligations) : null,
      financeLeaseLiability: bal ? num(bal.financeLeaseLiability) : null,
      // D-65: each quarter's own filed equity securities, so its EV nets the D-60 cash.
      marketableEquitySecurities: bal ? num(bal.marketableEquitySecurities) : null,
      cashAndShortTermInvestments: bal ? num(bal.cashAndShortTermInvestments) : null,
      preferredStock: bal ? num(bal.preferredStock) : null,
      preferredCapitalWithheldReason: bal?.preferredCapitalWithheldReason,
      preferredCapitalBasis: bal?.preferredCapitalBasis,
      minorityInterest: bal ? num(bal.minorityInterest) : null,
      // D-135: each quarter's own redeemable claims, so the own-history EV and the P/FCF guard read them.
      ...(bal ? temporaryEquityOperands(bal) : {}),
      // D-19: the lease slice too, so a lease-adjusted current
      // EV is ranked against a lease-adjusted history.
      operatingLeaseLiability: bal ? num(bal.operatingLeaseLiability) : null,
    };
  });
}
