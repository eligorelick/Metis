import { debtCompositionDefinition } from "@/pipeline/stageB/leaseScope";
import { successorContinuity } from "@/edgar/successor";
import { quotedShareUnit } from "@/pipeline/shareUnits";
import { MINORITY_DEFINITION_FAMILIES, REDEEMABLE_MINORITY_DEFINITION } from "@/pipeline/stageB/seniorClaims";
import { predecessorFactsFor } from "@/pipeline/stageB/debtLikeObligations";
import { capexDefinition, sharedCapexDefinition, CAPEX_DEFINITION_FAMILIES } from "@/pipeline/stageB/capital";
import { liquidityDefinition, LIQUIDITY_DEFINITION_FAMILIES } from "@/pipeline/stageB/netDebt";
import { investmentDefinition, INVESTMENT_DEFINITION_FAMILIES, revenueDefinition, annualRevenueDefinition, REVENUE_DEFINITION_FAMILIES } from "@/pipeline/stageB/valuation";
import { MODEL_TANGIBLE_COMMON_BASIS } from "@/pipeline/stageB/returns";
import { filedDefinitionMatches } from "@/edgar/xbrl";
import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import type { FmpStatementRow } from "@/providers/fmp";
import { statementCurrencies, type ComputedMetrics } from "@/pipeline/compute";
import type { DataBundle } from "@/pipeline/types";
import type { Leadership, Report, SourcedClaim, TracedNumber, VerificationLogEntry } from "@/report/schema";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";
import { citationSourceId } from "@/pipeline/stageC/citations";
import { executiveAssessmentReason } from "@/report/executiveAssessment";
import { reasoningClaims } from "@/report/presentation";
import { derivedExecutiveTenureYears, executiveMetricDuringTenure, executiveTenureStart, filingTenureFor, startAgreesWithFiling, validatedExecutiveDecisions, type ExecutiveDecisionEvidence } from "@/report/executiveDecisions";

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
 * Preserve the existing typed performance/guidance contracts and additionally
 * admit a validated dated office decision within an evidenced tenure.
 * Company results alone do not establish a measured personal record.
 * The verify pass never marks prose `verified`: numeric validation and exact
 * retained decision wording are checked separately from personal contribution.
 */
export function assessExecutiveEvidence(leadership: Leadership, log: readonly VerificationLogEntry[], pendingVerification = false, context: ExecutiveDecisionEvidence = {}): Leadership {
  return {...leadership, executives:leadership.executives.map((executive, index)=>{
    const { officeTenure: _untrusted, ...original } = executive;
    void _untrusted;
    const candidateTenure = filingTenureFor(executive, context);
    const establishedStart = executiveTenureStart(executive, index, log, context);
    const officeTenure = candidateTenure && establishedStart && startAgreesWithFiling(establishedStart, candidateTenure) ? candidateTenure : undefined;
    executive = { ...original, ...(officeTenure ? { officeTenure } : {}), tenureYears:
      candidateTenure && candidateTenure.precision !== "day" ? null : derivedExecutiveTenureYears(establishedStart, context.asOf) };
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
    const decisions = validatedExecutiveDecisions(executive, index, leadership, log, context);
    const metricClaims = [...(executive.evidence.guidanceVsActuals ?? []).map((claim,i)=>({claim,kind:admissible(claim,"guidanceVsActuals",i)})),
      ...(executive.evidence.capitalAllocation ?? []).map((claim,i)=>({claim,kind:admissible(claim,"capitalAllocation",i)}))];
    const credibility = metricClaims.some(c => c.kind === "guidance-track-record");
    const execution = decisions.length > 0 || metricClaims.some(({claim,kind}) => kind !== undefined &&
      executiveMetricDuringTenure(context.numericRecords?.find(r => r.id === citationSourceId(claim) && r.asOf === claim.asOf), establishedStart, context.asOf));
    const grade = execution ? executive.grade : "not-assessed";
    // D-163: name which assessment is missing.
    const missingCredibility = "Credibility is not assessed: no validated comparison of earlier guidance with a later actual for the same period and basis.";
    const tenureReason = !execution && metricClaims.some(c => c.kind !== undefined)
      ? !establishedStart ? "Execution is not assessed: no office start is established, so company metrics cannot be attributed to this tenure."
        : "Execution is not assessed: no validated metric measurement period overlaps the established office tenure by the report cutoff."
      : undefined;
    const reason = tenureReason ? `${tenureReason}${!credibility ? ` ${missingCredibility}` : ""}` : decisions.length > 0
      ? `${grade === "not-assessed" ? "Validated dated decisions are available during the evidenced tenure; the judge left execution ungraded. Assessments concern decisions and outcomes during the tenure, not personal skill." : "Execution assesses decisions and outcomes during the evidenced tenure, not personal skill."}${!credibility ? ` ${missingCredibility}` : ""}`
      : executiveAssessmentReason({ execution, credibility }, grade);
    return {...executive, grade, credibilityGrade:credibility ? executive.credibilityGrade : "not-assessed",
      ...(reason ? {assessmentReason:reason} : {}),
    };
  })};
}

/** Pipeline-owned reconciliations are shared by AI and data-only reports. */
type CurrentCapital = NonNullable<NonNullable<ComputedMetrics["capital"]>["current"]>;

/**
 * D-298 (P10, P20): on the TTM basis, name exactly which trailing flows this
 * window admitted and which it did not establish, and the figures that rest on
 * a missing flow (so they are withheld). Read from the snapshot's typed values;
 * no sentence claims that every flow is complete.
 */
export function trailingFlowStatement(current: Pick<CurrentCapital, "netIncome" | "ebitda" | "cashBridge">): string {
  const present = {
    ocf: current.cashBridge.operatingCashFlow !== null,
    capex: current.cashBridge.cashCapitalExpenditure !== null,
    income: (current.netIncome ?? null) !== null,
    ebitda: (current.ebitda ?? null) !== null,
    sbc: (current.cashBridge.stockBasedCompensation ?? null) !== null,
  };
  const names: [keyof typeof present, string][] = [["ocf", "operating cash flow"], ["capex", "cash capital expenditure"],
    ["income", "consolidated net income"], ["ebitda", "EBITDA"], ["sbc", "stock-based compensation"]];
  const list = (items: string[]) => items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
  const admitted = names.filter(([key]) => present[key]).map(([, name]) => name);
  const missing = names.filter(([key]) => !present[key]).map(([, name]) => name);
  const fcf = present.ocf && present.capex;
  const withheld = [
    ...(fcf ? [] : ["FCF"]),
    ...(fcf && present.sbc ? [] : ["FCF after SBC", "SBC share of FCF"]),
    ...(fcf && present.income ? [] : ["FCF conversion"]),
    ...(present.ebitda ? [] : ["net debt / EBITDA"]),
  ];
  const head = admitted.length > 0 ? `TTM flows admitted for this window: ${list(admitted)}.` : "No TTM flow is admitted for this window.";
  const tail = missing.length === 0 ? "" : ` Not established for this window: ${list(missing)}${withheld.length > 0 ? `, so ${list(withheld)} ${withheld.length === 1 ? "is" : "are"} withheld` : ""}.`;
  return `${head}${tail} Annual historical series remain separately labeled.`;
}

export function applyFinancialDiagnostics(report: Report, computed: ComputedMetrics, bundle?: DataBundle, options: {pendingVerification?:boolean; executiveEvidence?: ExecutiveDecisionEvidence} = {}): Report {
  const next = structuredClone(report);
  // structuredClone preserves internal aliases: grade keyNumbers may be the
  // same array as score.drivers. Diagnostic rows are not new grading signals.
  next.quality.graded.keyNumbers = [...next.quality.graded.keyNumbers];
  next.balanceSheet.coverage.numbers = [...next.balanceSheet.coverage.numbers];
  next.balanceSheet.debtProfile.numbers = [...next.balanceSheet.debtProfile.numbers];
  const current = computed.capital?.current;
  // D-287 review: the displayed historical series can contain unadjusted periods.
  if (computed.capital?.fcf?.series.some(row => row.stockBasedCompensation === null)) {
    for (const row of next.fundamentals.fcf) {
      const sources = row.values.map(point => point.value.source);
      if (sources.some(source => source === "computed.capital.fcf")) row.label = "Free cash flow (SBC deducted where disclosed; otherwise before SBC)";
      if (sources.some(source => source === "computed.capital.fcf.conversion")) row.label = "FCF conversion (SBC deducted where disclosed; otherwise before SBC / consolidated net income)";
    }
  }
  if (current && current.debtBridge.cashAndShortTermInvestments === null) {
    const gap = computed.gaps.find(gap => gap.field.startsWith(`statements.balance.${current.asOf}.`) &&
      (gap.field.endsWith(".shortTermInvestments") || gap.field.endsWith(".cashAndShortTermInvestments")));
    if (gap) next.balanceSheet.debtProfile.commentary.push({ label: "JUDGMENT", asOf: current.asOf,
      source: "computed.capital.current.debtBridge.cashAndShortTermInvestments.unavailable",
      text: `The complete cash and short-term investment total at ${current.asOf} is not established: the admitted evidence does not prove the investment scope and its separation from cash.` });
  }

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
      const source = field === "totalDebtIncludingLeases" && current.debtBridge.providerDebtPerimeterLabel
        ? "computed.current-capital.provider-debt-perimeter-includes-payables-to-third-party-loan-owners"
        : field.startsWith("filed") || field === "loanOwnerPayables" ? `computed.current-capital.${field.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}`
          : `computed.capital.current.debtBridge.${field}`;
      append(next.balanceSheet.debtProfile.numbers, numeric(source, value, "currency", current.asOf, current.currency));
    }
    for (const field of ["netDebtToEbitda", "interestCoverage", "fcfConversionBeforeSbc", "sbcPctOfFcf"] as const) {
      append(next.balanceSheet.coverage.numbers, numeric(`computed.capital.current.${field}`, current[field], field === "sbcPctOfFcf" ? "%" : "x", current.asOf, null, period));
    }
    // Method statements, not issuer facts: JUDGMENT (D-110).
    next.balanceSheet.coverage.commentary.push({ label: "JUDGMENT", source: "computed.capital.current", asOf: current.asOf,
      text: `Capital grading basis: ${period}. ${current.fallbackReason ?? trailingFlowStatement(current)} ${current.cashBridge.definition}` });
    next.balanceSheet.debtProfile.commentary.push({ label: "JUDGMENT", source: "computed.capital.current", asOf: current.asOf,
      text: [current.debtBridge.compositionNote, current.debtBridge.leaseScopeNote ?? "The debt bridge shows debt on the retained basis and the selected operating-lease basis, and offsets cash plus short-term investments. Vendor cash-only net debt is a separate convention. Undisclosed lease components are unavailable, not assumed zero.", current.debtBridge.leaseEvidenceNote]
        .filter((text): text is string => text !== undefined).join(" ") });
  }
  const concentration = current?.sbcConcentration;
  if (concentration) {
    const qualify = (value: unknown): void => {
      if (value === null || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        if (["text", "label", "basis", "reason"].includes(key) && typeof child === "string" &&
            (/(?:FCF|free cash flow).*after[ -]SBC|after[ -]SBC.*(?:FCF|free cash flow)|structurally negative/i.test(child)) && !child.includes(concentration.basis)) {
          (value as Record<string,unknown>)[key] = `${child} ${concentration.basis}`;
        } else if (typeof child === "object") qualify(child);
      }
    };
    qualify(next);
    const source = "computed.capital.current.sbcConcentration.runRateAfterSbc";
    if (!next.fundamentals.fcf.some(row => row.values.some(v => v.value.source === source))) {
      const value = numeric(source, concentration.runRateAfterSbc, "currency", current!.asOf, current!.currency,
        `run-rate companion; excludes quarter ending ${concentration.quarterEnd}; other three quarters x 4/3`)!;
      next.fundamentals.fcf.push({label:`After-SBC FCF run-rate companion. ${concentration.basis}`,values:[{period:"Run-rate companion (other three quarters x 4/3)",value}]});
    }
    if (!next.catalystsRisks.risks.some(r => reasoningClaims(r.reasoning).some(claim => claim.text.includes(concentration.basis)))) {
      next.catalystsRisks.risks.push({title:"SBC concentration in trailing cash flow",severity:"medium",probability:"unknown",source:"computed.capital.current.sbcConcentration",
        reasoning:[{label:"JUDGMENT",source:"computed.capital.current.sbcConcentration",asOf:current!.asOf,text:concentration.basis}]});
    }
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
  for (const note of beneish?.notes ?? []) addNote(note);
  if (notes.length > 0) {
    next.quality.notes = notes;
    // A report assembled before D-68 carried these as "low" flags; never both.
    next.quality.flags = next.quality.flags.filter((f) => !(f.source === "computed.forensics.accruals" && f.severity === "low" && notes.includes(f.text)));
  }
  // Final assembly and fallback assembly use the same retained tenure and
  // filing context as verification; neither trusts a model-authored reason.
  next.leadership = assessExecutiveEvidence(next.leadership,next.appendix.verificationLog ?? [],options.pendingVerification,
    options.executiveEvidence);
  if (bundle && !options.pendingVerification) applyFigureDefinitions(next, bundle, computed);
  return next;
}

/** D-292..D-295: code-owned definitions accompany both data-only and analyst figures. */
export function applyFigureDefinitions(report: Report, bundle: DataBundle, computed?: ComputedMetrics): void {
  if (report.scores) report.scores = structuredClone(report.scores); // break aliases with displayed key numbers
  const facts = confirmedIssuerFacts(bundle.symbol, bundle.edgar);
  const predecessor = bundle.edgar?.predecessor && facts ? { ...bundle.edgar.predecessor, continuity: successorContinuity(facts,bundle.edgar.predecessor.facts) !== null } : null;
  const rows = (kind: keyof Pick<DataBundle["statements"], "incomeAnnual" | "incomeQuarterly" | "balanceAnnual" | "balanceQuarterly" | "cashflowAnnual" | "cashflowQuarterly">): FmpStatementRow[] => {
    const result = bundle.statements?.[kind];
    return result?.ok ? result.value.data.rows : [];
  };
  const annualCash = rows("cashflowAnnual");
  const income = rows("incomeAnnual");
  const cashflow = [...rows("cashflowQuarterly"), ...annualCash];
  const balance = [...rows("balanceAnnual"), ...rows("balanceQuarterly")];
  const predecessorFor = (row: FmpStatementRow) => predecessorFactsFor(facts, predecessor,row.date ?? null, typeof row.reportedCurrency === "string" ? row.reportedCurrency : null,bundle.builtAt);
  const definition = (row: FmpStatementRow, field: string, groups: readonly (readonly string[])[], annual: boolean | "quarterly" = false): string[] => {
    if (typeof row[field] !== "number") return [];
    return row.fieldProvenance?.[field]?.tags ?? filedDefinitionMatches(facts, typeof row.reportedCurrency === "string" ? row.reportedCurrency : null,
      row.date ?? "", Number(row[field]), bundle.builtAt, groups, annual).concat(filedDefinitionMatches(predecessorFor(row),
      typeof row.reportedCurrency === "string" ? row.reportedCurrency : null,row.date ?? "",Number(row[field]),bundle.builtAt,groups,annual));
  };
  const quarterCapexByDate = new Map(rows("cashflowQuarterly").map(row => [row.date,capexDefinition(definition(row,"capitalExpenditure",CAPEX_DEFINITION_FAMILIES,"quarterly"))]));
  const capexByDate = new Map(cashflow.map(row => [row.date, capexDefinition(definition(row,"capitalExpenditure",CAPEX_DEFINITION_FAMILIES,true))]));
  const revenueByDate = new Map(income.map(row => [row.date, revenueDefinition(definition(row,"revenue",REVENUE_DEFINITION_FAMILIES,true)) ??
    annualRevenueDefinition(row,facts,bundle.builtAt) ?? annualRevenueDefinition(row,predecessorFor(row),bundle.builtAt)]));
  const cashByDate = new Map(balance.map(row => [row.date, liquidityDefinition(definition(row,"cashAndShortTermInvestments",LIQUIDITY_DEFINITION_FAMILIES))]));
  const investmentsByDate = new Map(balance.map(row => [row.date, investmentDefinition(definition(row,"longTermInvestments",INVESTMENT_DEFINITION_FAMILIES))]));
  const shareUnit = quotedShareUnit(bundle);
  const tangibleTtm = computed?.returns?.commonReturnTtm?.basis === "tangible-common-equity";
  const tangibleBook = report.routeMetrics?.route === "bank" || computed?.valuation?.kind === "excess-return" && computed.valuation.excessReturn.scenarioEvidence?.bookValueBasis === "tangible-common-equity";
  const bankTangibleSources = new Set([
    "computed.bank-capital-credit-and-funding.held-to-maturity-loss-after-tax-tangible-common-equity",
    "computed.bank-capital-credit-and-funding.tangible-common-equity-tangible-assets",
    "computed.bank-capital-credit-and-funding.tangible-common-equity-tangible-assets-with-held-to-maturity-losses-marked",
  ]);
  const capexSources = new Set(["computed.capital.capexIntensity","computed.capital.maintenanceVsGrowthCapex","computed.capital.fcf",
    "computed.capital.fcf.beforeSbc","computed.capital.fcf.conversion","computed.capital.fcf.conversionBeforeSbc",
    "computed.capital-cash.capex-revenue-latest","computed.capital-cash.capex-revenue-slope","computed.capital-cash.capex-d-a-latest",
    "computed.capital-cash.latest-fcf-after-sbc-house-default","computed.growth.fcfCagrs"]);
  const currentCapexSources = new Set(["computed.capital.current.cashBridge.cashCapitalExpenditure","computed.capital.current.cashBridge.standardizedFcf",
    "computed.capital.current.cashBridge.afterSbcStandardizedFcf","computed.capital.current.cashBridge.leaseAdjustedFcf",
    "computed.current-capital.cash-capital-expenditure","computed.current-capital.standardized-fcf","computed.current-capital.after-sbc-standardized-fcf","computed.current-capital.lease-adjusted-fcf"]);
  const quarterlyFcf = /^computed\.quarterly-trend\.free-cash-flow-operating-cash-flow-less-capex-quarter-ended-\d{4}-\d{2}-\d{2}$/;
  const capexBasis = (n: TracedNumber,date: string): string => {
    if (currentCapexSources.has(n.source) && computed?.capital?.current?.basis === "ttm") {
      const start = computed.capital.current.periodStart;
      const dates = [...quarterCapexByDate.keys()].filter((d):d is string => !!d && !!start && d > start && d <= date);
      return dates.length === 4 ? sharedCapexDefinition(dates.map(d=>quarterCapexByDate.get(d))) : sharedCapexDefinition([]);
    }
    if (quarterlyFcf.test(n.source) || /^payload\.statements\.cash-flow-quarterly\./.test(n.source)) return quarterCapexByDate.get(date) ?? "Cash-spending definition is not established for this period.";
    const years = /^(\d+)y$/.exec(n.period ?? ""), average = /, (\d+)y average$/.exec(n.period ?? "");
    if (n.source === "computed.growth.fcfCagrs" && !years ||
        n.source === "computed.capital.maintenanceVsGrowthCapex" && !average && n.period !== "capex / D&A, latest" ||
        n.source === "computed.capital.capexIntensity" && !/^\d{4}-\d{2}-\d{2}$/.test(n.period ?? "") &&
          n.period !== "capex / revenue, latest" && n.period !== "capex / revenue slope") return sharedCapexDefinition([]);
    if (years || average || n.source === "computed.capital-cash.capex-revenue-slope" || n.period === "capex / revenue slope") {
      const annualDates = annualCash.map(r=>r.date).filter((d):d is string => !!d && d <= date).sort().reverse();
      const dates = average ? annualDates.slice(0,Number(average[1])) : years ? annualDates.filter(d=>Number(d.slice(0,4)) >= Number(date.slice(0,4))-Number(years[1]))
        : computed?.capital?.capexIntensity.series.map(r=>r.date) ?? annualDates.slice(0,5);
      if (years && dates.length < Number(years[1])+1 || average && dates.length < Number(average[1])) return sharedCapexDefinition([]);
      return sharedCapexDefinition(dates.map(d=>capexByDate.get(d)));
    }
    return capexByDate.get(date) ?? "Cash-spending definition is not established for this period.";
  };
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    const obj = value as Record<string, unknown>;
    if (typeof obj.value === "number" && typeof obj.source === "string" && typeof obj.unit === "string" && "verified" in obj) {
      const n = obj as TracedNumber;
      const source = n.source, statement = /^payload\.statements\.(income-statement|cash-flow|balance-sheet)-(annual|quarterly)\.(\d{4}-\d{2}-\d{2})\.(.+)$/.exec(source);
      const date = statement?.[3] ?? n.asOf ?? "";
      delete n.definition;
      const notes: string[] = [];
      const add = (text: string | null | undefined) => { if (text && !notes.includes(text)) notes.push(text); };
      if (capexSources.has(source) || currentCapexSources.has(source) || quarterlyFcf.test(source) || statement?.[1] === "cash-flow" && ["capex-negative","free-cash-flow"].includes(statement[4]!)) add(capexBasis(n,date));
      if (statement?.[1] === "income-statement" && statement[2] === "annual" && statement[4] === "revenue") add(revenueByDate.get(date));
      if (["computed.capital.current.debtBridge.cashAndShortTermInvestments","computed.current-capital.cash-and-short-term-investments"].includes(source) || statement?.[4] === "cash-sti") add(cashByDate.get(date));
      if (statement?.[4] === "long-term-investments") add(investmentsByDate.get(date));
      if (["computed.capital.current.debtBridge.totalDebtIncludingLeases","computed.current-capital.total-debt-including-leases"].includes(source) || statement?.[4] === "total-debt") {
        const current = computed?.capital?.current;
        const currentSource = source === "computed.capital.current.debtBridge.totalDebtIncludingLeases" || source === "computed.current-capital.total-debt-including-leases";
        if (currentSource && current?.asOf === date && current.debtBridge.totalDebtIncludingLeases === n.value) {
          add(current.debtBridge.debtDefinition ?? "lease treatment not established from the filing");
        } else {
          const row = balance.find(r=>r.date === date && r.totalDebt === n.value);
          if (row) add(debtCompositionDefinition(row) ?? "lease treatment not established from the filing");
        }
      }
      if (/^computed\.scores\.moat\.rote(?:Level|Floor)$/.test(source) || source === "computed.returns.rote" || tangibleTtm && ["computed.returns.commonReturnTtm","computed.returns.rote-trailing-four-quarters"].includes(source) || bankTangibleSources.has(source)) add(MODEL_TANGIBLE_COMMON_BASIS);
      if (shareUnit && statement?.[1] === "income-statement" && ["diluted-shares","basic-shares","shares-outstanding"].includes(statement[4]!)) add("ADS-equivalent shares");
      if (notes.length) n.definition = notes.join("; ");
    }
    for (const [key,child] of Object.entries(obj)) if (key !== "scores" && typeof child === "object") visit(child);
  };
  visit(report);
  for (const aspect of Object.values(report.scores?.aspects ?? {})) visit(aspect.drivers);
  if (shareUnit && report.marketData?.shares) report.marketData.shares.shareUnit = shareUnit;
  const bridge = report.valuation.dcf.bridge;
  if (bridge) {
    if (shareUnit) bridge.shareUnit = shareUnit;
    const balanceRow = balance.find(row=>row.date === bridge.asOf);
    if (balanceRow && definition(balanceRow,"minorityInterest",MINORITY_DEFINITION_FAMILIES).length) bridge.minorityInterestDefinition = REDEEMABLE_MINORITY_DEFINITION;
    const investment = investmentsByDate.get(bridge.asOf ?? "");
    if (investment) for (const component of bridge.nonOperatingComponents ?? [])
      if (component.label === "long-term investments (filed carrying value)") component.label = investment;
  }
  if (tangibleBook) {
    if (report.fairValue?.method === "excess-return" && !report.fairValue.basis.includes(MODEL_TANGIBLE_COMMON_BASIS)) report.fairValue.basis.push(MODEL_TANGIBLE_COMMON_BASIS);
    const keys = new Set(["pTbv","rote","justifiedPTbv","tangibleLeverage","htmLossToTce","markedTceRatio"]);
    for (const metric of report.routeMetrics?.metrics ?? []) if (keys.has(metric.key) && !metric.basis.includes(MODEL_TANGIBLE_COMMON_BASIS)) metric.basis += ` ${MODEL_TANGIBLE_COMMON_BASIS}`;
  }
  for (const assumption of report.valuation.dcf.assumptions) {
    if (assumption.name === "sales-to-capital" && bridge) {
      for (const text of [investmentsByDate.get(bridge.asOf ?? ""),cashByDate.get(bridge.asOf ?? "")])
        if (text && !assumption.basis.includes(text)) assumption.basis += `; ${text}`;
    }
    if (assumption.name === "start revenue" && computed?.valuation?.kind === "dcf" && computed.valuation.assumptions?.forecastPeriod?.basis === "fiscal-year") {
      const basis = [...revenueByDate.entries()].find(([date])=>!!date && assumption.basis.includes(date))?.[1];
      if (basis && !assumption.basis.includes(basis)) assumption.basis += `; ${basis}`;
    }
  }
}
