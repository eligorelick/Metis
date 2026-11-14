import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import { assembleContextPayload, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpIncomeStatementRow } from "@/providers/fmp";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { withIncomeOperatingBasis } from "@/pipeline/incomeBasis";
import retained from "./fixtures/figr-pre2-common-earnings.json";

function fixture() {
  const b = completeCurrencyBundle({});
  b.builtAt = retained.builtAt;
  if (!b.profile.ok || !b.quote.ok || !b.statements.incomeQuarterly.ok) throw new Error("fixture");
  Object.assign(b.profile.value.data.rows[0]!, { cik: "0002064124", isAdr: false });
  Object.assign(b.quote.value.data.rows[0]!, { price: 21.58, marketCap: 4_842_074_477.76, timestamp: Date.parse("2026-10-30T20:00:00Z") / 1000 });
  b.edgar.registrant = { cik10: "0002064124", name: "Retained issuer", tickers: [b.symbol], exchanges: ["Nasdaq"], sic: "3571", sicDescription: "Computers", fiscalYearEnd: "1231", stateOfIncorporation: "DE", forms: ["10-Q", "10-K"] };
  b.edgar.cik = { ok: true, value: { ...structuredClone(retained.cik.value), source: "edgar", data: { ...retained.cik.value.data, ticker: b.symbol } } };
  b.edgar.companyFacts = structuredClone(retained.companyFacts) as NonNullable<typeof b.edgar.companyFacts>;
  b.statements.incomeQuarterly.value.data.rows = structuredClone(retained.rows) as FmpIncomeStatementRow[];
  return b;
}
const pe = (b: ReturnType<typeof fixture>) => runStageB(b).valuation.multiples!.multiples.find(m => m.key === "peTtm")!;

describe("L2 filed aggregate common-earnings P/E", () => {
  it("uses four contiguous filed common numerators without inventing the IPO quarter's EPS", () => {
    const b = fixture(), before = JSON.stringify(b), c = runStageB(b);
    const multiple = c.valuation.multiples!.multiples.find(m => m.key === "peTtm")!;
    expect(multiple.current).toBeCloseTo(24.307358750213353, 8);
    expect(multiple.basis).toMatch(/aggregate basis/i);
    expect(multiple.basis).toMatch(/TTM/);
    // D-260: the missing Q1 common numerator is now admitted with the other
    // additive fields, before the later aggregate-only fallback runs.
    expect(c.gaps).toContainEqual(expect.objectContaining({ field: "statements.income.2026-03-31.netIncomeAvailableToCommon",
      reason: expect.stringMatching(/44945000.*0002064124-26-000029/) }));
    const admitted = withIncomeOperatingBasis(b).statements.incomeQuarterly;
    if (!admitted.ok) throw new Error("fixture");
    const q4 = admitted.value.data.rows.find(r => r.date === "2025-12-31")!;
    expect(q4.netIncomeAvailableToCommon).toBe(23_027_000);
    expect(q4.fieldProvenance?.netIncomeAvailableToCommon).toMatchObject({ derivation: "fy-minus-ytd",
      filings: [{ accn: "0002064124-26-000009" }, { accn: "0002064124-25-000032" }] });
    // This older retained row predates flowOperands; its references bind the
    // original amounts retained in companyfacts, rather than rewriting history.
    const concept = (b.edgar.companyFacts as { ok: true; value: { data: CompanyFacts } }).value.data.facts["us-gaap"]!.NetIncomeLossAvailableToCommonStockholdersBasic as { units: { USD: { start: string; end: string; accn: string; val: number }[] } };
    const points = [
      concept.units.USD.find(p => p.accn === "0002064124-26-000009" && p.start === "2025-01-01" && p.end === "2025-12-31")!,
      concept.units.USD.find(p => p.accn === "0002064124-25-000032" && p.start === "2025-01-01" && p.end === "2025-09-30")!,
    ];
    expect(points.map(p => p.accn)).toEqual(["0002064124-26-000009", "0002064124-25-000032"]);
    expect(points[0]!.val - points[1]!.val).toBe(23_027_000);
    expect(c.gaps.some(g => /commonIncome/.test(g.field) && /unavailable/.test(g.reason))).toBe(false);
    expect(serializePayloadForPrompt(assembleContextPayload(b, c, { checks: [], flags: [], gaps: [] }))).toMatch(/aggregate basis/i);
    expect(JSON.stringify(b)).toBe(before);
  });
  it("keeps FY less nine-month common income additive with both filed operands", () => {
    const facts = retained.companyFacts.value.data as CompanyFacts;
    const built = buildStatementsFromCompanyFacts(facts, { symbol: "TEST", cik: "0002064124", asOf: retained.builtAt.slice(0, 10), factsObservedAt: retained.companyFacts.value.fetchedAt,
      annualPeriods: 3, quarterlyPeriods: 5, vendorSplits: { status: "unavailable", source: "test", reason: "no per-share facts used" } });
    const row = built.incomeQuarterly.rows.find(r => r.date === "2025-12-31")!;
    expect(row.netIncomeAvailableToCommon).toBe(23_027_000);
    expect(row.fieldProvenance?.netIncomeAvailableToCommon).toMatchObject({ derivation: "fy-minus-ytd", periodStart: "2025-10-01", filings: [{ accn: "0002064124-26-000009" }, { accn: "0002064124-25-000032" }] });
    const points = row.fieldProvenance!.netIncomeAvailableToCommon!.flowOperands![0]!.points;
    expect(points.map(p => p.accn)).toEqual(["0002064124-26-000009", "0002064124-25-000032"]);
    expect(points[0]!.val - points[1]!.val).toBe(23_027_000);
    expect(row.epsDiluted).toBeNull();
  });
  it.each(["issuer", "currency", "future", "unavailable", "conflict", "missing-quarter"])("refuses %s common-income supplementation", mode => {
    const b = fixture();
    if (!b.statements.incomeQuarterly.ok || !b.edgar.companyFacts?.ok) throw new Error("fixture");
    const row = b.statements.incomeQuarterly.value.data.rows[1]!;
    if (mode === "issuer") row.cik = "0000000099";
    if (mode === "currency") row.reportedCurrency = "EUR";
    if (mode === "future") b.edgar.companyFacts.value.fetchedAt = "2026-12-01T00:00:00Z";
    if (mode === "unavailable") b.edgar.companyFacts = { ok: false, gap: { field: "edgar.companyFacts", severity: "info", reason: "unavailable" } };
    if (mode === "conflict") row.fieldConflicts = { netIncomeAvailableToCommon: { usable: false, reason: "retained explicit refusal", vendorValue: null, secValue: 44_945_000 } };
    if (mode === "missing-quarter") b.statements.incomeQuarterly.value.data.rows.splice(2, 1);
    if (mode === "currency" || mode === "missing-quarter") expect(pe(b).basis).toMatch(/FY|annual/);
    else expect(pe(b).current).toBeNull();
  });
  it("keeps complete per-share TTM EPS first choice", () => {
    const b = fixture();
    if (b.statements.incomeQuarterly.ok) b.statements.incomeQuarterly.value.data.rows[2]!.epsDiluted = 0.1;
    expect(pe(b).current).toBeCloseTo(22.2474226804, 8);
    expect(pe(b).basis).toContain("price / epsDiluted");
  });
});
