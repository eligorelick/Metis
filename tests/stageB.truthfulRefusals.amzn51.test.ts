/**
 * Audit 2026-10-29, AMZN report #51 (VAL-4, VAL-10, KNW-03, KNW-04; D-132):
 * a value that exists but was refused is named as refused, with the refusal,
 * never as missing; a withheld DCF and a withheld ROIC say why.
 *
 * Report #51 printed "EV components missing (marketCap/totalDebt/cash)" beside
 * all three, "EV is reported as-is" beside a null EV, a fair-value reason that
 * listed possible causes instead of the actual one, "missing net debt input"
 * for a refused net debt, and withheld ROIC for every year with no manifest
 * entry. The fixture is the noncurrent-only lease shape in round synthetic
 * numbers (./helpers/amzn51LeaseShape), refused two ways: with no filed facts
 * the lease guard refuses the row; with the current debt untagged the
 * admission refuses the completion.
 */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import { computeFairValue } from "@/pipeline/stageB/fairValue";
import { operatingLeaseScopeUnproven, resolveNetDebt } from "@/pipeline/stageB/netDebt";
import { computeRoic } from "@/pipeline/stageB/returns";
import type { ValuationResult } from "@/pipeline/stageB/valuation";

import { leaseShapeStageBBundle, without } from "./helpers/amzn51LeaseShape";

const leaseRefused = () => runStageB(leaseShapeStageBBundle(() => ({})));
const admissionRefused = () => runStageB(leaseShapeStageBBundle((points) => without(points, "LongTermDebtCurrent", "ShortTermBorrowings")));
const reasonOf = (gaps: readonly { field: string; reason: string }[], field: string): string => {
  const gap = gaps.find((g) => g.field === field);
  if (gap === undefined) throw new Error(`no ${field} gap`);
  return gap.reason;
};

describe("a refused debt input is named, never called missing (VAL-4, KNW-04)", () => {
  it("the EV basis and the EV gap state the refusal when net debt is withheld", () => {
    const computed = leaseRefused();
    const ev = computed.valuation.multiples!.enterpriseValue;
    const netDebtReason = reasonOf(computed.valuation.gaps, "valuation.multiples.netDebt");
    expect(netDebtReason).toMatch(/do not reconcile to the vendor lease line 92M/);
    expect(ev.value).toBeNull();
    expect(ev.basis).toBe(`EV withheld: ${netDebtReason}.`);
    expect(ev.basis).not.toMatch(/reported as-is|less an OPERATING lease liability/);
    expect(reasonOf(computed.valuation.gaps, "valuation.multiples.enterpriseValue")).toBe(`EV withheld: ${netDebtReason} — EV multiples n/m`);
  });

  it("an admission refusal is named in net debt, the EV and invested capital", () => {
    const computed = admissionRefused();
    const netDebtReason = reasonOf(computed.valuation.gaps, "valuation.multiples.netDebt");
    expect(netDebtReason).toMatch(/^total debt withheld \(incomplete debt carrying value: the vendor lease line 92000000 USD .* the current debt cannot be established: the filing tags no LongTermDebtCurrent at 2026-03-31 .*\) — house net debt unavailable$/); // the latest quarter's balance
    expect(netDebtReason).not.toMatch(/total debt missing/);
    expect(reasonOf(computed.valuation.gaps, "valuation.multiples.enterpriseValue")).toBe(`EV withheld: ${netDebtReason} — EV multiples n/m`);
    const latest = computed.returns.roic.series.find((year) => year.date === "2025-12-31")!;
    expect(latest.notes.join(" ")).toMatch(/2025-12-31: total debt withheld \(incomplete debt carrying value: .*\) — invested capital uncomputable/);
    expect(latest.notes.join(" ")).not.toMatch(/totalDebt missing/);
  });

  it("net debt / EBITDA names the refusal instead of a missing input", () => {
    const leases = leaseRefused();
    expect(reasonOf(leases.gaps, "capital.netDebtToEbitda")).toBe(`net debt withheld: ${leases.capital.netDebtToEbitda.resolution.reason}`);
    expect(leases.capital.netDebtToEbitda.resolution.reason).toMatch(/do not reconcile to the vendor lease line 92M/);
    const admission = admissionRefused();
    expect(reasonOf(admission.gaps, "capital.netDebtToEbitda")).toMatch(/^net debt withheld: total debt withheld \(incomplete debt carrying value: /);
  });

  it("control: a total debt that is simply absent is still called missing", () => {
    expect(resolveNetDebt({ totalDebt: null, cashAndShortTermInvestments: 5 }).reason).toBe("total debt missing — house net debt unavailable");
    expect(resolveNetDebt({ totalDebt: null, cashAndShortTermInvestments: 5,
      fieldConflicts: { totalDebt: { usable: false, reason: "incomplete debt carrying value: test" } } }).reason)
      .toBe("total debt withheld (incomplete debt carrying value: test) — house net debt unavailable");
  });

  it("the operating-lease scope note says what it compared, and never denies a smaller total that exists", () => {
    const smaller = operatingLeaseScopeUnproven({ totalDebt: 500, operatingLeaseLiability: 100, capitalLeaseObligations: 60 })!;
    expect(smaller).toBe("operating-lease scope unproven: the operating-lease liability 100 is not shown to be inside total debt 500 " +
      "(the total lease liability 60 is smaller than it, and current and noncurrent borrowings are not both disclosed to reconcile it), so it is not removed; net debt is used as reported");
    expect(smaller).not.toMatch(/no total lease liability covers it/);
    const absent = operatingLeaseScopeUnproven({ totalDebt: 500, operatingLeaseLiability: 100, shortTermDebt: 10, longTermDebt: 300 })!;
    expect(absent).toBe("operating-lease scope unproven: the operating-lease liability 100 is not shown to be inside total debt 500 " +
      "(no total lease liability is disclosed, and borrowings plus leases 410 do not reconcile to the total), so it is not removed; net debt is used as reported");
    expect(operatingLeaseScopeUnproven({ operatingLeaseLiability: 100 })).toMatch(/inside total debt unavailable \(no total lease liability is disclosed, and total debt is unavailable\)/);
    expect(operatingLeaseScopeUnproven({ totalDebt: 500, operatingLeaseLiability: 100, capitalLeaseObligations: 120 })).toBeNull();
  });
});

describe("a withheld DCF says why (VAL-10)", () => {
  it("the fair value quotes the DCF gap, and the DCF gap the WACC refusal behind it", () => {
    const computed = leaseRefused();
    const waccReason = reasonOf(computed.gaps, "returns.wacc.weights");
    expect(waccReason).toMatch(/^average total debt withheld: 2025-12-31: /);
    const dcfReason = reasonOf(computed.valuation.gaps, "valuation.dcf");
    expect(dcfReason).toBe(`WACC unavailable — DCF suppressed: ${waccReason}`);
    expect(computed.fairValue.status).toBe("suppressed");
    expect(computed.fairValue.reasons).toEqual([{ field: "valuation.dcf.perShare", reason: dcfReason, severity: "warn" }]);
    expect(computed.fairValue.basis).toEqual([`Intrinsic value per share unavailable: ${dcfReason}.`]);
  });

  it("names the bridge's upstream refusal when the DCF was built but could not be bridged", () => {
    const valuation = { kind: "dcf", dcf: { perShare: null }, gaps: [
      { field: "valuation.dcf.netDebt", reason: "net debt unavailable — enterprise value cannot be bridged to equity", severity: "warn" },
      { field: "valuation.netDebt", reason: "total debt withheld (test refusal) — house net debt unavailable", severity: "warn" },
    ] } as unknown as ValuationResult;
    const fair = computeFairValue({ valuation, currentPrice: 10, currency: "USD", asOf: "2026-06-30" });
    expect(fair.reasons[0]!.reason).toBe("net debt unavailable — enterprise value cannot be bridged to equity: total debt withheld (test refusal) — house net debt unavailable");
  });

  it("control: with no gap to quote, the generic text stays", () => {
    const valuation = { kind: "dcf", dcf: null, gaps: [] } as unknown as ValuationResult;
    expect(computeFairValue({ valuation, currentPrice: 10, currency: "USD", asOf: "2026-06-30" }).reasons[0]!.reason)
      .toBe("deterministic intrinsic per-share unavailable — the model was not built, or net debt / diluted shares / the ADR currency guard suppressed the equity bridge");
  });
});

describe("a ROIC withheld by a refused input is in the manifest (KNW-03)", () => {
  it("records the refusal of each withheld year at the WACC gap's severity", () => {
    const computed = leaseRefused();
    const wacc = computed.gaps.find((g) => g.field === "returns.wacc.weights")!;
    const roic = computed.gaps.find((g) => g.field === "returns.roic")!;
    expect(computed.returns.roic.series.every((year) => year.roicPct === null)).toBe(true);
    expect(roic.severity).toBe(wacc.severity);
    expect(roic.reason).toMatch(/^ROIC withheld for 2 fiscal years whose debt or capital input was refused: 2025-12-31: operating-lease liability 90M .* do not reconcile to the vendor lease line 92M; 2024-12-31: operating-lease liability 90M /);
  });

  it("defaults to a warning, and stays silent for a computable year", () => {
    const M = 1_000_000;
    const balance = (date: string, extra: Record<string, number>) => ({ date, totalEquity: 500 * M, cashAndShortTermInvestments: 100 * M, cashAndCashEquivalents: 60 * M, ...extra });
    const income = [{ date: "2025-12-31", operatingIncome: 50 * M, incomeBeforeTax: 45 * M, incomeTaxExpense: 9 * M },
      { date: "2024-12-31", operatingIncome: 45 * M, incomeBeforeTax: 40 * M, incomeTaxExpense: 8 * M }];
    const refused = computeRoic(income, [balance("2025-12-31", { totalDebt: 200 * M, capitalLeaseObligations: 92 * M, operatingLeaseLiability: 90 * M, financeLeaseLiability: 14 * M }),
      balance("2024-12-31", { totalDebt: 200 * M })]);
    expect(refused.gaps).toContainEqual(expect.objectContaining({ field: "returns.roic", severity: "warn",
      reason: expect.stringMatching(/^ROIC withheld for 1 fiscal year whose debt or capital input was refused: 2025-12-31: operating-lease liability 90M plus finance-lease liability 14M/) }));
    expect(computeRoic(income, [balance("2025-12-31", { totalDebt: 200 * M }), balance("2024-12-31", { totalDebt: 200 * M })], { refusalSeverity: "critical" }).gaps
      .some((g) => g.field === "returns.roic")).toBe(false);
  });

  it("control: the completed rows publish ROIC with no refusal entry", () => {
    const computed = runStageB(leaseShapeStageBBundle());
    expect(computed.returns.roic.latestRoicPct).not.toBeNull();
    expect(computed.gaps.some((g) => g.field === "returns.roic")).toBe(false);
    expect(computed.valuation.multiples!.enterpriseValue.basis).not.toMatch(/^EV withheld/);
  });
});
