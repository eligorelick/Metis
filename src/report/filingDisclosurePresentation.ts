import type { ReportAuditTable } from "@/report/auditTables";
import { withoutLegacyPrincipalAnnotation } from "@/report/principalAggregationSafety";
import { decimalRound, formatFinancialValue } from "@/report/format";
import type { FilingDisclosures, FilingRef, GuidanceCheck, GuidanceRow } from "@/report/schema";
import { filingCommentaryOutlookTables, filingFactTables, filingGovernanceTables, type FilingSupplements } from "@/report/filingSupplementPresentation";

/**
 * The report's filing-disclosure tables, grouped by the section that shows
 * them, so the Markdown, print and on-screen surfaces render the same rows.
 * Pure and deterministic.
 */
export type FilingDisclosureSection = "business" | "fundamentals" | "balanceSheet" | "outlook" | "catalystsRisks" | "leadership";

const DASH = "—";

const METRIC_LABELS: Record<GuidanceRow["metric"], string> = {
  revenue: "Revenue",
  "adjusted-ebitda": "Adjusted EBITDA",
  "adjusted-ebitda-margin-expansion": "Adjusted EBITDA margin expansion",
  "gross-margin": "Gross margin",
  "operating-expenses": "Operating expenses",
  "operating-margin": "Operating margin",
  "operating-income": "Operating income",
  "other-income": "Other income (expense)",
  "tax-rate": "Tax rate",
  eps: "Diluted EPS",
  "capital-expenditures": "Capital expenditures",
};

function money(value: number | null, currency: string | null, perShare = false): string {
  return value === null ? DASH : formatFinancialValue(value, perShare ? "currency/share" : "currency", currency);
}

function pct(value: number | null, signed = false, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return DASH;
  return `${signed && value > 0 ? "+" : value < 0 ? "−" : ""}${decimalRound(Math.abs(value), digits).toFixed(digits)}%`;
}

function value(row: { unit: GuidanceRow["unit"] }, v: number, currency: string | null): string {
  return row.unit === "percentage-points" ? `${v} pp` : row.unit === "%" ? pct(v, false, 1) : money(v, currency, row.unit === "currency-per-share");
}

/** "≈$26B": an issuer-qualified amount without decimals the release did not print. */
function approximately(text: string): string {
  return `≈${text.replace(/\.(\d*?)0+([KMBT])/, (_, kept: string, suffix: string) => (kept ? `.${kept}${suffix}` : suffix))}`;
}

/** The segment axis a filing note is about ("Segment XBRL, Geography: …"), or null. */
function segmentNoteAxis(note: string): string | null {
  return /^Segment XBRL, ([^:]+):/.exec(note)?.[1] ?? null;
}

/** A filing note about dividends or repurchase authorization. */
function isCapitalReturnNote(note: string): boolean {
  return /\b(dividend|repurchase|buyback)\b/i.test(note);
}

function basis(b: GuidanceRow["basis"]): string {
  return b === "gaap" ? "GAAP" : b === "non-gaap" ? "Non-GAAP" : "As stated";
}

function filingLabel(ref: FilingRef): string {
  return `${ref.form}${ref.exhibit ? ` ${ref.exhibit}` : ""} filed ${ref.filingDate} (${ref.accession})`;
}

function guidanceTables(d: FilingDisclosures): ReportAuditTable[] {
  const tables: ReportAuditTable[] = [];
  if (d.guidance !== null && d.guidance.rows.length > 0) {
    const g = d.guidance;
    const revisions = g.rows.some((row) => row.previous !== undefined);
    const growth = g.rows.some((row) => row.growth !== undefined);
    tables.push({
      heading: `Management guidance${g.reportedPeriod ? ` (issued with ${g.reportedPeriod} results)` : ""}`,
      headers: ["Period", "Metric", "Basis", "Low", "Midpoint", "High", "Stated as", ...(revisions ? ["Previous guidance"] : []), ...(growth ? ["Current growth", "Previous growth"] : [])],
      rows: g.rows.map((row) => [
        row.period,
        METRIC_LABELS[row.metric],
        basis(row.basis),
        row.form === "range" || row.form === "plus-minus" ? value(row, row.low, d.currency) : DASH,
        value(row, row.mid, d.currency),
        row.form === "range" || row.form === "plus-minus" ? value(row, row.high, d.currency) : DASH,
        row.form === "plus-minus" ? "point ± tolerance" : row.form === "approximate" ? "approximately" : row.form,
        ...(revisions ? [row.previous ? `${value(row, row.previous.low, d.currency)} - ${value(row, row.previous.high, d.currency)}` : DASH] : []),
        ...(growth ? [row.growth ? `${row.growth.low}% - ${row.growth.high}%` : DASH, row.previousGrowth ? `${row.previousGrowth.low}% - ${row.previousGrowth.high}%` : DASH] : []),
      ]),
      note: [`Source: ${filingLabel(g.source)}. Guidance is the company's projection, not a result.`, ...g.qualifiers.map((q) => `Issuer caveat: ${q}`)].join(" "),
    });
  }
  if (d.guidanceChecks.length > 0) {
    tables.push({
      heading: "Results against prior guidance",
      headers: ["Quarter", "Metric", "Guided range", "Guided midpoint", "Actual", "Versus midpoint", "Position"],
      rows: d.guidanceChecks.map((c) => {
        const unit = c.metric === "revenue" ? "currency" : "%";
        const fmt = (v: number): string => (unit === "%" ? pct(v, false, 1) : money(v, d.currency));
        return [
          `${c.period} (ended ${c.periodEnd})`,
          `${METRIC_LABELS[c.metric]}${c.basis === "gaap" ? " (GAAP)" : ""}`,
          c.guidedLow === c.guidedHigh ? DASH : `${fmt(c.guidedLow)} – ${fmt(c.guidedHigh)}`,
          fmt(c.guidedMid),
          fmt(c.actual),
          c.metric === "revenue" ? pct(c.difference, true, 1) : `${c.difference > 0 ? "+" : c.difference < 0 ? "−" : ""}${decimalRound(Math.abs(c.difference), 2).toFixed(2)} pp`,
          c.position === "within" ? "within range" : `${c.position} range`,
        ];
      }),
      note: "Guidance from the earnings release that preceded each quarter; actuals from the quarterly statements for the quarter the next release reported.",
    });
  }
  return tables;
}

function trendTables(d: FilingDisclosures): ReportAuditTable[] {
  const tables: ReportAuditTable[] = [];
  if (d.quarterlyTrend.length > 0) {
    // D-63 fields, rendered where present: the quarter's equity-securities
    // gains and the issuer's non-GAAP diluted EPS (columns that are empty in
    // every quarter are dropped by the renderers).
    const trendNotes = [
      "From the quarterly statement rows. YoY compares with the quarter ending about a year earlier, QoQ with the preceding quarter. FCF here is operating cash flow less capital expenditure; the issuer's own definition is shown separately when its release states it.",
      d.quarterlyTrend.some((r) => r.equitySecuritiesGains != null || r.nonGaapEpsDiluted != null) ? "Equity-securities gains and non-GAAP diluted EPS are read from the issuer's GAAP-to-non-GAAP reconciliation in each earnings release." : "",
      d.nonGaapBasisNote ? `Non-GAAP basis: ${d.nonGaapBasisNote}` : "",
    ].filter((n) => n !== "");
    tables.push({
      heading: "Quarterly trend (last eight quarters)",
      headers: ["Quarter ended", "Fiscal", "Revenue", "YoY", "QoQ", "Gross margin", "Operating expenses", "Operating margin", "Diluted EPS", "Non-GAAP diluted EPS", "Equity-securities gains", "Operating cash flow", "FCF (CFO − capex)"],
      rows: d.quarterlyTrend.map((r) => [
        r.periodEnd,
        r.fiscalLabel ?? DASH,
        money(r.revenue, d.currency),
        pct(r.revenueYoyPct, true),
        pct(r.revenueQoqPct, true),
        pct(r.grossMarginPct),
        money(r.operatingExpenses, d.currency),
        pct(r.operatingMarginPct),
        r.epsDiluted === null ? DASH : money(r.epsDiluted, d.currency, true),
        r.nonGaapEpsDiluted == null ? DASH : money(r.nonGaapEpsDiluted, d.currency, true),
        r.equitySecuritiesGains == null ? DASH : money(r.equitySecuritiesGains, d.currency),
        money(r.operatingCashFlow, d.currency),
        money(r.freeCashFlow, d.currency),
      ]),
      note: trendNotes.join(" "),
    });
  }
  const fcf = d.freeCashFlow;
  const cr = d.capitalReturn;
  if (fcf.length > 0 || cr !== null) {
    const rows: string[][] = fcf.map((f) => [
      `Free cash flow (issuer definition), ${f.months === 3 ? "quarter" : `${f.months} months`} ended ${f.periodEnd}`,
      money(f.value, d.currency),
      filingLabel(f.source),
    ]);
    if (cr !== null) {
      const src = filingLabel(cr.source);
      // D-62: the release's own qualifier ("approximately $26.0 billion") is
      // carried, not replaced by false precision ("$26.00B").
      if (cr.returned !== null) rows.push([`Returned to shareholders (repurchases + dividends)${cr.returnedPeriod ? `, ${cr.returnedPeriod}` : ""}`, cr.returnedApproximate === true ? approximately(money(cr.returned, d.currency)) : money(cr.returned, d.currency), src]);
      if (cr.authorizationRemaining !== null) rows.push([`Repurchase authorization remaining${cr.authorizationRemainingAsOf ? ` as of ${cr.authorizationRemainingAsOf}` : ""}`, cr.authorizationRemainingApproximate === true ? approximately(money(cr.authorizationRemaining, d.currency)) : money(cr.authorizationRemaining, d.currency), cr.authorizationRemainingSource ? filingLabel(cr.authorizationRemainingSource) : src]);
      if (cr.authorizationAdded !== null) rows.push(["Repurchase authorization added", money(cr.authorizationAdded, d.currency), src]);
      if (cr.dividendPerShare !== null) {
        const dates = [cr.dividendPayDate ? `payable ${cr.dividendPayDate}` : null, cr.dividendRecordDate ? `record ${cr.dividendRecordDate}` : null].filter(Boolean).join(", ");
        rows.push([`Quarterly cash dividend per share${dates ? ` (${dates})` : ""}`, money(cr.dividendPerShare, d.currency, true), src]);
      }
      if (cr.dividendChangeFrom !== null && cr.dividendChangeTo !== null) rows.push(["Dividend change (per share, quarterly)", `${money(cr.dividendChangeFrom, d.currency, true)} → ${money(cr.dividendChangeTo, d.currency, true)}`, src]);
    }
    const capitalNotes = d.notes.filter(isCapitalReturnNote);
    const note = [d.freeCashFlowDefinition ? `Issuer definition: ${d.freeCashFlowDefinition}` : "", ...capitalNotes].filter((n) => n !== "").join(" ");
    tables.push({
      heading: "Issuer-reported free cash flow and capital return",
      headers: ["Item", "Amount", "Source"],
      rows,
      ...(note ? { note } : {}),
    });
  }
  tables.push(...reconciliationTables(d));
  return tables;
}

type ReconciliationMetric = NonNullable<FilingDisclosures["reconciliation"]>[number]["metric"];
const RECONCILIATION_LABEL: Record<ReconciliationMetric, string> = {
  "operating-cash-flow": "Net cash provided by operating activities",
  "total-capital-expenditures": "Total capital expenditures (positive outflow)",
  "purchases-property-equipment": "Purchases of property, equipment and intangible assets",
  "principal-payments-property-equipment": "Principal payments on property, equipment and intangible assets",
  "gaap-diluted-eps": "GAAP diluted EPS",
  "equity-securities-gains": "Gains on equity securities",
  "non-gaap-tax-impact": "Tax effect of non-GAAP adjustments",
  "non-gaap-diluted-eps": "Non-GAAP diluted EPS",
};

/**
 * D-63: the latest release's own reconciliation rows, by column: the issuer's
 * free-cash-flow bridge and its GAAP-to-non-GAAP EPS bridge. Values are shown
 * as the release states them; nothing is recomputed. Absent on older reports.
 */
function reconciliationTables(d: FilingDisclosures): ReportAuditTable[] {
  const facts = d.reconciliation ?? [];
  if (facts.length === 0) return [];
  const columnKey = (f: { periodEnd: string; months: number }) => `${f.months}|${f.periodEnd}`;
  const columns = [...new Map(facts.map((f) => [columnKey(f), f])).values()]
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd) || a.months - b.months);
  const header = (c: { periodEnd: string; months: number }) => `${c.months === 3 ? "Quarter" : `${c.months} months`} ended ${c.periodEnd}`;
  const fact = (metric: ReconciliationMetric, c: { periodEnd: string; months: number }) =>
    facts.find((f) => f.metric === metric && columnKey(f) === columnKey(c));
  const row = (label: string, cells: string[]): string[][] => (cells.every((cell) => cell === DASH) ? [] : [[label, ...cells]]);
  const metricRow = (metric: ReconciliationMetric): string[][] => row(RECONCILIATION_LABEL[metric], columns.map((c) => {
    const f = fact(metric, c);
    return f ? money(f.value, d.currency, f.unit === "currency-per-share") : DASH;
  }));
  const table = (heading: string, rows: string[][], note?: string): ReportAuditTable | null => (rows.length === 0 ? null : {
    heading,
    headers: ["Line", ...columns.map(header)],
    rows,
    note: [`Source: ${filingLabel(facts[0]!.source)}.`, note ?? ""].filter((n) => n !== "").join(" "),
  });
  const sameDay = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) <= 3 * 86_400_000;
  const issuerFcf = columns.map((c) => {
    const f = d.freeCashFlow.find((x) => x.months === c.months && sameDay(x.periodEnd, c.periodEnd));
    return f ? money(f.value, d.currency) : DASH;
  });
  // D-67: the EPS bridge mixed per-share and amount rows and had no
  // adjustment line, so it did not foot. The per-share table foots: GAAP, the
  // total adjustment as the difference of the two reported figures, non-GAAP.
  // The itemized amounts are a second table, labelled as the lines captured.
  const adjustment = row("Non-GAAP adjustments, net of tax (non-GAAP less GAAP)", columns.map((c) => {
    const gaap = fact("gaap-diluted-eps", c)?.value;
    const nonGaap = fact("non-gaap-diluted-eps", c)?.value;
    return gaap === undefined || nonGaap === undefined ? DASH : money(decimalRound(nonGaap - gaap, 2), d.currency, true);
  }));
  const perShareNote = [
    adjustment.length > 0 ? "The adjustment line is the difference of the two reported per-share figures, so it includes every adjustment the release makes and the table foots. Any issuer share-denominator adjustments are included in this per-share difference; this is not an allocation of item-level taxes." : "",
    d.nonGaapBasisNote ? `Non-GAAP basis: ${d.nonGaapBasisNote}` : "",
  ].filter((n) => n !== "").join(" ");
  const fcfLines = [...metricRow("operating-cash-flow"), ...metricRow("total-capital-expenditures"), ...metricRow("purchases-property-equipment"), ...metricRow("principal-payments-property-equipment")];
  return [
    table("Issuer free-cash-flow reconciliation", fcfLines.length === 0 ? [] : [...fcfLines, ...row("Free cash flow (issuer definition, as reported)", issuerFcf)]),
    table("GAAP to non-GAAP diluted EPS (issuer reconciliation, per share)", [
      ...metricRow("gaap-diluted-eps"), ...adjustment, ...metricRow("non-gaap-diluted-eps"),
    ], perShareNote || undefined),
    table("Non-GAAP adjustments itemized in the release (amounts)", [
      ...metricRow("equity-securities-gains"), ...metricRow("non-gaap-tax-impact"),
    ], "The release lines captured, as stated. Its other adjustment lines were not captured, so these amounts are not a complete bridge; the per-share table includes every adjustment."),
  ].filter((t): t is ReportAuditTable => t !== null);
}

/**
 * D-63: the commitments and guarantees tables (row totals, then each table's
 * total) as the release or CFO commentary states them. Absent on older reports.
 */
function commitmentTables(d: FilingDisclosures): ReportAuditTable[] {
  const rows = d.commitments ?? [];
  const totals: ReportAuditTable[] = rows.length === 0 ? [] : [{
    heading: "Commitments and guarantees",
    headers: ["Table", "Item", "Amount", "As of", "Source"],
    rows: rows.map((r) => [r.table, r.tableTotal ? "Total" : r.label, money(r.total, d.currency), r.asOf ?? DASH, filingLabel(r.source)]),
    note: "Contractual amounts as the issuer tabulates them; guarantees are maximum gross exposure, not expected payments. Neither is in the DCF's net debt." +
      (d.commitments?.some((r) => r.kind === "guarantees" && r.asOf === null) ? " The guarantee table supplies no exact as-of date and may include post-period agreements; the source dates are filing dates, not a quarter-end exposure date." : ""),
  }];
  const timing: ReportAuditTable[] = (d.commitmentPaymentTiming ?? []).map(table => {
    const observations = table.rows.flatMap(row => row.buckets.map(bucket => [
      `${row.label}${row.tableTotal ? " (table check only)" : ""}`,
      bucket.label,
      bucket.amount === null ? "unknown" : money(bucket.amount, table.currency),
      bucket.raw || "(missing)",
      row.total === null ? "unknown" : money(row.total, table.currency),
      row.totalRaw ?? "(missing)",
      row.reconciliation.status === "reconciled-as-printed" ? "reconciled as printed"
        : row.reconciliation.status === "mismatch" ? `does not reconcile (residual ${money(row.reconciliation.residual, table.currency)})` : "not established",
    ]));
    const scale = table.scale === 1e9 ? "billions" : table.scale === 1e6 ? "millions" : "unknown";
    return {
      heading: `Payment timing as reported — ${table.table}, source table ${table.tableIndex + 1}`,
      headers: ["Item", "Reported fiscal bucket", "Amount", "Printed cell", "Reported row total", "Printed total", "Row reconciliation"],
      rows: observations.length > 0 ? observations : [["Timing unavailable", DASH, "unknown", DASH, "unknown", DASH, "not established"]],
      note: [
        `Parsed-table coverage: ${table.coverage}; this describes only the supplying table, not all issuer obligations.`,
        `Source: ${filingLabel(table.source)}${table.source.url ? `; ${table.source.url}` : ""}. Table as of: ${table.asOf ?? "unknown"}.`,
        `Original column header: ${table.sourceHeader || "unavailable"}. Printed scale: ${scale}; symbol: ${table.currencySymbol ?? "unknown"}; admitted currency: ${table.currency ?? "unknown"}.`,
        table.reason ?? "",
        "Fiscal labels are not calendar maturity dates; remainder and thereafter labels do not establish exact due dates. Table totals are checks, not additional obligations. Recognized leases, guarantees and purchase commitments remain distinct and overlap with debt is not resolved; these amounts are not added to net debt or deducted again from the DCF. Obligor cash, transfer restrictions, covenants and available financing are not established; funding capacity and solvency are not assessed.",
        table.coverage !== "complete" ? `Retained table evidence: ${table.sourceText}` : "",
      ].filter(Boolean).join(" "),
    };
  });
  return [...totals, ...timing];
}

/**
 * D-63: the company-level guidance track record per metric and basis, from
 * the results-against-guidance rows (counts and the mean difference only).
 */
function trackRecordTable(d: FilingDisclosures): ReportAuditTable[] {
  if (d.guidanceChecks.length < 2) return [];
  const groups = new Map<string, GuidanceCheck[]>();
  for (const c of d.guidanceChecks) {
    const key = `${METRIC_LABELS[c.metric]}${c.basis === "gaap" ? " (GAAP)" : ""}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const rows = [...groups.entries()].map(([label, checks]) => {
    const count = (position: string) => checks.filter((c) => c.position === position).length;
    const mean = checks.reduce((sum, c) => sum + c.difference, 0) / checks.length;
    const sorted = [...checks].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
    return [
      label,
      `${sorted[0]!.period} – ${sorted[sorted.length - 1]!.period}`,
      String(checks.length),
      `${count("above")} above · ${count("within")} within · ${count("below")} below`,
      checks[0]!.metric === "revenue" ? pct(mean, true, 1) : `${mean > 0 ? "+" : mean < 0 ? "−" : ""}${decimalRound(Math.abs(mean), 2).toFixed(2)} pp`,
    ];
  });
  return [{
    heading: "Guidance track record",
    headers: ["Metric", "Quarters", "Checked", "Against the guided range", "Mean versus midpoint"],
    rows,
    note: "Company-level record from the results-against-guidance rows; not attributed to an individual.",
  }];
}

function segmentTables(d: FilingDisclosures): ReportAuditTable[] {
  return d.segments.map((s) => {
    const latest = s.quarters[0]!;
    const yearAgo = s.quarters.findIndex((q, i) => i > 0 && Math.abs((Date.parse(`${latest}T00:00:00Z`) - Date.parse(`${q}T00:00:00Z`)) / 86_400_000 - 364) <= 16);
    const growth = (values: (number | null)[], i: number): string => {
      const now = values[0];
      const prior = i < 0 ? null : values[i] ?? null;
      return now === null || now === undefined || prior === null || prior <= 0 ? DASH : pct((now / prior - 1) * 100, true);
    };
    const total = s.total[0] ?? null;
    const rows = s.rows.map((r) => [
      r.childOf === null ? r.label : `  ↳ ${r.label}`,
      ...s.quarters.map((_, i) => money(r.values[i] ?? null, s.currency)),
      growth(r.values, 1),
      growth(r.values, yearAgo),
      total !== null && total > 0 && r.values[0] !== null && r.values[0] !== undefined ? pct((r.values[0] / total) * 100) : DASH,
    ]);
    rows.push(["Total revenue", ...s.quarters.map((_, i) => money(s.total[i] ?? null, s.currency)), growth(s.total, 1), growth(s.total, yearAgo), total !== null ? "100.0%" : DASH]);
    const notes = [
      `XBRL revenue facts from ${s.sources.join(", ")}; the newest filing's figure wins where filings overlap (recast comparatives).`,
      s.rows.some((r) => r.childOf !== null) ? "Indented rows are components of the row above them." : "",
      s.priorPresentation.length > 0 ? `Members tagged only in earlier quarters (a prior presentation) are omitted: ${s.priorPresentation.join(", ")}.` : "",
      s.derivedCells > 0 ? `${s.derivedCells} cell(s) are derived as the difference of two reported windows (for example a fiscal year less nine months).` : "",
      // D-67: a segment axis's own filing note sits under its table, not under guidance.
      ...d.notes.filter((n) => segmentNoteAxis(n) === s.axisLabel).map((n) => n.replace(/^Segment XBRL, [^:]+:\s*/, "")),
      "A dash means the member is not tagged for that quarter.",
    ].filter((n) => n !== "");
    return {
      heading: `Segment revenue by quarter — ${s.axisLabel}`,
      headers: ["Segment", ...s.quarters, "QoQ", "YoY", `Share (${latest})`],
      rows,
      note: notes.join(" "),
    };
  });
}

function segmentPerformanceTables(d: FilingDisclosures): ReportAuditTable[] {
  if (!d.segmentPerformance?.length) return [];
  return [{ heading: "Segment adjusted EBITDA margins (matched quarterly tables)",
    headers: ["Segment", "Quarter ended", "Revenue", "Adjusted EBITDA", "Margin", "Prior quarter ended", "Prior revenue", "Prior adjusted EBITDA", "Prior margin", "YoY change", "Source"],
    rows: d.segmentPerformance.map((r) => [r.segment, r.periodEnd, money(r.revenue, r.currency), money(r.profit, r.currency), pct(r.marginPct), r.comparisonPeriodEnd,
      money(r.priorRevenue, r.currency), money(r.priorProfit, r.currency), pct(r.priorMarginPct), `${decimalRound(r.changeBasisPoints, 1).toFixed(1)} bp`, filingLabel(r.source)]),
    note: "Issuer segment adjusted EBITDA divided by the same segment's revenue for matching quarterly columns, currency and scale. Prior margin uses the comparative column in the same filing. These are not consolidated GAAP margins and do not establish that investment spending will succeed.",
  }];
}
function eventTable(d: FilingDisclosures): ReportAuditTable[] {
  if (d.events.length === 0) return [];
  const corrected = d.events.some((e) => e.summaryCorrection !== undefined || withoutLegacyPrincipalAnnotation(e.summary) !== e.summary);
  return [{
    heading: "Material SEC current reports (Form 8-K, last 12 months)",
    headers: ["Filed", "Event date", "Items", "Summary", "Accession"],
    rows: d.events.map((e) => [e.filingDate, e.eventDate ?? DASH, e.items.join(", "), withoutLegacyPrincipalAnnotation(e.summary), e.accession]),
    note: "Items 1.01 (material agreement), 1.02, 2.01, 2.03 (off-balance-sheet or direct financial obligation), 2.05, 2.06, 5.02 (officers and directors) and 8.01 (other events). Earnings releases (Item 2.02) appear under guidance." + (corrected ? " An earlier generated principal total was withheld or re-derived; the appendix explains this deterministic correction." : ""),
  }];
}

function companyStatementTables(d: FilingDisclosures): ReportAuditTable[] {
  return (d.companyStatements ?? []).map((statement) => ({
    heading: `Official company statement: ${statement.title}`,
    headers: ["Item", "Evidence"],
    rows: [
      ["Authority", `Official company ${statement.category === "acquisition" ? "acquisition" : "executive-transition"} statement`],
      ["Statement status", statement.status === "issuer-stated-completed" ? "Issuer states completed" : "Issuer announced"],
      ["Published", statement.publishedAt], ["Observed", statement.observedAt],
      ["Statement", statement.text], ["Source URL", statement.url],
      ["Source SHA-256", statement.sourceHash], ["Authority path", statement.authorityChain.join(" -> ")],
      ["Consideration and funding", "Not established by this reader"],
    ],
    note: statement.limitations,
  }));
}

export function filingDisclosureTables(d: (FilingDisclosures & FilingSupplements) | undefined, section: FilingDisclosureSection): ReportAuditTable[] {
  if (!d) return [];
  switch (section) {
    case "business": return [...segmentTables(d), ...segmentPerformanceTables(d)];
    case "fundamentals": return trendTables(d);
    case "balanceSheet": return [...commitmentTables(d), ...filingFactTables(d)];
    case "leadership": return filingGovernanceTables(d);
    case "outlook": {
      const tables = [...guidanceTables(d), ...trackRecordTable(d), ...filingCommentaryOutlookTables(d)];
      // D-62: dividend and repurchase-authorization notes belong with the
      // capital-return table, not under results against guidance — unless
      // that table is not shown.
      const capitalShown = d.freeCashFlow.length > 0 || d.capitalReturn !== null;
      const shownAxes = new Set(d.segments.map((s) => s.axisLabel));
      const notes = [d.currencyBasis, ...d.notes.filter((n) => !n.startsWith("Annual geographic revenue (") && (!capitalShown || !isCapitalReturnNote(n)) && !shownAxes.has(segmentNoteAxis(n) ?? ""))].join(" ");
      return tables.length > 0 ? tables.map((t, i) => (i === tables.length - 1 ? { ...t, note: `${t.note ?? ""} ${notes}`.trim() } : t)) : d.notes.length > 0 ? [{ heading: "Management guidance", headers: ["Status"], rows: [["No structured guidance rows were extracted; see separately sourced narrative guidance where available."]], note: notes }] : [];
    }
    case "catalystsRisks": return [...eventTable(d), ...companyStatementTables(d)];
  }
}
