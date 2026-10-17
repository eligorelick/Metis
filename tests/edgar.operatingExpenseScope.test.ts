import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { CompanyFacts } from "@/edgar/xbrl";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const source = JSON.parse(readFileSync("fixtures/edgar/expe-operating-expense-components-2026.json", "utf8")) as CompanyFacts;
const options = { symbol: "EXPE", cik: "0001324424", asOf: "2026-10-17", factsObservedAt: "2026-10-17T03:00:16.773Z", annualPeriods: 10, quarterlyPeriods: 2, vendorSplits: { status: "retrieved" as const, source: "test:vendor", events: [], coverage: [{ from: "1900-01-01", to: "2026-10-17" }] } };
function built(facts = source) { return buildStatementsFromCompanyFacts(facts, options); }
function legacyBundle() {
  const b = completeCurrencyBundle({ annualCurrency: "USD" });
  b.builtAt = "2026-10-17T00:00:00Z";
  const result = built().incomeQuarterly;
  const rows = result.rows.map((r) => ({ ...r, operatingExpenses: r.sellingGeneralAndAdministrativeExpenses }));
  b.statements.incomeQuarterly = { ok: true, value: { source: "edgar", endpoint: "https://data.sec.gov/api/xbrl/companyfacts/CIK0001324424.json", asOf: "2026-06-30", fetchedAt: b.builtAt, data: { rows, raw: {} } } };
  return b;
}

describe("operating expense total completeness", () => {
  it("does not turn the actual Q1/Q2 direct-marketing-plus-G&A subset into a complete operating expense total", () => {
    const result = built().incomeQuarterly;
    expect(result.rows.map((r) => [r.date, r.sellingGeneralAndAdministrativeExpenses])).toEqual([["2026-06-30", 2323e6], ["2026-03-31", 2052e6]]);
    expect(result.rows.map((r) => r.operatingExpenses)).toEqual([null, null]);
    expect(result.notes.join(" ")).toMatch(/operatingExpenses.*withheld.*complete/i);
  });
  it("withholds the frozen legacy SEC subset at the report boundary while retaining the raw observations", () => {
    const b = legacyBundle();
    const d = buildFilingDisclosures(b);
    expect(d?.quarterlyTrend.map((r) => r.operatingExpenses)).toEqual([null, null]);
    expect(d?.notes.join(" ")).toMatch(/operating expenses.*2026-06-30.*withheld.*complete/i);
    const table = filingDisclosureTables(d, "fundamentals").find((t) => t.heading === "Quarterly trend (last eight quarters)");
    expect(table?.rows.map((r) => r[6])).toEqual(["—", "—"]);
    if (b.statements.incomeQuarterly.ok) expect(b.statements.incomeQuarterly.value.data.rows[0]?.operatingExpenses).toBe(2323e6);
  });
  it("preserves vendor totals and synthetic explicit standard-tag totals", () => {
    const b = legacyBundle();
    if (!b.statements.incomeQuarterly.ok) throw new Error("fixture missing");
    b.statements.incomeQuarterly.value.source = "fmp";
    expect(buildFilingDisclosures(b)?.quarterlyTrend[0]?.operatingExpenses).toBe(2323e6);
    const tagged = structuredClone(source);
    // Positive control only: the actual retained filing has no such tag.
    tagged.facts["us-gaap"]!.OperatingExpenses = { label: "Operating expenses", units: { USD: [{ start: "2026-04-01", end: "2026-06-30", val: 3112e6, accn: "0001324424-26-000053", filed: "2026-08-06", form: "10-Q", fp: "Q2", fy: 2026 }] } };
    const parsed = built(tagged).incomeQuarterly;
    expect(parsed.rows[0]?.operatingExpenses).toBe(3112e6);
    b.statements.incomeQuarterly.value.source = "edgar";
    b.statements.incomeQuarterly.value.data.rows = parsed.rows;
    expect(buildFilingDisclosures(b)?.quarterlyTrend[0]?.operatingExpenses).toBe(3112e6);
  });
  it.each(["wrong-tag", "wrong-period", "wrong-currency", "wrong-source"])("withholds a legacy SEC field with incomplete total proof (%s)", (mutation) => {
    const b = legacyBundle();
    if (!b.statements.incomeQuarterly.ok) throw new Error("fixture missing");
    const r = b.statements.incomeQuarterly.value.data.rows[0]!;
    r.fieldProvenance = { ...r.fieldProvenance, operatingExpenses: { ...r.fieldProvenance!.revenue!, tags: ["us-gaap/OperatingExpenses"] } };
    const proof = r.fieldProvenance.operatingExpenses!;
    if (mutation === "wrong-tag") proof.tags = ["us-gaap/GeneralAndAdministrativeExpense"];
    if (mutation === "wrong-period") proof.periodEnd = "2026-03-31";
    if (mutation === "wrong-currency") proof.unit = "EUR";
    if (mutation === "wrong-source") Object.assign(proof, { source: "fmp" }); // malformed retained JSON
    expect(buildFilingDisclosures(b)?.quarterlyTrend[0]?.operatingExpenses).toBeNull();
  });
});
