import type { FmpStatementRow } from "@/providers/fmp";
/**
 * Derive FMP free cash flow without converting missing or invalid inputs to zero.
 * FMP reports capital expenditure as a negative cash outflow.
 */
export function deriveFcf(
  operatingCashFlow: number | null | undefined,
  capitalExpenditure: number | null | undefined,
): number | null {
  if (
    typeof operatingCashFlow !== "number" ||
    !Number.isFinite(operatingCashFlow) ||
    typeof capitalExpenditure !== "number" ||
    !Number.isFinite(capitalExpenditure)
  ) {
    return null;
  }

  const freeCashFlow = operatingCashFlow + capitalExpenditure;
  return Number.isFinite(freeCashFlow) ? freeCashFlow : null;
}


type SbcRow = { date?: unknown; reportedCurrency?: unknown; stockBasedCompensation?: unknown;
  fieldProvenance?: FmpStatementRow["fieldProvenance"]; fieldConflicts?: FmpStatementRow["fieldConflicts"] };

/** D-306: a vendor negative is not proof of an issuer compensation credit. */
export function negativeSbcRefusal(row: SbcRow | null | undefined): string | null {
  const refused = row?.fieldConflicts?.stockBasedCompensation;
  if (refused?.usable === false && typeof refused.vendorValue === "number" && refused.vendorValue < 0) return refused.reason;
  const value = row?.stockBasedCompensation;
  if (typeof value !== "number" || !Number.isFinite(value) || value >= 0) return null;
  const proof = row?.fieldProvenance?.stockBasedCompensation;
  const filed = proof?.source === "edgar" && proof.periodEnd === row?.date && !!proof.periodStart &&
    typeof row?.reportedCurrency === "string" && proof.unit === row.reportedCurrency && proof.tags.length > 0 &&
    proof.filings.length > 0 && proof.filings.every(f => !!f.accn && !!f.filed && f.filed <= proof.observedAt.slice(0,10));
  return filed ? null : `Negative stock-based compensation for ${String(row?.date ?? "the period")} withheld: exact-period filed proof is not established; after-SBC free cash flow and its dependent ratios are unavailable.`;
}

export function admittedSbc(row: SbcRow | null | undefined): number | null {
  const value = row?.stockBasedCompensation;
  return typeof value === "number" && Number.isFinite(value) && row?.fieldConflicts?.stockBasedCompensation?.usable !== false &&
    negativeSbcRefusal(row) === null ? value : null;
}
