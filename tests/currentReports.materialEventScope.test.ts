import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { splitEightKItems } from "@/edgar/currentReports";
import { parseDocument } from "@/edgar/extract";
import { collectCurrentReports, type CurrentReports } from "@/providers/currentReports";
import { createEdgarClient, type EdgarFiling } from "@/providers/edgar";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { runStageB } from "@/pipeline/compute";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { FilingDisclosuresSchema, ReportSchema, type FilingDisclosures } from "@/report/schema";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import { ReportView } from "@/components/report/ReportView";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintHtml } from "@/report/export/printHtml";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";
import { readableHtml } from "./helpers/uiParityContract";

const eligible = ["1.01", "1.02", "2.01", "2.03", "2.05", "2.06", "3.02", "5.02", "5.07", "8.01"];
const today = "2026-10-30";
const filing = (id: number, overrides: Partial<EdgarFiling> = {}): EdgarFiling => ({
  accessionNumber: `0000000001-26-${String(id).padStart(6, "0")}`, form: "8-K", filingDate: "2026-09-16",
  reportDate: "2026-09-15", primaryDocument: "event.htm", items: "3.02", ...overrides,
});
// Synthetic source-derived structure, not exact retained QCOM HTML. The
// conditional terms model the identified September filing; issuer controls
// deliberately use generic names. No network source acquisition is performed.
const terms = (issuer: string) => `On September 15, 2026, ${issuer} issued a warrant exercisable at $0.01 per share, subject to vesting only if the customer purchases up to $60 billion of products under the agreement. The purchase ceiling is conditional and is not a guaranteed commitment.`;
const html = (title = "Unregistered Sale of Equity Securities", issuer = "Example Semiconductor") =>
  `<html><body><p>Date of Report (Date of earliest event reported) September 15, 2026</p><h2>Item 3.02 ${title}</h2><p>${terms(issuer)}</p><h2>Item 9.01 Financial Statements and Exhibits</h2><p>EXHIBIT SENTINEL</p><h2>SIGNATURES</h2></body></html>`;

async function collect(rows: EdgarFiling[], documents: Record<string, string> = {}) {
  const requested: string[] = [];
  const client = createEdgarClient({ maxRps: 10000, transport: { async fetchText(url) {
    requested.push(url);
    const row = rows.find(f => url.includes(f.accessionNumber.replaceAll("-", "")));
    const body = row ? documents[row.accessionNumber] ?? html() : undefined;
    return { status: body === undefined ? 404 : 200, body: body ?? "unavailable", fetchedAt: `${today}T12:00:00.000Z`, stale: false, fromCache: false };
  } } });
  const result = await collectCurrentReports(client, "1", rows, today, "https://data.sec.gov/submissions/CIK0000000001.json");
  if (!result.ok) throw new Error(result.gap.reason);
  return { result, data: result.value.data, requested };
}
function bundleOf(data: CurrentReports) {
  const bundle = completeCurrencyBundle({ annualCurrency: "USD" });
  bundle.builtAt = `${today}T12:00:00.000Z`;
  bundle.edgar.currentReports = { ok: true, value: { data, source: "edgar", asOf: today, fetchedAt: bundle.builtAt, endpoint: "https://data.sec.gov/submissions/CIK0000000001.json" } };
  return bundle;
}
function outputs(disclosures: FilingDisclosures | undefined) {
  const report = loadTask28Fixture();
  report.filingDisclosures = disclosures;
  const before = JSON.stringify(report);
  const rendered = {
    classic: readableHtml(renderToStaticMarkup(createElement(ReportView, { report, layout: "classic" }))).text,
    dossier: readableHtml(renderToStaticMarkup(createElement(ReportView, { report, layout: "dossier" }))).text,
    markdown: reportToMarkdown(report).replace(/\\(.)/g, "$1"),
    print: readableHtml(reportToPrintHtml(report, { autoPrint: false })).text,
    audit: reportToAuditMarkdown(report).replace(/\\(.)/g, "$1"),
  };
  expect(JSON.stringify(report)).toBe(before);
  return rendered;
}

describe("recorded material-event eligibility and bounded Item 3.02", () => {
  it.each([
    ["Unregistered Sale of Equity Securities", "Example Semiconductor"],
    ["Unregistered Sales of Equity Securities", "Example Semiconductor"],
    ["Unregistered Sale of Equity Securities", "Renamed Devices"],
  ])("fetches a 3.02-only candidate and retains its %s section for %s", async (title, issuer) => {
    const row = filing(1);
    const { data, requested } = await collect([row], { [row.accessionNumber]: html(title, issuer) });
    expect(requested).toEqual(["https://www.sec.gov/Archives/edgar/data/1/000000000126000001/event.htm"]);
    expect(data.events).toHaveLength(1);
    expect(data.events[0]!.sections).toMatchObject([{ item: "3.02", text: terms(issuer), summary: terms(issuer).split(" The purchase")[0] }]);
    expect(data.events[0]).toMatchObject({ eventDate: "2026-09-15", items: ["3.02"], url: requested[0] });
    expect(data.materialEventItems).toEqual(eligible);
    const bundle = bundleOf(data), before = JSON.stringify(bundle);
    const d = FilingDisclosuresSchema.parse(buildFilingDisclosures(bundle));
    expect(d.materialEventItems).toEqual(eligible);
    const report = loadTask28Fixture();
    report.filingDisclosures = d;
    expect(ReportSchema.parse(report).filingDisclosures?.materialEventItems).toEqual(eligible);
    const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
    const excerpt = payload.filings.find(f => f.source === `edgar:8-K ${row.accessionNumber}`);
    expect(excerpt?.text).toContain(terms(issuer));
    expect(excerpt?.text).not.toContain("EXHIBIT SENTINEL");
    expect(d.events[0]!.summary).toContain("subject to vesting only if");
    expect(JSON.stringify(bundle)).toBe(before);
  });

  it("records the same complete filter that admits candidates and retains sections, including existing 5.07", async () => {
    const titles = ["Entry into a Material Definitive Agreement", "Termination of a Material Definitive Agreement", "Completion of Acquisition or Disposition of Assets", "Creation of a Direct Financial Obligation", "Costs Associated with Exit or Disposal Activities", "Material Impairments", "Unregistered Sales of Equity Securities", "Departure of Directors or Certain Officers", "Submission of Matters to a Vote of Security Holders", "Other Events"];
    const rows = eligible.map((items, i) => filing(i + 1, { items }));
    const documents = Object.fromEntries(rows.map((f, i) => [f.accessionNumber, `<p>Form 8-K Current Report</p><h2>Item ${f.items} ${titles[i]}</h2><p>Retained event body.</p>`]));
    const { data, requested } = await collect(rows, documents);
    expect(requested).toHaveLength(10);
    expect(data.events.map(e => e.sections[0]?.item).sort()).toEqual(eligible);
    expect(data.materialEventItems).toEqual(eligible);
  });

  it.each([
    "The disclosure under Item 3.02 Unregistered Sales of Equity Securities is incorporated here by reference.",
    'Please see "Item 3.02 Unregistered Sale of Equity Securities" for a discussion of the terms.',
    "The information in Item 3.02 Unregistered Sales of Equity Securities is incorporated by reference.",
    'The title "Item 3.02 Unregistered Sales of Equity Securities" identifies a disclosure elsewhere.',
    "Item 3.02 Unregistered Sales of Equity Securities is incorporated here by reference.",
    "Item 3.02 Unregistered Salesperson of Equity Securities has no valid title.",
  ])("does not create or truncate a section for embedded reference / false title: %s", reference => {
    expect(splitEightKItems(reference)).toEqual([]);
    const sections = splitEightKItems(`Item 1.01 Entry into a Material Definitive Agreement. Agreement before. ${reference} Agreement after. Item 8.01 Other Events. Other body. SIGNATURES Signed.`);
    expect(sections.map(s => s.item)).toEqual(["1.01", "8.01"]);
    expect(sections[0]!.text).toContain("Agreement after.");
    expect(sections[1]!.text).toBe("Other body.");
  });

  const bodyIntroductions = [
    "Below are the conditions governing the warrant. Vesting requires customer purchases.",
    "Above are the terms incorporated into the agreement. The operative conditions remain effective.",
    "In this report the issuer describes the conditional agreement. No unconditional commitment is established.",
    "In this Form 8-K the issuer reports a separate event. The retained body belongs to this section.",
    "Below are set forth the conditions governing the warrant. Vesting remains conditional.",
  ];
  const headingControls = [
    ["3.02", "Unregistered Sale of Equity Securities"],
    ["3.02", "Unregistered Sales of Equity Securities"],
    ["1.01", "Entry into a Material Definitive Agreement"],
    ["5.02", "Departure of Directors or Certain Officers"],
    ["5.07", "Submission of Matters to a Vote of Security Holders"],
    ["8.01", "Other Events"],
  ];
  it.each(headingControls.flatMap(([item, title]) => bodyIntroductions.flatMap(body => [".", ""].map(separator => [item, title, body, separator]))))(
    "retains the complete genuine %s / %s body beginning %s after title separator '%s'",
    (item, title, body, separator) => {
      const next = item === "8.01" ? "5.07 Submission of Matters to a Vote of Security Holders" : "8.01 Other Events";
      const source = `Item 2.06 Material Impairments. Earlier body.\nItem ${item} ${title}${separator}\n${body}\nItem ${next}. Following body. SIGNATURES Signed.`;
      const sections = splitEightKItems(source);
      expect(sections.map(s => s.item)).toEqual(["2.06", item, next.slice(0, 4)]);
      expect(sections.map(s => s.text)).toEqual(["Earlier body.", body, "Following body."]);
    });

  it.each(["Unregistered Sale of Equity Securities", "Unregistered Sales of Equity Securities"].flatMap(title => [
    `The disclosures required by Item 3.02 ${title} are set forth in this agreement.`,
    `The matters addressed by Item 3.02 ${title} were described in the agreement.`,
    `The information prescribed by Item 3.02 ${title} has been incorporated into this agreement.`,
  ]))("rejects a grammatical reference continuation and preserves its entire enclosing item: %s", reference => {
    expect(splitEightKItems(reference)).toEqual([]);
    const body = `Agreement before. ${reference} Agreement after.`;
    const sections = splitEightKItems(`Item 1.01 Entry into a Material Definitive Agreement. ${body} Item 8.01 Other Events. Other body. SIGNATURES Signed.`);
    expect(sections.map(s => s.item)).toEqual(["1.01", "8.01"]);
    expect(sections.map(s => s.text)).toEqual([body, "Other body."]);
  });

  it.each(["Unregistered Sale of Equity Securities", "Unregistered Sales of Equity Securities"])("keeps a completed %s heading and its Below body through real collection", async title => {
    const row = filing(1);
    const source = html(title).replace(`${title}</h2>`, `${title}.</h2>`).replace(terms("Example Semiconductor"), `Below are the conditions governing the warrant. ${terms("Example Semiconductor")}`);
    const { data } = await collect([row], { [row.accessionNumber]: source });
    expect(data.events[0]!.sections.map(s => [s.item, s.text])).toEqual([["3.02", `Below are the conditions governing the warrant. ${terms("Example Semiconductor")}`]]);
    expect(data.notes.join(" ")).not.toContain("no item heading could be read");
  });

  const dateNameBodies = [
    "May 15, 2026: the company issued a warrant subject to vesting conditions.",
    "May 28, 2026: the issuer disclosed a conditional warrant agreement.",
    "Will Smith signed an employment agreement with the company.",
    "Will Rivera signed an employment agreement with the registrant.",
    "May Nguyen became an officer subject to the disclosed employment terms.",
  ];
  it.each(headingControls.slice(0, 2).concat([["5.02", "Departure of Directors or Certain Officers"]]).flatMap(([item, title]) => dateNameBodies.flatMap(body => ["\n", " "].map(space => [item, title, body, space]))))(
    "retains the genuine %s / %s date/name-led body %s (separator %j)",
    (item, title, body, space) => {
      const source = `Item 2.06 Material Impairments. Earlier body. Item ${item} ${title}${space}${body} Item 8.01 Other Events. Other body. SIGNATURES Signed.`;
      expect(splitEightKItems(source).map(s => [s.item, s.text])).toEqual([["2.06", "Earlier body."], [item, body], ["8.01", "Other body."]]);
    });

  it.each([
    ["3.02", "Unregistered Sale of Equity Securities", dateNameBodies[0]],
    ["3.02", "Unregistered Sales of Equity Securities", dateNameBodies[1]],
    ["5.02", "Departure of Directors or Certain Officers", dateNameBodies[2]],
    ["5.02", "Departure of Directors or Certain Officers", dateNameBodies[3]],
    ["5.02", "Departure of Directors or Certain Officers", dateNameBodies[4]],
  ])("retains %s / %s and exact date/name body %s through real offline collection", async (item, title, body) => {
    const row = filing(1, { items: `${item},8.01` });
    const source = `<p>Form 8-K Current Report</p><h2>Item 2.06 Material Impairments</h2><p>Earlier body.</p><h2>Item ${item} ${title}</h2><p>${body}</p><h2>Item 8.01 Other Events.</h2><p>Other body.</p><h2>SIGNATURES</h2><p>Signed.</p>`;
    const { data } = await collect([row], { [row.accessionNumber]: source });
    expect(data.events[0]!.sections.map(s => [s.item, s.text])).toEqual([["2.06", "Earlier body."], [item, body], ["8.01", "Other body."]]);
  });

  it.each(["Unregistered Sale of Equity Securities", "Unregistered Sales of Equity Securities"].flatMap(title => ["above", "below"].flatMap(position => [
    `The disclosures required by Item 3.02 ${title} ${position} are incorporated by reference.`,
    `The disclosures required by Item 3.02 ${title} ${position} were set forth in this agreement.`,
    `The disclosures required by Item 3.02 ${title} ${position} have been described in this agreement.`,
  ])))("rejects a relative-position modifier plus predicate while preserving the complete enclosing body: %s", reference => {
    expect(splitEightKItems(reference)).toEqual([]);
    const body = `Agreement before. ${reference} Agreement after.`;
    expect(splitEightKItems(`Item 1.01 Entry into a Material Definitive Agreement. ${body} Item 8.01 Other Events. Other body.`).map(s => [s.item, s.text]))
      .toEqual([["1.01", body], ["8.01", "Other body."]]);
  });

  it.each(["may be incorporated", "will be described", "can be set forth", "has not been incorporated", "are being described"])("keeps demonstrable auxiliary-chain references rejected: %s", predicate => {
    const reference = `The disclosures required by Item 3.02 Unregistered Sales of Equity Securities ${predicate} in this agreement.`;
    expect(splitEightKItems(reference)).toEqual([]);
    const body = `Agreement before. ${reference} Agreement after.`;
    expect(splitEightKItems(`Item 1.01 Entry into a Material Definitive Agreement. ${body} Item 8.01 Other Events. Other body.`).map(s => [s.item, s.text]))
      .toEqual([["1.01", body], ["8.01", "Other body."]]);
  });

  it.each(["h2", "p", "table"].flatMap(shape => ["", "."].map(separator => [shape, separator])))("uses matching visible %s heading boundaries (separator '%s') for Below-passive bodies through the actual collector", async (shape, separator) => {
    const body = "Below are set forth the conditions governing the warrant. Vesting remains conditional.";
    const title = `Item 3.02 Unregistered Sale of Equity Securities${separator}`;
    const heading = shape === "table" ? `<table><tr><td>Item 3.02</td><td>Unregistered Sale of Equity Securities${separator}</td></tr></table>` : `<${shape}>${title}</${shape}>`;
    const source = `<p>Form 8-K cover text without terminal punctuation</p>${heading}<p>${body}</p><h2>Item 8.01 Other Events.</h2><p>Other body.</p>`;
    const { data } = await collect([filing(1)], { [filing(1).accessionNumber]: source });
    expect(data.events[0]!.sections.map(s => [s.item, s.text])).toEqual([["3.02", body], ["8.01", "Other body."]]);
  });

  it("requires exact source-text/coordinate consistency before source context can establish a heading", () => {
    const reference = "The disclosures required by Item 3.02 Unregistered Sales of Equity Securities below are incorporated by reference.";
    const document = parseDocument("<p>The disclosures required by</p><h2>Item 3.02 Unregistered Sales of Equity Securities</h2><p>below are incorporated by reference.</p>");
    // Same visible bytes, but actual source blocks place the title on its own.
    expect(document.fullText).toBe(reference);
    expect(splitEightKItems(reference, document).map(s => [s.item, s.text])).toEqual([["3.02", "below are incorporated by reference."]]);
    expect(splitEightKItems(reference)).toEqual([]);
    const different = parseDocument("<h2>Item 3.02 Unregistered Sales of Equity Securities</h2><p>Different body.</p>");
    expect(splitEightKItems(reference, different)).toEqual([]);
    // A forged/mismatched pre/fullText pair must not confer source proof either.
    expect(splitEightKItems(reference, { ...different, fullText: reference })).toEqual([]);
  });

  it.each(["script", "style", "comment", "inline-style"])("does not use a hidden %s title as visible source-heading proof", hidden => {
    const title = "<h2>Item 3.02 Unregistered Sales of Equity Securities</h2>";
    const fake = hidden === "comment" ? `<!--${title}-->` : hidden === "inline-style" ? `<div style="display:none">${title}</div>` : `<${hidden}>${title}</${hidden}>`;
    const reference = "The disclosures required by Item 3.02 Unregistered Sales of Equity Securities below are incorporated by reference.";
    const document = parseDocument(`${fake}<p>${reference}</p>`);
    expect(document.fullText).toBe(reference);
    expect(splitEightKItems(document.fullText, document)).toEqual([]);
  });

  it.each(["hidden", 'hidden=""', "HIDDEN", 'hidden="until-found"'])("does not let an actual %s attribute confer source-heading proof", attribute => {
    const reference = "The disclosures required by Item 3.02 Unregistered Sales of Equity Securities below are incorporated by reference.";
    const document = parseDocument(`<p>The disclosures required by</p><div ${attribute}><h2>Item 3.02 Unregistered Sales of Equity Securities</h2></div><p>below are incorporated by reference.</p>`);
    // Global preprocessing retains this attribute's text. It cannot be
    // upgraded locally into proof that the title was a visible heading.
    expect(document.fullText).toBe(reference);
    expect(splitEightKItems(document.fullText, document)).toEqual([]);
  });

  it("does not mistake hidden inside an attribute value for a hidden attribute", () => {
    const document = parseDocument('<p>The disclosures required by</p><h2 title="a hidden keyword in an ordinary value">Item 3.02 Unregistered Sales of Equity Securities</h2><p>below are incorporated by reference.</p>');
    expect(splitEightKItems(document.fullText, document).map(s => [s.item, s.text])).toEqual([["3.02", "below are incorporated by reference."]]);
  });

  it("preserves inline title markup inside a standalone paragraph without inventing boundaries from quoted tags", () => {
    const document = parseDocument('<p>The disclosures required by</p><p title="quoted <div> tag"><b>Item 3.02</b><span>Unregistered Sales of Equity Securities</span></p><p>below are incorporated by reference.</p>');
    expect(splitEightKItems(document.fullText, document).map(s => [s.item, s.text])).toEqual([["3.02", "below are incorporated by reference."]]);
    const reference = parseDocument('<p title="quoted <h2> tag">The disclosures required by Item 3.02 Unregistered Sales of Equity Securities below are incorporated by reference.</p>');
    expect(splitEightKItems(reference.fullText, reference)).toEqual([]);
  });

  it("keeps the main inline heading when a modifier-led body's role lacks positive reference evidence", () => {
    const body = "Below are set forth the conditions governing the warrant. Vesting remains conditional.";
    const source = `Form 8-K cover text without terminal punctuation Item 3.02 Unregistered Sale of Equity Securities ${body} Item 8.01 Other Events. Other body.`;
    expect(splitEightKItems(source).map(s => [s.item, s.text])).toEqual([["3.02", body], ["8.01", "Other body."]]);
  });

  it("does not make declining hidden-attribute document proof a new rejection of a genuine body", async () => {
    const body = "Below are set forth the conditions governing the warrant. Vesting remains conditional.";
    const source = `<div hidden>Form 8-K cover text</div><h2>Item 3.02 Unregistered Sale of Equity Securities</h2><p>${body}</p><h2>Item 8.01 Other Events.</h2><p>Other body.</p>`;
    const { data } = await collect([filing(1)], { [filing(1).accessionNumber]: source });
    expect(data.events[0]!.sections.map(s => [s.item, s.text])).toEqual([["3.02", body], ["8.01", "Other body."]]);
  });

  it.each(["Unregistered Sale of Equity Securities", "Unregistered Sales of Equity Securities"].flatMap(title => [
    `The disclosures required by Item 3.02 ${title} are shown below.`,
    `The disclosures required by Item 3.02 ${title} are given in this agreement.`,
    `The disclosures required by Item 3.02 ${title} have been made in this agreement.`,
  ]))("uses strong reference context for irregular predicates without truncating enclosing sections: %s", reference => {
    expect(splitEightKItems(reference)).toEqual([]);
    const body = `Agreement before. ${reference} Agreement after.`;
    const source = `Item 2.06 Material Impairments. Earlier body. Item 1.01 Entry into a Material Definitive Agreement. ${body} Item 8.01 Other Events. Other body.`;
    const wanted = [["2.06", "Earlier body."], ["1.01", body], ["8.01", "Other body."]];
    expect(splitEightKItems(source).map(s => [s.item, s.text])).toEqual(wanted);
    const document = parseDocument(`<p>Item 2.06 Material Impairments. Earlier body.</p><p>Item 1.01 Entry into a Material Definitive Agreement. ${body}</p><p>Item 8.01 Other Events. Other body.</p>`);
    expect(splitEightKItems(document.fullText, document).map(s => [s.item, s.text])).toEqual(wanted);
  });

  it("requires the real collector's forwarded document to preserve a structurally separate heading after a passive link", async () => {
    const body = "below are incorporated by reference.";
    const source = `<p>Form 8-K Current Report.</p><p>The disclosures required by</p><h2>Item 3.02 Unregistered Sales of Equity Securities</h2><p>${body}</p><h2>Item 8.01 Other Events.</h2><p>Other body.</p>`;
    const document = parseDocument(source);
    // The exact flattened source has a grammatical reference without the
    // actual document's separately bounded heading block.
    expect(splitEightKItems(document.fullText).map(s => [s.item, s.text])).toEqual([["8.01", "Other body."]]);
    const { data } = await collect([filing(1)], { [filing(1).accessionNumber]: source });
    expect(data.events[0]!.sections.map(s => [s.item, s.text])).toEqual([["3.02", body], ["8.01", "Other body."]]);
  });

  it("preserves main for an irregular inline role with no strong reference context", () => {
    const source = "Item 3.02 Unregistered Sales of Equity Securities are shown below. Item 8.01 Other Events. Other body.";
    expect(splitEightKItems(source).map(s => [s.item, s.text])).toEqual([["3.02", "are shown below."], ["8.01", "Other body."]]);
  });

  it("preserves amendments, cutoff/window, read cap, omitted identities and error paths", async () => {
    const annual = filing(90, { form: "10-K", filingDate: "2026-01-01", items: undefined });
    const admitted = Array.from({ length: 11 }, (_, i) => filing(i + 1, { filingDate: `2026-09-${String(30 - i).padStart(2, "0")}`, ...(i === 0 ? { form: "8-K/A" } : {}) }));
    const excluded = [filing(91, { filingDate: "2026-10-31" }), filing(92, { filingDate: "2025-12-31" }), filing(93, { form: "10-Q" }), filing(94, { items: "9.01" })];
    const documents = {
      [admitted[0]!.accessionNumber]: html(),
      [admitted[1]!.accessionNumber]: "<p>Form 8-K Current Report. No headings retained.</p>",
      [admitted[2]!.accessionNumber]: "<h2>Item 3.02 Unregistered Sales of Equity Securities</h2><p>" + "Long conditional terms. ".repeat(300) + "</p>",
      [admitted[3]!.accessionNumber]: "", // actually unreadable, not an inferred no-event finding
    };
    const { data, requested } = await collect([annual, ...admitted, ...excluded], documents);
    expect(requested).toHaveLength(10);
    for (const f of [admitted[10]!, ...excluded]) expect(requested.some(url => url.includes(f.accessionNumber.replaceAll("-", "")))).toBe(false);
    expect(data.events[0]?.form).toBe("8-K/A");
    expect(data.notes.join(" ")).toMatch(/limited to 10 of 11.*0000000001-26-000011/);
    expect(data.notes.join(" ")).toMatch(/no item heading could be read/);
    expect(data.notes.join(" ")).toMatch(/retained 4000 of .*source characters/);
    expect(data.notes.join(" ")).toMatch(/primary document unreadable/);
    const withoutAnnual = await collect([filing(95, { filingDate: "2025-10-29" }), filing(96)]);
    expect(withoutAnnual.requested).toHaveLength(1);
  });
});

describe("immutable scope evidence across five readers", () => {
  it("shows the newly recorded full eligibility without changing numeric computation or source/manifest inventories", async () => {
    const { data } = await collect([filing(1)]);
    const bundle = bundleOf(data), legacy = structuredClone(bundle);
    if (!legacy.edgar.currentReports?.ok) throw new Error("missing controlled current reports");
    delete legacy.edgar.currentReports.value.data.materialEventItems;
    const computed = runStageB(bundle), legacyComputed = runStageB(legacy);
    expect(computed).toEqual(legacyComputed);
    expect(assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] })).toEqual(
      assembleContextPayload(legacy, legacyComputed, { checks: [], flags: [], gaps: [] }));
    const d = buildFilingDisclosures(bundle)!;
    for (const [name, out] of Object.entries(outputs(d))) {
      expect(out, name).toContain("Recorded eligible material-event item filter: Items 1.01, 1.02, 2.01, 2.03, 2.05, 2.06, 3.02, 5.02, 5.07, 8.01.");
      expect(out, name).toContain("subject to vesting only if");
      expect(out, name).not.toContain("EXHIBIT SENTINEL");
    }
    const legacyD = buildFilingDisclosures(legacy)!;
    expect(d.notes).toEqual(legacyD.notes);
    expect(d.events).toEqual(legacyD.events);
  });

  it.each([false, true])("uses only the saved filter with empty events=%s and preserves financial/source/count state", async empty => {
    const { data } = await collect([filing(1)]);
    const bundle = bundleOf(data);
    const d = buildFilingDisclosures(bundle)!;
    d.materialEventItems = ["5.07", "1.01", "5.07"];
    if (empty) d.events = [];
    const reportBefore = JSON.stringify(d);
    const tables = filingDisclosureTables(d, "catalystsRisks");
    expect(tables[0]!.rows).toHaveLength(empty ? 0 : 1);
    for (const [name, out] of Object.entries(outputs(d))) {
      expect(out, name).toContain("Recorded eligible material-event item filter: Items 1.01, 5.07.");
      expect(out, name).toContain("completeness of SEC event review is not established");
      expect(out, name).not.toContain("Items 1.01, 1.02");
      expect(out, name).not.toContain("No material events");
    }
    expect(JSON.stringify(d)).toBe(reportBefore);
  });

  it.each(["legacy-rows", "legacy-empty", "absent"])("shows unknown non-exhaustive scope for %s without backfill or fabricated rows", async state => {
    const { data } = await collect([filing(1)]);
    delete data.materialEventItems;
    data.events[0]!.items = ["3.02", "5.07", "9.01"];
    const bundle = bundleOf(data), before = JSON.stringify(bundle);
    const d = buildFilingDisclosures(bundle)!;
    expect(d.materialEventItems).toBeUndefined();
    if (state === "legacy-empty") d.events = [];
    const evidence = state === "absent" ? undefined : d;
    const tables = filingDisclosureTables(evidence, "catalystsRisks");
    expect(tables[0]!.rows).toHaveLength(state === "legacy-rows" ? 1 : 0);
    for (const [name, out] of Object.entries(outputs(evidence))) {
      expect(out, name).toContain("The saved report did not record its material-event item filter");
      expect(out, name).toContain("completeness of SEC event review is not established");
      expect(out, name).not.toContain("Recorded eligible material-event item filter");
      expect(out, name).not.toContain("No material events");
    }
    expect(JSON.stringify(bundle)).toBe(before);
  });

  it.each([[], ["3.02", "<script>untrusted</script>"], ["9.01"], "3.02", null].map(value => [value]))("treats unusable metadata as unknown and never renders untrusted codes: %j", async value => {
    const { data } = await collect([filing(1)]);
    Object.assign(data, { materialEventItems: value });
    const d = buildFilingDisclosures(bundleOf(data))!;
    expect(d.materialEventItems).toBeUndefined();
    Object.assign(d, { materialEventItems: value });
    expect(FilingDisclosuresSchema.safeParse(d).success).toBe(false);
    for (const out of Object.values(outputs(d))) {
      expect(out).toContain("The saved report did not record its material-event item filter");
      expect(out).not.toContain("<script>untrusted</script>");
    }
  });
});
