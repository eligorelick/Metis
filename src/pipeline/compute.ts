import { admittedStatementRow, isFmpQuotaReason, quotePriceObservationDay } from "@/providers/fmp";
/**
 * Stage B orchestrator — runStageB(bundle) adapts the raw DataBundle into each
 * pure Stage B module's own input types, runs sector routing FIRST, then feeds
 * every analytical module, honouring the metric-suppression policy for the
 * routed sector (suppressed metrics are nulled with a disclosing note rather
 * than silently dropped).
 *
 * Pure + deterministic: no network, no DB, no LLM, no clock reads beyond the
 * bundle's own builtAt. Missing inputs degrade to gaps — never throw
 * (non-negotiable rule #4).
 */

import { comparePriceCurrency } from "@/pipeline/stageB/priceCurrency";
import { validateBundle, type ValidationReport, type ValidatableBundle } from "@/pipeline/stageA/validate";
import { inheritedIssuerCurrency, providerRowCurrency } from "@/pipeline/estimateCurrency";
import { describeFinancialValuation } from "@/pipeline/stageB/valuationAssumptions";
import { comparePeerFundamentals } from "@/pipeline/peers";
import { buildFilingDisclosures, newerPeriodicFiling, newerResultsRelease, nextPeriodRevenueGuidance } from "@/pipeline/filingDisclosures";
import { newerFilingSentence, newerResultsSentence } from "@/report/filingDisclosurePresentation";
import type { FetchResult, ManifestEntry, Sourced } from "@/types/core";
import type { DataBundle, FmpFetch } from "@/pipeline/types";
import type {
  FmpBalanceSheetRow,
  FmpCashFlowRow,
  FmpIncomeStatementRow,
  FmpMarketRiskPremiumRow,
  FmpRawRow,
  FmpStatementRow,
} from "@/providers/fmp";
import { tagsFor } from "@/edgar/tagSynonyms";

import { alignProjectionScenarios } from "@/pipeline/stageB/scenarioAlignment";
import {
  computeRunway,
  metricPolicy,
  normalizeReportedCurrency,
  routeCompany,
  degradationPlan,
  type CompanyRouteResult,
  type DegradationPlan,
  type RunwayResult,
  type RoutingIncomeRow,
  type RoutingCashflowRow,
} from "@/pipeline/stageB/sectorRouting";
// WS5: XBRL routing evidence (D-16) and financial-route metrics (D-17).
import { deriveRoutingEvidence } from "@/pipeline/stageB/routingEvidence";
import {
  computeFinancialMetrics,
  computeNareitFfo,
  type FinancialMetricsResult,
} from "@/pipeline/stageB/financialMetrics";
import {
  computeGrowth,
  windowCagr,
  type GrowthResult,
  type GrowthIncomeRow,
  type GrowthCashFlowRow,
} from "@/pipeline/stageB/growth";
import {
  computeWacc,
  computeRoic,
  computeRote,
  incomeAvailableToCommon,
  computeDupont,
  computeRoicVsWaccSpread,
  type WaccResult,
  type RoicResult,
  type RoteResult,
  type DupontResult,
  type RoicVsWaccSpread,
  type ReturnsIncomeRow,
  type ReturnsBalanceRow,
  PRIOR_YEAR_COST_OF_DEBT_MAX_YEARS_BACK,
  type PriorYearCostOfDebt,
  // WS6 (D-19)
  waccByFiscalYear,
  waccDisclosure,
  type WaccDisclosure,
  type WaccHistoryResult,
} from "@/pipeline/stageB/returns";
import {
  computeCapital,
  type CapitalResult,
  type CapitalIncomeRow,
  type CapitalCashFlowRow,
  type CapitalBalanceRow,
  type MarketCapPoint,
  type QuoteInput,
} from "@/pipeline/stageB/capital";
import { repurchaseExecutionsFromFacts } from "@/pipeline/stageB/repurchaseExecutions";
import {
  runForensics,
  type ForensicsReport,
  type ForensicsIncomeRow,
  type ForensicsBalanceRow,
  type ForensicsCashFlowRow,
} from "@/pipeline/stageB/forensics";
import {
  computeTechnicals,
  type TechnicalsResult,
  type OhlcvRow,
} from "@/pipeline/stageB/technicals";
import {
  valueCompany,
  type ValuationResult,
  type ValuationBundleInputs,
  type DcfAssumptionInputs,
  type DcfIncomeRow,
  type DcfQuarterRevenue,
  type DcfGuidance,
  type DcfBalanceRow,
  type AnalystEstimateRow,
  type FiscalYearToDate,
  type RevenueSeasonality,
  type MultiplesFrameworkInputs,
  type MultiplesQuoteInputs,
  type MultiplesIncomeTtm,
  type MultiplesCashFlowTtm,
  type MultiplesBalance,
  type QuarterlyFundamentalsRow,
  type EnterpriseValuesRow,
  type ExcessReturnInputs,
  type ReitInputs,
  noncontrollingEarningsInput,
} from "@/pipeline/stageB/valuation";
import { computeScores } from "@/pipeline/stageB/grading";
import { computeProjections, interestRunRate, type ProjectionIncomeRow } from "@/pipeline/stageB/projections";
import { computeScenarioTargets } from "@/pipeline/stageB/scenarioTargets";
import { computeFairValue, degradedInputsReason, withDegradedInputs } from "@/pipeline/stageB/fairValue";
import { leaseDebtConflict, operatingLeaseOutOfDebt, resolveNetDebt, type NetDebtResolution } from "@/pipeline/stageB/netDebt";
import { temporaryEquityClaims, temporaryEquityOperands, temporaryEquityUnknownAt } from "@/pipeline/stageB/seniorClaims";
import { debtLikeObligationsAt } from "@/pipeline/stageB/debtLikeObligations";
import { deferredIncomeTaxesAt, utilityCreditMetrics } from "@/pipeline/stageB/utilityCredit";
import { marketableEquityInCash, nonMarketableEquityCarrying } from "@/pipeline/stageB/marketableEquity";
import { retainedCommonClassAmbiguity } from "@/pipeline/stageB/commonClassScope";
import { incompleteLeaseCoverage, leaseDebtScopeRefusal, restoreLeaseFinancingProvenance } from "@/pipeline/stageB/leaseScope";
import { commonIncomeFlowRefusal, constructCommonIncomeQuarterWindow, type CommonIncomeInputs, type CommonIncomeFlowScope } from "@/pipeline/stageB/securityBasis";
import { issuerEconomicDilutedShares, resolveEconomicEquityScope } from "@/pipeline/stageB/securityBasis";
import { estimateBeta, type ClosePoint } from "@/pipeline/stageB/betaEstimate";
import { findPointForPeriod, tagPoints, type CompanyFacts } from "@/edgar/xbrl";
import { attachCurrentCapital } from "@/pipeline/stageB/currentCapital";
import { admitDebtFields, admitVendorLongTermInvestments, balanceAdmissionEntries, debtPresentationSections, type BalanceAdmission } from "@/edgar/financialEnrichment";
import { longTermDebtHoldsCurrent, longTermDebtHoldsFinanceLeases, lowerBoundDAndACaveat } from "@/edgar/statements";
import { collapsedDebtReason, implausibleDebtReason } from "@/edgar/debtCompleteness";
import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import { businessCombinationYears, computeTtmCommonReturn, type TtmCommonReturn } from "@/pipeline/stageB/excessReturnStart";
import { unusualOperatingItemsTtm } from "@/pipeline/stageB/unusualItems";
import {
  normalizeQuarterRows,
  quarterWindowViolation,
  type FiscalDatedRow,
} from "@/pipeline/stageB/quarterWindows";
import {
  classifyInstrumentSupport,
  UnsupportedInstrumentError,
} from "@/pipeline/stageB/instrumentSupport";
// WS6 (D-19): THESIS_EV_INCLUDE_LEASES.
import { getConfig } from "@/config/env";
import { mergeManifest } from "@/pipeline/stageA/manifest";
import type {
  Scoring,
  Projections,
  ScenarioTargets,
  FairValue,
  RouteMetrics,
  RouteMetricRow,
} from "@/report/schema";

// ---------------------------------------------------------------------------
// Public result contract
// ---------------------------------------------------------------------------

/**
 * The full Stage B analytical picture for one company. Every sub-result carries
 * its own notes + gaps; the top-level `gaps` is the merged, deduped, severity-
 * ordered union of every module's gaps plus the bundle's own manifest.
 *
 * `suppressed` lists the metric keys nulled by the sector metric policy (a
 * bank's Altman-Z, an EV/EBITDA for a financial, etc.) with the reason, so the
 * UI can render "suppressed for <route>" rather than a blank.
 */
export interface ComputedMetrics {
  symbol: string;
  builtAt: string;
  route: CompanyRouteResult;
  degradation: DegradationPlan;
  growth: GrowthResult;
  returns: ReturnsBlock;
  capital: CapitalResult;
  forensics: ForensicsReport;
  technicals: TechnicalsResult;
  valuation: ValuationResult;
  /**
   * WS5 (D-17): route metrics for bank / insurer / mortgage-REIT routes — the
   * figures those routes lead with. Empty on every other route. Each metric is
   * computed from the filer's tags or withheld with its reason.
   */
  financialMetrics: FinancialMetricsResult;
  /** Present only for the pre-revenue / unprofitable / recent-ipo overlays. */
  runway: RunwayResult | null;
  /** Deterministic aspect scores + weighted composite (feature 1.1.0). */
  scores: Scoring;
  /** Weighted forward projections (feature 1.1.0). */
  projections: Projections;
  /** Deterministic bull/base/bear price targets (2026-07-11 checkpoint). */
  scenarioTargets: ScenarioTargets;
  /** Deterministic intrinsic per-share fair value (2026-07-11 DCF checkpoint). */
  fairValue: FairValue;
  /** Metric keys nulled by the sector policy, with the disclosing reason. */
  suppressed: SuppressedMetric[];
  notes: string[];
  gaps: ManifestEntry[];
}

export interface ReturnsBlock {
  wacc: WaccResult;
  // WS6 (D-19): every WACC input named with its source and date, and the WACC
  // recomputed at each fiscal year end from that year's risk-free observation.
  waccInputs: WaccDisclosure;
  waccHistory: WaccHistoryResult;
  roic: RoicResult;
  rote: RoteResult;
  /**
   * Audit 2026-10-22 C-10/C-11: the trailing-four-quarter return on common
   * equity on the financial routes (tangible for banks, book common equity for
   * insurers and mortgage REITs); null on every other route.
   */
  commonReturnTtm: TtmCommonReturn | null;
  dupont: DupontResult;
  roicVsWacc: RoicVsWaccSpread;
  notes: string[];
  gaps: ManifestEntry[];
}

export interface SuppressedMetric {
  key: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Small unwrap helpers — every bundle member is a FetchResult<...>
// ---------------------------------------------------------------------------

function rowsOf<TRow extends FmpRawRow>(f: FmpFetch<TRow>): TRow[] {
  if (!f.ok) return [];
  return f.value.data.rows.map(admittedStatementRow);
}

/** First row of a single-row FMP payload (profile/quote), or null. */
function firstRow<TRow extends FmpRawRow>(f: FmpFetch<TRow>): TRow | null {
  return rowsOf(f)[0] ?? null;
}

function sourcedOf<T>(f: FetchResult<T>): Sourced<T> | null {
  return f.ok ? f.value : null;
}

function valueOf<T>(f: FetchResult<T>): T | null {
  return f.ok ? f.value.data : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function isoDay(v: unknown): string | null {
  const s = str(v);
  return s ? s.slice(0, 10) : null;
}

const US_COUNTRY_KEYS = new Set(["us", "usa", "unitedstates", "unitedstatesofamerica"]);

/**
 * Select the US total ERP by country identity, never by provider array order.
 * Conflicting US rows fail closed so an ambiguous vendor response cannot
 * silently choose whichever value happens to arrive first.
 */
export function selectUsEquityRiskPremium(
  rows: ReadonlyArray<FmpMarketRiskPremiumRow>,
): number | null {
  const values = rows.flatMap((row) => {
    const countryKey = typeof row.country === "string"
      ? row.country.toLowerCase().replace(/[^a-z]/g, "")
      : "";
    const value = num(row.totalEquityRiskPremium);
    return US_COUNTRY_KEYS.has(countryKey) && value !== null ? [value] : [];
  });
  const uniqueValues = [...new Set(values)];
  return uniqueValues.length === 1 ? uniqueValues[0] : null;
}

const countryKeyOf = (value: unknown): string =>
  typeof value === "string" ? value.toLowerCase().replace(/[^a-z]/g, "") : "";

/**
 * FMP's profile reports an ISO-2 code ("TW"); its market-risk-premium rows are
 * keyed by full country NAME ("Taiwan"). Comparing them directly could never
 * match, so the domicile lookup silently fell through to the US premium for
 * every foreign issuer — the exact defect it was written to fix.
 *
 * Unlisted codes stay unresolved and keep the DISCLOSED US fallback, so an
 * unmapped domicile fails closed and loudly rather than matching wrongly.
 */
const COUNTRY_CODE_TO_NAME: Readonly<Record<string, string>> = {
  ar: "argentina", au: "australia", at: "austria", be: "belgium", br: "brazil",
  ca: "canada", cl: "chile", cn: "china", co: "colombia", cz: "czechrepublic",
  dk: "denmark", eg: "egypt", fi: "finland", fr: "france", de: "germany",
  gr: "greece", hk: "hongkong", hu: "hungary", in: "india", id: "indonesia",
  ie: "ireland", il: "israel", it: "italy", jp: "japan", kr: "southkorea",
  lu: "luxembourg", my: "malaysia", mx: "mexico", nl: "netherlands",
  nz: "newzealand", no: "norway", pe: "peru", ph: "philippines", pl: "poland",
  pt: "portugal", qa: "qatar", ro: "romania", ru: "russia", sa: "saudiarabia",
  sg: "singapore", za: "southafrica", es: "spain", se: "sweden",
  ch: "switzerland", tw: "taiwan", th: "thailand", tr: "turkey",
  ae: "unitedarabemirates", gb: "unitedkingdom", uk: "unitedkingdom",
  us: "unitedstates", vn: "vietnam",
};

/** Every spelling one domicile may appear under, for set-intersection matching. */
function countryAliases(value: unknown): Set<string> {
  const key = countryKeyOf(value);
  if (key.length === 0) return new Set();
  const out = new Set([key]);
  const mapped = COUNTRY_CODE_TO_NAME[key];
  if (mapped !== undefined) out.add(mapped);
  for (const [code, name] of Object.entries(COUNTRY_CODE_TO_NAME)) {
    if (name === key) out.add(code);
  }
  return out;
}

/**
 * Select the total ERP for the ISSUER'S domicile, never the US premium by
 * default. CAPM's market premium is a property of the market the equity is
 * exposed to; substituting the US premium for a foreign issuer understates its
 * cost of equity by the whole country risk premium — which is the entire point
 * of Damodaran's country-risk adjustment, and which the vendor already supplies
 * per country in the same payload.
 *
 * Returns the domicile row when it resolves unambiguously. Otherwise falls back
 * to the US row and says so, so the substitution is disclosed rather than
 * silent. Conflicting rows for one country fail closed, as the US selector
 * already did.
 */
export function selectEquityRiskPremium(
  rows: ReadonlyArray<FmpMarketRiskPremiumRow>,
  country: string | null,
): {
  pct: number | null;
  basis: "domicile" | "us-fallback";
  country: string | null;
  /** Why the domicile row was not used — absent, or several conflicting rows. */
  reason: "absent" | "conflicting" | null;
} {
  const aliases = countryAliases(country);
  const isUs = [...aliases].some((a) => US_COUNTRY_KEYS.has(a) || a === "unitedstates");
  let matchCount = 0;
  if (aliases.size > 0 && !isUs) {
    const matches = [
      ...new Set(
        rows.flatMap((row) => {
          const value = num(row.totalEquityRiskPremium);
          const rowAliases = countryAliases(row.country);
          const hit = [...rowAliases].some((a) => aliases.has(a));
          return hit && value !== null ? [value] : [];
        }),
      ),
    ];
    matchCount = matches.length;
    if (matches.length === 1) {
      return {
        pct: matches[0],
        basis: "domicile",
        country: typeof country === "string" ? country : null,
        reason: null,
      };
    }
  }
  return {
    pct: selectUsEquityRiskPremium(rows),
    // Keyed on isUs, not on alias resolution: an unknown or blank domicile is
    // NOT a domicile match, and labelling it one made its disclosure unreachable.
    basis: isUs ? "domicile" : "us-fallback",
    country: typeof country === "string" ? country : null,
    // More than one DISTINCT premium for the domicile is a vendor conflict, not
    // an absence, and must not be disclosed as "no vendor row".
    reason: isUs ? null : matchCount > 1 ? "conflicting" : "absent",
  };
}

// ---------------------------------------------------------------------------
// Adapters — map FMP rows to each module's input row shape (structural, but we
// build explicit objects so a field rename upstream fails the typecheck here).
// ---------------------------------------------------------------------------

function toGrowthIncome(r: FmpIncomeStatementRow): GrowthIncomeRow {
  return {
    date: String(r.date ?? ""),
    // Restatement recency: without these, a duplicated fiscal period is
    // ambiguous and gets rejected wholesale instead of resolved.
    acceptedDate: str(r.acceptedDate),
    filingDate: str(r.filingDate),
    revenue: num(r.revenue),
    grossProfit: num(r.grossProfit),
    operatingIncome: num(r.operatingIncome),
    netIncome: num(r.netIncome),
    epsDiluted: num(r.epsDiluted),
  };
}

function toGrowthCashFlow(r: FmpCashFlowRow): GrowthCashFlowRow {
  return {
    date: String(r.date ?? ""),
    acceptedDate: str(r.acceptedDate),
    filingDate: str(r.filingDate),
    freeCashFlow: num(r.freeCashFlow),
    operatingCashFlow: num(r.operatingCashFlow),
    capitalExpenditure: num(r.capitalExpenditure),
  };
}

/**
 * The issuer whose earnings a row reports: its filer, or, for a predecessor's
 * row that the successor's own filing re-presents unchanged, the successor
 * (audit 2026-10-22 B-36).
 */
function economicIssuerId(row: FmpStatementRow): string | null {
  return row.predecessor === true ? str(row.successorCik) ?? str(row.cik) : str(row.cik);
}

function commonFlowScope(row: FmpStatementRow, field: string, basis: "annual" | "quarter" | "ttm"): CommonIncomeFlowScope {
  const evidence = row.fieldProvenance?.[field];
  return { issuerId: economicIssuerId(row), currency: evidence?.unit ?? str(row.reportedCurrency),
    periodStart: evidence?.periodStart ?? str(row.periodStart), periodEnd: evidence?.periodEnd ?? str(row.date), basis,
    observedAt: evidence?.observedAt,
    // Primary field evidence belongs to this operand; unrelated row timing
    // cannot veto it. Vendor row timing is used only without field evidence.
    filedAt: evidence ? evidence.filings.map(filing => filing.filed)
      : [str(row.filingDate)].filter((date): date is string => date !== null),
    acceptedAt: evidence ? undefined : str(row.acceptedDate),
    allocationBasis: field === "netIncomeAvailableToCommon" && evidence?.tags.includes("us-gaap/NetIncomeLossAvailableToCommonStockholdersBasic")
      ? "basic-eps-common-stockholders" : "unknown" };
}

function commonIncomeEvidence(row: FmpIncomeStatementRow, basis: "annual" | "quarter", admissionAsOf?: string): CommonIncomeInputs {
  const tags = row.fieldProvenance?.netIncome?.tags ?? [];
  const consolidatedTag = tagsFor("netIncomeConsolidated").some(tag => tags.includes(`us-gaap/${tag}`));
  // Consolidated profit less the NCI share is the parent's figure (audit B-18).
  const nciDeducted = consolidatedTag && tagsFor("netIncomeAttributableToNoncontrollingInterest").some(tag => tags.includes(`us-gaap/${tag}`));
  const ownership = row.netIncomeOwnershipBasis === "parent" || row.netIncomeOwnershipBasis === "consolidated" ? row.netIncomeOwnershipBasis :
    nciDeducted ? "parent" : consolidatedTag ? "consolidated" :
      tags.includes("us-gaap/NetIncomeLoss") ? "parent" : undefined;
  return { netIncome: num(row.netIncome), netIncomeAvailableToCommon: num(row.netIncomeAvailableToCommon),
    admissionAsOf, targetScope: { issuerId: economicIssuerId(row), currency: str(row.reportedCurrency), periodStart: str(row.periodStart), periodEnd: str(row.date), basis },
    incomeScope: commonFlowScope(row, "netIncome", basis), commonIncomeScope: commonFlowScope(row, "netIncomeAvailableToCommon", basis),
    noncontrollingIncomeScope: commonFlowScope(row, "netIncomeAttributableToNoncontrollingInterest", basis),
    noncontrollingIncome: num(row.netIncomeAttributableToNoncontrollingInterest), netIncomeOwnershipBasis: ownership,
    netIncomeWithheldReason: row.netIncomeAttributableToNoncontrollingInterest != null && num(row.netIncomeAttributableToNoncontrollingInterest) === null ? "noncontrolling-income allocation is invalid or nonfinite in the source row" : null,
    commonIncomeWithheldReason: row.fieldConflicts?.netIncomeAvailableToCommon?.usable === false ? row.fieldConflicts.netIncomeAvailableToCommon.reason : null };
}

/** Preferred existence is not currency arithmetic; a closing zero cannot erase the flow window. */
function preferredClaimsInFlow(scope: CommonIncomeFlowScope | undefined, balances: readonly FmpBalanceSheetRow[], cash: readonly FmpCashFlowRow[] = []): boolean {
  if (!scope?.periodEnd) return false;
  const end = Date.parse(scope.periodEnd);
  // Unknown vendor starts retain their sourced annual scope. Use the existing
  // maximum annual duration only for conservative existence evidence, never subtraction.
  const opening = scope.periodStart ? Date.parse(scope.periodStart) - 86_400_000 : end - (scope.basis === "quarter" ? 135 : 400) * 86_400_000;
  return balances.some(row => num(row.preferredStock) !== null && Number(row.preferredStock) > 0 &&
    Date.parse(String(row.date)) >= opening && Date.parse(String(row.date)) <= end) || cash.some(row => {
      if (num(row.preferredDividendsPaid) === null || row.preferredDividendsPaid === 0) return false;
      const cashScope = commonFlowScope(row, "preferredDividendsPaid", scope.basis === "quarter" ? "quarter" : "annual");
      return cashScope.periodEnd != null && Date.parse(cashScope.periodEnd) >= opening &&
        (cashScope.periodStart != null ? Date.parse(cashScope.periodStart) <= end : Date.parse(cashScope.periodEnd) <= end);
    });
}

function toReturnsIncome(
  r: FmpIncomeStatementRow,
  /** Preferred dividends by fiscal date, joined from the cash-flow statement. */
  preferredByDate?: Map<string, FmpCashFlowRow>,
  balances: readonly FmpBalanceSheetRow[] = [],
  cashEvidence: readonly FmpCashFlowRow[] = [],
  admissionAsOf?: string,
): ReturnsIncomeRow {
  // Nearby cash is exposure evidence only, never an earnings allocation.
  const prefRow = preferredByDate ? matchByDate(preferredByDate, String(r.date ?? "")) : null;
  const evidence = commonIncomeEvidence(r, "annual", admissionAsOf);
  return {
    ...evidence,
    date: String(r.date ?? ""),
    acceptedDate: str(r.acceptedDate),
    filingDate: str(r.filingDate),
    preferredDividendsPaid: prefRow ? num(prefRow.preferredDividendsPaid) : null,
    preferredCashScope: prefRow ? commonFlowScope(prefRow, "preferredDividendsPaid", "annual") : undefined,
    preferredClaimsInPeriod: preferredClaimsInFlow(evidence.incomeScope, balances, cashEvidence),
    revenue: num(r.revenue),
    operatingIncome: num(r.operatingIncome),
    // ROIC's EBIT is operating income; raw vendor EBIT may include other income.
    ebit: num(r.operatingIncome),
    incomeBeforeTax: num(r.incomeBeforeTax),
    incomeTaxExpense: num(r.incomeTaxExpense),
    netIncome: num(r.netIncome),
  };
}

/** A legacy consolidated-total stand-in never establishes parent ownership. */
function statementEquityOwnershipBasis(row: FmpBalanceSheetRow | null | undefined): "parent" | "consolidated" | undefined {
  if (!row) return undefined;
  const parentTags = row.fieldProvenance?.totalStockholdersEquity?.tags ?? [];
  const fromConsolidatedTotal = tagsFor("totalEquity").some(tag => parentTags.includes(`us-gaap/${tag}`));
  const parentEstablished = tagsFor("totalStockholdersEquity").some(tag => parentTags.includes(`us-gaap/${tag}`)) ||
    tagsFor("minorityInterest").some(tag => parentTags.includes(`us-gaap/${tag}`)) ||
    row.fieldProvenance?.totalStockholdersEquity?.calculation === "nci-inferred-zero" ||
    row.fieldProvenance?.totalStockholdersEquity?.calculation === "total-equity-less-equity-statement-nci";
  if (fromConsolidatedTotal && !parentEstablished) return "consolidated";
  if (num(row.totalStockholdersEquity) !== null) return "parent";
  return num(row.totalEquity) !== null ? "consolidated" : undefined;
}

function statementParentEquity(row: FmpBalanceSheetRow | null | undefined): number | null {
  return statementEquityOwnershipBasis(row) === "consolidated" ? null : num(row?.totalStockholdersEquity);
}

/** The three filed temporary-equity amounts of a balance row, without the refusals (those ride in the row's own `fieldConflicts`). */
function temporaryEquityFields(row: FmpBalanceSheetRow) {
  const operands = temporaryEquityOperands(row);
  return {
    ...(operands.temporaryEquity !== undefined ? { temporaryEquity: operands.temporaryEquity } : {}),
    ...(operands.temporaryEquityAttributableToParent !== undefined ? { temporaryEquityAttributableToParent: operands.temporaryEquityAttributableToParent } : {}),
    ...(operands.temporaryEquityAttributableToNoncontrollingInterest !== undefined ? { temporaryEquityAttributableToNoncontrollingInterest: operands.temporaryEquityAttributableToNoncontrollingInterest } : {}),
  };
}

function toReturnsBalance(r: FmpBalanceSheetRow): ReturnsBalanceRow {
  return {
    commonEquityPeriodEnd: r.fieldProvenance?.totalStockholdersEquity?.periodEnd ?? String(r.date ?? ""),
    ...(r.fieldConflicts !== undefined ? { fieldConflicts: r.fieldConflicts } : {}),
    leaseCoverageNote: incompleteLeaseCoverage(r)?.note,
    fieldProvenance: r.fieldProvenance,
    shortTermDebt: num(r.shortTermDebt), longTermDebt: num(r.longTermDebt),
    date: String(r.date ?? ""),
    acceptedDate: str(r.acceptedDate),
    filingDate: str(r.filingDate),
    totalDebt: num(r.totalDebt),
    // The operating-lease slice of totalDebt (EDGAR route only) — invested
    // capital removes it on the EV bridge's lease rule.
    capitalLeaseObligations: num(r.capitalLeaseObligations),
    operatingLeaseLiability: num(r.operatingLeaseLiability),
    financeLeaseLiability: num(r.financeLeaseLiability),
    totalStockholdersEquity: statementParentEquity(r),
    totalEquity: num(r.totalEquity),
    minorityInterest: num(r.minorityInterest),
    cashAndCashEquivalents: num(r.cashAndCashEquivalents),
    // Invested capital nets the same cash the house net-debt resolver does.
    shortTermInvestments: num(r.shortTermInvestments),
    // Tangible common equity components (ROTE denominator).
    goodwill: num(r.goodwill),
    intangibleAssets: num(r.intangibleAssets),
    preferredStock: num(r.preferredStock),
    // FIN-119-V1: temporary equity is financing capital (and its refusals ride in `fieldConflicts` above).
    ...temporaryEquityFields(r),
    cashAndShortTermInvestments: num(r.cashAndShortTermInvestments),
    totalAssets: num(r.totalAssets),
  };
}

function toCapitalIncome(r: FmpIncomeStatementRow): CapitalIncomeRow {
  return {
    date: String(r.date ?? ""),
    acceptedDate: str(r.acceptedDate),
    filingDate: str(r.filingDate),
    revenue: num(r.revenue),
    operatingIncome: num(r.operatingIncome),
    // Coverage and own-computed EBITDA share the operating-income basis.
    ebit: num(r.operatingIncome),
    ebitda: num(r.ebitda),
    interestExpense: num(r.interestExpense),
    netIncome: num(r.netIncome),
    weightedAverageShsOutDil: num(r.weightedAverageShsOutDil),
    weightedAverageShsOut: num(r.weightedAverageShsOut),
  };
}

function toCapitalCashFlow(r: FmpCashFlowRow): CapitalCashFlowRow {
  return {
    date: String(r.date ?? ""),
    acceptedDate: str(r.acceptedDate),
    filingDate: str(r.filingDate),
    netIncome: num(r.netIncome),
    depreciationAndAmortization: num(r.depreciationAndAmortization),
    stockBasedCompensation: num(r.stockBasedCompensation),
    operatingCashFlow: num(r.operatingCashFlow),
    capitalExpenditure: num(r.capitalExpenditure),
    freeCashFlow: num(r.freeCashFlow),
    financeLeasePrincipalPayments: num(r.financeLeasePrincipalPayments),
    issuerFreeCashFlow: num(r.issuerFreeCashFlow),
    issuerFreeCashFlowDefinition: str(r.issuerFreeCashFlowDefinition),
    fieldConflicts: r.fieldConflicts,
    commonStockRepurchased: num(r.commonStockRepurchased),
  };
}

function toCapitalBalance(r: FmpBalanceSheetRow): CapitalBalanceRow {
  return {
    fieldProvenance: r.fieldProvenance,
    fieldConflicts: r.fieldConflicts,
    shortTermDebt: num(r.shortTermDebt), longTermDebt: num(r.longTermDebt),
    date: String(r.date ?? ""),
    totalDebt: num(r.totalDebt),
    capitalLeaseObligations: num(r.capitalLeaseObligations),
    ...(num(r.capitalLeaseObligationsCurrent) !== null ? { capitalLeaseObligationsCurrent: num(r.capitalLeaseObligationsCurrent) } : {}),
    ...(num(r.capitalLeaseObligationsNonCurrent) !== null ? { capitalLeaseObligationsNonCurrent: num(r.capitalLeaseObligationsNonCurrent) } : {}),
    operatingLeaseLiability: num(r.operatingLeaseLiability),
    financeLeaseLiability: num(r.financeLeaseLiability),
    // Review m8: the vendor's own figure when the completion recomposed netDebt (diagnostic only).
    netDebt: num(r.vendorNetDebt !== undefined ? r.vendorNetDebt : r.netDebt),
    cashAndCashEquivalents: num(r.cashAndCashEquivalents),
    shortTermInvestments: num(r.shortTermInvestments),
    cashAndShortTermInvestments: num(r.cashAndShortTermInvestments),
    ...(num(r.marketableEquitySecurities) !== null ? { marketableEquitySecurities: num(r.marketableEquitySecurities) } : {}),
  };
}

function toForensicsIncome(r: FmpIncomeStatementRow): ForensicsIncomeRow {
  return {
    fieldConflicts: r.fieldConflicts,
    fieldProvenance: r.fieldProvenance,
    date: String(r.date ?? ""),
    fiscalYear: str(r.fiscalYear),
    period: str(r.period),
    revenue: num(r.revenue),
    costOfRevenue: num(r.costOfRevenue),
    grossProfit: num(r.grossProfit),
    sellingGeneralAndAdministrativeExpenses: num(r.sellingGeneralAndAdministrativeExpenses),
    generalAndAdministrativeExpenses: num(r.generalAndAdministrativeExpenses),
    sellingAndMarketingExpenses: num(r.sellingAndMarketingExpenses),
    depreciationAndAmortization: num(r.depreciationAndAmortization),
    ebit: num(r.ebit),
    operatingIncome: num(r.operatingIncome),
    interestExpense: num(r.interestExpense),
    incomeTaxExpense: num(r.incomeTaxExpense),
    netIncome: num(r.netIncome),
    netIncomeConsolidated: num(r.netIncomeConsolidated),
    netIncomeAttributableToNoncontrollingInterest: num(r.netIncomeAttributableToNoncontrollingInterest),
    netIncomeFromContinuingOperations: num(r.netIncomeFromContinuingOperations),
    netIncomeFromDiscontinuedOperations: num(r.netIncomeFromDiscontinuedOperations),
    totalOtherIncomeExpensesNet: num(r.totalOtherIncomeExpensesNet),
  };
}

function toForensicsBalance(r: FmpBalanceSheetRow): ForensicsBalanceRow {
  return {
    date: String(r.date ?? ""),
    totalAssets: num(r.totalAssets),
    totalCurrentAssets: num(r.totalCurrentAssets),
    cashAndShortTermInvestments: num(r.cashAndShortTermInvestments),
    accountsReceivables: num(r.accountsReceivables),
    netReceivables: num(r.netReceivables),
    inventory: num(r.inventory),
    propertyPlantEquipmentNet: num(r.propertyPlantEquipmentNet),
    totalLiabilities: num(r.totalLiabilities),
    totalCurrentLiabilities: num(r.totalCurrentLiabilities),
    shortTermDebt: num(r.shortTermDebt),
    // Leverage tests read long-term debt alone; a composed figure holding
    // current notes would count those notes twice beside current liabilities.
    longTermDebt: longTermDebtHoldsCurrent(r.fieldProvenance?.longTermDebt?.tags) ? null : num(r.longTermDebt),
    // Audit 2026-10-22 E-8: kept with its tags for the Piotroski leverage direction.
    longTermDebtComposed: longTermDebtHoldsCurrent(r.fieldProvenance?.longTermDebt?.tags) && num(r.longTermDebt) !== null
      ? { value: num(r.longTermDebt)!, tags: [...r.fieldProvenance!.longTermDebt!.tags] }
      : null,
    taxPayables: num(r.taxPayables),
    retainedEarnings: num(r.retainedEarnings),
    totalStockholdersEquity: num(r.totalStockholdersEquity),
    totalEquity: num(r.totalEquity),
    minorityInterest: num(r.minorityInterest),
    totalDebt: num(r.totalDebt),
    // D-61: financial assets leave net operating assets (Richardson et al. 2005).
    longTermInvestments: num(r.longTermInvestments),
    // D-68: what an acquisition adds to NOA and to AQI's numerator.
    goodwill: num(r.goodwill),
    intangibleAssets: num(r.intangibleAssets),
  };
}

function toForensicsCashFlow(r: FmpCashFlowRow): ForensicsCashFlowRow {
  return {
    date: String(r.date ?? ""),
    netIncome: num(r.netIncome),
    depreciationAndAmortization: num(r.depreciationAndAmortization),
    netCashProvidedByOperatingActivities: num(r.netCashProvidedByOperatingActivities),
    netCashProvidedByInvestingActivities: num(r.netCashProvidedByInvestingActivities),
    commonStockIssuance: num(r.commonStockIssuance),
    // D-61: the financial-asset components of investing cash flow.
    purchasesOfInvestments: num(r.purchasesOfInvestments),
    salesMaturitiesOfInvestments: num(r.salesMaturitiesOfInvestments),
    otherInvestingActivities: num(r.otherInvestingActivities),
    acquisitionsNet: num(r.acquisitionsNet),
  };
}

/**
 * D-68: one fiscal year's value of a duration tag from the filer's own
 * companyfacts (latest core-form filing, annual duration, in the statements'
 * currency); null when untagged.
 */
function annualTaggedValue(facts: CompanyFacts | null, tag: string, end: string, currency: string | null): number | null {
  if (facts === null || end.length === 0) return null;
  const series = tagPoints(facts, tag, currency ?? undefined);
  if (series === null || (currency !== null && series.unit.toUpperCase() !== currency.toUpperCase())) return null;
  const { point } = findPointForPeriod(series.points, { end, durationHint: "FY", toleranceDays: 7 });
  return point !== null && Number.isFinite(point.val) ? point.val : null;
}

/**
 * D-68: forensic context the vendor statements do not carry, from the
 * filer's tags: inventory write-downs (GMI), and a business acquisition the
 * filer reports on a line of its own (us-gaap
 * PaymentsToAcquireBusinessTwoNetOfCashAcquired) that the vendor row folds
 * into other investing — NVIDIA's FY2026 $13.0B. The payment is attributed to
 * acquisitions only when no competing acquisitions line exists. Companyfacts
 * supplies no additive presentation linkage; unresolved overlap is retained.
 */
function withFiledForensicContext(
  rows: { income: ForensicsIncomeRow[]; cashFlow: ForensicsCashFlowRow[] },
  facts: CompanyFacts | null,
  currency: string | null,
): { income: ForensicsIncomeRow[]; cashFlow: ForensicsCashFlowRow[] } {
  if (facts === null) return rows;
  return {
    income: rows.income.map((row) => {
      const writeDown = annualTaggedValue(facts, "InventoryWriteDown", row.date, currency);
      return writeDown !== null && writeDown >= 0 ? { ...row, inventoryWriteDown: writeDown } : row;
    }),
    cashFlow: rows.cashFlow.map((row) => {
      const second = annualTaggedValue(facts, "PaymentsToAcquireBusinessTwoNetOfCashAcquired", row.date, currency);
      const acquisitions = row.acquisitionsNet ?? null;
      const other = row.otherInvestingActivities ?? null;
      if (second === null || second <= 0 || other === null || other > -second * 0.995) return row;
      // Matching generic primary/secondary tags may be aggregate/component
      // facts. Neither their values nor other investing's size proves exclusion.
      return acquisitions === null || acquisitions === 0
        ? { ...row, acquisitionsInOtherInvesting: -second }
        : { ...row, acquisitionsInOtherInvestingUnresolved: second };
    }),
  };
}

function toOhlcv(r: FmpRawRow): OhlcvRow {
  return {
    date: String(r.date ?? ""),
    open: num(r.open) ?? 0,
    high: num(r.high) ?? 0,
    low: num(r.low) ?? 0,
    close: num(r.close) ?? 0,
    volume: num(r.volume),
  };
}

// ---------------------------------------------------------------------------
// TTM synthesis: sum the latest 4 quarters for flow fields. Diluted EPS uses
// the separately labeled quarter-sum convention, not a reconstructed annual EPS.
// Returns null when fewer than 4 quarters are available.
// ---------------------------------------------------------------------------

export interface TtmIncome {
  date: string;
  /**
   * The window's one currency. ttmIncome returns no window at all when its
   * currency is not established, so a window it returns always carries one.
   */
  reportedCurrency: string | null;
  /** True when an unlabelled quarter's currency came from another statement of the same filing. */
  currencyFromSameFilingStatements: boolean;
  revenue: number | null;
  operatingIncome: number | null;
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

function normalizeStatementQuarters<T extends FiscalDatedRow>(
  rows: readonly T[],
  family: "income" | "cashFlow" | "balance",
  gaps?: ManifestEntry[],
): NormalizedQuarterSet<T> {
  const normalized = normalizeQuarterRows(rows);
  const disclosure = quarterRowsGap(family, normalized.rejected);
  if (disclosure) gaps?.push(disclosure);
  return normalized;
}

function rejectedAffectsCurrentWindow<T extends FiscalDatedRow>(
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

/** A statement row as currency evidence: its period end, its own label and its filing identity. */
export type CurrencyEvidenceRow = { date?: unknown; reportedCurrency?: unknown; acceptedDate?: unknown; cik?: unknown };

function filingField(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Whether two statement rows are provably parts of ONE filing: the same period
 * end AND the same SEC acceptance timestamp (and the same CIK when both state
 * one). A shared period-end date alone proves nothing — an amended filing, a
 * restatement or another provider feed can close on the same day in another
 * presentation currency.
 */
function sameFiling(a: CurrencyEvidenceRow, b: CurrencyEvidenceRow): boolean {
  const day = isoDay(a.date);
  if (day === null || isoDay(b.date) !== day) return false;
  const accepted = filingField(a.acceptedDate);
  if (accepted === null || accepted !== filingField(b.acceptedDate)) return false;
  const cik = (row: CurrencyEvidenceRow) => filingField(row.cik)?.replace(/^0+/, "") ?? null;
  return cik(a) === null || cik(b) === null || cik(a) === cik(b);
}

/** What the evidence says about one quarter's currency. */
type QuarterCurrency =
  | { state: "known"; code: string; fromSameFiling: boolean }
  | { state: "unknown"; unlinkedLabels: boolean }
  | { state: "conflict"; codes: string[] };

function quarterCurrency(row: CurrencyEvidenceRow, siblings: readonly CurrencyEvidenceRow[]): QuarterCurrency {
  const own = normalizeReportedCurrency(row.reportedCurrency);
  const linked = siblings.filter((sibling) => sameFiling(row, sibling));
  const codes = new Set<string>(own === null ? [] : [own]);
  for (const sibling of linked) {
    const code = normalizeReportedCurrency(sibling.reportedCurrency);
    if (code !== null) codes.add(code);
  }
  // A filing presents its statements in one currency: two codes within it are
  // conflicting evidence, never "no evidence".
  if (codes.size > 1) return { state: "conflict", codes: [...codes].sort() };
  if (codes.size === 1) return { state: "known", code: [...codes][0]!, fromSameFiling: own === null };
  const day = isoDay(row.date);
  return {
    state: "unknown",
    unlinkedLabels: siblings.some(
      (sibling) => day !== null && isoDay(sibling.date) === day && normalizeReportedCurrency(sibling.reportedCurrency) !== null,
    ),
  };
}

/**
 * The one currency four quarters are in, established row by row, keeping the
 * three kinds of evidence apart:
 *
 *  - `known`: every quarter is established in the same code — by its own
 *    label, or by the other statements of THE SAME FILING (sameFiling) when
 *    it has none. The annual statement is never evidence for a quarter.
 *  - `conflict`: some quarter's evidence names two currencies.
 *  - `mixed`: the quarters are each established, in different currencies.
 *  - `unknown`: at least one quarter has no evidence at all.
 *
 * Only a `known` window is a sum; any other state withholds it from every use.
 */
type WindowCurrency =
  | { state: "known"; code: string; fromSameFiling: boolean }
  | { state: "unknown" | "conflict" | "mixed"; detail: string };

function resolveQuarterCurrency(
  rows: readonly CurrencyEvidenceRow[],
  siblings: readonly CurrencyEvidenceRow[],
): WindowCurrency {
  const quarters = rows.map((row) => ({ day: isoDay(row.date) ?? String(row.date ?? "?"), evidence: quarterCurrency(row, siblings) }));
  const describe = ({ day, evidence }: (typeof quarters)[number]): string =>
    `${day} ${
      evidence.state === "known" ? evidence.code : evidence.state === "conflict" ? `conflict (${evidence.codes.join(" vs ")})` : "unknown"
    }`;
  const conflicts = quarters.filter((q) => q.evidence.state === "conflict");
  if (conflicts.length > 0) return { state: "conflict", detail: conflicts.map(describe).join(", ") };
  const known = quarters.flatMap((q) => (q.evidence.state === "known" ? [q.evidence] : []));
  const codes = new Set(known.map((k) => k.code));
  if (codes.size > 1) return { state: "mixed", detail: quarters.map(describe).join(", ") };
  if (known.length === quarters.length && known.length > 0) {
    return { state: "known", code: known[0]!.code, fromSameFiling: known.some((k) => k.fromSameFiling) };
  }
  const unlinked = quarters.some((q) => q.evidence.state === "unknown" && q.evidence.unlinkedLabels);
  return {
    state: "unknown",
    detail:
      (known.length === 0 ? "no quarter carries a currency label" : `only some quarters are established (${quarters.map(describe).join(", ")})`) +
      (unlinked
        ? ", and the same-period rows that do carry one are not linked to the same filing (no shared SEC acceptance timestamp), so their label is not the quarter's"
        : ", and no other statement of the same filing supplies one"),
  };
}

/**
 * The one currency a set of statement rows is established in — each row by its
 * own label or its own filing's other statements — or null when any row is
 * unknown or in conflict, or two rows differ.
 */
function establishedRowsCurrency(
  rows: readonly CurrencyEvidenceRow[],
  siblings: readonly CurrencyEvidenceRow[],
): string | null {
  const codes = new Set<string | null>(
    rows.map((row) => {
      const evidence = quarterCurrency(row, siblings);
      return evidence.state === "known" ? evidence.code : null;
    }),
  );
  return rows.length > 0 && codes.size === 1 && !codes.has(null) ? ([...codes][0] ?? null) : null;
}

type StatementFamily = "incomeAnnual" | "balanceAnnual" | "cashflowAnnual" | "balanceQuarterly" | "incomeQuarterly" | "cashflowQuarterly";

const STATEMENT_FAMILY: Record<StatementFamily, { label: string; endpoint: string }> = {
  incomeAnnual: { label: "annual income statement", endpoint: "fmp:/stable/income-statement" },
  balanceAnnual: { label: "annual balance sheet", endpoint: "fmp:/stable/balance-sheet-statement" },
  cashflowAnnual: { label: "annual cash-flow statement", endpoint: "fmp:/stable/cash-flow-statement" },
  balanceQuarterly: { label: "quarterly balance sheet", endpoint: "fmp:/stable/balance-sheet-statement?period=quarter" },
  incomeQuarterly: { label: "quarterly income statement", endpoint: "fmp:/stable/income-statement?period=quarter" },
  cashflowQuarterly: { label: "quarterly cash-flow statement", endpoint: "fmp:/stable/cash-flow-statement?period=quarter" },
};

/**
 * The rows of one statement family that may be COMBINED with the model's other
 * rows — across statements (interest over debt, net income over equity, EBIT
 * against net debt) or across years (growth rates, averages, forensic deltas).
 *
 * A row qualifies only when its currency is ESTABLISHED (own label, or a
 * statement of the same filing) as the model currency. Missing evidence
 * establishes nothing, and no exchange rate is invented. Walking back from
 * the newest row, the history stops at the first row that does not qualify:
 * a gap year is never skipped over, so a "YoY" or a two-year average can
 * never silently span a currency change. The rows left out stay in the
 * statements as reported; only the calculations that combine rows lose them,
 * and the gap says why.
 */
function rowsInModelCurrency<T extends CurrencyEvidenceRow>(
  family: StatementFamily,
  rows: readonly T[],
  model: string | null,
  evidence: readonly CurrencyEvidenceRow[],
): { rows: T[]; gap: ManifestEntry | null } {
  const ordered = rows
    .map((row, index) => ({ row, index, day: isoDay(row.date) }))
    .sort((a, b) => (b.day ?? "").localeCompare(a.day ?? "") || a.index - b.index);
  const kept = new Set<T>();
  let breakAt: { day: string; evidence: QuarterCurrency } | null = null;
  let excluded = 0;
  for (const { row, day } of ordered) {
    if (breakAt === null) {
      const found = quarterCurrency(row, evidence);
      if (model !== null && day !== null && found.state === "known" && found.code === model) {
        kept.add(row);
        continue;
      }
      breakAt = { day: day ?? String(row.date ?? "?"), evidence: found };
    }
    excluded += 1;
  }
  if (breakAt === null) return { rows: [...rows], gap: null };

  const { label, endpoint } = STATEMENT_FAMILY[family];
  const found = breakAt.evidence;
  const why =
    model === null
      ? "the model's own currency is not established, so no row can be shown to share it"
      : found.state === "known"
        ? `the ${label} for ${breakAt.day} is in ${found.code} but the model runs in ${model}`
        : found.state === "conflict"
          ? `the currency evidence for the ${label} of ${breakAt.day} is in conflict (${found.codes.join(" vs ")}) while the model runs in ${model}`
          : `the ${label} for ${breakAt.day} carries no currency label and no statement of the same filing supplies one, so its currency is not established (unknown), and it is not assumed to be the model's ${model}`;
  const scope =
    model === null
      ? `all ${excluded} ${label} row${excluded === 1 ? "" : "s"} are`
      : excluded === 1
        ? "that row is"
        : `that row and the ${excluded - 1} older one${excluded === 2 ? "" : "s"} are`;
  return {
    rows: rows.filter((row) => kept.has(row)),
    gap: {
      field: `compute.${family}.currency`,
      reason:
        `${why}. No FX conversion is applied, so ${scope} left out of every calculation that combines statements or ` +
        "years (cost of debt, WACC, ROIC and DuPont, net debt, the DCF and multiples bridges, forensic scores, growth rates " +
        "and projections), and those figures are withheld where they depended on them; each row's own margins and its " +
        "reported figures remain, in their own currency or as currency unknown",
      severity: "warn",
      attemptedSources: [endpoint],
    },
  };
}

/**
 * Every statement row of a bundle, as currency evidence: a row's own label,
 * and the labels of the statements filed with it (sameFiling). Tolerant of a
 * degraded bundle missing members.
 */
export function statementCurrencyEvidence(bundle: DataBundle): CurrencyEvidenceRow[] {
  const statements: Partial<DataBundle["statements"]> = bundle.statements ?? {};
  const rows = (f: FmpFetch<FmpRawRow> | undefined): FmpRawRow[] => (f === undefined ? [] : rowsOf(f));
  return [
    ...rows(statements.incomeAnnual),
    ...rows(statements.balanceAnnual),
    ...rows(statements.cashflowAnnual),
    ...rows(statements.incomeQuarterly),
    ...rows(statements.balanceQuarterly),
    ...rows(statements.cashflowQuarterly),
  ];
}

/**
 * The currency the statement row(s) for one period end are established in —
 * each by its own label or a statement of the same filing — or null when no
 * row has that date, any is unknown or in conflict, or two differ.
 */
export function establishedCurrencyOn(
  rows: readonly CurrencyEvidenceRow[],
  date: string | null,
  evidence: readonly CurrencyEvidenceRow[],
): string | null {
  const day = date === null ? null : isoDay(date);
  return day === null ? null : establishedRowsCurrency(rows.filter((row) => isoDay(row.date) === day), evidence);
}

/** Withhold a window whose currency is not established; null when it is. */
function windowCurrencyGap(
  window: "income" | "cash-flow",
  currency: WindowCurrency,
  endpoint: string,
): ManifestEntry | null {
  const field = window === "income" ? "compute.ttmIncome" : "compute.ttmCashFlow";
  const fallback = "the TTM basis is suppressed; latest annual statement used instead";
  switch (currency.state) {
    case "known":
      return null;
    case "mixed":
      return {
        field,
        reason: `latest 4 quarterly rows are not in one reporting currency (${currency.detail}) — a sum across currencies is no figure at all, so ${fallback}`,
        severity: "warn",
        attemptedSources: [endpoint],
      };
    case "conflict":
      return {
        field,
        reason:
          `latest 4 quarterly ${window} rows' currency evidence is in conflict (${currency.detail}): statements of one ` +
          `filing name different currencies, so no quarter's currency is established — ${fallback}`,
        severity: "warn",
        attemptedSources: [endpoint],
      };
    case "unknown":
      return {
        field: `${field}.currency`,
        reason:
          `the latest 4 quarterly ${window} rows' reporting currency could not be established: ${currency.detail}; the ` +
          "annual statement's currency is not evidence for the quarters. A sum of quarters not shown to share one " +
          "currency is not a figure, so it is withheld from every use — the DCF anchor, the price multiples, and the " +
          `ratios and signs built on its sums (interest coverage, cost of debt, tax rate, routing) — and ${fallback}`,
        severity: "warn",
        attemptedSources: [endpoint],
      };
  }
}

/** Non-null quarter count for a field (completeness gate for critical sums). */
function countField(rows: FmpIncomeStatementRow[], key: keyof FmpIncomeStatementRow): number {
  let n = 0;
  for (const r of rows) if (num(r[key]) !== null) n++;
  return n;
}

/**
 * TTM income from the latest 4 quarterly income rows (newest first).
 *
 * Completeness gating (2026-07 audit): revenue routes the pre-revenue overlay
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
 * Contiguity gating (2026-07-09 audit M1): the 4 rows must also BE the last
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

function ttmIncomeFromNormalized(
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

  // Contiguity gate (audit M1): a non-TTM window must never be labeled TTM.
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
      field: "compute.ttmIncome",
      reason: `revenue present in only ${revenueCount}/4 latest quarters — TTM basis suppressed (a partial sum would understate it); latest annual statement used instead`,
      severity: "info",
      attemptedSources: ["fmp:/stable/income-statement?period=quarter"],
    });
    return null;
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

  // Bottom-line fields feed routing (unprofitable overlay) and multiples
  // (P/E, EPS): a 3-of-4-quarter partial sum silently understates them —
  // e.g. an inflated P/E from missing a quarter of earnings. Gate them at
  // field level (not whole-row) with a disclosed suppression, same rationale
  // as the tax pair. All remaining period-flow fields are gated below as
  // well; missing is not equivalent to zero for a TTM calculation.
  const gateComplete = (key: keyof FmpIncomeStatementRow): number | null => {
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

  return {
    date: String(q[0].date ?? ""),
    // One established code for all four quarters (the gate above).
    reportedCurrency: windowCurrency.code,
    currencyFromSameFilingStatements: windowCurrency.fromSameFiling,
    revenue: sumField(q, "revenue"),
    operatingIncome: gateComplete("operatingIncome"),
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
    incomeBeforeTax,
    incomeTaxExpense,
    // D-60: only the scenario margin ceiling reads it, and it falls back to the
    // latest fiscal year, so a partial window is simply not a TTM figure.
    grossProfit: countField(q, "grossProfit") === 4 ? sumField(q, "grossProfit") : null,
  };
}

/**
 * Effective tax rate from TTM statements (incomeTaxExpense / incomeBeforeTax)
 * for when the FMP ratios endpoints return nothing (the 6× missing
 * `returns.wacc.effectiveTaxRate` in the run-history audit). The two fields
 * are gated as a complete pair in ttmIncome, so the ratio never mixes quarter
 * subsets. Pre-tax losses return null — a negative-base "rate" is meaningless
 * for WACC (computeWacc suppresses a levered WACC when no observed rate exists).
 */
export function effectiveTaxRateFromTtm(ttm: TtmIncome | null): number | null {
  if (ttm === null || ttm.incomeTaxExpense === null || ttm.incomeBeforeTax === null) return null;
  if (!(ttm.incomeBeforeTax > 0)) return null;
  return ttm.incomeTaxExpense / ttm.incomeBeforeTax;
}

export interface WaccStatementTaxRate {
  rate: number | null;
  basis: string | null;
  /** Set when the rate is a fallback (not the TTM observed rate): the disclosure for the manifest. */
  fallback: string | null;
}

/**
 * The WACC's statement tax rate when no vendor ratio exists (audit 2026-10-22
 * B-32, owner decision): the TTM observed rate; on a TTM pre-tax loss a 0%
 * shield; with no complete TTM pair the latest annual observed rate, or a 0%
 * shield on an annual pre-tax loss. Every fallback is named. Nothing here
 * invents a rate: with neither pair the result stays null and computeWacc
 * withholds a levered WACC. The 0–35% clamp in computeWacc still applies and
 * discloses itself.
 */
export function waccTaxRateFromStatements(ttm: TtmIncome | null, latestAnnual: FmpIncomeStatementRow | undefined): WaccStatementTaxRate {
  const ttmRate = effectiveTaxRateFromTtm(ttm);
  if (ttmRate !== null) {
    return { rate: ttmRate, basis: "TTM incomeTaxExpense / incomeBeforeTax from the statements (observed effective rate)", fallback: null };
  }
  const zeroShield = (why: string) => {
    const basis = `0% tax shield: ${why}, so no effective rate exists and the debt is given no tax shield (house rule, audit 2026-10-22 B-32)`;
    return { rate: 0, basis, fallback: basis };
  };
  if (ttm !== null && ttm.incomeBeforeTax !== null && ttm.incomeTaxExpense !== null) {
    return zeroShield(`TTM pre-tax income is not positive (${ttm.incomeBeforeTax} through ${ttm.date})`);
  }
  const date = isoDay(latestAnnual?.date);
  const pretax = num(latestAnnual?.incomeBeforeTax);
  const tax = num(latestAnnual?.incomeTaxExpense);
  if (date === null || pretax === null || tax === null) return { rate: null, basis: null, fallback: null };
  if (!(pretax > 0)) return zeroShield(`no complete TTM tax pair, and the latest annual pre-tax income is not positive (${pretax}, FY ending ${date})`);
  const basis = `latest annual incomeTaxExpense / incomeBeforeTax, FY ending ${date} (observed effective rate; no complete TTM tax pair exists)`;
  return { rate: tax / pretax, basis, fallback: basis };
}

interface TtmCashFlow {
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

function ttmCashFlowFromNormalized(
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
  // Contiguity gate (audit M1) — identical to ttmIncome.
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

function resolveStatementCurrencies(
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
  const income = normalizeStatementQuarters(rows(statements.incomeQuarterly), "income");
  const balance = normalizeStatementQuarters(rows(statements.balanceQuarterly), "balance");
  const cashflow = normalizeStatementQuarters(rows(statements.cashflowQuarterly), "cashFlow");
  return resolveStatementCurrencies(
    bundle.profile === undefined ? undefined : firstRow(bundle.profile)?.currency,
    rows(statements.incomeAnnual)[0],
    ttmIncomeFromNormalized(income, undefined, [...balance.rows, ...cashflow.rows]),
    ttmCashFlowFromNormalized(cashflow, undefined, [...income.rows, ...balance.rows]),
    income.rows[0],
    [...income.rows, ...balance.rows, ...cashflow.rows],
  );
}

// ---------------------------------------------------------------------------
// runStageB
// ---------------------------------------------------------------------------

const SPREAD_DAYS = 24 * 3600 * 1000;

/**
 * Latest risk-free rate (10y): FRED DGS10 (pct) → FMP treasury.year10 (pct)
 * → the last good cached DGS10 observation → the Treasury par curve (B-4).
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
  // B-4: the last good cached DGS10 observation, then the Treasury par curve
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

/**
 * D-60: attach the filed fair value of marketable equity securities held
 * inside cash and short-term investments (marketableEquity.ts), with its SEC
 * provenance. Rows the filing does not reconcile are returned unchanged.
 */
function withMarketableEquity(rows: FmpBalanceSheetRow[], facts: CompanyFacts | null, observedAt: string): FmpBalanceSheetRow[] {
  if (facts === null) return rows;
  return rows.map((row) => {
    row = restoreLeaseFinancingProvenance(row, facts, observedAt);
    const resolved = marketableEquityInCash(facts, {
      date: isoDay(row.date), reportedCurrency: str(row.reportedCurrency),
      cashAndCashEquivalents: num(row.cashAndCashEquivalents), shortTermInvestments: num(row.shortTermInvestments),
      cashAndShortTermInvestments: num(row.cashAndShortTermInvestments),
    }, observedAt);
    if (resolved === null) return row;
    return {
      ...row,
      marketableEquitySecurities: resolved.value,
      marketableEquityBasis: resolved.basis,
      fieldProvenance: { ...row.fieldProvenance, marketableEquitySecurities: {
        source: "edgar" as const, unit: str(row.reportedCurrency) ?? "", periodStart: null, periodEnd: isoDay(row.date) ?? "",
        observedAt, tags: resolved.tags, filings: resolved.filings,
      } },
    };
  });
}

/** Daily bars for the D-60 beta regression; the dividend-adjusted close travels when the source has one. */
function betaClosePoints(rows: readonly FmpRawRow[]): ClosePoint[] {
  return rows.flatMap((row) => {
    const day = isoDay(row.date);
    const close = num(row.close);
    return day === null || close === null ? [] : [{ date: day, close, adjClose: num(row.adjClose) }];
  });
}

function riskFreeObservations(bundle: DataBundle): { date: string; value: number }[] {
  const dgs10 = bundle.macro.core["DGS10"];
  if (!dgs10 || !dgs10.ok) return [];
  return dgs10.value.data.filter((o) => Number.isFinite(o.value));
}

/**
 * Book debt on the house lease basis: the provider's totalDebt less the
 * operating-lease liability where the balance sheet discloses it (the EDGAR
 * route; FMP publishes no split), unless THESIS_EV_INCLUDE_LEASES keeps
 * leases in. The same rule the EV bridge and invested capital apply, so the
 * WACC's debt leg, ROIC and EV share one basis. Interest expense excludes
 * operating-lease interest under ASC 842, so dividing it by a lease-inclusive
 * balance understated the effective rate and could push it below the
 * acceptance band.
 */
function bookDebtOnLeaseBasis(
  row: FmpBalanceSheetRow | undefined,
  includeOperatingLeases: boolean,
): { value: number | null; leaseRemoved: boolean } {
  const total = row ? num(row.totalDebt) : null;
  if (total === null) return { value: null, leaseRemoved: false };
  if (leaseDebtConflict(row ?? {}) !== null) return { value: null, leaseRemoved: false };
  if (leaseDebtScopeRefusal(row, includeOperatingLeases) !== null) return { value: null, leaseRemoved: false };
  // FIN-303 (D-25, D-97 item 3): the shared predicate, the same proof sales-to-capital and ROIC apply.
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
  options: { includeOperatingLeases?: boolean } = {},
): PriorYearCostOfDebt | null {
  const includeOperatingLeases = options.includeOperatingLeases === true;
  for (let index = 1; index < incomeAnnual.length && index <= PRIOR_YEAR_COST_OF_DEBT_MAX_YEARS_BACK; index += 1) {
    const income = incomeAnnual[index];
    const fiscalYearEnd = isoDay(income?.date);
    const interestExpense = num(income?.interestExpense);
    if (fiscalYearEnd === null || interestExpense === null || interestExpense <= 0) continue;
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
    const totalDebtAvg =
      debtPriorYear !== null && debtPriorYear > 0 ? (debtThisYear + debtPriorYear) / 2 : debtThisYear;
    return {
      pct: (interestExpense / totalDebtAvg) * 100,
      fiscalYearEnd,
      yearsBack: index,
      interestExpense,
      totalDebtAvg,
      ebit: num(income?.operatingIncome),
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
): {
  average: number | null;
  negativeObservation: number | null;
  basis: string;
  /** The one currency the balances averaged are established in; null when not established. */
  currency: string | null;
  /** D-60: the newer balance of the pair on the same lease basis, and what it is. */
  latest?: number | null;
  latestBasis?: string;
  /** Audit 2026-10-22 C-1: why no average was established, naming the balance date. */
  unavailable?: string;
  /** Audit 2026-10-29 (AMZN #51, VAL-4): `unavailable` is a refusal of debt the balance carries, not an absent balance. */
  refused?: true;
  /** The date of the balance whose debt refusal (or invalid negative debt) withheld the average (fix round 1, I-1). */
  refusedBalanceDate?: string;
} {
  const quarterEnd = balancesQuarterly[0];
  const quarterEndMs = quarterEnd ? Date.parse(String(quarterEnd.date ?? "")) : Number.NaN;
  const yearEarlier = Number.isFinite(quarterEndMs)
    ? balancesQuarterly.find((row) => {
        const t = Date.parse(String(row.date ?? ""));
        return Number.isFinite(t) && Math.abs(quarterEndMs - t - 365.25 * SPREAD_DAYS) <= 45 * SPREAD_DAYS;
      })
    : undefined;
  type Pair = [FmpBalanceSheetRow | undefined, FmpBalanceSheetRow | undefined];
  // Audit 2026-10-22 C-1: a lease-scope refusal blocks a pair; it no longer
  // vetoes an average it is not part of.
  const leaseRefusal = (rows: readonly (FmpBalanceSheetRow | undefined)[]): string | null =>
    rows.map(row => row === undefined ? null : leaseDebtScopeRefusal(row, includeOperatingLeases) ?? leaseDebtConflict(row)).find(reason => reason !== null) ?? null;
  const quarterPair: Pair | null =
    interestBasis === "ttm" &&
    quarterEnd !== undefined &&
    yearEarlier !== undefined &&
    num(quarterEnd.totalDebt) !== null &&
    num(yearEarlier.totalDebt) !== null
      ? [quarterEnd, yearEarlier]
      : null;
  const annualPair: Pair = [balancesAnnual[0], balancesAnnual[1]];
  const quarterRefusal = quarterPair === null ? null : leaseRefusal(quarterPair);
  // The fallback replaces a refused quarter pair only with a complete one:
  // two fiscal-year balances, each with total debt, neither refused.
  const annualComplete = annualPair.every(row => row !== undefined && num(row.totalDebt) !== null) && leaseRefusal(annualPair) === null;
  let pair: Pair;
  let which: string;
  if (quarterPair !== null && (quarterRefusal === null || !annualComplete)) {
    pair = quarterPair;
    which = `the quarter-end balances at the TTM window's ends (${isoDay(quarterEnd!.date)} and ${isoDay(yearEarlier!.date)})`;
  } else {
    pair = annualPair;
    which =
      "the latest two fiscal-year-end balances" +
      (quarterPair !== null
        ? ` (so TTM interest is measured against fiscal-year-end debt; the quarter-end pair (${isoDay(quarterEnd!.date)} and ${isoDay(yearEarlier!.date)}) is not used: ${quarterRefusal})`
        : interestBasis === "ttm"
          ? " (no quarter-end balance four quarters back, so TTM interest is measured against fiscal-year-end debt)"
          : "");
  }
  const a = bookDebtOnLeaseBasis(pair[0], includeOperatingLeases);
  const b = bookDebtOnLeaseBasis(pair[1], includeOperatingLeases);
  const leaseText =
    a.leaseRemoved || b.leaseRemoved
      ? "book totalDebt less the operating-lease liability (the EV bridge's lease rule)"
      : includeOperatingLeases
        ? "book totalDebt with the operating-lease liability kept in (THESIS_EV_INCLUDE_LEASES=1)"
        : "book totalDebt (no operating-lease liability disclosed separately, so lease liabilities remain inside it)";
  const scopeNotes = pair.flatMap(row => { const coverage = incompleteLeaseCoverage(row); return coverage ? [`${isoDay(row?.date)}: ${coverage.note}`] : []; });
  const newestBalance = [balancesQuarterly[0], balancesAnnual[0]].filter((row): row is FmpBalanceSheetRow => row !== undefined)
    .sort((x, y) => String(y.date ?? "").localeCompare(String(x.date ?? "")))[0];
  // The newest balance is the debt weight's (D-60). Outside the pair, a lease
  // refusal on it withholds only that weight, which then uses the average.
  const newestInPair = newestBalance === undefined || pair.some(row => isoDay(row?.date) === isoDay(newestBalance.date));
  const newestRefusal = newestInPair ? null : leaseRefusal([newestBalance]);
  const newestNote = newestRefusal === null ? ""
    : `; the newest balance (${isoDay(newestBalance!.date)}) is not used for the debt weight, which uses this average: ${newestRefusal}`;
  const basis = `${leaseText}, average of ${which}${scopeNotes.length ? `; retained lease coverage: ${scopeNotes.join(" ")}` : ""}${newestNote}`;
  const used = [a.value !== null ? pair[0] : undefined, b.value !== null ? pair[1] : undefined].filter(
    (row): row is FmpBalanceSheetRow => row !== undefined,
  );
  const currency = establishedRowsCurrency(used, currencyEvidence);
  const refused = [...pair, newestBalance].find((row) => row?.fieldConflicts?.totalDebt?.usable === false);
  if (refused !== undefined) {
    const unavailable = `${isoDay(refused.date)}: ${refused.fieldConflicts!.totalDebt!.reason}`;
    return { average: null, negativeObservation: null, basis: `${basis}; unavailable: ${refused.fieldConflicts!.totalDebt!.reason}`, currency, unavailable, refused: true, refusedBalanceDate: isoDay(refused.date) ?? undefined };
  }
  const scopeRefused = [...pair, ...(newestInPair ? [newestBalance] : [])].find(row => row !== undefined && leaseDebtScopeRefusal(row, includeOperatingLeases) !== null);
  if (scopeRefused) {
    const scopeRefusal = leaseDebtScopeRefusal(scopeRefused, includeOperatingLeases)!;
    return { average: null, latest: null, negativeObservation: null, basis: `${basis}; ${scopeRefusal}`, latestBasis: scopeRefusal, currency, unavailable: `${isoDay(scopeRefused.date)}: ${scopeRefusal}`, refused: true, refusedBalanceDate: isoDay(scopeRefused.date) ?? undefined };
  }
  // Invalid supplied balances are not missing observations that the other
  // year may replace. Preserve the raw negative sentinel before lease guards
  // null the adjusted values, and reject contradictory lease compositions.
  const negativeRow = pair.find(row => { const value = num(row?.totalDebt); return value !== null && value < 0; });
  const negativeObservation = negativeRow === undefined ? null : num(negativeRow.totalDebt);
  if (negativeObservation !== null) return { average: null, negativeObservation, basis, currency, refusedBalanceDate: isoDay(negativeRow!.date) ?? undefined };
  const conflicted = pair.find(row => leaseDebtConflict(row ?? {}) !== null);
  if (conflicted !== undefined) {
    const leaseConflict = leaseDebtConflict(conflicted)!;
    return { average: null, negativeObservation: null, basis: `${basis}; unavailable: ${leaseConflict}`, currency, unavailable: `${isoDay(conflicted.date)}: ${leaseConflict}`, refused: true, refusedBalanceDate: isoDay(conflicted.date) ?? undefined };
  }
  if (a.value === null && b.value === null) {
    const dated = pair.filter((row): row is FmpBalanceSheetRow => row !== undefined).map(row => isoDay(row.date));
    const unavailable = dated.length === 0 ? "no balance sheet to average"
      : `no book total debt on ${dated.join(" or ")}${dated.length < pair.length ? ", and no second balance to average it with" : ""}`;
    return { average: null, negativeObservation: null, basis, currency, unavailable };
  }
  // D-60: the newest balance sheet (quarterly or annual, whichever is newer),
  // in the same established currency as the averaged pair.
  const newestRow = [balancesQuarterly[0], balancesAnnual[0]]
    .filter((row): row is FmpBalanceSheetRow => row !== undefined)
    .sort((x, y) => String(y.date ?? "").localeCompare(String(x.date ?? "")))[0];
  const newestDebt = newestRow === undefined ? null : bookDebtOnLeaseBasis(newestRow, includeOperatingLeases).value;
  const newestCurrency = newestRow === undefined ? null : establishedRowsCurrency([newestRow], currencyEvidence);
  const latest = newestRefusal === null && newestDebt !== null && newestDebt >= 0 && currency !== null && newestCurrency === currency
    ? { latest: newestDebt, latestBasis: `${leaseText}, the latest balance (${isoDay(newestRow?.date) ?? "date unavailable"}), the one the EV bridge nets${incompleteLeaseCoverage(newestRow)?.note ? `; ${incompleteLeaseCoverage(newestRow)!.note}` : ""}` }
    : {};
  if (a.value !== null && b.value !== null) {
    return { average: (a.value + b.value) / 2, negativeObservation: null, basis, currency, ...latest };
  }
  return { average: a.value ?? b.value, negativeObservation: null, basis, currency, ...latest };
}

export interface StageBReplayConfig { evIncludeLeases: boolean }

/** FMP reports undisclosed interest as 0 (the zero-vs-undisclosed policy), so a zero is missing evidence. */
function disclosedInterest(row: FmpIncomeStatementRow | undefined): number | null {
  const value = num(row?.interestExpense);
  return value === 0 ? null : value;
}

/** Index of the income row dated nearest `date`, within the ±5-day fiscal-date drift statement joins tolerate. */
function incomeIndexNear(rows: readonly FmpIncomeStatementRow[], date: string): number {
  const target = Date.parse(date);
  let best = -1;
  let bestDelta = 5 * 86_400_000;
  rows.forEach((row, index) => {
    const delta = Math.abs(Date.parse(isoDay(row.date) ?? "") - target);
    if (delta <= bestDelta) { best = index; bestDelta = delta; }
  });
  return best;
}

/** Four consecutive quarters of disclosed interest expense ending on `date`, or null when any is missing. */
function trailingYearInterest(quarters: readonly FmpIncomeStatementRow[], date: string): number | null {
  const start = incomeIndexNear(quarters, date);
  const window = start < 0 ? [] : quarters.slice(start, start + 4);
  if (window.length < 4) return null;
  const span = (Date.parse(date) - Date.parse(isoDay(window[3]!.date) ?? "")) / 86_400_000;
  const values = window.map(disclosedInterest);
  if (!(span >= 250 && span <= 300) || values.some((value) => value === null)) return null;
  return values.reduce((sum, value) => sum! + value!, 0);
}

/** A cash-flow field over (from, to]: the discrete quarters that cover it, else the fiscal year ending at `to`. */
function cashFlowBetween(field: "netDebtIssuance" | "debtRepayment", quarters: readonly FmpCashFlowRow[], years: readonly FmpCashFlowRow[], from: string, to: string): number | null {
  const near = (row: FmpCashFlowRow, day: string): boolean => Math.abs(Date.parse(isoDay(row.date) ?? "") - Date.parse(day)) <= 5 * 86_400_000;
  const span = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  const inside = quarters.filter((row) => { const day = isoDay(row.date); return day !== null && Date.parse(day) > Date.parse(from) + 5 * 86_400_000 && Date.parse(day) <= Date.parse(to) + 5 * 86_400_000; });
  const values = inside.map((row) => num(row[field]));
  if (inside.length > 0 && inside.length === Math.round(span / 91) && values.every((value) => value !== null)) return values.reduce((sum, value) => sum! + value!, 0);
  const year = span >= 300 ? years.find((row) => near(row, to)) : undefined;
  return year === undefined ? null : num(year[field]);
}

/**
 * Withhold total, net and long-term debt on every balance row whose year's interest
 * expense shows its debt to be incomplete. The interest is judged against the
 * average debt resolved at the balance dates of that year, so a borrowing
 * repaid mid-year still explains part of the interest it carried, and against
 * a collapse from the previous balance that no repayment explains. `interim`
 * adds balance dates inside the year (quarterly rows for an annual check). A
 * row with no debt figure at all is left to the balance-anchor rules.
 */
function withholdImplausibleDebt(rows: FmpBalanceSheetRow[], interestFor: (date: string) => number | null, gaps: ManifestEntry[], interim: readonly FmpBalanceSheetRow[] = [],
  cashFlow: (field: "netDebtIssuance" | "debtRepayment", from: string, to: string) => number | null = () => null): FmpBalanceSheetRow[] {
  const financingDebt = (row: FmpBalanceSheetRow): number | null => {
    // Long-term debt tagged with its finance leases already holds them.
    const financeLeases = longTermDebtHoldsFinanceLeases(row.fieldProvenance?.longTermDebt?.tags) ? null : num(row.financeLeaseLiability);
    const parts = [num(row.shortTermDebt), num(row.longTermDebt), financeLeases];
    // A row without components (vendor rows) is judged on its published total.
    return parts.every((part) => part === null) ? num(row.totalDebt) : parts.reduce<number>((sum, part) => sum + (part ?? 0), 0);
  };
  return rows.map((row) => {
    const date = isoDay(row.date);
    const closing = financingDebt(row);
    if (date === null || closing === null) return row;
    const yearStart = Date.parse(date) - 380 * 86_400_000;
    // One balance per date, latest first: quarterly and annual rows can share a year-end.
    const earlier = new Map<string, number>();
    for (const other of [...rows, ...interim]) {
      const day = isoDay(other.date);
      const debt = day !== null && day < date && Date.parse(day) >= yearStart ? financingDebt(other) : null;
      if (debt !== null && !earlier.has(day!)) earlier.set(day!, debt);
    }
    const opening = [...earlier.entries()].sort(([a], [b]) => b.localeCompare(a));
    const interest = interestFor(date);
    const previous = opening[0];
    const reason = implausibleDebtReason({ annualInterestExpense: interest, financingDebt: closing,
      priorFinancingDebts: opening.map(([, debt]) => debt), totalAssets: num(row.totalAssets) }) ??
      (previous === undefined ? null : collapsedDebtReason({ annualInterestExpense: interest, financingDebt: closing, previousFinancingDebt: previous[1],
        previousDate: previous[0], netDebtIssuance: cashFlow("netDebtIssuance", previous[0], date), debtRepayment: cashFlow("debtRepayment", previous[0], date),
        totalAssets: num(row.totalAssets) }));
    if (reason === null) return row;
    let out = row;
    // Long-term debt is the component the missing borrowings most often belong
    // to, and the forensic leverage tests read it on its own.
    const fields = num(row.longTermDebt) === null ? ["totalDebt", "netDebt"] as const : ["totalDebt", "netDebt", "longTermDebt"] as const;
    for (const field of fields) {
      out = { ...out, [field]: null, fieldConflicts: { ...out.fieldConflicts, [field]: {
        vendorValue: num(row[field]), secValue: null, usable: false, reason } } };
      gaps.push({ field: `statements.balance.${date}.${field}`, reason, severity: "warn" });
    }
    return out;
  });
}

export function runStageB(bundle: DataBundle, replayConfig?: StageBReplayConfig, suppliedValidation?: ValidationReport): ComputedMetrics {
  const notes: string[] = [];
  const suppressed: SuppressedMetric[] = [];
  const validation = suppliedValidation ?? (bundle.edgar?.companyFacts && bundle.institutional && Number.isFinite(Date.parse(bundle.builtAt))
    ? validateBundle(bundle as unknown as ValidatableBundle, { now: new Date(bundle.builtAt) }) : null);
  const revenueConflict = validation?.checks.find(check=>check.status==="fail" && /^xbrlCrossCheck\.revenue\.FY\./.test(check.id));
  const revenueEligibilityReason = revenueConflict
    ? `Annual revenue definitions are unreconciled (${revenueConflict.id}): ${revenueConflict.detail}. Revenue growth and growth-dependent valuation are withheld; raw source observations are retained.` : null;

  const profile = firstRow(bundle.profile);
  const support = classifyInstrumentSupport(profile);
  if (!support.supported) throw new UnsupportedInstrumentError(support);
  const quote = firstRow(bundle.quote);

  // The statements AS REPORTED. Calculations that combine rows read the
  // currency-compatible subsets below (rowsInModelCurrency) instead.
  const incomeAnnualReported = rowsOf(bundle.statements.incomeAnnual);
  // D-60: marketable equity securities the filing places inside cash and
  // short-term investments travel on the balance row, so every net-debt
  // consumer can keep them out of cash.
  const companyFacts = confirmedIssuerFacts(bundle.symbol, bundle.edgar);
  const balanceAnnualReported = withMarketableEquity(rowsOf(bundle.statements.balanceAnnual), companyFacts, bundle.builtAt);
  const cashflowAnnualReported = rowsOf(bundle.statements.cashflowAnnual);
  const ttmGaps: ManifestEntry[] = [];
  const incomeQuarterSet = normalizeStatementQuarters(
    rowsOf(bundle.statements.incomeQuarterly),
    "income",
    ttmGaps,
  );
  const balanceQuarterSet = normalizeStatementQuarters(
    withMarketableEquity(rowsOf(bundle.statements.balanceQuarterly), companyFacts, bundle.builtAt),
    "balance",
    ttmGaps,
  );
  const cashflowQuarterSet = normalizeStatementQuarters(
    rowsOf(bundle.statements.cashflowQuarterly),
    "cashFlow",
    ttmGaps,
  );
  const incomeQuarterly = incomeQuarterSet.rows;
  const balanceQuarterlyReported = balanceQuarterSet.rows;
  const cashflowQuarterly = cashflowQuarterSet.rows;

  const todayIso = bundle.builtAt.slice(0, 10);

  // WS5: routing evidence from EDGAR companyfacts, read-only (D-16).
  const routingEvidence = deriveRoutingEvidence(bundle.edgar?.companyFacts ?? null, { today: todayIso });

  // --- Route FIRST -----------------------------------------------------------
  const inc0 = incomeAnnualReported[0];
  const cf0 = cashflowAnnualReported[0];
  const routingIncomeAnnual: RoutingIncomeRow | null = inc0
    ? {
        date: isoDay(inc0.date),
        revenue: num(inc0.revenue),
        netIncome: num(inc0.netIncome),
        reportedCurrency: normalizeReportedCurrency(inc0.reportedCurrency),
      }
    : null;
  const ttmInc = ttmIncomeFromNormalized(incomeQuarterSet, ttmGaps, [
    ...balanceQuarterSet.rows,
    ...cashflowQuarterSet.rows,
  ], bundle.builtAt);
  const routingIncomeTtm: RoutingIncomeRow | null = ttmInc
    ? {
        date: ttmInc.date,
        revenue: ttmInc.revenue,
        netIncome: ttmInc.netIncome,
        reportedCurrency: ttmInc.reportedCurrency,
      }
    : null;
  const routingCashflowAnnual: RoutingCashflowRow | null = cf0
    ? { date: isoDay(cf0.date), operatingCashFlow: num(cf0.operatingCashFlow) }
    : null;
  const ttmCf = ttmCashFlowFromNormalized(cashflowQuarterSet, ttmGaps, [
    ...incomeQuarterSet.rows,
    ...balanceQuarterSet.rows,
  ]);
  const currencies = resolveStatementCurrencies(
    profile?.currency, inc0, ttmInc, ttmCf, incomeQuarterSet.rows[0],
    [...incomeQuarterSet.rows, ...balanceQuarterSet.rows, ...cashflowQuarterSet.rows], ttmGaps,
  );

  // Rows that may be combined with one another: those established in the
  // model currency, back to the first that is not. Filing-linked statements
  // of any period are evidence for an unlabelled row.
  const currencyEvidence: CurrencyEvidenceRow[] = [
    ...incomeAnnualReported,
    ...balanceAnnualReported,
    ...cashflowAnnualReported,
    ...incomeQuarterSet.rows,
    ...balanceQuarterSet.rows,
    ...cashflowQuarterSet.rows,
  ];
  const compatible = {
    incomeAnnual: rowsInModelCurrency("incomeAnnual", incomeAnnualReported, currencies.model, currencyEvidence),
    balanceAnnual: rowsInModelCurrency("balanceAnnual", balanceAnnualReported, currencies.model, currencyEvidence),
    cashflowAnnual: rowsInModelCurrency("cashflowAnnual", cashflowAnnualReported, currencies.model, currencyEvidence),
    balanceQuarterly: rowsInModelCurrency("balanceQuarterly", balanceQuarterlyReported, currencies.model, currencyEvidence),
  };
  const incomeAnnual = compatible.incomeAnnual.rows;
  // Review m6: the rows' completions and stake fills, one manifest entry per kind once both families are admitted.
  const balanceAdmissions: BalanceAdmission[] = [];
  const admitBalance = (vendorFamily: boolean) => (row: FmpBalanceSheetRow): FmpBalanceSheetRow => {
    if (companyFacts === null) return row;
    const currency = establishedCurrencyOn([row], isoDay(row.date), currencyEvidence);
    const admitted = admitDebtFields(row, companyFacts, currency, bundle.builtAt, debtPresentationSections(bundle.edgar));
    ttmGaps.push(...admitted.gaps);
    balanceAdmissions.push(...admitted.admissions);
    if (!vendorFamily) return admitted.row;
    // D-133: a provider row's undisclosed stakes, so a bundle frozen before the enrichment filled them reads them too.
    const stakes = admitVendorLongTermInvestments(admitted.row, companyFacts, currency, bundle.builtAt);
    balanceAdmissions.push(...stakes.admissions);
    return stakes.row;
  };
  const vendorFamily = (family: DataBundle["statements"]["balanceAnnual"]): boolean => family.ok && family.value.source !== "edgar";
  let balanceAnnual = compatible.balanceAnnual.rows.map(admitBalance(vendorFamily(bundle.statements.balanceAnnual)));
  const cashflowAnnual = compatible.cashflowAnnual.rows;
  let balanceQuarterly = compatible.balanceQuarterly.rows.map(admitBalance(vendorFamily(bundle.statements.balanceQuarterly)));
  ttmGaps.push(...balanceAdmissionEntries(balanceAdmissions));
  for (const family of Object.values(compatible)) if (family.gap !== null) ttmGaps.push(family.gap);

  const routingCashflowTtm: RoutingCashflowRow | null = ttmCf
    ? { date: ttmCf.date, operatingCashFlow: ttmCf.operatingCashFlow }
    : null;

  const route = routeCompany(
    {
      sector: str(profile?.sector),
      industry: str(profile?.industry),
      isAdr: typeof profile?.isAdr === "boolean" ? profile.isAdr : null,
      isEtf: typeof profile?.isEtf === "boolean" ? profile.isEtf : null,
      isFund: typeof profile?.isFund === "boolean" ? profile.isFund : null,
      ipoDate: str(profile?.ipoDate),
      country: str(profile?.country),
      currency: str(profile?.currency),
      // SEC SIC from the EDGAR submissions payload. FMP's profile carries no
      // SIC, so without this the routing evidence and Altman's SIC-decisive
      // variant branch were both permanently blind.
      sic: str(bundle.edgar?.sic),
    },
    {
      incomeTtm: routingIncomeTtm,
      incomeAnnual: routingIncomeAnnual,
      cashflowTtm: routingCashflowTtm,
      cashflowAnnual: routingCashflowAnnual,
      availableQuarters: incomeQuarterly.length,
    },
    // WS5: XBRL routing evidence (D-16). Read-only from the bundle's EDGAR
    // companyfacts; an absent or failed payload routes on industry/SIC alone
    // and says so in the routing note and the manifest.
    { today: todayIso, evidence: routingEvidence },
  );

  // Audit 2026-10-19 O-2: debt the year's interest expense shows to be
  // incomplete is withheld before any consumer reads it. Financial routes are
  // excluded: their interest expense funds deposits and float, not debt.
  if (!(route.base === "bank" || route.base === "insurer" || route.base === "reit-mortgage")) {
    const issuance = (field: "netDebtIssuance" | "debtRepayment", from: string, to: string) => cashFlowBetween(field, cashflowQuarterly, cashflowAnnual, from, to);
    balanceAnnual = withholdImplausibleDebt(balanceAnnual, (date) => {
      const index = incomeIndexNear(incomeAnnual, date);
      return index < 0 ? null : disclosedInterest(incomeAnnual[index]);
    }, ttmGaps, balanceQuarterly, issuance);
    // A quarter is judged on the smaller of its trailing year and the latest
    // fiscal year, so a one-off quarter (an extinguishment cost tagged as
    // interest) cannot withhold debt on its own.
    const latestAnnualInterest = (date: string): number | null => {
      const year = incomeAnnual.find((row) => { const day = isoDay(row.date); return day !== null && day <= date && Date.parse(date) - Date.parse(day) < 380 * 86_400_000; });
      return disclosedInterest(year);
    };
    balanceQuarterly = withholdImplausibleDebt(balanceQuarterly, (date) => {
      const bases = [trailingYearInterest(incomeQuarterly, date), latestAnnualInterest(date)].filter((value): value is number => value !== null);
      return bases.length === 0 ? null : Math.min(...bases);
    }, ttmGaps, [], issuance);
  }

  const policy = metricPolicy(route);
  const isSuppressed = (key: string): boolean => policy.suppress.includes(key);
  const suppress = (key: string, reason: string): void => {
    suppressed.push({ key, reason });
  };

  // WS5: the REIT sub-map drives the withholding disclosures in the plan.
  const degradation = degradationPlan(
    route.base,
    route.overlays,
    incomeQuarterly.length,
    route.reitSubmap ?? null,
  );

  // --- Growth ----------------------------------------------------------------
  // Growth rates compare years, so they read the currency-compatible rows. A
  // margin is a ratio within one row — one presentation currency, whatever it
  // is — so the margin series keeps every reported year.
  const growthCompatible = computeGrowth(
    incomeAnnual.map(row=>toGrowthIncome(revenueConflict ? { ...row, revenue: undefined } : row)),
    cashflowAnnual.map(toGrowthCashFlow),
    { period: "annual" },
  );
  const growth = {
    ...growthCompatible,
    margins: computeGrowth(incomeAnnualReported.map(toGrowthIncome), [], { period: "annual" }).margins,
  };
  if(revenueEligibilityReason){
    growth.notes.push(revenueEligibilityReason);
    growth.gaps.push({field:"eligibility.annual.revenue",reason:revenueEligibilityReason,severity:"warn"});
  }
  // Withhold structurally inapplicable values before both report builders and
  // AI payloads consume them; a scoring-only suppression still leaked them.
  if (isSuppressed("fcfGrowth")) {
    growth.fcfCagrs = [];
    growth.gaps = growth.gaps.filter((gap) => gap.field !== "growth.fcf");
    growth.notes.push("Industrial free-cash-flow growth is not applicable to financial companies.");
  }
  if (isSuppressed("grossMargin")) growth.margins.gross = { series: [], slopePctPtsPerYear: null };
  if (isSuppressed("operatingMargin")) growth.margins.operating = { series: [], slopePctPtsPerYear: null };

  // --- Returns (WACC / ROIC / DuPont) ---------------------------------------
  // WS6 (D-19): THESIS_EV_INCLUDE_LEASES is read ONCE per Stage B run and
  // handed to both consumers — the returns block (WACC debt leg, invested
  // capital) and the valuation block (both EV bridges) — so the lease basis
  // cannot drift between them and the run makes a single settings read
  // (tests/jobRunner.test.ts pins the count).
  const evIncludeLeases = replayConfig?.evIncludeLeases ?? getConfig().evIncludeLeases;
  const returns = computeReturns(
    bundle,
    incomeAnnual,
    balanceAnnual,
    balanceQuarterly,
    cashflowAnnual,
    ttmInc,
    route,
    evIncludeLeases,
    currencies.model,
    currencies.ttmIncomeUsable,
  );
  const modelEligibilityReason = route.modelEligibility?.reason;
  if (modelEligibilityReason) {
    returns.roic = { series: [], latestRoicPct: null, asOf: returns.roic.asOf, notes: [modelEligibilityReason], gaps: [] };
    returns.roicVsWacc = { spreadPctPts: null, note: modelEligibilityReason };
    Object.assign(returns.wacc, { waccPct: null, waccRawPct: null, costOfDebtPct: null, costOfDebtMethod: "unavailable",
      syntheticRating: null, syntheticSpreadPct: null, interestCoverageRatio: null, weightEquity: null, weightDebt: null });
    returns.wacc.notes = [modelEligibilityReason];
    returns.waccInputs = waccDisclosure(returns.wacc);
    returns.notes = [modelEligibilityReason];
    returns.waccHistory = { points: [], missing: [], basis: modelEligibilityReason, notes: [modelEligibilityReason], gaps: [] };
    returns.gaps.push({ field: "returns.modelEligibility", reason: modelEligibilityReason, severity: "warn" });
  }

  // --- Capital ---------------------------------------------------------------
  // D-61: the price actually paid for repurchased shares, from the filer's own
  // equity-statement tags, on the statements' share basis.
  const companyFactsResult = bundle.edgar?.companyFacts;
  const repurchaseExecutions = repurchaseExecutionsFromFacts({
    companyFacts: companyFactsResult?.ok === true ? companyFactsResult.value.data : null,
    shareBasis: bundle.edgar?.shareBasis ?? null,
    fiscalYearEnds: cashflowAnnual.map((r) => String(r.date ?? "")).filter((d) => d.length > 0),
    reportedCurrency: str(cashflowAnnual[0]?.reportedCurrency) ?? str(incomeAnnual[0]?.reportedCurrency),
  });
  const annualCapital = computeCapital(
    incomeAnnual.map(toCapitalIncome),
    cashflowAnnual.map(toCapitalCashFlow),
    balanceAnnual.map(toCapitalBalance),
    rowsOf(bundle.marketCapHistory).map<MarketCapPoint>((r) => ({
      date: String(r.date ?? ""),
      marketCap: num(r.marketCap),
    })),
    quoteInput(quote),
    {
      route: route.base,
      modelEligibilityReason,
      // The buyback price proxy divides reporting-currency repurchases by a
      // quote-currency, per-ordinary-share price; the ADR/currency guard the
      // WACC weights and the multiples already apply is applied here too.
      reportedCurrency: str(incomeAnnual[0]?.reportedCurrency),
      quoteCurrency: str(profile?.currency),
      isAdr: typeof profile?.isAdr === "boolean" ? profile.isAdr : null,
      repurchaseExecutions: repurchaseExecutions.rows,
      // AMZN audit 2026-10-20, finding 20 (b): net debt/EBITDA on the EV's lease basis.
      evIncludeLeases,
    },
  );
  if (annualCapital.buybackPriceAnalysis.totalRepurchased > 0) {
    for (const note of repurchaseExecutions.notes) annualCapital.notes.push(note);
  }

  const sumCurrentFlow = (field: keyof FmpCashFlowRow): number | null => {
    if (!ttmCf || !currencies.ttmCashFlowUsable || cashflowQuarterly.length < 4) return null;
    const values = cashflowQuarterly.slice(0,4).map(row => num(row[field]));
    return values.every((v): v is number => v !== null) ? values.reduce((sum,v)=>sum+v,0) : null;
  };
  const currentBalance = [balanceQuarterly[0], balanceAnnual[0]].filter((r): r is FmpBalanceSheetRow => r !== undefined)
    .sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0];
  const capital = attachCurrentCapital(annualCapital, {
    route: route.base,
    modelEligibilityReason,
    evIncludeLeases,
    income: ttmInc && currencies.ttmIncomeUsable ? { ...ttmInc } : null,
    cashFlow: ttmCf && currencies.ttmCashFlowUsable ? { ...ttmCf,
      netIncome: ttmInc?.netIncome ?? null, freeCashFlow: sumCurrentFlow("freeCashFlow"),
      stockBasedCompensation: sumCurrentFlow("stockBasedCompensation"),
      financeLeasePrincipalPayments: sumCurrentFlow("financeLeasePrincipalPayments"), issuerFreeCashFlow: sumCurrentFlow("issuerFreeCashFlow"),
    } : null,
    balance: currentBalance ? toCapitalBalance(currentBalance) : null,
    currency: currencies.model,
    annualCashFlow: cashflowAnnual[0] ? toCapitalCashFlow(cashflowAnnual[0]) : null,
    annualBalance: balanceAnnual[0] ? toCapitalBalance(balanceAnnual[0]) : null,
  });

  // --- SEC 8-K forensic events -------------------------------------------
  // Item 4.02 (non-reliance on previously issued financial statements) is a
  // restatement announcement — among the strongest accounting red flags a
  // filer can make — and Item 4.01 is an auditor change. The bundle FETCHED
  // and parsed both feeds and then nothing read them: grep found zero
  // consumers. Surface them as notes and gaps so they reach the report and the
  // Stage C payload, where the forensic section is read.
  const eventGaps: ManifestEntry[] = [];
  const eventNotes: string[] = [];
  const nonReliance = bundle.edgar?.nonReliance8Ks;
  if (nonReliance?.ok === true && nonReliance.value.data.length > 0) {
    const dates = nonReliance.value.data
      .map((f) => f.filingDate)
      .filter((d): d is string => typeof d === "string" && d.length > 0)
      .sort()
      .reverse();
    eventNotes.push(
      `SEC Form 8-K Item 4.02 filed (${dates.slice(0, 3).join(", ")}${dates.length > 3 ? ", …" : ""}): ` +
        "the company announced that previously issued financial statements should NO LONGER BE RELIED UPON. " +
        "Any figure below drawn from a superseded period may be restated.",
    );
    eventGaps.push({
      field: "forensics.nonReliance8K",
      reason: `${nonReliance.value.data.length} Form 8-K Item 4.02 non-reliance/restatement filing(s) on record (latest ${dates[0] ?? "unknown"}) — historical statements may be superseded`,
      severity: "warn",
    });
  }
  const auditorChange = bundle.edgar?.auditorChange8Ks;
  if (auditorChange?.ok === true && auditorChange.value.data.length > 0) {
    const dates = auditorChange.value.data
      .map((f) => f.filingDate)
      .filter((d): d is string => typeof d === "string" && d.length > 0)
      .sort()
      .reverse();
    eventNotes.push(
      `SEC Form 8-K Item 4.01 filed (${dates.slice(0, 3).join(", ")}${dates.length > 3 ? ", …" : ""}): ` +
        "the company changed its registered public accounting firm.",
    );
    eventGaps.push({
      field: "forensics.auditorChange8K",
      reason: `${auditorChange.value.data.length} Form 8-K Item 4.01 auditor-change filing(s) on record (latest ${dates[0] ?? "unknown"})`,
      severity: "info",
    });
  }

  // --- Forensics (route-aware; module handles financial suppression) --------
  const forensicContext = withFiledForensicContext(
    { income: incomeAnnual.map(toForensicsIncome), cashFlow: cashflowAnnual.map(toForensicsCashFlow) },
    companyFactsResult?.ok === true ? companyFactsResult.value.data : null,
    str(inc0?.reportedCurrency),
  );
  const forensicClassAmbiguity = retainedCommonClassAmbiguity(bundle);
  const forensicEquityScope = resolveEconomicEquityScope({
    price: num(quote?.price) ?? num(profile?.price), marketCap: num(profile?.marketCap ?? quote?.marketCap),
    currency: str(profile?.currency),
    priceAsOf: quotePriceObservationDay(num(quote?.price) !== null ? quote : profile),
    issuerId: bundle.edgar.registrant?.cik10, securityId: bundle.symbol,
    ...(forensicClassAmbiguity ? { marketCapSecurityBasis: "unresolved" as const, marketCapScopeEvidence: forensicClassAmbiguity } : {}),
  }, bundle.economicShareEvidence ?? [], isoDay(bundle.builtAt) ?? "");
  const forensics = runForensics(route, {
    income: forensicContext.income,
    balance: balanceAnnual.map(toForensicsBalance),
    cashFlow: forensicContext.cashFlow,
    marketCap: forensicEquityScope.marketCap,
    // Derived class capitalization belongs to its admitted price session;
    // a vendor cap belongs to its own source row, never its fetch envelope.
    marketCapAsOf: forensicEquityScope.status === "resolved" ? forensicEquityScope.priceAsOf ?? null
      : forensicEquityScope.status === "unresolved" ? null
        : quotePriceObservationDay(num(profile?.marketCap) !== null ? profile : quote),
    reportedCurrency: str(inc0?.reportedCurrency),
    quoteCurrency: str(profile?.currency),
    classification: {
      sector: str(profile?.sector),
      industry: str(profile?.industry),
      sicCode: str(bundle.edgar?.sic),
    },
  });
  if (balanceAnnual.some((row) => num(row.longTermDebt) !== null && longTermDebtHoldsCurrent(row.fieldProvenance?.longTermDebt?.tags))) {
    forensics.gaps.push({ field: "forensics.longTermDebt", severity: "info", reason:
      "long-term debt is composed from instrument-class tags that include current debt, so Beneish LVGI, which adds it to current liabilities, is not evaluated; Piotroski leverage compares the composed figure year on year only when both years compose it from the same classes; total debt is unaffected" });
  }
  if (forensicEquityScope.status === "unresolved") {
    forensics.gaps.push({ field: "forensics.economicClassBasis", reason: forensicEquityScope.basis, severity: "warn", attemptedSources: forensicEquityScope.sourceIds });
  }

  // --- Technicals ------------------------------------------------------------
  // EOD rows are date DESC in the bundle; the module re-sorts ASC defensively.
  const eod = rowsOf(bundle.eodPrices).map(toOhlcv);
  const spy = rowsOf(bundle.benchmarkPrices.spy).map(toOhlcv);
  const sectorEtf = rowsOf(bundle.benchmarkPrices.sectorEtf).map(toOhlcv);
  const technicals = computeTechnicals(
    eod,
    spy,
    sectorEtf,
    bundle.benchmarkPrices.sectorEtfSymbol,
    { analysisAt: bundle.builtAt },
  );

  // --- Valuation -------------------------------------------------------------
  const valuation = computeValuation(bundle, {
    route,
    incomeAnnual: revenueConflict ? incomeAnnual.map(row=>({...row,revenue:undefined})) : incomeAnnual,
    balanceAnnual,
    cashflowAnnual,
    incomeQuarterly,
    balanceQuarterly,
    cashflowQuarterly,
    // Currency-dependent calculations take a TTM window only when its own
    // currency is established (resolveStatementCurrencies); otherwise they use
    // the annual statement, and the disclosure says so.
    ttmInc: currencies.ttmIncomeUsable ? ttmInc : null,
    ttmCf: currencies.ttmCashFlowUsable ? ttmCf : null,
    modelCurrency: currencies.model,
    currencyEvidence,
    growth,
    evIncludeLeases,
    // WS6 wiring.
    capital,
    wacc: returns.wacc,
    waccInputs: returns.waccInputs,
    waccHistory: returns.waccHistory,
    roic: returns.roic,
    dupont: returns.dupont,
    // WS5: P/TBV against ROTE on the financial routes.
    rote: returns.rote,
    commonReturnTtm: returns.commonReturnTtm,
    profile,
    quote,
  });

  // --- Route metrics for financial companies (WS5, D-17) --------------------
  // The bank, insurer and mortgage-REIT routes have led with NIM, the
  // efficiency ratio, the combined ratio, book value per share, the spread and
  // leverage since the route table was written, and nothing computed any of
  // them. Each is now computed from the filer's own XBRL tags where its
  // definition allows, and withheld with a stated reason where it does not.
  const financialMetrics = computeFinancialMetrics(route.base, {
    companyFacts: bundle.edgar?.companyFacts ?? null,
    balance: balanceAnnual.map((r) => ({
      date: String(r.date ?? ""),
      reportedCurrency: str(r.reportedCurrency),
      totalAssets: num(r.totalAssets),
      totalStockholdersEquity: num(r.totalStockholdersEquity),
      totalEquity: num(r.totalEquity),
      goodwill: num(r.goodwill),
      intangibleAssets: num(r.intangibleAssets),
      preferredStock: num(r.preferredStock),
    })),
    income: incomeAnnual.map((r) => ({
      date: String(r.date ?? ""),
      reportedCurrency: str(r.reportedCurrency),
      revenue: num(r.revenue),
      netIncome: num(r.netIncome),
      interestIncome: num(r.interestIncome),
      interestExpense: num(r.interestExpense),
      netInterestIncome: num(r.netInterestIncome),
    })),
    shares: num(incomeAnnual[0]?.weightedAverageShsOutDil),
    sharesBasis: "statements:income.weightedAverageShsOutDil",
    shareBasis: bundle.edgar?.shareBasis ?? null,
  });
  if (modelEligibilityReason) {
    financialMetrics.metrics = [];
    financialMetrics.flags = [];
    financialMetrics.notes = [modelEligibilityReason];
    financialMetrics.gaps.push({ field: "financialMetrics.modelEligibility", reason: modelEligibilityReason, severity: "warn" });
  }

  // --- Runway (overlay-gated) ------------------------------------------------
  let runway: RunwayResult | null = null;
  const needsRunway =
    !modelEligibilityReason && (route.overlays.includes("pre-revenue") ||
    route.overlays.includes("unprofitable") ||
    route.overlays.includes("recent-ipo"));
  if (needsRunway) {
    // The runway reads the reported rows: gateRunwayCurrency below sets the
    // liquidity row's own currency against the burn's.
    const b0 = newestBalanceRow(balanceQuarterlyReported[0], balanceAnnualReported[0]);
    if (b0) {
      runway = computeRunway(
        {
          date: String(b0.date ?? ""),
          cashAndCashEquivalents: num(b0.cashAndCashEquivalents),
          shortTermInvestments: num(b0.shortTermInvestments),
          cashAndShortTermInvestments: num(b0.cashAndShortTermInvestments),
        },
        cashflowQuarterly.map((r) => ({
          date: String(r.date ?? ""),
          operatingCashFlow: num(r.operatingCashFlow),
          capitalExpenditure: num(r.capitalExpenditure),
        })),
        incomeQuarterly.map((r) => ({
          date: String(r.date ?? ""),
          weightedAverageShsOutDil: num(r.weightedAverageShsOutDil),
        })),
      );
      runway = gateRunwayCurrency(runway, b0, cashflowQuarterly, [
        ...incomeQuarterly,
        ...balanceQuarterly,
        ...cashflowQuarterly,
        ...rowsOf(bundle.statements.incomeAnnual),
        ...rowsOf(bundle.statements.cashflowAnnual),
      ]);
    }
  }

  // --- Scores + projections (deterministic; feature 1.1.0) ------------------
  // Every upside (the grade's DCF signal, the fair value, the scenario targets)
  // sets a model value against the quote. Without one known currency on both
  // sides there is no such figure, so the price is withheld from all of them;
  // the per-share values themselves do not use it and stand.
  const quoteComparison = comparePriceCurrency(currencies.model, currencies.trading);
  const currentPrice = quoteComparison.comparable ? num(quote?.price) : null;
  if (!quoteComparison.comparable) {
    ttmGaps.push({
      field: "valuation.priceComparison.currency",
      reason:
        `${quoteComparison.reason} — no upside versus the quote price, reverse valuation, price multiple or grade signal ` +
        "built on one is computed; per-share values that do not use the price stand in the model's currency",
      severity: "warn",
    });
  }
  const asOfDay = bundle.builtAt.slice(0, 10);
  // Audit 2026-10-22 B-13: Moody's leverage ratios on the current capital
  // window and the balance sheet it pairs with.
  const utilityCredit = route.overlays.includes("regulated-utility") ? (() => {
    const current = capital.current ?? null;
    const asOf = current?.asOf ?? null;
    const near = (row: FmpBalanceSheetRow | undefined): row is FmpBalanceSheetRow => {
      const a = isoDay(row?.date), b = asOf;
      return a !== null && b !== null && Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) <= 5 * 86400000;
    };
    const balance = [currentBalance, balanceAnnual[0]].find(near) ?? null;
    const annualCf = cashflowAnnual[0];
    const changeInWorkingCapital = current?.basis === "ttm"
      ? sumCurrentFlow("changeInWorkingCapital")
      : annualCf !== undefined && isoDay(annualCf.date) === asOf ? num(annualCf.changeInWorkingCapital) : null;
    const equity = balance === null ? null : num(balance.totalEquity) ??
      (num(balance.totalStockholdersEquity) !== null && num(balance.minorityInterest) !== null
        ? (num(balance.totalStockholdersEquity) as number) + (num(balance.minorityInterest) as number) : null);
    return utilityCreditMetrics({
      asOf,
      operatingCashFlow: current?.cashBridge.operatingCashFlow ?? null,
      changeInWorkingCapital,
      totalDebt: balance === null ? null : current?.debtBridge.totalDebtIncludingLeases ?? null,
      totalEquity: equity,
      deferredIncomeTaxes: balance === null ? null : deferredIncomeTaxesAt(
        bundle.edgar?.companyFacts?.ok ? (bundle.edgar.companyFacts.value.data as CompanyFacts) : null,
        isoDay(balance.date), currencies.model, bundle.builtAt),
    });
  })() : null;
  const scores = computeScores({
    route,
    policy,
    growth,
    roic: returns.roic,
    rote: returns.rote,
    roicVsWacc: returns.roicVsWacc,
    wacc: returns.wacc,
    capital,
    forensics,
    technicals,
    valuation,
    // D-46: the bank balance sheet is graded on these route metrics.
    financialMetrics,
    utilityCredit,
    currentPrice,
    asOf: asOfDay,
    quoteAsOf: bundle.quote.ok ? bundle.quote.value.asOf : null,
  });

  // Same point-in-time anchors as computeValuation (audit H2/M3/M4): the NEWER
  // of the latest quarterly vs annual whole rows (balance + diluted shares,
  // zero-for-undisclosed share counts treated as missing), and net debt from
  // the shared components-only resolver. Disclosures are emitted once from the
  // valuation block (identical underlying rows).
  const inc0Proj = incomeAnnual[0];
  const projRowDate = (r: { date?: unknown } | null | undefined): string =>
    typeof r?.date === "string" ? r.date : "";
  const posSharesProj = (v: number | null): number | null => (v !== null && v > 0 ? v : null);
  const sharesQProj = posSharesProj(num(incomeQuarterly[0]?.weightedAverageShsOutDil));
  const sharesAProj = posSharesProj(num(inc0Proj?.weightedAverageShsOutDil));
  const dilutedSharesProj =
    projRowDate(incomeQuarterly[0]) >= projRowDate(inc0Proj) ? (sharesQProj ?? sharesAProj) : (sharesAProj ?? sharesQProj);
  // Collapse restated/duplicate fiscal years BEFORE the dispersion sees them.
  // Removing the irregular-spacing veto left scenarioDispersion with no
  // protection against a duplicated period, which contributes a zero-length
  // interval and a repeated observation to the volatility estimate.
  const projNorm = normalizeQuarterRows(incomeAnnual);
  const projectionPeriodGaps: ManifestEntry[] = projNorm.rejected.map(({ period, reason }) => ({
    field: "projections.incomeStatement.period",
    reason: `annual period ${period} dropped from the projection history: ${reason}`,
    severity: "warn" as const,
  }));
  const disclosedProjectionInterest = (row: FmpIncomeStatementRow): boolean => {
    const evidence = row.fieldProvenance?.interestExpense;
    return evidence?.source === "edgar" && evidence.periodEnd === isoDay(row.date) && currencies.model !== null &&
      evidence.unit.toUpperCase() === currencies.model && evidence.tags.length > 0 && evidence.filings.length > 0 &&
      row.fieldConflicts?.interestExpense === undefined;
  };
  const projectionIncomeHistory = projNorm.rows.map(
    (r): ProjectionIncomeRow => ({
      date: String(r.date ?? ""),
      revenue: num(r.revenue),
      // Projections and their EPS conversion use the DCF's operating EBIT.
      // Vendor EBIT can include non-operating gains (pretax income + interest).
      ebit: num(r.operatingIncome),
      netIncome: num(r.netIncome),
      epsDiluted: num(r.epsDiluted),
      interestExpense: num(r.interestExpense),
      interestExpenseDisclosed: disclosedProjectionInterest(r),
    }),
  );
  // Never default a currency. This used to be `?? "USD"`, and the value becomes
  // the printed UNIT on the fair-value per-share and on every projection point
  // (`${currency}/share`) — so an issuer whose profile carries no currency had
  // its figures labelled US dollars on no evidence at all. That is the same
  // false-denomination defect the report formatter was fixed for; a missing
  // currency must read as unknown, not as USD.
  // Falls back to the STATEMENTS' reporting currency, which is where a
  // per-share intrinsic value is actually denominated. Leaving it null produced
  // the unit "per share (currency unknown)", which is outside the provenance
  // vocabulary, so canonicalizeTracedUnit rejected it and the fair value,
  // projections and scenario targets were silently DROPPED from the registry —
  // a worse outcome than the USD default this replaced.
  const projectionCurrency = currencies.model;
  // D-65: forecast EPS deducts interest at the latest quarter's run-rate, on
  // debt net of the operating-lease liability (its cost is an operating expense).
  const debtExLeases = (row: FmpBalanceSheetRow | undefined): { date: string; debt: number | null } | null => {
    const date = isoDay(row?.date);
    if (row === undefined || date === null) return null;
    const debt = bookDebtOnLeaseBasis(row, false).value;
    const financing = [row.shortTermDebt, row.longTermDebt, row.financeLeaseLiability].map(num);
    const conflictingZero = debt === 0 && financing.some((part) => part !== null && part !== 0);
    return { date, debt: debt === null || debt < 0 || conflictingZero ? null : debt };
  };
  const latestIncomeQuarter = incomeQuarterly[0];
  const projectionQuarterDate = isoDay(latestIncomeQuarter?.date);
  const projectionAnchorDate = valuation.kind === "dcf" ? valuation.assumptions?.asOf.statements ?? null : null;
  // Future EBIT/interest/tax is consolidated/entity scope. A historical NCI
  // amount cannot allocate those future earnings to the quoted common holder.
  const projectionOwnershipBalance = [...balanceQuarterly, ...balanceAnnual]
    .filter(row => projectionAnchorDate !== null && isoDay(row.date) !== null && isoDay(row.date)! <= projectionAnchorDate)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  const projectionOwnershipIncome = [...incomeQuarterly, ...incomeAnnual]
    .filter(row => projectionAnchorDate !== null && isoDay(row.date) !== null && isoDay(row.date)! <= projectionAnchorDate)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  const projectionOutsideOwnership = [num(projectionOwnershipBalance?.minorityInterest), num(projectionOwnershipIncome?.netIncomeAttributableToNoncontrollingInterest)]
    .some(value => value !== null && value !== 0);
  // FIN-119 (OD-1, one definition of claims senior to common): a refused temporary-equity operand, or an
  // admitted claim, also leaves a future common-earnings allocation unestablished. This covers a redeemable
  // NCI beside a null book NCI, which the bridge fields cannot show. An unknown (withheld) enrichment withholds nothing.
  const projectionTemporary = projectionOwnershipBalance === undefined ? null : temporaryEquityClaims(temporaryEquityOperands(projectionOwnershipBalance));
  const projectionTemporaryClaim = projectionTemporary !== null && (projectionTemporary.refusal !== null || projectionTemporary.total > 0);
  // A rejected TTM can leave an older annual DCF anchor. Its EPS must not
  // import a newer quarter, or interest in an unestablished/different currency.
  const projectionInterest = latestIncomeQuarter !== undefined && projectionQuarterDate !== null && projectionAnchorDate !== null
    && projectionQuarterDate <= projectionAnchorDate && projectionQuarterDate > projRowDate(inc0Proj)
    && currencies.model !== null && establishedCurrencyOn([latestIncomeQuarter], projectionQuarterDate, currencyEvidence) === currencies.model
    ? interestRunRate({ date: projectionQuarterDate, interestExpense: num(latestIncomeQuarter.interestExpense),
      interestExpenseDisclosed: disclosedProjectionInterest(latestIncomeQuarter) },
      debtExLeases(balanceQuarterly.find((b) => isoDay(b.date) === isoDay(latestIncomeQuarter.date))),
      debtExLeases(balanceQuarterly.find((b) => { const d = isoDay(b.date); const q = isoDay(latestIncomeQuarter.date); return d !== null && q !== null && d < q && (Date.parse(q) - Date.parse(d)) / SPREAD_DAYS >= 80 && (Date.parse(q) - Date.parse(d)) / SPREAD_DAYS <= 100; })))
    : null;
  const projections = computeProjections({
    route,
    interestRunRate: projectionInterest,
    debtAtAnchor: debtExLeases([...balanceQuarterly, ...balanceAnnual].find((row) => isoDay(row.date) === projectionAnchorDate)),
    valuation,
    waccPct: returns.wacc.waccPct,
    dilutedShares: dilutedSharesProj,
    ...(projectionOutsideOwnership ? { forecastEpsWithheldReason: "Noncontrolling ownership or income is evidenced at the operating forecast anchor, but a future common-earnings allocation is unestablished. No book NCI or historical NCI-income amount is allocated to future EBIT or cash flows." }
      : projectionTemporaryClaim ? { forecastEpsWithheldReason: "Temporary equity (redeemable preferred or redeemable noncontrolling interests) is filed, or refused, at the operating forecast anchor, but a future common-earnings allocation is unestablished. Its carrying amount is not a dividend or earnings forecast and is not subtracted from forecast operating earnings." } : {}),
    incomeHistory: projectionIncomeHistory,
    fcfHistory: capital.fcf.series.map((r) => ({ date: r.date, fcf: r.fcf })),
    shareCountAnnualizedPct: capital.shareCount.annualizedPct,
    currency: projectionCurrency,
    asOf: asOfDay,
    // D-60: the remaining repurchase authorization for the EPS capital-return disclosure.
    capitalReturn: (() => {
      const capitalReturn = buildFilingDisclosures(bundle)?.capitalReturn ?? null;
      return capitalReturn === null ? null : {
        authorizationRemaining: capitalReturn.authorizationRemaining,
        source: (() => { const source=capitalReturn.authorizationRemainingSource ?? capitalReturn.source;
          return `${source.form} ${source.accession}, filed ${source.filingDate}${capitalReturn.authorizationRemainingAsOf ? `, authorization as of ${capitalReturn.authorizationRemainingAsOf}` : ""}`; })(),
        currentPrice: num(firstRow(bundle.quote)?.price),
      };
    })(),
  });

  // Deterministic bull/base/bear price targets (2026-07-11 scenario-credibility
  // checkpoint). Reuses the SAME point-in-time anchors + ±σ construction as the
  // projection fan, so the target band and the fan agree; base IS the DCF fair
  // value. Suppressed (never fabricated) off the general DCF route / on missing
  // WACC or bridge inputs. assembleReport overwrites the judge's scenario
  // priceTargets from this — the LLM no longer authors the headline numbers.
  // The per-share bridge for the perturbed re-runs is the base DCF's own
  // (valuation.dcf.bridge, lease-adjusted by valueCompany), never the raw
  // figure held here.
  const scenarioTargets = computeScenarioTargets({
    route,
    valuation,
    waccPct: returns.wacc.waccPct,
    incomeHistory: projectionIncomeHistory,
    currentPrice,
    currency: projectionCurrency,
    asOf: asOfDay,
  });

  // Deterministic intrinsic per-share fair value (2026-07-11 DCF-credibility
  // checkpoint). Route-appropriate (FCFF DCF / excess-return), reused from
  // valueCompany — never recomputed. assembleReport overwrites the judge's
  // valuation.dcf.perShare + upsidePct from this; suppressed (never fabricated)
  // when no per-share model applies or the equity bridge is missing.
  // Audit 2026-10-22 F-13: an available value built on substituted inputs
  // carries a "degraded inputs" reason naming each substitution.
  const fairValue = withDegradedInputs(
    computeFairValue({
      valuation,
      currentPrice,
      currency: projectionCurrency,
      asOf: asOfDay,
    }),
    degradedInputsReason({
      riskFree: riskFreePct(bundle),
      waccHistoryCurrentOnly: valuation.kind === "dcf" && riskFreeObservations(bundle).length === 0 && returns.waccHistory.missing.length > 0,
      bundleGaps: bundle.gaps,
      valuationGaps: valuation.gaps,
    }),
  );

  // --- Metric-policy suppression sweep (disclose, don't silently drop) -------
  // Forensics Z / M already suppressed inside runForensics for financials; we
  // additionally record the policy-driven suppressions for the UI.
  if (isSuppressed("altmanZ")) suppress("forensics.altmanZ", route.base === "general" && route.overlays.includes("regulated-utility")
    ? "Altman Z-score not meaningful for a regulated utility (its rate base and regulatory assets are not the manufacturing balance sheets the Z models were estimated on) — suppressed by metric policy"
    : `Altman Z-score not meaningful for ${route.base} — suppressed by metric policy`);
  if (isSuppressed("beneishM")) suppress("forensics.beneishM", `Beneish M-score not meaningful for ${route.base} — suppressed by metric policy`);
  if (isSuppressed("fcfDcf")) {
    suppress(
      "valuation.dcf",
      modelEligibilityReason ?? (route.overlays.includes("unprofitable")
        ? "FCFF DCF not meaningful — free cash flow is structurally negative (unprofitable overlay); see multiples for relative valuation"
        : `FCFF DCF not meaningful for ${route.base} - book/excess-return model used`),
    );
  }
  if (isSuppressed("evEbitda")) suppress("multiples.evToEbitda", `EV/EBITDA excluded for ${route.base} — enterprise value ill-defined`);
  if (isSuppressed("currentRatio")) suppress("returns.currentRatio", `current ratio not meaningful for ${route.base}`);

  // Audit 2026-10-22 B-24: a results release later than every statement.
  const newer = newerResultsRelease(bundle);
  const newerResultsGaps: ManifestEntry[] = newer === null ? [] : [{ field: "fundamentals.newerResults", severity: "warn", reason: newerResultsSentence({
    source: { form: newer.release.form ?? "8-K", accession: newer.release.accession, exhibit: null, filingDate: newer.release.filingDate, url: null },
    reportedPeriod: newer.release.reported.fiscal?.label ?? null, reportedPeriodEnd: newer.reportedPeriodEnd, statementsEnd: newer.statementsEnd,
  }) }];

  // Audit 2026-10-22 B-23: a 10-Q or 10-K on file that the statements do not reach.
  const newerFiling = newerPeriodicFiling(bundle);
  if (newerFiling !== null) newerResultsGaps.push({ field: "fundamentals.newerFiling", severity: "warn", reason: newerFilingSentence({
    source: { form: newerFiling.filing.form, accession: newerFiling.filing.accessionNumber, exhibit: null, filingDate: newerFiling.filing.filingDate, url: null },
    periodEnd: newerFiling.filing.reportDate.slice(0, 10), statementsEnd: newerFiling.statementsEnd,
  }) });

  // --- Merge all gaps + notes ------------------------------------------------
  const gaps = mergeManifest(
    newerResultsGaps,
    bundle.gaps,
    ttmGaps,
    route.gaps,
    degradation.gaps,
    growth.gaps,
    returns.gaps,
    capital.gaps,
    forensics.gaps,
    eventGaps,
    projectionPeriodGaps,
    technicals.gaps,
    valuation.gaps,
    // WS5: every withheld route metric reaches the missing-data manifest with
    // the reason it was withheld.
    financialMetrics.gaps,
    runway?.gaps ?? null,
  );

  // The 8-K forensic events belong with the forensic notes the report renders,
  // not in runStageB's own `notes`, which has no consumer.
  forensics.notes.push(...eventNotes);
  notes.push(...route.notes);
  return {
    symbol: bundle.symbol,
    builtAt: bundle.builtAt,
    route,
    degradation,
    growth,
    returns,
    capital,
    forensics,
    technicals,
    valuation,
    financialMetrics,
    runway,
    scores,
    projections: alignProjectionScenarios(projections, scenarioTargets),
    scenarioTargets,
    fairValue,
    suppressed,
    notes,
    gaps,
  };
}

/**
 * WS5 (D-17): the report-ready route-metrics block, or null on a route that has
 * none.
 *
 * `Report.routeMetrics` was defined and never populated, and the excess-return
 * model's P/TBV-against-ROTE reading had no consumer anywhere downstream, so a
 * bank report could say a metric was WITHHELD (through the missing-data
 * manifest) but could never show one. This assembles both into the single
 * schema surface: every computed route metric, and the multiple a financial is
 * actually read on beside the return that justifies it.
 *
 * Pure and deterministic — it copies figures Stage B already computed, with
 * their own basis strings, source paths and as-of dates.
 */
export function routeMetricsBlock(computed: ComputedMetrics): RouteMetrics | null {
  // The verify pass can lose its WeakMap context and fall back to a MINIMAL
  // stand-in ({ gaps: [] } cast to ComputedMetrics), so neither member is
  // guaranteed to exist here even though the type says so. A missing Stage B
  // object means no route metrics, never a thrown assembly.
  const fm = computed.financialMetrics as FinancialMetricsResult | undefined;
  const rows: RouteMetricRow[] = [];
  const notes = [...(fm?.notes ?? [])];
  const val = computed.valuation as ComputedMetrics["valuation"] | undefined;

  if (val !== undefined && val.kind === "excess-return") {
    const er = val.excessReturn;
    notes.push(describeFinancialValuation(er.financialAssumptions));
    const p = er.priceToTangibleBookVsRote;
    const src = ["computed.valuation.excessReturn.priceToTangibleBookVsRote"];
    const unavailable = p.withheldReason ?? "not computed";
    rows.push(
      {
        key: "pTbv",
        label: "price / tangible book value",
        unit: "x",
        value: p.pTbv,
        basis: p.basis,
        sources: src,
        asOf: er.asOf,
        withheldReason: p.pTbv === null ? unavailable : null,
        proxy: false,
      },
      {
        key: "rote",
        label: "return on tangible common equity",
        unit: "%",
        value: p.rotePct,
        basis:
          "net income available to common / average tangible common equity — the return the P/TBV multiple above is read against, on the SAME tangible denominator",
        sources: ["computed.returns.rote"],
        asOf: computed.returns?.rote?.asOf ?? null,
        withheldReason:
          p.rotePct === null
            ? "return on tangible common equity unavailable — see the returns block for the reason"
            : null,
        proxy: false,
      },
      {
        key: "justifiedPTbv",
        label: "justified P/TBV (stable-growth cross-check)",
        unit: "x",
        value: p.justifiedPTbv,
        basis: p.basis,
        sources: src,
        asOf: er.asOf,
        withheldReason: p.justifiedPTbv === null ? unavailable : null,
        proxy: false,
      },
      {
        key: "premiumToJustified",
        label: "P/TBV premium to the justified multiple",
        unit: "x",
        value: p.premiumToJustified,
        basis:
          "P/TBV − justified P/TBV; positive means the market pays more than the return supports under the stable-growth cross-check, which rests on a different assumption than the fading forward model",
        sources: src,
        asOf: er.asOf,
        withheldReason: p.premiumToJustified === null ? unavailable : null,
        proxy: false,
      },
    );
    notes.push(
      "P/TBV is read against ROTE on the same tangible denominator (equity less goodwill, other intangibles and " +
        "preferred): a goodwill-heavy acquirer at 1.0x book can be at 2.0x tangible book, and pairing a book multiple " +
        "with a tangible-equity return would compare two different bases.",
    );
  }

  rows.push(...(fm?.metrics ?? []));
  if (rows.length === 0 || fm === undefined) return null;

  const asOf = rows.reduce<string | null>(
    (acc, m) => (m.asOf !== null && (acc === null || m.asOf > acc) ? m.asOf : acc),
    null,
  );
  return { route: fm.route, metrics: rows, notes, asOf };
}

// ---------------------------------------------------------------------------
// Returns block
// ---------------------------------------------------------------------------

function quoteInput(quote: FmpRawRow | null): QuoteInput {
  return { price: num(quote?.price), timestamp: num(quote?.timestamp) };
}

function computeReturns(
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

  // 2026-07-09 audit M2: key the annual fallback on FIELD nullness, not on
  // ttmInc existence — when the completeness gate nulls a TTM field the annual
  // figure must still be consulted. Missing interest with debt now suppresses
  // WACC, but using a complete annual observation preserves more valid output.
  //
  // Audit 2026-09-06: ONE statement basis for both legs of the coverage
  // ratio. The two fallbacks used to be independent, so a TTM EBIT could be
  // scored against a fiscal-year interest expense (a notch of rating from the
  // mix) under a note that said "on TTM". When the TTM pair is incomplete
  // and the annual pair is complete, the annual figures are used for BOTH
  // legs; a genuinely mixed pair is the last resort and is labelled as such.
  // The basis also decides which balance-sheet pair averages the debt.
  const annualDate = isoDay(incomeAnnual[0]?.date) ?? "?";
  const interestExpenseAnnual = num(incomeAnnual[0]?.interestExpense);
  const ebitAnnual = num(incomeAnnual[0]?.operatingIncome);
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
    ? totalDebtSnapshot(balanceAnnual, balanceQuarterly, "ttm", includeOperatingLeases, statementEvidence).currency
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
  const ebitTtm = ttmDebtComparable ? (ttmInc?.operatingIncome ?? null) : null;
  let interestExpenseForWacc: number | null;
  let ebitForWacc: number | null;
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
    coverageBasis = `FY ${annualDate} annual statement`;
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
    const interestLabel =
      interestExpenseTtm !== null ? "TTM" : interestExpenseAnnual !== null ? `FY ${annualDate}` : "unavailable";
    const ebitLabel = ebitTtm !== null ? "TTM" : ebitAnnual !== null ? `FY ${annualDate}` : "unavailable";
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
  const debtSnapshot = totalDebtSnapshot(balanceAnnual, balanceQuarterly, interestBasis, includeOperatingLeases, statementEvidence);

  // D-60: the beta's regression window, frequency and fit. A vendor beta
  // publishes none, so the same 60-month OLS the keyless route uses runs on the
  // bundle's own daily prices (bars before the analysis day only) and is
  // disclosed beside it; the WACC keeps the beta it already used.
  const betaFit = estimateBeta(
    betaClosePoints(rowsOf(bundle.eodPrices)),
    betaClosePoints(bundle.benchmarkPrices ? rowsOf(bundle.benchmarkPrices.spy) : []),
    { asOf: isoDay(bundle.builtAt) ?? undefined },
  );
  const keylessBeta = profile !== null && num(profile.betaMonths) !== null;

  const classAmbiguity = retainedCommonClassAmbiguity(bundle);
  const equityScope = resolveEconomicEquityScope({
    price: num(quote?.price) ?? num(profile?.price), marketCap: num(quote?.marketCap ?? profile?.marketCap),
    currency: str(profile?.currency),
    priceAsOf: quotePriceObservationDay(num(quote?.price) !== null ? quote : profile),
    issuerId: bundle.edgar.registrant?.cik10, securityId: bundle.symbol,
    ...(classAmbiguity ? { marketCapSecurityBasis: "unresolved" as const, marketCapScopeEvidence: classAmbiguity } : {}),
  }, bundle.economicShareEvidence ?? [], isoDay(bundle.builtAt) ?? "");

  const vendorTaxRate = num(ratiosTtm?.effectiveTaxRateTTM ?? ratiosTtm?.effectiveTaxRate);
  const statementTax = waccTaxRateFromStatements(ttmInc, incomeAnnual[0]);
  if (vendorTaxRate === null && statementTax.fallback !== null) {
    gaps.push({ field: "returns.wacc.effectiveTaxRate.basis", reason: `WACC tax rate: ${statementTax.fallback}`, severity: "info" });
  }

  const wacc = computeWacc({
    beta: num(profile?.beta),
    riskFreePct: rf.pct,
    erpPct: usErpPct,
    interestExpenseTtm: interestExpenseForWacc,
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
    // for the same reason it is wrong for a bank (JPM's keyless run produced
    // 183.28%). Financials keep the existing "cost of debt unavailable, cost of
    // equity carried" outcome.
    priorYearCostOfDebt:
      !isFinancial && (interestExpenseForWacc === null || interestExpenseForWacc <= 0)
        ? priorYearCostOfDebt(incomeAnnual, balanceAnnual, { includeOperatingLeases })
        : null,
    totalDebtAvg: debtSnapshot.average,
    totalDebtBasis: debtSnapshot.basis,
    totalDebtUnavailable: debtSnapshot.unavailable ?? null,
    totalDebtRefused: debtSnapshot.refused === true,
    totalDebtLatest: debtSnapshot.latest ?? null,
    totalDebtLatestBasis: debtSnapshot.latestBasis ?? null,
    currentCoverageBasis: coverageBasis,
    negativeTotalDebtObservation: debtSnapshot.negativeObservation,
    marketCap: equityScope.marketCap,
    // Review m5: a cap withheld on share scope is named as withheld, with the scope's reason.
    marketCapWithheld: equityScope.status === "unresolved" ? equityScope.basis : null,
    // FMP's ratios-ttm endpoint suffixes every metric name with "TTM"
    // (effectiveTaxRate -> effectiveTaxRateTTM); the annual ratios fallback row
    // keeps the bare name. Try both so a live vendor rename doesn't silently
    // suppress a levered WACC unnecessarily.
    effectiveTaxRate: num(ratiosTtm?.effectiveTaxRateTTM ?? ratiosTtm?.effectiveTaxRate) ?? statementTax.rate,
    // WS6 (D-19): name which tax-rate source actually supplied it.
    effectiveTaxRateBasis:
      num(ratiosTtm?.effectiveTaxRateTTM) !== null
        ? "FMP ratios-ttm effectiveTaxRateTTM (observed effective rate)"
        : num(ratiosTtm?.effectiveTaxRate) !== null
          ? "FMP ratios effectiveTaxRate (observed effective rate)"
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
    ebitTtm: ebitForWacc,
    analysisDate: isoDay(bundle.builtAt) ?? undefined,
    isFinancial,
    // Audit 2026-10-22 B-31: these routes value equity at the cost of equity.
    equityOnlyRoute: isFinancial ? route.base : null,
    totalAssets: bal0 ? num(bal0.totalAssets) : null,
    // ADR guard: market cap is quoted in the trading currency while totalDebt
    // is a reporting-currency balance, so the E/D weights must not mix them.
    reportedCurrency: modelCurrency,
    quoteCurrency: str(profile?.currency),
    asOf: {
      riskFreeRate: rf.asOf ?? undefined,
      statements: isoDay(incomeAnnual[0]?.date) ?? undefined,
      marketCap: (equityScope.status === "resolved" ? equityScope.priceAsOf ?? null
        : equityScope.status === "unresolved" ? null
          : quotePriceObservationDay(num(quote?.marketCap) !== null ? quote : profile)) ?? undefined,
    },
  });

  if (equityScope.status === "unresolved") {
    wacc.gaps.push({ field: "returns.wacc.economicClassBasis", reason: equityScope.basis, severity: "warn", attemptedSources: equityScope.sourceIds });
  }

  // Preferred dividends live on the CASH-FLOW statement; ROTE nets them out of
  // its numerator because its denominator already excludes preferred.
  const preferredByDate = new Map<string, FmpCashFlowRow>(
    cashflowAnnual.map((r: FmpCashFlowRow) => [String(r.date ?? ""), r]),
  );
  const returnsIncome = incomeAnnual.map((r) => toReturnsIncome(r, preferredByDate,
    [...rowsOf(bundle.statements.balanceAnnual), ...rowsOf(bundle.statements.balanceQuarterly)],
    [...rowsOf(bundle.statements.cashflowAnnual), ...rowsOf(bundle.statements.cashflowQuarterly)], bundle.builtAt));
  const returnsBalance = balanceAnnual.map(toReturnsBalance);

  const roic: RoicResult = isFinancial
    ? { series: [], latestRoicPct: null, asOf: isoDay(incomeAnnual[0]?.date),
        notes: ["ROIC is not applicable to financial companies: funding liabilities and cash are operating inputs."], gaps: [] }
    : computeRoic(returnsIncome, returnsBalance, { includeOperatingLeases, domicileCountry: str(profile?.country),
        // FIN-119-V1: the annual balance dates whose temporary-equity enrichment was withheld (the M11 matcher Task 2 uses for the bridge).
        temporaryEquityUnknownDates: balanceAnnual.flatMap((r) => {
          const unknown = temporaryEquityUnknownAt(r, isoDay(r.date), bundle.gaps);
          return unknown === null ? [] : [unknown.date];
        }),
        // Fix round 1, I-1: the balance whose debt refusal withheld the WACC; ROIC's entry is critical only when
        // that same balance refusal withholds the latest fiscal year's ROIC.
        waccRefusal: wacc.waccPct === null && debtSnapshot.refusedBalanceDate !== undefined ? { date: debtSnapshot.refusedBalanceDate } : null });
  // Return on tangible common equity — the capital-return measure for
  // deposit-funded balance sheets, where invested capital is undefined.
  const rote = computeRote(returnsIncome, returnsBalance);
  // C-10/C-11: the trailing four quarters on the fiscal-year return's basis,
  // from the quarterly rows already fetched. A window in another currency than
  // the annual statement is withheld here as it is from the valuation: its
  // earnings cannot be set against balances in the model currency.
  const commonIncomeTtm = ttmIncomeUsable ? ttmInc : null;
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
  const roicVsWacc = computeRoicVsWaccSpread(roic.latestRoicPct, wacc.waccPct);

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
  const waccInputs = waccDisclosure(wacc);
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

// ---------------------------------------------------------------------------
// Valuation block — assemble the discriminated ValuationBundleInputs
// ---------------------------------------------------------------------------

interface ValuationCtx {
  route: CompanyRouteResult;
  incomeAnnual: FmpIncomeStatementRow[];
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
  /** WS6 (D-19): FCF/SBC treatment for the DCF assumption block. */
  capital: CapitalResult;
  wacc: WaccResult;
  // WS6 (D-19): the named WACC inputs and the per-fiscal-year WACC series.
  waccInputs: WaccDisclosure;
  waccHistory: WaccHistoryResult;
  /** Annual ROIC series — evidence for the DCF terminal excess-return rule. */
  roic: RoicResult;
  /** Latest fiscal-year DuPont decomposition — the excess-return ROE fallback. */
  dupont: DupontResult;
  /** WS5: return on tangible common equity — the return P/TBV is read against. */
  rote: RoteResult;
  /** C-10: the trailing-four-quarter common return (financial routes). */
  commonReturnTtm: TtmCommonReturn | null;
  /** THESIS_EV_INCLUDE_LEASES, read once in runStageB and shared with the returns block. */
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
    asOf: outlook.filingDate,
    source: `sec:8-K EX-99.1 ${outlook.accession}`,
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
 * newest row, and (FIN-103) the DCF equity bridge reads the row dated at the
 * statement date. One mapping, so the two cannot drift.
 */
function toMultiplesBalance(row: FmpBalanceSheetRow, basis: "quarter" | "annual" | null | undefined): MultiplesBalance {
  return {
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
    minorityInterest: num(row.minorityInterest),
    preferredStock: num(row.preferredStock),
    // FIN-119: redeemable preferred and redeemable NCI (temporary equity), read through `temporaryEquityClaims`.
    ...temporaryEquityOperands(row),
    equityOwnershipBasis: statementEquityOwnershipBasis(row),
    // WS6 (D-19): lease liabilities for the EV bridge. The TOTAL is
    // disclosure context; only the OPERATING slice is netted out of EV
    // (WS6 review, BLOCKER 1), and the EDGAR route is the only one that
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

function computeValuation(bundle: DataBundle, ctx: ValuationCtx): ValuationResult {
  const { route, incomeAnnual, balanceAnnual, balanceQuarterly, incomeQuarterly, ttmInc, ttmCf, growth, wacc, roic, profile, quote, evIncludeLeases } = ctx;
  // WS6 (D-18/D-19): the growth-anchor regression method and the WACC
  // disclosure travel into the DCF assumption block with the rest.
  const waccByYear = new Map(ctx.waccHistory.points.map((point) => [point.date, point]));

  const bal0 = balanceAnnual[0];
  const inc0 = incomeAnnual[0];
  const rowDate = (r: { date?: unknown } | null | undefined): string =>
    typeof r?.date === "string" ? r.date : "";
  // Point-in-time balance anchor (2026-07-09 audit M4): whole-row preference
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
  // 2026-07-09 audit M3: per-share values against a current price use the
  // weighted-average diluted share count from the NEWER of the latest quarterly
  // vs annual income statement (domain-valuation.md §"per-share"); annual can be
  // up to ~18 months stale on buybacks/dilution, but a lagging quarterly feed
  // must not beat a fresher annual row. A literal 0 is FMP's
  // zero-for-undisclosed sentinel, not a real count (missing ≠ zero).
  const posShares = (v: number | null): number | null => (v !== null && v > 0 ? v : null);
  const sharesQuarterly = posShares(num(incomeQuarterly[0]?.weightedAverageShsOutDil));
  const sharesAnnual = posShares(num(inc0?.weightedAverageShsOutDil));
  const quarterlySharesFresh = rowDate(incomeQuarterly[0]) >= rowDate(inc0);
  const dilutedShares = quarterlySharesFresh ? (sharesQuarterly ?? sharesAnnual) : (sharesAnnual ?? sharesQuarterly);
  const dilutedSharesBasis: "quarter" | "annual" | null =
    dilutedShares === null
      ? null
      : (quarterlySharesFresh && sharesQuarterly !== null) || sharesAnnual === null
        ? "quarter"
        : "annual";

  const netDebtInfo = netDebtFromBalance(balPoint);
  const netDebtDerived = netDebtInfo.value;

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
  const estimateResolved = estimateRows.map((r) => providerRowCurrency(r, issuerCurrency));
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
        ` while the model runs in ${ctx.modelCurrency ?? "an unestablished currency"}, so the analyst-consensus ` +
        "growth case is not used (no FX conversion is attempted)",
      severity: "info",
      attemptedSources: ["fmp:/stable/analyst-estimates"],
    });
  } else if (estimateResolved.some((r) => r.inherited)) {
    estimateGaps.push({
      field: "valuation.analystEstimates.currency",
      reason: `analyst estimate currency ${issuerCurrency.basis}; the analyst-consensus growth case uses them in ${ctx.modelCurrency}`,
      severity: "info",
      attemptedSources: ["fmp:/stable/analyst-estimates"],
    });
  }
  const analystEstimates: AnalystEstimateRow[] | null = bundle.analystEstimates.ok && estimatesInModelCurrency
    ? estimateRows
        // D-65: the analyst count and range are the breadth and agreement evidence beyond year two.
        .map((r) => ({ date: String(r.date ?? ""), revenueAvg: num(r.revenueAvg), analysts: num(r.numAnalystsRevenue),
          revenueLow: num(r.revenueLow), revenueHigh: num(r.revenueHigh) }))
        .filter((r) => r.date.length > 0)
    : null;

  const dcfIncomeTtm: DcfIncomeRow | null = ttmInc
    ? {
        date: ttmInc.date,
        basis: "ttm",
        revenue: ttmInc.revenue,
        operatingIncome: ttmInc.operatingIncome,
        grossProfit: ttmInc.grossProfit ?? null,
        incomeBeforeTax: ttmInc.incomeBeforeTax,
        incomeTaxExpense: ttmInc.incomeTaxExpense,
      }
    : inc0
      ? {
          date: String(inc0.date ?? ""),
          basis: "annual",
          revenue: num(inc0.revenue),
          operatingIncome: num(inc0.operatingIncome),
          grossProfit: num(inc0.grossProfit),
          incomeBeforeTax: num(inc0.incomeBeforeTax),
          incomeTaxExpense: num(inc0.incomeTaxExpense),
        }
      : null;

  // FIN-103: the DCF equity bridge reads the balance dated at the DCF statement
  // date (D-65), not the newest row the market EV uses.
  const bridge = dcfBridgeRow(isoDay(dcfIncomeTtm?.date), dcfIncomeTtm?.basis ?? null, balanceQuarterly, balanceAnnual, { row: balPoint ?? null, basis: balPointBasis ?? null });
  const bridgePoint = bridge.row;
  const bridgePointBasis = bridge.basis;
  const bridgeNetDebtInfo = netDebtFromBalance(bridgePoint);

  // Same deduped rows the projection history uses: the DCF's near-term growth
  // path is fitted to this series, so a restated fiscal year appearing twice
  // biases the base case exactly as it biased the dispersion.
  const dcfIncomeHistory: DcfIncomeRow[] = normalizeQuarterRows(incomeAnnual).rows.map((r) => ({
    date: String(r.date ?? ""),
    revenue: num(r.revenue),
    operatingIncome: num(r.operatingIncome),
    grossProfit: num(r.grossProfit),
    incomeBeforeTax: num(r.incomeBeforeTax),
    incomeTaxExpense: num(r.incomeTaxExpense),
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
    // FIN-119-V1: temporary equity (and any refusal of it, in `fieldConflicts`) is financing capital in sales-to-capital.
    ...temporaryEquityFields(row),
    ...(row.fieldConflicts !== undefined ? { fieldConflicts: row.fieldConflicts } : {}),
    cashAndShortTermInvestments: num(row.cashAndShortTermInvestments),
    longTermInvestments: num(row.longTermInvestments),
  });
  const dcfBalance: DcfBalanceRow | null = bridgePoint && bridgePointBasis ? toDcfBalance(bridgePoint, bridgePointBasis) : null;
  // Audit 2026-10-22 A-2: the annual rows behind the issuer's own sales-to-capital.
  const dcfCapitalHistory: DcfBalanceRow[] = balanceAnnual.map((row) => toDcfBalance(row, "annual"));

  // D-58: the run-rate quarters — the TTM window's newest quarter and the same
  // fiscal quarter a year earlier, the latter only when its own currency
  // evidence establishes the model currency.
  const latestQuarter = ttmInc ? incomeQuarterly.find((r) => isoDay(r.date) === ttmInc.date) : undefined;
  const yearAgoQuarter = latestQuarter === undefined ? undefined : incomeQuarterly.find((r) => {
    const days = (Date.parse(String(latestQuarter.date)) - Date.parse(String(r.date))) / SPREAD_DAYS;
    return days >= 350 && days <= 380;
  });
  const yearAgoDate = yearAgoQuarter === undefined ? null : isoDay(yearAgoQuarter.date);
  // AMZN audit 2026-10-20: the same fiscal quarter a year before the guided
  // quarter, so the guidance carries at its year-over-year pace, under the
  // same currency rule.
  const guidance = dcfGuidance(bundle, ctx.modelCurrency);
  const guidedYearAgoQuarter = guidance === null ? undefined : incomeQuarterly.find((r) => {
    const days = (Date.parse(guidance.periodEnd) - Date.parse(String(r.date))) / SPREAD_DAYS;
    return days >= 350 && days <= 380;
  });
  const guidedYearAgoDate = guidedYearAgoQuarter === undefined ? null : isoDay(guidedYearAgoQuarter.date);
  const dcfQuarterRevenue: DcfQuarterRevenue | null = ttmInc && latestQuarter
    ? {
        latest: { date: ttmInc.date, revenue: num(latestQuarter.revenue) },
        yearAgo: yearAgoQuarter !== undefined && yearAgoDate !== null &&
          establishedCurrencyOn([yearAgoQuarter], yearAgoDate, ctx.currencyEvidence) === ctx.modelCurrency
          ? { date: yearAgoDate, revenue: num(yearAgoQuarter.revenue) }
          : null,
        ...(guidedYearAgoQuarter !== undefined && guidedYearAgoDate !== null &&
          establishedCurrencyOn([guidedYearAgoQuarter], guidedYearAgoDate, ctx.currencyEvidence) === ctx.modelCurrency
          ? { guidedYearAgo: { date: guidedYearAgoDate, revenue: num(guidedYearAgoQuarter.revenue) } }
          : {}),
      }
    : null;

  // D-65: revenue already reported in the fiscal year the first DCF window
  // starts in — the quarters after the latest annual statement through the TTM
  // end, each in the model currency. Consecutive 13/14-week quarters only.
  const fiscalYearToDate: FiscalYearToDate | null = (() => {
    const priorFiscalYearEnd = isoDay(inc0?.date);
    if (!ttmInc || priorFiscalYearEnd === null || priorFiscalYearEnd >= ttmInc.date) return null;
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

  // AMZN audit 2026-10-20, finding 19: the last complete fiscal year's four
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
          // WS6 (D-18): the log-linear regression method of the growth anchor.
          revenueLogLinear: growth.revenueLogLinear,
          analystEstimates,
          // AMZN audit 2026-10-20, finding 2: a rate-limit refusal is named, not shown as "uncovered".
          ...(!bundle.analystEstimates.ok && isFmpQuotaReason(bundle.analystEstimates.gap.reason)
            ? { analystEstimatesRefusal: bundle.analystEstimates.gap.reason }
            : {}),
          waccPct: wacc.waccPct ?? 0,
          // WS6 (D-19): every WACC input named in the assumption block.
          waccBasis: ctx.waccInputs.summary,
          // WS6 (D-19): the reported FCF before and after the SBC deduction.
          // D-60: the trailing twelve months when the current-capital cash
          // bridge has a complete TTM window (the DCF starts from the TTM), else
          // the latest fiscal year. NVDA's row showed FY2026 $96.68B beside a
          // TTM start revenue.
          fcfSbc: ctx.capital.current?.basis === "ttm" && ctx.capital.current.cashBridge.standardizedFcf !== null
            ? {
                beforeSbc: ctx.capital.current.cashBridge.standardizedFcf,
                afterSbc: ctx.capital.current.cashBridge.afterSbcStandardizedFcf,
                sbc: ctx.capital.current.cashBridge.stockBasedCompensation,
                asOf: ctx.capital.current.asOf,
                basis: `TTM ${ctx.capital.current.periodStart ?? "?"} to ${ctx.capital.current.asOf ?? "?"}: operating cash flow minus cash capital expenditure, before and after stock-based compensation`,
              }
            : {
                beforeSbc: ctx.capital.fcf.latestFcfBeforeSbc,
                afterSbc: ctx.capital.fcf.latestFcf,
                sbc: ctx.capital.fcf.latestSbc,
                // N2: the FCF row's OWN fiscal year end, not the capital block's
                // as-of (which falls back to the income or balance statement). The
                // assumption block printed a date that was not the year the figure
                // came from whenever those statements ended on different days.
                asOf:
                  ctx.capital.fcf.series[ctx.capital.fcf.series.length - 1]?.date ?? ctx.capital.asOf,
                basis: ctx.capital.fcf.basis,
              },
          riskFreePct: rf.pct ?? 0,
          incomeTtm: dcfIncomeTtm,
          // Audit item 15 (FCX-9): tagged one-offs inside that operating income.
          unusualOperatingItems: dcfIncomeTtm === null ? null : unusualOperatingItemsTtm(confirmedIssuerFacts(bundle.symbol, bundle.edgar), {
            ttmEnd: dcfIncomeTtm.date,
            fiscalYearEnd: incomeAnnual.map((r) => rowDate(r)).find((d) => d !== "" && d <= dcfIncomeTtm.date) ?? null,
            unit: ctx.modelCurrency,
            observedAt: bundle.builtAt,
          }),
          incomeHistory: dcfIncomeHistory,
          balance: dcfBalance,
          // FIN-303: the existing lease switch (no new config read) reaches sales-to-capital and its A-2 history.
          includeLeasesInEv: evIncludeLeases,
          bridgeCause: { cause: bridge.cause, detail: bridge.detail },
          capitalHistory: dcfCapitalHistory,
          marketCap,
          // The terminal excess-return rule reads the same annual ROIC series
          // the returns section reports.
          // WS6 (D-19): each ROIC year carries the WACC recomputed from its own
          // fiscal year end's risk-free observation, when one existed.
          roicHistory: roic.series.map((y) => {
            const point = waccByYear.get(y.date);
            return {
              date: y.date,
              roicPct: y.roicPct,
              waccPct: point?.waccPct ?? null,
              waccAsOf: point?.riskFreeAsOf ?? null,
            };
          }),
          // ADR guard (audit H3): same currency pair the multiples framework
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
        operatingIncome: ttmInc.operatingIncome,
        incomeBeforeTax: ttmInc.incomeBeforeTax,
        depreciationAndAmortization: ttmInc.depreciationAndAmortization,
        netIncome: ttmInc.netIncome,
        netIncomeAvailableToCommon: ttmInc.netIncomeAvailableToCommon ?? null,
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
          operatingIncome: num(inc0.operatingIncome),
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
  const multiplesBalance: MultiplesBalance | null = balPoint ? toMultiplesBalance(balPoint, balPointBasis) : null;
  // FIN-103: the DCF bridge's own row, mapped the same way.
  const bridgeBalance: MultiplesBalance | null = bridgePoint ? toMultiplesBalance(bridgePoint, bridgePointBasis) : null;

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

  // WS5: FFO/AFFO per the NAREIT definition where the filer's tags allow (net
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
    companyFacts: bundle.edgar?.companyFacts ?? null,
    periodEnd: isoDay(ctx.incomeAnnual[0]?.date),
    reportedCurrency: str(ctx.incomeAnnual[0]?.reportedCurrency),
    netIncome: num(ctx.incomeAnnual[0]?.netIncome),
    depreciationAndAmortization: num(ctx.incomeAnnual[0]?.depreciationAndAmortization),
    capitalExpenditure: num(ctx.cashflowAnnual[0]?.capitalExpenditure),
  });
  const ffoApprox = nareitFfo.ffo;
  const affoApprox = nareitFfo.affo;

  const multiples: MultiplesFrameworkInputs = {
    quote: multiplesQuote,
    economicShareEvidence: bundle.economicShareEvidence,
    securityBasisAsOf: bundle.builtAt.slice(0, 10),
    reportedCurrency: ctx.modelCurrency,
    incomeTtm: multiplesIncomeTtm,
    cashFlowTtm: multiplesCashFlowTtm,
    balance: multiplesBalance,
    quarterlyFundamentals,
    enterpriseValuesHistory,
    reitSubmap: route.reitSubmap,
    ffoApprox: route.base === "reit" ? ffoApprox : null,
    affoApprox: route.base === "reit" ? affoApprox : null,
    // The own-history P/FFO band can only be rebuilt as net income + D&A per
    // quarter; say whether the current FFO is that construction.
    ffoHistoryComparable: route.base === "reit" ? nareitFfo.netIncomePlusTotalDa : undefined,
    affoHistoryComparable: route.base === "reit" ? nareitFfo.affoHistoryComparable === true : undefined,
    // WS6 (D-19): off by default; see docs/METHODOLOGY.md, "EV bridge".
    includeLeasesInEv: evIncludeLeases,
    // The observation cutoff any supplied comparability evidence must predate;
    // without it every supplied evidence row read as "unavailable".
    peerComparisonAsOf: bundle.peerFundamentals?.collectedAt ?? bundle.builtAt,
  };
  Object.assign(multiples, comparePeerFundamentals({
    symbol: bundle.symbol, profile: bundle.profile.ok ? bundle.profile.value.data.rows[0] : undefined, quote: bundle.quote, route: route.base,
    subject: multiples, now: new Date(bundle.peerFundamentals?.collectedAt ?? bundle.builtAt), collection: bundle.peerFundamentals,
    subjectIncomeQuarterly: bundle.statements.incomeQuarterly,
    subjectBalanceQuarterly: bundle.statements.balanceQuarterly,
  }));

  // --- Excess-return inputs (financials) ------------------------------------
  // Market cap and diluted shares belong to COMMON. Keep opening equity,
  // earnings and payout on that ownership basis and the same fiscal year.
  // A vendor total-equity ROE cannot be applied to common or tangible equity.
  const financialRoute = route.base === "bank" || route.base === "insurer" || route.base === "reit-mortgage";
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

  // Audit 2026-10-22 C-10: start from the trailing four quarters when that
  // return is complete and newer than the latest fiscal year, from the book
  // value at the window's end; the fiscal-year start is valued beside it.
  // Audit 2026-10-22 B-37: with more than one common class, the diluted count
  // is the per-share denominator only when the basic count from the same row
  // spans every class (`issuerEconomicDilutedShares`); it is then restated in
  // quoted-share units.
  const dilutedSharesRow = dilutedSharesBasis === "quarter" ? incomeQuarterly[0] : dilutedSharesBasis === "annual" ? inc0 : undefined;
  const economicDiluted = issuerEconomicDilutedShares(
    resolveEconomicEquityScope(multiplesQuote, bundle.economicShareEvidence ?? [], bundle.builtAt.slice(0, 10)),
    bundle.economicShareEvidence ?? [],
    { basic: posShares(num(dilutedSharesRow?.weightedAverageShsOut)), diluted: dilutedShares, periodEnd: isoDay(dilutedSharesRow?.date) },
  );
  const valuationDilutedShares = economicDiluted?.shares ?? dilutedShares;

  const ttmReturn = ctx.commonReturnTtm;
  const fyBasis = route.base === "bank" ? "fiscal-year-rote" as const : "fiscal-year-common-roe" as const;
  const ttmStart = ttmReturn !== null && ttmReturn.returnPct !== null && ttmReturn.closingEquity !== null && ttmReturn.closingEquity > 0 &&
    ttmReturn.asOf !== null && (commonReturns.asOf === null || ttmReturn.asOf > commonReturns.asOf)
    ? { roePct: ttmReturn.returnPct, bookValue: ttmReturn.closingEquity, asOf: ttmReturn.asOf }
    : null;
  const combinationYears = financialRoute
    ? businessCombinationYears(confirmedIssuerFacts(bundle.symbol, bundle.edgar), ctx.balanceAnnual.map(toReturnsBalance), ctx.modelCurrency)
    : new Map<string, string>();
  const excessReturn: ExcessReturnInputs | null =
    financialRoute
      ? {
          bookValue: ttmStart?.bookValue ?? commonReturns.latestTangibleCommonEquity,
          bookValueBasis: route.base === "bank" ? "tangible-common-equity" : "common-equity",
          currentRoePct: ttmStart?.roePct ?? commonReturns.latestRotePct,
          currentRoeBasis: ttmStart !== null ? (route.base === "bank" ? "ttm-rote" : "ttm-common-roe") : fyBasis,
          currentRoeAsOf: ttmStart?.asOf ?? commonReturns.asOf,
          startAlternative: ttmStart !== null && commonReturns.latestRotePct !== null && commonReturns.latestTangibleCommonEquity !== null && commonReturns.latestTangibleCommonEquity > 0
            ? { roePct: commonReturns.latestRotePct, basis: fyBasis, asOf: commonReturns.asOf, bookValue: commonReturns.latestTangibleCommonEquity }
            : null,
          // Audit M5: null CoE SUPPRESSES the model inside excessReturnModel
          // (critical gap) — never a silent 10% default.
          costOfEquityPct: wacc.costOfEquityPct,
          // Audit L4: (dividends + net buybacks) / net income, 3y average, from
          // the annual cash-flow statements; null suppresses the valuation.
          payoutRatioPct: payoutRatioPct3y(commonPayoutRows),
          dilutedShares: valuationDilutedShares,
          marketCap,
          asOf: ttmStart?.asOf ?? commonReturns.asOf,
          // WS5: P/TBV is read against ROTE, both on the tangible base the
          // returns block already computes — never against plain book equity.
          // A bank's trailing ROTE and the tangible equity at its end pair the same way (C-10).
          tangibleCommonEquity: route.base === "bank" && ttmStart !== null ? ttmStart.bookValue : ctx.rote?.latestTangibleCommonEquity ?? null,
          rotePct: route.base === "bank" && ttmStart !== null ? ttmStart.roePct : ctx.rote?.latestRotePct ?? null,
          // The justified-P/TBV cross-check caps its growth rate at the same
          // ceiling the DCF terminal value uses: nothing grows faster than the
          // risk-free rate forever. Null leaves the house terminal-growth cap
          // as the only bound, which the basis string discloses.
          riskFreePct: rf.pct,
          // The same return, year by year — the evidence the terminal
          // excess-return convention reads. A financial route has no ROIC
          // series, so no year has a cost of equity of its own and each is
          // compared with the current one (audit 2026-10-22 B-31).
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
  const noiApprox = ttmInc && ttmInc.operatingIncome !== null && da !== null ? ttmInc.operatingIncome + da : null;
  const reitSubmapReason =
    route.reitSubmap === "undetermined"
      ? (route.gaps.find((g) => g.field === "route.reitSubmap")?.reason ?? null)
      : null;
  const reit: ReitInputs | null =
    route.base === "reit"
      ? {
          ffoApprox,
          affoApprox,
          sharePrice: currentPrice,
          shares: valuationDilutedShares,
          netDebt: netDebtDerived,
          noiApprox,
          // The FFO computation's own period end, never the trailing income
          // date: labelling a fiscal-year FFO with a TTM as-of asserted a
          // freshness the figure does not have.
          asOf: nareitFfo.asOf ?? isoDay(inc0?.date),
          // WS5: print the basis FFO/AFFO were actually built on, and withhold
          // the whole block when the equity-vs-mortgage sub-map is unproven.
          ffoBasis: nareitFfo.ffoBasis,
          affoBasis: nareitFfo.affoBasis,
          ffoApproximate: nareitFfo.ffoApproximate,
          affoApproximate: nareitFfo.affoApproximate,
          submap: route.reitSubmap ?? null,
          submapReason: reitSubmapReason,
          // The HOUSE enterprise value for the implied cap rate: the same
          // senior claims and lease rule the multiples and the DCF bridge use.
          preferredStock: balPoint ? num(balPoint.preferredStock) : null,
          minorityInterest: balPoint ? num(balPoint.minorityInterest) : null,
          operatingLeaseLiability: balPoint ? num(balPoint.operatingLeaseLiability) : null,
          includeLeasesInEv: evIncludeLeases,
        }
      : null;

  const bundleInputs: ValuationBundleInputs = {
    currentPrice,
    waccPct: wacc.waccPct,
    // VAL-10: the DCF gap quotes why the WACC is unavailable.
    waccUnavailableReason: wacc.waccPct !== null ? null
      : (wacc.gaps.find((g) => g.severity === "critical") ?? wacc.gaps.find((g) => g.severity === "warn"))?.reason ?? null,
    // FIN-103: every DCF-bridge operand below reads the bridge row (`bridgePoint`: the
    // statement-date row, else the anchor); `multiples.balance`, `reit` and
    // `excessReturn` keep the anchor (`balPoint`).
    bridgeBalance,
    netDebt: bridgeNetDebtInfo.value,
    dilutedShares: valuationDilutedShares,
    ...(economicDiluted?.shares != null ? { dilutedShareSecurityBasis: "issuer-economic" as const } : {}),
    ...(economicDiluted ? { dilutedShareEconomicBasis: economicDiluted.shares === null ? economicDiluted.reason : economicDiluted.basis } : {}),
    noncontrollingOwnershipUnresolved: noncontrollingOwnershipUnresolvedAt(bridgePoint),
    minorityInterest: bridgePoint ? num(bridgePoint.minorityInterest) : null,
    preferred: bridgePoint ? num(bridgePoint.preferredStock) : null,
    // FIN-119: temporary equity at the bridge date (redeemable preferred and redeemable NCI), folded into the two above by `valueCompany`.
    temporaryEquity: bridgePoint ? temporaryEquityClaims(temporaryEquityOperands(bridgePoint)) : null,
    // The DCF bridge reads the statement-date row and the enterprise values the anchor row, so each is matched on its own date.
    temporaryEquityUnknown: (() => {
      const unknownAt = (row: FmpBalanceSheetRow | null | undefined) => temporaryEquityUnknownAt(row ?? null, row ? isoDay(row.date) : null, bundle.gaps);
      const bridge = unknownAt(bridgePoint), market = unknownAt(balPoint);
      return bridge === null && market === null ? null : { bridge, market };
    })(),
    // Audit 2026-10-22 E-5: the trailing profit key for the DCF's NCI deduction.
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
    ),
    // WS6 (D-19): the DCF equity bridge follows the same lease convention.
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
      const privateStakes = nonMarketableEquityCarrying(bundle.edgar?.companyFacts?.ok ? (bundle.edgar.companyFacts.value.data as CompanyFacts) : null,
        date, ctx.modelCurrency, bundle.builtAt);
      const b = (v: number) => `${(v / 1e9).toFixed(2)}B`;
      return `long-term investments ${b(lti)} on the ${date} ${bridgePointBasis ?? ""} balance sheet${filed ? ` (filed ${filed})` : ""}, at carrying value — the amount the sales-to-capital denominator removes as non-operating` +
        (privateStakes === null ? "" : `; of which non-marketable equity securities ${b(privateStakes.value)} (us-gaap/EquitySecuritiesWithoutReadilyDeterminableFairValueAmount, ${privateStakes.form} filed ${privateStakes.filed}), carried at cost less impairment adjusted for observable price changes`) +
        "; a stake the statements do not break out of other assets stays in operating capital";
    })(),
    // Audit 2026-10-22 E-7: retirement and environmental obligations filed at the bridge's balance date, or in the year before it.
    debtLikeObligations: bridgePoint === null ? null : debtLikeObligationsAt(
      bundle.edgar?.companyFacts?.ok ? (bundle.edgar.companyFacts.value.data as CompanyFacts) : null,
      isoDay(bridgePoint.date), ctx.modelCurrency, bundle.builtAt),
    dcfInputs,
    multiples,
    excessReturn,
    reit,
  };

  void ratiosTtm; // reserved for future ratio cross-checks
  const result = valueCompany(route, bundleInputs);
  result.gaps.push(...estimateGaps);
  for (const history of [historyIncome, historyCashflow]) {
    if (history.gap !== null) result.gaps.push(history.gap);
  }
  // WS5: the FFO computation's own notes and gaps (which tags resolved, which
  // stand-in was used) reach the report on the route that consumes them.
  if (route.base === "reit") {
    result.notes.push(...nareitFfo.notes);
    result.gaps.push(...nareitFfo.gaps);
    result.notes.push(
      `FFO, AFFO and everything derived from them (P/FFO, P/AFFO, the AFFO payout ratio) are measured on the latest ` +
        `FISCAL YEAR${nareitFfo.asOf !== null ? ` ending ${nareitFfo.asOf}` : ""}, not on a trailing twelve months: ` +
        "the NAREIT components resolve as annual XBRL facts, and mixing a fiscal-year net income with trailing " +
        "depreciation would make the figure a hybrid of two periods. The share price in P/FFO is current, so for a " +
        "REIT compounding FFO the multiple is measured against a figure up to three quarters old.",
    );
  }
  // Basis disclosures for the point-in-time anchors chosen above (audit H2/M3).
  if (balanceAnchor.fallback !== null) {
    result.notes.push(balanceAnchor.fallback);
    result.gaps.push({ field: "valuation.balanceAnchor", reason: balanceAnchor.fallback, severity: "info" });
  }
  if (!financialRoute && netDebtInfo.value === null && balPoint !== null) {
    result.notes.push(
      `${netDebtInfo.version}: net debt unavailable — ${netDebtInfo.reason}`,
    );
    // Review m5: only a provider balance has an FMP netDebt field to set aside; a keyless report names none.
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
      `${netDebtInfo.version}: net debt ${netDebtInfo.value} as of ${netDebtInfo.asOf ?? "?"}; totalDebt ${c.totalDebt}, cashAndShortTermInvestments ${c.cashAndShortTermInvestments ?? "derived from cash + shortTermInvestments"}` +
        (netDebtInfo.nonOperatingEquitySecurities !== undefined
          ? `, less marketable equity securities ${netDebtInfo.nonOperatingEquitySecurities} that are not cash (${str(balPoint?.marketableEquityBasis) ?? "filed fair value"})`
          : ""),
    );
  }
  if (excessReturn !== null) {
    result.notes.push(
      `Common-share valuation uses ${route.base === "bank" ? "tangible common equity and ROTE" : "common equity and common-equity ROE"} ` +
        (excessReturn.currentRoeBasis === "ttm-rote" || excessReturn.currentRoeBasis === "ttm-common-roe"
          ? `from the trailing four quarters to ${excessReturn.currentRoeAsOf ?? "unavailable"}, with the book value at that window's end (fiscal-year history to FY ${commonReturns.asOf ?? "unavailable"}); ` +
            "earnings and payout exclude preferred claims. The trailing return and its equity share one dated window; vendor total-equity ROE is not substituted."
          : `from FY ${commonReturns.asOf ?? "unavailable"}; ` +
            "earnings and payout exclude preferred claims. Annual return and opening equity share one dated basis; vendor total-equity ROE is not substituted."),
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
  return result;
}

/**
 * Point-in-time net debt (2026-07-09 audit H2). House convention — matching the
 * multiples-EV and invested-capital definitions — is
 * totalDebt minus cash and short-term investments, resolved from the combined
 * field or both explicitly disclosed components. FMP's vendor `netDebt` nets cash ONLY
 * (the statement-field contract: netDebt = totalDebt − cashAndCashEquivalents),
 * so it is retained only as a diagnostic component and never used as a
 * fallback for the house convention.
 */
function netDebtFromBalance(
  bal: FmpBalanceSheetRow | null | undefined,
): NetDebtResolution {
  return resolveNetDebt({
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
  });
}

/**
 * Payout ratio for the excess-return model (2026-07-09 audit L4):
 * (common dividends + net buybacks) / net income per fiscal year, averaged over
 * the latest 3 annual cash-flow rows with POSITIVE net income, clamped to
 * [0, 100]. FMP signs: commonDividendsPaid / commonStockRepurchased are
 * negative outflows, commonStockIssuance a positive inflow (net buybacks =
 * |repurchases| − issuance). Years reporting neither dividends nor buybacks are
 * unusable (missing ≠ zero); fewer than 2 usable years returns null so the
 * excess-return valuation is suppressed rather than assigned a house payout.
 */
/**
 * Newest liquidity anchor for the runway model.
 *
 * Preferring the quarterly row unconditionally anchored runway on stale cash
 * whenever the latest annual row was newer — the ordinary case once the 10-K is
 * filed but the matching quarter is not yet published, or when quarterly
 * coverage lags. Runway must measure the most recent balance actually known, so
 * pick by date and fall back to whichever row exists.
 */
/** The balance fields the valuation anchors read: net debt, invested capital and the EV bridge. */
const BALANCE_ANCHOR_FIELDS = ["totalDebt", "totalStockholdersEquity", "cashAndShortTermInvestments"] as const;

/**
 * A balance row the parser refused an anchor operand of, or whose equity is
 * consolidated with no parent split. Such a refusal is not cured by moving to
 * another date (`pickBalanceAnchor`, `dcfBridgeRow`).
 */
const REFUSABLE_ANCHOR_FIELDS = ["totalDebt", "netDebt", "cashAndCashEquivalents", "cashAndShortTermInvestments", "totalStockholdersEquity", "totalEquity"] as const;
function balanceRowRefused(row: object): boolean {
  const conflicts = (row as FmpBalanceSheetRow).fieldConflicts;
  const refusedAnchor = REFUSABLE_ANCHOR_FIELDS.some(field => conflicts?.[field]?.usable === false);
  return refusedAnchor || statementEquityOwnershipBasis(row as FmpBalanceSheetRow) === "consolidated";
}

/** The anchor operands a balance row lacks (empty means the row is whole). One completeness rule for both anchors. */
function balanceRowMissing(row: object): string[] {
  const r = row as Record<string, unknown>;
  return BALANCE_ANCHOR_FIELDS.filter((field) => !(typeof r[field] === "number" && Number.isFinite(r[field] as number)));
}
function balanceRowWhole(row: object): boolean {
  return balanceRowMissing(row).length === 0;
}

/**
 * The ownership test the DCF's NCI gate applies (`noncontrollingOwnershipUnresolved`):
 * no book NCI, and consolidated equity that has no parent split or differs from
 * parent equity. One test for the gate and for the bridge row choice.
 */
function noncontrollingOwnershipUnresolvedAt(row: FmpBalanceSheetRow | null): boolean {
  return row !== null && num(row.minorityInterest) === null &&
    (statementEquityOwnershipBasis(row) === "consolidated" ||
      (num(row.totalEquity) !== null && num(row.totalStockholdersEquity) !== null &&
        Math.abs((num(row.totalEquity) as number) - (num(row.totalStockholdersEquity) as number)) >
          1e-9 * Math.max(1, Math.abs(num(row.totalEquity) as number), Math.abs(num(row.totalStockholdersEquity) as number))));
}
/** Why the DCF bridge cannot be built on this row (the refusal test, or the gate's ownership test); null when it can. */
function balanceRowBlockReason(row: object): string | null {
  // The refusal test lives once, in `balanceRowRefused`; this only words it.
  if (balanceRowRefused(row)) {
    const refused = REFUSABLE_ANCHOR_FIELDS.find(field => (row as FmpBalanceSheetRow).fieldConflicts?.[field]?.usable === false);
    if (refused === undefined) return "consolidated equity with no filed parent/NCI split";
    const why = (row as FmpBalanceSheetRow).fieldConflicts?.[refused]?.reason;
    return `${refused} refused${why ? `: ${why}` : ""}`;
  }
  if (noncontrollingOwnershipUnresolvedAt(row as FmpBalanceSheetRow)) return "noncontrolling ownership unresolved";
  return null;
}
function balanceRowBlocksBridge(row: object): boolean {
  return balanceRowBlockReason(row) !== null;
}

export interface BalanceAnchor<TRow> {
  row: TRow | null;
  basis: "quarter" | "annual" | undefined;
  /** Why the newest row was passed over, when it was; null otherwise. */
  fallback: string | null;
}

/**
 * The valuation's point-in-time balance row: the NEWER of the latest quarterly
 * and annual whole rows (audit H2/M3/M4 — fields are never mixed across
 * periods), unless that newer row lacks one of the fields the anchors read
 * while the older row carries all three. Caterpillar's 10-Q balance sheet
 * tags no us-gaap debt line at all (its 10-K carries the debt through the
 * maturity schedule), so the newest row had equity and cash but no
 * totalDebt, invested capital was undefined and the DCF, net debt and EV
 * multiples were suppressed while a complete fiscal-year row sat one period
 * back. A stale-but-whole row is the disclosed compromise: the fallback is a
 * valuation note and an info gap. When no row is whole the newest stands.
 */
export function pickBalanceAnchor<TRow extends { date?: unknown } & Partial<Record<(typeof BALANCE_ANCHOR_FIELDS)[number], unknown>>>(
  quarterlyRow: TRow | null | undefined,
  annualRow: TRow | null | undefined,
): BalanceAnchor<TRow> {
  const quarterly = quarterlyRow ?? null;
  const annual = annualRow ?? null;
  const date = (r: TRow | null): string => (typeof r?.date === "string" ? r.date : "");
  const missing = (r: TRow): string[] => balanceRowMissing(r);
  const newer: TRow | null = quarterly !== null && (annual === null || date(quarterly) >= date(annual)) ? quarterly : annual;
  const older: TRow | null = newer === quarterly ? annual : quarterly;
  if (newer === null) return { row: null, basis: undefined, fallback: null };
  const basisOf = (r: TRow): "quarter" | "annual" => (r === quarterly ? "quarter" : "annual");
  // Missing coverage may justify a disclosed older whole row. A known
  // integrity or ownership refusal cannot be cured by changing the date:
  // doing so would restore EV/DCF inputs that the current filing withholds.
  if (balanceRowRefused(newer)) return { row: newer, basis: basisOf(newer), fallback: null };
  const lacking = missing(newer);
  if (older !== null && lacking.length > 0 && missing(older).length === 0) {
    const list = lacking.length === 1 ? lacking[0] : `${lacking.slice(0, -1).join(", ")} and ${lacking[lacking.length - 1]}`;
    return {
      row: older,
      basis: basisOf(older),
      fallback:
        `balance anchor: the newest balance row (${basisOf(newer)} ${date(newer)}) lacks ${list}, so net debt, invested capital and ` +
        `the EV bridge use the ${basisOf(older)} row as of ${date(older)}, the newest row carrying totalDebt, totalStockholdersEquity ` +
        `and cashAndShortTermInvestments`,
    };
  }
  return { row: newer, basis: basisOf(newer), fallback: null };
}

export type BridgeRowCause = "statement-row" | "none-filed" | "incomplete" | "statement-row-refused" | "anchor-refused";

/**
 * FIN-103: the balance row the DCF equity bridge reads. D-65 promises "the
 * equity bridge stays at the statement-date balance", but the market EV's
 * anchor (`pickBalanceAnchor`: the newest row, or the newest whole one when the
 * newest lacks an operand) ignores the DCF's income basis, so a DCF that fell
 * back to the fiscal-year statement bridged on a newer quarter.
 *
 * Candidates are the rows dated at the statement date, in the order the
 * statement's basis calls for: the fiscal-year row first on an annual base, the
 * quarter row first on a trailing-twelve-month base (at a fiscal-year end both
 * are the same instant). The first candidate that is whole (`balanceRowWhole`,
 * the anchor's completeness rule, so a 10-Q that tags no debt line cannot
 * suppress the DCF again) and not blocked (`balanceRowBlocksBridge`) is the
 * row. Otherwise the anchor stands, which is main's row and main's figure, and
 * `cause` says why. A blocked anchor always stands: its refusal is never cured
 * by another date.
 */
export function dcfBridgeRow<TRow extends { date?: unknown } & Partial<Record<(typeof BALANCE_ANCHOR_FIELDS)[number], unknown>>>(
  statementDate: string | null,
  statementBasis: "annual" | "ttm" | null,
  quarterly: readonly TRow[],
  annual: readonly TRow[],
  fallback: { row: TRow | null; basis: "quarter" | "annual" | null },
): { row: TRow | null; basis: "quarter" | "annual" | null; matchesStatement: boolean; cause: BridgeRowCause; detail: string | null } {
  const anchorAt = fallback.row !== null && statementDate !== null && isoDay(fallback.row.date) === statementDate;
  const keep = (cause: BridgeRowCause, detail: string | null) =>
    ({ row: fallback.row, basis: fallback.basis, matchesStatement: anchorAt, cause, detail });
  if (fallback.row !== null && balanceRowBlocksBridge(fallback.row)) return keep("anchor-refused", balanceRowBlockReason(fallback.row));
  if (statementDate === null) return keep("none-filed", null);
  const q = quarterly.map((row) => ({ row, basis: "quarter" as const }));
  const a = annual.map((row) => ({ row, basis: "annual" as const }));
  const candidates = (statementBasis === "annual" ? [...a, ...q] : [...q, ...a]).filter((c) => isoDay(c.row.date) === statementDate);
  const hit = candidates.find((c) => balanceRowWhole(c.row) && !balanceRowBlocksBridge(c.row));
  if (hit !== undefined) return { row: hit.row, basis: hit.basis, matchesStatement: true, cause: "statement-row", detail: null };
  const blocked = candidates.find((c) => balanceRowBlocksBridge(c.row));
  if (blocked !== undefined) return keep("statement-row-refused", balanceRowBlockReason(blocked.row));
  const incomplete = candidates[0];
  if (incomplete !== undefined) return keep("incomplete", balanceRowMissing(incomplete.row).join(", "));
  return keep("none-filed", null);
}

/**
 * The runway divides liquidity by an AVERAGE of quarterly burn: a sum across
 * quarters, set against a balance. The average is a figure only when its
 * quarters are established in one currency, and the ratio only when the
 * liquidity row is in that currency too. No FX is applied: an unestablished
 * burn is withheld with the ratio; a burn and a liquidity in different (or
 * unestablished) currencies keep their own values and lose only the ratio.
 */
function gateRunwayCurrency(
  runway: RunwayResult,
  liquidityRow: CurrencyEvidenceRow,
  cashflowQuarterly: readonly FmpCashFlowRow[],
  evidence: readonly CurrencyEvidenceRow[],
): RunwayResult {
  // An explicitly refused recent investment scope cannot be evaded by
  // dropping that quarter and averaging older, narrower cash-spending rows.
  const refusedInvestment = cashflowQuarterly.slice(0, 4).find(row =>
    ["capitalExpenditure", "investmentsInPropertyPlantAndEquipment"].some(field => row.fieldConflicts?.[field]?.usable === false));
  if (refusedInvestment) return { ...runway, burning: null, avgQuarterlyBurn: null, runwayQuarters: null, estimatedExhaustionDate: null,
    notes: [...runway.notes, `Cash investment scope unresolved for recent quarter ${refusedInvestment.date}; older quarters cannot substitute for the refused scope.`],
    gaps: [...runway.gaps, { field: "runway.cashInvestmentScope", severity: "warn", reason: `Runway withheld: recent-quarter cash investment scope at ${refusedInvestment.date} is unresolved; no older-quarter burn extrapolation is substituted.` }] };
  const burnRows = runway.burnWindowDates.flatMap((date) => cashflowQuarterly.filter((r) => isoDay(r.date) === isoDay(date)));
  const burnCurrency =
    burnRows.length === runway.burnWindowDates.length ? establishedRowsCurrency(burnRows, evidence) : null;
  const liquidityCurrency = establishedRowsCurrency([liquidityRow], evidence);
  if (runway.avgQuarterlyBurn === null && runway.runwayQuarters === null) return runway;
  const withheld = { runwayQuarters: null, estimatedExhaustionDate: null };
  if (burnCurrency === null && runway.burnWindowDates.length > 0) {
    return {
      ...runway,
      ...withheld,
      avgQuarterlyBurn: null,
      gaps: [
        ...runway.gaps,
        {
          field: "runway.currency",
          reason:
            `the burn quarters (${runway.burnWindowDates.join(", ")}) are not established in one currency — an average ` +
            "across them is no figure, so the average burn, the runway and the exhaustion date are withheld",
          severity: "warn",
          attemptedSources: ["fmp:/stable/cash-flow-statement?period=quarter"],
        },
      ],
    };
  }
  if (runway.runwayQuarters !== null && liquidityCurrency !== burnCurrency) {
    return {
      ...runway,
      ...withheld,
      gaps: [
        ...runway.gaps,
        {
          field: "runway.currency",
          reason:
            `liquidity is ${liquidityCurrency === null ? "not established in a currency" : `in ${liquidityCurrency}`} but the ` +
            `burn is in ${burnCurrency} — no FX conversion is attempted, so the runway and the exhaustion date are withheld`,
          severity: "warn",
          attemptedSources: ["fmp:/stable/balance-sheet-statement", "fmp:/stable/cash-flow-statement?period=quarter"],
        },
      ],
    };
  }
  return runway;
}

export function newestBalanceRow<TRow extends { date?: unknown }>(
  quarterly: TRow | undefined,
  annual: TRow | undefined,
): TRow | undefined {
  if (quarterly === undefined) return annual;
  if (annual === undefined) return quarterly;
  const q = typeof quarterly.date === "string" ? quarterly.date : "";
  const a = typeof annual.date === "string" ? annual.date : "";
  // Ties keep the quarterly row: same period end, but quarterly is the
  // finer-grained statement the rest of the runway model is built from.
  return a > q ? annual : quarterly;
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
      operatingIncome: num(i.operatingIncome),
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
      minorityInterest: bal ? num(bal.minorityInterest) : null,
      // FIN-119: each quarter's own redeemable claims, so the own-history EV and the P/FCF guard read them.
      ...(bal ? temporaryEquityOperands(bal) : {}),
      // WS6 review (BLOCKER 2): the lease slice too, so a lease-adjusted current
      // EV is ranked against a lease-adjusted history.
      operatingLeaseLiability: bal ? num(bal.operatingLeaseLiability) : null,
    };
  });
}

function matchByDate<T>(byDate: Map<string, T>, iso: string): T | null {
  const exact = byDate.get(iso);
  if (exact !== undefined) return exact;
  // Tolerate small fiscal-date drift across statements (±5 days).
  const target = Date.parse(iso);
  if (!Number.isFinite(target)) return null;
  let best: T | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const [k, v] of byDate) {
    const t = Date.parse(k);
    if (!Number.isFinite(t)) continue;
    const delta = Math.abs(t - target) / SPREAD_DAYS;
    if (delta < bestDelta) {
      bestDelta = delta;
      best = v;
    }
  }
  return bestDelta <= 5 ? best : null;
}

// Re-export sourcedOf for the page layer's provenance stamping.
export { sourcedOf, rowsOf, valueOf };
