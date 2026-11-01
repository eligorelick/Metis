import { beforeAll, describe, expect, it } from "vitest";
import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import type { CompanyFacts } from "@/edgar/xbrl";
import { buildDataBundle } from "@/pipeline/dataBundle";
import { runStageB } from "@/pipeline/compute";
import { validateBundle } from "@/pipeline/stageA/validate";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import type { DataBundle } from "@/pipeline/types";
import { createEdgarClient, type EdgarTransport } from "@/providers/edgar";
import { createFmpClient } from "@/providers/fmp";
import { makeLimiter } from "@/providers/http";
import { createYahooClient } from "@/providers/yahoo";
import type { FetchResult } from "@/types/core";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

const now = () => new Date("2026-07-06T00:00:00Z");
const unavailable: typeof fetch = async () => new Response("offline unavailable", { status: 404 });
const rows = <T,>(result: FetchResult<{ rows: T[] }>): T[] => result.ok ? result.value.data.rows : [];

async function producedBank(): Promise<DataBundle> {
  const seed = completeCurrencyBundle({ bank: true, symbol: "TESTBANK", siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  const fmpFetch: typeof fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const quarterly = url.searchParams.get("period") === "quarter";
    const endpoints: Record<string, object[]> = {
      profile: [{ ...rows(seed.profile)[0], symbol: "TESTBANK", cik: "0000000001" }],
      quote: rows(seed.quote),
      "income-statement": rows(quarterly ? seed.statements.incomeQuarterly : seed.statements.incomeAnnual),
      "balance-sheet-statement": rows(quarterly ? seed.statements.balanceQuarterly : seed.statements.balanceAnnual),
      "cash-flow-statement": rows(quarterly ? seed.statements.cashflowQuarterly : seed.statements.cashflowAnnual),
      "historical-price-eod/full": rows(seed.eodPrices),
      "treasury-rates": rows(seed.treasury),
      "market-risk-premium": rows(seed.marketRiskPremium),
    };
    const selected = endpoints[url.pathname.split("/stable/")[1]!] ?? [];
    return Response.json(selected.map(row => ({ ...row, ...(url.searchParams.has("symbol") ? { symbol: url.searchParams.get("symbol") } : {}) })));
  };
  const point = { end: "2025-12-31", filed: "2026-02-01", form: "10-K", fp: "FY", fy: 2025, accn: "0000000001-26-000001" };
  const facts: CompanyFacts = { cik: 1, entityName: "OTHER BANK", facts: { "us-gaap": Object.fromEntries([
    ["InterestIncomeExpenseNet", 10e6, "2025-01-01"],
    ["InterestEarningAssets", 100e6], ["LoansAndLeasesReceivableNetReportedAmount", 100e6], ["Deposits", 100e6],
  ].map(([tag, val, start]) => [tag, { units: { USD: [{ ...point, val, ...(start ? { start } : {}) }] } }])) } };
  const transport: EdgarTransport = { fetchText: async url => {
    const body = url.includes("company_tickers.json") ? { "0": { cik_str: 2, ticker: "OTHER", title: "Other" } }
      : url.includes("submissions/") ? { cik: "1", name: "OTHER BANK", sic: "6021", sicDescription: "BANK", fiscalYearEnd: "1231", stateOfIncorporation: "DE", tickers: ["OTHER"], exchanges: ["NYSE"], filings: { recent: { accessionNumber: [], filingDate: [], reportDate: [], form: [], primaryDocument: [] }, files: [] } }
        : url.includes("companyfacts/") ? facts : null;
    return { status: body ? 200 : 404, body: JSON.stringify(body), fetchedAt: now().toISOString(), fromCache: false, stale: false };
  } };
  return buildDataBundle("TESTBANK", {
    now, eodYears: 1, filingDisclosures: false, companyIr: false,
    fmp: createFmpClient({ apiKey: "TEST-KEY", fetchImpl: fmpFetch, limiter: makeLimiter(1e6, 1e6), now }),
    edgar: createEdgarClient({ transport }),
    yahoo: createYahooClient({ fetchImpl: unavailable, now, limiter: makeLimiter(1e6, 1e6) }),
    fred: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 },
    finra: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 },
    finnhub: { apiKey: "TEST-KEY", fetchImpl: unavailable, retryDelaysMs: [] },
  });
}

describe("issuer admission across producer, calculations and payload", () => {
  let produced: DataBundle;
  beforeAll(async () => { produced = await producedBank(); });

  it.each([
    ["rejected registrant", false], ["confirmed registrant", true], ["SEC ticker mapping", true],
    ["padded equivalent CIK", true], ["facts CIK mismatch", false], ["registrant CIK mismatch", false], ["absent facts", false],
  ] as const)("admits only confirmed financial evidence: %s", (mode, admitted) => {
    const bundle = structuredClone(produced);
    expect(bundle.gaps.some(g => g.field === "keyless.issuerIdentity")).toBe(true);
    if (!bundle.edgar.cik.ok || !bundle.edgar.companyFacts.ok || !bundle.edgar.registrant) throw new Error("producer fixture unavailable");
    const mapping = bundle.edgar.cik.value;
    if (mode !== "rejected registrant") bundle.edgar.registrant.tickers = [" testbank "];
    if (mode === "SEC ticker mapping") { mapping.source = "edgar"; mapping.data.ticker = "TESTBANK"; bundle.edgar.registrant = null; }
    if (mode === "padded equivalent CIK") { mapping.data.cik10 = "1"; bundle.edgar.registrant!.cik10 = "0000000001"; }
    if (mode === "facts CIK mismatch") bundle.edgar.companyFacts.value.data.cik = 2;
    if (mode === "registrant CIK mismatch") bundle.edgar.registrant!.cik10 = "0000000002";
    if (mode === "absent facts") bundle.edgar.companyFacts = { ok: false, gap: { field: "edgar.companyFacts", reason: "not available", severity: "warn" } };
    expect(confirmedIssuerFacts(bundle.symbol, bundle.edgar) !== null).toBe(admitted);
    const before = JSON.stringify(bundle);
    const validation = validateBundle(bundle, { now: now() });
    const computed = runStageB(bundle, { evIncludeLeases: false }, validation);
    const payload = assembleContextPayload(bundle, computed, validation);
    const metric = (key: string) => computed.financialMetrics.metrics.find(m => m.key === key);
    expect(metric("nim")?.value).toBe(admitted ? 10 : null);
    expect(metric("loansToDeposits")?.value).toBe(admitted ? 100 : null);
    // Valid FMP statements still supply the independent leverage observation.
    expect(metric("tangibleLeverage")?.value).toBeCloseTo(450 / 1950 * 100);
    expect(computed.route.notes.some(note => note.includes("LoansAndLeasesReceivableNetReportedAmount"))).toBe(admitted);
    const score = computed.scores.aspects.balanceSheet;
    expect(score.band).toBe(admitted ? "B" : null);
    // One remaining signal cannot support this grade; its evidence is not scored.
    expect(score.dataCompleteness).toBeCloseTo(admitted ? 0.6 : 0);
    expect(score.drivers.some(driver => driver.source.endsWith("loansToDeposits"))).toBe(admitted);
    expect(score.signals?.some(signal => signal.id === "loansToDeposits") ?? false).toBe(admitted);
    expect(payload.provenanceRegistry?.some(entry => entry.id === "computed.scores.balanceSheet.loansToDeposits" && entry.value === 100)).toBe(admitted);
    if (!admitted && mode !== "absent facts") expect(computed.gaps.some(g => g.field === "edgar.companyFacts.issuerIdentity" && /excluded/.test(g.reason))).toBe(true);
    expect(JSON.stringify(bundle)).toBe(before);
  });
});

function taggedFacts(tag: string, value: number, start: string | null = "2025-01-01", end = "2025-12-31"): CompanyFacts {
  return { cik: 1, entityName: "Other issuer", facts: { "us-gaap": { [tag]: { units: { USD: [{
    val: value, ...(start ? { start } : {}), end, filed: "2026-04-30", accn: "0000000001-26-000001", form: "10-K", fy: 2025, fp: "FY",
  }] } } } } };
}

describe("adjacent companyfacts readers enforce the same issuer boundary", () => {
  it.each([false, true])("admits repurchase execution prices only for the requested issuer (confirmed=%s)", confirmed => {
    const facts = taggedFacts("StockRepurchasedDuringPeriodValue", 20e6);
    facts.facts["us-gaap"].StockRepurchasedDuringPeriodShares = { units: { shares: [{
      val: 2e6, start: "2025-01-01", end: "2025-12-31", filed: "2026-04-30", accn: "0000000001-26-000001", form: "10-K", fy: 2025, fp: "FY",
    }] } };
    const bundle = withIssuerFacts(completeCurrencyBundle({}), facts, confirmed);
    bundle.marketCapHistory = { ok: true, value: { source: "fmp", endpoint: "test", asOf: "2025-12-31", fetchedAt: bundle.builtAt,
      data: { raw: {}, rows: [{ date: "2024-12-31", marketCap: 1000e6 }, { date: "2025-12-31", marketCap: 1000e6 }] } } };
    bundle.edgar.shareBasis = { basisDay: "2026-07-05", splits: {
      asOf: "2026-07-05", vendor: { status: "retrieved", source: "test" }, coverage: [{ from: "2020-01-01", to: "2026-07-05" }], events: [], unresolved: [], notes: [],
    } };
    const details = runStageB(bundle).capital.buybackPriceAnalysis;
    const price = details.years.find(y => y.date === "2025-12-31")?.actualPricePaid;
    expect(price ?? null).toBe(confirmed ? 10 : null);
  });

  it.each([false, true])("admits filed inventory forensic context only for the requested issuer (confirmed=%s)", confirmed => {
    const bundle = withIssuerFacts(completeCurrencyBundle({}), taggedFacts("InventoryWriteDown", 30e6), confirmed);
    expect(runStageB(bundle).forensics.beneish?.inventoryWriteDownCurrent).toBe(confirmed ? 30e6 : null);
  });

  it.each([false, true])("admits deferred taxes into utility score evidence only for the requested issuer (confirmed=%s)", confirmed => {
    const facts = taggedFacts("DeferredIncomeTaxLiabilitiesNet", 50e6, null, "2026-03-31");
    Object.assign(facts.facts["us-gaap"], taggedFacts("RegulatoryAssets", 100e6, null, "2026-03-31").facts["us-gaap"]);
    const bundle = withIssuerFacts(completeCurrencyBundle({ sic: "4911", debt: 300, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] }), facts, confirmed);
    for (const result of [bundle.statements.cashflowAnnual, bundle.statements.cashflowQuarterly]) {
      if (result.ok) for (const row of result.value.data.rows) row.changeInWorkingCapital = 0;
    }
    if (!bundle.profile.ok) throw new Error("profile fixture missing");
    Object.assign(bundle.profile.value.data.rows[0]!, { sector: "Utilities", industry: "Utilities - Regulated Electric" });
    const utility = runStageB(bundle);
    const signal = utility.scores.aspects.balanceSheet.signals?.find(s => s.id === "debtToBookCapitalization");
    if (confirmed) expect(signal?.raw).toBeCloseTo(300 / (300 + 520 + 50) * 100);
    else expect(signal).toBeUndefined();
  });

  it.each([false, true])("uses requested-company annual statements when REIT facts are unconfirmed (confirmed=%s)", confirmed => {
    const bundle = withIssuerFacts(completeCurrencyBundle({ reit: true }), taggedFacts("NetIncomeLoss", 100e6), confirmed);
    // Valid annual D&A is 50M. The vendor's 150M earnings remain usable without admitted SEC facts.
    const multiple = runStageB(bundle).valuation.multiples?.multiples.find(m => m.key === "priceToFfo");
    expect(multiple?.current).toBeCloseTo(confirmed ? 10000 / (100 + 50) : 10000 / (150 + 50));
  });
});
