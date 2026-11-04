// DATA-103 verifier probe (m1-verify-14). Asserts the CORRECT behaviour: the
// income-classification pass must not refuse a SIC-routed bank's total net
// revenue because its unrouted rebuild resolved the ASC-606 fee subset.
import { describe, expect, it } from "vitest";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import { enrichIncomeClassification } from "@/edgar/incomeClassification";
import { bankStatementRouting } from "@/pipeline/keyless";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpIncomeStatementRow, FmpPayload } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";

const at = "2026-06-01T00:00:00Z";
const q = { start: "2026-01-01", end: "2026-03-31", accn: "0000099999-26-000050", filed: "2026-05-01", form: "10-Q", fy: 2026, fp: "Q1" };
// A regional bank (SIC 6022) whose face line is RevenuesNetOfInterestExpense and
// whose ASC-606 note tags the in-scope noninterest income non-dimensionally.
function bankFacts(): CompanyFacts {
  const flows: Record<string, number> = {
    RevenuesNetOfInterestExpense: 5_000e6,
    InterestIncomeExpenseNet: 3_800e6,
    NoninterestIncome: 1_200e6,
    RevenueFromContractWithCustomerExcludingAssessedTax: 700e6, // in-scope fee revenue only
    NetIncomeLoss: 900e6,
  };
  const usGaap: Record<string, unknown> = Object.fromEntries(Object.entries(flows).map(([tag, val]) => [tag, { units: { USD: [{ ...q, val }] } }]));
  usGaap.Assets = { units: { USD: [{ ...q, start: undefined, val: 60_000e6 }] } };
  return { cik: 99999, entityName: "EXAMPLE REGIONAL BANCORP", facts: { "us-gaap": usGaap } };
}

describe("DATA-103: classification rebuild vs SIC bank routing", () => {
  it("the trigger premise: a SIC 6022 registrant is routed as a bank, and the routed build resolves total net revenue", () => {
    expect(bankStatementRouting({ sic: "6022" } as never)).toBe(true);
    const routed = buildStatementsFromCompanyFacts(bankFacts(), { symbol: "RGNL", cik: "0000099999", annualPeriods: 4, quarterlyPeriods: 4, asOf: "2026-06-01", factsObservedAt: at, bankRevenue: true,
      vendorSplits: { status: "unavailable", source: "probe", reason: "probe" } });
    expect(routed.incomeQuarterly.rows[0]!.revenue).toBe(5_000e6);
  });

  it("keeps the keyless (SIC-routed) row's total net revenue after classification", () => {
    const facts = bankFacts();
    const built = buildStatementsFromCompanyFacts(facts, { symbol: "RGNL", cik: "0000099999", annualPeriods: 4, quarterlyPeriods: 4, asOf: "2026-06-01", factsObservedAt: at, bankRevenue: true,
      vendorSplits: { status: "unavailable", source: "probe", reason: "probe" } });
    const input: FetchResult<FmpPayload<FmpIncomeStatementRow>> = { ok: true, value: { data: { rows: [built.incomeQuarterly.rows[0]!], raw: [] }, asOf: "2026-03-31", source: "edgar", endpoint: "companyfacts", fetchedAt: at } };
    const out = enrichIncomeClassification(input, facts, "quarter", at, { bankRevenue: true });
    if (!out.income.ok) throw new Error("income expected");
    const row = out.income.value.data.rows[0]!;
    expect(row.revenue).toBe(5_000e6);
  });

  it("keeps the vendor row's total net revenue for the same bank (FMP-key path)", () => {
    const facts = bankFacts();
    const rows = [{ cik: "0000099999", date: "2026-03-31", reportedCurrency: "USD", filingDate: "2026-05-01", revenue: 5_000e6, netIncome: 900e6 }];
    const input: FetchResult<FmpPayload<FmpIncomeStatementRow>> = { ok: true, value: { data: { rows, raw: structuredClone(rows) }, asOf: "2026-03-31", source: "fmp", endpoint: "fixture", fetchedAt: at } };
    const out = enrichIncomeClassification(input, facts, "quarter", at, { bankRevenue: true });
    if (!out.income.ok) throw new Error("income expected");
    expect(out.income.value.data.rows[0]!.revenue).toBe(5_000e6);
  });

  it("control: without the ASC-606 total the same bank's revenue is kept", () => {
    const facts = bankFacts();
    delete (facts.facts["us-gaap"] as Record<string, unknown>).RevenueFromContractWithCustomerExcludingAssessedTax;
    const rows = [{ cik: "0000099999", date: "2026-03-31", reportedCurrency: "USD", filingDate: "2026-05-01", revenue: 5_000e6, netIncome: 900e6 }];
    const input: FetchResult<FmpPayload<FmpIncomeStatementRow>> = { ok: true, value: { data: { rows, raw: structuredClone(rows) }, asOf: "2026-03-31", source: "fmp", endpoint: "fixture", fetchedAt: at } };
    const out = enrichIncomeClassification(input, facts, "quarter", at, { bankRevenue: true });
    if (!out.income.ok) throw new Error("income expected");
    expect(out.income.value.data.rows[0]!.revenue).toBe(5_000e6);
    expect(out.gaps).toEqual([]);
  });
  it.each([true, false])("keeps disagreement and industrial refusals (bank routing %s)", bankRevenue => {
    const rows = [{ cik: "0000099999", date: "2026-03-31", reportedCurrency: "USD", filingDate: "2026-05-01", revenue: 4_000e6 }];
    const input: FetchResult<FmpPayload<FmpIncomeStatementRow>> = { ok: true, value: { data: { rows, raw: rows }, asOf: "2026-03-31", source: "fmp", endpoint: "fixture", fetchedAt: at } };
    const out = enrichIncomeClassification(input, bankFacts(), "quarter", at, { bankRevenue });
    expect(out.income.ok && out.income.value.data.rows[0]!.revenue).toBeNull();
    expect(out.gaps.some(g => bankRevenue ? g.reason.includes(`filed ${5_000e6}`)
      : g.reason.includes(`contract-revenue fact ${700e6}`) && g.reason.includes("not established as consolidated"))).toBe(true);
  });

});
