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
