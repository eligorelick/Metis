/**
 * Stage B — route metrics for financial companies (WS5, D-17).
 *
 * PURE, deterministic TypeScript: no network, no db, no LLM. Reads the
 * bundle's EDGAR companyfacts READ-ONLY for the line items a financial
 * statement carries but a vendor income statement does not (noninterest
 * expense, premiums earned, incurred claims, interest expense on deposits),
 * and takes ordinary FMP-shaped balance/income rows for the generic figures.
 *
 * The metric lists in `BASE_POLICIES.lead` named NIM, the efficiency ratio,
 * the combined ratio, book value per share, the net interest spread and
 * leverage for years while nothing computed any of them, so a bank report led
 * with metrics it did not have. This module computes each one where the filer's
 * tags allow it and WITHHOLDS it with a stated reason otherwise — it never
 * approximates a named metric under that name.
 *
 * Two rules the module keeps throughout:
 *
 * 1. A named metric is computed only from the figures its definition calls for.
 *    A true net interest margin divides net interest income by average EARNING
 *    assets; us-gaap has no standard earning-assets concept, and total assets
 *    (which include premises, goodwill and other non-earning items) would
 *    overstate the denominator and understate the margin. So `nim` is withheld
 *    unless the filer tags earning assets, and the honest denominator that IS
 *    available is published beside it under its own name,
 *    `niiToAverageAssets` — never as NIM.
 *
 * 2. A proxy is labeled a proxy. CET1 is a risk-weighted regulatory ratio;
 *    tangible common equity over tangible assets is shown as
 *    `tangibleLeverage` with the difference stated (marked a proxy when no
 *    CET1 is tagged). It is a leverage ratio, not a capital-adequacy ratio, and
 *    the report says so. Since D-46 it is always computed, because it is the
 *    capital input of the bank balance-sheet grade; CET1 is display-only.
 *
 * Every value carries the tags that produced it, its formula and its as-of
 * date; every withheld value carries the reason, which reaches the notes and
 * the missing-data manifest.
 */

import { getConcept, type ChainStep, type CompanyFacts } from "@/edgar/xbrl";
import { belowComponentFloor } from "@/edgar/synonymFloor";
import { DEPRECIATION_COMPONENT_TAGS, tagFloorsFor } from "@/edgar/tagSynonyms";
import { shareCountOnBasis, type StockSplits } from "@/edgar/splits";
import { tangibleCommonEquity } from "@/pipeline/stageB/returns";
import type { FetchResult, ManifestEntry, SectorRoute } from "@/types/core";

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

export type RouteMetricUnit = "%" | "x" | "currency" | "currency/share";

/** One route metric: a value with its provenance, or a withholding with its reason. */
export interface RouteMetric {
  /** Stable id, matching the `lead` ids in the routing metric policy. */
  key: string;
  /** Display name exactly as the report should render it. */
  label: string;
  value: number | null;
  unit: RouteMetricUnit;
  /** ISO currency of a money metric, from the fact or statement it was read from; null when unknown. */
  currency?: string | null;
  /** Formula and the inputs that produced it (or would have). */
  basis: string;
  /** Source paths for every input, e.g. "edgar:companyfacts us-gaap/Deposits". */
  sources: string[];
  /** Period end the figure is measured at. */
  asOf: string | null;
  /** Non-null when the metric was withheld; the reason reaches the manifest. */
  withheldReason: string | null;
  /**
   * True when the figure is a deliberate stand-in for a metric the filer does
   * not tag (e.g. tangible leverage where CET1 is unavailable). Proxies are
   * always published under their OWN name, never the name they stand in for.
   */
  proxy: boolean;
}

export interface FinancialMetricsResult {
  route: SectorRoute;
  metrics: RouteMetric[];
  /** Bank warning signs that could be evaluated (D-47). Bank route only; absent elsewhere and on stored results. */
  flags?: BankRiskFlag[];
  notes: string[];
  gaps: ManifestEntry[];
  /** Newest period end any metric was measured at. */
  asOf: string | null;
}

/** Balance-sheet slice (FMP field names; the same rows Stage B already builds). */
export interface FinancialMetricsBalanceRow {
  date: string;
  /** The statement row's own reportedCurrency. */
  reportedCurrency?: string | null;
  totalAssets?: number | null;
  totalStockholdersEquity?: number | null;
  totalEquity?: number | null;
  goodwill?: number | null;
  intangibleAssets?: number | null;
  preferredStock?: number | null;
}

/** Income slice (FMP field names). */
export interface FinancialMetricsIncomeRow {
  date: string;
  reportedCurrency?: string | null;
  revenue?: number | null;
  netIncome?: number | null;
  interestIncome?: number | null;
  interestExpense?: number | null;
  netInterestIncome?: number | null;
}

export interface FinancialMetricsInputs {
  /** EDGAR companyfacts, read-only. Null/failed ⇒ tag-level metrics withheld. */
  companyFacts: FetchResult<CompanyFacts> | null | undefined;
  /** Annual balance rows, NEWEST FIRST (index 1 supplies the prior balance for averages). */
  balance: readonly FinancialMetricsBalanceRow[];
  /** Annual income rows, NEWEST FIRST. */
  income: readonly FinancialMetricsIncomeRow[];
  /** Share count for per-share metrics (diluted or outstanding). */
  shares?: number | null;
  /** What `shares` is, for the basis string. */
  sharesBasis?: string | null;
  /**
   * The split resolution the statements were built with (the bundle's
   * `edgar.shareBasis`). A period-end share count read straight from
   * companyfacts is AS FILED; it is used only when this puts it on the basis of
   * `basisDay`. Absent or null ⇒ its basis is unestablished and it is not used.
   */
  shareBasis?: { splits: StockSplits; basisDay: string } | null;
}

// ---------------------------------------------------------------------------
// Tag chains. Each entry lists the us-gaap elements that carry one figure,
// most specific first. Exported so the tests pin the vocabulary.
// ---------------------------------------------------------------------------

export const NET_INTEREST_INCOME_TAGS = ["InterestIncomeExpenseNet"] as const;
export const NONINTEREST_INCOME_TAGS = ["NoninterestIncome"] as const;
export const NONINTEREST_EXPENSE_TAGS = ["NoninterestExpense"] as const;
/**
 * Average earning assets. us-gaap carries no standard concept for these; the
 * few filers that tag one use these elements. When none resolves, NIM is
 * withheld rather than computed on total assets.
 */
export const EARNING_ASSETS_TAGS = [
  "InterestEarningAssets",
  "AverageEarningAssets",
  "InterestBearingAssets",
] as const;
/**
 * Total loans, gross of the allowance first: the FDIC Quarterly Banking Profile
 * coverage and net charge-off rates divide by gross loans, and ACL / net loans
 * would divide the allowance by loans it was already taken out of (review of
 * D-46/D-47, 2026-10-13). Net loans are the fallback; the basis names the tag.
 */
export const LOANS_TAGS = [
  "FinancingReceivableExcludingAccruedInterestBeforeAllowanceForCreditLoss",
  "LoansAndLeasesReceivableGrossCarryingAmount",
  "LoansAndLeasesReceivableNetReportedAmount",
  "FinancingReceivableExcludingAccruedInterestAfterAllowanceForCreditLoss",
] as const;
export const NONACCRUAL_LOAN_TAGS = [
  "FinancingReceivableExcludingAccruedInterestNonaccrualStatus",
  "FinancingReceivableRecordedInvestmentNonaccrualStatus",
  "LoansAndLeasesReceivableNonaccrualStatus",
  "FinancingReceivableExcludingAccruedInterestNonaccrualStatusWithAllowanceForCreditLoss",
] as const;
export const PROVISION_TAGS = [
  "ProvisionForLoanLeaseAndOtherLosses",
  "ProvisionForLoanLossesExpensed",
  "ProvisionForCreditLossExpenseReversal",
  "ProvisionForLoanAndLeaseLosses",
] as const;
/**
 * Net charge-offs (D-46): the after-recovery element where tagged, else one of
 * the write-off / recovery pairs below, both halves from the same family. The
 * second pair is the pre-CECL-named family some filers (Citigroup) still use.
 */
export const NET_CHARGE_OFF_TAGS = [
  "FinancingReceivableExcludingAccruedInterestAllowanceForCreditLossWriteoffAfterRecovery",
] as const;
export const CHARGE_OFF_RECOVERY_PAIRS = [
  [
    "FinancingReceivableExcludingAccruedInterestAllowanceForCreditLossWriteoff",
    "FinancingReceivableExcludingAccruedInterestAllowanceForCreditLossRecovery",
  ],
  ["FinancingReceivableAllowanceForCreditLossesWriteOffs", "FinancingReceivableAllowanceForCreditLossesRecovery"],
] as const;
/**
 * Audit 2026-10-22 C-13: recoveries tagged only on the cash-flow statement
 * (Capital One, whose roll-forward recovery total is a dimensional fact). They
 * pair with a write-off total of the same fiscal year and filing only.
 */
export const CASH_FLOW_RECOVERY_TAG = "ProceedsFromRecoveriesOfLoanPreviouslyChargedOff";
export const DEPOSITS_TAGS = ["Deposits"] as const;
/**
 * Held-to-maturity securities (D-47). The unrecognised holding loss and gain
 * are the direct pair; amortised cost less fair value at the same instant is
 * the fallback. Both pairs must be measured at one date.
 */
export const HTM_UNREALIZED_LOSS_TAGS = ["HeldToMaturitySecuritiesAccumulatedUnrecognizedHoldingLoss"] as const;
export const HTM_UNREALIZED_GAIN_TAGS = ["HeldToMaturitySecuritiesAccumulatedUnrecognizedHoldingGain"] as const;
export const HTM_AMORTIZED_COST_TAGS = [
  "DebtSecuritiesHeldToMaturityExcludingAccruedInterestBeforeAllowanceForCreditLoss",
  "HeldToMaturitySecurities",
] as const;
export const HTM_FAIR_VALUE_TAGS = ["HeldToMaturitySecuritiesFairValue"] as const;
export const ALLOWANCE_FOR_CREDIT_LOSS_TAGS = [
  "FinancingReceivableAllowanceForCreditLossExcludingAccruedInterest",
  "LoansAndLeasesReceivableAllowance",
] as const;
/**
 * The tax rate the after-tax HTM loss assumes: the US federal statutory
 * corporate rate. An assumption, stated as one — state taxes and the bank's
 * own deferred-tax position are not modelled.
 */
export const HTM_LOSS_TAX_RATE_PCT = 21;

/**
 * Bank warning-sign thresholds (D-47). Heuristic thresholds, not validated:
 * each marks a pattern for a reader to investigate, never a score.
 */
export const BANK_FLAG_THRESHOLDS = {
  tangibleLeverageBelowPct: 5,
  htmLossToTceAbovePct: 25,
  markedTceRatioBelowPct: 4,
  loanCagr3yAbovePct: 15,
  loansToDepositsAbovePct: 110,
  provisionsToNcoBelowX: 1,
} as const;

/** One evaluated bank warning sign (D-47). Disclosed, never graded. */
export interface BankRiskFlag {
  key: string;
  /** Plain description of the condition, digit-free. */
  label: string;
  /** The route metric the value is read from, when there is one. */
  metricKey: string | null;
  value: number;
  unit: RouteMetricUnit;
  threshold: number;
  direction: "below" | "above";
  triggered: boolean;
  /** How to read it; digit-free, so the analysts can repeat it without an uncited number. */
  caveat: string;
  asOf: string | null;
}
export const INTEREST_EXPENSE_DEPOSITS_TAGS = [
  "InterestExpenseDeposits",
  "InterestExpenseDomesticDeposits",
] as const;
export const CET1_TAGS = [
  "CommonEquityTierOneCapitalToRiskWeightedAssets",
  "TierOneCommonCapitalToRiskWeightedAssets",
  "BankingRegulatoryCommonEquityTierOneRiskBasedCapitalToRiskWeightedAssets",
] as const;

export const PREMIUMS_EARNED_TAGS = [
  "PremiumsEarnedNet",
  "PremiumsEarnedNetPropertyAndCasualty",
  "PremiumsEarnedNetLife",
] as const;
export const INCURRED_CLAIMS_TAGS = [
  "PolicyholderBenefitsAndClaimsIncurredNet",
  "PolicyholderBenefitsAndClaimsIncurredHealthCare",
  "LiabilityForClaimsAndClaimsAdjustmentExpenseIncurredClaims",
] as const;
/**
 * The two components a GAAP underwriting-expense figure is made of. BOTH are
 * required before an expense ratio is published — see `insurerMetrics`.
 *
 * `InsuranceCommissionsAndFees` used to sit here and does not belong: it is a
 * credit-balance REVENUE element (commission and fee income an insurer earns),
 * so adding it inflated both the expense ratio and the combined ratio. us-gaap
 * carries no unambiguous single underwriting-expense total to fall back on, so
 * there is no third "total" element in this list.
 */
export const UNDERWRITING_EXPENSE_TAGS = [
  "OtherUnderwritingExpense",
  "DeferredPolicyAcquisitionCostAmortizationExpense",
] as const;
export const PRIOR_YEAR_DEVELOPMENT_TAGS = [
  "LiabilityForUnpaidClaimsAndClaimsAdjustmentExpenseIncurredClaimsPriorYears",
  "LiabilityForClaimsAndClaimsAdjustmentExpenseIncurredClaimsPriorYears",
] as const;

export const REPO_FUNDING_TAGS = ["SecuritiesSoldUnderAgreementsToRepurchase"] as const;
export const INTEREST_INCOME_OPERATING_TAGS = [
  "InterestAndDividendIncomeOperating",
  "InterestIncomeOperating",
  "InterestAndFeeIncomeLoansAndLeases",
] as const;
export const INTEREST_EXPENSE_TAGS = [
  "InterestExpense",
  "InterestExpenseBorrowings",
  "InterestExpenseDebt",
] as const;

/** NAREIT FFO components (criterion e). */
export const REAL_ESTATE_DEPRECIATION_TAGS = [
  "RealEstateInvestmentPropertyAccumulatedDepreciationPeriodIncreaseDecrease",
  "DepreciationAndAmortizationRealEstate",
  "RealEstateDepreciation",
] as const;
/**
 * Gains on property sales, which NAREIT subtracts from net income.
 * `GainsLossesOnSalesOfInvestmentRealEstate` is the element most equity REITs
 * use and was missing, so a REIT with a 300m disposition gain had FFO
 * overstated by that amount while the note said only "none tagged; treated as
 * zero". `GainLossOnDispositionOfAssets1` is gone: it covers disposals of any
 * asset, and NAREIT excludes gains on sales of DEPRECIABLE REAL ESTATE, not
 * gains on selling a subsidiary or a piece of equipment.
 */
export const PROPERTY_SALE_GAIN_TAGS = [
  "GainLossOnSaleOfPropertiesNetOfApplicableIncomeTaxes",
  "GainLossOnSaleOfProperties",
  "GainsLossesOnSalesOfInvestmentRealEstate",
  "GainLossOnSaleOfRealEstate",
] as const;
/**
 * Impairments NAREIT adds back: those attributable to DEPRECIABLE REAL ESTATE.
 * A goodwill or securities write-down is not one of them, which is why
 * `AssetImpairmentCharges` is no longer chained in here and
 * `ImpairmentOfInvestments` is gone entirely.
 */
export const REAL_ESTATE_IMPAIRMENT_TAGS = ["ImpairmentOfRealEstate"] as const;
/**
 * The generic charge, used only as a labeled stand-in when the real-estate
 * element is untagged — it may carry goodwill or other non-real-estate
 * write-downs, so adding it back puts FFO at or ABOVE the definition, the same
 * direction the total-D&A stand-in errs in (the stand-in is the filer's total,
 * never a combined tag below its own Depreciation or amortization, FIN-510-V2).
 */
export const GENERIC_IMPAIRMENT_TAGS = ["AssetImpairmentCharges"] as const;
export const STRAIGHT_LINE_RENT_TAGS = [
  "StraightLineRent",
  "AmortizationOfDeferredLeasingFeesAndStraightLineRent",
] as const;
/**
 * Recurring (maintenance) capital expenditure only. `PaymentsToDevelopRealEstateAssets`
 * is the cash outflow to DEVELOP real estate — growth spending — and was
 * subtracted here under the recurring label with the result marked exact; a
 * developer REIT's AFFO was understated by its whole pipeline. A filer that
 * tags development but no recurring element falls to the all-capex approximation
 * below; unreconciled FFO and issuer-specific adjustments prevent a guaranteed bound.
 */
export const RECURRING_CAPEX_TAGS = ["PaymentsForCapitalImprovements"] as const;
/** Combined D&A tags, tried in order; each is checked against its own filed components (FIN-510-V2). */
export const DEPRECIATION_AMORTIZATION_TAGS = [
  "DepreciationDepletionAndAmortization",
  "DepreciationAndAmortization",
] as const;
export const NET_INCOME_TAGS = ["NetIncomeLoss", "ProfitLoss"] as const;
/**
 * Period-END common shares outstanding — the count book value per share must be
 * divided by, because the equity in the numerator is a period-end balance. The
 * weighted-average DILUTED count the statements carry is an average over the
 * year, so for a REIT running a continuous at-the-market programme it is below
 * the closing count and overstates book value per share by a few percent.
 */
export const SHARES_OUTSTANDING_TAGS = ["CommonStockSharesOutstanding"] as const;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const isNum = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

const pos = (v: number | null | undefined): number | null => (isNum(v) && v > 0 ? v : null);

function tagPath(tag: string): string {
  return `edgar:companyfacts us-gaap/${tag}`;
}

interface TagHit {
  value: number;
  /** The XBRL fact's unit (an ISO code for monetary facts). */
  unit: string;
  tag: string;
  /** Period start of a duration fact; undefined for an instant. */
  start?: string;
  end: string;
  /** Filing date of the winning fact. */
  filed: string;
  /** Accession of the winning fact. */
  accn?: string;
  sourcePath: string;
}

/** Resolve the first tag in `tags` carrying a fact for the period, or null. */
function resolveTag(
  facts: CompanyFacts | null,
  tags: readonly string[],
  period: { end: string; durationHint?: "FY" | "Q" },
): TagHit | null {
  if (facts === null) return null;
  const chain: ChainStep[] = tags.map((tag) => ({ kind: "tag", tag }));
  const r = getConcept(facts, chain, { period });
  if (!r.ok) return null;
  const v = r.value.data;
  return { value: v.value, unit: v.unit, tag: v.tag, start: v.period.start, end: v.period.end, filed: v.filed, accn: v.accn, sourcePath: tagPath(v.tag) };
}

/**
 * The first combined D&A tag that is not below the same period's `Depreciation`
 * or `AmortizationOfIntangibleAssets` (same predicate and rounding allowance as
 * the statement builder's component floor, audit 2026-10-27 FIN-510-V2): a
 * combined tag below a component the total contains is a subset line, not the
 * filer's total D&A. Null when none passes.
 */
function totalDaNotBelowComponents(
  facts: CompanyFacts | null,
  period: { end: string; durationHint?: "FY" | "Q" },
): TagHit | null {
  for (const tag of DEPRECIATION_AMORTIZATION_TAGS) {
    const hit = resolveTag(facts, [tag], period);
    if (hit === null) continue;
    const floorTags = [...DEPRECIATION_COMPONENT_TAGS, ...(tagFloorsFor("depreciationAndAmortization")[tag] ?? [])];
    const components = floorTags.flatMap((componentTag) => {
      const c = resolveTag(facts, [componentTag], period);
      return c !== null && c.unit === hit.unit && c.value > 0 ? [{ tag: componentTag, value: c.value }] : [];
    });
    if (belowComponentFloor(hit.value, components) === null) return hit;
  }
  return null;
}

/** An ISO-4217 code, or null: the currency a money metric is stated in. */
function isoCode(value: unknown): string | null {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/** Compatibility of monetary operands, not a currency conversion or semantic certification. */
function operandConflict(hits: readonly TagHit[], currencies: readonly (string | null | undefined)[] = []): string | null {
  const money = hits.filter(h => ![...CET1_TAGS, ...SHARES_OUTSTANDING_TAGS].some(tag => tag === h.tag));
  if (money.some(h => isoCode(h.unit) === null)) return "nonmonetary unit on a monetary operand — derived value withheld";
  const units = new Set([...money.map(h=>isoCode(h.unit)), ...currencies.map(isoCode)].filter((v):v is string=>v!==null));
  if (units.has("XXX") || units.has("UNK") || units.size > 1) return "monetary units/currencies are incompatible — derived value withheld";
  const durations = hits.filter(h=>h.start!==undefined);
  if (durations.some(h=>h.start!==durations[0]?.start || h.end!==durations[0]?.end)) return "flow periods have different starts or ends — derived value withheld";
  return null;
}

function adjacentBalance(current: FinancialMetricsBalanceRow | undefined, prior: FinancialMetricsBalanceRow | undefined): FinancialMetricsBalanceRow | undefined {
  if (!current || !prior) return undefined;
  const days=(Date.parse(current.date)-Date.parse(prior.date))/86400000;
  return Number.isFinite(days) && days>=364 && days<=371 ? prior : undefined;
}

/** Recheck the cited operands before a route value or warning becomes consumable. */
function metricConflict(m:RouteMetric,facts:CompanyFacts|null,inputs:FinancialMetricsInputs):string|null {
  if(m.value===null || m.asOf===null)return null;
  if (m.sources.some(s => s.startsWith("statements:income")) && inputs.income[0]?.date !== m.asOf) return "income and metric balance periods differ — derived value withheld";
  const actual = metricOperands.get(m);
  if (actual) return operandConflict(actual.hits, actual.currencies);
  const hits=m.sources.flatMap(source=>{
    const tag=/us-gaap\/([A-Za-z0-9_]+)/.exec(source)?.[1];
    const hit=tag?resolveTag(facts,[tag],{end:m.asOf!,durationHint:"FY"})??resolveTag(facts,[tag],{end:m.asOf!}):null;
    return hit ? [hit] : [];
  });
  const currencies:string[]=[];
  if(m.sources.some(s=>s.startsWith("statements:balance"))){
    const currency=inputs.balance.find(r=>r.date===m.asOf)?.reportedCurrency;
    if(currency)currencies.push(currency);
  }
  if(m.sources.some(s=>s.startsWith("statements:income"))){
    if(inputs.income[0]?.date!==m.asOf)return "income and metric balance periods differ — derived value withheld";
    const currency=inputs.income.find(r=>r.date===m.asOf)?.reportedCurrency;
    if(currency && m.sources.some(s=>s.startsWith("statements:income") && !s.includes("weightedAverageShs")))currencies.push(currency);
  }
  return operandConflict(hits,currencies);
}

/** Sum every tag in `tags` that resolves; null when none does. */
function resolveSum(
  facts: CompanyFacts | null,
  tags: readonly string[],
  period: { end: string; durationHint?: "FY" | "Q" },
): { value: number; hits: TagHit[] } | null {
  if (facts === null) return null;
  const hits: TagHit[] = [];
  for (const tag of tags) {
    const hit = resolveTag(facts, [tag], period);
    if (hit !== null) hits.push(hit);
  }
  if (hits.length === 0) return null;
  return { value: hits.reduce((s, h) => s + h.value, 0), hits };
}

interface MetricOperands { hits: readonly TagHit[]; currencies?: readonly (string | null | undefined)[] }
interface StatementHit { value: number; tag: string; end: string; sourcePath: string }
function actualTagHits(hits: readonly (TagHit | StatementHit | null)[]): TagHit[] {
  return hits.filter((h): h is TagHit => h !== null && "unit" in h);
}
// Retain exact calculation operands internally; rendered formulas are not an evidence index.
const metricOperands = new WeakMap<RouteMetric, MetricOperands>();
function metric(init: Partial<RouteMetric> & Pick<RouteMetric, "key" | "label" | "unit">, operands?: MetricOperands): RouteMetric {
  const result: RouteMetric = {
    value: null,
    basis: "",
    sources: [],
    asOf: null,
    withheldReason: null,
    proxy: false,
    ...init,
  };
  if (operands) metricOperands.set(result, operands);
  return result;
}

/** A withheld metric: value null, reason stated. */
function withheld(
  key: string,
  label: string,
  unit: RouteMetricUnit,
  reason: string,
  basis: string,
  sources: string[] = [],
): RouteMetric {
  return metric({ key, label, unit, withheldReason: reason, basis, sources });
}

/** Average of a current and prior balance; falls back to the single point. */
function average(current: number | null, prior: number | null): { value: number | null; basis: string } {
  if (current === null) return { value: null, basis: "no current balance" };
  if (prior === null) return { value: current, basis: "single period-end balance (no prior year on file)" };
  return { value: (current + prior) / 2, basis: "average of the current and prior period-end balances" };
}

/**
 * Tangible common equity and tangible assets for the leverage stand-in.
 *
 * The equity half is `tangibleCommonEquity` from the returns module — the same
 * definition ROTE is computed on. Re-deriving it here would let the two drift
 * apart, and a P/TBV read against a ROTE on a different denominator is exactly
 * the mistake the pairing exists to avoid.
 */
function tangible(row: FinancialMetricsBalanceRow | undefined): {
  equity: number | null;
  assets: number | null;
} {
  if (row === undefined) return { equity: null, assets: null };
  const goodwill = isNum(row.goodwill) ? row.goodwill : 0;
  const intangibles = isNum(row.intangibleAssets) ? row.intangibleAssets : 0;
  const assetsRaw = isNum(row.totalAssets) ? row.totalAssets : null;
  return {
    equity: tangibleCommonEquity(row),
    assets: assetsRaw === null ? null : assetsRaw - goodwill - intangibles,
  };
}

// ---------------------------------------------------------------------------
// Bank metrics
// ---------------------------------------------------------------------------

function bankMetrics(
  facts: CompanyFacts | null,
  inputs: FinancialMetricsInputs,
  factsReason: string | null,
): { metrics: RouteMetric[]; flags: BankRiskFlag[] } {
  const out: RouteMetric[] = [];
  const bal0 = inputs.balance[0];
  const bal1 = adjacentBalance(bal0, inputs.balance[1]);
  const inc0 = inputs.income[0];
  const end = bal0?.date ?? inc0?.date ?? null;
  const flow = end === null ? null : { end, durationHint: "FY" as const };
  const instant = end === null ? null : { end };
  const priorInstant = bal1 === undefined ? null : { end: bal1.date };
  const noPeriod = "no annual statement period available — metric not computed";
  const noFacts = factsReason ?? "EDGAR companyfacts unavailable — XBRL line items could not be read";

  // --- net interest income (the numerator several metrics share)
  const nii =
    flow === null
      ? null
      : (resolveTag(facts, NET_INTEREST_INCOME_TAGS, flow) ??
        (isNum(inc0?.netInterestIncome)
          ? { value: inc0.netInterestIncome, tag: "netInterestIncome", end: inc0.date, sourcePath: "statements:income.netInterestIncome" }
          : null));

  // --- NIM: only on EARNING assets, never on total assets.
  const earning = instant === null ? null : resolveTag(facts, EARNING_ASSETS_TAGS, instant);
  const earningPrior = priorInstant === null ? null : resolveTag(facts, EARNING_ASSETS_TAGS, priorInstant);
  if (nii !== null && earning !== null) {
    const avg = average(earning.value, earningPrior?.value ?? null);
    const denom = pos(avg.value);
    out.push(
      denom === null
        ? withheld(
            "nim",
            "net interest margin",
            "%",
            "average earning assets are not positive — margin not computable",
            "net interest income / average earning assets",
            [nii.sourcePath, earning.sourcePath],
          )
        : metric({
            key: "nim",
            label: "net interest margin",
            unit: "%",
            value: (nii.value / denom) * 100,
            basis: `net interest income ${nii.value} / average earning assets ${denom} (${avg.basis}) × 100`,
            sources: [nii.sourcePath, earning.sourcePath, ...(earningPrior ? [earningPrior.sourcePath] : [])],
            asOf: end,
          }, { hits: actualTagHits([nii, earning, earningPrior]), currencies: ["unit" in nii ? undefined : inc0?.reportedCurrency] }),
    );
  } else {
    out.push(
      withheld(
        "nim",
        "net interest margin",
        "%",
        nii === null
          ? `net interest income unavailable (${flow === null ? noPeriod : `no ${NET_INTEREST_INCOME_TAGS.join("/")} fact for ${end}`}) — NIM not computed`
          : "the filer tags no earning-assets element (us-gaap has no standard average-earning-assets concept), and total assets include premises, goodwill and other non-earning items — dividing by them would understate the margin, so NIM is withheld and net interest income / average TOTAL assets is published under its own name instead",
        "net interest income / average EARNING assets",
        [...(nii ? [nii.sourcePath] : []), ...EARNING_ASSETS_TAGS.map(tagPath)],
      ),
    );
    // The honest denominator that IS available, under its own name.
    const avgAssets = average(
      isNum(bal0?.totalAssets) ? bal0.totalAssets : null,
      isNum(bal1?.totalAssets) ? bal1.totalAssets : null,
    );
    const denom = pos(avgAssets.value);
    out.push(
      nii !== null && denom !== null
        ? metric({
            key: "niiToAverageAssets",
            label: "net interest income / average total assets",
            unit: "%",
            value: (nii.value / denom) * 100,
            basis:
              `net interest income ${nii.value} / average TOTAL assets ${denom} (${avgAssets.basis}) × 100. ` +
              "NOT the net interest margin: the denominator includes non-earning assets, so this figure sits BELOW a true NIM.",
            sources: [nii.sourcePath, "statements:balance.totalAssets"],
            asOf: end,
            proxy: true,
          }, { hits: actualTagHits([nii]), currencies: ["unit" in nii ? undefined : inc0?.reportedCurrency, bal0?.reportedCurrency, ...(isNum(bal1?.totalAssets) ? [bal1?.reportedCurrency] : [])] })
        : withheld(
            "niiToAverageAssets",
            "net interest income / average total assets",
            "%",
            nii === null ? "net interest income unavailable" : "total assets unavailable or not positive",
            "net interest income / average total assets",
            [...(nii ? [nii.sourcePath] : []), "statements:balance.totalAssets"],
          ),
    );
  }

  // --- efficiency ratio = noninterest expense / (net interest income + noninterest income)
  const nonIntExp = flow === null ? null : resolveTag(facts, NONINTEREST_EXPENSE_TAGS, flow);
  const nonIntInc = flow === null ? null : resolveTag(facts, NONINTEREST_INCOME_TAGS, flow);
  if (nonIntExp !== null && nonIntInc !== null && nii !== null) {
    const revenue = nii.value + nonIntInc.value;
    out.push(
      pos(revenue) === null
        ? withheld(
            "efficiencyRatio",
            "efficiency ratio",
            "%",
            "net interest income plus noninterest income is not positive — ratio not meaningful",
            "noninterest expense / (net interest income + noninterest income)",
            [nonIntExp.sourcePath, nii.sourcePath, nonIntInc.sourcePath],
          )
        : metric({
            key: "efficiencyRatio",
            label: "efficiency ratio",
            unit: "%",
            value: (nonIntExp.value / revenue) * 100,
            basis:
              `noninterest expense ${nonIntExp.value} / (net interest income ${nii.value} + noninterest income ` +
              `${nonIntInc.value} = ${revenue}) × 100 — lower is better; revenue is net of interest expense, the ` +
              "denominator banks report it on",
            sources: [nonIntExp.sourcePath, nii.sourcePath, nonIntInc.sourcePath],
            asOf: end,
          }),
    );
  } else {
    const missing: string[] = [];
    if (nonIntExp === null) missing.push(NONINTEREST_EXPENSE_TAGS[0]);
    if (nonIntInc === null) missing.push(NONINTEREST_INCOME_TAGS[0]);
    if (nii === null) missing.push(NET_INTEREST_INCOME_TAGS[0]);
    out.push(
      withheld(
        "efficiencyRatio",
        "efficiency ratio",
        "%",
        flow === null
          ? noPeriod
          : facts === null
            ? `${noFacts} — the noninterest income/expense split exists only in the filings`
            : `the filer tags no ${missing.join(" / ")} fact for ${end} — the ratio needs the noninterest split and cannot be approximated from a vendor income statement`,
        "noninterest expense / (net interest income + noninterest income)",
        missing.map(tagPath),
      ),
    );
  }

  // --- CET1 (reported, display only) and tangible leverage (always; D-46)
  const cet1 = instant === null ? null : resolveTag(facts, CET1_TAGS, instant);
  if (cet1 !== null) {
    // Filers tag the ratio either as a fraction (0.15) or as a percent (15).
    const asPct = cet1.value <= 1 ? cet1.value * 100 : cet1.value;
    out.push(
      metric({
        key: "cet1Reported",
        label: "CET1 ratio (as reported)",
        unit: "%",
        value: asPct,
        basis: `company-reported common equity tier 1 capital / risk-weighted assets, tagged ${cet1.tag}${cet1.value <= 1 ? " (filed as a fraction, rendered as a percent)" : ""}`,
        sources: [cet1.sourcePath],
        asOf: cet1.end,
      }),
    );
  } else {
    out.push(
      withheld(
        "cet1Reported",
        "CET1 ratio (as reported)",
        "%",
        facts === null
          ? noFacts
          : "the filer tags no CET1 element in companyfacts (the ratio is commonly disclosed only in the regulatory-capital footnote text) — the tangible leverage ratio below is shown in its place, and is NOT a substitute",
        "company-reported CET1 capital / risk-weighted assets",
        CET1_TAGS.map(tagPath),
      ),
    );
  }
  // Computed whether or not CET1 is tagged (D-46): it is the capital driver of
  // the bank balance-sheet grade, and CET1 is display-only because the largest
  // filers do not tag it.
  const t = tangible(bal0);
  const tangibleDenom = pos(t.assets);
  // `tangibleCommonEquity` treats an untagged preferred line as zero. JPM's
  // report 26 (2026-10-13) printed "− preferred" here with nothing deducted,
  // because its preferred was tagged under an element the chain did not yet
  // read (D-42); say so instead, as the P/TBV basis does.
  const preferredTerm = isNum(bal0?.preferredStock) ? "preferred" : "preferred (none tagged, assumed zero)";
  out.push(
    t.equity !== null && tangibleDenom !== null
      ? metric({
          key: "tangibleLeverage",
          label: "tangible common equity / tangible assets",
          unit: "%",
          value: (t.equity / tangibleDenom) * 100,
          basis:
            `(equity − goodwill − other intangibles − ${preferredTerm}) ${t.equity} / (total assets − goodwill − other ` +
            `intangibles) ${tangibleDenom} × 100. A LEVERAGE ratio${cet1 === null ? " shown where CET1 is not tagged" : ""}: ` +
            "it does not risk-weight assets, so it is not comparable to a regulatory capital ratio and has no guaranteed " +
            "ordering relative to CET1.",
          sources: [
            "statements:balance.totalStockholdersEquity",
            "statements:balance.totalAssets",
            "statements:balance.goodwill",
            "statements:balance.intangibleAssets",
            "statements:balance.preferredStock",
          ],
          asOf: bal0?.date ?? null,
          proxy: cet1 === null,
        })
      : withheld(
          "tangibleLeverage",
          "tangible common equity / tangible assets",
          "%",
          "total equity and/or total assets unavailable — tangible leverage could not be computed",
          "(equity − goodwill − intangibles − preferred) / (assets − goodwill − intangibles)",
          ["statements:balance.totalStockholdersEquity", "statements:balance.totalAssets"],
        ),
  );

  // --- loans (denominator for NPL and provisions)
  const loans = instant === null ? null : resolveTag(facts, LOANS_TAGS, instant);

  // --- NPL ratio
  const nonaccrual = instant === null ? null : resolveTag(facts, NONACCRUAL_LOAN_TAGS, instant);
  out.push(
    nonaccrual !== null && loans !== null && pos(loans.value) !== null
      ? metric({
          key: "nplRatio",
          label: "nonperforming loan ratio",
          unit: "%",
          value: (nonaccrual.value / loans.value) * 100,
          basis: `nonaccrual loans ${nonaccrual.value} (${nonaccrual.tag}) / total loans ${loans.value} (${loans.tag}) × 100`,
          sources: [nonaccrual.sourcePath, loans.sourcePath],
          asOf: end,
        })
      : withheld(
          "nplRatio",
          "nonperforming loan ratio",
          "%",
          facts === null
            ? noFacts
            : nonaccrual === null
              ? "the filer reports nonaccrual loans only by loan class (a dimensional fact), and companyfacts carries no undimensioned total — the ratio would have to sum classes the payload does not expose"
              : "total loans unavailable or not positive — NPL denominator missing",
          "nonaccrual loans / total loans",
          [...NONACCRUAL_LOAN_TAGS.map(tagPath), ...LOANS_TAGS.slice(0, 1).map(tagPath)],
        ),
  );

  // --- provisions / loans
  const provision = flow === null ? null : resolveTag(facts, PROVISION_TAGS, flow);
  out.push(
    provision !== null && loans !== null && pos(loans.value) !== null
      ? metric({
          key: "provisionsToLoans",
          label: "provisions / loans",
          unit: "%",
          value: (provision.value / loans.value) * 100,
          basis: `provision for credit losses ${provision.value} (${provision.tag}) / total loans ${loans.value} (${loans.tag}) × 100 — the annual credit cost of the book`,
          sources: [provision.sourcePath, loans.sourcePath],
          asOf: end,
        })
      : withheld(
          "provisionsToLoans",
          "provisions / loans",
          "%",
          facts === null
            ? noFacts
            : provision === null
              ? `the filer tags no provision element for ${end} (some banks report it only as a sum of the financing-receivable and off-balance-sheet components)`
              : "total loans unavailable or not positive — provisions cannot be scaled",
          "provision for credit losses / total loans",
          [...PROVISION_TAGS.slice(0, 2).map(tagPath), ...LOANS_TAGS.slice(0, 1).map(tagPath)],
        ),
  );

  // --- deposit cost = interest expense on deposits / average deposits
  const depInterest = flow === null ? null : resolveTag(facts, INTEREST_EXPENSE_DEPOSITS_TAGS, flow);
  const deposits = instant === null ? null : resolveTag(facts, DEPOSITS_TAGS, instant);
  const depositsPrior = priorInstant === null ? null : resolveTag(facts, DEPOSITS_TAGS, priorInstant);
  if (depInterest !== null && deposits !== null) {
    const avg = average(deposits.value, depositsPrior?.value ?? null);
    const denom = pos(avg.value);
    out.push(
      denom === null
        ? withheld(
            "depositCost",
            "cost of deposits",
            "%",
            "average deposits are not positive — cost not computable",
            "interest expense on deposits / average deposits",
            [depInterest.sourcePath, deposits.sourcePath],
          )
        : metric({
            key: "depositCost",
            label: "cost of deposits",
            unit: "%",
            value: (depInterest.value / denom) * 100,
            basis: `interest expense on deposits ${depInterest.value} (${depInterest.tag}) / average deposits ${denom} (${avg.basis}) × 100`,
            sources: [depInterest.sourcePath, deposits.sourcePath, ...(depositsPrior ? [depositsPrior.sourcePath] : [])],
            asOf: end,
          }, { hits: [depInterest, deposits, ...(depositsPrior ? [depositsPrior] : [])] }),
    );
  } else {
    out.push(
      withheld(
        "depositCost",
        "cost of deposits",
        "%",
        facts === null
          ? noFacts
          : depInterest === null
            ? `the filer tags no ${INTEREST_EXPENSE_DEPOSITS_TAGS[0]} fact for ${end} — total interest expense covers borrowings too and would overstate the deposit cost`
            : "deposits unavailable — denominator missing",
        "interest expense on deposits / average deposits",
        [...INTEREST_EXPENSE_DEPOSITS_TAGS.map(tagPath), ...DEPOSITS_TAGS.map(tagPath)],
      ),
    );
  }

  // --- net charge-offs / average loans (D-46). The FDIC Quarterly Banking
  // Profile rate: a year's charge-offs net of recoveries over average loans.
  // The prior balance must be the SAME loan element, so the two ends measure
  // one thing; a missing prior balance withholds rather than falling back to
  // the period end.
  const nco = flow === null ? null : netChargeOffs(facts, flow);
  const loansPrior = loans === null || priorInstant === null ? null : resolveTag(facts, [loans.tag], priorInstant);
  const avgLoans = loans !== null && loansPrior !== null ? pos((loans.value + loansPrior.value) / 2) : null;
  out.push(
    nco !== null && "value" in nco && loans !== null && loansPrior !== null && avgLoans !== null
      ? metric({
          key: "ncoToAverageLoans",
          label: "net charge-offs / average loans",
          unit: "%",
          value: (nco.value / avgLoans) * 100,
          basis:
            `net charge-offs ${nco.value} (${nco.basis}) / average loans ${avgLoans} (${loans.tag} at ${loans.end} ` +
            `and ${loansPrior.end}) × 100 — the year's loan losses after recoveries, as a share of the book`,
          sources: [...nco.sources, loans.sourcePath],
          asOf: end,
        }, { hits: [...nco.hits, loans, loansPrior] })
      : withheld(
          "ncoToAverageLoans",
          "net charge-offs / average loans",
          "%",
          facts === null
            ? noFacts
            : nco === null || !("value" in nco)
              ? (nco?.reason ?? noPeriod)
              : loans === null
                ? `the filer tags no undimensioned total-loans element at ${end}`
                : loansPrior === null
                  ? `the filer tags no ${loans.tag} fact at the prior fiscal year end — average loans need both ends`
                  : "average loans are not positive",
          "net charge-offs (write-offs − recoveries) / average loans",
          [...NET_CHARGE_OFF_TAGS.map(tagPath), ...CHARGE_OFF_RECOVERY_PAIRS.flat().map(tagPath), tagPath(CASH_FLOW_RECOVERY_TAG), ...LOANS_TAGS.slice(0, 1).map(tagPath)],
        ),
  );

  // --- loans / deposits at one balance-sheet date (D-46)
  out.push(
    loans !== null && deposits !== null && loans.end === deposits.end && pos(deposits.value) !== null
      ? metric({
          key: "loansToDeposits",
          label: "loans / deposits",
          unit: "%",
          value: (loans.value / deposits.value) * 100,
          basis:
            `total loans ${loans.value} (${loans.tag}) / deposits ${deposits.value} (${deposits.tag}) at ${loans.end} × 100 — ` +
            "how much of the deposit base is lent out; a high ratio leans on wholesale funding",
          sources: [loans.sourcePath, deposits.sourcePath],
          asOf: loans.end,
        })
      : withheld(
          "loansToDeposits",
          "loans / deposits",
          "%",
          facts === null
            ? noFacts
            : loans === null
              ? `the filer tags no undimensioned total-loans element at ${end}`
              : deposits === null
                ? `the filer tags no ${DEPOSITS_TAGS[0]} fact at ${end}`
                : loans.end !== deposits.end
                  ? `loans (${loans.end}) and deposits (${deposits.end}) are not measured at the same date`
                  : "deposits are not positive",
          "total loans / deposits",
          [...LOANS_TAGS.slice(0, 1).map(tagPath), ...DEPOSITS_TAGS.map(tagPath)],
        ),
  );

  // --- D-47: rate-risk and credit-cycle disclosures, display only ----------
  out.push(...htmMetrics(facts, instant, bal0, t, noFacts));
  out.push(aclToLoans(facts, instant, loans, noFacts));
  out.push(loanCagr3y(facts, inputs.balance, loans, noFacts));

  const flags = bankRiskFlags(out);
  // Provisions below the year's net charge-offs while nonperforming loans rose:
  // evaluated only when every input is on file (rare — the large filers tag
  // nonaccrual loans only by class).
  const nonaccrualPrior =
    nonaccrual === null || priorInstant === null ? null : resolveTag(facts, [nonaccrual.tag], priorInstant);
  if (
    provision !== null &&
    nco !== null &&
    "value" in nco &&
    nco.value > 0 &&
    nonaccrual !== null &&
    nonaccrualPrior !== null &&
    loans !== null &&
    loansPrior !== null &&
    pos(loans.value) !== null &&
    pos(loansPrior.value) !== null &&
    operandConflict([provision, ...nco.hits, nonaccrual, nonaccrualPrior, loans, loansPrior]) === null
  ) {
    const nplRising = nonaccrual.value / loans.value > nonaccrualPrior.value / loansPrior.value;
    const ratio = provision.value / nco.value;
    flags.push({
      key: "provisionsBelowChargeOffs",
      label: "provisions / net charge-offs below the threshold while nonperforming loans rose",
      metricKey: null,
      value: ratio,
      unit: "x",
      threshold: BANK_FLAG_THRESHOLDS.provisionsToNcoBelowX,
      direction: "below",
      triggered: ratio < BANK_FLAG_THRESHOLDS.provisionsToNcoBelowX && nplRising,
      caveat:
        "Provisions below the year's net charge-offs while nonperforming loans rise mean reserves are being drawn " +
        "down as credit worsens; the nonperforming-loan ratio " + (nplRising ? "rose" : "did not rise") + " this year.",
      asOf: end,
    });
  }

  return { metrics: out, flags };
}

/**
 * Unrealised loss on held-to-maturity securities, net of unrealised gains,
 * and what it would do to tangible common equity if it were realised (D-47).
 * HTM securities are carried at amortised cost, so the loss is in neither book
 * nor regulatory capital. Every pair is read at ONE instant; a pair measured
 * at different dates, or a loss whose date or currency differs from the
 * balance sheet's, is withheld.
 */
function htmMetrics(
  facts: CompanyFacts | null,
  instant: { end: string } | null,
  bal0: FinancialMetricsBalanceRow | undefined,
  t: { equity: number | null; assets: number | null },
  noFacts: string,
): RouteMetric[] {
  const lossLabel = "unrealised loss on held-to-maturity securities (net of gains)";
  const afterTaxLabel = "held-to-maturity unrealised loss after tax";
  const toTceLabel = "held-to-maturity loss after tax / tangible common equity";
  const markedLabel = "tangible common equity / tangible assets with held-to-maturity losses marked";
  const lossBasis = "unrecognised holding loss − unrecognised holding gain, else amortised cost − fair value, at one instant";
  const lossSources = [
    ...HTM_UNREALIZED_LOSS_TAGS,
    ...HTM_UNREALIZED_GAIN_TAGS,
    ...HTM_AMORTIZED_COST_TAGS,
    ...HTM_FAIR_VALUE_TAGS,
  ].map(tagPath);
  const taxBasis =
    `× (1 − ${HTM_LOSS_TAX_RATE_PCT}%), the US federal statutory corporate rate — an ASSUMPTION; state taxes and the ` +
    "bank's own deferred-tax position are not modelled";

  let loss: { value: number; unit: string; end: string; basis: string; sources: string[] } | { reason: string };
  const pairReason = (a: TagHit, b: TagHit): string | null =>
    a.end !== b.end
      ? `${a.tag} (${a.end}) and ${b.tag} (${b.end}) are measured at different dates — not combined`
      : a.unit !== b.unit
        ? `${a.tag} and ${b.tag} are filed in different units — not combined`
        : null;
  if (facts === null || instant === null) {
    loss = { reason: facts === null ? noFacts : "no annual statement period available — metric not computed" };
  } else {
    const grossLoss = resolveTag(facts, HTM_UNREALIZED_LOSS_TAGS, instant);
    const grossGain = resolveTag(facts, HTM_UNREALIZED_GAIN_TAGS, instant);
    const cost = resolveTag(facts, HTM_AMORTIZED_COST_TAGS, instant);
    const fair = resolveTag(facts, HTM_FAIR_VALUE_TAGS, instant);
    if (grossLoss !== null && grossGain !== null) {
      const mismatch = pairReason(grossLoss, grossGain);
      loss =
        mismatch !== null
          ? { reason: mismatch }
          : {
              value: grossLoss.value - grossGain.value,
              unit: grossLoss.unit,
              end: grossLoss.end,
              basis: `${grossLoss.tag} ${grossLoss.value} − ${grossGain.tag} ${grossGain.value}`,
              sources: [grossLoss.sourcePath, grossGain.sourcePath],
            };
    } else if (cost !== null && fair !== null) {
      const mismatch = pairReason(cost, fair);
      loss =
        mismatch !== null
          ? { reason: mismatch }
          : {
              value: cost.value - fair.value,
              unit: cost.unit,
              end: cost.end,
              basis: `amortised cost ${cost.value} (${cost.tag}) − fair value ${fair.value} (${fair.tag})`,
              sources: [cost.sourcePath, fair.sourcePath],
            };
    } else {
      loss = {
        reason:
          `the filer tags neither the held-to-maturity unrealised loss and gain nor amortised cost and fair value at ${instant.end}` +
          " (a bank with no held-to-maturity book has none to disclose)",
      };
    }
  }

  if ("reason" in loss) {
    return [
      withheld("htmUnrealizedLossNet", lossLabel, "currency", loss.reason, lossBasis, lossSources),
      withheld("htmLossAfterTax", afterTaxLabel, "currency", `pre-tax loss withheld: ${loss.reason}`, `pre-tax loss ${taxBasis}`, lossSources),
      withheld("htmLossToTce", toTceLabel, "%", `held-to-maturity loss withheld: ${loss.reason}`, "after-tax loss / tangible common equity", lossSources),
      withheld("markedTceRatio", markedLabel, "%", `held-to-maturity loss withheld: ${loss.reason}`, "(TCE − after-tax loss) / (tangible assets − pre-tax loss)", lossSources),
    ];
  }

  const currency = isoCode(loss.unit);
  const afterTax = loss.value * (1 - HTM_LOSS_TAX_RATE_PCT / 100);
  const out: RouteMetric[] = [
    metric({
      key: "htmUnrealizedLossNet",
      label: lossLabel,
      unit: "currency",
      currency,
      value: loss.value,
      basis:
        `${loss.basis} at ${loss.end}. Held-to-maturity securities are carried at amortised cost, so this loss is in ` +
        "neither book nor regulatory capital; it would be realised only if the securities were sold before maturity, " +
        "and it shrinks as they approach par. Negative = a net unrealised gain.",
      sources: loss.sources,
      asOf: loss.end,
    }),
    metric({
      key: "htmLossAfterTax",
      label: afterTaxLabel,
      unit: "currency",
      currency,
      value: afterTax,
      basis: `pre-tax loss ${loss.value} ${taxBasis}`,
      sources: loss.sources,
      asOf: loss.end,
    }),
  ];

  // The capital ratios combine the XBRL loss with the statement balance sheet:
  // same date and same currency, or withheld.
  const tce = t.equity;
  const tangibleAssets = t.assets;
  const balanceMismatch =
    bal0 === undefined || bal0.date !== loss.end
      ? `the held-to-maturity loss (${loss.end}) and the balance sheet (${bal0?.date ?? "none"}) are not measured at the same date`
      : currency === null || isoCode(bal0.reportedCurrency) !== currency
        ? `the held-to-maturity loss (${loss.unit}) and the balance sheet (${bal0.reportedCurrency ?? "currency unknown"}) are not in one established currency`
        : tce === null || pos(tce) === null
          ? "tangible common equity unavailable or not positive"
          : tangibleAssets === null || pos(tangibleAssets - loss.value) === null
            ? "tangible assets unavailable or not positive after the loss"
            : null;
  const capitalSources = [...loss.sources, "statements:balance.totalStockholdersEquity", "statements:balance.totalAssets"];
  if (balanceMismatch !== null || tce === null || tangibleAssets === null) {
    const reason = balanceMismatch ?? "tangible common equity unavailable";
    out.push(
      withheld("htmLossToTce", toTceLabel, "%", reason, "after-tax loss / tangible common equity", capitalSources),
      withheld("markedTceRatio", markedLabel, "%", reason, "(TCE − after-tax loss) / (tangible assets − pre-tax loss)", capitalSources),
    );
    return out;
  }
  out.push(
    metric({
      key: "htmLossToTce",
      label: toTceLabel,
      unit: "%",
      value: (afterTax / tce) * 100,
      basis:
        `after-tax held-to-maturity loss ${afterTax} / tangible common equity ${tce} × 100 — the share of tangible ` +
        "equity the loss would consume if deposits had to be funded by selling these securities. A sticky deposit " +
        "base offsets the exposure (Drechsler, Savov & Schnabl 2021); it is not a realised loss.",
      sources: capitalSources,
      asOf: loss.end,
    }),
    metric({
      key: "markedTceRatio",
      label: markedLabel,
      unit: "%",
      value: ((tce - afterTax) / (tangibleAssets - loss.value)) * 100,
      basis:
        `(tangible common equity ${tce} − after-tax loss ${afterTax}) / (tangible assets ${tangibleAssets} − pre-tax ` +
        `loss ${loss.value}) × 100. Available-for-sale losses are already in tangible common equity through ` +
        "accumulated other comprehensive income (stockholders' equity includes it), so only the held-to-maturity " +
        "loss is deducted — no double count. Hypothetical: it assumes the securities were sold.",
      sources: capitalSources,
      asOf: loss.end,
    }),
  );
  return out;
}

/**
 * Allowance for credit losses / loans (D-47). Display only: a high ratio can
 * mean conservative reserving or a riskier book, and the figure cannot tell
 * which.
 */
function aclToLoans(
  facts: CompanyFacts | null,
  instant: { end: string } | null,
  loans: TagHit | null,
  noFacts: string,
): RouteMetric {
  const label = "allowance for credit losses / loans";
  const acl = instant === null ? null : resolveTag(facts, ALLOWANCE_FOR_CREDIT_LOSS_TAGS, instant);
  if (acl !== null && loans !== null && acl.end === loans.end && acl.unit === loans.unit && pos(loans.value) !== null) {
    return metric({
      key: "aclToLoans",
      label,
      unit: "%",
      value: (acl.value / loans.value) * 100,
      basis:
        `allowance ${acl.value} (${acl.tag}) / loans ${loans.value} (${loans.tag}) at ${loans.end} × 100. Shown, not ` +
        "graded: a high ratio can mean conservative reserving or a riskier book.",
      sources: [acl.sourcePath, loans.sourcePath],
      asOf: loans.end,
    });
  }
  return withheld(
    "aclToLoans",
    label,
    "%",
    facts === null
      ? noFacts
      : acl === null
        ? `the filer tags no undimensioned allowance-for-credit-losses element at ${instant?.end ?? "the period end"}`
        : loans === null
          ? "total loans unavailable"
          : acl.end !== loans.end || acl.unit !== loans.unit
            ? `the allowance (${acl.end}) and loans (${loans.end}) are not measured at the same date and unit`
            : "loans are not positive",
    "allowance for credit losses / total loans",
    [...ALLOWANCE_FOR_CREDIT_LOSS_TAGS.map(tagPath), ...LOANS_TAGS.slice(0, 1).map(tagPath)],
  );
}

/**
 * Three-year loan growth (D-47) from four fiscal-year-end balances of the SAME
 * loan element. Acquisitions inflate it; the figure cannot separate them.
 */
function loanCagr3y(
  facts: CompanyFacts | null,
  balance: readonly FinancialMetricsBalanceRow[],
  loans: TagHit | null,
  noFacts: string,
): RouteMetric {
  const label = "loan growth, 3-year annualised";
  const basisName = "(loans at the latest fiscal year end / loans three fiscal years earlier)^(1/years) − 1";
  const sources = LOANS_TAGS.slice(0, 1).map(tagPath);
  const dates = balance.slice(0, 4).map((r) => r.date);
  if (facts === null) return withheld("loanCagr3y", label, "%", noFacts, basisName, sources);
  if (loans === null) return withheld("loanCagr3y", label, "%", "total loans unavailable at the latest fiscal year end", basisName, sources);
  if (dates.length < 4) {
    return withheld("loanCagr3y", label, "%", "fewer than four annual balance sheets on file — three years of growth need four year-end points", basisName, sources);
  }
  const points = dates.map((d) => resolveTag(facts, [loans.tag], { end: d }));
  const missing = dates.filter((_, i) => points[i] === null);
  if (missing.length > 0) {
    return withheld("loanCagr3y", label, "%", `the filer tags no ${loans.tag} fact at ${missing.join(", ")} — the growth needs the same loan element at all four year ends`, basisName, [tagPath(loans.tag)]);
  }
  const first = points[3]!;
  const last = points[0]!;
  const years = (Date.parse(`${last.end}T00:00:00Z`) - Date.parse(`${first.end}T00:00:00Z`)) / (365.25 * 86_400_000);
  if (!(years >= 2.9 && years <= 3.1) || pos(first.value) === null || pos(last.value) === null) {
    return withheld("loanCagr3y", label, "%", `the four year-end loan balances (${first.end} to ${last.end}) do not span three years of positive balances`, basisName, [tagPath(loans.tag)]);
  }
  return metric({
    key: "loanCagr3y",
    label,
    unit: "%",
    value: (Math.pow(last.value / first.value, 1 / years) - 1) * 100,
    basis:
      `(${last.value} at ${last.end} / ${first.value} at ${first.end})^(1/${years.toFixed(2)}) − 1, ${loans.tag}. ` +
      "Includes loans gained through acquisitions, which inflate it.",
    sources: [tagPath(loans.tag)],
    asOf: last.end,
  });
}

/** Threshold flags over computed bank metrics (D-47). Only evaluable ones are returned. */
function bankRiskFlags(metrics: readonly RouteMetric[]): BankRiskFlag[] {
  const T = BANK_FLAG_THRESHOLDS;
  const htmCaveat =
    "This is the exposure if deposits had to be funded by selling these securities; a sticky deposit base offsets " +
    "it (Drechsler, Savov and Schnabl). It is a point-in-time loss that shrinks as the securities approach maturity, " +
    "and uninsured-deposit data, the run-risk half of the mark-to-market fragility test (Jiang, Matvos, Piskorski " +
    "and Seru), is not available here.";
  const specs: { key: string; metricKey: string; label: string; threshold: number; direction: "below" | "above"; caveat: string }[] = [
    {
      key: "lowTangibleCapital",
      metricKey: "tangibleLeverage",
      label: "tangible common equity / tangible assets below the threshold",
      threshold: T.tangibleLeverageBelowPct,
      direction: "below",
      caveat:
        "This is a holding-company GAAP ratio that excludes preferred stock, so it runs below the regulatory leverage " +
        "ratio; it is a house threshold, not a regulatory minimum. Leverage is not comparable across business " +
        "models; custody and trust banks run thin by design.",
    },
    {
      key: "htmLossVsCapital",
      metricKey: "htmLossToTce",
      label: "held-to-maturity loss after tax / tangible common equity above the threshold",
      threshold: T.htmLossToTceAbovePct,
      direction: "above",
      caveat: htmCaveat,
    },
    {
      key: "lowMarkedCapital",
      metricKey: "markedTceRatio",
      label: "tangible common equity / tangible assets with held-to-maturity losses marked below the threshold",
      threshold: T.markedTceRatioBelowPct,
      direction: "below",
      caveat: htmCaveat,
    },
    {
      key: "fastLoanGrowth",
      metricKey: "loanCagr3y",
      label: "three-year loan growth above the threshold",
      threshold: T.loanCagr3yAbovePct,
      direction: "above",
      caveat:
        "Banks with the fastest loan growth have gone on to underperform, reserve less while growing and report higher " +
        "provisions later (Fahlenbrach, Prilmeier and Stulz); the figure includes loans gained through acquisitions, " +
        "which inflate it.",
    },
    {
      key: "highLoansToDeposits",
      metricKey: "loansToDeposits",
      label: "loans / deposits above the threshold",
      threshold: T.loansToDepositsAbovePct,
      direction: "above",
      caveat: "A bank lending out more than its deposits leans on wholesale funding, which can leave faster than deposits.",
    },
  ];
  const flags: BankRiskFlag[] = [];
  for (const s of specs) {
    const m = metrics.find((x) => x.key === s.metricKey);
    if (m === undefined || m.withheldReason !== null || !isNum(m.value)) continue;
    flags.push({
      ...s,
      value: m.value,
      unit: m.unit,
      triggered: s.direction === "below" ? m.value < s.threshold : m.value > s.threshold,
      asOf: m.asOf,
    });
  }
  return flags;
}

/**
 * A fiscal year's net charge-offs: the tagged after-recovery figure, else
 * write-offs minus recoveries from ONE tag family over the same annual period.
 * Fiscal-year duration facts only; a pair whose periods differ fails closed.
 */
function netChargeOffs(
  facts: CompanyFacts | null,
  flow: { end: string; durationHint: "FY" },
): { value: number; basis: string; sources: string[]; hits: TagHit[] } | { reason: string } | null {
  if (facts === null) return null;
  const net = resolveTag(facts, NET_CHARGE_OFF_TAGS, flow);
  if (net !== null) return { value: net.value, basis: net.tag, sources: [net.sourcePath], hits: [net] };
  for (const [writeoffTag, recoveryTag] of CHARGE_OFF_RECOVERY_PAIRS) {
    const writeoff = resolveTag(facts, [writeoffTag], flow);
    const recovery = resolveTag(facts, [recoveryTag], flow);
    if (writeoff === null || recovery === null) continue;
    if (writeoff.start !== recovery.start || writeoff.end !== recovery.end || writeoff.unit !== recovery.unit) {
      return { reason: `${writeoffTag} and ${recoveryTag} cover different periods or units — net charge-offs not computed` };
    }
    return {
      value: writeoff.value - recovery.value,
      basis: `${writeoffTag} ${writeoff.value} − ${recoveryTag} ${recovery.value}`,
      sources: [writeoff.sourcePath, recovery.sourcePath],
      hits: [writeoff, recovery],
    };
  }
  for (const [writeoffTag] of CHARGE_OFF_RECOVERY_PAIRS) {
    const writeoff = resolveTag(facts, [writeoffTag], flow);
    const recovery = resolveTag(facts, [CASH_FLOW_RECOVERY_TAG], flow);
    if (writeoff === null || recovery === null) continue;
    if (writeoff.start !== recovery.start || writeoff.end !== recovery.end || writeoff.unit !== recovery.unit || writeoff.accn !== recovery.accn) {
      return { reason: `${writeoffTag} and ${CASH_FLOW_RECOVERY_TAG} cover different periods, units or filings — net charge-offs not computed` };
    }
    return {
      value: writeoff.value - recovery.value,
      basis: `${writeoffTag} ${writeoff.value} − ${CASH_FLOW_RECOVERY_TAG} ${recovery.value}; recoveries are the cash-flow statement's ` +
        "principal recovered on loans previously charged off, as no undimensioned allowance roll-forward recovery is tagged",
      sources: [writeoff.sourcePath, recovery.sourcePath],
      hits: [writeoff, recovery],
    };
  }
  return {
    reason: `the filer tags no fiscal-year charge-off and recovery pair for ${flow.end} (some filers report them only by loan class, a dimensional fact companyfacts carries no total for)`,
  };
}

// ---------------------------------------------------------------------------
// Insurer metrics
// ---------------------------------------------------------------------------

function insurerMetrics(
  facts: CompanyFacts | null,
  inputs: FinancialMetricsInputs,
  factsReason: string | null,
): RouteMetric[] {
  const out: RouteMetric[] = [];
  const inc0 = inputs.income[0];
  const end = inc0?.date ?? inputs.balance[0]?.date ?? null;
  const flow = end === null ? null : { end, durationHint: "FY" as const };
  const noFacts = factsReason ?? "EDGAR companyfacts unavailable — XBRL line items could not be read";

  const premiums = flow === null ? null : resolveTag(facts, PREMIUMS_EARNED_TAGS, flow);
  const claims = flow === null ? null : resolveTag(facts, INCURRED_CLAIMS_TAGS, flow);
  // `resolveSum` returns a value as soon as ANY component resolves. A partial
  // component sum is not an underwriting-expense total: an insurer tagging only
  // its deferred-acquisition-cost amortisation would publish a 12% expense ratio
  // and a 77% combined ratio — an underwriter that does not exist — which is the
  // very failure the "combined ratio is withheld when either half is missing"
  // rule exists to prevent. Both components are required, and the withholding
  // names the one that is absent.
  const underwritingSum = flow === null ? null : resolveSum(facts, UNDERWRITING_EXPENSE_TAGS, flow);
  const underwritingMissing = UNDERWRITING_EXPENSE_TAGS.filter(
    (tag) => !(underwritingSum?.hits ?? []).some((h) => h.tag === tag),
  );
  const underwriting = underwritingMissing.length === 0 ? underwritingSum : null;

  const premiumBase = premiums === null ? null : pos(premiums.value);
  const denomNote =
    "denominator is GAAP premiums EARNED; a statutory expense ratio divides by premiums WRITTEN, so this figure is not directly comparable to a statutory filing";

  // --- loss ratio
  const lossRatio =
    claims !== null && premiumBase !== null ? (claims.value / premiumBase) * 100 : null;
  out.push(
    lossRatio !== null && claims !== null && premiums !== null
      ? metric({
          key: "lossRatio",
          label: "loss ratio",
          unit: "%",
          value: lossRatio,
          basis: `incurred claims ${claims.value} (${claims.tag}) / premiums earned ${premiumBase} (${premiums.tag}) × 100`,
          sources: [claims.sourcePath, premiums.sourcePath],
          asOf: end,
        })
      : withheld(
          "lossRatio",
          "loss ratio",
          "%",
          facts === null
            ? noFacts
            : claims === null
              ? `the filer tags no incurred-claims element for ${end}`
              : "premiums earned unavailable or not positive — loss ratio denominator missing",
          "incurred claims / premiums earned",
          [...INCURRED_CLAIMS_TAGS.slice(0, 1).map(tagPath), ...PREMIUMS_EARNED_TAGS.slice(0, 1).map(tagPath)],
        ),
  );

  // --- expense ratio
  const expenseRatio =
    underwriting !== null && premiumBase !== null ? (underwriting.value / premiumBase) * 100 : null;
  out.push(
    expenseRatio !== null && underwriting !== null && premiums !== null
      ? metric({
          key: "expenseRatio",
          label: "expense ratio",
          unit: "%",
          value: expenseRatio,
          basis:
            `underwriting expenses ${underwriting.value} (${underwriting.hits.map((h) => h.tag).join(" + ")}) / ` +
            `premiums earned ${premiumBase} (${premiums.tag}) × 100 — ${denomNote}`,
          sources: [...underwriting.hits.map((h) => h.sourcePath), premiums.sourcePath],
          asOf: end,
        })
      : withheld(
          "expenseRatio",
          "expense ratio",
          "%",
          facts === null
            ? noFacts
            : underwritingSum === null
              ? `the filer tags no underwriting-expense element for ${end} (acquisition costs and other underwriting expenses are often reported only in the expense footnote)`
              : underwritingMissing.length > 0
                ? `the filer tags ${underwritingSum.hits.map((h) => h.tag).join(" + ")} but not ${underwritingMissing.join(" or ")} for ${end} — a PARTIAL component sum is not an underwriting-expense total, and publishing it would understate the expense ratio and the combined ratio, so it is withheld`
                : "premiums earned unavailable or not positive — expense ratio denominator missing",
          "underwriting expenses / premiums earned",
          [...UNDERWRITING_EXPENSE_TAGS.map(tagPath), ...PREMIUMS_EARNED_TAGS.slice(0, 1).map(tagPath)],
        ),
  );

  // --- combined ratio = loss + expense; both halves required.
  out.push(
    lossRatio !== null && expenseRatio !== null
      ? metric({
          key: "combinedRatio",
          label: "combined ratio",
          unit: "%",
          value: lossRatio + expenseRatio,
          basis:
            `loss ratio ${lossRatio.toFixed(2)}% + expense ratio ${expenseRatio.toFixed(2)}%. Computed from XBRL, ` +
            `NOT the company-reported combined ratio, which is the gold standard: ${denomNote}. Above 100% means ` +
            "underwriting lost money before investment income.",
          sources: ["computed.financialMetrics.lossRatio", "computed.financialMetrics.expenseRatio"],
          asOf: end,
          proxy: true,
        })
      : withheld(
          "combinedRatio",
          "combined ratio",
          "%",
          `${lossRatio === null ? "loss ratio" : "expense ratio"} unavailable — a combined ratio missing either half would understate underwriting cost, so it is withheld rather than reported partial`,
          "loss ratio + expense ratio",
          ["computed.financialMetrics.lossRatio", "computed.financialMetrics.expenseRatio"],
        ),
  );

  // --- prior-year reserve development
  const development = flow === null ? null : resolveTag(facts, PRIOR_YEAR_DEVELOPMENT_TAGS, flow);
  out.push(
    development !== null
      ? metric({
          key: "reserveDevelopment",
          label: "prior-year reserve development",
          unit: "currency",
          currency: isoCode(development.unit),
          value: development.value,
          basis:
            `incurred claims attributable to PRIOR accident years ${development.value} (${development.tag}). ` +
            "Positive = adverse development (reserves were too low); negative = favourable release.",
          sources: [development.sourcePath],
          asOf: end,
        })
      : withheld(
          "reserveDevelopment",
          "prior-year reserve development",
          "currency",
          facts === null
            ? noFacts
            : "the filer tags no prior-year development element (the claims-development table is usually filed as dimensional facts by accident year, which companyfacts does not expose as a single total)",
          "incurred claims attributable to prior accident years",
          PRIOR_YEAR_DEVELOPMENT_TAGS.map(tagPath),
        ),
  );

  return out;
}

// ---------------------------------------------------------------------------
// Mortgage-REIT metrics
// ---------------------------------------------------------------------------

function mortgageReitMetrics(
  facts: CompanyFacts | null,
  inputs: FinancialMetricsInputs,
  factsReason: string | null,
): RouteMetric[] {
  const out: RouteMetric[] = [];
  const bal0 = inputs.balance[0];
  const bal1 = adjacentBalance(bal0, inputs.balance[1]);
  const inc0 = inputs.income[0];
  const end = bal0?.date ?? inc0?.date ?? null;
  const flow = end === null ? null : { end, durationHint: "FY" as const };
  const instant = end === null ? null : { end };
  const priorInstant = bal1 === undefined ? null : { end: bal1.date };
  const noFacts = factsReason ?? "EDGAR companyfacts unavailable — XBRL line items could not be read";

  // --- book value per share (common)
  const equity = isNum(bal0?.totalStockholdersEquity) ? bal0.totalStockholdersEquity : null;
  const preferred = isNum(bal0?.preferredStock) ? bal0.preferredStock : 0;
  // Period-END shares where the filer tags them: the numerator is a period-end
  // balance, so an average denominator mismatches it. The weighted-average
  // diluted count is the fallback, and it is marked a PROXY with the direction
  // of the error named rather than published as though it were the closing
  // count.
  const sharesOutstanding = instant === null ? null : resolveTag(facts, SHARES_OUTSTANDING_TAGS, instant);
  // The period-end count is read AS FILED, outside the statements' split
  // handling, so it is put on the statements' share basis here or not used:
  // divided into equity it becomes a per-share figure compared with the price.
  const periodEndOnBasis =
    sharesOutstanding === null
      ? null
      : inputs.shareBasis === null || inputs.shareBasis === undefined
        ? { withheld: "no split resolution accompanies the companyfacts payload, so the filed count's split basis is unestablished" }
        : shareCountOnBasis(inputs.shareBasis.splits, sharesOutstanding.value, sharesOutstanding.filed, null, inputs.shareBasis.basisDay);
  const periodEndWithheld = periodEndOnBasis !== null && "withheld" in periodEndOnBasis ? periodEndOnBasis.withheld : null;
  const periodEndShares = periodEndOnBasis === null || "withheld" in periodEndOnBasis ? null : pos(periodEndOnBasis.value);
  const shares = periodEndShares ?? pos(inputs.shares ?? null);
  const sharesLabel =
    periodEndShares !== null
      ? `period-end common shares outstanding (${sharesOutstanding?.tag})`
      : (inputs.sharesBasis ?? "shares");
  const sharesSource =
    periodEndShares !== null
      ? (sharesOutstanding?.sourcePath ?? tagPath(SHARES_OUTSTANDING_TAGS[0]))
      : (inputs.sharesBasis ?? "statements:income.weightedAverageShsOutDil");
  out.push(
    equity !== null && shares !== null
      ? metric({
          key: "bookValuePerShare",
          label: "book value per share",
          unit: "currency/share",
          currency: isoCode(bal0?.reportedCurrency),
          value: (equity - preferred) / shares,
          basis:
            `(total stockholders' equity ${equity} − preferred ${preferred}) / ${sharesLabel} ` +
            `${shares}. Book value is the mortgage REIT's headline: its assets are marked securities, so equity is ` +
            "close to liquidation value and P/B is the primary multiple." +
            (periodEndShares !== null
              ? ""
              : ` PROXY denominator: ${
                  periodEndWithheld !== null
                    ? `the filed ${SHARES_OUTSTANDING_TAGS[0]} at ${bal0?.date ?? "the period end"} is not used because ${periodEndWithheld}`
                    : `the filer tags no ${SHARES_OUTSTANDING_TAGS[0]} fact at ${bal0?.date ?? "the period end"}`
                }, so the WEIGHTED-AVERAGE diluted count stands in. It is an average over the year while the equity above is a period-end balance, so for a REIT issuing through a continuous at-the-market programme this figure sits ABOVE the true book value per share.`),
          sources: [
            "statements:balance.totalStockholdersEquity",
            "statements:balance.preferredStock",
            sharesSource,
          ],
          asOf: bal0?.date ?? null,
          proxy: periodEndShares === null,
        })
      : withheld(
          "bookValuePerShare",
          "book value per share",
          "currency/share",
          equity === null ? "total stockholders' equity unavailable" : "share count unavailable or not positive",
          "(total equity − preferred) / shares",
          ["statements:balance.totalStockholdersEquity", "statements:income.weightedAverageShsOutDil"],
        ),
  );

  // --- leverage = assets / equity
  const assets = isNum(bal0?.totalAssets) ? bal0.totalAssets : null;
  out.push(
    assets !== null && equity !== null && equity > 0
      ? metric({
          key: "leverageAssetsToEquity",
          label: "leverage (assets / equity)",
          unit: "x",
          value: assets / equity,
          basis: `total assets ${assets} / total stockholders' equity ${equity}. Repo-funded balance sheets commonly run 5-10x; the ratio is the risk the book carries, not a solvency verdict.`,
          sources: ["statements:balance.totalAssets", "statements:balance.totalStockholdersEquity"],
          asOf: bal0?.date ?? null,
        })
      : withheld(
          "leverageAssetsToEquity",
          "leverage (assets / equity)",
          "x",
          assets === null ? "total assets unavailable" : "total equity unavailable or not positive",
          "total assets / total equity",
          ["statements:balance.totalAssets", "statements:balance.totalStockholdersEquity"],
        ),
  );

  // --- net interest spread = asset yield − funding cost
  const intIncome =
    flow === null
      ? null
      : (resolveTag(facts, INTEREST_INCOME_OPERATING_TAGS, flow) ??
        (isNum(inc0?.interestIncome)
          ? { value: inc0.interestIncome, tag: "interestIncome", end: inc0.date, sourcePath: "statements:income.interestIncome" }
          : null));
  const intExpense =
    flow === null
      ? null
      : (resolveTag(facts, INTEREST_EXPENSE_TAGS, flow) ??
        (isNum(inc0?.interestExpense)
          ? { value: inc0.interestExpense, tag: "interestExpense", end: inc0.date, sourcePath: "statements:income.interestExpense" }
          : null));
  const repo = instant === null ? null : resolveTag(facts, REPO_FUNDING_TAGS, instant);
  const repoPrior = priorInstant === null ? null : resolveTag(facts, REPO_FUNDING_TAGS, priorInstant);

  const avgAssets = average(assets, isNum(bal1?.totalAssets) ? bal1.totalAssets : null);
  const assetDenom = pos(avgAssets.value);
  // The funding leg is averaged the same way the asset leg is. Dividing a
  // full-year interest expense by a period-END balance while the other leg used
  // an average made the two halves of the spread incomparable even before the
  // numerator problem below.
  const avgRepo = repo === null ? { value: null, basis: "" } : average(repo.value, repoPrior?.value ?? null);
  const fundingDenom = pos(avgRepo.value);

  // The NAMED metric is interest expense over average INTEREST-BEARING
  // LIABILITIES. companyfacts exposes only the repurchase-agreement balance,
  // while the interest-expense numerator covers every borrowing the REIT runs,
  // so the two do not match and the quotient overstates the cost of funds —
  // enough to flip the sign of the spread for a REIT with non-repo debt
  // (interest income 3.9bn on average assets 75bn against interest expense
  // 3.0bn over 50bn of repo printed -0.8% for a company reporting a positive
  // spread). The named figure is therefore WITHHELD and the repo-funded
  // computation is published under its own name, exactly as NIM is withheld in
  // favour of net interest income over average total assets.
  out.push(
    withheld(
      "netInterestSpread",
      "net interest spread",
      "%",
      "the definition divides interest expense by average INTEREST-BEARING LIABILITIES; companyfacts exposes only the repurchase-agreement balance while the interest-expense numerator covers every borrowing the REIT runs, so that quotient overstates the cost of funds and can flip the sign of the spread — the named metric is withheld and the repo-funded computation is published under its own name instead",
      "interest income / average earning assets − interest expense / average interest-bearing liabilities",
      [
        ...INTEREST_INCOME_OPERATING_TAGS.slice(0, 1).map(tagPath),
        ...INTEREST_EXPENSE_TAGS.slice(0, 1).map(tagPath),
        ...REPO_FUNDING_TAGS.map(tagPath),
      ],
    ),
  );

  if (
    intIncome !== null &&
    intExpense !== null &&
    assetDenom !== null &&
    fundingDenom !== null &&
    repo !== null
  ) {
    const yieldPct = (intIncome.value / assetDenom) * 100;
    const costPct = (Math.abs(intExpense.value) / fundingDenom) * 100;
    out.push(
      metric({
        key: "netInterestSpreadRepoFunded",
        label: "net interest spread (repo-funded)",
        unit: "%",
        value: yieldPct - costPct,
        basis:
          `asset yield (interest income ${intIncome.value} / average total assets ${assetDenom}, ${avgAssets.basis}) ` +
          `${yieldPct.toFixed(2)}% − funding cost (TOTAL interest expense ${Math.abs(intExpense.value)} / average ` +
          `repurchase agreements ${fundingDenom}, ${avgRepo.basis}) ${costPct.toFixed(2)}%. NOT the net interest ` +
          "spread: interest on any borrowing other than repo sits in the numerator with no matching balance in the " +
          "denominator, so the funding cost sits at or ABOVE a true cost of funds and this spread at or BELOW a true " +
          "net interest spread. A mortgage REIT's assets are interest-earning securities and loans, so total assets " +
          "is a fair yield denominator here — unlike at a bank.",
        sources: [
          intIncome.sourcePath,
          intExpense.sourcePath,
          repo.sourcePath,
          ...(repoPrior !== null ? [repoPrior.sourcePath] : []),
          "statements:balance.totalAssets",
        ],
        asOf: end,
        proxy: true,
      }, { hits: actualTagHits([intIncome, intExpense, repo, repoPrior]), currencies: [
        "unit" in intIncome && "unit" in intExpense ? undefined : inc0?.reportedCurrency,
        bal0?.reportedCurrency, ...(isNum(bal1?.totalAssets) ? [bal1?.reportedCurrency] : []),
      ] }),
    );
  } else {
    const missing: string[] = [];
    if (intIncome === null) missing.push("interest income");
    if (intExpense === null) missing.push("interest expense");
    if (assetDenom === null) missing.push("average total assets");
    if (fundingDenom === null) missing.push("repurchase-agreement funding balance");
    out.push(
      withheld(
        "netInterestSpreadRepoFunded",
        "net interest spread (repo-funded)",
        "%",
        facts === null && (intIncome === null || intExpense === null)
          ? noFacts
          : `${missing.join(", ")} unavailable — the spread needs both legs over their own average balances, and a one-legged figure would misstate it`,
        "interest income / average total assets − total interest expense / average repurchase agreements",
        [
          ...INTEREST_INCOME_OPERATING_TAGS.slice(0, 1).map(tagPath),
          ...INTEREST_EXPENSE_TAGS.slice(0, 1).map(tagPath),
          ...REPO_FUNDING_TAGS.map(tagPath),
        ],
      ),
    );
  }

  return out;
}

// ---------------------------------------------------------------------------
// Equity-REIT FFO / AFFO — approximate NAREIT reconstruction (criterion e)
// ---------------------------------------------------------------------------

export interface NareitFfoResult {
  /** FFO in currency; null when withheld. */
  ffo: number | null;
  /** AFFO in currency; null when withheld. */
  affo: number | null;
  /**
   * True when FFO is not reconciled to the issuer's ownership basis, or a
   * component stands in for the definition. This reconstruction always lacks
   * common/preferred, noncontrolling-interest and joint-venture adjustments;
   * real-estate-specific tags alone cannot establish exact common-holder FFO.
   */
  ffoApproximate: boolean;
  /** True when AFFO inherits approximate FFO or lacks recurring capex / rent. */
  affoApproximate: boolean;
  /**
   * True when FFO is exactly net income + TOTAL depreciation and amortization
   * — no property-sale gain, impairment or real-estate-only depreciation was
   * netted — which is the one construction the multiples framework can
   * rebuild per quarter for an own-history P/FFO band.
   */
  netIncomePlusTotalDa: boolean;
  /** Historical AFFO is NI + total income D&A - all capex, with no rent adjustment. */
  affoHistoryComparable: boolean;
  ffoBasis: string;
  affoBasis: string;
  sources: string[];
  asOf: string | null;
  notes: string[];
  gaps: ManifestEntry[];
}

export interface NareitFfoInputs {
  companyFacts: FetchResult<CompanyFacts> | null | undefined;
  /**
   * Period end of the income statement FFO is computed for. Every XBRL
   * component resolves at this period end, so the fallbacks below MUST be from
   * the same period: a fiscal-year net income against trailing depreciation is
   * a hybrid of two periods, not a figure.
   */
  periodEnd: string | null;
  reportedCurrency?: string | null;
  /** Net income fallback when the tag does not resolve — same period as `periodEnd`. */
  netIncome: number | null;
  /** Total D&A fallback — same period as `periodEnd`. */
  depreciationAndAmortization: number | null;
  /** Capex fallback (negative outflow) for the rough AFFO — same period as `periodEnd`. */
  capitalExpenditure?: number | null;
}

/**
 * Approximate FFO reconstruction: net income (GAAP) plus real-estate
 * depreciation and amortization, minus gains on property sales, plus
 * impairments of depreciable real estate.
 *
 * Real-estate D&A is the part of D&A NAREIT adds back; a diversified REIT's
 * corporate D&A is not supposed to be. Where the filer tags real-estate
 * depreciation separately that component is available; where it does not,
 * total D&A stands in. Neither case reconciles ownership: NAREIT also requires
 * appropriate consolidated/unconsolidated partnership and joint-venture
 * adjustments, and common-holder FFO must account for preferred and NCI.
 * The result stays approximate and has no guaranteed direction of error.
 *
 * AFFO subtracts recurring capital expenditure and straight-line rent when the
 * filer tags them; otherwise it falls back to the existing rough treatment
 * (FFO − all capex) and says so.
 */
export function computeNareitFfo(inputs: NareitFfoInputs): NareitFfoResult {
  const notes: string[] = [];
  const gaps: ManifestEntry[] = [];
  const sources: string[] = [];
  const facts =
    inputs.companyFacts !== null && inputs.companyFacts !== undefined && inputs.companyFacts.ok
      ? inputs.companyFacts.value.data
      : null;
  const end = inputs.periodEnd;
  const flow = end === null ? null : { end, durationHint: "FY" as const };

  const netIncomeHit = flow === null ? null : resolveTag(facts, NET_INCOME_TAGS, flow);
  const netIncome = netIncomeHit?.value ?? (isNum(inputs.netIncome) ? inputs.netIncome : null);
  if (netIncomeHit !== null) sources.push(netIncomeHit.sourcePath);
  else if (netIncome !== null) sources.push("statements:income.netIncome");

  if (netIncome === null) {
    gaps.push({
      field: "valuation.reit.ffo",
      reason: "net income unavailable — FFO (which starts from GAAP net income) not computable",
      severity: "warn",
      attemptedSources: [...NET_INCOME_TAGS.map(tagPath), "statements:income.netIncome"],
    });
    return {
      ffo: null,
      affo: null,
      ffoApproximate: false,
      affoApproximate: false,
      netIncomePlusTotalDa: false,
      affoHistoryComparable: false,
      ffoBasis: "not computed (no net income)",
      affoBasis: "not computed (no FFO)",
      sources,
      asOf: end,
      notes,
      gaps,
    };
  }

  const reDep = flow === null ? null : resolveTag(facts, REAL_ESTATE_DEPRECIATION_TAGS, flow);
  const totalDa = flow === null ? null : totalDaNotBelowComponents(facts, flow);
  const daValue =
    reDep?.value ?? totalDa?.value ?? (isNum(inputs.depreciationAndAmortization) ? inputs.depreciationAndAmortization : null);
  const daIsRealEstate = reDep !== null;
  if (reDep !== null) sources.push(reDep.sourcePath);
  else if (totalDa !== null) sources.push(totalDa.sourcePath);
  else if (daValue !== null) sources.push("statements:income.depreciationAndAmortization");

  if (daValue === null) {
    gaps.push({
      field: "valuation.reit.ffo",
      reason:
        "no depreciation and amortization figure available — FFO's defining add-back (real-estate depreciation) is missing",
      severity: "warn",
      attemptedSources: [
        ...REAL_ESTATE_DEPRECIATION_TAGS.map(tagPath),
        ...DEPRECIATION_AMORTIZATION_TAGS.map(tagPath),
      ],
    });
    return {
      ffo: null,
      affo: null,
      ffoApproximate: false,
      affoApproximate: false,
      netIncomePlusTotalDa: false,
      affoHistoryComparable: false,
      ffoBasis: "not computed (no depreciation add-back)",
      affoBasis: "not computed (no FFO)",
      sources,
      asOf: end,
      notes,
      gaps,
    };
  }

  const gains = flow === null ? null : resolveTag(facts, PROPERTY_SALE_GAIN_TAGS, flow);
  // NAREIT adds back only impairments attributable to depreciable real estate.
  // The generic charge is a labeled stand-in, never the definition.
  const reImpairment = flow === null ? null : resolveTag(facts, REAL_ESTATE_IMPAIRMENT_TAGS, flow);
  const genericImpairment =
    flow === null || reImpairment !== null ? null : resolveTag(facts, GENERIC_IMPAIRMENT_TAGS, flow);
  const impairments = reImpairment ?? genericImpairment;
  const impairmentIsGeneric = reImpairment === null && genericImpairment !== null;
  if (gains !== null) sources.push(gains.sourcePath);
  if (impairments !== null) sources.push(impairments.sourcePath);

  const gainsValue = gains?.value ?? 0;
  const impairmentsValue = impairments?.value ?? 0;
  const compatibility = operandConflict([netIncomeHit,reDep ?? totalDa,gains,impairments].filter((h):h is TagHit=>h!==null),[inputs.reportedCurrency]);
  if (compatibility !== null) return {
    ffo:null,affo:null,ffoApproximate:false,affoApproximate:false,netIncomePlusTotalDa:false,affoHistoryComparable:false,
    ffoBasis:`FFO withheld: ${compatibility}`,affoBasis:"AFFO withheld because FFO is incompatible",
    sources,asOf:end,notes:[compatibility],gaps:[{field:"valuation.reit.ffo.compatibility",reason:compatibility,severity:"warn",attemptedSources:sources}],
  };
  const ffo = netIncome + daValue - gainsValue + impairmentsValue;
  const netIncomePlusTotalDa = !daIsRealEstate && gains === null && impairments === null;

  const ffoParts = [
    `net income ${netIncome}`,
    `+ ${daIsRealEstate ? "real-estate" : "total"} depreciation and amortization ${daValue}`,
    gains !== null
      ? `− gains on property sales ${gainsValue} (${gains.tag})`
      : "− gains on property sales (no property-sale-gain element tagged; treated as zero — a disposition gain the filer did not tag would leave FFO overstated by that gain)",
    impairments !== null
      ? `+ impairments ${impairmentsValue} (${impairments.tag})`
      : "+ impairments (none tagged; treated as zero)",
  ];
  const ownershipReason =
    "ownership reconciliation is unavailable: common/preferred shareholder allocation, noncontrolling interests, " +
    "and consolidated/unconsolidated partnerships and joint ventures are not reconciled — " +
    "this simplified reconstruction may be above or below the issuer's common-holder FFO";
  const ffoApproximateReasons: string[] = [ownershipReason];
  notes.push(`FFO is approximate because ${ownershipReason}.`);
  gaps.push({
    field: "valuation.reit.ffo.ownershipReconciliation",
    reason: ownershipReason,
    severity: "info",
    attemptedSources: ["edgar:companyfacts", "statements:income.netIncome"],
  });
  if (!daIsRealEstate) {
    ffoApproximateReasons.push(
      "the filer does not tag real-estate depreciation separately, so TOTAL depreciation and amortization is added back — NAREIT adds back only the real-estate portion",
    );
  }
  if (impairmentIsGeneric) {
    ffoApproximateReasons.push(
      `the filer tags no ${REAL_ESTATE_IMPAIRMENT_TAGS[0]}, so the generic ${GENERIC_IMPAIRMENT_TAGS[0]} is added back — NAREIT adds back only impairments of depreciable real estate, and this charge may include goodwill or other non-real-estate write-downs`,
    );
  }
  const ffoBasis =
    `FFO (approximate NAREIT reconstruction) = ${ffoParts.join(" ")} = ${ffo}.` +
    (ffoApproximateReasons.length === 0
      ? ""
      : ` APPROXIMATE: ${ffoApproximateReasons.join("; and ")}.`);
  if (impairmentIsGeneric) {
    notes.push(
      "FFO adds back the generic asset-impairment charge because the filer tags no real-estate impairment — labeled approximate: NAREIT adds back only impairments of depreciable real estate, so this component may include ineligible goodwill or other non-real-estate write-downs.",
    );
    gaps.push({
      field: "valuation.reit.ffo.realEstateImpairment",
      reason:
        "real-estate impairment is not separately tagged — FFO adds back the generic asset-impairment charge instead and is labeled approximate",
      severity: "info",
      attemptedSources: REAL_ESTATE_IMPAIRMENT_TAGS.map(tagPath),
    });
  }
  if (!daIsRealEstate) {
    notes.push(
      "FFO uses total depreciation and amortization because the filer tags no separate real-estate depreciation — labeled approximate (NAREIT adds back only real-estate depreciation).",
    );
    gaps.push({
      field: "valuation.reit.ffo.realEstateDepreciation",
      reason:
        "real-estate depreciation is not separately tagged — FFO adds back total D&A instead and is labeled approximate",
      severity: "info",
      attemptedSources: REAL_ESTATE_DEPRECIATION_TAGS.map(tagPath),
    });
  }
  if (gains === null && impairments === null) {
    notes.push(
      "FFO netted no gains on property sales and no impairments: the filer tags neither for this period, so both are treated as zero rather than guessed.",
    );
  }

  // --- AFFO: recurring capex and straight-line rent when tagged.
  const recurringCapex = flow === null ? null : resolveSum(facts, RECURRING_CAPEX_TAGS, flow);
  const straightLineRent = flow === null ? null : resolveTag(facts, STRAIGHT_LINE_RENT_TAGS, flow);
  let affo: number | null = null;
  let affoBasis: string;
  let affoApproximate = false;
  if (recurringCapex !== null) {
    const capex = Math.abs(recurringCapex.value);
    const slr = straightLineRent?.value ?? 0;
    affo = ffo - capex - slr;
    affoBasis =
      `AFFO = FFO ${ffo} − recurring capital expenditure ${capex} ` +
      `(${recurringCapex.hits.map((h) => h.tag).join(" + ")})` +
      (straightLineRent !== null
        ? ` − straight-line rent ${slr} (${straightLineRent.tag})`
        : " (straight-line rent not tagged; not subtracted)") +
      ` = ${affo}.`;
    sources.push(...recurringCapex.hits.map((h) => h.sourcePath));
    if (straightLineRent !== null) sources.push(straightLineRent.sourcePath);
    if (straightLineRent === null) {
      affoApproximate = true;
      notes.push(
        "AFFO subtracts recurring capital expenditure but not straight-line rent, which the filer does not tag — labeled approximate.",
      );
    }
  } else if (isNum(inputs.capitalExpenditure)) {
    affo = ffo - Math.abs(inputs.capitalExpenditure);
    affoApproximate = true;
    affoBasis =
      `AFFO (rough) = FFO ${ffo} − ALL capital expenditure ${Math.abs(inputs.capitalExpenditure)}. APPROXIMATE: the ` +
      "filer tags no recurring/maintenance capital-expenditure element, so development spending is subtracted too; " +
      "unreconciled FFO and omitted issuer AFFO adjustments prevent a guaranteed bound on reported AFFO.";
    sources.push("statements:cashFlow.capitalExpenditure");
    notes.push(
      "AFFO treats ALL capital expenditure as recurring because no maintenance-capex element is tagged — disclosed as approximate, with no guaranteed bound on reported AFFO.",
    );
    gaps.push({
      field: "valuation.reit.affo",
      reason:
        "recurring (maintenance) capital expenditure and straight-line rent are not tagged — AFFO subtracts total capex instead and is labeled approximate",
      severity: "info",
      attemptedSources: [...RECURRING_CAPEX_TAGS.map(tagPath), ...STRAIGHT_LINE_RENT_TAGS.map(tagPath)],
    });
  } else {
    affoBasis = "AFFO not computed: neither recurring capital expenditure nor a total capex figure is available.";
    gaps.push({
      field: "valuation.reit.affo",
      reason: "no capital-expenditure figure available — AFFO not computable",
      severity: "warn",
      attemptedSources: [...RECURRING_CAPEX_TAGS.map(tagPath), "statements:cashFlow.capitalExpenditure"],
    });
  }

  if (affo !== null && ffoApproximateReasons.length > 0) {
    affoApproximate = true;
    const inheritedReason = "AFFO inherits approximate FFO, including the unreconciled ownership basis; issuer-specific AFFO adjustments are not fully reconciled";
    affoBasis += ` APPROXIMATE: ${inheritedReason}.`;
    notes.push(`${inheritedReason}.`);
    gaps.push({
      field: "valuation.reit.affo.ffoBasis",
      reason: inheritedReason,
      severity: "info",
      attemptedSources: ["valuation.reit.ffo"],
    });
  }

  const affoCompatibility=operandConflict([netIncomeHit,reDep ?? totalDa,gains,impairments,...(recurringCapex?.hits??[]),...(recurringCapex && straightLineRent ? [straightLineRent] : [])].filter((h):h is TagHit=>h!==null),[inputs.reportedCurrency]);
  if(affoCompatibility!==null){
    affo=null;affoBasis=`AFFO withheld: ${affoCompatibility}`;
    gaps.push({field:"valuation.reit.affo.compatibility",reason:affoCompatibility,severity:"warn",attemptedSources:sources});
  }

  return {
    ffo,
    affo,
    ffoApproximate: ffoApproximateReasons.length > 0,
    affoApproximate,
    netIncomePlusTotalDa,
    affoHistoryComparable: affo !== null && netIncomePlusTotalDa && recurringCapex === null && isNum(inputs.capitalExpenditure),
    ffoBasis,
    affoBasis,
    sources,
    asOf: end,
    notes,
    gaps,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Route metrics for a financial company. Returns an empty metric list for
 * routes that have none (general, equity REIT — the latter's FFO/AFFO come
 * from {@link computeNareitFfo}).
 */
export function computeFinancialMetrics(
  route: SectorRoute,
  inputs: FinancialMetricsInputs,
): FinancialMetricsResult {
  const notes: string[] = [];
  const gaps: ManifestEntry[] = [];

  const factsResult = inputs.companyFacts;
  const facts =
    factsResult !== null && factsResult !== undefined && factsResult.ok ? factsResult.value.data : null;
  const factsReason =
    factsResult === null || factsResult === undefined
      ? "EDGAR companyfacts not fetched for this bundle"
      : factsResult.ok
        ? null
        : `EDGAR companyfacts unavailable: ${factsResult.gap.reason}`;

  let metrics: RouteMetric[];
  let flags: BankRiskFlag[] = [];
  if (route === "bank") {
    ({ metrics, flags } = bankMetrics(facts, inputs, factsReason));
    notes.push(
      "Bank route metrics are computed from the filer's own XBRL tags. A named metric is published only when the " +
        "figures its definition calls for are on file; anything else is withheld with the reason, and a stand-in " +
        "(net interest income over average total assets, tangible leverage) is published under its own name, never " +
        "under the name of the metric it stands in for.",
      // D-47: what these figures are, and are not.
      "The capital, credit and funding figures are a CAMELS-style proxy built from public filings: management " +
        "quality and interest-rate sensitivity are not observable from them, and no supervisory rating is used.",
    );
    for (const f of flags.filter((x) => x.triggered)) {
      const fmt = (v: number): string => (f.unit === "%" ? `${v.toFixed(1)}%` : `${v.toFixed(2)}x`);
      notes.push(
        `Warning sign (heuristic threshold, not validated): ${f.label} — ${fmt(f.value)}, ${f.direction} the ` +
          `threshold of ${fmt(f.threshold)}. ${f.caveat} A count of warning signs is not a probability.`,
      );
    }
  } else if (route === "insurer") {
    metrics = insurerMetrics(facts, inputs, factsReason);
    notes.push(
      "Insurer route metrics are computed on GAAP premiums EARNED. The company-reported combined ratio remains the " +
        "gold standard; the computed one is labeled as a computation and is not directly comparable to a statutory " +
        "filing, which divides expenses by premiums WRITTEN.",
    );
  } else if (route === "reit-mortgage") {
    metrics = mortgageReitMetrics(facts, inputs, factsReason);
    notes.push(
      "Mortgage-REIT route metrics lead on book value: the assets are marked securities, so equity approximates " +
        "liquidation value. The spread and leverage figures describe the carry trade the book actually runs.",
    );
  } else {
    metrics = [];
  }

  if (factsReason !== null && metrics.length > 0) {
    notes.push(`${factsReason} — every metric needing an XBRL line item is withheld with its own reason.`);
  }

  for (const m of metrics) {
    const dependency = m.value===null ? undefined : m.sources.find(source=>source.startsWith("computed.financialMetrics.") && metrics.find(d=>d.key===source.split(".").at(-1))?.value===null);
    const conflict = dependency ? `required ${dependency} was withheld — dependent metric withheld` : metricConflict(m, facts, inputs);
    if (conflict !== null) { m.value = null; m.withheldReason = conflict; m.basis += ` WITHHELD: ${conflict}.`; }
    if (m.withheldReason !== null) {
      gaps.push({
        field: `financialMetrics.${m.key}`,
        reason: `${m.label} withheld: ${m.withheldReason}`,
        severity: "info",
        attemptedSources: m.sources.length > 0 ? m.sources : undefined,
      });
    }
  }

  const asOf = metrics.reduce<string | null>(
    (acc, m) => (m.asOf !== null && (acc === null || m.asOf > acc) ? m.asOf : acc),
    null,
  );

  const unsupportedFlags=flags.filter(f=>f.metricKey!==null && !metrics.some(m=>m.key===f.metricKey && m.value!==null));
  for(let i=notes.length-1;i>=0;i--)if(unsupportedFlags.some(f=>notes[i]!.startsWith(`Warning sign (heuristic threshold, not validated): ${f.label}`)))notes.splice(i,1);
  flags = flags.filter(f=>!unsupportedFlags.includes(f));

  return { route, metrics, ...(route === "bank" ? { flags } : {}), notes, gaps, asOf };
}
