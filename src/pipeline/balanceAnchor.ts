/**
 * Balance anchor selection, split out of compute.ts: the balance row the valuation's net debt,
 * invested capital and EV bridge read, and the typed cause when a row is refused, incomplete or has
 * unresolved noncontrolling ownership (P7, P11, P15).
 */

import { noncontrollingOwnershipUnresolved } from "@/pipeline/stageB/ownership";
import type { FmpBalanceSheetRow } from "@/providers/fmp";
import { leaseDebtConflict, type LeaseDebtInputs } from "@/pipeline/stageB/netDebt";
import { temporaryEquityClaims, temporaryEquityOperands } from "@/pipeline/stageB/seniorClaims";
import { leaseDebtScopeRefusal } from "@/pipeline/stageB/leaseScope";
import { statementEquityOwnershipBasis } from "./stageBAdapters";
import { isoDay, num } from "./bundleRows";

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
 * The ownership test the DCF's NCI gate applies, on a statement row: the P5
 * owner's one predicate (`noncontrollingOwnershipUnresolved`,
 * src/pipeline/stageB/ownership.ts; D-248), given the row's own figures and
 * what its provenance establishes. One test for the gate, for the bridge row
 * choice and for every valuation gate.
 */
export function noncontrollingOwnershipUnresolvedAt(row: FmpBalanceSheetRow | null): boolean {
  return row !== null && noncontrollingOwnershipUnresolved({
    totalEquity: num(row.totalEquity),
    totalStockholdersEquity: num(row.totalStockholdersEquity),
    minorityInterest: num(row.minorityInterest),
    equityOwnershipBasis: statementEquityOwnershipBasis(row),
  });
}
/**
 * Why the DCF bridge cannot be built on this row (the refusal test, the gate's ownership test, or a lease or
 * temporary-equity refusal the DCF raises on the row it reads); null when it can. The DCF reads the bridge row for the
 * sales-to-capital lease scope, the bridge's lease integrity and scope, and the temporary-equity operands, so the row
 * choice must refuse the same rows (B4a final review I-2): a refused candidate or anchor keeps main's row, never cured
 * by another date.
 */
function balanceRowBlockReason(row: object, includeLeases = false): string | null {
  // The refusal test lives once, in `balanceRowRefused`; this only words it.
  if (balanceRowRefused(row)) {
    const refused = REFUSABLE_ANCHOR_FIELDS.find(field => (row as FmpBalanceSheetRow).fieldConflicts?.[field]?.usable === false);
    if (refused === undefined) return "consolidated equity with no filed parent/NCI split";
    const why = (row as FmpBalanceSheetRow).fieldConflicts?.[refused]?.reason;
    return `${refused} refused${why ? `: ${why}` : ""}`;
  }
  if (noncontrollingOwnershipUnresolvedAt(row as FmpBalanceSheetRow)) return "noncontrolling ownership unresolved";
  const leaseConflict = leaseDebtConflict(row as LeaseDebtInputs);
  if (leaseConflict !== null) return `lease inputs conflict: ${leaseConflict}`;
  const leaseScope = leaseDebtScopeRefusal(row as FmpBalanceSheetRow, includeLeases);
  if (leaseScope !== null) return `lease scope refused: ${leaseScope}`;
  const temporaryRefusal = temporaryEquityClaims(temporaryEquityOperands(row))?.refusal ?? null;
  if (temporaryRefusal !== null) return temporaryRefusal;
  return null;
}
function balanceRowBlocksBridge(row: object, includeLeases = false): boolean {
  return balanceRowBlockReason(row, includeLeases) !== null;
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
 * suppress the DCF again) and not blocked (`balanceRowBlocksBridge`: a parser
 * refusal, unresolved ownership, a lease conflict, a lease-scope refusal or a
 * refused temporary-equity operand) is the row. Otherwise the anchor stands, which is main's row and main's figure, and
 * `cause` says why. A blocked anchor always stands: its refusal is never cured
 * by another date.
 */
export function dcfBridgeRow<TRow extends { date?: unknown } & Partial<Record<(typeof BALANCE_ANCHOR_FIELDS)[number], unknown>>>(
  statementDate: string | null,
  statementBasis: "annual" | "ttm" | null,
  quarterly: readonly TRow[],
  annual: readonly TRow[],
  fallback: { row: TRow | null; basis: "quarter" | "annual" | null },
  /** The run's own lease switch (`evIncludeLeases`), which the lease-scope refusal reads. */
  includeLeases = false,
): { row: TRow | null; basis: "quarter" | "annual" | null; matchesStatement: boolean; cause: BridgeRowCause; detail: string | null } {
  const anchorAt = fallback.row !== null && statementDate !== null && isoDay(fallback.row.date) === statementDate;
  const keep = (cause: BridgeRowCause, detail: string | null) =>
    ({ row: fallback.row, basis: fallback.basis, matchesStatement: anchorAt, cause, detail });
  if (fallback.row !== null && balanceRowBlocksBridge(fallback.row, includeLeases)) return keep("anchor-refused", balanceRowBlockReason(fallback.row, includeLeases));
  if (statementDate === null) return keep("none-filed", null);
  const q = quarterly.map((row) => ({ row, basis: "quarter" as const }));
  const a = annual.map((row) => ({ row, basis: "annual" as const }));
  const candidates = (statementBasis === "annual" ? [...a, ...q] : [...q, ...a]).filter((c) => isoDay(c.row.date) === statementDate);
  const hit = candidates.find((c) => balanceRowWhole(c.row) && !balanceRowBlocksBridge(c.row, includeLeases));
  if (hit !== undefined) return { row: hit.row, basis: hit.basis, matchesStatement: true, cause: "statement-row", detail: null };
  const blocked = candidates.find((c) => balanceRowBlocksBridge(c.row, includeLeases));
  if (blocked !== undefined) return keep("statement-row-refused", balanceRowBlockReason(blocked.row, includeLeases));
  const incomplete = candidates[0];
  if (incomplete !== undefined) return keep("incomplete", balanceRowMissing(incomplete.row).join(", "));
  return keep("none-filed", null);
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
