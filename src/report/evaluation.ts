/**
 * Offline evaluation of explicitly registered operating forecasts and realized
 * security returns. This module never fetches data, mutates a report, or treats
 * a present-value DCF scenario as a prediction of a future stock price.
 *
 * Definitions and actuals are operator-supplied evidence: matching metadata is
 * necessary for comparability, not independent verification of that evidence.
 */
import { createHash } from "node:crypto";
import { z } from "zod";

export const EVALUATION_POLICY_VERSION = "REPORT_EVALUATION_2026_10_V1" as const;
const nonempty = z.string().trim().min(1);
const date = z.iso.date();
const timestamp = z.iso.datetime();
const currency = z.string().regex(/^[A-Z]{3}$/);
const metric = z.enum(["revenue", "operatingMargin", "fcf", "epsDiluted"]);
const scenario = z.enum(["base", "bull", "bear", "weighted"]);
const marketBasis = z.enum(["split-adjusted-price", "total-return-index"]);
const issuerSchema = z.object({
  scheme: z.enum(["cik", "lei", "isin"]),
  id: nonempty,
  symbol: nonempty,
}).strict();

const operatingDefinitionSchema = z.object({
  id: nonempty,
  metric,
  scenario,
  periodLabel: nonempty,
  periodStart: date,
  periodEnd: date,
  unit: nonempty,
  currency: currency.nullable(),
  /** Exact accounting/ownership basis, including split basis for EPS. */
  basis: nonempty,
}).strict();

const marketDefinitionSchema = z.object({
  id: nonempty,
  startDate: date,
  endDate: date,
  /** Security/share-class identity, distinct from company/issuer identity. */
  securityId: nonempty,
  benchmarkId: nonempty,
  currency,
  basis: marketBasis,
}).strict();

export const EvaluationDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  issuer: issuerSchema,
  identitySource: nonempty,
  asOf: date,
  methodVersion: nonempty,
  operating: z.array(operatingDefinitionSchema),
  market: z.array(marketDefinitionSchema),
}).strict();
export type EvaluationDefinition = z.infer<typeof EvaluationDefinitionSchema>;
type OperatingDefinition = z.infer<typeof operatingDefinitionSchema>;
type MarketDefinition = z.infer<typeof marketDefinitionSchema>;

const operatingOutcomeSchema = z.object({
  kind: z.literal("operating"),
  id: nonempty,
  issuer: issuerSchema,
  metric,
  periodStart: date,
  periodEnd: date,
  unit: nonempty,
  currency: currency.nullable(),
  basis: nonempty,
  value: z.number().finite(),
  availableDate: date,
  source: nonempty,
}).strict();

const marketLegSchema = z.object({
  id: nonempty,
  startDate: date,
  endDate: date,
  currency,
  basis: marketBasis,
  startValue: z.number().finite(),
  endValue: z.number().finite(),
}).strict();
const marketOutcomeSchema = z.object({
  kind: z.literal("market"),
  id: nonempty,
  issuer: issuerSchema,
  availableDate: date,
  source: nonempty,
  security: marketLegSchema,
  benchmark: marketLegSchema,
}).strict();

export const EvaluationOutcomeSchema = z.discriminatedUnion("kind", [operatingOutcomeSchema, marketOutcomeSchema]);

/** Individual malformed rows are excluded, not allowed to abort valid rows. */
export const EvaluationOutcomesSchema = z.object({
  schemaVersion: z.literal(1),
  outcomes: z.array(z.unknown()),
}).strict();

export type FrozenOperatingForecast = OperatingDefinition & {
  forecastValue: number;
  source: string;
  sourceAsOf: string;
  reportPath: string;
  sourcePeriodStart: string | null;
  sourcePeriodEnd: string | null;
  periodExclusionReason: "unverified-period" | "forecast-period-mismatch" | null;
};

export interface EvaluationSnapshot {
  snapshotVersion: 1;
  policyVersion: typeof EVALUATION_POLICY_VERSION;
  frozenAt: string;
  reportGeneratedAt: string;
  reportSpecVersion: string;
  pipelineVersion: string;
  reportHash: string;
  report: z.infer<ReturnType<typeof z.json>>;
  definition: EvaluationDefinition;
  operatingForecasts: FrozenOperatingForecast[];
  snapshotHash: string;
}

/** JSON key ordering cannot change content identity; array ordering can. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  // Non-JSON values can occur through the JS API; invalid outcome rows are
  // represented as null in the audit hash and excluded by their row schema.
  return JSON.stringify(value) ?? "null";
}

function hash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function selectOperatingForecast(report: unknown, item: OperatingDefinition, asOf: string): FrozenOperatingForecast {
  const projections = record(record(report).projections);
  if (projections.notApplicableReason) throw new Error(`Operating projections are suppressed: ${item.id}`);
  const series = Array.isArray(projections.series) ? projections.series : [];
  const matches = series.map((entry, index) => ({ entry: record(entry), index }))
    .filter(({ entry }) => entry.metric === item.metric);
  if (matches.length !== 1) throw new Error(`Missing or ambiguous operating forecast metric: ${item.id}`);
  const selected = matches[0];
  const points = selected.entry[item.scenario];
  const periods = (Array.isArray(points) ? points : []).map((entry, index) => ({ entry: record(entry), index }))
    .filter(({ entry }) => entry.period === item.periodLabel);
  if (periods.length !== 1) throw new Error(`Missing or ambiguous operating forecast period: ${item.id}`);
  const point = periods[0];
  const value = record(point.entry.value);
  if (typeof value.value !== "number" || !Number.isFinite(value.value)) throw new Error(`Missing finite forecast: ${item.id}`);
  if (selected.entry.unit !== item.unit || value.unit !== item.unit) throw new Error(`Forecast unit mismatch: ${item.id}`);
  const sourceAsOf = date.parse(value.asOf);
  if (sourceAsOf > asOf) throw new Error(`Forecast source as-of follows evaluation definition: ${item.id}`);
  const source = nonempty.parse(value.source);
  // The AI report assembly binds deterministic numbers to a canonical exact-
  // period registry ID; data-only reports retain the raw computation tag.
  // Match projectionProvenanceId for fiscal and explicit rolling-period labels.
  const slug = (value: string) => value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "value";
  const boundSource = `payload.computed.projections.${slug(item.metric)}.${item.scenario}.${slug(item.periodLabel)}`;
  if (source !== `computed.projections.${item.metric}.${item.scenario}` && source !== boundSource) {
    throw new Error(`Forecast is not a deterministic forward projection: ${item.id}`);
  }
  if (item.metric === "operatingMargin") {
    if (item.unit !== "%" || item.currency !== null) throw new Error(`Margin unit/currency must be % and null: ${item.id}`);
  } else {
    const unitCurrency = /^([A-Z]{3})(?:\/share)?$/.exec(item.unit)?.[1];
    if (!item.currency || unitCurrency !== item.currency || (value.currency != null && value.currency !== item.currency)) {
      throw new Error(`Forecast currency is unknown or mismatched: ${item.id}`);
    }
    if (item.metric === "epsDiluted" && item.unit !== `${item.currency}/share`) throw new Error(`EPS requires a per-share unit: ${item.id}`);
    if (item.metric !== "epsDiluted" && item.unit !== item.currency) throw new Error(`Operating amount requires a currency unit: ${item.id}`);
  }
  // The projected FCF is FCFF, not cash-from-operations minus capex. EPS must
  // name the share basis; an unqualified adjusted/unadjusted EPS is ambiguous.
  if (item.metric === "fcf" && item.basis !== "unlevered-FCFF") {
    throw new Error(`FCF forecast basis must be unlevered-FCFF: ${item.id}`);
  }
  if (item.metric === "epsDiluted" && !/^diluted-EPS;share-basis=.+/.test(item.basis)) {
    throw new Error(`EPS forecast basis must identify diluted EPS and its share basis: ${item.id}`);
  }
  if (item.periodStart > item.periodEnd || item.periodEnd <= asOf) throw new Error(`Operating horizon must end after as-of: ${item.id}`);
  const fiscalLabel = /^FY(\d{4})(?: ending (\d{4}-\d{2}-\d{2}))?$/.exec(item.periodLabel);
  const fiscalYear = fiscalLabel?.[1];
  const explicitEnd = fiscalLabel?.[2] ?? /^12M ending (\d{4}-\d{2}-\d{2})$/.exec(item.periodLabel)?.[1];
  // Stage B labels each annual projection using its period-end calendar year.
  // A sidecar must not silently convert that projection to a quarter or rebind
  // it to an unrelated year. Standard calendar and 52/53-week years fit here;
  // transition-year/stub periods require a separately supported methodology.
  const inclusiveDays = (Date.parse(item.periodEnd) - Date.parse(item.periodStart)) / 86_400_000 + 1;
  if ((!fiscalYear && !explicitEnd) || (fiscalYear && item.periodEnd.slice(0, 4) !== fiscalYear) || (explicitEnd && item.periodEnd !== explicitEnd) || inclusiveDays < 364 || inclusiveDays > 371) {
    throw new Error(`Annual period must span 364–371 days and match its FY label year or exact rolling end: ${item.id}`);
  }
  const savedStart = date.safeParse(point.entry.periodStart);
  const savedEnd = date.safeParse(point.entry.periodEnd);
  const sourcePeriodStart = savedStart.success ? savedStart.data : null;
  const sourcePeriodEnd = savedEnd.success ? savedEnd.data : null;
  const sourceDays = sourcePeriodStart && sourcePeriodEnd
    ? (Date.parse(sourcePeriodEnd) - Date.parse(sourcePeriodStart)) / 86_400_000 + 1 : null;
  const periodExclusionReason = sourceDays === null || sourceDays < 364 || sourceDays > 371 || (fiscalYear !== undefined && sourcePeriodEnd?.slice(0, 4) !== fiscalYear) || (explicitEnd !== undefined && sourcePeriodEnd !== explicitEnd)
    ? "unverified-period"
    : sourcePeriodStart !== item.periodStart || sourcePeriodEnd !== item.periodEnd ? "forecast-period-mismatch" : null;
  return {
    ...item, forecastValue: value.value, source, sourceAsOf,
    sourcePeriodStart, sourcePeriodEnd, periodExclusionReason,
    reportPath: `/projections/series/${selected.index}/${item.scenario}/${point.index}/value`,
  };
}

/** Preserve full JSON content; only evaluation-relevant fields are validated. */
export function createEvaluationSnapshot(
  reportInput: unknown,
  definitionInput: unknown,
  frozenAt = new Date().toISOString(),
): EvaluationSnapshot {
  const report = z.json().parse(reportInput);
  const definition = EvaluationDefinitionSchema.parse(definitionInput);
  const meta = record(record(report).meta);
  timestamp.parse(frozenAt);
  const reportGeneratedAt = timestamp.parse(meta.generatedAt);
  const reportSpecVersion = nonempty.parse(meta.specVersion);
  const pipelineVersion = nonempty.parse(meta.pipelineVersion);
  if (meta.symbol !== definition.issuer.symbol) throw new Error("Report and definition issuer symbols do not match");
  if (reportGeneratedAt.slice(0, 10) !== definition.asOf) throw new Error("Definition as-of must equal the report generated UTC date");
  if (Date.parse(frozenAt) > Date.now()) throw new Error("Snapshot frozenAt cannot be in the future");
  if (Date.parse(frozenAt) < Date.parse(reportGeneratedAt) || frozenAt.slice(0, 10) < definition.asOf) {
    throw new Error("Snapshot cannot be frozen before report generation or definition as-of date");
  }
  const ids = [...definition.operating, ...definition.market].map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate evaluation definition id");
  for (const item of definition.market) {
    // Daily observations cannot establish whether the report preceded a same-
    // day close. Require a later session, chosen explicitly by the operator.
    if (item.startDate <= definition.asOf || item.endDate <= item.startDate) throw new Error(`Market horizon must start after report as-of and end after start: ${item.id}`);
    if (item.securityId === item.benchmarkId) throw new Error(`Security and benchmark must differ: ${item.id}`);
  }
  const operatingForecasts = definition.operating.map((item) => selectOperatingForecast(report, item, definition.asOf));
  const payload = {
    snapshotVersion: 1 as const, policyVersion: EVALUATION_POLICY_VERSION,
    frozenAt, reportGeneratedAt, reportSpecVersion, pipelineVersion,
    reportHash: hash(report), report, definition, operatingForecasts,
  };
  // JSON copy is intentional: callers cannot mutate a snapshot via their input.
  return JSON.parse(JSON.stringify({ ...payload, snapshotHash: hash(payload) })) as EvaluationSnapshot;
}

/** Hash validation is tamper evidence, not a signature or trusted timestamp. */
export function verifyEvaluationSnapshot(input: unknown): EvaluationSnapshot {
  const obj = record(input);
  if (obj.snapshotVersion !== 1 || obj.policyVersion !== EVALUATION_POLICY_VERSION) throw new Error("Unsupported snapshot or evaluation policy version");
  if (typeof obj.frozenAt !== "string") throw new Error("Missing snapshot frozenAt");
  const rebuilt = createEvaluationSnapshot(obj.report, obj.definition, obj.frozenAt);
  if (canonicalJson(rebuilt) !== canonicalJson(obj)) throw new Error("Snapshot hash/integrity mismatch");
  return rebuilt;
}

export type EvaluationExclusionReason =
  | "missing-outcome" | "duplicate-outcome" | "invalid-outcome"
  | "issuer-mismatch" | "metric-mismatch" | "period-mismatch"
  | "unit-mismatch" | "currency-mismatch" | "basis-mismatch"
  | "horizon-not-matured" | "outcome-not-yet-available" | "invalid-availability-date"
  | "security-mismatch" | "benchmark-mismatch" | "invalid-market-level"
  | "non-finite-result" | "unverified-period" | "forecast-period-mismatch";

type Excluded = { id: string; status: "excluded"; reasons: EvaluationExclusionReason[] };
type OperatingIncluded = {
  id: string; status: "included"; metric: OperatingDefinition["metric"];
  scenario: OperatingDefinition["scenario"]; periodStart: string; periodEnd: string;
  unit: string; currency: string | null; basis: string; source: string;
  forecastValue: number; actualValue: number; signedError: number;
  absoluteError: number; absolutePercentageError: number | null;
};
type MarketIncluded = {
  id: string; status: "included"; startDate: string; endDate: string;
  currency: string; basis: MarketDefinition["basis"]; securityId: string; benchmarkId: string;
  source: string; securityReturnPct: number; benchmarkReturnPct: number; excessReturnPp: number;
};

export interface ReportEvaluation {
  evaluationVersion: 1;
  policyVersion: typeof EVALUATION_POLICY_VERSION;
  snapshotHash: string;
  outcomesHash: string;
  asOf: string;
  registration: "same-day-snapshot" | "retrospective-snapshot";
  operating: Array<OperatingIncluded | Excluded>;
  market: Array<MarketIncluded | Excluded>;
  unmatchedOutcomes: Array<{ index: number; id: string | null; reason: string }>;
  counts: { operatingIncluded: number; operatingExcluded: number; marketIncluded: number; marketExcluded: number };
  limitations: string[];
}

function commonReasons(
  outcome: z.infer<typeof operatingOutcomeSchema> | z.infer<typeof marketOutcomeSchema>,
  definition: EvaluationDefinition,
  endDate: string,
  asOf: string,
): EvaluationExclusionReason[] {
  const reasons: EvaluationExclusionReason[] = [];
  if (canonicalJson(outcome.issuer) !== canonicalJson(definition.issuer)) reasons.push("issuer-mismatch");
  if (endDate > asOf) reasons.push("horizon-not-matured");
  if (outcome.availableDate > asOf) reasons.push("outcome-not-yet-available");
  if (outcome.availableDate < endDate) reasons.push("invalid-availability-date");
  return reasons;
}

function exclusion(id: string, reasons: EvaluationExclusionReason[]): Excluded {
  return { id, status: "excluded", reasons: [...new Set(reasons)] };
}

export function evaluateReportSnapshot(snapshotInput: unknown, outcomesInput: unknown, asOf: string): ReportEvaluation {
  const snapshot = verifyEvaluationSnapshot(snapshotInput);
  const outcomes = EvaluationOutcomesSchema.parse(outcomesInput);
  date.parse(asOf);
  if (asOf < snapshot.definition.asOf) throw new Error("Evaluation as-of predates the report definition");
  if (asOf > new Date().toISOString().slice(0, 10)) throw new Error("Evaluation as-of cannot be in the future");
  const registered = new Set([...snapshot.definition.operating, ...snapshot.definition.market].map((item) => item.id));
  const byId = new Map<string, unknown[]>();
  const unmatchedOutcomes: ReportEvaluation["unmatchedOutcomes"] = [];
  outcomes.outcomes.forEach((outcome, index) => {
    const id = record(outcome).id;
    if (typeof id !== "string" || !id.trim()) {
      unmatchedOutcomes.push({ index, id: null, reason: "missing-outcome-id" });
    } else if (!registered.has(id)) {
      unmatchedOutcomes.push({ index, id, reason: "unregistered-outcome" });
    } else {
      byId.set(id, [...(byId.get(id) ?? []), outcome]);
    }
  });
  function missingOrDuplicate(id: string): Excluded | null {
    const rows = byId.get(id) ?? [];
    return rows.length === 1 ? null : exclusion(id, [rows.length === 0 ? "missing-outcome" : "duplicate-outcome"]);
  }

  const operating: ReportEvaluation["operating"] = snapshot.operatingForecasts.map((forecast) => {
    if (forecast.periodExclusionReason) return exclusion(forecast.id, [forecast.periodExclusionReason]);
    const unavailable = missingOrDuplicate(forecast.id);
    if (unavailable) return unavailable;
    const parsed = operatingOutcomeSchema.safeParse(byId.get(forecast.id)![0]);
    if (!parsed.success) return exclusion(forecast.id, ["invalid-outcome"]);
    const actual = parsed.data;
    const reasons = commonReasons(actual, snapshot.definition, forecast.periodEnd, asOf);
    if (actual.metric !== forecast.metric) reasons.push("metric-mismatch");
    if (actual.periodStart !== forecast.periodStart || actual.periodEnd !== forecast.periodEnd) reasons.push("period-mismatch");
    if (actual.unit !== forecast.unit) reasons.push("unit-mismatch");
    if (actual.currency !== forecast.currency) reasons.push("currency-mismatch");
    if (actual.basis !== forecast.basis) reasons.push("basis-mismatch");
    if (reasons.length) return exclusion(forecast.id, reasons);
    const signedError = forecast.forecastValue - actual.value;
    const absoluteError = Math.abs(signedError);
    const absolutePercentageError = actual.value === 0 ? null : absoluteError / Math.abs(actual.value) * 100;
    if (![signedError, absoluteError, absolutePercentageError ?? 0].every(Number.isFinite)) return exclusion(forecast.id, ["non-finite-result"]);
    return {
      id: forecast.id, status: "included", metric: forecast.metric, scenario: forecast.scenario,
      periodStart: forecast.periodStart, periodEnd: forecast.periodEnd,
      unit: forecast.unit, currency: forecast.currency, basis: forecast.basis, source: actual.source,
      forecastValue: forecast.forecastValue, actualValue: actual.value, signedError, absoluteError, absolutePercentageError,
    };
  });

  const market: ReportEvaluation["market"] = snapshot.definition.market.map((horizon) => {
    const unavailable = missingOrDuplicate(horizon.id);
    if (unavailable) return unavailable;
    const parsed = marketOutcomeSchema.safeParse(byId.get(horizon.id)![0]);
    if (!parsed.success) return exclusion(horizon.id, ["invalid-outcome"]);
    const actual = parsed.data;
    const reasons = commonReasons(actual, snapshot.definition, horizon.endDate, asOf);
    if (actual.security.id !== horizon.securityId) reasons.push("security-mismatch");
    if (actual.benchmark.id !== horizon.benchmarkId) reasons.push("benchmark-mismatch");
    for (const leg of [actual.security, actual.benchmark]) {
      if (leg.startDate !== horizon.startDate || leg.endDate !== horizon.endDate) reasons.push("period-mismatch");
      if (leg.currency !== horizon.currency) reasons.push("currency-mismatch");
      if (leg.basis !== horizon.basis) reasons.push("basis-mismatch");
      if (leg.startValue <= 0 || leg.endValue < 0) reasons.push("invalid-market-level");
    }
    if (reasons.length) return exclusion(horizon.id, reasons);
    const securityReturnPct = (actual.security.endValue / actual.security.startValue - 1) * 100;
    const benchmarkReturnPct = (actual.benchmark.endValue / actual.benchmark.startValue - 1) * 100;
    const excessReturnPp = securityReturnPct - benchmarkReturnPct;
    if (![securityReturnPct, benchmarkReturnPct, excessReturnPp].every(Number.isFinite)) return exclusion(horizon.id, ["non-finite-result"]);
    return {
      id: horizon.id, status: "included", startDate: horizon.startDate, endDate: horizon.endDate,
      currency: horizon.currency, basis: horizon.basis, securityId: horizon.securityId, benchmarkId: horizon.benchmarkId,
      source: actual.source, securityReturnPct, benchmarkReturnPct, excessReturnPp,
    };
  });
  const operatingIncluded = operating.filter((row) => row.status === "included").length;
  const marketIncluded = market.filter((row) => row.status === "included").length;
  return {
    evaluationVersion: 1, policyVersion: EVALUATION_POLICY_VERSION,
    snapshotHash: snapshot.snapshotHash, outcomesHash: hash(outcomes), asOf,
    registration: snapshot.frozenAt.slice(0, 10) <= snapshot.definition.asOf ? "same-day-snapshot" : "retrospective-snapshot",
    operating, market, unmatchedOutcomes,
    counts: { operatingIncluded, operatingExcluded: operating.length - operatingIncluded, marketIncluded, marketExcluded: market.length - marketIncluded },
    limitations: [
      "Supplied issuer identity, accounting/share bases, fiscal dates, availability dates and actuals are not independently verified by this offline evaluator.",
      "Retrospective registration can introduce selection and look-ahead bias. Hashes detect content edits but are not trusted timestamps or signatures.",
      "Operating errors and benchmark-relative realized returns are separate observations; neither validates a DCF present value as a future price forecast.",
      "Price returns exclude dividends. Total-return inputs must already incorporate distributions consistently; no split, dividend or FX adjustments are inferred.",
      "These observations do not establish calibrated scenario probabilities, interval coverage, investment performance or population-wide forecasting accuracy.",
    ],
  };
}
