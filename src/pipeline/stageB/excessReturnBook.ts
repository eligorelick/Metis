import type { FmpStatementRow } from "@/providers/fmp";
import { commonEquityOn, type CommonEquityBasis } from "./excessReturnStart";
import type { ReturnsBalanceRow } from "./returns";

/** Admit a whole quarterly book, independently of whether a trailing return exists. */
export function quarterlyOpeningBook(input: {
  row: (ReturnsBalanceRow & { reportedCurrency?: string | null }) | null;
  annualAsOf: string | null;
  basis: CommonEquityBasis;
  currency: string | null;
  cutoff: string;
  shareRow: FmpStatementRow | undefined;
  dilutedShares: number | null;
}): { bookValue: number; asOf: string } | { reason: string } {
  const { row, shareRow, currency } = input;
  if (!row) return { reason: "no quarterly balance in the model currency" };
  const day = row.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day ||
    (input.annualAsOf !== null && day <= input.annualAsOf)) return { reason: "no quarterly balance newer than the fiscal-year book" };
  const cutoff = Date.parse(input.cutoff);
  const filedByCutoff = (r: { acceptedDate?: string | null; filingDate?: string | null }): boolean => {
    const filed = r.acceptedDate ?? r.filingDate;
    if (!filed || !Number.isFinite(cutoff)) return false;
    if (r.filingDate && (r.filingDate.slice(0, 10) > input.cutoff.slice(0, 10) || r.filingDate.slice(0, 10) < day)) return false;
    // Use the provider timestamp convention used by quarterWindows; a date-only
    // filing requires the whole day to have elapsed rather than inventing a time.
    const at = Date.parse(filed.includes(" ") ? filed.replace(" ", "T") + "Z" : filed.length === 10 ? `${filed}T23:59:59.999Z` : filed);
    return Number.isFinite(at) && at <= cutoff && filed.slice(0, 10) >= day && day <= input.cutoff.slice(0, 10);
  };
  if (!filedByCutoff(row)) return { reason: `quarterly filing at ${day} is missing or unavailable at the analysis cutoff` };
  if (!currency || row.reportedCurrency !== currency) return { reason: "quarterly balance currency differs from the model currency" };
  const fields = input.basis === "tangible-common-equity"
    ? ["totalStockholdersEquity", "goodwill", "intangibleAssets", "preferredStock"] as const
    : ["totalStockholdersEquity", "preferredStock"] as const;
  const evidenceRefusal = (r: Pick<ReturnsBalanceRow, "fieldConflicts" | "fieldProvenance">, field: string, unit: string): string | null => {
    if (r.fieldConflicts?.[field]?.usable === false) return `${field} has a field conflict`;
    const p = r.fieldProvenance?.[field];
    if (p && (p.periodEnd !== day || p.unit !== unit || !p.filings?.length || p.filings.some(f => !f.filed || f.filed > input.cutoff.slice(0, 10)))) {
      return `${field} evidence has a different date, currency/unit or a filing after cutoff`;
    }
    return null;
  };
  for (const field of fields) {
    if (typeof row[field] !== "number" || !Number.isFinite(row[field])) return { reason: `${field} is missing at ${day}; an undisclosed adjustment is not zero` };
    if (field !== "totalStockholdersEquity" && row[field]! < 0) return { reason: `${field} is a negative adjustment at ${day}` };
    const refusal = evidenceRefusal(row, field, currency);
    if (refusal) return { reason: refusal };
  }
  if (!shareRow || shareRow.date !== day || !(input.dilutedShares !== null && input.dilutedShares > 0)) return { reason: `no admitted diluted share count on the quarterly book date ${day}` };
  if (shareRow.reportedCurrency !== currency || !filedByCutoff(shareRow)) return { reason: "the matching share row has a different currency or unavailable filing" };
  for (const field of ["weightedAverageShsOut", "weightedAverageShsOutDil"]) {
    const refusal = evidenceRefusal(shareRow, field, "shares");
    if (refusal) return { reason: refusal };
  }
  const bookValue = commonEquityOn(row, input.basis);
  return bookValue !== null && bookValue > 0 ? { bookValue, asOf: day } : { reason: "quarterly common book equity is not positive" };
}
