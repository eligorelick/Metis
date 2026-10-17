import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runStageB, type ComputedMetrics } from "@/pipeline/compute";
import type { DataBundle } from "@/pipeline/types";
import { enrichDataOnlyReport } from "@/pipeline/stageC/dataOnlyReport";
import { assembleReport, runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import type { ContextPayload, StatementCell } from "@/pipeline/stageC/payload";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";
import { ReportSchema, type Report } from "@/report/schema";
import { SourceFactSummarySchema } from "@/report/sourceFactSchema";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import {
  buildSourceFactSummary,
  validateSourceFactTemplate,
} from "@/report/sourceFacts";

const periodContext = { kind: "duration", start: "2026-04-01", end: "2026-06-30", basis: "fiscal-quarter", fiscalLabel: "Q2 FY2026" } as const;
const operands = [
  ["income-before-tax", "income before tax", 80.857e9],
  ["income-tax-expense", "income tax expense", 18.199e9],
  ["net-income", "net income", 62.647e9],
  ["equity-method-income-loss-as-filed", "equity-method income (loss), as filed", -0.011e9],
] as const;

function payload(values: Partial<Record<(typeof operands)[number][0], number | null>> = {}): ContextPayload {
  const section = { title: "empty", figures: [], notes: [] };
  const records: NumericProvenanceRecord[] = operands.flatMap(([metric, label, original]) => {
    const value = metric in values ? values[metric] : original;
    return value == null ? [] : [{ id: `payload.statements.income-statement-quarterly.2026-06-30.${metric}`,
      kind: "provider", label, value, unit: "currency", currency: "USD", period: "2026-06-30", periodContext,
      fiscalPeriod: "Q2 FY2026", asOf: "2026-07-30", origin: "fmp:income-statement(quarter)", formulaVersion: null, displayPrecision: 4 }];
  });
  return {
    payloadVersion: "1.21.0", symbol: "TEST", companyName: "Test", route: { base: "industrial", overlays: [], sector: null, industry: null },
    provenanceRegistry: records, quote: section, computed: [], estimates: section, peers: section, insiders: section,
    institutional: section, leadership: section, shortInterest: section, segments: section, macro: section, news: section,
    transcript: null, filings: [], validationFlags: [], missingData: [], asOfMap: {},
    statements: [{ title: "Income statement - quarterly", periods: ["2026-06-30"], notes: [], lineItems: operands.map(([metric, label, original]) => ({
      lineItem: label, unit: "currency", source: "fmp:income-statement(quarter)", byPeriod: [{
        period: "2026-06-30", periodContext, fiscalPeriod: "Q2 FY2026", value: metric in values ? values[metric]! : original,
        currency: "USD", asOf: "2026-07-30", provenanceId: records.find(record => record.label === label)?.id,
      }],
    })) }],
  };
}

function cell(input: ContextPayload, metric: string): StatementCell {
  return input.statements[0]!.lineItems.find(line => line.byPeriod[0]?.provenanceId?.endsWith(`.${metric}`))!.byPeriod[0]!;
}
function record(input: ContextPayload, metric: string): NumericProvenanceRecord {
  return input.provenanceRegistry!.find(entry => entry.id.endsWith(`.${metric}`))!;
}

describe("evidence-bound source facts and reported earnings", () => {
  function ownershipPayload(nci: number | null): ContextPayload {
    const input = payload({ "income-before-tax": 1027, "income-tax-expense": 152, "net-income": 878, "equity-method-income-loss-as-filed": 3 });
    for (const [metric, label, value] of [["consolidated-net-income", "consolidated net income", 875],
      ["noncontrolling-interest-net-income", "noncontrolling interest net income", nci]] as const) {
      if (value === null) continue;
      const id = `payload.statements.income-statement-quarterly.2026-06-30.${metric}`;
      input.provenanceRegistry!.push({ ...input.provenanceRegistry![0]!, id, label, value });
      input.statements[0]!.lineItems.push({ lineItem: label, unit: "currency", source: "fmp:income-statement(quarter)",
        byPeriod: [{ ...input.statements[0]!.lineItems[0]!.byPeriod[0]!, value, provenanceId: id }] });
    }
    return input;
  }
  it("reconciles consolidated profit to parent profit by subtracting signed NCI earnings", () => {
    const summary = buildSourceFactSummary(ownershipPayload(-3))!;
    expect(summary.earningsReconciliation).toMatchObject({ status: "available", method: "pretax-minus-tax-minus-nci", pretaxMinusTax: 875,
      reconciledNetIncome: 878, reportedNetIncome: 878, residual: 0 });
    expect(summary.earningsReconciliation.operandIds.some(id => id.endsWith("equity-method-income-loss-as-filed"))).toBe(false);
    expect(SourceFactSummarySchema.safeParse(summary).success).toBe(true);
  });
  it("does not use an unrelated equity-method amount to plug a known ownership-scope gap", () => {
    const summary = buildSourceFactSummary(ownershipPayload(null))!;
    expect(summary.earningsReconciliation.status).toBe("unavailable");
    expect(summary.earningsReconciliation.reason).toMatch(/noncontrolling|ownership/i);
  });
  it("binds an EDGAR quarter to its actual provider origin", () => {
    const input = payload();
    for (const line of input.statements[0]!.lineItems) line.source = "edgar:income-statement(quarter)";
    for (const row of input.provenanceRegistry!) row.origin = "edgar:income-statement(quarter)";

    const summary = buildSourceFactSummary(input)!;

    expect(summary.status).toBe("available");
    expect(summary.rows).toHaveLength(4);
    expect(summary.rows.every(row => row.origin === "edgar:income-statement(quarter)")).toBe(true);
    expect(summary.rows[0]!.canonicalText).toContain("provider origin: edgar:income-statement(quarter)");
    expect(summary.rows[0]!.canonicalText).not.toContain("fmp:");
    expect(SourceFactSummarySchema.safeParse(summary).success).toBe(true);
  });

  it("binds mixed statement fields to each cell's exact provider origin", () => {
    const input = payload();
    const tax = cell(input, "income-tax-expense") as StatementCell & { source: string };
    tax.source = "edgar:income-statement(quarter)";
    record(input, "income-tax-expense").origin = tax.source;

    const summary = buildSourceFactSummary(input)!;

    expect(summary.status).toBe("available");
    expect(summary.rows.find(row => row.metric === "income-tax-expense")?.origin).toBe(tax.source);
    expect(summary.rows.find(row => row.metric === "net-income")?.origin).toBe("fmp:income-statement(quarter)");
    expect(summary.earningsReconciliation.status).toBe("available");
  });

  it.each(["unknown:income-statement(quarter)", "computed:income-statement(quarter)", "edgar:income-statement(annual)"])("withholds %s origins even when cell and registry agree", origin => {
    const input = payload();
    for (const line of input.statements[0]!.lineItems) line.source = origin;
    for (const row of input.provenanceRegistry!) row.origin = origin;
    expect(buildSourceFactSummary(input)).toMatchObject({ status: "unavailable", rows: [], reason: expect.stringMatching(/origin/i) });
  });

  it.each([null, undefined])("does not replace an explicit unknown cell origin (%s) with the line's provider", source => {
    const input = payload();
    Object.assign(cell(input, "income-tax-expense"), { source });
    expect(buildSourceFactSummary(input)).toMatchObject({ status: "unavailable", rows: [], reason: expect.stringMatching(/origin/i) });
  });

  it("preserves exact operands and applies signed equity only to the identity that requires it", () => {
    const input = payload(), before = structuredClone(input);
    const summary = buildSourceFactSummary(input)!;
    expect(summary).toMatchObject({ version: "1.0.0", status: "available", reason: null, qualifier: "as reported" });
    expect(summary.rows).toHaveLength(4);
    expect(summary.rows[0]).toMatchObject({ metric: "income-before-tax", label: "income before tax", definition: "reported-statement-line-item",
      value: 80.857e9, unit: "currency", currency: "USD", period: "2026-06-30", periodContext,
      source: record(input, "income-before-tax").id, provenanceId: record(input, "income-before-tax").id,
      origin: "fmp:income-statement(quarter)", asOf: "2026-07-30", qualifier: "as reported" });
    expect(summary.earningsReconciliation).toMatchObject({ status: "available", reason: null, method: "pretax-minus-tax-plus-equity-method",
      pretaxMinusTax: 62.658e9, reconciledNetIncome: 62.647e9, reportedNetIncome: 62.647e9, residual: 0 });
    expect(summary.earningsReconciliation.operandIds).toEqual(summary.rows.map(row => row.provenanceId));
    expect(summary.earningsReconciliation.explanation).toMatch(/not normalized|does not establish normalized/i);
    expect(input).toEqual(before);
  });

  it("does not double count equity already included in pretax income", () => {
    const summary = buildSourceFactSummary(payload({ "net-income": 62.658e9 }))!;
    expect(summary.earningsReconciliation).toMatchObject({ status: "available", method: "pretax-minus-tax", residual: 0, reconciledNetIncome: 62.658e9 });
    expect(summary.earningsReconciliation.operandIds).not.toContain(summary.rows.find(row => row.metric.startsWith("equity-"))!.provenanceId);
    expect(summary.rows).toHaveLength(4);
  });

  it.each([
    [-100, -20, -80, 0], [100, 20, 81, 1], [0, 0, 0, 0],
  ])("preserves signs and reported zeros (%s, %s, %s, %s)", (pretax, tax, net, equity) => {
    const summary = buildSourceFactSummary(payload({ "income-before-tax": pretax, "income-tax-expense": tax, "net-income": net, "equity-method-income-loss-as-filed": equity }))!;
    expect(summary.earningsReconciliation).toMatchObject({ status: "available", reportedNetIncome: net, reconciledNetIncome: net, residual: 0 });
    expect(summary.rows.find(row => row.metric === "income-tax-expense")!.value).toBe(tax);
  });

  it("requires a reported tax operand, including when the missing tax could be zero", () => {
    const summary = buildSourceFactSummary(payload({ "income-tax-expense": null, "net-income": 80.857e9 }))!;
    expect(summary.earningsReconciliation).toMatchObject({ status: "unavailable", method: null, pretaxMinusTax: null, residual: null });
    expect(summary.earningsReconciliation.reason).toMatch(/missing.*income tax expense/i);
    expect(summary.rows.map(row => row.metric)).not.toContain("income-tax-expense");
  });

  it("does not require or infer equity when the direct reported identity already matches", () => {
    const summary = buildSourceFactSummary(payload({ "equity-method-income-loss-as-filed": null, "net-income": 62.658e9 }))!;
    expect(summary.earningsReconciliation).toMatchObject({ status: "available", method: "pretax-minus-tax", residual: 0 });
  });

  it("discloses a residual when equity is missing instead of inferring zero", () => {
    const summary = buildSourceFactSummary(payload({ "equity-method-income-loss-as-filed": null }))!;
    expect(summary.earningsReconciliation).toMatchObject({ status: "unavailable", method: "pretax-minus-tax", pretaxMinusTax: 62.658e9, residual: 0.011e9 });
    expect(summary.earningsReconciliation.reason).toMatch(/missing.*equity-method/i);
  });

  it("does not force an economically small residual to zero", () => {
    const summary = buildSourceFactSummary(payload({ "net-income": 62.647e9 + 1 }))!;
    expect(summary.earningsReconciliation).toMatchObject({ status: "unavailable", method: "pretax-minus-tax-plus-equity-method", residual: -1 });
    expect(summary.earningsReconciliation.reason).toMatch(/does not reconcile/i);
  });

  it("uses machine roundoff tolerance only and retains the actual residual", () => {
    const summary = buildSourceFactSummary(payload({ "income-before-tax": 0.3, "income-tax-expense": 0.1, "net-income": 0.2, "equity-method-income-loss-as-filed": null }))!;
    expect(summary.earningsReconciliation.status).toBe("available");
    expect(summary.earningsReconciliation.residual).toBe(0.3 - 0.1 - 0.2);
  });

  it.each(["period", "currency", "boundary", "unknown-boundary", "unknown-currency", "date", "value", "label", "origin", "unit", "computed"])("withholds incompatible or unestablished %s metadata", (changed) => {
    const input = payload(), row = record(input, "income-tax-expense"), item = cell(input, "income-tax-expense");
    if (changed === "period") { row.period = "2026-03-31"; item.period = "2026-03-31"; }
    if (changed === "currency") { row.currency = "EUR"; item.currency = "EUR"; }
    if (changed === "boundary") { row.periodContext = { ...periodContext, start: "2026-01-01" }; item.periodContext = row.periodContext; }
    if (changed === "unknown-boundary") { delete row.periodContext; delete item.periodContext; }
    if (changed === "unknown-currency") { row.currency = null; item.currency = null; }
    if (changed === "date") row.asOf = "2026-07-31";
    if (changed === "value") row.value += 1;
    if (changed === "label") row.label = "adjusted income tax expense";
    if (changed === "origin") row.origin = "fmp:income-statement(annual)";
    if (changed === "unit") row.unit = "currency-per-share";
    if (changed === "computed") row.kind = "computed";
    const summary = buildSourceFactSummary(input)!;
    expect(summary.status).toBe("unavailable");
    expect(summary.rows).toEqual([]);
    expect(summary.reason).toBeTruthy();
    expect(summary.earningsReconciliation.status).toBe("unavailable");
  });

  it("rejects duplicate exact IDs and suffixed conflicting records", () => {
    for (const suffix of ["", ".2", "-2"]) {
      const input = payload(), original = record(input, "net-income");
      input.provenanceRegistry!.push({ ...original, id: `${original.id}${suffix}`, value: original.value + 1 });
      expect(buildSourceFactSummary(input)).toMatchObject({ status: "unavailable", rows: [], reason: expect.stringMatching(/conflict|duplicate/i) });
    }
  });

  it("never backfills an incomplete current quarter with an earlier complete quarter", () => {
    const input = payload({ "income-tax-expense": null });
    const old = payload();
    old.provenanceRegistry!.forEach(row => { row.id = row.id.replaceAll("2026-06-30", "2026-03-31"); row.period = "2026-03-31"; row.periodContext = { kind: "duration", start: "2026-01-01", end: "2026-03-31" }; });
    input.provenanceRegistry!.push(...old.provenanceRegistry!);
    expect(buildSourceFactSummary(input)!.earningsReconciliation).toMatchObject({ status: "unavailable", reason: expect.stringMatching(/missing.*income tax expense/i) });
  });

  it("returns no summary for historical/empty payloads with no quarterly statements", () => {
    const input = payload();
    input.statements = [];
    delete input.provenanceRegistry;
    expect(buildSourceFactSummary(input)).toBeUndefined();
  });

  it("discloses a historical quarterly payload's missing registry rather than manufacturing facts", () => {
    const input = payload(); delete input.provenanceRegistry;
    expect(buildSourceFactSummary(input)).toMatchObject({ status: "unavailable", rows: [], reason: expect.stringMatching(/registry/i) });
  });
});

describe("persisted source facts reject contradictory metadata", () => {
  it.each(["source", "duration-end", "currency", "duration-start", "duplicate-id", "duplicate-metric"])("rejects %s contradictions in rendered rows", (changed) => {
    const summary = buildSourceFactSummary(payload())!;
    const row = summary.rows[1]!;
    if (changed === "source") row.source = "another-registry-id";
    if (changed === "duration-end") row.periodContext.end = "2026-06-29";
    if (changed === "currency") row.currency = "EUR";
    if (changed === "duration-start") row.periodContext.start = "2026-01-01";
    if (changed === "duplicate-id") { row.provenanceId = summary.rows[0]!.provenanceId; row.source = row.provenanceId; }
    if (changed === "duplicate-metric") row.metric = summary.rows[0]!.metric;
    const parsed = SourceFactSummarySchema.safeParse(summary);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.some(issue => issue.path[0] === "rows")).toBe(true);
  });

  it.each(["reason", "method", "pretaxMinusTax", "reconciledNetIncome", "reportedNetIncome", "residual"] as const)("requires complete %s metadata for an available reconciliation", (field) => {
    const summary = buildSourceFactSummary(payload())!;
    const invalid = { ...summary, earningsReconciliation: { ...summary.earningsReconciliation,
      [field]: field === "reason" ? "This reconciliation is unavailable." : null } };
    expect(SourceFactSummarySchema.safeParse(invalid).success).toBe(false);
  });

  it("requires a reason for an unavailable reconciliation", () => {
    const summary = buildSourceFactSummary(payload({ "income-tax-expense": null }))!;
    summary.earningsReconciliation.reason = null;
    expect(SourceFactSummarySchema.safeParse(summary).success).toBe(false);
  });

  it.each(["reason", "rows"])("rejects an available summary with invalid %s", (changed) => {
    const summary = buildSourceFactSummary(payload())!;
    if (changed === "reason") summary.reason = "Source facts are withheld.";
    if (changed === "rows") summary.rows = [];
    expect(SourceFactSummarySchema.safeParse(summary).success).toBe(false);
  });

  it.each(["reason", "rows", "reconciliation"])("rejects a withheld summary with invalid %s", (changed) => {
    const input = payload(); delete input.provenanceRegistry;
    const summary = buildSourceFactSummary(input)!;
    expect(SourceFactSummarySchema.safeParse(summary).success).toBe(true);
    if (changed === "reason") summary.reason = null;
    if (changed === "rows") summary.rows = buildSourceFactSummary(payload())!.rows;
    if (changed === "reconciliation") summary.earningsReconciliation = buildSourceFactSummary(payload())!.earningsReconciliation;
    expect(SourceFactSummarySchema.safeParse(summary).success).toBe(false);
  });

  it.each(["duplicate", "unknown", "omitted-rendered"])("rejects %s arithmetic operands", (changed) => {
    const summary = buildSourceFactSummary(payload())!;
    const ids = summary.earningsReconciliation.operandIds;
    if (changed === "duplicate") ids[1] = ids[0]!;
    if (changed === "unknown") ids[1] = "unrendered-registry-id";
    if (changed === "omitted-rendered") summary.rows = summary.rows.slice(1);
    expect(SourceFactSummarySchema.safeParse(summary).success).toBe(false);
  });
});

describe("canonical source fact templates have a deliberately narrow validation scope", () => {
  it("validates only an exact generated template", () => {
    const fact = buildSourceFactSummary(payload())!.rows[0]!;
    expect(validateSourceFactTemplate({ kind: "source-fact", fact, text: fact.canonicalText }, fact)).toEqual({ status: "validated", scope: "source-fact-template", reason: "exact-canonical-template" });
    expect(fact.canonicalText).toContain("as reported");
    expect(fact.canonicalText).toContain(fact.provenanceId);
    expect(fact.canonicalText).toContain("2026-04-01");
  });

  it.each([
    ["metric", "adjusted-net-income"], ["definition", "normalized-recurring-earnings"], ["label", "adjusted net income"],
    ["period", "FY2026"], ["unit", "currency-per-share"], ["currency", "EUR"], ["value", 1], ["qualifier", "adjusted"],
    ["source", "fmp:invented"], ["provenanceId", "fmp:invented"], ["origin", "another-provider"], ["asOf", "2026-07-31"],
    ["periodContext", { ...periodContext, start: "2026-01-01" }],
  ])("rejects a changed %s", (field, value) => {
    const fact = buildSourceFactSummary(payload())!.rows[0]!;
    expect(validateSourceFactTemplate({ kind: "source-fact", fact: { ...fact, [field]: value }, text: fact.canonicalText }, fact).status).toBe("rejected");
  });

  it("does not validate prose or an added opinion merely because the number matches", () => {
    const fact = buildSourceFactSummary(payload())!.rows[0]!;
    expect(validateSourceFactTemplate({ kind: "opinion", text: "Management execution looks strong." }, fact).status).toBe("unverified");
    expect(validateSourceFactTemplate("Management execution looks strong.", fact).status).toBe("unverified");
    expect(validateSourceFactTemplate({ kind: "source-fact", fact, text: `${fact.canonicalText} This proves strong recurring earnings.` }, fact).status).toBe("rejected");
  });
});

const reportFixture = () => ReportSchema.parse(JSON.parse(readFileSync("fixtures/report/DEMO-sample.json", "utf8")));
const verifyDeps = { model: "deterministic", runPass: () => { throw new Error("No model may run for source facts"); } } as unknown as PassDeps;

function compatibleBundle(): DataBundle {
  const bundle = completeCurrencyBundle({});
  if (!bundle.statements.incomeQuarterly.ok) throw new Error("Synthetic statements required");
  const row = bundle.statements.incomeQuarterly.value.data.rows[0]!;
  row.fiscalYear = "2026"; row.period = "Q1";
  row.incomeBeforeTax = 80.857e9; row.incomeTaxExpense = 18.199e9; row.netIncome = 62.647e9; row.equityMethodIncomeLoss = -0.011e9;
  row.fieldProvenance = Object.fromEntries(["incomeBeforeTax", "incomeTaxExpense", "netIncome", "equityMethodIncomeLoss"].map(metric => [metric,
    { source: "edgar", unit: "USD", periodStart: "2026-01-01", periodEnd: "2026-03-31", observedAt: "2026-05-05", tags: [metric], filings: [] },
  ]));
  return bundle;
}

describe("pipeline-owned source facts across report paths", () => {
  it.each(["envelope", "row", "field"] as const)("preserves EDGAR %s attribution from statement acquisition through AI and data-only reports", async level => {
    const bundle = compatibleBundle();
    if (!bundle.statements.incomeQuarterly.ok) throw new Error("Synthetic statements required");
    const statement = bundle.statements.incomeQuarterly.value;
    if (level === "envelope") {
      statement.source = "edgar";
      statement.endpoint = "companyfacts→income-statement(quarter)";
    }
    if (level === "row") statement.data.rows[0]!.source = "edgar";
    const computed = runStageB(bundle);
    const context = assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] });
    const ai = (await runVerifyPass(verifyDeps, context, reportFixture())).verifiedReport;
    const dataOnly = enrichDataOnlyReport(reportFixture(), { bundle, computed, reason: "controlled replay" });

    expect(ai.sourceFactSummary?.status).toBe("available");
    expect(ai.sourceFactSummary?.rows).toHaveLength(4);
    expect(ai.sourceFactSummary?.rows.every(row => row.origin === "edgar:income-statement(quarter)")).toBe(true);
    expect(ai.sourceFactSummary?.rows.every(row => row.canonicalText.includes("provider origin: edgar:income-statement(quarter)"))).toBe(true);
    expect(dataOnly.sourceFactSummary).toEqual(ai.sourceFactSummary);
    expect(ReportSchema.safeParse(dataOnly).success).toBe(true);
  });

  it("accepts a complete optional summary without changing historical stamps", () => {
    const report = reportFixture(), summary = buildSourceFactSummary(payload())!;
    const parsed = ReportSchema.parse({ ...report, sourceFactSummary: summary });
    expect(parsed.sourceFactSummary).toEqual(summary);
    expect(parsed.meta.specVersion).toBe(report.meta.specVersion);
    expect(reportFixture()).not.toHaveProperty("sourceFactSummary");
  });

  it("rejects malformed summary rows and reconciliation references that have no rendered operand", () => {
    const report = reportFixture(), summary = buildSourceFactSummary(payload())!;
    for (const changed of [
      { ...summary, injected: true },
      { ...summary, rows: [{ ...summary.rows[0], qualifier: "adjusted" }, ...summary.rows.slice(1)] },
      { ...summary, rows: summary.rows.slice(1) },
      { ...summary, earningsReconciliation: { ...summary.earningsReconciliation, operandIds: [] } },
    ]) expect(ReportSchema.safeParse({ ...report, sourceFactSummary: changed }).success).toBe(false);
  });

  it("rebuilds supplied facts during full report verification without counting bare source rows as prose or traced numbers", async () => {
    const report = reportFixture();
    const withoutSummary = await runVerifyPass(verifyDeps, payload(), report);
    const supplied = { ...report, sourceFactSummary: { fabricated: true } };
    const verified = await runVerifyPass(verifyDeps, payload(), supplied);
    expect(verified.verifiedReport.sourceFactSummary).toEqual(buildSourceFactSummary(payload()));
    expect(verified.coverage).toEqual(withoutSummary.coverage);
    expect(verified.total).toBe(withoutSummary.total);
    expect(ReportSchema.safeParse(verified.verifiedReport).success).toBe(true);
    expect(supplied.sourceFactSummary).toEqual({ fabricated: true });
  });

  it("removes a supplied summary when the current payload cannot establish any quarterly statement", async () => {
    const input = payload(); input.statements = [];
    const report = { ...reportFixture(), sourceFactSummary: buildSourceFactSummary(payload())! };
    expect((await runVerifyPass(verifyDeps, input, report)).verifiedReport).not.toHaveProperty("sourceFactSummary");
  });

  it("keeps partial judge output outside the report-owned fact field", async () => {
    const result = await runVerifyPass(verifyDeps, payload(), { fundamentals: { commentary: [] } });
    expect(result.verifiedReport).not.toHaveProperty("sourceFactSummary");
  });

  it("emits identical facts and reported arithmetic in AI and data-only paths", async () => {
    const bundle = compatibleBundle();
    const computed = runStageB(bundle), report = reportFixture();
    const context = assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] });
    const ai = (await runVerifyPass(verifyDeps, context, report)).verifiedReport;
    const dataOnly = enrichDataOnlyReport(report, { bundle, computed, reason: "controlled replay" });
    expect(ai.sourceFactSummary?.earningsReconciliation.status).toBe("available");
    expect(dataOnly.sourceFactSummary).toEqual(ai.sourceFactSummary);
    expect(ReportSchema.safeParse(dataOnly).success).toBe(true);
  });

  // NVDA report 34: FMP serves the latest quarter without field-level SEC
  // boundaries, so the reconciliation was "unavailable" on every FMP issuer.
  it("reconciles an FMP-served quarter bounded by the issuer's preceding fiscal quarter", async () => {
    const bundle = compatibleBundle();
    if (!bundle.statements.incomeQuarterly.ok) throw new Error("Synthetic statements required");
    const [latest, prior] = bundle.statements.incomeQuarterly.value.data.rows;
    delete latest!.fieldProvenance;
    prior!.fiscalYear = "2025"; prior!.period = "Q4";
    const context = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
    const summary = (await runVerifyPass(verifyDeps, context, reportFixture())).verifiedReport.sourceFactSummary;
    expect(summary?.status).toBe("available");
    expect(summary?.earningsReconciliation.status).toBe("available");
    expect(summary?.rows[0]?.periodContext).toMatchObject({ start: "2026-01-01", end: "2026-03-31", basis: "fiscal-quarter", fiscalLabel: "Q1 FY2026" });
  });

  it("does not carry a copied source summary through a data-only report with no quarterly evidence", () => {
    const bundle = completeCurrencyBundle({});
    bundle.statements.incomeQuarterly = { ok: false, gap: { field: "quarterly", reason: "withheld", severity: "info" } };
    const computed = runStageB(bundle), report = { ...reportFixture(), sourceFactSummary: buildSourceFactSummary(payload())! } as Report;
    expect(enrichDataOnlyReport(report, { bundle, computed, reason: "controlled replay" })).not.toHaveProperty("sourceFactSummary");
  });

  it("stamps data-only timing from the same input and calculation cutoffs as report assembly", () => {
    const bundle = completeCurrencyBundle({}), computed = runStageB(bundle), report = reportFixture();
    delete report.meta.evidenceTiming;
    const before = structuredClone(report);
    const enriched = enrichDataOnlyReport(report, { bundle, computed, reason: "controlled replay" });
    expect(enriched.meta.evidenceTiming).toMatchObject({ version: "1", calculationAsOf: computed.builtAt,
      reportGeneratedAt: report.meta.generatedAt, calculatedAt: null });
    expect(enriched.meta.evidenceTiming?.financialPeriods).toContainEqual({ source: "statements.incomeQuarterly", periodEnd: "2026-03-31" });
    expect(report).toEqual(before);
  });
});

describe("final report assembly when verification fails", () => {
  const pointer = "See the earnings reconciliation below.";
  const priorLog = { claim: "Verification pass failed", outcome: "unverified" as const };
  const judge = () => {
    const report = reportFixture();
    report.fundamentals.commentary = [{ text: pointer, label: "FACT", source: "edgar:10-Q", asOf: "2026-05-05" }];
    return report;
  };

  it("attaches the actual reported bridge and a fixed section reference in the final fallback", () => {
    const bundle = compatibleBundle(), computed = runStageB(bundle), judgeOutput = judge();
    const verify = { verificationRate: null, log: [priorLog] };
    const before = structuredClone({ bundle, computed, judgeOutput, verify });
    const report = assembleReport({ symbol: bundle.symbol, bundle, computed, judgeOutput, verify, costEntries: [], model: "deterministic" }, "2026-07-06T00:00:00.000Z");
    expect(report.sourceFactSummary?.earningsReconciliation.status).toBe("available");
    expect(report.fundamentals.commentary[0]!.text).toBe("See the reported earnings reconciliation in the Fundamentals section.");
    expect(report.appendix.verificationLog).toContainEqual(priorLog);
    expect(report.appendix.verificationLog).toContainEqual(expect.objectContaining({ claim: pointer, reason: "report-reference-normalized", path: "fundamentals.commentary[0]" }));
    expect({ bundle, computed, judgeOutput, verify }).toEqual(before);
    expect(ReportSchema.safeParse(report).success).toBe(true);
  });

  it("withholds a missing destination and preserves its original pointer in the fallback audit", () => {
    const bundle = compatibleBundle();
    bundle.statements.incomeQuarterly = { ok: false, gap: { field: "quarterly", reason: "withheld", severity: "info" } };
    const computed = runStageB(bundle), judgeOutput = judge(), verify = { verificationRate: null, log: [priorLog] };
    const before = structuredClone({ bundle, computed, judgeOutput, verify });
    const report = assembleReport({ symbol: bundle.symbol, bundle, computed, judgeOutput, verify, costEntries: [], model: "deterministic" }, "2026-07-06T00:00:00.000Z");
    expect(report).not.toHaveProperty("sourceFactSummary");
    expect(report.fundamentals.commentary[0]).toMatchObject({ source: "pipeline:report-reference", asOf: null, text: expect.stringContaining("unavailable") });
    expect(report.appendix.verificationLog).toContainEqual(priorLog);
    expect(report.appendix.verificationLog).toContainEqual(expect.objectContaining({ claim: pointer, reason: "unsupported-report-reference", path: "fundamentals.commentary[0]" }));
    expect({ bundle, computed, judgeOutput, verify }).toEqual(before);
  });

  it("retains the original reference during provisional assembly before trusted verification", () => {
    const bundle = compatibleBundle(), computed = runStageB(bundle), judgeOutput = judge();
    const report = assembleReport({ symbol: bundle.symbol, bundle, computed, judgeOutput, provisionalVerification: true,
      verify: { verificationRate: null, log: [] }, costEntries: [], model: "deterministic" }, "2026-07-06T00:00:00.000Z");
    expect(report.fundamentals.commentary[0]!.text).toBe(pointer);
    expect(report.appendix.verificationLog).toEqual([]);
  });

  it("keeps empty legacy assembly compatible while withholding an unsupported pointer", () => {
    const bundle = { symbol: "TEST", builtAt: "2026-07-06T00:00:00.000Z", profile: { ok: false }, sourceManifest: {}, asOf: {}, gaps: [] } as unknown as DataBundle;
    const report = assembleReport({ symbol: bundle.symbol, bundle, computed: { gaps: [] } as unknown as ComputedMetrics, judgeOutput: judge(),
      verify: { verificationRate: null, log: [] }, costEntries: [], model: "deterministic" }, "2026-07-06T00:00:00.000Z");
    expect(report).not.toHaveProperty("sourceFactSummary");
    expect(report.fundamentals.commentary[0]!.text).toContain("unavailable");
    expect(ReportSchema.safeParse(report).success).toBe(true);
  });

  it("retains statement-only legacy assembly when computed metric sections are absent", () => {
    const bundle = compatibleBundle();
    const report = assembleReport({ symbol: bundle.symbol, bundle, computed: { gaps: [] } as unknown as ComputedMetrics, judgeOutput: judge(),
      verify: { verificationRate: null, log: [] }, costEntries: [], model: "deterministic" }, "2026-07-06T00:00:00.000Z");
    expect(report).not.toHaveProperty("sourceFactSummary");
    expect(report.fundamentals.commentary[0]!.text).toContain("unavailable");
    expect(report.appendix.verificationLog).toContainEqual(expect.objectContaining({ claim: pointer, reason: "unsupported-report-reference" }));
  });
});
