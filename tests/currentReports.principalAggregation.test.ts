import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { summarizeItem } from "@/edgar/currentReports";
import { buildMaterialEventFiling, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { runStageB } from "@/pipeline/compute";
import { assembleContextPayload, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import { parseStoredReportWithSafety } from "@/report/legacyEntitySafety";
import { reportToMarkdown, reportToAuditMarkdown } from "@/report/export/markdown";
import { reportToPrintHtml } from "@/report/export/printHtml";
import { ReportView } from "@/components/report/ReportView";
import { ReportSchema } from "@/report/schema";
import { buildDataCompleteness, deriveReportCompletenessPresentation } from "@/report/completeness";
import { principalSummaryCorrections, withPrincipalSummarySafety, withoutLegacyPrincipalAnnotation } from "@/report/principalAggregationSafety";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const RAW = readFileSync("fixtures/edgar/crwv-current-reports/8k-20260922-item-1.01.txt", "utf8");
const LEGACY = " [computed: 2 series, $4.7 billion aggregate principal amount in total]";
const item = (text: string) => ({ item: "1.01", title: "Entry into a Material Definitive Agreement", incorporates: null, text });
const SOURCE = RAW.split("\n").slice(1).join(" ").trim();

function bundleWithLegacySummary() {
  const bundle = completeCurrencyBundle({});
  const event = buildMaterialEventFiling({ accessionNumber: "0001769628-26-000432", form: "8-K", filingDate: "2026-09-22", items: "1.01" }, RAW, "https://www.sec.gov/Archives/edgar/data/1769628/000176962826000432/");
  event.sections[0]!.summary = SOURCE + LEGACY;
  bundle.edgar.currentReports = { ok: true, value: { source: "edgar", endpoint: "fixture", fetchedAt: bundle.builtAt, asOf: "2026-09-22", data: { version: CURRENT_REPORTS_VERSION, releases: [], events: [event], notes: [] } } };
  return bundle;
}

function legacyReport() {
  const report = ReportSchema.parse(JSON.parse(readFileSync("fixtures/report/DEMO-sample.json", "utf8")));
  report.meta.specVersion = "1.19.2";
  report.filingDisclosures = buildFilingDisclosures(bundleWithLegacySummary());
  report.filingDisclosures!.events[0]!.summary = SOURCE + LEGACY;
  return report;
}

describe("source-scoped principal aggregation", () => {
  it("does not add an included purchasers' option to the offering total", () => {
    const summary = summarizeItem(item(SOURCE));
    expect(summary).toContain("$4.2 billion");
    expect(summary).toContain("including $500 million");
    expect(summary).not.toContain("[computed");
  });

  it.each([
    "$2 billion aggregate principal amount of its 4.25% Notes due 2028 and $2 billion aggregate principal amount of its 4.25% Notes due 2028.",
    "$2 billion aggregate principal amount of its 4.25% Notes due 2028. The same $2 billion aggregate principal amount was issued.",
    "$4 billion aggregate principal amount of its 4.25% Notes due 2028, of which $1 billion aggregate principal amount of its 4.25% Notes due 2028 was allocated to one investor.",
    "$2 billion aggregate principal amount of Notes, plus $3 billion aggregate principal amount of unspecified debt.",
    "$2 billion aggregate principal amount of its 4.25% Notes due 2028. In a separate offering, $3 billion aggregate principal amount of its 5.25% Notes due 2033.",
    "$2 billion aggregate principal amount of its 4.25% Notes due 2028 and $3 billion aggregate principal amount of its 5.25% Notes due 2033. It also issued EUR 4 billion aggregate principal amount of its 6.25% Notes due 2034.",
    "$2 billion aggregate principal amount of its 4.25% Notes due 2028 and $3 billion aggregate principal amount of its 5.25% Notes due 2033. It also issued 4 billion aggregate principal amount of its 6.25% Notes due 2034.",
    "$2 billion aggregate principal amount of its 4.25% Notes due 2028 and $3 billion aggregate principal amount of its 5.25% Notes due 2033. It also issued EUR 4 billion in aggregate principal amounts of its 6.25% Notes due 2034.",
  ])("withholds an aggregate when mention scope is not proven disjoint: %s", (text) => {
    expect(summarizeItem(item(`On June 18, 2026, Acme issued ${text}`))).not.toContain("[computed");
  });

  it("retains equal-valued disjoint named tranches rather than deduplicating dollar values", () => {
    const text = "On June 18, 2026, Acme issued $2 billion aggregate principal amount of its 4.25% Notes due 2028 and $2 billion aggregate principal amount of its 5.25% Notes due 2033.";
    expect(summarizeItem(item(text))).toMatch(/\[computed from 2 distinct named issuance tranches: \$4\.0 billion principal sum\]$/);
  });

  it("admits the actual retained NVDA seven-tranche section while ignoring unrelated legal boilerplate", () => {
    // NVDA 8-K 0001193125-26-275783, Item 8.01, snapshot 6e1f43a73b4d8af967160b3f4ea378b3d6896599179683fa68ef42bf3ae0008d.
    const text = readFileSync("fixtures/edgar/nvda-current-reports/8k-20260618-item-8.01.txt", "utf8").trimEnd();
    expect(text).toHaveLength(3047);
    expect(createHash("sha256").update(text).digest("hex")).toBe("c60a2a61539ffa12c5b6c9ae6e598e3c5bb9957f5dd0c0a1fe749d53a239340e");
    expect(text).toContain("including debt securities");
    const summary = summarizeItem({ ...item(text), item: "8.01", title: "Other Events" });
    expect(summary).toMatch(/\[computed from 7 distinct named issuance tranches: \$25\.0 billion principal sum\]$/);
    expect(summary.length).toBeLessThanOrEqual(600);
  });

  it.each(["has not completed its offering of", "withdrew its previously announced offering and has not issued", "cancelled its planned issuance of", "never issued"])("withholds financing totals for a negated or withdrawn transaction (%s)", (status) => {
    const text = `On June 18, 2026, Acme ${status} $2 billion aggregate principal amount of its 4.25% Notes due 2028 and $3 billion aggregate principal amount of its 5.25% Notes due 2033.`;
    expect(summarizeItem(item(text))).not.toContain("[computed");
  });
  it.each(["exchange", "repurchase", "redemption"])("does not describe a completed %s as additive issuance", (role) => {
    expect(summarizeItem(item(`On June 18, 2026, Acme completed the ${role} of $2 billion aggregate principal amount of its 4.25% Notes due 2028 and $3 billion aggregate principal amount of its 5.25% Notes due 2033.`))).not.toContain("[computed");
  });

  it("re-derives a cached unsafe summary from retained text without mutating the bundle", () => {
    const bundle = bundleWithLegacySummary();
    const before = structuredClone(bundle);
    const disclosure = buildFilingDisclosures(bundle)!;
    expect(disclosure.events[0]!.summary).not.toContain("$4.7 billion");
    expect(disclosure.events[0]!.summary).toContain("including $500 million");
    expect(bundle).toEqual(before);
    expect(disclosure.notes).toEqual(buildFilingDisclosures(completeCurrencyBundle({}))!.notes);
  });

  it("does not put cached summary corrections into the serialized analyst payload", () => {
    const bundle = bundleWithLegacySummary();
    const computed = runStageB(bundle);
    const validation = { checks: [], flags: [], gaps: [] };
    const before = serializePayloadForPrompt(assembleContextPayload(bundle, computed, validation));
    if (!bundle.edgar.currentReports?.ok) throw new Error("Missing fixture current reports");
    bundle.edgar.currentReports.value.data.events[0]!.sections[0]!.summary = SOURCE;
    const after = serializePayloadForPrompt(assembleContextPayload(bundle, computed, validation));
    expect(after).toBe(before);
    expect(after).not.toContain("$4.7 billion");
    expect(after).toContain("$4.2 billion");
  });
});

describe("legacy principal annotations on report views", () => {
  it("keeps a complete report complete when disclosing a presentation-only correction", () => {
    const report = legacyReport();
    report.appendix.missingData = [];
    report.meta.dataCompleteness = buildDataCompleteness([]);
    const before = deriveReportCompletenessPresentation(report.meta.dataCompleteness, report.appendix.missingData);
    const corrected = withPrincipalSummarySafety(report);
    const after = deriveReportCompletenessPresentation(corrected.meta.dataCompleteness, corrected.appendix.missingData);
    expect(after.metadataStatus).toBe(before.metadataStatus);
    expect(after.state).toBe(before.state);
    expect(after.actionableGapCount).toBe(before.actionableGapCount);
    expect(after.classification).toEqual(before.classification);
    expect(buildDataCompleteness(corrected.appendix.missingData)).toEqual(report.meta.dataCompleteness);
    expect(corrected.meta).toEqual(report.meta);
  });
  it("leaves ordinary issuer/analyst text and newly scoped calculation labels intact", () => {
    const text = "The aggregate principal amount was $4.7 billion. [computed: an unrelated note] [computed from 2 distinct named issuance tranches: $4.0 billion principal sum]";
    expect(withoutLegacyPrincipalAnnotation(text)).toBe(text);
    const report = legacyReport();
    report.filingDisclosures = undefined;
    expect(principalSummaryCorrections(report)).toEqual([]);
    expect(withPrincipalSummarySafety(report)).toBe(report);
  });

  it("discloses source-summary re-derivation without changing numeric, analyst or metadata fields", () => {
    const report = legacyReport();
    report.filingDisclosures = buildFilingDisclosures(bundleWithLegacySummary());
    const before = structuredClone(report);
    const corrected = withPrincipalSummarySafety(report);
    expect(corrected.filingDisclosures).toEqual(report.filingDisclosures);
    expect(corrected.meta).toEqual(report.meta);
    expect(corrected.scores).toEqual(report.scores);
    expect(corrected.fundamentals).toEqual(report.fundamentals);
    expect(corrected.verdict).toEqual(report.verdict);
    expect(corrected.appendix.missingData.filter((g) => g.field === "presentation.principalAggregation")).toHaveLength(1);
    expect(withPrincipalSummarySafety(corrected)).toBe(corrected);
    expect(report).toEqual(before);
    corrected.filingDisclosures!.events[0]!.summary += LEGACY;
    const second = withPrincipalSummarySafety(corrected);
    expect(second.appendix.missingData.filter((g) => g.field === "presentation.principalAggregation")).toHaveLength(1);
    expect(second.filingDisclosures!.events[0]!.summary).not.toContain("$4.7 billion");
  });
  it("withholds the exact legacy annotation in the shared event table", () => {
    const report = legacyReport();
    const before = structuredClone(report);
    const table = filingDisclosureTables(report.filingDisclosures, "catalystsRisks")[0]!;
    expect(JSON.stringify(table)).not.toContain("$4.7 billion");
    expect(table.rows[0]![3]).toContain("including $500 million");
    expect(report).toEqual(before);
  });

  it("corrects immutable JSON/view copies and preserves original model, usage and conventions", () => {
    const report = legacyReport();
    const original = JSON.stringify(report);
    const corrected = parseStoredReportWithSafety(original)!.report;
    expect(corrected.filingDisclosures!.events[0]!.summary).not.toContain("$4.7 billion");
    expect(corrected.appendix.missingData).toContainEqual(expect.objectContaining({ field: "presentation.principalAggregation", severity: "info" }));
    expect(corrected.meta).toEqual(report.meta);
    expect(JSON.stringify(report)).toBe(original);
    expect(parseStoredReportWithSafety(JSON.stringify(corrected))!.report).toEqual(corrected);
  });

  it("keeps the correction and its disclosure consistent across web, Markdown and print", () => {
    const report = legacyReport();
    for (const rendered of [reportToMarkdown(report), reportToAuditMarkdown(report), reportToPrintHtml(report), renderToStaticMarkup(createElement(ReportView, { report }))]) {
      expect(rendered).not.toContain("$4.7 billion");
      expect(rendered).toMatch(/deterministic.{0,60}correction/i);
      expect(rendered).toMatch(/no.{0,20}(?:analyst|model).{0,20}rerun/i);
    }
  });
});
