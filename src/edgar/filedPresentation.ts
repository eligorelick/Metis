import { conceptFactsSchema, parseFactPoints, type CompanyFacts } from "@/edgar/xbrl";

/** Restrict every field to one explicitly identified filed presentation. */
export function factsForFilings(facts: CompanyFacts, accessions: readonly string[]): CompanyFacts {
  const allowed = new Set(accessions);
  return { ...facts, facts: Object.fromEntries(Object.entries(facts.facts).map(([namespace, concepts]) => [namespace,
    Object.fromEntries(Object.entries(concepts ?? {}).flatMap(([tag, raw]) => {
      const parsed = conceptFactsSchema.safeParse(raw);
      if (!parsed.success) return [];
      return [[tag, { ...parsed.data, units: Object.fromEntries(Object.entries(parsed.data.units).map(([unit, points]) =>
        [unit, parseFactPoints(points).filter(p => allowed.has(p.accn))])) }]];
    }))])) };
}
