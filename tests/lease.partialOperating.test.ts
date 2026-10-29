/**
 * A missing operating-lease maturity no longer blanks total debt (audit
 * 2026-10-19 FCX-1, FCX-14), and the operating lease leaves net debt only when
 * total debt is shown to hold it (CODE-1).
 */
import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { operatingLeaseScopeUnproven } from "@/pipeline/stageB/netDebt";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";

function scenario(kind: "Operating" | "Finance") {
  const provenance = (date: string, tags: string[]) => ({ source: "edgar" as const, unit: "USD", periodStart: null, periodEnd: date,
    observedAt: "2026-10-16T00:00:00Z", tags, filings: [{ accn: "0000000001-26-000001", filed: "2026-08-01", form: "10-Q" }] });
  const bundle = completeCurrencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  for (const result of [bundle.statements.incomeQuarterly, bundle.statements.incomeAnnual]) {
    if (!result.ok) throw new Error("Missing income fixture");
    for (const row of result.value.data.rows) row.interestExpense = 10e6;
  }
  for (const result of [bundle.statements.balanceQuarterly, bundle.statements.balanceAnnual]) {
    if (!result.ok) throw new Error("Missing balance fixture");
    for (const row of result.value.data.rows) Object.assign(row, {
      totalDebt: 310e6, shortTermDebt: 60e6, longTermDebt: 240e6, capitalLeaseObligations: 10e6,
      operatingLeaseLiability: kind === "Operating" ? 10e6 : 0, financeLeaseLiability: kind === "Finance" ? 10e6 : 0,
      fieldProvenance: { shortTermDebt: provenance(row.date!, ["us-gaap/LongTermDebtCurrent"]), longTermDebt: provenance(row.date!, ["us-gaap/LongTermDebtNoncurrent"]),
        capitalLeaseObligations: provenance(row.date!, [`us-gaap/${kind}LeaseLiabilityNoncurrent`]) },
    });
  }
  return bundle;
}

describe("a missing operating-lease maturity (audit FCX-1)", () => {
  it("keeps the DCF, WACC and net debt/EBITDA on the lease-excluded basis", () => {
    const out = runStageB(scenario("Operating"), { evIncludeLeases: false });
    expect(out.returns.wacc.waccPct).not.toBeNull();
    expect(out.valuation.kind === "dcf" ? out.valuation.dcf?.perShare ?? null : null).not.toBeNull();
    expect(out.capital.netDebtToEbitda.value).not.toBeNull();
    expect(out.capital.netDebtToEbitda.note).toMatch(/excludes the disclosed operating-lease portion/);
    expect(out.gaps.some((gap) => gap.field === "valuation.dcf.salesToCapital")).toBe(false);
  });

  it("still withholds them when a finance-lease maturity is missing", () => {
    const out = runStageB(scenario("Finance"), { evIncludeLeases: false });
    expect(out.returns.wacc.waccPct).toBeNull();
    expect(out.valuation.kind === "dcf" ? out.valuation.dcf : null).toBeNull();
    expect(out.capital.netDebtToEbitda.value).toBeNull();
  });

  it("calls an aspect with withheld inputs a data gap, not a route choice (audit FCX-14)", () => {
    const out = runStageB(scenario("Finance"), { evIncludeLeases: false });
    expect(out.scores.aspects.valuation.score).toBeNull();
    expect(out.scores.aspects.valuation.notApplicableReason).toMatch(/data gap/);
    expect(out.scores.aspects.valuation.notApplicableReason).not.toMatch(/for this route/);
  });
});

describe("operating lease removed only when total debt holds it (audit CODE-1)", () => {
  const borrowingsOnly = { totalDebt: 300 * M, shortTermDebt: null, longTermDebt: null, capitalLeaseObligations: null, operatingLeaseLiability: 150 * M };

  it("refuses the removal when nothing shows the lease inside total debt", () => {
    expect(operatingLeaseScopeUnproven(borrowingsOnly)).toMatch(/operating-lease scope unproven/);
    expect(operatingLeaseScopeUnproven({ ...borrowingsOnly, totalDebt: 450 * M, capitalLeaseObligations: 150 * M })).toBeNull();
    expect(operatingLeaseScopeUnproven({ ...borrowingsOnly, totalDebt: 450 * M, shortTermDebt: 100 * M, longTermDebt: 200 * M })).toBeNull();
    expect(operatingLeaseScopeUnproven({ ...borrowingsOnly, shortTermDebt: 100 * M, longTermDebt: 200 * M })).toMatch(/unproven/);
  });

  it.each([
    ["borrowings-only total with an enriched lease", { ...borrowingsOnly }, 200 * M, true],
    ["lease-inclusive total with its lease total", { ...borrowingsOnly, totalDebt: 450 * M, capitalLeaseObligations: 150 * M }, 200 * M, false],
  ] as const)("bridges %s at net debt 200", (_, fields, expectedNetDebt, gap) => {
    const bundle = completeCurrencyBundle({ debt: 300, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    for (const result of [bundle.statements.balanceQuarterly, bundle.statements.balanceAnnual]) {
      if (!result.ok) throw new Error("Missing balance fixture");
      for (const row of result.value.data.rows) Object.assign(row, fields, { netDebt: null, cashAndCashEquivalents: 100 * M, shortTermInvestments: 0, cashAndShortTermInvestments: 100 * M, financeLeaseLiability: 0 });
    }
    const out = runStageB(bundle, { evIncludeLeases: false });
    if (out.valuation.kind !== "dcf" || out.valuation.dcf === null) throw new Error("expected a DCF");
    // EV − equity value = net debt (+ minority interest and preferred, both 0 here).
    expect((out.valuation.dcf.enterpriseValue - (out.valuation.dcf.equityValue as number)) / M).toBeCloseTo(expectedNetDebt / M, 6);
    expect(out.valuation.multiples.enterpriseValue.leaseLiability).toBe(gap ? null : 150 * M);
    expect(out.gaps.some((g) => g.field === "valuation.dcf.netDebt.leaseScope")).toBe(gap);
  });

  // FIN-303-V1: ROIC follows the same proof as the bridge, the WACC debt leg and net debt.
  it.each([
    ["borrowings-only total with an enriched lease keeps total debt as reported", { ...borrowingsOnly }, /operating-lease scope unproven/, /excluded from invested capital/],
    ["lease-inclusive total with its lease total removes the lease", { ...borrowingsOnly, totalDebt: 450 * M, capitalLeaseObligations: 150 * M }, /excluded from invested capital/, /operating-lease scope unproven/],
  ] as const)("ROIC invested capital: %s", (_, fields, present, absent) => {
    const bundle = completeCurrencyBundle({ debt: 300, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    for (const result of [bundle.statements.balanceQuarterly, bundle.statements.balanceAnnual]) {
      if (!result.ok) throw new Error("Missing balance fixture");
      for (const row of result.value.data.rows) Object.assign(row, fields, { netDebt: null, cashAndCashEquivalents: 100 * M, shortTermInvestments: 0, cashAndShortTermInvestments: 100 * M, financeLeaseLiability: 0 });
    }
    const out = runStageB(bundle, { evIncludeLeases: false });
    const latest = out.returns.roic.series[out.returns.roic.series.length - 1]!;
    // Both land on 675M: debt as reported 300M, or 450M less the 150M lease it is shown to hold.
    expect(latest.investedCapitalAvg).toBe(675 * M);
    expect(latest.notes.join(" ")).toMatch(present);
    expect(latest.notes.join(" ")).not.toMatch(absent);
  });
});
