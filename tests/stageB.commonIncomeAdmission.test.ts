/** Synthetic accounting admission controls, not live issuer corrections. */
import { describe, expect, it } from "vitest";
import { computeRote, incomeAvailableToCommon, tangibleCommonEquity } from "@/pipeline/stageB/returns";
import { commonHolderCapital } from "@/pipeline/stageB/securityBasis";
import { parseStoredReport } from "@/report/history";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { buildSyntheticRouteBundle, runResearchRoutePanel } from "./helpers/researchRoutePanel";
import { M } from "./helpers/currencyBundle";
import { runStageB } from "@/pipeline/compute";

const balance = { totalStockholdersEquity: 1000, preferredStock: 25, minorityInterest: 0 };
const cases = [
  { label: "unpaid current entitlement", netIncome: 100, preferredDividendsPaid: -4, supportedOnlyWithCompleteBridge: 92 },
  { label: "cash including prior arrears", netIncome: 100, preferredDividendsPaid: -12, supportedOnlyWithCompleteBridge: 92 },
  { label: "accretion beside cash", netIncome: 100, preferredDividendsPaid: -8, supportedOnlyWithCompleteBridge: 90 },
  // ASC 260 Example 6: common 26000 cash + 9000 undistributed allocation.
  { label: "participating two-class securities", netIncome: 65000, preferredDividendsPaid: -27000, supportedOnlyWithCompleteBridge: 35000 },
];

describe("common earnings require earnings allocation rather than cash subtraction", () => {
  it.each(cases)("refuses $label without a filed common numerator or complete bridge", row => {
    expect(incomeAvailableToCommon({ ...row, date: "2025-12-31" }, 25)).toBeNull();
    expect(commonHolderCapital(row, balance).commonIncome).toBeNull();
  });
  it.each([94, 0, -5])("preserves filed common income %s without a second deduction", value => {
    const row = { netIncome: 100, preferredDividendsPaid: -4, netIncomeAvailableToCommon: value };
    expect(incomeAvailableToCommon({ ...row, date: "2025-12-31" }, 25)).toBe(value);
    expect(commonHolderCapital(row, { ...balance, minorityInterest: -3 }).commonIncome).toBe(value);
  });
  it.each([94, 0, -5])("retains and labels an admitted Basic-EPS common numerator %s", value => {
    const scope = { basis: "annual" as const, periodStart: "2025-01-01", periodEnd: "2025-12-31", allocationBasis: "basic-eps-common-stockholders" as const };
    const row = { date: "2025-12-31", netIncome: 100, netIncomeAvailableToCommon: value, preferredDividendsPaid: -4,
      incomeScope: scope, commonIncomeScope: scope };
    const selected = commonHolderCapital(row, balance);
    expect(selected.commonIncome).toBe(value);
    expect(selected.incomeBasis).toContain("Basic EPS");
    const rote = computeRote([row], [{ ...balance, date: row.date }]);
    expect(rote.latestRotePct).toBeCloseTo(value / 975 * 100, 10);
    expect(rote.notes.join(" ")).toContain("participating");
  });
  it.each([0, -5])("retains independently admitted common-equity earnings %s", value => {
    const scope = { basis: "annual" as const, periodStart: "2025-01-01", periodEnd: "2025-12-31", allocationBasis: "common-equity" as const };
    const selected = commonHolderCapital({ netIncome: 100, netIncomeAvailableToCommon: value,
      incomeScope: scope, commonIncomeScope: scope, netIncomeWithheldReason: "fallback ownership unknown" }, balance);
    expect(selected.commonIncome).toBe(value);
    expect(selected.incomeBasis).toContain("common-equity");
  });
  it.each([
    { periodStart: "2025-02-30", periodEnd: "2026-02-28" },
    { periodStart: "2024-03-02", periodEnd: "2025-02-30" },
    { periodEnd: "2025-02-30" },
  ])("refuses explicit invalid calendar dates rather than normalizing them: %j", dates => {
    const scope = { ...dates, basis: "annual" as const };
    expect(commonHolderCapital({ netIncome: 100, netIncomeAvailableToCommon: 94,
      incomeScope: scope, commonIncomeScope: scope }, balance).commonIncome).toBeNull();
  });
  it("keeps the admitted TCE arithmetic control at 287062", () => {
    expect(tangibleCommonEquity({ date: "2025-12-31", totalStockholdersEquity: 362438,
      preferredStock: 20045, goodwill: 52731, intangibleAssets: 2600 })).toBe(287062);
  });
  it("nonzero preferred cash establishes outside claims even at a zero closing balance", () => {
    const row = { netIncome: 100, preferredDividendsPaid: -4 };
    expect(incomeAvailableToCommon({ ...row, date: "2025-12-31" }, 0)).toBeNull();
    expect(commonHolderCapital(row, { ...balance, preferredStock: 0 }).commonIncome).toBeNull();
  });
  it("preserves signed NCI ownership safeguards", () => {
    expect(commonHolderCapital({ netIncome: 100 }, { ...balance, preferredStock: 0, minorityInterest: -3 }).commonIncome).toBeNull();
    expect(commonHolderCapital({ netIncome: 100, netIncomeOwnershipBasis: "consolidated", noncontrollingIncome: -3 },
      { ...balance, preferredStock: 0, minorityInterest: -3 }).commonIncome).toBe(103);
  });
  it.each([Infinity, -Infinity, NaN])("refuses a nonfinite NCI allocation %s before arithmetic", allocation => {
    expect(commonHolderCapital({ netIncome: 100, netIncomeOwnershipBasis: "consolidated", noncontrollingIncome: allocation },
      { ...balance, preferredStock: 0, minorityInterest: 0 }).commonIncome).toBeNull();
  });
  it.each([3, -3])("refuses known signed NCI income %s with unknown ownership even at zero closing equity", allocation => {
    expect(commonHolderCapital({ netIncome: 100, noncontrollingIncome: allocation },
      { ...balance, preferredStock: 0, minorityInterest: 0 }).commonIncome).toBeNull();
  });
  it("a zero closing preferred balance cannot erase opening exposure", () => {
    const r = computeRote([{ date: "2025-12-31", netIncome: 100, preferredDividendsPaid: 0 }], [
      { date: "2025-12-31", totalStockholdersEquity: 1000, preferredStock: 0 },
      { date: "2024-12-31", totalStockholdersEquity: 900, preferredStock: 25 },
    ]);
    expect(r.latestRotePct).toBeNull();
  });
});

function bank(mode: "cash" | "scope-start" | "scope-end" | "scope-currency" | "clean" = "cash", cashEndOffset = false) {
  const bundle = buildSyntheticRouteBundle("bank");
  for (const member of [bundle.statements.incomeQuarterly, bundle.statements.balanceQuarterly, bundle.statements.cashflowQuarterly]) {
    if (!member.ok) throw new Error("synthetic rows required");
    member.value.data.rows = [];
  }
  if (!bundle.statements.incomeAnnual.ok || !bundle.statements.cashflowAnnual.ok) throw new Error("synthetic rows required");
  for (const row of bundle.statements.incomeAnnual.value.data.rows) {
    row.periodStart = `${String(row.date).slice(0, 4)}-01-01`;
    delete row.epsDiluted; // Test capitalization/common-income P/E, not independent price/EPS.
    if (mode === "cash") delete row.netIncomeAvailableToCommon;
    if (mode.startsWith("scope")) {
      const year = String(row.date).slice(0, 4);
      row.fieldProvenance = { ...row.fieldProvenance, netIncomeAvailableToCommon: {
        source: "edgar", unit: mode === "scope-currency" ? "CAD" : "USD",
        periodStart: `${year}-${mode === "scope-start" ? "07" : "01"}-01`,
        periodEnd: mode === "scope-end" ? `${year}-12-20` : String(row.date),
        observedAt: bundle.builtAt, tags: ["us-gaap/NetIncomeLossAvailableToCommonStockholdersBasic"], filings: [],
      } };
    }
  }
  for (const row of bundle.statements.cashflowAnnual.value.data.rows) {
    row.preferredDividendsPaid = -4 * M;
    row.periodStart = `${String(row.date).slice(0, 4)}-07-01`;
    if (cashEndOffset) row.date = `${String(row.date).slice(0, 4)}-12-28`;
  }
  return bundle;
}

describe("common earnings admission through Stage B and report surfaces", () => {
  it.each(["contiguous", "nearby-display", "unknown-start", "duplicate", "duplicate-end", "overlap", "gap", "currency", "net-income-fallback"] as const)("TTM checks actual ordered quarter coverage (%s)", mode => {
    const bundle = buildSyntheticRouteBundle("bank");
    if (!bundle.statements.incomeQuarterly.ok) throw new Error("synthetic rows required");
    const rows = bundle.statements.incomeQuarterly.value.data.rows;
    const intervals = rows.slice(0, 4).map(row => {
      const end = new Date(`${String(row.date)}T00:00:00Z`);
      return { periodStart: new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 2, 1)).toISOString().slice(0, 10), periodEnd: String(row.date) };
    });
    if (mode === "duplicate" || mode === "duplicate-end" || mode === "net-income-fallback") intervals[1] = { ...intervals[2]! };
    if (mode === "overlap" || mode === "gap") {
      intervals[1]!.periodStart = new Date(Date.parse(intervals[1]!.periodStart) + (mode === "overlap" ? -7 : 7) * 86_400_000).toISOString().slice(0, 10);
    }
    for (let i = 0; i < 4; i++) {
      const row = rows[i]!;
      delete row.epsDiluted;
      row.netIncomeAvailableToCommon = 40 * M;
      const scope = { ...intervals[i]!, source: "edgar" as const, unit: mode === "currency" && i === 1 ? "CAD" : "USD", observedAt: bundle.builtAt,
        tags: ["us-gaap/NetIncomeLossAvailableToCommonStockholdersBasic"], filings: [] };
      if (mode === "unknown-start" || mode === "duplicate-end") delete (scope as { periodStart?: string }).periodStart;
      row.fieldProvenance = { netIncome: scope, netIncomeAvailableToCommon: scope };
      if (mode === "nearby-display") row.date = new Date(Date.parse(String(row.date)) + 3 * 86_400_000).toISOString().slice(0, 10);
    }
    if (mode === "net-income-fallback") {
      for (const member of [bundle.statements.incomeAnnual, bundle.statements.incomeQuarterly]) {
        if (!member.ok) throw new Error("synthetic rows required");
        for (const row of member.value.data.rows) delete row.netIncomeAvailableToCommon;
      }
      for (const member of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) {
        if (!member.ok) throw new Error("synthetic rows required");
        for (const row of member.value.data.rows) row.preferredStock = 0;
      }
    }
    const computed = runStageB(bundle);
    const pe = computed.valuation.multiples?.multiples.find(row => row.key === "peTtm");
    if (["contiguous", "nearby-display", "unknown-start"].includes(mode)) expect(pe?.current).toBeCloseTo(62.5, 10);
    else expect(pe?.current).toBeNull();
  });
  it("rejects equal known six-month intervals mislabeled as annual, even beside unknown cash starts", () => {
    const bundle = bank("scope-start");
    if (!bundle.statements.incomeAnnual.ok || !bundle.statements.cashflowAnnual.ok) throw new Error("synthetic rows required");
    for (const row of bundle.statements.incomeAnnual.value.data.rows) row.periodStart = `${String(row.date).slice(0, 4)}-07-01`;
    for (const row of bundle.statements.cashflowAnnual.value.data.rows) delete row.periodStart;
    const result = runStageB(bundle);
    expect(result.returns.rote.latestRotePct).toBeNull();
    if (result.valuation.kind !== "excess-return") throw new Error("bank route expected");
    expect(result.valuation.excessReturn.payoutRatioPct.value).toBeNull();
    expect(result.valuation.excessReturn.perShare).toBeNull();
  });
  it.each(["complete", "negative", "parent", "missing", "mixed", "filed-common", "unknown", "unknown-no-allocation"] as const)("TTM preserves coherent consolidated signed NCI scope (%s)", mode => {
    const bundle = buildSyntheticRouteBundle("bank");
    for (const member of [bundle.statements.incomeAnnual, bundle.statements.incomeQuarterly]) {
      if (!member.ok) throw new Error("synthetic rows required");
      for (const row of member.value.data.rows) {
        delete row.netIncomeAvailableToCommon; delete row.epsDiluted;
        row.netIncomeOwnershipBasis = mode === "parent" ? "parent" : "consolidated";
        row.netIncomeAttributableToNoncontrollingInterest = (mode === "negative" ? -3 : 3) * M;
        if (mode.startsWith("unknown")) delete row.netIncomeOwnershipBasis;
        if (mode === "unknown-no-allocation") delete row.netIncomeAttributableToNoncontrollingInterest;
        if (mode === "filed-common") row.netIncomeAvailableToCommon = 40 * M;
      }
    }
    for (const member of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) {
      if (!member.ok) throw new Error("synthetic rows required");
      for (const row of member.value.data.rows) { row.preferredStock = 0; row.minorityInterest = 0; }
    }
    if (!bundle.statements.incomeQuarterly.ok) throw new Error("synthetic rows required");
    if (mode === "missing") delete bundle.statements.incomeQuarterly.value.data.rows[1]!.netIncomeAttributableToNoncontrollingInterest;
    if (mode === "mixed") bundle.statements.incomeQuarterly.value.data.rows[1]!.netIncomeOwnershipBasis = "parent";
    if (mode === "filed-common") delete bundle.statements.incomeQuarterly.value.data.rows[1]!.netIncomeAttributableToNoncontrollingInterest;
    const computed = runStageB(bundle);
    const pe = computed.valuation.multiples?.multiples.find(row => row.key === "peTtm");
    if (mode === "complete") expect(pe?.current).toBeCloseTo(10_000 / 168, 10);
    else if (mode === "negative") expect(pe?.current).toBeCloseTo(10_000 / 192, 10);
    else if (mode === "parent" || mode === "unknown-no-allocation") expect(pe?.current).toBeCloseTo(10_000 / 180, 10);
    else if (mode === "filed-common") expect(pe?.current).toBeCloseTo(10_000 / 160, 10);
    else expect(pe?.current).toBeNull();
  });
  it.each(["partial", "currency"] as const)("partial TTM preferred cash still establishes claims (%s)", mode => {
    const bundle = buildSyntheticRouteBundle("bank");
    for (const member of [bundle.statements.incomeAnnual, bundle.statements.incomeQuarterly]) {
      if (!member.ok) throw new Error("synthetic rows required");
      for (const row of member.value.data.rows) { delete row.netIncomeAvailableToCommon; delete row.epsDiluted; }
    }
    for (const member of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) {
      if (!member.ok) throw new Error("synthetic rows required");
      for (const row of member.value.data.rows) row.preferredStock = 0;
    }
    if (!bundle.statements.cashflowQuarterly.ok) throw new Error("synthetic rows required");
    const cash = bundle.statements.cashflowQuarterly.value.data.rows[0]!;
    cash.preferredDividendsPaid = -4 * M;
    if (mode === "currency") cash.reportedCurrency = "CAD";
    const computed = runStageB(bundle);
    expect(computed.valuation.multiples?.multiples.find(row => row.key === "peTtm")?.current).toBeNull();
  });
  it("incompatible cash currency cannot erase preferred exposure at a zero closing balance", () => {
    const bundle = bank("cash");
    for (const member of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) {
      if (!member.ok) throw new Error("synthetic rows required");
      for (const row of member.value.data.rows) row.preferredStock = 0;
    }
    if (!bundle.statements.cashflowAnnual.ok) throw new Error("synthetic rows required");
    for (const row of bundle.statements.cashflowAnnual.value.data.rows) row.reportedCurrency = "CAD";
    expect(runStageB(bundle).returns.rote.latestRotePct).toBeNull();
  });
  it.each([false, true])("does not join annual income to stub cash (nearby end: %s)", nearby => {
    const bundle = bank("cash", nearby);
    const { computed, report, surfaces } = runResearchRoutePanel(bundle);
    expect(computed.returns.rote.latestRotePct).toBeNull();
    expect(computed.returns.rote.latestTangibleCommonEquity).toBe(400 * M);
    if (computed.valuation.kind !== "excess-return") throw new Error("bank route expected");
    expect(computed.valuation.excessReturn).toMatchObject({ equityValue: null, perShare: null, payoutRatioPct: { value: null }, impliedPToBv: null });
    expect(computed.valuation.multiples.multiples.find(row => row.key === "peTtm")?.current).toBeNull();
    expect(report.fairValue).toMatchObject({ status: "suppressed", perShare: null });
    expect(parseStoredReport(JSON.stringify(report))?.fairValue?.perShare).toBeNull();
    for (const surface of [...Object.values(surfaces), reportToAuditMarkdown(report)]) expect(surface).toMatch(/common.*earnings|earnings.*common/i);
    expect(bundle.statements.cashflowAnnual.ok && bundle.statements.cashflowAnnual.value.data.rows[0]?.preferredDividendsPaid).toBe(-4 * M);
  });
  it.each(["scope-start", "scope-end", "scope-currency"] as const)("refuses incompatible filed common %s", mode => {
    const { computed } = runResearchRoutePanel(bank(mode));
    expect(computed.returns.rote.latestRotePct).toBeNull();
    if (computed.valuation.kind !== "excess-return") throw new Error("bank route expected");
    expect(computed.valuation.excessReturn.perShare).toBeNull();
    expect(computed.valuation.excessReturn.payoutRatioPct.value).toBeNull();
  });
  it("retains sourced annual common income when vendor flow start is unavailable", () => {
    const bundle = bank("clean");
    if (!bundle.statements.incomeAnnual.ok || !bundle.statements.cashflowAnnual.ok) throw new Error("synthetic rows required");
    for (const row of bundle.statements.incomeAnnual.value.data.rows) delete row.periodStart;
    for (const row of bundle.statements.cashflowAnnual.value.data.rows) delete row.periodStart;
    const { computed } = runResearchRoutePanel(bundle);
    expect(computed.returns.rote.latestRotePct).toBeCloseTo(140 / 375 * 100, 10);
    if (computed.valuation.kind !== "excess-return") throw new Error("bank route expected");
    expect(computed.valuation.excessReturn.payoutRatioPct.value).toBeCloseTo(34.71611721611722, 10);
  });
  it("retains supported ROTE but refuses payout paired to an explicit stub cash interval", () => {
    const { computed } = runResearchRoutePanel(bank("clean"));
    expect(computed.returns.rote.latestRotePct).toBeCloseTo(140 / 375 * 100, 10);
    if (computed.valuation.kind !== "excess-return") throw new Error("bank route expected");
    expect(computed.valuation.excessReturn.payoutRatioPct.value).toBeNull();
    expect(computed.valuation.excessReturn.perShare).toBeNull();
  });
  it("accepts nearby display dates only when field evidence establishes the same flow interval", () => {
    const bundle = bank("clean", true);
    if (!bundle.statements.incomeAnnual.ok || !bundle.statements.cashflowAnnual.ok) throw new Error("synthetic rows required");
    for (const row of bundle.statements.incomeAnnual.value.data.rows) {
      const year = String(row.date).slice(0, 4);
      const evidence = { source: "edgar" as const, unit: "USD", periodStart: `${year}-01-01`, periodEnd: `${year}-12-28`,
        observedAt: bundle.builtAt, tags: ["us-gaap/NetIncomeLossAvailableToCommonStockholdersBasic"], filings: [] };
      row.periodStart = `${year}-01-01`;
      row.fieldProvenance = { netIncome: evidence, netIncomeAvailableToCommon: evidence };
    }
    for (const row of bundle.statements.cashflowAnnual.value.data.rows) row.periodStart = `${String(row.date).slice(0, 4)}-01-01`;
    const { computed } = runResearchRoutePanel(bundle);
    expect(computed.returns.rote.latestRotePct).toBeCloseTo(140 / 375 * 100, 10);
    expect(computed.returns.rote.notes.join(" ")).toContain("Basic EPS");
    expect(computed.returns.rote.notes.join(" ")).toContain("participating");
    if (computed.valuation.kind !== "excess-return") throw new Error("bank route expected");
    expect(computed.valuation.excessReturn.payoutRatioPct.value).toBeCloseTo(34.71611721611722, 10);
  });
  it("preserves 52/53-week sourced annual intervals", () => {
    const bundle = bank("clean");
    const dates: Record<string, [string, string]> = {
      "2025": ["2024-09-29", "2025-09-27"], "2024": ["2023-09-24", "2024-09-28"],
      "2023": ["2022-09-25", "2023-09-23"], "2022": ["2021-09-26", "2022-09-24"],
    };
    for (const member of [bundle.statements.incomeAnnual, bundle.statements.cashflowAnnual, bundle.statements.balanceAnnual]) {
      if (!member.ok) throw new Error("synthetic rows required");
      for (const row of member.value.data.rows) {
        const [start, end] = dates[String(row.date).slice(0, 4)]!;
        row.date = end;
        if (member !== bundle.statements.balanceAnnual) row.periodStart = start;
      }
    }
    const { computed } = runResearchRoutePanel(bundle);
    expect(computed.returns.rote.latestRotePct).toBeCloseTo(140 / 375 * 100, 10);
    if (computed.valuation.kind !== "excess-return") throw new Error("bank route expected");
    expect(computed.valuation.excessReturn.payoutRatioPct.value).toBeCloseTo(34.71611721611722, 10);
  });
});
