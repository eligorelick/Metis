import type { Dcf, Projections, ProvenanceCoverage, Scoring } from "./schema";
import { formatFinancialValue, formatLargeNumber } from "./format";

export interface ReportAuditTable { heading: string; headers: string[]; rows: string[][]; note?: string }
const n = (value: number | null | undefined, digits = 2) => typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "unavailable";
export function scoreAuditTables(scores: Scoring): ReportAuditTable[] {
  const tables: ReportAuditTable[] = [];
  if (scores.assessments) {
    const a = scores.assessments;
    tables.push({ heading: "Assessment dimensions", headers: ["Dimension", "Score / band", "Meaning"], rows: [
      ["Business quality", `${n(a.businessQuality.score)} / ${a.businessQuality.band ?? "unavailable"}`, a.businessQuality.basis],
      ["Price attractiveness", `${n(a.valuation.score)} / ${a.valuation.band ?? "unavailable"}`, a.valuation.basis],
      ["Evidence availability", `${n(a.evidenceCompleteness*100,1)}%`, "Availability is separate from source correctness, freshness and predictive confidence. Grade bands remain unbacktested house rules."],
    ] });
  }
  const signals = Object.entries(scores.aspects).flatMap(([aspect, data])=>(data.signals ?? []).map(s=>[aspect,s.id,n(s.raw,6),s.period ?? "measurement period unavailable",s.windowYears === null ? "—" : n(s.windowYears,2),n(s.transformedScore),`${n(s.effectiveCompositeWeightPct,3)}%`,n(s.contributionPoints,4),s.fallbackReason ?? "—"]));
  if (signals.length) tables.push({ heading:"Signal evidence and contributions", headers:["Aspect","Signal","Raw value","Measured period","Years","Subscore","Effective weight","Points vs 50","Fallback"], rows: signals, note:"Effective weights include route applicability and missingness. The neutral value 50 plus the contributions reconstructs the composite before display rounding. Signals sharing a factor family are not independent confirmations." });
  if (scores.factorExposure) tables.push({ heading:"Factor-family exposure",headers:["Factor family","Effective weight","Points above neutral"],rows:scores.factorExposure.map(x=>[x.family,`${n(x.weightPct,3)}%`,n(x.aboveNeutralPoints,4)]) });
  return tables;
}

export function valuationAuditTables(dcf: Dcf): ReportAuditTable[] {
  const result: ReportAuditTable[] = [];
  const b = dcf.bridge;
  if (b) {
    const money = (v:number|null)=>v === null ? "unavailable" : formatFinancialValue(v,"currency",b.currency);
    result.push({heading:"Enterprise value to equity bridge",headers:["Component","Value"],rows:[
      ["Explicit cash-flow present value",money(b.presentValueExplicit)],["Terminal present value",money(b.presentValueTerminal)],
      ["Enterprise value",money(b.enterpriseValue)],["Less net debt (negative means net cash)",money(b.netDebt)],
      ["Less minority interest",money(b.minorityInterest)],["Less preferred equity",money(b.preferredEquity)],
      ...(b.nonOperatingAssets === undefined ? [] : [["Plus non-operating marketable equity securities (filed fair value, not cash)",money(b.nonOperatingAssets)]]),
      ["Common equity value",money(b.equityValue)],["Diluted share denominator",b.dilutedShares === null ? "unavailable" : formatLargeNumber(b.dilutedShares)],
      ["Valuation as of",b.asOf ?? "unavailable"],
    ],note:"Per-share value = common equity value ÷ diluted share denominator."});
  }
  const gm = dcf.growthMarginGrid;
  const shift = (v: number) => `${v > 0 ? "+" : ""}${v}pp`;
  if (gm && gm.perShare.length) result.push({heading:"Sensitivity (per share — rows = year-one revenue growth shift, cols = sustained operating-margin shift)",
    headers:["Growth shift / margin shift",...gm.marginShiftsPp.map(shift)],
    rows:gm.perShare.map((row,i)=>[shift(gm.growthShiftsPp[i] ?? 0),...row.map(v=>v===null?"withheld":formatFinancialValue(v,"currency/share",b?.currency ?? null))]),
    note:gm.notes.join("; ")});
  if (dcf.forecastRows?.length) result.push({heading:"DCF annual cash-flow path",headers:["Period","Revenue","Growth %","EBIT margin %","Tax %","NOPAT","Reinvestment","FCFF","Present value"],rows:dcf.forecastRows.map(r=>[r.period,...[r.revenue].map(v=>formatFinancialValue(v,"currency",b?.currency ?? null)),n(r.growthPct),n(r.ebitMarginPct),n(r.taxRatePct),...[r.nopat,r.reinvestment,r.fcff,r.presentValue].map(v=>formatFinancialValue(v,"currency",b?.currency ?? null))])});
  return result;
}

export function projectionAuditTables(p: Projections): ReportAuditTable[] {
  const tables: ReportAuditTable[] = [];
  const a = p.scenarioAssumptions;
  if (a) {
    tables.push({heading:"Scenario construction and terminal transition",headers:["Scenario","Growth shift (pp)","Margin shift (pp)"],rows:a.scenarios.map(s=>[s.name,n(s.growthDeltaPp),n(s.marginDeltaPp)]),note:a.terminalTransition});
    if (a.alternatives.length) tables.push({heading:"Illustrative sensitivity: alternative shock construction",headers:["Alternative","Bull value/share","Bear value/share","Basis"],rows:a.alternatives.map(s=>[s.name,n(s.bullPerShare),n(s.bearPerShare),s.basis])});
  }
  for (const s of p.series) {
    if (!s.capitalReturn) continue;
    tables.push({heading:"EPS capital-return assumptions",headers:["Assumption","Value"],rows:[
      ["Historical share trend",`${n(s.capitalReturn.shareCountAnnualizedPct)}% / year`],["Applied share trend",`${n(s.capitalReturn.appliedShareCountAnnualizedPct)}% / year`],
      ["Funding policy",s.capitalReturn.policy],["Net income / EBIT, year one",n(s.capitalReturn.netIncomeToEbit,4)],
      ...(s.capitalReturn.authorizationRemaining === undefined ? [] : [
        ["Remaining repurchase authorization",formatFinancialValue(s.capitalReturn.authorizationRemaining,"currency",s.unit.replace(/\/share$/,""))],
        ["Authorization spent evenly at the quote (hypothetical)",s.capitalReturn.authorizationAnnualizedPct == null ? "unavailable" : `${n(s.capitalReturn.authorizationAnnualizedPct)}% / year`],
      ]),
    ],note:s.capitalReturn.basis});
    if (s.flatShare && s.shareTrend) tables.push({heading:"EPS share-count sensitivity",headers:["Period","Base EPS, flat shares","Historical-trend hypothetical EPS"],rows:s.base.map((point,index)=>[point.period,n(s.flatShare?.base[index]?.value.value),n(s.shareTrend?.base[index]?.value.value)]),note:"Historical-trend EPS is an unfunded hypothetical. A past share-count decline does not establish affordable future repurchases."});
  }
  return tables;
}

export function factualValidationText(coverage?: ProvenanceCoverage): string | null {
  const v = coverage?.factualValidation;
  if (!v || !coverage) return null;
  // This partition counts non-judgment prose claims, not TracedNumber objects.
  // Preserve the separate denominator so zero prose matches cannot be read as
  // zero numeric figures tracing to their source.
  // Claims that state no figure have nothing to check numerically; say how
  // many of the unchecked are those (NVDA report 34: 60 of 89).
  const unchecked = v.qualitative === undefined ? `${v.unchecked} unchecked` : `${v.unchecked} unchecked (${v.qualitative} qualitative with no figure to check)`;
  return `Factual prose claims (numeric support): ${v.validated}/${v.total} validated; ${v.contradicted} contradicted; ${unchecked}. Citation presence: ${v.cited}/${v.total}. Numeric figure provenance: ${coverage.numeric.supported}/${coverage.numeric.total} citation-traced (separate from prose claims). Numeric matches do not validate whole prose claims; unchecked qualitative claims remain unvalidated.`;
}
