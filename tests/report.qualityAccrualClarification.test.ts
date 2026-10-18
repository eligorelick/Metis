import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QualityFlags } from "@/components/report/sections";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { displayClaimText, qualityAccrualClarifications } from "@/report/presentation";
import type { Report, TracedNumber } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";

const date = "2031-06-30";
const legacy = "computed.forensics.accrual-ratio-cash-flow";
const canonical = "computed.forensics.accruals.cashFlowAccrualRatio";
const prefix = "Structured measure clarification:";

function fixture(): Report {
  const report = loadTask28Fixture();
  report.quality.graded.reasoning = [{ label: "FACT", text: `The cash-flow accrual ratio for the fiscal year ended ${date} was negative 0.1x.`, source: legacy, sourceId: legacy, asOf: date }];
  report.quality.graded.keyNumbers = [
    { value: -0.1433, unit: "x", source: legacy, sourceId: legacy, asOf: date, verified: true },
    { value: -0.14327, unit: "x", source: canonical, sourceId: canonical, asOf: date, period: date, verified: true },
  ];
  return report;
}

function web(report: Report): string {
  return renderToStaticMarkup(createElement(QualityFlags, { quality: report.quality, index: 6 }));
}

describe("quality structured accrual clarification", () => {
  it("separately presents the canonical typed measure without admitting or changing model prose", () => {
    const report = fixture();
    const before = JSON.stringify(report);
    const claim = report.quality.graded.reasoning[0]!;
    const notes = qualityAccrualClarifications(report.quality);
    expect(notes).toMatchInlineSnapshot(`
      [
        "Structured measure clarification: Accrual ratio (cash-flow): -14% (recorded period: 2031-06-30; as of 2031-06-30). Original model wording is retained; this separate quality-section measure does not validate the entity or measurement window of the original claim.",
      ]
    `);
    expect(displayClaimText(claim, report.quality.graded.keyNumbers)).toBe(claim.text);
    for (const rendered of [web(report), reportToMarkdown(report), reportToPrintBody(report), reportToAuditMarkdown(report)]) {
      expect(rendered).toContain(prefix);
      expect(rendered).toContain("Accrual ratio (cash-flow): -14%");
      expect(rendered).toContain(`recorded period: ${date}; as of ${date}`);
      expect(rendered).toContain("does not validate the entity or measurement window of the original claim");
      expect(rendered).toContain(notes[0]!);
    }
    expect(web(report)).toContain(claim.text);
    expect(reportToMarkdown(report)).toContain(claim.text);
    expect(reportToPrintBody(report)).toContain(claim.text);
    expect(reportToAuditMarkdown(report)).toContain("-0.14327");
    expect(reportToAuditMarkdown(report)).toContain(canonical);
    expect(JSON.stringify(report)).toBe(before);
  });

  it("keeps cash-flow and balance-sheet measures separate and uses typed precision", () => {
    const report = fixture();
    report.quality.graded.reasoning.push({ ...report.quality.graded.reasoning[0]!, text: "The balance-sheet accrual ratio was 0.8x.", source: "computed.forensics.accrual-ratio-balance-sheet", sourceId: "computed.forensics.accrual-ratio-balance-sheet" });
    report.quality.graded.keyNumbers.push({ ...report.quality.graded.keyNumbers[1]!, source: "computed.forensics.accruals.balanceSheetAccrualRatio", sourceId: "computed.forensics.accruals.balanceSheetAccrualRatio", value: 0.82365 });
    expect(web(report)).toContain("Accrual ratio (balance-sheet): 82%");
    expect(web(report)).not.toContain("Accrual ratio (balance-sheet): 80%");
  });

  it.each([
    ["unverified", { verified: false }],
    ["unverified null", { verified: null }],
    ["missing period", { period: undefined }],
    ["empty period", { period: " " }],
    ["missing as of", { asOf: null }],
    ["different date", { asOf: "2030-06-30" }],
    ["wrong unit", { unit: "%" }],
    ["wrong sourceId", { sourceId: "computed.other.accruals.cashFlowAccrualRatio" }],
    ["absolute variant", { source: "computed.scores.quality.accrualsRatioAbs", sourceId: "computed.scores.quality.accrualsRatioAbs" }],
    ["different entity", { source: "computed.other.accruals.cashFlowAccrualRatio", sourceId: "computed.other.accruals.cashFlowAccrualRatio" }],
  ] satisfies [string, Partial<TracedNumber>][])("withholds a canonical clarification for %s", (_name, changes) => {
    const report = fixture();
    Object.assign(report.quality.graded.keyNumbers[1]!, changes);
    expect(web(report)).not.toContain(prefix);
  });

  it("withholds ambiguous canonical records and contradictory claim identities", () => {
    const report = fixture();
    report.quality.graded.keyNumbers.push({ ...report.quality.graded.keyNumbers[1]!, value: 0.7 });
    expect(web(report)).not.toContain(prefix);
    report.quality.graded.keyNumbers.pop();
    report.quality.graded.reasoning[0]!.sourceId = "computed.forensics.accrual-ratio-balance-sheet";
    expect(web(report)).not.toContain(prefix);
  });

  it("requires the quality section's exact cited association", () => {
    const report = fixture();
    report.fundamentals.graded.reasoning = report.quality.graded.reasoning;
    report.quality.graded.reasoning = [];
    expect(web(report)).not.toContain(prefix);
    expect(reportToMarkdown(report)).not.toContain(prefix);
  });

  it("requires exact claim identities and a nonnull matching as-of date", () => {
    for (const changes of [{ sourceId: undefined }, { asOf: null }, { asOf: "2030-06-30" }, { source: canonical }]) {
      const report = fixture();
      Object.assign(report.quality.graded.reasoning[0]!, changes);
      expect(qualityAccrualClarifications(report.quality)).toEqual([]);
    }
  });

  it.each(["", " ", "2031-02-29", "2031-13-01", "2031-06-31", "2031-6-30", "2031-06-30T00:00:00Z", "June 30, 2031"])("withholds matching but invalid as-of dates: %j", (invalidDate) => {
    const report = fixture();
    report.quality.graded.reasoning[0]!.asOf = invalidDate;
    report.quality.graded.keyNumbers[1]!.asOf = invalidDate;
    expect(qualityAccrualClarifications(report.quality)).toEqual([]);
  });

  it("withholds a mixed legacy claim identity even alongside an exact claim", () => {
    const report = fixture();
    report.quality.graded.reasoning.push({ ...report.quality.graded.reasoning[0]!, sourceId: "computed.other.accrual-ratio-cash-flow" });
    expect(qualityAccrualClarifications(report.quality)).toEqual([]);
  });

  it.each([
    { source: canonical, sourceId: "computed.other.accruals.cashFlowAccrualRatio" },
    { source: "computed.other.accruals.cashFlowAccrualRatio", sourceId: canonical },
  ])("withholds canonical source/sourceId collisions: %j", (identities) => {
    const report = fixture();
    report.quality.graded.keyNumbers.push({ ...report.quality.graded.keyNumbers[1]!, ...identities });
    expect(qualityAccrualClarifications(report.quality)).toEqual([]);
  });
});
