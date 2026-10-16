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
