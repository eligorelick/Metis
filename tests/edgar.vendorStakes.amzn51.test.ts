/**
 * Audit 2026-10-29, AMZN report #51 (VAL-3, FIG-4; D-133): on the provider
 * path a vendor `longTermInvestments` of 0 or absent is read as undisclosed
 * when the same-period filing shows noncurrent investments, and is filled
 * with the D-98 chain the SEC statements use.
 *
 * Report #51's provider rows carried 0 with no provenance while Amazon's 10-Q
 * tagged $122.3B of non-marketable equity securities and $0.4B of
 * equity-method investments inside "Other assets". The DCF bridge added no
 * stake, and net operating assets kept the stakes while the accrual note said
 * they were excluded.
 *
 * Amounts in the AMZN cases are SEC-filed (millions); the issuer and
 * accession are synthetic (./helpers/amzn51LeaseShape). The Stage B fixture
 * uses round synthetic numbers. No provider row is committed.
 */
import { describe, expect, it } from "vitest";

import { admitVendorLongTermInvestments, balanceAdmissionEntries, enrichFinancialFields } from "@/edgar/financialEnrichment";
import { runStageB } from "@/pipeline/compute";
import { computeAccruals, type ForensicsPeriod } from "@/pipeline/stageB/forensics";
import type { DataBundle } from "@/pipeline/types";
import type { FmpBalanceSheetRow, FmpCashFlowRow, FmpPayload } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";

import { ACCN, FILED_FACTS, FY, M, OBSERVED, Q2, companyFacts, type Points } from "./helpers/amzn51LeaseShape";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

/** Amazon's filed stakes (10-Q Q2 2026 and its 2025-12-31 comparatives), millions. */
const STAKES: Points = {
  [Q2]: { EquitySecuritiesWithoutReadilyDeterminableFairValueAmount: 122_300, EquityMethodInvestments: 395 },
  [FY]: { EquitySecuritiesWithoutReadilyDeterminableFairValueAmount: 16_200, EquityMethodInvestments: 659 },
};
const withStakes = (extra: Points = STAKES): Points => Object.fromEntries([...new Set([...Object.keys(FILED_FACTS), ...Object.keys(extra)])]
  .map((end) => [end, { ...FILED_FACTS[end], ...extra[end] }]));

function vendorBalance(date: string, longTermInvestments: number | null | undefined): FmpBalanceSheetRow {
  return { date, reportedCurrency: "USD", cik: "0000000042", ...(longTermInvestments === undefined ? {} : { longTermInvestments }) } as FmpBalanceSheetRow;
}

describe("a vendor long-term investments of 0 is filled from the filing (VAL-3)", () => {
  it("fills the AMZN shape with the D-98 chain: non-marketable equity plus equity-method investments", () => {
    const { row, admissions } = admitVendorLongTermInvestments(vendorBalance(Q2, 0), companyFacts(withStakes()), "USD", OBSERVED);
    expect(row.longTermInvestments).toBe(122_695 * M);
    expect(row.fieldProvenance?.longTermInvestments).toMatchObject({
      source: "edgar", unit: "USD", periodEnd: Q2,
      tags: ["us-gaap/EquitySecuritiesWithoutReadilyDeterminableFairValueAmount", "us-gaap/EquityMethodInvestments"],
      filings: [{ accn: ACCN, form: "10-Q" }],
    });
    expect(admissions).toEqual([expect.objectContaining({ kind: "stakes", date: Q2, summary: "122,695M" })]);
    expect(admissions[0]!.detail).toBe(
      "vendor longTermInvestments 0M at 2026-06-30 read as undisclosed: the same-period filing shows noncurrent investments, filled with the D-98 chain: " +
      "non-marketable equity securities 122,300M (EquitySecuritiesWithoutReadilyDeterminableFairValueAmount) + equity-method investments 395M (EquityMethodInvestments) " +
      "= 122,695M USD; absent and excluded: non-current debt securities; vendor value retained in the raw row");
  });

  it("fills an absent vendor value the same way", () => {
    const { row } = admitVendorLongTermInvestments(vendorBalance(FY, undefined), companyFacts(withStakes()), "USD", OBSERVED);
    expect(row.longTermInvestments).toBe(16_859 * M);
  });

  it("takes the filed LongTermInvestments total first, and an other-investments line before its two pieces", () => {
    const total = companyFacts(withStakes({ [Q2]: { LongTermInvestments: 500, EquitySecuritiesWithoutReadilyDeterminableFairValueAmount: 200 } }));
    expect(admitVendorLongTermInvestments(vendorBalance(Q2, 0), total, "USD", OBSERVED).row.longTermInvestments).toBe(500 * M);
    const other = companyFacts(withStakes({ [Q2]: {
      OtherLongTermInvestments: 300, EquitySecuritiesWithoutReadilyDeterminableFairValueAmount: 200, EquityMethodInvestments: 50, AvailableForSaleSecuritiesDebtSecuritiesNoncurrent: 40,
    } }));
    const filled = admitVendorLongTermInvestments(vendorBalance(Q2, 0), other, "USD", OBSERVED);
    expect(filled.row.longTermInvestments).toBe(340 * M); // the other-investments line holds the two pieces; the noncurrent debt securities add to it
    expect(filled.row.fieldProvenance?.longTermInvestments?.tags).toEqual(["us-gaap/AvailableForSaleSecuritiesDebtSecuritiesNoncurrent", "us-gaap/OtherLongTermInvestments"]);
  });

  it("names an absent piece, never zero", () => {
    // Amazon at 2022-12-31 tagged its non-marketable equity (715M) and no equity-method investments.
    const only = admitVendorLongTermInvestments(vendorBalance(Q2, 0),
      companyFacts({ [Q2]: { EquitySecuritiesWithoutReadilyDeterminableFairValueAmount: 715 } }), "USD", OBSERVED);
    expect(only.row.longTermInvestments).toBe(715 * M);
    expect(only.admissions).toHaveLength(1);
    expect(only.admissions[0]!.detail).toMatch(/absent and excluded: non-current debt securities, equity-method investments;/);
  });

  it("control: a vendor nonzero value is unchanged", () => {
    const vendor = vendorBalance(Q2, 50_000 * M);
    const { row, admissions } = admitVendorLongTermInvestments(vendor, companyFacts(withStakes()), "USD", OBSERVED);
    expect(row).toBe(vendor);
    expect(admissions).toEqual([]);
  });

  it("control: a filer with no noncurrent investments keeps 0", () => {
    const vendor = vendorBalance(Q2, 0);
    const { row, admissions } = admitVendorLongTermInvestments(vendor, companyFacts(FILED_FACTS), "USD", OBSERVED);
    expect(row).toBe(vendor);
    expect(row.longTermInvestments).toBe(0);
    expect(admissions).toEqual([]);
  });

  it("control: a value the SEC statements built, or a refused one, is left alone; so is a row in another currency", () => {
    const facts = companyFacts(withStakes());
    const filled = admitVendorLongTermInvestments(vendorBalance(Q2, 0), facts, "USD", OBSERVED).row;
    const again = admitVendorLongTermInvestments(filled, facts, "USD", OBSERVED);
    expect(again.row).toBe(filled);
    expect(again.admissions).toEqual([]);
    const refused = { ...vendorBalance(Q2, 0), fieldConflicts: { longTermInvestments: { vendorValue: 0, secValue: 1, usable: false, reason: "test" } } } as FmpBalanceSheetRow;
    expect(admitVendorLongTermInvestments(refused, facts, "USD", OBSERVED).row).toBe(refused);
    expect(admitVendorLongTermInvestments(vendorBalance(Q2, 0), facts, "EUR", OBSERVED).row.longTermInvestments).toBe(0);
    expect(admitVendorLongTermInvestments(vendorBalance(Q2, 0), facts, null, OBSERVED).row.longTermInvestments).toBe(0);
  });

  it("Stage A: the enrichment fills a provider family and leaves SEC-built statements alone", () => {
    const payload = (source: "fmp" | "edgar"): FetchResult<FmpPayload<FmpBalanceSheetRow>> => ({ ok: true,
      value: { source, endpoint: "balance-sheet-statement", asOf: Q2, fetchedAt: OBSERVED, data: { rows: [vendorBalance(Q2, 0)], raw: {} } } }) as FetchResult<FmpPayload<FmpBalanceSheetRow>>;
    const cashflow = { ok: false, error: { kind: "unavailable", message: "not needed" } } as unknown as FetchResult<FmpPayload<FmpCashFlowRow>>;
    const facts = companyFacts(withStakes());
    const vendor = enrichFinancialFields(payload("fmp"), cashflow, facts, "quarter", OBSERVED);
    expect(vendor.balance.ok && vendor.balance.value.data.rows[0]!.longTermInvestments).toBe(122_695 * M);
    // Review m6: the enrichment returns the fills; the bundle builder merges both families into one entry.
    expect(vendor.gaps.map((gap) => gap.field)).not.toContain(`statements.balance.${Q2}.longTermInvestments`);
    expect(vendor.admissions).toEqual([expect.objectContaining({ kind: "stakes", date: Q2 })]);
    const annual = enrichFinancialFields(payload("fmp"), cashflow, facts, "annual", OBSERVED);
    const merged = balanceAdmissionEntries([...annual.admissions, ...vendor.admissions]);
    expect(merged).toEqual([expect.objectContaining({ field: "statements.balance.longTermInvestments", severity: "info", expected: true })]);
    expect(merged[0]!.reason).toMatch(/^vendor longTermInvestments read as undisclosed at 1 balance date; filled with the D-98 chain from the same-period filing, the vendor value retained in the raw row: 2026-06-30 122,695M\. Latest: vendor longTermInvestments 0M at 2026-06-30/);
    const sec = enrichFinancialFields(payload("edgar"), cashflow, facts, "quarter", OBSERVED);
    expect(sec.balance.ok && sec.balance.value.data.rows[0]!.longTermInvestments).toBe(0);
    expect(sec.admissions).toEqual([]);
  });
});

/** Round synthetic stakes (millions) at every balance date of the Stage B fixture, filed before its build date. */
const STAGE_B_FILED = "2026-05-01";
const NON_MARKETABLE = 150;
const EQUITY_METHOD = 30;

function stakesBundle(): DataBundle {
  const bundle = completeCurrencyBundle({ symbol: "STAKECO", debt: 300, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  const points: Points = {};
  for (const family of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) {
    if (!family.ok) throw new Error("fixture missing");
    for (const row of family.value.data.rows as FmpBalanceSheetRow[]) {
      points[row.date!] = { EquitySecuritiesWithoutReadilyDeterminableFairValueAmount: NON_MARKETABLE, EquityMethodInvestments: EQUITY_METHOD };
      Object.assign(row, { longTermInvestments: 0 });
    }
  }
  bundle.edgar = { ...bundle.edgar,
    cik: { ok: true, value: { source: "edgar", endpoint: "test mapping", asOf: "2026-07-01", fetchedAt: bundle.builtAt,
      data: { cik: 42, cik10: "0000000042", ticker: "STAKECO", title: "Synthetic Stake Co" } } },
    companyFacts: { ok: true, value: { source: "edgar", endpoint: "test facts", asOf: "2026-07-01", fetchedAt: bundle.builtAt, data: companyFacts(points, STAGE_B_FILED) } },
  } as DataBundle["edgar"];
  return bundle;
}

describe("the filled stakes reach the DCF bridge and leave net operating assets (FIG-4)", () => {
  it("Stage B fills a frozen provider row: the DCF bridge adds the stakes and net operating assets exclude them", () => {
    const stakes = (NON_MARKETABLE + EQUITY_METHOD) * M;
    const computed = runStageB(stakesBundle());
    if (computed.valuation.kind !== "dcf") throw new Error("DCF fixture");
    expect(computed.valuation.dcf?.bridge.nonOperatingComponents ?? []).toContainEqual(expect.objectContaining({ kind: "long-term-investments", value: stakes }));
    expect(computed.forensics?.accruals?.longTermInvestmentsCurrent).toBe(stakes);
    expect(computed.forensics?.accruals?.longTermInvestmentsPrior).toBe(stakes);
    // Review m6: one stakes entry listing every filled date, none per date.
    expect(computed.gaps.filter((g) => /^statements\.balance\.\d{4}-\d{2}-\d{2}\.longTermInvestments$/.test(g.field))).toEqual([]);
    const stakesEntries = computed.gaps.filter((g) => g.field === "statements.balance.longTermInvestments");
    expect(stakesEntries).toHaveLength(1);
    expect(stakesEntries[0]!.reason).toContain("2025-12-31 180M");
    // The same bundle with the stakes left at the vendor's 0 has a bridge without them and NOA that keeps them.
    const unfilled = stakesBundle();
    unfilled.edgar = { ...unfilled.edgar, companyFacts: { ok: true, value: { source: "edgar", endpoint: "test facts", asOf: "2026-07-01", fetchedAt: unfilled.builtAt,
      data: companyFacts({}, STAGE_B_FILED) } } } as DataBundle["edgar"];
    const before = runStageB(unfilled);
    if (before.valuation.kind !== "dcf") throw new Error("DCF fixture");
    expect((before.valuation.dcf?.bridge.nonOperatingComponents ?? []).some((c) => c.kind === "long-term-investments")).toBe(false);
    expect(computed.forensics?.accruals?.noaCurrent).toBe(before.forensics!.accruals!.noaCurrent! - stakes);
  });
});

describe("the accrual note says long-term investments are removed only when they are (FIG-4)", () => {
  const current: ForensicsPeriod = {
    income: { date: "2025-12-31", revenue: 1_000 },
    balance: { date: "2025-12-31", totalAssets: 2_000, cashAndShortTermInvestments: 300, longTermInvestments: 0, totalLiabilities: 900, totalDebt: 400 },
    cashFlow: { date: "2025-12-31", netIncome: 100, netCashProvidedByOperatingActivities: 150, netCashProvidedByInvestingActivities: -80, purchasesOfInvestments: -30, salesMaturitiesOfInvestments: 10 },
  };
  const prior: ForensicsPeriod = {
    income: { date: "2024-12-31", revenue: 900 },
    balance: { date: "2024-12-31", totalAssets: 1_800, cashAndShortTermInvestments: 280, longTermInvestments: 0, totalLiabilities: 850, totalDebt: 380 },
  };

  it("with 0 on both balance sheets, says none are removed", () => {
    const r = computeAccruals(current, prior);
    expect(r.definition).toBe("financial-asset-adjusted");
    const note = r.notes.find((n) => n.startsWith("Accruals are financial-asset-adjusted"))!;
    expect(note).toMatch(/net operating assets exclude cash and short-term investments\. Long-term investments are 0 on both balance sheets, so none are removed from net operating assets\./);
    expect(note).not.toMatch(/strategic equity stake is not an accrual/);
  });

  it("control: with long-term investments on either balance sheet, says they are excluded", () => {
    const r = computeAccruals({ ...current, balance: { ...current.balance!, longTermInvestments: 120 } }, prior);
    const note = r.notes.find((n) => n.startsWith("Accruals are financial-asset-adjusted"))!;
    expect(note).toMatch(/net operating assets exclude cash, short-term and long-term investments — buying securities or a strategic equity stake is not an accrual\./);
  });
});
