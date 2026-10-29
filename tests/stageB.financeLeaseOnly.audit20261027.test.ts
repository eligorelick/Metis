/**
 * Audit 2026-10-27 FIN-109 (batch B4, Task 13): a lease total that is wholly a
 * tagged finance-lease liability is said to be one. It was described as "a
 * combined operating + finance figure (the FMP route publishes no split)" with an
 * unknown operating slice, on a row the SEC statements built. Text only: no
 * figure moves, and the vendor wording stays for a vendor total with no split.
 *
 * Hermetic: the synthetic `completeCurrencyBundle`; seed `probes/FIN-109.probe.ts`
 * with the MU snapshot replaced by a same-shaped balance and every `fs` call dropped.
 */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";

const MIX = /combined operating \+ finance figure|FMP route publishes no split|unknown mix/;

function build(provenance: { source: string; tags: string[] }, finance: number | null) {
  const bundle = completeCurrencyBundle({ debt: 3000, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  for (const member of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) {
    if (!member.ok) throw new Error("Expected fixture balance rows");
    for (const row of member.value.data.rows) {
      Object.assign(row, {
        totalDebt: 3000 * M, shortTermDebt: 200 * M, longTermDebt: 400 * M,
        cashAndCashEquivalents: 500 * M, shortTermInvestments: 100 * M, cashAndShortTermInvestments: 600 * M,
        capitalLeaseObligations: 2_387 * M, financeLeaseLiability: finance === null ? null : finance * M, operatingLeaseLiability: null,
        fieldProvenance: { capitalLeaseObligations: provenance },
      });
    }
  }
  const c = runStageB(bundle, { evIncludeLeases: false }) as any;
  const gaps = [...(c.valuation.gaps ?? []), ...(c.valuation.multiples?.gaps ?? []), ...(c.gaps ?? [])]
    .filter((g: any) => /enterpriseValue\.leases/.test(g.field)).map((g: any) => g.reason as string);
  const ev = c.valuation.multiples.enterpriseValue;
  const dcfNote: string = (c.valuation.notes ?? []).find((n: string) => n.startsWith("DCF equity bridge")) ?? "";
  return { gaps, ev, dcfNote };
}

const edgarFinance = { source: "edgar", tags: ["us-gaap/FinanceLeaseLiability"] };

describe("FIN-109: a finance-lease-only lease total", () => {
  it("a finance-lease-only total raises no 'unknown mix' gap", () => {
    const { gaps } = build(edgarFinance, 2_387);
    expect(gaps.filter((g) => MIX.test(g))).toEqual([]);
  });

  it("the EV basis and the bridge note say the lease is a finance lease that stays in EV", () => {
    const { ev, dcfNote } = build(edgarFinance, 2_387);
    expect(ev.basis).toMatch(/lease liability of 2,387M is a finance lease, which stays in EV and net debt on both bases/);
    expect(ev.basis).not.toMatch(/its operating slice is not/);
    expect(dcfNote).toMatch(/lease liability of 2,387M is a finance lease, which stays in EV and net debt on both bases/);
    expect(dcfNote).not.toMatch(/its operating slice is not/);
  });

  it("EV is unchanged: the whole lease total stays in EV as the finance lease", () => {
    const { ev } = build(edgarFinance, 2_387);
    expect(ev.financeLeaseLiability).toBe(2_387 * M);
    expect(ev.leaseLiability).toBeNull();
    expect(ev.excludingLeases).toBe(ev.includingLeases);
    expect(ev.value).toBe(ev.includingLeases);
  });

  it("a vendor total with no split keeps the FMP wording", () => {
    const { gaps, ev, dcfNote } = build({ source: "fmp", tags: [] }, null);
    expect(gaps.some((g) => /combined operating \+ finance figure \(the FMP route publishes no split\)/.test(g))).toBe(true);
    expect(ev.basis).toMatch(/its operating slice is not/);
    expect(dcfNote).toMatch(/its operating slice is not/);
    expect(ev.basis).not.toMatch(/is a finance lease/);
  });

  it("an SEC-built total that reconciles to no finance lease never names the FMP route", () => {
    const { gaps } = build({ source: "edgar", tags: ["us-gaap/LeaseLiabilityTotal"] }, null);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.join(" ")).not.toMatch(/FMP/);
  });
});
