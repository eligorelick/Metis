import { z } from "zod";
import { comparePeriodContexts, PeriodContextSchema } from "@/types/periodContext";

/** Persisted structure only; pipeline rebuilds establish source authority. */
export const SourceFactRowSchema = z.object({
  metric: z.string().min(1),
  label: z.string().min(1),
  definition: z.literal("reported-statement-line-item"),
  value: z.number(),
  unit: z.literal("currency"),
  currency: z.string().regex(/^[A-Z]{3}$/),
  period: z.iso.date(),
  periodContext: PeriodContextSchema.options[1],
  source: z.string().min(1),
  asOf: z.iso.date(),
  provenanceId: z.string().min(1),
  origin: z.string().min(1),
  qualifier: z.literal("as reported"),
  canonicalText: z.string().min(1),
}).strict().superRefine((row, ctx) => {
  if (row.source !== row.provenanceId) ctx.addIssue({ code: "custom", path: ["source"], message: "Source must be the exact provenance identity" });
  if (row.periodContext.end !== row.period) ctx.addIssue({ code: "custom", path: ["periodContext"], message: "Statement period must match the duration end" });
});

export const ReportedEarningsReconciliationSchema = z.object({
  status: z.enum(["available", "unavailable"]),
  reason: z.string().min(1).nullable(),
  method: z.enum(["pretax-minus-tax", "pretax-minus-tax-plus-equity-method"]).nullable(),
  pretaxMinusTax: z.number().nullable(),
  reconciledNetIncome: z.number().nullable(),
  reportedNetIncome: z.number().nullable(),
  residual: z.number().nullable(),
  operandIds: z.array(z.string().min(1)),
  explanation: z.string().min(1),
}).strict().superRefine((reconciliation, ctx) => {
  if (reconciliation.status === "available" &&
    (reconciliation.reason !== null || reconciliation.method === null || reconciliation.pretaxMinusTax === null ||
      reconciliation.reconciledNetIncome === null || reconciliation.reportedNetIncome === null || reconciliation.residual === null)) {
    ctx.addIssue({ code: "custom", message: "Available reconciliation requires complete arithmetic and no unavailable reason" });
  }
  if (reconciliation.status === "unavailable" && reconciliation.reason === null) ctx.addIssue({ code: "custom", path: ["reason"], message: "Unavailable reconciliation requires a reason" });
});

export const SourceFactSummarySchema = z.object({
  version: z.literal("1.0.0"),
  status: z.enum(["available", "unavailable"]),
  reason: z.string().min(1).nullable(),
  qualifier: z.literal("as reported"),
  rows: z.array(SourceFactRowSchema),
  earningsReconciliation: ReportedEarningsReconciliationSchema,
}).strict().superRefine((summary, ctx) => {
  if (summary.status === "available" && (summary.reason !== null || summary.rows.length === 0)) ctx.addIssue({ code: "custom", message: "Available source facts require rendered rows and no unavailable reason" });
  if (summary.status === "unavailable" && (summary.reason === null || summary.rows.length > 0 || summary.earningsReconciliation.status !== "unavailable")) ctx.addIssue({ code: "custom", message: "Withheld source facts require a reason, empty rows, and unavailable reconciliation" });
  const ids = new Set(summary.rows.map(row => row.provenanceId));
  if (ids.size !== summary.rows.length || new Set(summary.rows.map(row => row.metric)).size !== summary.rows.length) ctx.addIssue({ code: "custom", path: ["rows"], message: "Source fact identities and metrics must be unique" });
  const first = summary.rows[0];
  if (first && summary.rows.some(row => row.currency !== first.currency || comparePeriodContexts(row.periodContext, first.periodContext) !== true)) ctx.addIssue({ code: "custom", path: ["rows"], message: "Source facts must share a compatible currency and duration context" });
  const reconciliation = summary.earningsReconciliation;
  if (new Set(reconciliation.operandIds).size !== reconciliation.operandIds.length || reconciliation.operandIds.some(id => !ids.has(id))) ctx.addIssue({ code: "custom", path: ["earningsReconciliation", "operandIds"], message: "Every unique reconciliation operand must have a rendered source fact" });
  if (reconciliation.method !== null) {
    const required = ["income-before-tax", "income-tax-expense", "net-income", ...(reconciliation.method === "pretax-minus-tax-plus-equity-method" ? ["equity-method-income-loss-as-filed"] : [])];
    const rendered = summary.rows.filter(row => required.includes(row.metric));
    if (rendered.length !== required.length || reconciliation.operandIds.length !== required.length || rendered.some(row => !reconciliation.operandIds.includes(row.provenanceId))) ctx.addIssue({ code: "custom", path: ["earningsReconciliation", "operandIds"], message: "Reported arithmetic requires every method operand to be rendered" });
  }
});
