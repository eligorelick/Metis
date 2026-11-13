import type { DataBundle } from "./types";
import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import { conceptFactsSchema, CORE_FACT_FORMS, parseFactPoints } from "@/edgar/xbrl";
import type { ValuationBundleInputs } from "./stageB/valuation";
import { filedWindowFlow, type FiledCashFlowTtm } from "@/edgar/financialEnrichment";
import { tagsFor } from "@/edgar/tagSynonyms";
import type { CompanyFacts, FactPoint } from "@/edgar/xbrl";

/** The parent's profit line (us-gaap): net income attributable to the reporting entity. */
const PARENT_PROFIT_TAG = "NetIncomeLoss";
/**
 * Earnings lines that show an allocation to outside owners. The two partial lines are never read as the total
 * (`tagSynonyms.ts`), but either one shows that an allocation exists.
 */
const NCI_EARNINGS_TAGS: readonly string[] = [...tagsFor("netIncomeAttributableToNoncontrollingInterest"),
  "NetIncomeLossAttributableToNonredeemableNoncontrollingInterest", "NetIncomeLossAttributableToRedeemableNoncontrollingInterest"];
const NCI_BALANCE_TAGS: readonly string[] = [...tagsFor("minorityInterest"), ...tagsFor("temporaryEquityAttributableToNoncontrollingInterest")];

/**
 * D-240 (P5, P1): the consolidated profit of one exact trailing window, for an issuer whose filings state a single
 * profit line. Consolidated cash flow is compared with consolidated profit (D-212), and a parent's net income is
 * not that figure merely because a closing noncontrolling balance is zero. It is that figure when the filings that
 * state it show no other. This reads the parent line for the window (`filedWindowFlow`: fiscal year + current year
 * to date - prior-year year to date, or a fact tagged for exactly the window) and then requires, in those same
 * filings, that
 *
 * - every consolidated profit they report equals the parent line they report for the same period;
 * - they report no nonzero earnings attributable to noncontrolling interests;
 * - they report no nonzero noncontrolling balance, permanent or redeemable; and
 * - wherever they tag both total equity and the parent's equity at one date, the two are equal (a filer can tag its
 *   noncontrolling column only as a dimension, which SEC companyfacts does not carry).
 *
 * Anything else returns null and the window stays unestablished. An issuer with an allocation is not decided here:
 * its consolidated and parent profits differ, and which one a figure shows is a definition question.
 */
export function filedSingleProfitWindow(facts: CompanyFacts, unit: string, start: string, end: string, observedAt: string): FiledCashFlowTtm | null {
  const window = filedWindowFlow(facts, PARENT_PROFIT_TAG, unit, start, end, observedAt);
  if (!window) return null;
  const cutoff = observedAt.slice(0, 10);
  const sameFiling = (p: FactPoint) => window.points.some(o => o.accn === p.accn && o.filed === p.filed && o.form === p.form);
  const inFilings = (tag: string): FactPoint[] => {
    const parsed = conceptFactsSchema.safeParse(facts.facts["us-gaap"]?.[tag]);
    return parsed.success ? parseFactPoints(parsed.data.units[unit] ?? []).filter(p => CORE_FACT_FORMS.has(p.form) && p.end <= cutoff && p.filed <= cutoff && sameFiling(p)) : [];
  };
  const parent = inFilings(PARENT_PROFIT_TAG);
  const consolidated = tagsFor("netIncomeConsolidated").flatMap(inFilings);
  if (consolidated.some(c => !parent.some(p => p.accn === c.accn && p.start === c.start && p.end === c.end && p.val === c.val))) return null;
  if ([...NCI_EARNINGS_TAGS, ...NCI_BALANCE_TAGS].flatMap(inFilings).some(p => p.val !== 0)) return null;
  const parentEquity = tagsFor("totalStockholdersEquity").flatMap(inFilings);
  if (tagsFor("totalEquity").flatMap(inFilings).some(total => parentEquity.some(p => p.accn === total.accn && p.end === total.end && p.val !== total.val))) return null;
  return { ...window, reason: `${window.reason} The filings that state ${window.points.length === 1 ? "this figure" : "these figures"} ` +
    `${consolidated.length > 0 ? "state a consolidated profit equal to this net income for every period they report it" : "state no separate consolidated profit"}` +
    ", and no earnings or balance of noncontrolling interests, so this net income is the consolidated profit." };
}

/** A filed IFRS annual key, including consolidated profit less parent profit. */
export function filedAnnualNciEarnings(bundle: DataBundle, currency: string | null): ValuationBundleInputs["staleNoncontrollingEarnings"] {
  const facts = confirmedIssuerFacts(bundle.symbol, bundle.edgar);
  const acquired = bundle.edgar?.companyFacts?.ok ? bundle.edgar.companyFacts.value.fetchedAt : null;
  if (!facts || !currency || !acquired || !Number.isFinite(Date.parse(acquired)) || Date.parse(acquired) > Date.parse(bundle.builtAt)) return null;
  const cutoff = bundle.builtAt.slice(0, 10);
  const points = (tag: string) => {
    const parsed = conceptFactsSchema.safeParse(facts.facts["ifrs-full"]?.[tag]);
    return parsed.success ? parseFactPoints(parsed.data.units[currency] ?? []).filter(p => p.start && CORE_FACT_FORMS.has(p.form) &&
      p.end <= cutoff && p.filed <= cutoff && Number.isFinite(Date.parse(p.filed)) &&
      (Date.parse(p.end) - Date.parse(p.start)) / 86400000 >= 350 && (Date.parse(p.end) - Date.parse(p.start)) / 86400000 <= 380) : [];
  };
  const profits = points("ProfitLoss").sort((a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed) || b.accn.localeCompare(a.accn));
  const parents = points("ProfitLossAttributableToOwnersOfParent"), allocations = points("ProfitLossAttributableToNoncontrollingInterests");
  for (const end of new Set(profits.map(p => p.end))) {
    const profit = profits.find(p => p.end === end)!;
    const same = (p: typeof profit) => p.start === profit.start && p.end === end && p.filed === profit.filed && p.accn === profit.accn && p.form === profit.form;
    if (profits.some(p => p.end === end && p.filed === profit.filed && p.val !== profit.val)) return null;
    const own = parents.filter(same), nci = allocations.filter(same);
    if (own.some(p => p.val !== own[0]!.val) || nci.some(p => p.val !== nci[0]!.val)) return null;
    const derived = own[0] === undefined ? null : profit.val - own[0].val;
    if (nci[0] && derived !== null && Math.abs(nci[0].val - derived) > Math.max(1, Math.abs(profit.val) * 0.0001)) return null;
    const value = nci[0]?.val ?? derived;
    if (value === null) continue;
    return { noncontrollingIncome: value, consolidatedProfit: profit.val, asOf: end, basis: "annual",
      sourceBasis: `Filed IFRS annual NCI allocation ${end}: ${nci[0] ? "ProfitLossAttributableToNoncontrollingInterests" : "consolidated profit less profit attributable to owners of the parent"}; ${profit.accn}, ${profit.filed}; ${value} / ${profit.val} ${currency}` };
  }
  return null;
}
