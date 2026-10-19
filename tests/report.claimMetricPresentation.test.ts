import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GradeReasoning } from "@/components/report/primitives";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { displayClaimText, figureValueText, metricLabel, readerPrecision } from "@/report/presentation";
import { GRADE_SURFACES, SCORE_SURFACES, SCORE_WEIGHTS } from "@/report/surfaceManifest";
import type { SourcedClaim, TracedNumber } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";

const source = "computed.current-capital.fcf-conversion-before-sbc";
const claim = (text = "FCF conversion before SBC was -0.2x."): SourcedClaim => ({ text, label: "FACT", source, sourceId: source, asOf: "2025-12-31" });
const metric = (changes: Partial<TracedNumber> = {}): TracedNumber => ({ value: -0.208317925, unit: "x", source, sourceId: source, asOf: "2025-12-31", period: "FY2025", verified: true, ...changes });

describe("citation-bound metric presentation", () => {
  it("retains rounded model prose and separately shows the precise typed cited metric", () => {
    const c = claim();
    const n = metric();
    const text = displayClaimText(c, [n]);
    expect(text).toContain(c.text);
    expect(text).toContain(`cited measure: ${figureValueText(n)} (${metricLabel(source, n.unit)}`);
    expect(text).toContain("FY2025; as of 2025-12-31");
    expect(text).toContain("Original rounded claim");
    expect(readerPrecision(c.text, source)).toBe(c.text);
    expect(c.text).toBe("FCF conversion before SBC was -0.2x.");
  });

  it.each([
    "FCF conversion before SBC was -1.0x.",
    "FCF conversion before SBC was 100%.",
    "FCF conversion after SBC was 0.95796662x.",
    "The ratio was 0.2x and interest coverage was 4.7x.",
    "OTHER's FY2024 ratio was -0.2x.",
    "The absolute ratio was 20%.",
  ])("does not launder signed, percent, multioperand or entity/period claims: %s", (text) => {
    const rendered = displayClaimText(claim(text), [metric({ value: 0.95796662 })]);
    expect(rendered).toBe(text);
  });

  it.each(["+1.0x", "1.0×", "96%"])("annotates compatible positive scalar %s at the table precision", (value) => {
    const text = `FCF conversion before SBC was ${value}.`;
    expect(displayClaimText(claim(text), [metric({ value: 0.95796662 })])).toContain("96%");
    expect(displayClaimText(claim(text), [metric({ value: 0.95796662 })])).toContain("cited measure:");
  });

  it.each([
    "In Q1, FCF conversion before SBC was -0.2x.",
    "FCF conversion before SBC in Q1 was -0.2x.",
    "Nvidia's FCF conversion before SBC was -0.2x.",
    "Nvidia’s FCF conversion before SBC was -0.2x.",
    "Nvidia reported FCF conversion before SBC was -0.2x.",
    "FCF conversion before SBC for Nvidia was -0.2x.",
    "FCF conversion before SBC was -0.2x in Q1.",
    "NVIDIA FCF conversion before SBC was -0.2x.",
    "For the fiscal quarter ended 2025-12-31, FCF conversion before SBC was -0.2x.",
    "The accrual ratio was -0.2x.",
    "FCF conversion was -0.2x.",
    "FCF conversion before SBC was -0.2x. [Q1]",
    "FCF conversion before SBC was -0.2x. [Nvidia’s result]",
  ])("keeps unproven entity or measurement-window wording raw: %s", (text) => {
    expect(displayClaimText(claim(text), [metric()])).toBe(text);
  });

  it("does not bind a quarter claim to an annual duration sharing its end date", () => {
    const text = "For the fiscal quarter ended 2025-12-31, FCF conversion before SBC was -0.2x.";
    const n = metric({ periodContext: { kind: "duration", start: "2025-01-01", end: "2025-12-31", basis: "fiscal-year" } });
    expect(displayClaimText(claim(text), [n])).toBe(text);
  });

  it.each([
    [[]],
    [[metric(), metric({ value: 0.3 })]],
    [[metric({ source: "computed.other.fcf-conversion-before-sbc", sourceId: "computed.other.fcf-conversion-before-sbc" })]],
    [[metric({ asOf: "2024-12-31", period: "FY2024" })]],
    [[metric({ verified: false })]],
    [[metric({ unit: "%" })]],
  ] as const)("keeps missing, ambiguous, wrong-entity, wrong-date, wrong-unit or untraced bindings raw", (numbers) => {
    const text = displayClaimText(claim(), numbers);
    expect(text).toBe(claim().text);
  });

  it("uses the same annotation in web, Markdown and print without mutating report evidence", () => {
    const report = loadTask28Fixture();
    report.quality.graded.reasoning = [claim()];
    report.quality.graded.keyNumbers = [metric()];
    const before = JSON.stringify(report);
    const expected = displayClaimText(claim(), [metric()]);
    expect(reportToMarkdown(report).replace(/\\([\[\]])/g, "$1")).toContain(expected);
    expect(reportToPrintBody(report)).toContain(expected);
    expect(renderToStaticMarkup(createElement(GradeReasoning, { title: "quality", block: report.quality.graded }))).toContain(expected);
    expect(JSON.stringify(report)).toBe(before);
  });

  it.each([
    ["cash-flow", "cash-flow", "-0.2x", -0.2083, "-21%"],
    ["balance-sheet", "balance-sheet", "1.0x", 0.958, "96%"],
  ])("preserves legacy %s accrual wording when its typed metric lacks a measurement period", (label, suffix, raw, value, formatted) => {
    const id = `computed.forensics.accrual-ratio-${suffix}`;
    const c = claim(`The ${label} accrual ratio for the fiscal year ended 2025-12-31 was ${raw}.`);
    c.source = id; c.sourceId = id;
    const n = metric({ source: id, sourceId: id, value, period: undefined });
    expect(displayClaimText(c, [n])).toBe(c.text);
    expect(figureValueText(n)).toBe(formatted);
    expect(readerPrecision(c.text, id)).toBe(c.text);
  });
  it("admits matching accrual constructions without changing signed or absolute variants", () => {
    const id = "computed.forensics.accrual-ratio-cash-flow";
    const c = { ...claim("The cash-flow accrual ratio for FY2025 was −0.2x."), source: id, sourceId: id };
    const n = metric({ source: id, sourceId: id });
    expect(displayClaimText(c, [n])).toContain("cited measure: -21%");
    expect(displayClaimText({ ...c, text: c.text.replace("cash-flow", "balance-sheet") }, [n])).toBe(c.text.replace("cash-flow", "balance-sheet"));
    expect(displayClaimText({ ...c, text: c.text.replace("FY2025", "FY2024") }, [n])).toBe(c.text.replace("FY2025", "FY2024"));
    const absoluteId = "computed.scores.quality.accrualsRatioAbs";
    const absoluteClaim = { ...c, source: absoluteId, sourceId: absoluteId };
    expect(displayClaimText(absoluteClaim, [metric({ source: absoluteId, sourceId: absoluteId })])).toBe(c.text);
  });
});

describe("capital stewardship scope labels", () => {
  it("names the capital-stewardship proxy on every grade, score and weight descriptor", () => {
    for (const descriptors of [GRADE_SURFACES, SCORE_SURFACES, SCORE_WEIGHTS]) {
      const descriptor = descriptors.find(d => "key" in d ? d.key === "leadership" : d.aspect === "leadership");
      expect(descriptor?.label).toBe("Leadership (capital-stewardship proxy)");
    }
    expect(metricLabel("computed.scores.leadership.shareCountTrend")).toBe("Annualized weighted-average diluted common-share trend");
  });
});
