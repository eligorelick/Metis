import { describe, expect, it, vi } from "vitest";
import { comparePeerFundamentals, loadPeerFundamentals, PEER_CANDIDATE_LIMIT, PEER_FETCH_BUDGET_MS, type PeerFundamentals } from "@/pipeline/peers";
import { multiplesFramework, type MultiplesFrameworkInputs } from "@/pipeline/stageB/valuation";
import type { PeerEconomicEvidence } from "@/pipeline/stageB/peerComparability";
import { createFmpClient, type CachedFetchFn, type FmpRawRow } from "@/providers/fmp";
import { makeLimiter } from "@/providers/http";
import type { FmpFetch } from "@/pipeline/types";
import { peerCommonEquityCase, PEER_COMMON_CAP } from "./helpers/peerCommonEquityCase";
import type { EconomicShareEvidence } from "@/pipeline/stageB/securityBasis";
import { peerCoverageAuditLines, valuationReviewBlocks } from "@/report/researchReview";

const NOW = new Date("2026-10-13T18:00:00Z");
function data<T extends FmpRawRow>(rows: T[]): FmpFetch<T> {
  return { ok: true, value: { data: { rows, raw: rows }, source: "fmp", endpoint: "test", asOf: "2026-10-13", fetchedAt: NOW.toISOString() } };
}
const profile = { symbol: "ROOT", cik: "1", companyName: "Root Inc", industry: "Software - Application", sector: "Technology", currency: "USD", isAdr: false };
const quote = data([{ symbol: "ROOT", marketCap: 1000, price: 10, timestamp: NOW.getTime() / 1000 }]);
// Synthetic issuer-filing evidence is supplied independently of FMP discovery.
// Industry, country and CIK alone cannot establish any of these assertions.
function economicEvidence(symbol: string): PeerEconomicEvidence {
  return {
    businessModel: "subscription application software", accountingStandard: "US_GAAP",
    periodBasis: "TTM earnings and quarter-end balance", periodEnd: "2026-06-30",
    priceCurrency: "USD", statementCurrency: "USD", availableAt: "2026-08-01",
    definitions: {
      priceToBook: "issuer market capitalization / total stockholders equity",
      priceToTbv: "issuer market capitalization / (equity - goodwill - intangibles - preferred equity)",
      peTtm: "issuer market capitalization / four quarters of common net income",
      marketCapToTtmCommonEarnings: "issuer market capitalization / four quarters of common net income",
    },
    sourceIds: [`issuer_filing:${symbol}:business_model`, `issuer_filing:${symbol}:accounting_and_financials`],
  };
}
function subject(): MultiplesFrameworkInputs {
  return { quote: { marketCap: 1000, price: 10, currency: "USD" }, reportedCurrency: "USD",
    subjectEconomicEvidence: economicEvidence("ROOT"), peerComparisonAsOf: NOW.toISOString(),
    incomeTtm: { date: "2026-06-30", basis: "ttm", revenue: 500, operatingIncome: 100, netIncome: 100, epsDiluted: null }, cashFlowTtm: null,
    balance: { date: "2026-06-30", basis: "quarter", totalStockholdersEquity: 500, goodwill: 50, intangibleAssets: 50, preferredStock: 0, totalDebt: 100, cashAndShortTermInvestments: 50, minorityInterest: 0 } };
}
function candidate(symbol = "P1", mcap = 1000): PeerFundamentals {
  return { economicEvidence: economicEvidence(symbol), profile: data([{ ...profile, symbol, cik: symbol.slice(1), companyName: `Peer ${symbol}` }]),
    quote: data([{ symbol, marketCap: mcap, price: 10, timestamp: NOW.getTime() / 1000 }]),
    incomeQuarterly: data(["2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30", "2025-06-30"].map(date => ({ symbol, date, period: `Q${Math.ceil(Number(date.slice(5, 7)) / 3)}`, reportedCurrency: "USD", netIncome: 25, filingDate: date === "2026-06-30" ? "2026-08-01" : date }))),
    balanceQuarterly: data(["2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30", "2025-06-30"].map(date => ({ totalStockholdersEquity: 500, goodwill: 50, intangibleAssets: 50, preferredStock: 0, minorityInterest: 0, date, symbol, reportedCurrency: "USD", filingDate: date === "2026-06-30" ? "2026-08-01" : date }))) };
}
function run(candidates: Record<string, PeerFundamentals>, target = subject()) {
  return comparePeerFundamentals({ symbol: "ROOT", profile, quote, route: "general", subject: target, now: NOW,
    subjectIncomeQuarterly: candidate("ROOT").incomeQuarterly, subjectBalanceQuarterly: candidate("ROOT").balanceQuarterly,
    collection: { candidates, candidateCount: Object.keys(candidates).length, exclusions: [], notes: [] } });
}

function unresolvedTarget() {
  const target = subject();
  target.quote = { ...target.quote, marketCapSecurityBasis: "unresolved",
    marketCapScopeEvidence: { reason: "The retained 10-Q names Class A and Class B common stock.", sourceIds: ["edgar:10-Q:capital"] } };
  return target;
}

describe("subject capitalization scope in the peer row", () => {
  const four = () => ({ P2: candidate("P2", 1000), P3: candidate("P3", 1500), P4: candidate("P4", 2000), P5: candidate("P5", 2500) });
  const twoClass = (): EconomicShareEvidence => ({ issuerId: "1", securityId: "ROOT", asOf: "2026-06-30", filed: "2026-08-01",
    effectiveFrom: "2026-06-30", effectiveTo: null, complete: true, sourceIds: ["filing:share-capital"], sourceHash: "synthetic-hash",
    classes: [
      { classId: "ROOT", shares: 100, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "quoted-market-price" },
      { classId: "ROOT-B", shares: 20, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "economic-equivalence-proxy" },
    ] });
  it("withholds unresolved Company capitalization while retaining the peer context", () => {
    const target = unresolvedTarget(), result = run(four(), target);
    expect(multiplesFramework("general", { ...target, ...result }).multiples.find(m => m.key === "priceToBook")?.current ?? null).toBeNull();
    expect(result.peerCoverage.comparisons[0]).toMatchObject({ current: null, peerMedian: 17.5, peerCount: 4,
      currentWithheldReason: expect.stringMatching(/^Issuer-common economic share scope unresolved.*Class A and Class B/) });
    expect(result.peerCoverage.exclusions).toContainEqual({ symbol: "ROOT", reason: expect.stringMatching(/^Company figure withheld: Issuer-common economic share scope unresolved/) });
  });
  it("uses resolved issuer-common capitalization for the Company figure and size screen", () => {
    const target = subject();
    target.quote = { ...target.quote, priceAsOf: "2026-10-13", issuerId: "1", securityId: "ROOT", marketCapSecurityBasis: "quoted-security" };
    target.securityBasisAsOf = "2026-10-13"; target.economicShareEvidence = [twoClass()];
    const result = run({ ...four(), P6: candidate("P6", 11) }, target);
    expect(result.peerCoverage.comparisons[0].current).toBeCloseTo(12, 10);
    expect(result.peerCoverage.comparisons[0].currentWithheldReason).toBeUndefined();
    expect(result.peerCoverage.exclusions.find(e => e.symbol === "P6")?.reason).toMatch(/^size screen: .*outside the 100× comparable-size band/);
  });
  it("keeps the unverified vendor capitalization control", () => {
    expect(run(four()).peerCoverage.comparisons[0]).toMatchObject({ current: 10, peerMedian: 17.5, peerCount: 4 });
  });
  it("labels withheld Company figures and retains the legacy missing display", () => {
    const peers = run(four(), unresolvedTarget()).peerCoverage;
    const table = valuationReviewBlocks({ peerCoverage: peers, symbol: "ROOT" }).find(b => b.title === "Peer comparison coverage")!.table!;
    expect(table.rows[0]).toEqual(["Market cap / TTM common earnings", "withheld", "17.5×", "4"]);
    expect(peerCoverageAuditLines(peers).join(" ")).toMatch(/company withheld \(Issuer-common economic share scope unresolved/);
    const legacy = { ...peers, comparisons: [{ name: "Market cap / TTM common earnings", current: null, peerMedian: 17.5, peerCount: 4, basis: "stored" }] };
    expect(valuationReviewBlocks({ peerCoverage: legacy, symbol: "ROOT" }).find(b => b.title === "Peer comparison coverage")!.table!.rows[0][1]).toBe("n/m");
  });
});

describe("defensible peer comparables", () => {
  function evidenceRefinedPeerCase(route: "bank" | "general") {
    const input = peerCommonEquityCase(0);
    input.route = route;
    input.profile!.industry = "Financial - Capital Markets";
    for (const peer of Object.values(input.collection!.candidates)) {
      if (!peer.profile.ok) throw new Error("fixture profile missing");
      peer.profile.value.data.rows[0]!.industry = "Financial - Capital Markets";
    }
    return input;
  }
  it("FIN-125 names same-label peers of an evidence-refined bank as unconfirmed", () => {
    const result = comparePeerFundamentals(evidenceRefinedPeerCase("bank"));
    expect(result.peerCoverage.exclusions.filter(e => /valuation route differs/.test(e.reason))).toEqual([]);
    expect(result.peerCoverage.exclusions.filter(e => /valuation route unconfirmed/.test(e.reason)).map(e => e.symbol)).toEqual(["P2", "P3", "P4", "P5"]);
    expect(result.peerCoverage.eligible).toEqual([]);
  });
  it("FIN-125 control: the same profiles remain eligible for a general subject", () => {
    expect(comparePeerFundamentals(evidenceRefinedPeerCase("general")).peerCoverage.eligible).toEqual(["P2", "P3", "P4", "P5"]);
  });
  it("FIN-125 preserves the earlier industry screen for an insurance peer", () => {
    const input = evidenceRefinedPeerCase("bank"), peer = input.collection!.candidates.P2;
    if (!peer.profile.ok) throw new Error("fixture profile missing");
    peer.profile.value.data.rows[0]!.industry = "Insurance - Life";
    // B3 rejects this profile before route comparison. Keep that stronger
    // existing screen rather than reorder it to reach the plan's stale control.
    expect(comparePeerFundamentals(input).peerCoverage.exclusions.find(e => e.symbol === "P2")?.reason).toBe("industry does not exactly match the subject");
  });

  it.each([0, 6e9])("FIN-126 peer P/B median matches the identical bank with preferred %s", preferred => {
    const input = peerCommonEquityCase(preferred), result = comparePeerFundamentals(input);
    const m = multiplesFramework("bank", { ...input.subject, ...result }).multiples;
    const pb = m.find(x => x.key === "priceToBook"), ptbv = m.find(x => x.key === "priceToTbv");
    expect(result.peers).toHaveLength(4);
    expect(ptbv?.peers?.median).toBeCloseTo(ptbv!.current!, 10);
    expect(pb?.current).toBeCloseTo(80e9 / (60e9 - preferred), 10);
    expect(pb?.peers?.median).toBeCloseTo(pb!.current!, 10);
  });
  it.each(["peer", "subject"] as const)("FIN-126 refuses nonpositive common equity on the %s side", side => {
    const input = peerCommonEquityCase(6e9, side === "peer" ? { firstPeer: { preferredStock: 70e9 } } : { subject: { preferredStock: 70e9 } });
    const result = comparePeerFundamentals(input);
    expect(result.peers.find(p => p.symbol === "P2")?.multiples.priceToBook).toBeUndefined();
    expect(result.peerCoverage.exclusions.some(e => e.symbol === "P2" && /priceToBook: positive.*common equity/.test(e.reason))).toBe(true);
  });
  it.each([
    { name: "explicit common equity", balance: { commonEquity: 48e9 }, common: 48e9 },
    { name: "consolidated equity with disclosed NCI", balance: { equityOwnershipBasis: "consolidated", minorityInterest: 6e9 }, common: 48e9 },
    { name: "parent equity with NCI already outside it", balance: { equityOwnershipBasis: "parent", minorityInterest: 6e9 }, common: 54e9 },
  ])("FIN-126 uses the subject's admitted $name basis", ({ balance, common }) => {
    const input = peerCommonEquityCase(6e9, { subject: balance, allPeers: balance });
    const result = comparePeerFundamentals(input), pb = multiplesFramework("bank", { ...input.subject, ...result }).multiples.find(m => m.key === "priceToBook");
    expect(pb?.current).toBeCloseTo(PEER_COMMON_CAP / common, 10);
    expect(pb?.peers?.median).toBeCloseTo(pb!.current!, 10);
    // P/TBV is outside this correction: preserve its existing peer formula.
    expect(result.peers[0]?.multiples.priceToTbv).toBeCloseTo(80e9 / 50e9, 10);
  });
  it("FIN-126 does not infer an undisclosed consolidated NCI allocation", () => {
    const input = peerCommonEquityCase(6e9, { firstPeer: { equityOwnershipBasis: "consolidated", minorityInterest: undefined } });
    const result = comparePeerFundamentals(input);
    expect(result.peers.find(p => p.symbol === "P2")?.multiples.priceToBook).toBeUndefined();
    expect(result.peerCoverage.exclusions.some(e => /noncontrolling-equity allocation/.test(e.reason))).toBe(true);
  });
  it.each(["peer", "subject"] as const)("FIN-126 does not widen the existing positive reported-equity gate on the %s", side => {
    const missing = { totalStockholdersEquity: undefined, commonEquity: 48e9 };
    const input = peerCommonEquityCase(6e9, side === "peer" ? { firstPeer: missing } : { subject: missing });
    const result = comparePeerFundamentals(input);
    expect(result.peers.find(p => p.symbol === "P2")?.multiples.priceToBook).toBeUndefined();
  });
  it("FIN-126 preserves the subject's zero fallback for undisclosed preferred in P/B only", () => {
    const missing = { preferredStock: undefined };
    const input = peerCommonEquityCase(6e9, { subject: missing, allPeers: missing });
    const result = comparePeerFundamentals(input);
    expect(result.peers[0]?.multiples.priceToBook).toBeCloseTo(80e9 / 60e9, 10);
    expect(result.peers[0]?.multiples.priceToTbv).toBeUndefined();
  });

  it.each(["control", "subject", "candidate", "statement"])("keeps minor units out of peer medians: %s", (minorSide) => {
    const target = subject();
    target.reportedCurrency = "GBP";
    target.quote.currency = minorSide === "subject" ? "GBp" : "GBP";
    target.subjectEconomicEvidence = undefined;
    const londonPeer = (symbol: string) => {
      const peer = candidate(symbol);
      peer.economicEvidence = undefined;
      if (!peer.profile.ok || !peer.incomeQuarterly.ok || !peer.balanceQuarterly.ok) throw new Error("fixture");
      peer.profile.value.data.rows[0].currency = symbol === "P2" && minorSide === "candidate" ? "GBp" : "GBP";
      for (const row of peer.incomeQuarterly.value.data.rows) row.reportedCurrency = "GBP";
      for (const row of peer.balanceQuarterly.value.data.rows) row.reportedCurrency = symbol === "P2" && minorSide === "statement" ? "GBp" : "GBP";
      return peer;
    };
    const own = londonPeer("ROOT");
    const result = comparePeerFundamentals({ symbol: "ROOT", profile: { ...profile, currency: target.quote.currency }, quote, route: "general", subject: target, now: NOW,
      subjectIncomeQuarterly: own.incomeQuarterly, subjectBalanceQuarterly: own.balanceQuarterly,
      collection: { candidates: { P2: londonPeer("P2") }, candidateCount: 1, exclusions: [], notes: [] } });
    expect(result.peerCoverage.eligible).toEqual(minorSide === "control" ? ["P2"] : []);
  });

  it("uses four independent issuers and independently calculated same-definition medians", () => {
    const result = run({ P2: candidate("P2", 1000), P3: candidate("P3", 1500), P4: candidate("P4", 2000), P5: candidate("P5", 2500) });
    const computed = multiplesFramework("general", { ...subject(), ...result });
    expect(result.peers).toHaveLength(4);
    expect(computed.multiples.find(m => m.key === "priceToBook")?.peers).toEqual({ median: 3.5, min: 2, max: 5, count: 4 });
    expect(computed.multiples.find(m => m.key === "peTtm")?.peers?.median).toBe(17.5);
    expect(result.peerCoverage.eligible).toEqual(["P2", "P3", "P4", "P5"]);
    expect(result.peerCoverage.comparisons[0]).toMatchObject({ peerMedian: 17.5, peerCount: 4 });
  });

  // Production never supplies independent evidence (NVDA report 34: every peer,
  // every issuer, "missing sourced economic/accounting comparability evidence").
  // Absent evidence is disclosed beside the median; contrary evidence still excludes.
  it.each(["missing-subject", "missing-peer", "missing-both"] as const)("publishes screened medians with a disclosed caveat for %s evidence", (mode) => {
    const target = subject();
    const candidates = Object.fromEntries(["P2", "P3", "P4", "P5"].map((symbol, i) => [symbol, candidate(symbol, 1000 + 500 * i)]));
    if (mode !== "missing-peer") delete target.subjectEconomicEvidence;
    if (mode !== "missing-subject") for (const peer of Object.values(candidates)) delete peer.economicEvidence;
    const result = run(candidates, target);
    const computed = multiplesFramework("general", { ...target, ...result });
    expect(computed.multiples.find(m => m.key === "priceToBook")?.peers).toEqual({ median: 3.5, min: 2, max: 5, count: 4 });
    expect(result.peerCoverage.comparisons[0]).toMatchObject({ peerMedian: 17.5, peerCount: 4 });
    expect(result.peerCoverage.eligible).toEqual(["P2", "P3", "P4", "P5"]);
    expect(result.peerCoverage.methodology.join(" ")).toMatch(/caveat.*not independently sourced/i);
    expect(computed.notes.join(" ")).toMatch(/caveat.*not independently sourced/i);
  });

  it.each(["business-model", "accounting", "period", "currency", "definition", "future-evidence"] as const)("withholds every median for %s economic evidence", (mode) => {
    const target = subject();
    const candidates = Object.fromEntries(["P2", "P3", "P4", "P5"].map(symbol => [symbol, candidate(symbol)]));
    for (const peer of Object.values(candidates)) {
      const evidence = peer.economicEvidence!;
      if (mode === "business-model") evidence.businessModel = "advertising marketplace";
      if (mode === "accounting") evidence.accountingStandard = "IFRS";
      if (mode === "period") evidence.periodEnd = "2026-03-31";
      if (mode === "currency") evidence.statementCurrency = "EUR";
      if (mode === "definition") evidence.definitions = { priceToBook: "tangible book", priceToTbv: "total book", peTtm: "adjusted EPS", marketCapToTtmCommonEarnings: "adjusted EPS" };
      if (mode === "future-evidence") evidence.availableAt = "2026-10-14";
    }
    const result = run(candidates, target);
    const computed = multiplesFramework("general", { ...target, ...result });
    expect(computed.multiples.every(multiple => multiple.peers === null)).toBe(true);
    expect(result.peerCoverage.comparisons[0]).toMatchObject({ peerMedian: null, peerCount: 0 });
    expect(result.peerCoverage.eligible).toEqual([]);
    expect(result.peerCoverage.exclusions.some(entry => /economic|business-model|accounting|period|currency|definition|unavailable/.test(entry.reason))).toBe(true);
  });

  it("rejects matching evidence dates that do not describe the financial observation periods", () => {
    const target = subject();
    target.subjectEconomicEvidence!.periodEnd = "2026-03-31";
    const candidates = Object.fromEntries(["P2", "P3", "P4", "P5"].map(symbol => {
      const peer = candidate(symbol);
      peer.economicEvidence!.periodEnd = "2026-03-31";
      return [symbol, peer];
    }));
    const result = run(candidates, target);
    const computed = multiplesFramework("general", { ...target, ...result });
    expect(computed.multiples.every(multiple => multiple.peers === null)).toBe(true);
    expect(result.peerCoverage.comparisons[0]).toMatchObject({ peerMedian: null, peerCount: 0 });
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
  it("deduplicates before fetching and caps optional reads at the candidate limit", async () => {
    const seen: string[] = [];
    const result = await loadPeerFundamentals({ symbol: "ROOT", profile, now: NOW, enabled: true,
      discovered: data(["ROOT", "P2", "p2", ...Array.from({ length: 20 }, (_, i) => `P${i + 3}`)].map(symbol => ({ symbol }))),
      client: () => ({ profile: async symbol => { seen.push(symbol); return candidate(symbol).profile; }, quote: async symbol => candidate(symbol).quote,
        incomeStatement: async symbol => candidate(symbol).incomeQuarterly, balanceSheet: async symbol => candidate(symbol).balanceQuarterly }) });
    expect(Object.keys(result.candidates)).toHaveLength(PEER_CANDIDATE_LIMIT);
    expect(new Set(seen).size).toBe(PEER_CANDIDATE_LIMIT);
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

  // NVDA report 34: AVGO's symbol-only HTTP 402 marked INTC, CBRS and CRWV "not
  // requested", so 2 of 10 candidates were evaluated.
  it("skips only the candidate a symbol-scoped refusal names, and serves it from SEC filings when available", async () => {
    const refused = { ok: false as const, gap: { field: "fmp.profile(P3)", severity: "warn" as const,
      reason: "FMP subscription (HTTP 402): this symbol is unavailable on this endpoint with this key. Use other available sources; access is rechecked after 15 minutes." } };
    const requested: string[] = [];
    const client = () => ({ profile: async (symbol: string) => { requested.push(symbol); return symbol === "P3" ? refused : candidate(symbol).profile; },
      quote: async (symbol: string) => candidate(symbol).quote, incomeStatement: async (symbol: string) => candidate(symbol).incomeQuarterly,
      balanceSheet: async (symbol: string) => candidate(symbol).balanceQuarterly });
    const discovered = data(["P2", "P3", "P4"].map(symbol => ({ symbol })));
    const withoutFiling = await loadPeerFundamentals({ symbol: "ROOT", profile, now: NOW, enabled: true, discovered, client });
    expect(requested).toEqual(["P2", "P3", "P4"]);
    expect(Object.keys(withoutFiling.candidates)).toEqual(["P2", "P4"]);
    expect(withoutFiling.exclusions).toEqual([expect.objectContaining({ symbol: "P3", reason: expect.stringMatching(/402/) })]);
    const filings: string[] = [];
    const withFiling = await loadPeerFundamentals({ symbol: "ROOT", profile, now: NOW, enabled: true, discovered, client,
      secFallback: async symbol => { filings.push(symbol); return candidate(symbol); } });
    expect(filings).toEqual(["P3"]);
    expect(Object.keys(withFiling.candidates)).toEqual(["P2", "P3", "P4"]);
    expect(withFiling.notes.join(" ")).toMatch(/P3.*SEC/);
  });

  it("aborts the optional work at its deadline and starts no later candidates", async () => {
    vi.useFakeTimers();
    try {
      let requestSignal: AbortSignal | undefined;
      let attempts = 0;
      const never = async () => { attempts++; return await new Promise<never>(() => undefined); };
      const promise = loadPeerFundamentals({ symbol: "ROOT", profile, now: NOW, enabled: true,
        discovered: data(["P2", "P3"].map(symbol => ({ symbol }))),
        client: signal => { requestSignal = signal; return { profile: never, quote: never, incomeStatement: never, balanceSheet: never }; } });
      await vi.advanceTimersByTimeAsync(PEER_FETCH_BUDGET_MS - 1);
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
