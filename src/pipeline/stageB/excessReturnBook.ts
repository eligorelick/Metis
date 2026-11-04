import type { FmpBalanceSheetRow, FmpStatementRow } from "@/providers/fmp";
import { CORE_FACT_FORMS, parseFactPoints, type CompanyFacts, type FactPoint } from "@/edgar/xbrl";
import { preferredCapitalRefusal } from "./securityBasis";
import { commonEquityOn, type CommonEquityBasis } from "./excessReturnStart";
import type { ReturnsBalanceRow } from "./returns";

/** Same-date filed claims only; par, authorized shares and per-share preferences are not capital amounts. */
export function resolvePreferredCapital(row: FmpBalanceSheetRow, facts: CompanyFacts | null, cutoff: string): FmpBalanceSheetRow {
  if (!facts || row.preferredStock !== 0 || (row.cik && Number(row.cik) !== facts.cik)) return row;
  const date = row.date, currency = row.reportedCurrency;
  if (!date || !currency || !Number.isFinite(Date.parse(cutoff))) return row;
  const points = (tag: string, unit: string): FactPoint[] => {
    const concept = facts.facts["us-gaap"]?.[tag] as { units?: Record<string, unknown[]> } | undefined;
    return parseFactPoints(concept?.units?.[unit] ?? []).filter(p => p.end === date && p.val >= 0 && CORE_FACT_FORMS.has(p.form) &&
      /^\d{4}-\d{2}-\d{2}$/.test(p.filed) && p.filed >= date && p.filed <= cutoff.slice(0, 10))
      .sort((a,b) => b.filed.localeCompare(a.filed) || b.accn.localeCompare(a.accn));
  };
  const carryingTags = ["PreferredStockIncludingAdditionalPaidInCapitalNetOfDiscount", "PreferredStockIncludingAdditionalPaidInCapital"];
  const shares = points("PreferredStockSharesOutstanding", "shares")[0]?.val ?? row.preferredStockSharesOutstanding ?? 0;
  const dividends = points("PaymentsOfDividendsPreferredStockAndPreferenceStock", currency)[0]?.val ?? 0;
  const preference = points("PreferredStockLiquidationPreferenceValue", currency).find(p => p.start === undefined);
  const carrying = carryingTags.flatMap(tag => {
    const p = points(tag, currency).find(p => p.start === undefined && p.val > 0);
    return p ? [{ tag, p }] : [];
  })[0];
  if (!(shares > 0 || dividends > 0 || (preference?.val ?? 0) > 0 || carrying)) return row;
  const selection = carrying ?? (preference && preference.val > 0 ? { tag: "PreferredStockLiquidationPreferenceValue", p: preference } : null);
  if (selection && row.fieldConflicts?.preferredStock?.usable !== false) {
    const { tag, p } = selection;
    const basis = `${carrying ? "filed carrying amount" : "filed liquidation preference (senior claim used for common book, not an accounting carrying amount)"} ${currency} ${p.val} at ${date}; us-gaap/${tag}, ${p.accn}, filed ${p.filed}`;
    return { ...row, preferredStock: p.val, preferredCapitalBasis: basis,
      fieldProvenance: { ...row.fieldProvenance, preferredStock: { source: "edgar", unit: currency, periodStart: null, periodEnd: date,
        observedAt: cutoff, tags: [`us-gaap/${tag}`], filings: [{ accn: p.accn, form: p.form, filed: p.filed }] } } };
  }
  const reason = `Preferred capital at ${date} is unresolved: zero par with ${shares} preferred shares and ${currency} ${dividends} filed preferred dividends does not establish zero capital. No usable filed carrying amount or liquidation preference for the same balance date is retained; another date is not carried forward. Common book and dependent values are withheld.`;
  return { ...row, preferredStock: undefined, preferredCapitalWithheldReason: reason,
    fieldConflicts: { ...row.fieldConflicts, preferredStock: { vendorValue: 0, secValue: null, usable: false, reason } } };
}

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
  const preferredRefusal = preferredCapitalRefusal(row);
  if (preferredRefusal) return { reason: preferredRefusal };
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
