import { ANNUALIZATION_CONVENTION_SPEC, DCF_INPUTS_CONVENTION_SPEC } from "@/report/versions";
import { degradedInputsReason } from "@/pipeline/stageB/fairValue";
import type { ManifestEntry } from "@/types/core";
import { periodDays, weeksOf } from "@/pipeline/stageB/fiscalCalendar";
import { specVersionBefore } from "@/report/legacyPayloadRecordSafety";
import type { Report } from "@/report/schema";

export const LEGACY_VALUATION_NOTE_FIELD = "presentation.legacyValuation";
export { ANNUALIZATION_CONVENTION_SPEC } from "@/report/versions";
export { DCF_INPUTS_CONVENTION_SPEC } from "@/report/versions";

type FiledPeriod = { start: string; end: string; basis: "fiscal-quarter" | "fiscal-year"; days: number; revenue: number | null };
function filedPeriods(value: unknown): FiledPeriod[] {
  if (value === null || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const result: FiledPeriod[] = [];
  const context = record.periodContext as Record<string, unknown> | undefined;
  if (context?.kind === "duration" && (context.basis === "fiscal-quarter" || context.basis === "fiscal-year") &&
      typeof context.start === "string" && typeof context.end === "string") {
    const days = periodDays(context.start, context.end);
    const source = record.sourceId ?? record.provenanceId ?? record.source;
    const revenue = typeof source === "string" && /^payload\.statements\.income-statement-quarterly\.\d{4}-\d{2}-\d{2}\.revenue$/.test(source) &&
      typeof record.value === "number" && Number.isFinite(record.value) && record.value > 0 ? record.value : null;
    if (days !== null) result.push({ start: context.start, end: context.end, basis: context.basis, days, revenue });
  }
  for (const [key, child] of Object.entries(record)) if (key !== "periodContext") result.push(...filedPeriods(child));
  return result;
}
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
const AMOUNT = "([\\d,]+(?:\\.\\d+)?[TMBK]?)";

function quarterLength(basis: string, periods: FiledPeriod[]): string | null {
  const match = new RegExp(`latest quarter ending (\\d{4}-\\d{2}-\\d{2}) × 4 = ${AMOUNT}`).exec(basis);
  if (!match) return null;
  const period = periods.find(p => p.basis === "fiscal-quarter" && p.end === match[1]);
  const weeks = weeksOf(period?.days ?? null);
  if (weeks === null || weeks === 13) return null;
  const amount = match[2];
  const value = Number(amount.replace(/,/g, "").replace(/[TMBK]$/, ""));
  const suffix = /[TMBK]$/.exec(amount)?.[0] ?? "";
  const scale = ({ T: 1e12, B: 1e9, M: 1e6, K: 1e3 } as Record<string, number>)[suffix] ?? 1;
  const raw = periods.find(p => p.basis === "fiscal-quarter" && p.end === match[1] && p.revenue !== null)?.revenue;
  // Avoid double-rounding when a matching filed quarter is stored: MU 54.229B
  // × 4 is printed as 216.92B, but its normalized level rounds to 201.42B.
  const filedValue = raw == null ? null : raw * 4 / scale;
  const precise = filedValue !== null && filedValue.toFixed(2) === value.toFixed(2);
  const normalized = (precise ? filedValue : value) * 13 / weeks;
  return `Built before spec ${ANNUALIZATION_CONVENTION_SPEC}: the run-rate annualised the ${weeks}-week quarter ending ${match[1]} × 4 (${amount}). From ${ANNUALIZATION_CONVENTION_SPEC} a ${weeks}-week quarter is put on a 13-week basis (× 13/${weeks}): ${normalized.toFixed(2)}${suffix}${precise ? ", calculated from the stored filed quarter before rounding" : " (approximate, calculated from the rounded stored run-rate)"}. Stored figures are unchanged.`;
}
function guidedTimesFour(basis: string): string | null {
  if (!/model extrapolation of quarterly guidance:|sits below the guided run-rate and is not used for year one/.test(basis)) return null;
  return `Built before spec ${ANNUALIZATION_CONVENTION_SPEC}: year one annualised the guided quarter × 4, which carries that quarter's season; from ${ANNUALIZATION_CONVENTION_SPEC} the guided quarter is first taken out of its own season (divided by its growth-adjusted share of its trailing year) before × 4, with the trailing twelve months at the guided year-over-year pace only below eight quarters, and consensus is tested against a twelve-month floor. Stored figures and prose are unchanged.`;
}
function fiscalYearEnd(basis: string, periods: FiledPeriod[]): string | null {
  const filed = periods.find(p => [91, 98, 364, 371].includes(p.days) &&
    new Date(Date.parse(`${p.end}T00:00:00Z`) + 86400000).getUTCDate() !== 1);
  // A month-end context alone does not distinguish a calendar from a weekly filer.
  if (!filed) return null;
  for (const match of basis.matchAll(/the fiscal year ending (\d{4}-\d{2}-\d{2}) contributes/g)) {
    if (periodDays(match[1], match[1]) === null || weekday(match[1]) === weekday(filed.end)) continue;
    return `Built before spec ${ANNUALIZATION_CONVENTION_SPEC}: the consensus window used the provider's fiscal-year date ${match[1]} (a ${WEEKDAYS[weekday(match[1])]}); this issuer's fiscal periods end on ${WEEKDAYS[weekday(filed.end)]}s, so its year end is a different day up to six days away, and year one and year two may each carry a few days' revenue of the other year. Stored figures are unchanged.`;
  }
  return null;
}
function guidedFloorTimesFour(basis: string): string | null {
  const match = new RegExp(`at or above the guided run-rate \\(management guidance.*?× 4 = ${AMOUNT}(?:; low end × 4 = ${AMOUNT})?`).exec(basis);
  if (!match) return null;
  return `Built before spec ${ANNUALIZATION_CONVENTION_SPEC}: consensus was tested against the guided quarter × 4 (${match[1]}${match[2] ? `; low end ${match[2]}` : ""}), which carries that quarter's season and timing. From ${ANNUALIZATION_CONVENTION_SPEC} it is tested against the twelve-month floor the guidance implies, and the reverse-DCF context gives the guided quarter's year-over-year growth. Stored figures and prose are unchanged.`;
}

/** Each row owns its cutoff, allowing later batches to add independently dated rules. */
const ROWS = [
  { key: "quarterLength", since: ANNUALIZATION_CONVENTION_SPEC, note: quarterLength },
  { key: "guidedTimesFour", since: ANNUALIZATION_CONVENTION_SPEC, note: guidedTimesFour },
  { key: "fiscalYearEnd", since: ANNUALIZATION_CONVENTION_SPEC, note: fiscalYearEnd },
  { key: "guidedFloorTimesFour", since: ANNUALIZATION_CONVENTION_SPEC, note: guidedFloorTimesFour },
];
/** Immutable display-only view. Stored figures, claims and verification entries stay intact. */
export function withLegacyValuationNotes(report: Report): Report {
  const basis = report.valuation.dcf.assumptions.find(row => row.name === "year-one revenue anchor")?.basis ?? "";
  const periods = filedPeriods(report);
  const added: ManifestEntry[] = ROWS.flatMap(row => {
    const field = `${LEGACY_VALUATION_NOTE_FIELD}.${row.key}`;
    if (!specVersionBefore(report.meta.specVersion ?? "", row.since) || report.appendix.missingData.some(entry => entry.field === field)) return [];
    const reason = row.note(basis, periods);
    return reason === null ? [] : [{ field, reason, severity: "info" as const, expected: true }];
  });
  const taxField = `${LEGACY_VALUATION_NOTE_FIELD}.taxSeedOneOff`;
  const assumptions = report.valuation.dcf.assumptions;
  const marginNormalized = assumptions.some(row => /EBIT margin/i.test(row.name) && /excluding tagged one-off items/.test(row.basis));
  const tax = assumptions.find(row => /tax rate/i.test(row.name) && /^(TTM|latest annual FY \S+) effective rate \d/.test(row.basis));
  if (specVersionBefore(report.meta.specVersion ?? "", DCF_INPUTS_CONVENTION_SPEC) && marginNormalized && tax &&
      !report.appendix.missingData.some(entry => entry.field === taxField)) {
    const rate = /effective rate ([\d.]+%)/.exec(tax.basis)?.[1] ?? "stored";
    added.push({ field: taxField, reason: `Built before spec ${DCF_INPUTS_CONVENTION_SPEC}: year one's tax rate (${rate}) was measured on pre-tax income that still held the tagged one-off items the margin seed removed. From ${DCF_INPUTS_CONVENTION_SPEC} it is re-read between no-tax-effect and marginal-rate readings. Stored figures are unchanged.`, severity: "info", expected: true });
  }
  const sigmaField = `${LEGACY_VALUATION_NOTE_FIELD}.sigmaCap`;
  const dispersion = report.scenarioTargets?.dispersion;
  if (specVersionBefore(report.meta.specVersion ?? "", DCF_INPUTS_CONVENTION_SPEC) && dispersion &&
      (dispersion.growthSigmaPp === 25 || dispersion.marginSigmaPp === 12) &&
      !report.appendix.missingData.some(entry => entry.field === sigmaField)) {
    added.push({field:sigmaField,reason:`Built before spec ${DCF_INPUTS_CONVENTION_SPEC}: scenario sigmas are at the house 25pp growth or 12pp margin bounds. The uncapped sample was not recorded, so these bounded shocks must not be read as uncapped sample dispersion. Stored figures are unchanged.`,severity:"info",expected:true});
  }
  const correction = legacyInputCorrections(report, periods);
  added.push(...correction.notes);
  const view = correction.view;
  return added.length === 0 ? view : { ...view, appendix: { ...view.appendix, missingData: [...view.appendix.missingData, ...added] } };
}

/** Display adaptations read stored evidence only; commentary/verification text is immutable. */
function legacyInputCorrections(report: Report, periods: FiledPeriod[]): {view:Report;notes:ManifestEntry[]} {
  if (!specVersionBefore(report.meta.specVersion ?? "", DCF_INPUTS_CONVENTION_SPEC)) return {view:report,notes:[]};
  let view = report;
  const notes: ManifestEntry[] = [];
  const edit = (): Report => { if (view === report) view = structuredClone(report); return view; };
  const note = (key:string, reason:string):void => {
    const field = `${LEGACY_VALUATION_NOTE_FIELD}.${key}`;
    if (!report.appendix.missingData.some(entry => entry.field === field)) notes.push({field,reason,severity:"info",expected:true});
  };
  const assumptions = report.valuation.dcf.assumptions;
  for (const row of assumptions.filter(row => /terminal ROIC/i.test(row.name))) {
    const match = /in each of the last (\d+) fiscal years \((\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/.exec(row.basis);
    if (match && Math.round((Date.parse(match[3]!) - Date.parse(match[2]!)) / (365.25 * 86400000)) + 1 > Number(match[1])) {
      note("terminalYearSkipped", `The terminal ROIC rule read ${match[1]} of the fiscal years from ${match[2]} to ${match[3]}; a year without a return was left out. From ${DCF_INPUTS_CONVENTION_SPEC} an operating-loss year counts below WACC; a pre-tax-loss year's positive EBIT uses the marginal-rate floor. This stored terminal ROIC may be higher than current rules give. Stored figures are unchanged.`);
    }
  }
  const waccBasis = assumptions.filter(row => /WACC/i.test(row.name)).map(row => row.basis).join(" ");
  if (/E 100% \/ D 0%/.test(waccBasis)) {
    const numbers = report.balanceSheet.debtProfile.numbers;
    const amount = (key:string) => numbers.find(n => (n.sourceId ?? "").endsWith(key) || n.source.endsWith(key))?.value;
    const debt=amount("totalDebtIncludingLeases"), leases=amount("operatingLeases");
    if (typeof debt === "number" && typeof leases === "number" && debt-leases > 0) note("newBorrower", `The WACC was all-equity although the latest balance carried debt; from ${DCF_INPUTS_CONVENTION_SPEC} it is withheld until the debt cost is established. Stored figures are unchanged.`);
  }
  if (report.appendix.missingData.some(g => g.field === "valuation.reverseDcf.growthBracket" && /the price implies year-one growth (?:above|below) [\d.]+%/.test(g.reason))) {
    note("reverseRangeEnd", `The stored reverse-growth range end may rest on scan points outside the DCF domain. From ${DCF_INPUTS_CONVENTION_SPEC} only in-domain candidates supply brackets and bounds; incomplete scans support no outside-range inference. Stored figures are unchanged.`);
  }
  const unique = [...new Map(periods.map(p => [`${p.basis}|${p.start}|${p.end}`,p])).values()];
  const shift = (date:string, days:number) => new Date(Date.parse(date)+days*86400000).toISOString().slice(0,10);
  const filedStart = (end:string):string|null => {
    const annual = unique.filter(p => p.basis === "fiscal-year" && p.end === end && p.days >= 357 && p.days <= 380);
    if (annual.length > 0) return annual.length === 1 ? annual[0]!.start : null;
    let cursor=end, start:string|null=null;
    for (let i=0;i<4;i++) {
      const matches=unique.filter(p => p.basis === "fiscal-quarter" && p.end === cursor);
      if (matches.length !== 1) return null;
      start=matches[0]!.start;cursor=shift(start,-1);
    }
    return start;
  };
  const currentPeriods = new Set([...report.balanceSheet.coverage.numbers,...(report.scores?.aspects?.balanceSheet?.drivers ?? [])].map(n => n.period));
  for (const period of currentPeriods) {
    const match = /^ttm: (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})$/.exec(period ?? "");
    if (!match) continue;
    const start=filedStart(match[2]!);
    if (start === null || start === match[1]) continue;
    const corrected=`ttm: ${start} to ${match[2]}`;
    const next=edit();
    for (const n of [...next.balanceSheet.coverage.numbers,...(next.scores?.aspects?.balanceSheet?.drivers ?? [])]) if (n.period === period) n.period=corrected;
    for (const signal of next.scores?.aspects?.balanceSheet?.signals ?? []) if (signal.period === period) {signal.period=corrected;signal.startDate=start;}
    note("currentCapitalStart", `Presentation correction: the current-capital window starts on ${start}, the filed start, not ${match[1]} (the Capital grading basis line keeps its stored wording and verification mark). No figure changed.`);
  }
  const oldDegraded = report.fairValue?.reasons.find(g => g.field === "valuation.fairValue.degradedInputs" && g.reason.startsWith("Degraded inputs:"));
  if (oldDegraded && report.appendix.missingData.some(g => /^keyless\.[^.]+$/.test(g.field))) {
    const candidate=degradedInputsReason({riskFree:{pct:null,asOf:null,seriesId:null},betaUsesRegression:/keyless profile regression/.test(waccBasis),bundleGaps:report.appendix.missingData,valuationGaps:[]});
    const body=oldDegraded.reason.replace(/^Degraded inputs: /,"").replace(/\. A run with these providers healthy can give a different value\.$/,"");
    const retained=body.split("; ").filter(clause => /risk-free rate|ROIC-vs-WACC history|analyst-consensus growth method/.test(clause));
    if (candidate) retained.push(candidate.reason.replace(/^Degraded inputs: /,"").replace(/\. A run with these providers healthy can give a different value\.$/,""));
    const reason=retained.length === 0 ? null : `Degraded inputs: ${retained.join("; ")}. A run with these providers healthy can give a different value.`;
    if (reason !== oldDegraded.reason) {
      const next=edit();next.fairValue!.reasons=next.fairValue!.reasons.flatMap(g => g.field === oldDegraded.field ? reason === null ? [] : [{...g,reason}] : [g]);
      note("degradedInputs","Presentation correction: members the fair value does not read are no longer named. Provider-fallback evidence and stored figures are unchanged.");
    }
  }
  const floor="Targets are labeled by per-share value; a negative perturbed equity value is floored at zero. No scenario is a future-price forecast.";
  if (report.valuation.scenarios.some(s => s.assumptions.includes(floor))) {
    for (const scenario of edit().valuation.scenarios) scenario.assumptions=scenario.assumptions.map(text => text === floor ? "Targets are labeled by per-share value; runs outside the DCF domain are withheld. No scenario is a future-price forecast." : text);
    note("scenarioDomain","Presentation correction: obsolete scenario zero-floor wording is replaced by the domain-withholding convention. Stored figures and authored commentary are unchanged.");
  }
  return {view,notes};
}
