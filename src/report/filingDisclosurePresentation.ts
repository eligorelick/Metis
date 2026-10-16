import type { ReportAuditTable } from "@/report/auditTables";
import { decimalRound, formatFinancialValue } from "@/report/format";
import type { FilingDisclosures, FilingRef, GuidanceRow } from "@/report/schema";

/**
 * The report's filing-disclosure tables, grouped by the section that shows
 * them, so the Markdown, print and on-screen surfaces render the same rows.
 * Pure and deterministic.
 */
export type FilingDisclosureSection = "business" | "fundamentals" | "outlook" | "catalystsRisks";

const DASH = "—";

const METRIC_LABELS: Record<GuidanceRow["metric"], string> = {
  revenue: "Revenue",
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
  return row.unit === "%" ? pct(v, false, 1) : money(v, currency, row.unit === "currency-per-share");
}

/** "≈$26B": an issuer-qualified amount without decimals the release did not print. */
function approximately(text: string): string {
  return `≈${text.replace(/\.(\d*?)0+([KMBT])/, (_, kept: string, suffix: string) => (kept ? `.${kept}${suffix}` : suffix))}`;
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
    tables.push({
      heading: `Management guidance${g.reportedPeriod ? ` (issued with ${g.reportedPeriod} results)` : ""}`,
      headers: ["Period", "Metric", "Basis", "Low", "Midpoint", "High", "Stated as"],
      rows: g.rows.map((row) => [
        row.period,
        METRIC_LABELS[row.metric],
        basis(row.basis),
        row.form === "range" || row.form === "plus-minus" ? value(row, row.low, d.currency) : DASH,
        value(row, row.mid, d.currency),
        row.form === "range" || row.form === "plus-minus" ? value(row, row.high, d.currency) : DASH,
        row.form === "plus-minus" ? "point ± tolerance" : row.form === "approximate" ? "approximately" : row.form,
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
    tables.push({
      heading: "Quarterly trend (last eight quarters)",
      headers: ["Quarter ended", "Fiscal", "Revenue", "YoY", "QoQ", "Gross margin", "Operating expenses", "Operating margin", "Diluted EPS", "Operating cash flow", "FCF (CFO − capex)"],
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
        money(r.operatingCashFlow, d.currency),
        money(r.freeCashFlow, d.currency),
      ]),
      note: "From the quarterly statement rows. YoY compares with the quarter ending about a year earlier, QoQ with the preceding quarter. FCF here is operating cash flow less capital expenditure; the issuer's own definition is shown separately when its release states it.",
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
      if (cr.authorizationRemaining !== null) rows.push(["Repurchase authorization remaining", cr.authorizationRemainingApproximate === true ? approximately(money(cr.authorizationRemaining, d.currency)) : money(cr.authorizationRemaining, d.currency), src]);
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
  return tables;
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

function eventTable(d: FilingDisclosures): ReportAuditTable[] {
  if (d.events.length === 0) return [];
  return [{
    heading: "Material SEC current reports (Form 8-K, last 12 months)",
    headers: ["Filed", "Event date", "Items", "Summary (issuer text)", "Accession"],
    rows: d.events.map((e) => [e.filingDate, e.eventDate ?? DASH, e.items.join(", "), e.summary, e.accession]),
    note: "Items 1.01 (material agreement), 1.02, 2.01, 2.03 (off-balance-sheet or direct financial obligation), 2.05, 2.06, 5.02 (officers and directors) and 8.01 (other events). Earnings releases (Item 2.02) appear under guidance.",
  }];
}

export function filingDisclosureTables(d: FilingDisclosures | undefined, section: FilingDisclosureSection): ReportAuditTable[] {
  if (!d) return [];
  switch (section) {
    case "business": return segmentTables(d);
    case "fundamentals": return trendTables(d);
    case "outlook": {
      const tables = guidanceTables(d);
      // D-62: dividend and repurchase-authorization notes belong with the
      // capital-return table, not under results against guidance — unless
      // that table is not shown.
      const capitalShown = d.freeCashFlow.length > 0 || d.capitalReturn !== null;
      const notes = [d.currencyBasis, ...d.notes.filter((n) => !capitalShown || !isCapitalReturnNote(n))].join(" ");
      return tables.length > 0 ? tables.map((t, i) => (i === tables.length - 1 ? { ...t, note: `${t.note ?? ""} ${notes}`.trim() } : t)) : d.notes.length > 0 ? [{ heading: "Management guidance", headers: ["Status"], rows: [["No guidance could be read from the latest earnings releases."]], note: notes }] : [];
    }
    case "catalystsRisks": return eventTable(d);
  }
}
