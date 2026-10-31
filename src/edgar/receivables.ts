import type { StatementFieldProvenance } from "@/providers/fmp";
import { tagsFor } from "@/edgar/tagSynonyms";
import { CORE_FACT_FORMS, conceptFactsSchema, parseFactPoints, type CompanyFacts } from "@/edgar/xbrl";

export interface FiledReceivablesObservation {
  value: number;
  issuerCik: string;
  evidence: StatementFieldProvenance;
}
export interface FiledReceivablesCandidates {
  observations: readonly FiledReceivablesObservation[];
  reasons: readonly string[];
}

export function receivablesCik(value: unknown): string | null {
  const text = String(value ?? "");
  return /^\d{1,10}$/.test(text) && Number(text) > 0 ? String(Number(text)) : null;
}
export function receivablesDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function receivablesTimestamp(value: string | null | undefined): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    receivablesDay(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}

/** Pure extraction from issuer-confirmed, already acquired companyfacts. Keep
 * every eligible copy and concept: first-wins statement assembly loses the
 * alternatives and contradictions needed to establish longitudinal continuity. */
export function filedReceivablesCandidates(facts: CompanyFacts | null, options: {
  periods: readonly { end: string; currency: string | null | undefined }[];
  asOf: string;
  observedAt: string | null | undefined;
}): FiledReceivablesCandidates {
  const issuerCik = receivablesCik(facts?.cik);
  const cutoff = Date.parse(options.asOf);
  const observed = options.observedAt ? Date.parse(options.observedAt) : NaN;
  if (!facts || !issuerCik) return { observations: [], reasons: ["Issuer-confirmed receivables facts unavailable."] };
  if (!Number.isFinite(cutoff) || !receivablesTimestamp(options.observedAt) || !Number.isFinite(observed) || observed > cutoff) {
    return { observations: [], reasons: ["Receivables analytical cutoff or actual acquisition timestamp unavailable/ineligible."] };
  }
  const day = new Date(cutoff).toISOString().slice(0, 10);
  const observedDay = new Date(observed).toISOString().slice(0, 10);
  const observations: FiledReceivablesObservation[] = [];
  for (const tag of tagsFor("netReceivables")) {
    const parsed = conceptFactsSchema.safeParse(facts.facts["us-gaap"]?.[tag]);
    if (!parsed.success) continue;
    for (const [unit, raw] of Object.entries(parsed.data.units)) {
      if (!/^[A-Z]{3}$/.test(unit)) continue;
      for (const p of parseFactPoints(raw)) {
        if (!options.periods.some(period => period.end === p.end && period.currency === unit) ||
            p.start !== undefined || !Number.isFinite(p.val) || !CORE_FACT_FORMS.has(p.form) ||
            !p.accn.trim() || !receivablesDay(p.end) || !receivablesDay(p.filed) ||
            p.end > p.filed || p.filed > day || p.end > day || p.filed > observedDay) continue;
        observations.push({ value: p.val, issuerCik, evidence: {
          source: "edgar", unit, periodStart: null, periodEnd: p.end, observedAt: options.observedAt!,
          tags: [`us-gaap/${tag}`], filings: [{ accn: p.accn, filed: p.filed, form: p.form }],
        } });
      }
    }
  }
  observations.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { observations, reasons: observations.length ? [] : ["No filed receivables observations match the exact selected endpoints and declared currencies."] };
}
