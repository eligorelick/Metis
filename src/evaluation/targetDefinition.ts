import { createHash } from "node:crypto";
import { z } from "zod";

export const evaluationStampSchema = z.string().refine((value) => {
  const at = Date.parse(value);
  return /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/.test(value) && Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === value.slice(0, 10);
}, "Expected an actual ISO day or UTC timestamp");
const text = z.string().trim().min(1);
export const artifactHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const currency = z.string().regex(/^[A-Z]{3}$/).refine(v => !["XXX", "UNK"].includes(v), "Known monetary currency required").nullable();
const dimensions = {
  targetId: text, issuerId: text, securityId: text, metric: text, accountingBasis: text,
  currency, unit: text, shareBasis: text, corporateActionBasis: text,
  periodStart: evaluationStampSchema, periodEnd: evaluationStampSchema,
  benchmarkId: text.optional(), concept: text.optional(),
};
export const targetDefinitionV2Schema = z.object({
  schemaVersion: z.literal(2), ...dimensions, horizonMonths: z.number().int().positive(),
  forecastKind: z.enum(["forecast", "nowcast", "partial_year"]), createdAt: evaluationStampSchema,
  methodArtifactHash: artifactHashSchema,
}).strict().superRefine((target, ctx) => {
  if (Date.parse(target.periodStart) >= Date.parse(target.periodEnd)) ctx.addIssue({ code: "custom", path: ["periodEnd"], message: "invalid_target_period" });
  if (target.securityId === target.benchmarkId) ctx.addIssue({ code: "custom", path: ["benchmarkId"], message: "same_security_benchmark" });
});
export const evidenceObservationV2Schema = z.object({
  ...dimensions, availableAt: evaluationStampSchema, accession: text.optional(),
  sourceHash: artifactHashSchema, value: z.number().finite(),
}).strict();
export const retainedArtifactSchema = z.object({
  kind: z.enum(["source", "method", "input", "report", "prompt", "dependency_lock", "dirty_diff"]),
  hash: artifactHashSchema, content: z.string(),
}).strict();
export type TargetDefinitionV2 = z.infer<typeof targetDefinitionV2Schema>;
export type EvidenceObservationV2 = z.infer<typeof evidenceObservationV2Schema>;
export type RetainedArtifact = z.infer<typeof retainedArtifactSchema>;
export type ObservationExclusionReason = "target_mismatch" | "issuer_mismatch" | "security_mismatch" | "metric_mismatch" | "accounting_basis_mismatch" | "currency_mismatch" | "unit_mismatch" | "share_basis_mismatch" | "corporate_action_basis_mismatch" | "period_mismatch" | "benchmark_mismatch" | "concept_mismatch" | "source_unbound" | "outcome_already_available" | "outcome_before_period_end" | "future_outcome";
export interface EvidenceEligibility { status: "included" | "excluded"; reasons: ObservationExclusionReason[] }

export const hashArtifactBytes = (content: string): string => createHash("sha256").update(content, "utf8").digest("hex");
/** Resolves exact retained UTF-8 bytes. A matching hash establishes identity, not truth or time. */
export function artifactIsBound(hash: string, kind: RetainedArtifact["kind"], artifacts: readonly RetainedArtifact[]): boolean {
  const matches = artifacts.filter(a => a.hash === hash && a.kind === kind);
  return matches.length > 0 && matches.every(a => hashArtifactBytes(a.content) === hash) && new Set(matches.map(a => a.content)).size === 1;
}
export function parseTargetV2(input: unknown): TargetDefinitionV2 { return targetDefinitionV2Schema.parse(input); }

/** Metadata compatibility and retained-byte identity only; no semantic SEC verification. */
export function matchObservation(target: TargetDefinitionV2, actual: EvidenceObservationV2, options: { evaluatedAt?: string; retainedArtifacts?: readonly RetainedArtifact[] } = {}): EvidenceEligibility {
  target = parseTargetV2(target); actual = evidenceObservationV2Schema.parse(actual);
  const reasons: ObservationExclusionReason[] = [];
  const names = { targetId: "target_mismatch", issuerId: "issuer_mismatch", securityId: "security_mismatch", metric: "metric_mismatch", accountingBasis: "accounting_basis_mismatch", currency: "currency_mismatch", unit: "unit_mismatch", shareBasis: "share_basis_mismatch", corporateActionBasis: "corporate_action_basis_mismatch", periodStart: "period_mismatch", periodEnd: "period_mismatch", benchmarkId: "benchmark_mismatch", concept: "concept_mismatch" } as const;
  for (const [key, reason] of Object.entries(names)) {
    const dimension = key as keyof typeof names;
    if (dimension === "concept" && target.concept === undefined) continue;
    if (target[dimension] !== actual[dimension]) reasons.push(reason);
  }
  if (!artifactIsBound(actual.sourceHash, "source", options.retainedArtifacts ?? [])) reasons.push("source_unbound");
  if (Date.parse(actual.availableAt) <= Date.parse(target.createdAt)) reasons.push("outcome_already_available");
  if (Date.parse(actual.availableAt) < Date.parse(actual.periodEnd)) reasons.push("outcome_before_period_end");
  const cutoff = options.evaluatedAt ? Date.parse(options.evaluatedAt) + (options.evaluatedAt.length === 10 ? 86_399_999 : 0) : Infinity;
  if (Date.parse(actual.availableAt) > cutoff) reasons.push("future_outcome");
  const unique = [...new Set(reasons)];
  return { status: unique.length ? "excluded" : "included", reasons: unique };
}
