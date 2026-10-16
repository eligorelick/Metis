import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseBusinessCombinationFacts, parseCommitmentFacts, parseCustomerConcentrationFacts, parseInvestmentFacts, parseOfficerChanges, parseSayOnPay, parseStatementFacts, parseTradingArrangements, parseWorkingCapital } from "@/edgar/filingFacts";
import { annualNotesToFinancialStatements, extractSection } from "@/edgar/extract";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { assembleContextPayload, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import { runStageB } from "@/pipeline/compute";
import { selectMaterialEvidence } from "@/pipeline/stageC/evidenceSelection";
import { buildEarningsReleaseRecord, buildMaterialEventFiling, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
import type { ExtractedSection } from "@/pipeline/types";
import { FilingDisclosuresSchema } from "@/report/schema";
import { filingFactTables } from "@/report/filingSupplementPresentation";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
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
  it("retains quarter/H1 customer shares, dated receivables shares and separate qualified context", () => {
    const scope = { asOf: "2026-07-26", fiscalYear: 2027, quarter: 2 };
    const revenue = parseCustomerConcentrationFacts(mdna, scope);
    expect(revenue.map((f) => [f.value, f.period])).toEqual([[16, "Q2 FY2027"], [16, "first half FY2027"], [15, "first half FY2027"], [13, "first half FY2027"]]);
    expect(revenue[0]!.text).toContain("Separately, We estimate that one AI research and deployment company");
    expect(revenue[0]!.text).toContain("by purchasing cloud services from our customers");
    expect(revenue[0]!.text).not.toContain("OpenAI");
    const receivables = parseCustomerConcentrationFacts(notes, scope).filter((f) => f.key.startsWith("customer-receivables"));
    expect(receivables.map((f) => f.value)).toEqual([22, 14, 13, 11, 10]);
    expect(receivables.every((f) => f.asOf === "2026-07-26")).toBe(true);
    expect(receivables[0]!.text).toContain("90 days up to one year");
    expect(receivables[0]!.text).toContain("investment-grade customer purchases");
    expect(parseCustomerConcentrationFacts(mdna.replaceAll("fiscal year 2027", "fiscal year 2026"), scope)).toEqual([]);
    expect(parseCustomerConcentrationFacts(notes, { asOf: "2026-04-26", fiscalYear: 2027, quarter: 1 })).toEqual([]);
    expect(parseCustomerConcentrationFacts(mdna, { ...scope, fiscalYear: null })).toEqual([]);
    expect(parseCustomerConcentrationFacts(mdna, { ...scope, asOf: null })).toEqual([]);
    const synthetic = (count: string, shares: string) => `For the second quarter of fiscal year 2027, ${count} direct customers represented ${shares} of total revenue.`;
    for (const [count, shares] of [["two", "16%"], ["one", "116%"], ["two", "60% and 50%"]]) {
      expect(parseCustomerConcentrationFacts(synthetic(count!, shares!), scope)).toEqual([]);
    }
  });

  it("retains the annual Taiwan end-customer estimate only for its explicitly established fiscal year", () => {
    const facts = parseCustomerConcentrationFacts(annual, { asOf: "2026-01-25", fiscalYear: 2026, quarter: null });
    expect(facts).toContainEqual(expect.objectContaining({ value: 76, unit: "percent", period: "FY2026", qualifier: "issuer estimate", label: "Data Center revenue from Taiwan-headquartered customers attributed to end customers in the United States and Europe" }));
    const source = { form: "10-K", accession: "annual", exhibit: null, filingDate: "2026-02-25", url: null };
    const rendered = JSON.stringify(filingFactTables({ currency: "USD", filingFacts: facts.map((f) => ({ ...f, source })) }));
    expect(rendered).toContain("76.0%");
    expect(rendered).toContain("FY2026");
    expect(parseCustomerConcentrationFacts(annual, { asOf: "2026-01-25", fiscalYear: 2025, quarter: null }).some((f) => f.key === "taiwan-headquarters-end-customers")).toBe(false);
  });

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

  it("binds current accrued purchase consideration to its own dated table and transaction footnote", () => {
    expect(parseInvestmentFacts(notes, "2026-07-26")).toContainEqual(expect.objectContaining({ key: "accrued-purchase-consideration", label: "accrued purchase consideration for the Groq transaction", value: 986e6, asOf: "2026-07-26" }));
    expect(parseInvestmentFacts(notes.replace("(3) Related to the Groq, Inc. non-exclusive license agreement.", "(4) Related to the Groq, Inc. non-exclusive license agreement."), "2026-07-26").some((f) => f.key === "accrued-purchase-consideration")).toBe(false);
    expect(parseInvestmentFacts(notes, "2026-04-26").some((f) => f.key === "accrued-purchase-consideration")).toBe(false);
    expect(parseInvestmentFacts(notes, null).some((f) => f.key === "accrued-purchase-consideration")).toBe(false);
  });

  it("keeps Groq consideration components and explicitly computes their total", () => {
    const facts = parseBusinessCombinationFacts(annual, "2026-01-25");
    for (const [key, value] of [["deal-goodwill", 14.4e9], ["deal-intangible", 2.5e9], ["deal-consideration-paid", 13e9], ["deal-consideration-payable", 4e9], ["deal-consideration-total", 17e9]]) {
      expect(facts).toContainEqual(expect.objectContaining({ key, value }));
    }
    expect(facts.find((f) => f.key === "deal-consideration-total")?.computed).toBe("13.0 billion + 4 billion");
  });

  it("does not attribute a later transaction's amounts to the first party in a multi-deal note", () => {
    const text = "Note 2 - Business Combinations We entered into an agreement with Alpha, Inc. The Alpha transaction is not material. We acquired Beta, Inc. We recorded $14.4 billion of goodwill and a $2.5 billion developed technology intangible asset. Total consideration consists of $13.0 billion paid at closing and $4 billion payable within one year.";
    const facts = parseBusinessCombinationFacts(text, "2026-01-25");
    expect(facts).toEqual([]);
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
    expect(parseOfficerChanges(cao).find((c) => c.person === "Scott Gawel")?.package.map((p) => p.value)).toEqual([800_000, 12_875_000]);
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

  it("makes parsed notes, statements, plans and commentary available to the schema and prompt registry", async () => {
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
    expect(disclosures.filingFacts?.filter((f) => f.key.startsWith("customer-revenue")).map((f) => [f.value, f.period])).toEqual([[16, "Q2 FY2027"], [16, "first half FY2027"], [15, "first half FY2027"], [13, "first half FY2027"]]);
    expect(disclosures.filingFacts?.find((f) => f.key === "customer-revenue-quarter-1")?.text).toContain("Separately, We estimate that one AI research");
    const table = JSON.stringify(filingFactTables(disclosures));
    for (const value of ["16%", "Q2 FY2027", "first half FY2027", "90 days up to one year", "Separately, We estimate that one AI research"]) expect(table).toContain(value);
    expect(disclosures.officerChanges?.find((c) => c.kind === "departure")).toMatchObject({ inEffect: true });
    expect(disclosures.tradingArrangements).toHaveLength(3);
    const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
    expect(payload.provenanceRegistry).toContainEqual(expect.objectContaining({ value: 42_404e6, period: "2026-07-26" }));
    expect(payload.provenanceRegistry).toContainEqual(expect.objectContaining({ label: "accrued purchase consideration for the Groq transaction, as of 2026-07-26", value: 986e6, period: "2026-07-26", origin: "edgar:10-Q notes" }));
    expect(payload.provenanceRegistry!.find((r) => r.id === "payload.filing-facts.days-sales-outstanding-dso-q2-fy2027")).toMatchObject({ fiscalPeriod: "Q2 FY2027" });
    const governanceRecords = payload.provenanceRegistry!.filter((r) => r.id.startsWith("payload.filing-facts.") && /Nicholas Parker|plan share capacity/.test(r.label ?? ""));
    for (const value of [35e6, 5e6, 375_439, 547_942]) expect(governanceRecords.some((r) => r.value === value)).toBe(true);
    const prompt = serializePayloadForPrompt(payload);
    for (const needle of ["Groq", "375,439", "547,942", "500", "DSO outlook", "return to more normal levels next quarter"]) expect(prompt).toContain(needle);
    const text = "Scott Gawel's new-hire restricted stock unit grants had a combined target value of USD 12,875,000.";
    const output = (text: string) => ({ leadership: { executives: [{ name: "Scott Gawel", title: "VP and CAO", grade: "not-assessed", credibilityGrade: "not-assessed", evidence: { compensation: [{ label: "FACT", text, source: "edgar:8-K officer", asOf: "2026-04-27" }] } }] } });
    const verified = await runVerifyPass({} as PassDeps, payload, output(text));
    expect(verified.log[0]).toMatchObject({ validationStatus: "validated" });
    const wrongUnit = await runVerifyPass({} as PassDeps, payload, output(text.replace("USD 12,875,000", "12,875,000 shares")));
    expect(wrongUnit.coverage.factualValidation?.validated).toBe(0);
    for (const name of ["Donald Robertson", "Nicholas Parker"]) {
      const wrongPerson = await runVerifyPass({} as PassDeps, payload, { leadership: { executives: [{ ...output(text).leadership.executives[0], name, evidence: { compensation: [{ label: "FACT", text: text.replace("Scott Gawel", name), source: "edgar:8-K officer", asOf: "2026-04-27" }] } }] } });
      expect(wrongPerson.coverage.factualValidation?.validated).toBe(0);
    }
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
