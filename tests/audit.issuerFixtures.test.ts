/**
 * Live-shaped issuer fixtures from the independent audit of 2026-10-19
 * (docs/audit/2026-10-20-independent-audit-fixes.md). Each fixture is the SEC
 * companyfacts payload a real run consumed, trimmed to the concepts the
 * statement builder reads and to 10-K/10-Q/8-K facts ending 2019 or later; a
 * full-versus-trimmed build was checked identical for every row dated 2021 or
 * later. SEC EDGAR data only; no vendor data.
 *
 *   fcx_companyfacts_audit_20261019.json   Freeport-McMoRan, CIK 831259
 *   pgr_companyfacts_audit_20261019.json   Progressive, CIK 80661
 *   o_companyfacts_audit_20261019.json     Realty Income, CIK 726728
 *   snow_companyfacts_audit_20261019.json  Snowflake, CIK 1640147
 *   nnn_companyfacts_audit_20261019.json   NNN REIT, CIK 751364
 *
 * The synthetic suite cannot catch a tag an issuer actually files and the
 * builder never reads (audit GATE-21); these pin the shapes that did.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildStatementsFromCompanyFacts, type BuiltStatements } from "@/edgar/statements";
import type { CompanyFacts } from "@/edgar/xbrl";

const ASOF = "2026-10-20";
const SPLITS = { status: "retrieved" as const, source: "audit-fixture", events: [], coverage: [{ from: "2000-01-01", to: ASOF }] };

/** The run's companyfacts fetch stamp, so provenance matches what the run saw. */
const ISSUERS = {
  FCX: { cik: 831259, fetchedAt: "2026-10-19T23:45:45.743Z" },
  PGR: { cik: 80661, fetchedAt: "2026-10-20T00:06:23.764Z" },
  O: { cik: 726728, fetchedAt: "2026-10-20T00:25:56.282Z" },
  SNOW: { cik: 1640147, fetchedAt: "2026-10-20T00:45:54.455Z" },
  NNN: { cik: 751364, fetchedAt: "2026-10-20T00:26:00.733Z" },
} as const;
type Ticker = keyof typeof ISSUERS;

const facts = (ticker: Ticker): CompanyFacts =>
  JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", "edgar", `${ticker.toLowerCase()}_companyfacts_audit_20261019.json`), "utf8")) as CompanyFacts;

const built = new Map<Ticker, BuiltStatements>();
function statements(ticker: Ticker): BuiltStatements {
  const cached = built.get(ticker);
  if (cached) return cached;
  const { cik, fetchedAt } = ISSUERS[ticker];
  const out = buildStatementsFromCompanyFacts(facts(ticker), {
    symbol: ticker, cik: String(cik).padStart(10, "0"), annualPeriods: 10, quarterlyPeriods: 24,
    asOf: ASOF, factsObservedAt: fetchedAt, vendorSplits: SPLITS, basisDay: ASOF,
  });
  built.set(ticker, out);
  return out;
}

/** The newest quarterly balance row. */
function latestBalance(ticker: Ticker): Record<string, unknown> {
  const rows = statements(ticker).balanceQuarterly.rows as unknown as Record<string, unknown>[];
  return [...rows].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]!;
}

describe("audit issuer fixtures (2026-10-19)", () => {
  it("are the issuers they claim to be and build a current balance sheet", () => {
    for (const ticker of Object.keys(ISSUERS) as Ticker[]) {
      expect(Number(facts(ticker).cik)).toBe(ISSUERS[ticker].cik);
      expect(String(latestBalance(ticker).date) >= "2026-06-30").toBe(true);
    }
  });
});

/** The latest quarterly balance row of a build from edited facts. */
function latestOf(edit: (gaap: Record<string, { units: Record<string, unknown[]> }>) => void, ticker: Ticker): Record<string, unknown> {
  const copy = structuredClone(facts(ticker));
  edit(copy.facts["us-gaap"] as unknown as Record<string, { units: Record<string, unknown[]> }>);
  const { cik, fetchedAt } = ISSUERS[ticker];
  const out = buildStatementsFromCompanyFacts(copy, {
    symbol: ticker, cik: String(cik).padStart(10, "0"), annualPeriods: 10, quarterlyPeriods: 24,
    asOf: ASOF, factsObservedAt: fetchedAt, vendorSplits: SPLITS, basisDay: ASOF,
  });
  const rows = out.balanceQuarterly.rows as unknown as Record<string, unknown>[];
  return [...rows].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]!;
}

/** Copy a tag's facts at the latest balance date under another tag name. */
const point = (gaap: Record<string, { units: Record<string, unknown[]> }>, from: string, end: string) =>
  (gaap[from]!.units.USD as { end: string; start?: string }[]).find((fact) => fact.end === end && fact.start === undefined)!;

describe("financing debt from instrument-class tags (audit O-1, SNOW-1, SNOW-10)", () => {
  const MN = 1_000_000;
  const within = (value: unknown, target: number, share = 0.05) => {
    expect(typeof value).toBe("number");
    expect(Math.abs((value as number) - target) / target).toBeLessThanOrEqual(share);
  };

  it("O: total debt within 5% of the issuer's own $30,990.6m (notes, term loans, mortgages, commercial paper)", () => {
    const row = latestBalance("O");
    expect(row.date).toBe("2026-06-30");
    within(row.totalDebt, 30_990.552 * MN);
    expect(row.longTermDebt).toBeCloseTo((25_091.588 + 2_760.395 + 37.085) * MN, -3);
  });

  it("NNN: total debt is its filed notes and term loan, not leases alone", () => {
    const row = latestBalance("NNN");
    within(row.totalDebt, (4_475.938 + 496.835) * MN);
  });

  it("SNOW: the convertible notes are its financing debt", () => {
    const row = latestBalance("SNOW");
    within((row.shortTermDebt as number | null ?? 0) + (row.longTermDebt as number), 2_283.985 * MN);
    expect(row.totalDebt as number).toBeGreaterThan(2_283.985 * MN);
  });

  it("PGR: the combined debt amount stands in when nothing else is tagged", () => {
    expect(latestBalance("PGR").totalDebt).toBe(8_387 * MN);
  });

  it("an aggregate long-term debt tag still wins over the instrument classes", () => {
    const row = latestOf((gaap) => {
      gaap.LongTermDebtNoncurrent = { units: { USD: [{ ...point(gaap, "NotesPayable", "2026-06-30"), val: 28_000 * MN }] } };
    }, "O");
    expect(row.longTermDebt).toBe(28_000 * MN);
  });

  it("withholds rather than double counts an inclusive class total beside a current-maturities line", () => {
    const row = latestOf((gaap) => {
      gaap.LongTermDebtCurrent = { units: { USD: [{ ...point(gaap, "NotesPayable", "2026-06-30"), val: 900 * MN }] } };
    }, "O");
    expect(row.longTermDebt).toBeNull();
    expect(row.totalDebt).toBeNull();
    expect(row.netDebt).toBeNull();
  });

  it("withholds when a notes total and a convertible-notes total could hold the same notes", () => {
    const row = latestOf((gaap) => {
      gaap.ConvertibleNotesPayable = { units: { USD: [{ ...point(gaap, "NotesPayable", "2026-06-30"), val: 500 * MN }] } };
    }, "O");
    expect(row.longTermDebt).toBeNull();
    expect(row.totalDebt).toBeNull();
  });

  it("withholds the combined debt amount beside a separately tagged current-debt figure", () => {
    const row = latestOf((gaap) => {
      gaap.ShortTermBorrowings = { units: { USD: [{ ...point(gaap, "DebtLongtermAndShorttermCombinedAmount", "2026-06-30"), val: 500 * MN }] } };
    }, "PGR");
    expect(row.longTermDebt).toBeNull();
    expect(row.totalDebt).toBeNull();
  });
});

describe("a missing operating-lease maturity does not blank debt (audit FCX-1)", () => {
  it("FCX: total debt carries the issuer's $9,386m plus the tagged noncurrent operating lease", () => {
    const row = latestBalance("FCX");
    expect(row.date).toBe("2026-06-30");
    expect(row.operatingLeaseLiability).toBe(973_000_000);
    expect(row.totalDebt).toBe(9_386_000_000 + 973_000_000);
    expect((row.totalDebt as number) - (row.operatingLeaseLiability as number)).toBe(9_386_000_000);
  });

  it("still withholds total debt when a finance-lease maturity is missing", () => {
    const row = latestOf((gaap) => {
      gaap.FinanceLeaseLiabilityNoncurrent = { units: { USD: [{ ...point(gaap, "LongTermDebtNoncurrent", "2026-06-30"), val: 50_000_000 }] } };
    }, "FCX");
    expect(row.totalDebt).toBeNull();
    expect(row.netDebt).toBeNull();
  });
});

describe("zero noncontrolling interest shown by the filing (audit SNOW-2)", () => {
  const SNOW_LATEST = "2026-07-31";
  const durations = (gaap: Record<string, { units: Record<string, unknown[]> }>, tag: string) =>
    gaap[tag]!.units.USD as { end: string; start?: string; val: number }[];

  it("SNOW: parent equity is the NCI-inclusive total once its subsidiary is gone, and the inference is disclosed", () => {
    const row = latestBalance("SNOW");
    expect(row.date).toBe(SNOW_LATEST);
    expect(row.totalEquity).toBe(2_149_664_000);
    expect(row.totalStockholdersEquity).toBe(2_149_664_000);
    expect(row.minorityInterest).toBe(0);
    const disclosed = statements("SNOW").balanceQuarterly.substitutions
      .filter((sub) => sub.periods.includes(SNOW_LATEST)).map((sub) => `${sub.field}: ${sub.text}`);
    expect(disclosed.some((text) => /^totalStockholdersEquity: noncontrolling interest inferred zero/.test(text))).toBe(true);
  });

  it("does not infer when the period's NCI income is not zero", () => {
    const row = latestOf((gaap) => {
      for (const fact of durations(gaap, "NetIncomeLossAttributableToNoncontrollingInterest")) if (fact.end === SNOW_LATEST) fact.val = 1_000_000;
    }, "SNOW");
    expect(row.totalStockholdersEquity).toBeNull();
    expect(row.minorityInterest).toBeNull();
  });

  it("does not infer when the latest earlier NCI balance was not zero", () => {
    const row = latestOf((gaap) => {
      for (const fact of durations(gaap, "MinorityInterest")) if (fact.end === "2026-01-31") fact.val = 5_000_000;
    }, "SNOW");
    expect(row.totalStockholdersEquity).toBeNull();
  });

  it("does not infer beside temporary equity", () => {
    const row = latestOf((gaap) => {
      gaap.RedeemableNoncontrollingInterestEquityCarryingAmount = { units: { USD: [{ ...point(gaap, "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", SNOW_LATEST), val: 40_000_000 }] } };
    }, "SNOW");
    expect(row.totalStockholdersEquity).toBeNull();
  });
});
