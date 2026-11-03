/**
 * Q1: the payload's detailed insider rows are the newest twelve, which awards,
 * gifts and tax withholding often fill. On the frozen 2026-11-02 panel the
 * coded purchases and sales of the last six months were visible for 3 of 7
 * people at AAPL (not its outgoing or incoming CEO), 1 of 9 at JPM and 1 of 5
 * at FIGR (not its CEO). One line per person summarizes them from every
 * selected provider row.
 */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import { collectPersonRows } from "@/pipeline/stageC/consistency";
import { assembleContextPayload, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import type { DataBundle } from "@/pipeline/types";

import { BUILT_AT, completeCurrencyBundle } from "./helpers/currencyBundle";

const EMPTY_VALIDATION = { checks: [], flags: [], gaps: [] } as unknown as ValidationReport;

type Trade = { transactionDate: string; filingDate?: string; reportingName: string; typeOfOwner: string; transactionType: string; securitiesTransacted: number; price: number; formType?: string };
const trade = (transactionDate: string, reportingName: string, typeOfOwner: string, transactionType: string, securitiesTransacted: number, price: number): Trade =>
  ({ transactionDate, filingDate: transactionDate, reportingName, typeOfOwner, transactionType, securitiesTransacted, price, formType: "4" });

// Twelve newer director awards fill the detailed rows, as at O and JPM.
const AWARDS = Array.from({ length: 12 }, (_, i) => trade("2026-06-20", `Director ${String.fromCharCode(65 + i)}`, "director", "A-Award", 100, 0));
const CEO = "Doe Jane Q";
const CFO = "Roe Richard";
const PERSON_TRADES = [
  trade("2026-05-02", CEO, "director, officer: Chief Executive Officer", "S-Sale", 1_000, 41.5),
  trade("2026-05-01", CEO, "director, officer: Chief Executive Officer", "S-Sale", 2_500, 40.25),
  trade("2026-04-15", CFO, "officer: Chief Financial Officer", "P-Purchase", 300, 38),
  trade("2026-04-10", CEO, "director, officer: Chief Executive Officer", "F-InKind", 9_999, 39), // tax withholding: not a decision to trade
  trade("2025-12-01", CFO, "officer: Chief Financial Officer", "S-Sale", 7_777, 30), // older than six months
];

function payloadFor(rows: Trade[]) {
  const base = completeCurrencyBundle({});
  const bundle = { ...base,
    insiderTrades: { ok: true, value: { data: { rows, raw: rows }, asOf: rows[0]?.transactionDate ?? "2026-06-20", source: "fmp", endpoint: "insider-trading/search", fetchedAt: BUILT_AT } },
  } as unknown as DataBundle;
  return assembleContextPayload(bundle, runStageB(bundle), EMPTY_VALIDATION);
}

describe("coded purchases and sales by person", () => {
  it("keeps the twelve detailed rows and adds one line per person from every selected row in the last six months", () => {
    const payload = payloadFor([...AWARDS, ...PERSON_TRADES]);
    const notes = payload.insiders.notes;
    expect(notes.filter((note) => note.includes("A-Award 100 @ 0"))).toHaveLength(12);
    expect(notes.some((note) => note.includes(`${CEO} (director, officer: Chief Executive Officer): S-Sale`))).toBe(false); // not among the newest twelve
    const header = notes.find((note) => note.startsWith("Form 4 purchases and sales by person"))!;
    expect(header).toContain("codes P and S, open-market or private");
    expect(header).toContain("2026-01-04 to 2026-07-06");
    expect(header).toContain("17 selected provider rows");
    expect(header).toContain("venue and motive are not established");
    expect(notes).toContain(`2026-05-02 ${CEO} (director, officer: Chief Executive Officer): code S sales, 2 rows 2026-05-01 to 2026-05-02, 3500 shares at 40.25-41.5 [fmp:insider-trades · 2026-05-02]`);
    expect(notes).toContain(`2026-04-15 ${CFO} (officer: Chief Financial Officer): code P purchases, 1 row on 2026-04-15, 300 shares at 38 [fmp:insider-trades · 2026-04-15]`);
    expect(notes.join("\n")).not.toContain("7777 shares"); // outside the window
    expect(notes.join("\n")).not.toContain("9999 shares"); // code F
    expect(notes.indexOf(header)).toBeLessThan(notes.findIndex((note) => note.includes("A-Award")));
  });

  it("lets a named claim cite its person line and registers the line's tag", () => {
    const payload = payloadFor([...AWARDS, ...PERSON_TRADES]);
    const rows = collectPersonRows({ insiderNotes: payload.insiders.notes }).filter((row) => row.name === CEO);
    expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({ tag: "fmp:insider-trades", asOf: "2026-05-02", title: "Chief Executive Officer" })]));
    expect(payload.citationRegistry?.some((entry) => entry.id === "fmp:insider-trades" && entry.asOf === "2026-05-02")).toBe(true);
  });

  it("caps the list at eight people, leading with the chief executive and finance officers, and says how many are left out", () => {
    const many = Array.from({ length: 10 }, (_, i) => trade(`2026-06-${String(10 + i).padStart(2, "0")}`, `Officer ${i}`, "officer: VP", "P-Purchase", 10 * (i + 1), 50));
    const payload = payloadFor([...many, ...PERSON_TRADES]);
    const lines = payload.insiders.notes.filter((note) => / \(.*\): code [PS] (?:sales|purchases), /.test(note));
    expect(lines).toHaveLength(8);
    expect(lines[0]).toContain(CEO);
    expect(lines[1]).toContain(CFO);
    expect(payload.insiders.notes.find((note) => note.startsWith("Form 4 purchases and sales by person"))).toContain("4 more people are not listed");
  });

  it("lists a person once per code under their newest role, ranks a vice president by amount and counts omitted people", () => {
    const renamed = [
      trade("2026-06-02", "Smith Ann", "officer: SVP, GC and Government Affairs", "S-Sale", 100, 50),
      trade("2026-03-02", "Smith Ann", "officer: SVP, GC and Secretary", "S-Sale", 50, 40),
    ];
    const payload = payloadFor([...renamed, ...PERSON_TRADES]);
    const lines = payload.insiders.notes.filter((note) => note.includes(" Smith Ann (") && note.includes("): code "));
    expect(lines).toEqual(["2026-06-02 Smith Ann (officer: SVP, GC and Government Affairs): code S sales, 2 rows 2026-03-02 to 2026-06-02, 150 shares at 40-50 [fmp:insider-trades · 2026-06-02]"]);
    const vps = Array.from({ length: 9 }, (_, i) => trade("2026-06-10", `Vice ${i}`, "officer: Vice President", "P-Purchase", 1, 10));
    const ranked = payloadFor([...vps, trade("2026-06-11", "Big Seller", "director", "S-Sale", 100_000, 50)]).insiders.notes;
    const first = ranked.find((note) => / \(.*\): code [PS] /.test(note));
    expect(first).toContain("Big Seller"); // a vice president is not a senior officer
    expect(ranked.find((note) => note.startsWith("Form 4 purchases and sales by person"))).toContain("2 more people are not listed");
  });

  it("adds nothing when no coded purchase or sale falls in the window", () => {
    const payload = payloadFor([...AWARDS, PERSON_TRADES[3]!, PERSON_TRADES[4]!]);
    expect(payload.insiders.notes.some((note) => note.startsWith("Form 4 purchases and sales by person"))).toBe(false);
    expect(serializePayloadForPrompt(payload)).not.toContain("by person");
  });
});
