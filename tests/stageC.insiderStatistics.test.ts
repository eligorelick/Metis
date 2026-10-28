/** AI-117 / AI-117-V1: insider statistics are transaction counts and share volumes over a named window. */
import { describe, expect, it } from "vitest";

import type { FmpInsiderTradeStatisticsRow } from "@/providers/fmp";
import { runStageB } from "@/pipeline/compute";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import { assembleContextPayload, insiderStatisticsWindow } from "@/pipeline/stageC/payload";
import { matchProvenanceRecord } from "@/pipeline/stageC/provenance";
import type { DataBundle } from "@/pipeline/types";

import { BUILT_AT, completeCurrencyBundle } from "./helpers/currencyBundle";

const EMPTY_VALIDATION = { checks: [], flags: [], gaps: [] } as unknown as ValidationReport;

const ROWS: FmpInsiderTradeStatisticsRow[] = [
  { year: 2026, quarter: 3, totalPurchases: 0, totalSales: 1,  acquiredTransactions: 0,  disposedTransactions: 1,  totalAcquired: 0,         totalDisposed: 50_000 },
  { year: 2026, quarter: 2, totalPurchases: 0, totalSales: 20, acquiredTransactions: 2,  disposedTransactions: 30, totalAcquired: 100_000,   totalDisposed: 4_000_000 },
  { year: 2026, quarter: 1, totalPurchases: 1, totalSales: 10, acquiredTransactions: 12, disposedTransactions: 15, totalAcquired: 3_000_000, totalDisposed: 1_500_000 },
  { year: 2025, quarter: 4, totalPurchases: 0, totalSales: 5,  acquiredTransactions: 1,  disposedTransactions: 8,  totalAcquired: 10_000,    totalDisposed: 700_000 },
  { year: 2025, quarter: 3, totalPurchases: 2, totalSales: 5,  acquiredTransactions: 5,  disposedTransactions: 7,  totalAcquired: 200_000,   totalDisposed: 300_000 },
  { year: 2025, quarter: 2, totalPurchases: 9, totalSales: 9,  acquiredTransactions: 9,  disposedTransactions: 9,  totalAcquired: 9,         totalDisposed: 9 },
];

function withStats(rows: FmpInsiderTradeStatisticsRow[], asOf: string) {
  const base = completeCurrencyBundle({});
  const trade = [{ transactionDate: "2026-06-01", reportingName: "Test Officer", typeOfOwner: "officer", transactionType: "S-Sale", securitiesTransacted: 1000, price: 10 }];
  const bundle = {
    ...base,
    insiderStats: { ok: true, value: { data: { rows, raw: rows }, asOf, source: "fmp", endpoint: "insider-trading/statistics", fetchedAt: BUILT_AT } },
    insiderTrades: { ok: true, value: { data: { rows: trade, raw: trade }, asOf: "2026-06-01", source: "fmp", endpoint: "insider-trading/search", fetchedAt: BUILT_AT } },
  } as unknown as DataBundle;
  return assembleContextPayload(bundle, runStageB(bundle), EMPTY_VALIDATION);
}

describe("insider statistics window", () => {
  it("sums the trailing four complete calendar quarters as counts, share volumes and a count ratio", () => {
    const payload = withStats(ROWS, "2026-07-06");
    const f = (prefix: string) => payload.insiders.figures.find((x) => x.label.startsWith(prefix));
    const window = { kind: "duration", start: "2025-07-01", end: "2026-06-30", basis: "rolling-12-month" };
    expect(f("insider open-market sale transactions (Form 4 code S)")).toMatchObject({ value: 40, unit: "count", period: "2026-06-30", periodContext: window });
    expect(f("insider open-market purchase transactions (Form 4 code P)")).toMatchObject({ value: 3, unit: "count", periodContext: window });
    expect(f("insider shares acquired")).toMatchObject({ value: 3_310_000, unit: "shares" });
    expect(f("insider shares disposed")).toMatchObject({ value: 6_500_000, unit: "shares" });
    expect(f("insider acquired/disposed transaction-count ratio")).toMatchObject({ value: 0.3333, unit: "x" });
    expect(payload.insiders.figures.filter((x) => /transactions/.test(x.label) && x.unit === "shares")).toEqual([]);
    expect(payload.insiders.notes.some((n) => n.includes("(2025-07-01 to 2026-06-30) summed; 2026 Q3 is in progress at 2026-07-06"))).toBe(true);
    const registry = payload.provenanceRegistry ?? [];
    const sales = registry.find((r) => r.id === f("insider open-market sale transactions")!.provenanceId)!;
    const claim = (unit: string) => ({ source: sales.id, value: 40, unit, currency: null, period: sales.period, periodContext: sales.periodContext, asOf: sales.asOf });
    expect(matchProvenanceRecord(claim("shares") as never, registry).ok).toBe(false); // a count is never shares
    expect(matchProvenanceRecord(claim("count") as never, registry).ok).toBe(true); // control
  });

  it("leaves out an in-progress-only answer and says why", () => {
    const payload = withStats(ROWS.slice(0, 1), "2026-07-06");
    expect(payload.insiders.figures.filter((x) => x.source === "fmp:insider-statistics")).toEqual([]);
    expect(payload.insiders.notes).toContain("Insider statistics: FMP serves only 2026 Q3, which is in progress at 2026-07-06; no complete calendar quarter is summed.");
  });

  it("stops at a missing quarter, ignores a repeated quarter and labels the shorter window", () => {
    const payload = withStats([ROWS[1]!, ROWS[2]!, ROWS[4]!, ROWS[2]!], "2026-07-06"); // 2025 Q4 missing; 2026 Q1 repeated
    const sales = payload.insiders.figures.find((x) => x.label.startsWith("insider open-market sale transactions"))!;
    expect(sales).toMatchObject({ value: 30, label: "insider open-market sale transactions (Form 4 code S), two calendar quarters ended 2026-06-30",
      periodContext: { kind: "duration", start: "2026-01-01", end: "2026-06-30" } });
    expect(sales.periodContext).not.toHaveProperty("basis");
    expect(payload.insiders.notes[0]).toMatch(/^Insider statistics: /); // before the Form 4 rows it refers to
  });

  it("reads the quarter in progress from the fetch day at both quarter edges", () => {
    expect(insiderStatisticsWindow(ROWS, "2026-07-01")!.end).toBe("2026-06-30");
    expect(insiderStatisticsWindow(ROWS, "2026-06-30")!.end).toBe("2026-03-31");
    // FMP serves no row for the latest complete quarter (2026 Q2): the window ends where the data ends, and the label says so.
    expect(insiderStatisticsWindow([ROWS[2]!, ROWS[3]!, ROWS[4]!, ROWS[5]!], "2026-07-06")).toMatchObject({ end: "2026-03-31", start: "2025-04-01", inProgress: null });
    expect(withStats([ROWS[2]!, ROWS[3]!, ROWS[4]!, ROWS[5]!], "2026-07-06").insiders.figures.some((x) => x.label === "insider open-market sale transactions (Form 4 code S), four calendar quarters ended 2026-03-31")).toBe(true);
    expect(insiderStatisticsWindow([...ROWS].reverse(), "2026-07-06")!.end).toBe("2026-06-30"); // row order does not matter
  });
});
