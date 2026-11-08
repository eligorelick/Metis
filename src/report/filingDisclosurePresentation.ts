import { sameSegmentBasis, crossFilingClause, priorQuarterIndex, QOQ_WINDOW_DAYS, YOY_WINDOW_DAYS } from "@/edgar/segmentFacts";
import { decodeEntities } from "@/edgar/extract";
import type { ReportAuditTable } from "@/report/auditTables";
import { withoutLegacyPrincipalAnnotation } from "@/report/principalAggregationSafety";
import { decimalRound, formatFinancialValue } from "@/report/format";
import { issuerReconciliationTables } from "@/report/reconciliationPresentation";
import type { FilingDisclosures, FilingRef, GuidanceCheck, GuidanceRow } from "@/report/schema";
import { MaterialEventItemsSchema } from "@/report/schema";
import { isLenderConvention, readerBaseUnits } from "@/report/readerConventions";
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
  return /^Segment XBRL, ([^:]+?)(?: axis withheld)?:/.exec(note)?.[1] ?? null;
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
        /^(fiscal quarter|fiscal year)$/.test(row.period) ? `${row.period} (issuer label withheld: statement periods contradict it)` : row.period,
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

/**
 * Integration review of R2 + R3 (FIGR paid audit): the notes the quarterly-trend
 * builder adds about its own rows and columns (rejected or currency-cut rows,
 * derived cash flow, withheld operating amounts and the operating-expense
 * basis). They are read beside the trend, never under management guidance.
 */
export function isQuarterlyTrendNote(note: string): boolean {
  return /^Quarterly (?:(?:income|cash-flow) trend: |trend left out: |trend history stops before |cash-flow amounts for |operating cash flow for )/.test(note) ||
    /^Operating (?:income and operating margin|expenses) for \d{4}-\d{2}-\d{2} withheld: /.test(note) ||
    note.startsWith("Operating expenses not shown for ") ||
    note.startsWith("Operating expenses are the provider's subtotal");
}

function trendTables(d: FilingDisclosures): ReportAuditTable[] {
  const tables: ReportAuditTable[] = [];
  const builderNotes = d.notes.filter(isQuarterlyTrendNote);
  const showGrossMargin = !d.quarterlyGrossMarginNotApplicable;
  // Final data-only FIGR run (2026-11-02): a quarter whose every shown value is
  // withheld (FIGR's Q4 FY2024: refused revenue, then R2's withheld operating
  // expenses) is named as a missing quarter, not printed as a row of dashes.
  const trendRows = d.quarterlyTrend.filter((r) => [r.revenue, r.revenueYoyPct, r.revenueQoqPct, ...(showGrossMargin ? [r.grossMarginPct] : []),
    r.operatingExpenses, r.operatingMarginPct, r.epsDiluted, r.nonGaapEpsDiluted, r.equitySecuritiesGains, r.operatingCashFlow, r.freeCashFlow].some((v) => v != null));
  if (trendRows.length === 0 && builderNotes.length > 0) {
    tables.push({ heading: "Quarterly trend", headers: ["Status"], rows: [["No quarterly rows are shown; see the note."]], note: readerBaseUnits(builderNotes.join(" ")) });
  }
  if (trendRows.length > 0) {
    // D-63 fields, rendered where present: the quarter's equity-securities
    // gains and the issuer's non-GAAP diluted EPS (columns that are empty in
    // every quarter are dropped by the renderers).
    const trendNotes = [
      `From the quarterly statement rows. YoY compares with the quarter ending about a year earlier, QoQ with the preceding quarter${d.quarterlyTrendPresentationChecked === true ? "; where the filings show a re-presentation, each growth cell divides two quarters on one presentation or is not shown, with a note" : ""}.${trendRows.some(r => r.freeCashFlow !== null) ? " FCF here is operating cash flow less capital expenditure; the issuer's own definition is shown separately when its release states it." : ""}`,
      missingQuarterNote(trendRows.map(r => r.periodEnd)),
      trendRows.some((r) => r.equitySecuritiesGains != null || r.nonGaapEpsDiluted != null) ? "Equity-securities gains and non-GAAP diluted EPS are read from the issuer's GAAP-to-non-GAAP reconciliation in each earnings release." : "",
      d.nonGaapBasisNote ? `Non-GAAP basis: ${d.nonGaapBasisNote}` : "",
      ...readerTrendNotes([...new Set(trendRows.flatMap((r) => r.revenueGrowthNotes ?? [])), ...builderNotes]),
    ].filter((n) => n !== "");
    tables.push({
      // FIGR extra-high audit B2-20: the caption counts the quarters shown
      // (seven when two quarters inside the window are missing).
      heading: `Quarterly trend (latest ${countWord(trendRows.length)} available ${trendRows.length === 1 ? "quarter" : "quarters"})`,
      headers: ["Quarter ended", "Fiscal", "Revenue", "YoY", "QoQ", ...(showGrossMargin ? ["Gross margin"] : []), "Operating expenses", "Operating margin", "Diluted EPS", "Non-GAAP diluted EPS", "Equity-securities gains", "Operating cash flow", "FCF (CFO \u2212 capex)"],
      rows: trendRows.map((r) => [
        r.periodEnd,
        r.fiscalLabel ?? DASH,
        money(r.revenue, d.currency),
        pct(r.revenueYoyPct, true),
        pct(r.revenueQoqPct, true),
        ...(showGrossMargin ? [pct(r.grossMarginPct)] : []),
        money(r.operatingExpenses, d.currency),
        pct(r.operatingMarginPct),
        r.epsDiluted === null ? DASH : money(r.epsDiluted, d.currency, true),
        r.nonGaapEpsDiluted == null ? DASH : money(r.nonGaapEpsDiluted, d.currency, true),
        r.equitySecuritiesGains == null ? DASH : money(r.equitySecuritiesGains, d.currency),
        money(r.operatingCashFlow, d.currency),
        money(r.freeCashFlow, d.currency),
      ]),
      note: readerBaseUnits(trendNotes.join(" ")),
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
        rows.push([`${cr.dividendFrequency === undefined ? "Quarterly" : cr.dividendFrequency === null ? "Cash" : cr.dividendFrequency[0]!.toUpperCase()+cr.dividendFrequency.slice(1)}${cr.dividendFrequency===null ? "" : " cash"} dividend per share${cr.dividendFrequency===null ? " (frequency not stated)":""}${dates ? ` (${dates})` : ""}`, money(cr.dividendPerShare, d.currency, true), src]);
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
  tables.push(...issuerReconciliationTables(d));
  return tables;
}

const COUNT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

/* FIGR extra-high audit B2-18: one row's derivation per growth cell and per
 * derived cash-flow quarter made the trend note run to hundreds of words. The
 * reader gets one sentence for each kind; the audit export keeps every one. */
const GROWTH_DERIVATION = /^(?:YoY|QoQ) at \d{4}-\d{2}-\d{2} uses filed revenue [^;]+; no vendor operand enters the rate\.$/;
const CASH_FLOW_DERIVATION = /^Quarterly operating cash flow for (\d{4}-\d{2}-\d{2}) is derived \([^)]*\) from cumulative filed operands across filings: ([\s\S]*?)\. The canonical filing-lineage rule admits this derivation; it is not a directly filed standalone quarter\.$/;

function dateList(dates: readonly string[]): string {
  return dates.length <= 1 ? dates.join("") : `${dates.slice(0, -1).join(", ")} and ${dates.at(-1)}`;
}

/** Trend notes for readers: per-cell derivations summarized, every other note kept in order. */
function readerTrendNotes(notes: readonly string[]): string[] {
  const derived = notes.flatMap((note) => {
    const m = CASH_FLOW_DERIVATION.exec(note);
    // N4b: each derived quarter keeps the filings it comes from (filing dates stay in the audit export).
    return m ? [{ quarter: m[1]!, filings: m[2]!.split(/;\s*/).map((f) => f.replace(/, filed \d{4}-\d{2}-\d{2}$/, "")).join(" and ") }] : [];
  });
  let growthSummarized = false;
  let cashFlowSummarized = false;
  return notes.flatMap((note) => {
    if (GROWTH_DERIVATION.test(note)) {
      if (growthSummarized) return [];
      growthSummarized = true;
      return ["Each growth rate shown divides filed revenue on one presentation; no vendor figure enters a rate."];
    }
    if (CASH_FLOW_DERIVATION.test(note)) {
      if (cashFlowSummarized) return [];
      cashFlowSummarized = true;
      return [`Quarterly operating cash flow for ${dateList(derived.map((d) => d.quarter))} is derived as a difference of cumulative filed amounts across filings, not filed as ${derived.length > 1 ? "standalone quarters" : "a standalone quarter"} (${derived.map((d) => `${d.quarter} from ${d.filings}`).join("; ")}).`];
    }
    return [note];
  });
}

/** Every growth-cell derivation recorded on the trend rows, for the audit export. */
export function quarterlyTrendGrowthNotes(d: Pick<FilingDisclosures, "quarterlyTrend"> | undefined): string[] {
  return [...new Set((d?.quarterlyTrend ?? []).flatMap((r) => r.revenueGrowthNotes ?? []))];
}

/** Identify holes inside the retained window; never manufacture a refused statement row. */
function missingQuarterNote(ends: string[]): string {
  const sorted = [...new Set(ends)].sort();
  const missing: string[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prior = new Date(`${sorted[i - 1]}T00:00:00Z`);
    const next = new Date(`${sorted[i]}T00:00:00Z`);
    const months = (next.getUTCFullYear() - prior.getUTCFullYear()) * 12 + next.getUTCMonth() - prior.getUTCMonth();
    // Week-based fiscal calendars may differ by a few days; a gap is at least five months.
    for (let offset = 3; offset < months - 1; offset += 3) {
      const target = new Date(Date.UTC(prior.getUTCFullYear(), prior.getUTCMonth() + offset + 1, 0));
      const monthEnd = prior.getUTCDate() === new Date(Date.UTC(prior.getUTCFullYear(), prior.getUTCMonth() + 1, 0)).getUTCDate();
      if (!monthEnd) target.setUTCDate(Math.min(prior.getUTCDate(), target.getUTCDate()));
      missing.push(target.toISOString().slice(0, 10));
    }
  }
  return missing.length ? `Missing quarter${missing.length > 1 ? "s" : ""} within the displayed window: ${missing.join(", ")}. No row is inferred for an unavailable or refused quarter.` : "";
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
  const tables = d.segments.map((s) => {
    const latest = s.quarters[0]!;
    // AI-406: growth only against the quarter the column names; no such quarter gives a dash.
    const quarterAgo = priorQuarterIndex(s.quarters, QOQ_WINDOW_DAYS) ?? -1;
    const yearAgo = priorQuarterIndex(s.quarters, YOY_WINDOW_DAYS) ?? -1;
    const growth = (values: (number | null)[], i: number): string => {
      const now = values[0];
      const prior = i < 0 ? null : values[i] ?? null;
      return now === null || now === undefined || prior === null || prior <= 0 ? DASH : pct((now / prior - 1) * 100, true);
    };
    const change = (values: (number | null)[], earlier: readonly number[] | undefined): string => {
      const now = values[0];
      const prior = yearAgo < 0 ? null : values[yearAgo];
      if (now == null || prior == null || !sameSegmentBasis(earlier, 0, yearAgo)) return DASH;
      const delta = now - prior;
      return `${delta > 0 ? "+" : ""}${money(delta, s.currency)}`;
    };
    const total = s.total[0] ?? null;
    const rows = s.rows.map((r) => [
      r.childOf === null ? decodeEntities(r.label) : `  ↳ ${decodeEntities(r.label)}`,
      ...s.quarters.map((_, i) => money(r.values[i] ?? null, s.currency)),
      sameSegmentBasis(r.earlierPresentationAt,0,quarterAgo) ? growth(r.values, quarterAgo) : DASH,
      sameSegmentBasis(r.earlierPresentationAt,0,yearAgo) ? growth(r.values, yearAgo) : DASH,
      change(r.values, r.earlierPresentationAt),
      total !== null && total > 0 && r.values[0] !== null && r.values[0] !== undefined ? pct((r.values[0] / total) * 100) : DASH,
    ]);
    rows.push(["Total revenue", ...s.quarters.map((_, i) => money(s.total[i] ?? null, s.currency)), sameSegmentBasis(s.totalEarlierPresentationAt,0,quarterAgo) ? growth(s.total, quarterAgo) : DASH, sameSegmentBasis(s.totalEarlierPresentationAt,0,yearAgo) ? growth(s.total, yearAgo) : DASH, change(s.total, s.totalEarlierPresentationAt), total !== null ? "100.0%" : DASH]);
    const notes = [
      crossFilingClause(s.quarters.filter((_,i)=>s.totalCrossFilingAt?.includes(i)||s.rows.some(r=>r.crossFilingAt?.includes(i)))).trim(),
      `XBRL revenue facts from ${s.sources.join(", ")}; the newest filing's figure wins where filings overlap (recast comparatives).`,
      s.rows.some((r) => r.childOf !== null) ? "Indented rows are components of the row above them." : "",
      `YoY revenue change subtracts the comparable quarter ended ${yearAgo < 0 ? "(unavailable)" : s.quarters[yearAgo]} from ${latest}, on the same presentation. Indented component rows are not added again to their parent; changes are not profit contributions or proof that displayed members exhaust consolidated revenue.`,
      s.priorPresentation.length > 0 ? `Members tagged only in earlier quarters (a prior presentation) are omitted: ${s.priorPresentation.join(", ")}.` : "",
      s.derivedCells > 0 ? `${s.derivedCells} cell(s) are derived as the difference of two reported windows (for example a fiscal year less nine months).` : "",
      // D-67: a segment axis's own filing note sits under its table, not under guidance.
      ...d.notes.filter((n) => segmentNoteAxis(n) === s.axisLabel).map((n) => n.replace(/^Segment XBRL, [^:]+:\s*/, "")),
      "A dash means the member is not tagged for that quarter.",
    ].filter((n) => n !== "");
    return {
      heading: `Segment revenue by quarter — ${s.axisLabel}`,
      headers: ["Segment", ...s.quarters, "QoQ", "YoY", "YoY revenue change", `Share (${latest})`],
      rows,
      note: notes.join(" "),
    };
  });
  const shownAxes = new Set(d.segments.map(s => s.axisLabel));
  const unshown = d.notes.filter(note => segmentNoteAxis(note) !== null && !shownAxes.has(segmentNoteAxis(note)!));
  if (unshown.length > 0) tables.push({ heading: "Segment reporting limitations", headers: ["Limitation"],
    rows: unshown.map(note => [note]), note: "These limitations apply to segment coverage; no missing segment values are inferred." });
  return tables;
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
/** Only saved eligibility is described; neither current configuration nor event-row items establish scope. */
export function materialEventScopeNote(d: Pick<FilingDisclosures, "materialEventItems"> | undefined): string {
  const saved = MaterialEventItemsSchema.safeParse(d?.materialEventItems);
  const scope = saved.success
    ? `Recorded eligible material-event item filter: Items ${[...new Set(saved.data)].sort().join(", ")}.`
    : "The saved report did not record its material-event item filter.";
  return `${scope} Only retained filing rows, if any, are shown; completeness of SEC event review is not established. Eligibility remains subject to the filing window and analytical cutoff, document-count limits, omitted unread filings, read/parse failures and text truncation. Earnings releases (Item 2.02) appear under guidance.`;
}

export function materialEventTables(d: FilingDisclosures | undefined): ReportAuditTable[] {
  if (!d?.events.length) return [{ heading: "Material SEC current-report scope", headers: [], rows: [], note: materialEventScopeNote(d) }];
  const corrected = d.events.some((e) => e.summaryCorrection !== undefined || withoutLegacyPrincipalAnnotation(e.summary) !== e.summary);
  return [{
    heading: "Material SEC current reports (Form 8-K, last 12 months)",
    headers: ["Filed", "Event date", "Items", "Summary", "Accession"],
    rows: d.events.map((e) => [e.filingDate, e.eventDate ?? DASH, e.items.join(", "), withoutTocStubs(withoutLegacyPrincipalAnnotation(e.summary)), e.accession]),
    note: materialEventScopeNote(d) + (corrected ? " An earlier generated principal total was withheld or re-derived; the appendix explains this deterministic correction." : ""),
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

/**
 * Audit 2026-10-22 B-24: the notice that a results release reports a period
 * the statements do not reach. One wording for the report banner and the
 * data gap.
 */
export function newerResultsSentence(n: Pick<NonNullable<FilingDisclosures["newerResults"]>, "source" | "reportedPeriod" | "reportedPeriodEnd" | "statementsEnd">): string {
  const period = n.reportedPeriod !== null
    ? `${n.reportedPeriod}${n.reportedPeriodEnd !== null ? ` (quarter ended ${n.reportedPeriodEnd})` : ""}`
    : `the quarter ended ${n.reportedPeriodEnd ?? "after the statements"}`;
  return `Results for ${period} were published in ${n.source.form} ${n.source.accession} on ${n.source.filingDate}; ` +
    `statements, TTM and multiples here end ${n.statementsEnd} and do not reflect them.`;
}

/** The report banner, when the report has a newer-results notice. */
export function newerResultsBanner(d: FilingDisclosures | undefined): string | null {
  return d?.newerResults ? newerResultsSentence(shownFilingDisclosures(d).newerResults!) : null;
}

/**
 * Audit 2026-10-22 B-23: the notice that a periodic report on file covers a
 * period the statements do not reach. One wording for the banner and the gap.
 */
export function newerFilingSentence(n: NonNullable<FilingDisclosures["newerFiling"]>): string {
  return `${n.source.form} ${n.source.accession} for the period ended ${n.periodEnd} was filed on ${n.source.filingDate}; ` +
    `statements, TTM and multiples here end ${n.statementsEnd} and do not include it.`;
}

/** The report banner, when the report has a newer-filing notice. */
export function newerFilingBanner(d: FilingDisclosures | undefined): string | null {
  return d?.newerFiling ? newerFilingSentence(d.newerFiling) : null;
}

export function filingDisclosureTables(d: (FilingDisclosures & FilingSupplements) | undefined, section: FilingDisclosureSection): ReportAuditTable[] {
  if (!d) return section === "catalystsRisks" ? materialEventTables(d) : [];
  d = shownFilingDisclosures(d);
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
      const guidanceNotes = d.notes.filter((n) => !n.startsWith("Annual geographic revenue (") && !isQuarterlyTrendNote(n) && !isLenderConvention(n) && !n.includes("(see Lender conventions)") && (!capitalShown || !isCapitalReturnNote(n)) && segmentNoteAxis(n) === null && /\b(?:guidance|outlook)\b/i.test(n));
      // FIGR extra-high audit B2-18: the currency-reading convention and parser
      // diagnostics are audit material (its diagnostics section lists them).
      const notes = guidanceNotes.filter((n) => !isParserDiagnostic(n)).flatMap(readerGuidanceNote);
      if (tables.length === 0 && [d.currencyBasis, ...guidanceNotes].flatMap(readerGuidanceNote).length > 0) tables.push({ heading: "Management guidance", headers: ["Status"], rows: [["A standardized guidance table is unavailable; separately sourced issuer statements may appear below."]] });
      if (notes.length > 0) tables.push({ heading: "Management guidance notes", headers: ["Note"], rows: notes.map(n => [n]) });
      return tables;
    }
    case "catalystsRisks": {
      const tables = [...materialEventTables(d), ...companyStatementTables(d)];
      const capitalShown = d.freeCashFlow.length > 0 || d.capitalReturn !== null;
      const notes = d.notes.filter(n => !n.startsWith("Annual geographic revenue (") && segmentNoteAxis(n) === null &&
        !isQuarterlyTrendNote(n) && !isLenderConvention(n) && !n.includes("(see Lender conventions)") &&
        (!capitalShown || !isCapitalReturnNote(n)) && !/\b(?:guidance|outlook)\b/i.test(n) && !isParserDiagnostic(n));
      if (notes.length > 0) tables.push({ heading: "Filing review limitations and notes", headers: ["Note"], rows: [...new Set(notes)].map(n => [readerBaseUnits(n)]) });
      return tables;
    }
  }
}

/** Notes about what a parser could not read, which tell a reader nothing about the company. */
function isParserDiagnostic(note: string): boolean {
  return /could not be read as rows/i.test(note) || /^no earnings, EPS or operating-income amount was read in /i.test(note) ||
    /^Earnings inspection limited to /i.test(note);
}

function readerGuidanceNote(note: string): string[] {
  const quoted = /^(.*?): outlook sentence not read as guidance: "([\s\S]+)"\.?$/i.exec(note);
  if (quoted) return [`Issuer outlook statement (${quoted[1]}): “${quoted[2]}”`];
  const statement = /^Issuer outlook statement not read as structured guidance \(([^)]*)\): "([\s\S]+)"\.?$/i.exec(note);
  if (statement) return [`Issuer outlook statement (${statement[1]}): “${statement[2]}”`];
  if (/no structured .*guidance.*(?:extract|read)|no structured guidance could be extracted|none of its sentences could be read as guidance|outlook sentence not read as guidance/i.test(note)) return [];
  const text = readerBaseUnits(note.trim());
  return text ? [/[.!?]$/.test(text) ? text : `${text}.`] : [];
}

export function withoutTocStubs(summary:string):string {
 return summary.replace(/Item \d\.\d{2}: \d{1,3}(?: Table of Contents)?(?=\s+Item \d\.\d{2}:|\s*$)/g, "").replace(/\s+/g," ").trim();
}

export interface FiscalLabelledPeriod { end: string; label: string }
const fiscalYearOf = (label: string) => /FY(\d{4})$/.exec(label)?.[1];
export function fiscalLabelContradictedAt(periods: readonly FiscalLabelledPeriod[], label: string, end: string): boolean {
 return periods.some(p=>Math.abs(Date.parse(p.end)-Date.parse(end))<=3*86400000 &&
  (fiscalYearOf(p.label)!==fiscalYearOf(label) || (p.label.startsWith("Q") && label.startsWith("Q") && p.label!==label) || (/^FY/.test(p.label) && /^Q[1-3] /.test(label))));
}
export function fiscalLabelEndedBy(periods: readonly FiscalLabelledPeriod[], label: string, cutoff: string): boolean {
 return periods.some(p=>p.label===label && p.end<=cutoff);
}
/** One completed-release rule for excerpt titles and deterministic tables. */
export function fiscalLabelContradicted(periods: readonly FiscalLabelledPeriod[], label: string, end: string): boolean {
 if (fiscalLabelContradictedAt(periods,label,end)) return true;
 if (periods.some(p=>Math.abs(Date.parse(p.end)-Date.parse(end))<=3*86400000)) return false;
 if (periods.some(p=>p.label===label && Date.parse(end)-Date.parse(p.end)>45*86400000)) return true;
 const q = /^Q([1-4]) FY(\d{4})$/.exec(label);
 if (!q) return false;
 const sorted=[...periods].sort((a,b)=>b.end.localeCompare(a.end));
 const quarter=sorted.find(p=>/^Q[1-4] FY\d{4}$/.test(p.label));
 if (quarter) {
  const old=/^Q([1-4]) FY(\d{4})$/.exec(quarter.label)!;
  const successor=old[1]==="4"?`Q1 FY${Number(old[2])+1}`:`Q${Number(old[1])+1} FY${old[2]}`;
  const days=(Date.parse(end)-Date.parse(quarter.end))/86400000;
  return !(days>=80 && days<=100 && label===successor);
 }
 const annual=sorted.find(p=>/^FY\d{4}$/.test(p.label));
 if (!annual) return false;
 const n=Number(q[1]),days=(Date.parse(end)-Date.parse(annual.end))/86400000;
 return !(days>=91*n-11 && days<=Math.min(91*n+9,366) && Number(q[2])===Number(fiscalYearOf(annual.label))+1);
}
/** An outlook must follow the newest labelled statement available by filing date. */
export function fiscalOutlookLabelContradicted(periods: readonly FiscalLabelledPeriod[], label: string, cutoff: string): boolean {
 if (fiscalLabelEndedBy(periods,label,cutoff)) return true;
 const order=(s:string):number|null=>{
  const m=/^(?:Q([1-4]) )?FY(\d{4})$/.exec(s);
  return m?Number(m[2])*4+Number(m[1]??4):null;
 };
 const target=order(label);
 const newest=[...periods].filter(p=>p.end<=cutoff && order(p.label)!==null).sort((a,b)=>b.end.localeCompare(a.end) || order(b.label)!-order(a.label)!)[0];
 return target!==null && newest!==undefined && target<=order(newest.label)!;
}
/** AI-512-V1: withhold disputed labels; never replace them with a guessed fiscal period. */
export function withholdContradictedReleaseLabels<T extends FilingDisclosures>(d:T, periods: readonly FiscalLabelledPeriod[]):T {
 const removed: string[]=[];
 const completed=(label:string|null,end:string|null)=>label!==null && end!==null && fiscalLabelContradicted(periods,label,end);
 let guidance=d.guidance;
 if(guidance) {
  const reported=completed(guidance.reportedPeriod,guidance.reportedPeriodEnd);
  const rows=guidance.rows.map(r=>{
   if(!fiscalOutlookLabelContradicted(periods,r.period,guidance!.source.filingDate)) return r;
   removed.push("an outlook label");
   return {...r,period:r.period.startsWith("Q")?"fiscal quarter":"fiscal year"};
  });
  if(reported) removed.push(`the issued-with label for quarter ended ${guidance.reportedPeriodEnd}`);
  guidance={...guidance,reportedPeriod:reported?null:guidance.reportedPeriod,rows};
 }
 const guidanceChecks=d.guidanceChecks.filter(c=>{
  if(!completed(c.period,c.periodEnd) && !fiscalLabelEndedBy(periods,c.period,c.guidance.filingDate)) return true;
  removed.push(`results against prior guidance for quarter ended ${c.periodEnd}`);return false;
 });
 let newerResults=d.newerResults;
 if(newerResults?.reportedPeriod && (completed(newerResults.reportedPeriod,newerResults.reportedPeriodEnd) || (!newerResults.reportedPeriodEnd && fiscalLabelEndedBy(periods,newerResults.reportedPeriod,newerResults.statementsEnd)))) {
  removed.push("the newer-results label");newerResults={...newerResults,reportedPeriod:null};
 }
 if(!removed.length) return d;
 return {...d,guidance,guidanceChecks,...(newerResults?{newerResults}:{}),notes:[...d.notes,`Issuer fiscal labels withheld because the statement periods contradict them: ${removed.join("; ")}. Results paired only by those labels are left out.`]};
}
export function shownFilingDisclosures<T extends FilingDisclosures>(d:T):T {
 return withholdContradictedReleaseLabels(d,d.quarterlyTrend.flatMap(r=>r.fiscalLabel?[{end:r.periodEnd,label:r.fiscalLabel}]:[]));
}
