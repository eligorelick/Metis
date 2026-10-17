import { describe, expect, it } from "vitest";
import type { CompanyFacts } from "@/edgar/xbrl";
import { loadPeerFromFilings, type PeerFilingClients } from "@/pipeline/peerFilings";
import { comparePeerFundamentals } from "@/pipeline/peers";
import type { FmpFetch } from "@/pipeline/types";
import type { EdgarSubmissions } from "@/providers/edgar";
import type { FmpRawRow } from "@/providers/fmp";
import type { VendorSplitEvidence } from "@/providers/splitEvents";

// NVDA report 34: FMP refused AVGO by symbol (HTTP 402) on every endpoint.
const NOW = new Date("2026-10-15T18:00:00Z");
const subjectProfile = { symbol: "NVDA", cik: "0001045810", companyName: "NVIDIA Corporation", industry: "Semiconductors", sector: "Technology", currency: "USD", isAdr: false };
const vendorSplits: VendorSplitEvidence = { status: "retrieved", source: "test:vendor", events: [], coverage: [{ from: "2020-01-01", to: "2026-10-15" }] };
const sourced = <T>(data: T, source = "edgar") => ({ ok: true as const, value: { data, asOf: "2026-10-15", source, endpoint: "test", fetchedAt: NOW.toISOString() } }) as never;
const rows = <T extends FmpRawRow>(data: T[]): FmpFetch<T> => ({ ok: true, value: { data: { rows: data, raw: null }, source: "fmp", endpoint: "test", asOf: "2026-10-15", fetchedAt: NOW.toISOString() } });

function facts(): CompanyFacts {
  const point = (end: string, val: number, start?: string) => ({ start, end, val, accn: "0001730168-26-000041", fy: 2026, fp: "Q3", form: "10-Q", filed: "2026-09-10" });
  return { cik: 1730168, entityName: "Broadcom Inc.", facts: {
    "us-gaap": {
      Assets: { label: "Assets", units: { USD: [point("2026-08-02", 170e9)] } },
      StockholdersEquity: { label: "Equity", units: { USD: [point("2026-08-02", 72e9)] } },
      Revenues: { label: "Revenue", units: { USD: [point("2026-08-02", 16e9, "2026-05-04")] } },
    },
    dei: { EntityCommonStockSharesOutstanding: { label: "Shares", units: { shares: [{ ...point("2026-09-05", 4.7e9) }] } } },
  } };
}
function clients(overrides: Partial<{ sic: string; mapped: boolean; facts: () => CompanyFacts }> = {}): PeerFilingClients {
  const submission = (cik: string): EdgarSubmissions => ({ cik, name: cik.endsWith("1045810") ? "NVIDIA CORP" : "Broadcom Inc.",
    sic: cik.endsWith("1045810") ? "3674" : overrides.sic ?? "3674", sicDescription: "Semiconductors & Related Devices", fiscalYearEnd: null,
    stateOfIncorporation: null, tickers: [], exchanges: [], recentFilings: [], olderPages: [] });
  return {
    edgar: {
      tickerToCik: async () => overrides.mapped === false ? { ok: false, gap: { field: "edgar.tickerToCik(AVGO)", reason: "ticker not in company_tickers.json", severity: "info" } }
        : sourced({ cik10: "0001730168", cik: 1730168, ticker: "AVGO", title: "Broadcom Inc." }),
      submissions: async cik => sourced(submission(String(cik))),
      companyFacts: async () => sourced((overrides.facts ?? facts)()),
    },
    yahoo: {
      quote: async () => sourced({ rows: [{ symbol: "AVGO", price: 350, currency: "USD", timestamp: NOW.getTime() / 1000 - 3600 }], raw: null }, "yahoo"),
      splitHistory: async () => sourced(vendorSplits, "yahoo"),
    },
  };
}

describe("peer fundamentals from SEC filings", () => {
  it("builds a symbol-refused peer that the peer screen accepts on its own filed figures", async () => {
    const filed = await loadPeerFromFilings("AVGO", subjectProfile, clients(), NOW);
    if ("reason" in filed) throw new Error(filed.reason);
    expect(filed.profile.ok && filed.profile.value.data.rows[0]).toMatchObject({ industry: "Semiconductors", isAdr: false, industryEvidence: expect.stringContaining("SIC 3674") });
    expect(filed.quote.ok && filed.quote.value.data.rows[0]?.marketCap).toBe(350 * 4.7e9);
    const subjectBalance = rows([{ symbol: "NVDA", date: "2026-07-26", period: "Q2", reportedCurrency: "USD", totalStockholdersEquity: 120e9, filingDate: "2026-08-27" }]);
    const result = comparePeerFundamentals({ symbol: "NVDA", profile: subjectProfile, route: "general", now: NOW,
      quote: rows([{ symbol: "NVDA", price: 200, marketCap: 4.8e12, timestamp: NOW.getTime() / 1000 - 3600 }]),
      subject: { quote: { price: 200, marketCap: 4.8e12, currency: "USD" }, reportedCurrency: "USD", incomeTtm: null, cashFlowTtm: null,
        balance: { date: "2026-07-26", basis: "quarter", totalStockholdersEquity: 120e9, goodwill: 6e9, intangibleAssets: 1e9, preferredStock: 0, totalDebt: 33e9, cashAndShortTermInvestments: 56e9, minorityInterest: 0 } },
      subjectBalanceQuarterly: subjectBalance, collection: { candidates: { AVGO: filed }, candidateCount: 1, exclusions: [], notes: [] } });
    expect(result.peers).toEqual([expect.objectContaining({ symbol: "AVGO", multiples: expect.objectContaining({ priceToBook: 350 * 4.7e9 / 72e9 }) })]);
  });

  it.each([
    ["a different SEC industry", { sic: "7372" }, /SIC 7372 does not equal the subject's 3674/],
    ["an unmapped ticker", { mapped: false }, /company_tickers/],
    ["no filed share count", { facts: () => ({ ...facts(), facts: { "us-gaap": facts().facts["us-gaap"] } }) }, /share count/],
    ["an unreadable filing", { facts: () => { throw new Error("bad companyfacts"); } }, /bad companyfacts/],
  ] as const)("withholds the peer for %s", async (_case, overrides, reason) => {
    const filed = await loadPeerFromFilings("AVGO", subjectProfile, clients(overrides), NOW);
    expect(filed).toEqual({ reason: expect.stringMatching(reason) });
  });
});
