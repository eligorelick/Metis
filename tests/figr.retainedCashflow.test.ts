import { describe, expect, it } from "vitest";
import retained from "./fixtures/figr-cashflow-retained.json";
import { enrichFinancialFields } from "@/edgar/financialEnrichment";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpCashFlowRow, FmpPayload } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { runStageB } from "@/pipeline/compute";

describe("retained FIGR cash-flow evidence in a controlled Stage B bundle", () => {
  it("keeps current-main source refusals and withholds downstream runway", () => {
    const facts = retained.companyFacts as CompanyFacts;
    // The extraction omitted row CIK; the frozen raw rows record 0002064124.
    const rows = retained.vendorQuarterly.map(row => ({ ...row, cik: "0002064124" })) as FmpCashFlowRow[];
    const before = JSON.stringify({ facts, rows });
    const cashflow: FetchResult<FmpPayload<FmpCashFlowRow>> = { ok: true, value: {
      source: "fmp", endpoint: "retained FIGR cash-flow-statement", asOf: "2026-06-30", fetchedAt: retained.capturedAt,
      data: { rows, raw: rows },
    } };
    const enriched = enrichFinancialFields({ ok: false, gap: { field: "balance", reason: "not part of this test", severity: "info" } }, cashflow, facts, "quarter", retained.capturedAt);
    expect(enriched.cashflow.ok).toBe(true);
    if (!enriched.cashflow.ok) return;
    // Independent filing arithmetic: H1 2026 - Q1 2026; FY2025 - nine months.
    const usd = retained.companyFacts.facts["us-gaap"].NetCashProvidedByUsedInOperatingActivities.units.USD;
    const filed = (end: string, accession: string) => usd.find(p => p.end === end && p.accn === accession)!.val;
    expect(filed("2026-06-30", "0001628280-26-057061") - filed("2026-03-31", "0002064124-26-000029")).toBe(-35_151_000);
    expect(filed("2025-12-31", "0002064124-26-000009") - filed("2025-09-30", "0002064124-25-000032")).toBe(13_271_000);
    for (const [date, secValue] of [["2026-06-30", -35_151_000], ["2026-03-31", -37_818_000], ["2025-12-31", 13_271_000]] as const) {
      const row = enriched.cashflow.value.data.rows.find(row => row.date === date)!;
      expect(row.operatingCashFlow).toBeNull();
      expect(row.netCashProvidedByOperatingActivities).toBeNull();
      expect(row.freeCashFlow).toBeNull();
      expect(Object.values(row.fieldConflicts ?? {}).some(conflict => conflict?.usable === false && conflict.secValue === secValue)).toBe(true);
    }
    const bundle = completeCurrencyBundle({ burning: true, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    bundle.builtAt = retained.capturedAt;
    if (!bundle.profile.ok) throw new Error("missing controlled profile");
    bundle.profile.value.data.rows[0]!.ipoDate = "2025-09-11";
    bundle.statements.cashflowQuarterly = enriched.cashflow;
    const result = runStageB(bundle);
    expect(result.route.overlays).toContain("recent-ipo");
    expect(result.runway).not.toBeNull();
    expect(result.runway).toMatchObject({ avgQuarterlyBurn: null, runwayQuarters: null, estimatedExhaustionDate: null });
    expect(result.runway?.gaps.some(gap => gap.field === "runway.operatingCashFlowScope")).toBe(true);
    expect(JSON.stringify({ facts, rows })).toBe(before);
  });
});
