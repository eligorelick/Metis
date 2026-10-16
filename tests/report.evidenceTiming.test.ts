import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { buildEvidenceTiming, evidenceTimingRows, EvidenceTimingSchema, type EvidenceTimingBundle } from "@/report/evidenceTiming";
import { reportToAuditMarkdown, reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { markdownTableCell } from "@/report/export/markdownEscape";
import { esc } from "@/report/export/printHtml";
import { ReportSchema, type Report } from "@/report/schema";
import { deriveAsOf } from "@/providers/fmp";

const CUTOFF = "2026-10-14T21:00:00.000Z";
const GENERATED = "2026-10-14T21:30:00.000Z";
const OBSERVED = "2026-10-14T20:00:00.000Z";
const ACQUIRED = "2026-10-14T20:15:00.000Z";
const ok = <T>(data: T, asOf: string, fetchedAt = ACQUIRED, stale = false) => ({
  ok: true as const, value: { data, asOf, source: "fmp" as const, endpoint: "fixture", fetchedAt, stale },
});
function bundle(): EvidenceTimingBundle {
  return {
    builtAt: CUTOFF,
    quote: ok({ rows: [{ timestamp: Date.parse(OBSERVED) / 1000 }] }, "2026-10-14"),
    statements: { incomeAnnual: ok({ rows: [{ date: "2026-06-30" }] }, "2026-06-30") },
    edgar: {
      mdna: ok({ form: "10-K", reportDate: "2026-06-30", filingDate: "2026-08-12" }, "2026-06-30"),
    },
    sourceManifest: { quote: { provider: "fmp", endpoint: "quote", asOf: "2026-10-14", fetchedAt: ACQUIRED, stale: false } },
  };
}
const timing = (input = bundle()) => buildEvidenceTiming(input, { calculationAsOf: CUTOFF, reportGeneratedAt: GENERATED });
const fixture = () => JSON.parse(readFileSync("fixtures/report/DEMO-sample.json", "utf8")) as Report;
const row = (report: Report, label: string) => evidenceTimingRows(report).find((item) => item.label === label)!.value;

describe("bounded report evidence timing", () => {
  it("keeps quote observation, financial period, filing, acquisition and calculation basis distinct", () => {
    const input = bundle();
    const before = JSON.stringify(input);
    const result = timing(input);
    expect(EvidenceTimingSchema.safeParse(result).success).toBe(true);
    expect(result.quote.observedAt).toBe(OBSERVED);
    expect(result.quote.acquiredAt).toBe(ACQUIRED);
    expect(result.financialPeriods).toEqual([{ source: "statements.incomeAnnual", periodEnd: "2026-06-30" }]);
    expect(result.filings).toContainEqual({ source: "edgar.mdna", form: "10-K", reportDate: "2026-06-30", filedAt: "2026-08-12" });
    expect(result.publications).toEqual([]);
    expect(result.calculationAsOf).toBe(CUTOFF);
    expect(result.calculatedAt).toBeNull();
    expect(result.reportGeneratedAt).toBe(GENERATED);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("never replaces a missing actual quote timestamp with the envelope or acquisition date", () => {
    const input = bundle();
    input.quote = ok({ rows: [{}] }, "2026-10-14");
    const report = fixture();
    report.meta.evidenceTiming = timing(input);
    expect(row(report, "Quote observation")).toBe("not supplied; current observation cannot be established");
    expect(row(report, "Publication")).toBe("not supplied");
    expect(row(report, "Quote acquisition")).toBe(ACQUIRED);
  });

  it("uses existing seven-calendar-day and cache freshness disclosures without inventing a valuation expiry", () => {
    const input = bundle();
    input.quote = ok({ rows: [{ timestamp: Date.parse("2026-10-01T20:00:00Z") / 1000 }] }, "2026-10-01", ACQUIRED, true);
    const report = fixture();
    report.meta.evidenceTiming = timing(input);
    expect(row(report, "Quote observation")).toContain("older than 7 calendar days");
    expect(row(report, "Quote observation")).toContain("served past cache TTL");
  });

  it.each(["2026-10-14T21:30:00.001Z", "2026-10-15T00:00:00Z"])("rejects demonstrably future actual observations at the supplied cutoff: %s", (date) => {
    const input = bundle();
    input.quote = ok({ rows: [{ timestamp: Date.parse(date) / 1000 }] }, "2026-10-14");
    const report = fixture();
    report.meta.evidenceTiming = timing(input);
    expect(row(report, "Quote observation")).toContain("future to disclosure cutoff; current observation cannot be established");
  });

  it("does not accept impossible dates, millisecond quote values, or unknown cutoffs", () => {
    for (const timestamp of [Number.NaN, 1e15, Date.parse(OBSERVED)]) {
      const input = bundle();
      input.quote = ok({ rows: [{ timestamp }] }, "2026-10-14");
      expect(timing(input).quote.observedAt).toBeNull();
    }
    const report = fixture();
    report.meta.evidenceTiming = { ...timing(), cutoffAt: "2026-02-30" };
    expect(row(report, "Quote observation")).toContain("cutoff invalid; current observation cannot be established");
  });

  it("discloses future acquisition, period and filing evidence separately from the quote observation", () => {
    const report = fixture();
    const result = timing();
    result.quote.acquiredAt = "2026-10-15T00:00:00Z";
    result.financialPeriods[0].periodEnd = "2026-12-31";
    result.filings[0].filedAt = "2026-11-01";
    report.meta.evidenceTiming = result;
    expect(row(report, "Quote observation")).toContain("acquisition is future to disclosure cutoff; current observation cannot be established");
    expect(row(report, "Financial period ends")).toContain("2026-12-31 (future to disclosure cutoff)");
    expect(row(report, "Filing")).toContain("2026-11-01 (future to disclosure cutoff)");
    expect(row(report, "Publication")).toBe("not supplied");
    expect(report.valuation).toEqual(fixture().valuation);
  });

  it("keeps an explicitly established publication separate from filing and acquisition", () => {
    const report = fixture();
    report.meta.evidenceTiming = timing();
    report.meta.evidenceTiming.publications = [{ source: "retained publication metadata", publishedAt: "2026-08-11T16:00:00Z" }];
    expect(row(report, "Publication")).toBe("retained publication metadata: 2026-08-11T16:00:00Z");
    expect(row(report, "Filing")).toContain("filed 2026-08-12");
    expect(row(report, "Input acquisition")).toBe(ACQUIRED);
  });

  it("retains established statement filing dates without treating acquisition as publication", () => {
    const input = bundle();
    input.statements = { incomeAnnual: ok({ rows: [{ date: "2026-06-30", filingDate: "2026-08-12" }] }, "2026-06-30") };
    const result = timing(input);
    expect(result.filings).toContainEqual({ source: "statements.incomeAnnual", form: null, reportDate: "2026-06-30", filedAt: "2026-08-12" });
    expect(result.publications).toEqual([]);
  });

  it("reads legacy known source dates without inventing actual quote or calculation timestamps", () => {
    const report = fixture();
    report.meta.asOfMap = { quote: "2026-10-14", "statements.incomeAnnual": "2026-06-30" };
    report.appendix.sources = [{ provider: "fmp", endpoint: "quote", asOf: "2026-10-14", fetchedAt: ACQUIRED, stale: false }];
    const before = JSON.stringify(report);
    expect(row(report, "Quote observation")).toContain("not supplied");
    expect(row(report, "Quote envelope as of")).toContain("2026-10-14");
    expect(row(report, "Financial period ends")).toBe("not supplied");
    expect(row(report, "Statement envelope as of")).toContain("2026-06-30");
    expect(row(report, "Filing")).toBe("not supplied");
    expect(row(report, "Publication")).toBe("not supplied");
    expect(row(report, "Calculation time")).toBe("not supplied");
    expect(JSON.stringify(report)).toBe(before);
  });

  // D-62: the evidence-timing table is in the separate audit export; the
  // report body (live, Markdown, print) no longer prints it.
  it("does not turn a legacy fetch-date fallback into a financial period end in the audit export", () => {
    const acquiredAt = "2026-10-15T10:00:00Z";
    const envelopeAsOf = deriveAsOf([{ date: "2027-03-31" }], acquiredAt);
    expect(envelopeAsOf).toBe("2026-10-15");
    const report = fixture();
    report.meta.generatedAt = "2026-10-15T10:30:00Z";
    report.meta.asOfMap = { "statements.incomeAnnual": envelopeAsOf };
    report.appendix.sources = [{ provider: "fmp", endpoint: "income-statement", asOf: envelopeAsOf, fetchedAt: acquiredAt, stale: false }];
    const before = JSON.stringify(report);
    expect(row(report, "Financial period ends")).toBe("not supplied");
    expect(row(report, "Statement envelope as of")).toBe("statements.incomeAnnual: 2026-10-15; actual financial period end not supplied");
    expect(row(report, "Filing")).toBe("not supplied");
    expect(row(report, "Publication")).toBe("not supplied");
    expect(row(report, "Input acquisition")).toBe(acquiredAt);
    const audit = reportToAuditMarkdown(report);
    for (const item of evidenceTimingRows(report)) {
      expect(audit).toContain(markdownTableCell(item.value));
    }
    expect(JSON.stringify(report)).toBe(before);
  });

  it("adds optional metadata without changing historical version stamps or requiring it on legacy reports", () => {
    const report = fixture();
    expect(ReportSchema.safeParse(report).success).toBe(true);
    report.meta.evidenceTiming = timing();
    const parsed = ReportSchema.parse(report);
    expect(parsed.meta.evidenceTiming?.version).toBe("1");
    expect(parsed.meta.specVersion).toBe(report.meta.specVersion);
    expect(EvidenceTimingSchema.safeParse({ ...timing(), injected: true }).success).toBe(false);
  });

  it("renders the timing rows in the audit export and keeps them out of the report body without mutations", () => {
    const report = fixture();
    report.meta.evidenceTiming = timing();
    report.meta.evidenceTiming.financialPeriods[0].source = "statement <untrusted> | extra";
    const before = JSON.stringify(report);
    const app = renderToStaticMarkup(createElement(ReportView, { report }));
    const markdown = reportToMarkdown(report);
    const print = reportToPrintBody(report);
    for (const body of [app, markdown, print]) expect(body).not.toContain("Evidence timing");
    expect(app).not.toContain("<untrusted>");
    expect(print).not.toContain(esc("<untrusted>"));
    const audit = reportToAuditMarkdown(report);
    expect(audit).toContain("## Evidence timing");
    expect(audit).toContain(OBSERVED);
    expect(audit).toContain(ACQUIRED);
    expect(audit).toContain("actual calculation timestamp");
    expect(audit).toContain("\\|");
    for (const item of evidenceTimingRows(report)) {
      expect(audit).toContain(item.label);
      expect(audit).toContain(markdownTableCell(item.value));
    }
    expect(JSON.stringify(report)).toBe(before);
  });
});
