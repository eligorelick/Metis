/**
 * D-236 (P2, P9, P10, P20): a periodic filing SEC's companyfacts lists but
 * does not carry is read from its own XBRL instance.
 *
 * The named case is real and offline. `fixtures/edgar/tsm-20f-fy2025` holds
 * TSMC's fiscal 2025 Form 20-F instance (accession 0001628280-26-025362, filed
 * 2026-04-16) trimmed to the facts used here, and SEC's companyfacts for TSMC
 * as Metis stored it on 2026-11-12, reduced to the same concepts. Each file's
 * header cites its source. companyfacts attributed two facts to that filing,
 * the cover page's share count and one srt element, and none of its
 * statements; the fallback ran only for Forms 10-K and 10-Q and took a filing
 * companyfacts mentions as carried, so the filed fiscal 2025 EPS (65.47 TWD
 * per ordinary share) was never admitted.
 *
 * Beside it: a 10-K filer whose feed is complete (no request), a domestic 10-Q
 * the feed mentions by its cover page only, a Canadian 40-F filer, a 6-K, an
 * amendment that states no statements, the request bound, and the disclosure
 * of an instance that cannot be read. Vendor rows here are placeholders, not
 * a vendor's figures.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { feedCoverage, mergeInstanceFacts, needsInstance, parseInstanceFacts, type InstanceFacts } from "@/edgar/instanceFacts";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import { CORE_FACT_FORMS, parseFactPoints, type CompanyFacts, type FactPoint } from "@/edgar/xbrl";
import { buildDataBundle, companyFactsInstanceEntries, withNewerFilings } from "@/pipeline/dataBundle";
import { guardVendorShareFields } from "@/pipeline/keyless";
import { collectPeriodicInstances, fallbackInstanceFilings, segmentFilings } from "@/providers/currentReports";
import { createEdgarClient, type EdgarClient, type EdgarFiling, type EdgarTransport, type EdgarTransportResponse } from "@/providers/edgar";
import { createFmpClient, type FmpIncomeStatementRow } from "@/providers/fmp";
import type { FinnhubConfig } from "@/providers/finnhub";
import type { FinraConfig } from "@/providers/finra";
import type { FredConfig } from "@/providers/fred";
import { makeLimiter } from "@/providers/http";
import type { VendorSplitEvidence } from "@/providers/splitEvents";
import { createYahooClient, type YahooClient } from "@/providers/yahoo";

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "edgar", "tsm-20f-fy2025");
const TSM_CIK = "1046179";
const FY2025_20F = { accession: "0001628280-26-025362", form: "20-F", filingDate: "2026-04-16" };
const FY2024_20F = { accession: "0001193125-25-083423", form: "20-F", filingDate: "2025-04-17" };
const INSTANCE_XML = readFileSync(path.join(FIXTURES, "tsm-20251231_htm.extract.xml"), "utf8");
const storedFeed = (): CompanyFacts =>
  (JSON.parse(readFileSync(path.join(FIXTURES, "companyfacts-CIK0001046179.extract.json"), "utf8")) as { companyFacts: CompanyFacts }).companyFacts;
const tsmInstance = (): InstanceFacts => parseInstanceFacts(INSTANCE_XML, FY2025_20F, TSM_CIK);

type Units = Record<string, FactPoint[]>;
const units = (facts: CompanyFacts, ns: string, concept: string): Units =>
  Object.fromEntries(Object.entries((facts.facts[ns]?.[concept] as { units: Record<string, unknown[]> } | undefined)?.units ?? {}).map(([unit, list]) => [unit, parseFactPoints(list)]));

/** The newest-filed point of every concept, unit and period: what the fact index's "newest filing wins" reads. */
function newestByPeriod(facts: CompanyFacts): Map<string, FactPoint> {
  const out = new Map<string, FactPoint>();
  for (const [ns, concepts] of Object.entries(facts.facts)) {
    for (const concept of Object.keys(concepts)) {
      for (const [unit, points] of Object.entries(units(facts, ns, concept))) {
        for (const p of points) {
          const key = `${ns}:${concept}|${unit}|${p.start ?? ""}..${p.end}`;
          const prior = out.get(key);
          if (prior === undefined || p.filed > prior.filed) out.set(key, p);
        }
      }
    }
  }
  return out;
}

describe("TSMC's fiscal 2025 Form 20-F, listed by companyfacts and not carried (D-236)", () => {
  it("reads the filed diluted EPS per ordinary share with its provenance, at the scale the filing states", () => {
    const instance = tsmInstance();
    expect(instance.periodEnd).toBe("2025-12-31");
    const cites = { accn: FY2025_20F.accession, form: "20-F", filed: "2026-04-16", fy: 2025, fp: "FY" };
    expect(instance.facts["ifrs-full"]!.DilutedEarningsLossPerShare!["TWD/shares"]).toEqual([
      { start: "2023-01-01", end: "2023-12-31", val: 32.85, ...cites },
      { start: "2024-01-01", end: "2024-12-31", val: 44.67, ...cites },
      { start: "2025-01-01", end: "2025-12-31", val: 65.47, ...cites },
    ]);
    // The filing also states EPS per ADS (327.34) on ifrs-full:ClassesOfShareCapitalAxis. A
    // dimensioned fact is not the consolidated line and is left out, as companyfacts leaves it out.
    expect(INSTANCE_XML).toContain(">327.34</ifrs-full:DilutedEarningsLossPerShare>");
    expect(Object.values(instance.facts["ifrs-full"]!.DilutedEarningsLossPerShare!).flat().map((p) => p.val)).not.toContain(327.34);
    // decimals="-5" is precision, not scale: the instance states the full amount.
    expect(INSTANCE_XML).toMatch(/<ifrs-full:RevenueFromContractsWithCustomers contextRef="c-1" decimals="-5"[^>]*>3809054300000</);
    expect(instance.facts["ifrs-full"]!.RevenueFromContractsWithCustomers!.TWD!.find((p) => p.end === "2025-12-31"))
      .toEqual({ start: "2025-01-01", end: "2025-12-31", val: 3_809_054_300_000, ...cites });
    expect(instance.facts["ifrs-full"]!.AdjustedWeightedAverageShares!.shares!.find((p) => p.end === "2025-12-31")?.val).toBe(25_930_600_000);
  });

  it("finds the filing mentioned by the feed and not covered by it", () => {
    const feed = storedFeed();
    const mentions = Object.entries(feed.facts).flatMap(([ns, concepts]) =>
      Object.keys(concepts).flatMap((concept) => Object.values(units(feed, ns, concept)).flat().filter((p) => p.accn === FY2025_20F.accession).map(() => `${ns}:${concept}`)));
    expect(mentions).toEqual(["dei:EntityCommonStockSharesOutstanding", "srt:StockRepurchaseProgramNumberOfSharesAuthorizedToBeRepurchased"]);
    const coverage = feedCoverage(feed);
    expect([...coverage.covered].sort()).toEqual(["0001193125-23-107214", "0001193125-24-099840", "0001193125-25-083423"]);
    expect(coverage.through).toBe("2025-04-17");
    expect(needsInstance(coverage, FY2025_20F)).toBe(true);
    expect(needsInstance(coverage, FY2024_20F)).toBe(false);
  });

  it("admits the filing's facts, each citing it, without repeating what the feed holds or touching any other point", () => {
    const feed = storedFeed();
    const merge = mergeInstanceFacts(feed, [tsmInstance()]);
    // 65 undimensioned facts in the extract; the feed already holds the cover-page and srt ones.
    expect(merge.merged).toEqual([{ ...FY2025_20F, periodEnd: "2025-12-31", count: 63 }]);
    expect(merge.companyFactsThrough).toBe("2025-04-17");
    expect(feed).toEqual(storedFeed());
    let added = 0;
    for (const [ns, concepts] of Object.entries(merge.facts.facts)) {
      for (const concept of Object.keys(concepts)) {
        const before = units(feed, ns, concept);
        for (const [unit, points] of Object.entries(units(merge.facts, ns, concept))) {
          const kept = before[unit] ?? [];
          expect(points.slice(0, kept.length)).toEqual(kept);
          for (const p of points.slice(kept.length)) {
            expect(p).toMatchObject({ accn: FY2025_20F.accession, form: "20-F", filed: "2026-04-16", fy: 2025, fp: "FY" });
            added += 1;
          }
        }
      }
    }
    expect(added).toBe(63);
    expect(units(merge.facts, "dei", "EntityCommonStockSharesOutstanding").shares!.filter((p) => p.accn === FY2025_20F.accession)).toHaveLength(1);
    expect(units(merge.facts, "ifrs-full", "DilutedEarningsLossPerShare")["TWD/shares"]!.at(-1))
      .toEqual({ start: "2025-01-01", end: "2025-12-31", val: 65.47, accn: FY2025_20F.accession, form: "20-F", filed: "2026-04-16", fy: 2025, fp: "FY" });
    // A second pass finds the filing covered: nothing is counted twice.
    expect(mergeInstanceFacts(merge.facts, [tsmInstance()]).merged).toEqual([]);
  });

  it("changes no period or value the feed already had: only fiscal 2025 is new", () => {
    const feed = storedFeed();
    const before = newestByPeriod(feed);
    const after = newestByPeriod(mergeInstanceFacts(feed, [tsmInstance()]).facts);
    expect(before.size).toBe(129);
    for (const [key, point] of before) expect([key, after.get(key)?.val]).toEqual([key, point.val]);
    const fresh = [...after.keys()].filter((key) => !before.has(key));
    expect(fresh).toHaveLength(32);
    expect(fresh.every((key) => key.endsWith("2025-12-31"))).toBe(true);
  });

  const AS_OF = "2026-11-12";
  const splitHistory = (to: string): VendorSplitEvidence => ({ status: "retrieved", source: "fixture:split-history", events: [], coverage: [{ from: "1997-10-08", to }] });
  /** The report's ADR EPS admission on `facts` as of `asOf`; the ADS ratio is the report's own, proven elsewhere. */
  function adrEps(facts: CompanyFacts, asOf = AS_OF) {
    const primary = buildStatementsFromCompanyFacts(facts, { symbol: "TSM", cik: TSM_CIK, asOf, factsObservedAt: `${asOf}T18:21:26.908Z`, annualPeriods: 10, quarterlyPeriods: 24, vendorSplits: splitHistory(asOf) });
    const vendorRows: FmpIncomeStatementRow[] = ["2025", "2024", "2023"].map((year) =>
      ({ date: `${year}-12-31`, period: "FY", fiscalYear: year, cik: "0001046179", symbol: "TSM", reportedCurrency: "TWD", eps: 300, epsDiluted: 300 }));
    return guardVendorShareFields(vendorRows, primary.incomeAnnual.rows, primary.splits, asOf, {
      companyFacts: facts, registrantTickers: ["TSM"], isAdr: true, fiscalYearEnd: "1231", period: "annual", reconcileFiled: true,
      ordinarySharesPerQuotedUnit: 5, quotedUnitSourceIds: ["fixture:ads-ratio"],
    });
  }
  const latestWithEps = (rows: readonly FmpIncomeStatementRow[]): string | undefined => rows.find((r) => typeof r.epsDiluted === "number")?.date;

  it("lets the latest-year EPS row select fiscal 2025: 65.47 per share, 327.35 per ADS on the report's ratio", () => {
    const feed = storedFeed();
    const before = adrEps(feed);
    expect(latestWithEps(before.rows)).toBe("2024-12-31");
    expect(before.rows[0]?.epsDiluted).toBeUndefined();
    expect(before.withheld.map((w) => [w.date, w.field])).toEqual([["2025-12-31", "eps"], ["2025-12-31", "epsDiluted"]]);
    expect(before.withheld[1]?.reason).toMatch(/same-period native-currency filed EPS is not established/);

    const after = adrEps(mergeInstanceFacts(feed, [tsmInstance()]).facts);
    expect(latestWithEps(after.rows)).toBe("2025-12-31");
    expect(after.withheld).toEqual([]);
    expect(after.rows[0]).toMatchObject({ date: "2025-12-31", eps: 65.47 * 5, epsDiluted: 65.47 * 5 });
    expect(after.rows[0]?.epsDiluted).toBeCloseTo(327.35, 10);
    expect(after.rows[0]?.fieldProvenance?.epsDiluted).toMatchObject({
      source: "edgar", unit: "TWD/shares", periodStart: "2025-01-01", periodEnd: "2025-12-31", tags: ["ifrs-full/DilutedEarningsLossPerShare"],
      filings: [{ accn: FY2025_20F.accession, filed: "2026-04-16", form: "20-F" }],
      shareUnitConversion: { ordinarySharesPerQuotedUnit: 5, sourceIds: ["fixture:ads-ratio"] },
    });
    // Earlier years keep their values; the newer filing restates them unchanged and is now the one cited (P2).
    expect(after.rows.slice(1).map((r) => [r.date, r.eps, r.epsDiluted])).toEqual(before.rows.slice(1).map((r) => [r.date, r.eps, r.epsDiluted]));
    expect(after.rows.slice(1).map((r) => [r.date, r.epsDiluted])).toEqual([["2024-12-31", 44.67 * 5], ["2023-12-31", 32.85 * 5]]);
    expect(before.rows[1]?.fieldProvenance?.epsDiluted?.filings).toEqual([{ accn: FY2024_20F.accession, filed: "2025-04-17", form: "20-F" }]);
    expect(after.rows[1]?.fieldProvenance?.epsDiluted?.filings).toEqual([{ accn: FY2025_20F.accession, filed: "2026-04-16", form: "20-F" }]);
  });

  it("uses nothing of the filing before it was filed (P2)", () => {
    const merged = mergeInstanceFacts(storedFeed(), [tsmInstance()]).facts;
    const dayBefore = adrEps(merged, "2026-04-15");
    expect(latestWithEps(dayBefore.rows)).toBe("2024-12-31");
    expect(dayBefore.withheld.map((w) => w.date)).toEqual(["2025-12-31", "2025-12-31"]);
    expect(dayBefore.rows[1]?.fieldProvenance?.epsDiluted?.filings).toEqual([{ accn: FY2024_20F.accession, filed: "2025-04-17", form: "20-F" }]);
    expect(latestWithEps(adrEps(merged, "2026-04-16").rows)).toBe("2025-12-31");
  });
});

// ---------------------------------------------------------------------------
// Other issuers and shapes
// ---------------------------------------------------------------------------

const DOMESTIC_CIK = "0001326160";
type Fact = { tag: string; ctx: string; unit?: string; val: string };
type Ctx = { id: string; start?: string; end: string };

/** An SEC-style extracted instance for `cik`, with `taxonomy` (us-gaap or ifrs-full) and dei facts. */
function instanceXml(cik: string, contexts: Ctx[], facts: Fact[], focus: { fy: string; fp: string; end: string }): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<xbrl xmlns="http://www.xbrl.org/2003/instance" xmlns:dei="http://xbrl.sec.gov/dei/2026" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" xmlns:us-gaap="http://fasb.org/us-gaap/2026">
${contexts.map((c) => `<context id="${c.id}"><entity><identifier scheme="http://www.sec.gov/CIK">${cik}</identifier></entity><period>${c.start ? `<startDate>${c.start}</startDate><endDate>${c.end}</endDate>` : `<instant>${c.end}</instant>`}</period></context>`).join("\n")}
<unit id="usd"><measure>iso4217:USD</measure></unit>
<unit id="shares"><measure>shares</measure></unit>
<dei:DocumentFiscalYearFocus contextRef="${contexts[0]!.id}">${focus.fy}</dei:DocumentFiscalYearFocus>
<dei:DocumentFiscalPeriodFocus contextRef="${contexts[0]!.id}">${focus.fp}</dei:DocumentFiscalPeriodFocus>
<dei:DocumentPeriodEndDate contextRef="${contexts[0]!.id}">${focus.end}</dei:DocumentPeriodEndDate>
${facts.map((f) => `<${f.tag} contextRef="${f.ctx}" decimals="-6" unitRef="${f.unit ?? "usd"}">${f.val}</${f.tag}>`).join("\n")}
</xbrl>`;
}

const point = (start: string | undefined, end: string, val: number, filing: { accession: string; form: string; filingDate: string }, fp: string): FactPoint =>
  ({ ...(start ? { start } : {}), end, val, accn: filing.accession, fy: Number(end.slice(0, 4)), fp, form: filing.form, filed: filing.filingDate });

const TEN_K = { accession: "0001326160-26-000014", form: "10-K", filingDate: "2026-02-26" };
const Q1 = { accession: "0001326160-26-000026", form: "10-Q", filingDate: "2026-05-05" };
const Q2 = { accession: "0001326160-26-000040", form: "10-Q", filingDate: "2026-08-05" };

/** A domestic filer's feed through its first-quarter 10-Q. */
function domesticFeed(): CompanyFacts {
  return { cik: 1326160, entityName: "Domestic Utility Corp", facts: { "us-gaap": {
    Revenues: { label: "Revenues", units: { USD: [
      point("2025-01-01", "2025-12-31", 31_000_000_000, TEN_K, "FY"), point("2025-01-01", "2025-03-31", 8_000_000_000, TEN_K, "FY"),
      point("2026-01-01", "2026-03-31", 8_000_000_000, Q1, "Q1"), point("2025-01-01", "2025-03-31", 7_600_000_000, Q1, "Q1"),
    ] } },
    Assets: { label: "Assets", units: { USD: [point(undefined, "2025-12-31", 195_000_000_000, TEN_K, "FY"), point(undefined, "2026-03-31", 198_000_000_000, Q1, "Q1")] } },
    NetIncomeLoss: { label: "Net income", units: { USD: [point("2025-01-01", "2025-12-31", 5_000_000_000, TEN_K, "FY"), point("2026-01-01", "2026-03-31", 1_550_000_000, Q1, "Q1")] } },
  } } };
}

const Q2_CONTEXTS: Ctx[] = [{ id: "q2", start: "2026-04-01", end: "2026-06-30" }, { id: "ytd", start: "2026-01-01", end: "2026-06-30" }, { id: "q2py", start: "2025-04-01", end: "2025-06-30" }, { id: "bs", end: "2026-06-30" }, { id: "cover", end: "2026-07-31" }];
const Q2_FACTS: Fact[] = [
  { tag: "us-gaap:Revenues", ctx: "q2", val: "7500000000" }, { tag: "us-gaap:Revenues", ctx: "ytd", val: "15500000000" }, { tag: "us-gaap:Revenues", ctx: "q2py", val: "7100000000" },
  { tag: "us-gaap:NetIncomeLoss", ctx: "q2", val: "1092000000" }, { tag: "us-gaap:NetIncomeLoss", ctx: "ytd", val: "2642000000" },
  { tag: "us-gaap:Assets", ctx: "bs", val: "200000000000" },
  { tag: "dei:EntityCommonStockSharesOutstanding", ctx: "cover", unit: "shares", val: "779702193" },
];
const q2Instance = (): InstanceFacts => parseInstanceFacts(instanceXml(DOMESTIC_CIK, Q2_CONTEXTS, Q2_FACTS, { fy: "2026", fp: "Q2", end: "2026-06-30" }), Q2, DOMESTIC_CIK);
const DOMESTIC_OPTS = { symbol: "DOM", cik: DOMESTIC_CIK, annualPeriods: 10, quarterlyPeriods: 24, asOf: "2026-10-22",
  vendorSplits: { status: "retrieved", source: "test:vendor", events: [], coverage: [{ from: "1980-12-12", to: "2026-10-22" }] } satisfies VendorSplitEvidence };

describe("the coverage test on other issuers and shapes (D-236)", () => {
  it("merges a domestic 10-Q the feed mentions by its cover page only", () => {
    const feed = domesticFeed();
    feed.facts.dei = { EntityCommonStockSharesOutstanding: { label: "Shares outstanding", units: { shares: [point(undefined, "2026-07-31", 779_702_193, Q2, "Q2")] } } };
    expect(buildStatementsFromCompanyFacts(feed, DOMESTIC_OPTS).incomeQuarterly.rows[0]?.date).toBe("2026-03-31");
    const coverage = feedCoverage(feed);
    expect(coverage.covered.has(Q2.accession)).toBe(false);
    expect(coverage.through).toBe("2026-05-05");
    const merge = mergeInstanceFacts(feed, [q2Instance()]);
    // Seven facts in the instance; the cover-page count the feed holds is not added again.
    expect(merge.merged).toEqual([{ ...Q2, periodEnd: "2026-06-30", count: 6 }]);
    expect(units(merge.facts, "dei", "EntityCommonStockSharesOutstanding").shares).toHaveLength(1);
    const row = buildStatementsFromCompanyFacts(merge.facts, DOMESTIC_OPTS).incomeQuarterly.rows[0]!;
    expect(row).toMatchObject({ date: "2026-06-30", revenue: 7_500_000_000, netIncome: 1_092_000_000 });
    expect(row.fieldProvenance?.revenue?.filings).toEqual([{ accn: Q2.accession, filed: "2026-08-05", form: "10-Q" }]);
  });

  it("leaves a complete feed exactly as served (compatible control: a 10-K filer)", () => {
    const complete = mergeInstanceFacts(domesticFeed(), [q2Instance()]).facts;
    const coverage = feedCoverage(complete);
    expect([TEN_K, Q1, Q2].map((f) => needsInstance(coverage, f))).toEqual([false, false, false]);
    const again = mergeInstanceFacts(complete, [q2Instance(), parseInstanceFacts(instanceXml(DOMESTIC_CIK, Q2_CONTEXTS, Q2_FACTS, { fy: "2025", fp: "FY", end: "2025-12-31" }), TEN_K, DOMESTIC_CIK)]);
    expect(again.merged).toEqual([]);
    expect(again.facts).toBe(complete);
  });

  it("reads a Canadian filer's Form 40-F the feed does not have, and never a Form 6-K", () => {
    const CIK = "0000999999";
    const prior = { accession: "0000999999-25-000003", form: "40-F", filingDate: "2025-03-01" };
    const latest = { accession: "0000999999-26-000004", form: "40-F", filingDate: "2026-03-02" };
    const interim = { accession: "0000999999-26-000009", form: "6-K", filingDate: "2026-08-10" };
    const feed: CompanyFacts = { cik: 999999, entityName: "Northern Rail Ltd", facts: { "us-gaap": {
      Revenues: { label: "Revenues", units: { USD: [point("2024-01-01", "2024-12-31", 9_000_000_000, prior, "FY")] } },
    } } };
    const annual = parseInstanceFacts(instanceXml(CIK, [{ id: "fy", start: "2025-01-01", end: "2025-12-31" }], [{ tag: "us-gaap:Revenues", ctx: "fy", val: "9600000000" }], { fy: "2025", fp: "FY", end: "2025-12-31" }), latest, CIK);
    const sixK = parseInstanceFacts(instanceXml(CIK, [{ id: "h1", start: "2026-01-01", end: "2026-06-30" }], [{ tag: "us-gaap:Revenues", ctx: "h1", val: "5000000000" }], { fy: "2026", fp: "Q2", end: "2026-06-30" }), interim, CIK);
    expect(sixK.count).toBe(1);
    const merge = mergeInstanceFacts(feed, [sixK, annual]);
    expect(merge.merged).toEqual([{ ...latest, periodEnd: "2025-12-31", count: 1 }]);
    expect(merge.companyFactsThrough).toBe("2025-03-01");
    expect(units(merge.facts, "us-gaap", "Revenues").USD!.map((p) => [p.form, p.val])).toEqual([["40-F", 9_000_000_000], ["40-F", 9_600_000_000]]);
    expect(needsInstance(feedCoverage(feed), interim)).toBe(false);
  });

  it("reads every core form when the feed covers none, and none older than the newest it covers", () => {
    const empty: CompanyFacts = { cik: 1, entityName: "New Registrant", facts: { dei: {} } };
    expect(feedCoverage(empty)).toEqual({ covered: new Set(), through: null });
    for (const form of CORE_FACT_FORMS) expect(needsInstance(feedCoverage(empty), { accession: "0000000001-26-000001", form, filingDate: "2026-01-05" })).toBe(true);
    const older = { accession: "0001326160-26-000099", form: "10-Q/A", filingDate: "2026-05-01" };
    expect(needsInstance(feedCoverage(domesticFeed()), older)).toBe(false);
  });

  it("adds nothing and says nothing for an amendment that states only the cover page the feed already has", () => {
    const amendment = { accession: "0001326160-26-000031", form: "10-K/A", filingDate: "2026-05-20" };
    const feed = domesticFeed();
    feed.facts.dei = { EntityCommonStockSharesOutstanding: { label: "Shares outstanding", units: { shares: [point(undefined, "2026-05-15", 779_000_000, amendment, "FY")] } } };
    const coverOnly = parseInstanceFacts(instanceXml(DOMESTIC_CIK, [{ id: "cover", end: "2026-05-15" }],
      [{ tag: "dei:EntityCommonStockSharesOutstanding", ctx: "cover", unit: "shares", val: "779000000" }], { fy: "2025", fp: "FY", end: "2025-12-31" }), amendment, DOMESTIC_CIK);
    expect(needsInstance(feedCoverage(feed), amendment)).toBe(true);
    const served = { ok: true as const, value: { data: feed, source: "edgar" as const, endpoint: "companyfacts", asOf: "2026-05-15", fetchedAt: "2026-06-01T00:00:00.000Z" } };
    const result = withNewerFilings(served, [coverOnly]);
    expect(result.companyFacts).toBe(served);
    expect(result.companyFactsInstances).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Requests: what is fetched, and the bound
// ---------------------------------------------------------------------------

const filingRow = (accessionNumber: string, form: string, filingDate: string): EdgarFiling =>
  ({ accessionNumber, form, filingDate, reportDate: filingDate, primaryDocument: "primary.htm" });

/** A client that serves an index and an instance for each accession in `instances`, and records every call. */
function recordingClient(instances: Record<string, string>, opts: { noInstance?: string[]; unsafe?: string[] } = {}): { client: EdgarClient; calls: string[] } {
  const calls: string[] = [];
  const ok = <T,>(data: T, endpoint: string) => ({ ok: true as const, value: { data, asOf: "2026-11-12", source: "edgar" as const, endpoint, fetchedAt: "2026-11-12T00:00:00.000Z" } });
  const gap = (reason: string) => ({ ok: false as const, gap: { field: "edgar.test", reason, severity: "warn" as const } });
  const client = {
    filingProblem: (_cik: string, f: EdgarFiling) => (opts.unsafe?.includes(f.accessionNumber) ? "accession was not admitted" : null),
    filingIndexHeaders: async (_cik: string, accession: string) => {
      calls.push(`index:${accession}`);
      if (!(accession in instances)) return gap("index HTTP 404");
      const documents = [{ type: "20-F", filename: "primary.htm", sequence: "1" }, ...(opts.noInstance?.includes(accession) ? [] : [{ type: "XML", filename: "x_htm.xml", sequence: "2" }])];
      return ok({ documents, typeByFilename: {} }, `index/${accession}`);
    },
    fetchFilingDocument: async (_cik: string, f: EdgarFiling) => {
      calls.push(`doc:${f.accessionNumber}/${f.primaryDocument}`);
      const body = instances[f.accessionNumber];
      return body !== undefined && body !== "" ? ok(body, `https://www.sec.gov/Archives/${f.accessionNumber}/${f.primaryDocument}`) : gap("document HTTP 404");
    },
  } as unknown as EdgarClient;
  return { client, calls };
}

describe("which instances the fallback requests (D-236)", () => {
  const TODAY = "2026-11-12";
  const tsmFilings = [filingRow("0001046179-26-000800", "6-K", "2026-11-12"), filingRow(FY2025_20F.accession, "20-F", "2026-04-16"), filingRow(FY2024_20F.accession, "20-F", "2025-04-17")];
  const neededBy = (facts: CompanyFacts) => {
    const coverage = feedCoverage(facts);
    return (f: EdgarFiling) => needsInstance(coverage, { accession: f.accessionNumber, form: f.form, filingDate: f.filingDate });
  };

  it("fetches the one 20-F the feed lacks with two requests, and nothing once the feed carries it", async () => {
    const lagging = recordingClient({ [FY2025_20F.accession]: INSTANCE_XML });
    const read: InstanceFacts[] = [];
    const unread = await collectPeriodicInstances(lagging.client, TSM_CIK, tsmFilings, TODAY, neededBy(storedFeed()),
      (filing, xml) => read.push(parseInstanceFacts(xml, { accession: filing.accessionNumber, form: filing.form, filingDate: filing.filingDate }, TSM_CIK)));
    expect(unread).toEqual([]);
    expect(lagging.calls).toEqual([`index:${FY2025_20F.accession}`, `doc:${FY2025_20F.accession}/x_htm.xml`]);
    const merged = mergeInstanceFacts(storedFeed(), read);
    expect(merged.merged).toEqual([{ ...FY2025_20F, periodEnd: "2025-12-31", count: 63 }]);

    const caughtUp = recordingClient({ [FY2025_20F.accession]: INSTANCE_XML });
    expect(await collectPeriodicInstances(caughtUp.client, TSM_CIK, tsmFilings, TODAY, neededBy(merged.facts), () => { throw new Error("not reached"); })).toEqual([]);
    expect(caughtUp.calls).toEqual([]);
  });

  it("makes no request for a 10-K filer, whose periodic instances the segment read already fetches (compatible control)", async () => {
    const filings = [filingRow(Q2.accession, "10-Q", Q2.filingDate), filingRow(Q1.accession, "10-Q", Q1.filingDate), filingRow(TEN_K.accession, "10-K", TEN_K.filingDate),
      filingRow("0001326160-25-000090", "10-Q", "2025-11-04"), filingRow("0001326160-26-000050", "8-K", "2026-08-05")];
    expect(segmentFilings(filings, "2026-10-22").map((f) => f.accessionNumber)).toEqual([Q2.accession, Q1.accession, TEN_K.accession, "0001326160-25-000090"]);
    expect(fallbackInstanceFilings(filings, "2026-10-22")).toEqual([]);
    // Even with a feed that covers nothing, the fallback has no filing of its own to read here.
    const { client, calls } = recordingClient({});
    expect(await collectPeriodicInstances(client, DOMESTIC_CIK, filings, "2026-10-22", () => true, () => undefined)).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("applies the existing selection to each core form, inside the 15-month window and the cutoff", () => {
    const filings = [
      filingRow("0000000001-26-000020", "20-F/A", "2026-12-01"), // after the cutoff
      filingRow("0000000001-26-000012", "20-F/A", "2026-06-01"), filingRow("0000000001-26-000011", "20-F", "2026-04-16"),
      filingRow("0000000001-25-000010", "20-F", "2025-10-01"), // an older report of the same form
      filingRow("0000000001-25-000002", "40-F", "2025-08-01"), // more than 460 days before the cutoff
      filingRow("0000000001-26-000015", "6-K", "2026-08-01"), filingRow("0000000001-26-000016", "10-K405", "2026-03-01"),
    ];
    expect(fallbackInstanceFilings(filings, TODAY).map((f) => [f.form, f.accessionNumber])).toEqual([["20-F/A", "0000000001-26-000012"], ["20-F", "0000000001-26-000011"]]);
  });

  it("is bounded: eight filings, one index and one instance each, however little the feed covers", async () => {
    const forms = [...CORE_FACT_FORMS];
    expect(forms.sort()).toEqual(["10-K", "10-K/A", "10-Q", "10-Q/A", "20-F", "20-F/A", "40-F", "40-F/A"]);
    // Five filings of every core form inside the window.
    const filings = forms.flatMap((form, f) => [0, 1, 2, 3, 4].map((n) => filingRow(`0000000002-26-${String(f * 10 + n).padStart(6, "0")}`, form, `2026-0${n + 2}-1${f}`)));
    const chosen = fallbackInstanceFilings(filings, TODAY);
    expect(chosen.map((f) => f.form).sort()).toEqual(["10-K/A", "10-Q/A", "10-Q/A", "10-Q/A", "20-F", "20-F/A", "40-F", "40-F/A"]);
    const { client, calls } = recordingClient(Object.fromEntries(filings.map((f) => [f.accessionNumber, INSTANCE_XML])));
    let read = 0;
    expect(await collectPeriodicInstances(client, "2", filings, TODAY, () => true, () => { read += 1; })).toEqual([]);
    expect(read).toBe(8);
    expect(calls).toHaveLength(16);
    expect(calls.filter((c) => c.startsWith("index:"))).toHaveLength(8);
  });

  it("names a filing it needed and could not read, and the report says so (P9, P10)", async () => {
    const amended = "0001046179-26-000500";
    const filings = [...tsmFilings, filingRow(amended, "20-F/A", "2026-06-30"), filingRow("0001046179-26-000400", "40-F", "2026-05-30"), filingRow("0001046179-26-000300", "40-F/A", "2026-05-31")];
    const { client, calls } = recordingClient({ [FY2025_20F.accession]: "", "0001046179-26-000400": INSTANCE_XML }, { noInstance: ["0001046179-26-000400"], unsafe: ["0001046179-26-000300"] });
    const unread = await collectPeriodicInstances(client, TSM_CIK, filings, TODAY, neededBy(storedFeed()), () => undefined);
    expect(unread).toEqual([
      { accession: amended, form: "20-F/A", filingDate: "2026-06-30", reason: "index unreadable (index HTTP 404)" },
      { accession: "0001046179-26-000300", form: "40-F/A", filingDate: "2026-05-31", reason: "not read (accession was not admitted)" },
      { accession: "0001046179-26-000400", form: "40-F", filingDate: "2026-05-30", reason: "no XBRL instance in the filing index" },
      { ...FY2025_20F, reason: "instance unreadable (document HTTP 404)" },
    ]);
    expect(calls.some((c) => c.includes("0001046179-26-000300"))).toBe(false);

    const served = { ok: true as const, value: { data: storedFeed(), source: "edgar" as const, endpoint: "companyfacts", asOf: "2025-12-31", fetchedAt: "2026-11-12T18:21:26.908Z" } };
    const result = withNewerFilings(served, [], unread.slice(3));
    expect(result.companyFacts).toBe(served);
    expect(result.companyFactsInstances).toEqual({ companyFactsThrough: "2025-04-17", merged: [], unread: [{ ...FY2025_20F, reason: "instance unreadable (document HTTP 404)" }] });
    expect(companyFactsInstanceEntries(result.companyFactsInstances ?? undefined)).toEqual([{
      field: "edgar.companyFacts.unreadFilings", severity: "warn", attemptedSources: [FY2025_20F.accession],
      reason: "SEC companyfacts does not carry the financial statements of 20-F 0001628280-26-025362 (filed 2026-04-16) and the filing's own XBRL instance could not be read: " +
        "instance unreadable (document HTTP 404); figures that need its filed facts rest on earlier filings or are withheld",
    }]);
    // A filing read beside one that was not: both are disclosed.
    const both = withNewerFilings(served, [tsmInstance()], unread.slice(0, 1));
    expect(companyFactsInstanceEntries(both.companyFactsInstances ?? undefined).map((e) => [e.field, e.severity])).toEqual([
      ["edgar.companyFacts.newerFilings", "info"], ["edgar.companyFacts.unreadFilings", "warn"],
    ]);
  });
});

// ---------------------------------------------------------------------------
// The bundle: the real collection path over a recorded-shape transport
// ---------------------------------------------------------------------------

const NOW = new Date("2026-11-12T18:21:28.303Z");

function tsmTransport(log: string[], feed: CompanyFacts): EdgarTransport {
  const respond = (value: unknown): Promise<EdgarTransportResponse> =>
    Promise.resolve({ status: 200, body: typeof value === "string" ? value : JSON.stringify(value), fetchedAt: NOW.toISOString(), fromCache: false, stale: false });
  const submissions = {
    cik: "0001046179", name: "TAIWAN SEMICONDUCTOR MANUFACTURING CO LTD", sic: "3674", sicDescription: "Semiconductors & Related Devices",
    fiscalYearEnd: "1231", stateOfIncorporation: "F5", tickers: ["TSM"], exchanges: ["NYSE"],
    filings: { recent: {
      accessionNumber: ["0001046179-26-000800", FY2025_20F.accession, FY2024_20F.accession],
      filingDate: ["2026-11-12", "2026-04-16", "2025-04-17"],
      reportDate: ["2026-11-12", "2025-12-31", "2024-12-31"],
      form: ["6-K", "20-F", "20-F"],
      primaryDocument: ["a20261112.htm", "tsm-20251231.htm", "d887479d20f.htm"],
      primaryDocDescription: ["6-K", "20-F", "20-F"],
      items: ["", "", ""],
      acceptanceDateTime: ["2026-11-12T13:03:05.000Z", "2026-04-16T10:05:49.000Z", "2025-04-17T06:02:11.000Z"],
    } },
  };
  const indexHeaders = `<HTML><HEAD><TITLE>SEC EDGAR Submission ${FY2025_20F.accession}</TITLE></HEAD><BODY>
<PRE>&lt;SEC-DOCUMENT&gt;${FY2025_20F.accession}-index.html : 20260416
ACCESSION NUMBER:		${FY2025_20F.accession}
CONFORMED SUBMISSION TYPE:	20-F
PUBLIC DOCUMENT COUNT:		2
CONFORMED PERIOD OF REPORT:	20251231
FILED AS OF DATE:		20260416
&lt;DOCUMENT&gt;
&lt;TYPE&gt;20-F
&lt;SEQUENCE&gt;1
&lt;FILENAME&gt;tsm-20251231.htm
&lt;DESCRIPTION&gt;20-F
&lt;TEXT&gt;
<a href="tsm-20251231.htm">Document 1 - file: tsm-20251231.htm</a><br>
&lt;/DOCUMENT&gt;
&lt;DOCUMENT&gt;
&lt;TYPE&gt;XML
&lt;SEQUENCE&gt;26
&lt;FILENAME&gt;tsm-20251231_htm.xml
&lt;DESCRIPTION&gt;IDEA: XBRL DOCUMENT
&lt;TEXT&gt;
<a href="tsm-20251231_htm.xml">Document 26 - RAW XML: tsm-20251231_htm.xml</a><br>
&lt;/DOCUMENT&gt;
&lt;/SEC-DOCUMENT&gt;</PRE></BODY></HTML>`;
  return {
    fetchText(url: string): Promise<EdgarTransportResponse> {
      log.push(url);
      if (url.includes("company_tickers.json")) return respond({ "0": { cik_str: 1046179, ticker: "TSM", title: "TAIWAN SEMICONDUCTOR MANUFACTURING CO LTD" } });
      if (url.includes("submissions/CIK0001046179.json")) return respond(submissions);
      if (url.includes("companyfacts/CIK0001046179.json")) return respond(feed);
      if (url.endsWith(`${FY2025_20F.accession}-index-headers.html`)) return respond(indexHeaders);
      if (url.endsWith("/000162828026025362/tsm-20251231_htm.xml")) return respond(INSTANCE_XML);
      return Promise.resolve({ status: 404, body: "not found", fetchedAt: NOW.toISOString(), fromCache: false, stale: false });
    },
  };
}

function quietYahoo(): YahooClient {
  const empty = { ok: true as const, value: { data: { rows: [], raw: null }, asOf: "2026-11-12", source: "yahoo", endpoint: "/v8/finance/chart/TSM", fetchedAt: NOW.toISOString() } };
  const client = createYahooClient({ limiter: makeLimiter(1, 1) }) as unknown as Record<string, unknown>;
  return { ...client, dailyHistory: () => Promise.resolve(empty), meta: () => Promise.resolve(empty), quote: () => Promise.resolve(empty) } as unknown as YahooClient;
}

async function tsmBundle(feed: CompanyFacts) {
  const unavailable = (): Promise<Response> => Promise.resolve(new Response("not available", { status: 404 }));
  const configs: { fred: FredConfig; finnhub: FinnhubConfig; finra: FinraConfig } = {
    fred: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 },
    finnhub: { apiKey: "TEST-KEY", fetchImpl: unavailable, retryDelaysMs: [] },
    finra: { fetchImpl: unavailable, retryDelaysMs: [] },
  };
  const log: string[] = [];
  const bundle = await buildDataBundle("TSM", {
    now: () => NOW,
    fmp: createFmpClient({ apiKey: "", fixturesDir: "fixtures/fmp" }),
    edgar: createEdgarClient({ transport: tsmTransport(log, feed) }),
    yahoo: quietYahoo(),
    ...configs,
  });
  return { bundle, instanceRequests: log.filter((url) => url.endsWith("_htm.xml")) };
}

describe("building the data bundle for a 20-F filer (D-236)", () => {
  it("fetches the filing's instance once, merges it and discloses the merge", async () => {
    const { bundle, instanceRequests } = await tsmBundle(storedFeed());
    expect(instanceRequests).toEqual(["https://www.sec.gov/Archives/edgar/data/1046179/000162828026025362/tsm-20251231_htm.xml"]);
    const facts = bundle.edgar.companyFacts;
    if (!facts.ok) throw new Error("companyfacts missing from the bundle");
    expect(facts.value.endpoint).toBe("https://data.sec.gov/api/xbrl/companyfacts/CIK0001046179.json + 20-F 0001628280-26-025362 XBRL instance (filed 2026-04-16)");
    expect(bundle.edgar.companyFactsInstances).toEqual({ companyFactsThrough: "2025-04-17", merged: [{ ...FY2025_20F, periodEnd: "2025-12-31", count: 63 }] });
    expect(units(facts.value.data, "ifrs-full", "DilutedEarningsLossPerShare")["TWD/shares"]!.at(-1))
      .toMatchObject({ start: "2025-01-01", end: "2025-12-31", val: 65.47, accn: FY2025_20F.accession, form: "20-F", filed: "2026-04-16" });
    expect(bundle.gaps.filter((g) => g.field.startsWith("edgar.companyFacts."))).toEqual([{
      field: "edgar.companyFacts.newerFilings", severity: "info", attemptedSources: [FY2025_20F.accession],
      reason: "SEC companyfacts carried periodic reports only through the one filed 2025-04-17; the facts of 20-F 0001628280-26-025362 (period ended 2025-12-31, filed 2026-04-16) " +
        "were read from the filing's own XBRL instance and merged, each citing that filing",
    }]);
  });

  it("requests no instance when the feed carries the filing's statements", async () => {
    const carried = mergeInstanceFacts(storedFeed(), [tsmInstance()]).facts;
    const { bundle, instanceRequests } = await tsmBundle(carried);
    expect(instanceRequests).toEqual([]);
    expect(bundle.edgar.companyFactsInstances).toBeUndefined();
    expect(bundle.edgar.companyFacts.ok && bundle.edgar.companyFacts.value.endpoint).toBe("https://data.sec.gov/api/xbrl/companyfacts/CIK0001046179.json");
    expect(bundle.gaps.filter((g) => g.field.startsWith("edgar.companyFacts."))).toEqual([]);
  });
});
