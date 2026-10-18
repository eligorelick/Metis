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
  /** Admitted main quote valuation day, independent of report build/fetch day. */
  priceAsOf?: string | null;
}

/** A class sum is admissible only with complete inventory, outstanding counts and known economic rights. */
export function resolveEconomicEquityScope(
  quote: { price: number | null; marketCap: number | null; issuerId?: string; securityId?: string;
    currency?: string | null;
    priceAsOf?: string | null;
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
    if (quote.isAdr === true || !day(asOf) || !quote.issuerId || !quote.securityId ||
      typeof quote.priceAsOf !== "string" || !day(quote.priceAsOf) || quote.priceAsOf > asOf) return unresolved();
    const priceDay = quote.priceAsOf;
    const active = evidence.filter(row => day(row.effectiveFrom) && row.effectiveFrom <= priceDay &&
      (row.effectiveTo === null || (day(row.effectiveTo) && row.effectiveTo > priceDay)));
    if (!active.length || !finite(quote.price) || quote.price <= 0) return unresolved();
    const totals: number[] = [];
    const classValues: number[] = [];
    for (const row of active) {
      if (row.issuerId !== quote.issuerId || row.securityId !== quote.securityId || !row.complete ||
        !day(row.asOf) || row.asOf > priceDay || !day(row.filed) || row.filed > asOf || row.filed < row.asOf ||
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
            !quote.currency || observed.currency !== quote.currency || !day(observed.asOf) || observed.asOf !== priceDay ||
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
      priceAsOf: priceDay,
      classPriceDates: row.classes.flatMap(cls => cls.observedPrice ? [{ classId: cls.classId, asOf: cls.observedPrice.asOf }] : []),
      sourceIds: [...new Set(active.flatMap(item => [...item.sourceIds, ...item.classes.flatMap(cls => cls.observedPrice?.sourceIds ?? [])]))],
      sourceHashes: [...new Set(active.flatMap(item => [item.sourceHash, ...item.classes.flatMap(cls => cls.observedPrice ? [cls.observedPrice.sourceHash] : [])]))], shareCountAsOf: row.asOf,
      basis: `Issuer-common equity = sum of each class's outstanding count x its admitted class price (${totals[0]} economic share units at ${row.asOf}); ` +
        (approximate ? "same-price approximation for equivalent unquoted classes, not a traded quote for those classes. " : "quoted common-class price basis. ") +
        `Price policy: every separately observed class price must share the main quote valuation day ${priceDay}; report/fetch dates do not substitute for that session. ` +
        `Evidence: ${active.flatMap(item => item.sourceIds).join(", ")}.` };
  }
  if (quote.marketCapSecurityBasis === "quoted-security" || quote.marketCapSecurityBasis === "unresolved" ||
    (quote.isAdr === true && quote.marketCapSecurityBasis !== "issuer-common")) return unresolved();
  return { status: "unverified-vendor-scope", marketCap: finite(quote.marketCap) && quote.marketCap > 0 ? quote.marketCap : null,
    priceAsOf: typeof quote.priceAsOf === "string" && day(quote.priceAsOf) ? quote.priceAsOf : null,
    economicShares: null, approximate: false, sourceIds: [], sourceHashes: [], shareCountAsOf: null,
    basis: "Provided market capitalization retained; all-class economic coverage is not independently established. A single SEC share fact alone does not establish complete common-class scope." };
}

/** The economic flow interval, independent of a nearby display date. */
export interface CommonIncomeFlowScope {
  issuerId?: string | null;
  currency?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  basis?: "annual" | "quarter" | "ttm";
  allocationBasis?: "common-equity" | "basic-eps-common-stockholders" | "unknown";
  observedAt?: string | null;
  filedAt?: readonly string[];
  /** Vendor row acceptance, used only when independent field evidence is absent. */
  acceptedAt?: string | null;
}

/** Missing vendor starts are not contradictions; explicit incompatible evidence is. */
export function commonIncomeFlowRefusal(anchor?: CommonIncomeFlowScope, candidate?: CommonIncomeFlowScope): string | null {
  for (const scope of [anchor, candidate]) {
    if ((scope?.periodStart != null && !day(scope.periodStart)) || (scope?.periodEnd != null && !day(scope.periodEnd))) {
      return "common earnings flow contains an invalid ISO calendar date";
    }
    if (!scope?.periodStart || !scope.periodEnd) continue;
    const days = (Date.parse(scope.periodEnd) - Date.parse(scope.periodStart)) / 86_400_000 + 1;
    const limits = scope.basis === "quarter" ? [60, 120] : scope.basis === "annual" || scope.basis === "ttm" ? [350, 380] : null;
    if (!Number.isFinite(days) || (limits && (days < limits[0]! || days > limits[1]!))) {
      return `common earnings flow interval does not establish its ${scope.basis ?? "reported"} basis (${scope.periodStart} to ${scope.periodEnd})`;
    }
  }
  if (!anchor || !candidate) return null;
  for (const key of ["issuerId", "currency", "periodStart", "periodEnd", "basis"] as const) {
    const a = anchor[key], b = candidate[key];
    if (a != null && b != null && a !== b) return `common earnings flow ${key} mismatch (${a} versus ${b}); nearby dates do not establish a compatible economic interval`;
  }
  return null;
}

interface CommonEvidenceTime { precision: "day" | "instant"; earliest: number; latest: number }
const EARNINGS_DAY_MS = 86_400_000;

/** Unzoned clocks retain calendar precision; they are never parsed in host time. */
function commonEvidenceTime(value: string): CommonEvidenceTime | null {
  if (day(value)) {
    const earliest = Date.parse(`${value}T00:00:00Z`);
    return { precision: "day", earliest, latest: earliest + EARNINGS_DAY_MS - 1 };
  }
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!match || !day(match[1]!)) return null;
  const hour = Number(match[2]), minute = Number(match[3]), second = Number(match[4] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return null;
  const earliest = Date.parse(`${match[1]}T00:00:00Z`);
  const zone = match[6];
  if (zone === undefined) return { precision: "day", earliest, latest: earliest + EARNINGS_DAY_MS - 1 };
  let offset = 0;
  if (zone !== "Z") {
    const zoneHour = Number(zone.slice(1, 3)), zoneMinute = Number(zone.slice(4, 6));
    if (zoneHour > 23 || zoneMinute > 59) return null;
    offset = (zone[0] === "+" ? 1 : -1) * (zoneHour * 60 + zoneMinute) * 60_000;
  }
  const instant = earliest + hour * 3_600_000 + minute * 60_000 + second * 1000 + Number((match[5] ?? "0").padEnd(3, "0")) - offset;
  return Number.isFinite(instant) ? { precision: "instant", earliest: instant, latest: instant } : null;
}

function commonIncomeAvailabilityRefusal(scope?: CommonIncomeFlowScope, asOf?: string): string | null {
  const filed = (scope?.filedAt ?? []).map(commonEvidenceTime);
  // An empty observedAt is the existing legacy "not captured" placeholder.
  const observed = scope?.observedAt ? commonEvidenceTime(scope.observedAt) : undefined;
  const accepted = scope?.acceptedAt ? commonEvidenceTime(scope.acceptedAt) : undefined;
  if (filed.some(stamp => stamp === null) || observed === null || accepted === null) return "common earnings source evidence contains an invalid calendar timestamp";
  if (asOf == null) return null;
  const cutoffStamp = commonEvidenceTime(asOf);
  if (!cutoffStamp || (cutoffStamp.precision !== "instant" && !day(asOf))) return "common earnings analysis cutoff is invalid or lacks a time zone";
  // Preserve legacy date-only cutoffs as UTC start-of-day, not end-of-day.
  const cutoff = cutoffStamp.earliest;
  if (scope?.periodEnd && Date.parse(`${scope.periodEnd}T00:00:00Z`) > cutoff) return "common earnings flow ends after the analysis cutoff";
  if (observed && observed.latest > cutoff) return "common earnings observation is not proven available at the analysis cutoff";
  const preciseObservation = observed?.precision === "instant" && observed.latest <= cutoff;
  if (accepted && accepted.earliest > cutoff) return "common earnings acceptance is unavailable at the analysis cutoff";
  if (accepted && accepted.latest > cutoff && !preciseObservation) return "common earnings acceptance is not proven available at the analysis cutoff";
  // Observation proves this whole field; acceptance proves only its own vendor
  // row. A precise component filing cannot prove another component's filing day.
  const preciseProof = preciseObservation || (accepted?.precision === "instant" && accepted.latest <= cutoff);
  for (const stamp of filed) {
    if (!stamp) continue;
    if (stamp.earliest > cutoff || (stamp.precision === "instant" && stamp.latest > cutoff)) return "common earnings filing is unavailable at the analysis cutoff";
    if (stamp.latest > cutoff && !preciseProof) return "common earnings same-day filing availability is unknown at calendar-day precision";
  }
  return null;
}

/** Admit one source flow independently of an unused earnings fallback. */
export function commonIncomeTargetRefusal(scope?: CommonIncomeFlowScope, target?: CommonIncomeFlowScope, asOf?: string, capitalPeriodEnd?: string): string | null {
  if ((target?.periodStart != null && !day(target.periodStart)) || (target?.periodEnd != null && !day(target.periodEnd))) {
    return "common earnings target contains an invalid ISO calendar date";
  }
  if (capitalPeriodEnd != null && !day(capitalPeriodEnd)) return "common earnings capital balance date is not a valid ISO calendar date";
  const invalid = commonIncomeFlowRefusal(scope);
  if (invalid) return invalid;
  const unavailable = commonIncomeAvailabilityRefusal(scope, asOf);
  if (unavailable) return unavailable;
  if (scope && target) {
    for (const key of ["issuerId", "currency", "periodStart", "basis"] as const) {
      if (scope[key] != null && target[key] != null && scope[key] !== target[key]) return `common earnings source ${key} does not match its target flow`;
    }
    if (scope.periodEnd && target.periodEnd && Math.abs(Date.parse(scope.periodEnd) - Date.parse(target.periodEnd)) > 5 * 86_400_000) {
      return "common earnings actual period end is incompatible with its target date";
    }
  }
  if (scope?.periodEnd && capitalPeriodEnd && Math.abs(Date.parse(scope.periodEnd) - Date.parse(capitalPeriodEnd)) > 5 * 86_400_000) {
    return "common earnings actual period end is incompatible with the capital balance date";
  }
  return null;
}

/** Shared current/history gate; candidate row continuity cannot prove field coverage. */
export function commonIncomeQuarterWindowRefusal(rows: readonly { scope?: CommonIncomeFlowScope; target?: CommonIncomeFlowScope; asOf?: string }[]): string | null {
  for (const field of ["issuerId", "currency"] as const) {
    const known = rows.map(row => row.scope?.[field]).filter(value => value != null);
    if (new Set(known).size > 1) return `TTM earnings ${field} differs across actual quarterly flows`;
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!, scope = row.scope;
    const invalid = commonIncomeTargetRefusal(scope, row.target, row.asOf);
    if (invalid) return invalid;
    const older = rows[i + 1]?.scope;
    if (scope?.periodEnd && older?.periodEnd && Date.parse(scope.periodEnd) <= Date.parse(older.periodEnd)) return "TTM earnings actual quarter ends are duplicated or out of order";
    if (scope?.periodStart && older?.periodEnd && Date.parse(scope.periodStart) !== Date.parse(older.periodEnd) + 86_400_000) return "TTM earnings actual quarterly intervals overlap or leave a gap";
  }
  return rows.length === 4 ? commonIncomeFlowRefusal({ basis: "ttm", periodStart: rows[3]?.scope?.periodStart, periodEnd: rows[0]?.scope?.periodEnd }) : null;
}

export interface CommonIncomeInputs {
  netIncome: number | null;
  netIncomeAvailableToCommon?: number | null;
  preferredDividendsPaid?: number | null;
  noncontrollingIncome?: number | null;
  netIncomeOwnershipBasis?: "parent" | "consolidated";
  incomeScope?: CommonIncomeFlowScope;
  commonIncomeScope?: CommonIncomeFlowScope;
  preferredCashScope?: CommonIncomeFlowScope;
  noncontrollingIncomeScope?: CommonIncomeFlowScope;
  preferredClaimsInPeriod?: boolean;
  commonIncomeWithheldReason?: string | null;
  netIncomeWithheldReason?: string | null;
  targetScope?: CommonIncomeFlowScope;
  admissionAsOf?: string;
  capitalPeriodEnd?: string;
}

/** Current and historical TTM use one ownership/allocation completeness rule. */
export function commonIncomeQuarterAllocationRefusal(rows: readonly CommonIncomeInputs[]): string | null {
  if (rows.every(row => finite(row.netIncomeAvailableToCommon))) return null;
  const invalid = rows.find(row => row.netIncomeWithheldReason)?.netIncomeWithheldReason;
  if (invalid) return invalid;
  if (rows.some(row => row.noncontrollingIncome != null && !finite(row.noncontrollingIncome))) return "TTM noncontrolling-income allocation is nonfinite";
  const ownership = rows[0]?.netIncomeOwnershipBasis;
  if (!rows.every(row => row.netIncomeOwnershipBasis === ownership)) return "TTM net income ownership is inconsistent or missing across quarters";
  if (ownership === undefined && rows.some(row => finite(row.noncontrollingIncome) && row.noncontrollingIncome !== 0)) return "TTM signed noncontrolling income is disclosed but net income ownership is unknown";
  if (ownership === "consolidated" && rows.some(row => !finite(row.noncontrollingIncome))) return "consolidated TTM net income requires all four signed noncontrolling-income allocations";
  return null;
}

/** One whole-window numerator construction for current and historical P/E. */
export function constructCommonIncomeQuarterWindow(rows: readonly CommonIncomeInputs[], fallbackCurrency?: string | null): CommonIncomeInputs {
  if (rows.length !== 4) return { netIncome: null, commonIncomeWithheldReason: "TTM common earnings require exactly four quarters" };
  const sum = (key: "netIncome" | "netIncomeAvailableToCommon" | "noncontrollingIncome"): number | null =>
    rows.every(row => finite(row[key])) ? rows.reduce((total, row) => total + (row[key] as number), 0) : null;
  const flowRefusal = (key: "incomeScope" | "commonIncomeScope" | "noncontrollingIncomeScope"): string | null =>
    commonIncomeQuarterWindowRefusal(rows.map(row => ({ scope: row[key], target: row.targetScope, asOf: row.admissionAsOf })));
  const completeCommon = rows.every(row => finite(row.netIncomeAvailableToCommon));
  // Validate supplied common facts even when their partial sum cannot be used;
  // scopes manufactured for absent common facts are not operands.
  const commonIncomeWithheldReason = (completeCommon ? flowRefusal("commonIncomeScope") : null) ??
    rows.filter(row => finite(row.netIncomeAvailableToCommon) || row.commonIncomeWithheldReason)
      .map(row => selectCommonIncome(row, null).withheldReason).find(reason => reason !== null) ?? null;
  const ownership = rows.every(row => row.netIncomeOwnershipBasis === rows[0]!.netIncomeOwnershipBasis) ? rows[0]!.netIncomeOwnershipBasis : undefined;
  const netIncomeWithheldReason = commonIncomeQuarterAllocationRefusal(rows) ?? flowRefusal("incomeScope") ??
    (ownership === "consolidated" ? flowRefusal("noncontrollingIncomeScope") : null) ??
    rows.map(row => commonIncomeFlowRefusal(row.incomeScope, ownership === "consolidated" ? row.noncontrollingIncomeScope : undefined))
      .find(reason => reason !== null) ?? null;
  const scope = (key: "incomeScope" | "commonIncomeScope" | "noncontrollingIncomeScope"): CommonIncomeFlowScope => {
    const scopes = rows.map(row => row[key]);
    const coherent = <K extends "issuerId" | "currency" | "allocationBasis">(field: K): CommonIncomeFlowScope[K] =>
      scopes.every(value => value?.[field] === scopes[0]?.[field]) ? scopes[0]?.[field] : undefined;
    return { issuerId: coherent("issuerId"), currency: coherent("currency") ?? fallbackCurrency,
      periodStart: scopes.every(value => value?.periodStart) ? scopes[3]?.periodStart : undefined,
      periodEnd: scopes[0]?.periodEnd, basis: "ttm", allocationBasis: coherent("allocationBasis") ?? "unknown" };
  };
  return { netIncome: sum("netIncome"), netIncomeAvailableToCommon: commonIncomeWithheldReason ? null : sum("netIncomeAvailableToCommon"),
    noncontrollingIncome: sum("noncontrollingIncome"), netIncomeOwnershipBasis: ownership,
    commonIncomeWithheldReason, netIncomeWithheldReason,
    incomeScope: scope("incomeScope"), commonIncomeScope: scope("commonIncomeScope"), noncontrollingIncomeScope: scope("noncontrollingIncomeScope"),
    targetScope: { periodEnd: rows[0]!.targetScope?.periodEnd, currency: fallbackCurrency, basis: "ttm" }, admissionAsOf: rows[0]!.admissionAsOf,
    preferredClaimsInPeriod: rows.some(row => row.preferredClaimsInPeriod || (finite(row.preferredDividendsPaid) && row.preferredDividendsPaid !== 0)) };
}
export interface CommonEquityInputs {
  totalStockholdersEquity: number | null;
  preferredStock?: number | null;
  minorityInterest?: number | null;
  commonEquity?: number | null;
  /** FMP totalStockholdersEquity is parent equity; consolidated must be explicit. */
  equityOwnershipBasis?: "parent" | "consolidated";
}

/** One earnings selector for returns, payout denominators and common-income multiples. */
export function selectCommonIncome(income: CommonIncomeInputs | null, balance: CommonEquityInputs | null): {
  value: number | null; basis: string; withheldReason: string | null;
} {
  const withheld = (reason: string) => ({ value: null, basis: "common earnings unavailable", withheldReason: reason });
  if (income?.commonIncomeWithheldReason) return withheld(income.commonIncomeWithheldReason);
  if (finite(income?.netIncomeAvailableToCommon)) {
    const mismatch = commonIncomeTargetRefusal(income.commonIncomeScope, income.targetScope, income.admissionAsOf, income.capitalPeriodEnd);
    const convention = income.commonIncomeScope?.allocationBasis === "basic-eps-common-stockholders"
      ? "filed Basic EPS common-stockholder numerator under the current house return convention; participating-security allocations can differ from issuer common-equity earnings"
      : income.commonIncomeScope?.allocationBasis === "common-equity" ? "filed common-equity earnings" : "supplied net income available to common (allocation convention unknown)";
    return mismatch ? withheld(mismatch) : { value: income.netIncomeAvailableToCommon, basis: `${convention}; no second preferred or NCI deduction`, withheldReason: null };
  }
  if (income?.netIncomeWithheldReason) return withheld(income.netIncomeWithheldReason);
  if (!finite(income?.netIncome)) return withheld("net income and filed common earnings unavailable");
  const incomeScopeRefusal = commonIncomeTargetRefusal(income.incomeScope, income.targetScope, income.admissionAsOf, income.capitalPeriodEnd);
  if (incomeScopeRefusal) return withheld(incomeScopeRefusal);
  if (income.noncontrollingIncome != null && !finite(income.noncontrollingIncome)) return withheld("noncontrolling-income allocation is nonfinite");
  const preferred = income.preferredClaimsInPeriod === true || (finite(balance?.preferredStock) && balance.preferredStock > 0) ||
    (finite(income.preferredDividendsPaid) && income.preferredDividendsPaid !== 0);
  if (preferred) return withheld("preferred claims exist during the earnings period but filed common earnings or a complete earnings-allocation bridge are unavailable; cash paid is not an earnings allocation");
  const nci = finite(balance?.minorityInterest) ? balance.minorityInterest : 0;
  if (income.netIncomeOwnershipBasis === undefined && finite(income.noncontrollingIncome) && income.noncontrollingIncome !== 0) {
    return withheld("signed noncontrolling income is disclosed but net income ownership is unknown; parent versus consolidated allocation cannot be inferred");
  }
  if (nci !== 0 && income.netIncomeOwnershipBasis === undefined) return withheld("noncontrolling interests are outstanding but net income ownership and common earnings are unavailable");
  if (income.netIncomeOwnershipBasis === "consolidated") {
    if (nci !== 0 && !finite(income.noncontrollingIncome)) return withheld("consolidated net income has no disclosed noncontrolling-income allocation");
    const mismatch = commonIncomeFlowRefusal(income.incomeScope, income.noncontrollingIncomeScope) ?? commonIncomeTargetRefusal(income.noncontrollingIncomeScope, income.targetScope, income.admissionAsOf);
    if (mismatch) return withheld(mismatch);
    return { value: income.netIncome - (income.noncontrollingIncome ?? 0), basis: "consolidated income less signed noncontrolling income; no preferred claims known", withheldReason: null };
  }
  return { value: income.netIncome, basis: "parent income; no outside preferred claims known and no second NCI deduction", withheldReason: null };
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
  const selected = selectCommonIncome(income, balance);
  const commonIncome = selected.value, incomeBasis = selected.basis, incomeWithheldReason = selected.withheldReason;
  return { commonEquity, commonIncome, equityBasis, incomeBasis, equityWithheldReason, incomeWithheldReason };
}
