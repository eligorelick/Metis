/** Offline, descriptive claim-review evaluation. This module has no provider or DB access. */
import { createHash } from "node:crypto";
import { z } from "zod";

const nonempty = z.string().min(1).refine(s => s.trim().length > 0, "Must contain non-whitespace text");
// Unpaired surrogates cannot be retained losslessly as UTF8 bytes.
const retainedText = nonempty.refine(s => Buffer.from(s, "utf8").toString("utf8") === s, "Text must round-trip through UTF8");
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
  const parsed = new Date(`${s}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === s;
}, "Invalid calendar date");
const period = z.object({ start: date, end: date }).strict().refine(p => p.start <= p.end, "Reversed period");
export const ClaimLabelSchema = z.enum(["supported", "contradicted", "insufficient", "mixed"]);
export type ClaimLabel = z.infer<typeof ClaimLabelSchema>;
const SourceSchema = z.object({ id: nonempty, text: retainedText, sha256: hash, issuer: nonempty, publishedAt: date, period }).strict();
const ClaimSchema = z.object({ text: retainedText, sha256: hash, issuer: nonempty, asOf: date, period }).strict();
const SpanSchema = z.object({ sourceId: nonempty, start: z.number().int().nonnegative(), end: z.number().int().positive(), text: retainedText }).strict();
const ReviewSchema = z.object({
  reviewerId: nonempty, role: z.enum(["independent", "adjudicator"]), independent: z.literal(true),
  scope: z.literal("whole-claim"), label: ClaimLabelSchema, caseHash: hash,
}).strict();
const ReferenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("synthetic"), label: ClaimLabelSchema, caseHash: hash, rationale: nonempty }).strict(),
  z.object({ kind: z.literal("human-reviewed"), reviews: z.array(ReviewSchema) }).strict(),
]);
export const ClaimCaseSchema = z.object({ id: nonempty, claim: ClaimSchema, sources: z.array(SourceSchema).min(1), spans: z.array(SpanSchema).min(1), reference: ReferenceSchema }).strict();
export type ClaimCase = z.infer<typeof ClaimCaseSchema>;
export const ClaimCorpusSchema = z.object({
  schemaVersion: z.literal("claim-corpus/v1"), kind: z.enum(["synthetic", "human-reviewed"]), description: nonempty, cases: z.array(ClaimCaseSchema).min(1),
}).strict().refine(c => c.cases.every(item => item.reference.kind === c.kind), "Corpus and reference kinds must agree");
export type ClaimCorpus = z.infer<typeof ClaimCorpusSchema>;
export const ClaimPredictionsSchema = z.object({
  schemaVersion: z.literal("claim-predictions/v1"), checker: z.object({ id: nonempty, version: nonempty }).strict(), corpusHash: hash,
  outputs: z.array(z.object({ caseId: nonempty, caseHash: hash, scope: z.enum(["whole-claim", "numeric-only"]), label: z.union([ClaimLabelSchema, z.literal("abstain")]) }).strict()),
}).strict();
export type ClaimPredictions = z.infer<typeof ClaimPredictionsSchema>;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export function hashSourceText(text: string): string { return createHash("sha256").update(text, "utf8").digest("hex"); }
export const hashClaimText = hashSourceText;
/** References are excluded so reviewers can declare the hash they reviewed. Every evidence/claim field is included. */
export function hashClaimCase(item: Pick<ClaimCase, "id" | "claim" | "sources" | "spans">): string {
  return hashSourceText(canonical({ schemaVersion: "claim-case/v1", id: item.id, claim: item.claim, sources: item.sources, spans: item.spans }));
}
/** Includes reference labels/declarations: predictions cannot silently move between corpus revisions. */
export function hashClaimCorpus(corpus: ClaimCorpus): string { return hashSourceText(canonical(corpus)); }

function duplicates(values: string[]): Set<string> {
  const seen = new Set<string>(); const repeated = new Set<string>();
  for (const value of values) { if (seen.has(value)) repeated.add(value); seen.add(value); }
  return repeated;
}
function referenceLabel(item: ClaimCase, caseHash: string, reasons: string[]): ClaimLabel | undefined {
  if (item.reference.kind === "synthetic") {
    if (item.reference.caseHash !== caseHash) reasons.push("review-case-hash-mismatch");
    return item.reference.label;
  }
  const reviews = item.reference.reviews;
  if (reviews.some(r => r.caseHash !== caseHash)) reasons.push("review-case-hash-mismatch");
  if (duplicates(reviews.map(r => r.reviewerId.trim().toLowerCase())).size) reasons.push("duplicate-reviewer-identity");
  const independent = reviews.filter(r => r.role === "independent");
  const adjudicators = reviews.filter(r => r.role === "adjudicator");
  if (independent.length !== 2) { reasons.push("requires-two-independent-reviews"); return; }
  if (independent[0].label === independent[1].label) {
    if (adjudicators.length) reasons.push("unnecessary-or-conflicting-adjudication");
    return independent[0].label;
  }
  if (adjudicators.length !== 1) { reasons.push("unresolved-review-disagreement"); return; }
  return adjudicators[0].label;
}
const labels: ClaimLabel[] = ["supported", "contradicted", "insufficient", "mixed"];

export function evaluateClaimBenchmark(corpusInput: unknown, predictionsInput: unknown) {
  const corpus = ClaimCorpusSchema.parse(corpusInput);
  const predictions = ClaimPredictionsSchema.parse(predictionsInput);
  const corpusHash = hashClaimCorpus(corpus);
  if (predictions.corpusHash !== corpusHash) throw new Error("Prediction corpus hash does not match retained corpus");
  const duplicateCaseIds = duplicates(corpus.cases.map(c => c.id));
  const duplicateOutputIds = duplicates(predictions.outputs.map(o => o.caseId));
  const excluded: { caseId: string; reasons: string[] }[] = [];
  const evidenceChallenges: { caseId: string; reasons: string[] }[] = [];
  const references: Record<string, ClaimLabel> = Object.create(null);
  const eligible: { item: ClaimCase; label: ClaimLabel; caseHash: string }[] = [];
  for (const item of corpus.cases) {
    const reasons: string[] = [];
    const challenges: string[] = [];
    if (duplicateCaseIds.has(item.id)) reasons.push("duplicate-case-id");
    if (duplicates(item.sources.map(s => s.id)).size) reasons.push("duplicate-source-id");
    if (item.claim.sha256 !== hashClaimText(item.claim.text)) reasons.push("claim-hash-mismatch");
    if (item.claim.period.end > item.claim.asOf) challenges.push("claim-period-after-cutoff");
    for (const source of item.sources) {
      if (source.sha256 !== hashSourceText(source.text)) reasons.push("source-hash-mismatch");
      // Every retained source is exposed to the checker, including unspanned sources.
      if (source.issuer !== item.claim.issuer) challenges.push("foreign-issuer-source");
      if (source.publishedAt > item.claim.asOf) challenges.push("source-after-cutoff");
      if (source.period.start !== item.claim.period.start || source.period.end !== item.claim.period.end) challenges.push("source-period-mismatch");
    }
    for (const span of item.spans) {
      const source = item.sources.find(s => s.id === span.sourceId);
      // Offsets are JavaScript UTF16 code units, end exclusive; sliced text must itself be valid UTF8.
      if (!source || span.start >= span.end || span.end > source.text.length || source.text.slice(span.start, span.end) !== span.text) {
        reasons.push("invalid-source-span"); continue;
      }
    }
    const caseHash = hashClaimCase(item);
    const label = referenceLabel(item, caseHash, reasons);
    // A human reference cannot assert source-supported truth from inadmissible retained evidence.
    if (corpus.kind === "human-reviewed" && challenges.length && label !== "insufficient") reasons.push("inadmissible-human-reference");
    if (challenges.length) evidenceChallenges.push({ caseId: item.id, reasons: [...new Set(challenges)] });
    if (reasons.length || !label) { excluded.push({ caseId: item.id, reasons: [...new Set(reasons)] }); continue; }
    references[item.id] = label; eligible.push({ item, label, caseHash });
  }
  const confusion = Object.fromEntries(labels.map(label => [label, Object.fromEntries(labels.map(pred => [pred, 0]))])) as Record<ClaimLabel, Record<ClaimLabel, number>>;
  const statusCounts = { assessed: 0, abstained: 0, numericOnly: 0, duplicateOutput: 0, hashMismatch: 0, missing: 0 };
  const assessments: { caseId: string; status: keyof typeof statusCounts; reference: ClaimLabel; prediction?: ClaimLabel }[] = [];
  let agreed = 0; let predictedSupported = 0; let falseSupported = 0;
  for (const { item, label, caseHash } of eligible) {
    const outputs = predictions.outputs.filter(o => o.caseId === item.id);
    let status: keyof typeof statusCounts;
    let prediction: ClaimLabel | undefined;
    if (duplicateOutputIds.has(item.id)) status = "duplicateOutput";
    else if (!outputs.length) status = "missing";
    else if (outputs[0].caseHash !== caseHash) status = "hashMismatch";
    else if (outputs[0].scope === "numeric-only") status = "numericOnly";
    else if (outputs[0].label === "abstain") status = "abstained";
    else {
      status = "assessed"; prediction = outputs[0].label;
      confusion[label][prediction]++;
      if (prediction === label) agreed++;
      if (prediction === "supported") { predictedSupported++; if (label !== "supported") falseSupported++; }
    }
    statusCounts[status]++;
    assessments.push({ caseId: item.id, status, reference: label, ...(prediction ? { prediction } : {}) });
  }
  const knownIds = new Set(corpus.cases.map(c => c.id));
  const excludedIds = new Set(excluded.map(c => c.caseId));
  return {
    schemaVersion: "claim-benchmark-result/v1" as const, corpusKind: corpus.kind, corpusHash, checker: predictions.checker,
    totalCases: corpus.cases.length, eligibleCases: eligible.length, excluded, evidenceChallenges, references, assessments, statusCounts,
    unknownOutputs: predictions.outputs.filter(o => !knownIds.has(o.caseId)).map(o => o.caseId),
    outputsForExcludedCases: predictions.outputs.filter(o => excludedIds.has(o.caseId)).map(o => o.caseId),
    duplicateOutputIds: [...duplicateOutputIds], confusion,
    metrics: {
      eligible: eligible.length, attempted: statusCounts.assessed, agreed,
      coverage: eligible.length ? statusCounts.assessed / eligible.length : null,
      agreementAllEligible: eligible.length ? agreed / eligible.length : null,
      agreementAttempted: statusCounts.assessed ? agreed / statusCounts.assessed : null,
      predictedSupported, falseSupported, supportedPrecision: predictedSupported ? (predictedSupported - falseSupported) / predictedSupported : null,
    },
    limitations: [
      "Descriptive whole-claim label agreement on this retained corpus only; not investment accuracy or proof of factual truth.",
      "Synthetic seed scores never establish real report accuracy, live-provider correctness, or human review quality.",
      "Human reviewer identities and independence are operator-declared, not authenticated; hashes bind custody, not honesty or source completeness.",
      "Numeric-only predictions never count as whole-claim assessments; all eligible missing, duplicate, hash-mismatched and abstained cases remain in the all-eligible denominator.",
      "Exact source spans use UTF16 code-unit offsets (end exclusive), and source hashes cover exact UTF8 text bytes without normalization.",
    ],
  };
}
