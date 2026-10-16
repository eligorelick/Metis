import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { formatFinancialAmount, formatFinancialValue } from "@/report/format";
import { ReportSchema, type Report } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";

// D-62: an explicit excerpt unit ("USD millions: Free cash flow") is shown as the
// compact amount it states with its label ("$7.60B (Free cash flow)"), replacing
// the "$7,604.00 millions: Free cash flow" spelling. The established-currency rule
// is unchanged; a nonzero amount too small for two decimals keeps three
// significant digits. Tables whose metric column already names the figure show
// the amount alone.
const explicitCases = [
  { value: 197, unit: "USD billions: Net sales guidance", currency: null, expected: "$197.00B (Net sales guidance)", amount: "$197.00B" },
  { value: 197_000, unit: "USD millions: Net sales guidance", currency: "USD", expected: "$197.00B (Net sales guidance)", amount: "$197.00B" },
  { value: -7_604, unit: "currency millions: Free cash flow", currency: "USD", expected: "−$7.60B (Free cash flow)", amount: "−$7.60B" },
  { value: 7_604, unit: "currency millions: Free cash flow", currency: "TWD", expected: "7.60B TWD (Free cash flow)", amount: "7.60B TWD" },
  { value: 7_604, unit: "currency millions: Free cash flow", currency: null, expected: "7.60B (currency unknown) (Free cash flow)", amount: "7.60B (currency unknown)" },
  { value: 197, unit: "USD billions: Net sales guidance", currency: "EUR", expected: "197.00B (currency unknown) (Net sales guidance)", amount: "197.00B (currency unknown)" },
  { value: 0, unit: "CHF thousand: Operating cash flow", currency: "CHF", expected: "0.00 CHF (Operating cash flow)", amount: "0.00 CHF" },
  { value: 1.25, unit: "USD trillion: Total assets", currency: null, expected: "$1.25T (Total assets)", amount: "$1.25T" },
  { value: 0.00427, unit: "USD billions: Free cash flow", currency: "USD", expected: "$4.27M (Free cash flow)", amount: "$4.27M" },
  { value: 7.604, unit: "USD billions: Free cash flow", currency: "USD", expected: "$7.60B (Free cash flow)", amount: "$7.60B" },
  { value: 12.34567, unit: "currency millions: Operating cash flow", currency: "TWD", expected: "12.35M TWD (Operating cash flow)", amount: "12.35M TWD" },
  { value: -0.00427, unit: "USD billions: Free cash flow", currency: null, expected: "−$4.27M (Free cash flow)", amount: "−$4.27M" },
  { value: 4.27e-25, unit: "USD billions: Free cash flow", currency: "USD", expected: "$4.27e-16 (Free cash flow)", amount: "$4.27e-16" },
] as const;

describe("explicit scaled currency display", () => {
  it.each(explicitCases)("states the declared scale compactly in the established currency: $unit ($currency)", ({ value, unit, currency, expected, amount }) => {
    expect(formatFinancialValue(value, unit, currency)).toBe(expected);
    expect(formatFinancialAmount(value, unit, currency)).toBe(amount);
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
  ])("shows each scaled amount in its established currency in $name without rescaling stored values", ({ render }) => {
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

    for (const { amount } of explicitCases) {
      expect(output.includes(amount), amount).toBe(true);
    }
    expect(JSON.stringify(parsed)).toBe(before);
  });
});
