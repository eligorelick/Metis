import { priorQuarterIndex, QOQ_WINDOW_DAYS, YOY_WINDOW_DAYS } from "@/edgar/segmentFacts";
import type { ReportAuditTable } from "@/report/auditTables";
import { withoutLegacyPrincipalAnnotation } from "@/report/principalAggregationSafety";
import { decimalRound, formatFinancialValue } from "@/report/format";
import { issuerReconciliationTables } from "@/report/reconciliationPresentation";
import type { FilingDisclosures, FilingRef, GuidanceCheck, GuidanceRow } from "@/report/schema";
import { MaterialEventItemsSchema } from "@/report/schema";
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
      `From the quarterly statement rows. YoY compares with the quarter ending about a year earlier, QoQ with the preceding quarter${d.quarterlyTrendPresentationChecked === true ? "; where the filings show a re-presentation, each growth cell divides two quarters on one presentation or is not shown, with a note" : ""}. FCF here is operating cash flow less capital expenditure; the issuer's own definition is shown separately when its release states it.`,
      d.quarterlyTrend.some((r) => r.equitySecuritiesGains != null || r.nonGaapEpsDiluted != null) ? "Equity-securities gains and non-GAAP diluted EPS are read from the issuer's GAAP-to-non-GAAP reconciliation in each earnings release." : "",
      d.nonGaapBasisNote ? `Non-GAAP basis: ${d.nonGaapBasisNote}` : "",
      ...new Set(d.quarterlyTrend.flatMap((r) => r.revenueGrowthNotes ?? [])),
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
  tables.push(...issuerReconciliationTables(d));
  return tables;
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
    // AI-406: growth only against the quarter the column names; no such quarter gives a dash.
    const quarterAgo = priorQuarterIndex(s.quarters, QOQ_WINDOW_DAYS) ?? -1;
    const yearAgo = priorQuarterIndex(s.quarters, YOY_WINDOW_DAYS) ?? -1;
    const growth = (values: (number | null)[], i: number): string => {
      const now = values[0];
      const prior = i < 0 ? null : values[i] ?? null;
      return now === null || now === undefined || prior === null || prior <= 0 ? DASH : pct((now / prior - 1) * 100, true);
    };
    const total = s.total[0] ?? null;
    const rows = s.rows.map((r) => [
      r.childOf === null ? r.label : `  ↳ ${r.label}`,
      ...s.quarters.map((_, i) => money(r.values[i] ?? null, s.currency)),
      growth(r.values, quarterAgo),
      growth(r.values, yearAgo),
      total !== null && total > 0 && r.values[0] !== null && r.values[0] !== undefined ? pct((r.values[0] / total) * 100) : DASH,
    ]);
    rows.push(["Total revenue", ...s.quarters.map((_, i) => money(s.total[i] ?? null, s.currency)), growth(s.total, quarterAgo), growth(s.total, yearAgo), total !== null ? "100.0%" : DASH]);
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
    rows: d.events.map((e) => [e.filingDate, e.eventDate ?? DASH, e.items.join(", "), withoutLegacyPrincipalAnnotation(e.summary), e.accession]),
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
  return d?.newerResults ? newerResultsSentence(d.newerResults) : null;
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
    case "catalystsRisks": return [...materialEventTables(d), ...companyStatementTables(d)];
  }
}
