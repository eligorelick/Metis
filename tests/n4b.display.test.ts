import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { runStageB } from "@/pipeline/compute";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { reportToMarkdown } from "@/report/export/markdown";
import { formatFinancialValue } from "@/report/format";
import { metricRowsWithoutTabled } from "@/report/presentation";

describe("N4b L10 measured windows and amount scales", () => {
  it("collapses three identical shortened revenue CAGR windows into one named measured window", () => {
    const b = completeCurrencyBundle({});
    if (!b.statements.incomeAnnual.ok) throw Error("fixture");
    b.statements.incomeAnnual.value.data.rows = b.statements.incomeAnnual.value.data.rows.slice(0, 3);
    const c = runStageB(b);
    const r = buildDataOnlyReport({ symbol: b.symbol, companyName: "Example", generatedAt: b.builtAt, model: "none", costUsd: 0, bundle: b, computed: c,
      validation: { checks: [], flags: [], gaps: [] }, costBreakdown: [], reason: "offline" });
    const row = r.fundamentals.growthTable.find(r => r.label === "Revenue CAGR")!;
    expect(row.values).toHaveLength(2); // The separate latest-year window remains.
    expect(row.values.map(v => v.period)).toEqual(["1y CAGR", "2y CAGR (available history)"]);
    expect(reportToMarkdown(r)).not.toContain("10y CAGR (measured over 2y)");
    expect(c.growth.revenueCagrs).toHaveLength(4); // Calculations and scores are unchanged.
    const legacy = [{ ...row, values: [3, 5, 10].map(n => ({ period: `${n}y CAGR (measured over 2y)`, value: row.values[1]!.value })) }];
    const before = JSON.stringify(legacy);
    const displayed = metricRowsWithoutTabled(r, legacy);
    expect(displayed.kept[0]!.values.map(v => v.period)).toEqual(["2y CAGR (available history)"]);
    expect(JSON.stringify(legacy)).toBe(before);
  });
  it("uses the same K/M rule for segment and fundamentals amounts, preserving per-share precision", () => {
    expect(formatFinancialValue(122000, "currency", "USD")).toBe("$122K");
    expect(formatFinancialValue(36770000, "currency", "USD")).toBe("$36.77M");
    expect(formatFinancialValue(122, "USD thousands:")).toBe("$122K");
    expect(formatFinancialValue(122000, "currency/share", "USD")).toBe("$122,000.00");
    expect(formatFinancialValue(-122000, "currency", "TWD")).toBe("\u2212122K TWD");
  });
});
