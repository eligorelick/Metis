import { describe, expect, it } from "vitest";
import { selectMaterialEvidence } from "@/pipeline/stageC/evidenceSelection";
import { periodicControlsText, periodicSignatureText } from "@/edgar/extract";
import { parseCompletedOfferingFacts } from "@/edgar/filingFacts";
import { buildMaterialEventFiling, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { confirmFixtureIssuer } from "./helpers/edgarIdentity";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { runStageB } from "@/pipeline/compute";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import { buildDataBundle } from "@/pipeline/dataBundle";
import { createEdgarClient, type EdgarTransport, type EdgarTransportResponse } from "@/providers/edgar";
import { createFmpClient } from "@/providers/fmp";

// Compact public primary-source phrases, surrounded by synthetic budget pressure.
const weakness = "We have identified material weaknesses in our internal control over financial reporting.";
const specifics = "The material weaknesses identified pertained to insufficient segregation of duties and a lack of sufficient qualified accounting personnel.";
const noMisstatement = "The deficiencies identified did not result in a material misstatement of the financial statements.";
const controls = `Item 4. Controls and Procedures Our disclosure controls and procedures were not effective as of June 30, 2026. As disclosed in Part II, Item 1A, ${weakness} ${noMisstatement}`;
const litigation = "On January 12, 2026, a putative class action Raymond Masaitis v. CoreWeave, Inc. et al was filed against the Company and certain officers, seeking unspecified damages.";
const defense = "The Company believes that the claims made in the Securities Action are without merit and intends to defend itself vigorously.";
const uncertainty = "Any possible loss or range of loss in these matters cannot be reasonably estimated at this time.";
const noAccrual = "As of June 30, 2026, the Company has not accrued any material potential loss.";
const signature = "SIGNATURES Pursuant to the requirements of the Exchange Act of 1934, the registrant has duly caused this Quarterly Report on Form 10-Q to be signed on its behalf. COREWEAVE, INC. Date: August 11, 2026 By: /s/ Nitin Agrawal Nitin Agrawal Chief Financial Officer";
const completion = "On September 22, 2026, CoreWeave, Inc. completed its previously announced upsized private offering of $4.2 billion aggregate principal amount of its 2.875% Convertible Senior Notes due 2033 (the Notes).";
const proceeds = "The net proceeds from the offering were $4,137.0 million, after deducting the initial purchasers’ discounts but before deducting estimated offering expenses payable by CoreWeave.";
const link = "CoreWeave used a portion of the net proceeds from the offering to fund the cost of entering into the Capped Call Transactions (as defined below).";
const cost = "The cost of the Capped Call Transactions was approximately $566.2 million.";
const offering = [completion, "Conversion terms are governed by the indenture. ".repeat(130), proceeds, link, cost].join(" ");
const filing = { accessionNumber: "0001769628-26-000432", form: "8-K", filingDate: "2026-09-22", items: "1.01" };
const url = "https://www.sec.gov/Archives/edgar/data/1769628/000176962826000432/crwv-20260917.htm";

describe("bounded CRWV filing evidence", () => {
  it("keeps asserted control weaknesses and their specifics under crowded risk budgets", () => {
    const original = `${"Revenue, customers, suppliers and regulation may affect results by $17 billion. ".repeat(2200)}\n${weakness}\n${specifics}\n${noMisstatement}`;
    const selected = selectMaterialEvidence(original, 24_000, "risk");
    expect(selected.text).toContain(weakness);
    expect(selected.text).toContain(specifics);
    expect(selected.text).toContain(noMisstatement);
    expect(selected.coverage.categories).toContainEqual(expect.objectContaining({ category: "internal-controls", status: "retained" }));
    for (const span of selected.spans) expect(original.slice(span.start, span.end)).toBe(span.text);
    expect(selected.text.length).toBeLessThanOrEqual(24_000);
  });
  it("reserves controls evidence for actual findings ahead of hypothetical weakness boilerplate", () => {
    const generic = "If material weaknesses are identified in future, customers, suppliers, competition, regulation, tax, investments, guarantees, liquidity and revenue may be adversely affected by $17 billion. ";
    const original = `${generic.repeat(1000)}\n${weakness}\n${specifics}\n${noMisstatement}`;
    const selected = selectMaterialEvidence(original, 24_000, "risk");
    for (const sentence of [weakness, specifics, noMisstatement]) expect(selected.text).toContain(sentence);
    expect(selected.text.length).toBeLessThanOrEqual(24_000);
    for (const span of selected.spans) expect(original.slice(span.start, span.end)).toBe(span.text);
  });
  it("keeps an operative named lawsuit with defense, unestimable loss and no accrual", () => {
    const original = `${"Investments, commitments and borrowings were $15 billion; litigation may arise in ordinary business. ".repeat(1000)}\n${litigation}\n${defense}\n${uncertainty}\n${noAccrual}`;
    const selected = selectMaterialEvidence(original, 14_000, "notes");
    for (const sentence of [litigation, defense, uncertainty, noAccrual]) expect(selected.text).toContain(sentence);
    expect(selected.text.length).toBeLessThanOrEqual(14_000);
    expect(selected.text).not.toMatch(/fraud was established/i);
  });
  it("reads only a bounded actual signature, preserving its dated role evidence", () => {
    expect(periodicSignatureText(`Earlier Chief Financial Officer reference. ${signature}`)).toBe(signature);
    expect(periodicSignatureText("Nitin Agrawal Chief Financial Officer")).toBeNull();
    expect(periodicSignatureText(`SIGNATURES ${"unrelated ".repeat(500)} /s/ Nitin Agrawal Chief Financial Officer`)).toBeNull();
  });
  it("keeps the controls limit past an internal Part II cross-reference", () => {
    expect(periodicControlsText(`${controls} PART II OTHER INFORMATION Item 1. Legal Proceedings unrelated litigation`)).toBe(controls);
    expect(periodicControlsText("Item 4. Controls and Procedures navigation only")).toBeNull();
  });
  it("captures the signature from the full acquired primary document beside its notes", async () => {
    const response = (body: string): EdgarTransportResponse => ({ status: 200, body, fetchedAt: "2026-10-16T00:00:00.000Z", fromCache: false, stale: false });
    const transport: EdgarTransport = { fetchText(url) {
      if (url.includes("company_tickers.json")) return Promise.resolve(response(JSON.stringify({ "0": { cik_str: 1769628, ticker: "CRWV", title: "CoreWeave" } })));
      if (url.includes("submissions/")) return Promise.resolve(response(JSON.stringify({ cik: "0001769628", name: "CoreWeave", tickers: ["CRWV"], exchanges: ["Nasdaq"], filings: { files: [], recent: { accessionNumber: ["0001769628-26-000366"], filingDate: ["2026-08-12"], reportDate: ["2026-06-30"], form: ["10-Q"], primaryDocument: ["crwv-20260630.htm"] } } })));
      if (url.includes("companyfacts/")) return Promise.resolve(response(JSON.stringify({ cik: 1769628, entityName: "CoreWeave", facts: {} })));
      return Promise.resolve(response(`<html><body><h1>PART I</h1><h2>Item 1. Financial Statements</h2><h3>Notes to Condensed Consolidated Financial Statements</h3><p>${"The Company reports its debt and commitments. ".repeat(100)}</p><h2>Item 2. Management's Discussion and Analysis</h2><p>${"Revenue increased during the quarter. ".repeat(100)}</p><h2>Item 3. Quantitative and Qualitative Disclosures</h2><p>${controls}</p><h1>PART II OTHER INFORMATION</h1><h2>Item 1. Legal Proceedings</h2><p>See notes.</p><h2>Item 5. Other Information</h2><p>${"No trading arrangements were adopted. ".repeat(8)}</p><h2>Item 6. Exhibits</h2><p>Exhibit index.</p><p>${signature}</p></body></html>`));
    } };
    const unavailable = (): Promise<Response> => Promise.resolve(new Response("not available in test", { status: 404 }));
    const bundle = await buildDataBundle("CRWV", { now: () => new Date("2026-10-16T00:00:00.000Z"), fmp: createFmpClient({ apiKey: "" }), edgar: createEdgarClient({ transport }), keyless: false,
      fred: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 }, finnhub: { fetchImpl: unavailable, retryDelaysMs: [] }, finra: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 } });
    expect(bundle.edgar.tenQNotes).toMatchObject({ ok: true, value: { source: "edgar", data: { signaturesText: signature, controlsText: controls, accession: "0001769628-26-000366" } } });
  });
  it("cites the matched primary signature while leaving management metrics unchanged", () => {
    const bundle = completeCurrencyBundle({ symbol: "CRWV", siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    bundle.builtAt = "2026-10-16T00:00:00.000Z";
    confirmFixtureIssuer(bundle, 1769628);
    const accession = "0001769628-26-000366", documentUrl = "https://www.sec.gov/Archives/edgar/data/1769628/000176962826000366/crwv-20260630.htm";
    bundle.edgar.latestTenQ = { ok: true, value: { source: "edgar", asOf: "2026-06-30", fetchedAt: bundle.builtAt, endpoint: "fixture:submissions", data: { accessionNumber: accession, form: "10-Q", filingDate: "2026-08-12", reportDate: "2026-06-30", primaryDocument: "crwv-20260630.htm" } } };
    const computed = runStageB(bundle);
    bundle.edgar.tenQNotes = { ok: true, value: { source: "edgar", asOf: "2026-06-30", fetchedAt: bundle.builtAt, endpoint: `${documentUrl} (10-Q Item 1)`, data: { sectionName: "tenQNotes", text: "Notes", chars: 5, method: "header-regex", accession, form: "10-Q", filingDate: "2026-08-12", reportDate: "2026-06-30", documentUrl, signaturesText: signature, controlsText: controls } } };
    expect(runStageB(bundle)).toEqual(computed);
    const validation = { checks: [], flags: [], gaps: [] } as unknown as ValidationReport;
    const payload = assembleContextPayload(bundle, computed, validation);
    expect(payload.filings.find(f => f.source === `edgar:10-Q signatures ${accession}`)).toMatchObject({ asOf: "2026-08-12", text: signature });
    expect(payload.citationRegistry?.some(f => f.id === `edgar:10-Q signatures ${accession}`)).toBe(true);
    expect(payload.filings.find(f => f.source === `edgar:10-Q item4 ${accession}`)?.text).toContain(noMisstatement);
    bundle.edgar.tenQNotes.value.data.documentUrl = "https://example.com/foreign.htm";
    expect(assembleContextPayload(bundle, computed, validation).filings.some(f => f.source.includes("signatures"))).toBe(false);
  });
  it("extracts completed financing terms before the narrative retention limit", () => {
    const event = buildMaterialEventFiling(filing, `Item 1.01 Entry into a Material Definitive Agreement. ${offering}`, url);
    expect(event.sections[0]!.text).not.toContain(proceeds);
    expect(event.sections[0]!.financingFacts?.map(f => f.value)).toEqual([4.2e9, 4.137e9, 566.2e6, 3.5708e9]);
    const facts = parseCompletedOfferingFacts(offering, filing.filingDate);
    expect(facts.every(f => f.asOf === "2026-09-22")).toBe(true);
    expect(facts.at(-1)).toMatchObject({ qualifier: "approximately", computed: "4137000000 - 566200000 = 3570800000" });
    expect(facts.at(-1)?.label).toMatch(/before issuer expenses and subsequent uses/i);
  });
  it.each([
    offering.replace("completed", "expects to complete"),
    offering.replace("completed its", "has not completed its"),
    offering.replace("completed its", "had never completed its"),
    offering.replace("CoreWeave, Inc.", "Other Issuer, Inc."),
    offering.replace("payable by CoreWeave", "payable by Other Issuer"),
    offering.replace("CoreWeave used", "Other Issuer used"),
    offering.replace("payable by CoreWeave.", "payable by CoreWeave, LLC."),
    offering.replace("CoreWeave used", "CoreWeave, LLC used"),
    offering.replace("before deducting", "after deducting"),
    offering.replace("$566.2", "€566.2"),
    offering.replace("September 22, 2026", "September 23, 2026"),
    `${offering} ${proceeds}`,
  ])("withholds unsupported or ambiguous completed financing arithmetic", text => {
    expect(parseCompletedOfferingFacts(text, filing.filingDate)).toEqual([]);
  });
  it("binds a printed legal-entity alias consistently to its proceeds and capped-call use", () => {
    const aliased = offering.replace("CoreWeave, Inc. completed", 'CoreWeave, Inc. ("CoreWeave") completed');
    expect(parseCompletedOfferingFacts(aliased, filing.filingDate).map(f => f.value)).toEqual([4.2e9, 4.137e9, 566.2e6, 3.5708e9]);
    expect(parseCompletedOfferingFacts(aliased, filing.filingDate, "COREWEAVE, INC.")).toHaveLength(4);
    expect(parseCompletedOfferingFacts(aliased, filing.filingDate, "CoreWeave, LLC")).toEqual([]);
    const foreignAlias = offering.replace("CoreWeave, Inc. completed", 'Other Issuer, Inc. ("CoreWeave") completed');
    expect(parseCompletedOfferingFacts(foreignAlias, filing.filingDate, "CoreWeave, Inc.")).toEqual([]);
  });
  it.each([
    offering.replace("completed its", "has not completed its"),
    offering.replace("CoreWeave, Inc.", "Other Issuer, Inc."),
    offering.replaceAll("CoreWeave", "Other Issuer"),
    offering.replace("CoreWeave, Inc.", "CoreWeave, LLC"),
    offering.replace("CoreWeave, Inc. completed", 'Other Issuer, Inc. ("CoreWeave") completed'),
  ])("never admits negated or third-party financing under a valid issuer filing URL", text => {
    const bundle = completeCurrencyBundle({ symbol: "CRWV", siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    bundle.builtAt = "2026-10-16T00:00:00.000Z";
    confirmFixtureIssuer(bundle, 1769628);
    if (!bundle.edgar.cik.ok) throw new Error("fixture issuer missing");
    bundle.edgar.cik.value.data.title = "CoreWeave, Inc.";
    const event = buildMaterialEventFiling(filing, `Item 1.01 Entry into a Material Definitive Agreement. ${text}`, url);
    bundle.edgar.currentReports = { ok: true, value: { source: "edgar", asOf: filing.filingDate, fetchedAt: bundle.builtAt, endpoint: "fixture:currentReports", data: { version: CURRENT_REPORTS_VERSION, releases: [], events: [event], notes: [] } } };
    expect(buildFilingDisclosures(bundle)?.filingFacts?.filter(f => f.key.startsWith("financing-")) ?? []).toEqual([]);
  });
  it("propagates typed dated transaction facts without changing historical cash or runway inputs", () => {
    const bundle = completeCurrencyBundle({ symbol: "CRWV", burning: true, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    bundle.builtAt = "2026-10-16T00:00:00.000Z";
    confirmFixtureIssuer(bundle, 1769628);
    if (!bundle.edgar.cik.ok) throw new Error("fixture issuer missing");
    bundle.edgar.cik.value.data.title = "CoreWeave, Inc.";
    const runway = runStageB(bundle).runway;
    expect(runway).not.toBeNull();
    const event = buildMaterialEventFiling(filing, `Item 1.01 Entry into a Material Definitive Agreement. ${offering}`, url);
    bundle.edgar.currentReports = { ok: true, value: { source: "edgar", asOf: filing.filingDate, fetchedAt: bundle.builtAt, endpoint: "fixture:currentReports", data: { version: CURRENT_REPORTS_VERSION, releases: [], events: [event], notes: [] } } };
    const before = structuredClone(bundle.statements);
    const facts = buildFilingDisclosures(bundle)?.filingFacts?.filter(f => f.key.startsWith("financing-"));
    expect(facts?.map(f => f.value)).toEqual([4.2e9, 4.137e9, 566.2e6, 3.5708e9]);
    expect(facts?.every(f => f.source.url === url && f.sourceTag.includes(filing.accessionNumber))).toBe(true);
    expect(bundle.statements).toEqual(before);
    expect(runStageB(bundle).runway).toEqual(runway);
    const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] } as unknown as ValidationReport);
    expect(payload.provenanceRegistry?.find(f => f.label?.includes("offering proceeds less capped calls subtotal"))).toMatchObject({ value: 3.5708e9, asOf: "2026-09-22", currency: "USD", origin: `edgar:8-K ${filing.accessionNumber} item1.01` });
    expect(payload.filingFacts?.notes.join(" ")).toMatch(/before issuer expenses and subsequent uses; not current cash, liquidity or a runway update/i);
    if (!event.sections[0]?.financingFacts) throw new Error("fixture missing financing facts");
    event.sections[0].financingFacts[0]!.value = 8.4e9;
    expect(buildFilingDisclosures(bundle)?.filingFacts?.filter(f => f.key.startsWith("financing-")) ?? []).toEqual([]);
    event.sections[0].financingFacts[0]!.value = 4.2e9;
    event.url = "https://example.com/unconfirmed.htm";
    expect(buildFilingDisclosures(bundle)?.filingFacts?.filter(f => f.key.startsWith("financing-")) ?? []).toEqual([]);
  });
});
