/** Statement arithmetic and overlap guards; compose compatible operands once (P7; D-100, D-134). */
import { type FactIndex, pickUnitPoints, findDurationExact, findAnnualDuration, type UnitPoints } from "./factIndex";
import { type QuarterContext } from "./quarters";
import { type UnitKind, DISCONTINUED_LABEL_TAGS, NCI_INFERRED_ZERO_DISCLOSURE, DUPLICATE_DEBT_CLASS_SHARE, COMBINED_CURRENT_TAG, CURRENT_MATURITY_TAGS, NOTES_AND_LOANS_CURRENT_TAGS, INCLUSIVE_LONG_TERM_TAG, INCLUSIVE_DEBT_COMPONENT_TAGS, CURRENT_DEBT_COMPONENT_TAGS, longTermDebtHoldsFinanceLeases } from "./fieldSpecs";
import { type FactPoint } from "@/edgar/xbrl";
import { withinDays, TOLERANCE_DAYS, tidy, MONEY_DECIMALS, displayRoundingUnit } from "./periodMath";
import { belowComponentFloor } from "@/edgar/synonymFloor";
import { type LabelCopy } from "@/edgar/presentationLineage";
import { type NoteSink, type Resolved, combine } from "./resolution";
import { GROSS_PROFIT_REVENUE_TAGS, GROSS_PROFIT_COST_TAGS, tagsFor, MATURITIES_NEXT_YEAR_TAG } from "@/edgar/tagSynonyms";
import { VENDOR_SEC_TOLERANCE, filedSumWithinTotal } from "@/edgar/vendorAgreement";
import { type StatementConflictCause } from "@/types/refusalCause";
import { partialFinanceLeaseReason, omittedConvertibleCarryingReason, incompleteDebtReason, uncomposedDebtRefusal, DEBT_AGGREGATE_TAGS, commercialPaperInsideBorrowings, fiscalMaturityScopeReason } from "@/edgar/debtCompleteness";


/**
 * Whether the candidate tag sits below the floor tag in a filing that carries both for a period the quarter nets
 * (the fiscal year and the year to date through the previous quarter, or the year to date and the one before it).
 * Each period is compared copy for copy inside one filing, so no mixed presentation enters the comparison. Null
 * when no filing carries both tags for any such period.
 */
function sameFilingVerdict(
  index: FactIndex,
  ctx: QuarterContext,
  floorTag: string,
  candidateTag: string,
  kind: UnitKind,
  currency: string | undefined,
): { below: boolean; detail: string } | null {
  const floor = pickUnitPoints(index, floorTag, kind, currency);
  const candidate = pickUnitPoints(index, candidateTag, kind, currency);
  if (floor === null || candidate === null || floor.unit !== candidate.unit) return null;
  const periods: [string, string][] = [];
  if (ctx.isFiscalYearEnd) {
    const fy = (ctx.fyStart !== null ? findDurationExact(floor.points, ctx.fyStart, ctx.end) : null) ?? findAnnualDuration(floor.points, ctx.end);
    if (fy?.start !== undefined) {
      periods.push([fy.start, fy.end]);
      if (ctx.previousEnd !== null) periods.push([fy.start, ctx.previousEnd]);
    }
  } else if (ctx.fyStart !== null) {
    periods.push([ctx.fyStart, ctx.end]);
    if (ctx.previousEnd !== null) periods.push([ctx.fyStart, ctx.previousEnd]);
  }
  let decided = false;
  for (const [start, end] of periods) {
    const copies = (up: UnitPoints): FactPoint[] =>
      up.all.filter((p) => p.start !== undefined && withinDays(p.start, start, TOLERANCE_DAYS) && withinDays(p.end, end, TOLERANCE_DAYS));
    const floorCopies = copies(floor);
    for (const c of copies(candidate)) {
      const f = floorCopies.find((x) => x.accn === c.accn);
      if (f === undefined) continue;
      decided = true;
      if (belowComponentFloor(c.val, [{ tag: floorTag, value: f.val }]) !== null) {
        return {
          below: true,
          detail: `its filed ${start}..${end} ${c.val} is below ${floorTag} ${f.val} in the same filing (${c.form.trim()} ${c.filed}, ${c.accn})`,
        };
      }
    }
  }
  return decided ? { below: false, detail: "" } : null;
}

/** Every core copy of every discontinued-operations element in the index, once per index (decision C-9 labels). */
const LABEL_COPIES = new WeakMap<FactIndex, LabelCopy[]>();
function labelCopiesOf(index: FactIndex): LabelCopy[] {
  const memo = LABEL_COPIES.get(index);
  if (memo !== undefined) return memo;
  const out = DISCONTINUED_LABEL_TAGS.flatMap((t) => (index.get(t) ?? []).flatMap((u) => u.all.map((p) => ({ ...p, tag: t, unit: u.unit }))));
  LABEL_COPIES.set(index, out);
  return out;
}

// ---------------------------------------------------------------------------
// Computed-field passes (fill only fields still null; operands must be present)
// ---------------------------------------------------------------------------

type FieldValues = Record<string, number | null>;

function add(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : tidy(a + b, MONEY_DECIMALS);
}

function sub(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : tidy(a - b, MONEY_DECIMALS);
}

function sumAnyValues(parts: [string, number | null][], notes: NoteSink, label: string): number | null {
  const present = parts.filter((p): p is [string, number] => p[1] !== null);
  if (present.length === 0) return null;
  const absent = parts.filter((p) => p[1] === null).map((p) => p[0]);
  if (absent.length > 0) {
    notes.add(`${label}: sum of present components (${present.map((p) => p[0]).join(", ")}); absent and excluded: ${absent.join(", ")}`);
  }
  return tidy(present.reduce((s, p) => s + p[1], 0), MONEY_DECIMALS);
}

/**
 * What a computed pass may consult beyond the field values: which tag(s) won
 * each chain, and a direct tag lookup at this period. Both exist for the debt
 * fields, whose chains contain near-synonyms that overlap each other.
 */
interface ComputeContext {
  resolved: ReadonlyMap<string, Resolved>;
  temporaryEquityDisclosed?: boolean;
  /** The filing shows zero noncontrolling interest here without tagging it (see {@link inferredZeroNciPeriods}). */
  nciInferredZero?: boolean;
  /** The value of one money tag at this period, or null. */
  money(tag: string): number | null;
  /** One money tag's resolved fact at this period, for a field recomposed from it. */
  fact?(tag: string): Resolved | null;
  /** Re-points a field's provenance at the facts it was recomposed from, or drops it. */
  replace?(field: string, resolved: Resolved | null): void;
}

function computeIncome(v: FieldValues, notes: NoteSink, ctx: string, cc: ComputeContext, route: "bank" | "general"): void {
  // A gross profit withheld for presentation is not filled as revenue less cost: no derivation follows a
  /* D-134: Filed operands must describe one presentation, and missing or incompatible operands are disclosed. */
  const grossProfitRefused = notes.withheld.some((w) => w.field === "grossProfit" && w.periods.includes(ctx) && notes.presentationRefusals.includes(w.text));
  if (v.grossProfit == null && v.revenue != null && v.costOfRevenue != null && !grossProfitRefused) {
    const revenue = cc.resolved.get("revenue"), cost = cc.resolved.get("costOfRevenue");
    const filings = (resolved: Resolved) => JSON.stringify([...new Set((resolved.evidencePoints ?? [resolved.point]).map(p => `${p.accn}|${p.filed}|${p.form}`))].sort());
    const full = revenue && cost && revenue.tags.some(tag => GROSS_PROFIT_REVENUE_TAGS.includes(tag)) && cost.tags.some(tag => GROSS_PROFIT_COST_TAGS.includes(tag)) &&
      revenue.unit === cost.unit && revenue.point.end === cost.point.end && (revenue.periodStart ?? revenue.point.start) === (cost.periodStart ?? cost.point.start) && filings(revenue) === filings(cost);
    if (full) v.grossProfit = sub(v.revenue, v.costOfRevenue);
    else {
      v.grossProfit = null;
      const reason = "Gross profit unavailable: filed operands do not establish compatible full revenue and total cost for the same interval, unit and filing; partial costs cannot establish the subtotal";
      notes.add(`grossProfit ${ctx} WITHHELD: ${reason}`);
      notes.withhold("grossProfit", ctx, reason);
    }
  }
  if (v.operatingExpenses == null && (v.researchAndDevelopmentExpenses != null || v.sellingGeneralAndAdministrativeExpenses != null)) {
    // These components do not establish a complete expense perimeter: an
    // issuer may separately report technology, indirect marketing, D&A,
    // restructuring or other operating costs outside its standard tags.
    v.operatingExpenses = null;
    notes.add(`operatingExpenses ${ctx} WITHHELD: R&D and SG&A components do not establish a complete operating-expense total; individual components remain available.`);
  }
  v.ebitda ??= add(v.operatingIncome ?? null, v.depreciationAndAmortization ?? null);
  // EBIT follows operating income, and only operating income.
  //
  // It used to be `incomeBeforeTax + interestExpense` with operating income as
  // a fallback, which quietly undid every rule the operating-income derivation
  // enforces: the non-operating items it subtracts, the guard that refuses to
  // derive one for a bank (where interest IS an operating cost, so the sum is
  // not EBIT), and the interest not added back when the filer's non-operating
  // aggregate already contains it. Whenever both operands
  // existed the raw sum won, so a figure that had just been refused or
  // corrected was published anyway under a different name — and EBIT is the one
  // valuation actually reads.
  //
  // Preferring operating income is right in every branch: filed, it is the
  // filer's own number; derived, it carries the adjustments; absent, it is
  // absent on purpose. A gap is the correct outcome, not a fallback.
  if (v.ebit === null || v.ebit === undefined) {
    const strictSum = add(v.incomeBeforeTax ?? null, v.interestExpense ?? null);
    v.ebit = v.operatingIncome ?? null;
    if (v.ebit === null && route === "bank" && strictSum !== null) {
      const text =
        `ebit WITHHELD: pre-tax income plus interest expense is available, but that sum is EBIT only where operating ` +
        `income could be derived, and here it could not — a bank-style filer, where interest is an operating cost. ` +
        `Publishing the sum would ` +
        `restate under a second name the figure the operating-income derivation refused.`;
      notes.add(`income ${ctx}: ${text}`);
      notes.withhold("ebit", ctx, text);
    } else if (v.ebit === null && route === "general" && v.incomeBeforeTax != null) {
      /* D-134: Disclose the missing operating-income operand or the prior presentation refusal before withholding EBIT. */
      const text =
        "ebit WITHHELD: operating income is withheld or could not be derived for this period (see the operatingIncome withholding); " +
        "pretax income plus interest expense alone is not EBIT";
      notes.add(`income ${ctx}: ${text}`);
      notes.withhold("ebit", ctx, text);
    }
  }
}

function computeBalance(v: FieldValues, notes: NoteSink, ctx: string, cc: ComputeContext): void {
  const cashResolution = cc.resolved.get("cashAndCashEquivalents");
  const restrictionDerived = cashResolution?.tags.some(tag => tagsFor("cashAndCashEquivalentsIncludingRestricted").includes(tag)) === true;
  if (restrictionDerived && cashResolution) {
    const filings = new Set((cashResolution.evidencePoints ?? [cashResolution.point]).map(point => `${point.accn}|${point.filed}`));
    if (cashResolution.value < 0 || (cashResolution.evidencePoints ?? [cashResolution.point]).some(p => p.val < 0) || filings.size !== 1) {
      v.cashAndCashEquivalents = null;
      const reason = "unrestricted cash derivation unavailable: a restriction amount is negative or exceeds its combined total, or the operands come from different filings";
      notes.withhold("cashAndCashEquivalents", ctx, reason);
      notes.add(`cashAndCashEquivalents ${ctx}: ${reason}`);
    }
  }
  const cashScopeUnknown = v.cashAndCashEquivalents == null && v.cashAndCashEquivalentsIncludingRestricted != null &&
    !cc.resolved.has("cashAndShortTermInvestments");
  if (v.cashAndCashEquivalents == null && v.cashAndCashEquivalentsIncludingRestricted != null) {
    const reason = "unrestricted cash unavailable: complete compatible current AND noncurrent restrictions are required to subtract from combined cash; no missing restriction is assumed zero";
    notes.withhold("cashAndCashEquivalents", ctx, reason);
    notes.add(`cashAndCashEquivalents ${ctx}: ${reason}`);
  }
  /* D-105: A filed combined cash total below the same-filing disjoint components is a narrower schedule; use the components. */
  /* D-105: Compare the combined cash schedule only with same-filing cash and investment components. */
  const combinedCash = cc.resolved.get("cashAndShortTermInvestments");
  const cashPart = cc.resolved.get("cashAndCashEquivalents");
  const investmentsPart = cc.resolved.get("shortTermInvestments");
  if (combinedCash && cashPart && investmentsPart && !restrictionDerived &&
      v.cashAndShortTermInvestments != null && v.cashAndCashEquivalents != null && v.shortTermInvestments != null) {
    const parts = [combinedCash, cashPart, investmentsPart];
    const filings = new Set(parts.flatMap(r => (r.evidencePoints ?? [r.point]).map(p => `${p.accn}|${p.filed}`)));
    const componentSum = tidy(v.cashAndCashEquivalents + v.shortTermInvestments, MONEY_DECIMALS);
    const combined = v.cashAndShortTermInvestments;
    if (filings.size === 1 && parts.every(r => r.unit === combinedCash.unit) && v.cashAndCashEquivalents >= 0 && v.shortTermInvestments >= 0 &&
        componentSum - combined > Math.max(displayRoundingUnit([combined, v.cashAndCashEquivalents, v.shortTermInvestments]), Math.abs(combined) * VENDOR_SEC_TOLERANCE.share)) {
      const fmt = (n: number) => n.toLocaleString("en-US");
      const text = `CashCashEquivalentsAndShortTermInvestments (${fmt(combined)}) is below the same filing's ${cashPart.tags.join(" + ")} ` +
        `(${fmt(v.cashAndCashEquivalents)}) plus ${investmentsPart.tags.join(" + ")} (${fmt(v.shortTermInvestments)}), so it is a narrower ` +
        `schedule than the balance sheet's two lines; their sum ${fmt(componentSum)} is used (audit 2026-10-22 B-34)`;
      v.cashAndShortTermInvestments = componentSum;
      cc.replace?.("cashAndShortTermInvestments", combine(componentSum, [cashPart, investmentsPart]));
      notes.substitute("cashAndShortTermInvestments", ctx, text);
      notes.add(`cashAndShortTermInvestments ${ctx}: ${text}`);
    }
  }
  // A strict `add` here returned null for every filer that presents a single
  // "Cash and cash equivalents" line and tags no short-term-investment concept
  // (Home Depot, McDonald's, UPS, Costco and hundreds like them). That
  // suppressed the net-debt cash basis and with it the whole DCF equity bridge,
  // for a shape FMP publishes as cash. Sum what is present and name what is not.
  v.cashAndShortTermInvestments ??= sumAnyValues(
    [
      ["cashAndCashEquivalents", v.cashAndCashEquivalents ?? null],
      ["shortTermInvestments", v.shortTermInvestments ?? null],
    ],
    notes,
    `cashAndShortTermInvestments ${ctx}`,
  );
  // D-268: SEC-built rows must prove the same bound as vendor-row admission.
  const carryingInvestment = (investmentsPart?.evidencePoints ?? (investmentsPart ? [investmentsPart.point] : []))
    .some(p => p.instanceCarryingAmount === true);
  let carryingLiquidityUnknown = false;
  if (carryingInvestment) {
    const assets = cc.resolved.get("totalCurrentAssets");
    const others = [cc.resolved.get("netReceivables"), cc.resolved.get("inventory")].filter((r): r is Resolved => r !== undefined);
    const parts = cashPart && investmentsPart && assets ? [cashPart, investmentsPart, assets, ...others] : [];
    const points = parts.flatMap(r => r.evidencePoints ?? [r.point]);
    const anchor = investmentsPart!.point;
    const compatible = parts.length >= 3 && parts.every(r => r.unit === investmentsPart!.unit) && points.every(p =>
      p.start === undefined && p.end === anchor.end && p.accn === anchor.accn && p.filed === anchor.filed && p.form === anchor.form);
    carryingLiquidityUnknown = !compatible || v.cashAndCashEquivalents == null || v.shortTermInvestments == null ||
      !filedSumWithinTotal([v.cashAndCashEquivalents!, v.shortTermInvestments!, ...others.map(r => r.value)], assets!.value);
    if (carryingLiquidityUnknown) {
      v.cashAndShortTermInvestments = null;
      cc.replace?.("cashAndShortTermInvestments", null);
      const reason = "carrying shortTermInvestments lacks a compatible same-filing current-assets bound; combined liquidity and net debt withheld";
      for (const field of ["cashAndShortTermInvestments", "netDebt"]) notes.withhold(field, ctx, reason, "liquidity-not-established");
      notes.add(`cashAndShortTermInvestments ${ctx}: ${reason}`);
    } else {
      v.cashAndShortTermInvestments = v.cashAndCashEquivalents! + v.shortTermInvestments!;
      cc.replace?.("cashAndShortTermInvestments", combine(v.cashAndShortTermInvestments, parts));
    }
  }
  if (cashScopeUnknown) {
    v.cashAndShortTermInvestments = null;
    const reason = "combined cash includes restricted cash but unrestricted cash is unestablished; liquidity and net debt are withheld rather than treating restrictions as available cash";
    for (const field of ["cashAndShortTermInvestments", "netDebt"]) notes.withhold(field, ctx, reason);
    notes.add(`cashAndShortTermInvestments ${ctx}: ${reason}`);
  }
  const hasTemporaryEquity = ["temporaryEquity", "temporaryEquityAttributableToParent", "temporaryEquityAttributableToNoncontrollingInterest"]
    .some(field => v[field] != null) || cc.temporaryEquityDisclosed === true;
  if (cc.nciInferredZero === true && !hasTemporaryEquity && v.totalStockholdersEquity == null && v.minorityInterest == null && v.totalEquity != null) {
    v.minorityInterest = 0;
    v.totalStockholdersEquity = v.totalEquity;
    for (const field of ["minorityInterest", "totalStockholdersEquity"]) notes.substitute(field, ctx, NCI_INFERRED_ZERO_DISCLOSURE);
  }
  // `totalEquity` deliberately stays strict: `validate.ts` and `forensics.ts`
  // both fall back to `totalStockholdersEquity`, so nothing is suppressed.
  v.totalEquity ??= add(v.totalStockholdersEquity ?? null, v.minorityInterest ?? null);
  // A - permanent equity includes mezzanine capital. Do not relabel it as
  // liabilities when a temporary category is disclosed but its full scope may
  // be unknown. Only a directly filed liability total is usable in that case.
  if (!hasTemporaryEquity) v.totalLiabilities ??= sub(v.totalAssets ?? null, v.totalEquity ?? null);
  else if (v.totalLiabilities == null) {
    const reason = "total liabilities unavailable: no directly filed liability total and disclosed temporary-equity scope is present or refused; assets minus permanent equity cannot establish liabilities";
    notes.withhold("totalLiabilities", ctx, reason);
    notes.add(`totalLiabilities ${ctx}: ${reason}`);
  }
  const lease = resolveDebtOverlaps(v, notes, ctx, cc);
  // FMP's definition: shortTermDebt + longTermDebt + capitalLeaseObligations
  // (Apple FY2025 20.329 + 78.328 + 13.720 = 112.377B). Dropping the leases
  // moved net debt, invested capital and the cost-of-debt denominator off the
  // house numbers every band was calibrated against.
  v.totalDebt ??= sumAnyValues(
    lease.inclusiveDebt !== undefined ? [["LongTermDebt (inclusive total)", lease.inclusiveDebt], [lease.label, lease.value]] : [
      ["shortTermDebt", v.shortTermDebt ?? null],
      ["longTermDebt", v.longTermDebt ?? null],
      [lease.label, lease.value],
    ],
    notes,
    `totalDebt ${ctx}`,
  );
  // A refused split of an inclusive total leaves the total established (B-40).
  const debtView = lease.inclusiveDebt !== undefined ? { ...v, shortTermDebt: 0, longTermDebt: lease.inclusiveDebt } : v;
  const refusedCurrent = lease.inclusiveDebt !== undefined ? undefined
    : notes.withheld.find((held) => (held.field === "shortTermDebt" || held.field === "longTermDebt") && held.periods.includes(ctx));
  // Finance leases are debt in every frame, so a missing finance maturity
  // leaves debt incomplete. A missing operating maturity does not: the lease
  // chain keeps the tagged portion and the lease-scope rule confines the row
  /* D-97: Remove operating leases only when filed evidence establishes their inclusion and scope. */
  const partialLease = (["Finance"] as const).find(prefix =>
    cc.resolved.get("capitalLeaseObligations")?.parts?.[`${prefix.toLowerCase()}LeaseLiability`] === undefined &&
    ((cc.money(`${prefix}LeaseLiabilityCurrent`) === null) !== (cc.money(`${prefix}LeaseLiabilityNoncurrent`) === null)));
  // P11 (D-218): each branch records its typed cause beside the unchanged sentence; evaluation order is as before.
  let incomplete: string | null;
  let incompleteCause: StatementConflictCause | undefined;
  if (partialLease !== undefined) {
    incomplete = partialFinanceLeaseReason();
  } else if (refusedCurrent) {
    incomplete = `incomplete debt carrying value: ${refusedCurrent.text}`;
    if (notes.causeOf(refusedCurrent) === "debt-maturity-scope") incompleteCause = "debt-maturity-scope";
  } else {
    const convertible = omittedConvertibleCarryingReason(debtView, cc.money("ConvertibleLongTermNotesPayable"));
    const principal = convertible ?? incompleteDebtReason(debtView, cc.money("DebtInstrumentCarryingAmount"));
    if (principal !== null) {
      incomplete = principal;
      if (convertible === null) incompleteCause = "debt-components-incomplete";
    } else {
      const uncomposed = uncomposedDebtRefusal({ ...debtView, financeLeaseLiability: cc.resolved.get("capitalLeaseObligations")?.parts?.["financeLeaseLiability"] ?? null },
        DEBT_AGGREGATE_TAGS.map((tag) => ({ tag, value: cc.money(tag) })));
      incomplete = uncomposed?.reason ?? null;
      incompleteCause = uncomposed?.cause;
    }
  }
  if (partialLease !== undefined) {
    v.capitalLeaseObligations = null;
    notes.withhold("capitalLeaseObligations", ctx, incomplete!);
  }
  if (incomplete !== null) {
    v.totalDebt = null;
    v.netDebt = null;
    for (const field of ["totalDebt", "netDebt"]) notes.withhold(field, ctx, incomplete, incompleteCause);
    notes.add(`totalDebt ${ctx}: ${incomplete}`);
  }
  v.netDebt ??= sub(v.totalDebt ?? null, v.cashAndCashEquivalents ?? null);
  if (carryingLiquidityUnknown) v.netDebt = null;
  /* D-19: the OPERATING slice of the lease liability, on its own. Under ASC 842 operating-lease cost sits in operating expenses, so EBIT and EBITDA are already AFTER it and only that slice may be netted out of enterprise value; finance-lease cost is split between right-of-use amortisation (added back in EBITDA) and interest (below EBIT), so the finance-lease liability is debt in both frames and stays in EV. Read off the `sumAnyOf` parts the lease chain already resolved — no second tag lookup, and null (never zero) when the filer tagged no operating-lease liability, which is what the EV bridge treats as "not separable". */
  v.operatingLeaseLiability ??=
    cc.resolved.get("capitalLeaseObligations")?.parts?.["operatingLeaseLiability"] ?? null;
  v.financeLeaseLiability ??=
    cc.resolved.get("capitalLeaseObligations")?.parts?.["financeLeaseLiability"] ?? null;
}

/**
 * FMP semantics for the three debt fields: `longTermDebt` is noncurrent debt
 * excluding leases, `shortTermDebt` is current debt, `capitalLeaseObligations`
 * is the operating + finance lease liability, and `totalDebt` is their sum.
 * Three us-gaap tags in the chains break that partition by overlapping each
 * other, and every one of them reaches net debt, invested capital, ROIC, the
 * multiples EV and the cost-of-debt denominator with no note:
 *
 *  1. `LongTermDebtAndCapitalLeaseObligations` already contains the finance
 *     leases that `capitalLeaseObligations` resolves again.
 *  2. `LongTermDebt` is the us-gaap TOTAL including current maturities, which
 *     `shortTermDebt` counts again through `LongTermDebtCurrent`.
 *  3. `CommercialPaper` is conventionally a component of `ShortTermBorrowings`.
 *
 * The composition of all three fields is named in the notes either way, so a
 * reader can see which concepts a debt figure is made of. Returns the label the
 * lease component carries into the `totalDebt` sum.
 */
/** The reason two composed classes look like one obligation tagged twice, or null. */
function duplicateDebtClasses(parts: Record<string, number>): string | null {
  const classes = Object.entries(parts).filter(([, value]) => value !== 0);
  for (const [i, [a, x]] of classes.entries()) {
    for (const [b, y] of classes.slice(i + 1)) {
      if (Math.abs(x - y) <= DUPLICATE_DEBT_CLASS_SHARE * Math.max(Math.abs(x), Math.abs(y))) {
        return `financing debt unresolved: ${a} (${x}) and ${b} (${y}) are within ${DUPLICATE_DEBT_CLASS_SHARE * 100}% of each other, so they may be one obligation tagged under two instrument classes`;
      }
    }
  }
  return null;
}

function resolveDebtOverlaps(
  v: FieldValues,
  notes: NoteSink,
  ctx: string,
  cc: ComputeContext,
): { label: string; value: number | null; inclusiveDebt?: number } {
  const tagsOf = (field: string): string[] => cc.resolved.get(field)?.tags ?? [];
  for (const field of ["shortTermDebt", "longTermDebt", "capitalLeaseObligations"] as const) {
    const tags = tagsOf(field);
    if (tags.length > 0) notes.add(`${field} ${ctx}: from ${tags.join(" + ")}`);
  }

  // Case 3 first: it changes `shortTermDebt`, which case 2 does not read.
  let shortTermTags = tagsOf("shortTermDebt");
  if (commercialPaperInsideBorrowings(shortTermTags)) {
    const commercialPaper = cc.money("CommercialPaper");
    if (commercialPaper !== null && v.shortTermDebt != null) {
      v.shortTermDebt = tidy(v.shortTermDebt - commercialPaper, MONEY_DECIMALS);
      notes.add(
        `shortTermDebt ${ctx}: CommercialPaper excluded — commercial paper is conventionally a component of ShortTermBorrowings, which resolved for this period`,
      );
    }
  }

  // Case 4a: the combined current tag is a superset of `LongTermDebtCurrent`,
  // so beside it the combined figure is dropped.
  const combinedCurrent = shortTermTags.includes(COMBINED_CURRENT_TAG) ? cc.money(COMBINED_CURRENT_TAG) : null;
  const combinedCurrentStands = combinedCurrent !== null && !shortTermTags.includes("LongTermDebtCurrent");
  if (combinedCurrent !== null && !combinedCurrentStands && v.shortTermDebt != null) {
    v.shortTermDebt = tidy(v.shortTermDebt - combinedCurrent, MONEY_DECIMALS);
    notes.add(
      `shortTermDebt ${ctx}: ${COMBINED_CURRENT_TAG} excluded — it contains LongTermDebtCurrent, which also resolved for this period`,
    );
  }

  // Case 5: the maturity schedule's first year is the current portion of
  // long-term debt. It stands in for THAT COMPONENT of the sum only, so it is
  // reached whenever no balance-sheet current-maturities tag resolved — beside
  // short-term borrowings as readily as alone. When such a tag DID resolve the
  // schedule figure never entered the sum, and it is named anyway, because a
  // reader has to see the figure the filer disclosed either way.
  let maturitiesStand = shortTermTags.includes(MATURITIES_NEXT_YEAR_TAG);
  const maturities = cc.money(MATURITIES_NEXT_YEAR_TAG);
  const fiscalRemainder = cc.money("LongTermDebtMaturitiesRepaymentsOfPrincipalRemainderOfFiscalYear");
  // The balance sheet's own split: a LongTermDebt total equal to its
  // noncurrent part carries no current maturities, so the schedule's bucket
  /* D-100: Compose debt from compatible filed components without counting an inclusive amount twice. */
  const inclusiveLong = cc.money("LongTermDebt");
  const noncurrentLong = cc.money("LongTermDebtNoncurrent");
  const noCurrentPortion = maturitiesStand && maturities !== null && inclusiveLong !== null && noncurrentLong !== null &&
    Math.abs(inclusiveLong - noncurrentLong) <= Math.max(1, Math.abs(inclusiveLong) * 1e-6);
  const standing = cc.resolved.get("shortTermDebt");
  if (noCurrentPortion && standing !== undefined && v.shortTermDebt != null) {
    // With no other current component, current debt is the balance sheet's
    // own zero: LongTermDebt less LongTermDebtNoncurrent.
    const rest = standing.tags.filter((tag) => tag !== MATURITIES_NEXT_YEAR_TAG);
    const split = cc.fact?.("LongTermDebt") ?? null;
    v.shortTermDebt = rest.length === 0 ? 0 : tidy(v.shortTermDebt - maturities!, MONEY_DECIMALS);
    cc.replace?.("shortTermDebt", rest.length > 0 ? { ...standing, value: v.shortTermDebt, tags: rest }
      : split === null ? null : { ...split, value: 0, tags: ["LongTermDebt", "LongTermDebtNoncurrent"] });
    shortTermTags = rest;
    maturitiesStand = false;
    notes.add(
      `shortTermDebt ${ctx}: ${MATURITIES_NEXT_YEAR_TAG} ${maturities} not taken as current maturities — the balance sheet's LongTermDebt (${inclusiveLong}) equals its LongTermDebtNoncurrent, so it carries no current portion`,
    );
  }
  const scopeReason = maturitiesStand ? fiscalMaturityScopeReason(maturities, fiscalRemainder) : null;
  if (scopeReason !== null) {
    v.shortTermDebt = null;
    notes.withhold("shortTermDebt", ctx, scopeReason, "debt-maturity-scope");
    notes.add(`shortTermDebt ${ctx}: ${scopeReason}`);
  } else if (maturitiesStand) {
    notes.add(
      `shortTermDebt ${ctx}: current maturities taken from the debt maturity schedule (${MATURITIES_NEXT_YEAR_TAG} ${maturities}) — no balance-sheet current-maturities tag was filed for the period; the figure is CURRENT MATURITIES ONLY (any short-term borrowings and commercial paper the filer tagged are added beside it) and, being a note disclosure rather than a balance-sheet line, is often filed annually only, so quarterly rows can lack it`,
    );
  } else if (maturities !== null) {
    const currentMaturityTagResolved = CURRENT_MATURITY_TAGS.some((tag) => shortTermTags.includes(tag));
    notes.add(
      currentMaturityTagResolved
        ? `shortTermDebt ${ctx}: ${MATURITIES_NEXT_YEAR_TAG} excluded — the balance sheet's own current-debt tag resolved for this period and already carries the current maturities`
        : `shortTermDebt ${ctx}: the debt maturity schedule reports ${maturities} of long-term debt due within a year (${MATURITIES_NEXT_YEAR_TAG}) and it did NOT enter the sum — it could not be combined with the tags that did resolve (${shortTermTags.length === 0 ? "none" : shortTermTags.join(" + ")}), which happens when the schedule is filed in another currency, so short-term debt here may exclude the current maturities of long-term debt`,
    );
  }

  const longTermTags = tagsOf("longTermDebt");
  // The inclusive LongTermDebt total, when it is all of the period's financing
  /* D-100: Compose debt from compatible filed components without counting an inclusive amount twice. */
  let inclusiveDebt: number | undefined;
  // Case 2.
  if (longTermTags.includes("LongTermDebt") && v.longTermDebt != null) {
    const current = cc.money("LongTermDebtCurrent") ?? (maturitiesStand && scopeReason === null ? maturities : null);
    if (scopeReason !== null && current === null) {
      const reason = "noncurrent carrying debt allocation unavailable: LongTermDebt includes current maturities, but the fiscal maturity bucket was rejected as current carrying debt";
      // The refused bucket was the only current component, so LongTermDebt
      // alone is the total: the split is withheld, the total is not.
      if (longTermTags.length === 1 && shortTermTags.length === 1 && maturitiesStand) {
        inclusiveDebt = v.longTermDebt;
        notes.add(`totalDebt ${ctx}: financing debt is the LongTermDebt total (${v.longTermDebt}), which includes current maturities; only its current/noncurrent split is withheld`);
      }
      v.longTermDebt = null;
      notes.withhold("longTermDebt", ctx, reason, "debt-noncurrent-allocation");
      notes.add(`longTermDebt ${ctx}: ${reason}`);
    } else if (current !== null) {
      v.longTermDebt = tidy(v.longTermDebt - current, MONEY_DECIMALS);
      notes.add(
        `longTermDebt ${ctx}: LongTermDebt less current maturities (${cc.money("LongTermDebtCurrent") !== null ? "LongTermDebtCurrent" : MATURITIES_NEXT_YEAR_TAG} ${current})`,
      );
    } else {
      notes.add(
        `longTermDebt ${ctx}: resolved from the LongTermDebt total and no LongTermDebtCurrent fact was filed, so current maturities may be included`,
      );
    }
  }

  // The balance sheet's current-maturities line, against which an inclusive
  /* D-100: Compose debt from compatible filed components without counting an inclusive amount twice. */
  const currentMaturityLine = shortTermTags.find((tag) => CURRENT_MATURITY_TAGS.includes(tag) || (tag === MATURITIES_NEXT_YEAR_TAG && scopeReason === null));
  // Case 7: noncurrent notes and loans with their current portion. Beside a
  // current-maturities line the current portion is already in short-term debt.
  const notesCurrent = NOTES_AND_LOANS_CURRENT_TAGS.find((tag) => longTermTags.includes(tag));
  const notesNoncurrent = cc.fact?.(tagsFor("longTermNotesAndLoans")[0]!) ?? null;
  if (notesCurrent !== undefined && currentMaturityLine !== undefined && notesNoncurrent !== null && v.longTermDebt != null) {
    v.longTermDebt = tidy(notesNoncurrent.value, MONEY_DECIMALS);
    cc.replace?.("longTermDebt", notesNoncurrent);
    notes.add(`longTermDebt ${ctx}: ${notesCurrent} excluded — the current notes and loans are carried by ${currentMaturityLine}, which resolved for this period`);
  }

  // Case 2 for the inclusive long-term total, which holds current maturities
  // and current finance leases.
  if (longTermTags.includes(INCLUSIVE_LONG_TERM_TAG) && v.longTermDebt != null) {
    const combined = shortTermTags.includes(COMBINED_CURRENT_TAG) ? cc.money(COMBINED_CURRENT_TAG) : null;
    const maturitiesCurrent = cc.money("LongTermDebtCurrent");
    const [netTag, net] = currentMaturityLine === undefined ? [null, null]
      : combined !== null ? [COMBINED_CURRENT_TAG, combined]
      : maturitiesCurrent !== null && currentMaturityLine !== MATURITIES_NEXT_YEAR_TAG ? ["LongTermDebtCurrent", maturitiesCurrent]
      : [null, null];
    if (currentMaturityLine === undefined) {
      notes.add(`longTermDebt ${ctx}: ${INCLUSIVE_LONG_TERM_TAG} includes current maturities and finance leases; no current-maturities line resolved, so they are counted once, here`);
    } else if (net !== null) {
      v.longTermDebt = tidy(v.longTermDebt - net, MONEY_DECIMALS);
      notes.add(`longTermDebt ${ctx}: ${INCLUSIVE_LONG_TERM_TAG} less the current maturities ${currentMaturityLine} carries (${netTag} ${net})`);
    } else {
      const reason = `noncurrent carrying debt allocation unavailable: ${INCLUSIVE_LONG_TERM_TAG} includes current maturities, which ${currentMaturityLine} also carries, and no current-maturities fact separates them`;
      v.longTermDebt = null;
      notes.withhold("longTermDebt", ctx, reason, "debt-noncurrent-allocation");
      notes.add(`longTermDebt ${ctx}: ${reason}`);
    }
  }

  // Case 6: debt composed from instrument-class tags (no aggregate tagged).
  // An inclusive class total already holds its current portion, so beside a
  // current-debt line it may count that portion twice; a generic notes total
  // may already hold the convertible notes. Neither overlap can be resolved
  // from the tags, so the figure is withheld rather than doubled.
  const composedFrom = (item: Parameters<typeof tagsFor>[0]): boolean => tagsFor(item).some((tag) => longTermTags.includes(tag));
  const composed = v.longTermDebt != null && ![...tagsFor("longTermDebt"), ...tagsFor("longTermNotesAndLoans")].some((tag) => longTermTags.includes(tag));
  if (composed) {
    const currentLine = tagsOf("shortTermDebt").find((tag) => CURRENT_MATURITY_TAGS.includes(tag) || tag === MATURITIES_NEXT_YEAR_TAG);
    const inclusive = longTermTags.filter((tag) => INCLUSIVE_DEBT_COMPONENT_TAGS.has(tag));
    const currentClass = longTermTags.filter((tag) => CURRENT_DEBT_COMPONENT_TAGS.has(tag));
    // A current-debt figure of zero holds nothing that could be counted twice.
    const currentDebt = v.shortTermDebt != null && v.shortTermDebt !== 0;
    const reason = composedFrom("debtCombinedTotal") && currentDebt
      ? "financing debt unresolved: DebtLongtermAndShorttermCombinedAmount is all debt, current included, and a current-debt figure also resolved"
      : currentClass.length > 0 && currentDebt
        ? `financing debt unresolved: ${currentClass.join(" + ")} carry current debt that the current-debt figure (${tagsOf("shortTermDebt").join(" + ")}) may also carry`
      : currentLine !== undefined && inclusive.length > 0 && currentDebt
        ? `financing debt unresolved: ${inclusive.join(" + ")} include their current portions, which ${currentLine} also carries`
        : composedFrom("longTermDebtNotes") && composedFrom("longTermDebtConvertible")
          ? "financing debt unresolved: a notes total and a convertible-notes total are both tagged, and the notes total may already include the convertible notes"
          : duplicateDebtClasses(cc.resolved.get("longTermDebt")?.parts ?? {});
    if (reason !== null) {
      v.longTermDebt = null;
      notes.withhold("longTermDebt", ctx, reason);
      notes.add(`longTermDebt ${ctx}: ${reason}`);
    }
  }

  // Case 8: the inclusive long-term total, filed beside a composition from
  // other tags, is the filer's own reconciliation of long-term debt. A
  // current-debt line can carry debt the filer reclassified to long-term, so a
  // composition that misses it by more than 1% is recomposed from the
  /* D-100: Compose debt from compatible filed components without counting an inclusive amount twice. */
  const inclusiveTotal = longTermTags.includes(INCLUSIVE_LONG_TERM_TAG) ? null : cc.fact?.(INCLUSIVE_LONG_TERM_TAG) ?? null;
  if (inclusiveTotal !== null && (v.shortTermDebt != null || v.longTermDebt != null)) {
    const borrowingsTag = ["ShortTermBorrowings", "CommercialPaper"].find((tag) => cc.money(tag) !== null);
    const borrowings = borrowingsTag === undefined ? null : cc.fact?.(borrowingsTag) ?? null;
    const finance = longTermDebtHoldsFinanceLeases(longTermTags.map((tag) => `us-gaap/${tag}`)) ? 0
      : cc.resolved.get("capitalLeaseObligations")?.parts?.["financeLeaseLiability"] ?? 0;
    const composedDebt = (v.shortTermDebt ?? 0) + (v.longTermDebt ?? 0) + finance;
    const expected = inclusiveTotal.value + (borrowings?.value ?? 0);
    if (Math.abs(composedDebt - expected) > Math.max(1, expected * 0.01)) {
      if (borrowings !== null) {
        v.longTermDebt = tidy(inclusiveTotal.value, MONEY_DECIMALS);
        v.shortTermDebt = tidy(borrowings.value, MONEY_DECIMALS);
        cc.replace?.("longTermDebt", inclusiveTotal);
        cc.replace?.("shortTermDebt", borrowings);
        notes.add(
          `totalDebt ${ctx}: financing debt recomposed as ${borrowingsTag} ${borrowings.value} + ${INCLUSIVE_LONG_TERM_TAG} ${inclusiveTotal.value}; ` +
            `the composition from ${[...shortTermTags, ...longTermTags].join(" + ")} (${composedDebt}) differs from the filer's inclusive long-term total, so current debt reclassified to long-term would be counted twice`,
        );
      } else if (composedDebt > expected) {
        const reason = `financing debt unresolved: the composed current and long-term debt (${composedDebt}) exceeds the filer's ${INCLUSIVE_LONG_TERM_TAG} ${inclusiveTotal.value} and no short-term borrowings are tagged to reconcile them, so current debt reclassified to long-term may be counted twice`;
        v.longTermDebt = null;
        notes.withhold("longTermDebt", ctx, reason);
        notes.add(`longTermDebt ${ctx}: ${reason}`);
      }
    }
  }

  // Case 1. `capitalLeaseObligations` itself keeps the full lease figure — that
  // is what FMP publishes — and the exclusion is applied only to the sum.
  const leases = cc.resolved.get("capitalLeaseObligations");
  const full = v.capitalLeaseObligations ?? null;
  const leaseHolder = tagsOf("longTermDebt").find((tag) => tag === "LongTermDebtAndCapitalLeaseObligations" || tag === INCLUSIVE_LONG_TERM_TAG);
  if (leaseHolder !== undefined && leases?.parts !== undefined) {
    const finance = leases.parts["financeLeaseLiability"];
    if (finance !== undefined) {
      notes.add(
        `totalDebt ${ctx}: longTermDebt resolved from ${leaseHolder}, which already includes finance lease obligations, so only the operating-lease liability is added here; capitalLeaseObligations still reports the full ${full ?? "null"}`,
      );
      return {
        label: "capitalLeaseObligations (operating leases only)",
        value: leases.parts["operatingLeaseLiability"] ?? null,
      };
    }
  }
  // Case 4b: the combined current tag stands in `shortTermDebt` and carries the
  // current finance leases, which `capitalLeaseObligations` also holds. (When
  // case 1 fired above, the finance leases sit in the two debt tags exactly
  // once and nothing is netted.)
  if (combinedCurrentStands && full !== null) {
    const financeCurrent = cc.money("FinanceLeaseLiabilityCurrent");
    if (financeCurrent !== null) {
      notes.add(
        `totalDebt ${ctx}: shortTermDebt includes ${COMBINED_CURRENT_TAG}, whose finance-lease slice (FinanceLeaseLiabilityCurrent ${financeCurrent}) is also inside capitalLeaseObligations, so it is netted out of the lease component here; capitalLeaseObligations still reports the full ${full}`,
      );
      return {
        label: "capitalLeaseObligations (less the finance-lease current portion already in shortTermDebt)",
        value: tidy(full - financeCurrent, MONEY_DECIMALS),
      };
    }
    notes.add(
      `totalDebt ${ctx}: shortTermDebt includes ${COMBINED_CURRENT_TAG} and no FinanceLeaseLiabilityCurrent fact was filed, so its finance-lease slice may be counted twice`,
    );
  }
  return { label: "capitalLeaseObligations", value: full, ...(inclusiveDebt === undefined ? {} : { inclusiveDebt }) };
}

function computeCashflow(v: FieldValues): void {
  v.freeCashFlow ??= add(v.operatingCashFlow ?? null, v.capitalExpenditure ?? null);
}
export { labelCopiesOf, sameFilingVerdict, type FieldValues, type ComputeContext, computeIncome, computeBalance, computeCashflow };
