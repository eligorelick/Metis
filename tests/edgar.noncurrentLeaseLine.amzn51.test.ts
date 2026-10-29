/**
 * Audit 2026-10-29, AMZN report #51 (VAL-1, FIG-1, GRD-01; D-132): a vendor
 * balance row whose lease line is the filing's NONCURRENT lease liabilities.
 *
 * The provider's `capitalLeaseObligations` was "Long-term lease liabilities"
 * (OperatingLeaseLiabilityNoncurrent + FinanceLeaseLiabilityNoncurrent), its
 * current lease portion 0 and its `shortTermDebt` 0. SEC enrichment then put
 * the TOTAL operating and finance lease liabilities on the same row, and the
 * lease guard refused every balance: WACC, net debt, the DCF and the EV
 * multiples were withheld. The row is completed from that one filing instead,
 * and every case the completion cannot establish is withheld with its reason.
 *
 * The AMZN-shaped rows and facts are in ./helpers/amzn51LeaseShape (SEC-filed
 * amounts, synthetic issuer); the Stage B fixture uses round synthetic numbers.
 * No provider row is committed.
 */
import { describe, expect, it } from "vitest";

import { admitDebtFields } from "@/edgar/financialEnrichment";
import { runStageB } from "@/pipeline/compute";
import { leaseDebtConflict } from "@/pipeline/stageB/netDebt";
import { computeWacc } from "@/pipeline/stageB/returns";
import type { FmpBalanceSheetRow } from "@/providers/fmp";

import { ACCN, FILED, FILED_FACTS, FY, M, OBSERVED, Q2, SHAPE, companyFacts, leaseShapeStageBBundle, vendorRow, without } from "./helpers/amzn51LeaseShape";

describe("a noncurrent-only vendor lease line is completed from its filing (VAL-1)", () => {
  it("completes the 2026-06-30 AMZN shape to the filed composition, 242,320M", () => {
    const row = vendorRow(Q2);
    expect(leaseDebtConflict(row)).not.toBeNull(); // the refusal report #51 published
    const { row: out, gaps } = admitDebtFields(row, companyFacts(FILED_FACTS), "USD", OBSERVED);
    expect(out.capitalLeaseObligations).toBe(109_771 * M); // 96,320 + 13,451
    expect(out.shortTermDebt).toBe(3_655 * M); // LongTermDebtCurrent 3,330 + ShortTermBorrowings 325
    expect(out.longTermDebt).toBe(128_894 * M);
    expect(out.totalDebt).toBe(242_320 * M);
    expect(out.netDebt).toBe((242_320 - 78_213) * M);
    expect(out.operatingLeaseLiability).toBe(96_320 * M);
    expect(out.financeLeaseLiability).toBe(13_451 * M);
    expect(leaseDebtConflict(out)).toBeNull();
    expect(out.fieldConflicts?.totalDebt).toBeUndefined();
    expect(out.fieldProvenance?.totalDebt?.tags).toEqual(expect.arrayContaining([
      "us-gaap/LongTermDebtCurrent", "us-gaap/ShortTermBorrowings", "us-gaap/LongTermDebtNoncurrent",
      "us-gaap/OperatingLeaseLiability", "us-gaap/FinanceLeaseLiability"]));
    expect(out.fieldProvenance?.totalDebt?.filings).toEqual([{ accn: ACCN, filed: FILED, form: "10-Q" }]);
    expect(out.fieldProvenance?.shortTermDebt?.tags).toEqual(["us-gaap/LongTermDebtCurrent", "us-gaap/ShortTermBorrowings"]);
    expect(out.fieldProvenance?.capitalLeaseObligations?.tags).toEqual(["us-gaap/OperatingLeaseLiability", "us-gaap/FinanceLeaseLiability"]);
    const info = gaps.find((gap) => gap.field === `statements.balance.${Q2}.totalDebt`);
    expect(info).toMatchObject({ severity: "info", expected: true });
    expect(info?.reason).toMatch(/noncurrent lease liabilities/);
    expect(info?.reason).toContain(ACCN);
    expect(info?.reason).toContain("OperatingLeaseLiabilityNoncurrent");
    expect(gaps.some((gap) => gap.severity !== "info")).toBe(false);
  });

  it("completes the 2025-12-31 shape the same way", () => {
    const { row: out } = admitDebtFields(vendorRow(FY), companyFacts(FILED_FACTS), "USD", OBSERVED);
    expect(out.totalDebt).toBe((2_748 + 455 + 65_648 + 89_252 + 12_286) * M);
    expect(out.capitalLeaseObligations).toBe((89_252 + 12_286) * M);
    expect(leaseDebtConflict(out)).toBeNull();
  });

  it("takes the newest filing that establishes the whole composition, never mixing two", () => {
    // A later filing repeats the year-end balance sheet without its debt note
    // (Amazon's 2021-12-31 short-term borrowings are tagged only in two later 10-Qs).
    const facts = companyFacts({ [FY]: FILED_FACTS[FY]! });
    const older = { accn: "0000000042-26-000014", filed: "2026-04-30", form: "10-Q" };
    const usGaap = facts.facts["us-gaap"] as Record<string, { units: { USD: Record<string, unknown>[] } }>;
    for (const [tag, concept] of Object.entries(usGaap)) {
      const point = concept.units.USD[0]!;
      concept.units.USD.push({ ...point, ...older });
      if (tag === "ShortTermBorrowings") concept.units.USD = [{ ...point, ...older }];
    }
    const { row: out } = admitDebtFields(vendorRow(FY), facts, "USD", OBSERVED);
    expect(out.totalDebt).toBe((2_748 + 455 + 65_648 + 89_252 + 12_286) * M);
    expect(out.fieldProvenance?.totalDebt?.filings).toEqual([older]);
  });

  it("is idempotent: Stage B re-admits a completed row unchanged", () => {
    const facts = companyFacts(FILED_FACTS);
    const once = admitDebtFields(vendorRow(Q2), facts, "USD", OBSERVED).row;
    const twice = admitDebtFields(once, facts, "USD", OBSERVED);
    expect(twice.row).toBe(once);
    expect(twice.gaps).toEqual([]);
  });

  it("control: a vendor lease line that is already the total keeps today's behaviour", () => {
    const row = vendorRow(Q2, { shortTermDebt: 3_655, capitalLeaseObligations: 109_771 });
    const admitted = admitDebtFields(row, companyFacts(FILED_FACTS), "USD", OBSERVED);
    expect(admitted.row).toBe(row);
    expect(admitted.gaps).toEqual([]);
  });

  it("control: a genuine contradiction (neither the noncurrent sum nor the total) is still refused", () => {
    // The filed current debt is on the row, so only the lease contradiction speaks (a vendor zero beside it is withheld, D-132).
    const row = vendorRow(Q2, { shortTermDebt: 3_655, capitalLeaseObligations: 100_000 });
    const { row: out } = admitDebtFields(row, companyFacts(FILED_FACTS), "USD", OBSERVED);
    expect(out.capitalLeaseObligations).toBe(100_000 * M);
    expect(out.totalDebt).toBe(row.totalDebt);
    const conflict = leaseDebtConflict(out);
    expect(conflict).not.toBeNull();
    expect(conflict).toContain("96,320M");
    expect(conflict).toContain("13,451M");
    expect(conflict).toContain("100,000M");
  });

  it("control: a noncurrent-only line with no current-debt tag withholds total debt with the reason", () => {
    const facts = companyFacts(without(FILED_FACTS, "LongTermDebtCurrent", "ShortTermBorrowings"));
    const { row: out, gaps } = admitDebtFields(vendorRow(Q2), facts, "USD", OBSERVED);
    expect(out.totalDebt).toBeNull();
    expect(out.netDebt).toBeNull();
    expect(out.fieldConflicts?.totalDebt).toMatchObject({ usable: false, vendorValue: 223_232 * M });
    expect(out.fieldConflicts?.totalDebt?.reason).toMatch(/noncurrent lease liabilities/);
    expect(out.fieldConflicts?.totalDebt?.reason).toMatch(/LongTermDebtCurrent/);
    expect(gaps).toContainEqual(expect.objectContaining({ field: `statements.balance.${Q2}.totalDebt`, severity: "warn" }));
  });

  it("control: a filer with no finance lease completes from the operating lease alone", () => {
    const points = without(FILED_FACTS, "FinanceLeaseLiability", "FinanceLeaseLiabilityCurrent", "FinanceLeaseLiabilityNoncurrent");
    const row = vendorRow(Q2, { capitalLeaseObligations: 82_575 });
    delete row.financeLeaseLiability;
    delete row.fieldProvenance!.financeLeaseLiability;
    const { row: out } = admitDebtFields(row, companyFacts(points), "USD", OBSERVED);
    expect(out.capitalLeaseObligations).toBe(96_320 * M);
    expect(out.totalDebt).toBe((3_655 + 128_894 + 96_320) * M);
    expect(out.financeLeaseLiability).toBeUndefined();
    expect(leaseDebtConflict(out)).toBeNull();
  });

  it("control: a nonzero vendor short-term debt is kept and not double counted", () => {
    const row = vendorRow(Q2, { shortTermDebt: 3_655 });
    const { row: out } = admitDebtFields(row, companyFacts(FILED_FACTS), "USD", OBSERVED);
    expect(out.shortTermDebt).toBe(3_655 * M);
    expect(out.fieldProvenance?.shortTermDebt).toBeUndefined();
    expect(out.totalDebt).toBe(242_320 * M); // not 245,975: the filed current debt is not added again
  });

  it("control: a nonzero vendor short-term debt the filing contradicts withholds total debt", () => {
    const { row: out } = admitDebtFields(vendorRow(Q2, { shortTermDebt: 5_000 }), companyFacts(FILED_FACTS), "USD", OBSERVED);
    expect(out.totalDebt).toBeNull();
    expect(out.fieldConflicts?.totalDebt?.reason).toMatch(/does not reconcile/);
  });
});

describe("a noncurrent debt that already holds the finance leases is not completed (review m1, Duke shape)", () => {
  // Duke Energy's 10-K at 2021-12-31 (SEC-filed, millions): LongTermDebtNoncurrent equals
  // LongTermDebtAndCapitalLeaseObligations, so its noncurrent debt carries the noncurrent finance leases.
  const DUKE_FY = "2021-12-31";
  const duke = (aclo: number | null) => companyFacts({ [DUKE_FY]: {
    LongTermDebtNoncurrent: 60_448, LongTermDebtCurrent: 3_387, ShortTermBorrowings: 3_304,
    OperatingLeaseLiability: 1_261, OperatingLeaseLiabilityCurrent: 187, OperatingLeaseLiabilityNoncurrent: 1_074,
    FinanceLeaseLiability: 915, FinanceLeaseLiabilityCurrent: 151, FinanceLeaseLiabilityNoncurrent: 764,
    ...(aclo === null ? {} : { LongTermDebtAndCapitalLeaseObligations: aclo }),
  } });
  // A provider row of the AMZN #51 shape: long-term debt plus the noncurrent lease line, no current part.
  const row = { date: DUKE_FY, reportedCurrency: "USD", cik: "0000000042", shortTermDebt: 0, longTermDebt: 60_448 * M,
    capitalLeaseObligations: 1_838 * M, capitalLeaseObligationsCurrent: 0, capitalLeaseObligationsNonCurrent: 1_838 * M,
    totalDebt: (60_448 + 1_838) * M, cashAndCashEquivalents: 343 * M } as FmpBalanceSheetRow;

  it("refuses the completion, naming the three facts, instead of counting the finance leases twice", () => {
    const { row: out } = admitDebtFields(row, duke(60_448), "USD", OBSERVED);
    expect(out.totalDebt).toBeNull();
    expect(out.fieldConflicts?.totalDebt?.reason).toMatch(/the filing's LongTermDebtNoncurrent 60448000000 equals its LongTermDebtAndCapitalLeaseObligations 60448000000 while FinanceLeaseLiabilityNoncurrent is 764000000/);
  });

  it("control: an aggregate that adds the finance leases to the noncurrent debt still completes", () => {
    const { row: out } = admitDebtFields(row, duke(60_448 + 764), "USD", OBSERVED);
    expect(out.totalDebt).toBe((3_387 + 3_304 + 60_448 + 1_261 + 915) * M);
  });
});

describe("the refusal names the values and the scope, not the issuer (VAL-4)", () => {
  it("states the operating-lease total against the vendor's noncurrent-only lease line", () => {
    expect(leaseDebtConflict(vendorRow(Q2))).toContain(
      "operating-lease liability 96,320M (current + noncurrent) exceeds the vendor lease line 94,338M (noncurrent only)");
  });

  it("never calls a refused total debt missing, and keeps the debt-free caveat for an absent one", () => {
    const base = { beta: 1.1, riskFreePct: 4.2, erpPct: 5.0, interestExpenseTtm: 40, totalDebtAvg: null, marketCap: 4000,
      effectiveTaxRate: 0.21, ebitTtm: 600, analysisDate: "2026-01-15", reportedCurrency: "USD", quoteCurrency: "USD" };
    const refused = computeWacc({ ...base, totalDebtUnavailable: "2025-12-31: some refusal", totalDebtRefused: true });
    const gap = refused.gaps.find((g) => g.field === "returns.wacc.weights")!;
    expect(gap.reason).toContain("2025-12-31: some refusal");
    expect(gap.reason).not.toMatch(/missing|debt-free/);
    const absent = computeWacc({ ...base, totalDebtUnavailable: "no book total debt on 2025-12-31 or 2024-12-31" });
    expect(absent.gaps.find((g) => g.field === "returns.wacc.weights")!.reason).toMatch(/cannot distinguish debt-free from unknown leverage/);
  });
});

describe("Stage B on the completed rows: WACC and net debt become available (GRD-01)", () => {
  it("builds the WACC, net debt and the debt bridge on the filed composition", () => {
    const computed = runStageB(leaseShapeStageBBundle());
    const composed = (SHAPE.ltdCurrent + SHAPE.shortBorrowings + SHAPE.ltdNoncurrent + SHAPE.opCurrent + SHAPE.opNoncurrent + SHAPE.finCurrent + SHAPE.finNoncurrent) * M;
    expect(computed.returns.wacc.waccPct).not.toBeNull();
    expect(computed.returns.wacc.gaps.some((g) => g.field === "returns.wacc.weights")).toBe(false);
    expect(computed.capital.current?.debtBridge.totalDebtIncludingLeases).toBe(composed);
    expect(computed.capital.netDebtToEbitda.netDebt).not.toBeNull();
    expect(computed.valuation.multiples?.enterpriseValue.value).not.toBeNull();
  });
});
