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
 * D-238 (P5, P13): one period's profit, by entity scope. An income row's `netIncome` is the parent's profit or the
 * consolidated profit (the parent's plus the noncontrolling interests' share), and `netIncomeOwnershipBasis` says
 * which. A metric asks here for the scope its other operand is on, so one ratio never mixes the two:
 * consolidated cash flow and consolidated assets meet consolidated profit; parent equity, earnings per share and
 * the net margin meet the parent's profit. The noncontrolling share keeps its filed sign.
 */
export interface ProfitScopeInputs {
  netIncome?: number | null;
  netIncomeOwnershipBasis?: "parent" | "consolidated";
  /** The filed consolidated profit for the same period, when the row carries it beside `netIncome`. */
  netIncomeConsolidated?: number | null;
  /** The noncontrolling interests' signed share of that consolidated profit. */
  noncontrollingIncome?: number | null;
}
export interface ProfitScope { value: number | null; basis: string; reason: string }

/** Profit attributable to the parent: a consolidated-basis figure less the signed noncontrolling share. */
export function resolveParentProfit(input: ProfitScopeInputs): ProfitScope {
  const net = finite(input.netIncome), nci = finite(input.noncontrollingIncome);
  if (net === null) return { value: null, basis: "unavailable", reason: "net income unavailable" };
  if (input.netIncomeOwnershipBasis !== "consolidated") {
    return input.netIncomeOwnershipBasis === "parent"
      ? { value: net, basis: "netIncome (parent)", reason: "net income is the profit attributable to the parent" }
      : { value: net, basis: "netIncome (ownership scope not stated)", reason: "the row states no ownership scope for net income; it is read as reported" };
  }
  if (nci !== null) return { value: net - nci, basis: "netIncome (consolidated) - noncontrollingIncome", reason: `consolidated profit ${net} less the signed noncontrolling share ${nci} = ${net - nci}, the profit attributable to the parent` };
  return { value: net, basis: "netIncome (consolidated; NCI share undisclosed)", reason: "consolidated profit fallback; the noncontrolling share is undisclosed, so parent ownership scope is unverified" };
}

/** Consolidated profit, including the noncontrolling share: the line a cash-flow statement starts from. */
export function resolveConsolidatedProfit(input: ProfitScopeInputs): ProfitScope {
  const consolidated = finite(input.netIncomeConsolidated), net = finite(input.netIncome), nci = finite(input.noncontrollingIncome);
  if (consolidated !== null) return { value: consolidated, basis: "netIncomeConsolidated", reason: "consolidated profit including the noncontrolling share; that share is not added again" };
  if (net === null) return { value: null, basis: "unavailable", reason: "consolidated and parent profit unavailable" };
  if (input.netIncomeOwnershipBasis === "consolidated") return { value: net, basis: "netIncome (consolidated)", reason: "net income is the consolidated profit including the noncontrolling share" };
  if (input.netIncomeOwnershipBasis === "parent" && nci !== null) {
    return { value: net + nci, basis: "netIncome (parent) + noncontrollingIncome", reason: `parent profit ${net} plus the signed noncontrolling share ${nci} = ${net + nci}, the consolidated profit` };
  }
  return input.netIncomeOwnershipBasis === "parent"
    ? { value: net, basis: "netIncome (parent; NCI share undisclosed)", reason: "parent profit fallback; the noncontrolling share is undisclosed, so consolidated ownership scope is unverified" }
    : { value: net, basis: "netIncome (ownership scope not stated)", reason: "the row states no ownership scope for net income; it is read as reported" };
}
