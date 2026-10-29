/**
 * Audit 2026-10-27 FIN-404 (batch B4, Task 9): a loss period's diluted weighted
 * count equals its basic count (ASC 260-10-45-17..20: every potential share is
 * antidilutive). The per-share divisor must not take that count as if the
 * filer carried no option or RSU overhang: it takes the basic count plus the
 * newest profitable period's award dilution, or says it has none.
 *
 * Hermetic: the synthetic `currencyBundle`, mutated after it is built. Seed:
 * `probes/FIN-404.probe.ts` (its snapshot read and file write dropped).
 */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import { awardDilutedDivisor } from "@/pipeline/stageB/dilutedDivisor";
import type { DataBundle } from "@/pipeline/types";
import { currencyBundle, M } from "./helpers/currencyBundle";

type Row = Record<string, unknown>;
const rowsOf = (b: DataBundle, key: "incomeQuarterly" | "incomeAnnual"): Row[] =>
  (b.statements as unknown as Record<string, { value: { data: { rows: Row[] } } }>)[key]!.value.data.rows;

/** The fixture's income rows get a 99 M basic count (diluted 100 M); the newest quarter is a loss at 98.5 M both ways. */
function withLossQuarter(opts: Parameters<typeof currencyBundle>[0] = {}, loss = true): DataBundle {
  const b = currencyBundle(opts);
  for (const key of ["incomeQuarterly", "incomeAnnual"] as const) for (const r of rowsOf(b, key)) r.weightedAverageShsOut = 99 * M;
  if (loss) {
    const q = rowsOf(b, "incomeQuarterly")[0]!;
    q.netIncome = -40 * M;
    q.epsDiluted = -0.41;
    q.weightedAverageShsOut = 98.5 * M;
    q.weightedAverageShsOutDil = 98.5 * M;
  }
  return b;
}

describe("FIN-404: awardDilutedDivisor", () => {
  const donor = { date: "2025-12-31", basic: 99e6, diluted: 100e6, netIncome: 45e6 };

  it("unit: a loss row takes its basic count plus the newest profitable period's award dilution", () => {
    const out = awardDilutedDivisor({ date: "2026-03-31", basic: 98.5e6, diluted: 98.5e6, netIncome: -40e6 }, [donor]);
    expect(out).toMatchObject({ shares: 99.5e6, basis: "loss-period-substituted", donorDate: "2025-12-31" });
    expect(out.note).toMatch(/2025-12-31/);
  });

  it("unit control: a profitable row keeps its filed diluted count", () => {
    expect(awardDilutedDivisor({ date: "2026-03-31", basic: 99e6, diluted: 100e6, netIncome: 45e6 }, [donor]))
      .toMatchObject({ shares: 100e6, basis: "filed", donorDate: null, note: null });
  });

  it("unit: with no donor the basic count stands and the note says it carries no dilution", () => {
    const out = awardDilutedDivisor({ date: "2026-03-31", basic: 98.5e6, diluted: 98.5e6, netIncome: -40e6 }, []);
    expect(out).toMatchObject({ shares: 98.5e6, basis: "loss-period-basic", donorDate: null });
    expect(out.note).toMatch(/carries no option or RSU dilution/);
  });

  it("unit: the donor is the newest profitable period with award dilution; conversion shares are not award dilution", () => {
    const rows = [
      { date: "2025-09-30", basic: 99e6, diluted: 101e6, netIncome: 40e6 },
      { date: "2025-12-31", basic: 99e6, diluted: 100e6, netIncome: 45e6, conversionShares: 1e6 },
      { date: "2025-06-30", basic: 99e6, diluted: 105e6, netIncome: -3e6 },
    ];
    const out = awardDilutedDivisor({ date: "2026-03-31", basic: 98.5e6, diluted: 98.5e6, netIncome: -40e6 }, rows);
    expect(out).toMatchObject({ shares: 100.5e6, basis: "loss-period-substituted", donorDate: "2025-09-30" });
  });

  it("unit: continuing-operations income, not net income, decides a loss", () => {
    const row = { date: "2026-03-31", basic: 98.5e6, diluted: 98.5e6, netIncome: 10e6, continuingIncome: -5e6 };
    expect(awardDilutedDivisor(row, [donor]).basis).toBe("loss-period-substituted");
    expect(awardDilutedDivisor({ ...row, netIncome: -10e6, continuingIncome: 5e6 }, [donor]).basis).toBe("filed");
  });

  it("unit: a loss row whose diluted count already exceeds basic is filed as is", () => {
    expect(awardDilutedDivisor({ date: "2026-03-31", basic: 98e6, diluted: 99e6, netIncome: -1e6 }, [donor]))
      .toMatchObject({ shares: 99e6, basis: "filed" });
  });
});

describe("FIN-404: the per-share routes", () => {
  it("the DCF divides a loss quarter's value by basic plus award dilution", () => {
    const out = runStageB(withLossQuarter());
    expect(out.valuation.kind).toBe("dcf");
    expect(out.route.overlays).not.toContain("unprofitable");
    if (out.valuation.kind !== "dcf") throw new Error("expected the DCF route");
    expect(out.valuation.dcf?.bridge.dilutedShares).toBe(99.5 * M);
    const gap = out.valuation.gaps.find((g) => g.field === "valuation.perShare.lossPeriodDivisor");
    expect(gap?.severity).toBe("info");
    expect(gap?.reason).toMatch(/2025-12-31/);
    const note = [...out.valuation.notes, ...(out.valuation.dcf?.notes ?? [])].find((n) => /Per-share values divide by/.test(n));
    // The divisor note may only claim option and RSU dilution while it names the substitution that put it there.
    expect(note).toBeDefined();
    if (/The gap is option and RSU dilution/.test(note!)) expect(note).toMatch(/basic count plus the award dilution of the profitable period ending 2025-12-31/);
  });

  it("the excess-return route uses the same divisor", () => {
    const out = runStageB(withLossQuarter({ bank: true }));
    expect(out.valuation.kind).toBe("excess-return");
    if (out.valuation.kind !== "excess-return") throw new Error("expected the excess-return route");
    const er = out.valuation.excessReturn;
    expect(er?.perShare).not.toBeNull();
    expect((er?.perShare as number) * 99.5 * M).toBeCloseTo(er?.equityValue as number, 3);
  });

  it("control: a profitable newest quarter is unchanged", () => {
    const out = runStageB(withLossQuarter({}, false));
    expect(out.valuation.kind).toBe("dcf");
    if (out.valuation.kind !== "dcf") throw new Error("expected the DCF route");
    expect(out.valuation.dcf?.bridge.dilutedShares).toBe(100 * M);
    expect(out.valuation.gaps.some((g) => g.field === "valuation.perShare.lossPeriodDivisor")).toBe(false);
  });
});
