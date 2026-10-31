import type { StatementFieldProvenance } from "@/providers/fmp";
import type { ForensicsBalanceRow } from "@/pipeline/stageB/forensics";
import { receivablesCik, receivablesDay, receivablesTimestamp, type FiledReceivablesCandidates, type FiledReceivablesObservation } from "@/edgar/receivables";
import { tagsFor } from "@/edgar/tagSynonyms";
import { CORE_FACT_FORMS } from "@/edgar/xbrl";

type ReceivablesField = "accountsReceivables" | "netReceivables";
interface PairObservation { value: number; end: string; evidence?: StatementFieldProvenance }
export type ReceivablesPair = {
  status: "selected";
  basis: "same-concept" | "vendor-unverified" | "filed-pair";
  field: ReceivablesField;
  concept: string | null;
  current: PairObservation;
  prior: PairObservation;
  notes: string[];
} | { status: "unavailable"; cause: "missing" | "incomparable"; reason: string; notes: string[] };

const fields: ReceivablesField[] = ["accountsReceivables", "netReceivables"];
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const concept = (p: StatementFieldProvenance | undefined): string | null => p?.tags?.length === 1 && p.tags[0] && !p.derivation && !p.calculation ? p.tags[0] : null;
const currency = (row: ForensicsBalanceRow, p: StatementFieldProvenance | undefined): string | null =>
  row.reportedCurrency || (p?.unit && /^[A-Z]{3}$/.test(p.unit) ? p.unit : null);
function contradictsRow(p: StatementFieldProvenance | undefined, row: ForensicsBalanceRow): boolean {
  return p !== undefined && Boolean((p.unit && !/^[A-Z]{3}$/.test(p.unit)) ||
    (p.unit && row.reportedCurrency && p.unit !== row.reportedCurrency) ||
    (p.periodEnd && p.periodEnd !== row.date) || (p.periodStart != null && p.periodStart !== ""));
}
const filingKey = (p: StatementFieldProvenance): string => {
  const f = p.filings[0]!;
  return JSON.stringify([f.accn, f.filed, f.form]);
};
function directEvidence(p: StatementFieldProvenance, row: ForensicsBalanceRow): boolean {
  return p.source === "edgar" && p.periodStart === null && p.periodEnd === row.date &&
    receivablesDay(p.periodEnd) && p.unit === row.reportedCurrency && /^[A-Z]{3}$/.test(p.unit) &&
    !p.derivation && !p.calculation && concept(p) !== null;
}
function candidateValid(o: FiledReceivablesObservation, row: ForensicsBalanceRow): boolean {
  const p = o.evidence;
  return directEvidence(p, row) && finite(o.value) && receivablesCik(o.issuerCik) !== null &&
    receivablesCik(o.issuerCik) === receivablesCik(row.cik) &&
    receivablesTimestamp(p.observedAt) && p.filings.length === 1 &&
    p.filings.every(f => f.accn.trim() !== "" && receivablesDay(f.filed) && CORE_FACT_FORMS.has(f.form) &&
      f.filed >= p.periodEnd && f.filed <= p.observedAt.slice(0, 10));
}


/** Selected primary references constrain a repair even when the separately
 * acquired candidate collection lacks them. Never promote these references to
 * a repair pair: each direct filing reference is only a contradiction guard,
 * and concept/unit/endpoint/issuer eligibility is checked per proposed basis. */
function selectedPrimaryReferences(row: ForensicsBalanceRow): FiledReceivablesObservation[] {
  const references: FiledReceivablesObservation[] = [];
  for (const field of fields) {
    const conflict = row.fieldConflicts?.[field];
    for (const { value, evidence } of [
      { value: row[field], evidence: row.fieldProvenance?.[field] },
      { value: conflict?.secValue, evidence: conflict?.secEvidence },
    ]) {
      if (!finite(value) || !evidence) continue;
      for (const filing of evidence.filings ?? []) {
        const observation = { value, issuerCik: row.cik ?? "", evidence: { ...evidence, filings: [filing] } };
        if (candidateValid(observation, row)) references.push(observation);
      }
    }
  }
  return references;
}

/** Preserve vendor field preference; only a proved discontinuity/conflict may
 * trigger a whole-pair primary repair. QName equality establishes concept
 * continuity, never a guessed trade/total scope label. No statement is edited. */
export function selectReceivablesPair(current: ForensicsBalanceRow | null | undefined, prior: ForensicsBalanceRow | null | undefined,
  options?: { filedCandidates?: FiledReceivablesCandidates }): ReceivablesPair {
  const unavailable = (reason: string, cause: "missing" | "incomparable" = "incomparable"): ReceivablesPair => ({ status: "unavailable", cause, reason, notes: cause === "missing" ? [] : [reason] });
  if (!current || !prior) return unavailable("Receivables comparison unavailable: both aligned balance rows are required.", "missing");
  const field = fields.find(f => finite(current[f]) && finite(prior[f]));
  const conflict = fields.some(f => current.fieldConflicts?.[f]?.usable === false || prior.fieldConflicts?.[f]?.usable === false);
  if (!field && !conflict) return unavailable("accountsReceivables/netReceivables missing — comparable receivables pair unavailable.", "missing");
  const chosen = field ?? "netReceivables";
  const curEvidence = current.fieldProvenance?.[chosen];
  const priEvidence = prior.fieldProvenance?.[chosen];
  const curConcept = concept(curEvidence);
  const priConcept = concept(priEvidence);
  const explicitContradiction = contradictsRow(curEvidence, current) || contradictsRow(priEvidence, prior);
  const curCurrency = currency(current, curEvidence);
  const priCurrency = currency(prior, priEvidence);
  const curContext = { ...current, reportedCurrency: curCurrency };
  const priContext = { ...prior, reportedCurrency: priCurrency };
  const knownIssuerMismatch = receivablesCik(current.cik) && receivablesCik(prior.cik) && receivablesCik(current.cik) !== receivablesCik(prior.cik);
  const knownCurrencyMismatch = curCurrency && priCurrency && curCurrency !== priCurrency;
  const discontinuity = conflict || explicitContradiction || knownIssuerMismatch || knownCurrencyMismatch || (curConcept && priConcept && curConcept !== priConcept);
  if (field && !discontinuity) {
    const verified = curConcept !== null && curConcept === priConcept && curEvidence !== undefined && priEvidence !== undefined &&
      directEvidence(curEvidence, curContext) && directEvidence(priEvidence, priContext);
    return { status: "selected", basis: verified ? "same-concept" : "vendor-unverified", field, concept: verified ? curConcept : null,
      current: { value: current[field]!, end: current.date, ...(curEvidence ? { evidence: curEvidence } : {}) },
      prior: { value: prior[field]!, end: prior.date, ...(priEvidence ? { evidence: priEvidence } : {}) },
      notes: verified ? [] : ["Receivables scope comparability is unverified: the same statement field is retained in both years; the numerical comparison alone does not establish a company-specific accounting explanation."],
    };
  }
  // A repair requires identity and declared currency for BOTH exact balance ends.
  const sameIssuer = receivablesCik(current.cik) !== null && receivablesCik(current.cik) === receivablesCik(prior.cik);
  if (sameIssuer && curCurrency && curCurrency === priCurrency) {
    const observations = options?.filedCandidates?.observations ?? [];
    const selectedCurrent = selectedPrimaryReferences(curContext);
    const selectedPrior = selectedPrimaryReferences(priContext);
    const concepts = [...new Set([curConcept, ...tagsFor("netReceivables").map(tag => `us-gaap/${tag}`)].filter((v): v is string => v !== null))];
    for (const tag of concepts) {
      const cur = observations.filter(o => concept(o.evidence) === tag && candidateValid(o, curContext));
      const pri = observations.filter(o => concept(o.evidence) === tag && candidateValid(o, priContext));
      const currentContradictions = [...cur, ...selectedCurrent.filter(o => concept(o.evidence) === tag)];
      const priorContradictions = [...pri, ...selectedPrior.filter(o => concept(o.evidence) === tag)];
      const pairs = cur.flatMap(c => pri.filter(p => filingKey(c.evidence) === filingKey(p.evidence)).map(p => ({ c, p })))
        .sort((a, b) => b.c.evidence.filings[0]!.filed.localeCompare(a.c.evidence.filings[0]!.filed) || JSON.stringify(a).localeCompare(JSON.stringify(b)));
      for (const { c, p } of pairs) {
        const filed = c.evidence.filings[0]!.filed;
        // Later agreeing copies are harmless; an ambiguous/common or later
        // contradictory/negative copy cannot be discarded to make a ratio work.
        if (c.value < 0 || p.value < 0 || currentContradictions.some(o => o.evidence.filings[0]!.filed >= filed && o.value !== c.value) ||
            priorContradictions.some(o => o.evidence.filings[0]!.filed >= filed && o.value !== p.value)) continue;
        return { status: "selected", basis: "filed-pair", field: chosen, concept: tag,
          current: { value: c.value, end: current.date, evidence: c.evidence }, prior: { value: p.value, end: prior.date, evidence: p.evidence },
          notes: [`Receivables selected-concept discontinuity/conflict repaired for forensic comparisons only using ${tag} for both exact endpoints (${current.date}, ${prior.date}), filing ${c.evidence.filings[0]!.accn}; raw statements are unchanged.`],
        };
      }
    }
  }
  return unavailable(`Receivables concept comparability is not established: selected evidence is discontinuous or conflicting and no complete eligible same-concept filed pair supports both exact endpoints. ${options?.filedCandidates?.reasons.join(" ") ?? ""}`.trim());
}
