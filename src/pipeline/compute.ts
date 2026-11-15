import { admittedSbc } from "@/pipeline/stageB/financialValues";
import { MODEL_TANGIBLE_COMMON_BASIS } from "@/pipeline/stageB/returns";
import { withReleaseQuarterEarnings } from "./releaseQuarterEarnings";
import { statementEvidenceEntries, withAssessmentQualification, financialEvidenceQualifications } from "@/report/assessment";
import { resolveForeignValuation, translateProjectionInputs, type ForeignValuationBasis } from "@/pipeline/foreignCurrency";
import { derivedMarketCapShareDate, isDerivedMarketCapRow } from "@/pipeline/keyless";
import { quotePriceObservationDay } from "@/providers/fmp";
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
import { describeFinancialValuation } from "@/pipeline/stageB/valuationAssumptions";
import { buildFilingDisclosures, newerPeriodicFiling, newerResultsRelease } from "@/pipeline/filingDisclosures";
import { newerFilingSentence, newerResultsSentence } from "@/report/filingDisclosurePresentation";
import { withRetiredGapWording } from "@/report/retiredReaderWording";
import type { ManifestEntry } from "@/types/core";
import type { DataBundle } from "@/pipeline/types";
import { balanceIntegrityView } from "@/pipeline/balanceIntegrity";
import { operatingIncomeForNonMargins, operatingMarginBasis, withFiledIncomeWindow, withIncomeOperatingBasis } from "@/pipeline/incomeBasis";
import { quotedShareUnit, withFilerShareUnits } from "@/pipeline/shareUnits";
import { filedSingleProfitWindow } from "@/pipeline/nciEarnings";
import { withCashFlowSbcBasis } from "@/pipeline/cashFlowBasis";
import { withBorrowingCostBasis } from "@/pipeline/borrowingCostBasis";
import type {
  FmpBalanceSheetRow,
  FmpCashFlowRow,
  FmpIncomeStatementRow,
  FmpRawRow,
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
  type FinancialMetricsResult,
} from "@/pipeline/stageB/financialMetrics";
import {
  computeGrowth,
  rejectedAnnualCadenceRows,
  type GrowthResult,
  withoutTransitionPeriods,
} from "@/pipeline/stageB/growth";
import {
  waccDisclosure,
} from "@/pipeline/stageB/returns";
import {
  computeCapital,
  type CapitalResult,
  type MarketCapPoint,
  type QuoteInput,
} from "@/pipeline/stageB/capital";
import { withPrimaryCapitalBasis, primaryRepurchaseExecutions } from "@/pipeline/primaryCapitalBasis";
import {
  runForensics,
  FORENSIC_PERIOD_ALIGNMENT_TOLERANCE_DAYS,
  type ForensicsReport,
} from "@/pipeline/stageB/forensics";
import {
  computeTechnicals,
  type TechnicalsResult,
} from "@/pipeline/stageB/technicals";
import {
  type ValuationResult,
} from "@/pipeline/stageB/valuation";
import { computeScores } from "@/pipeline/stageB/grading";
import { computeProjections, interestRunRate, type ProjectionIncomeRow } from "@/pipeline/stageB/projections";
import { computeScenarioTargets } from "@/pipeline/stageB/scenarioTargets";
import { computeFairValue, degradedInputsReason, withDegradedInputs } from "@/pipeline/stageB/fairValue";
import { temporaryEquityClaims, temporaryEquityOperands } from "@/pipeline/stageB/seniorClaims";
import { deferredIncomeTaxesAt, utilityCreditMetrics } from "@/pipeline/stageB/utilityCredit";
import { marketableEquityInCash } from "@/pipeline/stageB/marketableEquity";
import { retainedCommonClassAmbiguity } from "@/pipeline/stageB/commonClassScope";
import { retainedClassEconomicEvidence } from "@/edgar/retainedClassEconomics";
import { applyLenderCapitalApplicability, lenderCashFlowApplicability } from "@/pipeline/stageB/lenderCashFlow";
import { leaseEvidenceContextFor, restoreLeaseFinancingProvenance } from "@/pipeline/stageB/leaseScope";
import { resolveEconomicEquityScope } from "@/pipeline/stageB/securityBasis";
import { CORE_FACT_FORMS, tagPoints, type CompanyFacts } from "@/edgar/xbrl";
import { attachCurrentCapital } from "@/pipeline/stageB/currentCapital";
import { filedCfoTtm, filedCashFlowTtm, filedCapexTtm } from "@/edgar/financialEnrichment";
import { vendorAgreesWithDerived, vendorAgreesWithFiled } from "@/edgar/vendorAgreement";
import { admitVendorLongTermInvestments, balanceAdmissionEntries, type BalanceAdmission } from "@/edgar/financialEnrichment";
import { debtFamilyAdmission, type DebtFamilyStatement } from "@/pipeline/admission/debtFamily";
import { withComputationContext } from "@/edgar/computationContext";
import { buildStatementsFromCompanyFacts, longTermDebtHoldsCurrent, longTermDebtHoldsFinanceLeases } from "@/edgar/statements";
import { collapsedDebtReason, implausibleDebtReason, uncashedDebtCollapseReason } from "@/edgar/debtCompleteness";
import { filedReceivablesCandidates } from "@/edgar/receivables";
import { statementIssuerFacts, admittedIssuerFacts, confirmedIssuerFacts } from "@/edgar/issuerFacts";
import { supplementCommonEarnings } from "@/pipeline/commonEarnings";
import { resolvePreferredCapital } from "@/pipeline/stageB/excessReturnBook";
import { materialOperatingDispositions, type OperatingDispositionRead } from "@/pipeline/stageB/unusualItems";
import {
  normalizeQuarterRows,
  type FiscalDatedRow,
} from "@/pipeline/stageB/quarterWindows";
import {
  classifyInstrumentSupport,
  UnsupportedInstrumentError,
} from "@/pipeline/stageB/instrumentSupport";
// WS6 (D-19): METIS_EV_INCLUDE_LEASES.
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
import { type ReturnsBlock, bookDebtOnLeaseBasis, computeReturns, riskFreeObservations, riskFreePct } from "./returnsBlock";
import { SPREAD_DAYS, firstRow, isoDay, num, rowsOf, sourcedOf, str, valueOf } from "./bundleRows";
import { commonFlowScope, filedCoverageOperands, fiscalIdentity, preferredClaimsInFlow, toCapitalBalance, toCapitalCashFlow, toCapitalIncome, toForensicsBalance, toForensicsCashFlow, toForensicsIncome, toGrowthCashFlow, toGrowthIncome, toOhlcv, withFiledForensicContext } from "./stageBAdapters";
import { cashFlowQuarterWindowAdmitted, disclosedProjectionInterest, incomePeriod, normalizeStatementQuarters, rejectedAffectsCurrentWindow, resolveStatementCurrencies, ttmCashFlowFromNormalized, ttmIncomeFromNormalized } from "./ttmSynthesis";
import { type CurrencyEvidenceRow, STATEMENT_FAMILY, establishedCurrencyOn, establishedRowsCurrency, rowsInModelCurrency, sameFiling } from "./statementCurrency";
import { taxRatePretaxOperand } from "./taxEvidence";
import { computeValuation, incomeDivisors } from "./valuationBlock";
import { newestBalanceRow } from "./balanceAnchor";

export { selectUsEquityRiskPremium, selectEquityRiskPremium } from "./equityRiskPremium";
export { filedTaxOperands } from "./stageBAdapters";
export { type CurrencyEvidenceRow, statementCurrencyEvidence, establishedCurrencyOn } from "./statementCurrency";
export { taxRatePretaxOperand, effectiveTaxRateFromTtm, type WaccStatementTaxRate, waccTaxRateFromStatements } from "./taxEvidence";
export { type TtmIncome, ttmIncome, ttmCashFlow, type StatementCurrencies, statementCurrencies } from "./ttmSynthesis";
export { type ReturnsBlock, riskFreePct, priorYearCostOfDebt } from "./returnsBlock";
export { type BalanceAnchor, pickBalanceAnchor, type BridgeRowCause, dcfBridgeRow, newestBalanceRow } from "./balanceAnchor";
export { dcfGuidance, isUnprofitableOverlayGap, isUnprofitableOverlaySuppression, fiscalCashDividendPayout, payoutRatioPct3y } from "./valuationBlock";

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
  /** Derived FX/security basis; raw filed statements retain their reporting currency. */
  valuationTranslation?: ForeignValuationBasis;
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

export interface SuppressedMetric {
  key: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// runStageB
// ---------------------------------------------------------------------------

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

/** N2: classify a proved fair-value servicing financial asset, never infer an absent intangible. */
function withTangibleBookClassification(row: FmpBalanceSheetRow, bundle: DataBundle, facts: CompanyFacts | null): FmpBalanceSheetRow {
  const date = isoDay(row.date), currency = str(row.reportedCurrency), vendor = num(row.intangibleAssets);
  const registrant = bundle.edgar.registrant;
  if (!date || !currency || vendor === null || vendor <= 0 || num(row.goodwill) !== 0 || !registrant || !/^\d{10}$/.test(registrant.cik10) ||
    Number(firstRow(bundle.profile)?.cik) !== Number(registrant.cik10) ||
    (row.cik != null && Number(row.cik) !== Number(registrant.cik10))) return row;
  const intangibleTags = [...tagsFor("goodwill"), ...tagsFor("intangibleAssets"), ...tagsFor("intangibleAssetsParts"), "GoodwillAndIntangibleAssetsNet"];
  if (facts && intangibleTags.some(tag => tagPoints(facts, tag, currency)?.points.some(p => p.end === date && !p.start && p.filed <= bundle.builtAt.slice(0, 10)))) return row;
  if (["goodwill", "intangibleAssets"].some(field => row.fieldProvenance?.[field]?.source === "edgar" || row.fieldConflicts?.[field]?.usable === false)) return row;
  const source = [bundle.edgar.tenQNotes, bundle.edgar.tenKNotes].flatMap(s => s?.ok ? [s.value.data] : []).find(d =>
    d.reportDate === date && /^(?:10-Q|10-K)(?:\/A)?$/.test(d.form) && /^\d{4}-\d{2}-\d{2}$/.test(d.filingDate) &&
    d.reportDate <= d.filingDate && d.filingDate <= bundle.builtAt.slice(0, 10) && /^\d{10}-\d{2}-\d{6}$/.test(d.accession));
  if (!source) return row;
  try {
    const url = new URL(source.documentUrl);
    if (url.protocol !== "https:" || !["www.sec.gov", "sec.gov"].includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash ||
      !new RegExp(`^/Archives/edgar/data/${Number(registrant.cik10)}/${source.accession.replaceAll("-", "")}/[a-zA-Z0-9_.-]+\\.html?$`).test(url.pathname)) return row;
  } catch { return row; }
  const sheet = (source.statementsText ?? "").split(/\bBALANCE SHEETS?\b/i)[1]?.split(/\b(?:CONSOLIDATED )?STATEMENTS OF\b/i)[0] ?? "";
  if (/\b(?:goodwill|intangible assets?)\b/i.test(sheet)) return row;
  const scale = /\bin thousands\b/i.test(sheet) ? 1000 : /\bin millions\b/i.test(sheet) ? 1_000_000 : null;
  const servicing = /\b(?:loan |mortgage )?servicing assets?, at fair value\s*\$?\s*([\d,]+(?:\.\d+)?)/i.exec(sheet);
  if (!scale || !servicing) return row;
  const amount = Number(servicing[1]!.replaceAll(",", "")) * scale;
  const filedServicing = facts ? tagPoints(facts, "ServicingAssetAtFairValueAmount", currency) : null;
  const filedCurrency = filedServicing?.unit === currency && filedServicing.points.some(p => p.end === date && !p.start && p.filed <= bundle.builtAt.slice(0, 10) && Math.abs(p.val - amount) <= scale / 2);
  const explicitCurrency = currency === "USD" && /\b(?:U\.S\.|US) dollars\b/i.test(sheet);
  if ((!filedCurrency && !explicitCurrency) || /\b(?:euros|pounds sterling|Canadian dollars)\b/i.test(sheet) || Math.abs(vendor - amount) > scale / 2) return row;
  return { ...row, intangibleAssets: 0,
    tangibleBookDeductionBasis: `Filed servicing asset ${amount} ${currency} at fair value (${date}), not deducted: it is a financial asset, not goodwill or other intangible assets. No goodwill or intangible-asset fact is carried on this filed balance sheet; vendor intangibleAssets ${vendor} ties to that servicing asset. Source: ${source.documentUrl}.` };
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
    const leases = num(row.capitalLeaseObligations), total = num(row.totalDebt);
    const current = num(row.shortTermDebt), noncurrent = num(row.longTermDebt);
    // An unclassified vendor lease line may be interest-bearing (notably
    // under IFRS). Removing all of it silently treats it as operating leases
    // and can manufacture an implausible interest rate. Retain the reconciled
    // total unless the lease split actually identifies the operating portion.
    if (leases !== null && leases > 0 && num(row.operatingLeaseLiability) === null && num(row.financeLeaseLiability) === null &&
        current !== null && noncurrent !== null && total !== null &&
        Math.abs(total - current - noncurrent - leases) <= Math.max(1, Math.abs(total) * 1e-6)) return total;
    // Long-term debt tagged with its finance leases already holds them.
    const financeLeases = row.fieldProvenance?.longTermDebt?.calculation !== "same-filing-debt-completed" && longTermDebtHoldsFinanceLeases(row.fieldProvenance?.longTermDebt?.tags) ? null : num(row.financeLeaseLiability);
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
    const earlierRows = new Map<string, FmpBalanceSheetRow>();
    for (const other of [...rows, ...interim]) {
      const day = isoDay(other.date);
      const debt = day !== null && day < date && Date.parse(day) >= yearStart ? financingDebt(other) : null;
      if (debt !== null && !earlier.has(day!)) { earlier.set(day!, debt); earlierRows.set(day!, other); }
    }
    const opening = [...earlier.entries()].sort(([a], [b]) => b.localeCompare(a));
    const interest = interestFor(date);
    const previous = opening[0];
    const previousRow = previous === undefined ? undefined : earlierRows.get(previous[0]);
    const equity = (balance: FmpBalanceSheetRow | undefined): number | null =>
      balance === undefined ? null : num(balance.totalStockholdersEquity) ?? num(balance.totalEquity);
    const collapse = previous === undefined ? null : { annualInterestExpense: interest, financingDebt: closing, previousFinancingDebt: previous[1],
      previousDate: previous[0], netDebtIssuance: cashFlow("netDebtIssuance", previous[0], date), debtRepayment: cashFlow("debtRepayment", previous[0], date),
      totalAssets: num(row.totalAssets), totalLiabilities: num(row.totalLiabilities), previousTotalLiabilities: num(previousRow?.totalLiabilities),
      equity: equity(row), previousEquity: equity(previousRow) };
    // D-174: without usable interest, a collapse the span's debt cash flow does not explain.
    const reason = implausibleDebtReason({ annualInterestExpense: interest, financingDebt: closing,
      priorFinancingDebts: opening.map(([, debt]) => debt), totalAssets: num(row.totalAssets) }) ??
      (collapse === null ? null : collapsedDebtReason(collapse) ?? uncashedDebtCollapseReason(collapse));
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

function preferredCapitalView(bundle: DataBundle): DataBundle {
  const acquired = bundle.edgar?.companyFacts;
  const facts = acquired?.ok && Number.isFinite(Date.parse(acquired.value.fetchedAt)) && Date.parse(acquired.value.fetchedAt) <= Date.parse(bundle.builtAt)
    ? confirmedIssuerFacts(bundle.symbol, bundle.edgar) : null;
  const gaps = [...bundle.gaps];
  const cash = [bundle.statements.cashflowAnnual, bundle.statements.cashflowQuarterly].flatMap(f => f.ok &&
    Number.isFinite(Date.parse(f.value.fetchedAt)) && Date.parse(f.value.fetchedAt) <= Date.parse(bundle.builtAt) ? f.value.data.rows : []);
  const normalize = (input: DataBundle["statements"]["balanceAnnual"]) => !input.ok ? input : { ...input,
    value: { ...input.value, data: { ...input.value.data, rows: input.value.data.rows.map(row => {
      const preferredCash = cash.filter(cf => {
        const proof = cf.fieldProvenance?.preferredDividendsPaid;
        return cf.date === row.date && cf.reportedCurrency === row.reportedCurrency &&
          (!row.cik || !cf.cik || Number(row.cik) === Number(cf.cik)) && cf.fieldConflicts?.preferredDividendsPaid?.usable !== false &&
          proof?.source === "edgar" && proof.periodEnd === row.date && proof.unit === row.reportedCurrency &&
          proof.tags.includes("us-gaap/PaymentsOfDividendsPreferredStockAndPreferenceStock") &&
          Number.isFinite(Date.parse(proof.observedAt)) && Date.parse(proof.observedAt) <= Date.parse(bundle.builtAt) &&
          proof.filings.length > 0 && proof.filings.every(f => CORE_FACT_FORMS.has(f.form) && f.filed >= String(row.date) && f.filed <= bundle.builtAt.slice(0,10));
      })
        .map(cf => num(cf.preferredDividendsPaid)).filter((v): v is number => v !== null).map(Math.abs);
      const evidenceRow = preferredCash.some(v => v > 0) ? { ...row, preferredDividendsPaid: Math.max(...preferredCash) } : row;
      const resolved = resolvePreferredCapital(evidenceRow, facts, bundle.builtAt);
      const selected = resolved === evidenceRow ? row : resolved;
      if (selected !== row) gaps.push({ field: `statements.balance.${row.date}.preferredCapital`,
        reason: selected.preferredCapitalWithheldReason ?? selected.preferredCapitalBasis!, severity: selected.preferredCapitalWithheldReason ? "warn" : "info" });
      return selected;
    }) } } };
  const balanceAnnual = normalize(bundle.statements.balanceAnnual), balanceQuarterly = normalize(bundle.statements.balanceQuarterly);
  return { ...bundle, statements: { ...bundle.statements, balanceAnnual, balanceQuarterly }, gaps };
}

/**
 * D-251 (P5): calculation view. A fiscal year in which preferred claims existed
 * has its filed common earnings read even when the preferred was redeemed
 * before the year's end. The existence test is the one `toReturnsIncome` hands
 * the earnings selector (`preferredClaimsInFlow` over the same balances and
 * cash rows), so the year the selector refuses is the year the filed figure is
 * read for. Stored bundles are unchanged; the rule lives in
 * `supplementCommonEarnings`.
 */
function filedCommonEarningsView(bundle: DataBundle): DataBundle {
  const admitted = admittedIssuerFacts(bundle.symbol, bundle.edgar);
  if (!admitted?.ok || !Number.isFinite(Date.parse(admitted.value.fetchedAt)) || Date.parse(admitted.value.fetchedAt) > Date.parse(bundle.builtAt)) return bundle;
  const facts = admitted.value.data;
  const balances = [...rowsOf(bundle.statements.balanceAnnual), ...rowsOf(bundle.statements.balanceQuarterly)];
  const cash = [...rowsOf(bundle.statements.cashflowAnnual), ...rowsOf(bundle.statements.cashflowQuarterly)];
  const input = bundle.statements.incomeAnnual;
  if (!input.ok) return bundle;
  const gaps: ManifestEntry[] = [];
  const rows = input.value.data.rows.map(row => {
    const rowFacts = statementIssuerFacts(bundle.symbol, bundle.edgar, row.cik, bundle.builtAt) ?? facts;
    const supplemented = supplementCommonEarnings({ ...input, value: { ...input.value, data: { ...input.value.data, rows: [row] } } },
      bundle.statements.balanceAnnual, rowFacts, bundle.builtAt.slice(0, 10), rowFacts === facts ? admitted.value.fetchedAt : bundle.edgar.predecessor!.fetchedAt,
      candidate => (candidate.cik == null || Number(candidate.cik) === rowFacts.cik) && preferredClaimsInFlow(commonFlowScope(candidate, "netIncome", "annual"), balances, cash));
    gaps.push(...supplemented.gaps);
    return supplemented.income.ok ? supplemented.income.value.data.rows[0]! : row;
  });
  return gaps.length === 0 ? bundle : { ...bundle, statements: { ...bundle.statements,
    incomeAnnual: { ...input, value: { ...input.value, data: { ...input.value.data, rows } } } }, gaps: [...bundle.gaps, ...gaps] };
}

/** D-198: one calculation view; the acquired statements and immutable reports retain their filed values. */
export function operatingDispositionView(bundle: DataBundle): { bundle: DataBundle; read: OperatingDispositionRead } {
  const facts = confirmedIssuerFacts(bundle.symbol, bundle.edgar);
  const annual = rowsOf(bundle.statements.incomeAnnual);
  const quarters = normalizeStatementQuarters(rowsOf(bundle.statements.incomeQuarterly), "income", undefined, bundle.statements.incomeQuarterly);
  const trailing = withFiledIncomeWindow(bundle, ttmIncomeFromNormalized(quarters, undefined,
    [...rowsOf(bundle.statements.balanceQuarterly), ...rowsOf(bundle.statements.cashflowQuarterly)], bundle.builtAt), quarters.rows, []);
  const seed = trailing?.revenue != null ? trailing : annual[0];
  const end = isoDay(seed?.date), currency = normalizeReportedCurrency(seed?.reportedCurrency);
  const sections = [bundle.edgar?.tenKNotes, bundle.edgar?.tenQNotes].flatMap(s => s?.ok && s.value.source === "edgar" &&
    Number.isFinite(Date.parse(s.value.fetchedAt)) && Date.parse(s.value.fetchedAt) <= Date.parse(bundle.builtAt) ? [s.value.data] : []);
  const read = materialOperatingDispositions(facts, { ttmEnd: end ?? "", fiscalYearEnd: annual.map(r => isoDay(r.date)).find(d => d !== null && end !== null && d <= end) ?? null,
    unit: currency, observedAt: bundle.builtAt, periodStart: seed === trailing ? trailing?.periodStart : annual[0] ? incomePeriod(annual[0], annual[1], "annual").periodStart : null,
    operatingIncome: operatingIncomeForNonMargins(seed), sections });
  if (!read.events.length) return { bundle, read };
  const reason = `${read.basis}. Operating income excludes this completed sale in every affected annual and quarterly calculation. ` +
    "Recurring net earnings, EPS and the tax pair are withheld for those periods because the sale's tax and common-holder allocation are not separately established; filed observations remain in the source bundle.";
  const normalize = (input: DataBundle["statements"]["incomeAnnual"], basis: "annual" | "quarter") => {
    if (!input.ok) return input;
    const rows = normalizeQuarterRows(input.value.data.rows).rows;
    return { ...input, value: { ...input.value, data: { ...input.value.data, rows: input.value.data.rows.map(row => {
      if (normalizeReportedCurrency(row.reportedCurrency) !== currency) return row;
      const index = rows.findIndex(r => r === row);
      const period = incomePeriod(row, rows[index + 1], basis);
      const rowEnd = String(row.date);
      // Without a start, a period that could hold the sale cannot be shown to exclude it.
      // Withhold its operating figures rather than silently leaving the gain inside them.
      if (!period.periodStart) {
        const longestPeriodDays = basis === "annual" ? 372 : 100;
        const earliest = Date.parse(rowEnd) - longestPeriodDays * 86_400_000;
        if (!read.events.some(e => e.date <= rowEnd && Date.parse(e.date) > earliest)) return row;
        const undated = `${read.basis}. The period start of the row ending ${rowEnd} cannot be established, so it may contain this completed sale; its operating income is withheld rather than left holding the gain.`;
        const out: FmpIncomeStatementRow = { ...row, nonMarginOperatingIncome: undefined, ebitda: undefined, fieldConflicts: { ...row.fieldConflicts } };
        for (const field of ["operatingIncome", "ebit", "netIncome", "netIncomeConsolidated", "netIncomeAvailableToCommon", "netIncomeFromContinuingOperations", "eps", "epsDiluted", "incomeBeforeTax", "incomeTaxExpense"] as const) {
          out[field] = undefined;
          out.fieldConflicts![field] = { vendorValue: num(row[field]), secValue: null, usable: false, reason: undated };
        }
        return out;
      }
      const gain = read.events.filter(e => e.date >= period.periodStart! && e.date <= rowEnd).reduce((sum, e) => sum + e.value, 0);
      if (!gain) return row;
      const out: FmpIncomeStatementRow = { ...row, operatingIncome: num(row.operatingIncome) === null ? undefined : row.operatingIncome! - gain,
        ...(row.nonMarginOperatingIncome != null ? { nonMarginOperatingIncome: row.nonMarginOperatingIncome - gain } : {}),
        ebit: num(row.ebit) === null ? undefined : row.ebit! - gain,
        ebitda: undefined,
        fieldConflicts: { ...row.fieldConflicts } };
      for (const field of ["netIncome", "netIncomeConsolidated", "netIncomeAvailableToCommon", "netIncomeFromContinuingOperations", "eps", "epsDiluted", "incomeBeforeTax", "incomeTaxExpense"] as const) {
        out[field] = undefined;
        out.fieldConflicts![field] = { vendorValue: num(row[field]), secValue: null, usable: false, reason };
      }
      return out;
    }) } } };
  };
  return { read, bundle: { ...bundle, statements: { ...bundle.statements,
    incomeAnnual: normalize(bundle.statements.incomeAnnual, "annual"), incomeQuarterly: normalize(bundle.statements.incomeQuarterly, "quarter") },
    gaps: [...bundle.gaps, { field: "compute.operatingDispositions", reason, severity: "info" }] } };
}

/**
 * Stage B runs inside one computation context (P13): the filed statements and
 * other exact-input derivations its readers repeat are computed once per run
 * step and never outlive it (src/edgar/computationContext.ts).
 */
export function runStageB(bundle: DataBundle, replayConfig?: StageBReplayConfig, suppliedValidation?: ValidationReport): ComputedMetrics {
  return withComputationContext(() => runStageBInContext(bundle, replayConfig, suppliedValidation));
}

function runStageBInContext(bundle: DataBundle, replayConfig?: StageBReplayConfig, suppliedValidation?: ValidationReport): ComputedMetrics {
  const notes: string[] = [];
  const suppressed: SuppressedMetric[] = [];
  const validation = suppliedValidation ?? (bundle.edgar?.companyFacts && bundle.institutional && Number.isFinite(Date.parse(bundle.builtAt))
    ? validateBundle(bundle as unknown as ValidatableBundle, { now: new Date(bundle.builtAt) }) : null);
  const profile = firstRow(bundle.profile);
  const support = classifyInstrumentSupport(profile);
  if (!support.supported) throw new UnsupportedInstrumentError(support);
  // D-296 (P21): gap reasons a retained bundle recorded at fetch time read in current words; the stored bundle is unchanged.
  bundle = { ...bundle, gaps: withRetiredGapWording(bundle.gaps) };
  bundle = withCashFlowSbcBasis(withPrimaryCapitalBasis(withBorrowingCostBasis(withIncomeOperatingBasis(withReleaseQuarterEarnings(withFilerShareUnits(bundle))))));
  bundle = balanceIntegrityView(bundle);
  const statementEvidence = statementEvidenceEntries(bundle);
  const statementQualifications = statementEvidence.map(entry => entry.detail);
  notes.push(...statementQualifications);
  if (statementQualifications.length) bundle = { ...bundle, gaps: [...bundle.gaps,
    ...statementEvidence.map(entry => ({ field: entry.field, reason: entry.detail, severity: "info" as const }))] };

  bundle = preferredCapitalView(bundle);
  bundle = filedCommonEarningsView(bundle);
  const operatingDispositions = operatingDispositionView(bundle);
  bundle = operatingDispositions.bundle;
  if (operatingDispositions.read.basis) notes.push(operatingDispositions.read.basis);
  // Derive only after instrument admission; unsupported sparse inputs retain their typed refusal.
  // D-67: source bundles and stored reports stay byte-for-byte unchanged.
  bundle = { ...bundle, economicShareEvidence: retainedClassEconomicEvidence(bundle) };
  const quote = firstRow(bundle.quote);
  const refusedAnnualRevenue = rowsOf(bundle.statements.incomeAnnual).find(row => row.fieldConflicts?.revenue?.usable === false);
  const revenueConflict = validation?.checks.find(check => check.status === "fail" && /^xbrlCrossCheck\.revenue\.FY\./.test(check.id) &&
    !rowsOf(bundle.statements.incomeAnnual).some(row => check.id === `xbrlCrossCheck.revenue.FY.${row.date}` &&
      row.fieldConflicts?.revenue?.usable === true && ["filed-family", "filed-line"].includes(row.fieldConflicts.revenue.resolution ?? "") &&
      row.revenue != null && row.fieldConflicts.revenue.secValue != null && vendorAgreesWithFiled(row.revenue, row.fieldConflicts.revenue.secValue) && row.fieldProvenance?.revenue?.source === "edgar")) ??
    (refusedAnnualRevenue ? { id: `statements.income.${refusedAnnualRevenue.date}.revenue`, detail: refusedAnnualRevenue.fieldConflicts!.revenue!.reason } : null);
  const revenueEligibilityReason = revenueConflict
    ? `Annual revenue definitions are unreconciled (${revenueConflict.id}): ${revenueConflict.detail}. Revenue growth and margins, the scenario dispersion and projection history, the revenue-based forensic inputs and growth-dependent valuation are withheld; raw source observations are retained.` : null;

  // The statements AS REPORTED. Calculations that combine rows read the
  // currency-compatible subsets below (rowsInModelCurrency) instead.
  const incomeAnnualReported = rowsOf(bundle.statements.incomeAnnual);
  // D-60: marketable equity securities the filing places inside cash and
  // short-term investments travel on the balance row, so every net-debt
  // consumer can keep them out of cash.
  const admittedFacts = admittedIssuerFacts(bundle.symbol, bundle.edgar);
  const companyFacts = admittedFacts?.ok ? admittedFacts.value.data : null;
  const balanceAnnualFeed = withMarketableEquity(rowsOf(bundle.statements.balanceAnnual), companyFacts, bundle.builtAt);
  const cashflowAnnualReported = rowsOf(bundle.statements.cashflowAnnual);
  const ttmGaps: ManifestEntry[] = [];
  const incomeQuarterSet = normalizeStatementQuarters(
    rowsOf(bundle.statements.incomeQuarterly),
    "income",
    ttmGaps,
    bundle.statements.incomeQuarterly,
  );
  // L2: a vendor quarter can omit a filed common numerator while retaining
  // otherwise usable income. Reuse the SEC normalizer's additive-flow rules;
  // never infer a common allocation from total income or rebuild IPO EPS.
  let commonEarningsSupplemented = false;
  const commonTagNames = tagsFor("netIncomeAvailableToCommon");
  if (companyFacts && admittedFacts?.ok && incomeQuarterSet.rows.slice(0, 4).some(r => num(r.netIncomeAvailableToCommon) === null) &&
    commonTagNames.some(tag => companyFacts.facts["us-gaap"]?.[tag] !== undefined) &&
    Number.isFinite(Date.parse(admittedFacts.value.fetchedAt)) && Date.parse(admittedFacts.value.fetchedAt) <= Date.parse(bundle.builtAt)) {
    const filed = buildStatementsFromCompanyFacts(companyFacts, { symbol: bundle.symbol, cik: String(companyFacts.cik), annualPeriods: 2, quarterlyPeriods: 5,
      asOf: bundle.builtAt.slice(0, 10), factsObservedAt: admittedFacts.value.fetchedAt,
      vendorSplits: { status: "unavailable", source: "retained-common-earnings", reason: "only additive common-income amounts are used; no share or EPS inference" } });
    incomeQuarterSet.rows = incomeQuarterSet.rows.map((row, index) => {
      if (index >= 4 || num(row.netIncomeAvailableToCommon) !== null || row.fieldConflicts?.netIncomeAvailableToCommon?.usable === false || Number(row.cik) !== companyFacts.cik) return row;
      const sec = filed.incomeQuarterly.rows.find(r => r.date === row.date && r.period === row.period && r.reportedCurrency === row.reportedCurrency);
      const evidence = sec?.fieldProvenance?.netIncomeAvailableToCommon;
      if (!sec || num(sec.netIncomeAvailableToCommon) === null || sec.fieldConflicts?.netIncomeAvailableToCommon?.usable === false || !evidence ||
        !evidence.tags.some(tag => commonTagNames.some(name => tag === `us-gaap/${name}`))) return row;
      commonEarningsSupplemented = true;
      notes.push(`Aggregate common earnings: ${row.date} uses filed net income available to common ${sec.netIncomeAvailableToCommon} ${evidence.unit}` +
        ` (${evidence.derivation ?? "direct filed flow"}; ${evidence.filings.map(f => `${f.form} ${f.accn}, filed ${f.filed}`).join("; ")}). No per-share EPS is inferred.`);
      return { ...row, netIncomeAvailableToCommon: sec.netIncomeAvailableToCommon,
        fieldProvenance: { ...row.fieldProvenance, netIncomeAvailableToCommon: evidence } };
    });
  }
  const balanceQuarterSet = normalizeStatementQuarters(
    withMarketableEquity(rowsOf(bundle.statements.balanceQuarterly), companyFacts, bundle.builtAt),
    "balance",
    ttmGaps,
  );
  const cashflowQuarterSet = normalizeStatementQuarters(
    rowsOf(bundle.statements.cashflowQuarterly),
    "cashFlow",
    ttmGaps,
    bundle.statements.cashflowQuarterly,
  );
  const incomeQuarterly = incomeQuarterSet.rows;
  const balanceQuarterlyReported = balanceQuarterSet.rows;
  const cashflowQuarterly = cashflowQuarterSet.rows;
  // D-173: the newest fiscal year's closing balance, when only the annual balance feed lags.
  const balanceFamiliesShareSource = bundle.statements.balanceAnnual.ok && bundle.statements.balanceQuarterly.ok &&
    bundle.statements.balanceAnnual.value.source === bundle.statements.balanceQuarterly.value.source;
  const balanceSource = bundle.statements.balanceAnnual.ok ? bundle.statements.balanceAnnual.value.source : null;
  const balanceAnnualReported = balanceFamiliesShareSource
    ? withFiscalYearEndBalance(balanceAnnualFeed, balanceQuarterlyReported, incomeAnnualReported, ttmGaps,
      balanceSource === "edgar" ? ["edgar:companyfacts"] : undefined)
    : balanceAnnualFeed;

  const todayIso = bundle.builtAt.slice(0, 10);

  // WS5: routing evidence from EDGAR companyfacts, read-only (D-16).
  const routingEvidence = deriveRoutingEvidence(admittedFacts, { today: todayIso });

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
  const trailingIncome = withFiledIncomeWindow(bundle, ttmIncomeFromNormalized(incomeQuarterSet, ttmGaps, [
    ...balanceQuarterSet.rows,
    ...cashflowQuarterSet.rows,
  ], bundle.builtAt), incomeQuarterSet.rows, ttmGaps);
  // D-198: only common-return consumers admit an earnings-only window. Every
  // legacy revenue-dependent consumer keeps its complete-revenue gate.
  const ttmInc = trailingIncome?.revenue != null ? trailingIncome : null;
  if (commonEarningsSupplemented && num(trailingIncome?.netIncomeAvailableToCommon) !== null) {
    const components = incomeQuarterSet.rows.slice(0, 4);
    const reason = `Aggregate TTM common earnings ${trailingIncome!.netIncomeAvailableToCommon}: ` + components.map(row => {
      const evidence = row.fieldProvenance?.netIncomeAvailableToCommon;
      return `${row.date} ${row.netIncomeAvailableToCommon} (${evidence?.derivation ?? "direct filed flow"}; ${evidence?.filings.map(f => `${f.form} ${f.accn}, filed ${f.filed}`).join("; ") ?? "source unavailable"})`;
    }).join(" + ") + ". Four contiguous common-income quarters; a derived Q4 is fiscal year less nine months, both operands filed. No per-share EPS is inferred and no FY-plus-YTD substitution is used.";
    notes.push(reason);
    ttmGaps.push({ field: "compute.ttmCommonEarnings.construction", reason, severity: "info", attemptedSources: ["edgar:companyfacts"] });
  }
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
  let ttmCf = ttmCashFlowFromNormalized(cashflowQuarterSet, ttmGaps, [
    ...incomeQuarterSet.rows,
    ...balanceQuarterSet.rows,
  ]);
  const cashFlowWindowAdmitted = cashFlowQuarterWindowAdmitted(cashflowQuarterSet, [
    ...incomeQuarterSet.rows,
    ...balanceQuarterSet.rows,
  ]);
  const latestCash = rejectedAffectsCurrentWindow(cashflowQuarterSet) ? undefined : cashflowQuarterSet.rows[0];
  const filedCfo = companyFacts && latestCash?.date && latestCash.reportedCurrency
    ? filedCfoTtm(companyFacts, latestCash.reportedCurrency, latestCash.date, bundle.builtAt) : null;
  const useFiledCfo = filedCfo && (!ttmCf || ttmCf.operatingCashFlow === null || !vendorAgreesWithDerived(ttmCf.operatingCashFlow, filedCfo.value, filedCfo.operands));
  const filedSbc = companyFacts && latestCash?.date && latestCash.reportedCurrency
    ? filedCashFlowTtm(companyFacts, "ShareBasedCompensation", latestCash.reportedCurrency, latestCash.date, bundle.builtAt) : null;
  const filedAllocatedSbc = companyFacts && latestCash?.date && latestCash.reportedCurrency
    ? filedCashFlowTtm(companyFacts, "AllocatedShareBasedCompensationExpense", latestCash.reportedCurrency, latestCash.date, bundle.builtAt) : null;
  const filedCapex = companyFacts && latestCash?.date && latestCash.reportedCurrency
    ? filedCapexTtm(companyFacts, cf0, latestCash.reportedCurrency, latestCash.date, bundle.builtAt) : null;
  if (useFiledCfo && latestCash?.date) {
    ttmCf = { date: latestCash.date, reportedCurrency: latestCash.reportedCurrency ?? null,
      capitalExpenditure: ttmCf?.capitalExpenditure ?? null, depreciationAndAmortization: ttmCf?.depreciationAndAmortization ?? null,
      operatingCashFlow: filedCfo.value };
    ttmGaps.push({ field: "compute.ttmCashFlow.filedYtd", reason: filedCfo.reason, severity: "info" });
  }
  if (filedCapex && ttmCf) {
    ttmCf = { ...ttmCf, capitalExpenditure: -filedCapex.value };
    for (let i = ttmGaps.length - 1; i >= 0; i--) if (ttmGaps[i]!.field === "compute.ttmCashFlow.capitalExpenditure") ttmGaps.splice(i, 1);
    ttmGaps.push({ field: "compute.ttmCashFlow.capitalExpenditure", reason: filedCapex.reason, severity: "info" });
  }
  const currencies = resolveStatementCurrencies(
    profile?.currency, inc0, ttmInc, ttmCf, incomeQuarterSet.rows[0],
    [...incomeQuarterSet.rows, ...balanceQuarterSet.rows, ...cashflowQuarterSet.rows], ttmGaps,
  );

  const foreignResolution = resolveForeignValuation(bundle, currencies.model);
  const foreignBasis = foreignResolution.basis;
  const valuationCurrency = foreignBasis ? "USD" : currencies.model;
  if (foreignResolution.reason && currencies.model !== str(profile?.currency)) ttmGaps.push({
    field: "valuation.currencyConversion", reason: `Foreign valuation remains withheld: ${foreignResolution.reason}. Existing currency and security guards remain in force.`, severity: "warn",
  });

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
  // An undated recorded period is financially excluded by the currency/date
  // gate above, but its identity must survive before later normalizers run.
  const incomeAnnualUndatedPeriods: FiscalDatedRow[] = incomeAnnualReported.filter(row=>isoDay(row.date)===null)
    .map(row=>({date:row.date,fiscalYear:row.fiscalYear,period:undefined}));
  const incomeAnnualForRevenue = revenueConflict
    ? incomeAnnual.map(row => ({ ...row, revenue: undefined, operatingIncome: undefined, nonMarginOperatingIncome: undefined })) : incomeAnnual;
  // Review m6: the rows' completions and stake fills, one manifest entry per kind once both families are admitted.
  const balanceAdmissions: BalanceAdmission[] = [];
  // D-254 (P13): the debt family is admitted once per run by its shared preparation; Stage B presents its own row.
  const debtAdmission = debtFamilyAdmission(bundle);
  const admitBalance = (statement: DebtFamilyStatement, vendorFamily: boolean) => (row: FmpBalanceSheetRow): FmpBalanceSheetRow => {
    row = withTangibleBookClassification(row, bundle, companyFacts);
    if (companyFacts === null) return row;
    const currency = establishedCurrencyOn([row], isoDay(row.date), currencyEvidence);
    const admitted = debtAdmission.admit(row, { statement, convention: "stage-b-balance-row", currency });
    ttmGaps.push(...admitted.admitted.gaps);
    balanceAdmissions.push(...admitted.admitted.admissions);
    if (!vendorFamily) return admitted.row;
    // D-133: a provider row's undisclosed stakes, so a bundle frozen before the enrichment filled them reads them too.
    const stakes = admitVendorLongTermInvestments(admitted.row, companyFacts, currency, bundle.builtAt);
    balanceAdmissions.push(...stakes.admissions);
    return stakes.row;
  };
  const vendorFamily = (family: DataBundle["statements"]["balanceAnnual"]): boolean => family.ok && family.value.source !== "edgar";
  let balanceAnnual = compatible.balanceAnnual.rows.map(admitBalance("balanceAnnual", vendorFamily(bundle.statements.balanceAnnual)));
  const cashflowAnnual = compatible.cashflowAnnual.rows;
  let balanceQuarterly = compatible.balanceQuarterly.rows.map(admitBalance("balanceQuarterly", vendorFamily(bundle.statements.balanceQuarterly)));
  ttmGaps.push(...balanceAdmissionEntries(balanceAdmissions));
  for (const family of Object.values(compatible)) if (family.gap !== null) ttmGaps.push(family.gap);
  // D-237 (P20): the annual effective tax rates read each year's own base; name
  // every year whose base is the filed line, with its filing.
  const annualTaxBases = incomeAnnual.flatMap(row => { const text = taxRatePretaxOperand(row); return text === null ? [] : [text]; });
  if (annualTaxBases.length > 0) {
    ttmGaps.push({ field: "statements.income.annual.taxRatePretaxIncome", severity: "info", expected: true, attemptedSources: ["edgar:companyfacts"],
      reason: "Annual effective tax rates (the ROIC series' tax rate and the DCF's historical tax rates) divide each year's provision by the filed pre-tax income before " +
        "equity-method results, not by the pre-tax figure that includes the after-tax equity-method result, because the filer presents that result after its provision. " +
        `Filed operands: ${annualTaxBases.join("; ")}. Pre-tax income elsewhere keeps the figure that reconciles to net income.` });
  }

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

  if (foreignBasis) route.notes = route.notes.map(note => note.startsWith("adr overlay applied")
    ? `adr overlay applied (profile.isAdr). ${foreignBasis.note}` : note);

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

  const lendingCashFlow = lenderCashFlowApplicability(bundle, route, [...balanceQuarterly, ...balanceAnnual]);
  if (lendingCashFlow) {
    route.cashFlowApplicability = lendingCashFlow;
    route.notes.push(lendingCashFlow.reason);
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
    { statements: valuationCurrency, quote: str(profile?.currency) },
  );

  // --- Growth ----------------------------------------------------------------
  // Growth rates compare years, so they read the currency-compatible rows. A
  // margin is a ratio within one row — one presentation currency, whatever it
  // is — so the margin series keeps every reported year.
  const growthCompatible = computeGrowth(
    incomeAnnualForRevenue.map(toGrowthIncome),
    cashflowAnnual.map(toGrowthCashFlow),
    { period: "annual" },
  );
  const growth = {
    ...growthCompatible,
    margins: computeGrowth((revenueConflict
      ? incomeAnnualReported.map(row => ({ ...row, revenue: undefined, operatingIncome: undefined, nonMarginOperatingIncome: undefined })) : incomeAnnualReported)
      .map(toGrowthIncome), [], { period: "annual" }).margins,
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
  // WS6 (D-19): METIS_EV_INCLUDE_LEASES is read ONCE per Stage B run and
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
    foreignBasis,
    trailingIncome,
  );
  if (lendingCashFlow) {
    returns.roic = { series: [], latestRoicPct: null, asOf: returns.roic.asOf, notes: [lendingCashFlow.reason], gaps: [] };
    returns.roicVsWacc = { spreadPctPts: null, note: lendingCashFlow.reason };
    if (returns.rote.latestRotePct === null) {
      const withheld = returns.rote.notes.filter(note => note.includes("ROTE withheld:"));
      if (withheld.length) {
        const reason = `Lender return on tangible common equity withheld: ${withheld.join("; ")}`;
        returns.rote.gaps = [...returns.rote.gaps.filter(gap => gap.field !== "returns.rote"), { field: "returns.rote", reason, severity: "warn" }];
        returns.gaps = [...returns.gaps.filter(gap => gap.field !== "returns.rote"), ...returns.rote.gaps.filter(gap => gap.field === "returns.rote")];
      }
    }
  }
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
  const companyFactsResult = admittedFacts;
  const repurchaseExecutions = primaryRepurchaseExecutions(bundle, cashflowAnnual.map((r) => String(r.date ?? "")).filter((d) => d.length > 0));
  const annualCapital = computeCapital(
    incomeAnnual.map(toCapitalIncome),
    cashflowAnnual.map(toCapitalCashFlow),
    balanceAnnual.map(row => toCapitalBalance(row, leaseEvidenceContextFor(bundle.symbol, bundle.edgar, bundle.builtAt))),
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
      shareUnit: quotedShareUnit(bundle),
      repurchaseExecutions: repurchaseExecutions.rows,
      companyFacts,
      asOf: bundle.builtAt,
      // AMZN audit 2026-10-20, finding 20 (b): net debt/EBITDA on the EV's lease basis.
      evIncludeLeases,
    },
  );
  const primaryExecutions = repurchaseExecutions.rows.filter(r => r.primaryEvidence !== undefined);
  if (primaryExecutions.length > 0) annualCapital.primaryRepurchaseExecutions = primaryExecutions;
  if (annualCapital.buybackPriceAnalysis.totalRepurchased > 0 || primaryExecutions.length > 0) {
    for (const note of repurchaseExecutions.notes) annualCapital.notes.push(note);
  }

  const sumCurrentFlow = (field: keyof FmpCashFlowRow): number | null => {
    if (!ttmCf || !currencies.ttmCashFlowUsable || !cashFlowWindowAdmitted) return null;
    const values = cashflowQuarterly.slice(0,4).map(row => field === "stockBasedCompensation" ? admittedSbc(row) : num(row[field]));
    return values.every((v): v is number => v !== null) ? values.reduce((sum,v)=>sum+v,0) : null;
  };
  const currentBalance = [balanceQuarterly[0], balanceAnnual[0]].filter((r): r is FmpBalanceSheetRow => r !== undefined)
    .sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0];
  // Consolidated cash cannot be divided by a mixture of parent and total profit.
  // A generic earnings window is usable only on an explicit consolidated basis.
  // A zero closing NCI balance cannot prove zero NCI earnings during the period.
  const consolidatedWindowIncome = ttmInc?.netIncomeConsolidated ??
    (ttmInc?.netIncomeOwnershipBasis === "consolidated" ? ttmInc.netIncome : null);
  // D-240 (P5, P1): where the quarterly rows establish no consolidated window, the filings may: an issuer whose
  // filings state one profit line has that line as its consolidated profit. The figure is the filed one, for the
  // report's own window, and it must be the same observation as the report's trailing net income (P8's allowance
  // for a figure derived from filed operands); a refused or missing trailing net income stays refused (P11).
  const trailingNetIncome = num(ttmInc?.netIncome);
  const filedWindowProfit = consolidatedWindowIncome == null && ttmInc && currencies.ttmIncomeUsable && companyFacts && ttmInc.periodStart &&
    ttmInc.reportedCurrency && trailingNetIncome !== null && !ttmInc.netIncomeWithheldReason
    ? filedSingleProfitWindow(companyFacts, ttmInc.reportedCurrency, ttmInc.periodStart, ttmInc.date, bundle.builtAt) : null;
  const filedConversionIncome = filedWindowProfit && trailingNetIncome !== null &&
    vendorAgreesWithDerived(trailingNetIncome, filedWindowProfit.value, filedWindowProfit.operands) ? filedWindowProfit : null;
  const consolidatedConversionIncome = consolidatedWindowIncome ?? filedConversionIncome?.value ?? null;
  const capital = attachCurrentCapital(annualCapital, {
    trailingCashFlow: cashflowQuarterly.slice(0,4).map(toCapitalCashFlow),
    periodStart: ttmInc && ttmCf && currencies.ttmIncomeUsable && currencies.ttmCashFlowUsable ? ttmInc.periodStart : incomeAnnual[0]?.fieldProvenance?.revenue?.periodStart ?? null,
    route: route.base,
    modelEligibilityReason,
    evIncludeLeases,
    // D-31 / FIN-112: like the annual capital input, EBIT stays on operating income.
    // An incomplete trailing operating flow is unknown, never vendor EBIT or an annual substitute.
    income: ttmInc && currencies.ttmIncomeUsable ? { ...ttmInc, netIncome: consolidatedConversionIncome, operatingIncome: operatingIncomeForNonMargins(ttmInc), ebit: operatingIncomeForNonMargins(ttmInc),
      // D-282: a filed exact window or four established quarters establish the TTM interest.
      filedCoverageOperands: filedCoverageOperands(ttmInc, operatingIncomeForNonMargins(ttmInc), ttmInc.interestExpenseFiled === true || ttmInc.filedIncomeFlows?.interestExpense !== undefined) } : null,
    preserveAnnualCashBasis: ttmInc?.nonMarginOperatingIncome !== undefined,
    cashFlow: ttmCf && currencies.ttmCashFlowUsable ? { ...ttmCf,
      netIncome: consolidatedConversionIncome, freeCashFlow: sumCurrentFlow("freeCashFlow"),
      stockBasedCompensation: filedSbc?.value ?? sumCurrentFlow("stockBasedCompensation"),
      reportedCurrency: latestCash?.reportedCurrency,
      ...(filedSbc ? {fieldProvenance:{stockBasedCompensation:{source:"edgar" as const, unit:latestCash!.reportedCurrency!,periodStart:filedSbc.start,periodEnd:filedSbc.end,observedAt:bundle.builtAt,tags:[`us-gaap/${filedSbc.tag}`],filings:filedSbc.points.map(p=>({accn:p.accn,filed:p.filed,form:p.form}))}}} : {}),
      financeLeasePrincipalPayments: sumCurrentFlow("financeLeasePrincipalPayments"), issuerFreeCashFlow: sumCurrentFlow("issuerFreeCashFlow"),
    } : null,
    balance: currentBalance ? toCapitalBalance(currentBalance, leaseEvidenceContextFor(bundle.symbol, bundle.edgar, bundle.builtAt)) : null,
    currency: currencies.model,
    annualCashFlow: cashflowAnnual[0] ? toCapitalCashFlow(cashflowAnnual[0]) : null,
    annualBalance: balanceAnnual[0] ? toCapitalBalance(balanceAnnual[0], leaseEvidenceContextFor(bundle.symbol, bundle.edgar, bundle.builtAt)) : null,
  });

  if (capital.current) capital.current.cashBridge.definition += statementEvidence.filter(entry => entry.field === "statements.foreignInterim").map(entry => ` ${entry.detail}`).join("");
  if (lendingCashFlow) applyLenderCapitalApplicability(capital, lendingCashFlow.reason);
  if (lendingCashFlow?.debtPerimeter && capital.current?.asOf === lendingCashFlow.asOf) {
    const p = lendingCashFlow.debtPerimeter;
    // D-234: the provider label names the debt figure only while that figure is the provider's perimeter.
    Object.assign(capital.current.debtBridge, { ...(p.filedDebt === undefined ? { providerDebtPerimeterLabel: p.label } : {}), filedBorrowings: p.borrowings, loanOwnerPayables: p.loanOwnerPayables });
    Object.assign(capital.current.debtBridge, {
      filedCurrentDebt: p.components.find(c => /^Debt, current$/i.test(c.name))?.value,
      filedCurrentRelatedPartyDebt: p.components.find(c => /^Debt, current to related parties$/i.test(c.name))?.value,
      filedNoncurrentDebt: p.components.find(c => /^Debt, non-current$/i.test(c.name))?.value,
    });
    capital.current.debtBridge.compositionNote += p.filedDebt === undefined
      ? ` ${p.label}. Filed borrowings = ${p.components.map(c => `${c.name} ${c.value}`).join(" + ")} = ${p.borrowings} ${p.currency}; loan-owner payables ${p.loanOwnerPayables} are separate, as is the retained operating-lease observation. ${p.source}.`
      : ` Debt is the filed borrowings plus the recorded operating lease: ${p.components.map(c => `${c.name} ${c.value}`).join(" + ")} = ${p.borrowings} ${p.currency}, and ${p.filedDebt} ${p.currency} with the lease. The provider's debt figure also counted loan-owner payables of ${p.loanOwnerPayables} ${p.currency}, which the filing does not present as debt. ${p.source}.`;
  }
  if (capital.current?.basis === "ttm") {
    if (capital.current.industrialMetricsApplicable !== false) {
      capital.current.cashBridge.definition += consolidatedConversionIncome === null
        ? " Consolidated FCF conversion is withheld because a complete consolidated earnings window is not established; parent or unknown-scope profit and closing NCI balances cannot supply that denominator."
        : filedConversionIncome ? ` FCF conversion divides by net income for this same window, taken from the filings. ${filedConversionIncome.reason}`
        : " FCF conversion uses the complete consolidated net-income window, including signed noncontrolling earnings; it is not a parent-shareholder cash-conversion measure.";
    }
    const cfo = filedCfo?.end === capital.current.asOf && filedCfo?.value === capital.current.cashBridge.operatingCashFlow ? filedCfo : null;
    const sbc = filedSbc?.end === capital.current.asOf && filedSbc?.value === capital.current.cashBridge.stockBasedCompensation ? filedSbc : null;
    const capex = filedCapex?.end === capital.current.asOf && -filedCapex.value === capital.current.cashBridge.cashCapitalExpenditure ? filedCapex : null;
    const allocated = filedAllocatedSbc?.end === capital.current.asOf && latestCash?.reportedCurrency === capital.current.currency ? filedAllocatedSbc : null;
    if (cfo) capital.current.cashBridge.definition += ` ${cfo.reason}`;
    if (sbc) capital.current.cashBridge.definition += ` ${sbc.reason}`;
    if (capex) capital.current.cashBridge.definition += ` ${capex.reason} Cash-flow capex is displayed as a negative outflow on this same tag basis.`;
    if (allocated) { capital.current.allocatedSbcExpense = allocated.value; capital.current.cashBridge.definition += ` ${allocated.reason} Allocated expense and cash-flow add-back are distinct bases; neither is substituted for the other.`; }
    // D-240: the filed net-income window keeps its operands beside the cash flows it is compared with (P1, P20).
    const profit = filedConversionIncome?.end === capital.current.asOf && filedConversionIncome.value === capital.current.netIncome ? filedConversionIncome : null;
    if (profit) ttmGaps.push({ field: "compute.ttmIncome.filedNetIncome", reason: profit.reason, severity: "info" });
    if (cfo || sbc || capex || allocated || profit) capital.current.filedCashFlows = {
      ...(cfo ? { operatingCashFlow: cfo } : {}), ...(sbc ? { stockBasedCompensation: sbc } : {}),
      ...(capex ? { capitalExpenditure: capex } : {}), ...(allocated ? { allocatedSbcExpense: allocated } : {}),
      ...(profit ? { netIncome: profit } : {}),
    };
  }

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
    { income: incomeAnnualForRevenue.map(toForensicsIncome), cashFlow: cashflowAnnual.map(toForensicsCashFlow) },
    companyFactsResult?.ok === true ? companyFactsResult.value.data : null,
    str(inc0?.reportedCurrency),
  );
  const forensicClassAmbiguity = retainedCommonClassAmbiguity(bundle);
  const adrQuote = route.overlays.includes("adr") || profile?.isAdr === true;
  // Preserve this consumer's profile-cap precedence. A declaration on a
  // different provider row does not establish the selected cap's scope.
  const forensicCapRow = profile?.marketCap != null ? profile : quote;
  const forensicEquityScope = resolveEconomicEquityScope({
    price: num(quote?.price) ?? num(profile?.price), marketCap: num(profile?.marketCap ?? quote?.marketCap),
    currency: str(profile?.currency),
    priceAsOf: quotePriceObservationDay(num(quote?.price) !== null ? quote : profile),
    issuerId: bundle.edgar.registrant?.cik10, securityId: bundle.symbol,
    isAdr: adrQuote,
    ...(adrQuote && (foreignBasis || forensicCapRow?.marketCapSecurityBasis === "issuer-common") ? { marketCapSecurityBasis: "issuer-common" as const } : {}),
    ...(forensicClassAmbiguity ? { marketCapSecurityBasis: "unresolved" as const, marketCapScopeEvidence: forensicClassAmbiguity } : {}),
  }, bundle.economicShareEvidence ?? [], isoDay(bundle.builtAt) ?? "");
  // D-267 (P1, P13): Altman X4 sets the market value of equity AT the balance-sheet date against that balance's
  // liabilities. The dated market-cap history is the provider series on its own share basis (the keyless derivation
  // uses the count in force each day). It is not admitted where the current cap had to be rebuilt on the issuer's
  // economic class basis (the provider series is not on it; the own-history multiples refuse it the same way), and a
  // cap converted at the quote-date rate cannot be converted at the balance date with that rate.
  const forensicClassScopeRebuilt = forensicEquityScope.status === "resolved" &&
    (forensicEquityScope.multiClass === true || forensicEquityScope.weightedClasses === true);
  // D-267 review: a derived reading carries the date of the share count it multiplied (see `derivedMarketCapShareDate`).
  const marketCapHistoryEndpoint = bundle.marketCapHistory?.ok ? bundle.marketCapHistory.value.endpoint : null;
  const shareFacts = bundle.edgar?.companyFacts?.ok ? bundle.edgar.companyFacts.value.data : null;
  const forensicMarketCapHistory = foreignBasis || forensicClassScopeRebuilt ? [] : rowsOf(bundle.marketCapHistory).flatMap((r) => {
    const date = isoDay(r.date);
    if (date === null) return [];
    return [isDerivedMarketCapRow(r, marketCapHistoryEndpoint)
      ? { date, marketCap: num(r.marketCap), sharesAsOf: derivedMarketCapShareDate(r, shareFacts) }
      : { date, marketCap: num(r.marketCap) }];
  });
  const foreignCapRefusal = foreignBasis
    ? `the market cap is converted to ${currencies.model} only at the ${foreignBasis.fx.quoteDate} quote-date rate, and no exchange rate dated at the balance-sheet date is admitted`
    : null;
  const forensics = runForensics(route, {
    filedReceivables: filedReceivablesCandidates(companyFacts, {
      periods: balanceAnnual.flatMap(row => {
        // A missing duplicate row label does not erase an explicit field unit.
        // The shared selector still checks the chosen field and both endpoints.
        const currencies = row.reportedCurrency ? [row.reportedCurrency] :
          [row.fieldProvenance?.accountsReceivables?.unit, row.fieldProvenance?.netReceivables?.unit];
        return [...new Set(currencies)].map(currency => ({ end: String(row.date ?? ""), currency }));
      }),
      asOf: bundle.builtAt,
      observedAt: companyFactsResult?.ok === true ? companyFactsResult.value.fetchedAt : null,
    }),
    income: forensicContext.income,
    balance: balanceAnnual.map(toForensicsBalance),
    cashFlow: forensicContext.cashFlow,
    marketCap: foreignBasis ? foreignBasis.marketCapUsd / foreignBasis.fx.usdPerReportingUnit : forensicEquityScope.marketCap,
    marketEquityWithheldReason: forensicEquityScope.status === "unresolved" ? forensicEquityScope.basis : null,
    // Derived class capitalization belongs to its admitted price session;
    // a vendor cap belongs to its own source row, never its fetch envelope.
    marketCapAsOf: foreignBasis ? foreignBasis.fx.quoteDate : forensicEquityScope.status === "resolved" ? forensicEquityScope.priceAsOf ?? null
      : forensicEquityScope.status === "unresolved" ? null
        : quotePriceObservationDay(num(profile?.marketCap) !== null ? profile : quote),
    marketCapHistory: forensicMarketCapHistory,
    marketCapHistorySource: forensicClassScopeRebuilt
      ? "no admitted history: the provider market-cap series is not on the issuer's economic class basis"
      : bundle.marketCapHistory.ok ? bundle.marketCapHistory.value.endpoint : null,
    marketCapHistoryCurrencyReason: foreignCapRefusal,
    // D-267 review: the converted cap is the quote's observation at the rate's own date; forensics admits it only when
    // both dates pair with the balance date.
    marketCapConversion: foreignBasis ? { rateDate: foreignBasis.fx.observation.date, source: `FRED ${foreignBasis.fx.series}` } : null,
    analysisCutoff: isoDay(bundle.builtAt),
    reportedCurrency: str(inc0?.reportedCurrency),
    quoteCurrency: foreignBasis ? currencies.model : str(profile?.currency),
    classification: {
      sector: str(profile?.sector),
      industry: str(profile?.industry),
      sicCode: str(bundle.edgar?.sic),
    },
  });
  if (balanceAnnual.some((row) => num(row.longTermDebt) !== null && row.fieldProvenance?.longTermDebt?.calculation !== "same-filing-debt-completed" && longTermDebtHoldsCurrent(row.fieldProvenance?.longTermDebt?.tags))) {
    forensics.gaps.push({ field: "forensics.longTermDebt", severity: "info", reason:
      "long-term debt is composed from instrument-class tags that include current debt, so Beneish LVGI, which adds it to current liabilities, is not evaluated; Piotroski leverage compares the composed figure year on year only when both years compose it from the same classes; total debt is unaffected" });
  }
  if (forensicEquityScope.status === "unresolved") {
    forensics.gaps.push({ field: "forensics.economicClassBasis", reason: forensicEquityScope.basis, severity: "warn", attemptedSources: forensicEquityScope.sourceIds });
  }
  if (revenueEligibilityReason) {
    forensics.gaps.push({ field: "forensics.revenueEligibility", reason: revenueEligibilityReason, severity: "warn" });
  }

  if (foreignBasis) {
    // D-267 review: the note states what Altman actually did with the converted capitalization on this run.
    const altmanRun = forensics.altman;
    const convertedSource = altmanRun?.variant === "original" ? altmanRun.asOf.marketCapSource ?? null : null;
    const refusal = altmanRun?.gaps.some((g) => g.field === "forensics.altman.currency") === true ? foreignCapRefusal : null;
    const altmanNote = convertedSource !== null && convertedSource.startsWith("current market capitalization converted at")
      ? `Altman X4 converts the admitted USD market capitalization observed on ${altmanRun!.asOf.marketCap} back into the reporting currency (${convertedSource}) for its local-currency liability denominator, both dated with the ${altmanRun!.asOf.balanceSheet} balance sheet.`
      : refusal !== null
        ? `Altman X4 does not use the converted market capitalization: ${refusal}${altmanRun?.variant === "private" ? "; the book-equity Z-prime variant is used instead" : ""}.`
        : `Altman does not use the converted market capitalization: ${altmanRun === null ? "no Altman score is computed" : `the ${altmanRun.variant} variant uses book equity`}.`;
    forensics.notes.push(`${foreignBasis.note} ${altmanNote}`);
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
    foreignBasis,
    revenueEligibilityReason,
    operatingDispositions: operatingDispositions.read,
    // FIN-121: use the SAME selected routing flow, before model-currency filtering.
    finOtherOcfExemption: route.base === "general" && !route.overlays.includes("unprofitable") &&
      ["financial services", "financial"].includes(str(profile?.sector)?.trim().toLowerCase() ?? "") &&
      (routingCashflowTtm?.operatingCashFlow ?? routingCashflowAnnual?.operatingCashFlow ?? 0) < 0,
    incomeAnnual: incomeAnnualForRevenue,
    incomeAnnualUndatedPeriods,
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
  if (foreignResolution.reason !== null && valuation.gaps.some(g => g.field === "valuation.dcf.currency" || g.field === "valuation.excessReturn.currency")) {
    valuation.gaps.push({ field: "valuation.currencyConversion", reason: foreignResolution.reason, severity: "warn" });
  }

  const sbcConcentration = capital.current?.sbcConcentration;
  if (sbcConcentration) {
    capital.notes.push(sbcConcentration.basis);
    if (valuation.kind === "dcf-suppressed") {
      valuation.suppressionReason = `${valuation.suppressionReason ?? "FCFF DCF suppressed under the unprofitable overlay."} ${sbcConcentration.basis}`;
      valuation.notes.push(sbcConcentration.basis);
      valuation.gaps = valuation.gaps.map(gap => gap.field === "valuation.dcf" ? {...gap,reason:`${gap.reason} ${sbcConcentration.basis}`} : gap);
    }
  }
  // --- Route metrics for financial companies (WS5, D-17) --------------------
  // The bank, insurer and mortgage-REIT routes have led with NIM, the
  // efficiency ratio, the combined ratio, book value per share, the spread and
  // leverage since the route table was written, and nothing computed any of
  // them. Each is now computed from the filer's own XBRL tags where its
  // definition allows, and withheld with a stated reason where it does not.
  const financialMetrics = computeFinancialMetrics(route.base, {
    companyFacts: admittedFacts,
    balance: balanceAnnual.map((r) => ({
      ...fiscalIdentity(r),
      date: String(r.date ?? ""),
      acceptedDate: str(r.acceptedDate),
      filingDate: str(r.filingDate),
      reportedCurrency: str(r.reportedCurrency),
      totalAssets: num(r.totalAssets),
      totalStockholdersEquity: num(r.totalStockholdersEquity),
      totalEquity: num(r.totalEquity),
      goodwill: num(r.goodwill),
      intangibleAssets: num(r.intangibleAssets),
      preferredStock: num(r.preferredStock),
    })),
    income: incomeAnnual.map((r) => ({
      ...fiscalIdentity(r),
      date: String(r.date ?? ""),
      acceptedDate: str(r.acceptedDate),
      filingDate: str(r.filingDate),
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
      // Rejected recent periods must not disappear and expose older burn rows.
      const rejectedRunwayPeriod = rejectedAffectsCurrentWindow(cashflowQuarterSet);
      const runwayCashflow = rejectedRunwayPeriod ? [] : cashflowQuarterly;
      runway = computeRunway(
        {
          date: String(b0.date ?? ""),
          cashAndCashEquivalents: num(b0.cashAndCashEquivalents),
          shortTermInvestments: num(b0.shortTermInvestments),
          cashAndShortTermInvestments: num(b0.cashAndShortTermInvestments),
        },
        runwayCashflow.map((r) => ({
          date: String(r.date ?? ""),
          operatingCashFlow: num(r.operatingCashFlow),
          capitalExpenditure: num(r.capitalExpenditure),
        })),
        incomeQuarterly.map((r) => ({
          date: String(r.date ?? ""),
          weightedAverageShsOutDil: num(r.weightedAverageShsOutDil),
        })),
      );
      runway = gateRunwayCurrency(runway, b0, runwayCashflow, [
        ...incomeQuarterly,
        ...balanceQuarterly,
        ...cashflowQuarterly,
        ...rowsOf(bundle.statements.incomeAnnual),
        ...rowsOf(bundle.statements.cashflowAnnual),
      ]);
      if (rejectedRunwayPeriod) runway.gaps.push({
        field: "runway.quarterRows", severity: "warn",
        reason: `Runway withheld: recent cash-flow period ${rejectedRunwayPeriod.period} is unresolved (${rejectedRunwayPeriod.reason}); older quarters cannot substitute.`,
      });
    }
  }

  if (lendingCashFlow) {
    if (runway) runway = { ...runway, burning: null, avgQuarterlyBurn: null, burnWindowQuarters: 0, burnWindowDates: [],
      runwayQuarters: null, estimatedExhaustionDate: null, notes: [lendingCashFlow.reason],
      gaps: runway.gaps.filter(gap => gap.field === "runway.liquidAssets" || gap.field.startsWith("runway.dilution")) };
    for (const key of ["fcf", "fcfGrowth", "fcfYield", "priceToFcf", "cashRunway", "fcfConversion", "sbcPctOfFcf", "netDebt", "netDebtToEbitda", "interestCoverage", "grossMargin", "roic", "roicVsWacc"]) suppress(key, lendingCashFlow.reason);
    degradation.items.push({ target: "cashFlow.ownerEconomics", action: "suppress", disclosure: lendingCashFlow.reason });
  }

  // --- Scores + projections (deterministic; feature 1.1.0) ------------------
  // Every upside (the grade's DCF signal, the fair value, the scenario targets)
  // sets a model value against the quote. Without one known currency on both
  // sides there is no such figure, so the price is withheld from all of them;
  // the per-share values themselves do not use it and stand.
  const quoteComparison = comparePriceCurrency(valuationCurrency, str(profile?.currency));
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
        companyFacts,
        isoDay(balance.date), currencies.model, bundle.builtAt),
    });
  })() : null;
  const fairValue = withDegradedInputs(
    computeFairValue({
      valuation,
      currentPrice,
      currency: valuationCurrency,
      asOf: asOfDay,
      quoteAsOf: quotePriceObservationDay(quote),
    }),
    degradedInputsReason({
      betaUsesRegression: returns.wacc.betaFinal !== null && /keyless profile regression|monthly OLS regression fallback/.test(returns.wacc.betaSource ?? ""),
      riskFree: riskFreePct(bundle),
      waccHistoryCurrentOnly: valuation.kind === "dcf" && riskFreeObservations(bundle).length === 0 && returns.waccHistory.missing.length > 0,
      bundleGaps: bundle.gaps,
      valuationGaps: valuation.gaps,
    }),
  );

  const scoreGaps: ManifestEntry[] = [];
  const rawScores = computeScores({
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
    valuationUse: fairValue.currentUse,
    currentPrice,
    asOf: asOfDay,
    quoteAsOf: quotePriceObservationDay(quote),
  }, scoreGaps);

  // D-261 (P10, P11): missing capital-return evidence names its root wherever
  // it withholds an applicable signal. Route-suppressed signals are not gaps.
  const latestRoicGap = returns.roic.gaps.find(gap => gap.field === `returns.roic.${returns.roic.asOf}`)
    ?? returns.roic.gaps.find(gap => gap.field === "returns.roic");
  if ((returns.roic.latestRoicPct === null || returns.wacc.waccPct === null) && balanceAnnual.some(row => row.cashConflictReconciled) && returns.roicVsWacc.spreadPctPts === null && !policy.suppress.includes("roicVsWacc")) {
    const causes = [returns.roic.latestRoicPct === null ? latestRoicGap?.reason ?? "latest fiscal-year ROIC is unavailable" : null,
      returns.wacc.waccPct === null ? returns.wacc.gaps.find(gap => gap.severity === "critical")?.reason
        ?? returns.wacc.gaps[0]?.reason ?? "WACC is unavailable" : null].filter(Boolean).join("; ");
    const reason = `ROIC minus WACC withheld because ${causes}`;
    returns.roicVsWacc.note = reason;
    returns.gaps.push({ field: "returns.roicVsWacc", reason, severity: "info" });
  }

  // Same point-in-time anchors as computeValuation (audit H2/M3/M4): the NEWER
  // of the latest quarterly vs annual whole rows (balance + diluted shares,
  // zero-for-undisclosed share counts treated as missing), and net debt from
  // the shared components-only resolver. Disclosures are emitted once from the
  // valuation block (identical underlying rows).
  const inc0Proj = withoutTransitionPeriods(normalizeQuarterRows(incomeAnnual).rows).rows[0];
  const projRowDate = (r: { date?: unknown } | null | undefined): string =>
    typeof r?.date === "string" ? r.date : "";
  // FIN-404: the same divisor as the valuation block (a loss period keeps its award dilution).
  const projDivisors = incomeDivisors(incomeQuarterly, inc0Proj, confirmedIssuerFacts(bundle.symbol, bundle.edgar));
  const sharesQProj = projDivisors.quarter.shares;
  const sharesAProj = projDivisors.annual.shares;
  const dilutedSharesProj =
    projRowDate(incomeQuarterly[0]) >= projRowDate(inc0Proj) ? (sharesQProj ?? sharesAProj) : (sharesAProj ?? sharesQProj);
  // Collapse restated/duplicate fiscal years BEFORE the dispersion sees them.
  // Removing the irregular-spacing veto left scenarioDispersion with no
  // protection against a duplicated period, which contributes a zero-length
  // interval and a repeated observation to the volatility estimate.
  const projAnnualNorm = normalizeQuarterRows(incomeAnnualForRevenue);
  const projRegular = withoutTransitionPeriods(projAnnualNorm.rows);
  const projNorm = normalizeQuarterRows(projRegular.rows);
  const projectionCadenceBarriers = [...incomeAnnualUndatedPeriods,...rejectedAnnualCadenceRows(incomeAnnualForRevenue,
    [...projAnnualNorm.rejected,...projRegular.withheld.map(row=>({period:row.date}))])];
  const projectionPeriodGaps: ManifestEntry[] = [...projAnnualNorm.rejected,...projNorm.rejected].map(({ period, reason }) => ({
    field: "projections.incomeStatement.period",
    reason: `annual period ${period} dropped from the projection history: ${reason}`,
    severity: "warn" as const,
  }));
  if (revenueEligibilityReason) {
    projectionPeriodGaps.push({ field: "projections.revenueEligibility", reason: revenueEligibilityReason, severity: "warn" });
  }
  const projectionIncomeHistory = projNorm.rows.map(
    (r): ProjectionIncomeRow => ({
      ...fiscalIdentity(r),
      fiscalYear: str(r.fiscalYear),
      date: String(r.date ?? ""),
      // Every revenue consumer uses the same admitted operating line.
      revenue: operatingMarginBasis(r).revenue,
      // Projections and their EPS conversion use the DCF's operating EBIT.
      // Vendor EBIT can include non-operating gains (pretax income + interest).
      ebit: operatingMarginBasis(r).operatingIncome,
      netIncome: num(r.netIncome),
      epsDiluted: num(r.epsDiluted),
      interestExpense: num(r.interestExpense),
      interestExpenseDisclosed: disclosedProjectionInterest(r, currencies.model),
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
  const projectionCurrency = valuationCurrency;
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
  const projectionTemporary = projectionOwnershipBalance === undefined ? null : temporaryEquityClaims({ ...temporaryEquityOperands(projectionOwnershipBalance), preferredStock: num(projectionOwnershipBalance.preferredStock) });
  const projectionTemporaryClaim = projectionTemporary !== null && (projectionTemporary.refusal !== null || projectionTemporary.total > 0);
  // A rejected TTM can leave an older annual DCF anchor. Its EPS must not
  // import a newer quarter, or interest in an unestablished/different currency.
  const projectionInterest = latestIncomeQuarter !== undefined && projectionQuarterDate !== null && projectionAnchorDate !== null
    && projectionQuarterDate <= projectionAnchorDate && projectionQuarterDate > projRowDate(inc0Proj)
    && currencies.model !== null && establishedCurrencyOn([latestIncomeQuarter], projectionQuarterDate, currencyEvidence) === currencies.model
    ? interestRunRate({ date: projectionQuarterDate, interestExpense: num(latestIncomeQuarter.interestExpense),
      days: incomePeriod(latestIncomeQuarter, incomeQuarterly[1]).days,
      interestExpenseDisclosed: disclosedProjectionInterest(latestIncomeQuarter, currencies.model) },
      debtExLeases(balanceQuarterly.find((b) => isoDay(b.date) === isoDay(latestIncomeQuarter.date))),
      debtExLeases(balanceQuarterly.find((b) => { const d = isoDay(b.date); const q = isoDay(latestIncomeQuarter.date); return d !== null && q !== null && d < q && (Date.parse(q) - Date.parse(d)) / SPREAD_DAYS >= 80 && (Date.parse(q) - Date.parse(d)) / SPREAD_DAYS <= 100; })))
    : null;
  const projectionInputs: Parameters<typeof computeProjections>[0] = {
    route,
    interestRunRate: projectionInterest,
    debtAtAnchor: debtExLeases([...balanceQuarterly, ...balanceAnnual].find((row) => isoDay(row.date) === projectionAnchorDate)),
    valuation,
    waccPct: returns.wacc.waccPct,
    dilutedShares: dilutedSharesProj,
    ...(projectionOutsideOwnership ? { forecastEpsWithheldReason: "Noncontrolling ownership or income is evidenced at the operating forecast anchor, but a future common-earnings allocation is unestablished. No book NCI or historical NCI-income amount is allocated to future EBIT or cash flows." }
      : projectionTemporaryClaim ? { forecastEpsWithheldReason: "Temporary equity (redeemable preferred or redeemable noncontrolling interests) is filed, or refused, at the operating forecast anchor, but a future common-earnings allocation is unestablished. Its carrying amount is not a dividend or earnings forecast and is not subtracted from forecast operating earnings." } : {}),
    incomeHistory: projectionIncomeHistory,
    incomeCadenceBarriers: projectionCadenceBarriers,
    fcfHistory: capital.fcf.series.map((r) => ({ date: r.date, fcf: r.fcf, fiscalYear: str(normalizeQuarterRows(cashflowAnnual).rows.find(row => isoDay(row.date) === r.date)?.fiscalYear) ?? str(normalizeQuarterRows(incomeAnnual).rows.find(row => isoDay(row.date) === r.date)?.fiscalYear) })),
    shareCountAnnualizedPct: capital.shareCount.annualizedPct,
    currency: projectionCurrency,
    asOf: asOfDay,
    // D-60: the remaining repurchase authorization for the EPS capital-return disclosure.
    capitalReturn: (() => {
      const capitalReturn = buildFilingDisclosures(bundle, route.cashFlowApplicability)?.capitalReturn ?? null;
      return capitalReturn === null ? null : {
        authorizationRemaining: capitalReturn.authorizationRemaining,
        source: (() => { const source=capitalReturn.authorizationRemainingSource ?? capitalReturn.source;
          return `${source.form} ${source.accession}, filed ${source.filingDate}${capitalReturn.authorizationRemainingAsOf ? `, authorization as of ${capitalReturn.authorizationRemainingAsOf}` : ""}`; })(),
        currentPrice: num(firstRow(bundle.quote)?.price),
      };
    })(),
  };
  const translatedProjectionInputs = foreignBasis ? translateProjectionInputs(projectionInputs, foreignBasis) : projectionInputs;
  const projections = computeProjections(translatedProjectionInputs);

  // Deterministic bull/base/bear price targets (2026-07-11 scenario-credibility
  // checkpoint). Reuses the SAME point-in-time anchors + ±σ construction as the
  // projection fan, so the target band and the fan agree; base IS the DCF fair
  // value. Financial routes instead stress their own common-return history
  // and persistence around the unchanged excess-return base (D-193). Missing
  // route evidence suppresses targets. assembleReport overwrites the judge's scenario
  // priceTargets from this — the LLM no longer authors the headline numbers.
  // The per-share bridge for the perturbed re-runs is the base DCF's own
  // (valuation.dcf.bridge, lease-adjusted by valueCompany), never the raw
  // figure held here.
  const scenarioTargets = computeScenarioTargets({
    route,
    valuation,
    valuationUse: fairValue.currentUse,
    waccPct: returns.wacc.waccPct,
    incomeHistory: translatedProjectionInputs.incomeHistory,
    currentPrice,
    currency: projectionCurrency,
    asOf: asOfDay,
  });
  const classApproximation = bundle.economicShareEvidence?.find(e => e.approximation && e.effectiveFrom <= asOfDay && (e.effectiveTo === null || e.effectiveTo > asOfDay))?.approximation;
  if (classApproximation) scenarioTargets.basis.push(classApproximation.basis);

  // Deterministic intrinsic per-share fair value (2026-07-11 DCF-credibility
  // checkpoint). Route-appropriate (FCFF DCF / excess-return), reused from
  // valueCompany — never recomputed. assembleReport overwrites the judge's
  // valuation.dcf.perShare + upsidePct from this; suppressed (never fabricated)
  // when no per-share model applies or the equity bridge is missing.
  // Audit 2026-10-22 F-13: an available value built on substituted inputs
  // carries a "degraded inputs" reason naming each substitution.
  if (classApproximation) {
    fairValue.basis.push(classApproximation.basis);
    fairValue.reference?.basis.push(classApproximation.basis);
  }

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
      modelEligibilityReason ?? lendingCashFlow?.reason ?? (route.overlays.includes("unprofitable")
        ? "FCFF DCF not meaningful — free cash flow is structurally negative (unprofitable overlay); see multiples for relative valuation"
        : `FCFF DCF not meaningful for ${route.base} - book/excess-return model used`),
    );
  }
  if (isSuppressed("evEbitda")) suppress("multiples.evToEbitda", lendingCashFlow?.reason ?? `EV/EBITDA excluded for ${route.base} — enterprise value ill-defined`);
  if (isSuppressed("currentRatio")) suppress("returns.currentRatio", `current ratio not meaningful for ${route.base}`);

  // Audit 2026-10-22 B-24: a results release later than every statement.
  const newer = newerResultsRelease(bundle);
  const newerResultsGaps: ManifestEntry[] = newer === null ? [] : [{ field: "fundamentals.newerResults", severity: "warn", reason: newerResultsSentence({
    source: { form: newer.release.form ?? "8-K", accession: newer.release.accession, exhibit: null, filingDate: newer.release.filingDate, url: null },
    reportedPeriod: newer.reportedPeriod, reportedPeriodEnd: newer.reportedPeriodEnd, statementsEnd: newer.statementsEnd,
  }) }];

  // Audit 2026-10-22 B-23: a 10-Q or 10-K on file that the statements do not reach.
  const newerFiling = newerPeriodicFiling(bundle);
  if (newerFiling !== null) newerResultsGaps.push({ field: "fundamentals.newerFiling", severity: "warn", reason: newerFilingSentence({
    source: { form: newerFiling.filing.form, accession: newerFiling.filing.accessionNumber, exhibit: null, filingDate: newerFiling.filing.filingDate, url: null },
    periodEnd: newerFiling.filing.reportDate.slice(0, 10), statementsEnd: newerFiling.statementsEnd,
  }) });

  // --- Merge all gaps + notes ------------------------------------------------
  const repairedCashBasisFields = new Set([...balanceAnnual, ...balanceQuarterly, ...rowsOf(bundle.statements.balanceAnnual), ...rowsOf(bundle.statements.balanceQuarterly)].filter(row => row.cashConflictReconciled)
    .map(row => `statements.balance.${row.date}.cashBasis`));
  const gaps = mergeManifest(
    newerResultsGaps,
    bundle.gaps.filter(g => !repairedCashBasisFields.has(g.field)),
    admittedFacts?.ok === false && bundle.edgar?.companyFacts?.ok ? [admittedFacts.gap] : [],
    ttmGaps,
    route.gaps,
    degradation.gaps,
    growth.gaps,
    returns.gaps,
    scoreGaps.filter(g => !/scores\.(?:quality\.roic|moat\.roic|balanceSheet\.netDebt)/.test(g.field) || balanceAnnual.some(row => row.cashConflictReconciled)),
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

  const scores = withAssessmentQualification(rawScores, { valuationUse: fairValue.currentUse,
    financialEvidence: financialEvidenceQualifications(gaps, returns.wacc.operatingIncomeEvidence ?? null),
  });

  // The 8-K forensic events belong with the forensic notes the report renders,
  // not in runStageB's own `notes`, which has no consumer.
  forensics.notes.push(...eventNotes);
  notes.push(...route.notes);
  return {
    symbol: bundle.symbol,
    builtAt: bundle.builtAt,
    ...(foreignBasis ? { valuationTranslation: foreignBasis } : {}),
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
        asOf: p.asOf ?? er.asOf,
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
        sources: [p.roteSource ?? "computed.returns.rote"],
        asOf: p.roteAsOf ?? computed.returns?.rote?.asOf ?? null,
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
        asOf: p.asOf ?? er.asOf,
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
        asOf: p.asOf ?? er.asOf,
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
  for (const row of rows) if (["pTbv","rote","justifiedPTbv","premiumToJustified"].includes(row.key)) row.basis += ` ${MODEL_TANGIBLE_COMMON_BASIS}`;
  return { route: fm.route, metrics: rows, notes, asOf };
}

// ---------------------------------------------------------------------------
// Returns block
// ---------------------------------------------------------------------------

function quoteInput(quote: FmpRawRow | null): QuoteInput {
  return { price: num(quote?.price), timestamp: num(quote?.timestamp) };
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
  const refusedOperating = cashflowQuarterly.slice(0, 4).find(row =>
    ["operatingCashFlow", "netCashProvidedByOperatingActivities"].some(field => row.fieldConflicts?.[field]?.usable === false));
  if (refusedOperating) return { ...runway, burning: null, avgQuarterlyBurn: null, runwayQuarters: null, estimatedExhaustionDate: null,
    notes: [...runway.notes, `Operating cash flow unresolved for recent quarter ${refusedOperating.date}; older quarters cannot substitute for the refused period.`],
    gaps: [...runway.gaps, { field: "runway.operatingCashFlowScope", severity: "warn", reason: `Runway withheld: recent-quarter operating cash flow at ${refusedOperating.date} is unresolved; no older-quarter burn extrapolation is substituted.` }] };
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

/**
 * D-173. A provider's annual balance-sheet feed can trail its annual income and
 * cash-flow feeds for days after an annual report is filed (AAPL, 2026-11-02: the
 * 10-K for the year ended 2026-09-26 had reached the annual income, annual cash-flow
 * and quarterly balance-sheet feeds, while the annual balance sheet still ended at
 * 2025-09-27, so Altman, Beneish, accruals and ROIC - WACC were withheld for the
 * newest year). A balance sheet is a point-in-time statement: the quarterly row
 * dated exactly at the newest annual income period end is that fiscal year's
 * closing balance. Only that one date is filled, only when the annual feed has no
 * row within the forensic alignment tolerance of it (a 52/53-week alias dated a few
 * days earlier is the same year) and nothing newer, only from the filing that
 * carries the annual income row (same period end and acceptance) in the same
 * labelled currency, and the fill is disclosed. The row still passes the debt
 * checks every annual row passes (D-174). Nothing is summed or estimated, and the
 * provider rows as fetched are unchanged.
 */
export function withFiscalYearEndBalance<TRow extends CurrencyEvidenceRow>(
  annual: readonly TRow[],
  quarterly: readonly TRow[],
  incomeAnnual: readonly CurrencyEvidenceRow[],
  gaps: ManifestEntry[],
  attemptedSources: readonly string[] = [STATEMENT_FAMILY.balanceAnnual.endpoint, STATEMENT_FAMILY.balanceQuarterly.endpoint],
): TRow[] {
  let newestIncome: CurrencyEvidenceRow | undefined;
  for (const row of incomeAnnual) {
    const day = isoDay(row.date);
    if (day !== null && (newestIncome === undefined || day > isoDay(newestIncome.date)!)) newestIncome = row;
  }
  if (newestIncome === undefined) return [...annual];
  const yearEnd = isoDay(newestIncome.date)!;
  const earliestSameYear = Date.parse(`${yearEnd}T00:00:00Z`) - FORENSIC_PERIOD_ALIGNMENT_TOLERANCE_DAYS * 86_400_000;
  const covered = annual.some(row => {
    const day = isoDay(row.date);
    return day !== null && Date.parse(`${day}T00:00:00Z`) >= earliestSameYear;
  });
  if (covered) return [...annual];
  const currency = normalizeReportedCurrency(newestIncome.reportedCurrency);
  const income = newestIncome;
  const closing = quarterly.find(row => sameFiling(row, income));
  if (closing === undefined || currency === null || normalizeReportedCurrency(closing.reportedCurrency) !== currency) return [...annual];
  gaps.push({
    field: "compute.balanceAnnual.fiscalYearEnd",
    reason: `The annual balance sheet has no row yet for the fiscal year ended ${yearEnd}, which the annual income statement already reports; ` +
      `the quarterly balance sheet from the same filing, dated ${yearEnd} (the same closing balance), is used for the annual calculations.`,
    severity: "info",
    attemptedSources: [...attemptedSources],
  });
  return [closing, ...annual];
}

// Re-export sourcedOf for the page layer's provenance stamping.
export { sourcedOf, rowsOf, valueOf };
