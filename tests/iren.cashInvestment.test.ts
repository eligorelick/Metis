import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { enrichFinancialFields } from "@/edgar/financialEnrichment";
import { computeCapital } from "@/pipeline/stageB/capital";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpBalanceSheetRow, FmpCashFlowRow, FmpPayload } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";
import { admittedStatementRow } from "@/providers/fmp";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { runStageB } from "@/pipeline/compute";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { admitCashInvestment, parsePrimaryCashInvestment, type CashInvestmentPeriod, type FilingCashInvestment } from "@/edgar/cashInvestment";

const observedAt = "2026-10-19T12:00:00Z";
const facts: CompanyFacts = { cik: 1878848, entityName: "IREN", facts: {} };
const source = { form: "10-K", accession: "0001878848-26-000052", filingDate: "2026-08-27", documentUrl: "https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm", hash: "fixture" };
const evidence = { issuerId: "1878848", source, periods: [{ start: "2025-07-01", end: "2026-06-30", currency: "USD", status: "established", capex: -4_333_087_000, reason: "cash PPE explicitly excludes separately disclosed hardware", tags: ["us-gaap/PaymentsToAcquirePropertyPlantAndEquipment", "iren/PaymentsRelatedToComputerHardware"], components: [{ qname: "us-gaap:PaymentsToAcquirePropertyPlantAndEquipment", value: 2_998_006_000 }, { qname: "iren:PaymentsRelatedToComputerHardware", value: 1_335_081_000 }] }] };
function sourced<T extends FmpBalanceSheetRow | FmpCashFlowRow>(rows: T[]): FetchResult<FmpPayload<T>> {
  return { ok: true, value: { data: { rows, raw: rows }, source: "edgar", endpoint: "fixture", fetchedAt: observedAt, asOf: "2026-06-30" } };
}
const stale = (): FmpCashFlowRow => ({ cik: "1878848", date: "2026-06-30", reportedCurrency: "USD", operatingCashFlow: 2_100_418_000, netCashProvidedByOperatingActivities: 2_100_418_000, capitalExpenditure: -2_998_006_000, investmentsInPropertyPlantAndEquipment: -2_998_006_000, freeCashFlow: -897_588_000, stockBasedCompensation: 205_023_000 });

describe("cash investment resolves observations within the requested interval", () => {
  const quarter: CashInvestmentPeriod = { ...evidence.periods[0]!, start: "2026-04-01", capex: -500 };
  const annual: CashInvestmentPeriod = { ...quarter, start: "2025-07-01", capex: -9000 };
  const nineMonths: CashInvestmentPeriod = { ...quarter, start: "2025-10-01", capex: -6000 };
  const doc = (periods: CashInvestmentPeriod[], filingDate = "2026-08-27"): FilingCashInvestment => ({ issuerId: "1878848", source: { ...source, filingDate }, periods });
  const row = (): FmpCashFlowRow => ({ date: "2026-06-30", reportedCurrency: "USD", operatingCashFlow: 1000, capitalExpenditure: -100, freeCashFlow: 777, fcf: 777 });
  function permutations<T>(items: T[]): T[][] {
    return items.length < 2 ? [items] : items.flatMap((item, index) => permutations(items.filter((_, i) => i !== index)).map(rest => [item, ...rest]));
  }
  it("admits the direct quarter in every mixed-duration record order and preserves annual admission", () => {
    for (const periods of permutations([annual, quarter, nineMonths])) {
      const original = row();
      const result = admitCashInvestment(original, [doc(periods)], 1878848, "quarter", observedAt).row;
      expect(result).toMatchObject({ capitalExpenditure: -500, freeCashFlow: 500, fcf: 500 });
      expect(result.fieldProvenance?.capitalExpenditure?.periodStart).toBe("2026-04-01");
      expect(original).toEqual(row());
      expect(admitCashInvestment(row(), [doc(periods)], 1878848, "annual", observedAt).row.capitalExpenditure).toBe(-9000);
    }
  });
  it("does not let a later cumulative filing mask an earlier directly reported quarter", () => {
    for (const documents of permutations([doc([quarter], "2026-07-15"), doc([annual, nineMonths])])) {
      expect(admitCashInvestment(row(), documents, 1878848, "quarter", observedAt).row).toMatchObject({ capitalExpenditure: -500, freeCashFlow: 500 });
    }
  });
  it("withholds conflicting latest observations for the same exact interval in every order", () => {
    for (const periods of permutations([quarter, { ...quarter, capex: -700 }])) {
      const result = admitCashInvestment(row(), [doc(periods)], 1878848, "quarter", observedAt);
      expect(result.row).toMatchObject({ capitalExpenditure: null, freeCashFlow: null, fcf: null });
      expect(result.gaps[0]?.reason).toMatch(/conflicting.*interval/i);
    }
    for (const documents of permutations([doc([quarter]), doc([{ ...quarter, capex: -700 }])])) {
      expect(admitCashInvestment(row(), documents, 1878848, "quarter", observedAt).row.freeCashFlow).toBeNull();
    }
  });
  it("keeps newer exact-period refusals and currency conflicts ahead of older valid evidence", () => {
    for (const newest of [{ ...quarter, status: "withheld", capex: null, reason: "unresolved hardware scope" }, { ...quarter, currency: "EUR" }]) {
      for (const documents of permutations([doc([quarter], "2026-07-15"), doc([newest])])) {
        expect(admitCashInvestment(row(), documents, 1878848, "quarter", observedAt).row.freeCashFlow).toBeNull();
      }
    }
    expect(admitCashInvestment(row(), [doc([quarter], "2026-07-15"), doc([{ ...quarter, capex: -700 }])], 1878848, "quarter", observedAt).row.freeCashFlow).toBe(300);
  });
  it("requires one actual interval unless the row explicitly identifies its start", () => {
    for (const periods of permutations([quarter, { ...quarter, start: "2026-03-20", capex: -700 }])) {
      expect(admitCashInvestment(row(), [doc(periods)], 1878848, "quarter", observedAt).row.freeCashFlow).toBeNull();
      expect(admitCashInvestment({ ...row(), periodStart: quarter.start }, [doc(periods)], 1878848, "quarter", observedAt).row.freeCashFlow).toBe(500);
    }
  });
});

describe("cash investment scope cannot preserve pre-existing stale FCF", () => {
  it("recomputes non-null FCF and capex aliases on an established scope correction", () => {
    const original = sourced([stale()]);
    const result = enrichFinancialFields(sourced<FmpBalanceSheetRow>([]), original, facts, "annual", observedAt, [], [evidence]);
    const row = result.cashflow.ok && result.cashflow.value.data.rows[0];
    expect(row).toMatchObject({ capitalExpenditure: -4_333_087_000, investmentsInPropertyPlantAndEquipment: -4_333_087_000, freeCashFlow: -2_232_669_000 });
    expect(original.ok && original.value.data.rows[0]?.freeCashFlow).toBe(-897_588_000);
    if (!row) throw new Error("cash-flow row missing");
    const capital = computeCapital([], [row as Parameters<typeof computeCapital>[1][number]], [], [], { price: null });
    expect(capital.fcf.latestFcfBeforeSbc).toBe(-2_232_669_000);
    expect(capital.fcf.latestFcf).toBe(-2_437_692_000);
  });
  it("invalidates non-null FCF and capex aliases when the source establishes incomplete scope", () => {
    const withheld = { ...evidence, periods: evidence.periods.map(p => ({ ...p, capex: null, status: "withheld", reason: "separate hardware payment has unresolved currency" })) };
    const result = enrichFinancialFields(sourced<FmpBalanceSheetRow>([]), sourced([stale()]), facts, "annual", observedAt, [], [withheld]);
    const row = result.cashflow.ok && result.cashflow.value.data.rows[0];
    expect(row).toMatchObject({ capitalExpenditure: null, investmentsInPropertyPlantAndEquipment: null, freeCashFlow: null });
    expect(result.gaps.some(g => /cash investment/i.test(g.reason))).toBe(true);
    if (!row) throw new Error("cash-flow row missing");
    expect(computeCapital([], [row as Parameters<typeof computeCapital>[1][number]], [], [], { price: null }).fcf.latestFcfBeforeSbc).toBeNull();
  });
  it("capital refuses an explicitly conflicted capex even with non-null stale FCF", () => {
    const row = { ...stale(), date: "2026-06-30", fieldConflicts: { capitalExpenditure: { usable: false as const, vendorValue: -2_998_006_000, secValue: null, reason: "incomplete cash investment scope" } } };
    expect(computeCapital([], [row], [], [], { price: null }).fcf.latestFcfBeforeSbc).toBeNull();
  });
  it("invalidates FCF and capex aliases in the shared admission boundary even for older non-null stored rows", () => {
    const row = { ...stale(), fcf: -897_588_000, fieldConflicts: { capitalExpenditure: { usable: false as const, vendorValue: -2_998_006_000, secValue: null, reason: "incomplete cash investment scope" } } };
    expect(admittedStatementRow(row)).toMatchObject({ freeCashFlow: null, fcf: null, capitalExpenditure: null, investmentsInPropertyPlantAndEquipment: null });
    expect(row.freeCashFlow).toBe(-897_588_000);
  });
  it("withholds runway instead of silently dropping a recent quarter whose cash investment scope was explicitly refused", () => {
    const bundle = completeCurrencyBundle({ burning: true, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    const cf = bundle.statements.cashflowQuarterly;
    if (!cf.ok) throw new Error("missing cash-flow fixture");
    cf.value.data.rows[0] = { ...cf.value.data.rows[0]!, freeCashFlow: -65_000_000,
      fieldConflicts: { capitalExpenditure: { usable: false, vendorValue: -10_000_000, secValue: null, reason: "incomplete cash investment scope" } } };
    const result = runStageB(bundle);
    expect(result.runway?.avgQuarterlyBurn).toBeNull();
    expect(result.runway?.runwayQuarters).toBeNull();
    expect(result.runway?.gaps.some(g => /investment scope/.test(g.reason))).toBe(true);
    expect(buildFilingDisclosures(bundle)?.quarterlyTrend[0]?.freeCashFlow).toBeNull();
  });
  it("does not fall back to generic partial capex when a dated primary document has refused namespace evidence", () => {
    const html = cashSourceFixture("iren-20260630").replace('xmlns:iren="http://www.iren.com/20260630"', 'xmlns:iren="https://lookalike.invalid/hardware"');
    const refused = parsePrimaryCashInvestment(html, { issuerId: "1878848", form: "10-K", accession: source.accession, filingDate: source.filingDate, reportDate: "2026-06-30", primaryDocument: "iren-20260630.htm", documentUrl: source.documentUrl }, "2026-10-19");
    const result = enrichFinancialFields(sourced<FmpBalanceSheetRow>([]), sourced([stale()]), facts, "annual", observedAt, [], [refused]);
    expect(result.cashflow.ok && result.cashflow.value.data.rows[0]).toMatchObject({ freeCashFlow: null, capitalExpenditure: null });
  });
  it("leaves unrelated issuers' vendor capex untouched when no reviewed component mapping exists", () => {
    const otherFacts = { ...facts, cik: 1 };
    const row = { ...stale(), cik: "1" };
    const doc = { issuerId: "1", source: { ...source, reportDate: "2026-06-30" }, periods: [], reason: "No reviewed cash-component mapping for this issuer/form/date" };
    const result = enrichFinancialFields(sourced<FmpBalanceSheetRow>([]), sourced([row]), otherFacts, "annual", observedAt, [], [doc]);
    expect(result.cashflow.ok && result.cashflow.value.data.rows[0]).toMatchObject({ capitalExpenditure: -2_998_006_000, freeCashFlow: -897_588_000 });
  });
  it("retains the filed CFO operand in FCF provenance and refuses a conflicting CFO join", () => {
    const doc = parsePrimaryCashInvestment(cashSourceFixture("iren-20260630"), { issuerId: "1878848", form: "10-K", accession: source.accession, filingDate: source.filingDate, reportDate: "2026-06-30", primaryDocument: "iren-20260630.htm", documentUrl: source.documentUrl }, "2026-10-19");
    const apply = (row: FmpCashFlowRow) => enrichFinancialFields(sourced<FmpBalanceSheetRow>([]), sourced([row]), facts, "annual", observedAt, [], [doc]).cashflow;
    const matched = apply(stale());
    expect(matched.ok && matched.value.data.rows[0]?.fieldProvenance?.freeCashFlow?.tags).toContain("us-gaap/NetCashProvidedByUsedInOperatingActivities");
    const conflict = apply({ ...stale(), operatingCashFlow: 3_000_000_000 });
    expect(conflict.ok && conflict.value.data.rows[0]?.freeCashFlow).toBeNull();
  });
  it("preserves valid quarterly CFO when only cumulative investment evidence is available", () => {
    const doc = parsePrimaryCashInvestment(cashSourceFixture("iren-20260630"), { issuerId: "1878848", form: "10-K", accession: source.accession, filingDate: source.filingDate, reportDate: "2026-06-30", primaryDocument: "iren-20260630.htm", documentUrl: source.documentUrl }, "2026-10-19");
    const row = { ...stale(), periodStart: "2026-04-01", operatingCashFlow: 1_811_092_000, netCashProvidedByOperatingActivities: 1_811_092_000, capitalExpenditure: -1_328_849_000, freeCashFlow: 482_243_000 };
    const result = enrichFinancialFields(sourced<FmpBalanceSheetRow>([]), sourced([row]), facts, "quarter", observedAt, [], [doc]).cashflow;
    expect(result.ok && result.value.data.rows[0]).toMatchObject({ operatingCashFlow: 1_811_092_000, netCashProvidedByOperatingActivities: 1_811_092_000, capitalExpenditure: null, freeCashFlow: null });
  });
  it("refuses stale FCF in earlier quarters covered by an explicitly split cumulative cash-investment definition", () => {
    const doc = parsePrimaryCashInvestment(cashSourceFixture("iren-20260630"), { issuerId: "1878848", form: "10-K", accession: source.accession, filingDate: source.filingDate, reportDate: "2026-06-30", primaryDocument: "iren-20260630.htm", documentUrl: source.documentUrl }, "2026-10-19");
    const row = { ...stale(), date: "2025-12-31", operatingCashFlow: 71_651_000, netCashProvidedByOperatingActivities: 71_651_000, capitalExpenditure: -539_694_000, freeCashFlow: -468_043_000 };
    const result = enrichFinancialFields(sourced<FmpBalanceSheetRow>([]), sourced([row]), facts, "quarter", observedAt, [], [doc]).cashflow;
    expect(result.ok && result.value.data.rows[0]).toMatchObject({ operatingCashFlow: 71_651_000, capitalExpenditure: null, freeCashFlow: null });
  });
  it("preserves a compatible directly reported quarter and never adds hardware twice to an already inclusive vendor amount", () => {
    const direct = { ...evidence, periods: evidence.periods.map(p => ({ ...p, start: "2026-04-01" })) };
    const row = { ...stale(), periodStart: "2026-04-01", capitalExpenditure: -4_333_087_000 };
    const result = enrichFinancialFields(sourced<FmpBalanceSheetRow>([]), sourced([row]), facts, "quarter", observedAt, [], [direct]).cashflow;
    expect(result.ok && result.value.data.rows[0]).toMatchObject({ capitalExpenditure: -4_333_087_000, freeCashFlow: -2_232_669_000 });
  });
});

export const cashSourceFixture = (name: "iren-20260630" | "iren-20260331") => readFileSync(path.resolve("tests/fixtures/iren-source-scope", `${name}-cash.html`), "utf8");
