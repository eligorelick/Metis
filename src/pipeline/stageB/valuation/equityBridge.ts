/** Enterprise-to-common per-share bridge; count senior claims once (P15; D-102, D-135). */
import { type ManifestEntry } from "@/types/core";
import { isNum, gapEntry, posOrNull, fmtNum } from "./primitives";
import { millions } from "@/pipeline/stageB/netDebt";
import { type DcfBridge } from "./dcf";
import { type ValuationBundleInputs } from "./company";


/**
 * EV → equity → per-share bridge. Equity = EV − net debt − minority interest −
 * preferred equity, mirroring the multiples-path EV definition (which ADDS
 * preferred + minority to market cap). Undisclosed minority/preferred are 0 (FMP
 * convention). Net debt is required — without it EV cannot be bridged.
 */
function bridgeToPerShare(
  enterpriseValue: number,
  netDebt: number | null,
  dilutedShares: number | null,
  gaps: ManifestEntry[],
  minorityInterest: number | null = null,
  preferred: number | null = null,
  nonOperatingAssets: number | null = null,
  noncontrollingEarningsShare: number | null = null,
  unsplitTemporaryEquity: number = 0,
): { equityValue: number | null; perShare: number | null; noncontrollingDeducted: number; noncontrollingBasis: "book" | "earnings-share"; unsplitWithheld?: true } {
  const book = isNum(minorityInterest) ? minorityInterest : 0;
  if (!isNum(netDebt)) {
    gaps.push(
      gapEntry("valuation.dcf.netDebt", "net debt unavailable — enterprise value cannot be bridged to equity", "warn"),
    );
    return { equityValue: null, perShare: null, noncontrollingDeducted: book, noncontrollingBasis: "book" };
  }
  // E-5: consolidated equity value, the claim common and NCI holders share.
  const consolidatedEquity =
    enterpriseValue - netDebt - (isNum(preferred) ? preferred : 0) + (isNum(nonOperatingAssets) ? nonOperatingAssets : 0);
  const { deducted, basis } = noncontrollingDeduction(consolidatedEquity, book, noncontrollingEarningsShare);
  const equityValue = consolidatedEquity - deducted;
  const shares = posOrNull(dilutedShares);
  if (shares === null) {
    gaps.push(
      gapEntry("valuation.dcf.dilutedShares", "diluted share count missing or non-positive — per-share value unavailable", "warn"),
    );
    return { equityValue, perShare: null, noncontrollingDeducted: deducted, noncontrollingBasis: basis };
  }
  // FIN-119: an unsplit temporary-equity total may be NCI the earnings key already sizes, so
  // wherever the deduction is on the earnings share (the base, a grid cell, a scenario path) it is withheld.
  if (unsplitTemporaryEquity !== 0 && basis === "earnings-share") {
    return { equityValue, perShare: null, noncontrollingDeducted: deducted, noncontrollingBasis: basis, unsplitWithheld: true };
  }
  return { equityValue, perShare: equityValue / shares, noncontrollingDeducted: deducted, noncontrollingBasis: basis };
}

/** FIN-119: the sentence a grid, reverse DCF or scenario note carries when its own cells or paths were withheld by the unsplit rule. */
export const UNSPLIT_CELLS_LEAD = "Cells where the noncontrolling deduction takes the profit share are withheld";
export function unsplitCellsNote(unsplit: number): string {
  return `${UNSPLIT_CELLS_LEAD}: the filed temporary-equity total of ${millions(unsplit)} is not split between redeemable preferred and redeemable noncontrolling interests, so it could be counted twice.`;
}

/** FIN-119: why the per share is withheld when an unsplit temporary-equity total meets the E-5 earnings key. */
function unsplitEarningsKeyReason(unsplit: number): string {
  return `The filed temporary equity of ${millions(unsplit)} has no parent/NCI split, and the noncontrolling interest is sized on its share of earnings, so the unsplit amount may be noncontrolling interest that the earnings key already counts. ` +
    "The per-share value is withheld rather than deduct it twice (FIN-119).";
}

/* D-102: Apply the established noncontrolling earnings key consistently in the common-equity bridge. */
export const NCI_EARNINGS_KEY_MATERIALITY_PCT = 10;

/**
 * E-5: a consolidated FCFF DCF values the outside holders' share of the
 * subsidiaries too. When NCI earns more than NCI_EARNINGS_KEY_MATERIALITY_PCT
 * of trailing consolidated profit and that share of consolidated equity value
 * exceeds the book NCI (profit share > book ÷ consolidated equity value), NCI is
 * deducted at the profit share; otherwise at book.
 */
function noncontrollingDeduction(consolidatedEquity: number, book: number, share: number | null): { deducted: number; basis: "book" | "earnings-share" } {
  if (isNum(share) && share * 100 > NCI_EARNINGS_KEY_MATERIALITY_PCT && consolidatedEquity > 0 && share * consolidatedEquity > book) {
    return { deducted: share * consolidatedEquity, basis: "earnings-share" };
  }
  return { deducted: book, basis: "book" };
}

/* D-102: Apply the established noncontrolling earnings key consistently in the common-equity bridge. */
export function noncontrollingProfitShareText(bridge: Pick<DcfBridge, "noncontrollingEarningsShare" | "noncontrollingEarningsAsOf" | "noncontrollingEarningsBasis">): string {
  const share = bridge.noncontrollingEarningsShare ?? 0;
  const period = bridge.noncontrollingEarningsBasis === "annual" ? "fiscal-year" : "trailing";
  return `${(share * 100).toFixed(1)}% share of ${period} consolidated profit${bridge.noncontrollingEarningsAsOf ? ` to ${bridge.noncontrollingEarningsAsOf}` : ""}`;
}

/** E-5: why a share that is on record still leaves the deduction at book. */
export function noncontrollingBookReason(share: number): string {
  return share * 100 > NCI_EARNINGS_KEY_MATERIALITY_PCT ? "would deduct no more than book" : `is not above the ${NCI_EARNINGS_KEY_MATERIALITY_PCT}% house threshold`;
}

/** The income-statement fields the E-5 key reads, from a TTM window or an annual row. */
export interface NoncontrollingEarningsRow {
  date?: string | null;
  netIncome?: number | null;
  netIncomeConsolidated?: number | null;
  netIncomeOwnershipBasis?: "parent" | "consolidated";
  netIncomeAttributableToNoncontrollingInterest?: number | null;
  /** The NCI income came from a filed fact (every quarter of a window); a vendor row can emit an omitted field as 0. */
  noncontrollingIncomeEvidenced?: boolean;
  /** A quarter of the window reports zero NCI income without a filed fact, so a nonzero sum may still omit it. */
  noncontrollingIncomeUnevidencedZero?: boolean;
}

/**
 * E-5: NCI's profit and consolidated profit for the earnings key. The trailing
 * four quarters when they carry both, else the latest fiscal year (the DCF's
 * own income falls back the same way). Parent net income plus NCI income is
 * consolidated profit only when the net income is known to be the parent's.
 */
export function noncontrollingEarningsInput(ttm: NoncontrollingEarningsRow | null, annual: NoncontrollingEarningsRow | null): NonNullable<ValuationBundleInputs["noncontrollingEarnings"]> | null {
  const read = (row: NoncontrollingEarningsRow | null, basis: "ttm" | "annual") => {
    if (row === null) return null;
    const reported = isNum(row.netIncomeAttributableToNoncontrollingInterest) ? row.netIncomeAttributableToNoncontrollingInterest : null;
    // A zero establishes a 0% share only when a filing reports it, and a sum
    // with an unevidenced zero quarter may omit that quarter's NCI income.
    const nci = (reported === 0 && row.noncontrollingIncomeEvidenced !== true) || row.noncontrollingIncomeUnevidencedZero === true ? null : reported;
    const net = isNum(row.netIncome) ? row.netIncome : null;
    const consolidatedProfit = isNum(row.netIncomeConsolidated) ? row.netIncomeConsolidated
      : row.netIncomeOwnershipBasis === "consolidated" ? net
      : row.netIncomeOwnershipBasis === "parent" && net !== null && nci !== null ? net + nci
      : null;
    return { noncontrollingIncome: nci, consolidatedProfit, asOf: row.date ? row.date.slice(0, 10) : null, basis };
  };
  const trailing = read(ttm, "ttm");
  const fiscal = read(annual, "annual");
  // Usable: both figures, positive consolidated profit, and NCI income within it (the rule valueCompany applies).
  const usable = (key: ReturnType<typeof read>) => key !== null && key.noncontrollingIncome !== null && key.consolidatedProfit !== null &&
    key.consolidatedProfit > 0 && key.noncontrollingIncome <= key.consolidatedProfit;
  return usable(trailing) ? trailing : usable(fiscal) ? fiscal : trailing ?? fiscal;
}

/** E-5: the DCF note naming which NCI basis the bridge used, and the other one. */
function noncontrollingBridgeNote(bridge: DcfBridge, consolidatedEquity: number | null): string {
  const book = bridge.minorityInterest ?? 0;
  const share = bridge.noncontrollingEarningsShare;
  if (bridge.noncontrollingDeductionBasis === "earnings-share" && isNum(share)) {
    return `equity bridge deducts noncontrolling interest at its ${noncontrollingProfitShareText(bridge)}: ` +
      `${fmtNum(bridge.noncontrollingDeducted ?? 0)} of consolidated equity value ${consolidatedEquity === null ? "unavailable" : fmtNum(consolidatedEquity)}, ` +
      `above its book value ${fmtNum(book)} (house rule: the earnings key applies above ${NCI_EARNINGS_KEY_MATERIALITY_PCT}% of profit when it exceeds the book deduction; audit 2026-10-22 E-5)`;
  }
  return `equity bridge deducts noncontrolling interest at its book value ${fmtNum(book)}` +
    (isNum(share)
      ? ` — its ${noncontrollingProfitShareText(bridge)} ${noncontrollingBookReason(share)}`
      : "") +
    " (a filed book-value proxy, not a market value)";
}
export { bridgeToPerShare, unsplitEarningsKeyReason, noncontrollingBridgeNote };
