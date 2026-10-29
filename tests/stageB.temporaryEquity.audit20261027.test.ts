/**
 * Audit 2026-10-27 FIN-119 (High) and FIN-119-V2, mezzanine half: redeemable
 * preferred and redeemable noncontrolling interests are carried in temporary
 * equity, outside every equity field the bridge reads, so the DCF bridge and
 * every enterprise value left them out. They are claims senior to common
 * (ASC 480-10-S99; decisions D-next, OD-1): the bridge deducts them beside
 * preferred and book NCI, the market and own-history EVs add them, and the
 * same claims reach every guard that asks whether preferred or NCI exists.
 *
 * Fixtures: the direct `valueCompany` fixture of the E-7 suite (synthetic: net
 * debt 200, 100 diluted shares) and `completeCurrencyBundle` with every balance
 * row given the claim. Probe seed: FIN-119.probe.ts (logic only).
 */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import { computeDcfDisplay } from "@/pipeline/stageB/fairValue";
import { valuationAuditTables } from "@/report/auditTables";
import { fixedBridgeNonOperatingText } from "@/report/scenarioPresentation";
import { temporaryEquityClaims, type TemporaryEquityClaims } from "@/pipeline/stageB/seniorClaims";
import {
  multiplesFramework, valueCompany, type DcfAssumptionInputs, type MultiplesFrameworkInputs, type QuarterlyFundamentalsRow, type ValuationBundleInputs,
} from "@/pipeline/stageB/valuation";
import type { CompanyRoute } from "@/types/core";

import { M, completeCurrencyBundle } from "./helpers/currencyBundle";

const route: CompanyRoute = { base: "general", overlays: [], evidence: { sector: null, industry: null } };

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
  currentPrice: 100,
  waccPct: 9,
  netDebt: 200,
  dilutedShares: 100,
  dcfInputs: steady,
  multiples,
  excessReturn: null,
  reit: null,
  ...over,
});

function valueOf(over: Partial<ValuationBundleInputs> = {}) {
  const valuation = valueCompany(route, bundle(over));
  if (valuation.kind !== "dcf" || valuation.dcf === null) throw new Error("expected the DCF route");
  return valuation;
}
const dcfOf = valueOf;

const claims = (c: Partial<TemporaryEquityClaims>): TemporaryEquityClaims =>
  ({ redeemablePreferred: 0, redeemableNoncontrolling: 0, unsplit: 0, basis: "test", refusal: null, ...c, total: (c.redeemablePreferred ?? 0) + (c.redeemableNoncontrolling ?? 0) + (c.unsplit ?? 0) });

const KEY = { noncontrollingIncome: 30, consolidatedProfit: 100, asOf: "2025-12-31", basis: "ttm" as const };
const hasGap = (v: { gaps: { field: string }[] }, field: string) => v.gaps.some((g) => g.field === field);
const gapOf = (v: { gaps: { field: string; reason: string; severity: string }[] }, field: string) => v.gaps.find((g) => g.field === field);

describe("FIN-119: the shared predicate", () => {
  it("temporaryEquityClaims reads totals, parts, an unsplit total and a refusal", () => {
    expect(temporaryEquityClaims({ temporaryEquity: 30, temporaryEquityAttributableToParent: 20, temporaryEquityAttributableToNoncontrollingInterest: 10 }))
      .toMatchObject({ redeemablePreferred: 20, redeemableNoncontrolling: 10, unsplit: 0, total: 30, refusal: null });
    expect(temporaryEquityClaims({ temporaryEquity: 30 })).toMatchObject({ unsplit: 30, total: 30 });
    expect(temporaryEquityClaims({ temporaryEquity: 30, temporaryEquityAttributableToParent: 20 })).toMatchObject({ redeemablePreferred: 20, redeemableNoncontrolling: 10 });
    expect(temporaryEquityClaims({ temporaryEquity: 30, fieldConflicts: { temporaryEquity: { usable: false, reason: "two filings disagree" } } })!.refusal).toMatch(/two filings disagree/);
    expect(temporaryEquityClaims({})).toBeNull();
    // Parts without a total, and the observed part alone (the other is undisclosed, never zero-filled in the basis).
    expect(temporaryEquityClaims({ temporaryEquityAttributableToParent: 20, temporaryEquityAttributableToNoncontrollingInterest: 10 }))
      .toMatchObject({ redeemablePreferred: 20, redeemableNoncontrolling: 10, total: 30, refusal: null });
    expect(temporaryEquityClaims({ temporaryEquityAttributableToNoncontrollingInterest: 10 })).toMatchObject({ redeemableNoncontrolling: 10, total: 10 });
    expect(temporaryEquityClaims({ temporaryEquityAttributableToNoncontrollingInterest: 10 })!.basis).toMatch(/parent temporary equity undisclosed/);
    // A total that contradicts its parts, or a non-finite operand, is a refusal with no amount.
    const conflict = temporaryEquityClaims({ temporaryEquity: 30, temporaryEquityAttributableToParent: 5, temporaryEquityAttributableToNoncontrollingInterest: 5 })!;
    expect(conflict.refusal).toMatch(/allocation conflict/);
    expect(conflict.total).toBe(0);
    expect(temporaryEquityClaims({ temporaryEquity: Number.NaN })!.refusal).toMatch(/nonfinite/);
    // A total with only the NCI part: the remainder is parent temporary equity. A part above its total is a conflict.
    expect(temporaryEquityClaims({ temporaryEquity: 30, temporaryEquityAttributableToNoncontrollingInterest: 10 })).toMatchObject({ redeemablePreferred: 20, redeemableNoncontrolling: 10, total: 30 });
    expect(temporaryEquityClaims({ temporaryEquity: 30, temporaryEquityAttributableToParent: 40 })!.refusal).toMatch(/exceeds the reported total/);
    expect(temporaryEquityClaims({ temporaryEquity: 30, temporaryEquityAttributableToNoncontrollingInterest: 40 })!.refusal).toMatch(/exceeds the reported total/);
    // The parent part alone is the observed claim; a zero total is a filed zero, not a refusal.
    expect(temporaryEquityClaims({ temporaryEquityAttributableToParent: 20 })).toMatchObject({ redeemablePreferred: 20, total: 20 });
    expect(temporaryEquityClaims({ temporaryEquity: 0 })).toMatchObject({ total: 0, refusal: null });
    // A refused operand whose value was dropped is still a refusal, not "nothing filed".
    expect(temporaryEquityClaims({ fieldConflicts: { temporaryEquityAttributableToNoncontrollingInterest: { usable: false, reason: "vendor/SEC conflict" } } })!.refusal).toMatch(/vendor\/SEC conflict/);
  });
});

describe("FIN-119: the DCF bridge", () => {
  const base = dcfOf();

  it("redeemable preferred is deducted like permanent preferred", () => {
    const pref = dcfOf({ preferred: 50 }), temp = dcfOf({ temporaryEquity: claims({ redeemablePreferred: 50 }) });
    expect(temp.dcf!.equityValue).toBeCloseTo(pref.dcf!.equityValue!, 9); // control: permanent preferred 50
    expect(base.dcf!.equityValue! - temp.dcf!.equityValue!).toBeCloseTo(50, 9);
    expect(temp.notes.join(" ")).toMatch(/temporary equity attributable to the parent/);
    expect(temp.dcf!.bridge.temporaryEquity).toMatchObject({ redeemablePreferred: 50, redeemableNoncontrolling: 0, unsplit: 0 });
    expect(temp.dcf!.bridge.preferred).toBe(50);
  });

  it("the parent temporary-equity note discloses the redeemable-common residual", () => {
    const temp = dcfOf({ temporaryEquity: claims({ redeemablePreferred: 50 }) });
    expect(temp.notes.join(" ")).toMatch(/can also hold redeemable common shares .*may already be in the diluted share count/);
    // Controls: permanent preferred only; and redeemable NCI only (with a profit key, so the bridge runs).
    expect(dcfOf({ preferred: 50 }).notes.join(" ")).not.toMatch(/redeemable common shares/);
    expect(dcfOf({ temporaryEquity: claims({ redeemableNoncontrolling: 40 }), minorityInterest: 10, noncontrollingEarnings: KEY }).notes.join(" "))
      .not.toMatch(/redeemable common shares/);
  });

  it("redeemable NCI is the E-5 floor, not a second deduction", () => {
    const v = dcfOf({ minorityInterest: 10, temporaryEquity: claims({ redeemableNoncontrolling: 40 }), noncontrollingEarnings: KEY });
    const bridge = v.dcf!.bridge;
    const consolidatedEquity = v.dcf!.enterpriseValue - bridge.netDebt! - (bridge.preferred ?? 0) + (bridge.nonOperatingAssets ?? 0);
    expect(bridge.minorityInterest).toBe(50);
    expect(bridge.noncontrollingDeducted).toBeCloseTo(Math.max(50, 0.3 * consolidatedEquity), 9);
    expect(v.dcf!.equityValue).toBeCloseTo(consolidatedEquity - bridge.noncontrollingDeducted!, 9);
    // Without the redeemable part the book floor is 10, and the deduction is the profit share alone.
    const without = dcfOf({ minorityInterest: 10, noncontrollingEarnings: KEY });
    expect(without.dcf!.bridge.noncontrollingDeducted).toBeCloseTo(0.3 * (without.dcf!.enterpriseValue - 200), 9);
  });

  it("an unsplit temporary-equity total beside an E-5 earnings key withholds the per share", () => {
    const v = dcfOf({ minorityInterest: 10, temporaryEquity: claims({ unsplit: 40 }), noncontrollingEarnings: KEY });
    expect(v.dcf!.bridge.noncontrollingDeductionBasis).toBe("earnings-share");
    expect(v.dcf!.perShare).toBeNull();
    expect(gapOf(v, "valuation.dcf.temporaryEquityAllocation")?.severity).toBe("warn");
    // Control: the same unsplit total with no NCI at all is deducted in full.
    const plain = dcfOf({ minorityInterest: 0, temporaryEquity: claims({ unsplit: 40 }) });
    expect(plain.dcf!.perShare).not.toBeNull();
    expect(base.dcf!.equityValue! - plain.dcf!.equityValue!).toBeCloseTo(40, 9);
    expect(hasGap(plain, "valuation.dcf.temporaryEquityAllocation")).toBe(false);
  });

  it("a refused temporary-equity operand withholds the per share and names the refusal", () => {
    const v = dcfOf({ temporaryEquity: { ...claims({}), refusal: "temporary-equity operand refused: temporaryEquity (two filings disagree)" } });
    expect(v.dcf!.perShare).toBeNull();
    expect(gapOf(v, "valuation.dcf.temporaryEquityAllocation")?.reason).toMatch(/two filings disagree/);
  });

  it("redeemable NCI with no profit key withholds the per share, exactly as book NCI does", () => {
    const redeemable = dcfOf({ minorityInterest: 0, temporaryEquity: claims({ redeemableNoncontrolling: 40 }) });
    expect(redeemable.dcf!.perShare).toBeNull();
    expect(hasGap(redeemable, "valuation.dcf.noncontrollingEarningsKey")).toBe(true);
    // Control: book NCI of the same size, no key.
    const book = dcfOf({ minorityInterest: 40 });
    expect(book.dcf!.perShare).toBeNull();
    expect(hasGap(book, "valuation.dcf.noncontrollingEarningsKey")).toBe(true);
  });

  it("a null book NCI beside a redeemable NCI stays withheld (E-5)", () => {
    const keyed = dcfOf({ minorityInterest: null, temporaryEquity: claims({ redeemableNoncontrolling: 40 }), noncontrollingEarnings: KEY });
    expect(keyed.dcf!.perShare).toBeNull();
    expect(gapOf(keyed, "valuation.dcf.noncontrollingEarningsKey")?.reason).toMatch(/redeemable noncontrolling interest of/);
    expect(gapOf(keyed, "valuation.dcf.noncontrollingEarningsKey")?.reason).toMatch(/E-5/);
    // The redeemable NCI is itself evidence of outside holders: withheld with no key and no NCI income too.
    const unkeyed = dcfOf({ minorityInterest: null, temporaryEquity: claims({ redeemableNoncontrolling: 40 }) });
    expect(unkeyed.dcf!.perShare).toBeNull();
    expect(gapOf(unkeyed, "valuation.dcf.noncontrollingEarningsKey")?.reason).toMatch(/redeemable noncontrolling interest of/);
    // Controls: a filed book of 10 beside the same 40 and key publishes; no redeemable NCI and no NCI income publishes as at main.
    expect(dcfOf({ minorityInterest: 10, temporaryEquity: claims({ redeemableNoncontrolling: 40 }), noncontrollingEarnings: KEY }).dcf!.perShare).not.toBeNull();
    const plain = dcfOf({ minorityInterest: null });
    expect(plain.dcf!.perShare).toBe(base.dcf!.perShare);
    expect(hasGap(plain, "valuation.dcf.noncontrollingEarningsKey")).toBe(false);
  });
});

describe("FIN-119: the bridge surfaces name the redeemable part", () => {
  it("the audit table and the bridge itself say which part of each line is temporary equity", () => {
    const v = valueOf({ minorityInterest: 10, temporaryEquity: claims({ redeemablePreferred: 50, redeemableNoncontrolling: 40 }), noncontrollingEarnings: KEY });
    const display = computeDcfDisplay(v, "USD")!;
    expect(display.bridge!.temporaryEquity).toEqual({ redeemablePreferred: 50, redeemableNoncontrolling: 40, unsplit: 0 });
    const labels = valuationAuditTables({ ...display, perShare: null } as never).find((t) => t.heading === "Enterprise value to equity bridge")!.rows.map((r) => r[0]);
    expect(labels).toContainEqual(expect.stringMatching(/^Less preferred equity \(includes .* of redeemable preferred and other temporary equity\)$/));
    expect(labels).toContainEqual(expect.stringMatching(/^Less minority interest .*\(includes .* of redeemable noncontrolling interests\)$/));
    // Control: a bridge with no temporary equity keeps the plain labels and carries no field.
    const plain = computeDcfDisplay(valueOf({ preferred: 50 }), "USD")!;
    expect(plain.bridge!.temporaryEquity).toBeUndefined();
    expect(valuationAuditTables({ ...plain, perShare: null } as never).find((t) => t.heading === "Enterprise value to equity bridge")!.rows.map((r) => r[0]))
      .toEqual(expect.arrayContaining(["Less preferred equity", "Less minority interest"]));
    expect(fixedBridgeNonOperatingText(v.dcf!.bridge, (x) => x.toFixed(2))).toBe("");
  });

  it("a withheld claim suppresses the fair value with its own reason", () => {
    const v = valueOf({ temporaryEquity: { ...claims({}), refusal: "temporary-equity operand refused: temporaryEquity (two filings disagree)" } });
    const gap = v.gaps.find((g) => g.field === "valuation.dcf.temporaryEquityAllocation");
    expect(gap).toBeDefined();
    expect(v.dcf!.perShare).toBeNull();
  });
});

describe("FIN-119: the enterprise values", () => {
  const evOf = (balance: Record<string, unknown>) =>
    valueOf({ multiples: { ...multiples, balance: { ...multiples.balance!, ...balance } } });

  it("the market EV adds the redeemable claims, exactly as permanent preferred does", () => {
    const base = evOf({});
    const temp = evOf({ temporaryEquityAttributableToParent: 1000 });
    const pref = evOf({ preferredStock: 1000 });
    expect(temp.multiples!.enterpriseValue.value).toBe(base.multiples!.enterpriseValue.value! + 1000);
    expect(temp.multiples!.enterpriseValue.value).toBe(pref.multiples!.enterpriseValue.value);
    const nci = evOf({ temporaryEquityAttributableToNoncontrollingInterest: 400, temporaryEquityAttributableToParent: 600, temporaryEquity: 1000 });
    expect(nci.multiples!.enterpriseValue.value).toBe(base.multiples!.enterpriseValue.value! + 1000);
    expect(temp.multiples!.enterpriseValue.basis).toMatch(/redeemable preferred and redeemable noncontrolling interest \(temporary equity\)/);
    expect(base.multiples!.enterpriseValue.basis).not.toMatch(/temporary equity/);
  });

  it("a refused temporary-equity operand withholds the EV and says so", () => {
    const refused = evOf({ temporaryEquity: 30, fieldConflicts: { temporaryEquity: { usable: false, reason: "two filings disagree" } } });
    expect(refused.multiples!.enterpriseValue.value).toBeNull();
    expect(gapOf(refused, "valuation.multiples.enterpriseValue.temporaryEquity")?.severity).toBe("warn");
    expect(gapOf(refused, "valuation.multiples.enterpriseValue.temporaryEquity")?.reason).toMatch(/two filings disagree/);
  });

  describe("own-history EV", () => {
    const dates = Array.from({ length: 12 }, (_, index) => `${2025 - Math.floor(index / 4)}-${["12-31", "09-30", "06-30", "03-31"][index % 4]}`);
    const history = (extra: Partial<QuarterlyFundamentalsRow>) => {
      const quarters: QuarterlyFundamentalsRow[] = dates.map((date) => ({ date, revenue: 25, operatingIncome: 5, depreciationAndAmortization: 1, netIncome: 4,
        operatingCashFlow: 6, capitalExpenditure: -1, totalStockholdersEquity: 100, totalDebt: 100, cashAndShortTermInvestments: 70, preferredStock: 0, minorityInterest: 0, ...extra }));
      return multiplesFramework("general", {
        quote: { price: 100, marketCap: 1000, currency: "USD" }, reportedCurrency: "USD",
        incomeTtm: { date: dates[0], revenue: 100, operatingIncome: 20, depreciationAndAmortization: 4, netIncome: 16, epsDiluted: 4 },
        cashFlowTtm: { date: dates[0], operatingCashFlow: 24, capitalExpenditure: -4, depreciationAndAmortization: 4 },
        balance: { date: dates[0], totalDebt: 100, cashAndShortTermInvestments: 70, totalStockholdersEquity: 100, goodwill: 0, intangibleAssets: 0, minorityInterest: 0, preferredStock: 0 },
        quarterlyFundamentals: quarters,
        enterpriseValuesHistory: dates.map((date) => ({ date, marketCapitalization: 1000, enterpriseValue: 1100 })),
      });
    };
    const evToSales = (result: ReturnType<typeof history>) => result.multiples.find((row) => row.key === "evToSales")?.ownHistory ?? null;

    it("adds each quarter's own redeemable claims to the historical EV", () => {
      expect(evToSales(history({}))?.p50).toBeCloseTo(10.3, 9); // (1000 + 30) / 100
      expect(evToSales(history({ temporaryEquityAttributableToParent: 200 }))?.p50).toBeCloseTo(12.3, 9);
      expect(evToSales(history({ preferredStock: 200 }))?.p50).toBeCloseTo(12.3, 9); // control: permanent preferred
    });

    it("drops the EV multiples for a quarter whose temporary equity is refused, keeping the equity multiples", () => {
      const refused = history({ temporaryEquity: 30, fieldConflicts: { temporaryEquity: { usable: false, reason: "two filings disagree" } } });
      expect(evToSales(refused)).toBeNull();
      expect(refused.multiples.find((row) => row.key === "priceToBook")?.ownHistory?.observations).toBeGreaterThanOrEqual(8);
    });
  });
});

describe("FIN-119: runStageB wiring", () => {
  const siblings = ["USD", "USD", "USD", "USD"] as const;
  function stageB(fields: Record<string, number> = {}, liabilitiesLess = 0, gaps: { field: string; reason: string; severity: "warn" | "info" }[] = []) {
    const b = completeCurrencyBundle({ debt: 100, siblingQuarterCurrencies: siblings });
    for (const key of ["balanceAnnual", "balanceQuarterly"] as const) {
      const member = b.statements[key];
      if (!member.ok) throw new Error("fixture has balances");
      for (const row of member.value.data.rows) {
        Object.assign(row, fields);
        row.totalLiabilities = (row.totalLiabilities ?? 0) - liabilitiesLess;
      }
    }
    b.gaps = gaps;
    return runStageB(b);
  }
  const dcf = (out: ReturnType<typeof stageB>) => {
    if (out.valuation.kind !== "dcf" || out.valuation.dcf === null) throw new Error("expected the DCF route");
    return out.valuation;
  };
  const bridgeGap = (v: ReturnType<typeof dcf>) => v.dcf!.enterpriseValue - v.dcf!.equityValue!;

  it("runStageB deducts filed temporary equity from DCF equity once", () => {
    const base = dcf(stageB());
    const temp = dcf(stageB({ temporaryEquityAttributableToParent: 1000 * M }, 1000 * M));
    const pref = dcf(stageB({ preferredStock: 1000 * M }, 1000 * M));
    expect(bridgeGap(temp) - bridgeGap(base)).toBeCloseTo(1000 * M, 0);
    expect(bridgeGap(temp)).toBeCloseTo(bridgeGap(pref), 0); // control: permanent preferred
    expect(temp.multiples!.enterpriseValue.value).toBe(base.multiples!.enterpriseValue.value! + 1000 * M);
  });

  it("temporary equity reaches the forecast-EPS and P/FCF ownership guards", () => {
    const eps = (out: ReturnType<typeof stageB>) => out.projections.series.find((s) => s.metric === "epsDiluted")!;
    const cashGap = (out: ReturnType<typeof stageB>) => out.gaps.some((g) => g.field === "valuation.multiples.priceToFcf.cashOwnership");
    const base = stageB();
    expect(eps(base).base.length).toBeGreaterThan(0);
    expect(cashGap(base)).toBe(false);
    for (const out of [stageB({ temporaryEquityAttributableToParent: 1000 * M }, 1000 * M), stageB({ preferredStock: 1000 * M }, 1000 * M)]) {
      expect(eps(out).base).toEqual([]);
      expect(eps(out).disclosures).toContainEqual(expect.objectContaining({ field: "projections.eps.ownershipScope" }));
      expect(cashGap(out)).toBe(true);
    }
  });

  describe("a withheld temporary-equity enrichment is unknown, not absent", () => {
    const UNKNOWN = "valuation.temporaryEquity.unknown";
    const withheld = (date: string, reason: string, field = "temporaryEquity") =>
      [{ field: `statements.balance.${date}.${field}`, reason: `temporary-equity SEC enrichment withheld: ${reason}`, severity: "warn" as const }];
    const CIK = "vendor issuer CIK is unknown or differs from companyfacts";

    it("keeps main's figures and says a claim may be missing", () => {
      const base = dcf(stageB());
      const out = dcf(stageB({}, 0, withheld("2026-03-31", CIK)));
      expect(out.dcf!.equityValue).toBe(base.dcf!.equityValue);
      expect(out.dcf!.perShare).toBe(base.dcf!.perShare);
      expect(out.multiples!.enterpriseValue.value).toBe(base.multiples!.enterpriseValue.value);
      const gap = gapOf(out, UNKNOWN);
      expect(gap?.severity).toBe("warn");
      expect(gap?.reason).toContain("2026-03-31");
      expect(gap?.reason).toMatch(/may be missing from the DCF bridge and the enterprise values/);
    });

    it("the SEC-silent refusal, an older date, a vendor/SEC conflict and no gap raise nothing", () => {
      const silent = "temporary carrying amounts are absent or explicitly refused for this SEC period";
      expect(gapOf(dcf(stageB({}, 0, withheld("2026-03-31", silent))), UNKNOWN)).toBeUndefined();
      expect(gapOf(dcf(stageB({}, 0, withheld("2025-12-31", CIK))), UNKNOWN)).toBeUndefined();
      expect(gapOf(dcf(stageB({}, 0, [{ field: "statements.balance.2026-03-31.temporaryEquity", reason: "temporary-equity vendor/SEC conflict for temporaryEquity: vendor observation preserved", severity: "warn" }])), UNKNOWN)).toBeUndefined();
      expect(gapOf(dcf(stageB()), UNKNOWN)).toBeUndefined();
    });

    it("a per-category withheld gap counts, and an observed vendor amount is deducted without the unknown gap", () => {
      const operands = "vendor A/L/permanent-equity operands are missing, conflicting, or do not match the temporary category's exact SEC filing scope";
      expect(gapOf(dcf(stageB({}, 0, withheld("2026-03-31", operands, "temporaryEquityAttributableToNoncontrollingInterest"))), UNKNOWN)).toBeDefined();
      const base = dcf(stageB());
      const observed = dcf(stageB({ temporaryEquity: 1000 * M }, 1000 * M, withheld("2026-03-31", CIK)));
      expect(gapOf(observed, UNKNOWN)).toBeUndefined();
      expect(bridgeGap(observed) - bridgeGap(base)).toBeCloseTo(1000 * M, 0);
    });
  });
});
