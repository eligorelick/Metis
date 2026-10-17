import { describe, expect, it } from "vitest";
import { parseReconciliation } from "@/edgar/currentReports";
import { buildEarningsReleaseRecord, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const header = "Three months ended June 30, Six months ended June 30, 2026 2025 2026 2025 (In millions, except share and per share data)";
const body = `Adjusted Net Income (Loss) & Adjusted EPS ${header} Net income attributable to the Company $ 900 $ 400 $ 1,000 $ 200 GAAP diluted earnings per share $ 7.20 $ 2.40 $ 7.00 $ 1.00 Amortization of intangible assets 0.10 0.08 0.15 0.17 Stock-based compensation 0.94 0.81 1.76 1.55 Income tax effects and adjustments (0.20) (0.36) (0.38) (0.63) Adjustment to GAAP dilutive securities (1) — 0.08 — 0.03 Adjusted earnings per share (2) $ 5.80 $ 4.20 $ 7.60 $ 4.60 GAAP diluted weighted average shares outstanding (000's) 122,000 132,000 123,000 134,000`;
describe("compact issuer EPS reconciliations", () => {
  it("binds four GAAP and issuer-adjusted EPS columns to their own quarter/year-to-date periods", () => {
    const rows = parseReconciliation(body);
    expect(rows).toEqual(expect.arrayContaining([
      { metric: "gaap-diluted-eps", value: 7.2, unit: "currency-per-share", symbol: "$", periodEnd: "2026-06-30", months: 3 },
      { metric: "non-gaap-diluted-eps", value: 5.8, unit: "currency-per-share", symbol: "$", periodEnd: "2026-06-30", months: 3 },
      { metric: "gaap-diluted-eps", value: 1, unit: "currency-per-share", symbol: "$", periodEnd: "2025-06-30", months: 6 },
      { metric: "non-gaap-diluted-eps", value: 7.6, unit: "currency-per-share", symbol: "$", periodEnd: "2026-06-30", months: 6 },
    ]));
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.value < 10)).toBe(true);
  });
  it("renders the sourced aggregate per-share bridge without assigning item-level taxes", () => {
    const bundle = completeCurrencyBundle({ annualCurrency: "USD" });
    if (bundle.statements.incomeQuarterly.ok) bundle.statements.incomeQuarterly.value.data.rows.unshift({ date: "2026-06-30", reportedCurrency: "USD", revenue: 4e9 });
    const record = buildEarningsReleaseRecord({ filing: { accessionNumber: "eps-source", filingDate: "2026-08-05" }, releaseUrl: "https://www.sec.gov/eps.htm", commentaryUrl: null, releaseText: `Financial Results for Second Quarter 2026. Quarter ended June 30, 2026. ${body}`, commentaryText: null, includeNarrative: true });
    bundle.edgar.currentReports = { ok: true, value: { data: { version: CURRENT_REPORTS_VERSION, releases: [record], events: [], notes: [] }, source: "edgar", asOf: "2026-08-05", endpoint: "https://www.sec.gov/eps.htm", fetchedAt: "2026-10-13T00:00:00Z" } };
    const d = buildFilingDisclosures(bundle);
    const table = filingDisclosureTables(d, "fundamentals").find((t) => /^GAAP to non-GAAP diluted EPS/.test(t.heading));
    expect(table?.rows).toEqual(expect.arrayContaining([
      expect.arrayContaining(["GAAP diluted EPS", "$7.20"]),
      expect.arrayContaining(["Non-GAAP adjustments, net of tax (non-GAAP less GAAP)", "−$1.40"]),
      expect.arrayContaining(["Non-GAAP diluted EPS", "$5.80"]),
    ]));
    expect(table?.note).toMatch(/share.*(?:denominator|count)|denominator/i);
    expect(d?.reconciliation?.every((r) => r.source.url === "https://www.sec.gov/eps.htm")).toBe(true);
  });
  it.each([
    body.replace("Six months ended June 30", "Six months ended September 30"),
    body.replace("2026 2025 2026 2025", "2026 2025 2026 2024"),
    body.replace("$ 7.20 $ 2.40 $ 7.00 $ 1.00", "$ 7.20 $ 2.40 $ 7.00 $ 1.00 $ 99"),
    body.replace("Adjusted Net Income (Loss) & Adjusted EPS", "Selected Operating Metrics"),
    body.replace("Adjusted earnings per share (2)", `${header} Adjusted earnings per share (2)`),
  ])("rejects wrong periods, ambiguous columns and unrelated table taxonomy", (text) => {
    expect(parseReconciliation(text)).toEqual([]);
  });
});
