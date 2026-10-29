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
import type { CompanyFacts } from "@/edgar/xbrl";
import { awardDilutedDivisor, convertibleFiledNear, conversionSharesFiled } from "@/pipeline/stageB/dilutedDivisor";
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

const point = (end: string, val: number, extra: Record<string, unknown> = {}) =>
  ({ end, val, accn: "0000000000-26-000001", fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-13", ...extra });
const factsOf = (tags: Record<string, { unit: string; points: ReturnType<typeof point>[] }>): CompanyFacts =>
  ({ cik: 1, entityName: "TEST", facts: { "us-gaap": Object.fromEntries(Object.entries(tags).map(([t, v]) => [t, { units: { [v.unit]: v.points } }])) } }) as unknown as CompanyFacts;
/** The donor quarter 2025-12-31 files this conversion increment (when given) and a convertible carrying value. */
const convertibleFacts = (increment: number | null): CompanyFacts => factsOf({
  ...(increment === null ? {} : { IncrementalCommonSharesAttributableToConversionOfDebtSecurities: { unit: "shares", points: [point("2025-12-31", increment, { start: "2025-10-01" })] } }),
  ConvertibleNotesPayable: { unit: "USD", points: [point("2025-12-31", 500 * M)] },
});
function withFacts(b: DataBundle, data: CompanyFacts): DataBundle {
  (b.edgar as unknown as Record<string, unknown>).companyFacts = { ok: true, value: { data } };
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
    expect(note).toBeDefined();
    // The note names the substitution that put the dilution there, whatever its tail says.
    expect(note).toMatch(/basic count plus the award dilution of the profitable period \((quarter|fiscal year) 2025-12-31\)/);
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

describe("FIN-404 fix round 1: conversion shares are not award dilution (I-1)", () => {
  const row = { date: "2026-03-31", basic: 98.5e6, diluted: 98.5e6, netIncome: -40e6 };
  const donor = { date: "2025-12-31", basic: 90e6, diluted: 100e6, netIncome: 45e6, period: "quarter" as const };

  it("a donor increment of 10 with a filed conversion increment of 4 restores 6", () => {
    const out = awardDilutedDivisor(row, [{ ...donor, conversionShares: 4e6 }], { convertiblesFiled: true });
    expect(out).toMatchObject({ shares: 104.5e6, basis: "loss-period-substituted", donorDate: "2025-12-31", donorPeriod: "quarter" });
    expect(out.note).toMatch(/after taking out 4M shares of its filed conversion shares/);
  });

  it("a conversion increment at least the whole increment restores nothing and the donor is skipped (floor at 0)", () => {
    expect(awardDilutedDivisor(row, [{ ...donor, conversionShares: 12e6 }]).basis).toBe("loss-period-basic");
  });

  it("a filed convertible with no donor conversion increment keeps the filed count and says why", () => {
    const out = awardDilutedDivisor(row, [donor], { convertiblesFiled: true });
    expect(out).toMatchObject({ shares: 98.5e6, basis: "loss-period-withheld" });
    expect(out.note).toMatch(/Award dilution not restored: the issuer files convertible instruments and the donor period's .* conversion shares are not filed, so the restored increment could hold conversion shares the bridge already deducts/);
  });

  it("no convertible restores the whole increment", () => {
    expect(awardDilutedDivisor(row, [donor], { convertiblesFiled: false })).toMatchObject({ shares: 108.5e6, basis: "loss-period-substituted" });
  });

  it("the fact readers: the donor quarter's increment, a convertible within 366 days, and the controls", () => {
    expect(conversionSharesFiled(convertibleFacts(4e6), "2025-12-31", "quarter")).toBe(4e6);
    expect(conversionSharesFiled(convertibleFacts(4e6), "2025-12-31", "fiscal year")).toBeNull();
    expect(conversionSharesFiled(convertibleFacts(null), "2025-12-31", "quarter")).toBeNull();
    expect(convertibleFiledNear(convertibleFacts(null), "2026-03-31")).toBe(true);
    expect(convertibleFiledNear(convertibleFacts(null), "2027-03-31")).toBe(false);
    expect(convertibleFiledNear(null, "2026-03-31")).toBe(false);
  });

  it("runStageB: the filed increment is taken out of the restored dilution; a convertible with none keeps main's count", () => {
    const run = (data: CompanyFacts) => {
      const b = withLossQuarter({}, true);
      return runStageB(withFacts(b, data));
    };
    const taken = run(convertibleFacts(0.4 * M));
    const none = run(convertibleFacts(null));
    if (taken.valuation.kind !== "dcf" || none.valuation.kind !== "dcf") throw new Error("expected the DCF route");
    // 98.5 M basic + (1 M increment - 0.4 M conversion shares).
    expect(taken.valuation.dcf?.bridge.dilutedShares).toBeCloseTo(99.1 * M, 0);
    // Convertible filed, no donor increment: main's count (the loss quarter's filed 98.5 M), and the note.
    expect(none.valuation.dcf?.bridge.dilutedShares).toBe(98.5 * M);
    expect(none.valuation.gaps.find((g) => g.field === "valuation.perShare.lossPeriodDivisor")?.reason).toMatch(/Award dilution not restored/);
  });
});

describe("FIN-404 fix round 1: scope and sentinel", () => {
  it("an unprofitable run with no DCF has neither the note nor the gap; a profitable-TTM loss quarter with a DCF has both", () => {
    const burning = runStageB(withLossQuarter({ burning: true }));
    expect(burning.valuation.kind).toBe("dcf-suppressed");
    expect(burning.valuation.gaps.some((g) => g.field === "valuation.perShare.lossPeriodDivisor")).toBe(false);
    expect(burning.valuation.notes.some((n) => /is a loss, so its filed diluted count/.test(n))).toBe(false);
    const dcf = runStageB(withLossQuarter());
    expect(dcf.valuation.gaps.some((g) => g.field === "valuation.perShare.lossPeriodDivisor")).toBe(true);
    expect(dcf.valuation.notes.some((n) => /basic count plus the award dilution/.test(n))).toBe(true);
  });

  it("the excess-return route carries the gap", () => {
    const out = runStageB(withLossQuarter({ bank: true }));
    expect(out.valuation.gaps.some((g) => g.field === "valuation.perShare.lossPeriodDivisor")).toBe(true);
  });

  it("FMP's 0 on a loss quarter is missing, not filed: main's annual fallback count and note stand", () => {
    const b = withLossQuarter();
    rowsOf(b, "incomeQuarterly")[0]!.weightedAverageShsOutDil = 0;
    const out = runStageB(b);
    if (out.valuation.kind !== "dcf") throw new Error("expected the DCF route");
    expect(out.valuation.dcf?.bridge.dilutedShares).toBe(100 * M);
    expect(out.valuation.gaps.some((g) => g.field === "valuation.perShare.lossPeriodDivisor")).toBe(false);
    expect(out.valuation.notes.some((n) => /diluted share count from the latest ANNUAL statement/.test(n))).toBe(true);
  });

  it("the no-donor case prints the basic count and says what was searched", () => {
    const b = withLossQuarter();
    for (const r of rowsOf(b, "incomeQuarterly").slice(1)) r.weightedAverageShsOutDil = r.weightedAverageShsOut;
    for (const r of rowsOf(b, "incomeAnnual")) r.weightedAverageShsOutDil = r.weightedAverageShsOut;
    const out = runStageB(b);
    if (out.valuation.kind !== "dcf") throw new Error("expected the DCF route");
    expect(out.valuation.dcf?.bridge.dilutedShares).toBe(98.5 * M);
    expect(out.valuation.gaps.find((g) => g.field === "valuation.perShare.lossPeriodDivisor")?.reason)
      .toMatch(/no profitable period among the last four quarters or the latest fiscal year shows award dilution/);
  });
});
