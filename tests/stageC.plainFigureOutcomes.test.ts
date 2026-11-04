import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { runVerifyPass, type PassDeps, type VerificationEvidence } from "@/pipeline/stageC/passes";
import type { ContextPayload } from "@/pipeline/stageC/payload";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";
import { ReportView } from "@/components/report/ReportView";
import { reportToMarkdown, reportToAuditMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { claimStatusMarkText, indexVerificationMarks } from "@/report/verificationMarks";
import { loadTask28Fixture } from "./helpers/task28Report";

const record = (over: Partial<NumericProvenanceRecord> = {}): NumericProvenanceRecord => ({
  id: "payload.quote.price", kind: "provider", label: "price", value: 606.73, unit: "currency-per-share", currency: "USD",
  period: null, asOf: "2026-11-01", origin: "fmp:quote", formulaVersion: null, displayPrecision: 4, ...over,
});
const payload = (records: NumericProvenanceRecord[] = []): ContextPayload => ({ provenanceRegistry: records, citationRegistry: [], filings: [],
  news: { title: "News", figures: [], notes: [] }, companyName: "Example", symbol: "EX", leadership: { notes: [], figures: [] } } as unknown as ContextPayload);
const verify = (p: ContextPayload, text: string, evidence: VerificationEvidence = { fetchedUrls: [] }) =>
  runVerifyPass({} as PassDeps, p, { verdict: { synthesis: text } }, evidence);

it("shows a context contradiction even when the stated value exists on another metric", async () => {
  const p = payload([record(), record({ id: "computed.technicals.sma50", kind: "computed", origin: "computed.technicals", label: "SMA50", value: 706.73 })]);
  const result = await verify(p, "The price is USD 706.73 per share.");
  expect(result.log).toContainEqual(expect.objectContaining({ check: "plain-figure", path: "verdict.synthesis", reason: "value-mismatch",
    note: "Differs from the record: USD 706.73 per share stated, USD 606.73 per share recorded." }));
  expect(result.verifiedReport.verdict.synthesis).toBe("The price is USD 706.73 per share.");
});

it("uses the identified period before considering a coincidental value in another period", async () => {
  const base = record({ id: "payload.revenue.2025", label: "revenue", unit: "currency", value: 10e9, period: "FY2025", fiscalPeriod: "FY2025" });
  const result = await verify(payload([base, { ...base, id: "payload.revenue.2024", value: 11e9, period: "FY2024", fiscalPeriod: "FY2024" }]), "Revenue for FY2025 was USD 11 billion.");
  expect(result.log).toContainEqual(expect.objectContaining({ reason: "value-mismatch", note: "Differs from the record: USD 11 billion stated, USD 10 billion recorded." }));
});

it("keeps a found value with unconfirmed context in the audit only", async () => {
  const report = loadTask28Fixture();
  report.verdict.synthesis = "Buyback authorization: USD 50 billion.";
  const p = payload([record({ id: "payload.income.net-income", label: "net income", unit: "currency", value: 50e9 })]);
  const checked = await runVerifyPass({} as PassDeps, p, report);
  expect(checked.log).toContainEqual(expect.objectContaining({ path: "verdict.synthesis", check: "plain-figure", traceKind: "value-match",
    validationStatus: "unchecked", claimSupportStatus: "unreviewed", note: "Value matched; context not confirmed: USD 50 billion." }));
  for (const surface of [reportToMarkdown(checked.verifiedReport), reportToPrintBody(checked.verifiedReport), renderToStaticMarkup(createElement(ReportView, { report: checked.verifiedReport })),
    renderToStaticMarkup(createElement(ReportView, { report: checked.verifiedReport, layout: "dossier" }))]) {
    expect(surface).not.toContain("Not matched to a source: USD 50 billion");
    expect(surface).not.toContain("Value matched; context not confirmed: USD 50 billion");
    expect(surface.split("Figures without a note are not necessarily verified.")).toHaveLength(2);
  }
  expect(reportToAuditMarkdown(checked.verifiedReport)).toContain("Value matched; context not confirmed: USD 50 billion.");
  expect(reportToAuditMarkdown(checked.verifiedReport)).toContain("verdict.synthesis");
});

it("preserves bounds and protected definitions when identifying a contradiction", async () => {
  const p = payload([record({ id: "margin", label: "operating margin", value: 25.04, unit: "percent", currency: null }),
    record({ id: "computed.technicals.sma50", kind: "computed", origin: "computed.technicals", label: "SMA50", value: 671.1192 })]);
  const checked = await runVerifyPass({} as PassDeps, p, { commentary: [
    "Operating margin was more than 20%.", "The adjusted 50-day average was USD 671.1192.",
    "The expected 50-day average is USD 671.1192.",
  ] });
  expect(checked.log.filter(e => e.check === "plain-figure" && e.path === "commentary[0]")).toEqual([]);
  for (const path of ["commentary[1]", "commentary[2]"]) expect(checked.log).toContainEqual(expect.objectContaining({ path, check: "plain-figure", traceKind: "value-match" }));
});

it("reads explanatory parentheses and an explicit shared money scale only as value evidence", async () => {
  const p = payload([record(), record({ id: "growth", label: "revenue growth", value: 0.7, unit: "percent", currency: null }),
    record({ id: "outflow", label: "repurchases", value: 1e9, unit: "currency", currency: "EUR" })]);
  const result = await runVerifyPass({} as PassDeps, p, { commentary: [
    "A reference price (USD 606.73) appears in the debate.",
    "A near-flat year-ago quarter (0.7%) formed the comparison.",
    "The quarterly outflows (EUR 1.00, 1.08 and 4.07 billion) are being discussed.",
    "The reference price was (USD 606.73), a negative amount.",
    "The amount was (USD 606.73).",
    "Amounts: EUR 1.00 of profits, 1.08 per share and 4.07 billion of revenue.",
  ] });
  for (const path of ["commentary[0]", "commentary[1]", "commentary[2]"]) expect(result.log).toContainEqual(expect.objectContaining({ path, traceKind: "value-match" }));
  for (const path of ["commentary[3]", "commentary[4]", "commentary[5]"]) expect(result.log).toContainEqual(expect.objectContaining({ path, traceKind: "untraced" }));
});

it.each(["filing", "transcript", "news", "research", "case", "claim"] as const)("finds value-only evidence in retained %s text without requiring claim validation", async kind => {
  const p = payload(), text = "The company authorized USD 50 billion for repurchases.";
  const excerpt = { source: "edgar:10-K:test", asOf: "2026-11-01", title: "Retained", text, truncated: false, originalChars: text.length };
  const evidence = { fetchedUrls: [], retainedTexts: [] as { source: string; text: string }[] };
  if (kind === "filing") p.filings = [excerpt];
  if (kind === "transcript") p.transcript = excerpt;
  if (kind === "news") p.news.notes = [text];
  if (kind === "research" || kind === "case") evidence.retainedTexts = [{ source: `analyst:bull.${kind}`, text }];
  const result = await runVerifyPass({} as PassDeps, p, { verdict: { synthesis: "The investment program was USD 50 billion." },
    commentary: kind === "claim" ? [{ label: "FACT", text, source: "unresolved:source", asOf: null }] : [] }, evidence);
  expect(result.log).toContainEqual(expect.objectContaining({ check: "plain-figure", path: "verdict.synthesis", traceKind: "value-match" }));
  expect(result.log.find(e => e.path === "commentary[0]")?.validationStatus).not.toBe("validated");
});

it("keeps dimension, currency and printed precision restrictions on evidence-wide value matches", async () => {
  const p = payload([record({ unit: "currency", currency: "EUR", value: 50e9 }), record({ id: "other", value: 50e9 })]);
  p.news.notes = ["Repurchases were USD 50 billion."];
  const result = await verify(p, "Program cost: USD 50.01 billion.");
  expect(result.log).toContainEqual(expect.objectContaining({ check: "plain-figure", reason: "text-source", note: "Not matched to a source: USD 50.01 billion." }));
  const wrong = await verify(payload([record({ unit: "currency", currency: "EUR", value: 50e9 }), record({ id: "other", value: 50e9 })]), "Program cost: USD 50 billion.");
  expect(wrong.log).toContainEqual(expect.objectContaining({ reason: "text-source", traceKind: "untraced" }));
  const fraction = await verify(payload([record({ unit: "ratio", currency: null, unitScale: "fraction", value: 12.3 })]), "P/E is 12.3x.");
  expect(fraction.log).toContainEqual(expect.objectContaining({ reason: "text-source", traceKind: "untraced" }));
});

it("does not promote low-precision value matches into rates, claim status or executive grades", async () => {
  const report = loadTask28Fixture();
  report.verdict.synthesis = "The outlook could improve by 8%.";
  report.leadership.executives[0]!.grade = "A";
  const p = payload();
  const before = await runVerifyPass({} as PassDeps, p, report);
  const after = await runVerifyPass({} as PassDeps, p, report, { fetchedUrls: [], retainedTexts: [{ source: "analyst:bear.research", text: "Operating margin was 8.3%." }] } as VerificationEvidence);
  expect(after.log).toContainEqual(expect.objectContaining({ path: "verdict.synthesis", traceKind: "value-match", validationStatus: "unchecked", numericSupportStatus: "unchecked", claimSupportStatus: "unreviewed" }));
  expect(after.verificationRate).toEqual(before.verificationRate);
  expect(after.coverage).toEqual(before.coverage);
  expect(after.checks).toEqual(before.checks);
  expect({ ...after.verifiedReport, appendix: { ...after.verifiedReport.appendix, verificationLog: undefined } })
    .toEqual({ ...before.verifiedReport, appendix: { ...before.verifiedReport.appendix, verificationLog: undefined } });
  expect(after.verifiedReport.leadership.executives.map(e => [e.grade, e.credibilityGrade])).toEqual(before.verifiedReport.leadership.executives.map(e => [e.grade, e.credibilityGrade]));
  expect(after.verifiedReport.leadership.executives[0]!.grade).toBe("not-assessed");
  indexVerificationMarks(before.verifiedReport); indexVerificationMarks(after.verifiedReport);
  expect(claimStatusMarkText(after.verifiedReport.fundamentals.commentary[0]!)).toEqual(claimStatusMarkText(before.verifiedReport.fundamentals.commentary[0]!));
});

it("confirms producer-bound SMA, range, drawdown and tangible-book wording", async () => {
  const tech = (id: string, label: string, value: number) => record({ id: `computed.technicals.${id}`, label, value, kind: "computed", origin: id.startsWith("range") ? "computed.technicals.range52w" : "computed.technicals" });
  const p = payload([tech("sma50", "SMA50", 671.1192), tech("sma200", "SMA200", 632.0324), tech("range52w-low", "52w low", 520.26), tech("range52w-high", "52w high", 779.82),
    tech("range52w-percent-from-high", "% from 52w high", -22.2) as NumericProvenanceRecord,
    record({ id: "computed.valuation.pricetotbv-current", origin: "computed.valuation.multiples.priceToTbv", kind: "computed", label: "priceToTbv (current)", unit: "ratio", currency: null, value: 3.1363 })]);
  const drawdown = p.provenanceRegistry!.find(r => r.label === "% from 52w high")!; drawdown.unit = "percent"; drawdown.currency = null;
  const result = await runVerifyPass({} as PassDeps, p, { commentary: [
    "50-day: USD 671.1192; 200-day: USD 632.0324.",
    "The close is below both averages (50-day USD 671.1192; 200-day USD 632.0324).",
    "52-week range USD 520.26 to USD 779.82; the close is 22.2% below the high.",
    "Price to tangible book is 3.1x.",
  ] });
  expect(result.log.filter(e => e.check === "plain-figure")).toEqual([]);
  const altered = await verify(p, "The 50-day average was USD 771.1192.");
  expect(altered.log).toContainEqual(expect.objectContaining({ reason: "value-mismatch" }));
  const wrongPeriod = await verify(p, "The 50-day average on 2025-11-01 was USD 671.1192.");
  expect(wrongPeriod.log).toContainEqual(expect.objectContaining({ traceKind: "value-match" }));
});
