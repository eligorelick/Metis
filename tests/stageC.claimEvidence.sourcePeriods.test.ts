import { describe, expect, it } from "vitest";
import sample from "../fixtures/report/DEMO-sample.json";
import { JUDGE_OUTPUT_KEYS, JUDGE_OUTPUT_SCHEMA, ReportSchema, verificationEntryOutcomeLabel } from "@/report/schema";
import { claimStatusMarkText, indexVerificationMarks } from "@/report/verificationMarks";
import { reportToPrintHtml } from "@/report/export/printHtml";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { runStageB } from "@/pipeline/compute";
import { validateBundle } from "@/pipeline/stageA/validate";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import { runVerifyPass } from "@/pipeline/stageC/passes";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const cases = [
  ["current value", "Inventory was $31.6 billion this quarter.", "Inventory was USD 31.6 billion in Q2 FY2027.", "validated"],
  ["current contradiction", "Inventory was $31.6 billion this quarter.", "Inventory was USD 25.8 billion in Q2 FY2027.", "contradicted"],
  ["wrong currency", "Inventory was $31.6 billion this quarter.", "Inventory was EUR 31.6 billion in Q2 FY2027.", "not-validated"],
  ["prior quarter", "Inventory was $25.8 billion at the end of the prior quarter.", "Inventory was USD 25.8 billion this quarter.", "not-validated"],
  ["previous quarter-end", "Inventory was $25.8 billion at the previous quarter-end.", "Inventory was USD 25.8 billion in Q2 FY2027.", "not-validated"],
  ["prior year wrong quantity", "Inventory was $31.6 billion, at the end of the prior fiscal year $25.8 billion.", "Inventory was USD 31.6 billion at the end of the prior fiscal year.", "not-validated"],
  ["prior year correct quantity", "Inventory was $31.6 billion, at the end of the prior fiscal year $25.8 billion.", "Inventory was USD 25.8 billion at the end of the prior fiscal year.", "not-contradicted"],
  ["parenthetical year", "Inventory was $25.8 billion (last year, up from $20.0 billion two years ago).", "Inventory was USD 25.8 billion in Q2 FY2027.", "not-validated"],
  ["parenthetical year ago", "Inventory was $25.8 billion (a year ago, up 29%).", "Inventory was USD 25.8 billion in Q2 FY2027.", "not-validated"],
  ["plain year ago", "Inventory was $25.8 billion a year ago.", "Inventory was USD 25.8 billion in Q2 FY2027.", "not-validated"],
  ["comparison year-end", "Inventory was $31.6 billion, compared with $25.8 billion at fiscal year-end.", "Inventory was USD 31.6 billion at fiscal year-end.", "not-validated"],
  ["comparison suffix", "Inventory increased to $31.6 billion compared with the prior quarter.", "Inventory was USD 31.6 billion in the prior quarter.", "not-validated"],
  ["clear historical value", "Inventory was $25.8 billion at the end of the prior fiscal year.", "Inventory was USD 25.8 billion at the end of the prior fiscal year.", "validated"],
  ["clear historical contradiction", "Inventory was $25.8 billion at the end of the prior fiscal year.", "Inventory was USD 31.6 billion at the end of the prior fiscal year.", "contradicted"],
  ["clear prior quarter", "Inventory was $25.8 billion at the end of the prior quarter.", "Inventory was USD 25.8 billion at the end of the prior quarter.", "validated"],
  ["separate dated quantities", "Inventory was $31.6 billion this quarter; inventory was $25.8 billion at the end of the prior fiscal year.", "Inventory was USD 25.8 billion at the end of the prior fiscal year.", "validated"],
  ["two undated quantities", "Inventory was $31.6 billion, $25.8 billion.", "Inventory was USD 25.8 billion in Q2 FY2027.", "not-validated"],
] as const;

describe("source quantity temporal association", () => {
  it.each(cases)("preserves numeric scope through the schema-valid verifier: %s", async (_name, text, claim, expected) => {
    const bundle = completeCurrencyBundle({});
    bundle.edgar.companyFacts = { ok: false, gap: { field: "edgar.companyFacts", reason: "offline fixture", severity: "info" } };
    const validation = validateBundle(bundle);
    const payload = assembleContextPayload(bundle, runStageB(bundle, { evIncludeLeases: false }, validation), validation);
    const excerpt = { title: "10-Q Part I Item 2 - MD&A (reporting period ended 2026-07-26 (Q2 FY2027))",
      text, source: "edgar:10-Q item2", asOf: "2026-07-26", truncated: false, originalChars: text.length };
    const sourced = { label: "FACT" as const, text: claim, source: excerpt.source, asOf: excerpt.asOf };
    payload.filings = [excerpt];
    payload.citationRegistry = [...(payload.citationRegistry ?? []).filter(r => r.id !== excerpt.source),
      { id: excerpt.source, asOf: excerpt.asOf, kind: "payload-text", origin: "filings" }];
    const judge = JUDGE_OUTPUT_SCHEMA.parse(Object.fromEntries(JUDGE_OUTPUT_KEYS.map(key => [key, (sample as Record<string, unknown>)[key]])));
    judge.business.whatTheySell = [sourced];
    const helper = validateClaimNumericSupport(sourced, { excerpts: [excerpt], sourceId: excerpt.source, reportingCurrency: "USD" });
    const verified = await runVerifyPass({ model: "offline", runPass: async () => { throw new Error("Inference forbidden"); } }, payload, JUDGE_OUTPUT_SCHEMA.parse(judge));
    const entries = verified.log.filter(entry => entry.claim === claim && entry.path === "business.whatTheySell[0]");
    expect(entries).toHaveLength(1);
    for (const status of [helper.status, entries[0]!.validationStatus, entries[0]!.numericSupportStatus]) {
      if (expected.startsWith("not-")) expect.soft(status).not.toBe(expected.slice(4));
      else expect.soft(status).toBe(expected);
    }
    expect(entries[0]!.outcome).toBe("unverified");
    expect(entries[0]!.claimSupportStatus).toBe(helper.status === "validated" ? "numeric-only" : helper.status === "contradicted" ? "contradicted" : "cited");
    expect(verified.coverage.factualValidation?.validated).toBe(verified.log.filter(e => e.evidenceKind === "factual-claim" && e.validationStatus === "validated").length);
    // Offline persisted-report round trip and the actual reader/export marks.
    const report = ReportSchema.parse(JSON.parse(JSON.stringify({ ...sample, ...verified.verifiedReport,
      meta: { ...sample.meta, provenanceCoverage: verified.coverage },
      appendix: { ...sample.appendix, verificationLog: verified.log, provenanceCoverage: verified.coverage } })));
    indexVerificationMarks(report);
    const mark = helper.status === "validated" ? "validated" : helper.status === "contradicted" ? "contradicted" : "unverified";
    expect(claimStatusMarkText(report.business.whatTheySell[0]!)).toBe(`[${mark}]`);
    const html = reportToPrintHtml(report);
    expect(html).toContain(claim);
    expect(html).toContain(`[${mark}]`);
    const audit = reportToAuditMarkdown(report);
    expect(audit).toContain(claim);
    expect(audit).toContain(verificationEntryOutcomeLabel(entries[0]!));
  });
});
