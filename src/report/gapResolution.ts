import type { FmpBalanceSheetRow, StatementFieldProvenance } from "@/providers/fmp";
import type { StatementSet } from "@/pipeline/types";
import type { ManifestEntry } from "@/types/core";

type Resolution = NonNullable<ManifestEntry["resolution"]>;
type Scope = Resolution["evidence"][number]["scope"];
const SCOPES: Scope[] = ["balanceAnnual", "balanceQuarterly"];
const NOTE = "filing:debt-note:carrying-reconciliation";
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const day = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
// Match the persisted zoned ISO datetime contract before Date.parse can
// normalize a rolled calendar/time or interpret an unzoned local timestamp.
const timestamp = (value: unknown): value is string => typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value) &&
  day(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
const utcDay = (value: string): number => Math.floor(Date.parse(value) / 86_400_000);
const CATEGORY_TAGS: Record<string, string[]> = {
  temporaryEquity: ["us-gaap/TemporaryEquityCarryingAmountIncludingPortionAttributableToNoncontrollingInterests"],
  temporaryEquityAttributableToParent: ["us-gaap/TemporaryEquityCarryingAmountAttributableToParent"],
  temporaryEquityAttributableToNoncontrollingInterest: ["us-gaap/RedeemableNoncontrollingInterestEquityCarryingAmount"],
};
const cikKey = (value: unknown): string | null => typeof value === "string" && /^\d{1,10}$/.test(value) && Number(value) > 0 ? value.padStart(10, "0") : null;
const same = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(1e-8, Math.abs(b) * 1e-10);

/** A shared period/category cannot be resolved to contradictory scope values. */
function consistentPeriodValues(evidence: Resolution["evidence"]): boolean {
  const values = new Map<string, number>();
  for (const proof of evidence) {
    const key = `${proof.period}|${proof.field}`;
    const prior = values.get(key);
    if (prior !== undefined && prior !== proof.value) return false;
    values.set(key, proof.value);
  }
  return true;
}

/** Recognize only acquisition refusals whose exact final field can be proved. */
function target(gap: ManifestEntry): { field: string; periods: string[]; scope?: Scope; method: Resolution["method"] } | null {
  if (gap.severity !== "warn" || gap.expected === true) return null;
  const debt = /^keyless\.(balanceAnnual|balanceQuarterly)\.withheld\.(shortTermDebt|totalDebt|netDebt)$/.exec(gap.field);
  if (debt && /^(?:incomplete debt carrying value: )?debt maturity scope unresolved:/.test(gap.reason)) {
    const match = /\(periods: ([\d, -]+)\)$/.exec(gap.reason);
    const periods = match?.[1]?.split(", ") ?? [];
    if (periods.length && periods.every(day) && new Set(periods).size === periods.length) return { scope: debt[1] as Scope, field: debt[2]!, periods, method: "same-filing-debt-note" };
  }
  const temporary = /^statements\.balance\.(\d{4}-\d{2}-\d{2})\.(temporaryEquity(?:AttributableToParent|AttributableToNoncontrollingInterest)?)$/.exec(gap.field);
  if (temporary && day(temporary[1]!) && gap.reason === "temporary-equity SEC enrichment withheld: vendor A/L/permanent-equity operands are missing, conflicting, or do not match the temporary category's exact SEC filing scope") {
    return { field: temporary[2]!, periods: [temporary[1]!], method: "retained-sec-category" };
  }
  return null;
}

function validSource(source: StatementFieldProvenance | undefined, row: FmpBalanceSheetRow, issuer: string, observedAt: string): source is StatementFieldProvenance {
  return source?.source === "edgar" && source.unit === row.reportedCurrency && /^[A-Z]{3}$/.test(source.unit) &&
    source.periodStart === null && source.periodEnd === row.date && day(source.periodEnd) &&
    timestamp(source.observedAt) && utcDay(source.observedAt) <= utcDay(observedAt) && source.tags.length > 0 &&
    source.filings.length > 0 && source.filings.every(filing => /^\d{10}-\d{2}-\d{6}$/.test(filing.accn) && filing.accn.slice(0, 10) === issuer &&
      day(filing.filed) && filing.filed >= source.periodEnd && utcDay(filing.filed) <= utcDay(source.observedAt) && ["10-K", "10-Q", "10-K/A", "10-Q/A"].includes(filing.form));
}

function admitted(row: FmpBalanceSheetRow, field: string, method: Resolution["method"], issuer: string, observedAt: string): StatementFieldProvenance | null {
  if (cikKey(row.cik) !== issuer || !finite(row[field]) || row.fieldConflicts?.[field]?.usable === false) return null;
  const proofField = method === "same-filing-debt-note" && field === "netDebt" ? "totalDebt" : field;
  const proof = row.fieldProvenance?.[proofField];
  if (!validSource(proof, row, issuer, observedAt)) return null;
  const compatible = (key: string): boolean => {
    const source = row.fieldProvenance?.[key];
    return finite(row[key]) && row.fieldConflicts?.[key]?.usable !== false && validSource(source, row, issuer, observedAt) &&
      source.filings.every(filing => proof.filings.some(ref => ref.accn === filing.accn && ref.filed === filing.filed && ref.form === filing.form)) &&
      proof.filings.every(filing => source.filings.some(ref => ref.accn === filing.accn && ref.filed === filing.filed && ref.form === filing.form));
  };
  if (method === "same-filing-debt-note") {
    const operands = ["shortTermDebt", "longTermDebt", "totalDebt", "capitalLeaseObligations"];
    const leases = ["operatingLeaseLiability", "financeLeaseLiability"];
    const aggregateLeases = compatible("capitalLeaseObligations") && ["us-gaap/OperatingLeaseLiability", "us-gaap/FinanceLeaseLiability"]
      .every(tag => row.fieldProvenance!.capitalLeaseObligations!.tags.includes(tag));
    if (!proof.tags.includes(NOTE) || operands.some(key => !compatible(key) || (row[key] as number) < 0) ||
      leases.some(key => !finite(row[key]) || (row[key] as number) < 0 || row.fieldConflicts?.[key]?.usable === false ||
        (row.fieldProvenance?.[key] !== undefined ? !compatible(key) : !aggregateLeases)) ||
      ["shortTermDebt", "longTermDebt", "totalDebt"].some(key => !row.fieldProvenance![key]!.tags.includes(NOTE)) ||
      !same(row.totalDebt!, row.shortTermDebt! + row.longTermDebt! + row.capitalLeaseObligations!) ||
      !same(row.capitalLeaseObligations!, row.operatingLeaseLiability! + row.financeLeaseLiability!)) return null;
    if (field === "netDebt" && (!compatible("cashAndCashEquivalents") || !same(row.netDebt!, row.totalDebt! - row.cashAndCashEquivalents!))) return null;
  } else {
    // An exact category resolves that category's failed supplement only. No
    // aggregate, absent NCI or other unobserved category is inferred from it.
    if (!CATEGORY_TAGS[field]?.some(tag => proof.tags.includes(tag))) return null;
  }
  return proof;
}

/** Pure final-state reconciliation. Original attempt text/severity are immutable. */
export function resolveAcquisitionGaps(gaps: readonly ManifestEntry[], statements: Pick<StatementSet, "balanceAnnual" | "balanceQuarterly">, issuerCik: string, observedAt: string): ManifestEntry[] {
  const issuer = cikKey(issuerCik);
  return gaps.map(entry => {
    // A rerun cannot retain stale proof after its final inputs changed.
    const gap = { ...entry };
    delete gap.resolution;
    const wanted = target(gap);
    if (!issuer || !timestamp(observedAt) || !wanted) return gap;
    const evidence: Resolution["evidence"] = [];
    for (const period of wanted.periods) {
      const scopes = wanted.scope ? [wanted.scope] : SCOPES.filter(scope => {
        const input = statements[scope];
        return input.ok && input.value.data.rows.some(row => row.date === period);
      });
      if (scopes.length === 0) return gap;
      for (const scope of scopes) {
        const input = statements[scope];
        const rows = input.ok ? input.value.data.rows.filter(row => row.date === period) : [];
        if (rows.length !== 1) return gap;
        const row = rows[0]!;
        const proof = admitted(row, wanted.field, wanted.method, issuer, observedAt);
        if (!proof) return gap;
        evidence.push({ scope, field: wanted.field, period, currency: proof.unit, cik: issuer, value: row[wanted.field] as number,
          observedAt: proof.observedAt, tags: [...proof.tags], filings: proof.filings.map(filing => ({ ...filing })) });
      }
    }
    if (new Set(evidence.map(proof => proof.currency)).size !== 1 || !consistentPeriodValues(evidence)) return gap;
    const basis = wanted.method === "same-filing-debt-note" ? `same-filing carrying debt plus observed aggregate lease evidence${wanted.field === "netDebt" ? "; statement net debt = total debt minus cash and cash equivalents (short-term investments excluded)" : ""}`
      : "retained SEC category from its own filed provenance; the earlier same-filing supplement remains refused";
    return { ...gap, resolution: { status: "resolved", method: wanted.method, evidence,
      reason: `Resolved acquisition attempt: final ${wanted.field} for ${wanted.periods.join(", ")} has exact issuer and currency evidence (${[...new Set(evidence.map(proof => proof.scope))].join(", ")}): ${basis}. Original source refusal retained for audit; other categories remain independently assessed.` } };
  });
}

/** Fail closed for malformed or unrelated persisted resolution annotations. */
export function resolvedAcquisitionReason(gap: ManifestEntry): string | null {
  const wanted = target(gap), resolved = gap.resolution;
  if (!wanted || !isAcquisitionResolution(resolved) || resolved.method !== wanted.method) return null;
  const { evidence } = resolved;
  if (evidence.some(proof => proof.field !== wanted.field || !wanted.periods.includes(proof.period) || !SCOPES.includes(proof.scope) ||
    (wanted.scope !== undefined && proof.scope !== wanted.scope) || !finite(proof.value) || cikKey(proof.cik) === null ||
    !validSource({ source: "edgar", unit: proof.currency, periodStart: null, periodEnd: proof.period, observedAt: proof.observedAt, tags: proof.tags, filings: proof.filings },
      { date: proof.period, reportedCurrency: proof.currency }, cikKey(proof.cik)!, proof.observedAt) ||
    (wanted.method === "same-filing-debt-note" ? !proof.tags.includes(NOTE) : !CATEGORY_TAGS[proof.field]?.some(tag => proof.tags.includes(tag)))) ||
    wanted.periods.some(period => !evidence.some(proof => proof.period === period)) ||
    new Set(evidence.map(proof => `${proof.scope}|${proof.period}`)).size !== evidence.length ||
    new Set(evidence.map(proof => cikKey(proof.cik))).size !== 1 || new Set(evidence.map(proof => proof.currency)).size !== 1 || !consistentPeriodValues(evidence)) return null;
  return resolved.reason;
}

/** Shared by persisted-report readers and the raw terminal-summary decoder. */
export function isAcquisitionResolution(value: unknown): value is Resolution {
  const object = (item: unknown): item is Record<string, unknown> => item !== null && typeof item === "object" && !Array.isArray(item);
  const text = (item: unknown): item is string => typeof item === "string" && item.trim() !== "";
  if (!object(value) || Object.keys(value).some(key => !["status", "method", "reason", "evidence"].includes(key)) ||
    value.status !== "resolved" || !["same-filing-debt-note", "retained-sec-category"].includes(value.method as string) ||
    !text(value.reason) || !Array.isArray(value.evidence) || value.evidence.length === 0) return false;
  return value.evidence.every(proof => object(proof) && Object.keys(proof).every(key =>
    ["scope", "field", "period", "currency", "cik", "value", "observedAt", "tags", "filings"].includes(key)) &&
    SCOPES.includes(proof.scope as Scope) && text(proof.field) && typeof proof.period === "string" && day(proof.period) &&
    typeof proof.currency === "string" && /^[A-Z]{3}$/.test(proof.currency) && cikKey(proof.cik) !== null && finite(proof.value) &&
    timestamp(proof.observedAt) &&
    Array.isArray(proof.tags) && proof.tags.length > 0 && proof.tags.every(text) &&
    Array.isArray(proof.filings) && proof.filings.length > 0 && proof.filings.every(filing => object(filing) &&
      Object.keys(filing).every(key => ["accn", "filed", "form"].includes(key)) && text(filing.accn) && typeof filing.filed === "string" && day(filing.filed) && text(filing.form)));
}
