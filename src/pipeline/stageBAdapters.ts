/**
 * Stage B input adapters, split out of compute.ts: map provider statement rows to each Stage B
 * module's input row shape (growth, returns, capital, forensics, prices), carrying the common-earnings
 * scope and the filed-operand evidence each module reads (P5, P8, P13).
 */

import { operatingIncomeEvidenceForNonMargins, operatingIncomeForNonMargins, operatingMarginBasis } from "@/pipeline/incomeBasis";
import type { FmpBalanceSheetRow, FmpCashFlowRow, FmpIncomeStatementRow, FmpRawRow, FmpStatementRow } from "@/providers/fmp";
import { ACQUISITION_OTHER_PAYMENT_TAG, tagsFor } from "@/edgar/tagSynonyms";
import { type GrowthIncomeRow, type GrowthCashFlowRow } from "@/pipeline/stageB/growth";
import { type WaccOperatingEvidence, type ReturnsIncomeRow, type ReturnsBalanceRow } from "@/pipeline/stageB/returns";
import { type CapitalIncomeRow, type CoverageOperand, type CapitalCashFlowRow, type CapitalBalanceRow } from "@/pipeline/stageB/capital";
import { type ForensicsIncomeRow, type ForensicsBalanceRow, type ForensicsCashFlowRow } from "@/pipeline/stageB/forensics";
import { type OhlcvRow } from "@/pipeline/stageB/technicals";
import { temporaryEquityOperands } from "@/pipeline/stageB/seniorClaims";
import { incompleteLeaseCoverage, type LeaseEvidenceContext } from "@/pipeline/stageB/leaseScope";
import { type CommonIncomeInputs, type CommonIncomeFlowScope } from "@/pipeline/stageB/securityBasis";
import { resolveParentProfit, type ProfitScopeInputs } from "@/pipeline/stageB/ownership";
import { findPointForPeriod, tagPoints, type CompanyFacts } from "@/edgar/xbrl";
import { effectiveTaxOperands, filedTaxOperandPair } from "@/edgar/incomeClassification";
import { longTermDebtHoldsCurrent } from "@/edgar/statements";
import { isoDay, matchByDate, num, str } from "./bundleRows";

// ---------------------------------------------------------------------------
// Adapters — map FMP rows to each module's input row shape (structural, but we
// build explicit objects so a field rename upstream fails the typecheck here).
// ---------------------------------------------------------------------------

/** Keep the proof required by fiscal alias/whole-row recency admission. */
export function fiscalIdentity(r: FmpStatementRow) {
  return {
    cik: r.cik, reportedCurrency: r.reportedCurrency,
    fiscalYear: r.fiscalYear, calendarYear: r.calendarYear, period: r.period,
    periodStart: r.periodStart, accessionNumber: r.accessionNumber,
    link: r.link, finalLink: r.finalLink, fieldProvenance: r.fieldProvenance,
  };
}

export function toGrowthIncome(r: FmpIncomeStatementRow): GrowthIncomeRow {
  const operating = operatingMarginBasis(r);
  const parentProfit = resolveParentProfit(profitScopeInputs(r));
  return {
    ...fiscalIdentity(r),
    date: String(r.date ?? ""),
    // Restatement recency: without these, a duplicated fiscal period is
    // ambiguous and gets rejected wholesale instead of resolved.
    acceptedDate: str(r.acceptedDate),
    filingDate: str(r.filingDate),
    revenue: num(r.revenue),
    grossProfit: num(r.grossProfit),
    operatingIncome: operating.operatingIncome,
    operatingBasis: operating.basis,
    // D-238 (P5; D-108): the net margin is the parent's profit over revenue in every year of the series.
    netIncome: parentProfit.value,
    ...(parentProfit.value !== num(r.netIncome) ? { netIncomeBasis: `${parentProfit.reason} (${parentProfit.basis})` } : {}),
    epsDiluted: num(r.epsDiluted),
  };
}

export function toGrowthCashFlow(r: FmpCashFlowRow): GrowthCashFlowRow {
  return {
    ...fiscalIdentity(r),
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

export function commonFlowScope(row: FmpStatementRow, field: string, basis: "annual" | "quarter" | "ttm"): CommonIncomeFlowScope {
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

/** The entity scope of a row's `netIncome`: the admission's own statement, else the filed tags behind the figure. */
function netIncomeOwnership(row: FmpIncomeStatementRow): "parent" | "consolidated" | undefined {
  const tags = row.fieldProvenance?.netIncome?.tags ?? [];
  const consolidatedTag = tagsFor("netIncomeConsolidated").some(tag => tags.includes(`us-gaap/${tag}`));
  // Consolidated profit less the NCI share is the parent's figure (audit B-18).
  const nciDeducted = consolidatedTag && tagsFor("netIncomeAttributableToNoncontrollingInterest").some(tag => tags.includes(`us-gaap/${tag}`));
  return row.netIncomeOwnershipBasis === "parent" || row.netIncomeOwnershipBasis === "consolidated" ? row.netIncomeOwnershipBasis :
    nciDeducted ? "parent" : consolidatedTag ? "consolidated" :
      tags.includes("us-gaap/NetIncomeLoss") ? "parent" : undefined;
}

/** D-238 (P5): the row's profit lines by entity scope, for `resolveParentProfit` and `resolveConsolidatedProfit`. */
function profitScopeInputs(row: FmpIncomeStatementRow): ProfitScopeInputs {
  return { netIncome: num(row.netIncome), netIncomeOwnershipBasis: netIncomeOwnership(row),
    netIncomeConsolidated: num(row.netIncomeConsolidated), noncontrollingIncome: num(row.netIncomeAttributableToNoncontrollingInterest) };
}

export function commonIncomeEvidence(row: FmpIncomeStatementRow, basis: "annual" | "quarter", admissionAsOf?: string): CommonIncomeInputs {
  const ownership = netIncomeOwnership(row);
  return { netIncome: num(row.netIncome), netIncomeAvailableToCommon: num(row.netIncomeAvailableToCommon),
    admissionAsOf, targetScope: { issuerId: economicIssuerId(row), currency: str(row.reportedCurrency), periodStart: str(row.periodStart), periodEnd: str(row.date), basis },
    incomeScope: commonFlowScope(row, "netIncome", basis), commonIncomeScope: commonFlowScope(row, "netIncomeAvailableToCommon", basis),
    noncontrollingIncomeScope: commonFlowScope(row, "netIncomeAttributableToNoncontrollingInterest", basis),
    noncontrollingIncome: num(row.netIncomeAttributableToNoncontrollingInterest), netIncomeOwnershipBasis: ownership,
    netIncomeWithheldReason: row.netIncomeAttributableToNoncontrollingInterest != null && num(row.netIncomeAttributableToNoncontrollingInterest) === null ? "noncontrolling-income allocation is invalid or nonfinite in the source row" : null,
    commonIncomeWithheldReason: row.fieldConflicts?.netIncomeAvailableToCommon?.usable === false ? row.fieldConflicts.netIncomeAvailableToCommon.reason : null };
}

/** Preferred existence is not currency arithmetic; a closing zero cannot erase the flow window. */
export function preferredClaimsInFlow(scope: CommonIncomeFlowScope | undefined, balances: readonly FmpBalanceSheetRow[], cash: readonly FmpCashFlowRow[] = []): boolean {
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

export function toReturnsIncome(
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
    operatingIncome: operatingIncomeForNonMargins(r),
    // ROIC's EBIT is operating income; raw vendor EBIT may include other income.
    ebit: operatingIncomeForNonMargins(r),
    // D-237 (P13): ROIC reads this field only for the year's effective tax rate
    // and its sign, so it carries the provision's own base.
    incomeBeforeTax: effectiveTaxOperands(r).pretax,
    incomeTaxExpense: effectiveTaxOperands(r).tax,
    netIncome: num(r.netIncome),
  };
}

/** A legacy consolidated-total stand-in never establishes parent ownership. */
export function statementEquityOwnershipBasis(row: FmpBalanceSheetRow | null | undefined): "parent" | "consolidated" | undefined {
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

export function statementParentEquity(row: FmpBalanceSheetRow | null | undefined): number | null {
  return statementEquityOwnershipBasis(row) === "consolidated" ? null : num(row?.totalStockholdersEquity);
}

/** The three filed temporary-equity amounts of a balance row, without the refusals (those ride in the row's own `fieldConflicts`). */
export function temporaryEquityFields(row: FmpBalanceSheetRow) {
  const operands = temporaryEquityOperands(row);
  return {
    ...(operands.temporaryEquity !== undefined ? { temporaryEquity: operands.temporaryEquity } : {}),
    ...(operands.temporaryEquityAttributableToParent !== undefined ? { temporaryEquityAttributableToParent: operands.temporaryEquityAttributableToParent } : {}),
    ...(operands.temporaryEquityAttributableToNoncontrollingInterest !== undefined ? { temporaryEquityAttributableToNoncontrollingInterest: operands.temporaryEquityAttributableToNoncontrollingInterest } : {}),
  };
}

export function toReturnsBalance(r: FmpBalanceSheetRow): ReturnsBalanceRow {
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
    preferredCapitalWithheldReason: r.preferredCapitalWithheldReason,
    preferredCapitalBasis: r.preferredCapitalBasis,
    // FIN-119-V1: temporary equity is financing capital (and its refusals ride in `fieldConflicts` above).
    ...temporaryEquityFields(r),
    cashBasis: r.cashBasis,
    cashConflictReconciled: r.cashConflictReconciled,
    cashAndShortTermInvestments: num(r.cashAndShortTermInvestments),
    totalAssets: num(r.totalAssets),
  };
}

/** D-282 (P19): interest expense established for the row's own period end:
 * the filed amount replaced the vendor's, or the vendor's agrees with it. */
export function filedInterestOperand(row: FmpIncomeStatementRow): boolean {
  const end = isoDay(row.date);
  if (end === null || row.fieldConflicts?.interestExpense?.usable === false) return false;
  const corrected = row.fieldProvenance?.interestExpense;
  return corrected?.source === "edgar" && corrected.periodEnd === end || row.interestExpenseAgreement?.periodEnd === end;
}

/** D-300 (P8, P12; review round 1): the tax rate's operands are established for the row's own period:
 * each was replaced by the filed amount, or the vendor's agrees with the reconciled filed family. */
export function filedTaxOperands(row: FmpIncomeStatementRow): boolean {
  return filedTaxOperandPair(row) !== null;
}

/** D-282: EBIT is established only when the selected operating numerator is the filed or reconciled one. */
export function filedCoverageOperands(row: { operatingIncome?: number | null; operatingIncomeEvidence?: WaccOperatingEvidence },
  selectedEbit: number | null, interestFiled: boolean): CoverageOperand[] {
  const ebitFiled = selectedEbit !== null && selectedEbit === num(row.operatingIncome) && row.operatingIncomeEvidence?.status === "filed-or-reconciled";
  return [...(ebitFiled ? ["ebit" as const] : []), ...(interestFiled ? ["interestExpense" as const] : [])];
}

export function toCapitalIncome(r: FmpIncomeStatementRow): CapitalIncomeRow {
  return {
    filedCoverageOperands: filedCoverageOperands({ operatingIncome: r.operatingIncome, operatingIncomeEvidence: operatingIncomeEvidenceForNonMargins(r) },
      operatingIncomeForNonMargins(r), filedInterestOperand(r)),
    ...fiscalIdentity(r),
    date: String(r.date ?? ""),
    acceptedDate: str(r.acceptedDate),
    filingDate: str(r.filingDate),
    revenue: num(r.revenue),
    operatingIncome: operatingIncomeForNonMargins(r),
    // Coverage and own-computed EBITDA share the operating-income basis.
    ebit: operatingIncomeForNonMargins(r),
    ebitda: num(r.ebitda),
    interestExpense: num(r.interestExpense),
    // D-238 (P5): the scope of this net income travels with it; the FCF series reads consolidated profit.
    ...profitScopeInputs(r),
    weightedAverageShsOutDil: num(r.weightedAverageShsOutDil),
    weightedAverageShsOut: num(r.weightedAverageShsOut),
  };
}

export function toCapitalCashFlow(r: FmpCashFlowRow): CapitalCashFlowRow {
  return {
    reportedCurrency: str(r.reportedCurrency),
    fieldProvenance: r.fieldProvenance,
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

export function toCapitalBalance(r: FmpBalanceSheetRow, leaseEvidenceContext: LeaseEvidenceContext): CapitalBalanceRow {
  return {
    reportedCurrency: r.reportedCurrency,
    leaseEvidenceContext,
    fieldProvenance: r.fieldProvenance,
    fieldConflicts: r.fieldConflicts,
    shortTermDebt: num(r.shortTermDebt), longTermDebt: num(r.longTermDebt),
    date: String(r.date ?? ""),
    acceptedDate: str(r.acceptedDate),
    filingDate: str(r.filingDate),
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
    cashBasis: r.cashBasis,
    cashConflictReconciled: r.cashConflictReconciled,
    cashAndShortTermInvestments: num(r.cashAndShortTermInvestments),
    ...(num(r.marketableEquitySecurities) !== null ? { marketableEquitySecurities: num(r.marketableEquitySecurities) } : {}),
  };
}

export function toForensicsIncome(r: FmpIncomeStatementRow): ForensicsIncomeRow {
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
    operatingIncome: operatingIncomeForNonMargins(r),
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

export function toForensicsBalance(r: FmpBalanceSheetRow): ForensicsBalanceRow {
  return {
    fieldProvenance: r.fieldProvenance,
    fieldConflicts: r.fieldConflicts,
    reportedCurrency: r.reportedCurrency,
    cik: r.cik,
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
    longTermDebt: (r.fieldProvenance?.longTermDebt?.calculation !== "same-filing-debt-completed" && longTermDebtHoldsCurrent(r.fieldProvenance?.longTermDebt?.tags)) ? null : num(r.longTermDebt),
    // Audit 2026-10-22 E-8: kept with its tags for the Piotroski leverage direction.
    longTermDebtComposed: (r.fieldProvenance?.longTermDebt?.calculation !== "same-filing-debt-completed" && longTermDebtHoldsCurrent(r.fieldProvenance?.longTermDebt?.tags)) && num(r.longTermDebt) !== null
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

export function toForensicsCashFlow(r: FmpCashFlowRow): ForensicsCashFlowRow {
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
export function withFiledForensicContext(
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
      const second = annualTaggedValue(facts, ACQUISITION_OTHER_PAYMENT_TAG, row.date, currency);
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

export function toOhlcv(r: FmpRawRow): OhlcvRow {
  return {
    date: String(r.date ?? ""),
    open: num(r.open) ?? 0,
    high: num(r.high) ?? 0,
    low: num(r.low) ?? 0,
    close: num(r.close) ?? 0,
    volume: num(r.volume),
  };
}
