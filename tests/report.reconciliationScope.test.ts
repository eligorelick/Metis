import { describe, expect, it } from "vitest";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import type { FilingDisclosures, FilingRef } from "@/report/schema";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportView } from "@/components/report/ReportView";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintHtml } from "@/report/export/printHtml";
import { loadTask28Fixture } from "./helpers/task28Report";

type Fact = NonNullable<FilingDisclosures["reconciliation"]>[number];
const release: FilingRef = { form: "8-K", accession: "0000000000-26-000001", filingDate: "2026-08-26", exhibit: "EX-99.1", url: "https://www.sec.gov/Archives/edgar/data/1/release.htm" };
const commentary: FilingRef = { ...release, exhibit: "EX-99.2", url: "https://www.sec.gov/Archives/edgar/data/1/commentary.htm" };
function fact(metric: Fact["metric"], value: number, source = release, overrides: Partial<Fact> = {}): Fact {
  return { metric, value, source, periodEnd: "2026-07-26", months: 3,
    unit: metric.endsWith("eps") ? "currency-per-share" : "currency", ...overrides };
}
function disclosure(reconciliation: Fact[]): FilingDisclosures {
  return { version: "1.0.0", currency: "USD", currencyBasis: "fixture statement currency", guidance: null,
    guidanceChecks: [], freeCashFlow: [], freeCashFlowDefinition: null, capitalReturn: null,
    events: [], segments: [], quarterlyTrend: [], reconciliation, notes: [] };
}
const tables = (d: FilingDisclosures) => filingDisclosureTables(d, "fundamentals");
const adjustments = (d: FilingDisclosures) => tables(d).flatMap(t => t.rows).filter(r => /^(?:Non-GAAP adjustments,|Reported EPS difference)/.test(r[0] ?? ""));
const text = (d: FilingDisclosures) => JSON.stringify(tables(d));

describe("source-bound issuer reconciliation presentation", () => {
  it("keeps table identity bound to source across observation reorder and value replacement", () => {
    const facts = [fact("gaap-diluted-eps", 2), fact("gaap-diluted-eps", 7, commentary)];
    const initial = tables(disclosure(facts));
    expect(initial.every(t => !!t.key)).toBe(true);
    expect(new Set(initial.map(t => t.key)).size).toBe(initial.length);
    expect(tables(disclosure([...facts].reverse())).map(t => t.key)).toEqual(initial.map(t => t.key).reverse());
    expect(tables(disclosure(facts.map(f => ({ ...f, value: f.value + 1 })))).map(t => t.key)).toEqual(initial.map(t => t.key));
  });
  it("does not fabricate a per-share bridge across two supplying exhibits", () => {
    const d = disclosure([fact("gaap-diluted-eps", 2), fact("non-gaap-diluted-eps", 5, commentary)]);
    const original = structuredClone(d);
    expect(adjustments(d)).toEqual([]);
    expect(text(d)).toContain("$2.00");
    expect(text(d)).toContain("$5.00");
    expect(text(d)).toContain("EX-99.1");
    expect(text(d)).toContain("EX-99.2");
    expect(d).toEqual(original);
  });

  it.each([
    { form: "8-K/A" }, { accession: "0000000000-26-000002" },
    { filingDate: "2026-08-27" }, { url: "https://www.sec.gov/Archives/edgar/data/1/other.htm" },
  ])("does not join an EPS pair with a different source component %j", changes => {
    const d = disclosure([fact("gaap-diluted-eps", 2), fact("non-gaap-diluted-eps", 5, { ...release, ...changes })]);
    expect(adjustments(d)).toEqual([]);
  });

  it("attributes separately captured tax observations to their own source", () => {
    const d = disclosure([fact("gaap-diluted-eps", 2), fact("non-gaap-diluted-eps", 5), fact("non-gaap-tax-impact", 25e6, commentary)]);
    const tax = tables(d).find(t => t.rows.some(r => r[0] === "Tax effect of non-GAAP adjustments"));
    expect(tax?.note).toContain("EX-99.2");
    expect(tax?.note).not.toContain("EX-99.1");
    expect(adjustments(d)).toEqual([["Reported EPS difference (non-GAAP less GAAP)", "$3.00"]]);
  });

  it("does not treat filing-only legacy provenance as a known common document", () => {
    const unknown: FilingRef = { ...release, exhibit: null, url: null };
    const d = disclosure([fact("gaap-diluted-eps", 2, unknown), fact("non-gaap-diluted-eps", 5, unknown)]);
    expect(adjustments(d)).toEqual([]);
    expect(text(d)).toContain("$2.00");
    expect(text(d)).toContain("$5.00");
    expect(text(d)).toMatch(/supplying document.*not established/i);
  });

  it("retains conflicting observations without choosing a favorable EPS bridge", () => {
    const d = disclosure([fact("gaap-diluted-eps", 2), fact("gaap-diluted-eps", 2.5), fact("non-gaap-diluted-eps", 5)]);
    expect(adjustments(d)).toEqual([]);
    expect(text(d)).toContain("$2.50");
    expect(text(d)).toMatch(/conflicting/i);
  });

  it("does not subtract an amount from a per-share number", () => {
    const d = disclosure([fact("gaap-diluted-eps", 2, release, { unit: "currency" }), fact("non-gaap-diluted-eps", 5)]);
    expect(adjustments(d)).toEqual([]);
    expect(text(d)).toMatch(/unit/i);
  });

  it("deduplicates identical observations for a supported negative adjustment", () => {
    const d = disclosure([fact("gaap-diluted-eps", 2.46), fact("gaap-diluted-eps", 2.46), fact("non-gaap-diluted-eps", 2.22)]);
    expect(adjustments(d)).toEqual([["Reported EPS difference (non-GAAP less GAAP)", "\u2212$0.24"]]);
  });

  it.each([0, -3, 13])("retains unsupported %s-month observations without deriving EPS", months => {
    const d = disclosure([fact("gaap-diluted-eps", 2, release, { months }), fact("non-gaap-diluted-eps", 5, release, { months })]);
    expect(adjustments(d)).toEqual([]);
    expect(text(d)).toMatch(/duration/i);
  });

  it("does not calculate an EPS bridge for a nonexistent calendar date", () => {
    const d = disclosure([fact("gaap-diluted-eps", 2, release, { periodEnd: "2026-02-30" }), fact("non-gaap-diluted-eps", 5, release, { periodEnd: "2026-02-30" })]);
    expect(adjustments(d)).toEqual([]);
  });

  it("does not present a derived monetary EPS difference with unknown currency", () => {
    const d = disclosure([fact("gaap-diluted-eps", 2), fact("non-gaap-diluted-eps", 5)]);
    d.currency = null;
    expect(adjustments(d)).toEqual([]);
  });

  it.each([
    { periodEnd: "2026-07-29", source: release },
    { periodEnd: "2026-07-26", source: commentary },
  ])("does not insert an issuer FCF amount from a different scope %j", scope => {
    const d = disclosure([fact("operating-cash-flow", 600e6), fact("total-capital-expenditures", 150e6)]);
    d.freeCashFlow = [{ ...scope, months: 3, value: 450e6 }];
    const bridge = tables(d).find(t => t.heading === "Issuer free-cash-flow reconciliation");
    expect(bridge?.rows.some(r => r[0] === "Free cash flow (issuer definition, as reported)")).toBe(false);
    expect(text(d)).toContain("$450M"); // retained in its separately sourced reported-facts table
  });

  it("retains an exactly scoped issuer FCF reconciliation without implying discretionary funding", () => {
    const d = disclosure([fact("operating-cash-flow", 600e6), fact("total-capital-expenditures", 150e6)]);
    d.freeCashFlow = [{ periodEnd: "2026-07-26", source: release, months: 3, value: 450e6 }];
    const bridge = tables(d).find(t => t.heading === "Issuer free-cash-flow reconciliation");
    expect(bridge?.rows).toContainEqual(["Free cash flow (issuer definition, as reported)", "$450M"]);
    expect(bridge?.note).toMatch(/not.*(?:funding capacity|discretionary)/i);
  });

  it("does not choose one of two conflicting issuer FCF observations", () => {
    const d = disclosure([fact("operating-cash-flow", 600e6), fact("total-capital-expenditures", 150e6)]);
    d.freeCashFlow = [450e6, 400e6].map(value => ({ periodEnd: "2026-07-26", source: release, months: 3, value }));
    const bridge = tables(d).find(t => t.heading === "Issuer free-cash-flow reconciliation");
    expect(bridge?.rows.some(r => r[0] === "Free cash flow (issuer definition, as reported)")).toBe(false);
    expect(text(d)).toContain("$450M");
    expect(text(d)).toContain("$400M");
  });

  it("withholds a nonfinite derived difference while retaining finite reported operands", () => {
    const d = disclosure([fact("gaap-diluted-eps", -1e308), fact("non-gaap-diluted-eps", 1e308)]);
    expect(adjustments(d)).toEqual([]);
    expect(text(d)).not.toMatch(/NaN|Infinity/);
  });

  it("does not combine different reported durations from the same document", () => {
    const d = disclosure([fact("gaap-diluted-eps", 2), fact("non-gaap-diluted-eps", 5, release, { months: 6 })]);
    expect(adjustments(d)).toEqual([]);
  });

  it("retains the exact issuer basis note without assigning it an invented document source", () => {
    const d = disclosure([fact("gaap-diluted-eps", 2), fact("non-gaap-diluted-eps", 5)]);
    d.nonGaapBasisNote = "Beginning with this fiscal year, the issuer no longer excludes stock-based compensation.";
    const note = tables(d).find(t => t.rows.some(r => r[0] === d.nonGaapBasisNote));
    expect(note?.note).toMatch(/does not bind.*specific supplying document/);
    expect(note?.note).not.toContain("EX-99.1");
  });

  it("keeps the cross-document EPS bridge unavailable in the reader, Markdown and print", () => {
    const report = loadTask28Fixture();
    report.filingDisclosures = disclosure([fact("gaap-diluted-eps", 2), fact("non-gaap-diluted-eps", 5, commentary)]);
    const original = JSON.stringify(report);
    const surfaces = {
      reader: renderToStaticMarkup(createElement(ReportView, { report })),
      markdown: reportToMarkdown(report),
      print: reportToPrintHtml(report, { autoPrint: false }),
    };
    for (const [name, output] of Object.entries(surfaces)) {
      const displayed = name === "markdown" ? output.replace(/\\(.)/g, "$1") : output;
      expect(displayed, name).not.toContain("Reported EPS difference (non-GAAP less GAAP)");
      expect(displayed, name).not.toContain("Non-GAAP adjustments, net of tax (non-GAAP less GAAP)");
      expect(displayed, name).toContain("$2.00");
      expect(displayed, name).toContain("$5.00");
      expect(displayed, name).toContain(release.url);
      expect(displayed, name).toContain(commentary.url);
    }
    expect(JSON.stringify(report)).toBe(original);
  });

  it("withholds an EPS difference whose period ends after the supplying filing date", () => {
    const early = { ...release, filingDate: "2026-07-01" };
    const d = disclosure([fact("gaap-diluted-eps", 2, early), fact("non-gaap-diluted-eps", 5, early)]);
    const original = structuredClone(d);
    expect(adjustments(d)).toEqual([]);
    expect(text(d)).toContain("$2.00");
    expect(text(d)).toContain("$5.00");
    expect(text(d)).toMatch(/period end.*after.*filing date/i);
    expect(d).toEqual(original);
  });

  it("does not join future-period issuer FCF as a historical reconciliation", () => {
    const early = { ...release, filingDate: "2026-07-01" };
    const d = disclosure([fact("operating-cash-flow", 600e6, early), fact("total-capital-expenditures", 150e6, early)]);
    d.freeCashFlow = [{ periodEnd: "2026-07-26", source: early, months: 3, value: 450e6 }];
    const original = structuredClone(d);
    const bridge = tables(d).find(t => t.heading === "Issuer free-cash-flow reconciliation");
    expect(bridge?.rows.some(r => r[0] === "Free cash flow (issuer definition, as reported)")).toBe(false);
    expect(bridge?.note).toMatch(/period end.*after.*filing date/i);
    expect(text(d)).toContain("$450M");
    expect(d).toEqual(original);
  });

  it.each(["2026-07-26", "2026-07-27", "2026-08-26"])("retains valid chronology at filing date %s", filingDate => {
    const source = { ...release, filingDate };
    const d = disclosure([fact("gaap-diluted-eps", 2, source), fact("non-gaap-diluted-eps", 5, source),
      fact("operating-cash-flow", 600e6, source), fact("total-capital-expenditures", 150e6, source)]);
    d.freeCashFlow = [{ periodEnd: "2026-07-26", source, months: 3, value: 450e6 }];
    expect(adjustments(d)).toEqual([["Reported EPS difference (non-GAAP less GAAP)", "$3.00"]]);
    expect(tables(d).find(t => t.heading === "Issuer free-cash-flow reconciliation")?.rows)
      .toContainEqual(["Free cash flow (issuer definition, as reported)", "$450M"]);
    expect(text(d)).not.toMatch(/period end.*after.*filing date/i);
  });

  it("withholds only the future column when one document also retains valid historical observations", () => {
    const early = { ...release, filingDate: "2026-07-01" };
    const d = disclosure([fact("gaap-diluted-eps", 3, early), fact("non-gaap-diluted-eps", 6, early),
      fact("operating-cash-flow", 600e6, early), fact("total-capital-expenditures", 150e6, early),
      fact("gaap-diluted-eps", 2, early, { periodEnd: "2026-06-30" }),
      fact("non-gaap-diluted-eps", 5, early, { periodEnd: "2026-06-30" }),
      fact("operating-cash-flow", 300e6, early, { periodEnd: "2026-06-30" }),
      fact("total-capital-expenditures", 50e6, early, { periodEnd: "2026-06-30" })]);
    d.freeCashFlow = [
      { periodEnd: "2026-07-26", source: early, months: 3, value: 450e6 },
      { periodEnd: "2026-06-30", source: early, months: 3, value: 250e6 },
    ];
    expect(adjustments(d)).toEqual([["Reported EPS difference (non-GAAP less GAAP)", "-", "$3.00"]]);
    expect(tables(d).find(t => t.heading === "Issuer free-cash-flow reconciliation")?.rows)
      .toContainEqual(["Free cash flow (issuer definition, as reported)", "-", "$250M"]);
    expect(text(d)).toContain("$450M");
  });

  it("keeps future-period EPS and FCF joins unavailable across reader, Markdown and print", () => {
    const early = { ...release, filingDate: "2026-07-01" };
    const report = loadTask28Fixture();
    report.filingDisclosures = disclosure([fact("gaap-diluted-eps", 2, early), fact("non-gaap-diluted-eps", 5, early),
      fact("operating-cash-flow", 600e6, early), fact("total-capital-expenditures", 150e6, early)]);
    report.filingDisclosures.freeCashFlow = [{ periodEnd: "2026-07-26", source: early, months: 3, value: 450e6 }];
    const original = JSON.stringify(report);
    const surfaces = {
      reader: renderToStaticMarkup(createElement(ReportView, { report })),
      markdown: reportToMarkdown(report), print: reportToPrintHtml(report, { autoPrint: false }),
    };
    for (const [name, output] of Object.entries(surfaces)) {
      const displayed = name === "markdown" ? output.replace(/\\(.)/g, "$1") : output;
      expect(displayed.includes("Reported EPS difference (non-GAAP less GAAP)"), `${name}: future EPS difference withheld`).toBe(false);
      expect(displayed.includes("Free cash flow (issuer definition, as reported)"), `${name}: future FCF join withheld`).toBe(false);
      for (const amount of ["$2.00", "$5.00", "$600M", "$150M", "$450M"]) expect(displayed.includes(amount), `${name}: retain ${amount}`).toBe(true);
      expect(/period end.*after.*filing date/i.test(displayed), `${name}: chronology qualification`).toBe(true);
    }
    expect(JSON.stringify(report)).toBe(original);
  });
});
