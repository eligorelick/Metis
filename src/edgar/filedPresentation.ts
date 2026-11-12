import { memoizeShared } from "@/edgar/computationContext";
import { conceptFactsSchema, parseFactPoints, type CompanyFacts, type FactPoint } from "@/edgar/xbrl";
import type { z } from "zod";

type ConceptFacts = z.infer<typeof conceptFactsSchema>;

/**
 * Restrict every field to one explicitly identified filed presentation.
 *
 * Inside a run's computation context the restricted set is built once per
 * (facts identity, accession set) and the same object is returned, so the
 * statement builder's own cache recognises it (P13). Its only readers are the
 * statement builder, which never writes to its facts input (pinned by
 * tests/computationContext.test.ts with deep-frozen facts). Accession order and
 * duplicates do not change the result (it filters by set membership), so the
 * key is the sorted distinct list.
 */
export function factsForFilings(facts: CompanyFacts, accessions: readonly string[]): CompanyFacts {
  return memoizeShared("factsForFilings", facts, [...new Set(accessions)].sort(), () => factsForFilingsUncached(facts, accessions));
}

function factsForFilingsUncached(facts: CompanyFacts, accessions: readonly string[]): CompanyFacts {
  const allowed = new Set(accessions);
  return { ...facts, facts: Object.fromEntries(Object.entries(facts.facts).map(([namespace, concepts]) => [namespace,
    Object.fromEntries(Object.entries(concepts ?? {}).flatMap(([tag, raw]) => {
      const parsed = parsedConceptPoints(raw);
      if (parsed === null) return [];
      return [[tag, { ...parsed.concept, units: Object.fromEntries(Object.entries(parsed.points).map(([unit, points]) =>
        [unit, points.filter(p => allowed.has(p.accn))])) }]];
    }))])) };
}

/**
 * One raw companyfacts concept validated into its concept fields and per-unit
 * FactPoints (`conceptFactsSchema` then `parseFactPoints`, exactly as callers
 * did inline); null when the concept fails validation. Inside a run's
 * computation context the validation runs once per raw concept object and the
 * parsed value is shared. Its readers only read it: `factsForFilings` copies
 * the concept fields and filters the points into new arrays, and the only
 * consumer of those derived facts, the statement builder, validates them again
 * into fresh objects; the income-classification accession scan reads four
 * fields. Neither writes to it (pinned by tests/computationContext.test.ts with
 * the parsed values deep-frozen through full Stage B and payload runs).
 */
export function parsedConceptPoints(raw: unknown): { concept: ConceptFacts; points: Record<string, FactPoint[]> } | null {
  const parse = () => {
    const parsed = conceptFactsSchema.safeParse(raw);
    if (!parsed.success) return null;
    return { concept: parsed.data, points: Object.fromEntries(Object.entries(parsed.data.units).map(([unit, points]) => [unit, parseFactPoints(points)])) };
  };
  return raw !== null && typeof raw === "object" ? memoizeShared("parsedConceptPoints", raw, null, parse) : parse();
}
