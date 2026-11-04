import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import type { ContextPayload } from "@/pipeline/stageC/payload";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";
import { ReportView } from "@/components/report/ReportView";
import { GradeStripBar } from "@/components/report/sections";
import { withPlainFigureNotes } from "@/report/presentation";
import { reportToMarkdown, reportToAuditMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { ReportSchema } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";

const record = (over: Partial<NumericProvenanceRecord> = {}): NumericProvenanceRecord => ({
  id: "payload.quote.price", kind: "provider", value: 606.73, unit: "currency-per-share", currency: "USD",
  period: null, asOf: "2026-11-01", origin: "fmp:quote", formulaVersion: null, displayPrecision: 4, label: "price", ...over,
});
const payload = (records = [record()]): ContextPayload => ({ provenanceRegistry: records, citationRegistry: [], filings: [],
  companyName: "Example", symbol: "EX", leadership: { notes: [], figures: [] } } as unknown as ContextPayload);

it("flags every plain financial field by path, retaining prose and matching shown precision and dimensions", async () => {
  const prose = { verdict: { synthesis: "The price is USD 706.73 per share." },
    technicals: { trend: "The price is EUR 606.73 per share.", momentum: "Price: USD 606.73 per share." },
    disagreements: [{ bullView: "The price is USD 606.7 per share.", bearView: "The price is USD 606.74 per share.", judgeResolution: "The price is USD 606.73 billion." }],
    valuation: { assumptions: ["Operating income for FY2025 was USD 10 billion.", "Revenue for FY2024 was USD 10 billion.", "Revenue for FY2025 was USD 10 billion."] },
  };
  const checked = await runVerifyPass({} as PassDeps, payload([record(), record({ id: "payload.statements.income-annual.revenue", label: "revenue", value: 10e9, unit: "currency", period: "FY2025", fiscalPeriod: "FY2025" })]), prose);
  expect(checked.verifiedReport).toEqual(prose);
  const flags = checked.log.filter(e => e.check === "plain-figure");
  expect(flags.map(e => e.path).sort()).toEqual(["verdict.synthesis", "technicals.trend", "disagreements[0].bearView", "disagreements[0].judgeResolution", "valuation.assumptions[0]", "valuation.assumptions[1]"].sort());
  expect(flags.find(e => e.path === "verdict.synthesis")?.note).toBe("Differs from the record: USD 706.73 per share stated, USD 606.73 per share recorded.");
});

it("checks each figure of mixed prose, including scaled amounts, percentages and multiples", async () => {
  const records = [record({ id: "computed.margin", label: "operating margin", value: 25.04, unit: "percent", currency: null }),
    record({ id: "computed.multiple", label: "P/E", value: 12.34, unit: "ratio", currency: null }),
    record({ id: "payload.revenue", label: "revenue", value: 10e9, unit: "currency", period: "FY2025", fiscalPeriod: "FY2025" })];
  const text = "Operating margin: 25.0%; P/E: 12.3x; Revenue for FY2025: USD 11 billion.";
  const checked = await runVerifyPass({} as PassDeps, payload(records), { fundamentals: { graded: { interpretation: text } } });
  expect(checked.log.filter(e => e.check === "plain-figure")).toEqual([expect.objectContaining({ path: "fundamentals.graded.interpretation", claim: text, note: "Differs from the record: USD 11 billion stated, USD 10 billion recorded." })]);
});

it("finds a figure's metric inside interpretation without borrowing another metric or a conflicting modifier", async () => {
  const records = [record(), record({ id: "computed.margin", label: "operating margin", value: 25.04, unit: "percent", currency: null }),
    record({ id: "payload.revenue", label: "revenue", value: 10e9, unit: "currency", period: "FY2025", fiscalPeriod: "FY2025" })];
  const result = await runVerifyPass({} as PassDeps, payload(records), { verdict: { synthesis: "JUDGMENT: at USD 606.73 the price looks about right, because the model straddles it." },
    fundamentals: { commentary: ["The debate is whether an operating margin of 25.0% can persist.", "Net margin of 25.0% looks durable.",
      "Adjusted revenue for FY2025: USD 10 billion.", "Operating income for FY2025: USD 10 billion.", "Revenue for FY2024: USD 10 billion.",
      "Revenue growth for FY2025 was USD 10 billion, suggesting a durable business."] } });
  expect(result.log.filter(e => e.check === "plain-figure").map(e => e.path)).toEqual([
    "fundamentals.commentary[1]", "fundamentals.commentary[2]", "fundamentals.commentary[3]", "fundamentals.commentary[4]", "fundamentals.commentary[5]",
  ]);
});

it("does not audit deterministic display blocks as model prose on an assembled report", async () => {
  const report = loadTask28Fixture();
  report.valuation.dcf.assumptions = [{ name: "Discount rate", value: "99%", basis: "Deterministic calculation" }];
  const result = await runVerifyPass({} as PassDeps, payload(), report);
  expect(result.log.filter(e => e.check === "plain-figure").some(e => e.path?.startsWith("valuation.dcf"))).toBe(false);
});

it("checks AI scenario conditions retained when no deterministic scenario was modeled", async () => {
  const report = loadTask28Fixture();
  report.valuation.scenarios[0]!.assumptions = ["No model available."];
  report.valuation.scenarios[0]!.whatWouldHaveToBeTrue = ["Revenue must reach USD 900 billion."];
  report.valuation.scenarios[1]!.assumptions = ["Computed inputs.", "Computed scenario shift."];
  report.valuation.scenarios[1]!.whatWouldHaveToBeTrue = ["Modeled conditions: Revenue USD 900 billion."];
  const result = await runVerifyPass({} as PassDeps, payload(), report);
  expect(result.log.filter(e => e.check === "plain-figure" && e.path?.includes("whatWouldHaveToBeTrue")).map(e => e.path))
    .toEqual(["valuation.scenarios[0].whatWouldHaveToBeTrue[0]"]);
});

it("also checks suffix currencies and the multiplication-sign spelling of multiples", async () => {
  const records = [record({ id: "computed.multiple", label: "P/E", value: 12.34, unit: "ratio", currency: null }),
    record({ id: "payload.revenue", label: "revenue", value: 10e9, unit: "currency" })];
  const result = await runVerifyPass({} as PassDeps, payload(records), { commentary: [
    "P/E: 112.3×.", "Revenue: 11 billion USD.", "P/E: 12.3×.", "Revenue: 10 billion USD.", "Revenue: USD 10 billion EUR.",
  ] });
  expect(result.log.filter(e => e.check === "plain-figure").map(e => e.path)).toEqual(["commentary[0]", "commentary[1]", "commentary[4]"]);
});

it("retains latest-period restrictions when a metric is embedded in interpretation", async () => {
  const old = record({ id: "computed.quarterly-trend.operating-margin-quarter-ended-2025-06-30", kind: "computed", origin: "computed.quarterly-trend", formulaVersion: "test",
    label: "operating margin, quarter ended 2025-06-30", value: 20, unit: "percent", currency: null, period: "2025-06-30" });
  const latest = { ...old, id: "computed.quarterly-trend.operating-margin-quarter-ended-2026-06-30", label: "operating margin, quarter ended 2026-06-30", period: "2026-06-30", value: 30 };
  const result = await runVerifyPass({} as PassDeps, payload([old, latest]), { commentary: [
    "The debate is whether the latest quarter's operating margin of 20% can persist.",
    "The debate is whether the latest quarter's operating margin of 30% can persist.",
  ] });
  expect(result.log.filter(e => e.check === "plain-figure").map(e => e.path)).toEqual(["commentary[0]"]);
});

it("checks a financial-input age in days, including the audit's 307-to-407-day mutation", async () => {
  const records = [record({ id: "computed.book-age", label: "opening book age", value: 307, unit: "days", currency: null })];
  const result = await runVerifyPass({} as PassDeps, payload(records), { disagreements: [
    { bullView: "Opening book age was 407 days." }, { bullView: "Opening book age was 307 days." },
  ] });
  expect(result.log.filter(e => e.check === "plain-figure")).toEqual([expect.objectContaining({ path: "disagreements[0].bullView", note: "Differs from the record: 407 days stated, 307 days recorded." })]);
});

it("reads days as a unit in a days-to-cover metric while preserving the metric identity", async () => {
  const records = [record({ id: "payload.short-interest.days-to-cover", label: "days to cover", value: 3.11, unit: "days", currency: null, asOf: "2026-10-15" })];
  const result = await runVerifyPass({} as PassDeps, payload(records), { commentary: [
    "Short interest stood at 3.11 days to cover on 2026-10-15, a modest level.",
    "Opening book age was 3.11 days on 2026-10-15.",
  ] });
  expect(result.log.filter(e => e.check === "plain-figure").map(e => e.path)).toEqual(["commentary[1]"]);
});

it("does not lose an accounting-parentheses sign when extracting a metric from prose", async () => {
  const result = await runVerifyPass({} as PassDeps, payload(), { commentary: [
    "The debate concerns a price of (USD 606.73), a negative amount.",
    "The debate concerns a price of USD 606.73, a positive amount.",
  ] });
  expect(result.log.filter(e => e.check === "plain-figure").map(e => e.path)).toEqual(["commentary[0]"]);
});

it("uses even an invalid source-bound claim only as value evidence, regardless of its prose label", async () => {
  const source = "edgar:10-K:business", asOf = "2026-11-01";
  const p = { ...payload([]), citationRegistry: [{ id: source, asOf, kind: "payload-text" }],
    filings: [{ source, asOf, title: "Business", text: "Revenue for FY2025 was USD 10 billion.", truncated: false, originalChars: 44 }] } as ContextPayload;
  const result = await runVerifyPass({} as PassDeps, p, {
    facts: [{ label: "JUDGMENT", source, asOf, text: "Revenue for FY2025 was USD 10 billion." },
      { label: "FACT", source, asOf, text: "Revenue for FY2025 was USD 11 billion." }],
    commentary: ["Revenue for FY2025: USD 10 billion.", "Revenue for FY2025: USD 11 billion."],
  });
  expect(result.log.filter(e => e.check === "plain-figure").map(e => [e.path, e.traceKind])).toEqual([["commentary[0]", "value-match"], ["commentary[1]", "value-match"]]);
});

it("keeps a same-report value match separate from context confirmation", async () => {
  const source = "edgar:10-K:business", asOf = "2026-11-01";
  const p = { ...payload([]), citationRegistry: [{ id: source, asOf, kind: "payload-text" }],
    filings: [{ source, asOf, title: "Business", text: "Revenue for FY2025 was USD 10 billion.", truncated: false, originalChars: 44 }] } as ContextPayload;
  const checked = await runVerifyPass({} as PassDeps, p, { commentary: [{ label: "FACT", source, asOf, text: "Revenue for FY2025 was USD 10 billion." }],
    verdict: { synthesis: "Revenue for FY2025: USD 10 billion. Operating income for FY2025: USD 10 billion." },
    disagreements: [{ judgeResolution: "Revenue for FY2025: USD 11 billion." }] });
  expect(checked.log.find(e => e.path === "commentary[0]")?.validationStatus).toBe("validated");
  expect(checked.log.filter(e => e.check === "plain-figure").map(e => e.note)).toEqual(["Value matched; context not confirmed: USD 10 billion.", "Not matched to a source: USD 11 billion."]);
});

it("shows recorded field notes on live, Markdown, print and audit surfaces without inventing checks for saved reports", async () => {
  const report = loadTask28Fixture();
  report.verdict.synthesis = "The price is USD 706.73 per share.";
  report.disagreements = [{ topic: "Price", bullView: "The price is USD 806.73 per share.", bearView: "No figure.", judgeResolution: "No figure.", kind: "fact" }];
  const before = JSON.stringify(report);
  expect(reportToMarkdown(report)).not.toContain("Not matched to a source:");
  const checked = await runVerifyPass({} as PassDeps, payload(), report);
  expect(checked.verifiedReport.appendix.verificationLog).toEqual(checked.log);
  expect(ReportSchema.safeParse(checked.verifiedReport).success).toBe(true);
  const verifiedBefore = JSON.stringify(checked.verifiedReport);
  for (const surface of [reportToMarkdown(checked.verifiedReport), reportToPrintBody(checked.verifiedReport),
    reportToAuditMarkdown(checked.verifiedReport), renderToStaticMarkup(createElement(ReportView, { report: checked.verifiedReport }))]) {
    expect(surface).toContain("Differs from the record: USD 706.73 per share stated, USD 606.73 per share recorded.");
    expect(surface).toContain("Differs from the record: USD 806.73 per share stated, USD 606.73 per share recorded.");
  }
  expect(JSON.stringify(report)).toBe(before);
  expect(JSON.stringify(checked.verifiedReport)).toBe(verifiedBefore);
});

it("shows a flagged grade-strip explanation as visible text in both compact layouts", async () => {
  const report = loadTask28Fixture();
  report.verdict.gradeStrip.fundamentals = { ...report.verdict.gradeStrip.fundamentals, oneLineWhy: "Operating margin was 120.7%." };
  const checked = await runVerifyPass({} as PassDeps, payload(), report);
  const shown = withPlainFigureNotes(checked.verifiedReport);
  for (const presentation of ["default", "dossier"] as const) {
    const html = renderToStaticMarkup(createElement(GradeStripBar, { gradeStrip: shown.verdict.gradeStrip, compact: true, presentation }));
    expect(html.replace(/<[^>]*>/g, "")).toContain("Not matched to a source: 120.7%.");
  }
});
