import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CatalystsRisksPanel } from "@/components/report/sections";
import { sectionRequestInstruction } from "@/pipeline/stageC/continuation";
import { checkCarriedJudgeSections, normalizeJudgeOutput, runVerifyPass, sectionOutputSchema, type PassDeps } from "@/pipeline/stageC/passes";
import type { ContextPayload } from "@/pipeline/stageC/payload";
import { SHARED_RULES_BLOCK } from "@/pipeline/stageC/prompts";
import { CatalystsRisksSchema, JUDGE_OUTPUT_KEYS, ReportSchema, fillNullableGaps, judgeOutputToJsonSchema, type SourcedClaim } from "@/report/schema";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { reportToMarkdown } from "@/report/export/markdown";
import { esc, reportToPrintBody } from "@/report/export/printHtml";
import { markdownProse } from "@/report/export/markdownEscape";
import { AI_BLOCK_CAPTION, SCORE_BANDS_READER_NOTE } from "@/report/presentation";
import { claimStatusMarkText, indexVerificationMarks } from "@/report/verificationMarks";
import { loadTask28Fixture } from "./helpers/task28Report";
// Verbatim public-data section from the rejected extra-high FIGR judge output:
// 2026-11-02 paid evidence, job_pass_artifacts rowid 4, failure.rejectedText.
// Retains all 2–6-claim arrays and the original omitted nullable asOf.
import paidSection from "./fixtures/p2-figr-xhigh-catalysts-risks.json";
import verifierRecords from "./fixtures/r5-figr-verifier-records.json";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";

const fact: SourcedClaim = { text: "The company disclosed a customer concentration.", label: "FACT", source: "filing.customer-concentration", asOf: "2026-06-30" };
const second: SourcedClaim = { ...fact, text: "The company disclosed a funding constraint.", source: "filing.funding" };
const judgment: SourcedClaim = { ...fact, text: "Our judgment: concentration increases execution risk.", label: "JUDGMENT" };
const catalyst = { title: "Results", expectedDate: null, direction: "mixed", significance: "high", reasoning: fact };
const risk = { title: "Concentration", severity: "high", probability: "unknown", source: fact.source, reasoning: fact };
const legacySection = { catalysts: [catalyst], risks: [risk] };
const multiSection = { catalysts: [{ ...catalyst, reasoning: [fact, second, judgment] }], risks: [{ ...risk, reasoning: [fact, second] }] };
// Standalone verifier input: no provider or database access, no synthesized evidence.
const payload = { provenanceRegistry: [], citationRegistry: [], filings: [] } as unknown as ContextPayload;

describe("catalyst and risk reasoning compatibility", () => {
  it("preserves legacy objects, exact presentation goldens and unindexed verification paths", async () => {
    const report = loadTask28Fixture();
    report.catalystsRisks = CatalystsRisksSchema.parse(legacySection);
    expect(report.catalystsRisks).toEqual(legacySection);
    expect(ReportSchema.parse(report).catalystsRisks).toEqual(legacySection);
    const verified = await runVerifyPass({} as PassDeps, payload, report.catalystsRisks);
    expect(verified.log.filter(entry => entry.evidenceKind === "factual-claim").map(entry => entry.path)).toEqual(["catalysts[0].reasoning", "risks[0].reasoning"]);
    report.appendix.verificationLog = verified.log.map(entry => ({ ...entry, path: `catalystsRisks.${entry.path}` }));
    indexVerificationMarks(report);
    expect(claimStatusMarkText(report.catalystsRisks.catalysts[0]!.reasoning as SourcedClaim)).toBe("[not confirmed]");
    const beforeExports = JSON.stringify(report.catalystsRisks);
    const outputs = {
      ui: renderToStaticMarkup(createElement(CatalystsRisksPanel, { catalystsRisks: report.catalystsRisks })),
      markdown: reportToMarkdown(report), print: reportToPrintBody(report), audit: reportToAuditMarkdown(report),
    };
    // D-208 changes only whole-report qualification/date safety in these
    // exports. The standalone legacy catalyst/risk UI digest is unchanged.
    for (const output of [outputs.markdown, outputs.print]) {
      expect(output).toContain("Provisional");
      expect(output).toContain("Qualification unknown");
      expect(output).toContain("Current valuation use withheld by the existing financial or model evidence requirements.");
    }
    expect(outputs.audit).toContain("Recorded pre-policy valuation diagnostics");
    expect(outputs.audit).toContain('"value": 48');
    expect(JSON.stringify(report.catalystsRisks)).toBe(beforeExports);
    // D-256: the scorecard states its band table in words instead of the band constant. Check the
    // new line, then restore the preceding one so the digests keep pinning every other byte.
    const bands = report.scores!.bandsVersion;
    expect(outputs.markdown).toContain(`_(${markdownProse(SCORE_BANDS_READER_NOTE)})_`);
    expect(outputs.print).toContain(`<em>(${esc(SCORE_BANDS_READER_NOTE)})</em>`);
    outputs.markdown = outputs.markdown.replace(`_(${markdownProse(SCORE_BANDS_READER_NOTE)})_`, `_(bands ${markdownProse(bands)})_`);
    outputs.print = outputs.print.replace(`<em>(${esc(SCORE_BANDS_READER_NOTE)})</em>`, `<em>(bands ${esc(bands)})</em>`);
    // D-282 review rounds 1 and 2: the legend gains one sentence about captioned AI blocks; check it, then remove it.
    const labelsSentence = ` A table or card captioned '${AI_BLOCK_CAPTION.replace(/\.$/, "")}' was written by the AI as a whole, including its titles, dates and ratings; a figure in it that code checked keeps its own mark.`;
    for (const key of ["markdown", "print"] as const) {
      const shown = key === "markdown" ? markdownProse(labelsSentence) : esc(labelsSentence);
      expect(outputs[key]).toContain(shown);
      outputs[key] = outputs[key].replace(shown, "");
      // Each AI-authored block of this AI-written fixture carries the caption (the fixture has no developments or
      // management actions): disagreements, both flag tables, two executive cards, moat, peers, catalysts, risks, macro.
      const caption = key === "markdown" ? `_${markdownProse(AI_BLOCK_CAPTION)}_\n\n` : `<p class="ai-block">${esc(AI_BLOCK_CAPTION)}</p>`;
      expect(outputs[key].split(caption).length - 1).toBe(10);
      outputs[key] = outputs[key].split(caption).join("");
      // The fixture's one quality and one technicals flag are model-written: each now ends with the mark.
      for (const flag of ["quality flags text", "technicals flags text"]) {
        const text = `SYNTHETIC demonstration text for ${flag}; it describes fictional inputs and is not a current market observation.`;
        const marked = key === "markdown" ? `${text} \\[not confirmed\\]` : `${esc(text)} [not confirmed]`;
        expect(outputs[key]).toContain(marked);
        outputs[key] = outputs[key].replace(marked, key === "markdown" ? text : esc(text));
      }
    }
    // D-309 review round 1: the fixture's synthetic `valuation.cet1Ratio` data gap is a valuation-input gap, so the
    // support line names it once on each export, in place; the digests below pin it.
    for (const key of ["markdown", "print"] as const) expect(outputs[key].split("; a valuation input is withheld or qualified").length - 1).toBe(1);
    expect(Object.fromEntries(Object.entries(outputs).map(([key, value]) => [key, createHash("sha256").update(value).digest("hex")]))).toMatchSnapshot();
  });

  it("accepts non-empty claim arrays and rejects empty or malformed reasoning", () => {
    expect(CatalystsRisksSchema.safeParse(multiSection).success).toBe(true);
    for (const key of ["catalysts", "risks"] as const) {
      for (const reasoning of [[], [fact, { ...second, source: "" }], null]) {
        expect(CatalystsRisksSchema.safeParse({ ...multiSection, [key]: [{ ...multiSection[key][0], reasoning }] }).success).toBe(false);
      }
    }
    expect(checkCarriedJudgeSections({ catalystsRisks: multiSection }).dropped).toEqual([]);
  });

  it("normalizes freshly generated objects to arrays without changing stored reports", () => {
    expect(normalizeJudgeOutput({ catalystsRisks: legacySection })).toMatchObject({ catalystsRisks: {
      catalysts: [{ reasoning: [fact] }], risks: [{ reasoning: [fact] }],
    } });
    expect(legacySection.catalysts[0]!.reasoning).toEqual(fact);
  });

  it("requests arrays in both full and sectioned judge schemas", () => {
    const full = judgeOutputToJsonSchema();
    for (const schema of [full, sectionOutputSchema(full, ["catalystsRisks"])]) {
      const section = (schema.properties as Record<string, { properties: Record<string, { items: { properties: Record<string, { type: string }> } }> }>).catalystsRisks;
      for (const key of ["catalysts", "risks"]) expect(section.properties[key]!.items.properties.reasoning!.type).toBe("array");
    }
  });

  it("guides concise separately sourced FACT and JUDGMENT claims", () => {
    const text = sectionRequestInstruction({}, ["catalystsRisks"], JUDGE_OUTPUT_KEYS);
    for (const prompt of [text, SHARED_RULES_BLOCK]) {
      expect(prompt).toMatch(/1[–-]4/);
      expect(prompt).toMatch(/each.*source/i);
      expect(prompt).toContain("JUDGMENT");
      expect(prompt).not.toMatch(/never an array|not an array|ONE claim object/);
    }
  });

  it("validates and contradicts sibling claims independently at their indexed paths", async () => {
    const record = verifierRecords.find(record => record.id === "computed.valuation.pettm-current") as NumericProvenanceRecord;
    const supported: SourcedClaim = { label: "FACT", text: "The trailing price-to-earnings multiple was 24.3x.", source: record.id, asOf: record.asOf };
    const contradicted = { ...supported, text: "The trailing price-to-earnings multiple was 48.6x." };
    const verified = await runVerifyPass({} as PassDeps, { ...payload, provenanceRegistry: [record] }, {
      catalystsRisks: CatalystsRisksSchema.parse({ catalysts: [{ ...catalyst, reasoning: [supported, contradicted] }], risks: [] }),
    });
    expect(verified.log.filter(entry => !entry.check).map(entry => [entry.path, entry.validationStatus])).toEqual([
      ["catalystsRisks.catalysts[0].reasoning[0]", "validated"],
      ["catalystsRisks.catalysts[0].reasoning[1]", "contradicted"],
    ]);
    const report = loadTask28Fixture();
    report.catalystsRisks = verified.verifiedReport.catalystsRisks;
    report.appendix.verificationLog = verified.log;
    indexVerificationMarks(report);
    expect((report.catalystsRisks.catalysts[0]!.reasoning as SourcedClaim[]).map(claimStatusMarkText)).toEqual(["[validated]", "[contradicted]"]);
  });

  it("renders multiple claims as one paragraph with separate citations and marks on every surface", async () => {
    const parsed = CatalystsRisksSchema.safeParse(multiSection);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const report = loadTask28Fixture();
    const verified = await runVerifyPass({} as PassDeps, payload, { catalystsRisks: parsed.data });
    report.catalystsRisks = verified.verifiedReport.catalystsRisks;
    report.appendix.verificationLog = verified.log;
    indexVerificationMarks(report);
    const ui = renderToStaticMarkup(createElement(CatalystsRisksPanel, { catalystsRisks: report.catalystsRisks }));
    expect(ui).toMatch(/<p[^>]*class="[^"]*claim-paragraph/);
    const audit = reportToAuditMarkdown(report);
    for (const rendered of [ui, reportToMarkdown(report), reportToPrintBody(report), audit]) {
      const output = rendered.replace(/\\([\[\]])/g, "$1");
      expect(output).toContain(fact.text);
      expect(output).toContain(second.text);
      expect(output).toContain(judgment.text);
      expect(output).toContain(fact.source);
      expect(output).toContain(second.source);
      // D-282: reader surfaces print the plain mark; the audit export keeps the log's own status notes.
      expect(output).toContain(rendered === audit ? "[unverified]" : "[not confirmed]");
    }
  });

  it("replays the retained paid section and produces a separate verification mark for every factual claim", async () => {
    expect(paidSection.catalysts).toHaveLength(7);
    expect(paidSection.risks).toHaveLength(12);
    expect(checkCarriedJudgeSections({ catalystsRisks: paidSection }).dropped).toEqual([]);
    const parsed = CatalystsRisksSchema.safeParse(fillNullableGaps(CatalystsRisksSchema, paidSection));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const verified = await runVerifyPass({} as PassDeps, payload, { catalystsRisks: parsed.data });
    const report = loadTask28Fixture();
    report.catalystsRisks = verified.verifiedReport.catalystsRisks;
    report.appendix.verificationLog = verified.log;
    indexVerificationMarks(report);
    const expectedPaths: string[] = [];
    for (const key of ["catalysts", "risks"] as const) {
      report.catalystsRisks[key].forEach((item, i) => {
        expect(Array.isArray(item.reasoning)).toBe(true);
        (item.reasoning as SourcedClaim[]).forEach((claim, j) => {
          const path = `catalystsRisks.${key}[${i}].reasoning[${j}]`;
          expectedPaths.push(path);
          expect(verified.log.find(entry => entry.path === path && entry.claim === claim.text)).toBeDefined();
          expect(claimStatusMarkText(claim)).toBe(claim.label === "JUDGMENT" ? null : "[not confirmed]");
        });
      });
    }
    // D-285: a statement citing the whole news feed, with no single payload article for its date, is removed and logged as removed.
    const removed = verified.log.filter(entry => entry.path?.startsWith("catalystsRisks.") && entry.outcome === "removed");
    for (const entry of removed) expect(entry.note).toContain("cites the whole news feed");
    expect(verified.log.filter(entry => entry.path?.startsWith("catalystsRisks.") && !entry.check && entry.outcome !== "removed").map(entry => entry.path)).toEqual(expectedPaths);
  });
});
