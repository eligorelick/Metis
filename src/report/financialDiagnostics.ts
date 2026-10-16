import { statementCurrencies, type ComputedMetrics } from "@/pipeline/compute";
import type { DataBundle } from "@/pipeline/types";
import type { Leadership, Report, SourcedClaim, TracedNumber, VerificationLogEntry } from "@/report/schema";

/**
 * Individual grades require an attributable validated factual track record: a
 * FACT naming the executive, in that executive's own evidence, whose figures
 * the verify pass matched to the cited typed record or filing span with no
 * failing check. The verify pass never marks prose `verified` (a numeric match
 * does not adjudicate the whole sentence), so requiring that outcome made the
 * gate unreachable (NVDA report 34: every executive "not-assessed").
 */
export function assessExecutiveEvidence(leadership: Leadership, log: readonly VerificationLogEntry[], pendingVerification = false): Leadership {
  return {...leadership, executives:leadership.executives.map((executive, index)=>{
    const admissible = (claim:SourcedClaim, field:string, claimIndex:number):boolean => {
      if (claim.label !== "FACT" || !claim.asOf || !claim.source.trim() || /^(?:unknown|memory|assumed)$/i.test(claim.source.trim())) return false;
      const words = new Set(claim.text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
      const name = executive.name.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
      if (name.length === 0 || !name.every(word=>words.has(word))) return false;
      if (/\b(?:no|lacks?|absent|unavailable)\b.{0,40}\b(?:evidence|record)\b|\b(?:evidence|record)\b.{0,40}\b(?:absent|unavailable|not available|not disclosed)\b/i.test(claim.text)) return false;
      if (pendingVerification) return true;
      const path = `leadership.executives[${index}].evidence.${field}[${claimIndex}]`;
      return log.some(entry=>entry.path===path && entry.claim===claim.text && entry.validationStatus==="validated" && !entry.check) &&
        !log.some(entry=>entry.path===path && entry.check && entry.outcome==="unverified");
    };
    const credibility = (executive.evidence.guidanceVsActuals ?? []).some((claim,i)=>admissible(claim,"guidanceVsActuals",i));
    const execution = credibility || (executive.evidence.capitalAllocation ?? []).some((claim,i)=>admissible(claim,"capitalAllocation",i));
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
    next.balanceSheet.coverage.commentary.push({ label: "FACT", source: "computed.capital.current", asOf: current.asOf,
      text: `Capital grading basis: ${period}. ${current.fallbackReason ?? "Complete TTM flows are used with the corresponding current balance; annual historical series remain separately labeled."} ${current.cashBridge.definition}` });
    next.balanceSheet.debtProfile.commentary.push({ label: "FACT", source: "computed.capital.current", asOf: current.asOf,
      text: "The debt bridge distinguishes debt including leases from debt excluding operating leases, and offsets cash plus short-term investments. Vendor cash-only net debt is a separate convention. Undisclosed lease components are unavailable, not assumed zero." });
  }
  const accrual = computed.forensics?.accruals;
  if (accrual) {
    for (const field of ["cashFlowAccrualRatio", "balanceSheetAccrualRatio", "aggregateAccrualsCashFlow", "aggregateAccrualsBalanceSheet", "noaCurrent", "noaPrior", "scalerValue", "netIncome", "operatingCashFlow", "investingCashFlow", "operatingAccruals", "financialAssetCashFlow", "operatingInvestingCashFlow"] as const) {
      append(next.quality.graded.keyNumbers, numeric(`computed.forensics.accruals.${field}`, accrual[field], /Ratio/.test(field) ? "x" : "currency", field === "noaPrior" ? accrual.asOf.prior : accrual.asOf.current,
        /Ratio/.test(field) ? null : current?.currency ?? (bundle ? statementCurrencies(bundle).model : null)));
    }
    const source = "computed.forensics.accruals";
    // D-61: the explanation names the construction the ratio was computed on.
    const explanation = accrual.definition === "financial-asset-adjusted"
      ? "Cash-flow accruals = (net income − operating cash flow − operating investing cash flow) / average net operating assets, financial-asset-adjusted (Richardson et al. 2005): purchases and sales/maturities of investments are excluded from investing cash flow and long-term investments from net operating assets, so buying securities or strategic stakes is not an accrual. Capex and acquisitions remain. It measures growth in net operating assets and is not a manipulation finding."
      : accrual.definition === "operating"
        ? "Cash-flow accruals = (net income − operating cash flow) / average net operating assets: operating accruals, because the statements do not separate investment purchases from operating investment. No investing flow is included. It is not a manipulation finding."
        : "Aggregate cash-flow accruals = (net income − operating cash flow − investing cash flow) / average net operating assets. Investing outflows can make this ratio positive even when operating cash flow exceeds net income. This broad investment-inclusive screen is distinct from operating accruals (net income − operating cash flow) and is not a manipulation finding.";
    if (!next.quality.flags.some(f=>f.source===source && f.text===explanation)) next.quality.flags.push({ severity:"low", source, text:explanation });
    for (const note of accrual.notes) {
      if (!next.quality.flags.some(f=>f.source===source && f.text===note)) next.quality.flags.push({ severity: "low", source, text: note });
    }
  }
  next.leadership = assessExecutiveEvidence(next.leadership,next.appendix.verificationLog ?? [],options.pendingVerification);
  return next;
}
