import { z } from "zod";

function validStamp(value: string): boolean {
  const ms = Date.parse(value);
  return /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/.test(value) && Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value.slice(0, 10);
}
const stamp = z.string().refine(validStamp, "Expected an actual ISO day or UTC timestamp");
const number = z.number().finite();
const period = z.object({ start: stamp, end: stamp });
const currency = z.string().regex(/^[A-Z]{3}$/).refine((value) => !["XXX", "UNK"].includes(value), "Known monetary currency required");
const basis = z.object({ currency, unit: z.string().min(1), shareBasis: z.string().min(1), adjustmentsKnownAt: z.array(stamp).default([]) });
const prediction = z.object({ value: number, baseline: z.object({ name: z.string().min(1), value: number, availableAt: stamp }).optional(), interval: z.object({ low: number, high: number, nominalCoverage: number.gt(0).lt(1) }).optional() });
const common = {
  id: z.string().min(1), issuerId: z.string().min(1), symbol: z.string().min(1), snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  analysisAt: stamp, predictionAvailableAt: stamp, inputsAvailableAt: z.array(stamp).min(1),
  membership: z.object({ includedAt: stamp, delistedAt: stamp.nullable() }), basis, period, prediction,
  missingFields: z.array(z.string()).default([]),
  ablations: z.record(z.string(), z.object({ value: number, availableAt: stamp })).default({}),
  event: z.object({ definition: z.string().min(1), probability: number.min(0).max(1), outcome: z.union([z.literal(0), z.literal(1)]).nullable(), resolvedAt: stamp.nullable() }).optional(),
  writing: z.object({ adjudicatedAt: stamp, claims: z.array(z.enum(["supported", "contradicted", "unchecked"])) }).optional(),
  orderProbe: z.object({ original: number, permutations: z.array(number).min(1) }).optional(),
  grade: z.object({ score: number.min(0).max(100), version: z.string().min(1) }).optional(),
};
const filing = z.object({ ...common, kind: z.literal("filing"), metric: z.string().min(1), outcome: z.object({ value: number, publishedAt: stamp, observedAt: stamp, version: z.enum(["initial", "amended"]), accession: z.string().min(1), source: z.literal("sec_filing"), period, basis }).nullable() });
const returnObservation = z.object({ totalReturn: number.min(-1), currency, period, includesDistributions: z.boolean() });
const returns = z.object({ ...common, kind: z.literal("total_return"), metric: z.literal("excess_total_return"), outcome: z.object({ publishedAt: stamp, observedAt: stamp, source: z.literal("frozen_total_returns"), security: returnObservation.extend({ includesDelistingReturn: z.boolean() }), benchmark: returnObservation }).nullable() });
export const evaluationSampleSchema = z.discriminatedUnion("kind", [filing, returns]);
export const evaluationDatasetSchema = z.object({
  version: z.literal("research-evaluation-v1"), evidenceKind: z.enum(["synthetic_fixture", "historical_frozen", "prospective_frozen"]), evaluatedAt: stamp,
  universe: z.object({ id: z.string().min(1), formedAt: stamp, selection: z.enum(["point_in_time", "current_constituents_only"]), includesDelisted: z.boolean() }),
  rolling: z.object({ firstTestAt: stamp, testWindowDays: z.number().int().min(1).max(3660), minTrainSamples: z.number().int().min(1), minTestSamples: z.number().int().min(1) }),
  samples: z.array(z.unknown()).max(100_000),
  limitations: z.array(z.string().min(1)).default([]),
});
export type EvaluationSample = z.infer<typeof evaluationSampleSchema>;
export type EvaluationDataset = z.infer<typeof evaluationDatasetSchema>;
