import { statementCurrencies, type ComputedMetrics } from "@/pipeline/compute";
import type { DataBundle } from "@/pipeline/types";
import type { Leadership, Report, SourcedClaim, TracedNumber, VerificationLogEntry } from "@/report/schema";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";
import { citationSourceId } from "@/pipeline/stageC/citations";

/** Positive contracts for pipeline-owned metric families, never the model's evidence bucket. */
export function executiveEvidenceKind(record: NumericProvenanceRecord): "guidance-track-record" | "execution" | undefined {
  if (record.kind === "computed" && record.id.startsWith("computed.quarterly-trend.") &&
    (record.unit === "percent" || record.unit === "percentage-points") &&
    (record.origin === "computed.guidance-track-record" || (/-actual-vs-prior-guidance-midpoint(?:\.\d+)?$/.test(record.id) && /\bactual vs prior guidance midpoint$/.test(record.label ?? "")))) return "guidance-track-record";
  // Realized operating/capital outcomes may support execution. Compensation,
  // titles, forecasts and merely announcing guidance do not belong to these
  // exact statement-line contracts. Unknown/excerpt-only metrics fail closed.
  const executionLines = new Set(["revenue", "net sales", "operating income", "net income", "operating cash flow", "free cash flow",
    "capital expenditure", "buybacks (negative)", "dividends paid (negative)"]);
  if (record.kind === "provider" && record.unit === "currency" && record.id.startsWith("payload.statements.") && executionLines.has(record.label?.toLowerCase() ?? "")) return "execution";
  return undefined;
}

/**
 * Individual grades require an attributable validated factual track record: a
 * FACT naming the executive, in that executive's own evidence, whose figures
 * the verify pass matched to an eligible typed performance metric with no
 * failing check. Unknown/excerpt-only metric semantics stay unassessed. The
 * verify pass never marks prose `verified` (a numeric match
 * does not adjudicate the whole sentence), so requiring that outcome made the
 * gate unreachable (NVDA report 34: every executive "not-assessed").
 */
export function assessExecutiveEvidence(leadership: Leadership, log: readonly VerificationLogEntry[], pendingVerification = false): Leadership {
  return {...leadership, executives:leadership.executives.map((executive, index)=>{
    const admissible = (claim:SourcedClaim, field:string, claimIndex:number): VerificationLogEntry["executiveEvidenceKind"] => {
      if (claim.label !== "FACT" || !claim.asOf || !claim.source.trim() || /^(?:unknown|memory|assumed)$/i.test(claim.source.trim())) return undefined;
      const words = new Set(claim.text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
      const name = executive.name.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
      if (name.length === 0 || !name.every(word=>words.has(word))) return undefined;
      if (/\b(?:no|lacks?|absent|unavailable)\b.{0,40}\b(?:evidence|record)\b|\b(?:evidence|record)\b.{0,40}\b(?:absent|unavailable|not available|not disclosed)\b/i.test(claim.text)) return undefined;
      const path = `leadership.executives[${index}].evidence.${field}[${claimIndex}]`;
      if (log.some(entry=>entry.path===path && entry.check && entry.outcome==="unverified")) return undefined;
      return log.find(entry=>entry.path===path && entry.claim===claim.text && entry.source===citationSourceId(claim) &&
        entry.validationStatus==="validated" && !entry.check)?.executiveEvidenceKind;
    };
    // Provisional assembly is internal to verification and preserves proposed
    // grades; only the final gate consumes pipeline-produced classifications.
    if (pendingVerification) return executive;
    const kinds = [...(executive.evidence.guidanceVsActuals ?? []).map((claim,i)=>admissible(claim,"guidanceVsActuals",i)),
      ...(executive.evidence.capitalAllocation ?? []).map((claim,i)=>admissible(claim,"capitalAllocation",i))];
    const credibility = kinds.includes("guidance-track-record");
    const execution = credibility || kinds.includes("execution");
    return {...executive, grade:execution ? executive.grade : "not-assessed", credibilityGrade:credibility ? executive.credibilityGrade : "not-assessed",
      ...(!execution || !credibility ? {assessmentReason:"Attributable, validated execution and/or guidance-versus-actual evidence is absent. A citation, rejected claim, compensation or job title alone cannot establish the missing assessment."} : {}),
    };
  })};
}

/** Pipeline-owned reconciliations are shared by AI and data-only reports. */
export function applyFinancialDiagnostics(report: Report, computed: ComputedMetrics, bundle?: DataBundle, options: {pendingVerification?:boolean} = {}): Report {
  const next = structuredClone(report);
  // structuredClone preserves internal aliases: grade keyNumbers may be the
  // same array as score.drivers. Diagnostic rows are not new grading signals.
  next.quality.graded.keyNumbers = [...next.quality.graded.keyNumbers];
  next.balanceSheet.coverage.numbers = [...next.balanceSheet.coverage.numbers];
  next.balanceSheet.debtProfile.numbers = [...next.balanceSheet.debtProfile.numbers];
  const current = computed.capital?.current;
  const numeric = (source: string, value: number | null | undefined, unit: string, asOf: string | null, currency: string | null = null, period: string | null = asOf): TracedNumber | null =>
    typeof value === "number" && Number.isFinite(value) ? { value, unit, currency, period, source, sourceId: source, asOf, verified: true } : null;
  const append = (target: TracedNumber[], value: TracedNumber | null) => {
    if (value && !target.some(n=>n.source===value.source)) target.push(value);
  };
  if (current && current.industrialMetricsApplicable !== false) {
    if (current.debtBridge.leaseScopeNote) {
      const unqualified = new Set(["totalDebtIncludingLeases", "operatingLeases", "financeLeases", "netDebtIncludingLeases", "netDebtExcludingOperatingLeases"].flatMap(field =>
        [`computed.capital.current.debtBridge.${field}`, `computed.current-capital.${field.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}`]));
      next.balanceSheet.debtProfile.numbers = next.balanceSheet.debtProfile.numbers.filter(n => !unqualified.has(n.sourceId ?? n.source));
    }
    const period = `${current.basis}: ${current.periodStart ?? "unknown start"} to ${current.asOf ?? "unknown end"}`;
    for (const [field,value] of Object.entries(current.cashBridge)) {
      if (typeof value !== "number") continue;
      append(next.balanceSheet.coverage.numbers, numeric(`computed.capital.current.cashBridge.${field}`, value, "currency", current.asOf, current.currency, period));
    }
    for (const [field,value] of Object.entries(current.debtBridge)) {
      if (typeof value !== "number") continue;
      append(next.balanceSheet.debtProfile.numbers, numeric(`computed.capital.current.debtBridge.${field}`, value, "currency", current.asOf, current.currency));
    }
    for (const field of ["netDebtToEbitda", "interestCoverage", "fcfConversionBeforeSbc", "sbcPctOfFcf"] as const) {
      append(next.balanceSheet.coverage.numbers, numeric(`computed.capital.current.${field}`, current[field], field === "sbcPctOfFcf" ? "%" : "x", current.asOf, null, period));
    }
    // Method statements, not issuer facts: JUDGMENT (audit 2026-10-22 F-20).
    next.balanceSheet.coverage.commentary.push({ label: "JUDGMENT", source: "computed.capital.current", asOf: current.asOf,
      text: `Capital grading basis: ${period}. ${current.fallbackReason ?? "Complete TTM flows are used with the corresponding current balance; annual historical series remain separately labeled."} ${current.cashBridge.definition}` });
    next.balanceSheet.debtProfile.commentary.push({ label: "JUDGMENT", source: "computed.capital.current", asOf: current.asOf,
      text: current.debtBridge.leaseScopeNote ?? "The debt bridge distinguishes debt including leases from debt excluding operating leases, and offsets cash plus short-term investments. Vendor cash-only net debt is a separate convention. Undisclosed lease components are unavailable, not assumed zero." });
  }
  const accrual = computed.forensics?.accruals;
  if (accrual) {
    for (const field of ["cashFlowAccrualRatio", "balanceSheetAccrualRatio", "aggregateAccrualsCashFlow", "aggregateAccrualsBalanceSheet", "noaCurrent", "noaPrior", "scalerValue", "netIncome", "operatingCashFlow", "investingCashFlow", "operatingAccruals", "financialAssetCashFlow", "operatingInvestingCashFlow"] as const) {
      append(next.quality.graded.keyNumbers, numeric(`computed.forensics.accruals.${field}`, accrual[field], /Ratio/.test(field) ? "x" : "currency", field === "noaPrior" ? accrual.asOf.prior : accrual.asOf.current,
        /Ratio/.test(field) ? null : current?.currency ?? (bundle ? statementCurrencies(bundle).model : null)));
    }
  }
  // D-68: the accrual definition, its house bands, the growth and acquisition
  // context and the statement figures behind AQI and GMI are methodology and
  // context, not findings: they are notes under the forensic table, and the
  // flags list keeps the findings. The definition itself is the model's own
  // note (computeAccruals names the construction it used); only a result
  // from before D-61, which records none, gets the broad-screen explanation.
  const notes: string[] = [...(next.quality.notes ?? [])];
  const addNote = (text: string | null | undefined): void => {
    if (typeof text === "string" && text.trim().length > 0 && !notes.includes(text)) notes.push(text);
  };
  if (accrual) {
    if (accrual.definition === undefined) {
      addNote("Aggregate cash-flow accruals = (net income − operating cash flow − investing cash flow) / average net operating assets. Investing outflows can make this ratio positive even when operating cash flow exceeds net income. This broad investment-inclusive screen is distinct from operating accruals (net income − operating cash flow) and is not a manipulation finding.");
    }
    for (const note of accrual.notes) addNote(note);
  }
  const beneish = computed.forensics?.beneish;
  addNote(beneish?.aqiContext);
  addNote(beneish?.gmiContext);
  if (notes.length > 0) {
    next.quality.notes = notes;
    // A report assembled before D-68 carried these as "low" flags; never both.
    next.quality.flags = next.quality.flags.filter((f) => !(f.source === "computed.forensics.accruals" && f.severity === "low" && notes.includes(f.text)));
  }
  next.leadership = assessExecutiveEvidence(next.leadership,next.appendix.verificationLog ?? [],options.pendingVerification);
  return next;
}
