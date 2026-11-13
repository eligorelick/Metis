/**
 * D-240 (P5, P1): the trailing-twelve-month net income behind free-cash-flow conversion.
 *
 * The current-capital block divides consolidated cash flow by consolidated profit (D-212) and showed no net income
 * for an issuer whose quarterly rows never said "consolidated": every issuer without noncontrolling interests. The
 * filings settle it for an issuer that reports one profit line. Figures below are the SEC XBRL facts of the named
 * filings; the fixture issuer at the end is synthetic.
 */
import { describe, expect, it } from "vitest";
import { filedWindowFlow } from "@/edgar/financialEnrichment";
import type { CompanyFacts } from "@/edgar/xbrl";
import { runStageB } from "@/pipeline/compute";
import { filedSingleProfitWindow } from "@/pipeline/nciEarnings";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

interface Filing { accn: string; form: string; filed: string }
type Fact = [tag: string, start: string | null, end: string, val: number, filing: Filing];

function facts(rows: readonly Fact[], unit = "USD"): CompanyFacts {
  const usGaap: Record<string, { units: Record<string, object[]> }> = {};
  for (const [tag, start, end, val, filing] of rows) {
    (usGaap[tag] ??= { units: { [unit]: [] } }).units[unit]!.push({ ...(start ? { start } : {}), end, val, ...filing });
  }
  return { cik: 42, entityName: "FILER", facts: { "us-gaap": usGaap } };
}
const LATE = "2026-11-12T00:00:00.000Z";

// Amazon: 10-K 0001018724-26-000004 (fiscal 2025) and 10-Q 0001018724-26-000026 (June 2026), which also tags its
// own twelve-month column.
const AMZN_K: Filing = { accn: "0001018724-26-000004", form: "10-K", filed: "2026-02-06" };
const AMZN_Q: Filing = { accn: "0001018724-26-000026", form: "10-Q", filed: "2026-07-31" };
const AMZN: Fact[] = [
  ["NetIncomeLoss", "2025-01-01", "2025-12-31", 77_670 * M, AMZN_K],
  ["NetIncomeLoss", "2026-01-01", "2026-06-30", 92_902 * M, AMZN_Q],
  ["NetIncomeLoss", "2026-04-01", "2026-06-30", 62_647 * M, AMZN_Q],
  ["NetIncomeLoss", "2025-01-01", "2025-06-30", 35_291 * M, AMZN_Q],
  ["NetIncomeLoss", "2025-07-01", "2026-06-30", 135_281 * M, AMZN_Q],
];
// NVIDIA, a 52/53-week filer: 10-K 0001045810-26-000021 and 10-Q 0001045810-26-000075.
const NVDA_K: Filing = { accn: "0001045810-26-000021", form: "10-K", filed: "2026-02-25" };
const NVDA_Q: Filing = { accn: "0001045810-26-000075", form: "10-Q", filed: "2026-08-26" };
const NVDA: Fact[] = [
  ["NetIncomeLoss", "2025-01-27", "2026-01-25", 120_067 * M, NVDA_K],
  ["NetIncomeLoss", "2026-01-26", "2026-07-26", 118_010 * M, NVDA_Q],
  ["NetIncomeLoss", "2025-01-27", "2025-07-27", 45_197 * M, NVDA_Q],
];
// Micron: the trailing window that ends with the 10-K 0000723125-26-000023 is the 53-week fiscal year itself.
const MU_K: Filing = { accn: "0000723125-26-000023", form: "10-K", filed: "2026-10-09" };
const MU: Fact[] = [
  ["NetIncomeLoss", "2025-08-29", "2026-09-03", 84_969 * M, MU_K],
  ["NetIncomeLoss", "2024-08-30", "2025-08-28", 8_539 * M, MU_K],
];
// Viking Therapeutics, a loss-maker that tags its net loss on both lines: 10-K 0001193125-26-046876 and 10-Q
// 0001193125-26-436432.
const VKTX_K: Filing = { accn: "0001193125-26-046876", form: "10-K", filed: "2026-02-11" };
const VKTX_Q: Filing = { accn: "0001193125-26-436432", form: "10-Q", filed: "2026-10-29" };
const VKTX: Fact[] = (["NetIncomeLoss", "ProfitLoss"] as const).flatMap((tag): Fact[] => [
  [tag, "2025-01-01", "2025-12-31", -359_639_000, VKTX_K],
  [tag, "2026-01-01", "2026-09-30", -469_533_000, VKTX_Q],
  [tag, "2025-01-01", "2025-09-30", -201_977_000, VKTX_Q],
]);
// Duke Energy has noncontrolling interests: 10-K 0001326160-26-000014 and 10-Q 0001326160-26-000051.
const DUK_K: Filing = { accn: "0001326160-26-000014", form: "10-K", filed: "2026-02-26" };
const DUK_Q: Filing = { accn: "0001326160-26-000051", form: "10-Q", filed: "2026-11-05" };
const DUK_PARENT: Fact[] = [
  ["NetIncomeLoss", "2025-01-01", "2025-12-31", 4_968 * M, DUK_K],
  ["NetIncomeLoss", "2026-01-01", "2026-09-30", 4_207 * M, DUK_Q],
  ["NetIncomeLoss", "2025-01-01", "2025-09-30", 3_784 * M, DUK_Q],
];
const DUK: Fact[] = [...DUK_PARENT,
  ["ProfitLoss", "2025-01-01", "2025-12-31", 5_071 * M, DUK_K],
  ["ProfitLoss", "2026-01-01", "2026-09-30", 4_372 * M, DUK_Q],
  ["ProfitLoss", "2025-01-01", "2025-09-30", 3_865 * M, DUK_Q],
  ["NetIncomeLossAttributableToNoncontrollingInterest", "2025-01-01", "2025-12-31", 103 * M, DUK_K],
  ["NetIncomeLossAttributableToNoncontrollingInterest", "2026-01-01", "2026-09-30", 165 * M, DUK_Q],
  ["NetIncomeLossAttributableToNoncontrollingInterest", "2025-01-01", "2025-09-30", 81 * M, DUK_Q],
];

describe("a filed flow for one exact trailing window (P1)", () => {
  it("is fiscal year + current year to date - prior-year year to date, each operand kept", () => {
    const flow = filedWindowFlow(facts(NVDA), "NetIncomeLoss", "USD", "2025-07-28", "2026-07-26", LATE);
    expect(flow).toMatchObject({ value: 192_880 * M, start: "2025-07-28", end: "2026-07-26", tag: "NetIncomeLoss",
      operands: [120_067 * M, 118_010 * M, 45_197 * M] });
    expect(flow!.points.map(p => p.accn)).toEqual([NVDA_K.accn, NVDA_Q.accn, NVDA_Q.accn]);
    expect(flow!.reason).toContain("TTM net income (NetIncomeLoss) = filed fiscal year 120067000000 + current YTD 118010000000 - prior-year YTD 45197000000 = 192880000000 USD through 2026-07-26");
  });
  it("is the fiscal year's own figure only when the window is that fiscal year, start and end", () => {
    const flow = filedWindowFlow(facts(MU), "NetIncomeLoss", "USD", "2025-08-29", "2026-09-03", LATE);
    expect(flow).toMatchObject({ value: 84_969 * M, operands: [84_969 * M], start: "2025-08-29", end: "2026-09-03" });
    expect(flow!.points).toHaveLength(1);
    expect(flow!.reason).toContain("the figure filed for exactly 2025-08-29 through 2026-09-03 in 10-K 0000723125-26-000023");
    // Annual never stands in for TTM: one day off, at either end, is another window.
    expect(filedWindowFlow(facts(MU), "NetIncomeLoss", "USD", "2025-08-30", "2026-09-03", LATE)).toBeNull();
    expect(filedWindowFlow(facts(MU), "NetIncomeLoss", "USD", "2025-08-29", "2026-09-02", LATE)).toBeNull();
    expect(filedWindowFlow(facts(MU), "NetIncomeLoss", "USD", "2025-09-01", "2026-08-31", LATE)).toBeNull();
  });
  it("accepts a filer's own twelve-month column only when it equals the identity", () => {
    expect(filedWindowFlow(facts(AMZN), "NetIncomeLoss", "USD", "2025-07-01", "2026-06-30", LATE)).toMatchObject({ value: 135_281 * M, operands: [77_670 * M, 92_902 * M, 35_291 * M] });
    const disagreeing = AMZN.map((f): Fact => f[1] === "2025-07-01" ? [f[0], f[1], f[2], 135_300 * M, f[4]] : f);
    expect(filedWindowFlow(facts(disagreeing), "NetIncomeLoss", "USD", "2025-07-01", "2026-06-30", LATE)).toBeNull();
  });
  it("establishes nothing from an identity that starts on another day, two stated values, another unit or a later filing", () => {
    expect(filedWindowFlow(facts(NVDA), "NetIncomeLoss", "USD", "2025-08-01", "2026-07-26", LATE)).toBeNull();
    expect(filedWindowFlow(facts([...MU, ["NetIncomeLoss", "2025-08-29", "2026-09-03", 84_000 * M, MU_K]]), "NetIncomeLoss", "USD", "2025-08-29", "2026-09-03", LATE)).toBeNull();
    expect(filedWindowFlow(facts(NVDA, "EUR"), "NetIncomeLoss", "USD", "2025-07-28", "2026-07-26", LATE)).toBeNull();
    // P2: the 10-Q was filed 2026-08-26; a report built the day before cannot use it.
    expect(filedWindowFlow(facts(NVDA), "NetIncomeLoss", "USD", "2025-07-28", "2026-07-26", "2026-08-25T23:59:59.000Z")).toBeNull();
    // The prior-year year to date must come from the same 10-Q as the current one (the owner's rule).
    const splitFilings = NVDA.map((f): Fact => f[2] === "2025-07-27" ? [f[0], f[1], f[2], f[3], { accn: "0001045810-25-000209", form: "10-Q", filed: "2025-08-27" }] : f);
    expect(filedWindowFlow(facts(splitFilings), "NetIncomeLoss", "USD", "2025-07-28", "2026-07-26", LATE)).toBeNull();
  });
});

describe("the consolidated profit of an issuer whose filings state one profit line (P5)", () => {
  it("Amazon: net income is the only profit line of the 10-K and the 10-Q", () => {
    const profit = filedSingleProfitWindow(facts(AMZN), "USD", "2025-07-01", "2026-06-30", LATE);
    expect(profit?.value).toBe(135_281 * M);
    expect(profit!.reason).toContain("state no separate consolidated profit, and no earnings or balance of noncontrolling interests, so this net income is the consolidated profit.");
  });
  it("NVIDIA and Micron: a 52/53-week year-to-date identity and a window that is the fiscal year", () => {
    expect(filedSingleProfitWindow(facts(NVDA), "USD", "2025-07-28", "2026-07-26", LATE)?.value).toBe(192_880 * M);
    const micron = filedSingleProfitWindow(facts(MU), "USD", "2025-08-29", "2026-09-03", LATE);
    expect(micron?.value).toBe(84_969 * M);
    expect(micron!.reason).toContain("The filings that state this figure state no separate consolidated profit");
  });
  it("Viking: a consolidated profit tagged equal to net income for every period is the same line (a loss)", () => {
    const profit = filedSingleProfitWindow(facts(VKTX), "USD", "2025-10-01", "2026-09-30", LATE);
    expect(profit?.value).toBe(-627_195_000);
    expect(profit!.reason).toContain("state a consolidated profit equal to this net income for every period they report it");
  });
  it("Duke Energy: an issuer with a noncontrolling allocation is not decided here", () => {
    expect(filedWindowFlow(facts(DUK), "NetIncomeLoss", "USD", "2025-10-01", "2026-09-30", LATE)?.value).toBe(5_391 * M);
    expect(filedWindowFlow(facts(DUK), "ProfitLoss", "USD", "2025-10-01", "2026-09-30", LATE)?.value).toBe(5_578 * M);
    expect(filedSingleProfitWindow(facts(DUK), "USD", "2025-10-01", "2026-09-30", LATE)).toBeNull();
  });
  it.each<[string, Fact]>([
    ["earnings attributable to noncontrolling interests", ["NetIncomeLossAttributableToNoncontrollingInterest", "2026-01-01", "2026-09-30", 165 * M, DUK_Q]],
    ["the nonredeemable part of those earnings", ["NetIncomeLossAttributableToNonredeemableNoncontrollingInterest", "2025-01-01", "2025-12-31", 7 * M, DUK_K]],
    ["a consolidated profit that differs for a comparative period", ["ProfitLoss", "2024-01-01", "2024-12-31", 4_614 * M, DUK_K]],
    ["a noncontrolling balance", ["MinorityInterest", null, "2026-09-30", 2_165 * M, DUK_Q]],
    ["a redeemable noncontrolling balance", ["RedeemableNoncontrollingInterestEquityCarryingAmount", null, "2025-12-31", 40 * M, DUK_K]],
  ])("withholds beside %s in one of the filings used", (_name, extra) => {
    expect(filedSingleProfitWindow(facts(DUK_PARENT), "USD", "2025-10-01", "2026-09-30", LATE)?.value).toBe(5_391 * M);
    expect(filedSingleProfitWindow(facts([...DUK_PARENT, extra]), "USD", "2025-10-01", "2026-09-30", LATE)).toBeNull();
  });
  it("withholds when total equity and the parent's equity differ at one date (a noncontrolling column tagged only as a dimension)", () => {
    const equity = (total: number): Fact[] => [...DUK_PARENT,
      ["StockholdersEquity", null, "2026-09-30", 51_000 * M, DUK_Q],
      ["StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", null, "2026-09-30", total * M, DUK_Q]];
    expect(filedSingleProfitWindow(facts(equity(51_000)), "USD", "2025-10-01", "2026-09-30", LATE)?.value).toBe(5_391 * M);
    expect(filedSingleProfitWindow(facts(equity(53_165)), "USD", "2025-10-01", "2026-09-30", LATE)).toBeNull();
  });
  it("reads the filings used, not the issuer's history: a tagged zero or an allocation in an older filing does not withhold", () => {
    const older: Filing = { accn: "0000723125-22-000048", form: "10-K", filed: "2022-10-07" };
    expect(filedSingleProfitWindow(facts([...MU,
      ["NetIncomeLossAttributableToNoncontrollingInterest", "2025-08-29", "2026-09-03", 0, MU_K],
      ["NetIncomeLossAttributableToNoncontrollingInterest", "2021-09-03", "2022-09-01", 3 * M, older],
      ["ProfitLoss", "2021-09-03", "2022-09-01", 8_690 * M, older],
    ]), "USD", "2025-08-29", "2026-09-03", LATE)?.value).toBe(84_969 * M);
  });
});

describe("free-cash-flow conversion on the filed consolidated window (Stage B)", () => {
  // The fixture's quarters each earn 45, the quarter before them 36: fiscal 2025 = 171, and the twelve months to
  // 2026-03-31 = 171 + 45 - 36 = 180.
  const K: Filing = { accn: "0000000042-26-000001", form: "10-K", filed: "2026-02-10" };
  const Q: Filing = { accn: "0000000042-26-000002", form: "10-Q", filed: "2026-05-01" };
  const single = (fiscalYear = 171): Fact[] => [
    ["NetIncomeLoss", "2025-01-01", "2025-12-31", fiscalYear * M, K],
    ["NetIncomeLoss", "2026-01-01", "2026-03-31", 45 * M, Q],
    ["NetIncomeLoss", "2025-01-01", "2025-03-31", 36 * M, Q],
  ];
  const run = (rows: readonly Fact[] | null, confirmed = true, edit: (b: ReturnType<typeof completeCurrencyBundle>) => void = () => {}) => {
    const bundle = completeCurrencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    edit(bundle);
    return runStageB(rows === null ? bundle : withIssuerFacts(bundle, facts(rows), confirmed));
  };
  const WITHHELD = "Consolidated FCF conversion is withheld because a complete consolidated earnings window is not established";

  it("shows the filed net income, its operands and the conversion built on it", () => {
    const computed = run(single());
    const current = computed.capital.current!;
    expect(current).toMatchObject({ basis: "ttm", periodStart: "2025-04-01", asOf: "2026-03-31", netIncome: 180 * M });
    expect(current.fcfConversionBeforeSbc).toBe(current.cashBridge.standardizedFcf! / (180 * M));
    expect(current.filedCashFlows?.netIncome).toMatchObject({ value: 180 * M, start: "2025-04-01", end: "2026-03-31", tag: "NetIncomeLoss", operands: [171 * M, 45 * M, 36 * M] });
    expect(current.cashBridge.definition).toContain("FCF conversion divides by net income for this same window, taken from the filings. TTM net income (NetIncomeLoss) = filed fiscal year 171000000 + current YTD 45000000 - prior-year YTD 36000000 = 180000000 USD through 2026-03-31.");
    expect(current.cashBridge.definition).not.toContain(WITHHELD);
    expect(computed.gaps.filter(gap => gap.field === "compute.ttmIncome.filedNetIncome")).toHaveLength(1);
  });
  it("stays withheld without filings, with an unconfirmed issuer, or beside a noncontrolling allocation", () => {
    const allocation: Fact[] = [...single(),
      ["ProfitLoss", "2025-01-01", "2025-12-31", 180 * M, K], ["NetIncomeLossAttributableToNoncontrollingInterest", "2025-01-01", "2025-12-31", 9 * M, K]];
    for (const computed of [run(null), run(single(), false), run(allocation)]) {
      const current = computed.capital.current!;
      expect(current.cashBridge.standardizedFcf).not.toBeNull();
      expect(current.netIncome).toBeNull();
      expect(current.fcfConversionBeforeSbc).toBeNull();
      expect(current.filedCashFlows?.netIncome).toBeUndefined();
      expect(current.cashBridge.definition).toContain(WITHHELD);
      expect(computed.gaps.some(gap => gap.field === "compute.ttmIncome.filedNetIncome")).toBe(false);
    }
  });
  it("stays withheld when the filed window is not the report's own trailing net income (P8) or that net income is refused (P11)", () => {
    // Filed 271 + 45 - 36 = 280 against the report's 180: two observations, not one.
    expect(run(single(271)).capital.current!.netIncome).toBeNull();
    const refused = run(single(), true, bundle => {
      if (!bundle.statements.incomeQuarterly.ok) throw Error("fixture");
      const row = bundle.statements.incomeQuarterly.value.data.rows[1]!;
      row.fieldConflicts = { netIncome: { usable: false, vendorValue: 45 * M, secValue: null, reason: "Independent earnings refusal" } };
      delete row.netIncome;
    });
    expect(refused.capital.current!.netIncome).toBeNull();
    expect(refused.capital.current!.cashBridge.definition).toContain(WITHHELD);
  });
  it("leaves an established consolidated window as it was (D-212)", () => {
    const computed = run(single(), true, bundle => {
      if (!bundle.statements.incomeQuarterly.ok) throw Error("fixture");
      for (const row of bundle.statements.incomeQuarterly.value.data.rows.slice(0, 4)) row.netIncomeConsolidated = 50 * M;
    });
    expect(computed.capital.current!.netIncome).toBe(200 * M);
    expect(computed.capital.current!.filedCashFlows?.netIncome).toBeUndefined();
    expect(computed.capital.current!.cashBridge.definition).toContain("FCF conversion uses the complete consolidated net-income window");
  });
});
