/**
 * D-61 — what the issuer actually paid for its repurchased shares.
 *
 * The cash-flow statement says how many dollars went to buybacks, never at
 * what price. Filers tag the share count and its cost for the same period in
 * their equity statement (us-gaap StockRepurchasedDuringPeriodShares/Value,
 * StockRepurchasedAndRetiredDuringPeriodShares/Value or
 * TreasuryStockSharesAcquired/TreasuryStockValueAcquiredCostMethod), so cost ÷
 * shares is the average price actually paid — the quantity repurchase-timing
 * studies compare with the market's average price over the same window
 * (Dittmar & Field 2015, "Can managers time the market? Evidence using
 * repurchase price data", JFE 115(2)).
 *
 * A share count is AS FILED: a figure filed before a split is on the
 * pre-split basis. Each count is put on the basis of the session the rest of
 * the statements are stated on with the split resolution the keyless layer
 * already made (src/edgar/splits.ts); without that resolution the basis is
 * unestablished and nothing is returned.
 *
 * Pure: no network, no clock.
 */

import { filterToCoreForms, tagPoints, type CompanyFacts, type FactPoint } from "@/edgar/xbrl";
import { shareBasisFactor, type StockSplits } from "@/edgar/splits";

/** Share-count / cost tag pairs, most specific first. One pair per fiscal year, never mixed. */
export const REPURCHASE_EXECUTION_TAG_PAIRS: readonly { shares: string; value: string }[] = [
  { shares: "StockRepurchasedAndRetiredDuringPeriodShares", value: "StockRepurchasedAndRetiredDuringPeriodValue" },
  { shares: "StockRepurchasedDuringPeriodShares", value: "StockRepurchasedDuringPeriodValue" },
  { shares: "TreasuryStockSharesAcquired", value: "TreasuryStockValueAcquiredCostMethod" },
];

export interface RepurchaseExecution {
  /** Fiscal period end the facts describe (the cash-flow row's date). */
  periodEnd: string;
  /** Shares repurchased in the fiscal year, on the share basis of `basisDay`. */
  shares: number;
  /** Their cost as tagged, in the reporting currency. */
  value: number;
  sharesTag: string;
  valueTag: string;
  /** Filing both facts come from (one filing, so one share basis). */
  filed: string;
  accn: string;
  /** Multiplier applied to the filed share count to reach the current basis. */
  basisFactor: number;
}

export interface RepurchaseExecutionInputs {
  companyFacts: CompanyFacts | null | undefined;
  /** The bundle's `edgar.shareBasis`; null/absent ⇒ the share basis is unestablished. */
  shareBasis: { splits: StockSplits; basisDay: string } | null | undefined;
  /** Annual cash-flow period ends to look up (newest first is fine). */
  fiscalYearEnds: readonly string[];
  /** Reporting currency of the cash-flow statement; the cost must be tagged in it. */
  reportedCurrency: string | null;
}

/** Days of slack between a cash-flow row's date and the XBRL period end (52/53-week calendars). */
const PERIOD_TOLERANCE_DAYS = 7;
const DAY_MS = 86_400_000;

/**
 * Core-form (10-K/10-Q/20-F/40-F and amendments) points for a fiscal year
 * ending near `end` with an annual duration (300–400 days), one per filing.
 */
function annualPointsByAccn(points: readonly FactPoint[], end: string): Map<string, FactPoint> {
  const target = Date.parse(`${end}T00:00:00Z`);
  const out = new Map<string, FactPoint>();
  for (const p of filterToCoreForms([...points])) {
    const e = Date.parse(`${p.end}T00:00:00Z`);
    const s = p.start !== undefined ? Date.parse(`${p.start}T00:00:00Z`) : Number.NaN;
    if (!Number.isFinite(e) || !Number.isFinite(s) || !Number.isFinite(target)) continue;
    if (Math.abs(e - target) > PERIOD_TOLERANCE_DAYS * DAY_MS) continue;
    const days = (e - s) / DAY_MS;
    if (days < 300 || days > 400) continue;
    const prior = out.get(p.accn);
    if (prior === undefined || byLatestFiling(p, prior) < 0) out.set(p.accn, p);
  }
  return out;
}

/** Latest filed first; an amendment wins a same-day tie (the xbrl.ts dedup rule). */
function byLatestFiling(a: FactPoint, b: FactPoint): number {
  if (a.filed !== b.filed) return b.filed.localeCompare(a.filed);
  const aAmend = a.form.endsWith("/A") ? 1 : 0;
  const bAmend = b.form.endsWith("/A") ? 1 : 0;
  if (aAmend !== bAmend) return bAmend - aAmend;
  return b.accn.localeCompare(a.accn);
}

export function repurchaseExecutionsFromFacts(inputs: RepurchaseExecutionInputs): { rows: RepurchaseExecution[]; notes: string[] } {
  const notes: string[] = [];
  const rows: RepurchaseExecution[] = [];
  const facts = inputs.companyFacts;
  if (!facts) return { rows, notes: ["No SEC companyfacts are available, so the price actually paid for repurchased shares is unknown."] };
  if (!inputs.shareBasis) {
    return {
      rows,
      notes: ["Repurchased share counts are tagged as filed, and no stock-split resolution accompanies the companyfacts, so their split basis is unestablished; the price actually paid is not computed."],
    };
  }
  const { splits, basisDay } = inputs.shareBasis;
  const currency = inputs.reportedCurrency?.trim().toUpperCase() || null;

  for (const end of inputs.fiscalYearEnds) {
    let found: RepurchaseExecution | null = null;
    let reason: string | null = null;
    for (const pair of REPURCHASE_EXECUTION_TAG_PAIRS) {
      const sharesSeries = tagPoints(facts, pair.shares, "shares");
      const valueSeries = tagPoints(facts, pair.value, currency ?? undefined);
      if (sharesSeries === null || valueSeries === null || sharesSeries.unit !== "shares") continue;
      if (currency !== null && valueSeries.unit.toUpperCase() !== currency) continue;
      // The count and its cost must come from ONE filing (one share basis, one
      // period): the latest filing that tags both for this fiscal year. A
      // later 10-K often re-tags only the cost of an older year, so the
      // latest fact of each tag alone can come from two different filings.
      const sharesByAccn = annualPointsByAccn(sharesSeries.points, end);
      const valueByAccn = annualPointsByAccn(valueSeries.points, end);
      const common = [...sharesByAccn.keys()].filter((accn) => valueByAccn.has(accn));
      if (common.length === 0) {
        if (sharesByAccn.size > 0 && valueByAccn.size > 0) {
          reason = `${pair.shares} and ${pair.value} for the year ending ${end} are never tagged together in one filing`;
        }
        continue;
      }
      const accn = common.sort((a, b) => byLatestFiling(sharesByAccn.get(a)!, sharesByAccn.get(b)!))[0]!;
      const sharesPoint = sharesByAccn.get(accn)!;
      const valuePoint = valueByAccn.get(accn)!;
      if (sharesPoint.val <= 0 || valuePoint.val <= 0) continue;
      const basis = shareBasisFactor(splits, sharesPoint.filed, null, basisDay);
      if ("withheld" in basis) {
        reason = `the repurchased share count for the year ending ${end} cannot be put on the current share basis: ${basis.withheld}`;
        continue;
      }
      found = {
        periodEnd: end,
        shares: sharesPoint.val * basis.factor,
        value: valuePoint.val,
        sharesTag: pair.shares,
        valueTag: pair.value,
        filed: sharesPoint.filed,
        accn: sharesPoint.accn,
        basisFactor: basis.factor,
      };
      break;
    }
    if (found !== null) rows.push(found);
    else if (reason !== null) notes.push(`Price actually paid withheld: ${reason}.`);
  }
  return { rows, notes };
}
