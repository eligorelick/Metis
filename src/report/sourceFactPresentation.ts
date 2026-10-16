import type { SourceFactSummary } from "@/report/sourceFacts";
import type { ReportAuditTable } from "@/report/auditTables";

/** Exact base-unit amounts avoid introducing a new display-rounding identity. */
const exactMoney = (value: number | null, currency: string): string => value === null ? "unavailable" : `${value.toLocaleString("en-US", { maximumSignificantDigits: 21 })} ${currency}`;

/**
 * `withIds` false is the report body (D-67): the registry identity column is
 * an audit leaf and is printed only in the audit export.
 */
export function sourceFactAuditTables(summary: SourceFactSummary | undefined, withIds = true): ReportAuditTable[] {
  if (!summary) return [];
  const tables: ReportAuditTable[] = [{ heading: "Reported source facts (assembled)",
    headers: ["Reported metric", "Amount in base currency units", "Measurement window", "As of", ...(withIds ? ["Source identity"] : [])],
    rows: summary.rows.map(row => [row.label, exactMoney(row.value,row.currency), `${row.periodContext.start} to ${row.periodContext.end}${row.periodContext.fiscalLabel ? ` (${row.periodContext.fiscalLabel})` : ""}`, row.asOf, ...(withIds ? [row.provenanceId] : [])]),
    note: summary.reason ?? "As-reported provider facts bound to exact registry records. These deterministic templates are separate from AI opinion and do not validate surrounding prose." }];
  const bridge = summary.earningsReconciliation;
  const currency = summary.rows[0]?.currency ?? "currency not supplied";
  tables.push({ heading: "Reported earnings reconciliation", headers: ["Component", "Amount / status", "Origin"],
    rows: [
      ["Reconciliation status", bridge.status, bridge.reason ?? "Complete compatible reported operands reconcile"],
      ...(bridge.pretaxMinusTax !== null || bridge.reportedNetIncome !== null ? [
      ["Income before tax minus reported income tax", exactMoney(bridge.pretaxMinusTax,currency), "Calculated from the reported operands above"],
      ["Reconciled net income", exactMoney(bridge.reconciledNetIncome,currency), bridge.method === "pretax-minus-tax-plus-equity-method" ? "Calculated subtotal plus signed as-filed equity-method result" : "Calculated subtotal; equity-method result is not added again"],
      ["Reported net income", exactMoney(bridge.reportedNetIncome,currency), "Reported operand above"],
      ["Residual", exactMoney(bridge.residual,currency), "Calculated less reported net income; retained without forcing zero"],
      ] : []),
    ],
    note: bridge.explanation });
  return tables;
}
