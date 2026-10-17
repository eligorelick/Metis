import type { Dcf, Projections, ProvenanceCoverage, Scoring } from "./schema";
import { formatFinancialValue, formatLargeNumber } from "./format";
import { admittedProjectionPoints, projectionAvailability } from "./surfaceManifest";

export interface ReportAuditTable { heading: string; headers: string[]; rows: string[][]; note?: string }
const n = (value: number | null | undefined, digits = 2) => typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "unavailable";

/** Presentation-only decomposition: no weight redistribution or new grades. */
export function factorContributionSensitivityTable(scores: Scoring): ReportAuditTable {
  const heading = "Factor contribution sensitivity";
  const note = "Each row sets that family's contributions to neutral (zero points versus 50); weights and missingness stay unchanged. Complete signal-family metadata must reconcile to the recorded composite. This is arithmetic dependence on the recorded house rules, not a causal estimate, calibrated forecast or alternative grade.";
  const unavailable = (): ReportAuditTable => ({ heading, headers: ["Status", "Reason"],
    rows: [["Unavailable", "Complete signal-family weights and contributions must reconcile to the recorded composite."]], note });
  const finite = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
  const close = (a: number, b: number) => Math.abs(a - b) <= 1e-8;
  const round = (v: number) => Math.round(v * 100) / 100;
  const composite = scores.composite.score;
  if (!finite(composite) || !scores.factorExposure?.length) return unavailable();
  const families = new Map<string, { weight: number; points: number }>();
  const aspectWeights: { effective: number; available: number }[] = [];
  for (const [key, aspect] of Object.entries(scores.aspects)) {
    const signals = aspect.signals ?? [];
    const routeWeight = scores.composite.weights[key as keyof Scoring["aspects"]];
    if (!finite(routeWeight) || routeWeight < 0 ||
      (aspect.score !== null && aspect.dataCompleteness > 0 && !signals.length) ||
      (aspect.score === null && signals.length > 0)) return unavailable();
    let weight = 0, transformed = 0;
    const ids = new Set<string>();
    for (const s of signals) {
      if (!s.family.trim() || s.family === "unclassified" || ids.has(s.id) ||
        !finite(s.effectiveCompositeWeightPct) || s.effectiveCompositeWeightPct < 0 ||
        !finite(s.transformedScore) || s.transformedScore < 0 || s.transformedScore > 100 ||
        !finite(s.contributionPoints) ||
        !close(s.contributionPoints, (s.transformedScore - 50) * s.effectiveCompositeWeightPct / 100)) return unavailable();
      ids.add(s.id);
      weight += s.effectiveCompositeWeightPct;
      transformed += s.transformedScore * s.effectiveCompositeWeightPct;
      const family = families.get(s.family) ?? { weight: 0, points: 0 };
      family.weight += s.effectiveCompositeWeightPct; family.points += s.contributionPoints;
      families.set(s.family, family);
    }
    if (weight > 0 && (!finite(aspect.score) || !close(round(transformed / weight), aspect.score))) return unavailable();
    aspectWeights.push({ effective: weight, available: routeWeight * aspect.dataCompleteness });
  }
  const weight = [...families.values()].reduce((sum, f) => sum + f.weight, 0);
  const points = [...families.values()].reduce((sum, f) => sum + f.points, 0);
  const available = aspectWeights.reduce((sum, a) => sum + a.available, 0);
  if (weight <= 0 || weight > 100 + 1e-8 || available <= 0 || !close(round(50 + points), composite) ||
    aspectWeights.some(a => !close(a.effective, a.available * weight / available)) ||
    scores.factorExposure.length !== families.size) return unavailable();
  const seen = new Set<string>();
  for (const f of scores.factorExposure) {
    const actual = families.get(f.family);
    if (seen.has(f.family) || !actual || !finite(f.weightPct) || !finite(f.aboveNeutralPoints) ||
      !close(f.weightPct, actual.weight) || !close(f.aboveNeutralPoints, actual.points)) return unavailable();
    seen.add(f.family);
  }
  return { heading, headers: ["Factor family", "Effective weight", "Points vs 50", "Composite if family neutral"],
    rows: scores.factorExposure.map(f => [f.family, `${n(f.weightPct)}%`, n(f.aboveNeutralPoints), n(50 + points - f.aboveNeutralPoints)]), note };
}

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
  tables.push(factorContributionSensitivityTable(scores));
  return tables;
}

export function valuationAuditTables(dcf: Dcf): ReportAuditTable[] {
  const result: ReportAuditTable[] = [];
  const b = dcf.bridge;
  if (b) {
    const money = (v:number|null)=>v === null ? "unavailable" : formatFinancialValue(v,"currency",b.currency);
    const claim = (v:number|null)=>v === null ? "not disclosed; model uses 0" : money(v);
    // D-65: this is the DCF's value of the operating assets, not the market EV
    // the key-data box and the multiples use; the label says so.
    const components = b.nonOperatingComponents ?? (b.nonOperatingAssets === undefined ? [] : [{ label: "marketable equity securities (filed fair value, not cash)", value: b.nonOperatingAssets }]);
    result.push({heading:"Enterprise value to equity bridge",headers:["Component","Value"],rows:[
      ["Explicit cash-flow present value",money(b.presentValueExplicit)],["Terminal present value",money(b.presentValueTerminal)],
      ["Intrinsic enterprise value (DCF, operating assets)",money(b.enterpriseValue)],["Less net debt (negative means net cash)",money(b.netDebt)],
      ["Less minority interest",claim(b.minorityInterest)],["Less preferred equity",claim(b.preferredEquity)],
      ...components.map((c) => [`Plus non-operating ${c.label}`, money(c.value)]),
      ["Common equity value",money(b.equityValue)],["Diluted share denominator",b.dilutedShares === null ? "unavailable" : formatLargeNumber(b.dilutedShares)],
      ...(b.sharesOutstandingAtQuote === undefined ? [] : [["Shares outstanding at the quote (market cap ÷ price; not the divisor)", formatLargeNumber(b.sharesOutstandingAtQuote)]]),
      ...(b.valuationDate === undefined
        ? [["Valuation as of", b.asOf ?? "unavailable"]]
        : [["Value stated at (quote date)", `${b.valuationDate}${b.rollForwardFactor === undefined ? "" : ` (rolled forward from ${b.asOf ?? "the statement date"} at the WACC, × ${b.rollForwardFactor.toFixed(4)})`}`],
           ["Balance sheet in the bridge", b.asOf ?? "unavailable"]]),
    ],note:"Per-share value = common equity value ÷ diluted share denominator. The diluted weighted-average count carries option and RSU dilution the quoted share count omits." +
      (b.valuationDate === undefined ? "" : " Cash flows are discounted from the statement date and rolled forward to the quote date at the WACC; the bridge's balances stay at the statement date.")});
  }
  const gm = dcf.growthMarginGrid;
  const shift = (v: number) => `${v > 0 ? "+" : ""}${v}pp`;
  if (gm && gm.perShare.length) result.push({heading:"Sensitivity (per share — rows = year-one revenue growth shift, cols = sustained operating-margin shift)",
    headers:["Growth shift / margin shift",...gm.marginShiftsPp.map(shift)],
    rows:gm.perShare.map((row,i)=>[shift(gm.growthShiftsPp[i] ?? 0),...row.map(v=>v===null?"withheld":formatFinancialValue(v,"currency/share",b?.currency ?? null))]),
    note:gm.notes.join("; ")});
  if (dcf.forecastRows?.length) result.push({heading:"DCF annual cash-flow path",headers:["Period","Revenue","Growth %","EBIT margin %","Tax %","NOPAT","Reinvestment","FCFF","Present value"],rows:dcf.forecastRows.map(r=>[r.period,...[r.revenue].map(v=>formatFinancialValue(v,"currency",b?.currency ?? null)),n(r.growthPct),n(r.ebitMarginPct),n(r.taxRatePct),...[r.nopat,r.reinvestment,r.fcff,r.presentValue].map(v=>formatFinancialValue(v,"currency",b?.currency ?? null))])});
  // D-65: the DCF path beside calendarized consensus, every covered window.
  if (dcf.consensusPath?.length) {
    const money = (v: number | null) => v === null ? "not covered" : formatFinancialValue(v, "currency", b?.currency ?? null);
    const anchoredCount = dcf.consensusPath.filter((r) => r.anchored).length;
    result.push({heading:"DCF path vs consensus",headers:["Period","DCF revenue","Consensus (calendarized)","DCF vs consensus","Consensus-anchored","Fiscal-year estimates"],
      rows:dcf.consensusPath.map((r)=>[r.period,money(r.modelRevenue),money(r.consensusRevenue),r.gapPct === null ? "—" : `${r.gapPct >= 0 ? "+" : "−"}${Math.abs(r.gapPct).toFixed(1)}%`,
        r.anchored ? "yes" : `no — ${r.status.replace(/^not anchored: /, "")}`, r.fiscalYears || "—"]),
      note:`Consensus is calendarized to each 12-month window by day overlap from the provider's fiscal-year estimates; the first window takes the current fiscal year's consensus less the revenue already reported. ` +
        `${anchoredCount === 0 ? "No window" : `${anchoredCount} window${anchoredCount === 1 ? "" : "s"}`} set the DCF's revenue; later years follow the convergent fade. Consensus is other analysts' forecast, not this report's.`});
  }
  return result;
}

export function projectionAuditTables(p: Projections): ReportAuditTable[] {
  if (!projectionAvailability(p.series).forward) return [];
  const tables: ReportAuditTable[] = [];
  const a = p.scenarioAssumptions;
  if (a) {
    // D-65: a requested margin shock the cap removes is shown beside the shift
    // the path actually carries, so the weighted margin reconciles.
    const capped = a.scenarios.some((s) => s.effectiveMarginDeltaPp !== undefined);
    tables.push({heading:"Scenario construction and terminal transition",
      headers: capped ? ["Scenario","Growth shift (pp)","Margin shift requested (pp)","Margin shift after the cap (pp)"] : ["Scenario","Growth shift (pp)","Margin shift (pp)"],
      rows: a.scenarios.map(s => capped ? [s.name,n(s.growthDeltaPp),n(s.marginDeltaPp),n(s.effectiveMarginDeltaPp ?? s.marginDeltaPp)] : [s.name,n(s.growthDeltaPp),n(s.marginDeltaPp)]),
      note: a.terminalTransition});
    if (a.alternatives.length) tables.push({heading:"Illustrative sensitivity: alternative shock construction",headers:["Alternative","Bull value/share","Bear value/share","Basis"],rows:a.alternatives.map(s=>[s.name,n(s.bullPerShare),n(s.bearPerShare),s.basis])});
  }
  for (const s of p.series) {
    if (!s.capitalReturn) continue;
    tables.push({heading:"EPS capital-return assumptions",headers:["Assumption","Value"],rows:[
      ["Historical share trend",`${n(s.capitalReturn.shareCountAnnualizedPct)}% / year`],["Applied share trend",`${n(s.capitalReturn.appliedShareCountAnnualizedPct)}% / year`],
      ["Funding policy",s.capitalReturn.policy],["Net income / EBIT, year one",n(s.capitalReturn.netIncomeToEbit,2)],
      ...(s.capitalReturn.authorizationRemaining === undefined ? [] : [
        ["Remaining repurchase authorization",formatFinancialValue(s.capitalReturn.authorizationRemaining,"currency",s.unit.replace(/\/share$/,""))],
        ["Authorization spent evenly at the quote (hypothetical)",s.capitalReturn.authorizationAnnualizedPct == null ? "unavailable" : `${n(s.capitalReturn.authorizationAnnualizedPct)}% / year`],
      ]),
    ],note:s.capitalReturn.basis});
    if (s.flatShare && s.shareTrend) tables.push({heading:"EPS share-count sensitivity",headers:["Period","Base EPS, flat shares","Historical-trend hypothetical EPS"],rows:s.base.map((point,index)=>[point.period,n(s.flatShare?.base[index]?.value.value),n(s.shareTrend?.base[index]?.value.value)]),note:"Historical-trend EPS is an unfunded hypothetical. A past share-count decline does not establish affordable future repurchases."});
  }
  const mainWeighted = p.series.some(s => admittedProjectionPoints(s, "weighted").length > 0);
  if (!mainWeighted) {
    const alternatives = p.series.flatMap(s => (["flatShare", "shareTrend"] as const).flatMap(kind =>
      admittedProjectionPoints(s, "weighted", kind).map(point => [
        kind === "flatShare" ? "Flat-share sensitivity" : "Historical-share-trend sensitivity", s.metric, point.period,
        formatFinancialValue(point.value.value, point.value.unit, point.value.currency ?? null),
      ])));
    if (alternatives.length > 0) tables.push({ heading: "Available weighted share-count sensitivity paths", headers: ["Alternative", "Metric", "Period", "Weighted value"], rows: alternatives,
      note: "These admitted alternative paths use the displayed prior even when the main weighted path is unavailable. Share-count sensitivities do not establish funded future repurchases." });
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
