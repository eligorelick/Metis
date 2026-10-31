import { describe, expect, it } from "vitest";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import { enrichFinancialFields } from "@/edgar/financialEnrichment";
import { pickBalanceAnchor, runStageB } from "@/pipeline/compute";
import { incompleteDebtReason } from "@/edgar/debtCompleteness";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpBalanceSheetRow } from "@/providers/fmp";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import { completeCurrencyBundle, currencyBundle, M } from "./helpers/currencyBundle";
import frozen from "./fixtures/crwv-debt-facts.json";
import { confirmFixtureIssuer } from "./helpers/edgarIdentity";

const build = (facts = frozen.facts as CompanyFacts) => buildStatementsFromCompanyFacts(facts, {
  symbol: "CRWV", cik: "0001769628", asOf: frozen.asOf, factsObservedAt: "2026-10-16T09:33:42.064Z", annualPeriods: 2, quarterlyPeriods: 4,
  vendorSplits: { status: "retrieved", source: "test:vendor", events: [], coverage: [{ from: "2020-01-01", to: frozen.asOf }] },
});
const at = (facts = frozen.facts as CompanyFacts) => build(facts).balanceQuarterly.rows.find((row) => row.date === "2026-06-30")!;

describe("CRWV saved debt facts must not publish a partial carrying total", () => {
  it("withholds the fiscal maturity bucket and incomplete debt total without inventing the missing carrying value", () => {
    const row = at();
    expect(row.shortTermDebt).toBeNull();
    expect(row.longTermDebt).toBeNull();
    expect(row.totalDebt).toBeNull();
    expect(row.netDebt).toBeNull();
    expect(row.operatingLeaseLiability).toBe(16_319 * M);
    expect(row.fieldConflicts?.totalDebt).toMatchObject({ usable: false });
    expect(build().balanceQuarterly.withheld).toContainEqual(expect.objectContaining({ field: "totalDebt", periods: ["2026-06-30"] }));
  });

  it("does not silently replace an explicitly refused current balance with an older complete annual row", () => {
    const current = at();
    const annual = { date: "2025-12-31", totalDebt: 29_822 * M, totalStockholdersEquity: 3335 * M, cashAndShortTermInvestments: 3161 * M };
    expect(pickBalanceAnchor(current, annual).row).toBe(current);
  });

  it("preserves complete same-period carrying components rather than replacing them with principal", () => {
    const facts = structuredClone(frozen.facts) as CompanyFacts;
    const point = { end: "2026-06-30", val: 7513 * M, accn: "0001769628-26-000366", filed: "2026-08-12", form: "10-Q", fy: 2026, fp: "Q2" };
    facts.facts["us-gaap"]!.LongTermDebtCurrent = { units: { USD: [point] } };
    facts.facts["us-gaap"]!.LongTermDebtNoncurrent = { units: { USD: [{ ...point, val: 27_555 * M }] } };
    const row = at(facts);
    expect(row.shortTermDebt).toBe(7513 * M);
    expect(row.longTermDebt).toBe(27_555 * M);
    expect(row.totalDebt).toBe(51_608 * M);
    expect(row.fieldConflicts?.totalDebt).toBeUndefined();
  });

  it("keeps a clean debt-free or lease-only issuer eligible when no omitted financing debt is evidenced", () => {
    const facts = structuredClone(frozen.facts) as CompanyFacts;
    delete facts.facts["us-gaap"]!.DebtInstrumentCarryingAmount;
    delete facts.facts["us-gaap"]!.LongTermDebtMaturitiesRepaymentsOfPrincipalInNextTwelveMonths;
    delete facts.facts["us-gaap"]!.LongTermDebtMaturitiesRepaymentsOfPrincipalRemainderOfFiscalYear;
    expect(at(facts).totalDebt).toBe(16_540 * M);
  });

  it("blocks a partial vendor fallback and downstream current EV while preserving a complete vendor total", () => {
    const bundle = currencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    const balance = bundle.statements.balanceQuarterly;
    if (!balance.ok) throw new Error("balance fixture missing");
    const row = balance.value.data.rows[0]!;
    Object.assign(row, { date: "2026-06-30", totalDebt: 22_724 * M, shortTermDebt: 6184 * M,
      operatingLeaseLiability: 16_319 * M, financeLeaseLiability: 221 * M, capitalLeaseObligations: 16_540 * M });
    delete row.longTermDebt;
    const cf = bundle.statements.cashflowQuarterly;
    const enriched = enrichFinancialFields(balance, cf, frozen.facts as CompanyFacts, "quarter", "2026-10-16T09:33:42.064Z");
    if (!enriched.balance.ok) throw new Error("enrichment failed");
    expect(enriched.balance.value.data.rows[0]!.totalDebt).toBeNull();
    expect(enriched.balance.value.data.rows[0]!.fieldConflicts?.totalDebt).toMatchObject({ usable: false, vendorValue: 22_724 * M });
    bundle.statements.balanceQuarterly = enriched.balance;
    const computed = runStageB(bundle);
    expect(computed.valuation.multiples!.enterpriseValue.value).toBeNull();
    expect(computed.valuation.multiples!.multiples.find((multiple) => multiple.key === "evToSales")?.current).toBeNull();
    expect(computed.valuation.multiples!.multiples.find((multiple) => multiple.key === "evToEbitda")?.current).toBeNull();
    expect(computed.returns.wacc.waccPct).toBeNull();
    expect(computed.returns.wacc.weightDebt).toBeNull();
    const complete = { ...row, totalDebt: 51_608 * M, shortTermDebt: 7513 * M, longTermDebt: 27_555 * M } as FmpBalanceSheetRow;
    const admitted = enrichFinancialFields({ ...balance, value: { ...balance.value, data: { ...balance.value.data, rows: [complete] } } }, cf,
      frozen.facts as CompanyFacts, "quarter", "2026-10-16T09:33:42.064Z");
    if (!admitted.balance.ok) throw new Error("enrichment failed");
    expect(admitted.balance.value.data.rows[0]!.totalDebt).toBe(51_608 * M);
  });

  it.each([[0, 35_068 * M], [35_068 * M, 0]])("preserves complete carrying components including a legitimate zero (%s, %s)", (shortTermDebt, longTermDebt) => {
    expect(incompleteDebtReason({ shortTermDebt, longTermDebt, totalDebt: 35_068 * M, financeLeaseLiability: 0 }, 35_551 * M)).toBeNull();
  });

  it("does not use a large lease-inclusive total to prove missing financing debt complete", () => {
    expect(incompleteDebtReason({ shortTermDebt: 6184 * M, longTermDebt: null, financeLeaseLiability: 221 * M,
      totalDebt: 46_405 * M }, 35_551 * M)).toMatch(/incomplete debt/);
  });

  it("admits debt after the currency is established from same-filing siblings", () => {
    const bundle = currencyBundle({ filingLinks: "shared", siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    bundle.builtAt = "2026-10-16T09:33:42.064Z";
    for (const result of [bundle.statements.incomeQuarterly, bundle.statements.balanceQuarterly, bundle.statements.cashflowQuarterly]) {
      if (!result.ok) throw new Error("fixture missing");
      result.value.data.rows[0]!.date = "2026-06-30";
    }
    const balance = bundle.statements.balanceQuarterly;
    if (!balance.ok) throw new Error("fixture missing");
    Object.assign(balance.value.data.rows[0]!, { totalDebt: 22_724 * M, shortTermDebt: 6184 * M,
      operatingLeaseLiability: 16_319 * M, financeLeaseLiability: 221 * M, capitalLeaseObligations: 16_540 * M });
    delete balance.value.data.rows[0]!.longTermDebt;
    delete balance.value.data.rows[0]!.reportedCurrency;
    bundle.edgar = { ...bundle.edgar, companyFacts: { ok: true, value: { data: frozen.facts as CompanyFacts, source: "edgar",
      asOf: frozen.asOf, fetchedAt: `${frozen.asOf}T09:33:42.064Z`, endpoint: "frozen CRWV companyfacts" } } };
    confirmFixtureIssuer(bundle, 1769628);
    const result = runStageB(bundle);
    expect(result.valuation.multiples!.enterpriseValue.value).toBeNull();
    expect(result.returns.wacc.waccPct).toBeNull();
  });

  it.each(["USD", null])("never registers refused raw debt in the analyst payload (own currency %s)", (currency) => {
    const bundle = completeCurrencyBundle({ filingLinks: "shared", siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    bundle.builtAt = "2026-10-16T09:33:42.064Z";
    const balance = bundle.statements.balanceQuarterly;
    if (!balance.ok) throw new Error("fixture missing");
    const row = balance.value.data.rows[0]!;
    Object.assign(row, { date: "2026-06-30", totalDebt: 22_724 * M, shortTermDebt: 6184 * M,
      operatingLeaseLiability: 16_319 * M, financeLeaseLiability: 221 * M });
    delete row.longTermDebt;
    if (currency === null) delete row.reportedCurrency;
    else row.reportedCurrency = currency;
    for (const result of [bundle.statements.incomeQuarterly, bundle.statements.cashflowQuarterly]) {
      if (!result.ok) throw new Error("fixture missing");
      result.value.data.rows[0]!.date = row.date;
    }
    bundle.edgar = { ...bundle.edgar, companyFacts: { ok: true, value: { data: frozen.facts as CompanyFacts, source: "edgar",
      asOf: frozen.asOf, fetchedAt: bundle.builtAt, endpoint: "frozen CRWV companyfacts" } } };
    confirmFixtureIssuer(bundle, 1769628);
    const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] } as unknown as ValidationReport);
    const id = "payload.statements.balance-sheet-quarterly.2026-06-30.total-debt";
    const record = payload.provenanceRegistry?.find((entry) => entry.id === id);
    expect(record).toBeUndefined();
    const block = payload.statements.find((entry) => entry.title === "Balance sheet — quarterly")!;
    expect(block.lineItems.find((line) => line.lineItem === "Debt used in this report")?.byPeriod[0]?.value).toBeNull();
    expect(validateClaimNumericSupport({ text: "Total debt as of 2026-06-30 was USD 22.724 billion.", label: "FACT", source: id, asOf: "2026-06-30" },
      { record, sourceId: id, excerpts: [], reportingCurrency: "USD" }).status).not.toBe("validated");
    expect(row.totalDebt).toBe(22_724 * M); // Admission is immutable; preserve raw snapshot evidence.
  });
  it("does not use foreign, stale or future aggregate facts to reject a vendor observation", () => {
    for (const mode of ["foreign", "stale", "future"] as const) {
      const facts = structuredClone(frozen.facts) as CompanyFacts;
      const tag = facts.facts["us-gaap"]!.DebtInstrumentCarryingAmount as { units: Record<string, Record<string, unknown>[]> };
      const ps = tag.units.USD!.filter((point) => point.end === "2026-06-30");
      tag.units = mode === "foreign" ? { EUR: ps } : { USD: ps.map((point) => ({ ...point,
        ...(mode === "stale" ? { end: "2026-03-31" } : { filed: "2027-01-01" }) })) };
      const bundle = currencyBundle();
      const balance = bundle.statements.balanceQuarterly;
      if (!balance.ok) throw new Error("fixture missing");
      Object.assign(balance.value.data.rows[0]!, { date: "2026-06-30", totalDebt: 22_724 * M, shortTermDebt: 6184 * M });
      delete balance.value.data.rows[0]!.longTermDebt;
      const enriched = enrichFinancialFields(balance, bundle.statements.cashflowQuarterly, facts, "quarter", "2026-10-16T09:33:42.064Z");
      if (!enriched.balance.ok) throw new Error("enrichment failed");
      expect(enriched.balance.value.data.rows[0]!.totalDebt).toBe(22_724 * M);
    }
  });
});

// Audit 2026-10-22 B-5, owner decision: a principal-type aggregate above the
// carrying components by up to 2% of them, or 50 million in the reporting
// currency, whichever is larger, is unamortized discount and issuance cost.
describe("principal-versus-carrying tolerance (audit 2026-10-22 B-5)", () => {
  it("admits the components within the band: META 2024 (0.6%) and MCD 2026-06-30 (0.09%)", () => {
    expect(incompleteDebtReason({ longTermDebt: 28_826 * M }, 29_000 * M)).toBeNull();
    expect(incompleteDebtReason({ longTermDebt: 39_863 * M }, 39_900 * M)).toBeNull();
  });

  it("is two-sided at 2% of the components: just inside admits, just outside withholds with both figures", () => {
    expect(incompleteDebtReason({ longTermDebt: 10_000 * M }, 10_200 * M)).toBeNull();
    expect(incompleteDebtReason({ longTermDebt: 10_000 * M }, 10_201 * M)).toMatch(/DebtInstrumentCarryingAmount 10201000000 exceeds the resolved financing components 10000000000/);
  });

  it("is two-sided at the 50 million floor for a small issuer", () => {
    expect(incompleteDebtReason({ longTermDebt: 1_000 * M }, 1_050 * M)).toBeNull();
    expect(incompleteDebtReason({ longTermDebt: 1_000 * M }, 1_051 * M)).toMatch(/exceeds the resolved financing components 1000000000/);
  });

  // Review of B-5: a discount cannot be most of the debt. The 50 million floor
  // reaches at most 10% of the financing components, and leases alone or zero
  // financing debt get only the old rounding allowance.
  it("caps the floor at 10% of the financing components and never admits leases alone", () => {
    expect(incompleteDebtReason({ longTermDebt: 400 * M }, 440 * M)).toBeNull();
    expect(incompleteDebtReason({ longTermDebt: 400 * M }, 441 * M)).toMatch(/exceeds the resolved financing components 400000000/);
    expect(incompleteDebtReason({ longTermDebt: 10 * M }, 59 * M)).toMatch(/exceeds the resolved financing components 10000000/);
    expect(incompleteDebtReason({ shortTermDebt: null, longTermDebt: null, financeLeaseLiability: 30 * M }, 75 * M)).toMatch(/exceeds the resolved financing components 30000000/);
  });

  it("still withholds a genuinely incomplete composition", () => {
    expect(incompleteDebtReason({ longTermDebt: 215.3 * M }, 17_784.94 * M)).toMatch(/incomplete debt carrying value/);
  });
});
