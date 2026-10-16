/**
 * Peer fundamentals from SEC filings for a candidate FMP refuses by symbol
 * (NVDA report 34: AVGO, HTTP 402). Statements come from companyfacts, the
 * price from Yahoo, market capitalization from that price times the filed
 * share count on the quote's split basis, and industry from an SEC SIC code
 * equal to the subject's. Never throws; a missing piece is a reason.
 */
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { PeerFundamentals } from "@/pipeline/peers";
import type { FmpFetch } from "@/pipeline/types";
import type { EdgarClient } from "@/providers/edgar";
import type { FmpProfileRow, FmpQuoteRow, FmpRawRow } from "@/providers/fmp";
import { mergeSplitEvidence, type VendorSplitEvidence } from "@/providers/splitEvents";
import type { YahooClient } from "@/providers/yahoo";
import type { FetchResult, Sourced } from "@/types/core";

export interface PeerFilingClients {
  edgar: Pick<EdgarClient, "tickerToCik" | "submissions" | "companyFacts">;
  yahoo: Pick<YahooClient, "quote" | "splitHistory">;
}

/** Every member is required; the first gap is the reason the peer is withheld. */
function required<T>(result: FetchResult<T>): Sourced<T> {
  if (!result.ok) throw new Error(result.gap.reason);
  return result.value;
}
const sourced = <T extends FmpRawRow>(rows: T[], source: "edgar" | "yahoo", endpoint: string, asOf: string, fetchedAt: string): FmpFetch<T> =>
  ({ ok: true, value: { data: { rows, raw: null }, source, endpoint, asOf, fetchedAt } });

export async function loadPeerFromFilings(symbol: string, subject: FmpProfileRow, clients: PeerFilingClients, now: Date): Promise<PeerFundamentals | { reason: string }> {
  try {
    const cik = required(await clients.edgar.tickerToCik(symbol)).data.cik10;
    const [own, theirs, facts, quote, splits] = await Promise.all([
      clients.edgar.submissions(cik), clients.edgar.submissions(String(subject.cik)), clients.edgar.companyFacts(cik),
      clients.yahoo.quote(symbol), clients.yahoo.splitHistory(symbol),
    ]).then(([a, b, c, d, e]) => [required(a), required(b), required(c), required(d), required(e)] as const);
    const sic = own.data.sic;
    if (!sic || sic !== theirs.data.sic) return { reason: `SEC SIC ${sic} does not equal the subject's ${theirs.data.sic}` };
    const price = quote.data.rows[0];
    if (typeof price?.price !== "number") return { reason: "Yahoo quote carried no price" };
    const vendorSplits = mergeSplitEvidence([splits.data, quote.data.splitEvents].filter((answer): answer is VendorSplitEvidence => answer !== undefined));
    const built = buildStatementsFromCompanyFacts(facts.data, {
      symbol, cik, annualPeriods: 2, quarterlyPeriods: 6, asOf: now.toISOString().slice(0, 10),
      factsObservedAt: facts.fetchedAt, vendorSplits, basisDay: quote.asOf,
    });
    const shares = built.shares.outstanding;
    if (!shares) return { reason: "no SEC share count established on the quote's split basis" };
    const profile: FmpProfileRow = {
      symbol, cik, companyName: own.data.name, currency: price.currency as string,
      // SIC equality is the industry evidence; FMP's labels are the subject's.
      industry: subject.industry, sector: subject.sector, industryEvidence: `SEC SIC ${sic}, equal to the subject's`,
      isAdr: built.filesTwentyF, isEtf: false, isFund: false, isActivelyTrading: true,
    };
    const quoteRow: FmpQuoteRow = { ...price, symbol, marketCap: price.price * shares.value };
    return {
      profile: sourced([profile], "edgar", "submissions", own.asOf, own.fetchedAt),
      quote: sourced([quoteRow], "yahoo", `${quote.endpoint} × SEC shares ${shares.asOf}`, quote.asOf, quote.fetchedAt),
      incomeQuarterly: sourced(built.incomeQuarterly.rows, "edgar", "companyfacts→income-statement(quarter)", facts.asOf, facts.fetchedAt),
      balanceQuarterly: sourced(built.balanceQuarterly.rows, "edgar", "companyfacts→balance-sheet(quarter)", facts.asOf, facts.fetchedAt),
    };
  } catch (err) {
    return { reason: `SEC fallback unavailable: ${err instanceof Error ? err.message : String(err)}` };
  }
}
