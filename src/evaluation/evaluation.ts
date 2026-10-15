import { evaluationDatasetSchema, evaluationSampleSchema, type EvaluationDataset, type EvaluationSample } from "./evaluationContract";
import { artifactIsBound, matchObservation } from "./targetDefinition";
import { diagnosticBreadth } from "./pairedDiagnostics";

const DAY = 86_400_000;
const ms = (value: string) => Date.parse(value);
const mean = (xs: number[]): number | null => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const tidy = (value: number) => Math.abs(value) < 1e-12 ? 0 : Number(value.toPrecision(14));
function samePeriod(a: { start: string; end: string }, b: { start: string; end: string }): boolean { return a.start.slice(0, 10) === b.start.slice(0, 10) && a.end.slice(0, 10) === b.end.slice(0, 10); }

/** Forecast inputs are point-in-time; future labels are checked separately at evaluation/fold cutoff. */
function issues(s: EvaluationSample, d: EvaluationDataset): string[] {
  const reasons: string[] = [];
  const at = ms(s.analysisAt), evaluated = ms(d.evaluatedAt) + (d.evaluatedAt.length === 10 ? DAY - 1 : 0);
  if (at > evaluated) reasons.push("analysis occurs after evaluation cutoff");
  if (ms(d.universe.formedAt) > at || ms(s.membership.includedAt) > at) reasons.push("universe membership unavailable at analysis date");
  if (s.membership.delistedAt && ms(s.membership.delistedAt) < at) reasons.push("issuer already delisted before forecast membership date");
  if (ms(s.predictionAvailableAt) > at) reasons.push("forecast was produced after analysis date");
  if (s.inputsAvailableAt.some((date) => ms(date) > at)) reasons.push("future input unavailable at analysis date");
  if (s.basis.adjustmentsKnownAt.some((date) => ms(date) > at)) reasons.push("future split/currency adjustment leaks into analysis basis");
  if (ms(s.period.start) >= ms(s.period.end)) reasons.push("invalid forecast period");
  if (s.prediction.baseline && ms(s.prediction.baseline.availableAt) > at) reasons.push("baseline unavailable at analysis date");
  if (Object.values(s.ablations).some((a) => ms(a.availableAt) > at)) reasons.push("ablation forecast unavailable at analysis date");
  if (s.normalization && ms(s.normalization.availableAt) > at) reasons.push("normalization_unavailable_at_analysis");
  if (s.prediction.interval && s.prediction.interval.low > s.prediction.interval.high) reasons.push("inverted prediction interval");
  if (s.writing && ms(s.writing.adjudicatedAt) > evaluated) reasons.push("factual adjudication unavailable at evaluation cutoff");
  if (s.event) {
    if (s.event.outcome !== null && (!s.event.resolvedAt || ms(s.event.resolvedAt) <= at || ms(s.event.resolvedAt) > evaluated)) reasons.push("event label lacks a prospective observed resolution at evaluation cutoff");
    if (s.event.outcome === null && s.event.resolvedAt !== null) reasons.push("event has a resolution timestamp but no observed binary label");
  }
  if (d.version === "research-evaluation-v2" && !s.target) reasons.push("target_dimensions_required");
  if (s.target) {
    const target = s.target;
    if (target.issuerId !== s.issuerId || target.metric !== s.metric || target.periodStart.slice(0, 10) !== s.period.start.slice(0, 10) || target.periodEnd.slice(0, 10) !== s.period.end.slice(0, 10) || ms(target.createdAt) !== at || target.currency !== s.basis.currency || target.unit !== s.basis.unit || target.shareBasis !== s.basis.shareBasis) reasons.push("target_sample_mismatch");
    if (s.basis.accountingBasis && target.accountingBasis !== s.basis.accountingBasis) reasons.push("accounting_basis_mismatch");
    if (s.basis.corporateActionBasis && target.corporateActionBasis !== s.basis.corporateActionBasis) reasons.push("corporate_action_basis_mismatch");
    if (!artifactIsBound(target.methodArtifactHash, "method", d.retainedArtifacts)) reasons.push("method_unbound");
    if (!artifactIsBound(s.snapshotHash, "input", d.retainedArtifacts)) reasons.push("input_unbound");
  }
  const o = s.outcome;
  if (!o) return reasons;
  if (s.target) {
    if (!o.observation) reasons.push("observation_dimensions_required");
    else {
      reasons.push(...matchObservation(s.target, o.observation, { evaluatedAt: d.evaluatedAt, retainedArtifacts: d.retainedArtifacts }).reasons);
      const actual = o.source === "sec_filing" ? o.value : tidy(o.security.totalReturn - o.benchmark.totalReturn);
      if (Math.abs(o.observation.value - actual) > 1e-12 * Math.max(1, Math.abs(actual))) reasons.push("observation_value_mismatch");
      if (ms(o.observation.availableAt) !== ms(o.publishedAt)) reasons.push("observation_availability_mismatch");
      if (o.source === "sec_filing" && o.observation.accession !== o.accession) reasons.push("accession_mismatch");
    }
  }
  if (ms(o.publishedAt) <= at) reasons.push("outcome already published at analysis; not a prospective forecast");
  if (ms(o.observedAt) < ms(o.publishedAt) || ms(o.observedAt) > evaluated || ms(o.publishedAt) > evaluated) reasons.push("outcome observation unavailable or predates publication");
  if (s.kind === "filing" && o.source === "sec_filing") {
    if (o.issuerId && o.issuerId !== s.issuerId) reasons.push("issuer_mismatch");
    if (o.metric && o.metric !== s.metric) reasons.push("metric_mismatch");
    if (o.version !== "initial") reasons.push("future restatement/amended outcome not admitted: first reported SEC outcome required");
    if (!samePeriod(s.period, o.period)) reasons.push("fiscal-period conflict between forecast and SEC outcome");
    if (ms(o.period.end) > ms(o.publishedAt)) reasons.push("SEC outcome filed before fiscal period ended");
    if (s.basis.currency !== o.basis.currency || s.basis.unit !== o.basis.unit || s.basis.shareBasis !== o.basis.shareBasis) reasons.push("currency/unit/share-basis conflict");
    if (s.basis.accountingBasis !== o.basis.accountingBasis) reasons.push("accounting_basis_mismatch");
    if (s.basis.corporateActionBasis !== o.basis.corporateActionBasis) reasons.push("corporate_action_basis_mismatch");
    if (o.basis.adjustmentsKnownAt.some((date) => ms(date) > at)) reasons.push("future outcome basis adjustment incompatible with frozen forecast basis");
  } else if (s.kind === "total_return" && o.source === "frozen_total_returns") {
    if (o.security.id && o.security.id === o.benchmark.id) reasons.push("same_security_benchmark");
    if (s.target && (!s.target.benchmarkId || o.security.id !== s.target.securityId || o.benchmark.id !== s.target.benchmarkId)) reasons.push("security_benchmark_mismatch");
    if (s.basis.unit !== "fraction_total_return") reasons.push("stock forecasts require fractional excess total return units");
    if (s.period.start.slice(0, 10) !== s.analysisAt.slice(0, 10)) reasons.push("stock horizon must start at forecast session");
    if (!samePeriod(s.period, o.security.period) || !samePeriod(s.period, o.benchmark.period)) reasons.push("security/benchmark horizon mismatch");
    if (ms(s.period.end) > ms(o.publishedAt)) reasons.push("total return label published before horizon ended");
    if (o.security.currency !== s.basis.currency || o.benchmark.currency !== s.basis.currency) reasons.push("security/benchmark return currency mismatch");
    if (!o.security.includesDistributions || !o.benchmark.includesDistributions) reasons.push("price-only outcome is not total return");
    if (s.membership.delistedAt && ms(s.membership.delistedAt) <= ms(s.period.end) && !o.security.includesDelistingReturn) reasons.push("delisting return omitted from security outcome");
  }
  return reasons;
}
interface Observed { sample: EvaluationSample; actual: number; error: number; baseline: { name: string; value: number } | null }
function observed(s: EvaluationSample): Observed | null {
  if (!s.outcome) return null;
  const actual = s.outcome.source === "sec_filing" ? s.outcome.value : tidy(s.outcome.security.totalReturn - s.outcome.benchmark.totalReturn);
  return { sample: s, actual, error: tidy(s.prediction.value - actual), baseline: s.prediction.baseline ?? (s.kind === "total_return" ? { name: "zero_excess_return", value: 0 } : null) };
}
function errorStats(errors: number[]) {
  return { n: errors.length, mae: mean(errors.map(Math.abs)), rmse: errors.length ? Math.sqrt(mean(errors.map((e) => e * e))!) : null, bias: mean(errors) };
}
/** No default bootstrap can establish skill without independent dates and a locked design. */
function uncertainty(rows: Observed[]) {
  return diagnosticBreadth(rows.map(r => ({ issuerId: r.sample.issuerId, analysisAt: r.sample.analysisAt, periodEnd: r.sample.period.end })));
}
function groupKey(row: Observed): string {
  const s = row.sample, days = (ms(s.period.end) - ms(s.period.start)) / DAY;
  const window = s.kind === "filing" && days >= 350 && days <= 380 ? "annual" : s.kind === "filing" && days >= 70 && days <= 105 ? "quarter" : `${days}days`;
  const leadDays = (ms(s.period.end) - ms(s.analysisAt.slice(0, 10))) / DAY;
  const target = s.target;
  return JSON.stringify([s.kind, s.metric, s.basis.currency, s.basis.unit, s.basis.shareBasis, window, s.period.start.slice(0, 10), s.period.end.slice(0, 10), target?.concept ?? "legacy_concept_unverified", row.baseline?.name ?? "no_baseline", leadDays,
    target?.forecastKind ?? (ms(s.period.start) < ms(s.analysisAt) ? "legacy_nowcast_or_partial_year" : "legacy_forecast"), target?.horizonMonths ?? "legacy_horizon_unverified",
    target?.accountingBasis ?? s.basis.accountingBasis ?? "legacy_accounting_unverified", target?.corporateActionBasis ?? s.basis.corporateActionBasis ?? "legacy_action_unverified",
    target?.methodArtifactHash ?? s.methodVersion ?? "legacy_method_unverified", target?.securityId ?? "legacy_security_unverified", target?.benchmarkId ?? "no_verified_benchmark"]);
}
function groupedMetrics(rows: Observed[]) {
  const groups = new Map<string, Observed[]>();
  for (const r of rows) { const key = groupKey(r); groups.set(key, [...(groups.get(key) ?? []), r]); }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([key, rs]) => {
    const paired = rs.filter((r) => r.baseline);
    const levels = [...new Set(rs.flatMap((r) => r.sample.prediction.interval ? [r.sample.prediction.interval.nominalCoverage] : []))].sort();
    const ablations = Object.fromEntries([...new Set(rs.flatMap((r) => Object.keys(r.sample.ablations)))].sort().map((name) => {
      const selected = rs.filter((r) => r.sample.ablations[name]);
      const errors = selected.map((r) => r.sample.ablations[name]!.value - r.actual);
      return [name, { ...errorStats(errors), pairedMaeImprovement: mean(selected.map((r, i) => Math.abs(r.error) - Math.abs(errors[i]!))) }];
    }));
    const issuers = [...new Set(rs.map(r => r.sample.issuerId))];
    const normalized = rs.filter(r => r.sample.normalization), normalizedPaired = normalized.filter(r => r.baseline);
    return { key, kind: rs[0]!.sample.kind, metric: rs[0]!.sample.metric, currency: rs[0]!.sample.basis.currency, unit: rs[0]!.sample.basis.unit, n: rs.length, model: errorStats(rs.map((r) => r.error)), baseline: paired.length ? { name: paired[0]!.baseline!.name, ...errorStats(paired.map((r) => tidy(r.baseline!.value - r.actual))), pairedMaeImprovement: mean(paired.map((r) => Math.abs(r.baseline!.value - r.actual) - Math.abs(r.error))) } : null,
      equalIssuer: { issuerN: issuers.length, mae: mean(issuers.map(id => mean(rs.filter(r => r.sample.issuerId === id).map(r => Math.abs(r.error)))!)), bias: mean(issuers.map(id => mean(rs.filter(r => r.sample.issuerId === id).map(r => r.error))!)) },
      normalized: { n: normalized.length, missingScaleN: rs.length - normalized.length, model: errorStats(normalized.map(r => r.error / r.sample.normalization!.value)), pairedN: normalizedPaired.length, pairedMaeImprovement: mean(normalizedPaired.map(r => (Math.abs(r.baseline!.value - r.actual) - Math.abs(r.error)) / r.sample.normalization!.value)) },
      intervals: levels.map((level) => { const selected = rs.filter((r) => r.sample.prediction.interval?.nominalCoverage === level); return { n: selected.length, nominalCoverage: level, coverage: mean(selected.map((r) => +(r.actual >= r.sample.prediction.interval!.low && r.actual <= r.sample.prediction.interval!.high))), meanWidth: mean(selected.map((r) => r.sample.prediction.interval!.high - r.sample.prediction.interval!.low)) }; }),
      ablations, missingness: { complete: errorStats(rs.filter((r) => r.sample.missingFields.length === 0).map((r) => r.error)), missing: errorStats(rs.filter((r) => r.sample.missingFields.length > 0).map((r) => r.error)), byField: Object.fromEntries([...new Set(rs.flatMap((r) => r.sample.missingFields))].sort().map((field) => [field, errorStats(rs.filter((r) => r.sample.missingFields.includes(field)).map((r) => r.error))])) }, uncertainty: uncertainty(rs) };
  });
}
function events(samples: EvaluationSample[]) {
  const groups = new Map<string, EvaluationSample[]>();
  for (const s of samples) {
    if (!s.event || s.event.outcome === null) continue;
    const dimensions = groupKey({ sample: s, actual: 0, error: 0, baseline: s.prediction.baseline ?? (s.kind === "total_return" ? { name: "zero_excess_return", value: 0 } : null) });
    const key = JSON.stringify([s.event.definition, dimensions]);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([key, samples]) => {
    const rows = samples.map(s => s.event!);
    return { key, definition: rows[0]!.definition, labelEvidence: "operator-supplied-unadjudicated" as const, readiness: "diagnostic" as const, n: rows.length, brier: tidy(mean(rows.map((r) => (r.probability - r.outcome!) ** 2))!), reliability: Array.from({ length: 5 }, (_, index) => { const bin = rows.filter((r) => Math.min(4, Math.floor(r.probability * 5)) === index); return { low: index / 5, high: (index + 1) / 5, n: bin.length, meanProbability: mean(bin.map((r) => r.probability)), observedRate: mean(bin.map((r) => r.outcome!)) }; }) };
  });
}
function stability(samples: EvaluationSample[]) {
  const changes: number[] = [];
  let incomparableVersionPairs = 0;
  for (const issuer of new Set(samples.map((s) => s.issuerId))) {
    const rows = samples.filter((s) => s.issuerId === issuer && s.grade).sort((a, b) => ms(a.analysisAt) - ms(b.analysisAt));
    for (let i = 1; i < rows.length; i++) { const a = rows[i - 1]!, b = rows[i]!; if (a.analysisAt === b.analysisAt) continue; if (a.grade!.version !== b.grade!.version) incomparableVersionPairs++; else changes.push(Math.abs(a.grade!.score - b.grade!.score)); }
  }
  return { pairs: changes.length, meanAbsoluteScoreChange: mean(changes), incomparableVersionPairs };
}
function rolling(samples: EvaluationSample[], d: EvaluationDataset) {
  const folds = [];
  const end = Math.min(ms(d.evaluatedAt), Math.max(...samples.map((s) => ms(s.analysisAt))));
  for (let start = ms(d.rolling.firstTestAt); start <= end; start += d.rolling.testWindowDays * DAY) {
    if (folds.length >= 1000) throw new Error("Rolling evaluation exceeds 1000 fold budget");
    const finish = start + d.rolling.testWindowDays * DAY;
    const older = samples.filter((s) => ms(s.analysisAt) < start);
    const train = older.filter((s) => s.outcome && ms(s.outcome.observedAt) < start && ms(s.outcome.publishedAt) < start);
    const test = samples.filter((s) => ms(s.analysisAt) >= start && ms(s.analysisAt) < finish);
    const testRows = test.flatMap((s) => observed(s) ?? []);
    const eligible = train.length >= d.rolling.minTrainSamples && testRows.length >= d.rolling.minTestSamples;
    folds.push({ start: new Date(start).toISOString(), endExclusive: new Date(finish).toISOString(), trainN: train.length, testN: testRows.length, pendingTestN: test.length - testRows.length, labelsUnavailableAtCutoff: older.length - train.length, trainIds: train.map((s) => s.id), testIds: test.map((s) => s.id), status: eligible ? "evaluated" as const : "insufficient_samples" as const, groups: eligible ? groupedMetrics(testRows) : [], events: eligible ? events(test) : [], reason: eligible ? null : "Insufficient train labels known at cutoff or observed test outcomes; no performance conclusion" });
  }
  return folds;
}

/** Offline only: no provider, DB, LLM, network, or scoring-weight side effects. */
export function evaluateResearch(input: unknown) {
  const d = evaluationDatasetSchema.parse(input);
  if (d.universe.selection !== "point_in_time") throw new Error("Survivorship-filtered current-constituents-only cohorts are inadmissible");
  if (!d.universe.includesDelisted) throw new Error("Universe must include delisted issuers and lifecycle evidence");
  const accepted: EvaluationSample[] = [], rejected: { id: string; reasons: string[] }[] = [], ids = new Set<string>();
  for (const [index, raw] of d.samples.entries()) {
    const parsed = evaluationSampleSchema.safeParse(raw);
    if (!parsed.success) { rejected.push({ id: typeof raw === "object" && raw !== null && "id" in raw ? String(raw.id) : `index:${index}`, reasons: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }); continue; }
    const reasons = issues(parsed.data, d);
    if (ids.has(parsed.data.id)) reasons.push("duplicate sample identifier");
    ids.add(parsed.data.id);
    if (reasons.length) rejected.push({ id: parsed.data.id, reasons }); else accepted.push(parsed.data);
  }
  accepted.sort((a, b) => ms(a.analysisAt) - ms(b.analysisAt) || a.id.localeCompare(b.id));
  const rows = accepted.flatMap((s) => observed(s) ?? []), claims = accepted.flatMap((s) => s.writing?.claims ?? []);
  const checked = claims.filter((c) => c !== "unchecked").length, errors = claims.filter((c) => c === "contradicted").length;
  const changes = accepted.flatMap((s) => s.orderProbe?.permutations.map((v) => Math.abs(v - s.orderProbe!.original)) ?? []);
  const pendingSamples = accepted.filter((s) => !s.outcome).map((s) => ({ id: s.id, period: s.period, metric: s.metric, snapshotHash: s.snapshotHash, reason: "No observed outcome supplied" }));
  const incomparable = accepted.flatMap(s => !s.target ? [{ id: s.id, reasons: ["legacy_dimensions_unverified", "source_and_input_custody_unverified"] }] : []);
  return { version: d.version, evidenceKind: d.evidenceKind, evaluatedAt: d.evaluatedAt, limitations: d.limitations, readiness: rows.length ? "diagnostic" as const : "insufficient" as const, predictiveValidation: false as const, incomparable, pendingSamples, productionThresholds: "unchanged_uncalibrated", interpretation: d.evidenceKind === "synthetic_fixture" ? "Synthetic fixtures validate evaluation machinery only; no historical or predictive calibration claim" : "Frozen-sample diagnostic only; no production thresholds or weights changed", accepted: accepted.length, pending: accepted.length - rows.length, rejected, snapshotHashes: [...new Set(accepted.map((s) => s.snapshotHash))].sort(), groups: groupedMetrics(rows), folds: rolling(accepted, d), events: events(accepted), gradeStability: stability(accepted), writing: { reports: accepted.filter((s) => s.writing).length, materialClaims: claims.length, checkedClaims: checked, contradictedClaims: errors, uncheckedClaims: claims.length - checked, coverage: claims.length ? checked / claims.length : null, factualErrorRateAmongChecked: checked ? errors / checked : null }, orderSensitivity: { reports: accepted.filter((s) => s.orderProbe).length, n: changes.length, meanAbsoluteChange: mean(changes), maxAbsoluteChange: changes.length ? Math.max(...changes) : null } };
}
