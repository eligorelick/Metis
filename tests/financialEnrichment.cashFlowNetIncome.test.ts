/**
 * D-231 (P8, P5, P10): the net income on a vendor's annual cash-flow row is
 * checked against the filer's own profit for that exact fiscal year.
 *
 * Every filed figure below is the SEC XBRL fact of the named filing:
 * - TSMC (CIK 1046179, Form 20-F, IFRS, TWD). 20-F 0001193125-25-083423, filed
 *   2025-04-17, fiscal year 2024-01-01..2024-12-31: ifrs-full:ProfitLoss
 *   1,157,523,900,000 and ifrs-full:ProfitLossAttributableToOwnersOfParent
 *   1,158,380,200,000; fiscal 2022 in the same filing: 993,294,700,000 and
 *   992,923,400,000. 20-F 0001628280-26-025362, filed 2026-04-16, fiscal year
 *   2025-01-01..2025-12-31: ProfitLoss 1,695,124,900,000 and
 *   ProfitLossAttributableToOwnersOfParent 1,697,604,000,000 (the filing's own
 *   instance; SEC companyfacts did not carry that filing's IFRS facts).
 * - Duke Energy (CIK 1326160, Form 10-K, USD). 10-K 0001326160-25-000072, filed
 *   2025-02-27, fiscal year 2022-01-01..2022-12-31: us-gaap:ProfitLoss
 *   2,455,000,000 and us-gaap:NetIncomeLoss 2,550,000,000.
 * - Realty Income (CIK 726728, Form 10-K, USD). 10-K 0000726728-26-000011, filed
 *   2026-02-25: fiscal 2025 us-gaap:ProfitLoss 1,069,783,000 and
 *   us-gaap:NetIncomeLoss 1,058,590,000; fiscal 2023 ProfitLoss 876,914,000 and
 *   NetIncomeLoss 872,309,000.
 * - Amazon (CIK 1018724, Form 10-K, USD). 10-K 0001018724-26-000004, filed
 *   2026-02-06, fiscal 2025 us-gaap:NetIncomeLoss 77,670,000,000.
 * The vendor figures are the ones the stored run inputs carried.
 */
import { describe, expect, it } from "vitest";
import { admitCashFlowNetIncome } from "@/edgar/financialEnrichment";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpCashFlowRow, FmpIncomeStatementRow } from "@/providers/fmp";
import type { DataBundle } from "@/pipeline/types";
import { withCashFlowSbcBasis } from "@/pipeline/cashFlowBasis";
import { computeCapital } from "@/pipeline/stageB/capital";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

const observedAt = "2026-11-12T18:21:28.303Z";

interface Filing { accn: string; filed: string; form: string }
const TSM_20F_2024: Filing = { accn: "0001193125-25-083423", filed: "2025-04-17", form: "20-F" };
const TSM_20F_2023: Filing = { accn: "0001193125-24-099840", filed: "2024-04-18", form: "20-F" };
const DUK_10K_2024: Filing = { accn: "0001326160-25-000072", filed: "2025-02-27", form: "10-K" };
const DUK_10K_2022: Filing = { accn: "0001326160-23-000073", filed: "2023-02-27", form: "10-K" };
const O_10K_2025: Filing = { accn: "0000726728-26-000011", filed: "2026-02-25", form: "10-K" };
const AMZN_10K_2025: Filing = { accn: "0001018724-26-000004", filed: "2026-02-06", form: "10-K" };

const year = (fiscalYear: number, val: number, filing: Filing) =>
  ({ start: `${fiscalYear}-01-01`, end: `${fiscalYear}-12-31`, val, fy: fiscalYear, fp: "FY", ...filing });
type Point = ReturnType<typeof year>;
function facts(cik: number, namespace: "us-gaap" | "ifrs-full", currency: string, tags: Record<string, Point[]>): CompanyFacts {
  return { cik, entityName: "Fixture", facts: { [namespace]: Object.fromEntries(Object.entries(tags).map(([tag, points]) => [tag, { units: { [currency]: points } }])) } };
}

const TSM_CIK = 1046179;
const tsmFacts = () => facts(TSM_CIK, "ifrs-full", "TWD", {
  ProfitLoss: [year(2024, 1_157_523_900_000, TSM_20F_2024), year(2022, 993_294_700_000, TSM_20F_2023), year(2022, 993_294_700_000, TSM_20F_2024)],
  ProfitLossAttributableToOwnersOfParent: [year(2024, 1_158_380_200_000, TSM_20F_2024), year(2022, 992_923_400_000, TSM_20F_2023), year(2022, 992_923_400_000, TSM_20F_2024)],
});
const tsmCash = (date: string, netIncome: number): FmpCashFlowRow =>
  ({ date, cik: "0001046179", reportedCurrency: "TWD", period: "FY", filingDate: "2026-04-16", netIncome });
const tsmIncome2025: FmpIncomeStatementRow = { date: "2025-12-31", cik: "0001046179", reportedCurrency: "TWD", period: "FY",
  netIncome: 1_697_604_000_000, bottomLineNetIncome: 1_697_604_000_000, netIncomeFromContinuingOperations: 1_695_124_900_000, netIncomeFromDiscontinuedOperations: 0 };

describe("D-231: a vendor cash-flow net income against the filer's profit for the fiscal year", () => {
  it("TSM 2024: a figure equal to no filed profit line is replaced by the filed consolidated profit, citing the 20-F", () => {
    const row = tsmCash("2024-12-31", 1_173_268_000_000);
    const out = admitCashFlowNetIncome(row, tsmFacts(), undefined, observedAt);
    expect(out.row.netIncome).toBe(1_157_523_900_000);
    expect(out.row.fieldConflicts?.netIncome).toMatchObject({ vendorValue: 1_173_268_000_000, secValue: 1_157_523_900_000, usable: true, resolution: "filed-line" });
    expect(out.row.fieldProvenance?.netIncome).toMatchObject({ source: "edgar", unit: "TWD", periodStart: "2024-01-01", periodEnd: "2024-12-31",
      tags: ["ifrs-full/ProfitLoss"], filings: [TSM_20F_2024] });
    expect(out.gaps).toEqual([expect.objectContaining({ field: "statements.cashflow.2024-12-31.netIncome", severity: "info", expected: true })]);
    expect(out.gaps[0]!.reason).toContain("ifrs-full/ProfitLossAttributableToOwnersOfParent 1158380200000 (20-F 0001193125-25-083423, filed 2025-04-17)");
    // The input row is not modified.
    expect(row).toEqual(tsmCash("2024-12-31", 1_173_268_000_000));
  });

  it("TSM 2022: the vendor's figure was profit before tax; the newest filing stating the year's consolidated profit is cited", () => {
    const out = admitCashFlowNetIncome(tsmCash("2022-12-31", 1_144_190_718_000), tsmFacts(), undefined, observedAt);
    expect(out.row.netIncome).toBe(993_294_700_000);
    expect(out.row.fieldProvenance?.netIncome?.filings).toEqual([TSM_20F_2024]);
  });

  it("TSM 2025: with no filed profit for the year in the admitted facts, a figure that matches no line of the same period's income statement is withheld", () => {
    const out = admitCashFlowNetIncome(tsmCash("2025-12-31", 1_717_882_627_000), tsmFacts(), tsmIncome2025, observedAt);
    expect(out.row.netIncome).toBeNull();
    expect(out.row.fieldConflicts?.netIncome).toMatchObject({ vendorValue: 1_717_882_627_000, secValue: null, usable: false });
    expect(out.row.fieldProvenance?.netIncome).toBeUndefined();
    expect(out.gaps).toEqual([expect.objectContaining({ field: "statements.cashflow.2025-12-31.netIncome", severity: "warn" })]);
    expect(out.gaps[0]!.reason).toContain("hold no profit line for that fiscal year");
  });

  it("TSM 2025 with the 20-F's own facts admitted: the filed consolidated profit replaces the vendor figure", () => {
    const filing: Filing = { accn: "0001628280-26-025362", filed: "2026-04-16", form: "20-F" };
    const withInstance = tsmFacts();
    const ifrs = withInstance.facts["ifrs-full"] as Record<string, { units: Record<string, Point[]> }>;
    ifrs.ProfitLoss!.units.TWD!.push(year(2025, 1_695_124_900_000, filing));
    ifrs.ProfitLossAttributableToOwnersOfParent!.units.TWD!.push(year(2025, 1_697_604_000_000, filing));
    const out = admitCashFlowNetIncome(tsmCash("2025-12-31", 1_717_882_627_000), withInstance, tsmIncome2025, observedAt);
    expect(out.row.netIncome).toBe(1_695_124_900_000);
    expect(out.row.fieldProvenance?.netIncome).toMatchObject({ tags: ["ifrs-full/ProfitLoss"], filings: [filing], periodStart: "2025-01-01", periodEnd: "2025-12-31" });
  });

  it("the free-cash-flow series then divides by the income statement's net income for the withheld year and says so", () => {
    const withheld = admitCashFlowNetIncome({ ...tsmCash("2025-12-31", 1_717_882_627_000), freeCashFlow: 992_418_154_000, stockBasedCompensation: 1_246_070_000 }, tsmFacts(), tsmIncome2025, observedAt).row;
    const capital = computeCapital([{ date: "2025-12-31", netIncome: 1_697_604_000_000 }],
      [{ date: "2025-12-31", netIncome: withheld.netIncome, freeCashFlow: 992_418_154_000, stockBasedCompensation: 1_246_070_000, fieldConflicts: withheld.fieldConflicts }], [], [], { price: null });
    const latest = capital.fcf.series.at(-1)!;
    // ifrs-full:ProfitLossAttributableToOwnersOfParent, 2025-01-01..2025-12-31, 20-F 0001628280-26-025362.
    expect(latest.netIncome).toBe(1_697_604_000_000);
    expect(latest.fcfConversionBeforeSbc).toBeCloseTo(992_418_154_000 / 1_697_604_000_000, 12);
    expect(latest.note).toContain("net income is the income statement's: the cash-flow statement's figure for this year was withheld");
    // A row that never carried a cash-flow net income gets no such note.
    const plain = computeCapital([{ date: "2025-12-31", netIncome: 1_697_604_000_000 }], [{ date: "2025-12-31", freeCashFlow: 992_418_154_000 }], [], [], { price: null });
    expect(plain.fcf.series.at(-1)!.netIncome).toBe(1_697_604_000_000);
    expect(plain.fcf.series.at(-1)!.note ?? "").not.toContain("withheld");
  });

  describe("compatible control: a Form 20-F IFRS filer whose vendor figure is a filed line is left alone", () => {
    it.each([
      ["the filed consolidated profit", 1_157_523_900_000],
      ["the filed profit attributable to owners of the parent (the entity scope is not decided here)", 1_158_380_200_000],
      ["the consolidated profit within the filer's reporting unit", 1_157_523_800_000],
    ])("%s", (_label, vendor) => {
      const row = tsmCash("2024-12-31", vendor);
      const out = admitCashFlowNetIncome(row, tsmFacts(), undefined, observedAt);
      expect(out.row).toBe(row);
      expect(out.gaps).toEqual([]);
    });

    it("a figure equal to an earlier filing's copy of the year also stays", () => {
      const restated = facts(TSM_CIK, "ifrs-full", "TWD", { ProfitLoss: [year(2022, 1_000_000_000_000, TSM_20F_2023), year(2022, 993_294_700_000, TSM_20F_2024)] });
      const row = tsmCash("2022-12-31", 1_000_000_000_000);
      expect(admitCashFlowNetIncome(row, restated, undefined, observedAt).row).toBe(row);
    });

    it("a 2025 figure equal to the income statement's consolidated or parent profit stays, unverified", () => {
      for (const vendor of [1_697_604_000_000, 1_695_124_900_000]) {
        const row = tsmCash("2025-12-31", vendor);
        const out = admitCashFlowNetIncome(row, tsmFacts(), tsmIncome2025, observedAt);
        expect(out.row).toBe(row);
        expect(out.gaps).toEqual([]);
      }
    });

    it("when the filings state only the parent's profit for the year, a conflicting figure is withheld, never replaced by the parent line (P5)", () => {
      const parentOnly = facts(TSM_CIK, "ifrs-full", "TWD", { ProfitLossAttributableToOwnersOfParent: [year(2024, 1_158_380_200_000, TSM_20F_2024)] });
      const out = admitCashFlowNetIncome(tsmCash("2024-12-31", 1_173_268_000_000), parentOnly, undefined, observedAt);
      expect(out.row.netIncome).toBeNull();
      expect(out.row.fieldConflicts?.netIncome).toMatchObject({ usable: false, secValue: null });
      expect(out.gaps[0]!.reason).toContain("the filings state no consolidated profit for it");
    });
  });

  describe("unrelated issuers: domestic Form 10-K filers", () => {
    it("Amazon 2025: the vendor figure is the filed net income and nothing moves", () => {
      const f = facts(1018724, "us-gaap", "USD", { NetIncomeLoss: [year(2025, 77_670_000_000, AMZN_10K_2025)] });
      const row: FmpCashFlowRow = { date: "2025-12-31", cik: "0001018724", reportedCurrency: "USD", period: "FY", netIncome: 77_670_000_000 };
      const out = admitCashFlowNetIncome(row, f, undefined, observedAt);
      expect(out.row).toBe(row);
      expect(out.gaps).toEqual([]);
    });

    it("Realty Income: a consolidated figure (2025) and a parent figure (2023) are both filed lines and both stay", () => {
      const f = facts(726728, "us-gaap", "USD", {
        ProfitLoss: [year(2025, 1_069_783_000, O_10K_2025), year(2023, 876_914_000, O_10K_2025)],
        NetIncomeLoss: [year(2025, 1_058_590_000, O_10K_2025), year(2023, 872_309_000, O_10K_2025)],
      });
      for (const [date, vendor] of [["2025-12-31", 1_069_783_000], ["2023-12-31", 872_309_000]] as const) {
        const row: FmpCashFlowRow = { date, cik: "0000726728", reportedCurrency: "USD", period: "FY", netIncome: vendor };
        expect(admitCashFlowNetIncome(row, f, undefined, observedAt).row).toBe(row);
      }
    });

    it("Duke Energy 2022: a figure equal to neither filed line is replaced by the filed consolidated profit", () => {
      const f = facts(1326160, "us-gaap", "USD", {
        ProfitLoss: [year(2022, 2_455_000_000, DUK_10K_2022), year(2022, 2_455_000_000, DUK_10K_2024)],
        NetIncomeLoss: [year(2022, 2_550_000_000, DUK_10K_2022), year(2022, 2_550_000_000, DUK_10K_2024)],
      });
      const out = admitCashFlowNetIncome<FmpCashFlowRow>({ date: "2022-12-31", cik: "0001326160", reportedCurrency: "USD", period: "FY", netIncome: 2_588_000_000 }, f, undefined, observedAt);
      expect(out.row.netIncome).toBe(2_455_000_000);
      expect(out.row.fieldProvenance?.netIncome).toMatchObject({ tags: ["us-gaap/ProfitLoss"], filings: [DUK_10K_2024], unit: "USD" });
    });

    it("a filer that tags only net income (no non-controlling interest): the statement builder's chain supplies it", () => {
      const f = facts(1, "us-gaap", "USD", { NetIncomeLoss: [year(2025, 900_000_000, AMZN_10K_2025)] });
      const out = admitCashFlowNetIncome<FmpCashFlowRow>({ date: "2025-12-31", cik: "1", reportedCurrency: "USD", netIncome: 750_000_000 }, f, undefined, observedAt);
      expect(out.row.netIncome).toBe(900_000_000);
      expect(out.row.fieldProvenance?.netIncome?.tags).toEqual(["us-gaap/NetIncomeLoss"]);
    });
  });

  describe("what the check never does", () => {
    const duk = () => facts(1326160, "us-gaap", "USD", { ProfitLoss: [year(2022, 2_455_000_000, DUK_10K_2024)] });
    const base: FmpCashFlowRow = { date: "2022-12-31", cik: "0001326160", reportedCurrency: "USD", period: "FY", netIncome: 2_588_000_000 };

    it("leaves a row built from SEC facts, a row with its own provenance or an earlier decision, another issuer's row and an unknown currency alone", () => {
      const provenance = { source: "edgar" as const, unit: "USD", periodStart: "2022-01-01", periodEnd: "2022-12-31", observedAt, tags: ["us-gaap/ProfitLoss"], filings: [DUK_10K_2024] };
      for (const row of [
        { ...base, source: "edgar" },
        { ...base, fieldProvenance: { netIncome: provenance } },
        { ...base, fieldConflicts: { netIncome: { vendorValue: 1, secValue: null, usable: false, reason: "earlier" } } },
        { ...base, cik: "0000000002" },
        { ...base, reportedCurrency: null },
        { ...base, netIncome: null },
      ] as FmpCashFlowRow[]) {
        const out = admitCashFlowNetIncome(row, duk(), undefined, observedAt);
        expect(out.row).toBe(row);
        expect(out.gaps).toEqual([]);
      }
    });

    it("reads no fact filed after the analysis time (P2), in another currency, or for another period (P1)", () => {
      const later = facts(1326160, "us-gaap", "USD", { ProfitLoss: [year(2022, 2_455_000_000, { ...DUK_10K_2024, filed: "2026-12-01" })] });
      const euros = facts(1326160, "us-gaap", "EUR", { ProfitLoss: [year(2022, 2_455_000_000, DUK_10K_2024)] });
      const otherYear = facts(1326160, "us-gaap", "USD", { ProfitLoss: [year(2021, 2_455_000_000, DUK_10K_2024)] });
      const halfYear = facts(1326160, "us-gaap", "USD", { ProfitLoss: [{ ...year(2022, 2_455_000_000, DUK_10K_2024), start: "2022-07-01" }] });
      for (const f of [later, euros, otherYear, halfYear]) expect(admitCashFlowNetIncome(base, f, undefined, observedAt).row).toBe(base);
    });

    it("withholds, rather than picks, when the newest filing states two consolidated profits for the year", () => {
      const twice = facts(1326160, "us-gaap", "USD", { ProfitLoss: [year(2022, 2_455_000_000, DUK_10K_2024), year(2022, 2_460_000_000, DUK_10K_2024)] });
      const out = admitCashFlowNetIncome(base, twice, undefined, observedAt);
      expect(out.row.netIncome).toBeNull();
      expect(out.gaps[0]!.reason).toContain("the newest filing states more than one consolidated profit for it");
    });

    it("does not test a figure against an income row of another period or currency, or one with no profit line", () => {
      const none = facts(TSM_CIK, "ifrs-full", "TWD", {});
      const row = tsmCash("2025-12-31", 1_717_882_627_000);
      for (const income of [undefined, { ...tsmIncome2025, date: "2024-12-31" }, { ...tsmIncome2025, reportedCurrency: "USD" }, { date: "2025-12-31", reportedCurrency: "TWD" }] as (FmpIncomeStatementRow | undefined)[]) {
        expect(admitCashFlowNetIncome(row, none, income, observedAt).row).toBe(row);
      }
    });
  });

  describe("in the report's own data view", () => {
    function bundle(): DataBundle {
      const b = completeCurrencyBundle({});
      b.builtAt = observedAt;
      b.symbol = "TSM";
      withIssuerFacts(b, tsmFacts());
      if (!b.statements.cashflowAnnual.ok || !b.statements.incomeAnnual.ok) throw new Error("fixture");
      b.statements.cashflowAnnual.value.data.rows = [tsmCash("2025-12-31", 1_717_882_627_000), tsmCash("2024-12-31", 1_173_268_000_000)];
      b.statements.incomeAnnual.value.data.rows = [tsmIncome2025];
      return b;
    }

    it("corrects 2024, withholds 2025, records both, and leaves the stored rows untouched", () => {
      const b = bundle();
      const stored = structuredClone(b.statements.cashflowAnnual);
      const out = withCashFlowSbcBasis(b);
      if (!out.statements.cashflowAnnual.ok) throw new Error("fixture");
      expect(out.statements.cashflowAnnual.value.data.rows.map(row => row.netIncome)).toEqual([null, 1_157_523_900_000]);
      expect(out.gaps.filter(gap => /^statements\.cashflow\.\d{4}-12-31\.netIncome$/.test(gap.field)).map(gap => [gap.field, gap.severity])).toEqual([
        ["statements.cashflow.2025-12-31.netIncome", "warn"], ["statements.cashflow.2024-12-31.netIncome", "info"]]);
      expect(b.statements.cashflowAnnual).toEqual(stored);
    });

    it("gives the same rows when applied twice", () => {
      const once = withCashFlowSbcBasis(bundle());
      expect(withCashFlowSbcBasis(once).statements).toEqual(once.statements);
    });
  });
});
