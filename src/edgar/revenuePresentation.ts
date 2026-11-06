import { vendorAgreesWithFiled } from "./vendorAgreement";
import { BROAD_REVENUE_TOTAL_TAGS, COSTS_AND_EXPENSES_TAG, CONTRACT_REVENUE_TAGS, GROSS_PROFIT_COST_TAGS, NET_INTEREST_NONOPERATING_TAG, REVENUE_COMPONENT_TAGS, REVENUE_TAGS, tagsFor } from "./tagSynonyms";
import type { FiledIncomeLine, StatementFieldProvenance } from "@/providers/fmp";

export function sameIncomeScope(a: StatementFieldProvenance | undefined, b: StatementFieldProvenance | undefined): boolean {
  const filings = (p: StatementFieldProvenance) => p.filings.map(f => `${f.accn}|${f.filed}|${f.form}`).sort().join(",");
  return !!a && !!b && a.unit === b.unit && a.periodStart !== null && a.periodStart === b.periodStart && a.periodEnd === b.periodEnd &&
    a.filings.length > 0 && filings(a) === filings(b);
}

/** Disjoint operating components plus an independent, complete pretax bridge.
 * Alternative names are aliases, never additive costs; an aggregate excludes
 * its children. No provider value participates in this proof. */
export type OperatingBridgeProof = { status: "complete"; line: FiledIncomeLine } | { status: "unavailable" } | { status: "conflict"; reason: string };
export function operatingBridgeProof(revenue: FiledIncomeLine, pretax: FiledIncomeLine,
  lines: Readonly<Record<string, FiledIncomeLine>>): OperatingBridgeProof {
  if (!sameIncomeScope(revenue.proof, pretax.proof)) return { status: "unavailable" };
  const same = (a: number, b: number) => Math.abs(a - b) <= 1;
  type Selection = { status: "absent" } | { status: "conflict"; tags: string[] } | { status: "available"; line: FiledIncomeLine };
  const pick = (tags: string[]): Selection => {
    const found = tags.flatMap(t => lines[t] && sameIncomeScope(revenue.proof, lines[t]!.proof) ? [lines[t]!] : []);
    if (!found.length) return { status: "absent" };
    return found.every(l => same(l.value, found[0]!.value)) ? { status: "available", line: found[0]! }
      : { status: "conflict", tags: found.flatMap(line => line.proof.tags) };
  };
  const value = (selection: Selection) => selection.status === "available" ? selection.line : null;
  const conflicts = (selections: Selection[]): OperatingBridgeProof | null => {
    const conflict = selections.find(s => s.status === "conflict");
    return conflict?.status === "conflict" ? { status: "conflict", reason:
      `Complete operating reconciliation refused: conflicting same-scope filed aliases (${conflict.tags.join(", ")}) cannot be treated as absent or zero.` } : null;
  };
  const totalPick = pick(["OperatingExpenses"]), costPick = pick(["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold"]);
  const grossPick = pick(["GrossProfit"]), sgaPick = pick(["SellingGeneralAndAdministrativeExpense"]), researchPick = pick(["ResearchAndDevelopmentExpense"]);
  const total = value(totalPick), cost = value(costPick), gross = value(grossPick), sga = value(sgaPick), research = value(researchPick);
  // A full operating aggregate owns its children. Without that independent
  // aggregate, a conflicting component cannot disappear into an alternate GP path.
  const operatingConflict = conflicts(total ? [totalPick] : [totalPick, costPick, grossPick, sgaPick, researchPick]);
  if (operatingConflict) return operatingConflict;
  const operands = total ? [total] : cost && sga ? [cost, sga, ...(research ? [research] : [])] :
    gross && sga ? [sga, ...(research ? [research] : [])] : null;
  if (!operands) return { status: "unavailable" };
  const operating = (total || cost ? revenue.value : gross!.value) - operands.reduce((sum, p) => sum + p.value, 0);
  if (gross && cost && !same(revenue.value - cost.value, gross.value)) return { status: "conflict", reason: "Complete operating reconciliation refused: same-scope gross profit and full cost have a conflict." };
  const aggregatePick = pick(["NonoperatingIncomeExpense"]), interestPick = pick(["InterestExpense", "InterestAndDebtExpense", "InterestExpenseNonoperating"]);
  const benefitPick = pick(["NetPeriodicDefinedBenefitsExpenseReversalOfExpenseExcludingServiceCostComponent"]), otherPick = pick(["OtherNonoperatingIncomeExpense"]);
  const interestIncomePick = pick(["InvestmentIncomeInterest"]), netInterestPick = pick([NET_INTEREST_NONOPERATING_TAG]);
  const aggregate = value(aggregatePick), interest = value(interestPick), benefit = value(benefitPick), other = value(otherPick);
  const interestIncome = value(interestIncomePick), netInterest = value(netInterestPick);
  const nonoperatingConflict = conflicts(aggregate ? [aggregatePick] : [aggregatePick, netInterestPick, benefitPick, otherPick,
    ...(netInterest ? [] : [interestPick, interestIncomePick])]);
  if (nonoperatingConflict) return nonoperatingConflict;
  // A filed nonoperating aggregate is used once. Its child interest/other
  // amounts cannot be added again. Without it, every recognized role is explicit.
  const nonoperating = aggregate ? aggregate.value :
    (other?.value ?? 0) + (netInterest?.value ?? ((interestIncome?.value ?? 0) - (interest?.value ?? 0))) - (benefit?.value ?? 0);
  const costsPick = pick(["CostsAndExpenses", "BenefitsLossesAndExpenses"]), costsConflict = conflicts([costsPick]);
  if (costsConflict) return costsConflict;
  if (!aggregate && !netInterest && !interest && !other && !interestIncome) return { status: "unavailable" };
  if (!same(operating + nonoperating, pretax.value)) return { status: "unavailable" };
  const costs = value(costsPick);
  if (costs && !same(costs.value, revenue.value - pretax.value)) return { status: "unavailable" };
  const used = [revenue, pretax, ...operands, ...(gross && !total && !cost ? [gross] : []),
    ...(aggregate ? [aggregate] : [...(netInterest ? [netInterest] : [interest,interestIncome]), benefit, other].filter((l): l is FiledIncomeLine => l !== null))];
  return { status: "complete", line: { value: operating, proof: { ...revenue.proof, tags: [...new Set(used.flatMap(l => l.proof.tags))],
    calculation: "complete-operating-reconciliation" } } };
}

export function completeOperatingBridge(revenue: FiledIncomeLine, pretax: FiledIncomeLine,
  lines: Readonly<Record<string, FiledIncomeLine>>): FiledIncomeLine | null {
  const result = operatingBridgeProof(revenue, pretax, lines);
  return result.status === "complete" ? result.line : null;
}

export function filedRevenueLines(lines: Readonly<Record<string, FiledIncomeLine>>): FiledIncomeLine[] {
  const direct = [...Object.values(lines).filter(l => l.role === "operating-sales"), ...BROAD_REVENUE_TOTAL_TAGS.flatMap(tag => lines[tag] ? [lines[tag]!] : [])];
  const parts = REVENUE_COMPONENT_TAGS.map(tag => lines[tag]);
  if (parts.every((p): p is FiledIncomeLine => p !== undefined) && sameIncomeScope(parts[0]!.proof, parts[1]!.proof)) {
    direct.push({ value: parts.reduce((sum, p) => sum + p.value, 0),
      proof: { ...parts[0]!.proof, tags: parts.flatMap(p => p.proof.tags) } });
  }
  direct.push(...REVENUE_TAGS.filter(tag => !BROAD_REVENUE_TOTAL_TAGS.some(total => total === tag)).flatMap(tag => lines[tag] ? [lines[tag]!] : []));
  return direct;
}

export function hasGrossRevenueBridge(candidate: FiledIncomeLine, lines: Readonly<Record<string, FiledIncomeLine>>): boolean {
  return tagsFor("grossProfit").some(tag=>{
    const gross=lines[tag];
    return gross&&sameIncomeScope(candidate.proof,gross.proof)&&GROSS_PROFIT_COST_TAGS.some(costTag=>{
      const cost=lines[costTag];
      return cost&&sameIncomeScope(candidate.proof,cost.proof)&&Math.abs(candidate.value-gross.value-cost.value)<=1;
    });
  });
}

export function hasOperatingRevenueBridge(candidate: FiledIncomeLine, lines: Readonly<Record<string, FiledIncomeLine>>): boolean {
  const cost = lines[COSTS_AND_EXPENSES_TAG];
  const operating = tagsFor("operatingIncome").map(tag=>lines[tag]).find(l=>l&&sameIncomeScope(candidate.proof,l.proof));
  return !!cost && !!operating && sameIncomeScope(candidate.proof,cost.proof) &&
    vendorAgreesWithFiled(candidate.value,cost.value+operating.value);
}

/** A purported total cannot sit below a same-presentation revenue component.
 * Excluding-tax contract revenue is the floor when both tax presentations exist. */
export function completeRevenueLine(candidate: FiledIncomeLine, candidates: readonly FiledIncomeLine[], lines: Readonly<Record<string, FiledIncomeLine>> = {}): boolean {
  const name = (line: FiledIncomeLine) => line.proof.tags.map(t => t.replace(/^us-gaap\//, ""));
  const tags = name(candidate);
  if (!tags.some(t => BROAD_REVENUE_TOTAL_TAGS.some(total => total === t)) && !REVENUE_COMPONENT_TAGS.every(t => tags.includes(t))) return true;
  if (hasOperatingRevenueBridge(candidate,lines)) return true;
  const comparable = candidates.filter(c => sameIncomeScope(candidate.proof, c.proof));
  const hasExcludingTax = comparable.some(c => name(c).includes(CONTRACT_REVENUE_TAGS[0]!));
  return !comparable.some(c => {
    const other = name(c);
    const floor = other.some(t => t === "SalesRevenueNet" || CONTRACT_REVENUE_TAGS.includes(t)) || REVENUE_COMPONENT_TAGS.every(t => other.includes(t));
    if (!floor || hasExcludingTax && other.includes(CONTRACT_REVENUE_TAGS[1]!)) return false;
    return c.value > candidate.value && !vendorAgreesWithFiled(c.value, candidate.value);
  });
}

/** One rule for the statement builder and the validation summary. A later
 * contract presentation replaces an old sales line only with its full GP/cost tie-out. */
export function preferredRevenueLine(candidates: readonly FiledIncomeLine[], lines: Readonly<Record<string, FiledIncomeLine>>): FiledIncomeLine | null {
  const complete = candidates.filter(c => completeRevenueLine(c, candidates, lines));
  const current = complete[0];
  if (!current) return null;
  const oldSales = current.proof.tags.every(t => t === "us-gaap/SalesRevenueNet" || REVENUE_COMPONENT_TAGS.some(part => t === `us-gaap/${part}`));
  if (!oldSales) return current;
  const filed = Math.max(...current.proof.filings.map(f => Date.parse(f.filed)));
  return complete.find(c => c.proof.tags.some(t => CONTRACT_REVENUE_TAGS.some(tag => t === `us-gaap/${tag}`)) &&
    c.proof.filings.some(f => Date.parse(f.filed) > filed) && hasGrossRevenueBridge(c,lines)) ?? current;
}
