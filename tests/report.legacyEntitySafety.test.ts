import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { isEntityWithheldStatement, type EntityRegistry } from "@/pipeline/stageC/entityValidation";
import {
  parseStoredReportWithSafety,
  sanitizeLegacyEntityConflicts,
  validateStoredReportInReadMode,
} from "@/report/legacyEntitySafety";
import { ReportSchema, type Report } from "@/report/schema";
import { GRADE_SURFACES } from "@/report/surfaceManifest";
import { gradeForDisplay } from "@/report/assessment";
import { extractGradeStrip } from "@/report/history";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintHtml } from "@/report/export/printHtml";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GradeReasoning } from "@/components/report/primitives";

const ENTITY_CONFLICT = "TRIUMPH evaluates Foundayo";

function fixtureReport(symbol: string): Report {
  const parsed = ReportSchema.parse(
    JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", "report", "DEMO-sample.json"), "utf8")),
  );
  parsed.meta.symbol = symbol;
  return parsed;
}

const SYNTHETIC_ENTITY_REGISTRY: EntityRegistry = {
  symbol: "DEMO",
  records: [
    {
      id: "drug.demo",
      kind: "drug",
      canonicalName: "DemoMed",
      aliases: [
        { value: "DemoMed", status: "supported" },
        { value: "DemoMedd", status: "unsupported" },
      ],
      primarySourceIds: ["demo:primary"],
    },
    {
      id: "drug.control",
      kind: "drug",
      canonicalName: "ControlMed",
      aliases: [{ value: "ControlMed", status: "supported" }],
      primarySourceIds: ["demo:primary"],
    },
    {
      id: "trial.demo",
      kind: "trial-program",
      canonicalName: "DEMO-TRIAL",
      aliases: [{ value: "DEMO-TRIAL", status: "supported" }],
      relatedEntityId: "drug.demo",
      primarySourceIds: ["demo:primary"],
    },
  ],
};

describe("read-only legacy export safety", () => {
  it("corrects stored ChatGPT judge attribution on read while preserving the original JSON", () => {
    const report = fixtureReport("DEMO");
    report.meta.model = "chatgpt/gpt-6-astra";
    report.meta.execution = ["bull", "bear", "synthesize"].map((step) => ({
      step, requestedModel: "chatgpt/gpt-6-astra", effectiveModel: "chatgpt/gpt-6-astra",
      requestedEffort: null, effectiveEffort: null, fallbackUsed: false, adjustments: [],
    }));
    const fields = ["llm.judge.case-order", "llm.judge.model-family"];
    report.appendix.missingData.push(...fields.map((field) => ({
      field, reason: "Recorded judge protocol", severity: "info" as const, attemptedSources: ["anthropic"],
    })));
    const stored = JSON.stringify(report);
    const result = parseStoredReportWithSafety(stored);
    expect(result).not.toBeNull();
    for (const field of fields) {
      expect(result?.report.appendix.missingData.find((gap) => gap.field === field)?.attemptedSources).toEqual(["chatgpt"]);
      expect(JSON.parse(stored).appendix.missingData.find((gap: { field: string }) => gap.field === field).attemptedSources).toEqual(["anthropic"]);
    }
    expect(JSON.stringify(report)).toBe(stored);
    expect(parseStoredReportWithSafety(stored)?.report).toEqual(result?.report);
  });

  it("withholds whole unsupported statements and records the conflict", () => {
    const report = ReportSchema.parse(
      JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", "report", "DEMO-sample.json"), "utf8")),
    );
    report.meta.symbol = "DEMO";
    report.verdict.synthesis = "DemoMedd succeeds and DEMO-TRIAL evaluates ControlMed.";
    const claim = report.verdict.gradeStrip.fundamentals.reasoning[0];
    const originalSource = claim.source;
    claim.source = `[${claim.source} · ${claim.asOf}]`;

    const result = sanitizeLegacyEntityConflicts(report, SYNTHETIC_ENTITY_REGISTRY);
    const serialized = JSON.stringify(result.report);

    expect(result.withheldCount).toBeGreaterThan(0);
    expect(serialized).not.toContain("DemoMedd");
    expect(serialized).not.toContain("DEMO-TRIAL evaluates ControlMed");
    expect(result.report.appendix.missingData).toContainEqual(
      expect.objectContaining({ field: "legacy.entityValidation", severity: "critical" }),
    );
    expect(result.report.verdict.gradeStrip.fundamentals.reasoning[0].sourceId).toBe(originalSource);
    expect(result.report.verdict.gradeStrip.fundamentals.reasoning[0].source).toBe(originalSource);
    expect(ReportSchema.safeParse(result.report).success).toBe(true);
  });

  it("leaves the judge's own entity-conflict record alone (audit 2026-09-06, F184)", () => {
    // The judge is told to restate every deterministic entity conflict as a
    // kind=entity disagreement; its bull/bear views therefore contain the
    // disputed association by design. Withholding them blocked every clean
    // report on every read.
    const report = fixtureReport("DEMO");
    const resolution = {
      topic: "DEMO-TRIAL attribution",
      bullView: "DEMO-TRIAL evaluates ControlMed.",
      bearView: "DEMO-TRIAL is the DemoMed programme.",
      kind: "entity" as const,
      judgeResolution: "DEMO-TRIAL is registered to DemoMed; ControlMed is a separate entity.",
    };
    report.disagreements = [resolution];

    const result = sanitizeLegacyEntityConflicts(report, SYNTHETIC_ENTITY_REGISTRY);

    expect(result.withheldCount).toBe(0);
    expect(result.issues).toEqual([]);
    expect(result.report.disagreements[0]).toEqual(resolution);
    expect(result.report.appendix.missingData.some((gap) => gap.field === "legacy.entityValidation")).toBe(false);
  });

  it("counts a withheld statement once even when the verification log carries a copy (audit 2026-09-06, F194)", () => {
    const report = fixtureReport("DEMO");
    const text = "DEMO-TRIAL evaluates ControlMed.";
    report.verdict.synthesis = text;
    report.appendix.verificationLog = [{ claim: text, outcome: "verified" }];

    const result = sanitizeLegacyEntityConflicts(report, SYNTHETIC_ENTITY_REGISTRY);

    expect(result.withheldCount).toBe(1);
    expect(result.report.verdict.synthesis).toContain("Legacy statement withheld");
    expect(result.report.appendix.verificationLog?.[0].claim).toContain("Legacy statement withheld");
    const entry = result.report.appendix.missingData.find((gap) => gap.field === "legacy.entityValidation");
    expect(entry?.reason).toContain("1 legacy statement(s)");
  });

  it("invalidates log support when an entity-conflict claim is withheld instead of admitting the shared placeholder", () => {
    const report = fixtureReport("LLY");
    const text = ENTITY_CONFLICT;
    const source = "filing:trial-primary";
    Object.assign(report.scores!.aspects.fundamentals, { score: 70, band: "B", dataCompleteness: 1 });
    for (const block of [report.fundamentals.graded, report.verdict.gradeStrip.fundamentals]) {
      block.grade = "C";
      delete block.gradeContract;
      delete block.assessmentStatus;
    }
    report.fundamentals.graded.reasoning = [{ text, label: "JUDGMENT", source, sourceId: source, asOf: "2026-06-30" }];
    report.fundamentals.graded.overrideRationale = { reason: "The trial attribution warrants a lower grade.", evidenceSources: [source] };
    report.appendix.verificationLog = [{
      path: "fundamentals.graded.reasoning[0]", claim: text, source, outcome: "unverified",
      evidenceKind: "judgment", reason: "supported", traceKind: "source-cited",
      validationStatus: "cited", claimSupportStatus: "cited",
    }];
    const stored = JSON.stringify(report);

    const result = parseStoredReportWithSafety(stored)!;
    expect(result.withheldCount).toBe(1);
    const safe = result.report;
    expect(safe.fundamentals.graded.reasoning[0].text).toContain("Legacy statement withheld");
    expect(safe.appendix.verificationLog?.[0]).toMatchObject({
      outcome: "removed", traceKind: "untraced", validationStatus: "contradicted", claimSupportStatus: "contradicted",
    });
    expect(safe.appendix.verificationLog?.[0].reason).not.toBe("supported");
    expect(safe.fundamentals.graded.gradeContract).toMatchObject({ status: "rejected", reason: "unadmitted-override-evidence", proposedGrade: "C" });
    expect(gradeForDisplay(safe.fundamentals.graded)).toBeNull();
    expect(gradeForDisplay(safe.verdict.gradeStrip.fundamentals)).toBeNull();
    expect(extractGradeStrip(safe).find(cell => cell.key === "fundamentals")?.grade).toBeNull();
    expect(renderToStaticMarkup(createElement(GradeReasoning, { title: "Fundamentals", block: safe.fundamentals.graded }))).toContain('aria-label="not assessed"');
    for (const output of [reportToMarkdown(safe), reportToPrintHtml(safe)]) {
      expect(output).toContain("unadmitted-override-evidence");
      expect(output).not.toContain("Fundamentals — Grade C");
      expect(output).not.toContain('>C</span> <strong>Fundamentals');
    }
    expect(JSON.stringify(report)).toBe(stored);
    const reread = parseStoredReportWithSafety(JSON.stringify(safe));
    expect(reread?.report).toEqual(safe);
    expect(reread?.withheldCount).toBe(0);
  });

  it("withholds a rationale-only entity conflict while preserving the clean cited claim and log", () => {
    const report = fixtureReport("LLY");
    const text = "The supplied evidence warrants a cautious interpretation.";
    const source = "filing:trial-primary";
    Object.assign(report.scores!.aspects.fundamentals, { score: 70, band: "B", dataCompleteness: 1 });
    for (const block of [report.fundamentals.graded, report.verdict.gradeStrip.fundamentals]) {
      block.grade = "C";
      delete block.gradeContract;
      delete block.assessmentStatus;
    }
    report.fundamentals.graded.reasoning = [{ text, label: "JUDGMENT", source, sourceId: source, asOf: "2026-06-30" }];
    report.fundamentals.graded.overrideRationale = { reason: ENTITY_CONFLICT, evidenceSources: [source] };
    report.appendix.verificationLog = [{
      path: "fundamentals.graded.reasoning[0]", claim: text, source, outcome: "unverified",
      evidenceKind: "judgment", reason: "supported", traceKind: "source-cited",
      validationStatus: "cited", claimSupportStatus: "cited",
    }];
    const stored = JSON.stringify(report);
    const result = parseStoredReportWithSafety(stored)!;
    const safe = result.report;

    expect(result.withheldCount).toBe(1);
    expect(isEntityWithheldStatement(safe.fundamentals.graded.overrideRationale!.reason)).toBe(true);
    expect(safe.fundamentals.graded.reasoning).toEqual(report.fundamentals.graded.reasoning);
    expect(safe.appendix.verificationLog).toEqual(report.appendix.verificationLog);
    expect(safe.fundamentals.graded.gradeContract).toMatchObject({ status: "rejected", reason: "unadmitted-override-evidence" });
    expect(gradeForDisplay(safe.fundamentals.graded)).toBeNull();
    expect(gradeForDisplay(safe.verdict.gradeStrip.fundamentals)).toBeNull();
    expect(extractGradeStrip(safe).find(cell => cell.key === "fundamentals")?.grade).toBeNull();
    for (const target of [report, safe]) {
      for (const output of [reportToMarkdown(target), reportToPrintHtml(target)]) {
        expect(output).toContain("unadmitted-override-evidence");
        expect(output).not.toContain("Fundamentals - Grade C");
        expect(output).not.toContain('>C</span> <strong>Fundamentals');
      }
    }
    expect(renderToStaticMarkup(createElement(GradeReasoning, { title: "Fundamentals", block: safe.fundamentals.graded }))).toContain('aria-label="not assessed"');
    expect(JSON.stringify(report)).toBe(stored);
    const reread = parseStoredReportWithSafety(JSON.stringify(safe));
    expect(reread?.report).toEqual(safe);
    expect(reread?.withheldCount).toBe(0);
    // Already-sanitized records may carry old accepted metadata and unchanged
    // cited logs. The declared withholding marker must still defeat admission.
    const stale = structuredClone(safe);
    for (const block of [stale.fundamentals.graded, stale.verdict.gradeStrip.fundamentals]) {
      block.gradeContract!.status = "accepted";
      block.gradeContract!.reason = "admitted-one-step-override";
      delete block.assessmentStatus;
    }
    expect(parseStoredReportWithSafety(JSON.stringify(stale))?.report).toEqual(safe);
  });

  it("does not withhold prose that merely uses an acronym alias as an ordinary verb", () => {
    // The real LLY registry carries trial acronyms that are also English verbs
    // (ACHIEVE, ATTAIN, TRIUMPH, TRANSCEND). Matching them case-insensitively
    // made ordinary analyst prose look like an entity conflict and replaced the
    // whole sentence with a "Legacy statement withheld" placeholder.
    const report = fixtureReport("DEMO");
    const prose =
      "Management expects to achieve mid-teens margins and attain its cost targets.";
    report.verdict.synthesis = prose;

    const result = sanitizeLegacyEntityConflicts(report, SYNTHETIC_ENTITY_REGISTRY);

    expect(result.report.verdict.synthesis).toBe(prose);
    expect(JSON.stringify(result.report)).not.toContain("Legacy statement withheld");
  });

  it("legacy entity safety preserves rendered citation correction and marks ambiguity unsupported", () => {
    const report = fixtureReport("DEMO");
    const rendered = report.verdict.gradeStrip.fundamentals.reasoning[0];
    const originalSource = rendered.source;
    delete rendered.sourceId;
    rendered.source = `[${originalSource} · ${rendered.asOf}]`;
    const ambiguous = report.verdict.gradeStrip.valuation.reasoning[0];
    delete ambiguous.sourceId;
    ambiguous.source = "[ambiguous";

    const result = sanitizeLegacyEntityConflicts(report, SYNTHETIC_ENTITY_REGISTRY);

    expect(result.report.verdict.gradeStrip.fundamentals.reasoning[0]).toMatchObject({
      source: originalSource,
      sourceId: originalSource,
    });
    expect(result.report.verdict.gradeStrip.valuation.reasoning[0].source).toBe(
      "unsupported:legacy-citation",
    );
    expect(result.report.appendix.missingData).toContainEqual(
      expect.objectContaining({ field: "legacy.citationValidation", severity: "warn" }),
    );
    expect(ReportSchema.safeParse(result.report).success).toBe(true);
  });

  it("parseStoredReportWithSafety reports strict mode and withholds legacy entity conflicts", () => {
    const report = fixtureReport("LLY");
    report.verdict.synthesis = ENTITY_CONFLICT;
    const insertedJson = JSON.stringify(ReportSchema.parse(report));

    const result = parseStoredReportWithSafety(insertedJson);

    expect(result).not.toBeNull();
    expect(result?.readMode).toBe("strict");
    expect(result?.withheldCount).toBeGreaterThan(0);
    expect(result?.issues).not.toHaveLength(0);
    expect(JSON.stringify(result?.report)).not.toContain(ENTITY_CONFLICT);
    expect(result?.report.appendix.missingData).toContainEqual(
      expect.objectContaining({ field: "legacy.entityValidation", severity: "critical" }),
    );
    expect(insertedJson).toContain(ENTITY_CONFLICT);

    const reread = parseStoredReportWithSafety(JSON.stringify(result?.report));
    expect(reread?.report).toEqual(result?.report);
    expect(reread?.withheldCount).toBe(0);
    expect(reread?.issues).toEqual([]);
  });

  it("legacy entity safety preserves lenient read mode and keeps the legacy report readable", () => {
    const report = fixtureReport("LLY");
    report.fundamentals.commentary[0]!.asOf = "2026-06";
    report.verdict.synthesis = ENTITY_CONFLICT;
    const legacyJson = JSON.stringify(report);
    expect(ReportSchema.safeParse(JSON.parse(legacyJson)).success).toBe(false);

    const result = parseStoredReportWithSafety(legacyJson);

    expect(result).not.toBeNull();
    expect(result?.readMode).toBe("legacy");
    expect(result?.report.fundamentals.commentary[0]?.asOf).toBe("2026-06");
    expect(JSON.stringify(result?.report)).not.toContain(ENTITY_CONFLICT);
    expect(result?.report.appendix.missingData).toContainEqual(
      expect.objectContaining({ field: "legacy.entityValidation", severity: "critical" }),
    );
    expect(validateStoredReportInReadMode(result?.report, result!.readMode)).not.toBeNull();
    expect(validateStoredReportInReadMode(result?.report, "strict")).toBeNull();
  });

  it("keeps clean entity content and original bytes intact while adding idempotent grade validation", () => {
    for (const symbol of ["LLY", "AAPL"]) {
      const report = fixtureReport(symbol);
      const insertedJson = JSON.stringify(ReportSchema.parse(report));

      const first = parseStoredReportWithSafety(insertedJson);
      const second = parseStoredReportWithSafety(JSON.stringify(first?.report));

      expect(first?.readMode).toBe("strict");
      expect(first?.withheldCount).toBe(0);
      expect(first?.issues).toEqual([]);
      const original = ReportSchema.parse(JSON.parse(insertedJson));
      const content = structuredClone(first!.report);
      for (const { key, sectionKey } of GRADE_SURFACES) {
        const section = sectionKey === "competitive" ? content.competitive.moatGraded : content[sectionKey].graded;
        for (const block of [content.verdict.gradeStrip[key], section]) {
          if (!block) continue;
          expect(block.gradeContract).toBeDefined();
          delete block.gradeContract;
          delete block.assessmentStatus;
        }
      }
      expect(content).toEqual(original);
      expect(JSON.stringify(ReportSchema.parse(report))).toBe(insertedJson);
      expect(second?.report).toEqual(first?.report);
      expect(second?.withheldCount).toBe(0);
    }
  });

  it("legacy entity safety keeps null, malformed, and schema-invalid rows unreadable", () => {
    expect(parseStoredReportWithSafety(null)).toBeNull();
    expect(parseStoredReportWithSafety("{ not json")).toBeNull();
    expect(parseStoredReportWithSafety(JSON.stringify({ meta: { symbol: "LLY" } }))).toBeNull();
  });
});
