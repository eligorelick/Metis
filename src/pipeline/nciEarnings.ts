import type { DataBundle } from "./types";
import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import { conceptFactsSchema, CORE_FACT_FORMS, parseFactPoints } from "@/edgar/xbrl";
import type { ValuationBundleInputs } from "./stageB/valuation";

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
