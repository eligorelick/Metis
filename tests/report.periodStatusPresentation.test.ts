import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { TracedStat } from "@/components/report/primitives";
import { reportToAuditMarkdown, reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { ReportSchema, type Report, type TracedNumber } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";

// D-62: an explicit-scale excerpt figure reads as the compact amount it states,
// and an absent measurement window is omitted rather than printed as "not supplied".
const cases = [
  { key: "Q2", period: "Q2 2026", value: 0.00427, money: "$4.27M" },
  { key: "H1", period: "H1 2026", value: 7.604, money: "$7.60B" },
  { key: "TTM", period: "TTM ending 2026-06-30", value: 12.34567, money: "$12.35B" },
  { key: "ABSENT", period: undefined, value: 9.8761, money: "$9.88B" },
] as const;

const exports = [
  { name: "Markdown", render: reportToMarkdown },
  { name: "print", render: reportToPrintBody },
];
const surfaces = [
  { name: "live", render: (report: Report) => renderToStaticMarkup(createElement(ReportView, { report })) },
  ...exports,
];

function trace(item: typeof cases[number]): TracedNumber {
  return {
    value: item.value, unit: "USD billions: Capital expenditures", currency: "USD",
    source: `PERIOD-BALANCE-${item.key}`, sourceId: "edgar:10-Q item2",
    asOf: "2026-06-30", ...(item.period ? { period: item.period } : {}),
    verified: false, verificationNote: "[unverified] text-context-mismatch",
  };
}

function reportWithPeriods(): Report {
  const report = loadTask28Fixture();
  report.fundamentals.growthTable = cases.map((item) => ({
    label: `PERIOD-GROWTH-${item.key}`,
    // A column/as-of date does not identify the flow's measurement window.
    values: [{ period: "2026-06-30", value: trace(item) }],
  }));
  report.balanceSheet.capexTrajectory.numbers = cases.map(trace);
  report.appendix.verificationLog = [{
    claim: "PERIOD-AUDIT-LOG", outcome: "unverified", evidenceKind: "number",
    source: "edgar:10-Q item2", traceKind: "untraced", reason: "text-context-mismatch",
  }];
  return ReportSchema.parse(report);
}

function rowWithin(output: string, marker: string): string {
  return (output.startsWith("#")
    ? output.split("\n")
    : Array.from(output.matchAll(/<tr(?:\s[^>]*)?>[\s\S]*?<\/tr>/g), (match) => match[0]))
    .find((row) => row.includes(marker)) ?? "row missing";
}

describe("measurement periods and failed numeric traces", () => {
  it.each(surfaces)("shows each stored metric period separately from the same as-of date in $name", ({ render }) => {
    const report = reportWithPeriods();
    const before = JSON.stringify(report);
    const output = render(report);
    for (const item of cases) {
      const row = rowWithin(output, `PERIOD-GROWTH-${item.key}`);
      if (item.period) expect(row).toContain(item.period);
      else expect(row).not.toContain("not supplied");
      expect(row).toContain("2026-06-30");
      expect(row).toContain(item.money);
    }
    expect(JSON.stringify(report)).toBe(before);
  });

  it.each(exports)("shows the stored balance-sheet number period in $name", ({ render }) => {
    const output = render(reportWithPeriods());
    for (const item of cases) {
      // The figure is labelled by its unit ("Capital expenditures"), not its registry id.
      const rows = output.startsWith("#")
        ? output.split("\n")
        : Array.from(output.matchAll(/<tr(?:\s[^>]*)?>[\s\S]*?<\/tr>/g), (match) => match[0]);
      const row = rows.find((line) => line.includes(item.money) && line.includes("Capital expenditures")) ?? "row missing";
      expect(row).toContain("Capital expenditures");
      expect(row).not.toContain(`PERIOD-BALANCE-${item.key}`);
      if (item.period) expect(row).toContain(item.period);
      expect(row).toContain("2026-06-30");
    }
  });

  it("shows number-card periods inline, including an absent period, without opening source details", () => {
    for (const item of cases) {
      const visible = renderToStaticMarkup(createElement(TracedStat, { label: item.key, n: trace(item) }))
        .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      if (item.period) expect(visible).toContain(`period ${item.period}`);
      else expect(visible).not.toContain("not supplied");
      expect(visible).toContain("as of 2026-06-30");
      expect(visible).toContain(item.money);
    }
  });

  it.each(surfaces)("labels a supplied citation that failed numeric matching as untraced in $name", ({ name, render }) => {
    const output = render(reportWithPeriods());
    const metricRow = rowWithin(output, "PERIOD-GROWTH-Q2");
    expect(metricRow).toContain(name === "live" ? 'aria-label="untraced"' : "untraced");
    expect(metricRow).not.toContain("uncited");
    // D-62: the verification log is in the audit export.
    const logRow = rowWithin(reportToAuditMarkdown(reportWithPeriods()), "PERIOD-AUDIT-LOG");
    expect(logRow).toContain("untraced");
    expect(logRow).not.toContain("uncited");
  });
});
