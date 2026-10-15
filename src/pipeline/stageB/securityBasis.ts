/** Security and common-holder admission helpers. Pure: no inferred ADR ratios. */
export interface SecurityBasisEvidence {
  issuerId: string;
  securityId: string;
  ordinaryClassId: string;
  quoteUnit: "ordinary" | "ADS";
  ordinarySharesPerQuotedUnit: number;
  effectiveFrom: string;
  /** Exclusive upper bound; null means no documented end. */
  effectiveTo: string | null;
  sourceHash: string;
  sourceIds: string[];
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const day = (v: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const time = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === v;
};

/** Conflicting identity or ratio evidence fails closed, even when one row is newer. */
export function resolveSecurityBasis(evidence: SecurityBasisEvidence[], asOf: string): SecurityBasisEvidence | null {
  if (!day(asOf)) return null;
  const active = evidence.filter((e) => day(e.effectiveFrom) && e.effectiveFrom <= asOf &&
    (e.effectiveTo === null || (day(e.effectiveTo) && e.effectiveTo > asOf)));
  if (active.length === 0 || active.some((e) => !e.issuerId || !e.securityId || !e.ordinaryClassId ||
    !e.sourceHash || !e.sourceIds.length || e.sourceIds.some((id) => !id) ||
    !finite(e.ordinarySharesPerQuotedUnit) || e.ordinarySharesPerQuotedUnit <= 0 ||
    (e.quoteUnit === "ordinary" && e.ordinarySharesPerQuotedUnit !== 1))) return null;
  const first = active[0];
  if (active.some((e) => e.issuerId !== first.issuerId || e.securityId !== first.securityId ||
    e.ordinaryClassId !== first.ordinaryClassId || e.quoteUnit !== first.quoteUnit ||
    e.ordinarySharesPerQuotedUnit !== first.ordinarySharesPerQuotedUnit)) return null;
  return first;
}

export interface CommonIncomeInputs {
  netIncome: number | null;
  netIncomeAvailableToCommon?: number | null;
  preferredDividendsPaid?: number | null;
  noncontrollingIncome?: number | null;
  netIncomeOwnershipBasis?: "parent" | "consolidated";
}
export interface CommonEquityInputs {
  totalStockholdersEquity: number | null;
  preferredStock?: number | null;
  minorityInterest?: number | null;
  commonEquity?: number | null;
  /** FMP totalStockholdersEquity is parent equity; consolidated must be explicit. */
  equityOwnershipBasis?: "parent" | "consolidated";
}

export function commonHolderCapital(income: CommonIncomeInputs | null, balance: CommonEquityInputs | null): {
  commonEquity: number | null;
  commonIncome: number | null;
  equityBasis: string;
  incomeBasis: string;
  equityWithheldReason: string | null;
  incomeWithheldReason: string | null;
} {
  const preferred = finite(balance?.preferredStock) ? balance.preferredStock : 0;
  const nci = finite(balance?.minorityInterest) ? balance.minorityInterest : 0;
  let commonEquity: number | null = null;
  let equityWithheldReason: string | null = null;
  const equityBasis = finite(balance?.commonEquity) ? "explicit common equity" :
    `${balance?.equityOwnershipBasis === "consolidated" ? "consolidated equity less noncontrolling equity" : "parent stockholders equity (excludes noncontrolling equity)"} less preferred stock`;
  if (finite(balance?.commonEquity)) commonEquity = balance.commonEquity;
  else if (finite(balance?.totalStockholdersEquity)) {
    if (balance.equityOwnershipBasis === "consolidated" && !finite(balance.minorityInterest)) {
      equityWithheldReason = "consolidated equity has no disclosed noncontrolling-equity allocation — common equity unavailable";
    } else commonEquity = balance.totalStockholdersEquity - preferred - (balance.equityOwnershipBasis === "consolidated" ? nci : 0);
  }
  let commonIncome: number | null = null;
  let incomeWithheldReason: string | null = null;
  let incomeBasis = "net income available to common";
  if (finite(income?.netIncomeAvailableToCommon)) commonIncome = income.netIncomeAvailableToCommon;
  else if (finite(income?.netIncome)) {
    const prefDistribution = finite(income.preferredDividendsPaid) ? Math.abs(income.preferredDividendsPaid) : null;
    if (preferred > 0 && (prefDistribution === null || prefDistribution === 0)) {
      incomeWithheldReason = "preferred stock is outstanding but common earnings and a usable preferred distribution are unavailable — common-income P/E withheld";
    } else if (nci > 0 && income.netIncomeOwnershipBasis === undefined) {
      incomeWithheldReason = "noncontrolling interests are outstanding but net income ownership and common earnings are unavailable — common-income P/E withheld";
    } else if (income.netIncomeOwnershipBasis === "consolidated" && !finite(income.noncontrollingIncome) && nci !== 0) {
      incomeWithheldReason = "consolidated net income has no disclosed noncontrolling-income allocation — common-income P/E withheld";
    } else {
      commonIncome = income.netIncome - (prefDistribution ?? 0) -
        (income.netIncomeOwnershipBasis === "consolidated" ? income.noncontrollingIncome ?? 0 : 0);
      incomeBasis = "net income less disclosed preferred distributions" +
        (income.netIncomeOwnershipBasis === "consolidated" ? " and noncontrolling income" : " (parent income; no second NCI deduction)");
    }
  }
  return { commonEquity, commonIncome, equityBasis, incomeBasis, equityWithheldReason, incomeWithheldReason };
}
