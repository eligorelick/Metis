import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { formatFinancialValue } from "@/report/format";
import { ReportSchema, type Report } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";

const explicitCases = [
  { value: 197, unit: "USD billions: Net sales guidance", currency: null, expected: "$197.00 billions: Net sales guidance" },
  { value: 197_000, unit: "USD millions: Net sales guidance", currency: "USD", expected: "$197,000.00 millions: Net sales guidance" },
  { value: -7_604, unit: "currency millions: Free cash flow", currency: "USD", expected: "$-7,604.00 millions: Free cash flow" },
  { value: 7_604, unit: "currency millions: Free cash flow", currency: "TWD", expected: "7,604.00 TWD millions: Free cash flow" },
  { value: 7_604, unit: "currency millions: Free cash flow", currency: null, expected: "7,604.00 (currency unknown) millions: Free cash flow" },
  { value: 197, unit: "USD billions: Net sales guidance", currency: "EUR", expected: "197.00 (currency unknown) billions: Net sales guidance" },
  { value: 0, unit: "CHF thousand: Operating cash flow", currency: "CHF", expected: "0.00 CHF thousand: Operating cash flow" },
  { value: 1.25, unit: "USD trillion: Total assets", currency: null, expected: "$1.25 trillion: Total assets" },
  { value: 0.00427, unit: "USD billions: Free cash flow", currency: "USD", expected: "$0.00427 billions: Free cash flow" },
  { value: 7.604, unit: "USD billions: Free cash flow", currency: "USD", expected: "$7.604 billions: Free cash flow" },
  { value: 12.34567, unit: "currency millions: Operating cash flow", currency: "TWD", expected: "12.34567 TWD millions: Operating cash flow" },
  { value: -0.00427, unit: "USD billions: Free cash flow", currency: null, expected: "$-0.00427 billions: Free cash flow" },
  { value: 4.27e-25, unit: "USD billions: Free cash flow", currency: "USD", expected: "$0.000000000000000000000000427 billions: Free cash flow" },
] as const;

describe("explicit scaled currency display", () => {
  it.each(explicitCases)("preserves the declared scale and established currency: $unit ($currency)", ({ value, unit, currency, expected }) => {
    expect(formatFinancialValue(value, unit, currency)).toBe(expected);
  });

  it.each([
    { value: 197, unit: "USD billions Net sales guidance", currency: "USD", expected: "197.00 USD billions Net sales guidance" },
    { value: 197, unit: "currency millions Free cash flow", currency: "USD", expected: "197.00 currency millions Free cash flow" },
    { value: 197, unit: "USD millions billions: Net sales guidance", currency: "USD", expected: "197.00 USD millions billions: Net sales guidance" },
    { value: 197, unit: "USD zillions: Net sales guidance", currency: "USD", expected: "197.00 USD zillions: Net sales guidance" },
    { value: 197, unit: "USD", currency: "USD", expected: "$197.00" },
  ])("does not infer a scale from legacy or malformed units: $unit", ({ value, unit, currency, expected }) => {
    expect(formatFinancialValue(value, unit, currency)).toBe(expected);
  });

  it.each([
    { name: "live", render: (report: Report) => renderToStaticMarkup(createElement(ReportView, { report })) },
    { name: "Markdown", render: reportToMarkdown },
    { name: "print", render: reportToPrintBody },
  ])("retains printed currency and scale in $name without rescaling stored values", ({ render }) => {
    const report = loadTask28Fixture();
    report.fundamentals.growthTable = [{
      label: "Scaled filing values",
      values: explicitCases.map(({ value, unit, currency }, index) => ({
        period: `FY${2026 + index}`,
        value: { value, unit, currency, source: "edgar:10-Q item2", asOf: "2026-06-30", verified: true },
      })),
    }];
    const parsed = ReportSchema.parse(report);
    const before = JSON.stringify(parsed);
    const output = render(parsed).replace(/<[^>]+>/g, "");

    for (const { expected } of explicitCases) {
      expect(output.includes(expected), expected).toBe(true);
    }
    expect(JSON.stringify(parsed)).toBe(before);
  });
});
