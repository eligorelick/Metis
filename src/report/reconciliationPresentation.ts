/** Retained issuer observations, never an independent recurring-earnings model. */
import type { ReportAuditTable } from "@/report/auditTables";
import { decimalRound, formatFinancialValue } from "@/report/format";
import type { FilingDisclosures, FilingRef } from "@/report/schema";

type Fact = NonNullable<FilingDisclosures["reconciliation"]>[number];
type Metric = Fact["metric"];
const DASH = "-";
const LABELS: Record<Metric, string> = {
  "operating-cash-flow": "Net cash provided by operating activities",
  "total-capital-expenditures": "Total capital expenditures (positive outflow)",
  "purchases-property-equipment": "Purchases of property, equipment and intangible assets",
  "principal-payments-property-equipment": "Principal payments on property, equipment and intangible assets",
  "gaap-diluted-eps": "GAAP diluted EPS",
  "equity-securities-gains": "Gains on equity securities",
  "non-gaap-tax-impact": "Tax effect of non-GAAP adjustments",
  "non-gaap-diluted-eps": "Non-GAAP diluted EPS",
};
const unitFor = (metric: Metric): Fact["unit"] => metric.endsWith("eps") ? "currency-per-share" : "currency";
const sourceKey = (s: FilingRef): string => JSON.stringify([s.form, s.accession, s.filingDate, s.exhibit, s.url]);
const columnKey = (f: Pick<Fact, "months" | "periodEnd">): string => `${f.months}|${f.periodEnd}`;
const validDay = (day: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
const validColumn = (f: Pick<Fact, "months" | "periodEnd">): boolean => [3, 6, 9, 12].includes(f.months) && validDay(f.periodEnd);
const knownDocument = (s: FilingRef): boolean => !!s.form.trim() && !!s.accession.trim() && validDay(s.filingDate) && !!(s.exhibit?.trim() || s.url?.trim());

function sourceTables(d: FilingDisclosures, facts: Fact[]): ReportAuditTable[] {
  const source = facts[0]!.source;
  const documentKnown = knownDocument(source);
  const currencyKnown = d.currency !== null && /^[A-Z]{3}$/.test(d.currency);
  const columns = [...new Map(facts.map(f => [columnKey(f), f])).values()]
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd) || a.months - b.months);
  const matches = (metric: Metric, c: Fact): Fact[] => facts.filter(f => f.metric === metric && columnKey(f) === columnKey(c));
  const money = (value: number, unit: Fact["unit"] = "currency") => formatFinancialValue(value, unit === "currency-per-share" ? "currency/share" : "currency", d.currency);
  const row = (label: string, cells: string[]): string[][] => cells.every(cell => cell === DASH) ? [] : [[label, ...cells]];
  const value = (metric: Metric, c: Fact): number | null => {
    const observations = matches(metric, c);
    if (observations.some(f => f.unit !== unitFor(metric) || !Number.isFinite(f.value))) return null;
    const values = [...new Set(observations.map(f => f.value))];
    return values.length === 1 ? values[0]! : null;
  };
  const metricRow = (metric: Metric): string[][] => row(LABELS[metric], columns.map(c => {
    const values = [...new Set(matches(metric, c).filter(f => f.unit === unitFor(metric) && Number.isFinite(f.value)).map(f => f.value))];
    return values.length === 0 ? DASH : values.map(v => money(v, unitFor(metric))).join(" / ") + (values.length > 1 ? " (conflicting observations; no combined value)" : "");
  }));
  const qualifications = [
    !documentKnown ? "Supplying document is not established; no cross-row EPS or FCF bridge is calculated." : "",
    !currencyKnown ? "Monetary currency is not established; no derived monetary EPS difference is calculated." : "",
    columns.some(c => !validColumn(c)) ? "Unsupported duration or calendar period end is retained as stated, without a derived EPS or FCF bridge." : "",
    facts.some(f => f.unit !== unitFor(f.metric) || !Number.isFinite(f.value)) ? "Some observations have an incompatible unit or unavailable numeric value; they cannot enter a derived bridge." : "",
  ].filter(Boolean).join(" ");
  const sourceNote = `Source: ${source.form}${source.exhibit ? ` ${source.exhibit}` : ""} filed ${source.filingDate} (${source.accession}).${source.url ? ` Document: ${source.url}.` : ""}`;
  const table = (heading: string, rows: string[][], note: string): ReportAuditTable | null => rows.length === 0 ? null : {
    heading,
    headers: ["Line", ...columns.map(c => `${c.months === 3 ? "Quarter" : `${c.months} months`} ended ${c.periodEnd}`)],
    rows,
    note: [sourceNote, note, qualifications].filter(Boolean).join(" "),
  };
  const difference = row("Reported EPS difference (non-GAAP less GAAP)", columns.map(c => {
    if (!documentKnown || !currencyKnown || !validColumn(c)) return DASH;
    const gaap = value("gaap-diluted-eps", c), nonGaap = value("non-gaap-diluted-eps", c);
    if (gaap === null || nonGaap === null) return DASH;
    const delta = nonGaap - gaap;
    const rounded = Number.isFinite(delta) ? decimalRound(delta, 2) : NaN;
    return Number.isFinite(rounded) ? money(rounded, "currency-per-share") : DASH;
  }));
  const issuerFcf = columns.map(c => {
    if (!documentKnown || !currencyKnown || !validColumn(c)) return DASH;
    const observations = d.freeCashFlow.filter(f => f.periodEnd === c.periodEnd && f.months === c.months && sourceKey(f.source) === sourceKey(source));
    const values = [...new Set(observations.map(f => f.value))];
    return values.length === 1 && Number.isFinite(values[0]) ? money(values[0]!) : DASH;
  });
  const fcfLines = [...metricRow("operating-cash-flow"), ...metricRow("total-capital-expenditures"), ...metricRow("purchases-property-equipment"), ...metricRow("principal-payments-property-equipment")];
  const result = [
    table("Issuer free-cash-flow reconciliation", fcfLines.length === 0 ? [] : [...fcfLines, ...row("Free cash flow (issuer definition, as reported)", issuerFcf)],
      "Rows are shown as captured, without recalculating the issuer measure or establishing complete obligation coverage. They do not establish funding capacity or discretionary cash after all obligations."),
    table("GAAP to non-GAAP diluted EPS (issuer reconciliation, per share)", [...metricRow("gaap-diluted-eps"), ...difference, ...metricRow("non-gaap-diluted-eps")],
      "The EPS difference is arithmetic on the reported rounded per-share figures, including any denominator effects. It is not an allocation of item-level taxes or independently normalized recurring earnings."),
    table("Non-GAAP adjustments itemized in the release (amounts)", [...metricRow("equity-securities-gains"), ...metricRow("non-gaap-tax-impact")],
      "Captured issuer amounts only; this is not a complete bridge. Recurrence, item-level tax allocation and independently normalized earnings are not established."),
  ].filter((t): t is ReportAuditTable => t !== null);
  const invalid = facts.filter(f => f.unit !== unitFor(f.metric) || !Number.isFinite(f.value));
  if (invalid.length > 0) result.push({
    heading: "Unqualified issuer reconciliation observations",
    headers: ["Line", "Period ended", "Months", "Observed unit", "Observed value"],
    rows: invalid.map(f => [LABELS[f.metric], f.periodEnd, String(f.months), f.unit, Number.isFinite(f.value) ? money(f.value, f.unit) : "unavailable"]),
    note: `${sourceNote} Observations are retained separately because their units or values cannot enter the labeled reconciliation. ${qualifications}`.trim(),
  });
  return result;
}

/** Never combine documents merely because their reported column dates match. */
export function issuerReconciliationTables(d: FilingDisclosures): ReportAuditTable[] {
  const groups = new Map<string, Fact[]>();
  for (const fact of d.reconciliation ?? []) {
    const key = sourceKey(fact.source);
    const group = groups.get(key) ?? [];
    group.push(fact);
    groups.set(key, group);
  }
  const result = [...groups.values()].flatMap(facts => sourceTables(d, facts));
  // The old record did not retain a document reference for this note. Keep
  // its exact text without attaching it to an arbitrary reconciliation source.
  if (groups.size > 0 && d.quarterlyTrend.length === 0 && d.nonGaapBasisNote) result.push({
    heading: "Retained issuer non-GAAP basis note",
    headers: ["Issuer statement"],
    rows: [[d.nonGaapBasisNote]],
    note: "The retained record does not bind this basis note to a specific supplying document; it does not establish independently normalized earnings.",
  });
  return result;
}
