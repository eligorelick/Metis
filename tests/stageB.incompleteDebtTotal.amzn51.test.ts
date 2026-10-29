/**
 * Audit 2026-10-29, AMZN report #51 (VAL-2, FIG-2; D-132): an incomplete
 * vendor debt total is never published.
 *
 * Report #51 printed "Total debt including leases" of 223.23B, the vendor's
 * long-term debt plus its noncurrent lease line; the filing composes 242.32B.
 * Two guards let it through: a vendor short-term debt of 0 passed as complete
 * beside a filed current debt, and the current-capital bridge and the
 * provider EV never asked whether the lease guard had refused the row.
 *
 * The brief's third rule (compare debt-only aggregates without finance
 * leases) is not applied: Alphabet files its finance leases inside
 * LongTermDebt (2019-12-31: LongTermDebt 4,685M against LongTermDebtNoncurrent
 * 3,958M plus FinanceLeaseLiability 711M), so the rule withheld its 2019-2022
 * and 2025 debt. The tagged-total check is unchanged and is pinned as it stands.
 */
import { describe, expect, it } from "vitest";

import { uncomposedDebtReason, zeroCurrentDebtReason } from "@/edgar/debtCompleteness";
import { admitDebtFields } from "@/edgar/financialEnrichment";
import { buildMarketData } from "@/pipeline/marketData";
import { runStageB } from "@/pipeline/compute";
import { debtBridge } from "@/pipeline/stageB/currentCapital";
import type { DataBundle } from "@/pipeline/types";
import type { FmpBalanceSheetRow } from "@/providers/fmp";

import { FILED_FACTS, M, OBSERVED, Q2, companyFacts, vendorRow, without, type Points } from "./helpers/amzn51LeaseShape";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const bridgeOf = (row: FmpBalanceSheetRow) => debtBridge({ ...row, date: row.date! } as Parameters<typeof debtBridge>[0]);

describe("a vendor total without its current debt is withheld (VAL-2)", () => {
  it("the tagged-total check still counts finance leases against a debt-only aggregate", () => {
    // Report #51's components: no current debt, long-term debt 128,894, finance leases 13,451; LongTermDebt 132,995.
    // Unchanged on purpose: Alphabet's LongTermDebt holds its finance leases, so a debt-only comparison would refuse it.
    expect(uncomposedDebtReason({ shortTermDebt: 0, longTermDebt: 128_894 * M, financeLeaseLiability: 13_451 * M },
      [{ tag: "LongTermDebt", value: 132_995 * M }])).toBeNull();
    expect(uncomposedDebtReason({ shortTermDebt: 0, longTermDebt: 128_894 * M, financeLeaseLiability: 0 },
      [{ tag: "LongTermDebt", value: 132_995 * M }]))
      .toMatch(/LongTermDebt 132995000000 exceeds the composed current and noncurrent financing debt and finance leases 128894000000/);
  });

  it("does not accept a vendor short-term debt of 0 beside a filed current debt", () => {
    expect(zeroCurrentDebtReason(0, [{ tag: "LongTermDebtCurrent", value: 3_330 * M }, { tag: "ShortTermBorrowings", value: 325 * M }]))
      .toMatch(/short-term debt is 0.*LongTermDebtCurrent 3330000000.*ShortTermBorrowings 325000000/);
    expect(zeroCurrentDebtReason(0, [{ tag: "LongTermDebtCurrent", value: null }])).toBeNull();
    expect(zeroCurrentDebtReason(0, [{ tag: "LongTermDebtCurrent", value: 0 }])).toBeNull();
    expect(zeroCurrentDebtReason(3_655 * M, [{ tag: "LongTermDebtCurrent", value: 3_330 * M }])).toBeNull();
  });

  it("withholds a vendor row whose zero short-term debt the filing contradicts", () => {
    // Lease line already the total, so no completion applies; LongTermDebt left out so only the current-debt check speaks.
    const row = vendorRow(Q2, { capitalLeaseObligations: 109_771 });
    const { row: out, gaps } = admitDebtFields(row, companyFacts(without(FILED_FACTS, "LongTermDebt")), "USD", OBSERVED);
    expect(out.totalDebt).toBeNull();
    expect(out.fieldConflicts?.totalDebt?.reason).toMatch(/short-term debt is 0/);
    expect(gaps).toContainEqual(expect.objectContaining({ field: `statements.balance.${Q2}.totalDebt`, severity: "warn" }));
    const tagged = admitDebtFields(row, companyFacts(FILED_FACTS), "USD", OBSERVED).row;
    expect(tagged.totalDebt).toBeNull(); // with LongTermDebt filed too, the current-debt check still withholds it
    expect(tagged.fieldConflicts?.totalDebt?.reason).toMatch(/short-term debt is 0/);
  });

  it("control: a vendor zero beside no filed current debt is kept", () => {
    const row = vendorRow(Q2, { capitalLeaseObligations: 109_771 });
    const facts = companyFacts(without(FILED_FACTS, "LongTermDebt", "LongTermDebtCurrent", "ShortTermBorrowings"));
    expect(admitDebtFields(row, facts, "USD", OBSERVED).row.totalDebt).toBe(row.totalDebt);
  });
});

describe("the current-capital bridge never publishes a refused total (FIG-2)", () => {
  it("before completion: the AMZN shape's 223.23B is not published as including leases", () => {
    const bridge = bridgeOf(vendorRow(Q2));
    expect(bridge.totalDebtIncludingLeases).toBeNull();
    expect(bridge.netDebtIncludingLeases).toBeNull();
    expect(bridge.netDebtExcludingOperatingLeases).toBeNull();
    expect(bridge.compositionNote).toMatch(/^Total debt including leases withheld at 2026-06-30: operating-lease liability 96,320M/);
    expect(bridge.operatingLeases).toBe(96_320 * M); // the filed lease amounts stay
  });

  it("after completion: 242.32B, described as composed from the filing, not as a vendor-reported total", () => {
    const completed = admitDebtFields(vendorRow(Q2), companyFacts(FILED_FACTS), "USD", OBSERVED).row;
    const bridge = bridgeOf(completed);
    expect(bridge.totalDebtIncludingLeases).toBe(242_320 * M);
    expect(bridge.compositionNote).toMatch(/^Total debt including leases 242,320M is composed from the 10-Q 0000000042-26-000026 filing/);
    expect(bridge.compositionNote).toMatch(/leaving out current debt and current lease liabilities\. It is a composed figure, not a vendor-reported total\.$/);
  });

  it("a vendor short-term debt the filing confirms is kept, and the note says only the current leases were left out", () => {
    const completed = admitDebtFields(vendorRow(Q2, { shortTermDebt: 3_655 }), companyFacts(FILED_FACTS), "USD", OBSERVED).row;
    const bridge = bridgeOf(completed);
    expect(bridge.totalDebtIncludingLeases).toBe(242_320 * M);
    expect(bridge.compositionNote).toMatch(/held only the noncurrent lease liabilities, leaving out current lease liabilities\. It is a composed figure/);
  });

  it("names an admission refusal instead of leaving the total silently empty", () => {
    const refused = admitDebtFields(vendorRow(Q2), companyFacts(without(FILED_FACTS, "LongTermDebtCurrent", "ShortTermBorrowings")), "USD", OBSERVED).row;
    const bridge = bridgeOf(refused);
    expect(bridge.totalDebtIncludingLeases).toBeNull();
    expect(bridge.compositionNote).toMatch(/withheld at 2026-06-30: incomplete debt carrying value: the vendor lease line/);
  });

  it("control: a reconciled row keeps today's bridge and no note", () => {
    const bridge = debtBridge({ date: Q2, totalDebt: 30, cashAndCashEquivalents: 10, shortTermInvestments: 5, operatingLeaseLiability: 2, financeLeaseLiability: 4, capitalLeaseObligations: 6 });
    expect(bridge).toMatchObject({ totalDebtIncludingLeases: 30, netDebtIncludingLeases: 15, netDebtExcludingOperatingLeases: 13 });
    expect(bridge.compositionNote).toBeUndefined();
  });
});

describe("the provider EV is withheld at a date whose debt the run refused or recomposed (FIG-2)", () => {
  function bundleWith(row: FmpBalanceSheetRow, providerDebt: number): DataBundle {
    const bundle = completeCurrencyBundle({ symbol: "LEASECO", siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    if (!bundle.statements.balanceQuarterly.ok) throw new Error("fixture missing");
    bundle.statements.balanceQuarterly.value.data.rows.unshift(row);
    (bundle as unknown as Record<string, unknown>).enterpriseValues = { ok: true, value: { source: "fmp", endpoint: "enterprise-values", asOf: Q2, fetchedAt: bundle.builtAt,
      data: { rows: [{ date: Q2, enterpriseValue: 2_700_000 * M, marketCapitalization: 2_600_000 * M, addTotalDebt: providerDebt, minusCashAndCashEquivalents: 78_213 * M }], raw: {} } } };
    return bundle;
  }

  it("withholds it when the same-date balance's lease and debt inputs conflict", () => {
    const md = buildMarketData(bundleWith(vendorRow(Q2), 223_232 * M))!;
    expect(md.enterpriseValue).toBeNull();
    expect(md.enterpriseValueOrigin).toBe("provider");
    expect(md.enterpriseValueNote).toMatch(/^Provider enterprise value withheld at 2026-06-30: .*operating-lease liability 96,320M/);
  });

  it("withholds it when its debt operand is not the total the filing composes", () => {
    const completed = admitDebtFields(vendorRow(Q2), companyFacts(FILED_FACTS), "USD", OBSERVED).row;
    const md = buildMarketData(bundleWith(completed, 223_232 * M))!;
    expect(md.enterpriseValue).toBeNull();
    expect(md.enterpriseValueNote).toMatch(/debt operand 223,232M differs from the same-date total debt including leases 242,320M/);
  });

  it("control: a provider EV whose debt matches an unrefused balance is shown as served", () => {
    const completed = admitDebtFields(vendorRow(Q2), companyFacts(FILED_FACTS), "USD", OBSERVED).row;
    const md = buildMarketData(bundleWith(completed, 242_320 * M))!;
    expect(md.enterpriseValue?.value).toBe(2_700_000 * M);
    expect(md.enterpriseValueNote).toBeUndefined();
  });
});

describe("a withheld total or EV ends its reason with one period (review m3)", () => {
  it("the bridge note does not double the period of a reason that ends a sentence", () => {
    const bridge = debtBridge({ date: Q2, totalDebt: null, cashAndCashEquivalents: 10, operatingLeaseLiability: 2,
      fieldConflicts: { totalDebt: { vendorValue: 30, secValue: null, usable: false, reason: "total debt and net debt are withheld until reconciled." } } } as Parameters<typeof debtBridge>[0]);
    expect(bridge.compositionNote).toBe("Total debt including leases withheld at 2026-06-30: total debt and net debt are withheld until reconciled.");
  });

  it("the bridge note still closes a reason that has no period", () => {
    const bridge = debtBridge({ date: Q2, totalDebt: null, cashAndCashEquivalents: 10,
      fieldConflicts: { totalDebt: { vendorValue: 30, secValue: null, usable: false, reason: "total debt withheld" } } } as Parameters<typeof debtBridge>[0]);
    expect(bridge.compositionNote).toBe("Total debt including leases withheld at 2026-06-30: total debt withheld.");
  });

  it("the EV basis does not double the period of the share-scope reason", () => {
    const bundle = completeCurrencyBundle({});
    bundle.edgar.tenQNotes = { ok: true, value: { data: { sectionName: "tenQNotes", text: "Capital stock", statementsText: "Common stock, issued and outstanding: 114,473 shares. Class B common stock, issued and outstanding: 5,523 shares.", method: "header-regex", chars: 13, accession: "filing", form: "10-Q", filingDate: "2026-05-06", reportDate: "2026-03-31", documentUrl: "https://www.sec.gov/filing" }, source: "edgar", endpoint: "filing:notes", asOf: "2026-03-31", fetchedAt: bundle.builtAt } };
    const ev = runStageB(bundle).valuation.multiples!.enterpriseValue;
    expect(ev.value).toBeNull();
    expect(ev.basis).toMatch(/^EV withheld: Issuer-common economic share scope unresolved: .*equivalent rights\.$/);
    expect(ev.basis).not.toMatch(/\.\.$/);
  });
});

describe("a vendor long-term debt that already holds the current maturities is complete (review m4)", () => {
  // Round synthetic numbers (millions): the filing tags noncurrent 1,000 and current maturities 100; the vendor shows 0 short-term debt.
  const FOLD: Points = { [Q2]: { LongTermDebtNoncurrent: 1_000, LongTermDebtCurrent: 100, CashAndCashEquivalentsAtCarryingValue: 50 } };
  const foldRow = (longTermDebt: number): FmpBalanceSheetRow => ({
    date: Q2, reportedCurrency: "USD", cik: "0000000042", filingDate: "2026-07-31",
    shortTermDebt: 0, longTermDebt: longTermDebt * M, totalDebt: longTermDebt * M, netDebt: (longTermDebt - 50) * M, cashAndCashEquivalents: 50 * M,
  } as FmpBalanceSheetRow);
  const withTags = (tags: Record<string, number>): Points => ({ [Q2]: { ...FOLD[Q2]!, ...tags } });

  it("publishes a row whose long-term debt equals the filing's noncurrent debt plus its current maturities", () => {
    const { row } = admitDebtFields(foldRow(1_100), companyFacts(FOLD), "USD", OBSERVED);
    expect(row.totalDebt).toBe(1_100 * M);
    expect(row.fieldConflicts?.totalDebt).toBeUndefined();
  });

  it("control: a long-term debt that leaves the current maturities out is still withheld", () => {
    const { row } = admitDebtFields(foldRow(1_000), companyFacts(FOLD), "USD", OBSERVED);
    expect(row.totalDebt).toBeNull();
    expect(row.fieldConflicts?.totalDebt?.reason).toMatch(/short-term debt is 0 but the same-period filing tags current debt \(LongTermDebtCurrent 100000000\)/);
  });

  it("still withholds when the filing tags short-term borrowings the fold-in does not cover", () => {
    const { row } = admitDebtFields(foldRow(1_100), companyFacts(withTags({ ShortTermBorrowings: 20 })), "USD", OBSERVED);
    expect(row.totalDebt).toBeNull();
    expect(row.fieldConflicts?.totalDebt?.reason).toMatch(/ShortTermBorrowings 20000000/);
  });

  it("residual, fail-closed: a DebtCurrent above the current maturities (it may hold current finance leases) still withholds", () => {
    expect(admitDebtFields(foldRow(1_100), companyFacts(withTags({ DebtCurrent: 130 })), "USD", OBSERVED).row.totalDebt).toBeNull();
    expect(admitDebtFields(foldRow(1_100), companyFacts(withTags({ DebtCurrent: 100 })), "USD", OBSERVED).row.totalDebt).toBe(1_100 * M);
  });

  it("does not add current maturities from another filing to the noncurrent debt", () => {
    const facts = companyFacts(FOLD);
    (facts.facts["us-gaap"] as Record<string, { units: { USD: { accn: string }[] } }>).LongTermDebtCurrent!.units.USD[0]!.accn = "0000000042-26-000099";
    expect(admitDebtFields(foldRow(1_100), facts, "USD", OBSERVED).row.totalDebt).toBeNull();
  });
});
