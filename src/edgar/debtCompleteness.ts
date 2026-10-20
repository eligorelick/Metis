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

/** Above this implied annual rate, resolved financing debt cannot be the debt that carried the interest. */
export const IMPLAUSIBLE_DEBT_RATE = 0.25;
/** Interest below this share of total assets is too small to judge the debt by. */
const MATERIAL_INTEREST_TO_ASSETS = 0.0025;

/**
 * A plausibility check on resolved financing debt, independent of any tag
 * (audit 2026-10-19, O-2): the completeness guards above key on single tags,
 * and a filer that tags none of them passed as complete with 94% of its debt
 * missing. A year's interest expense far above any plausible rate on the
 * larger of the opening and closing resolved debt (current + noncurrent +
 * finance leases) means debt is missing, so total and net debt are withheld.
 * Debt of zero is not judged: interest on tax positions, deposits or
 * deferred compensation can come without any borrowing.
 * Financial routes, whose interest expense funds deposits and float, are the
 * caller's to exclude.
 */
export function implausibleDebtReason(input: {
  annualInterestExpense: number | null; financingDebt: number | null; priorFinancingDebt: number | null; totalAssets: number | null;
}): string | null {
  const finite = (value: number | null): value is number => value !== null && Number.isFinite(value);
  const interest = input.annualInterestExpense;
  if (!finite(interest) || interest <= 0) return null;
  if (finite(input.totalAssets) && input.totalAssets > 0 && interest < MATERIAL_INTEREST_TO_ASSETS * input.totalAssets) return null;
  const debt = Math.max(finite(input.financingDebt) ? input.financingDebt : 0, finite(input.priorFinancingDebt) ? input.priorFinancingDebt : 0);
  if (debt <= 0 || interest / debt <= IMPLAUSIBLE_DEBT_RATE) return null;
  return `incomplete debt carrying value: annual interest expense ${interest} implies ${(interest / debt * 100).toFixed(1)}% on resolved financing debt ${debt} ` +
    `(larger of opening and closing); above ${IMPLAUSIBLE_DEBT_RATE * 100}% the resolved components cannot be the debt that carried the interest, ` +
    `so total debt and net debt are withheld rather than published without the missing borrowings`;
}
