import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import { admitDebtFields, enrichFinancialFields } from "@/edgar/financialEnrichment";
import type { DebtPresentationInput } from "@/edgar/debtPresentation";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { ExtractedSection } from "@/pipeline/types";
import type { FmpBalanceSheetRow } from "@/providers/fmp";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { runStageB } from "@/pipeline/compute";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import type { ValidationReport } from "@/pipeline/stageA/validate";

const fixture = JSON.parse(readFileSync("fixtures/edgar/qcom-debt-presentation-20260628.json", "utf8")) as DebtPresentationInput;
const observedAt = "2026-10-16T09:33:42.064Z";
const section: ExtractedSection = { ...fixture.source, text: "notes", statementsText: fixture.text, sectionName: "tenQNotes", method: "header-regex", chars: 5 };
function source(tagValue = fixture.tagValue) {
  const point = { end: fixture.periodEnd, accn: fixture.source.accession, filed: fixture.source.filingDate, form: "10-Q", fy: 2026, fp: "Q3" };
  const values: Record<string, number> = { Assets: 57367e6, StockholdersEquity: 27658e6, CashAndCashEquivalentsAtCarryingValue: 4533e6,
    DebtCurrent: 2489e6, LongTermDebt: tagValue, LongTermDebtCurrent: 1991e6 };
  const facts: CompanyFacts = { cik: Number(fixture.tagSource.cik), entityName: "QUALCOMM", facts: { "us-gaap": Object.fromEntries(Object.entries(values).map(([tag, val]) => [tag, { units: { USD: [{ ...point, val }] } }])) } };
  facts.facts["us-gaap"]!.RevenueFromContractWithCustomerExcludingAssessedTax = { units: { USD: [{ ...point, start: "2026-03-30", val: 9947e6 }, { ...point, start: "2024-09-30", end: "2025-09-28", val: 44000e6, form: "10-K", fp: "FY", fy: 2025, filed: "2025-11-01" }] } };
  const built = buildStatementsFromCompanyFacts(facts, { symbol: "QCOM", cik: fixture.tagSource.cik, asOf: observedAt.slice(0, 10), factsObservedAt: observedAt, annualPeriods: 2, quarterlyPeriods: 4, vendorSplits: { status: "retrieved", source: "test:vendor", events: [], coverage: [{ from: "2020-01-01", to: observedAt.slice(0, 10) }] } });
  const row = built.balanceQuarterly.rows.find((entry) => entry.date === fixture.periodEnd)!;
  return { facts, row };
}

describe("QCOM source presentation reaches normal enrichment and immutable analysis context", () => {
  it("restores current maturities subtracted from a filed noncurrent line, exactly once", () => {
    const { facts, row } = source();
    expect(row.longTermDebt).toBe(10790e6); // Existing taxonomy-only default; statement context is acquired separately.
    const admitted = admitDebtFields(row, facts, "USD", observedAt, [section]);
    expect(admitted.row).toMatchObject({ shortTermDebt: 2489e6, longTermDebt: 12781e6, totalDebt: 15270e6, netDebt: 10737e6 });
    expect(admitted.row.fieldProvenance?.longTermDebt.tags).toContain("filing:balance-sheet:long-term-debt");
    expect(admitDebtFields(admitted.row, facts, "USD", observedAt, [section]).row.totalDebt).toBe(15270e6);
    expect(row.totalDebt).toBe(13279e6);
  });

  it("preserves genuine inclusive tags and rejects conflicting or mismatched presentations", () => {
    const inclusive = source(14772e6);
    expect(admitDebtFields(inclusive.row, inclusive.facts, "USD", observedAt, [section]).row.totalDebt).toBe(15270e6);
    const { facts, row } = source();
    const conflict = { ...section, statementsText: fixture.text.replace("Other liabilities 5,434 4,911", "Other liabilities 5,434 4,900") };
    expect(admitDebtFields(row, facts, "USD", observedAt, [conflict]).row.totalDebt).toBeNull();
    expect(admitDebtFields(row, facts, "USD", observedAt, [{ ...section, accession: "0000804328-26-000061" }]).row.totalDebt).toBe(13279e6);
    expect(admitDebtFields(row, facts, "EUR", observedAt, [section]).row.totalDebt).toBe(13279e6);
  });

  it("normalizes both enrichment and raw bundle payload without changing the original snapshot", () => {
    const { facts, row } = source();
    const bundle = completeCurrencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    bundle.builtAt = observedAt;
    if (!bundle.statements.balanceQuarterly.ok) throw new Error("fixture missing");
    bundle.statements.balanceQuarterly.value.data.rows[0] = row as FmpBalanceSheetRow;
    bundle.edgar = { ...bundle.edgar, tenQNotes: { ok: true, value: { data: section, source: "edgar", asOf: fixture.periodEnd, fetchedAt: observedAt, endpoint: fixture.source.documentUrl } },
      companyFacts: { ok: true, value: { data: facts, source: "edgar", asOf: fixture.periodEnd, fetchedAt: observedAt, endpoint: "frozen facts" } } };
    const enriched = enrichFinancialFields(bundle.statements.balanceQuarterly, bundle.statements.cashflowQuarterly, facts, "quarter", observedAt, [section]);
    if (!enriched.balance.ok) throw new Error("fixture missing");
    expect(enriched.balance.value.data.rows[0]!.totalDebt).toBe(15270e6);
    const computed = runStageB(bundle);
    const payload = assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] } as unknown as ValidationReport);
    const record = payload.provenanceRegistry?.find((entry) => entry.id === "payload.statements.balance-sheet-quarterly.2026-06-28.total-debt");
    expect(record?.value).toBe(15270e6);
    expect(row.totalDebt).toBe(13279e6);
  });
});
