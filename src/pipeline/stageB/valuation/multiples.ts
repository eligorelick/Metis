/** Comparable multiples, enterprise value and own history; preserve operand scope and period (P1, P5, P13; D-103, D-112). */
import { type SectorRoute, type ManifestEntry } from "@/types/core";
import { fmtMoney, isNum, MIN_PEERS_FOR_STATS, FULL_OWN_HISTORY_OBS, posOrNull, safeDiv, gapEntry, MIN_HISTORY_OBS_FOR_BAND, zeroAsNull, financeLeaseOnlyTotal, fmtGrouped, financeLeaseOnlyEvClause, fmtNum } from "./primitives";
import { type CommonIncomeInputs, type PreferredCapitalInputs, type SecurityBasisEvidence, type EconomicShareEvidence, type EconomicEquityScope, preferredCapitalRefusal, constructCommonIncomeQuarterWindow, commonHolderCapital, resolveEconomicEquityScope, resolveSecurityBasis } from "@/pipeline/stageB/securityBasis";
import { type LeaseEvidenceContext, type LeaseFieldEvidence, leaseDebtScopeRefusal, incompleteLeaseCoverage, leaseEvidenceNote } from "@/pipeline/stageB/leaseScope";
import { type ReitSubmap } from "@/pipeline/stageB/sectorRouting";
import { quantile, medianOf, percentileRank } from "./statistics";
import { temporaryEquityClaims } from "@/pipeline/stageB/seniorClaims";
import { noncontrollingOwnershipUnresolved } from "@/pipeline/stageB/ownership";
import { normalizeQuarterRows, contiguousQuarterWindows } from "@/pipeline/stageB/quarterWindows";
import { latestOnOrBeforeWithin, STATEMENT_DATE_MARKET_VALUE_MAX_AGE_DAYS } from "@/pipeline/stageB/asOfSelection";
import { deriveFcf } from "@/pipeline/stageB/financialValues";
import { resolveNetDebt, operatingLeaseScopeUnproven, leaseDebtConflict } from "@/pipeline/stageB/netDebt";
import { comparePriceCurrency } from "@/pipeline/stageB/priceCurrency";
import { comparablePeers } from "@/pipeline/stageB/peerComparability";


// ---------------------------------------------------------------------------
// Multiples framework
// ---------------------------------------------------------------------------

export type MultipleKey =
  | "peTtm"
  | "evToEbitda"
  | "evToSales"
  | "priceToFcf"
  | "priceToBook"
  | "priceToTbv"
  | "priceToFfo"
  | "priceToAffo";

/** Sector -> valid multiples (banks NEVER get EV multiples). */
export const SECTOR_APPROPRIATE_MULTIPLES: Record<SectorRoute, MultipleKey[]> = {
  general: ["peTtm", "evToEbitda", "evToSales", "priceToFcf", "priceToBook"],
  bank: ["peTtm", "priceToTbv", "priceToBook"],
  insurer: ["priceToBook", "peTtm", "priceToTbv"],
  reit: ["priceToFfo", "priceToAffo"],
  "reit-mortgage": ["priceToBook", "peTtm", "priceToTbv"],
};

export interface MultiplesQuoteInputs {
  price: number | null;
  /** Main price valuation day, not report build or fetch time. */
  priceAsOf?: string | null;
  marketCap: number | null;
  /** Listing/trading currency (e.g. "USD"). */
  currency?: string | null;
  isAdr?: boolean | null;
  issuerId?: string;
  securityId?: string;
  /** Aggregate common cap; ADR quote class alone does not establish this scope. */
  marketCapSecurityBasis?: "issuer-common" | "quoted-security" | "unresolved";
  marketCapScopeEvidence?: { reason: string; sourceIds: string[] };
}

/** One admitted common-income component; no second ownership allocation. */
export interface CommonIncomeQuarter {
  period: string;
  periodStart: string | null;
  value: number;
  /** How a non-standalone quarter was derived from filed flows; null = a direct filed (or provider) quarter. */
  derivation: string | null;
  /** The filings behind the value; null = provider-supplied, no filing basis. */
  filings: { form: string; filed: string }[] | null;
}

const QUARTER_DERIVATION_TEXT: Record<string, string> = {
  "fy-minus-ytd": "fiscal year less nine months",
  "ytd-difference": "year-to-date difference",
  "fy-minus-quarters": "fiscal year less the other three quarters",
};

/* Describe one quarter of the P/E bridge in reader terms. */
function commonIncomeQuarterText(q: CommonIncomeQuarter): string {
  const parts = [`quarter ended ${q.period}`];
  if (q.derivation !== null) parts.push(QUARTER_DERIVATION_TEXT[q.derivation] ?? q.derivation);
  parts.push(q.filings === null || q.filings.length === 0 ? "provider-supplied, no filing basis"
    : q.filings.map((f) => `${f.form} filed ${f.filed}`).join(" and "));
  return `${fmtMoney(q.value)} (${parts.join("; ")})`;
}

/** TTM income statement slice (FMP names). */
export interface MultiplesIncomeTtm extends CommonIncomeInputs {
  date: string;
  /**
   * Period basis of this slice: "ttm" (4 complete quarters) or "annual"
   * (latest FY substituted when TTM was suppressed — incomplete quarterly
   * data). Drives honest basis labels on the multiples; defaults to "ttm"
   * when absent (legacy callers).
   */
  basis?: "ttm" | "annual";
  /** D-112 (multiple labels by period): the annual row's own fiscal year, which names an annual-basis multiple. */
  fiscalYear?: string | null;
  revenue: number | null;
  operatingIncome: number | null;
  /** D-98 (gain-inflated earnings): pre-tax income, to measure how much of it is non-operating. */
  incomeBeforeTax?: number | null;
  depreciationAndAmortization?: number | null;
  netIncome: number | null;
  epsDiluted: number | null;
  /** Explicit construction from the adapter; absent for reported annual EPS. */
  epsDilutedBasis?: "sum-quarterly-diluted-eps" | null;
  netIncomeAvailableToCommon?: number | null;
  /** The same admitted four quarters used by the TTM common-income selector. */
  commonIncomeQuarters?: CommonIncomeQuarter[];
  preferredDividendsPaid?: number | null;
  noncontrollingIncome?: number | null;
  netIncomeOwnershipBasis?: "parent" | "consolidated";
  epsSecurityBasis?: "ordinary" | "quoted";
  /** D-103: the caveat when this slice's D&A was composed from separate lines (a lower bound). */
  dAndALowerBound?: string | null;
}

/** TTM cash-flow slice (FMP names; capitalExpenditure is NEGATIVE). */
export interface MultiplesCashFlowTtm {
  date: string;
  /** Period basis — see MultiplesIncomeTtm.basis. */
  basis?: "ttm" | "annual";
  operatingCashFlow: number | null;
  capitalExpenditure: number | null;
  depreciationAndAmortization?: number | null;
  /** The latest annual cash-flow row's D&A and date, beside a TTM slice: a fiscal-year operating income's own-period D&A. */
  annualDepreciationAndAmortization?: { date: string; value: number | null } | null;
}

/** Latest balance sheet slice (FMP names). */
export interface MultiplesBalance extends PreferredCapitalInputs {
  shortTermDebt?: number | null;
  longTermDebt?: number | null;
  reportedCurrency?: string | null;
  leaseEvidenceContext?: LeaseEvidenceContext;
  fieldProvenance?: Record<string, LeaseFieldEvidence>;
  /** The admission's refusals, so a refused total debt is named (KNW-04). */
  fieldConflicts?: Record<string, { usable?: boolean; reason?: string } | undefined>;
  date: string;
  /**
   * Which statement period the row came from: "quarter" (latest quarterly balance sheet — the
   * preferred point-in-time anchor, P1) or "annual" (whole-row fallback). Drives honest basis labels;
   * absent on legacy callers ⇒ generic "latest" label.
   */
  basis?: "quarter" | "annual";
  totalDebt: number | null;
  cashAndCashEquivalents?: number | null;
  shortTermInvestments?: number | null;
  cashAndShortTermInvestments: number | null;
  /**
   * D-65: the filed fair value of marketable equity securities inside cash and
   * short-term investments (D-60). The multiples' EV nets the same canonical
   * net cash as the DCF bridge and the key-data box, so equity stakes are not
   * cash here either.
   */
  marketableEquitySecurities?: number | null;
  totalStockholdersEquity: number | null;
  /** Consolidated equity can establish outside ownership without sizing a market NCI claim. */
  totalEquity?: number | null;
  goodwill: number | null;
  intangibleAssets: number | null;
  tangibleBookDeductionBasis?: string;
  minorityInterest: number | null;
  preferredStock: number | null;
  /**
   * D-135: temporary equity (redeemable preferred and redeemable NCI), read through
   * `temporaryEquityClaims`. Absent => none filed on this row.
   */
  temporaryEquity?: number | null;
  temporaryEquityAttributableToParent?: number | null;
  temporaryEquityAttributableToNoncontrollingInterest?: number | null;
  commonEquity?: number | null;
  equityOwnershipBasis?: "parent" | "consolidated";
  /*
   * D-19: TOTAL lease liabilities (FMP `capitalLeaseObligations`, which carries the operating AND
   * finance lease liability; the EDGAR statements builder resolves the same field). FMP's
   * `totalDebt` is documented as shortTermDebt + longTermDebt + capitalLeaseObligations, so this
   * figure is ALREADY inside `totalDebt`. Context for the bridge's disclosure only — the EV
   * adjustment reads `operatingLeaseLiability` below, never this.
   */
  capitalLeaseObligations?: number | null;
  financeLeaseLiability?: number | null;
  /*
   * D-19: the OPERATING slice of the lease liability, the ONLY slice the EV bridge may remove.
   * Under ASC 842 operating-lease cost stays in operating expenses, so EBIT and EBITDA are already
   * AFTER it; finance-lease cost is split between right-of-use amortisation (added back in EBITDA
   * but included in EBIT) and interest (below EBIT), and the finance-lease liability is debt in
   * both frames. Null when the split is unavailable (the FMP route publishes one combined figure):
   * enterprise value is then reported as-is and the `enterpriseValue.leases` gap says so, rather
   * than removing an unknown mix of operating and finance leases.
   */
  operatingLeaseLiability?: number | null;
}

/** Quarterly fundamentals merged per quarter by the caller (FMP names). */
export interface QuarterlyFundamentalsRow extends CommonIncomeInputs, PreferredCapitalInputs {
  fieldProvenance?: import("../leaseScope").LeaseScopeRow["fieldProvenance"];
  shortTermDebt?: number | null;
  longTermDebt?: number | null;
  date: string;
  acceptedDate?: unknown;
  filingDate?: unknown;
  revenue: number | null;
  operatingIncome: number | null;
  depreciationAndAmortization: number | null;
  netIncome: number | null;
  /** Only explicit quoted-security EPS evidence can enter a price/EPS history. */
  epsDiluted?: number | null;
  epsSecurityBasis?: "quoted";
  netIncomeAvailableToCommon?: number | null;
  preferredDividendsPaid?: number | null;
  noncontrollingIncome?: number | null;
  netIncomeOwnershipBasis?: "parent" | "consolidated";
  operatingCashFlow: number | null;
  capitalExpenditure: number | null;
  totalStockholdersEquity: number | null;
  totalEquity?: number | null;
  commonEquity?: number | null;
  equityOwnershipBasis?: "parent" | "consolidated";
  /**
   * INCOME-statement D&A only. `depreciationAndAmortization` above may fall
   * back to the cash-flow figure, which is a different quantity; the REIT FFO
   * history must use the same basis as the current ffoApprox.
   */
  incomeDepreciationAndAmortization?: number | null;
  /**
   * Balance components of the HOUSE enterprise value, so the own-history EV is
   * built from the same definition as the current one. FMP's
   * `enterpriseValue` omits preferred stock and minority interest and nets only
   * cash, so ranking today's house EV against a history of vendor EVs compared
   * two different quantities.
   */
  totalDebt?: number | null;
  cashAndCashEquivalents?: number | null;
  shortTermInvestments?: number | null;
  capitalLeaseObligations?: number | null;
  financeLeaseLiability?: number | null;
  cashAndShortTermInvestments?: number | null;
  /** D-65: that quarter's filed marketable equity securities inside cash and short-term investments, so the own-history EV nets the same cash as the current one. */
  marketableEquitySecurities?: number | null;
  preferredStock?: number | null;
  minorityInterest?: number | null;
  /**
   * D-135: the quarter's temporary equity (read through `temporaryEquityClaims`) and any refusal of
   * it.
   */
  temporaryEquity?: number | null;
  temporaryEquityAttributableToParent?: number | null;
  temporaryEquityAttributableToNoncontrollingInterest?: number | null;
  fieldConflicts?: Record<string, { usable?: boolean; reason?: string } | undefined>;
  /*
   * D-19: the quarter's OPERATING lease liability, so the own-history EV carries the SAME lease
   * adjustment as the current one. A lease-adjusted current multiple ranked against an unadjusted
   * history compared two definitions and biased the printed rank. Null when the quarter's balance
   * sheet does not resolve the split — the window's EV multiples are then dropped rather than
   * ranked on the wrong basis.
   */
  operatingLeaseLiability?: number | null;
}

/** FMP /stable/enterprise-values row (quarterly history). */
export interface EnterpriseValuesRow {
  date: string;
  marketCapitalization: number | null;
  enterpriseValue: number | null;
  sourceId?: string;
  stockPrice?: number | null;
  /** Explicit historical quote currency; never borrowed from today's profile. */
  priceCurrency?: string | null;
}

/** Pre-baked vendor ratio history (FMP key-metrics / ratios quarterly rows). */
export interface VendorMultiplesRow {
  date: string;
  evToSales?: number | null;
  evToEBITDA?: number | null;
  priceToEarningsRatio?: number | null;
  priceToBookRatio?: number | null;
  priceToFreeCashFlowRatio?: number | null;
}

/** Peer multiples computed upstream from validated quotes and raw statements. */
export interface PeerMultiples {
  symbol: string;
  multiples: Partial<Record<MultipleKey, number | null>>;
  economicEvidence?: import("@/pipeline/stageB/peerComparability").PeerEconomicEvidence;
}

export interface MultiplesFrameworkInputs {
  /** An open filed/vendor annual definition conflict invalidates revenue multiples. */
  revenueEligibilityReason?: string | null;
  quote: MultiplesQuoteInputs;
  /** Statements' reportedCurrency — mismatch vs quote.currency flags the ADR case. */
  reportedCurrency?: string | null;
  incomeTtm: MultiplesIncomeTtm | null;
  cashFlowTtm: MultiplesCashFlowTtm | null;
  balance: MultiplesBalance | null;
  /** Retained, effective-dated evidence only; never a static guessed ratio. */
  securityBasis?: SecurityBasisEvidence[];
  securityBasisAsOf?: string;
  economicShareEvidence?: EconomicShareEvidence[];
  /** Quarterly merged fundamentals (>= 8 rows enables derived TTM history). */
  quarterlyFundamentals?: QuarterlyFundamentalsRow[];
  enterpriseValuesHistory?: EnterpriseValuesRow[];
  /** Vendor pre-baked ratio history — used only when derivation impossible AND currencies match. */
  keyMetricsHistory?: VendorMultiplesRow[];
  peers?: PeerMultiples[];
  subjectEconomicEvidence?: import("@/pipeline/stageB/peerComparability").PeerEconomicEvidence;
  /** Dated quote/analysis observation for point-in-time comparability evidence. */
  peerComparisonAsOf?: string;
  peerCoverage?: import("@/pipeline/peers").PeerCoverage;
  /** REIT-only: FFO/AFFO totals provided by the caller (labeled approximate upstream). */
  ffoApprox?: number | null;
  affoApprox?: number | null;
  /** Explicitly undetermined subtype withholds equity-REIT current/history/peer multiples. */
  reitSubmap?: ReitSubmap | null;
  /**
   * REIT-only: true when the CURRENT FFO is the plain net income + total D&A
   * construction — the only definition the own-history series can rebuild
   * from quarterly statements. A NAREIT FFO that netted property-sale gains,
   * impairments or real-estate-only depreciation is a different quantity, and
   * ranking it inside a net-income-plus-D&A history biased the rank; the P/FFO
   * and P/AFFO bands are withheld in that case with a disclosing gap.
   */
  ffoHistoryComparable?: boolean;
  /** Separate from FFO: recurring capex or rent adjustments cannot be ranked against all-capex history. */
  affoHistoryComparable?: boolean;
  /*
   * D-19: keep the OPERATING-lease liability in enterprise value (METIS_EV_INCLUDE_LEASES=1). OFF
   * by default, because under US GAAP (ASC 842) the operating-lease cost stays in operating
   * expenses, so EBIT and EBITDA are already AFTER it — adding that liability to EV as well would
   * double-count the leases in EV/EBITDA. It never touches the FINANCE-lease liability: its
   * interest is below EBIT, while EBITDA adds back its amortisation, so it remains financing debt
   * in both frames.
   */
  includeLeasesInEv?: boolean;
}

/* D-19, D-228, D-296: State the configured lease basis consistently wherever enterprise value is presented. */
export const EV_LEASE_SETTING_TEXT = {
  excluded: " (house default; set METIS_EV_INCLUDE_LEASES=1 to keep it)",
  included: " (METIS_EV_INCLUDE_LEASES=1)",
} as const;

/*
 * D-19: the EV bridge, both ways, with the convention stated. Only the OPERATING slice ever moves
 * between the two.
 */
export interface EnterpriseValueBridge {
  /** Optional for reports serialized before scope metadata was introduced. */
  equityScope?: EconomicEquityScope;
  noncontrollingInterestBasis?: "book-value-proxy" | "none-disclosed" | "unknown-allocation";
  nonOperatingHoldingsScope?: "not-comprehensively-resolved";
  /** The EV actually used by the EV multiples. */
  value: number | null;
  /** EV with the OPERATING lease liability removed (the house default). */
  excludingLeases: number | null;
  /** EV as reported: every lease liability left inside totalDebt. */
  includingLeases: number | null;
  /*
   * D-19: The liability actually removed by `excludingLeases` — the OPERATING slice only. Null when
   * the split is unavailable, in which case EV is reported as-is and the leases gap states the
   * reason.
   */
  leaseLiability: number | null;
  /** Operating + finance lease liability where disclosed; context only. */
  totalLeaseLiability?: number | null;
  /** Finance slice, which stays inside EV on BOTH bases; context only. */
  financeLeaseLiability?: number | null;
  includeLeases: boolean;
  basis: string;
}

export interface OwnHistoryBand {
  /** Current value on the selected derived history's construction; optional on legacy results. */
  rankedCurrent?: { value: number | null; construction: "capitalization-common-income" };
  /** Empirical percentile rank (0-100) in this finite sample, not an ordinal rank. */
  percentileRank: number | null;
  /**
   * 5th percentile of up to 20 quarterly observations. NOTE: because the window
   * caps at 20 (deriveOwnHistory), the quantile index 0.05·(n−1) stays inside the
   * OUTERMOST cell for all n ≤ 20 — so p5 tracks the near-minimum (2nd-smallest
   * obs), NOT a stable tail percentile. Read together with `lowSample`.
   */
  p5: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  /** 95th percentile — same caveat as p5: tracks the near-maximum at these sizes. */
  p95: number | null;
  observations: number;
  /** Optional for legacy serialized results; values are in the original sample order. */
  observationDetails?: OwnHistoryObservation[];
  basis: string;
  /**
   * True when the window is shorter than a full 5 years (< 20 quarters), i.e. the
   * p5/p95 tails are especially thin. When true the basis carries a LOW SAMPLE note.
   */
  lowSample?: boolean;
}

export interface OwnHistoryObservation {
  periodEnd: string;
  /** Actual dated market-cap observation; vendor ratios do not establish it. */
  marketDate: string | null;
  value: number;
  source: "raw-statements" | "vendor-ratio";
  marketCapSourceId?: string;
}

export interface PeerStats {
  median: number | null;
  min: number | null;
  max: number | null;
  count: number;
}

export interface MultipleStat {
  key: MultipleKey;
  /** Current multiple; null = n/m (negative/zero denominator or missing input). */
  current: number | null;
  basis: string;
  earningsDenominator?: { value: number; currency: string; period: string; quarters: CommonIncomeQuarter[] };
  /** A retained numerator/denominator ownership mismatch, not a parent allocation. */
  ownershipScope?: string;
  historyScope?: string;
  ownHistory: OwnHistoryBand | null;
  peers: PeerStats | null;
  /**
   * D-98 (gain-inflated earnings): set on the P/E when non-operating income is more than
   * GAIN_INFLATED_NON_OPERATING_SHARE of pre-tax income. The grade then ranks the next own-history
   * multiple and the report caveats the P/E.
   */
  gainInflatedEarnings?: { nonOperatingSharePct: number; basis: string };
  /**
   * D-103 (D&A from separate lines): set on EV/EBITDA when the EBITDA's D&A was composed from separate
   * lines, a lower bound; the report caveats the row. Unlike the P/E caveat, the own-history rank
   * stays: the history is built the same way.
   */
  ebitdaLowerBound?: { basis: string };
  /**
   * D-112 (multiple labels by period): the statement period an income-derived multiple's denominator
   * covers: "TTM to <date>" for four summed quarters, or "FY<year>" when TTM was suppressed and the
   * latest annual row stands in. Labels are derived from it.
   */
  period?: string;
}

/** Share of pre-tax income above which non-operating income makes the P/E unrepresentative. */
export const GAIN_INFLATED_NON_OPERATING_SHARE = 0.25;

/** D-98 needs finite operating/pre-tax operands and positive pre-tax income. */
export function nonOperatingShareOfPretax(pretax: unknown, operating: unknown): number | null {
  return typeof pretax === "number" && Number.isFinite(pretax) && pretax > 0
    && typeof operating === "number" && Number.isFinite(operating) ? (pretax - operating) / pretax : null;
}

export interface MultiplesResult {
  multiples: MultipleStat[];
  peerCoverage?: import("@/pipeline/peers").PeerCoverage;
  /** D-19: the enterprise-value bridge, both ways. */
  enterpriseValue: EnterpriseValueBridge;
  sectorAppropriate: MultipleKey[];
  asOf: { quote: string | null; statements: string | null };
  notes: string[];
  gaps: ManifestEntry[];
}

/** Trimmed peer stats: drop n/m and 1.5x-IQR outliers; suppress below 4 survivors. */
function peerStats(values: (number | null | undefined)[], notes: string[], key: string): PeerStats | null {
  const clean = values.filter((v): v is number => isNum(v) && v > 0);
  if (clean.length === 0) return null;
  const q1 = quantile(clean, 0.25);
  const q3 = quantile(clean, 0.75);
  let trimmed = clean;
  if (q1 !== null && q3 !== null) {
    const iqr = q3 - q1;
    trimmed = clean.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
  }
  if (trimmed.length < MIN_PEERS_FOR_STATS) {
    notes.push(
      `${key}: only ${trimmed.length} usable peers after n/m + 1.5x-IQR trim — peer comparison suppressed (house rule: never show a <${MIN_PEERS_FOR_STATS}-peer median)`,
    );
    return null;
  }
  return {
    median: medianOf(trimmed),
    min: Math.min(...trimmed),
    max: Math.max(...trimmed),
    count: trimmed.length,
  };
}

type HistorySeries = Partial<Record<MultipleKey, number[]>>;

interface OwnHistoryDerivation {
  series: HistorySeries;
  details: Partial<Record<MultipleKey, OwnHistoryObservation[]>>;
  observations: number;
  rejectedPeriods: Array<{ period: string; reason: string }>;
  rejectedWindows: Array<{ anchor: string; reason: string }>;
  unusableWindows: Array<{ anchor: string; reason: string }>;
  /*
   * D-19: windows whose EV could not be put on the current EV's lease basis (no operating-lease
   * liability on that quarter's balance sheet while the current EV removes one). Their EV multiples
   * are dropped.
   */
  leaseBasisMismatchWindows: string[];
  leaseScopeRejectedWindows: Array<{ anchor: string; reason: string }>;
  /**
   * D-135: windows whose temporary-equity operand is refused; their EV is dropped and the vendor EV
   * ratios may not stand in.
   */
  temporaryEquityRejectedWindows: Array<{ anchor: string; reason: string }>;
  cashOwnershipRejectedWindows: string[];
}

const DERIVED_HISTORY_KEYS: readonly MultipleKey[] = [
  "evToSales",
  "evToEbitda",
  "peTtm",
  "priceToFcf",
  "priceToBook",
];

// A consolidated/parent difference proves outside ownership, never its market value. The test is the P5 owner's
// (`noncontrollingOwnershipUnresolved`, src/pipeline/stageB/ownership.ts; D-248); compute.ts reads the same one.

/**
 * D-97 (zero NCI): known NCI at or below this share of consolidated equity cannot move a
 * parent-common cash multiple; without the floor a few million of NCI against billions of equity
 * withheld P/FCF and its whole history. The NCI share of earnings must be as small, and known: a
 * stake bought out before the balance date leaves a zero balance but still earned its share of the
 * cash flow, so an ending balance alone cannot bound it.
 */
const IMMATERIAL_NCI_SHARE_OF_EQUITY = 0.01;

function immaterialNoncontrollingInterest(row: { totalEquity?: number | null; minorityInterest?: number | null } | null, noncontrollingIncome?: number | null): boolean {
  if (!isNum(row?.minorityInterest) || !isNum(row?.totalEquity) || row.totalEquity <= 0) return false;
  const floor = row.totalEquity * IMMATERIAL_NCI_SHARE_OF_EQUITY;
  return Math.abs(row.minorityInterest) <= floor && isNum(noncontrollingIncome) && Math.abs(noncontrollingIncome) <= floor;
}

/** D-135: the redeemable preferred (and unsplit) part of a row's admitted temporary equity. */
function temporaryParentLike(row: Parameters<typeof temporaryEquityClaims>[0]): number {
  const claims = temporaryEquityClaims(row);
  return claims !== null && claims.refusal === null ? claims.redeemablePreferred + claims.unsplit : 0;
}

function temporaryEquityRefused(row: Parameters<typeof temporaryEquityClaims>[0]): boolean {
  return temporaryEquityClaims(row)?.refusal != null;
}

/**
 * D-135: a filed (or refused) temporary-equity claim is a claim senior to common, like preferred
 * and book NCI.
 */
function hasTemporaryEquityClaim(row: Parameters<typeof temporaryEquityClaims>[0]): boolean {
  const claims = temporaryEquityClaims(row);
  return claims !== null && (claims.refusal !== null || claims.total !== 0);
}

/**
 * D-135: temporary equity in the P/FCF cash-ownership guard. A refused operand, a redeemable
 * preferred and an unsplit amount block with no floor, as permanent preferred does. A redeemable
 * NCI is the same claim as book NCI, so it blocks unless the COMBINED NCI (book plus redeemable,
 * each by magnitude) and the NCI income both pass the book-NCI materiality floor.
 */
function temporaryEquityBlocksCashOwnership(row: Parameters<typeof temporaryEquityClaims>[0] & { totalEquity?: number | null; minorityInterest?: number | null; noncontrollingIncome?: number | null }): boolean {
  const claims = temporaryEquityClaims(row);
  if (claims === null) return false;
  if (claims.refusal !== null || claims.redeemablePreferred !== 0 || claims.unsplit !== 0) return true;
  if (claims.redeemableNoncontrolling === 0) return false;
  // A null book NCI is no claim at main; the floor then applies to the redeemable NCI alone (D-135).
  const book = isNum(row?.minorityInterest) ? Math.abs(row.minorityInterest) : 0;
  return !immaterialNoncontrollingInterest(
    { totalEquity: row?.totalEquity, minorityInterest: book + Math.abs(claims.redeemableNoncontrolling) },
    row?.noncontrollingIncome,
  );
}

/*
 * D-135: For cash ownership, a redeemable NCI beside absent book NCI is bounded by
 * `temporaryEquityBlocksCashOwnership`, while NCI income must independently pass the materiality
 * floor. Without redeemable NCI, use the ordinary book-NCI test.
 */
function bookNciImmaterial(row: (Parameters<typeof temporaryEquityClaims>[0] & { totalEquity?: number | null; minorityInterest?: number | null }) | null, noncontrollingIncome?: number | null): boolean {
  const redeemable = temporaryEquityClaims(row);
  const redeemableOnly = !isNum(row?.minorityInterest) && redeemable !== null && redeemable.refusal === null && redeemable.redeemableNoncontrolling !== 0;
  return immaterialNoncontrollingInterest(redeemableOnly ? { ...row, minorityInterest: 0 } : row, noncontrollingIncome);
}

function unresolvedCashOwnership(row: Parameters<typeof noncontrollingOwnershipUnresolved>[0] & Parameters<typeof temporaryEquityClaims>[0] & { noncontrollingIncome?: number | null; preferredStock?: number | null; preferredDividendsPaid?: number | null }): boolean {
  const nciImmaterial = bookNciImmaterial(row, row?.noncontrollingIncome);
  return preferredCapitalRefusal(row) !== null || noncontrollingOwnershipUnresolved(row) || (!nciImmaterial && isNum(row?.minorityInterest) && row.minorityInterest !== 0) ||
    (!nciImmaterial && isNum(row?.noncontrollingIncome) && row.noncontrollingIncome !== 0) ||
    (isNum(row?.preferredStock) && row.preferredStock !== 0) ||
    temporaryEquityBlocksCashOwnership(row) ||
    (isNum(row?.preferredDividendsPaid) && row.preferredDividendsPaid !== 0);
}

/** Rolling-4-quarter TTM multiples derived from raw statements + EV history. */
function deriveOwnHistory(
  quarters: QuarterlyFundamentalsRow[] | undefined,
  evRows: EnterpriseValuesRow[] | undefined,
  derivedKeys: readonly MultipleKey[] = DERIVED_HISTORY_KEYS,
  /**
   * D-19: true when the CURRENT enterprise value removed the operating-lease liability, so every
   * historical window must remove its own.
   */
  removeOperatingLease = false,
  currentCommonAllocation: { preferred: boolean; nci: boolean } = { preferred: false, nci: false },
  peConstruction: "price-eps" | "capitalization-common-income" = "capitalization-common-income",
): OwnHistoryDerivation {
  const series: HistorySeries = {};
  const details: Partial<Record<MultipleKey, OwnHistoryObservation[]>> = {};
  const normalized = normalizeQuarterRows(quarters ?? []);
  const candidates = contiguousQuarterWindows(normalized.rows, normalized.rows.length);
  if (candidates.windows.length === 0) {
    return {
      series,
      details,
      observations: 0,
      rejectedPeriods: normalized.rejected,
      rejectedWindows: candidates.rejected,
      unusableWindows: [],
      leaseBasisMismatchWindows: [],
      leaseScopeRejectedWindows: [],
      temporaryEquityRejectedWindows: [],
      cashOwnershipRejectedWindows: [],
    };
  }
  const unusableWindows: Array<{ anchor: string; reason: string }> = [];
  const leaseBasisMismatchWindows: string[] = [];
  const leaseScopeRejectedWindows: Array<{ anchor: string; reason: string }> = [];
  const temporaryEquityRejectedWindows: Array<{ anchor: string; reason: string }> = [];
  const cashOwnershipRejectedWindows: string[] = [];
  const push = (key: MultipleKey, value: number): void => {
    const values = (series[key] ??= []);
    if (values.length < FULL_OWN_HISTORY_OBS) values.push(value);
  };
  for (const window of candidates.windows) {
    if (derivedKeys.every((key) => (series[key]?.length ?? 0) >= FULL_OWN_HISTORY_OBS)) break;
    const leaseScopeRefusal = leaseDebtScopeRefusal(window[0], !removeOperatingLease);
    if (leaseScopeRefusal) leaseScopeRejectedWindows.push({ anchor: window[0].date, reason: leaseScopeRefusal });
    const ev = latestOnOrBeforeWithin(
      evRows ?? [],
      window[0].date,
      STATEMENT_DATE_MARKET_VALUE_MAX_AGE_DAYS,
    );
    if (!ev) {
      unusableWindows.push({
        anchor: window[0].date,
        reason:
          "no enterprise-values history row on or before the TTM period end within 45 calendar days (future rows are ineligible); historical multiple window unavailable",
      });
      continue;
    }
    const sum = (f: (r: QuarterlyFundamentalsRow) => number | null): number | null => {
      let acc = 0;
      for (const r of window) {
        const v = f(r);
        if (!isNum(v)) return null;
        acc += v;
      }
      return acc;
    };
    const ttmRev = posOrNull(sum((r) => r.revenue));
    const ttmEbitda = sum((r) =>
      isNum(r.operatingIncome) && isNum(r.depreciationAndAmortization)
        ? r.operatingIncome + r.depreciationAndAmortization
        : null,
    );
    const ttmNi = sum((r) => r.netIncome);
    const commonWindow = constructCommonIncomeQuarterWindow(window);
    // Preserve each quarter's outside-claim admission while selecting the same
    // complete numerator branch for the entire current/historical window.
    const fallbackRefusal = isNum(commonWindow.netIncomeAvailableToCommon) ? null : window.map(r => {
      if (
        ((currentCommonAllocation.preferred && !isNum(r.preferredStock)) ||
          (currentCommonAllocation.nci && !isNum(r.minorityInterest) && r.netIncomeOwnershipBasis !== "parent"))) return "historical outside-claim allocation is unavailable";
      return commonHolderCapital({ ...r, netIncomeAvailableToCommon: null }, r).incomeWithheldReason;
    }).find(reason => reason !== null) ?? null;
    const commonSelection = commonHolderCapital(commonWindow, window[0]);
    const commonWindowRefusal = commonWindow.commonIncomeWithheldReason ?? fallbackRefusal ?? commonSelection.incomeWithheldReason;
    if (commonWindowRefusal) unusableWindows.push({ anchor: window[0].date, reason: `historical common-income P/E withheld: ${commonWindowRefusal}` });
    const ttmCommonNi = commonWindowRefusal ? null : commonSelection.commonIncome;
    const quotedEps = peConstruction === "price-eps" ? sum(r => r.epsSecurityBasis === "quoted" ? r.epsDiluted ?? null : null) : null;
    const ttmFcf = sum((r) => deriveFcf(r.operatingCashFlow, r.capitalExpenditure));
    const cashOwnershipUnresolved = window.some(unresolvedCashOwnership);
    if (cashOwnershipUnresolved) cashOwnershipRejectedWindows.push(window[0].date);
    const equity = currentCommonAllocation.preferred && !isNum(window[0].preferredStock) && !isNum(window[0].commonEquity)
      ? null : commonHolderCapital(window[0], window[0]).commonEquity;
    const mcap = ev.marketCapitalization;
    // Build the historical EV from the SAME components as the current one
    // rather than trusting the vendor field, which omits preferred stock and
    // minority interest and nets cash only. Ranking a house EV against a
    // history of vendor EVs put a definitional gap into every EV percentile.
    // Undisclosed preferred/minority are treated as 0, matching the current
    // path's FMP convention; debt and cash are required, and when they are
    // absent the EV-based multiples for this window are simply not produced
    // (the equity-based ones below are unaffected because they use mcap).
    const b = window[0];
    /*
     * D-19: the SAME lease adjustment the current EV carries. Only the operating slice leaves EV,
     * and a window that cannot supply its own operating-lease liability while the current EV
     * removed one is dropped rather than ranked against a different definition.
     */
    const windowOperatingLease =
      isNum(b.operatingLeaseLiability) && b.operatingLeaseLiability >= 0
        ? b.operatingLeaseLiability
        : null;
    const leaseBasisMatches = !removeOperatingLease || windowOperatingLease !== null;
    if (!leaseBasisMatches) leaseBasisMismatchWindows.push(b.date);
    const historicalNetDebt = resolveNetDebt(b);
    // D-135: the quarter's own redeemable claims, read as the current EV reads them; a refused one
    // drops the EV multiples.
    const windowTemporary = temporaryEquityClaims(b);
    if (windowTemporary?.refusal != null) temporaryEquityRejectedWindows.push({ anchor: b.date, reason: windowTemporary.refusal });
    const evVal =
      leaseBasisMatches && leaseScopeRefusal === null && preferredCapitalRefusal(b) === null && !noncontrollingOwnershipUnresolved(b) && windowTemporary?.refusal == null && isNum(mcap) && historicalNetDebt.value !== null
        ? mcap +
          historicalNetDebt.value +
          (isNum(b.preferredStock) ? b.preferredStock : 0) +
          (isNum(b.minorityInterest) ? b.minorityInterest : 0) +
          (windowTemporary?.total ?? 0) -
          (removeOperatingLease ? (windowOperatingLease as number) : 0)
        : null;
    // FFO/AFFO history on the net income + income-statement D&A construction
    // (AFFO = FFO − |capex|), the only definition four quarterly statements
    // can rebuild. The CURRENT FFO is computeNareitFfo's fiscal-year figure;
    // the caller says through `ffoHistoryComparable` whether that figure IS
    // this construction (no gains, impairments or real-estate-only D&A
    // netted), and the framework withholds these bands when it is not, so a
    // NAREIT FFO is never ranked inside a differently-defined history. Without
    // the history, `priceToFfo`/`priceToAffo` had no own-history band at all,
    // so every equity REIT's only two multiples scored null and its composite
    // was permanently shrunk for evidence the pipeline could compute.
    // INCOME-statement D&A only: mergeQuarterly falls back to the cash-flow
    // figure, and allowing it here ranked one D&A definition against another.
    const ttmDa = sum((r) => r.incomeDepreciationAndAmortization ?? null);
    const ttmCapex = sum((r) => r.capitalExpenditure);
    const ttmFfo = isNum(ttmNi) && isNum(ttmDa) ? ttmNi + ttmDa : null;
    const ttmAffo = isNum(ttmFfo) && isNum(ttmCapex) ? ttmFfo - Math.abs(ttmCapex) : null;
    const values: Partial<Record<MultipleKey, number | null>> = {
      evToSales: safeDiv(evVal, ttmRev),
      evToEbitda: safeDiv(evVal, posOrNull(ttmEbitda)),
      peTtm: peConstruction === "price-eps" ? safeDiv(ev.stockPrice, posOrNull(quotedEps)) : safeDiv(mcap, posOrNull(ttmCommonNi)),
      priceToFcf: cashOwnershipUnresolved ? null : safeDiv(mcap, posOrNull(ttmFcf)),
      priceToBook: safeDiv(mcap, posOrNull(equity)),
      priceToFfo: safeDiv(mcap, posOrNull(ttmFfo)),
      priceToAffo: safeDiv(mcap, posOrNull(ttmAffo)),
    };
    const stillNeeded = derivedKeys.filter(
      (key) => (series[key]?.length ?? 0) < FULL_OWN_HISTORY_OBS,
    );
    const unavailable = derivedKeys.filter((key) => {
      const value = values[key];
      return value === null || value === undefined || value <= 0;
    });
    for (const key of stillNeeded) {
      const value = values[key];
      if (value !== null && value !== undefined && value > 0) {
        push(key, value);
        (details[key] ??= []).push({ periodEnd: window[0].date, marketDate: ev.date, value,
          source: "raw-statements", ...(ev.sourceId ? { marketCapSourceId: ev.sourceId } : {}) });
      }
    }
    if (unavailable.length > 0) {
      unusableWindows.push({
        anchor: window[0].date,
        reason: `${unavailable.length === derivedKeys.length ? "historical multiple window unavailable" : "partial historical multiple window"}: no positive/computable ${unavailable.join(", ")}`,
      });
    }
  }
  const observations = Math.max(0, ...DERIVED_HISTORY_KEYS.map((key) => series[key]?.length ?? 0));
  return {
    series,
    details,
    observations,
    rejectedPeriods: normalized.rejected,
    rejectedWindows: candidates.rejected,
    unusableWindows,
    leaseBasisMismatchWindows,
    leaseScopeRejectedWindows,
    temporaryEquityRejectedWindows,
    cashOwnershipRejectedWindows,
  };
}

function ownHistoryWindowGap(derived: OwnHistoryDerivation): ManifestEntry | null {
  const total = derived.rejectedPeriods.length + derived.rejectedWindows.length + derived.unusableWindows.length;
  if (total === 0) return null;
  const details = [
    ...derived.rejectedPeriods.map(({ period, reason }) => `period ${period}: ${reason}`),
    ...derived.rejectedWindows.map(({ anchor, reason }) => `window ${anchor}: ${reason}`),
    ...derived.unusableWindows.map(({ anchor, reason }) => `window ${anchor}: ${reason}`),
  ];
  const shown = details.slice(0, 8);
  const omitted = details.length - shown.length;
  return gapEntry(
    "valuation.multiples.ownHistory.windows",
    `${derived.rejectedPeriods.length} rejected fiscal period(s), ${derived.rejectedWindows.length} rejected quarter window(s), and ${derived.unusableWindows.length} financially partial/unusable window(s): ${shown.join("; ")}${omitted > 0 ? `; +${omitted} more` : ""}`,
    "info",
  );
}

/** Vendor pre-baked history mapped to our multiple keys. */
function vendorHistory(rows: VendorMultiplesRow[] | undefined): HistorySeries {
  const series: HistorySeries = {};
  if (!rows) return series;
  const push = (k: MultipleKey, v: number | null | undefined): void => {
    const values = (series[k] ??= []);
    if (isNum(v) && v > 0 && values.length < FULL_OWN_HISTORY_OBS) values.push(v);
  };
  for (const r of rows) {
    push("evToSales", r.evToSales);
    push("evToEbitda", r.evToEBITDA);
    push("peTtm", r.priceToEarningsRatio);
    push("priceToBook", r.priceToBookRatio);
    push("priceToFcf", r.priceToFreeCashFlowRatio);
  }
  return series;
}

function bandFor(values: number[] | undefined, current: number | null, basis: string, details: OwnHistoryObservation[] = []): OwnHistoryBand | null {
  if (!values || values.length < MIN_HISTORY_OBS_FOR_BAND) return null;
  // With the derivation capped at 20 quarterly obs, quantile idx 0.05·(n−1) < 1 for
  // all n ≤ 20, so p5/p95 are interpolated within the outermost cell — they track the
  // near-min/near-max (≈ observed range), not stable tail percentiles. Flag thin
  // windows so p5/p95 aren't over-read; the median/quartiles stay robust.
  const lowSample = values.length < FULL_OWN_HISTORY_OBS;
  const flat = percentileRank(values, values[0]) === null;
  const observationBasis =
    `${basis} (${values.length} observations). The reported figure is an empirical percentile rank within this sample ` +
    "(0-100 by linear interpolation between order statistics; tied values receive their midrank within a relative tolerance of 1e-9). " +
    "It is not an ordinal position or an estimate of a population percentile; small samples and input comparability limit interpretation.";
  const notedBasis = lowSample
    ? `${observationBasis} LOW SAMPLE (${values.length} quarterly observations < 5y): p5/p95 track the tail observations (≈ observed range), not stable quantiles.`
    : observationBasis;
  return {
    percentileRank: current !== null ? percentileRank(values, current) : null,
    p5: quantile(values, 0.05),
    p25: quantile(values, 0.25),
    p50: quantile(values, 0.5),
    p75: quantile(values, 0.75),
    p95: quantile(values, 0.95),
    observations: values.length,
    observationDetails: details,
    basis: notedBasis + (flat ? " Flat history is uninformative; no own-history rank or grade signal is available." : ""),
    lowSample,
  };
}

/**
 * Current multiples computed from raw FMP fields (never trusting pre-baked
 * ratios for the current print), own-history 5y percentile bands, and trimmed
 * peer stats. `sectorAppropriate` tells the UI which multiples are valid for
 * the route (banks never get EV multiples; REITs lead with P/FFO).
 */
export function multiplesFramework(
  route: SectorRoute,
  inputs: MultiplesFrameworkInputs,
): MultiplesResult {
  const notes: string[] = [];
  const gaps: ManifestEntry[] = [];
  const inc = inputs.incomeTtm;
  const cf = inputs.cashFlowTtm;
  const bal = inputs.balance;
  const financialsRoute = route === "bank" || route === "insurer" || route === "reit-mortgage";
  const ffoSubmapUndetermined = route === "reit" && inputs.reitSubmap === "undetermined";
  const ffoSubmapReason =
    "REIT sub-map is undetermined — P/FFO and P/AFFO require an evidenced equity REIT; current multiples, own-history bands and peer comparisons are withheld";
  if (ffoSubmapUndetermined) {
    notes.push(ffoSubmapReason);
    gaps.push(gapEntry("valuation.multiples.reitSubmap", ffoSubmapReason, "warn"));
  }
  // Every multiple here sets the quote (price, market cap, EV) against the
  // statements. Unless both are in one known currency none of them is a
  // figure, and neither is its rank in an own history built the same way:
  // the price inputs are withheld, so every multiple reads n/m. Peer stats
  // describe other issuers and stay.
  const priceCurrency = comparePriceCurrency(inputs.reportedCurrency, inputs.quote.currency);
  const equityScope = resolveEconomicEquityScope(inputs.quote, inputs.economicShareEvidence ?? [], inputs.securityBasisAsOf ?? "");
  const marketCapSecurityKnown = equityScope.status !== "unresolved";
  const mcap = priceCurrency.comparable && marketCapSecurityKnown ? posOrNull(equityScope.marketCap) : null;
  const price = priceCurrency.comparable ? posOrNull(inputs.quote.price) : null;
  if (!marketCapSecurityKnown) {
    const reason = equityScope.basis;
    notes.push(reason);
    gaps.push(gapEntry("valuation.multiples.marketCap.securityBasis", reason, "warn"));
  }
  if (!priceCurrency.comparable) {
    notes.push(
      `price multiples withheld: ${priceCurrency.reason} — a multiple would set the quote against statements that are not proven to share its currency; own-history bands withheld on the same rule`,
    );
    gaps.push(
      gapEntry(
        "valuation.multiples.currency",
        priceCurrency.mismatch
          ? `reportedCurrency ${inputs.reportedCurrency} != quote currency ${inputs.quote.currency} (ADR case) — FX conversion pending, price multiples withheld`
          : `${priceCurrency.reason} — price multiples withheld`,
        "warn",
      ),
    );
  } else if (mcap === null) {
    // Fix round 2, M4: a cap withheld on share scope is named as withheld, with the scope's reason; "missing" only when absent.
    gaps.push(gapEntry("valuation.multiples.marketCap", !marketCapSecurityKnown
      ? `market cap withheld — most multiples not computable: ${equityScope.basis.replace(/\.$/, "")}`
      : "market cap missing — most multiples not computable", "warn"));
  }

  // --- Raw building blocks (zero-for-undisclosed handled where implausible) --
  const revenue = posOrNull(zeroAsNull(inc?.revenue));
  // D-112 (multiple labels by period): the cash-flow statement's D&A stands in only on the income
  // statement's own period; on another, EBITDA would add two periods' figures under one period's label.
  const period = (row: { date: string; basis?: "ttm" | "annual"; fiscalYear?: string | null }): string =>
    row.basis === "annual"
      ? (/^\d{4}$/.test(row.fiscalYear ?? "") ? `FY${row.fiscalYear}` : row.date === "" ? "an undated fiscal year" : `FY ended ${row.date}`)
      : row.date === "" ? "an undated TTM" : `TTM to ${row.date}`;
  // An undated row matches nothing: two empty dates are not one period.
  const onIncomeDate = (date: string): boolean => inc !== null && inc.date !== "" && date === inc.date;
  const cashFlowDaSamePeriod =
    inc === null || cf === null
      ? null
      : isNum(cf.depreciationAndAmortization) && onIncomeDate(cf.date) && (cf.basis ?? "ttm") === (inc.basis ?? "ttm")
        ? cf.depreciationAndAmortization
        : inc.basis === "annual" && isNum(cf.annualDepreciationAndAmortization?.value) && onIncomeDate(cf.annualDepreciationAndAmortization.date)
          ? cf.annualDepreciationAndAmortization.value
          : null;
  const cashFlowDaElsewhere = inc !== null && !isNum(inc.depreciationAndAmortization) && cashFlowDaSamePeriod === null && isNum(cf?.depreciationAndAmortization);
  const dAndA = isNum(inc?.depreciationAndAmortization) ? inc.depreciationAndAmortization : cashFlowDaSamePeriod;
  const ebitda =
    isNum(inc?.operatingIncome) && isNum(dAndA) ? inc.operatingIncome + dAndA : null;
  const ebitdaLowerBound = ebitda !== null && isNum(inc?.depreciationAndAmortization) && inc.dAndALowerBound ? inc.dAndALowerBound : null;
  if (!financialsRoute && inc && cashFlowDaElsewhere) {
    gaps.push(gapEntry("valuation.multiples.ebitda", `no income-statement D&A, and the cash-flow D&A covers ${period(cf!)}, not ${period(inc)} — EBITDA (computed) withheld rather than adding two periods`, "info"));
  } else if (!financialsRoute && inc && !isNum(dAndA)) {
    gaps.push(gapEntry("valuation.multiples.ebitda", "depreciation and amortization missing — EBITDA (computed) unavailable", "info"));
  }
  const fcf = deriveFcf(cf?.operatingCashFlow, cf?.capitalExpenditure);
  const capital = commonHolderCapital(inc, bal);
  const equity = capital.commonEquity;
  const tbv =
    isNum(equity) && isNum(bal?.goodwill) && isNum(bal?.intangibleAssets)
      ? equity - bal.goodwill - bal.intangibleAssets
      : null;
  /*
   * D-19: the EV bridge, computed BOTH ways and disclosed. Base = market cap + total debt +
   * preferred + minority interest − cash and short-term investments. FMP's totalDebt already
   * contains the lease liability, so the default (leases NOT in EV) subtracts it back out.
   */
  const netDebt = resolveNetDebt(bal ?? {});
  const unknownNciAllocation = noncontrollingOwnershipUnresolved(bal);
  // D-135: redeemable preferred and redeemable NCI sit in temporary equity, outside every equity
  // field above, and are claims on the enterprise like permanent preferred and book NCI. A refused
  // operand withholds the EV.
  const temporaryClaims = financialsRoute ? null : temporaryEquityClaims(bal);
  const temporaryRefusal = temporaryClaims?.refusal ?? null;
  const preferredRefusal = preferredCapitalRefusal(bal);
  if (preferredRefusal) {
    notes.push(preferredRefusal);
    gaps.push(gapEntry("valuation.multiples.preferredCapital", preferredRefusal, "warn"));
  }
  const temporaryTotal = temporaryClaims !== null && temporaryRefusal === null ? temporaryClaims.total : 0;
  if (temporaryRefusal !== null) {
    const reason = `${temporaryRefusal}; the redeemable preferred and redeemable noncontrolling claims cannot be added, and the EV-dependent multiples are withheld rather than zero-filled`;
    notes.push(reason);
    gaps.push(gapEntry("valuation.multiples.enterpriseValue.temporaryEquity", reason, "warn"));
  }
  // Inspect known ownership in every quarter that can contribute to the
  // current annual/TTM cash-flow year, including interests divested by its end.
  const cashEnd = cf?.date ?? "";
  const cashStart = /^\d{4}-\d{2}-\d{2}$/.test(cashEnd) ? `${Number(cashEnd.slice(0, 4)) - 1}${cashEnd.slice(4)}` : "";
  const currentCashRows = (inputs.quarterlyFundamentals ?? []).filter(row => cashStart && row.date > cashStart && row.date <= cashEnd);
  const unresolvedParentFcf = (bal !== null && unresolvedCashOwnership({ ...bal, noncontrollingIncome: inc?.noncontrollingIncome })) ||
    (!bookNciImmaterial(bal, inc?.noncontrollingIncome) && isNum(inc?.noncontrollingIncome) && inc.noncontrollingIncome !== 0) ||
    (isNum(inc?.preferredDividendsPaid) && inc.preferredDividendsPaid !== 0) || currentCashRows.some(unresolvedCashOwnership);
  const parentFcfScope = unresolvedParentFcf
    ? "Parent-common cash-flow attribution unresolved: the numerator is parent-common capitalization and the denominator is consolidated operating cash flow less capital expenditure before SBC. Retained disclosures do not allocate that cash flow among parent common holders, noncontrolling interests or preferred claims. P/FCF, its own-history rank and peer comparison are withheld as parent-common valuation measures."
    : null;
  if (!financialsRoute && parentFcfScope) {
    notes.push(parentFcfScope);
    gaps.push(gapEntry("valuation.multiples.priceToFcf.cashOwnership", parentFcfScope, "warn"));
  }
  const unknownNciReason = "Consolidated equity has no resolved parent/NCI split or differs from parent equity, but the NCI allocation is unavailable; outside ownership cannot be zero-filled or valued from the book-equity difference. EV-dependent multiples withheld.";
  if (!financialsRoute && unknownNciAllocation) {
    notes.push(unknownNciReason);
    gaps.push(gapEntry("valuation.multiples.enterpriseValue.noncontrollingOwnership", unknownNciReason, "warn"));
  }
  if (!financialsRoute && bal && netDebt.value === null) {
    gaps.push(gapEntry("valuation.multiples.netDebt", netDebt.reason, "warn"));
    notes.push(`EV withheld: ${netDebt.reason}. Equity-only multiples are evaluated separately.`);
  }
  const rawEvIncludingLeases =
    mcap !== null && bal && netDebt.value !== null && !unknownNciAllocation && temporaryRefusal === null && preferredRefusal === null
      ? mcap +
        netDebt.value +
        (isNum(bal.preferredStock) ? bal.preferredStock : 0) +
        (isNum(bal.minorityInterest) ? bal.minorityInterest : 0) +
        temporaryTotal
      : null;
  /*
   * D-19: Remove only the operating-lease liability from EV. Operating-lease cost is already in
   * operating expenses and therefore EBIT and EBITDA. Finance-lease amortisation is inside EBIT and
   * added back in EBITDA, while its interest is below EBIT; its liability remains financing debt in
   * both frames. Removing the combined liability would understate debt and overstate equity value.
   */
  const totalLeaseLiability =
    isNum(bal?.capitalLeaseObligations) && bal.capitalLeaseObligations >= 0
      ? bal.capitalLeaseObligations
      : null;
  // D-97: removed only when totalDebt is shown to hold it.
  const evLeaseScope = operatingLeaseScopeUnproven(bal ?? {});
  const leaseLiability =
    evLeaseScope === null && isNum(bal?.operatingLeaseLiability) && bal.operatingLeaseLiability >= 0
      ? bal.operatingLeaseLiability
      : null;
  const financeLeaseLiability =
    leaseDebtConflict(bal ?? {}) !== null ? null
      : isNum(bal?.financeLeaseLiability) && bal.financeLeaseLiability >= 0 ? bal.financeLeaseLiability
        : totalLeaseLiability !== null && leaseLiability !== null
          ? Math.max(0, totalLeaseLiability - leaseLiability)
          : null;
  const financeOnlyTotal = evLeaseScope === null
    ? financeLeaseOnlyTotal(totalLeaseLiability, bal?.operatingLeaseLiability, bal?.financeLeaseLiability, leaseDebtConflict(bal ?? {}))
    : null;
  const includeLeases = inputs.includeLeasesInEv === true;
  const incompleteLeases = incompleteLeaseCoverage(bal);
  const inclusiveRefusal = leaseDebtScopeRefusal(bal, true);
  const excludedRefusal = leaseDebtScopeRefusal(bal, false);
  const evIncludingLeases = inclusiveRefusal ? null : rawEvIncludingLeases;
  const evExcludingLeases =
    excludedRefusal || rawEvIncludingLeases === null
      ? null
      : leaseLiability === null
        ? rawEvIncludingLeases
        : rawEvIncludingLeases - leaseLiability;
  const ev = includeLeases ? evIncludingLeases : evExcludingLeases;
  // D-133: a withheld EV states the actual refusal; it is never described as reported as-is or as
  // missing components.
  const evWithheldReason = financialsRoute || ev !== null ? null
    : !bal ? "no balance sheet is available"
      : netDebt.value === null ? netDebt.reason
        : !marketCapSecurityKnown ? equityScope.basis
          : !priceCurrency.comparable ? priceCurrency.reason
            : mcap === null ? "market cap missing"
              : unknownNciAllocation ? unknownNciReason
                : temporaryRefusal !== null ? temporaryRefusal
                  : (includeLeases ? inclusiveRefusal : excludedRefusal) || "the enterprise value bridge did not resolve";
  /* A reason that already ends a sentence keeps one final period. */
  const evBridgeBasis = evWithheldReason !== null ? (evWithheldReason.endsWith(".") ? `EV withheld: ${evWithheldReason}` : `EV withheld: ${evWithheldReason}.`) :
    ((includeLeases ? inclusiveRefusal : excludedRefusal) ? `${includeLeases ? inclusiveRefusal : excludedRefusal} ` : "") +
    leaseEvidenceNote(bal, { removed: !includeLeases && evExcludingLeases !== null ? leaseLiability : null }) + " " +
    (incompleteLeases !== null ? `${incompleteLeases.note} ` : "") +
    "EV = market cap + total debt + preferred stock + minority interest" +
    (temporaryTotal !== 0 && temporaryClaims !== null
      ? ` + ${[...(temporaryClaims.redeemablePreferred !== 0 ? ["temporary equity attributable to the parent"] : []),
        ...(temporaryClaims.unsplit !== 0 ? ["temporary equity with no parent/NCI split"] : []),
        ...(temporaryClaims.redeemableNoncontrolling !== 0 ? ["redeemable noncontrolling interest"] : [])].join(" + ")}`
      : "") +
    " − cash and short-term investments" +
    (netDebt.nonOperatingEquitySecurities !== undefined
      ? ` excluding ${fmtGrouped(netDebt.nonOperatingEquitySecurities)} of marketable equity securities, which are not cash (the one net cash the DCF bridge and the key-data EV use; house rule)`
      : "") +
    (evLeaseScope !== null ? `; ${evLeaseScope}` : "") +
    (financeOnlyTotal !== null ? `; ${financeLeaseOnlyEvClause(financeOnlyTotal)}` : "") +
    ". EV/EBITDA uses this same EV. Under US GAAP (ASC 842) operating-lease cost stays in operating expenses, so EBIT and EBITDA are already AFTER it. Finance-lease right-of-use amortisation is included in EBIT and added back in EBITDA; finance-lease interest is below EBIT. The selected convention does not subtract the finance-lease observation." +
    (financeLeaseLiability !== null && financeLeaseLiability > 0 ? ` The recorded finance-lease observation ${fmtGrouped(financeLeaseLiability)} is retained on both bases.` : "") +
    (includeLeases && leaseLiability !== null && leaseLiability > 0 ? " EV/EBITDA is not comparable to the default basis that subtracts this operating-lease observation." : "") +
    ` ${equityScope.basis} ` +
    (unknownNciAllocation ? `${unknownNciReason} ` : "") +
    (temporaryClaims !== null && temporaryRefusal === null && temporaryClaims.redeemablePreferred + temporaryClaims.unsplit !== 0
      ? "The temporary equity attributable to the parent can also hold redeemable common shares (for example shares subject to possible redemption or an ESOP put) that the quoted market cap already counts; the filed facts do not separate them, so such shares would be counted twice. "
      : "") +
    (isNum(bal?.minorityInterest) && bal.minorityInterest !== 0 ? "Noncontrolling interest is a filed book-value proxy, not an established market value. " : "") +
    "Non-operating holdings are not comprehensively resolved; this bridge does not establish a fully adjusted operating enterprise value. " +
    (evIncludingLeases === null || evExcludingLeases === null
      ? ""
      : ` EV on the operating-lease adjustment basis ${fmtGrouped(evExcludingLeases)}; EV on retained debt basis ${fmtGrouped(evIncludingLeases)}.`);
  const enterpriseValue: EnterpriseValueBridge = {
    equityScope,
    noncontrollingInterestBasis: unknownNciAllocation ? "unknown-allocation" : isNum(bal?.minorityInterest) && bal.minorityInterest !== 0 ? "book-value-proxy" : "none-disclosed",
    nonOperatingHoldingsScope: "not-comprehensively-resolved",
    value: financialsRoute ? null : ev,
    excludingLeases: financialsRoute ? null : evExcludingLeases,
    includingLeases: financialsRoute ? null : evIncludingLeases,
    leaseLiability: financialsRoute ? null : leaseLiability,
    totalLeaseLiability: financialsRoute ? null : totalLeaseLiability,
    financeLeaseLiability: financialsRoute ? null : financeLeaseLiability,
    includeLeases,
    basis: financialsRoute ? "Enterprise value is not applicable to financial companies; funding liabilities are operating inputs." : evBridgeBasis,
  };
  // A withheld net debt already noted "EV withheld: <reason>" above.
  if (!financialsRoute && !(evWithheldReason !== null && netDebt.value === null)) notes.push(evBridgeBasis);
  if (!financialsRoute && ev === null) {
    gaps.push(gapEntry("valuation.multiples.enterpriseValue", `EV withheld: ${evWithheldReason} — EV multiples n/m`, "info"));
  } else if (!financialsRoute && leaseLiability === null && financeOnlyTotal !== null) {
    // FIN-109: a finance-lease-only total has no unknown mix; the basis states it, and no leases gap is raised.
  } else if (!financialsRoute && leaseLiability === null) {
    gaps.push(
      gapEntry(
        "valuation.multiples.enterpriseValue.leases",
        (evLeaseScope !== null ? `${evLeaseScope}; ` : "") + leaseEvidenceNote(bal, { removed: null }),
        "info",
      ),
    );
  } else if (!financialsRoute && includeLeases && leaseLiability !== null) {
    gaps.push(
      gapEntry(
        "valuation.multiples.enterpriseValue.leases",
        `METIS_EV_INCLUDE_LEASES=1: no operating-lease adjustment is subtracted from enterprise value; the retained operating-lease observation is ${fmtNum(leaseLiability)}. EBITDA remains after operating-lease cost (ASC 842).${leaseLiability > 0 ? " EV/EBITDA is not comparable to the default basis that subtracts this observation." : ""} ${leaseEvidenceNote(bal)}`,
        "warn",
      ),
    );
  }

  if (financialsRoute) {
    notes.push("EV multiples suppressed for financials — debt is raw material, EV is meaningless (house rule; docs/METHODOLOGY.md, Financial-company routes)");
  }

  // --- Current multiples from raw fields ------------------------------------
  let eps = posOrNull(inc?.epsDiluted);
  let epsBasis = "price / diluted EPS";
  // D-112: why price / diluted EPS did not produce the P/E, named in its basis.
  let epsUnused = isNum(inc?.epsDiluted)
    ? "diluted EPS for the period is not positive"
    : inc?.basis === "annual" ? "the fiscal year's diluted EPS is not reported" : "diluted EPS is not available for every quarter of the period";
  if (inputs.quote.isAdr === true && eps !== null) {
    const security = resolveSecurityBasis(inputs.securityBasis ?? [], inputs.securityBasisAsOf ?? "");
    if (security === null || security.quoteUnit !== "ADS" || inc?.epsSecurityBasis === undefined ||
      (inputs.quote.issuerId !== undefined && security.issuerId !== inputs.quote.issuerId) ||
      (inputs.quote.securityId !== undefined && security.securityId !== inputs.quote.securityId)) {
      eps = null;
      epsUnused = "the ADR's depositary ratio and EPS basis are not verified";
      const reason = "ADR/ADS price-to-EPS basis unavailable: a verified effective-dated depositary ratio and explicit ordinary-versus-quoted EPS basis are required; price/EPS withheld, with common-income market-cap fallback only when eligible";
      notes.push(reason);
      gaps.push(gapEntry("valuation.multiples.peTtm.securityBasis", reason, "warn"));
    } else if (inc.epsSecurityBasis === "ordinary") {
      eps *= security.ordinarySharesPerQuotedUnit;
      epsBasis = `price per ADS / (ordinary diluted EPS x ${security.ordinarySharesPerQuotedUnit} ordinary shares per ADS) (verified basis ${security.sourceIds.join(", ")}, effective ${security.effectiveFrom})`;
    } else epsBasis = "price per ADS / diluted EPS already per quoted ADS (no second ratio adjustment)";
  }
  // D-103 (class-tagged market cap): when the classes carry different economic weights, a filed
  // diluted EPS is per share of one class whose identity the filing facts do not establish (a filer
  // may report per equivalent share of one class), so P/E uses the issuer-economic capitalization
  // over common income instead.
  if (eps !== null && equityScope.status === "resolved" && equityScope.weightedClasses === true) {
    eps = null;
    epsUnused = "share classes carry different economic weights and the diluted EPS class basis is not established";
    const reason = "share classes carry different economic weights and the diluted EPS class basis is not established; P/E is issuer-economic market cap / common income, not price / EPS";
    notes.push(reason);
    gaps.push(gapEntry("valuation.multiples.peTtm.economicClassBasis", reason, "info"));
  }
  if (capital.equityWithheldReason) gaps.push(gapEntry("valuation.multiples.priceToBook.commonEquity", capital.equityWithheldReason, "warn"));
  if (eps === null && capital.incomeWithheldReason) gaps.push(gapEntry("valuation.multiples.peTtm.commonIncome", capital.incomeWithheldReason, "warn"));
  const current: Partial<Record<MultipleKey, number | null>> = {
    peTtm:
      price !== null && eps !== null
        ? price / eps
        : safeDiv(mcap, posOrNull(capital.commonIncome)),
    priceToFcf: financialsRoute || unresolvedParentFcf ? null : safeDiv(mcap, posOrNull(fcf)),
    priceToBook: safeDiv(mcap, posOrNull(equity)),
    priceToTbv: safeDiv(mcap, posOrNull(tbv)),
    evToEbitda: financialsRoute ? null : safeDiv(ev, posOrNull(ebitda)),
    evToSales: financialsRoute ? null : safeDiv(ev, revenue),
    priceToFfo: ffoSubmapUndetermined ? null : safeDiv(mcap, posOrNull(inputs.ffoApprox)),
    priceToAffo: ffoSubmapUndetermined ? null : safeDiv(mcap, posOrNull(inputs.affoApprox)),
  };
  if (route === "reit" && posOrNull(inputs.ffoApprox) === null) {
    gaps.push(gapEntry("valuation.multiples.priceToFfo", "FFO (approx.) not provided by caller — P/FFO unavailable", "warn"));
  }

  // The bounded upstream collector discloses evaluated candidates and their
  // exclusions. Legacy/direct callers without a collector still disclose the
  // missing input; neither path implies a market-wide search found no peers.
  if (inputs.peerCoverage) {
    notes.push(...inputs.peerCoverage.methodology);
    for (const exclusion of inputs.peerCoverage.exclusions) {
      notes.push(`Peer ${exclusion.symbol}: ${exclusion.reason}`);
    }
    if ((inputs.peers ?? []).length < MIN_PEERS_FOR_STATS) {
      gaps.push(gapEntry("valuation.multiples.peers", "Insufficient eligible peer coverage; each median requires four surviving issuers for that metric after the IQR rule. See peer selection/exclusions.", "info"));
    }
  } else if ((inputs.peers ?? []).length === 0) {
    notes.push(
      "Peer multiples were not supplied for this report — the peer median/IQR columns are " +
        "unavailable. This is a missing input, not a finding that the company has no peers.",
    );
    gaps.push(
      gapEntry(
        "valuation.multiples.peers",
        "peer multiples not supplied to the valuation stage — peer medians unavailable (not evaluated)",
        "info",
      ),
    );
  }

  // --- Own-history bands ------------------------------------------------------
  // Equity REITs are scored on P/FFO and P/AFFO alone, so those must be derived
  // for them; deriving them for every issuer would make the window scan chase
  // series no other route consumes.
  const derivedKeys: readonly MultipleKey[] = financialsRoute
    ? ["peTtm", "priceToBook"]
    : route === "reit" && !ffoSubmapUndetermined ? [...DERIVED_HISTORY_KEYS, "priceToFfo", "priceToAffo"] : DERIVED_HISTORY_KEYS;
  /*
   * D-19: the own-history EV must be built from the SAME definition as the current one — the file's
   * own invariant. `removeOperatingLease` is true exactly when the current EV removed an
   * operating-lease liability.
   */
  const removeOperatingLease = !financialsRoute && !includeLeases && leaseLiability !== null;
  const requiresHistoricalClassScope = equityScope.status === "resolved" &&
    inputs.economicShareEvidence?.some(row => row.classes.length > 1 || row.classes.some(cls => cls.economicUnitsPerQuotedShare !== 1)) === true;
  const historicalMarket = requiresHistoricalClassScope ? (inputs.enterpriseValuesHistory ?? []).map(row => {
    const historicalScope = row.sourceId && row.priceCurrency && inputs.reportedCurrency && inputs.quote.currency &&
      row.priceCurrency === inputs.reportedCurrency && row.priceCurrency === inputs.quote.currency ? resolveEconomicEquityScope({
      price: row.stockPrice ?? null, priceAsOf: row.date, currency: row.priceCurrency,
      issuerId: inputs.quote.issuerId, securityId: inputs.quote.securityId,
      marketCap: null, marketCapSecurityBasis: "unresolved",
    }, (inputs.economicShareEvidence ?? []).filter(evidence => evidence.filed <= row.date), row.date) : null;
    return { ...row, marketCapitalization: historicalScope?.status === "resolved" ? historicalScope.marketCap : null,
      stockPrice: historicalScope?.status === "resolved" ? row.stockPrice : null,
      sourceId: historicalScope?.status === "resolved" ? [row.sourceId, ...historicalScope.sourceIds].join("; ") : row.sourceId };
  }) : inputs.enterpriseValuesHistory;
  const peHistoryConstruction = requiresHistoricalClassScope && price !== null && eps !== null ? "price-eps" : "capitalization-common-income";
  const derived = deriveOwnHistory(
    inputs.quarterlyFundamentals,
    historicalMarket,
    derivedKeys,
    removeOperatingLease,
    // A refused temporary-equity operand is a filed claim of unknown amount: it counts, as in the other two checks.
    { preferred: (bal?.preferredStock ?? 0) > 0 || temporaryParentLike(bal) > 0 || temporaryEquityRefused(bal),
      nci: (isNum(bal?.minorityInterest) && bal.minorityInterest !== 0) || (temporaryEquityClaims(bal)?.redeemableNoncontrolling ?? 0) > 0 || temporaryEquityRefused(bal) },
    peHistoryConstruction,
  );
  const windowGap = ownHistoryWindowGap(derived);
  if (windowGap) gaps.push(windowGap);
  if (derived.leaseBasisMismatchWindows.length > 0) {
    const detail =
      `${derived.leaseBasisMismatchWindows.length} historical quarter window(s) (${derived.leaseBasisMismatchWindows.slice(0, 8).join(", ")}` +
      `${derived.leaseBasisMismatchWindows.length > 8 ? `, +${derived.leaseBasisMismatchWindows.length - 8} more` : ""}) ` +
      "disclose no operating-lease liability while the current enterprise value removes one — their EV/EBITDA and EV/sales were dropped rather than ranked against a lease-inclusive history";
    notes.push(`own-history EV lease basis: ${detail}`);
    gaps.push(gapEntry("valuation.multiples.ownHistory.evLeaseBasis", detail, "info"));
  }
  const history: HistorySeries = {};
  const historyDetails: Partial<Record<MultipleKey, OwnHistoryObservation[]>> = {};
  const historyBasisByKey: Partial<Record<MultipleKey, string>> = {};
  const derivedBasis =
    "per-quarter TTM multiples derived from four normalized contiguous fiscal quarters of raw statements + the latest enterprise value and market capitalization on or before each TTM period end (maximum age 45 calendar days; future observations are ineligible)";
  const vendorBasis = "vendor pre-baked ratio history (FMP key-metrics/ratios quarterly) — derivation from raw statements not possible for this multiple";
  const vendor = priceCurrency.comparable ? vendorHistory(inputs.keyMetricsHistory) : {};
  const historicalFcfScope = derived.cashOwnershipRejectedWindows.length
    ? `P/FCF historical cash-flow attribution unresolved in ${derived.cashOwnershipRejectedWindows.length} retained TTM window(s): consolidated cash flow includes known or unresolved noncontrolling ownership or preferred claims. Those windows are excluded; vendor P/FCF history cannot restore their unknown parent-common cash scope.` : null;
  if (historicalFcfScope) {
    delete vendor.priceToFcf;
    gaps.push(gapEntry("valuation.multiples.priceToFcf.historicalCashOwnership", historicalFcfScope, "warn"));
    notes.push(historicalFcfScope);
  }
  const materialCommonAllocation = (bal?.preferredStock ?? 0) > 0 || (isNum(bal?.minorityInterest) && bal.minorityInterest !== 0) || hasTemporaryEquityClaim(bal);
  if (materialCommonAllocation && (vendor.priceToBook?.length || vendor.peTtm?.length)) {
    delete vendor.priceToBook;
    delete vendor.peTtm;
    const reason = "vendor P/B and P/E history has no common-holder ownership evidence beside material preferred or noncontrolling interests; common-basis history cannot be established, so these vendor own-history bands are withheld";
    notes.push(reason);
    gaps.push(gapEntry("valuation.multiples.ownHistory.commonBasis", reason, "info"));
  }
  /*
   * D-19: the vendor's pre-baked EV ratios are built on the vendor's own lease-INCLUSIVE enterprise
   * value. Ranking a lease-adjusted current multiple inside that distribution compares two
   * definitions, so when the adjustment fired the vendor EV bands are withheld rather than
   * published on a basis the current number does not share.
   */
  const vendorEvKeys: readonly MultipleKey[] = ["evToEbitda", "evToSales"];
  if (derived.leaseScopeRejectedWindows.length) {
    for (const key of vendorEvKeys) delete vendor[key];
    const reason = `${derived.leaseScopeRejectedWindows.length} historical quarter window(s) have a known incomplete lease/debt scope: ` +
      derived.leaseScopeRejectedWindows.slice(0, 3).map(({ anchor, reason }) => `${anchor}: ${reason}`).join("; ") +
      ". Affected raw-statement EV windows are excluded. Vendor EV/EBITDA and EV/sales history lacks the component evidence needed to cure these refusals and cannot restore an own-history band; supported raw-statement windows remain eligible.";
    notes.push(reason);
    gaps.push(gapEntry("valuation.multiples.ownHistory.evLeaseScope", reason, "warn"));
  }
  /*
   * D-135: Vendor EV ratios use the vendor claims and cannot resolve a refused temporary-equity
   * operand. They must not restore the affected historical windows.
   */
  if (derived.temporaryEquityRejectedWindows.length) {
    for (const key of vendorEvKeys) delete vendor[key];
    const reason = `${derived.temporaryEquityRejectedWindows.length} historical quarter window(s) have a refused temporary-equity operand: ` +
      derived.temporaryEquityRejectedWindows.slice(0, 3).map(({ anchor, reason }) => `${anchor}: ${reason}`).join("; ") +
      ". Affected raw-statement EV windows are excluded. Vendor EV/EBITDA and EV/sales history lacks the component evidence needed to resolve the refused claim and cannot restore an own-history band; supported raw-statement windows remain eligible.";
    notes.push(reason);
    gaps.push(gapEntry("valuation.multiples.ownHistory.evTemporaryEquity", reason, "warn"));
  }
  if (unknownNciAllocation || inputs.quarterlyFundamentals?.some(noncontrollingOwnershipUnresolved)) {
    for (const key of vendorEvKeys) delete vendor[key];
    const reason = "Known outside ownership has an unavailable NCI allocation in current or historical balance evidence; affected historical EV windows and vendor EV-ratio fallback without ownership allocation evidence are withheld. Equity-only history is evaluated separately.";
    notes.push(reason);
    gaps.push(gapEntry("valuation.multiples.ownHistory.noncontrollingOwnership", reason, "info"));
  }
  if (removeOperatingLease && vendorEvKeys.some((key) => (vendor[key]?.length ?? 0) > 0)) {
    for (const key of vendorEvKeys) delete vendor[key];
    const reason =
      "vendor pre-baked EV/EBITDA and EV/sales history is built on the vendor's lease-INCLUSIVE enterprise value, " +
      "while the current EV removes the operating-lease liability — the vendor EV bands are withheld rather than ranking the current multiple inside a differently-defined distribution";
    notes.push(reason);
    gaps.push(gapEntry("valuation.multiples.ownHistory.evLeaseBasis", reason, "info"));
  }
  // The current FFO has component adjustments (gains, impairments or real-estate-only
  // D&A) while the history can only be net income + D&A: withhold the FFO
  // bands rather than rank two definitions against each other (the same rule
  // the lease basis applies to EV above).
  const ffoKeys: readonly MultipleKey[] = ["priceToFfo", "priceToAffo"];
  if (route === "reit" && inputs.ffoHistoryComparable === false) {
    const reason =
      "the current FFO uses a component-adjusted reconstruction (property-sale gains, impairments or real-estate-only depreciation netted, on the latest fiscal year; ownership reconciliation remains unavailable) " +
      "while the own-history series can only be rebuilt as net income + D&A per rolling four quarters — the P/FFO and P/AFFO bands are withheld " +
      "rather than ranking one definition inside a history built on another";
    for (const key of ffoKeys) {
      delete derived.series[key];
      delete vendor[key];
    }
    notes.push(`own-history FFO basis: ${reason}`);
    gaps.push(gapEntry("valuation.multiples.ownHistory.ffoBasis", reason, "info"));
  }
  if (route === "reit" && inputs.affoHistoryComparable !== true) {
    const reason = "The current AFFO construction is not established as net income + total income-statement D&A - all capital expenditure. Recurring-capex/rent or FFO adjustments cannot be ranked against the historical all-capex construction; P/AFFO own-history ranking is withheld independently of P/FFO.";
    delete derived.series.priceToAffo;
    delete vendor.priceToAffo;
    notes.push(reason);
    gaps.push(gapEntry("valuation.multiples.ownHistory.affoBasis", reason, "info"));
  }
  const historyKeys: readonly MultipleKey[] = [
    ...DERIVED_HISTORY_KEYS,
    "priceToTbv",
    "priceToFfo",
    "priceToAffo",
  ];
  if (requiresHistoricalClassScope) {
    for (const key of historyKeys) delete vendor[key];
    const reason = "Current issuer-common capitalization resolves economic classes. Historical numerators require each market day's own sourced price/currency and effective inventory filed by that day; unproven rows and vendor aggregate fallback are withheld, and today's counts are never applied to the past. Current P/E from price/EPS requires historical quoted-unit EPS evidence; historical capitalization/common-income P/E is a different construction and is withheld when equivalence is not established.";
    notes.push(reason);
    gaps.push(gapEntry("valuation.multiples.ownHistory.economicClassBasis", reason, "warn"));
  }
  let usedVendor = false;
  const derivedHistoryKeys = new Set<MultipleKey>();
  for (const key of historyKeys) {
    const ownValues = derived.series[key];
    const vendorValues = vendor[key];
    if ((ownValues?.length ?? 0) >= MIN_HISTORY_OBS_FOR_BAND) {
      derivedHistoryKeys.add(key);
      history[key] = ownValues;
      historyDetails[key] = derived.details[key];
      historyBasisByKey[key] =
        derivedBasis +
        (requiresHistoricalClassScope && key === "peTtm" && price !== null && eps !== null
          ? ". P/E construction: historical quoted price / sum of four quoted-unit diluted EPS observations; capitalization/common-income P/E is not substituted" : "") +
        (removeOperatingLease && vendorEvKeys.includes(key)
          ? ". Each historical enterprise value removes that quarter's OWN operating-lease liability, the same adjustment the current EV carries"
          : "") +
        (ffoKeys.includes(key)
          ? ". FFO per window = net income + income-statement D&A over four quarters (AFFO = FFO − |capex|); the current figure is the latest fiscal year's on the same construction"
          : "");
    } else if ((vendorValues?.length ?? 0) >= MIN_HISTORY_OBS_FOR_BAND) {
      history[key] = vendorValues;
      const vendorField: Partial<Record<MultipleKey, keyof VendorMultiplesRow>> = { evToSales: "evToSales", evToEbitda: "evToEBITDA", peTtm: "priceToEarningsRatio", priceToBook: "priceToBookRatio", priceToFcf: "priceToFreeCashFlowRatio" };
      const field = vendorField[key];
      historyDetails[key] = (inputs.keyMetricsHistory ?? []).flatMap(row => {
        const value = field ? row[field] : undefined;
        return typeof value === "number" && Number.isFinite(value) && value > 0 ? [{ periodEnd: row.date, marketDate: null, value, source: "vendor-ratio" as const }] : [];
      }).slice(0, FULL_OWN_HISTORY_OBS);
      historyBasisByKey[key] = vendorBasis;
      usedVendor = true;
    }
  }
  if (usedVendor) {
    notes.push("own-history bands built from vendor pre-baked multiples (raw derivation unavailable)");
  }
  if (!historyKeys.some((key) => (history[key]?.length ?? 0) >= MIN_HISTORY_OBS_FOR_BAND)) {
    if (!priceCurrency.comparable && (inputs.keyMetricsHistory?.length ?? 0) > 0) {
      notes.push(`vendor pre-baked multiple history skipped: ${priceCurrency.reason}`);
    }
    gaps.push(gapEntry("valuation.multiples.ownHistory", `insufficient history (need ≥${MIN_HISTORY_OBS_FOR_BAND} quarters) to rank the current multiple among the issuer's own quarters (window up to 5y)`, "info"));
  }

  // --- Assemble ---------------------------------------------------------------
  const universalKeys: MultipleKey[] = ["peTtm", "evToEbitda", "evToSales", "priceToFcf", "priceToBook", "priceToTbv"];
  const keys: MultipleKey[] =
    route === "reit" ? [...universalKeys, "priceToFfo", "priceToAffo"] : universalKeys;
  // Honest period labels: when TTM was suppressed upstream (incomplete
  // quarterly data) the income/cash-flow slice is the latest ANNUAL row — the
  // multiples table must say so instead of claiming "(TTM)".
  const incomeBasisLabel =
    inputs.incomeTtm?.basis === "annual"
      ? `latest annual FY ${inputs.incomeTtm.date} — TTM suppressed`
      : "TTM";
  const cashFlowBasisLabel =
    inputs.cashFlowTtm?.basis === "annual"
      ? `latest annual FY ${inputs.cashFlowTtm.date} — TTM suppressed`
      : "TTM";
  const incomePeriod = inputs.incomeTtm === null || inputs.incomeTtm === undefined || inputs.incomeTtm.date === "" ? undefined : period(inputs.incomeTtm);
  if (inputs.incomeTtm?.basis === "annual") {
    notes.push(
      "income-derived multiples use the latest ANNUAL statement — TTM was suppressed (incomplete quarterly data)",
    );
  }
  if (inputs.cashFlowTtm?.basis === "annual") {
    notes.push(
      "cash-flow-derived multiples use the latest ANNUAL statement — TTM was suppressed (incomplete quarterly data)",
    );
  }
  // Honest balance-period label (P1): say WHICH balance row anchors the point-in-time multiples
  // instead of a vague "(latest)".
  const balanceBasisLabel =
    bal?.basis === "quarter"
      ? `latest quarterly balance sheet ${bal.date}`
      : bal?.basis === "annual"
        ? `latest annual balance sheet ${bal.date}`
        : "latest";
  const commonDenominator = price !== null && eps !== null || capital.commonIncome === null || !inputs.reportedCurrency || !inc
    ? undefined : { value: capital.commonIncome, currency: inputs.reportedCurrency,
      period: inc.date, quarters: inc.basis === "ttm" ? inc.commonIncomeQuarters ?? [] : [] };
  const denominatorText = commonDenominator === undefined ? "" :
    `. Common income ${fmtMoney(commonDenominator.value)} ${commonDenominator.currency}, ${incomeBasisLabel} ended ${commonDenominator.period}` +
    (commonDenominator.quarters.length === 4
      ? " = " + [...commonDenominator.quarters].reverse().map(commonIncomeQuarterText).join(" + ")
      : inc?.basis === "annual" ? "; filed annual flow, not four quarterly observations" : "; four-quarter component evidence unavailable") + ".";
  const basisByKey: Record<MultipleKey, string> = {
    peTtm: (price !== null && eps !== null
      ? `${epsBasis} (${incomeBasisLabel})`
      : `market cap / common income (${incomeBasisLabel}; aggregate basis; ${capital.incomeBasis}); diluted EPS not used: ${price === null ? "no quote price" : epsUnused}`) + denominatorText +
      (price !== null && eps !== null && inc?.basis !== "annual" && inc?.epsDilutedBasis === "sum-quarterly-diluted-eps"
        ? ". EPS convention: sum of four reported quarterly diluted EPS observations; annual or year-to-date GAAP diluted EPS is not reconstructed. Share-count changes and period-specific anti-dilution can make the results differ; a common split basis is not independently verified by this sum."
        : ""),
    evToEbitda: `EV / (operating income + D&A), ${incomeBasisLabel}-computed — the vendor EBITDA field is not used. ${evBridgeBasis} Balance basis: ${balanceBasisLabel}.` +
      (ebitdaLowerBound === null ? "" : ` ${ebitdaLowerBound}.`),
    evToSales: `EV / revenue (${incomeBasisLabel}). ${evBridgeBasis}`,
    priceToFcf:
      `market cap / (operating cash flow + capital expenditure) (${cashFlowBasisLabel}; the provider records capex as negative) — free cash flow BEFORE ` +
      "stock-based compensation, the vendor convention, which is also the basis of the own-history distribution this multiple is " +
      "ranked in. The capital block deducts SBC where disclosed and otherwise labels free cash flow unadjusted; its treatment is stated separately",

    priceToBook: `market cap / common equity (${balanceBasisLabel}; ${capital.equityBasis}); carrying parent common-equity measure: repurchases and omitted internally generated intangibles can limit comparison; this ratio does not independently establish expensiveness`,
    priceToTbv: `market cap / (common equity - goodwill - intangible assets); deducts goodwill ${bal?.goodwill ?? "unavailable"} and intangible assets ${bal?.intangibleAssets ?? "unavailable"} (source monetary units; vendor composition unverified unless stated). ${bal?.tangibleBookDeductionBasis ?? ""} (${balanceBasisLabel}; ${capital.equityBasis}; undisclosed preferred assumed zero only when no material preferred amount is known)`,
    priceToFfo: "market cap / FFO (approx., caller-provided)",
    priceToAffo: "market cap / AFFO (rough, caller-provided)",
  };
  const multiples: MultipleStat[] = keys.map((key) => {
    if (key === "evToSales" && inputs.revenueEligibilityReason) {
      return { key, current: null, basis: inputs.revenueEligibilityReason, ownHistory: null, peers: null };
    }
    if (ffoSubmapUndetermined && (key === "priceToFfo" || key === "priceToAffo")) {
      return { key, current: null, basis: ffoSubmapReason, ownHistory: null, peers: null };
    }
    if (financialsRoute && (key === "priceToFcf" || key === "evToEbitda" || key === "evToSales")) {
      return { key, current: null, basis: "Not applicable to financial companies: debt is an operating input and industrial free cash flow is not meaningful.", ownHistory: null, peers: null };
    }
    if (key === "priceToFcf" && parentFcfScope) {
      return { key, current: null, basis: `${basisByKey[key]}. ${parentFcfScope}`, ownershipScope: parentFcfScope,
        ownHistory: null, peers: null };
    }
    const cur = current[key] ?? null;
    const rankedCurrent = key === "peTtm" && price !== null && eps !== null
      && peHistoryConstruction === "capitalization-common-income" && derivedHistoryKeys.has(key)
      ? { value: safeDiv(mcap, posOrNull(capital.commonIncome)), construction: "capitalization-common-income" as const } : null;
    const rankBasis = rankedCurrent === null ? "" : rankedCurrent.value === null
      ? `. Not ranked: common income is withheld (${capital.incomeWithheldReason ?? "positive common income unavailable"}), and price / diluted EPS is a different construction from this market cap / common income history`
      : `. Rank construction: the P/E shown is price / diluted EPS; it is ranked as market cap / common income (${fmtNum(rankedCurrent.value)}x), the construction of every window in this history, because the diluted share count behind EPS and the outstanding count behind market cap differ`;
    const ownHistory = priceCurrency.comparable && marketCapSecurityKnown
      ? bandFor(history[key], rankedCurrent ? rankedCurrent.value : cur, (historyBasisByKey[key] ?? "no usable multiple history") + rankBasis, historyDetails[key]) : null;
    if (ownHistory && rankedCurrent) ownHistory.rankedCurrent = rankedCurrent;
    const comparison = comparablePeers(inputs.subjectEconomicEvidence, inputs.peers ?? [], key, inputs.peerComparisonAsOf ?? null);
    if (comparison.excluded.length) {
      const disclosure = `${key}: economic/accounting comparability excluded ${comparison.excluded.map((peer) => `${peer.symbol} (${peer.reasons.join("; ")})`).join(", ")}; raw peer observations retained; no median uses excluded rows`;
      notes.push(disclosure);
      gaps.push(gapEntry(`valuation.multiples.peers.${key}.comparability`, disclosure, "info"));
    }
    // A median that rests on the screen alone says so beside itself.
    for (const caveat of comparison.caveats) {
      notes.push(caveat);
      gaps.push(gapEntry(`valuation.multiples.peers.${key}.comparabilityCaveat`, caveat, "info"));
    }
    return {
      key,
      current: cur,
      basis: basisByKey[key],
      ...(key === "peTtm" && commonDenominator !== undefined ? { earningsDenominator: commonDenominator } : {}),
      ...(key === "priceToFcf" && historicalFcfScope ? { basis: `${basisByKey[key]}. ${historicalFcfScope}`, historyScope: historicalFcfScope } : {}),
      ...(key === "evToEbitda" && ebitdaLowerBound !== null && cur !== null ? { ebitdaLowerBound: { basis: ebitdaLowerBound } } : {}),
      ...(incomePeriod !== undefined && (key === "peTtm" || key === "evToEbitda" || key === "evToSales") ? { period: incomePeriod } : {}),
      ownHistory,
      peers: peerStats(comparison.eligible.map((p) => p.multiples[key]), notes, key),
    };
  });
  // D-98 (gain-inflated earnings): GAAP earnings can be carried by gains below operating income, so a
  // P/E on them can read far below the P/E on operating earnings. The P/E is still shown, flagged,
  // and is not ranked.
  const pretaxTtm = inc?.incomeBeforeTax ?? null;
  const operatingTtm = inc?.operatingIncome ?? null;
  const share = nonOperatingShareOfPretax(pretaxTtm, operatingTtm);
  if (share !== null && isNum(pretaxTtm) && isNum(operatingTtm)) {
    const pe = multiples.find((m) => m.key === "peTtm");
    if (pe !== undefined && pe.current !== null && share > GAIN_INFLATED_NON_OPERATING_SHARE) {
      const basis = `pre-tax income ${fmtNum(pretaxTtm)} (${incomeBasisLabel}) includes non-operating income of ${fmtNum(pretaxTtm - operatingTtm)}, ` +
        `${fmtNum(share * 100)}% of pre-tax income (above ${GAIN_INFLATED_NON_OPERATING_SHARE * 100}%): the P/E rests on earnings that gains, not operations, carry, ` +
        "so it is not ranked against its own history";
      pe.gainInflatedEarnings = { nonOperatingSharePct: share * 100, basis };
      notes.push(`peTtm: ${basis}.`);
    }
  }
  /*
   * D-19: state N per multiple. The report's multiples table carries the rank but not the window
   * size, so the sentence that makes the number readable - "rank among N quarters", never
   * "percentile" - is published here.
   */
  for (const m of multiples) {
    const band = m.ownHistory;
    if (band === null) continue;
    if (band.percentileRank === null) {
      notes.push(`${m.key}: own-history empirical percentile rank (${band.observations} observations) unavailable; ${band.rankedCurrent?.value === null ? "not ranked: common income is withheld" : percentileRank(history[m.key] ?? [], history[m.key]?.[0] ?? NaN) === null ? "flat history is uninformative" : "current multiple is unavailable"}, so no own-history grade signal is available.`);
      continue;
    }
    notes.push(
      `${m.key}: own-history empirical percentile rank ${fmtNum(band.percentileRank)} on a 0-100 scale, based on ${band.observations} observations. ` +
        "This is a relative position in the retained sample, not an ordinal quarter rank; input comparability and the small sample limit interpretation.",
    );
  }

  // Negative denominators were already nulled via posOrNull; belt-and-braces:
  for (const m of multiples) {
    if (m.current !== null && m.current <= 0) {
      m.current = null;
      // The own-history rank was computed from this value before it was ruled
      // not-meaningful, so it must go too — otherwise the report shows a
      // rank (typically 0) for a multiple it prints as n/m. The
      // distribution (p5..p95, observations) is independent of `current` and
      // stays.
      if (m.ownHistory !== null) m.ownHistory = { ...m.ownHistory, percentileRank: null };
      notes.push(`${m.key}: negative/zero multiple rendered n/m`);
    }
  }

  return {
    multiples,
    ...(inputs.peerCoverage ? { peerCoverage: inputs.peerCoverage } : {}),
    enterpriseValue,
    sectorAppropriate: SECTOR_APPROPRIATE_MULTIPLES[route],
    asOf: { quote: null, statements: inc?.date ?? bal?.date ?? null },
    notes,
    gaps,
  };
}
