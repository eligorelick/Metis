import { withFixtureQuoteDay } from "./helpers/valuationUse";
import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

function fixture() {
  const b = withFixtureQuoteDay(completeCurrencyBundle({}), "2026-03-31");
  if (!b.quote.ok || !b.profile.ok) throw Error("fixture");
  b.profile.value.data.rows[0]!.isAdr = false;
  b.quote.value.data.rows[0]!.marketCap = b.quote.value.data.rows[0]!.price! * 100e6;
  b.edgar.cik = { ok: true, value: { source: "edgar", endpoint: "synthetic", fetchedAt: b.builtAt, asOf: "2026-05-01", data: { cik: 42, cik10: "0000000042", ticker: b.symbol, title: "Synthetic" } } };
  b.edgar.registrant = { name: "Synthetic", cik10: "0000000042", tickers: [b.symbol], exchanges: [], sic: null, sicDescription: null, fiscalYearEnd: "1231", forms: ["10-K"], stateOfIncorporation: null };
  const points: object[] = [], covers: object[] = [];
  for (const family of [b.statements.incomeQuarterly, b.statements.incomeAnnual]) {
    if (!family.ok) throw Error("fixture");
    for (const [i, row] of family.value.data.rows.entries()) {
      delete row.weightedAverageShsOutDil; delete row.weightedAverageShsOut;
      if (i) continue;
      row.cik = "42";
      const start = row.date!.endsWith("03-31") ? "2026-01-01" : "2025-01-01";
      row.periodStart = start; row.filingDate = "2026-05-01";
      const point = { start, end: row.date!, val: 100, filed: "2026-05-01", form: row.period === "FY" ? "10-K" : "10-Q", accn: "0000000042-26-000001" };
      points.push(point); covers.push({ ...point, start: undefined, val: 99e6 });
      row.fieldConflicts = { weightedAverageShsOutDil: { usable: false, vendorValue: 100e6, secValue: 100, reason: "unit disagreement", secEvidence: {
        source: "edgar", unit: "shares", periodStart: start, periodEnd: row.date!, observedAt: b.builtAt,
        tags: ["us-gaap/WeightedAverageNumberOfDilutedSharesOutstanding"], filings: [point] } } };
    }
  }
  b.edgar.companyFacts = { ok: true, value: { source: "edgar", endpoint: "synthetic", fetchedAt: b.builtAt, asOf: "2026-05-01", data: { cik: 42, entityName: "Synthetic", facts: {
    "us-gaap": { WeightedAverageNumberOfDilutedSharesOutstanding: { units: { shares: points } } },
    dei: { EntityCommonStockSharesOutstanding: { units: { shares: covers } } },
  } } } };
  return b;
}

describe("D-188 independently corroborated filer share units", () => {
  it("repairs exact million scaling in the calculation view and discloses it", () => {
    const b = fixture(), before = JSON.stringify(b), c = runStageB(b);
    expect(c.fairValue.perShare).not.toBeNull();
    expect(c.valuation.notes.join(" ")).toMatch(/filer share-unit repair.*1000000/i);
    expect(c.gaps.some(g => /filer share-unit repair/i.test(g.reason))).toBe(true);
    expect(JSON.stringify(b)).toBe(before);
  });
  it.each(["wrong-factor", "cover", "capitalization", "old-cover", "future-cover", "already-scaled", "future-quote", "intervening-split"])("refuses %s", mode => {
    const b = fixture();
    if (!b.edgar.companyFacts.ok || !b.quote.ok) throw Error("fixture");
    const covers = (b.edgar.companyFacts.value.data.facts.dei!.EntityCommonStockSharesOutstanding as { units: { shares: { val: number; end: string; filed: string }[] } }).units.shares;
    if (mode === "cover") for (const p of covers) p.val = 80e6;
    if (mode === "capitalization") b.quote.value.data.rows[0]!.marketCap = b.quote.value.data.rows[0]!.price! * 80e6;
    if (mode === "future-quote") b.quote.value.data.rows[0]!.timestamp = Date.parse("2027-01-01T20:00:00Z") / 1000;
    if (mode === "intervening-split") b.edgar.shareBasis = { basisDay: b.builtAt.slice(0, 10), splits: {
      asOf: b.builtAt.slice(0, 10), vendor: { status: "retrieved", source: "synthetic" }, coverage: [{ from: "2020-01-01", to: b.builtAt.slice(0, 10) }], unresolved: [], notes: [],
      events: [{ date: "2026-06-01", ratio: 2, tagged: 2, evidence: 2, contextDates: ["2026-06-01"], announced: "2026-05-01", firstAdjustedSession: "2026-06-01", sessionWindow: { from: "2026-06-01", to: "2026-06-01" }, legalFrom: "2026-06-01", sources: ["edgar", "vendor"] }],
    } };
    if (mode === "old-cover") for (const p of covers) p.end = "2024-01-01";
    if (mode === "future-cover") for (const p of covers) p.filed = "2027-01-01";
    if (mode === "wrong-factor" || mode === "already-scaled") for (const family of [b.statements.incomeQuarterly, b.statements.incomeAnnual]) {
      if (!family.ok) throw Error("fixture");
      family.value.data.rows[0]!.fieldConflicts!.weightedAverageShsOutDil!.secValue = mode === "wrong-factor" ? 10 : 100e6;
    }
    expect(runStageB(b).fairValue.perShare).toBeNull();
  });
});
