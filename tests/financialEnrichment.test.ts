import { describe, expect, it } from "vitest";
import { admitBalanceCash, enrichFinancialFields } from "@/edgar/financialEnrichment";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpBalanceSheetRow, FmpCashFlowRow, FmpPayload } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";
import { withCashFlowSbcBasis } from "@/pipeline/cashFlowBasis";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import { resolveNetDebt } from "@/pipeline/stageB/netDebt";
import { computeRoic } from "@/pipeline/stageB/returns";
import { runStageB } from "@/pipeline/compute";

const observedAt = "2026-10-13T12:00:00.000Z";
const point = (val: number, extra: Record<string, unknown> = {}) => ({ end: "2026-06-30", val, accn: "0000000001-26-000002", filed: "2026-07-30", form: "10-Q", fy: 2026, fp: "Q2", ...extra });
function facts(tags: Record<string, ReturnType<typeof point>[]>, currency = "USD"): CompanyFacts {
  return { cik: 1, entityName: "Example", facts: { "us-gaap": Object.fromEntries(Object.entries(tags).map(([tag, points]) => [tag, { units: { [currency]: points } }])) } };
}
function sourced<T extends FmpBalanceSheetRow | FmpCashFlowRow>(rows: T[]): FetchResult<FmpPayload<T>> {
  return { ok: true, value: { data: { rows, raw: rows }, source: "fmp", asOf: "2026-06-30", endpoint: "fmp:statements", fetchedAt: observedAt } };
}
const leases = () => facts({ OperatingLeaseLiability: [point(30)], FinanceLeaseLiability: [point(7)], FinanceLeasePrincipalPayments: [point(5, { start: "2026-01-01" }), point(2, { start: "2026-01-01", end: "2026-03-31", filed: "2026-04-30", accn: "0000000001-26-000001", fp: "Q1" })] });

describe("D-261 filed balance cash replaces a vendor split", () => {
  const cashTag = "CashAndCashEquivalentsAtCarryingValue";
  const vendor: FmpBalanceSheetRow = { cik: "1", date: "2026-06-30", filingDate: "2026-07-30", reportedCurrency: "USD",
    cashAndCashEquivalents: 480e6, shortTermInvestments: 20e6, cashAndShortTermInvestments: 500e6, totalDebt: 800e6, netDebt: 320e6 };
  it("never files a combined total merely because the vendor total equals filed cash", () => {
    const out = admitBalanceCash(vendor, facts({ [cashTag]: [point(500e6)] }), "quarter", observedAt);
    expect(out.row.cashAndShortTermInvestments).toBeNull();
    expect(out.row.fieldProvenance?.cashAndShortTermInvestments).toBeUndefined();
    expect(out.row.cashBasis).toBe("cash-only");
    expect(out.gaps.map(g => g.reason).join(" ")).toContain("short-term investments not established from the undimensioned facts available");
    expect(out.gaps.map(g => g.reason).join(" ")).not.toContain("unreported in this filing");
    expect(resolveNetDebt(out.row)).toMatchObject({ value: null, cashBasis: "cash-only" });
    const filedDebt = { ...out.row, fieldProvenance: { ...out.row.fieldProvenance, totalDebt: {
      source: "edgar" as const, unit: "USD", periodStart: null, periodEnd: vendor.date!, observedAt,
      tags: ["us-gaap/LongTermDebt"], filings: [{ accn: point(0).accn, filed: point(0).filed, form: "10-Q" }] } } };
    expect(resolveNetDebt(filedDebt)).toMatchObject({ value: 300e6, cashBasis: "cash-only" });
    const partialDebt = { ...filedDebt, fieldProvenance: { ...filedDebt.fieldProvenance,
      totalDebt: { ...filedDebt.fieldProvenance.totalDebt, calculation: "noncurrent-lease-line-completed" } } };
    expect(resolveNetDebt(partialDebt)).toMatchObject({ value: null, cashBasis: "cash-only" });
  });
  it("carries cash-only evidence through the invested-capital note, DCF note and grade qualification", () => {
    const b = completeCurrencyBundle({});
    const cp = point(500e6, { end: "2025-12-31", filed: "2026-02-01", form: "10-K", accn: "0000000001-26-000001" });
    withIssuerFacts(b, facts({ [cashTag]: [cp] }));
    for (const key of ["balanceAnnual", "balanceQuarterly"] as const) {
      const result = b.statements[key];
      if (!result.ok) throw Error("fixture");
      for (const row of result.value.data.rows.filter(r => r.date === cp.end)) Object.assign(row, {
        cashAndCashEquivalents: 480e6, cashAndShortTermInvestments: 500e6, shortTermInvestments: 20e6,
        fieldProvenance: { totalDebt: { source: "edgar", unit: "USD", periodStart: null, periodEnd: cp.end,
          observedAt: b.builtAt, tags: ["us-gaap/LongTermDebt"], filings: [{ accn: cp.accn, filed: cp.filed, form: cp.form }] } },
      });
    }
    const result = runStageB(b);
    expect(result.returns.roic.series.find(y => y.date === cp.end)?.notes.join(" ")).toMatch(/cash.only.*narrower/i);
    expect(result.valuation.notes.join(" ")).toMatch(/cash.only/i);
    for (const aspect of ["quality", "moat", "balanceSheet", "valuation"] as const)
      expect(result.scores.qualification?.aspects[aspect].reasons.some(r => /cash.only.*narrower/i.test(r.detail))).toBe(true);
  });
  it("does not add a bank deposit component that may already be inside filed cash", () => {
    const out = admitBalanceCash({ ...vendor, cashAndCashEquivalents: 20e6, shortTermInvestments: 80e6, cashAndShortTermInvestments: 100e6 },
      facts({ [cashTag]: [point(100e6)], InterestBearingDepositsInBanks: [point(80e6)], AssetsCurrent: [point(100e6)] }), "quarter", observedAt);
    expect(out.row.cashAndCashEquivalents).toBe(100e6);
    expect(out.row.cashAndShortTermInvestments).toBeNull();
    expect(out.row.shortTermInvestments).toBeNull();
    expect(resolveNetDebt(out.row).value).not.toBe(620e6);
    // An accidental current-assets equality is not a disjointness proof for a cash member.
    const overlap = admitBalanceCash(vendor, facts({ [cashTag]: [point(100e6)],
      InterestBearingDepositsInBanks: [point(80e6)], AssetsCurrent: [point(180e6)] }), "quarter", observedAt).row;
    expect(overlap.cashAndShortTermInvestments).toBeNull();
  });
  it("carries an incompatible filed combined total into net debt and ROIC as a refusal", () => {
    const out = admitBalanceCash(vendor, facts({ [cashTag]: [point(500e6)], ShortTermInvestments: [point(40e6)],
      CashCashEquivalentsAndShortTermInvestments: [point(520e6)] }), "quarter", observedAt).row;
    expect(out.cashAndCashEquivalents).toBe(500e6);
    expect(out.cashAndShortTermInvestments).toBeNull();
    expect(resolveNetDebt(out)).toMatchObject({ value: null, conflict: true });
    const roic = computeRoic([{ date: vendor.date!, operatingIncome: 100e6, incomeBeforeTax: 100e6, incomeTaxExpense: 20e6 }],
      [{ ...out, date: vendor.date!, totalStockholdersEquity: 300e6 }]);
    expect(roic.latestRoicPct).toBeNull();
    expect(roic.gaps.map(g => g.reason).join(" ")).toMatch(/combined|liquidity/i);
  });
  it("uses the latest complete same-instant filing when a newer comparative repeats only cash", () => {
    const f = facts({ [cashTag]: [point(500e6), point(500e6, { filed: "2026-09-01", accn: "0000000001-26-000003" })],
      ShortTermInvestments: [point(40e6)], AssetsCurrent: [point(540e6)] });
    const out = admitBalanceCash(vendor, f, "quarter", observedAt).row;
    expect(out.cashAndCashEquivalents).toBe(500e6);
    expect(out.cashAndShortTermInvestments).toBe(540e6);
    expect(out.fieldProvenance?.cashAndShortTermInvestments?.filings[0]?.filed).toBe("2026-07-30");
  });
  it("adopts unambiguous cash, retains the observations and does not add unfiled investments twice", () => {
    const f = facts({ [cashTag]: [point(500e6), point(500e6, { filed: "2026-09-01", accn: "0000000001-26-000003" })] });
    const out = admitBalanceCash(vendor, f, "quarter", observedAt);
    expect(out.row).toMatchObject({ cashAndCashEquivalents: 500e6, shortTermInvestments: null, cashAndShortTermInvestments: null, cashBasis: "cash-only",
      fieldConflicts: { cashAndCashEquivalents: { usable: true, resolution: "filed-family", vendorValue: 480e6, secValue: 500e6 },
        shortTermInvestments: { usable: false, vendorValue: 20e6 } } });
    expect(out.row.fieldProvenance?.cashAndCashEquivalents?.filings[0]?.filed).toBe("2026-09-01");
    expect(out.gaps.map(g => g.reason).join(" ")).toMatch(/cash.only|cash only/i);
    expect(admitBalanceCash(out.row, f, "quarter", observedAt).row).toEqual(out.row);
    expect(vendor.cashAndCashEquivalents).toBe(480e6);
  });
  it("composes separately tagged same-filing investments once and recomputes cash-only statement net debt", () => {
    const debtProof = { source: "edgar" as const, unit: "USD", periodStart: null, periodEnd: vendor.date!, observedAt,
      tags: ["us-gaap/LongTermDebt"], filings: [{ accn: point(0).accn, filed: point(0).filed, form: "10-Q" }] };
    const out = admitBalanceCash<FmpBalanceSheetRow>({ ...vendor, fieldProvenance: { totalDebt: debtProof } },
      facts({ [cashTag]: [point(500e6)], MarketableSecuritiesCurrent: [point(40e6)], AssetsCurrent: [point(540e6)] }), "quarter", observedAt);
    expect(out.row).toMatchObject({ cashAndCashEquivalents: 500e6, shortTermInvestments: 40e6, cashAndShortTermInvestments: 540e6, netDebt: 300e6 });
    expect(out.row.fieldProvenance?.cashAndShortTermInvestments?.tags).toEqual([`us-gaap/${cashTag}`, "us-gaap/MarketableSecuritiesCurrent"]);
  });
  it("reopens only a cash conflict's own dependent refusals", () => {
    const secEvidence = { source: "edgar" as const, unit: "USD", periodStart: null, periodEnd: vendor.date!, observedAt,
      tags: [`us-gaap/${cashTag}`], filings: [{ accn: point(0).accn, filed: point(0).filed, form: "10-Q" }] };
    const refusal = { usable: false, vendorValue: 480e6, secValue: 500e6, secEvidence,
      reason: "vendor/SEC cashAndCashEquivalents conflict: exact instant; field unavailable until reconciled", cause: "vendor-sec-value-conflict" as const };
    const row = { ...vendor, cashAndCashEquivalents: null, cashAndShortTermInvestments: null, fieldConflicts: {
      cashAndCashEquivalents: refusal, cashAndShortTermInvestments: { ...refusal, vendorValue: 500e6, secValue: null },
      netDebt: { usable: false, vendorValue: 320e6, secValue: null, reason: "independent debt scope refusal" } } };
    const admitted = admitBalanceCash(row, facts({ [cashTag]: [point(500e6)] }), "quarter", observedAt).row;
    expect(admitted.cashAndShortTermInvestments).toBeNull();
    expect(admitted.cashBasis).toBe("cash-only");
    expect(admitted.fieldConflicts?.netDebt).toEqual(row.fieldConflicts.netDebt);
  });
  it.each([
    { cik: "2" }, { reportedCurrency: "EUR" }, { date: "2026-06-29" },
  ])("does not borrow an incompatible fact: %j", changes => {
    const row = { ...vendor, ...changes };
    expect(admitBalanceCash(row, facts({ [cashTag]: [point(500e6)] }), "quarter", observedAt).row).toEqual(row);
  });
  it("does not turn incompatible filed copies, a negative newest copy or a future filing into admission", () => {
    for (const ps of [[point(500e6), point(550e6, { filed: "2026-09-01" })],
      [point(500e6), point(-1, { filed: "2026-09-01" })], [point(500e6, { filed: "2026-10-14" })]]) {
      expect(admitBalanceCash(vendor, facts({ [cashTag]: ps }), "quarter", observedAt).row.cashAndCashEquivalents).not.toBe(500e6);
    }
  });
  it("keeps the compatible vendor control and a genuine SEC restatement unchanged", () => {
    const row = { ...vendor, cashAndCashEquivalents: 500e6, shortTermInvestments: 0 };
    expect(admitBalanceCash(row, facts({ [cashTag]: [point(500e6)] }), "quarter", observedAt).row).toEqual(row);
  });
  it("does not read an ambiguous filed investment or an independently refused component as absent", () => {
    const f = facts({ [cashTag]: [point(500e6)], ShortTermInvestments: [point(20e6), point(40e6)] });
    expect(admitBalanceCash(vendor, f, "quarter", observedAt).row.cashAndShortTermInvestments).toBeNull();
    const refused = { ...vendor, shortTermInvestments: null, fieldConflicts: { shortTermInvestments: {
      usable: false, vendorValue: 20e6, secValue: null, reason: "independent investment scope refusal" } } };
    expect(admitBalanceCash(refused, facts({ [cashTag]: [point(500e6)], ShortTermInvestments: [point(40e6)] }), "quarter", observedAt).row.cashAndShortTermInvestments).toBeNull();
    const complete = admitBalanceCash(refused, facts({ [cashTag]: [point(500e6)], ShortTermInvestments: [point(40e6)],
      CashCashEquivalentsAndShortTermInvestments: [point(540e6)] }), "quarter", observedAt).row;
    expect(complete.cashAndShortTermInvestments).toBeNull();
    expect(resolveNetDebt(complete)).toMatchObject({ value: null, conflict: true });
  });
});

describe("SEC field enrichment of existing vendor statements", () => {
  it("preserves genuine SEC-built restated cash and its dependents despite the original reporter date", () => {
    const f = facts({ Assets: [point(1000)], CashAndCashEquivalentsAtCarryingValue: [point(100),
      point(120, { filed: "2026-09-01", accn: "0000000001-26-000003" })],
      ShortTermInvestments: [point(20)], LongTermDebtCurrent: [point(50)], LongTermDebtNoncurrent: [point(150)] });
    const built = buildStatementsFromCompanyFacts(f, { symbol: "EXAMPLE", cik: "1", asOf: observedAt.slice(0, 10), factsObservedAt: observedAt, annualPeriods: 4, quarterlyPeriods: 4,
      vendorSplits: { status: "unavailable", source: "fixture", reason: "cash only" } });
    const row = built.balanceQuarterly.rows.find(r => r.date === "2026-06-30")!;
    expect(row).toMatchObject({ filingDate: "2026-07-30", cashAndCashEquivalents: 120 });
    expect(row.fieldProvenance?.cashAndCashEquivalents?.filings[0]?.filed).toBe("2026-09-01");
    const original = sourced([{ ...row, cashAndShortTermInvestments: 140, netDebt: 80 }]);
    const out = enrichFinancialFields(original, sourced<FmpCashFlowRow>([]), f, "quarter", observedAt);
    expect(out.balance.ok && out.balance.value.data.rows[0]).toMatchObject({ cashAndCashEquivalents: 120, cashAndShortTermInvestments: 140, netDebt: 80 });
    const b = completeCurrencyBundle({}); b.builtAt = observedAt; withIssuerFacts(b, f);
    b.statements.balanceQuarterly = original;
    expect(withCashFlowSbcBasis(b).statements.balanceQuarterly).toMatchObject({ ok: true,
      value: { data: { rows: [{ cashAndCashEquivalents: 120, cashAndShortTermInvestments: 140, netDebt: 80 }] } } });
  });
  it("compares cash to the original same-filing observation despite a newer repeated balance", () => {
    const f = facts({ CashAndCashEquivalentsAtCarryingValue: [point(3127e6), point(3127e6, { filed: "2026-09-01", accn: "0000000001-26-000003" })] });
    const original = sourced([{ cik: "1", date: "2026-06-30", filingDate: "2026-07-30", reportedCurrency: "USD",
      cashAndCashEquivalents: 3946e6, cashAndShortTermInvestments: 4000e6, netDebt: -3000e6 }]);
    const out = enrichFinancialFields(original, sourced<FmpCashFlowRow>([]), f, "quarter", observedAt);
    expect(out.balance.ok && out.balance.value.data.rows[0]).toMatchObject({ cashAndCashEquivalents: 3127e6,
      cashAndShortTermInvestments: null, netDebt: null, fieldConflicts: { cashAndCashEquivalents: { secValue: 3127e6,
        secEvidence: { filings: [{ filed: "2026-09-01" }] } } } });
    const b = withIssuerFacts(completeCurrencyBundle({}), f);
    b.builtAt = observedAt;
    b.statements.balanceQuarterly = original;
    expect(withCashFlowSbcBasis(b).statements.balanceQuarterly).toMatchObject({ ok: true,
      value: { data: { rows: [{ cashAndCashEquivalents: 3127e6 }] } } });
  });
  it("fills lease slices in a partial vendor row and retains vendor row and raw evidence", () => {
    const balance = sourced([{ date: "2026-06-30", reportedCurrency: "USD", totalAssets: 500, totalDebt: 80 }]);
    const out = enrichFinancialFields(balance, sourced<FmpCashFlowRow>([]), leases(), "quarter", observedAt);
    expect(out.balance.ok && out.balance.value.data.rows[0]).toMatchObject({ totalAssets: 500, totalDebt: 80, operatingLeaseLiability: 30, financeLeaseLiability: 7, fieldProvenance: { operatingLeaseLiability: { source: "edgar", unit: "USD", periodEnd: "2026-06-30", observedAt, tags: ["us-gaap/OperatingLeaseLiability"], filings: [{ filed: "2026-07-30", accn: "0000000001-26-000002" }] } } });
    expect(balance.ok && balance.value.data.rows[0]).not.toHaveProperty("operatingLeaseLiability");
    expect(out.balance.ok && out.balance.value.source).toBe("fmp");
    expect(out.balance.ok && out.balance.value.data.raw).toBe(balance.ok && balance.value.data.raw);
  });
  it("derives quarterly principal from same-lineage YTD rather than using six-month principal", () => {
    const out = enrichFinancialFields(sourced<FmpBalanceSheetRow>([]), sourced([{ date: "2026-06-30", period: "Q2", reportedCurrency: "USD", freeCashFlow: 40 }]), leases(), "quarter", observedAt);
    expect(out.cashflow.ok && out.cashflow.value.data.rows[0]).toMatchObject({ freeCashFlow: 40, financeLeasePrincipalPayments: 3, fieldProvenance: { financeLeasePrincipalPayments: { periodStart: "2026-04-01", periodEnd: "2026-06-30", derivation: "ytd-difference" } } });
  });
  it.each(["EUR", null])("refuses to blend USD facts with vendor currency %s", (reportedCurrency) => {
    const out = enrichFinancialFields(sourced([{ date: "2026-06-30", reportedCurrency }]), sourced<FmpCashFlowRow>([]), leases(), "quarter", observedAt);
    expect(out.balance.ok && out.balance.value.data.rows[0]).not.toHaveProperty("operatingLeaseLiability");
    expect(out.gaps.some((g) => /currency/i.test(g.reason))).toBe(true);
  });
  it("adopts an exact filed lease balance and retains the conflicting vendor observation", () => {
    const out = enrichFinancialFields(sourced([{ date: "2026-06-30", reportedCurrency: "USD", operatingLeaseLiability: 99 }]), sourced<FmpCashFlowRow>([]), leases(), "quarter", observedAt);
    expect(out.balance.ok && out.balance.value.data.rows[0]).toMatchObject({ operatingLeaseLiability: 30, fieldConflicts: { operatingLeaseLiability: { vendorValue: 99, secValue: 30, usable: true, resolution: "filed-family" } } });
    expect(out.gaps.some((g) => /filed/i.test(g.reason))).toBe(true);
  });
  it.each(["annual", "quarter"] as const)("adopts foreign core-form instant lease balances for %s rows", scope => {
    const f = facts({ OperatingLeaseLiability: [point(30, { form: "20-F" })], FinanceLeaseLiability: [point(7, { form: "40-F" })] });
    const out = enrichFinancialFields(sourced([{ cik: "1", date: "2026-06-30", reportedCurrency: "USD", operatingLeaseLiability: 99, financeLeaseLiability: 50 }]), sourced<FmpCashFlowRow>([]), f, scope, observedAt);
    expect(out.balance).toMatchObject({ ok: true, value: { data: { rows: [{ operatingLeaseLiability: 30, financeLeaseLiability: 7 }] } } });
  });
  it("re-admits an old lease comparison on identical filing evidence acquired at another time", () => {
    const f = leases();
    const first = enrichFinancialFields(sourced([{ date: "2026-06-30", reportedCurrency: "USD", operatingLeaseLiability: 99 }]), sourced<FmpCashFlowRow>([]), f, "quarter", observedAt);
    if (!first.balance.ok) throw Error("fixture");
    const proof = first.balance.value.data.rows[0]!.fieldProvenance!.operatingLeaseLiability!;
    const old = { date: "2026-06-30", reportedCurrency: "USD", operatingLeaseLiability: 99,
      fieldConflicts: { operatingLeaseLiability: { usable: false, vendorValue: 99, secValue: 30,
        reason: "vendor/SEC conflict for operatingLeaseLiability at 2026-06-30: old comparison",
        secEvidence: { ...proof, observedAt: "2026-10-12T00:00:00Z" } } } };
    expect(admitBalanceCash(old, f, "quarter", observedAt).row.operatingLeaseLiability).toBe(30);
  });
  it("reads a lease comparison's typed cause regardless of its wording, and rejects unrelated causes", () => {
    const f = leases();
    const proof = { source: "edgar" as const, unit: "USD", periodStart: null, periodEnd: "2026-06-30", observedAt,
      tags: ["us-gaap/OperatingLeaseLiability"], filings: [{ accn: point(0).accn, filed: point(0).filed, form: "10-Q" }] };
    const old: FmpBalanceSheetRow = { date: "2026-06-30", reportedCurrency: "USD", operatingLeaseLiability: 99,
      fieldConflicts: { operatingLeaseLiability: { usable: false, vendorValue: 99, secValue: 30, secEvidence: proof,
        cause: "vendor-sec-value-conflict", reason: "wording changed without changing the filed observation" } } };
    expect(admitBalanceCash(old, f, "quarter", observedAt).row.operatingLeaseLiability).toBe(30);
    const unrelated = structuredClone(old);
    unrelated.fieldConflicts!.operatingLeaseLiability!.cause = "debt-components-incomplete";
    expect(admitBalanceCash(unrelated, f, "quarter", observedAt).row.fieldConflicts?.operatingLeaseLiability?.usable).toBe(false);
    const written = enrichFinancialFields(sourced([{ date: "2026-06-30", reportedCurrency: "USD", operatingLeaseLiability: 99 }]), sourced<FmpCashFlowRow>([]),
      facts({ OperatingLeaseLiability: [point(30), point(35, { accn: "0000000001-26-000099", filed: "2026-09-01" })] }), "quarter", observedAt);
    expect(written.balance.ok && written.balance.value.data.rows[0]!.fieldConflicts?.operatingLeaseLiability?.cause).toBe("vendor-sec-value-conflict");
  });
  it("does not derive principal using later restated operands or facts not yet published", () => {
    const f = facts({ FinanceLeasePrincipalPayments: [point(5, { start: "2026-01-01" }), point(1, { start: "2026-01-01", end: "2026-03-31", filed: "2026-08-30" })], OperatingLeaseLiability: [point(30, { filed: "2026-10-14" })] });
    const out = enrichFinancialFields(sourced([{ date: "2026-06-30", reportedCurrency: "USD" }]), sourced([{ date: "2026-06-30", reportedCurrency: "USD" }]), f, "quarter", observedAt);
    expect(out.balance.ok && out.balance.value.data.rows[0]).not.toHaveProperty("operatingLeaseLiability");
    expect(out.cashflow.ok && out.cashflow.value.data.rows[0]).not.toHaveProperty("financeLeasePrincipalPayments");
  });
  it("rejects incomplete split liabilities rather than calling one component the total", () => {
    const out = enrichFinancialFields(sourced([{ date: "2026-06-30", reportedCurrency: "USD" }]), sourced<FmpCashFlowRow>([]), facts({ OperatingLeaseLiabilityCurrent: [point(3)] }), "quarter", observedAt);
    expect(out.balance.ok && out.balance.value.data.rows[0]).not.toHaveProperty("operatingLeaseLiability");
  });
  it("rejects a duration that conflicts with the vendor's explicit period start", () => {
    const out = enrichFinancialFields(sourced<FmpBalanceSheetRow>([]), sourced([{ date: "2026-06-30", periodStart: "2026-04-02", reportedCurrency: "USD" }]), facts({ FinanceLeasePrincipalPayments: [point(3, { start: "2026-04-01" })] }), "quarter", observedAt);
    expect(out.cashflow.ok && out.cashflow.value.data.rows[0]).not.toHaveProperty("financeLeasePrincipalPayments");
    expect(out.gaps.some((g) => /period/i.test(g.reason))).toBe(true);
  });
  it("does not substitute a quarterly principal fact for a full fiscal-year amount", () => {
    const out = enrichFinancialFields(sourced<FmpBalanceSheetRow>([]), sourced([{ date: "2026-06-30", reportedCurrency: "USD" }]), facts({ FinanceLeasePrincipalPayments: [point(3, { start: "2026-04-01" })] }), "annual", observedAt);
    expect(out.cashflow.ok && out.cashflow.value.data.rows[0]).not.toHaveProperty("financeLeasePrincipalPayments");
  });
  it("does not enrich a future period even when its filing is stamped before analysis", () => {
    const out = enrichFinancialFields(sourced([{ date: "2026-12-31", reportedCurrency: "USD" }]), sourced<FmpCashFlowRow>([]), facts({ OperatingLeaseLiability: [point(30, { end: "2026-12-31" })] }), "quarter", observedAt);
    expect(out.balance.ok && out.balance.value.data.rows[0]).not.toHaveProperty("operatingLeaseLiability");
  });
});
