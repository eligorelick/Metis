import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { dataOnlyReasonClause } from "@/pipeline/stageC/dataOnlyReport";
import { NO_KEY_MODEL_LABEL, NO_KEY_SKIP_REASON } from "@/pipeline/jobRunner";
import { sanitizeLegacyEntityConflicts } from "@/report/legacyEntitySafety";
import { ReportSchema, LEGACY_UNNAMED_PRODUCT_LINE_HEADING, UNNAMED_PRODUCT_LINE_HEADING, productLineNamedInClaims, type Report } from "@/report/schema";
import { operatingMarginRefusal } from "@/edgar/revenueAdmission";
import { isQuarterlyTrendNote } from "@/report/filingDisclosurePresentation";
import { foreignResultsNote, isForeignAnnualForm, isNoResultsEightKNote, noResultsEightKNote } from "@/providers/currentReports";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { trailingFlowStatement } from "@/report/financialDiagnostics";
import { boundSegmentName, gateProductLineHeadings, issuerFilingNamesHeading, UNBOUND_SEGMENT_NAME } from "@/pipeline/stageC/passes";
import { resolveConsolidatedEquity } from "@/pipeline/stageB/ownership";
import type { DataBundle } from "@/pipeline/types";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const ROOT = process.cwd();

function demoReport(): Report {
  return ReportSchema.parse(JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures", "report", "DEMO-sample.json"), "utf8")));
}

describe("D-296 (R28): no configuration names or decision ids in reader prose", () => {
  it("says in plain words that no AI analysis ran, and reads as a clause inside a sentence", () => {
    expect(NO_KEY_SKIP_REASON).not.toMatch(/ANTHROPIC|API_KEY|_/);
    expect(NO_KEY_MODEL_LABEL).not.toMatch(/ANTHROPIC|API_KEY/);
    expect(`(${dataOnlyReasonClause(NO_KEY_SKIP_REASON)})`).toBe("(this report was built without an AI connection, so no AI analysis ran)");
    // Control: an acronym-led reason keeps its capitals; only the closing stop is dropped.
    expect(dataOnlyReasonClause("LLM analysis could not complete; this is a data-only report.")).toBe("LLM analysis could not complete; this is a data-only report");
    expect(dataOnlyReasonClause("AI is off or the selected connection needs sign-in")).toBe("AI is off or the selected connection needs sign-in");
  });

  it("names the consolidated-equity basis in words, for every equity shape", () => {
    expect(resolveConsolidatedEquity({ totalEquity: 10 }).basis).toBe("total equity");
    expect(resolveConsolidatedEquity({ totalStockholdersEquity: 8, minorityInterest: 2 }).basis).toBe("parent stockholders' equity + noncontrolling interest");
    expect(resolveConsolidatedEquity({ totalStockholdersEquity: 8 }).basis).toBe("parent stockholders' equity (NCI undisclosed)");
    expect(resolveConsolidatedEquity({}).basis).toBe("unavailable");
  });

  /**
   * Source scan, like the retired-settings scan: a string literal in src that
   * reaches a report, export or manifest names the rule in words; decision ids
   * belong to comments and the decision log. The only exceptions are exact
   * lines: judge-prompt text (not reader text) and the read-time rewrite that
   * removes an id from stored reports.
   */
  const ALLOWED: Readonly<Record<string, readonly string[]>> = {
    "src/pipeline/stageC/payload.ts": ["Consensus anchoring (D-65)", "Consensus anchoring (D-65)", "Reverse-DCF context (D-60, D136)"],
    "src/report/presentation.ts": ["WS6 D-18"],
  };
  function sourceFiles(directory: string): string[] {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.(?:ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  }
  it("finds no decision id inside a string literal outside the allowed lines", () => {
    const offenders: string[] = [];
    for (const full of sourceFiles(path.join(ROOT, "src"))) {
      const file = path.relative(ROOT, full).split(path.sep).join("/");
      if (file.startsWith("src/pipeline/stageC/prompts")) continue;
      const allowed = [...(ALLOWED[file] ?? [])];
      fs.readFileSync(full, "utf8").split(/\r?\n/).forEach((line, index) => {
        const code = line.trim();
        if (/^(?:\/\/|\*|\/\*)/.test(code)) return;
        // A literal: text after an opening quote or backtick on this line.
        const literal = /["'`][^"'`]*\bD-\d{1,3}\b/.exec(code.replace(/\/\/.*$/, ""));
        if (literal === null) return;
        const hit = allowed.findIndex((fragment) => code.includes(fragment));
        if (hit >= 0) { allowed.splice(hit, 1); return; }
        offenders.push(`${file}:${index + 1}: ${code.slice(0, 160)}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe("D-297 (R30): a withheld figure without a citation is a gap, not a legacy citation", () => {
  it("leaves a null-valued, reasoned, source-less record alone", () => {
    const report = demoReport();
    const gap = { value: null, dividends: null, start: null, end: "2023-12-31", source: "", asOf: null, currency: null,
      reason: "Exact matching filed fiscal-year windows for common dividends and common income are not established." };
    (report.business as unknown as Record<string, unknown>).probe = [gap];
    const safe = sanitizeLegacyEntityConflicts(report, { symbol: "DEMO", records: [] }).report;
    expect((safe.business as unknown as { probe: unknown[] }).probe[0]).toEqual(gap);
    expect(safe.appendix.missingData.some((entry) => entry.field === "legacy.citationValidation")).toBe(false);
  });

  it("still marks an empty citation on a statement or a valued figure", () => {
    const report = demoReport();
    const claim = report.verdict.gradeStrip.valuation.reasoning[0]!;
    delete claim.sourceId;
    claim.source = "";
    (report.business as unknown as Record<string, unknown>).probe = [{ value: 12, source: "", asOf: null, reason: "computed" }];
    const safe = sanitizeLegacyEntityConflicts(report, { symbol: "DEMO", records: [] }).report;
    expect(safe.verdict.gradeStrip.valuation.reasoning[0]!.source).toBe("unsupported:legacy-citation");
    expect((safe.business as unknown as { probe: { source: string }[] }).probe[0]!.source).toBe("unsupported:legacy-citation");
    expect(safe.appendix.missingData).toContainEqual(expect.objectContaining({ field: "legacy.citationValidation" }));
  });
});

describe("D-297 (R31): a withheld operating margin names its period and sits with the trend", () => {
  it("dates the refusal for a quarter and for an annual row; an undated row stays undated", () => {
    const quarter = operatingMarginRefusal({ date: "2024-12-31", fieldProvenance: undefined });
    expect(quarter).toMatch(/^Operating margin for 2024-12-31 withheld: the provider operating result has no corroborated bridge/);
    expect(isQuarterlyTrendNote(quarter)).toBe(true);
    const filedBasis = operatingMarginRefusal({ date: "2019-06-29", fieldProvenance: { operatingIncome: {} } as never });
    expect(filedBasis).toMatch(/^Operating margin for 2019-06-29 withheld: revenue uses a different filing basis/);
    expect(operatingMarginRefusal({ date: "", fieldProvenance: undefined })).toMatch(/^Operating margin withheld: /);
    // Control: an unrelated note is not a trend note.
    expect(isQuarterlyTrendNote("Operating margin is shown on the filed basis.")).toBe(false);
  });
});

describe("D-298 (R33): a 20-F/40-F filer is told what is missing in its own terms", () => {
  const withReports = (form: string): DataBundle => {
    const bundle = completeCurrencyBundle({});
    (bundle as { edgar?: unknown }).edgar = {
      ...(bundle.edgar ?? {}),
      latestTenK: { ok: true, value: { asOf: "2025-12-31", data: { form, filingDate: "2026-03-01", accessionNumber: "0000000000-26-000001" }, endpoint: "x", fetchedAt: "2026-03-02T00:00:00Z", source: "edgar" } },
      currentReports: { ok: true, value: { asOf: "2026-03-02", data: { version: "current-reports-1.4.0", releases: [], events: [], notes: [noResultsEightKNote(400)] }, endpoint: "x", fetchedAt: "2026-03-02T00:00:00Z", source: "edgar" } },
    };
    return bundle;
  };
  it("recognises the owner's domestic note and replaces it for a foreign annual filer", () => {
    expect(isNoResultsEightKNote(noResultsEightKNote(400))).toBe(true);
    expect(isNoResultsEightKNote("no Item 2.02 (results) 8-K among the filings of the last 365 days")).toBe(true);
    expect(isForeignAnnualForm("20-F") && isForeignAnnualForm("40-F") && !isForeignAnnualForm("10-K")).toBe(true);
    for (const form of ["20-F", "40-F"]) {
      const notes = buildFilingDisclosures(withReports(form))?.notes ?? [];
      expect(notes).toContain(foreignResultsNote(form));
      expect(notes.some(isNoResultsEightKNote)).toBe(false);
    }
  });
  it("keeps the domestic note for a 10-K filer (control)", () => {
    const notes = buildFilingDisclosures(withReports("10-K"))?.notes ?? [];
    expect(notes).toContain(noResultsEightKNote(400));
    expect(notes.some(note => note.includes("6-K"))).toBe(false);
  });
});

describe("D-298 (R34): the TTM basis states which flows are admitted", () => {
  const bridge = (ocf: number | null, capex: number | null) => ({ operatingCashFlow: ocf, cashCapitalExpenditure: capex }) as never;
  it("keeps the complete-flows sentence only when every flow is present (control)", () => {
    expect(trailingFlowStatement({ netIncome: 5, ebitda: 9, cashBridge: bridge(7, -2) })).toBe(
      "Complete TTM flows are used with the corresponding current balance; annual historical series remain separately labeled.");
  });
  it("names a withheld consolidated earnings denominator (foreign or multi-scope shape)", () => {
    const text = trailingFlowStatement({ netIncome: null, ebitda: 9, cashBridge: bridge(7, -2) });
    expect(text).not.toMatch(/^Complete/);
    expect(text).toContain("TTM operating cash flow, cash capital expenditure and EBITDA are used with the corresponding current balance");
    expect(text).toContain("TTM consolidated net income is not established for this window, so the figures built on it are withheld");
  });
  it("names withheld cash capex (REIT or pre-revenue shape)", () => {
    const text = trailingFlowStatement({ netIncome: 5, ebitda: null, cashBridge: bridge(7, null) });
    expect(text).toContain("TTM cash capital expenditure and EBITDA are not established for this window, so the figures built on them are withheld");
  });
});

describe("D-299 (R37): product-line headings", () => {
  const fact = (text: string, source: string) => ({ text, label: "FACT" as const, source, asOf: "2026-06-30" });
  it("admits a proper name an issuer filing excerpt writes", () => {
    const item = { productLine: "Zelvora", claims: [fact("The 10-Q states the company launched Zelvora in the second quarter.", "edgar:10-Q item2")] };
    expect(issuerFilingNamesHeading(item)).toBe(true);
    expect(gateProductLineHeadings([item], new Set())![0]!.productLine).toBe("Zelvora");
    const multi = { productLine: "Advanced Packaging Services", claims: [fact("Advanced Packaging Services grew with demand.", "edgar:20-F item4")] };
    expect(issuerFilingNamesHeading(multi)).toBe(true);
  });
  it("refuses a sentence, a web-only naming claim and an unnamed heading (controls)", () => {
    const sentence = { productLine: "Verandol dominates the market", claims: [fact("No reviewed source establishes that Verandol dominates the market.", "edgar:10-K item1")] };
    expect(issuerFilingNamesHeading(sentence)).toBe(false);
    const web = { productLine: "Zelvora", claims: [fact("Zelvora launched.", "https://news.example.com/zelvora")] };
    expect(issuerFilingNamesHeading(web)).toBe(false);
    expect(gateProductLineHeadings([web], new Set())![0]!.productLine).toBe(UNNAMED_PRODUCT_LINE_HEADING);
    const copied = { productLine: LEGACY_UNNAMED_PRODUCT_LINE_HEADING, claims: [fact(`${LEGACY_UNNAMED_PRODUCT_LINE_HEADING} rose.`, "edgar:10-K item1")] };
    expect(issuerFilingNamesHeading(copied)).toBe(false);
    expect(productLineNamedInClaims(copied)).toBe(false);
  });
  it("uses a neutral fallback heading", () => {
    expect(UNNAMED_PRODUCT_LINE_HEADING).toBe("Product line");
  });
});

describe("D-299 (R38): a segment row's name is the record's own", () => {
  const record = (data: Record<string, number>, date = "2025-12-31", currency = "USD") =>
    ({ ok: true, value: { source: "fmp", endpoint: "x", asOf: date, fetchedAt: "x", data: { rows: [{ date, reportedCurrency: currency, data }] } } }) as never;
  it("binds the name of the one entry whose amount is the row's revenue", () => {
    const res = record({ "Cloud Services": 1_200_000_000, Devices: 300_000_000 });
    expect(boundSegmentName({ name: "Cloud computing powerhouse", revenue: { value: 1_200_000_000, period: "2025-12-31", currency: "USD" } }, res)).toBe("Cloud Services");
    expect(boundSegmentName({ name: "Devices", revenue: { value: 300_000_000.0001, period: null, currency: null } }, res)).toBe("Devices");
  });
  it("binds a quarterly row to the filed segment table's member label for that quarter", () => {
    const filed = { ok: true, value: { data: { axes: [{ axis: "srt:StatementGeographicalAxis", axisLabel: "Geography", currency: "USD",
      quarters: [{ start: "2026-04-27", end: "2026-07-26" }, { start: "2026-01-26", end: "2026-04-26" }],
      rows: [{ member: "country:US", label: "United States", values: [600, 500], childOf: null }, { member: "x:OtherMember", label: "Other", values: [12, 600], childOf: null }],
      total: [612, 1100], priorPresentation: [], derivedCells: 0, residualCells: 0 }] } } } as never;
    const empty = record({});
    expect(boundSegmentName({ name: "US region", revenue: { value: 600, period: "2026-07-26", currency: "USD" } }, empty, filed)).toBe("United States (quarter ended 2026-07-26)");
    expect(boundSegmentName({ name: "Other", revenue: { value: 600, period: "2026-04-26", currency: "USD" } }, empty, filed)).toBe("Other (quarter ended 2026-04-26)");
    // Controls: a quarter the table does not hold, another currency, or no period.
    expect(boundSegmentName({ name: "US", revenue: { value: 600, period: "2026-10-25", currency: "USD" } }, empty, filed)).toBe(UNBOUND_SEGMENT_NAME);
    expect(boundSegmentName({ name: "US", revenue: { value: 600, period: "2026-07-26", currency: "EUR" } }, empty, filed)).toBe(UNBOUND_SEGMENT_NAME);
    expect(boundSegmentName({ name: "US", revenue: { value: 600 } }, empty, filed)).toBe(UNBOUND_SEGMENT_NAME);
  });
  it("withholds the name with no single matching entry, another period or another currency (controls)", () => {
    const tie = record({ North: 50, South: 50 });
    expect(boundSegmentName({ name: "North", revenue: { value: 50 } }, tie)).toBe(UNBOUND_SEGMENT_NAME);
    const res = record({ Wafers: 900 });
    expect(boundSegmentName({ name: "Wafers", revenue: { value: 800 } }, res)).toBe(UNBOUND_SEGMENT_NAME);
    expect(boundSegmentName({ name: "Wafers", revenue: { value: 900, period: "2024-12-31" } }, res)).toBe(UNBOUND_SEGMENT_NAME);
    expect(boundSegmentName({ name: "Wafers", revenue: { value: 900, currency: "TWD" } }, res)).toBe(UNBOUND_SEGMENT_NAME);
    expect(boundSegmentName({ name: "Wafers", revenue: { value: 900 } }, undefined)).toBe(UNBOUND_SEGMENT_NAME);
  });
});
