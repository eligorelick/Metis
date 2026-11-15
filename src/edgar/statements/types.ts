/** Statement result contracts and restatement policy; keep provenance and substitutions explicit (P20; D-12, D-13). */
import { type VendorSplitEvidence } from "@/providers/splitEvents";
import { type ManifestEntry } from "@/types/core";
import { type StatementName } from "./assembly";
import { type FmpIncomeStatementRow, type FmpBalanceSheetRow, type FmpCashFlowRow } from "@/providers/fmp";
import { type StockSplits } from "@/edgar/splits";


// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface StatementBuildOptions {
  /**
   * Route revenue and operating income through the bank chains regardless of
   * how the facts are tagged. The builder's own detection
   * (`looksLikeBankTagging`) needs the ASC-606 revenue tags to be ABSENT, so a
   * bank that also tags its fee revenue under them is invisible to it and
   * would publish fee income as revenue; the caller knows the issuer's
   * industry (SIC) and passes it here. `undefined` leaves the decision to the
   * tagging heuristic.
   */
  bankRevenue?: boolean;
  symbol: string;
  /** 10-digit or raw CIK; copied verbatim onto every row. */
  cik: string | null;
  annualPeriods: number;
  quarterlyPeriods: number;
  /** ISO analysis date. */
  asOf: string;
  /** Actual acquisition timestamp when supplied by the provider adapter. */
  factsObservedAt?: string;
  /**
   * The price vendor's split events (src/providers/splitEvents.ts). Required:
   * a caller that has none passes an `unavailable` answer, and then no share
   * count or per-share figure is published, because a split since it was filed
   * cannot be ruled out.
   */
  vendorSplits: VendorSplitEvidence;
  /**
   * The session whose share basis every share count and per-share figure is
   * put on: the session of the price they will be compared with. Defaults to
   * `asOf`.
   */
  basisDay?: string;
}

/** A share or per-share fact left out because its split basis could not be established. */
export interface ShareBasisWithheld {
  concept: string;
  /** Period end (instant or duration end). */
  end: string;
  filed: string;
  reason: string;
}

export type Derivation = "ytd-difference" | "fy-minus-ytd" | "fy-minus-quarters" | "fy-share-identity";

export interface StatementRowsResult<TRow> {
  /** date DESC (newest fiscal period first). */
  rows: TRow[];
  notes: string[];
  gaps: ManifestEntry[];
  /** Concepts a fallback step served instead of the concept's own tag, with the periods it served. */
  substitutions: Substitution[];
  /**
   * Material lines whose last-filed value moved by more than
   * `RESTATEMENT_THRESHOLD_PCT` of the value the period was first reported
   * with. The rows carry the same facts as `original` / `restated`; this list
   * is the statement-level flag the forensics module and the manifest read.
   */
  restatements: Restatement[];
  /**
   * Fields left null on purpose, with the reason: the operands were present but
   * the filed tags make the derivation unsound (a double-counted interest
   * add-back, a negative derived quarter). Never a zero — see invariant 1.
   */
  withheld: Withholding[];
}

/** A filing's identity, as carried on `original` values and restatement flags. */
export interface FilingRef {
  accn: string;
  filed: string;
  form: string;
}

/**
 * The value a period was FIRST reported with, kept beside the last-filed value
 * that the row carries. Present only on fields resolved directly from a fact
 * (never on a derived quarter, whose operands may each have their own).
 */
export interface OriginalValue extends FilingRef {
  value: number;
}

/**
 * One material line whose last-filed value differs from the first-filed one by
 * more than the threshold. "Restatement" is the common case but not the only
 * one: a comparative RE-PRESENTED for discontinued operations or a change of
 * reportable segments moves identically, and companyfacts carries nothing that
 * separates the two — the disclosures say so.
 */
export interface Restatement {
  /** Row date (fiscal period end). */
  date: string;
  field: string;
  original: number;
  restated: number;
  /**
   * Signed change as a percentage of the original value, or `null` when the
   * original was zero and no percentage is defined. Never Infinity: it rendered
   * as "Infinity%" in manifest reasons and serialised to an accidental `null`.
   */
  changePct: number | null;
  originalFiling: FilingRef;
  restatedFiling: FilingRef;
}

/** A material line moving by more than this share of its prior value is a restatement flag. */
export const RESTATEMENT_THRESHOLD_PCT = 1;

/** The lines whose restatement is material enough to flag, per statement. */
const MATERIAL_FIELDS: Record<StatementName, readonly string[]> = {
  income: ["revenue", "netIncome"],
  balance: ["totalAssets", "totalStockholdersEquity"],
  cashflow: ["operatingCashFlow"],
};

/**
 * One field of one statement resolved by a stand-in rather than its own tag
 * (cash interest paid for interest expense; pretax income + interest for
 * EBIT). `text` is the step's `disclose` wording; `periods` lists every row
 * date it served, newest first.
 */
export interface Substitution {
  field: string;
  text: string;
  periods: string[];
}

/**
 * A field whose operands were all present but whose derivation the filed tags
 * make unsound, so no figure is published for the period. Same shape as
 * `Substitution`, and the keyless layer files it in the manifest the same way —
 * as a `warn`, because a withheld figure is a hole a reader has to see.
 */
export interface Withholding {
  field: string;
  text: string;
  periods: string[];
}

/* D-30: A share count requires an established date and basis before it meets a price. */
export type SharesBasis = "dei cover page" | "balance sheet CommonStockSharesOutstanding";

export interface SharesOutstandingPoint {
  value: number;
  asOf: string;
  basis: SharesBasis;
  /**
   * The per-class cover counts summed into `value` when the filing reported
   * `dei:EntityCommonStockSharesOutstanding` once per share class (same
   * accession, same date, distinct facts). Companyfacts drops the class
   * dimension, so the classes are unnamed; the order is as filed. Absent when
   * the count came from a single fact.
   */
  classes?: number[];
  /** The filing the count (or the summed per-class counts) came from. */
  filing?: FilingRef;
  /**
   * Unestablished class-sum scope: repeated values may represent a second class, and unequal
   * class economics can make the raw sum unsuitable for economic ownership. Omitted when neither
   * ambiguity applies.
   */
  classNotes?: string[];
}

export interface BuiltStatements {
  incomeAnnual: StatementRowsResult<FmpIncomeStatementRow>;
  incomeQuarterly: StatementRowsResult<FmpIncomeStatementRow>;
  balanceAnnual: StatementRowsResult<FmpBalanceSheetRow>;
  balanceQuarterly: StatementRowsResult<FmpBalanceSheetRow>;
  cashflowAnnual: StatementRowsResult<FmpCashFlowRow>;
  cashflowQuarterly: StatementRowsResult<FmpCashFlowRow>;
  /** Latest shares outstanding (cover page, else balance sheet) and public float. */
  shares: {
    outstanding: SharesOutstandingPoint | null;
    publicFloat: { value: number; asOf: string } | null;
  };
  reportedCurrency: string | null;
  /**
   * True when at least one foreign-private-issuer annual-report point (Form
   * 20-F or 40-F) was used; the keyless profile reads it as the ADR flag.
   */
  filesTwentyF: boolean;
  /**
   * True when a Form 20-F point was used. A 40-F filer is a Canadian MJDS
   * issuer whose quoted security is its common share; a 20-F filer's may be a
   * depositary share, so the keyless market cap reads this flag.
   */
  filesForm20F: boolean;
  /**
   * The resolved stock splits (see src/edgar/splits.ts) and one note per split.
   * The note texts are also carried on the income and balance rows' notes.
   */
  splits: StockSplits;
  /** The session every share count and per-share figure here is stated on the basis of. */
  basisDay: string;
  /** Share and per-share facts left out because their basis on `basisDay` could not be established. */
  shareBasisWithheld: ShareBasisWithheld[];
  /** Raw observations excluded before period deduplication; no currency conversion is inferred. */
  factExclusions: StatementFactExclusion[];
}

export interface StatementFactExclusion {
  concept: string;
  unit: string;
  start?: string;
  end: string;
  filed: string;
  accn: string;
  value: number;
  reason: "future_filing" | "future_period" | "invalid_date";
}
export { MATERIAL_FIELDS };
