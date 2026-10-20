/**
 * The audit issuer fixtures of 2026-10-19 run end to end on the keyless path:
 * buildDataBundle with no FMP key (SEC companyfacts + a fake Yahoo), then
 * runStageB on the bundle. tests/audit.issuerFixtures.test.ts pins the
 * statement builder on the same fixtures; this file pins what reaches the
 * valuation (audit GATE-21, PGR-2, SNOW-10, O-2, FCX-1).
 *
 * Only the companyfacts are SEC data. The submissions payload is rebuilt from
 * the accessions the facts cite, prices are a synthetic weekday series ending
 * at the run's quote, and the risk-free rate is one fixed DGS10 observation;
 * no vendor data. Each issuer's clock starts 20 s before its companyfacts
 * fetch stamp, so every build must admit facts fetched during the build
 * (audit PGR-1, PGR-2).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { runStageB, type ComputedMetrics } from "@/pipeline/compute";
import { buildDataBundle } from "@/pipeline/dataBundle";
import type { DataBundle } from "@/pipeline/types";
import { createEdgarClient, type EdgarTransport, type EdgarTransportResponse } from "@/providers/edgar";
import { createFmpClient } from "@/providers/fmp";
import { makeLimiter } from "@/providers/http";
import { createYahooClient } from "@/providers/yahoo";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FinraConfig } from "@/providers/finra";
import type { FinnhubConfig } from "@/providers/finnhub";
import type { FredConfig } from "@/providers/fred";

const MN = 1_000_000;
const DAY_S = 86_400;

/** The run's companyfacts fetch stamp and quote, and the registrant facts its submissions carry. */
const ISSUERS = {
  FCX: { cik: 831259, fetchedAt: "2026-10-19T23:45:45.743Z", price: 69.75, sic: "1000", sicDescription: "METAL MINING", fiscalYearEnd: "1231" },
  PGR: { cik: 80661, fetchedAt: "2026-10-20T00:06:23.764Z", price: 219.11, sic: "6331", sicDescription: "FIRE, MARINE & CASUALTY INSURANCE", fiscalYearEnd: "1231" },
  O: { cik: 726728, fetchedAt: "2026-10-20T00:25:56.282Z", price: 55.51, sic: "6798", sicDescription: "REAL ESTATE INVESTMENT TRUSTS", fiscalYearEnd: "1231" },
  SNOW: { cik: 1640147, fetchedAt: "2026-10-20T00:45:54.455Z", price: 315.35, sic: "7372", sicDescription: "SERVICES-PREPACKAGED SOFTWARE", fiscalYearEnd: "0131" },
  NNN: { cik: 751364, fetchedAt: "2026-10-20T00:26:00.733Z", price: 40.86, sic: "6798", sicDescription: "REAL ESTATE INVESTMENT TRUSTS", fiscalYearEnd: "1231" },
} as const;
type Ticker = keyof typeof ISSUERS;
const TICKERS = Object.keys(ISSUERS) as Ticker[];

const facts = (ticker: Ticker): CompanyFacts =>
  JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", "edgar", `${ticker.toLowerCase()}_companyfacts_audit_20261019.json`), "utf8")) as CompanyFacts;

const startOf = (ticker: Ticker): Date => new Date(Date.parse(ISSUERS[ticker].fetchedAt) - 20_000);

/** SEC submissions for the issuer, its recent filings rebuilt from the accessions the facts cite. */
function submissions(ticker: Ticker, companyFacts: CompanyFacts): unknown {
  type Point = { accn: string; form: string; filed: string; end: string; start?: string };
  const filings = new Map<string, { form: string; filed: string; reportDate: string }>();
  for (const concepts of Object.values(companyFacts.facts)) {
    for (const concept of Object.values(concepts) as { units: Record<string, Point[]> }[]) {
      for (const points of Object.values(concept.units)) {
        for (const point of points) {
          const known = filings.get(point.accn);
          if (!known) filings.set(point.accn, { form: point.form, filed: point.filed, reportDate: point.end });
          else if (point.start === undefined && point.end > known.reportDate && point.end <= point.filed) known.reportDate = point.end;
        }
      }
    }
  }
  const recent = [...filings.entries()].sort(([, a], [, b]) => b.filed.localeCompare(a.filed));
  const { cik, sic, sicDescription, fiscalYearEnd } = ISSUERS[ticker];
  return {
    cik: String(cik), name: companyFacts.entityName, sic, sicDescription, fiscalYearEnd, stateOfIncorporation: "DE",
    tickers: [ticker], exchanges: ["NYSE"],
    filings: {
      recent: {
        accessionNumber: recent.map(([accn]) => accn),
        filingDate: recent.map(([, f]) => f.filed),
        reportDate: recent.map(([, f]) => f.reportDate),
        form: recent.map(([, f]) => f.form),
        primaryDocument: recent.map(([, f]) => `${ticker.toLowerCase()}-${f.reportDate.replaceAll("-", "")}.htm`),
      },
      files: [],
    },
  };
}

/** EDGAR transport serving the ticker table, submissions and the fixture's companyfacts, stamped as the run fetched them; 404 otherwise. */
function edgarTransport(ticker: Ticker): EdgarTransport {
  const { cik, fetchedAt } = ISSUERS[ticker];
  const cik10 = String(cik).padStart(10, "0");
  const companyFacts = facts(ticker);
  const startedAt = startOf(ticker).toISOString();
  return {
    fetchText(url: string): Promise<EdgarTransportResponse> {
      const ok = (body: unknown, stamp = startedAt): EdgarTransportResponse => ({ status: 200, body: JSON.stringify(body), fetchedAt: stamp, fromCache: false, stale: false });
      if (url.includes("company_tickers.json")) return Promise.resolve(ok({ "0": { cik_str: cik, ticker, title: companyFacts.entityName } }));
      if (url.includes(`submissions/CIK${cik10}.json`)) return Promise.resolve(ok(submissions(ticker, companyFacts)));
      if (url.includes(`companyfacts/CIK${cik10}.json`)) return Promise.resolve(ok(companyFacts, fetchedAt));
      return Promise.resolve({ status: 404, body: "not found", fetchedAt: startedAt, fromCache: false, stale: false });
    },
  };
}

/** The last regular session before every run: Monday 2026-10-19, closed at 20:00 UTC. */
const LAST_SESSION = Date.UTC(2026, 9, 19, 13, 30) / 1000;

/** `n` weekday session stamps ending at LAST_SESSION, oldest first (holidays are not modelled). */
function sessions(n: number): number[] {
  const out: number[] = [];
  for (let t = LAST_SESSION; out.length < n; t -= DAY_S) {
    const weekday = new Date(t * 1000).getUTCDay();
    if (weekday !== 0 && weekday !== 6) out.push(t);
  }
  return out.reverse();
}

/**
 * Yahoo fake: five years of weekday bars ending at the run's quote. Beta is
 * regressed on completed month-end sessions, so the bars skip weekends, and
 * the issuer follows the benchmark's wiggle at 1.2x plus a component of its
 * own so the regression has variance to fit.
 */
function fakeYahoo(ticker: Ticker) {
  const now = startOf(ticker);
  const shape = (k: number, issuer: boolean): number =>
    issuer ? 0.06 * Math.sin(0.11 * k) + 0.02 * Math.sin(0.37 * k) : 0.05 * Math.sin(0.11 * k);
  const impl = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    const symbol = /chart\/([^?]+)/.exec(url)![1]!;
    const isQuote = url.includes("range=5d");
    const isSplitList = url.includes("range=max");
    const timestamp = isSplitList
      ? Array.from({ length: 128 }, (_, i) => Date.UTC(1995, i * 3, 1, 13, 30) / 1000)
      : sessions(isQuote ? 5 : 1300);
    // Indexed back from the last session, so the quote's five closes are the history's last five.
    const issuer = symbol === ticker;
    const last = issuer ? ISSUERS[ticker].price : symbol === "SPY" ? 660 : 90;
    const close = timestamp.map((_, i) => {
      const k = i - (timestamp.length - 1);
      return last * Math.exp(0.0003 * k + shape(k, issuer) - shape(0, issuer));
    });
    return new Response(JSON.stringify({ chart: { result: [{ meta: { currency: "USD", symbol, exchangeName: "NYQ", fullExchangeName: "NYSE", instrumentType: "EQUITY", firstTradeDate: 345479400, regularMarketTime: LAST_SESSION + 23400, gmtoffset: -14400, regularMarketPrice: close[close.length - 1], regularMarketDayHigh: 1, regularMarketDayLow: 1, regularMarketVolume: 5, fiftyTwoWeekHigh: 1, fiftyTwoWeekLow: 1, chartPreviousClose: 1, longName: ticker }, timestamp, indicators: { quote: [{ open: close, high: close, low: close, close, volume: close.map(() => 1000) }], adjclose: [{ adjclose: close }] } }], error: null } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return createYahooClient({ fetchImpl: impl, limiter: makeLimiter(1000, 1000), now: () => now, maxRetries: 0 });
}

function noNetworkConfigs(): { fred: FredConfig; finnhub: FinnhubConfig; finra: FinraConfig } {
  const unavailable = (): Promise<Response> => Promise.resolve(new Response("not available", { status: 404 }));
  return {
    fred: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 },
    finnhub: { apiKey: "TEST-KEY", fetchImpl: unavailable, retryDelaysMs: [] },
    finra: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 },
  };
}

/** One DGS10 observation, the Friday before the runs; every other FRED series is unavailable. */
function fredFetch(ticker: Ticker): NonNullable<Parameters<typeof buildDataBundle>[1]>["fredFetch"] {
  const date = "2026-10-16";
  return (id) =>
    Promise.resolve(
      id === "DGS10"
        ? { ok: true as const, value: { data: [{ date, value: 4.1 }], asOf: date, source: "fred" as const, endpoint: "series/observations?series_id=DGS10", fetchedAt: startOf(ticker).toISOString() } }
        : { ok: false as const, gap: { field: `macro.${id}`, reason: "not in this test", severity: "info" as const } },
    );
}

interface Run { bundle: DataBundle; out: ComputedMetrics }
const runs = new Map<Ticker, Run>();

/** Each issuer is built and computed once; every assertion below reads the shared run. */
beforeAll(async () => {
  for (const ticker of TICKERS) {
    const now = startOf(ticker);
    const bundle = await buildDataBundle(ticker, {
      now: () => now,
      fmp: createFmpClient({ apiKey: "", fixturesDir: "fixtures/fmp" }),
      edgar: createEdgarClient({ transport: edgarTransport(ticker) }),
      yahoo: fakeYahoo(ticker),
      fredFetch: fredFetch(ticker),
      ...noNetworkConfigs(),
    });
    runs.set(ticker, { bundle, out: runStageB(bundle) });
  }
}, 600_000);

const run = (ticker: Ticker): Run => runs.get(ticker)!;

/** The newest quarterly balance row of the bundle. */
function latestBalance(ticker: Ticker): Record<string, unknown> {
  const balance = run(ticker).bundle.statements.balanceQuarterly;
  expect(balance.ok).toBe(true);
  const rows = (balance.ok ? balance.value.data.rows : []) as unknown as Record<string, unknown>[];
  return [...rows].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]!;
}

const amount = (value: unknown): number => {
  expect(typeof value).toBe("number");
  return value as number;
};
const within = (value: unknown, target: number, share = 0.05): void => {
  expect(Math.abs(amount(value) - target) / target).toBeLessThanOrEqual(share);
};

/**
 * The total debt inside the Stage B EV bridge: EV = market cap + total debt +
 * preferred + minority interest − cash and short-term investments, less the
 * operating-lease liability it removed. Read back against the bundle's quote
 * and latest balance row, the bridge's other operands.
 */
function debtInEv(ticker: Ticker): number {
  const { bundle, out } = run(ticker);
  const ev = out.valuation.multiples!.enterpriseValue;
  const row = latestBalance(ticker);
  const marketCap = bundle.quote.ok ? bundle.quote.value.data.rows[0]?.marketCap : null;
  const optional = (value: unknown): number => (typeof value === "number" ? value : 0);
  return amount(ev.excludingLeases) + optional(ev.leaseLiability) - amount(marketCap) -
    optional(row.preferredStock) - optional(row.minorityInterest) + amount(row.cashAndShortTermInvestments);
}

/** Every refusal commonIncomeAvailabilityRefusal (src/pipeline/stageB/securityBasis.ts) can give. */
const AVAILABILITY_REFUSAL = /common earnings [a-z -]*(?:analysis cutoff|availability)/;

describe("audit issuers through buildDataBundle and runStageB, keyless (2026-10-19)", () => {
  it("route each issuer as the audit run did", () => {
    expect(TICKERS.map((ticker) => [ticker, run(ticker).out.route.base, run(ticker).out.route.overlays, run(ticker).out.valuation.kind])).toEqual([
      ["FCX", "general", [], "dcf"],
      ["PGR", "insurer", [], "excess-return"],
      ["O", "reit", [], "reit"],
      ["SNOW", "general", ["unprofitable"], "dcf-suppressed"],
      ["NNN", "reit", [], "reit"],
    ]);
  });

  it("carry parent equity on the latest quarterly balance (SNOW through the zero-NCI inference)", () => {
    for (const ticker of TICKERS) expect(latestBalance(ticker).totalStockholdersEquity, ticker).toEqual(expect.any(Number));
    expect(latestBalance("SNOW")).toMatchObject({ date: "2026-07-31", totalStockholdersEquity: 2_149_664_000, minorityInterest: 0 });
  });

  it("admit the facts fetched during the build: no common-earnings availability refusal (audit PGR-1, PGR-2)", () => {
    for (const ticker of TICKERS) {
      const { bundle, out } = run(ticker);
      // The cutoff moved to the companyfacts fetch stamp, 20 s after the start.
      expect(bundle.builtAt, ticker).toBe(ISSUERS[ticker].fetchedAt);
      const refusals = [...bundle.gaps, ...out.gaps].filter((gap) => AVAILABILITY_REFUSAL.test(gap.reason));
      expect(refusals, ticker).toEqual([]);
      expect(JSON.stringify(out), ticker).not.toMatch(AVAILABILITY_REFUSAL);
    }
  });

  describe("total debt within 5% of the issuer's own figure (audit O-2, SNOW-10, FCX-1)", () => {
    it("FCX: both bridges carry the $9,386m of financing debt plus the $973m noncurrent operating lease", () => {
      expect(debtInEv("FCX")).toBeCloseTo(10_359 * MN, -3);
      // Only the noncurrent lease maturity is tagged, so the bridge names the disclosed portion.
      const debt = run("FCX").out.capital.current!.debtBridge;
      expect(debt.debtIncludingDisclosedLeasePortion).toBe(10_359 * MN);
      expect(debt.operatingLeasesNoncurrent).toBe(973 * MN);
    });

    it("O: both bridges are within 5% of the issuer's $30,990.6m", () => {
      within(debtInEv("O"), 30_990.552 * MN);
      within(run("O").out.capital.current!.debtBridge.totalDebtIncludingLeases, 30_990.552 * MN);
    });

    it("NNN: the EV bridge carries the $4,972.8m of notes and term loan", () => {
      within(debtInEv("NNN"), 4_972.773 * MN);
      // The fixture holds no first-quarter 2026 10-Q, so no TTM window closes
      // and current capital falls back to the 2025 annual balance: its debt
      // bridge is the year-end figure, not the June quarter's.
      expect(run("NNN").out.capital.current!.basis).toBe("annual");
    });

    it("SNOW: the financing debt in both bridges is the $2,284.0m of convertible notes", () => {
      const debt = run("SNOW").out.capital.current!.debtBridge;
      within(debtInEv("SNOW") - amount(debt.operatingLeases), 2_283.985 * MN);
      within(amount(debt.totalDebtIncludingLeases) - amount(debt.operatingLeases), 2_283.985 * MN);
    });

    it("PGR: the combined debt amount reaches the bundle; the insurer route builds no debt bridge or EV", () => {
      expect(latestBalance("PGR").totalDebt).toBe(8_387 * MN);
      expect(run("PGR").out.capital.current!.debtBridge.totalDebtIncludingLeases).toBeNull();
      expect(run("PGR").out.valuation.multiples!.enterpriseValue.value).toBeNull();
    });
  });

  it("value FCX on the general-route DCF and PGR on the excess-return model", () => {
    const fcx = run("FCX").out;
    expect(fcx.fairValue).toMatchObject({ status: "available", method: "fcff-dcf" });
    expect(fcx.fairValue.perShare?.value).toEqual(expect.any(Number));
    expect(fcx.valuation.kind === "dcf" && fcx.valuation.dcf?.perShare).toEqual(expect.any(Number));
    const pgr = run("PGR").out;
    expect(pgr.fairValue).toMatchObject({ status: "available", method: "excess-return" });
    expect(pgr.valuation.kind === "excess-return" && pgr.valuation.excessReturn.perShare).toEqual(expect.any(Number));
  });

  it("withhold a per-share fair value where the route models none (REIT multiples, the unprofitable overlay)", () => {
    for (const ticker of ["O", "NNN", "SNOW"] as const) {
      expect(run(ticker).out.fairValue.status, ticker).toBe("suppressed");
      expect(run(ticker).out.fairValue.reasons.length, ticker).toBeGreaterThan(0);
    }
  });

  it("publish an enterprise value for FCX, O, NNN and SNOW (SNOW's was withheld before the NCI fix)", () => {
    for (const ticker of ["FCX", "O", "NNN", "SNOW"] as const) {
      expect(run(ticker).out.valuation.multiples!.enterpriseValue.value, ticker).toEqual(expect.any(Number));
    }
    expect(run("SNOW").out.valuation.multiples!.enterpriseValue.noncontrollingInterestBasis).toBe("none-disclosed");
  });

  it("keep long-term debt that holds current notes out of the forensic leverage tests", () => {
    // O and NNN compose debt from inclusive class totals (NotesPayable, LoansPayable).
    for (const ticker of ["O", "NNN"] as const) {
      expect(run(ticker).out.forensics.piotroski?.signals.leverageDown.value, ticker).toBeNull();
      expect(run(ticker).out.forensics.beneish?.neutralized, ticker).toContain("LVGI");
    }
    expect(run("FCX").out.forensics.piotroski?.signals.leverageDown.value).not.toBeNull();
  });

  it("price SNOW's book from the parent equity the zero-NCI inference established", () => {
    const { bundle, out } = run("SNOW");
    const marketCap = bundle.quote.ok ? bundle.quote.value.data.rows[0]?.marketCap : null;
    const priceToBook = out.valuation.multiples!.multiples.find((multiple) => multiple.key === "priceToBook")!.current;
    expect(priceToBook).toBeCloseTo(amount(marketCap) / 2_149_664_000, 6);
  });
});
