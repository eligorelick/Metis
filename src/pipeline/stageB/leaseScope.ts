import { CORE_FACT_FORMS, parseFactPoints, type CompanyFacts } from "@/edgar/xbrl";
import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import type { EdgarBundle } from "@/pipeline/types";
import { establishedIsoCode } from "@/pipeline/estimateCurrency";

export interface LeaseEvidenceContext {
  cutoff?: string | null;
  acquiredAt?: string | null;
}

/** Field observedAt has mixed producer semantics: parser acquisition time,
 * but enrichment's analytical cutoff. Only an actual retained source envelope
 * supplies acquisition time here; never substitute builtAt or a filing date. */
export function leaseEvidenceContextFor(symbol: string, edgar: EdgarBundle, cutoff: string): LeaseEvidenceContext {
  return { cutoff, acquiredAt: confirmedIssuerFacts(symbol, edgar) !== null && edgar.companyFacts.ok ? edgar.companyFacts.value.fetchedAt : null };
}

/** Optional structural view: missing provenance is not invented for old rows. */
export interface LeaseFieldEvidence {
  tags: string[];
  source?: string;
  unit?: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  observedAt?: string;
  filings?: { accn: string; filed?: string; form?: string }[];
  derivation?: string;
  calculation?: string;
}

/** Retained rows can predate the parser's requirement for both lease maturities. */
export interface LeaseScopeRow {
  date?: string | null;
  totalDebt?: number | null;
  shortTermDebt?: number | null;
  longTermDebt?: number | null;
  operatingLeaseLiability?: number | null;
  financeLeaseLiability?: number | null;
  capitalLeaseObligations?: number | null;
  reportedCurrency?: string | null;
  leaseEvidenceContext?: LeaseEvidenceContext;
  fieldConflicts?: Record<string, { usable?: boolean; reason?: string } | undefined>;
  fieldProvenance?: Record<string, LeaseFieldEvidence>;
}

type ComponentCoverage = "unverified" | "current-only" | "noncurrent-only" | "complete";
export interface LeaseEvidenceClassification {
  operating: { coverage: ComponentCoverage; verifiedZero: boolean };
  finance: { coverage: ComponentCoverage; verifiedZero: boolean };
  combined: { coverage: "unverified" | "partial" | "complete"; verifiedZero: boolean };
  observedLeaseLine: "missing" | "zero" | "positive" | "invalid";
}
const validDay = (day: string | null | undefined): day is string => {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const time = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day;
};
const validAmount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const validInstant = (value: string | null | undefined): value is string => !!value &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && validDay(value.slice(0, 10)) && Number.isFinite(Date.parse(value));

/** Descriptions only. Never used for source admission, arithmetic, refusal or grading.
 * One filing identity is required because a tags/filings list cannot map each
 * maturity to a different filing or establish that those filings reconcile. */
export function classifyLeaseEvidence(row: LeaseScopeRow | null | undefined): LeaseEvidenceClassification {
  const identity = (p: LeaseFieldEvidence | undefined): string | null => {
    const cutoff = row?.leaseEvidenceContext?.cutoff, acquiredAt = row?.leaseEvidenceContext?.acquiredAt;
    if (!row || !p || p.source !== "edgar" || !validDay(row.date) || p.periodEnd !== row.date || p.periodStart != null ||
      !row.reportedCurrency || !/^[A-Z]{3}$/.test(row.reportedCurrency) || p.unit !== row.reportedCurrency || p.derivation || p.calculation ||
      !validInstant(cutoff) || !validInstant(acquiredAt) || Date.parse(acquiredAt) > Date.parse(cutoff) ||
      !validInstant(p.observedAt) || Date.parse(p.observedAt) > Date.parse(cutoff) ||
      !p.filings?.length || p.filings.some(f => !f.accn.trim() || !f.form || !CORE_FACT_FORMS.has(f.form) || !validDay(f.filed) || f.filed < row.date! ||
        f.filed > p.observedAt!.slice(0, 10) || f.filed > acquiredAt.slice(0, 10) || f.filed > cutoff.slice(0, 10)) ||
      new Set(p.filings.map(f => `${f.accn}|${f.filed}|${f.form}`)).size !== 1) return null;
    const filing = p.filings[0]!;
    return `${filing.accn}|${filing.filed}|${filing.form}`;
  };
  const component = (field: "operatingLeaseLiability" | "financeLeaseLiability", prefix: "Operating" | "Finance") => {
    const unknown = { coverage: "unverified" as ComponentCoverage, verifiedZero: false, identity: null as string | null };
    const value = row?.[field];
    if (!validAmount(value) || row?.fieldConflicts?.[field]?.usable === false) return unknown;
    const total = `us-gaap/${prefix}LeaseLiability`, current = `${total}Current`, noncurrent = `${total}Noncurrent`;
    const totals = prefix === "Finance" ? [total, "us-gaap/CapitalLeaseObligations"] : [total];
    const own = row?.fieldProvenance?.[field];
    const fallback = row?.fieldConflicts?.capitalLeaseObligations?.usable !== false && value === row?.capitalLeaseObligations ? row?.fieldProvenance?.capitalLeaseObligations : undefined;
    const p = own ?? fallback;
    const lineage = identity(p);
    if (!p || !lineage || p.tags.length === 0 || p.tags.some(t => ![...totals, current, noncurrent].includes(t))) return unknown;
    const uniqueTags = [...new Set(p.tags)];
    if (totals.some(t => p.tags.includes(t)) && uniqueTags.length !== 1) return unknown;
    const coverage: ComponentCoverage = totals.some(t => p.tags.includes(t)) || (p.tags.includes(current) && p.tags.includes(noncurrent)) ? "complete"
      : p.tags.includes(current) ? "current-only" : p.tags.includes(noncurrent) ? "noncurrent-only" : "unverified";
    return { coverage, verifiedZero: coverage === "complete" && value === 0, identity: lineage };
  };
  const operating = component("operatingLeaseLiability", "Operating"), finance = component("financeLeaseLiability", "Finance");
  const combined = row?.capitalLeaseObligations;
  const combinedProvenance = row?.fieldProvenance?.capitalLeaseObligations;
  // An existing provider observation can reconcile independently proven components;
  // if it carries provenance, that provenance must be compatible as well.
  const combinedTags = combinedProvenance?.tags ?? [];
  const family = (prefix: "Operating" | "Finance") => {
    const total = `us-gaap/${prefix}LeaseLiability`;
    const tags = combinedTags.filter(t => t.startsWith(total) || (prefix === "Finance" && t === "us-gaap/CapitalLeaseObligations"));
    const direct = tags.length === 1 && (tags[0] === total || (prefix === "Finance" && tags[0] === "us-gaap/CapitalLeaseObligations"));
    return direct || (tags.length === 2 && tags.includes(`${total}Current`) && tags.includes(`${total}Noncurrent`));
  };
  const knownCombinedTags = combinedTags.every(t => /^(?:us-gaap\/(?:Operating|Finance)LeaseLiability(?:Current|Noncurrent)?|us-gaap\/CapitalLeaseObligations)$/.test(t));
  const compatibleCombined = combinedProvenance === undefined || (identity(combinedProvenance) === operating.identity && knownCombinedTags && family("Operating") && family("Finance"));
  const complete = operating.coverage === "complete" && finance.coverage === "complete" && operating.identity === finance.identity && compatibleCombined &&
    row?.fieldConflicts?.capitalLeaseObligations?.usable !== false && validAmount(combined) &&
    Math.abs(combined - row!.operatingLeaseLiability! - row!.financeLeaseLiability!) <= Math.max(1, Math.abs(combined) * 1e-6);
  const partial = [operating.coverage, finance.coverage].some(c => c === "current-only" || c === "noncurrent-only");
  return { operating: { coverage: operating.coverage, verifiedZero: operating.verifiedZero }, finance: { coverage: finance.coverage, verifiedZero: finance.verifiedZero },
    combined: { coverage: complete ? "complete" : partial ? "partial" : "unverified", verifiedZero: complete && combined === 0 && operating.verifiedZero && finance.verifiedZero },
    observedLeaseLine: combined == null ? "missing" : !validAmount(combined) ? "invalid" : combined === 0 ? "zero" : "positive" };
}

/** Stable IDs retain their numeric meaning; captions make no debt-inclusion attestation. */
export const LEASE_DEBT_LABELS: Readonly<Record<string, string>> = {
  totalDebtIncludingLeases: "Debt used in this report",
  netDebtIncludingLeases: "Net debt on the retained basis",
  netDebtExcludingOperatingLeases: "Net debt on the selected operating-lease basis",
  operatingLeases: "Recorded operating-lease observation",
  financeLeases: "Recorded finance-lease observation",
};

/** The caller supplies the adjustment its existing calculation actually made. */
export function leaseEvidenceNote(row: LeaseScopeRow | null | undefined, action?: { removed: number | null; result?: number | null }): string {
  const e = classifyLeaseEvidence(row);
  // These notes enter trusted prompt text: never interpolate raw provider metadata.
  const displayDate = validDay(row?.date) ? row.date : "Balance date unavailable";
  const currency = establishedIsoCode(row?.reportedCurrency);
  const components = ([ ["Operating", e.operating], ["Finance", e.finance] ] as const).map(([kind, c]) => c.coverage === "complete"
    ? `${kind} lease coverage is complete from compatible filed evidence${c.verifiedZero ? " with an explicit zero liability" : ""}`
    : `${kind} lease coverage is ${c.coverage === "unverified" ? "unverified" : `${c.coverage} (other maturity unverified)`}`).join(". ");
  const observation = e.observedLeaseLine === "zero" ? "The provider records a lease-line observation of zero. "
    : e.observedLeaseLine === "positive" ? "The recorded lease line is a positive observation. " : "No valid combined lease-line observation is available. ";
  const applied = action === undefined ? "" : validAmount(action.removed) && action.removed > 0
    ? ` The existing calculation subtracts the retained operating-lease observation ${action.removed.toLocaleString("en-US", { maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ""}${validAmount(action.result) || (typeof action.result === "number" && Number.isFinite(action.result)) ? `; net debt after adjustment ${action.result!.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : ""}.`
    : " The calculation uses the retained debt basis; no separate operating-lease amount was subtracted.";
  const allUnverified = e.operating.coverage === "unverified" && e.finance.coverage === "unverified" && e.combined.coverage === "unverified";
  const scope = allUnverified ? "Operating, finance and combined lease coverage is unverified."
    : `${components}. Combined lease coverage is ${e.combined.coverage}${e.combined.verifiedZero ? "; both filed components and the compatible combined observation are exactly zero" : ""}.`;
  const debtScope = e.operating.coverage === "complete" || e.finance.coverage === "complete" ? " Debt inclusion is not independently established." : "";
  return `${displayDate}: ${observation}${scope}${debtScope}${applied}`;
}

/** Missing finance maturities cannot leave financing debt. Operating portions
 * can cancel only when the retained total's complete financing components and
 * disclosed operating portion have a common, dated primary-source identity. */
export function leaseDebtScopeRefusal(row: LeaseScopeRow | null | undefined, includeOperatingLeases: boolean): string | null {
  const scope = incompleteLeaseCoverage(row);
  if (!scope || !row) return null;
  if (scope.finance !== null || includeOperatingLeases) return `Debt basis unavailable: ${scope.note}`;
  const op = row.operatingLeaseLiability;
  // A complete finance lease stays in debt on this basis; it must come from the same filing and reconcile too.
  const finance = row.financeLeaseLiability ?? 0;
  const fields = finance === 0 ? ["shortTermDebt", "longTermDebt", "operatingLeaseLiability"] as const
    : ["shortTermDebt", "longTermDebt", "operatingLeaseLiability", "financeLeaseLiability"] as const;
  const provenance = fields.map(field => row.fieldProvenance?.[field] ?? (field === "operatingLeaseLiability" && op === row.capitalLeaseObligations ? row.fieldProvenance?.capitalLeaseObligations : undefined));
  const first = provenance[0];
  const sameSource = first?.source === "edgar" && !!first.unit && first.periodEnd === row.date &&
    first.filings?.some(f => !!f.accn && provenance.every(p => p !== undefined && p.source === first.source && p.unit === first.unit && p.periodEnd === row.date && p.filings?.some(a => a.accn === f.accn)));
  const short = row.shortTermDebt, long = row.longTermDebt, total = row.totalDebt;
  const completeFinancing = provenance[0]?.tags.includes("us-gaap/LongTermDebtCurrent") && provenance[1]?.tags.includes("us-gaap/LongTermDebtNoncurrent");
  if (sameSource && completeFinancing && typeof short === "number" && Number.isFinite(short) && short >= 0 && typeof long === "number" && Number.isFinite(long) && long >= 0 &&
    typeof op === "number" && Number.isFinite(op) && op >= 0 && typeof total === "number" && Number.isFinite(total) &&
    Number.isFinite(finance) && finance >= 0 && Math.abs(total - short - long - op - finance) <= Math.max(1, Math.abs(total) * 1e-9)) return null;
  return `Lease-excluded debt unavailable: same-period primary financing components do not prove cancellation of the embedded operating-lease portion. ${scope.note}`;
}

/** Caller supplies issuer-confirmed facts. Restore only omitted provenance for
 * an unchanged financing component in the partial operating lease's filing. */
export function restoreLeaseFinancingProvenance<T extends LeaseScopeRow & { reportedCurrency?: string | null }>(row: T, facts: CompanyFacts, observedAt: string): T {
  if (incompleteLeaseCoverage(row)?.operating == null || !row.date || !row.reportedCurrency) return row;
  const lease = row.fieldProvenance?.operatingLeaseLiability ?? row.fieldProvenance?.capitalLeaseObligations;
  if (lease?.source !== "edgar" || lease.periodEnd !== row.date || lease.unit !== row.reportedCurrency) return row;
  let result = row;
  for (const [field, tag] of [["shortTermDebt", "LongTermDebtCurrent"], ["longTermDebt", "LongTermDebtNoncurrent"]] as const) {
    if (row.fieldProvenance?.[field] || typeof row[field] !== "number" || !Number.isFinite(row[field])) continue;
    const concept = facts.facts["us-gaap"]?.[tag] as { units?: Record<string, unknown[]> } | undefined;
    const points = parseFactPoints(concept?.units?.[row.reportedCurrency] ?? []);
    const eligible = points.filter(p => p.start === undefined && p.end === row.date && p.val >= 0 && CORE_FACT_FORMS.has(p.form) &&
      /^\d{4}-\d{2}-\d{2}$/.test(p.filed) && p.filed <= observedAt.slice(0, 10) && lease.filings?.some(f => f.accn === p.accn));
    const point = new Set(eligible.map(p => p.val)).size === 1 ? eligible.find(p => p.val === row[field]) : undefined;
    if (point) result = { ...result, fieldProvenance: { ...result.fieldProvenance, [field]: { source: "edgar", unit: row.reportedCurrency, periodEnd: row.date,
      periodStart: null, observedAt, tags: [`us-gaap/${tag}`], filings: [{ accn: point.accn, filed: point.filed, form: point.form }] } } };
  }
  return result;
}
type Portion = "current" | "noncurrent";
export function incompleteLeaseCoverage(row: LeaseScopeRow | null | undefined): { operating: Portion | null; finance: Portion | null; note: string } | null {
  if (!row) return null;
  const portion = (field: "operatingLeaseLiability" | "financeLeaseLiability", prefix: "Operating" | "Finance"): Portion | null => {
    // Older adapters copied the summed lease field to its operating slice
    // without copying provenance. Its equal-value source still identifies
    // the partial maturity; equality alone never establishes a missing part.
    const own = row.fieldProvenance?.[field]?.tags;
    const tags = own ?? (row[field] != null && row[field] === row.capitalLeaseObligations ? row.fieldProvenance?.capitalLeaseObligations?.tags : undefined) ?? [];
    const current = tags.includes(`us-gaap/${prefix}LeaseLiabilityCurrent`);
    const noncurrent = tags.includes(`us-gaap/${prefix}LeaseLiabilityNoncurrent`);
    const total = tags.includes(`us-gaap/${prefix}LeaseLiability`) || (prefix === "Finance" && tags.includes("us-gaap/CapitalLeaseObligations"));
    if (total || current === noncurrent) return null;
    return current ? "current" : "noncurrent";
  };
  const operating = portion("operatingLeaseLiability", "Operating");
  const finance = portion("financeLeaseLiability", "Finance");
  if (operating === null && finance === null) return null;
  const details = ([ ["Operating", operating], ["Finance", finance] ] as const).flatMap(([kind, maturity]) => maturity === null ? [] :
    [`${kind} lease liability is ${maturity} only; the ${maturity === "noncurrent" ? "current" : "noncurrent"} portion is unverified`]);
  return { operating, finance, note: `${details.join(". ")}. Retained lease operands establish only the disclosed maturity; a complete lease-inclusive debt or net-debt total is unavailable. No earlier period's missing maturity is imported. The lease-excluded convention permits cancellation only when same-period primary financing components prove the disclosed operating-lease portion is embedded in retained debt; this does not establish full lease coverage.` };
}
