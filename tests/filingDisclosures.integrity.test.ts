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
      { date: "2026-04-26", reportedCurrency: "USD", revenue: 81_615e6 },
    );
    const checks = buildFilingDisclosures(bundle)!.guidanceChecks;
    expect(checks.find((c) => c.metric === "revenue")).toMatchObject({ actual: 95e9, position: "above" });
    expect(checks.some((c) => c.metric === "gross-margin")).toBe(false);
  });

  it("keeps current release currency across a quarterly/annual reporting-currency transition", () => {
    const bundle = withRelease(currencyBundle({ annualCurrency: "EUR", quarterCurrencies: ["USD", "USD", "EUR", "EUR"], siblingQuarterCurrencies: ["USD", "USD", "EUR", "EUR"] }));
    if (bundle.edgar.currentReports?.ok) bundle.edgar.currentReports.value.data.releases[0]!.reported.periodEnd = "2026-03-31";
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

  it("preserves ambiguity notes when no quarterly trend or other facts survive", () => {
    const bundle = currencyBundle();
    const income = rows(bundle, "incomeQuarterly");
    income.splice(0, income.length, { date: "2026-03-31", reportedCurrency: "USD", revenue: 1 }, { date: "2026-03-31", reportedCurrency: "USD", revenue: 2 });
    const result = buildFilingDisclosures(bundle);
    expect(result?.quarterlyTrend).toEqual([]);
    expect(result?.notes.join(" ")).toMatch(/ambiguous/);
  });

  it("does not relabel an older CAD release's implicit dollars as current USD", () => {
    const bundle = withRelease(currencyBundle({ quarterCurrencies: ["USD", "CAD", "CAD", "CAD"], annualCurrency: "CAD" }));
    const reports = bundle.edgar.currentReports;
    if (!reports?.ok) throw new Error("Missing fixture releases");
    const release = reports.value.data.releases[0]!;
    release.reported.periodEnd = "2025-12-31";
    release.workingCapital = { dso: 50, priorDso: null, comparison: null, receivables: 5e9, receivablesSymbol: "$", sentence: "Accounts receivable were $5 billion.", expectation: null, reason: null };
    const result = buildFilingDisclosures(bundle)!;
    expect(nextPeriodRevenueGuidance(bundle)).toBeNull();
    expect(result.guidance?.rows.filter((r) => r.unit !== "%")).toEqual([]);
    expect(result.freeCashFlow).toEqual([]);
    expect(result.reconciliation ?? []).toEqual([]);
    expect(result.capitalReturn?.returned).toBeNull();
    expect(result.filingFacts?.some((r) => r.key === "accounts-receivable")).not.toBe(true);
    expect(result.notes.join(" ")).toMatch(/CAD/);
    // An explicit US$ label is direct currency evidence, independent of the old CAD statement.
    for (const fact of release.freeCashFlow) fact.symbol = "US$";
    for (const fact of release.reconciliation ?? []) fact.symbol = "US$";
    for (const item of release.guidance?.items ?? []) if (item.symbol === "$") item.symbol = "US$";
    if (release.capitalReturn.returned) release.capitalReturn.returned.symbol = "US$";
    release.workingCapital!.receivablesSymbol = "US$";
    const explicit = buildFilingDisclosures(bundle)!;
    expect(nextPeriodRevenueGuidance(bundle)).toMatchObject({ currency: "USD" });
    expect(explicit.freeCashFlow.length).toBeGreaterThan(0);
    expect(explicit.reconciliation?.length).toBeGreaterThan(0);
    expect(explicit.capitalReturn?.returned).toBe(26e9);
    expect(explicit.filingFacts?.find((r) => r.key === "accounts-receivable")?.value).toBe(5e9);
  });

  it("binds historical periodic-note dollars to that filing's reporting period", () => {
    const bundle = currencyBundle({ quarterCurrencies: ["USD", "CAD", "CAD", "CAD"], annualCurrency: "CAD" });
    const text = readFileSync("fixtures/edgar/nvda-periodic-sections/nvda-10k-fy2026-notes.txt", "utf8");
    bundle.edgar.tenKNotes = { ok: true, value: {
      source: "edgar", endpoint: "notes", fetchedAt: bundle.builtAt, asOf: "2025-12-31",
      data: { sectionName: "tenKNotes", text, chars: text.length, method: "toc-anchor", form: "10-K", accession: "old-cad", reportDate: "2025-12-31", filingDate: "2026-02-25", documentUrl: "https://www.sec.gov/old" },
    } };
    const result = buildFilingDisclosures(bundle)!;
    expect(result.filingFacts?.some((f) => f.key === "deal-consideration-total")).not.toBe(true);
    expect(result.notes.join(" ")).toMatch(/source-period currency CAD/);
    if (!bundle.edgar.tenKNotes?.ok) throw new Error("Missing fixture annual notes");
    bundle.edgar.tenKNotes.value.data.text = text.replaceAll("$", "US$");
    expect(buildFilingDisclosures(bundle)?.filingFacts).toContainEqual(expect.objectContaining({ key: "deal-consideration-total", value: 17e9 }));
  });

  it("does not compare prior CAD implicit-dollar guidance against a USD actual", () => {
    const bundle = withRelease(currencyBundle({ quarterCurrencies: ["USD", "CAD", "CAD", "CAD"], annualCurrency: "CAD" }));
    const reports = bundle.edgar.currentReports;
    if (!reports?.ok) throw new Error("Missing fixture releases");
    reports.value.data.releases[0]!.reported.periodEnd = "2026-03-31";
    const prior = buildEarningsReleaseRecord({
      filing: { accessionNumber: "prior-cad", filingDate: "2026-05-20", acceptanceDateTime: undefined },
      releaseUrl: "https://www.sec.gov/prior", commentaryUrl: null,
      releaseText: readFileSync("fixtures/edgar/nvda-current-reports/q1fy27-ex99-1.txt", "utf8"), commentaryText: null, includeNarrative: true,
    });
    prior.reported.periodEnd = "2025-12-31";
    reports.value.data.releases.push(prior);
    expect(buildFilingDisclosures(bundle)!.guidanceChecks.some((c) => c.metric === "revenue")).toBe(false);
    const revenueGuide = prior.guidance!.items.find((i) => i.metric === "revenue")!;
    revenueGuide.symbol = "US$";
    expect(buildFilingDisclosures(bundle)!.guidanceChecks.find((c) => c.metric === "revenue")?.actual).toBe(300 * M);
  });

  it("keeps an unmatched release period unknown instead of inheriting the latest quarter", () => {
    const bundle = withRelease(currencyBundle());
    expect(nextPeriodRevenueGuidance(bundle)).toBeNull();
    const result = buildFilingDisclosures(bundle)!;
    expect(result.freeCashFlow).toEqual([]);
    expect(result.notes.join(" ")).toMatch(/period's statement currency is unestablished/);
  });
});
