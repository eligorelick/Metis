import {
  ENTITY_WITHHELD_STATEMENT_PREFIX,
  getEntityRegistry,
  validateEntityText,
  type EntityIssue,
  type EntityRegistry,
} from "@/pipeline/stageC/entityValidation";
import { buildDataCompleteness } from "@/report/completeness";
import { claimCoverageWithout, factualValidationWithout, isCountedClaimEntry } from "@/report/claimMatching";
import { applyReportAssessmentStatus } from "@/report/assessment";
import { applyGradeOverrideContract } from "@/pipeline/stageC/gradeContract";
import { attributeJudgeProtocolDisclosures } from "@/report/execution";
import { withPrincipalSummarySafety } from "@/report/principalAggregationSafety";
import { withHistoricalEnterpriseValueSafety } from "@/report/enterpriseValueSafety";
import { withLegacyEdgarDerivedLines } from "@/report/legacyEdgarDerivedLines";
import { withLegacyPayloadRecordSafety } from "@/report/legacyPayloadRecordSafety";
import {
  citationAsOf,
  citationSourceId,
  type CitationCarrier,
} from "@/pipeline/stageC/citations";
import {
  ReportSchema,
  withLenientLegacyRead,
  type ProvenanceCoverage,
  type Report,
  type VerificationLogEntry,
} from "@/report/schema";

export interface LegacyEntitySafetyResult {
  report: Report;
  withheldCount: number;
  issues: EntityIssue[];
}

export interface SafeStoredReport extends LegacyEntitySafetyResult {
  readMode: "strict" | "legacy";
}

/** Validate a report with exactly the mode selected by its original stored read. */
export function validateStoredReportInReadMode(
  value: unknown,
  readMode: SafeStoredReport["readMode"],
): Report | null {
  const parsed = readMode === "strict"
    ? ReportSchema.safeParse(value)
    : withLenientLegacyRead(() => ReportSchema.safeParse(value));
  return parsed.success ? parsed.data : null;
}

/**
 * Parse one immutable stored-report view, sanitize it against the issuer's
 * canonical entity registry, then revalidate it under the original read mode.
 */
export function parseStoredReportWithSafety(
  reportJson: string | null,
): SafeStoredReport | null {
  if (reportJson === null) return null;
  try {
    const raw: unknown = JSON.parse(reportJson);
    const strict = ReportSchema.safeParse(raw);
    const readMode: SafeStoredReport["readMode"] = strict.success ? "strict" : "legacy";
    const parsed = strict.success
      ? strict.data
      : validateStoredReportInReadMode(raw, "legacy");
    if (parsed === null) return null;

    const safety = sanitizeLegacyEntityConflicts(
      parsed,
      getEntityRegistry(parsed.meta.symbol),
    );
    const assessed = applyReportAssessmentStatus(applyGradeOverrideContract(safety.report, safety.report.appendix.verificationLog ?? []));
    const view = withLegacyEdgarDerivedLines(withLegacyPayloadRecordSafety(withHistoricalEnterpriseValueSafety(withPrincipalSummarySafety({
      ...assessed,
      appendix: {
        ...assessed.appendix,
        missingData: attributeJudgeProtocolDisclosures(assessed.appendix.missingData, assessed.meta),
      },
    }))));
    const revalidated = validateStoredReportInReadMode(view, readMode);
    if (revalidated === null) return null;
    return {
      report: revalidated,
      readMode,
      withheldCount: safety.withheldCount,
      issues: safety.issues,
    };
  } catch {
    return null;
  }
}

/**
 * Build an in-memory, read-only-safe view of a legacy report. Unsafe
 * statements are withheld whole and disclosed; no entity name is guessed or
 * silently replaced, and the persisted report/database is never mutated.
 */
export function sanitizeLegacyEntityConflicts(
  report: Report,
  registry: EntityRegistry | null = getEntityRegistry(report.meta.symbol),
): LegacyEntitySafetyResult {
  const cloned = structuredClone(report);
  if (registry === null) {
    return { report: cloned, withheldCount: 0, issues: [] };
  }
  if (cloned.meta.symbol.toUpperCase() !== registry.symbol.toUpperCase()) {
    return { report: cloned, withheldCount: 0, issues: [] };
  }

  const issues: EntityIssue[] = [];
  // Distinct withheld STATEMENTS. The verification log carries a copy of every
  // checked sentence, so counting each withheld string once per occurrence
  // reported "2 legacy statements" for one (audit 2026-09-06, F194).
  const withheldTexts = new Set<string>();
  let invalidCitationCount = 0;
  // Counted claim entries withheld below, as recorded before the rewrite.
  const withdrawn: VerificationLogEntry[] = [];
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") {
      const found = validateEntityText(value, registry, null).issues.filter(
        (issue) => issue.code !== "primary-source-required",
      );
      if (found.length === 0) return value;
      issues.push(...found);
      withheldTexts.add(value);
      const canonical = [...new Set(found.map((issue) => issue.canonicalName))].join(", ");
      const codes = [...new Set(found.map((issue) => issue.code))].join(", ");
      return `${ENTITY_WITHHELD_STATEMENT_PREFIX}${codes} conflict. Canonical primary-source reference: ${canonical}. See the missing-data manifest.`;
    }
    if (Array.isArray(value)) return value.map(walk);
    if (value === null || typeof value !== "object") return value;
    // The judge's own entity-conflict record is the RESOLUTION of a conflict,
    // not a claim: its bull/bear views restate the disputed association by
    // design (prompts.ts: "every supplied deterministic entity conflict must
    // appear as kind=entity"). Withholding it (before the 2026-09-06 audit,
    // F184) blocked every clean report whose judge had done exactly that.
    const entry = value as { kind?: unknown; judgeResolution?: unknown; claim?: unknown; outcome?: unknown };
    if (entry.kind === "entity" && typeof entry.judgeResolution === "string") {
      return structuredClone(value);
    }
    const carrier = value as CitationCarrier;
    const hasCitationShape = typeof carrier.source === "string" && "asOf" in value;
    const normalizedSource = hasCitationShape ? citationSourceId(carrier) : null;
    const normalizedAsOf = hasCitationShape ? citationAsOf(carrier) : null;
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) output[key] = walk(nested);
    if (typeof entry.claim === "string" && output.claim !== entry.claim &&
      (entry.outcome === "verified" || entry.outcome === "unverified" || entry.outcome === "removed")) {
      // A sanitized log claim can now equal the section's same placeholder.
      // Its prior support belongs to the withheld original, never this text.
      const original = value as VerificationLogEntry;
      if (isCountedClaimEntry(original, "factual-claim") || isCountedClaimEntry(original, "judgment")) withdrawn.push(original);
      output.outcome = "removed";
      output.traceKind = "untraced";
      output.validationStatus = "contradicted";
      output.claimSupportStatus = "contradicted";
      output.note = "Legacy entity/trial conflict: claim withheld and its original verification support invalidated.";
      delete output.reason;
      delete output.numericSupportStatus;
      delete output.executiveEvidenceKind;
    }
    if (hasCitationShape) {
      if (normalizedSource !== null) {
        const sourceNeedsNormalization =
          normalizedSource !== carrier.source ||
          (typeof carrier.sourceId === "string" && carrier.sourceId !== normalizedSource) ||
          (carrier.asOf === null && normalizedAsOf !== null);
        if (sourceNeedsNormalization) {
          output.sourceId = normalizedSource;
          output.source = normalizedSource;
          output.asOf = normalizedAsOf ?? output.asOf;
        }
      } else {
        invalidCitationCount += 1;
        delete output.sourceId;
        output.source = "unsupported:legacy-citation";
        if ("verified" in output) {
          output.verified = false;
          output.verificationNote = `${typeof output.verificationNote === "string" ? `${output.verificationNote}; ` : ""}[unverified] ambiguous legacy citation`;
        }
      }
    }
    return output;
  };

  const safe = walk(cloned) as Report;
  const withheldCount = withheldTexts.size;
  // Audit 2026-10-22 F-21 (review): the header counts the claims the report
  // marks. A withheld claim prints as an unmarked placeholder, so it leaves
  // the counts at the status it was recorded with.
  if (withdrawn.length > 0) {
    const factual = withdrawn.filter((entry) => entry.evidenceKind === "factual-claim");
    const judgments = withdrawn.filter((entry) => entry.evidenceKind === "judgment");
    const without = (coverage: ProvenanceCoverage | undefined): ProvenanceCoverage | undefined => {
      if (coverage === undefined) return undefined;
      const next = claimCoverageWithout(coverage, factual, judgments);
      return next.factualValidation === undefined ? next
        : { ...next, factualValidation: factualValidationWithout(next.factualValidation, factual, (entry) => entry.validationStatus) };
    };
    if (safe.meta.provenanceCoverage) safe.meta.provenanceCoverage = without(safe.meta.provenanceCoverage);
    if (safe.appendix.provenanceCoverage) safe.appendix.provenanceCoverage = without(safe.appendix.provenanceCoverage);
  }
  if (withheldCount > 0 || invalidCitationCount > 0) {
    safe.appendix.missingData = [
      ...(withheldCount > 0 ? [{
        field: "legacy.entityValidation",
        reason: `${withheldCount} legacy statement(s) were withheld because canonical entity or drug–trial validation failed; stored data was not changed`,
        severity: "critical" as const,
        attemptedSources: ["canonical entity registry"],
      }] : []),
      ...(invalidCitationCount > 0 ? [{
        field: "legacy.citationValidation",
        reason: `${invalidCitationCount} ambiguous legacy citation(s) were marked unsupported; stored data was not changed`,
        severity: "warn" as const,
      }] : []),
      ...safe.appendix.missingData.filter((gap) =>
        gap.field !== "legacy.entityValidation" && gap.field !== "legacy.citationValidation"
      ),
    ];
    safe.meta.dataCompleteness = buildDataCompleteness(safe.appendix.missingData);
    if (withheldCount > 0 && !safe.disagreements.some((item) => item.kind === "entity")) {
      safe.disagreements.push({
        topic: "Legacy entity and trial associations",
        bullView: "The persisted analyst cases contained conflicting entity names and relationships.",
        bearView: "The persisted analyst cases contained conflicting entity names and relationships.",
        kind: "entity",
        judgeResolution:
          "The canonical primary-source entity registry was applied. Unsafe legacy statements are withheld, not rewritten.",
      });
    }
  }
  const deduped = new Map<string, EntityIssue>();
  for (const issue of issues) {
    deduped.set(`${issue.code}\u0000${issue.recordId}\u0000${issue.observed}`, issue);
  }
  return { report: safe, withheldCount, issues: [...deduped.values()] };
}
