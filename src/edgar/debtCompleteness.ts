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

/**
 * Same-period debt totals the filer tagged. Each covers no more than current
 * plus noncurrent financing debt and finance leases, so one that exceeds the
 * composed components shows a component is missing (audit 2026-10-22 B-14).
 */
export const DEBT_AGGREGATE_TAGS: readonly string[] = [
  "LongTermDebtNoncurrent", "LongTermNotesAndLoans", "LongTermDebt", "LongTermDebtAndCapitalLeaseObligations",
  "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities", "DebtLongtermAndShorttermCombinedAmount",
];

/** A tagged debt total above the composed components: the composition is partial, so debt is withheld. */
export function uncomposedDebtReason(row: {
  shortTermDebt?: unknown; longTermDebt?: unknown; financeLeaseLiability?: unknown;
}, aggregates: readonly { tag: string; value: number | null }[]): string | null {
  const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
  const current = finite(row.shortTermDebt);
  const noncurrent = finite(row.longTermDebt);
  if (current === null && noncurrent === null) return null;
  const composed = (current ?? 0) + (noncurrent ?? 0) + (finite(row.financeLeaseLiability) ?? 0);
  const over = aggregates.find(({ value }) => value !== null && value > composed + Math.max(1, Math.abs(composed) * 0.01));
  return over === undefined ? null
    : `incomplete debt carrying value: same-period ${over.tag} ${over.value} exceeds the composed current and noncurrent financing debt ` +
      `and finance leases ${composed}; a debt component no chain read is missing, so total debt and net debt are withheld rather than published as a partial sum`;
}

/**
 * A tagged remainder-of-fiscal-year bucket, zero included, shows the schedule
 * runs by fiscal year, so the next-twelve-months figure beside it can be the
 * next fiscal year's bucket rather than current debt (audit 2026-10-22 A-10).
 */
export function fiscalMaturityScopeReason(maturities: number | null, remainder: number | null): string | null {
  return maturities !== null && remainder !== null && remainder >= 0
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
 * average resolved debt of the year's balances, opening to closing (current +
 * noncurrent + finance leases), means debt is missing, so total and net debt
 * are withheld. The average, not the largest balance, is the basis (audit
 * 2026-10-22 B-16): one complete balance in the year let a closing balance
 * that had lost 90% of its debt pass.
 * Debt of zero is not judged: interest on tax positions, deposits or
 * deferred compensation can come without any borrowing.
 * Financial routes, whose interest expense funds deposits and float, are the
 * caller's to exclude.
 */
export function implausibleDebtReason(input: {
  annualInterestExpense: number | null; financingDebt: number | null; priorFinancingDebts: readonly number[]; totalAssets: number | null;
}): string | null {
  const finite = (value: number | null): value is number => value !== null && Number.isFinite(value);
  const interest = input.annualInterestExpense;
  if (!finite(interest) || interest <= 0) return null;
  if (finite(input.totalAssets) && input.totalAssets > 0 && interest < MATERIAL_INTEREST_TO_ASSETS * input.totalAssets) return null;
  if (!finite(input.financingDebt)) return null;
  const balances = [input.financingDebt, ...input.priorFinancingDebts.filter((debt) => Number.isFinite(debt))];
  const debt = balances.reduce((sum, value) => sum + value, 0) / balances.length;
  if (debt <= 0 || interest / debt <= IMPLAUSIBLE_DEBT_RATE) return null;
  return `incomplete debt carrying value: annual interest expense ${interest} implies ${(interest / debt * 100).toFixed(1)}% on resolved financing debt ${debt} ` +
    `(average of the year's balances, opening to closing); above ${IMPLAUSIBLE_DEBT_RATE * 100}% the resolved components cannot be the debt that carried the interest, ` +
    `so total debt and net debt are withheld rather than published without the missing borrowings`;
}

/** A fall in resolved debt from the previous balance larger than this share is a collapse that needs a cause. */
export const DEBT_COLLAPSE_SHARE = 0.6;

/**
 * A quarter-on-quarter debt collapse (audit 2026-10-22 B-16). Resolved debt
 * that fell by more than 60% from the previous balance, to a closing balance
 * on which the year's interest implies more than 25%, is withheld unless the
 * period's cash flow shows net debt repayment of at least half the fall: a
 * tag no chain read loses debt without any cash leaving. Debt of zero is not
 * judged, as above.
 */
export function collapsedDebtReason(input: {
  annualInterestExpense: number | null; financingDebt: number | null; previousFinancingDebt: number | null; previousDate: string;
  netDebtIssuance: number | null; totalAssets: number | null;
}): string | null {
  const finite = (value: number | null): value is number => value !== null && Number.isFinite(value);
  const { annualInterestExpense: interest, financingDebt: closing, previousFinancingDebt: previous } = input;
  if (!finite(interest) || interest <= 0 || !finite(closing) || closing <= 0 || !finite(previous) || previous <= 0) return null;
  if (finite(input.totalAssets) && input.totalAssets > 0 && interest < MATERIAL_INTEREST_TO_ASSETS * input.totalAssets) return null;
  const fall = previous - closing;
  if (fall <= DEBT_COLLAPSE_SHARE * previous || interest / closing <= IMPLAUSIBLE_DEBT_RATE) return null;
  if (finite(input.netDebtIssuance) && -input.netDebtIssuance >= fall / 2) return null;
  return `incomplete debt carrying value: resolved financing debt fell from ${previous} at ${input.previousDate} to ${closing} ` +
    `(${(-fall / previous * 100).toFixed(1)}%) with ${finite(input.netDebtIssuance) ? `net debt issuance of ${input.netDebtIssuance}` : "no net debt repayment disclosed"} ` +
    `to explain it, and annual interest expense ${interest} implies ${(interest / closing * 100).toFixed(1)}% on the closing balance; ` +
    `a debt component is missing, so total debt and net debt are withheld rather than published as a collapse`;
}
