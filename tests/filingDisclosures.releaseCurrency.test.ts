import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildFilingDisclosures, nextPeriodRevenueGuidance } from "@/pipeline/filingDisclosures";
import type { DataBundle } from "@/pipeline/types";
import { buildEarningsReleaseRecord, CURRENT_REPORTS_VERSION, type EarningsReleaseRecord } from "@/providers/currentReports";
import { currencyBundle, type CurrencyBundleOptions } from "./helpers/currencyBundle";

// Audit 2026-10-22 B-27: in the earnings window the newest release reports a
// quarter no statement row covers yet, so its "$" could not be bound to a
// currency. Its dollar guidance was withheld with a false "not the
// statements'" reason, and the DCF lost its guidance anchor.

/** Quarterly revenue (millions) at the scale of the NVIDIA release, inside the revenue-guide band. */
const NVDA_QUARTER = 90_000;

/** Statements end 2026-03-31; the release reports the quarter ended 2026-07-26. */
function windowBundle(opts: CurrencyBundleOptions = {}): { bundle: DataBundle; release: EarningsReleaseRecord } {
  const bundle = currencyBundle({ quarterlyRevenue: NVDA_QUARTER, ...opts });
  const release = buildEarningsReleaseRecord({
    filing: { accessionNumber: "0001045810-26-000073", filingDate: "2026-08-26", acceptanceDateTime: undefined },
    releaseUrl: "https://www.sec.gov/Archives/edgar/data/1045810/release.htm", commentaryUrl: null,
    releaseText: readFileSync("fixtures/edgar/nvda-current-reports/q2fy27-ex99-1.txt", "utf8"), commentaryText: null, includeNarrative: true,
  });
  bundle.edgar.currentReports = { ok: true, value: {
    source: "edgar", endpoint: "currentReports", asOf: "2026-08-26", fetchedAt: bundle.builtAt,
    data: { version: CURRENT_REPORTS_VERSION, releases: [release], events: [], notes: [] },
  } };
  return { bundle, release };
}

describe("release currency in the earnings window (audit 2026-10-22 B-27)", () => {
  it("binds a newer release's dollars to a single-currency statement history", () => {
    const { bundle, release } = windowBundle();
    expect(release.reported.periodEnd).toBe("2026-07-26");
    const result = buildFilingDisclosures(bundle)!;
    expect(result.guidance?.rows).toContainEqual(expect.objectContaining({ period: "Q3 FY2027", metric: "revenue", mid: 108e9 }));
    expect(nextPeriodRevenueGuidance(bundle)).toMatchObject({ periodLabel: "Q3 FY2027", currency: "USD", mid: 108e9 });
    const notes = result.notes.join(" ");
    expect(notes).not.toMatch(/not the statements'/);
    expect(notes).not.toMatch(/statement currency is unestablished/);
  });

  it("binds a release that states no period end in a single-currency history", () => {
    const { bundle, release } = windowBundle();
    release.reported.periodEnd = null;
    release.freeCashFlow = [];
    release.reconciliation = [];
    expect(nextPeriodRevenueGuidance(bundle)).toMatchObject({ currency: "USD", mid: 108e9 });
  });

  it("still withholds when the history is not in one currency, saying the currency is unestablished", () => {
    const { bundle } = windowBundle({ quarterCurrencies: ["USD", "CAD", "CAD", "CAD"], annualCurrency: "CAD" });
    const result = buildFilingDisclosures(bundle)!;
    expect(nextPeriodRevenueGuidance(bundle)).toBeNull();
    expect(result.guidance?.rows.filter((r) => r.unit !== "%")).toEqual([]);
    const notes = result.notes.join(" ");
    expect(notes).toMatch(/Q3 FY2027 revenue printed in "\$" was left out: its currency is not established/);
    expect(notes).not.toMatch(/not the statements'/);
  });

  it("still withholds when a statement row for the release's own period is unlabelled", () => {
    const { bundle } = windowBundle();
    if (!bundle.statements.incomeQuarterly.ok) throw new Error("missing fixture rows");
    bundle.statements.incomeQuarterly.value.data.rows.unshift({ date: "2026-07-26", revenue: 96_221e6 } as never);
    expect(nextPeriodRevenueGuidance(bundle)).toBeNull();
  });

  it("names both currencies when the guide is printed in another one", () => {
    const { bundle, release } = windowBundle();
    for (const item of release.guidance?.items ?? []) if (item.metric === "revenue") item.symbol = "€";
    const notes = buildFilingDisclosures(bundle)!.notes.join(" ");
    expect(notes).toMatch(/Q3 FY2027 revenue printed in "€" was left out: that currency \(EUR\) is not the statements' \(USD\)/);
  });
});
