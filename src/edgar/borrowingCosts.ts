import { CORE_FACT_FORMS, parseFactPoints, type CompanyFacts, type FactPoint } from "@/edgar/xbrl";
import { INTEREST_EXPENSE_TAGS } from "@/edgar/tagSynonyms";
import type { StatementFieldProvenance } from "@/providers/fmp";

const INCURRED = "InterestCostsIncurred";
const INVENTORY = "RealEstateInventoryCapitalizedInterestCosts";
const RELEASE = "RealEstateInventoryCapitalizedInterestCostsCostOfSales1";
const DAY = 86_400_000;
const validDay = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const sameAmount = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 1e-10);
const sameFiling = (a: FactPoint, b: FactPoint): boolean => a.accn === b.accn && a.filed === b.filed && a.form === b.form;
const previousDay = (day: string): string => new Date(Date.parse(day) - DAY).toISOString().slice(0, 10);

function points(facts: CompanyFacts, tag: string, unit: string, observedAt: string): FactPoint[] {
  const cutoff = observedAt.slice(0, 10);
  if (!validDay(cutoff) || !/^[A-Z]{3}$/.test(unit)) return [];
  const concept = facts.facts["us-gaap"]?.[tag] as { units?: Record<string, unknown[]> } | undefined;
  return parseFactPoints(concept?.units?.[unit] ?? []).filter(p => CORE_FACT_FORMS.has(p.form) &&
    validDay(p.end) && p.end <= cutoff && validDay(p.filed) && p.filed <= cutoff && p.filed >= p.end &&
    (p.start === undefined || validDay(p.start) && p.start <= p.end) && Number.isFinite(p.val));
}
/** Pick the latest filed copy before checking its value; a refusal never exposes an older copy. */
function uniqueLatest(ps: FactPoint[]): FactPoint | null {
  const sorted = [...ps].sort((a, b) => b.filed.localeCompare(a.filed) || b.accn.localeCompare(a.accn));
  const p = sorted[0];
  return p && sorted.filter(q => q.filed === p.filed).every(q => q.val === p.val && q.start === p.start) ? p : null;
}
function evidence(p: FactPoint, unit: string, observedAt: string, tags: string[]): StatementFieldProvenance {
  return { source: "edgar", unit, periodStart: p.start ?? null, periodEnd: p.end, observedAt,
    tags: tags.map(t => `us-gaap/${t}`), filings: [{ accn: p.accn, filed: p.filed, form: p.form }] };
}

export interface FiledBorrowingCost {
  amount: number;
  basis: string;
  evidence: StatementFieldProvenance;
}
export interface BorrowingCostEvidenceInput { facts: CompanyFacts | null; observedAt: string }

/**
 * A current financing cost, including capitalized interest, is a debt-rate
 * numerator only. It is never an expense, an EBIT add-back or an ICR operand.
 * Both retained debt balances must equal same-filing, same-unit borrowing
 * totals. Neither a missing opening balance nor a partial debt tag stands in.
 */
export function filedAnnualBorrowingCost(input: BorrowingCostEvidenceInput & {
  fiscalYearEnd: string; openingDate: string; unit: string; closingDebt: number; openingDebt: number;
}): FiledBorrowingCost | null {
  const { facts, fiscalYearEnd: end, openingDate, unit, observedAt } = input;
  if (!facts || !validDay(end) || !validDay(openingDate) || input.openingDebt <= 0 || input.closingDebt <= 0) return null;
  const start = new Date(Date.parse(openingDate) + DAY).toISOString().slice(0, 10);
  const span = (Date.parse(end) - Date.parse(start)) / DAY;
  if (span < 350 || span > 380) return null;
  // A newer core filing can revise an annual-duration fact. Select that copy
  // before applying the annual-source requirement; refusing it must not
  // revive an older 10-K value and its previously matching debt balances.
  const cost = uniqueLatest(points(facts, INCURRED, unit, observedAt).filter(p => p.start === start && p.end === end));
  if (!cost || cost.val <= 0 || !/^(?:10-K|20-F|40-F)(?:\/A)?$/.test(cost.form)) return null;
  // These are borrowing totals, not long-term/current subtypes or principal.
  // Equality to BOTH already admitted balances keeps the financing perimeter
  // fixed, including the retained operating-lease convention.
  const debtTags = ["DebtLongtermAndShorttermCombinedAmount", "NotesPayable"];
  if (debtTags.some(tag => {
    const ps = points(facts, tag, unit, observedAt).filter(p => p.start === undefined && sameFiling(cost, p));
    return [[openingDate, input.openingDebt], [end, input.closingDebt]].some(([date, expected]) => {
      const dated = ps.filter(p => p.end === date);
      const p = uniqueLatest(dated);
      return dated.length > 0 && (!p || !sameAmount(p.val, Number(expected)));
    });
  })) return null;
  const matched = debtTags.find(tag => {
    const ps = points(facts, tag, unit, observedAt).filter(p => p.start === undefined && sameFiling(cost, p));
    const opening = uniqueLatest(ps.filter(p => p.end === openingDate));
    const closing = uniqueLatest(ps.filter(p => p.end === end));
    return opening && closing && sameAmount(opening.val, input.openingDebt) && sameAmount(closing.val, input.closingDebt);
  });
  if (!matched) return null;
  return { amount: cost.val,
    basis: `filed interest costs incurred, including capitalized interest, for ${start} to ${end} (${INCURRED}; ${cost.form} ${cost.accn}, filed ${cost.filed}); both debt balances agree with same-filing ${matched}. This is a borrowing-cost basis only, not income-statement interest expense or interest coverage`,
    evidence: evidence(cost, unit, observedAt, [INCURRED, matched]) };
}

/**
 * Refuse a vendor expense that instead matches the incurred cost or inventory
 * release in a complete filed capitalized-interest rollforward. Arithmetic
 * does not create a zero expense: it identifies an ambiguous classification.
 * A matching direct expense fact wins; absent evidence leaves the vendor alone.
 */
export function capitalizedInterestMisclassification(facts: CompanyFacts, input: {
  end: string; periodStart?: string; unit: string; value: number; frequency: "annual" | "quarter"; observedAt: string;
}): { reason: string; evidence: StatementFieldProvenance } | null {
  if (!Number.isFinite(input.value) || input.value <= 0 || !validDay(input.end)) return null;
  const costs = points(facts, INCURRED, input.unit, input.observedAt).filter(p => {
    if (!p.start || p.end !== input.end || input.periodStart && p.start !== input.periodStart) return false;
    const span = (Date.parse(p.end) - Date.parse(p.start)) / DAY;
    return input.frequency === "annual" ? span >= 350 && span <= 380 : span >= 70 && span <= 125;
  });
  const cost = uniqueLatest(costs);
  if (!cost?.start || cost.val <= 0) return null;
  // Distinct direct-expense concepts can legitimately differ. Follow the same
  // ordered concept policy as statement extraction, then resolve filed copies
  // within that concept. Conflicting preferred copies must not expose a less
  // preferred concept just because its amount happens to match the provider.
  const directCopies = INTEREST_EXPENSE_TAGS.map(tag => points(facts, tag, input.unit, input.observedAt)
    .filter(p => p.start === cost.start && p.end === cost.end && p.filed >= cost.filed)).find(ps => ps.length > 0);
  const direct = uniqueLatest(directCopies ?? []);
  if (direct && sameAmount(direct.val, input.value)) return null;
  const balances = points(facts, INVENTORY, input.unit, input.observedAt).filter(p => p.start === undefined && sameFiling(cost, p));
  const opening = uniqueLatest(balances.filter(p => p.end === previousDay(cost.start!)));
  const closing = uniqueLatest(balances.filter(p => p.end === cost.end));
  const released = uniqueLatest(points(facts, RELEASE, input.unit, input.observedAt)
    .filter(p => p.start === cost.start && p.end === cost.end && sameFiling(cost, p)));
  if (!opening || !closing || !released || [opening.val, closing.val, released.val].some(v => v < 0) ||
      !sameAmount(opening.val + cost.val - released.val, closing.val)) return null;
  const matched = sameAmount(input.value, cost.val) ? INCURRED : sameAmount(input.value, released.val) ? RELEASE : null;
  if (!matched) return null;
  const proof = evidence(cost, input.unit, input.observedAt, [INCURRED, INVENTORY, RELEASE]);
  return { evidence: proof,
    reason: `Interest expense withheld for ${cost.start} to ${cost.end}: provider ${input.value} ${input.unit} matches ${matched} in the filed capitalized-interest rollforward (${cost.accn}), not a corroborated income-statement interest expense. Incurred borrowing costs and previously capitalized interest released to cost of sales cannot be mixed into interest coverage. The reported operating income is unchanged.` };
}
