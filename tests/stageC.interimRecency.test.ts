/** AI-507: the notes rule reads by reporting period, and a 10-Q older than the 10-K says so. */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import type { DataBundle } from "@/pipeline/types";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { buildBearFraming, buildBullFraming, buildJudgeFraming } from "@/pipeline/stageC/prompts";
import type { ValidationReport } from "@/pipeline/stageA/validate";

import { BUILT_AT, completeCurrencyBundle } from "./helpers/currencyBundle";

const EMPTY_VALIDATION = { checks: [], flags: [], gaps: [] } as unknown as ValidationReport;
const URL = "https://www.sec.gov/Archives/edgar/data/1/000000000126000005/q.htm";

const section = (form: "10-K" | "10-Q", sectionName: string, [reportDate, filingDate]: [string, string], accession: string, text: string) =>
  ({ ok: true, value: { data: { sectionName, text, method: "toc", chars: text.length, accession, form, filingDate, reportDate, documentUrl: URL },
    asOf: reportDate, source: "edgar", endpoint: URL, fetchedAt: BUILT_AT } });

function withFilings(tenK: [string, string], tenQ: [string, string]): DataBundle {
  const bundle = completeCurrencyBundle({}) as unknown as { edgar: Record<string, unknown> };
  bundle.edgar = { ...bundle.edgar,
    tenKNotes: section("10-K", "tenKNotes", tenK, "0000000001-26-000010", "Note 4. Investments. Hedged cash and debt investments were $11.5 billion at year end."),
    tenQNotes: section("10-Q", "tenQNotes", tenQ, "0000000001-26-000005", "Note 4. Investments. Hedged cash and debt investments were $5.5 billion at quarter end."),
    tenQMdna: section("10-Q", "tenQItem2", tenQ, "0000000001-26-000005", "One customer accounted for 12% of revenue in the quarter."),
    tenQOther: section("10-Q", "tenQItem5", tenQ, "0000000001-26-000005", "During the quarter, no director or officer adopted or terminated a Rule 10b5-1 trading arrangement.") };
  return bundle as unknown as DataBundle;
}

const titles = (b: DataBundle) =>
  Object.fromEntries(assembleContextPayload(b, runStageB(b), EMPTY_VALIDATION).filings.map((e) => [e.source, e.title]));
const OLDER = "[older than the 10-K for the period ended 2026-09-03]";

describe("interim notes recency (AI-507)", () => {
  it("marks each 10-Q excerpt older than the 10-K, and the rule prefers the later notes by date", () => {
    const t = titles(withFilings(["2026-09-03", "2026-10-09"], ["2026-05-28", "2026-06-25"]));
    expect(t["edgar:10-Q notes"]).toMatch(/^10-Q Part I Item 1 — Notes to the financial statements \[older than the 10-K for the period ended 2026-09-03\] \(10-Q 0000000001-26-000005; reporting period ended 2026-05-28/);
    expect(t["edgar:10-Q item2"]).toContain(`10-Q Item 2 — MD&A ${OLDER} (`);
    expect(t["edgar:10-Q item5"]).toContain(`10-Q Part II Item 5 — Other Information ${OLDER} (`);
    expect(t["edgar:10-K notes"]).not.toContain("older than"); // control
    for (const framing of [buildBullFraming(), buildBearFraming(), buildJudgeFraming()]) {
      expect(framing).not.toMatch(/10-Q notes excerpt is the latest word/);
      expect(framing).toContain("Of the 10-Q and 10-K notes excerpts, the one whose reporting period ended later is the latest");
    }
  });

  it("leaves a 10-Q newer than the 10-K unmarked (control: the C-16 direction)", () => {
    const t = titles(withFilings(["2026-01-25", "2026-02-25"], ["2026-07-26", "2026-08-26"]));
    // Precondition: the 10-Q excerpts reach the payload at all.
    expect(t["edgar:10-Q notes"]).toContain("reporting period ended 2026-07-26");
    expect(Object.values(t).filter((title) => /older than the 10-K/.test(String(title)))).toEqual([]);
  });

  it("compares reporting periods, not filing dates", () => {
    // Filed after the 10-K, but for an earlier quarter: still older.
    expect(titles(withFilings(["2026-09-03", "2026-10-09"], ["2026-05-28", "2026-10-20"]))["edgar:10-Q notes"]).toContain(OLDER);
    // The same period end is not older.
    expect(titles(withFilings(["2026-09-03", "2026-10-09"], ["2026-09-03", "2026-10-12"]))["edgar:10-Q notes"]).not.toContain("older than");
  });
});
