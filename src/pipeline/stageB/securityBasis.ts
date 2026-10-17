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

/** Retained filing evidence, never inferred from class names or raw share-count sums. */
export interface EconomicShareEvidence {
  issuerId: string;
  securityId: string;
  asOf: string;
  filed: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  /** The source establishes that every economically participating common class is included. */
  complete: boolean;
  sourceHash: string;
  sourceIds: string[];
  classes: {
    classId: string;
    shares: number;
    countBasis: "outstanding" | "issued";
    /** Economic units of the quoted common share represented by ONE share of this class. */
    economicUnitsPerQuotedShare: number | null;
    priceBasis: "quoted-market-price" | "economic-equivalence-proxy";
    /** A separately quoted class needs its own dated price in the quote currency. */
    observedPrice?: { value: number; currency: string; asOf: string; sourceIds: string[]; sourceHash: string };
  }[];
}

export interface EconomicEquityScope {
  status: "resolved" | "unresolved" | "unverified-vendor-scope";
  marketCap: number | null;
  economicShares: number | null;
  approximate: boolean;
  basis: string;
  sourceIds: string[];
  sourceHashes: string[];
  shareCountAsOf: string | null;
  currency?: string | null;
  classPriceDates?: { classId: string; asOf: string }[];
}

/** A class sum is admissible only with complete inventory, outstanding counts and known economic rights. */
export function resolveEconomicEquityScope(
  quote: { price: number | null; marketCap: number | null; issuerId?: string; securityId?: string;
    currency?: string | null;
    isAdr?: boolean | null; marketCapSecurityBasis?: "issuer-common" | "quoted-security" | "unresolved";
    marketCapScopeEvidence?: { reason: string; sourceIds: string[] } },
  evidence: readonly EconomicShareEvidence[],
  asOf: string,
): EconomicEquityScope {
  const unresolved = (): EconomicEquityScope => ({ status: "unresolved", marketCap: null, economicShares: null,
    approximate: false, sourceIds: quote.marketCapScopeEvidence?.sourceIds ?? [], sourceHashes: [], shareCountAsOf: null,
    basis: "Issuer-common economic share scope unresolved: complete class coverage, outstanding counts and economic rights on the quoted security basis are required; aggregate equity and EV multiples withheld." +
      (quote.marketCapScopeEvidence ? ` ${quote.marketCapScopeEvidence.reason}` : "") });
  if (evidence.length > 0) {
    // An ADS ratio requires its separate security evidence; class counts never establish it.
    if (quote.isAdr === true || !day(asOf) || !quote.issuerId || !quote.securityId) return unresolved();
    const active = evidence.filter(row => day(row.effectiveFrom) && row.effectiveFrom <= asOf &&
      (row.effectiveTo === null || (day(row.effectiveTo) && row.effectiveTo > asOf)));
    if (!active.length || !finite(quote.price) || quote.price <= 0) return unresolved();
    const totals: number[] = [];
    const classValues: number[] = [];
    for (const row of active) {
      if (row.issuerId !== quote.issuerId || row.securityId !== quote.securityId || !row.complete ||
        !day(row.asOf) || row.asOf > asOf || !day(row.filed) || row.filed > asOf || row.filed < row.asOf ||
        !row.sourceHash || !row.sourceIds.length || row.sourceIds.some(id => !id) || !row.classes.length ||
        new Set(row.classes.map(item => item.classId)).size !== row.classes.length ||
        row.classes.some(item => !item.classId || item.countBasis !== "outstanding" || !finite(item.shares) || item.shares < 0 ||
          !finite(item.economicUnitsPerQuotedShare) || item.economicUnitsPerQuotedShare <= 0 ||
          (item.priceBasis !== "quoted-market-price" && item.priceBasis !== "economic-equivalence-proxy"))) return unresolved();
      totals.push(row.classes.reduce((sum, item) => sum + item.shares * item.economicUnitsPerQuotedShare!, 0));
      let classValue = 0;
      for (const cls of row.classes) {
        const observed = cls.observedPrice;
        if (observed) {
          if (cls.priceBasis !== "quoted-market-price" || !finite(observed.value) || observed.value <= 0 ||
            !quote.currency || observed.currency !== quote.currency || !day(observed.asOf) || observed.asOf > asOf || observed.asOf < row.asOf ||
            !observed.sourceHash || !observed.sourceIds.length || observed.sourceIds.some(id => !id)) return unresolved();
          classValue += cls.shares * observed.value;
        } else if (cls.priceBasis === "economic-equivalence-proxy") {
          classValue += cls.shares * cls.economicUnitsPerQuotedShare! * quote.price;
        } else if (cls.classId === quote.securityId && cls.economicUnitsPerQuotedShare === 1) {
          classValue += cls.shares * quote.price;
        } else return unresolved();
      }
      if (!finite(classValue) || classValue <= 0) return unresolved();
      classValues.push(classValue);
    }
    const row = active[0];
    const signature = (item: EconomicShareEvidence): string => JSON.stringify([...item.classes].sort((a, b) => a.classId.localeCompare(b.classId)));
    if (!finite(totals[0]) || totals[0] <= 0 || active.some(item => item.asOf !== row.asOf || signature(item) !== signature(row))) return unresolved();
    const approximate = active.some(item => item.classes.some(cls => cls.priceBasis === "economic-equivalence-proxy"));
    return { status: "resolved", marketCap: classValues[0], economicShares: totals[0], approximate,
      currency: quote.currency ?? null,
      classPriceDates: row.classes.flatMap(cls => cls.observedPrice ? [{ classId: cls.classId, asOf: cls.observedPrice.asOf }] : []),
      sourceIds: [...new Set(active.flatMap(item => [...item.sourceIds, ...item.classes.flatMap(cls => cls.observedPrice?.sourceIds ?? [])]))],
      sourceHashes: [...new Set(active.flatMap(item => [item.sourceHash, ...item.classes.flatMap(cls => cls.observedPrice ? [cls.observedPrice.sourceHash] : [])]))], shareCountAsOf: row.asOf,
      basis: `Issuer-common equity = sum of each class's outstanding count x its admitted class price (${totals[0]} economic share units at ${row.asOf}); ` +
        (approximate ? "same-price approximation for equivalent unquoted classes, not a traded quote for those classes. " : "quoted common-class price basis. ") +
        `Evidence: ${active.flatMap(item => item.sourceIds).join(", ")}.` };
  }
  if (quote.marketCapSecurityBasis === "quoted-security" || quote.marketCapSecurityBasis === "unresolved" ||
    (quote.isAdr === true && quote.marketCapSecurityBasis !== "issuer-common")) return unresolved();
  return { status: "unverified-vendor-scope", marketCap: finite(quote.marketCap) && quote.marketCap > 0 ? quote.marketCap : null,
    economicShares: null, approximate: false, sourceIds: [], sourceHashes: [], shareCountAsOf: null,
    basis: "Provided market capitalization retained; all-class economic coverage is not independently established. A single SEC share fact alone does not establish complete common-class scope." };
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
