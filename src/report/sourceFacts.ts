/** Exact provider facts and a reported arithmetic identity, separate from AI opinion. */
import type { ContextPayload, StatementCell, StatementLineExtract } from "@/pipeline/stageC/payload";
import { isIsoDate, type NumericProvenanceRecord } from "@/pipeline/stageC/provenance";
import { comparePeriodContexts, PeriodContextSchema, type PeriodContext } from "@/types/periodContext";

type DurationContext = Extract<PeriodContext, { kind: "duration" }>;

export interface SourceFactRow {
  metric: string;
  label: string;
  /** A registry line item does not establish adjusted or recurring earnings. */
  definition: "reported-statement-line-item";
  value: number;
  unit: "currency";
  currency: string;
  period: string;
  periodContext: DurationContext;
  source: string;
  asOf: string;
  provenanceId: string;
  origin: string;
  qualifier: "as reported";
  canonicalText: string;
}

export interface ReportedEarningsReconciliation {
  status: "available" | "unavailable";
  reason: string | null;
  method: "pretax-minus-tax" | "pretax-minus-tax-plus-equity-method" | null;
  pretaxMinusTax: number | null;
  reconciledNetIncome: number | null;
  reportedNetIncome: number | null;
  /** Calculated amount less reported net income; retained even within roundoff. */
  residual: number | null;
  operandIds: string[];
  explanation: string;
}

export interface SourceFactSummary {
  version: "1.0.0";
  status: "available" | "unavailable";
  reason: string | null;
  qualifier: "as reported";
  rows: SourceFactRow[];
  earningsReconciliation: ReportedEarningsReconciliation;
}

const QUARTERLY_TITLES = new Set(["Income statement — quarterly", "Income statement - quarterly"]);
const QUARTERLY_ORIGINS = new Set(["fmp:income-statement(quarter)", "edgar:income-statement(quarter)"]);
const FACT_LINES = [
  ["income-before-tax", "income before tax"],
  ["income-tax-expense", "income tax expense"],
  ["net-income", "net income"],
  ["equity-method-income-loss-as-filed", "equity-method income (loss), as filed"],
] as const;

const RECONCILIATION_EXPLANATION = "Reported arithmetic only: income before tax minus income tax expense is compared with reported net income. The signed as-filed equity-method result is added only if needed to match that identity. This is not normalized recurring earnings, a tax allocation, or a universal treatment of equity-method results.";

function emptyReconciliation(reason: string): ReportedEarningsReconciliation {
  return { status: "unavailable", reason, method: null, pretaxMinusTax: null, reconciledNetIncome: null,
    reportedNetIncome: null, residual: null, operandIds: [], explanation: RECONCILIATION_EXPLANATION };
}

function unavailable(reason: string): SourceFactSummary {
  return { version: "1.0.0", status: "unavailable", reason, qualifier: "as reported", rows: [],
    earningsReconciliation: emptyReconciliation(reason) };
}

function canonicalText(fact: Omit<SourceFactRow, "canonicalText">): string {
  const period = fact.periodContext;
  return `${fact.label}, ${fact.qualifier}: ${fact.value} ${fact.currency} (unit: ${fact.unit}; definition: ${fact.definition}; duration ${period.start} to ${period.end}${period.basis ? `; basis: ${period.basis}` : ""}${period.fiscalLabel ? `; fiscal label: ${period.fiscalLabel}` : ""}; period: ${fact.period}). Source: ${fact.source}; provider origin: ${fact.origin}; as of ${fact.asOf}.`;
}

/**
 * An FMP quarter carries no SEC start date (NVDA report 34 lost its
 * reconciliation to that). Fiscal quarters are contiguous, so the issuer's own
 * immediately preceding quarter in the same statement row bounds it: labels
 * consecutive (Q1→Q2, Q4 FY2026→Q1 FY2027) and ends a 12–14-week quarter apart,
 * which admits 52/53-week calendars.
 */
function precedingQuarterContext(line: StatementLineExtract, cell: StatementCell, periods: readonly string[]): DurationContext | undefined {
  const earlier = periods.filter(p => p < cell.period).sort().at(-1);
  const prior = earlier === undefined ? undefined : line.byPeriod.find(c => c.period === earlier);
  const label = /^Q([1-4]) FY(\d{4})$/.exec(cell.fiscalPeriod ?? ""), before = /^Q([1-4]) FY(\d{4})$/.exec(prior?.fiscalPeriod ?? "");
  if (!prior || !label || !before) return undefined;
  const [q, year, pq, priorYear] = [Number(label[1]), Number(label[2]), Number(before[1]), Number(before[2])];
  const consecutive = pq === 4 ? q === 1 && year === priorYear + 1 : q === pq + 1 && year === priorYear;
  const days = (Date.parse(`${cell.period}T00:00:00Z`) - Date.parse(`${prior.period}T00:00:00Z`)) / 86_400_000;
  if (!consecutive || !(days >= 84 && days <= 98)) return undefined;
  const start = new Date(Date.parse(`${prior.period}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const parsed = PeriodContextSchema.safeParse({ kind: "duration", start, end: cell.period, basis: "fiscal-quarter", fiscalLabel: cell.fiscalPeriod });
  return parsed.success && parsed.data.kind === "duration" ? parsed.data : undefined;
}

/** A bound cell must agree exactly with its own registry record, without display rounding. */
function boundRecord(
  line: StatementLineExtract,
  cell: StatementCell,
  record: NumericProvenanceRecord,
  expectedId: string,
  period: string,
  derived: DurationContext | undefined,
): string | null {
  const origin = Object.hasOwn(cell, "source") ? cell.source : line.source;
  if (cell.provenanceId !== expectedId || record.id !== expectedId) return "Exact statement registry identity is missing or conflicting.";
  if (record.kind !== "provider" || record.formulaVersion !== null || !QUARTERLY_ORIGINS.has(record.origin) || origin !== record.origin) return "Provider origin or reported statement definition is unknown or conflicts with the registry.";
  if (record.label !== line.lineItem) return "Statement metric label conflicts with the registry.";
  if (record.value !== cell.value || !Number.isFinite(record.value)) return "Statement value conflicts with the registry.";
  if (record.unit !== "currency" || line.unit !== "currency") return "Statement unit conflicts with the registry.";
  if (!record.currency || !/^[A-Z]{3}$/.test(record.currency) || record.currency !== cell.currency) return "Statement currency is unknown or conflicts with the registry.";
  if (record.period !== period || cell.period !== period) return "Statement period conflicts with the current quarter.";
  if (!isIsoDate(record.asOf) || cell.asOf !== record.asOf) return "Statement observation date is unknown or conflicts with the registry.";
  // Source boundaries when the record has them; the derived quarter only when
  // neither the record nor the cell states any.
  const unbounded = record.periodContext === undefined && cell.periodContext === undefined;
  const parsed = PeriodContextSchema.safeParse(unbounded ? derived : record.periodContext);
  if (!parsed.success || parsed.data.kind !== "duration" || parsed.data.end !== period || (!unbounded && comparePeriodContexts(record.periodContext, cell.periodContext) !== true)) return "Statement duration boundaries are unknown or conflicting.";
  if (record.fiscalPeriod !== cell.fiscalPeriod) return "Statement fiscal label conflicts with the registry.";
  return null;
}

function reconciles(residual: number, operands: readonly number[]): boolean {
  // A few floating point operations can accumulate a few ULPs. This is not a
  // display, materiality, or economic tolerance, and never changes the residual.
  const tolerance = Number.EPSILON * Math.max(Number.MIN_VALUE, ...operands.map(Math.abs)) * 4;
  return Math.abs(residual) <= tolerance;
}

function reconcile(rows: readonly SourceFactRow[]): ReportedEarningsReconciliation {
  const find = (metric: string) => rows.find(row => row.metric === metric);
  const pretax = find("income-before-tax"), tax = find("income-tax-expense"), net = find("net-income");
  const missing = FACT_LINES.slice(0, 3).filter(([metric]) => !find(metric)).map(([, label]) => label);
  if (!pretax || !tax || !net) return emptyReconciliation(`Missing reported operand: ${missing.join(", ")}.`);
  const pretaxMinusTax = pretax.value - tax.value;
  const directResidual = pretaxMinusTax - net.value;
  const direct: ReportedEarningsReconciliation = {
    status: "available", reason: null, method: "pretax-minus-tax", pretaxMinusTax, reconciledNetIncome: pretaxMinusTax,
    reportedNetIncome: net.value, residual: directResidual, operandIds: [pretax.provenanceId, tax.provenanceId, net.provenanceId],
    explanation: RECONCILIATION_EXPLANATION,
  };
  if (reconciles(directResidual, [pretax.value, tax.value, net.value])) return direct;
  const equity = find("equity-method-income-loss-as-filed");
  if (!equity) return { ...direct, status: "unavailable", reason: "Missing reported equity-method income (loss), as filed; the direct identity does not reconcile." };
  const reconciledNetIncome = pretaxMinusTax + equity.value;
  const residual = reconciledNetIncome - net.value;
  const matches = reconciles(residual, [pretax.value, tax.value, equity.value, net.value]);
  return { ...direct, status: matches ? "available" : "unavailable", reason: matches ? null : "Reported earnings arithmetic does not reconcile; the residual remains disclosed.",
    method: "pretax-minus-tax-plus-equity-method", reconciledNetIncome, residual,
    operandIds: [...direct.operandIds, equity.provenanceId] };
}

/**
 * Build only from the current quarterly statement's exact registry identities.
 * No clock, provider access, mutation, annual fallback, or inferred boundaries.
 * Historical payloads without a quarterly block retain their absent field.
 */
export function buildSourceFactSummary(payload: ContextPayload): SourceFactSummary | undefined {
  const blocks = (payload.statements ?? []).filter(block => QUARTERLY_TITLES.has(block.title));
  if (blocks.length === 0) return undefined;
  if (blocks.length !== 1) return unavailable("Conflicting quarterly statement blocks.");
  const block = blocks[0]!;
  if (!payload.provenanceRegistry?.length) return unavailable("Exact statement provenance registry is unavailable.");
  if (!block.periods.length || block.periods.some(period => !isIsoDate(period))) return unavailable("Current quarterly period is unknown.");
  const period = [...block.periods].sort().at(-1)!;
  const rows: SourceFactRow[] = [];
  for (const [metric, label] of FACT_LINES) {
    const expectedId = `payload.statements.income-statement-quarterly.${period}.${metric}`;
    const matches = payload.provenanceRegistry.filter(record => record.id === expectedId || record.id.startsWith(`${expectedId}.`) || record.id.startsWith(`${expectedId}-`));
    if (matches.length > 1) return unavailable(`Conflicting or duplicate registry records for ${label}.`);
    const lines = block.lineItems.filter(line => line.lineItem === label);
    if (lines.length > 1) return unavailable(`Conflicting statement rows for ${label}.`);
    const line = lines[0];
    const cells = line?.byPeriod.filter(cell => cell.period === period || cell.provenanceId === expectedId) ?? [];
    if (cells.length > 1) return unavailable(`Conflicting current-quarter cells for ${label}.`);
    const cell = cells[0], record = matches[0];
    if (!cell || cell.value === null) {
      if (record) return unavailable(`Statement cell is missing for registered ${label}.`);
      continue;
    }
    if (!record || !line) return unavailable(`Exact statement registry record is unavailable for ${label}.`);
    const derived = precedingQuarterContext(line, cell, block.periods);
    const problem = boundRecord(line, cell, record, expectedId, period, derived);
    if (problem) return unavailable(`${label}: ${problem}`);
    const context = structuredClone(record.periodContext ?? derived) as DurationContext;
    const fact: Omit<SourceFactRow, "canonicalText"> = {
      metric, label: record.label!, definition: "reported-statement-line-item", value: record.value, unit: "currency", currency: record.currency!,
      period, periodContext: context, source: record.id, asOf: record.asOf, provenanceId: record.id, origin: record.origin, qualifier: "as reported",
    };
    rows.push({ ...fact, canonicalText: canonicalText(fact) });
  }
  if (rows.length === 0) return unavailable("Reported current-quarter earnings operands are unavailable.");
  const first = rows[0]!;
  if (rows.some(row => row.currency !== first.currency || comparePeriodContexts(row.periodContext, first.periodContext) !== true)) {
    return unavailable("Current-quarter operands have conflicting currency or duration contexts.");
  }
  return { version: "1.0.0", status: "available", reason: null, qualifier: "as reported", rows, earningsReconciliation: reconcile(rows) };
}

export interface SourceFactTemplateValidation {
  status: "validated" | "rejected" | "unverified";
  scope: "source-fact-template";
  reason: string;
}

/**
 * This validates one canonical fact template only. It is deliberately separate
 * from claimEvidence and never marks adjacent opinions or whole prose verified.
 */
export function validateSourceFactTemplate(candidate: unknown, expected: SourceFactRow): SourceFactTemplateValidation {
  const result = (status: SourceFactTemplateValidation["status"], reason: string): SourceFactTemplateValidation => ({ status, scope: "source-fact-template", reason });
  if (typeof candidate !== "object" || candidate === null || !("kind" in candidate) || candidate.kind !== "source-fact") return result("unverified", "not-a-source-fact-template");
  if (!("fact" in candidate) || typeof candidate.fact !== "object" || candidate.fact === null || !("text" in candidate)) return result("rejected", "invalid-source-fact-template");
  const actual = candidate.fact as Record<string, unknown>;
  const fields = ["metric", "label", "definition", "value", "unit", "currency", "period", "source", "asOf", "provenanceId", "origin", "qualifier", "canonicalText"] as const;
  for (const field of fields) {
    if (actual[field] !== expected[field]) return result("rejected", `${field}-mismatch`);
  }
  // Template checks require every supplied dimension, including optional labels,
  // to remain identical; compatibility alone would allow dropping a qualifier.
  const actualContext = PeriodContextSchema.safeParse(actual.periodContext);
  if (!actualContext.success || actualContext.data.kind !== "duration" ||
    actualContext.data.start !== expected.periodContext.start || actualContext.data.end !== expected.periodContext.end ||
    actualContext.data.basis !== expected.periodContext.basis || actualContext.data.fiscalLabel !== expected.periodContext.fiscalLabel) return result("rejected", "periodContext-mismatch");
  if (expected.canonicalText !== canonicalText(expected) || candidate.text !== expected.canonicalText) return result("rejected", "non-canonical-text");
  return result("validated", "exact-canonical-template");
}
