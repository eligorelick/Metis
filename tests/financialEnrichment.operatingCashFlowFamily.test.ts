/**
 * D-252 (P8, P7, P10; revises D-89 for this one shape): a vendor operating cash
 * flow that conflicts with the filed one takes the filed figure when the
 * filing's own cash-flow statement reconciles around it (operating + investing
 * + financing + exchange-rate effect = the change in cash, all from ONE
 * filing, exactly). Before D-252 every such conflict was withheld, and the
 * fiscal year's free cash flow with it.
 *
 * Every filed figure below is the SEC XBRL fact of the named filing (USD):
 * - Duke Energy (CIK 1326160, regulated utility). 10-K 0001326160-26-000014,
 *   filed 2026-02-26, fiscal year 2025-01-01..2025-12-31:
 *   NetCashProvidedByUsedInOperatingActivities 12,330,000,000;
 *   NetCashProvidedByUsedInInvestingActivities -14,338,000,000;
 *   NetCashProvidedByUsedInFinancingActivities 1,950,000,000;
 *   CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect
 *   -58,000,000 (12,330 - 14,338 + 1,950 = -58);
 *   PaymentsToAcquirePropertyPlantAndEquipment 14,024,000,000.
 *   The vendor row carried operating 12,352,000,000 and free cash flow
 *   -1,672,000,000 (22,000,000 moved between operating and investing).
 * - Duke Energy fiscal 2016, 10-K 0001326160-19-000057, filed 2019-02-28 (the
 *   newest filing stating that year): operating 6,863,000,000; investing
 *   -11,528,000,000; financing 4,251,000,000; change in cash 60,000,000. These
 *   do not foot (-414,000,000 against 60,000,000), so nothing is adopted.
 * - Realty Income (CIK 726728, equity REIT) fiscal 2016, 10-K/A
 *   0000726728-19-000041, filed 2019-03-01: operating 799,863,000; investing
 *   -1,700,707,000; financing 866,192,000; change in cash -34,652,000 (foots).
 *   The row's capital spending is the filed PaymentsForCapitalImprovements
 *   13,426,000 (the convention its other years already use, D-150, D-239), so
 *   free cash flow is 799,863,000 - 13,426,000 = 786,437,000.
 * - Progressive (CIK 80661, insurer) fiscal 2016, 10-K 0000080661-19-000008,
 *   filed 2019-02-27: operating 2,732,700,000; investing -2,480,700,000;
 *   financing -250,400,000; exchange-rate effect 400,000; change in cash
 *   2,000,000 (foots with the exchange-rate line);
 *   PaymentsToAcquirePropertyPlantAndEquipment 215,000,000.
 * The vendor figures are the ones the stored run inputs carried.
 */
import { describe, expect, it } from "vitest";
import { enrichFinancialFields, readmitFiledOperatingCashFlow } from "@/edgar/financialEnrichment";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpBalanceSheetRow, FmpCashFlowRow, FmpPayload, StatementFieldConflict, StatementFieldProvenance } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";
import type { DataBundle } from "@/pipeline/types";
import { withCashFlowSbcBasis } from "@/pipeline/cashFlowBasis";
import { computeCapital } from "@/pipeline/stageB/capital";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

const observedAt = "2026-11-12T18:19:30.723Z";
const OCF = "NetCashProvidedByUsedInOperatingActivities";
const CFI = "NetCashProvidedByUsedInInvestingActivities";
const CFF = "NetCashProvidedByUsedInFinancingActivities";
const CHANGE = "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect";
const FX = "EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents";
const FX_DISPOSAL = "EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsIncludingDisposalGroupAndDiscontinuedOperations";
const PPE = "PaymentsToAcquirePropertyPlantAndEquipment";

interface Filing { accn: string; filed: string; form: string }
const DUK_10K_2025: Filing = { accn: "0001326160-26-000014", filed: "2026-02-26", form: "10-K" };
const DUK_10K_2016: Filing = { accn: "0001326160-17-000016", filed: "2017-02-24", form: "10-K" };
const DUK_10K_2018: Filing = { accn: "0001326160-19-000057", filed: "2019-02-28", form: "10-K" };
const O_10KA_2018: Filing = { accn: "0000726728-19-000041", filed: "2019-03-01", form: "10-K/A" };
const PGR_10K_2018: Filing = { accn: "0000080661-19-000008", filed: "2019-02-27", form: "10-K" };
const CONTROL_10K: Filing = { accn: "0000000001-26-000001", filed: "2026-02-20", form: "10-K" };
const CONTROL_10K_NEXT: Filing = { accn: "0000000001-27-000001", filed: "2026-10-20", form: "10-K" };
const CONTROL_10Q: Filing = { accn: "0000000001-26-000002", filed: "2026-05-05", form: "10-Q" };

const span = (start: string, end: string, val: number, filing: Filing) => ({ start, end, val, fy: Number(end.slice(0, 4)), fp: "FY", ...filing });
const year = (fiscalYear: number, val: number, filing: Filing) => span(`${fiscalYear}-01-01`, `${fiscalYear}-12-31`, val, filing);
type Point = ReturnType<typeof span>;
function facts(cik: number, tags: Record<string, Point[]>, currency = "USD"): CompanyFacts {
  return { cik, entityName: "Fixture", facts: { "us-gaap": Object.fromEntries(Object.entries(tags).map(([tag, points]) => [tag, { units: { [currency]: points } }])) } };
}
function sourced<T extends FmpBalanceSheetRow | FmpCashFlowRow>(rows: T[]): FetchResult<FmpPayload<T>> {
  return { ok: true, value: { data: { rows, raw: rows }, source: "fmp", asOf: "2026-06-30", endpoint: "fmp:statements", fetchedAt: observedAt } };
}
/** The fresh path: a vendor row through the whole annual cash-flow admission. */
function enrichAnnual(row: FmpCashFlowRow, f: CompanyFacts, at = observedAt) {
  const out = enrichFinancialFields(sourced<FmpBalanceSheetRow>([]), sourced([row]), f, "annual", at);
  if (!out.cashflow.ok) throw new Error("fixture");
  return { row: out.cashflow.value.data.rows[0]!, gaps: out.gaps };
}

const dukFacts = () => facts(1326160, {
  [OCF]: [year(2025, 12_330_000_000, DUK_10K_2025), year(2016, 6_798_000_000, DUK_10K_2016), year(2016, 6_863_000_000, DUK_10K_2018)],
  [CFI]: [year(2025, -14_338_000_000, DUK_10K_2025), year(2016, -11_533_000_000, DUK_10K_2016), year(2016, -11_528_000_000, DUK_10K_2018)],
  [CFF]: [year(2025, 1_950_000_000, DUK_10K_2025), year(2016, 4_270_000_000, DUK_10K_2016), year(2016, 4_251_000_000, DUK_10K_2018)],
  [CHANGE]: [year(2025, -58_000_000, DUK_10K_2025), year(2016, 60_000_000, DUK_10K_2018)],
  [PPE]: [year(2025, 14_024_000_000, DUK_10K_2025), year(2016, 7_901_000_000, DUK_10K_2016), year(2016, 7_901_000_000, DUK_10K_2018)],
});
const dukVendor2025 = (): FmpCashFlowRow => ({ date: "2025-12-31", cik: "0001326160", reportedCurrency: "USD", period: "FY", filingDate: "2026-02-26",
  operatingCashFlow: 12_352_000_000, netCashProvidedByOperatingActivities: 12_352_000_000, capitalExpenditure: -14_024_000_000, freeCashFlow: -1_672_000_000, netIncome: 4_967_000_000 });
const dukVendor2016 = (): FmpCashFlowRow => ({ date: "2016-12-31", cik: "0001326160", reportedCurrency: "USD", period: "FY", filingDate: "2017-02-24",
  operatingCashFlow: 6_798_000_000, netCashProvidedByOperatingActivities: 6_798_000_000, capitalExpenditure: -7_901_000_000, freeCashFlow: -1_103_000_000 });

const oFacts = () => facts(726728, {
  [OCF]: [year(2016, 799_863_000, O_10KA_2018)], [CFI]: [year(2016, -1_700_707_000, O_10KA_2018)], [CFF]: [year(2016, 866_192_000, O_10KA_2018)],
  [CHANGE]: [year(2016, -34_652_000, O_10KA_2018)], PaymentsForCapitalImprovements: [year(2016, 13_426_000, O_10KA_2018)],
});
const oVendor2016 = (): FmpCashFlowRow => ({ date: "2016-12-31", cik: "0000726728", reportedCurrency: "USD", period: "FY", filingDate: "2017-02-23",
  operatingCashFlow: 804_045_000, netCashProvidedByOperatingActivities: 804_045_000, capitalExpenditure: -13_426_000, freeCashFlow: 790_619_000 });

const pgrFacts = () => facts(80661, {
  [OCF]: [year(2016, 2_732_700_000, PGR_10K_2018)], [CFI]: [year(2016, -2_480_700_000, PGR_10K_2018)], [CFF]: [year(2016, -250_400_000, PGR_10K_2018)],
  [FX]: [year(2016, 400_000, PGR_10K_2018)], [CHANGE]: [year(2016, 2_000_000, PGR_10K_2018)], [PPE]: [year(2016, 215_000_000, PGR_10K_2018)],
});
const pgrVendor2016 = (): FmpCashFlowRow => ({ date: "2016-12-31", cik: "0000080661", reportedCurrency: "USD", period: "FY", filingDate: "2017-03-01",
  operatingCashFlow: 2_701_900_000, netCashProvidedByOperatingActivities: 2_701_900_000, capitalExpenditure: -215_000_000, freeCashFlow: 2_486_900_000 });

/** A constructed issuer: one 10-K whose fiscal 2025 statement foots (900 - 500 - 300 = 100) and tags capital spending 200. */
const controlTags = (): Record<string, Point[]> => ({ [OCF]: [year(2025, 900_000_000, CONTROL_10K)], [CFI]: [year(2025, -500_000_000, CONTROL_10K)],
  [CFF]: [year(2025, -300_000_000, CONTROL_10K)], [CHANGE]: [year(2025, 100_000_000, CONTROL_10K)], [PPE]: [year(2025, 200_000_000, CONTROL_10K)] });
const controlVendor = (): FmpCashFlowRow => ({ date: "2025-12-31", cik: "0000000001", reportedCurrency: "USD", period: "FY", filingDate: "2026-02-20",
  operatingCashFlow: 950_000_000, netCashProvidedByOperatingActivities: 950_000_000, capitalExpenditure: -200_000_000, freeCashFlow: 750_000_000 });
const withheld = (row: FmpCashFlowRow) => {
  expect(row.operatingCashFlow).toBeNull();
  expect(row.netCashProvidedByOperatingActivities).toBeNull();
  expect(row.freeCashFlow).toBeNull();
  expect(row.fieldConflicts?.operatingCashFlow?.usable).toBe(false);
  expect(row.fieldConflicts?.freeCashFlow?.usable).toBe(false);
};

/** The row a run input stored before D-252: the three fields withheld under one evidence record (D-89). */
function storedRefusal(vendor: FmpCashFlowRow, filed: number, filing: Filing): FmpCashFlowRow {
  const start = `${vendor.date!.slice(0, 4)}-01-01`;
  const secEvidence: StatementFieldProvenance = { filings: [filing], observedAt, periodEnd: vendor.date!, periodStart: start, source: "edgar", tags: [`us-gaap/${OCF}`], unit: "USD" };
  const reason = `vendor/SEC operating cash-flow conflict at ${vendor.date}: filed ${filed / 1e6}M USD for ${start} through ${vendor.date}; vendor observations retained, CFO aliases and dependent standardized FCF unavailable until reconciled`;
  const refusal = (vendorValue: number, secValue: number | null): StatementFieldConflict => ({ reason, secEvidence, secValue, usable: false, vendorValue });
  return { ...vendor, operatingCashFlow: null, netCashProvidedByOperatingActivities: null, freeCashFlow: null,
    fieldConflicts: { operatingCashFlow: refusal(vendor.operatingCashFlow!, filed), netCashProvidedByOperatingActivities: refusal(vendor.netCashProvidedByOperatingActivities as number, filed),
      freeCashFlow: refusal(vendor.freeCashFlow!, null) } } as unknown as FmpCashFlowRow;
}

describe("D-252: a filed cash-flow statement that reconciles replaces a conflicting vendor operating cash flow", () => {
  describe("Duke Energy fiscal 2025", () => {
    it("a vendor row takes the filed 12,330,000,000 and the free cash flow -1,694,000,000 built on it", () => {
      const { row, gaps } = enrichAnnual(dukVendor2025(), dukFacts());
      expect(row.operatingCashFlow).toBe(12_330_000_000);
      expect(row.netCashProvidedByOperatingActivities).toBe(12_330_000_000);
      expect(row.capitalExpenditure).toBe(-14_024_000_000);
      expect(row.freeCashFlow).toBe(-1_694_000_000);
      for (const field of ["operatingCashFlow", "netCashProvidedByOperatingActivities"]) {
        expect(row.fieldConflicts?.[field]).toMatchObject({ usable: true, resolution: "filed-family", vendorValue: 12_352_000_000, secValue: 12_330_000_000,
          secEvidence: { source: "edgar", unit: "USD", periodStart: "2025-01-01", periodEnd: "2025-12-31", tags: [`us-gaap/${OCF}`], filings: [DUK_10K_2025] } });
        expect(row.fieldProvenance?.[field]).toMatchObject({ source: "edgar", tags: [`us-gaap/${OCF}`], filings: [DUK_10K_2025] });
      }
      expect(row.fieldConflicts?.freeCashFlow).toMatchObject({ usable: true, resolution: "filed-family", vendorValue: -1_672_000_000, secValue: -1_694_000_000,
        secEvidence: { tags: [`us-gaap/${OCF}`], filings: [DUK_10K_2025] } });
      expect(row.fieldProvenance?.freeCashFlow).toBeUndefined();
      expect(row.fieldConflicts?.operatingCashFlow?.reason).toBe("Operating cash flow for 2025-12-31 corrected from vendor 12,352M to filed 12,330M USD: the 10-K 0001326160-26-000014 (filed 2026-02-26) states, " +
        "for 2025-01-01 through 2025-12-31, operating 12,330M + investing -14,338M + financing 1,950M = its change in cash, cash equivalents and restricted cash -58M, " +
        "so the filed cash-flow statement reconciles and its operating figure replaces the vendor's.");
      expect(row.fieldConflicts?.freeCashFlow?.reason).toBe(row.fieldConflicts!.operatingCashFlow!.reason +
        " Standardized FCF is that operating cash flow plus the row's capital spending -14,024M USD (an outflow is negative): -1,694M USD.");
      expect(gaps.filter(gap => gap.field === "statements.cashflow.2025-12-31.operatingCashFlow")).toEqual([expect.objectContaining({ severity: "info", expected: true })]);
    });

    it("the stored refusal of a run input is judged again and gives the same figures", () => {
      const stored = storedRefusal(dukVendor2025(), 12_330_000_000, DUK_10K_2025);
      const untouched = structuredClone(stored);
      const out = readmitFiledOperatingCashFlow(stored, dukFacts(), "annual", observedAt);
      expect(out.row).toMatchObject({ operatingCashFlow: 12_330_000_000, netCashProvidedByOperatingActivities: 12_330_000_000, freeCashFlow: -1_694_000_000 });
      expect(out.row.fieldConflicts?.operatingCashFlow).toMatchObject({ usable: true, resolution: "filed-family", vendorValue: 12_352_000_000, secValue: 12_330_000_000 });
      expect(out.row.fieldConflicts?.freeCashFlow).toMatchObject({ usable: true, resolution: "filed-family", vendorValue: -1_672_000_000, secValue: -1_694_000_000 });
      expect(out.superseded).toBe(stored.fieldConflicts!.operatingCashFlow!.reason);
      expect(stored).toEqual(untouched);
      // The fresh path and the stored path agree on the figures and the sentences.
      const fresh = enrichAnnual(dukVendor2025(), dukFacts()).row;
      for (const field of ["operatingCashFlow", "netCashProvidedByOperatingActivities", "freeCashFlow"]) {
        expect(out.row[field]).toBe(fresh[field]);
        expect(out.row.fieldConflicts?.[field]).toEqual(fresh.fieldConflicts?.[field]);
      }
    });

    it("the capital block shows the fiscal year's free cash flow and conversion, where it showed neither", () => {
      const capitalRow = (row: FmpCashFlowRow) => ({ date: "2025-12-31", operatingCashFlow: row.operatingCashFlow, capitalExpenditure: row.capitalExpenditure,
        freeCashFlow: row.freeCashFlow, netIncome: 5_071_000_000, fieldConflicts: row.fieldConflicts });
      const stored = storedRefusal(dukVendor2025(), 12_330_000_000, DUK_10K_2025);
      const before = computeCapital([{ date: "2025-12-31", revenue: 32_237_000_000 }], [capitalRow(stored)], [], [], { price: null });
      expect(before.fcf.series.at(-1)).toMatchObject({ fcf: null, fcfBeforeSbc: null, fcfConversionBeforeSbc: null });
      expect(before.fcf.series.at(-1)!.note).toContain("FCF withheld");
      const after = computeCapital([{ date: "2025-12-31", revenue: 32_237_000_000 }], [capitalRow(readmitFiledOperatingCashFlow(stored, dukFacts(), "annual", observedAt).row)], [], [], { price: null });
      expect(after.fcf.series.at(-1)!.fcfBeforeSbc).toBe(-1_694_000_000);
      expect(after.fcf.series.at(-1)!.fcfConversionBeforeSbc).toBeCloseTo(-1_694_000_000 / 5_071_000_000, 12);
      expect(after.fcf.latestFcfBeforeSbc).toBe(-1_694_000_000);
    });
  });

  describe("compatible control: Duke Energy fiscal 2016, whose newest statement does not foot on these lines", () => {
    it("stays withheld, as before, on a vendor row and on a stored refusal", () => {
      withheld(enrichAnnual(dukVendor2016(), dukFacts()).row);
      const stored = storedRefusal(dukVendor2016(), 6_863_000_000, DUK_10K_2018);
      expect(readmitFiledOperatingCashFlow(stored, dukFacts(), "annual", observedAt)).toEqual({ row: stored, gaps: [], superseded: null });
    });
  });

  describe("unrelated issuers", () => {
    it("Realty Income fiscal 2016: the filed 799,863,000 is admitted, and free cash flow is that less the row's capital spending 13,426,000", () => {
      for (const row of [enrichAnnual(oVendor2016(), oFacts()).row, readmitFiledOperatingCashFlow(storedRefusal(oVendor2016(), 799_863_000, O_10KA_2018), oFacts(), "annual", observedAt).row]) {
        expect(row.operatingCashFlow).toBe(799_863_000);
        expect(row.fieldConflicts?.operatingCashFlow).toMatchObject({ usable: true, resolution: "filed-family", vendorValue: 804_045_000, secValue: 799_863_000, secEvidence: { filings: [O_10KA_2018] } });
        expect(row.capitalExpenditure).toBe(-13_426_000);
        expect(row.freeCashFlow).toBe(786_437_000);
        expect(row.fieldConflicts?.freeCashFlow).toMatchObject({ usable: true, resolution: "filed-family", vendorValue: 790_619_000, secValue: 786_437_000 });
      }
    });

    it("Progressive fiscal 2016: the statement foots with its exchange-rate line, so 2,732,700,000 and the free cash flow 2,517,700,000 are admitted", () => {
      for (const row of [enrichAnnual(pgrVendor2016(), pgrFacts()).row, readmitFiledOperatingCashFlow(storedRefusal(pgrVendor2016(), 2_732_700_000, PGR_10K_2018), pgrFacts(), "annual", observedAt).row]) {
        expect(row).toMatchObject({ operatingCashFlow: 2_732_700_000, netCashProvidedByOperatingActivities: 2_732_700_000, freeCashFlow: 2_517_700_000 });
        expect(row.fieldConflicts?.operatingCashFlow?.reason).toContain("operating 2,732.7M + investing -2,480.7M + financing -250.4M + exchange-rate effect 0.4M = its change in cash, cash equivalents and restricted cash 2M");
      }
    });
  });

  describe("what makes a family: one filing, one value per line, exact arithmetic", () => {
    const refused = (tags: Record<string, Point[]>, row = controlVendor(), at = observedAt) => withheld(enrichAnnual(row, facts(1, tags), at).row);

    it("adopts the constructed issuer's filed 900,000,000 and free cash flow 700,000,000", () => {
      expect(enrichAnnual(controlVendor(), facts(1, controlTags())).row).toMatchObject({ operatingCashFlow: 900_000_000, freeCashFlow: 700_000_000 });
    });

    it("refuses a statement that is off by one unit: the check is the filing's own arithmetic, not an allowance", () => {
      refused({ ...controlTags(), [CHANGE]: [year(2025, 100_000_001, CONTROL_10K)] });
      refused({ ...controlTags(), [CFF]: [year(2025, -299_000_000, CONTROL_10K)] });
    });

    it("refuses when a line is missing, comes from another filing, or carries two values in the filing", () => {
      for (const tag of [CFI, CFF, CHANGE]) {
        refused(Object.fromEntries(Object.entries(controlTags()).filter(([name]) => name !== tag)));
        refused({ ...controlTags(), [tag]: [{ ...controlTags()[tag]![0]!, ...CONTROL_10K_NEXT }] });
        refused({ ...controlTags(), [tag]: [controlTags()[tag]![0]!, { ...controlTags()[tag]![0]!, val: controlTags()[tag]![0]!.val + 1_000_000 }] });
      }
    });

    it("refuses when a newer filing restates one line without the others (P2, P7)", () => {
      refused({ ...controlTags(), [CFI]: [...controlTags()[CFI]!, year(2025, -510_000_000, CONTROL_10K_NEXT)] });
    });

    it("follows a newer filing that restates the whole statement, and only when that one foots", () => {
      const restated: Record<string, Point[]> = { [OCF]: [...controlTags()[OCF]!, year(2025, 880_000_000, CONTROL_10K_NEXT)], [CFI]: [...controlTags()[CFI]!, year(2025, -480_000_000, CONTROL_10K_NEXT)],
        [CFF]: [...controlTags()[CFF]!, year(2025, -300_000_000, CONTROL_10K_NEXT)], [CHANGE]: [...controlTags()[CHANGE]!, year(2025, 100_000_000, CONTROL_10K_NEXT)], [PPE]: controlTags()[PPE]! };
      expect(enrichAnnual(controlVendor(), facts(1, restated)).row).toMatchObject({ operatingCashFlow: 880_000_000, freeCashFlow: 680_000_000 });
      // Before the restating filing existed (P2), the original statement is the family.
      expect(enrichAnnual(controlVendor(), facts(1, restated), "2026-06-30T00:00:00.000Z").row).toMatchObject({ operatingCashFlow: 900_000_000, freeCashFlow: 700_000_000 });
    });

    it("counts a tagged exchange-rate effect, and refuses two exchange-rate elements for one year", () => {
      const withFx = { ...controlTags(), [FX]: [year(2025, -4_000_000, CONTROL_10K)], [CHANGE]: [year(2025, 96_000_000, CONTROL_10K)] };
      expect(enrichAnnual(controlVendor(), facts(1, withFx)).row.operatingCashFlow).toBe(900_000_000);
      refused({ ...controlTags(), [FX]: [year(2025, -4_000_000, CONTROL_10K)] });
      refused({ ...withFx, [FX_DISPOSAL]: [year(2025, -4_000_000, CONTROL_10K)] });
    });

    it("uses nothing filed after the analysis time (P2), in another currency (P4) or for another issuer (P5)", () => {
      const vendor = { operatingCashFlow: 950_000_000, netCashProvidedByOperatingActivities: 950_000_000, freeCashFlow: 750_000_000 };
      for (const out of [enrichAnnual(controlVendor(), facts(1, controlTags()), "2026-02-01T00:00:00.000Z").row, enrichAnnual(controlVendor(), facts(1, controlTags(), "EUR")).row,
        enrichAnnual(controlVendor(), facts(2, controlTags())).row]) {
        expect(out).toMatchObject(vendor);
        expect(out.fieldConflicts?.operatingCashFlow).toBeUndefined();
        expect(out.fieldProvenance?.operatingCashFlow).toBeUndefined();
      }
    });

    it("leaves a quarterly conflict withheld (D-89): a quarter is not one filing's fiscal-year statement", () => {
      const quarter = { start: "2026-01-01", end: "2026-03-31", fy: 2026, fp: "Q1", ...CONTROL_10Q };
      const f = facts(1, { [OCF]: [{ ...quarter, val: 300_000_000 }], [CFI]: [{ ...quarter, val: -200_000_000 }], [CFF]: [{ ...quarter, val: -50_000_000 }], [CHANGE]: [{ ...quarter, val: 50_000_000 }] });
      const out = enrichFinancialFields(sourced<FmpBalanceSheetRow>([]), sourced<FmpCashFlowRow>([{ date: "2026-03-31", cik: "0000000001", reportedCurrency: "USD", period: "Q1",
        operatingCashFlow: 320_000_000, netCashProvidedByOperatingActivities: 320_000_000, capitalExpenditure: -10_000_000, freeCashFlow: 310_000_000 }]), f, "quarter", observedAt);
      if (!out.cashflow.ok) throw new Error("fixture");
      withheld(out.cashflow.value.data.rows[0]!);
    });
  });

  describe("free cash flow follows the admitted operating figure and the row's own capital spending", () => {
    it("is operating cash flow plus capital spending, the identity the readers use, whatever line the capital spending came from", () => {
      const other = enrichAnnual({ ...controlVendor(), capitalExpenditure: -260_000_000, freeCashFlow: 690_000_000 }, facts(1, controlTags())).row;
      expect(other).toMatchObject({ operatingCashFlow: 900_000_000, capitalExpenditure: -260_000_000, freeCashFlow: 640_000_000 });
      expect(other.fieldConflicts?.freeCashFlow).toMatchObject({ usable: true, resolution: "filed-family", vendorValue: 690_000_000, secValue: 640_000_000 });
    });

    it("is absent when the row has no usable capital spending, and keeps an earlier refusal of free cash flow (P11)", () => {
      const earlier: StatementFieldConflict = { vendorValue: -200_000_000, secValue: null, usable: false, reason: "earlier" };
      const refusedCapex = { ...controlVendor(), capitalExpenditure: null, freeCashFlow: null, fieldConflicts: { capitalExpenditure: earlier } } as unknown as FmpCashFlowRow;
      const capex = enrichAnnual(refusedCapex, facts(1, controlTags())).row;
      expect(capex).toMatchObject({ operatingCashFlow: 900_000_000, capitalExpenditure: null, freeCashFlow: null });
      expect(capex.fieldConflicts?.capitalExpenditure).toEqual(earlier);
      expect(capex.fieldConflicts?.freeCashFlow).toMatchObject({ usable: false, secValue: null });
      expect(capex.fieldConflicts?.freeCashFlow?.reason).toBe("Standardized FCF unavailable at 2025-12-31: operating cash flow is the filed 900M USD, but the row has no usable capital spending to subtract; vendor observations retained.");
      const missing = enrichAnnual({ date: "2025-12-31", cik: "0000000001", reportedCurrency: "USD", period: "FY", operatingCashFlow: 950_000_000 }, facts(1, controlTags())).row;
      expect(missing.operatingCashFlow).toBe(900_000_000);
      expect(missing.freeCashFlow).toBeNull();
      const refusedFcf = { ...controlVendor(), freeCashFlow: null, fieldConflicts: { freeCashFlow: earlier } } as unknown as FmpCashFlowRow;
      const fcf = enrichAnnual(refusedFcf, facts(1, controlTags())).row;
      expect(fcf).toMatchObject({ operatingCashFlow: 900_000_000, freeCashFlow: null });
      expect(fcf.fieldConflicts?.freeCashFlow).toEqual(earlier);
    });
  });

  describe("a stored refusal is reopened on its evidence, never its wording", () => {
    const stored = () => storedRefusal(controlVendor(), 900_000_000, CONTROL_10K);
    const f = () => facts(1, controlTags());
    const unchanged = (row: FmpCashFlowRow, companyFacts = f(), scope: "annual" | "quarter" = "annual") =>
      expect(readmitFiledOperatingCashFlow(row, companyFacts, scope, observedAt)).toEqual({ row, gaps: [], superseded: null });
    const edit = (change: (conflicts: Record<string, StatementFieldConflict>) => void): FmpCashFlowRow => {
      const row = structuredClone(stored());
      change(row.fieldConflicts!);
      return row;
    };

    it("reopens the D-89 record whatever its sentence says", () => {
      const reworded = edit(conflicts => { for (const conflict of Object.values(conflicts)) conflict.reason = "any other sentence"; });
      expect(readmitFiledOperatingCashFlow(reworded, f(), "annual", observedAt).row).toMatchObject({ operatingCashFlow: 900_000_000, freeCashFlow: 700_000_000 });
    });

    it("leaves a record with a typed cause, a derived or calculated figure, another tag, filing, period or figure, and a quarterly row", () => {
      unchanged(edit(conflicts => { conflicts.operatingCashFlow!.cause = "vendor-sec-value-conflict"; }));
      unchanged(edit(conflicts => { conflicts.operatingCashFlow!.secEvidence = { ...conflicts.operatingCashFlow!.secEvidence!, derivation: "ytd-difference" }; }));
      unchanged(edit(conflicts => { conflicts.operatingCashFlow!.secEvidence = { ...conflicts.operatingCashFlow!.secEvidence!, calculation: "cash-ppe-plus-hardware" }; }));
      unchanged(edit(conflicts => { conflicts.operatingCashFlow!.secEvidence = { ...conflicts.operatingCashFlow!.secEvidence!, tags: [`us-gaap/${CFI}`] }; }));
      unchanged(edit(conflicts => { conflicts.operatingCashFlow!.secEvidence = { ...conflicts.operatingCashFlow!.secEvidence!, filings: [CONTROL_10K_NEXT] }; }));
      unchanged(edit(conflicts => { conflicts.operatingCashFlow!.secEvidence = { ...conflicts.operatingCashFlow!.secEvidence!, periodStart: "2025-02-01" }; }));
      unchanged(edit(conflicts => { conflicts.operatingCashFlow!.secValue = 899_000_000; }));
      unchanged(edit(conflicts => { conflicts.operatingCashFlow!.secValue = null; }));
      unchanged(edit(conflicts => { conflicts.operatingCashFlow!.usable = true; }));
      unchanged(edit(conflicts => { delete conflicts.operatingCashFlow; }));
      unchanged(edit(conflicts => { conflicts.netCashProvidedByOperatingActivities!.secValue = 1; }));
      unchanged(stored(), f(), "quarter");
      unchanged({ ...stored(), cik: "0000000002" });
      unchanged({ ...stored(), reportedCurrency: null });
      unchanged({ ...stored(), operatingCashFlow: 950_000_000 });
    });

    it("leaves it when the filings no longer state that figure, or the statement does not foot", () => {
      unchanged(stored(), facts(1, { ...controlTags(), [OCF]: [year(2025, 900_000_000, CONTROL_10K), year(2025, 880_000_000, CONTROL_10K_NEXT)] }));
      unchanged(stored(), facts(1, { ...controlTags(), [CHANGE]: [year(2025, 101_000_000, CONTROL_10K)] }));
    });

    it("admits the operating figure and leaves a free cash flow refused under another record", () => {
      const other = edit(conflicts => { conflicts.freeCashFlow = { vendorValue: 750_000_000, secValue: null, usable: false, reason: "another cause" }; });
      const out = readmitFiledOperatingCashFlow(other, f(), "annual", observedAt).row;
      expect(out).toMatchObject({ operatingCashFlow: 900_000_000, freeCashFlow: null });
      expect(out.fieldConflicts?.freeCashFlow).toEqual(other.fieldConflicts!.freeCashFlow);
    });
  });

  describe("in the report's own data view", () => {
    function bundle(symbol: string, f: CompanyFacts, annual: FmpCashFlowRow[]): DataBundle {
      const b = completeCurrencyBundle({});
      b.builtAt = observedAt;
      b.symbol = symbol;
      withIssuerFacts(b, f);
      if (!b.statements.cashflowAnnual.ok || !b.statements.cashflowQuarterly.ok) throw new Error("fixture");
      b.statements.cashflowAnnual.value.data.rows = annual;
      b.statements.cashflowQuarterly.value.data.rows = [];
      return b;
    }
    const dukBundle = () => {
      const rows = [storedRefusal(dukVendor2025(), 12_330_000_000, DUK_10K_2025), storedRefusal(dukVendor2016(), 6_863_000_000, DUK_10K_2018)];
      const b = bundle("DUK", dukFacts(), rows);
      b.gaps = [...b.gaps, ...rows.map(row => ({ field: `statements.cashflow.${row.date}.operatingCashFlow`, reason: row.fieldConflicts!.operatingCashFlow!.reason, severity: "warn" as const }))];
      return b;
    };

    it("admits fiscal 2025, leaves fiscal 2016 withheld, replaces the one stale warning and leaves the stored rows untouched", () => {
      const b = dukBundle();
      const stored = structuredClone(b.statements);
      const out = withCashFlowSbcBasis(b);
      if (!out.statements.cashflowAnnual.ok) throw new Error("fixture");
      expect(out.statements.cashflowAnnual.value.data.rows.map(row => [row.date, row.operatingCashFlow, row.freeCashFlow])).toEqual([
        ["2025-12-31", 12_330_000_000, -1_694_000_000], ["2016-12-31", null, null]]);
      const entries = (date: string) => out.gaps.filter(gap => gap.field === `statements.cashflow.${date}.operatingCashFlow`);
      expect(entries("2025-12-31")).toEqual([expect.objectContaining({ severity: "info", expected: true })]);
      expect(entries("2025-12-31")[0]!.reason).toContain("corrected from vendor 12,352M to filed 12,330M USD");
      expect(entries("2016-12-31")).toEqual([expect.objectContaining({ severity: "warn" })]);
      expect(b.statements).toEqual(stored);
    });

    it("gives the same rows and no second entry when applied twice", () => {
      const once = withCashFlowSbcBasis(dukBundle());
      const twice = withCashFlowSbcBasis(once);
      expect(twice.statements).toEqual(once.statements);
      expect(twice.gaps).toEqual(once.gaps);
    });
  });
});
