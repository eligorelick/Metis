import { readFileSync } from "node:fs";
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

describe("AI-403 table scale applies to amounts only", () => {
  const filing = "edgar:10-K item7";
  /** One filing excerpt run through the verify pass; the judge is never called. */
  async function synthetic(sourceText: string, claim: string, title = "10-K Item 7 — MD&A (reporting period ended 2026-01-25 (FY2026); filed 2026-02-25)", registered = filing, asOfDate = "2026-01-25") {
    const payload = {
      companyName: "Example issuer", symbol: "EXAMPLE",
      // One statements record gives the filing its reporting currency (USD).
      provenanceRegistry: [{ id: "payload.statements.income.revenue", kind: "provider", value: 1, unit: "currency",
        currency: "USD", period: asOfDate, asOf: asOfDate, origin: "edgar", formulaVersion: null, displayPrecision: 0 }],
      citationRegistry: [{ id: registered, asOf: asOfDate, origin: registered, kind: "payload-text" }],
      filings: [{ source: registered, asOf: asOfDate, text: sourceText, title, truncated: false, originalChars: sourceText.length }],
    } as unknown as ContextPayload;
    const result = await runVerifyPass({ runPass: () => { throw new Error("no judge in a verify test"); } } as unknown as PassDeps, payload,
      { commentary: [{ label: "FACT", text: claim, source: registered, asOf: asOfDate }] });
    return result.log[0]!.validationStatus;
  }
  const TAX = (decl: string) => `Year Ended Jan 25, 2026 Jan 26, 2025 ${decl}Income before income tax 140,000 85,000 Effective tax rate 15.1 % 13.3 % Other matters follow.`;

  it.each(["(In millions) ", "($ in millions) ", "($ in millions, except per share data) "])("a percent row is not scaled under %j", async (decl) => {
    expect(await synthetic(TAX(decl), "Effective tax rate as of 2026-01-25 was 15.1%.")).toBe("validated");
  });

  it("does not contradict the NVDA summary gross-margin row", async () => {
    const text = "Fiscal Year 2026 Summary Year Ended Jan 25, 2026 Jan 26, 2025 Change ($ in millions, except per share data) Revenue $ 215,938 $ 130,497 Up 65% Gross margin 71.1 % 75.0 % -3.9 pts Operating expenses $ 23,076 $ 16,405 Up 41% Other matters follow.";
    expect(await synthetic(text, "Gross margin for FY2026 was 71.1%.")).not.toBe("contradicted");
  });

  describe("Note 3 per-share table", () => {
    const full = readFileSync("fixtures/edgar/nvda-periodic-sections/nvda-10q-q2fy27-notes.txt", "utf8");
    const from = full.indexOf("Note 3 - Net Income Per Share");
    const endMark = "(2) Net income divided by diluted weighted average shares.";
    const note = full.slice(from, full.indexOf(endMark) + endMark.length);
    const run = (claim: string) => synthetic(note, claim, "10-Q notes", "edgar:10-Q notes", "2026-07-26");
    it.each([
      ["integer money cell is still scaled (control)", "Net income for the three months ended July 26, 2026 was USD 59,688 million.", "validated"],
      ["the Basic per-share cell is not scaled", "Basic net income per share for the three months ended July 26, 2026 was USD 2.47.", "validated"],
    ] as const)("%s", async (_name, claim, status) => {
      expect(await run(claim)).toBe(status);
    });
    it.each([
      "Basic net income per share for the three months ended July 26, 2026 was USD 2.47 million.",
    ])("a per-share cell is never read as millions: %s", async (claim) => {
      expect(await run(claim)).not.toBe("validated");
    });
    it.each([
      "Diluted net income per share for the three months ended July 26, 2026 was USD 2.46.",
      "Basic weighted average shares for the three months ended July 26, 2026 were 24,190 million shares.",
    ])("control, not contradicted: %s", async (claim) => {
      expect(await run(claim)).not.toBe("contradicted");
    });
  });

  describe("billions declaration", () => {
    const text = "Year Ended Jan 25, 2026 Jan 26, 2025 ($ in billions, except per share data) Revenue $ 216.0 $ 130.5 Diluted EPS $ 4.90 $ 2.94 Other matters follow.";
    it("a decimal amount row is still scaled (control)", async () => {
      expect(await synthetic(text, "Revenue as of 2026-01-25 was USD 216.0 billion.")).toBe("validated");
    });
    it.each([
      ["Diluted EPS as of 2026-01-25 was USD 4.90 billion.", (s: string) => expect(s).not.toBe("validated")],
      ["Diluted EPS as of 2026-01-25 was USD 4.90.", (s: string) => expect(s).not.toBe("contradicted")],
    ] as const)("a per-share row keeps its dollars: %s", async (claim, check) => {
      check((await synthetic(text, claim)) as string);
    });
  });

  describe("a per-share claim never validates against a row that is not per-share (review round 1)", () => {
    // Each row is the first row under the declaration, whose text must not supply metric words to it.
    const under = (row: string) => `Year Ended Jan 25, 2026 Jan 26, 2025 ($ in millions, except per share data) ${row} Other matters follow.`;
    it.each([
      [under("Net income $ 59.7 $ 41.2"), "Net income per share as of 2026-01-25 was USD 59.7."],
      [under("Revenue $ 1,234.5 $ 900.1"), "Revenue per share as of 2026-01-25 was USD 1,234.5."],
      [under("Weighted average shares 1,234.5 1,200.4"), "Weighted average shares per share as of 2026-01-25 was USD 1,234.5."],
    ])("not validated: %#", async (table, claim) => {
      expect(await synthetic(table, claim)).not.toBe("validated");
    });
    it("a row that names its own per-share basis still validates (control)", async () => {
      const text = "Year Ended Jan 25, 2026 Jan 26, 2025 ($ in millions, except per share data) Net income $ 59,688 $ 41,000 Net income per share: Basic $ 2.47 $ 1.68 Other matters follow.";
      expect(await synthetic(text, "Basic net income per share as of 2026-01-25 was USD 2.47.")).toBe("validated");
    });
  });

  describe("controls that hold before and after", () => {
    it("no declaration", async () => {
      expect(await synthetic(TAX(""), "Effective tax rate as of 2026-01-25 was 15.1%.")).toBe("validated");
    });
    it("an amount under (In millions) is scaled", async () => {
      expect(await synthetic(TAX("($ in millions) "), "Income before income tax as of 2026-01-25 was USD 140.0 billion.")).toBe("validated");
    });
    it("a percent is not read as a scaled million", async () => {
      expect(await synthetic(TAX("($ in millions) "), "Gross margin as of 2025-01-26 was 75,000,000%.")).not.toBe("validated");
    });
  });
});
