/**
 * Audit 2026-10-27 FIN-305, FIN-305-V1, FIN-305-V2 (batch B4, Task 6): pension
 * and OPEB deficits, loss-contingency accruals and business-combination
 * contingent consideration join E-7's bridge lines, and every debt-like line is
 * deducted after tax at the D-98 marginal rate (decisions spec 4.3, B4).
 *
 * Hermetic: inline trimmed SEC companyfacts (amounts from the filings the
 * findings cite: FCX 10-K 2026-02-13, JNJ 10-Q 2026-10-21, Alphabet 10-Q
 * 2026-06-30) and the E-7 test's synthetic `valueCompany` fixture. Seeds:
 * `probes/FIN-305*.probe.ts` with every `fs` read and write dropped.
 */
import { describe, expect, it } from "vitest";

import type { CompanyFacts } from "@/edgar/xbrl";
import { runStageB } from "@/pipeline/compute";
import { debtLikeObligationsAt, type DebtLikeObligations } from "@/pipeline/stageB/debtLikeObligations";
import { valueCompany, type DcfAssumptionInputs, type MultiplesFrameworkInputs, type ValuationBundleInputs } from "@/pipeline/stageB/valuation";
import type { CompanyRoute } from "@/types/core";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const route: CompanyRoute = { base: "general", overlays: [], evidence: { sector: null, industry: null } };

const usd = (end: string, val: number, form = "10-K", filed = "2026-02-13") => ({ end, val, accn: `0000831259-26-${filed.slice(5, 7)}${filed.slice(8)}`, fy: 2025, fp: "FY", form, filed });
const facts = (tags: Record<string, ReturnType<typeof usd>[]>): CompanyFacts =>
  ({ cik: 831259, entityName: "TEST", facts: { "us-gaap": Object.fromEntries(Object.entries(tags).map(([t, pts]) => [t, { units: { USD: pts } }])) } }) as unknown as CompanyFacts;

const OBSERVED = "2026-10-27";
const FAMILY_A = "PensionAndOtherPostretirementAndPostemploymentBenefitPlansLiabilities";
const FAMILY_B = "PensionAndOtherPostretirementDefinedBenefitPlansLiabilities";
const PENSION_C = "DefinedBenefitPensionPlanLiabilities";
const OPEB_C = "OtherPostretirementDefinedBenefitPlanLiabilities";

/** FCX at 2025-12-31: pension and OPEB deficit 770 noncurrent + 148 current. */
const FCX = facts({
  [`${FAMILY_B}Noncurrent`]: [usd("2025-12-31", 770e6)],
  [`${FAMILY_B}Current`]: [usd("2025-12-31", 148e6)],
});
const JNJ = facts({
  LossContingencyAccrualAtCarryingValue: [usd("2026-09-27", 5_500e6, "10-Q", "2026-10-21")],
  BusinessCombinationContingentConsiderationLiability: [usd("2026-09-27", 729e6, "10-Q", "2026-10-21")],
});
const ALPHABET = facts({
  LossContingencyAccrualCarryingValueCurrent: [usd("2026-06-30", 17_356e6, "10-Q", "2026-07-24")],
});

describe("FIN-305: the readers", () => {
  it("reads the recognised pension and OPEB deficit, noncurrent plus current", () => {
    const o = debtLikeObligationsAt(FCX, "2025-12-31", "USD", OBSERVED);
    expect(o!.pension!.value).toBe(918e6);
    expect(o!.pension!.basis).toContain(`us-gaap/${FAMILY_B}Noncurrent`);
    expect(o!.pension!.basis).toContain(`us-gaap/${FAMILY_B}Current`);
    expect(o!.assetRetirement).toBeNull();
  });

  it("two pension families at one date count once", () => {
    const both = facts({
      [`${FAMILY_B}Noncurrent`]: [usd("2025-12-31", 770e6)],
      [`${FAMILY_B}Current`]: [usd("2025-12-31", 148e6)],
      [`${PENSION_C}Noncurrent`]: [usd("2025-12-31", 600e6)],
    });
    const o = debtLikeObligationsAt(both, "2025-12-31", "USD", OBSERVED)!;
    expect(o.pension!.value).toBe(918e6);
    expect(o.pension!.basis).toContain(FAMILY_B);
    expect(o.pension!.basis).not.toContain(PENSION_C);
    const familyC = facts({
      [`${PENSION_C}Noncurrent`]: [usd("2025-12-31", 600e6)],
      [`${OPEB_C}Noncurrent`]: [usd("2025-12-31", 200e6)],
    });
    expect(debtLikeObligationsAt(familyC, "2025-12-31", "USD", OBSERVED)!.pension!.value).toBe(800e6);
    // The broadest family (a) wins over (b) at one date.
    const broad = facts({
      [`${FAMILY_A}Noncurrent`]: [usd("2025-12-31", 1_000e6)],
      [`${FAMILY_B}Noncurrent`]: [usd("2025-12-31", 770e6)],
    });
    const wide = debtLikeObligationsAt(broad, "2025-12-31", "USD", OBSERVED)!.pension!;
    expect(wide.value).toBe(1_000e6);
    expect(wide.basis).toContain(FAMILY_A);
    expect(wide.basis).not.toContain(FAMILY_B);
  });

  it("an overfunded-plan asset is not credited", () => {
    const withAsset = facts({
      [`${FAMILY_B}Noncurrent`]: [usd("2025-12-31", 770e6)],
      [`${FAMILY_B}Current`]: [usd("2025-12-31", 148e6)],
      AssetsForPlanBenefitsDefinedBenefitPlan: [usd("2025-12-31", 300e6)],
    });
    expect(debtLikeObligationsAt(withAsset, "2025-12-31", "USD", OBSERVED)!.pension!.value).toBe(918e6);
  });

  it("a pension current portion alone is not the deficit", () => {
    const currentOnly = facts({ [`${FAMILY_B}Current`]: [usd("2025-12-31", 148e6)] });
    expect(debtLikeObligationsAt(currentOnly, "2025-12-31", "USD", OBSERVED)).toBeNull();
  });

  it("the pension look-back is date first", () => {
    const f = facts({
      [`${FAMILY_A}Noncurrent`]: [usd("2026-03-31", 300e6, "10-Q", "2026-05-01")],
      [`${FAMILY_B}Noncurrent`]: [usd("2026-06-30", 100e6, "10-Q", "2026-07-30")],
    });
    const o = debtLikeObligationsAt(f, "2026-06-30", "USD", OBSERVED)!;
    expect(o.pension!.value).toBe(100e6);
    expect(o.pension!.asOf).toBeUndefined();
    // Family (a) alone, at an older balance within the look-back, is read with its date.
    const older = debtLikeObligationsAt(facts({ [`${FAMILY_A}Noncurrent`]: [usd("2026-03-31", 300e6, "10-Q", "2026-05-01")] }), "2026-06-30", "USD", OBSERVED)!;
    expect(older.pension!.value).toBe(300e6);
    expect(older.pension!.asOf).toBe("2026-03-31");
  });

  it("reads a loss-contingency accrual, including a current-only accrual", () => {
    expect(debtLikeObligationsAt(JNJ, "2026-09-27", "USD", OBSERVED)!.lossContingencies!.value).toBe(5_500e6);
    const alphabet = debtLikeObligationsAt(ALPHABET, "2026-06-30", "USD", OBSERVED)!;
    expect(alphabet.lossContingencies!.value).toBe(17_356e6);
    expect(alphabet.lossContingencies!.basis).toContain("LossContingencyAccrualCarryingValueCurrent");
  });

  it("an environmental accrual inside the loss-contingency total is not counted twice", () => {
    const f = facts({
      LossContingencyAccrualAtCarryingValue: [usd("2025-12-31", 600e6)],
      AccrualForEnvironmentalLossContingencies: [usd("2025-12-31", 200e6)],
    });
    const o = debtLikeObligationsAt(f, "2025-12-31", "USD", OBSERVED)!;
    expect(o.lossContingencies!.value).toBe(400e6);
    expect(o.lossContingencies!.basis).toContain("AccrualForEnvironmentalLossContingencies");
    expect(o.environmental!.value).toBe(200e6);
    // The environmental reading is E-7's own: the total, else noncurrent plus current (600 less 150 + 50).
    const parts = facts({
      LossContingencyAccrualAtCarryingValue: [usd("2025-12-31", 600e6)],
      AccruedEnvironmentalLossContingenciesNoncurrent: [usd("2025-12-31", 150e6)],
      AccruedEnvironmentalLossContingenciesCurrent: [usd("2025-12-31", 50e6)],
    });
    expect(debtLikeObligationsAt(parts, "2025-12-31", "USD", OBSERVED)!.lossContingencies!.value).toBe(400e6);
    // An environmental accrual that is the whole total leaves nothing for the loss-contingency line.
    const inside = facts({
      LossContingencyAccrualCarryingValueCurrent: [usd("2025-12-31", 49e6)],
      AccrualForEnvironmentalLossContingencies: [usd("2025-12-31", 2_018e6)],
    });
    const none = debtLikeObligationsAt(inside, "2025-12-31", "USD", OBSERVED)!;
    expect(none.lossContingencies).toBeNull();
    expect(none.environmental!.value).toBe(2_018e6);
  });

  it("reads contingent consideration, total else noncurrent plus current", () => {
    expect(debtLikeObligationsAt(JNJ, "2026-09-27", "USD", OBSERVED)!.contingentConsideration!.value).toBe(729e6);
    const parts = facts({
      BusinessCombinationContingentConsiderationLiabilityNoncurrent: [usd("2025-12-31", 15e9)],
      BusinessCombinationContingentConsiderationLiabilityCurrent: [usd("2025-12-31", 5e9)],
    });
    expect(debtLikeObligationsAt(parts, "2025-12-31", "USD", OBSERVED)!.contingentConsideration!.value).toBe(20e9);
    const currentOnly = facts({ BusinessCombinationContingentConsiderationLiabilityCurrent: [usd("2025-12-31", 12e6)] });
    expect(debtLikeObligationsAt(currentOnly, "2025-12-31", "USD", OBSERVED)!.contingentConsideration!.value).toBe(12e6);
  });

  it("a zero family never blocks a positive family at the same date (E-7's own handling)", () => {
    const zeroA = facts({
      [`${FAMILY_A}Noncurrent`]: [usd("2025-12-31", 0)],
      [`${FAMILY_B}Noncurrent`]: [usd("2025-12-31", 770e6)],
      [`${FAMILY_B}Current`]: [usd("2025-12-31", 148e6)],
    });
    expect(debtLikeObligationsAt(zeroA, "2025-12-31", "USD", OBSERVED)!.pension!.value).toBe(918e6);
    const zeroB = facts({
      [`${FAMILY_B}Noncurrent`]: [usd("2025-12-31", 0)],
      [`${PENSION_C}Noncurrent`]: [usd("2025-12-31", 600e6)],
      [`${OPEB_C}Noncurrent`]: [usd("2025-12-31", 200e6)],
    });
    expect(debtLikeObligationsAt(zeroB, "2025-12-31", "USD", OBSERVED)!.pension!.value).toBe(800e6);
    // Control: every family zero at the bridge date ends the look-back; no older positive is read.
    const allZero = facts({
      [`${FAMILY_A}Noncurrent`]: [usd("2026-06-30", 0, "10-Q", "2026-07-30"), usd("2025-12-31", 900e6)],
      [`${FAMILY_B}Noncurrent`]: [usd("2026-06-30", 0, "10-Q", "2026-07-30"), usd("2025-12-31", 770e6)],
      [`${PENSION_C}Noncurrent`]: [usd("2026-06-30", 0, "10-Q", "2026-07-30"), usd("2025-12-31", 600e6)],
    });
    expect(debtLikeObligationsAt(allZero, "2026-06-30", "USD", OBSERVED)).toBeNull();
  });

  it("a filed zero ends the look-back for the new families too", () => {
    const sold = facts({
      LossContingencyAccrualAtCarryingValue: [usd("2025-12-31", 900e6), usd("2026-06-30", 0, "10-Q", "2026-07-30")],
      BusinessCombinationContingentConsiderationLiability: [usd("2025-12-31", 70e6), usd("2026-06-30", 0, "10-Q", "2026-07-30")],
      [`${FAMILY_B}Noncurrent`]: [usd("2025-12-31", 770e6), usd("2026-06-30", 0, "10-Q", "2026-07-30")],
    });
    expect(debtLikeObligationsAt(sold, "2026-06-30", "USD", OBSERVED)).toBeNull();
    const currentOnlyZero = facts({
      LossContingencyAccrualAtCarryingValue: [usd("2025-12-31", 900e6)],
      LossContingencyAccrualCarryingValueCurrent: [usd("2026-06-30", 0, "10-Q", "2026-07-30")],
    });
    expect(debtLikeObligationsAt(currentOnlyZero, "2026-06-30", "USD", OBSERVED)).toBeNull();
  });

  it("returns null when none of the five readings is filed", () => {
    expect(debtLikeObligationsAt(facts({}), "2025-12-31", "USD", OBSERVED)).toBeNull();
  });
});

const multiples: MultiplesFrameworkInputs = {
  quote: { price: 100, marketCap: 10000, currency: "USD" },
  reportedCurrency: "USD",
  incomeTtm: { date: "2025-12-31", revenue: 1000, operatingIncome: 200, depreciationAndAmortization: 50, netIncome: 144, epsDiluted: 1.44 },
  cashFlowTtm: { date: "2025-12-31", operatingCashFlow: 180, capitalExpenditure: -30, depreciationAndAmortization: 50 },
  balance: { date: "2025-12-31", totalDebt: 300, cashAndShortTermInvestments: 100, totalStockholdersEquity: 500, goodwill: 50, intangibleAssets: 50, minorityInterest: 0, preferredStock: 0 },
};

const steady: DcfAssumptionInputs = {
  revenueCagr3yPct: 10,
  revenueCagr5yPct: 10,
  analystEstimates: null,
  waccPct: 9,
  riskFreePct: 4.48,
  incomeTtm: { date: "2025-12-31", revenue: 1000, operatingIncome: 200, incomeBeforeTax: 180, incomeTaxExpense: 36 },
  incomeHistory: [
    { date: "2025-12-31", revenue: 1000, operatingIncome: 200 },
    { date: "2024-12-31", revenue: 900, operatingIncome: 180 },
    { date: "2023-12-31", revenue: 800, operatingIncome: 160 },
  ],
  balance: { date: "2025-12-31", basis: "annual", totalDebt: 300, totalStockholdersEquity: 500, cashAndShortTermInvestments: 100 },
  marketCap: 5000,
};

const bundle = (over: Partial<ValuationBundleInputs> = {}): ValuationBundleInputs => ({
  currentPrice: 100, waccPct: 9, netDebt: 200, dilutedShares: 100, dcfInputs: steady, multiples, excessReturn: null, reit: null, ...over,
});

function dcfOf(over: Partial<ValuationBundleInputs> = {}) {
  const valuation = valueCompany(route, bundle(over));
  if (valuation.kind !== "dcf" || valuation.dcf === null) throw new Error("expected the DCF route");
  return valuation;
}

const filed = (value: number, tag: string) => ({ value, basis: `us-gaap/${tag} ${value} at 2025-12-31 (10-K filed 2026-02-13)` });
const claims: DebtLikeObligations = {
  assetRetirement: null, environmental: null, settlementAssets: null,
  pension: filed(91.8, `${FAMILY_B}Noncurrent`),
  lossContingencies: filed(55, "LossContingencyAccrualAtCarryingValue"),
  contingentConsideration: filed(7.29, "BusinessCombinationContingentConsiderationLiability"),
};

describe("FIN-305: the equity bridge deducts the new claims after the marginal-rate tax relief", () => {
  const base = dcfOf();
  const withNew = dcfOf({ debtLikeObligations: claims });
  const component = (v: ReturnType<typeof dcfOf>, label: RegExp) => v.dcf!.bridge.nonOperatingComponents!.find((c) => label.test(c.label));

  it("lowers DCF equity by each filed claim after the marginal-rate tax relief, and says so", () => {
    expect(withNew.assumptions!.investmentTax!.ratePct).toBe(15);
    expect(withNew.dcf!.enterpriseValue).toBeCloseTo(base.dcf!.enterpriseValue, 9);
    expect(withNew.dcf!.equityValue! - base.dcf!.equityValue!).toBeCloseTo(-130.9765, 6);
    expect(withNew.dcf!.perShare! - base.dcf!.perShare!).toBeCloseTo(-1.309765, 6);
    const lines = withNew.dcf!.bridge.nonOperatingComponents!.filter((c) => c.kind === "debt-like-obligation");
    expect(lines.map((c) => c.value)).toHaveLength(3);
    expect(component(withNew, /pension/)!.value).toBeCloseTo(-78.03, 9);
    expect(component(withNew, /loss-contingency/)!.value).toBeCloseTo(-46.75, 9);
    expect(component(withNew, /contingent consideration/)!.value).toBeCloseTo(-6.1965, 9);
    expect(component(withNew, /pension/)).toMatchObject({ kind: "debt-like-obligation", label: "pension and other postretirement benefit deficits (filed, after tax at 15%)" });
    const notes = withNew.notes.join(" ");
    expect(notes).toMatch(/pension and other postretirement benefit deficits/);
    expect(notes).toMatch(/loss-contingency accruals/);
    expect(notes).toMatch(/business-combination contingent consideration/);
    expect(notes).toMatch(/net of the tax relief a settlement would earn, at the 15% marginal-rate floor/);
    expect(notes).toMatch(/162\(f\)/);
    expect(notes).not.toMatch(/before any tax relief/);
    expect(notes).not.toMatch(/accretion/);
    // The plain line's note names the amount after the relief (M5).
    expect(notes).toMatch(/subtracts pension and other postretirement benefit deficits of 91\.8 \(78\.03 after the 15% tax relief\)/);
    expect(withNew.multiples.enterpriseValue.basis).toMatch(/not added to the market EV/);
    // Control: nothing tagged leaves the EV basis byte for byte.
    expect(dcfOf({ debtLikeObligations: null }).multiples.enterpriseValue.basis).toBe(base.multiples.enterpriseValue.basis);
    expect(base.multiples.enterpriseValue.basis).not.toMatch(/not added to the market EV/);
  });

  it("the EV basis names only the families the bridge deducted", () => {
    const only = (o: Partial<DebtLikeObligations>) => dcfOf({ debtLikeObligations: { assetRetirement: null, environmental: null, settlementAssets: null, pension: null, lossContingencies: null, contingentConsideration: null, ...o } }).multiples.enterpriseValue.basis;
    const loss = only({ lossContingencies: claims.lossContingencies });
    expect(loss).toMatch(/\(loss-contingency\) are not added to the market EV/);
    expect(loss).not.toMatch(/pension|environmental|retirement|contingent-consideration/);
    expect(only({ pension: claims.pension })).toMatch(/\(pension and OPEB\) are not added to the market EV/);
    const two = only({ environmental: filed(202, "AccrualForEnvironmentalLossContingencies"), contingentConsideration: claims.contingentConsideration });
    expect(two).toMatch(/\(environmental and contingent-consideration\) are not added to the market EV/);
    // A DUK-shaped utility with an environmental line deducts no pension, so the basis does not name it.
    const duk = dcfOf({ debtLikeObligations: { ...claims, pension: claims.pension, lossContingencies: null, contingentConsideration: null, environmental: filed(95, "AccrualForEnvironmentalLossContingencies") }, sicCode: 4931 }).multiples.enterpriseValue.basis;
    expect(duk).toMatch(/\(environmental\) are not added to the market EV/);
    expect(duk).not.toMatch(/pension/);
  });

  it("a US domicile takes the 21% federal rate", () => {
    const us = { ...steady, domicileCountry: "US" };
    const usBase = dcfOf({ dcfInputs: us });
    const usWith = dcfOf({ dcfInputs: us, debtLikeObligations: claims });
    expect(usWith.assumptions!.investmentTax!.ratePct).toBe(21);
    expect(usWith.dcf!.equityValue! - usBase.dcf!.equityValue!).toBeCloseTo(-121.7311, 6);
    const labels = usWith.dcf!.bridge.nonOperatingComponents!.map((c) => c.label);
    expect(labels).toContain("pension and other postretirement benefit deficits (filed, after tax at 21%)");
    expect(labels).toContain("loss-contingency accruals (filed, after tax at 21%)");
    expect(labels).toContain("business-combination contingent consideration (filed, after tax at 21%)");
  });

  it("leaves perShare and the bridge deep-equal to the base when nothing is tagged", () => {
    const untagged = dcfOf({ debtLikeObligations: null });
    expect(untagged.dcf!.perShare).toBe(base.dcf!.perShare);
    expect(untagged.dcf!.bridge).toEqual(base.dcf!.bridge);
  });

  it("states the accretion sentence only for a deducted retirement obligation, ending 'does not adjust for it' (M5)", () => {
    const aro = dcfOf({ debtLikeObligations: { ...claims, assetRetirement: filed(384, "AssetRetirementObligation") } }).notes.join(" ");
    expect(aro).toMatch(/so their time value is counted twice; the bridge does not adjust for it\./);
    expect(aro).not.toMatch(/does not adjust for either/);
    expect(aro).toMatch(/subtracts asset-retirement obligations of 384 \(326\.4 after the 15% tax relief\)/);
  });

  it("names an earlier balance date on the new lines", () => {
    const earlier = dcfOf({ debtLikeObligations: { ...claims, pension: { ...claims.pension!, asOf: "2025-09-30" } } });
    expect(component(earlier, /pension/)!.label).toBe("pension and other postretirement benefit deficits (filed, after tax at 15%; balance at 2025-09-30, the latest filed)");
  });
});

describe("FIN-305: a rate-regulated utility's pension deficit (Review Focus 14; pre-flight I7)", () => {
  const base = dcfOf();
  const utility = dcfOf({ debtLikeObligations: claims, sicCode: 4931 });
  const plain = dcfOf({ debtLikeObligations: claims, sicCode: 2834 });

  it("a rate-regulated utility's pension deficit is disclosed, not deducted", () => {
    expect(utility.dcf!.equityValue! - base.dcf!.equityValue!).toBeCloseTo(-52.9465, 6);
    const lines = utility.dcf!.bridge.nonOperatingComponents!;
    expect(lines.some((c) => /pension/.test(c.label))).toBe(false);
    expect(lines.some((c) => /loss-contingency/.test(c.label))).toBe(true);
    expect(lines.some((c) => /contingent consideration/.test(c.label))).toBe(true);
    const notes = utility.notes.join(" ");
    expect(notes).toMatch(/is assumed to recover them through rates \(ASC 980\)/);
    expect(notes).toMatch(/dimensional XBRL/);
    expect(notes).toContain(`${FAMILY_B}Noncurrent`);
    expect(notes).toContain("SIC 4931");
    expect(utility.gaps.find((g) => g.field === "valuation.dcf.debtLikeObligations.rateRegulated")?.severity).toBe("info");
    expect(utility.gaps.some((g) => g.field === "valuation.dcf.debtLikeObligations.sicUnknown")).toBe(false);
  });

  it("an E-7 environmental line at the same utility is still deducted after tax", () => {
    const withEnv = dcfOf({ debtLikeObligations: { ...claims, environmental: filed(202, "AccrualForEnvironmentalLossContingencies") }, sicCode: 4931 });
    expect(withEnv.dcf!.equityValue! - utility.dcf!.equityValue!).toBeCloseTo(-202 * 0.85, 6);
  });

  it("control (non-utility): all three are deducted and no such note or gap appears", () => {
    expect(plain.dcf!.equityValue! - base.dcf!.equityValue!).toBeCloseTo(-130.9765, 6);
    expect(plain.notes.join(" ")).not.toMatch(/ASC 980/);
    expect(plain.gaps.some((g) => g.field === "valuation.dcf.debtLikeObligations.rateRegulated")).toBe(false);
  });

  it("a utility with no pension deficit raises no rate-regulated gap", () => {
    const noPension = dcfOf({ debtLikeObligations: { ...claims, pension: null }, sicCode: 4931 });
    expect(noPension.gaps.some((g) => g.field === "valuation.dcf.debtLikeObligations.rateRegulated")).toBe(false);
  });
});

describe("FIN-305: the SIC wiring and the six utility codes", () => {
  const pensionFacts = facts({
    [`${FAMILY_B}Noncurrent`]: [usd("2026-03-31", 100e6, "10-Q", "2026-05-01"), usd("2025-12-31", 100e6, "10-K", "2026-02-13")],
  });
  const run = (sic: string | null) => {
    const b = completeCurrencyBundle({ sic: sic ?? undefined });
    (b.edgar as unknown as Record<string, unknown>).companyFacts = { ok: true, value: { data: pensionFacts } };
    const out = runStageB(b, { evIncludeLeases: false });
    if (out.valuation.kind !== "dcf") throw new Error("expected the DCF route");
    return out.valuation;
  };
  const deducted = (v: ReturnType<typeof run>) => (v.dcf?.bridge.nonOperatingComponents ?? []).some((c) => /pension/.test(c.label));

  it("SIC 4931 and 4911 set the rate-regulated flag", () => {
    for (const sic of ["4931", "4911"]) {
      const v = run(sic);
      expect(deducted(v), sic).toBe(false);
      expect(v.gaps.some((g) => g.field === "valuation.dcf.debtLikeObligations.rateRegulated"), sic).toBe(true);
    }
  });

  it("2834, 4953 (waste), 4922 (pipelines), 4991 (cogeneration) and 4900 (the group fallback) do not", () => {
    for (const sic of ["2834", "4953", "4922", "4991", "4900"]) {
      const v = run(sic);
      expect(deducted(v), sic).toBe(true);
      expect(v.gaps.some((g) => g.field === "valuation.dcf.debtLikeObligations.rateRegulated"), sic).toBe(false);
      expect(v.gaps.some((g) => g.field === "valuation.dcf.debtLikeObligations.sicUnknown"), sic).toBe(false);
    }
  });

  it("a deducted pension line without an established SIC says the utility rule could not be checked", () => {
    const unknown = run(null);
    expect(deducted(unknown)).toBe(true);
    expect(unknown.gaps.find((g) => g.field === "valuation.dcf.debtLikeObligations.sicUnknown")?.severity).toBe("info");
    // Controls: no SIC and no pension line; and the same claims with a SIC.
    const noPension = dcfOf({ debtLikeObligations: { ...claims, pension: null } });
    expect(noPension.gaps.some((g) => g.field === "valuation.dcf.debtLikeObligations.sicUnknown")).toBe(false);
    expect(dcfOf({ debtLikeObligations: claims }).gaps.some((g) => g.field === "valuation.dcf.debtLikeObligations.sicUnknown")).toBe(true);
    expect(dcfOf({ debtLikeObligations: claims, sicCode: 2834 }).gaps.some((g) => g.field === "valuation.dcf.debtLikeObligations.sicUnknown")).toBe(false);
  });
});
