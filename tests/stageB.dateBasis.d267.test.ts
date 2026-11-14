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
