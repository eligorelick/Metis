import type { comparePeerFundamentals } from "@/pipeline/peers";
import type { FmpRawRow } from "@/providers/fmp";
import type { FmpFetch } from "@/pipeline/types";

export const PEER_COMMON_CAP = 80e9;
export const PEER_COMMON_EQUITY = 60e9;
/** Identical banks, with independently identified issuers and dated filed rows. */
export function peerCommonEquityCase(preferred = 6e9, changes: {
  subject?: FmpRawRow; allPeers?: FmpRawRow; firstPeer?: FmpRawRow;
} = {}): Parameters<typeof comparePeerFundamentals>[0] {
  const now = new Date("2026-10-13T18:00:00Z");
  const data = <T extends FmpRawRow>(rows: T[]): FmpFetch<T> => ({ ok: true, value: {
    data: { rows, raw: rows }, source: "fmp", endpoint: "synthetic-common-equity", asOf: "2026-10-13", fetchedAt: now.toISOString(),
  } });
  const profile = (symbol: string, cik: number) => ({ symbol, cik: String(cik), companyName: `Synthetic Bank ${symbol}`,
    industry: "Banks - Regional", sector: "Financial Services", currency: "USD", country: "US",
    isAdr: false, isEtf: false, isFund: false, isActivelyTrading: true });
  const dates = ["2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30", "2025-06-30"];
  const base = (symbol: string, date: string) => ({ symbol, date, reportedCurrency: "USD",
    filingDate: date === "2026-06-30" ? "2026-08-01" : date });
  const balances = (symbol: string, change: FmpRawRow = {}) => dates.map(date => ({ ...base(symbol, date),
    totalStockholdersEquity: PEER_COMMON_EQUITY, totalEquity: PEER_COMMON_EQUITY, goodwill: 3e9, intangibleAssets: 1e9,
    preferredStock: preferred, minorityInterest: 0, totalDebt: 0, cashAndShortTermInvestments: 0, ...change }));
  const income = (symbol: string) => data(dates.map(date => ({ ...base(symbol, date),
    period: `Q${Math.ceil(Number(date.slice(5, 7)) / 3)}`, netIncome: 1.6e9, netIncomeAvailableToCommon: 1.5e9 })));
  const quote = (symbol: string) => data([{ symbol, price: 50, marketCap: PEER_COMMON_CAP, timestamp: now.getTime() / 1000 }]);
  const targetBalance = balances("SUBJ", changes.subject);
  return { symbol: "SUBJ", profile: profile("SUBJ", 100), quote: quote("SUBJ"), route: "bank", now,
    subject: { quote: { price: 50, marketCap: PEER_COMMON_CAP, currency: "USD" }, reportedCurrency: "USD",
      incomeTtm: null, cashFlowTtm: null, balance: { ...targetBalance[0]!, basis: "quarter" }, peerComparisonAsOf: now.toISOString() },
    subjectIncomeQuarterly: income("SUBJ"), subjectBalanceQuarterly: data(targetBalance),
    collection: { candidateCount: 4, exclusions: [], notes: [], candidates: Object.fromEntries(
      ["P2", "P3", "P4", "P5"].map((symbol, i) => [symbol, { profile: data([profile(symbol, 101 + i)]),
        quote: quote(symbol), incomeQuarterly: income(symbol),
        balanceQuarterly: data(balances(symbol, { ...changes.allPeers, ...(i === 0 ? changes.firstPeer : {}) })) }])) } };
}
