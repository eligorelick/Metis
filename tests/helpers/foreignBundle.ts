import { completeCurrencyBundle, M } from "./currencyBundle";

export function foreignBundle(currency = "TWD", ratio = 5) {
  const b = completeCurrencyBundle({ symbol: "ADRX", debt: 300, annualCurrency: currency, quarterCurrencies: Array(4).fill(currency), siblingQuarterCurrencies: Array(4).fill(currency), sic: "3571" });
  if (!b.profile.ok || !b.quote.ok) throw new Error("fixture unavailable");
  Object.assign(b.profile.value.data.rows[0]!, { isAdr: true, country: "TW", cik: "0000000042" });
  Object.assign(b.quote.value.data.rows[0]!, { timestamp: Date.parse("2026-07-02T21:00:00Z") / 1000 });
  b.sharesFloat = { ok: true, value: { source: "fmp", endpoint: "shares-float", asOf: "2026-07-02", fetchedAt: b.builtAt, data: { rows: [{ date: "2026-07-02", outstandingShares: 100 * M }], raw: {} } } };
  for (const family of [b.statements.incomeAnnual, b.statements.incomeQuarterly]) if (family.ok) {
    for (const row of family.value.data.rows) row.weightedAverageShsOut = row.weightedAverageShsOutDil;
  }
  if (b.statements.balanceAnnual.ok) for (const row of b.statements.balanceAnnual.value.data.rows) Object.assign(row, { totalCurrentAssets: 600 * M, totalCurrentLiabilities: 400 * M, retainedEarnings: 300 * M });
  const point = { end: "2025-12-31", val: 100 * M * ratio, accn: "0000000042-26-000001", filed: "2026-02-01", form: "20-F", fp: "FY", fy: 2025 };
  b.edgar.cik = { ok: true, value: { source: "edgar", endpoint: "company_tickers.json", asOf: "2026-07-02", fetchedAt: b.builtAt, data: { cik: 42, cik10: "0000000042", ticker: b.symbol, title: "ADRX" } } };
  b.edgar.registrant = { name: "ADRX", cik10: "0000000042", tickers: [b.symbol], exchanges: ["NYSE"], sic: "3571", sicDescription: null, fiscalYearEnd: "1231", forms: ["20-F"], stateOfIncorporation: null };
  b.edgar.companyFacts = { ok: true, value: { source: "edgar", endpoint: "companyfacts/CIK0000000042.json", asOf: "2025-12-31", fetchedAt: b.builtAt, data: { cik: 42, entityName: "ADRX", facts: {
    dei: { EntityCommonStockSharesOutstanding: { units: { shares: [point] } } },
    "ifrs-full": { WeightedAverageShares: { units: { shares: [{ ...point, start: "2025-01-01" }] } } },
  } } } };
  b.valuationFx = { ok: true, value: { source: "fred", endpoint: `fredgraph.csv?id=${currency === "EUR" ? "DEXUSEU" : "DEXTAUS"}`, asOf: "2026-07-02", fetchedAt: b.builtAt, data: [{ date: "2026-07-02", value: currency === "EUR" ? 1.2 : 32 }] } };
  return b;
}
