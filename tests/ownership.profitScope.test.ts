/**
 * D-238 (P5, P13): one period's profit by entity scope, and the metrics that read it.
 *
 * Every filed figure below is the SEC XBRL fact of the named Form 10-K, fiscal year 2025-01-01..2025-12-31 unless
 * another year is named, in USD:
 * - Realty Income (CIK 726728), 10-K 0000726728-26-000011, filed 2026-02-25: us-gaap:ProfitLoss 1,069,783,000;
 *   us-gaap:NetIncomeLossAttributableToNoncontrollingInterest 11,193,000; us-gaap:NetIncomeLoss 1,058,590,000;
 *   us-gaap:Revenues 5,749,377,000.
 * - Rivian (CIK 1874178), 10-K 0001874178-26-000008, filed 2026-02-12: ProfitLoss -3,626,000,000; NetIncomeLoss
 *   -3,646,000,000; the noncontrolling share 20,000,000.
 * - Figure Technology (CIK 2064124), 10-K 0002064124-26-000009, filed 2026-03-16: ProfitLoss 134,281,000;
 *   NetIncomeLoss 133,858,000; the noncontrolling share 423,000.
 * - Duke Energy (CIK 1326160), 10-K 0001326160-25-000072, filed 2025-02-27, fiscal 2022: ProfitLoss 2,455,000,000;
 *   NetIncomeLoss 2,550,000,000; the noncontrolling share -95,000,000 (a loss, so the parent's profit is larger).
 * - Amazon (CIK 1018724), 10-K 0001018724-26-000004, filed 2026-02-06: NetIncomeLoss 77,670,000,000 and no
 *   noncontrolling interest.
 */
import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { computeCapital } from "@/pipeline/stageB/capital";
import { resolveConsolidatedProfit, resolveParentProfit } from "@/pipeline/stageB/ownership";
import { computeDupont } from "@/pipeline/stageB/returns";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";

describe("D-238: profit attributable to the parent", () => {
  it("Realty Income 2025: a net income on the consolidated basis less the noncontrolling share is the filed parent profit", () => {
    const out = resolveParentProfit({ netIncome: 1_069_783_000, netIncomeOwnershipBasis: "consolidated", netIncomeConsolidated: 1_069_783_000, noncontrollingIncome: 11_193_000 });
    // us-gaap:NetIncomeLoss, 2025-01-01..2025-12-31, 10-K 0000726728-26-000011.
    expect(out.value).toBe(1_058_590_000);
    expect(out.basis).toBe("netIncome (consolidated) - noncontrollingIncome");
    expect(out.reason).toBe("consolidated profit 1069783000 less the signed noncontrolling share 11193000 = 1058590000, the profit attributable to the parent");
  });

  it("compatible control: a net income already on the parent basis is not reduced again (Rivian, Figure)", () => {
    for (const [netIncome, noncontrollingIncome] of [[-3_646_000_000, 20_000_000], [133_858_000, 423_000]] as const) {
      const out = resolveParentProfit({ netIncome, netIncomeOwnershipBasis: "parent", noncontrollingIncome });
      expect(out).toMatchObject({ value: netIncome, basis: "netIncome (parent)" });
    }
  });

  it("a noncontrolling loss raises the parent's profit: the share keeps its filed sign (Duke Energy 2022)", () => {
    expect(resolveParentProfit({ netIncome: 2_455_000_000, netIncomeOwnershipBasis: "consolidated", noncontrollingIncome: -95_000_000 }).value).toBe(2_550_000_000);
  });

  it("unrelated issuer: a row that states no ownership scope is read as reported (Amazon)", () => {
    expect(resolveParentProfit({ netIncome: 77_670_000_000 })).toMatchObject({ value: 77_670_000_000, basis: "netIncome (ownership scope not stated)" });
    expect(resolveConsolidatedProfit({ netIncome: 77_670_000_000 })).toMatchObject({ value: 77_670_000_000, basis: "netIncome (ownership scope not stated)" });
  });

  it("never plugs: without the noncontrolling share a consolidated figure stays, named as unverified; a missing figure stays missing", () => {
    expect(resolveParentProfit({ netIncome: 1_069_783_000, netIncomeOwnershipBasis: "consolidated" })).toMatchObject({ value: 1_069_783_000, basis: "netIncome (consolidated; NCI share undisclosed)" });
    expect(resolveParentProfit({ netIncome: null, netIncomeOwnershipBasis: "consolidated", noncontrollingIncome: 11_193_000 }).value).toBeNull();
    expect(resolveParentProfit({ netIncome: Number.NaN, noncontrollingIncome: 1 }).value).toBeNull();
    expect(resolveConsolidatedProfit({ netIncomeOwnershipBasis: "parent", noncontrollingIncome: 20_000_000 }).value).toBeNull();
  });
});

describe("D-238: consolidated profit, the line a cash-flow statement starts from", () => {
  it("the row's own consolidated profit comes first and the noncontrolling share is not added to it again", () => {
    // Rivian 2025: us-gaap:ProfitLoss -3,626,000,000 beside the parent's -3,646,000,000.
    expect(resolveConsolidatedProfit({ netIncome: -3_646_000_000, netIncomeOwnershipBasis: "parent", netIncomeConsolidated: -3_626_000_000, noncontrollingIncome: 20_000_000 }))
      .toMatchObject({ value: -3_626_000_000, basis: "netIncomeConsolidated" });
    // Realty Income 2025: the row's net income is itself the consolidated profit.
    expect(resolveConsolidatedProfit({ netIncome: 1_069_783_000, netIncomeOwnershipBasis: "consolidated", noncontrollingIncome: 11_193_000 }))
      .toMatchObject({ value: 1_069_783_000, basis: "netIncome (consolidated)" });
  });

  it("parent profit plus the signed noncontrolling share is the filed consolidated profit (Figure 2025, Duke Energy 2022)", () => {
    expect(resolveConsolidatedProfit({ netIncome: 133_858_000, netIncomeOwnershipBasis: "parent", noncontrollingIncome: 423_000 }))
      .toMatchObject({ value: 134_281_000, basis: "netIncome (parent) + noncontrollingIncome", reason: "parent profit 133858000 plus the signed noncontrolling share 423000 = 134281000, the consolidated profit" });
    expect(resolveConsolidatedProfit({ netIncome: 2_550_000_000, netIncomeOwnershipBasis: "parent", noncontrollingIncome: -95_000_000 }).value).toBe(2_455_000_000);
  });

  it("a parent figure with no noncontrolling share on the row stays, named as unverified", () => {
    expect(resolveConsolidatedProfit({ netIncome: 84_969_000_000, netIncomeOwnershipBasis: "parent" })).toMatchObject({ value: 84_969_000_000, basis: "netIncome (parent; NCI share undisclosed)" });
  });
});

describe("D-238: the free-cash-flow series divides consolidated cash flow by consolidated profit", () => {
  const cash = { date: "2025-12-31", freeCashFlow: 300 * M };

  it("a year whose cash-flow row carries no net income reads the income statement's consolidated profit, and says so", () => {
    const capital = computeCapital([{ date: "2025-12-31", netIncome: 133_858_000, netIncomeOwnershipBasis: "parent", noncontrollingIncome: 423_000 }], [cash], [], [], { price: null });
    const latest = capital.fcf.series.at(-1)!;
    expect(latest.netIncome).toBe(134_281_000);
    expect(latest.fcfConversionBeforeSbc).toBeCloseTo(300 * M / 134_281_000, 12);
    expect(latest.note).toContain("the income statement's net income is read on the consolidated scope: parent profit 133858000 plus the signed noncontrolling share 423000 = 134281000, the consolidated profit (netIncome (parent) + noncontrollingIncome)");
  });

  it("the cash-flow statement's own figure still comes first", () => {
    const capital = computeCapital([{ date: "2025-12-31", netIncome: 133_858_000, netIncomeOwnershipBasis: "parent", noncontrollingIncome: 423_000 }], [{ ...cash, netIncome: 134_281_000 }], [], [], { price: null });
    expect(capital.fcf.series.at(-1)).toMatchObject({ netIncome: 134_281_000 });
    expect(capital.fcf.series.at(-1)!.note ?? "").not.toContain("consolidated scope");
  });

  it("compatible control and unrelated issuer: a consolidated-basis row and a row with no stated scope are read as reported, with no note", () => {
    for (const income of [
      { date: "2025-12-31", netIncome: 1_069_783_000, netIncomeOwnershipBasis: "consolidated" as const, noncontrollingIncome: 11_193_000 },
      { date: "2025-12-31", netIncome: 77_670_000_000 },
    ]) {
      const latest = computeCapital([income], [cash], [], [], { price: null }).fcf.series.at(-1)!;
      expect(latest.netIncome).toBe(income.netIncome);
      expect(latest.note ?? "").not.toContain("consolidated scope");
    }
  });
});

describe("D-238: DuPont divides by the parent's equity, so its profit is the parent's", () => {
  const balance = [{ date: "2025-12-31", totalAssets: 2000, totalStockholdersEquity: 500 }, { date: "2024-12-31", totalAssets: 2000, totalStockholdersEquity: 500 }];

  it("a consolidated-basis year is reduced by the noncontrolling share and the year says so", () => {
    const dupont = computeDupont([{ date: "2025-12-31", revenue: 1000, netIncome: 150, netIncomeOwnershipBasis: "consolidated", noncontrollingIncome: 30 }], balance);
    expect(dupont.latest).toMatchObject({ netMargin: 0.12, roePct: 24 });
    expect(dupont.latest!.notes).toContain("net income: consolidated profit 150 less the signed noncontrolling share 30 = 120, the profit attributable to the parent (netIncome (consolidated) - noncontrollingIncome)");
  });

  it("compatible control and unrelated shape: a parent-basis year and a year with no stated scope keep their figure and get no note", () => {
    for (const row of [
      { date: "2025-12-31", revenue: 1000, netIncome: 150, netIncomeOwnershipBasis: "parent" as const, noncontrollingIncome: 30 },
      { date: "2025-12-31", revenue: 1000, netIncome: 150 },
    ]) {
      const dupont = computeDupont([row], balance);
      expect(dupont.latest).toMatchObject({ netMargin: 0.15, roePct: 30 });
      expect(dupont.latest!.notes.join(" ")).not.toContain("attributable to the parent");
    }
  });
});

describe("D-238 in a whole Stage B run: the net margin and DuPont read the parent's profit in every year", () => {
  /** FY2025 revenue 1,000 and net income 150 (millions); the fixture has no noncontrolling interest. */
  function run(change: (row: Record<string, unknown>) => void) {
    const bundle = completeCurrencyBundle({});
    if (!bundle.statements.incomeAnnual.ok) throw new Error("fixture");
    change(bundle.statements.incomeAnnual.value.data.rows[0] as Record<string, unknown>);
    const computed = runStageB(bundle);
    return { margin: computed.growth.margins.net, dupont: computed.returns.dupont.latest! };
  }
  const base = run(() => {});

  it("the fixture as it stands: 15% and no basis note", () => {
    expect(base.margin.series.at(-1)).toEqual({ date: "2025-12-31", pct: 15 });
    expect(base.margin.note ?? "").not.toContain("attributable to the parent");
    expect(base.dupont.netMargin).toBeCloseTo(0.15, 12);
  });

  it("a year reported on the consolidated basis with a noncontrolling share of 30: 12%, and both figures name the basis", () => {
    const out = run((row) => Object.assign(row, { netIncomeOwnershipBasis: "consolidated", netIncomeConsolidated: 150 * M, netIncomeAttributableToNoncontrollingInterest: 30 * M }));
    expect(out.margin.series.at(-1)!.pct).toBeCloseTo(12, 12);
    // The earlier years are untouched.
    expect(out.margin.series.slice(0, -1)).toEqual(base.margin.series.slice(0, -1));
    expect(out.margin.note).toContain(`2025-12-31: net margin uses consolidated profit ${150 * M} less the signed noncontrolling share ${30 * M} = ${120 * M}, the profit attributable to the parent (netIncome (consolidated) - noncontrollingIncome)`);
    expect(out.dupont.netMargin).toBeCloseTo(0.12, 12);
    expect(out.dupont.roePct).toBeCloseTo(base.dupont.roePct! * 120 / 150, 9);
    expect(out.dupont.notes.join(" ")).toContain("the profit attributable to the parent");
  });

  it("compatible control: the same share beside a parent-basis net income changes nothing", () => {
    const out = run((row) => Object.assign(row, { netIncomeOwnershipBasis: "parent", netIncomeConsolidated: 180 * M, netIncomeAttributableToNoncontrollingInterest: 30 * M }));
    expect(out.margin).toEqual(base.margin);
    expect(out.dupont).toEqual(base.dupont);
  });

  it("unrelated shape: a consolidated-basis year with no noncontrolling share on the row is left as reported", () => {
    const out = run((row) => Object.assign(row, { netIncomeOwnershipBasis: "consolidated", netIncomeConsolidated: 150 * M }));
    expect(out.margin).toEqual(base.margin);
    expect(out.dupont).toEqual(base.dupont);
  });
});
