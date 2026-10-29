/**
 * Audit 2026-10-29, AMZN report #51 (D-132): the shape of the provider balance
 * row whose lease line was the filing's NONCURRENT lease liabilities, with the
 * SEC lease totals the enrichment writes beside it, and the filed facts that
 * reconcile it.
 *
 * Every amount is SEC-filed (Amazon's Q2 2026 10-Q and its 2025-12-31
 * comparatives, in millions) or derived from SEC-filed amounts by the vendor's
 * own arithmetic (long-term debt + the noncurrent lease line); the issuer, CIK
 * and accession are synthetic. No provider row is committed.
 */
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpBalanceSheetRow, StatementFieldProvenance } from "@/providers/fmp";

export const M = 1_000_000;
export const OBSERVED = "2026-10-29T03:49:22.813Z";
export const Q2 = "2026-06-30";
export const FY = "2025-12-31";
export const ACCN = "0000000042-26-000026";
export const FILED = "2026-07-31";

export type Points = Record<string, Record<string, number>>;

/** SEC-filed instants (millions), all from one 10-Q. */
export const FILED_FACTS: Points = {
  [Q2]: {
    OperatingLeaseLiability: 96_320, OperatingLeaseLiabilityCurrent: 13_745, OperatingLeaseLiabilityNoncurrent: 82_575,
    FinanceLeaseLiability: 13_451, FinanceLeaseLiabilityCurrent: 1_688, FinanceLeaseLiabilityNoncurrent: 11_763,
    LongTermDebt: 132_995, LongTermDebtNoncurrent: 128_894, LongTermDebtCurrent: 3_330, ShortTermBorrowings: 325,
    DebtInstrumentCarryingAmount: 128_894, CashAndCashEquivalentsAtCarryingValue: 78_213,
  },
  [FY]: {
    OperatingLeaseLiability: 89_252, OperatingLeaseLiabilityCurrent: 12_655, OperatingLeaseLiabilityNoncurrent: 76_597,
    FinanceLeaseLiability: 12_286, FinanceLeaseLiabilityCurrent: 1_544, FinanceLeaseLiabilityNoncurrent: 10_742,
    LongTermDebt: 68_836, LongTermDebtNoncurrent: 65_648, LongTermDebtCurrent: 2_748, ShortTermBorrowings: 455,
    DebtInstrumentCarryingAmount: 65_648, CashAndCashEquivalentsAtCarryingValue: 86_810,
  },
};

export function companyFacts(points: Points, filed = FILED): CompanyFacts {
  const usGaap: Record<string, { units: { USD: unknown[] } }> = {};
  for (const [end, tags] of Object.entries(points)) {
    for (const [tag, millions] of Object.entries(tags)) {
      (usGaap[tag] ??= { units: { USD: [] } }).units.USD.push({ end, val: millions * M, accn: ACCN, filed, form: "10-Q", fy: 2026, fp: "Q2" });
    }
  }
  return { cik: 42, entityName: "Synthetic Lease Co", facts: { "us-gaap": usGaap } };
}

export function without(points: Points, ...tags: string[]): Points {
  return Object.fromEntries(Object.entries(points).map(([end, values]) =>
    [end, Object.fromEntries(Object.entries(values).filter(([tag]) => !tags.includes(tag)))]));
}

export function enriched(end: string, tag: string, filed = FILED): StatementFieldProvenance {
  return { source: "edgar", unit: "USD", periodStart: null, periodEnd: end, observedAt: OBSERVED, tags: [`us-gaap/${tag}`], filings: [{ accn: ACCN, filed, form: "10-Q" }] };
}

/**
 * The provider row's shape: long-term debt and the noncurrent lease line only,
 * no current debt, no current lease portion, with the SEC lease TOTALS the
 * enrichment writes beside them.
 */
export function vendorRow(end: string, overrides: Partial<Record<string, number | null>> = {}): FmpBalanceSheetRow {
  const f = FILED_FACTS[end]!;
  const line = f.OperatingLeaseLiabilityNoncurrent! + f.FinanceLeaseLiabilityNoncurrent!;
  const shortTermDebt = overrides.shortTermDebt ?? 0;
  const capitalLeaseObligations = overrides.capitalLeaseObligations ?? line;
  const totalDebt = shortTermDebt + f.LongTermDebtNoncurrent! + capitalLeaseObligations;
  return {
    date: end, reportedCurrency: "USD", cik: "0000000042", filingDate: FILED,
    shortTermDebt: shortTermDebt * M, longTermDebt: f.LongTermDebtNoncurrent! * M,
    capitalLeaseObligations: capitalLeaseObligations * M, capitalLeaseObligationsCurrent: 0, capitalLeaseObligationsNonCurrent: capitalLeaseObligations * M,
    totalDebt: totalDebt * M, netDebt: (totalDebt - f.CashAndCashEquivalentsAtCarryingValue!) * M,
    cashAndCashEquivalents: f.CashAndCashEquivalentsAtCarryingValue! * M,
    operatingLeaseLiability: f.OperatingLeaseLiability! * M, financeLeaseLiability: f.FinanceLeaseLiability! * M,
    fieldProvenance: { operatingLeaseLiability: enriched(end, "OperatingLeaseLiability"), financeLeaseLiability: enriched(end, "FinanceLeaseLiability") },
  } as FmpBalanceSheetRow;
}
