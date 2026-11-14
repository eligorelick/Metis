/**
 * D-267 (P1, P13, P2, P10): every input to one calculation comes from one date.
 *
 * Altman's original-variant X4 sets the market value of equity observed
 * at the balance-sheet date against that balance sheet's liabilities, paired by
 * the own-history rule (`latestOnOrBeforeWithin`, the statement-date market-value
 * window). The current market cap never stands in for an older balance date.
 */
import { describe, expect, it } from "vitest";

import { STATEMENT_DATE_MARKET_VALUE_MAX_AGE_DAYS } from "@/pipeline/stageB/asOfSelection";
import { computeAltman, runForensics, type AltmanInputs } from "@/pipeline/stageB/forensics";
import type { CompanyRoute } from "@/types/core";
import { runStageB } from "@/pipeline/compute";
import { foreignBundle } from "./helpers/foreignBundle";
import { derivedMarketCapShareDate, isDerivedMarketCapRow } from "@/pipeline/keyless";
import type { CompanyFacts } from "@/edgar/xbrl";

// ---------------------------------------------------------------------------
// Part 2: Altman X4 at the balance-sheet date
// ---------------------------------------------------------------------------

const balance = (date: string) => ({
  date, totalCurrentAssets: 100, totalCurrentLiabilities: 60, totalAssets: 400, retainedEarnings: 120,
  totalLiabilities: 200, totalStockholdersEquity: 200,
});
const income = (date: string) => ({ date, ebit: 60, revenue: 300 });

function altmanInputs(balanceDate: string, extra: Partial<AltmanInputs> = {}): AltmanInputs {
  return {
    balance: balance(balanceDate), income: income(balanceDate),
    marketCap: 2000, marketCapAsOf: "2026-11-13", reportedCurrency: "USD", quoteCurrency: "USD",
    analysisCutoff: "2026-11-13",
    ...extra,
  };
}

describe("D-267 part 2: Altman X4 uses the market value observed at the balance date", () => {
  it("a US filer with a dated observation scores on it, not on the current cap", () => {
    const paired = computeAltman(altmanInputs("2025-12-31", {
      marketCapHistory: [{ date: "2025-12-31", marketCap: 800 }, { date: "2026-11-13", marketCap: 2000 }],
      marketCapHistorySource: "provider:market-cap-history",
    }), "original");
    const current = computeAltman(altmanInputs("2025-12-31"), "original");
    expect(paired.components.x4).toBeCloseTo(800 / 200, 10);
    expect(paired.score).not.toBeNull();
    expect(paired.score).not.toBeCloseTo(current.score!, 3);
    expect(paired.asOf).toMatchObject({ balanceSheet: "2025-12-31", marketCap: "2025-12-31", marketCapSource: "provider:market-cap-history" });
  });

  it("a 52/53-week filer whose balance date is a weekend takes the last session on or before it", () => {
    const r = computeAltman(altmanInputs("2025-09-27", {
      marketCapHistory: [{ date: "2025-09-26", marketCap: 900 }, { date: "2025-09-29", marketCap: 950 }],
      marketCapHistorySource: "provider:market-cap-history",
    }), "original");
    expect(r.asOf.marketCap).toBe("2025-09-26");
    expect(r.components.x4).toBeCloseTo(900 / 200, 10);
  });

  it("control: a current observation dated at the balance date is used unchanged", () => {
    const legacy = computeAltman(altmanInputs("2026-11-13"), "original");
    const r = computeAltman(altmanInputs("2026-11-13", { marketCapHistory: [], marketCapHistorySource: null }), "original");
    expect(r.score).toBe(legacy.score);
    expect(r.asOf.marketCap).toBe("2026-11-13");
  });

  it("no observation on or before the balance date within the window: withheld, named, original variant kept", () => {
    const tooOld = "2025-11-01"; // 60 days before the balance date, beyond the window
    expect(STATEMENT_DATE_MARKET_VALUE_MAX_AGE_DAYS).toBeLessThan(60);
    const r = computeAltman(altmanInputs("2025-12-31", {
      marketCapHistory: [{ date: tooOld, marketCap: 700 }, { date: "2026-01-02", marketCap: 750 }],
      marketCapHistorySource: "provider:market-cap-history",
    }), "original");
    expect(r.variant).toBe("original");
    expect(r.score).toBeNull();
    expect(r.components.x4).toBeNull();
    expect(r.asOf.marketCap).toBeNull();
    const gap = r.gaps.find((g) => g.field === "forensics.altman.marketCapDate")!;
    expect(gap.severity).toBe("warn");
    expect(gap.reason).toMatch(/2025-12-31/);
    expect(gap.reason).toMatch(/current market cap \(2026-11-13\) is not set against/);
  });

  it("an observation after the analysis cutoff is never used", () => {
    const r = computeAltman(altmanInputs("2026-11-13", {
      analysisCutoff: "2026-11-12", marketCapAsOf: "2026-11-13",
      marketCapHistory: [{ date: "2026-11-13", marketCap: 1500 }],
      marketCapHistorySource: "provider:market-cap-history",
    }), "original");
    expect(r.score).toBeNull();
    expect(r.gaps.some((g) => g.field === "forensics.altman.marketCapDate")).toBe(true);
  });

  it("the book-equity variants are untouched by the market-cap pairing", () => {
    const withHistory = computeAltman(altmanInputs("2025-12-31", { marketCapHistory: [], marketCapHistorySource: null }), "z2");
    const without = computeAltman(altmanInputs("2025-12-31"), "z2");
    expect(withHistory.score).toBe(without.score);
    expect(withHistory.gaps.some((g) => g.field === "forensics.altman.marketCapDate")).toBe(false);
  });

  it("a foreign filer whose cap is converted at the quote date only: no rate at the balance date, so the existing currency rule applies", () => {
    const manufacturer: CompanyRoute = { base: "general", overlays: [], evidence: { sector: "Technology", industry: "Semiconductors" } };
    const report = runForensics(manufacturer, {
      income: [income("2025-12-31")], balance: [balance("2025-12-31")], cashFlow: [],
      marketCap: 2000, marketCapAsOf: "2026-11-12", reportedCurrency: "TWD", quoteCurrency: "TWD",
      marketCapHistory: [], marketCapHistorySource: null,
      marketCapHistoryCurrencyReason: "the market cap is converted at the 2026-11-12 quote-date rate only; no exchange rate dated at the balance-sheet date is admitted",
      analysisCutoff: "2026-11-13",
      classification: { sicCode: "3674" }, revenueFloor: 0,
    });
    const altman = report.altman!;
    expect(altman.gaps.find((g) => g.field === "forensics.altman.currency")?.reason).toMatch(/no exchange rate dated at the balance-sheet date/);
    // the owner's existing structural substitution (Z', book equity), disclosed as before
    expect(altman.variant).toBe("private");
    expect(altman.notes.join(" ")).toMatch(/Altman Z' \(1983, BOOK equity\) substituted/);
  });
});

describe("D-267 review fix 1: a foreign cap converted on the balance date is admitted", () => {
  /** The quote, the quoted-share count and the exchange rate all observed on the 2025-12-31 balance date. */
  function sameDateForeign() {
    const b = foreignBundle();
    if (!b.quote.ok || !b.sharesFloat.ok || !b.valuationFx?.ok) throw new Error("fixture");
    b.quote.value.data.rows[0]!.timestamp = Date.parse("2025-12-31T21:00:00Z") / 1000;
    b.sharesFloat.value.data.rows[0]!.date = "2025-12-31";
    b.valuationFx.value.data = [{ date: "2025-12-31", value: 32 }];
    return b;
  }

  it("scores the original variant on the converted cap when the cap and its rate are dated at the balance", () => {
    const altman = runStageB(sameDateForeign()).forensics.altman!;
    expect(altman.variant).toBe("original");
    expect(altman.gaps.some((g) => g.field === "forensics.altman.currency")).toBe(false);
    expect(altman.components.x4).toBe(20); // converted cap over liabilities exceeds the house cap
    expect(altman.score).toBeCloseTo(13.16, 2);
    expect(altman.asOf).toMatchObject({ balanceSheet: "2025-12-31", marketCap: "2025-12-31" });
    expect(altman.asOf.marketCapSource).toMatch(/converted at the 2025-12-31 FRED DEXTAUS rate/);
  });

  it("the forensic note says what Altman did with the converted cap on each path (review thread)", () => {
    const fxNote = (notes: string[]) => notes.find((n) => n.startsWith("Valuation translated at one spot rate"))!;
    const admitted = fxNote(runStageB(sameDateForeign()).forensics.notes);
    expect(admitted).toContain("Altman X4 converts the admitted USD market capitalization observed on 2025-12-31 back into the reporting currency (current market capitalization converted at the 2025-12-31 FRED DEXTAUS rate) for its local-currency liability denominator, both dated with the 2025-12-31 balance sheet (D-267).");
    const refused = fxNote(runStageB(foreignBundle()).forensics.notes);
    expect(refused).toContain("Altman X4 does not use the converted market capitalization: the market cap is converted to TWD only at the 2026-07-02 quote-date rate, and no exchange rate dated at the balance-sheet date is admitted; the book-equity Z-prime variant is used instead (D-267).");
    expect(refused).not.toContain("Altman X4 converts the admitted USD market capitalization");
  });

  it("control: the same filer with only later-dated rates keeps the currency refusal", () => {
    const altman = runStageB(foreignBundle()).forensics.altman!;
    expect(altman.variant).toBe("private");
    expect(altman.gaps.find((g) => g.field === "forensics.altman.currency")?.reason).toMatch(/no exchange rate dated at the balance-sheet date is admitted/);
    expect(altman.score).toBeCloseTo(1.14845, 10);
  });
});

describe("D-267 review fix 2: a derived reading counts only with a share count observed by its day", () => {
  const facts = (points: { end: string; filed: string }[]): CompanyFacts => ({ cik: 42, entityName: "Synthetic", facts: {
    dei: { EntityCommonStockSharesOutstanding: { units: { shares: points.map((p, i) => ({ ...p, val: 1_000e6, accn: `0000000042-26-00000${i}`, form: "10-Q", fy: 2026, fp: "Q1" })) } } },
  } } as unknown as CompanyFacts);

  it("skips a derived reading whose share count was observed after its day and takes the next qualifying one", () => {
    const r = computeAltman(altmanInputs("2025-12-31", {
      marketCapHistory: [
        { date: "2025-12-31", marketCap: 800, sharesAsOf: "2026-02-20" },
        { date: "2025-12-19", marketCap: 780, sharesAsOf: "2025-11-01" },
      ],
      marketCapHistorySource: "derived:market-cap(close×dei:shares)",
    }), "original");
    expect(r.asOf.marketCap).toBe("2025-12-19");
    expect(r.components.x4).toBeCloseTo(780 / 200, 12);
  });

  it("withholds when every derived reading in the window rests on a later share count", () => {
    const r = computeAltman(altmanInputs("2025-12-31", {
      marketCapHistory: [{ date: "2025-12-31", marketCap: 800, sharesAsOf: "2026-02-20" }, { date: "2025-12-30", marketCap: 790, sharesAsOf: null }],
      marketCapHistorySource: "derived:market-cap(close×dei:shares)",
    }), "original");
    expect(r.score).toBeNull();
    expect(r.gaps.some((g) => g.field === "forensics.altman.marketCapDate")).toBe(true);
  });

  it.each([["blank", ""], ["malformed", "2025-13-45"], ["not a day", "Dec 2025"], ["missing", null]] as const)(
    "a derived reading with a %s share date does not qualify (second review)", (_label, sharesAsOf) => {
      const r = computeAltman(altmanInputs("2025-12-31", {
        marketCapHistory: [{ date: "2025-12-31", marketCap: 800, sharesAsOf }],
        marketCapHistorySource: "derived:market-cap(close×dei:shares)",
      } as Partial<AltmanInputs>), "original");
      expect(r.score).toBeNull();
      expect(r.components.x4).toBeNull();
      expect(r.gaps.some((g) => g.field === "forensics.altman.marketCapDate")).toBe(true);
    });

  it("a malformed share date is skipped and the next well-formed reading is used; a valid same-day date qualifies (control)", () => {
    const r = computeAltman(altmanInputs("2025-12-31", {
      marketCapHistory: [{ date: "2025-12-31", marketCap: 800, sharesAsOf: "" }, { date: "2025-12-30", marketCap: 790, sharesAsOf: "2025-12-30" }],
      marketCapHistorySource: "derived:market-cap(close×dei:shares)",
    }), "original");
    expect(r.asOf.marketCap).toBe("2025-12-30");
    expect(r.components.x4).toBeCloseTo(790 / 200, 12);
  });

  it("a provider reading carries no share observation and is unaffected (control)", () => {
    const r = computeAltman(altmanInputs("2025-12-31", { marketCapHistory: [{ date: "2025-12-31", marketCap: 800 }], marketCapHistorySource: "provider" }), "original");
    expect(r.components.x4).toBeCloseTo(800 / 200, 12);
  });

  it("resolves a stored derived row's share date by the same selection keyless used, without changing its value", () => {
    // Only a cover count observed after the price day: keyless priced the bar on that earliest count.
    expect(derivedMarketCapShareDate({ date: "2025-12-31" }, facts([{ end: "2026-02-20", filed: "2026-03-01" }]))).toBe("2026-02-20");
    // The semiconductor shape: the count was observed and filed before the price day, so the row still qualifies.
    expect(derivedMarketCapShareDate({ date: "2026-09-03" }, facts([{ end: "2026-06-20", filed: "2026-06-26" }, { end: "2026-10-01", filed: "2026-10-20" }]))).toBe("2026-06-20");
    // A row written since D-267 carries its own date.
    expect(derivedMarketCapShareDate({ date: "2026-09-03", sharesAsOf: "2026-06-20" }, null)).toBe("2026-06-20");
    expect(isDerivedMarketCapRow({ source: "computed" }, "/stable/historical-market-capitalization + derived")).toBe(true);
    expect(isDerivedMarketCapRow({}, "derived:market-cap(close×dei:shares)")).toBe(true);
    expect(isDerivedMarketCapRow({}, "/stable/historical-market-capitalization?symbol=X")).toBe(false);
  });
});
