import { describe, expect, it } from "vitest";
import { convertibleInstrumentsAt, convertibleVariants, foldConvertiblePreferred, type ConvertibleInstrument } from "@/pipeline/stageB/convertibles";
import type { CompanyFacts } from "@/edgar/xbrl";

const instant = (val: number, end = "2026-06-30", filed = "2026-07-30") => ({ val, end, filed, form: "10-Q", accn: "test" });
const fact = (val: number, unit = "USD") => ({ units: { [unit]: [instant(val)] } });
const note = (ratio = 1): ConvertibleInstrument => ({ kind: "notes", claim: 50, conversionShares: 10 * ratio, settlement: ratio < .95 ? "net-share" : ratio > 1.05 ? "unknown" : "full-shares", conversionPrice: 5,
  period: { start: "2026-04-01", end: "2026-06-30" }, basis: "filed" });
function read(tags: Record<string, unknown>, observed = "2026-08-01") {
  const facts: CompanyFacts = { cik: 42, entityName: "Test", facts: { "us-gaap": tags } };
  return convertibleInstrumentsAt(facts, { end: "2026-06-30", basis: "quarter" }, "2026-06-30", "USD", observed, { permanentPreferred: 100, totalDebt: 300 });
}
const increment = { units: { shares: [{ ...instant(10), start: "2026-04-01" }] } };
const tags = () => ({ ConvertibleNotesPayable: fact(50), ConvertibleNotesPayableCurrent: fact(5),
  DebtInstrumentConvertibleConversionPrice1: fact(5, "USD/shares"), IncrementalCommonSharesAttributableToConversionOfDebtSecurities: increment });

describe("FIN-302 exact-period reader and conservative controls", () => {
  it("reads an inclusive notes total once and the quarter's full count", () => {
    expect(read(tags()).instruments).toMatchObject([{ kind: "notes", claim: 50, conversionShares: 10, settlement: "full-shares" }]);
  });
  it("composes noncurrent and current when no inclusive total exists", () => {
    const t = tags(); delete (t as Partial<typeof t>).ConvertibleNotesPayable;
    expect(read({ ...t, ConvertibleDebtNoncurrent: fact(45) }).instruments[0].claim).toBe(50);
  });
  it("rejects YTD increments, future filings, old K and a wrong-currency K", () => {
    expect(read({ ...tags(), IncrementalCommonSharesAttributableToConversionOfDebtSecurities: { units: { shares: [{ ...instant(10), start: "2026-01-01" }] } } }).instruments).toEqual([]);
    expect(read(tags(), "2026-07-01").instruments).toEqual([]);
    expect(read({ ...tags(), DebtInstrumentConvertibleConversionPrice1: fact(5, "EUR/shares") }).instruments[0].settlement).toBe("unknown");
    expect(read({ ...tags(), DebtInstrumentConvertibleConversionPrice1: { units: { "USD/shares": [instant(5, "2025-06-28")] } } }).instruments[0].settlement).toBe("unknown");
  });
  it("distinguishes series only with a filed inclusive carrying total", () => {
    const r = read({ ConvertiblePreferredStockNonredeemableOrRedeemableIssuerOptionValue: fact(180), PreferredStockIncludingAdditionalPaidInCapital: fact(280) });
    expect(r.preferredSeriesDistinct).toBe(true);
    expect(foldConvertiblePreferred(100, 180, r.preferredSeriesDistinct)).toEqual({ preferred: 280, gap: null });
    expect(foldConvertiblePreferred(100, 180).preferred).toBe(180);
    expect(foldConvertiblePreferred(100, 180).gap?.field).toBe("valuation.dcf.preferredClaimOverlap");
    expect(foldConvertiblePreferred(100, null)).toEqual({ preferred: 100, gap: null });
  });
  it("enumerates all four combinations and never restores an undeducted claim", () => {
    const p: ConvertibleInstrument = { ...note(), kind: "preferred", claim: 200, conversionShares: 5, conversionPrice: null };
    const variants = convertibleVariants([{ ...note(), claim: 40, conversionPrice: 4 }, p], { notes: 40, preferred: 200 });
    expect(variants).toHaveLength(4);
    expect(Math.min(...variants.map(v => (1000 + v.restored.notes + v.restored.preferred) / (115 - v.sharesRemoved)))).toBeCloseTo(1040 / 110, 10);
    expect(convertibleVariants([note()], { notes: 30, preferred: 0 })[0].readings[0].reading).toBe("unresolved");
    expect(convertibleVariants([{ ...p, claim: null }], { notes: 0, preferred: 50 })[0].restored.preferred).toBe(0);
  });
  it("joins the conservative value continuously at both conversion-count edges", () => {
    const value = (r: number) => Math.min(...convertibleVariants([note(r)], { notes: 50, preferred: 0 }).map(v => (1000 + v.restored.notes) / (110 - v.sharesRemoved)));
    for (const edge of [.95, 1.05]) expect(Math.abs(value(edge - 1e-8) - value(edge + 1e-8))).toBeLessThan(1e-5);
    expect(value(1)).toBeCloseTo(1050 / 110, 10);
    expect(value(.949)).toBe(1000 / 110);
    expect(value(1.051)).toBe(1000 / 110);
  });
});
