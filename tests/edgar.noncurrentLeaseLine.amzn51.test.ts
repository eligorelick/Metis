/**
 * Audit 2026-10-29, AMZN report #51 (VAL-1, FIG-1, GRD-01; D-133): a vendor
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

import { admitDebtFields, balanceAdmissionEntries } from "@/edgar/financialEnrichment";
import { runStageB } from "@/pipeline/compute";
import { leaseDebtConflict } from "@/pipeline/stageB/netDebt";
import { computeWacc } from "@/pipeline/stageB/returns";
import type { FmpBalanceSheetRow } from "@/providers/fmp";

import { ACCN, FILED, FILED_FACTS, FY, M, OBSERVED, Q2, SHAPE, companyFacts, leaseShapeStageBBundle, vendorRow, without } from "./helpers/amzn51LeaseShape";

describe("a noncurrent-only vendor lease line is completed from its filing (VAL-1)", () => {
  it("completes the 2026-06-30 AMZN shape to the filed composition, 242,320M", () => {
    const row = vendorRow(Q2);
    expect(leaseDebtConflict(row)).not.toBeNull(); // the refusal report #51 published
    const { row: out, gaps, admissions } = admitDebtFields(row, companyFacts(FILED_FACTS), "USD", OBSERVED);
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
    // Review m6: the row's explanation is an admission record; the manifest entry is merged per kind by the caller.
    expect(gaps).toEqual([]);
    expect(admissions).toEqual([expect.objectContaining({ kind: "completion", date: Q2, summary: `242,320M (vendor 223,232M; 10-Q ${ACCN})` })]);
    expect(admissions[0]!.detail).toMatch(/noncurrent lease liabilities/);
    expect(admissions[0]!.detail).toContain(ACCN);
    expect(admissions[0]!.detail).toContain("OperatingLeaseLiabilityNoncurrent");
    // Fix round 3: every amount in the text reads in millions.
    expect(admissions[0]!.detail).toBe(`the vendor lease line 94,338M USD is the 10-Q ${ACCN} filing's noncurrent lease liabilities ` +
      "(OperatingLeaseLiabilityNoncurrent 82,575M + FinanceLeaseLiabilityNoncurrent 11,763M) at 2026-06-30, not total lease liabilities; completed from that filing: " +
      "lease liabilities 109,771M (OperatingLeaseLiability 96,320M + FinanceLeaseLiability 13,451M), current debt 3,655M (LongTermDebtCurrent + ShortTermBorrowings), " +
      "total debt 3,655M + noncurrent debt 128,894M + leases 109,771M = 242,320M USD; vendor total 223,232M retained in the raw row");
    expect(admissions[0]!.detail.replace(ACCN, "")).not.toMatch(/\d{7,}/);
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
    expect(twice.admissions).toEqual([]);
  });

  it("control: a vendor lease line that is already the total keeps today's behaviour", () => {
    const row = vendorRow(Q2, { shortTermDebt: 3_655, capitalLeaseObligations: 109_771 });
    const admitted = admitDebtFields(row, companyFacts(FILED_FACTS), "USD", OBSERVED);
    expect(admitted.row).toBe(row);
    expect(admitted.gaps).toEqual([]);
    expect(admitted.admissions).toEqual([]);
  });

  it("one manifest entry lists every completed date, newest first, a date counted once (review m6)", () => {
    const facts = companyFacts(FILED_FACTS);
    const quarter = admitDebtFields(vendorRow(Q2), facts, "USD", OBSERVED).admissions;
    const year = admitDebtFields(vendorRow(FY), facts, "USD", OBSERVED).admissions;
    const entries = balanceAdmissionEntries([...year, ...quarter, ...year]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ field: "statements.balance.totalDebt", severity: "info", expected: true });
    expect(entries[0]!.reason).toBe(
      "vendor lease line held only the noncurrent lease liabilities at 2 balance dates; total debt completed from each date's filing, the vendor total retained in the raw row: " +
      `2026-06-30 242,320M (vendor 223,232M; 10-Q ${ACCN}); 2025-12-31 170,389M (vendor 152,987M; 10-Q ${ACCN}). Latest: ${quarter[0]!.detail}`);
    expect(balanceAdmissionEntries([])).toEqual([]);
  });

  it("Stage B on a frozen provider bundle: one completion entry, no entry per date (review m6)", () => {
    const computed = runStageB(leaseShapeStageBBundle());
    const perDate = computed.gaps.filter((g) => /^statements\.balance\.\d{4}-\d{2}-\d{2}\.totalDebt$/.test(g.field) && g.severity === "info");
    expect(perDate).toEqual([]);
    const merged = computed.gaps.filter((g) => g.field === "statements.balance.totalDebt");
    expect(merged).toHaveLength(1);
    expect(merged[0]!.reason).toMatch(/^vendor lease line held only the noncurrent lease liabilities at \d+ balance dates; /);
  });

  it("control: a genuine contradiction (neither the noncurrent sum nor the total) is still refused", () => {
    // The filed current debt is on the row, so only the lease contradiction speaks (a vendor zero beside it is withheld, D-133).
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

describe("a noncurrent debt that may already hold the finance leases is not completed (review m1, Duke shape)", () => {
  // Duke Energy's 10-K at 2021-12-31 (SEC-filed, millions): LongTermDebtNoncurrent equals
  // LongTermDebtAndCapitalLeaseObligations, so its noncurrent debt may carry the noncurrent finance leases.
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
    expect(out.fieldConflicts?.totalDebt?.reason).toMatch(/the filing's LongTermDebtNoncurrent 60,448M equals its LongTermDebtAndCapitalLeaseObligations 60,448M while FinanceLeaseLiabilityNoncurrent is 764M/);
  });

  it("control: an aggregate that adds the finance leases to the noncurrent debt still completes", () => {
    const { row: out } = admitDebtFields(row, duke(60_448 + 764), "USD", OBSERVED);
    expect(out.totalDebt).toBe((3_387 + 3_304 + 60_448 + 1_261 + 915) * M);
  });
});

describe("a refused completion says only what it checked (review m2)", () => {
  it("NVIDIA shape: a vendor short-term debt equal to the current operating lease is not called missing current debt", () => {
    // NVIDIA's 10-Q at 2022-05-01 (SEC-filed, millions): no current debt and no finance lease tagged; the vendor's
    // 147M short-term debt is the current operating lease, so its total 11,846M already held it.
    const end = "2022-05-01";
    const facts = companyFacts({ [end]: { OperatingLeaseLiability: 899, OperatingLeaseLiabilityCurrent: 147, OperatingLeaseLiabilityNoncurrent: 752, LongTermDebtNoncurrent: 10_947 } });
    const row = { date: end, reportedCurrency: "USD", cik: "0000000042", shortTermDebt: 147 * M, longTermDebt: 10_947 * M, capitalLeaseObligations: 752 * M,
      capitalLeaseObligationsCurrent: 0, capitalLeaseObligationsNonCurrent: 752 * M, totalDebt: 11_846 * M } as FmpBalanceSheetRow;
    const reason = admitDebtFields(row, facts, "USD", OBSERVED).row.fieldConflicts?.totalDebt?.reason;
    expect(reason).toBe(`incomplete debt carrying value: the vendor lease line 752M USD is the 10-Q ${ACCN} filing's noncurrent lease liabilities ` +
      "(OperatingLeaseLiabilityNoncurrent 752M; no finance lease is filed) at 2022-05-01, but the vendor short-term debt 147M equals current lease liabilities " +
      "the completed lease total already holds; the filing tags none of LongTermDebtCurrent, DebtCurrent, ShortTermBorrowings or CommercialPaper to show it is debt, " +
      "so total debt and net debt are withheld rather than counting those leases twice");
  });

  it("a current debt the filing does not tag is named as unestablished", () => {
    const reason = admitDebtFields(vendorRow(Q2), companyFacts(without(FILED_FACTS, "LongTermDebtCurrent", "ShortTermBorrowings")), "USD", OBSERVED).row.fieldConflicts?.totalDebt?.reason;
    expect(reason).toMatch(/, but the current debt cannot be established: the filing tags no LongTermDebtCurrent at 2026-06-30 and the vendor short-term debt is 0M; total debt and net debt are withheld rather than published with a current debt the filing does not establish$/);
  });

  it("a DebtCurrent not established in the completing filing is named so, and a contradicting one names both amounts", () => {
    // Final review of 0d467bc (Minor 2): "(in another filing)" was printed for both shapes, and no comparison was made.
    type Unit = { accn: string; val: number; end: string; filed: string; form: string };
    const withDebtCurrent = (edit: (units: Unit[]) => void) => {
      const facts = companyFacts({ [Q2]: { ...FILED_FACTS[Q2]!, DebtCurrent: 3_655 } });
      edit((facts.facts["us-gaap"] as Record<string, { units: { USD: Unit[] } }>).DebtCurrent!.units.USD);
      return admitDebtFields(vendorRow(Q2), facts, "USD", OBSERVED).row.fieldConflicts?.totalDebt?.reason;
    };
    for (const edit of [(u: Unit[]) => { u[0]!.accn = "0000000042-26-000099"; }, (u: Unit[]) => { u.push({ ...u[0]!, val: 3_700 * M }); }]) {
      const reason = withDebtCurrent(edit);
      expect(reason).toMatch(/the filing's DebtCurrent is not established in that one filing/);
      expect(reason).not.toMatch(/in another filing/);
    }
    const contradicted = admitDebtFields(vendorRow(Q2), companyFacts({ [Q2]: { ...FILED_FACTS[Q2]!, DebtCurrent: 3_000 } }), "USD", OBSERVED).row.fieldConflicts?.totalDebt?.reason;
    expect(contradicted).toMatch(/the composed current debt 3,655M does not reconcile with the filing's DebtCurrent 3,000M/);
  });

  it("any other cause says only that the row is not completed", () => {
    const reason = admitDebtFields(vendorRow(Q2), companyFacts(without(FILED_FACTS, "LongTermDebtNoncurrent")), "USD", OBSERVED).row.fieldConflicts?.totalDebt?.reason;
    expect(reason).toMatch(/cannot be matched to a LongTermDebtNoncurrent in that filing, so a current portion inside it cannot be ruled out; the row is not completed from that filing, so total debt and net debt are withheld$/);
    expect(reason).not.toMatch(/rather than published without the current debt and current lease liabilities/);
  });
});

describe("commercial paper beside short-term borrowings is counted once (fix round 4, Codex)", () => {
  // The AMZN shape with its current debt replaced by round numbers (millions): current maturities 30, borrowings 120, commercial paper 50.
  const shape = (tags: Record<string, number>) => companyFacts({ [Q2]: { ...without(FILED_FACTS, "LongTermDebtCurrent", "ShortTermBorrowings")[Q2]!, ...tags } });
  const EXCLUDED = "CommercialPaper 50M excluded as a component of ShortTermBorrowings";

  it("completes with a current debt of 150, not 200", () => {
    const { row: out, admissions } = admitDebtFields(vendorRow(Q2), shape({ LongTermDebtCurrent: 30, ShortTermBorrowings: 120, CommercialPaper: 50 }), "USD", OBSERVED);
    expect(out.shortTermDebt).toBe(150 * M);
    expect(out.totalDebt).toBe((150 + 128_894 + 109_771) * M);
    expect(out.fieldProvenance?.shortTermDebt?.tags).toEqual(["us-gaap/LongTermDebtCurrent", "us-gaap/ShortTermBorrowings"]);
    expect(admissions[0]!.detail).toContain(`current debt 150M (LongTermDebtCurrent + ShortTermBorrowings; ${EXCLUDED})`);
  });

  it("the same row with DebtCurrent 150 completes and is not refused", () => {
    const { row: out } = admitDebtFields(vendorRow(Q2), shape({ LongTermDebtCurrent: 30, ShortTermBorrowings: 120, CommercialPaper: 50, DebtCurrent: 150 }), "USD", OBSERVED);
    expect(out.fieldConflicts?.totalDebt).toBeUndefined();
    expect(out.totalDebt).toBe((150 + 128_894 + 109_771) * M);
  });

  it("the fallback with no current maturities or DebtCurrent: a vendor 120 is kept, a vendor 170 is refused", () => {
    const facts = shape({ ShortTermBorrowings: 120, CommercialPaper: 50 });
    const kept = admitDebtFields(vendorRow(Q2, { shortTermDebt: 120 }), facts, "USD", OBSERVED);
    expect(kept.row.totalDebt).toBe((120 + 128_894 + 109_771) * M);
    expect(kept.admissions[0]!.detail).toContain(`it equals the filed current debt (ShortTermBorrowings 120M; ${EXCLUDED})`);
    const refused = admitDebtFields(vendorRow(Q2, { shortTermDebt: 170 }), facts, "USD", OBSERVED).row;
    expect(refused.totalDebt).toBeNull();
    expect(refused.fieldConflicts?.totalDebt?.reason).toMatch(/the vendor short-term debt 170M does not reconcile with the filed current debt 120M \(ShortTermBorrowings 120M; CommercialPaper 50M excluded as a component of ShortTermBorrowings\)/);
  });

  it("control: commercial paper without short-term borrowings still counts", () => {
    const { row: out, admissions } = admitDebtFields(vendorRow(Q2), shape({ LongTermDebtCurrent: 30, CommercialPaper: 50 }), "USD", OBSERVED);
    expect(out.shortTermDebt).toBe(80 * M);
    expect(admissions[0]!.detail).toContain("current debt 80M (LongTermDebtCurrent + CommercialPaper)");
    expect(admissions[0]!.detail).not.toMatch(/excluded as a component/);
    const kept = admitDebtFields(vendorRow(Q2, { shortTermDebt: 50 }), shape({ CommercialPaper: 50 }), "USD", OBSERVED);
    expect(kept.row.totalDebt).toBe((50 + 128_894 + 109_771) * M);
  });
});

describe("a kept vendor short-term debt is checked against filed borrowings when no current maturities are tagged (fix round 2, I-1)", () => {
  // The AMZN shape without LongTermDebtCurrent or DebtCurrent: the filing still tags ShortTermBorrowings 325.
  const borrowingsOnly = (extra: Record<string, number> = {}) => companyFacts({ [Q2]: { ...without(FILED_FACTS, "LongTermDebtCurrent", "DebtCurrent")[Q2]!, ...extra } });

  it("refuses a vendor figure that holds the current leases besides the borrowings (325 + 15,433)", () => {
    const { row: out, admissions } = admitDebtFields(vendorRow(Q2, { shortTermDebt: 325 + 15_433 }), borrowingsOnly(), "USD", OBSERVED);
    expect(out.totalDebt).toBeNull();
    expect(admissions).toEqual([]);
    const reason = out.fieldConflicts?.totalDebt?.reason;
    expect(reason).toMatch(/, but the vendor short-term debt 15,758M does not reconcile with the filed current debt 325M \(ShortTermBorrowings 325M\); the row is not completed from that filing, so total debt and net debt are withheld$/);
    expect(reason).not.toMatch(/tags no current debt/);
  });

  it("refuses any other disagreement with the filed borrowings", () => {
    expect(admitDebtFields(vendorRow(Q2, { shortTermDebt: 1_000 }), borrowingsOnly(), "USD", OBSERVED).row.totalDebt).toBeNull();
  });

  it("control: a vendor figure equal to the filed borrowings is kept, and the text names them", () => {
    // Fix round 4: beside ShortTermBorrowings, CommercialPaper is a component of it and is not added again.
    const { row: out, admissions } = admitDebtFields(vendorRow(Q2, { shortTermDebt: 325 }), borrowingsOnly({ CommercialPaper: 75 }), "USD", OBSERVED);
    expect(out.totalDebt).toBe((325 + 128_894 + 109_771) * M);
    expect(admissions[0]!.detail).toContain("current debt 325M (the vendor's short-term debt, kept; it equals the filed current debt (ShortTermBorrowings 325M; CommercialPaper 75M excluded as a component of ShortTermBorrowings))");
    expect(admissions[0]!.detail).not.toMatch(/tags no current debt/);
    expect(admitDebtFields(vendorRow(Q2, { shortTermDebt: 325 + 75 }), borrowingsOnly({ CommercialPaper: 75 }), "USD", OBSERVED).row.totalDebt).toBeNull();
  });

  it("control: with current maturities tagged, the kept figure names the tags and amounts it equals", () => {
    const { admissions } = admitDebtFields(vendorRow(Q2, { shortTermDebt: 3_655 }), companyFacts(FILED_FACTS), "USD", OBSERVED);
    expect(admissions[0]!.detail).toContain("it equals the filed current debt (LongTermDebtCurrent 3,330M + ShortTermBorrowings 325M)");
  });

  it("control: with no current-debt tag at all, the kept figure says which tags are absent", () => {
    const points = without(FILED_FACTS, "LongTermDebtCurrent", "DebtCurrent", "ShortTermBorrowings");
    const { row: out, admissions } = admitDebtFields(vendorRow(Q2, { shortTermDebt: 1_000 }), companyFacts(points), "USD", OBSERVED);
    expect(out.totalDebt).toBe((1_000 + 128_894 + 109_771) * M);
    expect(admissions[0]!.detail).toContain("the vendor's short-term debt, kept; the filing tags none of LongTermDebtCurrent, DebtCurrent, ShortTermBorrowings or CommercialPaper to check it against");
  });

  it("NVIDIA 2022-05-01 with its CommercialPaper 0: still refused, naming CommercialPaper 0", () => {
    const end = "2022-05-01";
    const facts = companyFacts({ [end]: { OperatingLeaseLiability: 899, OperatingLeaseLiabilityCurrent: 147, OperatingLeaseLiabilityNoncurrent: 752, LongTermDebtNoncurrent: 10_947, CommercialPaper: 0 } });
    const row = { date: end, reportedCurrency: "USD", cik: "0000000042", shortTermDebt: 147 * M, longTermDebt: 10_947 * M, capitalLeaseObligations: 752 * M,
      capitalLeaseObligationsCurrent: 0, capitalLeaseObligationsNonCurrent: 752 * M, totalDebt: 11_846 * M } as FmpBalanceSheetRow;
    const { row: out } = admitDebtFields(row, facts, "USD", OBSERVED);
    expect(out.totalDebt).toBeNull();
    expect(out.fieldConflicts?.totalDebt?.reason).toMatch(/, but the vendor short-term debt 147M does not reconcile with the filed current debt 0M \(CommercialPaper 0M\); it equals current lease liabilities the completed lease total already holds; the row is not completed from that filing, so total debt and net debt are withheld$/);
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

describe("the vendor-convention diagnostic keeps the vendor's own net debt (review m8)", () => {
  it("the completion keeps the vendor's net debt beside the recomposed one", () => {
    const row = vendorRow(Q2);
    const out = admitDebtFields(row, companyFacts(FILED_FACTS), "USD", OBSERVED).row;
    expect(out.netDebt).toBe((242_320 - 78_213) * M);
    expect(out.vendorNetDebt).toBe((223_232 - 78_213) * M);
    expect(row.vendorNetDebt).toBeUndefined();
    // Re-admission leaves both as they are.
    expect(admitDebtFields(out, companyFacts(FILED_FACTS), "USD", OBSERVED).row.vendorNetDebt).toBe((223_232 - 78_213) * M);
  });

  it("Stage B reports the vendor's figure, not the composed one, as the vendor net debt", () => {
    const bundle = leaseShapeStageBBundle();
    const vendorNet = new Map((bundle.statements.balanceAnnual.ok ? bundle.statements.balanceAnnual.value.data.rows : []).map((r) => [r.date, r.netDebt]));
    const resolution = runStageB(bundle).capital.netDebtToEbitda.resolution!;
    expect(resolution.value).not.toBeNull();
    expect(resolution.components.vendorNetDebt).toBe(vendorNet.get(resolution.asOf!));
    expect(resolution.components.vendorNetDebt).not.toBe(resolution.components.totalDebt! - resolution.components.cashAndCashEquivalents!);
  });
});
