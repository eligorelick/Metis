/**
 * Offline boundary for a FUTURE upstream metadata producer. Current projection
 * points do not establish these dimensions. This module checks upstream-declared
 * structured records and retained byte identity; it does not certify their truth
 * and deliberately does not authorize strict report registration.
 */
import { z } from "zod";
import {
  artifactHashSchema, artifactIsBound, evaluationStampSchema, retainedArtifactSchema,
  targetDefinitionV2Schema, type RetainedArtifact, type TargetDefinitionV2,
} from "@/evaluation/targetDefinition";

export const FORECAST_ADAPTER_VERSION = "SELECTED_FORECAST_V1" as const;
const text = z.string().trim().min(1);
const day = evaluationStampSchema.refine(value => value.length === 10, "Expected an exact ISO day");
const instant = z.iso.datetime();
const metric = z.enum(["revenue", "operatingMargin", "fcf", "epsDiluted"]);
const scenario = z.enum(["base", "bull", "bear", "weighted"]);
const currency = z.string().regex(/^[A-Z]{3}$/).refine(value => !["XXX", "UNK"].includes(value)).nullable();
const basisDimensions = {
  currency, unit: text, corporateActionBasis: text,
};

/** Closed, declared measurement definitions. Prose is never parsed for meaning.
 * Both source-basis and method records use this same metric discrimination.
 * New accounting/adjustment/share conventions require explicit schema support. */
function metricBasisRecord<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.discriminatedUnion("metric", [
    z.object({ ...shape, metric: z.literal("revenue"),
      accountingBasis: z.enum(["US-GAAP-consolidated-as-reported", "IFRS-consolidated-as-reported"]), shareBasis: z.literal("not_per_share"),
    }).strict(),
    z.object({ ...shape, metric: z.literal("operatingMargin"),
      accountingBasis: z.enum(["US-GAAP-operating-income/revenue", "IFRS-operating-income/revenue"]), shareBasis: z.literal("not_per_share"),
    }).strict(),
    z.object({ ...shape, metric: z.literal("fcf"),
      accountingBasis: z.literal("unlevered-FCFF"), shareBasis: z.literal("not_per_share"),
    }).strict(),
    z.object({ ...shape, metric: z.literal("epsDiluted"),
      accountingBasis: z.enum(["US-GAAP-diluted-EPS", "IFRS-diluted-EPS"]),
      shareBasis: z.enum(["diluted-per-quoted-ADS-as-reported", "diluted-per-quoted-ordinary-as-reported"]),
    }).strict(),
  ]);
}

/** Not a ReportSchema extension. Arbitrary old report fields are never consumed. */
export const selectedForecastMetadataV1Schema = z.object({
  adapterVersion: z.literal(FORECAST_ADAPTER_VERSION), reportGeneratedAt: instant,
  pipelineVersion: text, methodVersion: text,
  reportPath: z.string().regex(/^\/projections\/series\/(0|[1-9]\d*)\/(base|bull|bear|weighted)\/(0|[1-9]\d*)\/value$/),
  metric, scenario, periodLabel: text, periodStart: day, periodEnd: day,
  value: z.number().finite(), currency, unit: text, source: text, sourceAsOf: day,
  basisArtifactHash: artifactHashSchema, methodArtifactHash: artifactHashSchema,
}).strict();
export type SelectedForecastMetadataV1 = z.infer<typeof selectedForecastMetadataV1Schema>;

/** A retained typed extraction/producer record, not a semantic source verifier. */
export const forecastBasisRecordV1Schema = metricBasisRecord({
  schemaVersion: z.literal(1), kind: z.literal("forecast-basis"), issuerId: text, symbol: text,
  ...basisDimensions,
  security: z.object({
    securityId: text, ordinaryClassId: text, quoteUnit: z.enum(["ordinary", "ADS"]),
    ordinarySharesPerQuotedUnit: z.number().finite().positive(),
  }).strict().refine(value => value.quoteUnit !== "ordinary" || value.ordinarySharesPerQuotedUnit === 1,
    "Ordinary quote unit requires a ratio of one"),
  effectiveFrom: day, effectiveTo: day.nullable(), availableAt: instant,
  sourceDocumentHash: artifactHashSchema,
});

export const forecastMethodRecordV1Schema = metricBasisRecord({
  schemaVersion: z.literal(1), kind: z.literal("projection-method"), pipelineVersion: text,
  methodVersion: text, ...basisDimensions, availableAt: instant, horizonMonths: z.literal(12),
});

export interface ForecastAdapterCandidate {
  adapterVersion: typeof FORECAST_ADAPTER_VERSION;
  productionAdmission: false;
  evidenceStatus: "upstream-declared";
  selected: SelectedForecastMetadataV1;
  declaredBasis: z.infer<typeof forecastBasisRecordV1Schema>;
  targetCandidate: TargetDefinitionV2;
  limitations: string[];
}

function record(input: unknown): Record<string, unknown> {
  return input !== null && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
}
function same(actual: unknown, expected: unknown, dimension: string): void {
  if (actual !== expected) throw new Error(`Selected forecast ${dimension} mismatch`);
}
function retained(hash: string, kind: RetainedArtifact["kind"], artifacts: RetainedArtifact[]): RetainedArtifact {
  const matches = artifacts.filter(artifact => artifact.hash === hash && artifact.kind === kind);
  if (matches.length !== 1 || !matches[0].content.trim() || !artifactIsBound(hash, kind, artifacts)) {
    throw new Error(`Missing, ambiguous or changed ${kind} artifact`);
  }
  return matches[0];
}
function json(artifact: RetainedArtifact): unknown {
  try { return JSON.parse(artifact.content); }
  catch { throw new Error(`Invalid structured ${artifact.kind} artifact`); }
}

/**
 * Bind one explicit deterministic selection to versioned upstream records and
 * derive a candidate target. An optional requested target must match every
 * dimension; it cannot supply missing forecast dimensions. Neither this result
 * nor rehashing its records enables createEvaluationSnapshot's strict V2 guard.
 * V1 accepts a selection-scoped artifact set with exactly one input/basis record
 * and one method record. It does not reconcile competing upstream declarations.
 */
export function adaptSelectedForecastV1(
  reportInput: unknown, metadataInput: unknown, artifactsInput: unknown, requestedTarget?: unknown,
): ForecastAdapterCandidate {
  const selected = selectedForecastMetadataV1Schema.parse(metadataInput);
  const artifacts = z.array(retainedArtifactSchema).parse(artifactsInput);
  for (const kind of ["input", "method"] as const) {
    if (artifacts.filter(artifact => artifact.kind === kind).length !== 1) {
      throw new Error(`Missing or ambiguous ${kind} artifact set; V1 requires one selection-scoped record`);
    }
  }
  const basis = forecastBasisRecordV1Schema.parse(json(retained(selected.basisArtifactHash, "input", artifacts)));
  const method = forecastMethodRecordV1Schema.parse(json(retained(selected.methodArtifactHash, "method", artifacts)));
  retained(basis.sourceDocumentHash, "source", artifacts);

  const report = record(reportInput);
  const meta = record(report.meta);
  same(instant.parse(meta.generatedAt), selected.reportGeneratedAt, "generation time");
  same(meta.pipelineVersion, selected.pipelineVersion, "pipeline version");
  same(meta.symbol, basis.symbol, "issuer symbol");
  if (Date.parse(selected.reportGeneratedAt) > Date.now()) throw new Error("Report generation is in the future");
  const reportDay = selected.reportGeneratedAt.slice(0, 10);
  for (const entry of [basis, method]) {
    if (Date.parse(entry.availableAt) > Date.parse(selected.reportGeneratedAt)) throw new Error("Evidence not available at report generation");
  }
  if (basis.effectiveFrom > reportDay || (basis.effectiveTo !== null && basis.effectiveTo <= reportDay)) {
    throw new Error("Basis evidence is not effective at report generation");
  }
  if (selected.sourceAsOf > reportDay) throw new Error("Forecast source as-of follows report generation");
  same(method.pipelineVersion, selected.pipelineVersion, "method pipeline version");
  same(method.methodVersion, selected.methodVersion, "method version");
  for (const key of ["metric", "currency", "unit"] as const) same(basis[key], selected[key], key);
  for (const key of ["metric", "currency", "unit", "accountingBasis", "shareBasis", "corporateActionBasis"] as const) {
    same(method[key], basis[key], `method ${key}`);
  }
  if (basis.metric === "epsDiluted") {
    const shareBasisForQuote = basis.security.quoteUnit === "ADS"
      ? "diluted-per-quoted-ADS-as-reported" : "diluted-per-quoted-ordinary-as-reported";
    same(basis.shareBasis, shareBasisForQuote, "EPS share/quote basis");
  }

  const projections = record(report.projections);
  if (projections.notApplicableReason) throw new Error("Operating projections are suppressed");
  const series = Array.isArray(projections.series) ? projections.series : [];
  const matchingSeries = series.map((entry, index) => ({ entry: record(entry), index })).filter(({ entry }) => entry.metric === selected.metric);
  if (matchingSeries.length !== 1) throw new Error("Missing or ambiguous selected metric");
  const chosen = matchingSeries[0];
  same(chosen.entry.unit, selected.unit, "series unit");
  const points = chosen.entry[selected.scenario];
  const matchingPoints = (Array.isArray(points) ? points : []).map((entry, index) => ({ entry: record(entry), index }))
    .filter(({ entry }) => entry.period === selected.periodLabel);
  if (matchingPoints.length !== 1) throw new Error("Missing or ambiguous selected period");
  const point = matchingPoints[0];
  same(`/projections/series/${chosen.index}/${selected.scenario}/${point.index}/value`, selected.reportPath, "path");
  same(point.entry.periodStart, selected.periodStart, "period start");
  same(point.entry.periodEnd, selected.periodEnd, "period end");
  const value = record(point.entry.value);
  same(value.value, selected.value, "value");
  same(value.unit, selected.unit, "point unit");
  same(value.source, selected.source, "source");
  same(value.asOf, selected.sourceAsOf, "source as-of");
  if (value.currency != null) same(value.currency, selected.currency, "point currency");
  const slug = (value: string) => value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "value";
  const computed = `computed.projections.${selected.metric}.${selected.scenario}`;
  const assembled = `payload.computed.projections.${slug(selected.metric)}.${selected.scenario}.${slug(selected.periodLabel)}`;
  if (selected.source !== computed && selected.source !== assembled) throw new Error("Selected source is not a deterministic forward projection");
  if (selected.metric === "operatingMargin") {
    if (selected.unit !== "%" || selected.currency !== null) throw new Error("Margin requires percent and null currency");
  } else if (selected.currency === null || selected.unit !== `${selected.currency}${selected.metric === "epsDiluted" ? "/share" : ""}`) {
    throw new Error("Forecast currency/unit is unknown or incompatible");
  }
  const inclusiveDays = (Date.parse(selected.periodEnd) - Date.parse(selected.periodStart)) / 86_400_000 + 1;
  const fiscal = /^FY(\d{4})(?: ending (\d{4}-\d{2}-\d{2}))?$/.exec(selected.periodLabel);
  const rolling = /^12M ending (\d{4}-\d{2}-\d{2})$/.exec(selected.periodLabel);
  if (inclusiveDays < 364 || inclusiveDays > 371 || selected.periodEnd <= reportDay ||
    (!fiscal && !rolling) || (fiscal && selected.periodEnd.slice(0, 4) !== fiscal[1]) ||
    (fiscal?.[2] && selected.periodEnd !== fiscal[2]) || (rolling && selected.periodEnd !== rolling[1])) {
    throw new Error("Unsupported or contradictory annual forecast window");
  }
  const targetCandidate = targetDefinitionV2Schema.parse({
    schemaVersion: 2, targetId: `${selected.metric}:${selected.scenario}:${selected.periodStart}:${selected.periodEnd}`,
    issuerId: basis.issuerId, securityId: basis.security.securityId, metric: selected.metric,
    accountingBasis: basis.accountingBasis, currency: selected.currency, unit: selected.unit,
    shareBasis: basis.shareBasis, corporateActionBasis: basis.corporateActionBasis,
    periodStart: selected.periodStart, periodEnd: selected.periodEnd, horizonMonths: method.horizonMonths,
    forecastKind: selected.periodStart > reportDay ? "forecast" : "partial_year",
    createdAt: selected.reportGeneratedAt, methodArtifactHash: selected.methodArtifactHash,
  });
  if (requestedTarget !== undefined) {
    const target = targetDefinitionV2Schema.parse(requestedTarget);
    const keys = new Set([...Object.keys(targetCandidate), ...Object.keys(target)]);
    for (const key of keys) {
      const dimension = key as keyof TargetDefinitionV2;
      if (target[dimension] !== targetCandidate[dimension]) throw new Error(`Requested target ${key} mismatch`);
    }
  }
  return {
    adapterVersion: FORECAST_ADAPTER_VERSION, productionAdmission: false, evidenceStatus: "upstream-declared",
    selected, declaredBasis: basis, targetCandidate,
    limitations: [
      "Structured metadata compatibility and retained byte identity do not establish semantic source, security, accounting or timing truth.",
      "Issuer/security/ADS/share/action dimensions and method identity remain upstream declarations requiring validated acquisition and retention.",
      "Current reports remain ineligible for strict V2 registration; this standalone candidate does not enable production admission.",
    ],
  };
}
