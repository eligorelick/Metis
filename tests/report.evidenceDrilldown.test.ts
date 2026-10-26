// Rendered provenance controls in both existing designs; no invented source/date.
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UiDesignProvider } from "@/appearance/UiDesignProvider";
import { GradeReasoning, TracedStat, TracedNumberSourceDetails } from "@/components/report/primitives";
import { ClaimText } from "@/components/report/ClaimText";
import { ReportView } from "@/components/report/ReportView";
import { ValuationSection } from "@/components/report/sections";
import type { GradeBlock, TracedNumber } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";

function render(design: "current" | "workspace", child: ReactNode) {
  return renderToStaticMarkup(createElement(UiDesignProvider, { initialDesign: design }, child));
}
function text(html: string) { return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " "); }
const input: TracedNumber = { value: 10.125, unit: "percent", period: "FY2025",
  sourceId: "grade-input:wacc:recorded", source: "computed.costOfCapital.wacc",
  asOf: "2026-09-30", verified: true, verificationNote: "Recorded citation coverage only" };

describe("snapshot-bound evidence enhancement", () => {
  it("distinguishes figures sharing a source but having different measurement windows", () => {
    const html = renderToStaticMarkup(createElement("div", null,
      createElement(TracedNumberSourceDetails, { n: input }),
      createElement(TracedNumberSourceDetails, { n: { ...input, period: "FY2024", value: 0 } }),
    ));
    const keys = [...html.matchAll(/data-evidence-key="([^"]+)"/g)].map(match => match[1]);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
    expect(html).toContain('data-evidence-kind="number"');
    expect(html).toContain('data-evidence-source-id="grade-input:wacc:recorded"');
    expect(text(html)).toContain("FY2024");
    expect(text(html)).toContain("recorded value 0");
  });

  it("retains native claim provenance and its own observation date before hydration", () => {
    const html = renderToStaticMarkup(createElement(ClaimText, { claim: {
      label: "FACT", text: "Recorded revenue", source: "filing:original", sourceId: "claim:1", asOf: "2025-11-01",
    } }));
    expect(html).toContain('data-evidence-kind="claim"');
    expect(html).toContain("<summary");
    expect(text(html)).toContain("claim:1");
    expect(text(html)).toContain("2025-11-01");
    expect(html).not.toContain("<button");
  });

  it("renders one inspector for the selected dossier while preserving its gaps and native disclosures", () => {
    const report = loadTask28Fixture();
    const html = renderToStaticMarkup(createElement(ReportView, { report, layout: "dossier" }));
    expect(html.match(/aria-label="Selected evidence"/g)).toHaveLength(1);
    expect(html).toContain("Recorded gaps (");
    expect(html).toContain('data-evidence-kind="claim"');
    expect(html).toContain("Select a claim or a figure");
    const classic = renderToStaticMarkup(createElement(ReportView, { report }));
    expect(classic).not.toContain('aria-label="Selected evidence"');
  });

  it("retains explicitly recorded filing context for inspection without inferring XBRL metadata", () => {
    const report = loadTask28Fixture();
    report.sourceFactSummary = {
      version: "1.0.0", status: "available", reason: null, qualifier: "as reported",
      rows: [{ metric: "revenue", label: "Reported revenue", definition: "reported-statement-line-item", value: 1200, unit: "currency", currency: "EUR", period: "2025-12-31",
        periodContext: { kind: "duration", start: "2025-01-01", end: "2025-12-31" }, source: "filing:revenue:2025", asOf: "2026-02-01", provenanceId: "filing:revenue:2025", origin: "Recorded filing reference 0000123456-26-000001", qualifier: "as reported", canonicalText: "Reported revenue was 1,200 EUR." }],
      earningsReconciliation: { status: "unavailable", reason: "Earnings operands not recorded", method: null, pretaxMinusTax: null, reconciledNetIncome: null, reportedNetIncome: null, residual: null, operandIds: [], explanation: "No reconciliation was recorded." },
    };
    const html = renderToStaticMarkup(createElement(ReportView, { report, layout: "dossier" }));
    expect(html).toContain('data-evidence-context="recorded"');
    expect(html).toContain("Recorded filing reference 0000123456-26-000001");
    expect(html).toContain("Reported revenue was 1,200 EUR.");
    expect(html).not.toContain("us-gaap:Revenue");
  });
});
function block(keyNumbers: TracedNumber[]): GradeBlock {
  return { grade: "B", confidence: "medium", oneLineWhy: "Recorded inputs support the grade",
    reasoning: [], keyNumbers };
}

describe.each(["current", "workspace"] as const)("recorded grade/DCF evidence in %s", (design) => {
  it("makes WACC, ROIC and debt coverage identities and periods inspectable beyond hover", () => {
    const numbers = [input, { ...input, value: 14.25, sourceId: "grade-input:roic", source: "computed.returns.roic" },
      { ...input, value: 3.2, unit: "multiple", sourceId: "grade-input:interestCoverage", source: "computed.debt.interestCoverage" }];
    const html = render(design, createElement(GradeReasoning, { title: "recorded drivers", block: block(numbers), defaultOpen: true }));
    const visible = text(html);
    for (const n of numbers) for (const field of [n.sourceId!, n.source, n.period!, n.asOf!]) expect(visible).toContain(field);
    expect(html.match(/<summary\b/g)?.length).toBe(4); // reasoning plus three native source disclosures
    expect(visible).toContain("traceability, not correctness");
    expect(visible).not.toMatch(/most influential|accuracy rate/i);
  });
  it("does not infer legacy source identity, period or observation date and preserves zero", () => {
    const n = { ...input, value: 0, sourceId: undefined, period: null, asOf: null, verified: null };
    const visible = text(render(design, createElement(GradeReasoning, { title: "legacy", block: block([n]), defaultOpen: true })));
    expect(visible).toMatch(/source id not recorded/);
    // D-62: the card omits an absent window; the opt-in source details say it was not recorded.
    expect(visible).toMatch(/period not recorded/);
    expect(visible).not.toMatch(/period not supplied/);
    expect(visible).toMatch(/as of not recorded/);
    expect(visible).toContain("0.0%");
    expect(visible).not.toContain("2026-09-30");
  });
  it("does not add dense source controls to unrelated stat callers by default", () => {
    const html = render(design, createElement(TracedStat, { label: "ordinary stat", n: input }));
    expect(html).not.toContain("<summary");
  });
  it("describes an unresolved provided citation without claiming the value was uncited", () => {
    const visible = text(render(design, createElement(GradeReasoning, { title: "unresolved", block: block([{ ...input, verified: false }]), defaultOpen: true })));
    expect(visible).toContain(input.sourceId!);
    expect(visible).toContain("citation status untraced");
    expect(visible).not.toContain("citation status uncited");
  });
  it("exposes DCF recorded identity and period, then suppresses its provenance when value is absent", () => {
    const valuation = loadTask28Fixture().valuation;
    valuation.dcf.perShare = { ...input, value: 123.456, unit: "USD/share", currency: "USD", sourceId: "dcf:canonical", period: "FY2037" };
    const html = render(design, createElement(ValuationSection, { valuation, index: 6 }));
    const visible = text(html);
    expect(html).toMatch(/<summary[^>]*>.*?DCF provenance/s);
    for (const field of ["dcf:canonical", "FY2037", "2026-09-30", "USD/share"]) expect(visible).toContain(field);
    expect(visible).toContain("$123.46");
    valuation.dcf.perShare = null;
    const absent = text(render(design, createElement(ValuationSection, { valuation, index: 6 })));
    expect(absent).toContain("unavailable");
    expect(absent).not.toContain("DCF provenance");
  });
  it("renders source metadata as escaped text rather than executable markup or an invented link", () => {
    const n = { ...input, sourceId: '<img src=x onerror="alert(1)">', source: '<script>alert("source")</script>' };
    const html = render(design, createElement(GradeReasoning, { title: "escaped", block: block([n]), defaultOpen: true }));
    expect(text(html)).toContain("&lt;img");
    expect(text(html)).toContain("&lt;script&gt;");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('href="');
  });
});
