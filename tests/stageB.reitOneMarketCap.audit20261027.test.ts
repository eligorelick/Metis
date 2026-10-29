/**
 * Audit 2026-10-27 FIN-311, FIN-108, FIN-119-V2 (batch B4, Task 12): the
 * equity-REIT block priced the company at quote price x weighted diluted shares
 * and built its own enterprise value from net debt, preferred and book NCI,
 * while the multiples framework prices P/FFO on the quote's admitted market cap
 * and the house EV (lease scope proof, redeemable preferred, redeemable NCI).
 * One report carried two P/FFOs and two EVs. The block now takes both from the
 * multiples; FFO and AFFO per share stay on the diluted count.
 *
 * Hermetic: `completeCurrencyBundle({ reit: true })`. Seeds:
 * `probes/FIN-311.probe.ts` (its real Realty Income half replaced by this
 * synthetic one), `probes/FIN-108.probe.ts` and `probes/FIN-119-V2.probe.ts`
 * (their file writes dropped).
 */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import { reitValuation } from "@/pipeline/stageB/valuation";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { validateBundle } from "@/pipeline/stageA/validate";
import type { DataBundle } from "@/pipeline/types";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";

type Row = Record<string, unknown>;
const X = 1_000 * M;

function reitBundle(opts: { debt?: number; diluted?: number; balance?: Record<string, number | null> } = {}): DataBundle {
  const bundle = completeCurrencyBundle({ debt: opts.debt ?? 100, reit: true, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  if (opts.diluted !== undefined) {
    for (const result of [bundle.statements.incomeAnnual, bundle.statements.incomeQuarterly]) {
      if (!result.ok) throw new Error("fixture income rows missing");
      for (const row of result.value.data.rows as Row[]) row.weightedAverageShsOutDil = opts.diluted;
    }
  }
  if (opts.balance !== undefined) {
    const fields = opts.balance;
    for (const result of [bundle.statements.balanceQuarterly, bundle.statements.balanceAnnual]) {
      if (!result.ok) throw new Error("fixture balance rows missing");
      for (const row of result.value.data.rows as Row[]) {
        Object.assign(row, fields);
        const temp = typeof fields.temporaryEquity === "number" ? fields.temporaryEquity : 0;
        // Assets = liabilities + temporary equity + equity: the claim replaces liabilities.
        if (temp && typeof row.totalLiabilities === "number") row.totalLiabilities -= temp;
        if (typeof fields.preferredStock === "number" && typeof row.totalLiabilities === "number") {
          row.totalLiabilities -= fields.preferredStock;
          for (const f of ["totalStockholdersEquity", "totalEquity"]) if (typeof row[f] === "number") row[f] += fields.preferredStock;
        }
      }
    }
  }
  return bundle;
}

function reitRun(bundle: DataBundle, lease: { evIncludeLeases: boolean } = { evIncludeLeases: false }) {
  const out = runStageB(bundle, lease);
  if (out.valuation.kind !== "reit") throw new Error(`expected the REIT route, got ${out.valuation.kind}`);
  const v = out.valuation;
  const multiple = (key: string): number | null => v.multiples.multiples.find((m) => m.key === key)?.current ?? null;
  return { out, v, reit: v.reit, pToFfo: multiple("priceToFfo"), pToAffo: multiple("priceToAffo"), ev: v.multiples.enterpriseValue.value };
}

describe("FIN-311: one market cap", () => {
  it("one market cap: REIT P/FFO equals the multiples' P/FFO", () => {
    const r = reitRun(reitBundle({ diluted: 104 * M }));
    expect(r.pToFfo).not.toBeNull();
    expect(r.reit.pToFfo as number).toBeCloseTo(r.pToFfo as number, 12);
    expect(r.reit.pToAffo as number).toBeCloseTo(r.pToAffo as number, 12);
    // FFO per share stays on the diluted count: FFO is recovered from the multiples' own P/FFO.
    const ffo = (10_000 * M) / (r.pToFfo as number);
    expect(r.reit.ffoPerShare as number).toBeCloseTo(ffo / (104 * M), 12);
    // The EV is the multiples' EV, not one rebuilt on price x diluted count.
    expect(r.reit.enterpriseValue).toBe(r.ev);
  });

  it("control: with diluted equal to the quote's shares every value is unchanged", () => {
    const r = reitRun(reitBundle({ diluted: 100 * M }));
    expect(r.reit.pToFfo as number).toBeCloseTo(r.pToFfo as number, 12);
    expect(r.reit.pToAffo as number).toBeCloseTo(r.pToAffo as number, 12);
    const ffo = (10_000 * M) / (r.pToFfo as number);
    expect(r.reit.ffoPerShare as number).toBeCloseTo(ffo / (100 * M), 12);
  });

  it("the payload's REIT and multiples P/FFO agree", () => {
    const bundle = reitBundle({ diluted: 104 * M });
    bundle.edgar.companyFacts = { ok: false, gap: { field: "edgar.companyFacts", reason: "Synthetic fixture has no SEC facts", severity: "info" } };
    const payload = assembleContextPayload(bundle, runStageB(bundle, { evIncludeLeases: false }), validateBundle(bundle));
    const figures = payload.computed.find((s) => s.title === "Valuation (computed)")!.figures;
    const reit = figures.find((f) => f.label === "REIT P/FFO")?.value;
    const multiples = figures.find((f) => f.label === "priceToFfo (current)")?.value;
    expect(typeof reit).toBe("number");
    expect(reit as number).toBeCloseTo(multiples as number, 12);
  });

  it("a withheld price withholds the market cap and EV with it (no price figure reappears)", () => {
    // A listing currency that differs from the statements' withholds the REIT price, yet the multiples' scope still carries a market cap.
    const bundle = completeCurrencyBundle({ debt: 100, reit: true, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"], profileCurrency: "EUR" });
    const r = reitRun(bundle);
    expect(r.v.multiples.enterpriseValue.equityScope?.marketCap).toBeGreaterThan(0);
    expect(r.reit.pToFfo).toBeNull();
    expect(r.reit.pToAffo).toBeNull();
    expect(r.reit.enterpriseValue).toBeNull();
    expect(r.reit.impliedCapRatePct).toBeNull();
  });
});

describe("reitValuation: a withheld price withholds the market cap and EV in the block itself", () => {
  const base = { ffoApprox: 400, affoApprox: 300, shares: 100, marketCap: 5000, enterpriseValue: { value: 7000, basis: "test" }, noiApprox: 500, submap: "equity" as const };
  it("a null price gives no P/FFO, EV or cap rate; FFO per share stands", () => {
    const r = reitValuation({ ...base, sharePrice: null });
    expect(r.pToFfo).toBeNull();
    expect(r.pToAffo).toBeNull();
    expect(r.enterpriseValue).toBeNull();
    expect(r.impliedCapRatePct).toBeNull();
    expect(r.ffoPerShare).toBe(4);
    expect(r.gaps.find((g) => g.field === "valuation.reit.marketCap")?.reason).toMatch(/withheld or unavailable \(a currency, security-basis or per-share guard, or no admitted market cap\)/);
  });
  it("control: a price publishes them", () => {
    expect(reitValuation({ ...base, sharePrice: 50 })).toMatchObject({ pToFfo: 12.5, enterpriseValue: 7000 });
  });
});

describe("FIN-108: one EV, the CODE-1 lease rule included", () => {
  // The same two rows as tests/lease.partialOperating.test.ts (CODE-1).
  const base = { shortTermDebt: null, longTermDebt: null, netDebt: null, cashAndCashEquivalents: 100 * M, shortTermInvestments: 0, cashAndShortTermInvestments: 100 * M, financeLeaseLiability: 0 };
  const borrowingsOnly = { ...base, totalDebt: 300 * M, capitalLeaseObligations: null, operatingLeaseLiability: 150 * M };
  const leaseInclusive = { ...borrowingsOnly, totalDebt: 450 * M, capitalLeaseObligations: 150 * M };

  it("one EV: the REIT EV equals the multiples EV, including an unproven lease scope", () => {
    const r = reitRun(reitBundle({ debt: 300, balance: borrowingsOnly }));
    expect(r.v.multiples.enterpriseValue.leaseLiability).toBeNull();
    expect(r.ev).toBe(10_200_000_000);
    expect(r.reit.enterpriseValue).toBe(r.ev);
  });

  it("control: a lease-inclusive total with its lease total gives the two equal (as before)", () => {
    const r = reitRun(reitBundle({ debt: 300, balance: leaseInclusive }));
    expect(r.v.multiples.enterpriseValue.leaseLiability).toBe(150 * M);
    expect(r.reit.enterpriseValue).not.toBeNull();
    expect(r.reit.enterpriseValue).toBe(r.ev);
  });

  it("the lease-refusal case withholds the REIT EV with the multiples' EV, and keeps the gap", () => {
    // Only the noncurrent operating-lease maturity is tagged, and no same-filing financing components prove the slice sits in debt.
    const partial = { ...borrowingsOnly, fieldProvenance: { operatingLeaseLiability: { tags: ["us-gaap/OperatingLeaseLiabilityNoncurrent"] } } } as unknown as Record<string, number | null>;
    const r = reitRun(reitBundle({ debt: 300, balance: partial }));
    expect(r.ev).toBeNull();
    expect(r.reit.enterpriseValue).toBeNull();
    expect(r.v.gaps.some((g) => g.field === "valuation.reit.enterpriseValue.leaseScope")).toBe(true);
  });
});

describe("FIN-119-V2: redeemable claims in the REIT EV", () => {
  const withBalance = (balance: Record<string, number>) => reitRun(reitBundle({ balance }));
  const base = withBalance({});

  it("control: permanent preferred raises the EV by X", () => {
    const permanent = withBalance({ preferredStock: X });
    expect((permanent.reit.enterpriseValue as number) - (base.reit.enterpriseValue as number)).toBeCloseTo(X, -3);
    expect(permanent.reit.impliedCapRatePct as number).toBeCloseTo(2.6411657559198543, 9);
  });

  it("redeemable preferred and redeemable OP units raise the REIT EV like their permanent counterparts", () => {
    const permanent = withBalance({ preferredStock: X });
    const preferred = withBalance({ temporaryEquityAttributableToParent: X, temporaryEquity: X });
    const opUnits = withBalance({ temporaryEquityAttributableToNoncontrollingInterest: X, temporaryEquity: X });
    expect((preferred.reit.enterpriseValue as number) - (base.reit.enterpriseValue as number)).toBeCloseTo(X, -3);
    expect(preferred.reit.impliedCapRatePct as number).toBeCloseTo(permanent.reit.impliedCapRatePct as number, 9);
    expect(preferred.reit.impliedCapRatePct as number).toBeCloseTo(2.6411657559198543, 9);
    expect((opUnits.reit.enterpriseValue as number) - (base.reit.enterpriseValue as number)).toBeCloseTo(X, -3);
    expect(preferred.reit.enterpriseValue).toBe(preferred.ev);
    expect(opUnits.reit.enterpriseValue).toBe(opUnits.ev);
    // The note quotes the multiples' own basis verbatim, so its components and amounts match by construction.
    for (const run of [preferred, opUnits]) {
      const note = run.reit.notes.find((n) => n.startsWith("enterprise value")) ?? "";
      expect(note).toContain("the multiples' enterprise value");
      expect(note).toContain(run.v.multiples.enterpriseValue.basis);
      expect(note).toMatch(/redeemable/);
    }
  });

  it("control: a run with no temporary-equity claim does not mention redeemable claims in the EV note", () => {
    const note = base.reit.notes.find((n) => n.startsWith("enterprise value")) ?? "";
    expect(note).toContain(base.v.multiples.enterpriseValue.basis);
    expect(note).not.toMatch(/redeemable|temporary equity/);
  });

  it("the fiscal-year note says the market cap is at the current quote", () => {
    const notes = [...base.out.valuation.notes];
    expect(notes.some((n) => n.includes("The market cap in P/FFO is at the current quote, so for a REIT compounding FFO"))).toBe(true);
    expect(notes.some((n) => n.includes("The share price in P/FFO"))).toBe(false);
  });
});
