import { describe, expect, it } from "vitest";
import { buildEarningsReleaseRecord, collectCurrentReports, MAX_EARNINGS_RELEASES, orderedEarningsReleases, type EarningsReleaseRecord } from "@/providers/currentReports";
import type { EdgarClient, EdgarFiling } from "@/providers/edgar";

// Audit 2026-10-22 B-26: a results release whose period the reader cannot
// parse ranked below every older release with a parsed period, so the
// newest results were cut from the retained four (PepsiCo, Tesla).

const record = (accession: string, filingDate: string, text: string): EarningsReleaseRecord =>
  buildEarningsReleaseRecord({ filing: { accessionNumber: accession, filingDate }, releaseUrl: `https://www.sec.gov/${accession}.htm`, commentaryUrl: null, releaseText: text, commentaryText: null, includeNarrative: true });

const results = (title: string) => `${title}. Net income was $210 million, or $0.52 per diluted share.`;
const UNDATED = results("Example Corp Reports Results; Affirms Financial Guidance");

describe("earnings release order (audit 2026-10-22 B-26)", () => {
  it("ranks a release that states no period by its filing date, not below every dated release", () => {
    const records = [
      record("q2", "2026-07-20", results("Example Corp Reports Second Quarter 2026 Results")),
      record("q1", "2026-04-20", results("Example Corp Reports First Quarter 2026 Results")),
      record("q4", "2026-02-03", results("Example Corp Reports Fourth Quarter 2025 Results")),
      record("q3-2025", "2025-10-20", results("Example Corp Reports Third Quarter 2025 Results")),
      record("newest", "2026-10-20", UNDATED),
    ];
    expect(records.at(-1)!.reported).toEqual({ fiscal: null, periodEnd: null });
    const ordered = orderedEarningsReleases(records);
    expect(ordered[0]!.accession).toBe("newest");
    expect(ordered.slice(0, MAX_EARNINGS_RELEASES).map((r) => r.accession)).toEqual(["newest", "q2", "q1", "q4"]);
  });

  it("interleaves undated releases by filing date between dated ones (PepsiCo's title change)", () => {
    const ordered = orderedEarningsReleases([
      record("q4-2025", "2026-02-03", results("Example Corp Reports Fourth Quarter 2025 Results")),
      record("q3-2025", "2025-10-09", results("Example Corp Reports Third Quarter 2025 Results")),
      record("2026-10", "2026-10-08", UNDATED),
      record("2026-07", "2026-07-09", UNDATED),
      record("2026-04", "2026-04-16", UNDATED),
    ]);
    expect(ordered.map((r) => r.accession)).toEqual(["2026-10", "2026-07", "2026-04", "q4-2025", "q3-2025"]);
  });

  it("keeps period order among dated releases, so a later-filed amendment of an older quarter stays behind", () => {
    const ordered = orderedEarningsReleases([
      record("q1-amended", "2026-08-01", results("Example Corp Reports First Quarter 2026 Results")),
      record("q2", "2026-07-20", results("Example Corp Reports Second Quarter 2026 Results")),
      record("undated", "2026-07-25", UNDATED),
      record("undated-old", "2026-07-01", UNDATED),
    ]);
    expect(ordered.map((r) => r.accession)).toEqual(["undated", "q2", "q1-amended", "undated-old"]);
  });
});

describe("retained releases prefer results over operational updates (audit 2026-10-22 B-26)", () => {
  const deliveries = (quarter: string, year: number) => `Example Motors ${quarter} Quarter ${year} Production, Deliveries & Deployments. In the ${quarter.toLowerCase()} quarter, we produced 400,000 vehicles and delivered 410,000 vehicles.`;
  const update = (q: number, year: number) => `Q${q} ${year} Update. Profitability $0.7B GAAP operating income $0.8B GAAP net income $1.7B non-GAAP net income.`;
  const filings: Array<[string, string, string]> = [
    ["upd-q3", "2026-10-21", update(3, 2026)], ["del-q3", "2026-10-02", deliveries("Third", 2026)],
    ["upd-q2", "2026-07-22", update(2, 2026)], ["del-q2", "2026-07-02", deliveries("Second", 2026)],
    ["upd-q1", "2026-04-22", update(1, 2026)], ["del-q1", "2026-04-02", deliveries("First", 2026)],
    ["upd-q4", "2026-01-28", update(4, 2025)], ["del-q4", "2026-01-02", deliveries("Fourth", 2025)],
  ];
  const edgarFiling = ([accession, filingDate]: [string, string, string]): EdgarFiling =>
    ({ accessionNumber: accession, filingDate, reportDate: filingDate, form: "8-K", primaryDocument: `${accession}.htm`, items: "2.02,9.01" });
  const ok = <T,>(data: T, endpoint: string) => ({ ok: true as const, value: { data, endpoint, asOf: "2026-10-22", fetchedAt: "2026-10-22T00:00:00Z", source: "edgar" as const } });
  const client = {
    filingIndexHeaders: async (_cik: string, accession: string) => ok({ documents: [{ type: "EX-99.1", filename: `${accession}-ex991.htm`, sequence: "2" }], typeByFilename: {} }, `index/${accession}`),
    fetchFilingDocument: async (_cik: string, filing: EdgarFiling) => {
      const text = filings.find(([accession]) => `${accession}-ex991.htm` === filing.primaryDocument)?.[2];
      return text === undefined ? { ok: false as const, gap: { field: "fixture", reason: "missing", severity: "warn" as const } } : ok(text, `https://www.sec.gov/${filing.primaryDocument}`);
    },
  } as unknown as EdgarClient;

  it("retains the four results releases, newest first, when operational updates fill the candidates", async () => {
    const result = await collectCurrentReports(client, "1", filings.map(edgarFiling), "2026-10-22", "submissions");
    if (!result.ok) throw new Error("no releases");
    const retained = result.value.data.releases;
    expect(retained.map((r) => r.accession)).toEqual(["upd-q3", "upd-q2", "upd-q1", "upd-q4"]);
    expect(retained[0]!.releaseNarrative).toContain("Q3 2026 Update");
  });

  it("still retains an operational update when fewer than four results releases were read", async () => {
    const result = await collectCurrentReports(client, "1", filings.slice(0, 4).map(edgarFiling), "2026-10-22", "submissions");
    if (!result.ok) throw new Error("no releases");
    expect(result.value.data.releases.map((r) => r.accession)).toEqual(["upd-q3", "del-q3", "upd-q2", "del-q2"]);
  });
});
