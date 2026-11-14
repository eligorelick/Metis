/** D-272 (P2, P20): provider observations, never filed statement replacements. */
import type { DataBundle } from "@/pipeline/types";
import type { FmpInsiderTradeStatisticsRow } from "@/providers/fmp";
import { inheritedIssuerCurrency, providerRowCurrency, type InheritedIssuerCurrency } from "@/pipeline/estimateCurrency";
/**
 * AI-117: FMP's insider statistics are calendar-quarter rows whose
 * `totalPurchases`/`totalSales` are open-market or private transaction counts (Form 4
 * codes P and S), not shares. The window is the trailing four complete
 * calendar quarters; the quarter containing `asOf` is left out, and a gap in
 * the served quarters ends the window.
 */
export interface InsiderStatisticsWindow {
  /** Newest first, consecutive, complete. */
  quarters: { year: number; quarter: 1 | 2 | 3 | 4 }[];
  /** First day of the oldest quarter, last day of the newest. */
  start: string;
  end: string;
  purchases: number | null;
  sales: number | null;
  acquiredTransactions: number | null;
  disposedTransactions: number | null;
  sharesAcquired: number | null;
  sharesDisposed: number | null;
  /** The served quarter that contains `asOf`. */
  inProgress: { year: number; quarter: number } | null;
}

export function insiderQuarterIndex(year: number, quarter: number): number {
  return year * 4 + (quarter - 1);
}

export function insiderQuarterContaining(asOf: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(asOf);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return insiderQuarterIndex(Number(m[1]), Math.ceil(month / 3));
}

export function insiderStatisticRows(rows: readonly FmpInsiderTradeStatisticsRow[]): (FmpInsiderTradeStatisticsRow & { year: number; quarter: 1 | 2 | 3 | 4 })[] {
  const seen = new Set<number>();
  const kept: (FmpInsiderTradeStatisticsRow & { year: number; quarter: 1 | 2 | 3 | 4 })[] = [];
  for (const row of rows) {
    const { year, quarter } = row;
    if (!Number.isInteger(year) || !Number.isInteger(quarter) || quarter! < 1 || quarter! > 4) continue;
    const index = insiderQuarterIndex(year!, quarter!);
    if (seen.has(index)) continue;
    seen.add(index);
    kept.push({ ...row, year: year!, quarter: quarter as 1 | 2 | 3 | 4 });
  }
  return kept;
}

export function insiderStatisticsWindow(rows: readonly FmpInsiderTradeStatisticsRow[], asOf: string): InsiderStatisticsWindow | null {
  const current = insiderQuarterContaining(asOf);
  if (current === null) return null;
  const served = insiderStatisticRows(rows);
  const complete = served
    .filter((row) => insiderQuarterIndex(row.year, row.quarter) < current)
    .sort((a, b) => insiderQuarterIndex(b.year, b.quarter) - insiderQuarterIndex(a.year, a.quarter));
  const taken: typeof complete = [];
  for (const row of complete) {
    if (taken.length === 4) break;
    const last = taken[taken.length - 1];
    if (last && insiderQuarterIndex(last.year, last.quarter) - insiderQuarterIndex(row.year, row.quarter) !== 1) break;
    taken.push(row);
  }
  const newest = taken[0];
  const oldest = taken[taken.length - 1];
  if (!newest || !oldest) return null;
  const sum = (key: "totalPurchases" | "totalSales" | "acquiredTransactions" | "disposedTransactions" | "totalAcquired" | "totalDisposed"): number | null => {
    let total = 0;
    for (const row of taken) {
      const v = row[key];
      if (typeof v !== "number" || !Number.isFinite(v)) return null;
      total += v;
    }
    return total;
  };
  const quarterEnd = (year: number, quarter: number) => {
    const month = quarter * 3;
    return `${year}-${String(month).padStart(2, "0")}-${month === 6 || month === 9 ? "30" : "31"}`;
  };
  const inProgress = served.find((row) => insiderQuarterIndex(row.year, row.quarter) === current);
  return {
    quarters: taken.map((row) => ({ year: row.year, quarter: row.quarter })),
    start: `${oldest.year}-${String((oldest.quarter - 1) * 3 + 1).padStart(2, "0")}-01`,
    end: quarterEnd(newest.year, newest.quarter),
    purchases: sum("totalPurchases"),
    sales: sum("totalSales"),
    acquiredTransactions: sum("acquiredTransactions"),
    disposedTransactions: sum("disposedTransactions"),
    sharesAcquired: sum("totalAcquired"),
    sharesDisposed: sum("totalDisposed"),
    inProgress: inProgress ? { year: inProgress.year, quarter: inProgress.quarter } : null,
  };
}


const finite = (x: unknown): number | null => typeof x === "number" && Number.isFinite(x) ? x : null;
const day = (x: unknown): string | null => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.slice(0,10)) && Number.isFinite(Date.parse(x.slice(0,10))) ? x.slice(0,10) : null;
export function resultsHistory(bundle: DataBundle, issuer: InheritedIssuerCurrency = inheritedIssuerCurrency({ reporting: null, listing: null, isAdr: false })) {
  const fetch = bundle.earningsHistory;
  if (!fetch?.ok) return [];
  const cutoff = bundle.builtAt.slice(0,10);
  const difference = (a: number | null, b: number | null) => a === null || b === null ? null : a - b;
  return fetch.value.data.rows.flatMap(row => {
    const date = day(row.date);
    if (!date || date > cutoff || [row.epsActual,row.revenueActual].every(v => finite(v) === null)) return [];
    const revenueActual=finite(row.revenueActual), revenueEstimated=finite(row.revenueEstimated), epsActual=finite(row.epsActual), epsEstimated=finite(row.epsEstimated);
    return [{ date, asOf: fetch.value.asOf, currency: providerRowCurrency(row,issuer).code,
      values: { revenueActual,revenueEstimated,revenueDifference:difference(revenueActual,revenueEstimated),epsActual,epsEstimated,epsDifference:difference(epsActual,epsEstimated) } }];
  }).sort((a,b) => b.date.localeCompare(a.date)).slice(0,4);
}
export const INSIDER_SCOPE = "Insider statistics: statistics count all Form 4 reporting persons, including officers, directors, holders of more than 10% and former holders; they are not limited to officers and directors. Do not attribute aggregate statistics to officers unless retained transaction rows prove it.";
export function insiderEvidence(bundle: DataBundle): string[] {
  const notes = [INSIDER_SCOPE];
  if (bundle.insiderStats?.ok) {
    const fetch=bundle.insiderStats.value, win=insiderStatisticsWindow(fetch.data.rows,fetch.asOf);
    for (const q of win?.quarters ?? []) {
      const row=insiderStatisticRows(fetch.data.rows).find(r => r.year===q.year && r.quarter===q.quarter)!;
      notes.push(`${q.year} Q${q.quarter}: purchases ${finite(row.totalPurchases) ?? "unavailable"}, sales ${finite(row.totalSales) ?? "unavailable"} transactions; shares acquired ${finite(row.totalAcquired) ?? "unavailable"}, disposed ${finite(row.totalDisposed) ?? "unavailable"} [fmp:insider-statistics; as-of ${fetch.asOf}].`);
    }
  }
  if (!bundle.insiderTrades?.ok) return notes;
  const fetch=bundle.insiderTrades.value;
  const rows=fetch.data.rows.filter(r => (r.formType===undefined || /^4(?:\/A)?$/.test(r.formType)) && day(r.transactionDate)!==null && day(r.transactionDate)!<=bundle.builtAt.slice(0,10));
  const dates=rows.map(r => day(r.transactionDate)!).sort();
  if (!dates.length) return notes;
  notes.push(`Selected Form 4 rows, ${dates[0]} to ${dates.at(-1)}; source FMP insider-trades endpoint, as-of ${fetch.asOf}. Not a complete review; amendments and joint filings may overlap. Counts and shares below are code S sale rows only.`);
  const groups=new Map<string, typeof rows>();
  for (const row of rows.filter(r => /^S(?:-|$)/.test(r.transactionType ?? ""))) {
    const owner=row.typeOfOwner ?? "unknown owner type";
    groups.set(owner,[...(groups.get(owner) ?? []),row]);
  }
  for (const [owner, sales] of groups) {
    const officerDirector = /officer|director/i.test(owner) && !/former/i.test(owner);
    const shares=sales.every(r => finite(r.securitiesTransacted)!==null) ? sales.reduce((n,r)=>n+r.securitiesTransacted!,0) : null;
    notes.push(`${owner} (${officerDirector ? "officer/director" : "ten-percent, former or other owner"}): ${sales.length} code S sale rows; ${shares ?? "unavailable"} shares${officerDirector ? "" : `; sellers: ${[...new Set(sales.map(r => r.reportingName ?? "name unavailable"))].join(", ")}`}.`);
  }
  return notes;
}
