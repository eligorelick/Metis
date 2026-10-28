import { describe, expect, it } from "vitest";
import { listingSuffix, loadPeerFundamentals, peerDiscoveryScreen, type PeerFundamentals } from "@/pipeline/peers";
import type { FmpRawRow } from "@/providers/fmp";
import type { FmpFetch } from "@/pipeline/types";

const NOW = new Date("2026-10-13T18:00:00Z");
function data<T extends FmpRawRow>(rows: T[]): FmpFetch<T> {
  return { ok: true, value: { data: { rows, raw: rows }, source: "fmp", endpoint: "test", asOf: "2026-10-13", fetchedAt: NOW.toISOString() } };
}
const profile = { symbol: "ROOT", cik: "1", companyName: "Root Inc", industry: "Software - Application", sector: "Technology", currency: "USD", isAdr: false };
function candidate(symbol = "P1"): PeerFundamentals {
  return { profile: data([{ ...profile, symbol, cik: symbol.slice(1), companyName: `Peer ${symbol}` }]),
    quote: data([{ symbol, marketCap: 1000, price: 10, timestamp: NOW.getTime() / 1000 }]),
    incomeQuarterly: data([{ symbol, date: "2026-06-30", period: "Q2", reportedCurrency: "USD", netIncome: 25 }]),
    balanceQuarterly: data([{ symbol, date: "2026-06-30", reportedCurrency: "USD", totalStockholdersEquity: 500 }]) };
}

describe("peer discovery size screen (AI-301, AI-301-V1)", () => {
  it("reads the listing market from the exchange suffix and compares only like with like", () => {
    expect(["MU", "BRK-B", "285A.T", "2344.TW", "603986.SS", "SHOP.TO", "BRK.B"].map(listingSuffix))
      .toEqual([null, null, "T", "TW", "SS", "TO", "B"]);
    const screen = (subjectSymbol: string, subjectCurrency: string | null, peerSymbol: string, peerCurrency: string | null, subjectCap: number, peerCap: number) =>
      peerDiscoveryScreen({ subjectSymbol, subjectCurrency, subjectCap, peerSymbol, peerCurrency, peerCap });
    expect(screen("MU", "USD", "9999.T", "JPY", 180e9, 21e12)).toEqual({ kind: "not-compared", reason: "size not compared: listed in JPY, the subject in USD; no currency conversion" });
    expect(screen("MU", "USD", "9999.T", null, 180e9, 21e12)).toEqual({ kind: "not-compared", reason: "size not compared: the provider row states no currency and its exchange suffix (.T) differs from the subject's (none)" });
    // Review focus 1: a Toronto subject compares only Toronto rows by presumption.
    expect(screen("SHOP.TO", "CAD", "LSPD.TO", null, 100e9, 0.5e9).kind).toBe("excluded");
    expect(screen("SHOP.TO", "CAD", "WIX", null, 100e9, 0.5e9).kind).toBe("not-compared");
    // Review focus 2: a dotted U.S. class is only deferred to the profile read.
    expect(screen("MU", "USD", "BRK.B", null, 180e9, 1e12).kind).toBe("not-compared");
    // Controls: D-65 unchanged for a same-market row and for established equal currencies.
    expect(screen("NVDA", "USD", "XLAB", null, 5_235_243e6, 29e6)).toEqual({ kind: "excluded", reason: expect.stringMatching(/^size screen: market cap 29M is 180,526× smaller than the subject's 5.24T/) });
    expect(screen("NVDA", "USD", "AMD", "USD", 5_235_243e6, 917_826e6)).toEqual({ kind: "in-band" });
  });

  it("sends a foreign-listed row with no currency to the profile read instead of size-comparing it", async () => {
    const requested: string[] = [];
    const refused = { ok: false as const, gap: { field: "fmp.profile", reason: "FMP subscription (HTTP 402): this symbol is unavailable on this endpoint with this key.", severity: "info" as const } };
    const result = await loadPeerFundamentals({ symbol: "ROOT", profile: { ...profile, marketCap: 180e9 }, now: NOW, enabled: true,
      discovered: data([{ symbol: "9999.T", companyName: "Example Tokyo Corp.", price: 12000, mktCap: 21e12 }, { symbol: "TINY", companyName: "Tiny Inc", mktCap: 50e6 }]),
      client: () => ({ profile: async (s: string) => { requested.push(s); return refused; }, quote: async () => refused, incomeStatement: async () => refused, balanceSheet: async () => refused }) });
    const reason = (s: string) => result.exclusions.find((e) => e.symbol === s)?.reason ?? "";
    expect(reason("9999.T")).not.toMatch(/size screen/);
    expect(requested).toContain("9999.T");
    // Control (D-65): a same-market micro-cap is still screened at discovery and never requested.
    expect(reason("TINY")).toMatch(/^size screen: market cap 50M is 3,600× smaller than the subject's 180.00B/);
    expect(requested).not.toContain("TINY");
  });

  it("records the listing currency of every profile it reads, admitted or not", async () => {
    const profiles: Record<string, object> = {
      P2: { ...profile, symbol: "P2", cik: "2", companyName: "Peer P2" },
      P3: { ...profile, symbol: "P3", cik: "3", companyName: "Peer P3", industry: "Other" },
      P4: { ...profile, symbol: "P4", cik: "4", companyName: "Peer P4", currency: "JPY" },
      P5: { ...profile, symbol: "OTHER", cik: "5", companyName: "Peer P5", currency: "EUR" },
    };
    const result = await loadPeerFundamentals({ symbol: "ROOT", profile: { ...profile, marketCap: 1000 }, now: NOW, enabled: true,
      discovered: data(["P2", "P3", "P4", "P5"].map((symbol) => ({ symbol }))),
      client: () => ({ profile: async (s: string) => data([profiles[s] as never]), quote: async (s: string) => candidate(s).quote,
        incomeStatement: async (s: string) => candidate(s).incomeQuarterly, balanceSheet: async (s: string) => candidate(s).balanceQuarterly }) });
    // P5's profile names another symbol: its currency is not recorded (identity first).
    expect(result.listingCurrencies).toEqual({ P2: "USD", P3: "USD", P4: "JPY" });
  });
  // AI-301 final review: a minor-unit code (pence, cents) is not the major unit, so it is never uppercased into one.
  it.each([["GBp"], ["ZAc"], ["ILa"], ["usd"]])("treats the raw code %s as no currency: no listing currency recorded, no 'listed in' comparison", async (code) => {
    const profiles: Record<string, object> = { P2: { ...profile, symbol: "P2", cik: "2", companyName: "Peer P2", currency: code }, P3: { ...profile, symbol: "P3", cik: "3", companyName: "Peer P3", currency: "GBP" } };
    const result = await loadPeerFundamentals({ symbol: "ROOT", profile: { ...profile, marketCap: 1000 }, now: NOW, enabled: true,
      discovered: data(["P2", "P3"].map((symbol) => ({ symbol }))),
      client: () => ({ profile: async (s: string) => data([profiles[s] as never]), quote: async (s: string) => candidate(s).quote,
        incomeStatement: async (s: string) => candidate(s).incomeQuarterly, balanceSheet: async (s: string) => candidate(s).balanceQuarterly }) });
    expect(result.listingCurrencies).toEqual({ P3: "GBP" });   // control: an all-uppercase code is still recorded
    const screen = (peerCurrency: string) => peerDiscoveryScreen({ subjectSymbol: "ROOT", subjectCurrency: "USD", subjectCap: 1000, peerSymbol: "P2", peerCurrency, peerCap: 1000 });
    expect(screen(code)).toEqual({ kind: "in-band" });   // decided by the symbol, as for a row with no currency (the subject has none either)
    expect(screen("GBP")).toEqual({ kind: "not-compared", reason: "size not compared: listed in GBP, the subject in USD; no currency conversion" });   // control
  });
});
