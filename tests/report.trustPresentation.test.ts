import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { FundamentalsSection } from "@/components/report/sections";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { ReportSchema, type Report } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";

const surfaces = [
  { name: "live", render: (report: Report) => renderToStaticMarkup(createElement(ReportView, { report })) },
  { name: "Markdown", render: reportToMarkdown },
  { name: "print", render: reportToPrintBody },
];

const metricGroups = ["growthTable", "marginTrend", "returns", "fcf"] as const;

function reportWithMetricStatuses(): Report {
  const report = loadTask28Fixture();
  for (const group of metricGroups) {
    report.fundamentals[group] = [{
      label: `AUDIT-${group}`,
      values: [true, false, null].map((verified, index) => ({
        period: `FY${2023 + index}`,
        value: {
          value: (index + 1) * 10,
          unit: "percent",
          currency: null,
          period: `FY${2023 + index}`,
          source: "edgar:10-K item7",
          sourceId: "edgar:10-K item7",
          asOf: "2025-12-31",
          verified,
          ...(verified === false ? { verificationNote: "[unverified] text-ambiguous" } : {}),
        },
      })),
    }];
  }
  return ReportSchema.parse(report);
}

describe("report trust presentation", () => {
  // D-62 (audit P0-7): the header says what was verified, kind by kind,
  // instead of leading with a "0/N validated" prose-claim ratio.
  it.each(surfaces)("keeps factual prose and numeric figure denominators separate in $name", ({ render }) => {
    const report = loadTask28Fixture();
    const coverage = {
      numeric: { supported: 107, total: 119, rate: 107 / 119 },
      factualClaims: { supported: 38, total: 38, rate: 1 },
      judgments: { cited: 0, total: 0, rate: null },
      factualValidation: { cited: 38, validated: 0, contradicted: 0, unchecked: 38, total: 38, rate: 0 },
    };
    report.meta.provenanceCoverage = coverage;
    report.appendix.provenanceCoverage = coverage;

    const output = render(ReportSchema.parse(report))
      .match(/\d+\/\d+ \(\d+%\) figures traced to a cited source[^<\n|]+/)?.[0];

    expect(output).toContain("107/119 (90%) figures traced to a cited source");
    expect(output).toContain("38/38 factual claims cited");
    // A report recorded before the qualitative split counts every claim as numeric.
    expect(output).toContain("0/38 numeric claims validated");
    expect(output).toContain("0 contradicted");
    expect(output).not.toContain("Factual prose claims");
  });

  it.each(surfaces)("does not headline 0/N validated when every factual claim is qualitative in $name", ({ render }) => {
    const report = loadTask28Fixture();
    const coverage = {
      numeric: { supported: 286, total: 292, rate: 286 / 292 },
      factualClaims: { supported: 30, total: 30, rate: 1 },
      judgments: { cited: 70, total: 70, rate: 1 },
      factualValidation: { cited: 30, validated: 0, contradicted: 0, unchecked: 30, qualitative: 30, total: 30, rate: 0 },
    };
    report.meta.provenanceCoverage = coverage;
    report.appendix.provenanceCoverage = coverage;
    const output = render(ReportSchema.parse(report));

    expect(output).toContain("286/292 (98%) figures traced to a cited source");
    expect(output).toContain("no factual claim states a figure to validate");
    expect(output).toContain("30 qualitative claims cited, not machine-checkable");
    expect(output).not.toMatch(/0\/30 (?:numeric claims )?validated/);
  });

  // D-62: the measurement window joins the period cell only when it adds
  // information; a citation-traced figure is marked ✓.
  it.each(metricGroups)("retains each %s value's citation status in Markdown", (group) => {
    const output = reportToMarkdown(reportWithMetricStatuses()).split("\n")
      .filter((line) => line.includes(`AUDIT-${group}`) || line.startsWith("| Metric | Period |"))
      .join("\n");

    expect(output).toContain("| Metric | Period | Value | As of | Cited |");
    expect(output).toContain(`| AUDIT-${group} | FY2023 | 10.0% | 2025-12-31 | ✓ |`);
    expect(output).toContain(`| AUDIT-${group} | FY2024 | 20.0% | 2025-12-31 | untraced |`);
    expect(output).toContain(`| AUDIT-${group} | FY2025 | 30.0% | 2025-12-31 | not checked |`);
  });

  it.each(metricGroups)("retains each %s value's citation status in print", (group) => {
    const output = reportToPrintBody(reportWithMetricStatuses());
    const rows = Array.from(output.matchAll(/<tr>.*?<\/tr>/gs), (match) => match[0])
      .filter((row) => row.includes(`AUDIT-${group}`));

    expect(rows).toHaveLength(3);
    expect(output.includes("<th>Cited</th>")).toBe(true);
    expect(rows[0]).toContain("<td>✓</td>");
    expect(rows[1]).toContain("<td>untraced</td>");
    expect(rows[2]).toContain("<td>not checked</td>");
  });

  it("retains citation indicators for all fundamentals values in the live view", () => {
    const report = reportWithMetricStatuses();
    const output = renderToStaticMarkup(createElement(FundamentalsSection, {
      fundamentals: { ...report.fundamentals, graded: { ...report.fundamentals.graded, keyNumbers: [] } },
      index: 3,
    }));

    expect(output.match(/aria-label="citation-traced"/g)).toHaveLength(4);
    expect(output.match(/aria-label="untraced"/g)).toHaveLength(4);
    expect(output.match(/aria-label="citation check not run"/g)).toHaveLength(4);
  });
});
