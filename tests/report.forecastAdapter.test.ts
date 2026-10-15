import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { adaptSelectedForecastV1 } from "@/report/forecastAdapter";
import { createEvaluationSnapshot, verifyEvaluationSnapshot } from "@/report/evaluation";
import { hashArtifactBytes, type RetainedArtifact } from "@/evaluation/targetDefinition";
import { canonicalSnapshotJson } from "@/pipeline/runInputSnapshot";

/** Entirely synthetic declared metadata; this is not a provider/security validation. */
function fixture() {
  const report = {
    meta: { symbol: "SYNTH", generatedAt: "2025-01-15T12:00:00.000Z", specVersion: "test", pipelineVersion: "synthetic-pipeline" },
    projections: { notApplicableReason: null, series: [{ metric: "epsDiluted", unit: "USD/share", base: [{
      period: "12M ending 2026-01-14", periodStart: "2025-01-15", periodEnd: "2026-01-14",
      value: { value: 1.2, unit: "USD/share", currency: "USD", asOf: "2025-01-14", source: "computed.projections.epsDiluted.base" },
    }] }] },
  };
  const document = { kind: "source" as const, content: "SYNTHETIC ONLY: class A ADS ratio 2; diluted EPS; no corporate-action adjustment." };
  const source = { ...document, hash: hashArtifactBytes(document.content) };
  const basis = {
    schemaVersion: 1, kind: "forecast-basis", issuerId: "synthetic:issuer", symbol: "SYNTH", metric: "epsDiluted",
    security: { securityId: "synthetic:ADS-A", ordinaryClassId: "synthetic:ordinary-A", quoteUnit: "ADS", ordinarySharesPerQuotedUnit: 2 },
    accountingBasis: "US-GAAP-diluted-EPS", currency: "USD", unit: "USD/share", shareBasis: "diluted-per-quoted-ADS-as-reported",
    corporateActionBasis: "unadjusted", effectiveFrom: "2025-01-01", effectiveTo: null,
    availableAt: "2025-01-14T18:00:00Z", sourceDocumentHash: source.hash,
  };
  const method = {
    schemaVersion: 1, kind: "projection-method", pipelineVersion: "synthetic-pipeline", methodVersion: "synthetic-method-v1",
    metric: basis.metric, accountingBasis: basis.accountingBasis, unit: basis.unit, currency: basis.currency,
    shareBasis: basis.shareBasis, corporateActionBasis: basis.corporateActionBasis,
    availableAt: "2025-01-14T18:00:00Z", horizonMonths: 12,
  };
  const artifact = (kind: RetainedArtifact["kind"], value: unknown): RetainedArtifact => {
    const content = JSON.stringify(value);
    return { kind, content, hash: hashArtifactBytes(content) };
  };
  const basisArtifact = artifact("input", basis);
  const methodArtifact = artifact("method", method);
  const metadata = {
    adapterVersion: "SELECTED_FORECAST_V1", reportGeneratedAt: report.meta.generatedAt,
    pipelineVersion: report.meta.pipelineVersion, methodVersion: method.methodVersion,
    reportPath: "/projections/series/0/base/0/value", metric: basis.metric, scenario: "base",
    periodLabel: "12M ending 2026-01-14", periodStart: "2025-01-15", periodEnd: "2026-01-14",
    value: 1.2, unit: basis.unit, currency: basis.currency, sourceAsOf: "2025-01-14", source: "computed.projections.epsDiluted.base",
    basisArtifactHash: basisArtifact.hash, methodArtifactHash: methodArtifact.hash,
  };
  const artifacts = [source, basisArtifact, methodArtifact];
  return { report, metadata, basis, method, artifacts, artifact };
}

function adapt(f = fixture(), target?: unknown) {
  return adaptSelectedForecastV1(f.report, f.metadata, f.artifacts, target);
}

function metricFixture(metric: string, unit: string, currency: string | null, accountingBasis: string) {
  const f = fixture();
  const patch = { metric, unit, currency, accountingBasis, shareBasis: "not_per_share" };
  Object.assign(f.basis, patch); Object.assign(f.method, patch); Object.assign(f.metadata, { metric, unit, currency });
  Object.assign(f.report.projections.series[0], { metric, unit });
  f.metadata.source = `computed.projections.${metric}.base`;
  Object.assign(f.report.projections.series[0].base[0].value, { unit, currency, source: f.metadata.source });
  for (const [index, kind, value] of [[1, "input", f.basis], [2, "method", f.method]] as const) {
    const artifact = f.artifact(kind, value); f.artifacts[index] = artifact;
    if (kind === "input") f.metadata.basisArtifactHash = artifact.hash;
    else f.metadata.methodArtifactHash = artifact.hash;
  }
  return f;
}

describe("versioned selected-forecast adapter boundary", () => {
  it("derives a candidate from selected forecast and structured upstream records without enabling admission", () => {
    const f = fixture();
    const before = JSON.stringify(f);
    const result = adapt(f);
    expect(result).toMatchObject({ adapterVersion: "SELECTED_FORECAST_V1", productionAdmission: false, evidenceStatus: "upstream-declared",
      selected: { reportPath: f.metadata.reportPath, value: 1.2, source: f.metadata.source, sourceAsOf: "2025-01-14" },
      targetCandidate: { schemaVersion: 2, issuerId: f.basis.issuerId, securityId: f.basis.security.securityId,
        metric: "epsDiluted", accountingBasis: f.basis.accountingBasis, currency: "USD", unit: "USD/share",
        shareBasis: f.basis.shareBasis, corporateActionBasis: "unadjusted", periodStart: "2025-01-15", periodEnd: "2026-01-14",
        forecastKind: "partial_year", createdAt: f.report.meta.generatedAt, horizonMonths: 12, methodArtifactHash: f.metadata.methodArtifactHash },
    });
    expect(result.limitations.join(" ")).toMatch(/semantic/i);
    expect(JSON.stringify(f)).toBe(before);
    expect(adapt(f, result.targetCandidate)).toEqual(result);
  });

  it.each([
    ["revenue", "USD", "USD", "US-GAAP-consolidated-as-reported"],
    ["operatingMargin", "%", null, "US-GAAP-operating-income/revenue"],
    ["fcf", "USD", "USD", "unlevered-FCFF"],
  ] as const)("accepts a compatible declared %s control while withholding production admission", (metric, unit, currency, accountingBasis) => {
    const f = metricFixture(metric, unit, currency, accountingBasis);
    expect(adapt(f)).toMatchObject({ productionAdmission: false, targetCandidate: { metric, unit, currency, accountingBasis } });
  });

  it("binds canonical assembled sources and derives a fully forward horizon from the selected window", () => {
    const f = fixture();
    Object.assign(f.metadata, { periodLabel: "12M ending 2026-01-15", periodStart: "2025-01-16", periodEnd: "2026-01-15",
      source: "payload.computed.projections.epsdiluted.base.12m-ending-2026-01-15" });
    Object.assign(f.report.projections.series[0].base[0], { period: f.metadata.periodLabel, periodStart: f.metadata.periodStart, periodEnd: f.metadata.periodEnd });
    f.report.projections.series[0].base[0].value.source = f.metadata.source;
    expect(adapt(f).targetCandidate.forecastKind).toBe("forecast");
  });

  it.each([
    ["issuerId", "unrelated:issuer"], ["securityId", "ordinary:other-class"], ["metric", "revenue"],
    ["accountingBasis", "adjusted-EPS"], ["currency", "EUR"], ["unit", "EUR/share"],
    ["shareBasis", "ordinary-shares"], ["corporateActionBasis", "future-split-adjusted"],
    ["periodStart", "2025-01-01"], ["periodEnd", "2025-12-31"],
    ["methodArtifactHash", "a".repeat(64)], ["forecastKind", "forecast"], ["horizonMonths", 24],
    ["createdAt", "2025-01-14"], ["concept", "InventedConcept"],
  ])("rejects a requested target's %s contradiction", (key, value) => {
    expect(() => adapt(fixture(), { ...adapt().targetCandidate, [key]: value })).toThrow(/target/i);
  });

  it.each([
    ["value", 9],
    ["source", "computed.projections.epsDiluted.bull"], ["sourceAsOf", "2025-01-13"],
    ["periodStart", "2025-01-01"], ["periodEnd", "2025-12-31"], ["periodLabel", "FY2025"],
    ["reportPath", "/projections/series/0/bull/0/value"], ["pipelineVersion", "other-pipeline"],
    ["reportGeneratedAt", "2025-01-15T13:00:00.000Z"],
  ])("rejects selected metadata's %s contradiction", (key, value) => {
    const f = fixture(); Object.assign(f.metadata, { [key]: value });
    expect(() => adapt(f)).toThrow();
  });

  it.each([
    ["symbol", "OTHER"],
    ["availableAt", "2025-01-15T12:00:01Z"], ["effectiveFrom", "2025-01-16"], ["effectiveTo", "2025-01-15"],
  ])("rejects structured basis %s even when its changed bytes are rehashed", (key, value) => {
    const f = fixture(); Object.assign(f.basis, { [key]: value });
    const changed = f.artifact("input", f.basis); f.artifacts[1] = changed; f.metadata.basisArtifactHash = changed.hash;
    expect(() => adapt(f)).toThrow();
  });

  it.each(["accountingBasis", "shareBasis", "corporateActionBasis", "pipelineVersion", "methodVersion"])("rejects rehashed method %s contradiction", (key) => {
    const f = fixture(); Object.assign(f.method, { [key]: "incompatible" });
    const changed = f.artifact("method", f.method); f.artifacts[2] = changed; f.metadata.methodArtifactHash = changed.hash;
    expect(() => adapt(f)).toThrow();
  });

  it.each([0, 1, 2])("rejects mutated retained artifact %i bytes without changing inputs", (index) => {
    const f = fixture(); f.artifacts[index].content += " ";
    const before = JSON.stringify(f); expect(() => adapt(f)).toThrow(/artifact/i); expect(JSON.stringify(f)).toBe(before);
  });

  it("rejects absent, duplicate, unstructured or future method evidence", () => {
    const missing = fixture(); missing.artifacts.pop(); expect(() => adapt(missing)).toThrow(/artifact/i);
    const duplicate = fixture(); duplicate.artifacts.push(duplicate.artifacts[1]); expect(() => adapt(duplicate)).toThrow(/artifact/i);
    const unstructured = fixture(); const replacement = unstructured.artifact("input", adapt().targetCandidate);
    unstructured.artifacts[1] = replacement; unstructured.metadata.basisArtifactHash = replacement.hash;
    expect(() => adapt(unstructured)).toThrow();
    const future = fixture(); future.method.availableAt = "2025-01-15T12:00:01Z";
    const changed = future.artifact("method", future.method); future.artifacts[2] = changed; future.metadata.methodArtifactHash = changed.hash;
    expect(() => adapt(future)).toThrow(/available/i);
  });

  it("rejects unknown version, missing basis, extra target assertions and ambiguous projection selection", () => {
    for (const patch of [{ adapterVersion: "SELECTED_FORECAST_V2" }, { basisArtifactHash: undefined }, { target: adapt().targetCandidate }]) {
      const f = fixture(); Object.assign(f.metadata, patch); expect(() => adapt(f)).toThrow();
    }
    const duplicateMetric = fixture(); duplicateMetric.report.projections.series.push(structuredClone(duplicateMetric.report.projections.series[0]));
    expect(() => adapt(duplicateMetric)).toThrow(/ambiguous/i);
    const duplicatePeriod = fixture(); duplicatePeriod.report.projections.series[0].base.push(structuredClone(duplicatePeriod.report.projections.series[0].base[0]));
    expect(() => adapt(duplicatePeriod)).toThrow(/ambiguous/i);
  });

  it("requires an explicit compatible ADS ratio and class instead of guessing", () => {
    for (const security of [undefined, { ...fixture().basis.security, ordinarySharesPerQuotedUnit: 0 },
      { ...fixture().basis.security, quoteUnit: "ordinary" }, { ...fixture().basis.security, ordinaryClassId: "" }]) {
      const f = fixture(); Object.assign(f.basis, { security });
      const changed = f.artifact("input", f.basis); f.artifacts[1] = changed; f.metadata.basisArtifactHash = changed.hash;
      expect(() => adapt(f)).toThrow();
    }
  });

  it("rejects jointly rehashed basic-EPS or nonshare declarations for a diluted-EPS forecast", () => {
    for (const patch of [
      { accountingBasis: "US-GAAP-basic-EPS" },
      { shareBasis: "not_per_share" },
      { accountingBasis: "US-GAAP-basic-EPS", shareBasis: "not_per_share" },
    ]) {
      const f = fixture();
      Object.assign(f.basis, patch); Object.assign(f.method, patch);
      for (const [index, kind, value] of [[1, "input", f.basis], [2, "method", f.method]] as const) {
        const artifact = f.artifact(kind, value); f.artifacts[index] = artifact;
        if (kind === "input") f.metadata.basisArtifactHash = artifact.hash;
        else f.metadata.methodArtifactHash = artifact.hash;
      }
      expect(() => adapt(f)).toThrow();
    }
  });

  it("requires EPS share meaning to match the explicit quoted security unit", () => {
    const f = fixture();
    Object.assign(f.basis.security, { quoteUnit: "ordinary", ordinarySharesPerQuotedUnit: 1 });
    let changed = f.artifact("input", f.basis); f.artifacts[1] = changed; f.metadata.basisArtifactHash = changed.hash;
    expect(() => adapt(f)).toThrow(/EPS share\/quote basis/i);
    f.basis.shareBasis = f.method.shareBasis = "diluted-per-quoted-ordinary-as-reported";
    for (const [index, kind, value] of [[1, "input", f.basis], [2, "method", f.method]] as const) {
      changed = f.artifact(kind, value); f.artifacts[index] = changed;
      if (kind === "input") f.metadata.basisArtifactHash = changed.hash;
      else f.metadata.methodArtifactHash = changed.hash;
    }
    expect(adapt(f)).toMatchObject({ productionAdmission: false, targetCandidate: { shareBasis: "diluted-per-quoted-ordinary-as-reported" } });
    const revenue = metricFixture("revenue", "USD", "USD", "US-GAAP-consolidated-as-reported");
    revenue.basis.shareBasis = revenue.method.shareBasis = "diluted-per-quoted-ADS-as-reported";
    for (const [index, kind, value] of [[1, "input", revenue.basis], [2, "method", revenue.method]] as const) {
      changed = revenue.artifact(kind, value); revenue.artifacts[index] = changed;
      if (kind === "input") revenue.metadata.basisArtifactHash = changed.hash;
      else revenue.metadata.methodArtifactHash = changed.hash;
    }
    expect(() => adapt(revenue)).toThrow(/not_per_share/i);
  });

  it("rejects competing retained identity or method records instead of choosing a convenient hash", () => {
    const collision = fixture();
    const otherBasis = { ...collision.basis, issuerId: "other-issuer", security: { ...collision.basis.security, securityId: "other-class", ordinarySharesPerQuotedUnit: 3 } };
    collision.artifacts.push(collision.artifact("input", otherBasis));
    expect(() => adapt(collision)).toThrow(/ambiguous/i);
    const methodCollision = fixture();
    methodCollision.artifacts.push(methodCollision.artifact("method", { ...methodCollision.method, accountingBasis: "adjusted-EPS" }));
    expect(() => adapt(methodCollision)).toThrow(/ambiguous/i);
  });

  it("rejects incompatible units/FCF, unsupported windows, suppressed projections and future source dates even when metadata agrees", () => {
    const wrongUnit = metricFixture("revenue", "USD/share", "USD", "US-GAAP-consolidated-as-reported");
    expect(() => adapt(wrongUnit)).toThrow(/currency\/unit/i);
    const wrongMargin = metricFixture("operatingMargin", "%", "USD", "US-GAAP-operating-income/revenue");
    expect(() => adapt(wrongMargin)).toThrow(/margin/i);
    const wrongFcf = metricFixture("fcf", "USD", "USD", "CFO-minus-capex");
    expect(() => adapt(wrongFcf)).toThrow(/FCFF/i);
    const quarter = fixture(); quarter.metadata.periodStart = "2025-10-15";
    quarter.report.projections.series[0].base[0].periodStart = quarter.metadata.periodStart;
    expect(() => adapt(quarter)).toThrow(/annual/i);
    const futureSource = fixture(); futureSource.metadata.sourceAsOf = "2025-01-16";
    futureSource.report.projections.series[0].base[0].value.asOf = futureSource.metadata.sourceAsOf;
    expect(() => adapt(futureSource)).toThrow(/as-of/i);
    const suppressed = fixture(); Object.assign(suppressed.report.projections, { notApplicableReason: "synthetic specialized route" });
    expect(() => adapt(suppressed)).toThrow(/suppressed/i);
  });

  it("does not treat a typed candidate or injected report fields as production registration authority", () => {
    const f = fixture(); const candidate = adapt(f).targetCandidate;
    Object.assign(f.report.projections.series[0].base[0], { forecastMetadata: f.metadata, ...f.basis, target: candidate });
    const selected = { id: candidate.targetId, metric: "epsDiluted", scenario: "base", periodLabel: f.metadata.periodLabel,
      periodStart: f.metadata.periodStart, periodEnd: f.metadata.periodEnd, currency: "USD", unit: "USD/share",
      basis: `diluted-EPS;share-basis=${f.basis.shareBasis}` };
    const definition = { schemaVersion: 1, issuer: { scheme: "cik", id: f.basis.issuerId, symbol: "SYNTH" },
      identitySource: "synthetic declaration", asOf: "2025-01-15", methodVersion: f.metadata.methodVersion, operating: [selected], market: [] };
    const snapshot = createEvaluationSnapshot(f.report, definition, f.report.meta.generatedAt);
    const changedPayload = { ...snapshot, definition: { ...snapshot.definition, operating: [{ ...selected, target: candidate }] },
      operatingForecasts: [{ ...snapshot.operatingForecasts[0], target: candidate }] };
    const { snapshotHash, ...payload } = changedPayload;
    const forged = { ...payload, snapshotHash: createHash("sha256").update(canonicalSnapshotJson(payload)).digest("hex") };
    expect(forged.snapshotHash).not.toBe(snapshotHash);
    expect(() => createEvaluationSnapshot(f.report, changedPayload.definition, f.report.meta.generatedAt)).toThrow(/strict V2.*unavailable/i);
    expect(() => verifyEvaluationSnapshot(forged)).toThrow(/strict V2.*unavailable/i);
  });
});
