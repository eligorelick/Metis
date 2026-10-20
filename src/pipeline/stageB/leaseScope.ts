import { CORE_FACT_FORMS, parseFactPoints, type CompanyFacts } from "@/edgar/xbrl";

/** Retained rows can predate the parser's requirement for both lease maturities. */
export interface LeaseScopeRow {
  date?: string | null;
  totalDebt?: number | null;
  shortTermDebt?: number | null;
  longTermDebt?: number | null;
  operatingLeaseLiability?: number | null;
  financeLeaseLiability?: number | null;
  capitalLeaseObligations?: number | null;
  fieldProvenance?: Record<string, { tags: string[]; source?: string; unit?: string; periodEnd?: string | null; filings?: { accn: string }[] }>;
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
