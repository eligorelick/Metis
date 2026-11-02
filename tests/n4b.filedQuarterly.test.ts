import { describe, expect, it } from "vitest";
import retained from "./fixtures/figr-pre2-quarterly.json";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { applyKeylessFallbacks, type KeylessInputs } from "@/pipeline/keyless";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { YahooClient } from "@/providers/yahoo";

const at = "2026-11-02T00:00:00.000Z";
const facts = retained.companyFacts as CompanyFacts;
const sourced = <T>(data: T) => ({ ok: true as const, value: { data, source: "edgar" as const, endpoint: "retained", fetchedAt: at, asOf: "2026-06-30" } });
function fixture(): KeylessInputs {
  const b = completeCurrencyBundle({});
  const vendor = [
    { date: "2026-06-30", period: "Q2", revenue: 225588000 },
    { date: "2026-03-31", period: "Q1", revenue: 167007000 },
    { date: "2025-12-31", period: "Q4", revenue: 159913000 },
    { date: "2025-09-30", period: "Q3", revenue: 134926000 },
    { date: "2025-06-30", period: "Q2", revenue: 95080000 },
    { date: "2025-03-31", period: "Q1", revenue: 55410000 },
    { date: "2024-12-31", period: "Q4", revenue: 68120000 },
  ].map(r => ({ ...r, fiscalYear: r.date.slice(0, 4), reportedCurrency: "USD", vendorOnly: 7, operatingIncome: 2 }));
  const income = { ok: true as const, value: { ...(b.statements.incomeQuarterly.ok ? b.statements.incomeQuarterly.value : {} as never), data: { rows: vendor, raw: structuredClone(vendor) } } };
  const failed = async () => ({ ok: false as const, gap: { field: "offline", reason: "offline", severity: "info" as const } });
  return { symbol: b.symbol, today: at.slice(0, 10), eodFrom: "2020-01-01", sectorEtfSymbol: null, fmpKeyless: false, statementSource: "auto", edgarConfirmedIssuer: true,
    annualPeriods: 12, quarterlyPeriods: 32, now: () => new Date(at), resolveSectorEtf: () => null,
    fmp: { ...b.statements, incomeQuarterly: income, profile: b.profile, quote: b.quote, eodPrices: b.eodPrices, spy: b.benchmarkPrices.spy, sectorEtf: b.benchmarkPrices.sectorEtf, enterpriseValues: b.enterpriseValues, marketCapHistory: b.marketCapHistory, sharesFloat: b.sharesFloat },
    edgar: { cik: sourced({ cik: facts.cik, cik10: String(facts.cik).padStart(10, "0"), ticker: b.symbol, title: "Example" }),
      registrant: { cik10: String(facts.cik).padStart(10, "0"), name: "Example", tickers: [b.symbol], exchanges: ["NASDAQ"], sic: "6163", sicDescription: "Loan Brokers", stateOfIncorporation: "DE", fiscalYearEnd: "1231", forms: ["10-K", "10-Q"] }, companyFacts: sourced(structuredClone(facts)) },
    yahoo: { dailyHistory: failed, meta: failed, quote: failed, splitHistory: failed } as unknown as YahooClient };
}

describe("N4b L3 filed comparative quarterly series", () => {
  it("builds income quarters without requiring a comparative balance-sheet instant", () => {
    const rows = buildStatementsFromCompanyFacts(facts, { symbol: "TEST", cik: String(facts.cik), asOf: at.slice(0, 10), annualPeriods: 12, quarterlyPeriods: 32, vendorSplits: { status: "unavailable", source: "retained", reason: "offline" } }).incomeQuarterly.rows;
    expect(rows.find(r => r.date === "2025-03-31")?.revenue).toBe(84510000);
    expect(rows.find(r => r.date === "2025-06-30")?.revenue).toBe(106077000);
  });
  it("switches whole comparative rows and refuses a conflicting quarter lacking a one-filing row", async () => {
    const i = fixture(), before = JSON.stringify(i.fmp);
    const out = await applyKeylessFallbacks(i);
    if (!out.members.incomeQuarterly.ok) throw Error("fixture");
    const rows = out.members.incomeQuarterly.value.data.rows;
    for (const [date, revenue] of [["2025-03-31", 84510000], ["2025-06-30", 106077000]] as const) {
      const row = rows.find(r => r.date === date)!;
      expect(row).toMatchObject({ revenue, source: "edgar" });
      expect(row).not.toHaveProperty("vendorOnly");
      expect(new Set(Object.values(row.fieldProvenance ?? {}).flatMap(p => p.filings.map(f => f.accn))).size).toBe(1);
    }
    expect(rows.find(r => r.date === "2024-12-31")?.revenue).toBeNull();
    expect(out.gaps.find(g => g.field === "statements.income.2024-12-31.revenue")?.reason).toMatch(/68120000.*83855000|83855000.*68120000/);
    expect(JSON.stringify(i.fmp)).toBe(before);
  });
  it("uses current-filing YoY comparatives and matched filed Q4 operands, never cross-source growth", async () => {
    const i = fixture(), out = await applyKeylessFallbacks(i), b = completeCurrencyBundle({});
    b.builtAt = at; b.edgar.companyFacts = i.edgar.companyFacts; b.edgar.registrant = i.edgar.registrant;
    b.statements.incomeQuarterly = out.members.incomeQuarterly;
    const trend = buildFilingDisclosures(b)!.quarterlyTrend;
    expect(trend.find(r => r.periodEnd === "2026-06-30")?.revenueYoyPct).toBeCloseTo(112.6644, 3);
    expect(trend.find(r => r.periodEnd === "2026-03-31")?.revenueYoyPct).toBeCloseTo(97.6180, 3);
    expect(trend.find(r => r.periodEnd === "2025-12-31")?.revenueYoyPct).toBeCloseTo(90.7018, 3);
    expect(trend.find(r => r.periodEnd === "2026-06-30")?.revenueQoqPct).toBeCloseTo(35.0769, 3);
  });
  it("withholds mixed-source growth when no matched filed presentation is available", () => {
    const b = completeCurrencyBundle({});
    if (!b.statements.incomeQuarterly.ok) throw Error("fixture");
    b.statements.incomeQuarterly.value.data.rows = [
      { date: "2026-06-30", reportedCurrency: "USD", revenue: 200, source: "edgar" },
      { date: "2026-03-31", reportedCurrency: "USD", revenue: 100 },
    ];
    const row = buildFilingDisclosures(b)!.quarterlyTrend[0]!;
    expect(row.revenueQoqPct).toBeNull();
    expect(row.revenueGrowthNotes?.join(" ")).toMatch(/source|presentation/i);
  });
});
