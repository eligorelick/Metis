import { describe, expect, it } from "vitest";
import { parseOfficerChanges } from "@/edgar/filingFacts";
import { buildMaterialEventFiling, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
import { splitEightKItems } from "@/edgar/currentReports";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { runStageB } from "@/pipeline/compute";
import { filingGovernanceTables } from "@/report/filingSupplementPresentation";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import retained from "./fixtures/expe-cfo-transition-20260423.json";

describe("whole appointment compensation amounts", () => {
  const appointment = (amount: string, phrase = "annual base salary of") => parseOfficerChanges(`On April 23, 2026, the Company announced the appointment of Jane Doe as Chief Financial Officer, effective June 1, 2026. She will receive ${phrase} ${amount}.`)[0]?.package ?? [];

  it.each([
    ["$1.5 million", 1_500_000], ["$3.5 billion", 3_500_000_000], ["$2.25 thousand", 2_250],
    ["$1,500,000.50", 1_500_000.5], ["$1500000.75", 1_500_000.75], ["$1,500,000", 1_500_000],
  ] as const)("reads the whole explicit amount %s", (amount, value) => {
    expect(appointment(amount)).toEqual([{ component: "annual base salary", value, symbol: "$" }]);
  });

  it("uses the complete amount parser for an annual equity target too", () => {
    expect(appointment("$3.5 million", "annual equity awards with a target value of")).toEqual([{ component: "annual equity awards, target value", value: 3_500_000, symbol: "$" }]);
  });

  it.each(["$1.5 crore", "$1.5m", "$1.5e6", "$1,50,000", "$1,,500", "$1, 500", "$1.5.6 million", "$1 500 000", "$1.5 million to $2 million", "$1.5 million or $2 million", "$1.5 million, or $2 million", "$1.5-$2 million", "$-1.5 million", "EUR 1.5 million"])("withholds ambiguous or unsupported amount %s rather than a numeric prefix", (amount) => {
    expect(appointment(amount)).toEqual([]);
  });
});

describe("retained primary-source CFO transition", () => {
  it("retains the outgoing and incoming officer, distinct announcement dates, and source-defined effective date", () => {
    const changes = parseOfficerChanges(retained.text);
    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "departure", person: "Scott Schenkel", role: "Chief Financial Officer", announced: "2026-04-17", effective: "2026-05-11", anticipated: false }),
      expect.objectContaining({ kind: "appointment", person: "Derek Andersen", role: "Chief Financial Officer", announced: "2026-04-23", effective: "2026-05-11", anticipated: false }),
    ]));
    expect(changes).toHaveLength(2);
  });

  it("does not treat signing-bonus installment amounts as additional compensation terms", () => {
    const appointment = parseOfficerChanges(retained.text).find((change) => change.kind === "appointment");
    expect(appointment?.package).toEqual(expect.arrayContaining([
      { component: "annual base salary", value: 1_000_000, symbol: "$" },
      { component: "sign-on bonus", value: 2_500_000, symbol: "$" },
      { component: "new-hire restricted stock units, grant value", value: 17_000_000, symbol: "$" },
      { component: "annual equity awards, target value", value: 10_000_000, symbol: "$" },
    ]));
    expect(appointment?.package).toHaveLength(4);
  });

  it("survives the provider's retained-item boundary with source provenance", () => {
    // Explicitly synthetic biography padding exercises the provider boundary;
    // the public fixture retains only the necessary source sentences.
    const padded = retained.text.replace("Mr. Andersen will receive an annual base salary", `${"Biographical background describes prior employment. ".repeat(90)}Mr. Andersen will receive an annual base salary`);
    const sourceText = `Item 5.02. ${retained.title}. ${padded} Item 9.01. Financial Statements and Exhibits. (d) Exhibits.`;
    expect(splitEightKItems(sourceText)[0]?.text).toContain("$17,000,000");
    const event = buildMaterialEventFiling({ accessionNumber: retained.accession, form: "8-K", filingDate: retained.filingDate, items: "5.02,9.01" }, sourceText, retained.sourceUrl);
    expect(event).toMatchObject({ accession: retained.accession, url: retained.sourceUrl, filingDate: "2026-04-23" });
    expect(parseOfficerChanges(event.sections[0]!.text).find((change) => change.kind === "appointment")?.package)
      .toContainEqual({ component: "new-hire restricted stock units, grant value", value: 17_000_000, symbol: "$" });
  });

  it("does not infer a departure from a biography, proposed appointment, or unresolved date alias", () => {
    expect(parseOfficerChanges("Chief Financial Officer On April 23, 2026, the Company discussed the possible appointment of Jane Example as Chief Financial Officer.")).toEqual([]);
    const unresolved = retained.text.slice(retained.text.indexOf("Appointment of Chief Financial Officer"));
    const appointment = parseOfficerChanges(unresolved).find((change) => change.kind === "appointment");
    expect(appointment?.effective).toBeNull();
    expect(parseOfficerChanges(retained.text.replace("Mr. Schenkel would step down", "Mr. Different would step down")).some((change) => change.kind === "departure")).toBe(false);
  });

  it("does not choose among conflicting Effective Date definitions", () => {
    const ambiguous = retained.text + '\nOther terms are effective June 15, 2026 (the "Effective Date").';
    expect(parseOfficerChanges(ambiguous).find((change) => change.kind === "appointment")?.effective).toBeNull();
  });

  it("presents the sourced transition and package in deterministic governance tables and the model context", () => {
    const event = buildMaterialEventFiling({ accessionNumber: retained.accession, form: "8-K", filingDate: retained.filingDate, items: "5.02" }, `Item 5.02. ${retained.title}. ${retained.text}`, retained.sourceUrl);
    const bundle = completeCurrencyBundle({});
    bundle.edgar.currentReports = { ok: true, value: { data: { version: CURRENT_REPORTS_VERSION, releases: [], events: [event], notes: [] }, source: "edgar", asOf: retained.filingDate, endpoint: retained.sourceUrl, fetchedAt: bundle.builtAt } };
    const disclosures = buildFilingDisclosures(bundle);
    expect(disclosures?.officerChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ person: "Scott Schenkel", kind: "departure", inEffect: true, effective: "2026-05-11" }),
      expect.objectContaining({ person: "Derek Andersen", kind: "appointment", inEffect: true, effective: "2026-05-11", source: expect.objectContaining({ accession: retained.accession, url: retained.sourceUrl }) }),
    ]));
    const tables = JSON.stringify(filingGovernanceTables(disclosures!));
    expect(tables).toContain("Scott Schenkel");
    expect(tables).toContain("Derek Andersen");
    expect(tables).toContain("2026-05-11");
    const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
    expect(payload.provenanceRegistry).toEqual(expect.arrayContaining([
      expect.objectContaining({ subject: "Derek Andersen", value: 17_000_000, origin: `edgar:8-K ${retained.accession}` }),
    ]));
  });
});
