import { describe, expect, it, vi } from "vitest";
import { mergeInstanceFacts, parseInstanceFacts } from "@/edgar/instanceFacts";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { VendorSplitEvidence } from "@/providers/splitEvents";

// Audit 2026-10-22 B-23: companyfacts ran a quarter behind the filed 10-Qs
// (Visa, Duke, NextEra, Coca-Cola, Prologis). The newer 10-Q's XBRL instance
// is already fetched for segment revenue; its own facts are merged so the
// statements reach the quarter it reports.

const CIK = "0001326160";

interface Ctx { id: string; start?: string; end: string; member?: string; cik?: string }
interface Fact { tag: string; ctx: string; unit?: string; val: string; decimals?: string; nil?: boolean }

/** An SEC-style extracted instance: default xbrli namespace, us-gaap and dei prefixes. */
function instance(contexts: Ctx[], facts: Fact[], focus = { fy: "2026", fp: "Q2", end: "2026-06-30" }): string {
  const ctx = contexts.map((c) => `    <context id="${c.id}">
        <entity>
            <identifier scheme="http://www.sec.gov/CIK">${c.cik ?? CIK}</identifier>${c.member ? `
            <segment>
                <xbrldi:explicitMember dimension="dei:LegalEntityAxis">duk:${c.member}</xbrldi:explicitMember>
            </segment>` : ""}
        </entity>
        <period>
            ${c.start ? `<startDate>${c.start}</startDate>
            <endDate>${c.end}</endDate>` : `<instant>${c.end}</instant>`}
        </period>
    </context>`).join("\n");
  const body = facts.map((f) => f.nil
    ? `    <${f.tag} contextRef="${f.ctx}" id="x" xsi:nil="true"/>`
    : `    <${f.tag}
      contextRef="${f.ctx}"${f.unit ? `
      decimals="${f.decimals ?? "-6"}"` : ""}
      id="f"${f.unit ? `
      unitRef="${f.unit}"` : ""}>${f.val}</${f.tag}>`).join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<xbrl
  xmlns="http://www.xbrl.org/2003/instance"
  xmlns:dei="http://xbrl.sec.gov/dei/2026"
  xmlns:duk="http://www.dukeenergy.com/20260630"
  xmlns:iso4217="http://www.xbrl.org/2003/iso4217"
  xmlns:us-gaap="http://fasb.org/us-gaap/2026"
  xmlns:xbrldi="http://xbrl.org/2006/xbrldi"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
${ctx}
    <unit id="usd">
        <measure>iso4217:USD</measure>
    </unit>
    <unit id="shares">
        <measure>shares</measure>
    </unit>
    <unit id="usdPerShare">
        <divide>
            <unitNumerator>
                <measure>iso4217:USD</measure>
            </unitNumerator>
            <unitDenominator>
                <measure>shares</measure>
            </unitDenominator>
        </divide>
    </unit>
    <dei:DocumentFiscalYearFocus contextRef="ytd" id="a">${focus.fy}</dei:DocumentFiscalYearFocus>
    <dei:DocumentFiscalPeriodFocus contextRef="ytd" id="b">${focus.fp}</dei:DocumentFiscalPeriodFocus>
    <dei:DocumentPeriodEndDate contextRef="ytd" id="c">${focus.end}</dei:DocumentPeriodEndDate>
${body}
</xbrl>`;
}

const Q2_CONTEXTS: Ctx[] = [
  { id: "ytd", start: "2026-01-01", end: "2026-06-30" },
  { id: "q2", start: "2026-04-01", end: "2026-06-30" },
  { id: "q2py", start: "2025-04-01", end: "2025-06-30" },
  { id: "bs", end: "2026-06-30" },
  { id: "cover", end: "2026-07-31" },
  { id: "sub", start: "2026-04-01", end: "2026-06-30", member: "DukeEnergyCarolinasMember" },
  { id: "other", start: "2026-04-01", end: "2026-06-30", cik: "0000000001" },
];
const Q2_FACTS: Fact[] = [
  { tag: "us-gaap:Revenues", ctx: "q2", unit: "usd", val: "7500000000" },
  { tag: "us-gaap:Revenues", ctx: "ytd", unit: "usd", val: "15500000000" },
  { tag: "us-gaap:Revenues", ctx: "q2py", unit: "usd", val: "7100000000" },
  { tag: "us-gaap:Revenues", ctx: "sub", unit: "usd", val: "2000000000" },
  { tag: "us-gaap:Revenues", ctx: "other", unit: "usd", val: "1" },
  { tag: "us-gaap:NetIncomeLoss", ctx: "q2", unit: "usd", val: "1092000000" },
  { tag: "us-gaap:NetIncomeLoss", ctx: "ytd", unit: "usd", val: "2642000000" },
  { tag: "us-gaap:EarningsPerShareDiluted", ctx: "q2", unit: "usdPerShare", val: "1.38", decimals: "2" },
  { tag: "us-gaap:Assets", ctx: "bs", unit: "usd", val: "200000000000" },
  { tag: "us-gaap:Liabilities", ctx: "bs", unit: "usd", val: "1", nil: true },
  { tag: "us-gaap:RevenueFromContractWithCustomerTextBlock", ctx: "ytd", val: "text" },
  { tag: "dei:EntityCommonStockSharesOutstanding", ctx: "cover", unit: "shares", val: "779702193", decimals: "INF" },
];
const Q2_FILING = { accession: "0001326160-26-000040", form: "10-Q", filingDate: "2026-08-05" };

describe("parseInstanceFacts (audit 2026-10-22 B-23)", () => {
  const parsed = parseInstanceFacts(instance(Q2_CONTEXTS, Q2_FACTS), Q2_FILING, CIK);

  it("reads the registrant's undimensioned numeric facts in companyfacts shape", () => {
    expect(parsed.periodEnd).toBe("2026-06-30");
    expect(parsed.facts["us-gaap"]!.Revenues!.USD).toEqual([
      { start: "2026-04-01", end: "2026-06-30", val: 7_500_000_000, accn: Q2_FILING.accession, fy: 2026, fp: "Q2", form: "10-Q", filed: "2026-08-05" },
      { start: "2026-01-01", end: "2026-06-30", val: 15_500_000_000, accn: Q2_FILING.accession, fy: 2026, fp: "Q2", form: "10-Q", filed: "2026-08-05" },
      { start: "2025-04-01", end: "2025-06-30", val: 7_100_000_000, accn: Q2_FILING.accession, fy: 2026, fp: "Q2", form: "10-Q", filed: "2026-08-05" },
    ]);
    expect(parsed.facts["us-gaap"]!.Assets!.USD).toEqual([expect.objectContaining({ end: "2026-06-30", val: 200e9 })]);
    expect(parsed.facts["us-gaap"]!.Assets!.USD![0]).not.toHaveProperty("start");
    expect(parsed.facts["us-gaap"]!.EarningsPerShareDiluted!["USD/shares"]).toEqual([expect.objectContaining({ val: 1.38 })]);
    expect(parsed.facts.dei!.EntityCommonStockSharesOutstanding!.shares).toEqual([expect.objectContaining({ end: "2026-07-31", val: 779_702_193 })]);
  });

  it("leaves out subsidiaries' dimensioned facts, other entities, nil and non-numeric facts", () => {
    expect(parsed.facts["us-gaap"]!.Revenues!.USD!.map((p) => p.val)).not.toContain(2_000_000_000);
    expect(parsed.facts["us-gaap"]!.Revenues!.USD!.map((p) => p.val)).not.toContain(1);
    expect(parsed.facts["us-gaap"]!.Liabilities).toBeUndefined();
    expect(parsed.facts["us-gaap"]!.RevenueFromContractWithCustomerTextBlock).toBeUndefined();
    expect(parsed.count).toBe(8);
  });

  it("keeps the more precise of two statements of a fact and drops a contradicted one", () => {
    const xml = instance(Q2_CONTEXTS, [
      { tag: "us-gaap:Revenues", ctx: "q2", unit: "usd", val: "7500000000", decimals: "-8" },
      { tag: "us-gaap:Revenues", ctx: "q2", unit: "usd", val: "7512000000", decimals: "-6" },
      { tag: "us-gaap:NetIncomeLoss", ctx: "q2", unit: "usd", val: "1092000000" },
      { tag: "us-gaap:NetIncomeLoss", ctx: "q2", unit: "usd", val: "1093000000" },
    ]);
    const facts = parseInstanceFacts(xml, Q2_FILING, CIK).facts["us-gaap"]!;
    expect(facts.Revenues!.USD!.map((p) => p.val)).toEqual([7_512_000_000]);
    expect(facts.NetIncomeLoss).toBeUndefined();
  });
});

const NO_VENDOR_SPLITS: VendorSplitEvidence = { status: "retrieved", source: "test:vendor", events: [], coverage: [{ from: "1980-12-12", to: "2026-10-22" }] };
const OPTS = { symbol: "DUK", cik: CIK, annualPeriods: 10, quarterlyPeriods: 24, asOf: "2026-10-22", vendorSplits: NO_VENDOR_SPLITS };

/** companyfacts as SEC served it on 2026-10-22: through the first-quarter 10-Q only. */
function laggingFacts(): CompanyFacts {
  const point = (start: string | undefined, end: string, val: number, accn: string, form: string, fp: string, filed: string) =>
    ({ ...(start ? { start } : {}), end, val, accn, fy: Number(filed.slice(0, 4)) - (form === "10-K" ? 1 : 0), fp, form, filed });
  const k = ["0001326160-26-000014", "10-K", "FY", "2026-02-26"] as const;
  const q1 = ["0001326160-26-000026", "10-Q", "Q1", "2026-05-05"] as const;
  return {
    cik: 1326160,
    entityName: "Duke Energy CORP",
    facts: {
      "us-gaap": {
        Revenues: { label: "Revenues", units: { USD: [
          point("2025-01-01", "2025-12-31", 31_000_000_000, ...k),
          point("2025-01-01", "2025-03-31", 8_000_000_000, ...k),
          point("2026-01-01", "2026-03-31", 8_000_000_000, ...q1),
          point("2025-01-01", "2025-03-31", 7_600_000_000, ...q1),
        ] } },
        Assets: { label: "Assets", units: { USD: [
          point(undefined, "2025-12-31", 195_000_000_000, ...k),
          point(undefined, "2026-03-31", 198_000_000_000, ...q1),
        ] } },
        NetIncomeLoss: { label: "Net income", units: { USD: [
          point("2025-01-01", "2025-12-31", 5_000_000_000, ...k),
          point("2026-01-01", "2026-03-31", 1_550_000_000, ...q1),
        ] } },
      },
    },
  };
}

describe("mergeInstanceFacts (audit 2026-10-22 B-23)", () => {
  const q2 = parseInstanceFacts(instance(Q2_CONTEXTS, Q2_FACTS), Q2_FILING, CIK);

  it("makes the statements reach the quarter the newer 10-Q reports, citing that 10-Q", () => {
    const before = buildStatementsFromCompanyFacts(laggingFacts(), OPTS).incomeQuarterly.rows[0]!;
    expect(before.date).toBe("2026-03-31");
    const merge = mergeInstanceFacts(laggingFacts(), [q2]);
    expect(merge.companyFactsThrough).toBe("2026-05-05");
    expect(merge.merged).toEqual([{ ...Q2_FILING, periodEnd: "2026-06-30", count: 8 }]);
    const row = buildStatementsFromCompanyFacts(merge.facts, OPTS).incomeQuarterly.rows[0]!;
    expect(row).toMatchObject({ date: "2026-06-30", revenue: 7_500_000_000, netIncome: 1_092_000_000 });
    expect(row.fieldProvenance?.revenue?.filings).toEqual([{ accn: Q2_FILING.accession, filed: "2026-08-05", form: "10-Q" }]);
  });

  it("does not modify the payload it was given", () => {
    const facts = laggingFacts();
    const copy = JSON.parse(JSON.stringify(facts));
    mergeInstanceFacts(facts, [q2]);
    expect(facts).toEqual(copy);
  });

  it("never merges a filing companyfacts already carries, or one older than its newest periodic report", () => {
    const carriedFacts = mergeInstanceFacts(laggingFacts(), [q2]).facts;
    expect(mergeInstanceFacts(carriedFacts, [q2]).merged).toEqual([]);
    const older = parseInstanceFacts(instance(Q2_CONTEXTS, Q2_FACTS), { accession: "0001326160-26-000099", form: "10-Q", filingDate: "2026-05-01" }, CIK);
    const merge = mergeInstanceFacts(laggingFacts(), [older]);
    expect(merge.merged).toEqual([]);
    expect(merge.facts).toEqual(laggingFacts());
  });
});

describe("the bundle's companyfacts after the merge (audit 2026-10-22 B-23)", () => {
  const q2 = parseInstanceFacts(instance(Q2_CONTEXTS, Q2_FACTS), Q2_FILING, CIK);
  const served = { ok: true as const, value: {
    data: laggingFacts(), source: "edgar" as const, endpoint: "https://data.sec.gov/api/xbrl/companyfacts/CIK0001326160.json",
    asOf: "2026-03-31", fetchedAt: "2026-10-22T03:58:30.156Z",
  } };

  it("names the instance in the endpoint, moves the as-of date and discloses the merge", async () => {
    vi.mock("server-only", () => ({}));
    const { withNewerFilings, companyFactsInstanceEntries } = await import("@/pipeline/dataBundle");
    const { companyFacts, companyFactsInstances } = withNewerFilings(served, [q2]);
    if (!companyFacts.ok) throw new Error("merge dropped companyfacts");
    expect(companyFacts.value.endpoint).toBe("https://data.sec.gov/api/xbrl/companyfacts/CIK0001326160.json + 10-Q 0001326160-26-000040 XBRL instance (filed 2026-08-05)");
    expect(companyFacts.value.asOf).toBe("2026-07-31");
    expect(companyFacts.value.fetchedAt).toBe(served.value.fetchedAt);
    expect(companyFactsInstanceEntries(companyFactsInstances ?? undefined)).toEqual([{
      field: "edgar.companyFacts.newerFilings", severity: "info", attemptedSources: [Q2_FILING.accession],
      reason: "SEC companyfacts carried periodic reports only through the one filed 2026-05-05; the facts of 10-Q 0001326160-26-000040 (period ended 2026-06-30, filed 2026-08-05) were read from the filing's own XBRL instance and merged, each citing that filing",
    }]);
  });

  it("leaves companyfacts as served when it already carries every filing read", async () => {
    vi.mock("server-only", () => ({}));
    const { withNewerFilings } = await import("@/pipeline/dataBundle");
    const older = parseInstanceFacts(instance(Q2_CONTEXTS, Q2_FACTS), { ...Q2_FILING, filingDate: "2026-05-01" }, CIK);
    const result = withNewerFilings(served, [older]);
    expect(result.companyFacts).toBe(served);
    expect(result.companyFactsInstances).toBeNull();
  });
});
