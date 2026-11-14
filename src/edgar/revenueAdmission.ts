import { CORE_FACT_FORMS, conceptFactsSchema, parseFactPoints, type CompanyFacts } from "./xbrl";
import { BROAD_REVENUE_TOTAL_TAGS, CONTRACT_REVENUE_TAGS, NONSERVICE_BENEFIT_EXPENSE_TAG, GROSS_PROFIT_COST_TAGS, GROSS_PROFIT_REVENUE_TAGS, REGULATED_OPERATING_REVENUE_TAG, REVENUE_TAGS, REVENUE_COMPONENT_TAGS, INTEREST_EXPENSE_STAND_INS, TOTAL_INCOME_EXPENSE_TAGS, tagsFor } from "./tagSynonyms";
import { completeOperatingBridge, operatingBridgeProof, completeRevenueLine, filedRevenueLines, hasGrossRevenueBridge, hasOperatingRevenueBridge, preferredRevenueLine, sameIncomeScope } from "./revenuePresentation";
import { vendorAgreesWithFiled } from "./vendorAgreement";
import type { FiledIncomeLine, FmpIncomeStatementRow, FmpPayload, StatementFieldConflict, StatementFieldProvenance } from "@/providers/fmp";
import type { ManifestEntry } from "@/types/core";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The retained observation must be one row of this exact provider statement. */
export function retainedIncomeRows(payload: FmpPayload<FmpIncomeStatementRow>, row: FmpIncomeStatementRow, cik: number): FmpIncomeStatementRow[] {
  return Array.isArray(payload.raw) ? payload.raw.filter((raw): raw is FmpIncomeStatementRow => raw !== null && typeof raw === "object").filter(raw =>
    raw.date === row.date && raw.reportedCurrency === row.reportedCurrency && Number(raw.cik) === cik &&
    raw.period === row.period && raw.fiscalYear === row.fiscalYear && raw.filingDate === row.filingDate &&
    (raw.periodStart == null || row.periodStart == null || raw.periodStart === row.periodStart)) : [];
}

/** A raw provider row may replace a prior SEC substitution only when its
 * revenue has an actual filed observation. An unmatched note cannot revoke an
 * independently admitted filed row merely because the raw provider differs. */
function hasFiledProviderRevenue(row: FmpIncomeStatementRow, filed: FmpIncomeStatementRow, facts: CompanyFacts, cutoff: string): boolean {
  if (!finite(row.revenue)) return false;
  return [...REVENUE_TAGS,...BROAD_REVENUE_TOTAL_TAGS].some(tag=>{
    const parsed=conceptFactsSchema.safeParse(facts.facts["us-gaap"]?.[tag]);
    const points = parsed.success ? parseFactPoints(parsed.data.units[row.reportedCurrency ?? ""] ?? []).filter(p=>
      p.end===row.date&&p.start!==undefined&&p.filed<=cutoff&&CORE_FACT_FORMS.has(p.form)&&
      (filed.periodStart!=null ? p.start===filed.periodStart :
        (Date.parse(p.end)-Date.parse(p.start))/86400000 >= (row.period==="FY"?300:60)&&
        (Date.parse(p.end)-Date.parse(p.start))/86400000 <= (row.period==="FY"?400:100))) : [];
    const latest = points.map(p=>p.filed).sort().at(-1);
    return points.some(p=>p.filed===latest&&vendorAgreesWithFiled(row.revenue!,p.val));
  });
}

/** Re-run the current admission from the exact retained provider observation
 * when an older pipeline substituted a whole SEC income row. Keep independent
 * refusals; the normal monetary and share guards run again on this view. */
export function replayIncomeObservations(payload: FmpPayload<FmpIncomeStatementRow>, cik: number, facts?: CompanyFacts, cutoff?: string): FmpPayload<FmpIncomeStatementRow> {
  return { ...payload, rows: payload.rows.map(row => {
    if (row.source !== "edgar") return row;
    const raw = retainedIncomeRows(payload,row,cik);
    if (raw.length !== 1 || facts && !hasFiledProviderRevenue(raw[0]!,row,facts,cutoff ?? row.filingDate ?? "0000-01-01")) return row;
    const restored: FmpIncomeStatementRow = { ...row, source:raw[0]!.source ?? "fmp", fieldProvenance:{...row.fieldProvenance},
      operatingBasisReview: true };
    if (finite(row.operatingIncome) && row.fieldConflicts?.operatingIncome?.usable !== false && row.fieldProvenance?.operatingIncome) {
      restored.nonMarginOperatingIncome=row.operatingIncome;
      restored.fieldProvenance!.nonMarginOperatingIncome=row.fieldProvenance.operatingIncome;
    }
    for (const field of ["revenue","costOfRevenue","grossProfit","operatingIncome","operatingExpenses"]) {
      // Earnings, EPS and shares retain their independent filed admission.
      if (row.fieldConflicts?.[field]?.usable === false) continue;
      restored[field]=raw[0]![field];
      delete restored.fieldProvenance![field];
    }
    return restored;
  }) };
}

export function providerIncomeValue(row: FmpIncomeStatementRow, raw: readonly FmpIncomeStatementRow[], field: string): number | null {
  const values = raw.map(r => r[field]).filter(finite);
  if (values.length && values.every(v => v === values[0])) return values[0]!;
  const observed = row.fieldConflicts?.[field]?.vendorValue;
  return finite(observed) ? observed : finite(row[field]) ? row[field] : null;
}

/** Old source refusals are reconsidered from their evidence, never their wording. */
function reconsiderable(conflict: StatementFieldConflict | undefined, lines: readonly FiledIncomeLine[]): boolean {
  return conflict?.usable !== false || conflict.cause === "revenue-scope" || !!conflict.secEvidence ||
    conflict.vendorValue !== null && lines.some(l => vendorAgreesWithFiled(l.value, conflict.vendorValue!)) ||
    conflict.secValue !== null && lines.some(l => vendorAgreesWithFiled(l.value, conflict.secValue!));
}

function totalLine(line: FiledIncomeLine, candidates: readonly FiledIncomeLine[], lines: Readonly<Record<string, FiledIncomeLine>>): boolean {
  const tags = line.proof.tags.map(t => t.replace(/^us-gaap\//, ""));
  if (tags.includes("SalesRevenueNet") && candidates.some(c=>sameIncomeScope(line.proof,c.proof)&&c.value>line.value&&
      c.proof.tags.some(t=>t==="us-gaap/Revenues"||t===`us-gaap/${REGULATED_OPERATING_REVENUE_TAG}`)) &&
      !hasOperatingRevenueBridge(line,lines) && !hasGrossRevenueBridge(line,lines)) return false;
  return line.role === "operating-sales" || tags.some(t => BROAD_REVENUE_TOTAL_TAGS.some(tag => tag === t)) ||
    REVENUE_COMPONENT_TAGS.every(t => tags.includes(t));
}

function ambiguousRevenue(line: FiledIncomeLine, facts: CompanyFacts, scope: "annual" | "quarter", all: Record<string, FiledIncomeLine>): boolean {
  for (const tag of line.proof.tags) {
    const [ns, name] = tag.split("/");
    const parsed = conceptFactsSchema.safeParse(facts.facts[ns!]?.[name!]);
    if (!parsed.success) continue;
    const points = parseFactPoints(parsed.data.units[line.proof.unit] ?? []);
    const observed = points.filter(p => p.start === line.proof.periodStart && p.end === line.proof.periodEnd &&
      line.proof.filings.some(f => f.accn === p.accn && f.filed === p.filed && f.form === p.form));
    if (new Set(observed.map(p => p.val)).size > 1) return true;
    const annualCopy = scope === "quarter" && !line.proof.derivation && points.some(p => p.end === line.proof.periodEnd && p.start &&
      Date.parse(p.end) - Date.parse(p.start) >= 300 * 86400000 && p.val === line.value);
    if (annualCopy && !Object.values(all).some(g => g.proof.tags.includes("us-gaap/GrossProfit") && sameIncomeScope(g.proof, line.proof) &&
      Object.values(all).some(c => c.proof.tags.some(t => t === "us-gaap/CostOfRevenue" || t === "us-gaap/CostOfGoodsAndServicesSold") &&
        sameIncomeScope(c.proof, line.proof) && Math.abs(g.value + c.value - line.value) <= 1))) return true;
  }
  return false;
}

export interface OperatingRevenuePolicy { sales: boolean; salesTags: readonly string[] }

/** Select the company's operating line before resolving individual periods.
 * A primary sales reconciliation or a corroborated net-sales presentation
 * establishes sales; equal filed revenue concepts inherit that same scope.
 * A broadly named concept is not necessarily broader income. A matching
 * primary statement can prove it is sales, unless another retained primary
 * presentation demonstrates a different scope for that concept. */
export function operatingRevenuePolicy(rows: readonly FmpIncomeStatementRow[]): OperatingRevenuePolicy {
  let sales = false;
  const salesTags = new Set<string>(["SalesRevenueNet"]);
  const corroboratedBroadTags = new Set<string>();
  const contradictedBroadTags = new Set<string>();
  for (const row of rows) {
    const lines = row.filedIncomeLines ?? {}, candidates = filedRevenueLines(lines);
    const net = lines["SalesRevenueNet"];
    const basis = Object.values(lines).find(l=>l.role==="operating-sales") ??
      (net && (hasGrossRevenueBridge(net,lines)||hasOperatingRevenueBridge(net,lines)) && completeRevenueLine(net,candidates,lines) &&
        candidates.some(l=>l.value>net.value&&!vendorAgreesWithFiled(l.value,net.value)) ? net : undefined);
    if (!basis) continue;
    sales = true;
    for (const tag of CONTRACT_REVENUE_TAGS) {
      const contract = lines[tag];
      if (contract && sameIncomeScope(basis.proof,contract.proof) && vendorAgreesWithFiled(basis.value,contract.value)) salesTags.add(tag);
    }
    for (const tag of BROAD_REVENUE_TOTAL_TAGS) {
      const total = lines[tag];
      if (!total || !sameIncomeScope(basis.proof, total.proof)) continue;
      if (!vendorAgreesWithFiled(basis.value, total.value)) { contradictedBroadTags.add(tag); continue; }
      const primary = row.primaryIncomeProof;
      // A sales/other-income bridge can net to the same total by coincidence.
      // Only a bound, complete primary sales statement proves concept scope;
      // its actual document must be the same filing as the corroborating fact.
      if (primary && !primary.superseded && !primary.components.some(c => c.role === "income-total") &&
          vendorAgreesWithFiled(primary.revenue, basis.value) && sameIncomeScope(primary.proof, basis.proof) &&
          primary.proof.calculation === "complete-operating-reconciliation" && primary.proof.documents?.length &&
          primary.proof.documents.every(d => primary.proof.filings.some(f => f.accn === d.accession && f.filed === d.filed && f.form === d.form))) corroboratedBroadTags.add(tag);
    }
  }
  for (const tag of corroboratedBroadTags) if (!contradictedBroadTags.has(tag)) salesTags.add(tag);
  return {sales,salesTags:[...salesTags]};
}

export interface RevenueAdmission {
  row: FmpIncomeStatementRow;
  evidence: FmpIncomeStatementRow;
  handled: boolean;
  changed?: boolean;
  gaps: ManifestEntry[];
}

/** A numerator may use any eligible filed corroboration of the one admitted
 * revenue amount. Unadmitted totals and other periods or currencies cannot. */
function isAdmittedRevenueBasis(row: FmpIncomeStatementRow, proof: StatementFieldProvenance): boolean {
  const revenue=row.fieldProvenance?.revenue;
  if (!revenue || !finite(row.revenue)) return false;
  const derivedOnRevenue = proof.derivation && proof.unit === revenue.unit && proof.periodStart === revenue.periodStart &&
    proof.periodEnd === revenue.periodEnd && proof.filings.every(f=>CORE_FACT_FORMS.has(f.form)) &&
    revenue.filings.length > 0 && revenue.filings.every(f=>proof.filings.some(p=>p.accn===f.accn&&p.filed===f.filed&&p.form===f.form));
  return !!derivedOnRevenue || sameIncomeScope(revenue,proof) || Object.values(row.filedIncomeLines ?? {}).some(l=>
    l.role==="admitted-revenue" && vendorAgreesWithFiled(l.value,row.revenue!) &&
    l.proof.unit===revenue.unit && l.proof.periodStart===revenue.periodStart && l.proof.periodEnd===revenue.periodEnd &&
    sameIncomeScope(l.proof,proof));
}

export function admitRevenueGrossProfit(row: FmpIncomeStatementRow, sec: FmpIncomeStatementRow,
  raw: readonly FmpIncomeStatementRow[], alternatives: readonly FmpIncomeStatementRow[] = []): FmpIncomeStatementRow {
  const observed = providerIncomeValue(row, raw, "grossProfit");
  const revenue = row.fieldProvenance?.revenue;
  if (!revenue || !finite(row.revenue) || observed === null) return row;
  sec = [sec,...alternatives].find(source=>source.fieldConflicts?.grossProfit?.usable !== false && finite(source.grossProfit) && vendorAgreesWithFiled(observed,source.grossProfit) &&
    source.fieldProvenance?.grossProfit?.tags.includes("us-gaap/GrossProfit") && isAdmittedRevenueBasis(row,source.fieldProvenance.grossProfit)) ?? sec;
  const cost = sec.fieldProvenance?.costOfRevenue;
  const grossProof = sec.fieldProvenance?.grossProfit;
  const direct = sec.fieldConflicts?.grossProfit?.usable !== false && (grossProof?.tags.includes("us-gaap/GrossProfit") || sec.primaryIncomeProof?.grossProfit!==undefined) && grossProof && isAdmittedRevenueBasis(row,grossProof) ? grossProof : undefined;
  const proof = direct ?? (revenue.tags.some(t=>GROSS_PROFIT_REVENUE_TAGS.some(tag=>t===`us-gaap/${tag}`)) &&
    cost && (cost.tags.some(t => GROSS_PROFIT_COST_TAGS.some(tag => t === `us-gaap/${tag}`)) || sec.primaryIncomeProof?.costOfRevenue!==undefined) && sameIncomeScope(revenue, cost) && finite(sec.costOfRevenue)
    ? { ...revenue, tags: [...revenue.tags, ...cost.tags], calculation: "revenue-minus-cost" as const } : null);
  const value = proof === null ? null : direct ? sec.grossProfit : finite(sec.costOfRevenue) ? row.revenue - sec.costOfRevenue : null;
  const usable = proof !== null && finite(value) && vendorAgreesWithFiled(observed, value);
  const reason = usable ? "Gross profit is corroborated on the same filed operating-revenue presentation." :
    "Gross profit withheld: the filed operating-revenue presentation has no compatible full gross-profit or cost basis.";
  return { ...row, grossProfit: usable ? observed : undefined,
    ...(usable ? { fieldProvenance: { ...row.fieldProvenance, grossProfit: proof! } } : {}),
    fieldConflicts: { ...row.fieldConflicts, grossProfit: { usable, vendorValue: observed, secValue: finite(value) ? value : null,
      ...(proof ? { secEvidence: proof } : {}), ...(usable ? { resolution: "filed-family" as const } : {}), reason } },
    grossProfitRatio: null, grossProfitMargin: null };
}

/**
 * P11 (D-226): the refused revenue conflict kept with the "Revenue scope unresolved" sentence. Every
 * other property of the refusal it replaces is kept, in place. This writer establishes a revenue-scope
 * refusal, so it keeps `revenue-scope` and nothing else: any other code goes with the old sentence, so
 * a code never sits beside a sentence it was not written with. A refusal without a code stays without
 * one; a code is never added here (D-226 records why).
 */
function revenueScopeUnresolved(conflict: StatementFieldConflict, reason: string): StatementFieldConflict {
  const kept: StatementFieldConflict = { ...conflict, reason };
  if (kept.cause !== undefined && kept.cause !== "revenue-scope") delete kept.cause;
  return kept;
}

export function admitRevenue(row: FmpIncomeStatementRow, current: FmpIncomeStatementRow, originals: readonly FmpIncomeStatementRow[],
  payload: FmpPayload<FmpIncomeStatementRow>, facts: CompanyFacts, scope: "annual" | "quarter", policy?: OperatingRevenuePolicy): RevenueAdmission {
  const raw = retainedIncomeRows(payload, row, facts.cik);
  const vendor = providerIncomeValue(row, raw, "revenue");
  const primary = current.primaryIncomeProof;
  if (primary && !primary.superseded && primary.proof.unit === row.reportedCurrency && primary.periodEnd === row.date &&
      (row.periodStart == null || row.periodStart === primary.proof.periodStart) &&
      (row.fieldConflicts?.revenue?.usable !== false || row.fieldConflicts.revenue.cause === "revenue-scope" || row.fieldConflicts.revenue.secEvidence)) {
    const reason = "Revenue follows the complete duration-bound consolidated primary income statement; its later comparative supersedes incompatible older concepts.";
    return { row: { ...row, revenue: primary.revenue, primaryIncomeProof: primary, filedIncomeLines: current.filedIncomeLines,
      fieldProvenance: { ...row.fieldProvenance, revenue: primary.proof },
      fieldConflicts: { ...row.fieldConflicts, revenue: { usable: true, resolution: "filed-line", vendorValue: vendor, secValue: primary.revenue, secEvidence: primary.proof, reason } } },
      evidence: current, handled: true, changed: vendor !== primary.revenue,
      gaps: vendor === primary.revenue ? [] : [{field:`statements.income.${row.date}.revenue`,severity:"info",reason}] };
  }
  const sources = [current, ...originals];
  const observations = sources.flatMap(source => {
    const lines = source.filedIncomeLines ?? {};
    const fallback: FiledIncomeLine[] = finite(source.revenue) && source.fieldProvenance?.revenue ? [{ value: source.revenue, proof: source.fieldProvenance.revenue }] : [];
    const all = filedRevenueLines(lines);
    return (all.length ? all : fallback).filter(l => l.value > 0 && l.proof.unit === row.reportedCurrency &&
      l.proof.periodEnd === row.date && (row.periodStart == null || l.proof.periodStart === row.periodStart) &&
      completeRevenueLine(l, all, lines)).map(line => ({ line, source }));
  });
  const latestFiling = (line: FiledIncomeLine) => Math.max(...line.proof.filings.map(f => Date.parse(f.filed)));
  // A later core filing of the same duration and concept supersedes the old
  // perimeter even when the vendor still matches the obsolete observation.
  const candidates = observations.filter(({line}) => !observations.some(({line:later}) =>
    later.proof.unit === line.proof.unit && later.proof.periodStart === line.proof.periodStart &&
    later.proof.periodEnd === line.proof.periodEnd && later.role === line.role &&
    [...later.proof.tags].sort().join(",") === [...line.proof.tags].sort().join(",") &&
    !vendorAgreesWithFiled(later.value,line.value) &&
    latestFiling(later) > latestFiling(line)));
  const unchanged = { row, evidence: current, handled: false, gaps: [] };
  const boundRegulatedTotal = vendor !== null && candidates.some(c => c.line.proof.tags.includes(`us-gaap/${REGULATED_OPERATING_REVENUE_TAG}`) && vendorAgreesWithFiled(vendor, c.line.value));
  const reconstructedMatch = scope === "quarter" && vendor !== null && candidates.some(c =>
    c.line.proof.derivation && vendorAgreesWithFiled(vendor, c.line.value));
  if (row.filingDate && !originals.length && !boundRegulatedTotal && !reconstructedMatch && !candidates.some(c => c.line.proof.filings.some(f => f.filed === row.filingDate))) return unchanged;
  if (!candidates.length || !reconsiderable(row.fieldConflicts?.revenue, candidates.map(c => c.line))) return unchanged;
  const eligible = policy?.sales ? candidates.filter(c=>c.line.role==="operating-sales" ||
    c.line.proof.tags.some(t=>policy.salesTags.includes(t.replace(/^us-gaap\//,"")))) : candidates;
  const operating = policy?.sales ? candidates.filter(c=>(hasOperatingRevenueBridge(c.line,c.source.filedIncomeLines ?? {})||hasGrossRevenueBridge(c.line,c.source.filedIncomeLines ?? {}))) : [];
  const scoped = policy?.sales ? [...eligible,...operating.filter(c=>!eligible.includes(c))] : candidates;
  if (policy?.sales && scoped.length===0) {
    const reason = "Revenue withheld: the company's operating-sales basis is established, but this period has no corroborated sales line; a broader income total cannot replace it.";
    return {row:{...row,revenue:undefined,operatingBasisReview:true,
      filedIncomeLines:current.filedIncomeLines,fieldConflicts:{...row.fieldConflicts,revenue:{usable:false,cause:"revenue-scope",vendorValue:vendor,secValue:current.revenue??null,reason}}},
      evidence:current,handled:true,changed:true,gaps:[{field:`statements.income.${row.date}.revenue`,reason,severity:"warn"}]};
  }
  const matching = vendor === null ? [] : scoped.filter(c => vendorAgreesWithFiled(vendor, c.line.value));
  // An unmatched note is not authority to replace the provider's complete line.
  const choices = matching.length ? matching : scoped.filter(c => policy?.sales || totalLine(c.line,scoped.map(c=>c.line),c.source.filedIncomeLines??{}));
  const preferred = preferredRevenueLine(filedRevenueLines(current.filedIncomeLines ?? {}), current.filedIncomeLines ?? {});
  const selected = choices.sort((a, b) => {
    // Matching values keep the provider amount. Bind its corroboration to the
    // latest compatible filing rather than moving the operating filing basis.
    if (matching.length) return latestFiling(b.line) - latestFiling(a.line);
    if (a.line === preferred) return -1;
    if (b.line === preferred) return 1;
    return latestFiling(b.line) - latestFiling(a.line);
  })[0];
  if (!selected) {
    const note = candidates.find(c => c.line.proof.tags.every(t => CONTRACT_REVENUE_TAGS.some(tag => t === `us-gaap/${tag}`)));
    if (!note || row.fieldConflicts?.revenue?.usable !== false) return unchanged;
    const reason = "Revenue scope unresolved: the contract-revenue fact is not established as consolidated operating revenue; a complete same-period operating line is required.";
    return { row: { ...row, fieldConflicts: { ...row.fieldConflicts, revenue: revenueScopeUnresolved(row.fieldConflicts.revenue, reason) } },
      evidence: current, handled: true, gaps: [{ field: `statements.income.${row.date}.revenue`, reason, severity: "info" }] };
  }
  const { line, source } = selected;
  const evidence = { ...source, revenue: line.value, fieldProvenance: { ...source.fieldProvenance, revenue: line.proof } };
  const invalid = ambiguousRevenue(line, facts, scope, source.filedIncomeLines ?? {});
  const value = invalid ? null : matching.length && vendor !== null ? vendor : line.value;
  const reason = invalid ? "Revenue withheld: the filed observations conflict or the alleged quarter duplicates a full-year amount." :
    matching.length ? "Operating revenue follows the provider line corroborated by a filed revenue line." :
      "Operating revenue uses the latest supported filed presentation; the provider observation does not reconcile to that line.";
  const changed = !finite(row.revenue) || value === null || !vendorAgreesWithFiled(row.revenue, value) || row.fieldConflicts?.revenue?.usable === false ||
    boundRegulatedTotal;
  const reviewRequired = changed || row.operatingBasisReview === true || finite(current.revenue) && !vendorAgreesWithFiled(line.value, current.revenue);
  const preserveFiledPair = standaloneFiledOperatingIncome(row) !== null && sameIncomeScope(row.fieldProvenance?.revenue,row.fieldProvenance?.operatingIncome) &&
    !sameIncomeScope(line.proof,row.fieldProvenance?.operatingIncome);
  const preserveOperating = preserveFiledPair || reviewRequired && row.fieldConflicts?.operatingIncome?.usable !== false && finite(row.operatingIncome) &&
    (row.fieldConflicts?.revenue?.usable === false || row.fieldProvenance?.revenue === undefined);
  const out = { ...row, operatingBasisReview: reviewRequired, ...(preserveOperating ? {nonMarginOperatingIncome:row.nonMarginOperatingIncome ?? row.operatingIncome} : {}), revenue: value ?? undefined, filedIncomeLines: { ...source.filedIncomeLines,
      ...Object.fromEntries(choices.filter(c=>value!==null&&vendorAgreesWithFiled(c.line.value,value)).map((c,i)=>
        [`revenue-corroboration-${i}`,{...c.line,role:"admitted-revenue" as const}])) },
    fieldProvenance: { ...row.fieldProvenance, revenue: line.proof },
    fieldConflicts: { ...row.fieldConflicts, revenue: { usable: value !== null, cause: "revenue-scope" as const,
      resolution: matching.length ? "filed-line" as const : "filed-family" as const,
      vendorValue: vendor, secValue: line.value, secEvidence: line.proof, reason } },
    ...(changed ? { grossProfitRatio: null, grossProfitMargin: null, operatingIncomeRatio: null, netIncomeRatio: null, incomeBeforeTaxRatio: null, netProfitMargin: null } : {}) };
  return { row: out, evidence, handled: true, changed, gaps: changed ? [{ field: `statements.income.${row.date}.revenue`, reason, severity: invalid ? "warn" : "info", expected: !invalid }] : [] };
}

/** A directly filed result remains a standalone figure when a revenue-only
 * pass changes its filing basis. This does not establish a margin. */
export function standaloneFiledOperatingIncome(row: FmpIncomeStatementRow, period?: Pick<StatementFieldProvenance,"unit"|"periodStart"|"periodEnd">): {value:number;proof:StatementFieldProvenance}|null {
  const proof=row.fieldProvenance?.operatingIncome;
  const unit=period?.unit ?? row.reportedCurrency,end=period?.periodEnd ?? row.date,start=period?.periodStart ?? row.periodStart;
  return finite(row.operatingIncome)&&row.fieldConflicts?.operatingIncome?.usable!==false&&proof?.source==="edgar"&&
    proof.tags.includes("us-gaap/OperatingIncomeLoss")&&proof.filings.length>0&&proof.filings.every(f=>CORE_FACT_FORMS.has(f.form))&&
    proof.unit===unit&&proof.periodEnd===end&&proof.periodStart!==null&&(start==null||proof.periodStart===start)
    ? {value:row.operatingIncome,proof} : null;
}

export function operatingMarginRefusal(row: Pick<FmpIncomeStatementRow,"fieldProvenance">): string {
  return row.fieldProvenance?.operatingIncome || row.fieldProvenance?.nonMarginOperatingIncome ?
    "Operating margin withheld: revenue uses a different filing basis; the prior filed operating result remains available for non-margin measures." :
    "Operating margin withheld: the provider operating result has no corroborated bridge on the admitted revenue basis; it remains an unverified observation for non-margin measures.";
}

/** A shortcut using cash paid or disagreeing interest concepts is not an
 * untested consolidated operating observation eligible for standalone use. */
export function operatingDerivationRefusal(row: FmpIncomeStatementRow, proof: StatementFieldProvenance | undefined): string | null {
  if(!proof || proof.tags.includes("us-gaap/OperatingIncomeLoss") || proof.calculation==="complete-operating-reconciliation") return null;
  if(proof.tags.some(t=>INTEREST_EXPENSE_STAND_INS.some(s=>t===`us-gaap/${s.tag}`))) return "Derived operating income withheld: cash interest paid is not accrued income-statement interest and cannot establish a margin, standalone or WACC operating operand.";
  const interest=Object.values(row.filedIncomeLines ?? {}).filter(l=>sameIncomeScope(proof,l.proof) &&
    l.proof.tags.some(t=>tagsFor("interestExpense").includes(t.replace(/^us-gaap\//,""))));
  return interest.some(a=>interest.some(b=>!vendorAgreesWithFiled(a.value,b.value)))
    ? "Derived operating income withheld: same-period filed interest concepts have incompatible scopes; selecting one without a complete consolidated reconciliation cannot establish a standalone or WACC operating operand." : null;
}

/** The ordinary numerator is margin-safe; an untested standalone observation
 * has no second revenue denominator and cannot become a margin accidentally. */
export function corroborateOperatingIncome(row: FmpIncomeStatementRow, sec: FmpIncomeStatementRow): FmpIncomeStatementRow {
  const primary = sec.primaryIncomeProof;
  if (primary && !primary.superseded && row.revenue === primary.revenue && sameIncomeScope(row.fieldProvenance?.revenue,primary.proof) &&
      row.fieldConflicts?.revenue?.usable !== false &&
      (row.fieldConflicts?.operatingIncome?.usable !== false || ["operating-basis","operating-scope"].includes(row.fieldConflicts.operatingIncome.cause ?? ""))) {
    const reason = `Operating income follows the complete consolidated primary statement, reconciled to pretax income${primary.roundingResidual ? ` with a printed-unit rounding residual of ${primary.roundingResidual} ${primary.proof.unit}` : " exactly"}; all operating components are included before normalization. ${primary.proof.documents!.map(d=>`${d.form} ${d.accession} filed ${d.filed}`).join("; ")}.`;
    return {...row,operatingIncome:primary.operatingIncome,nonMarginOperatingIncome:undefined,waccOperatingIncome:undefined,operatingIncomeBasis:reason,
      primaryIncomeProof:primary,fieldProvenance:{...row.fieldProvenance,operatingIncome:primary.proof},
      fieldConflicts:{...row.fieldConflicts,operatingIncome:{usable:true,cause:"operating-basis",resolution:"filed-family",vendorValue:row.fieldConflicts?.operatingIncome?.vendorValue ?? row.operatingIncome ?? null,
        secValue:primary.operatingIncome,secEvidence:primary.proof,reason}}};
  }
  if (row.fieldConflicts?.operatingIncome?.usable === false && row.fieldConflicts.operatingIncome.cause !== "operating-basis") return row;
  if(sec.operatingTagScopeUnresolved) {
    const independent=finite(sec.revenue) && sec.fieldProvenance?.revenue && finite(sec.incomeBeforeTax) && sec.fieldProvenance?.incomeBeforeTax
      ? completeOperatingBridge({value:sec.revenue,proof:sec.fieldProvenance.revenue},{value:sec.incomeBeforeTax,proof:sec.fieldProvenance.incomeBeforeTax},sec.filedIncomeLines ?? {}) : null;
    if(!independent) {
      const reason="Operating income withheld for all uses: this tag family has an unresolved consolidated scope conflict with a complete primary statement; this historical numerator has no independent complete reconciliation.";
      return {...row,operatingIncome:undefined,nonMarginOperatingIncome:undefined,waccOperatingIncome:undefined,operatingIncomeBasis:reason,
        fieldConflicts:{...row.fieldConflicts,operatingIncome:{usable:false,cause:"operating-scope",vendorValue:row.fieldConflicts?.operatingIncome?.vendorValue ?? row.operatingIncome ?? row.nonMarginOperatingIncome ?? null,secValue:null,reason}}};
    }
  }
  const previous = row.fieldConflicts?.operatingIncome;
  const provider = finite(row.operatingIncome) ? row.operatingIncome : row.nonMarginOperatingIncome;
  const observed = previous && finite(previous.vendorValue) ? previous.vendorValue : provider;
  const revenue = row.fieldProvenance?.revenue;
  if (!revenue || row.periodStart != null && row.periodStart !== revenue.periodStart || !finite(row.revenue) || row.fieldConflicts?.revenue?.usable === false) return row;
  const lines = row.filedIncomeLines ?? sec.filedIncomeLines ?? {};
  const onRevenueBasis=(proof:StatementFieldProvenance)=>isAdmittedRevenueBasis(row,proof);
  const reconciliation = finite(sec.incomeBeforeTax) && sec.fieldProvenance?.incomeBeforeTax && sec.fieldConflicts?.incomeBeforeTax?.usable !== false
    ? operatingBridgeProof({value:row.revenue,proof:revenue}, {value:sec.incomeBeforeTax,proof:sec.fieldProvenance.incomeBeforeTax},lines) : null;
  if (reconciliation?.status === "conflict") return { ...row, operatingIncome: undefined, nonMarginOperatingIncome: undefined, waccOperatingIncome: undefined,
    operatingIncomeBasis: reconciliation.reason, fieldConflicts: { ...row.fieldConflicts, operatingIncome: { usable: false, cause: "operating-scope",
      vendorValue: observed ?? null, secValue: null, reason: reconciliation.reason } } };
  const complete = reconciliation?.status === "complete" ? reconciliation.line : null;
  if (complete) {
    const reason = "Operating income follows a complete same-scope operating/nonoperating reconciliation to filed pretax income; the derived consolidated result does not depend on provider agreement.";
    return {...row,operatingIncome:complete.value,nonMarginOperatingIncome:undefined,waccOperatingIncome:undefined,operatingIncomeBasis:reason,
      fieldProvenance:{...row.fieldProvenance,operatingIncome:complete.proof},
      fieldConflicts:{...row.fieldConflicts,operatingIncome:{usable:true,cause:"operating-basis",resolution:"filed-family",
        vendorValue:observed ?? null,secValue:complete.value,secEvidence:complete.proof,reason}}};
  }
  if (!finite(provider)) return row;
  const costs = TOTAL_INCOME_EXPENSE_TAGS.map(tag=>lines[tag]).find(l=>l&&sameIncomeScope(revenue,l.proof));
  const expenseTags = tagsFor("interestExpense");
  const actualInterest = (proof: StatementFieldProvenance) =>
    proof.tags.some(t=>expenseTags.includes(t.replace(/^us-gaap\//,"")));
  const interest = Object.values(lines).find(l=>actualInterest(l.proof)&&sameIncomeScope(revenue,l.proof)) ??
    (finite(sec.interestExpense)&&sec.fieldProvenance?.interestExpense&&actualInterest(sec.fieldProvenance.interestExpense)
      ? {value:sec.interestExpense,proof:sec.fieldProvenance.interestExpense} : null);
  const direct = sec.fieldConflicts?.operatingIncome?.usable !== false && finite(sec.operatingIncome) && sec.fieldProvenance?.operatingIncome && onRevenueBasis(sec.fieldProvenance.operatingIncome)
    ? { value: sec.operatingIncome, proof: sec.fieldProvenance.operatingIncome } : null;
  const operatingLine = sec.fieldConflicts?.operatingIncome?.usable !== false ? Object.values(lines).find(l => l.proof.tags.includes("us-gaap/OperatingIncomeLoss") && onRevenueBasis(l.proof)) : undefined;
  const priorFiled = standaloneFiledOperatingIncome(row,revenue);
  const explicit = operatingLine ?? (direct?.proof.tags.includes("us-gaap/OperatingIncomeLoss") ? direct : null) ??
    (priorFiled?.proof.tags.includes("us-gaap/OperatingIncomeLoss") && onRevenueBasis(priorFiled.proof) ? priorFiled : null);
  const completeCosts = costs && finite(sec.incomeBeforeTax) && finite(sec.revenue) &&
    sec.fieldConflicts?.incomeBeforeTax?.usable !== false &&
    sameIncomeScope(costs.proof,sec.fieldProvenance?.incomeBeforeTax) && sameIncomeScope(costs.proof,sec.fieldProvenance?.revenue) &&
    vendorAgreesWithFiled(sec.revenue - costs.value, sec.incomeBeforeTax);
  const pension = lines[NONSERVICE_BENEFIT_EXPENSE_TAG];
  const benefits = pension && sameIncomeScope(revenue,pension.proof) ? pension : null;
  const operatingExpenses = lines.OperatingExpenses;
  // Pretax arithmetic proves the expense total, not its interest membership.
  // Require the independent filed operating-expense subtotal to reconcile the
  // excluded interest and (when present) nonservice benefit components.
  const interestIncluded = costs && interest && operatingExpenses && sameIncomeScope(costs.proof,operatingExpenses.proof) &&
    vendorAgreesWithFiled(costs.value,operatingExpenses.value+interest.value+(benefits?.value ?? 0));
  const costBridge = completeCosts && interestIncluded && interest && sameIncomeScope(revenue, costs.proof) && sameIncomeScope(revenue, interest.proof)
    ? { value: row.revenue - costs.value + interest.value,
      proof: { ...revenue, tags: [...new Set([...revenue.tags, ...costs.proof.tags, ...interest.proof.tags])], calculation: "revenue-less-noninterest-costs" as const } } : null;
  const pensionBridge = costBridge && benefits
    ? { value: costBridge.value + benefits.value, proof: { ...costBridge.proof, tags: [...costBridge.proof.tags, ...benefits.proof.tags] } } : null;
  const reconciled = pensionBridge ?? costBridge;
  const unresolved = explicit ?? (!reconciled && !row.fieldProvenance?.operatingIncome ? {value:provider,proof:revenue} : null);
  const contradictsCosts = unresolved && completeCosts && interest && sameIncomeScope(revenue,costs.proof) && sameIncomeScope(revenue,interest.proof) &&
    !vendorAgreesWithFiled(unresolved.value,row.revenue-costs.value) &&
    !vendorAgreesWithFiled(unresolved.value,row.revenue-costs.value+interest.value+(benefits?.value ?? 0));
  if (contradictsCosts) {
    const reason = "Operating income withheld for all uses: the observed result contradicts the complete filed revenue/expense/pretax reconciliation; consolidated operating scope is unresolved.";
    return {...row,operatingIncome:undefined,nonMarginOperatingIncome:undefined,waccOperatingIncome:undefined,operatingIncomeBasis:reason,
      fieldConflicts:{...row.fieldConflicts,operatingIncome:{usable:false,cause:"operating-scope",vendorValue:observed ?? null,
        secValue:explicit?.value ?? null,secEvidence:unresolved.proof,reason}}};
  }
  const bridge = explicit ?? reconciled ??
    (!costs && direct && !operatingDerivationRefusal(sec,direct.proof) && vendorAgreesWithFiled(row.revenue, sec.revenue!) && vendorAgreesWithFiled(provider, direct.value) ? direct : null);
  if (!bridge) {
    const standalone=standaloneFiledOperatingIncome(sec,revenue);
    const filedStandalone=standalone?.value,proof=standalone?.proof;
    const qualified = proof ? { ...row, fieldProvenance: { ...row.fieldProvenance, operatingIncome: proof } } : row;
    const reason = operatingMarginRefusal(qualified);
    return { ...qualified, operatingIncome: undefined, nonMarginOperatingIncome: filedStandalone ?? row.nonMarginOperatingIncome, operatingIncomeBasis: reason,
      fieldConflicts: { ...row.fieldConflicts, operatingIncome: { usable: false, cause: "operating-basis", vendorValue: previous?.vendorValue ?? provider,
        secValue: filedStandalone ?? null, ...(proof ? {secEvidence:proof} : {}), reason } } };
  }
  const agrees = vendorAgreesWithFiled(provider, bridge.value);
  const reason = explicit ? "Operating income uses the same-period filed operating result." : pensionBridge ?
    "Operating income is corroborated by filed sales less total expenses excluding interest and nonservice benefit expense." : costBridge ? "Operating income uses filed operating revenue less total costs and expenses, excluding interest." :
    "Operating income is corroborated by the same-period filed operating result, including its filed nonoperating adjustments.";
  return { ...row, operatingIncome: agrees ? provider : bridge.value, nonMarginOperatingIncome: undefined, operatingIncomeBasis: reason,
    fieldProvenance: { ...row.fieldProvenance, operatingIncome: bridge.proof },
    fieldConflicts: { ...row.fieldConflicts, operatingIncome: { usable: true, cause: "operating-basis", resolution: "filed-family",
      vendorValue: row.fieldConflicts?.operatingIncome?.vendorValue ?? provider, secValue: bridge.value, secEvidence: bridge.proof,
      reason: finite(observed) && vendorAgreesWithFiled(observed, bridge.value) ? reason : `Provider operating income does not reconcile and is replaced for margins and non-margin measures. ${reason}` } } };
}
