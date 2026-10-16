import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseBusinessCombinationFacts, parseCommitmentFacts, parseInvestmentFacts, parseOfficerChanges, parseSayOnPay, parseStatementFacts, parseTradingArrangements, parseWorkingCapital } from "@/edgar/filingFacts";
import { annualNotesToFinancialStatements, extractSection } from "@/edgar/extract";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { assembleContextPayload, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import { runStageB } from "@/pipeline/compute";
import { selectMaterialEvidence } from "@/pipeline/stageC/evidenceSelection";
import { buildEarningsReleaseRecord, buildMaterialEventFiling, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
import type { ExtractedSection } from "@/pipeline/types";
import { FilingDisclosuresSchema } from "@/report/schema";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const read = (name: string) => readFileSync(path.join(process.cwd(), "fixtures/edgar", name), "utf8");
const notes = read("nvda-periodic-sections/nvda-10q-q2fy27-notes.txt");
const annual = read("nvda-periodic-sections/nvda-10k-fy2026-notes.txt");
const statements = read("nvda-periodic-sections/nvda-10q-q2fy27-statements.txt");
const other = read("nvda-periodic-sections/nvda-10q-q2fy27-item5.txt");
const mdna = read("nvda-periodic-sections/nvda-10q-q2fy27-item2.txt");
const q1 = read("nvda-current-reports/q1fy27-ex99-2.txt");
const q2 = read("nvda-current-reports/q2fy27-ex99-2.txt");
const cao = read("nvda-current-reports/8k-20260424-item-5.02.txt");
const puri = read("nvda-current-reports/8k-20260628-item-5.02.txt");
const vote = read("nvda-current-reports/8k-20260630-item-5.07-section.txt");
const filing = (accessionNumber: string, filingDate: string, items?: string) => ({ accessionNumber, filingDate, form: "8-K", items });
const sourced = <T,>(data: T, asOf: string) => ({ ok: true as const, value: { data, asOf, source: "edgar" as const, endpoint: "fixture", fetchedAt: "2026-10-15T00:00:00Z" } });
const section = (sectionName: ExtractedSection["sectionName"], text: string, form = "10-Q") => sourced<ExtractedSection>({ sectionName, text, chars: text.length, method: "toc-anchor", form, accession: "0001045810-26-000075", reportDate: form === "10-K" ? "2026-01-25" : "2026-07-26", filingDate: "2026-08-26", documentUrl: "https://www.sec.gov/x" }, "2026-07-26");

describe("D-66 recovered filing facts", () => {
  it("reads current-column investing and financing flows with their year-to-date window", () => {
    const facts = parseStatementFacts(statements);
    expect(facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Purchases of equity securities", value: 42_404e6, period: "six months ended 2026-07-26" }),
      expect.objectContaining({ label: "Groq, Inc. (financing payment)", value: 2_944e6, period: "six months ended 2026-07-26" }),
      expect.objectContaining({ key: "non-marketable-securities", value: 51_157e6, asOf: "2026-07-26" }),
      expect.objectContaining({ key: "marketable-equity-securities", value: 42_783e6 }),
    ]));
  });

  it("retains exact long-term public holdings, lock-up dates, equity-method investment and VIE exposure", () => {
    const facts = parseInvestmentFacts(notes, "2026-07-26");
    for (const [key, value, asOf] of [["long-term-public-equity-securities", 4_957e6, "2026-07-26"], ["investments-lock-up", 36.9e9, "2026-07-26"], ["investments-lock-up", 10.5e9, "2026-01-25"], ["equity-method-investments", 3.3e9, "2026-07-26"], ["vie-maximum-loss", 4.7e9, "2026-07-26"]]) {
      expect(facts).toContainEqual(expect.objectContaining({ key, value, asOf }));
    }
  });

  it("keeps Groq consideration components and explicitly computes their total", () => {
    const facts = parseBusinessCombinationFacts(annual, "2026-01-25");
    for (const [key, value] of [["deal-goodwill", 14.4e9], ["deal-intangible", 2.5e9], ["deal-consideration-paid", 13e9], ["deal-consideration-payable", 4e9], ["deal-consideration-total", 17e9]]) {
      expect(facts).toContainEqual(expect.objectContaining({ key, value }));
    }
    expect(facts.find((f) => f.key === "deal-consideration-total")?.computed).toBe("13.0 billion + 4 billion");
  });

  it("preserves supply commitments, the financing platform qualifier, and the DSO outlook", () => {
    const commitments = parseCommitmentFacts(notes + " " + mdna);
    expect(commitments).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "supply-commitments", value: 279e9 }),
      expect.objectContaining({ key: "supply-commitments-prior-quarter", value: 119e9, period: "prior quarter end" }),
      expect.objectContaining({ key: "financing-platforms-capital", value: 500e9, qualifier: "more than" }),
    ]));
    expect(parseWorkingCapital(q1)).toMatchObject({ dso: 45, expectation: "We expect our DSO to return to more normal levels next quarter." });
    expect(parseWorkingCapital(q2)).toMatchObject({ dso: 60, priorDso: 45, comparison: "sequential" });
  });

  it("separates officer departures from appointments and preserves Parker's package and anticipated start", () => {
    expect(parseOfficerChanges(cao)).toEqual(expect.arrayContaining([
      expect.objectContaining({ person: "Donald Robertson", kind: "departure", effective: "2026-05-04" }),
      expect.objectContaining({ person: "Scott Gawel", kind: "appointment", effective: "2026-05-04" }),
    ]));
    const changes = parseOfficerChanges(puri);
    expect(changes.find((c) => c.person === "Ajay K. Puri")).toMatchObject({ kind: "departure", effective: "2026-08-24", anticipated: true });
    expect(changes.find((c) => c.person === "Nicholas Parker")?.package.map((p) => p.value)).toEqual([1e6, 5e6, 1.5e6, 35e6, 5e6]);
    expect(parseOfficerChanges("No officer changes were reported.")).toEqual([]);
  });

  it("reads the say-on-pay proposal rather than director-election totals and all three trading plans", () => {
    expect(parseSayOnPay(vote)).toMatchObject({ meetingDate: "2026-06-24", votesFor: 15_706_336_853, votesAgainst: 1_071_224_151, abstentions: 79_128_382, approved: true });
    expect(parseTradingArrangements(other)).toEqual(expect.arrayContaining([
      expect.objectContaining({ person: "Aarti Shah", shares: 6_500, date: "2026-05-22" }),
      expect.objectContaining({ person: "Timothy S. Teter", shares: 547_942, includesFutureAwards: true }),
      expect.objectContaining({ person: "Colette M. Kress", shares: 375_439, date: "2026-06-16" }),
    ]));
    expect(parseSayOnPay("No advisory vote was held.")).toBeNull();
    expect(parseTradingArrangements("No plans.")).toEqual([]);
  });

  it("carries periodic-only evidence even when current-report and trend inputs are absent", () => {
    const bundle = completeCurrencyBundle({ annualCurrency: "USD" });
    bundle.edgar.tenKNotes = section("tenKNotes", annual, "10-K");
    bundle.statements.incomeQuarterly = { ok: false, gap: { field: "incomeQuarterly", reason: "absent", severity: "info" } };
    expect(buildFilingDisclosures(bundle)?.filingFacts).toContainEqual(expect.objectContaining({ key: "deal-consideration-total", value: 17e9 }));
  });

  it("makes parsed notes, statements, plans and commentary available to the schema and prompt registry", () => {
    const bundle = completeCurrencyBundle({ annualCurrency: "USD" });
    bundle.builtAt = "2026-10-15T00:00:00Z";
    bundle.edgar.tenQNotes = section("tenQNotes", notes);
    if (bundle.edgar.tenQNotes.ok) bundle.edgar.tenQNotes.value.data.statementsText = statements;
    bundle.edgar.tenKNotes = section("tenKNotes", annual, "10-K");
    bundle.edgar.tenQOther = section("tenQItem5", other);
    bundle.edgar.tenQMdna = section("tenQItem2", mdna);
    const release = (quarter: "q1" | "q2") => buildEarningsReleaseRecord({ filing: filing(quarter, quarter === "q2" ? "2026-08-26" : "2026-05-20"), releaseUrl: "https://www.sec.gov/release", commentaryUrl: "https://www.sec.gov/commentary", releaseText: read(`nvda-current-reports/${quarter}fy27-ex99-1.txt`), commentaryText: quarter === "q2" ? q2 : q1, includeNarrative: true });
    bundle.edgar.currentReports = sourced({ version: CURRENT_REPORTS_VERSION, releases: [release("q2"), release("q1")], events: [buildMaterialEventFiling(filing("officer", "2026-04-27", "5.02"), cao, "https://www.sec.gov/officer"), buildMaterialEventFiling(filing("parker", "2026-07-02", "5.02"), puri, "https://www.sec.gov/parker"), buildMaterialEventFiling(filing("vote", "2026-06-30", "5.07"), `Item 5.07. Submission of Matters to a Vote of Security Holders. ${vote}`, "https://www.sec.gov/vote")], notes: [] }, "2026-08-26");
    const disclosures = FilingDisclosuresSchema.parse(buildFilingDisclosures(bundle));
    expect(disclosures.officerChanges?.find((c) => c.kind === "departure")).toMatchObject({ inEffect: true });
    expect(disclosures.tradingArrangements).toHaveLength(3);
    const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
    expect(payload.provenanceRegistry).toContainEqual(expect.objectContaining({ value: 42_404e6, period: "2026-07-26" }));
    const governanceRecords = payload.provenanceRegistry!.filter((r) => r.id.startsWith("payload.filing-facts.") && /Nicholas Parker|plan share capacity/.test(r.label ?? ""));
    for (const value of [35e6, 5e6, 375_439, 547_942]) expect(governanceRecords.some((r) => r.value === value)).toBe(true);
    const prompt = serializePayloadForPrompt(payload);
    for (const needle of ["Groq", "375,439", "547,942", "500", "DSO outlook", "return to more normal levels next quarter"]) expect(prompt).toContain(needle);
  });

  it("bounds annual notes before the exhibit index and extracts a short Part II Item 5", () => {
    const body = `${annual} Exhibit Index Items omitted from notes.`;
    expect(annualNotesToFinancialStatements(body)?.text).toBe(annual.trim());
    const html = `<html><body><h1>PART II</h1><h2>Item 5. Other Information</h2><p>${other}</p><h2>Item 6. Exhibits</h2><p>exhibits</p></body></html>`;
    const result = extractSection(html, { form: "10-Q", item: "5", part: 2 }, { stubMinChars: 120 });
    expect(result.ok).toBe(true);
  });

  it("keeps current concentration, extended terms and indirect AI demand in bounded excerpts", () => {
    const retainedNotes = selectMaterialEvidence(notes, 14_000, "notes");
    expect(retainedNotes.text.length).toBeLessThanOrEqual(14_000);
    for (const needle of ["one direct customer represented 16 %", "three direct customers represented 16 %, 15 %, and 13 %", "22 %, 14 %, 13 %, 11 %, and 10 %", "90 days up to one year", "equity method"]) expect(retainedNotes.text).toContain(needle);
    const retainedMdna = selectMaterialEvidence(mdna, 14_000, "interim");
    expect(retainedMdna.text).toContain("one AI research and deployment company contributed a meaningful amount");
    for (const selected of [retainedNotes, retainedMdna]) expect(selected.coverage.omittedChars).toBeGreaterThan(0);
  });

  it("withholds unsupported statement units, unestablished investment dates, and invalid plan dates", () => {
    expect(parseStatementFacts(statements.replaceAll("(In millions)", "(In unknown units)"))).toEqual([]);
    expect(parseInvestmentFacts(notes, "2025-12-31").some((f) => f.key === "long-term-public-equity-securities")).toBe(false);
    expect(parseTradingArrangements(other.replaceAll("5/22/2026", "2/30/2026").replaceAll("6/16/2026", "2/30/2026"))).toEqual([]);
    expect(parseWorkingCapital("Accounts receivable was not disclosed.")).toBeNull();
  });
});
