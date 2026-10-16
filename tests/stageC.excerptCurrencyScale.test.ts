import { describe, expect, it } from "vitest";

import { matchExcerptNumber } from "@/pipeline/stageC/excerptNumbers";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import type { ContextPayload } from "@/pipeline/stageC/payload";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";

const source = "edgar:10-Q item2";
const asOf = "2026-06-30";

function match(value: number, displayUnit: string, body: string, currency: string | null = "USD") {
  return matchExcerptNumber({ value, unit: "currency", currency, displayUnit }, body, {
    reportingCurrency: "USD",
    description: displayUnit,
  });
}

async function verify(value: number, unit: string, period: string, body: string, currency: string | null = "USD") {
  const payload = {
    companyName: "Example issuer", symbol: "EXAMPLE",
    provenanceRegistry: [{ id: "payload.statements.income.revenue", kind: "provider", value: 1, unit: "currency",
      currency: "USD", period: asOf, asOf, origin: "edgar", formulaVersion: null, displayPrecision: 0 }],
    citationRegistry: [{ id: source, asOf, origin: source, kind: "payload-text" }],
    filings: [{ source, asOf, text: body, title: "Quarterly review", truncated: false, originalChars: body.length }],
  } as unknown as ContextPayload;
  const number = { value, unit, currency, period, source, asOf, verified: null };
  const result = await runVerifyPass({} as PassDeps, payload, { keyNumbers: [number] });
  return { entry: result.log.find((entry) => entry.evidenceKind === "number")!, number: result.verifiedReport.keyNumbers[0]! };
}

describe("explicit currency scale in excerpt numbers", () => {
  it("normalizes a printed-scale USD billion candidate before comparing the source", () => {
    const body = "Net sales guidance was $197 billion for Q3 2026.";
    const candidate = {
      value: 197,
      unit: "currency" as const,
      currency: "USD",
      displayUnit: "USD billions: Net sales guidance",
    };
    const result = matchExcerptNumber(candidate, body, {
      reportingCurrency: "USD",
      description: candidate.displayUnit,
    });

    expect(result).toMatchObject({ ok: true, currency: "USD", mention: { value: 197e9, raw: "$197 billion" } });
  });

  it("uses a declared millions scale rather than the source's scale", () => {
    expect(match(197_000, "USD millions: Net sales guidance", "Net sales guidance was $197 billion."))
      .toMatchObject({ ok: true, mention: { value: 197e9 } });
    expect(match(197, "USD millions: Net sales guidance", "Net sales guidance was $197 billion."))
      .toMatchObject({ ok: false, reason: "text-source" });
  });

  it("normalizes exactly once and retains printed-precision checks", () => {
    const body = "Net sales guidance was $197 billion.";
    for (const value of [197e9, 197.01, 198, -197]) {
      expect(match(value, "USD billions: Net sales guidance", body))
        .toMatchObject({ ok: false, reason: "text-source" });
    }
    expect(match(197e9, "USD Net sales guidance", body)).toMatchObject({ ok: true });
  });

  it("preserves signed amounts and accounting negatives under an explicit table header", () => {
    expect(match(-7_604, "USD millions: Free cash flow", "Free cash flow was -$7.604 billion."))
      .toMatchObject({ ok: true, mention: { value: -7.604e9 } });
    const table = "(in millions) $ Free cash flow (7,604) (1,234)";
    expect(match(-7.604, "USD billions: Free cash flow", table))
      .toMatchObject({ ok: true, mention: { value: -7.604e9, raw: "(7,604)", table: true } });
    expect(match(7.604, "USD billions: Free cash flow", table))
      .toMatchObject({ ok: false, reason: "text-source" });
  });

  it("requires a separately declared currency for a generic scaled currency unit", () => {
    const body = "Free cash flow was $7.604 billion.";
    expect(match(7_604, "currency millions: Free cash flow", body)).toMatchObject({ ok: true, currency: "USD" });
    expect(match(7_604, "currency millions: Free cash flow", body, null))
      .toMatchObject({ ok: false, reason: "currency-mismatch" });
    expect(match(7.604, "EUR billions: Free cash flow", body))
      .toMatchObject({ ok: false, reason: "currency-mismatch" });
    expect(match(7.604, "ZZZ billions: Free cash flow", body, "ZZZ"))
      .toMatchObject({ ok: false, reason: "currency-mismatch" });
  });

  it.each(["USD zillions: Net sales", "USD millions billions: Net sales", "USD: Net sales", "widgets billions: Net sales"])(
    "rejects an unknown or ambiguous explicit scale contract: %s", (unit) => {
      expect(match(197e9, unit, "Net sales were $197 billion."))
        .toMatchObject({ ok: false, reason: "unit-mismatch" });
    },
  );

  it("keeps legacy base-unit candidates without guessing the scale of ambiguous printed values", () => {
    const body = "Net sales guidance was $197 billion.";
    expect(match(197, "currency Net sales guidance", body)).toMatchObject({ ok: false, reason: "text-source" });
    expect(match(197e9, "currency Net sales guidance", body)).toMatchObject({ ok: true });
  });
});

describe("scaled excerpt numbers retain the source-span binding", () => {
  it("validates an explicit quarter amount and preserves source offsets", async () => {
    const body = "Capital expenditures in Q2 2026 were $53.1 billion.\nCapital expenditures in H1 2026 were $96.3 billion.";
    const { entry, number } = await verify(53.1, "USD billions: Capital expenditures were", "Q2 2026", body);
    expect(entry).toMatchObject({ outcome: "verified", validationStatus: "validated", traceKind: "excerpt-match" });
    expect(number).toMatchObject({ value: 53.1, currency: "USD", verified: true });
    const span = entry.sourceSpans?.[0];
    expect(span).toBeDefined();
    expect(body.slice(span!.start, span!.end)).toBe(span!.text);
    expect(span!.text).toContain("Q2 2026");
  });

  it("preserves the source binder's conservative limit for half-year plus year labels", async () => {
    // H1 and 2026 currently parse as two source periods. A scale match does
    // not establish the missing combined period interpretation.
    const body = "Capital expenditures in H1 2026 were $96.3 billion.";
    const { entry, number } = await verify(96.3, "USD billions: Capital expenditures were", "H1 2026", body);
    expect(entry).toMatchObject({ outcome: "unverified", validationStatus: "unchecked", reason: "text-ambiguous" });
    expect(number.verified).toBe(false);
  });

  it("does not validate the half-year amount as a quarterly amount", async () => {
    const body = "Capital expenditures in Q2 2026 were $53.1 billion.\nCapital expenditures in H1 2026 were $96.3 billion.";
    const { entry, number } = await verify(96.3, "USD billions: Capital expenditures were", "Q2 2026", body);
    expect(entry).toMatchObject({ outcome: "unverified", validationStatus: "contradicted", reason: "value-mismatch" });
    expect(number.verified).toBe(false);
  });

  it("D-63: binds a flattened table's cells to its header dates under the row label", async () => {
    // NVIDIA's Q2 FY2027 10-Q liquidity table, as extracted; the figure was untraced on 2026-10-15.
    const body = "Liquidity and Capital Resources Jul 26, 2026 Jan 25, 2026 (In millions) Cash and cash equivalents $ 22,443 $ 10,605 " +
      "Marketable debt securities 34,143 39,065 Cash, cash equivalents, and marketable debt securities $ 56,586 $ 49,670 " +
      "Six Months Ended Jul 26, 2026 Jul 27, 2025 (In millions) Net cash provided by operating activities $ 74,421 $ 42,779";
    const unit = "USD millions: Cash, cash equivalents, and marketable debt securities";
    expect((await verify(56_586, unit, "2026-07-26", body)).number.verified).toBe(true);
    expect((await verify(49_670, unit, "2026-01-25", body)).number.verified).toBe(true);
    expect((await verify(49_670, unit, "2026-07-26", body)).number.verified).toBe(false);
    expect((await verify(42_779, "USD millions: Net cash provided by operating activities", "2025-07-27", body)).number.verified).toBe(true);
  });

  it("leaves a flattened quarter/half-year table unchecked without column bindings", async () => {
    const body = "(in millions) Three months ended June 30 Six months ended June 30 2026 2025 2026 2025 Capital expenditures $ 53,100 $ 31,400 $ 96,300 $ 55,600";
    const { entry, number } = await verify(96.3, "USD billions: Capital expenditures", "Q2 2026", body);
    expect(entry).toMatchObject({ outcome: "unverified", validationStatus: "unchecked" });
    expect(number.verified).toBe(false);
  });
});

describe("explicit currency scale against numeric registry records", () => {
  async function registryNumber(value: number, unit: string, currency: string | null = "USD", recordValue = 197e9) {
    const record: NumericProvenanceRecord = {
      id: "payload.statements.income.revenue", label: "Net sales", kind: "provider", value: recordValue,
      unit: "currency", currency: "USD", period: asOf, asOf, origin: "edgar", formulaVersion: null, displayPrecision: 0,
    };
    const payload = { provenanceRegistry: [record], citationRegistry: [] } as unknown as ContextPayload;
    const number = { value, unit, currency, period: asOf, source: record.id, asOf, verified: null };
    const result = await runVerifyPass({} as PassDeps, payload, { keyNumbers: [number] });
    return { entry: result.log[0]!, number: result.verifiedReport.keyNumbers[0]! };
  }

  it("normalizes an explicitly scaled mantissa to the registry's base-currency value", async () => {
    for (const [value, unit] of [[197, "USD billions: Net sales"], [197_000, "currency millions: Net sales"]] as const) {
      const result = await registryNumber(value, unit);
      expect(result.entry).toMatchObject({ outcome: "verified", traceKind: "payload-match" });
      expect(result.number).toMatchObject({ value, unit, currency: "USD", verified: true });
    }
  });

  it("rejects a base-unit value incorrectly labeled as billions rather than normalizing twice", async () => {
    const result = await registryNumber(197e9, "USD billions: Net sales");
    expect(result.entry).toMatchObject({ outcome: "unverified", reason: "value-mismatch" });
    expect(result.number.verified).toBe(false);
  });

  it.each([
    [197e9, "USD zillions: Net sales", "USD"],
    [197e9, "USD millions billions: Net sales", "USD"],
    [197, "USD billions: Net sales", "EUR"],
    [197, "ZZZ billions: Net sales", "ZZZ"],
    [197, "currency billions: Net sales", null],
  ])("rejects unknown scales, conflicting currencies and missing declared scaled currencies: %j %s %s", async (value, unit, currency) => {
    const result = await registryNumber(value, unit, currency);
    expect(result.entry.outcome).toBe("unverified");
    expect(result.number.verified).toBe(false);
  });

  it("retains signed scaled values without changing the stored mantissa", async () => {
    const result = await registryNumber(-7_604, "USD millions: Free cash flow", "USD", -7.604e9);
    expect(result.entry).toMatchObject({ outcome: "verified", traceKind: "payload-match" });
    expect(result.number).toMatchObject({ value: -7_604, verified: true });
  });

  it("retains legacy base-unit registry matching and its omitted-currency behavior", async () => {
    const result = await registryNumber(197e9, "currency", null);
    expect(result.entry).toMatchObject({ outcome: "verified", traceKind: "payload-match" });
    expect(result.number).toMatchObject({ value: 197e9, currency: "USD", verified: true });
  });
});
