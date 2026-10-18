import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { runStageB } from "@/pipeline/compute";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { assembleReport } from "@/pipeline/stageC/passes";
import { assembleContextPayload, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import { buildEarningsReleaseRecord, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
import { reportToMarkdown, reportToAuditMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { parseStoredReportWithSafety } from "@/report/legacyEntitySafety";
import { FilingDisclosuresSchema, judgeOutputToJsonSchema, type Report } from "@/report/schema";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";

const HEADER = "Remainder of 2026 2027 2028 and thereafter Total";
const TABLE = `Future commitments by fiscal year as of March 31, 2026, were as follows: ${HEADER} (In billions) Supply and capacity $ 1 2 3 6 Total $ 1 2 3 6`;
const URL = "https://www.sec.gov/Archives/edgar/data/1/000000000126000001/cfo.htm";

function fixture(text = TABLE, options: Parameters<typeof completeCurrencyBundle>[0] = {}) {
  const bundle = completeCurrencyBundle(options);
  const release = buildEarningsReleaseRecord({
    filing: { accessionNumber: "0000000001-26-000001", filingDate: "2026-05-01" },
    releaseUrl: "https://www.sec.gov/Archives/edgar/data/1/000000000126000001/release.htm",
    commentaryUrl: URL,
    releaseText: "Financial results for the first quarter of fiscal 2026 ended March 31, 2026.",
    commentaryText: text,
    includeNarrative: true,
  });
  bundle.edgar.currentReports = { ok: true, value: { source: "edgar", endpoint: "fixture", asOf: "2026-05-01", fetchedAt: bundle.builtAt,
    data: { version: CURRENT_REPORTS_VERSION, releases: [release], events: [], notes: [] } } };
  return { bundle, release };
}

function reports(bundle = fixture().bundle) {
  const computed = runStageB(bundle);
  const judge = { ...loadTask28Fixture(), filingDisclosures: { commitmentPaymentTiming: [{ invented: "Model-forged timing", amount: 999 }] } };
  const full = assembleReport({ symbol: bundle.symbol, bundle, computed, judgeOutput: judge, model: "synthetic-test", costEntries: [], verify: { verificationRate: null, log: [] } }, bundle.builtAt);
  const dataOnly = buildDataOnlyReport({ symbol: bundle.symbol, companyName: "Synthetic issuer", generatedAt: bundle.builtAt, model: "synthetic-test", costUsd: 0, bundle, computed, validation: { checks: [], flags: [], gaps: [] }, costBreakdown: [], reason: "offline fixture" });
  return { bundle, full, dataOnly };
}

describe("reported commitment payment evidence", () => {
  it("retains unsupported commentary without replacing a supported release aggregate or its supplying exhibit", () => {
    const { bundle } = fixture();
    const release = buildEarningsReleaseRecord({ filing: { accessionNumber: "0000000001-26-000001", filingDate: "2026-05-01" },
      releaseUrl: URL.replace("cfo.htm", "release.htm"), commentaryUrl: URL,
      releaseText: `Financial results for the first quarter of fiscal 2026 ended March 31, 2026. ${TABLE.replace("billions", "millions")}`,
      commentaryText: TABLE.replace(HEADER, "Unsupported fiscal columns Total"), includeNarrative: true });
    const current = bundle.edgar.currentReports;
    if (!current?.ok) throw new Error("fixture current reports absent");
    current.value.data.releases = [release];
    const result = buildFilingDisclosures(bundle)!;
    expect(result.commitments?.find(row => row.label === "Supply and capacity")).toMatchObject({ total: 6e6,
      table: "future commitments", source: { exhibit: "EX-99.1", url: URL.replace("cfo.htm", "release.htm") } });
    expect(result.commitmentPaymentTiming).toEqual(expect.arrayContaining([
      expect.objectContaining({ coverage: "unavailable", tableIndex: 0, source: expect.objectContaining({ exhibit: "EX-99.2", url: URL }) }),
      expect.objectContaining({ coverage: "complete", tableIndex: 0, table: "future commitments", source: expect.objectContaining({ exhibit: "EX-99.1" }) }),
    ]));
    const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
    expect(payload.provenanceRegistry?.find(record => record.value === 1e6 && record.label?.includes("fiscal payment bucket"))?.origin).toContain("EX-99.1");
  });

  it.each([
    "Supplier commitments may be cancelled without significant penalty.",
    "Guarantees of these commitments may be cancelled without substantial penalty.",
  ])("retains cancellation qualification %s on every report and export surface without claiming complete timing", qualifier => {
    const { bundle } = fixture(`${TABLE} ${qualifier}`);
    const { full, dataOnly } = reports(bundle);
    for (const report of [full, dataOnly, parseStoredReportWithSafety(JSON.stringify(full))!.report, parseStoredReportWithSafety(JSON.stringify(dataOnly))!.report]) {
      expect(report.filingDisclosures?.commitmentPaymentTiming?.[0]).toMatchObject({ coverage: "incomplete", sourceText: `${TABLE} ${qualifier}` });
      for (const render of [reportToMarkdown, reportToPrintBody, reportToAuditMarkdown,
        (value: Report) => renderToStaticMarkup(createElement(ReportView, { report: value }))]) {
        expect(render(report)).toContain(qualifier);
      }
    }
    const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
    expect(payload.provenanceRegistry?.some(record => record.label?.includes("fiscal payment bucket"))).toBe(false);
  });

  it.each([
    `${TABLE} Total $ 9 9 9 27`,
    `${TABLE} Other commitments $ 1 2 3 6`,
    TABLE.replace("Supply and capacity $ 1 2 3 6 Total $ 1 2 3 6", "Total $ 1 2 3 6 Supply and capacity $ 1 2 3 6"),
  ])("withholds ambiguous Total order on full, data-only and numeric model surfaces: %s", text => {
    const { bundle } = fixture(text);
    const { full, dataOnly } = reports(bundle);
    for (const report of [full, dataOnly]) {
      expect(report.filingDisclosures?.commitmentPaymentTiming?.[0]?.coverage).toBe("unavailable");
      expect(reportToMarkdown(report)).toContain("unavailable");
      expect(reportToPrintBody(report)).toContain("unavailable");
    }
    const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
    expect(payload.provenanceRegistry?.some(record => record.label?.includes("fiscal payment bucket"))).toBe(false);
  });

  it.each([null, 42, "malformed", { rows: null }])("withholds malformed optional timing %j while preserving independently reproduced aggregate evidence", (malformed) => {
    const { bundle, release } = fixture();
    Object.assign(release.commitments![0]!, { paymentTiming: malformed });
    const result = buildFilingDisclosures(bundle)!;
    expect(result.commitments?.find(row => row.label === "Supply and capacity")?.total).toBe(6e9);
    expect(result.commitmentPaymentTiming).toBeUndefined();
    expect(result.notes.join(" ")).toContain("invalid structure");
  });

  it("does not infer aggregate currency from malformed timing without retained supplying text", () => {
    const { bundle, release } = fixture();
    Object.assign(release.commitments![0]!, { paymentTiming: null });
    release.commentaryNarrative = null;
    const result = buildFilingDisclosures(bundle)!;
    expect(result.commitments).toBeUndefined();
    expect(result.commitmentPaymentTiming).toBeUndefined();
  });

  it("preserves a source-reproduced aggregate when optional bucket structure is damaged", () => {
    const { bundle, release } = fixture();
    Object.assign(release.commitments![0]!.paymentTiming!.rows[0]!.buckets[0]!, { amount: "damaged" });
    const result = buildFilingDisclosures(bundle)!;
    expect(result.commitments?.find(row => row.label === "Supply and capacity")?.total).toBe(6e9);
    expect(result.commitmentPaymentTiming).toBeUndefined();
  });

  it("does not admit a currency-tampered aggregate from optional timing metadata", () => {
    const { bundle, release } = fixture(TABLE.replaceAll("$", "US$"), { profileCurrency: "EUR", annualCurrency: "EUR",
      quarterCurrencies: ["EUR", "EUR", "EUR", "EUR"], siblingQuarterCurrencies: ["EUR", "EUR", "EUR", "EUR"] });
    release.commitments![0]!.paymentTiming!.currencySymbol = "$";
    const result = buildFilingDisclosures(bundle)!;
    expect(result.commitments).toBeUndefined();
    expect(result.commitmentPaymentTiming?.[0]?.coverage).toBe("unavailable");
  });

  it("withholds structured timing that disagrees with its retained supplying table", () => {
    const { bundle, release } = fixture();
    release.commitments![0]!.paymentTiming!.rows[0]!.buckets[0]!.amount = 999e9;
    const result = buildFilingDisclosures(bundle)!;
    expect(result.commitmentPaymentTiming?.[0]).toMatchObject({ coverage: "unavailable", sourceText: TABLE });
    expect(result.commitments?.find(row => row.label === "Supply and capacity")?.total).toBe(6e9);
    expect(result.commitmentPaymentTiming?.[0]?.rows.every(row => row.buckets.every(bucket => bucket.amount === null))).toBe(true);
    const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
    expect(payload.provenanceRegistry?.some(record => record.value === 999e9)).toBe(false);
  });

  it("retains future filing evidence as unavailable rather than activating its buckets", () => {
    const { bundle, release } = fixture();
    release.filingDate = "2027-05-01";
    const result = buildFilingDisclosures(bundle)!;
    expect(result.commitmentPaymentTiming?.[0]?.coverage).toBe("unavailable");
    expect(result.commitments).toBeUndefined();
    const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
    expect(payload.provenanceRegistry?.some(record => record.label?.includes("fiscal payment bucket"))).toBe(false);
    expect(serializePayloadForPrompt(payload)).toContain("parsed-table coverage unavailable");
  });

  it("never rebinds explicit US$ to a different statement reporting currency", () => {
    const { bundle } = fixture(TABLE.replaceAll("$", "US$"), { profileCurrency: "EUR", annualCurrency: "EUR",
      quarterCurrencies: ["EUR", "EUR", "EUR", "EUR"], siblingQuarterCurrencies: ["EUR", "EUR", "EUR", "EUR"] });
    const result = buildFilingDisclosures(bundle)!;
    expect(result.currency).toBe("EUR");
    expect(result.commitmentPaymentTiming?.[0]).toMatchObject({ coverage: "unavailable", currency: null, currencySymbol: "US$" });
    expect(result.commitments).toBeUndefined();
    expect(result.commitmentPaymentTiming?.[0]?.rows.every(row => row.buckets.every(bucket => bucket.amount === null))).toBe(true);
  });
  it("retains fiscal labels, exact printed operands and supplying exhibit without changing aggregate totals", () => {
    const { bundle } = fixture();
    const result = FilingDisclosuresSchema.parse(buildFilingDisclosures(bundle));
    expect(result.commitments?.find(row => row.label === "Supply and capacity")?.total).toBe(6e9);
    expect(result.commitmentPaymentTiming?.[0]).toMatchObject({
      kind: "commitments", table: "future commitments", asOf: "2026-03-31", currency: "USD", coverage: "complete", sourceHeader: HEADER,
      source: { accession: "0000000001-26-000001", exhibit: "EX-99.2", filingDate: "2026-05-01", url: URL },
    });
    const row = result.commitmentPaymentTiming![0]!.rows.find(row => row.label === "Supply and capacity")!;
    expect(row.buckets).toEqual([
      { label: "Remainder of 2026", amount: 1e9, raw: "1" }, { label: "2027", amount: 2e9, raw: "2" }, { label: "2028 and thereafter", amount: 3e9, raw: "3" },
    ]);
    expect(row.reconciliation).toMatchObject({ status: "reconciled-as-printed", bucketSum: 6e9, residual: 0 });
    expect(result.commitmentPaymentTiming![0]!.sourceText).toContain(TABLE);
    expect(JSON.stringify(row)).not.toMatch(/periodStart|periodEnd|maturityDate|fundingGap/);
  });

  it("keeps legacy bundles and reports readable without reconstructing missing timing", () => {
    const { bundle, release } = fixture();
    for (const table of release.commitments ?? []) delete table.paymentTiming;
    expect(buildFilingDisclosures(bundle)?.commitmentPaymentTiming).toBeUndefined();
    const old = loadTask28Fixture();
    expect(parseStoredReportWithSafety(JSON.stringify(old))).not.toBeNull();
    expect(JSON.stringify(parseStoredReportWithSafety(JSON.stringify(old))!.report)).not.toContain("commitmentPaymentTiming");
  });

  it("uses deterministic evidence on full and data-only paths and keeps it out of the judge wire contract", () => {
    const { full, dataOnly } = reports();
    expect(full.filingDisclosures?.commitmentPaymentTiming?.[0]?.coverage).toBe("complete");
    expect(dataOnly.filingDisclosures?.commitmentPaymentTiming).toEqual(full.filingDisclosures?.commitmentPaymentTiming);
    expect(JSON.stringify(full.filingDisclosures)).not.toContain("Model-forged timing");
    expect(JSON.stringify(judgeOutputToJsonSchema())).not.toContain("commitmentPaymentTiming");
  });

  it("adds source-bound bucket observations to the payload while leaving all Stage B calculations unchanged", () => {
    const { bundle, release } = fixture();
    const computed = runStageB(bundle);
    const payload = assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] });
    expect(payload.provenanceRegistry?.find(record => record.label?.includes("Supply and capacity") && record.label.includes("Remainder of 2026")))
      .toMatchObject({ value: 1e9, currency: "USD", asOf: "2026-05-01", period: "Remainder of 2026" });
    const prompt = serializePayloadForPrompt(payload);
    expect(prompt).toContain("Fiscal labels are not calendar maturity dates");
    for (const table of release.commitments ?? []) delete table.paymentTiming;
    expect(runStageB(bundle)).toEqual(computed);
  });

  it.each([
    ["live", (report: Report) => renderToStaticMarkup(createElement(ReportView, { report }))],
    ["Markdown", reportToMarkdown], ["print", reportToPrintBody], ["audit", reportToAuditMarkdown],
  ] as const)("shows evidence coverage and unknown funding capacity consistently in %s", (_surface, render) => {
    const { full, dataOnly } = reports();
    for (const report of [full, dataOnly]) {
      const before = JSON.stringify(report);
      const output = render(report).replace(/\\:/g, ":");
      expect(output).toContain("Payment timing as reported");
      expect(output).toContain("Remainder of 2026");
      expect(output).toContain("2028 and thereafter");
      expect(output).toContain("0000000001-26-000001");
      expect(output).toContain("Fiscal labels are not calendar maturity dates");
      expect(output).toContain("funding capacity and solvency are not assessed");
      expect(output).not.toContain("Model-forged timing");
      expect(JSON.stringify(report)).toBe(before);
    }
  });
});
