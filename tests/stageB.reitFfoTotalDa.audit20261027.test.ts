import { describe, expect, it } from "vitest";
import { computeNareitFfo, REAL_ESTATE_DEPRECIATION_TAGS } from "@/pipeline/stageB/financialMetrics";

/** The REIT FFO total-D&A stand-in uses the statement builder's component floor (audit 2026-10-27 FIN-510-V2). */
const M = 1_000_000;
const K25 = { filed: "2026-02-24", form: "10-K", fp: "FY", fy: 2025, accn: "0000000099-26-000001" };
const fy25 = (val: number) => [{ ...K25, start: "2025-01-01", end: "2025-12-31", val }];
const wrap = (usGaap: Record<string, unknown[]>) =>
  ({
    ok: true,
    value: {
      asOf: "2025-12-31",
      source: "edgar",
      endpoint: "fixture",
      fetchedAt: "2026-10-22T00:00:00.000Z",
      data: {
        cik: 99,
        entityName: "Synthetic Co",
        facts: { "us-gaap": Object.fromEntries(Object.entries(usGaap).map(([t, p]) => [t, { label: t, units: { USD: p } }])), dei: {} },
      },
    },
  }) as never;
const mcdFfo = {
  NetIncomeLoss: fy25(8_563 * M),
  DepreciationDepletionAndAmortization: fy25(457 * M),
  DepreciationAndAmortization: fy25(2_199 * M),
  Depreciation: fy25(1_600 * M),
};
const run = (facts: Record<string, unknown[]>) =>
  computeNareitFfo({ companyFacts: wrap(facts), periodEnd: "2025-12-31", reportedCurrency: "USD", netIncome: null, depreciationAndAmortization: null });

describe("FFO total-D&A stand-in", () => {
  it("is the filer's total, not a subset below its own Depreciation (FIN-510-V2)", () => {
    const r = run(mcdFfo);
    expect(r.ffo).toBe(10_762 * M); // 8,563 + 2,199
    expect(r.ffoBasis).toMatch(/total depreciation and amortization 2199000000/);
    expect(r.sources.join(" ")).toMatch(/DepreciationAndAmortization/);
  });
  it("control: a filed real-estate depreciation still comes first", () => {
    expect(run({ ...mcdFfo, [REAL_ESTATE_DEPRECIATION_TAGS[0]]: fy25(300 * M) }).ffo).toBe(8_863 * M);
  });
  it("control: a combined D&A with no filed component is used as before", () => {
    const ddaOnly = Object.fromEntries(Object.entries(mcdFfo).filter(([tag]) => tag !== "DepreciationAndAmortization" && tag !== "Depreciation"));
    expect(run(ddaOnly).ffo).toBe(9_020 * M);
  });
});
