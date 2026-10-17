import { describe, expect, it } from "vitest";
import { parseIssuerFreeCashFlow, parseReconciliation } from "@/edgar/currentReports";
import { buildEarningsReleaseRecord, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const definition = "Free Cash Flow is defined as net cash flow provided by operating activities less capital expenditures.";
const header = "Three months ended June 30, Six months ended June 30, 2026 2025 2026 2025 (In millions)";
const body = `${definition} Financial Highlights Free cash flow $ 810 $ 710 14% Free Cash Flow ${header} Net cash provided by operating activities $ 1,010 $ 900 $ 2,040 $ 1,830 Less: Total capital expenditures (200) (190) (410) (400) Free cash flow $ 810 $ 710 $ 1,630 $ 1,430 Adjusted Expenses ${header} Cost of revenue 100 90 200 180`;

describe("compact issuer free cash flow reconciliation", () => {
  it("reads the reconciled table rather than summary and preserves quarter and six-month bases", () => {
    expect(parseIssuerFreeCashFlow(body)).toEqual([
      { value: 810e6, symbol: "$", periodEnd: "2026-06-30", months: 3, definition },
      { value: 710e6, symbol: "$", periodEnd: "2025-06-30", months: 3, definition },
      { value: 1630e6, symbol: "$", periodEnd: "2026-06-30", months: 6, definition },
      { value: 1430e6, symbol: "$", periodEnd: "2025-06-30", months: 6, definition },
    ]);
    const rows = parseReconciliation(body);
    expect(rows).toHaveLength(8);
    expect(rows).toEqual(expect.arrayContaining([
      { metric: "operating-cash-flow", value: 1010e6, unit: "currency", symbol: "$", periodEnd: "2026-06-30", months: 3 },
      { metric: "total-capital-expenditures", value: 410e6, unit: "currency", symbol: "$", periodEnd: "2026-06-30", months: 6 },
    ]));
  });
  it("renders source-bound issuer FCF and total capital expenditures without narrowing the capex scope", () => {
    const bundle = completeCurrencyBundle({ annualCurrency: "USD" });
    if (bundle.statements.incomeQuarterly.ok) bundle.statements.incomeQuarterly.value.data.rows.unshift({ date: "2026-06-30", reportedCurrency: "USD", revenue: 4e9 });
    const url = "https://www.sec.gov/issuer-fcf.htm";
    const record = buildEarningsReleaseRecord({ filing: { accessionNumber: "fcf-source", filingDate: "2026-08-05" }, releaseUrl: url, commentaryUrl: null, releaseText: `Financial Results for Second Quarter 2026. Quarter ended June 30, 2026. ${body}`, commentaryText: null, includeNarrative: true });
    bundle.edgar.currentReports = { ok: true, value: { data: { version: CURRENT_REPORTS_VERSION, releases: [record], events: [], notes: [] }, source: "edgar", asOf: "2026-08-05", endpoint: url, fetchedAt: "2026-10-13T00:00:00Z" } };
    const d = buildFilingDisclosures(bundle);
    expect(d?.freeCashFlow).toHaveLength(4);
    expect(d?.freeCashFlow.every((r) => r.source.url === url)).toBe(true);
    expect(d?.freeCashFlowDefinition).toBe(definition);
    const table = filingDisclosureTables(d, "fundamentals").find((t) => t.heading === "Issuer free-cash-flow reconciliation");
    expect(table?.rows).toEqual(expect.arrayContaining([
      expect.arrayContaining(["Total capital expenditures (positive outflow)", "$200M"]),
      expect.arrayContaining(["Free cash flow (issuer definition, as reported)", "$810M"]),
    ]));
  });
  it.each([
    body.replaceAll("Six months ended June 30", "Six months ended September 30"),
    body.replaceAll("2026 2025 2026 2025", "2026 2025 2026 2024"),
    body.replaceAll("June 30", "June 31"),
    body.replaceAll("(In millions)", "(In billions)"),
    body.replace("$ 1,010 $ 900 $ 2,040 $ 1,830", "$ 1,010 $ 900 $ 2,040 $ 1,830 $ 123"),
    body.replace("(200) (190) (410) (400)", "(200) (190) (410)"),
    body.replace("$ 810 $ 710 $ 1,630 $ 1,430", "$ 810 $ 710 $ 1,630 $ 1,430 $ 123"),
    body.replace("(200) (190) (410) (400)", "200 190 410 400"),
    body.replace("$ 1,010 $ 900 $ 2,040 $ 1,830", "1,010 900 2,040 1,830"),
    body.replace("$ 810 $ 710 $ 1,630 $ 1,430", "810 710 1,630 1,430"),
    body.replace("$ 1,010 $ 900", "$ 1,010.1 $ 900"),
    body.replace("$ 810 $ 710 $ 1,630 $ 1,430", "$ 820 $ 710 $ 1,630 $ 1,430"),
    body.replace("Free Cash Flow Three", "Selected Cash Metrics Three"),
    `${definition} Financial Highlights Free cash flow $ 810 $ 710 14%`,
    `${body} ${body}`,
  ])("withholds incomplete, ambiguous, wrong-period, wrong-taxonomy or unreconciled tables", (text) => {
    expect(parseIssuerFreeCashFlow(text)).toEqual([]);
    expect(parseReconciliation(text)).toEqual([]);
  });
});
