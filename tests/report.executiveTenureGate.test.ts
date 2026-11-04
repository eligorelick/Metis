import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import type { ContextPayload } from "@/pipeline/stageC/payload";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";
import { judgeOutputToJsonSchema, ReportSchema } from "@/report/schema";
import { LeadershipSection } from "@/components/report/sections";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { loadTask28Fixture } from "./helpers/task28Report";

const tenure = { name: "Alex Smith", office: "ceo" as const, start: "2025-08-07", precision: "day" as const, wording: "7 August 2025",
  quote: "On 7 August 2025, Alex Smith became CEO.", source: "edgar:20-F:officers", filingDate: "2026-02-04" };
const record = (end: string): NumericProvenanceRecord => ({ id: `payload.statements.cash-flow-annual.${end}.operating-cash-flow`, kind: "provider", label: "operating cash flow", origin: "fmp:cash-flow",
  value: 12e9, unit: "currency", currency: "DKK", period: end, asOf: "2026-06-30", formulaVersion: null, displayPrecision: 4 });
async function verify(end: string, known = true, over: Partial<NumericProvenanceRecord> = {}) {
  const report = loadTask28Fixture();
  report.meta.generatedAt = "2026-11-03T00:00:00Z";
  const r = { ...record(end), ...over };
  report.leadership.executives = [{ name: "Alex Smith", title: "CEO", grade: "A", credibilityGrade: "not-assessed", tenureYears: 77, reasoning: [],
    evidence: { capitalAllocation: [{ label: "FACT", source: r.id, asOf: r.asOf, text: `Alex Smith: operating cash flow for ${r.period} was DKK 12 billion.` }] } }];
  report.leadership.managementActions = [];
  const p = { companyName: "Example", symbol: "EX", provenanceRegistry: [r], citationRegistry: [], filings: [],
    leadership: { notes: [], figures: [], officerTenures: known ? [tenure] : [] } } as unknown as ContextPayload;
  return runVerifyPass({} as PassDeps, p, report);
}

it.each(["2024-12-31", "2023-12-31", "2022-12-31", "2021-12-31"])("withholds execution from numerically valid pre-appointment results ending %s", async end => {
  const result = await verify(end);
  expect(result.log.find(e => e.path === "leadership.executives[0].evidence.capitalAllocation[0]" && !e.check)?.validationStatus).toBe("validated");
  expect(result.verifiedReport.leadership.executives[0]?.grade).toBe("not-assessed");
  expect(result.verifiedReport.leadership.executives[0]?.assessmentReason).toMatch(/period.*tenure|tenure.*period/i);
});
it("admits a measured end in the office tenure, including an overlapping fiscal period", async () => {
  const result = await verify("2025-12-31", true, { periodContext: { kind: "duration", start: "2025-01-01", end: "2025-12-31", basis: "fiscal-year" } });
  expect(result.verifiedReport.leadership.executives[0]?.grade).toBe("A");
});
it("withholds execution when no office start or measurement window is established", async () => {
  expect((await verify("2026-06-30", false)).verifiedReport.leadership.executives[0]).toMatchObject({ grade: "not-assessed", tenureYears: null });
  expect((await verify("2026-06-30", true, { period: null })).verifiedReport.leadership.executives[0]?.grade).toBe("not-assessed");
});
it("derives exact tenure from the established start and cutoff, ignoring the model number", async () => {
  const result = await verify("2026-06-30");
  const years = result.verifiedReport.leadership.executives[0]?.tenureYears;
  expect(years).toBeGreaterThan(1.2);
  expect(years).toBeLessThan(1.3);
});
it("keeps saved executive numbers parseable but displays tenure only from filing-backed office evidence", () => {
  const report = loadTask28Fixture();
  report.leadership.executives[0]!.tenureYears = 77;
  const before = JSON.stringify(report);
  expect(ReportSchema.safeParse(report).success).toBe(true);
  for (const text of [reportToMarkdown(report), reportToPrintBody(report), renderToStaticMarkup(createElement(LeadershipSection, { report, leadership: report.leadership, index: 7 }))])
    expect(text).not.toMatch(/77(?:\.0)?y(?: tenure)?/);
  expect(JSON.stringify(report)).toBe(before);
  const schema = judgeOutputToJsonSchema() as { properties: { leadership: { properties: { executives: { items: { properties: Record<string, unknown> } } } } } };
  expect(schema.properties.leadership.properties.executives.items.properties).not.toHaveProperty("tenureYears");
});
