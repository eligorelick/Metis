import { describe, expect, it } from "vitest";
import retained from "./fixtures/figr-pre2-quarterly.json";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { applyKeylessFallbacks, type KeylessInputs } from "@/pipeline/keyless";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { YahooClient } from "@/providers/yahoo";
import { factsForFilings } from "@/edgar/filedPresentation";

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
  // Coordinator review of the final live preflight (2026-11-02): the live vendor
  // Q4 2025 revenue was 223,181,000 against the filed 506,865,000 less nine months
  // 346,952,000. The standard fiscal-year-less-nine-months quarter, each operand the
  // current period of its own filing and the nine months filed first, is a whole
  // filed row (N3). A derivation from later comparatives (Q4 2024) stays refused.
  it("switches a conflicting Q4 to the filed FY-minus-nine-months row on its canonical lineage", async () => {
    const i = fixture();
    if (!i.fmp.incomeQuarterly.ok) throw Error("fixture");
    i.fmp.incomeQuarterly.value.data.rows.find(r => r.date === "2025-12-31")!.revenue = 223181000;
    const out = await applyKeylessFallbacks(i);
    if (!out.members.incomeQuarterly.ok) throw Error("fixture");
    const rows = out.members.incomeQuarterly.value.data.rows;
    const switched = rows.find(r => r.date === "2025-12-31")!;
    expect(switched).toMatchObject({ revenue: 159913000, source: "edgar" });
    expect(switched).not.toHaveProperty("vendorOnly");
    expect(switched.fieldProvenance?.revenue?.derivation).toBe("fy-minus-ytd");
    expect(switched.fieldProvenance?.revenue?.filings).toHaveLength(2);
    expect(out.gaps.find(g => g.field === "statements.sourceSwitch.incomeQuarterly.2025-12-31")?.reason).toMatch(/canonical filing lineage/);
    expect(out.gaps.some(g => g.field === "statements.income.2025-12-31.revenue")).toBe(false);
    expect(rows.find(r => r.date === "2024-12-31")?.revenue).toBeNull();
  });
  it("uses current-filing YoY comparatives and matched filed Q4 operands, never cross-source growth", async () => {
    const i = fixture(), out = await applyKeylessFallbacks(i), b = completeCurrencyBundle({});
    b.builtAt = at; b.edgar.companyFacts = i.edgar.companyFacts; b.edgar.registrant = i.edgar.registrant; b.edgar.cik = i.edgar.cik;
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
  it("prefers the current filing's prior-year comparative over a later changed copy", () => {
    const i = fixture(), b = completeCurrencyBundle({});
    b.builtAt = at; b.edgar.companyFacts = i.edgar.companyFacts; b.edgar.cik = i.edgar.cik;
    if (!b.edgar.companyFacts.ok || !b.statements.incomeQuarterly.ok) throw Error("fixture");
    const revenue = b.edgar.companyFacts.value.data.facts["us-gaap"]!.Revenues as { units: { USD: Record<string, unknown>[] } };
    revenue.units.USD.push({ start: "2025-04-01", end: "2025-06-30", val: 206077000, form: "10-Q", filed: "2026-10-01", accn: "later", fp: "Q3", fy: 2026 });
    b.statements.incomeQuarterly.value.data.rows = [
      { date: "2026-06-30", reportedCurrency: "USD", revenue: 225588000, source: "edgar" },
      { date: "2025-06-30", reportedCurrency: "USD", revenue: 206077000, source: "edgar" },
    ];
    expect(buildFilingDisclosures(b)!.quarterlyTrend[0]!.revenueYoyPct).toBeCloseTo(112.6644, 3);
  });
  it.each([true, false])("a successor comparative cannot truncate admitted predecessor quarters (continuity=%s)", async continuous => {
    const i = fixture(); i.statementSource = "edgar";
    if (!i.edgar.companyFacts.ok) throw Error("fixture");
    const original = structuredClone(i.edgar.companyFacts.value.data);
    for (const raw of Object.values(i.edgar.companyFacts.value.data.facts["us-gaap"] ?? {})) {
      const concept = raw as { units: Record<string, { end: string; val: number }[]> };
      for (const [unit, points] of Object.entries(concept.units)) concept.units[unit] = points.filter(p => ["2026-06-30", "2025-06-30"].includes(p.end));
    }
    if (!continuous) {
      i.edgar.companyFacts.value.data.facts["us-gaap"]!.NetIncomeLoss = { units: {} };
      delete i.edgar.companyFacts.value.data.facts["us-gaap"]!.NetIncomeLossAvailableToCommonStockholdersBasic;
    }
    i.edgar.predecessor = { cik10: "0000000002", name: "Predecessor", facts: original, endpoint: "retained", fetchedAt: at,
      via: { accession: "predecessor", form: "10-Q", filed: "2026-05-15", successorFormAccession: "successor" } };
    const out = await applyKeylessFallbacks(i);
    if (!out.members.incomeQuarterly.ok) throw Error("fixture");
    expect(out.members.incomeQuarterly.value.data.rows.some(r => r.date === "2026-03-31")).toBe(continuous);
    expect(out.members.incomeQuarterly.value.data.rows.filter(r => r.date === "2025-06-30")).toHaveLength(1);
  });
  it("isolates one filing without retaining malformed companion concepts or mutating the source", () => {
    const f = structuredClone(facts);
    f.facts["other"] = undefined as never;
    f.facts["us-gaap"]!.malformed = { units: null } as never;
    const before = JSON.stringify(f);
    const selected = factsForFilings(f, ["0002064124-26-000029"]);
    expect(selected.facts["us-gaap"]).not.toHaveProperty("malformed");
    const built = buildStatementsFromCompanyFacts(selected, { symbol: "TEST", cik: String(facts.cik), asOf: at.slice(0, 10), annualPeriods: 12, quarterlyPeriods: 32, vendorSplits: { status: "unavailable", source: "retained", reason: "offline" } });
    expect(built.incomeQuarterly.rows.find(r => r.date === "2025-03-31")?.operatingIncome).toBe(8072000);
    expect(built.incomeQuarterly.rows.find(r => r.date === "2025-06-30")).toBeUndefined();
    expect(JSON.stringify(f)).toBe(before);
  });
});
