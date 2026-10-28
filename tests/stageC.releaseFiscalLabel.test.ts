/**
 * Audit 2026-10-27 AI-512 (B3 Task 8F): an earnings release's fiscal label is printed in an excerpt title only where the run's
 * own statement rows do not contradict it. A wrong label in a title must never let a wrong-period claim validate.
 */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import { assembleContextPayload, type ContextPayload } from "@/pipeline/stageC/payload";
import type { DataBundle } from "@/pipeline/types";
import { buildEarningsReleaseRecord, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";

import { BUILT_AT, completeCurrencyBundle } from "./helpers/currencyBundle";

const EMPTY_VALIDATION = { checks: [], flags: [], gaps: [] } as unknown as ValidationReport;
const URL = "https://www.sec.gov/Archives/edgar/data/1/000000000126000005/q.htm";
const WITHHELD = " [issuer fiscal label withheld: the release and the statement rows disagree]";

const section = (form: "10-K" | "10-Q", sectionName: string, [reportDate, filingDate]: [string, string], accession: string, text: string) =>
  ({ ok: true, value: { data: { sectionName, text, method: "toc", chars: text.length, accession, form, filingDate, reportDate, documentUrl: URL },
    asOf: reportDate, source: "edgar", endpoint: URL, fetchedAt: BUILT_AT } });

const RELEASE = "Example Corp Reports First Quarter Results. Example Corp today announced financial results for its first quarter ended March 31, 2026. " +
  "• Northern segment sales increased 16% year-over-year to $116.0 million. • Cloud segment sales increased 37% year-over-year to $42.0 million.";
const fiscal = (label: string) => { const [, q, y] = /^Q([1-4]) FY(\d{4})$/.exec(label)!; return { label, fiscalYear: Number(y), fiscalQuarter: Number(q) as 1 | 2 | 3 | 4 }; };
function withRelease(label: string, periodEnd = "2026-03-31", rowLabelled = true): DataBundle {
  const bundle = completeCurrencyBundle({});
  const rows = (bundle.statements.incomeQuarterly as unknown as { value: { data: { rows: Record<string, unknown>[] } } }).value.data.rows;
  if (rowLabelled) rows[0] = { ...rows[0], fiscalYear: "2026", period: "Q1" };   // the issuer's own label for 2026-03-31: Q1 FY2026
  const built = buildEarningsReleaseRecord({ filing: { accessionNumber: "0000000000-26-000024", filingDate: "2026-04-30" },
    releaseUrl: "https://www.sec.gov/Archives/edgar/data/1/000000000026000024/ex99.htm", commentaryUrl: null, releaseText: RELEASE, commentaryText: null, includeNarrative: true });
  bundle.edgar.currentReports = { ok: true, value: { data: { version: CURRENT_REPORTS_VERSION, releases: [{ ...built, reported: { fiscal: fiscal(label), periodEnd } }], events: [], notes: [] },
    source: "edgar", asOf: "2026-04-30", endpoint: "fixture", fetchedAt: BUILT_AT } } as never;
  (bundle.edgar as unknown as Record<string, unknown>).tenQMdna = section("10-Q", "tenQItem2", [periodEnd, "2026-05-01"], "0000000000-26-000026", "One customer accounted for 12% of revenue.");
  return bundle;
}
const build = (b: DataBundle) => assembleContextPayload(b, runStageB(b), EMPTY_VALIDATION);
const title = (p: ContextPayload, source: string) => p.filings.find((e) => e.source === source)!.title;
const verdict = async (p: ContextPayload, text: string) => (await runVerifyPass({} as PassDeps, p, { commentary: [{ label: "FACT", text, source: "edgar:8-K EX-99.1", asOf: "2026-04-30" }] }))
  .log.find((e) => e.evidenceKind === "factual-claim" && e.check === undefined)!;

describe("a release's fiscal label the statement rows contradict (AI-512)", () => {
  it("withholds a release's fiscal label that the issuer's own statement row contradicts (AI-512)", async () => {
    const p = build(withRelease("Q1 FY2025"));
    expect(title(p, "edgar:8-K EX-99.1")).toBe(`8-K EX-99.1 - earnings release, quarter ended 2026-03-31${WITHHELD} (8-K 0000000000-26-000024; filed 2026-04-30)`);
    expect(title(p, "edgar:10-Q item2")).toContain("(10-Q 0000000000-26-000026; reporting period ended 2026-03-31; filed 2026-05-01)");
    expect(p.filings.map((e) => e.title).join("\n")).not.toContain("FY2025");
    expect((await verdict(p, "Northern segment sales increased 16% year over year in Q1 FY2025.")).validationStatus).not.toBe("validated");   // the probe's assertion
    expect((await verdict(p, "Northern segment sales increased 16% year over year.")).validationStatus).toBe("validated");                    // D-63 control
  });

  it("keeps a label the statement rows agree with, and one nothing contradicts (controls; review focus 12)", async () => {
    const agree = build(withRelease("Q1 FY2026"));
    expect(title(agree, "edgar:8-K EX-99.1")).toBe("8-K EX-99.1 - earnings release, Q1 FY2026, quarter ended 2026-03-31 (8-K 0000000000-26-000024; filed 2026-04-30)");
    expect(title(agree, "edgar:10-Q item2")).toContain("reporting period ended 2026-03-31 (Q1 FY2026); filed 2026-05-01");
    expect((await verdict(agree, "Northern segment sales increased 16% year over year in Q1 FY2026.")).validationStatus).toBe("validated");
    expect((await verdict(agree, "Northern segment sales increased 16% year over year in Q1 FY2025.")).validationStatus).not.toBe("validated");
    // The stated limit: with no fiscal fields on the statement row, nothing contradicts the release, and its label stays.
    expect(title(build(withRelease("Q1 FY2025", "2026-03-31", false)), "edgar:8-K EX-99.1")).toContain("Q1 FY2025, quarter ended 2026-03-31");
  });

  it("checks a fourth-quarter release and the 10-K title against the annual row's fiscal year (review focus 12)", () => {
    const tenK = (annualFiscalYear: string): DataBundle => {
      const b = withRelease("Q4 FY2025", "2025-12-31", false);
      const annual = (b.statements.incomeAnnual as unknown as { value: { data: { rows: Record<string, unknown>[] } } }).value.data.rows;
      annual[0] = { ...annual[0], fiscalYear: annualFiscalYear };   // the 2025-12-31 annual row, period "FY"
      (b.edgar as unknown as Record<string, unknown>).tenKNotes = section("10-K", "tenKNotes", ["2025-12-31", "2026-02-10"], "0000000000-26-000010", "Note 4. Investments were $11.5 million at year end.");
      return b;
    };
    const kept = build(tenK("2025"));
    expect(title(kept, "edgar:8-K EX-99.1")).toContain("Q4 FY2025, quarter ended 2025-12-31");
    expect(title(kept, "edgar:10-K notes")).toContain("reporting period ended 2025-12-31 (FY2025)");
    const withheld = build(tenK("2026"));
    expect(title(withheld, "edgar:8-K EX-99.1")).toContain(`quarter ended 2025-12-31${WITHHELD}`);
    expect(title(withheld, "edgar:10-K notes")).not.toContain("FY2025");
  });
});
