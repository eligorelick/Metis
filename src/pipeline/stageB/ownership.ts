/** Ownership scope for consolidated operating metrics; all values retain their filed sign. */
export interface EquityScopeInputs {
  totalEquity?: number | null;
  totalStockholdersEquity?: number | null;
  minorityInterest?: number | null;
}
const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

/** Prefer the consolidated total. NCI is added only to a parent-only equity balance. */
export function resolveConsolidatedEquity(input: EquityScopeInputs): { value: number | null; basis: string; reason: string } {
  const total = finite(input.totalEquity), parent = finite(input.totalStockholdersEquity), nci = finite(input.minorityInterest);
  // Zero and negative consolidated totals remain authoritative. Their sign is
  // not evidence of a vendor placeholder; callers guard nonpositive capital.
  if (total !== null) {
    return { value: total, basis: "totalEquity", reason: "consolidated total equity including NCI; NCI is not added again" };
  }
  if (parent === null) return { value: null, basis: "unavailable", reason: "consolidated and parent equity unavailable" };
  if (nci !== null) return { value: parent + nci, basis: "totalStockholdersEquity + minorityInterest", reason: "parent equity plus signed noncontrolling interest matches consolidated operating profit" };
  return { value: parent, basis: "totalStockholdersEquity (NCI undisclosed)", reason: "parent equity fallback; NCI is undisclosed, so consolidated ownership scope is unverified" };
}

/**
 * When consolidated equity and parent equity are one amount (D-248). They are
 * two different filed lines, equal only when there are no outside holders, so
 * this is a floating-point allowance and never a materiality one: within one
 * currency unit, or one part in ten billion of consolidated equity, whichever
 * is wider. A balance sheet states whole currency units or larger, so a
 * smaller gap is arithmetic noise; anything larger is a filed difference,
 * however small against the total (one reporting unit of a filer stating
 * thousands is a difference). The P8 "same observation" rule
 * (src/edgar/vendorAgreement.ts) is not used here on purpose: it compares two
 * copies of one figure and allows a reporting unit or 0.01%, which would read a
 * small filed noncontrolling interest as none.
 */
export const EQUITY_SAME_AMOUNT_ALLOWANCE = { absolute: 1, relative: 1e-10 } as const;

export function sameEquityAmount(consolidated: number, parent: number): boolean {
  return Math.abs(consolidated - parent) <=
    Math.max(EQUITY_SAME_AMOUNT_ALLOWANCE.absolute, Math.abs(consolidated) * EQUITY_SAME_AMOUNT_ALLOWANCE.relative);
}

export interface OwnershipSplitInputs extends EquityScopeInputs {
  /** What the row's equity evidence establishes: a parent line, or only a consolidated total with no parent split. */
  equityOwnershipBasis?: "parent" | "consolidated";
}

/**
 * Whether the split between the parent's holders and outside (noncontrolling)
 * holders is unresolved on a balance (P5, P10; D-78, D-79, D-248). The one
 * test: the DCF bridge-row choice and the DCF gate's input (compute.ts) and
 * the multiples, own-history, cash-ownership and DCF gates (valuation.ts) all
 * read it, so one balance gets one answer.
 *
 * - A filed noncontrolling interest (any number, zero included) resolves it.
 * - Otherwise a consolidated-only basis is unresolved: the evidence is a
 *   consolidated total with no parent split, whatever numbers survive.
 * - Otherwise, with no consolidated total nothing shows outside holders.
 * - With a consolidated total, a missing parent line or a parent line that
 *   differs from it (`sameEquityAmount`) proves outside ownership whose amount
 *   is not filed. A consolidated/parent difference proves outside ownership,
 *   never its market value, and it is never treated as zero.
 */
export function noncontrollingOwnershipUnresolved(balance: OwnershipSplitInputs | null | undefined): boolean {
  if (!balance || finite(balance.minorityInterest) !== null) return false;
  if (balance.equityOwnershipBasis === "consolidated") return true;
  const total = finite(balance.totalEquity), parent = finite(balance.totalStockholdersEquity);
  if (total === null) return false;
  return parent === null || !sameEquityAmount(total, parent);
}
