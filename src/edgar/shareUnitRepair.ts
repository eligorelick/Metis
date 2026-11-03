import type { StatementFieldProvenance } from "@/providers/fmp";
import { conceptFactsSchema, CORE_FACT_FORMS, parseFactPoints, type CompanyFacts } from "./xbrl";

/** Exact filer scaling errors require two independent count corroborations. */
export function filerShareUnitRepair(input: { facts: CompanyFacts; vendor: number; filed: number; proof: StatementFieldProvenance;
  marketShares: number; cutoff: string }): { factor: number; value: number; basis: string } | null {
  const { facts, vendor, filed, proof, marketShares, cutoff } = input;
  if (!(vendor > 0 && filed > 0 && marketShares > 0) || ![vendor, filed, marketShares].every(Number.isFinite) ||
      proof.source !== "edgar" || proof.unit !== "shares" || proof.periodStart === null || !proof.periodEnd ||
      !proof.observedAt || !Number.isFinite(Date.parse(proof.observedAt)) || proof.observedAt.slice(0, 10) > cutoff ||
      proof.filings.length !== 1 || proof.filings[0]!.filed > cutoff || proof.periodEnd > cutoff) return null;
  const agrees = (a: number, b: number, tolerance: number) => Math.abs(a / b - 1) <= tolerance;
  const direct = proof.tags.length === 1 ? proof.tags[0]!.split("/") : [];
  if (direct.length !== 2 || !["WeightedAverageNumberOfSharesOutstandingBasic", "WeightedAverageNumberOfDilutedSharesOutstanding"].includes(direct[1]!)) return null;
  const concept = conceptFactsSchema.safeParse(facts.facts[direct[0]!]?.[direct[1]!]);
  if (!concept.success) return null;
  const points = parseFactPoints(concept.data.units.shares ?? []).filter(p => p.start === proof.periodStart && p.end === proof.periodEnd &&
    CORE_FACT_FORMS.has(p.form) && p.filed <= cutoff);
  const latest = points.map(p => p.filed).sort().at(-1);
  if (!points.some(p => p.val === filed && p.accn === proof.filings[0]!.accn && p.filed === proof.filings[0]!.filed) ||
      points.some(p => p.filed === latest && p.val !== filed)) return null;
  const coverConcept = conceptFactsSchema.safeParse(facts.facts.dei?.EntityCommonStockSharesOutstanding);
  const covers = coverConcept.success ? parseFactPoints(coverConcept.data.units.shares ?? []).filter(p => p.start === undefined &&
    p.val > 0 && CORE_FACT_FORMS.has(p.form) && p.end <= cutoff && p.filed <= cutoff &&
    Math.abs(Date.parse(p.end) - Date.parse(proof.periodEnd!)) / 86400000 <= 100) : [];
  const distance = (end: string) => Math.abs(Date.parse(end) - Date.parse(proof.periodEnd!));
  covers.sort((a, b) => distance(a.end) - distance(b.end) || b.filed.localeCompare(a.filed));
  const cover = covers[0];
  if (!cover || covers.some(p => p.end === cover.end && p.filed === cover.filed && p.val !== cover.val)) return null;
  const factor = [1000, 1000000].find(k => agrees(filed * k, vendor, 0.001) && agrees(filed * k, cover.val, 0.03) && agrees(filed * k, marketShares, 0.03));
  if (factor === undefined) return null;
  return { factor, value: vendor, basis: `Filer share-unit repair: ${proof.periodEnd}, ${proof.filings[0]!.accn}; filed ${filed} shares × ${factor} agrees with provider ${vendor} within 0.1%, independent filed DEI cover ${cover.val} (${cover.end}, ${cover.accn}, within 100 days) and market cap / price ${marketShares} within 3%.` };
}
