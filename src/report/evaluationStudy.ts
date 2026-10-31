/** Prospective cohort orchestration over the existing report evaluator. No fitted weights or provider calls. */
import { z } from "zod";
import { canonicalSnapshotJson } from "@/pipeline/runInputSnapshot";
import { hashArtifactBytes } from "@/evaluation/targetDefinition";
import { createEvaluationSnapshot, evaluateReportSnapshot, verifyEvaluationSnapshot,
  EvaluationDefinitionSchema, EvaluationOutcomesSchema, type EvaluationSnapshot, type ReportEvaluation } from "./evaluation";

const text = z.string().trim().min(1);
const timestamp = z.iso.datetime();
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const baselineSchema = z.object({ selectionId: text, name: text, value: z.number().finite(), unit: text,
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(), basis: text, availableAt: timestamp, source: text }).strict();

export const EvaluationStudyProtocolSchema = z.object({
  schemaVersion: z.literal(1), id, description: text,
  universe: z.object({ source: text, selection: z.literal("point_in_time"), includesDelisted: z.boolean() }).strict(),
  slots: z.array(z.object({ id, sector: text, registerBy: timestamp, definition: EvaluationDefinitionSchema,
    baselines: z.array(baselineSchema).default([]) }).strict()).min(1).max(10_000),
}).strict();
export type EvaluationStudyProtocol = z.infer<typeof EvaluationStudyProtocolSchema>;
export interface EvaluationStudy { studyVersion: 1; createdAt: string; protocol: EvaluationStudyProtocol; studyHash: string }
export interface StudyRegistration { registrationVersion: 1; studyHash: string; slotId: string; snapshot: EvaluationSnapshot; registrationHash: string }
export const StudyOutcomesSchema = z.object({ schemaVersion: z.literal(1),
  slots: z.array(z.object({ slotId: id, outcomes: EvaluationOutcomesSchema }).strict()).max(10_000),
}).strict();
const digest = (value: unknown) => hashArtifactBytes(canonicalSnapshotJson(value));
const dayMs = 86_400_000;
const endOf = (day: string) => Date.parse(`${day}T23:59:59.999Z`);

/** Dates here are local process receipts. They are never claimed to be trusted attestations. */
export function createStudy(protocolInput: unknown, createdAt = new Date().toISOString()): EvaluationStudy {
  timestamp.parse(createdAt);
  if (Date.parse(createdAt) > Date.now()) throw new Error("Study creation cannot be in the future");
  const protocol = EvaluationStudyProtocolSchema.parse(protocolInput);
  const slotIds = new Set<string>();
  const issuerDates = new Set<string>();
  for (const slot of protocol.slots) {
    const d = slot.definition;
    const issuerDate = canonicalSnapshotJson([d.issuer.scheme, d.issuer.id, d.asOf]);
    if (slotIds.has(slot.id) || issuerDates.has(issuerDate)) throw new Error("Duplicate study slot or issuer/date");
    slotIds.add(slot.id); issuerDates.add(issuerDate);
    if (d.asOf < createdAt.slice(0, 10) || Date.parse(slot.registerBy) <= Date.parse(createdAt) || slot.registerBy.slice(0, 10) < d.asOf) {
      throw new Error("Prospective report date/deadline must follow study creation");
    }
    const selections = [...d.operating, ...d.market];
    if (!selections.length || new Set(selections.map(s => s.id)).size !== selections.length) throw new Error("Empty or duplicate evaluation selections");
    for (const selection of d.operating) {
      if (selection.target) throw new Error("Strict V2 report dimensions remain unavailable; study cannot authorize admission");
      if (selection.metric === "epsDiluted") throw new Error("Operating EPS is not GAAP diluted EPS; a validated outcome basis is required before study enrollment");
      if (selection.periodEnd <= slot.registerBy.slice(0, 10) || selection.periodStart >= selection.periodEnd) throw new Error("Operating period must end after the registration deadline");
    }
    for (const selection of d.market) {
      if (selection.startDate <= slot.registerBy.slice(0, 10) || selection.endDate <= selection.startDate) throw new Error("Market window must start after the registration deadline");
      if (selection.securityId === selection.benchmarkId) throw new Error("Security cannot be its own benchmark");
    }
    const baselineIds = new Set<string>();
    for (const baseline of slot.baselines) {
      const selection = d.operating.find(s => s.id === baseline.selectionId);
      if (!selection || baselineIds.has(baseline.selectionId)) throw new Error("Unknown or duplicate baseline selection");
      baselineIds.add(baseline.selectionId);
      if (Date.parse(baseline.availableAt) > Date.parse(createdAt)) throw new Error("Baseline not available at study creation");
      if (baseline.unit !== selection.unit || baseline.currency !== selection.currency || baseline.basis !== selection.basis) throw new Error("Baseline measurement basis mismatch");
    }
  }
  const body = { studyVersion: 1 as const, createdAt, protocol };
  return { ...body, studyHash: digest(body) };
}

export function verifyStudy(input: unknown): EvaluationStudy {
  const value = z.object({ studyVersion: z.literal(1), createdAt: timestamp, protocol: z.unknown(), studyHash: hash }).strict().parse(input);
  const rebuilt = createStudy(value.protocol, value.createdAt);
  if (canonicalSnapshotJson(rebuilt) !== canonicalSnapshotJson(value)) throw new Error("Study integrity mismatch");
  return rebuilt;
}

export function registerStudyReport(studyInput: unknown, slotId: string, report: unknown, registeredAt = new Date().toISOString()): StudyRegistration {
  const study = verifyStudy(studyInput);
  timestamp.parse(registeredAt);
  const slot = study.protocol.slots.find(s => s.id === slotId);
  if (!slot) throw new Error("Unknown study slot");
  if (Date.parse(registeredAt) < Date.parse(study.createdAt)) throw new Error("Registration predates study");
  if (Date.parse(registeredAt) > Date.now()) throw new Error("Registration cannot be in the future");
  if (Date.parse(registeredAt) > Date.parse(slot.registerBy)) throw new Error("Registration deadline passed");
  const snapshot = createEvaluationSnapshot(report, slot.definition, registeredAt);
  if (Date.parse(snapshot.reportGeneratedAt) < Date.parse(study.createdAt)) throw new Error("Report predates study creation");
  if (Date.parse(snapshot.reportGeneratedAt) > Date.parse(registeredAt)) throw new Error("Report generated after registration");
  if (snapshot.operatingForecasts.some(f => f.periodExclusionReason)) throw new Error("Forecast period is unverified or mismatched");
  const body = { registrationVersion: 1 as const, studyHash: study.studyHash, slotId, snapshot };
  return { ...body, registrationHash: digest(body) };
}

export function verifyStudyRegistration(study: EvaluationStudy, input: unknown): StudyRegistration {
  const value = z.object({ registrationVersion: z.literal(1), studyHash: hash, slotId: id, snapshot: z.unknown(), registrationHash: hash }).strict().parse(input);
  const snapshot = verifyEvaluationSnapshot(value.snapshot);
  const rebuilt = registerStudyReport(study, value.slotId, snapshot.report, snapshot.frozenAt);
  if (canonicalSnapshotJson(rebuilt) !== canonicalSnapshotJson(value)) throw new Error("Study registration integrity mismatch");
  return rebuilt;
}

type IncludedOperating = Extract<ReportEvaluation["operating"][number], { status: "included" }>;
interface ErrorRow extends IncludedOperating { slotId: string; issuerId: string; sector: string; horizonDays: number;
  registrationLeadDays: number; periodDays: number; forecastKind: "forecast" | "partial-year"; methodVersion: string; pipelineVersion: string;
  baselineName: string | null; baselineError: number | null }

// Scale before summing to keep finite, valid errors from overflowing statistics.
const mean = (xs: number[]): number | null => xs.length ? xs.reduce((sum, v) => sum + v / xs.length, 0) : null;
const rmse = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const scale = xs.reduce((m, n) => Math.max(m, Math.abs(n)), 0);
  return scale === 0 ? 0 : scale * Math.sqrt(mean(xs.map(v => (v / scale) ** 2))!);
};

function summarizeGroups(rows: ErrorRow[]) {
  const groups = new Map<string, ErrorRow[]>();
  for (const row of rows) {
    const key = canonicalSnapshotJson([row.sector, row.metric, row.scenario, row.unit, row.currency, row.basis,
      row.horizonDays, row.registrationLeadDays, row.periodDays, row.forecastKind, row.methodVersion, row.pipelineVersion, row.baselineName]);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, values]) => {
    const row = values[0];
    const percentages = values.flatMap(v => v.absolutePercentageError === null ? [] : [v.absolutePercentageError]);
    const paired = values.filter((v): v is ErrorRow & { baselineError: number } => v.baselineError !== null);
    const issuers = [...new Set(values.map(v => v.issuerId))];
    const modelMae = mean(paired.map(v => v.absoluteError));
    const baselineMae = mean(paired.map(v => Math.abs(v.baselineError)));
    return { sector: row.sector, metric: row.metric, scenario: row.scenario, unit: row.unit, currency: row.currency,
      basis: row.basis, horizonDays: row.horizonDays, registrationLeadDays: row.registrationLeadDays, periodDays: row.periodDays, forecastKind: row.forecastKind,
      methodVersion: row.methodVersion, pipelineVersion: row.pipelineVersion, n: values.length, issuerCount: issuers.length,
      mae: mean(values.map(v => v.absoluteError)), rmse: rmse(values.map(v => v.signedError)), bias: mean(values.map(v => v.signedError)),
      issuerBalancedMae: mean(issuers.map(issuer => mean(values.filter(v => v.issuerId === issuer).map(v => v.absoluteError))!)),
      percentageErrorN: percentages.length, meanAbsolutePercentageError: mean(percentages),
      baseline: { name: row.baselineName, n: paired.length, modelMae, baselineMae,
        improvementMae: modelMae === null || baselineMae === null ? null : baselineMae - modelMae },
    };
  });
}

export function evaluateStudy(studyInput: unknown, registrationInputs: unknown[], outcomesInput: unknown, asOf: string) {
  const study = verifyStudy(studyInput);
  z.iso.date().parse(asOf);
  const now = Date.now();
  const cutoff = Math.min(endOf(asOf), now);
  const evaluatedThrough = new Date(cutoff).toISOString();
  if (asOf > new Date(now).toISOString().slice(0, 10) || cutoff < Date.parse(study.createdAt)) throw new Error("Evaluation date outside available study history");
  const outcomes = StudyOutcomesSchema.parse(outcomesInput);
  const registrations = new Map<string, StudyRegistration>();
  const packets = new Map<string, z.infer<typeof EvaluationOutcomesSchema>>();
  for (const input of registrationInputs) {
    const r = verifyStudyRegistration(study, input);
    if (registrations.has(r.slotId)) throw new Error("Duplicate study registration");
    if (cutoff < Date.parse(r.snapshot.frozenAt)) throw new Error("Evaluation predates a registered report");
    registrations.set(r.slotId, r);
  }
  for (const packet of outcomes.slots) {
    if (!study.protocol.slots.some(s => s.id === packet.slotId)) throw new Error("Unknown/unplanned outcome slot");
    if (packets.has(packet.slotId)) throw new Error("Duplicate outcome packet");
    if (!registrations.has(packet.slotId)) throw new Error("Outcomes supplied for an unregistered slot");
    packets.set(packet.slotId, packet.outcomes);
  }
  const counts = { plannedReports: study.protocol.slots.length, registeredReports: registrations.size,
    missingRegistrations: 0, awaitingRegistrations: 0, plannedOperating: 0, operatingIncluded: 0, pendingOperating: 0,
    missingOperating: 0, excludedOperating: 0, unregisteredOperating: 0,
    plannedMarket: 0, marketIncluded: 0, marketExcluded: 0, pendingMarket: 0, missingMarket: 0, unregisteredMarket: 0 };
  const rows: ErrorRow[] = [];
  const slots = study.protocol.slots.map(slot => {
    counts.plannedOperating += slot.definition.operating.length;
    counts.plannedMarket += slot.definition.market.length;
    const r = registrations.get(slot.id);
    const base = { slotId: slot.id, issuer: slot.definition.issuer, sector: slot.sector, registerBy: slot.registerBy };
    if (!r) {
      const overdue = cutoff > Date.parse(slot.registerBy);
      if (overdue) counts.missingRegistrations++; else counts.awaitingRegistrations++;
      counts.unregisteredOperating += slot.definition.operating.length;
      counts.unregisteredMarket += slot.definition.market.length;
      return { ...base, status: overdue ? "missing-registration" as const : "awaiting-registration" as const, evaluation: null, registrationHash: null };
    }
    const evaluation = evaluateReportSnapshot(r.snapshot, packets.get(slot.id) ?? { schemaVersion: 1, outcomes: [] }, asOf);
    for (const result of evaluation.operating) {
      const selection = slot.definition.operating.find(s => s.id === result.id)!;
      if (result.status === "excluded") {
        if (result.reasons.every(reason => ["missing-outcome", "horizon-not-matured", "outcome-not-yet-available"].includes(reason)) && (selection.periodEnd > asOf || result.reasons.includes("outcome-not-yet-available"))) counts.pendingOperating++;
        else if (result.reasons.includes("missing-outcome")) counts.missingOperating++;
        else counts.excludedOperating++;
        continue;
      }
      counts.operatingIncluded++;
      const baseline = slot.baselines.find(b => b.selectionId === result.id);
      const error = baseline ? baseline.value - result.actualValue : null;
      rows.push({ ...result, slotId: slot.id, issuerId: `${slot.definition.issuer.scheme}:${slot.definition.issuer.id}`, sector: slot.sector,
        horizonDays: (Date.parse(result.periodEnd) - Date.parse(slot.definition.asOf)) / dayMs,
        registrationLeadDays: (Date.parse(result.periodEnd) - Date.parse(r.snapshot.frozenAt.slice(0, 10))) / dayMs,
        periodDays: (Date.parse(result.periodEnd) - Date.parse(result.periodStart)) / dayMs + 1,
        forecastKind: result.periodStart > r.snapshot.frozenAt.slice(0, 10) ? "forecast" : "partial-year",
        methodVersion: slot.definition.methodVersion, pipelineVersion: r.snapshot.pipelineVersion,
        baselineName: baseline?.name ?? null, baselineError: error !== null && Number.isFinite(error) ? error : null });
    }
    for (const result of evaluation.market) {
      if (result.status === "included") { counts.marketIncluded++; continue; }
      const selection = slot.definition.market.find(s => s.id === result.id)!;
      if (result.reasons.every(reason => ["missing-outcome", "horizon-not-matured", "outcome-not-yet-available"].includes(reason)) && (selection.endDate > asOf || result.reasons.includes("outcome-not-yet-available"))) counts.pendingMarket++;
      else if (result.reasons.includes("missing-outcome")) counts.missingMarket++;
      else counts.marketExcluded++;
    }
    return { ...base, status: "registered" as const, registrationHash: r.registrationHash, evaluation };
  });
  const registrationSetHash = digest([...registrations.values()].map(r => [r.slotId, r.registrationHash]).sort(([a], [b]) => a.localeCompare(b)));
  const outcomesHash = digest(outcomes);
  const evaluationHash = digest({ studyHash: study.studyHash, registrationSetHash, outcomesHash, evaluatedThrough });
  return { studyEvaluationVersion: 1 as const, studyHash: study.studyHash, registrationSetHash, outcomesHash, evaluationHash, evaluatedThrough, asOf,
    custodyStatus: "local-unwitnessed" as const, predictiveValidation: false as const,
    measurementStatus: "operator-declared-dimensions" as const, counts, slots, groups: summarizeGroups(rows), operatingRows: rows,
    limitations: [
      "Local receipts, exclusive creation and content hashes do not establish externally witnessed time or deletion-proof custody.",
      "The cohort, sector, issuer identity, accounting bases, baselines, source availability and actuals are operator supplied; their semantic truth is not independently verified.",
      "Current report forecasts do not carry complete strict V2 dimensions. This prospective workflow retains the existing diagnostic comparison boundary.",
      "Descriptive errors and paired baseline differences do not establish statistical significance, calibrated grades or general predictive validity; small samples and overlapping issuer windows remain dependent.",
      "Raw currency errors depend on company size; percentage errors exclude zero actuals and can be unstable near zero. Missing outcomes and registrations can bias the observed subset.",
      "Market returns are separate realized observations, not DCF forecast errors or investment recommendations. No automatic calibration or production weight changes occur.",
      ...(study.protocol.universe.includesDelisted ? ["Declared delisting coverage does not verify lifecycle completeness or supplied delisting returns."] : ["The declared universe does not include delisted companies; survivorship bias limits conclusions."]),
    ],
  };
}
