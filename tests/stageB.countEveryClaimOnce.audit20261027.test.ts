/**
 * Audit 2026-10-27, batch B4a (Task 14): cross-consumer invariants. The batch
 * title is "count every claim once": one claim set (redeemable preferred and
 * redeemable NCI beside permanent preferred and book NCI), one lease basis
 * (the CODE-1 proven operating-lease slice leaves debt in every consumer, or in
 * none when the switch keeps leases), one divisor (the bridge's diluted shares).
 * Each consumer is read off the same synthetic `runStageB` run, so a rule that
 * is fixed in one consumer and missed in another fails here.
 *
 * Hermetic: `completeCurrencyBundle` (synthetic, values in millions) with the
 * claims written onto every balance row, and inline trimmed companyfacts for
 * the 30 M pension deficit. No network, no stored report.
 */
import { describe, expect, it } from "vitest";

import type { CompanyFacts } from "@/edgar/xbrl";
import { runStageB } from "@/pipeline/compute";
import { computeDcfDisplay } from "@/pipeline/stageB/fairValue";
import { applyMultiples } from "@/pipeline/stageC/passes";
import { keyDataRows } from "@/report/presentation";
import { ReportSchema } from "@/report/schema";

import { M, completeCurrencyBundle } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";
import { loadTask28Fixture } from "./helpers/task28Report";

const usd = (end: string, val: number) => ({ end, val, accn: "0000000042-26-000001", fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-13" });
/** A 30 M pension and OPEB deficit at both candidate bridge dates (family b, noncurrent). */
const PENSION_FACTS = {
  cik: 42,
  entityName: "TEST",
  facts: { "us-gaap": { PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent: { units: { USD: [usd("2026-03-31", 30 * M), usd("2025-12-31", 30 * M)] } } } },
} as unknown as CompanyFacts;

interface Shape {
  /** The covered 100 M operating lease inside total debt (the base); false strips it. */
  lease: boolean;
  /** How the 70 M of redeemable claims is carried: temporary equity (the base) or permanent preferred inside equity. */
  caption: "temporary" | "permanent" | "none";
  pension?: boolean;
}

function bundleFor({ lease, caption, pension = true }: Shape) {
  const b = completeCurrencyBundle({ debt: 300, sic: "2834" });
  for (const key of ["balanceAnnual", "balanceQuarterly"] as const) {
    const member = b.statements[key];
    if (!member.ok) throw new Error("fixture has balances");
    for (const row of member.value.data.rows) {
      // Book NCI is positive (so a null-book rule never applies); equity and assets carry it.
      row.minorityInterest = 30 * M;
      row.totalEquity = (row.totalEquity ?? 0) + 30 * M;
      row.totalAssets = (row.totalAssets ?? 0) + 30 * M;
      if (lease) {
        row.capitalLeaseObligations = 100 * M;
        row.operatingLeaseLiability = 100 * M;
      } else {
        row.totalDebt = (row.totalDebt ?? 0) - 100 * M;
        row.netDebt = (row.netDebt ?? 0) - 100 * M;
        row.capitalLeaseObligations = 0;
        row.operatingLeaseLiability = 0;
      }
      if (caption === "temporary") {
        row.temporaryEquityAttributableToParent = 50 * M;
        row.temporaryEquityAttributableToNoncontrollingInterest = 20 * M;
        row.totalLiabilities = (row.totalLiabilities ?? 0) - 70 * M;
      } else if (caption === "permanent") {
        row.preferredStock = 70 * M;
        row.totalStockholdersEquity = (row.totalStockholdersEquity ?? 0) + 70 * M;
        row.totalEquity = (row.totalEquity ?? 0) + 70 * M;
        row.totalLiabilities = (row.totalLiabilities ?? 0) - 70 * M;
      }
    }
  }
  // An NCI profit key on the FY2025 income row: 5/155 = 3.2% is below the 10% materiality, so the basis stays book.
  const income = b.statements.incomeAnnual;
  if (!income.ok) throw new Error("fixture has an annual income statement");
  const fy2025 = income.value.data.rows.find((r) => r.date === "2025-12-31");
  if (fy2025 === undefined) throw new Error("fixture has FY2025");
  Object.assign(fy2025, { netIncomeConsolidated: 155 * M, netIncomeAttributableToNoncontrollingInterest: 5 * M });
  if (pension) withIssuerFacts(b, PENSION_FACTS as never); // read only for a confirmed issuer
  return b;
}

function run(shape: Shape, options?: { evIncludeLeases: boolean }) {
  const out = runStageB(bundleFor(shape), options ?? { evIncludeLeases: false });
  if (out.valuation.kind !== "dcf" || out.valuation.dcf === null || out.valuation.assumptions === null || out.valuation.multiples === null) {
    throw new Error("expected the DCF route with multiples");
  }
  return { out, valuation: out.valuation, dcf: out.valuation.dcf, multiples: out.valuation.multiples };
}

function formatBillions(v: number): string { return `$${(v / 1e9).toFixed(2)}B`; }

const BASE: Shape = { lease: true, caption: "temporary" };

describe("B4a Task 14: setup", () => {
  it("the fixture publishes a per share on the book basis, with the filed claims in the bridge", () => {
    const { dcf } = run(BASE);
    expect(dcf.bridge.noncontrollingDeductionBasis).toBe("book");
    expect(dcf.perShare).not.toBeNull();
    expect(dcf.bridge.preferred).toBe(50 * M);
    expect(dcf.bridge.minorityInterest).toBe(50 * M);
  });
});

describe("B4a Task 14: one claim set across the consumers", () => {
  it("the key-data EV, the multiples EV and the DCF bridge's claims agree", () => {
    const { out, dcf, multiples } = run(BASE);
    const bridge = dcf.bridge;
    const marketCap = multiples.enterpriseValue.equityScope?.marketCap;
    expect(marketCap).toBeGreaterThan(0);
    // Default switch: the bridge's net debt is lease-excluded (the 100 M lease is proven and leaves debt).
    const identity = (marketCap as number) + (bridge.netDebt as number) + (bridge.preferred as number) + (bridge.minorityInterest as number);
    expect(multiples.enterpriseValue.value).toBeCloseTo(identity, 3);

    // The key-data row. Scoped path (presentation.ts:798) prints `marketValueScope.enterpriseValue`, which is the multiples EV.
    const report = loadTask28Fixture();
    report.valuation = applyMultiples(report.valuation, out.valuation);
    expect(report.valuation.marketValueScope?.enterpriseValue).toBeCloseTo(multiples.enterpriseValue.value as number, 3);
    // Legacy path (:803): no scope, the stored display bridge and the quoted cap give market cap + net debt + NCI + preferred.
    const legacy = loadTask28Fixture();
    delete (legacy.valuation as { marketValueScope?: unknown }).marketValueScope;
    const display = computeDcfDisplay(out.valuation, "USD");
    legacy.valuation.dcf = { ...legacy.valuation.dcf, bridge: display.bridge } as typeof legacy.valuation.dcf;
    legacy.marketData = { version: "1", currency: "USD", estimateCurrency: null, estimateCurrencyBasis: null,
      quote: { price: 100, marketCap: marketCap as number, yearHigh: null, yearLow: null, volume: null, priceAvg50: null, priceAvg200: null, asOf: "2026-07-05" },
      shares: null, enterpriseValue: null, estimates: [], estimatesAsOf: null, priceTarget: null, gradeCounts: null, shortInterest: null };
    const row = keyDataRows(ReportSchema.parse(legacy)).find((r) => r.label === "Enterprise value (market)");
    expect(row, "legacy key-data EV row").toBeDefined();
    expect(row!.value).toBe(formatBillions(multiples.enterpriseValue.value as number));

    // Both exceed the same bundle without the 70 M of temporary equity by exactly 70 M.
    const without = run({ lease: true, caption: "none" });
    expect((multiples.enterpriseValue.value as number) - (without.multiples.enterpriseValue.value as number)).toBeCloseTo(70 * M, 3);
  });
});


describe("B4a Task 14: one lease basis and one caption across invested capital", () => {
  it("sales-to-capital, ROIC and DCF EV do not depend on the lease or the equity caption", () => {
    const base = run(BASE);
    // The covered lease stripped, and the 70 M of redeemable claims re-captioned as permanent preferred inside equity.
    const variant = run({ lease: false, caption: "permanent" });
    const s2c = (r: typeof base) => r.valuation.assumptions!.salesToCapital.value;
    expect(s2c(base)).not.toBeNull();
    expect(s2c(variant)).toBeCloseTo(s2c(base), 9);
    expect(base.out.returns.roic.latestRoicPct).not.toBeNull();
    expect(variant.out.returns.roic.latestRoicPct as number).toBeCloseTo(base.out.returns.roic.latestRoicPct as number, 9);
    expect(variant.dcf.enterpriseValue).toBeCloseTo(base.dcf.enterpriseValue, 9);
  });

  it("METIS_EV_INCLUDE_LEASES=1 keeps the lease everywhere", () => {
    const excluded = run(BASE);
    const included = run(BASE, { evIncludeLeases: true });
    const stripped = run({ lease: false, caption: "temporary" }, { evIncludeLeases: true });
    // Sales-to-capital and ROIC keep the 100 M of lease in capital: the lease-stripped run is the same company without it.
    expect(included.valuation.assumptions!.salesToCapital.value).toBeLessThan(excluded.valuation.assumptions!.salesToCapital.value as number);
    expect(included.out.returns.roic.latestRoicPct as number).toBeLessThan(excluded.out.returns.roic.latestRoicPct as number);
    expect(stripped.valuation.assumptions!.salesToCapital.value as number).toBeGreaterThan(included.valuation.assumptions!.salesToCapital.value as number);
    // The bridge net debt and the multiples EV keep the 100 M.
    expect((included.dcf.bridge.netDebt as number) - (excluded.dcf.bridge.netDebt as number)).toBeCloseTo(100 * M, 3);
    expect((included.multiples.enterpriseValue.value as number) - (excluded.multiples.enterpriseValue.value as number)).toBeCloseTo(100 * M, 3);
    expect((included.multiples.enterpriseValue.value as number) - (stripped.multiples.enterpriseValue.value as number)).toBeCloseTo(100 * M, 3);
  });
});

describe("B4a Task 14: one divisor, each claim once", () => {
  it("per share x divisor = equity value", () => {
    const { dcf } = run(BASE);
    expect(dcf.perShare).not.toBeNull();
    expect((dcf.perShare as number) * (dcf.bridge.dilutedShares as number)).toBeCloseTo(dcf.equityValue as number, 3);
  });

  it("each claim appears once in the bridge", () => {
    const { dcf } = run(BASE);
    const labels = (dcf.bridge.nonOperatingComponents ?? []).map((c) => c.label);
    expect(labels.filter((l) => /pension/i.test(l))).toHaveLength(1);
    // One line per claim kind present: no label repeats.
    expect(new Set(labels).size).toBe(labels.length);
    // The 50 M of redeemable preferred is in the preferred deduction exactly once (permanent preferred is 0).
    expect(dcf.bridge.preferred).toBe(50 * M);
    expect(dcf.bridge.temporaryEquity).toMatchObject({ redeemablePreferred: 50 * M, redeemableNoncontrolling: 20 * M });
    // The 20 M of redeemable NCI is the E-5 floor beside 30 M of book NCI: 50 M in all, not 70 M.
    expect(dcf.bridge.minorityInterest).toBe(50 * M);
    expect(dcf.bridge.noncontrollingDeducted).toBe(50 * M);
    // Equity value is EV less each claim once: net debt, the preferred, the NCI, the after-tax pension, plus the non-operating assets.
    const gap = dcf.enterpriseValue - (dcf.equityValue as number);
    const nonOperating = (dcf.bridge.nonOperatingComponents ?? []).reduce((sum, c) => sum + c.value, 0);
    expect(gap).toBeCloseTo((dcf.bridge.netDebt as number) + 50 * M + 50 * M - nonOperating, 3);
  });
});
