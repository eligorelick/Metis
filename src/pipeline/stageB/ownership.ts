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
