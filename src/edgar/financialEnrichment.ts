import { CORE_FACT_FORMS, parseFactPoints, type CompanyFacts, type FactPoint } from "@/edgar/xbrl";
import type { FmpBalanceSheetRow, FmpCashFlowRow, FmpPayload, FmpStatementRow, StatementFieldProvenance } from "@/providers/fmp";
import type { FetchResult, ManifestEntry } from "@/types/core";
import { fiscalMaturityScopeReason, incompleteDebtReason } from "@/edgar/debtCompleteness";
import { reconcileDebtPresentation } from "@/edgar/debtPresentation";
import type { EdgarBundle, ExtractedSection } from "@/pipeline/types";

/** Already acquired filing sections only; no additional provider reads. */
export function debtPresentationSections(edgar: Pick<EdgarBundle, "tenQNotes" | "tenKNotes"> | undefined): ExtractedSection[] {
  return [edgar?.tenQNotes, edgar?.tenKNotes].flatMap((result) => result?.ok ? [result.value.data] : []);
}

const DAY = 86_400_000;
function validDay(day: unknown): day is string {
  return typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
}
const span = (p: FactPoint) => p.start ? (Date.parse(p.end) - Date.parse(p.start)) / DAY : null;
const newest = (points: FactPoint[]) => [...points].sort((a, b) => b.filed.localeCompare(a.filed) || b.accn.localeCompare(a.accn))[0];
interface Resolved { value: number; evidence: StatementFieldProvenance }

/** Dated facts, exact monetary unit only; no implicit USD or million scaling. */
function points(facts: CompanyFacts, tag: string, unit: string, observedAt: string): FactPoint[] {
  const c = facts.facts["us-gaap"]?.[tag] as { units?: Record<string, unknown[]> } | undefined;
  return parseFactPoints(c?.units?.[unit] ?? []).filter((p) => CORE_FACT_FORMS.has(p.form) && validDay(p.end) && p.end <= observedAt.slice(0, 10) && validDay(p.filed) && p.filed <= observedAt.slice(0, 10) && (p.start === undefined || validDay(p.start)));
}
function resolved(value: number, tags: string[], ps: FactPoint[], unit: string, observedAt: string, periodStart: string | null, periodEnd: string): Resolved {
  return { value, evidence: { source: "edgar", unit, periodStart, periodEnd, observedAt, tags: tags.map((t) => `us-gaap/${t}`), filings: ps.map((p) => ({ accn: p.accn, filed: p.filed, form: p.form })) } };
}
function instant(facts: CompanyFacts, tag: string, unit: string, end: string, observedAt: string): Resolved | null {
  const p = newest(points(facts, tag, unit, observedAt).filter((p) => p.end === end && p.start === undefined && p.val >= 0));
  return p ? resolved(p.val, [tag], [p], unit, observedAt, null, end) : null;
}
function liability(facts: CompanyFacts, prefix: "Operating" | "Finance", unit: string, end: string, observedAt: string): Resolved | null {
  const tag = `${prefix}LeaseLiability`;
  const total = instant(facts, tag, unit, end, observedAt);
  if (total) return total;
  const current = instant(facts, `${tag}Current`, unit, end, observedAt);
  const noncurrent = instant(facts, `${tag}Noncurrent`, unit, end, observedAt);
  if (!current || !noncurrent) return null;
  // A total assembled across unrelated filing versions is not a filed total.
  if (current.evidence.filings[0]?.accn !== noncurrent.evidence.filings[0]?.accn) return null;
  return { value: current.value + noncurrent.value, evidence: { ...current.evidence, tags: [...current.evidence.tags, ...noncurrent.evidence.tags] } };
}
function principal(facts: CompanyFacts, unit: string, end: string, scope: "annual" | "quarter", observedAt: string): Resolved | null {
  const tag = "FinanceLeasePrincipalPayments";
  const ps = points(facts, tag, unit, observedAt).filter((p) => p.start !== undefined && p.val >= 0);
  const min = scope === "annual" ? 350 : 70;
  const max = scope === "annual" ? 380 : 105;
  const direct = newest(ps.filter((p) => p.end === end && span(p)! >= min && span(p)! <= max));
  if (direct) return resolved(direct.val, [tag], [direct], unit, observedAt, direct.start!, end);
  if (scope === "annual") return null;
  const ytd = newest(ps.filter((p) => p.end === end && span(p)! > 105 && span(p)! <= 380));
  if (!ytd) return null;
  const prior = newest(ps.filter((p) => p.start === ytd.start && p.end < end && p.filed <= ytd.filed && (Date.parse(end) - Date.parse(p.end)) / DAY >= 70 && (Date.parse(end) - Date.parse(p.end)) / DAY <= 105));
  if (!prior || ytd.val < prior.val) return null;
  const start = new Date(Date.parse(prior.end) + DAY).toISOString().slice(0, 10);
  const out = resolved(ytd.val - prior.val, [tag], [ytd, prior], unit, observedAt, start, end);
  out.evidence.derivation = "ytd-difference";
  return out;
}

/** Admit debt only after currency is established, including same-filing currency evidence supplied by Stage B. */
export function admitDebtFields<T extends FmpStatementRow>(row: T, facts: CompanyFacts, currency: string | null, observedAt: string, presentations: readonly ExtractedSection[] = []): { row: T; gaps: ManifestEntry[] } {
  const gaps: ManifestEntry[] = [];
  if (!validDay(row.date) || currency === null || !/^[A-Z]{3}$/.test(currency)) return { row, gaps };
  let out = row;
  // Preserve raw observations for audit, but an explicitly rejected financing
  // or lease component cannot establish any aggregate's carrying-value basis.
  const refusedComponent = ["shortTermDebt", "longTermDebt", "financeLeaseLiability", "capitalLeaseObligations", "operatingLeaseLiability"]
    .find((field) => row.fieldConflicts?.[field]?.usable === false);
  const componentReason = refusedComponent === undefined ? null
    : `incomplete debt carrying value: ${refusedComponent} is unavailable (${row.fieldConflicts![refusedComponent]!.reason})`;
  let presentationReason: string | null = null;
  const longTerm = out.fieldProvenance?.longTermDebt;
  const tagged = longTerm?.tags.includes("us-gaap/LongTermDebt") && longTerm.unit === currency && longTerm.periodEnd === row.date
    ? instant(facts, "LongTermDebt", currency, row.date, observedAt) : null;
  const tagFiling = tagged?.evidence.filings[0];
  const source = tagFiling && longTerm?.filings.some((filing) => filing.accn === tagFiling.accn && filing.filed === tagFiling.filed)
    ? presentations.find((section) => section.accession === tagFiling.accn && section.form === tagFiling.form && section.filingDate === tagFiling.filed && section.filingDate <= observedAt.slice(0, 10)) : undefined;
  if (componentReason === null && source && tagged && tagFiling) {
    const maturities = instant(facts, "LongTermDebtCurrent", currency, row.date, observedAt);
    const maturityFiling = maturities?.evidence.filings[0];
    const currentMaturities = maturityFiling?.accn === tagFiling.accn && maturityFiling.filed === tagFiling.filed ? maturities!.value : null;
    const presentation = reconcileDebtPresentation({ text: source.statementsText ?? source.text, periodEnd: row.date, currency,
      tagValue: tagged.value, currentMaturities, source, tagSource: { cik: String(facts.cik), accession: tagFiling.accn,
        filingDate: tagFiling.filed, periodEnd: row.date, unit: currency } });
    if (presentation.status === "conflict") presentationReason = `debt presentation conflict: ${presentation.reason}`;
    if (presentation.status === "established" && out.fieldConflicts?.longTermDebt?.usable !== false) {
      const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
      const same = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 1e-10);
      const oldLong = finite(out.longTermDebt), oldCurrent = finite(out.shortTermDebt), oldTotal = finite(out.totalDebt);
      const noncurrent = presentation.noncurrentDebt!;
      if (oldLong === null || (!same(oldLong, tagged.value) && (currentMaturities === null || !same(oldLong, tagged.value - currentMaturities))) ||
          (presentation.currentDebt !== null && (oldCurrent === null || !same(oldCurrent, presentation.currentDebt)))) {
        presentationReason = "debt presentation conflict: resolved debt components do not match the same-filing carrying lines or the established taxonomy adjustment";
      } else {
        const delta = noncurrent - oldLong;
        const evidence = { ...longTerm!, tags: [...new Set([...longTerm!.tags, ...presentation.evidence!.tags])] };
        out = { ...out, longTermDebt: noncurrent, fieldProvenance: { ...out.fieldProvenance, longTermDebt: evidence } };
        if (delta !== 0) {
          const componentSum = (oldCurrent ?? 0) + oldLong + (finite(out.capitalLeaseObligations) ?? 0);
          if (oldTotal === null || out.fieldConflicts?.totalDebt?.usable === false || !same(oldTotal, componentSum)) {
            presentationReason = "debt presentation conflict: total debt does not reconcile to the resolved current, noncurrent and lease components";
          } else {
            const totalDebt = oldTotal + delta;
            const cash = finite(out.cashAndCashEquivalents), oldNet = finite(out.netDebt);
            out = { ...out, totalDebt, netDebt: cash !== null && oldNet !== null && same(oldNet, oldTotal - cash) ? totalDebt - cash : null };
          }
          gaps.push({ field: `statements.balance.${row.date}.longTermDebt`, reason: presentation.reason, severity: "info", expected: true });
        }
      }
    }
    if (presentationReason !== null) out = { ...out, longTermDebt: null, fieldConflicts: { ...out.fieldConflicts, longTermDebt: {
      vendorValue: typeof row.longTermDebt === "number" ? row.longTermDebt : null, secValue: null, usable: false, reason: presentationReason,
    } } };
  }
  const maturityTag = "LongTermDebtMaturitiesRepaymentsOfPrincipalInNextTwelveMonths";
  const maturitySourced = out.fieldProvenance?.shortTermDebt?.tags.some((tag) => tag === `us-gaap/${maturityTag}`) === true;
  const scopeReason = maturitySourced ? fiscalMaturityScopeReason(instant(facts, maturityTag, currency, row.date, observedAt)?.value ?? null,
    instant(facts, "LongTermDebtMaturitiesRepaymentsOfPrincipalRemainderOfFiscalYear", currency, row.date, observedAt)?.value ?? null) : null;
  if (scopeReason !== null) {
    out = { ...out, shortTermDebt: null, fieldConflicts: { ...out.fieldConflicts, shortTermDebt: {
      vendorValue: typeof row.shortTermDebt === "number" ? row.shortTermDebt : null, secValue: null, usable: false, reason: scopeReason,
    } } };
    gaps.push({ field: `statements.balance.${row.date}.shortTermDebt`, reason: scopeReason, severity: "warn" });
  }
  const aggregate = instant(facts, "DebtInstrumentCarryingAmount", currency, row.date, observedAt);
  const reason = componentReason ?? presentationReason ?? (scopeReason !== null ? `incomplete debt carrying value: ${scopeReason}` : incompleteDebtReason({ shortTermDebt: out.shortTermDebt,
    longTermDebt: out.longTermDebt, financeLeaseLiability: out.financeLeaseLiability, totalDebt: out.totalDebt }, aggregate?.value ?? null));
  for (const field of ["totalDebt", "netDebt"] as const) {
    const prior = out.fieldConflicts?.[field];
    if (reason === null && prior?.usable !== false) continue;
    const refusal = reason ?? prior!.reason;
    out = { ...out, [field]: null, fieldConflicts: { ...out.fieldConflicts, [field]: {
      vendorValue: prior?.vendorValue ?? (typeof row[field] === "number" ? row[field] as number : null),
      secValue: null, usable: false, reason: refusal, ...(aggregate ? { secEvidence: aggregate.evidence } : {}),
    } } };
    if (reason !== null) gaps.push({ field: `statements.balance.${row.date}.${field}`, reason, severity: "warn" });
  }
  return { row: out, gaps };
}

/** Enrichs missing fields only. Conflicts preserve vendor observations and carry usable:false. */
export function enrichFinancialFields(balance: FetchResult<FmpPayload<FmpBalanceSheetRow>>, cashflow: FetchResult<FmpPayload<FmpCashFlowRow>>, facts: CompanyFacts, scope: "annual" | "quarter", observedAt: string, presentations: readonly ExtractedSection[] = []): { balance: typeof balance; cashflow: typeof cashflow; gaps: ManifestEntry[] } {
  const gaps: ManifestEntry[] = [];
  function enrich<T extends FmpStatementRow>(input: FetchResult<FmpPayload<T>>, kind: "balance" | "cashflow"): FetchResult<FmpPayload<T>> {
    if (!input.ok) return input;
    const rows = input.value.data.rows.map((row) => {
      if (!validDay(row.date)) return row;
      const currency = row.reportedCurrency;
      if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) {
        gaps.push({ field: `statements.${kind}.${row.date}`, reason: "SEC field enrichment withheld: vendor reporting currency is unknown", severity: "info" });
        return row;
      }
      const candidates: [string, Resolved | null][] = kind === "balance" ? [
        ["operatingLeaseLiability", liability(facts, "Operating", currency, row.date, observedAt)],
        ["financeLeaseLiability", liability(facts, "Finance", currency, row.date, observedAt)],
      ] : [["financeLeasePrincipalPayments", principal(facts, currency, row.date, scope, observedAt)]];
      let out = row;
      for (const [field, sec] of candidates) {
        if (!sec) {
          const tag = field === "operatingLeaseLiability" ? "OperatingLeaseLiability" : field === "financeLeaseLiability" ? "FinanceLeaseLiability" : "FinanceLeasePrincipalPayments";
          const otherUnits = (facts.facts["us-gaap"]?.[tag] as { units?: Record<string, unknown[]> } | undefined)?.units;
          if (otherUnits && Object.keys(otherUnits).some((u) => u !== currency && /^[A-Z]{3}$/.test(u))) gaps.push({ field: `statements.${kind}.${row.date}.${field}`, reason: `SEC field enrichment withheld: fact currency differs from vendor reporting currency ${currency}`, severity: "warn" });
          continue;
        }
        if (sec.evidence.periodStart !== null && typeof row.periodStart === "string" && row.periodStart !== sec.evidence.periodStart) {
          gaps.push({ field: `statements.${kind}.${row.date}.${field}`, reason: `SEC field enrichment withheld: SEC period starts ${sec.evidence.periodStart}, conflicting with vendor period start ${row.periodStart}`, severity: "warn" });
          continue;
        }
        const vendor = row[field];
        if (typeof vendor === "number" && Number.isFinite(vendor)) {
          if (Math.abs(vendor - sec.value) <= Math.max(1e-8, Math.abs(sec.value) * 1e-10)) continue;
          const reason = `vendor/SEC conflict for ${field} at ${row.date}: ${vendor} versus ${sec.value} ${currency}; vendor observation preserved and field unavailable for reconciliation`;
          out = { ...out, fieldConflicts: { ...out.fieldConflicts, [field]: { vendorValue: vendor, secValue: sec.value, usable: false, reason, secEvidence: sec.evidence } } };
          gaps.push({ field: `statements.${kind}.${row.date}.${field}`, reason, severity: "warn" });
          continue;
        }
        out = { ...out, [field]: sec.value, fieldProvenance: { ...out.fieldProvenance, [field]: sec.evidence } };
        gaps.push({ field: `statements.${kind}.${row.date}.${field}`, reason: `missing ${field} enriched from SEC ${sec.evidence.tags.join(" + ")} in ${currency}, exact ${scope} period ending ${row.date}; vendor row retained`, severity: "info", expected: true, attemptedSources: sec.evidence.tags.map((t) => `edgar:companyfacts/${t}`) });
      }
      if (kind === "balance") {
        const admitted = admitDebtFields(out, facts, currency, observedAt, presentations);
        out = admitted.row;
        gaps.push(...admitted.gaps);
      }
      return out;
    });
    return { ...input, value: { ...input.value, data: { ...input.value.data, rows } } };
  }
  return { balance: enrich(balance, "balance"), cashflow: enrich(cashflow, "cashflow"), gaps };
}
