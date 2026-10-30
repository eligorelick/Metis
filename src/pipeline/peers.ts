/** Optional, bounded peer inputs. Never builds a report or invokes keyless providers. */
import type { FmpBalanceSheetRow, FmpClient, FmpIncomeStatementRow, FmpProfileRow, FmpQuoteRow, FmpRawRow, FmpStockPeerRow } from "@/providers/fmp";
import type { FmpFetch } from "@/pipeline/types";
import { establishedIsoCode as isoCode, ownRowCurrency } from "@/pipeline/estimateCurrency";
import { PEER_PROVIDER_TERMINAL } from "@/pipeline/peerProviderFailure";
import type { MultipleKey, MultiplesFrameworkInputs, PeerMultiples } from "@/pipeline/stageB/valuation";
import { normalizeQuarterRows, quarterWindowViolation } from "@/pipeline/stageB/quarterWindows";
import { routeCompany } from "@/pipeline/stageB/sectorRouting";
import { comparePriceCurrency, minorUnitQuote } from "@/pipeline/stageB/priceCurrency";
import { comparablePeers, type PeerEconomicEvidence } from "@/pipeline/stageB/peerComparability";
import { commonHolderCapital } from "@/pipeline/stageB/securityBasis";
import type { SectorRoute } from "@/types/core";

// FMP discovery returns about ten names; six cut real competitors (NVDA report
// 34 never requested MRVL or QCOM). The deadline grows with the SEC fallback.
export const PEER_CANDIDATE_LIMIT = 10;
export const PEER_FETCH_BUDGET_MS = 25_000;
const DAY = 86_400_000;
const MAX_QUOTE_AGE = 7 * DAY;
const MAX_STATEMENT_AGE = 200 * DAY;
const MAX_PERIOD_DIFFERENCE = 100 * DAY;

/**
 * D-65: a candidate more than this many times smaller (or larger) than the
 * subject by market capitalization is not a comparable company. Size is a
 * priced risk characteristic (Fama and French 1992) and multiples differ
 * systematically with it; comparable-company practice selects on industry
 * first and similar size second (Alford 1992 finds industry the decisive
 * screen, so this bound is deliberately loose: two orders of magnitude).
 * NVDA report #34 rerun listed a $29M and a $265M listing beside a $5.2T
 * issuer. Unbacktested house convention (RESEARCH §8).
 */
export const PEER_SIZE_RATIO_LIMIT = 100;

/** D-65: why a candidate's size makes it non-comparable, or null. */
export function peerSizeExclusion(subjectMarketCap: unknown, peerMarketCap: unknown): string | null {
  const subject = typeof subjectMarketCap === "number" && Number.isFinite(subjectMarketCap) && subjectMarketCap > 0 ? subjectMarketCap : null;
  const peer = typeof peerMarketCap === "number" && Number.isFinite(peerMarketCap) && peerMarketCap > 0 ? peerMarketCap : null;
  if (subject === null || peer === null) return null;
  const ratio = peer / subject;
  if (ratio >= 1 / PEER_SIZE_RATIO_LIMIT && ratio <= PEER_SIZE_RATIO_LIMIT) return null;
  const big = (v: number) => v >= 1e12 ? `${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : `${(v / 1e6).toFixed(0)}M`;
  const grouped = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `size screen: market cap ${big(peer)} is ${ratio < 1 ? `${grouped(1 / ratio)}× smaller than` : `${grouped(ratio)}× larger than`} the subject's ${big(subject)}, outside the ${PEER_SIZE_RATIO_LIMIT}× comparable-size band (house rule D-65)`;
}


/**
 * The exchange suffix of a symbol in the provider's Yahoo-style symbology
 * ("285A.T" -> "T", "MU" -> null, "BRK-B" -> null). A symbology heuristic: a
 * dotted share class ("BRK.B") reads as a suffix too.
 */
export function listingSuffix(symbol: string): string | null {
  return /\.([A-Z]{1,4})$/.exec(symbol.trim().toUpperCase())?.[1] ?? null;
}

export type PeerScreen =
  | { kind: "in-band" }
  | { kind: "excluded"; reason: string }
  | { kind: "not-compared"; reason: string };

/**
 * One size-screen rule for Stage B discovery and the payload (AI-301, D-65).
 * Caps are compared only when both currencies are established and equal, or,
 * when the provider row states none, only when the peer is on the subject's
 * listing market (same exchange suffix). That presumption only decides whether
 * a name is size-screened; it never establishes money.
 */
export function peerDiscoveryScreen(i: {
  subjectSymbol: string; subjectCurrency: string | null | undefined; subjectCap: unknown;
  peerSymbol: string; peerCurrency: string | null | undefined; peerCap: unknown;
}): PeerScreen {
  const subject = isoCode(i.subjectCurrency);
  const peer = isoCode(i.peerCurrency);
  if (peer !== null) {
    if (peer !== subject) return { kind: "not-compared", reason: `size not compared: listed in ${peer}, the subject in ${subject ?? "an unestablished currency"}; no currency conversion` };
  } else if (listingSuffix(i.peerSymbol) !== listingSuffix(i.subjectSymbol)) {
    // Say only what was compared: a suffix is a symbology heuristic, not proof of an exchange (BRK.B).
    const shown = (s: string | null) => (s === null ? "none" : `.${s}`);
    return { kind: "not-compared", reason: `size not compared: the provider row states no currency and its exchange suffix (${shown(listingSuffix(i.peerSymbol))}) differs from the subject's (${shown(listingSuffix(i.subjectSymbol))})` };
  }
  const size = peerSizeExclusion(i.subjectCap, i.peerCap);
  return size === null ? { kind: "in-band" } : { kind: "excluded", reason: size };
}

export interface PeerExclusion { symbol: string; reason: string }
export interface PeerCoverage {
  methodology: string[];
  candidates: number;
  evaluated: number;
  eligible: string[];
  exclusions: PeerExclusion[];
  comparisons: Array<{ name: string; current: number | null; peerMedian: number | null; peerCount: number; basis: string }>;
}
export interface PeerFundamentals {
  /** Independently sourced comparability evidence; the bounded FMP reads do not establish it. */
  economicEvidence?: PeerEconomicEvidence;
  profile: FmpFetch<FmpProfileRow>;
  quote: FmpFetch<FmpQuoteRow>;
  incomeQuarterly: FmpFetch<FmpIncomeStatementRow>;
  balanceQuarterly: FmpFetch<FmpBalanceSheetRow>;
}
export interface PeerCollection {
  candidates: Record<string, PeerFundamentals>;
  candidateCount: number;
  exclusions: PeerExclusion[];
  notes: string[];
  /** Normalized symbol -> ISO listing currency of every profile read for it, admitted or not. Absent in pre-batch snapshots. */
  listingCurrencies?: Record<string, string>;
  /** Observation cutoff; composition root advances this after core inputs settle. */
  collectedAt?: string;
}
type PeerClient = Pick<FmpClient, "profile" | "quote" | "incomeStatement" | "balanceSheet">;
/** Fundamentals for one candidate from SEC filings; a reason when they cannot be established. */
export type PeerFilingFallback = (symbol: string, signal: AbortSignal) => Promise<PeerFundamentals | { reason: string }>;
/** FMP's refusal of one symbol on one endpoint (fmpAccess.ts); other symbols remain servable. */
const symbolRefused = (r: FmpFetch<FmpRawRow>): boolean => !r.ok && /this symbol is unavailable on this endpoint/i.test(r.gap.reason);
const normalize = (v: unknown): string => typeof v === "string" ? v.trim().toUpperCase() : "";
const issuer = (v: unknown): string => typeof v === "string" && /^\d+$/.test(v.trim()) ? v.trim().replace(/^0+/, "") : "";
const companyName = (v: unknown): string => normalize(v).replace(/[^A-Z0-9]/g, "").replace(/(?:INCORPORATED|CORPORATION|CORP|INC|PLC|LTD)$/, "");
const number = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;
const positive = (v: unknown): number | null => number(v) !== null && (v as number) > 0 ? v as number : null;
function day(v: unknown): number | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const ms = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === v ? ms : null;
}
function rows<T extends FmpRawRow>(r: FmpFetch<T>): T[] { return r.ok ? r.value.data.rows : []; }

function profileReason(subject: FmpProfileRow, peer: FmpProfileRow, symbol: string): string | null {
  if (normalize(peer.symbol) !== symbol) return "profile symbol identity does not match requested candidate";
  if (peer.isAdr !== false || peer.isEtf === true || peer.isFund === true || peer.isActivelyTrading === false) return "ordinary active non-ADR equity status not established";
  if (!issuer(peer.cik)) return "issuer identity unavailable: a valid CIK is required for share-class deduplication";
  if (issuer(peer.cik) === issuer(subject.cik) || (companyName(peer.companyName) && companyName(peer.companyName) === companyName(subject.companyName))) return "self issuer/share class excluded";
  if (!normalize(subject.industry) || normalize(peer.industry) !== normalize(subject.industry)) return "industry does not exactly match the subject";
  if (!normalize(subject.sector) || normalize(peer.sector) !== normalize(subject.sector)) return "sector does not exactly match the subject";
  const comparison = comparePriceCurrency(subject.currency, peer.currency);
  if (!comparison.comparable) return "listing currency does not match the proven subject currency" +
    (minorUnitQuote(subject.currency) || minorUnitQuote(peer.currency) ? `: ${comparison.reason}` : "");
  return null;
}

/**
 * Production supplies a client carrying the existing durable FMP cache and this
 * deadline signal. One candidate at a time, four endpoint reads at most each;
 * terminal entitlement/quota failures stop subsequent candidates. A refusal of
 * one symbol is not terminal: that candidate is served from SEC filings when a
 * fallback is supplied, and the next candidate is still requested. Deadline
 * races also bound injected clients; production requests are actually aborted.
 */
export async function loadPeerFundamentals(opts: {
  symbol: string; profile: FmpProfileRow | undefined; discovered: FmpFetch<FmpStockPeerRow>;
  now: Date; enabled: boolean; client: (signal: AbortSignal) => PeerClient;
  signal?: AbortSignal; budgetMs?: number; clock?: () => Date; secFallback?: PeerFilingFallback;
}): Promise<PeerCollection> {
  const result: PeerCollection = { candidates: {}, candidateCount: 0, exclusions: [], notes: [] };
  if (!opts.enabled) { result.notes.push("Peer fundamentals unavailable on the keyless/reserved-symbol path; no peer provider requests were made."); return result; }
  if (!opts.discovered.ok) { result.notes.push(`Peer discovery unavailable: ${opts.discovered.gap.reason}`); return result; }
  if (!opts.profile || !issuer(opts.profile.cik)) { result.notes.push("Peer collection withheld: subject issuer identity unavailable."); return result; }
  const symbols: string[] = [];
  const seen = new Set([normalize(opts.symbol)]);
  for (const row of rows(opts.discovered)) {
    const symbol = normalize(row.symbol);
    if (!/^[A-Z0-9][A-Z0-9.-]{0,19}$/.test(symbol)) { result.exclusions.push({ symbol: symbol || "(missing)", reason: "invalid candidate symbol" }); continue; }
    if (seen.has(symbol)) { result.exclusions.push({ symbol, reason: "self or duplicate candidate symbol" }); continue; }
    seen.add(symbol);
    // D-65: a micro-cap beside a mega-cap is not requested; the comparison
    // repeats the screen on the candidate's own quote. A row on another
    // listing market is not size-compared here (its cap may be in another
    // currency); the profile read and the quote-based test decide (AI-301-V1).
    const screen = peerDiscoveryScreen({ subjectSymbol: opts.symbol, subjectCurrency: opts.profile.currency, subjectCap: opts.profile.marketCap, peerSymbol: symbol, peerCurrency: ownRowCurrency(row), peerCap: row.mktCap });
    if (screen.kind === "excluded") { result.exclusions.push({ symbol, reason: screen.reason }); continue; }
    symbols.push(symbol);
  }
  result.candidateCount = symbols.length;
  for (const symbol of symbols.slice(PEER_CANDIDATE_LIMIT)) result.exclusions.push({ symbol, reason: `optional candidate budget limit (${PEER_CANDIDATE_LIMIT})` });
  const controller = new AbortController();
  const signal = opts.signal ? AbortSignal.any([opts.signal, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(new Error("peer fetch deadline exceeded")), Math.min(Math.max(opts.budgetMs ?? PEER_FETCH_BUDGET_MS, 1), PEER_FETCH_BUDGET_MS));
  const read = async <T>(loader: () => Promise<T>): Promise<T> => {
    if (signal.aborted) throw new Error("peer fetch deadline/cancellation");
    let abort: () => void = () => undefined;
    try {
      return await Promise.race([loader(), new Promise<T>((_, reject) => {
        abort = () => reject(new Error("peer fetch deadline/cancellation"));
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      })]);
    } finally { signal.removeEventListener("abort", abort); }
  };
  const terminal = (r: FmpFetch<FmpRawRow>): boolean => !r.ok && !symbolRefused(r) && PEER_PROVIDER_TERMINAL.test(r.gap.reason);
  const seenIssuers = new Set<string>();
  const seenNames = new Set<string>();
  const subjectProfile = opts.profile;
  const recordCurrency = (symbol: string, peer: FmpProfileRow): void => {
    const code = isoCode(peer.currency);
    if (normalize(peer.symbol) === symbol && code !== null) (result.listingCurrencies ??= {})[symbol] = code;
  };
  const admit = (symbol: string, peer: FmpProfileRow): string | null => {
    recordCurrency(symbol, peer);
    const reason = profileReason(subjectProfile, peer, symbol);
    const id = issuer(peer.cik); const name = companyName(peer.companyName);
    if (reason || seenIssuers.has(id) || (name && seenNames.has(name))) return reason ?? "duplicate issuer/share class";
    seenIssuers.add(id); if (name) seenNames.add(name);
    return null;
  };
  // The SEC fallback replaces the whole candidate, so every member shares one source.
  const fromFilings = async (symbol: string, refusal: string): Promise<boolean> => {
    if (!opts.secFallback) return false;
    const filed = await read(() => opts.secFallback!(symbol, signal));
    const peer = "reason" in filed ? undefined : rows(filed.profile)[0];
    const reason = "reason" in filed ? filed.reason : peer ? admit(symbol, peer) : "SEC profile unavailable";
    if (reason !== null || "reason" in filed) { result.exclusions.push({ symbol, reason: `${refusal}; SEC fallback: ${reason}` }); return true; }
    result.candidates[symbol] = filed;
    result.notes.push(`${symbol}: FMP refused this symbol; its fundamentals come from SEC companyfacts and a Yahoo quote, and its industry from an SEC SIC code equal to the subject's.`);
    return true;
  };
  let stopped = false;
  try {
    const client = opts.client(signal);
    for (const symbol of symbols.slice(0, PEER_CANDIDATE_LIMIT)) {
      if (stopped) { result.exclusions.push({ symbol, reason: "provider unavailable or optional deadline exhausted; candidate not requested" }); continue; }
      try {
        const profile = await read(() => client.profile(symbol));
        const peer = rows(profile)[0];
        if (!profile.ok || !peer) {
          if (!profile.ok && symbolRefused(profile) && await fromFilings(symbol, profile.gap.reason)) continue;
          result.exclusions.push({ symbol, reason: !profile.ok ? profile.gap.reason : "profile unavailable" });
          stopped = terminal(profile); continue;
        }
        const reason = admit(symbol, peer);
        if (reason) { result.exclusions.push({ symbol, reason }); continue; }
        const [quote, incomeQuarterly, balanceQuarterly] = await read(() => Promise.all([
          client.quote(symbol), client.incomeStatement(symbol, "quarter", 5), client.balanceSheet(symbol, "quarter", 5),
        ]));
        const refused = [quote, incomeQuarterly, balanceQuarterly].find(symbolRefused);
        if (refused && !refused.ok && opts.secFallback) {
          seenIssuers.delete(issuer(peer.cik)); seenNames.delete(companyName(peer.companyName));
          await fromFilings(symbol, refused.gap.reason); continue;
        }
        result.candidates[symbol] = { profile, quote, incomeQuarterly, balanceQuarterly };
        stopped = [quote, incomeQuarterly, balanceQuarterly].some(terminal);
      } catch {
        result.exclusions.push({ symbol, reason: "peer provider unavailable or optional deadline/cancellation reached" }); stopped = true;
      }
    }
  } catch { result.notes.push("Peer provider unavailable; optional collection skipped."); }
  finally { clearTimeout(timer); result.collectedAt = (opts.clock?.() ?? opts.now).toISOString(); }
  if (stopped) result.notes.push("Optional peer collection stopped after provider unavailability/quota or its deadline; incomplete coverage is disclosed.");
  return result;
}

function sourceReason<T extends FmpRawRow>(r: FmpFetch<T>, symbol: string, now: number, expectedCik?: string): string | null {
  if (!r.ok) return r.gap.reason;
  const fetched = Date.parse(r.value.fetchedAt);
  if (r.value.stale || !Number.isFinite(fetched) || fetched > now || now - fetched > MAX_QUOTE_AGE) return "stale, future or invalid provider cache observation";
  if (r.value.data.rows.some(row => normalize(row.symbol) !== symbol)) return "statement/quote symbol identity does not match requested candidate";
  if (expectedCik && r.value.data.rows.some(row => row.cik !== undefined && row.cik !== null && row.cik !== "" && issuer(row.cik) !== expectedCik)) return "explicit statement/quote CIK conflicts with the requested issuer identity";
  return null;
}
function quoteReason(r: FmpFetch<FmpQuoteRow>, symbol: string, now: number, expectedCik?: string): string | null {
  const source = sourceReason(r, symbol, now, expectedCik); if (source) return source;
  const q = rows(r)[0]; const stamp = number(q?.timestamp);
  if (stamp === null || stamp * 1000 > now || now - stamp * 1000 > MAX_QUOTE_AGE) return "quote timestamp is missing, stale or in the future";
  return positive(q?.marketCap) === null || positive(q?.price) === null ? "positive quote price and issuer market capitalization required" : null;
}
function statementReason(r: FmpRawRow, currency: string, quoteDate: number): string | null {
  const end = day(r.date);
  if (end === null || end > quoteDate) return "invalid/future fiscal period date";
  if (!comparePriceCurrency(typeof r.reportedCurrency === "string" ? r.reportedCurrency : null, currency).comparable) return "statement currency not proven to match the quote currency";
  const accepted = r.acceptedDate;
  // FMP acceptance times commonly omit a time zone. Treat such timestamps and
  // filing dates as whole-day intervals, never as evidence known at midnight.
  if (accepted !== undefined && accepted !== null && (typeof accepted !== "string" || !/^\d{4}-\d{2}-\d{2}(?:[ T](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z?)?$/.test(accepted))) return "invalid filing acceptance timestamp";
  const filed = day(typeof accepted === "string" ? accepted.slice(0, 10) : r.filingDate);
  const available = typeof accepted === "string" && accepted.endsWith("Z") ? Date.parse(accepted) : filed === null ? null : filed + DAY - 1;
  if (filed === null || filed < end || available === null || !Number.isFinite(available) || available > quoteDate) return "filing date unavailable, invalid or not proven available before the quote";
  return null;
}

/** Evidence must describe the actual observation, not merely match another label. */
function evidenceForObservation(evidence: PeerEconomicEvidence | undefined, periodEnd: unknown, currency: string, quoteDate: number): PeerEconomicEvidence | undefined {
  if (!evidence || evidence.periodEnd.slice(0, 10) !== periodEnd || evidence.priceCurrency !== currency || evidence.statementCurrency !== currency) return undefined;
  const availableDay = day(evidence.availableAt);
  const available = availableDay === null ? Date.parse(evidence.availableAt) : availableDay + DAY - 1;
  return Number.isFinite(available) && available <= quoteDate ? evidence : undefined;
}

/** Common-earnings proof is per quarter; latest balance alone cannot establish older preferred claims. */
function commonIncome(income: FmpIncomeStatementRow[], balances: FmpBalanceSheetRow[], currency: string, quoteDate: number): { value: number | null; date: string | null; reason: string | null } {
  const normalized = normalizeQuarterRows(income);
  const inc = normalized.rows.slice(0, 4);
  const violation = normalized.rejected.length ? "ambiguous/invalid quarterly periods" : quarterWindowViolation(inc, normalized.rows[4]);
  if (violation) return { value: null, date: null, reason: violation };
  const normalizedBalances = normalizeQuarterRows(balances).rows;
  let total = 0;
  for (const row of inc) {
    if (typeof row.period !== "string" || !/^Q[1-4]$/.test(row.period)) return { value: null, date: null, reason: "quarterly fiscal period labels unproven (annual rows cannot form TTM)" };
    const reason = statementReason(row, currency, quoteDate);
    if (reason) return { value: null, date: null, reason };
    const filedCommon = number(row.netIncomeAvailableToCommon);
    const bal = normalizedBalances.find(b => b.date === row.date);
    const common = filedCommon ?? (bal && !statementReason(bal, currency, quoteDate) && bal.preferredStock === 0 && bal.minorityInterest === 0 ? number(row.netIncome) : null);
    if (common === null) return { value: null, date: null, reason: "common ownership unproven: require filed common earnings or zero preferred and minority claims in each same-date quarterly balance" };
    total += common;
  }
  return { value: positive(total), date: String(inc[0].date), reason: positive(total) === null ? "nonpositive TTM common earnings" : null };
}

export function comparePeerFundamentals(opts: {
  symbol: string; profile: FmpProfileRow | undefined; quote: FmpFetch<FmpQuoteRow>;
  route: SectorRoute; subject: MultiplesFrameworkInputs; now: Date; collection?: PeerCollection;
  subjectIncomeQuarterly?: FmpFetch<FmpIncomeStatementRow>; subjectBalanceQuarterly?: FmpFetch<FmpBalanceSheetRow>;
}): { peers: PeerMultiples[]; peerCoverage: PeerCoverage } & Pick<MultiplesFrameworkInputs, "subjectEconomicEvidence" | "peerComparisonAsOf"> {
  const peers: PeerMultiples[] = [];
  const collection = opts.collection;
  const peerCoverage: PeerCoverage = {
    methodology: [
      `FMP discovery candidates; at most ${PEER_CANDIDATE_LIMIT} candidate profiles and three additional cached endpoints each, within ${PEER_FETCH_BUDGET_MS / 1000}s. Exact normalized industry AND sector; same valuation route and listing/reporting currency; market capitalization within ${PEER_SIZE_RATIO_LIMIT}× of the subject's either way, compared only between established equal currencies or same-market listings; known CIK deduplicates issuers/share classes; non-ADR equities only. When the subject's route rests on SEC evidence, same-label peers whose route the profile-only screen cannot confirm are excluded as unconfirmed; no additional SEC routing request is made.`,
      "Quotes must be no older than 7 calendar days and never future-dated; stale cache responses are excluded. Quarterly balance/TTM ends must be at most 200 days old and within 100 days of the subject fiscal end. Statements require dated filings available by the quote date.",
      "P/B uses market cap / common equity: explicit common equity when disclosed, otherwise parent stockholders equity less preferred; consolidated equity also requires a disclosed noncontrolling-equity allocation. Undisclosed preferred reads as zero, as for the subject; the positive reported-equity admission gate remains. P/TBV subtracts goodwill, intangible assets and explicitly disclosed preferred equity. Common-earnings comparison uses market cap / four contiguous quarters of earnings available to common. No forward EPS, currency conversion or share-class EPS assumptions.",
      "Medians require at least four distinct issuers surviving nonpositive/missing exclusions and the 1.5×IQR rule for that metric. EV, cash-flow and REIT peer metrics are withheld because comparable definitions are unproven. These peer observations do not change grades or intrinsic value.",
      "Business-model, accounting, reporting-period and metric-definition evidence that is supplied but invalid, unavailable at the comparison date, or different from the subject's excludes a peer. No source supplies that evidence independently yet, so a median that rests on the screens above carries a stated comparability caveat rather than being withheld; FMP industry classification alone does not establish business-model comparability.",
      ...(collection?.notes ?? ["Peer fundamentals not collected on this report."]),
    ], candidates: collection?.candidateCount ?? 0, evaluated: Object.keys(collection?.candidates ?? {}).length,
    eligible: [], exclusions: [...(collection?.exclusions ?? [])], comparisons: [],
  };
  const out = { peers, peerCoverage, subjectEconomicEvidence: undefined as PeerEconomicEvidence | undefined, peerComparisonAsOf: opts.subject.peerComparisonAsOf };
  const exclude = (symbol: string, reason: string) => peerCoverage.exclusions.push({ symbol, reason });
  const now = opts.now.getTime(); const symbol = normalize(opts.symbol); const subject = opts.subject;
  const currency = normalize(subject.quote.currency);
  const targetCik = issuer(opts.profile?.cik);
  const targetQuoteReason = quoteReason(opts.quote, symbol, now, targetCik);
  if (!opts.profile || !issuer(opts.profile.cik) || opts.profile.isAdr !== false || targetQuoteReason || !comparePriceCurrency(subject.reportedCurrency, subject.quote.currency).comparable) {
    exclude(symbol, targetQuoteReason ?? "subject issuer, ordinary share or statement/quote currency comparability unproven"); return out;
  }
  const subjectBalanceEnd = day(subject.balance?.date);
  if (subject.balance?.basis !== "quarter" || subjectBalanceEnd === null || subjectBalanceEnd > now || now - subjectBalanceEnd > MAX_STATEMENT_AGE) {
    exclude(symbol, "subject current quarterly balance basis missing, stale or future-dated"); return out;
  }
  if (opts.route === "reit") { exclude(symbol, "REIT FFO/AFFO definitions cannot be established from this bounded peer dataset"); return out; }
  const targetQuoteMs = (rows(opts.quote)[0].timestamp as number) * 1000;
  const targetBalance = opts.subjectBalanceQuarterly ? normalizeQuarterRows(rows(opts.subjectBalanceQuarterly)).rows.find(row => row.date === subject.balance?.date) : undefined;
  const targetBalanceReason = !opts.subjectBalanceQuarterly ? "quarterly balance source unavailable"
    : sourceReason(opts.subjectBalanceQuarterly, symbol, now, targetCik) ?? (targetBalance ? statementReason(targetBalance, currency, targetQuoteMs) : "quarterly balance filing unavailable");
  if (targetBalanceReason) { exclude(symbol, `subject balance: ${targetBalanceReason}`); return out; }
  out.subjectEconomicEvidence = evidenceForObservation(subject.subjectEconomicEvidence, subject.balance.date, currency, targetQuoteMs);
  // Supplied evidence that does not describe the observation is contrary
  // evidence, not absent evidence: it never falls back to the caveat path.
  const subjectEvidenceContrary = subject.subjectEconomicEvidence !== undefined && out.subjectEconomicEvidence === undefined;
  if (subjectEvidenceContrary) exclude(symbol, "subject economic evidence does not describe the compared observation's period, currency or availability; no peer median is published");
  const subjectCommon = opts.subjectIncomeQuarterly && opts.subjectBalanceQuarterly && !sourceReason(opts.subjectIncomeQuarterly, symbol, now, targetCik) && !sourceReason(opts.subjectBalanceQuarterly, symbol, now, targetCik)
    ? commonIncome(rows(opts.subjectIncomeQuarterly), rows(opts.subjectBalanceQuarterly), currency, targetQuoteMs)
    : { value: null, date: null, reason: "subject four-quarter common earnings source/identity unavailable" };
  const targetIncomeEnd = day(subjectCommon.date);
  const commonValid = targetIncomeEnd !== null && targetIncomeEnd <= now && now - targetIncomeEnd <= MAX_STATEMENT_AGE && subjectCommon.value !== null;
  if (!commonValid) exclude(symbol, `Common earnings comparison: ${subjectCommon.reason ?? "subject TTM statement stale or missing"}`);
  const commonValues: Array<{ symbol: string; value: number; economicEvidence?: PeerEconomicEvidence }> = [];
  const subjectProfileRoute = routeCompany({ sector: opts.profile.sector ?? null, industry: opts.profile.industry ?? null,
    currency: opts.profile.currency ?? null, country: opts.profile.country ?? null, isAdr: false, isEtf: false, isFund: false, ipoDate: null },
    { incomeTtm: null, incomeAnnual: null, cashflowTtm: null, cashflowAnnual: null, availableQuarters: null },
    { today: opts.now.toISOString().slice(0, 10) }).base;
  const ids = new Set([issuer(opts.profile.cik)]); const names = new Set([companyName(opts.profile.companyName)]);
  for (const [requested, candidate] of subjectEvidenceContrary ? [] : Object.entries(collection?.candidates ?? {})) {
    const peerSymbol = normalize(requested); const profile = rows(candidate.profile)[0];
    const candidateCik = issuer(profile?.cik);
    const reason = sourceReason(candidate.profile, peerSymbol, now, candidateCik) || (!profile ? "profile missing" : profileReason(opts.profile, profile, peerSymbol)) || quoteReason(candidate.quote, peerSymbol, now, candidateCik) || sourceReason(candidate.balanceQuarterly, peerSymbol, now, candidateCik);
    if (reason || !profile) { exclude(peerSymbol, reason ?? "profile missing"); continue; }
    const id = issuer(profile.cik); const name = companyName(profile.companyName);
    if (ids.has(id) || (name && names.has(name))) { exclude(peerSymbol, "duplicate issuer/share class"); continue; }
    ids.add(id); if (name) names.add(name);
    const candidateRoute = routeCompany({ sector: profile.sector ?? null, industry: profile.industry ?? null, currency: profile.currency ?? null, country: profile.country ?? null, isAdr: false, isEtf: false, isFund: false, ipoDate: null },
      { incomeTtm: null, incomeAnnual: null, cashflowTtm: null, cashflowAnnual: null, availableQuarters: null }, { today: opts.now.toISOString().slice(0, 10) }).base;
    if (candidateRoute !== opts.route) {
      exclude(peerSymbol, subjectProfileRoute !== opts.route && candidateRoute === subjectProfileRoute
        ? "valuation route unconfirmed: the subject's route rests on SEC routing evidence (SIC and XBRL facts) that the peer screen does not have for this peer"
        : "valuation route differs from subject's resolved route");
      continue;
    }
    const peerQuote = rows(candidate.quote)[0]; const quoteMs = (peerQuote.timestamp as number) * 1000;
    const sizeReason = peerSizeExclusion(subject.quote.marketCap, peerQuote.marketCap);
    if (sizeReason !== null) { exclude(peerSymbol, sizeReason); continue; }
    const normalizedBalance = normalizeQuarterRows(rows(candidate.balanceQuarterly));
    const bal = normalizedBalance.rows[0]; const balanceEnd = day(bal?.date);
    const balReason = bal ? statementReason(bal, currency, quoteMs) : "quarterly balance missing";
    if (normalizedBalance.rejected.length || balReason || balanceEnd === null || now - balanceEnd > MAX_STATEMENT_AGE || Math.abs(balanceEnd - subjectBalanceEnd) > MAX_PERIOD_DIFFERENCE) {
      exclude(peerSymbol, balReason ?? "quarterly balance dates ambiguous, stale or not aligned to subject"); continue;
    }
    const mcap = peerQuote.marketCap as number; const multiples: Partial<Record<MultipleKey, number | null>> = {};
    const economicEvidence = evidenceForObservation(candidate.economicEvidence, bal.date, currency, quoteMs);
    if (candidate.economicEvidence && !economicEvidence) { exclude(peerSymbol, "economic evidence does not describe this peer's observation period, currency or availability"); continue; }
    const equity = positive(bal.totalStockholdersEquity);
    if (equity !== null && positive(subject.balance.totalStockholdersEquity) !== null) {
      const peerCapital = commonHolderCapital(null, {
        totalStockholdersEquity: equity, preferredStock: number(bal.preferredStock),
        minorityInterest: number(bal.minorityInterest), commonEquity: number(bal.commonEquity),
        equityOwnershipBasis: bal.equityOwnershipBasis === "consolidated" ? "consolidated" : "parent",
      });
      const subjectCapital = commonHolderCapital(null, subject.balance);
      const common = positive(peerCapital.commonEquity), targetCommon = positive(subjectCapital.commonEquity);
      if (common !== null && targetCommon !== null) multiples.priceToBook = mcap / common;
      else {
        const reason = peerCapital.equityWithheldReason ?? subjectCapital.equityWithheldReason;
        exclude(peerSymbol, `priceToBook: positive admitted common equity required for both issuer and peer${reason ? `; ${reason}` : ""}`);
      }
    } else exclude(peerSymbol, "priceToBook: positive equity required for both issuer and peer");
    const components = [bal.goodwill, bal.intangibleAssets, bal.preferredStock, subject.balance.goodwill, subject.balance.intangibleAssets, subject.balance.preferredStock];
    if (equity !== null && components.every(v => number(v) !== null && (v as number) >= 0)) {
      const tbv = equity - (bal.goodwill as number) - (bal.intangibleAssets as number) - (bal.preferredStock as number);
      const targetTbv = (subject.balance.totalStockholdersEquity ?? 0) - (subject.balance.goodwill as number) - (subject.balance.intangibleAssets as number) - (subject.balance.preferredStock as number);
      if (tbv > 0 && targetTbv > 0) multiples.priceToTbv = mcap / tbv;
      else exclude(peerSymbol, "priceToTbv: positive tangible common equity required");
    } else exclude(peerSymbol, "priceToTbv: goodwill, intangibles or preferred equity not explicitly disclosed");
    const incomeSourceReason = sourceReason(candidate.incomeQuarterly, peerSymbol, now, candidateCik);
    const common = incomeSourceReason ? { value: null, date: null, reason: incomeSourceReason } : commonIncome(rows(candidate.incomeQuarterly), normalizedBalance.rows, currency, quoteMs);
    const incomeEnd = day(common.date);
    const commonEligible = commonValid && common.value !== null && incomeEnd !== null && now - incomeEnd <= MAX_STATEMENT_AGE && Math.abs(incomeEnd - (targetIncomeEnd as number)) <= MAX_PERIOD_DIFFERENCE;
    const commonEvidence = evidenceForObservation(candidate.economicEvidence, common.date, currency, quoteMs);
    if (commonEligible && common.value !== null && candidate.economicEvidence && !commonEvidence) {
      exclude(peerSymbol, "common earnings: economic evidence does not describe this peer's trailing-earnings period");
    } else if (commonEligible && common.value !== null) {
      commonValues.push({ symbol: peerSymbol, value: mcap / common.value, economicEvidence: commonEvidence });
      if (subject.incomeTtm?.basis === "ttm" && positive(subject.incomeTtm.epsDiluted) === null && subject.incomeTtm.netIncome === subjectCommon.value
        && (!economicEvidence || economicEvidence.periodEnd.slice(0, 10) === common.date) && (!out.subjectEconomicEvidence || out.subjectEconomicEvidence.periodEnd.slice(0, 10) === subjectCommon.date)) multiples.peTtm = mcap / common.value;
      else exclude(peerSymbol, "peTtm: subject price/diluted-EPS or annual basis differs; use the separate common-earnings comparison");
    } else exclude(peerSymbol, `peTtm/common earnings: ${common.reason ?? "subject/peer TTM common earnings missing or fiscal dates not comparable"}`);
    if (Object.keys(multiples).length || commonEligible) peers.push({ symbol: peerSymbol, multiples, economicEvidence });
    else exclude(peerSymbol, "no supported comparable metric available");
  }
  // The same linear-interpolated IQR policy as the existing multiples framework.
  const quantile = (values: number[], p: number) => { const index = (values.length - 1) * p; const low = Math.floor(index); return values[low] + (values[Math.ceil(index)] - values[low]) * (index - low); };
  const survivors = (values: Array<{ symbol: string; value: number }>, metric: string): number[] => {
    const sorted = values.map(v => v.value).filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    if (sorted.length === 0) return [];
    const q1 = quantile(sorted, .25); const q3 = quantile(sorted, .75);
    const accepted: number[] = [];
    for (const item of values) {
      if (Number.isFinite(item.value) && item.value > 0 && item.value >= q1 - 1.5 * (q3 - q1) && item.value <= q3 + 1.5 * (q3 - q1)) accepted.push(item.value);
      else exclude(item.symbol, `${metric}: excluded by nonpositive/nonfinite or 1.5×IQR rule`);
    }
    return accepted.sort((a, b) => a - b);
  };
  const eligibleSymbols = new Set<string>();
  const screen = <T extends { symbol: string; economicEvidence?: PeerEconomicEvidence }>(candidates: T[], metric: string): T[] => {
    const subjectEvidence = metric === "marketCapToTtmCommonEarnings"
      ? evidenceForObservation(subject.subjectEconomicEvidence, subjectCommon.date, currency, targetQuoteMs)
      : out.subjectEconomicEvidence;
    if (subject.subjectEconomicEvidence && !subjectEvidence) {
      for (const entry of candidates) exclude(entry.symbol, `${metric}: subject economic evidence does not describe this comparison's period`);
      return [];
    }
    const comparison = comparablePeers(subjectEvidence, candidates, metric, out.peerComparisonAsOf ?? null);
    for (const entry of comparison.excluded) exclude(entry.symbol, `${metric}: ${entry.reasons.join("; ")}`);
    for (const peer of comparison.eligible) eligibleSymbols.add(peer.symbol);
    peerCoverage.methodology.push(...comparison.caveats);
    return comparison.eligible;
  };
  for (const key of ["peTtm", "priceToBook", "priceToTbv"] as const) {
    const economicPeers = screen(peers.filter(peer => typeof peer.multiples[key] === "number"), key);
    const surviving = survivors(economicPeers.map(peer => ({ symbol: peer.symbol, value: peer.multiples[key] as number })), key);
    if (surviving.length < 4) peerCoverage.methodology.push(`${key}: median withheld; ${surviving.length} usable peers after IQR, four required.`);
  }
  const trimmed = survivors(screen(commonValues, "marketCapToTtmCommonEarnings"), "common earnings");
  peerCoverage.eligible = peers.filter(peer => eligibleSymbols.has(peer.symbol)).map(peer => peer.symbol);
  peerCoverage.comparisons.push({ name: "Market cap / TTM common earnings", current: commonValid ? (subject.quote.marketCap as number) / (subjectCommon.value as number) : null,
    peerMedian: commonValid && trimmed.length >= 4 ? quantile(trimmed, .5) : null, peerCount: trimmed.length,
    basis: "Issuer market capitalization / four contiguous quarters of filed common earnings (or net income only with zero preferred and minority claims in each same-date quarterly balance). Not price/diluted EPS. At least four issuers after 1.5×IQR filtering required." });
  if (trimmed.length < 4) peerCoverage.methodology.push(`Common-earnings median withheld: ${trimmed.length} eligible peers after the IQR rule; four required.`);
  return out;
}
