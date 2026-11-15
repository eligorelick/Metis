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
import { boundSegmentName, bundleSegmentNameKeys, gateProductLineHeadings, UNBOUND_SEGMENT_NAME } from "@/pipeline/stageC/passes";
import { segmentRecordCitations, type SegmentRecordCitation } from "@/pipeline/stageC/payload";
import { resolveConsolidatedEquity } from "@/pipeline/stageB/ownership";
import { withoutMemberMarker } from "@/edgar/segmentFacts";
import type { DataBundle } from "@/pipeline/types";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { retiredReaderWording, withRetiredReaderWording } from "@/report/retiredReaderWording";
import { withStoredReportView } from "@/report/storedReportView";
import { runStageB } from "@/pipeline/compute";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import type { ContextPayload } from "@/pipeline/stageC/payload";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";

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

describe("D-298 (R34): the TTM basis names exactly which flows are admitted and withheld", () => {
  const bridge = (ocf: number | null, capex: number | null, sbc: number | null = 1) => ({ operatingCashFlow: ocf, cashCapitalExpenditure: capex, stockBasedCompensation: sbc }) as never;
  it("lists every admitted flow and never claims completeness (control: all present)", () => {
    const text = trailingFlowStatement({ netIncome: 5, ebitda: 9, cashBridge: bridge(7, -2) });
    expect(text).toBe("TTM flows admitted for this window: operating cash flow, cash capital expenditure, consolidated net income, EBITDA and stock-based compensation. Annual historical series remain separately labeled.");
    expect(text).not.toMatch(/Complete|complete/);
  });
  it("names a missing SBC add-back and the SBC figures it withholds (utility, railroad or retailer shape)", () => {
    expect(trailingFlowStatement({ netIncome: 5, ebitda: 9, cashBridge: bridge(7, -2, null) })).toBe(
      "TTM flows admitted for this window: operating cash flow, cash capital expenditure, consolidated net income and EBITDA. " +
      "Not established for this window: stock-based compensation, so FCF after SBC and SBC share of FCF are withheld. Annual historical series remain separately labeled.");
  });
  it("names a withheld consolidated earnings denominator (foreign or multi-scope shape)", () => {
    expect(trailingFlowStatement({ netIncome: null, ebitda: 9, cashBridge: bridge(7, -2) })).toContain(
      "Not established for this window: consolidated net income, so FCF conversion is withheld.");
  });
  it("names withheld cash capex and EBITDA (REIT or pre-revenue shape)", () => {
    expect(trailingFlowStatement({ netIncome: 5, ebitda: null, cashBridge: bridge(7, null) })).toContain(
      "Not established for this window: cash capital expenditure and EBITDA, so FCF, FCF after SBC, SBC share of FCF, FCF conversion and net debt / EBITDA are withheld.");
  });
});

describe("D-299 (R37): product-line headings stand only on code-owned names", () => {
  const fact = (text: string, source = "edgar:10-K item1") => ({ text, label: "FACT" as const, source, asOf: "2026-02-20" });
  // Review round 1 repros: an issuer-filing citation alone never makes model text a heading.
  it.each([
    ["Verandol Dominates The Market", "No reviewed source establishes that Verandol Dominates The Market."],
    ["Invented Franchise", "Invented Franchise treats migraine."],
    ["Competitor Brand", "The company competes against Competitor Brand."],
  ])("refuses %s, named only by a cited claim", (heading, text) => {
    expect(gateProductLineHeadings([{ productLine: heading, claims: [fact(text)] }], new Set())![0]!.productLine).toBe(UNNAMED_PRODUCT_LINE_HEADING);
  });
  it("keeps a heading that is a code-owned segment or filed member name (control)", () => {
    const names = bundleSegmentNameKeys({ segmentation: {
      product: { ok: true, value: { data: { rows: [{ date: "2025-12-31", data: { Zelvora: 10 } }] } } },
      geographic: { ok: false },
    } } as unknown as Parameters<typeof bundleSegmentNameKeys>[0]);
    expect(gateProductLineHeadings([{ productLine: "Zelvora", claims: [fact("Zelvora grew.")] }], names)![0]!.productLine).toBe("Zelvora");
  });
  it("uses a neutral fallback heading; the earlier placeholder is never a name", () => {
    expect(UNNAMED_PRODUCT_LINE_HEADING).toBe("Product line");
    const copied = { productLine: LEGACY_UNNAMED_PRODUCT_LINE_HEADING, claims: [fact(`${LEGACY_UNNAMED_PRODUCT_LINE_HEADING} rose.`)] };
    expect(productLineNamedInClaims(copied)).toBe(false);
  });
});

describe("D-299 (R38): a segment row's name comes from the record it cites", () => {
  const record = (over: Partial<SegmentRecordCitation> = {}): SegmentRecordCitation => ({ id: "payload.segments.product-cloud-services",
    kind: "product", name: "Cloud Services", value: 1_200_000_000, unit: "currency", currency: "USD", period: "2025-12-31", ...over });
  const row = (revenue: Record<string, unknown>) => ({ name: "Cloud computing powerhouse",
    revenue: { value: 1_200_000_000, unit: "currency", currency: "USD", asOf: "2025-12-31", source: "payload.segments.product-cloud-services", ...revenue } as never });
  it("binds the cited record's own name when its date, currency, unit and amount agree", () => {
    expect(boundSegmentName(row({}), [record()], "product")).toBe("Cloud Services");
    expect(boundSegmentName(row({ period: "2025-12-31", asOf: "2026-02-01", value: 1_200_000_000.0001 }), [record()], "product")).toBe("Cloud Services");
    const quarter = record({ id: "payload.segment-revenue.geography-united-states-revenue-quarter-ended-2026-07-26", kind: "geographic",
      name: "United States (quarter ended 2026-07-26)", value: 600, period: "2026-07-26" });
    expect(boundSegmentName(row({ value: 600, period: "2026-07-26", source: quarter.id }), [quarter], "geographic")).toBe("United States (quarter ended 2026-07-26)");
  });
  it("withholds the name unless the cited record establishes it (review round 1 repros and controls)", () => {
    const records = [record()];
    // An amount that matches some record, but the row cites another source.
    expect(boundSegmentName(row({ source: "edgar:unrelated-revenue" }), records, "product")).toBe(UNBOUND_SEGMENT_NAME);
    expect(boundSegmentName(row({ source: "fmp:other-record", period: "2025-12-31" }), records, "product")).toBe(UNBOUND_SEGMENT_NAME);
    // No stated date or currency, another date, currency, unit or amount, or another kind of axis.
    expect(boundSegmentName(row({ asOf: null, period: null }), records, "product")).toBe(UNBOUND_SEGMENT_NAME);
    expect(boundSegmentName(row({ currency: null }), records, "product")).toBe(UNBOUND_SEGMENT_NAME);
    expect(boundSegmentName(row({ period: "2024-12-31" }), records, "product")).toBe(UNBOUND_SEGMENT_NAME);
    expect(boundSegmentName(row({ currency: "EUR" }), records, "product")).toBe(UNBOUND_SEGMENT_NAME);
    expect(boundSegmentName(row({ unit: "%" }), records, "product")).toBe(UNBOUND_SEGMENT_NAME);
    expect(boundSegmentName(row({ value: 1_200 }), records, "product")).toBe(UNBOUND_SEGMENT_NAME);
    expect(boundSegmentName(row({}), records, "geographic")).toBe(UNBOUND_SEGMENT_NAME);
    expect(boundSegmentName(row({}), [], "product")).toBe(UNBOUND_SEGMENT_NAME);
  });
  it("lists each segment record under the payload's own citation id, leaving out a duplicated id", () => {
    const bundle = completeCurrencyBundle({});
    (bundle as { segmentation: unknown }).segmentation = {
      product: { ok: true, value: { source: "fmp", endpoint: "x", asOf: "2025-12-31", fetchedAt: "x", data: { rows: [{ date: "2025-12-31", reportedCurrency: "USD", data: { "Wafer [member]": 900, "Cloud-Services": 5, "Cloud Services": 6 } }] } } },
      geographic: { ok: false, gap: { field: "g", reason: "none", severity: "info" } },
    };
    const ids = segmentRecordCitations(bundle).filter(r => r.kind === "product").map(r => [r.id, r.name]);
    expect(ids).toEqual([["payload.segments.product-wafer-member", "Wafer"]]);
  });
});

describe("D-299 (R32): the trailing XBRL [Member] marker is label syntax", () => {
  it("strips the whole trailing marker in any case, keeping the filer's own label", () => {
    expect(withoutMemberMarker("Wafer [member]")).toBe("Wafer");
    expect(withoutMemberMarker("Europe Middle East and Africa [Member]")).toBe("Europe Middle East and Africa");
    expect(withoutMemberMarker("Other Products  [MEMBER] ")).toBe("Other Products");
  });
  it("leaves other text alone (controls)", () => {
    expect(withoutMemberMarker("Membership fees")).toBe("Membership fees");
    expect(withoutMemberMarker("Member services [member] plan")).toBe("Member services [member] plan");
    expect(withoutMemberMarker("[member]")).toBe("[member]");
    expect(withoutMemberMarker("Data Center")).toBe("Data Center");
  });

  // A stored payload keeps the provider's label ("product: Wafer [member]") and its id; the printed row name is the
  // marker-free label, so the verifier reads a segment record's label both ways.
  const segment = (label: string, id: string): NumericProvenanceRecord => ({
    id, label, kind: "provider", value: 1_000_000, unit: "currency", currency: "USD",
    period: null, asOf: "2025-12-31", origin: "payload", formulaVersion: "test", displayPrecision: 4,
  } as NumericProvenanceRecord);
  async function verifyRow(rec: NumericProvenanceRecord, name: string) {
    const n = { value: rec.value, unit: "currency", currency: "USD", source: rec.id, sourceId: rec.id, asOf: rec.asOf, verified: false };
    const result = await runVerifyPass({ runPass: async () => { throw new Error("no model"); } } as unknown as PassDeps,
      { provenanceRegistry: [rec], citationRegistry: [], filings: [] } as unknown as ContextPayload, { row: { name, revenue: n } });
    return result.log.find((entry) => entry.evidenceKind === "number")!;
  }
  it("verifies a marker-free row name against its marked segment record", async () => {
    expect(await verifyRow(segment("product: Wafer [member]", "payload.segments.product-wafer-member"), "Wafer"))
      .toMatchObject({ outcome: "verified" });
    expect(await verifyRow(segment("geographic: Europe Middle East and Africa [member]", "payload.segments.geographic-europe-middle-east-and-africa-member"), "Europe Middle East and Africa"))
      .toMatchObject({ outcome: "verified" });
  });
  it("still refuses another segment's name, and reads a non-segment record's label as written (controls)", async () => {
    expect(await verifyRow(segment("product: Wafer [member]", "payload.segments.product-wafer-member"), "Other Products"))
      .toMatchObject({ outcome: "unverified", reason: "text-context-mismatch" });
    expect(await verifyRow(segment("product: Data Center", "payload.segments.product-data-center"), "Gaming"))
      .toMatchObject({ outcome: "unverified", reason: "text-context-mismatch" });
  });
});

describe("D-296 (R28/R39): retained historical text reads in current words; stored bytes are kept", () => {
  const RETIRED = {
    gap: "vendor longTermInvestments read as undisclosed at 2 balance dates; filled with the D-98 chain from the same-period filing, the vendor value retained in the raw row: 2017-12-31 212M.",
    reason: "ANTHROPIC_API_KEY not configured",
    model: "none (no ANTHROPIC_API_KEY)",
    netDebt: "NET_DEBT_V3: total debt 10.0B less cash 2.0B",
    basis: "price / epsDiluted",
    ebitda: "EV / (operatingIncome + D&A), house-computed — vendor ebitda field not trusted.",
    lease: "Operating leases excluded (ASC 842; D-25); set THESIS_EV_INCLUDE_LEASES=1 to include them.",
    judge: "Judge order: THESIS_JUDGE_ORDER=bear-first.",
  };

  it("rewrites each retired phrase and nothing else", () => {
    expect(retiredReaderWording(RETIRED.gap)).toBe(
      "vendor longTermInvestments read as undisclosed at 2 balance dates; filled with the filed noncurrent-investment tag chain from the same-period filing, the vendor value retained in the raw row: 2017-12-31 212M.");
    expect(retiredReaderWording(RETIRED.reason)).toBe(NO_KEY_SKIP_REASON);
    expect(retiredReaderWording(RETIRED.model)).toBe(NO_KEY_MODEL_LABEL);
    expect(retiredReaderWording(RETIRED.netDebt)).toBe("house net-debt basis: total debt 10.0B less cash 2.0B");
    expect(retiredReaderWording(RETIRED.basis)).toBe("price / diluted EPS");
    expect(retiredReaderWording(RETIRED.ebitda)).toBe("EV / (operating income + D&A), house-computed — the vendor EBITDA field is not used.");
    expect(retiredReaderWording(RETIRED.lease)).toBe("Operating leases excluded (ASC 842); set METIS_EV_INCLUDE_LEASES=1 to include them.");
    expect(retiredReaderWording(RETIRED.judge)).toBe("Judge order: METIS_JUDGE_ORDER=bear-first.");
    // Controls: current wording, a decision id outside a retired phrase, and figures pass unchanged.
    for (const text of ["price / diluted EPS", "See D-98 in the log.", "Revenue 1,234.5M (FY2024)", "house rule D-999 applies"]) {
      expect(retiredReaderWording(text)).toBe(text);
    }
  });

  it("rewrites a stored-shape report's strings only, leaves the input bytes alone, and keeps a current report unchanged", () => {
    const current = demoReport();
    expect(withRetiredReaderWording(current)).toEqual(current);
    const stored = demoReport();
    stored.appendix.missingData.push({ field: "statements.balance.longTermInvestments", reason: RETIRED.gap } as never);
    (stored.meta as unknown as Record<string, unknown>).model = RETIRED.model;
    const bytes = JSON.stringify(stored);
    const view = withStoredReportView(stored);
    expect(JSON.stringify(stored)).toBe(bytes);
    const text = JSON.stringify(view);
    expect(text).not.toContain("D-98");
    expect(text).not.toContain("ANTHROPIC_API_KEY");
    expect(view.appendix.missingData.at(-1)!.reason).toContain("the filed noncurrent-investment tag chain");
    const numbers = (value: unknown): unknown[] => typeof value === "number" ? [value]
      : Array.isArray(value) ? value.flatMap(numbers)
      : value !== null && typeof value === "object" ? Object.values(value).flatMap(numbers) : [];
    expect(numbers(withRetiredReaderWording(stored))).toEqual(numbers(stored));
    expect(numbers(stored).length).toBeGreaterThan(100);
  });

  it("reads a retained bundle's fetch-time gap reason in current words at Stage B", () => {
    const bundle = completeCurrencyBundle({});
    const retained = { ...bundle, gaps: [...bundle.gaps, { field: "statements.balance.longTermInvestments", reason: RETIRED.gap, severity: "info" as const }] } as DataBundle;
    const gaps = runStageB(retained).gaps.filter((gap) => gap.field === "statements.balance.longTermInvestments");
    expect(gaps.map((gap) => gap.reason)).toEqual([retiredReaderWording(RETIRED.gap)]);
    expect(retained.gaps.at(-1)!.reason).toBe(RETIRED.gap);
  });
});


describe("D-304 matching includes the shared reader rounding", () => {
  it.each([[12.049974,false],[12.050026,true],[-12.049974,false],[-12.050026,true],[12.05,true],[-12.05,true],[12.1,true]])("checks %s at the displayed precision (%s)", async (value,verified) => {
    const rec: NumericProvenanceRecord = {id:"computed.test.ratio",label:"ratio",kind:"computed",value:value as number,unit:"percent",currency:null,period:null,asOf:"2025-12-31",origin:"computed.test",formulaVersion:"test",displayPrecision:4};
    const n={value:Number((value as number).toFixed(2)),unit:"%",source:rec.id,asOf:rec.asOf,verified:false};
    const result=await runVerifyPass({runPass:async()=>{throw new Error("no model");}} as unknown as PassDeps,
      {provenanceRegistry:[rec],citationRegistry:[],filings:[]} as unknown as ContextPayload,{n});
    expect((result.verifiedReport as {n:typeof n}).n.verified).toBe(verified);
    expect((result.verifiedReport as {n:typeof n}).n.value).toBe(n.value);
  });
});

it("D-306 names forensic thresholds and score quantities in reader words",()=>{
  const forensic=fs.readFileSync(path.join(ROOT,"src/pipeline/stageB/forensics.ts"),"utf8");
  const rules=forensic.split("\n").filter(line=>/rule:/.test(line));
  expect(rules.join("\n")).not.toMatch(/totalOtherIncomeExpensesNet|operatingIncome|netIncomeFromDiscontinuedOperations/);
  expect(fs.readFileSync(path.join(ROOT,"src/pipeline/stageB/grading.ts"),"utf8")).not.toContain("altmanZOriginalScale driver carries");
});
