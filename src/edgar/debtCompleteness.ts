/** A noncurrent convertible carrying subtype is a lower bound on noncurrent
 * financing debt, never an automatic addition to an inclusive generic total. */
export function omittedConvertibleCarryingReason(row: { longTermDebt?: unknown }, convertible: number | null): string | null {
  if (convertible === null || convertible <= 0) return null;
  const noncurrent = typeof row.longTermDebt === "number" && Number.isFinite(row.longTermDebt) ? row.longTermDebt : null;
  return noncurrent !== null && noncurrent >= convertible - Math.max(1, convertible * 1e-10) ? null
    : `incomplete debt carrying value: noncurrent convertible carrying debt ${convertible} is not covered by resolved noncurrent financing debt ${noncurrent ?? "unavailable"}; total debt and net debt withheld rather than publishing leases alone or adding an overlapping subtype`;
}

/** A gross/principal debt fact is a completeness check, never a carrying-value substitute. */
export function incompleteDebtReason(row: {
  shortTermDebt?: unknown; longTermDebt?: unknown; financeLeaseLiability?: unknown; totalDebt?: unknown;
}, aggregate: number | null): string | null {
  const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
  const current = finite(row.shortTermDebt);
  const noncurrent = finite(row.longTermDebt);
  const complete = current !== null && current >= 0 && noncurrent !== null && noncurrent >= 0 && (current > 0 || noncurrent > 0);
  if (aggregate === null || aggregate <= 0 || complete) return null;
  const known = (current ?? 0) + (noncurrent ?? 0) + (finite(row.financeLeaseLiability) ?? 0);
  if (aggregate <= known + Math.max(1, Math.abs(known) * 1e-6)) return null;
  return `incomplete debt carrying value: current/noncurrent financing components do not establish the total; ` +
    `same-period DebtInstrumentCarryingAmount ${aggregate} exceeds the resolved financing components ${known}. ` +
    `The aggregate may be gross principal and is not substituted for carrying debt; total debt and net debt are withheld until reconciled.`;
}

export function fiscalMaturityScopeReason(maturities: number | null, remainder: number | null): string | null {
  return maturities !== null && remainder !== null && remainder > 0
    ? `debt maturity scope unresolved: LongTermDebtMaturitiesRepaymentsOfPrincipalInNextTwelveMonths ${maturities} is accompanied by remainder-of-fiscal-year ` +
      `principal ${remainder}; the first fiscal maturity bucket is not established as current balance-sheet carrying debt.`
    : null;
}
