import { describe, expect, it, vi } from "vitest";
import { comparePeerFundamentals, loadPeerFundamentals, type PeerFundamentals } from "@/pipeline/peers";
import { multiplesFramework, type MultiplesFrameworkInputs } from "@/pipeline/stageB/valuation";
import { createFmpClient, type CachedFetchFn, type FmpRawRow } from "@/providers/fmp";
import { makeLimiter } from "@/providers/http";
import type { FmpFetch } from "@/pipeline/types";

const NOW = new Date("2026-10-13T18:00:00Z");
function data<T extends FmpRawRow>(rows: T[]): FmpFetch<T> {
  return { ok: true, value: { data: { rows, raw: rows }, source: "fmp", endpoint: "test", asOf: "2026-10-13", fetchedAt: NOW.toISOString() } };
}
const profile = { symbol: "ROOT", cik: "1", companyName: "Root Inc", industry: "Software - Application", sector: "Technology", currency: "USD", isAdr: false };
const quote = data([{ symbol: "ROOT", marketCap: 1000, price: 10, timestamp: NOW.getTime() / 1000 }]);
function subject(): MultiplesFrameworkInputs {
  return { quote: { marketCap: 1000, price: 10, currency: "USD" }, reportedCurrency: "USD",
    incomeTtm: { date: "2026-06-30", basis: "ttm", revenue: 500, operatingIncome: 100, netIncome: 100, epsDiluted: null }, cashFlowTtm: null,
    balance: { date: "2026-06-30", basis: "quarter", totalStockholdersEquity: 500, goodwill: 50, intangibleAssets: 50, preferredStock: 0, totalDebt: 100, cashAndShortTermInvestments: 50, minorityInterest: 0 } };
}
function candidate(symbol = "P1", mcap = 1000): PeerFundamentals {
  return { profile: data([{ ...profile, symbol, cik: symbol.slice(1), companyName: `Peer ${symbol}` }]),
    quote: data([{ symbol, marketCap: mcap, price: 10, timestamp: NOW.getTime() / 1000 }]),
    incomeQuarterly: data(["2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30", "2025-06-30"].map(date => ({ symbol, date, period: `Q${Math.ceil(Number(date.slice(5, 7)) / 3)}`, reportedCurrency: "USD", netIncome: 25, filingDate: date === "2026-06-30" ? "2026-08-01" : date }))),
    balanceQuarterly: data(["2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30", "2025-06-30"].map(date => ({ totalStockholdersEquity: 500, goodwill: 50, intangibleAssets: 50, preferredStock: 0, minorityInterest: 0, date, symbol, reportedCurrency: "USD", filingDate: date === "2026-06-30" ? "2026-08-01" : date }))) };
}
function run(candidates: Record<string, PeerFundamentals>, target = subject()) {
  return comparePeerFundamentals({ symbol: "ROOT", profile, quote, route: "general", subject: target, now: NOW,
    subjectIncomeQuarterly: candidate("ROOT").incomeQuarterly, subjectBalanceQuarterly: candidate("ROOT").balanceQuarterly,
    collection: { candidates, candidateCount: Object.keys(candidates).length, exclusions: [], notes: [] } });
}

describe("defensible peer comparables", () => {
  it("uses four independent issuers and independently calculated same-definition medians", () => {
    const result = run({ P2: candidate("P2", 1000), P3: candidate("P3", 1500), P4: candidate("P4", 2000), P5: candidate("P5", 2500) });
    const computed = multiplesFramework("general", { ...subject(), ...result });
    expect(result.peers).toHaveLength(4);
    expect(computed.multiples.find(m => m.key === "priceToBook")?.peers).toEqual({ median: 3.5, min: 2, max: 5, count: 4 });
    expect(computed.multiples.find(m => m.key === "peTtm")?.peers?.median).toBe(17.5);
    expect(result.peerCoverage.eligible).toEqual(["P2", "P3", "P4", "P5"]);
  });

  it("excludes self share classes, repeated issuers, contaminated rows and mismatched industries", () => {
    const self = candidate("P1");
    const duplicate = candidate("P3");
    if (duplicate.profile.ok) duplicate.profile.value.data.rows[0].cik = "0000000002";
    const contaminated = candidate("P4");
    if (contaminated.balanceQuarterly.ok) contaminated.balanceQuarterly.value.data.rows[0].symbol = "OTHER";
    const industry = candidate("P5");
    if (industry.profile.ok) industry.profile.value.data.rows[0].industry = "Semiconductors";
    const result = run({ P1: self, P2: candidate("P2"), P3: duplicate, P4: contaminated, P5: industry });
    expect(result.peers.map(p => p.symbol)).toEqual(["P2"]);
    expect(result.peerCoverage.exclusions).toEqual(expect.arrayContaining([
      expect.objectContaining({ symbol: "P1", reason: expect.stringMatching(/issuer|self/i) }),
      expect.objectContaining({ symbol: "P3", reason: expect.stringMatching(/duplicate/i) }),
      expect.objectContaining({ symbol: "P4", reason: expect.stringMatching(/identity|symbol/i) }),
      expect.objectContaining({ symbol: "P5", reason: expect.stringMatching(/industry/i) }),
    ]));
  });

  it.each(["currency", "future-quote", "stale-quote", "stale-cache", "future-filing", "invalid-date", "old-statement"])("withholds %s observations", mode => {
    const peer = candidate("P2");
    if (peer.balanceQuarterly.ok) {
      const row = peer.balanceQuarterly.value.data.rows[0];
      if (mode === "currency") row.reportedCurrency = "EUR";
      if (mode === "future-filing") row.filingDate = "2026-10-14";
      if (mode === "invalid-date") row.date = "2026-02-30";
      if (mode === "old-statement") peer.balanceQuarterly.value.data.rows = [{ ...row, date: "2025-06-30" }];
    }
    if (peer.quote.ok && mode === "future-quote") peer.quote.value.data.rows[0].timestamp = NOW.getTime() / 1000 + 1;
    if (peer.quote.ok && mode === "stale-quote") peer.quote.value.data.rows[0].timestamp = NOW.getTime() / 1000 - 8 * 86400;
    if (peer.profile.ok && mode === "stale-cache") peer.profile.value.stale = true;
    expect(run({ P2: peer }).peers).toHaveLength(0);
    expect(run({ P2: peer }).peerCoverage.exclusions.length).toBeGreaterThan(0);
  });

  it("does not manufacture EPS comparability or mix annual and trailing earnings", () => {
    const eps = subject(); eps.incomeTtm!.epsDiluted = 1;
    const annual = subject(); annual.incomeTtm!.basis = "annual";
    for (const target of [eps, annual]) {
      const result = run({ P2: candidate("P2") }, target);
      expect(result.peers[0].multiples.peTtm).toBeUndefined();
      expect(result.peers[0].multiples.priceToBook).toBe(2);
      expect(result.peerCoverage.exclusions.some(x => /peTtm/.test(x.reason))).toBe(true);
      expect(result.peerCoverage.comparisons[0].current).toBe(10);
    }
  });

  it("suppresses insufficient metric coverage after the existing IQR rule", () => {
    const result = run({ P2: candidate("P2", 1000), P3: candidate("P3", 1100), P4: candidate("P4", 1200), P5: candidate("P5", 100000) });
    const computed = multiplesFramework("general", { ...subject(), ...result });
    expect(computed.multiples.find(m => m.key === "priceToBook")?.peers).toBeNull();
    expect(computed.notes.some(n => /3 usable peers/.test(n))).toBe(true);
  });

  it("rejects unproven subject quote currency and subject fiscal basis before publishing peers", () => {
    const target = subject(); target.reportedCurrency = "EUR";
    expect(run({ P2: candidate("P2") }, target).peers).toEqual([]);
    const old = subject(); old.balance!.date = "2024-12-31";
    expect(run({ P2: candidate("P2") }, old).peers).toEqual([]);
  });

  it("refuses a subject balance filed after its quote", () => {
    const balance = candidate("ROOT").balanceQuarterly;
    if (balance.ok) balance.value.data.rows[0].filingDate = "2026-10-14";
    const result = comparePeerFundamentals({ symbol: "ROOT", profile, quote, route: "general", subject: subject(), now: NOW,
      subjectBalanceQuarterly: balance, subjectIncomeQuarterly: candidate("ROOT").incomeQuarterly,
      collection: { candidates: { P2: candidate("P2") }, candidateCount: 1, exclusions: [], notes: [] } });
    expect(result.peers).toEqual([]);
    expect(result.peerCoverage.exclusions[0].reason).toMatch(/subject.*filing/i);
  });

  it("rejects annual rows smuggled into a quarterly common-earnings window", () => {
    const peer = candidate("P2");
    if (peer.incomeQuarterly.ok) peer.incomeQuarterly.value.data.rows[2].period = "FY";
    const result = run({ P2: peer });
    expect(result.peers[0].multiples.peTtm).toBeUndefined();
    expect(result.peerCoverage.comparisons[0].peerCount).toBe(0);
  });

  it("does not treat a latest zero preferred balance as proof of older common earnings", () => {
    const peer = candidate("P2");
    if (peer.balanceQuarterly.ok) peer.balanceQuarterly.value.data.rows[2].preferredStock = 100;
    const result = run({ P2: peer });
    expect(result.peerCoverage.comparisons[0].peerCount).toBe(0);
    expect(result.peerCoverage.exclusions.some(x => /common ownership/.test(x.reason))).toBe(true);
  });

  it("does not assume a day-only filing was public before an intraday quote", () => {
    const peer = candidate("P2");
    if (peer.balanceQuarterly.ok) peer.balanceQuarterly.value.data.rows[0].filingDate = "2026-10-13";
    expect(run({ P2: peer }).peers).toEqual([]);
  });

  it("names the issuer excluded as a metric outlier", () => {
    const result = run({ P2: candidate("P2", 1000), P3: candidate("P3", 1100), P4: candidate("P4", 1200), P5: candidate("P5", 100000) });
    const computed = multiplesFramework("general", { ...subject(), ...result });
    expect(computed.peerCoverage?.exclusions.some(x => x.symbol === "P5" && /priceToBook.*IQR/.test(x.reason))).toBe(true);
    expect(result.peerCoverage.exclusions.some(x => x.symbol === "P5" && /common earnings.*IQR/.test(x.reason))).toBe(true);
  });

  it("rejects a conflicting explicit statement CIK despite a matching ticker", () => {
    const peer = candidate("P2");
    if (peer.incomeQuarterly.ok) peer.incomeQuarterly.value.data.rows.forEach(row => { row.cik = "999999"; });
    if (peer.balanceQuarterly.ok) peer.balanceQuarterly.value.data.rows.forEach(row => { row.cik = "999999"; });
    const result = run({ P2: peer });
    expect(result.peers).toEqual([]);
    expect(result.peerCoverage.exclusions.some(x => /CIK/.test(x.reason))).toBe(true);
    const own = candidate("ROOT");
    if (own.balanceQuarterly.ok) own.balanceQuarterly.value.data.rows[0].cik = "999999";
    const subjectResult = comparePeerFundamentals({ symbol: "ROOT", profile, quote, route: "general", subject: subject(), now: NOW,
      subjectBalanceQuarterly: own.balanceQuarterly, subjectIncomeQuarterly: own.incomeQuarterly,
      collection: { candidates: { P2: candidate("P2") }, candidateCount: 1, exclusions: [], notes: [] } });
    expect(subjectResult.peers).toEqual([]);
  });

  it("counts profitable negative-equity issuers eligible for the separate common-earnings comparison", () => {
    const peers = Object.fromEntries(["P2", "P3", "P4", "P5"].map(symbol => {
      const peer = candidate(symbol);
      if (peer.balanceQuarterly.ok) peer.balanceQuarterly.value.data.rows.forEach(row => { row.totalStockholdersEquity = -100; });
      return [symbol, peer];
    }));
    const target = subject(); target.incomeTtm!.epsDiluted = 1;
    const result = run(peers, target);
    expect(result.peerCoverage.comparisons[0]).toMatchObject({ peerMedian: 10, peerCount: 4 });
    expect(result.peerCoverage.eligible).toEqual(["P2", "P3", "P4", "P5"]);
    expect(result.peerCoverage.exclusions.some(x => /no supported comparable metric/.test(x.reason))).toBe(false);
  });
});

describe("bounded optional peer fetching", () => {
  it("does no live reads in keyless mode", async () => {
    const result = await loadPeerFundamentals({ symbol: "ROOT", profile, discovered: data([{ symbol: "P2" }]), now: NOW, enabled: false,
      client: () => { throw new Error("must not create client"); } });
    expect(result.candidates).toEqual({});
    expect(result.notes.join(" ")).toMatch(/keyless|unavailable/i);
  });
  it("deduplicates before fetching and caps optional reads at six candidates", async () => {
    const seen: string[] = [];
    const result = await loadPeerFundamentals({ symbol: "ROOT", profile, now: NOW, enabled: true,
      discovered: data(["ROOT", "P2", "p2", ...Array.from({ length: 20 }, (_, i) => `P${i + 3}`)].map(symbol => ({ symbol }))),
      client: () => ({ profile: async symbol => { seen.push(symbol); return candidate(symbol).profile; }, quote: async symbol => candidate(symbol).quote,
        incomeStatement: async symbol => candidate(symbol).incomeQuarterly, balanceSheet: async symbol => candidate(symbol).balanceQuarterly }) });
    expect(Object.keys(result.candidates)).toHaveLength(6);
    expect(new Set(seen).size).toBe(6);
    expect(seen).not.toContain("ROOT");
    expect(result.exclusions.some(x => /budget|limit/i.test(x.reason))).toBe(true);
  });
  it("degrades on quota failures without probing every remaining candidate", async () => {
    let attempts = 0;
    const unavailable = async () => { attempts++; return { ok: false as const, gap: { field: "fmp", reason: "429 quota exceeded", severity: "info" as const } }; };
    const result = await loadPeerFundamentals({ symbol: "ROOT", profile, now: NOW, enabled: true,
      discovered: data(["P2", "P3", "P4"].map(symbol => ({ symbol }))),
      client: () => ({ profile: unavailable, quote: unavailable, incomeStatement: unavailable, balanceSheet: unavailable }) });
    expect(result.candidates).toEqual({});
    expect(attempts).toBe(1);
    expect(result.notes.join(" ")).toMatch(/unavailable|quota/i);
  });

  it("aborts the optional work at twelve seconds and starts no later candidates", async () => {
    vi.useFakeTimers();
    try {
      let requestSignal: AbortSignal | undefined;
      let attempts = 0;
      const never = async () => { attempts++; return await new Promise<never>(() => undefined); };
      const promise = loadPeerFundamentals({ symbol: "ROOT", profile, now: NOW, enabled: true,
        discovered: data(["P2", "P3"].map(symbol => ({ symbol }))),
        client: signal => { requestSignal = signal; return { profile: never, quote: never, incomeStatement: never, balanceSheet: never }; } });
      await vi.advanceTimersByTimeAsync(11_999);
      expect(requestSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const result = await promise;
      expect(requestSignal?.aborted).toBe(true);
      expect(attempts).toBe(1);
      expect(result.candidates).toEqual({});
      expect(result.exclusions).toHaveLength(2);
    } finally { vi.useRealTimers(); }
  });

  it("reuses cached provider fundamentals with their original observation provenance", async () => {
    const cache = new Map<string, unknown>();
    const cachedFetch: CachedFetchFn = async <T>(key: string, _ttl: number, loader: () => Promise<T>) => {
      if (!cache.has(key)) cache.set(key, await loader());
      return { value: cache.get(key) as T, fetchedAt: NOW.toISOString() };
    };
    const requests: string[] = [];
    const opts = { symbol: "ROOT", profile, now: NOW, enabled: true, discovered: data([{ symbol: "P2" }]),
      client: (signal: AbortSignal) => createFmpClient({ apiKey: "peer-cache-test", cachedFetch, signal, now: () => NOW, limiter: makeLimiter(1_000_000, 1_000_000),
        fetchImpl: async input => {
          const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
          const endpoint = url.pathname.split("/").pop()!; requests.push(endpoint);
          const peer = candidate("P2");
          const result = endpoint === "profile" ? peer.profile : endpoint === "quote" ? peer.quote : endpoint === "income-statement" ? peer.incomeQuarterly : peer.balanceQuarterly;
          return new Response(JSON.stringify(result.ok ? result.value.data.rows : []), { status: 200 });
        } }) };
    const first = await loadPeerFundamentals(opts);
    const again = await loadPeerFundamentals(opts);
    expect(Object.keys(again.candidates)).toEqual(["P2"]);
    expect(requests).toHaveLength(4);
    expect(again.candidates.P2).toEqual(first.candidates.P2);
    expect(again.candidates.P2.incomeQuarterly.ok && again.candidates.P2.incomeQuarterly.value.endpoint).toContain("income-statement");
  });
});
