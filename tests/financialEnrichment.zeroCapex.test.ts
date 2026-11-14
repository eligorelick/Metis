/**
 * D-239 (P7, P10): the provider writes 0 for a cash-flow line it did not find.
 * A cash capital-spending figure of exactly 0 stands only as a filed zero for
 * the row's own period; otherwise it is undisclosed and the free cash flow that
 * subtracts it is withheld.
 *
 * Every filed figure below is the SEC XBRL fact of the named filing:
 * - JPMorgan Chase (CIK 19617, bank). 10-K 0001628280-26-008131, filed
 *   2026-02-13, fiscal year 2025-01-01..2025-12-31:
 *   us-gaap:NetCashProvidedByUsedInOperatingActivities -147,782,000,000. Its
 *   filings carry no PaymentsToAcquirePropertyPlantAndEquipment,
 *   PaymentsToAcquireProductiveAssets or PaymentsToDevelopSoftware fact.
 * - Realty Income (CIK 726728, equity REIT). 10-K 0000726728-26-000011, filed
 *   2026-02-25: fiscal 2025 NetCashProvidedByUsedInOperatingActivities
 *   3,994,754,000, PaymentsForCapitalImprovements 131,800,000 and
 *   PaymentsToAcquireCommercialRealEstate 4,647,873,000; fiscal 2024
 *   NetCashProvidedByUsedInOperatingActivities 3,573,276,000 and
 *   PaymentsForCapitalImprovements 121,411,000. No fact under the three
 *   capital-spending elements above in any filing.
 * - Viking Therapeutics (CIK 1607678, pre-revenue). 10-K 0001193125-26-046876,
 *   filed 2026-02-11, fiscal 2025 NetCashProvidedByUsedInOperatingActivities
 *   -278,685,000. No fact under the three capital-spending elements.
 * - Progressive (CIK 80661, insurer). 10-K 0000080661-26-000086, filed
 *   2026-03-02, fiscal 2025 PaymentsToAcquirePropertyPlantAndEquipment
 *   348,000,000; 10-Q 0000080661-26-000379, filed 2026-11-02:
 *   2026-01-01..2026-09-30 317,000,000; 10-Q 0000080661-26-000308, filed
 *   2026-08-03: 2026-01-01..2026-06-30 201,000,000.
 * The vendor figures are the ones the stored run inputs carried. None of the
 * thirteen stored companies files a zero under a capital-spending element, so
 * the filed-zero control is a constructed issuer.
 */
import { describe, expect, it } from "vitest";
import { admitZeroCapex, zeroCapexEntries } from "@/edgar/financialEnrichment";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpCashFlowRow, FmpIncomeStatementRow } from "@/providers/fmp";
import type { DataBundle } from "@/pipeline/types";
import { withCashFlowSbcBasis } from "@/pipeline/cashFlowBasis";
import { computeCapital } from "@/pipeline/stageB/capital";
import { fundamentalsChartDataFromBundle } from "@/components/charts/map";
import type { ComputedMetrics } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

const observedAt = "2026-11-12T18:17:47.889Z";

interface Filing { accn: string; filed: string; form: string }
const JPM_10K_2025: Filing = { accn: "0001628280-26-008131", filed: "2026-02-13", form: "10-K" };
const O_10K_2025: Filing = { accn: "0000726728-26-000011", filed: "2026-02-25", form: "10-K" };
const VKTX_10K_2025: Filing = { accn: "0001193125-26-046876", filed: "2026-02-11", form: "10-K" };
const PGR_10K_2025: Filing = { accn: "0000080661-26-000086", filed: "2026-03-02", form: "10-K" };
const PGR_10Q_Q2: Filing = { accn: "0000080661-26-000308", filed: "2026-08-03", form: "10-Q" };
const PGR_10Q_Q3: Filing = { accn: "0000080661-26-000379", filed: "2026-11-02", form: "10-Q" };
const CONTROL_10K: Filing = { accn: "0000000001-26-000001", filed: "2026-02-20", form: "10-K" };
const CONTROL_10Q_Q1: Filing = { accn: "0000000001-26-000002", filed: "2026-05-05", form: "10-Q" };
const CONTROL_10Q_Q2: Filing = { accn: "0000000001-26-000003", filed: "2026-08-05", form: "10-Q" };

const span = (start: string, end: string, val: number, filing: Filing) => ({ start, end, val, fy: Number(end.slice(0, 4)), fp: "FY", ...filing });
const year = (fiscalYear: number, val: number, filing: Filing) => span(`${fiscalYear}-01-01`, `${fiscalYear}-12-31`, val, filing);
type Point = ReturnType<typeof span>;
function facts(cik: number, tags: Record<string, Point[]>, currency = "USD"): CompanyFacts {
  return { cik, entityName: "Fixture", facts: { "us-gaap": Object.fromEntries(Object.entries(tags).map(([tag, points]) => [tag, { units: { [currency]: points } }])) } };
}
const OCF = "NetCashProvidedByUsedInOperatingActivities";
const PPE = "PaymentsToAcquirePropertyPlantAndEquipment";

const jpmFacts = () => facts(19617, { [OCF]: [year(2025, -147_782_000_000, JPM_10K_2025)] });
const jpmCash: FmpCashFlowRow = { date: "2025-12-31", cik: "0000019617", reportedCurrency: "USD", period: "FY", filingDate: "2026-02-13",
  operatingCashFlow: -147_782_000_000, capitalExpenditure: 0, investmentsInPropertyPlantAndEquipment: 0, freeCashFlow: -147_782_000_000 };
const oFacts = () => facts(726728, {
  [OCF]: [year(2025, 3_994_754_000, O_10K_2025), year(2024, 3_573_276_000, O_10K_2025)],
  PaymentsForCapitalImprovements: [year(2025, 131_800_000, O_10K_2025), year(2024, 121_411_000, O_10K_2025)],
  PaymentsToAcquireCommercialRealEstate: [year(2025, 4_647_873_000, O_10K_2025)],
});
const oCash = (date: string, operatingCashFlow: number, capitalExpenditure: number): FmpCashFlowRow =>
  ({ date, cik: "0000726728", reportedCurrency: "USD", period: "FY", operatingCashFlow, capitalExpenditure, freeCashFlow: operatingCashFlow + capitalExpenditure });
const pgrFacts = () => facts(80661, { [PPE]: [year(2025, 348_000_000, PGR_10K_2025),
  span("2026-01-01", "2026-06-30", 201_000_000, PGR_10Q_Q2), span("2026-01-01", "2026-09-30", 317_000_000, PGR_10Q_Q3)] });

describe("D-239: a provider zero for cash capital spending is a figure only as a filed zero", () => {
  it("JPM fiscal 2025: the filings tag no capital-spending line, so the provider's 0 is undisclosed and free cash flow is withheld", () => {
    const row = structuredClone(jpmCash);
    const out = admitZeroCapex(row, jpmFacts(), "annual", observedAt);
    expect(out.row.capitalExpenditure).toBeNull();
    expect(out.row.freeCashFlow).toBeNull();
    expect(out.row.operatingCashFlow).toBe(-147_782_000_000);
    expect(out.row.fieldConflicts?.capitalExpenditure).toMatchObject({ usable: false, vendorValue: 0, secValue: null });
    expect(out.row.fieldConflicts?.capitalExpenditure?.reason).toBe("Cash capital spending undisclosed at 2025-12-31: the provider records 0 and the SEC facts establish no capital-spending line (PaymentsToAcquirePropertyPlantAndEquipment, PaymentsToAcquireOtherPropertyPlantAndEquipment, PaymentsToAcquireProductiveAssets, PaymentsToDevelopSoftware) for the fiscal year ending that day; a provider zero marks a line it did not find, not a filed zero. Capital spending and dependent standardized FCF withheld; vendor observations retained.");
    expect(out.row.fieldConflicts?.freeCashFlow).toMatchObject({ usable: false, vendorValue: -147_782_000_000, secValue: null });
    expect(out.row.fieldConflicts?.freeCashFlow?.reason).toContain("Standardized FCF withheld because cash capex was refused: Cash capital spending undisclosed at 2025-12-31");
    expect(out.row.fieldProvenance?.capitalExpenditure).toBeUndefined();
    expect(out.refusal).toEqual({ date: "2025-12-31", scope: "annual", filed: false });
    // The input row is not modified.
    expect(row).toEqual(jpmCash);
  });

  it("Realty Income fiscal 2025: capital improvements and acquisitions are separate filed lines, neither a capital-spending element, so the 0 is undisclosed", () => {
    const out = admitZeroCapex(oCash("2025-12-31", 3_994_754_000, 0), oFacts(), "annual", observedAt);
    expect(out.row.capitalExpenditure).toBeNull();
    expect(out.row.freeCashFlow).toBeNull();
    expect(out.refusal).toEqual({ date: "2025-12-31", scope: "annual", filed: false });
  });

  it("Realty Income fiscal 2024: a non-zero provider figure is not this rule's subject and stays", () => {
    const row = oCash("2024-12-31", 3_573_276_000, -121_411_000);
    const out = admitZeroCapex(row, oFacts(), "annual", observedAt);
    expect(out.row).toBe(row);
    expect(out.refusal).toBeNull();
  });

  it("Realty Income, quarter ended 2025-12-31: the quarter's 0 is undisclosed too", () => {
    const row: FmpCashFlowRow = { date: "2025-12-31", cik: "0000726728", reportedCurrency: "USD", period: "Q4", operatingCashFlow: 1_203_434_000, capitalExpenditure: 0, freeCashFlow: 1_203_434_000 };
    const out = admitZeroCapex(row, oFacts(), "quarter", observedAt);
    expect(out.row.capitalExpenditure).toBeNull();
    expect(out.row.freeCashFlow).toBeNull();
    expect(out.row.fieldConflicts?.capitalExpenditure?.reason).toContain("for the quarter ending that day");
    expect(out.refusal).toEqual({ date: "2025-12-31", scope: "quarter", filed: false });
  });

  it("Viking Therapeutics fiscal 2025 (pre-revenue): the same rule, no route exception", () => {
    const f = facts(1607678, { [OCF]: [year(2025, -278_685_000, VKTX_10K_2025)] });
    const out = admitZeroCapex<FmpCashFlowRow>({ date: "2025-12-31", cik: "0001607678", reportedCurrency: "USD", period: "FY", operatingCashFlow: -278_685_000, capitalExpenditure: 0, freeCashFlow: -278_685_000 }, f, "annual", observedAt);
    expect(out.row.capitalExpenditure).toBeNull();
    expect(out.row.freeCashFlow).toBeNull();
    expect(out.refusal?.filed).toBe(false);
  });

  it("the capital block then shows no capital spending and no free cash flow for that year, where it showed 0 and operating cash flow", () => {
    const capitalRow = (row: FmpCashFlowRow) => ({ date: "2025-12-31", operatingCashFlow: row.operatingCashFlow, capitalExpenditure: row.capitalExpenditure,
      freeCashFlow: row.freeCashFlow, fieldConflicts: row.fieldConflicts });
    const before = computeCapital([{ date: "2025-12-31", revenue: 5_749_400_000 }], [capitalRow(oCash("2025-12-31", 3_994_754_000, 0))], [], [], { price: null });
    expect(before.capexIntensity.series.at(-1)).toMatchObject({ capex: 0, capexToRevenuePct: 0 });
    expect(before.fcf.series.at(-1)!.fcfBeforeSbc).toBe(3_994_754_000);
    const admitted = admitZeroCapex(oCash("2025-12-31", 3_994_754_000, 0), oFacts(), "annual", observedAt).row;
    const after = computeCapital([{ date: "2025-12-31", revenue: 5_749_400_000 }], [capitalRow(admitted)], [], [], { price: null });
    expect(after.capexIntensity.series.at(-1)).toMatchObject({ capex: null, capexToRevenuePct: null });
    expect(after.capexIntensity.latestPct).toBeNull();
    expect(after.fcf.series.at(-1)).toMatchObject({ fcf: null, fcfBeforeSbc: null, fcfConversion: null });
    expect(after.fcf.series.at(-1)!.note).toContain("FCF withheld");
  });

  describe("compatible control: a zero the filings state stays a zero", () => {
    const control = (points: Point[], extra: Record<string, Point[]> = {}) => facts(1, { [PPE]: points, ...extra });
    const annualRow: FmpCashFlowRow = { date: "2025-12-31", cik: "0000000001", reportedCurrency: "USD", period: "FY", operatingCashFlow: 900, capitalExpenditure: 0, freeCashFlow: 900 };

    it("a fiscal year tagged at 0", () => {
      const out = admitZeroCapex(annualRow, control([year(2025, 0, CONTROL_10K)]), "annual", observedAt);
      expect(out.row).toBe(annualRow);
      expect(out.refusal).toBeNull();
    });

    it("a quarter tagged at 0 directly, and a quarter whose year-to-date figures leave 0", () => {
      const direct: FmpCashFlowRow = { ...annualRow, date: "2026-03-31", period: "Q1" };
      expect(admitZeroCapex(direct, control([span("2026-01-01", "2026-03-31", 0, CONTROL_10Q_Q1)]), "quarter", observedAt).row).toBe(direct);
      const derived: FmpCashFlowRow = { ...annualRow, date: "2026-06-30", period: "Q2" };
      const ytd = control([span("2026-01-01", "2026-03-31", 500, CONTROL_10Q_Q1), span("2026-01-01", "2026-06-30", 500, CONTROL_10Q_Q2)]);
      expect(admitZeroCapex(derived, ytd, "quarter", observedAt)).toEqual({ row: derived, refusal: null });
    });

    it("every capital-spending line the filings tag for the period must be 0", () => {
      const both = control([year(2025, 0, CONTROL_10K)], { PaymentsToDevelopSoftware: [year(2025, 0, CONTROL_10K)] });
      expect(admitZeroCapex(annualRow, both, "annual", observedAt).row).toBe(annualRow);
      const software = control([year(2025, 0, CONTROL_10K)], { PaymentsToDevelopSoftware: [year(2025, 300, CONTROL_10K)] });
      const out = admitZeroCapex(annualRow, software, "annual", observedAt);
      expect(out.row.capitalExpenditure).toBeNull();
      expect(out.refusal).toEqual({ date: "2025-12-31", scope: "annual", filed: true });
    });
  });

  describe("unrelated issuer: an insurer that files its capital spending", () => {
    it("Progressive fiscal 2025: the provider figure is the filed 348,000,000 and nothing moves", () => {
      const row: FmpCashFlowRow = { date: "2025-12-31", cik: "0000080661", reportedCurrency: "USD", period: "FY", capitalExpenditure: -348_000_000 };
      expect(admitZeroCapex(row, pgrFacts(), "annual", observedAt)).toEqual({ row, refusal: null });
    });

    it("a 0 against a filed amount is contradicted: withheld, naming the filed line, never shown as zero", () => {
      const out = admitZeroCapex<FmpCashFlowRow>({ date: "2025-12-31", cik: "0000080661", reportedCurrency: "USD", period: "FY", operatingCashFlow: 17_548_000_000, capitalExpenditure: 0, freeCashFlow: 17_548_000_000 }, pgrFacts(), "annual", observedAt);
      expect(out.row.capitalExpenditure).toBeNull();
      expect(out.row.freeCashFlow).toBeNull();
      expect(out.row.fieldConflicts?.capitalExpenditure).toMatchObject({ usable: false, vendorValue: 0, secValue: -348_000_000,
        secEvidence: { source: "edgar", unit: "USD", periodStart: "2025-01-01", periodEnd: "2025-12-31", tags: ["us-gaap/PaymentsToAcquirePropertyPlantAndEquipment"], filings: [PGR_10K_2025] } });
      expect(out.row.fieldConflicts?.capitalExpenditure?.reason).toContain("Cash capital spending withheld at 2025-12-31: the provider records 0 but the filings state PaymentsToAcquirePropertyPlantAndEquipment");
      expect(out.refusal).toEqual({ date: "2025-12-31", scope: "annual", filed: true });
    });

    it("a quarter's 0 against a year-to-date difference of 116,000,000 (317,000,000 less 201,000,000) is contradicted", () => {
      const out = admitZeroCapex<FmpCashFlowRow>({ date: "2026-09-30", cik: "0000080661", reportedCurrency: "USD", period: "Q3", capitalExpenditure: 0 }, pgrFacts(), "quarter", observedAt);
      expect(out.row.fieldConflicts?.capitalExpenditure).toMatchObject({ usable: false, secValue: -116_000_000 });
      expect(out.row.fieldConflicts?.capitalExpenditure?.secEvidence).toMatchObject({ periodStart: "2026-07-01", periodEnd: "2026-09-30", derivation: "ytd-difference" });
    });
  });

  describe("what the rule never does", () => {
    it("leaves a row with filed evidence or an earlier decision on the field, another issuer's row, an unknown currency and a missing figure alone", () => {
      const provenance = { source: "edgar" as const, unit: "USD", periodStart: "2025-01-01", periodEnd: "2025-12-31", observedAt, tags: [`us-gaap/${PPE}`], filings: [CONTROL_10K] };
      for (const row of [
        { ...jpmCash, fieldProvenance: { capitalExpenditure: provenance } },
        { ...jpmCash, fieldConflicts: { capitalExpenditure: { vendorValue: 0, secValue: null, usable: false, reason: "earlier" } } },
        { ...jpmCash, fieldConflicts: { capitalExpenditure: { vendorValue: 5, secValue: 0, usable: true, resolution: "filed-family" as const, reason: "earlier" } } },
        { ...jpmCash, cik: "0000000002" },
        { ...jpmCash, reportedCurrency: null },
        { ...jpmCash, capitalExpenditure: null },
        { ...jpmCash, capitalExpenditure: undefined },
        { ...jpmCash, date: "not a day" },
      ] as FmpCashFlowRow[]) {
        expect(admitZeroCapex(row, jpmFacts(), "annual", observedAt)).toEqual({ row, refusal: null });
      }
    });

    it("takes no zero filed after the analysis time (P2), in another currency (P4), or for another period (P1) as the row's filed zero", () => {
      const row: FmpCashFlowRow = { date: "2025-12-31", cik: "0000000001", reportedCurrency: "USD", period: "FY", capitalExpenditure: 0 };
      const later = facts(1, { [PPE]: [year(2025, 0, { ...CONTROL_10K, filed: "2026-12-01" })] });
      const euros = facts(1, { [PPE]: [year(2025, 0, CONTROL_10K)] }, "EUR");
      const otherYear = facts(1, { [PPE]: [year(2024, 0, CONTROL_10K)] });
      const halfYear = facts(1, { [PPE]: [span("2025-07-01", "2025-12-31", 0, CONTROL_10K)] });
      for (const f of [later, euros, otherYear, halfYear]) {
        const out = admitZeroCapex(row, f, "annual", observedAt);
        expect(out.row.capitalExpenditure).toBeNull();
        expect(out.refusal).toEqual({ date: "2025-12-31", scope: "annual", filed: false });
      }
    });

    it("keeps an earlier free-cash-flow refusal as it was written", () => {
      const earlier = { vendorValue: 1, secValue: null, usable: false, reason: "earlier operating cash-flow conflict" };
      const out = admitZeroCapex<FmpCashFlowRow>({ ...jpmCash, fieldConflicts: { freeCashFlow: earlier } }, jpmFacts(), "annual", observedAt);
      expect(out.row.fieldConflicts?.freeCashFlow).toBe(earlier);
      expect(out.row.fieldConflicts?.capitalExpenditure?.usable).toBe(false);
    });
  });

  describe("the manifest entry", () => {
    it("is one entry naming every period and the cause", () => {
      const entries = zeroCapexEntries([{ date: "2024-12-31", scope: "annual", filed: false }, { date: "2025-12-31", scope: "annual", filed: false },
        { date: "2025-12-31", scope: "quarter", filed: false }, { date: "2026-03-31", scope: "quarter", filed: true }]);
      expect(entries).toEqual([{ field: "statements.cashflow.capitalExpenditure", severity: "warn",
        reason: "Cash capital spending is undisclosed, not zero, for fiscal years ending 2025-12-31, 2024-12-31; and quarters ending 2026-03-31, 2025-12-31: the provider records 0 and the SEC facts establish no zero capital-spending line (PaymentsToAcquirePropertyPlantAndEquipment, PaymentsToAcquireOtherPropertyPlantAndEquipment, PaymentsToAcquireProductiveAssets, PaymentsToDevelopSoftware) for those periods (the filings state an amount for 2026-03-31). A provider zero marks a line it did not find, not a filed zero. Capital spending and the standardized free cash flow that subtracts it are withheld for those periods; the provider observations are retained." }]);
    });

    it("is absent when nothing was refused", () => {
      expect(zeroCapexEntries([])).toEqual([]);
    });
  });

  describe("in the report's own data view", () => {
    function bundle(symbol: string, f: CompanyFacts, annual: FmpCashFlowRow[], quarterly: FmpCashFlowRow[]): DataBundle {
      const b = completeCurrencyBundle({});
      b.builtAt = observedAt;
      b.symbol = symbol;
      withIssuerFacts(b, f);
      if (!b.statements.cashflowAnnual.ok || !b.statements.cashflowQuarterly.ok) throw new Error("fixture");
      b.statements.cashflowAnnual.value.data.rows = annual;
      b.statements.cashflowQuarterly.value.data.rows = quarterly;
      return b;
    }
    const oBundle = () => bundle("O", oFacts(), [oCash("2025-12-31", 3_994_754_000, 0), oCash("2024-12-31", 3_573_276_000, -121_411_000)],
      [{ date: "2025-12-31", cik: "0000726728", reportedCurrency: "USD", period: "Q4", operatingCashFlow: 1_203_434_000, capitalExpenditure: 0, freeCashFlow: 1_203_434_000 }]);

    it("withholds the zero year and quarter, keeps the filed-size year, records one entry and leaves the stored rows untouched", () => {
      const b = oBundle();
      const stored = structuredClone(b.statements);
      const out = withCashFlowSbcBasis(b);
      if (!out.statements.cashflowAnnual.ok || !out.statements.cashflowQuarterly.ok) throw new Error("fixture");
      expect(out.statements.cashflowAnnual.value.data.rows.map(row => [row.date, row.capitalExpenditure, row.freeCashFlow])).toEqual([
        ["2025-12-31", null, null], ["2024-12-31", -121_411_000, 3_451_865_000]]);
      expect(out.statements.cashflowQuarterly.value.data.rows.map(row => [row.capitalExpenditure, row.freeCashFlow])).toEqual([[null, null]]);
      const entries = out.gaps.filter(gap => gap.field === "statements.cashflow.capitalExpenditure");
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ severity: "warn" });
      expect(entries[0]!.reason).toContain("for fiscal years ending 2025-12-31; and quarters ending 2025-12-31:");
      expect(b.statements).toEqual(stored);
    });

    it("gives the same rows and no second entry when applied twice", () => {
      const once = withCashFlowSbcBasis(oBundle());
      const twice = withCashFlowSbcBasis(once);
      expect(twice.statements).toEqual(once.statements);
      expect(twice.gaps).toEqual(once.gaps);
    });

    it("a filer that files its capital spending is unchanged and gets no entry", () => {
      const b = bundle("PGR", pgrFacts(), [{ date: "2025-12-31", cik: "0000080661", reportedCurrency: "USD", period: "FY", operatingCashFlow: 17_548_000_000, capitalExpenditure: -348_000_000, freeCashFlow: 17_200_000_000 }], []);
      const out = withCashFlowSbcBasis(b);
      if (!out.statements.cashflowAnnual.ok) throw new Error("fixture");
      expect(out.statements.cashflowAnnual.value.data.rows[0]).toMatchObject({ capitalExpenditure: -348_000_000, freeCashFlow: 17_200_000_000 });
      expect(out.gaps.some(gap => gap.field === "statements.cashflow.capitalExpenditure")).toBe(false);
    });

    it("the company page's free-cash-flow bars read the same admitted rows", () => {
      const b = oBundle();
      if (!b.statements.incomeAnnual.ok) throw new Error("fixture");
      b.statements.incomeAnnual.value.data.rows = [
        { date: "2025-12-31", cik: "0000726728", reportedCurrency: "USD", period: "FY", netIncome: 1_069_783_000 },
        { date: "2024-12-31", cik: "0000726728", reportedCurrency: "USD", period: "FY", netIncome: 860_772_000 },
      ] as FmpIncomeStatementRow[];
      const computed = { growth: { margins: { gross: { series: [] }, operating: { series: [] }, net: { series: [] } } } } as unknown as ComputedMetrics;
      const data = fundamentalsChartDataFromBundle(b, computed);
      expect(data.fcf.map(point => [point.period, point.fcf])).toEqual([["2024-12-31", 3_451_865_000], ["2025-12-31", null]]);
    });
  });
});
