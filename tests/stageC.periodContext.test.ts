import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import { assembleContextPayload, formatFigure, serializePayloadForPrompt, type ContextPayload } from "@/pipeline/stageC/payload";
import { matchProvenanceRecord, periodsAgree, validateProvenanceRegistry, type NumericProvenanceRecord } from "@/pipeline/stageC/provenance";
import { analystCaseToJsonSchema, judgeOutputToJsonSchema, TracedNumberSchema } from "@/report/schema";
import type { TracedNumber } from "@/report/schema";
import { tracedPeriodLabel } from "@/report/format";
import { comparePeriodContexts, PeriodContextSchema } from "@/types/periodContext";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const quarter = { kind: "duration" as const, start: "2025-04-01", end: "2025-06-30" };
const record: NumericProvenanceRecord = {
  id: "payload.statements.income-statement-quarterly.2025-06-30.revenue",
  label: "revenue", kind: "provider", value: 100, unit: "currency", currency: "USD",
  period: "2025-06-30", asOf: "2025-08-01", origin: "synthetic:statement",
  formulaVersion: null, displayPrecision: 4,
};
const candidate = {
  source: record.id, value: record.value, unit: record.unit, currency: record.currency,
  period: record.period, asOf: record.asOf,
};
const traced = { ...candidate, source: record.id, verified: null };

describe("structured numeric period identity", () => {
  it.each([
    ["H1", { ...quarter, start: "2025-01-01" }],
    ["TTM", { ...quarter, start: "2024-07-01" }],
    ["instant", { kind: "instant" as const, at: quarter.end }],
  ])("rejects %s on the same end date before the legacy strings can match", (_name, periodContext) => {
    expect(matchProvenanceRecord({ ...candidate, periodContext }, [{ ...record, periodContext: quarter }])).toMatchObject({
      ok: false, reason: "period-mismatch",
    });
  });

  it("accepts a fiscal alias only when supplied exact contexts agree", () => {
    const periodContext = { kind: "duration" as const, start: "2024-09-29", end: "2024-12-28", fiscalLabel: "Q1 FY2025" };
    expect(matchProvenanceRecord(
      { ...candidate, period: "Q1 FY2025", periodContext },
      [{ ...record, period: "2024-12-28", periodContext }],
    )).toMatchObject({ ok: true });
    expect(matchProvenanceRecord(
      { ...candidate, periodContext: { ...periodContext, start: "2024-10-01" } },
      [{ ...record, periodContext }],
    )).toMatchObject({ ok: false, reason: "period-mismatch" });
  });

  it("uses exact 52/53-week boundaries rather than a calendar approximation", () => {
    const year53 = { kind: "duration" as const, start: "2025-12-28", end: "2027-01-02", basis: "fiscal-year" as const };
    const source = { ...record, period: year53.end, periodContext: year53 };
    expect(matchProvenanceRecord({ ...candidate, period: year53.end, periodContext: year53 }, [source])).toMatchObject({ ok: true });
    expect(matchProvenanceRecord({ ...candidate, period: year53.end, periodContext: { ...year53, start: "2026-01-04" } }, [source])).toMatchObject({ ok: false, reason: "period-mismatch" });
  });

  it("does not promote a legacy alias or change exact legacy string matching", () => {
    expect(matchProvenanceRecord(candidate, [record])).toMatchObject({ ok: true });
    expect(matchProvenanceRecord({ ...candidate, period: "FY2025" }, [record])).toMatchObject({ ok: false, reason: "period-mismatch" });
    expect(matchProvenanceRecord({ ...candidate, period: "FY2025", periodContext: quarter }, [record])).toMatchObject({ ok: false, reason: "period-mismatch" });
    expect(matchProvenanceRecord(candidate, [{ ...record, periodContext: quarter }])).toMatchObject({ ok: true });
    expect(periodsAgree("H1 2025", "2025-06-30", "Q2 FY2025")).toBe(false);
    expect(periodsAgree("Q1 FY2025", "2024-12-28", "Q1 FY2025")).toBe(true);
    expect(periodsAgree("Q1 2025", "2024-12-28", "Q1 FY2025")).toBe(false);
  });

  it("does not let matching structured dates excuse a contradictory legacy label", () => {
    const periodContext = { ...quarter, fiscalLabel: "Q2 FY2025" };
    expect(matchProvenanceRecord(
      { ...candidate, period: "H1 FY2025", periodContext },
      [{ ...record, periodContext }],
    )).toMatchObject({ ok: false, reason: "period-mismatch" });
  });

  it("rejects contradictory supplied basis or fiscal labels", () => {
    for (const periodContext of [
      { ...quarter, basis: "fiscal-half-year" as const },
      { ...quarter, fiscalLabel: "Q2 FY2026" },
    ]) {
      expect(matchProvenanceRecord({ ...candidate, periodContext }, [{ ...record, periodContext: { ...quarter, basis: "fiscal-quarter", fiscalLabel: "Q2 FY2025" } }])).toMatchObject({ ok: false, reason: "period-mismatch" });
    }
  });

  it("rejects invalid supplied context even with equal legacy periods", () => {
    const invalid = { kind: "duration" as const, start: "2025-02-30", end: "2025-06-30" };
    expect(matchProvenanceRecord({ ...candidate, periodContext: invalid }, [record])).toMatchObject({ ok: false, reason: "period-mismatch" });
    expect(() => validateProvenanceRegistry([{ ...record, periodContext: invalid } as NumericProvenanceRecord])).toThrow(/period context/i);
  });
});

describe("strict optional traced period metadata", () => {
  it("validates leap days and inclusive one-day durations and preserves unknown comparisons", () => {
    expect(PeriodContextSchema.safeParse({ kind: "instant", at: "2024-02-29" }).success).toBe(true);
    expect(PeriodContextSchema.safeParse({ kind: "duration", start: "2024-02-29", end: "2024-02-29" }).success).toBe(true);
    expect(comparePeriodContexts(undefined, quarter)).toBeNull();
    expect(comparePeriodContexts(quarter, undefined)).toBeNull();
    expect(comparePeriodContexts()).toBeNull();
    expect(comparePeriodContexts(quarter, { ...quarter, basis: "fiscal-quarter" })).toBe(true);
  });

  it("keeps source period metadata out of analyst/judge request schemas", () => {
    function hasModelPeriodContext(node: unknown): boolean {
      if (node === null || typeof node !== "object") return false;
      if (Array.isArray(node)) return node.some(hasModelPeriodContext);
      const object = node as Record<string, unknown>;
      const properties = object.properties as Record<string, unknown> | undefined;
      return (properties !== undefined && "periodContext" in properties) || Object.values(object).some(hasModelPeriodContext);
    }
    expect(hasModelPeriodContext(analystCaseToJsonSchema())).toBe(false);
    expect(hasModelPeriodContext(judgeOutputToJsonSchema())).toBe(false);
  });

  it("accepts both a valid context and an untouched legacy number", () => {
    expect(TracedNumberSchema.safeParse(traced).success).toBe(true);
    expect(TracedNumberSchema.safeParse({ ...traced, periodContext: quarter }).success).toBe(true);
  });

  it.each([
    { kind: "duration", start: "2025-02-29", end: "2025-06-30" },
    { kind: "duration", start: "2025-07-01", end: "2025-06-30" },
    { kind: "instant", at: "2025-04-31" },
    { kind: "duration", end: "2025-06-30" },
    { kind: "instant", at: "2025-06-30", start: "2025-01-01" },
    { ...quarter, basis: "guessed-quarter" },
    { ...quarter, fiscalLabel: " " },
    null,
  ])("rejects malformed context %j", (periodContext) => {
    expect(TracedNumberSchema.safeParse({ ...traced, periodContext }).success).toBe(false);
  });
});

describe("period identity through verification", () => {
  it("fills missing period metadata from a successful exact registry match and renders its source window", async () => {
    const trustedRecord = { ...record, periodContext: quarter };
    const payload = { provenanceRegistry: [trustedRecord], citationRegistry: [] } as unknown as ContextPayload;
    const report: { numbers: TracedNumber[] } = { numbers: [{ ...traced }] };
    const { verifiedReport } = await runVerifyPass({} as PassDeps, payload, report);
    const number = verifiedReport.numbers[0]!;
    expect(number).toMatchObject({ verified: true, periodContext: quarter });
    expect(number.periodContext).not.toBe(trustedRecord.periodContext);
    expect(tracedPeriodLabel(number.period, number.periodContext)).toContain("duration 2025-04-01 to 2025-06-30");
    expect(report.numbers[0]).not.toHaveProperty("periodContext");
  });

  it("does not attach registry metadata to failed, unknown, invalid or legacy matches", async () => {
    const invalidRecord = { ...record, id: "invalid-period", periodContext: { ...quarter, start: "2025-02-30" } };
    const legacyRecord = { ...record, id: "legacy-period" };
    const payload = { provenanceRegistry: [{ ...record, periodContext: quarter }, invalidRecord, legacyRecord], citationRegistry: [] } as unknown as ContextPayload;
    const report: { numbers: TracedNumber[] } = { numbers: [
      { ...traced, value: 101 },
      { ...traced, source: "unknown-source" },
      { ...traced, source: invalidRecord.id },
      { ...traced, source: legacyRecord.id },
    ] };
    const result = await runVerifyPass({} as PassDeps, payload, report);
    expect(result.verifiedReport.numbers.map((number) => number.verified)).toEqual([false, false, false, true]);
    for (const number of result.verifiedReport.numbers) expect(number).not.toHaveProperty("periodContext");
  });

  it("does not fabricate a period context for a successful excerpt match", async () => {
    const source = "edgar:10-K item7";
    const payload = {
      provenanceRegistry: [{ ...record, periodContext: quarter }],
      citationRegistry: [{ id: source, kind: "payload-text", asOf: record.asOf, origin: source }],
      filings: [{ title: "Synthetic filing", source, asOf: record.asOf,
        text: "The standardized CET1 ratio was 14.2%.", truncated: false, originalChars: 40 }],
    } as unknown as ContextPayload;
    const report: { numbers: TracedNumber[] } = { numbers: [{ value: 14.2, unit: "% standardized CET1 ratio", source, asOf: record.asOf, verified: null }] };
    const result = await runVerifyPass({} as PassDeps, payload, report);
    expect(result.verifiedReport.numbers[0]!.verified).toBe(true);
    expect(result.log[0]!.traceKind).toBe("excerpt-match");
    expect(result.verifiedReport.numbers[0]).not.toHaveProperty("periodContext");
  });

  it("checks supplied context through runVerifyPass before matching equal period ends", async () => {
    const payload = { provenanceRegistry: [{ ...record, periodContext: quarter }], citationRegistry: [] } as unknown as ContextPayload;
    const report = { numbers: [
      { ...traced, periodContext: { ...quarter, start: "2025-01-01" } },
      { ...traced, periodContext: quarter },
      traced,
    ] };
    const result = await runVerifyPass({} as PassDeps, payload, report);
    expect(result.verifiedReport.numbers.map((number) => number.verified)).toEqual([false, true, true]);
    expect(result.verifiedReport.numbers[0]).toMatchObject({ periodContext: { start: "2025-01-01" } });
    expect(result.log[0]).toMatchObject({ reason: "period-mismatch", outcome: "unverified" });
  });
});

describe("source period propagation", () => {
  it("keeps absent, invalid and conflicting flow boundaries unknown instead of guessing", () => {
    const bundle = completeCurrencyBundle({});
    if (!bundle.statements.incomeQuarterly.ok) throw new Error("synthetic income required");
    const row = bundle.statements.incomeQuarterly.value.data.rows[0]!;
    row.period = "Q1";
    row.fiscalYear = "2026";
    row.fieldProvenance = {
      revenue: { source: "edgar", unit: "USD", periodStart: null, periodEnd: "2026-03-31", observedAt: "2026-05-05", tags: [], filings: [] },
      netIncome: { source: "edgar", unit: "USD", periodStart: "2026-02-30", periodEnd: "2026-03-31", observedAt: "2026-05-05", tags: [], filings: [] },
      operatingIncome: { source: "edgar", unit: "USD", periodStart: "2026-01-01", periodEnd: "2026-03-30", observedAt: "2026-05-05", tags: [], filings: [] },
    };
    const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
    const statement = payload.statements.find((block) => /income statement.*quarterly/i.test(block.title))!;
    for (const lineItem of ["revenue", "net income", "operating income"]) {
      expect(statement.lineItems.find((line) => line.lineItem === lineItem)!.byPeriod[0]).not.toHaveProperty("periodContext");
    }
  });

  it("carries field boundaries to cells, registry and model text independently of acquisition", () => {
    const bundle = completeCurrencyBundle({});
    if (!bundle.statements.incomeQuarterly.ok) throw new Error("synthetic income required");
    const row = bundle.statements.incomeQuarterly.value.data.rows[0]!;
    row.fiscalYear = "2026";
    row.period = "Q1";
    row.fieldProvenance = {
      revenue: { source: "edgar", unit: "USD", periodStart: "2026-01-01", periodEnd: "2026-03-31", observedAt: "2026-05-05", tags: ["Revenues"], filings: [] },
    };
    bundle.statements.incomeQuarterly.value.asOf = "2026-05-05";
    const computed = runStageB(bundle);
    const payload = assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] });
    const revenue = payload.statements.find((block) => /income statement.*quarterly/i.test(block.title))!.lineItems.find((line) => line.lineItem === "revenue")!;
    const context = { kind: "duration", start: "2026-01-01", end: "2026-03-31", basis: "fiscal-quarter", fiscalLabel: "Q1 FY2026" };
    expect(revenue.byPeriod[0]).toMatchObject({ periodContext: context, asOf: "2026-05-05" });
    expect(payload.provenanceRegistry!.find((entry) => entry.id === revenue.byPeriod[0]!.provenanceId)).toMatchObject({ periodContext: context, asOf: "2026-05-05" });
    expect(revenue.byPeriod[1]).not.toHaveProperty("periodContext");
    const balance = payload.statements.find((block) => /balance sheet.*annual/i.test(block.title))!.lineItems[0]!.byPeriod[0]!;
    expect(balance).toMatchObject({ periodContext: { kind: "instant", at: "2025-12-31" } });
    expect(serializePayloadForPrompt(payload)).toContain(`periodContext=${JSON.stringify(context)}`);
  });

  it("renders supplied figure context without inventing it on legacy figures", () => {
    const figure = { label: "revenue", value: 100, unit: "currency", currency: "USD", period: quarter.end, source: "synthetic:figure", asOf: "2025-08-01" };
    expect(formatFigure({ ...figure, periodContext: quarter })).toContain(`periodContext=${JSON.stringify(quarter)}`);
    expect(formatFigure(figure)).not.toContain("periodContext");
  });
});
