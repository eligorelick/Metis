import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildFilingDisclosures, nextPeriodRevenueGuidance, statementReportingCurrency } from "@/pipeline/filingDisclosures";
import { runStageB } from "@/pipeline/compute";
import type { DataBundle } from "@/pipeline/types";
import { buildEarningsReleaseRecord, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
import { currencyBundle, M } from "./helpers/currencyBundle";

function rows(bundle: DataBundle, key: "incomeQuarterly" | "incomeAnnual" | "cashflowQuarterly") {
  const result = bundle.statements[key];
  if (!result.ok) throw new Error(`Missing fixture ${key}`);
  return result.value.data.rows;
}

function withRelease(bundle: DataBundle): DataBundle {
  const release = buildEarningsReleaseRecord({
    filing: { accessionNumber: "0001045810-26-000073", filingDate: "2026-08-26", acceptanceDateTime: undefined },
    releaseUrl: "https://www.sec.gov/Archives/edgar/data/1045810/release.htm",
    commentaryUrl: null,
    releaseText: readFileSync("fixtures/edgar/nvda-current-reports/q2fy27-ex99-1.txt", "utf8"),
    commentaryText: null,
    includeNarrative: true,
  });
  bundle.edgar.currentReports = { ok: true, value: {
    source: "edgar", endpoint: "currentReports", asOf: "2026-08-26", fetchedAt: bundle.builtAt,
    data: { version: CURRENT_REPORTS_VERSION, releases: [release], events: [], notes: [] },
  } };
  return bundle;
}

describe("filing disclosures statement integrity", () => {
  it("selects the later whole income and cash-flow restatement regardless of provider order", () => {
    const bundle = currencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    const income = rows(bundle, "incomeQuarterly");
    const cash = rows(bundle, "cashflowQuarterly");
    const original = { ...income[0], acceptedDate: "2026-05-01 12:00:00" };
    const amended = { ...original, acceptedDate: "2026-05-02 12:00:00", revenue: 400 * M, operatingIncome: null, epsDiluted: 0.8 };
    income.splice(0, 1, original, amended);
    const oldCash = { ...cash[0], filingDate: "2026-05-01" };
    const newCash = { ...oldCash, filingDate: "2026-05-02", operatingCashFlow: 80 * M, capitalExpenditure: -12 * M };
    cash.splice(0, 1, oldCash, newCash);
    const before = structuredClone(bundle);
    const expected = { revenue: 400 * M, operatingMarginPct: null, epsDiluted: 0.8, operatingCashFlow: 80 * M, freeCashFlow: 68 * M };
    expect(buildFilingDisclosures(bundle)?.quarterlyTrend[0]).toMatchObject(expected);
    expect(bundle).toEqual(before);
    income.reverse(); cash.reverse();
    expect(buildFilingDisclosures(bundle)?.quarterlyTrend[0]).toMatchObject(expected);
    // Import and execute the complete Stage B graph as well as the disclosure entry point.
    expect(() => runStageB(bundle)).not.toThrow();
  });

  it.each(["missing", "tied"])("rejects %s-recency duplicates rather than choosing a provider-order winner", (recency) => {
    const bundle = currencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    const income = rows(bundle, "incomeQuarterly");
    const cash = rows(bundle, "cashflowQuarterly");
    const stamp = recency === "tied" ? { acceptedDate: "2026-02-15 12:00:00" } : {};
    income.splice(1, 1, { ...income[1], ...stamp }, { ...income[1], ...stamp, revenue: 999 * M });
    cash.splice(0, 1, { ...cash[0] }, { ...cash[0], operatingCashFlow: 999 * M });
    const result = buildFilingDisclosures(bundle)!;
    expect(result.quarterlyTrend.some((r) => r.periodEnd === "2025-12-31")).toBe(false);
    expect(result.quarterlyTrend[0]).toMatchObject({ operatingCashFlow: null, freeCashFlow: null, revenueQoqPct: null });
    expect(result.notes.join(" ")).toMatch(/ambiguous/i);
  });

  it("rejects invalid period ends using the shared strict date policy", () => {
    const bundle = currencyBundle();
    rows(bundle, "incomeQuarterly").push({ date: "2026-02-30", reportedCurrency: "USD", revenue: 999 });
    expect(buildFilingDisclosures(bundle)?.quarterlyTrend.some((r) => r.periodEnd === "2026-02-30")).toBe(false);
  });

  it("uses the same normalized whole row for guidance actuals", () => {
    const bundle = withRelease(currencyBundle());
    const reports = bundle.edgar.currentReports;
    if (!reports?.ok) throw new Error("Missing fixture releases");
    reports.value.data.releases.push(buildEarningsReleaseRecord({
      filing: { accessionNumber: "0001045810-26-000052", filingDate: "2026-05-20", acceptanceDateTime: undefined },
      releaseUrl: "https://www.sec.gov/Archives/edgar/data/1045810/prior.htm", commentaryUrl: null,
      releaseText: readFileSync("fixtures/edgar/nvda-current-reports/q1fy27-ex99-1.txt", "utf8"), commentaryText: null, includeNarrative: true,
    }));
    rows(bundle, "incomeQuarterly").unshift(
      { date: "2026-07-26", reportedCurrency: "USD", acceptedDate: "2026-08-26 12:00:00", revenue: 90e9, grossProfit: 45e9 },
      { date: "2026-07-26", reportedCurrency: "USD", acceptedDate: "2026-09-01 12:00:00", revenue: 95e9 },
    );
    const checks = buildFilingDisclosures(bundle)!.guidanceChecks;
    expect(checks.find((c) => c.metric === "revenue")).toMatchObject({ actual: 95e9, position: "above" });
    expect(checks.some((c) => c.metric === "gross-margin")).toBe(false);
  });

  it("keeps current release currency across a quarterly/annual reporting-currency transition", () => {
    const bundle = withRelease(currencyBundle({ annualCurrency: "EUR", quarterCurrencies: ["USD", "USD", "EUR", "EUR"], siblingQuarterCurrencies: ["USD", "USD", "EUR", "EUR"] }));
    expect(statementReportingCurrency(bundle)).toBe("USD");
    expect(nextPeriodRevenueGuidance(bundle)).toMatchObject({ currency: "USD", mid: 108e9 });
    const result = buildFilingDisclosures(bundle)!;
    expect(result.currency).toBe("USD");
    expect(result.quarterlyTrend.map((r) => r.periodEnd)).toEqual(["2026-03-31", "2025-12-31"]);
    expect(result.quarterlyTrend[0]?.revenueYoyPct).toBeNull();
    expect(result.notes.join(" ")).toMatch(/currency/i);
  });

  it("uses same-filing currency evidence, but never older annual currency for an unlabelled current quarter", () => {
    const linked = currencyBundle({ quarterCurrencies: [null, "USD", "USD", "USD"], siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"], filingLinks: "shared" });
    expect(statementReportingCurrency(linked)).toBe("USD");
    const unlinked = currencyBundle({ quarterCurrencies: [null, "USD", "USD", "USD"], siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    expect(statementReportingCurrency(unlinked)).toBeNull();
    expect(buildFilingDisclosures(withRelease(unlinked))?.quarterlyTrend).toEqual([]);
    const conflict = currencyBundle({ siblingQuarterCurrencies: ["EUR", "USD", "USD", "USD"], filingLinks: "shared" });
    expect(statementReportingCurrency(conflict)).toBeNull();
  });

  it("resolves current currency from the selected restatement and withholds an ambiguous latest period", () => {
    const bundle = currencyBundle({ annualCurrency: "EUR" });
    const income = rows(bundle, "incomeQuarterly");
    const old = { ...income[0], acceptedDate: "2026-05-01 12:00:00" };
    const amended = { ...old, reportedCurrency: "USD", acceptedDate: "2026-05-02 12:00:00" };
    income.splice(0, 1, old, amended);
    expect(statementReportingCurrency(bundle)).toBe("USD");
    amended.acceptedDate = old.acceptedDate;
    expect(statementReportingCurrency(bundle)).toBeNull();
  });

  it("withholds unknown/incompatible historical currency and unmatched cash amounts", () => {
    const bundle = currencyBundle({ quarterCurrencies: ["USD", null, "USD", "USD"], cashflowQuarterCurrencies: ["EUR", "USD", "USD", "USD"] });
    const result = buildFilingDisclosures(bundle)!;
    expect(result.quarterlyTrend).toHaveLength(1);
    expect(result.quarterlyTrend[0]).toMatchObject({ operatingCashFlow: null, freeCashFlow: null, revenueQoqPct: null, revenueYoyPct: null });
  });

  it("uses the latest annual currency only when quarterly income is absent", () => {
    const bundle = currencyBundle({ incomeAnnualCurrencies: ["USD", "EUR", "EUR"] });
    rows(bundle, "incomeQuarterly").splice(0);
    expect(statementReportingCurrency(bundle)).toBe("USD");
    rows(bundle, "incomeQuarterly").push({ date: "2026-02-30", reportedCurrency: "USD" });
    expect(statementReportingCurrency(bundle)).toBeNull();
  });
});
